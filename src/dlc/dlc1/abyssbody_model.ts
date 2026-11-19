// ======================================================================
// DLC1 渊噬之躯 · 变异部件（v1.1.2，d1.9）—— 程序化模型，PackManifest.dress（换装 / 变异变化时由本体重建）挂到角色骨骼上
//   头「渊冠」：额角弯曲黑角（1 级 2 根小角 → 3 级 4 根大角 + 紫色角尖）
//   眼「第三只眼」：额心竖瞳（等级越高越大、越亮，3 级多一圈眼眶晶刺）
//   臂「结晶臂」：右手 / 右肩紫色晶簇（1 级手背几簇 → 3 级肩头大晶簇）
//   心「熔岩之心」：胸口熔岩心核 + 裂纹（心跳脉动，3 级裂纹更多）
//   脊「光脊」：背后一排发光骨刺（3 / 5 / 7 根）
//   影「影触须」：脚下影子伸出触须（2 / 3 / 4 条，随时间摆动）
//   渊形态：脚下渊焰光环 + 身周半透明渊焰罩 + 全部发光件变亮、晶簇放大
// 手机 30 帧：所有几何体模块级共享（只建一次），材质共享，没有灯光；摆动只改 rotation，不新建对象
// ======================================================================
import * as THREE from 'three';
import type { PackDressApi } from '../../core/ContentPacks';
import { toon, glow } from '../../web/gfx';
import { lookOf, inForm, R, type PartId } from './abyssbody';

const noOl = <T extends THREE.Object3D>(o: T) => { o.userData.outlineParameters = { visible: false }; return o; };
// ---------------------------------------------------------------- 共享几何 / 材质（懒加载，只建一次）
let G: ReturnType<typeof buildGeo> | null = null;
function buildGeo() {
  const horn = (() => {   // 弯角：沿曲线的锥管
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.12, -0.02), new THREE.Vector3(0.14, 0.22, -0.08), new THREE.Vector3(0.24, 0.26, -0.18)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 8, 0.045, 5, false);
    const pos = g.attributes.position as THREE.BufferAttribute;   // 尖端收细
    const n = 9, rs = 6;
    for (let i = 0; i < n; i++) { const k = 1 - i / (n - 1) * 0.92; const c = curve.getPoint(i / (n - 1)); for (let j = 0; j < rs; j++) { const idx = i * rs + j; const v = new THREE.Vector3().fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c); pos.setXYZ(idx, v.x, v.y, v.z); } }
    g.computeVertexNormals(); return g;
  })();
  const tent = (() => {   // 触须：向上弯起、末端收细
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, -0.25), new THREE.Vector3(0, 0.25, -0.5), new THREE.Vector3(0, 0.55, -0.6), new THREE.Vector3(0, 0.75, -0.5)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 10, 0.07, 5, false);
    const pos = g.attributes.position as THREE.BufferAttribute; const n = 11, rs = 6;
    for (let i = 0; i < n; i++) { const k = 1 - i / (n - 1) * 0.9; const c = curve.getPoint(i / (n - 1)); for (let j = 0; j < rs; j++) { const idx = i * rs + j; const v = new THREE.Vector3().fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c); pos.setXYZ(idx, v.x, v.y, v.z); } }
    g.computeVertexNormals(); return g;
  })();
  return {
    horn, tent,
    crystal: new THREE.OctahedronGeometry(0.1, 0).scale(0.55, 1.6, 0.55),
    eye: new THREE.SphereGeometry(0.075, 10, 8).scale(0.6, 1, 0.45),
    pupil: new THREE.SphereGeometry(0.03, 6, 6).scale(0.35, 1.1, 0.4),
    lid: new THREE.TorusGeometry(0.08, 0.018, 4, 12).scale(0.65, 1.05, 1),
    heart: new THREE.IcosahedronGeometry(0.12, 0),
    crack: new THREE.BoxGeometry(0.018, 0.16, 0.012),
    spike: new THREE.ConeGeometry(0.045, 0.24, 4),
    pool: new THREE.CircleGeometry(0.75, 18),
    ring: new THREE.RingGeometry(0.85, 1.05, 28),
    aura: new THREE.CylinderGeometry(0.75, 0.85, 2.5, 14, 1, true),
  };
}
let M: ReturnType<typeof buildMat> | null = null;
function buildMat() {
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;
  return {
    horn: toon(0x1a1020, { emissive: new THREE.Color(0x12051e) }),
    hornTip: glow(0xb48cff, 1.6),
    crystal: toon(0x8a5ae0, { transparent: true, opacity: 0.88, emissive: new THREE.Color(0x3a1470) }),
    eye: glow(0xff4a7a, 1.8), pupil: new THREE.MeshBasicMaterial({ color: 0x140008 }), lid: toon(0x2a1424),
    heart: glow(0xff7a30, 2), crack: glow(0xff9a40, 1.6),
    spine: glow(0x7fe8ff, 1.6),
    tent: toon(0x120818, { emissive: new THREE.Color(0x1a0830) }),
    pool: new THREE.MeshBasicMaterial({ color: 0x0a0010, transparent: true, opacity: 0.55, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color: 0x9a5aff, side: THREE.DoubleSide, opacity: 0.8, ...add }),
    aura: new THREE.MeshBasicMaterial({ color: 0x6a2ad0, side: THREE.DoubleSide, opacity: 0.22, ...add }),
  };
}
const geo = () => (G ??= buildGeo());
const mat = () => { if (!M) { M = buildMat(); M.horn.userData.baseEmissive = 0x12051e; M.tent.userData.baseEmissive = 0x1a0830; M.crystal.userData.baseEmissive = 0x3a1470; M.lid.userData.baseEmissive = 0; } return M; };
const BASE = { eye: new THREE.Color(0xff4a7a).multiplyScalar(1.8), heart: new THREE.Color(0xff7a30).multiplyScalar(2), crack: new THREE.Color(0xff9a40).multiplyScalar(1.6), spine: new THREE.Color(0x7fe8ff).multiplyScalar(1.6), tip: new THREE.Color(0xb48cff).multiplyScalar(1.6) };
const named = <T extends THREE.Object3D>(n: string, o: T) => { o.name = n; return o; };
const mk = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

