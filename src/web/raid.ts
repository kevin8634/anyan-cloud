// 阶段六（v0.6.0）：满级单人长副本 —— 场景、精英小怪机制、5 个首领脚本、存档点、攻略面板
// 独立模块：main.ts 只在 clampToZone / setZoneLook / 复活 / 存档 / 音乐 / 交互几处挂钩（搜索 raid）。
// 首领机制不走 BossBrain：每个首领一段脚本（RaidBoss.tick），红圈/熔岩区复用 enemies.ts 的 telegraphs / poisonZones
// 显示（机器人和玩家看到的是同一套预警），伤害结算在这里。
import { achNoteBoss } from './codex_ui';
import { spiritOnKill } from './spirit_ui';
import { awakenBossKill } from './awaken_ui';
import * as THREE from 'three';
import { CombatUnit, Pos } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { Element } from '../core/types';
import * as M from './models';
import * as G from './gfx';
import * as BFX from './bossfx';
import { prewarmFlush, perfMark } from './prewarm';
import { makeLightPool, DUNG_POOL_OFF, LightPool } from './dung_lightpool';
import { DUNGEON_SCALE, dgL, dgFixScaled } from './dgscale';   // 11-18 副本 ×1.5（?off=dgscale）：路线 / 房间 / 首领场地数据仍是设计坐标，世界 = 原点 + 设计 × S   // 11-18 B1 副本灯池（?off=dunglightpool）
import { flameDevelop } from './fire_develop';
import { batchRaidRocks, RAID_ROCK_BATCH_OFF } from './raid_batch';   // opt1118A 副本碎石合批（?off=raidrockbatch）   // 11-18 A5 火盆火苗保色（?off=flamedev）
import { sigilMaterial } from './vfx';   // v1.2.77 进副本加载画面预热
import { ENEMY_TYPES, EnemyType, wildModel, enemyConfig } from './enemy_types';
import { zoneStorm, BOSS_ZONE_GAIN } from './zonestorm';   // v1.2.80b
import { telegraphs, poisonZones, stormOff, enemyStrike, gateAnims } from './enemies';
import { WildMob, WILD } from '../data/zones_wild';
import { LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassId } from '../data/classes';
import { dlTableId } from '../data/dungeon_loot';   // v0.9.3h
import { RaidDef, RaidId, RaidMob, RaidBossDef, MECH_TIPS, EliteMech, CORRIDOR_HALF, SAMUR_PILLARS, weekKey, RAID_LEVEL, LONG_RAIDS } from '../data/raid_molten';
import { RAIDS } from '../data/raids';
import { tagItems } from './loottag';
import { darkFor, DARK_ITEMS, DARK_EXCHANGE } from '../data/darkgold';
import { KEEPER_STONES } from '../data/raid_frost';
import { dgxTier } from './dungeonplus';
import { ENDGAME, abyssIlvl, dungeonIlvl } from '../core/EndgameIlvl';
import type { ItemInstance } from '../core/Loot';
import { QUALITY_COLOR } from '../core/Loot';
import { dgxBegin, dgxEnd, dgxMuls, dgxOnEncounter, dgxOnComplete, dgxChoose, dgxInteract, dgxRun, dgxHud, DgxPlace } from './dungeonplus';
import { Diff, OathId, DIFF } from '../data/dungeon_plus';
import { TOMB_COFFINS, TOMB_BARRELS, TROLL_BRAZIERS, SET_OF, HIDDEN_DROP, SET_CHANCE, DUNGEON_SET_DROP, FORGE_BELTS, FORGE_POOLS, FORGE_MOLDS } from '../data/dungeon_new';
import { bookDrop } from './skillbook_ui';
import type { Ctx, Enemy } from './main';
import { raidSetDrop } from './sets_ui';
import { classSet } from '../data/sets';
import { RAID_LG_CHANCE, ABY_LG, ABY_TOP, ABY_BOSS_LG, ABY_DARKSHARD, ANCIENT_CHANCE } from '../data/endgame_pools';
import { rollAncient, ANCIENT_COLOR } from '../core/Ancient';
import { raidBossPool } from '../data/endgame_tables';
import { raidCurrencyDrop } from '../core/Exchange';
import { BOSS_FLAGS, RouteDef, RouteState, RouteProp, newRouteState, evalCond, onBossDead as routeBossDead, useProp, nextGoal, shortestPath, bossNode, node as rnode, condText } from '../core/RaidRoute';
import { RAID_ROUTES } from '../data/raid_routes';
import { AbyState, AbySave, FloorPlan, newAbySave, abyLoadSave, newAbyRun, floorPlan, floorScale, pathChoices, applyPath, floorReward, abyFinish } from '../core/Abyss';
import { STORY_KILL, STORY_FINAL_QUEST, STORY_SCALE_FLOOR, STORY_BOSS_NAME } from '../data/story_ch6';   // v0.8.3
import { showEnding } from './ending';
import { isoWeek, weekRange, weekSeed, weekMuts, WeeklySave, newWeeklySave, loadWeekly, addWeekRun, board as weekBoard, WEEK_REWARDS } from '../core/Weekly';   // v0.8.2
import { ABYSS, MUTS, MutId, PathKind, PATHS } from '../data/abyss';
import { abyssShowChoices, abyssHideChoices, abyssRender, openAbyss, abyssShowDarkPick, abyssDarkPending } from './abyss_ui';

let CX!: Ctx;

// ---------------------------------------------------------------- 存档（角色存档里的可选字段 raid；老存档没有 = 空）
export interface RaidSave { clears: Record<string, number>; best: Record<string, number>; week: Record<string, number>; seen: string[]; tipsOff?: boolean;
  /** v0.6.3：炼狱通关次数 / 每周机制挑战完成的周 */
  hell?: Record<string, number>; chal?: Record<string, number>;
  /** v0.6.10：副本地图迷雾（走过的节点）/ 本周已开的捷径（周 key） */
  fog?: Record<string, string[]>; short?: Record<string, number> }
export let raidRec: RaidSave = { clears: {}, best: {}, week: {}, seen: [] };
export function raidSave(): RaidSave { return raidRec; }
export function raidLoad(s?: Partial<RaidSave> | null) {
  raidRec = { clears: { ...(s?.clears ?? {}) }, best: { ...(s?.best ?? {}) }, week: { ...(s?.week ?? {}) }, seen: Array.isArray(s?.seen) ? s!.seen.slice(0, 64) : [], tipsOff: !!s?.tipsOff, hell: { ...(s?.hell ?? {}) }, chal: { ...(s?.chal ?? {}) }, fog: Object.fromEntries(Object.entries(s?.fog ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 40) : []])), short: { ...(s?.short ?? {}) } };
}

// ---------------------------------------------------------------- 运行状态
interface Hazard { id: number; pos: Pos; r: number; left: number; pct: number; el: Element; name: string; safe?: { pos: Pos; r: number }; color?: string; noDmg?: boolean; onHit?: () => void; onEnd?: () => void; warned?: boolean }
interface Lava { id: number; pos: Pos; r: number; left: number; dps: number; tick: number }
interface Pillar { lx: number; lz: number; hp: number; obj: THREE.Object3D }

interface Run {
  def: RaidDef; group: THREE.Group; O: THREE.Vector3;
  killed: number;                  // 已击败的首领数 = 当前首领序号
  checkpoint: number;              // -1 = 入口
  gates: THREE.Object3D[];         // gates[i]：第 i 个走廊入口（i ≥ 1，前一个首领倒下才开）
  walls: THREE.Object3D[];         // 首领战时封住场地出入口的火墙（每个场地两道）
  boss: RaidBoss | null;
  t: number; deaths: number; done: boolean;
  exit: THREE.Object3D; finalPortal: THREE.Object3D;
  rune: THREE.Object3D; pillars: Pillar[]; furnace: THREE.Object3D; altar: THREE.Object3D; stones: THREE.Object3D[];
  seen: Set<string>;               // 这次进本已提示过的机制
  hell: boolean;                   // v0.6.3 炼狱难度
  chalFail: boolean;               // 本次的每周机制挑战是否已失败
  // v0.6.5 普通副本（kind = 'dungeon'）
  dg: boolean; diff: Diff; regular: number;   // regular = 不含隐藏首领的首领数
  hiddenOpen: boolean; hiddenTried: boolean; props: Props;
  // v0.6.10 长副本路线（普通副本为 null）
  route: RouteDef | null; rs: RouteState; cp: string; cps: Set<string>; visited: Set<string>; pulled: string[]; opened: Set<string>;
  rg: RouteGeom | null; elites: { id: string; e: Enemy }[];
  /** v0.8.0 暗岩深渊（普通进本为空） */
  aby?: AbyRt | null;
}
interface AbyRt { st: AbyState; plan: FloorPlan; cleared: boolean; ended: boolean; emberT: number; choices: PathKind[] }
interface Props { coffins: { obj: THREE.Object3D; lx: number; lz: number; broken: boolean }[]; barrels: { obj: THREE.Object3D; lx: number; lz: number; alive: boolean }[]; braziers: { obj: THREE.Object3D; flame: THREE.Object3D; lx: number; lz: number; lit: boolean }[]; mural: { lx: number; lz: number } | null;
  molds: { obj: THREE.Object3D; fill: THREE.Object3D; lx: number; lz: number; full: boolean }[]; pools: { obj: THREE.Object3D; lx: number; lz: number; cd: number }[]; belts: THREE.Object3D[] }
/** 当前这一趟的数值倍率（长副本标准 / 炼狱 / 普通副本各难度） */
let curMul = { hp: 1, dmg: 1, ilvlMob: 36, ilvlBoss: 40, hz: 1 };
const runEl = (): Element => (run?.def.el ?? (run?.def.theme === 'frost' ? 'frost' : 'fire')) as Element;
const lastRegular = () => run ? run.regular - 1 : 4;
let run: Run | null = null;
/** v0.9.1q：满级时当前内容的固定掉落装等（深渊按层段、长副本 普通 50 / 炼狱 60、小副本按难度、其余 40） */
export function endgameCtxIlvl(): number {
  if (!run) return ENDGAME.base;
  if (run.aby) return abyssIlvl(run.aby.plan.floor);
  if (run.def.kind === 'dungeon') return dungeonIlvl(dgxTier());
  return run.hell ? ENDGAME.hell : ENDGAME.raid;
}
const built: Partial<Record<RaidId, ReturnType<typeof buildRaid>>> = {};
const hazards: Hazard[] = [];
const lavas: Lava[] = [];
let hzSeq = 1_000_000;
const deadSeen = new Set<string>();
/** 机器人/测试用：当前首领机制希望玩家站的位置（王座崩塌的符文） */
export let raidSafeSpot: Pos | null = null;

const P = () => CX.player;
const pmax = () => CX.player.maxHp;
const S = DUNGEON_SCALE;
const lw = (lx: number, lz: number) => ({ x: run!.def.origin.x + lx * S, z: run!.def.origin.z + lz * S });
/** 首领 i 的场地圆心（局部）：长副本按路线图，普通副本仍是一条线 */
const arenaL = (def: RaidDef, i: number) => { const r = RAID_ROUTES[def.id]; if (r && def.kind !== 'dungeon') { const n = bossNode(r, i); return { x: n.x, z: n.z }; } return { x: 0, z: def.rooms[i].arena.z }; };
const arenaC = (i: number) => { const a = arenaL(run!.def, i); return lw(a.x, a.z); };
const d2 = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- v0.6.10 路线图场景（长副本）
/** 路线图的场景对象：门（每条带条件的连线两头各一扇）、状态走廊（熔岩冷却 / 冰桥 / 冰湖）、机关、首领场地火圈 */
interface RouteGeom {
  doors: Map<number, THREE.Object3D[]>;          // 连线下标 → 门
  stateSlabs: Map<number, { on: THREE.Object3D; off: THREE.Object3D }>;   // 只看 flag 的连线：解锁后显示石路
  lake: { on: THREE.Object3D; off: THREE.Object3D } | null;
  props: Map<string, THREE.Object3D>;
  lampFlames: Map<string, THREE.Object3D>;
  envMarks: Map<number, THREE.Mesh>;             // 有环境的走廊：一层会变色的地面（预警用）
}
const FLAG_ONLY = (c: RouteDef['edges'][number]['cond']) => !!c && 'flag' in c && ['obsidian', 'bridge', 'frozen'].includes(c.flag);
function buildRouteGeom(def: RaidDef, route: RouteDef, add: (o: THREE.Object3D, lx: number, lz: number, y?: number) => THREE.Object3D, stone: THREE.Material, stone2: THREE.Material,
  _slab: unknown, disc: (r: number, lx: number, lz: number) => void, torch: (lx: number, lz: number) => void, walls: THREE.Object3D[]): RouteGeom {
  const pal = def.palette, frost = def.theme === 'frost';
  const xs = route.nodes.map(n => n.x), zs = route.nodes.map(n => n.z);
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, z0 = Math.min(...zs) - 50, z1 = Math.max(...zs) + 40;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), G.lavaMaterial(pal.sea, frost));
  lava.rotation.x = -Math.PI / 2; add(M.noOutline(lava), (x0 + x1) / 2, (z0 + z1) / 2, -1.2);
  const rg: RouteGeom = { doors: new Map(), stateSlabs: new Map(), lake: null, props: new Map(), lampFlames: new Map(), envMarks: new Map() };
  const obsidian = G.toon(frost ? 0xbfe6ff : 0x1a1418), hot = G.glow(frost ? 0x3a7ab0 : 0xff6a10, frost ? 0.9 : 1.6);
  route.edges.forEach((e, i) => {
    const A = rnode(route, e.a), B = rnode(route, e.b), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), half = e.half ?? CORRIDOR_HALF;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const box = (mat: THREE.Material, y = -0.6) => { const m = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 1.2, L), mat); m.rotation.y = ang; m.receiveShadow = true; return add(m, mx, mz, y); };
    if (FLAG_ONLY(e.cond)) {
      const on = box(e.cond && 'flag' in e.cond && e.cond.flag === 'obsidian' ? obsidian : stone);
      const off = M.noOutline(box(hot, -1.0) as THREE.Mesh); on.visible = false;
      rg.stateSlabs.set(i, { on, off });
    } else box(e.kind === 'secret' ? stone2 : stone);
    // 火把 + 两侧碎石
    const ux = dx / L, uz = dz / L, px = uz, pz = -ux;
    for (let t = A.r + 3; t < L - B.r - 2; t += 8) { const sx = A.x + ux * t, sz = A.z + uz * t; const k = Math.round(t / 8) % 2 ? 1 : -1; torch(sx + px * (half - 0.3) * k, sz + pz * (half - 0.3) * k); }
    for (let t = A.r; t < L - B.r; t += 3) for (const sgn of [-1, 1]) { const r = raidRock(0.5 + Math.random() * 0.4, pal.rock); add(r, A.x + ux * t + px * (half + 0.5) * sgn, A.z + uz * t + pz * (half + 0.5) * sgn); }
    // 带条件（非 flag）的连线：两头各一扇门
    if (e.cond && !FLAG_ONLY(e.cond)) {
      const ds: THREE.Object3D[] = [];
      for (const [N, sg] of [[A, 1], [B, -1]] as const) { const gt = M.makeGate(); gt.scale.set(half / 2.75, 1, 1); gt.rotation.y = ang; add(gt, N.x + ux * sg * (N.r + 0.8), N.z + uz * sg * (N.r + 0.8)); ds.push(gt); }
      rg.doors.set(i, ds);
    }
    // 有环境的走廊：预警地面
    if (e.env) { const m = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 - 0.4, Math.max(1, L - A.r - B.r)), new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.rotation.z = -ang;
      const tm = (A.r + (L - B.r)) / 2; add(M.noOutline(m), A.x + ux * tm, A.z + uz * tm, 0.05); rg.envMarks.set(i, m); }
  });
  for (const n of route.nodes) {
    if (n.kind === 'lake') {
      const on = new THREE.Mesh(new THREE.CylinderGeometry(n.r, n.r + 0.6, 1.2, 40), G.toon(0xd8f0ff)); add(on, n.x, n.z, -0.6); on.visible = false;
      const off = M.noOutline(new THREE.Mesh(new THREE.CircleGeometry(n.r, 40), G.glow(0x2a6aa0, 0.9))); off.rotation.x = -Math.PI / 2; add(off, n.x, n.z, -0.9);
      rg.lake = { on, off }; continue;
    }
    disc(n.r, n.x, n.z);
    if (n.boss !== undefined) {
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.3; const r = raidRock(0.9, 0x24181a); const rx = n.x + Math.cos(a) * (n.r + 0.8), rz = n.z + Math.sin(a) * (n.r + 0.8);
        // 别把碎石堆在走廊口上
        if (route.edges.some(e => { if (e.a !== n.id && e.b !== n.id) return false; const o = rnode(route, e.a === n.id ? e.b : e.a); const aa = Math.atan2(o.z - n.z, o.x - n.x); let d = Math.abs(aa - a) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d < 0.5; })) continue;
        add(r, rx, rz); }
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(n.r - 0.3, n.r - 0.3, 3, 48, 1, true), G.glow(pal.wall, 1.6, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      add(M.noOutline(ring), n.x, n.z, 1.5); ring.visible = false; walls[n.boss * 2] = ring; walls[n.boss * 2 + 1] = ring;
    }
    const l = new THREE.PointLight(pal.torch, n.boss !== undefined ? 3.2 : 2.4, n.r * 2.4); add(l, n.x, n.z, 6);
  }
  // 机关
  for (const p of route.props) {
    let o: THREE.Object3D;
    if (p.kind === 'lamp') { o = M.makePillar(1.6, false); const f = M.noOutline(new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), G.glow(0x7ad8ff, 2.4))); f.position.y = 1.9; f.visible = false; o.add(f); rg.lampFlames.set(p.id, f); }
    else if (p.kind === 'valve') { o = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), G.toon(0x3a2c28)); post.position.y = 0.7; o.add(post); const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16), G.glow(0xff8a30, 1.2)); wheel.position.y = 1.45; wheel.name = 'wheel'; o.add(M.noOutline(wheel)); }
    else if (p.kind === 'pillar') { o = M.makeCrystal(0x9ad8ff, 1.6); }
    else if (p.kind === 'icewall') { o = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4, 1), G.glow(0x9ad8ff, 0.8, { transparent: true, opacity: 0.75 })); o.position.y = 2; }
    else if (p.kind === 'chest') { o = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), G.toon(0x6a4020)); b.position.y = 0.35; o.add(b); const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 0.85), G.toon(0xc9962e)); lid.position.y = 0.82; lid.name = 'lid'; o.add(lid); }
    else { o = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 0.3), G.toon(0x5a3a2a)); o.position.y = 1.2; const ins = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), G.glow(0xff7a30, 0.8))); ins.position.set(0, 1.2, 0.16); (o as THREE.Mesh).add(ins); ins.position.y = 0; }
    const y = o.position.y; add(o, p.x, p.z, y); rg.props.set(p.id, o);
  }
  return rg;
}
/** 点到线段的距离 */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(ax + dx * t - px, az + dz * t - pz); }
/** 路线图可走区域（局部坐标）：节点圆 + 条件满足的走廊 */
function routeWalkable(route: RouteDef, rs: RouteState, lx: number, lz: number, r: number): boolean {
  for (const n of route.nodes) { if (n.kind === 'lake' && !rs.flags.includes('frozen')) continue; if (Math.hypot(lx - n.x, lz - n.z) <= n.r - r) return true; }
  for (const e of route.edges) { if (!evalCond(e.cond, rs)) continue; const A = rnode(route, e.a), B = rnode(route, e.b); if (segDist(lx, lz, A.x, A.z, B.x, B.z) <= (e.half ?? CORRIDOR_HALF) - r) return true; }
  return false;
}
/** 玩家所在（或最近）的节点 */
function nodeAt(route: RouteDef, lx: number, lz: number) { let best = route.nodes[0], bd = Infinity; for (const n of route.nodes) { const d = Math.hypot(lx - n.x, lz - n.z) - n.r; if (d < bd) { bd = d; best = n; } } return best; }

// ---------------------------------------------------------------- v0.6.10 路线运行时
const ROUTE_FLAGS_OF = (id: string) => BOSS_FLAGS[id] ?? [];
/** 进本：小怪按「首领 i 的来路」摆放；支线精英；调试从第 N 个首领开始 */
function routeEnter(r: Run, startAt: number) {
  const route = r.route!, def = r.def;
  if (startAt > 0) {
    for (const i of route.order.slice(0, startAt)) routeBossDead(route, r.rs, i);
    if (def.id === 'frost_crypt' && startAt >= 3) { r.rs.flags.push('bridge'); for (const p of route.props) if (p.kind === 'lamp') { r.rs.flags.push(`lamp:${p.id}`); r.rs.lamps++; } }
    r.killed = r.rs.dead.filter(Boolean).length;
    r.cp = bossNode(route, route.order[startAt - 1]).id; r.cps.add(r.cp); r.checkpoint = route.order[startAt - 1];
    // 走过的路：迷雾揭开
    for (const n of route.nodes) if (n.boss !== undefined && r.rs.dead[n.boss]) r.visited.add(n.id);
  }
  def.rooms.forEach((room, i) => {
    if (r.rs.dead[i]) return;
    const ap = route.approach[i]; if (!ap) return;
    const A = rnode(route, ap[0]), B = rnode(route, ap[1]), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const [c0, c1] = room.corridor;
    for (const pk of room.pack) {
      const t = Math.max(0.1, Math.min(0.9, (c1 - pk.z) / (c1 - c0))), along = A.r + t * (L - A.r - B.r);
      spawnMob(pk.kind, lw(A.x + ux * along + uz * pk.x, A.z + uz * along - ux * pk.x));
    }
  });
  for (const el of route.elites ?? []) {
    if (r.rs.elites.includes(el.id)) continue;
    const n = rnode(route, el.node), e = spawnMob(el.mob, lw(n.x, n.z));
    if (e) { e.maxHp = Math.round(e.maxHp * 3.5); e.hp = e.maxHp; e.type = { ...e.type, name: el.name, elite: true }; e.rig.root.scale.multiplyScalar(1.35); r.elites.push({ id: el.id, e }); }
  }
  syncRouteGeom(r);
  // 先刷离入口最近的首领
  const first = route.nodes.filter(n => n.boss !== undefined && !r.rs.dead[n.boss]).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  if (first) spawnBoss(first.boss!);
}
/** 门 / 状态走廊 / 魂灯 / 冰墙 跟着路线状态变 */
function syncRouteGeom(r: Run, anim = false) {
  const rg = r.rg, route = r.route; if (!rg || !route) return;
  route.edges.forEach((e, i) => {
    const open = evalCond(e.cond, r.rs);
    const ds = rg.doors.get(i);
    if (ds) for (const d of ds) { if (open && d.visible && d.position.y === 0) { if (anim) gateAnims.push({ g: d, t: 0 }); else d.visible = false; } else if (!open) { d.visible = true; d.position.y = 0; } }
    const st = rg.stateSlabs.get(i); if (st) { st.on.visible = open; st.off.visible = !open; }
  });
  if (rg.lake) { const fz = r.rs.flags.includes('frozen'); rg.lake.on.visible = fz; rg.lake.off.visible = !fz; }
  for (const [id, f] of rg.lampFlames) f.visible = r.rs.flags.includes(`lamp:${id}`);
  for (const p of route.props) { const o = rg.props.get(p.id); if (!o) continue; if (p.kind === 'icewall') o.visible = !r.rs.flags.includes('icewall'); if (p.kind === 'pillar') o.rotation.z = r.rs.flags.includes('bridge') ? Math.PI / 2 : 0; if (p.kind === 'chest') { const lid = o.getObjectByName('lid'); if (lid) lid.rotation.x = r.opened.has(p.id) ? -1.2 : 0; } }
}
let routeAcc = 0;
function routeTick(dt: number) {
  const r = run!, route = r.route!; routeAcc += dt;
  const lp = dgL(r.O, CX.player.pos.x, CX.player.pos.z);
  // 迷雾 + 存档点
  for (const n of route.nodes) {
    const d = Math.hypot(lp.x - n.x, lp.z - n.z);
    if (d < n.r + 10 && !r.visited.has(n.id)) { r.visited.add(n.id); const f = (raidRec.fog![r.def.id] ??= []); if (!f.includes(n.id)) f.push(n.id); if (n.hidden) { CX.yell(`发现隐藏地点：${n.name}！`, '#c08aff', 3); CX.audio.portal(); } }
    if (n.checkpoint && d < n.r && !r.boss?.engaged && r.cp !== n.id) { r.cp = n.id; if (!r.cps.has(n.id)) { r.cps.add(n.id); CX.toast(`存档点：${n.name}`, '#7fd7ff'); } }
  }
  // 支线精英
  for (const el of r.elites) if (!el.e.alive && !r.rs.elites.includes(el.id)) { r.rs.elites.push(el.id); CX.yell(`${el.e.type.name} 倒下了！封印之门松动了`, '#ffb060', 3); syncRouteGeom(r, true); }
  // 首领：不在战斗时，刷离玩家最近的活首领
  if (routeAcc > 0.5 && !r.boss?.engaged && !r.done) {
    routeAcc = 0;
    let best: number | null = null, bd = Infinity;
    for (const n of route.nodes) if (n.boss !== undefined && !r.rs.dead[n.boss]) { const d = Math.hypot(lp.x - n.x, lp.z - n.z); if (d < bd) { bd = d; best = n.boss; } }
    if (best !== null && r.boss?.room !== best && (bd < 60 || !r.boss)) { r.boss?.dispose(); r.boss = null; spawnBoss(best); if (r.boss && (r.boss as RaidBoss).fury) CX.toast(`${r.def.bosses[best].name} 带着「余怒」：多一个机制，多掉 1 枚暗金碎片`, '#ff6a40'); }
  }
  updateRouteEnv(dt);
}
/** 路线首领倒下：印记 / 进度型环境 / 存档点 / 开门；最终首领 → 结算 */
function routeBossDown(r: Run, B: RaidBoss) {
  const route = r.route!, n = bossNode(route, B.room);
  routeBossDead(route, r.rs, B.room);
  r.killed = r.rs.dead.filter(Boolean).length; r.checkpoint = B.room;
  r.cp = n.id; r.cps.add(n.id); r.boss = null;
  CX.toast(`存档点：${n.name}（阵亡会从这里重来）`, '#7fd7ff');
  if (n.sigil) CX.yell(`获得「${n.sigil}」（${r.rs.sigils.length}/2）`, '#ffd060', 3);
  if (B.fury) { CX.inventory.addStack('mat_darkshard', 1); CX.toast('余怒奖励：暗金碎片 ×1', '#e8c060'); }
  for (const [b, f] of ROUTE_FLAGS_OF(r.def.id)) if (b === B.room) {
    CX.yell(f === 'obsidian' ? '河道里的熔岩冷却成了黑曜石——捷径打开了！' : f === 'frozen' ? '冰湖冻结了——可以直接穿过湖面！' : '', '#7fd7ff', 4);
    (raidRec.short ??= {})[r.def.id] = weekKey(Date.now());
  }
  syncRouteGeom(r, true);
  if (B.room === route.final) finishRun();
}
/** 机关交互（魂灯 / 冰柱 / 阀门 / 冰墙 / 宝箱 / 壁画） */
function routeInteract(r: Run): { label: string; act: () => void; pos: THREE.Vector3 } | null {
  const route = r.route!, pp = CX.player.pos;
  for (const p of route.props) {
    const w = new THREE.Vector3(r.O.x + p.x * S, 0, r.O.z + p.z * S);
    if (Math.hypot(pp.x - w.x, pp.z - w.z) > (p.kind === 'icewall' ? 3.8 : 2.8) * S) continue;   // 机关跟着放大，互动半径同比
    if (p.kind === 'lamp' && !r.rs.flags.includes(`lamp:${p.id}`)) return { label: `点亮${p.label}`, act: () => propUse(r, p), pos: w };
    if (p.kind === 'pillar' && !r.rs.flags.includes('bridge')) return { label: p.label, act: () => propUse(r, p), pos: w };
    if (p.kind === 'icewall' && !r.rs.flags.includes('icewall')) return { label: p.label, act: () => propUse(r, p), pos: w };
    if (p.kind === 'valve' && !r.rs.flags.includes('valves')) return { label: `拉动${p.label}`, act: () => propUse(r, p), pos: w };
    if (p.kind === 'chest' && !r.opened.has(p.id)) return { label: `打开${p.label}`, act: () => openChest(r, p), pos: w };
    if (p.kind === 'mural') return { label: '查看壁画', act: () => { const vs = route.props.filter(x => x.kind === 'valve'); CX.yell(`壁画：熔炉的三道火焰依次亮起——${(route.mural ?? []).map(k => vs[k].label.replace(/阀门（|）/g, '')).join(' → ')}`, '#e8d8b8', 6); CX.audio.portal(); }, pos: w };
  }
  return null;
}
function propUse(r: Run, p: RouteProp) {
  const res = useProp(r.route!, r.rs, p, r.pulled);
  if (res.msg) CX.toast(res.msg, res.ok ? '#7fd7ff' : '#ffb080');
  if (res.ok) { CX.audio.portal(); CX.spawnRing({ x: r.O.x + p.x * S, z: r.O.z + p.z * S }, 2.5 * S, '#7ad8ff', 0.6); if (p.kind === 'valve') { const w = r.rg?.props.get(p.id)?.getObjectByName('wheel'); if (w) w.rotation.z += Math.PI / 2; } }
  else CX.audio.error();
  syncRouteGeom(r, true);
}
function openChest(r: Run, p: RouteProp) {
  r.opened.add(p.id);
  const roll = CX.gen.roll(LOOT_TABLES.raid_boss, r.hell ? 44 : curMul.ilvlBoss, true);
  tagItems(roll.items, 'raid', `${r.def.name} · ${p.label}`);
  roll.stacks.forEach(st => CX.inventory.addStack(st.id, st.count));
  CX.inventory.addStack('mat_darkshard', 1);
  const at = new THREE.Vector3(r.O.x + p.x * S, 0, r.O.z + (p.z + 1.2) * S);
  [...roll.items, roll.gold].forEach((l, i, all) => CX.spawnLoot(l, at, i, all.length));
  CX.yell(`${p.label}：宝物 + 暗金碎片 ×1`, '#ffd060', 3); CX.audio.victory?.();
  syncRouteGeom(r);
}

