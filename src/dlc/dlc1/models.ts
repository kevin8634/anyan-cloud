// ======================================================================
// DLC1 沉钟海岸 · 新怪物模型（v1.0.4，程序化建模，风格同本体 web/models.ts）
// 依据概念图 files/art/dlc1/d13_coast_mobs.png：溺亡回响 / 钟壳蟹 / 潮鳍妖 / 回响·溺亡工头
// 只 import three 和本体 gfx 的材质工具（不 import 本体 data）；通过 PackManifest.models 挂进 WILD_MODELS
// Rig 结构：{ root, body, legs, scale, flash(MeshToonMaterial[]), tick? }
// ======================================================================
import * as THREE from 'three';
import { toon, glow } from '../../web/gfx';
import { registerCreatureGlb, makeGlbCreature } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { eliteHd } from './elite_hd';
import { luxMiss } from './lux_dlc';
// v1.2.23 比赛版：有 Lux3D 写实模型（assets_aholo/dlc1/creatures/）就用，没有（商用 base 包）回退下面的程序化模型
registerCreatureGlb(Object.fromEntries(Object.entries(PACK_CREATURE_GLB).filter(([k]) => !k.startsWith('scene_') && !k.startsWith('raw_') && !k.endsWith('_boss'))));   // A8：<id>_boss 正式绑骨件由 boss_glb.ts 单独解析（带骨架）   // v1.2.45 场景件走 preloadScenes
const lux = (name: string, o: Parameters<typeof makeGlbCreature>[1]): Rig | null => {
  if (!(name in PACK_CREATURE_GLB)) return null;
  const r = makeGlbCreature(name, o) as unknown as Rig | null;
  if (r) r.root.userData.lux = name; else luxMiss(name);   // fix1109b：比赛版拿不到 Lux3D 模型要报错，不静默退回程序化
  return r;
};