// ---------------------------------------------------------------- 各部位
function headPart(l: number) {
  const g = new THREE.Group(); g.name = 'ab_head';
  const n = l >= 3 ? 2 : 1, s = [0, 1.5, 1.9, 2.3][l];   // KayKit 头很大（约 1.1 单位），角按头的尺寸放大
  for (const sd of [-1, 1]) for (let i = 0; i < n; i++) {
    const h = mk(geo().horn, mat().horn, sd * (0.36 - i * 0.12), 0.9 - i * 0.12, 0.08 - i * 0.12);
    h.scale.set(sd * s * (1 - i * 0.25), s * (1 - i * 0.25), s); h.rotation.y = sd * 0.35; g.add(h);
    if (l >= 2 && i === 0) { const tip = noOl(mk(geo().crystal, mat().hornTip, sd * (0.36 + 0.24 * s), 0.9 + 0.26 * s, 0.08 - 0.18 * s)); tip.scale.setScalar(0.7); g.add(tip); }
  }
  return g;
}
function eyePart(l: number) {
  const g = new THREE.Group(); g.name = 'ab_eye';
  const s = [0, 1.7, 2.0, 2.3][l];
  const e = noOl(mk(geo().eye, mat().eye)); g.add(e);
  const p = noOl(mk(geo().pupil, mat().pupil, 0, 0, 0.03)); p.name = 'ab_pupil'; g.add(p);
  g.add(mk(geo().lid, mat().lid, 0, 0, 0.005));
  if (l >= 3) for (let i = 0; i < 4; i++) { const c = noOl(mk(geo().crystal, mat().hornTip)); const a = i / 4 * Math.PI * 2 + Math.PI / 4; c.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.13, -0.01); c.rotation.z = a - Math.PI / 2; c.scale.setScalar(0.35); g.add(c); }
  g.scale.setScalar(s); return g;
}
function crystals(n: number, spread: number, k: number, seed: number) {
  const g = new THREE.Group(); let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const c = mk(geo().crystal, mat().crystal, (rnd() - 0.5) * spread, (rnd() - 0.3) * spread, (rnd() - 0.5) * spread);
    c.rotation.set((rnd() - 0.5) * 1.6, rnd() * 3, (rnd() - 0.5) * 1.6); c.scale.setScalar(k * (0.7 + rnd() * 0.7)); g.add(c);
  }
  return g;
}
function heartPart(l: number) {
  const g = new THREE.Group(); g.name = 'ab_heart';
  const h = noOl(mk(geo().heart, mat().heart)); h.name = 'ab_core'; h.scale.setScalar([0, 0.8, 1, 1.2][l]); g.add(h);
  const n = [0, 3, 4, 6][l];
  for (let i = 0; i < n; i++) { const c = noOl(mk(geo().crack, mat().crack)); const a = i / n * Math.PI * 2; c.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, -0.02); c.rotation.z = a + Math.PI / 2 + (i % 2 ? 0.4 : -0.3); g.add(c); }
  return g;
}
function spinePart(l: number) {
  const g = new THREE.Group(); g.name = 'ab_spine';
  const n = [0, 3, 5, 7][l];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const s = noOl(mk(geo().spike, mat().spine, 0, 0.28 - t * 0.78, -0.03 * Math.sin(t * Math.PI)));
    s.rotation.x = -1.2; s.scale.setScalar(1.3 + Math.sin(t * Math.PI) * (0.6 + l * 0.2)); g.add(s);
  }
  return g;
}
function shadowPart(l: number, hd = false) {
  const g = new THREE.Group(); g.name = 'ab_shadow';
  g.add(mk(geo().pool, mat().pool).rotateX(-Math.PI / 2));
  const n = [0, 2, 3, 4][l];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Group(); p.name = 'ab_tent'; p.rotation.y = Math.PI + (i - (n - 1) / 2) * 0.75; p.userData.ph = i * 1.7;
    const t = mk(geo().tent, mat().tent, 0, 0, -0.3); t.scale.setScalar((1.1 + l * 0.2) * (hd ? 0.62 : 1)); if (hd) t.position.z *= 0.62; p.add(t); g.add(p);   // v1.2.20 写实身材：触须缩到约 0.62
  }
  return g;
}
function auraPart() {
  const g = new THREE.Group(); g.name = 'ab_aura'; g.visible = false;
  const ring = noOl(mk(geo().ring, mat().ring)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const a = noOl(mk(geo().aura, mat().aura, 0, 1.25, 0)); g.add(a);
  return g;
}

// ---------------------------------------------------------------- dress（本体换装 / ctx.redress 时调用）
let parts: { [k: string]: THREE.Object3D | undefined } = {};
let lastDress = { n: 0, cls: '' };
export function abyssDress(d: PackDressApi) {
  parts = {};
  const L = lookOf(); if (!L.open) { lastDress = { n: 0, cls: d.cls }; return; }
  const lv = L.lv as Record<PartId, number>;
  let n = 0;
  const put = (k: string, bone: string, o: THREE.Object3D, off: [number, number, number], rot?: [number, number, number]) => { if (d.attach(bone, o, off, rot)) { parts[k] = o; n++; } };
  if (lv.head) put('head', 'head', headPart(lv.head), [0, 0, 0]);
  if (lv.eye) put('eye', 'head', eyePart(lv.eye), [0, 0.74, 0.53]);   // 额心（KayKit 头：y 1.22–2.31，前脸 z ≈ 0.53）
  if (lv.arm) {
    put('arm', 'handslotr', named('ab_arm', crystals(3 + lv.arm * 2, 0.3, 1.3 + lv.arm * 0.25, 7)), [0, 0.05, 0]);
    if (lv.arm >= 2) put('arm2', 'chest', named('ab_arm2', crystals(lv.arm * 3, 0.3, 1.4 + lv.arm * 0.3, 13)), [-0.44, 0.24, 0]);
  }
  if (lv.heart) put('heart', 'chest', heartPart(lv.heart), [0.12, 0.02, 0.39]);
  if (lv.spine) put('spine', 'chest', spinePart(lv.spine), [0, 0.05, -0.38]);
  if (lv.shadow) put('shadow', 'hips', shadowPart(lv.shadow, d.hd), [0, -0.39, 0]);   // 胯骨 y 0.41 → 地面
  put('aura', 'hips', auraPart(), [0, -0.4, 0]);
  lastDress = { n, cls: d.cls };
}
export const abyssDressInfo = () => ({ ...lastDress, parts: Object.keys(parts).filter(k => parts[k]?.parent) });

// ---------------------------------------------------------------- 每帧动画（只改已有对象的变换 / 材质颜色）
let t = 0, formK = 0;
export function abyssModelUpdate(dt: number) {
  if (!M || !parts.aura) return;
  t += dt;
  const on = inForm();
  formK += ((on ? 1 : 0) - formK) * Math.min(1, dt * 4);
  const beat = 0.5 + 0.5 * Math.sin(t * (on ? 9 : 5));
  const k = 1 + formK * 0.9;
  M.eye.color.copy(BASE.eye).multiplyScalar((0.75 + 0.35 * beat) * k);
  M.heart.color.copy(BASE.heart).multiplyScalar((0.6 + 0.6 * beat) * k);
  M.crack.color.copy(BASE.crack).multiplyScalar((0.5 + 0.7 * beat) * k);
  M.spine.color.copy(BASE.spine).multiplyScalar((0.85 + 0.25 * Math.sin(t * 3)) * k);
  M.hornTip.color.copy(BASE.tip).multiplyScalar(k);
  (M.crystal.emissive as THREE.Color).setRGB(0.23 + formK * 0.35, 0.08 + formK * 0.1, 0.44 + formK * 0.4);
  const core = parts.heart?.getObjectByName('ab_core'); if (core) core.scale.setScalar((core.userData.s0 ??= core.scale.x) * (1 + 0.12 * beat));
  const arm = parts.arm2; if (arm) arm.scale.setScalar(1 + formK * 0.25);
  if (parts.shadow) parts.shadow.traverse(o => { if (o.name === 'ab_tent') { const ph = o.userData.ph ?? 0; o.rotation.x = Math.sin(t * (on ? 4 : 1.6) + ph) * (on ? 0.35 : 0.18); o.rotation.z = Math.sin(t * 1.1 + ph) * 0.2; o.scale.setScalar(1 + formK * 0.35); } });
  const a = parts.aura; a.visible = formK > 0.02;
  if (a.visible) { a.scale.setScalar(0.9 + 0.1 * beat); M.aura.opacity = 0.22 * formK; M.ring.opacity = 0.8 * formK; a.rotation.y += dt * 1.5; }
  void R;
}

/** 测试：不依赖角色模型，用假的 attach 跑一遍 dress，返回挂了哪些（骨骼:部件名）+ 网格数 + 用到的几何体 uuid */
export function abyssDressProbe() {
  const got: string[] = []; let meshes = 0; const geos = new Set<string>();
  const keep = parts, keepD = lastDress;
  abyssDress({ H: 2, eq: {}, cls: 'probe', attach: (b, o) => { const x = o as THREE.Object3D; got.push(`${b}:${x.name || 'group'}`); x.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { meshes++; geos.add(mm.geometry.uuid); } }); return true; } });
  parts = keep; lastDress = keepD;
  return { got, meshes, geos: [...geos].sort() };
}