// ---------------------------------------------------------------- v0.6.10 环境（周期 / 进度 / 玩家 / 每周）——统一预警
export interface RouteEnvState { id: string; name: string; edge: number; phase: 'calm' | 'warn' | 'active'; left: number }
const ENV_DEF: Record<string, { name: string; period: number; warn: number; active: number; hurt: number; el: Element; slow?: number; fog?: boolean }> = {
  tide: { name: '熔岩潮汐', period: 45, warn: 6, active: 12, hurt: 0.06, el: 'fire' },
  lavafall: { name: '熔瀑', period: 20, warn: 3, active: 5, hurt: 0.08, el: 'fire' },
  blizzard: { name: '暴风雪', period: 40, warn: 5, active: 14, hurt: 0.02, el: 'frost', slow: 0.25, fog: true },
};
/** 每周畸变主题：单数周 余烬风暴（熔心）/ 深冻（永霜）——走廊里随机落下预警圈 */
export function weeklyEnvTheme(raid: string, now = Date.now()) { const wk = weekKey(now); return wk % 2 ? (raid === 'frost_crypt' ? '深冻' : '余烬风暴') : null; }
let envT = 0, envHurtAcc = 0, themeT = 8, fogSaved: [number, number] | null = null;
export function routeEnvStates(): RouteEnvState[] {
  const r = run; if (!r?.route) return [];
  const out: RouteEnvState[] = [];
  const seen = new Set<string>();
  r.route.edges.forEach((e, i) => { if (!e.env || seen.has(e.env)) return; seen.add(e.env); const D = ENV_DEF[e.env]; const t = (envT + (e.env === 'lavafall' ? 7 : 0)) % D.period, calmEnd = D.period - D.warn - D.active;
    out.push({ id: e.env, name: D.name, edge: i, phase: t < calmEnd ? 'calm' : t < calmEnd + D.warn ? 'warn' : 'active', left: t < calmEnd ? calmEnd - t : t < calmEnd + D.warn ? calmEnd + D.warn - t : D.period - t }); });
  return out;
}
function updateRouteEnv(dt: number) {
  const r = run!, route = r.route!, rg = r.rg!;
  const fighting = !!r.boss?.engaged;
  envT += dt;
  const lp = dgL(r.O, CX.player.pos.x, CX.player.pos.z);
  const states = routeEnvStates();
  let inFog = false;
  route.edges.forEach((e, i) => {
    if (!e.env) return;
    const st = states.find(x => x.id === e.env)!, D = ENV_DEF[e.env], m = rg.envMarks.get(i);
    if (m) { const mat = m.material as THREE.MeshBasicMaterial; mat.color.setHex(e.env === 'blizzard' ? 0xdff4ff : 0xff6a10); mat.opacity = st.phase === 'warn' ? 0.18 + 0.12 * Math.sin(envT * 10) : st.phase === 'active' ? 0.45 : 0; }
    // 首领战中不叠加跑图环境
    if (fighting || st.phase !== 'active' || !CX.player.alive) return;
    const A = rnode(route, e.a), B = rnode(route, e.b);
    if (segDist(lp.x, lp.z, A.x, A.z, B.x, B.z) > (e.half ?? CORRIDOR_HALF) + 0.5) return;
    if (Math.hypot(lp.x - A.x, lp.z - A.z) < A.r || Math.hypot(lp.x - B.x, lp.z - B.z) < B.r) return;   // 场地 / 节点上是安全的
    if (e.env === 'tide' && r.rs.flags.includes('obsidian')) return;   // 萨穆尔死后河道冷却
    if (D.fog) inFog = true;
    if (D.slow) CX.player.status.add({ key: `env:${e.env}`, kind: 'slow', remaining: 0.6, percent: D.slow, source: null });
    envHurtAcc += dt;
    if (envHurtAcc >= 1) { envHurtAcc = 0; hurtPlayer(D.hurt, D.el, null); mechTip(`env_${e.env}`, `${D.name}：地面变色就是预警，躲到场地或节点上（地图上有倒计时）`); }
  });
  // 暴风雪：视野压低
  const fog = CX.scene.fog as THREE.Fog | null;
  if (fog) { if (inFog && !fogSaved) { fogSaved = [fog.near, fog.far]; fog.near = 4; fog.far = 16; } else if (!inFog && fogSaved) { fog.near = fogSaved[0]; fog.far = fogSaved[1]; fogSaved = null; } }
  // 每周主题：走廊里随机落预警圈（不在首领战中）
  const theme = weeklyEnvTheme(r.def.id);
  if (theme && !fighting && (themeT -= dt) <= 0) {
    themeT = 9 + Math.random() * 5;
    const n = nodeAt(route, lp.x, lp.z);
    if (Math.hypot(lp.x - n.x, lp.z - n.z) > n.r) tele(CX.player.getPos(), 3, 1.8, 0.12, theme === '深冻' ? '深冻冰锥' : '余烬风暴');
  }
}
export function routeEnvReset() { const fog = CX.scene?.fog as THREE.Fog | null; if (fog && fogSaved) { fog.near = fogSaved[0]; fog.far = fogSaved[1]; } fogSaved = null; envT = 0; }

// ---------------------------------------------------------------- v0.6.10 给副本地图 / 机器人用
export function raidRouteInfo() {
  if (!run?.route) return null;
  const r = run, route = r.route!;
  const lp = dgL(r.O, CX.player.pos.x, CX.player.pos.z);
  const at = nodeAt(route, lp.x, lp.z);
  const goal = r.done ? null : nextGoal(route, r.rs, at.id);
  const path = goal ? shortestPath(route, r.rs, at.id, goal.node) : null;
  return { def: r.def, route, rs: r.rs, at: at.id, cp: r.cp, cps: [...r.cps], visited: [...r.visited], fog: raidRec.fog?.[r.def.id] ?? [], goal, path, O: { x: r.O.x, z: r.O.z }, t: r.t, best: raidRec.best[r.def.id] ?? null,
    env: routeEnvStates(), theme: weeklyEnvTheme(r.def.id), fury: route.fury ?? null, boss: r.boss ? { room: r.boss.room, engaged: r.boss.engaged, fury: r.boss.fury } : null, pulled: r.pulled.length,
    condText: (i: number) => condText(route.edges[i].cond, route, b => r.def.bosses[b].name.split(' ').pop()!) };
}
/** 存档点互传（战斗中不可用） */
export function raidTeleport(nodeId: string): string | null {
  const r = run; if (!r?.route) return '不在长副本里';
  if (r.boss?.engaged || liveRaid().some(e => e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack'))) return '战斗中不能传送';
  if (!r.cps.has(nodeId)) return '这个存档点还没激活';
  const n = rnode(r.route, nodeId); r.cp = nodeId;
  const p = n.id === 'entry' ? lw(0, 1) : lw(n.x, n.z + 2); CX.player.pos.set(p.x, 0, p.z);
  CX.spawnRing(p, 2.4, '#7ad8ff', 0.6); CX.audio.portal(); CX.toast(`传送到存档点：${n.name}`, '#7fd7ff');
  return null;
}
/** 机器人 / 自动寻路：下一个要走到的点（世界坐标）；到了机关旁边返回机关位置 */
export function raidBotGoal(): Pos | null {
  const info = raidRouteInfo(); if (!info || !info.goal || !info.path) return null;
  const r = run!, route = info.route, lp = dgL(r.O, CX.player.pos.x, CX.player.pos.z);
  const path = info.path;
  if (path.length === 1) { const p = info.goal.prop; return p ? lw(p.x, p.z + (p.kind === 'icewall' ? 2.6 : 1.2)) : lw(rnode(route, path[0]).x, rnode(route, path[0]).z); }
  const A = rnode(route, path[0]), B = rnode(route, path[1]);
  const e = route.edges.find(x => (x.a === A.id && x.b === B.id) || (x.a === B.id && x.b === A.id))!;
  const onSeg = segDist(lp.x, lp.z, A.x, A.z, B.x, B.z) < (e.half ?? CORRIDOR_HALF) - 0.8;
  const tgt = onSeg || Math.hypot(lp.x - A.x, lp.z - A.z) < A.r - 1 ? B : A;
  return lw(tgt.x, tgt.z);
}
/** 机器人：走向某个点（世界坐标）的下一步——直线走得通就直走，否则沿路线图节点中心绕 */
export function raidStepToward(to: Pos): Pos {
  const r = run; if (!r?.route) return to;
  const pp = CX.player.getPos(); if (straightWalk(pp, to)) return to;
  const route = r.route, lp = dgL(r.O, pp.x, pp.z);
  const a = nodeAt(route, lp.x, lp.z), b = nodeAt(route, (to.x - r.O.x) / S, (to.z - r.O.z) / S);
  const path = shortestPath(route, r.rs, a.id, b.id) ?? [a.id];
  const ac = lw(a.x, a.z);
  if (path.length < 2 || d2(pp, ac) > 2.5) { if (straightWalk(pp, ac)) return ac; }
  const n = rnode(route, path[Math.min(1, path.length - 1)]); return lw(n.x, n.z);
}
export function raidStraight(a: Pos, b: Pos) { return straightWalk(a, b); }
/** 两点之间能不能直线走过去（机器人挑怪用：隔着熔岩的怪不算） */
function straightWalk(a: Pos, b: Pos) { const L = d2(a, b), n = Math.ceil(L); for (let k = 1; k < n; k++) { const t = k / n; if (!walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.3)) return false; } return true; }

// ---------------------------------------------------------------- 场景（第一次进入时生成）
/** opt1118A：副本碎石统一走这里，打上 raidRock 标记（= 尺寸），建完后 batchRaidRocks 按材质签名合批 */
// opt1118A 小碎石关投影：尺寸 ≤ 1 m 的走廊 / 场地外圈碎石不投影（贴地小件，影子几乎看不见，却让阴影 pass 多画几百块）；仍接收阴影。?off=raidrockshadow 回全投影
const RAID_ROCK_SHADOW_OFF = (() => { try { return /(?:[?&]off=[^&]*\braidrockshadow\b)/.test(location.search); } catch { return false; } })();
function raidRock(size: number, color?: number) { const r = M.makeRock(size, color); r.userData.raidRock = size; if (!RAID_ROCK_SHADOW_OFF && size <= 1.0) r.castShadow = false; return r; }
// opt1118A 灯池推广开关（照现有写法，各自可关）
const RAID_LPOOL_MOLTEN_OFF = (() => { try { return /(?:[?&]off=[^&]*\braidlpool_molten\b)/.test(location.search); } catch { return false; } })();
const RAID_LPOOL_DUNG_OFF = (() => { try { return /(?:[?&]off=[^&]*\braidlpool_dung\b)/.test(location.search); } catch { return false; } })();
function buildRaid(def: RaidDef) {
  const g = new THREE.Group(); g.name = `raid_${def.id}`;
  const O = new THREE.Vector3(def.origin.x, 0, def.origin.z), pal = def.palette, frost = def.theme === 'frost';
  const props: Props = { coffins: [], barrels: [], braziers: [], mural: null, molds: [], pools: [], belts: [] };
  g.position.set(0, 0, 0);
  const stone = G.toon(pal.stone), stone2 = G.toon(pal.stone2), rim = G.toon(pal.rim);
  // v0.9.1k 走道/石板往后推一点深度，和圆台、贴花重叠时不再闪条纹
  Object.assign(stone, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  // 11-18 副本 ×1.5（?off=dgscale）：每个摆件按副本原点放大（位置 / 高度 / 几何），平铺贴图 UV、点光照距同步；组本身不缩放（运行时按世界坐标摆的东西照旧）
  const add = (o: THREE.Object3D, lx: number, lz: number, y = 0) => { o.position.set(O.x + lx * S, y * S, O.z + lz * S); if (S !== 1) { o.scale.multiplyScalar(S); dgFixScaled(o); } g.add(o); return o; };
  const route = def.kind === 'dungeon' ? null : RAID_ROUTES[def.id] ?? null;
  const slab = (w: number, d: number, lx: number, lz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), stone); m.receiveShadow = true; add(m, lx, lz, -0.6); };
  const disc = (r: number, lx: number, lz: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.6, 1.2, 40), stone2); m.receiveShadow = true; add(m, lx, lz, -0.58); // v0.9.1k 圆台比走道高 2cm，避免共面条纹
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.3, 0.12, 4, 48), G.glow(pal.ring, 1.4)); ring.rotation.x = Math.PI / 2; add(M.noOutline(ring), lx, lz, 0.05); };
  const torch = (lx: number, lz: number) => { const t = M.makeTorch(); add(t, lx, lz); };
  let gates: THREE.Object3D[] = [], walls: THREE.Object3D[] = [], rg: RouteGeom | null = null;
  if (route) { rg = buildRouteGeom(def, route, add, stone, stone2, slab, disc, torch, walls); gates = def.rooms.map(() => { const o = new THREE.Group(); g.add(o); return o; }); }
  else {
  // 熔岩海（所有走道下方）
  const lastZ = def.rooms[def.rooms.length - 1].arena.z;
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(90, -lastZ + 60), G.lavaMaterial(pal.sea, frost));
  lava.rotation.x = -Math.PI / 2; add(M.noOutline(lava), 0, lastZ / 2, -1.2);
  slab(16, 17, 0, -2);
  for (const [i, room] of def.rooms.entries()) {
    const [z0, z1] = room.corridor;
    slab(CORRIDOR_HALF * 2, z1 - z0 + 3, 0, (z0 + z1) / 2);
    for (let z = z1 - 2; z > z0; z -= 7) { torch(-CORRIDOR_HALF + 0.3, z); torch(CORRIDOR_HALF - 0.3, z - 3.5); }
    for (let z = z1; z > z0; z -= 3) { for (const s of [-1, 1]) { const r = raidRock(0.6 + Math.random() * 0.4, pal.rock); add(r, s * (CORRIDOR_HALF + 0.5), z); } }
    disc(room.arena.r, 0, room.arena.z);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + 0.3; if (Math.abs(Math.sin(a)) < 0.35) continue; const r = raidRock(0.9, 0x24181a); add(r, Math.cos(a) * (room.arena.r + 0.8), room.arena.z + Math.sin(a) * (room.arena.r + 0.8)); }
    const l = new THREE.PointLight(pal.torch, 3.2, room.arena.r * 2.4); add(l, 0, room.arena.z, 6);
    void i;
  }
  // 走廊之间的铁门（第 i 个走廊入口：前一个首领倒下才开）
  gates = def.rooms.map((room, i) => { const gt = M.makeGate(); gt.scale.set(2, 1, 1); add(gt, 0, room.corridor[1]); gt.visible = i > 0; return gt; });
  // 首领战火墙：场地入口 + 出口
  for (const room of def.rooms) for (const z of [room.arena.z + room.arena.r - 0.4, room.arena.z - room.arena.r + 0.4]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_HALF * 2 + 1, 3), G.glow(pal.wall, 1.6, { transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    add(M.noOutline(w), 0, z, 1.5); w.visible = false; walls.push(w);
  }
  }
  // 主题道具：熔心王座 = 熔炉 / 石柱 / 祭坛 / 王座；永霜墓穴 = 墓碑 / 冰王座
  let furnace: THREE.Object3D = new THREE.Group(), altar: THREE.Object3D = new THREE.Group(), pillars: Pillar[] = [], stones: THREE.Object3D[] = [];
  if (def.theme === 'molten') {
  // 熔炉（第一首领场地中央）、石柱（第三）、祭坛（第四）、王座（第五）
  const A0 = arenaL(def, 0), A2 = arenaL(def, 2), A3 = arenaL(def, 3), A4 = arenaL(def, 4), fz = A0.z;
  furnace = new THREE.Group();
  furnace.add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 1.6, 10), rim));
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.7, 12), G.glow(0xff6a10, 2)); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.82; furnace.add(M.noOutline(mouth));
  add(furnace, A0.x, fz, 0);
  pillars = SAMUR_PILLARS.map(([x, z]) => { const p = M.makePillar(4.5, false); p.traverse(c => { const m = (c as THREE.Mesh).material as THREE.MeshToonMaterial; if (m?.color) m.color.lerp(new THREE.Color(0x3a2a24), 0.6); }); add(p, A2.x + x, A2.z + z); return { lx: A2.x + x, lz: A2.z + z, hp: 2, obj: p }; });
  altar = M.makeAltar(); altar.traverse(c => { const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial; if (c.name === 'pool' && m?.color) m.color.setRGB(2.4, 0.6, 0.1); }); altar.scale.setScalar(0.6);
  add(altar, A3.x, A3.z - 10);
  const throne = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 3), rim); tb.position.set(0, 0.5, 0); throne.add(tb);
  const tback = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.8), rim); tback.position.set(0, 3, -1.1); throne.add(tback);
  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), G.glow(0xff5a10, 2.2)); crown.position.set(0, 6.1, -1.1); throne.add(M.noOutline(crown));
  add(throne, A4.x, A4.z - def.rooms[4].arena.r + 2);
  } else if (def.theme === 'frost') {
    stones = KEEPER_STONES.map(([x, z]) => { const st = new THREE.Group();
      const slabm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.5), G.toon(0x7a8898)); slabm.position.y = 1.2; st.add(slabm);
      const rn = new THREE.Mesh(new THREE.CircleGeometry(0.35, 6), G.glow(0x7ad8ff, 2)); rn.position.set(0, 1.5, 0.27); st.add(M.noOutline(rn));
      return add(st, arenaL(def, 0).x + x, arenaL(def, 0).z + z); });
    const throne = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 3), G.toon(0x8ab0d0)); tb.position.set(0, 0.5, 0); throne.add(tb);
    const tback = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.8), G.toon(0x9ac8e8)); tback.position.set(0, 3, -1.1); throne.add(tback);
    const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), G.glow(0x9ad8ff, 2.2)); crown.position.set(0, 6.1, -1.1); throne.add(M.noOutline(crown));
    add(throne, arenaL(def, 4).x, arenaL(def, 4).z - def.rooms[4].arena.r + 2);
    for (let k = 0; k < 40; k++) { const c = M.makeCrystal(0x9ad8ff, 0.5 + Math.random() * 0.6); const ri = k % def.rooms.length, room = def.rooms[ri], A = arenaL(def, ri); const a = Math.random() * Math.PI * 2; add(c, A.x + Math.cos(a) * (room.arena.r + 1.2), A.z + Math.sin(a) * (room.arena.r + 1.2)); }
  }
  else buildDungeonProps(def, add, props);
  // 符文（王座崩塌的安全点）
  const rune = new THREE.Group();
  const rd = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), G.glow(0x7ad8ff, 2.2, { transparent: true, opacity: 0.8, depthWrite: false })); rd.rotation.x = -Math.PI / 2; rd.position.y = 0.08; rune.add(M.noOutline(rd));
  const rl = new THREE.PointLight(0x7ad8ff, 5, 10); rl.position.y = 2; rune.add(rl); rune.visible = false; g.add(rune);
  const exit = M.makePortal(0xff8a40); add(exit, 0, 4);
  const lastR = def.rooms[def.hidden ? def.hidden.room - 1 : def.rooms.length - 1];
  const lastA = arenaL(def, def.hidden ? def.hidden.room - 1 : def.rooms.length - 1); void lastR;
  const finalPortal = M.makePortal(0xffd060); add(finalPortal, lastA.x, lastA.z + 6); finalPortal.visible = false;
  // 11-18 B1 副本灯池（先只做永霜墓穴）：火把灯 + 节点顶灯（直接挂在副本组下的）登记进池，场景里只留固定几盏真灯 + 假光
  // opt1118A：熔心王座（≈61 火把 + 13 节点顶灯）同样进池（?off=raidlpool_molten 回每灯一盏真点光）；符文灯挂在符文组下、不进池，照旧真灯
  if (!RAID_ROCK_BATCH_OFF) { const st = batchRaidRocks(g); g.userData.rockBatch = st; }   // opt1118A 碎石合批（≈400 / 250 / 90 块 → 每 60 m 格每种材质一批）
  // opt1118A：沙葬王陵 / 巨魔冰窟 / 灰烬铸造厂（暗岩深渊复用同一份场景）每座≈30 火把 + 3 场地顶灯也进池（?off=raidlpool_dung 回旧）；冰窟火盆的灯挂在火苗组下、会开关，不进池
  const poolOn = def.id === 'frost_crypt' || (def.id === 'molten_throne' && !RAID_LPOOL_MOLTEN_OFF) || (def.kind === 'dungeon' && !RAID_LPOOL_DUNG_OFF);
  const lpool: LightPool | null = poolOn && !DUNG_POOL_OFF ? makeLightPool(g, l => l.name === 'torchLight' || l.parent === g) : null;
  CX.scene.add(g); g.visible = false;
  return { group: g, exit, finalPortal, gates, walls, rune, pillars, furnace, altar, stones, props, rg, lpool };
}

// ---------------------------------------------------------------- 可走区域（入口大厅 + 走廊 + 场地，关着的门、首领战火墙、石柱挡路）
function walkable(x: number, z: number, r = 0.45, geomOnly = false): boolean {
  if (!run) return true;
  const lx = (x - run.O.x) / S, lz = (z - run.O.z) / S, def = run.def;   // 11-18 设计坐标；玩家 / 怪的半径不放大 → ÷ S
  r /= S;
  if (run.route) {
    if (!routeWalkable(run.route, run.rs, lx, lz, r)) return false;
    if (geomOnly) return true;
    if (run.boss?.engaged) { const a = arenaL(def, run.boss.room); if (Math.hypot(lx - a.x, lz - a.z) > def.rooms[run.boss.room].arena.r - r) return false; }
    for (const p of run.pillars) if (p.hp > 0 && Math.hypot(lx - p.lx, lz - p.lz) < 1.1 + r) return false;
    for (const pr of run.route.props) if ((pr.kind === 'icewall' && !run.rs.flags.includes('icewall')) && Math.hypot(lx - pr.x, lz - pr.z) < 2.4 + r) return false;
    return true;
  }
  let ok = Math.abs(lx) <= 8 - r && lz <= 6 - r && lz >= -10.5;
  for (const room of def.rooms) {
    if (!ok && Math.abs(lx) <= CORRIDOR_HALF - r && lz <= room.corridor[1] + 1.5 && lz >= room.corridor[0] - 1.5) ok = true;
    if (!ok && Math.hypot(lx, lz - room.arena.z) <= room.arena.r - r) ok = true;
  }
  if (!ok) return false;
  if (geomOnly) return true;
  // 关着的门：前一个首领没倒下不能往南越过
  for (let i = 1; i < def.rooms.length; i++) if (run.gates[i].visible && lz < def.rooms[i].corridor[1] - 0.2 && run.killed < i) return false;
  if (def.hidden && !run.hiddenOpen && lz < def.rooms[def.hidden.room].corridor[1] - 0.2) return false;
  for (const b of run.props.barrels) if (b.alive && Math.hypot(lx - b.lx, lz - b.lz) < 0.8 + r) return false;
  // 首领战：不能离开场地
  if (run.boss?.engaged) { const a = def.rooms[run.boss.room].arena; if (Math.hypot(lx, lz - a.z) > a.r - r) return false; }
  for (const p of run.pillars) if (p.hp > 0 && Math.hypot(lx - p.lx, lz - p.lz) < 1.1 + r) return false;
  return true;
}
/** 调试：某点能不能站 */
export function raidWalk(x: number, z: number) { return walkable(x, z); }
/** 调试：副本灯池状态（登记灯数 / 槽数 / 在用 / 假光）；没开灯池为 null */
export function raidLightPool() { return run ? built[run.def.id]?.lpool?.stat() ?? null : null; }
export function raidClamp(p: THREE.Vector3, prev?: Pos) {
  if (prisonAt) { p.x = prisonAt.x; p.z = prisonAt.z; return; }
  if (walkable(p.x, p.z)) return;
  const q = prev ?? { x: p.x, z: p.z };
  // v0.6.10 路线图：走廊和场地的接口有斜角，先试着沿墙滑（转 ±25°/±50°/±75°）
  if (run?.route && prev) {
    const dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz);
    if (L > 1e-4) for (const a of [0.44, -0.44, 0.87, -0.87, 1.31, -1.31]) {
      const c = Math.cos(a), sn = Math.sin(a), k = Math.cos(a);
      const nx = q.x + (dx * c - dz * sn) * k, nz = q.z + (dx * sn + dz * c) * k;
      if (walkable(nx, nz)) { p.x = nx; p.z = nz; return; }
    }
  }
  if (walkable(p.x, q.z)) { p.z = q.z; return; }
  if (walkable(q.x, p.z)) { p.x = q.x; return; }
  if (walkable(q.x, q.z)) { p.x = q.x; p.z = q.z; return; }
  // 被技能推/拉到不能站的地方：就近找一个能站的点，实在找不到才回存档点
  for (let rr = 0.5; rr <= 8; rr += 0.5) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
    if (walkable(x, z)) { p.x = x; p.z = z; return; }
  }
  const c = checkpointPos(); p.x = c.x; p.z = c.z;
}

