// ======================================================================
// DLC1 沉钟海岸 · 11-19 巡航船 v2（Rhett「沉钟海岸的船设计好点吧，现在连帆都没了」「我说的是海上走的」）
//   程序化双桅横帆船，无外部贴图（木板 / 帆布 / 旗用 canvas 程序贴图），合并几何：
//   ① 船体木作（船壳木板纹 + 吃水线红底 / 黑腰带 / 护舷 / 顶缘、甲板、舷墙顶栏、船尾楼栏杆、艏楼栏杆、船首斜材、舱口、尾灯柱）
//   ② 桅杆 / 桅顶平台 / 帆桁 / 艏斜桅 / 桅顶球
//   ③ 帆：主桅 3 面 + 前桅 2 面横帆（鼓风、缝线 / 补丁 / 收帆点帆布贴图）+ 艏三角帆 + 前支索帆，CPU 轻摆（镜头 300 m 内）
//   ④ 索具 LineSegments（侧支索 + 绳梯横索、前后支索、帆桁吊索、转帆索、帆脚索）
//   ⑤ 旗 + 长三角信号旗（CPU 飘动）  ⑥ 尾灯 + 船尾窗暖光
//   共 6 次绘制。局部坐标与 v1 一致：原点 = 船尾水线中点，+Z 朝船头，长 16 m。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flagDemoOn, flagDemoDisp, flagDemoGust, flagWind, flagSkinOn } from '../../web/field_flags';   // 11-19 船旗换秋林逆光 Demo 摆动（?off=flagdemo 回旧）

const L = 16, B = 4.8, WL = 0.4;   // 船长、船宽、吃水线（局部 y；船体整体下沉 0.35 后约在海面）
const BRACE = 0.2;                 // 横帆转帆角（绕桅）

// ---------------------------------------------------------------- 程序贴图
function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); return x ? [c, x] : null;
}
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t;
}
/** 木板：横向 8 列板（v 方向），每板错缝对接、木纹、钉眼。灰白底（颜色由顶点色给） */
function plankTex(): THREE.Texture | null {
  const k = cv(512, 256); if (!k) return null; const [c, x] = k, R = rng(7);
  x.fillStyle = '#d8d0c4'; x.fillRect(0, 0, 512, 256);
  const rows = 8, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh, off = R() * 512;
    for (let seg = -1; seg < 3; seg++) {
      const x0 = off + seg * 256 - 512 * Math.floor((off + seg * 256) / 512), tone = 200 + Math.floor(R() * 40);
      x.fillStyle = `rgb(${tone},${tone - 8},${tone - 20})`; x.fillRect(x0, y0, 256, rh); if (x0 + 256 > 512) x.fillRect(x0 - 512, y0, 256, rh);
      // 木纹
      x.strokeStyle = 'rgba(90,70,50,0.18)'; x.lineWidth = 1;
      for (let g = 0; g < 6; g++) { const gy = y0 + 3 + R() * (rh - 6); x.beginPath(); for (let px = 0; px <= 256; px += 16) { const xx = x0 + px, yy = gy + Math.sin(px * 0.03 + g) * 1.2; px ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.stroke(); }
      // 对接缝 + 钉眼
      x.fillStyle = 'rgba(40,28,18,0.75)'; const jx = (x0 + 256) % 512; x.fillRect(jx - 1, y0, 2, rh);
      x.fillStyle = 'rgba(30,22,14,0.6)'; x.fillRect(jx - 6, y0 + 5, 2, 2); x.fillRect(jx - 6, y0 + rh - 7, 2, 2); x.fillRect(jx + 4, y0 + 5, 2, 2); x.fillRect(jx + 4, y0 + rh - 7, 2, 2);
    }
    x.fillStyle = 'rgba(25,18,12,0.85)'; x.fillRect(0, y0, 512, 2);   // 板缝（填缝沥青）
  }
  return tex(c);
}
/** 帆布：竖向布幅缝线、顶部加强带、两排收帆点、帆边绳、几块补丁 + 缝线、下部风化 */
function sailTex(): THREE.Texture | null {
  const k = cv(512, 512); if (!k) return null; const [c, x] = k, R = rng(23);
  x.fillStyle = '#efe6d0'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) { const a = R() * 0.05; x.fillStyle = R() < 0.5 ? `rgba(120,100,70,${a})` : `rgba(255,250,235,${a})`; x.fillRect(R() * 512, R() * 512, 1 + R() * 3, 1 + R() * 3); }
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(110,90,60,0)'); g.addColorStop(0.75, 'rgba(110,90,60,0.06)'); g.addColorStop(1, 'rgba(90,70,45,0.22)'); x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // 布幅（每 ~46 px 一幅，双缝线）
  for (let px = 23; px < 512; px += 46) { x.fillStyle = 'rgba(120,100,72,0.35)'; x.fillRect(px, 0, 2, 512); x.fillStyle = 'rgba(120,100,72,0.18)'; x.fillRect(px + 5, 0, 1, 512); }
  // 顶部加强带 + 两排收帆点
  x.fillStyle = 'rgba(150,128,92,0.35)'; x.fillRect(0, 0, 512, 22);
  for (const ry of [92, 170]) { x.fillStyle = 'rgba(130,110,80,0.28)'; x.fillRect(0, ry - 5, 512, 10); x.fillStyle = 'rgba(70,55,38,0.8)'; for (let px = 12; px < 512; px += 26) { x.beginPath(); x.arc(px, ry, 2.2, 0, 7); x.fill(); } }
  // 补丁（略深 / 略黄的方块 + 虚线缝）
  for (const [px, py, w, h, col] of [[300, 260, 70, 56, 'rgba(196,176,138,0.55)'], [90, 360, 54, 64, 'rgba(210,196,160,0.6)'], [400, 410, 46, 40, 'rgba(180,160,120,0.5)'], [180, 220, 38, 30, 'rgba(225,214,186,0.7)']] as const) {
    x.fillStyle = col; x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(90,70,48,0.7)'; x.lineWidth = 1.2; x.setLineDash([4, 3]); x.strokeRect(px + 3, py + 3, w - 6, h - 6); x.setLineDash([]);
  }
  // 帆边绳
  x.fillStyle = 'rgba(95,78,55,0.7)'; x.fillRect(0, 0, 512, 4); x.fillRect(0, 508, 512, 4); x.fillRect(0, 0, 4, 512); x.fillRect(508, 0, 4, 512);
  return tex(c);
}
/** 旗：深红底 + 金色钟纹（上 3/4），最下一条纯红给长三角旗用 */
function flagTex(): THREE.Texture | null {
  const k = cv(256, 192); if (!k) return null; const [c, x] = k;
  x.fillStyle = '#7a1414'; x.fillRect(0, 0, 256, 192);
  x.fillStyle = '#5a0c0c'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 134, 256, 10);
  x.fillStyle = '#d8a640'; x.beginPath(); x.moveTo(108, 38); x.quadraticCurveTo(128, 26, 148, 38); x.lineTo(156, 100); x.lineTo(100, 100); x.closePath(); x.fill();
  x.fillRect(94, 100, 68, 7); x.beginPath(); x.arc(128, 114, 7, 0, 7); x.fill(); x.fillRect(125, 22, 6, 10);
  x.fillStyle = '#8a1a16'; x.fillRect(0, 150, 256, 42);
  return tex(c);
}

