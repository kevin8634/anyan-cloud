// ======================================================================
// 11-17 水体 v2 共享件（Rhett「按秋林逆光 v3 水的思路升级全图水体」）
//   不是第二套水：DLC 的 waterUp（src/dlc/dlc1/water_fx.ts）、原野河 ssWater（cine.ts）、海岸 / 镜渊海底 / 井水等自带着色器
//   都从这里取同一批 GLSL 函数和开关，各自原有结构不变。
//   思路来源（只学思路，代码本项目自写）：秋林逆光 v3 水（r8 物理泡沫：Beer-Lambert 透明度、泡沫受光 = 太阳 Lambert + 天空半球 + 周围反射）、
//   画质专长包第 36/37/43/44/45 步（RGB 吸收 exp(−σ·光程)、压扁法线菲涅耳、浅处焦散只乘进反照率、泡沫进漫反射）；
//   平面倒影沿用 river_refl.ts（思路同 fps-repro MIT 的镜像相机 + 斜裁剪，已在 CREDITS 致谢）。
//   开关：?off=water2（或 localStorage darkrock_cine_off 含 water2）→ 全部回到 11-16 的旧水体。
//   分档：low = 不画反射 RT、不做焦散 / 闪烁 / 多次采样；medium = 1 次倒影采样 + 焦散；high / ultra = 2 次竖向拉长倒影采样 + 闪烁。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { riverReflUpdate, type RiverReflOpt } from './river_refl';

let _off = false;
try { _off = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('off') || '').split(',').some(s => s.trim() === 'water2'); } catch { /* 读不到就开 */ }
try { if (typeof localStorage !== 'undefined' && (localStorage.getItem('darkrock_cine_off') || '').split(',').some(s => s.trim() === 'water2')) _off = true; } catch { /* ignore */ }
/** ?off=water2 关掉（建材质时读；运行时改要重进场景） */
export const WATER2 = { off: _off, splashes: 0 };
export type W2Tier = 'low' | 'mid' | 'high';
/** 当前水体档：low / mid（中）/ high（高、超高） */
export const w2Tier = (): W2Tier => curQuality === 'low' ? 'low' : curQuality === 'medium' ? 'mid' : 'high';
/** 着色器宏（拼在 GLSL 前面）：W2_LOW / W2_MID / W2_HIGH */
export const w2Defs = (t: W2Tier = w2Tier()) => `#define W2_${t.toUpperCase()}\n`;

