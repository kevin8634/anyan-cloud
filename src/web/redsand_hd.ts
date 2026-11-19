// ======================================================================
// 11-18 赤砂裂谷画面全面升级（概念图 B：狭缝峡谷 / 红砂岩层理崖壁 / 流沙瀑布 / 半埋巨型石像头 / 风化石柱 / 方尖石 / 拱门；
//   参考 A：巨拱、蘑菇石；Rhett 加：精细仙人掌 = 柱状多臂巨人柱 + 仙人球 + 刺梨，带棱 / 刺 / 花）
//   · 砂岩：世界坐标层理（CPU 按世界 xz 噪声扭曲的高度 yy 写进顶点 → 几何台阶与着色色带严格对齐，多块岩石层理连续、不拉伸），
//     分层色带 + 细纹理（按每像素米数淡出，专长第 12 步）+ 层间凹槽 + 沙漠漆竖条 + 朝上积沙 + 导数凹凸（无贴图）
//   · 边缘崖壁 / 远景方山：替换旧 mesa 散布（位置 / 障碍 / 随机序列不变），层理台阶 + 悬挑盖岩
//   · 地标：主路上的巨拱（拱脚让开路）、背景拱、蘑菇石、高耸石柱、刻纹方尖石（赤岩遗迹外圈）、半埋石像头（营地西侧）
//   · 流沙瀑布：崖顶泻下的滚动 UV 条纹带（两层，Lambert 受光 / 吃雾）+ 底部沙雾公告板 + 沙堆
//   · 仙人掌：InstancedMesh（每种变体一次绘制），棱柱几何（棱数 / 棱深真实）+ 着色器刺座 / 刺（按像素尺寸淡出）+ 仙人球几何红刺 + 花 / 果
//   · 布置：路（pathDistV）/ 营地 / 传送门 / 副本门 / 刷怪点 / 怪群 / 精英路线 / 稀有点 / 世界首领场地 / 台地坡道全部让开；碰撞 = 返回圆形障碍由 wild.ts block()
//   画质：超高 / 高 = 全量；中 = 网格减面 + 数量 ×0.7；低 = 数量 ×0.4、无几何刺、少沙雾。?off=rshd（或 localStorage darkrock_cine_off 含 rshd）= 旧版。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality } from './gfx';
import { cinePatch } from './cine';
import type { WildDef } from '../data/zones_wild';
import { WORLD_BOSSES, WB_IDS } from '../data/world_bosses';

export function rsHdOn(): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    if (`${q},${ls}`.split(',').map(s => s.trim()).includes('rshd')) return false;
  } catch { /* 读不到按开 */ }
  return true;
}
export const rsHdHas = (id: string) => id === 'redsand';

export interface RsSpot { lx: number; lz: number; s: number; ry: number }
/** wild.ts 散布时记录下来的旧物件位置（旧模型不再挂，随机序列照常消耗） */
export interface RsRec { edge: RsSpot[]; far: RsSpot[]; cactus: RsSpot[] }
export const newRsRec = (): RsRec => ({ edge: [], far: [], cactus: [] });
export interface RsCtx {
  def: WildDef;
  /** 地面高度（局部坐标） */ gy: (lx: number, lz: number) => number;
  /** 离路距离（局部坐标，pathDistV） */ pd: (lx: number, lz: number) => number;
  /** 起伏坡度（度） */ slope: (lx: number, lz: number) => number;
  /** 坡道上 */ ramp: (lx: number, lz: number) => boolean;
}
export const rsHdStats = { draws: 0, rockTris: 0, cactusTris: 0, cactusInst: 0, fallTris: 0, landmarks: 0 };
/** 地标位置（局部坐标；自查截图 / 传送用） */
export const rsHdPlaced: { kind: string; x: number; z: number }[] = [];

// ---------------------------------------------------------------- 确定性随机 / CPU 噪声
function mkRnd(seed: number) { let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function h1(n: number) { const s = Math.sin(n * 91.3458 + 17.17) * 47453.5453; return s - Math.floor(s); }
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 世界层理坐标：按世界 xz 低频扭曲的高度（与着色器色带同一个量） */
const BAND = 1.7;
const strataY = (x: number, y: number, z: number) => y + (vn(x * 0.045, z * 0.045) - 0.5) * 4 + (vn(x * 0.17 + 7, z * 0.17) - 0.5) * 1.2;
/** 层理台阶：硬层外凸、软层内凹，层与层之间在最后 25% 平滑过渡 */
function ledgeOff(yy: number) {
  const b = yy / BAND, bi = Math.floor(b), bf = b - bi;
  const o0 = (h1(bi) - 0.5) * 0.17, o1 = (h1(bi + 1) - 0.5) * 0.17;
  return lerp(o0, o1, ss(0.72, 1, bf)) - 0.035 * (1 - ss(0, 0.3, bf));
}

// ---------------------------------------------------------------- 通用管状网格（列 / 拱 / 仙人掌共用）
interface Piece { p: number[]; c: number[]; k: number[]; u: number[]; ring: number[] }   // ring = 每个顶点所在环中心（定向自检用）
const newPiece = (): Piece => ({ p: [], c: [], k: [], u: [], ring: [] });
/** 由环生成索引：rings 个环、每环 m 个点（seam = 多一列接缝点不环绕）；cap = 末端扇形盖 */
function tubeGeo(P: Piece, nR: number, m: number, seam: boolean, cap: boolean, attrs: { k: number; u: number } = { k: 2, u: 2 }) {
  const idx: number[] = [], W = seam ? m + 1 : m;
  for (let j = 0; j < nR - 1; j++) for (let i = 0; i < m; i++) {
    const i1 = seam ? i + 1 : (i + 1) % m;
    const a = j * W + i, b = j * W + i1, c = (j + 1) * W + i, d = (j + 1) * W + i1;
    idx.push(a, c, b, b, c, d);
  }
  if (cap) { const C = nR * W, base = (nR - 1) * W; for (let i = 0; i < m; i++) { const i1 = seam ? i + 1 : (i + 1) % m; idx.push(C, base + i1, base + i); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(P.c, 3));
  if (attrs.k) g.setAttribute(attrs.k === 3 ? 'cak' : 'rsk', new THREE.Float32BufferAttribute(P.k, attrs.k));
  if (attrs.u) g.setAttribute('rsUv', new THREE.Float32BufferAttribute(P.u, attrs.u));
  g.setIndex(idx); g.computeVertexNormals();
  // 定向自检：法线应背离环中心，反了就翻绕序（专长第 89 步教训）
  const pp = g.getAttribute('position') as THREE.BufferAttribute, nn = g.getAttribute('normal') as THREE.BufferAttribute;
  let s = 0; for (let v = 0; v < nR * W; v += 3) s += (pp.getX(v) - P.ring[v * 3]) * nn.getX(v) + (pp.getY(v) - P.ring[v * 3 + 1]) * nn.getY(v) + (pp.getZ(v) - P.ring[v * 3 + 2]) * nn.getZ(v);
  if (s < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  if (seam) {   // 接缝两列法线取平均，棱面不出亮线
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let j = 0; j < nR; j++) { const a = j * W, b = j * W + m; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), L = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / L, y / L, z / L); n.setXYZ(b, x / L, y / L, z / L); }
  }
  return g;
}

// ---------------------------------------------------------------- 岩石：列状体（方山 / 石柱 / 蘑菇石 / 方尖石 / 崖壁）
interface ColOpt {
  x: number; z: number; y0: number; h: number; segA: number; segY: number;
  prof: (t: number) => number;
  ex?: number; ez?: number; rot?: number; lean?: [number, number];
  amp?: number; ledge?: number; kind?: number; sq?: number; cap?: number; gC?: number;
  carve?: (t: number, yLocal: number) => number; seam?: boolean; seed?: number;
}
function column(o: ColOpt): THREE.BufferGeometry {
  const P = newPiece(), m = o.segA, seam = !!o.seam, W = seam ? m + 1 : m;
  const ex = o.ex ?? 1, ez = o.ez ?? 1, cr = Math.cos(o.rot ?? 0), sr = Math.sin(o.rot ?? 0), amp = o.amp ?? 0.12, led = o.ledge ?? 1, kind = o.kind ?? 0;
  const gC = o.gC ?? o.y0, sd = (o.seed ?? 0) * 3.7;
  let perim = 0;
  if (o.sq) { const r0 = o.prof(0); for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, b = (i + 1) / m * Math.PI * 2; const f = (q: number) => r0 / Math.pow(Math.pow(Math.abs(Math.cos(q)), o.sq!) + Math.pow(Math.abs(Math.sin(q)), o.sq!), 1 / o.sq!); perim += Math.hypot(Math.cos(b) * f(b) - Math.cos(a) * f(a), Math.sin(b) * f(b) - Math.sin(a) * f(a)); } }
  let topX = 0, topY = 0, topZ = 0, topR = 0;
  for (let j = 0; j <= o.segY; j++) {
    const t = j / o.segY, yL = t * o.h, y = o.y0 + yL, r = o.prof(t);
    const lx = (o.lean?.[0] ?? 0) * Math.pow(t, 1.5), lz = (o.lean?.[1] ?? 0) * Math.pow(t, 1.5);
    const cx = o.x + lx, cz = o.z + lz;
    for (let i = 0; i < W; i++) {
      const a = i / m * Math.PI * 2;
      const k = o.sq ? 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)), o.sq) + Math.pow(Math.abs(Math.sin(a)), o.sq), 1 / o.sq) : 1;
      const dx0 = Math.cos(a) * k * ex * r, dz0 = Math.sin(a) * k * ez * r;
      const dx = dx0 * cr - dz0 * sr, dz = dx0 * sr + dz0 * cr;
      const px = cx + dx, pz = cz + dz;
      const nA = (vn(px * 0.21 + sd + y * 0.09, pz * 0.21 - y * 0.13) - 0.5) * 2 * amp + (vn(px * 0.83 + y * 0.5, pz * 0.83 + sd) - 0.5) * amp * 0.45;
      const yy = strataY(px, y, pz), lo = kind === 0 ? ledgeOff(yy) * led : 0;
      const f = 1 + nA + lo;
      const X = cx + dx * f, Z = cz + dz * f;
      P.p.push(X, y, Z); P.ring.push(cx, y, cz);
      const ao = Math.min(1, Math.max(0.42, 0.74 + lo * 3.2 + nA * 0.8)) * (0.62 + 0.38 * ss(-0.5, 2.2, y - gC));
      P.c.push(ao, ao, ao);
      const cv = o.carve ? o.carve(t, yL) : 0;
      P.k.push(kind, cv);
      P.u.push(o.sq ? (i / m) * perim : a * r, kind === 0 ? yy : yL);
      if (j === o.segY) { topX += X; topZ += Z; topR = Math.max(topR, r); }
    }
    if (j === o.segY) { topX /= W; topZ /= W; topY = y; }
  }
  const capH = o.cap ?? 0;
  P.p.push(topX, topY + capH, topZ); P.ring.push(topX, topY - 1, topZ);
  const aoT = 0.95; P.c.push(aoT, aoT, aoT); P.k.push(kind, 0);
  P.u.push(0, kind === 0 ? strataY(topX, topY + capH, topZ) : o.h + capH);
  void topR;
  return tubeGeo(P, o.segY + 1, m, seam, true);
}