/** 11-19 flagskin：船旗按秋林逆光 bannerTex 画法重画（?off=flagskin 回旧）。版式不变：上 3/4（0–144 px）主旗、150–192 px 长三角旗；
 *  u = 离桅距离（x = 0 靠桅）。主旗：深红底 + Demo 纤维、靠桅套边缝线、上下滚边、金边、圆环 + 金钟、晒褪 / 下摆污渍、金线磨损、自由端毛边 + 小破洞；
 *  长三角旗：红底纤维 + 金中线 + 自由端毛边。毛边 / 破洞要 alphaTest */
function flagTexSkin(): THREE.Texture | null {
  const k = cv(256, 192); if (!k) return null; const [c, x] = k, R = rng(41);
  x.fillStyle = '#7a1414'; x.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 1500; i++) { x.fillStyle = R() < 0.5 ? 'rgba(40,0,0,0.07)' : 'rgba(170,30,20,0.07)'; x.fillRect(R() * 256, R() * 192, 2, 4 + R() * 10); }   // Demo 纤维
  for (let y = 0; y < 192; y += 3) { x.fillStyle = 'rgba(0,0,0,0.03)'; x.fillRect(0, y, 256, 1); }
  x.fillStyle = '#4e0a0a'; x.fillRect(0, 0, 10, 144); x.fillRect(0, 0, 256, 7); x.fillRect(0, 137, 256, 7);   // 套边 + 上下滚边
  x.strokeStyle = 'rgba(255,230,180,0.35)'; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(12.5, 0); x.lineTo(12.5, 144); x.moveTo(0, 9.5); x.lineTo(256, 9.5); x.moveTo(0, 134.5); x.lineTo(256, 134.5); x.stroke(); x.setLineDash([]);
  x.strokeStyle = '#d6a640'; x.lineWidth = 6; x.lineJoin = 'round'; x.strokeRect(20, 17, 256 - 20 - 26, 144 - 34);   // 金边
  x.strokeStyle = '#e4b24a'; x.lineWidth = 6; x.beginPath(); x.arc(122, 72, 40, 0, Math.PI * 2); x.stroke();   // 圆环
  x.fillStyle = '#e4b24a'; x.beginPath(); x.moveTo(107, 87); x.quadraticCurveTo(107, 51, 122, 49); x.quadraticCurveTo(137, 51, 137, 87); x.closePath(); x.fill();   // 金钟
  x.fillRect(103, 86, 38, 5); x.beginPath(); x.arc(122, 95, 4.5, 0, 7); x.fill(); x.fillRect(120, 44, 4, 6);
  // 长三角旗条（v 0.02–0.2 → 154–188 px）：金中线
  x.fillStyle = '#8a1a16'; x.fillRect(0, 150, 256, 42);
  for (let i = 0; i < 400; i++) { x.fillStyle = R() < 0.5 ? 'rgba(40,0,0,0.07)' : 'rgba(170,30,20,0.07)'; x.fillRect(R() * 256, 150 + R() * 42, 2, 3 + R() * 6); }
  x.fillStyle = '#d6a640'; x.fillRect(0, 168, 256, 5);
  for (let i = 0; i < 1100; i++) { x.fillStyle = R() < 0.5 ? 'rgba(122,20,20,0.45)' : 'rgba(100,16,16,0.45)'; x.fillRect(R() * 256, R() * 192, 1 + R() * 2, 1 + R() * 2); }   // 金线磨损
  const fa = x.createLinearGradient(0, 0, 256, 0); fa.addColorStop(0, 'rgba(238,220,190,0)'); fa.addColorStop(0.5, 'rgba(238,220,190,0.05)'); fa.addColorStop(1, 'rgba(238,220,190,0.2)'); x.fillStyle = fa; x.fillRect(0, 0, 256, 192);   // 自由端晒褪
  const gr = x.createLinearGradient(0, 100, 0, 144); gr.addColorStop(0, 'rgba(40,25,15,0)'); gr.addColorStop(1, 'rgba(40,25,15,0.22)'); x.fillStyle = gr; x.fillRect(0, 100, 256, 44);   // 下摆污渍
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
  const nick = (px: number, py: number, r: number) => { x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); };
  for (let y = 2; y < 142; y += 6) if (R() < 0.6) nick(256, y, 2 + R() * 4);   // 主旗自由端毛边
  for (let px = 150; px < 254; px += 8) if (R() < 0.45) nick(px, 144, 1 + R() * 2.5);   // 下摆毛边（只在后半段）
  nick(212, 112, 3); nick(226, 30, 2.2);   // 小破洞
  for (let y = 152; y < 190; y += 5) if (R() < 0.6) nick(256, y, 2 + R() * 4);   // 长三角旗尖毛边
  x.globalCompositeOperation = 'source-over';
  return tex(c);
}

