// ======================================================================
// DLC1 镜渊城 · 地形（第五轮）：纯函数，本体在建高度图 / 地形 / 寻路时就会调用（早于造景，不依赖 canvas / THREE）
//   1. 宏观起伏：低频缓坡 + 沙堆 + 积水洼地 + 平台外缘浅海
//   2. 深水湖（B3 镜湖）：带噪声的椭圆，浅滩架 → 陡降到 −2 米；湖里不可走（solidAt），弯曲石堤桥穿过
//   3. 石板：每格 1 米、格心在整数坐标（高度图 1 米采样正好落在格心），四角共享抖动 → 不规则四边形；
//      每块随机：紧贴 / 挤裂 / 缺失 / 下沉 / 翘起，每条缝宽度单独随机
//   局部坐标（相对镜渊城原点），所有随机都是确定性哈希
// ======================================================================
export const SEA_HALF = 86;
export const SEA_WATER_Y = 0.045;
const CAMP = { x: 0, z: 58 };
/** 月亮方向（第五轮：升高到 50°，从穹顶破口透下来；水面倒影亮斑 / 穹顶破口 / 光柱共用） */
export const SEA_MOON: [number, number, number] = [0.447, 0.766, 0.462];

// ---------------------------------------------------------------- 噪声 / 哈希
const fr = (v: number) => v - Math.floor(v);
const hh = (x: number, y: number) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
export const h3 = (i: number, j: number, k: number) => fr(Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453);
function vn(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hh(i, j), b = hh(i + 1, j), c = hh(i, j + 1), d = hh(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ell = (x: number, z: number, cx: number, cz: number, rx: number, rz: number, a: number) => {
  const dx = x - cx, dz = z - cz, c = Math.cos(a), s = Math.sin(a), u = (dx * c + dz * s) / rx, w = (-dx * s + dz * c) / rz; return Math.sqrt(u * u + w * w);
};

/** 深水湖（B3 镜湖）椭圆参数 */
export const LAKE = { x: 58, z: 44, rx: 24, rz: 28, a: 0.15, R: 26 };

// ---------------------------------------------------------------- 区域表（seabed.ts 遮罩 / 造景共用）
/** 浅水域（椭圆 [x, z, rx, rz, 旋转]）—— 第五轮：去掉被深水湖覆盖的 58,44 */
export const SEA_WATER: [number, number, number, number, number][] = [
  [40, -33, 15, 8.5, 0.35], [31, -38, 9, 5.5, -0.2], [49, -25, 8, 6, 0.6], [45, -41, 10, 5, 0.1], [36, -27, 7, 4, 0.9],
  [22, 76, 11, 7, 0.2], [13, 81, 7, 4, -0.3], [-20, 76, 10, 6, -0.25], [-28, 70, 6, 4, 0.5],
  [-58, 8, 8, 5, 0.8], [-12, -58, 9, 5, -0.4],
];
/** 沙地 / 沙堆 [x, z, rx, rz, 旋转, 堆高] */
export const SEA_SAND: [number, number, number, number, number, number][] = [
  [17, -44, 2.6, 1.6, 0.4, 0.12], [26, -43.5, 3, 1.4, 1.9, 0.1], [36, -25, 2.5, 1.5, 2.2, 0.1], [49, -39, 3, 2, 0.7, 0.14], [10, -36, 2, 1.5, 2.8, 0.1], [24, -40, 8, 5, 1.1, 0.2],
  [56, -36, 6, 7, 0.3, 0.18], [32, 70, 7, 5, 2.4, 0.16], [-30, 80, 9, 4, 0.9, 0.12], [-50, -60, 12, 8, 1.7, 0.24], [-66, 2, 7, 9, 2.6, 0.2], [14, -64, 8, 5, 0.2, 0.16], [-24, -58, 6, 4, 1.3, 0.14],
  // 第五轮：零散沙堆 / 浅沙滩（湖岸、积水边）
  [30, 30, 3.5, 2.2, 0.6, 0.2], [27, 54, 4, 2.4, 2.0, 0.16], [-40, 30, 3, 2, 1.0, 0.22], [-18, -30, 2.6, 1.8, 0.3, 0.18], [8, -20, 2.2, 1.6, 2.5, 0.15],
  [-60, -36, 4, 3, 1.5, 0.22], [64, -60, 4.5, 3, 0.8, 0.2], [-34, 52, 2.8, 2, 2.9, 0.16], [44, 10, 3.2, 2.2, 1.2, 0.18], [-8, -78, 4, 2.5, 0.1, 0.18],
];
/** 积水坑（确定性生成，替代第四轮 buildMask 里的随机）[x, z, rx, rz, 旋转, 强度] */
export const SEA_PUDDLES: [number, number, number, number, number, number][] = (() => {
  const out: [number, number, number, number, number, number][] = []; let s = 991; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90 && out.length < 70; i++) {
    const x = (r() - 0.5) * 160, z = (r() - 0.5) * 160, rr = 0.5 + r() * r() * 2.6, k = (170 + r() * 85) / 255, ex = 1 + r(), a = r() * 3;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 6 || lakeSd(x, z) < 3 || Math.abs(x) < 3.5) continue;
    out.push([x, z, rr * ex, rr, a, k]);
  }
  return out;
})();
/** 发光水潭 / 符文坑 [x, z, r, 0 = 水潭 / 1 = 符文坑]（石板绕开） */
export const SEA_GLOW: [number, number, number, number][] = [
  [9, -31, 1.5, 0], [-14, 46, 1.3, 0], [-38, -14, 1.5, 1], [36, 24, 1.4, 0], [-56, -30, 1.6, 1], [-6, -66, 1.2, 0],
  [32, 62, 1.2, 0], [-40, 72, 1.4, 1], [20, -46, 1.1, 0], [-22, -4, 1.2, 0], [8, 70, 1.0, 0], [58, -32, 1.3, 1], [-62, 46, 1.3, 0],
];
/** 鹅卵石区域（plaza_dress 地面遮罩共用）：折线 + 半宽；圆 [x, z, r] */
export const SEA_COBBLE_LINES: { pts: [number, number][]; w: number }[] = [
  { pts: [[0, 86], [0, 50], [0, 10], [0, -40], [0, -70]], w: 2.6 },
  { pts: [[0, 12], [-24, 6], [-46, 0]], w: 1.9 }, { pts: [[0, 0], [24, -6], [46, -10], [56, -12]], w: 1.9 },
  { pts: [[0, 30], [26, 36]], w: 1.6 }, { pts: [[-46, 0], [-36, -42]], w: 1.6 },
];
export const SEA_COBBLE_DISCS: [number, number, number][] = [[0, 58, 12.5], [0, 22, 7], [50, -11, 9], [0, -50, 7]];

