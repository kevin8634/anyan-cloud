// ========== v0.9.3e 野外探索：疾行 / 瞭望塔 / 采集点 / 宝箱与隐藏宝箱 ==========
// 方案：docs/设计/野外地图.md 第 5 节 1~4
//   疾行：野外脱战（3 秒没受伤、没出手、附近没有在追你的怪）自动移速 +35%，受击 / 出手立即取消
//   瞭望塔：每张野外图 2 座（星落 / 赤砂 / 霜脊 / 烬落取前两座缓丘顶，翠风用风蚀高台上那座），登塔 = 揭开本图的采集点 / 宝箱 / 稀有首领刷新点标记 + 开通本图所有营地传送阵 + 少量经验
//   采集点：每图 9 个（矿石 / 草药 / 晶簇 各 3），5 分钟刷新；矿石 → 魔尘、草药 → 小治疗药水、晶簇 → 星辉碎片
//   宝箱：每图 3 个普通箱（开过 20 分钟后刷新，真实时间）+ 1 个隐藏箱（每周一次，翠风的在隐蔽洞穴）；开过的箱子计入图鉴
// 点位在地图第一次生成时按确定性随机摆（沿路 5~14 米、避开怪群 / 营地 / 门，用寻路网格找空地），浏览器和测试一致
import * as THREE from 'three';
import { makeArchWaypoint, WP_ARCH_OFF } from './waypoint3d';
import type { Ctx } from './main';
import * as M from './models';
import { makeChest } from './fieldx';
import { WILD, FULL_WILD_IDS, isWildId } from '../data/zones_wild';
import { FIELD_ORIGIN, FIELD_PATHS, FIELD_SPOTS } from '../data/zone_field';
import type { LootTable } from '../core/Loot';
import { mapStats } from './mappoi';
import { repAdd, REP_GAIN } from './regional';
import { fogGrid, fogSetWalk, fogReveal, fogHas, fogNewMilestones, fogSave, fogLoad, fogPct, FOG_R, type FogSave } from './fog';

let CX!: Ctx;
export type ExMap = 'field' | 'star' | 'redsand' | 'frost' | 'ember';
export const EX_MAPS: ExMap[] = ['field', ...FULL_WILD_IDS as ExMap[]];   // v0.9.2b 副本区不做探索物件
export const isExMap = (m: string): m is ExMap => (EX_MAPS as string[]).includes(m);
export type NodeKind = 'ore' | 'herb' | 'crystal';
export const NODE_NAME: Record<NodeKind, string> = { ore: '矿脉', herb: '草药', crystal: '晶簇' };
export const SPRINT = { delay: 3, mul: 1.35 } as const;
export const NODE_RESPAWN = 300, CHEST_RESPAWN_MIN = 20;

interface Site { id: string; map: ExMap; x: number; z: number; obj: THREE.Object3D | null }
interface Node extends Site { kind: NodeKind; readyAt: number }
interface Chest extends Site { hidden: boolean }
interface Tower extends Site { name: string }
interface Stone extends Site { name: string }   // v0.9.5a 路边传送石
const sites: Record<string, { towers: Tower[]; nodes: Node[]; chests: Chest[]; stones: Stone[] }> = {};

