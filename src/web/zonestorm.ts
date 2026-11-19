// v1.2.79 通用区域持续特效件（Rhett 11-04 00:08「都按做暴风雪和奥术风暴的标准去做一些通用件」，贴图 10 张约 $0.40 已批）
// 照《持续型技能特效 制作流程与标准》六层，按元素换贴图 / 色板 / 粒子运动，所有地面区域技能（spawnZoneFx）共用：
//   ① 地面贴花：AI 贴图，中心扩散，角度噪声打散圆边；发光系加法、土 / 毒 / 影普通混合（挡光、有实体感）+ groundfx 断开流光弧与符文刻点
//   ② 体积雾：共用 8×8 噪声序列帧（shared/mist_8x8），贴地 1–2 层，不规则边缘
//   ③ 流动带：拖线贴图贴在短弧上，UV 流动 + 自转，随出随灭（不成同心圆）
//   ④ 粒子：元素 2×2 图集，上升 / 下落 / 旋卷，数量按面积，单个上限 220（比暴风雪轻：这是通用件，同屏会有很多个）
//   ⑤ 冲击点：区域内周期性小爆点（groundfx 冲击前沿 + 图集喷溅），优先落在区域内随机点
//   ⑥ 光：起手一次元素色地面闪光（不加点光，避免着色器重编译）；镜头抖动由技能调用方给
// 伤害判定、数值一律不动，只换表现。低画质只留 ①②⑤。尺寸 × r / 5。
import * as THREE from 'three';
import { live, fxQuality } from './vfx';
import { gy } from './gfx';
import { VFXTEX } from './vfxtex.gen';
import { TEX as ZTEX } from './zonetex.gen';
import * as GFX from './groundfx';
import type { Element } from '../core/types';

