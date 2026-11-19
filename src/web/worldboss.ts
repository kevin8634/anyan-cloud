import { animTelegraph, animTelegraphHit } from './procrig';   // v1.2.73
// ========== v0.9.3d 野外世界首领：刷新（真实时间）/ 喊话 / 机制表现 / 首领框 / 地图标记 / 精魄保底 / 每日首杀 ==========
// 数据在 data/world_bosses.ts；机制逻辑走 core/BossBrain（和副本首领同一套），红圈 / 毒池画进 enemies.ts 的 telegraphs / poisonZones（main 每帧更新）
import * as THREE from 'three';
import type { Element } from '../core/types';
import type { Ctx, Enemy } from './main';
import * as M from './models';
import * as G from './gfx';
import * as BFX from './bossfx';
import { zoneStorm, BOSS_ZONE_GAIN } from './zonestorm';   // v1.2.80b 首领地面区域走通用件
import { blizzardStorm } from './blizzard';   // v1.2.80b 首领寒冰风暴
import { BossBrain, BossIntent, BossPhase } from '../core/BossBrain';
import { telegraphs, poisonZones, applyBossEffect, stormOff } from './enemies';
import { ENEMY_TYPES, WILD_MODELS, wildModel } from './enemy_types';
import { WORLD_BOSSES, WB_IDS, WorldBossId, WorldBossDef, WB_SOUL_NEED, WB_WARN_SEC, WB_FIRST_SEC, WB_EVENT_SEC } from '../data/world_bosses';
import { WILD, isWildId } from '../data/zones_wild';
import { FIELD_ORIGIN } from '../data/zone_field';
import type { WildMob } from '../data/zones_wild';
import { packBossVoice } from '../core/ContentPacks';

let CX!: Ctx;

/** 存档（可选字段 wboss）：下次出现的真实时间（毫秒）、每日首杀日期、凝成过的专属件 */
export interface WbSave { next: Record<string, number>; day: Record<string, string>; kills: Record<string, number> }
const st: WbSave = { next: {}, day: {}, kills: {} };
const warned = new Set<string>();
/** 测试钩子：真实时间可被替换 */
export const wbClock = { now: () => Date.now() };
const now = () => wbClock.now();
const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function wbSave(): WbSave { return { next: { ...st.next }, day: { ...st.day }, kills: { ...st.kills } }; }
export function wbLoad(s?: Partial<WbSave>) {
  st.next = { ...(s?.next ?? {}) }; st.day = { ...(s?.day ?? {}) }; st.kills = { ...(s?.kills ?? {}) };
  for (const id of WB_IDS) if (!st.next[id]) st.next[id] = now() + WB_FIRST_SEC * 1000;   // 老存档第一次：3 分钟后出现
  warned.clear();
  // 读档后：已生成的首领按新时间表重新决定在不在场
  for (const e of CX?.enemies ?? []) if (e.wb) syncPresence(e);
}

const origin = (d: WorldBossDef) => d.map === 'field' ? FIELD_ORIGIN : WILD[d.map].origin;
export const wbWorldPos = (d: WorldBossDef) => ({ x: origin(d).x + d.x, z: origin(d).z + d.z });

/** 召唤物 / 首领的敌人类型（启动时注册一次） */
let typed = false;
function registerTypes() {
  if (typed) return; typed = true;
  WILD_MODELS.treant ??= M.makeTreant;
  const reg = (k: string, d: Omit<WildMob, 'loot'>) => {
    ENEMY_TYPES[k] = { name: d.name, hp: d.hp, dmg: d.dmg, interval: d.interval, speed: d.speed, aggro: d.aggro, range: d.range, xp: d.xp, ilvl: d.ilvl, model: wildModel(d as WildMob),
      ranged: d.ranged, onHitDot: d.onHitDot, patrol: 0, level: d.level, elite: d.elite, leash: d.leash, shot: d.shot as never };
  };
  for (const id of WB_IDS) { const d = WORLD_BOSSES[id]; reg(id, d.mob); for (const [k, a] of Object.entries(d.adds)) reg(k, a); }
}