// ---------------------------------------------------------------- 预警与熔岩区
function tele(pos: Pos, r: number, t: number, pct: number, name: string, o: Partial<Hazard> = {}) {
  const id = hzSeq++;
  const mat = G.telegraphMaterial();
  if (o.safe) mat.uniforms.color.value.setRGB(1, 0.05, 0.02);
  if (o.noDmg) mat.uniforms.color.value.setRGB(1, 0.55, 0.1);
  const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
  disc.rotation.x = -Math.PI / 2; disc.position.set(pos.x, 0.05, pos.z);
  CX.scene.add(disc); telegraphs.set(id, { disc, mat, r, total: t, left: t });
  if (run?.hell) pct *= 1.2;
  pct *= curMul.hz;
  hazards.push({ id, pos: { ...pos }, r, left: t, pct, el: runEl(), name, ...o });
  return id;
}
function lavaAt(pos: Pos, r: number, dur: number, dpsPct: number) {
  const id = hzSeq++;
  const pal = run!.def.palette;
  const disc = zoneStorm(pos, r, runEl(), dur, undefined, undefined, false, BOSS_ZONE_GAIN);   // v1.2.80b 副本熔岩 / 毒池：实心圆盘 → 通用区域件，判定环保留（淡一档）
  const ring = M.makeRing(pal.zoneRing, 0.55); ring.scale.setScalar(r); ring.position.set(pos.x, 0.07, pos.z);
  CX.scene.add(ring); poisonZones.set(id, { disc, ring, p: { ...pos }, r });
  lavas.push({ id, pos: { ...pos }, r, left: dur, dps: dpsPct, tick: 0.5 });
}
function clearHazards() {
  for (const h of hazards) { const t = telegraphs.get(h.id); if (t) { CX.scene.remove(t.disc); telegraphs.delete(h.id); } }
  hazards.length = 0;
  for (const l of lavas) { const z = poisonZones.get(l.id); if (z) { stormOff(z.disc); CX.scene.remove(z.ring); poisonZones.delete(l.id); } }
  lavas.length = 0;
  raidSafeSpot = null; if (run) run.rune.visible = false;
}
function hurtPlayer(pct: number, el: Element, src: CombatUnit | null) {
  if (!P().alive) return;
  CX.fx.dealDamage(P(), Math.round(pmax() * pct), el, src);
}
function updateHazards(dt: number) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.left -= dt;
    if (h.safe) BFX.safeTick(h.safe.pos, h.safe.r);
    if (!h.noDmg && !h.warned && h.left < 0.35) { h.warned = true; BFX.teleWarn(h.pos, h.r, BFX.themeOf(h.el)); }
    if (h.left > 0) continue;
    const t = telegraphs.get(h.id); if (t) { CX.scene.remove(t.disc); telegraphs.delete(h.id); }
    hazards.splice(i, 1);
    const pp = P().getPos();
    const inside = d2(pp, h.pos) <= h.r && !(h.safe && d2(pp, h.safe.pos) <= h.safe.r);
    if (!h.noDmg) {
      BFX.bossImpact(h.pos, h.r, BFX.themeOf(h.el), h.pct >= 0.5);   // v0.9.1f：冲击波 + 焦痕 + 主题碎屑（取代旧的圆环 + 粒子）
      CX.audio.bossSlam();
      if (inside && P().alive) {
        if (P().status.isInvulnerable) { P().onImmune(); CX.feel.emit('bossSlamMiss'); }
        else { hurtPlayer(h.pct, h.el, run?.boss?.unit ?? null); h.onHit?.(); CX.feel.emit('bossSlam'); }
      } else CX.feel.emit('bossSlamMiss');
    }
    h.onEnd?.();
  }
  for (let i = lavas.length - 1; i >= 0; i--) {
    const l = lavas[i];
    l.left -= dt; l.tick -= dt;
    BFX.zoneTick(l.pos, l.r, BFX.themeOf(runEl()));
    if (l.tick <= 0) { l.tick += 0.5; if (P().alive && d2(P().getPos(), l.pos) <= l.r) CX.fx.dealDamage(P(), Math.round(pmax() * l.dps * 0.5 * curMul.hz), runEl(), null); }
    if (l.left <= 0) { const z = poisonZones.get(l.id); if (z) { stormOff(z.disc); CX.scene.remove(z.ring); poisonZones.delete(l.id); } lavas.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- 敌人
const MODEL_OF = (d: { model: string; tint: number; tintK?: number; glow?: number; scale?: number }) => wildModel(d as unknown as WildMob);
function mobType(m: RaidMob, hell = false): EnemyType {
  const H = hell ? { hp: HELL_MUL, dmg: HELL_MUL, ilvl: 40 } : { hp: curMul.hp, dmg: curMul.dmg, ilvl: curMul.ilvlMob };
  return { name: m.name, hp: Math.round(m.hp * H.hp), dmg: Math.round(m.dmg * H.dmg), interval: m.interval, speed: m.speed, aggro: m.aggro, range: m.range, xp: m.xp, ilvl: H.ilvl, model: MODEL_OF(m),
    ranged: m.ranged, patrol: 0.5, level: RAID_LEVEL, elite: !['slag', 'offering', 'prison', 'clone'].includes(m.mech), leash: 60, shot: m.shot as EnemyType['shot'] };
}
interface MobRt { mech: EliteMech; cast: number; castT: number; castHp: number; cd: number; berserk: boolean; yaw: number }
const mobRt = new WeakMap<Enemy, MobRt>();
function spawnMob(kind: string, at: Pos, provoke = false) {
  const d = run!.def.mobs[kind];
  const e = new CX.Enemy(kind, ENEMY_TYPES[kind], new THREE.Vector3(at.x, 0, at.z), 'raid', 'raid', 0, d.mech === 'slag' || d.mech === 'offering' || d.mech === 'prison' ? 'trash' : run?.dg ? 'dg_trash' : 'raid_trash');
  if (d.mech === 'totem' || d.mech === 'prison') e.ccImmune = true;
  mobRt.set(e, { mech: d.mech, cast: 0, castT: 0, castHp: 0, cd: 4 + Math.random() * 3, berserk: false, yaw: e.yaw });
  e.preDamage = (amt, src) => amt * mobMul(e, src);
  CX.enemies.push(e);
  if (provoke) e.brain.provoke();
  return e;
}
/** 受到伤害倍率：盾卫正面、图腾光环、首领的破甲/护盾 */
function mobMul(e: Enemy, src: CombatUnit | null): number {
  let k = 1;
  const ap = run?.aby?.plan;   // v0.8.1 深渊畸变：石肤 / 荆棘
  if (ap?.has('stone')) k *= MUTS.stone.value;
  if (ap?.has('thorns') && src === P() && CX.T - thornT > 0.4) { thornT = CX.T; hurtPlayer(MUTS.thorns.value, 'physical', e); }
  const rt = mobRt.get(e);
  if (rt?.mech === 'guard' && src) {
    const s = src.getPos(), fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    const dx = s.x - e.pos.x, dz = s.z - e.pos.z, dl = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / dl > 0.45) k *= 0.15;
  }
  if (rt?.mech !== 'totem' && CX.enemies.some(t => t.alive && t.z === 'raid' && mobRt.get(t)?.mech === 'totem' && d2(t.pos, e.pos) < 9 * S)) k *= 0.5;   // 11-18 怪与怪之间的光环半径跟布局一起 × S
  return k;
}
function liveRaid() { return CX.enemies.filter(e => e.alive && e.z === 'raid'); }

function mechTip(mech: string, text: string) {
  if (!run || run.seen.has(mech)) return;
  run.seen.add(mech);
  if (raidRec.tipsOff) return;
  const el = CX.$('raid-tip'); el.textContent = text; el.style.display = 'block';
  clearTimeout((el as unknown as { _t: number })._t);
  (el as unknown as { _t: number })._t = window.setTimeout(() => { el.style.display = 'none'; }, 6000);
  if (!raidRec.seen.includes(mech)) raidRec.seen.push(mech);
}

function updateMobs(dt: number) {
  for (const e of CX.enemies) {
    if (e.z !== 'raid') continue;
    const rt = mobRt.get(e); if (!rt) continue;
    if (!e.alive) {
      if (deadSeen.has(e.uid)) continue;
      deadSeen.add(e.uid);
      if (run?.aby?.plan.burst && !e.isBoss) lavaAt(e.getPos(), 2.2, MUTS.burst.value, 0.05);   // v0.8.0 深渊畸变「爆裂」
      if (rt.mech === 'bomber') { const p = e.getPos(); tele(p, 3.6, 2, 0.38, run!.def.theme === 'frost' || run!.def.theme === 'troll' ? '冰尸爆裂' : run!.def.theme === 'sand' ? '圣甲虫爆裂' : '熔渣爆炸'); mechTip('bomber', MECH_TIPS.bomber); }
      continue;
    }
    const fighting = e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack');
    if (fighting && rt.mech !== 'slag' && rt.mech !== 'clone') { const dt2 = DG_TIPS[e.kind]; if (dt2) mechTip(e.kind, dt2); else mechTip(rt.mech, MECH_TIPS[rt.mech]); }
    if (rt.mech === 'guard') {
      // 转身很慢：限制每秒转角
      let d = e.yaw - rt.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      rt.yaw += THREE.MathUtils.clamp(d, -1.4 * dt, 1.4 * dt); e.yaw = rt.yaw; e.rig.root.rotation.y = rt.yaw;
    }
    if (rt.mech === 'berserk' && !rt.berserk && e.hp < e.maxHp * 0.3) {
      rt.berserk = true;
      e.brain = new EnemyBrain(e, e.getPos(), { ...enemyConfig(e.type), attackInterval: e.type.interval / 2, moveSpeed: e.type.speed * 1.25 }, (tg, dd) => enemyStrike(e, tg, dd));
      e.brain.provoke();
      e.rig.flash.forEach(m => m.emissive.setHex(0x8a1000));
      CX.floatText(e, '狂暴！', '#ff4020');
    }
    if (rt.mech === 'healer' && fighting) {
      if (rt.cast > 0) {
        rt.cast -= dt;
        if (Math.random() < 0.4) CX.particles.emit({ x: e.pos.x, y: 1.8, z: e.pos.z }, { count: 2, color: 0x7aff7a, color2: 0xffffff, speed: 0.6, up: 1.5, radius: 0.8, life: 0.6, size: 0.3 });
        if (rt.castHp - e.hp >= e.maxHp * 0.12) { rt.cast = 0; rt.cd = 8; CX.floatText(e, '治疗被打断！', '#3f3'); CX.audio.interrupt(); }
        else if (rt.cast <= 0) {
          rt.cd = 9;
          for (const a of liveRaid()) if (d2(a.pos, e.pos) < 12 * S && !a.isBoss) { const v = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * 0.2)); if (v > 0) { a.hp += v; a.onHealed(v); } }
          CX.spawnRing(e.getPos(), 12 * S, '#7aff7a', 0.5); CX.audio.heal();
        }
      } else if ((rt.cd -= dt) <= 0) { rt.cast = 2.5; rt.castHp = e.hp; CX.floatText(e, '治疗读条…', '#7aff7a'); }
    }
  }
}

// ---------------------------------------------------------------- 首领
interface CastState { name: string; t: number; dur: number; shield?: number; shieldMax?: number; onDone: () => void; onBreak?: () => void }
abstract class RaidBoss {
  /** v0.9.6c 首领条阶段刻度（血量比例；空 = 不按血量转阶段） */
  ticks: number[] = [0.5];
  unit!: Enemy;
  engaged = false; t = 0; phase = 0; cds: Record<string, number> = {};
  dmgMul = 1; enrageT = 0; stun = 0; cast: CastState | null = null;
  extra: Enemy[] = [];             // 双子的第二个本体
  constructor(public def: RaidBossDef, public room: number) {}
  get units(): Enemy[] { return [this.unit, ...this.extra]; }
  get alive() { return this.units.some(u => u.alive); }
  get center() { return arenaC(this.room); }
  get arenaR() { return run!.def.rooms[this.room].arena.r * S; }   // 11-18 世界半径（设计 × S）
  spawnUnit(def: RaidBossDef, at: Pos, kind: string, loot?: string): Enemy {
    const H = run!.hell ? { hp: HELL_MUL, dmg: HELL_MUL } : curMul;
    const type: EnemyType = { name: def.name, hp: Math.round(def.hp * H.hp), dmg: Math.round(def.dmg * H.dmg), interval: def.interval, speed: def.speed, aggro: 14, range: def.range, xp: def.xp, ilvl: run!.hell ? 44 : curMul.ilvlBoss,
      model: MODEL_OF(def), level: RAID_LEVEL, elite: true, leash: 99 };
    ENEMY_TYPES[kind] = type;
    // v0.9.3h 副本专属掉落：每个首领独立表（深渊等没有专属表的照旧用通用表）
    const own = run!.aby ? undefined : run!.def.hidden && this.room === run!.def.hidden.room ? dlTableId(run!.def.id, this.room, true) : dlTableId(run!.def.id, this.room);
    loot ??= own && LOOT_TABLES[own] ? own : run!.dg ? (this.room >= lastRegular() ? 'dg_final' : 'dg_boss') : this.room === run!.def.bosses.length - 1 ? 'raid_final' : 'raid_boss';
    const e = new CX.Enemy(kind, type, new THREE.Vector3(at.x, 0, at.z), 'raid', 'raid', 0, loot, true);
    e.ccImmune = true;
    const base = new EnemyBrain(e, e.getPos(), { ...enemyConfig(e.type), leashRange: 99, patrolRadius: 0 },   // 11-18 e.type = 副本里放大过距离的那份
      (tg, dd) => { if (this.stun <= 0) { enemyStrike(e, tg, dd * this.dmgMul * this.unitMul(e) * (dgxRun()?.enraged ? 2 : 1)); this.onStrike(e); } });
    e.brain = {
      update: (dt: number, p: CombatUnit | null): AIIntent => {
        const it = base.update(dt, p) as AIIntent & { casting?: { name: string; progress: number } | null; phaseIndex?: number };
        if (this.stun > 0 || this.cast || this.busy(e)) { it.moveDir = null; it.speed = 0; it.attacked = false; }
        if (this.engaged && p && it.state !== 'attack') it.state = 'chase';
        it.casting = this.cast ? { name: this.cast.name, progress: this.cast.t / this.cast.dur } : null;
        it.phaseIndex = this.phase;
        return it;
      },
      provoke: () => base.provoke(),
    };
    e.preDamage = (amt, src) => this.absorb(e, amt, src);
    CX.enemies.push(e);
    return e;
  }
  setup(c: Pos) { this.unit = this.spawnUnit(this.def, { x: c.x, z: c.z - (this.room === 0 ? 4.5 : 3) * S }, `raid_boss_${this.def.id}`); }   // 11-18 站位跟场地 × S
  unitMul(_e: Enemy) { return 1; }
  onStrike(_e: Enemy) {}
  more: Twist[] = [];   // v0.6.5 隐藏首领：同时带多个借来的机制
  fury = false;         // v0.6.10 余怒
  /** 首领倒下时收掉自己的场景效果（锁链、影子、黑暗、囚笼） */
  cleanupFx() { prisonAt = null; raidSafeSpot = null; setDarkness(false); this.endCastFx(false); }
  busy(_e: Enemy) { return false; }
  absorb(e: Enemy, amt: number, _src: CombatUnit | null): number {
    if (this.stun > 0 && this.vulnerableWhenStunned) amt *= 1.5;
    if (this.cast?.shield !== undefined && this.cast.shield > 0 && e === this.unit) {
      const used = Math.min(this.cast.shield, amt); this.cast.shield -= used; amt -= used;
      if (used > 0) this.bubble?.flash();
      if (this.cast.shield <= 0) { const c = this.cast; this.cast = null; this.endCastFx(true); c.onBreak?.(); }
    }
    return amt;
  }
  vulnerableWhenStunned = false;
  hpPct() { const us = this.units; return us.reduce((s, u) => s + Math.max(0, u.hp), 0) / us.reduce((s, u) => s + u.maxHp, 0); }
  ready(id: string, cd: number, first = 0) { if (this.cds[id] === undefined) this.cds[id] = first; if (this.cds[id] > 0) return false; this.cds[id] = cd; return true; }
  say(text: string, sec = 3) { CX.yell(`${this.def.name.split(' ').pop()}：${text}`, '#ff6a40', sec); }
  startCast(c: Omit<CastState, 't'>) {
    this.cast = { ...c, t: 0 }; CX.$('cb-name').textContent = c.name; CX.audio.bossCast(); this.unit.rig.anim?.play('castLong', 0.8);
    // v0.9.1f：读条聚能法阵；带护盾的读条罩上能量泡
    this.endCastFx(false);
    const u = this.unit, th = this.theme(), sc = u.rig.scale;
    this.castFx = BFX.castCharge(() => u.pos, th, c.dur, sc);
    if (c.shield !== undefined && c.shield > 0) this.bubble = BFX.shieldBubble(() => u.pos, th, sc, c.dur + 1);
  }
  castFx: (() => void) | null = null;
  bubble: { flash(): void; stop(broken: boolean): void } | null = null;
  theme(): BFX.BossTheme { return BFX.themeOf(runEl()); }
  endCastFx(broken: boolean) {
    this.castFx?.(); this.castFx = null;
    if (this.bubble) { this.bubble.stop(broken); this.bubble = null; }
    if (broken) BFX.castBreak(this.unit.pos, this.theme(), this.unit.rig.scale);
  }
  tick(dt: number) {
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.stun > 0) { this.stun -= dt; if (Math.random() < 0.3) CX.particles.emit({ x: this.unit.pos.x, y: 2.6 * this.unit.rig.scale, z: this.unit.pos.z }, { count: 1, color: 0xffe14d, speed: 1.2, up: 0.1, life: 0.4, size: 0.3 }); }
    if (this.enrageT > 0) { this.enrageT -= dt; if (this.enrageT <= 0) this.dmgMul = this.baseMul(); }
    if (this.cast) { this.cast.t += dt; if (this.cast.t >= this.cast.dur) { const c = this.cast; this.cast = null; this.endCastFx(false); c.onDone(); } }
    if (this.dmgMul > 1) for (const u of this.units) if (u.alive) BFX.enrageTick(u.pos, u.rig.scale);   // v0.9.1f 狂暴红焰
    this.t += dt;
    if (this.def.enrage && this.t > this.def.enrage && this.dmgMul < 3) { this.dmgMul = 3; this.say('时间到了，凡人！', 3); }
    this.script(dt);
    if (this.twist && this.engaged) this.twist.tick(this, dt);
    if (this.engaged) for (const tw of this.more) tw.tick(this, dt);
  }
  twist: Twist | null = null;
  baseMul() { return this.def.enrage && this.t > this.def.enrage ? 3 : 1; }
  abstract script(dt: number): void;
  onEngage() { this.say(this.def.lines.intro, 4); CX.audio.roar(); for (const u of this.units) BFX.bossEntrance(u.pos, this.theme(), u.rig.scale); }
  onPhase(i: number) { const l = this.def.lines.phase?.[i - 1]; if (l) this.say(l, 3); CX.audio.roar(); CX.feel.kick(0.3); for (const u of this.units) if (u.alive) BFX.phaseBurst(u.pos, this.theme(), u.rig.scale); }
  setPhase(i: number) { if (i <= this.phase) return; this.phase = i; CX.audio.phaseStinger?.(); this.onPhase(i); }
  dispose() { this.endCastFx(false); this.twist?.dispose(); this.more.forEach(t => t.dispose()); for (const u of this.units) { const i = CX.enemies.indexOf(u); if (i >= 0) { u.dispose(); CX.enemies.splice(i, 1); } } }
}

/** 1. 熔铸者 戈拉克：三连地裂；每掉 30% 血放 3 个熔渣爬向熔炉 */
class Gorak extends RaidBoss {
  slags: Enemy[] = []; waves = 0;
  script() {
    const hp = this.hpPct();
    if (hp < 0.5) this.setPhase(1);
    const want = hp < 0.1 ? 3 : hp < 0.4 ? 2 : hp < 0.7 ? 1 : 0;
    while (this.waves < want) { this.waves++; this.spawnSlags(); }
    if (this.ready('fissure', this.phase ? 7 : 9, 4) && P().alive) {
      const b = this.unit.getPos(), p = P().getPos(), dl = d2(b, p) || 1, dx = (p.x - b.x) / dl, dz = (p.z - b.z) / dl;
      [3.2, 6.6, 10].forEach((r, i) => tele({ x: b.x + dx * r, z: b.z + dz * r }, 2.7, 1.1 + i * 0.4, 0.3, '三连地裂'));
      if (Math.random() < 0.4) this.say(this.def.lines.big!, 1.8);
      this.unit.rig.anim?.play('heavy');
    }
    // 熔渣爬进熔炉：首领回血 + 狂暴
    const c = this.center;
    for (const s of this.slags) if (s.alive && d2(s.pos, c) < 2.6 * S) {   // 熔炉跟场景 × S
      s.hp = 0; s.deadAt = CX.T; s.rig.anim?.play('death');
      const v = Math.round(this.unit.maxHp * 0.06); this.unit.hp = Math.min(this.unit.maxHp, this.unit.hp + v); this.unit.onHealed(v);
      this.dmgMul = 1.5; this.enrageT = 12; this.say('哈！炉火更旺了！', 2.5); CX.audio.roar();
      CX.particles.emit({ x: c.x, y: 1, z: c.z }, { count: 60, color: 0xff6a10, color2: 0xffffff, speed: 3, up: 4, radius: 1.5, life: 1, size: 0.5 });
    }
  }
  spawnSlags() {
    const c = this.center, R = this.arenaR - 1.5, a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * Math.PI * 2 / 3, s = spawnMob('mt_slag', { x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R });
      const sp = run!.def.mobs.mt_slag.speed;
      s.brain = { update: (_dt: number) => { const dx = c.x - s.pos.x, dz = c.z - s.pos.z, dl = Math.hypot(dx, dz) || 1; return { state: 'chase', moveDir: { x: dx / dl, z: dz / dl }, speed: sp, faceTo: { x: c.x, z: c.z }, attacked: false }; }, provoke: () => {} };
      this.slags.push(s);
    }
    mechTip('slag', MECH_TIPS.slag); CX.audio.telegraph();
  }
  dispose() { super.dispose(); for (const s of this.slags) { const i = CX.enemies.indexOf(s); if (i >= 0) { s.dispose(); CX.enemies.splice(i, 1); } } }
}

/** 2. 双生焰灵：血量差 > 10% 时血多的狂暴；伊格留火焰轨迹，妮丝牵引 + 脚下红圈 */
class Twins extends RaidBoss {
  ticks = [] as number[];
  trail = 0; warned = false; solo = false;
  get ig() { return this.unit; } get nis() { return this.extra[0]; }
  setup(c: Pos) {
    this.unit = this.spawnUnit({ ...this.def, name: '焰灵 伊格' }, { x: c.x - 3, z: c.z - 3 }, 'raid_twin_ig');
    this.extra.push(this.spawnUnit({ ...this.def, name: '焰灵 妮丝', tint: 0xffb040, glow: 0x7a4000 }, { x: c.x + 3, z: c.z - 3 }, 'raid_twin_nis'));
  }
  unitMul(e: Enemy) {
    if (this.solo) return 1.3;
    const a = this.ig.hp / this.ig.maxHp, b = this.nis.hp / this.nis.maxHp;
    return Math.abs(a - b) > 0.1 && (e === this.ig ? a > b : b > a) ? 1.6 : 1;
  }
  script(dt: number) {
    const a = this.ig.hp / this.ig.maxHp, b = this.nis.hp / this.nis.maxHp;
    if (!this.solo && (!this.ig.alive || !this.nis.alive)) { this.solo = true; this.setPhase(1); }
    if (!this.solo && Math.abs(a - b) > 0.1) {
      const hi = a > b ? this.ig : this.nis;
      if (Math.random() < 0.25) CX.particles.emit({ x: hi.pos.x, y: 2, z: hi.pos.z }, { count: 2, color: 0xff2010, color2: 0xffa040, speed: 1, up: 2, radius: 0.8, life: 0.6, size: 0.4 });
      if (run) run.chalFail ||= run.def.id === 'molten_throne';
      if (!this.warned) { this.warned = true; CX.yell(`${hi.name.includes('伊格') ? '伊格' : '妮丝'}狂暴了！血量差超过 10%，打血多的那个`, '#ffb040', 3); }
    }
    // 伊格：移动时留下火焰轨迹
    if (this.ig.alive && (this.trail -= dt) <= 0) { this.trail = 1.1; const it = this.ig.intent; if (it?.moveDir) lavaAt(this.ig.getPos(), 1.5, 6, 0.06); }
    // 妮丝：烈焰牵引（读条 1.6 秒，读完把你拉到身边 + 脚下红圈）
    if (this.nis.alive && !this.cast && this.ready('pull', 15, 8)) {
      const n = this.nis;
      this.cast = { name: '烈焰牵引', t: 0, dur: 1.6, onDone: () => {
        if (!P().alive || !n.alive) return;
        if (!P().status.isInvulnerable) { const dx = P().pos.x - n.pos.x, dz = P().pos.z - n.pos.z, dl = Math.hypot(dx, dz) || 1; P().pos.x = n.pos.x + dx / dl * 2; P().pos.z = n.pos.z + dz / dl * 2; CX.toast('被妮丝拉了过去！快离开红圈', '#ff9a40'); }
        tele(P().getPos(), 3, 1.3, 0.35, '烈焰牵引');
      } };
      CX.$('cb-name').textContent = '烈焰牵引'; CX.audio.bossCast(); this.say(this.def.lines.big!, 2);
    }
  }
  busy(e: Enemy) { return e === this.nis && !!this.cast; }
}

/** 3. 岩鳞巨蜥：冲锋撞石柱眩晕 8 秒破甲；持续落石 */
class Samur extends RaidBoss {
  charge: { dir: Pos; left: number; wind: number; hitP: boolean } | null = null;
  vulnerableWhenStunned = true;
  busy() { return !!this.charge; }
  script(dt: number) {
    if (this.hpPct() < 0.5) this.setPhase(1);
    const u = this.unit, c = this.center;
    if (this.ready('rocks', this.phase ? 5 : 6.5, 3)) {
      for (let i = 0; i < 3; i++) { let p: Pos; let n = 0; do { const a = Math.random() * Math.PI * 2, r = Math.random() * (this.arenaR - 2); p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }; } while (d2(p, u.getPos()) < 3.5 && n++ < 10); tele(p, 2.5, 1.8, 0.25, '落石'); }
    }
    if (!this.charge && this.stun <= 0 && P().alive && this.ready('charge', 13, 7)) {
      const b = u.getPos(), p = P().getPos(), dl = d2(b, p) || 1, dir = { x: (p.x - b.x) / dl, z: (p.z - b.z) / dl };
      this.charge = { dir, left: 2.2, wind: 1.4, hitP: false };
      for (let k = 1; k <= 7; k++) { const q = { x: b.x + dir.x * k * 2.8, z: b.z + dir.z * k * 2.8 }; if (d2(q, c) > this.arenaR) break; tele(q, 1.9, 1.4, 0, '冲锋路径', { noDmg: true }); }
      this.say(this.def.lines.big!, 1.6); CX.audio.telegraph();
      mechTip('samur_charge', '巨蜥冲锋：让它撞上石柱 → 眩晕 8 秒、受到伤害 +50%');
    }
    if (this.charge) {
      const ch = this.charge;
      if (ch.wind > 0) { ch.wind -= dt; u.yaw = Math.atan2(ch.dir.x, ch.dir.z); if (Math.random() < 0.5) CX.particles.emit({ x: u.pos.x, y: 0.2, z: u.pos.z }, { count: 2, color: 0x8a7a66, speed: 2, up: 1, radius: 1.5, life: 0.5, size: 0.4 }); return; }
      const step = 22 * dt; ch.left -= dt;
      const nx = u.pos.x + ch.dir.x * step, nz = u.pos.z + ch.dir.z * step;
      const pil = run!.pillars.find(pl => pl.hp > 0 && Math.hypot((nx - run!.O.x) / S - pl.lx, (nz - run!.O.z) / S - pl.lz) < 2.4);
      if (pil) {
        this.charge = null; pil.hp--; this.stun = 8;
        CX.yell('萨穆尔撞上石柱！护甲破碎 8 秒——全力输出！', '#3f3', 3); CX.audio.bossSlam(); CX.feel.kick(0.5);
        CX.particles.emit({ x: nx, y: 1.5, z: nz }, { count: 80, color: 0x8a7a66, color2: 0xffd060, speed: 6, up: 3, life: 1, size: 0.5, gravity: 6 });
        if (pil.hp <= 0) { pil.obj.visible = false; CX.toast('一根石柱碎了', '#ffb080'); } else pil.obj.rotation.z = 0.12;
        return;
      }
      if (d2({ x: nx, z: nz }, c) > this.arenaR - 1.8 || ch.left <= 0) { this.charge = null; this.stun = 1.2; return; }
      u.pos.x = nx; u.pos.z = nz;
      if (!ch.hitP && P().alive && d2(P().getPos(), u.getPos()) < 2.4) {
        ch.hitP = true;
        if (P().status.isInvulnerable) P().onImmune(); else { hurtPlayer(0.4, 'physical', u); P().pos.x += ch.dir.z * 2.5; P().pos.z -= ch.dir.x * 2.5; }
      }
    }
  }
}

