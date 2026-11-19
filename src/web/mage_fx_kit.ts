// ======================================================================
// 11-17 法师专属魔法特效 · 公用件（Rhett 11-17 批准的 9 张概念图 /workspace/work/mfx1117）
// 只做程序化几何 / 着色器 / 贴图（canvas 生成，全局缓存，不 dispose）；粒子走 vfx.fx，寿命走 vfx.live。
// 约定：
//   · live() 里的物体到时由 updateVfx 统一 dispose 几何与材质 —— 所以 live 物体必须用「新建」的几何 / 材质，
//     共享几何只给弹体（弹体由 main 移出场景，不走 live，不 dispose）。贴图全局缓存，材质 dispose 不会释放贴图。
//   · 不加 PointLight（灯数变化会让全场景材质重编译）；地面受光用加法贴花代替。
//   · GLSL 变量名不用 half / patch。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fx, fxQuality, vfxTime } from './vfx';
import { gy } from './gfx';

export type P2 = { x: number; z: number };
export type P3 = { x: number; y: number; z: number };
/** 特效需要的敌人字段（main.Enemy 结构上满足） */
export interface FxUnit { pos: THREE.Vector3; alive: boolean; isBoss?: boolean; rig: { root: THREE.Object3D }; status: { isStunned: boolean } }

export const lowQ = () => fxQuality === 'low';
const QK = { high: 1, medium: 0.6, low: 0.3 } as const;
/** 网格件数按画质缩减（粒子数 fx() 自己缩，这里只管网格） */
export const qn = (n: number, min = 1) => Math.max(min, Math.round(n * QK[fxQuality]));
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
/** 0→1 淡入 a 秒、末尾 b 比例淡出 */
export const envK = (k: number, dur: number, fin: number, fout: number) => Math.min(1, (k * dur) / Math.max(1e-3, fin)) * Math.min(1, (1 - k) / Math.max(1e-3, fout));

export const noOl = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };
const col = (c: THREE.ColorRepresentation) => new THREE.Color(c);

/** 敌人身高（缓存在 rig.root.userData；算不出就按普通 2.1 / 首领 4） */
export function unitHeight(e: FxUnit): number {
  const ud = e.rig.root.userData as { __mfxH?: number };
  if (ud.__mfxH) return ud.__mfxH;
  let h = e.isBoss ? 4 : 2.1;
  try {
    const b = new THREE.Box3().setFromObject(e.rig.root);
    const v = b.max.y - b.min.y;
    if (Number.isFinite(v) && v > 0.4 && v < 14) h = v;
  } catch { /* 用缺省 */ }
  return (ud.__mfxH = h);
}

// ---------------------------------------------------------------- GLSL 公用
export const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5; float s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;
const VS_UV = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const VS_FRES = `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv; varying vec3 vO;
void main(){ vUv = uv; vO = position; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;

const base = (additive: boolean, side: THREE.Side = THREE.FrontSide) => ({
  transparent: true, depthWrite: false, toneMapped: false, side,
  blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
});

/** 菲涅尔晶体 / 光体材质：边缘亮、正面透；additive=false 时是半透明冰（会压暗后面一点） */
export function fresnelMat(o: { color: THREE.ColorRepresentation; rim: THREE.ColorRepresentation; op?: number; pow?: number; additive?: boolean; side?: THREE.Side; sparkle?: number; floor?: number }) {
  const m = new THREE.ShaderMaterial({
    ...base(o.additive ?? true, o.side ?? THREE.FrontSide),
    uniforms: { uC: { value: col(o.color) }, uR: { value: col(o.rim) }, uOp: { value: o.op ?? 1 }, uPow: { value: o.pow ?? 2.2 }, uT: { value: 0 }, uSp: { value: o.sparkle ?? 0.6 }, uFl: { value: o.floor ?? 0.3 } },
    vertexShader: VS_FRES,
    fragmentShader: `${GLSL_NOISE}
