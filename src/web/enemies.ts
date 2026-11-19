// 敌人生成：营地 / 原野 / 副本 / 新地图，Boss、怪物攻击结算
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindEnemies(C) 初始化
import { zoneStorm, BOSS_ZONE_GAIN } from './zonestorm';   // v1.2.80b
import * as THREE from 'three';
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
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS, GROK_NIGHTMARE, mineLevelK } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS, ROTROOT_NIGHTMARE } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import * as M from './models';
import * as G from './gfx';
import * as BFX from './bossfx';
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
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS, RESPAWN, awayRule } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig, leveledType, miniEliteType } from './enemy_types';
const MINI_RESPAWN = 90;
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { bindHudBar, potionReady, usePotion, mini, mctx, miniTimer, updateMinimap, updateCompassPip, tipEl, showTip, hideTip, skillTip, SKILL_KEYS, skillEls, dodgeHud, updateHUD, wildSubArea, fieldSubArea, updatePlates } from './hudbar';
import { bindShopMap, goldHtml, stacksHtml, ShopTab, openShop, renderShop, openTravel, WmView, wmView, wmMap, WORLD_NODES, mapLock, openWorldMap, toggleWorldMap, allTargets, MK_TEXT, worldMapLegend, renderWorldMap, wmCv, drawWorldMap } from './shopmap';
import { bindGuideUi, pinned, unpinned, focusId, npcName, trackedIds, focusQuestId, safe, trackKey, saveTrack, loadTrack, setFocus, toggleTrack, Guide, guide, guidePath, guideTimer, guideFor, arriveR, goalDist, updateGuide, autoPath, pendingArrive, resumeAuto, inCombatNow, startAutoPath, toggleAutoPath, onAutoArrive, onZoneChanged, renderTracker, CHEV_MAX, chevMesh, chevM4, chevQ, chevS, chevP, chevC, chevUp, onBridge, pathY, updatePathLine, objMarker, updateObjMarker } from './guideui';
import { bindPanels, applySettings, renderSettings, saveAgo, bagSel, itemSlotHtml, itemKind, STAT_LABEL, itemTip, statLine, doEquip, doUnequip, renderBag, renderBagTip, DOLL_LEFT, DOLL_RIGHT, DOLL_BOTTOM, slotSilhouette, dollSlot, preview, tryOn, renderChar, dgSrc, dgFilter, openDropGuide, tryGuideItem, renderDropGuide, ROMAN, talState, renderTalents, talentTip, renderTalentTip } from './panels';
import { bindTravel, waypoints, BANK_SIZE, BANK_KEY, loadBank, saveBank, wildLock, BASE_CAMPS, allCamps, showLoading, hideLoading, goPending, goMap, defaultArrive, useGate, checkWaypoints, openWaypoints, RECALL_TIME, recall, recallDest, startRecall, cancelRecall, updateRecall, openBank, renderBank, WorldEventState, worldEvents, updateWorldEvents, startEvent, spawnEventWave, finishEvent } from './travel';
import { bindTutorial, TutId, TUT_ORDER, tutStep, tutReplay, dummy, DUMMY_POS, tutD, tutWantsDummy, kc, menuBtn, TUT, tutStart, tutEnter, tutAdvance, tutFinish, tutClearCircle, tutEvent, tutTimer, updateTutorial, updateTutCircle, tutHls, renderTut, replayTutorial, spawnDummy } from './tutorial';
import { bindLootNpc, loots, spawnLoot, updateLoot, pickupReq, nearestLoot, clearLootInZone, Npc, spawnWildNpcs, npcs, addNpc, Interactable, currentInteractable } from './lootnpc';
import { bindEffects, fxList, addFx, spawnRing, spawnSlash, spawnWhirl, spawnPillar, spawnLightning, zonesFx, spawnZoneFx, updateFx, FloatKind, Floater, FLOAT_CAP, floatPool, floats, floatLane, escHtml, releaseFloater, showFloat, DMG_COLOR, floatText, combatText, v3, project, updateFloats } from './effects';
import { bindCasting, ctx, projectiles, dist2d, liveEnemies, nearestEnemy, tryCast, basicCombo, executeSkill, launchProjectile, castTargetedCircle, spawnIceShards, applyHits } from './casting';
import { bindCombatEvents, castStat, onUnitDamaged, impactFx, hitFx, onUnitDeath, flashing, flash, updateFlash } from './combatev';
import { dgxBase, dgxType, dgxBossDmg, dgxSpeedMul, dgxOnEncounter, dgxOnComplete, dgxChoose, dgxBegin, dgxEnd, dgxRun, dgxHud } from './dungeonplus';
import { Diff, OathId, SYNC_LEVEL, DIFF, applyNightmareMechanic } from '../data/dungeon_plus';
import { raidCurrencyDrop } from '../core/Exchange';
import type { Ctx, Enemy } from './main';
import { spawnWorldBosses } from './worldboss';