// ---------------------------------------------------------------- 深水湖 + 石堤桥
/** 湖岸有符号距离（米，近似；湖内为负）。GLSL 版见 LAKE_GLSL，两边公式一致 */
export function lakeSd(x: number, z: number): number {
  const dx = x - LAKE.x, dz = z - LAKE.z, c = Math.cos(LAKE.a), s = Math.sin(LAKE.a);
  const u = (dx * c + dz * s) / LAKE.rx, w = (-dx * s + dz * c) / LAKE.rz, r = Math.sqrt(u * u + w * w), an = Math.atan2(w, u);
  const k = 1 + 0.06 * Math.sin(3 * an + 1.3) + 0.04 * Math.sin(7 * an + 0.4) + 0.025 * Math.sin(13 * an + 2.1);
  return (r - k) * LAKE.R;
}
export const LAKE_GLSL = `
float seaLakeSd(vec2 p){ vec2 d = p - vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)}); float c = ${Math.cos(LAKE.a).toFixed(6)}, s = ${Math.sin(LAKE.a).toFixed(6)};
  float u = (d.x * c + d.y * s) / ${LAKE.rx.toFixed(1)}, w = (-d.x * s + d.y * c) / ${LAKE.rz.toFixed(1)}; float r = sqrt(u * u + w * w), an = atan(w, u);
  float k = 1.0 + 0.06 * sin(3.0 * an + 1.3) + 0.04 * sin(7.0 * an + 0.4) + 0.025 * sin(13.0 * an + 2.1);
  return (r - k) * ${LAKE.R.toFixed(1)}; }`;