type Rig = { root: THREE.Group; body: THREE.Object3D; weapon?: THREE.Object3D; legs: THREE.Object3D[]; scale: number; flash: THREE.MeshToonMaterial[]; tick?: (dt: number, moving: boolean) => void };
const mats = (g: THREE.Object3D) => { const o: THREE.MeshToonMaterial[] = []; g.traverse(x => { const m = (x as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial) o.push(m); }); return o; };
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const ghost = (c: number, op = 0.78) => toon(c, { transparent: true, opacity: op, emissive: new THREE.Color(c).multiplyScalar(0.35) });
const noOl = <T extends THREE.Object3D>(o: T) => { o.userData.outlineParameters = { visible: false }; return o; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 溺亡回响：半透明的水手幽灵，水手帽、海草、手里拖着锚 */
export function makeDrowned(): Rig {
  const L = lux('dlc1_drowned', { rig: 'H', height: 1.9, wave: 0.02, bob: 0.02, pbr: { roughness: 0.8, emissive: 0x40c8c0, emissiveK: 0.22 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = ghost(0x5ad8d0, 0.72), cloth = ghost(0x2a6a70, 0.8), weed = toon(0x3a6a2a);
  body.add(mesh(new THREE.BoxGeometry(0.62, 0.8, 0.34), cloth, 0, 1.35, 0));
  body.add(mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), toon(0x4a3420), 0, 0.98, 0));   // 腰带
  const head = new THREE.Group(); head.position.set(0, 1.98, 0.03); head.rotation.x = 0.18; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), skin));
  head.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 10), toon(0x1a2a3a), 0, 0.2, 0));   // 水手帽
  [-0.09, 0.09].forEach(x => head.add(noOl(mesh(new THREE.SphereGeometry(0.045, 6, 4), glow(0x80fff0, 3), x, 0.03, 0.21))));
  head.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), toon(0x0a1a1a), 0, -0.1, 0.21));   // 张开的嘴
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.BoxGeometry(0.06, 0.5 + rnd() * 0.4, 0.03), weed, (rnd() - 0.5) * 0.6, 1.3 + rnd() * 0.3, 0.18 * (rnd() > 0.5 ? 1 : -1)); s.rotation.z = (rnd() - 0.5) * 0.5; body.add(s); }
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.4, 1.68, 0); arm.rotation.z = sd * 0.12; body.add(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.75, 6), skin, 0, -0.38, 0));
    if (sd > 0) {   // 右手拖锚
      const a = new THREE.Group(); a.position.set(0, -0.8, 0.05); arm.add(a); weapon = a;
      const iron = toon(0x6a4a30);
      a.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 5), iron, 0, -0.35, 0));
      const hook = mesh(new THREE.TorusGeometry(0.22, 0.04, 5, 12, Math.PI), iron, 0, -0.68, 0); hook.rotation.z = Math.PI; a.add(hook);
      a.add(mesh(new THREE.TorusGeometry(0.07, 0.025, 4, 8), iron, 0, 0.05, 0));
    }
  });
  const legs = [-0.15, 0.15].map(x => { const l = new THREE.Group(); l.position.set(x, 0.95, 0); l.add(mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.9, 6), ghost(0x2a6a70, 0.55), 0, -0.45, 0)); root.add(l); return l; });
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 钟壳蟹：背着一口长满藤壶的碎铜钟，六条腿、两只大钳 */
export function makeBellCrab(): Rig {
  const L = lux('dlc1_bellcrab', { length: 2.0, wave: 0, bob: 0.01, pbr: { roughness: 0.6, metalness: 0.3, emissive: 0x505050, emissiveK: 0.6 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shell = toon(0x2a4a3a), bronze = toon(0x5a7a5a, { emissive: new THREE.Color(0x0a2018) }), claw = toon(0x8a5a30);
  { const _m = mesh(new THREE.SphereGeometry(0.55, 10, 6), shell, 0, 0.55, 0); _m.scale.set(1.3, 0.55, 1.1); body.add(_m); }
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.32 + 0.42 * Math.pow(t, 2) + (t > 0.9 ? 0.06 : 0), 1.0 - t * 1.0)); }
  const bell = mesh(new THREE.LatheGeometry(prof, 18), bronze, 0, 0.62, -0.05); (bell.material as THREE.Material).side = THREE.DoubleSide; body.add(bell);
  body.add(mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 10), bronze, 0, 1.68, -0.05));
  body.add(noOl(mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), glow(0x30e8d0, 2.5), 0.15, 1.15, 0.5)));   // 钟身裂缝的冷光
  for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI * 2, h = 0.75 + rnd() * 0.7, r = 0.38 + (1.6 - h) * 0.35; body.add(mesh(new THREE.ConeGeometry(0.06, 0.12, 5), toon(0xd8d0b8), Math.cos(a) * r, h, Math.sin(a) * r - 0.05)); }
  [-0.12, 0.12].forEach(x => body.add(noOl(mesh(new THREE.SphereGeometry(0.05, 6, 4), glow(0x80fff0, 3), x, 0.72, 0.62))));
  const legs: THREE.Object3D[] = [];
  [-1, 1].forEach(sd => {
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Group(); l.position.set(sd * 0.55, 0.5, -0.3 + k * 0.3); l.rotation.y = sd * (0.3 - k * 0.3); root.add(l);
      const up = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 5), shell, sd * 0.28, 0.1, 0); up.rotation.z = sd * -1.1; l.add(up);
      const lo = mesh(new THREE.ConeGeometry(0.05, 0.6, 5), shell, sd * 0.62, -0.18, 0); lo.rotation.z = sd * 0.35 + Math.PI; l.add(lo);
      legs.push(l);
    }
    const c = new THREE.Group(); c.position.set(sd * 0.55, 0.55, 0.55); c.scale.setScalar(1.5); c.rotation.y = sd * -0.2; body.add(c);
    { const _m = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), claw, 0, 0, 0.2); _m.rotation.x = Math.PI / 2; c.add(_m); }
    const pin = mesh(new THREE.SphereGeometry(0.22, 8, 6), claw, 0, 0, 0.55); pin.scale.set(0.8, 0.7, 1.3); c.add(pin);
    const j = new THREE.Group(); j.position.set(0, 0.06, 0.65); j.name = 'jaw'; c.add(j);
    { const _m = mesh(new THREE.ConeGeometry(0.08, 0.4, 5), toon(0x2a1a10), 0, 0, 0.18); _m.rotation.x = Math.PI / 2; j.add(_m); }
  });
  let ph = 0;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 9 : 2);
    legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph + i * 1.3) * 0.35 : 0; });
    body.position.y = moving ? Math.abs(Math.sin(ph * 2)) * 0.04 : Math.sin(ph) * 0.01;
    body.traverse(o => { if (o.name === 'jaw') o.rotation.x = -0.25 - Math.max(0, Math.sin(ph * 0.7)) * 0.4; });
  };
  return { root, body, legs, scale: 1, flash: mats(root), tick };
}

