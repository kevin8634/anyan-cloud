// ======================================================================
// DLC1 镜渊城（35–38 级，第八章「镜渊城」）—— v1.0.5
// 概念图：files/art/dlc1/d14_mirror_city.png / d14_charon.png / d14_city_mobs.png（Rhett 2026-10-22 确认）
// 鸣钟人之城倒挂在穹顶，脚下是像镜子一样的海面和碎石平台；城里居民都是回响。
// 区域机制：镜面通道 —— 三对镜子，走进一面从另一面出来（3 秒冷却）
// ======================================================================
import * as THREE from 'three';
import { sceneOr, sceneHang } from './lux_dlc';
import type { PackCtx, PackWaypoint, WildBuildApi } from '../../core/ContentPacks';
import { dlcMob } from './coast';
import { IOLA_NPC } from './iola_def';   // 11-17 与镜渊城同一份伊奥拉
import { domainBuild } from './domain_world';
import { plazaBuild, plazaUpdate, plazaBind } from './plaza_dress';
import { realWalkway } from './ground_marks';
import { curQuality } from '../../web/gfx';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { seabedUpdate, seabedLeave, seaEnv } from './seabed';   // v1.2.48 倒钟广场补完：地面 / 火焰 / 街灯 / 建筑 / NPC 写实   // v1.1.1 钟楼领地的 8 块地（只对守钟人显示）
import { seaGround, seaSolid } from './seafloor';
import { skyBuild } from './mirrorsky';   // 第五轮：地面起伏 / 石板 / 深水湖 + 石堤桥

export const MIRROR_ID = 'dlc1_mirror';
export const MIRROR_O = { x: 2400, z: -2100 };

/** 镜面通道（局部坐标，成对） */
export const MIRROR_PAIRS: [{ x: number; z: number }, { x: number; z: number }][] = [
  [{ x: -30, z: 12 }, { x: 30, z: 12 }],
  [{ x: -52, z: -28 }, { x: -12, z: -56 }],
  [{ x: 42, z: -34 }, { x: 12, z: -60 }],
];

// ---------------------------------------------------------------- 造景
const stone = (c = 0x2a3236) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
function hangingTower(h: number, r: number): THREE.Group {
  const g = new THREE.Group(), m = stone(0x262c30), roof = stone(0x3a3226);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 6), m); body.position.y = -h / 2; g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 1.15, h * 0.6, 6), roof); tip.rotation.x = Math.PI; tip.position.y = -h - h * 0.3; g.add(tip);
  for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xffc070 })); const a = i * 2.1; w.position.set(Math.cos(a) * r * 1.01, -h * (0.3 + i * 0.2), Math.sin(a) * r * 1.01); w.lookAt(0, w.position.y, 0); g.add(w); }
  return g;
}
function hangingBell(s: number): THREE.Group {
  const g = new THREE.Group(), br = new THREE.MeshStandardMaterial({ color: 0x5a4a28, metalness: 0.7, roughness: 0.45 });
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), stone(0x3a3a3a)); chain.position.y = -3; g.add(chain);
  const prof: THREE.Vector2[] = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.4 + 0.5 * t * t, -t * 1.4)); }
  const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), br); b.position.y = -6; (b.material as THREE.Material).side = THREE.DoubleSide; b.scale.setScalar(s); g.add(b);
  return g;
}
function mirrorFrame(): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 8, 24), new THREE.MeshStandardMaterial({ color: 0x6a5a30, metalness: 0.8, roughness: 0.35 }));
  frame.scale.set(1, 1.5, 1); frame.position.y = 2.3; g.add(frame);
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshStandardMaterial({ color: 0xbfeff0, metalness: 1, roughness: 0.08, emissive: 0x1a6a6a, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  face.scale.set(1, 1.5, 1); face.position.y = 2.3; g.add(face);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 8), stone()); base.position.y = 0.2; g.add(base);
  return g;
}
/** v1.2.45 Lux3D 青铜镜框（概念图 B3）+ 保留原发光镜面（镜面通道的视觉提示） */
function mirrorOf(): THREE.Object3D {
  const g = sceneOr('scene_mirrorframe', { h: 5.4 }, () => null);
  if (!g) return mirrorFrame();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 3.3), new THREE.MeshStandardMaterial({ color: 0xbfeff0, metalness: 1, roughness: 0.08, emissive: 0x1a6a6a, emissiveIntensity: 0.7, side: THREE.DoubleSide }));
  face.position.set(0, 2.75, 0.06); g.add(face); return g;
}
/** 镜面步道（连接城门 / 长街 / 镜廊 / 钟楼 / 提灯塔的主路标识）。
 *  修：原来 2.2 米宽纯青自发光长方块，主路那段从营地火堆（z = 60）一直铺过城门，像一条蓝色贴片。
 *  比赛版（非低画质）→ 湿石板嵌条 + 两侧青色矮灯（概念图 B3）；Q 版 → 保留镜面方块，降饱和 / 降自发光 / 半透明。两版都只从城门（z ≈ 37）往北，不进营地 */
