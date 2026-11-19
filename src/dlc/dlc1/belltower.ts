// ======================================================================
// DLC1 无声钟楼（38–40 级，第九章「再鸣 / 断绳」）—— v1.1.0（d1.7）
// 概念图：项目根 c_d17_belltower.png / c_d17_sleeper_ab.png / c_d17_crossroads_ui.png
// 一座从地底之海里长出来的铜石钟楼：钟楼脚下营地 → 五层守钟者（5 个首领）→ 顶层抉择之钟（9-3 岔路口）→ 地窖沉眠者（A / B 两版）
// 区域机制「无声」：钟楼里每 45 秒一次「死寂」——静默修士和断绳回响短暂狂躁（喊话提示），站在安魂钟旁边可以免疫
// 首领通过 PackCtx.spawnBoss 生成（本体 BossBrain：红圈 / 读条 / 召唤 / 毒池 / 阶段 + 首领框）
// ======================================================================
import { requiem, ropeSnap } from './sfx_kit';   // v1.2.9
import { BELL_SET_PIECES, DARK_BY_CLASS, BT_SET_CHANCE, BT_DARK_CHANCE } from './gear40';   // v1.2.8
import * as THREE from 'three';
import { sceneOr, sceneHang } from './lux_dlc';
import { curQuality } from '../../web/gfx';
import { btFlora } from './bt_flora';
import { btClimateTick } from './bt_climate';   // 11-14d 钟楼气候收尾
import type { PackCtx, PackWaypoint, WildBuildApi, PackBossDef } from '../../core/ContentPacks';
import type { BossDef } from '../../core/BossBrain';
import { dlcMob } from './coast';
import { bellGeo } from './models_bt';
import { fateChoice, fateBanner, openFateUI, fateUiOpen, showEnding, btState, closeFateUI } from './fate';
import { s40SleeperChance, s40Roll, S40_DROP } from './sets40';
import { campDressFor, campDressBind } from './plaza_dress';
import { basinLake, btLakeDepth, BT_LAKE } from './bt_basin';
import { IOLA_NPC } from './iola_def';   // 11-18 与沉钟海岸同一份伊奥拉
const BT_IOLA_OLD = (() => { try { return /[?&]off=[^&]*\bbtiola\b/.test(location.search); } catch { return false; } })();
import { waterRipple } from './water_fx';
import { w2Splash } from '../../web/water2';   // 11-17 水体 v2：涉水水花
import { btGround, BT_ROOMS, BT_FLATS, BT_L, BT_HALF, basinMist, floatingShards, wreckBell, soulBase, rimPoints } from './bt_basin';   // 11-14 环形山盆地

export const BT_ID = 'dlc1_belltower';
export const BT_O = { x: 2400, z: -1800 };

// ---------------------------------------------------------------- 造景
const stone = (c = 0x2a2c30) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, flatShading: true });
const bronzeM = () => new THREE.MeshStandardMaterial({ color: 0x7a5e2c, metalness: 0.75, roughness: 0.42, emissive: 0x0a1612, emissiveIntensity: 0.4 });
function towerCore(): THREE.Group {
  // 钟楼主体：五层收分的八角石塔，层间铜檐，塔顶挂一口裂开的无舌巨钟
  const g = new THREE.Group(), st = stone(0x26282c), br = bronzeM();
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const r = 9 - i * 1.4, h = 7 - i * 0.6;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 8), st); seg.position.y = y + h / 2; seg.castShadow = true; g.add(seg);
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.12, 0.5, 8), br); eave.position.y = y + h; g.add(eave);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.2), new THREE.MeshBasicMaterial({ color: i === 4 ? 0xff5040 : 0x60e0f0 })); w.position.set(Math.cos(a) * r * 0.93, y + h * 0.55, Math.sin(a) * r * 0.93); w.lookAt(0, w.position.y, 0); g.add(w); }
    y += h + 0.5;
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.45, 6, 16, Math.PI), st); arch.position.y = y + 0.2; g.add(arch);
  const bell = new THREE.Mesh(bellGeo(2.6, 4.2, 24), br); (bell.material as THREE.Material).side = THREE.DoubleSide; bell.position.y = y - 0.8; bell.rotation.z = 0.05; g.add(bell);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3040 })); crack.position.set(1.0, y + 1.2, 2.0); crack.rotation.z = 0.3; g.add(crack);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 8), st); spire.position.y = y + 6.4; g.add(spire);
  return g;
}
function crossBell(): THREE.Group {
  // 两根石柱 + 横梁，梁下挂一口裂开的铜钟；钟口一半映红、一半映青
  const g = new THREE.Group(), st = stone(0x34343a), br = bronzeM();
  [-5, 5].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), st); p.position.set(x, 5.5, 0); p.castShadow = true; g.add(p); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12.4, 1.1, 1.6), st); beam.position.y = 11.3; g.add(beam);
  const bell = new THREE.Mesh(bellGeo(2.2, 3.4, 24), br); (bell.material as THREE.Material).side = THREE.DoubleSide; bell.position.y = 7.2; g.add(bell);
  const cr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3040 })); cr.position.set(0.7, 8.6, 1.75); cr.rotation.z = 0.35; g.add(cr);
  const lr = new THREE.PointLight(0xff3040, 8, 14); lr.position.set(-3, 4, 0); g.add(lr);
  const lc = new THREE.PointLight(0x40e0f0, 8, 14); lc.position.set(3, 4, 0); g.add(lc);
  return g;
}
function arena(r: number, col: number): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, 0.3, 28), stone(0x4a4a52)); disc.position.y = 0.05; disc.receiveShadow = true; g.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.4, 0.08, 4, 48), new THREE.MeshBasicMaterial({ color: col })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.6 + (k % 2), 6), stone(0x3a3c42)); p.position.set(Math.cos(a) * (r + 0.6), 1.3, Math.sin(a) * (r + 0.6)); g.add(p); }
  return g;
}
function fallenBell(s: number): THREE.Group {
  const g = new THREE.Group(); const b = new THREE.Mesh(bellGeo(0.9, 1.4, 18), bronzeM()); (b.material as THREE.Material).side = THREE.DoubleSide; b.scale.setScalar(s); g.add(b);
  const glowR = new THREE.Mesh(new THREE.CircleGeometry(1.6 * s, 20), new THREE.MeshBasicMaterial({ color: 0x40e0f0, transparent: true, opacity: 0.35, depthWrite: false })); glowR.rotation.x = -Math.PI / 2; glowR.position.y = 0.05; g.add(glowR);
  return g;
}
function anchorPillar(): THREE.Group {
  const g = new THREE.Group(), st = stone(0x2a2a30);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 6, 6), st); p.position.y = 3; g.add(p);
  for (let k = 0; k < 8; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6a5228, metalness: 0.6, roughness: 0.5 })); l.position.set(0, 5.6 + k * 0.32, 0.9 + k * 0.4); l.rotation.y = k % 2 ? Math.PI / 2 : 0; g.add(l); }
  return g;
}
function hangingChain(len: number): THREE.Group {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x4a4038, metalness: 0.6, roughness: 0.6 });
  for (let k = 0; k < len; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 4, 8), m); l.position.y = -k * 0.42; l.rotation.y = k % 2 ? Math.PI / 2 : 0; g.add(l); }
  return g;
}
function stairs(n: number): THREE.Group {
  const g = new THREE.Group(), st = stone(0x34363c);
  for (let k = 0; k < n; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 1.1), st); s.position.set(0, 0.12 + (k % 2) * 0.06, -k * 1.15); g.add(s); }
  return g;
}