/** 进入地图时生成该地图的世界首领（spawnFieldEnemies / spawnWildEnemies 末尾调用） */
export function spawnWorldBosses(map: string) {
  registerTypes();
  for (const id of WB_IDS) {
    const d = WORLD_BOSSES[id]; if (d.map !== map) continue;
    if (CX.enemies.some(e => e.wb === id)) continue;
    const p = wbWorldPos(d);
    const e = new CX.Enemy(id, ENEMY_TYPES[id], new THREE.Vector3(p.x, 0, p.z), map as never, '', 1e9, id);   // respawn 1e9：尸体不被通用逻辑移除，刷新由本文件按真实时间管
    e.wb = id; e.ccImmune = true;
    e.rebrain = () => makeBrain(e, d);
    e.brain = makeBrain(e, d);
    CX.enemies.push(e);
    syncPresence(e);
  }
}
/** 没到出现时间：藏起来（hp 0、不显示、不跑 AI）；到了：在场 */
function syncPresence(e: Enemy) {
  st.next[e.wb!] ??= now() + WB_FIRST_SEC * 1000;
  const due = st.next[e.wb!] <= now();
  if (!due && e.alive) { e.hp = 0; e.deadAt = -999; e.status.clear(); }
  else if (due && !e.alive && e.deadAt === -999) spawnNow(e, false);
}
function spawnNow(e: Enemy, loud: boolean) {
  const d = WORLD_BOSSES[e.wb as WorldBossId];
  CX.respawnEnemy(e);   // 回满血、复位；e.rebrain 换上新的首领大脑
  warned.delete(d.id);
  if (loud && CX.zone === e.z) {
    CX.yell(d.yells.spawn, '#ff8000', 4); CX.toast(`世界首领「${d.name}」出现在${d.arena}！`, '#ff8000');
    BFX.bossEntrance(e.getPos(), d.theme, e.rig.scale); CX.audio.roar(); CX.feel.kick(0.3);
  }
}

// ---------------------------------------------------------------- 机制表现（和副本首领同一套 BossBrain 事件）
const TELE_COL: Record<WorldBossDef['theme'], [number, number, number]> = { nature: [0.55, 1, 0.15], stone: [1, 0.6, 0.15], frost: [0.4, 0.8, 1], fire: [1, 0.25, 0.05] };
const WB_EL: Record<WorldBossDef['theme'], Element> = { nature: 'nature', stone: 'physical', frost: 'frost', fire: 'fire' };
const ZONE_COL: Record<WorldBossDef['theme'], [string, string]> = { nature: ['#5aff20', '#7aff3a'], stone: ['#c89040', '#ffd080'], frost: ['#6ac8ff', '#c8eeff'], fire: ['#ff4a10', '#ffa040'] };
/** v1.1.0：首领大脑需要的最小定义（世界首领 / 内容包首领共用） */
export interface BossBrainDef { name: string; theme: WorldBossDef['theme']; boss: WorldBossDef['boss']; adds: Record<string, unknown> }
const shortName = (n: string) => n.includes(' · ') ? n.split(' · ')[1] : n;
/**
 * v1.2.48 首领配音（内容包 PackAudio.bossVoice 提供）：播放配音 + 喊话条显示字幕（停留时间跟音频时长走），配音期间背景音乐自动压低。
 * 没有配音（普通版构建 / 包没给 / 还没首次交互）= 返回 false，调用方照旧显示原有喊话。
 */