let CX!: Ctx;

// ======================================================================
// 敌人生成
// ======================================================================
export function spawnWorldEnemies() {
  const spots: [number, number][] = [[28, 6], [32, -4], [26, -10], [38, 2], [40, 12], [34, 15], [46, -6], [50, 8], [44, -14], [24, 14]];
  spots.forEach(([x, z]) => CX.enemies.push(new CX.Enemy('wolf', ENEMY_TYPES.wolf, new THREE.Vector3(x, 0, z), 'world', '', 20)));
  spawnFieldEnemies();
}

/** 翠风原野：成群刷新的小怪 + 游荡精英 + 稀有怪 */
export function spawnFieldEnemies() {
  for (const pk of FIELD_PACKS) pk.kinds.forEach((k, i) => {
    const a = i / pk.kinds.length * Math.PI * 2 + 0.7, r = pk.kinds.length > 1 ? 2.4 : 0;
    const at = new THREE.Vector3(pk.x + Math.cos(a) * r, 0, pk.z + Math.sin(a) * r);
    const e = new CX.Enemy(k, ENEMY_TYPES[k], at, 'field', '', pk.respawn, FIELD_MOBS[k].loot); e.awayRespawn = !!pk.outer; CX.enemies.push(e);   // v0.9.3c 外环玩家走开 30 米才刷（老任务区不动）
  });
  const chief = new CX.Enemy('chief', ENEMY_TYPES.chief, new THREE.Vector3(CHIEF_ROUTE[0].x, 0, CHIEF_ROUTE[0].z), 'field', '', CHIEF_RESPAWN, FIELD_MOBS.chief.loot);
  chief.route = CHIEF_ROUTE.map(p => new THREE.Vector3(p.x, 0, p.z));
  CX.enemies.push(chief);
  const spots = RARE_SPOTS.map(p => new THREE.Vector3(p.x, 0, p.z));
  const rare = new CX.Enemy('goldboar', ENEMY_TYPES.goldboar, spots[Math.floor(CX.srand() * spots.length)], 'field', '', RARE_RESPAWN, FIELD_MOBS.goldboar.loot);
  rare.spots = spots; rare.rareRoll = [RESPAWN.rareMin, RESPAWN.rareMax];
  CX.enemies.push(rare);
  spawnWorldBosses('field');   // v0.9.3d 苔石（暂住坍塌神殿）
}

/** 新地图的怪：成群刷新 + 游荡精英 + 稀有怪（第一次进入地图时生成） */
export function spawnWildEnemies(id: WildId) {
  const w = WILD[id], O = w.origin;
  const mobLoot = (k: string) => w.mobs[k].loot;
  for (const pk of w.packs) pk.kinds.forEach((k, i) => {
    const a = i / pk.kinds.length * Math.PI * 2 + 0.7, r = pk.kinds.length > 1 ? 2.6 : 0;
    const e = new CX.Enemy(k, leveledType(k, pk.lv ?? 0), new THREE.Vector3(O.x + pk.x + Math.cos(a) * r, 0, O.z + pk.z + Math.sin(a) * r), id, '', pk.respawn ?? 30, mobLoot(k));
    e.awayRespawn = awayRule(pk);   // v0.9.3c 外环普通群等玩家走开 30 米才刷；刷怪点、老任务区不等
    CX.enemies.push(e);
  });
  // v0.9.3d 刷怪点（台地台顶）多 1 只小精英：同种怪强化版，90 秒刷新
  for (const pk of w.packs) if (pk.hot) {
    const k = pk.kinds[0];
    CX.enemies.push(new CX.Enemy(k, miniEliteType(k, pk.lv ?? 0), new THREE.Vector3(O.x + pk.x, 0, O.z + pk.z), id, '', MINI_RESPAWN, mobLoot(k)));
  }
  if (w.elite) {
    const route = w.elite.route.map(([x, z]) => new THREE.Vector3(O.x + x, 0, O.z + z));
    const e = new CX.Enemy(w.elite.kind, ENEMY_TYPES[w.elite.kind], route[0], id, '', w.elite.respawn, mobLoot(w.elite.kind)); e.route = route; CX.enemies.push(e);
  }
  // 烬落荒原的第二个精英：祭坛附近的灰烬祭司长
  if (id === 'ember') CX.enemies.push(new CX.Enemy('ash_priest', ENEMY_TYPES.ash_priest, new THREE.Vector3(O.x - 64, 0, O.z + 2), id, '', 220, mobLoot('ash_priest')));
  if (w.rare) {
    const spots = w.rare.spots.map(([x, z]) => new THREE.Vector3(O.x + x, 0, O.z + z));
    const e = new CX.Enemy(w.rare.kind, ENEMY_TYPES[w.rare.kind], spots[Math.floor(CX.srand() * spots.length)], id, '', w.rare.respawn, mobLoot(w.rare.kind)); e.spots = spots; e.rareRoll = [RESPAWN.rareMin, RESPAWN.rareMax]; CX.enemies.push(e);
  }  spawnWorldBosses(id);   // v0.9.3d 世界首领
}

