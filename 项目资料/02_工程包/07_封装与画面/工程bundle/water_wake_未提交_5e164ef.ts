// ======================================================================
// 11-18 水面尾迹 / 涟漪（Rhett 19:41「水面也不会涟漪」、19:46「这个是源码，你按照源码来移植」）
//   移植自 Rhett 给的「秋林逆光 水花 r8」water_module.js 的尾迹场（第 91~98 步做法）：
//   · 波动方程 h' = 2h − h_prev + c²·4·(邻居均值 − h)，乒乓 HalfFloat RT，固定 60 Hz 子步（一帧最多 6 步）
//   · 运动压力源：r8 是船体椭圆（2.3 × 0.95 m）压下水面 → 自然出马赫 / 开尔文式 V 形；这里换成玩家（0.8 × 0.45 m），
//     走得越快压得越深；站着不动时每 1.3 秒一次小脉冲（一圈圈涟漪）
//   · 泡沫（b 通道）扩散 + 衰减 + 浪峰 / 身后 / 两侧生成；翻搅（a 通道）身后生成
//   · 水面着色器：坡度 = 尾迹 h 的中心差分 × 2（同 r8），加进法线 → 倒影跟着被扰动；泡沫按蕾丝噪声阈值成网
//   与 r8 的差别：r8 的模拟域固定盖住整条河；游戏地图大，这里改成跟着玩家走的 40 米方块（按纹素对齐平移，平移时把旧场搬过去），
//   岸线吸收（r8 用河道形状算 wet）改为：域边缘吸收 + 整体轻阻尼；哪里有水由各水面自己决定（尾迹只在水面着色器里读）。
//   只在玩家脚底低于某块水面（水面 onBeforeRender 登记）时加源。沉钟海岸海水不接（Rhett：海水不用改）。
//   分档：高 / 超高 256²，中 192²，低档关。?off=wake 关。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';

let _off = false;
try { _off = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('off') || '').split(',').some(s => s.trim() === 'wake'); } catch { /* 读不到就开 */ }
export const WAKE = { off: _off, steps: 0, src: 0, inWater: false };
export const wakeOn = () => !WAKE.off && curQuality !== 'low';

const SIZE = 40, WAVE_C = 2.2, SIM_DT = 1 / 60;
/** 水面着色器共用的 uniform（按引用共享） */
export const wakeU = {
  tWake: { value: null as THREE.Texture | null },
  uWkDom: { value: new THREE.Vector4(0, 0, SIZE, 0) },   // x0, z0, 边长, 有效（0/1）
  uWkTx: { value: new THREE.Vector2(1 / 256, 1 / 256) },
};
/** 片元着色器：wkG(世界 xz) → (∂h/∂x·2, ∂h/∂z·2, 泡沫, 翻搅)；域外 0 */
export const WAKE_GLSL = /* glsl */ `
uniform sampler2D tWake; uniform vec4 uWkDom; uniform vec2 uWkTx;
vec4 wkG(vec2 p){
  if (uWkDom.w < 0.5) return vec4(0.0);
  vec2 uv = (p - uWkDom.xy) / uWkDom.z;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec4(0.0);
  vec4 wk = texture2D(tWake, uv); float cell = uWkDom.z * uWkTx.x;
  float hx = texture2D(tWake, uv + vec2(uWkTx.x, 0.0)).r - texture2D(tWake, uv - vec2(uWkTx.x, 0.0)).r;
  float hz = texture2D(tWake, uv + vec2(0.0, uWkTx.y)).r - texture2D(tWake, uv - vec2(0.0, uWkTx.y)).r;
  float ed = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
  return vec4(vec2(hx, hz) / (2.0 * cell) * 2.0, wk.b, wk.a) * ed;
}
// r8 网状泡沫：密度阈值噪声
float wkH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wkH(i), wkH(i + vec2(1.0, 0.0)), f.x), mix(wkH(i + vec2(0.0, 1.0)), wkH(i + vec2(1.0, 1.0)), f.x), f.y); }
float wkFoam(vec2 p, float t, float foam){
  float nz = wkN(p * 3.1 + t * vec2(0.05, 0.03)) * 0.45 + wkN(p * 7.7 - t * 0.04) * 0.33 + wkN(p * 19.0) * 0.22;
  float lace = 1.0 - abs(wkN(p * 9.3 + 3.0) * 2.0 - 1.0); nz = mix(nz, lace, 0.45);
  return smoothstep(nz - 0.07, nz + 0.04, foam * 1.05) * (0.78 + 0.22 * wkN(p * 23.0 + t * 0.3)); }
`;

