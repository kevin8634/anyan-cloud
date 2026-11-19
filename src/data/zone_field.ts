// 野外区域「翠风原野」（原创内容）：秋天的白桦林、丘陵、星落遗迹、横贯东西的苇河与木桥、带木栅栏的翠风前哨
// 从灰石营地南门的石门传送过来。这里只放数据（坐标、障碍、怪物、刷新点），浏览器版和命令行模拟共用
// 坐标：世界坐标 = 区域原点 + 局部坐标；局部 x 向东、z 向南（北 = -z），可走范围 ±120（v0.9.3b 由 ±78 扩建）
// v0.9.3b 外环新增：麦穗村（东南，风车 + 水车 + 集市）、石拱桥、坍塌神殿（东北）、风蚀高台（西北，坡道上台）、废矿坑（西南）、隐蔽洞穴（西）
import { EnemyConfig } from '../core/EnemyBrain';
import { Circle } from '../core/NavGrid';
import { Rise, risesY, onRamp } from '../core/Terrain';
import { LAKE_ON, FIELD_WEST, RIVER_X0, lakeDist, onLakeDock } from './field_lake';   // 11-19 落霞湖 qllake（西扩 + 湖）
export { LAKE_ON, FIELD_WEST, LAKE, LAKE_DOCK, RIVER_X0, lakeDist, lakeShore, lakeBedY, lakeTreeOk, onLakeDock } from './field_lake';

export const FIELD_ORIGIN = { x: 0, z: 400 };
export const FIELD_HALF = 120;
const O = FIELD_ORIGIN;
const W = (x: number, z: number) => ({ x: O.x + x, z: O.z + z });

// ---------------------------------------------------------------- 地形：苇河 + 木桥 + 浅滩
/** 河道中线（局部坐标）：z = 12 + 5·sin(0.045x)，半宽 3.6 */
export const riverZ = (lx: number) => 12 + 5 * Math.sin(lx * 0.045);
export const RIVER_HALF = 3.6;
export const BRIDGE = { x0: -2.6, x1: 2.6 };        // 木桥（局部 x 范围）
export const FORD = { x0: -57.5, x1: -52.5 };       // 西边的浅滩（踩石过河）
export const BRIDGE2 = { x0: 76.6, x1: 83.4 };      // v0.9.3b 东边的石拱桥（麦穗村 ↔ 坍塌神殿）
/** 局部坐标是否在河里（桥面和浅滩可走） */
export function inRiverLocal(lx: number, lz: number) {
  if (LAKE_ON && lx < RIVER_X0) return false;   // 11-19 qllake：河在这里汇入落霞湖，往西没有河道
  if (Math.abs(lz - riverZ(lx)) >= RIVER_HALF) return false;
  return !((lx > BRIDGE.x0 && lx < BRIDGE.x1) || (lx > FORD.x0 && lx < FORD.x1) || (lx > BRIDGE2.x0 && lx < BRIDGE2.x1));
}
/** 世界坐标：不可走地形（河 + 边界外） */
export function fieldSolid(x: number, z: number) {
  const lx = x - O.x, lz = z - O.z;
  if (lx > FIELD_HALF || lx < -FIELD_WEST || Math.abs(lz) > FIELD_HALF) return true;   // 11-19 qllake：西边界 = FIELD_WEST（湖关时 = FIELD_HALF）
  if (LAKE_ON && lakeDist(lx, lz) > 0.3 && !onLakeDock(lx, lz)) return true;   // 湖面不可走（南岸栈桥可走）
  return inRiverLocal(lx, lz);
}