/** 沿曲线扫掠的椭圆截面（拱门） */
function sweep(pts: THREE.Vector3[], ra: (t: number) => number, rb: (t: number) => number, segA: number, side: THREE.Vector3, gC: number, amp = 0.14, kind = 0): THREE.BufferGeometry {
  const P = newPiece(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = side.clone().normalize();
  for (let j = 0; j < pts.length; j++) {
    const t = j / (pts.length - 1);
    T.subVectors(pts[Math.min(pts.length - 1, j + 1)], pts[Math.max(0, j - 1)]).normalize();
    N.crossVectors(B, T).normalize();
    const c = pts[j];
    for (let i = 0; i < segA; i++) {
      const a = i / segA * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let x = c.x + N.x * ca * ra(t) + B.x * sa * rb(t), y = c.y + N.y * ca * ra(t) + B.y * sa * rb(t), z = c.z + N.z * ca * ra(t) + B.z * sa * rb(t);
      const nA = (vn(x * 0.25 + y * 0.11, z * 0.25 - y * 0.07) - 0.5) * 2 * amp + (vn(x * 0.9 + y * 0.4, z * 0.9) - 0.5) * amp * 0.4;
      const yy = strataY(x, y, z), lo = kind === 0 ? ledgeOff(yy) * 0.7 : 0, f = 1 + nA + lo;
      x = c.x + (x - c.x) * f; y = c.y + (y - c.y) * f; z = c.z + (z - c.z) * f;
      P.p.push(x, y, z); P.ring.push(c.x, c.y, c.z);
      const ao = Math.min(1, Math.max(0.42, 0.74 + lo * 3.2 + nA * 0.8)) * (0.62 + 0.38 * ss(-0.5, 2.2, y - gC)) * (0.8 + 0.2 * Math.max(0, N.y * ca));
      P.c.push(ao, ao, ao); P.k.push(kind, 0); P.u.push(a, strataY(x, y, z));
    }
  }
  return tubeGeo(P, pts.length, segA, false, false);
}

/** 半埋巨型石像头：位移球（脸朝 +z），头冠带 + 额饰圆章刻纹 */
function statueHead(R: number, seg: [number, number]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const p = g.getAttribute('position') as THREE.BufferAttribute, n = p.count;
  const col = new Float32Array(n * 3), rsk = new Float32Array(n * 2), uv = new Float32Array(n * 2);
  const G = (d2: number, w: number) => Math.exp(-d2 / w);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const face = ss(0.15, 0.55, z);
    let d = 0, carve = 0;
    // 五官（只在正面）
    const ax = Math.abs(x);
    d += face * 0.17 * G(x * x, 0.006) * ss(0.12, -0.05, -y) * ss(-0.34, -0.18, y);          // 鼻梁
    d += face * 0.07 * G(x * x + (y + 0.24) ** 2, 0.006);                                     // 鼻头
    d -= face * 0.075 * G((ax - 0.3) ** 2 + (y - 0.08) ** 2 * 1.6, 0.018);                     // 眼窝
    d += face * 0.035 * G((ax - 0.3) ** 2 * 0.8 + (y - 0.07) ** 2 * 3, 0.006);                 // 闭合的眼睑
    d -= face * 0.012 * G((y - 0.055 + (ax - 0.3) ** 2 * 0.6) ** 2, 0.00012) * ss(0.45, 0.2, Math.abs(ax - 0.3) + 0.2);   // 眼缝
    d += face * 0.045 * G((y - 0.2) ** 2, 0.0025) * ss(0.55, 0.3, ax);                          // 眉骨
    d += face * 0.04 * G(x * x * 0.35 + (y + 0.4) ** 2, 0.0025);                               // 上唇
    d -= face * 0.02 * G(x * x * 0.3 + (y + 0.44) ** 2 * 6, 0.0012) * ss(0.2, 0.12, ax);        // 唇缝
    d += face * 0.045 * G(x * x * 0.35 + (y + 0.5) ** 2, 0.0025);                              // 下唇
    d += face * 0.07 * G(x * x * 0.6 + (y + 0.68) ** 2, 0.012);                                // 下巴
    d += face * 0.03 * G((ax - 0.42) ** 2 + (y + 0.12) ** 2, 0.02);                            // 颧骨
    d -= 0.06 * ss(0.55, 0.85, ax) * ss(0.3, -0.2, z) * 0;                                      // （侧面占位）
    // 头冠带：y 0.34–0.6 一圈凸起，上下沿线；正面额饰圆章
    const band = ss(0.32, 0.36, y) * (1 - ss(0.58, 0.62, y));
    d += band * 0.085;
    if (band > 0.2) carve = 0.5;
    const em = G(x * x + (y - 0.47) ** 2, 0.006) * face;
    d += em * 0.08; if (em > 0.25) carve = 0.75;
    // 冠顶：平顶略收
    d -= ss(0.7, 0.95, y) * 0.06;
    // 风化：大块缺损 + 小坑
    const wx = x * 3.1 + 11, wy = y * 3.1, wz = z * 3.1;
    d -= Math.max(0, vn(wx + wz * 0.7, wy) - 0.7) * 0.35 + (vn(x * 9 + z * 5, y * 9) - 0.5) * 0.012;
    const k = 1 + d;
    p.setXYZ(i, x * 0.8 * k, y * 1.05 * k, z * 0.92 * k);
    const ao = Math.max(0.45, Math.min(1, 0.82 + d * 2.2 - Math.max(0, -d) * 2));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    rsk[i * 2] = 1; rsk[i * 2 + 1] = carve;
    if (carve > 0.6) { uv[i * 2] = x * R; uv[i * 2 + 1] = (y - 0.47) * R; } else { uv[i * 2] = Math.atan2(x, z) * R; uv[i * 2 + 1] = y * R; }
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rsk', new THREE.BufferAttribute(rsk, 2)); g.setAttribute('rsUv', new THREE.BufferAttribute(uv, 2));
  g.scale(R, R, R); g.computeVertexNormals();
  return g;
}
/** 简单块（碎石 / 沙堆）：位移二十面体，kind 1 石 / 2 沙 */
function blob(R: number, sy: number, kind: number, seed: number, det = 1): THREE.BufferGeometry {
  const g0 = new THREE.IcosahedronGeometry(1, det); g0.deleteAttribute('uv'); g0.deleteAttribute('normal');
  const g = mergeVertices(g0); g0.dispose(); const p = g.getAttribute('position') as THREE.BufferAttribute, n = p.count;
  const col = new Float32Array(n * 3), rsk = new Float32Array(n * 2), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = kind === 2 ? 1 + (vn(x * 2 + seed, z * 2) - 0.5) * 0.25 : 1 + (vn(x * 1.7 + seed, y * 1.7 + z) - 0.5) * 0.55;
    p.setXYZ(i, x * k, Math.max(kind === 2 ? -0.2 : -1, y) * k * sy, z * k);
    const ao = 0.6 + 0.4 * ss(-0.6, 0.6, y); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    rsk[i * 2] = kind; uv[i * 2] = x; uv[i * 2 + 1] = y;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rsk', new THREE.BufferAttribute(rsk, 2)); g.setAttribute('rsUv', new THREE.BufferAttribute(uv, 2));
  g.scale(R, R, R); g.computeVertexNormals();
  return g;
}
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)));
  return g;
}

