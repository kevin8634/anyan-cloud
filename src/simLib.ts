// 命令行副本模拟的公共部分：任意职业 × 任意副本（小怪 + Boss），玩家脚本会躲红圈/毒池、用打断技能打断读条、远程职业保持距离
// simSwamp.ts（战士打腐沼神殿）、simMage.ts（法师打暗岩矿洞 + 腐沼神殿）都用它
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, unitsInRadius, Pos, Faction } from './core/Combat';
import { EnemyBrain, EnemyConfig, DEFAULT_ENEMY } from './core/EnemyBrain';
import { BossBrain, BossDef } from './core/BossBrain';
import { DungeonRun, DungeonDef } from './core/Dungeon';
import { Loadout, ItemDef } from './core/Loadout';
import { TalentTree } from './core/TalentTree';
import { SlotId, SLOT_IDS, ModifierDef } from './core/types';
import { ClassDef } from './data/classes';
import { DodgeRoll } from './core/Dodge';
// v0.5 A（账号 B）的噩梦每周词缀在主线 v0.6.6 退役（A 的暗岩誓约取代，core/Scaling.ts 已删除）；
// 词缀选项保留成空操作，旧的调用方不用改
type AffixId = 'blazing' | 'enrage' | 'fortified' | 'bursting' | 'reinforce' | 'timed';
const affixDamageMul = (_a: AffixId | null | undefined, _hp: number, _t: number) => 1;
const BURST_RADIUS = 4, BURST_PCT = 0.08, BLAZE_PCT = 0.25, BLAZE_DURATION = 4;

export interface SimMob { name: string; enc: string; pos: Pos; hp: number; config?: Partial<EnemyConfig> }
export interface SimOptions {
  cls: ClassDef;
  level: number;
  talents: string[];                 // 天赋 id，按顺序加点（重复 = 多级）
  items?: ItemDef[];
  bonusHp?: number;
  armor?: number;
  dungeon: DungeonDef;
  boss: BossDef;
  bossHp: number;
  bossPos: Pos;
  mobs: SimMob[];
  summons?: Record<string, { hp: number; config: Partial<EnemyConfig> }>;
  seed?: number;
  lazy?: boolean;                    // 不躲不打断（对比用）
  /** 躲避方式：walk = 只会跑出红圈（默认，旧行为）；roll = 跑 + 闪避翻滚（红圈快落下/读条快完成时翻滚，无敌帧吃掉伤害） */
  dodge?: 'walk' | 'roll';
  /** 阵亡后原地复活继续打的次数上限（统计阵亡次数用；默认 0 = 阵亡即失败） */
  revives?: number;
  /** 机器人反应时间（秒）：红圈/毒池出现后多久才“看到”（默认 0.35，接近真人；0 = 瞬间反应） */
  reaction?: number;
  quiet?: boolean;
  /** v0.5：装备的二级属性（强度 / 暴击率% / 暴击伤害% / 急速%），和试玩版同口径 */
  gear?: { power?: number; crit?: number; critDmg?: number; haste?: number };
  /** v0.5：噩梦每周词缀（运行时效果：火焰 / 暴怒 / 爆裂 / 时限；坚韧和援军由调用方改数值和 Boss 配置） */
  affix?: AffixId | null;
}

export interface SimResult { bursts?: number; completed: boolean; playerHp: number; playerMaxHp: number; interrupts: number; bossCasts: number; seconds: number; zonesDodged: number; bossHp: number; deaths: number; rolls: number; rollSaves: number; minHpPct: number; circleHits: number }