/** 怪物攻击命中：动作 + 音效 + 伤害 */
export function enemyStrike(e: Enemy, tg: CombatUnit, d: number) {
  e.attackAnim = 0.35;
  if (e.type.ranged) {
    // 远程：发射毒弹，飞到目标身上才结算（走位可以躲开一部分）
    e.rig.anim?.play('shoot', 1.2);
    const sh = e.type.shot ?? { color: 0x7aff3a, el: 'nature' as Element };
    const orb = M.makeOrb(sh.color, sh.el === 'physical' ? 0.1 : 0.16); orb.position.copy(e.pos).setY(e.pos.y + 1.4 * e.rig.scale);
    CX.scene.add(orb);
    enemyShots.push({ mesh: orb, src: e, dmg: d, speed: sh.el === 'physical' ? 20 : 14, el: sh.el, color: sh.color });
    if (sh.el === 'physical') CX.audio.projectile(); else CX.audio.castBolt('nature');
    return;
  }
  e.rig.anim?.play(e.isBoss ? 'heavy' : 'attack1', e.isBoss ? 1 : 1.3);
  CX.audio.enemyAttack(e.kind);
  const bleed = e.kind === 'chief';                       // 赤鬃：流血（物理持续伤害）
  const dealt = CX.fx.dealDamage(tg, d, e.type.onHitDot && !bleed ? 'nature' : 'physical', e);
  void dealt;
  if (e.type.onHitDot && tg.alive) tg.status.add({ key: `${bleed ? 'bleed' : 'poison'}:${e.kind}`, kind: 'dot', remaining: e.type.onHitDot.duration, dps: e.type.onHitDot.dps, element: bleed ? 'physical' : 'nature', source: e });
}

/** 敌人的远程弹体：追踪玩家，0.6 米内命中；玩家离开 18 米以外则消散 */
export const enemyShots: { mesh: THREE.Object3D; src: Enemy; dmg: number; speed: number; el: Element; color: number }[] = [];

export function updateEnemyShots(dt: number) {
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    const to = CX.player.pos.clone().setY(CX.player.pos.y + 1.1);
    const d = s.mesh.position.distanceTo(to);
    if (Math.random() < 0.6) CX.particles.emit(s.mesh.position, { count: 1, color: s.color, color2: 0x204010, speed: 0.2, up: 0.1, life: 0.35, size: 0.25 });
    if (d < 0.6 || d > 22 || !CX.player.alive || s.src.z !== CX.zone) {
      if (d < 0.6 && CX.player.alive) { CX.fx.dealDamage(CX.player, s.dmg, s.el, s.src); if (s.el === 'physical' && s.src.kind.includes('archer')) CX.audio.hitSample('h_arrow_hit', 0.6, 0.08);   // 11-17 弓手 / 弩手箭矢命中玩家
        CX.particles.emit(to, { count: 10, color: s.color, color2: 0xffffff, speed: 2.5, up: 1, life: 0.4, size: 0.25, gravity: 4 }); }
      CX.scene.remove(s.mesh); enemyShots.splice(i, 1); continue;
    }
    s.mesh.position.addScaledVector(to.sub(s.mesh.position).normalize(), Math.min(d, s.speed * dt));
  }
}

