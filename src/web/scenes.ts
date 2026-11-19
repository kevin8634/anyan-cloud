// 静态场景搭建（从 main.ts 拆出，阶段四末重构）：灰石营地 + 狼林、翠风原野、暗岩矿洞、腐沼神殿
// 只负责生成物件、记录碰撞圆和需要动画的节点；返回给 main.ts 使用。随机数用传进来的 srand，和拆分前的顺序完全一致
import * as THREE from 'three';
import { campRoad, campIsPathV, fieldRoad } from './road2';
import { makeUnifiedWaypoint, WAYPOINT_BLOCKS } from './waypoint3d';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { LootGenerator, ItemInstance, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { GAME_VERSION, CHANGELOG } from './version';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName } from '../core/Forge';
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef } from '../core/types';
import { SET_BONUSES } from '../data/warrior';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassDef, ClassId } from '../data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import * as M from './models';
import { makeLightPool, DUNG_POOL_OFF, LightPool } from './dung_lightpool';   // opt1118A 营地副本灯池（?off=raidlpool_camp）
import * as G from './gfx';
import { GameAudio, Theme } from './audio';
import { loadCharacters, AnimName } from './chars';
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { updateWater } from './textures';
import { NavGrid, Circle, Pos2 } from '../core/NavGrid';
import { AutoPath, AUTOPATH_STOP_TEXT } from '../core/AutoPath';
import { questTarget, nextHop, trackedList, GuideTarget, MapLink } from '../core/QuestGuide';
import { objectiveMax } from '../core/Quest';
import { EnemyBrain as Brain } from '../core/EnemyBrain';
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE, FIELD_STAR_GATE, CAMP_GATES } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD, BRIDGE2, FIELD_HALF, FIELD_RISES, fieldOnRamp, fieldSteep, LAKE_ON, RIVER_X0, lakeDist } from '../data/zone_field';
import { LAKE_WEXT } from '../data/field_lake';
import { buildFieldLake } from './field_lake_hd';   // 11-19 落霞湖 qllake
import * as FX from './fieldx';
import { buildFieldFlora, fieldFloraOn } from './field_flora';   // 11-15 写实草木（高 / 超高 / 中画质；低画质与 ?off=fieldflora 用旧版）
import { campFloraOpt, fieldFloraOpt } from './field_flora_maps';
import { upgradeFlags } from './field_flags';   // 11-16 旗帜布料摆动（?off=flags）
import { CHUNK } from '../core/Terrain';
import { buildMountains, mountainHdOn } from './mountain_hd';   // 11-16 远景雪山 / 山体（?off=mountainhd）
import { buildSnowFar, snowFarOn } from './snow_far';   // 11-17e 天边雪山（?off=snowfar）
import { dgScaleGroup } from './dgscale';   // 11-18 副本 ×1.5（?off=dgscale）
import { gatesHdOn, makeFieldPortal, makeReturnPortal } from './gates_hd';   // 11-16 野外传送门 / 回程门新外观（?off=gates）
import { GRAY_CAMP_HOOKS, type GrayCampApi } from '../core/ContentPacks';   // 11-18 灰石营地换 DLC 模型钩子
import { campHdOn, realTent, realStake, realRail, realCrate, realBarrel } from './camp_hd';   // 11-16 营地写实件（同 DLC 营地；?off=campdlc）

