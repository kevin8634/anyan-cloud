// 运行：npm run boss —— 命令行模拟“暗岩矿洞”整个副本：两波小怪 + 三阶段 Boss
// 玩家脚本：见红圈就跑出去、Boss 读条就用冲锋打断、其余时间按优先级放技能
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, unitsInRadius, Pos, Faction } from './core/Combat';
import { EnemyBrain, DEFAULT_ENEMY } from './core/EnemyBrain';
import { BossBrain } from './core/BossBrain';
import { DungeonRun } from './core/Dungeon';
import { Loadout } from './core/Loadout';
import { SlotId } from './core/types';
import { SKILLS, TALENTS, ITEMS, SET_BONUSES, COMBOS } from './data/warrior';
import { DARKROCK_MINE, BOSS_GROK } from './data/dungeon_darkrock';

declare const process: { argv: string[] };
let t = 0;
const log = (s: string) => console.log(`[${t.toFixed(1).padStart(5)}s] ${s}`);
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // 可复现随机数

class Unit implements CombatUnit {
  status = new StatusSet();
  hp: number;
  ccImmune = false;
  interruptHook?: () => boolean;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDeath() { log(`  ☠ ${this.uid} 死亡`); run.onUnitDeath(this.uid); }
  onInterrupt() { return this.interruptHook?.() ?? false; }
}

const run = new DungeonRun(DARKROCK_MINE, {
  onEncounterCleared: (e) => log(`✔ 遭遇战「${e.name}」完成`),
  onCompleted: (d, s) => log(`🏆 通关「${d.name}」，用时 ${s.toFixed(1)} 秒`),
});

const player = new Unit('玩家', 'player', 1500, { x: 0, z: 0 });
const units: CombatUnit[] = [player];
const brains: { unit: Unit; update(dt: number): void }[] = [];
let loadout: Loadout;
const world: CombatWorld = { units: () => units, resetCooldown: (_o, s: SlotId) => loadout.resetCooldown(s) };
const fx = new EffectSystem(world, rng);

function moveBy(u: Unit, dir: Pos | null, speed: number, dt: number) {
  if (dir && speed > 0) { u.pos.x += dir.x * speed * dt; u.pos.z += dir.z * speed * dt; }
}

function spawnMob(name: string, enc: string, pos: Pos) {
  const u = new Unit(name, 'enemy', 250, pos);
  const b = new EnemyBrain(u, { ...pos }, { ...DEFAULT_ENEMY, attackDamage: 12 }, (tg, d) => fx.dealDamage(tg, d, 'physical', u), rng);
  u.interruptHook = () => false;
  units.push(u); run.addUnit(enc, u.uid);
  brains.push({ unit: u, update: dt => { const it = b.update(dt, player); moveBy(u, it.moveDir, it.speed, dt); } });
  return { u, b };
}

// 三个遭遇战
const mobs = [
  spawnMob('矿工A', 'entrance', { x: 6, z: 0 }), spawnMob('矿工B', 'entrance', { x: 7, z: 1 }),
  spawnMob('穴居蜘蛛A', 'tunnel', { x: 30, z: 0 }), spawnMob('穴居蜘蛛B', 'tunnel', { x: 31, z: -1 }), spawnMob('穴居蜘蛛C', 'tunnel', { x: 31, z: 1 }),
];

const boss = new Unit('监工格罗克', 'enemy', 2400, { x: 60, z: 0 });
boss.ccImmune = true;
units.push(boss); run.addUnit('boss', boss.uid);
let summoned = 0;
const telegraphs = new Map<number, { pos: Pos; radius: number }>();
const bossBrain = new BossBrain(boss, { ...boss.pos }, BOSS_GROK,
  (tg, dmg, el, effect) => { fx.dealDamage(tg, dmg, el, boss); if (effect?.type === 'slow') tg.status.add({ key: 'boss-slow', kind: 'slow', remaining: effect.duration, percent: effect.percent, source: boss }); },
  {
    onTelegraph: (id, pos, r, d, name) => { telegraphs.set(id, { pos, radius: r }); log(`🔴 ${name}！红圈 (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}) 半径${r}，${d}秒后落下`); },
    onTelegraphResolve: (id, hit) => { telegraphs.delete(id); log(hit ? '  💥 没躲开，被砸中' : '  ✓ 躲开了'); },
    onCastStart: (name, ct) => log(`⏳ Boss 开始读条「${name}」${ct}秒`),
    onCastEnd: (name, ok) => log(ok ? `  ⚡「${name}」读条完成，玩家挨了一发` : `  ✋「${name}」被打断！`),
    onPhase: (ph) => log(`=== 进入${ph.name}${ph.yell ? `：「${ph.yell}」` : ''} ===`),
    onSummon: (n) => { for (let i = 0; i < n; i++) { const m = spawnMob(`增援矿工${++summoned}`, 'boss', { x: boss.pos.x + 3, z: i * 2 - 1 }); m.b.provoke(); } log(`  召唤了 ${n} 个增援矿工`); },
  }, rng);