export let boss: Enemy | null = null;

export let bossBrain: BossBrain | null = null;

export let bossDef: BossDef = BOSS_GROK;

export const telegraphs = new Map<number, { disc: THREE.Mesh; mat: THREE.ShaderMaterial; r: number; total: number; left: number }>();

/** v1.2.80b 区域件提前结束：隐藏（连同边缘层），旧圆盘直接摘掉 */
export function stormOff(o: THREE.Object3D) { o.visible = false; const ed = o.userData.edge as THREE.Object3D | null | undefined; if (ed) ed.visible = false; CX.scene.remove(o); }
export const poisonZones = new Map<number, { disc: THREE.Object3D; ring: THREE.Object3D; p: Pos; r: number }>();

/** Boss 技能命中玩家：伤害 + 附带效果（减速 / 中毒 / 眩晕） */
export function applyBossEffect(tg: CombatUnit, src: CombatUnit, effect?: EffectDef) {
  if (!effect || !tg.alive) return;
  if (effect.type === 'slow') tg.status.add({ key: 'boss-slow', kind: 'slow', remaining: effect.duration, percent: effect.percent, source: src });
  if (effect.type === 'dot') tg.status.add({ key: 'boss-dot', kind: 'dot', remaining: effect.duration, dps: effect.dps, element: effect.element, source: src });
  if (effect.type === 'stun') tg.status.add({ key: 'stun', kind: 'stun', remaining: effect.duration, source: src });
}

