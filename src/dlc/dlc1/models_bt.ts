// ======================================================================
// DLC1 无声钟楼 · 新怪物 / 首领模型（v1.1.0，程序化建模，写法同 ./models.ts）
// 概念图：项目根 c_d17_belltower.png（区域）、c_d17_sleeper_ab.png（沉眠者 A / B）、c_d17_crossroads_ui.png（抉择界面）
// 静默修士 / 断绳回响 / 钟铜傀儡（小怪）、无舌之钟·铸钟巨像（首领 1）、沉眠者 A（被钟声束缚）/ B（完全觉醒）
// 另：抉择界面 3D 预览用的守钟人 / 渊噬者小人（previewFigure）
// ======================================================================
import * as THREE from 'three';
import { toon, glow } from '../../web/gfx';
import { lx } from './lux_dlc';

type Rig = { root: THREE.Group; body: THREE.Object3D; weapon?: THREE.Object3D; legs: THREE.Object3D[]; scale: number; flash: THREE.MeshToonMaterial[]; tick?: (dt: number, moving: boolean) => void };
const mats = (g: THREE.Object3D) => { const o: THREE.MeshToonMaterial[] = []; g.traverse(x => { const m = (x as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial) o.push(m); }); return o; };
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const ghost = (c: number, op = 0.78) => toon(c, { transparent: true, opacity: op, emissive: new THREE.Color(c).multiplyScalar(0.35) });
const noOl = <T extends THREE.Object3D>(o: T) => { o.userData.outlineParameters = { visible: false }; return o; };
let seed = 17; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 钟形轮廓（LatheGeometry），h 高，r 口径 */
export function bellGeo(r: number, h: number, seg = 18): THREE.LatheGeometry {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(r * (0.5 + 0.5 * Math.pow(t, 2.2)) + (t > 0.92 ? r * 0.08 : 0), h - t * h)); }
  return new THREE.LatheGeometry(prof, seg);
}
const chainLink = (m: THREE.Material, r = 0.07) => new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.28, 4, 8), m);