/** 4. 炎誓大祭司：炎狱献祭（护盾读条，打掉护盾打断）；二阶段召唤献祭者加厚护盾 */
class Priest extends RaidBoss {
  ticks = [0.6];
  offerings: Enemy[] = [];
  script() {
    if (this.hpPct() < 0.6) this.setPhase(1);
    if (!this.cast && this.ready('erupt', 8, 4) && P().alive) {
      const c = this.center, a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
      tele(P().getPos(), 3, 1.6, 0.3, '火焰喷发'); tele({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, 3, 1.6, 0.3, '火焰喷发');
    }
    if (this.phase >= 1 && !this.cast && this.ready('summon', 30, 0)) {
      const c = this.center;
      for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; this.offerings.push(spawnMob('mt_offering', { x: c.x + Math.cos(a) * 9 * S, z: c.z + Math.sin(a) * 9 * S }, true)); }
      this.cds.sac = Math.max(this.cds.sac ?? 0, 5); mechTip('offering', MECH_TIPS.offering);
    }
    if (!this.cast && this.ready('sac', 30, 14)) {
      const living = this.offerings.filter(o => o.alive).length;
      const sh = Math.round(this.unit.maxHp * 0.012 * (1 + 0.25 * living));
      this.say(this.def.lines.big!, 3);
      mechTip('priest_shield', '炎狱献祭：6 秒内打掉护盾就能打断，否则全屏高额伤害');
      this.startCast({ name: `炎狱献祭（护盾 ${sh}）`, dur: 6, shield: sh, shieldMax: sh,
        onDone: () => { hurtPlayer(0.5, 'fire', this.unit); CX.spawnRing(this.center, this.arenaR, '#ff3010', 0.6); CX.feel.kick(0.6); CX.audio.bossSlam(); this.say('烧吧！', 2); },
        onBreak: () => { this.stun = 3; CX.yell('护盾破碎！「炎狱献祭」被打断', '#3f3', 2.5); CX.audio.interrupt(); this.unit.rig.anim?.play('hit'); } });
    }
    if (this.cast?.shield !== undefined && Math.random() < 0.5) {
      const u = this.unit; CX.particles.emit({ x: u.pos.x, y: 1.6 * u.rig.scale, z: u.pos.z }, { count: 3, color: 0xffb040, color2: 0xff3010, speed: 0.8, up: 1, radius: 1.4 * u.rig.scale, life: 0.5, size: 0.4 });
      CX.$('cb-name').textContent = `炎狱献祭（护盾 ${Math.max(0, Math.round(this.cast.shield!))}）`;
    }
  }
  dispose() { super.dispose(); for (const s of this.offerings) { const i = CX.enemies.indexOf(s); if (i >= 0) { s.dispose(); CX.enemies.splice(i, 1); } } }
}

/** 5. 熔心君王：熔岩之潮 → 崩塌王庭 → 王座崩塌（符文安全点），6 分钟狂暴 */
class Valkaz extends RaidBoss {
  ticks = [0.7, 0.3];
  collapsed = 0;
  script() {
    const hp = this.hpPct(), c = this.center, R = this.arenaR, u = this.unit;
    if (hp < 0.7) this.setPhase(1);
    if (hp < 0.3) this.setPhase(2);
    if (this.ready('meteor', this.phase === 2 ? 9 : 7, 5) && P().alive) tele(P().getPos(), 3, 1.5, 0.3, '熔核坠落');
    if (this.phase === 0 && this.ready('wave', 11, 6)) {
      // 一排排熔岩波：横排 2 米半径的圈，缺口在首领附近（近战跟着首领走）
      const ang = Math.floor(Math.random() * 4) * Math.PI / 2, dir = { x: Math.cos(ang), z: Math.sin(ang) }, side = { x: -dir.z, z: dir.x };
      const ub = (u.pos.x - c.x) * side.x + (u.pos.z - c.z) * side.z;
      for (let row = 0; row < 4; row++) {
        const along = -R + 3 + row * (2 * R - 6) / 3;
        const half = Math.sqrt(Math.max(0, R * R - along * along));
        const gap = THREE.MathUtils.clamp(ub + (Math.random() - 0.5) * 2, -half + 3, half - 3);
        for (let s = -half + 1.5; s <= half - 1.5; s += 3.2) {
          if (Math.abs(s - gap) < 3) continue;
          tele({ x: c.x + dir.x * along + side.x * s, z: c.z + dir.z * along + side.z * s }, 2, 1.8 + row * 0.9, 0.32, '熔岩之潮');
        }
      }
      mechTip('valkaz_wave', '熔岩之潮：一排排推过来，找缺口（在首领附近）穿过去，或者翻滚穿过');
    }
    if (this.phase >= 1 && this.collapsed < 10 && this.ready('collapse', 7, 2)) {
      const a = this.collapsed * Math.PI * 2 / 10 + 0.31, pos = { x: c.x + Math.cos(a) * (R - 3.2), z: c.z + Math.sin(a) * (R - 3.2) };
      this.collapsed++;
      tele(pos, 3.4, 2.2, 0.35, '地板塌陷', { onEnd: () => lavaAt(pos, 3.4, 9999, 0.12) });
      if (this.collapsed === 1) mechTip('valkaz_collapse', '崩塌王庭：外圈地板一块块塌成熔岩，往中间站');
    }
    if (this.phase === 2 && !raidSafeSpot && this.ready('throne', 20, 1)) {
      let p: Pos; let n = 0;
      do { const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 5.5; p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }; } while (lavas.some(l => d2(l.pos, p) < l.r + 2.4) && n++ < 20);
      raidSafeSpot = p; run!.rune.position.set(p.x, 0, p.z); run!.rune.visible = true;
      this.say(this.def.lines.big!, 3); CX.audio.roar();
      mechTip('valkaz_throne', '王座崩塌：全场大红圈，只有发光的符文能站！');
      tele(c, R + 1, 4.5, 0.85, '王座崩塌', { safe: { pos: p, r: 2.4 }, onEnd: () => { raidSafeSpot = null; if (run) run.rune.visible = false; } });
    }
  }
  onPhase(i: number) { super.onPhase(i); if (i === 2) CX.audio.roar(); }
}

// ======================================================================  永霜墓穴（v0.6.1）
/** 玩家被冰柱囚笼困住时的位置（raidClamp 锁住移动） */
let prisonAt: Pos | null = null;
let darkLight: THREE.PointLight | null = null;
// 11-18 永霜墓穴首领倒下卡顿：尾王「永冬之王」30% 以下必开永夜，倒下时 cleanupFx 关黑暗走 setZoneLook('raid')，
// 那条路会整场重设外观 + 动态分辨率复位（渲染目标重建）+ 整场景（含所有隐藏野外）同步预编译遍历，正好叠在倒下特效 / 掉落 / 结算同一帧。
// 永夜只改了雾和背景色，开的时候记下原值，关的时候原样还回去即可；?off=darkrestore 回旧做法（整场重设）。
const DARK_RESTORE = (() => { try { return !/(?:[?&]off=[^&]*\bdarkrestore\b)/.test(location.search); } catch { return true; } })();
let darkSaved: { near: number; far: number; fog: number; bg: number | null } | null = null;
function setDarkness(on: boolean) {
  const fog = CX.scene.fog as THREE.Fog;
  if (on) {
    if (!darkLight) { const bg = CX.scene.background as THREE.Color | null; darkSaved = fog ? { near: fog.near, far: fog.far, fog: fog.color.getHex(), bg: bg?.isColor ? bg.getHex() : null } : null; }   // 11-18 记下永夜前的雾 / 背景（永霜墓穴首领倒下卡顿）
    fog.near = 2; fog.far = 15; fog.color.setHex(0x000000); (CX.scene.background as THREE.Color).setHex(0x000000);
    if (!darkLight) { darkLight = new THREE.PointLight(0xbfe0ff, 6, 11); CX.scene.add(darkLight); }
  } else {
    if (!darkLight) return;   // v1.2.77 没开黑暗就不重设场景外观（以前每个首领倒下都整场重设 + 预编译遍历，约 140ms）
    CX.scene.remove(darkLight); darkLight = null;
    const sv = darkSaved; darkSaved = null;
    const bg = CX.scene.background as THREE.Color | null;
    if (DARK_RESTORE && sv && CX.zone === 'raid' && fog?.isFog && (sv.bg === null || bg?.isColor)) {
      // 11-18 只还原雾和背景色（永霜墓穴首领倒下卡顿）：不再整场 setZoneLook / zoneReset / 整场景预编译
      fog.near = sv.near; fog.far = sv.far; fog.color.setHex(sv.fog);
      if (sv.bg !== null && bg?.isColor) bg.setHex(sv.bg);
      return;
    }
    if (CX.zone === 'raid') CX.setZoneLook('raid');
  }
}
function chainLine(): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(0x7ad8ff).multiplyScalar(2.5), toneMapped: false }));
  ln.frustumCulled = false; CX.scene.add(ln); return ln;
}

/** 1. 墓穴守门人：灵魂锁链连到墓碑，离墓碑 14 米拉断（受一次伤害），10 秒没拉断重伤 */
class Keeper extends RaidBoss {
  chain: { stone: Pos; t: number; line: THREE.Line; tick: number } | null = null;
  script(dt: number) {
    if (this.hpPct() < 0.5) this.setPhase(1);
    const c = this.center;
    if (this.ready('dirt', 9, 4)) { for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 10; tele(i ? { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r } : P().getPos(), 3, 1.6, 0.28, '墓土翻涌'); } }
    if (!this.chain && this.ready('chain', this.phase ? 15 : 18, 7) && P().alive) {
      const st = run!.stones[Math.floor(Math.random() * run!.stones.length)].position, stone = { x: st.x, z: st.z };
      this.chain = { stone, t: 0, line: chainLine(), tick: 1 };
      // 安全方向：从墓碑穿过场地中心往外跑
      const dx = c.x - stone.x, dz = c.z - stone.z, dl = Math.hypot(dx, dz) || 1, far = Math.min(15, this.arenaR - 1.5 + dl);
      raidSafeSpot = { x: stone.x + dx / dl * far, z: stone.z + dz / dl * far };
      if (d2(raidSafeSpot, c) > this.arenaR - 1.5) { const k = (this.arenaR - 1.5) / d2(raidSafeSpot, c); raidSafeSpot = { x: c.x + (raidSafeSpot.x - c.x) * k, z: c.z + (raidSafeSpot.z - c.z) * k }; }
      this.say(this.def.lines.big!, 2.5); CX.audio.bossCast();
      mechTip('keeper_chain', '灵魂锁链：朝墓碑反方向跑，离墓碑 14 米一次拉断');
    }
    if (this.chain) {
      const ch = this.chain, pp = P().getPos();
      ch.t += dt; ch.tick -= dt;
      const pos = ch.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, ch.stone.x, 1.5, ch.stone.z); pos.setXYZ(1, pp.x, 1.2, pp.z); pos.needsUpdate = true;
      if (ch.tick <= 0) { ch.tick += 1; hurtPlayer(0.03, 'shadow', this.unit); P().status.add({ key: 'chain-slow', kind: 'slow', remaining: 1.1, percent: 0.3, source: this.unit }); }
      const d = d2(pp, ch.stone);
      if (d > 14 || ch.t > 10 || !P().alive) {
        const ok = d > 14;
        if (P().alive) hurtPlayer(ok ? 0.2 : 0.45, 'shadow', this.unit);
        CX.yell(ok ? '锁链断了！' : '锁链收紧——没能拉断！', ok ? '#7fd7ff' : '#ff6040', 2);
        CX.scene.remove(ch.line); this.chain = null; raidSafeSpot = null;
      }
    }
  }
  dispose() { super.dispose(); if (this.chain) { CX.scene.remove(this.chain.line); this.chain = null; } raidSafeSpot = null; }
}

/** 2. 霜语女巫：70% / 35% 分出 3 个镜像，只有带影子的是真身；打镜像在你脚下触发冰霜新星 */
class Vesra extends RaidBoss {
  ticks = [] as number[];
  clones: Enemy[] = []; splits = 0; splitHp = 0; splitT = 0; shadow: THREE.Object3D | null = null;
  script(dt: number) {
    const hp = this.hpPct(), u = this.unit;
    if (this.ready('blizzard', 7, 4) && P().alive) tele(P().getPos(), 3, 1.5, 0.28, '暴风雪');
    const want = hp < 0.35 ? 2 : hp < 0.7 ? 1 : 0;
    if (this.splits < want && !this.clones.length) { this.splits++; this.split(); }
    if (this.clones.length) {
      this.splitT += dt;
      if (this.shadow) this.shadow.position.set(u.pos.x, 0.07, u.pos.z);
      if (this.splitHp - u.hp > u.maxHp * 0.06 || this.splitT > 25) this.unsplit();
    }
  }
  split() {
    const c = this.center, u = this.unit, a0 = Math.random() * Math.PI * 2;
    this.setPhase(1); this.say(this.def.lines.big!, 2.5); CX.audio.roar();
    mechTip('clone', MECH_TIPS.clone);
    const spots = [0, 1, 2].map(i => ({ x: c.x + Math.cos(a0 + i * 2.094) * 7, z: c.z + Math.sin(a0 + i * 2.094) * 7 }));
    const me = Math.floor(Math.random() * 3);
    u.pos.set(spots[me].x, 0, spots[me].z);
    ENEMY_TYPES.raid_vesra_clone = { ...ENEMY_TYPES[u.kind], hp: u.maxHp, dmg: 1, elite: true };
    spots.forEach((sp, i) => {
      if (i === me) return;
      const e = new CX.Enemy('raid_vesra_clone', ENEMY_TYPES.raid_vesra_clone, new THREE.Vector3(sp.x, 0, sp.z), 'raid', 'raid', 0, 'trash');
      e.hp = u.hp; e.ccImmune = true;
      mobRt.set(e, { mech: 'clone', cast: 0, castT: 0, castHp: 0, cd: 0, berserk: false, yaw: e.yaw });
      let last = -9;
      e.preDamage = () => { if (CX.T - last > 2.5 && P().alive) { last = CX.T; tele(P().getPos(), 4, 0.9, 0.32, '冰霜新星'); CX.floatText(e, '幻影！', '#9ad8ff'); } return 0; };
      CX.enemies.push(e); e.brain.provoke(); this.clones.push(e);
    });
    this.shadow = M.makeDisc('#000000', 0.65, 1.8); CX.scene.add(this.shadow);
    this.splitHp = u.hp; this.splitT = 0;
    CX.particles.emit({ x: c.x, y: 1, z: c.z }, { count: 80, color: 0x9ad8ff, color2: 0xffffff, speed: 6, up: 2, radius: 3, life: 0.8, size: 0.4 });
  }
  unsplit() {
    for (const e of this.clones) { e.hp = 0; e.deadAt = CX.T; e.rig.anim?.play('death'); }
    this.clones = [];
    if (this.shadow) { CX.scene.remove(this.shadow); this.shadow = null; }
    CX.yell('镜像碎了！', '#7fd7ff', 2);
  }
  dispose() { super.dispose(); for (const e of this.clones) { const i = CX.enemies.indexOf(e); if (i >= 0) { e.dispose(); CX.enemies.splice(i, 1); } } this.clones = []; if (this.shadow) { CX.scene.remove(this.shadow); this.shadow = null; } }
}

/** 3. 骨龙幼体：每 30 秒飞起 12 秒（无法攻击、直线吐息扫场）；落地时甩尾打身后 */
class Wyrm extends RaidBoss {
  air = 0; nextAir = 30; sweeps = 0;
  busy() { return this.air > 0; }
  absorb(e: Enemy, amt: number, src: CombatUnit | null) { if (this.air > 0) return 0; return super.absorb(e, amt, src); }
  script(dt: number) {
    const u = this.unit, c = this.center;
    if (this.air > 0) {
      this.air -= dt;
      u.pos.y = Math.min(5, u.pos.y + dt * 6);
      if (this.ready('breath', 3.6, 1) && this.sweeps < 3) {
        this.sweeps++; this.say(this.def.lines.big!, 1.5);
        // 一条穿过玩家附近的直线（从场地一边到另一边）
        const ang = Math.random() * Math.PI, dir = { x: Math.cos(ang), z: Math.sin(ang) }, p = P().getPos();
        const off = (p.x - c.x) * -dir.z + (p.z - c.z) * dir.x + (Math.random() - 0.5) * 3;
        const half = Math.sqrt(Math.max(4, this.arenaR ** 2 - off * off));
        for (let s = -half; s <= half; s += 3) tele({ x: c.x + dir.x * s - dir.z * off, z: c.z + dir.z * s + dir.x * off }, 2.1, 1.7, 0.35, '寒霜吐息');
        mechTip('wyrm_breath', '寒霜吐息：一整条线扫过来，往线的两侧走');
      }
      if (this.air <= 0) { this.setPhaseName(0); u.pos.y = 0; CX.audio.bossSlam(); CX.feel.kick(0.4); CX.spawnRing(u.getPos(), 4, '#bfe6ff', 0.4); }
      return;
    }
    if (u.pos.y > 0) u.pos.y = Math.max(0, u.pos.y - dt * 8);
    this.nextAir -= dt;
    if (this.nextAir <= 0) { this.nextAir = 30; this.air = 12; this.sweeps = 0; this.cds.breath = 1.5; this.setPhaseName(1); u.pos.set(c.x, 0, c.z); this.say('（骨翼展开，寒脊飞上半空）', 2); return; }
    if (this.ready('tail', 6, 3) && P().alive) {
      const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw), back = { x: u.pos.x - fx * 3.4, z: u.pos.z - fz * 3.4 };
      tele(back, 3.2, 0.9, 0.35, '甩尾');
      if (d2(P().getPos(), back) < 3.4) mechTip('wyrm_tail', '甩尾：别站在骨龙身后');
    }
    if (this.ready('frost', 8, 5) && P().alive) tele(P().getPos(), 2.8, 1.5, 0.25, '寒霜碎片');
  }
  setPhaseName(i: number) { this.phase = i; }
}

/** 4. 亡誓骑士团：盾骑（全体减伤）、旗骑（全体回血）、剑骑（高伤 + 剑刃风暴）；每倒下一个，剩下的 +25% 伤害 */
class Knights extends RaidBoss {
  ticks = [] as number[];
  deaths = 0;
  get shield() { return this.unit; } get banner() { return this.extra[0]; } get blade() { return this.extra[1]; }
  setup(c: Pos) {
    this.unit = this.spawnUnit({ ...this.def, name: '亡誓盾骑', tint: 0x4a5a6a }, { x: c.x - 3.5, z: c.z - 3 }, 'raid_knight_shield');
    this.extra.push(this.spawnUnit({ ...this.def, name: '亡誓旗骑', tint: 0x2a4a7a, glow: 0x0a2a6a }, { x: c.x + 3.5, z: c.z - 3 }, 'raid_knight_banner'));
    this.extra.push(this.spawnUnit({ ...this.def, name: '亡誓剑骑', tint: 0x6a3a3a, glow: 0x3a0a0a }, { x: c.x, z: c.z - 5.5 }, 'raid_knight_blade'));
  }
  unitMul(e: Enemy) { return (e === this.blade ? 1.3 : 1) * (1 + 0.25 * this.deaths); }
  absorb(e: Enemy, amt: number, src: CombatUnit | null) { if (this.shield.alive) amt *= 0.75; return super.absorb(e, amt, src); }
  script(dt: number) {
    const dead = this.units.filter(u => !u.alive).length;
    if (dead > this.deaths) { this.deaths = dead; this.setPhase(dead); CX.yell(`骑士倒下了——其余骑士伤害 +${25 * dead}%`, '#ffb040', 2.5); }
    if (this.banner.alive && (this.cds.heal = (this.cds.heal ?? 1) - dt) <= 0) {
      this.cds.heal = 1;
      for (const u of this.units) if (u.alive) { const v = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * 0.003)); if (v > 0) { u.hp += v; } }
      if (Math.random() < 0.3) CX.particles.emit({ x: this.banner.pos.x, y: 2.5, z: this.banner.pos.z }, { count: 3, color: 0x7aff9a, speed: 0.5, up: 1.5, life: 0.6, size: 0.3 });
    }
    if (this.blade.alive && this.ready('whirl', 9, 6)) { tele(this.blade.getPos(), 4.2, 1.4, 0.32, '剑刃风暴'); if (Math.random() < 0.5) CX.yell(`剑骑：${this.def.lines.big!.replace('剑骑：', '')}`, '#ff6a40', 1.6); }
    if (this.ready('charge', 11, 8) && P().alive) tele(P().getPos(), 2.6, 1.3, 0.22, '誓言冲击');
    if (this.shield.alive) mechTip('knights', '亡誓骑士团：推荐击杀顺序 盾骑 → 旗骑 → 剑骑');
  }
}

/** 5. 永冬之王：寒意（站着不动叠层，叠满冻结）→ 冰柱囚笼 → 永夜（全场变暗），6 分钟狂暴 */
class Ithran extends RaidBoss {
  ticks = [0.7, 0.3];
  chill = 0; sample = 0; lastP: Pos | null = null; prison: Enemy | null = null; prisonT = 0;
  script(dt: number) {
    const hp = this.hpPct(), c = this.center, pp = P().getPos();
    if (hp < 0.7) this.setPhase(1);
    if (hp < 0.3 && this.phase < 2) { this.setPhase(2); setDarkness(true); mechTip('ithran_dark', '永夜：全场变暗，红圈依然在地上发光'); }
    if (darkLight) darkLight.position.set(pp.x, 3, pp.z);
    // 寒意
    this.sample -= dt;
    if (this.sample <= 0) {
      this.sample = 0.5;
      const moved = this.lastP ? d2(this.lastP, pp) : 1; this.lastP = pp;
      if (P().status.isInvulnerable || moved > 0.6) this.chill = Math.max(0, this.chill - 3);
      else if (!this.prison) this.chill++;
      if (this.chill >= 4) mechTip('ithran_chill', '寒意：站着不动会叠层，叠满 10 层冻结——边打边挪步');
      if (this.chill >= 10) {
        this.chill = 0; hurtPlayer(0.2, 'frost', this.unit); if (run) run.chalFail ||= run.def.id === 'frost_crypt';
        P().status.add({ key: 'stun', kind: 'stun', remaining: 2.5, source: this.unit });
        CX.yell('你被冻结了！', '#9ad8ff', 2); CX.audio.bossSlam();
      }
      if (this.chill > 0) CX.particles.emit({ x: pp.x, y: 1.2, z: pp.z }, { count: this.chill, color: 0xbfe6ff, color2: 0xffffff, speed: 0.6, up: 0.6, radius: 0.6, life: 0.5, size: 0.2 });
    }
    if (this.ready('comet', this.phase === 2 ? 5 : 7, 4) && P().alive) { tele(pp, 3, 1.5, 0.28, '寒冰彗星'); if (this.phase === 2) for (let i = 0; i < 2; i++) { const a = Math.random() * 6.28, r = 3 + Math.random() * 9; tele({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r }, 2.6, 1.8, 0.25, '冰刺'); } }
    // 冰柱囚笼
    if (this.phase >= 1 && !this.prison && this.ready('prison', 22, 3) && P().alive) {
      prisonAt = { ...pp };
      this.prison = spawnMob('fc_prison', { x: pp.x + 0.01, z: pp.z + 0.9 });
      this.prisonT = 8; this.chill = 0;
      this.say(this.def.lines.phase![0], 2.5); mechTip('prison', MECH_TIPS.prison);
    }
    if (this.prison) {
      this.prisonT -= dt;
      if (!this.prison.alive) { this.prison = null; prisonAt = null; CX.yell('冰柱碎了，你自由了！', '#7fd7ff', 1.6); }
      else if (this.prisonT <= 0 || !P().alive) { const pr = this.prison; pr.hp = 0; pr.deadAt = CX.T; this.prison = null; prisonAt = null; if (P().alive) { hurtPlayer(0.3, 'frost', this.unit); CX.yell('冰柱囚笼压碎了你！', '#ff6040', 2); } }
    }
  }
  dispose() { super.dispose(); if (this.prison) { const i = CX.enemies.indexOf(this.prison); if (i >= 0) { this.prison.dispose(); CX.enemies.splice(i, 1); } } this.prison = null; prisonAt = null; setDarkness(false); }
}


// ======================================================================  v0.6.3：炼狱难度 / 机制混搭（畸变首领）
export const HELL_MUL = 1.5;
let darkChanceOverride: number | null = null;
/** 测试用：强制暗金掉率 */
export function setRaidDarkChance(v: number | null) { darkChanceOverride = v; }
/** v0.9.6b 太古几率覆盖（测试用；null = 正常几率） */
let ancientOverride: number | null = null;
export function setAncientChance(v: number | null) { ancientOverride = v; }
const ancP = (p: number) => ancientOverride ?? p;
/** 掉落时判定太古；出了就弹全屏太古横幅（v0.9.6c） */
function rollAnc(items: ItemInstance[], p: number) {
  for (const it of items) if (rollAncient(CX.gen, it, ancP(p))) CX.ancientBanner(it.name);   // v0.9.6c 全屏红金横幅 + 音效
}
export const CHALLENGE: Partial<Record<RaidId, string>> = { molten_throne: '双生焰灵：两个焰灵的血量差始终不超过 10%（一次都不让它们狂暴）', frost_crypt: '永冬之王：一次都没被寒意冻结' };

type TwistKey = 'quake' | 'chill' | 'lava' | 'breath' | 'chain';
const TWISTS: TwistKey[] = ['quake', 'chill', 'lava', 'breath', 'chain'];
export const TWIST_NAME: Record<TwistKey, string> = { quake: '三连地裂', chill: '寒意', lava: '熔岩足迹', breath: '寒霜吐息', chain: '灵魂锁链' };
export const TWIST_DESC: Record<TwistKey, string> = {
  quake: '每 12 秒朝你的方向连放 3 个地裂红圈', chill: '站着不动会叠寒意，满 10 层冻结（移动或翻滚清层）', lava: '每 9 秒在你脚下留下一滩熔岩（12 秒）',
  breath: '每 20 秒一道直线吐息扫过场地', chain: '每 22 秒把你锁到场边的锚点，离锚点 14 米才能拉断',
};
/** 首领自带的机制不重复借；用到安全点（raidSafeSpot）的首领不借锁链 */
const NATIVE: Record<string, TwistKey[]> = { gorak: ['quake'], twins: ['lava'], samur: [], priest: [], valkaz: ['lava', 'chain'], keeper: ['chain'], vesra: [], wyrm: ['breath'], knights: [], ithran: ['chill'] };
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function pickTwist(raid: RaidId, i: number, salt: string): TwistKey {
  const bad = NATIVE[RAIDS[raid].bosses[i].id] ?? [];
  const pool = TWISTS.filter(t => !bad.includes(t));
  return pool[hashStr(`${salt}|${raid}|${i}`) % pool.length];
}
export function weeklyTwist(raid: RaidId, now = Date.now()) {
  const wk = weekKey(now), boss = hashStr(`boss|${wk}|${raid}`) % RAIDS[raid].bosses.length;
  return { boss, key: pickTwist(raid, boss, `w${wk}`) };
}
/** 本周畸变首领带借来的机制；炼狱里每个首领都带一个 */
function twistFor(raid: RaidId, i: number, hell: boolean): TwistKey | null {
  const w = weeklyTwist(raid);
  if (w.boss === i) return w.key;
  return hell ? pickTwist(raid, i, `h${weekKey(Date.now())}`) : null;
}

class Twist {
  t = 0; cd = 6; chill = 0; sample = 0; lastP: Pos | null = null;
  chain: { anchor: Pos; t: number; line: THREE.Line; tick: number } | null = null;
  constructor(readonly key: TwistKey) {}
  tick(B: RaidBoss, dt: number) {
    const pp = P().getPos(), c = B.center, R = B.arenaR;
    if (!P().alive) return;
    this.cd -= dt;
    if (this.key === 'quake' && this.cd <= 0) {
      this.cd = 12;
      const u = B.unit.getPos(), dx = pp.x - u.x, dz = pp.z - u.z, l = Math.hypot(dx, dz) || 1;
      for (let k = 1; k <= 3; k++) tele({ x: u.x + dx / l * k * 3.6, z: u.z + dz / l * k * 3.6 }, 2.4, 1.0 + k * 0.35, 0.22, `畸变 · ${TWIST_NAME.quake}`);
      mechTip('twist_quake', `畸变：${TWIST_NAME.quake}——${TWIST_DESC.quake}`);
    } else if (this.key === 'lava' && this.cd <= 0) {
      this.cd = 9;
      const at = { ...pp };
      tele(at, 2.6, 1.3, 0.15, `畸变 · ${TWIST_NAME.lava}`, { onEnd: () => lavaAt(at, 2.6, 12, 0.08) });
      mechTip('twist_lava', `畸变：${TWIST_NAME.lava}——${TWIST_DESC.lava}`);
    } else if (this.key === 'breath' && this.cd <= 0) {
      this.cd = 20;
      const ang = Math.random() * Math.PI, dir = { x: Math.cos(ang), z: Math.sin(ang) };
      const off = (pp.x - c.x) * -dir.z + (pp.z - c.z) * dir.x + (Math.random() - 0.5) * 3, half = Math.sqrt(Math.max(4, R * R - off * off));
      for (let s = -half; s <= half; s += 3) tele({ x: c.x + dir.x * s - dir.z * off, z: c.z + dir.z * s + dir.x * off }, 2.1, 1.8, 0.3, `畸变 · ${TWIST_NAME.breath}`);
      mechTip('twist_breath', `畸变：${TWIST_NAME.breath}——往线的两侧走`);
    } else if (this.key === 'chill') {
      this.sample -= dt;
      if (this.sample <= 0) {
        this.sample = 0.5;
        const moved = this.lastP ? d2(this.lastP, pp) : 1; this.lastP = pp;
        if (P().status.isInvulnerable || moved > 0.6) this.chill = Math.max(0, this.chill - 3); else if (!prisonAt) this.chill++;
        if (this.chill >= 4) mechTip('twist_chill', `畸变：${TWIST_NAME.chill}——${TWIST_DESC.chill}`);
        if (this.chill >= 10) { this.chill = 0; hurtPlayer(0.2, 'frost', B.unit); P().status.add({ key: 'stun', kind: 'stun', remaining: 2.5, source: B.unit }); CX.yell('你被冻结了！', '#9ad8ff', 2); }
        if (this.chill > 0) CX.particles.emit({ x: pp.x, y: 1.2, z: pp.z }, { count: this.chill, color: 0xbfe6ff, speed: 0.6, up: 0.6, radius: 0.6, life: 0.5, size: 0.2 });
      }
    } else if (this.key === 'chain') {
      if (!this.chain && this.cd <= 0 && !raidSafeSpot) {
        this.cd = 22;
        const a = Math.random() * Math.PI * 2, anchor = { x: c.x + Math.cos(a) * (R - 1), z: c.z + Math.sin(a) * (R - 1) };
        this.chain = { anchor, t: 0, line: chainLine(), tick: 1 };
        raidSafeSpot = { x: c.x - Math.cos(a) * (R - 2), z: c.z - Math.sin(a) * (R - 2) };
        mechTip('twist_chain', `畸变：${TWIST_NAME.chain}——朝锚点反方向跑`);
      }
      const ch = this.chain;
      if (ch) {
        ch.t += dt; ch.tick -= dt;
        const pos = ch.line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, ch.anchor.x, 1.2, ch.anchor.z); pos.setXYZ(1, pp.x, 1.2, pp.z); pos.needsUpdate = true;
        if (ch.tick <= 0) { ch.tick += 1; hurtPlayer(0.025, 'shadow', B.unit); }
        const d = d2(pp, ch.anchor);
        if (d > 14 || ch.t > 10) { hurtPlayer(d > 14 ? 0.15 : 0.35, 'shadow', B.unit); CX.yell(d > 14 ? '锁链断了！' : '锁链收紧！', d > 14 ? '#7fd7ff' : '#ff6040', 1.6); this.dispose(); }
      }
    }
  }
  dispose() { if (this.chain) { CX.scene.remove(this.chain.line); this.chain = null; if (this.key === 'chain') raidSafeSpot = null; } }
}

