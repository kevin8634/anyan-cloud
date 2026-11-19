// ======================================================================
// DLC1「沉钟之海」法师 40 级绝技的专属表现（Rhett 11-17 批准概念图 /workspace/work/mfx1117/06~08）
//   d1_drown_orb@frost       溺光法球：青蓝水球（水膜菲涅尔 + 绕转水环 + 水雾拖尾）；命中水冠爆溅 + 地面涟漪 + 目标滴水
//   d1_bell_resonance@arcane 钟律共鸣：目标上空半透明金钟落下敲响，金色同心声波环铺地；被敲中的敌人头顶小金钟光环
//   d1_abyss_tide@shadow     渊海潮汐：漆黑紫潮涡池（贴地着色器）+ 卷曲潮触从池边升起 + 暗泡 + 紫电丝
// 只登记表现（registerMageFx），结算全由调用方 apply() 完成，时机与原来一致。
// 本体不 import 这里（dlc-guard）；由 boot.ts import 一次登记。
// fx() 坐标：Vector3 = 世界绝对高度，普通对象 {x,y,z} = 离地高度（vfx.gyRel）。
// 约定同 web/mage_fx_kit.ts：live 物体用新建几何 / 材质（到时 dispose），弹体用共享资源；不加 PointLight；GLSL 不用 half / patch。
// ======================================================================
import * as THREE from 'three';
import { fx, live, vfxTime } from '../../web/vfx';
import { gy } from '../../web/gfx';
import { arcBolt } from '../../web/arcbolt';
import type { ResolvedSkill } from '../../core/types';
import {
  registerMageFx, groundWave, groundGlow, handSigil, mageFrame, mageSpriteMat, mageDelay, emberAura, fireGlow,
  type MageProj, type MageArea, type FxUnit,
} from '../../web/mage_fx';
import {
  P2, lowQ, qn, rnd, easeOut, noOl, unitHeight, GLSL_NOISE,
  fresnelMat, waveMat, decalMat, tailMat, tailGeo, groundMesh, fadeAll, glowTex, starTex, runeRingTex, elemMote, elemBurst,
} from '../../web/mage_fx_kit';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
function lazy<T>(f: () => T) { let v: T | undefined; return () => (v ??= f()); }
const effNum = (s: ResolvedSkill, type: string, key: string, dflt: number) => {
  const e = s.effects.find(x => x.type === type) as Record<string, unknown> | undefined;
  const v = e?.[key]; return typeof v === 'number' ? v : dflt;
};

