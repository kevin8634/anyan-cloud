// v1.2.16 内容包小副本：复用小副本四档难度（web/dungeonplus.ts 的 dgx 流程：遗物 / 异变 / 誓约 / 计时奖牌），同步等级由副本定义给
// 副本场地 = 一张内容包野外（PackDungeonDef.map）；入口 = 另一张野外 dungeonGates 里同 id 的门（lootnpc 交互）；首领走 packboss（BossBrain 表现 + 首领框）。
// 没有内容包时这里一次都不会被调用（packList('dungeons') 为空），本体行为不变。本文件只放通用词。
import * as THREE from 'three';
import type { Ctx, Enemy } from './main';
import type { PackDungeonDef, PackDungeonBoss, PackBossDef } from '../core/ContentPacks';
import { packList } from '../core/ContentPacks';
import { ENEMY_TYPES, EnemyType, wildModel } from './enemy_types';
import type { WildMob } from '../data/zones_wild';
import { packBossSpawn, packBossRemove } from './packboss';
import { dgxBegin, dgxEnd, dgxChoose, dgxOnEncounter, dgxOnComplete, dgxInteract, dgxRun, dgxHud, dgxOathMul, dgxExtraIlvl, dgxEnraged, DgxPlace, DgxLong } from './dungeonplus';
import { Diff, DIFF, DIFFS, OathId } from '../data/dungeon_plus';
import { weekKey } from '../data/raid_molten';
/** 1107 长副本两档：heroic = 标准、nightmare = 炼狱（选档面板 / 顶栏 / 进入与通关提示共用） */
const LONG_LG: DgxLong = { label: d => (d === 'nightmare' ? '炼狱' : '标准'), color: d => (d === 'nightmare' ? '#ff4040' : '#ff9040') };
const diffName = (def: PackDungeonDef, d: Diff) => def.long ? LONG_LG.label(d) : DIFF[d].name;
const diffColor = (def: PackDungeonDef, d: Diff) => def.long ? LONG_LG.color(d) : DIFF[d].color;

let CX!: Ctx;
export function bindPackDungeon(c: Ctx) { CX = c; }

export const packDungeons = (): PackDungeonDef[] => packList<PackDungeonDef>('dungeons');
export const packDungeonDef = (id: string): PackDungeonDef | null => packDungeons().find(d => d.id === id) ?? null;
export const isPackDungeon = (id: string) => !!packDungeonDef(id);
/** 某张图是不是内容包小副本的场地 */
export const packDungeonOfMap = (map: string): PackDungeonDef | null => packDungeons().find(d => d.map === map) ?? null;
export function packDungeonLock(id: string): string | null {
  const d = packDungeonDef(id); if (!d) return '没有这个副本';
  return CX.progression.level < d.minLevel ? `需要等级 ${d.minLevel}` : null;
}
const tierOf = (diff: Diff) => Math.max(0, DIFFS.indexOf(diff));

// ---------------------------------------------------------------- 本趟
interface Gate { th: number; left: number; cores: Enemy[]; warned: number }
interface PRun { def: PackDungeonDef; diff: Diff; i: number; t: number; done: boolean; boss: Enemy | null; trash: Enemy[]; gate: Gate | null; gateDone: number[]; wipes: number; deaths: number; dead: boolean;
  log: { i: number; last: boolean; diff: Diff }[] }
let pr: PRun | null = null;

/** 敌人倍率：难度档 × 誓约 */
function muls(def: PackDungeonDef, diff: Diff) {
  const k = def.mul[tierOf(diff)] ?? 1, o = dgxOathMul();
  return { hp: k * o.hp, dmg: k * o.dmg, speed: o.speed, ilvl: (def.ilvl[tierOf(diff)] ?? def.ilvl[0]) + dgxExtraIlvl() };
}
const W = (def: PackDungeonDef, p: { x: number; z: number }) => ({ x: def.origin.x + p.x, z: def.origin.z + p.z });
const DMG_KEYS = new Set(['damage', 'dps', 'attackDamage']);
/** 深拷贝并把伤害类字段乘上倍率（BossBrain 的技能伤害是绝对值） */
function scaleDmg<T>(o: T, k: number): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([a, b]) => [a, DMG_KEYS.has(a) && typeof b === 'number' ? Math.round(b * k) : walk(b)]));
    return v;
  };
  return walk(o) as T;
}
const mobOf = <T extends Record<string, unknown>>(m: T, M: ReturnType<typeof muls>, lv: number, ilvl: number): T =>
  ({ ...m, hp: Math.round((m.hp as number) * M.hp), dmg: Math.round(((m.dmg as number) ?? 50) * M.dmg), speed: ((m.speed as number) ?? 3) * M.speed, level: lv, ilvl });