// ======================================================================  v0.6.5：沙葬王陵 / 巨魔冰窟 的首领
/** 王陵 1. 蝎后 卡瑟拉：毒刺叠蝎毒（翻滚清层，5 层爆发）；钻地后从你脚下钻出；50% 孵化小沙蝎 */
class Kasra extends RaidBoss {
  venom = 0; burrow = 0; hidden = false;
  onStrike() {
    if (P().status.isInvulnerable) return;
    this.venom++;
    P().status.add({ key: 'kasra-venom', kind: 'dot', remaining: 6, dps: Math.round(pmax() * 0.008 * this.venom * curMul.hz), element: 'nature', source: this.unit });
    if (this.venom >= 3) mechTip('kasra_venom', '蝎毒叠到 3 层了——翻滚可以清掉所有层数，5 层会爆发');
    if (this.venom >= 5) { this.venom = 0; P().status.remove('kasra-venom'); hurtPlayer(0.3 * curMul.hz, 'nature', this.unit); CX.yell('蝎毒爆发！', '#9aff40', 1.8); }
  }
  busy() { return this.hidden; }
  absorb(e: Enemy, amt: number, src: CombatUnit | null) { return this.hidden ? 0 : super.absorb(e, amt, src); }
  script(dt: number) {
    if (this.venom > 0 && P().status.isInvulnerable) { this.venom = 0; P().status.remove('kasra-venom'); CX.floatText(P() as unknown as Enemy, '蝎毒清除', '#9aff40'); }
    if (this.hpPct() < 0.5) this.setPhase(1);
    if (!this.hidden && this.ready('burrow', 16, 9)) {
      this.hidden = true; this.burrow = 2; this.unit.rig.root.visible = false; this.say(this.def.lines.big!, 2); CX.audio.telegraph();
      CX.particles.emit({ x: this.unit.pos.x, y: 0.3, z: this.unit.pos.z }, { count: 50, color: 0xc8a060, color2: 0x8a6a40, speed: 4, up: 2, radius: 1.5, life: 0.8, size: 0.5, gravity: 6 });
    }
    if (this.hidden && (this.burrow -= dt) <= 0 && this.burrow > -50) {
      this.burrow = -99;
      const at = { ...P().getPos() };
      tele(at, 3.2, 1.2, 0.35, '钻地突袭', { onEnd: () => { this.unit.pos.x = at.x; this.unit.pos.z = at.z; this.unit.rig.root.visible = true; this.hidden = false; this.unit.rig.anim?.play('heavy'); } });
    }
    if (this.phase >= 1 && this.ready('hatch', 20, 0)) {
      const c = this.center;
      for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2; spawnMob('st_spawn', { x: c.x + Math.cos(a) * 8 * S, z: c.z + Math.sin(a) * 8 * S }, true); }
      mechTip('st_spawn', '小沙蝎：血很少，清掉再打首领'); CX.audio.telegraph();
    }
    if (!this.hidden && this.ready('sting', 9, 5) && P().alive) tele(P().getPos(), 2.6, 1.3, 0.26, '尾刺穿刺');
  }
  cleanupFx() { super.cleanupFx(); this.unit.rig.root.visible = true; P().status.remove('kasra-venom'); }
}

/** 王陵 2. 沙匪头目 拉希德：扔炸药（红圈里的火药桶会一起爆炸，炸伤并眩晕首领）；回旋刀；叫打手 */
class Rashid extends RaidBoss {
  adds = 0;
  script() {
    const hp = this.hpPct();
    if (hp < 0.5) this.setPhase(1);
    const want = hp < 0.3 ? 2 : hp < 0.6 ? 1 : 0;
    while (this.adds < want) { this.adds++; const c = this.center; for (const s of [-1, 1]) spawnMob('st_bandit', { x: c.x + s * 8 * S, z: c.z - 8 * S }, true); this.say(this.def.lines.phase![0], 2.5); }
    if (this.ready('dyn', 14, 6) && P().alive) {
      const at = { ...P().getPos() };
      this.say(this.def.lines.big!, 2);
      mechTip('rashid_dyn', '炸药：跑到火药桶旁边，让爆炸把桶点着（首领受重伤并眩晕），然后自己离开红圈');
      tele(at, 3.6, 3, 0.32, '炸药', { onEnd: () => {
        for (const b of run!.props.barrels) if (b.alive && Math.hypot(run!.O.x + b.lx * S - at.x, run!.O.z + b.lz * S - at.z) <= 4.2) {
          b.alive = false; b.obj.visible = false;
          const bp = { x: run!.O.x + b.lx * S, z: run!.O.z + b.lz * S };
          CX.spawnRing(bp, 4, '#ffb040', 0.5); CX.particles.emit({ x: bp.x, y: 0.6, z: bp.z }, { count: 80, color: 0xffa040, color2: 0x3a2a1a, speed: 6, up: 3, radius: 1.5, life: 1, size: 0.6, gravity: 4 });
          const v = Math.round(this.unit.maxHp * 0.08); this.unit.hp = Math.max(1, this.unit.hp - v); CX.floatText(this.unit, `-${v}`, '#ffb040');
          this.stun = 4; CX.yell('火药桶被引爆！拉希德被炸晕了', '#ffd060', 2.5); CX.feel.kick(0.5);
        }
      } });
    }
    if (this.ready('blade', 9, 4) && P().alive) {
      const b = this.unit.getPos(), p = P().getPos(), dl = d2(b, p) || 1, dx = (p.x - b.x) / dl, dz = (p.z - b.z) / dl;
      for (let k = 1; k <= 4; k++) tele({ x: b.x + dx * k * 3, z: b.z + dz * k * 3 }, 2.1, 1.0 + k * 0.15, 0.2, '回旋刀');
    }
  }
}

/** 王陵 3. 沙葬法老 塞特赫：法老之眼（背对）；70% 流沙外圈；35% 木乃伊（活着时法老减伤 50%） */
class Setekh extends RaidBoss {
  ticks = [0.7, 0.35];
  mummies: Enemy[] = []; sandA = 0;
  absorb(e: Enemy, amt: number, src: CombatUnit | null) { const k = this.mummies.some(m => m.alive) ? 0.5 : 1; return super.absorb(e, amt * k, src); }
  script() {
    const hp = this.hpPct();
    if (hp < 0.7) this.setPhase(1);
    if (hp < 0.35) this.setPhase(2);
    if (!this.cast && this.ready('eye', 22, 10)) {
      this.say(this.def.lines.big!, 2.5);
      mechTip('setekh_eye', '法老之眼：读条结束时还面朝法老会被恐惧——转身背对他');
      this.startCast({ name: '法老之眼', dur: 3, onDone: () => {
        if (!P().alive || P().status.isInvulnerable) return;
        const y = P().rig.root.rotation.y, fx = Math.sin(y), fz = Math.cos(y), u = this.unit.getPos(), pp = P().getPos();
        const dx = u.x - pp.x, dz = u.z - pp.z, dl = Math.hypot(dx, dz) || 1;
        if ((dx * fx + dz * fz) / dl > 0.2) { hurtPlayer(0.3, 'shadow', this.unit); P().status.add({ key: 'stun', kind: 'stun', remaining: 2.5, source: this.unit }); CX.yell('你直视了法老之眼——恐惧！', '#ffd060', 2); }
        else CX.yell('背对法老，躲过了凝视', '#3f3', 1.5);
      } });
    }
    if (this.phase >= 1 && this.ready('sand', 6, 0)) {
      // 外圈一段一段变成流沙，安全区慢慢转
      this.sandA += 0.9;
      const c = this.center, R = this.arenaR - 2.5;
      for (let k = 0; k < 5; k++) { const a = this.sandA + k * 0.32; lavaAt({ x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R }, 2.8, 7, 0.05); }
      mechTip('setekh_sand', '流沙：外圈一段段变成流沙，站上去持续掉血——跟着安全区走');
    }
    if (this.phase >= 2 && this.ready('mummy', 30, 0)) {
      const c = this.center;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; this.mummies.push(spawnMob('st_mummy', { x: c.x + Math.cos(a) * 9 * S, z: c.z + Math.sin(a) * 9 * S }, true)); }
      this.say(this.def.lines.phase![1], 2.5);
    }
    if (!this.cast && this.ready('slam', 10, 5) && P().alive) tele(P().getPos(), 3, 1.4, 0.28, '审判之杖');
  }
  dispose() { super.dispose(); for (const s of this.mummies) { const i = CX.enemies.indexOf(s); if (i >= 0) { s.dispose(); CX.enemies.splice(i, 1); } } }
}

/** 隐藏首领：同时带两个借来的机制，半血再加一个 */
class HiddenBoss extends RaidBoss {
  keys: [TwistKey, TwistKey, TwistKey] = ['quake', 'lava', 'breath'];
  onEngage() { super.onEngage(); this.more = [new Twist(this.keys[0]), new Twist(this.keys[1])]; }
  script() {
    if (this.hpPct() < 0.5 && this.phase < 1) { this.setPhase(1); this.more.push(new Twist(this.keys[2])); }
    if (this.ready('slam', 8, 4) && P().alive) tele(P().getPos(), 2.8, 1.3, 0.25, `${this.def.name}之击`);
  }
}
class Warden extends HiddenBoss { keys: [TwistKey, TwistKey, TwistKey] = ['quake', 'lava', 'breath']; }
class Heart extends HiddenBoss { keys: [TwistKey, TwistKey, TwistKey] = ['chill', 'breath', 'chain']; }

/** 冰窟 1. 巨魔双子：一只倒下 10 秒内另一只没死，倒下的站起来（40%）；格鲁扔冰块，莫格震地 */
class Trolls extends RaidBoss {
  ticks = [] as number[];
  downT = -1; revived = 0;
  setup(c: Pos) {
    this.unit = this.spawnUnit({ ...this.def, name: '巨魔 格鲁' }, { x: c.x - 3, z: c.z - 3 }, 'dg_troll_grul');
    this.extra.push(this.spawnUnit({ ...this.def, name: '巨魔 莫格', tint: 0x4a7a6a, scale: 1.75 }, { x: c.x + 3, z: c.z - 3 }, 'dg_troll_mog'));
  }
  get grul() { return this.unit; } get mog() { return this.extra[0]; }
  unitMul() { return this.downT >= 0 ? 1.5 : 1; }
  script(dt: number) {
    const g = this.grul, m = this.mog;
    if (g.alive !== m.alive) {
      if (this.downT < 0) { this.downT = 0; this.setPhase(1); mechTip('troll_rez', '巨魔再生：10 秒内打倒另一只，不然倒下的会站起来'); }
      this.downT += dt;
      if (this.downT >= 10) {
        const dead = g.alive ? m : g, live = g.alive ? g : m;
        const nu = this.spawnUnit({ ...this.def, name: dead.name, tint: dead === m ? 0x4a7a6a : this.def.tint, scale: dead === m ? 1.75 : this.def.scale }, { x: dead.pos.x, z: dead.pos.z }, `${dead.kind}_r${++this.revived}`, 'trash');
        nu.hp = Math.round(nu.maxHp * 0.4); nu.brain.provoke();
        const i = CX.enemies.indexOf(dead); if (i >= 0) { dead.dispose(); CX.enemies.splice(i, 1); }
        if (dead === g) this.unit = nu; else this.extra[0] = nu;
        this.downT = -1; CX.yell(`${live.name.split(' ').pop()}：起来！——${dead.name.split(' ').pop()}重新站了起来`, '#ff6040', 2.5); CX.audio.roar();
      }
    } else this.downT = -1;
    if (g.alive && this.ready('boulder', 11, 5) && P().alive) { tele(P().getPos(), 3.5, 1.8, 0.3, '冰块投掷'); if (Math.random() < 0.5) this.say(this.def.lines.big!, 1.6); }
    if (m.alive && this.ready('smash', 9, 7)) tele(m.getPos(), 5.5, 1.4, 0.3, '震地');
  }
}

/** 冰窟 2. 冰窟萨满 乌尔嘎：霜火图腾（首领减伤）；冰枪（护盾读条）；冰霜新星；50% 风暴 */
class Urga extends RaidBoss {
  totems: Enemy[] = [];
  absorb(e: Enemy, amt: number, src: CombatUnit | null) { const k = this.totems.some(t => t.alive && d2(t.pos, e.pos) < 10) ? 0.5 : 1; return super.absorb(e, amt * k, src); }
  script() {
    if (this.hpPct() < 0.5) this.setPhase(1);
    if (this.ready('totem', 25, 6)) { const u = this.unit.getPos(), a = Math.random() * Math.PI * 2; this.totems.push(spawnMob('tc_totem', { x: u.x + Math.cos(a) * 5, z: u.z + Math.sin(a) * 5 })); mechTip('urga_totem', '霜火图腾：附近的萨满受到伤害 -50%，先拆图腾'); CX.audio.telegraph(); }
    if (!this.cast && this.ready('lance', 18, 10)) {
      const sh = Math.round(this.unit.maxHp * 0.025);
      this.say(this.def.lines.big!, 2.5);
      mechTip('urga_lance', '冰枪：3 秒内打掉护盾就能打断，否则大量冰霜伤害');
      this.startCast({ name: `冰枪（护盾 ${sh}）`, dur: 3, shield: sh, shieldMax: sh,
        onDone: () => { hurtPlayer(0.42, 'frost', this.unit); CX.feel.kick(0.4); CX.audio.bossSlam(); },
        onBreak: () => { this.stun = 2.5; CX.yell('护盾破碎！「冰枪」被打断', '#3f3', 2); CX.audio.interrupt(); } });
    }
    if (this.cast?.shield !== undefined) CX.$('cb-name').textContent = `冰枪（护盾 ${Math.max(0, Math.round(this.cast.shield!))}）`;
    if (!this.cast && this.ready('nova', 12, 8)) tele(this.unit.getPos(), 6, 1.6, 0.3, '冰霜新星');
    if (this.phase >= 1 && this.ready('storm', 8, 2) && P().alive) { const p = P().getPos(); for (let k = 0; k < 3; k++) tele({ x: p.x + (Math.random() - 0.5) * 8, z: p.z + (Math.random() - 0.5) * 8 }, 2.4, 1.5, 0.22, '冰雹'); }
  }
  dispose() { super.dispose(); for (const s of this.totems) { const i = CX.enemies.indexOf(s); if (i >= 0) { s.dispose(); CX.enemies.splice(i, 1); } } }
}

/** 冰窟 3. 雪原巨人 霍尔格：践踏；抓起投掷（落点冰锥）；70% 雪崩直线；35% 冰甲护盾读条（没打掉回 10%） */
class Holger extends RaidBoss {
  ticks = [0.7, 0.35];
  script() {
    const hp = this.hpPct();
    if (hp < 0.7) this.setPhase(1);
    if (hp < 0.35) this.setPhase(2);
    if (!this.cast && this.ready('stomp', 10, 5)) tele(this.unit.getPos(), 6.5, 1.6, 0.32, '践踏');
    if (!this.cast && this.ready('throw', 20, 12) && P().alive && !P().status.isInvulnerable && d2(P().getPos(), this.unit.getPos()) < 8) {
      const c = this.center, a = Math.random() * Math.PI * 2, R = this.arenaR - 2.5;
      const land = { x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R };
      this.say(this.def.lines.big!, 2);
      P().status.add({ key: 'stun', kind: 'stun', remaining: 1.0, source: this.unit });
      P().pos.x = land.x; P().pos.z = land.z; hurtPlayer(0.12, 'physical', this.unit);
      for (let k = 0; k < 3; k++) { const b = k / 3 * Math.PI * 2; tele({ x: land.x + Math.cos(b) * 2.2, z: land.z + Math.sin(b) * 2.2 }, 2.2, 1.6, 0.2, '冰锥'); }
      tele(land, 2, 1.9, 0.2, '冰锥');
      mechTip('holger_throw', '被扔出去了：先离开冰锥红圈');
    }
    if (this.phase >= 1 && this.ready('aval', 14, 2) && P().alive) {
      const c = this.center, R = this.arenaR, pp = P().getPos(), ang = Math.random() * Math.PI, dir = { x: Math.cos(ang), z: Math.sin(ang) };
      const off0 = (pp.x - c.x) * -dir.z + (pp.z - c.z) * dir.x;
      for (const off of [off0, off0 + (Math.random() < 0.5 ? 5 : -5)]) { const half = Math.sqrt(Math.max(4, R * R - off * off)); for (let s = -half; s <= half; s += 3) tele({ x: c.x + dir.x * s - dir.z * off, z: c.z + dir.z * s + dir.x * off }, 2, 1.7, 0.25, '雪崩'); }
      mechTip('holger_aval', '雪崩：一排排雪球滚过来，往线的两侧走');
    }
    if (this.phase >= 2 && !this.cast && this.ready('armor', 30, 3)) {
      const sh = Math.round(this.unit.maxHp * 0.05);
      this.say(this.def.lines.phase![1], 2.5);
      this.startCast({ name: `冰封护甲（护盾 ${sh}）`, dur: 5, shield: sh, shieldMax: sh,
        onDone: () => { const v = Math.round(this.unit.maxHp * 0.1); this.unit.hp = Math.min(this.unit.maxHp, this.unit.hp + v); this.unit.onHealed(v); CX.yell('霍尔格的冰甲成型，恢复了生命', '#9ad8ff', 2); },
        onBreak: () => { this.stun = 3; CX.yell('冰甲碎了！', '#3f3', 2); CX.audio.interrupt(); } });
    }
    if (this.cast?.shield !== undefined) CX.$('cb-name').textContent = `冰封护甲（护盾 ${Math.max(0, Math.round(this.cast.shield!))}）`;
  }
}


/** 铸造厂 1. 铸造监工 葛伦：传送带把人往场边的熔渣池送；鞭笞直线；叫铸工 */
class Overseer extends RaidBoss {
  pits = false;
  script(dt: number) {
    if (this.hpPct() < 0.5) this.setPhase(1);
    const c = this.center, R = this.arenaR, pp = P().pos;
    if (!this.pits) { this.pits = true; for (const bt of FORGE_BELTS) lavaAt({ x: c.x + bt.dir * (R - 2 * S), z: c.z + bt.z * S }, 2.4 * S, 9999, 0.12); }   // 11-18 传送带 / 熔渣池跟场地 × S
    const sp = this.phase ? 4.2 : 2.8;
    for (const bt of FORGE_BELTS) if (Math.abs(pp.z - (c.z + bt.z * S)) < 1.3 * S && Math.abs(pp.x - c.x) < 13 * S && !P().status.isInvulnerable) {
      pp.x += bt.dir * sp * dt; mechTip('forge_belt', '传送带：会把你送进场边的熔渣池，走出去或者翻滚离开');
    }
    for (const a of run!.props.belts) a.position.y = 0.1 + Math.sin(CX.T * 6 + a.position.x) * 0.04;
    if (this.ready('whip', 8, 4) && P().alive) {
      const b = this.unit.getPos(), p = P().getPos(), dl = d2(b, p) || 1, dx = (p.x - b.x) / dl, dz = (p.z - b.z) / dl;
      for (let k = 1; k <= 4; k++) tele({ x: b.x + dx * k * 2.6, z: b.z + dz * k * 2.6 }, 1.9, 1.0 + k * 0.12, 0.24, '鞭笞');
      if (Math.random() < 0.4) this.say(this.def.lines.big!, 1.6);
    }
    if (this.ready('workers', 25, 8)) { for (const s of [-1, 1]) spawnMob('fd_worker', { x: c.x + s * 9 * S, z: c.z - 9 * S }, true); CX.audio.telegraph(); }
  }
  cleanupFx() { super.cleanupFx(); }
}

/** 铸造厂 2. 锻炉傀儡：热度每秒上升，满 100 全场爆炸；引进冷却池 = 清零 + 眩晕 5 秒 + 易伤 */
class ForgeGolem extends RaidBoss {
  ticks = [0.6, 0.3];
  heat = 0; vulnerableWhenStunned = true;
  script(dt: number) {
    if (this.hpPct() < 0.5) this.setPhase(1);
    const rate = this.phase ? 6 : 4.5;
    if (this.stun <= 0) this.heat += rate * dt;
    for (const q of run!.props.pools) { if (q.cd > 0) { q.cd -= dt; if (q.cd <= 0) { q.obj.visible = true; } continue; }
      const qp = { x: run!.O.x + q.lx * S, z: run!.O.z + q.lz * S };
      if (d2(this.unit.pos, qp) < 3.0 * S && this.heat > 15) {   // 冷却池跟场景放大
        this.heat = 0; this.stun = 5; q.cd = 25; q.obj.visible = false;
        CX.particles.emit({ x: qp.x, y: 1, z: qp.z }, { count: 80, color: 0xffffff, color2: 0x9ad8ff, speed: 3, up: 5, radius: 2, life: 1.2, size: 0.6 });
        CX.yell('嗤——！傀儡被冷却池浇熄，眩晕了', '#9ad8ff', 2.5); CX.audio.interrupt();
      } }
    if (this.heat >= 60) mechTip('golem_heat', '热度过 60：把傀儡引进冷却池（站到池子另一侧），满 100 会全场爆炸');
    if (this.heat >= 100) {
      this.heat = 0; hurtPlayer(0.45, 'fire', this.unit); CX.spawnRing(this.center, this.arenaR, '#ff5010', 0.6); CX.feel.kick(0.6); CX.audio.bossSlam(); CX.yell('过热爆炸！', '#ff5010', 2);
    }
    if (this.stun <= 0 && this.ready('hammer', 9, 5) && P().alive) { tele(P().getPos(), 3, 1.4, 0.28, '锻锤'); this.unit.rig.anim?.play('heavy'); }
    if (Math.random() < this.heat / 400) CX.particles.emit({ x: this.unit.pos.x, y: 2.5, z: this.unit.pos.z }, { count: 2, color: 0xffffff, color2: 0xff8040, speed: 1, up: 3, radius: 1, life: 0.7, size: 0.4 });
  }
}

/** 铸造厂 3. 熔铸大师 维克多：浇注（大红圈，铁水灌满模子 = 隐藏首领条件）；熔铁浪；半成品傀儡；外圈熔岩 */
class Master extends RaidBoss {
  minis: Enemy[] = []; ring = false;
  script() {
    const hp = this.hpPct();
    if (hp < 0.6) this.setPhase(1);
    if (hp < 0.3) this.setPhase(2);
    if (!this.cast && this.ready('pour', 13, 5) && P().alive) {
      const at = { ...P().getPos() };
      this.say(this.def.lines.big!, 2);
      tele(at, 3.8, 2.4, 0.34, '浇注', { onEnd: () => {
        lavaAt(at, 3.2, 8, 0.07);
        for (const m of run!.props.molds) if (!m.full && Math.hypot(run!.O.x + m.lx * S - at.x, run!.O.z + m.lz * S - at.z) <= 4.4) {
          m.full = true; m.fill.visible = true;
          const n = run!.props.molds.filter(x => x.full).length;
          CX.toast(`铁水灌进了模子（${n}/${run!.props.molds.length}）`, '#ffa040');
        }
      } });
    }
    if (this.ready('wave', 15, 9) && P().alive) {
      const c = this.center, R = this.arenaR, pp = P().getPos(), ang = Math.random() * Math.PI, dir = { x: Math.cos(ang), z: Math.sin(ang) };
      const off = (pp.x - c.x) * -dir.z + (pp.z - c.z) * dir.x, half = Math.sqrt(Math.max(4, R * R - off * off));
      for (let s = -half; s <= half; s += 3) tele({ x: c.x + dir.x * s - dir.z * off, z: c.z + dir.z * s + dir.x * off }, 2.1, 1.7, 0.26, '熔铁浪');
    }
    if (this.phase >= 1 && this.ready('minis', 35, 0)) { const c = this.center; for (const s of [-1, 1]) this.minis.push(spawnMob('fd_mini', { x: c.x + s * 9 * S, z: c.z }, true)); mechTip('fd_mini', '半成品傀儡：先清掉'); }
    if (this.phase >= 2 && !this.ring) { this.ring = true; const c = this.center, R = this.arenaR - 1.5; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; lavaAt({ x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R }, 2 * S, 9999, 0.08); } this.say(this.def.lines.phase![1], 2.5); }   // 11-18 场边熔岩圈跟周长 × S
  }
  dispose() { super.dispose(); for (const s of this.minis) { const i = CX.enemies.indexOf(s); if (i >= 0) { s.dispose(); CX.enemies.splice(i, 1); } } }
}
class Statue extends HiddenBoss { keys: [TwistKey, TwistKey, TwistKey] = ['quake', 'lava', 'breath']; }

const BOSS_CLASSES: Record<RaidId, (new (def: RaidBossDef, room: number) => RaidBoss)[]> = {
  molten_throne: [Gorak, Twins, Samur, Priest, Valkaz],
  frost_crypt: [Keeper, Vesra, Wyrm, Knights, Ithran],
  sand_tomb: [Kasra, Rashid, Setekh, Warden],
  troll_cave: [Trolls, Urga, Holger, Heart],
  ash_forge: [Overseer, ForgeGolem, Master, Statue],
};

function spawnBoss(i: number) {
  const def0 = run!.def.bosses[i], c = arenaC(i);
  // v1.2.29 第六章剧情最终战：铸像身体里的是暗岩之魂（名字 → 比赛版写实模型 ab_darksoul；无该模型时照旧用铸像外观）
  const def = run!.aby?.st.story && def0.id === 'statue' ? { ...def0, name: STORY_BOSS_NAME } : def0;
  const B = new BOSS_CLASSES[run!.def.id][i](def, i);
  B.setup(c);
  const tk = run!.dg ? null : twistFor(run!.def.id, i, run!.hell);
  if (tk) B.twist = new Twist(tk);
  // v0.6.10 余怒：两翼先死一个，另一个多一个机制、血量 +15%
  const fu = run!.route?.fury;
  if (fu && fu.includes(i) && run!.rs.dead[fu[0] === i ? fu[1] : fu[0]]) {
    B.fury = true; B.more.push(new Twist(pickTwist(run!.def.id, i, 'fury')));
    for (const u of B.units) { u.maxHp = Math.round(u.maxHp * 1.15); u.hp = u.maxHp; }
  }
  run!.boss = B;
}