const realWalk = () => 'scene_belltower' in PACK_CREATURE_GLB && curQuality !== 'low';
function walkway(len: number, seed = 7): THREE.Object3D {
  if (realWalk()) return realWalkway(len, curQuality === 'medium' ? undefined : seaEnv(), seed, 1.5, 8, false);   // 11-17 不要路面小地灯
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, len), new THREE.MeshStandardMaterial({ color: 0x6a9ea0, metalness: 0.7, roughness: 0.2, emissive: 0x1a6a6a, emissiveIntensity: 0.08, transparent: true, opacity: 0.55, depthWrite: false }));
  m.position.y = 0.035; return m;
}
function build(api: WildBuildApi) {
  // 第五轮：地底海穹顶 + 倒悬城（40–60 座，实例化）+ 钟乳石 + 破口冷月（mirrorsky）；原来散布的 46 座倒挂塔 / 6 口钟换掉
  try { skyBuild(api); } catch (e) { console.error('镜渊城穹顶出错', e); }
  void hangingTower; void hangingBell; void sceneHang;
  // 镜面通道：每对两面镜子
  for (const [a, b] of MIRROR_PAIRS) { api.add(mirrorOf(), a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); api.add(mirrorOf(), b.x, b.z, Math.atan2(a.x - b.x, a.z - b.z)); }
  // 发光的镜面步道
  api.add(walkway(37, 7), 0, 18.5); api.add(walkway(50, 11), 0, -25);   // 主路：城门内侧（z 37）→ 长街 → 提灯塔；不再铺进营地
  const w1 = walkway(40, 13); api.add(w1, -24, 4, Math.PI / 2.4); const w2 = walkway(40, 17); api.add(w2, 24, -6, -Math.PI / 2.4);
  // 地面上的断柱、落下的小钟
  [[-14, 40], [16, 44], [-44, 18], [50, 6], [-26, -58], [30, -52]].forEach(([x, z], i) => { const c = sceneOr('scene_ruins', { w: 6 + (i % 3) * 1.5 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3 + (i % 3) * 2, 6), stone(0x3a4044)); m.position.y = 1.5; return m; }, { tint: 0x7c827e, envK: 0.35, metal: 0.12 }); api.add(c, x, z, i * 1.3); });   // 第四轮：废墟浅色石块压暗成湿板岩色（水下暗场景里太跳）；10-27：石件金属度压到 0.12（原件整件按金属算 + 低环境反射 = 一片黑像没贴图），压暗减轻，钟单独青铜（envhd_kinds 分件）
  domainBuild(api);   // v1.1.1 钟楼领地
  try { plazaBuild(api, { x: 0, z: 58, r: 12 /* fix1109 #3：同 camps[0].r，沉船围墙沿木栅路径 */ }); } catch (e) { console.error('倒钟广场造景出错', e); }
}