// ---------------------------------------------------------------- 岩石材质（一种材质：0 层理砂岩 / 1 雕刻风化石 / 2 沙）
const RS_GLSL = /* glsl */ `
float rsH21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rsN2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rsH21(i), rsH21(i + vec2(1, 0)), f.x), mix(rsH21(i + vec2(0, 1)), rsH21(i + vec2(1, 1)), f.x), f.y); }
float rsN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); vec2 o = i.xy + i.z * vec2(37.0, 17.0);
  float a = mix(mix(rsH21(o), rsH21(o + vec2(1, 0)), f.x), mix(rsH21(o + vec2(0, 1)), rsH21(o + vec2(1, 1)), f.x), f.y);
  o += vec2(37.0, 17.0);
  float b = mix(mix(rsH21(o), rsH21(o + vec2(1, 0)), f.x), mix(rsH21(o + vec2(0, 1)), rsH21(o + vec2(1, 1)), f.x), f.y);
  return mix(a, b, f.z); }
vec3 rsBand(float id){ float h = rsH21(vec2(id, 7.31));
  vec3 c0 = vec3(0.30, 0.055, 0.028), c1 = vec3(0.46, 0.12, 0.05), c2 = vec3(0.58, 0.21, 0.085), c3 = vec3(0.66, 0.34, 0.17), c4 = vec3(0.16, 0.035, 0.022);
  vec3 c = h < 0.3 ? mix(c0, c1, h / 0.3) : h < 0.62 ? mix(c1, c2, (h - 0.3) / 0.32) : h < 0.86 ? mix(c2, c3, (h - 0.62) / 0.24) : mix(c4, c0, (h - 0.86) / 0.14);
  return c; }
vec3 rsBump(vec3 n, vec3 pos, float h){ vec3 dpx = dFdx(pos), dpy = dFdy(pos); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  vec3 gr = sign(det) * (dhx * r1 + dhy * r2); return normalize(abs(det) * n - gr); }
`;
let ROCK: THREE.MeshStandardMaterial | null = null;
function rockMat(): THREE.MeshStandardMaterial {
  if (ROCK) return ROCK;
  const detail = curQuality !== 'low';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0 });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;
  m.onBeforeCompile = sh => {
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nattribute vec2 rsk; attribute vec2 rsUv; varying vec2 vRsk; varying vec2 vRsUv; varying vec3 vRsW; varying vec3 vRsN;', 'rshd.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvRsk = rsk; vRsUv = rsUv; vRsW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRsN = normalize(mat3(modelMatrix) * normal);', 'rshd.bv');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying vec2 vRsk; varying vec2 vRsUv; varying vec3 vRsW; varying vec3 vRsN;\n' + RS_GLSL, 'rshd.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
  float rsHt = 0.0; float rsRough = 1.0;
  {
    vec3 p = vRsW, Nw = normalize(vRsN);
    float mpp = length(fwidth(p));
    float fine = 1.0 - smoothstep(0.03, 0.14, mpp), grain = 1.0 - smoothstep(0.015, 0.07, mpp);
    float kind = vRsk.x;
    vec3 sandC = vec3(0.62, 0.30, 0.13) * (0.9 + 0.2 * rsN2(p.xz * 0.3));
    vec3 c;
    float gr = rsN3(p * 3.1) * 0.6 + rsN3(p * 7.3) * 0.4;
    if (kind < 0.5) {
      float yy = vRsUv.y + (rsN2(p.xz * 0.7 + p.y * 0.2) - 0.5) * 0.12 * fine;
      float b = yy / ${BAND.toFixed(2)}, bi = floor(b), bf = fract(b);
      c = mix(rsBand(bi), rsBand(bi + 1.0), smoothstep(0.82, 1.0, bf) * 0.6);
      float lam = sin(yy * 23.0 + rsN2(p.xz * 0.6) * 4.0) * 0.5 + 0.5;
      float lam2 = sin(yy * 61.0 + rsN2(p.xz * 1.7) * 3.0) * 0.5 + 0.5;
      c *= mix(1.0, 0.86 + 0.24 * lam, fine) * mix(1.0, 0.93 + 0.12 * lam2, grain);
      float groove = smoothstep(0.0, 0.07, bf) * (1.0 - smoothstep(0.9, 1.0, bf));
      float lip = smoothstep(0.78, 0.9, bf) * (1.0 - smoothstep(0.9, 0.99, bf));
      c *= mix(0.62, 1.0, groove) * (1.0 + lip * 0.12);
      c *= mix(1.0, 0.86 + 0.28 * gr, grain);
      c *= 0.82 + 0.34 * rsN2(p.xz * 0.018 + p.y * 0.012);
      float steep = 1.0 - abs(Nw.y);
      float str = rsN2(vec2(dot(p.xz, vec2(0.71, 0.71)) * 1.1 + p.x * 0.3, p.y * 0.05));
      c *= mix(1.0, 0.62, steep * smoothstep(0.58, 0.86, str) * 0.85);     // 沙漠漆竖条
      rsHt = groove * 0.07 + lip * 0.03 + lam * 0.012 * fine + gr * 0.01 * grain;
      rsRough = 1.0;
    } else if (kind < 1.5) {
      c = vec3(0.40, 0.27, 0.165) * (0.85 + 0.3 * rsN2(p.xz * 0.4 + p.y * 0.3));
      c *= mix(1.0, 0.82 + 0.3 * gr, grain);
      float cn = rsN3(p * 0.55 + 3.0), cr = (1.0 - smoothstep(0.0, 0.025, abs(cn - 0.5))) * smoothstep(0.45, 0.7, rsN3(p * 0.21));
      c *= 1.0 - cr * 0.55 * fine; rsHt -= cr * 0.04 * fine;
      float cv = vRsk.y; vec2 uv = vRsUv;
      if (cv > 0.9) {   // 方尖石刻纹：格子里的象形符号（横 / 竖 / 圈 / 斜）
        vec2 cell = floor(uv / vec2(0.42, 0.52)), f = fract(uv / vec2(0.42, 0.52)) - 0.5;
        float hh = rsH21(cell + 3.1), g = 0.0, w = 0.055;
        g = max(g, step(0.5, rsH21(cell + 1.0)) * (1.0 - smoothstep(w, w + 0.03, abs(f.y - 0.2))) * step(abs(f.x), 0.32));
        g = max(g, step(0.45, rsH21(cell + 2.0)) * (1.0 - smoothstep(w, w + 0.03, abs(f.x))) * step(abs(f.y), 0.36));
        g = max(g, step(0.6, hh) * (1.0 - smoothstep(w, w + 0.03, abs(length(f * vec2(1.0, 1.2)) - 0.2))));
        g = max(g, step(hh, 0.3) * (1.0 - smoothstep(w, w + 0.03, abs(f.x - f.y * 0.8))) * step(length(f), 0.36));
        float frame = 1.0 - smoothstep(0.03, 0.06, min(0.5 - abs(f.x), 0.5 - abs(f.y)));
        g = max(g, frame * 0.6) * fine;
        c *= 1.0 - g * 0.42; rsHt -= g * 0.03;
      } else if (cv > 0.6) {   // 额饰圆章：同心环 + 放射
        float r = length(uv);
        float g = (1.0 - smoothstep(0.05, 0.1, abs(fract(r * 1.6) - 0.5))) * fine;
        c *= 1.0 - g * 0.35; rsHt -= g * 0.03;
      } else if (cv > 0.3) {   // 头冠带：上下沿线 + 菱形纹
        float fy = fract(uv.y * 1.3), fx = fract(uv.x * 0.6);
        float g = max(1.0 - smoothstep(0.04, 0.09, abs(fy - 0.5)), 1.0 - smoothstep(0.05, 0.1, abs(abs(fx - 0.5) * 2.0 - abs(fy - 0.5) * 2.0))) * fine;
        c *= 1.0 - g * 0.3; rsHt -= g * 0.025;
      }
      rsRough = 0.95;
    } else {
      c = sandC;
      float rip = sin(dot(p.xz, vec2(0.8, 0.6)) * 5.0 + rsN2(p.xz * 0.9) * 6.0) * 0.5 + 0.5;
      c *= mix(1.0, 0.92 + 0.12 * rip, fine) * mix(1.0, 0.9 + 0.2 * gr, grain);
      rsHt = rip * 0.02 * fine;
    }
    float up = smoothstep(0.55, 0.85, Nw.y + (rsN2(p.xz * 0.9) - 0.5) * 0.45) * step(kind, 1.5);
    c = mix(c, sandC, up * 0.85); rsHt *= 1.0 - up * 0.7;
    diffuseColor.rgb *= c;
  }`, 'rshd.color');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * rsRough, 0.05, 1.0);', 'rshd.rough');
    if (detail) sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = rsBump(normal, -vViewPosition, rsHt);', 'rshd.bump');
  };
  m.customProgramCacheKey = () => 'rshd_rock' + (detail ? 'h' : 'l');
  return (ROCK = m);
}

// ---------------------------------------------------------------- 仙人掌材质（刺座 / 刺：着色器；棱：几何）
let CACT: THREE.MeshStandardMaterial | null = null;
function cactusMat(): THREE.MeshStandardMaterial {
  if (CACT) return CACT;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0 });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;
  m.onBeforeCompile = sh => {
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nattribute vec3 cak; varying vec3 vCak;', 'rscact.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvCak = cak;', 'rscact.bv');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nvarying vec3 vCak;\nfloat caH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }', 'rscact.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
  float caR = 1.0;
  if (abs(vCak.z) > 0.001) {
    vec2 d; float sp;
    if (vCak.z > 0.0) {   // 棱柱：棱脊上一列刺座（相邻棱错半格）
      float ru = vCak.x, k = floor(ru + 0.5), du = (ru - k) * vCak.z;
      sp = 0.12; float vv = vCak.y / sp + 0.5 * mod(k, 2.0);
      d = vec2(du, (fract(vv) - 0.5) * sp);
      float crest = 1.0 - smoothstep(0.0, 0.5, abs(ru - k));
      diffuseColor.rgb *= 0.78 + 0.34 * crest;                    // 棱脊亮、棱沟暗
    } else {              // 刺梨扁片：错位网格刺座
      sp = 0.065; vec2 q = vCak.xy / sp; q.x += 0.5 * mod(floor(q.y), 2.0);
      d = (fract(q) - 0.5) * sp;
    }
    float fw = fwidth(vCak.y), det = 1.0 - smoothstep(0.004, 0.018, fw);
    float r = length(d), th = atan(d.y, d.x);
    float felt = 1.0 - smoothstep(0.009, 0.015, r);
    float ph = caH(floor(vCak.xy / max(sp, 0.01)) + 1.7) * 6.28;
    float spine = pow(abs(cos(th * 2.5 + ph)), 36.0) * (1.0 - smoothstep(0.012, 0.055, r)) * step(0.008, r);
    vec3 feltC = vec3(0.55, 0.50, 0.40), spineC = vec3(0.72, 0.60, 0.36);
    vec3 avg = diffuseColor.rgb * 0.92 + feltC * 0.05 + spineC * 0.03;
    vec3 pat = mix(diffuseColor.rgb, feltC, felt); pat = mix(pat, spineC, spine * 0.9);
    diffuseColor.rgb = mix(avg, pat, det);
    caR = mix(1.0, mix(1.0, 1.4, max(felt, spine)), det);
    diffuseColor.rgb *= 0.94 + 0.12 * caH(floor(vCak.xy * vec2(3.0, 40.0)));   // 细竖纹
  }`, 'rscact.color');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * caR, 0.05, 1.0);', 'rscact.rough');
  };
  m.customProgramCacheKey = () => 'rshd_cactus';
  return (CACT = m);
}

