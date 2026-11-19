// v0.9.3b 翠风原野外环建筑：麦穗村房屋、风车塔、水车磨坊、水井、草垛、石拱桥、坍塌神殿（残墙 / 石阶 / 残像）、废矿坑、隐蔽洞穴、旧箱子
// 全部基础几何体 + 卡通贴图材质，和 models.ts 同一画风；会动的部件（风车叶、水车轮）用 name 标出，bakeStatic 时保留
import * as THREE from 'three';
import { toon, glow, refineProp } from './gfx';
import { texToon } from './textures';
import { wbox, wcyl, lite, makeRock, makeCrate, makeBarrel, makeRails, makeMineCart, makeSupport, makePillar, noOutline } from './models';

const ROOFS = [0x8a3a20, 0x5a4a7a, 0x3a6a4a];
const WALLS = [0xe8d8b8, 0xd8c8a0, 0xc8b898];
/** 木骨架农舍：石基 + 抹灰墙 + 木梁 + 坡屋顶 + 门窗 + 烟囱（6 × 4.4 米，门朝 +z） */
export function makeHouse(v = 0) {
  const g = new THREE.Group(), W = 6, D = 4.4, H = 2.8;
  g.add(wbox(W + 0.3, 0.5, D + 0.3, 0x8a8478, 0, 0.25, 0, 'stone'));
  g.add(wbox(W, H, D, WALLS[v % 3], 0, 0.5 + H / 2, 0, 'parchment'));
  // 木梁（四角 + 腰线）
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) g.add(wbox(0.22, H, 0.22, 0x5a3a1a, x, 0.5 + H / 2, z));
  for (const z of [-D / 2 - 0.02, D / 2 + 0.02]) { g.add(wbox(W, 0.16, 0.08, 0x5a3a1a, 0, 0.5 + H * 0.55, z)); const d1 = wbox(0.12, 1.6, 0.08, 0x5a3a1a, -1.6, 0.5 + H * 0.3, z); d1.rotation.z = 0.6; g.add(d1); }
  // 坡屋顶：两片斜板 + 山墙三角
  const roofMat = texToon('wood', lite(ROOFS[v % 3]));
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.18, D / 2 / Math.cos(0.6) + 0.5), roofMat);
    r.rotation.x = s * 0.6; r.position.set(0, 0.5 + H + 0.75, s * D / 4 + s * 0.05); r.castShadow = true; g.add(r);
  }
  const gable = new THREE.Shape(); gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, 1.55); gable.closePath();
  for (const x of [-W / 2, W / 2]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), texToon('parchment', lite(WALLS[v % 3]), 1, { side: THREE.DoubleSide })); m.rotation.y = Math.PI / 2; m.position.set(x, 0.5 + H, 0); g.add(m); }
  // 门、窗（暖光）、烟囱
  g.add(wbox(1.1, 1.9, 0.12, 0x4a2a14, 0.6, 0.5 + 0.95, D / 2 + 0.04));
  for (const x of [-1.8, 2.2]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), glow(0xffc060, 1.1)); w.position.set(x === 2.2 ? -0.9 : x, 0.5 + 1.7, D / 2 + 0.08); g.add(noOutline(w)); }
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), glow(0xffc060, 1.1)); wb.position.set(1.4, 0.5 + 1.7, -D / 2 - 0.08); wb.rotation.y = Math.PI; g.add(noOutline(wb));
  g.add(wbox(0.6, 1.8, 0.6, 0x7a7a7a, -W / 2 + 1.1, 0.5 + H + 1.2, -0.6, 'stone'));
  // 门口：木桶 / 柴堆
  const br = makeBarrel(); br.position.set(-1.8, 0.5, D / 2 + 0.7); br.scale.setScalar(0.8); g.add(br);
  if (v % 2) for (let i = 0; i < 3; i++) { const log = wcyl(0.15, 0.15, 1.3, 6, 0x7a5530, W / 2 + 0.6, 0.18 + i * 0.3, -0.8 + (i % 2) * 0.2); log.rotation.x = Math.PI / 2; g.add(log); }
  return refineProp(g, 4.5, 0, 1);
}