export function buildScenes(scene: THREE.Scene, isTouch: boolean, srand: () => number) {
const D = new THREE.Vector3(400, 0, 0);       // 暗岩矿洞原点（远离野外）
const BOSS_CENTER = new THREE.Vector3(D.x, 0, D.z - 62);
const SW = new THREE.Vector3(-400, 0, 0);     // 腐沼神殿原点
const SW_BOSS = new THREE.Vector3(SW.x, 0, SW.z - 62);
const WORLD_PORTAL = new THREE.Vector3(0, 0, -32);
const CAMP = new THREE.Vector3(0, 0, 6);
const F = new THREE.Vector3(FIELD_ORIGIN.x, 0, FIELD_ORIGIN.z);   // 翠风原野原点
const FIELD_GATE_POS = new THREE.Vector3(FIELD_GATE.x, 0, FIELD_GATE.z);                 // 营地南边的原野石门
const FIELD_RETURN = new THREE.Vector3(F.x + FIELD_SPOTS.portal.x, 0, F.z + FIELD_SPOTS.portal.z);   // 原野里回营地的石门
const FIELD_HAZE = new THREE.Color(0xead9b6);
const FIELD_EAST_POS = new THREE.Vector3(F.x + FIELD_EAST_GATE.x, 0, F.z + FIELD_EAST_GATE.z);   // 原野东边去赤砂裂谷的石门
const worldGroup = new THREE.Group(), dungeonGroup = new THREE.Group(), swampGroup = new THREE.Group(), fieldGroup = new THREE.Group();
scene.add(worldGroup, dungeonGroup, swampGroup, fieldGroup);
/** 营地的圆形障碍（寻路 + 碰撞），建场景时顺手记录 */
const campCircles: Circle[] = [];
const bakeStats: Record<string, { before: number; after: number }> = {};
const animated: { flames: THREE.Object3D[]; lights: THREE.PointLight[]; crystals: THREE.Object3D[]; cloths: THREE.Object3D[] } = { flames: [], lights: [], crystals: [], cloths: [] };
let grass: THREE.Object3D;
const place = (o: THREE.Object3D, x: number, z: number, ry = 0, grp = worldGroup) => { o.position.set(x, M.groundY(x, z), z); o.rotation.y = ry; grp.add(o); return o; };

  // 11-18 opt1118D：灰石营地登记件放进 grayLate 组，世界合批时跳过，等 GRAY_CAMP_HOOKS 跑完（藏掉被换的件）再单独合批——
  //   原来登记件先并进 worldGroup 大批次，钩子 visible=false 藏不掉已合并的几何（写实帐篷 / 木栅等会和 DLC 件叠在一起）。
  //   低画质（钩子本来就跳过）/ ?off=graylate：照旧一次合批，不登记推车 / 旗 / 火把 / 商摊 / 铁砧 / 小篝火 / 蘑菇
  const GRAY_LATE = (() => { try { return !/(?:[?&]off=[^&]*\bgraylate\b)/.test(location.search) && G.curQuality !== 'low'; } catch { return false; } })();
  const grayLate = new THREE.Group(); grayLate.name = 'grayLate'; if (GRAY_LATE) worldGroup.add(grayLate);
  const grayItems: GrayCampApi['items'] = [], gi = (kind: string, o: THREE.Object3D, x: number, z: number, ry = 0) => { grayItems.push({ kind, obj: o, x, z, ry }); if (GRAY_LATE && o.parent === worldGroup) grayLate.add(o); return o; };   // 11-18 灰石营地换 DLC 模型钩子用（GRAY_CAMP_HOOKS）
  const gl = (kind: string, o: THREE.Object3D, x: number, z: number, ry = 0) => (GRAY_LATE ? gi(kind, o, x, z, ry) : o);   // opt1118D 新登记的件（推车 / 旗 / 火把 / 商摊 / 铁砧 / 小篝火 / 蘑菇）
{ // 野外
  // 11-16e 地形挪到碰撞圆收齐之后再建（makeTerrain 不用 srand，随机序列不变）：营地主路要绕开树和石头
  const ffOn = fieldFloraOn(), campTrees: { x: number; z: number; s: number; ry: number; round: boolean }[] = [];
  grass = M.makeGrass(isTouch ? 2500 : 6000); const oldFlowers = M.makeFlowers(600);   // 新版也照样生成（保持随机序列不变），只是不挂上
  if (!ffOn) worldGroup.add(grass, oldFlowers);
  // 营地
  const campHd = campHdOn() && G.curQuality !== 'low';   // 11-16 中档起：帐篷 / 木栅 / 木箱 / 木桶换 DLC 营地同款写实件（碰撞圆照旧）
  ([[-7, 2, 0xb5653a], [7, 0, 0x6b8e23], [-5, 11, 0x9b5a2b], [6, 11, 0x5a7aa8]] as const).forEach(([x, z, c]) => { gi('tent', place(campHd ? realTent(c) : M.makeTent(c), x, z, Math.atan2(-x, 4 - z)), x, z, Math.atan2(-x, 4 - z)); campCircles.push({ x, z, r: 2.1 }); });
  const fire = place(M.makeCampfire(), 0, 4); fire.name = 'campfire'; gi('fire', fire, 0, 4); campCircles.push({ x: 0, z: 4, r: 0.9 });
  animated.flames.push(fire.getObjectByName('fire')!); animated.lights.push(fire.getObjectByName('fireLight') as THREE.PointLight);
  for (let a = 0; a < Math.PI * 2; a += 0.24) {
    if (Math.abs(a - Math.PI * 1.5) < 0.32 || Math.abs(a) < 0.32 || Math.abs(a - Math.PI / 2) < 0.32) continue;   // 北门、东门、南门
    const fx0 = Math.cos(a) * 16, fz0 = Math.sin(a) * 16 + 4, ry = -a + Math.PI / 2;
    if (campHd) {   // 11-16 同一段的 3 个桩位换写实木桩，两两之间搭横杆（段与段之间照旧留空，和碰撞圆一致）
      const ps = [0, 1, 2].map(k => { const x = fx0 + Math.cos(ry) * k, z = fz0 - Math.sin(ry) * k; gi('fence', place(realStake(a + k * 0.01, 2.2 * 0.62), x, z), x, z); return new THREE.Vector3(x, M.groundY(x, z), z); });
      for (let k = 0; k < 2; k++) { const rl = realRail(ps[k], ps[k + 1]); worldGroup.add(rl); gi('fence', rl, ps[k].x, ps[k].z); }
    } else gi('fence', place(M.makeFence(2), fx0, fz0, ry), fx0, fz0, ry);
    for (let k = 0; k <= 2; k += 0.5) campCircles.push({ x: fx0 + Math.cos(ry) * k, z: fz0 - Math.sin(ry) * k, r: 0.3 });
  }
  gl('cart', place(M.makeCart(), -10, -4, 0.6), -10, -4, 0.6); campCircles.push({ x: -10, z: -4, r: 1.3 });
  [[4, 7], [4.8, 7.6], [-3, -2], [9, 6]].forEach(([x, z], i) => { gi(i % 2 ? 'crate' : 'barrel', place(i % 2 ? (campHd ? realCrate(0.8) : M.makeCrate()) : (campHd ? realBarrel(0.95) : M.makeBarrel()), x, z, i), x, z, i); campCircles.push({ x, z, r: 0.5 }); });
  [[-2.5, -11.5], [2.5, -11.5], [14, 1.5], [14, 6.5]].forEach(([x, z]) => { const b = place(M.makeBanner(0x2a4da0), x, z, x > 10 ? Math.PI / 2 : 0); gl('banner', b, x, z, b.rotation.y); animated.cloths.push(b.getObjectByName('cloth')!); });
  [[-3, 1], [3.5, 8], [-8, 7]].forEach(([x, z]) => { const l = place(M.makeLantern(), x, z, srand() * 6); gi('lamp', l, x, z, l.rotation.y); animated.lights.push(l.children.find(c => (c as THREE.PointLight).isPointLight) as THREE.PointLight); });
  // 树林（东边稀疏，留出狼群空地）
  for (let i = 0; i < 170; i++) {
    const x = (srand() - 0.5) * 210, z = (srand() - 0.5) * 210;
    if (Math.hypot(x, z - 4) < 20 || (Math.abs(x) < 6 && z < 0 && z > -42) || M.isPath(x, z)) continue;
    if (x > 18 && x < 60 && Math.abs(z) < 22 && srand() < 0.75) continue;
    if (Math.abs(x) < 7 && z > 30 && z < 50) continue;                       // 原野石门前留空
    if (Math.hypot(x - CAMP_GATES.foothill.x, z - CAMP_GATES.foothill.z) < 7 || Math.hypot(x - CAMP_GATES.marsh.x, z - CAMP_GATES.marsh.z) < 7) continue;   // v0.9.2b 副本区路口留空
    const sc = 0.85 + srand() * 0.5;
    const pine = srand() < 0.6, tr = pine ? M.makeTree(srand) : M.makeRoundTree(srand), ry = srand() * 6;
    if (ffOn) campTrees.push({ x, z, s: sc, ry, round: !pine }); else place(tr, x, z, ry).scale.setScalar(sc);
    campCircles.push({ x, z, r: 0.4 * sc });
  }
  for (let i = 0; i < 45; i++) { const x = (srand() - 0.5) * 190, z = (srand() - 0.5) * 190; if (M.isPath(x, z) || Math.hypot(x, z - 4) < 16) continue; const sz = 0.4 + srand() * 1.1; place(M.makeRock(sz), x, z); campCircles.push({ x, z, r: sz * 0.85 }); }
  // 北边山壁 + 传送阵
  for (let i = -9; i <= 9; i++) { const r = M.makeRock(3 + srand() * 2.5, 0x6d665c); place(r, i * 4, -39 - srand() * 3); r.position.y += 1; }
  const portal = place(makeUnifiedWaypoint(), WORLD_PORTAL.x, WORLD_PORTAL.z); portal.name = 'worldPortal';   // v1.2.67 统一传送阵（原紫色圆环传送门）
  for (const b of WAYPOINT_BLOCKS) campCircles.push({ x: WORLD_PORTAL.x + b.x, z: WORLD_PORTAL.z + b.z, r: b.r });
  // 南边：通往翠风原野的石门（石拱 + 金色传送漩涡）
  const hdG = gatesHdOn();   // 11-16 新门自带门框，不再摆石拱（障碍圆照旧）
  const fgate = place(hdG ? makeFieldPortal(0xf0b030) : M.makePortal(0xf0b030), FIELD_GATE_POS.x, FIELD_GATE_POS.z); fgate.name = 'fieldGate';
  { const l = fgate.children.find(c => (c as THREE.PointLight).isPointLight); if (l) fgate.remove(l); }   // 营地灯够多了，石门不再加点光源（石门中心不加碰撞：自动寻路要走到门里）
  if (!hdG) place(M.makeArch(5.4, 4.2), FIELD_GATE_POS.x, FIELD_GATE_POS.z + 0.6);
  campCircles.push({ x: FIELD_GATE_POS.x - 2.7, z: FIELD_GATE_POS.z + 0.6, r: 0.7 }, { x: FIELD_GATE_POS.x + 2.7, z: FIELD_GATE_POS.z + 0.6, r: 0.7 });
  [[-3.6, 37], [3.6, 37]].forEach(([x, z]) => { const b = place(M.makeBanner(0xd08a20), x, z, 0); gl('banner', b, x, z, 0); animated.cloths.push(b.getObjectByName('cloth')!); });
  // v0.9.2b 东北暗岩山路 / 西南腐沼栈道：石拱 + 传送漩涡（通往两个副本区）
  for (const [id, color] of [['foothill', 0xffb040], ['marsh', 0x7ad040]] as const) {
    const gp = CAMP_GATES[id], ry = Math.atan2(gp.x, gp.z);
    const pt = place(hdG ? makeFieldPortal(color) : M.makePortal(color), gp.x, gp.z, ry); pt.name = `campGate_${id}`;
    { const l = pt.children.find(c => (c as THREE.PointLight).isPointLight); if (l) pt.remove(l); }
    if (!hdG) place(M.makeArch(5.4, 4.2), gp.x, gp.z, ry);
    const ux = Math.cos(ry), uz = -Math.sin(ry);
    campCircles.push({ x: gp.x + ux * 2.7, z: gp.z + uz * 2.7, r: 0.7 }, { x: gp.x - ux * 2.7, z: gp.z - uz * 2.7, r: 0.7 });
  }
  [[-3, -29], [3, -29]].forEach(([x, z]) => { const t = M.makeTorch(); place(t, x, z); t.position.y = 1.4; gl('torch', t, x, z); animated.flames.push(t.getObjectByName('flame')!); animated.lights.push(t.getObjectByName('torchLight') as THREE.PointLight); });
  // 商人货摊 + 铁砧（营地北侧，篝火对面）
  gl('stall', place(M.makeStall(), 0, 14.6, Math.PI), 0, 14.6, Math.PI); campCircles.push({ x: -0.8, z: 14.6, r: 1.1 }, { x: 0.8, z: 14.6, r: 1.1 });
  gl('anvil', place(M.makeAnvil(), 2.4, 13, 0.4), 2.4, 13, 0.4); campCircles.push({ x: 2.4, z: 13, r: 0.6 });
  // 艾拉的营地：西门外的小篝火和沼泽标本
  const fire2 = place(M.makeCampfire(), -13.5, 6); fire2.scale.setScalar(0.7); gl('smallfire', fire2, -13.5, 6);
  animated.flames.push(fire2.getObjectByName('fire')!); animated.lights.push(fire2.getObjectByName('fireLight') as THREE.PointLight);
  gl('mushroom', place(M.makeMushrooms(0x7aff4a, 3), -14.5, 3.5), -14.5, 3.5);
  campCircles.push({ x: -13.5, z: 6, r: 0.7 });
  campCircles.push({ x: 7, z: -6, r: 0.6 });   // 新手引导的训练假人（DUMMY_POS）
  worldGroup.add(M.makeTerrain(campRoad(campCircles, [[FIELD_GATE_POS.x, FIELD_GATE_POS.z], ...Object.values(CAMP_GATES).map(g => [g.x, g.z] as [number, number])])));
  upgradeFlags(worldGroup);   // 11-16 合批前换旗面
  bakeStats.world = M.bakeStatic(worldGroup, [portal, fgate, ...animated.flames, ...animated.cloths, GRAY_LATE ? grayLate : null]);   // opt1118D grayLate 等换装后再合批
  if (ffOn) worldGroup.add(buildFieldFlora(campFloraOpt(campTrees, campCircles, [{ x: WORLD_PORTAL.x, z: WORLD_PORTAL.z, r: 4 }, { x: FIELD_GATE_POS.x, z: FIELD_GATE_POS.z, r: 4 },
    ...Object.values(CAMP_GATES).map(g => ({ x: g.x, z: g.z, r: 4 }))])));   // 烘焙之后再挂（实例化草木不参与合批）
  if (mountainHdOn()) worldGroup.add(buildMountains({ style: 'camp', cx: 0, cz: 23, r0: 150, reach: 105 }));   // 11-16 远景山环
  if (snowFarOn()) worldGroup.add(buildSnowFar('camp'));   // 11-17e 天边雪山（零星雪顶；?off=snowfar）
}

// ---------------------------------------------------------------- 翠风原野
const fieldY = (x: number, z: number) => M.fieldGroundY(x - F.x, z - F.z, riverZ, FIELD_RISES);
const fieldAnim: { altar: THREE.Object3D | null; returnPortal: THREE.Object3D | null; spin: { o: THREE.Object3D; axis: 'x' | 'z'; speed: number }[] } = { altar: null, returnPortal: null, spin: [] };
/** v0.9.3b 原野物件按 40 米分块合批：每块一个 Group，远处的块整块隐藏（main.ts refreshActive 里切换） */
const fieldChunks: { g: THREE.Group; cx: number; cz: number }[] = [];
{
  const fg = fieldGroup;
  const putF = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, fieldY(x, z), z); o.rotation.y = ry; fg.add(o); return o; };
  const chunkMap = new Map<string, THREE.Group>();
  const chunkG = (x: number, z: number) => { const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), k = cx + ',' + cz; let g = chunkMap.get(k); if (!g) { g = new THREE.Group(); g.name = 'fchunk' + k; chunkMap.set(k, g); fg.add(g); fieldChunks.push({ g, cx, cz }); } return g; };
  /** 放进分块（静态物件） */
  const putC = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.set(x, fieldY(x, z), z); o.rotation.y = ry; chunkG(x, z).add(o); return o; };
  {   // 11-16e 魔兽式主路：绕开原野的树 / 石头等碰撞物；桥、浅滩、门、营地口不蜿蜒
    const rz = (x: number) => riverZ(x), mid = (b: { x0: number; x1: number }) => [(b.x0 + b.x1) / 2, rz((b.x0 + b.x1) / 2)] as [number, number];
    const pins: [number, number][] = [mid(BRIDGE), mid(FORD), mid(BRIDGE2), ...Object.values(FIELD_SPOTS).map(p => [p.x, p.z] as [number, number])];
    const road = fieldRoad(FIELD_PATHS, [F.x, F.z], FIELD_HALF, fieldObstacles().map(c => ({ x: c.x - F.x, z: c.z - F.z, r: c.r })).filter(c => c.r < 2.5), pins);
    fg.add(M.makeFieldTerrain(F, riverZ, fieldPathDist, undefined, road));   // rises 照旧不传
  }
  const FS = FIELD_SPOTS;
  const fgrass = M.makeFieldGrass(isTouch ? 4000 : 9000, F, (lx, lz) => fieldPathDist(lx, lz) > 1.6 && Math.abs(lz - riverZ(lx)) > 4.5 && Math.abs(lx) < FIELD_HALF - 4 && Math.abs(lz) < FIELD_HALF - 4
    && !(Math.abs(lx - FS.outpost.x) < 15 && Math.abs(lz - FS.outpost.z) < 11) && Math.hypot(lx - FS.ruins.x, lz - FS.ruins.z) > 4
    && Math.hypot(lx - FS.village.x, lz - FS.village.z) > 13 && Math.hypot(lx - FS.temple.x, lz - FS.temple.z) > 14 && !fieldOnRamp(lx, lz, 0.5) && !fieldSteep(lx, lz) && lakeDist(lx, lz) < -1, (lx, lz) => fieldY(F.x + lx, F.z + lz), FIELD_HALF * 2);
  fgrass.name = 'fieldGrass'; const ffOnF = fieldFloraOn(); if (!ffOnF) fg.add(fgrass);
  fg.add(M.makeRiver(F, riverZ, RIVER_HALF, LAKE_ON ? RIVER_X0 : -FIELD_HALF - 30, FIELD_HALF + 30));   // 11-19 qllake：河西端汇入落霞湖
  if (LAKE_ON) fg.add(buildFieldLake(F, fieldY));
  // 木桥 + 浅滩踩石
  putF(M.makeBridge(12.5, 5.2), F.x, F.z + riverZ(0), 0).position.y = 0.02;
  for (let k = -3; k <= 3; k++) { const r = M.makeRock(0.7, 0x8a8478); r.scale.y = 0.35; r.position.set(F.x - 55 + (k % 2) * 0.8, -0.05, F.z + riverZ(-55) + k * 1.2); fg.add(r); }
  // v0.9.3b 东边的石拱桥（桥面视觉拱起，人物仍按平地走）
  { const bx = (BRIDGE2.x0 + BRIDGE2.x1) / 2, a = Math.atan(5 * 0.045 * Math.cos(bx * 0.045)); const b = putC(FX.makeStoneBridge(12.5, BRIDGE2.x1 - BRIDGE2.x0), F.x + bx, F.z + riverZ(bx), -a); b.position.y = 0; }
  // 回营地的石门
  const hdF = gatesHdOn();   // 11-16 回程门 / 野外传送门新外观，不再摆石拱
  const ret = putF(hdF ? makeReturnPortal(0xf0b030) : M.makePortal(0xf0b030), FIELD_RETURN.x, FIELD_RETURN.z); ret.name = 'fieldReturn'; fieldAnim.returnPortal = ret;
  if (!hdF) putF(M.makeArch(5.4, 4.2), FIELD_RETURN.x, FIELD_RETURN.z - 0.6);
  // 物件（数据在 data/zone_field.ts，确定性随机，和寻路障碍一一对应）
  let seedF = 777; const rf = () => ((seedF = (seedF * 16807) % 2147483647) / 2147483647);
  const spinKeep: THREE.Object3D[] = [];
  for (const p of fieldProps()) {
    let o: THREE.Object3D;
    switch (p.kind) {
      case 'blocker': continue;
      case 'house': o = FX.makeHouse(p.v); break;
      case 'windmill': { o = FX.makeWindmill(); const b = o.getObjectByName('blades')!; fieldAnim.spin.push({ o: b, axis: 'z', speed: 0.5 }); spinKeep.push(b); break; }
      case 'watermill': { o = FX.makeWatermill(); const w = o.getObjectByName('wheel')!; fieldAnim.spin.push({ o: w, axis: 'x', speed: -0.7 }); spinKeep.push(w); break; }
      case 'well': o = FX.makeWell(); break;
      case 'stall': o = M.makeStall(); break;
      case 'cart': o = M.makeCart(); break;
      case 'hay': o = FX.makeHay(); o.scale.setScalar(p.s); break;
      case 'twall': o = FX.makeTempleWall(p.v); break;
      case 'tsteps': o = FX.makeTempleSteps(); break;
      case 'tstatue': o = FX.makeTempleStatue(p.v); break;
      case 'mine': o = FX.makeMineEntrance(); break;
      case 'cave': o = FX.makeCaveMouth(); break;
      case 'chest': o = FX.makeChest(); break;
      case 'birch': if (ffOnF) continue; o = M.makeBirch(rf, p.v); o.scale.setScalar(p.s); break;   // 新版：位置交给 fieldFloraOpt（寻路障碍不变）
      case 'oak': if (ffOnF) continue; o = M.makeAutumnOak(rf, p.v); o.scale.setScalar(p.s); break;
      case 'rock': o = M.makeRock(p.s, 0x9a9282); o.position.y = 0.2; break;
      case 'stake': o = M.makeStake(2.2 + p.v * 0.5); o.scale.setScalar(p.s); break;
      case 'tent': o = M.makeTent(p.v < 2 ? [0x6a8a4a, 0x8a6a3a][p.v] : [0x7a2a1a, 0x5a3020][p.v - 2]); break;
      case 'tower': o = M.makeWatchtower(); break;
      case 'fire': { o = M.makeCampfire(); if (p.v === 1) { const l = o.getObjectByName('fireLight'); if (l) o.remove(l); } else animated.lights.push(o.getObjectByName('fireLight') as THREE.PointLight); animated.flames.push(o.getObjectByName('fire')!); break; }
      case 'crate': o = p.v ? M.makeBarrel() : M.makeCrate(0.9); break;
      case 'table': o = M.makeHerbTable(); break;
      case 'banner': { o = M.makeBanner(0x3a7a3a); animated.cloths.push(o.getObjectByName('cloth')!); break; }
      case 'pillar': { o = M.makePillar(3 + p.v * 2.5, p.v > 0.55); o.traverse(m => { const mt = (m as THREE.Mesh).material as THREE.MeshToonMaterial; if (mt?.isMeshToonMaterial && mt.map) mt.color.lerp(new THREE.Color(0xd8d4c8), 0.4); }); break; }
      case 'block': o = M.makeRuinBlock(); break;
      case 'altar': o = M.makeStarAltar(); fieldAnim.altar = o; break;
      case 'hut': o = M.makeHut(); break;
      case 'stone': o = M.makeStandingStone(); break;
    }
    const y0 = o.position.y;
    putC(o, p.x, p.z, p.ry); o.position.y += y0;
  }
  // 丘陵外的远景树（不挡路）：v0.9.3b 方框外一圈
  const ring: { x: number; z: number; s: number; ry: number; birch: boolean }[] = [];
  for (let i = 0; i < 110; i++) {
    const t = srand() * 4, u = (srand() - 0.5) * 2 * (FIELD_HALF + 14), d = FIELD_HALF + 6 + srand() * 18;
    const [lx, lz] = t < 1 ? [u, -d] : t < 2 ? [u, d] : t < 3 ? [-d - LAKE_WEXT, u] : [d, u];   // qllake：西边一圈随边界外移
    if (ffOnF) { const birch = srand() < 0.7; srand(); const ry = srand() * 6; ring.push({ x: F.x + lx, z: F.z + lz, birch, ry, s: 1 + srand() * 0.5 }); continue; }   // 与旧版消耗同样多的随机数
    putC(srand() < 0.7 ? M.makeBirch(rf, srand()) : M.makeAutumnOak(rf, srand()), F.x + lx, F.z + lz, srand() * 6).scale.setScalar(1 + srand() * 0.5);
  }
  const eastGate = putF(hdF ? makeFieldPortal(0xff9a40) : M.makePortal(0xff9a40), FIELD_EAST_POS.x, FIELD_EAST_POS.z, Math.PI / 2); eastGate.name = 'fieldEast';
  if (!hdF) putF(M.makeArch(5.4, 4.2), FIELD_EAST_POS.x + 0.6, FIELD_EAST_POS.z, Math.PI / 2);
  const starGate = putF(hdF ? makeFieldPortal(0xb080ff) : M.makePortal(0xb080ff), F.x + FIELD_STAR_GATE.x, F.z + FIELD_STAR_GATE.z, Math.PI / 2); starGate.name = 'fieldStar';   // v0.9.3e 去星落高原
  if (!hdF) putF(M.makeArch(5.4, 4.2), F.x + FIELD_STAR_GATE.x + 0.6, F.z + FIELD_STAR_GATE.z, Math.PI / 2);
  upgradeFlags(fg);   // 11-16 合批前换旗面
  const keepF = [ret, eastGate, starGate, fgrass, fieldAnim.altar, ...spinKeep, ...animated.flames, ...animated.cloths];
  const sum = { before: 0, after: 0 };
  for (const c of fieldChunks) { const st = M.bakeStatic(c.g, keepF); sum.before += st.before; sum.after += st.after; }
  const rest = M.bakeStatic(fg, [...keepF, ...fieldChunks.map(c => c.g)]); sum.before += rest.before; sum.after += rest.after;
  bakeStats.field = sum;
  if (mountainHdOn()) fg.add(buildMountains({ style: 'field', cx: F.x - LAKE_WEXT / 2, cz: F.z, r0: FIELD_HALF + 46 + LAKE_WEXT / 2, reach: FIELD_HALF * 1.42 + 15 + LAKE_WEXT / 2 }));   // qllake：山环中心西移半个扩宽、半径同加，东边山脚不动   // 11-16 远景山环（远处雪顶）
  if (snowFarOn()) fg.add(buildSnowFar('field'));   // 11-17e 天边雪山（只有高峰雪顶；?off=snowfar）
  if (ffOnF) { const ff = buildFieldFlora(fieldFloraOpt(ring)); fg.add(ff); }   // 11-15 写实草木（烘焙之后挂）
  fg.visible = false;
}