// ---------------------------------------------------------------- 仙人掌几何
const C_BODY = new THREE.Color().setRGB(0.07, 0.135, 0.04), C_BODY_B = new THREE.Color().setRGB(0.09, 0.15, 0.06), C_CORK = new THREE.Color().setRGB(0.13, 0.11, 0.075);
const C_PAD = new THREE.Color().setRGB(0.1, 0.19, 0.055), C_PADP = new THREE.Color().setRGB(0.16, 0.07, 0.11);
interface CPart { p: number[]; c: number[]; k: number[]; i: number[] }   // 非管状零件（刺 / 花 / 果）
const newCP = (): CPart => ({ p: [], c: [], k: [], i: [] });
function cpGeo(P: CPart) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(P.c, 3)); g.setAttribute('cak', new THREE.Float32BufferAttribute(P.k, 3)); g.setIndex(P.i); g.computeVertexNormals(); return g; }
function tri(P: CPart, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color) {
  const o = P.p.length / 3; P.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); P.c.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); P.k.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
  P.i.push(o, o + 1, o + 2, o, o + 2, o + 1);   // 双面（反向绕序复制，不用 DoubleSide）
}
/** 带棱的管（沿路径，平行移动标架），返回几何 + 每个棱脊点（供几何刺） */
function ribTube(path: THREE.Vector3[], rad: (t: number) => number, ribs: number, per: number, depth: number, colAt: (t: number, y: number) => THREE.Color, crestOut?: { p: THREE.Vector3; n: THREE.Vector3; t: number }[]) {
  const P = newPiece(), m = ribs * per, W = m + 1, n = path.length;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
  T.subVectors(path[1], path[0]).normalize();
  N.set(1, 0, 0); if (Math.abs(T.x) > 0.9) N.set(0, 0, 1); N.sub(tmp.copy(T).multiplyScalar(N.dot(T))).normalize();
  let along = 0;
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1);
    if (j > 0) { along += path[j].distanceTo(path[j - 1]); const T2 = tmp.subVectors(path[Math.min(n - 1, j + 1)], path[j - 1]).normalize().clone(); N.sub(T2.clone().multiplyScalar(N.dot(T2))).normalize(); T.copy(T2); }
    B.crossVectors(T, N).normalize();
    const r = rad(t), c = path[j], ribW = 2 * Math.PI * r / ribs, cl = colAt(t, c.y);
    for (let i = 0; i < W; i++) {
      const a = i / m * Math.PI * 2, rib = 0.5 - 0.5 * Math.cos(ribs * a), rr = r * (1 - depth * Math.pow(rib, 0.8));
      const dx = Math.cos(a), dy = Math.sin(a);
      const x = c.x + (N.x * dx + B.x * dy) * rr, y = c.y + (N.y * dx + B.y * dy) * rr, z = c.z + (N.z * dx + B.z * dy) * rr;
      P.p.push(x, y, z); P.ring.push(c.x, c.y, c.z);
      const sh = 0.82 + 0.18 * (1 - rib);
      P.c.push(cl.r * sh, cl.g * sh, cl.b * sh);
      P.k.push(a * ribs / (Math.PI * 2), along, Math.max(0.01, ribW));
      if (crestOut && i < m && i % per === 0 && r > 0.03) crestOut.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(N.x * dx + B.x * dy, N.y * dx + B.y * dy, N.z * dx + B.z * dy), t });
    }
  }
  const e = path[n - 1], e0 = path[n - 2], dir = tmp.subVectors(e, e0).normalize();
  P.p.push(e.x + dir.x * 0.01, e.y + dir.y * 0.01, e.z + dir.z * 0.01); P.ring.push(e.x - dir.x, e.y - dir.y, e.z - dir.z);
  const cl = colAt(1, e.y); P.c.push(cl.r * 0.9, cl.g * 0.9, cl.b * 0.9); P.k.push(0, along + 0.02, 0.01);
  return tubeGeo(P, n, m, true, true, { k: 3, u: 0 });
}
function flower(P: CPart, at: THREE.Vector3, up: THREE.Vector3, size: number, petal: THREE.Color, heart: THREE.Color, nP = 7, R = Math.random) {
  const u = up.clone().normalize(), a = new THREE.Vector3(1, 0, 0); if (Math.abs(u.x) > 0.9) a.set(0, 0, 1);
  const s1 = new THREE.Vector3().crossVectors(u, a).normalize(), s2 = new THREE.Vector3().crossVectors(u, s1);
  const ctr = at.clone().addScaledVector(u, size * 0.25);
  const tip = petal.clone().lerp(new THREE.Color(1, 1, 1), 0.15), base = petal.clone().multiplyScalar(0.7);
  for (let i = 0; i < nP; i++) {
    const ang = (i + R() * 0.3) / nP * Math.PI * 2, d = s1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(s2, Math.sin(ang));
    const side = s1.clone().multiplyScalar(-Math.sin(ang)).addScaledVector(s2, Math.cos(ang));
    const p0 = ctr.clone(), p1 = ctr.clone().addScaledVector(d, size * 0.5).addScaledVector(u, size * 0.35).addScaledVector(side, size * 0.22);
    const p2 = ctr.clone().addScaledVector(d, size * 0.95).addScaledVector(u, size * 0.55), p3 = ctr.clone().addScaledVector(d, size * 0.5).addScaledVector(u, size * 0.35).addScaledVector(side, -size * 0.22);
    tri(P, p0, p1, p2, base, petal, tip); tri(P, p0, p2, p3, base, tip, petal);
  }
  const h0 = ctr.clone().addScaledVector(u, size * 0.18);
  for (let i = 0; i < 4; i++) { const ang = i / 4 * Math.PI * 2, d = s1.clone().multiplyScalar(Math.cos(ang) * size * 0.15).addScaledVector(s2, Math.sin(ang) * size * 0.15); tri(P, ctr, ctr.clone().add(d), h0, heart, heart, heart); }
}
function ellip(P: CPart, c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3, col: THREE.Color, sx = 8, sy = 6) {
  const o = P.p.length / 3;
  for (let j = 0; j <= sy; j++) { const v = j / sy * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
    for (let i = 0; i <= sx; i++) { const u = i / sx * Math.PI * 2; const x = Math.cos(u) * sv, y = cv, z = Math.sin(u) * sv;
      P.p.push(c.x + ax.x * x + ay.x * y + az.x * z, c.y + ax.y * x + ay.y * y + az.y * z, c.z + ax.z * x + ay.z * y + az.z * z);
      const k = 0.8 + 0.2 * (y * 0.5 + 0.5); P.c.push(col.r * k, col.g * k, col.b * k); P.k.push(0, 0, 0); } }
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const a = o + j * (sx + 1) + i, b = a + 1, cc = a + sx + 1, d = cc + 1; P.i.push(a, b, cc, b, d, cc); }
}
/** 刺梨扁片：扁椭球，刺座网格坐标 = 片上米数 */
function pad(P: CPart, c: THREE.Vector3, A: THREE.Vector3, Bv: THREE.Vector3, Nv: THREE.Vector3, w: number, h: number, th: number, purple: number, seg: [number, number]) {
  const o = P.p.length / 3, sx = seg[0], sy = seg[1];
  for (let j = 0; j <= sy; j++) { const v = j / sy * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
    for (let i = 0; i <= sx; i++) { const u = i / sx * Math.PI * 2; const x = Math.cos(u) * sv, y = cv, z = Math.sin(u) * sv;
      const X = x * w, Y = y * h, Z = z * th * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - x * x - y * y * 0.6)));
      P.p.push(c.x + A.x * X + Bv.x * Y + Nv.x * Z, c.y + A.y * X + Bv.y * Y + Nv.y * Z, c.z + A.z * X + Bv.z * Y + Nv.z * Z);
      const rim = Math.min(1, Math.hypot(x, y)); const cl = C_PAD.clone().lerp(C_PADP, purple * ss(0.75, 1, rim)).multiplyScalar(0.85 + 0.15 * (y * 0.5 + 0.5));
      P.c.push(cl.r, cl.g, cl.b); P.k.push(X + (z > 0 ? 0 : 0.031), Y, -1); } }
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const a = o + j * (sx + 1) + i, b = a + 1, cc = a + sx + 1, d = cc + 1; P.i.push(a, b, cc, b, d, cc); }
}

