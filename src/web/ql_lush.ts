// ======================================================================
// 11-19 花草繁茂 qllush（Rhett 11-19 01:54「花草繁茂」+ 秋林逆光 Demo 截图：密到看不见土的高草，满铺黄五瓣小花、紫穗、红罂粟）
//   秋林逆光 Demo（r8 源码 src.html「花丛」段）花的原画法移植：
//   · 花图集 256×64 canvas（纯白茎 / 单片花瓣 / 五瓣小花 / 花心圆盘），Demo flowerTex 原样；
//   · 四种花头真实几何（Demo flowerGeo 原样）：紫色花穗（14 朵四瓣小花下大上小 + 顶端花苞）、黄色五瓣小花簇（3 茎 28 朵）、
//     红罂粟（5 片杯状大花瓣 + 4 片内瓣 + 深色花心）、白雏菊（11 瓣 + 黄心）；
//   · 分布掩码 = Demo scatterFlowers 的 fbm 场（4 倍频 fbm，紫 0.07 / 黄 0.06 / 红 0.1 / 白 0.09 频率与阈值照搬）。
//   与 Demo 的差别（只为进游戏）：Demo 只铺镜头周围 60 米；游戏整图按面积铺（每平方米密度 = Demo 高档平均密度 × 各区倍率），
//   40 米分块实例化 + 距离淡出（field_flora.ts 管）；各区花种 / 配色不同（星落蓝紫穗、腐沼品红穗、营地 / 山麓黄白为主）；
//   远处低模（花穗 7 朵、黄簇 14 朵）。颜色走 three r170 色彩管理（Color(hex) 即线性，不再像 Demo r149 那样手动 lin）。
//   本文件只出几何 / 贴图 / 掩码；材质、风、分块、避让在 field_flora.ts（lushFlowerLayer），各区配方在 field_flora_maps.ts。?off=qllush 关。
// ======================================================================
import * as THREE from 'three';

/** ?off=qllush（或 localStorage darkrock_cine_off 含 qllush）→ 关（草花回 C21 原样） */
let _off: boolean | null = null;
export function qlLushOn(): boolean {
  if (_off === null) {
    _off = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      _off = `${q},${ls}`.split(',').map(x => x.trim()).includes('qllush');
    } catch { _off = false; }
  }
  return !_off;
}