/** 存档（可选字段 ex） */
export interface WsRec { map: ExMap; name: string; x: number; z: number }
export interface ExSave { towers: string[]; chests: Record<string, number>; hidden: Record<string, string>; opened: string[]; gathered: number; /** v0.9.5a 已激活的传送石（世界坐标，没生成过的地图也能传） */ ws?: Record<string, WsRec>; fog?: FogSave }
const st: ExSave & { ws: Record<string, WsRec> } = { towers: [], chests: {}, hidden: {}, opened: [], gathered: 0, ws: {} };
export const exClock = { now: () => Date.now() };
const now = () => exClock.now();
/** 周编号（周一开始）：隐藏宝箱每周一次 */
export function weekKey(t = now()) { const d = new Date(t); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export function exSave(): ExSave { return { towers: [...st.towers], chests: { ...st.chests }, hidden: { ...st.hidden }, opened: [...st.opened], gathered: st.gathered, ws: JSON.parse(JSON.stringify(st.ws)), fog: fogSave() }; }
export function exLoad(s?: Partial<ExSave>) {
  st.towers = [...(s?.towers ?? [])]; st.chests = { ...(s?.chests ?? {}) }; st.hidden = { ...(s?.hidden ?? {}) }; st.opened = [...(s?.opened ?? [])]; st.gathered = s?.gathered ?? 0;
  st.ws = JSON.parse(JSON.stringify(s?.ws ?? {})); fogLoad(s?.fog);
  for (const m of Object.values(sites)) { m.chests.forEach(syncChest); m.stones.forEach(syncStone); }
  for (const m of EX_MAPS) if (fogHas(m)) fogMigrate(m);
}

const origin = (m: ExMap) => m === 'field' ? FIELD_ORIGIN : WILD[m].origin;
const levelOf = (m: ExMap) => m === 'field' ? 16 : WILD[m].levels[1];
const mapName = (m: ExMap) => m === 'field' ? '翠风原野' : WILD[m].name;

// ---------------------------------------------------------------- 点位
function rngFor(m: ExMap) { let seed = 7919 + EX_MAPS.indexOf(m) * 104729; return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function layout(m: ExMap) {
  if (sites[m]) return sites[m];
  const O = origin(m), nav = CX.navFor(m), rnd = rngFor(m);
  const paths = (m === 'field' ? FIELD_PATHS : WILD[m].paths) as [number, number][][];
  const camps = m === 'field' ? [{ x: FIELD_SPOTS.outpost.x, z: FIELD_SPOTS.outpost.z }] : WILD[m].camps;
  const gates = m === 'field' ? [FIELD_SPOTS.portal, { x: 66, z: 4 }, { x: 114, z: -30 }] : WILD[m].gates;
  const mobs = CX.enemies.filter(e => e.z === m).map(e => ({ x: e.spawn.x - O.x, z: e.spawn.z - O.z }));
  const taken: { x: number; z: number }[] = [];
  const half = m === 'field' ? 120 : WILD[m].half;
  const ok = (x: number, z: number, gap: number) => Math.abs(x) < half - 6 && Math.abs(z) < half - 6
    && camps.every(c => Math.hypot(x - c.x, z - c.z) > 22) && gates.every(g => Math.hypot(x - g.x, z - g.z) > 10)
    && mobs.every(p => Math.hypot(x - p.x, z - p.z) > 9) && taken.every(p => Math.hypot(x - p.x, z - p.z) > gap);
  const pick = (dMin: number, dMax: number, gap: number, edge = false, extra?: (x: number, z: number) => boolean) => {
    for (let k = 0; k < 400; k++) {
      const pl = paths[Math.floor(rnd() * paths.length)]; const i = Math.floor(rnd() * (pl.length - 1)); const a = pl[i], b = pl[i + 1];
      const t = rnd(), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, off = (dMin + rnd() * (dMax - dMin)) * (rnd() < 0.5 ? -1 : 1);
      let x = a[0] + (b[0] - a[0]) * t - uz * off, z = a[1] + (b[1] - a[1]) * t + ux * off;
      if (edge && Math.max(Math.abs(x), Math.abs(z)) < half * 0.62) continue;
      const f = nav.nearestFree(O.x + x, O.z + z, 3); if (!f) continue;
      x = f.x - O.x; z = f.z - O.z;
      if (!ok(x, z, gap)) continue;
      if (extra && !extra(x, z)) continue;
      if (!nav.findPath(O.x + camps[0].x, O.z + camps[0].z + 4, f.x, f.z)) continue;   // 从营地走得到
      taken.push({ x, z }); return { x, z };
    }
    return null;
  };
  // 瞭望塔
  const towers: Tower[] = [];
  if (m === 'field') towers.push({ id: 'field:t0', map: m, x: FIELD_SPOTS.mesa.x - 7, z: FIELD_SPOTS.mesa.z - 7, name: '风蚀高台瞭望塔', obj: null });
  else {
    const hills = (WILD[m].rises ?? []).filter(r => r.kind !== 'mesa').slice(0, 2);
    hills.forEach((r, i) => { towers.push({ id: `${m}:t${i}`, map: m, x: r.x, z: r.z, name: `${WILD[m].name}瞭望塔 ${i + 1}`, obj: null }); taken.push({ x: r.x, z: r.z }); });
  }
  // 采集点
  const nodes: Node[] = [];
  (['ore', 'herb', 'crystal', 'ore', 'herb', 'crystal', 'ore', 'herb', 'crystal'] as NodeKind[]).forEach((kind, i) => { const p = pick(5, 12, 16); if (p) nodes.push({ id: `${m}:n${i}`, map: m, kind, ...p, readyAt: 0, obj: null }); });
  // 宝箱
  const chests: Chest[] = [];
  for (let i = 0; i < 3; i++) { const p = pick(7, 14, 24); if (p) chests.push({ id: `${m}:c${i}`, map: m, ...p, hidden: false, obj: null }); }
  const hp = m === 'field' ? { x: FIELD_SPOTS.cave.x + 1.5, z: FIELD_SPOTS.cave.z } : pick(10, 18, 30, true);
  if (hp) chests.push({ id: `${m}:h`, map: m, ...hp, hidden: true, obj: null });
  // v0.9.5a 路边传送石：每图 2 块，贴着路（3~5 米），离营地 45 米以上、两块之间 60 米以上（在所有旧点位之后摆，不影响旧点位的随机序列）
  const stones: Stone[] = [];
  const spotName = (x: number, z: number) => {
    if (m === 'field') return null;
    let best: string | null = null, bd = 40;
    for (const [k, sp] of Object.entries(WILD[m].spots)) { if (/_(altar|core|top)$|route$|outpost$/.test(k)) continue; const d = Math.hypot(sp.x - x, sp.z - z); if (d < bd) { bd = d; best = sp.name; } }
    return best;
  };
  for (let i = 0; i < 2; i++) {
    const p = pick(3, 5, 12, false, (x, z) => camps.every(c => Math.hypot(x - c.x, z - c.z) > 45) && stones.every(q => Math.hypot(x - q.x, z - q.z) > 60) && towers.every(t => Math.hypot(x - t.x, z - t.z) > 16));
    if (p) { const near = spotName(p.x, p.z); stones.push({ id: `ws:${m}:${i}`, map: m, ...p, name: near ? `${near}传送石` : `${mapName(m)}传送石 ${i + 1}`, obj: null }); }
  }
  sites[m] = { towers, nodes, chests, stones };
  return sites[m];
}

// ---------------------------------------------------------------- 模型
function nodeMesh(kind: NodeKind) {
  const g = new THREE.Group();
  if (kind === 'ore') { for (let i = 0; i < 3; i++) { const r = M.makeRock(0.5 + i * 0.15, 0x6a6058); r.position.set((i - 1) * 0.45, 0.2, (i % 2) * 0.3); g.add(r); } const c = M.makeCrystal(0xffb060, 0.25); c.position.set(0.1, 0.35, 0); g.add(c); }
  else if (kind === 'herb') { g.add(M.makeMushrooms(0x9aff6a, 5)); }
  else { for (let i = 0; i < 3; i++) { const c = M.makeCrystal(0x9ad0ff, 0.35 + i * 0.12); c.position.set((i - 1) * 0.35, 0, (i % 2) * 0.25); c.rotation.z = (i - 1) * 0.3; g.add(c); } }
  return g;
}
/** 地图生成后调用（ensureWild / 进入原野）：摆点、放模型 */
export function exBuild(m: string) {
  if (!isExMap(m)) return;
  const s = layout(m as ExMap), O = origin(m as ExMap);
  const put = (o: THREE.Object3D, x: number, z: number) => { o.position.set(O.x + x, CX.groundAt(O.x + x, O.z + z), O.z + z); o.userData.exMap = m; CX.scene.add(o); return o; };
  for (const t of s.towers) if (!t.obj && m !== 'field') { t.obj = put(M.makeWatchtower(), t.x, t.z); }
  for (const n of s.nodes) if (!n.obj) n.obj = put(nodeMesh(n.kind), n.x, n.z);
  for (const c of s.chests) if (!c.obj && !(m === 'field' && c.hidden)) { c.obj = put(makeChest(), c.x, c.z); c.obj.rotation.y = Math.random() * 6; }
  for (const w of s.stones) if (!w.obj) { w.obj = put(makeWaystone(), w.x, w.z); w.obj.rotation.y = Math.atan2(-w.x, -w.z); }
  s.chests.forEach(syncChest); s.stones.forEach(syncStone);
  // v0.9.5a 迷雾网格
  if (!fogHas(m)) { const half = m === 'field' ? 120 : WILD[m as ExMap & keyof typeof WILD].half; fogGrid(m, O.x, O.z, half); const nav = CX.navFor(m); fogSetWalk(m, (x, z) => nav.inBounds(x, z) && nav.isFree(x, z)); fogMigrate(m as ExMap); }
  exShow();
}
/** 老存档 / 读档：已登的塔、已开通的营地、已激活的传送石周围直接点亮 */
function fogMigrate(m: ExMap) {
  const s = sites[m], O = origin(m);
  if (s) for (const t of s.towers) if (st.towers.includes(t.id)) fogReveal(m, O.x + t.x, O.z + t.z, FOG_R.tower);
  if (m === 'field') fogReveal(m, O.x + FIELD_SPOTS.outpost.x, O.z + FIELD_SPOTS.outpost.z, FOG_R.camp);
  else for (const c of WILD[m].camps) if (CX.waypoints.has(c.id) || c.main) fogReveal(m, O.x + c.x, O.z + c.z, FOG_R.camp);
  for (const w of Object.values(st.ws)) if (w.map === m) fogReveal(m, w.x, w.z, FOG_R.stone);
  fogNewMilestones(m);   // 老存档一次性跨过的里程碑不补发奖励
}
/** 传送石模型：带符文的方尖石 + 底座，激活后符文和顶上的晶石发青光 */
function makeWaystone() {
  // 11-18 Rhett 选概念图 B，且只换野外传送石（营地传送阵不动）：石拱悬晶，缩到 0.7 倍放路边；激活后亮青色地环（?off=wparch 回方尖石）
  if (!WP_ARCH_OFF) {
    const g = new THREE.Group(), a = makeArchWaypoint(); a.scale.setScalar(0.7); g.add(a);
    const ring = M.makeRing(0x40e0d0, 0.85); ring.scale.setScalar(2.2); ring.position.y = 0.12; ring.visible = false; g.add(ring);
    g.userData.ws = { rune: new THREE.MeshBasicMaterial(), gem: new THREE.Mesh(undefined, new THREE.MeshBasicMaterial()), ring };
    return g;
  }
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x8a8478 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 6), stone); base.position.y = 0.17; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 2.6, 4), stone); pil.position.y = 1.6; pil.rotation.y = Math.PI / 4; pil.castShadow = true; g.add(pil);
  const rune = new THREE.MeshBasicMaterial({ color: 0x556070 });
  for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.4), rune); const a = k * Math.PI / 2; r.position.set(Math.sin(a) * 0.3, 1.55, Math.cos(a) * 0.3); r.rotation.y = a; r.rotation.x = -0.1; g.add(r); }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0x6a7a88 })); gem.position.y = 3.25; g.add(gem);
  const ring = M.makeRing(0x40e0d0, 0.85); ring.scale.setScalar(1.6); ring.position.y = 0.37; ring.visible = false; g.add(ring);
  g.userData.ws = { rune, gem, ring };
  return g;
}
function syncStone(w: Stone) {
  if (!w.obj) return;
  const on = !!st.ws[w.id], u = w.obj.userData.ws as { rune: THREE.MeshBasicMaterial; gem: THREE.Mesh; ring: THREE.Object3D };
  if (u.ring.visible === on) return;
  u.rune.color.setHex(on ? 0x5ff0e0 : 0x556070); (u.gem.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xa0fff4 : 0x6a7a88); u.ring.visible = on;
}
/** 只显示当前地图的探索物件 */
export function exShow() {
  for (const m of Object.values(sites)) for (const o of [...m.towers, ...m.nodes, ...m.chests, ...m.stones]) {
    if (!o.obj) continue;
    o.obj.visible = o.map === CX.zone && (!('readyAt' in o) || (o as Node).readyAt <= CX.T) && (!('hidden' in o) || chestReady(o as Chest));
    if (o.map === CX.zone) o.obj.position.y = CX.groundAt(o.obj.position.x, o.obj.position.z);   // 高度图按当前地图算：进图时贴地
  }
}
const chestReady = (c: Chest) => c.hidden ? st.hidden[c.id] !== weekKey() : (st.chests[c.id] ?? 0) <= now();
function syncChest(c: Chest) { if (c.obj) c.obj.visible = c.map === CX?.zone && chestReady(c); }

