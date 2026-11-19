// ======================================================================
// 11-17 法师专属魔法特效（按 Rhett 批准的概念图 /workspace/work/mfx1117/01~09）
// 分派键 = `${技能 baseId}@${当前元素}`：符文 / 装备把元素改掉后（如冰枪「雷枪」→ nature）走对应的另一套，
// 没登记的组合一律回退到原来的通用画法（不影响其他职业与技能）。
// 本体登记：奥能弹 / 冰枪 / 雷冰枪 / 星界弹幕 / 寒焰交织 / 冰河时代；DLC1 的三个（溺光法球 / 钟律共鸣 / 渊海潮汐）
// 在 src/dlc/dlc1/mage_fx_d1.ts 里 registerMageFx 登记（本体构建不含 DLC 代码，见 build-web.mjs dlc-guard）。
// 挂点：casting.launchProjectile（弹体外形）/ main.updateProjectiles（拖尾 + 命中）/ casting.castTargetedCircle（目标点范围）
//       / casting.executeSkill 大招分支（以自身为中心）/ main world.onChain（雷冰枪弹射电弧）。
// 只改表现，不改任何结算：命中仍由调用方传进来的 apply() 结算（时机与原来一致）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fx, live, vfxTime } from './vfx';
import { gy } from './gfx';
import { arcBolt, shockHit, withBolt } from './arcbolt';
import type { Element, ResolvedSkill } from '../core/types';
import {
  FxUnit, P2, P3, lowQ, qn, rnd, easeOut, envK, noOl, unitHeight, GLSL_NOISE,
  fresnelMat, waveMat, decalMat, tailMat, tailGeo, groundMesh, flatQuad, fadeAll, tickT,
  glowTex, starTex, runeRingTex, iceGroundMat, lavaGroundMat, kitSampleMaterials, elemMote, elemBurst, flick,
} from './mage_fx_kit';

export type { FxUnit } from './mage_fx_kit';
export type ZoneOut = { x: number; z: number; r: number; dur: number };
/** 弹体样式：make 造外形（共享几何 / 材质，弹体不走 live，不 dispose）；tick 每帧（朝向 + 拖尾）；hit 命中时画并调用 apply() 结算 */
export interface MageProj {
  make(s: ResolvedSkill, i: number): THREE.Object3D;
  tick(o: THREE.Object3D, s: ResolvedSkill, dt: number, to: THREE.Vector3): void;
  hit(o: THREE.Object3D, s: ResolvedSkill, tg: FxUnit, apply: () => void): void;
}
/** 范围样式：c = 圆心；hits = 将被结算的敌人；apply(skip) = 结算（skip = 由本特效自己画的地面区域元素），返回新铺的该元素区域；
 *  apply 为 null 表示调用方自己结算（以自身为中心的大招分支） */
export type MageArea = (s: ResolvedSkill, c: P3, hits: FxUnit[], apply: ((skip?: Element) => ZoneOut[]) | null) => void;

const PROJ: Record<string, MageProj> = {};
const AREA: Record<string, MageArea> = {};
const WARM: (() => THREE.Material[])[] = [];
const RUNE_KEYS = new Set<string>();
/** 回退开关：?off=magefx（或 localStorage darkrock_cine_off 含 magefx）= 法师专属特效全部回旧画法；
 *  ?off=magerune = 只把符文变体（rune: true 登记的）回旧画法，基础技能的新画法保留 */
const MFX_OFF = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    const set = new Set(`${q},${ls}`.split(',').map(x => x.trim()));
    return { all: set.has('magefx'), rune: set.has('magerune') };
  } catch { return { all: false, rune: false }; }
})();
/** 登记一个技能（键 = baseId@element）的专属表现；rune = 符文 / 装备改元素后的变体（受 ?off=magerune 控制） */
export function registerMageFx(key: string, o: { proj?: MageProj; area?: MageArea; warm?: () => THREE.Material[]; rune?: boolean }) {
  if (o.proj) PROJ[key] = o.proj;
  if (o.area) AREA[key] = o.area;
  if (o.warm) WARM.push(o.warm);
  if (o.rune) RUNE_KEYS.add(key);
}
const keyOf = (s: ResolvedSkill) => `${s.baseId}@${s.element}`;
const usable = (k: string) => !MFX_OFF.all && !(MFX_OFF.rune && RUNE_KEYS.has(k));
export const mageFxKeys = () => ({ proj: Object.keys(PROJ), area: Object.keys(AREA), rune: [...RUNE_KEYS], off: { ...MFX_OFF } });   // 调试

// ---------------------------------------------------------------- 挂点（调用方只用这几个）
/** casting.launchProjectile：有专属弹体就返回它（替代通用发光球） */
export function mageProjMake(s: ResolvedSkill, i: number): THREE.Object3D | null {
  const k = keyOf(s), P = PROJ[k]; if (!P || !usable(k)) return null;
  const o = P.make(s, i); o.userData.mfx = k; o.userData.mfxI = i; o.userData.mfxT = 0; return noOl(o);
}
/** main.updateProjectiles：专属弹体每帧（返回 false = 不是专属弹体，走原拖尾） */
export function mageProjTick(o: THREE.Object3D, s: ResolvedSkill, dt: number, to: THREE.Vector3): boolean {
  const P = PROJ[o.userData.mfx as string]; if (!P) return false;
  P.tick(o, s, dt, to); o.userData.mfxT = (o.userData.mfxT as number) + dt; return true;
}
/** main.updateProjectiles：专属弹体命中（返回 false = 走原命中画法） */
export function mageProjHit(o: THREE.Object3D, s: ResolvedSkill, tg: FxUnit, apply: () => void): boolean {
  const P = PROJ[o.userData.mfx as string]; if (!P) return false;
  P.hit(o, s, tg, apply); return true;
}
/** casting：目标点范围 / 自身大招的专属表现（返回 false = 走原画法） */
export function mageArea(s: ResolvedSkill, c: P3, hits: FxUnit[], apply: ((skip?: Element) => ZoneOut[]) | null): boolean {
  const k = keyOf(s), A = AREA[k]; if (!A || !usable(k)) return false;
  A(s, c, hits, apply); return true;
}
/** 雷冰枪弹射：结算期间 on，main.onChain 改画白紫电弧 */
export const MAGE_CHAIN = { on: false };
const CHAIN_ELS: Element[] = ['nature', 'arcane'];
export function mageChain(a: P2, b: P2): boolean {
  if (!MAGE_CHAIN.on) return false;
  const A = { x: a.x, y: gy(a.x, a.z) + 1.2, z: a.z }, B = { x: b.x, y: gy(b.x, b.z) + 1.2, z: b.z };
  arcBolt(A, B, { els: CHAIN_ELS, life: 0.45, width: 0.075, branches: 3 });
  if (!lowQ()) delay(0.14, () => arcBolt(A, B, { els: CHAIN_ELS, life: 0.25, width: 0.05, branches: 2 }));
  fx('ice', { x: b.x, y: 1.1, z: b.z }, { count: 6, color: 0xf2fbff, color2: 0x9fd8ff, speed: 3, up: 0.8, life: 0.4, size: 0.22, sizeEnd: 0.1, gravity: 6, spin: 5 });
  return true;
}
/** main 预编译列表 */
export function mageFxSampleMaterials(): THREE.Material[] {
  const out = [...kitSampleMaterials(), bellLikeWarm(), spikeMat(), helixMat(0xff8030, 0xffe0a0), ILF().shaft];   // 熔岩刺与冰刺同程序（颜色走 uniform）
  for (const w of WARM) { try { out.push(...w()); } catch { /* 忽略 */ } }
  return out;
}

