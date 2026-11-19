// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 地图升级：布局 / 地形纯函数（本体建高度图 / 地形 / 寻路时就会调用，不依赖 THREE / canvas）
//   三区：A 退潮沉钟浅滩（中部，原有内容原位保留）· B 风暴锈锚码头（东岸）· C 鲸骨礁湾（西岸）
//   东西两侧是海：海岸线 eastCoast / westCoast（局部 x 随 z 起伏），shoreD = 离岸距离（正 = 海里）
//   码头栈桥 / 灯塔礁岛 / 井口石台是海里的可走结构：地面高度 = 甲板高度（groundAdd），其余深水不可走（solidAt）
//   GLSL 版海岸函数（COAST_GLSL）和 JS 版同一组常数，水面 / 地面 shader 共用
// ======================================================================
export const COAST_HALF = 135;
/** 海平面（局部 y） */
export const SEA_Y = -0.6;
/** 栈桥甲板面高度 */
export const DECK_Y = 0.55;

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fr = (v: number) => v - Math.floor(v);
const hh = (x: number, y: number) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function vn(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y); let u = x - i, v = y - j; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hh(i, j), b = hh(i + 1, j), c = hh(i, j + 1), d = hh(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- 三区
export const ZONE_A = { x: 0, z: -14, r: 58, name: '退潮沉钟浅滩' };
export const ZONE_B = { x: 100, z: 8, r: 42, name: '风暴锈锚码头' };
export const ZONE_C = { x: -82, z: -26, r: 42, name: '鲸骨礁湾' };
/** 风暴区权重 0..1（局部坐标）：东岸 x > 60 起渐入，南北两端收掉 */
export function stormW(x: number, z: number): number { return ss(54, 70, x) * ss(-82, -60, z) * (1 - ss(82, 104, z)); }
/** 鲸骨礁湾权重（雾 / 生物荧光 / 环境声） */
export function reefW(x: number, z: number): number { return ss(-48, -64, x) * ss(-96, -76, z) * (1 - ss(40, 62, z)); }
export function zoneAt(x: number, z: number): 'A' | 'B' | 'C' { return stormW(x, z) > 0.5 ? 'B' : reefW(x, z) > 0.5 ? 'C' : 'A'; }

// ---------------------------------------------------------------- 海岸线
export const eastCoast = (z: number) => 88 + 3.5 * Math.sin(z * 0.071 + 0.6) + 2.5 * Math.sin(z * 0.023 + 1.7) - 36 * ss(-48, -108, z) + 44 * ss(84, 124, z);
export const westCoast = (z: number) => -104 + 3.5 * Math.sin(z * 0.063 + 2.1) + 2.5 * Math.sin(z * 0.029) + 22 * ss(-70, -118, z) - 44 * ss(46, 96, z);
/** 离岸距离（米，正 = 海里） */
export const shoreD = (x: number, z: number) => Math.max(x - eastCoast(z), westCoast(z) - x);

// ---------------------------------------------------------------- 海里的可走结构（B 区）
type Seg = { ax: number; az: number; bx: number; bz: number; hw: number };
/** 栈桥：主桥东西向，两条支桥（南：井口石台；北：系泊台） */
export const PIER: Seg[] = [
  { ax: 78, az: 18, bx: 130, bz: 18, hw: 2.4 },
  { ax: 112, az: 18, bx: 112, bz: 3, hw: 1.9 },
  { ax: 98, az: 18, bx: 98, bz: 40, hw: 1.8 },
  { ax: 92, az: 40, bx: 106, bz: 40, hw: 2.6 },
];
/** 井口石台（圆环，中间井口不可走）—— 报告 10-2 潮渊钟井入口 */
export const WELL = { x: 112, z: -5.5, r: 7.4, hole: 4.3 };
/** 灯塔礁岛 + 礁石堤（从岸边走过去） */
export const ISLET = { x: 121, z: -36, r: 10 };
export const JETTY: Seg = { ax: 84, az: -22, bx: 114, bz: -33, hw: 2.2 };
export const LIGHTHOUSE = { x: 124, z: -38, r: 3.6, h: 26 };
/** 灯塔光源（局部，塔顶灯室中心） */
export const BEAM_O = { x: LIGHTHOUSE.x, y: LIGHTHOUSE.h + 1.6, z: LIGHTHOUSE.z };
/** B 区地标（局部坐标）：巨锚 [x, z, 朝向, 尺寸]、挂灯 [x, z, 朝向]、沉船龙骨 [x, z, 朝向, 长]、升降笼吊架 */
export const ANCHORS: [number, number, number, number][] = [[88, 22.6, 0.4, 3.2], [131.5, 18, 1.57, 2.6], [76, 4, -0.7, 2.2]];
export const LANTERNS: [number, number, number][] = [[80, 15.4, 0], [90, 20.6, Math.PI], [100, 15.4, 0], [110, 20.6, Math.PI], [120, 15.4, 0], [129, 20.6, Math.PI],
  [100.1, 30, -Math.PI / 2], [95.9, 38, Math.PI / 2], [114, 9, -Math.PI / 2], [117.2, -1, -Math.PI / 2], [86, -24.5, 0.35], [104, -31.2, 0.35]];
export const KEEL = { x: 129, z: -6, ry: 0.25, len: 24 };
/** 潮渊钟井提示半径 */
export const WELL_HINT_R = 9;
/** A 区：玄武岩柱群 [x, z, 半径, 柱数, 最高]；石堤（断续拱桥，起点 → 终点，伸进东南的海） */
export const BASALT_A: [number, number, number, number, number][] = [[46, -78, 9, 26, 7], [-38, -86, 7, 18, 5.5], [58, -96, 10, 30, 9], [30, -44, 4, 9, 4], [-46, -42, 5, 12, 4.5], [66, -60, 6, 16, 6]];
export const SEAWALL: [number, number, number, number] = [18, -100, 74, -124];
/** C 区：鲸骨脊柱（陆地 → 伸进海里下沉）、骨拱挂钟 [x, z, 朝向, 尺寸]、礁柱群、半沉钟楼 */
export const WHALE: [number, number][] = [[-56, -6], [-70, -18], [-84, -30], [-98, -42], [-112, -52]];
export const BONE_ARCH: [number, number, number, number][] = [[-62, -44, 0.5, 1], [-90, 6, -0.4, 0.9], [-76, -64, 1.1, 0.85], [-60, 20, 0.2, 0.8]];
export const BASALT_C: [number, number, number, number, number][] = [[-100, -18, 6, 14, 14], [-52, -58, 5, 11, 9], [-70, 30, 6, 12, 8], [-118, -70, 7, 14, 18], [-96, 30, 5, 10, 12], [-112, 4, 4, 8, 16]];
export const SUNK_TOWER = { x: -146, z: -112, h: 36, sink: 9 };
/** 新增探索点（不影响第七章原有 spots） */
export const ZONE_SPOTS = {
  cs_dock: { x: 90, z: 18, r: 16, name: '风暴锈锚码头' },
  cs_reef: { x: -78, z: -26, r: 16, name: '鲸骨礁湾' },
};
const segD = (x: number, z: number, s: Seg) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L));
  return { d: Math.hypot(x - s.ax - dx * t, z - s.az - dz * t), t };
};
/** 在栈桥甲板上？返回离边距离（> 0 = 在桥上） */
export function onPier(x: number, z: number): number { let best = -1e9; for (const s of PIER) best = Math.max(best, s.hw - segD(x, z, s).d); return best; }
export function onJetty(x: number, z: number): number { return Math.max(JETTY.hw - segD(x, z, JETTY).d, ISLET.r - Math.hypot(x - ISLET.x, z - ISLET.z)); }
export function onWell(x: number, z: number): number { const r = Math.hypot(x - WELL.x, z - WELL.z); return Math.min(WELL.r - r, r - WELL.hole); }