/** 首领位置（局部） */
export const BT_ARENAS = {   // 11-14b 面积 ×2：坐标改从 bt_basin.ts BT_L 取
  b1: { ...BT_L.b1, r: 9 }, b2: { ...BT_L.b2, r: 9 }, b3: { ...BT_L.b3, r: 9 }, b4: { ...BT_L.b4, r: 9 },
  cross: { ...BT_L.cross, r: 6 }, b5: { ...BT_L.b5, r: 9 }, sleeper: { ...BT_L.sleeper, r: 11 },
};
/** 安魂钟 / 锚柱（A 线安魂、B 线斩绳都在这三处；站在旁边免疫「死寂」） */
export const BT_SOULS = [BT_L.soul1, BT_L.soul2, BT_L.soul3];

function build(api: WildBuildApi) {
  campDressFor(api, BT_WILD as unknown as Parameters<typeof campDressFor>[1], { noBrazier: true, fireRedo: !/(?:[?&]off=[^&]*\bbtfire\b)/.test(location.search) });   // 11-18 21:10 Rhett：营地篝火（含上面的光）整个删掉，重放 DLC 篝火；?off=btfire 回旧   // 11-17 Rhett「无声钟楼营地篝火上面的去掉」：门外火盆夜里只见悬空火焰，钟楼脚下营地不放火盆   // fix1107（Rhett 10:22）：营地换倒钟广场样式（地坪 / 篝火 / 火盆 / 拾荒营场景件）
  const A = BT_ARENAS;
  // 钟楼主体（地标）立在西北角；顶层抉择点上方另挂一口「抉择之钟」
  api.add(sceneOr('scene_belltower', { h: 46 }, towerCore, { emissiveK: 1.5 }), BT_L.tower.x, BT_L.tower.z);   // v1.2.45 Lux3D 钟楼主体（概念图 C3）
  api.add((() => { const g = sceneOr('scene_gatebell', { h: 13 }, crossBell, { emissiveK: 1.6 }); if (g.userData.luxScene) { const lr = new THREE.PointLight(0xff3040, 8, 14); lr.position.set(-3, 4, 0); const lc = new THREE.PointLight(0x40e0f0, 8, 14); lc.position.set(3, 4, 0); g.add(lr, lc); } return g; })(), BT_ARENAS.cross.x, BT_ARENAS.cross.z);   // v1.2.45 Lux3D 门架裂钟
  // 11-14 Rhett「BOSS 区不画圈」：地面圆盘 + 色环 + 六根桩 → 各层主题「房间」（地形已在 btGround 里压平）
  (['b1', 'b2', 'b3', 'b4', 'b5', 'sleeper'] as const).forEach(k => api.add(BT_ROOMS[k](A[k].r), A[k].x, A[k].z));
  // 顶层抉择点：一圈暗红 + 冷青双色的地纹
  const cr = new THREE.Group();
  const d1 = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 40, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff3040, side: THREE.DoubleSide }));
  const d2 = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 40, 1, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0x40e0f0, side: THREE.DoubleSide }));
  [d1, d2].forEach(d => { d.rotation.x = -Math.PI / 2; d.position.y = 0.08; cr.add(d); });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.3, 32), stone(0x2a2830)); plate.position.y = 0.04; cr.add(plate);
  api.add(cr, A.cross.x, A.cross.z);
  // 11-14：平地台阶块 → 地形坡道（盆地阶梯台地自带）；盆地布景
  { const m = basinMist(); m.position.y = BT_LAKE.on ? BT_LAKE.y + 0.35 - api.groundY(0, -10) : 1.0; api.add(m, 0, -10); }   // 11-16 有湖：雾贴着湖面
  { const L = basinLake(curQuality === 'low'); lakeMesh = L?.mesh ?? null; if (L) { L.mesh.position.y -= api.groundY(L.cx, L.cz); api.add(L.mesh, L.cx, L.cz); } }   // 11-16 真湖   // 中心地面 ≈ -5.4，雾层压在台地间
  api.add(floatingShards(curQuality === 'low' ? 6 : 14), 0, 0);
  btFlora(api);   // 11-14 写实草木（flora_hd）
  api.add((() => { const g = sceneOr('scene_bell', { w: 17 }, wreckBell, { emissiveK: 1.4 }); if (g.userData.luxScene) g.position.y = -1.4; return g; })(), BT_L.wreck.x, BT_L.wreck.z, -0.5);   // 11-14d Rhett：钟改用已有模型（原程序钟作低画质回退）
  BT_SOULS.forEach(p => api.add(soulBase(), p.x, p.z));
  // 落下的安魂钟 / 锚柱
  BT_SOULS.forEach((p, i) => { api.add((() => { const k = 1.2 + i * 0.15; const g = sceneOr('scene_bell', { w: 3.2 * k }, () => fallenBell(k)); if (g.userData.luxScene) { g.position.y = -0.2; const gl = new THREE.Mesh(new THREE.CircleGeometry(1.8 * k, 20), new THREE.MeshBasicMaterial({ color: 0x40e0f0, transparent: true, opacity: 0.35, depthWrite: false })); gl.rotation.x = -Math.PI / 2; gl.position.y = 0.25; g.add(gl); } return g; })(), p.x, p.z, i); api.add(anchorPillar(), p.x + 4, p.z - 2); });
  // 穹顶垂下的断链
  let s = 23; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const [x, z] of rimPoints(16)) { const n = 12 + Math.floor(r() * 16); const c = sceneHang('scene_chain', { h: n * 0.42 * 1.15 }, () => hangingChain(n)); c.position.y = 18 + r() * 6; api.add(c, x, z); }   // 11-14 断链从环形山顶垂下
  // 碎钟片 / 断柱
  for (let i = 0; i < 26; i++) { const x = (r() - 0.5) * 200, z = (r() - 0.5) * 200; if (Math.abs(x) < 12 || BT_FLATS.some(f => Math.hypot(x - f.x, z - f.z) < f.R + 2)) continue; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 2 + r() * 4, 6), stone(0x34383c)); c.position.y = 1.2; api.add(c, x, z, r() * 3); }
}

