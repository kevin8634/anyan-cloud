// ======================================================================
// DLC1 沉钟海岸（31–35 级，第七章「沉钟」）—— v1.0.3 正式版（v1.0.2 白盒升级）
// 概念图：files/art/dlc1/d13_coast_tides.png（退潮 / 涨潮）、d13_iola.png、d13_coast_mobs.png（Rhett 2026-10-22 确认）
// 结构同本体 data/zones_wild.ts WildDef；只 import core 类型和 three（不 import 本体 data / web 的值）
// 潮汐机制见 ./tide.ts；任务见 ./chapter7.ts
// ======================================================================
import * as THREE from 'three';
import { blobXY } from './liquid_shape';   // 11-15 潮光水洼不规则边
import type { PackWaypoint, PackCtx, WildBuildApi } from '../../core/ContentPacks';
import { buildTideMeshes, TIDE_POOLS, WRECK_CHESTS } from './tide';
import { sceneOr } from './lux_dlc';
import { COAST_HALF, coastGround, coastSolid, ZONE_SPOTS } from './coast_layout';   // v1.2.71 地图升级：三区布局 / 海岸地形
import { coastSceneBuild } from './coast_scene';
import { mat, whiteColors } from './coast_kit';
import { curQuality } from '../../web/gfx';
import { campDressFor, campDressBind } from './plaza_dress';
import { coastFlora } from './coast_flora';   // 11-15 海岸草木
import { IOLA_NPC } from './iola_def';   // 11-17 与镜渊城同一份伊奥拉

export const COAST_ID = 'dlc1_coast';
/** 原点放在本体所有区域之外（本体最远 ember z≈1700、副本区 x=±700） */
export const COAST_O = { x: 2400, z: -2400 };

type M = Record<string, unknown>;
export const dlcMob = (name: string, level: number, model: string, o: M): M => {
  const k = 1 + (level - 16) * 0.13;   // 和本体野外同一条缩放线，再 ×1.35（DLC 段）
  return { name, level, model, hp: Math.round(640 * k * 1.35), dmg: Math.round(34 * k), interval: 1.7, speed: 4, aggro: 9, range: 2.2, xp: level * 5, ilvl: Math.round(44 + (level - 31) * 3.5), leash: 30, patrol: 3, loot: 'trash_ember', ...o };
};