// ---------------------------------------------------------------- 进入 / 离开 / 存档点 / 复活
export function raidLock(id: RaidId, hell = false): string | null { return CX.progression.level < RAIDS[id].level ? `需要等级 ${RAIDS[id].level}` : hell && !raidRec.clears[id] ? '炼狱：先通关一次标准难度' : null; }
export function inRaid() { return !!run && CX.zone === 'raid'; }
/** v0.7.10：长副本（熔心王座 / 永霜墓穴，不含三首领普通副本）——暗岩印记经验全额 */
export function inLongRaid() { return !!run && CX.zone === 'raid' && (!!run.aby || RAIDS[run.def.id as keyof typeof RAIDS]?.kind !== 'dungeon'); }   // v0.8.0 深渊也算全额

/** startAt：调试/测试用，直接从第 N 个首领开始（前面的首领视为已击败） */
export function enterRaid(id: RaidId, startAt = 0, hell = false, diff: Diff = 'heroic', oaths: OathId[] = []) {
  const lock = raidLock(id, hell);
  if (lock) { CX.toast(`${RAIDS[id].name}：${lock}`, '#f66'); CX.audio.error(); return false; }
  const def = RAIDS[id], dg = def.kind === 'dungeon';
  if (dg) {
    dgxBegin(id, diff, oaths, raidPlace(def));
    const m = dgxMuls(); curMul = { hp: m.hp, dmg: m.dmg, ilvlMob: m.ilvl - 2, ilvlBoss: m.ilvl, hz: m.hz };
  } else { dgxEnd(); curMul = hell ? { hp: HELL_MUL, dmg: HELL_MUL, ilvlMob: 40, ilvlBoss: 44, hz: 1 } : { hp: 1, dmg: 1, ilvlMob: 36, ilvlBoss: 40, hz: 1 }; }
  for (const [k, m] of Object.entries(def.mobs)) ENEMY_TYPES[k] = mobType(m, hell);
  const b = built[id] ??= buildRaid(def);
  CX.panels.forEach(p => CX.togglePanel(p, false));
  run = { def, group: b.group, O: new THREE.Vector3(def.origin.x, 0, def.origin.z), killed: 0, checkpoint: -1, gates: b.gates, walls: b.walls, boss: null, t: 0, deaths: 0, done: false,
    exit: b.exit, finalPortal: b.finalPortal, rune: b.rune, pillars: b.pillars, furnace: b.furnace, altar: b.altar, stones: b.stones, seen: new Set(raidRec.seen), hell, chalFail: false,
    dg, diff: dg ? diff : 'normal', regular: def.hidden ? def.hidden.room : def.bosses.length, hiddenOpen: false, hiddenTried: false, props: b.props,
    route: dg ? null : RAID_ROUTES[id] ?? null, rs: newRouteState(def.bosses.length), cp: 'entry', cps: new Set(['entry']), visited: new Set(['entry']), pulled: [], opened: new Set(), rg: b.rg ?? null, elites: [] };
  // 本周已开过的捷径：一开始就是开的
  if (run.route && raidRec.short?.[id] === weekKey(Date.now())) { for (const [, f] of ROUTE_FLAGS_OF(id)) if (!run.rs.flags.includes(f)) run.rs.flags.push(f); }
  resetProps(b.props);
  b.gates.forEach((g, i) => { g.visible = i > 0; g.position.y = 0; });
  b.walls.forEach(w => { w.visible = false; });
  b.pillars.forEach(p => { p.hp = 2; p.obj.visible = true; p.obj.rotation.z = 0; });
  b.finalPortal.visible = false;
  clearRaidEnemies();
  if (run.route) routeEnter(run, startAt);
  else {
  def.rooms.forEach((room, i) => { if (i >= startAt) for (const pk of room.pack) spawnMob(pk.kind, lw(pk.x, pk.z)); });
  if (startAt > 0) { run.killed = startAt; run.checkpoint = startAt - 1; for (let i = 1; i <= startAt; i++) b.gates[i].visible = false; }
  spawnBoss(startAt);
  }
  CX.setZoneLook('raid');
  const s = checkpointPos(); CX.player.pos.set(s.x, 0, s.z);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0; CX.target = null;
  if (dg) { CX.toast(`进入：${def.name}（${DIFF[diff].name}）· ${run.regular} 个首领`, DIFF[diff].color); dgxHud(); }
  else {
  CX.toast(`进入：${def.name}${hell ? '（炼狱）' : ''}（30 级长副本 · 5 个首领）`, hell ? '#ff4040' : '#ff8040');
  const wt = weeklyTwist(id); CX.toast(`本周畸变首领：${def.bosses[wt.boss].name} 获得「${TWIST_NAME[wt.key]}」`, '#c08aff');
  }
  CX.audio.portal();
  CX.$('raid-hud').style.display = 'flex';
  updateRaidHud();
  raidLoadScreen(def);   // v1.2.77
  return true;
}

/** v1.2.77 卡顿修复：进副本先上加载画面，把本副本所有首领模型、首领倒下特效、各档掉落光柱都建一份编译 / 上传完再撤。
 *  （首领是走近才生成的，倒下瞬间又有光柱 + 掉落；第一次出现时编译着色器会卡几秒，Rhett 11-03 22:26 反馈） */
function raidLoadScreen(def: RaidDef) {
  const el = CX.$('loading'), tx = CX.$('loading-text');
  if (!el || !CX.scene) return;
  if (tx) tx.textContent = `正在进入 ${def.name}…`;
  el.style.display = 'flex';
  const done = () => { el.style.display = 'none'; };
  setTimeout(() => { void raidPrewarm(def).then(done, done); }, 30);
}
async function raidPrewarm(def: RaidDef) {
  const far = { x: run ? run.O.x : 0, z: (run ? run.O.z : 0) - 3000 };
  const temp: RaidBoss[] = [];
  const cls = BOSS_CLASSES[def.id] ?? [];
  for (let i = 0; i < def.bosses.length && i < cls.length; i++) {
    if (run?.boss?.room === i) continue;
    try { const B = new cls[i](def.bosses[i], i); B.setup(far); for (const u of B.units) u.rig.root.position.set(far.x, 0, far.z); temp.push(B); } catch (e) { console.warn('首领预热失败', def.bosses[i]?.name, e); }
  }
  const loot = new THREE.Group(); loot.position.set(far.x, 0, far.z);
  ([[0, false], [0.7, false], [1.2, false], [2, false], [2.8, false], [3, true]] as [number, boolean][]).forEach(([tall, anc], k) => {
    const o = M.makeLootItem(k ? 'weapon' : null, anc ? '#ff2a2a' : '#ff8000', tall, anc); o.position.x = k * 3; loot.add(o); });
  { const pal = def.palette; const d = M.makeDisc(pal.zone, 0.55, 3), r = M.makeRing(pal.zoneRing, 0.9); r.position.x = d.position.x = -6; loot.add(d, r);
    const t = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), G.telegraphMaterial())); t.position.x = -12; loot.add(t); }   // 熔岩地面 / 预警圈
  CX.scene.add(loot);
  try { BFX.bossDeath(far, 'fire', 1); } catch { /* 主题不全时跳过 */ }
  await prewarmFlush('raid:' + def.id);
  // 预警圈 / 法阵这类自定义着色器：只预编译不够（实测王座崩塌仍新编 2 个），放到镜头前让真实渲染管线画几帧（加载画面盖着）
  const near = new THREE.Group(); const pp = CX.player.pos; near.position.set(pp.x, 0.05, pp.z);
  const tm = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), G.telegraphMaterial())); tm.rotation.x = -Math.PI / 2;
  const sm = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sigilMaterial(new THREE.Color(0xff6020)))); sm.rotation.x = -Math.PI / 2; sm.position.x = 1.5;
  near.add(tm, sm); CX.scene.add(near);
  await new Promise<void>(r => { let n = 0; const f = () => { if (++n >= 4) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  CX.scene.remove(near); tm.geometry.dispose(); sm.geometry.dispose();
  for (const B of temp) B.dispose();
  CX.scene.remove(loot);
}

function clearRaidEnemies() {
  for (let i = CX.enemies.length - 1; i >= 0; i--) if (CX.enemies[i].z === 'raid') { CX.enemies[i].dispose(); CX.enemies.splice(i, 1); }
  clearHazards(); deadSeen.clear();
}
/** 离开副本（出口传送门 / 回程 / 传送阵 / 读档）：清理敌人和预警 */
export function raidCleanup() {
  if (!run) return;
  lootFlush(true);   // 11-18 离开前把排队的结算掉落补齐（永霜墓穴首领倒下卡顿）
  if (run.aby && !run.aby.ended) abyEnd(false);
  abyssHideChoices();
  run.boss?.dispose(); prisonAt = null; setDarkness(false);
  if (run.route) routeEnvReset();
  clearRaidEnemies();
  run.walls.forEach(w => { w.visible = false; });
  run.group.visible = false;
  if (run.dg) { dgxEnd(); dgxHud(); }
  run = null;
  CX.$('raid-hud').style.display = 'none';
  CX.$('raid-tip').style.display = 'none';
}
/** 副本入口在烬落荒原的位置（离开后站在门口） */
export function raidGatePos(id: RaidId = 'molten_throne') { const W = WILD[RAIDS[id].wild ?? 'ember'], d = W.dungeonGates!.find(g => g.id === id)!; return { x: W.origin.x + d.x, z: W.origin.z + d.z + 6 }; }
/** v0.8.1：离开深渊（倒下 / 岔路里离开 / 出口 / 通关传送门）回灰石营地，不回副本门口 */
export function abyssLeave() { raidCleanup(); CX.goMap('camp', { x: CX.CAMP.x, z: CX.CAMP.z }, '离开暗岩深渊'); }
export function leaveRaid() {
  if (run?.aby) { abyssLeave(); return; }
  const id = run?.def.id ?? 'molten_throne';
  raidCleanup();
  const p = raidGatePos(id);
  CX.goMap(RAIDS[id].wild ?? 'ember', p, '离开副本');
}
function checkpointPos(): Pos { if (run?.route) { const n = rnode(run.route, run.cp); return n.id === 'entry' ? lw(0, 1) : lw(n.x, n.z + (n.boss !== undefined ? 0 : 2)); } if (!run || run.checkpoint < 0) return lw(0, 1); const c = arenaC(run.checkpoint); return { x: c.x, z: c.z + 6 * S }; }

/** 阵亡后复活：回到最近的存档点，当前首领回满血重置，残血的小怪也回满 */
export function raidRespawn() {
  if (!run) return;
  if (run.aby) { const f = run.aby.st.floor; abyEnd(false); abyssLeave(); CX.toast(`深渊挑战结束：倒在第 ${f} 层（最高 ${abyRec.best} 层）`, '#c08aff'); return; }
  run.deaths++;
  const i = run.route ? run.boss?.room ?? -1 : run.killed;
  if (run.boss && i >= 0 && i < run.def.bosses.length) { run.boss.dispose(); run.boss = null; spawnBoss(i); }
  clearHazards();
  run.walls.forEach(w => { w.visible = false; });
  for (const e of liveRaid()) if (!e.isBoss) { e.hp = e.maxHp; e.pos.copy(e.spawn); e.status.clear(); e.brain = new EnemyBrain(e, e.getPos(), enemyConfig(e.type), (tg, d) => enemyStrike(e, tg, d)); const rt = mobRt.get(e); if (rt) { rt.berserk = false; rt.cast = 0; } }
  const s = checkpointPos(); CX.player.pos.set(s.x, 0, s.z);
  CX.toast(`在存档点复活（${run.route ? rnode(run.route, run.cp).name : run.checkpoint < 0 ? '入口' : run.def.bosses[run.checkpoint].name}）。首领已重置`, '#ffb080');
}
export function raidName() { return run?.def.name ?? '长副本'; }
export function raidDeathText() { return run ? `灵魂将在存档点重新凝聚（${run.route ? rnode(run.route, run.cp).name : run.checkpoint < 0 ? '副本入口' : run.def.bosses[run.checkpoint].name + '的场地'}），当前首领回满血` : ''; }

// ---------------------------------------------------------------- 每帧
export function updateRaid(dt: number) {
  if (!inRaid() || !run) return;
  built[run.def.id]?.lpool?.update(CX.camera, dt);   // 11-18 B1 副本灯池：每帧挑灯 + 淡入淡出
  if (lootQ.length) lootFlush();   // 11-18 结算掉落每帧落一件（永霜墓穴首领倒下卡顿）
  run.t += dt;
  updateHazards(dt);
  updateMobs(dt);
  // 小怪不会走到熔岩上：出了走道就推回最近的能站的点
  for (const e of CX.enemies) if (e.z === 'raid' && e.alive && !walkable(e.pos.x, e.pos.z, 0.6, true)) {
    for (let rr = 0.4; rr <= 4; rr += 0.4) { let done = false; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = e.pos.x + Math.cos(a) * rr, z = e.pos.z + Math.sin(a) * rr; if (walkable(x, z, 0.6, true)) { e.pos.x = x; e.pos.z = z; done = true; break; } } if (done) break; }
  }
  if (run.dg) updateProps();
  if (run.route) routeTick(dt);
  if (run.aby) abyTick(dt);
  const B = run.boss;
  if (B) {
    const c = B.center, a = run.def.rooms[B.room].arena;
    if (!B.engaged && P().alive && d2(P().getPos(), c) < (a.r - 2.5) * S && B.alive) {   // 11-18 进场判定 = 设计半径 × S
      B.engaged = true; B.onEngage();
      run.walls[B.room * 2].visible = true; run.walls[B.room * 2 + 1].visible = true;
      B.units.forEach(u => u.brain.provoke());
      mechTip(`boss_${B.def.id}`, `${B.def.name}：${B.def.guide.mechanics[0]}（攻略里有完整说明）`);
    }
    if (B.engaged && B.alive && P().alive) { const t0 = performance.now(); B.tick(dt); perfMark('bossTick:' + B.def.id, t0); }
    // 首领不出场地（不会被拉进走廊）
    if (B.engaged) for (const u of B.units) { const dx = u.pos.x - c.x, dz = u.pos.z - c.z, dl = Math.hypot(dx, dz), lim = (a.r - 1.2) * S; if (dl > lim) { u.pos.x = c.x + dx / dl * lim; u.pos.z = c.z + dz / dl * lim; } }
    if (!B.engaged && !B.alive && (run.route || run.aby)) B.engaged = true;   // v0.8.0 深渊同理   // v0.6.10 路线图：没进场地就被打死（从走廊 / 冰湖远程打的）也算击败
    if (B.engaged && !B.alive) { const t0 = performance.now(); onBossDown(B); perfMark('bossDown:' + B.def.id, t0, 1); }
  }
  if (run.done && Math.random() < 0.3) { const p = run.finalPortal.position; CX.particles.emit({ x: p.x, y: 1.5, z: p.z }, { count: 1, color: 0xffd060, speed: 0.6, up: 1, radius: 1, life: 0.8, size: 0.3 }); }
  updateRaidHud();
}

// 11-18 永霜墓穴首领倒下卡顿：倒下这一帧原来同步存档（save 里要 JSON.parse 旧档 + 校验 + 备份轮换 + 两次 stringify + 写 localStorage / IndexedDB，
// 后期存档几百 KB 时单次几十毫秒），和倒下特效 / 掉落 / 结算挤在同一帧。改成空闲时再存（最多晚约 1.5 秒；离开副本 / 拾取等照常即时存）。
// ?off=bosssave 回到倒下当帧同步存档。
const BOSS_SAVE_DEFER = (() => { try { return !/(?:[?&]off=[^&]*\bbosssave\b)/.test(location.search); } catch { return false; } })();
let bossSavePending = false;
function bossSave() {
  if (!BOSS_SAVE_DEFER) { const t = performance.now(); CX.save(); perfMark('bd.save', t, 1); return; }
  if (bossSavePending) return;
  bossSavePending = true;
  const go = () => { bossSavePending = false; const t = performance.now(); CX.save(); perfMark('bd.saveIdle', t, 1); };
  const ric = (globalThis as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 1500 }); else setTimeout(go, 700);
}
// 11-18 永霜墓穴首领倒下卡顿：尾王倒下同一帧要生成 首领掉落 + 套装 / 橙装 + 暗金 + 每周首通加倍的一件 + 两堆金币，
// 每件橙装 / 套装光柱是一整组网格（螺旋 / 光柱 / 符文盘）再加一个落地符文区域特效（十几条弧 + 体积雾 + 粒子），全挤在一帧。
// 结算里的这几件改成排队，每帧生成一件（6 件约 0.1 秒内全部落地）；离开副本时没落完的立即补齐。?off=lootspread 回同帧全部生成。
const LOOT_SPREAD = (() => { try { return !/(?:[?&]off=[^&]*\blootspread\b)/.test(location.search); } catch { return false; } })();
const lootQ: (() => void)[] = [];
function lootLater(f: () => void) { if (LOOT_SPREAD) lootQ.push(f); else f(); }
function lootFlush(all = false) { let n = 0; while (lootQ.length && (all || n++ < 1)) { try { lootQ.shift()!(); } catch (e) { console.warn('掉落生成失败', e); } } }
function onBossDown(B: RaidBoss) {
  if (!run) return;
  B.engaged = false;
  B.cleanupFx();
  let tq = performance.now();
  const deathAt = { x: B.unit.pos.x, z: B.unit.pos.z };
  if (!run.aby) BFX.bossDeath(B.unit.pos, B.theme(), B.unit.rig.scale);   // v0.9.1f（深渊在 abyClear 之后放收敛版，见下）
  perfMark('bd.fx', tq, 1); tq = performance.now();
  B.say(B.def.lines.death, 3.5);
  B.twist?.dispose();
  CX.quests.onKill(`raidboss_${B.def.id}`);
  perfMark('bd.quest', tq, 1); tq = performance.now();
  raidBossRewards(B);
  perfMark('bd.rewards', tq, 1); tq = performance.now();
  bookDrop('raid');   // v0.6.8
  awakenBossKill('raid'); spiritOnKill('raid');   // v0.7.4 / v0.7.6
  achNoteBoss(B.def.name);   // v0.7.12 首领图鉴
  perfMark('bd.misc', tq, 1); tq = performance.now();
  clearHazards();
  // 召唤物一起消散
  for (const e of liveRaid()) { const rt = mobRt.get(e); if (rt && (rt.mech === 'slag' || rt.mech === 'offering' || rt.mech === 'prison' || rt.mech === 'clone')) { e.hp = 0; e.deadAt = CX.T; e.rig.anim?.play('death'); } }
  run.walls[B.room * 2].visible = false; run.walls[B.room * 2 + 1].visible = false;
  if (run.aby) { abyClear(); abyBossFx(B, deathAt); bossSave(); return; }
  if (run.route) { routeBossDown(run, B); perfMark('bd.route', tq, 1); bossSave(); return; }
  run.checkpoint = B.room; run.killed = B.room + 1;
  CX.toast(`存档点：${B.def.name}（阵亡会从这里重来）`, '#7fd7ff');
  if (run.dg) { dgBossDown(B); bossSave(); return; }
  if (run.killed < run.def.bosses.length) {
    const g = run.gates[run.killed]; gateAnims.push({ g, t: 0 });
    spawnBoss(run.killed);
  } else finishRun();
  bossSave();
}

/** v0.9.6a 长副本首领：只掉套装 + 橙装（套装带原保底；独特 18/25%、共享 12/18%；都没出保底 1 件） */
export function raidEndgameDrop(room: number, c: Pos, rng: () => number = Math.random, guaranteeOnly = false): ItemInstance[] {
  if (!run) return [];
  const hell = !!run.hell, k = hell ? 1 : 0, ilvl = hell ? 44 : curMul.ilvlBoss, src = `${run.def.name}${hell ? ' · 炼狱' : ''}`;
  const P = raidBossPool(run.def.id, room, CX.cls.id);
  const out: ItemInstance[] = [];
  const lg = (id: string | null | undefined) => { if (!id) return; const prev = CX.gen.classId; CX.gen.classId = CX.cls.id; const it = CX.gen.generateLegendary(id, ilvl); CX.gen.classId = prev; if (it) out.push(it); };
  if (!guaranteeOnly) {
    const set = raidSetDrop(ilvl, hell, rng); if (set) out.push(set);
    if (rng() < RAID_LG_CHANCE.unique[k]) lg(P.unique);
    if (rng() < RAID_LG_CHANCE.shared[k]) lg(P.shared[Math.floor(rng() * P.shared.length)]);
  }
  if (!out.length) {   // 保底：套装或共享橙装各一半
    const set = rng() < 0.5 ? raidSetDrop(ilvl, hell, () => 0) : null;
    if (set) out.push(set); else lg(P.shared[Math.floor(rng() * P.shared.length)]);
  }
  if (hell) rollAnc(out, ANCIENT_CHANCE.raidHell);   // v0.9.6b 炼狱每件 4% 太古
  tagItems(out, 'raid', src);
  out.forEach((it, i) => { lootLater(() => CX.spawnLoot(it, new THREE.Vector3(c.x - 1.5 + i * 1.5, 0, c.z - 1), 0, 1)); CX.toast(`${it.setId ? '套装部件' : '橙装'}：[${it.name}]`, it.ancient ? ANCIENT_COLOR : it.setId ? '#2ED573' : '#ff8000'); });
  return out;
}
/** 主线 v0.6.6（并入 v0.5 B / C）：长副本首领掉本职业套装部件（带保底）+ 兑换货币；三首领普通副本史诗 / 噩梦首领掉兑换货币 */
function raidBossRewards(B: RaidBoss) {
  if (!run || run.aby) return;   // 深渊：层奖励在 abyClear
  const c = arenaC(B.room);
  if (!run.dg) raidEndgameDrop(B.room, c);
  const cur = run.dg ? raidCurrencyDrop({ dungeon: run.def.id, diff: dgxRun()?.diff }) : raidCurrencyDrop({ raid: run.def.id, final: B.room === run.def.bosses.length - 1, hell: !!run.hell });
  cur.forEach(st => { CX.inventory.addStack(st.id, st.count); CX.toast(`获得 ${CX.forge.stackDef(st.id)?.name ?? st.id} ×${st.count}`, '#ffb060'); });
}

function finishRun() {
  if (!run) return;
  run.done = true; run.boss = null;
  const id = run.def.id, sec = run.t;
  const wk = weekKey(Date.now()), first = raidRec.week[id] !== wk;
  raidRec.clears[id] = (raidRec.clears[id] ?? 0) + 1;
  raidRec.best[id] = Math.min(raidRec.best[id] ?? Infinity, Math.round(sec));
  raidRec.week[id] = wk;
  if (run.hell) raidRec.hell![id] = (raidRec.hell![id] ?? 0) + 1;
  run.finalPortal.visible = true;
  const cpos = arenaC(run.def.bosses.length - 1);
  // 暗金：最终首领 5%（炼狱 20%，v1.2.38b 翻倍），本周首通翻倍
  const pDark = darkChanceOverride ?? (run.hell ? 0.2 : 0.05) * (first ? 2 : 1);
  if (Math.random() < pDark) {
    const pool = darkFor(id, CX.cls.id), pick = pool[Math.floor(Math.random() * pool.length)];
    const it = pick && CX.gen.generateFixed(pick.id, run.hell ? 44 : 40);
    if (it && run.hell) rollAnc([it], ANCIENT_CHANCE.raidHell);
    if (it) { tagItems([it], 'raid', `${run.def.name}${run.hell ? ' · 炼狱' : ''}`); lootLater(() => CX.spawnLoot(it, new THREE.Vector3(cpos.x + 1.5, 0, cpos.z - 1), 0, 1)); CX.yell(`暗金掉落：[${it.name}]！`, '#e8c060', 4); }
  }
  // 每周机制挑战
  const ch = CHALLENGE[id];
  if (!run.chalFail && raidRec.chal![id] !== wk) { raidRec.chal![id] = wk; CX.inventory.addStack('mat_darkshard', 10); CX.toast(`每周挑战完成：${ch} · 暗金碎片 ×10`, '#e8c060'); }
  else if (run.chalFail && raidRec.chal![id] !== wk) CX.toast(`每周挑战未完成：${ch}`, '#c0a080');
  CX.toast(`🏆 通关「${run.def.name}」！用时 ${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒，阵亡 ${run.deaths} 次`, '#ff8000');
  if (first) {
    // 每周第一次通关：最终首领的奖励再给一份
    // v0.9.6a：每周首通 = 尾王池再出 1 件（套装或橙装）+ 金币
    const c = arenaC(run.def.bosses.length - 1);
    raidEndgameDrop(run.def.bosses.length - 1, { x: c.x, z: c.z - 2 }, Math.random, true);
    const gold = run.hell ? 3000 : 2000; lootLater(() => CX.spawnLoot(gold, new THREE.Vector3(c.x, 0, c.z - 2), 0, 1));
    CX.yell('本周首次通关：奖励加倍！', '#ffd060', 3);
  }
  CX.audio.victory();
  CX.player.rig.anim?.play('cheer');
}