// ---------------------------------------------------------------- 关键地点（局部）
export const FIELD_SPOTS = {
  portal: { x: 0, z: 70 },          // 回灰石营地的传送石门
  arrive: { x: 0, z: 65 },          // 传送过来的落脚点
  outpost: { x: 0, z: 48, hw: 14, hd: 10 },   // 翠风前哨：木栅栏 28×20，南北各一个门
  bridge: { x: 0, z: 12 },
  crossroads: { x: 0, z: -6 },
  bandit: { x: -38, z: -30 },       // 劫掠者营地
  ruins: { x: 42, z: -42 },         // 星落遗迹（石柱环 + 祭坛）
  hut: { x: -60, z: -58 },          // 守林人小屋
  // v0.9.3b 外环
  village: { x: 88, z: 44, r: 20 },   // 麦穗村：5 栋房 + 集市 + 水井 + 围栏
  windmill: { x: 112, z: 62 },        // 翠风风车塔（远景主地标）
  watermill: { x: 100, z: 14 },       // 水车磨坊（南岸）
  bridge2: { x: 80, z: 0 },           // 石拱桥（z 由 riverZ 算）
  temple: { x: 86, z: -82, r: 16 },   // 坍塌神殿
  mesa: { x: -90, z: -86 },           // 风蚀高台（台顶有瞭望塔）
  mine: { x: -96, z: 70 },            // 废矿坑
  cave: { x: -108, z: 8 },            // 隐蔽洞穴
};
/** v0.9.3b 地形起伏（局部坐标）：风蚀高台（陡崖 + 东南坡道）+ 4 座缓丘 */
export const FIELD_RISES: Rise[] = [
  { name: '风蚀高台', kind: 'mesa', x: -90, z: -86, r: 13, h: 4.6, ramp: { a: Math.PI / 4, w: 5, len: 15 } },
  { name: '神殿丘', x: 62, z: -104, r: 18, h: 3 },
  { name: '南坡', x: -50, z: 98, r: 20, h: 3.2 },
  { name: '东南丘', x: 104, z: 98, r: 15, h: 2.6 },
  { name: '西丘', x: -108, z: -30, r: 12, h: 2.2 },
  { name: '矿坑岩丘', x: -103, z: 77, r: 14, h: 3.2 },
  // 11-19 qllake：西扩后原来靠西缘山丘的隐蔽洞穴背后变平地，补一座岩丘托住洞口
  ...(LAKE_ON ? [{ name: '洞穴岩丘', x: -123, z: 1, r: 13, h: 3.2 }] : []),
];
/** 可走地面高度（局部坐标，不含河床——河里只有桥 / 浅滩能走）：边缘山丘 + 起伏 */
export function fieldWalkY(lx: number, lz: number) { return risesY(FIELD_RISES, lx, lz); }
/** v0.9.3b 外环怪群（局部坐标）：麦田野猪、神殿傀儡、高台劫掠者、矿坑劫掠者；完整重排见 v0.9.3c */
export const FIELD_PACKS_OUTER: { kinds: string[]; lx: number; lz: number; respawn: number }[] = [
  { kinds: ['boar', 'boar', 'boar'], lx: 66, lz: 74, respawn: 30 }, { kinds: ['boar', 'boar'], lx: 106, lz: 80, respawn: 30 }, { kinds: ['boar', 'boar', 'boar'], lx: 40, lz: 96, respawn: 30 },
  { kinds: ['golem', 'golem'], lx: 78, lz: -72, respawn: 34 }, { kinds: ['golem', 'golem'], lx: 104, lz: -72, respawn: 34 }, { kinds: ['golem'], lx: 86, lz: -98, respawn: 34 },
  { kinds: ['raider', 'archer', 'archer'], lx: -88, lz: -90, respawn: 30 }, { kinds: ['raider', 'raider'], lx: -84, lz: -80, respawn: 30 },
  { kinds: ['raider', 'raider', 'archer'], lx: -86, lz: 58, respawn: 30 }, { kinds: ['raider', 'archer'], lx: -82, lz: 74, respawn: 30 },
];
export const fieldOnRamp = (lx: number, lz: number, pad?: number) => onRamp(FIELD_RISES, lx, lz, pad);
export const FIELD_NPCS: Record<string, { x: number; z: number; yaw: number }> = {
  rowan: { x: -4, z: 44, yaw: Math.PI * 0.85 },
  qinghe: { x: 7, z: 47.5, yaw: -Math.PI / 2 },
  ke: { x: -56, z: -54, yaw: Math.PI * 0.75 },
};

