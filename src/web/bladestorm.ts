// v1.2.73 剑刃风暴 v2（vfxlab/blade/bladestorm.ts 样板接入游戏；0 积分，贴图复用 vfxlab 已有的 blade/*，以 base64 放在 vfxtex.gen.ts，不碰 assets/）
// 层：① 地面刀痕（普通混合压暗，每跳加深，收尾后淡出）② 尘土体积（序列帧贴地漏斗 + 侧面片）
//     ③ 刀风线 v2：30 条错开短弧，半径 0.8 米 ~ 1.15r，内密外疏、内快外慢，随出随灭（不是整圈圆柱带）
//     ④ 碎屑粒子（碎石/尘团/草屑/火星）⑤ 收尾不规则冲击（角向噪声 + 断续碎片，不是正圆环）
// 规则：
//  - 跟随玩家：每帧把根节点放到 follow() 的位置；持续整个引导期（stop() 收尾 / 打断）
//  - 半径 r = s.stats.radius（已含符文「刃海」/ 装备范围加成）；地面片、弧半径、粒子数都跟着放大（粒子按面积，上限 600）
//  - 色板随技能元素：physical 且带叠层流血 → bleed；符文改元素（如「烈风」→ nature）切对应色板
//  - 流血：bleed() 返回当前流血层数（0~5），红线占比 15% → 85%
//  - 任何地面片都用角向噪声打散边缘，看不出正圆
import * as THREE from 'three';
import { live, fxQuality } from './vfx';
import { gy } from './gfx';
import { VFXTEX } from './vfxtex.gen';
import type { Element } from '../core/types';

type P2 = { x: number; z: number };
const SAMPLE_R = 5.5;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
const NORM = { transparent: true, depthWrite: false, side: THREE.DoubleSide } as const;

const texCache = new Map<string, THREE.Texture>();
function tex(id: string, srgb = true, repS = false): THREE.Texture {
  const k = id + (repS ? ':rep' : '');
  let t = texCache.get(k);
  if (!t) { t = new THREE.TextureLoader().load(VFXTEX[id]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (repS) t.wrapS = THREE.RepeatWrapping; texCache.set(k, t); }
  return t;
}

/** 色板：刀风线主色 a0..a1 / 副色 b0..b1，尘土轻染 dust、收尾冲击 ring；mixBase→mixMax = 副色占比（流血随层数涨） */
interface Tint { a: [number, number]; b: [number, number]; dust: number; ring: number; mixBase: number; mixMax: number }
export const BLADE_TINT: Record<string, Tint> = {
  physical:  { a: [0xc8d0dc, 0xffffff], b: [0x6e7682, 0xa8b0bc], dust: 0xa0a4aa, ring: 0xe8eeff, mixBase: 0.35, mixMax: 0.35 },
  bleed:     { a: [0xd0d8e4, 0xffffff], b: [0x7a0606, 0xff2a2a], dust: 0x8a4a40, ring: 0xff2a2a, mixBase: 0.15, mixMax: 0.85 },
  fire:      { a: [0xffd080, 0xffb050], b: [0xc02800, 0xff5a10], dust: 0x9a6a40, ring: 0xff6a20, mixBase: 0.5, mixMax: 0.5 },
  frost:     { a: [0xd8f0ff, 0xffffff], b: [0x1a6cff, 0x5ac8ff], dust: 0x8a9aa8, ring: 0x8fd8ff, mixBase: 0.55, mixMax: 0.55 },
  nature:    { a: [0xc8fff0, 0xffffff], b: [0x10b070, 0x40ffb0], dust: 0x7a9a70, ring: 0x40ffb0, mixBase: 0.55, mixMax: 0.55 },
  lightning: { a: [0xe0d8ff, 0xffffff], b: [0x6a3aff, 0xb08aff], dust: 0x8a84a0, ring: 0xa080ff, mixBase: 0.55, mixMax: 0.55 },
  arcane:    { a: [0xf0d8ff, 0xffffff], b: [0x8a20e0, 0xc060ff], dust: 0x947ca0, ring: 0xb050ff, mixBase: 0.55, mixMax: 0.55 },
  // 样板没有的两个游戏元素：暗影 = 紫黑，神圣 = 金白（同结构，仅换色）
  shadow:    { a: [0xb8a8d0, 0xe0d8f0], b: [0x3a0a5a, 0x7a2ab0], dust: 0x5a4a66, ring: 0x8a40d0, mixBase: 0.55, mixMax: 0.55 },
  holy:      { a: [0xfff4d0, 0xffffff], b: [0xd09a20, 0xffd860], dust: 0xa89a70, ring: 0xffe080, mixBase: 0.55, mixMax: 0.55 },
};
/** 技能元素 → 色板：物理且带流血叠层 = bleed */
export function bladePalette(el: Element, hasBleed: boolean): string {
  if (el === 'physical') return hasBleed ? 'bleed' : 'physical';
  return BLADE_TINT[el] ? el : 'physical';
}

// ---------- 着色器（全局共用：只编译一次，prewarm 预热） ----------
const NOISE = `float h1(float n){ return fract(sin(n) * 43758.5453); }
  float vn(float x){ float i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(h1(i), h1(i+1.), f); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
  float ang(vec2 q){ return atan(q.y, q.x) / 6.2832 + .5; }
  float angN(vec2 q, float k, float s){ float a = ang(q) * k; return mix(vn(a + s), vn(a - k + s), smoothstep(k - 1., k, a)); }
  float ragEdge(vec2 q, float r0, float soft, float seed){ float d = length(q); float n = .55 * angN(q, 7., seed) + .3 * angN(q, 17., seed * 1.7 + 3.) + .15 * vn2(q * 9. + seed);
    return smoothstep(r0 * (.62 + .5 * n), r0 * (.62 + .5 * n) - soft, d) * (.55 + .45 * vn2(q * 6. - seed)); }`;
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }';
const BILL_VS = 'varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }';

