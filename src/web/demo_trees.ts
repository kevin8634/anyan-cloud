// ======================================================================
// 11-19 秋林逆光 Demo 树种（画质专长包 v9.1 商用版 reference/autumn_forest_src.html「树木生成」段移植，代码随包原创可商用）
//   照 Demo 源码搬：阔叶 broadleaf()（递归分枝管 + 末梢叶簇卡 + 推向树冠外壳 + 内层暗填充卡）、针叶 conifer()（逐层交叉针叶枝片）、
//   叶簇 2×2 canvas 图集（A 红橙枫 / B 金黄枫 / C 锈褐橡 / D 黄绿卵叶）+ 云杉枝片贴图、Demo 规格表 SP（mid / gold / yg）、
//   材质补丁 patchMat 的 wind（trunk / leaf：倾斜 0.22 + 慢摆 0.07，∝(h/10)²，近处叶颤 25→70 m 渐隐）、sph（法线弯向扁椭球 ×1.45）、
//   trans（背面 bk·1.25 + 前向 fw·3.4 透光，透光色偏黄 = 背面更亮更黄）、bark（世界坐标树皮条纹）、depthMat（投影跟着风动、叶片 alpha 裁剪）。
//   与 Demo 的差别（只为进游戏）：
//   · Demo 每张叶卡一个实例（全场 1 个 InstancedMesh）；游戏按「原型树」实例化——每种原型的树干 / 叶卡各合成一个几何，
//     一棵树 = 一个实例，绘制数 = 原型数 × 2（+ 同数阴影绘制），与棵数无关。卡中心 / 树冠中心作为顶点属性（aCC / aSph）代替 Demo 的实例属性。
//   · 高度 hy 用「离树根高度」（Demo 地面≈0 用世界 y），雾不在这里做（走游戏同一层空气 cine fog），图集 UV 偏移烘进 uv（不用 aUVo）。
//   · 夏绿图用同一套叶形 / 叶脉 / 斑驳画法换成绿色系图集（summer），秋色图用 Demo 原色（autumn）；针叶枝片两季相同（Demo 原色）。
//   画质：低档不建；中档叶卡 ×0.8（Demo tiers.leaves），棵数 ×0.5；高 / 超高全量。?off=demotree 关（field_flora.ts 判断）。
// ======================================================================
import * as THREE from 'three';
import { CU, cineSpecClass } from './cine';

export type DemoPal = 'autumn' | 'summer';
// 11-19 枫叶 qlmaple（Rhett 11-19「树叶类似枫叶，虽然是秋天，但如果是其他季节你可以变成绿色的枫叶」）：
//   图集四格全部用 Demo 枫叶形（leafPath kind 0：五裂掌状 + 锯齿 + 五条主脉，与 Demo 源码逐项一致），原 C 锈橡 / D 黄绿卵叶两格改画枫叶：
//   秋林（autumn）= A 红橙枫 / B 金黄枫 / C 锈褐枫 / D 黄绿枫（Demo 四格原色，只换叶形）；夏绿（summer）= 同一叶形的绿色枫叶，
//   四格深绿 / 黄绿 / 墨绿 / 嫩绿，每格掺一种偏黄 / 偏橄榄的叶色做少量色差。针叶枝片不变（霜脊仍只用 Demo 云杉）。
//   棵数：开启时各区 Demo 树 ×1.75（field_flora demoPlan，落点规则不变：林团掩码内、离路 / 物件 2.5 m、彼此 ≥5 m、树干进寻路）。?off=qlmaple 回 bcc0a29
let _mOff: boolean | null = null;
export function qlMapleOn(): boolean {
  if (_mOff === null) {
    _mOff = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      _mOff = `${q},${ls}`.split(',').map(x => x.trim()).includes('qlmaple');
    } catch { _mOff = false; }
  }
  return !_mOff;
}
/** qlmaple 棵数倍率（Demo 林地密度：中景约 77 m² 一棵；游戏各区原配 24–60 棵偏稀） */
// 11-19 qlmaplefull（Rhett 11-19 02:42「枫叶数量不够尤其是本体版的地图。给我大面积替换现有阔野树，枫叶片除了秋天颜色也要有夏日绿色」）：
//   Demo 树新增棵数 ×1.75 → ×2.5（field_flora 另把原有阔叶老树整棵换成 Demo 枫树）。?off=qlmaplefull 回 C22（×1.75、老树一半换叶）
let _qmfOff: boolean | null = null;
export function qlMapleFullOn(): boolean {
  if (_qmfOff === null) {
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      _qmfOff = `${q},${ls}`.split(',').map(x => x.trim()).includes('qlmaplefull');
    } catch { _qmfOff = false; }
  }
  return !_qmfOff;
}
export const demoTreeCountK = () => (qlMapleOn() ? (qlMapleFullOn() ? 2.5 : 1.75) : 1);
export type DemoKind = 'mid' | 'gold' | 'yg' | 'conifer';
export const DEMO_KINDS: DemoKind[] = ['mid', 'gold', 'yg', 'conifer'];