function typeOf(m: Record<string, unknown> & { name: string; model: string }): EnemyType {
  const w = { hp: 1000, dmg: 50, interval: 2, speed: 3, aggro: 10, range: 2.5, xp: 100, ilvl: 80, level: 40, ...m } as unknown as WildMob;
  return { name: w.name, hp: w.hp, dmg: w.dmg, interval: w.interval, speed: w.speed, aggro: w.aggro, range: w.range, xp: w.xp, ilvl: w.ilvl, model: wildModel(w),
    ranged: w.ranged, onHitDot: w.onHitDot, patrol: 0, level: w.level, elite: w.elite, leash: w.leash, shot: w.shot };
}
function spawnMob(kind: string, t: EnemyType, at: { x: number; z: number }, loot: string): Enemy {
  ENEMY_TYPES[kind] = t;
  const e = new CX.Enemy(kind, t, new THREE.Vector3(at.x, 0, at.z), pr!.def.map as never, 'pdg', 0, loot);
  e.pos.y = CX.groundAt(at.x, at.z);
  CX.enemies.push(e);
  return e;
}
const trashKind = (def: PackDungeonDef, k: string) => `pdg_${def.id}_${k}`;
function spawnTrash() {
  if (!pr) return;
  const { def, diff } = pr, M = muls(def, diff);
  for (const tr of def.trash ?? []) {
    const t = typeOf(mobOf(tr.mob, M, def.syncLevel, M.ilvl - 3));
    for (const p of tr.at) pr.trash.push(spawnMob(trashKind(def, tr.kind), t, W(def, p), (tr.mob.loot as string) ?? 'trash_ember'));
  }
}
function bossDefOf(def: PackDungeonDef, b: PackDungeonBoss, i: number, diff: Diff): PackBossDef {
  const M = muls(def, diff), p = W(def, b);
  const boss = scaleDmg(b.boss, M.dmg);
  boss.config = { ...boss.config, moveSpeed: boss.config.moveSpeed * M.speed };
  const adds: PackBossDef['adds'] = b.adds ? Object.fromEntries(Object.entries(b.adds).map(([k, a]) => [k, mobOf(a, M, def.syncLevel, M.ilvl - 3)])) : undefined;
  return { key: b.key, map: def.map, x: p.x, z: p.z, mob: mobOf(b.mob, M, def.syncLevel, M.ilvl), boss, adds, theme: b.theme, yells: b.yells,
    onDeath: () => onBossDown(i) };
}
function spawnBoss(i: number) {
  if (!pr) return;
  const b = pr.def.bosses[i]; if (!b) return;
  packBossRemove(b.key);
  packBossSpawn(bossDefOf(pr.def, b, i, pr.diff));
  pr.boss = CX.enemies.find(e => e.pboss === b.key) ?? null;
  pr.i = i; pr.gateDone = []; pr.gate = null;
}

