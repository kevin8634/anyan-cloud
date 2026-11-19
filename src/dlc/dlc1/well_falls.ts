// 11-18 20:06 Rhett「井壁没有任何瀑布，只有一些光条向上冲；用水的专长包里的水花代码写瀑布，朝下流水别朝上飞」
//   旧井壁水帘（well_depth_hd 7）贴图 offset 往负走 → 纹路往上爬，看着是上冲的光条；本模块替换它。
//   每道瀑布 = 两部分：
//   1) 水帘：贴着井壁的弧形条带（顶部从井沿外冲 1.6 米再贴墙），着色器里逐列水丝往下流，越往下流速越快（√ 加速）、越散；底部融进深渊雾。
//   2) 水珠 / 水雾：移植秋林逆光 r8 水花（splash_v2.js）的做法——带阻力的抛体 posAt(t)=p0+v0(1-e)/k+g(t-(1-e)/k)/k，
//      屏幕空间按速度拉成运动模糊条（快门 1/60），预乘 alpha 混合；水珠从井沿抛出、一路往下落（g=9.8，终速 g/k），只往下不往上。
//      底部是贴着深渊水面横向铺开的水雾团（不上升）。
//   画质：低档不建；中档 4 道、每道 120 粒；高档 6 道、每道 260 粒。?off=wellfall 关（回旧水帘）。
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { WELL_R, WELL_ABYSS, wfbm } from './well_terrain';
import { QL } from '../../web/ql_water_flags';

export const WELL_FALL_ON = (() => { try { return !/(?:[?&]off=[^&]*\bwellfall\b)/.test(location.search); } catch { return true; } })();
const R0 = WELL_R + 2, CY = (40 + WELL_ABYSS - 3) / 2;
/** 井壁内表面半径（与 well_route_hd 的井壁同一公式，不含洞） */
const wallR = (a: number, y: number) => { const yy = y - CY; return R0 + (wfbm(a * 9 + 3, yy * 0.05) - 0.5) * 2.8 + Math.sin(yy * 0.21 + a * 3) * 0.3; };
const TOP = 37, BOT = WELL_ABYSS + 3.2;   // 井沿下 3 米起落，落到深渊水面
const U = { uT: { value: 0 } };
const fx: { mats: THREE.ShaderMaterial[] } = { mats: [] };
export const wellFallStats = { falls: 0, drops: 0, rings: 0 };