/** 石堤桥中线控制点（西岸营地东侧 → 弯向南岸钟楼区） */
const BRIDGE_CTRL: [number, number][] = [[29.5, 46.5], [34, 46.2], [40, 45], [46.5, 41.5], [51.5, 35.5], [54.5, 28.5], [57, 21.5], [59, 15.5], [60.5, 11]];
export const BRIDGE_HW = 1.35;    // 桥面半宽（视觉）
export const BRIDGE_WALK = 1.05;  // 可走半宽
/** 中线折线（Catmull-Rom，每 0.5 米一点）+ 累计弧长 */
export const BRIDGE_PATH: { x: number; z: number; s: number }[] = (() => {
  const P = BRIDGE_CTRL, out: { x: number; z: number; s: number }[] = []; let L = 0, px = P[0][0], pz = P[0][1];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5);
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const x = f(p0[0], p1[0], p2[0], p3[0]), z = f(p0[1], p1[1], p2[1], p3[1]); L += Math.hypot(x - px, z - pz); px = x; pz = z; out.push({ x, z, s: L });
    }
  }
  return out;
})();
export const BRIDGE_LEN = BRIDGE_PATH[BRIDGE_PATH.length - 1].s;
const BB = BRIDGE_PATH.reduce((b, p) => [Math.min(b[0], p.x), Math.max(b[1], p.x), Math.min(b[2], p.z), Math.max(b[3], p.z)], [1e9, -1e9, 1e9, -1e9]);
/** 到桥中线的距离 + 弧长 */
export function bridgeAt(x: number, z: number): { d: number; s: number } {
  if (x < BB[0] - 4 || x > BB[1] + 4 || z < BB[2] - 4 || z > BB[3] + 4) return { d: 99, s: 0 };
  let best = 99, bs = 0; const P = BRIDGE_PATH;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; bs = a.s + (b.s - a.s) * t; }
  }
  return { d: best, s: bs };
}
/** 桥面高度（低矮：水面上约 0.2 米，两端顺坡接地） */
export function deckY(s: number): number {
  const e = Math.min(s, BRIDGE_LEN - s);
  return 0.12 + 0.26 * ss(0, 6, e) + 0.03 * Math.sin(s * 0.55);   // 第五轮 r2：桥面抬到水面上约 0.35 米，侧墙露出来
}

// ---------------------------------------------------------------- 宏观起伏
function cobbleD(x: number, z: number): number {   // 到鹅卵石区边缘的距离（负 = 在里面）
  let d = 1e9;
  for (const L of SEA_COBBLE_LINES) for (let i = 0; i < L.pts.length - 1; i++) {
    const a = L.pts[i], b = L.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - L.w);
  }
  for (const [cx, cz, r] of SEA_COBBLE_DISCS) d = Math.min(d, Math.hypot(x - cx, z - cz) - r);
  return d;
}
// 空间分桶（10 米一格）：每个点只查附近的椭圆
type Ell = { cx: number; cz: number; rx: number; rz: number; c: number; s: number; k: number; kind: number };
const BK = 10, BN = 10, bucket: number[][] = Array.from({ length: (BN * 2) * (BN * 2) }, () => []), ells: Ell[] = [];
function addEll(cx: number, cz: number, rx: number, rz: number, a: number, k: number, kind: number, pad: number) {
  const id = ells.length; ells.push({ cx, cz, rx, rz, c: Math.cos(a), s: Math.sin(a), k, kind }); const R = Math.max(rx, rz) * pad + 1;
  for (let bx = Math.floor((cx - R) / BK); bx <= Math.floor((cx + R) / BK); bx++) for (let bz = Math.floor((cz - R) / BK); bz <= Math.floor((cz + R) / BK); bz++) {
    if (bx < -BN || bz < -BN || bx >= BN || bz >= BN) continue; bucket[(bz + BN) * BN * 2 + bx + BN].push(id); }
}
let ellReady = false;
function ellInit() {
  ellReady = true;
  for (const [x, z, rx, rz, a, k] of SEA_SAND) addEll(x, z, rx, rz, a, k, 0, 1.15);
  for (const [x, z, rx, rz, a] of SEA_WATER) addEll(x, z, rx, rz, a, 1, 1, 1.15);
  for (const [x, z, rx, rz, a, k] of SEA_PUDDLES) addEll(x, z, rx, rz, a, k, 2, 1.2);
}
const near = (x: number, z: number) => { if (!ellReady) ellInit(); const bx = Math.floor(x / BK), bz = Math.floor(z / BK); return bx < -BN || bz < -BN || bx >= BN || bz >= BN ? null : bucket[(bz + BN) * BN * 2 + bx + BN]; };
const eN = (e: Ell, x: number, z: number) => { const dx = x - e.cx, dz = z - e.cz, u = (dx * e.c + dz * e.s) / e.rx, w = (-dx * e.s + dz * e.c) / e.rz; return Math.sqrt(u * u + w * w); };
/** 沙堆高度 */
export function sandH(x: number, z: number): number {
  const L = near(x, z); if (!L) return 0; let h = 0;
  for (let i = 0; i < L.length; i++) { const e = ells[L[i]]; if (e.kind !== 0) continue; let n = eN(e, x, z); if (n > 1.12) continue;
    n *= 1 + 0.12 * (vn(x * 0.9 + e.cx, z * 0.9) - 0.5); if (n < 1) { const q = 1 - n * n; h = Math.max(h, e.k * q * q * (0.85 + 0.3 * vn(x * 1.7, z * 1.7 + e.cz))); } }
  return h;
}
/** 浅水覆盖（0..1）：与 seabed.ts 遮罩 R 通道同一套形状 */
export function waterW(x: number, z: number): number {
  let w = ss(77.5, 81.5, Math.max(Math.abs(x), Math.abs(z)));
  const L = near(x, z); if (!L) return w;
  for (let i = 0; i < L.length; i++) { const e = ells[L[i]]; if (e.kind === 0) continue; const n = eN(e, x, z);
    w = Math.max(w, e.kind === 1 ? 1 - ss(0.78, 1.12, n) : e.k * (1 - ss(0.6, 1.15, n))); }
  return w;
}
/** 地面基准高度（不含石板、不含桥）：缓坡 + 沙堆 + 积水洼地 + 深水湖 */
export function seaBase(x: number, z: number): number {
  const camp = ss(10, 17, Math.hypot(x - CAMP.x, z - CAMP.z));
  let y = 0.06 + ((vn(x * 0.055 + 3.1, z * 0.055) * 0.6 + vn(x * 0.13, z * 0.13 + 7.7) * 0.3 + vn(x * 0.31 + 1.7, z * 0.31) * 0.1) - 0.5) * 0.22 * camp;
  y += sandH(x, z) - 0.24 * waterW(x, z);
  const sd = lakeSd(x, z);
  if (sd < 2) { const yl = -0.08 - 0.34 * ss(0.5, -3.2, sd) - 1.9 * ss(-2.6, -7.5, sd) + 0.08 * (vn(x * 0.4, z * 0.4) - 0.5); y += (yl - y) * ss(2, -0.6, sd); }
  return y;
}

