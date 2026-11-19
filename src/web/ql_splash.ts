// ======================================================================
// 11-19 qlsplash：秋林逆光 r8「水花 v2」（src.html 730–857 / splash_v2.js）移植到原野河 / 腐沼水（qlriver 水面）
//   Rhett 11-19 03:04 拍板：原野河不加船 → 发射源换成玩家涉水（WAKE：脚底在 qlriver 水面下、速度、朝向）。
//   原样保留：一个环形缓冲 + 两个实例化绘制（水珠 / 水帘 / 水雾共用实例数据，落水涟漪复用水珠数据）；CPU 只在发射时写 (p0,t0)(v0,tEnd)(size,kind,seed,drag)；
//   位置在顶点着色器按线性阻力抛物线闭式解求出、落水时间发射时二分解出；快门拉条、HG 逆光、阴影、airCol、capHDR、噪声溶解水雾、落水环（0–0.7 s）。
//   池容量同 r8 分档（高 8400+320 / 中 4300+160 / 低 1200+48）。
//   改动（写明）：发射几何按人腿（前方水帘 / 身后踢水 / 低平冲刷 / 侧甩）缩到人体尺度，发射率 = r8 船速满速的 6%（一个人涉水，不是 8 m/s 快艇）；
//   雾：Demo 区用 Demo applyFog 原式（雾底跟玩家脚下），非 Demo 区不加雾。?off=qlsplash 关。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { QL } from './ql_water_flags';
import { WAKE } from './water_wake';
import { QLU, CU, CDEMO, CDEMO2 } from './cine';

const CNTS = { high: { drop: 8400, mist: 320 }, medium: { drop: 4300, mist: 160 }, low: { drop: 1200, mist: 48 } };
let TIER: keyof typeof CNTS = 'high', CNT = CNTS.high;   // 第一次发射时按当时画质定（模块加载时画质还没设）
const RATE = 0.06, VREF = 5;   // 人跑动约 5 m/s 算满速（r8 船 8 m/s）
export const QLSPLASH_STAT = { emitted: 0, live: 0, pool: 0 };