// ---------------------------------------------------------------- 小工具
function delay(sec: number, f: () => void) { let done = false; live(new THREE.Group(), sec, k => { if (k >= 1 && !done) { done = true; f(); } }); }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
function lazy<T>(f: () => T) { let v: T | undefined; return () => (v ??= f()); }
function spriteMat(map: THREE.Texture, color: THREE.ColorRepresentation, op = 1) {
  return new THREE.SpriteMaterial({ map, color: new THREE.Color(color), transparent: true, opacity: op, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
}
/** 弹体飞行方向的两条垂线 */
function frame(o: THREE.Object3D, to: THREE.Vector3) {
  const d = to.clone().sub(o.position); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
  const p1 = V().crossVectors(d, UP); if (p1.lengthSq() < 1e-4) p1.set(1, 0, 0); p1.normalize();
  const p2 = V().crossVectors(d, p1).normalize();
  return { d, p1, p2 };
}
function flatNormals(g: THREE.BufferGeometry) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
/** 世界坐标点 → fx 用的绝对坐标（Vector3 = 绝对） */
const W = (p: THREE.Vector3) => p.clone();

/** 施法手上的小法环（朝目标，0.3 秒） */
function handSigil(at: THREE.Vector3, dir: THREE.Vector3, color: number, size = 0.9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat(runeRingTex(), color, true, 0.9));
  m.position.copy(at); m.lookAt(at.clone().add(dir)); noOl(m);
  live(m, 0.3, k => { m.scale.setScalar(size * (0.4 + 0.8 * easeOut(k * 2))); m.rotateZ(0.12); fadeAll(m, 1 - k); });
}
/** 竖直面向飞行方向的扩散环（命中爆点） */
function burstRing(at: THREE.Vector3, dir: THREE.Vector3, color: number, r: number, dur: number, w = 0.06) {
  const mat = waveMat(color, { w, noise: 0.08, fill: 0.25 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), mat);
  m.position.copy(at); m.lookAt(at.clone().add(dir)); noOl(m);
  live(m, dur, k => { mat.uniforms.uR.value = 0.15 + 0.8 * easeOut(k); mat.uniforms.uOp.value = 1 - k; mat.uniforms.uT.value = vfxTime(); });
}
/** 地面扩散环（贴地网格） */
export function groundWave(c: P2, r: number, color: number, dur: number, o: { w?: number; noise?: number; fill?: number; rings?: number; op?: number; from?: number } = {}) {
  const mat = waveMat(color, o);
  const m = groundMesh(c, r, mat, 0.08, lowQ() ? 6 : 12);
  const op = o.op ?? 1, from = o.from ?? 0.05;
  live(m, dur, k => { mat.uniforms.uR.value = from + (0.95 - from) * easeOut(k); mat.uniforms.uOp.value = op * (1 - k * k); mat.uniforms.uT.value = vfxTime(); });
  return m;
}
/** 地面柔光（模拟法术照亮地面） */
export function groundGlow(c: P2, r: number, color: number, dur: number, peak = 0.8) {
  const mat = decalMat(glowTex(), color, true, peak);
  const m = r > 2.5 ? groundMesh(c, r, mat, 0.05, 6) : flatQuad(c, r, mat, 0.05);
  live(m, dur, k => { mat.opacity = peak * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85); });
}