// ---------------------------------------------------------------- 几何工具
type G = THREE.BufferGeometry;
/** 统一成非索引 + position/normal/uv/color 四个属性，再合并 */
function norm(g: G, color: THREE.ColorRepresentation | null, m?: THREE.Matrix4, uvScale = 1): G {
  let o = g.index ? g.toNonIndexed() : g;
  if (m) o.applyMatrix4(m);
  if (!o.getAttribute('normal')) o.computeVertexNormals();
  const n = o.getAttribute('position').count;
  if (!o.getAttribute('uv')) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  else if (uvScale !== 1) { const u = o.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * uvScale, u.getY(i) * uvScale); }
  if (color !== null || !o.getAttribute('color')) { const c = new THREE.Color(color ?? 0xffffff), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } o.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); }
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k);
  o.morphAttributes = {};
  return o;
}
const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
/** 两点间的圆柱（杆 / 栏杆） */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg: number, color: THREE.ColorRepresentation): G {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return norm(g, color, new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1)));
}
const box = (w: number, h: number, d: number, m: THREE.Matrix4, color: THREE.ColorRepresentation) => norm(new THREE.BoxGeometry(w, h, d), color, m);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 船体线型
/** 半宽（u = 0 船尾 → 1 船头） */
const hbAt = (u: number) => B * 0.5 * Math.max(0.02, u < 0.45 ? 0.8 + 0.2 * Math.sin(Math.PI / 2 * u / 0.45) : Math.sqrt(Math.max(0, 1 - ((u - 0.45) / 0.55) ** 2)));
/** 舷缘高：中部 1.8，两端舷弧上翘；船尾楼（u < 0.215）+1.0、艏楼（u > 0.85）+0.55 */
const sheerAt = (u: number) => 1.8 + 0.7 * ((u - 0.5) / 0.5) ** 2 + 1.0 * (1 - smooth(0.205, 0.22, u)) + 0.55 * smooth(0.845, 0.86, u);
/** 甲板高（舷缘下 0.85 = 舷墙高） */
const deckAt = (u: number) => sheerAt(u) - 0.85;
/** 龙骨深：船头往上收成艏柱 */
const keelAt = (u: number) => -1.35 + (u > 0.78 ? 1.25 * ((u - 0.78) / 0.22) ** 1.6 : 0) + (u < 0.06 ? 0.25 * (1 - u / 0.06) : 0);
/** 一个横剖面：左舷舷缘 → 龙骨 → 右舷舷缘；返回 [x, y, 弧长]，以及每个点的颜色类别 */
function section(u: number): { p: [number, number][]; c: number[] } {
  const hb = hbAt(u), dh = sheerAt(u), kd = keelAt(u), yb = 0.25;
  const side: [number, number, number][] = [];   // [x, y, 颜色类别] 从舷缘往下
  // 颜色类别：0 顶缘 1 船壳木 2 护舷带 3 黑腰带 4 水下红底
  const ys: [number, number][] = [[dh, 0], [dh - 0.1, 1], [dh - 0.62, 1], [dh - 0.64, 2], [dh - 0.86, 2], [dh - 0.88, 1], [WL + 0.2, 1], [WL + 0.18, 3], [WL, 3], [WL - 0.02, 4]];
  for (const [y, k] of ys) side.push([hb * (1 - 0.06 * Math.max(0, (y - yb) / (dh - yb))), y, k]);
  for (const s of [0.12, 0.27, 0.44, 0.6, 0.75, 0.88, 0.96]) { const y = yb - s * (yb - kd); side.push([hb * Math.sqrt(Math.max(0, 1 - s ** 2.2)) , y, 4]); }
  const p: [number, number][] = [], c: number[] = [];
  for (const [x, y, k] of side) { p.push([-x, y]); c.push(k); }
  p.push([0, kd]); c.push(4);
  for (let i = side.length - 1; i >= 0; i--) { p.push([side[i][0], side[i][1]]); c.push(side[i][2]); }
  return { p, c };
}
const HULL_COL = [0xb08a50, 0x6e4b2e, 0x2e2016, 0x161210, 0x6a2c1e].map(h => new THREE.Color(h));