let N = 0, rts: THREE.WebGLRenderTarget[] = [], cur = 0;
let simMat: THREE.ShaderMaterial | null = null, quad: THREE.Mesh | null = null;
const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let x0 = 0, z0 = 0, acc = 0, simT = 0, lastX = NaN, lastZ = NaN, spd = 0, hd = 0, idleT = 0;
// 本帧登记的水面：[水面高度, xmin, zmin, xmax, zmax]
let marks: number[][] = [], marksPrev: number[][] = [];

/** 水面网格 onBeforeRender 里调：这块水面的世界高度与 xz 包围盒（只用来判断玩家是否站在水里） */
const _b = new THREE.Box3();
export function wakeMark(o: THREE.Object3D, g: THREE.BufferGeometry, y: number) {
  if (!wakeOn() || marks.length > 24) return;
  if (!g.boundingBox) g.computeBoundingBox();
  _b.copy(g.boundingBox!).applyMatrix4(o.matrixWorld);
  marks.push([y, _b.min.x, _b.min.z, _b.max.x, _b.max.z]);
}

function init(renderer: THREE.WebGLRenderer) {
  N = curQuality === 'medium' ? 192 : 256;
  const half = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.FloatType;
  rts = [0, 1].map(() => { const t = new THREE.WebGLRenderTarget(N, N, { type: half, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false });
    t.texture.generateMipmaps = false; t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; return t; });
  const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha(); const prevRT = renderer.getRenderTarget();
  renderer.setClearColor(0x000000, 0); for (const t of rts) { renderer.setRenderTarget(t); renderer.clear(); } renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca);
  const dxm = SIZE / N;
  simMat = new THREE.ShaderMaterial({
    uniforms: { tPrev: { value: null }, uTx: { value: new THREE.Vector2(1 / N, 1 / N) }, uShift: { value: new THREE.Vector2() }, uSrc: { value: new THREE.Vector4() }, uSrc2: { value: new THREE.Vector4() },
      uDom: { value: new THREE.Vector4(0, 0, SIZE, SIZE) }, uDt: { value: SIM_DT }, uC2: { value: Math.pow(WAVE_C * SIM_DT / dxm, 2) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform sampler2D tPrev; uniform vec2 uTx, uShift; uniform vec4 uSrc, uSrc2, uDom; uniform float uDt, uC2;
      vec4 tp(vec2 u){ return (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) ? vec4(0.0) : texture2D(tPrev, u); }
      void main(){
        vec2 u = vUv + uShift; vec2 wp = uDom.xy + vUv * uDom.zw;
        vec4 c = tp(u), n = tp(u + vec2(0.0, uTx.y)), s = tp(u - vec2(0.0, uTx.y)), e = tp(u + vec2(uTx.x, 0.0)), w = tp(u - vec2(uTx.x, 0.0));
        float hAvg = (n.r + s.r + e.r + w.r) * 0.25;
        float h = 2.0 * c.r - c.g + uC2 * 4.0 * (hAvg - c.r);
        float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);
        h *= mix(0.94, 0.992, edge);                                        // 域边缘吸收、整体轻阻尼（r8：岸边 / 边界吸收，不反弹）
        // 运动压力源（r8 船体椭圆 → 玩家）：uSrc = (x, z, 朝向, 速度系数)，uSrc2.x = 压深（含静止脉冲）
        vec2 fw = vec2(cos(uSrc.z), sin(uSrc.z)); vec2 rel = wp - uSrc.xy; float lx = dot(rel, fw), lz = dot(rel, vec2(-fw.y, fw.x));
        float sp = uSrc.w; float ell = length(vec2(lx / 0.8, lz / 0.45)); float hull = smoothstep(1.0, 0.5, ell) * step(0.001, uSrc2.x);
        h = mix(h, -uSrc2.x * (0.55 + 0.45 * smoothstep(-0.8, 0.6, lx)), hull * 0.3);
        float fAvg = (n.b + s.b + e.b + w.b) * 0.25; float foam = mix(c.b, fAvg, 0.10) * exp(-uDt / 2.6);   // 扩散 + 衰减
        float stern = smoothstep(1.0, 0.0, length(vec2((lx + 1.1) / 0.8, lz / (0.4 + 0.18 * max(-lx - 0.8, 0.0)))));
        float side = smoothstep(0.72, 1.0, ell) * smoothstep(1.4, 1.0, ell) * smoothstep(-0.5, 0.8, lx);
        float crest = smoothstep(0.012, 0.03, h - hAvg);
        foam = min(foam + uDt * (stern * 6.0 * sp + side * 3.0 * sp + crest * 1.2) * step(0.001, uSrc2.x), 1.35);
        float aAvg = (n.a + s.a + e.a + w.a) * 0.25; float ch = mix(c.a, aAvg, 0.3) * exp(-uDt / 2.0); ch = min(ch + uDt * stern * 3.0 * sp * step(0.001, uSrc2.x), 1.2);
        gl_FragColor = vec4(h * edge, c.r * edge, foam * edge, ch * edge);
      }`,
    depthTest: false, depthWrite: false,
  });
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat); quad.frustumCulled = false; qScene.add(quad);
  wakeU.uWkTx.value.set(1 / N, 1 / N);
}

/** 每帧（渲染前）调一次：px/py/pz = 玩家脚底世界坐标 */
export function wakeTick(renderer: THREE.WebGLRenderer, dt: number, px: number, py: number, pz: number) {
  marksPrev = marks; marks = [];
  if (!wakeOn()) { wakeU.uWkDom.value.w = 0; return; }
  // 玩家在不在水里：脚底低于某块登记水面 3 cm 以上、且不深过 2.5 米（桥上 / 水下洞穴不算）
  let depth = 0;
  for (const m of marksPrev) if (px >= m[1] && px <= m[3] && pz >= m[2] && pz <= m[4]) { const d = m[0] - py; if (d > 0.03 && d < 2.5) depth = Math.max(depth, d); }
  WAKE.inWater = depth > 0;
  if (!marksPrev.length) { wakeU.uWkDom.value.w = 0; lastX = NaN; return; }   // 附近没有水面：不跑模拟
  if (!rts.length) init(renderer);
  // 速度 / 朝向（平滑）
  if (Number.isFinite(lastX) && dt > 0) { const vx = (px - lastX) / dt, vz = (pz - lastZ) / dt, v = Math.hypot(vx, vz);
    if (v > 25) { /* 传送：不算速度 */ } else { spd += (Math.min(v, 9) - spd) * Math.min(1, dt * 8); if (v > 0.3) hd = Math.atan2(vz, vx); } }
  lastX = px; lastZ = pz;
  // 域：以玩家为中心、按纹素对齐；平移量传给模拟着色器（把旧场搬过去）
  const cell = SIZE / N, nx0 = Math.round((px - SIZE / 2) / cell) * cell, nz0 = Math.round((pz - SIZE / 2) / cell) * cell;
  const jump = Math.abs(nx0 - x0) > SIZE * 0.5 || Math.abs(nz0 - z0) > SIZE * 0.5;
  const sh = jump ? [9, 9] : [(nx0 - x0) / SIZE, (nz0 - z0) / SIZE];   // 跳远了：整场清零（采样全在域外）
  x0 = nx0; z0 = nz0;
  const u = simMat!.uniforms;
  u.uDom.value.set(x0, z0, SIZE, SIZE);
  // 压深：走动按速度（r8：-0.16·速度系数），站着每 1.3 秒一次小脉冲
  const sp = Math.min(1.2, spd / 5);
  idleT += dt; const pulse = spd < 0.6 && depth > 0 ? Math.max(0, 1 - ((idleT % 1.3) / 0.12)) * 0.05 : 0;
  const press = depth > 0 ? Math.min(1, depth / 0.3) * (0.03 + 0.11 * sp) + pulse : 0;
  u.uSrc.value.set(px, pz, hd, Math.max(sp, pulse > 0 ? 0.15 : 0)); u.uSrc2.value.set(press, 0, 0, 0);
  if (press > 0) WAKE.src++;
  acc += Math.min(dt, 0.1); let n = 0;
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear; renderer.autoClear = false;
  let first = true;
  while ((acc >= SIM_DT || (first && (sh[0] !== 0 || sh[1] !== 0))) && n < 6) {
    u.uShift.value.set(first ? sh[0] : 0, first ? sh[1] : 0); first = false;
    u.tPrev.value = rts[cur].texture; renderer.setRenderTarget(rts[1 - cur]); renderer.render(qScene, qCam); cur = 1 - cur;
    acc = Math.max(0, acc - SIM_DT); n++; simT += SIM_DT; WAKE.steps++;
  }
  if (n >= 6) acc = 0;
  renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto;
  wakeU.tWake.value = rts[cur].texture;
  wakeU.uWkDom.value.set(x0, z0, SIZE, 1);
}