/** 潮鳍妖：细长的海妖，头顶鳍冠，下半身是摆动的鱼尾 */
export function makeSiren(): Rig {
  const L = lux('dlc1_siren', { height: 2.2, wave: 0.04, bob: 0.015, pbr: { roughness: 0.55, emissive: 0x204040, emissiveK: 0.4 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = toon(0x2a6a6a, { emissive: new THREE.Color(0x05201e) }), fin = toon(0x1a8a8a), dark = toon(0x0e3a3a);
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.7, 8), skin, 0, 1.55, 0));
  { const _m = mesh(new THREE.SphereGeometry(0.2, 8, 6), skin, 0, 1.95, 0); _m.scale.set(1, 0.7, 0.8); body.add(_m); }
  const head = new THREE.Group(); head.position.set(0, 2.18, 0.02); body.add(head);
  { const _m = mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); _m.scale.set(0.9, 1.15, 1); head.add(_m); }
  for (let i = 0; i < 5; i++) { const s = mesh(new THREE.ConeGeometry(0.04, 0.3 + (2 - Math.abs(i - 2)) * 0.06, 4), fin, (i - 2) * 0.06, 0.2, -0.04 - Math.abs(i - 2) * 0.02); s.rotation.z = (i - 2) * -0.35; head.add(s); }
  [-0.055, 0.055].forEach(x => head.add(noOl(mesh(new THREE.SphereGeometry(0.03, 6, 4), glow(0xd8ff60, 3), x, 0.02, 0.13))));
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.24, 1.82, 0); arm.rotation.z = sd * 0.35; body.add(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.75, 6), skin, 0, -0.38, 0));
    for (let k = 0; k < 3; k++) { const _m = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), dark, (k - 1) * 0.03, -0.84, 0.02); _m.rotation.x = Math.PI; arm.add(_m); }
    { const _m = mesh(new THREE.ConeGeometry(0.03, 0.22, 3), fin, sd * 0.05, -0.3, -0.04); _m.rotation.z = sd * 0.8; arm.add(_m); }
  });
  const tail = new THREE.Group(); tail.position.y = 1.22; body.add(tail);
  const segs: THREE.Object3D[] = []; let parent: THREE.Object3D = tail;
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group(); s.position.y = i === 0 ? 0 : -0.2; parent.add(s);
    s.add(mesh(new THREE.CylinderGeometry(0.16 - i * 0.022, 0.14 - i * 0.022, 0.26, 7), i % 2 ? dark : skin, 0, -0.12, 0));
    segs.push(s); parent = s;
  }
  const fluke = mesh(new THREE.ConeGeometry(0.22, 0.4, 3), fin, 0, -0.38, 0); fluke.scale.z = 0.25; parent.add(fluke);
  const splash = noOl(mesh(new THREE.TorusGeometry(0.35, 0.04, 4, 16), glow(0x40e0e0, 1.6, { transparent: true, opacity: 0.6 }), 0, 0.05, 0)); splash.rotation.x = Math.PI / 2; root.add(splash);
  let ph = rnd() * 6;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 5 : 2.2);
    segs.forEach((s, i) => { s.rotation.x = -(i ? 0.26 : 0.05) + Math.sin(ph - i * 0.7) * (0.1 + i * 0.025); s.rotation.z = Math.sin(ph * 0.6 - i) * 0.05; });
    body.position.y = 0.1 + Math.sin(ph * 0.8) * 0.05;
    splash.scale.setScalar(1 + Math.sin(ph * 1.6) * 0.15);
  };
  return { root, body, legs: [], scale: 1, flash: mats(root), tick };
}