export const MIRROR_WILD = {
  id: MIRROR_ID, name: '镜渊城', levels: [35, 38], minLevel: 34, desc: '倒钟广场 · 镜廊 · 钟楼 · 小圣堂 · 提灯塔（镜面通道：走进一面镜子，从另一面出来）',
  origin: MIRROR_O, half: 90, inner: 62,
  worldNode: { x: 0.5, y: 0.86 }, sandIcon: '镜渊城',
  // fix1107（Rhett 10:20：倒钟广场人物太黑）：半球光地面色 0x081418 → 0x34443f（主要照亮人物侧面 / 下半身，朝上的地面几乎不受影响），强度 0.92 → 1.12，太阳 1.15 → 1.35
  palette: { sky: 0x0a1c22, fog: 0x0c201e, fogNear: 28, fogFar: 130, hemi: 0x9cc6ba, ground: 0x34443f, hemiI: 1.12, sun: 1.35, sunColor: 0xa6d4cc,
    tA: 0x1e2a2e, tB: 0x141e22, path: 0x5a6a6a, cliff: 0x10181a, tex: ['rock', 'dirt', 'mud'], map: ['#14303a', '#081418'], grass: 0, cracks: 0, music: 'frost' },
  scatter: [
    { kind: 'mesa', n: 24, r: 3.4, s: [1.2, 2.4], color: 0x10181a, edge: true },
    { kind: 'obsidian', n: 34, r: 0.9, s: [0.6, 1.6], color: 0x1e2a2e },
    { kind: 'rock', n: 26, r: 0.9, s: [0.5, 1.2], color: 0x2a3438 },
  ],
  camps: [{ id: 'mr_camp', name: '倒钟广场', x: 0, z: 58, r: 12, main: true, waypoint: { x: 6.8, z: 62.5 } }],   // 11-14 Rhett 图三：传送阵挪离栅栏,
  gates: [{ to: 'dlc1_coast', x: 0, z: 84, name: '回沉钟海岸的倒悬阶梯', arrive: { x: 0, z: 78 } }, { to: 'dlc1_belltower', x: 34, z: -80, name: '通往无声钟楼的倒悬阶梯', arrive: { x: 30, z: -74 } }],
  spots: {
    mr_gate: { x: 0, z: 70, r: 10, name: '镜渊城入口' }, mr_plaza: { x: 0, z: 22, r: 14, name: '回响长街' },
    mr_gallery: { x: -46, z: 0, r: 16, name: '镜廊' }, mr_toy: { x: -58, z: -10, r: 4, name: '镜廊深处的木马' },
    mr_belltower: { x: 46, z: -10, r: 14, name: '钟楼' }, mr_chapel: { x: -36, z: -42, r: 10, name: '小圣堂' },
    mr_oven: { x: 26, z: 36, r: 5, name: '冷掉的面包炉' }, mr_lighthouse: { x: 0, z: -50, r: 12, name: '提灯塔' },
    mr_priest_route: { x: 0, z: -66, r: 18, name: '腐根祭司的巡游路线' },
    // v1.1.1 钟楼领地（9A-4..6）：r = 0 走不进去，由领地系统达成条件时推进
    dm_q_bell: { x: -26, z: 40, r: 0, name: '钟楼领地 · 钟楼' }, dm_q_res: { x: 0, z: 30, r: 0, name: '钟楼领地 · 回响长街' },
    dm_q_rule: { x: -26, z: 40, r: 0, name: '钟楼领地 · 钟楼' }, dm_q_chime: { x: 0, z: 22, r: 0, name: '任意地点' },
  },
  killArea: { mr_wraith: 'mr_plaza', mr_sentinel: 'mr_belltower', mr_moth: 'mr_lighthouse', mr_priest: 'mr_priest_route' },
  paths: [[[0, 84], [0, 50], [0, 10], [0, -40], [0, -66]], [[0, 12], [-24, 6], [-46, 0]], [[0, 0], [24, -6], [46, -10]], [[0, 30], [26, 36]], [[-46, 0], [-36, -42]]],
  decor: [
    { kind: 'tent', x: -7, z: 54, v: 0x2a3a4a }, { kind: 'fire', x: 0, z: 58 }, { kind: 'crate', x: -9, z: 62 },
    { kind: 'banner', x: -4, z: 47, v: 0x40d0d0 }, { kind: 'banner', x: 4, z: 47, v: 0x40d0d0 },
  ],
  npcs: [
    { id: 'charon', name: '卡戎', title: '被放逐的鸣钟人学者', role: 'quest', x: -2.8, z: 51.5, yaw: Math.PI, model: 'Mage@mr_charon', tint: 0x1a2a4a, tintK: 0.55, idle: '钟绳勒了这座城一千年。总得有人把它剪断。' },
    { ...IOLA_NPC, id: 'iola_m', x: 5, z: 52, idle: '这里是我的家。灯都灭了，可他们还在过那一天。' },
    { id: 'mr_mira', name: '米拉', title: '倒钟广场 · 补给商（回响）', role: 'supply', x: 9.2, z: 58, yaw: -Math.PI / 2, model: 'Rogue@mr_mira', tint: 0x2a4a4a, tintK: 0.45, idle: '要买什么？……奇怪，我好像昨天也问过你。' },
    // 回响居民（支线）
    { id: 'echo_ouf', name: '欧芙', title: '面包师（回响）', role: 'quest', x: 22, z: 32, yaw: 0.5, model: 'Rogue@mr_ouf', tint: 0x6a5a40, tintK: 0.4, idle: '面包快烤好了……炉子怎么是冷的？' },
    { id: 'echo_brun', name: '布伦', title: '守门人（回响）', role: 'quest', x: -6, z: 40, yaw: 0, model: 'Knight@mr_brun', tint: 0x3a4a5a, tintK: 0.45, idle: '门……我得守住门。' },
    { id: 'echo_tisha', name: '缇莎', title: '小女孩（回响）', role: 'quest', x: -12, z: 26, yaw: 1.2, model: 'Rogue@mr_tisha', tint: 0x5a6a8a, tintK: 0.4, idle: '我的木马跑进镜子里去了。' },
    { id: 'echo_hans', name: '老汉斯', title: '渔夫（回响）', role: 'quest', x: 14, z: 16, yaw: -1, model: 'Barbarian@mr_hans', tint: 0x4a5a5a, tintK: 0.4, idle: '潮水退得太远了，我的船够不着水。' },
    { id: 'echo_melo', name: '梅洛', title: '抄经员（回响）', role: 'quest', x: -20, z: 14, yaw: 1.6, model: 'Mage@mr_melo', tint: 0x4a4a3a, tintK: 0.45, idle: '最后一页……我得把它交出去。' },
    { id: 'echo_goz', name: '戈兹', title: '铁匠（回响）', role: 'quest', x: 32, z: 4, yaw: -1.4, model: 'Barbarian@mr_goz', tint: 0x5a3a2a, tintK: 0.45, idle: '钟铜不够了。没有钟铜，钟舌铸不出来。' },
    { id: 'echo_lian', name: '莉安', title: '新娘（回响）', role: 'quest', x: -30, z: -30, yaw: 0.6, model: 'Rogue_Hooded@mr_lian', tint: 0xb0b0c0, tintK: 0.5, idle: '他说钟响三下就来接我。' },
    { id: 'echo_pike', name: '派克', title: '学徒敲钟人（回响）', role: 'quest', x: 38, z: -18, yaw: -0.8, model: 'Rogue@mr_pike', tint: 0x3a4a6a, tintK: 0.45, idle: '师父让我爬上钟楼……可是楼梯是倒着的。' },
    { id: 'echo_sein', name: '赛恩', title: '卫兵队长（回响）', role: 'quest', x: 16, z: -28, yaw: -0.3, model: 'Knight@mr_sein', tint: 0x2a3a4a, tintK: 0.5, idle: '哨兵不听号令了。它们只听钟声。' },
    { id: 'echo_otta', name: '奥塔', title: '老妇人（回响）', role: 'quest', x: -7.5, z: 59.5, yaw: 0.4, model: 'Mage@mr_otta', tint: 0x5a5a6a, tintK: 0.45, idle: '我年轻的时候，每天都听着钟声睡觉。' },
  ],
  mobs: {
    mr_wraith: dlcMob('镜像碎影', 35, 'dlc1_mirror_wraith', { speed: 4.6 }),
    mr_sentinel: dlcMob('钟首哨兵', 36, 'dlc1_bell_sentinel', { hp: 3400, speed: 3, range: 2.8, interval: 2.0 }),
    mr_moth: dlcMob('提灯蛾', 37, 'dlc1_lantern_moth', { ranged: true, range: 11, aggro: 13, interval: 2.2, shot: { color: 0x60fff0, el: 'arcane' } }),
    mr_priest: dlcMob('回响 · 腐根祭司', 38, 'dlc1_echo_priest', { scale: 1.1, elite: true, hp: 19000, dmg: 140, interval: 2.3, speed: 3, range: 3.2, xp: 2100, leash: 36, onHitDot: { dps: 26, duration: 4 }, loot: 'elite_ember' }),
  },
  packs: [
    { kinds: ['mr_wraith', 'mr_wraith'], x: -8, z: 16, respawn: 40, hot: true }, { kinds: ['mr_wraith', 'mr_wraith', 'mr_wraith'], x: 10, z: 24, respawn: 40, hot: true },
    { kinds: ['mr_wraith', 'mr_wraith'], x: -44, z: 6, respawn: 40, hot: true }, { kinds: ['mr_wraith', 'mr_sentinel'], x: -48, z: -12, respawn: 40, hot: true },
    { kinds: ['mr_sentinel', 'mr_sentinel'], x: 46, z: -4, respawn: 40, hot: true }, { kinds: ['mr_sentinel'], x: 52, z: -18, respawn: 40, hot: true },
    { kinds: ['mr_sentinel', 'mr_wraith'], x: -34, z: -36, respawn: 40, hot: true },
    { kinds: ['mr_moth', 'mr_moth'], x: -6, z: -46, respawn: 40, hot: true }, { kinds: ['mr_moth', 'mr_moth'], x: 10, z: -52, respawn: 40, hot: true },
    { kinds: ['mr_moth', 'mr_sentinel'], x: 26, z: -40, respawn: 40, hot: true },
  ],
  elite: { kind: 'mr_priest', route: [[0, -58], [-16, -70], [0, -80], [16, -70]], respawn: 180 },
  build,
  groundAdd: seaGround, solidAt: seaSolid, floorSink: 0.35,
};