function sheetMat(seed: number) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSeed: { value: seed }, uCol: { value: new THREE.Color(0xd6eaf0) }, uDeep: { value: new THREE.Color(0x6f8f9a) } }]),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vU; varying float vFall;
#include <fog_pars_vertex>
void main() { vU = uv; vFall = uv.y; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uT; uniform float uSeed; uniform vec3 uCol; uniform vec3 uDeep; varying vec2 vU; varying float vFall;
#include <fog_pars_fragment>
float h1(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  // vU.x：横向 0..1；vFall：从井沿往下落的米数（0 在顶）
  float d = vFall, x = vU.x;
  // 下落距离 → 自由落体时间 t=√(2d/g)；水丝纹理坐标用「时间」走，越往下纹理越拉长 = 越快
  float tf = sqrt(2.0 * max(d, 0.0) / 9.8);
  float cols = 34.0, cx = x * cols;
  float ci = floor(cx), cf = fract(cx);
  float w = 0.0;
  for (int k = 0; k < 2; k++) {   // 两层水丝，错开相位
    float kk = float(k), id = ci + kk * 57.0;
    float sp = 0.9 + h1(id) * 0.6;
    // 纹理坐标 = 落下时间 − 当前时间 → 纹路随时间往「下」移
    float s = tf * 2.2 * sp - uT * 1.35 * sp + h1(id + 3.0) * 9.0;
    float streak = smoothstep(0.35, 0.95, n1(s * 3.0 + id)) * (0.55 + 0.45 * n1(s * 11.0 - id));
    float thin = smoothstep(0.5, 0.0, abs(cf - 0.5 - (h1(id + 7.0) - 0.5) * 0.5) - 0.18 * (1.0 + d * 0.012));
    w += streak * thin * (kk < 0.5 ? 1.0 : 0.6);
  }
  float body = 0.35 + 0.65 * n1(x * 9.0 + tf * 1.5 - uT * 1.1);          // 整片水幕的明暗起伏，同样往下走
  float edge = smoothstep(0.0, 0.16, x) * smoothstep(1.0, 0.84, x);
  float top = smoothstep(0.0, 0.8, d);
  float fade = 1.0 - smoothstep(55.0, 106.0, d);                          // 越往下越散成雾
  float a = clamp((w * 0.85 + body * 0.32) * edge * top, 0.0, 1.0) * (0.25 + 0.75 * fade);
  a *= 0.78;
  vec3 col = mix(uCol, uDeep, smoothstep(10.0, 80.0, d)) * (0.75 + 0.5 * w);
  gl_FragColor = vec4(col, a);
#include <fog_fragment>
}`,
  });
  (m.uniforms as Record<string, { value: unknown }>).uT = U.uT; fx.mats.push(m); return m;
}

/** 一道瀑布的水帘：沿井壁弧向 width 米，从 TOP 落到 BOT；顶部 2 米内从井沿外冲 1.6 米，再贴回墙前 0.7 米 */
function sheetGeo(a0: number, width: number) {
  const cols = 12, rows = 64, pos: number[] = [], uv: number[] = [], idx: number[] = [], H = TOP - BOT;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, d = Math.pow(v, 1.35) * H, y = TOP - d;            // 顶部行密（拐弯处）
    const out = 1.6 * Math.exp(-d / 3.5) + 0.7 + Math.min(d, 30) * 0.02;   // 冲出井沿再贴墙
    const spread = 1 + d * 0.006;                                           // 越往下越宽
    for (let i = 0; i <= cols; i++) { const u = i / cols, a = a0 + (u - 0.5) * width * spread / R0, r = wallR(a, y) - out;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uv.push(u, d); }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); return g;
}

/** r8 水花移植：带阻力抛体 + 速度拉条（每粒一个四边形实例） */
function dropsMesh(falls: { a: number; w: number }[], per: number) {
  const N = falls.length * per, NM = falls.length * Math.round(per * 0.3);
  const A = new Float32Array((N + NM) * 4), B = new Float32Array((N + NM) * 4), C = new Float32Array((N + NM) * 4);
  let i = 0; const r = (() => { let s = 4242; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (const f of falls) {
    for (let k = 0; k < per; k++, i++) {   // 水珠：从井沿抛出（外冲 0.6–2.2 m/s、几乎不上扬），阻力 k=0.55 → 终速 ≈ 18 m/s
      const a = f.a + (r() - 0.5) * f.w / R0, y = TOP - r() * 1.5, rr = wallR(a, y) - 1.2, nx = -Math.cos(a), nz = -Math.sin(a), vo = 0.6 + r() * 1.6;
      const kD = 0.45 + r() * 0.25, life = 5.5 + r() * 2.5;
      A.set([Math.cos(a) * rr, y, Math.sin(a) * rr, r() * life], i * 4);
      B.set([nx * vo + (r() - 0.5) * 0.5, -r() * 0.6, nz * vo + (r() - 0.5) * 0.5, life], i * 4);
      C.set([0.03 + r() * 0.05, 0, r(), kD], i * 4);
    }
  }
  for (const f of falls) {
    for (let k = 0; k < Math.round(per * 0.3); k++, i++) {   // 底部水雾：深渊水面上横向铺开，不上升
      const a = f.a + (r() - 0.5) * f.w * 1.6 / R0, y = BOT + 0.5 + r() * 3, rr = wallR(a, y) - 2 - r() * 4, nx = -Math.cos(a), nz = -Math.sin(a), vo = 0.4 + r() * 1.2, life = 6 + r() * 4;
      A.set([Math.cos(a) * rr, y, Math.sin(a) * rr, r() * life], i * 4);
      B.set([nx * vo + (r() - 0.5) * 0.8, -0.05, nz * vo + (r() - 0.5) * 0.8, life], i * 4);
      C.set([3 + r() * 4, 1, r(), 0.6], i * 4);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  g.instanceCount = N + NM;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(1920, 1080) }, uCol: { value: new THREE.Color(0xdcecf2) } }]),
    transparent: true, depthWrite: false, fog: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; uniform float uT; uniform vec2 uRes; varying vec2 vQ; varying float vK, vA;
#include <fog_pars_vertex>
// splash_v2 posAt：带线性阻力的抛体（k = aC.w）
vec3 posAt(float t, out vec3 vel) { float k = aC.w, e = exp(-k * t); vec3 G3 = vec3(0.0, -9.8, 0.0); vel = aB.xyz * e + G3 * (1.0 - e) / k; return aA.xyz + aB.xyz * (1.0 - e) / k + G3 * (t - (1.0 - e) / k) / k; }
void main() {
  vQ = position.xy; vK = aC.y;
  float life = aB.w, tau = mod(uT + aA.w, life);
  vec3 vel, p;
  if (aC.y < 0.5) { p = posAt(tau, vel); if (p.y < ${BOT.toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; } }
  else { float e = 1.0 - exp(-0.35 * tau); p = aA.xyz + aB.xyz * e / 0.35; vel = aB.xyz; }
  vA = smoothstep(0.0, 0.25, tau) * (1.0 - smoothstep(life * 0.7, life, tau));
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  if (aC.y < 0.5) {   // 运动模糊条：快门 1/60 × 3（远看才看得出是水线），沿速度方向拉长
    vec3 L = vel * (3.0 / 60.0);
    vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p - 0.5 * L, 1.0), c1 = projectionMatrix * modelViewMatrix * vec4(p + 0.5 * L, 1.0);
    if (c0.w < 0.05 || c1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec2 s0 = c0.xy / c0.w * 0.5 * uRes, s1 = c1.xy / c1.w * 0.5 * uRes, d = s1 - s0; float len = length(d);
    vec2 t = len > 0.01 ? d / len : vec2(0.0, 1.0), n = vec2(-t.y, t.x);
    float depth = 0.5 * (c0.w + c1.w), w = max(aC.x * uRes.y * 1.2 / depth, 1.3);
    float a = position.x * 0.5 + 0.5; vec2 sp = mix(s0, s1, a) + t * position.x * w * 0.5 + n * position.y * w * 0.5;
    vec4 cl = mix(c0, c1, a); gl_Position = vec4(sp / (0.5 * uRes) * cl.w, cl.z, cl.w);
    vA *= min(1.0, aC.x * uRes.y * 1.2 / depth / 1.3) * 0.9;
  } else { mvPosition.xy += position.xy * aC.x * (1.0 + tau * 0.12); gl_Position = projectionMatrix * mvPosition; vA *= 0.16; }
#include <fog_vertex>
}`,
    fragmentShader: `uniform vec3 uCol; varying vec2 vQ; varying float vK, vA;
#include <fog_pars_fragment>
void main() { float r = length(vQ); float m = vK < 0.5 ? (1.0 - smoothstep(0.55, 1.0, abs(vQ.y))) * (1.0 - smoothstep(0.7, 1.0, abs(vQ.x))) : (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r));
  float a = m * vA; gl_FragColor = vec4(uCol * a, a);
#include <fog_fragment>
}`,
  });
  (m.uniforms as Record<string, { value: unknown }>).uT = U.uT; fx.mats.push(m);
  const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = 3; me.onBeforeRender = (r2) => { r2.getDrawingBufferSize(m.uniforms.uRes.value as THREE.Vector2); };
  wellFallStats.drops = N + NM;
  if (QL.wellFallRing) me.add(ringMesh(A, B, C, N));
  return me;
}