// ---------------------------------------------------------------- Demo 噪声（vn / fbm 4 倍频 / sstep，原式）
function hash(x: number, y: number) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function qlFbm(x: number, y: number, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; } return s / n; }
export const qlSstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function lcg(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------------------------------------------------------------- 花图集（Demo flowerTex 原样）
let _tex: THREE.CanvasTexture | null | undefined;
export function qlFlowerTex(): THREE.CanvasTexture | null {
  if (_tex !== undefined) return _tex;
  if (typeof document === 'undefined') return (_tex = null);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); if (!x) return (_tex = null);
  const rnd = lcg(6161), rr = (a: number, b: number) => a + (b - a) * rnd();
  x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64);   // [0] 纯白（茎）
  x.save(); x.translate(96, 62); x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-24, -14, -22, -50, -6, -60); x.quadraticCurveTo(0, -56, 6, -60); x.bezierCurveTo(22, -50, 24, -14, 0, 0);   // [1] 单片花瓣，基部在下
  const g = x.createLinearGradient(0, 0, 0, -60); g.addColorStop(0, '#c8c8c8'); g.addColorStop(0.35, '#fff'); g.addColorStop(1, '#f4f4f4'); x.fillStyle = g; x.fill();
  x.strokeStyle = 'rgba(150,150,150,0.5)'; x.lineWidth = 1; for (const k of [-8, 0, 8]) { x.beginPath(); x.moveTo(0, -2); x.quadraticCurveTo(k * 0.6, -30, k, -52); x.stroke(); } x.restore();
  x.save(); x.translate(160, 32); for (let i = 0; i < 5; i++) { x.save(); x.rotate(i / 5 * Math.PI * 2); x.beginPath(); x.ellipse(0, -14, 8.5, 14, 0, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.restore(); }   // [2] 五瓣小花
  x.beginPath(); x.arc(0, 0, 6, 0, Math.PI * 2); x.fillStyle = '#e8d890'; x.fill(); x.restore();
  x.save(); x.translate(224, 32); x.beginPath(); x.arc(0, 0, 28, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();   // [3] 花心圆盘
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(90,60,0,${rr(0.1, 0.4)})`; const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 24; x.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3); } x.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_tex = t);
}

// ---------------------------------------------------------------- 几何（Demo GB / addQuad / petalHead / flowerGeo）
interface GB { pos: number[]; nrm: number[]; col: number[]; uv: number[]; idx: number[] }
const UVS = [0.08, 0.2, 0.17, 0.8], UVP = [0.25, 0.0, 0.5, 1.0], UVF = [0.508, 0.02, 0.742, 0.98], UVD = [0.758, 0.04, 0.992, 0.96];
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
function addQuad(B: GB, c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, uv: number[], col: THREE.Color, nrm: THREE.Vector3) {
  const base = B.pos.length / 3, P = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], UV = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  for (let i = 0; i < 4; i++) { const [s, t] = P[i]; B.pos.push(c.x + ax.x * s + ay.x * t, c.y + ax.y * s + ay.y * t, c.z + ax.z * s + ay.z * t); B.nrm.push(nrm.x, nrm.y, nrm.z); B.col.push(col.r, col.g, col.b); B.uv.push(UV[i][0], UV[i][1]); }
  B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function petalHead(B: GB, rr: (a: number, b: number) => number, c: THREE.Vector3, axis: THREE.Vector3, n: number, len: number, wid: number, cup: number, col: THREE.Color, rot: number) {
  const ax = axis.clone().normalize(), t1 = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) < 0.9 ? UP : XA).normalize(), t2 = new THREE.Vector3().crossVectors(ax, t1);
  for (let k = 0; k < n; k++) {
    const a = rot + k / n * 6.2832 + rr(-0.15, 0.15), rd = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
    const cu = cup + rr(-0.15, 0.15), dir = rd.clone().multiplyScalar(Math.cos(cu)).addScaledVector(ax, Math.sin(cu)), tg = new THREE.Vector3().crossVectors(ax, rd).normalize();
    const nm = new THREE.Vector3().crossVectors(tg, dir).normalize(); if (nm.dot(ax) < 0) nm.negate();
    const cc = col.clone().multiplyScalar(rr(0.85, 1.1));
    addQuad(B, c.clone().addScaledVector(dir, len * 0.5), tg.multiplyScalar(wid), dir.clone().multiplyScalar(len), UVP, cc, nm.lerp(ax, 0.4).normalize());
  }
}
export type QlFlower = 'purple' | 'yellow' | 'red' | 'white';
/** 配色：Demo 原色 + 各区变体（同画法，只换色） */
export interface QlPal { petals: string[]; tip?: string; bud?: string; core?: string }
export const QL_PAL: Record<string, QlPal> = {
  purple: { petals: ['#9a58dc', '#b07ee8', '#8444cc', '#c69af2'], tip: '#e0c8f4', bud: '#7a3cb8' },   // Demo 紫穗（薰衣草 / 鼠尾草状）
  blue: { petals: ['#5a6ee0', '#7a8ef0', '#4a5cd0', '#9aaaf6'], tip: '#d4dcf8', bud: '#3a48b0' },     // 星落：蓝紫穗（高山鲁冰花色）
  magenta: { petals: ['#c04aa8', '#d06cbc', '#a83a92', '#e094d2'], tip: '#f0d0ea', bud: '#8a2a78' },  // 腐沼：品红穗（千屈菜色）
  yellow: { petals: ['#ffc417', '#ffd84a', '#f0a810'] },                                               // Demo 黄五瓣小花
  gold: { petals: ['#f2a412', '#ffbe2a', '#e08a0c'] },                                                 // 秋金（偏橙）
  red: { petals: ['#d8160a', '#e8301a'], core: '#2a1408' },                                            // Demo 红罂粟
  orange: { petals: ['#e8581a', '#f07a2a'], core: '#2a1408' },                                         // 营地：橙罂粟
  white: { petals: ['#fbf8f0'], core: '#f0b818' },                                                     // Demo 白雏菊
};
const C = (h: string) => new THREE.Color(h);
/** Demo flowerGeo（高约 1，茎底 y = 0）；lo = 远处低模（花穗 7 朵、黄簇 14 朵加大，外形 / 颜色不变） */
export function qlFlowerGeo(kind: QlFlower, palKey: string, seed: number, lo = false): THREE.BufferGeometry {
  const B: GB = { pos: [], nrm: [], col: [], uv: [], idx: [] }, rnd = lcg(seed), rr = (a: number, b: number) => a + (b - a) * rnd();
  const P = QL_PAL[palKey] ?? QL_PAL[kind], stem = C('#3b5a1c'), nz = new THREE.Vector3(0, 0.3, 1).normalize();
  const stemQ = (h: number, ox: number, oz: number) => {
    addQuad(B, new THREE.Vector3(ox, h / 2, oz), new THREE.Vector3(0.018, 0, 0), new THREE.Vector3(0, h, 0), UVS, stem, nz);
    addQuad(B, new THREE.Vector3(ox, h / 2, oz), new THREE.Vector3(0, 0, 0.018), new THREE.Vector3(0, h, 0), UVS, stem, new THREE.Vector3(1, 0.3, 0).normalize());
  };
  if (kind === 'purple') {   // 紫色花穗：一串四瓣小花，下大上小，顶端花苞
    stemQ(1, 0, 0); const pal = P.petals.map(C), tip = C(P.tip ?? '#e0c8f4'), n = lo ? 7 : 14, k = lo ? 1.3 : 1;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = 0.44 + 0.52 * t, a = i * 2.4 * (lo ? 2 : 1), r = 0.03 * (1 - 0.5 * t), c = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const axis = new THREE.Vector3(Math.cos(a), 0.75, Math.sin(a)), L = 0.06 * (1 - 0.45 * t) * k;
      petalHead(B, rr, c, axis, 4, L, L * 0.8, 0.35, pal[i % pal.length].clone().lerp(tip, t * 0.35), a);
    }
    addQuad(B, new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(0.025, 0, 0), new THREE.Vector3(0, 0.06, 0), UVP, C(P.bud ?? '#7a3cb8'), nz);
  } else if (kind === 'yellow') {   // 黄色五瓣小花簇：三茎 + 28 朵
    for (let s = 0; s < 3; s++) stemQ(0.85, (s - 1) * 0.05, s * 0.03);
    const pal = P.petals.map(C), n = lo ? 14 : 28, sz = lo ? 0.1 : 0.08;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.2, y = 0.78 + 0.16 * (1 - r / 0.2) + rr(-0.03, 0.03), c = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const ax = new THREE.Vector3(rr(-1, 1), rr(-0.2, 0.2), rr(-1, 1)).normalize().multiplyScalar(sz);
      const ay = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(rr(-0.3, 0.3), 1, rr(-0.3, 0.3))).normalize().multiplyScalar(sz);
      addQuad(B, c, ax, ay, UVF, pal[i % pal.length], UP);
    }
  } else if (kind === 'red') {   // 红罂粟：五片杯状大花瓣 + 四片内瓣 + 深色花心
    stemQ(1, 0, 0); const hc = new THREE.Vector3(0.02, 1, 0), ax = new THREE.Vector3(0.15, 1, 0.05);
    petalHead(B, rr, hc, ax, 5, 0.2, 0.19, 0.62, C(P.petals[0]), rnd() * 6);
    petalHead(B, rr, hc.clone().add(new THREE.Vector3(0, 0.01, 0)), ax, 4, 0.15, 0.15, 0.9, C(P.petals[1] ?? P.petals[0]), rnd() * 6);
    addQuad(B, hc.clone().add(new THREE.Vector3(0, 0.035, 0)), new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(0, 0, 0.06), UVD, C(P.core ?? '#2a1408'), UP);
  } else {   // 白雏菊：十一瓣 + 黄心
    stemQ(1, 0, 0); const hc = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(0.2, 1, 0.1);
    petalHead(B, rr, hc, ax, lo ? 7 : 11, 0.13, lo ? 0.07 : 0.05, 0.12, C(P.petals[0]), rnd() * 6);
    addQuad(B, hc.clone().add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(0.075, 0, 0), new THREE.Vector3(0, 0, 0.075), UVD, C(P.core ?? '#f0b818'), UP);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  g.setIndex(B.idx); g.computeBoundingSphere(); return g;
}

/** Demo scatterFlowers 的分布场（0..1，按 o 偏移让各区花海不同位）；purple 不含 Demo 的「路边紫花带」（游戏路网另算，见 field_flora lushFlowerLayer） */
export function qlFlowerField(kind: QlFlower, x: number, z: number, o: number): number {
  switch (kind) {
    case 'purple': return qlSstep(0.6, 0.72, qlFbm(x * 0.07 + 3 + o, z * 0.07 + 1));
    case 'yellow': return qlSstep(0.56, 0.64, qlFbm(x * 0.06 + 11 + o, z * 0.06 + 4));
    case 'red': return 0.6 * qlSstep(0.45, 0.6, qlFbm(x * 0.1 + 21 + o, z * 0.1));
    default: return 0.8 * qlSstep(0.5, 0.62, qlFbm(x * 0.09 + 31 + o, z * 0.09 + 8));
  }
}
/** Demo 各花高度范围（实例统一缩放） */
export const QL_FLOWER_H: Record<QlFlower, [number, number]> = { purple: [0.45, 0.8], yellow: [0.6, 1.0], red: [0.55, 0.8], white: [0.38, 0.58] };
/** Demo 高档平均密度（株 / 平方米）：5200 / 6500 / 1700 / 2600 株铺在 60 米 × 1.1 椭圆（≈12440 m²）里 */
export const QL_FLOWER_DENS: Record<QlFlower, number> = { purple: 5200 / 12440, yellow: 6500 / 12440, red: 1700 / 12440, white: 2600 / 12440 };
/** Demo 花三角数（高模 / 低模），估算用 */
export function qlFlowerTris(g: THREE.BufferGeometry) { return (g.index?.count ?? 0) / 3; }

/** 各区繁茂配方（field_flora_maps.ts 填，field_flora.ts 用） */
export interface LushOpt {
  /** 近层繁茂草：簇 / 平方米（高档；每簇 12–16 根，Demo 近草约 74 根 / m²） */
  grass: number;
  /** 草高范围（米，乘 Demo 的 tall 场 0.45–1.2） */
  h: [number, number];
  /** 干旱度（同 GrassLayer.dry） */
  dry: number;
  /** 花：[种类, 配色键, 密度倍率（× Demo 高档平均密度）] */
  flowers: [QlFlower, string, number][];
  /** 原有野花（雏菊 / 紫菀 / 毛茛…）保留比例（默认 0.6，Demo 花顶替一部分以压实例数） */
  oldFlowerK?: number;
  /** 原草层数量倍率（默认 1） */
  oldGrassK?: number;
  /** 额外权重（世界坐标，乘在草权重上；如营地内圈不铺） */
  w?: (x: number, z: number) => number;
  seed: number;
}