// ---------------------------------------------------------------- 镜面通道
let cd = 0, wasNear = false;
export function mirrorUpdate(dt: number, ctx: PackCtx | null) {
  cd = Math.max(0, cd - dt);
  if (!ctx || ctx.map() !== MIRROR_ID) { seabedLeave(); return; }
  plazaUpdate(dt);
  const p = ctx.playerPos(); seabedUpdate(dt, p);
  const lx = p.x - MIRROR_O.x, lz = p.z - MIRROR_O.z;
  let hit: { x: number; z: number } | null = null, from: { x: number; z: number } | null = null;
  for (const [a, b] of MIRROR_PAIRS) {
    if (Math.hypot(lx - a.x, lz - a.z) < 1.6) { hit = b; from = a; }
    else if (Math.hypot(lx - b.x, lz - b.z) < 1.6) { hit = a; from = b; }
  }
  if (!hit || !from) { wasNear = false; return; }
  if (cd > 0 || wasNear) return;
  // 落在目标镜子前方 3 米（朝来时那面镜子的反方向），避免一落地又被吸回去
  const dx = hit.x - from.x, dz = hit.z - from.z, L = Math.hypot(dx, dz) || 1;
  ctx.teleport(MIRROR_O.x + hit.x + dx / L * 3, MIRROR_O.z + hit.z + dz / L * 3);
  cd = 3; wasNear = true;
  ctx.toast('你穿过了镜面', '#9ae8f0');
}
export const mirrorDebug = () => ({ cd });

let ctx: PackCtx | null = null;
export const bindMirror = (c: PackCtx) => { ctx = c; plazaBind(); };
// 10-27：选角背景（selectStage）在 bindPacks 之前就生成倒钟广场，营地 NPC / 造景件也在那时创建 → 模型钩子等不到 bind，写实 NPC 退回经典 Q 版。模块加载时先注册一次（plazaBind 幂等）
plazaBind();
export const mirrorCtx = () => ctx;
export const MIRROR_WAYPOINT: PackWaypoint = {
  id: 'dlc1_mirror_wp', name: '镜渊城', desc: '35–38 级 · 第八章「镜渊城」 · 倒悬之城', zone: MIRROR_ID,
  locked: () => !ctx ? '进入游戏后才能前往' : ctx.level() < 34 ? '需要等级 34' : ctx.questState('cs7_6') !== 'done' ? '完成第七章「回响首领」后开放' : null,
  go: () => { ctx?.goMap(MIRROR_ID, undefined, '前往'); },
};