/** 土路（局部坐标折线），用于地面贴图和避开种树 */
export const FIELD_PATHS: [number, number][][] = [
  [[0, 72], [0, 58], [0, 38], [0, 17.5], [0, 6.5], [0, -6]],
  [[0, -6], [-14, -14], [-30, -24], [-44, -40], [-56, -52]],
  [[0, -6], [16, -18], [32, -34], [40, -40]],
  [[0, 38], [-20, 30], [-40, 30]],
  [[0, 38], [22, 32], [40, 34]],
  [[-30, -24], [-42, -10], [-55, 8], [-55, 16], [-52, 26]],   // 经浅滩去西南
  [[0, -6], [30, -2], [50, 2], [66, 4]],                       // 阶段四：去东边的赤砂石门
  // v0.9.3b 外环
  [[40, 34], [62, 38], [76, 42], [88, 44], [108, 55]],         // 前哨东路 → 麦穗村 → 风车
  [[88, 44], [84, 30], [80, 18], [80, 2], [78, -18], [82, -44], [86, -66]],   // 村 → 石拱桥 → 坍塌神殿
  [[66, 4], [80, 2]],
  [[78, -18], [96, -24], [114, -30]],                          // v0.9.3e 去星落高原的山径
  [[88, 44], [98, 26], [96, 21]],                              // 村 → 水车磨坊
  [[-56, -52], [-64, -60], [-70, -66]],                         // 小屋 → 风蚀高台坡脚
  [[-52, 26], [-70, 46], [-90, 64]],                           // 西南 → 废矿坑
  [[-55, 8], [-80, 10], [-100, 8]],                            // 浅滩西 → 隐蔽洞穴
];
const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
export function fieldPathDist(lx: number, lz: number) {
  let d = Infinity;
  for (const pl of FIELD_PATHS) for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, segDist(lx, lz, pl[i], pl[i + 1]));
  return d;
}

// ---------------------------------------------------------------- 静态物件布局（确定性随机，浏览器和模拟一致）
export type FieldPropKind = 'birch' | 'oak' | 'rock' | 'stake' | 'tent' | 'tower' | 'fire' | 'crate' | 'pillar' | 'block' | 'altar' | 'hut' | 'banner' | 'table' | 'stone'
  // v0.9.3b
  | 'house' | 'windmill' | 'watermill' | 'well' | 'stall' | 'blocker' | 'hay' | 'twall' | 'tsteps' | 'tstatue' | 'mine' | 'cave' | 'cart' | 'chest';
export interface FieldProp { kind: FieldPropKind; x: number; z: number; ry: number; s: number; v: number; r: number }   // 世界坐标；r = 碰撞半径（0 = 不挡路）