const dungeonGates: THREE.Object3D[] = [], swampGates: THREE.Object3D[] = [];
let exitPortal: THREE.Object3D;
let bossPortal: THREE.Object3D;
let swampExit: THREE.Object3D, swampBossPortal: THREE.Object3D;
const swampAnim: { fog: THREE.Object3D[]; pools: THREE.Object3D[]; vines: THREE.Object3D[] } = { fog: [], pools: [], vines: [] };
// opt1118A 营地副本区两个普通副本（暗岩矿洞 / 腐沼神殿）推广副本灯池：会闪烁的火把 / 蘑菇灯（animated.lights）+ 直接挂在副本组下的首领顶灯登记进池；
//   传送门灯不进池。副本组整组放大过（dgScaleGroup），池子算的是世界坐标 → 池组反向抵消父组变换（世界矩阵 = 单位阵），显隐仍跟副本组走。
//   闪烁照旧：池子每帧读原灯亮度（main.ts updateAmbient 仍在改摘下来的原灯）。?off=raidlpool_camp（或 dunglightpool）回每灯一盏真点光
const CAMPDG_POOL_OFF = (() => { try { return /(?:[?&]off=[^&]*\braidlpool_camp\b)/.test(location.search); } catch { return false; } })();
const campDgPools: LightPool[] = [];
function campDgPool(root: THREE.Object3D): LightPool | null {
  if (CAMPDG_POOL_OFF || DUNG_POOL_OFF) return null;
  const al = new Set<THREE.Object3D>(animated.lights);
  const p = makeLightPool(root, l => al.has(l) || l.parent === root);
  const s = root.scale.x;
  if (s !== 1) { p.group.scale.setScalar(1 / s); p.group.position.set(-root.position.x / s, -root.position.y / s, -root.position.z / s); }
  return p;
}
{ // 副本
  const dg = dungeonGroup;
  // 地面：碎石泥地 + 中间被踩出来的泥路 + 铁轨边的石板（贴图混合）
  const floor = M.makeFloor(70, 120, ['rock', 'dirt', 'stone'], (x, z) => {
    const lz = z + 40;                          // 转回副本局部坐标（平面中心在 z=-40）
    const road = Math.max(0, 1 - Math.abs(x) / 4.5) * (lz > -47 ? 1 : 0.3);
    const arena = Math.hypot(x, lz + 62) < 13 ? 0.8 : 0;
    return [1 - Math.max(road, arena) * 0.9, road * 0.9, arena];
  }, [0.09, 0.12, 0.14]);
  floor.position.set(D.x, 0, D.z - 40); dg.add(floor);
  // 让材质偏暗冷，像矿洞
  ((floor.material as THREE.MeshToonMaterial).color).setHex(0x9a8c88);
  for (let z = 7; z > -50; z -= 2.2) for (const s of [-1, 1]) {
    const r = M.makeRock(1.7 + srand() * 1.2, 0x3a3430); r.position.set(D.x + s * (6.8 + srand()), 1.2 + srand(), D.z + z); dg.add(r);
    if (srand() < 0.25) { const cr = M.makeCrystal(srand() < 0.5 ? 0x9a5cff : 0x5ce1ff, 0.4); cr.position.set(D.x + s * 5.6, 0, D.z + z); dg.add(cr); animated.crystals.push(cr); }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.16) {
    if (Math.abs(a - Math.PI / 2) < 0.36) continue;  // 入口
    const r = M.makeRock(2.2 + srand() * 1.6, 0x3a3430); r.position.set(BOSS_CENTER.x + Math.cos(a) * 17, 1.5, BOSS_CENTER.z + Math.sin(a) * 17); dg.add(r);
  }
  // 顶部（洞顶石块，挡住天空感）
  // 洞顶抬高到 15 米以上，并且不描边：镜头钻进石头里时不会整屏变色（镜头高度在副本里也有上限，见 updateCamera）
  for (let z = 6; z > -80; z -= 6) { const r = M.noOutline(M.makeRock(6, 0x221e1c)); r.position.set(D.x + (srand() - 0.5) * 6, 15.5 + srand() * 2, D.z + z); dg.add(r); }
  const rails = M.makeRails(46); rails.position.set(D.x + 2.8, 0, D.z - 18); dg.add(rails);
  [[2.8, -6], [2.8, -30], [-3.2, -40]].forEach(([x, z], i) => { const mc = M.makeMineCart(i !== 1); mc.position.set(D.x + x, 0, D.z + z); mc.rotation.y = i === 2 ? 0.4 : 0; dg.add(mc); });
  for (let z = 4; z > -48; z -= 10) { const sp = M.makeSupport(); sp.position.set(D.x, 0, D.z + z); dg.add(sp); }
  for (let z = 0; z > -60; z -= 12) for (const s of [-1, 1]) {
    const t = M.makeTorch(); t.position.set(D.x + s * 5.4, 2.4, D.z + z); dg.add(t);
    animated.flames.push(t.getObjectByName('flame')!); animated.lights.push(t.getObjectByName('torchLight') as THREE.PointLight);
  }
  [[-4, -10], [4.2, -36], [-4.5, -20]].forEach(([x, z], i) => { const o = i % 2 ? M.makeBarrel() : M.makeCrate(0.9); o.position.set(D.x + x, 0, D.z + z); dg.add(o); });
  const bl = new THREE.PointLight(0xaa66ff, 6, 45); bl.position.set(BOSS_CENTER.x, 7, BOSS_CENTER.z); dg.add(bl);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.3;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue;
    const cr = M.makeCrystal(0x9a5cff, 0.7 + srand() * 0.4); cr.position.set(BOSS_CENTER.x + Math.cos(a) * 14.5, 0, BOSS_CENTER.z + Math.sin(a) * 14.5); dg.add(cr); animated.crystals.push(cr);
  }
  const rune = M.makeRing(0x9a5cff, 0.5); rune.scale.setScalar(9); rune.position.set(BOSS_CENTER.x, 0.03, BOSS_CENTER.z); dg.add(rune);
  [-24, -46].forEach(z => { const g = M.makeGate(); g.position.set(D.x, 0, D.z + z); dg.add(g); dungeonGates.push(g); });
  exitPortal = gatesHdOn() ? makeReturnPortal(0x3fbf3f) : M.makePortal(0x3fbf3f); exitPortal.position.set(D.x, 0, D.z + 5); dg.add(exitPortal);   // 11-16 回程门新外观
  bossPortal = M.makePortal(0x8a3fff, 'rift');   // v0.9.1d：首领门改为深渊裂隙造型
  bossPortal.position.set(BOSS_CENTER.x, 0, BOSS_CENTER.z - 10); bossPortal.visible = false; dg.add(bossPortal);   // v0.9.2b 修：这行之前被并进了注释，首领门一直在原点
  bossPortal.visible = true; bakeStats.darkrock = M.bakeStatic(dg, [...dungeonGates, exitPortal, bossPortal, ...animated.crystals, ...animated.flames]); bossPortal.visible = false;
  dgScaleGroup(dg, D);   // 11-18 副本 ×1.5：整组绕副本原点放大（位置 + 几何），平铺贴图 UV / 点光照距同步（?off=dgscale）
  { const p = campDgPool(dg); if (p) campDgPools.push(p); }   // opt1118A 矿洞 10 火把 + 首领顶灯进灯池
  dg.visible = false;
}

