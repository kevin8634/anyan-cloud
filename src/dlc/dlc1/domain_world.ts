// ======================================================================
// DLC1 钟楼领地 · 镜渊城里的 8 块地（v1.1.1）—— 程序化建筑，外观随状态变化
// 每块地：废墟（碎石 + 断墙）→ 建造中（木脚手架 + 金色进度环）→ 1 级主体 → 2 级加层 / 侧楼 → 3 级尖顶 + 旗帜 + 灯火
// 回响居民：入住后在所属建筑旁出现半透明青色身影（轻轻浮动）
// 选「断绳」或还没选的角色：整套隐藏（场景和以前一样）
// 性能：共享几何体 / 材质，没有额外光源（窗户用自发光材质），每 0.25 秒才检查一次状态
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { makeGlbScene } from '../../web/creatures_glb';
import { curQuality } from '../../web/gfx';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { runeCircle, mute } from './ground_marks';
import { BUILDINGS, RESIDENTS, type BId, domainOpen, lvOf, building, progress, domainState, dirty } from './domain';
import { flagWireOn, makeFlagCloth } from '../../web/field_flags';   // 11-17e 建筑旗换布料摆动（?off=flagwire）

const M = {
  stone: new THREE.MeshStandardMaterial({ color: 0x55636a, roughness: 0.85, flatShading: true }),
  stoneL: new THREE.MeshStandardMaterial({ color: 0x8a989c, roughness: 0.8, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e2d4, emissive: 0x2a2820, roughness: 0.75, flatShading: true }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3a5a70, roughness: 0.7, flatShading: true }),
  roofR: new THREE.MeshStandardMaterial({ color: 0x5a2a22, roughness: 0.7, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9a6c3c, roughness: 0.9, flatShading: true }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.75, roughness: 0.35 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd0a040, metalness: 0.8, roughness: 0.3, emissive: 0x3a2800, emissiveIntensity: 0.6 }),
  win: new THREE.MeshBasicMaterial({ color: 0xffc870 }),
  winC: new THREE.MeshBasicMaterial({ color: 0x8ff0ff }),
  fire: new THREE.MeshBasicMaterial({ color: 0xff8030 }),
  rubble: new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.95, flatShading: true }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
  prog: new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  progBg: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), cone: new THREE.ConeGeometry(0.5, 1, 4), cone8: new THREE.ConeGeometry(0.5, 1, 8),
  sph: new THREE.SphereGeometry(0.5, 10, 8), dome: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), pole: new THREE.CylinderGeometry(0.06, 0.06, 1, 5),
  ring: new THREE.RingGeometry(1.6, 1.9, 40), plot: new THREE.CircleGeometry(5.2, 28),
};
const flagMat = new Map<number, THREE.MeshStandardMaterial>();
const flagM = (c: number) => { let m = flagMat.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, side: THREE.DoubleSide, emissive: c, emissiveIntensity: 0.25 }); flagMat.set(c, m); } return m; };

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = ry; return o;
}
const box = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => mesh(G.box, m, x, y + sy / 2, z, sx, sy, sz, ry);
const cyl = (m: THREE.Material, x: number, y: number, z: number, r: number, h: number) => mesh(G.cyl, m, x, y + h / 2, z, r * 2, h, r * 2);
function windows(g: THREE.Group, w: number, d: number, y: number, n: number, m: THREE.Material = M.win) {
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * w / n; g.add(box(m, x, y, d / 2 + 0.02, 0.45, 0.6, 0.04)); g.add(box(m, x, y, -d / 2 - 0.02, 0.45, 0.6, 0.04)); }
}
/** 11-17e 旗子接线：中 / 高 / 超高每面旗都换布料摆动；低档每个建造档（组）只换第一面，其余仍是静态旗片（减量） */
const FLAG_LOW_PER_GROUP = 1;
function flag(g: THREE.Group, x: number, y: number, z: number, c: number, h = 3) {
  g.add(mesh(G.pole, M.wood, x, y + h / 2, z, 1, h, 1));
  const n = (g.userData.dmFlags as number | undefined) ?? 0;
  if (flagWireOn() && (curQuality !== 'low' || n < FLAG_LOW_PER_GROUP)) {
    g.userData.dmFlags = n + 1;
    const f = makeFlagCloth(1.0, 0.62, c, 'flag', 0.25); f.position.set(x + 0.05, y + h - 0.04, z); g.add(f);   // 旗杆边贴杆、旗顶贴杆顶
    return;
  }
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), flagM(c)); f.position.set(x + 0.47, y + h - 0.35, z); g.add(f);
}