// ---------------------------------------------------------------- 疾行
let lastCast = -99, sprintOn = false, combatCache = false, cacheT = -1;
export function exNoteCast() { lastCast = CX.T; }
function inCombat() { if (cacheT !== CX.T) { cacheT = CX.T; combatCache = CX.enemies.some(e => e.alive && e.z === CX.zone && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack')); } return combatCache; }
/** 移速倍率（main.updatePlayer 乘上去） */
export function sprintMul() {
  const outdoor = isExMap(CX.zone);
  const on = outdoor && CX.T - CX.player.lastHurt > SPRINT.delay && CX.T - lastCast > SPRINT.delay && !inCombat() && CX.player.alive;
  if (on !== sprintOn) { sprintOn = on; const el = sprintEl(); if (el) el.style.display = on ? 'block' : 'none'; }
  return on ? SPRINT.mul : 1;
}
export const isSprinting = () => sprintOn;
let spEl: HTMLDivElement | null = null;
function sprintEl() {
  if (!spEl && typeof document !== 'undefined') {
    spEl = document.createElement('div'); spEl.id = 'sprint-tag';
    spEl.style.cssText = 'position:fixed;left:50%;bottom:132px;transform:translateX(-50%);z-index:30;font:600 12px/1 sans-serif;color:#bfe8ff;text-shadow:0 1px 2px #000;pointer-events:none;display:none;letter-spacing:1px';
    spEl.textContent = '» 疾行 +35% »'; document.body.appendChild(spEl);
  }
  return spEl;
}

// ---------------------------------------------------------------- 交互
const CHEST_LOOT: LootTable = { id: 'chest', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'blue' }, { kind: 'random', chance: 0.4 }], stacks: [{ id: 'mat_dust', chance: 1, min: 2, max: 3 }] };
const HIDDEN_LOOT: LootTable = { id: 'chest_hidden', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 0.15, minQuality: 'orange' }], stacks: [{ id: 'mat_shard', chance: 1, min: 2, max: 2 }, { id: 'mat_essence', chance: 1, min: 1, max: 1 }] };
export function exInteract(): { label: string; act: () => void; pos: THREE.Vector3 } | null {
  const m = CX.zone; if (!isExMap(m)) return null;
  const s = sites[m]; if (!s) return null;
  const O = origin(m as ExMap), P = CX.player.pos;
  const near = (x: number, z: number, r: number) => Math.hypot(P.x - O.x - x, P.z - O.z - z) < r;
  const at = (x: number, z: number) => new THREE.Vector3(O.x + x, CX.groundAt(O.x + x, O.z + z), O.z + z);
  for (const t of s.towers) if (near(t.x, t.z, 3.6)) return st.towers.includes(t.id) ? null : { label: `登上${t.name}（揭开本图的采集点 / 宝箱 / 稀有首领刷新点）`, act: () => climb(t), pos: at(t.x, t.z) };
  for (const w of s.stones) if (near(w.x, w.z, 2.8)) return st.ws[w.id] ? { label: `${w.name}：传送`, act: () => CX.openWaypoints(), pos: at(w.x, w.z) } : { label: `激活${w.name}（之后可以从任何传送阵传过来）`, act: () => activateStone(w), pos: at(w.x, w.z) };
  for (const c of s.chests) if (chestReady(c) && near(c.x, c.z, 2.4)) return { label: c.hidden ? '打开隐藏宝箱（每周一次）' : '打开宝箱', act: () => openChest(c), pos: at(c.x, c.z) };
  for (const n of s.nodes) if (n.readyAt <= CX.T && near(n.x, n.z, 2.2)) return { label: `采集：${NODE_NAME[n.kind]}`, act: () => gather(n), pos: at(n.x, n.z) };
  return null;
}
function activateStone(w: Stone) {
  if (st.ws[w.id]) return;
  const O = origin(w.map);
  st.ws[w.id] = { map: w.map, name: w.name, x: O.x + w.x, z: O.z + w.z };
  syncStone(w); fogReveal(w.map, O.x + w.x, O.z + w.z, FOG_R.stone);
  CX.particles.emit({ x: O.x + w.x, y: 1.5, z: O.z + w.z }, { count: 36, color: 0x5ff0e0, color2: 0xffffff, speed: 2, up: 3, life: 1, size: 0.3 });
  CX.toast(`传送石已激活：${w.name}`, '#5ff0e0'); CX.audio.questAccept(); CX.save();
}
/** 已激活的传送石（传送阵面板用）：世界坐标 */
export function exWaystones(): (WsRec & { id: string })[] {
  return Object.entries(st.ws).map(([id, w]) => ({ id, ...w })).sort((a, b) => EX_MAPS.indexOf(a.map) - EX_MAPS.indexOf(b.map));
}
/** 每张野外图的传送石总数（没生成过的图按 2 块算） */
export const exWaystoneTotal = (m: ExMap) => sites[m]?.stones.length ?? 2;
function climb(t: Tower) {
  if (st.towers.includes(t.id)) return;
  st.towers.push(t.id);
  const m = t.map;
  if (isWildId(m)) for (const c of WILD[m].camps) if (!CX.waypoints.has(c.id)) { CX.waypoints.add(c.id); CX.toast(`传送阵已开通：${c.name}`, '#7fd7ff'); }
  // 稀有首领刷新点全部标上地图（和 mappoi 的「发现」同一份记录）
  const rare = m === 'field' ? null : WILD[m].rare;
  if (rare) rare.spots.forEach((_s, i) => { const k = `${m}:${rare.kind}:${i}`; if (!mapStats.rareSeen.includes(k)) mapStats.rareSeen.push(k); });
  if (m === 'field') [0, 1, 2].forEach(i => { const k = `field:goldboar:${i}`; if (!mapStats.rareSeen.includes(k)) mapStats.rareSeen.push(k); });
  CX.addXp(levelOf(m) * 20);
  repAdd(m, REP_GAIN.tower, '登塔');
  { const O = origin(m); fogReveal(m, O.x + t.x, O.z + t.z, FOG_R.tower); fogReward(m); }
  CX.yell(`站在${t.name}上，${mapName(m)}尽收眼底。`, '#bfe8ff', 3);
  CX.toast('地图上标出了本区域的采集点、宝箱和稀有首领刷新点', '#7fd7ff');
  CX.audio.questAccept(); CX.save();
}
function openChest(c: Chest) {
  if (!chestReady(c)) return;
  const m = c.map, lv = levelOf(m), O = origin(m);
  const r = CX.gen.roll(c.hidden ? HIDDEN_LOOT : CHEST_LOOT, lv + (c.hidden ? 3 : 1));
  const gold = Math.round(lv * (c.hidden ? 12 : 5) * (0.8 + Math.random() * 0.4));
  const pos = new THREE.Vector3(O.x + c.x, 0, O.z + c.z);
  [...r.items, gold].forEach((l, i, a) => CX.spawnLoot(l, pos, i, a.length));
  r.stacks.forEach(x => { CX.inventory.addStack(x.id, x.count); CX.toast(`获得 ${CX.forge.stackDef(x.id)?.name ?? x.id} ×${x.count}`, '#7fd7ff'); });
  if (c.hidden) st.hidden[c.id] = weekKey(); else st.chests[c.id] = now() + CHEST_RESPAWN_MIN * 60000;
  const first = !st.opened.includes(c.id); if (first) st.opened.push(c.id);
  CX.particles.emit({ x: pos.x, y: 0.6, z: pos.z }, { count: 40, color: 0xffd34d, color2: 0xffffff, speed: 2.5, up: 2.5, life: 0.9, size: 0.3 });
  CX.audio.questDone();
  CX.toast(`${c.hidden ? '隐藏宝箱' : '宝箱'}已打开${first ? `（图鉴：宝箱 ${st.opened.length}/${totalChests()}）` : ''}`, '#ffd34d');
  repAdd(m, REP_GAIN.chest, '宝箱');
  syncChest(c); CX.save();
}
function gather(n: Node) {
  if (n.readyAt > CX.T) return;
  n.readyAt = CX.T + NODE_RESPAWN; if (n.obj) n.obj.visible = false;
  st.gathered++;
  const add = (id: string, k: number) => { if (k <= 0) return; CX.inventory.addStack(id, k); CX.toast(`获得 ${CX.forge.stackDef(id)?.name ?? id} ×${k}`, '#7fd7ff'); };
  if (n.kind === 'ore') { add('mat_dust', 1 + (Math.random() < 0.5 ? 1 : 0)); if (Math.random() < 0.15) add('mat_shard', 1); }
  else if (n.kind === 'herb') add('potion_s', 1);
  else { add('mat_shard', 1); if (Math.random() < 0.1) add('mat_essence', 1); }
  CX.addXp(levelOf(n.map) * 4);
  const O = origin(n.map);
  CX.particles.emit({ x: O.x + n.x, y: 0.5, z: O.z + n.z }, { count: 20, color: n.kind === 'herb' ? 0x9aff6a : n.kind === 'ore' ? 0xffb060 : 0x9ad0ff, color2: 0xffffff, speed: 1.5, up: 2, life: 0.7, size: 0.25 });
  CX.audio.coin();
}
/** 每帧：采集点刷新显示 */
let tick = 0;
export function exUpdate(dt: number) {
  if ((tick += dt) < 1) return; tick = 0;
  if (isExMap(CX.zone) && fogHas(CX.zone) && CX.player.alive) { if (fogReveal(CX.zone, CX.player.pos.x, CX.player.pos.z, FOG_R.walk)) fogReward(CX.zone as ExMap); }
  const s = sites[CX.zone]; if (!s) return;
  for (const n of s.nodes) if (n.obj && !n.obj.visible && n.readyAt <= CX.T) n.obj.visible = true;
  s.chests.forEach(syncChest);
}
const totalChests = () => EX_MAPS.length * 4;
/** v0.9.5a 探索度里程碑：经验 + 声望 */
function fogReward(m: ExMap) {
  for (const k of fogNewMilestones(m)) {
    CX.addXp(levelOf(m) * (k >= 95 ? 60 : 25));
    repAdd(m, k >= 95 ? REP_GAIN.tower * 2 : REP_GAIN.chest * 2, `探索 ${k}%`);
    CX.toast(`${mapName(m)} 探索度 ${k}%${k >= 95 ? ' · 地图全开！' : ''}`, '#bfe8ff'); CX.audio.questDone();
  }
}
export const exFogPct = (m: string) => fogPct(m);