/** 翠风风车塔：石砌塔身（12 米）+ 木帽 + 四片帆叶（'blades' 会转），远处可见的主地标 */
export function makeWindmill() {
  const g = new THREE.Group();
  g.add(wcyl(2.2, 3.0, 9, 10, 0xc8c0b0, 0, 4.5, 0, 'stone'));
  for (let i = 0; i < 3; i++) g.add(wcyl(2.95 - i * 0.28, 2.95 - i * 0.28, 0.3, 10, 0x8a7a68, 0, 1.2 + i * 3, 0, 'stone'));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 3.2, 10), texToon('wood', lite(0x8a3a20))); cap.position.y = 10.6; cap.castShadow = true; g.add(cap);
  g.add(wbox(1.2, 2.0, 0.15, 0x4a2a14, 0, 1.4, 2.9));
  for (const y of [4.5, 7.2]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), glow(0xffc060, 1.0)); w.position.set(0, y, 2.55 - (y - 4.5) * 0.07); g.add(noOutline(w)); }
  // 帆叶：轴心在塔帽前方
  const blades = new THREE.Group(); blades.name = 'blades'; blades.position.set(0, 9.4, 2.7);
  const axle = wcyl(0.25, 0.25, 0.9, 8, 0x5a3a1a, 0, 9.4, 2.4); axle.rotation.x = Math.PI / 2; g.add(axle);
  const sail = texToon('parchment', 0xfff4dc, 1, { side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    arm.add(wbox(0.22, 7.2, 0.18, 0x6b4a2b, 0, 3.6, 0));
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5.6), sail); cloth.position.set(0.85, 4.2, 0.05); cloth.castShadow = true; arm.add(cloth);
    for (let k = 0; k < 5; k++) arm.add(wbox(1.7, 0.07, 0.07, 0x6b4a2b, 0.85, 1.6 + k * 1.3, 0.1));
    blades.add(arm);
  }
  g.add(blades);
  return refineProp(g, 12, 0, 1);
}

/** 水车磨坊：石木小屋 + 北侧大水车（'wheel' 会转，浸在河里） */
export function makeWatermill() {
  const g = new THREE.Group();
  g.add(wbox(5.4, 0.6, 4.6, 0x8a8478, 0, 0.3, 0, 'stone'));
  g.add(wbox(5, 3.2, 4.2, 0xd8c8a0, 0, 2.2, 0, 'parchment'));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 4), texToon('wood', lite(0x6a3a20))); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); roof.position.y = 4.9; roof.castShadow = true; g.add(roof);
  g.add(wbox(1.0, 1.8, 0.12, 0x4a2a14, 0, 1.5, 2.15));
  const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), glow(0xffc060, 1.1)); w.position.set(1.5, 2.6, 2.15); g.add(noOutline(w));
  // 水车：两圈轮辋 + 辐条 + 水斗
  const wheel = new THREE.Group(); wheel.name = 'wheel'; wheel.position.set(-1.0, 1.6, -3.4);
  const wood = texToon('wood', lite(0x6b4a2b));
  for (const x of [-0.45, 0.45]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 5, 18), wood); rim.rotation.y = Math.PI / 2; rim.position.x = x; rim.castShadow = true; wheel.add(rim); }
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.8, 0.12), wood); sp.rotation.x = i * Math.PI / 8; wheel.add(sp); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.6), wood); b.position.set(0, Math.cos(a) * 2.4, Math.sin(a) * 2.4); b.rotation.x = -a; wheel.add(b); }
  const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 8), wood); ax.rotation.z = Math.PI / 2; wheel.add(ax);
  g.add(wheel);
  g.add(wbox(0.3, 2.4, 0.3, 0x5a3e24, -1.0, 0.6, -2.4));
  return refineProp(g, 5, 0, 1);
}