/** 每种建筑三档：[1 级主体, 2 级增建, 3 级增建]（累计显示） */
function makeTiers(id: BId, c: number): [THREE.Group, THREE.Group, THREE.Group] {
  const a = new THREE.Group(), b = new THREE.Group(), d = new THREE.Group();
  switch (id) {
    case 'belfry': {
      // v1.2.48 比赛版：1 级主体换 Lux3D 无声钟楼（缩小版），2 / 3 级加石台基、旗帜和金顶；商用包 / 低画质仍是程序化方块钟楼
      const lux = 'scene_belltower' in PACK_CREATURE_GLB && curQuality !== 'low' ? makeGlbScene('scene_belltower', { h: 12 }) : null;
      if (lux) {
        a.add(lux); b.add(box(M.stone, 0, 0, 0, 7.2, 0.5, 7.2)); for (const [x, z] of [[-3, 3], [3, 3]]) b.add(cyl(M.stoneL, x, 0, z, 0.35, 2.2));
        d.add(mesh(G.sph, M.gold, 0, 12.4, 0, 0.6, 0.6, 0.6)); flag(d, 3.2, 0.5, 3.2, c, 4); flag(d, -3.2, 0.5, 3.2, c, 4);
        break;
      }
      a.add(box(M.stoneL, 0, 0, 0, 3.6, 6, 3.6)); windows(a, 3.6, 3.6, 3, 2, M.winC);
      for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) a.add(box(M.stone, x, 6, z, 0.5, 2.4, 0.5));
      a.add(box(M.roof, 0, 8.4, 0, 4, 0.4, 4));
      const bell = mesh(G.cone8, M.bronze, 0, 7.4, 0, 1.6, 1.6, 1.6); a.add(bell);
      b.add(box(M.stoneL, 0, 8.8, 0, 2.6, 2.4, 2.6)); windows(b, 2.6, 2.6, 9.8, 1, M.winC); b.add(box(M.stone, 0, 0, 0, 5, 0.6, 5));
      d.add(mesh(G.cone, M.roof, 0, 13, 0, 3.6, 3.6, 3.6, Math.PI / 4)); d.add(mesh(G.sph, M.gold, 0, 15, 0, 0.5, 0.5, 0.5));
      flag(d, 2.2, 0.6, 2.2, c); flag(d, -2.2, 0.6, 2.2, c);
      break;
    }
    case 'forge': {
      a.add(box(M.stone, 0, 0, 0, 4.2, 2.6, 3.2)); a.add(mesh(G.cone, M.roofR, 0, 3.3, 0, 6.2, 1.4, 4.6, Math.PI / 4));
      a.add(box(M.stoneL, 1.4, 0, -0.9, 0.9, 5, 0.9)); a.add(box(M.fire, 1.4, 5, -0.9, 0.6, 0.25, 0.6)); a.add(box(M.fire, 0, 0.3, 1.62, 1.4, 0.9, 0.05));
      a.add(box(M.bronze, -1.2, 0, 2.4, 0.9, 0.7, 0.45));
      b.add(box(M.stone, -3, 0, 0, 2, 2, 2.6)); b.add(mesh(G.cone, M.roofR, -3, 2.5, 0, 3, 1, 3.6, Math.PI / 4)); b.add(box(M.fire, -3, 0.4, 1.32, 0.9, 0.6, 0.05));
      d.add(box(M.stoneL, -0.4, 0, -0.9, 0.9, 6, 0.9)); d.add(box(M.fire, -0.4, 6, -0.9, 0.6, 0.25, 0.6)); flag(d, 2.6, 0, 1.8, c);
      break;
    }
    case 'academy': {
      a.add(box(M.white, 0, 0, 0, 4.4, 3, 4.4)); windows(a, 4.4, 4.4, 1.6, 3, M.winC);
      a.add(mesh(G.dome, M.roof, 0, 3, 0, 4.6, 3, 4.6));
      b.add(cyl(M.white, 0, 3, 0, 1.4, 1.6)); b.add(mesh(G.dome, M.gold, 0, 4.6, 0, 2.8, 1.8, 2.8));
      for (const x of [-1.6, -0.55, 0.55, 1.6]) b.add(cyl(M.stoneL, x, 0, 2.6, 0.22, 3));
      d.add(mesh(G.cone8, M.gold, 0, 6.4, 0, 0.4, 1.6, 0.4)); flag(d, -2.6, 0, 2.8, c); flag(d, 2.6, 0, 2.8, c);
      break;
    }
    case 'dock': {
      a.add(box(M.wood, 0, 0, 0, 2.4, 0.3, 8)); for (const z of [-3.5, -1, 1.5, 3.8]) { a.add(cyl(M.wood, -1.1, -0.5, z, 0.15, 1.2)); a.add(cyl(M.wood, 1.1, -0.5, z, 0.15, 1.2)); }
      const boat = new THREE.Group(); boat.add(box(M.wood, 0, 0, 0, 1.3, 0.5, 3.4)); boat.add(mesh(G.pole, M.wood, 0, 1.6, 0, 1, 2.8, 1)); boat.position.set(2.4, 0, 1); a.add(boat);
      a.add(box(M.wood, -1.6, 0, -3.8, 1.6, 1.8, 1.6)); a.add(box(M.win, -1.6, 0.9, -2.98, 0.4, 0.5, 0.04));
      b.add(mesh(G.pole, M.wood, -1, 2.5, 3.6, 1.6, 5, 1.6)); b.add(mesh(G.pole, M.wood, 0.2, 4.8, 3.6, 1.2, 2.6, 1.2)); b.children[1].rotation.z = Math.PI / 2;
      b.add(box(M.wood, -2.6, 0, 0, 1.6, 1.4, 1.4));
      const boat2 = boat.clone(); boat2.position.set(-2.6, 0, 3); d.add(boat2);
      for (const z of [-3.6, 0, 3.8]) { d.add(mesh(G.pole, M.wood, 1.2, 1, z, 1, 2, 1)); d.add(mesh(G.sph, M.win, 1.2, 2.05, z, 0.3, 0.3, 0.3)); }
      flag(d, -1.2, 0.3, -2.6, c);
      break;
    }
    case 'sanctum': {
      a.add(box(M.white, 0, 0, 0, 3.6, 3.4, 5)); a.add(mesh(G.cone, M.roof, 0, 4.2, 0, 5, 1.6, 7, Math.PI / 4));
      a.add(mesh(new THREE.CircleGeometry(0.7, 16), M.win, 0, 2.5, 2.52)); a.add(box(M.win, 0, 0, 2.52, 0.9, 1.6, 0.04));
      b.add(box(M.white, 0, 0, -3.2, 2, 5.6, 2)); b.add(mesh(G.cone, M.roof, 0, 6.4, -3.2, 2.8, 1.6, 2.8, Math.PI / 4)); b.add(box(M.win, 0, 4, -2.18, 0.4, 0.8, 0.04));
      d.add(mesh(G.cone8, M.gold, 0, 7.6, -3.2, 0.25, 1.2, 0.25)); d.add(box(M.gold, 0, 8.1, -3.2, 0.7, 0.12, 0.12));
      for (const x of [-2.4, 2.4]) { d.add(mesh(G.pole, M.stoneL, x, 0.8, 3.2, 1.4, 1.6, 1.4)); d.add(mesh(G.sph, M.win, x, 1.7, 3.2, 0.35, 0.35, 0.35)); }
      break;
    }
    case 'market': {
      const stall = (x: number, z: number, col: number) => { const s = new THREE.Group(); s.add(box(M.wood, 0, 0, 0, 1.8, 0.9, 1)); for (const [px, pz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) s.add(mesh(G.pole, M.wood, px, 1.1, pz, 1, 2.2, 1)); const aw = mesh(G.cone, flagM(col), 0, 2.4, 0, 2.8, 0.6, 1.8, Math.PI / 4); s.add(aw); s.position.set(x, 0, z); return s; };
      a.add(stall(-2, 0, 0xc04040)); a.add(stall(1.2, -1, 0xd0a030));
      b.add(stall(1.6, 2, 0x3070c0)); b.add(stall(-2.2, 2.6, 0x40a060));
      for (let i = 0; i < 5; i++) { d.add(mesh(G.sph, M.win, -3 + i * 1.5, 2.9, -2.2 + (i % 2) * 0.4, 0.32, 0.32, 0.32)); }
      d.add(mesh(G.pole, M.wood, -3.4, 1.5, -2.2, 1, 3, 1)); d.add(mesh(G.pole, M.wood, 3.4, 1.5, -2.2, 1, 3, 1)); flag(d, 3.6, 0, 3, c);
      break;
    }
    case 'training': {
      for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) a.add(mesh(G.pole, M.wood, x, 0.6, z, 2, 1.2, 2));
      a.add(box(M.wood, 0, 0.9, -3.5, 7, 0.12, 0.12)); a.add(box(M.wood, 0, 0.9, 3.5, 7, 0.12, 0.12)); a.add(box(M.wood, -3.5, 0.9, 0, 0.12, 0.12, 7));
      const dummy = (x: number, z: number) => { const g2 = new THREE.Group(); g2.add(mesh(G.pole, M.wood, 0, 0.9, 0, 1.6, 1.8, 1.6)); g2.add(cyl(M.wood, 0, 1.0, 0, 0.32, 0.9)); g2.add(mesh(G.sph, M.wood, 0, 2.1, 0, 0.4, 0.4, 0.4)); g2.add(box(M.wood, 0, 1.6, 0, 1.2, 0.12, 0.12)); g2.position.set(x, 0, z); return g2; };
      a.add(dummy(-1.2, 0)); b.add(dummy(1.2, -1)); b.add(dummy(1.4, 1.6)); b.add(box(M.wood, 3.5, 0.9, 0, 0.12, 0.12, 7));
      b.add(box(M.stone, -2.6, 0, 2.4, 1.2, 1, 0.8));
      flag(d, -3.5, 0, -3.5, c, 4); flag(d, 3.5, 0, -3.5, c, 4); d.add(mesh(G.cone8, M.bronze, 0, 3.4, -3.5, 1, 1, 1)); d.add(box(M.wood, 0, 3.9, -3.5, 2, 0.15, 0.15)); d.add(mesh(G.pole, M.wood, -1, 2, -3.5, 1, 4, 1)); d.add(mesh(G.pole, M.wood, 1, 2, -3.5, 1, 4, 1));
      break;
    }
    case 'archive': {
      a.add(cyl(M.stoneL, 0, 0, 0, 2, 4)); for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; const w = box(M.win, Math.cos(t) * 2.02, 2, Math.sin(t) * 2.02, 0.4, 0.7, 0.05); w.lookAt(0, 2.35, 0); a.add(w); }
      a.add(mesh(G.cone8, M.roof, 0, 4.8, 0, 4.8, 1.6, 4.8));
      b.add(cyl(M.stoneL, 0, 4, 0, 1.3, 2.4)); b.add(mesh(G.cone8, M.roof, 0, 7, 0, 3.2, 1.6, 3.2)); b.add(box(M.stone, 2.6, 0, 0, 1.6, 2.2, 2.4));
      for (let i = 0; i < 4; i++) b.add(box(M.wood, 2.6, 0.2 + i * 0.45, 1.25, 1.2, 0.3, 0.08));
      d.add(mesh(G.cone8, M.gold, 0, 8.4, 0, 0.3, 1.4, 0.3)); flag(d, -2.4, 0, 1.6, c); flag(d, 2.4, 0, -2, c);
      for (let i = 0; i < 4; i++) { const t = i / 4 * Math.PI * 2 + 0.4; d.add(mesh(G.sph, M.winC, Math.cos(t) * 1.32, 5.2, Math.sin(t) * 1.32, 0.25, 0.25, 0.25)); }
      break;
    }
  }
  return [a, b, d];
}
function makeRuin(seed: number): THREE.Group {
  const g = new THREE.Group(); let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 7; i++) g.add(box(M.rubble, (r() - 0.5) * 6, 0, (r() - 0.5) * 6, 0.6 + r() * 1.2, 0.3 + r() * 0.6, 0.6 + r() * 1.2, r() * 3));
  g.add(box(M.stone, -1.8, 0, -1.6, 2.4, 1.6 + r() * 1.4, 0.4, 0.2)); g.add(box(M.stone, 1.6, 0, 0.8, 0.4, 1 + r(), 2, 0));
  return g;
}
function makeScaffold(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) g.add(mesh(G.pole, M.wood, x, 2.5, z, 1.4, 5, 1.4));
  for (const y of [1.6, 3.2, 4.8]) { g.add(box(M.wood, 0, y, -2.4, 5, 0.1, 0.25)); g.add(box(M.wood, 0, y, 2.4, 5, 0.1, 0.25)); g.add(box(M.wood, -2.4, y, 0, 0.25, 0.1, 5)); g.add(box(M.wood, 2.4, y, 0, 0.25, 0.1, 5)); }
  g.add(box(M.stoneL, 0.6, 0, 0.4, 1.4, 0.7, 1));
  return g;
}
function makeGhost(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(G.cone8, M.ghost, 0, 0.75, 0, 0.8, 1.5, 0.8)); g.add(mesh(G.sph, M.ghost, 0, 1.7, 0, 0.42, 0.42, 0.42));
  return g;
}