// ---------------------------------------------------------------- 潮池（A 区常驻小潮池：退潮后留下的青色积水，映天光）[x, z, rx, rz, 旋转]
export const A_POOLS: [number, number, number, number, number][] = [
  [-7, -4, 5.5, 3.2, 0.4], [8, -20, 4.2, 2.6, 1.2], [-13, -22, 3.4, 2.2, 2.1], [14, -2, 3.2, 2.0, 0.2], [3, 8, 2.8, 1.8, 1.7],
  [-22, -8, 2.6, 1.6, 0.9], [22, -30, 3.6, 2.4, 2.6], [-4, -38, 4.4, 2.6, 0.6], [30, -12, 2.6, 1.7, 1.1], [-28, 4, 3.0, 2.0, 2.4],
  [40, -56, 4.0, 2.6, 0.3], [-36, -50, 3.2, 2.2, 1.6],
  // C 区礁湾里的小潮池（荧光点缀边）
  [-70, -12, 3.0, 2.0, 0.5], [-92, -40, 3.6, 2.2, 1.4], [-78, -52, 2.6, 1.8, 2.2], [-64, 12, 2.4, 1.6, 0.8],
];
/** 潮池水面高度（局部 y，地面平地 = 0） */
export const POOL_Y = -0.07;
function ell(x: number, z: number, p: [number, number, number, number, number]) {
  const dx = x - p[0], dz = z - p[1], c = Math.cos(p[4]), s = Math.sin(p[4]);
  const u = (dx * c + dz * s) / p[2], w = (-dx * s + dz * c) / p[3]; return Math.sqrt(u * u + w * w);
}
/** 潮池遮罩 0..1（边缘带噪声） */
export function poolK(x: number, z: number): number {
  let k = 0; for (const p of A_POOLS) { const e = ell(x, z, p) + (vn(x * 0.9 + p[0], z * 0.9) - 0.5) * 0.35; k = Math.max(k, 1 - ss(0.75, 1.05, e)); } return k;
}