boss.interruptHook = () => bossBrain.interrupt();
brains.push({ unit: boss, update: dt => { const it = bossBrain.update(dt, player); moveBy(boss, it.moveDir, it.speed, dt); } });

// 玩家技能
loadout = new Loadout({
  execute: skill => {
    const target = currentTarget()!;
    const hits = skill.shape === 'circle' ? unitsInRadius(world, player.pos, skill.stats.radius, 'player') : [target];
    if (skill.shape === 'dash') { player.pos.x = target.getPos().x - 1.5; player.pos.z = target.getPos().z; }
    fx.applySkill(skill, player, hits);
  },
});
loadout.equipSkill(SKILLS.slash, 'basic');
loadout.equipSkill(SKILLS.charge, 'skill1');
loadout.equipSkill(SKILLS.whirlwind, 'skill2');
loadout.equipSkill(SKILLS.thunderclap, 'skill3');
loadout.equipSkill(SKILLS.avatar, 'ultimate');
loadout.setTalents([TALENTS[0], TALENTS[1]]);
loadout.setItems([ITEMS[2], ITEMS[3]]);
loadout.setSetBonuses(SET_BONUSES);
loadout.setComboModifiers(COMBOS);

const dist = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.z - b.z);
function currentTarget(): Unit | null {
  // 先打小怪，再打 Boss（和魔兽一样先清增援）
  const live = units.filter(u => u.alive && u.faction === 'enemy') as Unit[];
  live.sort((a, b) => (a === boss ? 1 : 0) - (b === boss ? 1 : 0) || dist(a.pos, player.pos) - dist(b.pos, player.pos));
  return live[0] ?? null;
}
const ctx = () => ({ now: t, casterHpPercent: player.hp / player.maxHp, targetEffects: currentTarget()?.status.kinds() ?? [] });
const cdOf = (s: SlotId) => loadout.cooldownLeft(s, t);

let interrupts = 0;
const LAZY = process.argv.includes('--lazy');   // 不躲圈、不打断，对比用
function playerAI(dt: number) {
  if (!player.alive || player.status.isStunned) return;
  const speed = 6 * player.status.speedMultiplier;
  // 1. 躲红圈：站在任一圈里就往远离圆心方向跑
  if (!LAZY) for (const tg of telegraphs.values()) {
    const d = dist(player.pos, tg.pos);
    if (d <= tg.radius + 0.3) {
      const dir = d < 0.01 ? { x: 0, z: 1 } : { x: (player.pos.x - tg.pos.x) / d, z: (player.pos.z - tg.pos.z) / d };
      moveBy(player, dir, speed, dt);
      return;
    }
  }
  // 2. 打断：Boss 读条且冲锋可用
  if (!LAZY && bossBrain.isCasting && cdOf('skill1') <= 0 && currentTarget() === boss) {
    if (loadout.tryCast('skill1', ctx())) { interrupts++; return; }
  }
  const target = currentTarget();
  if (!target) return;
  // 3. 走到近战距离
  const d = dist(player.pos, target.pos);
  if (d > 2) { moveBy(player, { x: (target.pos.x - player.pos.x) / d, z: (target.pos.z - player.pos.z) / d }, speed, dt); return; }
  // 4. 技能优先级（冲锋留给打断）
  const order: SlotId[] = target === boss ? ['ultimate', 'skill3', 'skill2', 'basic'] : ['skill3', 'skill2', 'basic'];
  for (const s of order) if (cdOf(s) <= 0 && loadout.tryCast(s, ctx())) return;
}

const dt = 0.1;
for (let i = 0; i < 3000 && !run.completed && player.alive; i++) {
  t += dt;
  playerAI(dt);
  brains.forEach(b => b.unit.alive && b.update(dt));
  if (!boss.alive) bossBrain.update(dt, player);   // 结算剩下的圈
  fx.update(dt);
  run.update(dt);
}
log(`结果：${run.completed ? '通关' : player.alive ? '超时' : '玩家阵亡'}；玩家血量 ${player.hp}/${player.maxHp}；打断 ${interrupts} 次；Boss ${boss.hp}/${boss.maxHp}`);