export function spawnDungeon() {
  clearDungeonEnemies();
  const L = CX.layout, O = L.origin;
  const dgB = dgxBase();   // v0.6.4 等级同步的基准
  L.gates.forEach(g => { g.visible = true; g.position.y = 0; });
  L.bossPortal.visible = false;
  CX.dungeonRun = new DungeonRun(L.def, {
    onEncounterCleared: (e, i) => { if (L.gates[i]) openGate(L.gates[i]); if (e.kind !== 'boss') CX.toast(`「${e.name}」已清理，前方的门打开了`, '#3f3'); dgxOnEncounter(e.kind, i); },
    onCompleted: (d, sec) => {
      CX.toast(`🏆 通关「${d.name}」！用时 ${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒`, '#ff8000');
      CX.quests.onDungeonClear(d.id);
      // 主线 v0.6.6（v0.5 C 的兑换货币）：史诗 / 噩梦难度首领掉暗岩徽记 + 余烬或碎晶
      raidCurrencyDrop({ dungeon: L.id, diff: dgxRun()?.diff }).forEach(st => { CX.inventory.addStack(st.id, st.count); CX.toast(`获得 ${CX.forge.stackDef(st.id)?.name ?? st.id} ×${st.count}`, '#ffb060'); });
      dgxOnComplete(d.name, sec, L.boss);
      L.bossPortal.visible = true;
      CX.audio.victory();
      CX.player.rig.anim?.play('cheer');
      CX.particles.emit({ x: CX.player.pos.x, y: 0.5, z: CX.player.pos.z }, { count: 120, color: 0xffd34d, color2: 0xff8000, speed: 3, up: 3, life: 1.6, size: 0.4, gravity: 2, drag: 0.6 });
      CX.save();
    },
  });
  const swamp = L.id === 'rotting_temple';
  const lvK = swamp ? 1 : mineLevelK(CX.progression.level);   // fix1108 #6 矿洞 10 级以下按玩家等级缩放
  const lvT = (t: EnemyType): EnemyType => lvK === 1 ? t : { ...t, hp: Math.max(1, Math.round(t.hp * lvK)), dmg: Math.max(1, Math.round(t.dmg * lvK)) };
  const add = (kind: string, x: number, z: number, enc: string) => {
    const e = new CX.Enemy(kind, lvT(dgxType(ENEMY_TYPES[kind], dgB)), new THREE.Vector3(O.x + x * L.s, 0, O.z + z * L.s), 'dungeon', enc, 0, swamp ? 'trash_swamp' : 'trash');   // 11-18 刷怪点是设计坐标 × s
    CX.enemies.push(e); CX.dungeonRun!.addUnit(enc, e.uid); return e;
  };
  if (!swamp) {
    add('miner', -2, -14, 'entrance'); add('miner', 2, -15, 'entrance'); add('miner', 0, -18, 'entrance');
    add('spider', -2, -34, 'tunnel'); add('spider', 2, -35, 'tunnel'); add('spider', 0, -38, 'tunnel');
    { const f = add('mine_foreman', 0, -41, 'tunnel'); f.lootTable = 'boss_foreman'; }   // v0.9.3j 前置首领：独立掉落
  } else {
    add('toad', -2.5, -12, 'causeway'); add('toad', 2.5, -13, 'causeway'); add('treant', 0, -17, 'causeway');
    add('cultist', -3, -38, 'nave'); add('cultist', 3, -39, 'nave'); add('treant', 0, -33, 'nave'); add('toad', 1.5, -35, 'nave');
  }

  // Boss
  bossDef = swamp ? BOSS_ROTROOT : BOSS_GROK;
  // v0.5 A（账号 B）的噩梦 Boss 新机制并入 A 的噩梦难度：格罗克「矿道崩塌」、腐根祭司「腐沼蔓生」
  if (dgxRun()?.diff === 'nightmare') bossDef = applyNightmareMechanic(bossDef, swamp ? ROTROOT_NIGHTMARE : GROK_NIGHTMARE);
  if (dgxSpeedMul() !== 1) bossDef = { ...bossDef, config: { ...bossDef.config, moveSpeed: bossDef.config.moveSpeed * dgxSpeedMul() } };
  // 11-18 副本 ×1.5（?off=dgscale）：首领近战距离 / 仇恨 / 拴绳跟体型、场地一起放大；技能红圈半径、伤害不变
  if (L.s !== 1) bossDef = { ...bossDef, config: { ...bossDef.config, attackRange: bossDef.config.attackRange * L.s, aggroRange: bossDef.config.aggroRange * L.s, leashRange: bossDef.config.leashRange * L.s } };
  const bossDmgK = dgxBossDmg(dgB) * lvK;
  const bt0: EnemyType = swamp
    ? { name: BOSS_ROTROOT.name, hp: BOSS_ROTROOT_HP, dmg: BOSS_ROTROOT.config.attackDamage, interval: 2, speed: 3.2, aggro: 11, range: 2.8, xp: 750, ilvl: 15, model: M.makeRotrootBoss }
    : { name: BOSS_GROK.name, hp: BOSS_GROK_HP, dmg: 40, interval: 2, speed: 3.5, aggro: 10, range: 2.8, xp: 450, ilvl: 12, model: M.makeBoss };
  const bt = lvT(dgxType(bt0, dgB, true));
  const b = new CX.Enemy(swamp ? 'boss_rotroot' : 'boss_grok', bt, L.boss.clone().add(new THREE.Vector3(0, 0, -4 * L.s)), 'dungeon', 'boss', 0, swamp ? 'boss_rotroot' : 'boss_grok', true);
  b.ccImmune = true;
  let castStop: (() => void) | null = null;   // v0.9.1f 读条聚能法阵
  const bb = new BossBrain(b, b.getPos(), bossDef, (tg, dmg, el, effect) => {
    b.attackAnim = 0.4;
    if (!effect) { b.rig.anim?.play('heavy'); CX.audio.enemyAttack('boss'); }
    CX.fx.dealDamage(tg, dmg * bossDmgK * (dgxRun()?.enraged ? 2 : 1), el, b);
    applyBossEffect(tg, b, effect);
  }, {
    onTelegraph: (id, p, r, d) => {
      const mat = G.telegraphMaterial();
      if (swamp) mat.uniforms.color.value.setRGB(0.55, 1.0, 0.15);     // 腐沼：毒绿色红圈
      const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
      disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, 0.05, p.z);
      CX.scene.add(disc); telegraphs.set(id, { disc, mat, r, total: d, left: d });
      b.rig.anim?.play('cast', 1.2);
      CX.audio.telegraph();
    },
    onTelegraphResolve: (id, hit) => {
      const t = telegraphs.get(id); if (!t) return;
      const c = { x: t.disc.position.x, z: t.disc.position.z };
      BFX.bossImpact(c, t.r, swamp ? 'nature' : 'stone');   // v0.9.1f
      if (swamp) {
        CX.particles.emit({ x: c.x, y: 0.1, z: c.z }, { count: 50, color: 0x5a4020, color2: 0x9aff40, speed: 4, up: 2.2, radius: t.r * 0.8, life: 0.9, size: 0.5, gravity: 6 });
        for (let i = 0; i < 4; i++) spawnRootSpike(c.x + (Math.random() - 0.5) * t.r, c.z + (Math.random() - 0.5) * t.r);
      }
      CX.audio.bossSlam();
      CX.scene.remove(t.disc); telegraphs.delete(id);
      CX.feel.emit(hit ? 'bossSlam' : 'bossSlamMiss');
    },
    onCastStart: (name, ct) => { CX.$('cb-name').textContent = name; b.rig.anim?.play('castLong', 0.8); CX.audio.bossCast(); castStop?.(); castStop = BFX.castCharge(() => b.pos, swamp ? 'nature' : 'stone', ct, b.rig.scale); },
    onCastEnd: (name, ok) => {
      castStop?.(); castStop = null;
      if (!ok) {
        BFX.castBreak(b.pos, swamp ? 'nature' : 'stone', b.rig.scale);
        CX.yell(`「${name}」被打断！`, '#3f3', 1.6); CX.audio.interrupt();
        CX.particles.emit({ x: b.pos.x, y: 2.5, z: b.pos.z }, { count: 40, color: 0xffffff, color2: 0xffd34d, speed: 7, up: 0.6, life: 0.5, size: 0.3, gravity: 8 });
        b.rig.anim?.play('hit');
      }
    },
    onHeal: v => { combatText(b, 'heal', v); CX.yell(`${bossDef.name}汲取了腐化之力！`, '#9aff40', 2); CX.audio.heal(); CX.particles.emit({ x: b.pos.x, y: 1, z: b.pos.z }, { count: 50, color: 0x7aff3a, color2: 0xffffff, speed: 1.5, up: 3, radius: 1.5, life: 1, size: 0.35 }); },
    onPhase: ph => { if (ph.yell) CX.yell(`${bossDef.name}：${ph.yell}`, '#ff5040', 3); CX.audio.roar(); CX.feel.kick(0.3); BFX.phaseBurst(b.pos, swamp ? 'nature' : 'stone', b.rig.scale); },
    onSummon: (n, unit) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5 + Math.random();
        const kind = unit ?? 'miner';
        const e = add(kind, (L.boss.x - O.x) / L.s + Math.cos(a) * 7, (L.boss.z - O.z) / L.s + Math.sin(a) * 7, 'boss');   // 11-18 add 收设计坐标
        e.brain.provoke();
        if (kind === 'vine') { CX.particles.emit({ x: e.pos.x, y: 0.2, z: e.pos.z }, { count: 30, color: 0x5a4020, color2: 0x9aff40, speed: 3, up: 2, life: 0.8, size: 0.45, gravity: 5 }); }
      }
      if (unit === 'vine') CX.toast('缠绕藤蔓破土而出！先清掉它们', '#9aff40');
    },
    onZone: (id, p, r, d) => {
      // v1.2.80b 首领毒池：实心荧光圆盘 → 通用区域件（毒），保留一圈淡判定环作机制预警
      const disc = zoneStorm(p, r, 'nature', d ?? 8, undefined, undefined, false, BOSS_ZONE_GAIN);
      const ring = M.makeRing('#9dba3a', 0.45); ring.scale.setScalar(r); ring.position.set(p.x, 0.07, p.z);
      CX.scene.add(ring); poisonZones.set(id, { disc, ring, p, r });
      CX.audio.poison();
    },
    onZoneEnd: id => { const z = poisonZones.get(id); if (z) { stormOff(z.disc); CX.scene.remove(z.ring); poisonZones.delete(id); } },
    onReset: () => { telegraphs.forEach(t => CX.scene.remove(t.disc)); telegraphs.clear(); poisonZones.forEach(z => { stormOff(z.disc); CX.scene.remove(z.ring); }); poisonZones.clear(); },
  });
  b.brain = bb;
  b.onInterrupt = () => bb.interrupt();
  boss = b; bossBrain = bb;
  CX.enemies.push(b); CX.dungeonRun.addUnit('boss', b.uid);
}