type P2 = { x: number; z: number };
type Motion = 'rise' | 'fall' | 'swirl';
interface Style { mono?: boolean;
  decal: string; decalTint: number; decalA: number; decalNormal?: boolean;
  atlas: string; motion: Motion; ptTint: number; cells: number[];   // cells：四格出现权重
  streak?: string; wind: number;
  mist: number; mistA: number; mistNormal?: boolean;
  burst: number; flash: number; shafts?: boolean;   // shafts：神圣的天降光柱（冲击点改成竖直光束）
}
// 色板对齐《技能特效总纲》§3
const STYLE: Record<string, Style> = {
  fire: { decal: 'fire/scorch', decalTint: 0xffa060, decalA: 0.62, atlas: 'fire/embers', motion: 'rise', ptTint: 0xffc080, cells: [4, 3, 2, 1], streak: 'zone/fire_streak', wind: 0xffa050, mist: 0xff6a20, mistA: 0.28, burst: 0xe2481b, flash: 0xff8040 },
  physical: { decal: 'zone/earth_decal', decalTint: 0xffffff, decalA: 0.85, decalNormal: true, atlas: 'blade/debris', motion: 'swirl', ptTint: 0xd8ccb8, cells: [3, 3, 2, 2], streak: 'blade/streak', wind: 0xcfc6b4, mist: 0x8b6f4e, mistA: 0.35, mistNormal: true, burst: 0x8a8f96, flash: 0xffc56b },
  nature: { decal: 'zone/poison_decal', decalTint: 0xffffff, decalA: 0.8, decalNormal: true, atlas: 'zone/poison_atlas', motion: 'rise', ptTint: 0xd8f080, cells: [3, 2, 4, 1], mist: 0x7d9a2a, mistA: 0.4, mistNormal: true, wind: 0, burst: 0x9dba3a, flash: 0xb8d850 },
  shadow: { decal: 'zone/shadow_decal', decalTint: 0xffffff, decalA: 0.9, decalNormal: true, atlas: 'zone/shadow_atlas', motion: 'swirl', ptTint: 0xc090ff, cells: [4, 2, 3, 2], streak: 'frost/streak', wind: 0x7a4aa0, mist: 0x1a1024, mistA: 0.55, mistNormal: true, burst: 0x3a2350, flash: 0x7a4aa0 },
  lightning: { decal: 'zone/lightning_decal', decalTint: 0xc8c0ff, decalA: 0.7, atlas: 'zone/lightning_atlas', motion: 'swirl', ptTint: 0xd8e0ff, cells: [3, 2, 1, 4], streak: 'frost/streak', wind: 0x9a8cff, mist: 0x4a3aa0, mistA: 0.22, burst: 0x7b6cff, flash: 0x9fb0ff },
  holy: { decal: 'zone/holy_decal', decalTint: 0xffdc90, decalA: 0.42, atlas: 'zone/holy_atlas', motion: 'rise', ptTint: 0xfff0c0, cells: [4, 4, 2, 3], streak: 'frost/streak', mist: 0xffd27a, mistA: 0.32, wind: 0xffe6a0, shafts: true, burst: 0xf0c860, flash: 0xfff0c0 },
  frost: { decal: 'frost/frost', decalTint: 0xffffff, decalA: 0.85, decalNormal: true, atlas: 'frost/flakes', motion: 'fall', ptTint: 0xe8f6ff, cells: [4, 2, 1, 2], streak: 'frost/streak', wind: 0xd8f0ff, mist: 0xe6f2fa, mistA: 0.12, mistNormal: true, burst: 0x9fd8e8, flash: 0xcfeaff },
  // v1.2.80 炼金专用（alchemy.ts addZone）：强酸、火油、孢子、晶毒雾
  // v1.2.83 酸雨云：强酸贴花 + 酸滴从上方落下（fall）+ 低垂酸雾
  acidrain: { decal: 'zone/acid_decal', decalTint: 0x9cc040, decalA: 0.9, decalNormal: true, atlas: 'zone/acid_atlas', motion: 'fall', ptTint: 0xe8ff90, cells: [2, 3, 2, 3], streak: 'frost/streak', mist: 0x5a7410, mistA: 0.3, mistNormal: true, wind: 0xb8d040, burst: 0xc8e030, flash: 0xd8f060 },
  acid: { decal: 'zone/acid_decal', decalTint: 0x9cc040, decalA: 1.0, decalNormal: true, atlas: 'zone/acid_atlas', motion: 'rise', ptTint: 0xe8ff90, cells: [3, 3, 2, 2], mist: 0x7a9418, mistA: 0.08, mistNormal: true, wind: 0, burst: 0xc8e030, flash: 0xd8f060 },
  napalm: { decal: 'zone/napalm_decal', decalTint: 0xffffff, decalA: 0.9, decalNormal: true, atlas: 'fire/embers', motion: 'rise', ptTint: 0xffb070, cells: [4, 3, 2, 1], streak: 'zone/fire_streak', wind: 0xff8a30, mist: 0x2a1408, mistA: 0.35, mistNormal: true, burst: 0xe2481b, flash: 0xff8040 },
  spores: { decal: 'zone/poison_decal', decalTint: 0xfff0c0, decalA: 0.9, decalNormal: true, atlas: 'zone/spore_atlas', motion: 'swirl', ptTint: 0xfff0a0, cells: [5, 3, 4, 4], mist: 0xa07a30, mistA: 0.4, mistNormal: true, wind: 0, burst: 0x8a9a3a, flash: 0xa8b850 },
  crystal: { decal: 'frost/frost', decalTint: 0xc0fff0, decalA: 0.8, decalNormal: true, atlas: 'arcane/stardust', motion: 'swirl', ptTint: 0xa0fff0, cells: [3, 3, 2, 4], streak: 'frost/streak', wind: 0x60e8d0, mist: 0x3ab8a0, mistA: 0.22, burst: 0x40e0c0, flash: 0x90fff0 },
  // v1.2.81 时砂行者：金色时砂沙涡、时之裂隙
  sand: { decal: 'zone/sand_decal', decalTint: 0xffb040, decalA: 0.85, atlas: 'zone/sand_atlas', motion: 'swirl', ptTint: 0xffe8b0, cells: [3, 2, 3, 4], streak: 'frost/streak', wind: 0xffd080, mist: 0x8a5a18, mistA: 0.1, burst: 0xffc860, flash: 0xfff0c0 },
  rift: { decal: 'zone/rift_decal', decalTint: 0xffffff, decalA: 0.95, decalNormal: true, atlas: 'zone/sand_atlas', motion: 'swirl', ptTint: 0xffd890, cells: [2, 2, 3, 4], streak: 'frost/streak', wind: 0x9a7aff, mist: 0x1a1030, mistA: 0.4, mistNormal: true, burst: 0x7a5aff, flash: 0xffd070 },
  arcane: { decal: 'arcane/rune', decalTint: 0xe0c8ff, decalA: 0.65, atlas: 'arcane/stardust', motion: 'swirl', ptTint: 0xf0e0ff, cells: [3, 3, 2, 4], streak: 'frost/streak', wind: 0xc8a0ff, mist: 0x8e5bff, mistA: 0.22, burst: 0x8e5bff, flash: 0xd0a8ff },
};
export function zoneStyleOf(el: Element | string): Style { return STYLE[el] ?? STYLE.physical; }