export function runDungeonSim(o: SimOptions): SimResult {
  let t = 0;
  const log = (s: string) => { if (!o.quiet) console.log(`[${t.toFixed(1).padStart(5)}s] ${s}`); };
  let seed = o.seed ?? 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  class Unit implements CombatUnit {
    status = new StatusSet();
    hp: number; armor = 0; ccImmune = false;
    interruptHook?: () => boolean;
    provokeHook?: () => void;
    constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
    /** 和试玩版一样：被玩家打到就进入战斗（远程在仇恨范围外也会拉到） */
    onDamaged(_a: number, _e: unknown, src: CombatUnit | null) { if (src === player && this.faction === 'enemy') this.provokeHook?.(); }
    get alive() { return this.hp > 0; }
    getPos() { return this.pos; }
    onDeath() {
      log(`  ☠ ${this.uid} 死亡`);
      if (this.faction !== 'enemy') return;
      // 爆裂词缀：非 Boss 怪物死亡时爆炸
      if (o.affix === 'bursting' && this !== boss && player.alive && dist(this.pos, player.pos) <= BURST_RADIUS) { const v = fx.dealDamage(player, player.maxHp * BURST_PCT, 'fire', null); bursts++; log(`  💥 爆裂 ${v}`); }
      run.onUnitDeath(this.uid);
    }
    onInterrupt() { return this.interruptHook?.() ?? false; }
  }

  const run = new DungeonRun(o.dungeon, {
    onEncounterCleared: e => log(`✔ 遭遇战「${e.name}」完成`),
    onCompleted: (d, s) => log(`🏆 通关「${d.name}」，用时 ${s.toFixed(1)} 秒`),
  });

  // ---- 玩家：天赋 + 等级 ----
  const tree = new TalentTree(o.cls.tree, o.level - 1);
  o.talents.forEach(id => { if (!tree.add(id)) log(`  (天赋 ${id} 加点失败：${tree.whyCannotAdd(id)})`); });
  const ts0 = tree.charStats(), gs = o.gear ?? {};
  const ts = { ...ts0, power: ts0.power + (gs.power ?? 0), crit: ts0.crit + (gs.crit ?? 0), critDmg: ts0.critDmg + (gs.critDmg ?? 0), haste: ts0.haste + (gs.haste ?? 0) };
  let bursts = 0;
  const maxHp = o.cls.baseHp + o.cls.hpPerLevel * (o.level - 1) + ts.hp + (o.bonusHp ?? 0);
  const player = new Unit('玩家', 'player', maxHp, { x: 0, z: 0 });
  player.armor = ts.armor + (o.armor ?? 0);
  // 天赋的二级属性（与试玩版同口径）：暴击率 / 暴击伤害 / 强度（每点 +0.4% 伤害）/ 急速（冷却缩短）
  (player as CombatUnit).critChance = o.cls.critChance + ts.crit / 100;
  (player as CombatUnit).critMult = 1.6 + ts.critDmg / 100;
  const units: CombatUnit[] = [player];
  const brains: { unit: Unit; update(dt: number): void }[] = [];
  let loadout: Loadout;
  const world: CombatWorld = { units: () => units, resetCooldown: (_o, s: SlotId) => loadout.resetCooldown(s) };
  const fx = new EffectSystem(world, rng);
  const moveBy = (u: Unit, dir: Pos | null, speed: number, dt: number) => { if (dir && speed > 0) { u.pos.x += dir.x * speed * dt; u.pos.z += dir.z * speed * dt; } };
  const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.z - b.z);

  function spawnMob(name: string, enc: string, pos: Pos, hp: number, cfg: Partial<EnemyConfig> = {}) {
    const u = new Unit(name, 'enemy', hp, { ...pos });
    const b = new EnemyBrain(u, { ...pos }, { ...DEFAULT_ENEMY, attackDamage: 14, ...cfg }, (tg, d) => strike(u, tg, d, 'physical'), rng);
    u.provokeHook = () => b.provoke();
    units.push(u); run.addUnit(enc, u.uid);
    brains.push({ unit: u, update: dt => { const it = b.update(dt, player); moveBy(u, it.moveDir, it.speed, dt); } });
    return { u, b };
  }
  o.mobs.forEach(m => spawnMob(m.name, m.enc, m.pos, m.hp, m.config));

  /** 怪物命中：词缀伤害倍率（暴怒 / 时限）+ 火焰词缀灼烧 */
  function strike(src: Unit, tg: CombatUnit, d: number, el: Parameters<EffectSystem['dealDamage']>[2]) {
    const v = fx.dealDamage(tg, d * affixDamageMul(o.affix, src.hp / src.maxHp, t), el, src);
    if (o.affix === 'blazing' && v > 0 && tg.alive) tg.status.add({ key: 'aff-blaze', kind: 'dot', remaining: BLAZE_DURATION, dps: Math.round(d * BLAZE_PCT), element: 'fire', source: src });
    return v;
  }
  const boss = new Unit(o.boss.name, 'enemy', o.bossHp, { ...o.bossPos });
  boss.ccImmune = true;
  units.push(boss); run.addUnit('boss', boss.uid);
  let summoned = 0, bossCasts = 0, zonesDodged = 0, circleHits = 0;
  const bossBrain = new BossBrain(boss, { ...boss.pos }, o.boss,
    (tg, dmg, el, effect) => {
      fx.dealDamage(tg, dmg * affixDamageMul(o.affix, boss.hp / boss.maxHp, t), el, boss);   // Boss 不吃火焰词缀（红圈/毒池和近战走同一个回调，分不开）
      if (effect?.type === 'slow') tg.status.add({ key: 'boss-slow', kind: 'slow', remaining: effect.duration, percent: effect.percent, source: boss });
      if (effect?.type === 'dot') tg.status.add({ key: 'boss-dot', kind: 'dot', remaining: effect.duration, dps: effect.dps, element: effect.element, source: boss });
    },
    {
      onTelegraph: (_id, pos, r, d, name) => log(`🔴 ${name}！红圈 (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) 半径${r}，${d}秒后落下`),
      onTelegraphResolve: (_id, hit) => { if (hit) circleHits++; log(hit ? '  💥 没躲开，被砸中' : '  ✓ 躲开了'); },
      onTelegraphDodged: () => { rollSaves++; log('  🌀 翻滚无敌帧躲过红圈'); },
      onCastStart: (name, ct) => { bossCasts++; log(`⏳ Boss 开始读条「${name}」${ct}秒`); },
      onCastEnd: (name, ok) => log(ok ? `  ⚡「${name}」读条完成` : `  ✋「${name}」被打断！`),
      onHeal: v => log(`  💚 Boss 回复 ${v} 生命`),
      onPhase: ph => log(`=== 进入${ph.name}${ph.yell ? `：「${ph.yell}」` : ''} ===`),
      onZone: (_id, pos, r, d, name) => log(`🟢 ${name}：毒池 (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) 半径${r}，持续${d}秒`),
      onSummon: (n, unit) => {
        const def = (unit && o.summons?.[unit]) || { hp: 250, config: {} };
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const m = spawnMob(`${unit ?? '增援'}${++summoned}`, 'boss', { x: boss.pos.x + Math.cos(a) * 6, z: boss.pos.z + Math.sin(a) * 6 }, def.hp, def.config);
          m.b.provoke();
        }
        log(`  召唤了 ${n} 个${unit ?? '增援'}`);
      },
    }, rng);
  boss.interruptHook = () => bossBrain.interrupt();
  boss.provokeHook = () => bossBrain.provoke();
  brains.push({ unit: boss, update: dt => { const it = bossBrain.update(dt, player); moveBy(boss, it.moveDir, it.speed, dt); } });

  // ---- 技能 ----
  let forced: Unit | null = null;     // 打断时强制以 Boss 为目标
  function currentTarget(): Unit | null {
    if (forced?.alive) return forced;
    const live = units.filter(u => u.alive && u.faction === 'enemy') as Unit[];
    live.sort((a, b) => (a === boss ? 1 : 0) - (b === boss ? 1 : 0) || dist(a.pos, player.pos) - dist(b.pos, player.pos));
    return live[0] ?? null;
  }
  loadout = new Loadout({
    execute: skill => {
      const target = currentTarget();
      if (!target) return;
      let hits: CombatUnit[];
      if (skill.shape === 'circle') hits = unitsInRadius(world, skill.tags.includes('targeted') ? target.pos : player.pos, skill.stats.radius, 'player');
      else if (skill.shape === 'projectile') {
        hits = [target];
        const others = (units.filter(u => u.alive && u.faction === 'enemy' && u !== target) as Unit[]).sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
        for (let i = 1; i < skill.stats.projectileCount; i++) hits.push(others[i - 1] ?? target);
        // 多发打同一个目标：分开结算
        hits.forEach(h => fx.applySkill(skill, player, [h]));
        return;
      } else hits = [target];
      if (skill.shape === 'dash') { player.pos.x = target.pos.x - 1.5; player.pos.z = target.pos.z; }
      fx.applySkill(skill, player, hits);
    },
  });
  const L = o.cls.loadout;
  SLOT_IDS.forEach(s => loadout.equipSkill(o.cls.skills[L[s]], s));
  const lvMod: ModifierDef = { id: 'level', name: '等级', source: 'buff', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.06 * (o.level - 1) }] };
  const statMods: ModifierDef[] = [];
  if (ts.power) statMods.push({ id: 'talent_power', name: '强度', source: 'buff', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: ts.power * 0.004 }] });
  if (ts.haste) statMods.push({ id: 'talent_haste', name: '急速', source: 'buff', desc: '', match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -Math.min(40, ts.haste) / 100 }] });
  loadout.setComboModifiers([...o.cls.combos, lvMod, ...statMods]);
  loadout.setTalents(tree.activeNodes());
  loadout.setItems(o.items ?? []);
  log(`${o.cls.name} Lv.${o.level} 生命 ${player.maxHp} 护甲 ${player.armor}${ts.crit || ts.critDmg ? ` 暴击 +${ts.crit}%/暴伤 +${ts.critDmg}%` : ''}；天赋 ${o.cls.tree.specs.map(sp => `${sp.name}${tree.spentIn(sp.id)}`).join('/')}；技能：${SLOT_IDS.map(s => loadout.preview(s, { now: 0, casterHpPercent: 1, targetEffects: [] })!.displayName).join(' / ')}`);

  const ctx = () => ({ now: t, casterHpPercent: player.hp / player.maxHp, targetEffects: currentTarget()?.status.kinds() ?? [] });
  const cdOf = (s: SlotId) => loadout.cooldownLeft(s, t);
  const reach = (s: SlotId, tg: Unit) => {
    const p = loadout.preview(s, ctx())!;
    if (p.shape === 'circle' && !p.tags.includes('targeted')) return p.stats.radius;
    return (p.shape === 'single' && !p.tags.includes('ranged') ? p.stats.range + (tg === boss ? 1 : 0.3) : p.stats.range);
  };

  let interrupts = 0, rolls = 0, rollSaves = 0, deaths = 0, minHp = 1;
  const dodge = new DodgeRoll();
  dodge.haste = Math.min(40, ts.haste);
  let bossIntent: ReturnType<BossBrain['update']> | null = null;
  /** 翻滚机器人：红圈快落下还站在里面 / Boss 读条快完成（没打断）时翻滚 */
  function tryRoll(): boolean {
    if (o.lazy || o.dodge !== 'roll' || dodge.whyNot(player, t)) return false;
    // 红圈：走不出去（剩余时间不够跑到圈外）→ 能滚出圈就立刻向外滚，否则等到快落下时用无敌帧硬吃
    const speed = 6.5 * player.status.speedMultiplier;
    const tg = telegraphsSeen().find(h => {
      const d = dist(player.pos, h.pos);
      if (d > h.radius + 0.3) return false;
      const walkT = (h.radius + 0.4 - d) / Math.max(0.1, speed);
      if (walkT < h.remaining - 0.1) return false;                       // 跑得出去：交给下面的跑位
      return d + dodge.cfg.distance * 0.95 > h.radius + 0.3 || h.remaining <= dodge.cfg.iframes - 0.05;
    });
    const cast = bossIntent?.casting && bossIntent.casting.progress > 0.9 && !(cdOf(o.cls.interruptSlot) <= 0 && dist(player.pos, boss.pos) <= reach(o.cls.interruptSlot, boss));
    if (!tg && !cast) return false;
    let dir = { x: 0, z: 1 };
    if (tg) { const d = dist(player.pos, tg.pos); dir = d < 0.01 ? { x: 0, z: 1 } : { x: (player.pos.x - tg.pos.x) / d, z: (player.pos.z - tg.pos.z) / d }; }
    if (dodge.start(player, t, dir, dir)) { rolls++; log(`  🌀 闪避翻滚${tg ? '（红圈）' : '（读条）'}`); return true; }
    return false;
  }
  // 反应时间：危险区出现后 reaction 秒才被机器人注意到
  const seenAt = new WeakMap<object, number>();
  const reaction = o.reaction ?? 0.35;
  const noticed = <H extends object>(h: H) => { if (!seenAt.has(h)) seenAt.set(h, t); return t - seenAt.get(h)! >= reaction - 1e-6; };
  const telegraphsSeen = () => bossBrain.activeTelegraphs.filter(noticed);
  const hazards = (): { pos: Pos; radius: number }[] => [...telegraphsSeen(), ...bossBrain.activeZones.filter(noticed)];
  const inHazard = (p: Pos, pad = 0.4) => hazards().find(h => dist(p, h.pos) <= h.radius + pad);

  function playerAI(dt: number) {
    if (!player.alive || player.status.isStunned) return;
    // 0. 翻滚中：只位移
    if (dodge.rolling) { const m = dodge.step(dt); if (m) { player.pos.x += m.x; player.pos.z += m.z; } return; }
    if (tryRoll()) return;
    const speed = 6.5 * player.status.speedMultiplier;
    // 1. 躲红圈 / 毒池：往远离圆心的方向跑，并尽量朝 Boss 方向偏（不跑出场地）
    if (!o.lazy) {
      const h = inHazard(player.pos);
      if (h) {
        const d = dist(player.pos, h.pos);
        let dir = d < 0.01 ? { x: 0, z: 1 } : { x: (player.pos.x - h.pos.x) / d, z: (player.pos.z - h.pos.z) / d };
        // 如果这个方向还有别的危险区，转 90 度
        const probe = { x: player.pos.x + dir.x * (h.radius + 1), z: player.pos.z + dir.z * (h.radius + 1) };
        if (inHazard(probe, 0) && inHazard(probe, 0) !== h) dir = { x: -dir.z, z: dir.x };
        moveBy(player, dir, speed, dt);
        if (!inHazard(player.pos)) zonesDodged++;
        return;
      }
    }
    // 2. 打断
    const iSlot = o.cls.interruptSlot;
    if (!o.lazy && bossBrain.isCasting && cdOf(iSlot) <= 0 && dist(player.pos, boss.pos) <= reach(iSlot, boss)) {
      forced = boss;
      const ok = loadout.tryCast(iSlot, ctx());
      forced = null;
      if (ok) { interrupts++; return; }
    }
    const target = currentTarget();
    if (!target) return;
    // 3. 走位：近战贴身，远程保持在射程内 ~70%
    const d = dist(player.pos, target.pos);
    const want = o.cls.ranged ? Math.min(11, reach('basic', target) * 0.75) : (target === boss ? 2.4 : 1.8);
    if (d > want + 0.3) {
      const dir = { x: (target.pos.x - player.pos.x) / d, z: (target.pos.z - player.pos.z) / d };
      const next = { x: player.pos.x + dir.x * speed * dt, z: player.pos.z + dir.z * speed * dt };
      if (!inHazard(next, 0.2)) { moveBy(player, dir, speed, dt); }
      if (!o.cls.ranged) return;
    }
    // 4. 技能优先级（打断技能留着）
    const near = units.filter(u => u.alive && u.faction === "enemy" && dist(u.getPos(), player.pos) < 4.5).length;
    const order: SlotId[] = ['ultimate', 'skill1', 'skill2', 'skill3', 'basic'];
    for (const s of order) {
      if (s === iSlot && target === boss) continue;
      if (cdOf(s) > 0) continue;
      const p = loadout.preview(s, ctx())!;
      if (s === 'ultimate' && target !== boss && near < 3) continue;
      if (p.shape === 'circle' && !p.tags.includes('targeted') && near < (target === boss ? 1 : 2)) continue;
      if (p.shape === 'dash' && d < 4) continue;
      if (d > reach(s, target) + 0.01) continue;
      if (loadout.tryCast(s, ctx())) return;
    }
  }

  const dt = 0.1;
  const maxRevives = o.revives ?? 0;
  for (let i = 0; i < 4000 && !run.completed; i++) {
    if (!player.alive) {
      deaths++;
      if (deaths > maxRevives) break;
      log(`  ↺ 复活（第 ${deaths} 次阵亡）`);
      player.hp = player.maxHp; player.status.clear();
    }
    t += dt;
    playerAI(dt);
    brains.forEach(b => { if (!b.unit.alive) return; if (b.unit === boss) { bossIntent = bossBrain.update(dt, player); moveBy(boss, bossIntent.moveDir, bossIntent.speed, dt); } else b.update(dt); });
    minHp = Math.min(minHp, Math.max(0, player.hp) / player.maxHp);
    if (!boss.alive) bossBrain.update(dt, player);
    fx.update(dt);
    run.update(dt);
    // 脱战回血（小怪之间）
    if (!units.some(u => u.alive && u.faction === "enemy" && dist(u.getPos(), player.pos) < 14) && player.alive) player.hp = Math.min(player.maxHp, player.hp + Math.ceil(player.maxHp * 0.06 * dt));
  }
  if (!player.alive && deaths <= maxRevives) deaths++;
  const res: SimResult = { bursts, completed: run.completed, playerHp: player.hp, playerMaxHp: player.maxHp, interrupts, bossCasts, seconds: t, zonesDodged, bossHp: boss.hp, deaths, rolls, rollSaves, minHpPct: minHp, circleHits };
  log(`结果：${run.completed ? '通关' : player.alive ? '超时' : '玩家阵亡'}；阵亡 ${deaths} 次；玩家血量 ${player.hp}/${player.maxHp}（最低 ${Math.round(minHp * 100)}%）；Boss 读条 ${bossCasts} 次，打断 ${interrupts} 次；被红圈砸中 ${circleHits} 次；翻滚 ${rolls} 次（无敌帧躲过红圈 ${rollSaves} 次）；Boss ${boss.hp}/${o.bossHp}`);
  return res;
}
