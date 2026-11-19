// ======================================================================
// DLC1 世界首领模型（v1.2.6 d1.10a，程序化建模，风格同 models.ts）
//   dlc1_tide_whale    潮汐巨鲸：半透明的灵体巨鲸，背上长着藤壶和三口小沉钟，贴着地面游
//   dlc1_mirror_knight 镜像骑士：镜面板甲 + 镜盾 + 长剑，盔缝里透青光（团长 = 放大 + 披风 + 冠）
// ======================================================================
import * as THREE from 'three';
import { toon, glow } from '../../web/gfx';
import { lx } from './lux_dlc';

type Rig = { root: THREE.Group; body: THREE.Object3D; weapon?: THREE.Object3D; legs: THREE.Object3D[]; scale: number; flash: THREE.MeshToonMaterial[]; tick?: (dt: number, moving: boolean) => void };
const mats = (g: THREE.Object3D) => { const o: THREE.MeshToonMaterial[] = []; g.traverse(x => { const m = (x as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial) o.push(m); }); return o; };
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const noOl = <T extends THREE.Object3D>(o: T) => { o.userData.outlineParameters = { visible: false }; return o; };
const bellGeo = (r: number, h: number) => { const p: THREE.Vector2[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; p.push(new THREE.Vector2(r * (0.5 + 0.5 * t * t) + (t > 0.9 ? r * 0.08 : 0), h - t * h)); } return new THREE.LatheGeometry(p, 14); };

/** 潮汐巨鲸：身体沿 z 轴（头朝 +z），离地漂浮；尾巴分 4 节摆动 */
export function makeTideWhale(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); body.position.y = 1.7; root.add(body);
  const skin = toon(0x2a5a6a, { emissive: new THREE.Color(0x06242a) }), belly = toon(0x8ac8c0), dark = toon(0x16323a);
  const bronze = toon(0x8a6a34, { emissive: new THREE.Color(0x1a1206) }), barn = toon(0xb0a890);
  // 躯干：拉长的球 + 腹部浅色
  const torso = mesh(new THREE.SphereGeometry(1, 20, 14), skin); torso.scale.set(1.25, 1.0, 2.5); body.add(torso);
  const bel = mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly); bel.scale.set(1.18, 0.95, 2.35); body.add(bel);
  for (let i = 0; i < 6; i++) { const g = mesh(new THREE.BoxGeometry(1.6, 0.04, 0.05), dark, 0, -0.78, 1.6 - i * 0.38); g.rotation.x = 0.1; body.add(g); }   // 腹褶
  // 头：前端略扁的大头 + 嘴线 + 发光眼
  const head = mesh(new THREE.SphereGeometry(1, 18, 12), skin, 0, 0.05, 2.1); head.scale.set(1.1, 0.88, 1.15); body.add(head);
  const jaw = mesh(new THREE.BoxGeometry(1.7, 0.06, 1.4), dark, 0, -0.25, 2.45); body.add(jaw);
  [-1, 1].forEach(s => body.add(noOl(mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(0x60fff0, 3), s * 0.88, 0.12, 2.55))));
  // 鳍
  [-1, 1].forEach(s => { const f = mesh(new THREE.ConeGeometry(0.35, 1.6, 4), dark, s * 1.25, -0.45, 1.0); f.scale.z = 0.25; f.rotation.z = s * 1.1; f.rotation.x = 0.5; body.add(f); });
  const dorsal = mesh(new THREE.ConeGeometry(0.3, 0.8, 4), dark, 0, 1.0, -0.9); dorsal.scale.z = 0.4; dorsal.rotation.x = -0.5; body.add(dorsal);
  // 背上的藤壶和三口沉钟
  for (let i = 0; i < 14; i++) { const a = i * 2.4, z = 1.5 - (i / 14) * 3.0; const b = mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.12, 6), barn, Math.cos(a) * 0.55, 0.88 + Math.sin(a) * 0.05, z); body.add(b); }
  const bells: THREE.Object3D[] = [];
  [[0, 0.95, 0.6, 0.32], [-0.45, 0.85, -0.2, 0.24], [0.42, 0.82, -0.5, 0.22]].forEach(([x, y, z, r]) => {
    const b = mesh(bellGeo(r, r * 1.5), bronze, x, y, z); (b.material as THREE.Material).side = THREE.DoubleSide; b.rotation.z = x * 0.6; body.add(b); bells.push(b);
    const ring = noOl(mesh(new THREE.TorusGeometry(r * 0.95, 0.025, 4, 16), glow(0x40e0c0, 1.6), x, y + 0.04, z)); ring.rotation.x = Math.PI / 2; body.add(ring);
  });
  // 尾：4 节 + 尾叶
  const segs: THREE.Object3D[] = []; let parent: THREE.Object3D = body;
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Group(); s.position.z = i === 0 ? -2.1 : -0.7; parent.add(s);
    const m = mesh(new THREE.SphereGeometry(0.75 - i * 0.14, 12, 8), skin, 0, 0, -0.35); m.scale.set(1.2, 0.85, 1.1); s.add(m);
    segs.push(s); parent = s;
  }
  const fluke = mesh(new THREE.ConeGeometry(0.55, 1.8, 3), dark, 0, 0, -0.9); fluke.rotation.z = Math.PI / 2; fluke.rotation.y = Math.PI / 2; fluke.scale.set(1, 1, 0.22); parent.add(fluke);
  // 身下的潮水光环（不随身体起伏）
  const tide = noOl(mesh(new THREE.TorusGeometry(2.6, 0.1, 4, 32), glow(0x40e0e0, 1.4, { transparent: true, opacity: 0.5 }), 0, 0.06, 0)); tide.rotation.x = Math.PI / 2; tide.scale.set(1, 1.7, 1); root.add(tide);
  let ph = 0;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 2.4 : 1.1);
    body.position.y = 1.7 + Math.sin(ph) * 0.22; body.rotation.x = Math.sin(ph) * 0.05;
    segs.forEach((s, i) => { s.rotation.x = Math.sin(ph - i * 0.7) * (0.12 + i * 0.05); });
    bells.forEach((b, i) => { b.rotation.x = Math.sin(ph * 1.7 + i) * 0.18; });
    tide.scale.set(1 + Math.sin(ph * 1.3) * 0.08, 1.7 + Math.sin(ph * 1.3) * 0.12, 1);
  };
  return { root, body, legs: [], scale: 1, flash: mats(root), tick };
}