// ---------------------------------------------------------------- 地形
const softplus = (x: number, k: number) => k * Math.log(1 + Math.exp(x / k));
/** 海滩剖面：岸上平地 0 → 水线（d = 0）≈ 海平面 → 海里逐渐变深 */
export const beachY = (d: number) => Math.max(-14, -0.1 * softplus(d + 6, 3) - 0.012 * Math.max(0, d) ** 2);
/** 地面微起伏 + 海滩 / 海床 + 潮池洼地；海里的可走结构 = 甲板高度 */
export function coastGround(x: number, z: number): number {
  const pj = onJetty(x, z), pp = onPier(x, z), pw = onWell(x, z);
  if (pp > 0 || pw > 0) {
    const d0 = shoreD(x, z), ramp = ss(-7, -1.5, d0);   // 栈桥起点：从沙滩缓坡升到甲板
    return DECK_Y * ramp + lowGround(x, z, d0) * (1 - ramp);
  }
  if (pj > 0) {
    const d0 = shoreD(x, z), base = lowGround(x, z, d0), top = 0.45 + 0.2 * vn(x * 0.4, z * 0.4) + 0.5 * ss(0, 6, pj) * (Math.hypot(x - ISLET.x, z - ISLET.z) < ISLET.r ? 1 : 0.25);
    return base + (top - base) * ss(0, 1.2, pj) * ss(-7, -1.5, d0);
  }
  return lowGround(x, z, shoreD(x, z));
}
function lowGround(x: number, z: number, d: number): number {
  let y = beachY(d);
  // 宽广的缓起伏（岸上），潮池洼地
  const land = 1 - ss(-10, 0, d);
  y += land * ((vn(x * 0.035 + 7, z * 0.035) - 0.5) * 0.7 + (vn(x * 0.11, z * 0.11 + 3) - 0.5) * 0.18);
  const pk = poolK(x, z); if (pk > 0) y -= pk * 0.42 * land;
  // 本体边缘山崖在海里抵消掉（可走范围外 12 米内本体抬到 6–22 米）
  const H = COAST_HALF, edge = Math.max(Math.abs(x) - (H - 4), Math.abs(z) - (H - 4), 0);
  if (edge > 0) y -= 24 * Math.min(1, edge / 12) * ss(-8, 6, d);
  return y;
}
/** 不可走：深水（离岸 > 2.5 米）、井口；栈桥 / 礁堤 / 井台例外 */
export function coastSolid(x: number, z: number): boolean {
  if (onWell(x, z) > 0) return false;
  if (Math.hypot(x - WELL.x, z - WELL.z) < WELL.hole) return true;
  if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHTHOUSE.r + 0.6) return true;
  if (onPier(x, z) > 0.15 || onJetty(x, z) > 0.15) return false;
  return shoreD(x, z) > 2.5;
}

// ---------------------------------------------------------------- GLSL（与上面同一组常数）
export const COAST_GLSL = `
float csS(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float csEast(float z){ return 88.0 + 3.5 * sin(z * 0.071 + 0.6) + 2.5 * sin(z * 0.023 + 1.7) - 36.0 * csS(-48.0, -108.0, z) + 44.0 * csS(84.0, 124.0, z); }
float csWest(float z){ return -104.0 + 3.5 * sin(z * 0.063 + 2.1) + 2.5 * sin(z * 0.029) + 22.0 * csS(-70.0, -118.0, z) - 44.0 * csS(46.0, 96.0, z); }
float csShore(vec2 p){ return max(p.x - csEast(p.y), csWest(p.y) - p.x); }
float csSegD(vec2 p, vec2 a, vec2 b){ vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t); }
float csPier(vec2 p){ return max(max(2.4 - csSegD(p, vec2(78.0, 18.0), vec2(130.0, 18.0)), 1.9 - csSegD(p, vec2(112.0, 18.0), vec2(112.0, 3.0))),
  max(1.8 - csSegD(p, vec2(98.0, 18.0), vec2(98.0, 40.0)), 2.6 - csSegD(p, vec2(92.0, 40.0), vec2(106.0, 40.0)))); }
float csDeck(vec2 p){ float w = 7.4 - length(p - vec2(112.0, -5.5)); float j = max(2.2 - csSegD(p, vec2(84.0, -22.0), vec2(114.0, -33.0)), 10.0 - length(p - vec2(121.0, -36.0))); return max(max(csPier(p), w), j); }
float csStorm(vec2 p){ return csS(54.0, 70.0, p.x) * csS(-82.0, -60.0, p.y) * (1.0 - csS(82.0, 104.0, p.y)); }
float csReef(vec2 p){ return csS(-48.0, -64.0, p.x) * csS(-96.0, -76.0, p.y) * (1.0 - csS(40.0, 62.0, p.y)); }
`;