// ---------------------------------------------------------------- 石板
const SLAB_J = 0.17;
/** 第 (ci, cj) 个角点（格角在半整数处）的抖动位置 */
export function slabCorner(ci: number, cj: number): [number, number] { return [ci + 0.5 + (h3(ci, cj, 1) - 0.5) * 2 * SLAB_J, cj + 0.5 + (h3(ci, cj, 2) - 0.5) * 2 * SLAB_J]; }
/** 缝宽：紧贴 / 普通 / 宽缝（edge：0 = 横缝 (i, j)|(i, j+1)，1 = 竖缝 (i, j)|(i+1, j)） */
export function slabGap(i: number, j: number, e: number): number { const r = h3(i, j, 10 + e); return r < 0.38 ? 0.004 : r < 0.85 ? 0.018 + 0.03 * h3(i, j, 12 + e) : 0.06 + 0.05 * h3(i, j, 14 + e); }
export type Slab = { kind: 0 | 1 | 2 | 3 | 4; e: number; tx: number; tz: number };   // 0 正常 1 缺失 2 下沉 3 翘起 4 挤裂
export function slabInfo(i: number, j: number): Slab {
  const r = h3(i, j, 3), e = 0.035 + (h3(i, j, 4) - 0.5) * 0.03, a = h3(i, j, 5) * 6.283, t = (h3(i, j, 6) - 0.3) * 0.045;
  if (r < 0.035) return { kind: 1, e: 0, tx: 0, tz: 0 };
  if (r < 0.095) return { kind: 2, e: -0.03, tx: Math.cos(a) * t * 0.5, tz: Math.sin(a) * t * 0.5 };
  if (r < 0.145) { const k = 0.07 + 0.08 * h3(i, j, 7); return { kind: 3, e: e + 0.03, tx: Math.cos(a) * k, tz: Math.sin(a) * k }; }
  return { kind: r < 0.235 ? 4 : 0, e, tx: Math.cos(a) * t, tz: Math.sin(a) * t };
}
/** 这一格铺不铺石板（鹅卵石路 / 营地 / 沙堆埋住 / 深水 / 平台外缘没有） */
const GN = 90, GW = GN * 2 + 1; let regGrid: Uint8Array | null = null;
export function slabRegion(i: number, j: number): boolean {
  if (Math.abs(i) > SEA_HALF - 1.5 || Math.abs(j) > SEA_HALF - 1.5) return false;
  regGrid ??= new Uint8Array(GW * GW);
  const k = (j + GN) * GW + i + GN, v = regGrid[k];
  if (v) return v === 2;
  const r = slabRegion0(i, j); regGrid[k] = r ? 2 : 1; return r;
}
function slabRegion0(i: number, j: number): boolean {
  if (cobbleD(i, j) < 0.35) return false;
  if (sandH(i, j) > 0.06) return false;
  if (lakeSd(i, j) < -3.2) return false;
  if (bridgeAt(i, j).d < BRIDGE_HW + 0.6) return false;
  for (const [x, z, r] of SEA_GLOW) if (Math.hypot(i - x, j - z) < r * 1.2 + 0.7) return false;   // r3：石板铺到石圈脚下（之前留出一大块方形空地）
  return true;
}
/** 行走高度用的石板抬高（按格心；格心在整数坐标 = 本体 1 米高度图采样点） */
function slabWalk(x: number, z: number): number {
  const i = Math.round(x), j = Math.round(z); if (!slabRegion(i, j)) return 0;
  const s = slabInfo(i, j); return s.kind === 1 ? 0 : s.e + 0.03;
}
/** 行走 / 贴地高度（叠加到本体 wildGroundY）：基准 + 石板 + 桥面 */
export function seaGround(x: number, z: number): number {
  if (Math.abs(x) > SEA_HALF + 2 || Math.abs(z) > SEA_HALF + 2) return 0;
  const base = seaBase(x, z), b = bridgeAt(x, z);
  if (b.d < BRIDGE_HW + 0.4) return Math.max(base + 0.03, deckY(b.s) + 0.03);
  return base + slabWalk(x, z);
}
/** 不可走：深水（离岸 1.3 米以外），桥面除外 */
export function seaSolid(x: number, z: number): boolean {
  if (lakeSd(x, z) > -1.3) return false;
  return bridgeAt(x, z).d > BRIDGE_WALK;
}
/** 精确表面高度（含石板倾斜 / 缝 / 缺失；岸线泡沫烘焙用）：返回 null = 在缝里（露出基准地面） */
export function slabTopAt(x: number, z: number): number | null {
  let i = Math.round(x), j = Math.round(z);
  // 按抖动后的边修正所在格
  const edgeX = (ci: number, zz: number) => { const a = slabCorner(ci, Math.floor(zz - 0.5)), b = slabCorner(ci, Math.floor(zz - 0.5) + 1); const t = (zz - a[1]) / ((b[1] - a[1]) || 1); return a[0] + (b[0] - a[0]) * t; };
  const edgeZ = (cj: number, xx: number) => { const a = slabCorner(Math.floor(xx - 0.5), cj), b = slabCorner(Math.floor(xx - 0.5) + 1, cj); const t = (xx - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; };
  const L = edgeX(i - 1, z), R = edgeX(i, z); if (x < L) i--; else if (x > R) i++;
  const B = edgeZ(j - 1, x), T = edgeZ(j, x); if (z < B) j--; else if (z > T) j++;
  if (!slabRegion(i, j)) return null;
  const s = slabInfo(i, j); if (s.kind === 1) return null;
  const dl = x - edgeX(i - 1, z), dr = edgeX(i, z) - x, db = z - edgeZ(j - 1, x), dt = edgeZ(j, x) - z;
  if (dl < slabGap(i - 1, j, 1) / 2 || dr < slabGap(i, j, 1) / 2 || db < slabGap(i, j - 1, 0) / 2 || dt < slabGap(i, j, 0) / 2) return null;
  return seaBase(x, z) + s.e + s.tx * (x - i) + s.tz * (z - j);
}
/** plaza_dress 地面网格的高度：有实体石板时石板区下沉 4.5 厘米（缝 / 缺失格里露出的砂砾），没有时 = 行走高度（格心） */
export function seaFloorY(x: number, z: number, slabs: boolean): number {
  const b = seaBase(x, z), i = Math.round(x), j = Math.round(z);
  if (slabs) return slabRegion(i, j) ? b - 0.045 : b;
  return b + slabWalk(x, z) - 0.01;
}