// ======================================================================
// 1 奥能弹（法师普攻）：紫红晶核 + 旋转符文环 + 螺旋紫火星拖尾；命中小紫爆 + 符文碎片
// ======================================================================
type BoltEl = 'arcane' | 'fire' | 'frost';
/** 奥能弹配色：arcane 行 = 首版原色；fire（炽焰之心 / 熔心护符）、frost（冰川之心 / 暗金「霜心」）= 符文变体 */
const BOLT_C: Record<BoltEl, { core: number; rim: number; ring: number; glow: number; tH: number; tT: number; sigil: number; flash: number }> = {
  arcane: { core: 0xc060ff, rim: 0xfff0ff, ring: 0xd88cff, glow: 0xa040ff, tH: 0xf6d0ff, tT: 0x6a18d0, sigil: 0xc070ff, flash: 0xd080ff },
  fire: { core: 0xff6418, rim: 0xfff0c8, ring: 0xffa850, glow: 0xff5a10, tH: 0xffe0a0, tT: 0xa82206, sigil: 0xff9040, flash: 0xffa040 },
  frost: { core: 0x5aa8e8, rim: 0xf4fcff, ring: 0xa8e4ff, glow: 0x4aa8ff, tH: 0xe8f8ff, tT: 0x2c6cb8, sigil: 0x9fd8ff, flash: 0xaee4ff },
};
const AB_RES: Partial<Record<BoltEl, ReturnType<typeof abRes>>> = {};
function abRes(el: BoltEl) {
  const C = BOLT_C[el], core = new THREE.OctahedronGeometry(0.13, 0); core.scale(1, 1, 2.4);
  return {
    core, coreMat: fresnelMat({ color: C.core, rim: C.rim, pow: 1.3, floor: 0.7, sparkle: el === 'frost' ? 0.8 : 0 }),
    ring: new THREE.PlaneGeometry(0.62, 0.62), ringMat: decalMat(runeRingTex(), C.ring, true, 0.95),
    glow: spriteMat(glowTex(), C.glow, 0.9),
    tail: tailGeo(1.5, 0.34), tailMat: tailMat(C.tH, C.tT, 0.95, el === 'fire' ? 1.2 : 0.8),
  };
}
const AB = (el: BoltEl = 'arcane') => (AB_RES[el] ??= abRes(el));
/** 符文变体命中后挂在敌人身上的余烬（灼烧期间往上飘火星） */
function emberAura(e: FxUnit, dur: number, rate = 1) {
  const h = unitHeight(e);
  live(new THREE.Group(), dur, () => {
    if (!e.alive || Math.random() > (lowQ() ? 0.12 : 0.35) * rate) return;
    fx('spark', { x: e.pos.x + rnd(-0.35, 0.35), y: rnd(0.2, h * 0.9), z: e.pos.z + rnd(-0.35, 0.35) }, { count: 1, color: 0xffe0a0, color2: 0xff5a10, colorEnd: 0x601008, speed: 0.2, up: 1, life: 0.6, size: 0.1, sizeEnd: 0.02, gravity: -1.5 });
    if (Math.random() < 0.3) fx('flame', { x: e.pos.x + rnd(-0.3, 0.3), y: rnd(0.2, h * 0.6), z: e.pos.z + rnd(-0.3, 0.3) }, { count: 1, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, speed: 0.1, up: 1.2, life: 0.35, size: 0.4, sizeEnd: 0.1 });
  });
}
const effDur = (s: ResolvedSkill, type: string, dflt: number) => { const e = s.effects.find(x => x.type === type) as { duration?: number } | undefined; return e ? Math.min(6, e.duration ?? dflt) : 0; };
function boltOf(el: BoltEl): MageProj {
  const C = BOLT_C[el];
  return {
    make() {
      const R = AB(el), g = new THREE.Group();
      const core = new THREE.Mesh(R.core, R.coreMat); core.name = 'core'; g.add(core);
      if (!lowQ()) { const ring = new THREE.Mesh(R.ring, R.ringMat); ring.name = 'ring'; ring.position.z = -0.05; g.add(ring); }
      const s = new THREE.Sprite(R.glow); s.scale.setScalar(0.95); g.add(s);
      g.add(new THREE.Mesh(R.tail, R.tailMat));
      return g;
    },
    tick(o, _s, dt, to) {
      const R = AB(el), t = o.userData.mfxT as number, { d, p1, p2 } = frame(o, to);
      if (t === 0) { handSigil(o.position, d, C.sigil, 0.8); fx('star', W(o.position), { count: 1, color: 0xffffff, color2: C.sigil, speed: 0, up: 0, life: 0.15, size: 0.9, sizeEnd: 0.3 }); }
      o.lookAt(to);
      const core = o.getObjectByName('core'), ring = o.getObjectByName('ring');
      if (core) core.rotation.z += dt * 7; if (ring) ring.rotation.z -= dt * 10;
      R.coreMat.uniforms.uT.value = R.tailMat.uniforms.uT.value = vfxTime();
      // 螺旋火星：两股，相位相反（符文变体换成该元素的粒子）
      const a = t * 24;
      for (let k = 0; k < (lowQ() ? 1 : 2); k++) {
        const aa = a + k * Math.PI, p = o.position.clone().addScaledVector(p1, Math.cos(aa) * 0.17).addScaledVector(p2, Math.sin(aa) * 0.17);
        if (el === 'arcane') fx('dot', p, { count: 1, color: 0xf8c0ff, color2: 0x9038ff, speed: 0.2, up: 0, life: 0.38, size: 0.13, sizeEnd: 0.02 });
        else elemMote(el, p, 0.7);
      }
      if (el === 'arcane' && Math.random() < 0.3) fx('spark', W(o.position), { count: 1, color: 0xf0d0ff, color2: 0xb060ff, speed: 1.2, up: 0.2, life: 0.25, size: 0.12, sizeEnd: 0.03 });
      if (el === 'frost' && Math.random() < 0.25) fx('smoke', o.position.clone().addScaledVector(d, -0.4), { count: 1, color: 0xdcefff, color2: 0xbcd8f0, colorEnd: 0x7890a8, speed: 0.1, up: 0.05, life: 0.45, size: 0.3, sizeEnd: 0.8 });
    },
    hit(o, s, tg, apply) {
      apply();
      const p = W(o.position), d = V(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
      if (el === 'arcane') {
        fx('star', p, { count: 1, color: 0xffffff, color2: 0xd080ff, speed: 0, up: 0, life: 0.16, size: 1.7, sizeEnd: 0.4 });
        fx('shard', p, { count: 9, color: 0xf0c8ff, color2: 0x8a3cff, speed: 5, up: 0.8, life: 0.45, size: 0.2, sizeEnd: 0.08, gravity: 5, spin: 7, drag: 1.5 });
        fx('rune', p, { count: 2, color: 0xe0a0ff, speed: 2.2, up: 0.6, life: 0.5, size: 0.34, sizeEnd: 0.12, spin: 2, drag: 2 });
        fx('dot', p, { count: 12, color: 0xf8d0ff, color2: 0x9040ff, speed: 4, up: 0.4, life: 0.3, size: 0.14, sizeEnd: 0.02, drag: 3 });
      } else {
        elemBurst(el, p, 0.75);
        fx('rune', p.clone(), { count: 2, color: C.ring, speed: 2.2, up: 0.6, life: 0.5, size: 0.34, sizeEnd: 0.12, spin: 2, drag: 2 });   // 奥能弹的符文碎片保留，换色
        if (tg.alive) {
          if (el === 'fire') { const du = effDur(s, 'dot', 0); if (du) emberAura(tg, du, 0.6); }
          else { const du = effDur(s, 'slow', 0); if (du) sparkleAura(tg, du, 0x9fd8ff); }
        }
      }
      if (!lowQ()) burstRing(p, d, el === 'arcane' ? 0xc070ff : C.flash, 0.9, 0.24, 0.07);
    },
  };
}
const arcaneBolt = boltOf('arcane');

// ======================================================================
// 2 冰枪 / 3 雷冰枪（冰枪 + 雷枪符文 → nature）：半透明淡蓝长冰矛 + 霜雾拖尾 + 掉落冰晶；命中碎冰 + 结霜
// ======================================================================
function lanceGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.ConeGeometry(0.095, 1.9, 6, 1); main.rotateX(Math.PI / 2); main.translate(0, 0, -0.6); parts.push(main.toNonIndexed());
  const back = new THREE.ConeGeometry(0.075, 0.55, 5, 1); back.rotateX(-Math.PI / 2); back.translate(0, 0, -1.82); parts.push(back.toNonIndexed());
  [-0.22, -0.5, -0.8, -1.08].forEach((z, i) => {
    for (const sgn of [-1, 1]) {
      const b = new THREE.ConeGeometry(0.035, 0.34 - i * 0.03, 4, 1); b.rotateX(Math.PI / 2); b.rotateY(sgn * 0.55); b.translate(sgn * 0.075, 0, z);
      b.rotateZ((i % 2) * Math.PI / 2); parts.push(b.toNonIndexed());
    }
  });
  const g = mergeGeometries(parts) ?? parts[0]; g.computeVertexNormals(); return g;
}
const IL = lazy(() => ({
  shaft: lanceGeo(),
  ice: fresnelMat({ color: 0x4e98dc, rim: 0xf2fbff, op: 0.9, pow: 1.5, floor: 0.45, sparkle: 1 }),
  core: new THREE.CylinderGeometry(0.022, 0.012, 2.1, 5, 1).rotateX(Math.PI / 2).translate(0, 0, -0.75),
  coreIce: new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  coreBolt: new THREE.MeshBasicMaterial({ color: 0xe0c8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  glint: spriteMat(starTex(), 0xcff0ff, 0.95),
  glintBolt: spriteMat(starTex(), 0xe6d8ff, 0.95),
  tail: tailGeo(2.5, 0.6),
  tailIce: tailMat(0xe0f4ff, 0x3c78c0, 0.55, 1.3),
  tailBolt: tailMat(0xe8e0ff, 0x6a50e0, 0.6, 1.3),
}));
/** 熔岩枪（冰枪 + 熔心护符 → fire）：同一冰矛形体，换成暗红熔芯 + 橙金边的发光材质 */
const ILF = lazy(() => ({
  shaft: fresnelMat({ color: 0x8a1c04, rim: 0xffc860, op: 0.95, pow: 1.3, floor: 0.55, sparkle: 0.7 }),
  core: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.4), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  glint: spriteMat(starTex(), 0xffc070, 0.95),
  tail: tailMat(0xffe0a0, 0xa82206, 0.7, 1.5),
}));
type LanceKind = 'ice' | 'bolt' | 'fire';
function makeLance(kind: LanceKind | boolean) {
  const k: LanceKind = kind === true ? 'bolt' : kind === false ? 'ice' : kind, bolt = k === 'bolt';
  const R = IL(), g = new THREE.Group(), F = k === 'fire' ? ILF() : null;
  g.add(new THREE.Mesh(R.shaft, F ? F.shaft : R.ice));
  g.add(new THREE.Mesh(R.core, F ? F.core : bolt ? R.coreBolt : R.coreIce));
  const gl = new THREE.Sprite(F ? F.glint : bolt ? R.glintBolt : R.glint); gl.position.z = 0.32; gl.scale.setScalar(0.75); g.add(gl);
  const t = new THREE.Mesh(R.tail, F ? F.tail : bolt ? R.tailBolt : R.tailIce); t.position.z = -1.2; g.add(t);
  return g;
}
/** 熔岩枪飞行：黑烟 + 火舌拖尾 + 往下滴的熔滴 */
function lanceTickFire(o: THREE.Object3D, to: THREE.Vector3) {
  const F = ILF(), t = o.userData.mfxT as number, { d, p1 } = frame(o, to);
  if (t === 0) { handSigil(o.position, d, 0xff9040, 0.7); fx('star', W(o.position), { count: 1, color: 0xffffff, color2: 0xffa040, speed: 0, up: 0, life: 0.14, size: 1, sizeEnd: 0.2 }); }
  o.lookAt(to); o.rotateZ(t * 3);
  F.shaft.uniforms.uT.value = F.tail.uniforms.uT.value = vfxTime();
  const back = o.position.clone().addScaledVector(d, -0.9);
  fx('smoke', back, { count: 1, color: 0x5a4038, color2: 0x382a24, colorEnd: 0x120c0a, speed: 0.15, up: 0.25, life: 0.6, size: 0.4, sizeEnd: 1.1 });
  elemMote('fire', back.clone().addScaledVector(p1, (Math.random() - 0.5) * 0.3), 0.9);
  if (Math.random() < (lowQ() ? 0.2 : 0.5)) fx('spark', back.clone().addScaledVector(p1, (Math.random() - 0.5) * 0.4), { count: 1, color: 0xffe8b0, color2: 0xff6010, colorEnd: 0x601008, speed: 0.3, up: -0.1, life: 0.7, size: 0.12, sizeEnd: 0.05, gravity: 5 });
}
function lanceTick(o: THREE.Object3D, dt: number, to: THREE.Vector3, bolt: boolean) {
  const R = IL(), t = o.userData.mfxT as number, { d, p1 } = frame(o, to);
  if (t === 0) { handSigil(o.position, d, bolt ? 0xb8a8ff : 0x9fd8ff, 0.7); fx('star', W(o.position), { count: 1, color: 0xffffff, color2: 0x9fd8ff, speed: 0, up: 0, life: 0.14, size: 1, sizeEnd: 0.2 }); }
  o.lookAt(to);
  o.rotateZ(t * 3);
  R.ice.uniforms.uT.value = R.tailIce.uniforms.uT.value = R.tailBolt.uniforms.uT.value = vfxTime();
  const back = o.position.clone().addScaledVector(d, -0.9);
  fx('smoke', back, { count: 1, color: 0xdcefff, color2: 0xbcd8f0, colorEnd: 0x7890a8, speed: 0.15, up: 0.05, life: 0.6, size: 0.45, sizeEnd: 1.2 });
  if (Math.random() < (lowQ() ? 0.25 : 0.6)) fx('ice', back.clone().addScaledVector(p1, (Math.random() - 0.5) * 0.4), { count: 1, color: 0xf2fbff, color2: 0x9fd8ff, speed: 0.3, up: -0.1, life: 0.8, size: 0.16, sizeEnd: 0.07, gravity: 4, spin: 3 });
  if (bolt && Math.random() < (lowQ() ? 0.12 : 0.4)) {
    const a = o.position.clone().addScaledVector(d, -Math.random() * 1.4), b = a.clone().addScaledVector(p1, (Math.random() - 0.5) * 0.9).add(V(0, (Math.random() - 0.5) * 0.6, 0));
    arcBolt(a, b, { els: ['nature'], life: 0.06, width: 0.014, branches: 0, jag: 0.4 });
  }
  void dt;
}
/** 命中碎冰：放射冰刺 + 冰晶 + 冰屑 + 霜雾 */
function iceShatter(p: THREE.Vector3, dir: THREE.Vector3, big = 1) {
  fx('star', p, { count: 1, color: 0xffffff, color2: 0xaee4ff, speed: 0, up: 0, life: 0.16, size: 2 * big, sizeEnd: 0.4 });
  fx('ice', p, { count: Math.round(22 * big), color: 0xf2fbff, color2: 0x8fd0ff, speed: 6, up: 1.4, life: 0.6, size: 0.34, sizeEnd: 0.14, gravity: 9, spin: 8, drag: 1 });
  fx('shard', p, { count: Math.round(10 * big), color: 0xeaf8ff, color2: 0x9fd8ff, speed: 4.5, up: 1.6, life: 0.7, size: 0.2, sizeEnd: 0.12, gravity: 11, spin: 6 });
  fx('smoke', p, { count: 4, color: 0xe0f0ff, color2: 0xc8e0f4, colorEnd: 0x8098b0, speed: 0.9, up: 0.3, life: 0.9, size: 0.6, sizeEnd: 1.6 });
  if (lowQ()) return;
  radialSpikes(p, dir, big, 0x7cc0f0, 0xffffff);
}
/** 熔岩碎裂（熔岩枪命中）：同冰枪的放射刺形体，换成熔岩刺 + 火舌 + 下落余烬 + 黑烟 */
function lavaShatter(p: THREE.Vector3, dir: THREE.Vector3, big = 1) {
  elemBurst('fire', p, big * 1.3);
  fx('flame', p.clone(), { count: Math.round(8 * big), color: 0xffe090, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.3, speed: 1.2, up: 2.4, life: 0.55, size: 0.9, sizeEnd: 0.2 });
  if (lowQ()) return;
  radialSpikes(p, dir, big, 0xc02a06, 0xffd080);
}
/** 放射晶刺（星形爆裂，0.32 秒）：冰枪 / 熔岩枪共用，只换颜色 */
function radialSpikes(p: THREE.Vector3, dir: THREE.Vector3, big: number, color: number, rim: number) {
  const g = new THREE.Group(), geo = new THREE.ConeGeometry(0.06, 1, 4, 1).translate(0, 0.5, 0), mat = fresnelMat({ color, rim, op: 0.95, pow: 1.2, floor: 0.6 });
  const n = 9, q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    const v = V(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).addScaledVector(dir, -0.6).normalize();
    q.setFromUnitVectors(UP, v); m.quaternion.copy(q); m.userData.len = rnd(0.5, 1.1); g.add(m);
  }
  g.position.copy(p);
  live(noOl(g), 0.32, k => { const e = easeOut(k * 3); g.children.forEach(c => c.scale.set(1 - k * 0.6, (c.userData.len as number) * e * big, 1 - k * 0.6)); mat.uniforms.uOp.value = 1 - k; });
}
/** 敌人结霜：脚下冰面 + 冰晶簇 + 身上冰屑闪烁，跟随 dur 秒（死了就收） */
function frostCrust(e: FxUnit, dur: number, tint = 0x9fd8ff) {
  const h = unitHeight(e), r = Math.min(1.6, Math.max(0.6, h * 0.42));
  const g = new THREE.Group();
  const gmat = iceGroundMat(0.85);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2).rotateX(-Math.PI / 2), gmat); disc.position.y = 0.06; disc.renderOrder = 2; g.add(disc);
  const cone = new THREE.ConeGeometry(0.1, 1, 5, 1).translate(0, 0.5, 0), cmat = fresnelMat({ color: 0x5ea2dc, rim: 0xf2fbff, op: 0.85, pow: 1.4, floor: 0.45, additive: false });
  const n = qn(8, 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), m = new THREE.Mesh(flatNormals(cone.clone()), cmat);
    m.position.set(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55);
    m.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); m.userData.len = rnd(0.25, 0.6) * Math.min(1.6, h / 2.1); g.add(m);
  }
  noOl(g);
  let gone = 1;
  live(g, dur, (k, dt) => {
    if (!e.alive) gone = Math.max(0, gone - dt * 4);
    g.position.set(e.pos.x, gy(e.pos.x, e.pos.z), e.pos.z);
    const grow = easeOut(k * dur / 0.18), f = Math.min(1, (1 - k) * dur / 0.4) * gone;
    g.children.forEach(c => { if (c !== disc) c.scale.set(1, (c.userData.len as number) * grow, 1); });
    gmat.uniforms.uT.value = vfxTime(); fadeAll(g, f);
    if (e.alive && Math.random() < (lowQ() ? 0.08 : 0.25)) fx('ice', { x: e.pos.x + rnd(-0.35, 0.35), y: rnd(0.3, h * 0.9), z: e.pos.z + rnd(-0.35, 0.35) }, { count: 1, color: 0xffffff, color2: tint, speed: 0.2, up: 0.1, life: 0.5, size: 0.16, sizeEnd: 0.05, spin: 2 });
  });
}
const slowDur = (s: ResolvedSkill, dflt: number) => { const e = s.effects.find(x => x.type === 'slow') as { duration?: number } | undefined; return Math.min(6, e?.duration ?? dflt); };
const iceLance: MageProj = {
  make: () => makeLance(false),
  tick: (o, _s, dt, to) => lanceTick(o, dt, to, false),
  hit(o, s, tg, apply) {
    apply();
    const p = W(o.position), d = frame(o, tg.pos.clone().setY(o.position.y)).d;
    iceShatter(p, d, 1);
    if (tg.alive) frostCrust(tg, slowDur(s, 3));
  },
};
const thunderLance: MageProj = {
  make: () => makeLance(true),
  tick: (o, _s, dt, to) => lanceTick(o, dt, to, true),
  hit(o, s, tg, apply) {
    const p = W(o.position), d = frame(o, tg.pos.clone().setY(o.position.y)).d;
    MAGE_CHAIN.on = true;
    try { withBolt(CHAIN_ELS, apply); } finally { MAGE_CHAIN.on = false; }
    iceShatter(p, d, 0.75);
    shockHit({ x: tg.pos.x, y: tg.pos.y, z: tg.pos.z }, CHAIN_ELS, true);
    for (let i = 0; i < (lowQ() ? 1 : 3); i++) { const a = Math.random() * 6.28; arcBolt(p, p.clone().add(V(Math.cos(a) * 1.3, rnd(-0.5, 0.8), Math.sin(a) * 1.3)), { els: CHAIN_ELS, life: 0.16, width: 0.03, branches: 1 }); }
    if (tg.alive && s.effects.some(e => e.type === 'slow')) frostCrust(tg, slowDur(s, 3), 0xc8b8ff);
  },
};
/** 熔岩枪（ice_lance@fire，熔心护符「所有技能变为火焰」）：冰矛形体 + 熔岩配色；命中熔岩碎裂；有减速 / 灼烧时身上余烬 */
const lavaLance: MageProj = {
  make: () => makeLance('fire'),
  tick: (o, _s, _dt, to) => lanceTickFire(o, to),
  hit(o, s, tg, apply) {
    apply();
    const p = W(o.position), d = frame(o, tg.pos.clone().setY(o.position.y)).d;
    lavaShatter(p, d, 1);
    if (!lowQ()) burstRing(p, d, 0xff8a3a, 1, 0.26, 0.07);
    if (tg.alive) emberAura(tg, Math.max(effDur(s, 'dot', 0), effDur(s, 'slow', 0), 1.5), 0.8);
  },
};