function uSamples(): number[] {
  const s = new Set<number>(); for (let i = 0; i <= 52; i++) s.add(+(i / 52).toFixed(4));
  for (const v of [0.2, 0.205, 0.2125, 0.22, 0.226, 0.84, 0.845, 0.8525, 0.86, 0.866]) s.add(v);
  return [...s].sort((a, b) => a - b);
}
function hullGeo(): G {
  const US = uSamples(), pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  let NV = 0;
  for (const u of US) {
    const { p, c } = section(u); NV = p.length; let arc = 0;
    for (let j = 0; j < p.length; j++) {
      if (j) arc += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]);
      pos.push(p[j][0], p[j][1], u * L); const k = HULL_COL[c[j]]; col.push(k.r, k.g, k.b); uv.push(u * L / 4, arc / 1.8);
    }
  }
  for (let i = 0; i < US.length - 1; i++) for (let j = 0; j < NV - 1; j++) { const a = i * NV + j, b = a + NV; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return norm(g, null);
}
/** 船尾板（扇形填满剖面，略后倾） */
function transomGeo(): G {
  const { p } = section(0), cy = (sheerAt(0) + keelAt(0)) * 0.5, pos: number[] = [], uv: number[] = [];
  for (let j = 0; j < p.length - 1; j++) for (const [x, y] of [[0, cy], p[j + 1], p[j]] as [number, number][]) { pos.push(x, y, -0.12 * (y - WL) / 2); uv.push(x / 1.8, y / 1.8); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return norm(g, 0x5a3c24);
}
/** 甲板（木板纹沿船长；横向 4 段，中拱 3 cm） */
function deckGeo(): G {
  const US = uSamples(), pos: number[] = [], uv: number[] = [], idx: number[] = [], NX = 4;
  for (const u of US) { const hw = hbAt(u) * 0.95, y = deckAt(u); for (let j = 0; j <= NX; j++) { const t = j / NX * 2 - 1; pos.push(t * hw, y + 0.03 * (1 - t * t), u * L); uv.push(u * L / 4, (t * hw + 3) / 1.6); } }
  for (let i = 0; i < US.length - 1; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + NX + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return norm(g, 0xa58460);
}
/** 舷墙顶栏（舷缘上一条 18 cm 宽的平板，两舷） */
function capRailGeo(): G {
  const US = uSamples(), pos: number[] = [], idx: number[] = [];
  for (const sgn of [-1, 1]) { const b0 = pos.length / 3; for (const u of US) { const hb = hbAt(u), y = sheerAt(u) + 0.03; pos.push(sgn * (hb - 0.12), y, u * L, sgn * (hb + 0.06), y, u * L); }
    for (let i = 0; i < US.length - 1; i++) { const a = b0 + i * 2, b = a + 2; if (sgn > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, a + 1, b, b + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return norm(g, 0x8a6a40);
}

// ---------------------------------------------------------------- 桅 / 帆布局
type Yard = { y: number; w: number };
type Mast = { z: number; top: number; capY: number; topmast: number; tgTop: number; yards: Yard[] };
const MAIN: Mast = { z: L * 0.42, top: 10.2, capY: 10.5, topmast: 15.4, tgTop: 18.2, yards: [{ y: 9.6, w: 9.4 }, { y: 14.4, w: 7.0 }, { y: 17.3, w: 4.8 }] };
const FORE: Mast = { z: L * 0.69, top: 9.3, capY: 9.6, topmast: 14.0, tgTop: 15.6, yards: [{ y: 8.8, w: 8.4 }, { y: 13.2, w: 6.2 }] };
const BS_A = new THREE.Vector3(0, deckAt(0.95) + 0.25, L * 0.93), BS_DIR = new THREE.Vector3(0, Math.sin(0.3), Math.cos(0.3)), BS_LEN = 8.2;
const BS_TIP = BS_A.clone().addScaledVector(BS_DIR, BS_LEN);
/** 桅上局部点（转帆后）：yard 端点 */
const yardEnd = (m: Mast, y: number, x: number) => new THREE.Vector3(x * Math.cos(BRACE), y, m.z - x * Math.sin(BRACE));

function sparsGeo(): G[] {
  const out: G[] = [], C = 0x3d2b1c, Cd = 0x2a1d13, Cy = 0x4a3524;
  for (const m of [MAIN, FORE]) {
    const u = m.z / L, d = deckAt(u);
    out.push(rod(new THREE.Vector3(0, d - 0.2, m.z), new THREE.Vector3(0, m.capY, m.z), 0.24, 0.18, 10, C));                 // 下桅
    out.push(norm(new THREE.CylinderGeometry(0.85, 0.75, 0.14, 12), Cd, M4(0, m.top, m.z)));                               // 桅顶平台
    out.push(box(0.5, 0.36, 0.5, M4(0, m.capY, m.z), Cd));                                                                   // 桅帽
    out.push(rod(new THREE.Vector3(0, m.top - 0.6, m.z - 0.3), new THREE.Vector3(0, m.topmast, m.z - 0.3), 0.15, 0.11, 8, C));   // 上桅
    out.push(rod(new THREE.Vector3(0, m.topmast - 0.7, m.z - 0.3), new THREE.Vector3(0, m.tgTop, m.z - 0.3), 0.08, 0.055, 6, C)); // 顶桅
    out.push(norm(new THREE.SphereGeometry(0.16, 8, 6), 0xb89050, M4(0, m.tgTop + 0.1, m.z - 0.3)));                         // 桅顶球
    out.push(norm(new THREE.CylinderGeometry(0.5, 0.45, 0.08, 10), Cd, M4(0, m.topmast - 0.2, m.z - 0.3)));                  // 上桅顶横桁
    for (const yd of m.yards) { const zc = yd.y > m.capY ? m.z - 0.3 : m.z; const a = yardEnd(m, yd.y + 0.1, -yd.w / 2 - 0.4), b = yardEnd(m, yd.y + 0.1, yd.w / 2 + 0.4); a.z += zc - m.z + 0.25; b.z += zc - m.z + 0.25;
      const mid = a.clone().lerp(b, 0.5); out.push(rod(a, mid, 0.06, 0.12, 6, Cy), rod(mid, b, 0.12, 0.06, 6, Cy)); }
  }
  out.push(rod(BS_A, BS_TIP, 0.2, 0.09, 8, C));                                                                                 // 艏斜桅
  out.push(rod(BS_A.clone().addScaledVector(BS_DIR, 3.2), new THREE.Vector3(0, 0.6, L + 1.0), 0.05, 0.05, 4, Cd));             // 斜桅下拉杆
  return out;
}

// ---------------------------------------------------------------- 帆（CPU 摆动用：基础位置 + 位移方向 × 幅度）
type SailBuf = { base: Float32Array; dir: Float32Array; amp: Float32Array; edge: Float32Array; ph: Float32Array; yy: Float32Array };
function squareSail(m: Mast, top: Yard, footY: number, footW: number, uOff: number, sb: number[][]): G {
  const NX = 10, NY = 10, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const zc = top.y > m.capY - 0.5 ? m.z - 0.3 : m.z, fw = new THREE.Vector3(Math.sin(BRACE), 0, Math.cos(BRACE));
  const belly = 0.11 * top.w, ph = m.z * 0.7 + top.y * 0.3;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const xx = i / NX, yy = j / NY, w = footW + (top.w - footW) * yy, y = footY + (top.y - footY) * yy, x = (xx - 0.5) * w;
    const p = yardEnd(m, y, x); p.z += zc - m.z + 0.42;
    pos.push(p.x, p.y, p.z); uv.push(xx + uOff, yy);
    const a = belly * (0.18 + 0.82 * Math.sin(Math.PI * xx)) * Math.sin(Math.PI * Math.min(1, (1 - yy) * 0.9)), e = belly * 0.12 * Math.max(Math.abs(xx - 0.5) * 2, 1 - yy) ** 3;
    sb.push([p.x, p.y, p.z, fw.x, 0, fw.z, a, e, ph, yy]);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
/** 三角帆：A 帆前角（tack）、H 帆顶、C 帆后角（clew）；鼓向 +x（下风舷） */
function triSail(A: THREE.Vector3, H: THREE.Vector3, C: THREE.Vector3, belly: number, uOff: number, sb: number[][]): G {
  const N = 10, pos: number[] = [], uv: number[] = [], idx: number[] = [], ph = A.z * 0.5;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const a = j / N, b = i / N, p = A.clone().addScaledVector(new THREE.Vector3().subVectors(H, A), a).addScaledVector(new THREE.Vector3().subVectors(C, A), b * (1 - a));
    pos.push(p.x, p.y, p.z); uv.push(b * 0.6 + uOff, a);
    const amp = belly * Math.sin(Math.PI * Math.min(1, b * 0.8 + 0.1)) * Math.sin(Math.PI * Math.min(1, 0.15 + a * 0.85)) * (1 - a * 0.4), e = belly * 0.15 * b ** 3 * (1 - a);
    sb.push([p.x, p.y, p.z, 1, 0, 0, amp, e, ph, a]);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const JIB = { A: BS_TIP.clone().add(new THREE.Vector3(0, -0.15, -0.2)), H: new THREE.Vector3(0, FORE.topmast - 0.8, FORE.z - 0.1), C: new THREE.Vector3(0, 3.9, L + 0.9) };
const STAY = { A: new THREE.Vector3(0, deckAt(0.97) + 0.5, L * 0.985), H: new THREE.Vector3(0, FORE.top - 0.4, FORE.z + 0.35), C: new THREE.Vector3(0, deckAt(0.8) + 1.1, FORE.z + 1.7) };

function sailsGeo(): { g: G; buf: SailBuf } {
  const sb: number[][] = [], parts: G[] = [];
  // 主桅：主帆 / 上桅帆 / 顶桅帆；前桅：前帆 / 前上桅帆（前帆脚离艏楼栏杆够高）
  parts.push(squareSail(MAIN, MAIN.yards[0], 3.7, 9.9, 0.0, sb));
  parts.push(squareSail(MAIN, MAIN.yards[1], MAIN.yards[0].y + 0.35, 9.0, 0.37, sb));
  parts.push(squareSail(MAIN, MAIN.yards[2], MAIN.yards[1].y + 0.35, 6.6, 0.71, sb));
  parts.push(squareSail(FORE, FORE.yards[0], 4.2, 8.8, 0.19, sb));
  parts.push(squareSail(FORE, FORE.yards[1], FORE.yards[0].y + 0.35, 8.0, 0.53, sb));
  parts.push(triSail(JIB.A, JIB.H, JIB.C, 0.55, 0.12, sb));
  parts.push(triSail(STAY.A, STAY.H, STAY.C, 0.4, 0.64, sb));
  const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
  const n = sb.length, buf: SailBuf = { base: new Float32Array(n * 3), dir: new Float32Array(n * 3), amp: new Float32Array(n), edge: new Float32Array(n), ph: new Float32Array(n), yy: new Float32Array(n) };
  sb.forEach((r, i) => { buf.base.set(r.slice(0, 3), i * 3); buf.dir.set(r.slice(3, 6), i * 3); buf.amp[i] = r[6]; buf.edge[i] = r[7]; buf.ph[i] = r[8]; buf.yy[i] = r[9]; });
  return { g, buf };
}
function deformSails(g: G, b: SailBuf, t: number, storm: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute, a = p.array as Float32Array, n = b.amp.length, gust = 1 + 0.25 * storm;
  for (let i = 0; i < n; i++) {
    const ph = b.ph[i], yy = b.yy[i];
    const k = (1 + 0.09 * Math.sin(t * 1.3 + ph) + 0.04 * Math.sin(t * 3.1 + ph * 1.7 + yy * 2.5)) * gust;
    const f = b.edge[i] * (1 + storm) * Math.sin(t * 7.0 + ph * 3 + yy * 9 + i * 0.13);
    const d = b.amp[i] * k + f;
    a[i * 3] = b.base[i * 3] + b.dir[i * 3] * d; a[i * 3 + 1] = b.base[i * 3 + 1]; a[i * 3 + 2] = b.base[i * 3 + 2] + b.dir[i * 3 + 2] * d;
  }
  p.needsUpdate = true; g.computeVertexNormals();
}

// ---------------------------------------------------------------- 索具
function riggingGeo(): G {
  const v: number[] = [], seg = (a: THREE.Vector3, b: THREE.Vector3) => v.push(a.x, a.y, a.z, b.x, b.y, b.z), V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const m of [MAIN, FORE]) {
    const u = m.z / L, hb = hbAt(u) + 0.05, sh = sheerAt(u);
    for (const s of [-1, 1]) {
      const feet = [-1.5, -0.8, -0.1].map(dz => V(s * (hbAt((m.z + dz) / L) + 0.05), sheerAt((m.z + dz) / L) - 0.15, m.z + dz)), head = V(s * 0.25, m.top - 0.1, m.z);
      for (const f of feet) seg(f, head);
      for (let r = 1; r <= 9; r++) { const t = r / 10; const pts = feet.map(f => f.clone().lerp(head, t)); seg(pts[0], pts[1]); seg(pts[1], pts[2]); }   // 绳梯横索
      const tmHead = V(s * 0.12, m.topmast - 0.3, m.z - 0.3);
      for (const dz of [-0.5, 0.3]) seg(V(s * 0.8, m.top + 0.05, m.z + dz), tmHead);                          // 上桅侧支索
      seg(V(s * hb, sh - 0.15, m.z - 2.6), V(s * 0.12, m.tgTop - 0.5, m.z - 0.3));                            // 后支索
      for (const yd of m.yards) {                                                                            // 吊索 + 转帆索 + 帆脚索
        const zc = yd.y > m.capY ? -0.05 : 0.25, e = yardEnd(m, yd.y + 0.1, s * (yd.w / 2 + 0.3)); e.z += zc;
        seg(e, V(0, yd.y + 1.5, m.z - (yd.y > m.capY ? 0.3 : 0)));
        const tgt = m === MAIN ? V(s * (hbAt(0.05) - 0.1), sheerAt(0.05) + 0.4, 0.8) : V(s * 0.3, MAIN.top - 1.0 + (yd.y - m.yards[0].y) * 0.6, MAIN.z + 0.2);
        seg(e, tgt);
      }
      const ft = yardEnd(m, m.yards[0].y - (m === MAIN ? 5.9 : 4.6), s * (m === MAIN ? 4.95 : 4.4)); ft.z += 0.42;   // 主帆 / 前帆帆脚角 → 舷边
      seg(ft, V(s * hbAt((m.z - 3) / L), sheerAt((m.z - 3) / L) + 0.05, m.z - 3));
    }
  }
  // 前后支索
  seg(V(0, MAIN.top + 0.1, MAIN.z + 0.2), V(0, deckAt(FORE.z / L) + 0.6, FORE.z - 0.3));
  seg(V(0, MAIN.topmast - 0.3, MAIN.z - 0.2), V(0, FORE.top + 0.2, FORE.z + 0.1));
  seg(V(0, MAIN.tgTop - 0.4, MAIN.z - 0.2), V(0, FORE.topmast - 0.2, FORE.z - 0.2));
  seg(V(0, FORE.top + 0.1, FORE.z + 0.2), STAY.A);                       // 前支索（前支索帆前缘）
  seg(V(0, FORE.topmast - 0.4, FORE.z - 0.2), BS_TIP);                    // 前上桅支索（艏三角帆前缘）
  seg(V(0, FORE.tgTop - 0.3, FORE.z - 0.3), BS_TIP);
  seg(BS_TIP, V(0, 0.5, L + 0.6));                                          // 艏斜桅下拉索
  for (const s of [-1, 1]) { seg(BS_TIP, V(s * hbAt(0.93), sheerAt(0.93), L * 0.93)); seg(JIB.C, V(s * hbAt(0.82), sheerAt(0.82), L * 0.82)); }   // 斜桅侧索 / 三角帆帆脚索
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g;
}

// ---------------------------------------------------------------- 旗
type FlagBuf = { base: Float32Array; w: Float32Array; x: Float32Array; hang: Float32Array; ph: Float32Array };
function flagGeo(): { g: G; buf: FlagBuf } {
  const parts: G[] = [], ws: number[] = [], xs: number[] = [], hs: number[] = [], phs: number[] = [];
  const mk = (x0: number, y0: number, z0: number, len: number, h: number, tri: boolean, v0: number, v1: number) => {
    const NX = 10, NY = 4, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const s = i / NX, t = j / NY, hh = tri ? h * (1 - s * 0.92) : h; pos.push(x0, y0 - (1 - t) * hh - (tri ? (h - hh) * 0.5 : 0), z0 + s * len); uv.push(s, v0 + (v1 - v0) * t); ws.push(s); xs.push(s * len); hs.push(y0 - pos[pos.length - 2]); phs.push(tri ? 1.7 : 0); }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + NX + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); parts.push(g);
  };
  mk(0, MAIN.tgTop + 0.05, MAIN.z - 0.25, 2.3, 1.45, false, 0.25, 1.0);   // 主旗（金钟），顺风飘向船头
  mk(0, FORE.tgTop + 0.05, FORE.z - 0.25, 3.4, 0.42, true, 0.02, 0.2);    // 前桅长三角信号旗
  const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
  return { g, buf: { base: Float32Array.from((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array), w: Float32Array.from(ws), x: Float32Array.from(xs), hang: Float32Array.from(hs), ph: Float32Array.from(phs) } };
}
/** 11-19 flagdemo：船旗换 field_flags 同一套秋林逆光 Demo 摆动（x = 离桅距离，hang = 离旗顶向下）。
 *  风向取船体局部 +Z（旗原本就飘向船头，与船的朝向无关，不随世界风向扭），侧向波在局部 x；
 *  阵风 g = Demo gustAt（船的世界位置、共享风场风向推进图样），风暴 storm 往上加 0.6·storm（上限 1） */
const _fd = new THREE.Vector3();
function waveFlagDemo(g: G, b: FlagBuf, t: number, storm: number, wx: number, wz: number) {
  const W = flagWind(), gst = Math.min(1, flagDemoGust(wx, wz, t, W.x, W.y) + 0.6 * storm);
  const p = g.getAttribute('position') as THREE.BufferAttribute, a = p.array as Float32Array, n = b.w.length;
  for (let i = 0; i < n; i++) {
    flagDemoDisp(b.x[i], b.hang[i], t, 0, 1, gst, _fd, 1, b.ph[i]);
    a[i * 3] = b.base[i * 3] + _fd.x; a[i * 3 + 1] = b.base[i * 3 + 1] + _fd.y; a[i * 3 + 2] = b.base[i * 3 + 2] + _fd.z;
  }
  p.needsUpdate = true; g.computeVertexNormals();
}
function waveFlag(g: G, b: FlagBuf, t: number, storm: number) {
  const p = g.getAttribute('position') as THREE.BufferAttribute, a = p.array as Float32Array, n = b.w.length, amp = 0.22 + 0.25 * storm, sp = 6 + 4 * storm;
  for (let i = 0; i < n; i++) { const s = b.w[i], z = b.base[i * 3 + 2], y = b.base[i * 3 + 1];
    a[i * 3] = b.base[i * 3] + amp * s * Math.sin(t * sp - z * 2.6 + y * 0.8); a[i * 3 + 1] = y - 0.12 * s * s; a[i * 3 + 2] = z - 0.05 * s * Math.abs(Math.sin(t * sp - z * 2.6)); }
  p.needsUpdate = true; g.computeVertexNormals();
}

// ---------------------------------------------------------------- 船体木作合并
function woodParts(): G[] {
  const out: G[] = [hullGeo(), transomGeo(), deckGeo(), capRailGeo()];
  const rail = 0x7a5a36, post = 0x5e4328;
  // 船尾楼、艏楼两舷栏杆（立柱 + 扶手）
  const sideRail = (u0: number, u1: number, n: number, h: number) => { for (const s of [-1, 1]) { const top: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n, x = s * (hbAt(u) - 0.03), y = sheerAt(u) + 0.04; out.push(box(0.09, h, 0.09, M4(x, y + h / 2, u * L), post)); top.push(new THREE.Vector3(x, y + h, u * L)); }
    for (let i = 0; i < n; i++) out.push(rod(top[i], top[i + 1], 0.05, 0.05, 4, rail)); } };
  sideRail(0.005, 0.2, 6, 0.75); sideRail(0.865, 0.965, 3, 0.55);
  // 船尾楼前缘横栏（带两段下甲板梯口）
  { const u = 0.2, y = deckAt(u) + 0.02, hb = hbAt(u) * 0.93, top: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) { const x = -hb + 2 * hb * i / 6; if (i === 1 || i === 5) { top.push(new THREE.Vector3(x, y + 0.85, u * L)); continue; } out.push(box(0.1, 0.85, 0.1, M4(x, y + 0.42, u * L), post)); top.push(new THREE.Vector3(x, y + 0.85, u * L)); }
    out.push(rod(top[0], top[6], 0.05, 0.05, 4, rail));
    out.push(box(2 * hb, 1.0, 0.12, M4(0, deckAt(0.23) + 0.5, 0.213 * L), 0x5a3c24));   // 船尾楼前壁（主甲板 → 船尾楼甲板的台阶）
    out.push(box(0.9, 0.7, 0.06, M4(0, deckAt(0.23) + 0.38, 0.213 * L + 0.07), 0x3a2618)); }   // 舱门
  { const u = 0.855; out.push(box(2 * hbAt(u) * 0.9, 0.6, 0.12, M4(0, deckAt(0.84) + 0.3, u * L - 0.06), 0x5a3c24)); }   // 艏楼后壁
  // 船首斜材（艏柱前的弧形木）
  { const sh = new THREE.Shape(); const z0 = L, kb = keelAt(1);
    sh.moveTo(z0 - 0.5, kb + 0.1); sh.quadraticCurveTo(z0 + 0.6, 0.2, z0 + 1.15, 1.9); sh.lineTo(z0 + 1.35, 2.45); sh.lineTo(z0 + 0.6, sheerAt(1) - 0.1); sh.lineTo(z0 - 0.4, sheerAt(0.97) - 0.4); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false, curveSegments: 6 });
    out.push(norm(eg, 0x4a3220, new THREE.Matrix4().makeTranslation(0.1, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), 0.3)); }
  // 甲板件：主舱口、绞盘、舵轮基座、小艇（倒扣）
  out.push(box(1.6, 0.35, 1.8, M4(0, deckAt(0.55) + 0.17, 0.55 * L), 0x5a3c24), box(1.4, 0.06, 1.6, M4(0, deckAt(0.55) + 0.37, 0.55 * L), 0x2e2016));
  out.push(norm(new THREE.CylinderGeometry(0.32, 0.4, 0.75, 8), 0x4a3220, M4(0, deckAt(0.3) + 0.37, 0.3 * L)));
  out.push(box(0.25, 0.9, 0.25, M4(0, deckAt(0.08) + 0.45, 0.08 * L), 0x4a3220), norm(new THREE.TorusGeometry(0.45, 0.04, 4, 12), 0x6a4a2c, M4(0, deckAt(0.08) + 1.0, 0.08 * L + 0.15)));
  out.push(norm(new THREE.CylinderGeometry(0.55, 0.55, 3.2, 8, 1, true, 0, Math.PI), 0x6e5030, new THREE.Matrix4().makeTranslation(0, deckAt(0.75) + 0.12, 0.75 * L).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))));   // 倒扣小艇
  // 尾灯柱
  out.push(rod(new THREE.Vector3(0, sheerAt(0.01), 0.15), new THREE.Vector3(0, sheerAt(0.01) + 1.1, -0.15), 0.05, 0.04, 5, 0x2a1d13));
  // 锚（两舷艏部，简化成锚杆 + 锚爪）
  for (const s of [-1, 1]) { const u = 0.9, x = s * (hbAt(u) + 0.05), y = sheerAt(u) - 0.5; out.push(box(0.08, 1.3, 0.08, M4(x, y - 0.4, u * L), 0x222222), box(0.08, 0.08, 0.8, M4(x, y - 1.05, u * L), 0x222222)); }
  return out;
}
function lampParts(): G[] {
  const out: G[] = [], y0 = sheerAt(0.01) + 1.1;
  const l = new THREE.SphereGeometry(0.22, 10, 8); out.push(norm(l, 0xffc070, M4(0, y0 + 0.15, -0.15)));
  const wy = sheerAt(0) - 1.05;
  for (const x of [-1.05, -0.35, 0.35, 1.05]) out.push(norm(new THREE.PlaneGeometry(0.42, 0.5), 0x9a6a30, M4(x, wy, -0.03 - 0.12 * (wy - WL) / 2, 0, Math.PI, 0)));   // 船尾窗
  return out;
}