export const BT_WILD = {
  id: BT_ID, name: '无声钟楼', levels: [38, 40], minLevel: 37, desc: '钟楼脚下 · 五层守钟者 · 顶层抉择之钟 · 沉眠者地窖（死寂：每 45 秒钟楼里的回响狂躁一次，站在安魂钟旁边可以免疫）',
  origin: BT_O, half: BT_HALF, inner: 92,   // 11-14b 90 → 128（面积约 ×2）
  groundAdd: btGround,   // 11-14 环形山盆地（bt_basin.ts）
  worldNode: { x: 0.5, y: 0.79 }, sandIcon: '无声钟楼',
  // v1.2.39b 还没解锁的首领也在区域地图上标出来（敲响抉择之钟后才出现）
  mapBosses: () => fateChoice() !== null ? [] : [
    { name: '回响 · 熔心君王瓦尔卡兹', x: BT_ARENAS.b5.x, z: BT_ARENAS.b5.z, level: 40, state: '敲响抉择之钟后出现' },
    { name: '沉眠者', x: BT_ARENAS.sleeper.x, z: BT_ARENAS.sleeper.z, level: 40, state: '敲响抉择之钟后出现（随选择而变）' },
  ],
  palette: { sky: 0x1a1622, fog: 0x231c2a, fogNear: 40, fogFar: 210, hemi: 0xc0d4e0, ground: 0x1c1a22, hemiI: 1.55, sun: 1.9, sunColor: 0xd0ecff,
    tA: 0x4a4852, tB: 0x34323a, path: 0x5a5860, cliff: 0x16161a, tex: ['rock', 'dirt', 'rock'], map: ['#2a2232', '#0e0c12'], grass: 0, music: 'bell' },
  scatter: [
    { kind: 'mesa', n: 34, r: 3.4, s: [1.2, 2.4], color: 0x101014, edge: true },
    { kind: 'obsidian', n: 50, r: 0.9, s: [0.6, 1.6], color: 0x24222a },
    { kind: 'rock', n: 44, r: 0.9, s: [0.5, 1.2], color: 0x2e2e34 },
  ],
  camps: [{ id: 'bt_camp', name: '钟楼脚下', ...BT_L.camp, r: 13, main: true, waypoint: BT_L.waypoint }],   // 11-14 Rhett 图三：传送阵压在栅栏上 → 沿径向挪进营地空地（离栅栏 ≥ 3.2 米）,
  gates: [{ to: 'dlc1_mirror', ...BT_L.mirrorGate, name: '回镜渊城的倒悬阶梯', arrive: BT_L.mirrorArrive }],
  // v1.2.16 40 级副本「钟铜熔炉」入口（forge.ts FORGE_GATE_BT 同一个位置）
  dungeonGates: [{ id: 'dlc1_forge_dg', name: '钟铜熔炉', ...BT_L.forgeGate, opens: '', desc: '40 级副本 · 3 个首领 · 四难度' }],
  spots: {
    bt_gate: { x: 4, z: 78, r: 14, name: '无声钟楼入口' }, bt_cloister: { x: -2, z: 60, r: 40, name: '静默回廊' },
    bt_l1: { ...BT_L.b1, r: 13, name: '第一层 · 铸钟台' }, bt_l2: { ...BT_L.b2, r: 13, name: '第二层 · 缄默堂' }, bt_l3: { ...BT_L.b3, r: 13, name: '第三层 · 断绳廊' },
    bt_l4: { ...BT_L.b4, r: 13, name: '第四层 · 金沙厅' }, bt_crossroads: { ...BT_L.cross, r: 5, name: '钟楼顶层 · 抉择之钟' },
    bt_l5: { ...BT_L.b5, r: 13, name: '沉眠者之门' }, bt_crypt: { ...BT_L.sleeper, r: 15, name: '沉眠者地窖' },
    bt_soul1: { ...BT_L.soul1, r: 5, name: '西侧安魂钟 · 锚柱' }, bt_soul2: { ...BT_L.soul2, r: 5, name: '东侧安魂钟 · 锚柱' }, bt_soul3: { ...BT_L.soul3, r: 5, name: '北侧安魂钟 · 锚柱' },
    bt_rope: { x: 72, z: -26, r: 34, name: '断绳回响徘徊处' },
    // v1.1.2 渊噬之躯（9B-4..6）：r = 0 走不进去，由渊噬之躯系统达成条件时推进
    ab_q_devour: { ...BT_L.camp, r: 0, name: '任意地点' }, ab_q_mut: { ...BT_L.camp, r: 0, name: '渊噬之躯 · 变异' },
    ab_q_form: { ...BT_L.camp, r: 0, name: '任意地点' }, ab_q_eat: { ...BT_L.camp, r: 0, name: '任意地点' },
  },
  killArea: { bt_monk: 'bt_cloister', bt_wraith: 'bt_rope', bt_puppet: 'bt_l1', bt_b1: 'bt_l1', bt_b2: 'bt_l2', bt_b3: 'bt_l3', bt_b4: 'bt_l4', bt_b5: 'bt_l5', bt_sleeper_a: 'bt_crypt', bt_sleeper_b: 'bt_crypt' },
  paths: [[[4, 121], [4, 92], [-2, 68], [-6, 46], [2, 14], [8, -18], [0, -36], [-4, -52], [6, -80], [8, -101]], [[-6, 46], [-30, 34], [-62, 14]], [[-6, 46], [26, 28], [66, 2]], [[-62, 14], [-80, -10], [-88, -38]], [[66, 2], [80, -20], [86, -48]], [[6, -80], [30, -94], [50, -98]], [[4, 92], [-24, 86], [-46, 74]], [[-62, 14], [-34, -24], [-4, -52]], [[66, 2], [40, -10], [8, -18]]],
  decor: [
    { kind: 'tent', x: -3, z: 88, v: 0x3a2a3a }, { kind: 'fire', ...BT_L.camp }, { kind: 'crate', x: -5, z: 96 },
    { kind: 'banner', x: 0, z: 82, v: 0x40d0d0 }, { kind: 'banner', x: 8, z: 82, v: 0xd04050 },
    // fix1107（Rhett 10:28：新地图两个副本没有入口）：钟铜熔炉 / 潮渊钟井的门只在 dungeonGates 里登记了交互，没摆传送阵造景 → 补上；钟井是长副本，门 2 倍大
    { kind: 'dgate', ...BT_L.forgeGate, v: 0xff8a30 },   // 11-14 Rhett 图四：东侧 2 倍「长门」（原为钟井副本群预留，钟井入口已改在井口）不用了，删掉
  ],
  npcs: [
    // 11-18 Rhett「把无声钟楼的伊奥拉删除，重新复制一个沉钟海岸的过来」：与沉钟海岸同一份定义（iola_def IOLA_NPC），id / 站位 / 台词不变（9 章任务按 iola_b 交接）；?off=btiola 回旧写法
    BT_IOLA_OLD ? { id: 'iola_b', name: '伊奥拉', title: '最后的敲钟人 · 回响', role: 'quest', x: 9, z: 85, yaw: Math.PI, model: 'Mage@mr_iola', tint: 0x2a4a7a, tintK: 0.5, idle: '钟楼一共五层。我小时候偷偷爬到过第三层——再往上，师父就不让了。' }
      : { ...IOLA_NPC, id: 'iola_b', x: 9, z: 85, idle: '钟楼一共五层。我小时候偷偷爬到过第三层——再往上，师父就不让了。' },
    { id: 'charon_b', name: '卡戎', title: '被放逐的鸣钟人学者', role: 'quest', x: -1, z: 85, yaw: Math.PI, model: 'Mage@mr_charon', tint: 0x1a2a4a, tintK: 0.55, idle: '一千年。一千年都在哄一个怪物睡觉。你不累吗？' },
    { id: 'bt_ren', name: '仁', title: '钟楼脚下 · 补给商（回响）', role: 'supply', x: 15, z: 92, yaw: -Math.PI / 2, model: 'Rogue@mr_ren', tint: 0x3a3a4a, tintK: 0.45, idle: '这里的东西都很旧了，可还能用。和钟一样。' },
  ],
  mobs: {
    bt_monk: dlcMob('静默修士', 38, 'dlc1_silent_monk', { hp: 3900, speed: 3.6 }),
    bt_wraith: dlcMob('断绳回响', 39, 'dlc1_rope_wraith', { ranged: true, range: 11, aggro: 13, interval: 2.2, shot: { color: 0x60f0ff, el: 'arcane' } }),
    bt_puppet: dlcMob('钟铜傀儡', 39, 'dlc1_bronze_puppet', { hp: 4400, speed: 3, range: 2.6, interval: 2.0 }),
  },
  packs: [
    { kinds: ['bt_monk', 'bt_monk'], x: -14, z: 58, respawn: 40, hot: true }, { kinds: ['bt_monk', 'bt_monk', 'bt_monk'], x: 17, z: 52, respawn: 40, hot: true },
    { kinds: ['bt_monk', 'bt_puppet'], x: -31, z: 24, respawn: 40, hot: true }, { kinds: ['bt_puppet', 'bt_puppet'], x: 31, z: 27, respawn: 40, hot: true },
    { kinds: ['bt_monk', 'bt_monk'], x: -79, z: -18, respawn: 40, hot: true }, { kinds: ['bt_wraith', 'bt_wraith'], x: 79, z: -18, respawn: 40, hot: true },
    { kinds: ['bt_wraith', 'bt_monk'], x: 56, z: -46, respawn: 40, hot: true }, { kinds: ['bt_wraith', 'bt_wraith'], x: 76, z: -66, respawn: 40, hot: true },
    { kinds: ['bt_wraith', 'bt_puppet'], x: -42, z: -60, respawn: 40, hot: true }, { kinds: ['bt_puppet', 'bt_monk'], x: 31, z: -83, respawn: 40, hot: true },
    // 11-14b 面积 ×2：补 7 群（填外圈台地和新增的西北、东北空地）
    { kinds: ['bt_monk', 'bt_monk'], x: -40, z: 58, respawn: 40, hot: true }, { kinds: ['bt_puppet', 'bt_monk'], x: 44, z: 46, respawn: 40, hot: true },
    { kinds: ['bt_wraith', 'bt_monk'], x: -70, z: 40, respawn: 40, hot: true }, { kinds: ['bt_wraith', 'bt_wraith', 'bt_monk'], x: 92, z: 8, respawn: 40, hot: true },
    { kinds: ['bt_puppet', 'bt_puppet'], x: -24, z: -30, respawn: 40, hot: true }, { kinds: ['bt_monk', 'bt_wraith'], x: -50, z: -64, respawn: 40, hot: true },
    { kinds: ['bt_wraith', 'bt_puppet'], x: 64, z: -84, respawn: 40, hot: true },
  ],
  build,
};