// ======================================================================
// 4 星界弹幕：扇形 5 枚白紫四芒星弹，短彗尾、微弯；命中小星爆 + 减速紫星屑
// ======================================================================
type StarEl = 'arcane' | 'fire';
/** 星界弹幕配色：arcane = 首版原色；fire = 熔心护符变体（橙金四芒星 + 余烬彗尾） */
const SB_C: Record<StarEl, { star: number; glow: number; tH: number; tT: number; circle: number; flash: number; aura: number }> = {
  arcane: { star: 0xf6f0ff, glow: 0x8c58ff, tH: 0xeee4ff, tT: 0x5a2cc0, circle: 0x9a68ff, flash: 0xb08cff, aura: 0xb090ff },
  fire: { star: 0xfff0d0, glow: 0xff5a10, tH: 0xffe0a0, tT: 0xa82206, circle: 0xff8a3a, flash: 0xffa040, aura: 0xffa040 },
};
const SB_RES: Partial<Record<StarEl, ReturnType<typeof sbRes>>> = {};
function sbRes(el: StarEl) {
  const C = SB_C[el];
  return { star: spriteMat(starTex(), C.star, 1), glow: spriteMat(glowTex(), C.glow, 0.85), tail: tailGeo(1.7, 0.36), tailMat: tailMat(C.tH, C.tT, 0.9, el === 'fire' ? 1.1 : 0.6) };
}
const SB = (el: StarEl = 'arcane') => (SB_RES[el] ??= sbRes(el));
function starOf(el: StarEl): MageProj {
  const C = SB_C[el];
  return {
    make(_s, i) {
      const R = SB(el), g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; g.add(body);
      const st = new THREE.Sprite(R.star); st.scale.setScalar(0.85); body.add(st);
      const gl = new THREE.Sprite(R.glow); gl.scale.setScalar(1.25); body.add(gl);
      body.add(new THREE.Mesh(R.tail, R.tailMat));
      g.userData.amp = ((i % 5) - 2) * 0.55 + rnd(-0.15, 0.15) || 0.35;
      return g;
    },
    tick(o, _s, _dt, to) {
      const R = SB(el), t = o.userData.mfxT as number, body = o.getObjectByName('body');
      const dist = o.position.distanceTo(to);
      if (t === 0) {
        o.userData.d0 = Math.max(1, dist);
        if (o.userData.mfxI === 0) castCircle({ x: o.position.x, z: o.position.z }, C.circle, 1.5, 0.7);
        fx('star', W(o.position), { count: 1, color: 0xffffff, color2: C.flash, speed: 0, up: 0, life: 0.12, size: 0.7, sizeEnd: 0.2 });
      }
      o.lookAt(to);
      const k = Math.min(1, Math.max(0, 1 - dist / (o.userData.d0 as number))), arc = Math.sin(Math.PI * k);
      if (body) { body.position.set((o.userData.amp as number) * arc, 0.3 * arc, 0); body.rotation.y = Math.atan2((o.userData.amp as number) * Math.PI * Math.cos(Math.PI * k), o.userData.d0 as number); }   // 切线 (dx/ds,0,1)：rotation.y=θ 把 +z 转到 (sinθ,0,cosθ)，所以取正号
      R.star.rotation += 0.15; R.tailMat.uniforms.uT.value = vfxTime();
      if (body && Math.random() < (lowQ() ? 0.35 : 0.8)) {
        if (el === 'arcane') fx('dot', body.getWorldPosition(V()), { count: 1, color: 0xf0e8ff, color2: 0x8a5cff, speed: 0.35, up: 0, life: 0.45, size: 0.12, sizeEnd: 0.02 });
        else elemMote(el, body.getWorldPosition(V()), 0.6);
      }
    },
    hit(o, s, tg, apply) {
      apply();
      const body = o.getObjectByName('body'), p = body ? body.getWorldPosition(V()) : W(o.position);
      if (el === 'arcane') {
        fx('star', p, { count: 1, color: 0xffffff, color2: 0xc0a0ff, speed: 0, up: 0, life: 0.2, size: 1.8, sizeEnd: 0.3 });
        fx('star', p, { count: 5, color: 0xf4eeff, color2: 0x9a70ff, speed: 3, up: 0.6, life: 0.4, size: 0.4, sizeEnd: 0.05, drag: 3 });
        fx('dot', p, { count: 10, color: 0xf0e8ff, color2: 0x7a48ff, speed: 3.5, up: 0.5, life: 0.35, size: 0.12, sizeEnd: 0.02, drag: 2 });
        if (tg.alive) sparkleAura(tg, slowDur(s, 2), C.aura);
      } else {
        fx('star', p, { count: 5, color: 0xfff4e0, color2: C.flash, speed: 3, up: 0.6, life: 0.4, size: 0.4, sizeEnd: 0.05, drag: 3 });   // 星爆形体保留，换火色
        elemBurst(el, p.clone(), 0.6);
        if (tg.alive) emberAura(tg, Math.max(effDur(s, 'dot', 0), 2), 0.5);
      }
    },
  };
}
const starBarrage = starOf('arcane');
/** 脚下法环（星界弹幕起手 / 通用） */
function castCircle(c: P2, color: number, r: number, dur: number) {
  const mat = decalMat(runeRingTex(), color, true, 0.85), m = flatQuad(c, r, mat, 0.08);
  live(m, dur, k => { m.rotation.y += 0.02; m.scale.setScalar(0.7 + 0.3 * easeOut(k * 3)); mat.opacity = 0.85 * (1 - k); });
  fx('star', { x: c.x, y: 0.2, z: c.z }, { count: 8, color: 0xffffff, color2: color, radius: r * 0.9, ring: true, speed: 0.2, up: 0.6, life: 0.5, size: 0.3, sizeEnd: 0.05 });
}
/** 身上闪烁的小星屑（减速标记） */
function sparkleAura(e: FxUnit, dur: number, color: number) {
  const h = unitHeight(e);
  live(new THREE.Group(), dur, () => { if (e.alive && Math.random() < (lowQ() ? 0.1 : 0.3)) fx('star', { x: e.pos.x + rnd(-0.4, 0.4), y: rnd(0.4, h), z: e.pos.z + rnd(-0.4, 0.4) }, { count: 1, color: 0xffffff, color2: color, speed: 0.1, up: 0.3, life: 0.45, size: 0.22, sizeEnd: 0.03 }); });
}