/** 静默修士：灰袍兜帽、嘴上缝着铜片、怀里抱一口哑钟（近战） */
export function makeSilentMonk(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const robe = toon(0x3a3e44), dark = toon(0x1a1c20), bronze = toon(0x8a6a34, { emissive: new THREE.Color(0x1a1206) });
  const r1 = mesh(new THREE.ConeGeometry(0.55, 1.5, 8, 1, true), robe, 0, 0.85, 0); (r1.material as THREE.Material).side = THREE.DoubleSide; body.add(r1);
  body.add(mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.6, 8), robe, 0, 1.6, 0));
  const head = new THREE.Group(); head.position.set(0, 2.05, 0.02); body.add(head);
  head.add(mesh(new THREE.ConeGeometry(0.3, 0.6, 8), robe, 0, 0.12, -0.02));   // 兜帽
  head.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), dark, 0, -0.02, 0.06));
  head.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), bronze, 0, -0.1, 0.24));   // 封口铜片
  [-0.07, 0.07].forEach(x => head.add(noOl(mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(0x9ae8f0, 3), x, 0.02, 0.24))));
  const bell = mesh(bellGeo(0.26, 0.42), bronze, 0, 1.18, 0.38); (bell.material as THREE.Material).side = THREE.DoubleSide; body.add(bell);
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.33, 1.78, 0); arm.rotation.set(-0.9, 0, sd * 0.25); body.add(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.7, 6), robe, 0, -0.35, 0));
    if (sd > 0) { const w = new THREE.Group(); w.position.set(0, -0.72, 0); arm.add(w); weapon = w; w.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5), dark, 0, -0.2, 0)); w.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), bronze, 0, -0.52, 0)); }
  });
  const legs = [-0.14, 0.14].map(x => { const l = new THREE.Group(); l.position.set(x, 0.5, 0); l.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), dark, 0, -0.45, 0.06)); root.add(l); return l; });
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 断绳回响：半透明的敲钟人幽灵，腰间缠着断掉的钟绳，远程甩出冷青绳光 */
export function makeRopeWraith(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = ghost(0x7ad8e8, 0.62), cloth = ghost(0x2a5a70, 0.75), rope = toon(0x8a7040);
  const robe = mesh(new THREE.ConeGeometry(0.5, 1.6, 10, 1, true), cloth, 0, 1.15, 0); (robe.material as THREE.Material).side = THREE.DoubleSide; body.add(robe);
  body.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), skin, 0, 2.1, 0.02));
  [-0.08, 0.08].forEach(x => body.add(noOl(mesh(new THREE.SphereGeometry(0.04, 6, 4), glow(0xc0ffff, 3.5), x, 2.12, 0.2))));
  const coil = mesh(new THREE.TorusGeometry(0.34, 0.05, 5, 16), rope, 0, 1.4, 0); coil.rotation.x = Math.PI / 2; body.add(coil);
  const tail = new THREE.Group(); tail.position.set(0.3, 1.4, 0); body.add(tail);
  for (let k = 0; k < 6; k++) { const s = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 5), rope, 0, -k * 0.2, 0); s.rotation.z = Math.sin(k) * 0.4; tail.add(s); }
  tail.add(noOl(mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(0x60f0ff, 2.5), 0, -1.25, 0)));   // 断口的冷光
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => { const arm = new THREE.Group(); arm.position.set(sd * 0.3, 1.8, 0); arm.rotation.z = sd * 0.5; body.add(arm); arm.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), skin, 0, -0.35, 0)); if (sd > 0) weapon = arm; });
  let ph = rnd() * 6;
  const tick = (dt: number, moving: boolean) => { ph += dt * (moving ? 3 : 1.4); body.position.y = 0.25 + Math.sin(ph) * 0.1; tail.rotation.z = Math.sin(ph * 1.3) * 0.25; };
  return { root, body, legs: [], weapon, scale: 1, flash: mats(root), tick };
}