uniform vec3 uC; uniform vec3 uR; uniform float uOp; uniform float uPow; uniform float uT; uniform float uSp; uniform float uFl;
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float f = pow(1.0 - abs(dot(n, normalize(vV))), uPow);
  float sp = step(0.986, h21(floor(vW.xz*7.0 + vW.y*5.0) + floor(uT*9.0))) * uSp;
  vec3 c = mix(uC, uR, f) + sp * uR;
  gl_FragColor = vec4(c, uOp * (uFl + (1.0 - uFl) * f + sp));
}`,
  });
  return m;
}

/** 平面上的扩散环：uR 半径（0..1 = 平面半边长）、uW 线宽、uN 边缘噪声、uFill 内部薄光 */
export function waveMat(color: THREE.ColorRepresentation, o: { w?: number; noise?: number; fill?: number; rings?: number } = {}) {
  return new THREE.ShaderMaterial({
    ...base(true, THREE.DoubleSide),
    uniforms: { uC: { value: col(color) }, uR: { value: 0 }, uW: { value: o.w ?? 0.05 }, uOp: { value: 1 }, uT: { value: 0 }, uN: { value: o.noise ?? 0 }, uFill: { value: o.fill ?? 0 }, uRings: { value: o.rings ?? 1 } },
    vertexShader: VS_UV,
    fragmentShader: `${GLSL_NOISE}
uniform vec3 uC; uniform float uR; uniform float uW; uniform float uOp; uniform float uT; uniform float uN; uniform float uFill; uniform float uRings;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
  float n = (vn(vec2(a * 7.0 + 3.0, uT * 2.5)) - 0.5) * uN + (vn(vec2(a * 23.0, uT * 4.0)) - 0.5) * uN * 0.35;
  float ring = 0.0;
  for (int i = 0; i < 4; i++) { float fi = float(i); if (fi >= uRings) break;
    float rr = uR * (1.0 - fi * 0.22); float d = (r - rr + n) / uW; ring += exp(-d * d * 1.6) * (1.0 - fi * 0.25); }
  float inner = smoothstep(uR, uR * 0.2, r) * step(r, uR) * uFill;
  float sparkle = step(0.93, vn(vec2(a * 40.0, r * 30.0 - uT * 6.0))) * ring;
  float v = ring + inner + sparkle * 0.8;
  gl_FragColor = vec4(uC * v, v * uOp * step(r, 1.0));
}`,
  });
}

/** 贴图贴花（加法或普通），uOp 控制淡出 */
export function decalMat(map: THREE.Texture, color: THREE.ColorRepresentation, additive = true, op = 1) {
  return new THREE.MeshBasicMaterial({ map, color: col(color), transparent: true, opacity: op, depthWrite: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
}

/** 彗尾 / 拖尾：十字交叉平面沿 -z，头在 z=0 */
export function tailMat(head: THREE.ColorRepresentation, tail: THREE.ColorRepresentation, op = 1, wisp = 1) {
  return new THREE.ShaderMaterial({
    ...base(true, THREE.DoubleSide),
    uniforms: { uC: { value: col(head) }, uC2: { value: col(tail) }, uOp: { value: op }, uT: { value: 0 }, uWisp: { value: wisp } },
    vertexShader: VS_UV,
    fragmentShader: `${GLSL_NOISE}