/** 镜像骑士：captain = 团长（披风、冠、更亮的镜面） */
export function makeMirrorKnight(captain = false): Rig {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const plate = toon(captain ? 0xc8d8e0 : 0x9aaab4, { emissive: new THREE.Color(captain ? 0x0a2a2e : 0x061a1e) });
  const dark = toon(0x262c34), mirror = toon(0xd8f4ff, { emissive: new THREE.Color(0x2a6a70) }), gold = toon(0xc8a050);
  const eye = glow(0x70fff0, 3);
  // 腿
  const legs: THREE.Object3D[] = [];
  [-1, 1].forEach(s => {
    const leg = new THREE.Group(); leg.position.set(s * 0.18, 0.95, 0); body.add(leg); legs.push(leg);
    leg.add(mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), plate, 0, -0.25, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.18, 0.46, 0.2), dark, 0, -0.68, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.22, 0.12, 0.32), plate, 0, -0.9, 0.05));
    leg.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), plate, 0, -0.48, 0.06));   // 护膝
  });
  // 躯干：胸甲 + 腰裙
  body.add(mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), plate, 0, 1.38, 0));
  { const c = mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, 1.5, 0.06); c.scale.set(1, 0.6, 0.6); c.rotation.x = Math.PI / 2; body.add(c); }
  body.add(noOl(mesh(new THREE.CircleGeometry(0.11, 12), mirror, 0, 1.45, 0.18)));   // 胸口小镜
  body.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.3, 8), dark, 0, 1.0, 0));
  // 头盔：桶盔 + 眼缝
  const head = new THREE.Group(); head.position.set(0, 1.86, 0); body.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.36, 10), plate));
  head.add(noOl(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.02), eye, 0, 0.03, 0.18)));
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), dark, 0, -0.06, 0.19));
  if (captain) for (let i = 0; i < 5; i++) { const sp = mesh(new THREE.ConeGeometry(0.035, 0.18, 4), gold, Math.cos(i / 4 * Math.PI) * 0.15, 0.25, Math.sin(i / 4 * Math.PI) * 0.06 - 0.02); head.add(sp); }
  else { const pl = mesh(new THREE.BoxGeometry(0.04, 0.1, 0.32), mirror, 0, 0.22, -0.02); head.add(pl); }
  // 肩甲
  [-1, 1].forEach(s => { const p = mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), plate, s * 0.36, 1.66, 0); p.scale.set(1.2, 0.8, 1.1); body.add(p); });
  // 手臂：右手长剑（weapon），左手镜盾
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(s => {
    const arm = new THREE.Group(); arm.position.set(s * 0.38, 1.62, 0); body.add(arm);
    arm.add(mesh(new THREE.BoxGeometry(0.14, 0.5, 0.15), plate, 0, -0.25, 0));
    arm.add(mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), dark, 0, -0.66, 0.04));
    if (s > 0) {
      const sw = new THREE.Group(); sw.position.set(0, -0.86, 0.08); arm.add(sw); weapon = sw;
      sw.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), dark, 0, -0.02, 0));
      sw.add(mesh(new THREE.BoxGeometry(0.32, 0.05, 0.07), gold, 0, 0.1, 0));
      sw.add(noOl(mesh(new THREE.BoxGeometry(0.08, 1.15, 0.025), mirror, 0, 0.7, 0)));
      sw.rotation.x = Math.PI / 2 - 0.3;
    } else {
      const sh = new THREE.Group(); sh.position.set(-0.08, -0.55, 0.12); sh.rotation.y = -0.3; arm.add(sh);
      sh.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6), gold).rotateX(Math.PI / 2));
      sh.add(noOl(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 6), mirror).rotateX(Math.PI / 2)));
    }
  });
  if (captain) {   // 披风
    const cape = mesh(new THREE.PlaneGeometry(0.66, 1.25, 1, 4), toon(0x1a3a4a, { side: THREE.DoubleSide }), 0, 1.05, -0.2); cape.rotation.x = 0.12; body.add(cape);
  }
  const aura = noOl(mesh(new THREE.RingGeometry(0.5, 0.62, 24), glow(0x60f0ff, 1.2, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 0.05, 0)); aura.rotation.x = -Math.PI / 2; root.add(aura);
  let ph = Math.random() * 6;
  const tick = (dt: number) => { ph += dt * 2; aura.scale.setScalar(1 + Math.sin(ph) * 0.1); };
  return { root, body, legs, weapon, scale: 1, flash: mats(root), tick };
}

export const WB_MODELS: Record<string, () => unknown> = {
  dlc1_tide_whale: lx('dlc1_tide_whale', makeTideWhale), dlc1_mirror_knight: lx('dlc1_mirror_knight', () => makeMirrorKnight(false)), dlc1_knight_captain: lx('dlc1_mirror_captain', () => makeMirrorKnight(true)),
};