// ---------------------------------------------------------------- 首领
const cfg = (dmg: number, speed: number, range: number, interval: number) => ({ aggroRange: 12, attackRange: range, attackDamage: dmg, attackInterval: interval, moveSpeed: speed, leashRange: 30, patrolRadius: 0 });
type M = PackBossDef['mob'];
const bossMob = (name: string, level: number, model: string, o: Partial<M>): M => ({ name, level, model, hp: 50000, dmg: 160, interval: 2.4, speed: 3, aggro: 12, range: 3.4, xp: 5200, ilvl: 84, leash: 30, elite: true, loot: 'raid_boss', ...o });

interface BtBoss { key: string; at: keyof typeof BT_ARENAS; mob: M; boss: BossDef; adds?: PackBossDef['adds']; theme: PackBossDef['theme']; yells: { spawn: string; death: string }; need?: () => boolean }
const ADD_PUPPET = { bt_add_puppet: { name: '钟铜傀儡', level: 39, model: 'dlc1_bronze_puppet', hp: 3000, dmg: 70, interval: 2, speed: 3.4, aggro: 16, range: 2.4, xp: 120, ilvl: 80 } };
const ADD_MONK = { bt_add_monk: { name: '缄默的弟子', level: 39, model: 'dlc1_silent_monk', hp: 2600, dmg: 64, interval: 1.8, speed: 4, aggro: 16, range: 2.2, xp: 100, ilvl: 80, scale: 0.9 } };
const ADD_WRAITH = { bt_add_wraith: { name: '断绳残响', level: 39, model: 'dlc1_rope_wraith', hp: 2400, dmg: 60, interval: 2.2, speed: 3.6, aggro: 16, range: 10, ranged: true, shot: { color: 0x60f0ff, el: 'arcane' }, xp: 100, ilvl: 80 } };
const ADD_SAND = { bt_add_sand: { name: '回响 · 金沙卫士', level: 39, model: 'cultist', tint: 0xe0b040, tintK: 0.5, hp: 3200, dmg: 72, interval: 2, speed: 3.6, aggro: 16, range: 2.4, xp: 120, ilvl: 80 } };
const ADD_EMBER = { bt_add_ember: { name: '回响 · 熔渣仆从', level: 40, model: 'golem', tint: 0x6a2a10, tintK: 0.5, glow: 0x3a1000, hp: 3400, dmg: 76, interval: 2, speed: 3.4, aggro: 16, range: 2.4, xp: 120, ilvl: 82 } };
const ADD_ECHO = { bt_add_echo: { name: '沉眠者的梦魇', level: 40, model: 'dlc1_mirror_wraith', tint: 0x6a2040, tintK: 0.5, hp: 3600, dmg: 80, interval: 2, speed: 4, aggro: 18, range: 2.4, xp: 140, ilvl: 84 } };