/** 地图兴趣点：瞭望塔一直显示；宝箱登塔后才显示 */
export function exPois(m: string) {
  const s = sites[m]; if (!s) return [];
  const O = origin(m as ExMap);
  const seen = s.towers.some(t => st.towers.includes(t.id));
  const out: { kind: 'tower' | 'chest' | 'waystone'; name: string; x: number; z: number; sub?: string; state?: string; live?: boolean; dim?: boolean; key?: string }[] = [];
  for (const t of s.towers) out.push({ kind: 'tower', name: t.name, x: O.x + t.x, z: O.z + t.z, sub: st.towers.includes(t.id) ? '已登顶' : '登顶后揭开本图的采集点、宝箱和稀有首领刷新点', key: t.id, dim: !st.towers.includes(t.id) });
  for (const w of s.stones) out.push({ kind: 'waystone', name: w.name, x: O.x + w.x, z: O.z + w.z, sub: st.ws[w.id] ? '已激活 · 任何传送阵都能传过来' : '走过去激活', key: w.id, dim: !st.ws[w.id] });
  if (seen) for (const c of s.chests) out.push({ kind: 'chest', name: c.hidden ? '隐藏宝箱' : '宝箱', x: O.x + c.x, z: O.z + c.z, sub: c.hidden ? '每周一次' : `打开后 ${CHEST_RESPAWN_MIN} 分钟刷新`, state: chestReady(c) ? '可以打开' : c.hidden ? '本周已开' : `${Math.ceil(((st.chests[c.id] ?? 0) - now()) / 60000)} 分钟后刷新`, live: chestReady(c), key: c.id });
  return out;
}

/** 测试 / 调试 */
export function exDebug(m?: string) {
  const id = m ?? CX.zone, s = sites[id];
  return { sprint: sprintOn, towers: s?.towers.map(t => ({ id: t.id, x: origin(id as ExMap).x + t.x, z: origin(id as ExMap).z + t.z, done: st.towers.includes(t.id) })) ?? [],
    nodes: s?.nodes.map(n => ({ id: n.id, kind: n.kind, x: origin(id as ExMap).x + n.x, z: origin(id as ExMap).z + n.z, ready: n.readyAt <= CX.T })) ?? [],
    chests: s?.chests.map(c => ({ id: c.id, hidden: c.hidden, x: origin(id as ExMap).x + c.x, z: origin(id as ExMap).z + c.z, ready: chestReady(c) })) ?? [],
    stones: s?.stones.map(w => ({ id: w.id, name: w.name, x: origin(id as ExMap).x + w.x, z: origin(id as ExMap).z + w.z, on: !!st.ws[w.id] })) ?? [], fog: fogPct(id), save: exSave() };
}
export const exState = st;

export function bindExplore(c: Ctx) { CX = c; }