// ---------------------------------------------------------------- 造景：沉钟、沉船、礁柱、潮池（概念图）
const bronze = () => curQuality === 'low' ? new THREE.MeshStandardMaterial({ color: 0x6a5a30, metalness: 0.75, roughness: 0.45, emissive: 0x0a2a24, emissiveIntensity: 0.4 }) : mat('bronze') as THREE.MeshStandardMaterial;   // v1.2.71 中档以上：铜绿青铜 + 环境反射
function makeBell(scale: number): THREE.Group {
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(0.55 + 0.45 * Math.pow(t, 2.2) + (t > 0.92 ? 0.08 : 0), 1.6 - t * 1.6)); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), bronze()); body.castShadow = true;
  (body.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 16), bronze()); crown.position.y = 1.72;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.05, 6, 32), new THREE.MeshStandardMaterial({ color: 0x3aa890, emissive: 0x1a6a5a, emissiveIntensity: 0.6, roughness: 0.6 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.18;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bronze()); clapper.position.y = 0.1;
  g.add(body, crown, band, clapper);
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) whiteColors(m.geometry); });   // v1.2.71 共用材质带顶点色
  g.scale.setScalar(scale);
  return g;
}
function makeWreck(): THREE.Group {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 9), wood); hull.position.y = 0.4; hull.rotation.z = 0.32; hull.castShadow = true;
  const keel = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 4), wood); keel.rotation.x = Math.PI / 2; keel.position.set(0, 0.4, 5.6); keel.rotation.z = 0.32;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), wood); mast.position.set(-0.6, 2.6, -0.6); mast.rotation.z = 0.55;
  g.add(hull, keel, mast);
  return g;
}
function makeSpire(h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * h / 6, 1.3 * h / 6, h, 6), new THREE.MeshStandardMaterial({ color: 0x3c4648, roughness: 0.85, flatShading: true }));
  m.position.y = h / 2 - 0.3; m.castShadow = true; return m;
}
function makeGlow(r: number): THREE.Mesh {
  const m = new THREE.Mesh(blobXY(r, Math.round(r * 97)), new THREE.MeshBasicMaterial({ color: 0x30e8d8, transparent: true, opacity: 0.55, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m;
}
function build(api: WildBuildApi) {
  campDressFor(api, COAST_WILD as unknown as Parameters<typeof campDressFor>[1]);   // fix1107（Rhett 10:22）：营地换倒钟广场样式（地坪 / 篝火 / 火盆 / 拾荒营场景件）
  // 沉钟：浅滩中央一口半埋的巨钟（地标），两口小钟散在深潮口
  // v1.2.45 比赛版：Lux3D 侧卧巨钟（概念图 A3）；没有模型回退程序化
  // v1.2.71：巨钟放大（概念图 A：侧卧半埋、长满海草藤壶）；中心加碰撞（探索半径 5 米仍可达）
  const big = sceneOr('scene_bell', { w: 16 }, () => { const b = makeBell(6.2); b.rotation.z = 0.5; b.position.y = -0.9; return b; }, { emissiveK: 1.6 }); if (big.userData.luxScene) big.position.y = -0.8; api.add(big, 0, -12, 0.4);
  api.block?.(0, -12, 3);
  const sm1 = sceneOr('scene_bell', { w: 4.2 }, () => { const b = makeBell(1.6); b.rotation.z = -0.8; return b; }); if (sm1.userData.luxScene) sm1.position.y = -0.3; api.add(sm1, -10, -58, 1.2);
  const sm2 = sceneOr('scene_bell', { w: 3.4 }, () => { const b = makeBell(1.3); b.rotation.x = 0.9; return b; }); if (sm2.userData.luxScene) { sm2.position.y = -0.4; sm2.rotation.z = 0.35; } api.add(sm2, 14, -66, 2.1);
  // 沉船湾：两艘斜躺的船
  const wr = () => { const w = sceneOr('scene_shipwreck', { w: 13 }, makeWreck); if (w.userData.luxScene) { w.position.y = -0.6; w.rotation.z = 0.12; } return w; };
  api.add(wr(), -48, 12, 0.6); api.add(wr(), -30, 34, 2.4);
  // 礁柱群
  [[40, -30, 7], [50, -18, 5], [36, -14, 4], [56, -36, 8], [46, -44, 6], [28, -40, 5], [-20, -40, 6], [24, 4, 4]].forEach(([x, z, h]) => api.add(sceneOr('scene_reefspire', { h: h * 1.25 }, () => makeSpire(h)), x, z, x * 0.1));
  // v1.2.71：冷光潮池小圈换成地面着色器里的发光潮池（coast_floor）
  void makeGlow;
  buildTideMeshes(api);
  try { coastSceneBuild(api); } catch (e) { console.error('沉钟海岸 v1.2.71 场景出错', e); }
  try { coastFlora(api); } catch (e) { console.error('沉钟海岸草木出错', e); }   // 11-15 海草 / 芦苇（低画质不放）
}

export const COAST_WILD = {
  id: COAST_ID, name: '沉钟海岸', levels: [31, 35], minLevel: 30, desc: '潮痕营地 · 退潮沉钟浅滩 · 沉船湾 · 礁柱群 · 深潮口 · 东岸风暴锈锚码头 · 西岸鲸骨礁湾（潮汐：退潮露出沉船宝箱，涨潮淹没浅滩）',
  origin: COAST_O, half: COAST_HALF, inner: 120,   // v1.2.71 90 → 135（东西两侧是海，inner 控制散布密度）
  worldNode: { x: 0.5, y: 0.93 }, sandIcon: '地底之海',
  palette: { sky: 0x0e2a30, fog: 0x3e4c52, fogNear: 40, fogFar: 175, hemi: 0xb4c8cc, ground: 0x20282a, hemiI: 1.35, sun: 2.0, sunColor: 0xe6ecec,
    tA: 0x2a3436, tB: 0x1a2426, path: 0x4a5a58, cliff: 0x141c1e, tex: ['mud', 'dirt', 'rock'], map: ['#1a3a40', '#0a1a1e'], grass: 0, cracks: 0, music: 'tide' },
  scatter: [
    { kind: 'mesa', n: 16, r: 3.2, s: [1.1, 2.2], color: 0x141c1e, edge: true },
    { kind: 'obsidian', n: 22, r: 0.9, s: [0.6, 1.8], color: 0x1a2a2c },
    { kind: 'rock', n: 16, r: 0.9, s: [0.5, 1.3], color: 0x2a3a3a },
  ],
  camps: [{ id: 'cs_camp', name: '潮痕营地', x: 0, z: 62, r: 12, main: true, waypoint: { x: -6.5, z: 66.9 } }],   // 11-14 Rhett 图三：传送阵挪离栅栏,
  gates: [{ to: 'camp', x: 0, z: 84, name: '回灰石营地的潮道', arrive: { x: 0, z: 78 } }, { to: 'dlc1_mirror', x: 0, z: -84, name: '通往镜渊城的倒悬阶梯', arrive: { x: 0, z: -78 } }],
  spots: {
    cs_bell: { x: 0, z: -10, r: 14, name: '沉钟浅滩' }, cs_bell_core: { x: 0, z: -12, r: 5, name: '沉钟' },
    cs_wreck: { x: -42, z: 20, r: 16, name: '沉船湾' }, cs_pillars: { x: 44, z: -28, r: 15, name: '礁柱群' },
    cs_deep: { x: 0, z: -60, r: 14, name: '深潮口' }, cs_foreman_route: { x: 2, z: -40, r: 22, name: '溺亡工头的巡游路线' },
    ...ZONE_SPOTS,   // v1.2.71 东岸码头 / 西岸礁湾
  },
  killArea: { cs_drowned: 'cs_bell', cs_bellcrab: 'cs_wreck', cs_siren: 'cs_pillars', cs_foreman: 'cs_foreman_route' },
  paths: [[[0, 84], [0, 50], [0, 14], [0, -30], [0, -62], [0, -84]], [[0, 22], [-22, 22], [-42, 20]], [[0, -6], [22, -16], [44, -28]], [[0, 2], [40, 6], [78, 12]], [[0, -14], [-40, -18], [-68, -22]]],
  decor: [
    { kind: 'tent', x: -6, z: 58, v: 0x2a4a50 }, { kind: 'tent', x: 7, z: 57, v: 0x2a4a50 }, { kind: 'fire', x: 0, z: 62 }, { kind: 'crate', x: 6, z: 66 },
    { kind: 'banner', x: -4, z: 50, v: 0x30c0c0 }, { kind: 'banner', x: 4, z: 50, v: 0x30c0c0 },
  ],
  npcs: [
    { ...IOLA_NPC, id: 'iola', x: 3, z: 56, idle: '钟停了……你听，海水在往回退。它要醒了。' },
    { id: 'cs_vik', name: '维克', title: '潮痕营地 · 补给商', role: 'supply', x: -9, z: 61, yaw: Math.PI / 2, model: 'Barbarian@mr_vik', tint: 0x3a4a4a, tintK: 0.4, idle: '退潮的时候去沉船湾，涨潮了就别在浅滩里泡着。' },
  ],
  mobs: {
    cs_drowned: dlcMob('溺亡回响', 31, 'dlc1_drowned', {}),
    cs_bellcrab: dlcMob('钟壳蟹', 32, 'dlc1_bellcrab', { scale: 1.15, speed: 3.2, hp: 2600 }),
    cs_siren: dlcMob('潮鳍妖', 33, 'dlc1_siren', { ranged: true, range: 10, aggro: 13, interval: 2.2, shot: { color: 0x40e0e0, el: 'frost' } }),
    cs_foreman: dlcMob('回响 · 溺亡工头格罗克', 35, 'dlc1_echo_foreman', { scale: 1.45, elite: true, hp: 16000, dmg: 130, interval: 2.3, speed: 3, range: 3.2, xp: 1800, leash: 36, onHitDot: { dps: 22, duration: 4 }, loot: 'elite_ember' }),
  },
  packs: [
    { kinds: ['cs_drowned', 'cs_drowned'], x: -6, z: 4, respawn: 40, hot: true }, { kinds: ['cs_drowned', 'cs_drowned', 'cs_drowned'], x: 10, z: -18, respawn: 40, hot: true },
    { kinds: ['cs_drowned', 'cs_drowned'], x: 14, z: 8, respawn: 40, hot: true },
    { kinds: ['cs_bellcrab', 'cs_bellcrab'], x: -44, z: 10, respawn: 40, hot: true }, { kinds: ['cs_bellcrab', 'cs_drowned'], x: -36, z: 30, respawn: 40, hot: true },
    { kinds: ['cs_bellcrab'], x: -56, z: 24, respawn: 40, hot: true },
    { kinds: ['cs_siren', 'cs_siren'], x: 44, z: -24, respawn: 40, hot: true }, { kinds: ['cs_siren', 'cs_bellcrab'], x: 52, z: -40, respawn: 40, hot: true },
    { kinds: ['cs_siren', 'cs_drowned'], x: 2, z: -56, respawn: 40, hot: true }, { kinds: ['cs_siren', 'cs_siren'], x: -16, z: -64, respawn: 40, hot: true },
    // v1.2.71 东岸码头 / 西岸礁湾
    { kinds: ['cs_drowned', 'cs_drowned'], x: 76, z: 30, respawn: 40 }, { kinds: ['cs_siren', 'cs_drowned'], x: 74, z: -10, respawn: 40 },
    { kinds: ['cs_bellcrab', 'cs_bellcrab'], x: -70, z: -8, respawn: 40 }, { kinds: ['cs_siren', 'cs_drowned'], x: -86, z: -40, respawn: 40 },
  ],
  elite: { kind: 'cs_foreman', route: [[0, -30], [-14, -46], [2, -62], [18, -48], [10, -32]], respawn: 180 },
  build,
  groundAdd: coastGround, solidAt: coastSolid,   // v1.2.71 海岸地形：东西两侧海床、栈桥 / 礁石堤 / 井台甲板高度；深水 / 井口不可走
};
/** 退潮宝箱 / 潮池位置给测试用 */
export const COAST_TIDE_INFO = { pools: TIDE_POOLS, chests: WRECK_CHESTS };

let ctx: PackCtx | null = null;
export const bindCoast = (c: PackCtx) => { ctx = c; };
export const coastCtx = () => ctx;
export const COAST_WAYPOINT: PackWaypoint = {
  id: 'dlc1_coast_wp', name: '沉钟海岸', desc: '31–35 级 · 第七章「沉钟」 · 地底之海', zone: COAST_ID,
  locked: () => !ctx ? '进入游戏后才能前往' : ctx.level() < 30 ? '需要等级 30（通关本体主线后开放）' : null,
  go: () => { ctx?.goMap(COAST_ID, undefined, '前往'); },
};

campDressBind([COAST_ID]);   // fix1107 营地帐篷 / 货箱 / 栅栏桩换写实件（同镜渊城）