/** 共享 GLSL（全部 w2 前缀；不用 half / patch 作名字）。需要的宏由 w2Defs 给。 */
export const W2_GLSL = /* glsl */ `
float w2Hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float w2Vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(w2Hash(i), w2Hash(i + vec2(1.0, 0.0)), f.x), mix(w2Hash(i + vec2(0.0, 1.0)), w2Hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// RGB 吸收（Beer-Lambert）：depth 米、vy = 视线与竖直夹角余弦；返回透射率（1 = 清澈见底）。σ 偏红：红光最先被吃掉 → 越深越青
vec3 w2Absorb(float depth, float vy, float murk){ float path = depth * (1.0 + 1.0 / max(vy, 0.22)) * 0.5; return exp(-vec3(0.8, 0.27, 0.36) * murk * path); }
// 水体本色：浅处透出 sh、深处 dp（逐通道按透射率混）
vec3 w2Body(vec3 sh, vec3 dp, vec3 tr){ return sh * tr + dp * (1.0 - tr); }
// 吸收给的不透明度：浅处透、深处实
float w2BodyA(vec3 tr){ return clamp(1.0 - dot(tr, vec3(0.3333)), 0.0, 1.0); }
// 菲涅耳：压扁法线（细浪只扰动反射方向，不决定反射多少），F0 = 0.02
float w2Fresnel(vec3 n, vec3 v){ vec3 nf = normalize(vec3(n.x * 0.3, n.y, n.z * 0.3)); return 0.02 + 0.98 * pow(1.0 - clamp(dot(nf, v), 0.0, 1.0), 5.0); }
// 没有倒影 RT 时的天空 / 岸反射兜底：天顶略暗、地平线亮；反射线压到地平线以下时换暗岸色（岸林剖面噪声）
vec3 w2SkyRefl(vec3 r, vec3 sky, vec3 bank){ float az = atan(r.x, r.z);
  float sil = 0.03 + 0.05 * w2Vn(vec2(az * 6.0, 1.0)) + 0.025 * w2Vn(vec2(az * 21.0, 3.0));
  vec3 c = sky * mix(1.05, 0.72, smoothstep(0.0, 0.8, r.y));
  return mix(bank, c, smoothstep(sil - 0.015, sil + 0.015, r.y)); }
// 泡沫 = 水面上一层气泡：不透明度按光学厚度 1 − exp(−2.3·foam²·噪声)，新泡沫厚、老泡沫只剩一层（秋林 r8）
float w2FoamOp(float foam, float n){ return 1.0 - exp(-2.3 * foam * foam * (0.5 + 0.8 * n)); }
// 网状泡沫：蕾丝噪声阈值（越淡越碎）
float w2FoamLace(vec2 p, float t, float foam){
  float nz = w2Vn(p * 3.1 + t * vec2(0.05, 0.03)) * 0.45 + w2Vn(p * 7.7 - t * 0.04) * 0.33 + w2Vn(p * 19.0) * 0.22;
  float lace = 1.0 - abs(w2Vn(p * 9.3 + 3.0) * 2.0 - 1.0); nz = mix(nz, lace, 0.45);
  return smoothstep(nz - 0.07, nz + 0.04, foam * 0.9); }
// 泡沫颜色 = 它收到的光：太阳 Lambert + 天空半球 + 周围反射，再叠湿表面菲涅耳反射（不是固定灰白）
vec3 w2FoamLit(vec3 albedo, vec3 sunIrr, vec3 skyIrr, vec3 refl, float F){ return albedo * (sunIrr * 0.75 + skyIrr * 1.05 + refl * 0.4) + refl * F * 0.5; }
// 浅处焦散（解析近似：两层错开的扭曲正弦脊线，取最亮的细线）；乘进反照率，阴影里自然没有
float w2Caus(vec2 p, float t){
  vec2 q = p + vec2(w2Vn(p * 0.35 + t * 0.07), w2Vn(p * 0.35 - t * 0.05 + 4.0)) * 1.8;
  float a = abs(sin(q.x * 1.9 + sin(q.y * 1.3 + t * 0.9) * 1.7) + sin(q.y * 2.1 - t * 0.7 + sin(q.x * 0.9) * 1.4));
  float b = abs(sin(q.y * 2.6 + sin(q.x * 1.7 - t * 0.8) * 1.5) + sin(q.x * 2.3 + t * 0.6));
  return pow(1.0 - clamp(min(a, b) * 0.5, 0.0, 1.0), 7.0); }
// 闪烁高光：每个小格随机抖一个微法线，正好对上半角向量才亮（远处格子放大，免得闪成噪点）
float w2Glint(vec2 p, float dist, float t, vec3 n, vec3 hv){
  float cs = 0.06 * (1.0 + dist * 0.05); vec2 ci = floor(p / cs); float ph = floor(t * 7.0 + w2Hash(ci) * 7.0);
  vec2 rn = vec2(w2Hash(ci + ph * 1.37), w2Hash(ci.yx + ph * 2.11)) - 0.5;
  return smoothstep(0.9986, 0.99985, dot(normalize(n + vec3(rn.x, 0.0, rn.y) * 0.3), hv)); }
`;

/** 平面倒影（中 / 高档）：水面 onBeforeRender 里调。沿用 river_refl 的 RT 与剔除表；中档 ⅓ 分辨率、每 3 帧一画，高档 ½、每 2 帧 */
//   11-19 qlmirror：不再改写全局 RIVER_REFL.scale / every（原来 DLC 一调就把原野河的设置也改了），改为按调用传参；opt 给了就用它（钟井深渊 r8 镜面 0.42 / 0.33、每帧）
export function w2ReflUpdate(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, planeY: number, opt?: RiverReflOpt) {
  if (WATER2.off || w2Tier() === 'low') return;
  const mid = w2Tier() === 'mid';
  riverReflUpdate(renderer, scene, camera, planeY, 1, opt ?? { scale: mid ? 0.33 : 0.5, every: mid ? 3 : 2 });
}