/** 入口：选难度面板（英雄起同步到副本自己的等级档） */
export function packDungeonEntry(id: string): boolean {
  const def = packDungeonDef(id); if (!def) return false;
  const lock = packDungeonLock(id);
  if (lock) { CX.toast(`${def.name}：${lock}`, '#f66'); CX.audio.error(); return false; }
  const LG = def.long ? { diffs: ['heroic', 'nightmare'] as Diff[], label: LONG_LG.label, color: LONG_LG.color, lock: (d: Diff) => def.long!.lock?.(d) ?? null, tip: def.long.tip } : undefined;
  dgxChoose(id, def.name, (d, o) => { enterPackDungeon(id, d, LG ? [] : o); }, { sync: def.syncLevel, level: def.minLevel, desc: d => diffDesc(def, d), long: LG });
  return true;
}
export function diffDesc(def: PackDungeonDef, d: Diff): string {
  const t = tierOf(d), k = def.mul[t];
  if (def.long) return d === 'nightmare' ? `炼狱：敌人生命 / 伤害 ×${k} · 每个首领多借一个别的首领的机制 · 首领掉落装等 ${def.ilvl[t]} · 暗金概率更高 · 每周首通：奖励加倍 + 暗金碎片 ×10` : `标准：敌人生命 / 伤害 ×${k} · 首领掉落装等 ${def.ilvl[t]}`;
  const extra = d === 'normal' ? '没有遗物和异变房间' : d === 'heroic' ? `等级同步 ${def.syncLevel} 级 · 有遗物和异变房间` : d === 'epic' ? '可立暗岩誓约' : '本周誓约必带';
  const gate = def.bosses.some(b => b.gate?.diffs.includes(d)) ? ' · 尾王多一道机制门槛' : '';
  return `敌人生命 / 伤害 ×${k} · 首领掉落装等 ${def.ilvl[t]} · ${extra}${gate}`;
}
/** 进入（测试也直接调）：建好场地 → 传送 → 开 dgx 本趟 → 刷小怪和第一个首领 */
export function enterPackDungeon(id: string, diff: Diff = 'heroic', oaths: OathId[] = []): boolean {
  const def = packDungeonDef(id); if (!def) return false;
  const lock = packDungeonLock(id);
  if (lock) { CX.toast(`${def.name}：${lock}`, '#f66'); return false; }
  packDungeonEnd();
  if (!CX.wilds[def.map as never]) CX.ensureWild(def.map as never);
  const at = W(def, def.start);
  if (!CX.goMap(def.map as never, at, '进入') || CX.zone !== def.map) return false;
  const bossAt = (i: number) => W(def, def.bosses[Math.min(i, def.bosses.length - 1)]);
  const place: DgxPlace = { zone: def.map as never, name: def.name, cx: def.origin.x, halfW: 10, synced: false, long: def.long ? { ...LONG_LG, ilvl: (d: Diff) => def.ilvl[tierOf(d)] ?? def.ilvl[0], weeklyLg: (def.long as { weeklyLg?: () => string[] }).weeklyLg } : undefined,
    sync: { level: def.syncLevel, hp: def.syncHp, dmg: def.syncDmg },
    boss: () => pr?.boss ?? null,
    anomalyAt: i => {   // 1107 BUG#8 取地面高度（原 y 固定 0，竖井地形下悬空）；落在深渊 / 高台就沿两首领连线换点
      const a = bossAt(i), b = bossAt(i + 1), ga = CX.groundAt(a.x, a.z), gb = CX.groundAt(b.x, b.z), lo = Math.min(ga, gb) - 1.5, hi = Math.max(ga, gb) + 1.5;
      for (const t of [0.45, 0.35, 0.55, 0.25, 0.65, 0.15]) { const x = a.x + (b.x - a.x) * t + (i % 2 ? -3 : 3), z = a.z + (b.z - a.z) * t, y = CX.groundAt(x, z); if (y >= lo && y <= hi) return new THREE.Vector3(x, y, z); }
      return new THREE.Vector3(a.x, ga, a.z);
    },
    spawnGuard: (i, at) => {
      const tr = (def.trash ?? []).find(t => t.kind === def.guard) ?? def.trash?.[0];
      const M = muls(def, diff), base = tr?.mob ?? { name: '守卫', model: 'golem', hp: def.syncHp, dmg: def.syncDmg };
      const t = typeOf(mobOf({ ...base, name: `诅咒守卫·${base.name}`, elite: true } as typeof base, { ...M, hp: M.hp * 2 }, def.syncLevel, M.ilvl - 2));
      const e = spawnMob(`${trashKind(def, 'guard')}${i}`, t, { x: at.x, z: at.z }, 'trash_ember'); pr?.trash.push(e); return e;
    } };
  dgxBegin(id, diff, oaths, place);
  pr = { def, diff, i: 0, t: 0, done: false, boss: null, trash: [], gate: null, gateDone: [], wipes: 0, deaths: 0, dead: false, log: [] };
  spawnTrash();
  spawnBoss(0);
  CX.toast(`进入：${def.name}（${diffName(def, diff)}）· ${def.bosses.length} 个首领`, diffColor(def, diff));
  dgxHud();
  return true;
}
function clearUnits(list: Enemy[]) {
  for (const e of list) { const k = CX.enemies.indexOf(e); if (k >= 0) { e.dispose(); CX.enemies.splice(k, 1); } if (CX.target === e) CX.target = null; }
  list.length = 0;
}
/** 结束本趟（离开场地 / 重新进入 / 测试） */
export function packDungeonEnd() {
  if (!pr) return;
  for (const b of pr.def.bosses) packBossRemove(b.key);
  clearUnits(pr.trash);
  if (pr.gate) clearUnits(pr.gate.cores);
  pr = null;
  dgxEnd(); dgxHud();
}