let built: FieldProp[] | null = null;
export function fieldProps(): FieldProp[] {
  if (built) return built;
  let seed = 20251;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: FieldProp[] = [];
  const add = (kind: FieldPropKind, lx: number, lz: number, r: number, s = 1, ry = rnd() * 6.28, v = rnd()) => { const p = W(lx, lz); out.push({ kind, x: p.x, z: p.z, ry, s, v, r }); };
  const S = FIELD_SPOTS;
  // 前哨站：木栅栏桩（每 1.1 米一根），南北门留 6 米
  const { hw, hd } = S.outpost;
  for (let x = -hw; x <= hw + 0.01; x += 1.1) for (const z of [S.outpost.z - hd, S.outpost.z + hd]) if (Math.abs(x) > 3) add('stake', x, z, 0.35, 1, 0);
  for (let z = S.outpost.z - hd; z <= S.outpost.z + hd + 0.01; z += 1.1) for (const x of [-hw, hw]) add('stake', x, z, 0.35, 1, 0);
  add('tent', -9, 41.5, 2.2, 1, 0.4, 0); add('tent', 9.5, 54, 2.2, 1, 3.6, 1);
  add('tower', 11, 41, 1.7, 1, 0); add('fire', -6.5, 52, 0.9, 1, 0);
  add('table', 9.4, 47.5, 1.0, 1, Math.PI / 2); add('banner', -2.6, 38.4, 0.3, 1, 0); add('banner', 2.6, 38.4, 0.3, 1, 0);
  [[11.5, 56.5], [-11.5, 56.5], [-12, 45], [12.2, 45]].forEach(([x, z], i) => add('crate', x, z, 0.7, 0.9, i, i % 2));
  // 劫掠者营地：破帐篷、篝火、箱子、半圈木桩
  add('tent', -45, -27, 2.2, 1, 1.2, 2); add('tent', -31, -37, 2.2, 1, 4, 3); add('tent', -44, -40, 2.2, 1, 2.5, 2);
  add('fire', -38, -31, 0.9, 1, 0, 1);
  [[-36, -24], [-41, -35], [-29, -29]].forEach(([x, z], i) => add('crate', x, z, 0.7, 1, i, 1));
  for (let a = 0.4; a < 3.6; a += 0.16) add('stake', S.bandit.x + Math.cos(a + 1.6) * 15, S.bandit.z + Math.sin(a + 1.6) * 15, 0.35, 1.1, 0);
  // 星落遗迹：11 米半径的石柱环（西南方向留入口）+ 倒下的石块 + 中央祭坛
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    if (Math.abs(((a - Math.PI * 0.75) + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0.42) continue;   // 入口朝西南
    add('pillar', S.ruins.x + Math.cos(a) * 11, S.ruins.z + Math.sin(a) * 11, 0.8, 1, rnd(), rnd() < 0.45 ? 1 : 0);
  }
  [[34, -48], [50, -32], [47, -53], [55, -45]].forEach(([x, z]) => add('block', x, z, 1.1, 1));
  add('altar', S.ruins.x, S.ruins.z, 2.2, 1, 0);
  // 守林人小屋
  add('hut', S.hut.x, S.hut.z, 3.2, 1, 0.7);
  outerProps(add, rnd);
  // 散落的古石（东南丘陵）
  [[22, 60], [60, 20], [-20, 64], [64, -12], [-66, 40]].forEach(([x, z]) => add('stone', x, z, 0.9, 1));
  // 树：白桦（秋叶金黄/橙红）为主，夹一些圆冠树；避开路、河、营地、遗迹、刷怪点
  const avoid: [number, number, number][] = [[S.outpost.x, S.outpost.z, 17], [S.bandit.x, S.bandit.z, 16], [S.ruins.x, S.ruins.z, 15], [S.hut.x, S.hut.z, 7], [S.portal.x, S.portal.z, 9],
    [-36, 30, 7], [-54, 24, 6], [34, 30, 7], [52, 44, 6], [-60, 52, 4], [60, 60, 4], [-22, 22, 4], [66, 4, 9],   // 最后一个：阶段四东边的赤砂石门
    [S.village.x, S.village.z, 24], [S.windmill.x, S.windmill.z, 8], [S.watermill.x, S.watermill.z, 9], [S.temple.x, S.temple.z, 20], [S.mesa.x, S.mesa.z, 24],
    [S.mine.x, S.mine.z, 12], [S.cave.x, S.cave.z, 7], ...FIELD_PACKS_OUTER.map(p => [p.lx, p.lz, 6] as [number, number, number])];
  const blocked = (lx: number, lz: number) => fieldOnRamp(lx, lz) || fieldSteep(lx, lz);
  for (let i = 0, n = 0; i < 2200 && n < 470; i++) {
    const lx = (rnd() - 0.5) * 2 * 117, lz = (rnd() - 0.5) * 2 * 117;
    if (fieldPathDist(lx, lz) < 4 || Math.abs(lz - riverZ(lx)) < 6.5 || blocked(lx, lz)) continue;
    if (avoid.some(([x, z, r]) => Math.hypot(lx - x, lz - z) < r)) continue;
    const edge = Math.max(Math.abs(lx), Math.abs(lz)) > 108 || (Math.max(Math.abs(lx), Math.abs(lz)) > 60 && Math.max(Math.abs(lx), Math.abs(lz)) < 74);
    const grove = Math.hypot(lx + 58, lz + 50) < 22 || Math.hypot(lx - 60, lz - 8) < 16 || Math.hypot(lx + 100, lz - 20) < 16 || Math.hypot(lx - 30, lz + 100) < 18;   // 西北白桦林、东边小树林；v0.9.3b 西边（藏洞穴）、北边
    if (!edge && !grove && rnd() < 0.55) continue;
    add(rnd() < 0.8 ? 'birch' : 'oak', lx, lz, 0.55, 0.85 + rnd() * 0.5);
    n++;
  }
  for (let i = 0, n = 0; i < 500 && n < 80; i++) {
    const lx = (rnd() - 0.5) * 2 * 116, lz = (rnd() - 0.5) * 2 * 116;
    if (fieldPathDist(lx, lz) < 3 || Math.abs(lz - riverZ(lx)) < 5 || blocked(lx, lz) || avoid.some(([x, z, r]) => Math.hypot(lx - x, lz - z) < r)) continue;
    const s = 0.5 + rnd() * 1.1;
    add('rock', lx, lz, s * 0.85, s);
    n++;
  }
  built = out;
  return out;
}
/** 寻路/碰撞用的圆形障碍 */
export function fieldObstacles(): Circle[] { return fieldProps().filter(p => p.r > 0).map(p => ({ x: p.x, z: p.z, r: p.r * p.s })); }
export const FIELD_BOUNDS = { x0: O.x - FIELD_WEST - 2, z0: O.z - FIELD_HALF - 2, x1: O.x + FIELD_HALF + 2, z1: O.z + FIELD_HALF + 2 };
/** 起伏处是否太陡（散布物、寻路用；局部坐标） */
export function fieldSteep(lx: number, lz: number, maxDeg = 22) {
  const e = 0.5, gx = (fieldWalkY(lx + e, lz) - fieldWalkY(lx - e, lz)) / (2 * e), gz = (fieldWalkY(lx, lz + e) - fieldWalkY(lx, lz - e)) / (2 * e);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI > maxDeg;
}

// ---------------------------------------------------------------- v0.9.3b 外环建筑（局部坐标，r = 碰撞半径）
type AddFn = (kind: FieldPropKind, lx: number, lz: number, r: number, s?: number, ry?: number, v?: number) => void;
/** 房屋占地是矩形，寻路只认圆：沿长边放 3 个圆（第一个带模型，其余 kind='blocker' 只挡路，不出模型） */
function outerProps(add: AddFn, rnd: () => number) {
  const S = FIELD_SPOTS, V = S.village;
  const house = (x: number, z: number, ry: number, v: number) => {
    add('house', x, z, 2.6, 1, ry, v);
    const ca = Math.cos(ry), sa = Math.sin(ry);
    for (const k of [-2.2, 2.2]) add('blocker', x + ca * k, z - sa * k, 2.3, 1, 0, 0);
  };
  // 麦穗村：5 栋房围着集市广场，东北角风车塔，南岸水车磨坊
  house(V.x - 12, V.z - 8, 0.15, 0); house(V.x + 2, V.z - 13, -0.1, 1); house(V.x + 14, V.z - 6, -0.5, 2);
  house(V.x - 13, V.z + 9, 3.0, 1); house(V.x + 12, V.z + 11, 3.4, 0);
  add('well', V.x, V.z + 1, 1.2, 1, 0);
  add('stall', V.x - 5, V.z + 5, 1.3, 1, 0.2); add('stall', V.x + 5, V.z + 5.5, 1.3, 1, -0.2);
  add('cart', V.x + 7, V.z - 3, 1.2, 1, 1.2); add('hay', V.x - 6, V.z - 3, 0.9, 1); add('hay', V.x + 18, V.z + 2, 0.9, 1.1);
  [[V.x - 4, V.z - 4], [V.x + 9, V.z + 3]].forEach(([x, z], i) => add('crate', x, z, 0.7, 0.9, i, i % 2));
  add('fire', V.x - 2, V.z + 10, 0.9, 1, 0, 0);
  add('banner', V.x - 3, V.z - 20.5, 0.3, 1, 0); add('banner', V.x + 3, V.z - 20.5, 0.3, 1, 0);
  // 村子外围矮木栅（北面留路口，西面留前哨来的路口）
  for (let a = 0; a < Math.PI * 2; a += 0.075) {
    const x = V.x + Math.cos(a) * 21, z = V.z + Math.sin(a) * 19;
    const lx = x - V.x, lz = z - V.z;
    if (lx > -9 && lx < 2 && lz < 0) continue;              // 北门（去石拱桥 / 神殿）
    if (lx < -15 && Math.abs(lz) < 5) continue;              // 西门（前哨来的路）
    if (lx > 12 && lz > 6 && lz < 16) continue;             // 东北门（风车）
    if (lx > 4 && lz < -10) continue;                        // 东北角（水车方向）留空
    add('stake', x, z, 0.3, 0.75, a);
  }
  add('windmill', S.windmill.x, S.windmill.z, 3.2, 1, -0.6);
  add('watermill', S.watermill.x + 1, S.watermill.z + 2.5, 3.0, 1, 0);
  // 坍塌神殿：残墙围出 24×20 的殿基，北面三尊残像，正中石阶 + 祭坛
  const T = S.temple;
  for (const [x, z, ry, v] of [[-12, -10, 0, 0], [-12, -2, 0, 1], [-12, 6, 0, 0], [12, -10, 0, 1], [12, -2, 0, 0], [12, 6, 0, 1], [-6, -12, Math.PI / 2, 0], [6, -12, Math.PI / 2, 1]] as [number, number, number, number][])
    { add('twall', T.x + x, T.z + z, 2.1, 1, ry, v); }
  for (const x of [-7, 0, 7]) add('tstatue', T.x + x, T.z - 9, 1.2, 1, 0, x === 0 ? 1 : 0);
  add('tsteps', T.x, T.z + 1, 2.6, 1, 0);
  for (let i = 0; i < 6; i++) add('pillar', T.x + (i % 2 ? 7.5 : -7.5), T.z - 5 + Math.floor(i / 2) * 6, 0.8, 1, rnd(), i === 3 || i === 4 ? 1 : 0);
  [[T.x - 4, T.z + 9], [T.x + 5, T.z + 10], [T.x + 16, T.z + 2], [T.x - 17, T.z - 6]].forEach(([x, z]) => add('block', x, z, 1.1, 1));
  // 风蚀高台：台顶瞭望塔 + 篝火
  add('tower', S.mesa.x - 7, S.mesa.z - 7, 1.7, 1, 0.3); add('fire', S.mesa.x - 3, S.mesa.z + 6, 0.9, 1, 0, 1);
  add('crate', S.mesa.x - 6, S.mesa.z + 2, 0.7, 1, 0, 1);
  // 废矿坑：岩壁 + 支撑木 + 矿车
  add('mine', S.mine.x, S.mine.z, 0, 1, Math.PI * 0.75);   // 洞口朝东北（+x −z）
  { const bx = -Math.SQRT1_2, bz = Math.SQRT1_2, sx = Math.SQRT1_2, sz = Math.SQRT1_2;   // 背后 / 侧向
    for (const [b, sd, r] of [[1.5, -3.6, 1.6], [1.5, 3.6, 1.6], [4, 0, 2.4], [3.5, -3.5, 1.8], [3.5, 3.5, 1.8]] as [number, number, number][]) add('blocker', S.mine.x + bx * b + sx * sd, S.mine.z + bz * b + sz * sd, r, 1, 0, 0); }
  add('cart', S.mine.x + 6, S.mine.z - 6, 1.1, 1, 0.8, 1); add('crate', S.mine.x + 9, S.mine.z - 2, 0.7, 1, 0, 0);
  // 隐蔽洞穴：林子里的洞口 + 一口旧箱子（开箱在 v0.9.3e）
  add('cave', S.cave.x, S.cave.z, 0, 1, Math.PI / 2);
  [[-1.2, -3.4], [-1.2, 3.4], [-2.6, -2], [-2.6, 2], [-4, 0]].forEach(([dx, dz]) => add('blocker', S.cave.x + dx, S.cave.z + dz, 1.2, 1, 0, 0));
  add('chest', S.cave.x + 1.5, S.cave.z, 0.6, 1, -Math.PI / 2);
}

// ---------------------------------------------------------------- 怪物
export interface FieldMobDef {
  name: string; level: number; hp: number; xp: number; ilvl: number; config: EnemyConfig;
  ranged?: boolean; elite?: boolean; rare?: boolean; onHitDot?: { dps: number; duration: number }; loot: string;
}
export const FIELD_MOBS: Record<string, FieldMobDef> = {
  boar: { name: '鬃背野猪', level: 9, hp: 380, xp: 55, ilvl: 11, loot: 'trash_field',
    config: { aggroRange: 8, attackRange: 2.0, attackDamage: 20, attackInterval: 1.5, moveSpeed: 4.4, leashRange: 30, patrolRadius: 4 } },
  raider: { name: '荒原劫掠者', level: 11, hp: 480, xp: 65, ilvl: 13, loot: 'trash_field',
    config: { aggroRange: 10, attackRange: 2.2, attackDamage: 27, attackInterval: 1.7, moveSpeed: 3.8, leashRange: 30, patrolRadius: 3 } },
  archer: { name: '劫掠弩手', level: 11, hp: 360, xp: 65, ilvl: 13, ranged: true, loot: 'trash_field',
    config: { aggroRange: 13, attackRange: 10, attackDamage: 23, attackInterval: 2.2, moveSpeed: 3.4, leashRange: 30, patrolRadius: 2 } },
  golem: { name: '遗迹石傀儡', level: 13, hp: 720, xp: 80, ilvl: 15, loot: 'trash_field',
    config: { aggroRange: 8, attackRange: 2.6, attackDamage: 36, attackInterval: 2.4, moveSpeed: 2.6, leashRange: 28, patrolRadius: 2 } },
  // 精英：在原野北部游荡的劫掠头目，攻击带流血
  chief: { name: '赤鬃 · 劫掠头目', level: 16, hp: 3400, xp: 450, ilvl: 18, elite: true, onHitDot: { dps: 10, duration: 4 }, loot: 'elite_field',
    config: { aggroRange: 11, attackRange: 2.8, attackDamage: 52, attackInterval: 2.1, moveSpeed: 3.6, leashRange: 34, patrolRadius: 2 } },
  // 稀有：金鬃野猪，随机出现在三个地点之一，掉落更好
  goldboar: { name: '金鬃 · 稀有', level: 14, hp: 1100, xp: 250, ilvl: 17, rare: true, loot: 'rare_field',
    config: { aggroRange: 9, attackRange: 2.2, attackDamage: 34, attackInterval: 1.4, moveSpeed: 5, leashRange: 30, patrolRadius: 6 } },
};

/** 成群刷新：每群 2~3 只，死后 respawn 秒复活（世界坐标） */
export interface FieldPack { kinds: string[]; x: number; z: number; respawn: number; outer?: boolean }
// v0.9.3c 刷新规则：v0.9.3b 扩出来的外环（±78 以外）普通群 45–60 秒（按位置定）且玩家走开 30 米才刷；老任务区保持原刷新
const pack = (kinds: string[], lx: number, lz: number, old = 28): FieldPack => { const p = W(lx, lz), outer = Math.max(Math.abs(lx), Math.abs(lz)) > 78; return { kinds, x: p.x, z: p.z, respawn: outer ? 45 + Math.abs(Math.round(lx * 7 + lz * 13)) % 16 : old, outer }; };
export const FIELD_PACKS: FieldPack[] = [
  pack(['boar', 'boar', 'boar'], -36, 30), pack(['boar', 'boar'], -54, 24), pack(['boar', 'boar', 'boar'], 34, 30), pack(['boar', 'boar'], 52, 44),
  pack(['raider', 'raider', 'archer'], -34, -24), pack(['raider', 'archer', 'archer'], -46, -36), pack(['raider', 'raider', 'archer'], -26, -40),
  pack(['golem', 'golem'], 38, -36, 32), pack(['golem'], 48, -46, 32), pack(['golem', 'golem'], 44, -50, 32),
  ...FIELD_PACKS_OUTER.map(p => pack(p.kinds, p.lx, p.lz, p.respawn)),
];
/** 精英游荡路线（北岸一圈） */
export const CHIEF_ROUTE = [[-20, -20], [-8, -48], [14, -26], [2, -6], [-24, -6]].map(([x, z]) => W(x, z));
export const CHIEF_RESPAWN = 300;   // v0.9.3c 精英 5 分钟
/** 稀有怪的三个出现点 */
export const RARE_SPOTS = [[-60, 52], [60, 60], [-22, 22]].map(([x, z]) => W(x, z));
export const RARE_RESPAWN = 480;    // v0.9.3c 稀有 8–15 分钟（首次 8 分钟，之后每次随机）