/** 钟铜傀儡：铜钟当躯干、铁链当手臂的小傀儡（首领 1 召唤物 / 小怪） */
export function makeBronzePuppet(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bronze = toon(0x7a5a2a, { emissive: new THREE.Color(0x140c04) }), iron = toon(0x3a3a3c);
  const b = mesh(bellGeo(0.42, 0.8), bronze, 0, 0.75, 0); (b.material as THREE.Material).side = THREE.DoubleSide; body.add(b);
  body.add(mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 10), bronze, 0, 1.62, 0));
  body.add(noOl(mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(0x50e8f0, 3), 0, 1.2, 0.3)));   // 核心
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.42, 1.25, 0); arm.rotation.z = sd * 0.35; body.add(arm);
    for (let k = 0; k < 5; k++) { const l = chainLink(iron, 0.06); l.position.y = -k * 0.11; l.rotation.y = k % 2 ? Math.PI / 2 : 0; arm.add(l); }
    const fist = mesh(new THREE.SphereGeometry(0.14, 7, 5), iron, 0, -0.62, 0); arm.add(fist); if (sd > 0) weapon = arm;
  });
  const legs = [-0.18, 0.18].map(x => { const l = new THREE.Group(); l.position.set(x, 0.42, 0); l.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.42, 6), iron, 0, -0.21, 0)); root.add(l); return l; });
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 首领 1 无舌之钟 · 铸钟巨像：石砌巨人，胸腔是一口没有钟舌的巨钟，双臂是铁锤 */
export function makeBellColossus(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const stone = toon(0x3a3a40), bronze = toon(0x8a6a30, { emissive: new THREE.Color(0x1a1206) }), iron = toon(0x2a2a2c), crack = glow(0x50e8f0, 2.2);
  const chest = mesh(bellGeo(0.95, 1.6, 20), bronze, 0, 1.5, 0); (chest.material as THREE.Material).side = THREE.DoubleSide; body.add(chest);
  body.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 0.9), stone, 0, 3.0, 0));   // 肩
  body.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), stone, 0, 1.25, 0));   // 腰
  for (let i = 0; i < 7; i++) { const c = noOl(mesh(new THREE.BoxGeometry(0.04, 0.3 + rnd() * 0.3, 0.02), crack, (rnd() - 0.5) * 1.3, 1.7 + rnd() * 1.2, 0.72)); c.rotation.z = (rnd() - 0.5) * 1.4; body.add(c); }
  const head = new THREE.Group(); head.position.set(0, 3.45, 0.05); body.add(head);
  head.add(mesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), stone));
  head.add(noOl(mesh(new THREE.BoxGeometry(0.4, 0.06, 0.04), crack, 0, 0.02, 0.28)));   // 一条眼缝
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 1.0, 3.0, 0); arm.rotation.z = sd * 0.18; body.add(arm);
    arm.add(mesh(new THREE.BoxGeometry(0.45, 1.2, 0.45), stone, 0, -0.6, 0));
    arm.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 8), iron, 0, -1.55, 0));   // 锤头手
    arm.add(mesh(new THREE.TorusGeometry(0.44, 0.06, 5, 12), bronze, 0, -1.25, 0));
    if (sd > 0) weapon = arm;
  });
  const legs = [-0.45, 0.45].map(x => { const l = new THREE.Group(); l.position.set(x, 1.0, 0); l.add(mesh(new THREE.BoxGeometry(0.5, 1.0, 0.55), stone, 0, -0.5, 0)); root.add(l); return l; });
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 尾王 沉眠者：黑石血肉的巨躯，头是一口裂开的钟，独眼。A = 被钟声束缚（铜链 + 小铃 + 冷青符文）；B = 完全觉醒（断链、深红紫裂纹、背刺、影触须） */
export function makeSleeper(awake: boolean): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const flesh = toon(awake ? 0x24161e : 0x1e2226, { emissive: new THREE.Color(awake ? 0x1a0408 : 0x020406) });
  const bronze = toon(0x8a6a30, { emissive: new THREE.Color(0x1a1206) }), chainM = toon(0x6a5228);
  const vein = glow(awake ? 0xff3040 : 0x40e0f0, awake ? 2.6 : 1.8);
  // 躯干：前倾的大块
  const torso = mesh(new THREE.SphereGeometry(1.2, 10, 8), flesh, 0, 2.6, 0); torso.scale.set(1.25, 1.1, 0.9); body.add(torso);
  const belly = mesh(new THREE.SphereGeometry(0.9, 9, 7), flesh, 0, 1.6, 0.1); body.add(belly);
  for (let i = 0; i < (awake ? 14 : 6); i++) { const c = noOl(mesh(new THREE.BoxGeometry(0.05, 0.4 + rnd() * 0.5, 0.03), vein, (rnd() - 0.5) * 1.8, 1.6 + rnd() * 1.8, 0.95)); c.rotation.z = (rnd() - 0.5) * 1.6; body.add(c); }
  // 头：裂开的钟 + 独眼
  const head = new THREE.Group(); head.position.set(0, 3.75, 0.45); body.add(head);
  const hb = mesh(bellGeo(0.62, 1.0, 18), bronze, 0, -0.35, 0); (hb.material as THREE.Material).side = THREE.DoubleSide; head.add(hb);
  head.add(mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10), bronze, 0, 0.72, 0));
  const eye = noOl(mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(awake ? 0xff2020 : 0xa0f0ff, awake ? 3.5 : 1.6), 0, -0.05, 0.56)); head.add(eye);
  if (!awake) eye.scale.y = 0.45;   // 半闭
  // 手臂 + 爪
  let weapon: THREE.Object3D | undefined;
  const arms: THREE.Object3D[] = [];
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 1.45, 3.0, 0.1); arm.rotation.z = sd * 0.25; body.add(arm); arms.push(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.38, 0.3, 1.6, 7), flesh, 0, -0.8, 0));
    arm.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 1.3, 7), flesh, 0, -2.1, 0.1));
    for (let k = 0; k < 3; k++) { const cl = mesh(new THREE.ConeGeometry(0.08, 0.5, 4), toon(0x101012), (k - 1) * 0.16, -2.95, 0.15); cl.rotation.x = Math.PI; arm.add(cl); }
    if (!awake) for (let k = 0; k < 3; k++) { const band = mesh(new THREE.TorusGeometry(0.36, 0.05, 5, 12), chainM, 0, -0.5 - k * 0.6, 0); band.rotation.x = Math.PI / 2; arm.add(band); arm.add(noOl(mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), vein, 0, -0.5 - k * 0.6, 0.38))); }
    if (sd > 0) weapon = arm;
  });
  // A：缠身铜链 + 小铃；B：断链拖地 + 背刺
  if (!awake) {
    for (let k = 0; k < 3; k++) { const ring = mesh(new THREE.TorusGeometry(1.3 - k * 0.12, 0.06, 5, 24), chainM, 0, 1.9 + k * 0.6, 0); ring.rotation.x = Math.PI / 2 + (k - 1) * 0.3; body.add(ring); }
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const b = mesh(bellGeo(0.14, 0.22, 10), bronze, Math.cos(a) * 1.25, 1.75 + (k % 3) * 0.55, Math.sin(a) * 1.0); (b.material as THREE.Material).side = THREE.DoubleSide; body.add(b); }
  } else {
    for (let k = 0; k < 7; k++) { const sp = mesh(new THREE.ConeGeometry(0.14, 0.9 + rnd() * 0.5, 5), toon(0x180c12), (rnd() - 0.5) * 1.2, 2.5 + k * 0.22, -0.95); sp.rotation.x = -0.7; body.add(sp); }
    for (let k = 0; k < 2; k++) { const tr = new THREE.Group(); tr.position.set((k ? 1 : -1) * 0.8, 1.2, 0); body.add(tr); for (let j = 0; j < 6; j++) { const l = chainLink(chainM, 0.1); l.position.set(0, -j * 0.18, j * 0.1); l.rotation.y = j % 2 ? Math.PI / 2 : 0; tr.add(l); } }
    for (let k = 0; k < 5; k++) { const t = noOl(mesh(new THREE.ConeGeometry(0.1, 2.2, 5), glow(0x6a20a0, 1.4, { transparent: true, opacity: 0.6 }), 0, 0, 0)); const a = k / 5 * Math.PI * 2; t.position.set(Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6); t.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); root.add(t); }
  }
  const legs = [-0.65, 0.65].map(x => { const l = new THREE.Group(); l.position.set(x, 1.15, 0); l.add(mesh(new THREE.CylinderGeometry(0.45, 0.35, 1.2, 7), flesh, 0, -0.6, 0)); l.add(mesh(new THREE.BoxGeometry(0.7, 0.2, 0.9), toon(0x101012), 0, -1.08, 0.15)); root.add(l); return l; });
  let ph = 0;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 2.4 : 1);
    body.position.y = Math.sin(ph) * 0.06; body.rotation.x = 0.12 + Math.sin(ph * 0.5) * 0.03;
    legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph * 2 + i * Math.PI) * 0.4 : 0; });
    arms.forEach((a, i) => { a.rotation.x = Math.sin(ph + i) * 0.15; });
    if (awake) eye.scale.setScalar(1 + Math.sin(ph * 3) * 0.08);
  };
  return { root, body, legs, weapon, scale: 1, flash: mats(root), tick };
}