// ======================================================================
// 6 溺光法球
// ======================================================================
/** 溺光法球配色：frost = 首版水球；fire = 熔心护符变体「沸熔法球」（同一水球形体换熔岩壳 + 橙金水环 + 余烬拖尾） */
type OrbEl = 'frost' | 'fire';
const DO_C: Record<OrbEl, { ball: number; ballR: number; core: number; band: number; glow: number; tH: number; tT: number; sigil: number }> = {
  frost: { ball: 0x0c7898, ballR: 0xd0fff8, core: 0x9ff8ff, band: 0x60e8ff, glow: 0x30d8f0, tH: 0xc8fcff, tT: 0x08588a, sigil: 0x40e0f0 },
  fire: { ball: 0x8a1c04, ballR: 0xffd890, core: 0xffd890, band: 0xff8a30, glow: 0xff5a10, tH: 0xffe0a0, tT: 0xa02006, sigil: 0xff9040 },
};
const DO_RES: Partial<Record<OrbEl, ReturnType<typeof doRes>>> = {};
function doRes(el: OrbEl) {
  const C = DO_C[el];
  return {
    ball: new THREE.SphereGeometry(0.42, 24, 16),
    ballMat: fresnelMat({ color: C.ball, rim: C.ballR, op: 0.95, pow: 1.6, floor: el === 'fire' ? 0.5 : 0.32, sparkle: 0.8 }),
    core: new THREE.SphereGeometry(0.2, 14, 10),
    coreMat: fresnelMat({ color: C.core, rim: 0xffffff, op: 0.9, pow: 1, floor: 0.8, sparkle: 0 }),
    band: new THREE.TorusGeometry(0.5, 0.022, 5, 40),
    bandMat: fresnelMat({ color: C.band, rim: 0xffffff, op: 0.85, pow: 1, floor: 0.7, sparkle: 0.5 }),
    glow: mageSpriteMat(glowTex(), C.glow, 0.75),
    tail: tailGeo(2.4, 0.9), tailMat: tailMat(C.tH, C.tT, 0.7, 1.6),
  };
}
const DO = (el: OrbEl = 'frost') => (DO_RES[el] ??= doRes(el));
function orbOf(el: OrbEl): MageProj {
  const C = DO_C[el], fire = el === 'fire';
  return {
  make() {
    const R = DO(el), g = new THREE.Group();
    g.add(new THREE.Mesh(R.ball, R.ballMat));
    g.add(new THREE.Mesh(R.core, R.coreMat));
    const nb = lowQ() ? 1 : 3;
    for (let i = 0; i < nb; i++) { const b = new THREE.Mesh(R.band, R.bandMat); b.name = 'band'; b.rotation.set(rnd(0, 3), rnd(0, 3), 0); b.userData.w = rnd(3, 6) * (i % 2 ? -1 : 1); g.add(b); }
    const s = new THREE.Sprite(R.glow); s.scale.setScalar(1.7); g.add(s);
    const t = new THREE.Mesh(R.tail, R.tailMat); t.position.z = -0.25; g.add(t);
    return g;
  },
  tick(o, _s, dt, to) {
    const R = DO(el), t = o.userData.mfxT as number, { d, p1, p2 } = mageFrame(o, to);
    if (t === 0) { handSigil(o.position, d, C.sigil, 0.9); if (fire) elemBurst('fire', o.position.clone(), 0.4); else fx('dot', o.position.clone(), { count: 10, color: 0xd0fcff, color2: 0x30b8e0, speed: 2.5, up: 0.4, life: 0.35, size: 0.14, sizeEnd: 0.03, drag: 2 }); }
    o.lookAt(to);
    o.children.forEach(c => { if (c.name === 'band') { c.rotation.x += dt * (c.userData.w as number); c.rotation.y += dt * 1.7; } });
    const T = vfxTime(); R.ballMat.uniforms.uT.value = R.coreMat.uniforms.uT.value = R.bandMat.uniforms.uT.value = R.tailMat.uniforms.uT.value = T;
    // 拖出的水丝：两股螺旋水滴（会往下落）+ 一点水雾（fire：熔滴 + 余烬 + 黑烟）
    const a = t * 18;
    for (let k = 0; k < (lowQ() ? 1 : 2); k++) {
      const aa = a + k * Math.PI, p = o.position.clone().addScaledVector(d, -0.35).addScaledVector(p1, Math.cos(aa) * 0.38).addScaledVector(p2, Math.sin(aa) * 0.38);
      if (fire) { fx('spark', p, { count: 1, color: 0xffe8b0, color2: 0xff6010, colorEnd: 0x601008, speed: 0.3, up: 0, life: 0.55, size: 0.14, sizeEnd: 0.04, gravity: 3 }); if (Math.random() < 0.5) elemMote('fire', p.clone(), 0.8); }
      else fx('dot', p, { count: 1, color: 0xe0ffff, color2: 0x2aa8d8, speed: 0.3, up: 0, life: 0.5, size: 0.15, sizeEnd: 0.03, gravity: 3 });
    }
    if (Math.random() < (lowQ() ? 0.2 : 0.5)) fx('smoke', o.position.clone().addScaledVector(d, -0.7), fire
      ? { count: 1, color: 0x5a4038, color2: 0x382a24, colorEnd: 0x120c0a, speed: 0.2, up: 0.2, life: 0.6, size: 0.5, sizeEnd: 1.3 }
      : { count: 1, color: 0xbfeef8, color2: 0x8fd0e4, colorEnd: 0x40708a, speed: 0.2, up: 0.05, life: 0.6, size: 0.5, sizeEnd: 1.3 });
    if (Math.random() < 0.35) fx('spark', o.position.clone(), { count: 1, color: 0xffffff, color2: fire ? 0xffa040 : 0x60e8ff, speed: 1.4, up: 0.2, life: 0.25, size: 0.12, sizeEnd: 0.03 });
  },
  hit(o, s, tg, apply) {
    apply();
    const p = o.position.clone(), c: P2 = { x: tg.pos.x, z: tg.pos.z }, r = effNum(s, 'explode', 'radius', 3);
    if (fire) {
      elemBurst('fire', p, 1.4);
      fx('spark', { x: c.x, y: 0.6, z: c.z }, { count: 50, color: 0xffeec0, color2: 0xff6010, colorEnd: 0x601008, radius: 0.6, speed: r * 1.6, up: 3.5, life: 0.9, size: 0.16, sizeEnd: 0.04, gravity: 9, drag: 0.6 });
      fx('smoke', { x: c.x, y: 0.4, z: c.z }, { count: 8, color: 0x5a4038, color2: 0x382a24, colorEnd: 0x120c0a, radius: r * 0.4, speed: 1.2, up: 1, life: 1.3, size: 1.2, sizeEnd: 2.6 });
      waterCrown(c, r, true);
      groundWave(c, r * 1.1, 0xffb060, 0.55, { w: 0.05, noise: 0.22, fill: 0.3, rings: 2 });
      mageDelay(0.12, () => groundWave(c, r * 1.2, 0xff6a18, 0.7, { w: 0.04, noise: 0.3, from: 0.2 }));
      if (!lowQ()) mageDelay(0.26, () => groundWave(c, r * 1.25, 0xffe0b0, 0.8, { w: 0.03, noise: 0.35, from: 0.3, op: 0.6 }));
      fireGlow(c, r * 0.9, 0xff6a18, 1, 0.8);
      if (tg.alive) emberAura(tg, Math.min(4, Math.max(effNum(s, 'slow', 'duration', 3), effNum(s, 'dot', 'duration', 0))), 0.8);
      return;
    }
    fx('star', p, { count: 1, color: 0xffffff, color2: 0x80f0ff, speed: 0, up: 0, life: 0.2, size: 3, sizeEnd: 0.5 });
    fx('dot', { x: c.x, y: 0.6, z: c.z }, { count: 60, color: 0xf0ffff, color2: 0x30b8e0, radius: 0.6, speed: r * 1.6, up: 3.5, life: 0.9, size: 0.2, sizeEnd: 0.06, gravity: 9, drag: 0.6 });
    fx('spark', { x: c.x, y: 0.8, z: c.z }, { count: 24, color: 0xffffff, color2: 0x7fe8ff, radius: 0.4, speed: r * 2, up: 1.5, life: 0.4, size: 0.18, sizeEnd: 0.03, drag: 2 });
    fx('smoke', { x: c.x, y: 0.4, z: c.z }, { count: 10, color: 0xd8f6ff, color2: 0xa8dcec, colorEnd: 0x50809a, radius: r * 0.4, speed: 1.4, up: 0.8, life: 1.2, size: 1.2, sizeEnd: 2.6 });
    waterCrown(c, r);
    groundWave(c, r * 1.1, 0x7fe8ff, 0.55, { w: 0.05, noise: 0.22, fill: 0.3, rings: 2 });
    mageDelay(0.12, () => groundWave(c, r * 1.2, 0x30b8e0, 0.7, { w: 0.04, noise: 0.3, from: 0.2 }));
    if (!lowQ()) mageDelay(0.26, () => groundWave(c, r * 1.25, 0xc8fcff, 0.8, { w: 0.03, noise: 0.35, from: 0.3, op: 0.6 }));
    groundGlow(c, r * 0.9, 0x20c8e8, 0.9, 0.75);
    if (tg.alive) drench(tg, Math.min(4, effNum(s, 'slow', 'duration', 3)));
  },
  };
}
const drownOrb = orbOf('frost');
/** 水冠：一圈向外上方喷起的水柱 + 一圈水幕，0.75 秒升落 */
function waterCrown(c: P2, r: number, fire = false) {
  const g = new THREE.Group(); g.position.set(c.x, gy(c.x, c.z), c.z);
  const mat = fire ? fresnelMat({ color: 0xa02a06, rim: 0xffe0a0, op: 0.9, pow: 1.3, floor: 0.5, sparkle: 1 }) : fresnelMat({ color: 0x1aa0c8, rim: 0xf0ffff, op: 0.9, pow: 1.3, floor: 0.4, sparkle: 1 });   // fire：熔岩冠
  const jet = new THREE.ConeGeometry(0.1, 1, 5, 1).translate(0, 0.5, 0);
  const n = qn(16, 6), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.15, 0.15), tilt = rnd(0.25, 0.95);
    const v = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const m = new THREE.Mesh(jet, mat); q.setFromUnitVectors(UP, v); m.quaternion.copy(q);
    m.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35); m.userData.len = rnd(1.2, 3.2) * Math.min(1.3, r / 4 + 0.3); m.userData.w = rnd(0.7, 1.6); g.add(m);
  }
  const sheet = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.55, 1, lowQ() ? 16 : 32, 1, true).translate(0, 0.5, 0), fire ? fresnelMat({ color: 0x701804, rim: 0xffc070, op: 0.7, pow: 1.2, floor: 0.3, side: THREE.DoubleSide, sparkle: 1 }) : fresnelMat({ color: 0x0e7090, rim: 0xe8ffff, op: 0.7, pow: 1.2, floor: 0.25, side: THREE.DoubleSide, sparkle: 1 }));
  sheet.name = 'sheet'; g.add(sheet);
  noOl(g);
  const DUR = 0.75;
  live(g, DUR, k => {
    const up = easeOut(k / 0.3), fall = Math.max(0, (k - 0.35) / 0.65);
    g.children.forEach(m => {
      if (m === sheet) { m.scale.set(r * (0.25 + 0.3 * easeOut(k)), 1.3 * up * (1 - fall * 0.8), r * (0.25 + 0.3 * easeOut(k))); return; }
      m.scale.set(m.userData.w as number, (m.userData.len as number) * up * (1 - fall * 0.7), m.userData.w as number);
    });
    g.traverse(o => { const mm = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (mm?.uniforms?.uT) mm.uniforms.uT.value = vfxTime(); });
    fadeAll(g, 1 - fall * fall);
  });
}
/** 湿透：身上往下滴水（减速期间） */
function drench(e: FxUnit, dur: number) {
  const h = unitHeight(e);
  live(new THREE.Group(), dur, () => {
    if (!e.alive || Math.random() > (lowQ() ? 0.15 : 0.45)) return;
    fx('dot', { x: e.pos.x + rnd(-0.35, 0.35), y: rnd(h * 0.4, h * 0.95), z: e.pos.z + rnd(-0.35, 0.35) }, { count: 1, color: 0xe0ffff, color2: 0x3ab8e0, speed: 0.05, up: 0, life: 0.6, size: 0.12, sizeEnd: 0.06, gravity: 7 });
  });
}