interface Plot { id: BId; root: THREE.Group; ruin: THREE.Group; scaf: THREE.Group; tiers: THREE.Group[]; ring: THREE.Mesh; ringBg: THREE.Mesh; glow: THREE.Mesh }
const plots: Plot[] = [];
const ghosts: { id: string; g: THREE.Group; home: BId; ox: number; oz: number; ph: number }[] = [];
let builtFor = -1, lastVer = -1, acc = 0, time = 0, wasOpen = false;

/** 镜渊城造景时调用（mirror.ts build） */
export function domainBuild(api: WildBuildApi) {
  plots.length = 0; ghosts.length = 0;
  BUILDINGS.forEach((b, i) => {
    const root = new THREE.Group(); root.name = 'dm_plot_' + b.id;
    // 地块标识：比赛版（非低画质）= 地面刻痕圆 + 断续微光符文（建筑色降饱和）；Q 版 = 原来的淡色圆盘
    const realPad = 'scene_belltower' in PACK_CREATURE_GLB && curQuality !== 'low';
    if (realPad) root.add(runeCircle(5.2, b.color, 101 + i * 17, 0.1, 22));
    else { const pad = new THREE.Mesh(G.plot, new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.12, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.06; root.add(pad); }
    const ruin = makeRuin(17 + i * 31), scaf = makeScaffold(), tiers = makeTiers(b.id, b.color);
    root.add(ruin, scaf, ...tiers);
    const ringBg = new THREE.Mesh(G.ring, M.progBg); ringBg.position.y = 6.4; ringBg.rotation.x = -Math.PI / 2; root.add(ringBg);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40, 1, Math.PI / 2, 0.001), M.prog); ring.position.y = 6.42; ring.rotation.x = -Math.PI / 2; root.add(ring);
    const glow = mesh(G.sph, new THREE.MeshBasicMaterial({ color: realPad ? mute(b.color, 0.5, 0.5) : b.color, transparent: true, opacity: realPad ? 0.12 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.2, 0, 10, 0.4, 10); root.add(glow);
    api.add(root, b.plot.x, b.plot.z, 0);
    plots.push({ id: b.id, root, ruin, scaf, tiers, ring, ringBg, glow });
  });
  RESIDENTS.forEach((r, i) => {
    const b = BUILDINGS.find(x => x.id === r.home)!;
    const a = i * 2.4, g = makeGhost(), ox = Math.cos(a) * 5.6, oz = Math.sin(a) * 5.6;
    api.add(g, b.plot.x + ox, b.plot.z + oz, -a);
    ghosts.push({ id: r.id, g, home: r.home, ox, oz, ph: i });
  });
  builtFor++; lastVer = -1;
  refresh();
}
let lastQ = '';
function refresh() {
  const open = domainOpen() && !!domainState().on;
  for (const p of plots) {
    p.root.visible = open;
    if (!open) continue;
    const l = lvOf(p.id), q = building(p.id);
    p.ruin.visible = l === 0 && !q;
    p.scaf.visible = !!q;
    p.tiers.forEach((t, i) => { t.visible = i < l; });
    p.ring.visible = p.ringBg.visible = !!q;
    p.glow.visible = l >= 3;
  }
  const res = new Set(domainState().res);
  for (const g of ghosts) g.g.visible = open && res.has(g.id);
  wasOpen = open;
}
/** 每帧（manifest.update）：状态版本变了 / 建造中 → 刷新显隐与进度环；身影浮动 */
export function domainWorldUpdate(dt: number, inCity: boolean) {
  if (!plots.length || !inCity) return;
  time += dt;
  if ((acc += dt) >= 0.25) {
    acc = 0;
    const open = domainOpen() && !!domainState().on;
    const qk = Object.keys(domainState().q).join(',');
    if (dirty !== lastVer || open !== wasOpen || qk !== lastQ) { lastVer = dirty; lastQ = qk; refresh(); }
    for (const p of plots) {
      if (!p.ring.visible) continue;
      const k = progress(p.id);
      p.ring.geometry.dispose(); p.ring.geometry = new THREE.RingGeometry(1.6, 1.9, 40, 1, Math.PI / 2, -Math.max(0.001, k * Math.PI * 2));
    }
  }
  for (const g of ghosts) if (g.g.visible) { g.g.children.forEach(c => { c.position.y = (c === g.g.children[0] ? 0.75 : 1.7) + 0.15 + Math.sin(time * 1.6 + g.ph) * 0.15; }); }
}
export const domainWorldDebug = () => ({ plots: plots.length, built: builtFor, visible: plots.filter(p => p.root.visible).length, ghosts: ghosts.filter(g => g.g.visible).length,
  tiers: Object.fromEntries(plots.map(p => [p.id, p.tiers.filter(t => t.visible).length])), scaf: plots.filter(p => p.scaf.visible).map(p => p.id) });