export function makeWell() {
  const g = new THREE.Group();
  g.add(wcyl(1.0, 1.1, 0.9, 10, 0x9a9282, 0, 0.45, 0, 'stone'));
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), toon(0x3a6a8a)); water.rotation.x = -Math.PI / 2; water.position.y = 0.7; g.add(noOutline(water));
  for (const x of [-0.9, 0.9]) g.add(wbox(0.14, 1.8, 0.14, 0x6b4a2b, x, 1.6, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 4), texToon('wood', lite(0x8a3a20))); roof.rotation.y = Math.PI / 4; roof.position.y = 2.8; roof.castShadow = true; g.add(roof);
  const bar = wcyl(0.08, 0.08, 1.8, 6, 0x5a3a1a, 0, 2.1, 0); bar.rotation.z = Math.PI / 2; g.add(bar);
  const bucket = wcyl(0.2, 0.16, 0.3, 8, 0x7a5530, 0.3, 1.3, 0); g.add(bucket);
  return refineProp(g, 2.5, 0, 1);
}

export function makeHay() {
  const g = new THREE.Group(), m = toon(0xe0b850);
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), m); a.rotation.z = Math.PI / 2; a.position.y = 0.75; a.castShadow = true; g.add(a);
  const b = a.clone(); b.position.set(0.3, 0.75, 1.2); b.rotation.y = 0.4; g.add(b);
  const c = a.clone(); c.position.set(0.1, 1.9, 0.6); c.scale.setScalar(0.85); g.add(c);
  return g;
}

/** 石拱桥：桥面中间拱起 0.6 米（视觉），石栏杆 + 两个桥拱，长 len 沿 z */
export function makeStoneBridge(len = 12, width = 6.4) {
  const g = new THREE.Group(), N = 12;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, z = -len / 2 + t * len, y = 0.12 + Math.sin(t * Math.PI) * 0.45;
    g.add(wbox(width, 0.3, len / N + 0.02, 0xb0a898, 0, y, z, 'stone'));
    for (const s of [-1, 1]) g.add(wbox(0.4, 0.8, len / N + 0.02, 0x9a9282, s * (width / 2 - 0.2), y + 0.55, z, 'stone'));
  }
  for (const z of [-len / 4, len / 4]) { const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.45, 6, 12, Math.PI), texToon('stone', lite(0x8a8478))); arch.position.set(0, -1.2, z); arch.rotation.y = Math.PI / 2; arch.scale.set(1, 1, width / 1.2); arch.castShadow = true; g.add(arch); }
  for (const z of [-len / 2, len / 2]) for (const s of [-1, 1]) { g.add(wbox(0.7, 1.4, 0.7, 0x9a9282, s * (width / 2 - 0.2), 0.7, z, 'stone')); const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), glow(0xffc060, 1.4)); l.position.set(s * (width / 2 - 0.2), 1.6, z); g.add(noOutline(l)); }
  return refineProp(g, 1.5, 0, 1.2);
}

/** 神殿残墙：4.2 米长的断墙，v=1 更残 */
export function makeTempleWall(v = 0) {
  const g = new THREE.Group(), H = v ? 2.2 : 3.6;
  g.add(wbox(4.2, 0.5, 1.1, 0x8a8a80, 0, 0.25, 0, 'stone'));
  for (let i = 0; i < 4; i++) { const h = H * (0.65 + 0.35 * Math.sin(i * 2.1 + v * 3)); g.add(wbox(1.0, h, 0.9, 0xb8b4a8, -1.55 + i * 1.03, 0.5 + h / 2, 0, 'stone')); }
  const moss = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 1.0), toon(0x5a7a3a)); moss.position.y = 0.52; g.add(moss);
  const r = makeRock(0.5, 0x9a9890); r.position.set(1.6, 0.3, 1.0); g.add(r);
  return refineProp(g, H, 0, 1.2);
}
/** 神殿石阶 + 中央发光法阵（台阶 3 级，最高 0.6 米，人物不抬高，只是视觉） */
export function makeTempleSteps() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(wbox(7 - i * 1.6, 0.2, 6 - i * 1.4, 0xb0aca0, 0, 0.1 + i * 0.2, 0, 'stone'));
  const rune = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 8), glow(0xa0e0ff, 1.5, { side: THREE.DoubleSide })); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.62; g.add(noOutline(rune));
  return refineProp(g, 1, 0, 1);
}
/** 无头残像：基座 + 披袍身躯，v=1 中央那尊更高、手持石剑 */
export function makeTempleStatue(v = 0) {
  const g = new THREE.Group(), s = v ? 1.35 : 1;
  g.add(wbox(1.8 * s, 1.0, 1.8 * s, 0x8a8a80, 0, 0.5, 0, 'stone'));
  g.add(wcyl(0.55 * s, 0.85 * s, 2.8 * s, 8, 0xc0bcb0, 0, 1 + 1.4 * s, 0, 'stone'));
  g.add(wbox(1.7 * s, 0.5 * s, 0.7 * s, 0xb8b4a8, 0, 1 + 2.75 * s, 0, 'stone'));
  if (v) { const sw = wbox(0.18, 3.4, 0.4, 0xa8a49a, 0.75, 2.1, 0.5, 'stone'); sw.rotation.z = 0.1; g.add(sw); }
  const crack = makeRock(0.45, 0xa09c90); crack.position.set(0.8 * s, 0.25, 0.9 * s); g.add(crack);
  return refineProp(g, 4 * s, 0, 1.2);
}

