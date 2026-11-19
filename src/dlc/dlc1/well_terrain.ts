// 11-04 raidA 场景改造：竖井层次地形（Rhett 11-04 00:02「做好层次立体感、不规则感，不要像一个平面」）
// 走的路 = 一条从井口往井底下降的栈道走廊（沿 WELL_WILD.paths 主路），五个首领场地是各自的平台（台面平整，首领红圈 / 地面特效不受影响）；
// 走廊以外是不可走的深渊（崖边带噪声，不规则），深渊底 ≈ -16 米。高度 = 本体 groundAdd（地形 / 贴地 / 寻路共用），不可走 = solidAt。
// 只在 ?scene=new（默认）生效；?scene=old 保持旧版平地，便于前后对照。
import { sceneMode } from './well_dock_hd';

type P2 = [number, number];
/** 11-07 钟井 v2（Rhett 18:34「大一点的地图，至少原来 3 倍的行走路线，蜿蜒曲折而不是简单的绕圈下去」，18:46 批）：
 *  S 形回折主路约 1100 米（原 257 米），落差 66 米（+12 → −54）。设计稿 docs/设计/钟井v2/，数据 tools/well2/layout.py。
 *  主路节点（局部坐标）+ 行走高度 + 该点之前那一段的类型（path 栈道 / boss 首领场地 / tide 涨潮 / cave 冰窟 / lift 钟笼升降 / bridge 锈链断桥 / boat 暗河岸）。
 *  本体地面是一张高度图：同一个 x, z 只有一个可走高度，所以路线不上下叠层。 */