/** 根须穿刺的视觉：地面冒出尖刺，0.6 秒后缩回 */
export function spawnRootSpike(x: number, z: number) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 5), G.toon(0x4a3418));
  m.position.set(x, -0.8, z); m.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
  addFx(m, 0.7, k => { m.position.y = k < 0.3 ? -0.8 + k / 0.3 * 1.4 : 0.6 - (k - 0.3) / 0.7 * 1.4; });
}

export function clearDungeonEnemies() {
  for (let i = CX.enemies.length - 1; i >= 0; i--) if (CX.enemies[i].z === 'dungeon') { CX.enemies[i].dispose(); CX.enemies.splice(i, 1); }
  telegraphs.forEach(t => CX.scene.remove(t.disc)); telegraphs.clear();
  poisonZones.forEach(z => { stormOff(z.disc); CX.scene.remove(z.ring); }); poisonZones.clear();
  enemyShots.forEach(s => CX.scene.remove(s.mesh)); enemyShots.length = 0;
  boss = null; bossBrain = null;
}

export function openGate(g: THREE.Object3D) { gateAnims.push({ g, t: 0 }); }

export const gateAnims: { g: THREE.Object3D; t: number }[] = [];

/** 副本解锁条件：暗岩矿洞随时可进；腐沼神殿需要完成「深入暗岩矿洞」 */
export function dungeonLock(id: string): string | null {
  if (id === 'rotting_temple' && CX.quests.state('q_mine', CX.progression.level) !== 'done') return '需要先完成「深入暗岩矿洞」（击败监工格罗克并交任务）';
  return null;
}