const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide } as const;
const NORM = { transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide } as const;
const texCache = new Map<string, THREE.Texture>();
function tex(id: string, srgb = true, repeatS = false): THREE.Texture {
  const k = id + (repeatS ? ':rep' : '');
  let t = texCache.get(k);
  if (!t) {
    t = new THREE.TextureLoader().load(ZTEX[id] ?? VFXTEX[id]);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeatS) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); }
    texCache.set(k, t);
  }
  return t;
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }';
// 贴花：nb=1 普通混合（亮度当 alpha，挡光），nb=0 加法
const DECAL_FS = `uniform sampler2D map; uniform vec3 tint; uniform float a, seed, nb, mono; varying vec2 vUv;
  void main(){ vec2 d = vUv - .5; float an = atan(d.y, d.x);
    float wob = .22 * sin(an * 3. + seed) + .14 * sin(an * 5. + seed * 2.3) + .08 * sin(an * 11. + seed * 4.1);
    float m = smoothstep(.48, .05, length(d) * (1. + wob)); m *= m;
    vec3 c0 = texture2D(map, vUv).rgb; c0 = mix(c0, vec3(max(c0.r, max(c0.g, c0.b))), mono); vec3 c = c0 * tint;
    if (nb > .5) { float l = smoothstep(.02, .22, max(c.r, max(c.g, c.b))); gl_FragColor = vec4(c * 1.25, l * a * m); }
    else gl_FragColor = vec4(c * a * m, 1.); }`;
const MIST_FS = `uniform sampler2D map; uniform float t, rate, a, nb; uniform vec3 tint; varying vec2 vUv;
  vec2 cell(float f){ f = mod(f, 64.); return (vec2(mod(f, 8.), 7. - floor(f / 8.)) + vUv) / 8.; }
  void main(){ float f = t * rate; float k = fract(f); float v = mix(texture2D(map, cell(floor(f))).r, texture2D(map, cell(floor(f) + 1.)).r, k);
    vec2 d = vUv - .5; float an = atan(d.y, d.x); float wob = .16 * sin(an * 3. + t * .7) + .1 * sin(an * 7. - t * 1.3) + .06 * sin(an * 13. + 2.);
    float edge = smoothstep(.5, .08, length(d) * (1. + wob)); edge *= edge;
    if (nb > .5) gl_FragColor = vec4(tint, v * a * edge); else gl_FragColor = vec4(tint * v * a * edge, 1.); }`;