/** 11-19 wellfallring（Rhett 03:04「瀑布落点涟漪」）：r8 ringMat 原式——复用水珠实例数据，落水后 0–0.7 s 画一个扩散环
 *  rad = (.04 + 1.05·√τ)·min(size / .012, 2.6)、环形 smoothstep(.62,.86)·smoothstep(1,.88) + 中心 .25、α = .42·(1−x)²。
 *  落水时间按 r8 hitT 在 CPU 一次解出（同 posAt 闭式解、二分 6 次），只取落到深渊水面前寿命还没到的水珠。
 *  与 r8 的差别：r8 颜色 = 太阳·阴影·sun.y·.55 + airCol(上)·.8；井底没有太阳 → 用水珠色 uCol·.55 + 场景雾（fog_fragment）。?off=wellfallring 关 */
function ringMesh(A: Float32Array, B: Float32Array, C: Float32Array, n: number) {
  const WL = WELL_ABYSS + 3, H = new Float32Array(n);
  const yAt = (y0: number, vy: number, k: number, t: number) => { const e = Math.exp(-k * t); return y0 + vy * (1 - e) / k - 9.8 * (t - (1 - e) / k) / k; };
  let rings = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4, y0 = A[o + 1], vy = B[o + 1], k = C[o + 3], life = B[o + 3];
    let a = 0, b = 0.05; while (b < life && yAt(y0, vy, k, b) > WL) b += 0.05;
    if (b >= life) { H[i] = -1; continue; }
    a = b - 0.05; for (let j = 0; j < 6; j++) { const m2 = (a + b) / 2; if (yAt(y0, vy, k, m2) > WL) a = m2; else b = m2; }
    H[i] = (a + b) / 2; rings++;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(A.subarray(0, n * 4), 4)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B.subarray(0, n * 4), 4));
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(C.subarray(0, n * 4), 4)); g.setAttribute('aH', new THREE.InstancedBufferAttribute(H, 1));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCol: { value: new THREE.Color(0xdcecf2) }, uWL: { value: WL } }]),
    transparent: true, depthWrite: false, fog: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute float aH; uniform float uT, uWL; uniform vec3 uCol; varying vec4 vC; varying vec2 vQ;