export const BT_BOSSES: BtBoss[] = [
  { key: 'bt_b1', at: 'b1', theme: 'stone', mob: bossMob('无舌之钟 · 铸钟巨像', 38, 'dlc1_bell_colossus', { hp: 302000 /* fix1108b #1 原 42000 */, dmg: 150, scale: 1.5, speed: 2.6, range: 3.8 }), adds: ADD_PUPPET,
    yells: { spawn: '铸钟巨像胸口那口没有钟舌的钟，发出了一声空响。', death: '巨像倒下了。它胸口的钟，终于碎了。' },
    boss: { name: '铸钟巨像', config: cfg(150, 2.6, 3.8, 2.6), globalCooldown: 3.5,
      abilities: [
        { id: 'slam', kind: 'groundSlam', name: '锤落', cooldown: 10, telegraph: 1.5, radius: 6, damage: 260, element: 'physical', atSelf: true },
        { id: 'toll', kind: 'cast', name: '空钟回荡', cooldown: 16, castTime: 2.2, damage: 180, element: 'arcane', effect: { type: 'stun', duration: 1.5 }, lockout: 2.5 },
        { id: 'pup', kind: 'summon', name: '唤醒钟铜傀儡', cooldown: 28, count: 2, unit: 'bt_add_puppet' },
      ],
      phases: [
        { name: '第一阶段 · 空响', hpBelow: 1, abilities: ['slam', 'toll'] },
        { name: '第二阶段 · 铸钟', hpBelow: 0.5, abilities: ['slam', 'toll', 'pup'], damageMul: 1.2, onEnter: 'pup', yell: '……当……当……' },
      ] } },
  { key: 'bt_b2', at: 'b2', theme: 'frost', mob: bossMob('缄默修士长', 38, 'dlc1_silent_monk', { hp: 306000 /* fix1108b #1 原 44000 */, dmg: 155, scale: 1.9, speed: 3.4 }), adds: ADD_MONK,
    yells: { spawn: '修士长解开了嘴上的一根线。整座钟楼安静得让人耳鸣。', death: '修士长嘴上的铜片掉了下来。他最后说了一个字：「钟」。' },
    boss: { name: '缄默修士长', config: cfg(155, 3.4, 3.4, 2.3), globalCooldown: 3.2,
      abilities: [
        { id: 'hush', kind: 'cast', name: '止语', cooldown: 14, castTime: 2.0, damage: 160, element: 'shadow', effect: { type: 'slow', percent: 0.5, duration: 4 }, lockout: 3 },
        { id: 'field', kind: 'poisonZone', name: '死寂之地', cooldown: 13, radius: 3.4, duration: 8, dps: 70, element: 'shadow', count: 3, spread: 7 },
        { id: 'pupils', kind: 'summon', name: '召来弟子', cooldown: 26, count: 3, unit: 'bt_add_monk' },
        { id: 'ring', kind: 'groundSlam', name: '缄默环', cooldown: 11, telegraph: 1.4, radius: 5, damage: 220, element: 'shadow', count: 2, spread: 6 },
      ],
      phases: [
        { name: '第一阶段 · 止语', hpBelow: 1, abilities: ['hush', 'field', 'ring'] },
        { name: '第二阶段 · 群默', hpBelow: 0.45, abilities: ['hush', 'field', 'ring', 'pupils'], damageMul: 1.2, onEnter: 'pupils', yell: '（他没有出声，可所有弟子都转过了头）' },
      ] } },
  { key: 'bt_b3', at: 'b3', theme: 'frost', mob: bossMob('断绳回响 · 初代鸣钟人', 39, 'dlc1_rope_wraith', { hp: 310000 /* fix1108b #1 原 46000 */, dmg: 160, scale: 2.0, range: 3.4 }), adds: ADD_WRAITH,
    yells: { spawn: '一个攥着断绳的回响站了起来：「谁……让钟停的？」', death: '初代鸣钟人松开了手里的断绳：「……替我，敲完它。」' },
    boss: { name: '初代鸣钟人', config: cfg(160, 3.2, 3.4, 2.3), globalCooldown: 3.2,
      abilities: [
        { id: 'lash', kind: 'groundSlam', name: '断绳鞭', cooldown: 9, telegraph: 1.3, radius: 4, damage: 230, element: 'arcane', count: 3, spread: 8 },
        { id: 'bind', kind: 'cast', name: '缚绳', cooldown: 15, castTime: 2.0, damage: 150, element: 'arcane', effect: { type: 'stun', duration: 2 }, lockout: 3, selfHealPercent: 0.03 },
        { id: 'echoes', kind: 'summon', name: '断绳残响', cooldown: 24, count: 2, unit: 'bt_add_wraith' },
      ],
      phases: [
        { name: '第一阶段 · 拉绳', hpBelow: 1, abilities: ['lash', 'bind'] },
        { name: '第二阶段 · 绳断', hpBelow: 0.5, abilities: ['lash', 'bind', 'echoes'], damageMul: 1.25, onEnter: 'echoes', yell: '绳子……断了……！' },
      ] } },
  { key: 'bt_b4', at: 'b4', theme: 'fire', mob: bossMob('回响 · 沙葬法老塞特赫', 39, 'dlc1_echo_priest' /* 11-17 原 cultist（无骨圆团）→ 腐根祭司绑骨件（身高 2.7，mage 动作），scale 2.0→1.5 ≈ 原 4m */, { hp: 318000 /* fix1108b #1 原 50000 */, dmg: 165, scale: 1.5, tint: 0xe0b040, tintK: 0.55, glow: 0x3a2a00 } as Partial<M>), adds: ADD_SAND,
    yells: { spawn: '金沙从台阶缝里涌了出来。那个声音你听过：「凡人……又是你。」', death: '塞特赫的回响化成一地金沙：「这一次……我没有输给你……我输给了钟。」' },
    boss: { name: '塞特赫', config: cfg(165, 3.4, 3.2, 2.3), globalCooldown: 3.2,
      abilities: [
        { id: 'sand', kind: 'poisonZone', name: '流沙', cooldown: 12, radius: 3.6, duration: 9, dps: 75, element: 'nature', count: 3, spread: 8 },
        { id: 'curse', kind: 'cast', name: '法老之咒', cooldown: 15, castTime: 2.4, damage: 200, element: 'shadow', effect: { type: 'dot', element: 'shadow', dps: 60, duration: 5 }, lockout: 2.5 },
        { id: 'guards', kind: 'summon', name: '金沙卫士', cooldown: 26, count: 2, unit: 'bt_add_sand' },
        { id: 'storm', kind: 'groundSlam', name: '沙暴', cooldown: 11, telegraph: 1.6, radius: 6.5, damage: 240, element: 'physical', atSelf: true },
      ],
      phases: [
        { name: '第一阶段 · 金沙', hpBelow: 1, abilities: ['sand', 'curse', 'storm'] },
        { name: '第二阶段 · 王陵', hpBelow: 0.5, abilities: ['sand', 'curse', 'storm', 'guards'], damageMul: 1.25, onEnter: 'guards', yell: '跪下！在法老面前跪下！' },
      ] } },
  { key: 'bt_b5', at: 'b5', theme: 'fire', mob: bossMob('回响 · 熔心君王瓦尔卡兹', 40, 'brute', { hp: 329000 /* fix1108b #1 原 56000 */, dmg: 175, scale: 2.1, tint: 0x1a0a08, tintK: 0.7, glow: 0xa02800 } as Partial<M>), adds: ADD_EMBER,
    need: () => fateChoice() !== null,
    yells: { spawn: '门前的熔岩亮了起来：「那颗心……是我的！」', death: '瓦尔卡兹的回响冷却成一块黑石。门后传来了心跳声。' },
    boss: { name: '瓦尔卡兹', config: cfg(175, 3.2, 3.4, 2.4), globalCooldown: 3,
      abilities: [
        { id: 'erupt', kind: 'groundSlam', name: '熔心爆裂', cooldown: 10, telegraph: 1.5, radius: 5.5, damage: 260, element: 'fire', count: 2, spread: 7 },
        { id: 'lava', kind: 'poisonZone', name: '熔岩池', cooldown: 12, radius: 3.4, duration: 10, dps: 85, element: 'fire', count: 3, spread: 8 },
        { id: 'crown', kind: 'cast', name: '王冠之炎', cooldown: 16, castTime: 2.4, damage: 230, element: 'fire', effect: { type: 'dot', element: 'fire', dps: 70, duration: 5 }, lockout: 2.5 },
        { id: 'slag', kind: 'summon', name: '熔渣仆从', cooldown: 24, count: 3, unit: 'bt_add_ember' },
      ],
      phases: [
        { name: '第一阶段 · 余烬', hpBelow: 1, abilities: ['erupt', 'crown'] },
        { name: '第二阶段 · 熔心', hpBelow: 0.65, abilities: ['erupt', 'crown', 'lava'], damageMul: 1.15, yell: '我把心扔进了熔炉……你扔得起什么？' },
        { name: '第三阶段 · 王座', hpBelow: 0.3, abilities: ['erupt', 'crown', 'lava', 'slag'], damageMul: 1.3, onEnter: 'slag', yell: '跪下！' },
      ] } },
];