let S: ReturnType<typeof build> | null = null;
function build() {
  TIER = curQuality === 'low' ? 'low' : curQuality === 'medium' ? 'medium' : 'high'; CNT = CNTS[TIER]; QLSPLASH_STAT.pool = CNT.drop + CNT.mist;
  const ND = CNT.drop, NM = CNT.mist, N = ND + NM;
  const A = new Float32Array(N * 4), B = new Float32Array(N * 4), C = new Float32Array(N * 4); for (let i = 0; i < N; i++) { A[i * 4 + 3] = -99; B[i * 4 + 3] = 0; }
  let _r = 90731; const r = () => ((_r = (_r * 16807) % 2147483647) / 2147483647);
  const G = 9.8; let iD = 0, iM = 0, accD = 0, accM = 0, dirty = true, WL = 0, simT = 0;
  const yAt = (y0: number, vy: number, k: number, g: number, t: number) => { const e = Math.exp(-k * t); return y0 + vy * (1 - e) / k - g * (t - (1 - e) / k) / k; };
  function hitT(y0: number, vy: number, k: number) { let a = 0, b = 0.04; while (b < 3 && yAt(y0, vy, k, G, b) > WL) b += 0.04; if (b >= 3) return 3; a = b - 0.04;
    for (let j = 0; j < 6; j++) { const m = (a + b) / 2; if (yAt(y0, vy, k, G, m) > WL) a = m; else b = m; } return (a + b) / 2; }
  function put(i: number, px: number, py: number, pz: number, vx: number, vy: number, vz: number, t0: number, tEnd: number, size: number, kind: number, drag: number) {
    const o = i * 4; A[o] = px; A[o + 1] = py; A[o + 2] = pz; A[o + 3] = t0; B[o] = vx; B[o + 1] = vy; B[o + 2] = vz; B[o + 3] = tEnd; C[o] = size; C[o + 1] = kind; C[o + 2] = r(); C[o + 3] = drag; dirty = true; }
  type Bt = { x: number; z: number };
  function drop(b: Bt, fw: number[], sd: number[], t0: number, lx: number, lz: number, vf: number, vs: number, vu: number, size: number, drag: number, kind = 0) {
    const px = b.x + fw[0] * lx + sd[0] * lz, pz = b.z + fw[1] * lx + sd[1] * lz, py = WL + 0.03;
    if (kind === 0) drag *= Math.min(2.4, Math.max(0.8, 0.012 / size));
    const vx = fw[0] * vf + sd[0] * vs, vz = fw[1] * vf + sd[1] * vs; put(iD, px, py, pz, vx, vu, vz, t0, hitT(py, vu, drag), size, kind, drag); iD = (iD + 1) % ND; QLSPLASH_STAT.emitted++; }
  function mist(b: Bt, fw: number[], sd: number[], t0: number, lx: number, lz: number, y: number, vf: number, vs: number, vu: number, size: number, life: number) {
    const px = b.x + fw[0] * lx + sd[0] * lz, pz = b.z + fw[1] * lx + sd[1] * lz; put(ND + iM, px, WL + y, pz, fw[0] * vf + sd[0] * vs, vu, fw[1] * vf + sd[1] * vs, t0, life, size, 1, 1.3); iM = (iM + 1) % NM; }
  /** r8 step 的人体版：v = 玩家速度，k = 速度 × 水深系数 */
  function step(dt: number, x: number, z: number, hd: number, v: number, depth: number) {
    simT += dt; const t = simT;
    const k = Math.min(1, v / VREF) * Math.min(1, depth / 0.3); if (k < 0.05) return;
    const fw = [Math.cos(hd), Math.sin(hd)], sd = [-Math.sin(hd), Math.cos(hd)], b = { x, z };
    accD += dt * k * ND / 1.1 * RATE;
    while (accD >= 1) { accD -= 1; const t0 = t - r() * dt; const u = r(); const sdn = r() < 0.5 ? 1 : -1;
      if (u < 0.34) {   // ① 腿前接触线 → 外抛水帘（r8 船头三分之一：继承 0.42·v、仰角 ≈ 35°、只变速度大小）
        const big = r() < 0.08, m = 0.8 + 1.6 * r() * r(), el = 0.62 + 0.22 * (r() - 0.5), sh = r() < 0.3;
        drop(b, fw, sd, t0, 0.05 + r() * 0.25, sdn * (0.16 + 0.08 * r()), v * (0.42 + 0.1 * r()), sdn * m * Math.cos(el), m * Math.sin(el) * 1.25, sh ? 0.05 + 0.06 * r() : (big ? 0.022 + 0.016 * r() : 0.006 + 0.010 * r()), 1.25, sh ? 2 : 0);
      } else if (u < 0.80) {   // ② 脚后踢水（r8 尾板「公鸡尾」：窄根、陡上抛、继承 0.16–0.28·v）
        const big = r() < 0.08, m = 1.6 + 2.4 * r(), sh = r() < 0.36;
        drop(b, fw, sd, t0, -0.15 - 0.1 * r(), sdn * (0.08 + 0.1 * r()), v * (0.16 + 0.12 * r()), sdn * (0.15 + 0.35 * r()) * m * 0.28, m * k, sh ? 0.07 + 0.08 * r() : (big ? 0.02 + 0.014 * r() : 0.007 + 0.011 * r()), sh ? 0.6 : 1.0, sh ? 2.5 : 0);
      } else if (u < 0.88) {   // ③ 低平冲刷
        drop(b, fw, sd, t0, -0.2 - 0.1 * r(), (r() - 0.5) * 0.3, v * (0.15 + 0.2 * r()), (r() - 0.5) * 1.2, 0.6 + 1.0 * r(), 0.008 + 0.014 * r(), 1.1);
      } else {   // ④ 两侧细碎飞沫（r8 转弯甩水的直行退化）
        drop(b, fw, sd, t0, -0.2 + r() * 0.4, sdn * 0.22, v * (0.35 + 0.15 * r()), sdn * (1.0 + 0.8 * r()), 0.6 + 1.4 * r(), 0.008 + 0.016 * r() * 0.6, 1.0);
      } }
    accM += dt * k * NM / 2.4 * RATE;
    while (accM >= 1) { accM -= 1; const t0 = t - r() * dt; const sdn = r() < 0.5 ? 1 : -1;
      mist(b, fw, sd, t0, -0.2 - 0.3 * r(), sdn * (0.2 + 0.25 * r()), 0.12 + 0.15 * r(), v * (0.28 + 0.12 * r()), sdn * (0.3 + 0.5 * r()), 0.1 + 0.25 * r(), 0.35 + 0.3 * r(), 1.6 + 1.2 * r()); }
  }
  const mkGeo = (n: number) => { const g = new THREE.InstancedBufferGeometry(); const pl = new THREE.PlaneGeometry(2, 2); g.index = pl.index; g.setAttribute('position', pl.attributes.position); g.instanceCount = n; return g; };
  const aA = new THREE.InstancedBufferAttribute(A, 4), aB = new THREE.InstancedBufferAttribute(B, 4), aC = new THREE.InstancedBufferAttribute(C, 4);
  for (const a of [aA, aB, aC]) a.setUsage(THREE.DynamicDrawUsage);
  const gAll = mkGeo(N); gAll.setAttribute('aA', aA); gAll.setAttribute('aB', aB); gAll.setAttribute('aC', aC);
  const gRing = mkGeo(ND); gRing.setAttribute('aA', aA); gRing.setAttribute('aB', aB); gRing.setAttribute('aC', aC);
  const UNI = { uPT: { value: 0 }, uPx: { value: 600 }, uRes: { value: new THREE.Vector2(1280, 720) }, uShut: { value: 1 / 60 }, uCamVel: { value: new THREE.Vector3() },
    tShadow: QLU.tQlShadow, uShM: QLU.uQlShM, uHasSh: QLU.uQlHasSh, uWL: { value: 0 }, uSheetK: { value: TIER === 'low' ? 1.6 : 1 }, uDropK: { value: TIER === 'low' ? 1.25 : 1 }, uSW: { value: 1 },
    uSunDir: QLU.uQlSun, uSunCol: QLU.uQlSunC, uFogC: QLU.uQlFogC, uFogK: { value: new THREE.Vector4(0, 0.04, 0, 0) }, uCam: { value: new THREE.Vector3() } };
  const HEAD = /* glsl */ `#include <packing>
  uniform vec3 uSunDir, uSunCol, uCam; uniform vec4 uFogC, uFogK; uniform float uHasSh;
  attribute vec4 aA, aB, aC; uniform float uPT, uPx, uShut, uWL, uSheetK, uDropK, uSW; uniform vec2 uRes; uniform vec3 uCamVel; uniform sampler2D tShadow; uniform mat4 uShM;
  vec3 airCol(vec3 dir){ float sm = dot(dir, uSunDir); float mu = max(sm, 0.); float bk = max(-sm, 0.);
    return uFogC.rgb * mix(vec3(1.), vec3(.80, .90, 1.10), bk * .75) + uSunCol * (pow(mu, 9.) * uFogC.w + mu * mu * uFogC.w * .22); }
  vec3 applyFog(vec3 col, vec3 wp){ if (uFogK.w < .5) return col; vec3 v = wp - uCam; float d = length(v); vec3 dir = v / max(d, 1e-3);
    float k = uFogK.y; float dy = v.y * k; float fh = abs(dy) > 1e-3 ? (1. - exp(-dy)) / dy : 1.;
    float od = uFogK.x * exp(-max(uCam.y - uFogK.z, 0.) * k) * d * fh; od *= smoothstep(0., 12., d) * .6 + .4;
    return mix(airCol(dir), col, max(exp(-od), 1. - .9)); }
  vec3 posAt(float t, out vec3 vel, float g){ float k = aC.w; float e = exp(-k * t); vec3 G3 = vec3(0., -g, 0.); vel = aB.xyz * e + G3 * (1. - e) / k; return aA.xyz + aB.xyz * (1. - e) / k + G3 * (t - (1. - e) / k) / k; }
  float litAt(vec3 p){ if (uHasSh < .5) return 1.; vec4 sc = uShM * vec4(p, 1.); if (sc.x > 0. && sc.x < 1. && sc.y > 0. && sc.y < 1. && sc.z < 1.) return step(sc.z - .004, unpackRGBAToDepth(texture2D(tShadow, sc.xy))); return 1.; }
  float hg(float mu, float g){ return (1. - g * g) / pow(1. + g * g - 2. * g * mu, 1.5) / 12.566; }
  vec3 capHDR(vec3 c, float m){ float l = dot(c, vec3(.2126, .7152, .0722)); return c * min(1., m / max(l, 1e-4)); }
  `;
  const blend = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;
  const mat = new THREE.ShaderMaterial({ ...blend, uniforms: UNI,
    vertexShader: HEAD + /* glsl */ `varying vec4 vC; varying vec2 vQ; varying float vEnd, vK, vSeed, vAge; varying vec3 vW;
  void main(){ vQ = position.xy; vK = aC.y; vSeed = aC.z; float tau = uPT - aA.w; vAge = 0.; vEnd = 1.; vW = vec3(0.);
    if (tau < 0. || tau > aB.w){ gl_Position = vec4(2., 2., 2., 1.); vC = vec4(0.); return; }
    vec3 vel; bool sheet = aC.y > 1.5;
    if (aC.y < .5 || sheet){
      vec3 p = posAt(tau, vel, 9.8); vec3 L = (vel - uCamVel) * uShut * (sheet ? 3.5 : 1.);
      vec4 c0 = projectionMatrix * viewMatrix * vec4(p - .5 * L, 1.), c1 = projectionMatrix * viewMatrix * vec4(p + .5 * L, 1.);
      if (c0.w < .05 || c1.w < .05){ gl_Position = vec4(2., 2., 2., 1.); vC = vec4(0.); return; }
      vec2 s0 = c0.xy / c0.w * .5 * uRes, s1 = c1.xy / c1.w * .5 * uRes; vec2 d = s1 - s0; float len = length(d); vec2 t = len > .01 ? d / len : vec2(1., 0.); vec2 n = vec2(-t.y, t.x);
      float depth = .5 * (c0.w + c1.w); float wTrue = aC.x * uPx / depth; float w = max(wTrue, 1.3);
      float a = position.x * .5 + .5; vec2 sp = mix(s0, s1, a) + t * position.x * w * .5 + n * position.y * w * .5;
      vec4 cl = mix(c0, c1, a); gl_Position = vec4(sp / (.5 * uRes) * cl.w, cl.z, cl.w); vEnd = w / (len + w);
      float cover = sheet ? .21 * pow(w / (len + w), .3) : min(wTrue / 1.3, 1.) * pow(w / (len + w), .45);
      vec3 V = normalize(p - uCam); float mu = dot(V, uSunDir); float lit = litAt(p);
      vec3 amb = airCol(normalize(vec3(-V.x, .35, -V.z))) * 1.05 + vec3(.16, .19, .23);
      vec3 col = uSunCol * lit * (hg(mu, sheet ? .6 : .68) * (sheet ? 3.3 : 2.4) + (sheet ? .16 : .08)) * vec3(1., .97, .9) + amb * (sheet ? 1.15 : 1.);
      col *= sheet ? uSheetK : uDropK; col = capHDR(applyFog(col, p), 2.4);
      float al = .55 * cover * smoothstep(0., sheet ? .12 : .05, tau) * (1. - tau / aB.w * (sheet ? .5 : .45)) * smoothstep(0., .06, p.y - uWL) * smoothstep(.6, 2.5, depth) * (sheet ? (aC.y > 2.25 ? mix(.4, 1., smoothstep(2.5, 7., depth)) : mix(.4 / uSW, 1., smoothstep(2.5, 7. + 6. * (uSW - 1.), depth))) : 1.); if (uSheetK > 1.01) al = min(1., al * (sheet ? 1.4 : 1.2));
      vC = vec4(col * al, al); vW = p;
    } else {
      float a01 = tau / aB.w; vAge = a01; vec3 p = posAt(tau, vel, -0.12);
      float sz = aC.x * (1. + 2.2 * sqrt(a01));
      vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float an = aC.z * 6.283; vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an)) * position.xy;
      vec3 wp = p + (rt * q.x * 1.25 + up * q.y * .45) * sz * .5; vW = wp; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
      vec3 V = normalize(p - uCam); float mu = dot(V, uSunDir); float lit = litAt(p);
      vec3 amb = airCol(vec3(0., 1., 0.)) * .55 + airCol(normalize(vec3(-V.x, .3, -V.z))) * .45 + vec3(.03, .045, .07);
      vec3 col = uSunCol * lit * (hg(mu, .72) * 1.5 + .2) * vec3(1., .93, .8) + amb; col = capHDR(applyFog(col, p), 2.0);
      float al = .13 * smoothstep(0., .08, a01) * (1. - a01) * (1. - a01) * smoothstep(1.2, 4.5, -(viewMatrix * vec4(p, 1.)).z);
      vC = vec4(col * al, al); } }`,
    fragmentShader: /* glsl */ `uniform float uWL, uPT; varying vec4 vC; varying vec2 vQ; varying float vEnd, vK, vSeed, vAge; varying vec3 vW;
  float hh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + 1.), f.x), f.y); }
  void main(){ if (vC.a <= 0.) discard;
    if (vK < .5){ float ac = 1. - vQ.y * vQ.y; float e = 1. - abs(vQ.x); float m = ac * smoothstep(0., vEnd, e); gl_FragColor = vC * m; return; }
    if (vK > 1.5){ float ac = 1. - vQ.y * vQ.y; ac *= ac; float e = 1. - abs(vQ.x); float st = vn(vec2(vQ.y * 6. + vSeed * 53., vQ.x * 1.2 + vSeed * 7.));
      float m = ac * smoothstep(0., .5, e) * (.35 + 1.1 * st * st); gl_FragColor = vC * m; return; }
    float r = length(vQ); if (r > 1.) discard; vec2 q = vQ * 1.6 + vSeed * 37.;
    float n = vn(q * 1.3 + vec2(0., uPT * .25)) * .5 + vn(q * 2.9 - uPT * .3) * .3 + vn(q * 6.1) * .2;
    float shape = smoothstep(1., .15, r); float d = shape * (.45 + .9 * n);
    float dis = .25 + .55 * vAge; float m = smoothstep(dis, dis + .35, d); m *= smoothstep(uWL + .02, uWL + .32, vW.y);
    gl_FragColor = vC * m; }` });
  const mesh = new THREE.Mesh(gAll, mat); mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.userData.noRefl = true; mesh.name = 'qlSplash';
  const ringMat = new THREE.ShaderMaterial({ ...blend, uniforms: UNI,
    vertexShader: HEAD + /* glsl */ `varying vec4 vC; varying vec2 vQ;
  void main(){ vQ = position.xy; float tau = uPT - aA.w - aB.w;
    if ((aC.y > .5 && aC.y < 1.5) || aC.z > .35 || aC.x < .007 || tau < 0. || tau > .7 || aB.w > 2.9){ gl_Position = vec4(2., 2., 2., 1.); vC = vec4(0.); return; }
    vec3 vel; vec3 p = posAt(aB.w, vel, 9.8); p.y = uWL + .012; float rad = (.04 + 1.05 * sqrt(tau)) * min(aC.x / .012, 2.6);
    vec3 wp = p + vec3(position.x, 0., position.y) * rad; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    float lit = litAt(p); vec3 col = uSunCol * lit * max(uSunDir.y, 0.) * .55 + airCol(vec3(0., 1., 0.)) * .8; col = capHDR(applyFog(col, p), 1.6);
    float x = tau / .7; float al = (aC.y > 1.5 ? .5 : .42) * (1. - x) * (1. - x); vC = vec4(col * al, al); }`,
    fragmentShader: /* glsl */ `varying vec4 vC; varying vec2 vQ; void main(){ float r = length(vQ); float ring = smoothstep(.62, .86, r) * smoothstep(1., .88, r) + .25 * smoothstep(.5, 0., r);
    if (r > 1.) discard; gl_FragColor = vC * ring; }` });
  const rings = new THREE.Mesh(gRing, ringMat); rings.frustumCulled = false; rings.renderOrder = 11; rings.userData.noRefl = true; rings.name = 'qlSplashRings';
  const group = new THREE.Group(); group.add(mesh, rings); group.userData.noRefl = true;
  const _sz = new THREE.Vector2();
  function pre(renderer: THREE.WebGLRenderer, cam: THREE.Camera, wl: number) {
    UNI.uPT.value = simT; UNI.uWL.value = wl; WL = wl; UNI.uShut.value = 1 / 60; UNI.uSW.value = 1;
    renderer.getDrawingBufferSize(_sz); UNI.uRes.value.copy(_sz);
    const pc = cam as THREE.PerspectiveCamera; if (pc.isPerspectiveCamera) UNI.uPx.value = _sz.y / (2 * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2));
    cam.getWorldPosition(UNI.uCam.value);
    UNI.uFogK.value.set(CDEMO2[3], 0.04, CU.fog[2], CDEMO[0]);   // Demo 区 = Demo applyFog（密度、k .04、雾底），非 Demo 区不加雾
    if (dirty) { aA.needsUpdate = aB.needsUpdate = aC.needsUpdate = true; dirty = false; }
  }
  function live() { let n = 0; for (let i = 0; i < N; i++) { const tau = simT - A[i * 4 + 3]; if (tau >= 0 && tau <= B[i * 4 + 3]) n++; } return n; }
  return { group, step, pre, live, setWL: (y: number) => { WL = y; } };
}

let _logged = false, _lastWL = 0, _statT = 0;
/** 每帧调（main，wakeTick 之后）：玩家在 qlriver 水面里才发射；已发射的水珠照常落完 */
export function qlSplashTick(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, dt: number) {
  if (!QL.splash || !QL.river) return;
  if (!S) { if (!WAKE.inQl) return; S = build(); }
  if (S.group.parent !== scene) scene.add(S.group);
  if (WAKE.inQl) { _lastWL = WAKE.waterY; S.setWL(_lastWL); }
  S.step(Math.min(dt, 0.1), WAKE.px, WAKE.pz, WAKE.hd, WAKE.inQl ? WAKE.spd : 0, WAKE.inQl ? WAKE.depth : 0);
  S.pre(renderer, cam, _lastWL);
  _statT += dt; if (_statT > 2) { _statT = 0; QLSPLASH_STAT.live = S.live(); }
  if (!_logged) { _logged = true; try { console.info(`[qlsplash] tier=${TIER} pool=${QLSPLASH_STAT.pool} rate=${RATE} src=player-wade rings=1`); } catch { /* */ } }
}