/** 抉择界面 3D 预览：守钟人（披风 + 钟灯，冷青金）/ 渊噬者（结晶臂 + 第三只眼 + 光脊 + 影触须） */
export function previewFigure(kind: 'A' | 'B'): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8a888, roughness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: kind === 'A' ? 0x2a4a5a : 0x2a1a24, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: kind === 'A' ? 0xc8a050 : 0x6a2a3a, metalness: 0.6, roughness: 0.4 });
  const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  m(new THREE.CylinderGeometry(1.1, 1.25, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9 }), 0, 0.12, 0);   // 台座
  m(new THREE.TorusGeometry(1.15, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: kind === 'A' ? 0x50e8f0 : 0xff3040 }), 0, 0.26, 0).rotation.x = Math.PI / 2;
  m(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10), cloth, 0, 1.55, 0);
  m(new THREE.CylinderGeometry(0.14, 0.12, 0.8, 8), cloth, -0.15, 0.7, 0); m(new THREE.CylinderGeometry(0.14, 0.12, 0.8, 8), cloth, 0.15, 0.7, 0);
  m(new THREE.SphereGeometry(0.2, 12, 10), skin, 0, 2.2, 0);
  if (kind === 'A') {
    const cape = m(new THREE.ConeGeometry(0.62, 1.9, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x1e3a4a, side: THREE.DoubleSide, roughness: 0.85 }), 0, 1.25, -0.08); cape.scale.z = 0.6;
    m(new THREE.ConeGeometry(0.3, 0.5, 12), cape.material as THREE.Material, 0, 2.35, -0.04);   // 兜帽
    m(new THREE.TorusGeometry(0.3, 0.04, 6, 16), trim, 0, 1.95, 0).rotation.x = Math.PI / 2;
    const arm = m(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), cloth, 0.38, 1.6, 0.15); arm.rotation.x = -0.9;
    const lamp = m(bellGeo(0.13, 0.22, 12), trim, 0.38, 1.3, 0.5); (lamp.material as THREE.Material).side = THREE.DoubleSide;
    m(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbff8ff }), 0.38, 1.18, 0.5);
  } else {
    const arm = m(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6), skin, -0.38, 1.6, 0); arm.rotation.z = 0.3;
    for (let k = 0; k < 6; k++) { const c = m(new THREE.OctahedronGeometry(0.12 + (k % 2) * 0.05), new THREE.MeshStandardMaterial({ color: 0xa040ff, emissive: 0x6020a0, roughness: 0.2, metalness: 0.3 }), 0.4 + Math.sin(k) * 0.05, 1.85 - k * 0.15, 0.05); c.rotation.set(k, k * 2, 0); }   // 结晶臂
    m(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2030 }), 0, 2.3, 0.18);   // 第三只眼
    for (let k = 0; k < 5; k++) m(new THREE.BoxGeometry(0.06, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xff5060 }), 0, 1.25 + k * 0.17, -0.3);   // 光脊
    for (let k = 0; k < 4; k++) { const t = m(new THREE.ConeGeometry(0.05, 1.1, 5), new THREE.MeshBasicMaterial({ color: 0x4a1060, transparent: true, opacity: 0.75 }), 0, 0, 0); const a = k / 4 * Math.PI * 2 + 0.4; t.position.set(Math.cos(a) * 0.5, 0.75, Math.sin(a) * 0.5 - 0.2); t.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); }   // 影触须
  }
  return g;
}

export const BT_MODELS: Record<string, () => unknown> = {
  dlc1_silent_monk: lx('dlc1_silent_monk', makeSilentMonk), dlc1_rope_wraith: lx('dlc1_rope_wraith', makeRopeWraith), dlc1_bronze_puppet: lx('dlc1_bronze_puppet', makeBronzePuppet),
  dlc1_bell_colossus: lx('dlc1_bell_colossus', makeBellColossus), dlc1_sleeper_a: lx('dlc1_sleeper_a', () => makeSleeper(false)), dlc1_sleeper_b: lx('dlc1_sleeper_b', () => makeSleeper(true)),
};