// ======================================================================
// 7 钟律共鸣
// ======================================================================
/** 钟律共鸣配色：arcane = 首版金钟；fire = 熔心护符变体「熔钟共鸣」（同一钟体换赤铜熔金 + 橙红声波 + 余烬） */
interface BellC { shell: number; rim: number; lip: number; rod: number; ball: number; glow: number; floor: number; wave1: number; wave2: number; wave3: number; fire: boolean }
const BELL_C: Record<'arcane' | 'fire', BellC> = {
  arcane: { shell: 0x7a3c06, rim: 0xffe8a8, lip: 0xffd070, rod: 0xffc860, ball: 0xfff0c0, glow: 0xffb040, floor: 0xffc050, wave1: 0xffd070, wave2: 0xffb040, wave3: 0xfff0c0, fire: false },
  fire: { shell: 0x5a1204, rim: 0xffb860, lip: 0xff8a30, rod: 0xff9040, ball: 0xffe0a0, glow: 0xff5a10, floor: 0xff7a28, wave1: 0xffa850, wave2: 0xff6a18, wave3: 0xffe0b0, fire: true },
};
/** 钟形旋转剖面（半径, 高），口沿在 y=0，顶在 y≈1.35 */
const BELL_PROFILE: [number, number][] = [[1.0, 0], [0.97, 0.06], [0.86, 0.16], [0.72, 0.36], [0.62, 0.62], [0.57, 0.9], [0.53, 1.12], [0.42, 1.26], [0.22, 1.33], [0, 1.35]];
function bellGeo(seg: number) { return new THREE.LatheGeometry(BELL_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), seg); }
/** 金钟：外壳 + 口沿亮环 + 钟锤 */
function makeBell(S: number, op = 1, C: BellC = BELL_C.arcane) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(bellGeo(lowQ() ? 24 : 44), fresnelMat({ color: C.shell, rim: C.rim, op: 0.9 * op, pow: 1.7, floor: 0.12, side: THREE.DoubleSide, sparkle: 0.9 }));
  shell.scale.setScalar(S); g.add(shell);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(S * 0.99, S * 0.035, 6, lowQ() ? 32 : 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.lip).multiplyScalar(1.6), transparent: true, opacity: 0.95 * op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  lip.position.y = S * 0.02; g.add(lip);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.03, S * 0.03, S * 0.9, 6), new THREE.MeshBasicMaterial({ color: C.rod, transparent: true, opacity: 0.8 * op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  rod.position.y = S * 0.75; g.add(rod);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(S * 0.13, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.ball).multiplyScalar(2), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  ball.name = 'clapper'; ball.position.y = S * 0.28; g.add(ball);
  const gl = new THREE.Sprite(mageSpriteMat(glowTex(), C.glow, 0.8 * op)); gl.position.y = S * 0.28; gl.scale.setScalar(S * 1.1); g.add(gl);
  return noOl(g);
}
/** 发光符文地面（钟律法阵） */
function goldRuneFloor(c: P2, r: number, dur: number, peak: number, C: BellC = BELL_C.arcane) {
  const mat = decalMat(runeRingTex(), C.floor, true, 0), m = groundMesh(c, r, mat, 0.09, lowQ() ? 6 : 12);
  live(m, dur, k => { const t = k * dur; mat.opacity = peak * Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.8) * (0.8 + 0.2 * Math.sin(t * 5)); });
}
/** 敌人头顶的小钟 + 光环（钟律标记） */
function bellHalo(e: FxUnit, dur: number, C: BellC = BELL_C.arcane) {
  const h = unitHeight(e), g = new THREE.Group();
  const b = makeBell(0.2, 0.9, C); g.add(b);
  const ringMat = waveMat(C.wave1, { w: 0.12, fill: 0 }); ringMat.uniforms.uR.value = 0.8;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), ringMat); ring.position.y = 0.02; g.add(ring);
  noOl(g);
  live(g, dur, (k, dt) => {
    g.position.set(e.pos.x, e.pos.y + h + 0.35 + Math.sin(k * dur * 4) * 0.05, e.pos.z);
    b.rotation.z = Math.sin(k * dur * 9) * 0.25 * (1 - k); g.rotation.y += dt * 2;
    ringMat.uniforms.uT.value = vfxTime();
    fadeAll(g, (e.alive ? 1 : 0) * Math.min(1, k * dur / 0.12) * Math.min(1, (1 - k) * dur / 0.3));
    if (e.alive && Math.random() < (lowQ() ? 0.05 : 0.18)) fx('star', V(e.pos.x + rnd(-0.4, 0.4), e.pos.y + h + rnd(0, 0.5), e.pos.z + rnd(-0.4, 0.4)), { count: 1, color: 0xffffff, color2: C.floor, speed: 0, up: 0.3, life: 0.4, size: 0.2, sizeEnd: 0.03 });
  });
}
function bellOf(C: BellC): MageArea {
  return (s, c, hits, apply) => {
  if (apply) apply();
  const r = s.stats.radius, S = Math.min(1.9, r * 0.34), DUR = 2.1, Y = S * 2.4 + 1.2;
  const dotDur = Math.min(6, effNum(s, 'dot', 'duration', 5));
  const bell = makeBell(S, 1, C); bell.position.set(c.x, gy(c.x, c.z) + Y + 1.2, c.z);
  // 绕钟的两道金丝光环
  const orbit: THREE.Mesh[] = [];
  if (!lowQ()) for (let i = 0; i < 2; i++) {
    const o = new THREE.Mesh(new THREE.TorusGeometry(S * (1.25 + i * 0.25), 0.02, 4, 64), new THREE.MeshBasicMaterial({ color: C.rod, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    o.position.y = S * 0.6; o.rotation.set(Math.PI / 2 + (i ? 0.45 : -0.35), 0, i ? 0.3 : -0.2); bell.add(o); orbit.push(o);
  }
  noOl(bell);
  let struck = false;
  const y0 = gy(c.x, c.z);
  live(bell, DUR, (k, dt) => {
    const t = k * DUR;
    bell.position.y = y0 + Y + 1.2 * (1 - easeOut(t / 0.14)) + Math.max(0, (t - DUR + 0.4) / 0.4) * 1.5;
    bell.rotation.z = Math.sin(t * 8) * 0.14 * Math.exp(-t * 1.2); bell.rotation.y += dt * 0.25;
    orbit.forEach((o, i) => { o.rotation.z += dt * (i ? -1.4 : 1.1); });
    bell.traverse(o => { const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (m?.uniforms?.uT) m.uniforms.uT.value = vfxTime(); });
    fadeAll(bell, Math.min(1, t / 0.12) * Math.min(1, (DUR - t) / 0.4));
    if (!struck && t >= 0.14) {
      struck = true;
      const cl = bell.getObjectByName('clapper'), p = cl ? cl.getWorldPosition(V()) : V(c.x, y0 + Y, c.z);
      fx('star', p, { count: 1, color: 0xffffff, color2: C.lip, speed: 0, up: 0, life: 0.25, size: 4, sizeEnd: 0.6 });
      fx('star', p, { count: 10, color: C.fire ? C.ball : 0xfff4d0, color2: C.fire ? C.glow : 0xffb030, radius: S * 0.8, ring: true, speed: 4, up: 0, life: 0.5, size: 0.45, sizeEnd: 0.05, drag: 2 });
      groundWave(c, r * 1.15, C.wave1, 0.55, { w: 0.035, noise: 0.06, fill: 0.15, rings: 3 });
      mageDelay(0.18, () => groundWave(c, r * 1.2, C.wave2, 0.65, { w: 0.03, noise: 0.08, from: 0.15, rings: 2 }));
      if (!lowQ()) mageDelay(0.36, () => groundWave(c, r * 1.25, C.wave3, 0.7, { w: 0.025, noise: 0.1, from: 0.25, op: 0.6 }));
      if (C.fire) fireGlow(c, r * 0.9, C.glow, 1.4, 0.75); else groundGlow(c, r * 0.9, 0xffa030, 1, 0.6);
    }
    // 口沿往下淌的金丝
    if (t > 0.14 && t < DUR - 0.4 && Math.random() < (lowQ() ? 0.3 : 0.9)) {
      const a = Math.random() * 6.28;
      fx('spark', V(c.x + Math.cos(a) * S * 0.95, bell.position.y, c.z + Math.sin(a) * S * 0.95), { count: 1, color: C.ball, color2: C.fire ? C.glow : 0xffa020, speed: 0.1, up: -0.5, life: 0.7, size: 0.14, sizeEnd: 0.04, gravity: 5 });
    }
  });
  goldRuneFloor(c, r * 0.95, dotDur, 0.55, C);
  // 5 秒奥术震荡：每秒一圈淡金声波
  const pulses = lowQ() ? 2 : Math.max(1, Math.floor(dotDur) - 1);
  for (let i = 1; i <= pulses; i++) mageDelay(i * (dotDur / (pulses + 1)), () => groundWave(c, r, C.floor, 0.6, { w: 0.03, noise: 0.05, from: 0.2, op: 0.45 }));
  const n = qn(10, 3);
  hits.filter(e => e.alive).slice(0, n).forEach(e => { bellHalo(e, 1.6, C); if (C.fire) emberAura(e, dotDur, 0.5); });
  };
}
const bellResonance = bellOf(BELL_C.arcane);

// ======================================================================
// 8 渊海潮汐
/** 渊海潮汐配色：shadow = 首版紫黑潮池；fire = 熔心护符变体「熔渊潮汐」（同一涡池 / 潮触形体换熔岩涡流 + 黑曜潮触橙边 + 余烬泡） */
type V3 = [number, number, number];
interface TideC { el: 'shadow' | 'fire'; d0: V3; d1: V3; fil: V3; foam: V3; crest: number; crestR: number; bub: number; bubR: number; spk1: number; spk2: number;
  dot0: number; dot1: number; dot2: number; dot3: number; star1: number; star2: number; wave: number; glow: number; smk: V3; smk2: V3 }
const TIDE_C: Record<'shadow' | 'fire', TideC> = {
  shadow: { el: 'shadow', d0: [0.015, 0.006, 0.04], d1: [0.06, 0.02, 0.12], fil: [0.62, 0.32, 1.0], foam: [0.55, 0.3, 0.95], crest: 0x0c0420, crestR: 0xa868ff, bub: 0x100628, bubR: 0xc090ff,
    spk1: 0xe8d8ff, spk2: 0x8a50ff, dot0: 0xd8c0ff, dot1: 0xd8b8ff, dot2: 0x5a20b0, dot3: 0x4a18a0, star1: 0xe0c8ff, star2: 0x8040ff, wave: 0x9a58ff, glow: 0x6a30d0,
    smk: [0x2a1040, 0x1a0828, 0x0a0410], smk2: [0x301050, 0x1a0830, 0x08040c] },
  fire: { el: 'fire', d0: [0.05, 0.012, 0.004], d1: [0.16, 0.035, 0.01], fil: [1.0, 0.42, 0.08], foam: [1.0, 0.64, 0.26], crest: 0x1a0604, crestR: 0xff8a30, bub: 0x2a0804, bubR: 0xffa040,
    spk1: 0xffe8b0, spk2: 0xff6010, dot0: 0xffd8a0, dot1: 0xffc080, dot2: 0xc03008, dot3: 0x802008, star1: 0xffe0b0, star2: 0xff6a18, wave: 0xff7a28, glow: 0xff5a10,
    smk: [0x3a2a24, 0x241a16, 0x0c0806], smk2: [0x4a3530, 0x2a1e1a, 0x0c0806] },
};
// ======================================================================
function poolMat(C: TideC = TIDE_C.shadow) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
    uniforms: { uT: { value: 0 }, uOp: { value: 0 }, uGrow: { value: 0 }, uC: { value: new THREE.Vector2(0, 0) }, uRad: { value: 1 }, uSeed: { value: Math.random() * 10 },
      uD0: { value: new THREE.Color(...C.d0) }, uD1: { value: new THREE.Color(...C.d1) }, uFil: { value: new THREE.Color(...C.fil) }, uFoam: { value: new THREE.Color(...C.foam) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `${GLSL_NOISE}
uniform float uT; uniform float uOp; uniform float uGrow; uniform vec2 uC; uniform float uRad; uniform float uSeed;
uniform vec3 uD0; uniform vec3 uD1; uniform vec3 uFil; uniform vec3 uFoam;
varying vec3 vW;
void main(){
  vec2 p = (vW.xz - uC) / uRad; float r = length(p); float a = atan(p.y, p.x);
  float rg = r / max(uGrow, 0.01);
  float edgeN = (fbm(vec2(a * 3.0 + uSeed, uT * 0.4)) - 0.5) * 0.22;
  float mask = smoothstep(1.0, 0.86, rg + edgeN);
  // 涡旋：极坐标里沿螺线流动
  float sw = a + r * 5.0 - uT * 1.3;
  float n1 = fbm(vec2(sw * 1.6, r * 5.0 - uT * 0.6) + uSeed);
  float n2 = vn(vec2(sw * 6.0, r * 14.0 - uT * 2.0));
  float fil = pow(smoothstep(0.55, 0.95, n1 + 0.35 * n2), 2.0);
  float foam = smoothstep(0.78, 0.95, rg + edgeN) * mask;
  vec3 deep = mix(uD0, uD1, n1);
  vec3 c = deep + uFil * fil * 1.6 + uFoam * foam * (0.6 + 0.6 * n2);
  float al = mask * (0.82 + 0.18 * fil) * uOp;
  gl_FragColor = vec4(c, al);
}`,
  });
}
/** 卷曲潮触：中心线（局部 u = 指向池心的水平方向，v = 向上），粗细从根到梢收细 */
const CREST: [number, number][] = [[0, 0], [0.04, 0.45], [0.14, 1.0], [0.36, 1.5], [0.68, 1.72], [0.96, 1.55], [1.06, 1.2], [0.94, 0.92], [0.76, 0.86]];
function crestGeo(H: number, rad: number) {
  const pts = CREST.map(([u, v], i) => V(u * H * 0.75, v * H, Math.sin(i * 0.9) * 0.06 * H));
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = lowQ() ? 20 : 40, rs = lowQ() ? 5 : 8;
  const g = new THREE.TubeGeometry(curve, seg, rad, rs, false);
  const P = g.attributes.position as THREE.BufferAttribute, ctr = V(), q = V();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, k = 1 - 0.88 * Math.pow(t, 0.8); curve.getPointAt(t, ctr);
    for (let j = 0; j <= rs; j++) { const idx = i * (rs + 1) + j; q.fromBufferAttribute(P, idx).sub(ctr).multiplyScalar(k).add(ctr); P.setXYZ(idx, q.x, q.y, q.z); }
  }
  P.needsUpdate = true; g.computeVertexNormals();
  return g;
}
function tideCrests(c: P2, R: number, n: number, life: number, C: TideC = TIDE_C.shadow) {
  const mat = fresnelMat({ color: C.crest, rim: C.crestR, op: 0.96, pow: 1.5, floor: 0.88, additive: false, sparkle: 0.6 });
  const all = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), d = R * rnd(0.5, 0.82), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const H = rnd(1.6, 2.6) * Math.min(1.25, R / 6 + 0.3);
    const m = new THREE.Mesh(crestGeo(H, H * 0.16), mat);
    m.position.set(x, gy(x, z) - 0.2, z);
    m.rotation.y = Math.PI - a + rnd(-0.5, 0.5);   // 局部 +x 指向池心：rotation.y=θ 把 +x 转到 (cosθ,0,-sinθ)，取 θ=π-a 得 (-cos a,0,-sin a)
    m.userData.dl = rnd(0, 0.35); m.userData.ph = Math.random() * 6; all.add(m);
  }
  noOl(all);
  live(all, life, k => {
    const t = k * life;
    all.children.forEach(m => {
      const tt = t - (m.userData.dl as number), up = easeOut(tt / 0.4) * (1 + 0.08 * Math.sin(Math.max(0, tt) * 3)), sink = Math.max(0, (t - life + 0.6) / 0.6);
      m.scale.set(1, Math.max(0.001, up * (1 - sink)), 1);
      m.rotation.z = Math.sin(t * 1.7 + (m.userData.ph as number)) * 0.06;
      if (tt > 0 && tt < 0.08 && Math.random() < 0.6) fx('dot', m.position.clone().setY(m.position.y + 0.4), { count: 8, color: C.dot1, color2: C.dot2, radius: 0.4, speed: 2.5, up: 2.5, life: 0.6, size: 0.16, sizeEnd: 0.05, gravity: 8 });
    });
    mat.uniforms.uT.value = vfxTime();
  });
}
/** 从池里冒出、上浮、破裂的暗泡 */
function abyssBubbles(c: P2, R: number, n: number, span: number, C: TideC = TIDE_C.shadow) {
  for (let i = 0; i < n; i++) mageDelay(rnd(0.1, span), () => {
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * R * 0.85, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, sz = rnd(0.15, 0.32);
    const m = noOl(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fresnelMat({ color: C.bub, rim: C.bubR, op: 0.92, pow: 2, floor: 0.75, additive: false, sparkle: 0 })));
    const y0 = gy(x, z), life = rnd(0.9, 1.6), rise = rnd(1.2, 3);
    live(m, life, k => {
      m.position.set(x, y0 + 0.1 + rise * easeOut(k), z); m.scale.setScalar(sz * Math.min(1, k * 5) * (1 + 0.1 * Math.sin(k * 30)));
      if (k >= 1) fx('spark', m.position.clone(), { count: 6, color: C.spk1, color2: C.spk2, speed: 1.6, up: 0.3, life: 0.3, size: 0.12, sizeEnd: 0.02, drag: 2 });
    });
  });
}
function tideOf(C: TideC): MageArea {
  return (s, c, hits, apply) => {
  const zones = apply ? apply(C.el) : [];
  const R = s.stats.radius;
  const z0 = zones[0], cc: P2 = z0 ? { x: z0.x, z: z0.z } : { x: c.x, z: c.z }, PR = z0 ? z0.r : R * 0.9, DUR = z0 ? z0.dur : 2.2;
  // 潮池（贴地，用世界坐标算涡旋）
  const mat = poolMat(C); mat.uniforms.uC.value.set(cc.x, cc.z); mat.uniforms.uRad.value = PR * 1.05;
  const pool = groundMesh(cc, PR * 1.05, mat, 0.07, lowQ() ? 8 : 18);
  live(pool, DUR, (k, dt) => {
    const t = k * DUR;
    mat.uniforms.uT.value = vfxTime(); mat.uniforms.uGrow.value = 0.15 + 0.85 * easeOut(t / 0.45);
    mat.uniforms.uOp.value = Math.min(1, t / 0.2) * Math.min(1, (DUR - t) / 0.8);
    if (Math.random() < dt * (lowQ() ? 2 : 7)) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * PR * 0.9; fx('smoke', { x: cc.x + Math.cos(a) * d, y: 0.2, z: cc.z + Math.sin(a) * d }, { count: 1, color: C.smk[0], color2: C.smk[1], colorEnd: C.smk[2], speed: 0.2, up: 0.25, life: 1.6, size: 1.2, sizeEnd: 2.4, swirl: 1.2 }); }
    if (Math.random() < dt * (lowQ() ? 1.5 : 5)) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * PR * 0.9; fx('star', { x: cc.x + Math.cos(a) * d, y: 0.12, z: cc.z + Math.sin(a) * d }, { count: 1, color: C.star1, color2: C.star2, speed: 0, up: 0.1, life: 0.4, size: 0.3, sizeEnd: 0.03 }); }
    if (!lowQ() && Math.random() < dt * 1.6) {   // 池面紫电丝
      const a = Math.random() * 6.28, d = PR * rnd(0.2, 0.8), x = cc.x + Math.cos(a) * d, z = cc.z + Math.sin(a) * d, b = a + rnd(0.5, 1.2), x2 = cc.x + Math.cos(b) * d, z2 = cc.z + Math.sin(b) * d;
      arcBolt({ x, y: gy(x, z) + 0.12, z }, { x: x2, y: gy(x2, z2) + 0.12, z: z2 }, { els: [C.el], life: 0.18, width: 0.03, branches: 1, jag: 0.3 });
    }
  });
  // 起手：外缘紫环 + 中心下陷的浪花
  groundWave(cc, PR * 1.15, C.wave, 0.6, { w: 0.05, noise: 0.25, fill: 0.15, rings: 2 });
  if (C.el === 'fire') fireGlow(cc, PR * 0.8, C.glow, 1.4, 0.7); else groundGlow(cc, PR * 0.8, C.glow, 0.9, 0.55);
  fx('dot', { x: cc.x, y: 0.4, z: cc.z }, { count: 40, color: C.dot0, color2: C.dot3, radius: PR * 0.6, ring: true, speed: 2.2, up: 2.6, life: 0.8, size: 0.18, sizeEnd: 0.05, gravity: 8, swirl: 2 });
  fx('smoke', { x: cc.x, y: 0.3, z: cc.z }, { count: 12, color: C.smk2[0], color2: C.smk2[1], colorEnd: C.smk2[2], radius: PR * 0.5, speed: 1, up: 0.5, life: 1.4, size: 1.4, sizeEnd: 2.8, swirl: 1.5 });
  // 潮触：首波 + 中段再起一波
  tideCrests(cc, PR, qn(6, 3), Math.min(DUR, 2.8), C);
  if (!lowQ() && DUR > 4) mageDelay(DUR * 0.45, () => tideCrests(cc, PR, qn(3, 2), Math.min(2.4, DUR * 0.5), C));
  abyssBubbles(cc, PR, qn(9, 3), Math.max(0.5, DUR - 1), C);
  // 被卷入的敌人：脚下水花
  for (const e of hits) if (e.alive) fx('dot', { x: e.pos.x, y: 0.3, z: e.pos.z }, { count: 12, color: C.dot0, color2: C.dot2, radius: 0.5, ring: true, speed: 2, up: 2.2, life: 0.6, size: 0.15, sizeEnd: 0.04, gravity: 8 });
  };
}
const abyssTide = tideOf(TIDE_C.shadow);

// ---------------------------------------------------------------- 预编译样本
function warm(): THREE.Material[] {
  return [poolMat(), fresnelMat({ color: 0x0c0420, rim: 0xa868ff, additive: false }), fresnelMat({ color: 0x7a3c06, rim: 0xffe8a8, side: THREE.DoubleSide }), decalMat(starTex(), 0xffffff)];
}

registerMageFx('d1_drown_orb@frost', { proj: drownOrb, warm });
registerMageFx('d1_bell_resonance@arcane', { area: bellResonance });
registerMageFx('d1_abyss_tide@shadow', { area: abyssTide });
// 11-17 符文变体：熔心护符（暗金「所有技能变为火焰」）把 DLC 三个绝技改成 fire —— 沿用本体形体换熔岩 / 余烬配色（?off=magerune 回旧画法）
registerMageFx('d1_drown_orb@fire', { proj: orbOf('fire'), rune: true });
registerMageFx('d1_bell_resonance@fire', { area: bellOf(BELL_C.fire), rune: true });
registerMageFx('d1_abyss_tide@fire', { area: tideOf(TIDE_C.fire), rune: true });