// ---------------------------------------------------------------- 组装
export type ShipV2 = { group: THREE.Group; tick(t: number, storm: number, camD: number): void; stats: { tris: number; draws: number } };
export function buildShipV2(): ShipV2 {
  const g = new THREE.Group(); g.name = 'coast_ship';
  const pt = plankTex(), st = sailTex(), fSkin = flagSkinOn(), ft = fSkin ? flagTexSkin() : flagTex();
  const woodM = new THREE.MeshStandardMaterial({ vertexColors: true, map: pt, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  const sparM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  // 帆布：双面受光，带一点自发光模拟透光（背光面不发死）
  const sailM = new THREE.MeshStandardMaterial({ color: 0xf2ead6, map: st, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, emissive: 0x2a2418, emissiveIntensity: 1, envMapIntensity: 0.4 });
  const flagM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ft, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x200404 });
  if (fSkin && ft) { flagM.alphaTest = 0.5; ft.wrapS = ft.wrapT = THREE.ClampToEdgeWrapping; }   // 11-19 flagskin：毛边 / 破洞镂空；不重复平铺（自由端毛边不会从靠桅一侧漏回来）
  const lampM = new THREE.MeshBasicMaterial({ vertexColors: true });
  const ropeM = new THREE.LineBasicMaterial({ color: 0x1e150e });
  for (const m of [woodM, sparM, sailM, flagM, lampM, ropeM]) { m.userData.outlineParameters = { visible: false }; m.userData.noBake = true; }

  const wood = new THREE.Mesh(mergeGeometries(woodParts(), false)!, woodM); wood.name = 'ship_wood'; wood.castShadow = true; wood.receiveShadow = true;
  const spars = new THREE.Mesh(mergeGeometries(sparsGeo(), false)!, sparM); spars.name = 'ship_spars'; spars.castShadow = true;
  const S = sailsGeo(), sails = new THREE.Mesh(S.g, sailM); sails.name = 'ship_sails'; sails.castShadow = true; sails.receiveShadow = true;
  const rig = new THREE.LineSegments(riggingGeo(), ropeM); rig.name = 'ship_rigging';
  const F = flagGeo(), flag = new THREE.Mesh(F.g, flagM); flag.name = 'ship_flag'; flag.castShadow = true;
  const lamp = new THREE.Mesh(mergeGeometries(lampParts(), false)!, lampM); lamp.name = 'shipLamp';
  const fDemo = flagDemoOn(), _wp = new THREE.Vector3();
  const wave = (t: number, storm: number) => { if (!fDemo) { waveFlag(F.g, F.buf, t, storm); return; } g.getWorldPosition(_wp); waveFlagDemo(F.g, F.buf, t, storm, _wp.x, _wp.z); };
  deformSails(S.g, S.buf, 0, 0); wave(0, 0);
  for (const gg of [S.g, F.g]) { gg.computeBoundingSphere(); gg.boundingSphere!.radius += 1.5; }   // 摆动后不被视锥误剔
  g.add(wood, spars, sails, rig, flag, lamp);
  const meshes = [wood, spars, sails, flag, lamp];
  const tris = meshes.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);
  let acc = 0;
  return {
    group: g, stats: { tris: Math.round(tris), draws: g.children.length },
    tick(t, storm, camD) {
      if (camD > 300) return;
      acc++; if (camD > 120 && acc % 2) return;   // 远处隔帧更新
      deformSails(S.g, S.buf, t, storm); wave(t, storm);
    },
  };
}