const PT_VS = `attribute float cell, size, alpha, rot; uniform float scale; varying float vC, vA, vR;
  void main(){ vC = cell; vA = alpha; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PT_FS = `uniform sampler2D map; uniform vec3 tint; varying float vC, vA, vR;
  void main(){ vec2 p = gl_PointCoord - .5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + .5; if (p.x<0.||p.x>1.||p.y<0.||p.y>1.) discard;
    vec2 uv = (vec2(mod(vC,2.), 1. - floor(vC/2.)) + vec2(p.x, 1.-p.y)) / 2.; gl_FragColor = vec4(texture2D(map, uv).rgb * tint * vA, 1.); }`;

function decalMat(st: Style) {
  return new THREE.ShaderMaterial({ ...(st.decalNormal ? NORM : ADD), fog: false, uniforms: { map: { value: tex(st.decal) }, tint: { value: new THREE.Color(st.decalTint) }, a: { value: 0 }, seed: { value: Math.random() * 6.28 }, nb: { value: st.decalNormal ? 1 : 0 }, mono: { value: st.mono ? 1 : 0 } }, vertexShader: VS, fragmentShader: DECAL_FS });
}
function mistMat(st: Style, rate: number) {
  return new THREE.ShaderMaterial({ ...(st.mistNormal ? NORM : ADD), fog: false, uniforms: { map: { value: tex('shared/mist_8x8', false) }, t: { value: 0 }, rate: { value: rate }, a: { value: 0 }, tint: { value: new THREE.Color(st.mist) }, nb: { value: st.mistNormal ? 1 : 0 } }, vertexShader: VS, fragmentShader: MIST_FS });
}
function pointsMat(st: Style, viewH: number) {
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { map: { value: tex(st.atlas) }, scale: { value: viewH / 2 }, tint: { value: new THREE.Color(st.ptTint) } }, vertexShader: PT_VS, fragmentShader: PT_FS });
}
const noOutline = (o: THREE.Object3D) => o.traverse(x => { const m = (x as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.userData.outlineParameters = { visible: false }; });

function shaftMatNew() { return new THREE.ShaderMaterial({ ...ADD, fog: false, uniforms: { a: { value: 0 }, col: { value: new THREE.Color(0xffd890) } },
    vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float a; uniform vec3 col; varying vec2 vUv; varying float vF; void main(){ float core = pow(vF, 2.5); float h = smoothstep(0., .12, vUv.y) * pow(1. - vUv.y, .6); gl_FragColor = vec4(col * (core * 1.3 + .15) * h * a, 1.); }' }); }
/** prewarm 用：本模块全部着色器样本（加法 / 普通混合各一份；贴图全部先解码） */
export function zoneStormSampleMaterials(): THREE.Material[] {
  const out: THREE.Material[] = [];
  for (const st of Object.values(STYLE)) { out.push(decalMat(st), pointsMat(st, 720)); if (st.streak) tex(st.streak, true, true); }
  out.push(mistMat(STYLE.fire, 20), mistMat(STYLE.shadow, 20), shaftMatNew());
  return out;
}

let live_ = 0; const LIVE_CAP = 10;   // 同屏通用区域上限：超出只画 ① + groundfx（防止刷屏时粒子爆量）
export const zoneStormCount = () => live_;
let viewH_ = 720; export function setZoneStormView(h: number) { viewH_ = h; }

/**
 * 通用区域持续特效（六层）。
 * @param c 区域中心 @param r 实际半径（已含范围加成） @param el 元素 @param dur 持续（取伤害区数据）
 */
/** v1.2.81 一段代码里经 spawnZoneFx 铺的区域统一换样式（例：时砂技能的 groundZone 效果走沙涡） */
let styleOverride: string | null = null, overrideAny = false;
/** any=true：不分元素一律换（默认只换物理 / 奥术本体，元素符文变体保留元素样式） */
export function withZoneStyle<T>(style: string, fn: () => T, any = false): T { const o = styleOverride, oa = overrideAny; styleOverride = style; overrideAny = any; try { return fn(); } finally { styleOverride = o; overrideAny = oa; } }
/** 11-04 Rhett：首领地面区域（副本熔岩 / 毒池、世界首领、矿洞 / 腐沼首领）整体亮度再压约 20%（招式最亮帧 ≤ 待机画面 1.3 倍） */
export const BOSS_ZONE_GAIN = 0.8;
/** @param gain 整体亮度倍率（贴花 / 雾 / 流动带 / 粒子 / 冲击点 / 起手闪 / 边缘层一起乘），默认 1 */
export function zoneStorm(c: P2, r: number, el: Element, dur: number, style?: string, tint?: THREE.ColorRepresentation, dark = false, gain = 1) {
  const sk = style ?? (styleOverride && (overrideAny || el === 'physical' || el === 'arcane') ? styleOverride : null);   // 元素符文变体（火 / 暗等）仍按元素样式
  const st0 = (sk && STYLE[sk]) || zoneStyleOf(el), S = Math.max(0.35, r / 5);
  // v1.2.82 任意色符文（替代六芒法阵 sigil）：同一样式只换颜色（uniform），不新增着色器程序
  let st = st0;
  if (tint !== undefined) { const t = new THREE.Color(tint), h = t.getHex(), dk = t.clone().multiplyScalar(0.45).getHex(), lt = t.clone().lerp(new THREE.Color(0xffffff), 0.25).getHex(); st = { ...st0, mono: true, decalTint: lt, ptTint: lt, wind: h, mist: dk, burst: h, flash: lt }; if (dark) st = { ...st, decalNormal: true, decalTint: h, mistNormal: true, mist: h, mistA: Math.max(st.mistA ?? 0.1, 0.25) }; }   // v1.2.86 dark：亮底（雪地）上用普通混合，不靠加法发光
  const lo = fxQuality === 'low' || live_ >= LIVE_CAP, mid = fxQuality === 'medium';
  const root = new THREE.Group(); root.position.set(c.x, gy(c.x, c.z), c.z);
  // ① 贴花 + groundfx 边缘层（断开流光弧 / 符文刻点）
  const dm = decalMat(st); const decal = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.5, r * 2.5), dm);
  decal.rotation.x = -Math.PI / 2; decal.rotation.z = Math.random() * 6.28; decal.position.y = 0.05; decal.renderOrder = 2; root.add(decal);
  const edge = GFX.zoneDecal(c, r, el, dur); if (edge) ((edge.material as THREE.ShaderMaterial).uniforms.alpha.value = 0.55 * gain);
  if (edge && tint !== undefined) { const eu = (edge.material as THREE.ShaderMaterial).uniforms; eu.c1.value.set(tint); eu.c2.value.set(st.flash); eu.ch.value.set(0xffffff); }   // v1.2.82 边缘层跟着换色
  else if (edge && sk && st0 !== zoneStyleOf(el)) { const eu = (edge.material as THREE.ShaderMaterial).uniforms; eu.c1.value.set(st.burst); eu.c2.value.set(st.flash); }   // v1.2.86 换样式（时砂等）时边缘弧跟样式色，不再沿用元素色（奥术紫）
  root.userData.edge = edge;   // v1.2.80 跟随移动的区域（炼金腐蚀手套）要一起挪
  // ② 贴地体积雾
  const mists: { m: THREE.Mesh; mat: THREE.ShaderMaterial; spin: number }[] = [];
  for (const [y, s, spin, rate] of ((lo || mid) ? [[0.2, 2.1, 0.5, 18]] : [[0.2, 2.1, 0.5, 18], [0.9, 1.7, -0.8, 24]]) as [number, number, number, number][]) {
    const mat = mistMat(st, rate); const m = new THREE.Mesh(new THREE.PlaneGeometry(r * s, r * s), mat); m.rotation.x = -Math.PI / 2; m.position.y = y * S; m.renderOrder = 3; root.add(m); mists.push({ m, mat, spin });
  }
  // ③ 流动带：短弧随出随灭
  type Arc = { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; spd: number; amp: number; life: number; age: number; rise: number };
  const arcs: Arc[] = [];
  const NA = lo || !st.streak ? 0 : Math.min(mid ? 6 : 12, Math.round(5 + 4 * S));
  const arcGeo = (rad: number, len: number, h: number) => new THREE.CylinderGeometry(rad, rad * (0.92 + Math.random() * 0.1), h, Math.max(8, Math.round(len * 12)), 1, true, 0, len);
  const reArc = (q: Arc, first = false) => {
    const rad = r * (0.3 + 0.8 * Math.pow(Math.random(), 0.7));
    q.m.geometry.dispose(); q.m.geometry = arcGeo(rad, 0.8 + Math.random() * 1.4, (0.25 + Math.random() * 0.6) * S);
    q.m.position.y = (0.15 + Math.random() * (st.motion === 'rise' ? 1.6 : 1.0)) * S; q.m.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6.283, (Math.random() - 0.5) * 0.3);
    q.spd = (0.7 + Math.random() * 0.9) * (Math.random() < 0.8 ? 1 : -1); q.amp = 0.25 + Math.random() * 0.35;
    q.life = 0.5 + Math.random() * 0.8; q.age = first ? Math.random() * q.life : 0; q.rise = st.motion === 'rise' ? 0.6 + Math.random() * 0.6 : 0.1;
    (q.mat.map as THREE.Texture).offset.x = Math.random();
  };
  if (NA) { const sTex = tex(st.streak!, true, true);
    for (let i = 0; i < NA; i++) { const t = sTex.clone(); t.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: t, color: st.wind, ...ADD, opacity: 0 });
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = 3; root.add(m);
      const q = { m, mat, spd: 0, amp: 0, life: 1, age: 0, rise: 0 }; reArc(q, true); arcs.push(q); } }
  // ④ 粒子
  const NP = lo ? 0 : Math.min(mid ? 110 : 220, Math.round(140 * S * S));
  const pg = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pCell = new Float32Array(NP), pSize = new Float32Array(NP), pA = new Float32Array(NP), pRot = new Float32Array(NP);
  let ptsMat: THREE.ShaderMaterial | null = null;
  if (NP) {
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pg.setAttribute('cell', new THREE.BufferAttribute(pCell, 1)); pg.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
    pg.setAttribute('alpha', new THREE.BufferAttribute(pA, 1)); pg.setAttribute('rot', new THREE.BufferAttribute(pRot, 1));
    ptsMat = pointsMat(st, viewH_); const pts = new THREE.Points(pg, ptsMat); pts.frustumCulled = false; pts.renderOrder = 4; root.add(pts);
  }
  const wsum = st.cells.reduce((a, b) => a + b, 0);
  const pickCell = () => { let u = Math.random() * wsum; for (let i = 0; i < 4; i++) { u -= st.cells[i]; if (u <= 0) return i; } return 3; };
  type Pt = { r: number; a: number; y: number; vy: number; w: number; cell: number; size: number; spin: number; age: number; life: number };
  const ps: Pt[] = []; const top = (st.motion === 'fall' ? 5 : 3.2) * S;
  const spawn = (p: Pt, warm = false) => {
    p.r = r * Math.sqrt(Math.random()) * 0.92; p.a = Math.random() * 6.283; p.cell = pickCell(); p.age = 0; p.spin = (Math.random() - 0.5) * 5;
    p.life = 0.9 + Math.random() * 1.4; if (warm) p.age = Math.random() * p.life;
    if (st.motion === 'fall') { p.y = warm ? Math.random() * top : top * (0.85 + Math.random() * 0.3); p.vy = -(1.5 + Math.random() * 2) * Math.max(1, S * 0.8); p.w = 0.6 + Math.random(); }
    else if (st.motion === 'rise') { p.y = 0.05 + Math.random() * 0.3; p.vy = (0.6 + Math.random() * 1.4) * Math.sqrt(S); p.w = (Math.random() - 0.5) * 0.8; }
    else { p.y = 0.1 + Math.random() * 1.2 * S; p.vy = (Math.random() - 0.3) * 0.4; p.w = (1.0 + Math.random() * 1.6) * (el === 'shadow' ? -1 : 1); }
    p.size = (p.cell === 2 ? 0.7 + Math.random() * 0.5 : 0.22 + Math.random() * 0.3) * Math.sqrt(S);
  };
  for (let i = 0; i < NP; i++) { const p = {} as Pt; spawn(p, true); ps.push(p); }
  // ⑤ 冲击点：图集喷溅精灵
  const puffBase = new THREE.SpriteMaterial({ map: tex(st.atlas), ...ADD, color: st.ptTint });
  const puffs: { m: THREE.Sprite; t: number }[] = [];
  // 神圣光柱：两片十字交叉的竖直面片，拖线贴图竖向流动，上亮下实、两头淡出
  const shafts: { m: THREE.Mesh; t: number }[] = [];
  const shaftGeo = st.shafts ? new THREE.CylinderGeometry(0.28 * Math.sqrt(S), 0.42 * Math.sqrt(S), 4.4 * S, 10, 1, true) : null!;
  const shaftMat = st.shafts ? shaftMatNew() : null!;
  if (shaftMat) shaftMat.userData.outlineParameters = { visible: false };
  const newPuff = (x: number, z: number) => {
    const mt = puffBase.clone(); mt.map = tex(st.atlas).clone(); mt.map.needsUpdate = true; mt.map.repeat.set(0.5, 0.5);
    const cell = st.motion === 'rise' ? 3 : 0; mt.map.offset.set((cell % 2) * 0.5, cell < 2 ? 0.5 : 0);
    const m = new THREE.Sprite(mt); m.position.set(x, 0.35 * S, z); root.add(m); puffs.push({ m, t: 0 });
    if (st.shafts) { const sm = new THREE.Mesh(shaftGeo, shaftMat.clone()); sm.position.set(x, 2.2 * S, z); (sm.material as THREE.Material).userData.outlineParameters = { visible: false }; sm.rotation.y = Math.random() * 3; root.add(sm); shafts.push({ m: sm, t: 0 }); }
    GFX.groundBurst({ x: c.x + x, z: c.z + z }, 0.9 * Math.sqrt(S), el, 0.5);
  };
  // ⑥ 起手地面闪光
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), mistMat({ ...st, mist: st.flash, mistNormal: false }, 30));
  flash.rotation.x = -Math.PI / 2; flash.position.y = 0.12; flash.renderOrder = 3; root.add(flash);
  const flashMat = flash.material as THREE.ShaderMaterial;
  noOutline(root);
  live_++;
  let T = 0, next = 0.3;
  const env = (t: number) => gain * Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (dur - t) / 0.6));
  live(root, dur + 0.7, (k, dt) => {
    T += dt; const t = T, e = env(t);
    const g = Math.min(1, t / 0.4); decal.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - g, 3))); dm.uniforms.a.value = st.decalA * e;
    flashMat.uniforms.t.value = t; flashMat.uniforms.a.value = Math.max(0, 1 - t / 0.35) * 0.9 * gain;
    for (const m of mists) { m.m.rotation.z += m.spin * dt; m.mat.uniforms.t.value = t; m.mat.uniforms.a.value = st.mistA * e; }
    for (const q of arcs) { q.age += dt; if (q.age >= q.life) { if (t < dur - 0.6) reArc(q); else q.age = q.life; }
      const f = q.age / q.life, fade = Math.sin(Math.PI * Math.min(1, f)); q.m.rotation.y += q.spd * dt; q.m.position.y += q.rise * S * dt; (q.mat.map as THREE.Texture).offset.x += q.spd * dt * 0.4; q.mat.opacity = q.amp * fade * e; }
    if (NP) {
      for (let i = 0; i < NP; i++) { const p = ps[i]; p.age += dt; p.y += p.vy * dt; p.a += p.w * dt;
        if (st.motion === 'swirl') p.r = Math.max(0.2, p.r - (el === 'shadow' || sk === 'rift' ? 0.5 : 0.1) * dt);
        const dead = st.motion === 'fall' ? p.y < 0.05 : p.age > p.life;
        if (dead) { if (t < dur - 0.6) spawn(p); else p.y = -99; }
        const f = st.motion === 'fall' ? Math.min(1, Math.max(0, p.y) / 0.6) : Math.sin(Math.PI * Math.min(1, p.age / p.life));
        pPos[i * 3] = Math.cos(p.a) * p.r; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = Math.sin(p.a) * p.r; pCell[i] = p.cell; pSize[i] = p.size; pRot[i] = p.age * p.spin; pA[i] = e * f * (p.cell === 2 ? 0.4 : 0.95); }
      for (const a of ['position', 'cell', 'size', 'alpha', 'rot']) (pg.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    }
    const gap = (lo ? 0.9 : 0.45) / Math.max(1, S * S * 0.6);
    if (t > 0.3 && t < dur - 0.5 && t >= next) { next = t + gap * (0.7 + Math.random() * 0.6); const a = Math.random() * 6.283, d = r * 0.8 * Math.sqrt(Math.random()); newPuff(Math.cos(a) * d, Math.sin(a) * d); }
    for (const p of puffs) { p.t += dt; const q = p.t / 0.45; p.m.scale.setScalar((0.5 + 1.4 * q) * Math.sqrt(S)); (p.m.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - q) * gain; }
    for (const q of shafts) { q.t += dt; const f = q.t / 0.7; (q.m.material as THREE.ShaderMaterial).uniforms.a.value = 0.9 * gain * Math.sin(Math.PI * Math.min(1, f)); q.m.scale.set(1 - 0.5 * f, 1, 1 - 0.5 * f); }
    for (let i = shafts.length - 1; i >= 0; i--) if (shafts[i].t > 0.7) { root.remove(shafts[i].m); (shafts[i].m.material as THREE.Material).dispose(); shafts.splice(i, 1); }
    for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > 0.45) { const m = puffs[i].m; root.remove(m); (m.material as THREE.SpriteMaterial).map?.dispose(); (m.material as THREE.Material).dispose(); puffs.splice(i, 1); }
    if (k >= 1) { live_--; shaftGeo?.dispose(); shaftMat?.dispose(); dm.dispose(); flashMat.dispose(); ptsMat?.dispose(); pg.dispose(); puffBase.dispose(); for (const m of mists) m.mat.dispose(); for (const q of arcs) { q.m.geometry.dispose(); q.mat.map?.dispose(); q.mat.dispose(); } root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }
  });
  return root;
}