export const WELL_ROUTE: { p: P2; h: number; k: string }[] = [
  { p: [0, 128], h: 12, k: 'start' },
  { p: [0, 104], h: 12, k: 'path' },
  { p: [0, 88], h: 12, k: 'boss' },
  { p: [-24, 96], h: 11, k: 'path' },
  { p: [-52, 112], h: 10, k: 'path' },
  { p: [-80, 108], h: 8.5, k: 'path' },
  { p: [-98, 90], h: 7, k: 'path' },
  { p: [-76, 74], h: 5.5, k: 'path' },
  { p: [-58, 58], h: 4.5, k: 'path' },
  { p: [-84, 44], h: 3, k: 'path' },
  { p: [-110, 38], h: 2, k: 'path' },
  { p: [-118, 14], h: 0.5, k: 'tide' },
  { p: [-100, 4], h: 0, k: 'tide' },
  { p: [-82, 8], h: 0, k: 'boss' },
  { p: [-96, -18], h: -2, k: 'cave' },
  { p: [-118, -40], h: -4, k: 'cave' },
  { p: [-100, -62], h: -6, k: 'cave' },
  { p: [-74, -56], h: -7, k: 'cave' },
  { p: [-62, -80], h: -9, k: 'cave' },
  { p: [-40, -104], h: -11, k: 'cave' },
  { p: [-14, -100], h: -12, k: 'boss' },
  { p: [-4, -86], h: -24, k: 'lift' },
  { p: [-30, -62], h: -24, k: 'bridge' },
  { p: [-44, -30], h: -25, k: 'bridge' },
  { p: [-34, 0], h: -26, k: 'bridge' },
  { p: [-20, 28], h: -27, k: 'bridge' },
  { p: [8, 44], h: -28, k: 'bridge' },
  { p: [40, 52], h: -29, k: 'bridge' },
  { p: [72, 62], h: -30, k: 'bridge' },
  { p: [98, 70], h: -30, k: 'boss' },
  { p: [118, 40], h: -31, k: 'boat' },
  { p: [112, 0], h: -32, k: 'boat' },
  { p: [120, -40], h: -33, k: 'boat' },
  { p: [96, -70], h: -34, k: 'boat' },
  { p: [72, -96], h: -37, k: 'path' },
  { p: [46, -84], h: -40, k: 'path' },
  { p: [66, -60], h: -42, k: 'path' },
  { p: [56, -40], h: -44, k: 'path' },
  { p: [70, -24], h: -46, k: 'path' },
  { p: [54, -16], h: -54, k: 'lift' },
  { p: [36, -16], h: -54, k: 'boss' },
];
/** 断桥绳梯捷径（屠夫死后放下；现阶段常开） */
const SHORTCUT: { p: P2; h: number }[] = [{ p: [-58, 58], h: 4.5 }, { p: [-80, 20], h: 0 }];
/** 各类路段半宽（米） */
const HW_OF: Record<string, number> = { path: 5, boss: 6, tide: 5.5, cave: 5.5, lift: 4, bridge: 3.6, boat: 6.5, start: 5 };
/** 首领场地 / 营地（台面完全平整，边缘不规则，不是正圆）：x, z, 基准半径, 高度 */
const PLAT: [number, number, number, number][] = [
  [0, 120, 10, 12],                            // 井口营地
  [-90, 6, 17, 0],                             // ② 半淹礼拜堂
  [-26, -102, 17, -12],                        // ③ 冰封湖面
  [86, 66, 19, -30],                           // ④ 黑水两岸
  [30, -16, 24, -54],                          // ⑤ 井底三层沉钟腔
];
const platR = (x: number, z: number, px: number, pz: number, r: number) => { const a = Math.atan2(z - pz, x - px); return r * (1 + 0.16 * Math.sin(a * 3 + px * 0.1) + 0.09 * Math.sin(a * 5 - pz * 0.1)); };
/** 井口码头：甲板矩形可走，四周一圈水池（水面在甲板下 0.6 米），外沿岩唇，再往外是深渊 */
export const DOCK = { x: 0, z: 96, hx: 12.2, hz: 11.7, h: 12, pool: 19.5, rim: 22.5 };
/** 路边额外落脚点（小怪站位）：x, z, 半径 */
const EXTRA: [number, number, number][] = [[-34, 104, 5], [-90, 100, 5], [-66, 64, 5], [-112, -30, 5], [-84, -60, 5], [-52, -92, 5], [-38, -46, 4.5], [-28, 14, 4.5], [24, 50, 4.5], [116, 20, 6], [114, -20, 6], [60, -90, 5], [62, -50, 5]];
/** 井壁内半径（往外抬成砖砌井壁） */
export const WELL_R = 138;
/** 井心悬钟（Lux3D scene_wl_well_bell）：在井底沉钟腔正上方 */
export const WL_BELL = { x: 30, z: -16, y: -22, h: 11 };
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x: number, z: number) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
export const wfbm = (x: number, z: number) => vn(x, z) * 0.55 + vn(x * 2.3, z * 2.3) * 0.3 + vn(x * 5.1, z * 5.1) * 0.15;
const seg = (x: number, z: number, a: P2, b: P2) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t }; };
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 单点精确计算：行走高度 h、离可走边缘的距离 e（<0 在里面） */
/** 路段表（预先算好方向 / 长度 / 包围盒，网格预计算时不分配对象） */
const SEGS = (() => {
  const out: { ax: number; az: number; dx: number; dz: number; L2: number; ha: number; hb: number; hw: number; x0: number; x1: number; z0: number; z1: number }[] = [];
  const push = (A: { p: P2; h: number }, B: { p: P2; h: number }, hw: number) => { const dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1], m = 40;
    out.push({ ax: A.p[0], az: A.p[1], dx, dz, L2: dx * dx + dz * dz || 1, ha: A.h, hb: B.h, hw, x0: Math.min(A.p[0], B.p[0]) - m, x1: Math.max(A.p[0], B.p[0]) + m, z0: Math.min(A.p[1], B.p[1]) - m, z1: Math.max(A.p[1], B.p[1]) + m }); };
  for (let i = 0; i < WELL_ROUTE.length - 1; i++) push(WELL_ROUTE[i], WELL_ROUTE[i + 1], HW_OF[WELL_ROUTE[i + 1].k] ?? 5);
  push(SHORTCUT[0], SHORTCUT[1], 3);
  return out;
})();
/** 16 米格子 → 离它 40 米内的路段（网格预计算只查这些；其余路段对 h 的权重可忽略，对 e 只需下界 BUCKET_FAR） */
const BK = 16, BN = 22, BO = 176;
const BUCKETS: number[][] = Array.from({ length: BN * BN }, (_, k) => { const cx = (k % BN) * BK - BO + BK / 2, cz = Math.floor(k / BN) * BK - BO + BK / 2, r = BK * 0.71;
  return SEGS.map((S, i) => { const t = Math.max(0, Math.min(1, ((cx - S.ax) * S.dx + (cz - S.az) * S.dz) / S.L2)); return Math.hypot(cx - S.ax - S.dx * t, cz - S.az - S.dz * t) - r < 40 ? i : -1; }).filter(i => i >= 0); });