// ---------------------------------------------------------------- 涉水 / 游泳水花（思路学 秋林 splash_v2：继承速度的抛物线水珠、
//   阻力 ∝ 1/尺寸、寿命淡出、颜色 = 身后天光 × 透射，不是灰白常量；自写，Points 一次绘制，低档 24 颗）
type Spl = { pts: THREE.Points; pos: Float32Array; vel: Float32Array; life: Float32Array; size: Float32Array; n: number; next: number; t: number };
let _spl: Spl | null = null;
const SPL_VS = /* glsl */ `attribute float aLife; attribute float aSize; varying float vL; varying float vNear;
void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); vNear = smoothstep(0.6, 2.5, -mv.z);
  gl_PointSize = aSize * 300.0 / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`;
const SPL_FS = /* glsl */ `uniform vec3 uAir; varying float vL; varying float vNear;
void main(){ if (vL <= 0.0) discard; vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.15, r) * min(1.0, vL * 3.0) * 0.45 * vNear;
  gl_FragColor = vec4(uAir * vec3(0.86, 0.98, 0.96), a); }`;
function splInit(scene: THREE.Object3D) {
  const n = w2Tier() === 'low' ? 24 : w2Tier() === 'mid' ? 72 : 120;
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), life = new Float32Array(n).fill(-1), size = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aLife', new THREE.BufferAttribute(life, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uAir: { value: new THREE.Color(0.75, 0.8, 0.82) } }, vertexShader: SPL_VS, fragmentShader: SPL_FS, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3; pts.name = 'w2_splash'; pts.userData.noRefl = true;
  scene.add(pts);
  _spl = { pts, pos, vel: new Float32Array(n * 3), life, size, n, next: 0, t: performance.now() / 1000 };
}
/** 涉水落脚溅水（世界坐标；y = 水面高度；k 0..1 = 跑动强度；vx/vz = 玩家速度，水珠继承一部分）。scene = 水面所在场景 */
export function w2Splash(scene: THREE.Object3D, x: number, y: number, z: number, k = 0.6, vx = 0, vz = 0, air?: THREE.Color) {
  if (WATER2.off) return;
  if (!_spl || _spl.pts.parent !== scene) { if (_spl) { _spl.pts.removeFromParent(); _spl.pts.geometry.dispose(); (_spl.pts.material as THREE.Material).dispose(); } splInit(scene); }
  const S = _spl!; if (air) (S.pts.material as THREE.ShaderMaterial).uniforms.uAir.value.copy(air);
  const m = w2Tier() === 'low' ? 3 : 6 + Math.round(4 * k);
  for (let j = 0; j < m; j++) {
    const i = S.next % S.n; S.next = i + 1; const o = i * 3, a = Math.random() * Math.PI * 2, r = Math.random() * 0.35;
    S.pos[o] = x + Math.cos(a) * r; S.pos[o + 1] = y + 0.05; S.pos[o + 2] = z + Math.sin(a) * r;
    const out = 0.6 + Math.random() * 1.2;
    S.vel[o] = Math.cos(a) * out + vx * 0.35; S.vel[o + 1] = (1.4 + Math.random() * 2.2) * (0.6 + k * 0.6); S.vel[o + 2] = Math.sin(a) * out + vz * 0.35;
    S.life[i] = 0.45 + Math.random() * 0.4; S.size[i] = 0.05 + Math.random() * 0.09;
  }
  WATER2.splashes++;
}
/** 每帧推一次（waterTick 里调）；无活跃水珠时几乎不花钱 */
export function w2SplashTick() {
  const S = _spl; if (!S) return;
  const now = performance.now() / 1000, dt = Math.min(0.05, now - S.t); S.t = now; if (dt <= 0) return;
  let any = false;
  for (let i = 0; i < S.n; i++) {
    if (S.life[i] <= 0) continue;
    S.life[i] -= dt; if (S.life[i] <= 0) { S.life[i] = -1; continue; }
    any = true; const o = i * 3, drag = Math.exp(-dt * 0.06 / S.size[i]);   // 小水珠阻力大
    S.vel[o] *= drag; S.vel[o + 2] *= drag; S.vel[o + 1] = S.vel[o + 1] * drag - 9.8 * dt;
    S.pos[o] += S.vel[o] * dt; S.pos[o + 1] += S.vel[o + 1] * dt; S.pos[o + 2] += S.vel[o + 2] * dt;
  }
  if (!any && S.pts.userData.idle) return;
  S.pts.userData.idle = !any;
  const g = S.pts.geometry; (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true; (g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true; (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
}