const slashMat = () => new THREE.ShaderMaterial({ ...NORM, fog: false, uniforms: { map: { value: tex('blade/slash') }, opacity: { value: 0 } }, vertexShader: VS,
  fragmentShader: `uniform sampler2D map; uniform float opacity; varying vec2 vUv; ${NOISE}
    void main(){ vec3 c = texture2D(map, vUv).rgb; float l = dot(c, vec3(.3,.59,.11)); float edge = ragEdge(vUv - .5, .5, .22, 1.3);
      vec3 col = mix(vec3(.08,.07,.06), vec3(.78,.72,.62), smoothstep(.12, .45, l));
      gl_FragColor = vec4(col, clamp(l * 3.5, 0., 1.) * opacity * edge); }` });
const dustMat = (tint: number, rate: number, bill: boolean) => new THREE.ShaderMaterial({ ...NORM, fog: false,
  uniforms: { map: { value: tex('shared/mist_8x8', false) }, t: { value: 0 }, rate: { value: rate }, a: { value: 0 }, tint: { value: new THREE.Color(tint) }, seed: { value: Math.random() * 50 } },
  vertexShader: bill ? BILL_VS : VS,
  fragmentShader: `uniform sampler2D map; uniform float t, rate, a, seed; uniform vec3 tint; varying vec2 vUv; ${NOISE}
    vec2 cell(float f){ f = mod(f, 64.); return (vec2(mod(f, 8.), 7. - floor(f / 8.)) + vUv) / 8.; }
    void main(){ float f = t * rate; float k = fract(f); float v = mix(texture2D(map, cell(floor(f))).r, texture2D(map, cell(floor(f) + 1.)).r, k);
      float edge = ragEdge(vUv - .5, .5, .3, seed + t * .4); gl_FragColor = vec4(tint * (.75 + .5 * v), v * a * edge); }` });