/** 回响 · 溺亡工头：矿洞监工格罗克的回响。深蓝躯体爬满冷光裂纹，生锈矿灯头盔、肩甲、锁链、鹤嘴镐 */
export function makeEchoForeman(): Rig {
  const E = eliteHd('dlc1_echo_foreman'); if (E) return E;   // v1.2.73 绑骨显示件
  const L = lux('dlc1_echo_foreman', { height: 2.7, wave: 0, bob: 0.01, pbr: { roughness: 0.7, emissive: 0x40a0c0, emissiveK: 0.3 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = toon(0x1a3a4a, { emissive: new THREE.Color(0x041418) }), rust = toon(0x7a4a24), iron = toon(0x4a4a48), crack = glow(0x40f0e8, 2.4);
  const torso = mesh(new THREE.BoxGeometry(1.05, 1.0, 0.65), skin, 0, 1.75, 0); body.add(torso);
  body.add(mesh(new THREE.BoxGeometry(0.85, 0.5, 0.55), skin, 0, 1.1, 0));
  body.add(mesh(new THREE.BoxGeometry(0.95, 0.16, 0.62), toon(0x3a2a1a), 0, 1.3, 0));   // 腰带
  { const _m = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), rust, 0, 1.3, 0.33); _m.rotation.x = Math.PI / 2; body.add(_m); }   // 带扣
  for (let i = 0; i < 9; i++) { const c = noOl(mesh(new THREE.BoxGeometry(0.03, 0.18 + rnd() * 0.25, 0.02), crack, (rnd() - 0.5) * 0.9, 1.25 + rnd() * 0.9, 0.335)); c.rotation.z = (rnd() - 0.5) * 1.6; body.add(c); }
  const head = new THREE.Group(); head.position.set(0, 2.45, 0.1); body.add(head);
  { const _m = mesh(new THREE.SphereGeometry(0.3, 10, 8), skin); _m.scale.set(1, 0.95, 1); head.add(_m); }
  head.add(mesh(new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), rust, 0, 0.05, 0));   // 头盔
  head.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), rust, 0, 0.05, 0));
  head.add(noOl(mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0x80fff0, 4), 0, 0.2, 0.3)));   // 矿灯
  [-0.1, 0.1].forEach(x => head.add(noOl(mesh(new THREE.SphereGeometry(0.045, 6, 4), crack, x, -0.02, 0.27))));
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const pad = mesh(new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), rust, sd * 0.62, 2.18, 0); pad.scale.set(1.1, 0.8, 1); body.add(pad);
    const arm = new THREE.Group(); arm.position.set(sd * 0.68, 2.1, 0); arm.rotation.z = sd * 0.15; body.add(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.17, 0.14, 1.0, 7), skin, 0, -0.5, 0));
    arm.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 7), iron, 0, -0.85, 0));   // 镣铐
    const ch = new THREE.Group(); ch.position.set(0, -0.95, 0); arm.add(ch);
    for (let k = 0; k < 4; k++) { const l = mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 8), iron, 0, -k * 0.1, 0); l.rotation.y = k % 2 ? Math.PI / 2 : 0; ch.add(l); }
    if (sd > 0) {
      const p = new THREE.Group(); p.position.set(0, -1.0, 0.15); p.rotation.x = -0.6; arm.add(p); weapon = p;
      p.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), toon(0x4a3020), 0, 0.3, 0));
      const pick = mesh(new THREE.ConeGeometry(0.08, 0.9, 4), iron, 0.3, 1.05, 0); pick.rotation.z = -Math.PI / 2; p.add(pick);
      const back = mesh(new THREE.ConeGeometry(0.07, 0.45, 4), iron, -0.2, 1.05, 0); back.rotation.z = Math.PI / 2; p.add(back);
    }
  });
  const legs = [-0.27, 0.27].map(x => { const l = new THREE.Group(); l.position.set(x, 0.9, 0); l.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.9, 7), skin, 0, -0.45, 0)); l.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 0.45), iron, 0, -0.88, 0.06)); root.add(l); return l; });
  const water = noOl(mesh(new THREE.TorusGeometry(0.7, 0.06, 4, 20), glow(0x40e0e0, 1.4, { transparent: true, opacity: 0.5 }), 0, 0.06, 0)); water.rotation.x = Math.PI / 2; root.add(water);
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 镜像碎影：碎银镜片拼成的人形，胸口一团冷光核心，碎片在身边漂浮（v1.0.5） */
export function makeMirrorWraith(): Rig {
  const L = lux('dlc1_mirror_wraith', { rig: 'F', height: 2.3, wave: 0, bob: 0.03, pbr: { roughness: 0.25, metalness: 0.7, emissive: 0x506070, emissiveK: 0.5 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const shard = () => toon(0xc8d8dc, { emissive: new THREE.Color(0x1a3a40) }), dark = toon(0x5a6a70);
  const torso = new THREE.Group(); torso.position.y = 1.4; body.add(torso);
  for (let i = 0; i < 14; i++) { const m = mesh(new THREE.BoxGeometry(0.14 + rnd() * 0.12, 0.18 + rnd() * 0.16, 0.05), i % 3 ? shard() : dark, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.7, 0.12 * (rnd() > 0.5 ? 1 : -1)); m.rotation.set((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.8); torso.add(m); }
  torso.add(noOl(mesh(new THREE.OctahedronGeometry(0.16), glow(0x40fff0, 3), 0, 0.1, 0.1)));
  const head = new THREE.Group(); head.position.set(0, 2.05, 0); body.add(head);
  for (let i = 0; i < 6; i++) { const m = mesh(new THREE.BoxGeometry(0.14, 0.16, 0.05), shard(), (rnd() - 0.5) * 0.24, (rnd() - 0.5) * 0.24, 0.08 * (i % 2 ? 1 : -1)); m.rotation.z = (rnd() - 0.5); head.add(m); }
  head.add(noOl(mesh(new THREE.SphereGeometry(0.04, 6, 4), glow(0xff6050, 3), 0.06, 0.02, 0.12)));
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.36, 1.72, 0); arm.rotation.z = sd * 0.2; body.add(arm);
    for (let k = 0; k < 4; k++) { const m = mesh(new THREE.BoxGeometry(0.1, 0.22, 0.05), shard(), 0, -0.1 - k * 0.2, 0); m.rotation.y = k * 0.7; arm.add(m); }
    { const _m = mesh(new THREE.ConeGeometry(0.06, 0.3, 3), shard(), 0, -0.98, 0); _m.rotation.x = 0; arm.add(_m); }
  });
  const legs = [-0.15, 0.15].map(x => { const l = new THREE.Group(); l.position.set(x, 0.95, 0); for (let k = 0; k < 4; k++) l.add(mesh(new THREE.BoxGeometry(0.12, 0.24, 0.06), shard(), 0, -0.12 - k * 0.22, 0)); root.add(l); return l; });
  const orbit = new THREE.Group(); orbit.position.y = 1.4; root.add(orbit);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const m = mesh(new THREE.BoxGeometry(0.12, 0.18, 0.03), shard(), Math.cos(a) * 0.7, (rnd() - 0.5) * 0.6, Math.sin(a) * 0.7); orbit.add(m); }
  let ph = 0;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 7 : 2.5);
    legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(ph + i * Math.PI) * 0.6 : 0; });
    orbit.rotation.y += dt * 1.6; body.position.y = Math.sin(ph * 0.5) * 0.03;
  };
  return { root, body, legs, scale: 1, flash: mats(root), tick };
}