export function bossSay(key: string | undefined, ev: 'spawn' | 'phase' | 'death', name: string, color: string, phase?: { name: string; index: number; last: boolean }): boolean {
  if (!key || !CX) return false;
  const v = packBossVoice(key, ev, phase); if (!v) return false;
  const text = `${v.who ?? shortName(name)}：「${v.text}」`;
  const ok = CX.audio.playVoice(v.src, sec => { if (CX.$('yell').textContent === text) CX.yell(text, color, Math.max(2.5, sec + 0.8)); });
  if (!ok) return false;
  CX.yell(text, color, Math.max(3, [...v.text].length * 0.32));
  return true;
}
/** 11-06 逐招：技能名 → 模型自带片段 SC_<技能 id>（团长瑟兰）。预警 / 读条开始时从头播，片段的出手时刻（extras.hit）= telegraph / castTime，伤害结算就落在出手帧 */
type ScAnim = { playClip?(n: string, ts?: number): number; clipInfo?(n: string): { duration: number; hit?: number } | null };
function makeBrain(e: Enemy, d: BossBrainDef): BossBrain {
  let castStop: (() => void) | null = null, greeted = false, curCast = '', scUntil = -1, scLast = '';
  const abId = (name: string) => d.boss.abilities.find(a => a.name === name)?.id;
  /** 播 SC_<id>，按需把时长对齐到 dur（出手时刻 hit → dur）；同一招 0.3 秒内重复（倒影长枪 4 个圈）只播一次 */
  const sc = (name: string, dur?: number): boolean => {
    const id = abId(name), an = e.rig.anim as unknown as ScAnim | undefined; if (!id || !an?.playClip) return false;
    const clip = `SC_${id}`, info = an.clipInfo?.(clip); if (!info) return false;
    if (scLast === clip && CX.T < scUntil - info.duration + 0.3) return true;
    const ts = dur && info.hit ? info.hit / dur : 1;
    const len = an.playClip(clip, ts); if (!len) return false;
    scUntil = CX.T + len; scLast = clip;
    return true;
  };
  const scBusy = () => CX.T < scUntil;   // raidA A5：curCast = 正在读的技能名（给 castWard 用）
  const th = d.theme;
  const bb = new BossBrain(e, e.spawn.clone() as never, { ...d.boss, config: { ...d.boss.config } }, (tg, dmg, el, effect) => {
    if (effect && curCast && castWard?.(curCast, e.pboss ?? '')) { CX.toast(`免疫「${curCast}」`, '#ffe9a0'); return; }   // raidA A5：内容包的读条免疫（如灯光里听不见尖啸）
    e.attackAnim = 0.4;
    if (!effect) { if (!scBusy()) e.rig.anim?.play('heavy'); CX.audio.enemyAttack('boss'); }
    CX.fx.dealDamage(tg, dmg * (e.outMul ?? 1), el, e);
    applyBossEffect(tg, e, effect);
  }, {
    onTelegraph: (id, p, r, dur, name) => {
      const mat = G.telegraphMaterial(); const c = TELE_COL[th]; mat.uniforms.color.value.setRGB(c[0], c[1], c[2]);
      const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, CX.groundAt(p.x, p.z) + 0.06, p.z);
      CX.scene.add(disc); telegraphs.set(id, { disc, mat, r, total: dur, left: dur });
      if (!sc(name, dur) && !animTelegraph(e.rig.anim, dur)) e.rig.anim?.play('cast', 1.2); CX.audio.telegraph();   // v1.2.73 程序化绑骨：预警期 = 后摆
    },
    onTelegraphResolve: (id, hit) => {
      const t = telegraphs.get(id); if (!t) return;
      if (!scBusy()) animTelegraphHit(e.rig.anim);
      const c = { x: t.disc.position.x, z: t.disc.position.z };
      if (e.z === CX.zone) { BFX.bossImpact(c, t.r, th); CX.audio.bossSlam(); CX.feel.emit(hit ? 'bossSlam' : 'bossSlamMiss'); }
      CX.scene.remove(t.disc); telegraphs.delete(id);
    },
    onCastStart: (name, ct) => { curCast = name; CX.$('cb-name').textContent = `${shortName(d.name)} · ${name}`; if (!sc(name, ct)) e.rig.anim?.play('castLong', 0.8); CX.audio.bossCast(); castStop?.(); castStop = BFX.castCharge(() => e.pos, th, ct, e.rig.scale); },
    onCastEnd: (name, ok) => { queueMicrotask(() => { curCast = ''; });
      castStop?.(); castStop = null;
      if (ok && e.alive && e.z === CX.zone && th === 'frost' && name === '寒冰风暴') { const pp = CX.player.pos; blizzardStorm({ x: pp.x, z: pp.z }, 7, 3, ['frost'], innerHeight || 720); }   // v1.2.80b 读条完成：玩家周围刮 3 秒暴风雪（复用暴风雪件，0 积分）
      if (!ok && e.alive) { BFX.castBreak(e.pos, th, e.rig.scale); CX.yell(`「${name}」被打断！`, '#3f3', 1.6); CX.audio.interrupt(); scUntil = -1; e.rig.anim?.play('hit'); }
    },
    onPhase: (ph: BossPhase) => {
      const pi = d.boss.phases.findIndex(p => p.name === ph.name), said = e.z === CX.zone && bossSay(e.pboss, 'phase', d.name, '#ff5040', { name: ph.name, index: pi, last: pi === d.boss.phases.length - 1 });   // v1.2.48 配音
      if (!said && ph.yell) CX.yell(`${shortName(d.name)}：${ph.yell}`, '#ff5040', 3); CX.audio.roar(); CX.feel.kick(0.3); BFX.phaseBurst(e.getPos(), th, e.rig.scale); CX.toast(`${shortName(d.name)} 进入${ph.name}`, '#ff9a40'); },
    onSummon: (n, unit) => {
      // 11-06 逐招：召唤招有自带片段（SC_squad）就先播号令，到出手帧（extras.hit）再出兵
      const sa = d.boss.abilities.find(a => a.kind === 'summon' && (a as { unit?: string }).unit === unit), an = e.rig.anim as unknown as ScAnim | undefined;
      const hit = sa && sc(sa.name) ? an?.clipInfo?.(`SC_${sa.id}`)?.hit ?? 0 : 0;
      const go = () => { if (!e.alive) return;
      const k = unit ?? Object.keys(d.adds)[0];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const add = new CX.Enemy(k, ENEMY_TYPES[k], new THREE.Vector3(e.pos.x + Math.cos(a) * 6, 0, e.pos.z + Math.sin(a) * 6), e.z, '', 0, 'wb_add');
        add.wbAdd = true; add.pos.y = CX.groundAt(add.pos.x, add.pos.z);
        CX.enemies.push(add); add.brain.provoke();
        CX.particles.emit({ x: add.pos.x, y: 0.2, z: add.pos.z }, { count: 30, color: 0x8a6a40, color2: 0xffffff, speed: 3, up: 2, life: 0.8, size: 0.45, gravity: 5 });
      }
      if (k === 'wb_yurg_add') CX.toast('骨猛犸挣脱了缰绳！先避开它的冲撞', '#9fe0ff');
      };
      if (hit > 0) setTimeout(go, hit * 1000); else go();
    },
    onZone: (id, p, r, rem) => {
      // v1.2.80b 实心圆盘 → 通用区域件；首领机制保留一圈淡的判定环（预警可读性，Rhett：首领红圈另议）
      const [, c2] = ZONE_COL[th]; const y = CX.groundAt(p.x, p.z);
      const disc = zoneStorm(p, r, WB_EL[th], rem ?? 8, undefined, th === 'frost' ? 0x2a70c0 : undefined, th === 'frost', BOSS_ZONE_GAIN);   // v1.2.86 冰原上白霜看不见：冻土改深冰蓝
      const ring = M.makeRing(c2, 0.45); ring.scale.setScalar(r); ring.position.set(p.x, y + 0.08, p.z);
      CX.scene.add(ring); poisonZones.set(id, { disc, ring, p, r });
      CX.audio.poison();
    },
    onZoneEnd: id => { const z = poisonZones.get(id); if (z) { stormOff(z.disc); CX.scene.remove(z.ring); poisonZones.delete(id); } },
    onReset: () => { castStop?.(); castStop = null; },
    // v1.2.48 登场配音：首次开打时播（内容包首领进图时会一起生成，放在生成时会几句叠在一起）；每条命播一次
    onEngage: () => { if (!greeted && e.z === CX.zone) greeted = bossSay(e.pboss, 'spawn', d.name, '#ff8000'); },
  });
  e.onInterrupt = () => bb.interrupt();
  return bb;
}
/** v1.1.0 内容包首领用（web/packboss.ts） */
/** raidA A5：内容包读条免疫判定（技能名, 首领 pboss key）→ true = 这次读条的伤害和效果不落到玩家身上 */
let castWard: ((cast: string, boss: string) => boolean) | null = null;
export function setCastWard(f: ((cast: string, boss: string) => boolean) | null) { castWard = f; }
export const makeBossBrain = (e: Enemy, d: BossBrainDef) => makeBrain(e, d);