// ======================================================================
// 5 寒焰交织：目标处冰火双螺旋爆发 + 冰晶冠；随后（寒霜地带时长）冰裂地面 + 冷雾
// ======================================================================
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private ph: number, private R: number, private H: number, private turns: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = this.ph + t * this.turns * Math.PI * 2, r = this.R * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    return target.set(Math.cos(a) * r, t * this.H, Math.sin(a) * r);
  }
}
function helixMat(a: number, b: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uHead: { value: 0 }, uT: { value: 0 }, uOp: { value: 1 }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `${GLSL_NOISE}
uniform vec3 uA; uniform vec3 uB; uniform float uHead; uniform float uT; uniform float uOp; uniform float uSeed;
varying vec2 vUv;
void main(){
  float n = fbm(vec2(vUv.x * 9.0 - uT * 5.0 + uSeed, vUv.y * 4.0));
  float n2 = vn(vec2(vUv.x * 30.0 - uT * 9.0, vUv.y * 9.0 + uSeed));
  float body = smoothstep(uHead, uHead - 0.06, vUv.x);
  float tip = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  float wisp = smoothstep(0.25, 0.75, n + 0.25 * n2);
  float a = wisp * body * tip * uOp;
  gl_FragColor = vec4(mix(uA, uB, n2) * (0.7 + 0.8 * wisp) * a, a);
}`,
  });
}
/** 冰火双螺旋（高 H，0.3 秒自下而上卷起，持续 dur） */
function frostfireHelix(c: P2, H: number, R: number, dur: number) {
  const g = new THREE.Group(); g.position.set(c.x, gy(c.x, c.z) + 0.1, c.z);
  const seg = lowQ() ? 40 : 90, rad = lowQ() ? 5 : 8;
  const fire = helixMat(0xff7a20, 0xffe6a0), ice = helixMat(0x6fb8ff, 0xf0fbff);
  const tubes: [THREE.ShaderMaterial, number][] = [[fire, 0], [ice, Math.PI]];
  for (const [m, ph] of tubes) { g.add(new THREE.Mesh(new THREE.TubeGeometry(new HelixCurve(ph, R, H, 2.2), seg, 0.26, rad, false), m)); if (!lowQ()) g.add(new THREE.Mesh(new THREE.TubeGeometry(new HelixCurve(ph + 0.35, R * 1.25, H * 0.92, 2.2), seg / 2, 0.12, 5, false), m)); }
  noOl(g);
  live(g, dur, k => {
    const t = k * dur;
    g.rotation.y += 0.09;
    for (const m of [fire, ice]) { m.uniforms.uHead.value = Math.min(1.06, t / 0.32); m.uniforms.uT.value = vfxTime(); m.uniforms.uOp.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; }
    if (t < dur * 0.7 && Math.random() < (lowQ() ? 0.3 : 0.9)) {
      const hh = Math.random() * H * Math.min(1, t / 0.32), a = hh / H * 2.2 * Math.PI * 2;
      fx('flame', { x: c.x + Math.cos(a) * R * 0.8, y: hh, z: c.z + Math.sin(a) * R * 0.8 }, { count: 1, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, speed: 0.5, up: 1, life: 0.4, size: 0.6, sizeEnd: 0.15 });
      fx('ice', { x: c.x - Math.cos(a) * R * 0.8, y: hh, z: c.z - Math.sin(a) * R * 0.8 }, { count: 1, color: 0xf2fbff, color2: 0x8fd0ff, speed: 0.8, up: 0.4, life: 0.5, size: 0.25, sizeEnd: 0.08, spin: 4 });
    }
  });
}
/** 地面冒出的一簇冰晶（中心冰冠） */
function iceCrown(c: P2, n: number, hMax: number, rMax: number, dur: number) {
  const g = new THREE.Group(); g.position.set(c.x, gy(c.x, c.z) - 0.05, c.z);
  const mat = fresnelMat({ color: 0x5aa0dc, rim: 0xf4fcff, op: 0.92, pow: 1.4, floor: 0.5, additive: false, sparkle: 1 });
  for (let i = 0; i < n; i++) {
    const geo = flatNormals(new THREE.ConeGeometry(rnd(0.12, 0.28), 1, 5, 1).translate(0, 0.5, 0));
    const m = new THREE.Mesh(geo, mat), a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * rMax;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.rotation.set(Math.sin(a) * rnd(0.3, 0.8), Math.random() * 6, -Math.cos(a) * rnd(0.3, 0.8));
    m.userData.len = rnd(0.45, 1) * hMax; m.userData.dl = rnd(0, 0.08); g.add(m);
  }
  noOl(g);
  live(g, dur, (k) => {
    const t = k * dur;
    g.children.forEach(m => { const gr = easeOut((t - (m.userData.dl as number)) / 0.12), sh = Math.max(0, (t - dur + 0.35) / 0.35); m.scale.set(1 - sh * 0.7, (m.userData.len as number) * gr * (1 - sh), 1 - sh * 0.7); });
    mat.uniforms.uT.value = vfxTime();
    if (Math.abs(t - (dur - 0.3)) < 0.02) fx('ice', { x: c.x, y: 0.5, z: c.z }, { count: 14, color: 0xf2fbff, color2: 0x8fd0ff, radius: rMax * 0.7, speed: 3, up: 1.5, life: 0.5, size: 0.25, sizeEnd: 0.1, gravity: 8, spin: 6 });
  });
}
/** 冰裂地面 + 冷雾（持续 dur） */
export function frostGround(c: P2, r: number, dur: number, mist = true) {
  const mat = iceGroundMat(1), m = groundMesh(c, r * 1.05, mat, 0.05);
  live(m, dur, (k, dt) => {
    const t = k * dur;
    mat.uniforms.uT.value = vfxTime();
    mat.uniforms.uOp.value = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.7);
    mat.uniforms.uGlow.value = 0.6 + 0.6 * Math.max(0, 1 - t / 0.8);
    if (mist && Math.random() < dt * (lowQ() ? 3 : 9)) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r * 0.95;
      fx('smoke', { x: c.x + Math.cos(a) * d, y: 0.15, z: c.z + Math.sin(a) * d }, { count: 1, color: 0xd8ecff, color2: 0xb8d4ee, colorEnd: 0x7890a8, speed: 0.25, up: 0.12, life: 1.6, size: 1.1, sizeEnd: 2.2 });
    }
    if (Math.random() < dt * (lowQ() ? 2 : 6)) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r; fx('star', { x: c.x + Math.cos(a) * d, y: 0.12, z: c.z + Math.sin(a) * d }, { count: 1, color: 0xffffff, color2: 0x9fd8ff, speed: 0, up: 0.05, life: 0.35, size: 0.25, sizeEnd: 0.02 }); }
  });
}
const frostfire: MageArea = (s, c, _hits, apply) => {
  const r = s.stats.radius;
  frostfireHelix(c, Math.min(5.5, r * 1.1), Math.min(1.3, r * 0.26), 1.25);
  iceCrown(c, qn(9, 4), 1.6, r * 0.32, 1.4);
  fx('star', { x: c.x, y: 1.2, z: c.z }, { count: 1, color: 0xffffff, color2: 0xffd0a0, speed: 0, up: 0, life: 0.22, size: 3.2, sizeEnd: 0.6 });
  fx('flame', { x: c.x, y: 0.4, z: c.z }, { count: 26, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.6, speed: 3.5, up: 3, life: 0.6, size: 1, sizeEnd: 0.2, drag: 1.5 });
  fx('ice', { x: c.x, y: 0.4, z: c.z }, { count: 26, color: 0xf2fbff, color2: 0x7fc8ff, radius: 0.4, ring: true, speed: r * 2.2, up: 0.5, life: 0.5, size: 0.4, sizeEnd: 0.12, drag: 2.5, spin: 6 });
  fx('smoke', { x: c.x, y: 0.5, z: c.z }, { count: 10, color: 0xf0f4f8, color2: 0xdde6ee, colorEnd: 0x9fb4c4, radius: 0.8, speed: 1.6, up: 1.2, life: 1, size: 1, sizeEnd: 2.4 });   // 冰火相遇的蒸汽
  groundWave(c, r * 1.1, 0xff8a3a, 0.5, { w: 0.05, noise: 0.15, fill: 0.2 });
  groundWave(c, r * 1.15, 0x8fd8ff, 0.65, { w: 0.06, noise: 0.2, from: 0.15 });
  groundGlow(c, r * 0.8, 0xff9040, 0.6, 0.7);
  const zones = apply ? apply('frost') : [];
  if (zones.length) for (const z of zones) frostGround(z, z.r, z.dur);
  else frostGround(c, r * 0.7, 1.4, false);
};