/** 废矿坑：岩丘里的洞口 + 支撑木框 + 铁轨 + 翻倒的矿车（洞口朝 +z） */
export function makeMineEntrance() {
  const g = new THREE.Group();
  for (let i = -3; i <= 3; i++) { const r = makeRock(2.6 + Math.abs(i) * 0.2, 0x7a7068); r.position.set(i * 2.0, 1.6 + (3 - Math.abs(i)) * 0.6, -2.2 - Math.abs(i) * 0.4); g.add(r); }
  const top = makeRock(3.2, 0x6a6058); top.position.set(0, 4.6, -3.4); g.add(top);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.2), new THREE.MeshBasicMaterial({ color: 0x050608 })); dark.position.set(0, 1.6, -0.9); g.add(noOutline(dark));
  const sup = makeSupport(); sup.position.set(0, 0, -0.5); sup.scale.set(1.25, 1.1, 1); g.add(sup);
  const rails = makeRails(7); rails.position.set(0, 0.02, 2.5); g.add(rails);
  const cart = makeMineCart(true); cart.position.set(1.8, 0, 3.6); cart.rotation.set(0, 0.5, 1.3); g.add(cart);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0xffa040, 2)); lamp.position.set(-1.6, 2.7, -0.3); g.add(noOutline(lamp));
  return g;
}
/** 隐蔽洞穴：长满藤蔓的低矮洞口（朝 +z） */
export function makeCaveMouth() {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) { const r = makeRock(1.9 + Math.abs(i) * 0.3, 0x6a7060); r.position.set(i * 1.6, 1.2 + (2 - Math.abs(i)) * 0.5, -1.6); g.add(r); }
  const top = makeRock(2.2, 0x5a6050); top.position.set(0, 3.2, -2.2); g.add(top);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x040505 })); dark.position.set(0, 1.1, -0.5); g.add(noOutline(dark));
  for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2 + (i % 3) * 0.4, 4), toon(0x3f6a1e)); v.position.set(-1.2 + i * 0.4, 2.0 - (i % 3) * 0.2, -0.35); g.add(v); }
  return g;
}
/** 旧宝箱（v0.9.3e 才能开） */
export function makeChest() {
  const g = new THREE.Group();
  g.add(wbox(1.0, 0.55, 0.65, 0x7a4a20, 0, 0.28, 0));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.0, 10, 1, false, 0, Math.PI), texToon('wood', lite(0x6a3a18))); lid.rotation.z = Math.PI / 2; lid.position.y = 0.55; lid.castShadow = true; g.add(lid);
  for (const x of [-0.35, 0.35]) g.add(wbox(0.08, 0.9, 0.68, 0xc8a040, x, 0.5, 0, 'stone'));
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), glow(0xffd34d, 1.2)); lock.position.set(0, 0.5, 0.34); g.add(noOutline(lock));
  return refineProp(g, 1, 0.4, 1);
}
export { makeCrate, makePillar };