type CactusKind = 'saguaro' | 'barrel' | 'pear';
interface CVar { kind: CactusKind; geo: THREE.BufferGeometry; cast: boolean; foot: number }
function buildVariants(q: 'hi' | 'md' | 'lo'): CVar[] {
  const R = mkRnd(7781), per = q === 'hi' ? 3 : 2, out: CVar[] = [], up = new THREE.Vector3(0, 1, 0);
  const ringStep = q === 'hi' ? 0.34 : q === 'md' ? 0.45 : 0.6;
  // ---- 巨人柱（4 种：两臂 / 多臂开花 / 幼株 / 单臂高株）
  const sag = (H: number, arms: number, bloom: boolean, seed: number) => {
    const r0 = 0.27 + R() * 0.05, parts: THREE.BufferGeometry[] = [], FP = newCP();
    const n = Math.max(10, Math.round(H / ringStep));
    const bend = (R() - 0.5) * 0.25;
    const trunk = Array.from({ length: n }, (_, j) => { const t = j / (n - 1); return new THREE.Vector3(Math.sin(t * 1.3 + seed) * bend * t, -0.25 + t * (H + 0.25), Math.cos(t * 1.1) * bend * 0.4 * t); });
    const rad = (t: number) => r0 * (1 - 0.1 * t) * (t > 0.94 ? Math.sqrt(Math.max(0.04, 1 - ((t - 0.94) / 0.06) ** 2)) : 1) * (1 + 0.06 * Math.max(0, 0.08 - t) / 0.08);
    const col = (t: number, y: number) => C_BODY.clone().lerp(C_BODY_B, 0.5 + 0.5 * Math.sin(t * 7 + seed)).lerp(C_CORK, ss(0.7, 0.05, y) * 0.75);
    parts.push(ribTube(trunk, rad, 12, per, 0.17, col));
    const tops: { p: THREE.Vector3; d: THREE.Vector3 }[] = [{ p: trunk[n - 1], d: up }];
    for (let a = 0; a < arms; a++) {
      const ang = (a / arms) * Math.PI * 2 + R() * 0.8, d = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const ha = H * (0.38 + R() * 0.25), ra = r0 * (0.62 + R() * 0.1), out1 = 0.45 + R() * 0.25, len = H * (0.22 + R() * 0.2);
      const p0 = new THREE.Vector3(0, ha, 0).addScaledVector(d, r0 * 0.2), p1 = p0.clone().addScaledVector(d, out1).add(new THREE.Vector3(0, 0.05, 0));
      const p2 = p1.clone().addScaledVector(d, 0.2).add(new THREE.Vector3(0, 0.35, 0)), p3 = p2.clone().add(new THREE.Vector3(0, len, 0)).addScaledVector(d, -0.05 + R() * 0.12);
      const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3], false, 'centripetal');
      const na = Math.max(8, Math.round(curve.getLength() / ringStep) + 4);
      const pts = curve.getSpacedPoints(na - 1);
      parts.push(ribTube(pts, t => ra * (t > 0.9 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.9) / 0.1) ** 2)) : 1) * (1 + 0.15 * Math.max(0, 0.15 - t) / 0.15), 10, 2, 0.17, col));
      tops.push({ p: pts[pts.length - 1], d: up });
    }
    if (bloom) for (const tp of tops) for (let f = 0, k = 2 + Math.floor(R() * 3); f < k; f++) {
      const a = R() * Math.PI * 2, at = tp.p.clone().add(new THREE.Vector3(Math.cos(a) * 0.1, -0.03 - R() * 0.06, Math.sin(a) * 0.1));
      flower(FP, at, new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5), 0.09 + R() * 0.03, new THREE.Color().setRGB(0.78, 0.76, 0.66), new THREE.Color().setRGB(0.75, 0.52, 0.06), 8, R);
    }
    if (FP.p.length) parts.push(cpGeo(FP));
    out.push({ kind: 'saguaro', geo: mergeGeometries(parts, false)!, cast: true, foot: r0 });
  };
  sag(5.2, 2, false, 1.3); sag(6.4, 4, true, 2.1); sag(2.8, 0, true, 3.7); sag(7.2, 1, false, 4.4);
  // ---- 仙人球（金琥 / 强刺球：深棱 + 红色几何刺 + 冠上一圈花）
  const barrel = (Rb: number, Hb: number, ribs: number, bloom: boolean) => {
    const parts: THREE.BufferGeometry[] = [], SP = newCP(), crest: { p: THREE.Vector3; n: THREE.Vector3; t: number }[] = [];
    const n = q === 'lo' ? 7 : q === 'md' ? 8 : 10;
    const path = Array.from({ length: n }, (_, j) => new THREE.Vector3(0, -0.08 + j / (n - 1) * (Hb + 0.08), 0));
    const rad = (t: number) => Rb * (0.82 + 0.22 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08))) * (t > 0.8 ? Math.sqrt(Math.max(0.12, 1 - ((t - 0.8) / 0.2) ** 2)) : 1);
    parts.push(ribTube(path, rad, ribs, 2, 0.3, (t) => C_BODY_B.clone().lerp(new THREE.Color().setRGB(0.12, 0.17, 0.05), t * 0.6), q === 'lo' ? undefined : crest));
    const sb = new THREE.Color().setRGB(0.32, 0.06, 0.03), st = new THREE.Color().setRGB(0.78, 0.62, 0.38);
    for (const c of crest) {
      if (c.t < 0.12 || c.t > 0.93) continue;
      const side = new THREE.Vector3().crossVectors(c.n, up).normalize().multiplyScalar(0.007);
      for (let s = 0, ns = q === 'hi' ? 2 : 1; s < ns; s++) {
        const len = (s === 0 ? 0.075 : 0.045) * (0.8 + R() * 0.4), dirS = c.n.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, s === 0 ? 0.45 : -0.1, 0)).addScaledVector(side, (s ? 1 : 0) * 60 * (c.t > 0.5 ? 1 : -1)).normalize();
        const b = c.p.clone().addScaledVector(c.n, -0.004);
        tri(SP, b.clone().add(side), b.clone().sub(side), b.clone().addScaledVector(dirS, len), sb, sb, st);
      }
    }
    if (bloom) for (let f = 0; f < 9; f++) { const a = f / 9 * Math.PI * 2 + R() * 0.2; const at = new THREE.Vector3(Math.cos(a) * Rb * 0.4, Hb * 0.97, Math.sin(a) * Rb * 0.4);
      flower(SP, at, new THREE.Vector3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4), 0.07, f % 2 ? new THREE.Color().setRGB(0.85, 0.42, 0.05) : new THREE.Color().setRGB(0.88, 0.6, 0.06), new THREE.Color().setRGB(0.5, 0.1, 0.04), 7, R); }
    if (SP.p.length) parts.push(cpGeo(SP));
    out.push({ kind: 'barrel', geo: mergeGeometries(parts, false)!, cast: false, foot: Rb });
  };
  barrel(0.36, 0.62, 20, false); barrel(0.3, 0.48, 18, true);
  // ---- 刺梨（扁片分叉 + 紫红果 + 黄花）
  const pear = (lv: number, fruit: boolean, bloom: boolean, purple: number) => {
    const P = newCP(), seg: [number, number] = q === 'hi' ? [10, 7] : q === 'md' ? [8, 6] : [7, 5];
    const grow = (c: THREE.Vector3, Bv: THREE.Vector3, yaw: number, depth: number, size: number) => {
      const Nv = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)); Nv.sub(Bv.clone().multiplyScalar(Nv.dot(Bv))).normalize();
      const A = new THREE.Vector3().crossVectors(Bv, Nv).normalize();
      const w = 0.19 * size * (0.85 + R() * 0.3), h = 0.25 * size * (0.85 + R() * 0.3);
      const ctr = c.clone().addScaledVector(Bv, h * 0.92);
      pad(P, ctr, A, Bv, Nv, w, h, 0.045 * size, purple, seg);
      const kids = depth < lv ? (R() < 0.65 ? 1 : 2) : 0;
      for (let k = 0; k < kids; k++) {
        const sd = kids === 1 ? (R() - 0.5) * 1.2 : (k ? 1 : -1) * (0.35 + R() * 0.45);
        const at = ctr.clone().addScaledVector(Bv, h * 0.8).addScaledVector(A, sd * w * 0.7);
        const nb = Bv.clone().applyAxisAngle(Nv, -sd * 0.9 + (R() - 0.5) * 0.3).normalize();
        grow(at, nb, yaw + (R() - 0.5) * 1.4, depth + 1, size * (0.9 + R() * 0.1));
      }
      if (!kids) {
        for (let f = 0, nf = fruit ? 2 + Math.floor(R() * 3) : 0; f < nf; f++) { const s = (f / Math.max(1, nf - 1) - 0.5) * 1.6; const fp = ctr.clone().addScaledVector(Bv, h * Math.sqrt(Math.max(0, 1 - s * s * 0.25)) * 0.98).addScaledVector(A, s * w * 0.6);
          ellip(P, fp.addScaledVector(Bv, 0.03), A.clone().multiplyScalar(0.03), Bv.clone().multiplyScalar(0.045), Nv.clone().multiplyScalar(0.03), new THREE.Color().setRGB(0.42, 0.03, 0.09)); }
        if (bloom) for (let f = 0; f < 2; f++) { const s = (R() - 0.5) * 1.2; const fp = ctr.clone().addScaledVector(Bv, h * 0.95).addScaledVector(A, s * w * 0.5);
          flower(P, fp, Bv, 0.06, new THREE.Color().setRGB(0.88, 0.7, 0.08), new THREE.Color().setRGB(0.35, 0.45, 0.08), 7, R); }
      }
    };
    const base = 2;
    for (let b = 0; b < base; b++) { const yaw = R() * Math.PI * 2; const Bv = new THREE.Vector3(Math.cos(yaw + 1.6) * 0.3, 1, Math.sin(yaw + 1.6) * 0.3).normalize(); grow(new THREE.Vector3(Math.cos(yaw) * 0.18, -0.06, Math.sin(yaw) * 0.18), Bv, yaw, 0, 1.05); }
    out.push({ kind: 'pear', geo: cpGeo(P), cast: true, foot: 0.45 });
  };
  pear(2, true, false, 0.6); pear(2, false, true, 0.15);
  return out;
}