/** 沉眠者 A（被钟声束缚，4 阶段）/ B（完全觉醒，多一个阶段，共 5 个） */
const sleeperAbilities = (k: number): BossDef['abilities'] => [
  { id: 'claw', kind: 'groundSlam', name: '深渊之爪', cooldown: 9, telegraph: 1.4, radius: 5, damage: Math.round(280 * k), element: 'shadow', count: 2, spread: 7 },
  { id: 'quake', kind: 'groundSlam', name: '翻身', cooldown: 14, telegraph: 1.8, radius: 8, damage: Math.round(320 * k), element: 'physical', atSelf: true },
  { id: 'dream', kind: 'cast', name: '千年之梦', cooldown: 16, castTime: 2.6, damage: Math.round(240 * k), element: 'shadow', effect: { type: 'stun', duration: 2 }, lockout: 3 },
  { id: 'tide', kind: 'poisonZone', name: '黑潮', cooldown: 12, radius: 3.8, duration: 10, dps: Math.round(90 * k), element: 'frost', count: 3, spread: 9 },
  { id: 'night', kind: 'summon', name: '梦魇', cooldown: 26, count: 3, unit: 'bt_add_echo' },
  { id: 'bell', kind: 'cast', name: '钟声反噬', cooldown: 20, castTime: 3, damage: Math.round(200 * k), element: 'arcane', effect: { type: 'slow', percent: 0.5, duration: 4 }, lockout: 4, selfHealPercent: 0.02 },
  { id: 'devour', kind: 'cast', name: '吞海', cooldown: 18, castTime: 3, damage: Math.round(380 * k), element: 'shadow', effect: { type: 'dot', element: 'shadow', dps: 90, duration: 6 }, lockout: 3, selfHealPercent: 0.04 },
];
export const SLEEPER_A: BtBoss = {
  key: 'bt_sleeper_a', at: 'sleeper', theme: 'frost', need: () => fateChoice() === 'A',
  mob: bossMob('沉眠者（被钟声束缚）', 40, 'dlc1_sleeper_a', { hp: 379000 /* fix1108b #1 原 90000 */, dmg: 185, scale: 1.8, speed: 2.4, range: 4.4, xp: 9000, ilvl: 88, loot: 'raid_final' }), adds: ADD_ECHO,
  yells: { spawn: '铜链绷紧了。沉眠者在钟声里挣扎，半睁着一只眼睛看着你。', death: '沉眠者合上了眼睛。钟声，又响了。' },
  boss: { name: '沉眠者', config: cfg(185, 2.4, 4.4, 2.6), globalCooldown: 3.2, abilities: sleeperAbilities(1),
    phases: [
      { name: '第一阶段 · 梦呓', hpBelow: 1, abilities: ['claw', 'quake'] },
      { name: '第二阶段 · 挣链', hpBelow: 0.75, abilities: ['claw', 'quake', 'tide', 'bell'], damageMul: 1.1, yell: '（铜链一根根绷紧，铃铛乱响）' },
      { name: '第三阶段 · 梦魇', hpBelow: 0.5, abilities: ['claw', 'quake', 'tide', 'bell', 'night'], damageMul: 1.2, onEnter: 'night', yell: '……放……我……' },
      { name: '第四阶段 · 钟声', hpBelow: 0.25, abilities: ['claw', 'quake', 'tide', 'bell', 'dream'], damageMul: 1.3, yell: '伊奥拉：「就是现在！再敲一下！」' },
    ] },
};
export const SLEEPER_B: BtBoss = {
  key: 'bt_sleeper_b', at: 'sleeper', theme: 'fire', need: () => fateChoice() === 'B',
  mob: bossMob('沉眠者（完全觉醒）', 40, 'dlc1_sleeper_b', { hp: 403000 /* fix1108b #1 原 110000 */, dmg: 200, scale: 1.9, speed: 2.8, range: 4.4, xp: 9000, ilvl: 88, loot: 'raid_final' }), adds: ADD_ECHO,
  yells: { spawn: '断掉的钟绳在地上抽动。沉眠者完全睁开了眼睛——它饿了一千年。', death: '沉眠者倒在了黑潮里。它的力量，正等着被谁吞下去。' },
  boss: { name: '沉眠者', config: cfg(200, 2.8, 4.4, 2.4), globalCooldown: 3, abilities: sleeperAbilities(1.12),
    phases: [
      { name: '第一阶段 · 苏醒', hpBelow: 1, abilities: ['claw', 'quake'] },
      { name: '第二阶段 · 黑潮', hpBelow: 0.8, abilities: ['claw', 'quake', 'tide'], damageMul: 1.1, yell: '（海水开始倒灌进地窖）' },
      { name: '第三阶段 · 梦魇', hpBelow: 0.6, abilities: ['claw', 'quake', 'tide', 'night', 'dream'], damageMul: 1.2, onEnter: 'night', yell: '……饿……' },
      { name: '第四阶段 · 吞海', hpBelow: 0.4, abilities: ['claw', 'quake', 'tide', 'night', 'devour'], damageMul: 1.3, yell: '卡戎：「别让它吞下去！」' },
      { name: '第五阶段 · 完全觉醒', hpBelow: 0.2, abilities: ['claw', 'quake', 'tide', 'night', 'devour', 'dream'], damageMul: 1.5, speedMul: 1.2, onEnter: 'night', yell: '（它站了起来。整座钟楼都在发抖）' },
    ] },
};
export const ALL_BT_BOSSES = [...BT_BOSSES, SLEEPER_A, SLEEPER_B];