// ---------------------------------------------------------------- 每帧
let tick = 0;
export function wbUpdate(dt: number) {
  if ((tick += dt) < 0.5) return; tick = 0;
  const t = now();
  for (let i = CX.enemies.length - 1; i >= 0; i--) {
    const e = CX.enemies[i];
    if (e.wbAdd && !e.alive && CX.T - e.deadAt > 6) { e.dispose(); CX.enemies.splice(i, 1); if (CX.target === e) CX.target = null; continue; }   // 召唤物尸体清掉
    if (!e.wb || e.alive) continue;
    const d = WORLD_BOSSES[e.wb as WorldBossId], next = st.next[d.id] ?? 0;
    if (!warned.has(d.id) && t >= next - WB_WARN_SEC * 1000 && t < next) {
      warned.add(d.id);
      if (CX.zone === e.z) { CX.yell(d.yells.warn, '#ffb040', 5); CX.toast(`世界首领「${d.name}」将在 ${Math.ceil((next - t) / 60000)} 分钟后出现（已标在地图上）`, '#ffb040'); }
    }
    if (t >= next && (e.deadAt === -999 || CX.T - e.deadAt > 4)) spawnNow(e, true);
  }
  // 首领死了以后：脱战首领的残留红圈继续结算完
}

/** 击杀（combatev.onUnitDeath 里调用，通用掉落之后）：下次刷新、每日首杀、精魄保底 */
export function wbOnDeath(e: Enemy) {
  if (!e.wb) return;
  const d = WORLD_BOSSES[e.wb as WorldBossId];
  st.next[d.id] = now() + d.respawnMin * 60000; warned.delete(d.id);
  st.kills[d.id] = (st.kills[d.id] ?? 0) + 1;
  CX.yell(d.yells.death, '#ffd34d', 4);
  BFX.bossDeath(e.getPos(), d.theme, e.rig.scale);
  CX.audio.victory();
  // 每日首杀：额外 1 件史诗以上 + 精魄翻倍（掉落表里的 1~2 个之外再给 2 个）
  if (st.day[d.id] !== today()) {
    st.day[d.id] = today();
    const r = CX.gen.roll({ id: 'wb_daily', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'orange' }] }, d.mob.ilvl + 2);   // v1.2.38 首领不掉紫：每日首杀保底改橙
    r.items.forEach((x, i) => CX.spawnLoot(x, e.pos, i + 4, r.items.length + 4));
    CX.inventory.addStack(d.soul, 2);
    CX.toast(`今日首杀「${d.name.split(' · ')[1]}」：额外史诗装备 + 精魄 ×2`, '#ff8000');
  }
  wbSoulCheck(d.id, e.pos);
  CX.save();
}
/** 精魄保底：满 10 个自动凝成一件专属橙装（优先还没拿过的那件）；v0.9.3f 声望兑换精魄后也调用 */
export function wbSoulCheck(id: string, pos: THREE.Vector3) {
  const d = WORLD_BOSSES[id as WorldBossId]; if (!d) return;
  if (CX.inventory.stack(d.soul) >= WB_SOUL_NEED) {
    CX.inventory.useStack(d.soul, WB_SOUL_NEED);
    const own = new Set([...CX.inventory.equippedItems(), ...CX.inventory.bag, ...CX.bank].map(x => x.fixedId));
    const pick = d.uniques.find(u => !own.has(u)) ?? d.uniques[Math.floor(Math.random() * d.uniques.length)];
    const it = CX.gen.generateFixed(pick, d.mob.ilvl + 4);
    if (it) { CX.spawnLoot(it, pos, 0, 1); CX.toast(`${WB_SOUL_NEED} 个精魄凝成了「${it.name}」！`, '#ff8000'); }
  }
}