function onBossDown(i: number) {
  if (!pr || pr.i !== i) return;
  const { def, diff } = pr, last = i === def.bosses.length - 1, b = def.bosses[i], at = W(def, b);
  if (pr.gate) { clearUnits(pr.gate.cores); pr.gate = null; }
  pr.log.push({ i, last, diff });
  try { def.onBossDown?.(i, last, diff); } catch (err) { console.error('内容包副本 onBossDown 出错', err); }
  if (!last) {
    spawnBoss(i + 1);
    dgxOnEncounter('mid', i);
    CX.toast(`${b.name}倒下了。前方：${def.bosses[i + 1].name}`, '#3f3');
    return;
  }
  pr.done = true; pr.boss = null;
  dgxOnComplete(def.name, pr.t, new THREE.Vector3(at.x, 0, at.z));
  try { def.onComplete?.({ diff, sec: pr.t, week: weekKey(Date.now()) }); } catch (err) { console.error('内容包副本 onComplete 出错', err); }
  CX.toast(`🏆 通关「${def.name}」（${diffName(def, diff)}）！用时 ${Math.floor(pr.t / 60)}分${Math.floor(pr.t % 60)}秒，阵亡 ${pr.deaths} 次 · 在这里或入口离开`, '#ff8000');
  CX.audio.victory();
}

// ---------------------------------------------------------------- 机制门槛：不可破 + 核心
function startGate(b: PackDungeonBoss, th: number) {
  if (!pr || !pr.boss || !b.gate) return;
  const g = b.gate, B = pr.boss, M = muls(pr.def, pr.diff);
  B.hp = Math.min(B.hp, B.maxHp * th);
  B.preDamage = () => 0;   // 不可破
  const t = typeOf({ name: g.core.name, model: g.core.model, hp: Math.round(pr.def.syncHp * g.core.hpK * M.hp), dmg: 0, interval: 99, speed: 0, aggro: 0, range: 0.1, xp: 0, ilvl: 1,
    level: pr.def.syncLevel, elite: true, tint: g.core.tint, tintK: g.core.tint ? 0.6 : undefined, scale: g.core.scale ?? 0.7 });
  const cores: Enemy[] = [];
  for (let k = 0; k < g.core.n; k++) {
    const a = k / g.core.n * Math.PI * 2 + 0.4;
    const e = spawnMob(`pdg_core_${b.key}`, t, { x: B.pos.x + Math.cos(a) * g.core.r, z: B.pos.z + Math.sin(a) * g.core.r }, 'wb_add');
    e.wbAdd = true; e.ccImmune = true; cores.push(e);
  }
  pr.gate = { th, left: g.time, cores, warned: Math.ceil(g.time) };
  CX.yell(`${b.name}：${g.name}！${g.tip}（${g.time} 秒）`, '#ff5040', 4);
  CX.audio.roar();
}
function endGate(ok: boolean) {
  if (!pr?.gate) return;
  const B = pr.boss;
  if (ok) pr.gateDone.push(pr.gate.th);
  clearUnits(pr.gate.cores);
  pr.gate = null;
  if (B) B.preDamage = undefined;
  if (ok) { CX.yell('核心全部击碎——首领的护壳裂开了！', '#3f3', 2.5); CX.audio.interrupt(); }
}
function gateTick(dt: number) {
  if (!pr || !pr.boss || !pr.boss.alive || pr.done) return;
  const b = pr.def.bosses[pr.i], g = b?.gate;
  if (!g || !g.diffs.includes(pr.diff)) return;
  if (!pr.gate) {
    const f = pr.boss.hp / pr.boss.maxHp, th = g.at.find(x => f <= x && !pr!.gateDone.includes(x));
    if (th !== undefined) startGate(b, th);
    return;
  }
  const G = pr.gate;
  if (G.cores.every(c => !c.alive)) { endGate(true); return; }
  G.left -= dt;
  if (Math.ceil(G.left) < G.warned && Math.ceil(G.left) % 5 === 0 && G.left > 0) { G.warned = Math.ceil(G.left); CX.toast(`${g.name}：还剩 ${G.warned} 秒，打碎${g.core.name}！`, '#ff8040'); }
  if (G.left <= 0) {
    // 团灭技：机制没完成，硬吃过不去
    pr.wipes++;
    const P = CX.player;
    CX.yell(`${g.name}落下了——没有打碎全部${g.core.name}`, '#ff2020', 3);
    CX.feel.kick(0.6);
    if (P.alive) CX.fx.dealDamage(P, P.maxHp * 50, 'fire', pr.boss);
    G.left = g.time; G.warned = Math.ceil(g.time);   // 活下来（无敌帧）= 门槛重新计时，核心还在
  }
}