const SMP = { h: 0, e: 0 };
/** 单点精确计算：行走高度 h、离可走边缘的距离 e（<0 在里面）。结果写进 SMP（不分配） */
function sample(x: number, z: number): typeof SMP {
  let e = Infinity, wsum = 0, hsum = 0;
  const bi = Math.floor((x + BO) / BK), bj = Math.floor((z + BO) / BK), list = bi >= 0 && bj >= 0 && bi < BN && bj < BN ? BUCKETS[bj * BN + bi] : null;
  if (!list || !list.length) e = 34;   // 离所有路段 40 米以上 = 深渊（崖边过渡 14 米以外，h 不起作用）
  if (list) for (let k = 0; k < list.length; k++) {
    const S = SEGS[list[k]];
    const t = Math.max(0, Math.min(1, ((x - S.ax) * S.dx + (z - S.az) * S.dz) / S.L2)), px = x - S.ax - S.dx * t, pz = z - S.az - S.dz * t, dd = Math.sqrt(px * px + pz * pz), d = dd - S.hw;
    if (d < e) e = d; const q = Math.max(dd, 0.3), q2 = q * q, w = 1 / (q2 * q2); wsum += w; hsum += w * (S.ha + (S.hb - S.ha) * t);
  }
  let h = wsum > 0 ? hsum / wsum : 0, plat = Infinity, ph = 0;
  for (const [px, pz, r, hh] of PLAT) { const d = Math.hypot(x - px, z - pz) - platR(x, z, px, pz, r); if (d < e) e = d; if (d < plat) { plat = d; ph = hh; } }
  { const d = Math.max(Math.abs(x - DOCK.x) - DOCK.hx, Math.abs(z - DOCK.z) - DOCK.hz); if (d < e) e = d; if (d < plat) { plat = d; ph = DOCK.h; } }
  for (const [px, pz, r] of EXTRA) { const d = Math.hypot(x - px, z - pz) - r; if (d < e) e = d; }
  if (wsum === 0) h = ph;
  h = ph + (h - ph) * sstep(-1, 5, plat);   // 平台里完全平，出平台 0–5 米内过渡到走廊坡度
  const nk = Math.min(1, Math.max(0, (Math.hypot(x - DOCK.x, z - DOCK.z) - DOCK.rim) / 6));   // 码头水池里不加噪声（甲板边 / 栈桥边要直）
  if (e < 20) e += (wfbm(x * 0.21 + 3.1, z * 0.21 - 7.4) - 0.5) * 3.2 * nk;   // 崖边不规则（远离路的深渊里不用算）
  SMP.h = h; SMP.e = e; return SMP;
}
const ABYSS = -75;
/** 预计算 1 米网格（本体地形 / 贴地 / 寻路每帧都会查，不能每次走全量计算） */
const N = 320, OFF = 160;
let G: Float32Array | null = null, S: Uint8Array | null = null;
function grid() {
  if (G) return;
  G = new Float32Array(N * N); S = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i - OFF, z = j - OFF, { h, e } = sample(x, z);
    const r = Math.hypot(x, z), wallY = r > WELL_R - 6 ? 26 + wfbm(x * 0.05 + 9, z * 0.05) * 14 : 0;   // 井壁根部：外圈抬成井壁
    const floor = e <= 0 ? 0 : ABYSS + (wfbm(x * 0.06, z * 0.06) - 0.5) * 9 + (wallY - ABYSS) * sstep(WELL_R - 6, WELL_R + 8, r);
    const rd = Math.hypot(x - DOCK.x, z - DOCK.z);
    G[j * N + i] = e <= 0 ? h : rd < DOCK.rim ? DOCK.h - 1.6 + 3.2 * sstep(DOCK.pool, DOCK.rim - 0.5, rd) : h + (floor - h) * Math.pow(sstep(0, 14, e), 0.7);
    S[j * N + i] = e > 0.7 ? 1 : 0;
    if (CHAN_ON) { const cx = Math.abs(x - CHAN.x), cz = Math.abs(z - CHAN.z); if (cx < CHAN.hx + 0.8 && cz < CHAN.hz + 1.5) G[j * N + i] -= CHAN.d * (1 - sstep(CHAN.hx - 0.5, CHAN.hx + 0.3, cx)) * (1 - sstep(CHAN.hz - 0.5, CHAN.hz + 1, cz)); }
  }
}
/** 11-18 Rhett「BOSS 所在区域的水体（比如生死渡那边的河道）」：黑水两岸中间那道黑水下切成河道（深 0.9 米，宽 7、长 34，与 blackWater 同位）；?off=wellchan 不切 */
export const CHAN = { x: 86, z: 66, hx: 3.5, hz: 17, d: 0.9 };
export const CHAN_ON = (() => { try { return !/(?:[?&]off=[^&]*\bwellchan\b)/.test(location.search); } catch { return true; } })();
const on = () => sceneMode() === 'new';
/** groundAdd：局部坐标的高度（双线性） */
export function wellGround(x: number, z: number): number {
  if (!on()) return 0; grid();
  const fx = Math.max(0, Math.min(N - 1.001, x + OFF)), fz = Math.max(0, Math.min(N - 1.001, z + OFF)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, g = G!;
  const a = g[j * N + i], b = g[j * N + i + 1], c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** solidAt：深渊不可走 */
export function wellSolid(x: number, z: number): boolean {
  if (!on()) return false; grid();
  const i = Math.round(x + OFF), j = Math.round(z + OFF); if (i < 0 || j < 0 || i >= N || j >= N) return true;
  return S![j * N + i] === 1;
}
/** 离可走边缘的距离（造景用：沿崖边散布碎岩） */
export function wellEdge(x: number, z: number): number { return sample(x, z).e; }
export const WELL_ABYSS = ABYSS;