const arcMat = () => new THREE.ShaderMaterial({ ...ADD, fog: false,
  uniforms: { map: { value: tex('blade/streak', true, true) }, col: { value: new THREE.Color() }, a: { value: 0 }, off: { value: 0 }, len: { value: 1 }, rep: { value: 1.5 }, vo: { value: 0 }, wh: { value: 0.3 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D map; uniform vec3 col; uniform float a, off, len, rep, vo, wh; varying vec2 vUv;
    void main(){ float u = vUv.x / len; if (u > 1.) discard;
      float l = dot(texture2D(map, vec2(u * rep + off, .3 + vUv.y * .4 + vo)).rgb, vec3(.3,.59,.11));
      float f = smoothstep(0., .07, u) * pow(1. - u, 1.6) * pow(sin(3.14159 * vUv.y), 1.2);
      float i = (.15 + l) * 5.5 * f * a; vec3 c = mix(col, vec3(1.), wh * smoothstep(.6, .95, l));
      gl_FragColor = vec4(c * i, 1.); }` });
const ringMat = (col: number) => new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { col: { value: new THREE.Color(col) }, a: { value: 0 }, k: { value: 0 } }, vertexShader: VS,
  fragmentShader: `uniform vec3 col; uniform float a, k; varying vec2 vUv; ${NOISE}
    void main(){ vec2 q = vUv - .5; float d = length(q) * 2.;
      float n = .6 * angN(q, 9., 4.2) + .4 * angN(q, 23., 8.1); float rr = (.12 + .8 * k) * (.75 + .5 * n); float w = (.05 + .14 * k) * (.6 + .8 * angN(q, 13., 2.));
      float brk = smoothstep(.25, .7, angN(q, 31., 5.5 + k * 2.)) * (.5 + .5 * vn2(q * 14. + k * 3.));
      float i = exp(-pow((d - rr) / w, 2.)) * brk + .4 * smoothstep(rr, 0., d) * (1. - k) * vn2(q * 7. + 1.7);
      gl_FragColor = vec4(mix(col, vec3(1.), .2 * brk * exp(-pow((d - rr) / (w * .3), 2.))) * i * a, 1.); }` });
const PT_VS = `attribute float cell, size, alpha, rot; uniform float scale; varying float vC, vA, vR;
  void main(){ vC = cell; vA = alpha; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PT_FS = `uniform sampler2D map; uniform vec3 tint; varying float vC, vA, vR;
  void main(){ vec2 p = gl_PointCoord - .5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + .5; if (p.x<0.||p.x>1.||p.y<0.||p.y>1.) discard;
    vec2 uv = (vec2(mod(vC,2.), 1. - floor(vC/2.)) + vec2(p.x, 1.-p.y)) / 2.; gl_FragColor = vec4(texture2D(map, uv).rgb * tint * vA, 1.); }`;
const ptsMat = (viewH: number, tint: number) => new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { map: { value: tex('blade/debris') }, scale: { value: viewH / 2 }, tint: { value: new THREE.Color(tint) } }, vertexShader: PT_VS, fragmentShader: PT_FS });

/** prewarm 用：本模块全部着色器样本 */
export function bladestormSampleMaterials(): THREE.Material[] {
  return [slashMat(), dustMat(0xffffff, 20, false), dustMat(0xffffff, 20, true), arcMat(), ringMat(0xffffff), ptsMat(720, 0xffffff)];
}

let live_ = 0;
export const bladestormCount = () => live_;

export interface BladestormFx { stop(finish: boolean): void; readonly root: THREE.Group; readonly palette: string }

/**
 * 剑刃风暴 v2 引导特效。
 * @param follow 每帧取跟随点（玩家位置）
 * @param r 实际半径（s.stats.radius）
 * @param dur 引导时长
 * @param el 技能元素（符文改元素后的）
 * @param hasBleed 技能带叠层流血（物理 → bleed 色板）
 * @param bleed 当前流血层数（0~5），驱动红线占比
 */
export function bladestormFx(follow: () => P2, r: number, dur: number, el: Element, hasBleed: boolean, bleed: () => number, viewH = 720): BladestormFx {
  const palette = bladePalette(el, hasBleed), FT = BLADE_TINT[palette];
  const S = r / SAMPLE_R, lo = fxQuality === 'low';
  const root = new THREE.Group();
  const place = () => { const p = follow(); root.position.set(p.x, gy(p.x, p.z), p.z); };
  place();
  const pal = { a0: new THREE.Color(FT.a[0]), a1: new THREE.Color(FT.a[1]), b0: new THREE.Color(FT.b[0]), b1: new THREE.Color(FT.b[1]) };
  let stacks = 0;
  const mix = () => FT.mixBase + (FT.mixMax - FT.mixBase) * Math.min(1, stacks / 5);
  const dustTint = (base: number) => new THREE.Color(base).lerp(new THREE.Color(FT.dust), 0.35).getHex();
  const mats: THREE.Material[] = [], geos: THREE.BufferGeometry[] = [];
  // ① 地面刀痕
  const sm = slashMat(); mats.push(sm);
  const slashG = new THREE.PlaneGeometry(r * 2.2, r * 2.2); geos.push(slashG);
  const slash = new THREE.Mesh(slashG, sm); slash.rotation.x = -Math.PI / 2; slash.position.y = 0.04; slash.renderOrder = 2; root.add(slash);
  // ② 尘土
  const dusts: { m: THREE.Mesh; mat: THREE.ShaderMaterial; spin: number; amp: number }[] = [];
  for (const [y, s, spin, amp, rate] of (lo ? [[0.2, 2.2, 2.4, 0.5, 22]] : [[0.2, 2.2, 2.4, 0.55, 22], [0.9, 1.6, 3.2, 0.4, 28]]) as [number, number, number, number, number][]) {
    const mat = dustMat(dustTint(0x8a7a62), rate, false); const g = new THREE.PlaneGeometry(r * s, r * s); mats.push(mat); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 3; root.add(m); dusts.push({ m, mat, spin, amp });
  }
  const sides: { m: THREE.Mesh; mat: THREE.ShaderMaterial; ph: number }[] = [];
  if (!lo) for (let i = 0; i < 6; i++) {
    const mat = dustMat(dustTint(0x9a8a70), 20 + i * 3, true); const g = new THREE.PlaneGeometry(4 * Math.sqrt(S), 2.4); mats.push(mat); geos.push(g);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; root.add(m); sides.push({ m, mat, ph: i / 6 * Math.PI * 2 });
  }
  // ③ 刀风线 v2
  const ARC_MAX = Math.PI * 150 / 180;
  const arcGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true, -ARC_MAX / 2, ARC_MAX); geos.push(arcGeo);
  type Arc = { pivot: THREE.Group; m: THREE.Mesh; mat: THREE.ShaderMaterial; r0: number; y0: number; h: number; spd: number; ph: number; age: number; life: number; amax: number; grow: number; rise: number };
  const arcs: Arc[] = [];
  const NA = lo ? 14 : 30;
  const R_IN = 0.8, R_OUT = r * 1.15;   // 最外略溢出伤害范围，外缘稀疏渐隐
  const rnd = Math.random;
  const spawnArc = (a: Arc, warm = false) => {
    a.r0 = R_IN + Math.pow(rnd(), 1.15) * (R_OUT - R_IN);
    const k = (a.r0 - R_IN) / Math.max(0.01, R_OUT - R_IN);
    a.spd = Math.max(-9, Math.min(-5, -(9 - 4 * k) * (0.88 + rnd() * 0.24)));
    a.y0 = 0.2 + rnd() * 1.6; a.h = 0.08 + rnd() * 0.32; a.ph = rnd() * 6.283;
    a.life = 0.3 + rnd() * 0.5; a.age = warm ? rnd() * a.life : 0; a.amax = 0.5 + rnd() * 0.7;
    a.grow = (0.2 + rnd() * 0.5) * (a.r0 > r ? 0.4 : 1); a.rise = 0.1 + rnd() * 0.4;
    const tilt = (d: number) => (rnd() * 2 - 1) * d * Math.PI / 180;
    a.m.rotation.set(tilt(10) / Math.max(1, a.r0 * 0.5), 0, tilt(10));
    const u = a.mat.uniforms; u.len.value = (60 + rnd() * 90) / 150; u.rep.value = 0.8 + rnd() * 1.6; u.vo.value = (rnd() - 0.5) * 0.3; u.off.value = rnd();
    const c = u.col.value as THREE.Color;
    if (rnd() < mix()) { c.copy(pal.b0).lerp(pal.b1, Math.pow(rnd(), 0.6)); u.wh.value = 0.12; } else { c.copy(pal.a0).lerp(pal.a1, rnd()); u.wh.value = 0.3; }
  };
  for (let i = 0; i < NA; i++) {
    const mat = arcMat(); mats.push(mat); const m = new THREE.Mesh(arcGeo, mat); m.frustumCulled = false; m.renderOrder = 4;
    const pivot = new THREE.Group(); pivot.add(m); root.add(pivot);
    const a: Arc = { pivot, m, mat, r0: 1, y0: 1, h: 0.2, spd: -7, ph: 0, age: 0, life: 1, amax: 1, grow: 0, rise: 0 }; spawnArc(a, true); arcs.push(a);
  }
  // ④ 碎屑（按面积放大，上限 600；低画质不出）
  const NP = lo ? 0 : Math.min(600, Math.round(420 * S * S));
  const pg = new THREE.BufferGeometry(); geos.push(pg);
  const pPos = new Float32Array(NP * 3), pCell = new Float32Array(NP), pSize = new Float32Array(NP), pA = new Float32Array(NP), pRot = new Float32Array(NP);
  if (NP) {
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pg.setAttribute('cell', new THREE.BufferAttribute(pCell, 1)); pg.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    pg.setAttribute('alpha', new THREE.BufferAttribute(pA, 1)); pg.setAttribute('rot', new THREE.BufferAttribute(pRot, 1));
    const pm = ptsMat(viewH, new THREE.Color(0xffffff).lerp(new THREE.Color(FT.dust), 0.3).getHex()); mats.push(pm);
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 5; root.add(pts);
  }
  type Pt = { r: number; a: number; y: number; vy: number; vr: number; w: number; cell: number; size: number; spin: number; age: number; life: number };
  const ps: Pt[] = [];
  const spawn = (p: Pt, warm = false) => { p.r = 0.6 + rnd() * r * 0.9; p.a = rnd() * 6.283; p.y = warm ? rnd() * 2 : 0.05; p.vy = 1.2 + rnd() * 3; p.vr = 0.4 + rnd() * 1.2; p.w = -(2.5 + rnd() * 3);
    const c = rnd(); p.cell = c < 0.35 ? 0 : c < 0.6 ? 1 : c < 0.85 ? 2 : 3; p.size = p.cell === 1 ? 0.8 + rnd() * 0.7 : 0.18 + rnd() * 0.25; p.spin = (rnd() - 0.5) * 10; p.age = warm ? rnd() * 1.2 : 0; p.life = 0.9 + rnd() * 0.8; };
  for (let i = 0; i < NP; i++) { const p = {} as Pt; spawn(p, true); ps.push(p); }
  // ⑤ 收尾冲击（不规则）
  const rm = ringMat(FT.ring); mats.push(rm);
  const ringG = new THREE.PlaneGeometry(r * 2.4, r * 2.4); geos.push(ringG);
  const ring = new THREE.Mesh(ringG, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.renderOrder = 4; root.add(ring);

  // 时间轴：t 为引导内时间；stop() 之后进入收尾（finish）或快速收掉（打断）
  let t = 0, endAt = -1, finished = false, done = false;
  const TAIL = 4;   // 收尾后刀痕残留淡出
  // v1.2.74 关掉 OutlineEffect 描边：高画质下描边把刀风弧 / 刀痕画成蓝黑粗线（「刀痕偏暗」根因）
  for (const m of mats) m.userData.outlineParameters = { visible: false };
  live_++;
  live(root, dur + TAIL + 1, (_k, dt) => {
    if (done) return;
    t += dt;
    if (endAt < 0 && t >= dur + 0.3) { endAt = t; finished = true; }   // 兜底：没收到 stop 也会收
    if (endAt < 0) place();
    if (endAt < 0) stacks = Math.max(0, Math.min(5, bleed()));
    const e = endAt < 0 ? Math.min(1, t / 0.3) : Math.max(0, 1 - (t - endAt) / 0.25);
    const sinceEnd = endAt < 0 ? -1 : t - endAt;
    const slam = finished && sinceEnd >= 0;
    // ① 刀痕
    const ticks = Math.max(0, Math.min(12, Math.floor(t / 0.5) + 1));
    sm.uniforms.opacity.value = endAt < 0 ? Math.min(0.85, 0.25 + ticks * 0.05) : (finished ? 0.85 * Math.max(0, 1 - sinceEnd / TAIL) : Math.max(0, 0.6 - sinceEnd * 2));
    slash.rotation.z -= dt * 0.15;
    // ② 尘土
    for (const d of dusts) { d.m.rotation.z -= d.spin * dt; d.mat.uniforms.t.value = t; d.mat.uniforms.a.value = d.amp * e + (slam ? 0.5 * Math.exp(-sinceEnd * 2.5) : 0); }
    for (const s of sides) { const a = s.ph - t * 1.8; s.m.position.set(Math.cos(a) * r * 0.6, 1.0, Math.sin(a) * r * 0.6); s.mat.uniforms.t.value = t + s.ph; s.mat.uniforms.a.value = 0.35 * e; }
    // ③ 刀风
    for (const a of arcs) { a.age += dt;
      if (a.age >= a.life) { if (endAt < 0) spawnArc(a); else a.age = a.life; }
      const k = Math.min(1, a.age / a.life), rr = a.r0 + a.grow * k;
      a.pivot.rotation.y = a.ph + a.spd * t; a.m.scale.set(rr, a.h, rr); a.m.position.y = a.y0 + a.rise * k;
      a.mat.uniforms.off.value += -a.spd * dt * 0.05;
      a.mat.uniforms.a.value = a.amax * e * (1 - 0.85 * Math.max(0, Math.min(1, (rr - r * 0.8) / (r * 0.4)))) * Math.pow(Math.sin(Math.PI * k), 0.6); }
    // ④ 碎屑
    if (NP) {
      for (let i = 0; i < NP; i++) { const p = ps[i]; p.age += dt; p.vy -= 9 * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.a += p.w * dt;
        if (p.y < 0 || p.age > p.life) { if (endAt < 0 && t < dur - 0.3) spawn(p); else p.y = -99; }
        pPos[i * 3] = Math.cos(p.a) * p.r; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = Math.sin(p.a) * p.r; pCell[i] = p.cell; pSize[i] = p.size; pRot[i] = p.age * p.spin;
        pA[i] = (slam ? Math.max(0, 1 - sinceEnd / 1.2) : e) * (p.cell === 1 ? 0.35 : 1) * Math.min(1, 1 - p.age / p.life + 0.2); }
      for (const k of ['position', 'cell', 'size', 'alpha', 'rot']) (pg.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    }
    // ⑤ 收尾冲击
    { const k = slam ? Math.min(1, sinceEnd / 0.7) : 0; rm.uniforms.k.value = k; rm.uniforms.a.value = slam ? 1.6 * (1 - k) * (1 - k) : 0; }
    // 结束：收尾刀痕淡完 / 打断后 0.6 秒
    if (endAt >= 0 && (finished ? sinceEnd >= TAIL : sinceEnd >= 0.6)) {
      done = true; live_--; root.visible = false; root.parent?.remove(root);
      for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
    }
  });
  return {
    root, palette,
    stop(finish: boolean) {
      if (endAt >= 0) return; endAt = t; finished = finish;
      if (finish) { place(); for (const p of ps) { spawn(p); p.vy *= 1.6; p.vr *= 3; } }
    },
  };
}