uniform vec3 uC; uniform vec3 uC2; uniform float uOp; uniform float uT; uniform float uWisp;
varying vec2 vUv;
void main(){
  float l = 1.0 - vUv.y; float w = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float n = vn(vec2(vUv.x * 5.0, l * 7.0 - uT * 14.0));
  float a = pow(max(w, 0.0), 1.5 + l * 5.0) * pow(1.0 - l, 1.4) * mix(1.0, 0.4 + 1.0 * n, uWisp);
  gl_FragColor = vec4(mix(uC, uC2, l) * a, a * uOp);
}`,
  });
}

/** 十字交叉的拖尾几何：长 len、宽 w（头 z=0，尾 z=-len） */
export function tailGeo(len: number, w: number) {
  const a = new THREE.PlaneGeometry(w, len, 1, 6); a.rotateX(Math.PI / 2); a.translate(0, 0, -len / 2);
  // PlaneGeometry 在 XY，rotateX(π/2) 把 +y → +z：uv.y=1 在 +z（头），平移后头在 z=0
  const b = a.clone(); b.rotateZ(Math.PI / 2);
  return mergeGeometries([a, b]) ?? a;
}

/** 平面几何贴地：(2r)² 网格，顶点 y = 地面高 + lift（用于大半径地面件，斜坡不穿） */
export function groundGeo(c: P2, r: number, lift = 0.06, seg = 0) {
  const n = seg || (lowQ() ? 6 : 14);
  const g = new THREE.PlaneGeometry(r * 2, r * 2, n, n); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + c.x, z = p.getZ(i) + c.z; p.setXYZ(i, x, gy(x, z) + lift, z); }
  p.needsUpdate = true; g.computeBoundingSphere();
  return g;
}
/** 贴地网格件（世界坐标顶点，物体本身在原点） */
export function groundMesh(c: P2, r: number, mat: THREE.Material, lift = 0.06, seg = 0) {
  const m = new THREE.Mesh(groundGeo(c, r, lift, seg), mat); m.renderOrder = 2; m.frustumCulled = false; return noOl(m);
}
/** 小平面贴地（不跟地形弯，适合 2 米内） */
export function flatQuad(c: P2, r: number, mat: THREE.Material, lift = 0.07) {
  const g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(c.x, gy(c.x, c.z) + lift, c.z); m.renderOrder = 2; return noOl(m);
}

/** 平铺对象的时钟（共享弹体材质用） */
export const now = () => vfxTime();

/** 把材质里所有 uT 设成当前时间 */
export function tickT(o: THREE.Object3D) { const t = vfxTime(); o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (m?.uniforms?.uT) m.uniforms.uT.value = t; }); }
/** 整体透明度乘子：ShaderMaterial 改 uOp，Basic 改 opacity（首次记下原值） */
export function fadeAll(o: THREE.Object3D, f: number) {
  o.traverse(c => {
    const m = (c as THREE.Mesh).material as (THREE.Material & { uniforms?: Record<string, THREE.IUniform>; opacity: number }) | undefined; if (!m) return;
    if (m.uniforms?.uOp) { m.userData.op0 ??= m.uniforms.uOp.value; m.uniforms.uOp.value = m.userData.op0 * Math.max(0, f); }
    else if (m.transparent) { m.userData.op0 ??= m.opacity; m.opacity = m.userData.op0 * Math.max(0, f); }
  });
}

// ---------------------------------------------------------------- 程序贴图（canvas，全局缓存）
const TEX: Record<string, THREE.Texture> = {};
function canvasTex(key: string, S: number, draw: (g: CanvasRenderingContext2D, S: number) => void, srgb = false) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  if (g) draw(g, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return (TEX[key] = t);
}
function seeded(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** 柔光圆斑 */
export const glowTex = () => canvasTex('glow', 128, (g, S) => {
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, S, S);
});

/** 四芒星（长细光芒 + 小斜芒 + 芯） */
export const starTex = () => canvasTex('star4', 128, (g, S) => {
  const c = S / 2;
  const rr = g.createRadialGradient(c, c, 0, c, c, c); rr.addColorStop(0, 'rgba(255,255,255,0.9)'); rr.addColorStop(0.18, 'rgba(255,255,255,0.35)'); rr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rr; g.fillRect(0, 0, S, S);
  const ray = (a: number, len: number, w: number) => { g.save(); g.translate(c, c); g.rotate(a); g.beginPath(); g.moveTo(0, -len); g.lineTo(w, 0); g.lineTo(0, len); g.lineTo(-w, 0); g.closePath(); g.fillStyle = 'white'; g.fill(); g.restore(); };
  ray(0, 62, 7); ray(Math.PI / 2, 62, 7); ray(Math.PI / 4, 30, 4); ray(-Math.PI / 4, 30, 4);
});

/** 符文法环：双圈 + 刻度 + 环内符文 */
export const runeRingTex = () => canvasTex('runering', 512, (g, S) => {
  const c = S / 2, R = seeded(77);
  g.strokeStyle = 'white'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.arc(c, c, c * 0.95, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * 0.78, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(c, c, c * 0.5, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, l = i % 6 ? 0.03 : 0.07; g.lineWidth = i % 6 ? 2 : 4; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78); g.lineTo(c + Math.cos(a) * c * (0.78 - l), c + Math.sin(a) * c * (0.78 - l)); g.stroke(); }
  // 环带里的符文：每个 3~5 笔折线
  g.lineWidth = 4;
  for (let i = 0; i < 18; i++) {
    const a = (i + 0.5) / 18 * Math.PI * 2, d = c * 0.865, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath();
    const n = 3 + Math.floor(R() * 3); let px = (R() - 0.5) * 18, py = (R() - 0.5) * 18; g.moveTo(px, py);
    for (let k = 0; k < n; k++) { px = Math.max(-11, Math.min(11, px + (R() - 0.5) * 22)); py = Math.max(-12, Math.min(12, py + (R() - 0.5) * 22)); if (R() < 0.3) g.moveTo(px, py); else g.lineTo(px, py); }
    g.stroke(); g.restore();
  }
  // 内圈：六芒交线
  g.lineWidth = 2.5; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, b = (i + 2) / 6 * Math.PI * 2; g.moveTo(c + Math.cos(a) * c * 0.5, c + Math.sin(a) * c * 0.5); g.lineTo(c + Math.cos(b) * c * 0.5, c + Math.sin(b) * c * 0.5); }
  g.stroke();
  const rg = g.createRadialGradient(c, c, 0, c, c, c * 0.5); rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
});

/** 冰面：R = 发光裂纹，G = 霜花颗粒（NoColorSpace，按通道读） */
export const iceCrackTex = () => canvasTex('icecrack', 512, (g, S) => {
  const R = seeded(1117), c = S / 2;
  g.fillStyle = 'black'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2600; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * c; g.fillStyle = `rgba(0,${Math.floor(60 + R() * 195)},0,${0.5 + R() * 0.5})`; const s = 1 + R() * 4; g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, s, s); }
  const gg = g.createRadialGradient(c, c, 0, c, c, c); gg.addColorStop(0, 'rgba(0,120,0,1)'); gg.addColorStop(1, 'rgba(0,20,0,1)'); g.fillStyle = gg; g.fillRect(0, 0, S, S);
  g.lineCap = 'round'; g.strokeStyle = 'rgb(255,0,0)';
  const crack = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      a += (R() - 0.5) * 0.8; x += Math.cos(a) * 13; y += Math.sin(a) * 13; g.lineTo(x, y);
      if (depth > 0 && R() < 0.18) { g.stroke(); crack(x, y, a + (R() < 0.5 ? 1 : -1) * rnd(0.5, 1.1), Math.floor(len * 0.5), w * 0.6, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  for (let i = 0; i < 16; i++) crack(c + (R() - 0.5) * 20, c + (R() - 0.5) * 20, i / 16 * 6.28 + R() * 0.3, 16, 3.2, 2);
  // 同心碎裂环（冰面受冲击）
  for (let k = 0; k < 3; k++) { const rr = c * (0.3 + k * 0.22); g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.28, j = rr * (1 + (R() - 0.5) * 0.08); if (R() < 0.2) g.moveTo(c + Math.cos(a) * j, c + Math.sin(a) * j); else g.lineTo(c + Math.cos(a) * j, c + Math.sin(a) * j); } g.stroke(); }
});

/** 裂纹地面材质（普通混合：底色 → 颗粒亮色 + 裂纹发光，带不规则边缘）。冰面 / 熔岩裂地共用一个程序（颜色走 uniform） */
export function crackGroundMat(o: { base: THREE.ColorRepresentation; hi: THREE.ColorRepresentation; crack: THREE.ColorRepresentation; op?: number }) {
  return new THREE.ShaderMaterial({
    ...base(false, THREE.DoubleSide), polygonOffset: true, polygonOffsetFactor: -4,
    uniforms: { uMap: { value: iceCrackTex() }, uOp: { value: o.op ?? 1 }, uT: { value: 0 }, uGlow: { value: 1 }, uSeed: { value: Math.random() * 10 },
      uBase: { value: col(o.base) }, uHi: { value: col(o.hi) }, uCrk: { value: col(o.crack) } },
    vertexShader: VS_UV,
    fragmentShader: `${GLSL_NOISE}