#include <fog_pars_vertex>
vec3 posAt(float t) { float k = aC.w, e = exp(-k * t); vec3 G3 = vec3(0.0, -9.8, 0.0); return aA.xyz + aB.xyz * (1.0 - e) / k + G3 * (t - (1.0 - e) / k) / k; }
void main() {
  vQ = position.xy; float life = aB.w, tau = mod(uT + aA.w, life) - aH;
  if (aC.y > 0.5 || aH < 0.0 || tau < 0.0 || tau > 0.7) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec4(0.0); return; }
  vec3 p = posAt(aH); p.y = uWL + 0.012; float rad = (0.04 + 1.05 * sqrt(tau)) * min(aC.x / 0.012, 2.6);
  vec4 mvPosition = modelViewMatrix * vec4(p + vec3(position.x, 0.0, position.y) * rad, 1.0); gl_Position = projectionMatrix * mvPosition;
  float x = tau / 0.7, al = 0.42 * (1.0 - x) * (1.0 - x); vC = vec4(uCol * 0.55 * al, al);
#include <fog_vertex>
}`,
    fragmentShader: `varying vec4 vC; varying vec2 vQ;
#include <fog_pars_fragment>
void main() { float r = length(vQ); if (r > 1.0) discard; float ring = smoothstep(0.62, 0.86, r) * smoothstep(1.0, 0.88, r) + 0.25 * smoothstep(0.5, 0.0, r);
  gl_FragColor = vC * ring;
#ifdef USE_FOG
  gl_FragColor.rgb /= max(gl_FragColor.a, 1e-4);
#endif
#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.rgb *= gl_FragColor.a;
#endif
}`,
  });
  (m.uniforms as Record<string, { value: unknown }>).uT = U.uT; fx.mats.push(m);
  const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = 3; me.name = 'wellFallRings';
  wellFallStats.rings = rings;
  try { console.info(`[wellfallring] drops=${n} landing=${rings}`); } catch { /* */ }
  return me;
}

/** 建瀑布：mid=4 道，hi=6 道；放在区域原点、抵消 api.add 的地面高度（顶点已是局部绝对坐标） */
export function wellFalls(api: WildBuildApi, hi: boolean) {
  fx.mats = []; U.uT.value = 0;
  const all = [{ a: 1.1, w: 7 }, { a: 2.4, w: 5 }, { a: 4.3, w: 8 }, { a: 5.4, w: 5.5 }, { a: 0.35, w: 4.5 }, { a: 3.3, w: 6 }];
  const falls = hi ? all : all.slice(0, 4), root = new THREE.Group();
  falls.forEach((f, i) => { const me = new THREE.Mesh(sheetGeo(f.a, f.w), sheetMat(i + 1)); me.frustumCulled = false; me.renderOrder = 2; root.add(me); });
  root.add(dropsMesh(falls, hi ? 260 : 120));
  root.position.y = -api.groundY(0, 0); api.add(root, 0, 0);
  wellFallStats.falls = falls.length;
  try { console.info(`wellfall falls=${falls.length} drops=${wellFallStats.drops}`); } catch { /* */ }
}
export function wellFallTick(dt: number) { U.uT.value += dt; }