export function enterDungeon(id = 'darkrock_mine', diff?: Diff, oaths: OathId[] = []) {
  const lock = dungeonLock(id);
  if (lock) { CX.toast(lock, '#f66'); CX.audio.error(); return; }
  CX.togglePanel('travel', false);
  // v0.6.4：30 级以后先选难度（英雄 / 史诗 / 噩梦等级同步）
  if (diff === undefined && CX.progression.level >= SYNC_LEVEL) { dgxChoose(id); return; }
  CX.layout = CX.LAYOUTS[id];
  dgxBegin(id, diff ?? 'normal', oaths);
  CX.layout = CX.LAYOUTS[id];
  spawnDungeon();
  CX.setZoneLook('dungeon');
  CX.player.pos.set(CX.layout.origin.x, 0, CX.layout.origin.z + 1 * CX.layout.s);
  CX.player.rig.root.rotation.y = Math.PI;
  CX.camYaw = 0; CX.target = null;
  { const r = dgxRun(); CX.toast(`进入：${CX.layout.def.name}${r && r.diff !== 'normal' ? `（${DIFF[r.diff].name}）` : ''}`, '#a335ee'); }
  CX.audio.portal();
  onZoneChanged();
  dgxHud();
}

/** 翠风原野：通关暗岩矿洞（交付「深入暗岩矿洞」）后开放 */
export function fieldLock(): string | null {
  return CX.quests.state('q_mine', CX.progression.level) === 'done' ? null : '需要先完成「深入暗岩矿洞」，石门才会开启';
}

export function enterField(): boolean {
  const lock = fieldLock();
  if (lock) { CX.toast(lock, '#f66'); CX.audio.error(); return false; }
  CX.panels.forEach(p => CX.togglePanel(p, false));
  enemyShots.forEach(s => CX.scene.remove(s.mesh)); enemyShots.length = 0;
  CX.setZoneLook('field');
  CX.player.pos.set(CX.F.x + FIELD_SPOTS.arrive.x, 0, CX.F.z + FIELD_SPOTS.arrive.z);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0; CX.target = null;
  CX.toast('进入：翠风原野（9~16 级）', '#f0c040');
  CX.audio.portal();
  onZoneChanged();
  return true;
}

export function leaveField() {
  enemyShots.forEach(s => CX.scene.remove(s.mesh)); enemyShots.length = 0;
  CX.setZoneLook('world');
  CX.player.pos.set(CX.FIELD_GATE_POS.x, 0, CX.FIELD_GATE_POS.z - 4);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0; CX.target = null;
  CX.toast('回到：灰石营地', '#ffd100');
  CX.audio.portal();
  onZoneChanged();
}

export function leaveDungeon(toCamp = false) {
  clearDungeonEnemies();
  dgxEnd(); dgxHud();
  CX.dungeonRun = null;
  CX.setZoneLook('world');
  CX.player.pos.copy(toCamp ? CX.CAMP : CX.WORLD_PORTAL.clone().add(new THREE.Vector3(0, 0, 4)));
  CX.player.rig.root.rotation.y = 0;
  CX.camYaw = Math.PI; CX.target = null;
  CX.audio.portal();
  onZoneChanged();
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindEnemies(__ctx: Ctx) {
  CX = __ctx;

}