// ---------------------------------------------------------------- 流沙瀑布材质
const SF_T = { value: 0 };
let SF_M: THREE.MeshLambertMaterial | null = null, MIST_M: THREE.MeshLambertMaterial | null = null;
const SF_NOISE = /* glsl */ `
float sfH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sfN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfH(i), sfH(i + vec2(1, 0)), f.x), mix(sfH(i + vec2(0, 1)), sfH(i + vec2(1, 1)), f.x), f.y); }`;
function fallMat() {
  if (SF_M) return SF_M;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uSfT = SF_T;
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nattribute vec4 sfuv; varying vec4 vSf;', 'rsfall.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvSf = sfuv;', 'rsfall.bv');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nuniform float uSfT; varying vec4 vSf;' + SF_NOISE, 'rsfall.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, 'vec4 diffuseColor = vec4( diffuse, opacity );', `
  float sfu = vSf.x, sfv = vSf.y, sfL = vSf.z, sfs = vSf.w;
  float spd = 1.0 + sfs * 0.6;
  float s1 = sfN(vec2(sfu * 9.0 + sfs * 13.0, sfv * 0.22 - uSfT * 2.4 * spd));
  float s2 = sfN(vec2(sfu * 25.0 + 3.0 + sfs * 7.0, sfv * 0.55 - uSfT * 3.6 * spd));
  float s3 = sfN(vec2(sfu * 3.5 + 7.0, sfv * 0.07 - uSfT * 1.1 * spd));
  float st = s1 * 0.5 + s2 * 0.3 + s3 * 0.45;
  float wob = (sfN(vec2(sfv * 0.15 - uSfT * 0.8, sfs * 5.0)) - 0.5) * 0.18;
  float edge = smoothstep(0.0, 0.2 + wob, sfu) * (1.0 - smoothstep(0.8 - wob, 1.0, sfu));
  float top = smoothstep(0.0, 1.0, sfv), bot = 1.0 - smoothstep(sfL - 4.0, sfL, sfv);
  float a = clamp((st - 0.28) * 1.7, 0.0, 1.0) * edge * top * bot * mix(1.0, 0.55, smoothstep(0.0, sfL, sfv));
  vec3 sfc = mix(vec3(0.36, 0.17, 0.07), vec3(0.72, 0.42, 0.2), st) * (1.0 + 0.25 * smoothstep(0.6, 1.0, s2));
  vec4 diffuseColor = vec4(sfc * diffuse, a * opacity);`, 'rsfall.diffuse');
  };
  m.customProgramCacheKey = () => 'rshd_fall';
  return (SF_M = m);
}
function mistMat() {
  if (MIST_M) return MIST_M;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uSfT = SF_T;
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nattribute vec4 mc; varying vec3 vMs;', 'rsmist.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <project_vertex>', `vec4 mvPosition = modelViewMatrix * vec4(mc.xyz, 1.0);
  mvPosition.xy += position.xy * mc.w; vMs = vec3(position.xy, mc.x * 0.37 + mc.z * 0.61);
  gl_Position = projectionMatrix * mvPosition;`, 'rsmist.proj');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nuniform float uSfT; varying vec3 vMs;' + SF_NOISE, 'rsmist.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, 'vec4 diffuseColor = vec4( diffuse, opacity );', `
  float r = length(vMs.xy);
  float n = sfN(vMs.xy * 2.2 + vec2(vMs.z, -uSfT * 0.35)) * 0.6 + sfN(vMs.xy * 5.0 + vec2(-uSfT * 0.6, vMs.z)) * 0.4;
  float a = (1.0 - smoothstep(0.25, 1.0, r)) * smoothstep(0.2, 0.75, n) * (0.75 + 0.25 * sin(uSfT * 0.9 + vMs.z * 9.0));
  vec4 diffuseColor = vec4(vec3(0.6, 0.36, 0.18) * diffuse, a * opacity);`, 'rsmist.diffuse');
  };
  m.customProgramCacheKey = () => 'rshd_mist';
  return (MIST_M = m);
}

// ---------------------------------------------------------------- 主入口
export interface RsHdOut { group: THREE.Group; blocks: { x: number; z: number; r: number }[] }
export function buildRedsandHd(ctx: RsCtx, rec: RsRec): RsHdOut {
  const def = ctx.def, O = def.origin, H = def.half, q = curQuality;
  const tier: 'hi' | 'md' | 'lo' = q === 'low' ? 'lo' : q === 'medium' ? 'md' : 'hi';
  const K = tier === 'hi' ? 1 : tier === 'md' ? 0.7 : 0.4;
  const R = mkRnd(90817);
  const G = new THREE.Group(); G.name = 'redsand_hd';
  const blocks: RsHdOut['blocks'] = [];
  const rockGeos: THREE.BufferGeometry[] = [];
  const W = (lx: number, lz: number) => ({ x: O.x + lx, z: O.z + lz });
  const gyMin = (lx: number, lz: number, r: number) => { let m = ctx.gy(lx, lz); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; m = Math.min(m, ctx.gy(lx + Math.cos(a) * r, lz + Math.sin(a) * r)); } return m; };
  const resY = (n: number) => Math.max(3, Math.round(n * (tier === 'hi' ? 1 : tier === 'md' ? 0.7 : 0.5)));
  for (const k in rsHdStats) (rsHdStats as Record<string, number>)[k] = 0;
  rsHdPlaced.length = 0;

  // ---- 让开：路 / 营地 / 传送门 / 副本门 / 刷怪点 / 怪群 / 精英路线 / 稀有点 / 世界首领 / 台地坡道 / 已放的地标
  const taken: { x: number; z: number; r: number }[] = [];
  const arenas = WB_IDS.map(i => WORLD_BOSSES[i]).filter(b => b.map === def.id);
  const segD = (x: number, z: number, a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const clearAt = (x: number, z: number, r: number, inside = true, pathM = 4) => {
    if (inside && Math.max(Math.abs(x), Math.abs(z)) > H - 6 - r) return false;
    if (ctx.pd(x, z) < r + pathM) return false;
    if (def.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 8 + r)) return false;
    if (def.gates.some(g => Math.hypot(x - g.x, z - g.z) < 14 + r)) return false;
    if (def.decor.some(d => Math.hypot(x - d.x, z - d.z) < (d.kind === 'dgate' ? 14 * (d.s ?? 1) : 4) + r)) return false;
    if ((def.dungeonGates ?? []).some(d => Math.hypot(x - d.x, z - d.z) < 14 + r)) return false;
    if (Object.values(def.spots).some(sp => Math.hypot(x - sp.x, z - sp.z) < sp.r + r)) return false;
    if (def.packs.some(p => Math.hypot(x - p.x, z - p.z) < 10 + r)) return false;
    if (def.elite && def.elite.route.some((p, i, a) => i < a.length - 1 && segD(x, z, p, a[i + 1]) < 8 + r)) return false;
    if (def.rare && def.rare.spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 8 + r)) return false;
    if (arenas.some(b => Math.hypot(x - b.x, z - b.z) < b.r + 6 + r)) return false;
    if ((def.rises ?? []).some(rs => rs.kind === 'mesa' && Math.hypot(x - rs.x, z - rs.z) < rs.r + (rs.ramp?.len ?? 0) + 3 + r)) return false;
    if (ctx.ramp(x, z) || ctx.slope(x, z) > 14) return false;
    if (taken.some(t => Math.hypot(x - t.x, z - t.z) < t.r + r + 4)) return false;
    return true;
  };
  /** 按偏好点找位置；都不行就在附近确定性随机找 */
  const find = (prefs: [number, number][], r: number, inside = true, spread = 30, tries = 80): [number, number] | null => {
    for (const [x, z] of prefs) if (clearAt(x, z, r, inside)) return [x, z];
    for (const [x0, z0] of prefs) for (let i = 0; i < tries; i++) { const a = R() * Math.PI * 2, d = 4 + R() * spread, x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d; if (clearAt(x, z, r, inside)) return [x, z]; }
    return null;
  };
  const scen: { x: number; z: number; r: number }[] = [];   // 背景地标之间互相让开（与崖壁 / 远景方山重叠无妨：本来就是一片崖）
  const backdrop = (x: number, z: number, r: number) => Math.max(Math.abs(x), Math.abs(z)) > H + 4 + r * 0.6 && !scen.some(t => Math.hypot(x - t.x, z - t.z) < t.r + r + 3);
  const take = (x: number, z: number, r: number, blk = true, br = r) => { taken.push({ x, z, r }); if (blk) blocks.push({ x, z, r: br }); rsHdStats.landmarks++; };

  // ---- 砂岩方山 / 崖壁（替换旧 edge mesa 与远景 mesa；位置 / 障碍不变）
  const stack = (lx: number, lz: number, s: number, ry: number, far: boolean) => {
    const r = R, baseR = (2.2 + r() * 0.9) * s * (far ? 1.25 : 1), h = Math.min(36, (8 + r() * 9) * s * (far ? 1.25 : 1));
    // 沿边缘切向拉长 → 连成崖壁
    const alongX = Math.abs(lz) > Math.abs(lx), ex = 1.25 + r() * 0.9;
    const y0 = gyMin(lx, lz, baseR * 1.4) - 1.6, w = W(lx, lz);
    const capT = 0.84 + r() * 0.08, flare = 1.05 + r() * 0.1, taper = 0.12 + r() * 0.15;
    rockGeos.push(column({ x: w.x, z: w.z, y0, h: h + 1.6, segA: far ? (tier === 'hi' ? 14 : 10) : (tier === 'hi' ? 20 : 14), segY: resY(Math.ceil(h / (far ? 1.6 : 0.85))),
      prof: t => baseR * (1 - taper * t) * (t > capT ? flare : 1) * (t < 0.06 ? 1 + (0.06 - t) * 4 : 1),
      ex: alongX ? ex : 1, ez: alongX ? 1 : ex, rot: (r() - 0.5) * 0.4, amp: 0.13, ledge: far ? 0.7 : 1, cap: 0.6 + r() * 0.8, gC: ctx.gy(lx, lz), seed: lx * 0.13 + lz }));
    // 叠一块错位的上层盖岩（悬挑）
    if (!far || r() < 0.5) {
      const ox = (r() - 0.5) * baseR * 0.8, oz = (r() - 0.5) * baseR * 0.8, h2 = h * (0.25 + r() * 0.25), y1 = y0 + h + 1.2;
      rockGeos.push(column({ x: w.x + ox, z: w.z + oz, y0: y1, h: h2, segA: far ? 10 : 14, segY: resY(Math.ceil(h2 / 1.0)),
        prof: t => baseR * 0.55 * (1 - 0.2 * t) * (t > 0.8 ? 1.08 : 1), ex: alongX ? ex * 0.9 : 1, ez: alongX ? 1 : ex * 0.9, rot: ry, amp: 0.14, cap: 0.4, gC: y1 - 1, seed: lx + 3 }));
    }
    taken.push({ x: lx, z: lz, r: baseR });
    if (!far) for (const sd of [-1, 1]) {   // 沿边缘拉长的两端也登记障碍（只在可走范围内）
      const bx = lx + (alongX ? sd * baseR * ex * 0.62 : 0), bz = lz + (alongX ? 0 : sd * baseR * ex * 0.62);
      if (Math.abs(bx) < H && Math.abs(bz) < H && !(Math.abs(bx) < 9 && Math.abs(bz) > H - 14)) blocks.push({ x: bx, z: bz, r: baseR * 0.8 });
    }
  };
  for (const e of rec.edge) stack(e.lx, e.lz, e.s, e.ry, false);
  for (const e of rec.far) stack(e.lx, e.lz, e.s, e.ry, true);

  // ---- 流沙瀑布：边缘崖顶泻下（崖块 + 两层条纹带 + 底部沙堆 / 沙雾）
  const fallGeos: THREE.BufferGeometry[] = [], mistGeos: THREE.BufferGeometry[] = [];
  const nFall = tier === 'hi' ? 4 : tier === 'md' ? 3 : 2;
  const fallSpots: [number, number, number, number][] = [[-H - 7, 26, 1, 0], [H + 7, -24, -1, 0], [-52, -H - 7, 0, 1], [62, H + 7, 0, -1]];
  let fseed = 0;
  for (const [fx, fz, ix, iz] of fallSpots.slice(0, nFall)) {
    const w = W(fx, fz), tx = -iz, tz = ix;   // 切向
    const gC = ctx.gy(fx, fz), baseR = 6.5, h = 24 + R() * 6, y0 = gyMin(fx, fz, 9) - 2;
    rockGeos.push(column({ x: w.x, z: w.z, y0, h: h + (gC - y0), segA: tier === 'hi' ? 22 : 16, segY: resY(Math.ceil((h + gC - y0) / 0.85)), prof: t => baseR * (1 - 0.1 * t) * (t > 0.9 ? 1.1 : 1),
      ex: ix ? 1 : 2.4, ez: ix ? 2.4 : 1, amp: 0.1, cap: 0.5, gC, seed: fx + fz }));
    taken.push({ x: fx, z: fz, r: baseR * 2.4 });
    const topY = y0 + h + (gC - y0);
    const lip = new THREE.Vector3(w.x + ix * (baseR * 1.05), topY - 0.6, w.z + iz * (baseR * 1.05));
    const bx = fx + ix * (baseR + 4.5), bz = fz + iz * (baseR + 4.5), by = ctx.gy(bx, bz), Hf = lip.y - by;
    for (const [layer, wid, fwd, op] of [[0, 4.2, 0, 1], [1, 6.4, 0.7, 0.5]] as [number, number, number, number][]) {
      if (layer && tier === 'lo') continue;
      const nu = 8, nv = tier === 'hi' ? 30 : 20, pos: number[] = [], sf: number[] = [], idx: number[] = [], col: number[] = [];
      for (let j = 0; j <= nv; j++) { const s = j / nv; const fwdD = 0.4 + fwd + 3.2 * s * s + 0.8 * s; const wd = wid * (1 + 0.55 * s);
        for (let i = 0; i <= nu; i++) { const u = i / nu, lat = (u - 0.5) * wd + Math.sin(s * 3 + u * 2 + fseed) * 0.25;
          pos.push(lip.x + ix * fwdD + tx * lat, lip.y - s * Hf, lip.z + iz * fwdD + tz * lat); sf.push(u, s * Hf * 1.05, Hf * 1.05, fseed * 0.37 + layer * 0.5); col.push(1, 1, 1); } }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('sfuv', new THREE.Float32BufferAttribute(sf, 4));
      g.setIndex(idx); g.computeVertexNormals();
      const nn = g.getAttribute('normal') as THREE.BufferAttribute; for (let v = 0; v < nn.count; v++) { nn.setXYZ(v, ix * 0.6, 0.8, iz * 0.6); }   // 受光按「朝外略朝上」：两面一致，不随视角翻黑
      void op; if (layer) { const sfa = g.getAttribute('sfuv') as THREE.BufferAttribute; for (let v = 0; v < sfa.count; v++) sfa.setW(v, sfa.getW(v) + 2.3); }
      fallGeos.push(g);
    }
    // 沙堆（落点）+ 崖顶泻口小沙堆
    const bw = W(bx, bz);
    rockGeos.push(place(blob(4.8, 0.42, 2, fseed, tier === 'lo' ? 1 : 2), bw.x, by - 0.3, bw.z));
    // 沙雾：底部 + 半空
    const nm = tier === 'hi' ? 7 : tier === 'md' ? 5 : 2;
    for (let k = 0; k < nm; k++) {
      const hi = k >= nm - (tier === 'lo' ? 0 : 2);
      const cx = bw.x + (R() - 0.5) * 6 + tx * (R() - 0.5) * 5, cz = bw.z + (R() - 0.5) * 6 + tz * (R() - 0.5) * 5;
      const cy = hi ? lip.y - Hf * (0.35 + R() * 0.3) : by + 1.2 + R() * 2.2, sz = hi ? 3 + R() * 2 : 4 + R() * 4;
      const pq = new THREE.PlaneGeometry(2, 2); pq.deleteAttribute('uv');
      const n = pq.getAttribute('position').count, mc = new Float32Array(n * 4); for (let v = 0; v < n; v++) mc.set([cx, cy, cz, sz], v * 4);
      pq.setAttribute('mc', new THREE.BufferAttribute(mc, 4)); const nr = pq.getAttribute('normal') as THREE.BufferAttribute; for (let v = 0; v < n; v++) nr.setXYZ(v, 0, 1, 0);
      mistGeos.push(pq);
    }
    // 落点在可走范围边上：沙堆当障碍（不挡路：落点本就在崖脚）
    if (Math.max(Math.abs(bx), Math.abs(bz)) < H + 3) blocks.push({ x: bx, z: bz, r: 3.2 });
    rsHdPlaced.push({ kind: 'sandfall', x: bx, z: bz }); fseed++; rsHdStats.landmarks++;
  }

  // ---- 主路巨拱（拱脚让开路；路从拱下穿过）
  const archAt = (cx: number, cz: number, span: number, rise: number, yaw: number, inside: boolean) => {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const fA: [number, number] = [cx - dx * span / 2, cz - dz * span / 2], fB: [number, number] = [cx + dx * span / 2, cz + dz * span / 2];
    const fr = 3.2;
    if (inside && !(clearAt(fA[0], fA[1], fr, true, 3) && clearAt(fB[0], fB[1], fr, true, 3))) return false;
    if (!inside && !(backdrop(fA[0], fA[1], fr) && backdrop(fB[0], fB[1], fr))) return false;
    const gA = ctx.gy(...fA), gB = ctx.gy(...fB), base = Math.min(gA, gB);
    const pts: THREE.Vector3[] = [], n = tier === 'hi' ? 44 : tier === 'md' ? 32 : 22;
    for (let j = 0; j <= n; j++) { const t = j / n, th = Math.PI * (1 - t);
      const along = Math.cos(th) * span / 2 * (1 + 0.06 * Math.sin(th * 2)), up = Math.sin(th) * rise * (1 + 0.05 * Math.sin(t * 9)) + lerp(gA, gB, t) - base - 3 * (1 - Math.sin(th)) ;
      pts.push(new THREE.Vector3(O.x + cx + dx * along, base + up, O.z + cz + dz * along)); }
    const side = new THREE.Vector3(-dz, 0, dx);
    rockGeos.push(sweep(pts, t => 1.6 + 1.6 * Math.pow(Math.abs(t - 0.5) * 2, 3) + 0.25 * Math.sin(t * 17), t => 3.0 + 1.3 * Math.pow(Math.abs(t - 0.5) * 2, 2), tier === 'hi' ? 18 : 12, side, base));
    for (const f of [fA, fB]) { const w = W(f[0], f[1]), g0 = gyMin(f[0], f[1], 3.5) - 1.2;
      rockGeos.push(column({ x: w.x, z: w.z, y0: g0, h: rise * 0.38, segA: 16, segY: resY(Math.ceil(rise * 0.38 / 0.85)), prof: t => 3.4 * (1 - 0.35 * t), ex: 1, ez: 1.3, rot: yaw, amp: 0.15, gC: ctx.gy(f[0], f[1]), seed: f[0] })); }
    taken.push({ x: fA[0], z: fA[1], r: fr }, { x: fB[0], z: fB[1], r: fr }); scen.push({ x: cx, z: cz, r: span / 2 + fr });
    if (inside) { blocks.push({ x: fA[0], z: fA[1], r: fr }, { x: fB[0], z: fB[1], r: fr }); }
    rsHdPlaced.push({ kind: inside ? 'arch' : 'arch_back', x: cx, z: cz });
    rsHdStats.landmarks++;
    return true;
  };
  // 主路（x = 0，z 从 −30 到 −74）中段：拱跨 26 米、高 14 米
  for (const z of [-50, -46, -54, -42]) if (archAt(0, z, 26, 14, 0, true)) break;
  // 背景拱（可走范围外，剪影）
  const nBackArch = tier === 'lo' ? 1 : 2;
  for (let k = 0, done = 0; k < 24 && done < nBackArch; k++) { const a = R() * Math.PI * 2, rr = H + 20 + R() * 10; if (archAt(Math.cos(a) * rr, Math.sin(a) * rr, 16 + R() * 8, 10 + R() * 5, a + Math.PI / 2, false)) done++; }

  // ---- 半埋巨型石像头（营地西侧，到达营地就能看到）
  { const hr = 5.4, at = find([[-26, 76], [-30, 66], [-62, 82], [60, 74], [-74, -12]], 6.5);
    if (at) { const [hx, hz] = at, w = W(hx, hz), g0 = ctx.gy(hx, hz);
      const head = statueHead(hr, tier === 'hi' ? [72, 54] : tier === 'md' ? [52, 40] : [36, 28]);
      // 侧躺、略仰，脸朝营地 / 主路方向，埋 40%
      const face = Math.atan2(0 - hx, 52 - hz);
      rockGeos.push(place(head, w.x, g0 + hr * 0.25, w.z, face, -0.25, 0.55));
      rockGeos.push(place(blob(hr * 1.25, 0.32, 2, 3.3, tier === 'lo' ? 1 : 2), w.x, g0 - 0.2, w.z));   // 周围积沙
      for (let k = 0; k < Math.round(6 * K) + 2; k++) { const a = R() * Math.PI * 2, d = hr * (1.1 + R() * 0.6);
        rockGeos.push(place(blob(0.5 + R() * 0.9, 0.7, 1, k * 1.7, 1), w.x + Math.cos(a) * d, ctx.gy(hx + Math.cos(a) * d, hz + Math.sin(a) * d) + 0.1, w.z + Math.sin(a) * d, R() * 6, R(), R())); }
      take(hx, hz, hr * 1.25, true, hr * 1.05); rsHdPlaced.push({ kind: 'head', x: hx, z: hz });
    } }

  // ---- 刻纹方尖石（赤岩遗迹外圈 + 石像旁）
  const obelisk = (lx: number, lz: number, broken: boolean, sc: number) => {
    const w = W(lx, lz), g0 = gyMin(lx, lz, 1.6 * sc), lean: [number, number] = [(R() - 0.5) * 0.6 * sc, (R() - 0.5) * 0.6 * sc], yaw = R() * Math.PI;
    rockGeos.push(column({ x: w.x, z: w.z, y0: g0 - 0.6, h: 1.5 * sc, segA: 16, segY: 3, prof: t => 1.35 * sc * (1 - 0.12 * t), sq: 9, rot: yaw, amp: 0.04, kind: 1, cap: 0, gC: g0, seed: lx, seam: true }));
    const hs = (6 + R() * 5) * sc * (broken ? 0.65 : 1), hw = 0.75 * sc;
    rockGeos.push(column({ x: w.x, z: w.z, y0: g0 + 0.9 * sc, h: hs, segA: 16, segY: resY(Math.ceil(hs / 0.7)), prof: t => hw * (1 - 0.32 * t), sq: 10, rot: yaw, lean, amp: broken ? 0.06 : 0.03, kind: 1,
      cap: broken ? 0.3 : hw * 1.5, gC: g0, seed: lz, seam: true, carve: (t, yL) => (yL > 0.4 && yL < hs - 0.5 ? 1 : 0) * (t < 0.98 ? 1 : 0) }));
    take(lx, lz, 1.6 * sc, true, 1.3 * sc); rsHdPlaced.push({ kind: 'obelisk', x: lx, z: lz });
  };
  { const ruins = def.spots.red_ruins ?? { x: -36, z: -40, r: 13 };
    const nOb = tier === 'hi' ? 7 : tier === 'md' ? 5 : 3;
    let made = 0;
    for (let k = 0; k < 40 && made < nOb; k++) { const a = k / 40 * Math.PI * 2 * 3 + 0.4, d = ruins.r + 5 + (k % 3) * 3; const x = ruins.x + Math.cos(a) * d, z = ruins.z + Math.sin(a) * d;
      if (clearAt(x, z, 1.8)) { obelisk(x, z, made % 3 === 2, 0.9 + R() * 0.4); made++; } } }

  // ---- 高耸风化石柱（可走范围内少量 + 背景多）
  const spire = (lx: number, lz: number, sc: number) => {
    const w = W(lx, lz), h = (12 + R() * 10) * sc, br = (1.7 + R() * 0.9) * sc, g0 = gyMin(lx, lz, br) - 1.2, neck = 0.35 + R() * 0.25;
    rockGeos.push(column({ x: w.x, z: w.z, y0: g0, h: h + 1.2, segA: tier === 'hi' ? 16 : 12, segY: resY(Math.ceil(h / 0.85)),
      prof: t => br * (1 - 0.42 * t) * (1 - 0.18 * Math.exp(-((t - neck) ** 2) / 0.01)) * (t > 0.88 ? 1.15 : 1) * (t < 0.08 ? 1 + (0.08 - t) * 5 : 1),
      ex: 1 + R() * 0.4, rot: R() * 3, lean: [(R() - 0.5) * 1.2, (R() - 0.5) * 1.2], amp: 0.14, cap: 0.5, gC: ctx.gy(lx, lz), seed: lx * 0.7 }));
    if (R() < 0.45) { const bw = br * 0.9; rockGeos.push(place(blob(bw, 0.55, 0, lx, 1), w.x, g0 + h + 1.2 + bw * 0.35, w.z, R() * 3, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3)); }   // 平衡石
    return br;
  };
  { const nIn = Math.round(4 * K) + 1, nOut = Math.round(10 * K) + 2;
    for (let k = 0, done = 0; k < 120 && done < nIn; k++) { const x = (R() - 0.5) * 2 * (H - 10), z = (R() - 0.5) * 2 * (H - 10); if (clearAt(x, z, 3.2)) { const br = spire(x, z, 0.85 + R() * 0.3); take(x, z, br * 1.2, true, br); rsHdPlaced.push({ kind: 'spire', x, z }); done++; } }
    for (let k = 0, done = 0; k < 120 && done < nOut; k++) { const a = R() * Math.PI * 2, rr = H + 8 + R() * 24, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (backdrop(x, z, 3)) { const br = spire(x, z, 1.1 + R() * 0.5); scen.push({ x, z, r: br * 1.2 }); rsHdPlaced.push({ kind: 'spire_back', x, z }); rsHdStats.landmarks++; done++; } } }

  // ---- 蘑菇石（细颈 + 宽盖岩，2–3 个一簇）
  const hoodoo = (lx: number, lz: number, sc: number) => {
    const w = W(lx, lz), hs = (3.6 + R() * 3) * sc, rs = (0.85 + R() * 0.4) * sc, rc = rs * (2 + R() * 0.8), g0 = gyMin(lx, lz, rs * 1.6) - 0.8;
    rockGeos.push(column({ x: w.x, z: w.z, y0: g0, h: hs + 0.8, segA: tier === 'hi' ? 14 : 10, segY: resY(Math.ceil(hs / 0.6)),
      prof: t => rs * (1.5 - 0.75 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) + 0.25 * Math.pow(t, 6)), lean: [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5], amp: 0.12, ledge: 0.8, gC: ctx.gy(lx, lz), seed: lz }));
    const th = (0.9 + R() * 0.7) * sc, y1 = g0 + hs + 0.6;
    rockGeos.push(column({ x: w.x, z: w.z, y0: y1, h: th, segA: tier === 'hi' ? 16 : 11, segY: resY(Math.max(3, Math.ceil(th / 0.4))),
      prof: t => rc * (0.55 + 0.45 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5)) * (t > 0.7 ? 1 - (t - 0.7) * 0.6 : 1), ex: 1 + R() * 0.35, rot: R() * 3, amp: 0.16, cap: th * 0.25, gC: y1 - 3, seed: lx + 1 }));
    return rs * 1.4;
  };
  { const nH = Math.round(6 * K) + 2;
    for (let k = 0, done = 0; k < 160 && done < nH; k++) {
      const edgeBand = k % 2 === 0, a = R() * Math.PI * 2;
      const x = edgeBand ? Math.cos(a) * (H - 16) : (R() - 0.5) * 2 * (H - 12), z = edgeBand ? Math.sin(a) * (H - 16) : (R() - 0.5) * 2 * (H - 12);
      if (!clearAt(x, z, 4.5)) continue;
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) { const ox = i ? (R() - 0.5) * 7 : 0, oz = i ? (R() - 0.5) * 7 : 0; if (i && !clearAt(x + ox, z + oz, 2.5)) continue; const br = hoodoo(x + ox, z + oz, i ? 0.7 + R() * 0.2 : 1 + R() * 0.25); take(x + ox, z + oz, i ? br : 4.5, true, br); }
      rsHdPlaced.push({ kind: 'hoodoo', x, z }); done++;
    } }

  // ---- 合批：按 96 米格子合并（可视裁剪仍有效），一种材质
  const cells = new Map<string, THREE.BufferGeometry[]>();
  for (const g of rockGeos) {
    if (!g.getAttribute('rsUv')) continue;
    {   // 层理坐标统一按最终世界位置重算（拼块 / 平衡石 / 方山层理连续）
      const pa = g.getAttribute('position') as THREE.BufferAttribute, ka = g.getAttribute('rsk') as THREE.BufferAttribute, ua = g.getAttribute('rsUv') as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) if (ka.getX(v) < 0.5) ua.setY(v, strataY(pa.getX(v), pa.getY(v), pa.getZ(v)));
    }
    g.computeBoundingSphere(); const c = g.boundingSphere!.center, key = Math.floor(c.x / 96) + ',' + Math.floor(c.z / 96);
    let arr = cells.get(key); if (!arr) cells.set(key, arr = []); arr.push(g);
  }
  const rm = rockMat();
  for (const arr of cells.values()) {
    const merged = mergeGeometries(arr, false); arr.forEach(g => g.dispose()); if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, rm); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'rshd_rock'; G.add(mesh);
    rsHdStats.draws++; rsHdStats.rockTris += (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
  }
  if (fallGeos.length) {
    const fg = mergeGeometries(fallGeos, false)!; fallGeos.forEach(g => g.dispose());
    const fm = new THREE.Mesh(fg, fallMat()); fm.renderOrder = 2; fm.name = 'rshd_fall'; fm.onBeforeRender = () => { SF_T.value = performance.now() / 1000; };
    G.add(fm); rsHdStats.draws++; rsHdStats.fallTris += fg.index!.count / 3;
  }
  if (mistGeos.length) {
    const mg = mergeGeometries(mistGeos, false)!; mistGeos.forEach(g => g.dispose()); mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(O.x, 0, O.z), H * 2);
    const mm = new THREE.Mesh(mg, mistMat()); mm.renderOrder = 3; mm.frustumCulled = false; mm.name = 'rshd_mist'; mm.onBeforeRender = () => { SF_T.value = performance.now() / 1000; };
    G.add(mm); rsHdStats.draws++;
  }

  // ---- 仙人掌群（InstancedMesh：每种变体一次绘制）
  const vars = buildVariants(tier), byKind: Record<CactusKind, number[]> = { saguaro: [], barrel: [], pear: [] };
  vars.forEach((v, i) => byKind[v.kind].push(i));
  const inst: { v: number; x: number; z: number; s: number; ry: number; tilt: [number, number] }[] = [];
  const pick = (k: CactusKind) => byKind[k][Math.floor(R() * byKind[k].length)];
  const cactusOk = (x: number, z: number, r: number) => Math.max(Math.abs(x), Math.abs(z)) < H - 3 && ctx.pd(x, z) > 2.2 + r && !def.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 3)
    && !def.gates.some(g => Math.hypot(x - g.x, z - g.z) < 7) && !def.decor.some(d => Math.hypot(x - d.x, z - d.z) < (d.kind === 'dgate' ? 8 : 2.5)) && ctx.slope(x, z) < 20 && !ctx.ramp(x, z)
    && !taken.some(t => Math.hypot(x - t.x, z - t.z) < t.r + r + 0.5);
  const addC = (v: number, x: number, z: number, s: number, blk: boolean) => {
    inst.push({ v, x, z, s, ry: R() * Math.PI * 2, tilt: [(R() - 0.5) * 0.08, (R() - 0.5) * 0.08] });
    if (blk) blocks.push({ x, z, r: vars[v].foot * s * (vars[v].kind === 'pear' ? 1.4 : 1.2) });
  };
  const companions = (x: number, z: number, n: number) => { for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, d = 1 + R() * 1.6, cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
    if (!cactusOk(cx, cz, 0.4)) continue; const k: CactusKind = R() < 0.65 ? 'barrel' : 'pear'; addC(pick(k), cx, cz, k === 'barrel' ? 0.7 + R() * 0.6 : 0.6 + R() * 0.4, true); } };
  for (const c of rec.cactus) {   // 旧仙人掌位置（障碍已由 wild.ts 按旧半径放过）：主株 + 伴生
    const r = R(), kind: CactusKind = r < 0.55 ? 'saguaro' : r < 0.8 ? 'pear' : 'barrel';
    if (tier === 'lo' && R() < 0.4) continue;   // 低画质：部分旧位置只留障碍不出模型
    addC(pick(kind), c.lx, c.lz, kind === 'saguaro' ? 0.75 + c.s * 0.35 : kind === 'pear' ? 0.8 + c.s * 0.3 : 0.9 + c.s * 0.4, kind !== 'saguaro');
    companions(c.lx, c.lz, Math.round(R() * 2 * K));
  }
  const nExtra = Math.round(36 * K);
  for (let k = 0, done = 0; k < nExtra * 8 && done < nExtra; k++) {
    const x = (R() - 0.5) * 2 * (H - 6), z = (R() - 0.5) * 2 * (H - 6);
    if (!cactusOk(x, z, 1) || def.packs.some(p => Math.hypot(x - p.x, z - p.z) < 5) || Object.values(def.spots).some(sp => sp.r < 6 && Math.hypot(x - sp.x, z - sp.z) < sp.r + 2)) continue;
    const r = R(), kind: CactusKind = r < 0.3 ? 'saguaro' : r < 0.65 ? 'pear' : 'barrel';
    addC(pick(kind), x, z, kind === 'saguaro' ? 0.8 + R() * 0.45 : 0.8 + R() * 0.5, true);
    companions(x, z, Math.round(R() * 1.4 * K) + (kind === 'barrel' ? 1 : 0));
    done++;
  }
  const cm = cactusMat(), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), tint = new THREE.Color();
  vars.forEach((v, vi) => {
    const list = inst.filter(o => o.v === vi); if (!list.length) return;
    const im = new THREE.InstancedMesh(v.geo, cm, list.length); im.name = 'rshd_cactus_' + v.kind;
    list.forEach((o, i) => {
      const w = W(o.x, o.z);
      im.setMatrixAt(i, m4.compose(pv.set(w.x, ctx.gy(o.x, o.z), w.z), qt.setFromEuler(e.set(o.tilt[0], o.ry, o.tilt[1], 'YXZ')), sv.setScalar(o.s)));
      const hh = R(); im.setColorAt(i, tint.setRGB(0.88 + hh * 0.22, 0.92 + R() * 0.16, 0.85 + (1 - hh) * 0.2));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = v.cast && tier !== 'lo'; im.receiveShadow = true;
    G.add(im);
    rsHdStats.draws++; rsHdStats.cactusInst += list.length; rsHdStats.cactusTris += list.length * (v.geo.index ? v.geo.index.count : v.geo.getAttribute('position').count) / 3;
  });
  return { group: G, blocks };
}