// ---------------------------------------------------------------- 运行时
let ctx: PackCtx | null = null;
export const bindBelltower = (c: PackCtx) => { ctx = c; };
export const btCtx = () => ctx;

const deadFor: Record<string, number> = {};
const RESPAWN_SEC = 300;
let t1 = 0, silenceT = 0, inCross = false, crossTimer = 0;
export const SILENCE_EVERY = 45;
/** v1.1.1 死寂真实效果：回响狂躁，SILENCE_DUR 秒内玩家受到的伤害 ×SILENCE_TAKEN（安魂钟旁免疫；钟鸣驱散） */
export const SILENCE_DUR = 12, SILENCE_TAKEN = 1.25;
let silentLeft = 0;
export const silenceActive = () => silentLeft > 0;
/** 驱散死寂（钟鸣），返回是否真的驱散了 */
export function endSilence(): boolean { const was = silentLeft > 0; silentLeft = 0; return was; }
/** PackManifest.mods 用 */
export const btMods = () => (silentLeft > 0 && ctx?.map() === BT_ID ? { taken: SILENCE_TAKEN } : {});

function bossDef(b: BtBoss): PackBossDef {
  const a = BT_ARENAS[b.at];
  return { key: b.key, map: BT_ID, x: BT_O.x + a.x, z: BT_O.z + a.z, mob: b.mob, boss: b.boss, adds: b.adds, theme: b.theme, yells: b.yells,
    respawn: RESPAWN_SEC, onDeath: () => onBossDeath(b) };
}
function onBossDeath(b: BtBoss) {
  const S = btState(); S.kills = S.kills ?? {}; S.kills[b.key] = (S.kills[b.key] ?? 0) + 1;
  deadFor[b.key] = 0;
  btDrops(b);
  if ((b === SLEEPER_A || b === SLEEPER_B) && !S.ending) {
    const f = b === SLEEPER_A ? 'A' : 'B';
    window.setTimeout(() => showEnding(f), 2500);
  }
}
/** v1.2.8 钟楼专属掉落：每个首领 25% 一件「无声钟楼」套装（优先缺的件，记在 S.btSet）；沉眠者 8% 新职业本职业暗金 */
let btRnd = () => Math.random();
export const btSetRng = (f: (() => number) | null) => { btRnd = f ?? (() => Math.random()); };
function btDrops(b: BtBoss) {
  if (!ctx?.dropFixed) return;
  const S = btState() as ReturnType<typeof btState> & { btSet?: string[] }, a = BT_ARENAS[b.at], X = BT_O.x + a.x, Z = BT_O.z + a.z;
  if (btRnd() < BT_SET_CHANCE) {
    const got = (S.btSet ??= []), id = BELL_SET_PIECES.find(p => !got.includes(p)) ?? BELL_SET_PIECES[Math.floor(btRnd() * BELL_SET_PIECES.length)];
    const n = ctx.dropFixed(id, X, Z); if (n) { if (!got.includes(id)) got.push(id); ctx.toast(`钟楼套装：${n}`, '#c080ff'); }
  }
  if (b === SLEEPER_A || b === SLEEPER_B) s40Roll(s40SleeperChance(), X, Z, btRnd);   // 11-05 40 级职业套装（与暗金独立判定）；11-19 沉眠者必掉 1 件（?off=lastset40 回 25%）
  const dks = DARK_BY_CLASS[ctx.classId()];   // v1.2.38b 40 级暗金：双持职业两件里缺的优先
  if ((b === SLEEPER_A || b === SLEEPER_B) && dks?.length && btRnd() < BT_DARK_CHANCE) {
    const S2 = S as typeof S & { btDark?: string[] }, gotD = (S2.btDark ??= []);
    const dk = dks.find(d => !gotD.includes(d)) ?? dks[Math.floor(btRnd() * dks.length)];
    const n = ctx.dropFixed(dk, X, Z); if (n) { if (!gotD.includes(dk)) gotD.push(dk); ctx.toast(`暗金：${n}！`, '#ffd070'); }
  }
}
const local = () => { const p = ctx!.playerPos(); return { x: p.x - BT_O.x, z: p.z - BT_O.z }; };
const near = (p: { x: number; z: number }, q: { x: number; z: number }, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;

const soulIn = [false, false, false];
/** v1.2.9 测试用：放过的场景音效（每次进安魂钟 / 锚柱范围记一条） */
export const sfxLog: string[] = [];
const wade = { x: 1e9, z: 0, t: 0 };
let lakeMesh: THREE.Mesh | null = null;   // 11-17 湖面（涉水水花取世界水面高度 / 所在场景）
export function btUpdate(dt: number) {
  if (silentLeft > 0) silentLeft = Math.max(0, silentLeft - dt);
  if (!ctx || ctx.map() !== BT_ID) { inCross = false; silentLeft = 0; btClimateTick(dt, false, 0, null); return; }
  btClimateTick(dt, true, silentLeft, fateChoice());   // 11-14d 死寂褪色 · 无声闪电 · 抉择后赤 / 青天
  const lp = local();
  { // 11-16 涉水：湖里走动带出涟漪环（统一水体 waterRipple，世界坐标）
    const vx = (lp.x - wade.x) / Math.max(dt, 1e-3), vz = (lp.z - wade.z) / Math.max(dt, 1e-3);
    const mv = Math.hypot(lp.x - wade.x, lp.z - wade.z); wade.x = lp.x; wade.z = lp.z; wade.t += dt;
    const sp = mv / Math.max(dt, 1e-3), dep = btLakeDepth(lp.x, lp.z);
    if (mv < 3 && sp > 0.4 && wade.t > 0.3 && dep > 0.08) { wade.t = 0; waterRipple(BT_O.x + lp.x, BT_O.z + lp.z, 0.45);
      if (lakeMesh?.parent) { let sc: THREE.Object3D = lakeMesh; while (sc.parent) sc = sc.parent;   // 11-17 v2 涉水水花：跑动 / 水越深溅得越高（≥0.25 米才溅），水珠继承一点前进速度
        if (dep > 0.25) w2Splash(sc, BT_O.x + lp.x, lakeMesh.matrixWorld.elements[13], BT_O.z + lp.z, Math.min(1, 0.3 + sp / 10 + dep * 0.3), mv < 3 ? vx : 0, mv < 3 ? vz : 0); } }
  }
  // 首领：在场 / 死亡计时复活（玩家离开竞技场 40 米外才复活）
  if ((t1 += dt) >= 1) {
    const step = t1; t1 = 0;
    for (const b of ALL_BT_BOSSES) {
      const st = ctx.bossState?.(b.key) ?? 'none', ok = !b.need || b.need();
      if (!ok) { if (st !== 'none') ctx.removeBoss?.(b.key); continue; }
      if (st === 'none') ctx.spawnBoss?.(bossDef(b));
      else if (st === 'dead') {
        deadFor[b.key] = (deadFor[b.key] ?? 0) + step;
        if (deadFor[b.key] >= RESPAWN_SEC && !near(lp, BT_ARENAS[b.at], 40)) { deadFor[b.key] = 0; ctx.spawnBoss?.(bossDef(b)); }
      }
    }
  }
  // v1.2.9 安魂钟 / 锚柱：走进去时放音效（9A-2 = 钟声，9B-2 = 斩绳；目标本身仍由本体 explore 判定）
  BT_SOULS.forEach((s, i) => {
    const inS = near(lp, s, 5);
    if (inS && !soulIn[i]) {
      const A = ctx!.synth?.();
      if (A && A.gate(`bt_soul${i}`, 2)) {
        if (ctx!.questState('cs9a_2') === 'active') requiem(A);
        else if (ctx!.questState('cs9b_2') === 'active') ropeSnap(A);
      }
      if (ctx!.questState('cs9a_2') === 'active' || ctx!.questState('cs9b_2') === 'active') sfxLog.push(`bt_soul${i + 1}`);
    }
    soulIn[i] = inS;
  });
  // 区域机制「死寂」
  silenceT += dt;
  if (silenceT >= SILENCE_EVERY) {
    silenceT = 0;
    if (BT_SOULS.some(s => near(lp, s, 6))) ctx.toast('安魂钟轻轻响了一下，死寂没有碰到你', '#9ae8f0');
    else { silentLeft = SILENCE_DUR; ctx.yell(`死寂 · 回响狂躁：${SILENCE_DUR} 秒内受到的伤害 +${Math.round((SILENCE_TAKEN - 1) * 100)}%（站到安魂钟旁免疫）`); }
  }
  // 9-3 岔路口：走进顶层抉择点 → 横幅 → 约 3 秒后打开抉择界面
  const inside = near(lp, BT_ARENAS.cross, BT_ARENAS.cross.r);
  if (inside && !inCross) {
    inCross = true;
    const qs = ctx.questState('cs9_3');
    const k = btState().kills ?? {};
    if (!fateChoice() && (qs === 'active' || qs === 'ready') && !fateUiOpen()) {
      if ((k.bt_b3 ?? 0) < 1 || (k.bt_b4 ?? 0) < 1) ctx.yell('顶层的钟还被第三、四层的守钟者压着');
      else { fateBanner(); crossTimer = 3.2; }
    }
  } else if (!inside) inCross = false;
  if (crossTimer > 0 && (crossTimer -= dt) <= 0 && !fateChoice()) openFateUI();
}
/** 和伊奥拉 / 卡戎对话时（本体 talk 剧情钩子）：9-3 进行中 / 已交、还没选 → 重新打开抉择界面 */
export function btOnTalk(npc: unknown) {
  if (!ctx || (npc !== 'iola_b' && npc !== 'charon_b') || fateChoice()) return;
  const qs = ctx.questState('cs9_3');
  if (qs === 'ready' || qs === 'done' || (qs === 'active' && btState().banner)) openFateUI();
}
export const btDebug = () => ({ silenceT, silentLeft, inCross, crossTimer, deadFor: { ...deadFor }, bosses: ctx ? Object.fromEntries(ALL_BT_BOSSES.map(b => [b.key, ctx!.bossState?.(b.key) ?? 'none'])) : {} });
export const btReset = () => { closeFateUI(); };

export const BT_WAYPOINT: PackWaypoint = {
  id: 'dlc1_belltower_wp', name: '无声钟楼', desc: '38–40 级 · 第九章「再鸣 / 断绳」 · 五层守钟者与沉眠者', zone: BT_ID,
  locked: () => !ctx ? '进入游戏后才能前往' : ctx.level() < 37 ? '需要等级 37' : ctx.questState('cs8_6') !== 'done' ? '完成第八章「回响首领 · 腐根祭司」后开放' : null,
  go: () => { ctx?.goMap(BT_ID, undefined, '前往'); },
};

campDressBind([BT_ID]);   // fix1107 营地帐篷 / 货箱 / 栅栏桩换写实件（同镜渊城）
