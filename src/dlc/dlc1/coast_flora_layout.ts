// 11-15 沉钟海岸草木 v2 布局（纯函数，不依赖 THREE / canvas，便于离线统计）：
//   避让表 = 营地 / 码头 / 钟井 / 出入口 / 主路 / 潮池 / 涨潮淹没的低洼地 / 巨钟小钟 / 沉船 / 礁柱 / 玄武岩柱群 / 鲸骨 / 骨拱 / 石碑 / 石堤
//   分区：后滩草甸（离水线 > 14 米、离开淹没低洼地，成片）· 沙丘带（离水线 9–60 米）· 湿沙上沿芦苇 · 潮池 / 低洼地边芦苇
import { shoreD, COAST_HALF, ZONE_B, WELL, A_POOLS, BASALT_A, BASALT_C, WHALE, BONE_ARCH, SEAWALL, coastGround } from './coast_layout';

// fbm 与 flora_hd.fbm2 同式（这里复制一份，免得离线统计时牵进 three）
function vnoise(x: number, z: number) {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function fbmC(x: number, z: number) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1 + 5, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3 + 9) * 0.2; }
export function rngC(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** 主路（同 coast.ts COAST_WILD.paths） */
export const COAST_PATHS: [number, number][][] = [[[0, 84], [0, 50], [0, 14], [0, -30], [0, -62], [0, -84]], [[0, 22], [-22, 22], [-42, 20]], [[0, -6], [22, -16], [44, -28]], [[0, 2], [40, 6], [78, 12]], [[0, -14], [-40, -18], [-68, -22]]];
/** 涨潮淹没的低洼地（同 tide.ts TIDE_POOLS） */
const FLOOD: [number, number, number][] = [[0, -10, 18], [-42, 20, 18], [0, -60, 16]];
/** 圆形避让 [x, z, r]：营地、巨钟 / 小钟、沉船、礁柱、石碑、营地帐篷外圈 */
const DISCS: [number, number, number][] = [
  [0, 62, 15], [0, -12, 10], [-10, -58, 3.5], [14, -66, 3.5], [-48, 12, 9], [-30, 34, 9],
  [40, -30, 2.5], [50, -18, 2.2], [36, -14, 2], [56, -36, 2.8], [46, -44, 2.4], [28, -40, 2.2], [-20, -40, 2.4], [24, 4, 2],
  [-66, -30, 2], [-96, -6, 2], [ZONE_B.x, ZONE_B.z, 30], [WELL.x, WELL.z, WELL.r + 4],
  ...BASALT_A.map(([x, z, r]) => [x, z, r + 1.5] as [number, number, number]), ...BASALT_C.map(([x, z, r]) => [x, z, r + 1.5] as [number, number, number]),
  ...BONE_ARCH.map(([x, z, , s]) => [x, z, 4.5 * s] as [number, number, number]),
];
function segD(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}
export function pathD(x: number, z: number): number {
  let d = 1e9; for (const p of COAST_PATHS) for (let i = 0; i + 1 < p.length; i++) d = Math.min(d, segD(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return d;
}
/** 离淹没低洼地边的距离（< 0 = 在里面） */
export function floodD(x: number, z: number): number { let d = 1e9; for (const [fx, fz, r] of FLOOD) d = Math.min(d, Math.hypot(x - fx, z - fz) - r); return d; }
/** 离潮池椭圆的「椭圆半径」最小值（< 1 = 在池里） */
export function poolE(x: number, z: number): number {
  let e = 1e9; for (const [px, pz, rx, rz, ro] of A_POOLS) {
    const dx = x - px, dz = z - pz, c = Math.cos(ro), s = Math.sin(ro);
    e = Math.min(e, Math.hypot((dx * c + dz * s) / rx, (-dx * s + dz * c) / rz));
  } return e;
}
export function slopeAt(x: number, z: number, G: (x: number, z: number) => number = coastGround) {
  return Math.hypot(G(x + 0.6, z) - G(x - 0.6, z), G(x, z + 0.6) - G(x, z - 0.6)) / 1.2;
}
/** 共用避让：clear = 离主路 / 物件的额外空隙（树用得大一些） */
export function floraFree(x: number, z: number, clear = 0, G?: (x: number, z: number) => number): boolean {
  if (Math.abs(x) > COAST_HALF - 6 || Math.abs(z) > COAST_HALF - 6 || shoreD(x, z) > -6) return false;
  if (Math.abs(x) < 4 + clear && Math.abs(z) > 70) return false;                 // 南北出入口
  if (pathD(x, z) < 2.2 + clear) return false;
  for (const [cx, cz, r] of DISCS) if (Math.hypot(x - cx, z - cz) < r + clear) return false;
  for (let i = 0; i + 1 < WHALE.length; i++) if (segD(x, z, WHALE[i][0], WHALE[i][1], WHALE[i + 1][0], WHALE[i + 1][1]) < 3 + clear) return false;
  if (segD(x, z, SEAWALL[0], SEAWALL[1], SEAWALL[2], SEAWALL[3]) < 4 + clear) return false;
  if (poolE(x, z) < 1.12 + clear * 0.3) return false;
  return slopeAt(x, z, G) < 0.55;
}
export const MW = { d0: 16, d1: 14, p0: 0.53 };
/** 草甸权重 0..1：离水线越远、离淹没低洼地越远越密（后滩成片），fbm 只做「浓 / 淡」而不挖洞 */
export function meadowW(x: number, z: number): number {
  const d = shoreD(x, z), f = floodD(x, z);
  const inland = Math.min(1, Math.max(0, (-d - MW.d0) / MW.d1)), dryLand = Math.min(1, Math.max(0, (f - 3) / 12));
  const patch = fbmC(x * 0.028 + 3, z * 0.028);
  let grove = 0;   // 林团林下：树不站在光沙上
  for (const [gx, gz, gr] of GROVES) grove = Math.max(grove, Math.min(1, Math.max(0, 1 - (Math.hypot(x - gx, z - gz) - gr * 0.7) / (gr * 0.6 + 4))));
  const pw = Math.min(1, Math.max(0, (patch - MW.p0) / 0.18)), gw = grove * Math.min(1, Math.max(0, (fbmC(x * 0.08 + 5, z * 0.08) - 0.25) / 0.3));
  return inland * dryLand * Math.max(pw, gw);
}
/** 芦苇：湿沙带上沿（离水线 8–16 米）+ 潮池边 + 淹没低洼地外沿 0–5 米 */
export function reedW(x: number, z: number): number {
  const d = shoreD(x, z), pe = poolE(x, z), f = floodD(x, z);
  let w = 0;
  if (d < -8 && d > -16) w = fbmC(x * 0.07, z * 0.07 + 7) > 0.5 ? 1 : 0;
  if (pe > 1.15 && pe < 1.9) w = 1;
  if (f > 0 && f < 5 && fbmC(x * 0.09 + 2, z * 0.09) > 0.45) w = 1;
  return w;
}

// ---------------------------------------------------------------- 树：海岸四种（小树林成团，不是均匀撒）
export type CoastTreeKind = 'pine' | 'oak' | 'tamarisk' | 'snag';
export interface CoastTreeSpot { x: number; z: number; kind: CoastTreeKind; h: number; ry: number; v: number }
/** 林团中心（后滩 / 营地北侧 / 西岸礁湾背后 / 南端玄武岩背后 / 东岸码头背后），每团主树种 */
export const GROVES: [number, number, number, CoastTreeKind][] = [
  [-26, 74, 16, 'pine'], [28, 76, 15, 'pine'], [-52, 56, 14, 'oak'], [48, 52, 13, 'oak'], [-18, 104, 16, 'pine'], [24, 108, 14, 'oak'],
  [-70, 84, 12, 'tamarisk'], [60, 92, 12, 'tamarisk'], [-62, 36, 10, 'snag'], [36, 36, 10, 'tamarisk'],
  [-30, -104, 12, 'pine'], [22, -106, 10, 'snag'], [-56, -78, 10, 'tamarisk'], [66, 30, 10, 'snag'], [-80, 60, 10, 'pine'],
];
export function coastTreeSpots(scale = 1, G?: (x: number, z: number) => number): CoastTreeSpot[] {
  const R = rngC(907), out: CoastTreeSpot[] = [];
  const kinds: CoastTreeKind[] = ['pine', 'oak', 'tamarisk', 'snag'];
  for (const [gx, gz, gr, main] of GROVES) {
    const want = Math.max(1, Math.round((gr * gr) / 30 * scale));
    for (let a = 0, n = 0; a < want * 14 && n < want; a++) {
      const ang = R() * 6.28, rr = Math.sqrt(R()) * gr, x = gx + Math.cos(ang) * rr, z = gz + Math.sin(ang) * rr;
      if (shoreD(x, z) > -12 || floodD(x, z) < 4 || !floraFree(x, z, 2.5, G)) continue;
      if (out.some(o => Math.hypot(o.x - x, o.z - z) < (o.kind === 'tamarisk' ? 3.2 : 4.6))) continue;
      const kind = R() < 0.72 ? main : kinds[Math.floor(R() * 4)];
      const h = kind === 'pine' ? 7 + R() * 4 : kind === 'oak' ? 6.5 + R() * 3 : kind === 'tamarisk' ? 2.6 + R() * 1.6 : 4.5 + R() * 2.5;
      out.push({ x, z, kind, h, ry: R() * 6.28, v: Math.floor(R() * 3) }); n++;
    }
  }
  return out;
}
/** 灌木丛（低矮成团，林团边缘和草甸里） */
export function coastShrubSpots(n: number, G?: (x: number, z: number) => number): [number, number, number][] {
  const R = rngC(433), out: [number, number, number][] = [];
  for (let a = 0; a < n * 40 && out.length < n; a++) {
    const x = (R() * 2 - 1) * COAST_HALF, z = (R() * 2 - 1) * COAST_HALF;
    if (meadowW(x, z) < 0.55 || fbmC(x * 0.06 + 9, z * 0.06) < 0.5 || !floraFree(x, z, 1.2, G)) continue;
    if (out.some(o => Math.hypot(o[0] - x, o[1] - z) < 2.4)) continue;
    out.push([x, z, R()]);
  }
  return out;
}

const hash2 = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
/** makeGrassHD / makeFlowersHD 的 accept：草甸按权重概率接受（边缘渐稀、中心成片） */
export const meadowOk = (x: number, z: number, G?: (x: number, z: number) => number) => { const w = meadowW(x, z); return w > 0.02 && hash2(x, z) < w * 1.15 && floraFree(x, z, 0, G); };
/** 沙丘带枯草丛（离水线 9–34 米，草甸外沿，斑块） */
export const duneOk = (x: number, z: number, G?: (x: number, z: number) => number) => { const d = shoreD(x, z); return d < -9 && d > -34 && fbmC(x * 0.05 + 1, z * 0.05 + 4) > 0.46 && floodD(x, z) > 1 && floraFree(x, z, 0, G); };
export const reedOk = (x: number, z: number, G?: (x: number, z: number) => number) => reedW(x, z) > 0 && floraFree(x, z, 0, G);