/** 炽翼：熔岩喷发平息后 2 分钟必刷（travel.finishEvent 调用） */
export function wbOnEvent(map: string, ok: boolean) {
  if (!ok) return;
  for (const id of WB_IDS) {
    const d = WORLD_BOSSES[id]; if (d.map !== map || id !== 'wb_ash') continue;
    const e = CX.enemies.find(x => x.wb === id); if (e?.alive) continue;
    const t = now() + WB_EVENT_SEC * 1000;
    if ((st.next[id] ?? Infinity) > t) { st.next[id] = t; warned.delete(id); }
    CX.yell('熔岩喷发平息了……火山口的深处传来龙吼！', '#ff6a20', 4);
  }
}

/** 首领框：本地图里正在交战的世界首领 */
export function wbHud(): { boss: Enemy; phase: string; ticks?: number[] } | null {
  for (const e of CX.enemies) {
    if (!e.wb || !e.alive || e.z !== CX.zone) continue;
    const bi = e.intent as BossIntent | null;
    if (!bi || (bi.state !== 'chase' && bi.state !== 'attack')) continue;
    const ph = WORLD_BOSSES[e.wb as WorldBossId].boss.phases;
    return { boss: e, phase: ph[bi.phaseIndex]?.name ?? '', ticks: ph.slice(1).map(x => x.hpBelow) };
  }
  return null;
}