// ---------------------------------------------------------------- 交互 / 外观 / 音乐 / HUD / 小地图
export function raidInteract(): { label: string; act: () => void; pos: THREE.Vector3 } | null {
  if (!run) return null;
  if (CX.dist2d(run.exit.position, CX.player.pos) < 3 * S) return { label: '离开副本（进度不保留）', act: leaveRaid, pos: run.exit.position };
  if (run.finalPortal.visible && CX.dist2d(run.finalPortal.position, CX.player.pos) < 3 * S) return { label: `离开${run.def.name}`, act: leaveRaid, pos: run.finalPortal.position };
  if (run.aby?.cleared && !run.aby.ended) return { label: '深渊岔路：选择下一层', act: openAbyss, pos: CX.player.pos.clone() };
  if (run.aby?.ended && abyssDarkPending()) return { label: '深渊终极奖励：自选暗金 1 件', act: openAbyss, pos: CX.player.pos.clone() };   // v0.8.0
  if (run.route) { const ri = routeInteract(run); if (ri) return ri; }
  if (run.dg) {
    const dx = dgxInteract(); if (dx) return dx;
    const pp = CX.player.pos, w = (lx: number, lz: number) => new THREE.Vector3(run!.O.x + lx * S, 0, run!.O.z + lz * S), q = dgL(run.O, pp.x, pp.z);   // 11-18 设计坐标里比距离（摆件跟着放大）
    const m = run.props.mural; if (m && Math.hypot(q.x - m.lx, q.z - m.lz) < 3) return { label: '查看壁画', act: () => { CX.yell(run!.def.hidden!.hint, '#e8d8b8', 6); CX.audio.portal(); }, pos: w(m.lx, m.lz) };
    for (const br of run.props.braziers) if (!br.lit && Math.hypot(q.x - br.lx, q.z - br.lz) < 2.8) return { label: '点燃火盆', act: () => lightBrazier(br), pos: w(br.lx, br.lz) };
  }
  return null;
}
/** 11-18 选曲用：当前长副本 / 副本 id（深渊 = 'abyss'），不在 = '' */
export function raidMusicKey(): string { return run?.aby ? 'abyss' : run?.def.id ?? ''; }
export function raidLook() { return run?.def.look ?? RAIDS.molten_throne.look; }
export function raidSetVisible(on: boolean) { for (const b of Object.values(built)) if (b) b.group.visible = on && !!run && b.group === run.group; }
export function raidMusic(): 'dungeon' | 'frost' | 'boss' | 'boss2' | 'event' | 'abyss' | 'final' {
  const B = run?.boss;
  if (run?.aby) return run.aby.st.story ? 'final' : B?.engaged ? (B.phase >= 2 ? 'event' : 'boss2') : 'abyss';   // v0.8.4
  if (!B?.engaged) return run?.def.explore ?? 'dungeon';
  if (B.room === lastRegular() || (run!.def.hidden && B.room === run!.def.hidden.room)) return B.phase >= 2 ? 'event' : 'boss2';
  return B.room % 2 ? 'boss2' : 'boss';
}
export function raidZoneName() { if (!run) return ''; if (run.route) { const n = nodeAt(run.route, (CX.player.pos.x - run.O.x) / S, (CX.player.pos.z - run.O.z) / S); return `${run.def.name} · ${n.name}`; } const lz = (CX.player.pos.z - run.O.z) / S; const i = run.def.rooms.findIndex(r => lz > r.arena.z - r.arena.r); const room = i < 0 ? run.def.rooms.length - 1 : i; return `${run.def.name} · ${lz > -10 ? '入口' : run.def.bosses[room].name}`; }
/** 首领框：双子显示两条血量；其它首领显示阶段名 */
export function raidHud(): { boss: Enemy | null; phase: string; ticks?: number[] } {
  const r = raidHud0(); if (r.boss && run?.boss) r.ticks = run.boss.ticks; return r;
}
function raidHud0(): { boss: Enemy | null; phase: string; ticks?: number[] } {
  const B = run?.boss;
  if (!B || !B.engaged || !B.alive) return { boss: null, phase: '' };
  if (B instanceof Twins) {
    const ig = B.ig, nis = B.nis, tg = CX.target;
    const show = tg && (tg === ig || tg === nis) && tg.alive ? tg : ig.alive ? ig : nis;
    return { boss: show, phase: `伊格 ${Math.ceil(ig.hp / ig.maxHp * 100)}% · 妮丝 ${Math.ceil(nis.hp / nis.maxHp * 100)}%` };
  }
  if (B instanceof Knights) { const alive = B.units.filter(u => u.alive), tg = CX.target; const show = tg && alive.includes(tg) ? tg : alive[0]; return { boss: show, phase: `${B.def.phases[B.phase] ?? ''} · 剩余 ${alive.length} 名骑士` }; }
  if (B instanceof Ithran && B.chill > 0) return { boss: B.unit, phase: `${B.def.phases[B.phase] ?? ''} · 寒意 ${B.chill}/10` };
  const tw = B.twist ? ` · 畸变：${TWIST_NAME[B.twist.key]}${B.twist.chill ? ` ${B.twist.chill}/10` : ''}` : '';
  return { boss: B.unit, phase: `${B.def.phases[B.phase] ?? ''}${B.dmgMul > 1.01 ? ' · 狂暴' : ''}${B.stun > 1.5 ? ' · 破甲' : ''}${tw}` };
}
function updateRaidHud() {
  if (!run) return;
  const el = CX.$('raid-hud');
  const txt = run.aby ? abyHudText() : `${run.def.name}${run.hell ? '（炼狱）' : run.dg ? `（${DIFF[run.diff].name}）` : ''}　首领 ${Math.min(run.killed, run.regular)}/${run.regular}${run.killed > run.regular ? ' + 隐藏' : ''}　${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')}　阵亡 ${run.deaths}`;
  const s = CX.$('raid-status'); if (s.textContent !== txt) s.textContent = txt;
  void el;
}
export function drawRaidMinimap(g: CanvasRenderingContext2D, R: number, k: number, P0: { x: number; z: number }) {
  if (!run) return;
  // 11-18 副本 ×1.5：下面都按「原点 + 设计坐标」画，X / Z 换算成放大后的世界坐标，长度 × S（kd）；安全点是世界坐标（Xw / Zw）
  const O0 = run.O, kd = k * S;
  const X = (x: number) => R + (O0.x + (x - O0.x) * S - P0.x) * k, Z = (z: number) => R + (O0.z + (z - O0.z) * S - P0.z) * k;
  const Xw = (x: number) => R + (x - P0.x) * k, Zw = (z: number) => R + (z - P0.z) * k;
  g.fillStyle = 'rgba(255,200,150,.12)';
  if (run.route) {
    const route = run.route, O = run.O;
    g.strokeStyle = 'rgba(255,200,150,.14)'; g.lineCap = 'round';
    for (const e of route.edges) { const A = rnode(route, e.a), B = rnode(route, e.b), open = evalCond(e.cond, run.rs); if (!open && FLAG_ONLY(e.cond)) continue; g.strokeStyle = open ? 'rgba(255,200,150,.16)' : 'rgba(255,90,60,.12)'; g.lineWidth = (e.half ?? CORRIDOR_HALF) * 2 * kd; g.beginPath(); g.moveTo(X(O.x + A.x), Z(O.z + A.z)); g.lineTo(X(O.x + B.x), Z(O.z + B.z)); g.stroke(); }
    g.lineWidth = 1; g.lineCap = 'butt';
    for (const n of route.nodes) { if (n.kind === 'lake' && !run.rs.flags.includes('frozen')) continue; g.fillStyle = n.boss !== undefined && run.rs.dead[n.boss] ? 'rgba(160,160,160,.16)' : 'rgba(255,200,150,.14)'; g.beginPath(); g.arc(X(O.x + n.x), Z(O.z + n.z), n.r * kd, 0, Math.PI * 2); g.fill(); }
    for (const p of route.props) { const done = p.kind === 'lamp' ? run.rs.flags.includes(`lamp:${p.id}`) : p.kind === 'chest' ? run.opened.has(p.id) : p.kind === 'pillar' ? run.rs.flags.includes('bridge') : p.kind === 'valve' ? run.rs.flags.includes('valves') : p.kind === 'icewall' ? run.rs.flags.includes('icewall') : true; if (done || (rnode(route, p.node).hidden && !run.visited.has(p.node))) continue; g.fillStyle = p.kind === 'chest' ? '#ffd060' : '#7ad8ff'; g.beginPath(); g.arc(X(O.x + p.x), Z(O.z + p.z), 3, 0, Math.PI * 2); g.fill(); }
    if (raidSafeSpot) { g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(Xw(raidSafeSpot.x), Zw(raidSafeSpot.z), 4, 0, Math.PI * 2); g.fill(); }
    return;
  }
  g.fillRect(X(run.O.x - 8), Z(run.O.z - 10), 16 * kd, 16 * kd);
  for (const room of run.def.rooms) {
    g.fillRect(X(run.O.x - CORRIDOR_HALF), Z(run.O.z + room.corridor[1]), CORRIDOR_HALF * 2 * kd, (room.corridor[1] - room.corridor[0]) * kd);
    g.beginPath(); g.arc(X(run.O.x), Z(run.O.z + room.arena.z), room.arena.r * kd, 0, Math.PI * 2); g.fill();
  }
  if (raidSafeSpot) { g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(Xw(raidSafeSpot.x), Zw(raidSafeSpot.z), 4, 0, Math.PI * 2); g.fill(); }
}

// ---------------------------------------------------------------- 攻略面板（副本 HUD「攻略」按钮 / 副本地图「攻略」页签；v1.2.15 起 G 键给第 8 技能格）
export function openRaidGuide(id: RaidId = run?.def.id ?? 'molten_throne') {
  const def = RAIDS[id], ilvl = CX.inventory.averageItemLevel();
  const cur = run?.killed ?? -1;
  let h = `<div style="margin-bottom:8px;color:#e8d8b8">${def.desc}。每个首领倒下是一个存档点；阵亡从最近存档点重来，当前首领回满血。每周第一次通关，最终首领奖励加倍。<br>
    你的平均装等：<b style="color:#ffd060">${ilvl}</b>　通关 ${raidRec.clears[id] ?? 0} 次${raidRec.hell?.[id] ? `　炼狱 ${raidRec.hell[id]} 次` : ''}${raidRec.best[id] ? `　最快 ${Math.floor(raidRec.best[id] / 60)}分${raidRec.best[id] % 60}秒` : ''}</div>`;
  h += `<button class="btn" id="rg-route">${run && run.def.id === id ? '副本地图（M）' : '路线图预览'}</button> `;
  if (def.kind !== 'dungeon') { const wt = weeklyTwist(id); h += `<div class="rg-tip">本周畸变首领：<b>${def.bosses[wt.boss].name}</b> 获得「${TWIST_NAME[wt.key]}」——${TWIST_DESC[wt.key]}<br>每周挑战：${CHALLENGE[id]}${raidRec.chal?.[id] === weekKey(Date.now()) ? '（本周已完成）' : '（奖励暗金碎片 ×10）'}${run?.hell ? '<br><b style="color:#ff6040">炼狱：每个首领都带一个借来的机制</b>' : ''}</div>`; }
  def.bosses.forEach((b, i) => {
    if (def.hidden && i === def.hidden.room && !raidRec.clears[`hidden|${id}`]) { h += `<div class="rg-boss"><div class="rg-h">？？？</div>${def.hidden.hint}</div>`; return; }
    const st = i < cur ? '<span style="color:#7f7">已击败</span>' : i === cur ? '<span style="color:#ffb040">当前</span>' : '';
    h += `<div class="rg-boss"><div class="rg-h">${i + 1}. ${b.name} ${st}<small>推荐装等 ${b.guide.ilvl}${ilvl < b.guide.ilvl ? ' <span style="color:#f88">（偏低）</span>' : ''}</small></div>
      <ul>${b.guide.mechanics.map(m => `<li>${m}</li>`).join('')}</ul><div class="rg-tip">应对：${b.guide.tips.join('；')}</div>
      <div class="rg-drop">掉落：${def.kind === 'dungeon' ? `史诗起${def.hidden && i === def.hidden.room ? '、独有的外观件' : ''}` : i === def.bosses.length - 1 ? '必掉传说 + 史诗 ×2（35% 再加一件传说）、5% 暗金（炼狱 10%，本周首通翻倍）' : '史诗 ×2（30% 传说）'}、王座之心、暗金碎片 · <a href="#" data-dg="1">查看掉落说明书</a></div></div>`;
  });
  h += `<div class="fgroup">精英小怪</div><ul>${(['guard', 'bomber', 'healer', 'totem', 'berserk'] as EliteMech[]).map(m => `<li>${MECH_TIPS[m]}</li>`).join('')}</ul>
    <label style="display:block;margin-top:8px"><input type="checkbox" id="rg-tips" ${raidRec.tipsOff ? '' : 'checked'}> 第一次遇到机制时在屏幕上方提示</label>`;
  CX.$('rg-title').textContent = `攻略 · ${def.name}`;
  const body = CX.$('rg-body'); body.innerHTML = h;
  (body.querySelector('#rg-tips') as HTMLInputElement).onchange = ev => { raidRec.tipsOff = !(ev.target as HTMLInputElement).checked; CX.save(); };
  body.querySelectorAll('[data-dg]').forEach(a => (a as HTMLElement).onclick = ev => { ev.preventDefault(); CX.togglePanel('raidguide', false); (window as unknown as { __game?: { openDropGuide?: () => void } }).__game?.openDropGuide?.(); });
  const rb = document.getElementById('rg-route'); if (rb) rb.onclick = () => { (window as unknown as { __game?: { openRaidMap?: (id: string, p: boolean) => void } }).__game?.openRaidMap?.(id, !(run && run.def.id === id)); };
  CX.togglePanel('raidguide', true);
}

/** 测试用：机器人参考的目标优先级（熔渣 > 图腾 > 治疗 > 献祭者 > 双子血多的 > 最近） */
/** 机器人：怪和玩家在同一个节点 / 走廊（或直接相连且门开着）才算够得着，免得隔着熔岩来回抖 */
function sameArea(p: Pos) {
  const r = run!, route = r.route!, pp = CX.player.pos;
  if (!walkable(p.x, p.z, 0.3, false)) return false;   // 站在锁着的走廊里的怪：够不着
  const a = nodeAt(route, (pp.x - r.O.x) / S, (pp.z - r.O.z) / S), b = nodeAt(route, (p.x - r.O.x) / S, (p.z - r.O.z) / S);
  if (a === b) return true;
  return route.edges.some(e => ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id)) && evalCond(e.cond, r.rs));
}
export function raidBotTarget(): Enemy | null {
  if (!run) return null;
  const live = liveRaid(), pp = CX.player.pos;
  const pri = (e: Enemy) => { const m = mobRt.get(e)?.mech; return m === 'slag' || m === 'prison' ? 0 : m === 'totem' ? 1 : m === 'healer' ? 2 : m === 'offering' ? 3 : m === 'clone' ? 9 : e.isBoss ? 5 : 4; };
  const B = run.boss;
  if (B instanceof Twins && B.engaged) {
    const ig = B.ig, nis = B.nis;
    if (ig.alive && nis.alive) { const twin = ig.hp / ig.maxHp >= nis.hp / nis.maxHp ? ig : nis; const adds = live.filter(e => !e.isBoss && d2(e.pos, pp) < 18); if (!adds.length) return twin; }
  }
  const inArena = (e: Enemy) => !!B && d2(e.pos, B.center) <= B.arenaR + 0.5;
  if (B instanceof Knights && B.engaged) { const k = [B.shield, B.banner, B.blade].find(u => u.alive); const pr = live.find(e => mobRt.get(e)?.mech === 'prison'); return pr ?? k ?? null; }
  if (B instanceof Wyrm && B.air > 0) return null;
  const near = B?.engaged ? live.filter(inArena) : live.filter(e => d2(e.pos, pp) < 26 && (!run!.route || sameArea(e.pos)));
  near.sort((a, b) => pri(a) - pri(b) || d2(a.pos, pp) - d2(b.pos, pp));
  return near[0] ?? null;
}
export function raidBossDev(i?: number) { if (run && i !== undefined) { run.boss?.dispose(); run.boss = null; spawnBoss(i); } return run?.boss ?? null; }   // v1.2.77 测试用
export function raidDebug() { return run ? { id: run.def.id, killed: run.killed, checkpoint: run.checkpoint, t: run.t, deaths: run.deaths, done: run.done, engaged: !!run.boss?.engaged, room: run.boss?.room ?? -1,
  chill: Math.max(run.boss instanceof Ithran ? run.boss.chill : 0, run.boss?.twist?.chill ?? 0, ...(run.boss?.more ?? []).map(t => t.chill)), dg: run.dg, regular: run.regular, hiddenOpen: run.hiddenOpen, heat: run.boss instanceof ForgeGolem ? run.boss.heat : 0, pools: run.props.pools.filter(q => q.cd <= 0).map(q => ({ x: run!.O.x + q.lx * S, z: run!.O.z + q.lz * S })), hell: run.hell, twist: run.boss?.twist?.key ?? null, chalFail: run.chalFail, prison: !!prisonAt, air: run.boss instanceof Wyrm ? run.boss.air > 0 : false,
  bossHp: run.boss ? run.boss.hpPct() : 0, phase: run.boss?.phase ?? 0, stun: run.boss?.stun ?? 0, charging: run.boss instanceof Samur ? !!run.boss.charge : false,
  pillars: run.pillars.filter(p => p.hp > 0).map(p => ({ x: run!.O.x + p.lx * S, z: run!.O.z + p.lz * S })), center: run.boss ? run.boss.center : null, alive: liveRaid().length, safe: raidSafeSpot } : null; }

export function bindRaid(__ctx: Ctx) {
  CX = __ctx;
  for (const t of Object.values(RAIDS)) for (const [k, m] of Object.entries(t.mobs)) ENEMY_TYPES[k] = mobType(m);
  CX.$('raid-guide-btn')?.addEventListener('click', () => openRaidGuide());
}

// ======================================================================  v0.6.3：入口选难度 / 副本学者（每周情报 + 暗金典藏 + 兑换）
/** 入口交互：没通关过标准难度直接进；通关过就弹出难度选择 */
export function raidEntry(id: RaidId) {
  if (RAIDS[id].kind === 'dungeon') { const lock = raidLock(id); if (lock) { CX.toast(`${RAIDS[id].name}：${lock}`, '#f66'); CX.audio.error(); return false; } dgxChoose(id, RAIDS[id].name, (d, o) => enterRaid(id, 0, false, d, o)); return true; }
  if (!raidRec.clears[id]) return enterRaid(id);
  const def = RAIDS[id], wt = weeklyTwist(id);
  CX.$('rg-title').textContent = `进入 · ${def.name}`;
  CX.$('rg-body').innerHTML = `<div class="rg-boss"><div class="rg-h">标准</div>5 个首领 · 本周畸变首领：${def.bosses[wt.boss].name}（${TWIST_NAME[wt.key]}）<br><button class="btn big" id="re-std">进入标准难度</button></div>
    <div class="rg-boss"><div class="rg-h" style="color:#ff6040">炼狱</div>敌人生命和伤害 ×${HELL_MUL}，红圈伤害 +20%；<b>每个首领都借来一个别的首领的机制</b>。掉落装等 60（普通 50），暗金掉率 20%、套装和橙装掉率翻倍（本周首通暗金再翻倍）。<br>
    通关 ${raidRec.hell?.[id] ?? 0} 次<br><button class="btn big" id="re-hell">进入炼狱难度</button></div>
    <div class="rg-tip">每周机制挑战：${CHALLENGE[id]}（${raidRec.chal?.[id] === weekKey(Date.now()) ? '本周已完成' : '完成奖励暗金碎片 ×10'}）</div>`;
  CX.$('re-std').onclick = () => { CX.togglePanel('raidguide', false); enterRaid(id); };
  CX.$('re-hell').onclick = () => { CX.togglePanel('raidguide', false); enterRaid(id, 0, true); };
  CX.togglePanel('raidguide', true);
  return true;
}

/** 副本学者墨言：每周情报、暗金典藏、兑换 */
export function openScholar() {
  const wk = weekKey(Date.now()), shards = CX.inventory.stack('mat_darkshard'), tok = CX.inventory.stack('tok_dark');
  const codex: Set<string> = CX.codex;
  let h = `<div style="margin-bottom:8px;color:#e8d8b8">暗金碎片 <b style="color:#e8c060">${shards}</b>　暗金凭证 <b style="color:#e8c060">${tok}</b>　（${DARK_EXCHANGE} 片碎片或 1 张凭证换一件指定暗金）</div>`;
  for (const id of LONG_RAIDS) {
    const def = RAIDS[id], wt = weeklyTwist(id);
    h += `<div class="fgroup">${def.name}</div><div class="rg-tip">通关 ${raidRec.clears[id] ?? 0} 次 · 炼狱 ${raidRec.hell?.[id] ?? 0} 次${raidRec.best[id] ? ` · 最快 ${Math.floor(raidRec.best[id] / 60)}分${raidRec.best[id] % 60}秒` : ''}<br>
      本周畸变首领：<b>${def.bosses[wt.boss].name}</b> 获得「${TWIST_NAME[wt.key]}」——${TWIST_DESC[wt.key]}<br>
      每周挑战：${CHALLENGE[id]} ${raidRec.chal?.[id] === wk ? '<span style="color:#7f7">（本周已完成）</span>' : ''}</div>`;
    for (const d of DARK_ITEMS.filter(x => x.raid === id)) {
      const own = codex.has(`dark|${d.id}`), pr = codex.has(`print|${d.id}`), mine = !d.cls || d.cls === CX.cls.id;
      h += `<div class="rg-boss"><div class="rg-h"><span class="slot q-dark" style="display:inline-block;width:26px;height:26px;vertical-align:middle"></span> <b style="color:#e8c060">${d.name}</b> <small>${SLOT_TXT[d.slot] ?? ''}${d.cls ? ` · ${CLASSES[d.cls as ClassId]?.name ?? d.cls}` : ''}${own ? ' · <span style="color:#7f7">已获得</span>' : ''}${pr ? ' · <span style="color:#9ad8ff">已拓印</span>' : ''}</small></div>
        ${d.modifiers.filter(m => !m.cls || m.cls === CX.cls.id).map(m => `<div class="ln">❖ ${m.desc}</div>`).join('')}${d.cls ? '' : `<div style="opacity:.6;font-size:12px">（多职业通用：效果按当前职业显示）</div>`}<div style="opacity:.7;font-style:italic">${d.flavor}</div>
        ${mine ? `<button class="btn sm" data-dx="${d.id}" ${shards >= DARK_EXCHANGE ? '' : 'disabled'}>${DARK_EXCHANGE} 碎片兑换</button> <button class="btn sm" data-dt="${d.id}" ${tok > 0 ? '' : 'disabled'}>凭证兑换</button>` : '<small style="opacity:.6">其他职业专用</small>'}</div>`;
    }
  }
  h += `<div class="rg-tip">分解暗金会自动拓印进典藏；之后在铁匠「淬炼」里可以花 10 片碎片把效果刻到同部位的装备上（武器互通）。</div>`;
  CX.$('rg-title').textContent = '副本学者 · 暗金典藏';
  const body = CX.$('rg-body'); body.innerHTML = h;
  const give = (did: string, cost: 'shard' | 'tok') => {
    if (CX.inventory.isFull) { CX.toast('背包已满', '#f66'); return; }
    if (cost === 'shard' ? !CX.inventory.useStack('mat_darkshard', DARK_EXCHANGE) : !CX.inventory.useStack('tok_dark', 1)) return;
    const it = CX.gen.generateFixed(did, 40);
    if (!it) return;
    tagItems([it], 'raid', '副本学者兑换');
    CX.inventory.add(it); CX.noteCodex(it);
    CX.toast(`兑换获得 [${it.name}]`, '#e8c060'); CX.audio.loot('dark'); CX.save(); openScholar();
  };
  body.querySelectorAll('[data-dx]').forEach(b => (b as HTMLElement).onclick = () => give((b as HTMLElement).dataset.dx!, 'shard'));
  body.querySelectorAll('[data-dt]').forEach(b => (b as HTMLElement).onclick = () => give((b as HTMLElement).dataset.dt!, 'tok'));
  CX.togglePanel('raidguide', true);
}
const SLOT_TXT: Record<string, string> = { twoHand: '双手', oneHand: '单手', ring: '戒指', neck: '项链', trinket: '饰品' };

// ======================================================================  v0.6.5：三首领普通副本（沙葬王陵 / 巨魔冰窟）
const DG_TIPS: Record<string, string> = {
  st_mummy: '木乃伊：活着时法老受到伤害 -50%，先清掉',
  st_bandit: '沙匪打手：生命低于 30% 狂暴，集火或拉开',
  st_scarab: '爆裂圣甲虫：死后 2 秒原地爆炸，打完立刻离开红圈',
};
/** 场景道具：石棺 / 火药桶 / 火盆 / 壁画 / 冰晶沙丘装饰 */
function buildDungeonProps(def: RaidDef, add: (o: THREE.Object3D, lx: number, lz: number, y?: number) => THREE.Object3D, props: Props) {
  const sand = def.theme === 'sand', forge = def.theme === 'forge';
  for (let k = 0; k < 36; k++) {
    const room = def.rooms[k % def.rooms.length], a = Math.random() * Math.PI * 2, rr = room.arena.r + 1.2;
    if (forge) { add(raidRock(0.8 + Math.random() * 0.5, 0x2a2220), Math.cos(a) * rr, room.arena.z + Math.sin(a) * rr); continue; }
    add(sand ? raidRock(0.7 + Math.random() * 0.6, 0xb08a5a) : M.makeCrystal(0x9ad8ff, 0.5 + Math.random() * 0.6), Math.cos(a) * rr, room.arena.z + Math.sin(a) * rr);
  }
  // 壁画（入口大厅左侧）
  const mural = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 3.2), G.toon(sand ? 0xc8a070 : forge ? 0x4a3a34 : 0x8a9aaa)); slab.position.y = 1.3; mural.add(slab);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), G.glow(sand ? 0xffd080 : forge ? 0xffa040 : 0x9ad8ff, 0.9)); art.position.set(0.21, 1.4, 0); art.rotation.y = Math.PI / 2; mural.add(M.noOutline(art));
  add(mural, -7.4, -4); props.mural = { lx: -6.4, lz: -4 };
  if (sand) {
    for (const [x, z] of TOMB_COFFINS) {
      const c = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 2.2), G.toon(0xb09060)); box.position.y = 0.35; c.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 2.3), G.toon(0xd8b878)); lid.position.y = 0.8; lid.name = 'lid'; c.add(lid);
      add(c, x, z); props.coffins.push({ obj: c, lx: x, lz: z, broken: false });
    }
    for (const [x, z] of TOMB_BARRELS) { const b = M.makeBarrel(); b.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined; if (m?.color) m.color.lerp(new THREE.Color(0xa02010), 0.5); }); const lz = def.rooms[1].arena.z + z; add(b, x, lz); props.barrels.push({ obj: b, lx: x, lz, alive: true }); }
  } else if (forge) {
    // 第一首领：两条传送带（地面上的箭头条）；第二首领：冷却池；第三首领：四个空模子
    const z0 = def.rooms[0].arena.z;
    for (const bt of FORGE_BELTS) { const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.6), G.glow(0x6a5040, 0.6, { transparent: true, opacity: 0.85, depthWrite: false })); m.rotation.x = -Math.PI / 2; add(M.noOutline(m), 0, z0 + bt.z, 0.04);
      for (let x = -11; x <= 11; x += 3) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), G.glow(0xffa040, 1.4)); ar.rotation.set(-Math.PI / 2, 0, -bt.dir * Math.PI / 2); add(M.noOutline(ar), x, z0 + bt.z, 0.1); props.belts.push(ar); } }
    for (const [x, z] of FORGE_POOLS) { const lz = def.rooms[1].arena.z + z; const p = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), G.glow(0x3a9aff, 1.1, { transparent: true, opacity: 0.85, depthWrite: false })); p.rotation.x = -Math.PI / 2; add(M.noOutline(p), x, lz, 0.05); props.pools.push({ obj: p, lx: x, lz, cd: 0 }); }
    for (const [x, z] of FORGE_MOLDS) { const lz = def.rooms[2].arena.z + z; const g2 = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.4), G.toon(0x3a3030)); frame.position.y = 0.25; g2.add(frame);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.0), G.glow(0xff7a20, 2)); fill.position.y = 0.52; fill.visible = false; g2.add(M.noOutline(fill));
      add(g2, x, lz); props.molds.push({ obj: g2, fill, lx: x, lz, full: false }); }
  } else {
    for (const [x, z] of TROLL_BRAZIERS) {
      const b = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.9, 10), G.toon(0x3a3a44)); bowl.position.y = 0.45; b.add(bowl);
      const flame = new THREE.Group(); const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 8), flameDevelop(G.glow(0xff8030, 2))); f.position.y = 1.3; flame.add(M.noOutline(f)); const l = new THREE.PointLight(0xff8a40, 3, 9); l.position.y = 1.6; flame.add(l); flame.visible = false; b.add(flame);
      add(b, x, z); props.braziers.push({ obj: b, flame, lx: x, lz: z, lit: false });
    }
  }
}
function resetProps(p: Props) {
  p.coffins.forEach(c => { c.broken = false; const lid = c.obj.getObjectByName('lid'); if (lid) { lid.rotation.set(0, 0, 0); lid.position.set(0, 0.8, 0); } });
  p.barrels.forEach(b => { b.alive = true; b.obj.visible = true; });
  p.braziers.forEach(b => { b.lit = false; b.flame.visible = false; });
  p.molds.forEach(m => { m.full = false; m.fill.visible = false; });
  p.pools.forEach(q => { q.cd = 0; q.obj.visible = true; });
}
function updateProps() {
  if (!run) return;
  const pp = CX.player.pos, lx = (pp.x - run.O.x) / S, lz = (pp.z - run.O.z) / S;   // 11-18 设计坐标（石棺跟着放大）
  for (const c of run.props.coffins) if (!c.broken && Math.abs(lx - c.lx) < 0.75 && Math.abs(lz - c.lz) < 1.5) {
    c.broken = true;
    const lid = c.obj.getObjectByName('lid'); if (lid) { lid.rotation.z = 0.9; lid.position.set(0.6, 0.5, 0); }
    CX.particles.emit({ x: pp.x, y: 0.6, z: pp.z }, { count: 30, color: 0xc8a070, color2: 0x8a6a40, speed: 2, up: 1.5, radius: 1, life: 0.8, size: 0.4, gravity: 4 });
    CX.audio.error(); CX.toast('你碰碎了一口石棺……', '#c0a080');
  }
}
function lightBrazier(b: Props['braziers'][number]) {
  if (!run) return;
  b.lit = true; b.flame.visible = true; CX.audio.portal();
  const n = run.props.braziers.filter(x => x.lit).length;
  CX.toast(`火盆点燃了（${n}/${run.props.braziers.length}）`, '#ffa050');
}
function hiddenMet(): boolean {
  if (!run) return false;
  if (run.def.theme === 'sand') return run.props.coffins.length > 0 && run.props.coffins.every(c => !c.broken);
  if (run.def.theme === 'forge') return run.props.molds.length > 0 && run.props.molds.every(m => m.full);
  return run.props.braziers.length > 0 && run.props.braziers.every(b => b.lit);
}
/** 给 dungeonplus 的场地适配：异变房间放在下一个走廊里，诅咒守卫用本副本的精英 */
function raidPlace(def: RaidDef): DgxPlace {
  const lwp = (lx: number, lz: number) => new THREE.Vector3(def.origin.x + lx * S, 0, def.origin.z + lz * S);   // 11-18 副本 ×1.5
  const elites = Object.entries(def.mobs).filter(([, m]) => ['guard', 'berserk', 'bomber'].includes(m.mech) && m.eliteXp > 0).map(([k]) => k);
  return { zone: 'raid', name: def.name, cx: def.origin.x, halfW: CORRIDOR_HALF * S, synced: false, boss: () => run?.boss?.unit ?? null,
    anomalyAt: i => { const room = def.rooms[Math.min(i + 1, def.rooms.length - 1)]; return lwp((i % 2 ? -1 : 1) * 3, room.corridor[1] - 4); },
    spawnGuard: (i, at) => { const e = spawnMob(elites[i % elites.length], { x: at.x, z: at.z }); e.maxHp = e.hp = Math.round(e.maxHp * 1.5); return e; } };
}
/** 普通副本的首领倒下：遗物 / 异变 / 副本小套 / 通关奖牌 / 隐藏首领 */
function dgBossDown(B: RaidBoss) {
  if (!run) return;
  const def = run.def, id = def.id, cpos = arenaC(B.room), isHidden = !!def.hidden && B.room === def.hidden.room;
  // 副本小套
  if (DUNGEON_SET_DROP && (Math.random() < (SET_CHANCE[run.diff] ?? 0.25) || isHidden)) {   // v1.2.76 停掉
    const pool = SET_OF[id] ?? [], pick = pool[Math.floor(Math.random() * pool.length)];
    const it = pick && CX.gen.generateFixed(pick, curMul.ilvlBoss);
    if (it) { tagItems([it], 'dungeon', `${def.name} · ${DIFF[run.diff].name}`); CX.spawnLoot(it, new THREE.Vector3(cpos.x - 1.5, 0, cpos.z - 1), 0, 1); CX.yell(`副本套装：[${it.name}]`, '#7fd77f', 2.5); }
  }
  if (isHidden) {
    const it = CX.gen.generateFixed(HIDDEN_DROP[id], curMul.ilvlBoss + 2);
    if (it) { tagItems([it], 'dungeon', `${def.name} · 隐藏首领`); CX.spawnLoot(it, new THREE.Vector3(cpos.x + 1.5, 0, cpos.z - 1), 0, 1); CX.yell(`隐藏首领的外观件：[${it.name}]！`, '#ff8000', 4); }
    raidRec.clears[`hidden|${id}`] = (raidRec.clears[`hidden|${id}`] ?? 0) + 1;
    CX.codex.add(`hidden|${id}`);
    run.finalPortal.position.set(cpos.x, 0, cpos.z + 5 * S); run.finalPortal.visible = true;
    run.boss = null; CX.audio.victory();
    return;
  }
  if (run.killed < run.regular) {
    const g = run.gates[run.killed]; gateAnims.push({ g, t: 0 });
    spawnBoss(run.killed);
    dgxOnEncounter('mid', B.room);
    return;
  }
  // 三个首领都倒下：通关
  run.done = true; run.boss = null;
  raidRec.clears[id] = (raidRec.clears[id] ?? 0) + 1;
  raidRec.best[id] = Math.min(raidRec.best[id] ?? Infinity, Math.round(run.t));
  run.finalPortal.visible = true;
  dgxOnComplete(def.name, run.t, new THREE.Vector3(cpos.x, 0, cpos.z));
  CX.toast(`🏆 通关「${def.name}」（${DIFF[run.diff].name}）！用时 ${Math.floor(run.t / 60)}分${Math.floor(run.t % 60)}秒，阵亡 ${run.deaths} 次`, '#ff8000');
  CX.audio.victory(); CX.player.rig.anim?.play('cheer');
  if (def.hidden && hiddenMet()) {
    run.hiddenOpen = true;
    const g = run.gates[def.hidden.room]; gateAnims.push({ g, t: 0 });
    spawnBoss(def.hidden.room);
    CX.yell(`深处传来石门开启的声音……（${def.bosses[def.hidden.room].title}：${def.bosses[def.hidden.room].name}）`, '#ff8000', 4);
  } else if (def.hidden && !raidRec.clears[`hidden|${id}`]) CX.toast('（入口的壁画上好像还藏着什么……）', '#c0a080');
}
/** 测试用：点燃全部火盆 / 打碎一口石棺 */
export function raidPropsDebug(op: 'light' | 'break' | 'state' | 'fill') {
  if (!run) return null;
  if (op === 'light') run.props.braziers.forEach(b => lightBrazier(b));
  if (op === 'break' && run.props.coffins[0]) { const c = run.props.coffins[0]; CX.player.pos.set(run.O.x + c.lx * S, 0, run.O.z + c.lz * S); updateProps(); }
  if (op === 'fill') run.props.molds.forEach(m => { m.full = true; m.fill.visible = true; });
  return { moldsFull: run.props.molds.filter(m => m.full).length, coffinsBroken: run.props.coffins.filter(c => c.broken).length, braziersLit: run.props.braziers.filter(b => b.lit).length, barrels: run.props.barrels.filter(b => b.alive).length, hiddenOpen: run.hiddenOpen, met: hiddenMet(), dg: run.dg, diff: run.diff, regular: run.regular };
}