// ---------------------------------------------------------------- 随机（Demo：rnd / rr，按原型独立播种）
function lcg(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash(x: number, y: number) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
const lin = (h: string) => new THREE.Color(h).convertSRGBToLinear();

// ---------------------------------------------------------------- 贴图（canvas 程序绘制，Demo leafPath / leafAtlas / sprayTex）
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); if (!x) return null;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function leafPath(x: CanvasRenderingContext2D, kind: number, s: number) {
  x.beginPath(); const N = 72;
  for (let i = 0; i <= N; i++) {
    const th = i / N * Math.PI * 2; let r: number;
    if (kind === 0) {   // 枫叶：五裂掌状 + 锯齿
      const a = th - Math.PI * 1.5; let lob = 0;
      for (const [c, w, l] of [[0, 0.33, 1], [0.95, 0.3, 0.86], [-0.95, 0.3, 0.86], [1.95, 0.28, 0.55], [-1.95, 0.28, 0.55]]) { const d = Math.atan2(Math.sin(a - c), Math.cos(a - c)); lob = Math.max(lob, l * Math.exp(-(d / w) * (d / w) * 2.2)); }
      r = s * (0.28 + 0.72 * lob) * (1 + 0.07 * Math.sin(th * 34));
    } else if (kind === 1) {   // 橡叶：长圆 + 波状裂
      const e = 1 / Math.sqrt(Math.pow(Math.cos(th) / 0.42, 2) + Math.pow(Math.sin(th) / 1, 2)); r = s * e * (1 + 0.2 * Math.sin(th * 9));
    } else {   // 卵形尖叶
      const e = 1 / Math.sqrt(Math.pow(Math.cos(th) / 0.48, 2) + Math.pow(Math.sin(th) / 1, 2)); r = s * e; r *= 1 + 0.04 * Math.sin(th * 24);
    }
    const px = Math.cos(th) * r, py = Math.sin(th) * r; if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}
/** 图集四格配色：autumn = Demo 原色；summer = 同画法的夏绿 */
const ATLAS_PAL: Record<DemoPal, string[][]> = {
  autumn: [['#e0611a', '#c8401a', '#f08a24', '#a8301a', '#e87a1c'], ['#f2b437', '#e8962a', '#f7c84a', '#d9842a', '#ffd65a'],
    ['#b4561e', '#8f3d16', '#c9772c', '#d18a35', '#7a3312'], ['#b9b83c', '#9aa834', '#d6c84a', '#7f9a2c', '#c8a83a']],
  summer: [['#3f6a1e', '#335c18', '#4f7c26', '#2a4e14', '#5a8a2c'], ['#6f9a2c', '#5e8a26', '#86a83a', '#4f7a22', '#9ab43e'],
    ['#2f5418', '#3a6420', '#284a14', '#46702a', '#22400f'], ['#7f9a2c', '#6a8e2a', '#93ac3a', '#5a7e24', '#a0b048']],
};
/** 11-19 qlmaple 夏绿枫：四格绿色系（深绿 / 黄绿 / 墨绿 / 嫩绿），末一色是少量色差叶（偏黄 / 偏橄榄） */
const MAPLE_SUMMER: string[][] = [['#3f6a1e', '#335c18', '#4f7c26', '#2a4e14', '#5a8a2c', '#7a8a2a'], ['#6f9a2c', '#5e8a26', '#86a83a', '#4f7a22', '#9ab43e', '#b0a83a'],
  ['#2f5418', '#3a6420', '#284a14', '#46702a', '#22400f', '#55602a'], ['#7f9a2c', '#6a8e2a', '#93ac3a', '#5a7e24', '#a0b048', '#c0b44a']];
const ATLAS_CACHE = new Map<string, THREE.CanvasTexture | null>();
function leafAtlas(pal: DemoPal) {
  const mp = qlMapleOn(), ck = pal + (mp ? '|maple' : '');
  if (ATLAS_CACHE.has(ck)) return ATLAS_CACHE.get(ck)!;
  const rnd = lcg(pal === 'autumn' ? 4242 : 4343), rr = (a: number, b: number) => a + (b - a) * rnd();
  const P = mp && pal === 'summer' ? MAPLE_SUMMER : ATLAS_PAL[pal];
  const t = canvasTex(1024, 1024, (x) => {
    const cells: [number, number, number, string[]][] = mp ? [[0, 0, 0, P[0]], [512, 0, 0, P[1]], [0, 512, 0, P[2]], [512, 512, 0, P[3]]]   // 11-19 qlmaple：四格都是枫叶形
      : [[0, 0, 0, P[0]], [512, 0, 0, P[1]], [0, 512, 1, P[2]], [512, 512, 2, P[3]]];
    for (const [ox, oy, kind, pal_] of cells) {
      x.save(); x.translate(ox + 256, oy + 256);
      x.strokeStyle = '#3b2412'; x.lineCap = 'round'; const n = kind === 2 ? 30 : 26; const pts: [number, number, number][] = [];
      for (let i = 0; i < n; i++) { const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * 175 + 25; pts.push([Math.cos(a) * d, Math.sin(a) * d, a]); }
      for (const [px, py] of pts) { x.lineWidth = 2.4; x.beginPath(); x.moveTo(rr(-20, 20), rr(-20, 20) + 30); x.quadraticCurveTo(px * 0.5 + rr(-20, 20), py * 0.5, px, py); x.stroke(); }
      for (const [px, py, a] of pts) {
        const s = kind === 2 ? rr(34, 52) : rr(44, 66); x.save(); x.translate(px, py); x.rotate(a + Math.PI / 2 + rr(-0.6, 0.6));
        x.fillStyle = pal_[Math.floor(rnd() * pal_.length)]; leafPath(x, kind, s); x.fill();
        x.strokeStyle = 'rgba(60,20,0,0.35)'; x.lineWidth = 1.4; leafPath(x, kind, s); x.stroke();   // 叶脉与边缘暗化
        x.strokeStyle = 'rgba(255,230,160,0.35)'; x.lineWidth = 1.6; x.beginPath();
        const vs = kind === 0 ? [0, 0.95, -0.95, 1.95, -1.95] : [0];
        for (const vv of vs) { const aa = vv - Math.PI / 2; x.moveTo(0, s * 0.15); x.lineTo(Math.cos(aa) * s * 0.85, Math.sin(aa) * s * 0.85); }
        if (kind > 0) for (let k = -3; k <= 3; k++) { if (!k) continue; x.moveTo(0, -k * s * 0.18); x.lineTo(Math.sign(k) * s * 0.35, -k * s * 0.18 - s * 0.25); x.moveTo(0, -k * s * 0.18); x.lineTo(-Math.sign(k) * s * 0.35, -k * s * 0.18 - s * 0.25); }
        x.stroke();
        const gr = x.createRadialGradient(rr(-s / 3, s / 3), rr(-s / 3, s / 3), 2, 0, 0, s); gr.addColorStop(0, 'rgba(255,220,120,0.25)'); gr.addColorStop(1, 'rgba(60,10,0,0.25)');   // 颜色斑驳
        x.fillStyle = gr; leafPath(x, kind, s); x.fill(); x.restore();
      }
      x.restore();
    }
  });
  ATLAS_CACHE.set(ck, t); return t;
}
/** 11-19 qlmaplemix：原有老树种（field_flora 枫 / 栎 / 白桦 / 阔叶）约一半改挂 Demo 枫叶，复用这张图集（同调色板同一张，不新增贴图）与格位 */
export const demoLeafAtlas = (pal: DemoPal) => leafAtlas(pal);
export const demoLeafCell = (c: 'A' | 'B' | 'C' | 'D'): [number, number] => CELL[c];
let SPRAY: THREE.CanvasTexture | null | undefined;
function sprayTex() {   // 云杉针叶枝片：从左（树干）到右（枝梢）
  if (SPRAY !== undefined) return SPRAY;
  const rnd = lcg(5151), rr = (a: number, b: number) => a + (b - a) * rnd();
  SPRAY = canvasTex(512, 256, (x) => {
    x.lineCap = 'round'; const main = (t: number): [number, number] => [20 + t * 480, 128 + Math.sin(t * 3) * 6];
    const shade = ['#1d3b1e', '#24472a', '#2c5530', '#183220', '#3a6433'];
    for (let i = 0; i < 46; i++) {
      const t = 0.04 + i / 46 * 0.92; const [bx, by] = main(t); const half = (1 - t * 0.75) * 100;
      for (const sd of [-1, 1]) {
        const ex = bx + half * 0.55 + rr(-8, 8), ey = by + sd * half * rr(0.7, 1); x.strokeStyle = '#2a2414'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.stroke();
        for (let k = 0; k < 12; k++) {
          const u = k / 12; const nx = bx + (ex - bx) * u, ny = by + (ey - by) * u; const L = rr(9, 16) * (1 - u * 0.4);
          x.strokeStyle = shade[Math.floor(rnd() * shade.length)]; x.lineWidth = rr(2, 3.2);
          for (const s2 of [-1, 1]) { x.beginPath(); x.moveTo(nx, ny); x.lineTo(nx + L * 0.8, ny + s2 * L * 0.6 * sd + sd * L * 0.3); x.stroke(); }
        }
      }
    }
    x.strokeStyle = '#3a2a16'; x.lineWidth = 5; x.beginPath(); for (let i = 0; i <= 20; i++) { const [px, py] = main(i / 20); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
  });
  return SPRAY;
}

// ---------------------------------------------------------------- 几何工具（Demo GB / addTube）
interface GB { pos: number[]; nrm: number[]; col: number[]; uv: number[]; idx: number[]; cc: number[]; sph: number[] }
const GBn = (): GB => ({ pos: [], nrm: [], col: [], uv: [], idx: [], cc: [], sph: [] });
function toGeo(B: GB, cards: boolean) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  if (cards) { g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); g.setAttribute('aCC', new THREE.Float32BufferAttribute(B.cc, 3)); g.setAttribute('aSph', new THREE.Float32BufferAttribute(B.sph, 3)); }
  g.setIndex(B.idx); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0);