uniform sampler2D uMap; uniform float uOp; uniform float uT; uniform float uGlow; uniform float uSeed;
uniform vec3 uBase; uniform vec3 uHi; uniform vec3 uCrk;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0; float r = length(p); float a = atan(p.y, p.x);
  float e = (fbm(vec2(a * 2.5 + uSeed, uSeed)) - 0.5) * 0.35;
  float mask = smoothstep(1.0, 0.78, r + e);
  vec4 tx = texture2D(uMap, vUv);
  float crack = tx.r; float frost = tx.g;
  float tw = 0.75 + 0.25 * sin(uT * 3.0 + vUv.x * 20.0);
  vec3 c = mix(uBase, uHi, frost) + uCrk * crack * uGlow * tw * 1.6;
  float al = (0.30 + 0.42 * frost + 0.6 * crack) * mask * uOp;
  gl_FragColor = vec4(c, al);
}`,
  });
}
/** 冰面材质（冰白霜 + 裂纹发光）—— 颜色与 11-17 首版一致 */
export function iceGroundMat(op = 1) {
  return crackGroundMat({ base: new THREE.Color(0.42, 0.62, 0.86), hi: new THREE.Color(0.88, 0.96, 1.0), crack: new THREE.Color(0.5, 0.85, 1.0), op });
}
/** 熔岩裂地（焦黑地面 + 余烬颗粒 + 橙红发光裂纹；火系符文变体用） */
export function lavaGroundMat(op = 1) {
  return crackGroundMat({ base: new THREE.Color(0.07, 0.03, 0.02), hi: new THREE.Color(0.32, 0.11, 0.04), crack: new THREE.Color(1.0, 0.42, 0.08), op });
}

// ---------------------------------------------------------------- 符文元素配色（11-17 符文变体：沿用基础技能形体，只换元素）
/** 符文把技能元素改掉后用的配色：火 = 橙红余烬，冰 = 青白冰晶，雷（自然）= 蓝紫电弧（同 arcbolt.ARC_PAL，不用绿），奥术 = 紫 */
export type RuneEl = 'fire' | 'frost' | 'nature' | 'arcane';
export interface ElemPal {
  /** 晶核 / 外壳 */ core: number; rim: number; glow: number;
  /** 拖尾头 / 尾 */ head: number; tail: number;
  /** 粒子起止色 + 末色 */ p1: number; p2: number; pEnd: number;
  /** 扩散环 / 地面光 */ ring: number;
  /** 烟：起 / 中 / 末 */ smoke: [number, number, number];
}
export const ELEM_PAL: Record<RuneEl, ElemPal> = {
  fire: { core: 0xff5a14, rim: 0xffe6a0, glow: 0xff5a10, head: 0xffe0a0, tail: 0xa01c04, p1: 0xffd080, p2: 0xff6a10, pEnd: 0x601008, ring: 0xff8a3a, smoke: [0x5a4038, 0x382a24, 0x120c0a] },
  frost: { core: 0x4e98dc, rim: 0xf2fbff, glow: 0x5ab8ff, head: 0xe0f4ff, tail: 0x3c78c0, p1: 0xf2fbff, p2: 0x8fd0ff, pEnd: 0x7890a8, ring: 0x8fd8ff, smoke: [0xdcefff, 0xbcd8f0, 0x7890a8] },
  nature: { core: 0x7b6cff, rim: 0xf4f1ff, glow: 0x6fd3ff, head: 0xf0f0ff, tail: 0x5a48d0, p1: 0xf4f1ff, p2: 0x6fd3ff, pEnd: 0x3a3080, ring: 0x9fb8ff, smoke: [0xc8ccf0, 0x9098c8, 0x404868] },
  arcane: { core: 0xc060ff, rim: 0xfff0ff, glow: 0xa040ff, head: 0xf6d0ff, tail: 0x6a18d0, p1: 0xf8c0ff, p2: 0x9038ff, pEnd: 0x401070, ring: 0xc070ff, smoke: [0xd8c0f0, 0xa080c8, 0x402858] },
};
export const elemPal = (e: string): ElemPal => ELEM_PAL[(e in ELEM_PAL ? e : 'arcane') as RuneEl];

/** 飞行中的元素粒子（每帧一次，自带概率；p 为世界绝对坐标）：火 = 小火舌 + 上飘余烬，冰 = 下落冰晶，雷 = 电火花，奥术 = 紫火星 */
export function elemMote(el: string, p: THREE.Vector3, k = 1) {
  const P = elemPal(el), lo = lowQ();
  if (el === 'fire') {
    fx('flame', p, { count: 1, color: P.p1, color2: P.p2, colorEnd: P.pEnd, speed: 0.25, up: 0.5, life: 0.32, size: 0.34 * k, sizeEnd: 0.08 * k });
    if (Math.random() < (lo ? 0.25 : 0.6)) fx('spark', p.clone(), { count: 1, color: 0xffe8b0, color2: 0xff5a10, colorEnd: 0x601008, speed: 0.9, up: 1.1, life: 0.6, size: 0.09 * k, sizeEnd: 0.02, gravity: -1.2, drag: 1 });
  } else if (el === 'frost') {
    fx('ice', p, { count: 1, color: P.p1, color2: P.p2, speed: 0.3, up: -0.1, life: 0.7, size: 0.15 * k, sizeEnd: 0.06 * k, gravity: 4, spin: 3 });
  } else if (el === 'nature') {
    fx('spark', p, { count: 1, color: P.p1, color2: P.p2, speed: 1.4, up: 0.2, life: 0.22, size: 0.12 * k, sizeEnd: 0.03 });
  } else {
    fx('dot', p, { count: 1, color: P.p1, color2: P.p2, speed: 0.2, up: 0, life: 0.38, size: 0.13 * k, sizeEnd: 0.02 });
  }
}
/** 火光起落（魔法与破坏专长 §2 / §6：灯光不用 sin 抖动，用 0.9 / 1.8 / 3.6 Hz 三层一维平滑噪声，和火焰同频起落）。
 *  这里没有动态灯（加灯会让全场景重编译），火系变体的地面受光贴花 / 熔岩裂纹亮度用它驱动。返回约 0.55~1.25 */
function n1(x: number) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), h = (k: number) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }; return h(i) + (h(i + 1) - h(i)) * u; }
export function flick(t: number, seed = 0) { return 0.55 + 0.7 * (0.5 * n1(t * 0.9 + seed) + 0.3 * n1(t * 1.8 + seed * 1.7 + 5) + 0.2 * n1(t * 3.6 + seed * 2.3 + 11)); }

/** 命中爆点的元素粒子（p 为世界绝对坐标）：闪光 + 元素碎屑 + 烟 */
export function elemBurst(el: string, p: THREE.Vector3, big = 1) {
  const P = elemPal(el), n = (x: number) => Math.max(1, Math.round(x * big));
  fx('star', p, { count: 1, color: 0xffffff, color2: P.ring, speed: 0, up: 0, life: 0.18, size: 1.8 * big, sizeEnd: 0.4 });
  if (el === 'fire') {
    fx('flame', p, { count: n(12), color: P.p1, color2: P.p2, colorEnd: P.pEnd, radius: 0.2, speed: 2.6, up: 1.4, life: 0.45, size: 0.7, sizeEnd: 0.15, drag: 2 });
    fx('spark', p.clone(), { count: n(16), color: 0xffeec0, color2: 0xff6010, colorEnd: 0x601008, speed: 5, up: 2, life: 0.7, size: 0.12, sizeEnd: 0.03, gravity: 7, drag: 1 });
    fx('smoke', p.clone(), { count: n(3), color: P.smoke[0], color2: P.smoke[1], colorEnd: P.smoke[2], speed: 0.8, up: 0.8, life: 1, size: 0.6, sizeEnd: 1.6 });
  } else if (el === 'frost') {
    fx('ice', p, { count: n(16), color: P.p1, color2: P.p2, speed: 5, up: 1.2, life: 0.55, size: 0.28, sizeEnd: 0.12, gravity: 9, spin: 8, drag: 1 });
    fx('shard', p.clone(), { count: n(6), color: 0xeaf8ff, color2: 0x9fd8ff, speed: 4, up: 1.4, life: 0.6, size: 0.18, sizeEnd: 0.1, gravity: 11, spin: 6 });
    fx('smoke', p.clone(), { count: n(3), color: P.smoke[0], color2: P.smoke[1], colorEnd: P.smoke[2], speed: 0.8, up: 0.3, life: 0.8, size: 0.5, sizeEnd: 1.4 });
  } else {
    fx('spark', p, { count: n(16), color: P.p1, color2: P.p2, speed: 4.5, up: 0.6, life: 0.32, size: 0.13, sizeEnd: 0.02, drag: 2.5 });
    fx('dot', p.clone(), { count: n(10), color: P.head, color2: P.p2, speed: 3.5, up: 0.4, life: 0.3, size: 0.13, sizeEnd: 0.02, drag: 3 });
  }
}

/** 平铺对象全部共享资源的预编译样本（main 的预编译列表用） */
export function kitSampleMaterials(): THREE.Material[] {
  return [fresnelMat({ color: 0x88ccff, rim: 0xffffff }), fresnelMat({ color: 0x88ccff, rim: 0xffffff, additive: false }), waveMat(0xffffff), tailMat(0xffffff, 0x8080ff), iceGroundMat(), decalMat(glowTex(), 0xffffff)];   // 熔岩裂地与冰面同一程序，不另列
}