{ // 副本二：腐沼神殿 —— 浑浊的水、长满青苔的石头废墟、盘根、发光蘑菇、雾
  const sg = swampGroup;
  const O = SW;
  // 地面：泥地 / 堤道石板 / 青苔石（贴图混合）
  const floor = M.makeFloor(80, 124, ['mud', 'stone', 'grass'], (x, z) => {
    const lz = z + 40;
    const causeway = lz > -47 ? Math.max(0, 1 - Math.abs(x + Math.sin(lz * 0.12) * 1.5) / 6) : 0;
    const temple = (lz <= -22 && lz > -47 && Math.abs(x) < 7) || Math.hypot(x, lz + 62) < 14.5 ? 1 : 0;
    const moss = M.fbm(x * 0.15, lz * 0.15) > 0.55 ? 0.6 : 0;
    const st = Math.max(causeway * 0.7, temple * 0.95);
    return [Math.max(0, 1 - st - moss * 0.5), st, moss * (1 - st)];
  }, [0.1, 0.13, 0.1], 0.35);
  floor.position.set(O.x, 0, O.z - 40); sg.add(floor);
  // 两侧的沼泽水（滚动贴图），浮萍、芦苇
  for (const s of [-1, 1]) {
    const w = M.makeWater(22, 110); w.position.set(O.x + s * 19, 0.12, O.z - 30); sg.add(w);
    for (let i = 0; i < 26; i++) {
      const z = O.z + 6 - srand() * 52, x = O.x + s * (9 + srand() * 18);
      if (srand() < 0.5) { const l = M.makeLily(); l.position.set(x, 0.14, z); l.rotation.z = srand() * 6; sg.add(l); }
      else { const r = M.makeReeds(5 + Math.floor(srand() * 5), srand); r.position.set(x, 0, z); sg.add(r); }
    }
    for (let z = 8; z > -50; z -= 7) {           // 枯树和石头沿着水边
      const t = M.makeDeadTree(srand); t.position.set(O.x + s * (10 + srand() * 8), 0, O.z + z - srand() * 3); t.rotation.y = srand() * 6; sg.add(t);
      const r = M.makeRock(1.5 + srand() * 1.4, 0x6a7458); r.position.set(O.x + s * (8.5 + srand() * 2), 0.6, O.z + z); sg.add(r);
    }
  }
  // 堤道两侧的盘根、发光蘑菇
  let mushLights = 0;
  for (let z = 4; z > -46; z -= 6) for (const s of [-1, 1]) {
    if (srand() < 0.6) { const r = M.makeRoots(srand, 2.6); r.position.set(O.x + s * (6.5 + srand()), 0, O.z + z); r.rotation.y = srand() * 6; sg.add(r); }
    if (srand() < 0.45) {
      const lit = mushLights < 4 && (z - 4) % 12 === 0;      // 点光源很贵：整条堤道只给 4 丛蘑菇真正发光照亮周围
      const m = M.makeMushrooms(srand() < 0.7 ? 0x7aff4a : 0x40e0ff, 3 + Math.floor(srand() * 3), srand, lit); m.position.set(O.x + s * (6 + srand() * 1.5), 0, O.z + z - 2); sg.add(m);
      if (lit) { mushLights++; animated.lights.push(m.children.find(c => (c as THREE.PointLight).isPointLight) as THREE.PointLight); }
    }
  }
  // 神殿：回廊石柱 + 拱门 + 断墙
  for (let z = -24; z > -48; z -= 6) for (const s of [-1, 1]) { const p = M.makePillar(4 + srand() * 1.5, srand() < 0.4); p.position.set(O.x + s * 7.5, 0, O.z + z); p.rotation.y = srand(); sg.add(p); }
  // 拱门做高（横梁 9 米以上），镜头跟随时不会穿进横梁
  const arch1 = M.makeArch(12, 8); arch1.position.set(O.x, 0, O.z - 20); sg.add(arch1);
  const arch2 = M.makeArch(12, 8.5); arch2.position.set(O.x, 0, O.z - 49); sg.add(arch2);
  // Boss 场地：一圈断柱 + 中央祭坛 + 外圈毒水
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + 0.26;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue;
    const p = M.makePillar(3 + srand() * 3, srand() < 0.5); p.position.set(SW_BOSS.x + Math.cos(a) * 16, 0, SW_BOSS.z + Math.sin(a) * 16); sg.add(p);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.2) {
    if (Math.abs(a - Math.PI / 2) < 0.38) continue;
    const r = M.makeRock(2 + srand() * 1.5, 0x5a6448); r.position.set(SW_BOSS.x + Math.cos(a) * 18.5, 1.2, SW_BOSS.z + Math.sin(a) * 18.5); sg.add(r);
  }
  const altar = M.makeAltar(); altar.position.set(SW_BOSS.x, 0, SW_BOSS.z - 11); sg.add(altar); swampAnim.pools.push(altar.getObjectByName('pool')!);
  const rune = M.makeRing(0x7aff3a, 0.45); rune.scale.setScalar(10); rune.position.set(SW_BOSS.x, 0.04, SW_BOSS.z); sg.add(rune);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const m = M.makeMushrooms(0x9aff40, 4, srand); m.position.set(SW_BOSS.x + Math.cos(a) * 13.5, 0, SW_BOSS.z + Math.sin(a) * 13.5); sg.add(m); }
  const bl = new THREE.PointLight(0x80ff60, 5, 40); bl.position.set(SW_BOSS.x, 8, SW_BOSS.z); sg.add(bl);
  // 雾：贴地的柔光片
  for (let i = 0; i < 26; i++) { const f = M.makeFogPatch(10 + srand() * 10, srand() < 0.5 ? 0x9ac88a : 0x6a9a7a, 0.12 + srand() * 0.1); f.position.set(O.x + (srand() - 0.5) * 50, 0.4 + srand() * 1.4, O.z + 8 - srand() * 80); f.userData.drift = srand() * 6; sg.add(f); swampAnim.fog.push(f); }
  // 门：藤蔓缠绕的石门（复用铁门造型，染成绿色）
  [-24, -46].forEach(z => {
    const g = M.makeGate(); g.position.set(O.x, 0, O.z + z); g.scale.set(1.35, 1, 1);
    g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial; if (m && m.isMeshToonMaterial) m.color.setHex(0x4a6a2a); });
    sg.add(g); swampGates.push(g);
  });
  swampExit = gatesHdOn() ? makeReturnPortal(0x3fbf3f) : M.makePortal(0x3fbf3f); swampExit.position.set(O.x, 0, O.z + 5); sg.add(swampExit);   // 11-16 回程门新外观
  swampBossPortal = M.makePortal(0x3fbf3f); swampBossPortal.position.set(SW_BOSS.x, 0, SW_BOSS.z - 4 + 14); sg.add(swampBossPortal);
  bakeStats.swamp = M.bakeStatic(sg, [...swampGates, swampExit, swampBossPortal, ...swampAnim.fog, ...swampAnim.pools]);
  swampBossPortal.visible = false;
  dgScaleGroup(sg, O);   // 11-18 副本 ×1.5（?off=dgscale）
  { const p = campDgPool(sg); if (p) campDgPools.push(p); }   // opt1118A 神殿发光蘑菇 + 首领顶灯进灯池
  sg.visible = false;
}
  /** 11-18 灰石营地换 DLC 模型（GRAY_CAMP_HOOKS；不注册 = 不变）：main 在模型加载完、选角之前调一次 */
  let grayDone = false;
  const grayLateBake = () => {   // opt1118D：换装后合批 grayLate（藏掉的件整枝跳过，不并进批次）
    if (!GRAY_LATE || grayLate.userData.baked) return; grayLate.userData.baked = true;
    const hid: THREE.Object3D[] = []; grayLate.traverse(o => { if (!o.visible) hid.push(o); });
    try { bakeStats.gray = M.bakeStatic(grayLate, [...animated.flames, ...animated.cloths, ...hid]); } catch (e) { console.error('灰石营地合批出错', e); } };
  const grayCampApply = () => { if (grayDone || !GRAY_CAMP_HOOKS.length) { grayLateBake(); return 0; } grayDone = true; let n = 0;
    const api: GrayCampApi = { add: (o, lx, lz, ry = 0) => { const ob = o as THREE.Object3D, y0 = ob.position.y; place(ob, lx, lz, ry); ob.position.y += y0; return ob; }, groundY: (lx, lz) => M.groundY(lx, lz), origin: { x: 0, z: 0 },
      block: (lx, lz, r) => { if (r > 0) campCircles.push({ x: lx, z: lz, r }); }, items: grayItems };
    for (const h of GRAY_CAMP_HOOKS) { try { h(api); n++; } catch (e) { console.error('灰石营地换装出错', e); } }
    grayLateBake();
    return n; };
  return { grayCampApply, D, BOSS_CENTER, SW, SW_BOSS, WORLD_PORTAL, CAMP, F, FIELD_GATE_POS, FIELD_RETURN, FIELD_HAZE, FIELD_EAST_POS, worldGroup, dungeonGroup, swampGroup, fieldGroup, campCircles, bakeStats, animated, grass, place, fieldY, fieldAnim, fieldChunks, dungeonGates, swampGates, exitPortal, bossPortal, swampExit, swampBossPortal, swampAnim, campDgPools };
}