/** 钟首哨兵：青铜石甲构装体，脑袋是一口小钟，持长戟（v1.0.5） */
export function makeBellSentinel(): Rig {
  const L = lux('dlc1_bell_sentinel', { rig: 'H', height: 2.9, wave: 0, bob: 0, pbr: { roughness: 0.6, metalness: 0.4, emissive: 0x404040, emissiveK: 0.4 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const br = toon(0x5a6a4a, { emissive: new THREE.Color(0x061008) }), st = toon(0x3a4038), rust = toon(0x7a5a30);
  body.add(mesh(new THREE.BoxGeometry(1.1, 1.0, 0.7), br, 0, 1.6, 0));
  body.add(mesh(new THREE.BoxGeometry(0.9, 0.45, 0.6), st, 0, 0.98, 0));
  { const _m = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), rust, 0, 1.6, 0.36); _m.rotation.x = 0; body.add(_m); }
  { const m = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), rust, 0, 1.6, 0.36); m.rotation.x = Math.PI / 2; body.add(m); }
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.18 + 0.2 * t * t, 0.55 - t * 0.55)); }
  const bell = mesh(new THREE.LatheGeometry(prof, 16), br, 0, 2.12, 0); (bell.material as THREE.Material).side = THREE.DoubleSide; body.add(bell);
  body.add(mesh(new THREE.TorusGeometry(0.08, 0.03, 5, 10), br, 0, 2.72, 0));
  body.add(noOl(mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(0x40fff0, 3), 0, 2.2, 0.2)));
  for (let i = 0; i < 4; i++) body.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), rust, -0.45 + i * 0.3, 1.0, 0.32));   // 腰间小铃
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    { const pad = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.6), br, sd * 0.72, 2.1, 0); pad.rotation.z = sd * -0.25; body.add(pad); }
    const arm = new THREE.Group(); arm.position.set(sd * 0.72, 1.95, 0); body.add(arm);
    arm.add(mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), st, 0, -0.45, 0));
    arm.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), br, 0, -0.95, 0));
    if (sd > 0) {
      const h = new THREE.Group(); h.position.set(0, -0.95, 0.15); arm.add(h); weapon = h;
      h.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.2, 6), toon(0x3a2a1a), 0, 0.6, 0));
      { const ax = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.5), toon(0x6a6a68), 0, 1.95, 0.22); h.add(ax); }
      { const sp = mesh(new THREE.ConeGeometry(0.07, 0.5, 4), toon(0x6a6a68), 0, 2.45, 0); h.add(sp); }
    }
  });
  const legs = [-0.28, 0.28].map(x => { const l = new THREE.Group(); l.position.set(x, 0.85, 0); l.add(mesh(new THREE.BoxGeometry(0.34, 0.85, 0.36), st, 0, -0.42, 0)); l.add(mesh(new THREE.BoxGeometry(0.4, 0.16, 0.5), br, 0, -0.82, 0.06)); root.add(l); return l; });
  return { root, body, legs, weapon, scale: 1, flash: mats(root) };
}

