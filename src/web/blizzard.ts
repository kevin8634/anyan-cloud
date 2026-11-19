// v1.2.73 暴风雪（vfxlab 样板接入游戏，Rhett 11-02 21:36 定稿「这样的技能效果就是我想要的」）
// 六层：① 地面霜纹贴花 ② 雪雾序列帧漏斗 + 侧面体积片 ③ 风带 UV 流动 ④ 雪片冰晶图集粒子 ⑤ 冰锥砸落 + 雪团 ⑥ 起手抖动（由调用方 feel 给）
// 规则（持续型技能特效标准 §2-5 / §3 / §5）：
//  - 所有尺寸 × 实际半径 / 样板半径 5：符文「大风雪」、装备加的范围，特效一起变大
//  - 粒子数按面积放大，上限 600（低画质 ≤ 250，且只保留 ①②⑤）
//  - 赋能 = 本体不变 + 附加层：雷电（nature）→ 复用奥术风暴 stormCell 的雷云落雷；最多 3 层由 boltElements 截断
//  - 「火雨」符文（主元素换成火）：同一套结构换火焰色板 + 焦痕/余烬贴图，不再退回陨星画法（专属贴图另排期）
// 贴图以 base64 嵌进 vfxtex.gen.ts，不放冻结的 assets/。
import * as THREE from 'three';
import { live, fxQuality } from './vfx';
import { gy } from './gfx';
import { stormCell } from './arcbolt';
import { VFXTEX } from './vfxtex.gen';
import { BLIZICE_FLAKES } from './blizice_tex';   // 11-19 Rhett 暴风雪冰晶 / 冰渣换写实（gpt-image-2）；?off=blizice 回原图集
const BLIZICE_OFF = (() => { try { return /(?:[?&]off=[^&]*\bblizice\b)/.test(location.search); } catch { return false; } })();
import type { Element } from '../core/types';

type P2 = { x: number; z: number };
const SAMPLE_R = 5;
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
const low = () => fxQuality === 'low';

const texCache = new Map<string, THREE.Texture>();
function tex(id: string, srgb = true, repeatS = false): THREE.Texture {
  const k = id + (repeatS ? ':rep' : '');
  let t = texCache.get(k);
  if (!t) {
    t = new THREE.TextureLoader().load(id === 'frost/flakes' && !BLIZICE_OFF ? BLIZICE_FLAKES : VFXTEX[id]);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeatS) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); }
    texCache.set(k, t);
  }
  return t;
}

/** 色板：冰霜（本体）/ 火焰（火雨） */
interface Pal { decal: string; atlas: string; decalTint: number; mist: number; side: number; wind: number; shard: number; shardEmi: number; fall: number; flare: number }
const PAL: Record<'frost' | 'fire', Pal> = {
  frost: { decal: 'frost/frost', atlas: 'frost/flakes', decalTint: 0x9fd8ff, mist: 0xbfe4ff, side: 0x9fcff0, wind: 0xd8f0ff, shard: 0xcfeaff, shardEmi: 0x4a8ac0, fall: 1, flare: 0x9fd8ff },
  fire: { decal: 'fire/scorch', atlas: 'fire/embers', decalTint: 0xffa060, mist: 0xff7a30, side: 0xc04a18, wind: 0xffb070, shard: 0xffb060, shardEmi: 0xff5010, fall: 1.25, flare: 0xff8040 },
};

// ---------- 材质（全局共用着色器：只编译一次，prewarm 预热） ----------
const MIST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }';
/** 侧面体积片：顶点着色器里朝镜头（不依赖相机对象） */
const BILL_VS = 'varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.,0.,0.,1.); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }';
const MIST_FS = `uniform sampler2D map; uniform float t, rate, a; uniform vec3 tint; varying vec2 vUv;
  vec2 cell(float f){ f = mod(f, 64.); return (vec2(mod(f, 8.), 7. - floor(f / 8.)) + vUv) / 8.; }
  void main(){ float f = t * rate; float k = fract(f); float v = mix(texture2D(map, cell(floor(f))).r, texture2D(map, cell(floor(f) + 1.)).r, k);
    vec2 d = vUv - .5; float an = atan(d.y, d.x); float wob = .16 * sin(an * 3. + t * .7) + .1 * sin(an * 7. - t * 1.3) + .06 * sin(an * 13. + 2.);
    float edge = smoothstep(.5, .08, length(d) * (1. + wob)); edge *= edge;   // 不规则边缘，看不出正圆
    gl_FragColor = vec4(tint * v * a * edge, 1.); }`;