// ---------------------------------------------------------------- 每帧
export function packDungeonUpdate(dt: number) {
  if (!CX) return;
  if (!pr) {
    // 读档 / 传送落在副本场地但没有本趟：送回门口（进度不保留）
    const d = packDungeonOfMap(String(CX.zone));
    if (d && CX.player.alive) { CX.toast(`${d.name}：副本进度不保留，回到门口`, '#ff9a40'); CX.goMap(d.exit.map as never, { x: d.exit.x, z: d.exit.z }, '离开'); }
    return;
  }
  if (CX.zone !== pr.def.map) { packDungeonEnd(); return; }
  const P = CX.player;
  if (!P.alive && !pr.dead) {
    pr.dead = true; pr.deaths++;
    // 团灭 / 阵亡：门槛和首领回到初始（首领回满血，已过的门槛重新来）
    if (pr.gate) endGate(false);
    if (pr.boss?.alive) { pr.boss.hp = pr.boss.maxHp; pr.gateDone = []; }
  } else if (P.alive) pr.dead = false;
  if (!pr.done) pr.t += dt;
  if (pr.boss) pr.boss.outMul = dgxEnraged() ? 2 : 1;
  gateTick(dt);
}

/** 交互：异变房间 / 通关后离开 */
export function packDungeonInteract(): { label: string; act: () => void; pos: THREE.Vector3 } | null {
  if (!pr || CX.zone !== pr.def.map) return null;
  const dx = dgxInteract(); if (dx) return dx;
  if (pr.done) {
    const last = pr.def.bosses[pr.def.bosses.length - 1], p = W(pr.def, last), v = new THREE.Vector3(p.x, 0, p.z);
    if (CX.dist2d(v, CX.player.pos) < 6) { const d = pr.def; return { label: '离开副本（回到门口）', act: () => { CX.goMap(d.exit.map as never, { x: d.exit.x, z: d.exit.z }, '离开'); }, pos: v }; }
  }
  return null;
}
/** 当前所在的内容包小副本 id（副本地图 M 键用） */
export const packDungeonHere = (): string | null => pr && CX.zone === pr.def.map ? pr.def.id : null;
/** 副本地图：已击败的首领 */
export const packDungeonDead = (id: string): boolean[] => { const d = packDungeonDef(id); return d ? d.bosses.map((_, i) => !!pr && pr.def.id === id && (pr.done || i < pr.i)) : []; };
/** 首领装等档（副本地图掉落列表） */
export const packDungeonIlvl = (id: string, diff: string): number => { const d = packDungeonDef(id); return d ? d.ilvl[Math.max(0, DIFFS.indexOf(diff as Diff))] : 0; };

/** 测试 / 调试 */
export function packDungeonState() {
  if (!pr) return null;
  const B = pr.boss;
  return { id: pr.def.id, diff: pr.diff, i: pr.i, t: pr.t, done: pr.done, wipes: pr.wipes, deaths: pr.deaths, mul: muls(pr.def, pr.diff), dgx: dgxRun()?.diff ?? null,
    boss: B ? { key: B.pboss, name: B.name, hp: B.hp, maxHp: B.maxHp, dmg: B.type.dmg, level: B.type.level, ilvl: B.type.ilvl, alive: B.alive, invuln: !!B.preDamage, outMul: B.outMul ?? 1 } : null,
    trash: pr.trash.filter(e => e.alive).map(e => ({ kind: e.kind, hp: e.maxHp, dmg: e.type.dmg, level: e.type.level, ilvl: e.type.ilvl })),
    gate: pr.gate ? { th: pr.gate.th, left: pr.gate.left, cores: pr.gate.cores.filter(c => c.alive).length } : null, gateDone: [...pr.gateDone], log: pr.log.map(x => ({ ...x })) };
}
/** 测试用：当前首领 / 门槛核心 */
export const packDungeonUnits = () => ({ boss: pr?.boss ?? null, cores: pr?.gate?.cores ?? [], trash: pr?.trash ?? [] });