/** 提灯蛾：苍白的大蛾子，腹部是一盏发光的提灯，扇着四片翅膀悬浮（v1.0.5） */
export function makeLanternMoth(): Rig {
  const L = lux('dlc1_lantern_moth', { rig: 'F翼', length: 2.2, wave: 0, bob: 0.06, pbr: { roughness: 0.8, emissive: 0x605040, emissiveK: 0.5 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const fur = toon(0xd8d0c0), wingM = toon(0xc8c0a8, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), brass = toon(0x6a5a30);
  body.position.y = 1.6;
  { const _m = mesh(new THREE.SphereGeometry(0.28, 10, 8), fur, 0, 0.3, 0); _m.scale.set(1, 1.2, 1); body.add(_m); }
  const head = mesh(new THREE.SphereGeometry(0.2, 10, 8), fur, 0, 0.62, 0.12); body.add(head);
  [-0.09, 0.09].forEach(x => { body.add(noOl(mesh(new THREE.SphereGeometry(0.06, 6, 4), toon(0x101010), x, 0.66, 0.28))); { const an = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.45, 4), fur, x * 1.6, 0.92, 0.2); an.rotation.set(-0.5, 0, x * 3); body.add(an); } });
  // 提灯腹部
  const lamp = new THREE.Group(); lamp.position.y = -0.2; body.add(lamp);
  { const _m = noOl(mesh(new THREE.SphereGeometry(0.3, 12, 10), glow(0x40f0e0, 2.2, { transparent: true, opacity: 0.9 }), 0, -0.25, 0)); _m.scale.set(1, 1.35, 1); lamp.add(_m); }
  for (let k = 0; k < 4; k++) { const rib = mesh(new THREE.TorusGeometry(0.31, 0.02, 4, 16, Math.PI), brass, 0, -0.25, 0); rib.rotation.y = k * Math.PI / 4; rib.scale.y = 1.35; lamp.add(rib); }
  { const _m = mesh(new THREE.ConeGeometry(0.12, 0.2, 6), brass, 0, -0.72, 0); _m.rotation.x = 0; lamp.add(_m); }
  const wings: THREE.Group[] = [];
  [-1, 1].forEach(sd => [0, 1].forEach(k => {
    const w = new THREE.Group(); w.position.set(sd * 0.18, 0.4 - k * 0.15, -0.05); body.add(w);
    const shape = new THREE.Mesh(new THREE.CircleGeometry(k ? 0.55 : 0.8, 12), wingM); shape.scale.set(1, 0.6, 1); shape.position.x = sd * (k ? 0.5 : 0.75); shape.rotation.y = Math.PI / 2 * 0; w.add(shape);
    w.userData.sd = sd; w.userData.k = k; wings.push(w);
  }));
  let ph = rnd() * 6;
  const tick = (dt: number, moving: boolean) => {
    ph += dt * (moving ? 14 : 9);
    wings.forEach(w => { w.rotation.y = (w.userData.sd as number) * (0.2 + Math.sin(ph + (w.userData.k as number) * 0.5) * 0.7); });
    body.position.y = 1.6 + Math.sin(ph * 0.25) * 0.15;
    lamp.rotation.z = Math.sin(ph * 0.2) * 0.15;
  };
  return { root, body, legs: [], scale: 1, flash: mats(root), tick };
}

/** 回响 · 腐根祭司：高大的半透明祭司幽灵，腐烂的神殿长袍挂满铃铛，持铃杖（v1.0.5） */
export function makeEchoPriest(): Rig {
  const E = eliteHd('dlc1_echo_priest'); if (E) return E;   // v1.2.73 绑骨显示件
  const L = lux('dlc1_echo_priest', { rig: 'H袍', height: 2.7, wave: 0.02, bob: 0.02, pbr: { roughness: 0.8, emissive: 0x40c8a0, emissiveK: 0.25 } }); if (L) return L;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const robe = ghost(0x3a5a4a, 0.85), skin = ghost(0x6ae8d8, 0.7), bellM = toon(0x7a6a3a), rope = toon(0x5a4a30);
  { const m = mesh(new THREE.ConeGeometry(0.75, 2.2, 10, 1, true), robe, 0, 1.15, 0); (m.material as THREE.Material).side = THREE.DoubleSide; body.add(m); }
  body.add(mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.7, 8), robe, 0, 2.3, 0));
  const head = new THREE.Group(); head.position.set(0, 2.85, 0.05); body.add(head);
  { const hood = mesh(new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), robe); hood.position.y = 0.05; head.add(hood); }
  head.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), skin));
  [-0.08, 0.08].forEach(x => head.add(noOl(mesh(new THREE.SphereGeometry(0.045, 6, 4), glow(0x80fff0, 3.5), x, 0.02, 0.19))));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const y = 0.6 + (i % 3) * 0.35; const r = 0.75 - y * 0.25; body.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), bellM, Math.cos(a) * r, y, Math.sin(a) * r)); }
  { const _m = mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 16), rope, 0, 1.95, 0); _m.rotation.x = 0; body.add(_m); }
  { const belt = mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 16), rope, 0, 1.95, 0); belt.rotation.x = Math.PI / 2; body.add(belt); }
  for (let i = 0; i < 6; i++) { const t = mesh(new THREE.BoxGeometry(0.12, 0.6 + rnd() * 0.4, 0.03), robe, (rnd() - 0.5) * 1.2, 0.2, (rnd() - 0.5) * 1.0); t.rotation.z = (rnd() - 0.5) * 0.4; body.add(t); }   // 破布条
  let weapon: THREE.Object3D | undefined;
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.38, 2.55, 0); arm.rotation.z = sd * (sd > 0 ? 0.2 : 0.9); body.add(arm);
    arm.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 7), robe, 0, -0.45, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), skin, 0, -0.95, 0));
    if (sd > 0) {
      const st = new THREE.Group(); st.position.set(0, -0.95, 0.1); arm.add(st); weapon = st;
      st.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.0, 6), toon(0x3a2a1a), 0, 0.5, 0));
      { const hook = mesh(new THREE.TorusGeometry(0.22, 0.04, 5, 12, Math.PI * 1.3), toon(0x3a2a1a), 0.1, 2.05, 0); st.add(hook); }
      const prof: THREE.Vector2[] = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.06 + 0.12 * t * t, -t * 0.28)); }
      const b = mesh(new THREE.LatheGeometry(prof, 12), bellM, 0.3, 1.95, 0); (b.material as THREE.Material).side = THREE.DoubleSide; st.add(b);
    }
  });
  const mist = noOl(mesh(new THREE.TorusGeometry(0.85, 0.08, 4, 20), glow(0x40e0c0, 1.3, { transparent: true, opacity: 0.45 }), 0, 0.06, 0)); mist.rotation.x = Math.PI / 2; root.add(mist);
  let ph = 0;
  const tick = (dt: number, moving: boolean) => { ph += dt * (moving ? 3 : 1.5); body.position.y = 0.12 + Math.sin(ph) * 0.08; mist.scale.setScalar(1 + Math.sin(ph * 1.3) * 0.12); body.rotation.z = moving ? Math.sin(ph * 2) * 0.04 : 0; };
  return { root, body, legs: [], weapon, scale: 1, flash: mats(root), tick };
}

/** 模型 id（WildDef.mobs[].model 里写这个） */
export const DLC1_MODELS: Record<string, () => unknown> = {
  dlc1_drowned: makeDrowned, dlc1_bellcrab: makeBellCrab, dlc1_siren: makeSiren, dlc1_echo_foreman: makeEchoForeman,
  dlc1_mirror_wraith: makeMirrorWraith, dlc1_bell_sentinel: makeBellSentinel, dlc1_lantern_moth: makeLanternMoth, dlc1_echo_priest: makeEchoPriest,
};