function addTube(B: GB, pts: THREE.Vector3[], rad: number[], col: THREE.Color) {
  const n = 7, base = B.pos.length / 3;
  for (let i = 0; i < pts.length; i++) {
    const t = _v.copy(pts[Math.min(i + 1, pts.length - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
    const a = Math.abs(t.y) < 0.95 ? UP : XA; _u.crossVectors(t, a).normalize(); _w.crossVectors(t, _u);
    for (let k = 0; k < n; k++) {
      const an = k / n * Math.PI * 2, c = Math.cos(an), s = Math.sin(an); const nx = _u.x * c + _w.x * s, ny = _u.y * c + _w.y * s, nz = _u.z * c + _w.z * s; const r = rad[i] * (1 + 0.08 * Math.sin(an * 3 + i));
      B.pos.push(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r); B.nrm.push(nx, ny, nz); const d = 0.75 + 0.35 * hash(i * 7 + k, base); B.col.push(col.r * d, col.g * d, col.b * d);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) { const a = base + i * n + k, b = base + i * n + (k + 1) % n, c = a + n, d = b + n; B.idx.push(a, c, b, b, c, d); }
}
/** 叶卡（Demo 实例 = PlaneGeometry(1,1) × 矩阵）烘进合并几何：uv 带图集格偏移（Demo vUv = uv·0.5 + aUVo），aCC = 卡中心，aSph = 卡中心 − 树冠中心 */
const PLANE = new THREE.PlaneGeometry(1, 1), SPRAY_G = (() => { const g = new THREE.PlaneGeometry(1, 1, 2, 1); g.translate(0.5, 0, 0); g.rotateX(-Math.PI / 2); return g; })();
const _n3 = new THREE.Matrix3(), _p3 = new THREE.Vector3(), _q3 = new THREE.Vector3();
function addCard(B: GB, geo: THREE.BufferGeometry, m: THREE.Matrix4, ctr: THREE.Vector3, uvo: [number, number] | null, col: THREE.Color) {
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, I = geo.index!, base = B.pos.length / 3;
  _n3.getNormalMatrix(m); const cx = m.elements[12], cy = m.elements[13], cz = m.elements[14];
  for (let i = 0; i < P.count; i++) {
    _p3.fromBufferAttribute(P, i).applyMatrix4(m); _q3.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
    B.pos.push(_p3.x, _p3.y, _p3.z); B.nrm.push(_q3.x, _q3.y, _q3.z); B.col.push(col.r, col.g, col.b);
    const u = UV.getX(i), v = UV.getY(i); if (uvo) B.uv.push(u * 0.5 + uvo[0], v * 0.5 + uvo[1]); else B.uv.push(u, v);
    B.cc.push(cx, cy, cz); B.sph.push(cx - ctr.x, cy - ctr.y, cz - ctr.z);
  }
  for (let i = 0; i < I.count; i++) B.idx.push(base + I.getX(i));
}

// ---------------------------------------------------------------- 树木生成（Demo broadleaf / conifer / SP，原点处生成，地面 y = 0）
interface Spec { depth: number; c0: number; trunk: number; r: number; lenF: number; spread: number[]; up: number; wander: number; cards: number; clr: number; card: number; cell: 'A' | 'B' | 'C' | 'D'; cell2?: 'A' | 'B' | 'C' | 'D'; mix?: number; tint: (rr: (a: number, b: number) => number) => THREE.Color }
const SP: Record<'mid' | 'gold' | 'yg', Spec> = {
  mid: { depth: 3, c0: 3, trunk: 3.2, r: 0.3, lenF: 0.76, spread: [0.75, 0.85, 0.95], up: 0.06, wander: 0.3, cards: 18, clr: 1.4, card: 1.3, cell: 'A', cell2: 'C', mix: 0.4, tint: rr => new THREE.Color(1, rr(0.8, 1.05), rr(0.75, 1)) },
  gold: { depth: 3, c0: 3, trunk: 3.0, r: 0.28, lenF: 0.72, spread: [0.65, 0.8, 0.9], up: 0.07, wander: 0.3, cards: 15, clr: 1.3, card: 1.25, cell: 'B', cell2: 'A', mix: 0.25, tint: rr => new THREE.Color(1, rr(0.9, 1), rr(0.8, 1)) },
  yg: { depth: 3, c0: 2, trunk: 3.4, r: 0.22, lenF: 0.7, spread: [0.45, 0.6, 0.8], up: 0.1, wander: 0.25, cards: 10, clr: 1.2, card: 1.1, cell: 'D', tint: rr => new THREE.Color(rr(0.85, 1), 1, rr(0.8, 1)) },
};
const PAL: Record<string, THREE.Color[]> = { A: [lin('#ffffff'), lin('#ffe9d8'), lin('#f4d0b8')], B: [lin('#ffffff'), lin('#fff2d8'), lin('#ffe0c0')], C: [lin('#ffffff'), lin('#f6dcc8')], D: [lin('#ffffff'), lin('#e8f0d0')] };
const CELL: Record<string, [number, number]> = { A: [0, 0.5], B: [0.5, 0.5], C: [0, 0], D: [0.5, 0] };   // canvas 顶部 = uv 上半
const BARK = lin('#1e1712'), BARK2 = lin('#2c241d');
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export interface Proto { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry; needle: boolean; H: number; tris: number; cards: number }
function broadleaf(spec: Spec, sz: number, leafK: number, rnd: () => number): Proto {
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const TR = GBn(), LV = GBn(); const y0 = -0.2; const tips: THREE.Vector3[] = []; const dep = spec.depth;
  function rec(p: THREE.Vector3, d: THREE.Vector3, len: number, r: number, depth: number) {
    const segs = Math.max(2, Math.round(len / 0.55)); const pts = [p.clone()], rad = [r]; let cur = p.clone(); const dir = d.clone();
    for (let i = 1; i <= segs; i++) {
      dir.x += (rnd() - 0.5) * spec.wander; dir.z += (rnd() - 0.5) * spec.wander; dir.y += (rnd() - 0.5) * spec.wander * 0.6 + spec.up * (depth ? 1 : 0.3); dir.normalize();
      cur = cur.clone().addScaledVector(dir, len / segs); pts.push(cur); rad.push(r * (1 - 0.3 * i / segs));
    }
    if (depth === 0) rad[0] *= 1.5;
    addTube(TR, pts, rad, depth === 0 ? BARK : BARK2);
    if (depth >= dep || r < 0.025) { tips.push(cur.clone()); return; }
    const nc = depth === 0 ? spec.c0 : 2 + (rnd() < 0.55 ? 1 : 0);
    for (let c = 0; c < nc; c++) {
      const t = c === 0 ? 1 : rr(0.45, 0.95); const sp = pts[Math.round(t * (pts.length - 1))];
      const az = rnd() * Math.PI * 2; const sp2 = spec.spread[Math.min(depth, spec.spread.length - 1)] * rr(0.7, 1.2);
      const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); const nd = dir.clone().multiplyScalar(Math.cos(sp2)).addScaledVector(side, Math.sin(sp2)); nd.y += spec.up * 0.5; nd.normalize();
      rec(sp, nd, len * spec.lenF * rr(0.8, 1.15), r * 0.62, depth + 1);
      if (depth >= dep - 1 && rnd() < 0.6) tips.push(pts[Math.round(rr(0.5, 1) * (pts.length - 1))].clone());
    }
  }
  const tl = spec.trunk * sz * rr(0.85, 1.15);
  rec(new THREE.Vector3(0, y0, 0), new THREE.Vector3(rr(-0.1, 0.1), 1, rr(-0.1, 0.1)).normalize(), tl, spec.r * sz, 0);
  const ctr = new THREE.Vector3(); tips.forEach(t => ctr.add(t)); ctr.divideScalar(Math.max(tips.length, 1)); ctr.y -= 0.6 * sz;
  let crad = 0; tips.forEach(t => crad = Math.max(crad, t.distanceTo(ctr)));
  const tint = spec.tint(rr); let top = 0;
  for (const t of tips) for (let k = 0; k < spec.cards; k++) {
    if (rnd() > leafK) continue;
    _p.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(Math.cbrt(rnd()) * spec.clr * sz); _p.y *= 0.75; _p.add(t);
    _w.copy(_p).sub(ctr); _w.y *= 1.2; _p.addScaledVector(_w.normalize(), 0.35 * sz);   // 推向树冠外壳
    const op = Math.min(1, _p.distanceTo(ctr) / Math.max(crad, 0.1));
    _e.set(rr(-1.2, 1.2), rnd() * 6.283, rr(-1.2, 1.2)); _q.setFromEuler(_e); const cs = spec.card * sz * rr(0.75, 1.25); _s.set(cs, cs, cs); _m.compose(_p, _q, _s);
    const pal = PAL[spec.cell]; const c = pal[Math.floor(rnd() * pal.length)].clone().multiply(tint).multiplyScalar(0.42 + 0.68 * Math.pow(op, 1.3));
    const cell = spec.cell2 && rnd() < (spec.mix ?? 0) ? spec.cell2 : spec.cell;
    addCard(LV, PLANE, _m, ctr, CELL[cell], c); top = Math.max(top, _p.y + cs * 0.5);
  }
  // 内层暗色填充簇：挡住树冠里的「透空」，让近处树冠显得实
  const nf = Math.round(tips.length * spec.cards * 0.16 * leafK);
  for (let k = 0; k < nf; k++) {
    _p.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(Math.cbrt(rnd()) * crad * 0.62); _p.y *= 0.7; _p.add(ctr); _p.y += 0.25 * sz;
    _e.set(rr(-1.5, 1.5), rnd() * 6.283, rr(-1.5, 1.5)); _q.setFromEuler(_e); const cs = spec.card * sz * rr(1.4, 1.9); _s.set(cs, cs, cs); _m.compose(_p, _q, _s);
    const c = PAL[spec.cell][0].clone().multiply(tint).multiplyScalar(rr(0.16, 0.28));
    addCard(LV, PLANE, _m, ctr, CELL[rnd() < 0.5 ? spec.cell : (spec.cell2 ?? spec.cell)], c);
  }
  const trunk = toGeo(TR, false), leaves = toGeo(LV, true), cards = LV.idx.length / 6;
  return { trunk, leaves, needle: false, H: Math.max(top, tl), tris: (TR.idx.length + LV.idx.length) / 3, cards };
}
function conifer(sz: number, rnd: () => number): Proto {
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const TR = GBn(), LV = GBn(); const y0 = -0.2; const Ht = rr(11, 17) * sz; const pts: THREE.Vector3[] = [], rad: number[] = [];
  for (let i = 0; i <= 8; i++) { pts.push(new THREE.Vector3(Math.sin(i) * 0.03, y0 + Ht * i / 8, 0)); rad.push(0.32 * sz * (1 - i / 8 * 0.9)); }
  addTube(TR, pts, rad, lin('#2b211a'));
  const baseR = rr(2.6, 3.4) * sz; const tint = new THREE.Color(1, 1, 1).multiplyScalar(rr(0.8, 1.1));
  for (let y = 1.4 * sz; y < Ht; y += rr(0.38, 0.55) * sz) {
    const f = y / Ht; const L = baseR * Math.pow(1 - f, 0.95) + 0.35; const nb = Math.max(4, Math.round(5 + L * 1.5));
    for (let b = 0; b < nb; b++) {
      const az = b / nb * 6.283 + rr(-0.3, 0.3) + y * 1.7; const droop = rr(0.12, 0.38) + f * 0.1;
      for (const roll of [rr(-0.25, 0.25), Math.PI / 2 + rr(-0.3, 0.3)]) {
        _e.set(roll, -az, -droop, 'YZX'); _q.setFromEuler(_e); _s.set(L * rr(0.9, 1.1), L * 0.62, 1); _p.set(0, y0 + y, 0); _m.compose(_p, _q, _s);
        const op = 0.45 + 0.55 * Math.min(1, L / baseR + 0.2); const c = tint.clone().multiplyScalar(op * rr(0.8, 1.15));
        addCard(LV, SPRAY_G, _m, _w.set(0, y0 + y - 0.8, 0), null, c);
      }
    }
  }
  const trunk = toGeo(TR, false), leaves = toGeo(LV, true);
  return { trunk, leaves, needle: true, H: Ht, tris: (TR.idx.length + LV.idx.length) / 3, cards: LV.idx.length / 12 };
}
/** 原型：每种 2 个变体（不同种子 / 尺寸），全图共用 */
const PROTO_CACHE = new Map<string, Proto>();
export function demoProto(kind: DemoKind, v: number, leafK: number): Proto {
  const key = kind + v + '|' + leafK; const hit = PROTO_CACHE.get(key); if (hit) return hit;
  const rnd = lcg(777123 + v * 9173 + kind.length * 131 + (kind === 'gold' ? 7 : 0));
  const p = kind === 'conifer' ? conifer(v ? 1.1 : 0.9, rnd) : broadleaf(SP[kind], kind === 'yg' ? (v ? 1.0 : 0.9) : (v ? 1.2 : 1.0), leafK, rnd);
  PROTO_CACHE.set(key, p); return p;
}

// ---------------------------------------------------------------- 材质补丁（Demo patchMat 的 wind / sph / trans / bark + depthMat；雾走游戏 cine fog）
/** 主相机位置（叶颤 25→70 m 渐隐用；深度材质里 cameraPosition 是阴影相机，见专长第 50 步） */
const DT_CAM = { value: new THREE.Vector3() };
const DT_T = { value: CU.fog2 };   // 一股风：时间 = cine 共享时钟（cineFog2.z）
const V_COMMON = /* glsl */ `
uniform vec4 dtTW; uniform vec3 dtCam; attribute vec3 aCC; attribute vec3 aSph; varying vec3 vDWP;
float dtH(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float dtVn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dtH(i),dtH(i+vec2(1,0)),f.x),mix(dtH(i+vec2(0,1)),dtH(i+1.),f.x),f.y);}
const vec2 DT_WDIR=vec2(0.894,0.447);
float dtGust(vec2 p){float t=dtTW.z;vec2 q=p-DT_WDIR*t*3.2;float g=dtVn(q*.03)*.6+dtVn(q*.11+7.)*.4;
 float roll=sin(dot(p,DT_WDIR)*.45-t*2.2+dtVn(p*.06)*5.)*.5+.5;return clamp(g*.8+roll*g*.45-.15,0.,1.);}
`;
const F_COMMON = /* glsl */ `varying vec3 vDWP;
float dtHf(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float dtVnf(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dtHf(i),dtHf(i+vec2(1,0)),f.x),mix(dtHf(i+vec2(0,1)),dtHf(i+1.),f.x),f.y);}
`;
const WIND = {
  leaf: `vec3 cl=IM*aCC;vec3 cw=ip+cl;float g=dtGust(cw.xz*.5);float hy=max(cl.y,0.)/10.;float ph=dtVn(cw.xz*.12)*6.283;
    D.xz+=DT_WDIR*(g*.22+sin(t*.8+ph)*.07)*hy*hy;float lp=dtH(cw.xz*13.1+cw.y)*6.283;
    float fl=(.25+g)*.04*smoothstep(70.,25.,distance(cw,dtCam));vec3 wo=IM*(transformed-aCC);
    D+=vec3(sin(t*5.3+lp),sin(t*6.7+lp*1.3),cos(t*4.9+lp))*fl*min(length(wo),1.);`,
  trunk: `vec3 wl=IM*transformed;vec3 wp0=ip+wl;float g=dtGust(wp0.xz*.5);float hy=max(wl.y,0.)/10.;float ph=dtVn(wp0.xz*.12)*6.283;
    D.xz+=DT_WDIR*(g*.22+sin(t*.8+ph)*.07)*hy*hy;`,
};
interface PO { wind: 'leaf' | 'trunk'; trans?: number; sph?: number; bark?: boolean; depth?: boolean }
function rep(src: string, needle: string, rp: string, key: string) { if (!src.includes(needle)) { console.warn('patch miss', 'demotree.' + key); return src; } return src.replace(needle, rp); }
const NOFLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
function patchMat<T extends THREE.Material>(m: T, o: PO): T {
  const key = 'dtree' + JSON.stringify(o);
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = s => {
    s.uniforms.dtTW = DT_T; s.uniforms.dtCam = DT_CAM;
    let v = V_COMMON + s.vertexShader, f = s.fragmentShader;
    if (!o.depth && o.sph) v = rep(v, '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      #ifdef USE_INSTANCING
      {mat3 IMn=mat3(instanceMatrix);vec3 wc=normalize(IMn*objectNormal);vec3 ws=normalize((IMn*aSph)*vec3(1.,1.45,1.));
       objectNormal=transpose(IMn)*normalize(mix(wc,ws,${o.sph.toFixed(2)}));}
      #endif`, 'sph');
    v = rep(v, '#include <begin_vertex>', `#include <begin_vertex>
      {
      #ifdef USE_INSTANCING
       mat3 IM=mat3(modelMatrix)*mat3(instanceMatrix);vec3 ip=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz;
      #else
       mat3 IM=mat3(modelMatrix);vec3 ip=modelMatrix[3].xyz;
      #endif
       float t=dtTW.z;vec3 isc=vec3(dot(IM[0],IM[0]),dot(IM[1],IM[1]),dot(IM[2],IM[2]));vec3 D=vec3(0.);
       ${WIND[o.wind]}
       transformed+=transpose(IM)*D/isc;
       vDWP=ip+IM*transformed;
      }`, 'wind');
    if (!o.depth) {
      f = F_COMMON + f;
      if (o.sph) f = rep(f, '#include <normal_fragment_begin>', NOFLIP, 'noflip');
      if (o.trans) f = rep(f, '#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS>0
        {vec3 Ld=directLight.direction;float bk=max(-dot(geometryNormal,Ld),0.);float fw=pow(max(dot(-geometryViewDir,Ld),0.),4.);
         vec3 tc=material.diffuseColor*vec3(1.15,1.,.55)+vec3(.10,.07,.0);
         reflectedLight.directDiffuse+=directLight.color*tc*RECIPROCAL_PI*${o.trans.toFixed(2)}*(bk*1.25+fw*3.4);}
        #endif`, 'trans');
      if (o.bark) f = rep(f, '#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb*=.55+.8*dtVnf(vec2((vDWP.x+vDWP.z)*9.,vDWP.y*1.3))*dtVnf(vec2((vDWP.x-vDWP.z)*4.,vDWP.y*3.));`, 'bark');
    }
    s.vertexShader = v; s.fragmentShader = f;
  };
  return m;
}
function depthMat(map: THREE.Texture | null, wind: 'leaf' | 'trunk', alpha: number) {
  return patchMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: map ? alpha : 0, side: THREE.DoubleSide }), { wind, depth: true });
}
/** 材质按调色板缓存：树干（Demo MeshStandard 0.92 + trunk 风 + 树皮）、叶卡（Demo MeshPhysical 0.9 / specularIntensity 0.2，trans 1.0 / sph 0.86，alphaTest 0.45）、
 *  针叶枝片（trans 0.45 / sph 0.55，alphaTest 0.42） */
const MATS = new Map<string, { m: THREE.Material; d: THREE.Material }>();
function mats(kind: 'trunk' | 'leaf' | 'spray', pal: DemoPal) {
  const k = kind + (kind === 'leaf' ? pal : ''); const hit = MATS.get(k); if (hit) return hit;
  let r: { m: THREE.Material; d: THREE.Material };
  if (kind === 'trunk') r = { m: patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), { wind: 'trunk', bark: true }), d: depthMat(null, 'trunk', 0) };
  else {
    const map = kind === 'leaf' ? leafAtlas(pal) : sprayTex(), a = kind === 'leaf' ? 0.45 : 0.42;
    r = { m: patchMat(new THREE.MeshPhysicalMaterial({ map, alphaTest: a, side: THREE.DoubleSide, roughness: 0.9, specularIntensity: 0.2, vertexColors: true }),
      kind === 'leaf' ? { wind: 'leaf', trans: 1.0, sph: 0.86 } : { wind: 'leaf', trans: 0.45, sph: 0.55 }), d: depthMat(map, 'leaf', a) };
  }
  r.m.userData.outlineParameters = { visible: false }; r.m.userData.demoTree = kind;
  cineSpecClass(r.m, kind === 'trunk' ? 'bark' : 'leaf');   // 11-19 specclass：Demo 户外区叶 0.18 / 树皮 0.45
  MATS.set(k, r); return r;
}
/** 已建的 Demo 树材质（镜面纪律等后续补丁按类别打标用） */
export function demoTreeMaterials() { return [...MATS.entries()].map(([k, v]) => ({ kind: k.startsWith('trunk') ? 'bark' : 'leaf', m: v.m })); }

// ---------------------------------------------------------------- 建网格
export interface DemoTreePlace { x: number; y: number; z: number; kind: DemoKind; v: number; s: number; ry: number }
export interface DemoTreeStats { trees: number; protos: number; draws: number; shadowDraws: number; tris: number; perKind: Record<string, number> }
/** places 按（树种, 变体）分组，每组树干 / 叶卡各一个 InstancedMesh */
export function buildDemoTrees(places: DemoTreePlace[], pal: DemoPal, leafK: number): { group: THREE.Group; stats: DemoTreeStats } {
  const group = new THREE.Group(); group.name = 'demo_trees'; group.userData.noBake = true;
  const by = new Map<string, DemoTreePlace[]>();
  for (const p of places) { const k = p.kind + p.v; let l = by.get(k); if (!l) by.set(k, l = []); l.push(p); }
  const st: DemoTreeStats = { trees: places.length, protos: by.size, draws: 0, shadowDraws: 0, tris: 0, perKind: {} };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color();
  for (const list of by.values()) {
    const { kind, v } = list[0], pr = demoProto(kind, v, leafK);
    const parts: [THREE.BufferGeometry, { m: THREE.Material; d: THREE.Material }, string][] = [[pr.trunk, mats('trunk', pal), 'trunk'], [pr.leaves, mats(pr.needle ? 'spray' : 'leaf', pal), 'leaves']];
    for (const [geo, mt, nm] of parts) {
      const im = new THREE.InstancedMesh(geo, mt.m, list.length); im.name = 'demotree_' + nm + '_' + kind + v;
      list.forEach((p, i) => {
        q.setFromAxisAngle(UP, p.ry); ps.set(p.x, p.y, p.z); sc.setScalar(p.s); im.setMatrixAt(i, m4.compose(ps, q, sc));
        const h = hash(p.x * 0.37, p.z * 0.53); im.setColorAt(i, c.setScalar(0.9 + 0.2 * h));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.customDepthMaterial = mt.d; im.castShadow = true; im.receiveShadow = true;
      im.userData.noBake = true; im.userData.noCamBlock = true; im.userData.outlineParameters = { visible: false };
      im.onBeforeRender = (_r, _s, cam) => { DT_CAM.value.copy(cam.position); };
      group.add(im); st.draws++; st.shadowDraws++;
    }
    st.tris += pr.tris * list.length; st.perKind[kind + v] = list.length;
  }
  return { group, stats: st };
}