// ======================================================================
// 9 冰河时代：以法师为中心霜爆，环状巨型锯齿冰刺（一次绘制，着色器逐根长出 / 碎裂），敌人冻入冰块，雪与冰雾外吹，地面冰面 + 发光符文
// ======================================================================
function spikeMat(c = 0x4f94d8, r = 0xf4fcff) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, toneMapped: false, side: THREE.FrontSide,
    uniforms: { uT: { value: 0 }, uEnd: { value: 99 }, uOp: { value: 1 }, uC: { value: new THREE.Color(c) }, uR: { value: new THREE.Color(r) } },
    vertexShader: `attribute vec3 aPivot; attribute float aDelay; attribute float aH;
uniform float uT; uniform float uEnd;
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
void main(){
  float g = clamp((uT - aDelay) / 0.16, 0.0, 1.0); g = 1.0 - pow(1.0 - g, 3.0); g *= 1.0 + 0.15 * sin(g * 3.14159);
  float sh = clamp((uT - uEnd - aDelay * 0.5) / 0.35, 0.0, 1.0);
  vec3 p = aPivot + (position - aPivot) * g * (1.0 - sh * 0.6);
  p.y -= sh * aH * 0.9;
  vY = clamp((position.y - aPivot.y) / max(aH, 0.01), 0.0, 1.0);
  vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: `${GLSL_NOISE}