/** 地图兴趣点（野外首领类，名字带「世界首领」；倒计时按真实时间） */
const fmt = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒` : `${Math.max(0, Math.round(sec))} 秒`;
export function wbPois(map: string) {
  return WB_IDS.map(id => WORLD_BOSSES[id]).filter(d => d.map === map).map(d => {
    const p = wbWorldPos(d), e = CX.enemies.find(x => x.wb === d.id);
    const alive = !!e?.alive, left = ((st.next[d.id] ?? 0) - now()) / 1000;
    const state = alive ? '存活' : left > 0 ? `${fmt(left)}后出现${left <= WB_WARN_SEC ? '（即将出现！）' : ''}` : '即将出现';
    return { kind: 'wildboss' as const, name: `世界首领 · ${d.name}`, x: alive ? e!.pos.x : p.x, z: alive ? e!.pos.z : p.z, sub: `${d.level} 级 · ${d.arena} · 每 ${d.respawnMin} 分钟 · 已击杀 ${st.kills[d.id] ?? 0} 次`, state, live: alive || (left > 0 && left <= WB_WARN_SEC), key: d.id };
  });
}

/** 测试 / 调试 */
export function wbDebug() {
  return WB_IDS.map(id => { const e = CX.enemies.find(x => x.wb === id); return { id, name: WORLD_BOSSES[id].name, map: WORLD_BOSSES[id].map, spawned: !!e, alive: !!e?.alive, hp: e?.hp ?? 0, maxHp: e?.maxHp ?? 0, nextIn: Math.round(((st.next[id] ?? 0) - now()) / 1000), kills: st.kills[id] ?? 0, day: st.day[id] ?? '' }; });
}
export function wbSpawnNow(id: string) { st.next[id] = now(); warned.delete(id); const e = CX.enemies.find(x => x.wb === id); if (e && !e.alive) spawnNow(e, true); return !!e?.alive; }
export const wbState = st;
export { isWildId };

export function bindWorldBoss(c: Ctx) { CX = c; }