// ---------------------------------------------------------------- v0.8.0 暗岩深渊（1–10 层）
// 借用三首领普通副本的场地：普通层在某个首领场地刷一波怪，5 / 10 层打该副本的首领；清完一层选岔路进下一层，死亡 = 本趟结束
export let abyRec: AbySave = newAbySave();
export const abyssSave = () => ({ abyss: { ...abyRec, weekly: wk } });
export function abyssLoad(s?: (Partial<AbySave> & { weekly?: Partial<WeeklySave> }) | null) { abyRec = abyLoadSave(s); wk = loadWeekly(s?.weekly); }
// ---- v0.8.2 每周挑战（ISO 周编号固定种子）+ 本地排行
let wk: WeeklySave = newWeeklySave();
let weekNow: number | null = null;   // 测试用：假装今天是某天
/** v0.8.5 成就：每周挑战历史最高层（被淘汰出 8 周的记录不算） */
export const weeklyBest = () => wk.entries.reduce((m, e) => Math.max(m, e.floor), 0);
export function weeklyInfo() {
  const d = new Date(weekNow ?? Date.now()), w = isoWeek(d), seed = weekSeed(w.key), r = weekRange(d);
  return { ...w, seed, muts: weekMuts(seed), end: r.end.getTime(), board: weekBoard(wk, w.key), claimed: wk.claimed[w.key] ?? 0, rewards: WEEK_REWARDS, runs: wk.entries.filter(e => e.week === w.key).length };
}
export function enterWeekly(): boolean {
  const w = weeklyInfo();
  if (!enterAbyss(w.seed, 1, w.muts, { weekly: w.key })) return false;
  CX.toast(`每周挑战 ${w.key}：固定种子，开局畸变 ${w.muts.map(m => MUTS[m].name).join(' + ')}`, '#ffd060');
  return true;
}
/** 每周挑战一趟结束：记排行 + 本周首次到达层数奖励 */
function abyWeekDone(st: AbyState, reached: number, cleared: boolean) {
  if (!st.weekly) return;
  const res = addWeekRun(wk, { week: st.weekly, floor: reached, cleared, t: Math.round(st.t), cls: CX.cls.name, name: CX.curChar?.name ?? '', muts: st.muts.length, at: weekNow ?? Date.now() });
  if (res.shards) { CX.inventory.addStack('mat_abyss', res.shards); CX.toast(`每周挑战奖励：到达第 ${res.reached.join(' / ')} 层 · 深渊碎片 ×${res.shards}`, '#c08aff'); }
  CX.toast(res.rank ? `每周挑战 ${st.weekly}：第 ${reached} 层 · 本地排行第 ${res.rank} 名` : `每周挑战 ${st.weekly}：第 ${reached} 层（未进本周前 10）`, '#ffd060');
}
// ---- v0.8.3 第 6 章剧情最终战：暗岩深渊第 20 层（灰烬铸造厂的隐藏首领场地），无畸变，难度按第 6 层
let storySeed = 0;
function findStorySeed() { if (!storySeed) for (let s = 1; s < 5000; s++) if (newAbyRun(s).dungeons[0] === 'ash_forge') { storySeed = s; break; } return storySeed || 1; }
export const storyActive = () => CX.quests.active().some(a => a.q.id === STORY_FINAL_QUEST && !a.ready);
export const storyDone = () => CX.quests.save().done.includes(STORY_FINAL_QUEST);
export function enterStory(): boolean {
  if (!storyActive()) { CX.toast('需要先接到任务「第六章 · 暗岩之心」', '#f66'); return false; }
  if (!enterAbyss(findStorySeed(), ABYSS.maxFloor, [], { story: true })) return false;
  CX.yell(`${STORY_BOSS_NAME}借着未竟的铸像醒了过来……`, '#c08aff', 4);
  return true;
}
function storyWin() {
  const A = run!.aby!; A.ended = true;
  CX.quests.onKill(STORY_KILL);
  CX.yell(`${STORY_BOSS_NAME}倒下了。`, '#ffd060', 3); CX.audio.victory();
  run!.finalPortal.visible = true; run!.done = true;
  CX.save();
  window.setTimeout(() => { CX.audio.hold('ending'); showEnding(() => { CX.audio.hold(null); CX.toast('回去找墨言交任务，然后去营地门口见布兰', '#ffd060'); }); }, 2500);
}
export const weeklyDebug = () => ({ info: weeklyInfo(), save: JSON.parse(JSON.stringify(wk)) as WeeklySave });
export function weeklySetNow(t: number | null) { weekNow = t; }
export function abyssLock(): string | null { return CX.progression.level < ABYSS.unlock ? `需要等级 ${ABYSS.unlock}` : null; }
export function inAbyss() { return !!run?.aby && CX.zone === 'raid'; }
const ABY_SUMMON = ['slag', 'offering', 'prison', 'clone', 'totem'];
let thornT = -9; let meteorT = 12; const frenzied = new WeakSet<Enemy>();

/** 进入深渊：seed 不给 = 随机；floor 调试用（直接从第 N 层开始） */
export function enterAbyss(seed?: number, floor = 1, muts: MutId[] = [], extra: { story?: boolean; weekly?: string } = {}): boolean {
  const lock = abyssLock();
  if (lock) { CX.toast(`暗岩深渊：${lock}`, '#f66'); CX.audio.error(); return false; }
  if (run) raidCleanup();
  dgxEnd();
  const st = newAbyRun(seed ?? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
  st.floor = Math.max(1, Math.min(ABYSS.maxFloor, floor)); st.muts = muts.filter(m => m in MUTS);   // muts：调试 / 测试用
  Object.assign(st, extra);   // v0.8.2 每周 / v0.8.3 剧情：要在第一层生成前标好
  abyFloor(st, true);
  CX.audio.portal();
  return true;
}
function abyFloor(st: AbyState, first: boolean) {
  const plan = floorPlan(st), def = RAIDS[plan.dungeon as RaidId], sc = floorScale(st.story ? STORY_SCALE_FLOOR : plan.floor, st.muts);
  curMul = { hp: sc.hp, dmg: sc.dmg, ilvlMob: sc.ilvlMob, ilvlBoss: sc.ilvlBoss, hz: sc.hz };
  for (const [k, m] of Object.entries(def.mobs)) { const t = mobType(m); t.speed *= sc.speed; ENEMY_TYPES[k] = t; }
  const b = built[def.id] ??= buildRaid(def);
  if (run) { run.boss?.dispose(); if (run.group !== b.group) run.group.visible = false; }
  clearRaidEnemies(); setDarkness(false);
  CX.panels.forEach(p => CX.togglePanel(p, false));
  run = { def, group: b.group, O: new THREE.Vector3(def.origin.x, 0, def.origin.z), killed: plan.room, checkpoint: plan.room - 1, gates: b.gates, walls: b.walls, boss: null, t: run?.t ?? 0, deaths: 0, done: false,
    exit: b.exit, finalPortal: b.finalPortal, rune: b.rune, pillars: b.pillars, furnace: b.furnace, altar: b.altar, stones: b.stones, seen: new Set(raidRec.seen), hell: false, chalFail: false,
    dg: false, diff: 'normal', regular: def.bosses.length, hiddenOpen: !!def.hidden && plan.room >= def.hidden.room, hiddenTried: false, props: b.props,
    route: null, rs: newRouteState(def.bosses.length), cp: 'entry', cps: new Set(['entry']), visited: new Set(['entry']), pulled: [], opened: new Set(), rg: null, elites: [],
    aby: { st, plan, cleared: false, ended: false, emberT: MUTS.ember.value, choices: [] } };
  b.group.visible = true; meteorT = MUTS.meteor.value;
  resetProps(b.props);
  b.gates.forEach((g, i) => { g.visible = i > plan.room; g.position.y = 0; });
  b.walls.forEach(w => { w.visible = false; });
  b.pillars.forEach(p => { p.hp = 2; p.obj.visible = true; p.obj.rotation.z = 0; });
  b.finalPortal.visible = false;
  const c = arenaC(plan.room), R = def.rooms[plan.room].arena.r * S;   // 11-18 世界半径
  if (plan.boss !== null) spawnBoss(plan.boss);
  else {
    const kinds = Object.entries(def.mobs).filter(([, m]) => !ABY_SUMMON.includes(m.mech)).map(([k]) => k);
    const r = (() => { let a = (st.seed ^ (plan.floor * 7919)) >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; })();
    for (let i = 0; i < plan.mobs; i++) {
      const ang = (i / plan.mobs) * Math.PI * 2 + r() * 0.6, rad = R * (0.2 + r() * 0.4);
      const e = spawnMob(kinds[Math.floor(r() * kinds.length)], { x: c.x + Math.cos(ang) * rad, z: c.z - R * 0.15 + Math.sin(ang) * rad });
      if (plan.elite && i === 0) { e.maxHp = Math.round(e.maxHp * 3); e.hp = e.maxHp; e.rig.root.scale.multiplyScalar(1.35); e.rig.flash.forEach(m => m.emissive.setHex(0x5a1a80)); }
    }
  }
  CX.setZoneLook('raid');
  if (plan.has('dark')) setDarkness(true);
  CX.player.pos.set(c.x, 0, c.z + R - 2);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0; CX.target = null;
  const mt = st.muts.map(m => MUTS[m].name).join('、');
  CX.toast(`${first ? '进入暗岩深渊 · ' : ''}第 ${plan.floor} 层${plan.boss !== null ? `（首领：${def.bosses[plan.boss].name}）` : plan.elite ? '（精英）' : ''}${mt ? ` · 畸变：${mt}` : ''}`, '#c08aff');
  CX.$('raid-hud').style.display = 'flex';
  updateRaidHud(); abyssRender();
}
function abyTick(dt: number) {
  const A = run!.aby!; if (A.ended) return;
  if (!A.cleared) A.st.t += dt;
  if (!A.cleared && A.plan.ember && P().alive) { A.emberT -= dt; if (A.emberT <= 0) { A.emberT = MUTS.ember.value; tele(P().getPos(), 2.6, 1.6, 0.12, '灼地'); } }
  if (!A.cleared && A.plan.has('meteor') && P().alive) { meteorT -= dt; if (meteorT <= 0) { meteorT = MUTS.meteor.value; const p = P().getPos(); for (let k = 0; k < 3; k++) { const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 4; tele({ x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }, 2.4, 1.8, 0.15, '陨落'); } } }
  if (!A.cleared) for (const e of liveRaid()) {
    if (e.isBoss) continue;
    if (A.plan.has('regen') && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * MUTS.regen.value * dt);
    if (A.plan.has('frenzy') && !frenzied.has(e) && e.hp < e.maxHp * MUTS.frenzy.value) {
      frenzied.add(e);
      e.brain = new EnemyBrain(e, e.getPos(), { ...enemyConfig(e.type), attackInterval: e.type.interval / 2, moveSpeed: e.type.speed * 1.3 }, (tg, dd) => enemyStrike(e, tg, dd));
      e.brain.provoke(); e.rig.flash.forEach(m => m.emissive.setHex(0x8a0040)); CX.floatText(e, '狂热！', '#ff3080');
    }
  }
  if (!A.cleared && A.plan.boss === null && run!.t > 0.5 && liveRaid().length === 0) abyClear();
}
function abyHudText() {
  const A = run!.aby!, mt = A.st.muts.map(m => MUTS[m].name).join(' ');
  return `${A.st.weekly ? `每周挑战 ${A.st.weekly}　` : ''}暗岩深渊　第 ${A.plan.floor}/${ABYSS.maxFloor} 层${A.plan.boss !== null ? ' · 首领' : A.plan.elite ? ' · 精英' : ''}　剩余 ${liveRaid().length}${mt ? `　畸变：${mt}` : ''}　奖励 ×${A.st.bonus}　${Math.floor(A.st.t / 60)}:${String(Math.floor(A.st.t % 60)).padStart(2, '0')}　最高 ${abyRec.best}`;
}
/** v0.9.6a 深渊不掉紫装：普通层 / 宝箱 = 金币 + 分解材料；5/10/15 层首领 3 件深渊橙装，20 层 3 件顶级橙装（不重复）+ 暗金碎片 */
function abyLoot(n: number, gold: number, at: Pos, floor = run!.aby!.plan.floor) {
  const items = abyFloorItems(floor);
  tagItems(items, 'raid', `暗岩深渊 · 第 ${floor} 层`);
  const mats = abyMats(floor, n);
  mats.forEach(m => { CX.inventory.addStack(m.id, m.count); CX.toast(`获得 ${CX.forge.stackDef(m.id)?.name ?? m.id} ×${m.count}`, '#7fd7ff'); });
  const all: (number | ItemInstance)[] = [...items, gold];
  all.forEach((l, i) => CX.spawnLoot(l, new THREE.Vector3(at.x, 0, at.z), i, all.length));
  if (items.length) CX.yell(`深渊首领掉落 ${items.length} 件橙装！`, '#ff8000', 2.5);
}
/** 首领层的橙装（测试也走这里） */
export function abyFloorItems(floor: number, rng: () => number = Math.random): ItemInstance[] {
  if (floor % 5 !== 0) return [];
  const cls = CX.cls.id as 'warrior', pool = [...(floor >= ABYSS.maxFloor ? ABY_TOP[cls] : ABY_LG[cls]) ?? []];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const prev = CX.gen.classId; CX.gen.classId = CX.cls.id;
  const out = pool.slice(0, ABY_BOSS_LG).map(id => CX.gen.generateLegendary(id, curMul.ilvlBoss)).filter((x): x is ItemInstance => !!x);
  CX.gen.classId = prev;
  if (floor >= ABYSS.maxFloor) rollAnc(out, ANCIENT_CHANCE.abyTop);   // v0.9.6b 20 层顶级橙装每件 6% 太古
  return out;
}
/** 分解材料 + 暗金碎片：n = 原来的装备掉落次数（吃岔路 / 畸变倍率） */
export function abyMats(floor: number, n: number): { id: string; count: number }[] {
  const out = [{ id: 'mat_dust', count: (2 + Math.floor(floor / 4)) * n }, { id: 'mat_shard', count: (1 + Math.floor(floor / 8)) * n }];
  if (floor >= 8 || floor % 5 === 0) out.push({ id: 'mat_essence', count: Math.max(1, Math.floor(floor / 7)) * (floor % 5 === 0 ? 2 : 1) });
  if (ABY_DARKSHARD[floor]) out.push({ id: 'mat_darkshard', count: ABY_DARKSHARD[floor] });
  return out;
}
/** 11-04 Rhett：深渊首领层胜利特效收敛（不过曝、不挡对白、带淡出）；光环放在传送点（最后一层的离开传送门），没有传送点就在倒下处 */
function abyBossFx(B: RaidBoss, at: { x: number; z: number }) {
  const fp = run?.finalPortal; const halo = fp?.visible ? { x: fp.position.x, z: fp.position.z } : undefined;
  try { BFX.bossDeathSoft(at, B.theme(), B.unit.rig.scale, halo); } catch { /* 主题不全时跳过 */ }
}
/** 清完一层：发奖励 → 最后一层结算，否则弹岔路 */
function abyClear() {
  const A = run!.aby!; if (A.cleared) return;
  A.cleared = true;
  if (A.st.story) { storyWin(); return; }
  const f = A.plan.floor, rw = floorReward(f, A.st.bonus, A.plan.elite), c = arenaC(A.plan.room);
  abyLoot(rw.rolls, rw.gold, { x: c.x, z: c.z });
  CX.addXp(rw.paragon);
  CX.inventory.addStack('mat_abyss', rw.shards); CX.toast(`深渊碎片 ×${rw.shards}`, '#c08aff');   // v0.8.1
  CX.yell(`第 ${f} 层清空！`, '#c08aff', 2.5); CX.audio.victory();
  if (f >= ABYSS.maxFloor) {
    const rec = abyFinish(abyRec, A.st, f, true); A.ended = true; abyWeekDone(A.st, f, true);
    run!.finalPortal.visible = true; run!.done = true;
    CX.toast(`🏆 暗岩深渊 ${ABYSS.maxFloor} 层通关！用时 ${Math.floor(A.st.t / 60)}分${Math.floor(A.st.t % 60)}秒${rec ? ' · 新纪录' : ''}`, '#ff8000');
    CX.player.rig.anim?.play('cheer'); abyDarkReward(); CX.save(); abyssRender();
    return;
  }
  A.choices = pathChoices(A.st);
  abyssShowChoices({ floor: f, best: abyRec.best, muts: A.st.muts, bonus: A.st.bonus, reward: rw, choices: A.choices }, k => abyPick(k), () => abyssLeave());
  if (f === ABY_MID_FLOOR) { CX.toast(`🏅 第 ${f} 层结算：本职业套装部件自选 1 件`, '#ff3040'); abyDarkReward(true); }   // v1.2.38 半程结算（选完再选岔路）
}
/** v1.2.38 半程结算层 */
export const ABY_MID_FLOOR = 10;
/** v0.9.1q 通关 20 层终极奖励：从本职业能穿的暗金里随 3 件，自选 1 件（装等 70） */
/** v0.9.6a 20 层结算：本职业全部暗金 + 本职业套装部件，自选 1 件（每次通关都能领） */
/** v1.2.38 结算拆两次（Rhett 10-25）：第 10 层 = 本职业套装部件自选 1 件（setOnly），第 20 层 = 本职业暗金自选 1 件 */
export function abyDarkOptions(_n = 0, _rng: () => number = Math.random, setOnly = false): ItemInstance[] {
  const prev = CX.gen.classId; CX.gen.classId = CX.cls.id;
  const dark = setOnly ? [] : DARK_ITEMS.filter(d => !d.cls || d.cls === CX.cls.id).map(d => CX.gen.generateFixed(d.id, ENDGAME.dark)).filter((x): x is ItemInstance => !!x && CX.inventory.canEquip(x));
  const set = classSet(CX.cls.id), sets = setOnly ? (set?.pieces ?? []).map(id => CX.gen.generateFixed(id, curMul.ilvlBoss)).filter((x): x is ItemInstance => !!x) : [];
  CX.gen.classId = prev;
  return [...dark, ...sets];
}
/** 第 10 层结算的套装自选（测试也走这里） */
export const abySetOptions = () => abyDarkOptions(0, Math.random, true);
let darkOpts: ItemInstance[] = [];
let darkMid = false;   // 当前弹的是第 10 层套装结算
/** v0.9.6d 测试 / 截图：直接弹 20 层结算自选页 */
export function abyDarkShow(mid = false) { abyDarkReward(mid); }
function abyDarkReward(mid = false) {
  darkOpts = mid ? abySetOptions() : abyDarkOptions(); darkMid = mid; if (!darkOpts.length) return;
  abyssShowDarkPick(darkOpts.map(it => ({ set: !!it.setId, name: it.name, icon: CX.itemSlotHtml(it), lines: it.lines.slice(0, 4), flavor: DARK_ITEMS.find(d => d.id === it.fixedId)?.flavor, slot: it.slot, color: it.setId && it.quality !== 'dark' ? '#ff3040' : QUALITY_COLOR[it.quality], tier: it.quality === 'dark' ? 5 : it.setId ? 3 : 4 })), i => { abyDarkTake(i); if (mid) window.setTimeout(() => { if (run?.aby && !run.aby.ended) openAbyss(); }, 300); }, mid ? `🏅 暗岩深渊第 10 层结算 · 本职业套装部件自选 1 件（${darkOpts.length} 选 1，每趟都能领）` : undefined);
}
/** 领取终极奖励第 i 件（UI / 测试都走这里）；背包满时掉在脚下 */
export function abyDarkTake(i: number): ItemInstance | null {
  const it = darkOpts[i]; if (!it) return null; darkOpts = [];
  rollAnc([it], ANCIENT_CHANCE.abyPick);   // v0.9.6b 领取时判定 10% 太古
  tagItems([it], 'raid', darkMid ? '暗岩深渊 · 10 层结算' : '暗岩深渊 · 20 层终极奖励'); darkMid = false;
  if (CX.inventory.isFull) CX.spawnLoot(it, CX.player.pos.clone(), 0, 1); else { CX.inventory.add(it); CX.noteCodex(it); }
  CX.toast(`终极奖励：获得 [${it.name}]（装等 ${it.itemLevel}）`, '#e8c060'); CX.audio.loot('dark'); CX.save();
  return it;
}
/** 选岔路（UI / 测试都走这里） */
export function abyPick(kind: PathKind): boolean {
  const A = run?.aby; if (!A || !A.cleared || A.ended || !A.choices.includes(kind)) return false;
  abyssHideChoices();
  const res = applyPath(A.st, kind), pp = P().getPos();
  if (res.chest) { abyLoot(res.chest.rolls, res.chest.gold, { x: pp.x, z: pp.z - 1.5 }, 1); CX.toast(`${PATHS.chest.name}：${res.chest.gold} 金币 + 材料包`, '#ffd060'); }
  if (res.heal) { P().hp = P().maxHp; CX.toast(`${PATHS.rest.name}：生命回满${res.removed ? `，移除畸变「${MUTS[res.removed].name}」` : ''}`, '#80ffb0'); }
  if (res.added) CX.toast(`新畸变「${MUTS[res.added].name}」：${MUTS[res.added].desc}`, MUTS[res.added].color);
  // 宝箱落在当前场地：先给 3 秒捡（自动拾取会立刻吸走），再换层
  const go = () => { if (run?.aby === A) abyFloor(res.state, false); };
  if (res.chest && !CX.settings.autoLoot) window.setTimeout(go, 3000); else go();
  return true;
}
/** 一趟结束（死亡 / 中途离开）：最高层 = 已清完的层 */
function abyEnd(cleared: boolean) {
  const A = run?.aby; if (!A || A.ended) return;
  A.ended = true;
  if (A.st.story) return;   // 剧情战不记深渊纪录
  const reached = A.cleared ? A.plan.floor : A.plan.floor - 1;
  const rec = abyFinish(abyRec, A.st, Math.max(0, reached), cleared); abyWeekDone(A.st, Math.max(0, reached), cleared);
  if (rec && reached > 0) CX.toast(`深渊新纪录：第 ${reached} 层`, '#c08aff');
  CX.save(); abyssRender();
}
export const abyssDebug = () => ({ rec: { ...abyRec }, run: run?.aby ? { floor: run.aby.plan.floor, dungeon: run.aby.plan.dungeon, boss: run.aby.plan.boss, mobs: run.aby.plan.mobs, elite: run.aby.plan.elite, muts: run.aby.st.muts.slice(), bonus: run.aby.st.bonus, cleared: run.aby.cleared, ended: run.aby.ended, choices: run.aby.choices.slice(), alive: liveRaid().length, mul: { ...curMul }, seed: run.aby.st.seed, weekly: run.aby.st.weekly ?? null, dark: (CX.scene.fog as THREE.Fog | null)?.far === 15, hidden: run.hiddenOpen } : null, shards: CX.inventory.stack('mat_abyss') });
/** v0.8.1.1：M 键深渊地图用 —— 20 层进度 + 本层场地里的敌人位置 */
export function abyssMapInfo() {
  const A = run?.aby; if (!A) return null;
  const st = A.st, c = arenaC(A.plan.room), R = run!.def.rooms[A.plan.room].arena.r * S, p = P().getPos();   // 11-18 世界半径（深渊小地图按世界坐标画）
  const floors = Array.from({ length: ABYSS.maxFloor }, (_, i) => {
    const f = i + 1, pl = floorPlan(st, f), d = RAIDS[pl.dungeon as RaidId];
    return { f, dungeon: d.name, boss: pl.boss !== null ? `${pl.boss === 3 ? '隐藏首领 · ' : ''}${d.bosses[pl.boss].name}` : null };
  });
  return { floor: st.floor, max: ABYSS.maxFloor, best: abyRec.best, cleared: A.cleared, bonus: st.bonus, t: run!.t, dungeon: run!.def.name, theme: run!.def.theme,
    muts: st.muts.map(m => ({ name: MUTS[m].name, desc: MUTS[m].desc, color: MUTS[m].color })), floors,
    R, me: { x: p.x - c.x, z: p.z - c.z }, foes: liveRaid().map(e => { const q = e.getPos(); return { x: q.x - c.x, z: q.z - c.z, boss: !!e.isBoss }; }) };
}
/** 测试用：把当前层的敌人全部打死 */
export function abyssKillAll() { if (!run?.aby) return 0; const l = liveRaid(); for (const e of l) if (e.alive) CX.fx.dealDamage(e, e.maxHp * 20 + 10, 'physical', P()); return l.length; }   // ×20：盾卫正面只吃 15%