uniform float uT; uniform float uOp; uniform vec3 uC; uniform vec3 uR;
varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
void main(){
  vec3 n = normalize(vN);
  float f = pow(1.0 - abs(dot(n, normalize(vV))), 1.3);
  float facet = 0.5 + 0.5 * dot(n, normalize(vec3(0.4, 0.8, 0.3)));
  float sp = step(0.988, h21(floor(vW.xz * 9.0 + vW.y * 6.0) + floor(uT * 10.0)));
  vec3 c = mix(uC * (0.55 + 0.6 * facet), uR, f * 0.85 + vY * 0.35) + sp * uR;
  gl_FragColor = vec4(c, uOp * (0.62 + 0.38 * f + 0.2 * vY));
}`,
  });
}
/** 合批冰刺环：每根带 aPivot / aDelay / aH 属性，着色器负责生长与碎裂 */
function spikeRing(c: P2, r: number, dur: number, fire = false) {
  const parts: THREE.BufferGeometry[] = [];
  const clusters = qn(26, 9);
  const piv = new THREE.Vector3();
  for (let i = 0; i < clusters; i++) {
    const a = i / clusters * Math.PI * 2 + rnd(-0.08, 0.08);
    const each = lowQ() ? 2 : 3 + Math.floor(Math.random() * 2);
    for (let j = 0; j < each; j++) {
      const d = r * rnd(0.72, 1.0), aa = a + rnd(-0.12, 0.12), x = c.x + Math.cos(aa) * d, z = c.z + Math.sin(aa) * d;
      const h = (j === 0 ? rnd(2.2, 3.4) : rnd(0.9, 2.0)) * Math.min(1.3, r / 7 + 0.3), rad = h * rnd(0.12, 0.18);
      const g = new THREE.ConeGeometry(rad, h, 4 + (j % 2), 1).translate(0, h / 2, 0).toNonIndexed();
      // 向外倾斜 + 随机扭
      const tilt = rnd(0.2, 0.55), m4 = new THREE.Matrix4().makeRotationY(Math.random() * 6.28);
      g.applyMatrix4(m4);
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(V(-Math.sin(aa), 0, Math.cos(aa)), -tilt));
      const y0 = gy(x, z) - 0.15; g.translate(x, y0, z); piv.set(x, y0, z);
      const n = g.attributes.position.count, P = new Float32Array(n * 3), D = new Float32Array(n), H = new Float32Array(n);
      const dl = 0.04 + (d / r) * 0.12 + Math.random() * 0.08;
      for (let v = 0; v < n; v++) { P[v * 3] = piv.x; P[v * 3 + 1] = piv.y; P[v * 3 + 2] = piv.z; D[v] = dl; H[v] = h; }
      g.setAttribute('aPivot', new THREE.BufferAttribute(P, 3)); g.setAttribute('aDelay', new THREE.BufferAttribute(D, 1)); g.setAttribute('aH', new THREE.BufferAttribute(H, 1));
      g.deleteAttribute('uv');
      parts.push(g);
    }
  }
  const geo = mergeGeometries(parts); if (!geo) return;
  geo.computeVertexNormals();
  const mat = fire ? spikeMat(0x4a0e04, 0xffa040) : spikeMat(); mat.uniforms.uEnd.value = dur - 0.55;   // 炎河：黑曜熔岩刺（暗红体 + 橙金边）
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; noOl(mesh);
  let shattered = false;
  live(mesh, dur, k => {
    const t = k * dur; mat.uniforms.uT.value = t;
    if (!shattered && t > dur - 0.55) { shattered = true;
      for (let i = 0; i < qn(10, 4); i++) { const a = Math.random() * 6.28, d = r * rnd(0.75, 1), q = { x: c.x + Math.cos(a) * d, y: 0.8, z: c.z + Math.sin(a) * d };
        if (fire) { fx('spark', q, { count: 5, color: 0xffe8b0, color2: 0xff5a10, colorEnd: 0x601008, speed: 3, up: 2.4, life: 0.8, size: 0.14, sizeEnd: 0.03, gravity: 6 }); fx('smoke', q, { count: 1, color: 0x4a3a34, color2: 0x2c2420, colorEnd: 0x100c0a, speed: 0.5, up: 0.8, life: 1.2, size: 0.8, sizeEnd: 1.8 }); }
        else fx('ice', q, { count: 4, color: 0xf2fbff, color2: 0x8fd0ff, speed: 3, up: 2, life: 0.6, size: 0.3, sizeEnd: 0.1, gravity: 10, spin: 6 }); } }
  });
}
/** 冰块：把敌人封在里面（六棱柱 + 尖顶），眩晕结束 / 死亡 / 首领免控时碎裂 */
function freezeBlock(e: FxUnit, delayS: number, maxDur: number, fire = false) {
  const h = unitHeight(e) * 1.08, rad = Math.min(2.4, Math.max(0.6, h * 0.36));
  const parts = [new THREE.CylinderGeometry(rad * 0.86, rad, h * 0.8, 6, 1).translate(0, h * 0.4, 0).toNonIndexed(), new THREE.ConeGeometry(rad * 0.86, h * 0.28, 6, 1).translate(0, h * 0.94, 0).toNonIndexed()];
  const geo = mergeGeometries(parts) ?? parts[0]; geo.computeVertexNormals();
  const mat = fire ? fresnelMat({ color: 0x3a0c04, rim: 0xffa040, op: 0.8, pow: 1.4, floor: 0.4, additive: false, side: THREE.DoubleSide, sparkle: 0.8 })   // 炎河：熔岩壳
    : fresnelMat({ color: 0x6aa8e0, rim: 0xf4fcff, op: 0.72, pow: 1.3, floor: 0.32, additive: false, side: THREE.DoubleSide, sparkle: 1 });
  const m = new THREE.Mesh(geo, mat); m.rotation.y = Math.random() * 6; noOl(m); m.scale.set(1, 0.001, 1);
  let broke = false;
  live(m, maxDur + 0.1, k => {
    const t = k * (maxDur + 0.1) - delayS;
    m.position.set(e.pos.x, gy(e.pos.x, e.pos.z) - 0.05, e.pos.z);
    mat.uniforms.uT.value = vfxTime();
    if (t < 0) return;
    if (!broke) m.scale.set(1, Math.max(0.001, easeOut(t / 0.16)), 1);
    const end = !e.alive || (t > 0.35 && !e.status.isStunned) || t >= maxDur - delayS - 0.15;
    if (end && !broke) {
      broke = true; m.visible = false;
      if (fire) {
        elemBurst('fire', V(e.pos.x, gy(e.pos.x, e.pos.z) + h * 0.5, e.pos.z), 1.2);
        fx('smoke', { x: e.pos.x, y: 0.4, z: e.pos.z }, { count: 3, color: 0x4a3a34, colorEnd: 0x100c0a, radius: rad * 0.5, speed: 0.6, up: 0.6, life: 1, size: 0.8, sizeEnd: 1.8 });
        return;
      }
      fx('ice', { x: e.pos.x, y: h * 0.5, z: e.pos.z }, { count: 18, color: 0xf2fbff, color2: 0x8fd0ff, radius: rad * 0.6, speed: 4, up: 2, life: 0.6, size: 0.35, sizeEnd: 0.12, gravity: 10, spin: 7 });
      fx('shard', { x: e.pos.x, y: h * 0.5, z: e.pos.z }, { count: 10, color: 0xeaf8ff, color2: 0x9fd8ff, radius: rad * 0.5, speed: 3.5, up: 2.5, life: 0.7, size: 0.25, sizeEnd: 0.12, gravity: 12, spin: 6 });
      fx('smoke', { x: e.pos.x, y: 0.4, z: e.pos.z }, { count: 3, color: 0xe0f0ff, colorEnd: 0x8098b0, radius: rad * 0.5, speed: 0.6, up: 0.3, life: 0.9, size: 0.8, sizeEnd: 1.8 });
    }
  });
}
/** 发光符文冰面（大招底盘） */
function runeFloor(c: P2, r: number, color: number, dur: number, peak = 0.7) {
  const mat = decalMat(runeRingTex(), color, true, 0), m = groundMesh(c, r, mat, 0.09, lowQ() ? 6 : 12);
  live(m, dur, k => { const t = k * dur; mat.opacity = peak * Math.min(1, t / 0.3) * Math.min(1, (dur - t) / 0.8) * (0.85 + 0.15 * Math.sin(t * 6)); });
}
/** 熔岩裂地 + 热浪余烬（炎河，持续 dur）：冰面同一裂纹程序换熔岩色，裂纹亮度按 flick 起落 */
function lavaGround(c: P2, r: number, dur: number) {
  const mat = lavaGroundMat(1), m = groundMesh(c, r * 1.05, mat, 0.05), seed = Math.random() * 50;
  live(m, dur, (k, dt) => {
    const t = k * dur;
    mat.uniforms.uT.value = vfxTime();
    mat.uniforms.uOp.value = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.7);
    mat.uniforms.uGlow.value = (0.7 + 0.6 * Math.max(0, 1 - t / 0.8)) * flick(vfxTime(), seed);
    if (Math.random() < dt * (lowQ() ? 3 : 10)) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r * 0.95;
      fx('spark', { x: c.x + Math.cos(a) * d, y: 0.1, z: c.z + Math.sin(a) * d }, { count: 1, color: 0xffe0a0, color2: 0xff5a10, colorEnd: 0x601008, speed: 0.3, up: 1.4, life: 1.1, size: 0.1, sizeEnd: 0.02, gravity: -0.8 });
    }
    if (Math.random() < dt * (lowQ() ? 1 : 3)) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r; fx('smoke', { x: c.x + Math.cos(a) * d, y: 0.2, z: c.z + Math.sin(a) * d }, { count: 1, color: 0x4a3a34, color2: 0x2c2420, colorEnd: 0x100c0a, speed: 0.2, up: 0.5, life: 1.6, size: 0.9, sizeEnd: 2 }); }
  });
}
/** 火光地面贴花（flick 驱动，不加动态灯） */
function fireGlow(c: P2, r: number, color: number, dur: number, peak = 0.8) {
  const mat = decalMat(glowTex(), color, true, peak), m = r > 2.5 ? groundMesh(c, r, mat, 0.05, 6) : flatQuad(c, r, mat, 0.05), seed = Math.random() * 50;
  live(m, dur, k => { mat.opacity = peak * (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * flick(vfxTime(), seed); });
}
const iceAge: MageArea = (s, c, hits) => {
  const r = s.stats.radius, DUR = 3.6;
  const stun = (s.effects.find(e => e.type === 'stun') as { duration?: number } | undefined)?.duration ?? 2.5;
  fx('star', { x: c.x, y: 1.4, z: c.z }, { count: 1, color: 0xffffff, color2: 0x9fd8ff, speed: 0, up: 0, life: 0.3, size: 4.5, sizeEnd: 0.8 });
  groundWave(c, r * 1.2, 0xe8f8ff, 0.45, { w: 0.04, noise: 0.18, fill: 0.35, rings: 2 });
  groundWave(c, r * 1.25, 0x7fc8ff, 0.7, { w: 0.07, noise: 0.25, from: 0.2 });
  groundGlow(c, r * 0.9, 0x6fb8ff, 1.2, 0.75);
  frostGround(c, r * 1.1, DUR, false);
  runeFloor(c, r * 0.92, 0x8fd8ff, DUR, 0.75);
  spikeRing(c, r, DUR);
  // 雪与冰雾外吹
  fx('smoke', { x: c.x, y: 0.35, z: c.z }, { count: 30, color: 0xeaf4ff, color2: 0xcfe2f4, colorEnd: 0x8aa0b8, radius: 1, ring: true, speed: r * 1.7, up: 0.4, life: 1.6, size: 1.5, sizeEnd: 3.4, drag: 1.2 });
  fx('dot', { x: c.x, y: 0.8, z: c.z }, { count: 70, color: 0xffffff, color2: 0xd8f0ff, radius: 0.6, speed: r * 2.4, up: 1.4, life: 1.3, size: 0.14, sizeEnd: 0.08, drag: 1.4, gravity: 1 });
  fx('ice', { x: c.x, y: 0.6, z: c.z }, { count: 40, color: 0xf2fbff, color2: 0x7fc8ff, radius: 0.5, ring: true, speed: r * 2.8, up: 0.6, life: 0.6, size: 0.45, sizeEnd: 0.15, drag: 2.2, spin: 6 });
  live(new THREE.Group(), 2.2, (k, dt) => { if (Math.random() < dt * (lowQ() ? 8 : 26)) { const a = Math.random() * 6.28, d = r * rnd(0.6, 1.05); fx('dot', { x: c.x + Math.cos(a) * d, y: rnd(0.5, 2.5), z: c.z + Math.sin(a) * d }, { count: 1, color: 0xffffff, color2: 0xd0ecff, speed: 1.5, up: 0.1, life: 1, size: 0.12, sizeEnd: 0.05, drag: 0.5 }); } void k; });
  for (const e of hits) { if (!e.alive) continue; const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z); freezeBlock(e, 0.05 + (d / Math.max(1, r)) * 0.14, Math.min(4, stun + 0.3)); }
};

/** 炎河（ice_age@fire：符文「炎河」/ 熔心护符）：冰河时代同一形体 —— 环状巨刺改黑曜熔岩刺、冰面改熔岩裂地、冰块改熔岩壳、
 *  外吹的雪与冰雾改灰烬与余烬、雪落改上飘火星；无金光柱 / 金环（mageUlt 同冰河时代） */
const fireAge: MageArea = (s, c, hits) => {
  const r = s.stats.radius, DUR = 3.6;
  const stun = (s.effects.find(e => e.type === 'stun') as { duration?: number } | undefined)?.duration ?? 2.5;
  const burn = effDur(s, 'dot', 0);
  fx('star', { x: c.x, y: 1.4, z: c.z }, { count: 1, color: 0xffffff, color2: 0xffb050, speed: 0, up: 0, life: 0.3, size: 4.5, sizeEnd: 0.8 });
  groundWave(c, r * 1.2, 0xffe0b0, 0.45, { w: 0.04, noise: 0.18, fill: 0.35, rings: 2 });
  groundWave(c, r * 1.25, 0xff7a20, 0.7, { w: 0.07, noise: 0.25, from: 0.2 });
  fireGlow(c, r * 0.9, 0xff6a18, 1.6, 0.8);
  lavaGround(c, r * 1.1, DUR);
  runeFloor(c, r * 0.92, 0xff8a3a, DUR, 0.7);
  spikeRing(c, r, DUR, true);
  // 灰烬与热浪外吹
  fx('smoke', { x: c.x, y: 0.35, z: c.z }, { count: 26, color: 0x5a4038, color2: 0x382a24, colorEnd: 0x120c0a, radius: 1, ring: true, speed: r * 1.6, up: 0.6, life: 1.6, size: 1.4, sizeEnd: 3.2, drag: 1.2 });
  fx('spark', { x: c.x, y: 0.8, z: c.z }, { count: 70, color: 0xffeec0, color2: 0xff6010, colorEnd: 0x601008, radius: 0.6, speed: r * 2.4, up: 1.6, life: 1.3, size: 0.13, sizeEnd: 0.03, drag: 1.4, gravity: 1 });
  fx('flame', { x: c.x, y: 0.5, z: c.z }, { count: 36, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.5, ring: true, speed: r * 2.6, up: 0.8, life: 0.6, size: 1.1, sizeEnd: 0.3, drag: 2.2 });
  live(new THREE.Group(), 2.2, (k, dt) => { if (Math.random() < dt * (lowQ() ? 8 : 26)) { const a = Math.random() * 6.28, d = r * rnd(0.4, 1.05); fx('spark', { x: c.x + Math.cos(a) * d, y: rnd(0.2, 1.5), z: c.z + Math.sin(a) * d }, { count: 1, color: 0xffe0a0, color2: 0xff5a10, colorEnd: 0x601008, speed: 0.6, up: 1.4, life: 1.2, size: 0.11, sizeEnd: 0.03, gravity: -1 }); } void k; });
  for (const e of hits) { if (!e.alive) continue; const d = Math.hypot(e.pos.x - c.x, e.pos.z - c.z); freezeBlock(e, 0.05 + (d / Math.max(1, r)) * 0.14, Math.min(4, stun + 0.3), true); if (burn) emberAura(e, burn, 0.7); }
};

// ---------------------------------------------------------------- 预编译样本里的「钟体同款」材质（菲涅尔 + 双面）
function bellLikeWarm() { return fresnelMat({ color: 0xffb040, rim: 0xfff0c0, side: THREE.DoubleSide }); }

// ---------------------------------------------------------------- 登记（本体技能）
registerMageFx('arcane_bolt@arcane', { proj: arcaneBolt });
registerMageFx('ice_lance@frost', { proj: iceLance });
registerMageFx('ice_lance@nature', { proj: thunderLance });
registerMageFx('star_barrage@arcane', { proj: starBarrage });
registerMageFx('frostfire@fire', { area: frostfire });
registerMageFx('ice_age@frost', { area: iceAge });
// 11-17 符文变体（沿用基础技能形体，换元素配色 / 粒子；?off=magerune 回旧画法）
//   arcane_bolt@fire  ← 天赋「炽焰之心」/ 暗金「熔心护符」；arcane_bolt@frost ← 天赋「冰川之心」/ 暗金「霜心」
//   ice_lance@fire / star_barrage@fire ← 熔心护符（所有技能变火）；ice_age@fire ← 符文「炎河」/ 熔心护符
registerMageFx('arcane_bolt@fire', { proj: boltOf('fire'), rune: true });
registerMageFx('arcane_bolt@frost', { proj: boltOf('frost'), rune: true });
registerMageFx('ice_lance@fire', { proj: lavaLance, rune: true });
registerMageFx('star_barrage@fire', { proj: starOf('fire'), rune: true });
registerMageFx('ice_age@fire', { area: fireAge, rune: true });

// 供 DLC 文件复用
export { emberAura, effDur as mageEffDur, fireGlow, lavaGround, frostCrust, iceShatter, castCircle, sparkleAura, delay as mageDelay, spriteMat as mageSpriteMat, frame as mageFrame, handSigil, burstRing, tickT };