/** 地面贴花：角度噪声打散圆边 */
const DECAL_FS = `uniform sampler2D map; uniform vec3 tint; uniform float a, seed; varying vec2 vUv;
  void main(){ vec2 d = vUv - .5; float an = atan(d.y, d.x);
    float wob = .22 * sin(an * 3. + seed) + .14 * sin(an * 5. + seed * 2.3) + .08 * sin(an * 11. + seed * 4.1);
    float m = smoothstep(.48, .05, length(d) * (1. + wob)); m *= m;   // 外缘二次衰减，小半径不留暗圈
    gl_FragColor = vec4(texture2D(map, vUv).rgb * tint * a * m, 1.); }`;
function mistMat(tint: number, rate: number, bill = false) {
  return new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { map: { value: tex('shared/mist_8x8', false) }, t: { value: 0 }, rate: { value: rate }, a: { value: 0 }, tint: { value: new THREE.Color(tint) } },
    vertexShader: bill ? BILL_VS : MIST_VS, fragmentShader: MIST_FS });
}
const PT_VS = `attribute float cell, size, alpha, rot; uniform float scale; varying float vC, vA, vR;
  void main(){ vC = cell; vA = alpha; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PT_FS = `uniform sampler2D map; uniform vec3 tint; varying float vC, vA, vR;
  void main(){ vec2 p = gl_PointCoord - .5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + .5; if (p.x<0.||p.x>1.||p.y<0.||p.y>1.) discard;
    vec2 uv = (vec2(mod(vC,2.), 1. - floor(vC/2.)) + vec2(p.x, 1.-p.y)) / 2.; gl_FragColor = vec4(texture2D(map, uv).rgb * tint * vA, 1.); }`;
function pointsMat(atlas: string, viewH: number) {
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { map: { value: tex(atlas) }, scale: { value: viewH / 2 }, tint: { value: new THREE.Color(1, 1, 1) } }, vertexShader: PT_VS, fragmentShader: PT_FS });
}
/** prewarm 用：本模块的全部材质样本（冰 + 火各一套） */
export function blizzardSampleMaterials(): THREE.Material[] {
  const out: THREE.Material[] = [mistMat(0xffffff, 20), mistMat(0xffffff, 20, true), pointsMat('frost/flakes', 720), pointsMat('fire/embers', 720)];
  for (const p of [PAL.frost, PAL.fire]) out.push(new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { map: { value: tex(p.decal) }, tint: { value: new THREE.Color(p.decalTint) }, a: { value: 0 }, seed: { value: 0 } }, vertexShader: MIST_VS, fragmentShader: DECAL_FS }), new THREE.MeshBasicMaterial({ map: tex('frost/streak', true, true), ...ADD, side: THREE.DoubleSide }), new THREE.SpriteMaterial({ map: tex(p.atlas), ...ADD }));
  return out;
}

let live_ = 0;
/** 同屏存活的暴风雪数（验收：2 个同技能不爆粒子上限） */
export const blizzardCount = () => live_;

/**
 * 暴风雪 / 火雨区域特效。
 * @param c 区域中心（目标点）
 * @param r 实际半径（s.stats.radius，已含范围加成）
 * @param dur 区域持续（取伤害区数据）
 * @param els 元素列表：第一个是本体（frost / fire），其余为赋能附加层
 * @param viewH 画布高度（粒子尺寸换算）
 */
export function blizzardStorm(c: P2, r: number, dur: number, els: Element[], viewH = 720) {
  const main: 'frost' | 'fire' = els[0] === 'fire' ? 'fire' : 'frost';
  const P = PAL[main], S = r / SAMPLE_R, lo = low();
  const y0 = gy(c.x, c.z);
  const root = new THREE.Group(); root.position.set(c.x, y0, c.z);
  // ① 地面贴花
  const decalMat = new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { map: { value: tex(P.decal) }, tint: { value: new THREE.Color(P.decalTint) }, a: { value: 0 }, seed: { value: Math.random() * 6.28 } }, vertexShader: MIST_VS, fragmentShader: DECAL_FS });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.5, r * 2.5), decalMat);
  decal.rotation.x = -Math.PI / 2; decal.position.y = 0.05; decal.renderOrder = 2; root.add(decal);
  // ② 雪雾漏斗 + 侧面体积片
  const mists: { m: THREE.Mesh; mat: THREE.ShaderMaterial; spin: number; amp: number }[] = [];
  for (const [y, s, spin, amp, rate] of (lo ? [[0.25, 2.3, 0.6, 0.45, 20]] : [[0.25, 2.3, 0.6, 0.45, 20], [1.4, 2.0, 0.9, 0.3, 26], [2.8, 1.6, 1.3, 0.22, 32]]) as [number, number, number, number, number][]) {
    const mat = mistMat(P.mist, rate); const m = new THREE.Mesh(new THREE.PlaneGeometry(r * s, r * s), mat); m.rotation.x = -Math.PI / 2; m.position.y = y * S; m.renderOrder = 3; root.add(m); mists.push({ m, mat, spin, amp });
  }
  const sides: { m: THREE.Mesh; mat: THREE.ShaderMaterial; ph: number }[] = [];
  if (!lo) for (let i = 0; i < 5; i++) { const mat = mistMat(P.side, 18 + i * 3, true); const m = new THREE.Mesh(new THREE.PlaneGeometry(5 * S, 4 * S), mat); m.frustumCulled = false; m.renderOrder = 3; root.add(m); sides.push({ m, mat, ph: i / 5 * Math.PI * 2 }); }
  // ③ 风线（Rhett 11-02：不要规整同心圆环）：很多条长短/高低/倾角/转速都错开的短弧，随出随灭，覆盖到 1.15r 边缘渐稀
  type Arc = { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; spd: number; amp: number; life: number; age: number; rise: number };
  const arcs: Arc[] = [];
  const NA = lo ? 0 : Math.min(26, Math.round(16 + 6 * S));
  const sTex = tex('frost/streak', true, true);
  const arcGeo = (rad: number, len: number, h: number) => new THREE.CylinderGeometry(rad, rad * (0.92 + Math.random() * 0.1), h, Math.max(8, Math.round(len * 12)), 1, true, 0, len);
  const reArc = (q: Arc, first = false) => {
    const u = Math.random(); const rad = r * (0.25 + 0.9 * Math.pow(u, 0.7));      // 外圈更稀
    q.m.geometry.dispose(); q.m.geometry = arcGeo(rad, 1.0 + Math.random() * 1.6, (0.4 + Math.random() * 1.1) * S);
    q.m.position.y = (0.3 + Math.random() * 3.2) * S; q.m.rotation.set((Math.random() - 0.5) * 0.35, Math.random() * 6.283, (Math.random() - 0.5) * 0.35);
    q.spd = (0.6 + Math.random() * 0.9) * (rad > r * 0.8 ? 0.7 : 1) * (Math.random() < 0.8 ? 1 : -1); q.amp = (0.25 + Math.random() * 0.4) * (rad > r ? 0.55 : 1);
    q.life = 0.5 + Math.random() * 0.9; q.age = first ? Math.random() * q.life : 0; q.rise = 0.3 + Math.random() * 0.6;
    (q.mat.map as THREE.Texture).offset.x = Math.random();
  };
  for (let i = 0; i < NA; i++) {
    const t = sTex.clone(); t.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: t, color: P.wind, ...ADD, opacity: 0, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = 3; root.add(m);
    const q = { m, mat, spd: 0, amp: 0, life: 1, age: 0, rise: 0 }; reArc(q, true); arcs.push(q);
  }
  // ④ 粒子：按面积放大，上限 600（低画质 250，且减半）
  const NP = lo ? 0 : Math.min(600, Math.round(520 * S * S));
  const pg = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pCell = new Float32Array(NP), pSize = new Float32Array(NP), pA = new Float32Array(NP), pRot = new Float32Array(NP);
  if (NP) {
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pg.setAttribute('cell', new THREE.BufferAttribute(pCell, 1)); pg.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    pg.setAttribute('alpha', new THREE.BufferAttribute(pA, 1)); pg.setAttribute('rot', new THREE.BufferAttribute(pRot, 1));
    const pts = new THREE.Points(pg, pointsMat(P.atlas, viewH)); pts.frustumCulled = false; pts.renderOrder = 4; root.add(pts);
  }
  type Pt = { r: number; a: number; y: number; vy: number; w: number; cell: number; size: number; spin: number; age: number };
  const ps: Pt[] = [];
  const top = 6 * S;
  const spawn = (p: Pt, warm = false) => { p.r = r * Math.sqrt(Math.random()) * 0.95; p.a = Math.random() * 6.283; p.y = warm ? Math.random() * top : top * (0.85 + Math.random() * 0.35); p.vy = -(1.5 + Math.random() * 2.5) * P.fall * Math.max(1, S * 0.8); p.w = 1.2 + Math.random() * 1.6;
    const k = Math.random(); p.cell = k < 0.5 ? 0 : k < 0.7 ? 1 : k < 0.85 ? 3 : 2; p.size = (p.cell === 2 ? 0.9 + Math.random() * 0.6 : 0.25 + Math.random() * 0.35) * Math.sqrt(S); p.spin = (Math.random() - 0.5) * 6; p.age = 0; };
  for (let i = 0; i < NP; i++) { const p = {} as Pt; spawn(p, true); ps.push(p); }
  // ⑤ 冰锥（火雨：火流星）砸落 + 落点雪团
  const shardGeo = new THREE.ConeGeometry(0.28 * Math.sqrt(S), 1.8 * Math.sqrt(S), 5);
  const shardMat = new THREE.MeshStandardMaterial({ color: P.shard, emissive: P.shardEmi, emissiveIntensity: main === 'fire' ? 1.6 : 0.8, roughness: 0.1, metalness: 0.2, flatShading: true, transparent: true });
  const puffMat = new THREE.SpriteMaterial({ map: tex(P.atlas), ...ADD });
  const shards: { m: THREE.Mesh; x: number; z: number; done: boolean; t: number }[] = [];
  const puffs: { m: THREE.Sprite; t: number }[] = [];
  const H0 = 7 * S;
  const newPuff = (x: number, z: number) => {
    const m = new THREE.Sprite(puffMat.clone()); const mt = m.material as THREE.SpriteMaterial; mt.map = tex(P.atlas).clone(); mt.map.needsUpdate = true; mt.map.repeat.set(0.5, 0.5); mt.map.offset.set(0, 0);
    m.position.set(x, 0.3, z); root.add(m); puffs.push({ m, t: 0 });
  };
  // v1.2.74 特效层关掉 OutlineEffect 描边（高画质下会给风线 / 贴花描出深色边）；冰晶碎块后加，保留描边
  root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.userData.outlineParameters = { visible: false }; });
  live_++;
  let T = 0, next = 0.2;
  const env = (t: number) => Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (dur - t) / 0.6));
  live(root, dur + 0.7, (k, dt) => {
    T += dt; const t = T, e = env(t);
    // ① 霜纹 0.35 秒从中心扩散
    const g = Math.min(1, t / 0.35); decal.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - g, 3))); decalMat.uniforms.a.value = (main === 'fire' ? 0.65 : 0.5) * e;
    // ② 雪雾
    for (const m of mists) { m.m.rotation.z += m.spin * dt; m.mat.uniforms.t.value = t; m.mat.uniforms.a.value = m.amp * e; }
    for (const s of sides) { const a = s.ph + t * 0.9; s.m.position.set(Math.cos(a) * r * 0.55, 1.6 * S, Math.sin(a) * r * 0.55); s.mat.uniforms.t.value = t + s.ph; s.mat.uniforms.a.value = 0.28 * e; }
    // ③ 风带
    for (const q of arcs) { q.age += dt; if (q.age >= q.life) { if (t < dur - 0.6) reArc(q); else q.age = q.life; }
      const f = q.age / q.life, fade = Math.sin(Math.PI * Math.min(1, f)); q.m.rotation.y += q.spd * dt; q.m.position.y += q.rise * S * dt; (q.mat.map as THREE.Texture).offset.x += q.spd * dt * 0.4; q.mat.opacity = q.amp * fade * e; }
    // ④ 粒子
    if (NP) {
      for (let i = 0; i < NP; i++) { const p = ps[i]; p.age += dt; p.y += p.vy * dt; p.a += p.w * dt; p.r = Math.max(0.3, p.r - 0.35 * dt);
        if (p.y < 0.05) { if (t < dur - 0.6) spawn(p); else p.y = -99; }
        pPos[i * 3] = Math.cos(p.a) * p.r; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = Math.sin(p.a) * p.r; pCell[i] = p.cell; pSize[i] = p.size; pRot[i] = p.age * p.spin; pA[i] = e * (p.cell === 2 ? 0.35 : 0.95) * Math.min(1, Math.max(0, p.y) / 0.6); }
      for (const a of ['position', 'cell', 'size', 'alpha', 'rot']) (pg.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    }
    // ⑤ 砸落：每 0.18 秒一根（面积大时加密，低画质 0.36 秒）
    const gap = (lo ? 0.36 : 0.18) / Math.max(1, S * S * 0.8);
    if (t > 0.2 && t < dur - 0.8 && t >= next) {
      next = t + gap; const a = Math.random() * 6.283, d = r * 0.85 * Math.sqrt(Math.random()), x = Math.cos(a) * d, z = Math.sin(a) * d;
      const m = new THREE.Mesh(shardGeo, shardMat); m.rotation.x = Math.PI; m.rotation.z = -0.17; m.position.set(x + 1.2 * S, H0, z - 0.4 * S); root.add(m); shards.push({ m, x, z, done: false, t: 0 });
    }
    for (const s of shards) {
      if (s.done) { s.t += dt; s.m.scale.setScalar(Math.max(0.01, 1 - s.t * 2)); continue; }
      s.m.position.y -= 16 * S * P.fall * dt; const q = 1 - (s.m.position.y / H0);
      s.m.position.x = s.x + 1.2 * S * (1 - q); s.m.position.z = s.z - 0.4 * S * (1 - q);
      if (s.m.position.y <= 0.7 * Math.sqrt(S)) { s.m.position.y = 0.7 * Math.sqrt(S); s.done = true; newPuff(s.x, s.z); }
    }
    for (const p of puffs) { p.t += dt; const q = p.t / 0.5; p.m.scale.setScalar((0.6 + 1.6 * q) * Math.sqrt(S)); (p.m.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - q); }
    for (let i = shards.length - 1; i >= 0; i--) if (shards[i].done && shards[i].t > 0.6) { root.remove(shards[i].m); shards.splice(i, 1); }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > 0.5) { const m = puffs[i].m; root.remove(m); (m.material as THREE.Material).dispose(); puffs.splice(i, 1); }
    if (k >= 1) { live_--; shardGeo.dispose(); shardMat.dispose(); for (const q of arcs) { q.m.geometry.dispose(); q.mat.dispose(); } }
  });
  // 赋能附加层：雷电（nature）→ 雷云 + 区域内落雷（奥术风暴同款 stormCell，按元素色）
  const bolts = els.slice(1).filter(x => x === 'nature');   // 奥术 / 火 / 毒赋能的附加层（符文地纹、余烬、毒雾）待「赋能」定义确认后补
  if (bolts.length) stormCell(c, r, { els: bolts, dur });
  return root;
}
