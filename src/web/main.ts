import { wakeTick, WAKE } from './water_wake';   // 11-18 r8 尾迹场（?off=wake）
import { qlSplashTick } from './ql_splash';   // 11-19 r8 水花 v2（?off=qlsplash）
import { makeCineSky, cineUpdate, cineSunOffset, cineSnapShadow, CINE, CINE_NAMES, cineApplyFlags, cineSwapWater, cineWaterTick, autoTier, cineDemoZone } from './cine';
import { dayNightOn } from './daynight';
import { ssSetSunLock, ssSetDemoSun, ssSetDemoFull } from './seasky_core';
import { QL_DEMO } from './map_look';
import { qlRaysOpt } from './ql_rays';
   // 11-17g 整套换成 Demo   // 11-17 太阳封顶高度（按图）
import { gameClock } from './hudclock';   // 11-14 电影感画质（须先于任何材质编译：模块加载即装着色器补丁）
import { updatePacks, packMoveMul, packOpeningVoice, packLift, packCamPull } from '../core/ContentPacks';   // v1.0.3 · v1.2.48 开场旁白
// 暗岩传说：深渊回响 · 浏览器版
// 战斗/技能/装备/天赋/任务/副本逻辑全部复用 src/core（和 Cocos 版同一套代码），这里只负责画面、输入和界面
import { rec, initRecMode, recKey, recUpdate, lerpPose } from './recmode';   // v1.2.38c 录制模式
import { photo, initPhotoMode, photoKey, photoToggle, photoUpdate, photoAfterRender } from './photomode';   // v1.2.52 拍照模式
import { noticeEl, ancientBanner, runeHudDebug, hudDemo } from './runehud';
import * as THREE from 'three';
import { setKtx2Renderer } from './ktx2';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { CDR_CAP, ULT_CDR_CAP_BASE } from '../core/SkillResolver';
import { LootGenerator, ItemInstance, itemColor, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME, FIXED_MIGRATE } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL, V3_SAVE_VER, treeSaveVer } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { applyPackCompat, carrySave, mergeDlcField, PackGameSave, PackFixReport } from '../core/PackSave';   // v0.9.7 DLC 框架：存档兼容
import { packs, hasPack, runStoryHooks, packList, packNpcActs, packZoneNpcs, packZoneProps } from '../core/ContentPacks';
import { weaponSkinRestore } from './weaponskin';
import { ptalInit, ptalLoad, ptalSaveInto, ptalSyncSkills, ptalSetPoints, ptalStats, ptalNodes, ptal } from './packtal';   // v1.0.1 扩展天赋层
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { GAME_VERSION, CHANGELOG, GAME_NAME, GAME_NAME_MAIN, GAME_NAME_SUB, BUILD_TAG } from './version';
import { firstCG } from './cgmovie';
import { LOGO_ANIM, LOGO_ANIM_WEBM } from './logoanim.gen';   // v1.2.74 标题页动态 LOGO   // v1.2.74 宣传片首播
import { skipIntro, introActive, titleFx, titleEnter, titleHtml, subText } from './intro';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName } from '../core/Forge';
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef } from '../core/types';
import { SET_BONUSES } from '../data/warrior';
import { DUNGEON_SETS } from '../data/dungeon_new';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassDef, ClassId, skillBookData, isClassAvailable } from '../data/classes';
import { SkillBook } from '../core/SkillBook';
import { TOME_ID, TOME_LEVELS } from '../data/skillbook';
import { rm3dFrame, rm3dActive, rm3dDebug } from './raidmap3d';
import { altarFrame, altarActive, altarDebug } from './altar3d';
import { buffHudDebug, buffTipDebug, buffDemo, iconsOf } from './buffhud';
import { wm3dFrame, wm3dActive, wm3dDebug } from './worldmap3d';
import { bindRaidMap, openRaidMap, toggleRaidMap, renderRaidMap, startRaidAuto, dmSelect, dmTeleport, dmView } from './raidmap';
import { bindMapPoi, noteRareSightings, mapStatsSave, mapStatsLoad, mapStats, poisFor } from './mappoi';
import { spiritResBonus } from './spirit_ui';
import { SKILL4, SKILL4B_LEVEL } from '../data/skills_v078';
import { unlocksAt } from '../data/unlocks';
import { renderAchv, ach as ACH_ } from './codex_ui';
import { bindAbyssUi, openAbyss, abyssPending } from './abyss_ui';   // v0.8.0 暗岩深渊
import { bindNext, nextSave, nextLoad, lessonOnLevel, milestoneCheck, nextDebug, showLesson, openNext, introDebug, introOpen, introSync, renderChapter } from './nextstep';   // v0.7.13 引导
import { LESSONS } from '../data/guide_v0713';
import { WILD as WILD_, WILD_IDS as WILD_IDS_ } from '../data/zones_wild';
import { QUALITIES as QUALS_ } from '../core/Loot';
import { bindAchv, achSave, achLoad, achDebug, achCheck } from './codex_ui';   // v0.7.12 成就与图鉴
import { bindParagon, paragon, paragonGainXp, paragonSave, paragonLoad, renderParagon } from './paragon_ui';   // v0.7.10
import { CLASS_QUESTS } from '../data/class_quests';
import { initCursors, setCursor, cursorDebug, CursorKind } from './cursors';   // v1.2.69 专属指针
import { bindDayNight, dayNightBase, dayNightTick, dayNightDebug, nightness, dayLevel, dayNightDemo } from './daynight';
import { ambTick, ambDebug } from './amb_sfx';   // 11-18 环境音接入
import { initNightGlow, nightGlowTick, nightGlowStats } from './night_glow';   // 11-18 夜间人物暖光 + 漂浮光点
import { nightRimTick } from './night_rim';   // 11-18 夜间怪物轮廓光   // v1.2.69
import { initHudClock, hudClockDebug, setGameHour } from './hudclock';   // v1.2.68 时间条
import { sortByHere, zoneTag, questProgressFor, questZones } from './questzone';   // v1.2.68
import { endgameCtxIlvl, abyFloorItems, abyMats, abyDarkOptions, abySetOptions } from './raid';
import { inLongRaid, enterAbyss, abyssLock, abyRec, inAbyss, abyssSave, abyssLoad, abyPick, abyssDebug, abyssKillAll, enterWeekly, weeklyInfo, weeklyDebug, weeklySetNow, enterStory, storyActive, storyDone, weeklyBest } from './raid';
import { showEnding, closeEnding, endingOpen } from './ending';   // v0.8.3   // v0.8.0 深渊
import { bindGearSets, gearSetsSave, gearSetsLoad, applyGearSet, saveGearSet, gearSetsDebug } from './gearsets';
import { resSetBonus } from './reshud';
import { TALENT_START_LEVEL, type TalentSave } from '../core/TalentTree';
import { classTuneMod, tuneFor } from '../data/classtune_v0714';
import { bindSpiritUi, spiritsReset, spiritsSave, spiritsLoad, spiritMods, spiritOnKill, openSpirits, renderSpirits, spiritDebug, spirits as SPIRITS_ } from './spirit_ui';
import { bindResHud, resReset, updateResHud, resDebug, res as RES } from './reshud';
import { bindAwakenUi, renderAwaken, openAwaken, awakenBossKill, runeWordsSave, runeWordsLoad, awakenDebug } from './awaken_ui';
import { awakenItem, migrateAwk, ultCdrCap, hasAwk } from '../core/Awaken';
import { slotTalents } from '../core/TalentTree';
import { slotOrigin, inheritedElements } from '../core/SkillBook';
import { setFireAlias } from './combatev';
import { bindSkillBookUi, renderSkillBook, onSkillCast, bookDrop, swapBlocked } from './skillbook_ui';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import { endgameIlvl, packZoneIlvl } from '../core/EndgameIlvl';
import { applyUpgrade } from '../core/Forge';
import * as M from './models';
import * as G from './gfx';
import { GameAudio, Theme } from './audio';
import { loadCharacters, AnimName, ensureHd, hdAvailable, BODY_SCALE, CLASS_BODY_HOOKS, CLASS_BODY_VARIANTS, classBodyOf, setClassBody, hdAvailable as hdHas } from './chars';
import { setCharModelMode } from './rig';
import { loadCreatures, startLazyCreatures, creatureTextures, glbNames, makeGlbProp } from './creatures_glb';
import { loadingStart, loadingFinish, loadTask, loadingDebug, zoneLoaderInit } from './loading';   // v1.2.49 加载画面（真实进度）
import { envHdTrack, envHdApply, envHdTier, envHdReady, envHdDebug } from './envhd';
import { tileLoad } from './tiletex';   // fix1106 无缝贴图   // v1.2.49 环境高精化
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { gearStowTick, stowForce, stowInfo, STOW_AFTER } from './weaponstow';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { updateWater } from './textures';
import { NavGrid, Circle, Pos2 } from '../core/NavGrid';
import { pickActive, MAX_ACTIVE, chunkOf, HeightField, MAX_WALK_SLOPE } from '../core/Terrain';
import { AutoPath, AUTOPATH_STOP_TEXT } from '../core/AutoPath';
import { questTarget, nextHop, trackedList, GuideTarget, MapLink } from '../core/QuestGuide';
import { objectiveMax } from '../core/Quest';
import { EnemyBrain as Brain } from '../core/EnemyBrain';
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE, isKnownMap, packZone } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, isPackWild, WildMob, WildNpc, FIELD_SERVICE_NPCS, RESPAWN } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { groveNav } from './field_flora';   // 11-18 林团寻路障碍
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD, fieldWalkY, FIELD_HALF, FIELD_WEST } from '../data/zone_field';

import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import { DUNGEON_SCALE, dgZone, dgV } from './dgscale';   // 11-18 副本 ×1.5（?off=dgscale）
import { selectPrepare, selectTick, selectCamera, selectInfo, selectScreens, setSelRenderer, selectWarm, setSelVignette, selOff, selectBlank } from './selectstage';
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { bindHudBar, potionReady, usePotion, mini, mctx, miniTimer, updateMinimap, updateCompassPip, tipEl, showTip, hideTip, skillTip, SKILL_KEYS, skillEls, dodgeHud, updateHUD, wildSubArea, fieldSubArea, updatePlates } from './hudbar';
import { wmHits, wmPoiAct, bindShopMap, goldHtml, stacksHtml, ShopTab, openShop, renderShop, openTravel, WmView, wmView, wmMap, WORLD_NODES, mapLock, openWorldMap, toggleWorldMap, allTargets, MK_TEXT, worldMapLegend, renderWorldMap, wmCv, drawWorldMap } from './shopmap';
import { hidePathLine, bindGuideUi, pinned, unpinned, focusId, npcName, trackedIds, focusQuestId, safe, trackKey, saveTrack, loadTrack, setFocus, toggleTrack, Guide, guide, guidePath, guideTimer, guideFor, arriveR, goalDist, updateGuide, autoPath, pendingArrive, resumeAuto, inCombatNow, startAutoPath, toggleAutoPath, onAutoArrive, onZoneChanged, renderTracker, CHEV_MAX, chevMesh, chevM4, chevQ, chevS, chevP, chevC, chevUp, onBridge, pathY, updatePathLine, objMarker, updateObjMarker } from './guideui';
import { openAltarFromMap, altarLocate, altarState, introItems } from './panels';
import { SET_PIECE_NAMES } from './guideintro';   // v0.9.6g
import { whereDrops } from './dropguide';
import { abyDarkSel } from './abyss_ui';
import { exportWithSkins, bindPanels, applySettings, renderSettings, saveAgo, bagSel, itemSlotHtml, itemKind, STAT_LABEL, itemTip, statLine, doEquip, doUnequip, renderBag, renderBagTip, DOLL_LEFT, DOLL_RIGHT, DOLL_BOTTOM, slotSilhouette, dollSlot, preview, tryOn, renderChar, dgSrc, dgFilter, openDropGuide, tryGuideItem, renderDropGuide, ROMAN, talState, renderTalents, talentTip, renderTalentTip, gearScoreInfo, scoreHtml, gearRoleNow } from './panels';
import { rescueForce, rescueDebug, rescueAlly } from './rescue';
import { bindDungeonPlus, dgxRelicItem, dgxHpPct, dgxUpdate, dgxSave, dgxLoad, dgxDebug, dgxPick, dgxAct, dgxForceAnomaly, dgxChoose, dgxInteract } from './dungeonplus';
import { raidBossDev } from './raid';
import { raidCleanup, raidWalk, raidLightPool, raidStepToward, raidStraight, raidBotGoal, raidRouteInfo, raidTeleport, bindRaid, raidPropsDebug, raidClamp, raidLook, raidSetVisible, raidSave, raidLoad, raidGatePos, raidMusic, raidMusicKey, updateRaid, raidRespawn, openRaidGuide, enterRaid, raidDebug, raidBotTarget, raidSafeSpot, openScholar, setRaidDarkChance, setAncientChance, raidEndgameDrop, abyDarkTake, raidEntry, abyDarkShow } from './raid';
import { bindTravel, waypoints, BANK_SIZE, BANK_KEY, loadBank, saveBank, wildLock, BASE_CAMPS, allCamps, showLoading, hideLoading, goPending, goMap, defaultArrive, useGate, checkWaypoints, openWaypoints, RECALL_TIME, recall, recallDest, startRecall, cancelRecall, updateRecall, openBank, renderBank, WorldEventState, worldEvents, updateWorldEvents, startEvent, spawnEventWave, finishEvent } from './travel';
import { bindTutorial, TutId, TUT_ORDER, tutStep, tutReplay, dummy, DUMMY_POS, tutD, tutWantsDummy, kc, menuBtn, TUT, tutStart, tutEnter, tutAdvance, tutFinish, tutClearCircle, tutEvent, tutTimer, updateTutorial, updateTutCircle, tutHls, renderTut, replayTutorial, spawnDummy } from './tutorial';
import { bindLootNpc, loots, spawnLoot, updateLoot, pickupReq, nearestLoot, clearLootInZone, Npc, spawnWildNpcs, npcs, addNpc, Interactable, currentInteractable } from './lootnpc';
import * as VFX from './vfx';
import { lightPadFrame, installSafeCompileAsync } from './prewarm';
import { prewarmInit, prewarmNote, stutterFrame, stutterReset, prewarmTick, prewarmZone, prewarmFx, prewarmTexture, stutterLog, prewarmDebug, prewarmKit } from './prewarm';   // v1.2.73b 偶发卡顿：资源预热 + 长帧探针
import * as BFX from './bossfx';
import { bindVfx, updateVfx, fireTick, fx as vfxEmit, whirlwind as vfxWhirl } from './vfx';
import { blizzardSampleMaterials } from './blizzard';   // v1.2.73
import { mageProjTick, mageProjHit, mageChain, mageFxSampleMaterials } from './mage_fx';   // 11-17 法师专属魔法特效
import { sigil as vfxSigil } from './vfx';   // v1.2.82 截图测试
import { zoneStormSampleMaterials, setZoneStormView, zoneStorm } from './zonestorm';   // v1.2.79
import { groundFxWarm } from './groundfx';
import { bladestormSampleMaterials } from './bladestorm';   // v1.2.73 剑刃风暴 v2
import { bindEffects, fxList, addFx, spawnRing, spawnSlash, spawnWhirl, spawnPillar, spawnLightning, zonesFx, spawnZoneFx, updateFx, FloatKind, Floater, FLOAT_CAP, floatPool, floats, floatLane, escHtml, releaseFloater, showFloat, DMG_COLOR, floatText, combatText, v3, project, updateFloats } from './effects';
import { bindChrono, chronoUpdate, chronoFrozen, chronoRewind, chronoReset, chronoDebug, chronoMark, chrono } from './chrono';
import { bindClassGear } from './classgear';
import { bindAlchemy, alchemyUpdate, alchemySmoke, alchemyReset, alchemyDebug, alchemy } from './alchemy';
import { bindSetfx, setfxUpdate, setfxReset, setfxDebug } from './setfx';
import { bindLgfx, lgfxUpdate, lgfxReset, lgfxDebug, lgMoveMul } from './lgfx';
import { bindTrigfx, trigfxUpdate, trigfxReset, trigfxDebug } from './trigfx';
import { bindResetfx, doReset, resetfxReset, resetStats } from './resetfx';
import { bindClassExt, classExtReset, classExtUpdate, classExtKey, classExtDebug, classExtFx, classExtTrail, classExtDashTrail, classExtHasFx, classExtSfx } from './classext';   // v1.0.6 内容包职业运行时
import { BOLT_CTX, shockHit } from './arcbolt';
import { installSkill4Icons } from './skill4_icons';   // v1.2.72
import { bindCasting, ctx, projectiles, dist2d, liveEnemies, nearestEnemy, tryCast, basicCombo, executeSkill, launchProjectile, castTargetedCircle, spawnIceShards, applyHits } from './casting';
import { bindCombatEvents, castStat, onUnitDamaged, impactFx, hitFx, onUnitDeath, flashing, flash, updateFlash } from './combatev';
import { bindDurabilityUi, updateStatusHud, repairAllNow } from './durability_ui';
import { bindSalvageUi } from './salvage_ui';
import { variantFxCount, channelActive } from './casting';
import { bindSetsUi, loadSetsState, setsSave, markSeen, setPity, activeSet4, raidSetDrop } from './sets_ui';
import { bindSmith, loadExchangeState, exchangeSave, exchange, openExchange, renderExchange, setXState, smithDialogOpen, closeSmithDialog, autoSellJunk, toggleLockUi } from './smith';
import { ALL_SET_BONUSES, SET_RENAMES } from '../data/sets';
import { questText, questHtml, isKeyQuest, KEY_QUEST_COLOR } from '../data/quest_tags';
import { migrateDurability, isBroken } from '../core/Durability';
import { setMapLook, isMoonLitZone, isOutdoorLook } from './map_look';
import { FIRE_FLICK_OFF, fireNoise, fireSeed } from './fire_flicker';   // 11-18 专长包 v8 第 120 步   // 11-18 纯净度：常夜图由 DLC 登记
import { makeMotes, updateMotes } from './sun_motes';
let motesMade = false;
import { bindRegional, regionalUpdate, regionalOnZone, repSave, repLoad, repOnQuest, repState, repClock, repAdd, repBuy, repTier, repPts, dynDebug, dynStart, dynForceNext, wxState, wxForce } from './regional';
import { bindExplore, exBuild, exShow, exUpdate, exSave, exLoad, exNoteCast, sprintMul, exDebug, exState, exClock, exInteract } from './explore';
import { wbSoulCheck } from './worldboss';
import { bindPackBoss, packBossHud } from './packboss';
import { bindPackDungeon, packDungeonUpdate, packDungeonHere, enterPackDungeon, packDungeonEntry, packDungeonEnd, packDungeonState, packDungeonUnits, packDungeons } from './packdungeon';   // v1.2.16 内容包小副本
import { bindPackRt, packEvent } from './packrt';   // v1.1.1 内容包战斗运行时
import { bindExtKey, extKeyUpdate, extKeyUse } from './extkey';   // v1.1.1 扩展按键（第 7 键）
import { packBuffTick, packBuffTotals } from './packbuff';   // v1.2.37c 内容包限时增益
import { camCollide, camCollideReset } from './camcollide';   // 11-07 BUG#3 相机防穿透
import { bindSlotKey, slotKeyUpdate, slotKeyUse, slotKeyState, slotEquip } from './slotkey';   // v1.2.15 第 8 技能格（G）
import { bindWorldBoss, wbSave, wbLoad, wbUpdate, wbDebug, wbSpawnNow, wbHud, wbState, wbClock } from './worldboss';
import { bindEnemies, spawnWorldEnemies, spawnFieldEnemies, spawnWildEnemies, enemyStrike, enemyShots, updateEnemyShots, boss, bossBrain, bossDef, telegraphs, poisonZones, applyBossEffect, spawnDungeon, spawnRootSpike, clearDungeonEnemies, openGate, gateAnims, dungeonLock, enterDungeon, fieldLock, enterField, leaveField, leaveDungeon } from './enemies';
// ======================================================================
// 基础
// ======================================================================
const $ = (id: string) => document.getElementById(id)!;
// ==== CTX BEGIN（tools/regen-ctx.cjs 生成，勿手改）：拆出去的模块通过 C 惰性读写 main 的状态
const C = {
  get $() { return $; },
  get C() { return C; },
  get CAMP() { return CAMP; },
  get CRIT_CAP() { return CRIT_CAP; },
  get ELEMENT_COLOR() { return ELEMENT_COLOR; },
  get ELEMENT_NAME() { return ELEMENT_NAME; },
  get Enemy() { return Enemy; },
  get F() { return F; },
  get FIELD_EAST_POS() { return FIELD_EAST_POS; },
  get FIELD_GATE_POS() { return FIELD_GATE_POS; },
  get FIELD_RETURN() { return FIELD_RETURN; },
  get HASTE_CAP() { return HASTE_CAP; },
  get LAYOUTS() { return LAYOUTS; },
  get SPEED_CAP() { return SPEED_CAP; },
  get T() { return T; },
  get WORLD_PORTAL() { return WORLD_PORTAL; },
  get wbSoulCheck() { return wbSoulCheck; },
  get addXp() { return addXp; },
  get anyPanelOpen() { return anyPanelOpen; },
  get applyClass() { return applyClass; },
  get audio() { return audio; },
  get bank() { return bank; }, set bank(v) { bank = v; },
  get boss() { return boss; },
  get bossDef() { return bossDef; },
  get camDist() { return camDist; }, set camDist(v) { camDist = v; },
  get camPitch() { return camPitch; }, set camPitch(v) { camPitch = v; },
  applyCamMode: () => applyCamMode(),
  get camYaw() { return camYaw; }, set camYaw(v) { camYaw = v; },
  get camera() { return camera; },
  get campCircles() { return campCircles; },
  get castStat() { return castStat; },
  get charSel() { return charSel; }, set charSel(v) { charSel = v; },
  get charSheet() { return charSheet; },
  get chosen() { return chosen; }, set chosen(v) { chosen = v; },
  get clearDungeonEnemies() { return clearDungeonEnemies; },
  get clearLootInZone() { return clearLootInZone; },
  get cls() { return cls; },
  get codex() { return codex; },
  get ctx() { return ctx; },
  nightGlow: () => nightGlowStats(),
  get curChar() { return curChar; }, set curChar(v) { curChar = v; },
  get currentInteractable() { return currentInteractable; },
  get currentMap() { return currentMap; },
  get dash() { return dash; }, set dash(v) { dash = v; },
  get dist2d() { return dist2d; },
  get dodge() { return dodge; },
  get dungeonLock() { return dungeonLock; },
  get dungeonRun() { return dungeonRun; }, set dungeonRun(v) { dungeonRun = v; },
  get enemies() { return enemies; },
  get respawnEnemy() { return respawnEnemy; },
  get enemyShots() { return enemyShots; },
  get ensureWild() { return ensureWild; },
  get enterDungeon() { return enterDungeon; },
  get enterField() { return enterField; },
  get escHtml() { return escHtml; },
  get faceTo() { return faceTo; },
  get feel() { return feel; },
  get fieldGroup() { return fieldGroup; },
  get fieldLock() { return fieldLock; },
  get fieldY() { return fieldY; },
  get groundAt() { return groundAt; },
  get isActive() { return isActive; },
  get floatText() { return floatText; },
  get floats() { return floats; },
  get focusId() { return focusId; },
  get forge() { return forge; },
  get fx() { return fx; },
  get gearSig() { return gearSig; }, set gearSig(v) { gearSig = v; },
  get gen() { return gen; },
  get goFullscreen() { return goFullscreen; },
  get goMap() { return goMap; },
  get grass() { return grass; },
  get guide() { return guide; },
  get guideFor() { return guideFor; },
  get guidePath() { return guidePath; },
  get holdBasic() { return holdBasic; }, set holdBasic(v) { holdBasic = v; },
  get inputDir() { return inputDir; },
  get inventory() { return inventory; },
  get isMobile() { return isMobile; },
  get isTouch() { return isTouch; },
  get itemSlotHtml() { return itemSlotHtml; },
  get itemTip() { return itemTip; },
  get lastNotices() { return lastNotices; }, set lastNotices(v) { lastNotices = v; },
  get lastSaveAt() { return lastSaveAt; },
  get layout() { return layout; }, set layout(v) { layout = v; },
  get layout_() { return layout_; },
  get leaveDungeon() { return leaveDungeon; },
  get leaveField() { return leaveField; },
  get load() { return load; },
  get loadStatus() { return loadStatus; },
  get loadTrack() { return loadTrack; },
  get loadedSave() { return loadedSave; },
  get packFix() { return packFix; },   // v0.9.7
  get loadout() { return loadout; },
  get look() { return look; }, set look(v) { look = v; },
  get loots() { return loots; },
  get navFor() { return navFor; },
  get noteCodex() { return noteCodex; },
  get npcName() { return npcName; },
  get npcs() { return npcs; },
  get openDialog() { return openDialog; },
  get outdoorNav() { return outdoorNav; },
  get panels() { return panels; },
  get particles() { return particles; },
  get pendingNotices() { return pendingNotices; }, set pendingNotices(v) { pendingNotices = v; },
  get pipeline() { return pipeline; },
  get player() { return player; },
  get progression() { return progression; },
  get project() { return project; },
  get quests() { return quests; },
  get refreshGear() { return refreshGear; },
  get releaseFloater() { return releaseFloater; },
  get renderTracker() { return renderTracker; },
  get replayTutorial() { return replayTutorial; },
  get roster() { return roster; },
  get safeLS() { return safeLS; },
  get save() { return save; },
  get saveBlocked() { return saveBlocked; }, set saveBlocked(v) { saveBlocked = v; },
  get saveSettings() { return saveSettings; },
  get saver() { return saver; }, set saver(v) { saver = v; },
  get scene() { return scene; },
  get hemi() { return hemi; },   // v1.2.49 选角补光
  get selSlot() { return selSlot; }, set selSlot(v) { selSlot = v; },
  get setText() { return setText; },
  get setW() { return setW; },
  get setZoneLook() { return setZoneLook; },
  get settings() { return settings; },
  get shop() { return shop; },
  get shopSel() { return shopSel; }, set shopSel(v) { shopSel = v; },
  get shopTab() { return shopTab; }, set shopTab(v) { shopTab = v; },
  get showChangelog() { return showChangelog; },
  get skillEls() { return skillEls; },
  get spawnLoot() { return spawnLoot; },
  get spawnRing() { return spawnRing; },
  get spin() { return spin; }, set spin(v) { spin = v; },
  get srand() { return srand; },
  get startRecall() { return startRecall; },
  get started() { return started; }, set started(v) { started = v; },
  get storage() { return storage; },
  get swing() { return swing; }, set swing(v) { swing = v; },
  get syncCharacter() { return syncCharacter; },
  get talSel() { return talSel; }, set talSel(v) { talSel = v; },
  get target() { return target; }, set target(v) { target = v; },
  get textCache() { return textCache; },
  get toast() { return toast; },
  get togglePanel() { return togglePanel; },
  get checkSkillLayout() { return checkSkillLayout; },
  get trackedIds() { return trackedIds; },
  get tree() { return tree; },
  get tryCast() { return tryCast; },
  get tutReplay() { return tutReplay; },
  get tutStart() { return tutStart; }, get tutFinish() { return tutFinish; },   // v1.2.53 快速体验跳过引导
  get tutState() { return tutState; }, set tutState(v) { tutState = v; },
  get tutStep() { return tutStep; },
  get useGate() { return useGate; },
  get v3() { return v3; },
  get waypoints() { return waypoints; },
  get wildLock() { return wildLock; },
  get wilds() { return wilds; },
  get world() { return world; },
  get worldGroup() { return worldGroup; },
  get yell() { return yell; },
  get ancientBanner() { return ancientBanner; },
  get zone() { return zone; },
  get dungeonBest() { return dungeonBest; }, set dungeonBest(v) { dungeonBest = v; },
  get openWaypoints() { return openWaypoints; },
  get renderShop() { return renderShop; },
  get clampToZone() { return clampToZone; },
  get skillBook() { return skillBook; },
  get equipFromBook() { return equipFromBook; },
  get blinked() { return blinked; }, set blinked(v) { blinked = v; },
  get talentPage() { return talentPage; },
  get switchTalentPage() { return switchTalentPage; },
  get applyGearSet() { return applyGearSet; },
  get saveGearSet() { return saveGearSet; },
  get gearSetsDebug() { return gearSetsDebug; },
};
export type Ctx = typeof C;
// ==== CTX END
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const mq = (q: string) => { try { return !!window.matchMedia?.(q).matches; } catch { return false; } };
/** 手机/平板：粗指针或移动端 UA → 默认中画质、像素比上限 1.5（低画质 1.0）、粒子减半 */
const isMobile = mq('(pointer:coarse)') || /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) || (isTouch && Math.min(window.innerWidth, window.innerHeight) <= 500);
// ---------- 手机适配：布局类名 + HUD 缩放 ----------
// html.touch：触屏；html.phone：短边 ≤ 500px 的横屏手机布局；html.portrait：触屏竖屏（显示「请横屏游玩」）；--ui：电脑端 HUD 缩放
const layout_ = { phone: false, portrait: false, ui: 1 };
function applyLayout() {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720, root = document.documentElement;
  layout_.phone = Math.min(w, h) <= 500;
  layout_.portrait = isTouch && h > w;
  layout_.ui = layout_.phone ? 1 : Math.max(0.75, Math.min(1.2, Math.min(w / 1280, h / 720)));
  root.classList.toggle('touch', isTouch);
  root.classList.toggle('mobile', isMobile);
  root.classList.toggle('phone', layout_.phone);
  root.classList.toggle('portrait', layout_.portrait);
  root.style.setProperty('--ui', layout_.ui.toFixed(3));
}
applyLayout();
let T = 0;                                  // 游戏时间（秒）
const ELEMENT_COLOR: Record<Element, string> = { lightning: '#a8c8ff', physical: '#ffffff', fire: '#ff7a1a', frost: '#6fd0ff', shadow: '#b060ff', holy: '#ffe070', nature: '#7dff5a', arcane: '#d07dff' };
const ELEMENT_NAME: Record<Element, string> = { lightning: '雷电', physical: '物理', fire: '火焰', frost: '冰霜', shadow: '暗影', holy: '神圣', nature: '自然', arcane: '奥术' };
const DMG_PER_LEVEL = 0.06;
/** 当前职业（开局选择；每个职业一个存档位） */
let cls: ClassDef = CLASSES.warrior;
installArt();
installSkill4Icons();   // v1.2.72 绝技 8 图标（程序化）

const canvas = $('game') as HTMLCanvasElement;
function makeRenderer(): THREE.WebGLRenderer {
  try { return new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' }); }
  catch (e) {
    const t = document.getElementById('title');
    if (t) t.innerHTML = '<h1>暗岩传说</h1><p style="color:#f88;max-width:420px;line-height:1.8">你的浏览器无法启动 3D（WebGL 不可用）。<br>请用电脑版 Chrome / Edge / Safari，或手机系统浏览器打开，并确认已开启硬件加速。</p>';
    throw e;
  }
}
const renderer = makeRenderer();
installSafeCompileAsync(renderer);   // 11-16d r170 compileAsync 空 program 保险
setKtx2Renderer(renderer);   // fix1106 KTX2 贴图：按主渲染器查压缩格式支持
setSelRenderer(renderer);   // 11-08 选角环境贴图（PMREM）与曝光
setSelVignette(k => pipeline.setSelVignette(k));   // Rhett 11-18 选角暗角（?off=seldof）
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 700);
const HAZE = new THREE.Color(0xc3dcef), CAVE = new THREE.Color(0x0a0812);
scene.background = HAZE.clone();
scene.fog = new THREE.Fog(HAZE.clone(), 55, 170);
const _sunOff = new THREE.Vector3();
// 11-17g 专长包 v8 阴影（Demo placeShadow）：阴影框中心沿镜头水平朝向前推 48×0.55 m，太阳距离 160 m（?off=qlsun 回原样）
const _shC = new THREE.Vector3(), _shF = new THREE.Vector3();
// 11-18 B3 阴影框跟玩家（画质专长包 v8 §三.5 / §四「俯视 / 斜俯视镜头：阴影框跟玩家而不是跟相机前方」，Demo 的 C.setFocus(玩家位置)）：
//   原来沿镜头水平朝向前推 48 × 0.55 = 26.4 m（Demo 无 focus 时的做法），玩家身后 21.6 m 以外的阴影被裁，低太阳背光时身后的长影会断；
//   现在框中心 = 玩家，前后各 48 m。?off=shadowfocus（或 localStorage darkrock_cine_off 含 shadowfocus）回前推。
const SHADOW_FOCUS_OFF = (() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('shadowfocus'); } catch { return false; } })();
// 11-18 Rhett「没有秋林逆光的效果了，阳光扫过没有丁达尔」：体积光（vol_light）沿视线在阴影贴图里步进 62 m，框中心 = 玩家后前方只剩 48 m，
//   48 m 外一律当「全亮」→ 中远处树影切出的光柱没了。折中：框中心前推 14 m（前方 62 m 刚好盖满体积光步进距离，身后仍留 34 m 长影）。?off=volfocus 回框中心 = 玩家
const VOL_FOCUS_OFF = (() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('volfocus'); } catch { return false; } })();
function shadowCenter(p: THREE.Vector3) { if (!QL_DEMO.sun || (!SHADOW_FOCUS_OFF && VOL_FOCUS_OFF)) return p; camera.getWorldDirection(_shF); _shF.y = 0; if (_shF.lengthSq() < 1e-6) return p; _shF.normalize(); return _shC.copy(p).addScaledVector(_shF, SHADOW_FOCUS_OFF ? 48 * 0.55 : 14); }
function demoSunDist(o: THREE.Vector3) { if (mirrorMoon) return o.set(SEA_MOON[0], SEA_MOON[1], SEA_MOON[2]).setLength(160); return QL_DEMO.sun ? o.setLength(160) : o; }
let mirrorMoon = false;   // 11-17g 镜渊城：主光固定为破口月光方向
const SEA_MOON = [0.447, 0.766, 0.462];   // 与 dlc1/seafloor.ts SEA_MOON 同值（本体不 import DLC 代码，dlc-guard）
const sky = makeCineSky(0x3d7fd6, 0xa9d4f5, 0xf3e2c0); scene.add(sky);   // 11-14 电影感第 1 步：程序化天空（光晕 / 卷云 / 日盘，地平线收进雾色）
const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x5a6b3a, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
bindDayNight({ scene, hemi, sun, sky });   // v1.2.69
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.045; // v0.9.1k 大平台阴影条纹
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
if (QL_DEMO.sun) { Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 320 }); sun.shadow.bias = -5e-4; sun.shadow.normalBias = 0.06; }   // 11-17g Demo 阴影：±48 m、远 320、bias −5e-4 / 0.06（?off=qlsun 回 ±32）
scene.add(sun, sun.target);

// ---------- 设置：和角色存档分开保存（darkrock_settings）；没有 localStorage（预览框）时退回内存 ----------
const memLS = new Map<string, string>();
const safeLS = {
  get: (k: string) => { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* 预览框里不能读 */ } return memLS.get(k) ?? null; },
  set: (k: string, v: string) => { memLS.set(k, v); try { localStorage.setItem(k, v); } catch { /* 预览框里不能存：只留在内存 */ } },
};
type DmgText = 'all' | 'compact' | 'off';
export interface Settings {
  quality: G.Quality; fps: 30 | 60 | 0;   // v1.2.37b：0 = 不限制（跟随显示器刷新率）
  showFps?: boolean;                    // v1.2.37b：血条上方帧率
  master: number; music: number; sfx: number; muted: boolean;
  amb: number;                          // 阶段四：环境音（风、雪、熔岩）
  voice: number;                        // v1.2.48 语音（首领配音 / 旁白；只有带配音的构建才用得上）
  camSens: number;                      // 镜头灵敏度 0.3~2.5
  camLock?: boolean;                    // v0.9.1：锁定 2.5D 视角（40° 俯角、不可旋转）；未设置时手机默认锁定、电脑默认自由
  shake: boolean; shakeAmt: number;     // 镜头震动开关 + 强度 0~1.5
  dmgText: DmgText;                     // 伤害数字：全部 / 精简（不显示持续伤害跳字，普通伤害只显示当前目标）/ 关闭
  joySize: number;                      // 摇杆大小 0.7~1.4
  lefty: boolean;                       // 左右手互换：摇杆在右、技能在左
  autoLoot: boolean;                    // 自动拾取（关闭后走近按 E / 点按钮拾取）
  tipDetail: boolean;
  map3d?: 'auto' | 'on' | 'off';         // v0.9.6f 3D 副本地图（自动 = 低画质 / 低配机器回退 2D）
  charModel?: 'auto' | 'new' | 'classic';   // v1.2.0-m1 角色模型：自动（m1b 起 = 经典，服装素材换好前）/ 写实 / 经典
  hudFx?: boolean;                      // v0.9.6c HUD 粒子（技能就绪火星、首领余烬、液面波纹）                   // v0.6.7：装备说明 详细 / 简洁（Alt 或说明里的按钮切换）
}
const SETTINGS_KEY = 'darkrock_settings';
const DEFAULT_SETTINGS: Settings = { quality: isMobile ? 'medium' : 'high', fps: 60, master: 1, music: 0.55, sfx: 0.8, amb: 0.7, voice: 0.9, muted: false, camSens: 1, shake: true, shakeAmt: 1, dmgText: 'all', joySize: 1, lefty: false, autoLoot: true, tipDetail: true };
/** 读设置并校验（坏数据/旧版本缺字段 → 默认值） */
function loadSettings(): Settings {
  let raw: Partial<Settings> = {};
  try { raw = JSON.parse(safeLS.get(SETTINGS_KEY) ?? '{}') ?? {}; } catch { raw = {}; }
  const s: Settings = { ...DEFAULT_SETTINGS, ...raw };
  const num = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
  if (!(['ultra', 'high', 'medium', 'low'] as unknown[]).includes(s.quality)) s.quality = DEFAULT_SETTINGS.quality;
  if (raw.quality === undefined && G.DESKTOP && !isMobile) s.quality = autoTier(renderer);   // 11-14 电影感：第一次启动按显卡自动选档（集显 → 中，软渲染 → 低），之后按存档
  if (s.fps !== 30 && s.fps !== 60 && s.fps !== 0) s.fps = 60; s.showFps = s.showFps !== false;
  if (!(['all', 'compact', 'off'] as unknown[]).includes(s.dmgText)) s.dmgText = 'all';
  s.master = num(s.master, 0, 1, 1); s.music = num(s.music, 0, 1, 0.55); s.sfx = num(s.sfx, 0, 1, 0.8); s.amb = num(s.amb, 0, 1, 0.7); s.voice = num(s.voice, 0, 1, 0.9);
  s.camSens = num(s.camSens, 0.3, 2.5, 1); s.shakeAmt = num(s.shakeAmt, 0, 1.5, 1); s.joySize = num(s.joySize, 0.7, 1.4, 1);
  s.shake = s.shake !== false; s.lefty = !!s.lefty; s.autoLoot = s.autoLoot !== false; s.muted = !!s.muted; s.tipDetail = s.tipDetail !== false; s.hudFx = s.hudFx !== false; if (!['auto', 'on', 'off'].includes(s.map3d as string)) s.map3d = 'auto';
  return s;
}
const settings: Settings = loadSettings();
const saveSettings = () => safeLS.set(SETTINGS_KEY, JSON.stringify(settings));
/** 打击感：顿帧 + 镜头震动（core/HitFeel.ts，尊重设置里的震动开关/强度） */
const HITSTOP_REAL = (() => { try { return !/(?:[?&]off=[^&]*\bhitstopreal\b)/.test(location.search); } catch { return true; } })();
const feel = new HitFeel({ shake: settings.shake, shakeIntensity: settings.shakeAmt, hitStop: true });

const pipeline = new G.Pipeline(renderer, scene, camera, sun, isMobile);
pipeline.setSky(sky);   // 11-13 桌面：天空烘成环境光（fxd.ts）
const audio = new GameAudio();
const particles = new G.Particles(isMobile || isTouch ? 1500 : 3000);
scene.add(particles.points);
bindVfx(scene, isMobile || isTouch);
const onResize = () => { applyLayout(); pipeline.resize(); };
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
window.visualViewport?.addEventListener('resize', onResize);
initRecMode({ camera, canvas, resize: () => pipeline.resize() });   // v1.2.38c 录制模式（?rec=1 才启用）
const photoFocus = new THREE.Vector3();
initPhotoMode({ camera, canvas, focus: () => (player ? photoFocus.set(player.pos.x, player.pos.y, player.pos.z) : photoFocus) });   // v1.2.52 拍照模式（P）
// 禁止页面缩放 / 双击放大 / 长按菜单 / 下拉刷新；面板、标题页、任务追踪内部仍可上下滚动
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1 && !(e.target as HTMLElement).closest?.('#game')) { e.preventDefault(); return; }
  if (!(e.target as HTMLElement).closest?.('.panel,#title,#quest-tracker')) e.preventDefault();
}, { passive: false });
// 全屏 + 锁横屏（只能在用户点击后调用；不支持的浏览器静默忽略）
function goFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => { try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape')?.catch(() => {}); } catch { /* 不支持 */ } };
  try {
    if (document.fullscreenElement) { lock(); return; }
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions) : (el.webkitRequestFullscreen?.(), undefined);
    if (r && typeof r.then === 'function') r.then(lock).catch(() => {}); else lock();
  } catch { /* 预览框里不允许全屏 */ }
}
document.addEventListener('fullscreenchange', () => { document.documentElement.classList.toggle('fs', !!document.fullscreenElement); setTimeout(onResize, 150); });
for (const id of ['fs-title', 'fs-rotate']) document.getElementById(id)?.addEventListener('click', goFullscreen);
// 页面切到后台：暂停渲染并存档
let hiddenNow = false;
document.addEventListener('visibilitychange', () => { hiddenNow = document.hidden; if (hiddenNow && started) save(); });

let seed = 12345;
const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ======================================================================
// 场景：野外（灰石营地 + 狼林）、翠风原野、两个副本（暗岩矿洞 / 腐沼神殿）
// ======================================================================
export type Zone = 'world' | 'dungeon' | 'field' | 'raid' | WildId;
let zone: Zone = 'world';
G.presetQuality(settings.quality);   // 11-16 建场景前先设画质档（低画质简化分支生效）
initNightGlow(scene, settings.quality === 'low');   // 11-18 Rhett「夜间有点暗」（?off=nightlamp / nightmote）
const SC = buildScenes(scene, isTouch, srand);
const { D, BOSS_CENTER, SW, SW_BOSS, WORLD_PORTAL, CAMP, F, FIELD_GATE_POS, FIELD_RETURN, FIELD_HAZE, FIELD_EAST_POS, worldGroup, dungeonGroup, swampGroup, fieldGroup, campCircles, bakeStats, animated, grass, place, fieldY, fieldAnim, fieldChunks, dungeonGates, swampGates, exitPortal, bossPortal, swampExit, swampBossPortal, swampAnim, campDgPools } = SC;

/** 两个副本的布局：原点、Boss 场地、门、出口、走廊半宽、外观 */
interface DungeonLayout {
  id: string; def: DungeonDef; origin: THREE.Vector3; boss: THREE.Vector3; group: THREE.Group; gates: THREE.Object3D[]; gateZ: number[]; halfW: number;
  /** 11-18 副本放大倍率（?off=dgscale → 1）：boss 是放大后的世界坐标；gateZ / halfW 和下面写死的数字仍是设计坐标，用时 × s。exit / bossPortal / gates 在放大的组里，世界位置用 getWorldPosition */
  s: number;
  exit: THREE.Object3D; bossPortal: THREE.Object3D; theme: Theme; bossTheme: Theme; rec: number;
  look: { bg: number; fogNear: number; fogFar: number; hemi: number; ground: number; hemiI: number; sun: number };
}
const LAYOUTS: Record<string, DungeonLayout> = {
  darkrock_mine: { id: 'darkrock_mine', def: DARKROCK_MINE, origin: D, boss: dgV(D, BOSS_CENTER), s: DUNGEON_SCALE, group: dungeonGroup, gates: dungeonGates, gateZ: [-24, -46], halfW: 5,
    exit: exitPortal, bossPortal, theme: 'dungeon', bossTheme: 'boss', rec: 4,
    look: { bg: 0x0a0812, fogNear: 12, fogFar: 50, hemi: 0x8a70c0, ground: 0x201830, hemiI: 0.55, sun: 0.25 } },
  rotting_temple: { id: 'rotting_temple', def: ROTTING_TEMPLE, origin: SW, boss: dgV(SW, SW_BOSS), s: DUNGEON_SCALE, group: swampGroup, gates: swampGates, gateZ: [-24, -46], halfW: 6.8,
    exit: swampExit, bossPortal: swampBossPortal, theme: 'swamp', bossTheme: 'boss2', rec: 8,
    look: { bg: 0x22301f, fogNear: 10, fogFar: 58, hemi: 0xa8d090, ground: 0x24301a, hemiI: 0.8, sun: 0.7 } },
};
let layout: DungeonLayout = LAYOUTS.darkrock_mine;
const _gateW = new THREE.Vector3();

/** 移动后的位置修正：营地/原野走寻路网格（推出障碍、挡住河流），副本走原来的走廊 + 门限制 */
function clampToZone(p: THREE.Vector3, prev?: Pos2, r = 0.45) {
  if (zone === 'raid') { raidClamp(p, prev); return; }
  if (zone === 'world') { p.x = THREE.MathUtils.clamp(p.x, -95, 95); p.z = THREE.MathUtils.clamp(p.z, -36, 95); navCamp.collide(p, r); return; }
  if (zone === 'field') { navField.resolveMove(prev ?? { x: p.x, z: p.z }, p, r); p.x = THREE.MathUtils.clamp(p.x, F.x - FIELD_WEST, F.x + FIELD_HALF); p.z = THREE.MathUtils.clamp(p.z, F.z - FIELD_HALF, F.z + FIELD_HALF); return; }   // v0.9.3e 修：v0.9.3b 扩到 ±120 后这里还卡在 ±78，外环（麦穗村 / 风车 / 神殿）走不进去
  if (isWildId(zone)) { const w = WILD[zone], O = w.origin, nv = wilds[zone]?.nav; nv?.resolveMove(prev ?? { x: p.x, z: p.z }, p, r);
    if (nv && !nv.walkable(p.x, p.z)) { const f = nv.nearestFree(p.x, p.z, 14); /* 被推进熔岩池：挪到最近的可走点 */ if (f) { p.x = f.x; p.z = f.z; } }
    p.x = THREE.MathUtils.clamp(p.x, O.x - w.half, O.x + w.half); p.z = THREE.MathUtils.clamp(p.z, O.z - w.half, O.z + w.half); return; }
  const L = layout, O = L.origin, s = L.s;   // 11-18 副本 ×1.5：下面的数字都是设计坐标，× s 成世界坐标
  const lz = p.z - O.z;
  if (lz > -47 * s) {
    p.x = THREE.MathUtils.clamp(p.x, O.x - L.halfW * s, O.x + L.halfW * s); p.z = Math.min(p.z, O.z + 7 * s);
    for (let i = 0; i < L.gates.length; i++) {           // 门没开不能过
      const gz = O.z + L.gateZ[i] * s;
      if (L.gates[i].visible && p.z < gz + 0.8 * s) p.z = gz + 0.8 * s;
    }
  } else {
    const dx = p.x - L.boss.x, dz = p.z - L.boss.z, d = Math.hypot(dx, dz);
    if (d > 14.5 * s && !(Math.abs(dx) < 5 * s && dz > 0)) { p.x = L.boss.x + dx / d * 14.5 * s; p.z = L.boss.z + dz / d * 14.5 * s; }
  }
}

function setZoneLook(z: Zone) {
  zone = z;
  if (z !== 'world') leftCampSincePark = true;   // v1.0.1 停放规则（world = 灰石营地）
  const wp = isWildId(z) ? WILD[z].palette : null;
  const lk = z === 'field' ? { bg: FIELD_HAZE.getHex(), fogNear: 50, fogFar: 165, hemi: 0xffecc8, ground: 0x6a5a30, hemiI: 1.1, sun: 2.4 }
    : wp ? { bg: wp.fog, fogNear: wp.fogNear, fogFar: wp.fogFar, hemi: wp.hemi, ground: wp.ground, hemiI: wp.hemiI, sun: wp.sun } : z === 'raid' ? raidLook() : layout.look;
  const out = z !== 'dungeon' && z !== 'raid';
  raidSetVisible(z === 'raid');
  const c = z === 'world' ? HAZE : new THREE.Color(lk.bg);
  if ((scene.background as THREE.Color | null)?.isColor) (scene.background as THREE.Color).copy(c); else scene.background = c.clone();   // v1.2.88 背景若还是选角贴图（未走 selectBgLeave）会 Texture.copy(Color) 抛错 → 换图加载画面卡死
  if (!(scene.fog as THREE.Fog | null)?.isFog) scene.fog = new THREE.Fog(c, 50, 165);   // v1.2.88 同上：雾被选角背景置空时补回
  (scene.fog as THREE.Fog).color.copy(c);
  const fogK = z === 'dungeon' || z === 'raid' ? DUNGEON_SCALE : 1;   // 11-18 副本 ×1.5：雾距跟场景尺度走（?off=dgscale）
  (scene.fog as THREE.Fog).near = z === 'world' ? 55 : lk.fogNear * fogK;
  (scene.fog as THREE.Fog).far = z === 'world' ? 170 : lk.fogFar * fogK;
  sky.visible = out;
  worldGroup.visible = z === 'world';
  fieldGroup.visible = z === 'field';
  for (const [id, w] of Object.entries(wilds)) w!.group.visible = z === id;
  for (const L of Object.values(LAYOUTS)) L.group.visible = z === 'dungeon' && L === layout;
  hemi.color.setHex(z === 'world' ? 0xd6e8ff : lk.hemi); hemi.groundColor.setHex(z === 'world' ? 0x5a6b3a : lk.ground);
  hemi.intensity = z === 'world' ? 1.15 : lk.hemiI;
  sun.intensity = z === 'world' ? 2.3 : lk.sun;
  sun.color.setHex(z === 'field' ? 0xffe2b8 : wp ? wp.sunColor : 0xfff0d6);
  // 11-19 Demo 光照链路逐项（cine CDEMO）：与 Demo 太阳 / 半球光同一条件，另要求是户外画风（室内 / 副本 / 钟井不吃）
  const demoZ = QL_DEMO.sun && (z === 'world' || z === 'field' || isWildId(z)) && !isMoonLitZone(String(z)) && isOutdoorLook(String(z));
  cineDemoZone(demoZ); dayNightDemo(demoZ); pipeline.setDemoShadow(demoZ); ssSetDemoSun(demoZ); ssSetDemoFull(demoZ);   // 11-19 qldemosun
    // ssSetDemoSun：11-19 qlsunlock（白天太阳锁 Demo 逆光方向）   // dayNightDemo：11-19 qlsuncol；setDemoShadow：11-19 qlpcss
  if (QL_DEMO.sun && (z === 'world' || z === 'field' || isWildId(z)) && !isMoonLitZone(String(z))) {   // 常夜图（DLC 地底海穹顶）光照另定   // 11-17g 整套换成 Demo（专长包 v8 cinematic.config.js sun / hemi / air；?off=qlsun 回各图气候）
    sun.intensity = 3.5; sun.color.setRGB(1.0, 0.74, 0.46);
    hemi.intensity = 0.62; hemi.color.setRGB(0.40, 0.47, 0.52); hemi.groundColor.setRGB(0.16, 0.15, 0.07);
    (scene.background as THREE.Color).setRGB(0.50, 0.40, 0.27); (scene.fog as THREE.Fog).color.setRGB(0.50, 0.40, 0.27);
  }
  mirrorMoon = QL_DEMO.sun && isMoonLitZone(String(z)); qlRaysOpt.skyOnly = !mirrorMoon;
  if (mirrorMoon) {   // 11-17g 镜渊城月光（Rhett 认可方案；?off=qlsun 回原 palette + 昼夜）：冷银主光、Demo 半球光强度、深青雾；不吃昼夜时钟
    sun.intensity = 2.6; sun.color.setRGB(0.72, 0.86, 0.95);
    hemi.intensity = 0.62; hemi.color.setRGB(0.22, 0.34, 0.36); hemi.groundColor.setRGB(0.10, 0.13, 0.12);
    (scene.background as THREE.Color).setRGB(0.05, 0.12, 0.13); (scene.fog as THREE.Fog).color.setRGB(0.05, 0.12, 0.13);
  }
  dayNightBase((z === 'world' || z === 'field' || isWildId(z)) && !mirrorMoon, wp?.night);   // 11-17 wp.night：区域自己的夜间光照（烬落）   // v1.2.69 野外昼夜：记下区域原始光照
  if (started) { pipeline.zoneReset(scene); void prewarmZone(String(z)); }   // 11-14 副本发糊：切区域重置动态分辨率 + 补各向异性   // v1.2.73b 切区域：整场景预编译（含隐藏物体）+ 贴图排队
}

// ---------------------------------------------------------------- 寻路网格（每个区域一张）
// v1.2.71 内容包往灰石营地放造景（可选挂点；没有包 = 不执行），障碍写进营地碰撞
for (const p of packZoneProps('world')) { try { p.build({ add: (o, x, z, ry = 0) => place(o as THREE.Object3D, x, z, ry), groundY: (x, z) => M.groundY(x, z), block: (x, z, r) => { if (r > 0) campCircles.push({ x, z, r }); } }); } catch (e) { console.error('内容包营地造景出错', e); } }
const navCamp = new NavGrid({ x0: -95, z0: -36, x1: 95, z1: 95 }, campCircles);
groveNav('camp', navCamp);   // 11-18 林团树干进寻路障碍（?off=grove 时没有林团，登记为空）
/** v0.9.3b 原野高度图（风蚀高台 / 缓丘；河床不算——河里只有桥和浅滩能走，人物按平地走） */
const fieldHF = new HeightField(FIELD_BOUNDS.x0 - 2, FIELD_BOUNDS.z0 - 2, FIELD_BOUNDS.x1 + 2, FIELD_BOUNDS.z1 + 2, (x, z) => fieldWalkY(x - FIELD_ORIGIN.x, z - FIELD_ORIGIN.z));
const navField = new NavGrid(FIELD_BOUNDS, fieldObstacles(), { solid: (x, z) => fieldSolid(x, z) || (fieldWalkY(x - FIELD_ORIGIN.x, z - FIELD_ORIGIN.z) > 0.02 && fieldHF.steep(x, z, MAX_WALK_SLOPE)) });
groveNav('field', navField);   // 11-18 林团树干
/** 副本：走廊 + Boss 场地（和 clampToZone 的规则一致），没开的门是动态阻挡 */
function dungeonWalk(L: DungeonLayout, x: number, z: number) {
  const O = L.origin, lz = z - O.z, s = L.s;   // 11-18 副本 ×1.5
  if (lz > -47 * s) return Math.abs(x - O.x) <= L.halfW * s && z <= O.z + 7 * s;
  const dx = x - L.boss.x, dz = z - L.boss.z;
  return Math.hypot(dx, dz) <= 14.5 * s || (Math.abs(dx) < 5 * s && dz > 0);
}
const navDungeon: Record<string, NavGrid> = {};
function navFor(map: string): NavGrid {
  if (map === 'camp') return navCamp;
  if (map === 'field') return navField;
  if (isWildId(map)) return ensureWild(map).nav;
  const L = LAYOUTS[map];
  return navDungeon[map] ??= new NavGrid({ x0: L.origin.x - 16 * L.s, z0: L.origin.z - 80 * L.s, x1: L.origin.x + 16 * L.s, z1: L.origin.z + 8 * L.s }, [], {
    solid: (x, z) => !dungeonWalk(L, x, z),
    dynamic: (_x, z) => L.gates.some((g, i) => g.visible && Math.abs(z - (L.origin.z + L.gateZ[i] * L.s)) < 0.9 * L.s),
  });
}
/** 当前所在区域 id（任务指引 / 地图用） */
function currentMap(): MapId { return zone === 'world' ? 'camp' : zone === 'field' ? 'field' : isWildId(zone) ? zone : zone === 'raid' ? 'ember' : layout.id as MapId; }
/** 11-18 opt1118B 占位点光余量（prewarm.ts padExtra）：本体野外 / 原野 / 营地 = 光源池大小（同 dung_lightpool：低 3 / 中 7 / 高 9）
 *  + 本区域此刻被摘出场景（激活集外）的怪身上的点光数（进激活集时会冒出来）；副本 / 团本 / 内容包图返回 null（仍固定 12） */
const PAD_POOL_Q: Record<string, number> = { low: 3, medium: 7, high: 9, ultra: 9 };
function padPoolExtra(): number | null {
  const z = String(zone);
  if (z !== 'world' && z !== 'field' && !(WILD_IDS as string[]).includes(z)) return null;
  let hidden = 0;
  for (const e of enemies) {
    if (e.z !== zone || e.rig.root.parent) continue;
    const ud = e.rig.root.userData as { padPL?: number };
    if (ud.padPL === undefined) { let n = 0; e.rig.root.traverse(o => { if ((o as THREE.PointLight).isPointLight) n++; }); ud.padPL = n; }
    hidden += ud.padPL;
  }
  return (PAD_POOL_Q[G.curQuality] ?? 9) + hidden;
}
// ---------------------------------------------------------------- 阶段四：新野外地图（第一次进入时才生成）
const wilds: Partial<Record<WildId, WildScene>> = {};
function ensureWild(id: WildId): WildScene {
  let w = wilds[id];
  if (w) return w;
  w = wilds[id] = buildWild(WILD[id], isTouch);
  scene.add(w.group);
  envHdApply(w.group, envHdTier(), renderer);   // v1.2.49 山体 / 石头 / 建筑 PBR 细节层（高 / 超高 + 资产包有贴图时）
  bakeStats[id] = w.stats;
  if (player) { spawnWildEnemies(id); spawnWildNpcs(id); exBuild(id); }   // v0.9.3e 探索物件
  return w;
}
/** 野外的寻路网格（原野 / 新地图）；副本和营地返回 null */
// ---------------------------------------------------------------- v0.9.3a 野外性能底座：地面高度 + 40 米分块激活
/** 脚下地面高度：新地图查高度图（山丘 / 台地 / 坡道），原野可走范围是平地（河床不下沉），营地 / 副本 = 0 */
function groundAt(x: number, z: number): number {
  if (isWildId(zone)) { const w = wilds[zone]; return w ? w.hf.at(x, z) : 0; }
  if (zone === 'field') return fieldHF.at(x, z);
  return 0;
}
G.setGroundFn(groundAt);
/** 当前激活的怪（玩家所在 40 米区块 + 周围一圈，最多 MAX_ACTIVE 只；交战中的始终保留）；null = 不限（营地 / 副本 / 长副本） */
const ENEMY_SNAP_OFF = (() => { try { return /(?:[?&]off=[^&]*\benemysnap\b)/.test(location.search); } catch { return false; } })();
let activeSet: Set<Enemy> | null = null, activeZone: Zone | null = null, activeTick = 0;
const perfStat = { active: 0, total: 0, shown: 0, chunk: '', calls: 0, tris: 0, fps: 0, chunksOn: 0, chunksAll: 0 };
function refreshActive() {
  activeZone = zone; activeTick = 0;
  if (!outdoorNav()) { activeSet = null; return; }
  const list = enemies.filter(e => e.z === zone);
  activeSet = pickActive(list, e => e.pos, player.pos.x, player.pos.z, MAX_ACTIVE,
    e => e.alive && (e === target || e.intent?.state === 'chase' || e.intent?.state === 'attack'));
  const c = chunkOf(player.pos.x, player.pos.z);
  perfStat.active = activeSet.size; perfStat.total = list.length; perfStat.chunk = `${c.cx},${c.cz}`;
  // v0.9.3b 原野物件分块：玩家所在块 ± FIELD_VIEW_RING 块以外整块隐藏
  const chs = zone === 'field' ? fieldChunks : isWildId(zone) ? wilds[zone]?.chunks : null;   // v0.9.3c 新野外图也分块
  if (chs) { let vis = 0; for (const fc of chs) { const on = Math.max(Math.abs(fc.cx - c.cx), Math.abs(fc.cz - c.cz)) <= FIELD_VIEW_RING; fc.g.visible = on; if (on) vis++; } perfStat.chunksOn = vis; perfStat.chunksAll = chs.length; }
}
/** 原野物件可见范围：±2 块（约 80–120 米，雾外） */
const FIELD_VIEW_RING = 2;
function isActive(e: Enemy) { return !activeSet || activeZone !== zone || activeSet.has(e); }
function outdoorNav(): NavGrid | null { return zone === 'field' ? navField : isWildId(zone) ? wilds[zone]?.nav ?? null : null; }

// ======================================================================
// 战斗单位
// ======================================================================
export class Unit implements CombatUnit {
  status = new StatusSet();
  hp: number; armor = 0; ccImmune = false;
  preDamage?: (amount: number, src: CombatUnit | null, el: Element) => number;
  lastHurt = -99;
  critChance = 0; critMult = 1.6;
  dotPower?: number; haste?: number; dotCritEcho?: boolean;   // v0.9.1l 持续伤害缩放（只有玩家填）
  constructor(public uid: string, public faction: Faction, public maxHp: number, public rig: M.Rig, public name: string) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  get pos() { return this.rig.root.position; }
  getPos(): Pos { return { x: this.pos.x, z: this.pos.z }; }
  onDamaged(amount: number, el: Element, src: CombatUnit | null, crit?: boolean, tick?: boolean) { this.lastHurt = T; onUnitDamaged(this, amount, el, src, !!crit, !!tick); }
  onHealed(amount: number) { combatText(this, 'heal', amount); }
  /** v1.2.57b 状态字：敌人被控时飘「冻结 / 定身 / 眩晕」 */
  onCC(_k: 'stun', el: Element, src: CombatUnit | null) { if (this === player || src !== player || settings.dmgText === 'off') return; showFloat(this, 'info', el === 'frost' ? '冻结' : cls.id === 'chrono' ? '定身' : '眩晕', el === 'frost' ? '#9fe0ff' : '#ffd36a', 1.1); }
  /** 翻滚无敌帧挡下攻击 */
  onImmune() { combatText(this, 'immune', 0); if (this === player) { packEvent({ type: 'parry' }); audio.dodged(); particles.emit({ x: this.pos.x, y: 1.2, z: this.pos.z }, { count: 10, color: 0xbfe6ff, color2: 0xffffff, speed: 2.5, up: 0.8, life: 0.35, size: 0.25 }); } }
  /** 盾墙等减伤吸收 */
  onAbsorbed(amount: number) { combatText(this, 'absorb', amount); if (this === player) audio.absorb(); }
  onDeath() { onUnitDeath(this); }
  onInterrupt(): boolean { return false; }
}

bindEnemyTypes(C);   // → enemy_types.ts
export class Enemy extends Unit {
  brain!: { update(dt: number, p: CombatUnit | null): AIIntent; provoke(): void; interrupt?(): boolean };
  intent: AIIntent | null = null;
  spawn: THREE.Vector3;
  deadAt = -1;
  plate: HTMLDivElement;
  yaw = 0; anim = 0; attackAnim = 0;
  route: THREE.Vector3[] | null = null; routeI = 0;     // 游荡精英的路点
  spots: THREE.Vector3[] | null = null;                 // 稀有怪的随机出现点
  awayRespawn = false;                                  // v0.9.3c 普通野外怪群：玩家离出生点 30 米外才刷新
  wb?: string; wbAdd = false;                          // v0.9.3d 世界首领 / 它的召唤物
  pboss?: string;                                      // v1.1.0 内容包首领（web/packboss.ts）
  outMul?: number;                                     // v1.2.16 首领大脑造成伤害的额外倍率（内容包小副本的沙漏之誓狂暴）
  rebrain?: () => Enemy['brain'];                      // v0.9.3d 复活时换上的大脑（世界首领 = BossBrain）
  rareRoll: [number, number] | null = null;             // v0.9.3c 稀有首领：每次复活后重新随机下一次刷新（秒）
  stuckT = 0; evadeUntil = -1;                          // 原野：追不过来时脱战
  stagger = 0;                                          // 受击硬直（秒）：小怪被玩家打中后短暂停顿 + 后仰
  dgS = 1;                                              // 11-18 副本放大倍率（副本里的怪 = DUNGEON_SCALE；玩家打它的贴身余量跟着乘）
  get isDummy() { return this.kind === 'dummy'; }       // 新手引导的训练假人
  constructor(public kind: string, public type: EnemyType, at: THREE.Vector3, public z: Zone, public encounter = '', public respawn = 0, public lootTable = 'trash', public isBoss = false) {
    super(`${kind}_${Math.random().toString(36).slice(2, 8)}`, 'enemy', type.hp, type.model(), type.name);
    if (!this.rig.root.userData.bodyScaled) { this.rig.root.scale.multiplyScalar(BODY_SCALE); this.rig.scale *= BODY_SCALE; this.rig.root.userData.bodyScaled = true; }   // v1.2.55 体型 +10%（人形怪已在 makeCharacter 里放大）
    // 11-18 副本 ×1.5（?off=dgscale）：副本里的怪模型 / 碰撞（跟 rig.scale）/ 近战距离 / 仇恨 / 拴绳 × S，伤害血量移速不变；类型复制一份，不改共享表
    if (dgZone(z) && !this.rig.root.userData.dgScaled) { const S = DUNGEON_SCALE; this.rig.root.scale.multiplyScalar(S); this.rig.scale *= S; this.rig.root.userData.dgScaled = true; this.dgS = S;
      this.type = type = { ...type, range: type.range * S, aggro: type.aggro * S, leash: (type.leash ?? 30) * S, patrol: (type.patrol ?? 2) * S }; }
    this.spawn = at.clone();
    this.pos.copy(at);
    dressEnemy(this.rig, type, isBoss);   // v0.9.1i 材质精修 / 接触阴影 / 精英稀有光环
    this.yaw = srand() * 6;
    scene.add(this.rig.root);
    this.plate = document.createElement('div');
    this.plate.className = 'nameplate';
    const tag = type.elite ? '<span class="etag">精英</span>' : type.rare ? '<span class="etag rare">稀有</span>' : type.mini ? '<span class="etag">小精英</span>' : '';
    this.plate.innerHTML = `<div style="color:${isBoss || type.elite ? '#ff8000' : type.rare ? '#d0a0ff' : type.mini ? '#ffb060' : '#f66'}">${tag}${type.name}</div><div class="hb"><i></i></div>`;
    $('floats').appendChild(this.plate);
    this.brain = new EnemyBrain(this, this.getPos(), enemyConfig(type), (tg, d) => enemyStrike(this, tg, d));
    (this.rig.anim as { bindUnit?(u: unknown): void } | undefined)?.bindUnit?.(this);   // raidA A7（可选）：程序化动作读本单位的大脑做预测式预备（CharAnim 没有这个方法 = 不影响）
  }
  onInterrupt() { const ok = this.brain.interrupt?.() ?? false; if (ok) packEvent({ type: 'interrupt' }); return ok; }
  dispose() { scene.remove(this.rig.root); this.plate.remove(); }
}

const enemies: Enemy[] = [];
let player!: Unit;                      // 模型加载完成后在 boot() 里创建
let target: Enemy | null = null;

const world: CombatWorld = {
  units: function* () { yield player; for (const e of enemies) if (e.z === zone) yield e; },
  resetCooldown: (_o, slot, e) => { doReset(slot, e?.icd ?? 0); },
  reduceCooldown: (o, slot, sec) => { if (o === player) loadout.reduceCooldown(slot, sec); },   // v1.2.37 余烬回涌   // v1.2.35 内置冷却 + 技能栏闪光（web/resetfx.ts）
  onZoneSpawn: (p, r, el, d) => spawnZoneFx(p, r, el, d),
  onExplode: (p, r, el) => spawnRing(p, r, ELEMENT_COLOR[el], 0.35),
  onElemHit: (p, el) => spawnRing(p, 0.9, ELEMENT_COLOR[el], 0.25),   // v1.2.66 附加元素各自的命中光环
  // 连锁禁锢：两个目标之间画一道奥术电弧
  onChain: (a, b) => { if (!mageChain(a, b)) spawnLightning(G.lift(a, 1.2), G.lift(b, 1.2));   /* 11-17 雷冰枪弹射改白紫电弧 */ if (BOLT_CTX.on && BOLT_CTX.els) shockHit({ x: b.x, y: G.gy(b.x, b.z), z: b.z }, BOLT_CTX.els); },   // v1.2.72 弹射段同色电弧 + 命中层
  // 盾墙：增益飘字 + 金色光环
  onBuff: (u, name, d) => { if (u === player) { floatText(player, `${name}（${d} 秒）`, '#ffd34d', 1.3); spawnRing(player.getPos(), 2.2, '#ffd34d', 0.8); } },
  onReflect: (_from, to, v) => { floatText(to as Unit, `反弹 ${v}`, '#ffd34d', 0.9); audio.block(); },
  // v0.6.9 橙装特效：护盾 / 叠层冻结
  onShield: (u, total) => { if (u === player) { floatText(player, `护盾 ${Math.round(total)}`, '#9fe0ff', 1.0); spawnRing(player.getPos(), 1.6, '#9fe0ff', 0.5); shieldShown = CX_T() + 0.1; } },
  onStackBurst: (u, name, el) => { floatText(u as Unit, name, el === 'frost' ? '#9fe0ff' : '#ffd34d', 1.2); spawnRing((u as Unit).getPos(), 1.4, ELEMENT_COLOR[el], 0.5); particles.emit({ x: (u as Unit).getPos().x, y: 1, z: (u as Unit).getPos().z }, { count: 30, color: 0xbfe8ff, color2: 0xffffff, speed: 3, up: 1.5, radius: 0.5, life: 0.6, size: 0.35, drag: 2 }); },
};
const fx = new EffectSystem(world);

// ======================================================================
// 角色养成：背包 / 等级 / 天赋 / 任务 / 存档
// ======================================================================
const gen = new LootGenerator(LOOT_DATA);
gen.ilvlPolicy = (raw, q) => isPackWild(zone) ? packZoneIlvl(raw, q, progression.level) : endgameIlvl(raw, q, progression.level, endgameCtxIlvl());   // v1.2.12 扩展区域走扩展装等档
gen.playerLevel = () => progression.level;   // v1.2.7 40 级橙装门槛   // v0.9.1q 满级固定装等
const inventory = new Inventory(30, { hp: 0, armor: 0 });
inventory.setBonuses = [...ALL_SET_BONUSES, ...DUNGEON_SETS];   // v0.5 B：套装 2 件属性加成计入角色属性
const progression = new Progression();   // v0.9.7：上限跟随 maxLevel()（本体 30，内容包可加）
let tree = new TalentTree(cls.tree, 0);
const quests = new QuestLog(QUESTS);
const forge = new Forge(FORGE_DATA, inventory);
const shop = new Shop(FORGE_DATA, inventory, gen);
// 存档（阶段三）：localStorage + IndexedDB 双写；一个角色一个存档，3 个角色栏位（core/Roster.ts）
// 有的环境（嵌在沙箱 iframe 里的预览）两者都不能用，退回内存存档
const storage = new BrowserStorage();
let roster = new Roster(storage, LOOT_DATA);
/** 当前角色；saver = 它的存档位 */
let curChar: CharMeta | null = null;
let saver: SaveManager | null = null;
/** 存档损坏且没有可用备份时禁止写入（绝不覆盖玩家的老档） */
let saveBlocked = false;
let lastSaveAt = 0;
let playMs = 0;
let look = 0;
/** 掉落说明书：已获得过的装备 */
const codex = new Set<string>();

const executor = { execute: (s: ResolvedSkill) => { onSkillCast(s); exNoteCast(); executeSkill(s); } };   // v0.9.3e 出手打断疾行
const loadout = new Loadout(executor);
loadout.modRemap = m => skillBook ? skillBook.remapToSlot(m) : m;   // v0.9.1l 装备修饰器按槽位匹配
loadout.setSetBonuses([...ALL_SET_BONUSES, ...DUNGEON_SETS]);   // v0.5 B：狂怒战魂 / 霜誓秘仪（4 件改技能形态）+ v0.6.5 副本小套
/** 切换职业：技能栏、天赋树、存档位、掉落池（装备底材/传说特效按职业） */
function applyClass(id: ClassId) {
  cls = CLASSES[id];
  loadout.classId = id;   // v0.6.9：多职业首饰按职业生效
  skillBook = new SkillBook(skillBookData(cls));   // v0.6.8：技能书（读档时再 load）
  equipFromBook();
  quests.classId = id;   // v0.7：职业任务按职业显示
  if (typeof bindResHud === 'function' && C_READY) resReset(id);   // v0.7.5：职业资源
  spiritsReset(id);   // v0.7.6：英灵传承（每职业一份）
  SLOT_IDS.forEach(slot => loadout.resetCooldown(slot));
  tree = new TalentTree(cls.tree, progression.talentPoints);
  tree.onChange = () => { syncCharacter(); renderTalents(); };
  gen.classId = id;
  inventory.rules = cls.equip;   // 护甲类型、可用武器、双持
  chronoReset(); alchemyReset(); setfxReset(); lgfxReset(); trigfxReset(); resetfxReset(); classExtReset();
}
/** v0.6.8：按技能书装技能栏（普攻固定） */
function equipFromBook() {
  SLOT_IDS.forEach(slot => loadout.equipSkill(slot === 'basic' ? cls.skills[cls.loadout.basic] : skillBook.skillAt(slot), slot));
}
let skillBook!: SkillBook;
/** v0.7.5：上下文绑定之后才能建资源 HUD */
let C_READY = false;
/** v0.6.9：护盾提示（玩家头顶 HUD） */
let shieldShown = 0;
let rareTick = 0;
const CX_T = () => T;
/** 测试用：闪现次数 */
let blinked = 0;
applyClass('warrior');

/** 二级属性换算（装备 → 战斗）：强度每点技能伤害 +0.4%；急速/移速/暴击有上限 */
const POWER_DMG = 0.004, HASTE_CAP = 40, SPEED_CAP = 40, CRIT_CAP = 75;
let moveMul = 1;
/** 角色面板用的最终属性（含等级、天赋、上限） */
function charSheet() {
  inventory.extraElems = skillBook.runeElements();   // v0.6.8：符文元素计入元素共鸣
  const g: CharStats = inventory.stats(), t0 = tree.charStats(), ps = paragon.stats(), lv = progression.level;
  const px = ptalStats();   // v1.0.1 扩展天赋层
  const t = { ...t0, power: t0.power + ps.power + (px.power ?? 0), hp: t0.hp + ps.hp + (px.hp ?? 0), armor: t0.armor + ps.armor + (px.armor ?? 0), haste: t0.haste + ps.haste + (px.haste ?? 0), speed: t0.speed + ps.speed + (px.speed ?? 0), crit: t0.crit + ps.crit + (px.crit ?? 0), critDmg: t0.critDmg + ps.critDmg + (px.critDmg ?? 0) };   // v0.7.10 暗岩印记并入
  // 装备 + 天赋的二级属性同口径相加，再套上限
  const pb = packBuffTotals();   // v1.2.37c 内容包限时增益（急速仍受上限）
  const power = g.power + t.power, hasteRaw = g.haste + t.haste + Math.round(pb.haste * 1000) / 10;
  const haste = Math.min(HASTE_CAP, hasteRaw);
  // v1.2.37 冷却缩减（独立属性）：按技能栏实际结算（装备词条 / 岩纹 / 套装 / 天赋 / 技能书 / 觉醒全部计入），技能 1~3 取技能 1 的口径
  const cdrOf = (slot: SlotId) => { const r = loadout.preview(slot, { now: T, casterHpPercent: 1, targetEffects: [] }); return r?.cdr ?? { raw: 0, cap: slot === 'ultimate' ? loadout.ultCdrCap : CDR_CAP }; };
  const cs1 = cdrOf('skill1'), cu = cdrOf('ultimate');
  const r10 = (v: number) => Math.round(v * 1000) / 10;
  const cdr = { skill: r10(Math.min(cs1.raw, cs1.cap)), skillRaw: r10(cs1.raw), skillCap: r10(cs1.cap), ult: r10(Math.min(cu.raw, cu.cap)), ultRaw: r10(cu.raw), ultCap: r10(cu.cap) };
  return {
    level: lv, maxHp: Math.round((cls.baseHp + cls.hpPerLevel * (lv - 1) + g.hp + t.hp) * (1 + dgxHpPct())), armor: g.armor + t.armor,
    power, powerDmg: Math.round(power * POWER_DMG * 1000) / 10,
    crit: Math.min(CRIT_CAP, Math.round((cls.critChance * 100 + g.crit + t.crit) * 10) / 10), critMult: Math.round((160 + g.critDmg + t.critDmg) * 10) / 10,
    haste, hasteRaw, cdr, speed: Math.min(SPEED_CAP, g.speed + t.speed),
    levelDmg: Math.round(DMG_PER_LEVEL * (lv - 1) * 1000) / 10, ilvl: inventory.averageItemLevel(), gear: g, talent: t,
  };
}
/** v0.7.14：主天赋系 = 点数最多的一系（并列取靠前的；没点返回 null） */
function mainSpec(): string | null {
  if (tree.def.v3) return tree.zone3Owner();   // v1.2.58 天赋 3.0：主系 = 点了区域三的系；2+2+2 没有主系 → 职业平均系数
  let best: string | null = null, n = 0;
  for (const sp of tree.def.specs) { const k = tree.spentIn(sp.id); if (k > n) { n = k; best = sp.id; } }
  return best;
}

function syncCharacter() {
  const lv = progression.level;
  const cs = charSheet();
  const lvMod: ModifierDef = { id: 'level', name: '等级', source: 'buff', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: DMG_PER_LEVEL * (lv - 1) }] };
  const gearMods: ModifierDef[] = [];
  if (cs.power) gearMods.push({ id: 'gear_power', name: cls.powerName, source: 'buff', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: cs.power * POWER_DMG }] });
  // v1.2.37 急速只缩短普攻间隔（攻速）、持续伤害跳间隔、翻滚冷却；不再缩短技能 / 大招冷却（那些归「冷却缩减」）
  if (cs.haste) gearMods.push({ id: 'gear_haste', name: '急速', source: 'buff', desc: '', match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -cs.haste / 100 }] });
  { const pb = packBuffTotals(); if (pb.dmg) gearMods.push({ id: 'pack_buff_dmg', name: '增益', source: 'buff', desc: '', match: {}, ops: [{ op: 'more', stat: 'damage', value: pb.dmg }] }); }   // v1.2.37c 独立乘区
  { const act = inventory.activeItems() as ItemInstance[]; loadout.setUltCdrCap(ultCdrCap(act, ULT_CDR_CAP_BASE)); player.dotCritEcho = hasAwk(act, 'aw_scorch'); }   // v1.2.37 暮时·终局抬大招上限、灼痕
  const tune = classTuneMod(cls.id, mainSpec());   // v0.7.14 职业循环平衡
  loadout.setComboModifiers([...cls.combos, lvMod, ...gearMods, ...skillBook.activeRuneMods(), ...spiritMods(), ...(tune ? [tune] : [])]);
  { const a = spiritResBonus(), b = tree.resBonus(); resSetBonus({ gainMul: a.gainMul + (b.gainMul ?? 0), thrAdd: a.thrAdd + (b.thrAdd ?? 0), maxAdd: a.maxAdd + (b.maxAdd ?? 0), delayAdd: a.delayAdd + (b.delayAdd ?? 0), empowerMore: a.empowerMore + (b.empowerMore ?? 0) }); }   // v0.7.7：英灵 + 资源天赋   // v0.6.8：符文；v0.7.6 英灵传承
  // v0.5：已损坏（耐久 0）的装备不生效；v0.6.2 元素共鸣、v0.6.4 副本遗物以虚拟装备的形式加进来
  { const res = inventory.resonance().item, rl = dgxRelicItem(); const awk = awakenItem(inventory.activeItems() as ItemInstance[]); loadout.setItems([...inventory.activeItems(), ...(res ? [res] : []), ...(rl ? [rl] : []), ...(awk ? [awk] : [])]); }   // v0.7.4：觉醒 / 岩纹
  loadout.setTalents(slotTalents([...tree.activeNodes(), ...ptalNodes()], id => skillBook.slotOf(id), slotOrigin(skillBook))); setFireAlias(inheritedElements(skillBook, 'fire'));   // v1.2.66 槽位继承 + 元素转译   // v1.0.1：+ 扩展天赋层   // v0.7.4：天赋按槽位强化
  // 11-05 防 NaN 兜底：最大生命算出非数时退回职业基础生命，血量比例非数按满血
  const maxHp = Number.isFinite(cs.maxHp) && cs.maxHp > 0 ? cs.maxHp : Math.max(1, Math.round(cls.baseHp + cls.hpPerLevel * (lv - 1)));
  if (maxHp !== cs.maxHp) console.warn('syncCharacter: maxHp 非数，已兜底', cs.maxHp, '→', maxHp);
  const pct0 = player.maxHp ? player.hp / player.maxHp : 1, pct = Number.isFinite(pct0) ? pct0 : 1;
  player.maxHp = maxHp;
  player.armor = cs.armor;
  player.critChance = cs.crit / 100;
  player.critMult = cs.critMult / 100;
  player.dotPower = 1 + cs.power * POWER_DMG;   // v0.9.1l 持续伤害随强度（攻击强度 / 法术强度按职业）
  player.haste = cs.haste / 100;               // v0.9.1l 急速缩短持续伤害跳间隔
  moveMul = (1 + cs.speed / 100) * (1 + packBuffTotals().speed);   // v1.2.37c 增益移速不受上限
  dodge.haste = cs.haste;   // 急速同样缩短翻滚冷却
  if (player.alive) player.hp = Math.max(1, Math.round(maxHp * pct));
  refreshGear();
  $('talent-dot').style.display = tree.available > 0 ? 'inline-block' : 'none';
}

/** v1.2.48 武器收纳：最近 STOW_AFTER 秒内出手（攻击 / 施法动作）、受击，或有怪在追打 → 拿在手上；否则收回背 / 腰（weaponstow.ts） */
let stowCombat = false, stowPoll = 0;
function stowTick(dt: number) {
  if ((stowPoll -= dt) <= 0) { stowPoll = 0.25; stowCombat = inCombatNow(); }
  const a = player.rig.anim;
  const drawn = !player.alive || stowCombat || (a ? a.actAge < STOW_AFTER : false) || T - player.lastHurt < STOW_AFTER;
  gearStowTick(player.rig, dt, drawn);
}
/** 11-04 加载画面预载样本：每个可选职业的身体（含内容包登记的 40 级套装整身）+ 已解析的全部武器道具（含高清件）。
 *  只用来预编译 / 上传贴图，预载完就丢；写实设置关着时只有经典模型，照样预载 */
function buildPreloadKit(): THREE.Group {
  const kit = new THREE.Group(); kit.name = 'preload-kit';
  const ids = (Object.keys(CLASSES) as ClassId[]).filter(id => isClassAvailable(id));
  for (const id of ids) {
    const keep = classBodyOf(id);
    for (const body of [null, ...(CLASS_BODY_VARIANTS[id] ?? [])]) {
      if (body && !hdHas(body)) continue;
      try { setClassBody(id, body); const r = M.makeClassRig(id, 0); kit.add(r.root); } catch (e) { console.warn('预载职业模型失败', id, body, e); }
    }
    setClassBody(id, keep);
  }
  for (const n of glbNames()) if (n.startsWith('weapon_')) { const m = makeGlbProp(n, 1); if (m) { m.userData.kitProp = true; kit.add(m); } }
  return kit;
}
/** 装备外观：身上的装备（含强化等级）变了才重建模型挂件 */
let gearSig = '';
function refreshGear(force = false) {
  if (!player) return;
  const sig = cls.id + '|' + EQUIP_SLOTS.map(s => { const i = inventory.equipped[s]; return i ? `${i.id}:${i.upgrade ?? 0}${isBroken(i) ? ':x' : ''}` : '-'; }).join(',');
  if (!force && sig === gearSig && player.rig.root.userData.gearFx) return;
  gearSig = sig;
  // 11-04 职业身体覆盖（内容包钩子，例：法师 40 级长袍）：变了就整模型重建（swapPlayerModel 里会再 refreshGear(true)）
  if (CLASS_BODY_HOOKS.length) {
    let body: string | null = null; for (const h of CLASS_BODY_HOOKS) { body = h(cls.id, inventory.equipped as never); if (body) break; }
    if (body !== classBodyOf(cls.id)) { setClassBody(cls.id, body); swapPlayerModel(cls.id as ClassId, look ?? 0); return; }
  }
  applyGear(player.rig, (player.rig.root.userData.cls as string) ?? cls.id, inventory.equipped);
}
function save() {
  if (!saver || !curChar || saveBlocked || !started) return;
  const map = zone === 'dungeon' ? 'camp' : zone === 'field' ? 'field' : isWildId(zone) ? zone : zone === 'raid' ? 'ember' : 'camp';   // 副本里存档：读回来在营地；长副本里存档：读回来在入口
  const pos = zone === 'dungeon' ? undefined : zone === 'raid' ? raidGatePos() : { x: Math.round(player.pos.x * 10) / 10, z: Math.round(player.pos.z * 10) / 10 };
  inventory.equippedItems().concat(inventory.bag).forEach(markSeen);   // 套装保底：身上和背包里的部件都算见过
  const tp = talentPagesSave();
  const fresh = { classId: cls.id, inventory: inventory.save(), level: progression.save(), talents: tp.talentPages[tp.talentPage], quests: quests.save(), tutorial: tutState,
    name: curChar.name, look, playMs: Math.round(playMs), map, pos, codex: [...codex], elite: 0, waypoints: [...waypoints], raid: raidSave(), ...abyssSave(), dgx: dgxSave(),
    dungeonBest: { ...dungeonBest }, ...setsSave(), ...exchangeSave(), skillbook: skillBook.save(), ...gearSetsSave(), ...paragonSave(), ...achSave(), ...nextSave(), mapStats: mapStatsSave(), wboss: wbSave(), ex: exSave(), rep: repSave(), runewords: runeWordsSave(), spirits: spiritsSave(), ...tp };
  // v0.9.7 DLC 框架：已注册的包写自己的 dlc.<id>；读档时本版本不认识的字段（其它包的 dlc、封存列表、停放位置、未来版本字段）原样写回
  const mine: Record<string, unknown> = {};
  for (const p of packs()) if (p.saveData) mine[p.id] = p.saveData();
  ptalSaveInto(mine);   // v1.0.1 扩展天赋层
  const dlc = mergeDlcField((loadedSave as PackGameSave | null)?.dlc, mine);
  // v1.0.1 停放规则（Rhett 10-22 交给 Hark 定）：内容包区域的存档在本体里读 → 人在营地、原位置停放。
  // 本体里离开过营地（去过任何别的区域）= 玩家在本体里接着玩了 → 停放作废，回内容包构建时以本体位置为准；
  // 只在营地里转转就回去 → 仍回到内容包里的停放位置。
  const parkDrop = !!(loadedSave as PackGameSave | null)?.packPark && leftCampSincePark;
  const fresh2 = parkDrop ? { ...fresh, packPark: undefined } : fresh;
  saver.save(carrySave(loadedSave, dlc ? { ...fresh2, dlc } : fresh2));
  saveBank();
  lastSaveAt = Date.now();
  roster.update(curChar.id, { level: progression.savedLevel, ilvl: inventory.averageItemLevel(), map, playMs: Math.round(playMs), savedAt: lastSaveAt, classId: cls.id, look });
}
/** 读当前角色的存档；没有存档时重置成新角色。返回读档状态（corrupt 时不会进游戏） */
let loadStatus: LoadStatus = 'none';
let loadedSave: GameSave | null = null;
/** v1.0.1：本次读档后是否离开过营地（停放规则用） */
let leftCampSincePark = false;
function load() {
  const r = saver ? saver.loadResult() : { status: 'none' as LoadStatus, save: null };
  loadStatus = r.status; loadedSave = r.save; leftCampSincePark = false;
  // v0.9.7 DLC 框架：没注册的包的物品封存、不认识的区域回营地（原位置停放）；注册了的包把之前封存的放回去
  packFix = r.save ? applyPackCompat(r.save as PackGameSave, { hasPack, knownMap: isKnownMap, canEnterMap: id => { const z = packZone(id); return !z || !!z.enter; }, knownClass: isClassAvailable, bagCap: inventory.capacity }) : null;
  for (const p of packs()) p.loadData?.((r.save as PackGameSave | null)?.dlc?.[p.id]);
  const s = r.save;
  codex.clear();
  waypoints.clear(); waypoints.add('camp'); waypoints.add('field'); loadBank(); raidLoad(r.save?.raid); abyssLoad((r.save as { abyss?: Parameters<typeof abyssLoad>[0] } | undefined)?.abyss); dgxLoad(r.save?.dgx);
  dungeonBest = {};
  loadSetsState(s);   // v0.5 B：套装保底
  loadExchangeState(s);   // v0.5 C：兑换每周限购
  mapStatsLoad(s?.mapStats);   // v0.6.9
  wbLoad(s?.wboss);
  exLoad(s?.ex);   // v0.9.3e 探索
  repLoad(s?.rep);   // v0.9.3f 区域声望   // v0.9.3d 世界首领
  runeWordsLoad(s?.runewords);   // v0.7.4
  spiritsLoad(s?.spirits);   // v0.7.6
  skillBook.load(s?.skillbook); skill4Check(false); equipFromBook(); SLOT_IDS.forEach(slot => loadout.resetCooldown(slot));   // v0.6.8：技能书
  if (!s) {
    playMs = 0;
    inventory.load({ gold: 0, bag: [], equipped: {}, stacks: { potion_s: 3 } });
    progression.load({ level: 1, xp: 0 });
    tree.totalPoints = 0; tree.load({}); talentPages = [{}, {}, {}]; talentPage = 0; heldPages = [null, null, null]; gearSetsLoad(null); paragonLoad(null); achLoad(null); nextLoad({}, 1);
    ptalInit(cls.id, 0);   // v1.0.1
    quests.load({ active: {}, done: [] });
    tutState = 0;                                    // 新角色：进营地就开始新手引导
    return false;
  }
  migrateDurability([...Object.values(s.inventory.equipped ?? {}), ...s.inventory.bag]);
  inventory.load(s.inventory);
  { const mg = inventory.migrateRangedOffhand(() => { const b = cls.ext?.silhouette?.mainHand; return b ? gen.generateFromBase(b, Math.max(1, s.level?.level ?? 1), 'white') : null; }); if (mg.length) console.info('11-05 远程副手迁移', mg.join(' ')); }   // 11-05 灵契猎手：短刃退回背包 / 弓挪到弓位 / 补长柄
  migrateAwk(inventory.equippedItems().concat(inventory.bag));   // v1.2.37 旧存档被删的觉醒词条 → 新池等价词条
  inventory.equippedItems().concat(inventory.bag).forEach(it => { gen.migrateIlvl(it, (x, l) => applyUpgrade(x, l, FORGE_DATA)); if (gen.migrateFixed(it, FIXED_MIGRATE)) console.info('11-05 固定装备换代', it.fixedId); gen.refreshEffects(it); if (it.fixedId && SET_RENAMES[it.fixedId]) it.name = SET_RENAMES[it.fixedId]; });   // v0.6.9：橙装特效按最新配置刷新；v0.9.1m 套装手部件改名
  progression.load(s.level);
  dungeonBest = { ...(s.dungeonBest ?? {}) };
  paragonLoad((s as { paragon?: unknown }).paragon);
  achLoad((s as { ach?: Parameters<typeof achLoad>[0] }).ach);   // v0.7.12
  nextLoad((s as { guide?: Parameters<typeof nextLoad>[0] }).guide, s.level.level);   // v0.7.13
  tree.totalPoints = talentPointsTotal((s.quests as { done?: string[] } | undefined)?.done ?? []); skill4Check(false); gearSetsLoad((s as { gearSets?: unknown }).gearSets);
  talentPages = [0, 1, 2].map(i => ({ ...((s.talentPages?.[i]) ?? (i === (s.talentPage ?? 0) ? s.talents : {}) ?? {}) }));   // v0.7.7：3 套天赋页
  talentPage = Math.min(2, Math.max(0, s.talentPage ?? 0));
  // v0.9.7：等级被上限压住（内容包里练的高等级）时，点数不够的天赋页会被 tree.load 清空 —— 原页记住，没重新加点就原样写回
  // v1.2.58 天赋 3.0：旧版天赋页全额返还（各页都清空，提示一次）
  // v1.2.77 天赋方案 B：资料片两职业关键节点整套重做（树带 saveVer 4），旧页同样全额返还，提示换成职业专属文案
  const tv = treeSaveVer(tree.def), oldV = talentPages.reduce((m, p) => Math.min(m, Object.entries(p).some(([k, v]) => k !== '__v' && v > 0) ? (p.__v ?? 0) : 99), 99);
  if (tree.def.v3 && talentPages.some(p => (p.__v ?? 0) < tv && Object.entries(p).some(([k, v]) => k !== '__v' && v > 0))) {
    talentPages = talentPages.map(p => ((p.__v ?? 0) < tv ? { __v: tv } : p));
    pendingTalentNotice = oldV >= V3_SAVE_VER ? 'b' : true;
  }
  heldPages = progression.held ? talentPages.map(p => (Object.entries(p).some(([k, v]) => k !== '__v' && v > 0) ? { ...p } : null)) : [null, null, null];
  tree.load(talentPages[talentPage]);
  // v1.0.1：扩展天赋层（内容包）：读选择、按选择学会 / 忘掉终极天赋技能
  ptalInit(cls.id, progression.packTalentPoints); ptalLoad((s as PackGameSave).dlc); if (ptalSyncSkills(skillBook).learned.length) equipFromBook();
  quests.load(s.quests);
  pendingNotices = s.notices ?? [];
  if (pendingTalentNotice === 'b') { pendingTalentNotice = false; pendingNotices.push(`${cls.name}天赋按新方案重做（${tree.def.specs.map(s => s.name).join(' / ')}，关键节点与绝技全部更新）。旧天赋点已全额返还，请打开天赋面板重新加点（免费洗点）`); }
  if (pendingTalentNotice) { pendingTalentNotice = false; pendingNotices.push('天赋 3.0 上线：三区域结构（主 3 + 副 1 + 副 1 / 主 3 + 副 2 / 主 2 + 副 2 + 副 2，共 30 点）。旧天赋点已全额返还，请打开天赋面板重新加点（免费洗点）'); }
  playMs = s.playMs ?? 0;
  (s.waypoints ?? []).forEach(w => waypoints.add(w));
  if (s.bank?.length && !bank.length) { bank = s.bank.slice(0, BANK_SIZE); migrateAwk(bank); }   // 早期测试版存在角色存档里的仓库：搬到共享仓库
  (s.codex ?? []).forEach(k => codex.add(k));
  inventory.equippedItems().concat(inventory.bag).forEach(noteCodex);
  // 旧存档没有引导进度：已经玩过（升过级/做过任务）就视为完成
  tutState = typeof s.tutorial === 'number' ? s.tutorial : (s.level.level > 1 || (s.quests.done?.length ?? 0) > 0 ? -1 : 0);
  { const n = skillBook.tomesForLevel(progression.level, TOME_LEVELS); if (n) { inventory.addStack(TOME_ID, n); pendingNotices.push(`v0.6.8 新增技能书：按等级补发「自选技能书」×${n}，按 K 打开技能面板学习新技能`); } }
  return true;
}
/** v0.7.8：30 级自动学会第 4 槽的第二个技能（25 级开放第 4 槽，默认技能开局就会） */
function skill4Check(announce: boolean) {
  const b = SKILL4[cls.id as keyof typeof SKILL4]?.[1] ?? (cls.ext?.book?.choices.skill4?.[1] ? cls.skills[cls.ext.book.choices.skill4[1]] : undefined);   // v1.0.6 内容包职业：技能书第 4 槽第二个
  if (b && progression.level >= SKILL4B_LEVEL && skillBook.learn(b.id) && announce) toast(`30 级：学会新绝技「${b.name}」，按 K 在技能书里切换`, '#ffd100');
}
/** v0.7.7 天赋树 2.0：3 套天赋页（当前页 = tree） */
let talentPages: TalentSave[] = [{}, {}, {}], talentPage = 0;
/** v0.9.7：等级超上限读档时被清空的天赋页原样（该页还是空的 = 玩家没重新加点 → 写回原样） */
let heldPages: (TalentSave | null)[] = [null, null, null];
const pageEmpty = (p: TalentSave) => !Object.entries(p).some(([k, v]) => k !== '__v' && v > 0);   // v1.2.58：__v 是天赋版本号，不算加点
function talentPagesSave() { talentPages[talentPage] = tree.save(); return { talentPages: talentPages.map((p, i) => ({ ...(heldPages[i] && pageEmpty(p) ? heldPages[i]! : p) })), talentPage }; }
/** v0.9.7 DLC 框架：本次读档的内容包兼容处理结果（封存 / 停放 / 职业锁定） */
let packFix: PackFixReport | null = null;
function switchTalentPage(i: number): boolean {
  if (i === talentPage || i < 0 || i > 2) return false;
  if (inCombatNow()) { toast('战斗中不能切换天赋页'); audio.error(); return false; }
  talentPages[talentPage] = tree.save(); talentPage = i; tree.load(talentPages[i]);
  toast(`切换到天赋页 ${i + 1}`, '#ffd100'); save(); return true;
}
/** 读档时迁移产生的一次性提示（如 v3→v4「天赋已重置，请重新分配」） */
let pendingNotices: string[] = [];
let pendingTalentNotice: boolean | 'b' = false;   // v1.2.77 'b' = 天赋方案 B 返还

inventory.onChange = () => { syncCharacter(); renderBag(); renderShop(); renderChar(); };
progression.onLevelUp = lv => {
  tree.totalPoints = talentPointsTotal();
  syncCharacter();
  player.hp = player.maxHp;
  skill4Check(true);
  runStoryHooks('levelUp', lv);   // v0.9.9 内容包剧情钩子
  const pp0 = ptal()?.points ?? 0; ptalSetPoints(progression.packTalentPoints);   // v1.0.1：32/34/36/38/40 级各 1 个扩展天赋点
  if (lv > MAX_LEVEL) toast(`升级！等级 ${lv}${progression.packTalentPoints > pp0 ? `，获得 1 个扩展天赋点（按 N，天赋面板的扩展页签）` : ''}`, '#ffd100'); else
  toast(lv >= TALENT_START_LEVEL ? `升级！等级 ${lv}，获得 1 个天赋点${lv === TALENT_START_LEVEL ? '（天赋开放，按 N）' : ''}` : `升级！等级 ${lv}`, '#ffd100');
  lessonOnLevel(lv);   // v0.7.13 10/25/30 级教学
  for (const u of unlocksAt(lv)) toast(`解锁：${u.name} —— ${u.hint}`, '#80d8ff');   // v0.7.9：解锁节奏
  { const n = skillBook.tomesForLevel(lv, TOME_LEVELS); if (n) { inventory.addStack(TOME_ID, n); setTimeout(() => toast(`获得「自选技能书」×${n}，按 K 打开技能面板学习新技能`, '#c080ff'), 900); } }   // v0.6.8
  spawnRing(player.getPos(), 3, '#ffd100', 0.8);
  particles.emit({ x: player.pos.x, y: 0.2, z: player.pos.z }, { count: 70, color: 0xffd34d, color2: 0xffffff, speed: 1.2, up: 4, spread: 0.6, radius: 1.2, life: 1.4, size: 0.35, drag: 0.5 });
  audio.levelUp();
  save();
};
quests.events = {
  onProgress: (_q, text) => toast(text, '#ffd100'),
  onReady: q => { toast(`「${questText(q)}」可以交了`, isKeyQuest(q) ? KEY_QUEST_COLOR : '#3f3'); save(); },
};

/** 掉落说明书：记下获得过的装备（底材+品质、固定装备、传说特效） */
function noteCodex(it: ItemInstance) {
  codex.add(`${it.baseId}|${it.quality}`);
  if (it.setId) codex.add(`fixed|${it.name}`);
  if (it.quality === 'orange') codex.add(`lg|${it.name}`);
  if (it.fixedId?.startsWith('dl_')) codex.add(`fixed|${it.name}`);   // v0.9.3h 副本专属件（副本地图掉落列表打 ✓）
  if (it.quality === 'dark' && it.fixedId) codex.add(`dark|${it.fixedId}`);
  markSeen(it);   // 套装保底：见过的部件
}
/** v1.2.38 30 级起只有内容包内容给升级经验：老地图、老副本、老爬塔不再给 30 级以后的升级经验（本体上限就是 30，不装包时行为不变） */
export const OLD_XP_CAP = 30;
/** 当前所在地是不是内容包的地方（包野外 / 包区域 / 包小副本） */
function packXpHere(): boolean {
  if (!packs().length) return false;
  if (isPackWild(zone) || packDungeonHere()) return true;
  return packList<{ id?: string }>('zones').some(z => z?.id === zone);
}
let xpBlockNote = 0;
function addXp(n: number, pack?: boolean) {
  if (progression.level >= progression.maxLevel) { paragonGainXp(n); return; }   // v0.7.10：满级后转成暗岩印记经验（v0.9.7：满级 = 当前上限）
  if (progression.level >= OLD_XP_CAP && !(pack ?? packXpHere())) {
    // fix1108 #10（Rhett 11-08 批）：装资料片后 30–39 级打本体内容不给升级经验，但不再什么都不给——转成暗岩印记经验（长副本全额，其他 25%，同满级规则）
    paragonGainXp(n, true);
    const now = performance.now(); if (now - xpBlockNote > 20000) { xpBlockNote = now; floatText(player, `${OLD_XP_CAP} 级后这里的经验转为印记经验（升级去资料片地图）`, '#9a8ab0', 1.6); }
    return;
  }
  progression.addXp(n);
  floatText(player, `+${n} 经验`, '#c080ff', 1.4);
}
/** v0.7.10：天赋点 = 等级（10 级起每级 1）+ 暗岩印记（20/40/60/80/100 各 1）+ 职业任务（每个 1，共 2） */
function questTalentPoints(done?: string[]) {
  const d = done ? new Set(done) : null;
  return CLASS_QUESTS.filter(q => q.cls === cls.id && (d ? d.has(q.id) : quests.state(q.id, progression.level) === 'done')).length;
}
function talentPointsTotal(done?: string[]) { return progression.talentPoints + paragon.talentPoints + questTalentPoints(done); }
function refreshTalentPoints() { tree.totalPoints = talentPointsTotal(); renderTalents(); }

// ======================================================================
// 状态留在 main（enemies.ts 通过 C 读写）
let dungeonRun: DungeonRun | null = null;
/** v0.5 A：副本难度（传送阵里选）、每个副本通关过的最高难度（0~3）、当前这次副本的同步配置 */
let dungeonBest: Record<string, number> = {};
bindDurabilityUi(C);   // → durability_ui.ts
bindSalvageUi(C);      // → salvage_ui.ts（v0.6.7 一键分解面板 + 回购）
bindSetsUi(C);   // → sets_ui.ts（v0.5 B）
bindSmith(C);   // → smith.ts（v0.5 C：锁定 / 批量分解 / 兑换）
bindEnemies(C);   // → enemies.ts
bindWorldBoss(C);   // → worldboss.ts（v0.9.3d）
bindPackBoss(C);   // → packboss.ts（v1.1.0 内容包首领）
bindPackDungeon(C);   // → packdungeon.ts（v1.2.16 内容包小副本）
bindExtKey(C);   // → extkey.ts（v1.1.1 扩展按键）
bindSlotKey(C);   // → slotkey.ts（v1.2.15 第 8 技能格）
bindExplore(C);   // → explore.ts（v0.9.3e）
bindRegional(C);   // → regional.ts（v0.9.3f）


// ======================================================================
// 状态留在 main（travel.ts 通过 C 读写）
let bank: ItemInstance[] = [];
bindTravel(C);   // → travel.ts
bindRaid(C);   // → raid.ts（阶段六长副本）
bindDungeonPlus(C);   // → dungeonplus.ts（v0.6.4 副本四难度 / 遗物 / 异变 / 誓约 / 奖牌）
// ======================================================================
bindCombatEvents(C);   // → combatev.ts

// ======================================================================
// 状态留在 main（casting.ts 通过 C 读写）
let dash: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; skill: ResolvedSkill; tgt: Enemy } | null = null;
let swing = 0, spin = 0;
bindCasting(C);   // → casting.ts
bindClassGear(C); // → classgear.ts（v0.7.2 新职业橙装 / 暗金 / 套装 / 职业任务查询）
bindChrono(C);    // → chrono.ts（v0.7.0 时砂行者）
bindAlchemy(C);   // → alchemy.ts（v0.7.1 炼金投弹手）
bindSetfx(C);     // → setfx.ts（v0.9.1m 长副本套装 6 件效果）
bindLgfx(C);      // → lgfx.ts（v0.9.1r 橙装战斗钩子）
bindTrigfx(C); bindResetfx(C);   // → trigfx.ts / resetfx.ts（v1.2.35 可控触发、冷却重置）
bindClassExt(C);  // → classext.ts（v1.0.6 内容包职业运行时）
bindPackRt(C);   // → packrt.ts（v1.1.1 内容包倍率 / 易伤 / 事件；没有包 = 不挂）
classExtReset();

// ======================================================================
bindEffects(C);   // → effects.ts

// ======================================================================
bindLootNpc(C);   // → lootnpc.ts
bindSkillBookUi(C);   // → skillbook_ui.ts（v0.6.8）
bindAwakenUi(C);   // → awaken_ui.ts（v0.7.4）
bindSpiritUi(C); spiritsReset(cls.id);
bindGearSets({ inventory: () => inventory, skillBook: () => skillBook, talentPage: () => talentPage, switchTalentPage, inCombat: inCombatNow, equipFromBook, sync: syncCharacter, save, toast, error: () => audio.error(), click: () => audio.click(), now: () => Date.now() });   // v0.7.9 装备方案   // → spirit_ui.ts（v0.7.6）
bindParagon({ level: () => progression.level, inLongRaid, sync: syncCharacter, save, refreshPoints: refreshTalentPoints, toast, click: () => audio.click(), error: () => audio.error(), floatXp: t => floatText(player, t, '#7fd4ff', 1.4) });   // v0.7.10 暗岩印记
bindAbyssUi({ story: () => ({ active: storyActive(), done: storyDone() }), enterStory, replayEnding: () => { audio.hold('ending'); showEnding(() => audio.hold(null)); }, enterWeekly, weekly: weeklyInfo, enter: () => enterAbyss(), lock: abyssLock, rec: () => abyRec, inAbyss, togglePanel, click: () => audio.click(), icon: id => uiIcon(id) });
bindNext({   // v0.7.13
  started: () => started,
  snap: () => ({ level: progression.level, eqBest: Math.max(-1, ...inventory.equippedItems().map(it => QUALS_.indexOf(it.quality))), talentSpent: tree.spent,
    spiritEq: SPIRITS_.equipped().length, bookExtra: Math.max(0, skillBook.learned.size - new Set(Object.values(skillBook.data.defaults)).size), achCount: ACH_.count(), bosses: ACH_.boss }),
  recs: nextRecs,
  open: a => { if (a === 'raidguide') toggleWorldMap(); else togglePanel(a, true); },
  togglePanel, toast, addGold: n => { inventory.gold += n; inventory.onChange?.(); }, click: () => audio.click(), save: () => { if (started) save(); },
  // v0.9.6g 玩法介绍
  isnap: () => ({ level: progression.level, codexLg: [...codex].filter(k => k.startsWith('lg|')).length, codexSet: [...codex].filter(k => k.startsWith('fixed|') && SET_PIECE_NAMES.has(k.slice(6))).length }),
  items: introItems, cls: () => cls.id, lessonExtra: (lv: number) => cls.ext?.guide?.lessons?.[lv] ?? [], classLesson: (lv: number) => { const f = cls.ext?.guide?.first; return lv === 2 && f ? { lv: 2, title: f.title, lines: f.lines, acts: [['skillbook', '打开技能书 K']] } : undefined; },
  go: a => { if (a === 'worldmap') toggleWorldMap(); else if (a === 'dropguide') openDropGuide(); else if (a === 'abyss') openAbyss(); else togglePanel(a, true); },
});
/** v0.7.13：推荐下一步（按优先级） */
function nextRecs() {
  const r: import('./nextstep').Rec[] = [], lv = progression.level;
  const goQuest = (id: string) => () => { setFocus(id); renderTracker(); startAutoPath(); };
  if (tree.available > 0) r.push({ text: `分配 ${tree.available} 个天赋点`, why: '天赋点没花就是白白浪费的战力', btn: '天赋 N', act: () => togglePanel('talent', true) });
  if (paragon.available > 0) r.push({ text: `分配 ${paragon.available} 点暗岩印记`, why: '在角色面板的暗岩印记里加点', btn: '角色 C', act: () => togglePanel('char', true) });
  if (inventory.stack(TOME_ID) > 0) r.push({ text: `用掉 ${inventory.stack(TOME_ID)} 本自选技能书`, why: '学会新技能，换掉不顺手的', btn: '技能书 K', act: () => togglePanel('skillbook', true) });
  { const sp = SPIRITS_; const free = sp.slotCount() - sp.equipped().length; const idle = sp.pool().filter(d => sp.unlocked(d) && !sp.slots.includes(d.id)).length;
    if (free > 0 && idle > 0) r.push({ text: `英灵槽还空着 ${free} 个`, why: '已解锁的英灵装上就有加成，打首领还能升阶', btn: '英灵 Y', act: () => togglePanel('spirit', true) }); }
  const act = quests.active();
  for (const a of act.filter(x => x.ready)) r.push({ text: `交任务「${questText(a.q)}」`, why: `回去找${npcName(a.q.turnIn)}领奖励`, btn: '寻路', act: goQuest(a.q.id) });
  const avail = quests.defs.filter(q => !q.repeatable && quests.state(q.id, lv) === 'available' && (!q.cls || q.cls === cls.id));
  for (const q of avail.filter(q => q.cls)) r.push({ text: `接职业任务「${questText(q)}」`, why: `找${npcName(q.giver)}；完成多 1 个天赋点`, btn: '任务 L', act: () => togglePanel('quests', true) });
  const main = act.find(x => !x.ready && !x.q.repeatable);
  if (main) r.push({ text: `继续「${questText(main.q)}」`, why: '跟着任务走，经验和装备来得最快', btn: '寻路', act: goQuest(main.q.id) });
  for (const q of avail.filter(q => !q.cls).slice(0, 1)) r.push({ text: `接新任务「${questText(q)}」`, why: `找${npcName(q.giver)}`, btn: '任务 L', act: () => togglePanel('quests', true) });
  if (lv >= 30) r.push({ text: '去刷长副本', why: '印记经验全额，暗金和橙装主要来源', btn: '地图 M', act: () => toggleWorldMap() });
  else {
    const w = WILD_IDS_.filter(id => WILD_[id].minLevel <= lv).pop();
    const where = lv < 6 ? '暗岩矿洞' : lv < 12 ? '腐沼神殿和翠风原野' : w ? WILD_[w].name : '翠风原野';
    r.push({ text: `去${where}练级`, why: '和你等级相近的地方，经验最划算', btn: '地图 M', act: () => toggleWorldMap() });
  }
  if (ACH_.count() < 61) r.push({ text: '看看快完成的成就', why: '成就给称号，首领图鉴也在那里', btn: '成就 O', act: () => togglePanel('achv', true) });
  return r;
}
bindAchv({   // v0.7.12
  snap: () => {
    const sp = SPIRITS_, pool = sp.pool(), rr = raidSave(), cx = [...codex], sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
    return { level: progression.level, paragon: paragon.level, bossKills: sp.stat('dungeon'), eliteKills: sp.stat('elite'), raidKills: sp.stat('raid'),
      raidClears: sum(rr.clears), hellClears: sum(rr.hell), spirits: pool.filter(d => sp.unlocked(d)).length, spiritT3: pool.filter(d => sp.tier(d.id) >= 3).length,
      runewords: runeWordsSave().length, legendaries: cx.filter(k => k.startsWith('lg|')).length, darks: cx.filter(k => k.startsWith('dark|')).length,
      sets: cx.filter(k => k.startsWith('fixed|')).length, codex: cx.length, classQuests: questTalentPoints(), gold: inventory.gold, abyss: abyRec.best, story: storyDone() ? 1 : 0, weekly: weeklyBest() };
  },
  toast, click: () => audio.click(), fanfare: () => audio.victory(), togglePanel, openDropGuide: () => openDropGuide(), save: () => { if (started) save(); }, started: () => started,
});
bindResHud(C); C_READY = true; resReset(cls.id);   // → reshud.ts（v0.7.5）
bindMapPoi(C);   // → mappoi.ts（v0.6.9 地图图例）
bindRaidMap(C);   // → raidmap.ts（v0.6.10 副本地图）

// ======================================================================
// 界面
// ======================================================================
const textCache = new Map<string, string>();
function setText(id: string, t: string) { if (textCache.get(id) !== t) { textCache.set(id, t); $(id).textContent = t; } }
function setW(id: string, k: number) { ($(id) as HTMLElement).style.width = `${Math.max(0, Math.min(1, k)) * 100}%`; }

/** v0.9.6c 统一通知栏：拾取 / 任务 / 成就 / 升级 / 提示合并成右侧一列（手机在顶部居中），按类型给图标和粒子拖尾 */
function toast(text: string, color = '#fff') {
  const d = noticeEl(text, color);
  $('toast').appendChild(d); setTimeout(() => d.remove(), 3600);
  const cap = document.documentElement.classList.contains('phone') ? 3 : 5;
  while ($('toast').children.length > cap) $('toast').firstChild!.remove();
}
let yellTimer = 0;
/** v1.2.48 旁白字幕（屏幕下方，标题画面上也看得见）；sec 秒后淡出 */
let subTimer = 0;
function showSubtitle(text: string, sec: number) {
  let el = document.getElementById('vo-sub');
  if (!el) { el = document.createElement('div'); el.id = 'vo-sub'; document.body.appendChild(el); }
  el.textContent = text; el.classList.add('on');
  window.clearTimeout(subTimer); subTimer = window.setTimeout(() => el!.classList.remove('on'), sec * 1000);
}
function yell(text: string, color: string, sec: number) { const y = $('yell'); y.textContent = text; y.style.color = color; yellTimer = sec; }

const panels = ['bag', 'char', 'talent', 'quests', 'dialog', 'settings', 'shop', 'travel', 'worldmap', 'changelog', 'dropguide', 'bank', 'raidguide', 'exchange', 'skillbook', 'raidmap', 'awaken', 'spirit', 'achv', 'nextstep', 'lesson', 'abyss'];
const anyPanelOpen = () => panels.some(p => $(p).style.display === 'flex');
function togglePanel(id: string, show?: boolean) {
  const el = $(id); const on = show ?? el.style.display !== 'flex';
  const was = el.style.display === 'flex';
  panels.forEach(p => { if (p !== id) $(p).style.display = 'none'; });
  el.style.display = on ? 'flex' : 'none';
  if (on !== was) { if (on) audio.open(); else audio.close(); }
  if (on && id === 'settings') renderSettings();
  if (!on || id !== 'exchange') closeSmithDialog();
  document.documentElement.classList.toggle('panel-open', anyPanelOpen());
  if (on) tutEvent('panel', id);
  if (on) { if (id === 'bag') renderBag(); if (id === 'spirit') renderSpirits(); if (id === 'achv') { achCheck(); renderAchv(); } if (id === 'char') { charSel = null; renderChar(); } if (id === 'talent') renderTalents(); if (id === 'quests') renderQuestLog(); if (id === 'shop') renderShop(); if (id === 'exchange') renderExchange(); if (id === 'skillbook') renderSkillBook(); if (id === 'awaken') renderAwaken(); }
  hideTip();
}
document.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => togglePanel((x as HTMLElement).dataset.close!, false)));
$('btn-bag').onclick = () => togglePanel('bag');
$('btn-char').onclick = () => togglePanel('char');
$('bag-char').onclick = () => togglePanel('char');
$('btn-talent').onclick = () => togglePanel('talent');
$('btn-quest').onclick = () => togglePanel('quests');
$('btn-settings').onclick = () => togglePanel('settings');
$('btn-settings-top').onclick = () => togglePanel('settings');   // v1.2.54 Rhett：进游戏后顶栏直接有设置按钮
// 手机：菜单按钮收进「≡」抽屉，点抽屉外或选中一项后收起
$('btn-menu').onclick = e => { e.stopPropagation(); document.documentElement.classList.toggle('menu-open'); audio.click(); };
document.addEventListener('click', e => { if (!(e.target as HTMLElement).closest?.('#btn-menu')) document.documentElement.classList.remove('menu-open'); });
// v0.9.2a：菜单子项红点汇总到「≡」；技能簇重叠自检（任意两键中心距 ≥ 半径和 + 10px）
setInterval(() => {
  const n = Array.from(document.querySelectorAll<HTMLElement>('#menu .dot')).filter(d => d.style.display !== 'none').length;
  const b = $('menu-badge'); b.style.display = n ? '' : 'none'; b.textContent = String(n);
}, 500);
export function checkSkillLayout() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('#skillbar .skill'));
  const vis = els.filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
  const bad: string[] = [];
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 10 * Math.min(1, a.r / 29)) bad.push(`${a.id}×${b.id}`);
  }
  if (bad.length) console.warn('[HUD] 技能键重叠：', bad.join(', '));
  return bad;
}
setTimeout(checkSkillLayout, 3000);
// 所有按钮的点击音
document.addEventListener('click', e => { if ((e.target as HTMLElement).closest?.('.btn,.cell,.tnode')) audio.click(); });

// 状态留在 main（panels.ts 通过 C 读写）
let charSel: EquipSlot | null = null;
let talSel: TalentNodeDef | null = null;
bindPanels(C);   // → panels.ts
initHudClock();   // v1.2.68 小地图时间条
initCursors();   // v1.2.69 专属鼠标指针

// ----- 任务 -----
function renderQuestLog() {
  const b = $('quest-body');
  const act = sortByHere(quests.active(), currentMap());   // v1.2.68 当前地图的任务置顶 + 区域标注
  b.innerHTML = act.length ? `<p class="hint" style="margin-bottom:6px">HUD 最多追踪 3 个任务；焦点任务会在小地图、罗盘和地面上显示路线，可以「自动寻路」。</p>` : '<p style="color:var(--ink2)">没有进行中的任务。去营地找头顶有「!」的 NPC。</p>';
  act.forEach(({ q, p, ready, zones, rank }) => {
    const d = document.createElement('div'); d.className = 'qrow' + (rank === 0 ? ' qhere' : ''); d.dataset.qid = q.id;
    d.innerHTML = `<h4>${questHtml(q)}${ready ? ' <span style="color:var(--ink-ok,#1a7a00)">（可交付）</span>' : ''}</h4>${zoneTag(zones, rank)}<p style="color:var(--ink);margin-bottom:4px">${q.text}</p>
      ${q.objectives.map((o, i) => `<div class="${p[i] >= (o.type === 'kill' || o.type === 'collect' ? o.count : 1) ? 'ln' : ''}">· ${quests.objectiveText(o, p[i])}</div>`).join('')}
      <div style="color:var(--ink2);margin-top:4px">交付：${NPCS[q.turnIn].name} · 奖励 ${q.reward.xp} 经验 ${q.reward.gold} 金币${q.reward.item ? ` + ${QUALITY_NAME[q.reward.item.minQuality]}以上装备` : ''}</div>
      <button class="btn" data-tr="${q.id}">${trackedIds().includes(q.id) ? '取消追踪' : '追踪'}</button><button class="btn" data-fc="${q.id}" ${focusQuestId() === q.id ? 'disabled' : ''}>${focusQuestId() === q.id ? '◆ 焦点任务' : '设为焦点'}</button><button class="btn" data-ab="${q.id}">放弃</button>`;
    b.appendChild(d);
  });
  b.querySelectorAll('[data-ab]').forEach(x => (x as HTMLElement).onclick = () => { quests.abandon((x as HTMLElement).dataset.ab!); renderQuestLog(); save(); });
  b.querySelectorAll('[data-tr]').forEach(x => (x as HTMLElement).onclick = () => { toggleTrack((x as HTMLElement).dataset.tr!); renderQuestLog(); });
  b.querySelectorAll('[data-fc]').forEach(x => (x as HTMLElement).onclick = () => { setFocus((x as HTMLElement).dataset.fc!); renderQuestLog(); });
}
// ======================================================================
bindGuideUi(C);   // → guideui.ts

function openDialog(npc: string) {
  quests.onTalk(npc);
  tutEvent('talk', npc);
  const n = npcs.find(x => x.id === npc);
  if (n) { n.rig.root.rotation.y = Math.atan2(player.pos.x - n.rig.root.position.x, player.pos.z - n.rig.root.position.z); n.rig.anim?.play('interact'); }
  const info = NPCS[npc];
  $('dlg-name').textContent = `${info.name} · ${info.title}`;
  const b = $('dlg-body'); b.innerHTML = '';
  const list = quests.npcQuests(npc, progression.level);
  if (!list.length) {
    const locked = QUESTS.find(q => q.giver === npc && (!q.cls || q.cls === cls.id) && quests.state(q.id, progression.level) === 'locked');
    const idle: Record<string, string> = { bran: '灰石营地很安全，暂时没什么需要你做的。', tom: '矿洞……那里太可怕了。', ayla: '沼泽的风里全是腐烂的味道。准备好了就从北边的传送阵出发。', gerda: '需要药水还是想把装备再磨一磨？',
      rowan: '翠风前哨守着通往原野深处的路。有事就来找我。', qinghe: '原野上的药草长得正好，可惜劫掠者太多了。', ke: '白桦叶黄了，原野的秋天到了。' };
    const wn = WILD_IDS.flatMap(id => WILD[id].npcs).find(x => x.id === npc);
    if (wn) idle[npc] = wn.idle + (wn.role === 'exchange' ? '<br><span style="color:#8a6a4a">长副本的余烬、碎晶和徽记都能在我这里换装备：暗岩锻造（自选特殊属性）和套装缺件。</span>' : wn.role === 'mentor' ? '<br><span style="color:#8a6a4a">（精英等级「暗岩印记」：阶段六开放）</span>' : wn.role === 'scholar' ? '<br><span style="color:#8a6a4a">熔心王座与永霜墓穴都是 30 级单人长副本，各有 5 个首领。每周的畸变首领、机制挑战和暗金典藏都在我这里。</span>' : wn.role === 'bounty' ? '<br><span style="color:#8a6a4a">（25 级后，完成「烬落裂隙」即可接悬赏）</span>' : '');
    if (npc === 'kai') idle[npc] = '仓库在各个营地都是连通的，东西放我这儿就行。';
    b.innerHTML = `<p>${idle[npc] ?? '……'}${locked && progression.level < locked.minLevel ? `<br><span style="color:#8a6a4a">（${locked.minLevel} 级后再来）</span>` : ''}</p>`;
    if (npc === 'gerda') { const bt = document.createElement('button'); bt.className = 'btn'; bt.textContent = '打开商店'; bt.onclick = () => openShop(); b.appendChild(bt); }
    const role = npcs.find(x => x.id === npc)?.role;
    const roleBtn = (t: string, f: () => void) => { const bt = document.createElement('button'); bt.className = 'btn'; bt.textContent = t; bt.onclick = f; b.appendChild(bt); };
    if (role === 'supply') roleBtn('打开补给', () => { shopTab = 'buy'; openShop('supply'); renderShop(); });
    if (role === 'smith') roleBtn('修理 / 强化 / 分解', () => { shopTab = inventory.repairAllCost() > 0 ? 'repair' : 'upgrade'; openShop('smith'); renderShop(); });
    if (role === 'smith') roleBtn('觉醒 · 岩纹镌刻', () => { togglePanel('dialog', false); openAwaken(); });   // v0.7.4
    if (role === 'smith' || role === 'exchange') roleBtn('兑换', () => { openShop('smith'); openExchange(); });
    if (role === 'bank' || npc === 'kai') roleBtn('打开仓库', openBank);
    if (role === 'scholar') roleBtn('暗金典藏 · 每周情报', () => { togglePanel('dialog', false); openScholar(); });
  }
  // v1.2.40 内容包给的 NPC 按钮
  for (const pa of packNpcActs(npc)) { const bt = document.createElement('button'); bt.className = 'btn'; bt.textContent = pa.label; bt.onclick = () => { togglePanel('dialog', false); pa.run(); }; b.appendChild(bt); }
  list.forEach(({ q, s }) => {
    const d = document.createElement('div'); d.className = 'qrow';
    if (s === 'available') {
      d.innerHTML = `<h4>! ${questHtml(q)}</h4><p>${q.text}</p><div style="color:var(--ink2)">目标：${q.objectives.map(o => o.label).join('、')}<br>奖励：${q.reward.xp} 经验 · ${q.reward.gold} 金币${q.reward.item ? ` · ${QUALITY_NAME[q.reward.item.minQuality]}以上装备` : ''}</div><button class="btn">接受任务</button>`;
      d.querySelector('button')!.onclick = () => { quests.accept(q.id, progression.level); toast(`接受任务：${questText(q)}`, '#ffd100'); audio.questAccept(); quests.onTalk(npc); setFocus(q.id); save(); openDialog(npc); };
    } else if (s === 'ready') {
      d.innerHTML = `<h4>? ${questHtml(q)}</h4><p>${q.doneText}</p><button class="btn">完成任务</button>`;
      d.querySelector('button')!.onclick = () => { completeQuest(q); openDialog(npc); };
    } else {
      d.innerHTML = `<h4 style="color:var(--ink2)">${questHtml(q)}</h4><p style="color:var(--ink2)">还没完成呢。</p>`;
    }
    b.appendChild(d);
  });
  togglePanel('dialog', true);
  if (packs().length) runStoryHooks('talk', npc);   // v1.1.0 内容包：和 NPC 对话（没有包 = 不调用）
}
function completeQuest(q: QuestDef) {
  const r = quests.turnIn(q.id, progression.level);
  if (!r) return;
  toast(`完成任务：${questText(q)}`, isKeyQuest(q) ? KEY_QUEST_COLOR : '#3f3');
  audio.questDone();
  npcs.find(n => n.id === q.turnIn)?.rig.anim?.play('cheer');
  inventory.addGold(r.gold);
  repOnQuest(NPC_HOME[q.giver]?.map, !!q.repeatable);   // v0.9.3f 区域声望
  if (r.item) {
    const it = gen.generate(Math.max(5, progression.level + 3), gen.rollQuality(r.item.minQuality), r.item.slots);
    if (inventory.add(it)) toast(`获得 [${it.name}]`, itemColor(it));
  }
  r.stacks?.forEach(st => { inventory.addStack(st.id, st.count); toast(`获得 ${forge.stackDef(st.id)?.name ?? st.id} ×${st.count}`, '#e8c060'); });
  addXp(r.xp, packList<{ id?: string }>('quests').some(x => x?.id === q.id) || undefined);   // v1.2.38 内容包任务算包经验
  if (q.cls) { refreshTalentPoints(); toast('职业任务奖励：天赋点 +1（按 N）', '#7fd4ff'); }   // v0.7.10
  save();
}

// 状态留在 main（shopmap.ts 通过 C 读写）
let shopTab: ShopTab = 'buy';
let shopSel: string | null = null;           // 选中的装备 uid（强化/分解/出售）
bindShopMap(C);   // → shopmap.ts

// ======================================================================
// 状态留在 main（tutorial.ts 通过 C 读写）
let tutState = 0;           // 存档里的进度：0~8 = 进行到第几步，-1 = 完成/跳过
let holdBasic = false;
bindTutorial(C);   // → tutorial.ts

// ======================================================================
// 闪避翻滚（core/Dodge.ts）：电脑 Shift / 手机翻滚键；向移动方向（静止时朝面朝方向）翻滚约 5 米，
// 前 0.35 秒无敌（红圈、弹体、读条、负面状态都无效），冷却 6 秒（急速缩短），眩晕时不能滚，会取消自动寻路
// ======================================================================
const dodge = new DodgeRoll();
/** 当前移动输入（镜头相对 → 世界方向）；没有输入返回 null */
function inputDir(): Pos | null {
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mz += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (joy.id >= 0) { mx = joy.x; mz = joy.y; }
  if (Math.hypot(mx, mz) < 0.15) return null;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  return { x: mx * cos + mz * sin, z: -mx * sin + mz * cos };
}
function tryDodge(): boolean {
  if (!started || !player || !player.alive || anyPanelOpen() || dash) return false;
  if (channelActive()) { toast('剑刃风暴引导中，不能翻滚', '#dddddd'); return false; }   // v1.2.56
  const why = dodge.whyNot(player, T);
  if (why) {
    if (why === '翻滚冷却中') toast(`翻滚冷却中（${dodge.cooldownLeft(T).toFixed(1)} 秒）`, '#dddddd');
    else if (why !== '正在翻滚') { toast(why, '#ff9a40'); audio.error(); }
    return false;
  }
  const ry = player.rig.root.rotation.y;
  if (!dodge.start(player, T, inputDir(), { x: Math.sin(ry), z: Math.cos(ry) })) return false;
  if (autoPath.active) autoPath.stop('input');
  const d = dodge.roll!.dir;
  player.rig.root.rotation.y = Math.atan2(d.x, d.z);
  player.rig.anim?.play('dash', 1.5);
  audio.roll();
  particles.emit({ x: player.pos.x, y: 0.1, z: player.pos.z }, { count: 14, color: 0xb59a6a, color2: 0x8a7a66, speed: 2.5, up: 0.6, life: 0.5, size: 0.4, gravity: 3 });
  tutEvent('roll');
  return true;
}
/** 翻滚中：按 core 给出的位移移动 + 拖尾（无敌帧期间偏蓝白的残影粒子）；没有骨骼动画的模型就整个前倾 */
function updateRoll(dt: number) {
  const prev = { x: player.pos.x, z: player.pos.z };
  const m = dodge.step(dt);
  if (m) { player.pos.x += m.x; player.pos.z += m.z; clampToZone(player.pos, prev); }
  const inv = player.status.isInvulnerable;
  particles.emit({ x: player.pos.x, y: 0.15, z: player.pos.z }, { count: 2, color: 0xb59a6a, speed: 1, up: 0.5, life: 0.45, size: 0.35 });
  particles.emit({ x: player.pos.x, y: 1.0, z: player.pos.z }, { count: inv ? 3 : 1, color: inv ? 0xbfe6ff : 0xffffff, color2: 0x6fa0ff, speed: 0.25, up: 0.15, radius: 0.35, life: 0.32, size: 0.55 });
  if (!player.rig.anim) player.rig.body.rotation.x = dodge.rolling ? 0.6 : 0;
}
{ // 手机/鼠标：翻滚键（技能弧里，普攻键左上方）
  const el = $('sk-dodge');
  el.innerHTML = `<div class="ic"><svg class="dglyph" viewBox="0 0 48 48"><path d="M9 33c1-13 13-21 25-16" stroke="#fff6dc" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M30 9l10 9-12 4z" fill="#fff6dc"/><path d="M6 40h12M12 45h10" stroke="#ffd34d" stroke-width="3" stroke-linecap="round" opacity=".8"/></svg></div><div class="cd"></div><div class="cdt"></div><div class="key">${isTouch ? '' : 'Shift'}</div><div class="nm">翻滚</div>`;
  const down = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); tryDodge(); };
  el.addEventListener('touchstart', down, { passive: false }); el.addEventListener('mousedown', down);
  el.addEventListener('mouseenter', ev => showTip(`<b class="tt-name" style="color:#bfe6ff">闪避翻滚</b><span class="tt-sub">Shift · 冷却 ${dodge.cooldown.toFixed(1)} 秒</span>向移动方向翻滚约 5 米（静止时向前），前 0.35 秒<b>无敌</b>：红圈、弹体、Boss 读条和负面状态都打不中你。<br><span class="tt-sub">急速缩短翻滚冷却（冷却缩减不影响翻滚）；眩晕时不能翻滚</span>`, ev));
  el.addEventListener('mouseleave', hideTip);
}

// ======================================================================
// 输入
// ======================================================================
const keys = new Set<string>();
let camYaw = 0, camPitch = 0.55, camDist = 11;
// 11-17g 第一人称（Rhett：「角色可拉近到第一人称」，秋林 Demo 是第一人称慢走；?off=fpcam 回最近 5 米）：
//   滚轮 / 双指一直拉近到 1.5 米以内就切到眼睛高度（1.62 m），俯仰用同一个 camPitch（正 = 低头），隐藏自己的模型，近裁面 0.05；拉远回第三人称。
//   锁定视角（camLocked）、选角台、副本洞顶限高照旧走第三人称。
const CAM_DMIN = QL_DEMO.fp ? 0.6 : 5, FP_D = 1.5;
let fpOn = false;
// v0.9.1 视角锁定：手机默认锁定 40° 俯角 + 窄视角（2.5D），电脑默认自由视角；右上角按钮切换
const LOCK_PITCH = 0.70, LOCK_DIST = 17;
// v1.2.45 仰视：俯角低于 CAM_ORBIT_MIN 后镜头不再下沉，改为抬高注视点 → 可以抬头看钟楼 / 倒挂城
const CAM_MIN_PITCH = -0.55, CAM_ORBIT_MIN = 0.12;
function camLocked() { return settings.camLock ?? (isMobile || isTouch); }
function applyCamMode() {
  if (camLocked()) { camPitch = LOCK_PITCH; camDist = LOCK_DIST; } else { camPitch = 0.55; camDist = 11; }
  const b = document.getElementById('cam-lock'); if (b) { b.classList.toggle('on', camLocked()); b.title = camLocked() ? '视角已锁定（点击解锁）' : '自由视角（点击锁定 2.5D 视角）'; }
}
function toggleCamLock() { settings.camLock = !camLocked(); saveSettings(); applyCamMode(); }
document.getElementById('cam-lock')?.addEventListener('click', e => { e.stopPropagation(); toggleCamLock(); });
let camMin = 5;   // 调试/预览可以拉得更近
// 11-14 电影感：F6 循环切画质（超高 → 高 → 中 → 低），立即生效并存档
window.addEventListener('keydown', e => {
  if (e.key !== 'F6' || !G.DESKTOP) return; e.preventDefault();
  const order: G.Quality[] = ['ultra', 'high', 'medium', 'low']; settings.quality = order[(order.indexOf(settings.quality) + 1) % 4];
  saveSettings(); applySettings(); toast(`画质：${G.QUALITY_NAME[settings.quality]}（F6 切换）`, '#ffd890');
});
window.addEventListener('keydown', e => {
  if (!started) return;
  if (recKey(e, true)) { keys.clear(); holdBasic = false; return; }   // v1.2.38c 录制模式的键
  if (photoKey(e, true)) { keys.clear(); holdBasic = false; return; }   // v1.2.52 拍照模式里角色不动
  const k = e.key.toLowerCase();
  if (k === 'p' && !anyPanelOpen() && !rec.free) { keys.clear(); holdBasic = false; photoToggle(true, camYaw, camPitch, camDist); return; }
  keys.add(k);
  if (!anyPanelOpen() && classExtKey(k)) return;   // v1.0.6 内容包职业的专属键（本体职业没有运行时 = false）
  if (k === 't' && !anyPanelOpen()) extKeyUse();   // v1.1.1 扩展按键（第 7 键；没有包 / 未解锁 = 什么都不做）
  if (k === ' ' || k === 'j') { holdBasic = true; tryCast('basic'); e.preventDefault(); }
  if (k === '1') tryCast('skill1');
  if (k === '2') tryCast('skill2');
  if (k === '3') tryCast('skill3');
  if (k === '4') tryCast('skill4');   // v0.7.8：25 级第 4 技能槽
  if (k === 'r') tryCast('ultimate');
  if (k === 'b') togglePanel('bag');
  if (k === 'c') togglePanel('char');
  if (k === 'n') togglePanel('talent');
  if (k === 'u') togglePanel('awaken');   // v0.7.4：觉醒 · 岩纹（U）
  if (k === 'y') togglePanel('spirit');   // v0.7.6：英灵传承（Y）
  if (k === 'o') togglePanel('achv');   // v0.7.12：成就与图鉴（O）
  if (k === 'l') togglePanel('quests');
  if (k === 'm') { if (zone === 'raid' || zone === 'dungeon' || packDungeonHere()) toggleRaidMap(); else toggleWorldMap(); }   // v0.9.3i 营地副本区的副本也用副本地图
  if (k === 'q') usePotion();
  if (k === 'h') startRecall();
  if (k === 'f') { if (cls.id === 'alchemy') alchemySmoke(); else chronoRewind(); }   // F：时砂行者 回溯 / 炼金投弹手 推进烟雾
  if (k === 'g' && !anyPanelOpen()) slotKeyUse();   // v1.2.15 第 8 技能格（格子空 = 什么都不做；副本攻略改到副本 HUD「攻略」按钮 / 副本地图）
  if (k === 'shift') { tryDodge(); e.preventDefault(); }
  // Esc：有面板就全部关掉，没有面板就打开设置
  if (k === 'escape') { if (anyPanelOpen()) panels.forEach(p => togglePanel(p, false)); else togglePanel('settings', true); }
  if (k === 'e') { const it = currentInteractable(); if (it && !anyPanelOpen()) it.act(); }
  if (k === 'tab') { e.preventDefault(); cycleTarget(); }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (recKey(e, false) || photoKey(e, false)) return; if (k === ' ' || k === 'j') holdBasic = false; });
$('interact').addEventListener('click', () => currentInteractable()?.act());

function cycleTarget() {
  const list = liveEnemies().filter(e => dist2d(e.pos, player.pos) < 20).sort((a, b) => dist2d(a.pos, player.pos) - dist2d(b.pos, player.pos));
  if (!list.length) return;
  const i = target ? list.indexOf(target) : -1;
  target = list[(i + 1) % list.length];
}

const raycaster = new THREE.Raycaster();
function enemyAt(x: number, y: number): Enemy | null {
  raycaster.setFromCamera(new THREE.Vector2(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1), camera);
  let best: Enemy | null = null, bd = Infinity;
  for (const e of liveEnemies()) {
    const c = e.pos.clone().setY(e.pos.y + e.rig.scale);
    const d = raycaster.ray.distanceToPoint(c);
    if (d < 1.2 * e.rig.scale && d < bd) { bd = d; best = e; }
  }
  return best;
}
function pickEnemy(x: number, y: number) { const best = enemyAt(x, y); if (best) target = best; }

// v1.2.68 怪物悬停提示：名字 / 血量 + 关联的进行中任务（任务名与进度 3/10）
const mobTip = document.createElement('div'); mobTip.id = 'mob-tip'; document.body.appendChild(mobTip);
let mobTipAt = 0, mobTipE: Enemy | null = null;
function mobTipKinds(e: Enemy) { const k = [e.kind, 'raidboss_' + e.kind]; if (e.kind === 'goldboar') k.push('boar'); if (e.kind === 'boss_grok') k.push('boss'); return k; }
function mobTipHtml(e: Enemy) {
  const t = e.type, col = e.isBoss || t.elite ? '#ff9a30' : t.rare ? '#d0a0ff' : t.mini ? '#ffb060' : '#ff7a6a';
  const tag = e.isBoss ? '首领' : t.elite ? '精英' : t.rare ? '稀有' : t.mini ? '小精英' : '';
  const qs = questProgressFor(quests.active(), mobTipKinds(e), (o, v) => quests.objectiveText(o, v));
  return `<div class="mt-n" style="color:${col}">${tag ? `<em>${tag}</em>` : ''}${t.name}</div><div class="mt-hp"><i style="width:${Math.round(e.hp / e.maxHp * 100)}%"></i></div>`
    + qs.map(x => `<div class="mt-q${x.done ? ' done' : ''}"><b>◆ ${x.quest}</b><span>${x.done ? '✔ ' : ''}${x.text}</span></div>`).join('');
}
function mobTipHide() { if (mobTipE) { mobTipE = null; mobTip.style.display = 'none'; } }
function mobTipShow(e: Enemy, x: number, y: number) {
  const html = mobTipHtml(e);
  if (mobTip.dataset.h !== html) { mobTip.dataset.h = html; mobTip.innerHTML = html; }
  mobTip.style.display = 'block'; mobTipE = e;
  const w = mobTip.offsetWidth, h = mobTip.offsetHeight;
  mobTip.style.left = `${Math.min(x + 18, window.innerWidth - w - 6)}px`; mobTip.style.top = `${Math.min(y + 20, window.innerHeight - h - 6)}px`;
}
canvas.addEventListener('mousemove', e => {
  if (mouseDown || !started || document.documentElement.classList.contains('phone')) { mobTipHide(); return; }
  const now = performance.now(); if (now - mobTipAt < 60) { if (mobTipE) mobTipShow(mobTipE, e.clientX, e.clientY); return; }
  mobTipAt = now;
  const en = enemyAt(e.clientX, e.clientY);
  if (en) mobTipShow(en, e.clientX, e.clientY); else mobTipHide();
  setCursor(cursorAt(en));   // v1.2.69 专属指针
});
/** v1.2.69 画布上的指针状态：施法引导 > 敌人 > NPC（功能 NPC = 商店）> 掉落 > 可交互物 */
const SHOP_ROLES = new Set(['smith', 'supply', 'bank', 'exchange']);
function cursorAt(en: Enemy | null): CursorKind {
  if (channelActive()) return 'aim';
  if (en) return 'attack';
  const ray = raycaster.ray, P = new THREE.Vector3();
  for (const n of npcs) {
    if (n.z !== zone || !n.rig.root.visible) continue;
    P.copy(n.rig.root.position); P.y += 1.1;
    if (ray.distanceToPoint(P) < 0.95 && P.distanceTo(camera.position) < 60) return SHOP_ROLES.has(n.role ?? '') || n.id === 'gerda' || n.id === 'kai' ? 'shop' : 'talk';
  }
  for (const L of loots) { if (!L.obj.visible) continue; P.copy(L.obj.position); P.y += 0.3; if (ray.distanceToPoint(P) < 0.8) return 'loot'; }
  const it = currentInteractable();
  if (it?.pos) { P.copy(it.pos as THREE.Vector3); P.y += 0.6; if (ray.distanceToPoint(P) < 1.6) return /铸造|商店|兑换|修理/.test(it.label) ? 'shop' : /拾取/.test(it.label) ? 'loot' : 'interact'; }
  return 'default';
}
canvas.addEventListener('mouseleave', () => { mobTipHide(); setCursor('default'); });
canvas.addEventListener('mousedown', mobTipHide);
/** 测试用：悬停在某个怪上时的提示 HTML */
function mobTipDebug(kind: string) { const e = enemies.find(x => x.alive && x.kind === kind); return e ? mobTipHtml(e) : null; }

// 鼠标：拖动转视角，单击选目标
let mouseDown = false, mouseMoved = 0, lastMX = 0, lastMY = 0;
canvas.addEventListener('mousedown', e => { mouseDown = true; mouseMoved = 0; lastMX = e.clientX; lastMY = e.clientY; });
window.addEventListener('mousemove', e => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY;
  mouseMoved += Math.abs(dx) + Math.abs(dy);
  if (camLocked()) return;
  camYaw -= dx * 0.006 * settings.camSens; camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004 * settings.camSens, CAM_MIN_PITCH, 1.25);
});
window.addEventListener('mouseup', e => { if (mouseDown && mouseMoved < 6 && e.target === canvas) pickEnemy(e.clientX, e.clientY); mouseDown = false; });
canvas.addEventListener('wheel', e => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, CAM_DMIN, 20); e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// 触屏：左半屏浮动摇杆
const joy = { id: -1, cx: 0, cy: 0, x: 0, y: 0 };
const joyBase = $('joy-base'), joyKnob = $('joy-knob');
$('joy').addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0]; if (joy.id >= 0) return;
  // 摇杆大小（设置）：底座按 --joy 缩放，半径同步
  const half = 65 * settings.joySize;
  joy.id = t.identifier; joy.cx = Math.max(half, Math.min(window.innerWidth - half, t.clientX)); joy.cy = Math.max(half, Math.min(window.innerHeight - half, t.clientY)); joy.x = joy.y = 0;
  // 动态原点：摇杆移到手指按下的位置（不贴出屏幕边）
  const ox = Math.max(half, Math.min(window.innerWidth - half, t.clientX)), oy = Math.max(half, Math.min(window.innerHeight - half, t.clientY));
  joyBase.classList.add('on'); joyBase.style.display = 'block'; joyBase.style.left = `${ox - 65}px`; joyBase.style.top = `${oy - 65}px`;
  joyKnob.style.transform = '';
}, { passive: false });
$('joy').addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of Array.from(e.changedTouches)) if (t.identifier === joy.id) {
    let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy; const l = Math.hypot(dx, dy), R = 55 * settings.joySize;
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    joy.x = dx / R; joy.y = dy / R;
    joyKnob.style.transform = `translate(${dx / settings.joySize}px,${dy / settings.joySize}px)`;   // 底座整体缩放了，位移要除回去
  }
}, { passive: false });
const joyEnd = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === joy.id) { joy.id = -1; joy.x = joy.y = 0; joyIdle(); } };
/** 松手：触屏上摇杆回到左下角半透明待命（电脑上隐藏） */
function joyIdle() { joyBase.classList.remove('on'); joyBase.style.left = joyBase.style.top = ''; joyBase.style.display = isTouch ? '' : 'none'; joyKnob.style.transform = ''; }
joyIdle();
$('joy').addEventListener('touchend', joyEnd); $('joy').addEventListener('touchcancel', joyEnd);

// 触屏：右半屏（画布）单指转视角、双指缩放、轻点选目标
const camTouches = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
let pinch0 = 0, dist0 = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of Array.from(e.changedTouches)) camTouches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() });
  if (camTouches.size === 2) { const [a, b] = [...camTouches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = camDist; }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of Array.from(e.changedTouches)) {
    const c = camTouches.get(t.identifier); if (!c) continue;
    if (camTouches.size === 1 && !camLocked()) { camYaw -= (t.clientX - c.x) * 0.008 * settings.camSens; camPitch = THREE.MathUtils.clamp(camPitch + (t.clientY - c.y) * 0.005 * settings.camSens, CAM_MIN_PITCH, 1.25); }
    c.x = t.clientX; c.y = t.clientY;
  }
  if (camTouches.size === 2) { const [a, b] = [...camTouches.values()]; camDist = THREE.MathUtils.clamp(dist0 * pinch0 / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), CAM_DMIN, 20); }
}, { passive: false });
canvas.addEventListener('touchend', e => {
  for (const t of Array.from(e.changedTouches)) {
    const c = camTouches.get(t.identifier);
    if (c && camTouches.size === 1 && Math.hypot(t.clientX - c.sx, t.clientY - c.sy) < 10 && performance.now() - c.t < 300) pickEnemy(t.clientX, t.clientY);
    camTouches.delete(t.identifier);
  }
});

// ======================================================================
// 主循环
// ======================================================================
function faceTo(p: THREE.Vector3) { player.rig.root.rotation.y = Math.atan2(p.x - player.pos.x, p.z - player.pos.z); }

function animateRig(r: M.Rig, moving: boolean, speed: number, phase: number) {
  const a = moving ? Math.sin(phase * speed * 2.2) * 0.6 : 0;
  r.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? a : -a); });
  r.body.position.y = moving ? Math.abs(Math.sin(phase * speed * 2.2)) * 0.06 : 0;
}

let stepTimer = 0;
function updatePlayer(dt: number) {
  player.rig.anim?.update(dt);
  if (!player.alive) { if (!player.rig.anim) player.rig.root.rotation.z = Math.min(Math.PI / 2, player.rig.root.rotation.z + dt * 4); return; }
  player.rig.root.rotation.z = 0;
  if (dodge.rolling) { updateRoll(dt); return; }
  if (!player.rig.anim && player.rig.body.rotation.x) player.rig.body.rotation.x = 0;
  if (dash) {
    dash.t += dt;
    const k = Math.min(1, dash.t / dash.dur);
    player.pos.lerpVectors(dash.from, dash.to, k);
    if (dash.skill.tags.includes('leap')) player.pos.y += Math.sin(k * Math.PI) * 2.6;   // 英勇跳跃：抛物线
    if (!classExtDashTrail(dash.skill, player.pos)) {   // v1.0.8 职业专属冲锋拖尾
    VFX.dashTrail(player.pos, ELEMENT_COLOR[dash.skill.element], dash.skill.tags.includes('leap'));   // v0.9.1h
    particles.emit({ x: player.pos.x, y: 1, z: player.pos.z }, { count: 4, color: new THREE.Color(ELEMENT_COLOR[dash.skill.element]).getHex(), color2: 0xffffff, speed: 0.5, up: 0.3, life: 0.35, size: 0.4 });
    }
    if (k >= 1 && classExtFx('dashHit', dash.skill, player.getPos(), { x: dash.to.x - dash.from.x, z: dash.to.z - dash.from.z })) {   // v1.0.8
      applyHits(dash.skill, [dash.tgt]);
      const snd = classExtSfx('dashHit', dash.skill);   // v1.0.9
      if (dash.skill.tags.includes('leap')) { if (!snd) audio.thunder(); feel.emit('heavy', 0.9); }
      player.rig.anim?.play('attack1', 1.6);
      feel.emit('heavy', 0.6);
      dash = null;
    } else if (k >= 1) {
      applyHits(dash.skill, [dash.tgt]);
      VFX.chargeImpact(player.getPos(), ELEMENT_COLOR[dash.skill.element], dash.skill.tags.includes('leap'));   // v0.9.1h
      spawnRing(dash.tgt.getPos(), 1.8, ELEMENT_COLOR[dash.skill.element], 0.3);
      if (dash.skill.tags.includes('leap')) {   // v0.6.8 英勇跳跃：落地震击
        const p = player.getPos();
        spawnRing(p, 3.5, ELEMENT_COLOR[dash.skill.element], 0.5); spawnRing(p, 2, '#ffffff', 0.35);
        particles.emit({ x: p.x, y: 0.1, z: p.z }, { count: 60, color: 0x8a7a66, color2: 0xffd080, speed: 6, up: 2, radius: 0.8, life: 0.7, size: 0.45, gravity: 8 });
        audio.thunder(); feel.emit('heavy', 0.9);
      }
      player.rig.anim?.play('attack1', 1.6);
      feel.emit('heavy', 0.6);
      dash = null;
    }
    return;
  }
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mz += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (joy.id >= 0) { mx = joy.x; mz = joy.y; }
  const len = Math.hypot(mx, mz);
  const manual = len > 0.15;
  const prev = { x: player.pos.x, z: player.pos.z };
  // 自动寻路：沿路线跑；手动操作 / 受伤 / 进入战斗 / 到达 时停止（规则在 core/AutoPath.ts）
  let auto: Pos2 | null = null;
  if (autoPath.active && !player.status.isStunned && !anyPanelOpen()) auto = autoPath.step(player.pos, T, { manual, lastHurt: player.lastHurt, inCombat: inCombatNow() });
  const moving = (manual || !!auto) && !player.status.isStunned && !anyPanelOpen();
  if (moving) {
    const s = auto ? 1 : Math.min(1, len);
    const fx_ = mx / (len || 1), fz = mz / (len || 1);
    // 镜头相对：前 = 镜头朝向
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const dx = auto ? auto.x : fx_ * cos + fz * sin, dz = auto ? auto.z : -fx_ * sin + fz * cos;
    const sp = 6.5 * player.status.speedMultiplier * moveMul * lgMoveMul() * packMoveMul() * sprintMul() * s;   // v0.9.3e 疾行
    player.pos.x += dx * sp * dt; player.pos.z += dz * sp * dt;
    // 平滑转身
    const want = Math.atan2(dx, dz); let d = want - player.rig.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    player.rig.root.rotation.y += d * Math.min(1, dt * 14);
    stepTimer -= dt;
    if (stepTimer <= 0) {
      stepTimer = 0.32 / Math.max(0.5, player.status.speedMultiplier);
      audio.footstep();
      if (zone !== 'dungeon' && settings.quality !== 'low' && !(isMobile && settings.quality !== 'high' && settings.quality !== 'ultra')) particles.emit({ x: player.pos.x, y: 0.05, z: player.pos.z }, { count: 2, color: 0xb59a6a, speed: 0.6, up: 0.4, life: 0.5, size: 0.3 });
    }
  } else if (target && target.alive && dist2d(target.pos, player.pos) < 6) faceTo(target.pos);
  clampToZone(player.pos, prev);
  if (player.rig.anim) player.rig.anim.loop(moving ? 'run' : 'idle', moving ? player.status.speedMultiplier : 1);
  else {
    animateRig(player.rig, moving, 3.2, T);
    if (swing > 0) { swing -= dt; if (player.rig.weapon) player.rig.weapon.rotation.x = Math.PI / 2.4 - Math.sin((1 - swing / 0.3) * Math.PI) * 1.6; }
    else if (player.rig.weapon) player.rig.weapon.rotation.x = Math.PI / 2.4;
    if (spin > 0) { spin -= dt; player.rig.body.rotation.y += dt * 30; } else player.rig.body.rotation.y = 0;
  }
  // 按住普攻自动连击
  if (holdBasic) tryCast('basic');
  // 脱战回血
  const inCombat = enemies.some(e => e.alive && e.z === zone && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack'));
  if (!inCombat && T - player.lastHurt > 4 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + Math.ceil(player.maxHp * 0.06 * dt));
  // 自动选最近目标
  if ((!target || !target.alive || target.z !== zone || dist2d(target.pos, player.pos) > 25)) target = nearestEnemy(15);
}

/** v0.9.1i：敌人外观——toon 零件套精修材质、补贴地阴影、精英橙金 / 稀有紫的边缘光与脚下符文盘 */
function dressEnemy(r: M.Rig, type: EnemyType, isBoss: boolean) {
  G.refineRig(r.root);
  if (!r.root.getObjectByName('blob')) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: G.blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
    b.material.userData.outlineParameters = { visible: false };
    b.rotation.x = -Math.PI / 2; b.position.y = 0.025; b.scale.setScalar(1.6); b.renderOrder = 1; b.name = 'blob';
    r.root.add(M.noOutline(b));
  }
  const tier = isBoss ? 'boss' : type.elite ? 'elite' : type.rare ? 'rare' : '';
  if (!tier) return;
  const col = tier === 'rare' ? 0xc080ff : 0xff9a2a;
  G.setRimColor(r.root, col, tier === 'boss' ? 0.35 : 0.55);
  r.root.userData.dieCol = tier === 'rare' ? 0xc080ff : 0xffb040;
  if (tier !== 'boss') {   // 首领由 bossfx 负责，避免叠两层
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), G.runePlateMaterial(col)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.04; pl.name = 'eliteAura';
    r.root.add(M.noOutline(pl));
  }
}
function setOpacity(r: M.Rig, k: number) { G.setDissolve(r.root, 1 - k, r.root.userData.dieCol ?? 0xb070ff); }

function updateEnemies(dt: number) {
  if (activeZone !== zone || (activeTick += dt) > 0.25) refreshActive();   // 每 0.25 秒重选一次激活集
  let shown = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const on = e.z === zone && (e.alive || T - e.deadAt < 3.5) && isActive(e);
    e.rig.root.visible = on;
    // v0.9.3c：不显示的怪整只摘出场景（描边 / 渲染每帧遍历整棵场景树，摘掉后 108 只怪的大图不再拖慢）
    if (on) { if (!e.rig.root.parent) scene.add(e.rig.root); } else if (e.rig.root.parent === scene) scene.remove(e.rig.root);
    if (e.z !== zone || !isActive(e)) {   // 别的地图 / 远处区块：不跑 AI、不显示，只走刷新计时
      if (!e.alive && respawnDue(e)) respawnEnemy(e);
      continue;
    }
    if (e.rig.root.visible) shown++;
    const pa = e.rig.anim as unknown as { windup?: number; play: (n: string) => void } | undefined;
    if (pa?.windup) (e.brain as { windup?: number }).windup = pa.windup;   // v1.2.73 程序化绑骨的怪：攻击前先后摆（扣血时刻 = 出手帧）
    const it = e.brain.update(dt, player.alive && T >= e.evadeUntil ? player : null);
    e.intent = it;
    if (it.windup) pa?.play('windup');
    e.rig.anim?.update(dt);
    if (!e.alive) {
      const t = T - e.deadAt;
      if (!e.rig.anim) e.rig.root.rotation.z = Math.min(Math.PI / 2, t * 4);
      // 溶解消失：变透明 + 下沉 + 冒出灵魂粒子
      if (t > 1.2) {
        const k = Math.max(0, 1 - (t - 1.2) / 1.6);
        setOpacity(e.rig, k);
        e.rig.root.position.y = (activeSet ? groundAt(e.pos.x, e.pos.z) : 0) - (1 - k) * 0.15;
        if (Math.random() < 0.5) particles.emit({ x: e.pos.x, y: 0.4, z: e.pos.z }, { count: 2, color: 0xb070ff, color2: 0xffffff, speed: 0.4, up: 1.8, radius: 0.6 * e.rig.scale, life: 0.9, size: 0.3, drag: 0.5 });
      }
      if (t > 3.5) {
        if (e.respawn) { if (respawnDue(e)) respawnEnemy(e); }
        else { e.dispose(); enemies.splice(i, 1); }
      }
      continue;
    }
    if (e.stagger > 0) e.stagger -= dt;
    const moving = !!it.moveDir && it.speed > 0 && e.stagger <= 0;   // 受击硬直：停一下
    if (moving) {
      const pv = { x: e.pos.x, z: e.pos.z };
      e.pos.x += it.moveDir!.x * it.speed * dt; e.pos.z += it.moveDir!.z * it.speed * dt;
      const onv = outdoorNav();
      if (onv) {
        onv.resolveMove(pv, e.pos, Math.min(0.6, 0.4 * e.rig.scale));
        // 被河/栅栏/树挡住追不过来：脱战回家（像魔兽的“闪避”），回家也被挡住就直接回到出生点
        const prog = Math.hypot(e.pos.x - pv.x, e.pos.z - pv.z) / Math.max(1e-3, it.speed * dt);
        e.stuckT = prog < 0.3 ? e.stuckT + dt : Math.max(0, e.stuckT - dt);
        if (e.stuckT > 2.5 && dist2d(e.pos, player.pos) < e.type.range + 1.2) e.stuckT = 0;   // 已经贴着玩家（大体型精英卡在树边）：不算追不到
        if (e.stuckT > 2.5) {
          e.stuckT = 0;
          if (it.state === 'leash') { e.pos.copy(e.spawn); e.hp = e.maxHp; e.status.clear(); }
          else e.evadeUntil = T + 6;
        }
      }
    }
    if (activeSet || (zone === 'world' && !ENEMY_SNAP_OFF)) e.pos.y = groundAt(e.pos.x, e.pos.z);   // v0.9.3a 贴地（山丘 / 坡道 / 台地）；11-18 Rhett「灰石营地附近狼被技能打上天」：营地也每帧贴地（?off=enemysnap）
    // 游荡精英：在当前路点附近闲下来就换下一个路点（新的“家”），沿路线慢慢走
    if (e.route && (it.state === 'idle' || it.state === 'patrol') && dist2d(e.pos, e.route[e.routeI]) < 3.5) {
      e.routeI = (e.routeI + 1) % e.route.length;
      const wp = e.route[e.routeI];
      e.brain = new Brain(e, { x: wp.x, z: wp.z }, { ...enemyConfig(e.type), patrolRadius: 1.5 }, (tg, d) => enemyStrike(e, tg, d));
    }
    if (it.faceTo) {
      const want = Math.atan2(it.faceTo.x - e.pos.x, it.faceTo.z - e.pos.z);
      let d = want - e.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      e.yaw += THREE.MathUtils.clamp(d, -8 * dt, 8 * dt);
    }
    e.rig.root.rotation.y = e.yaw;
    e.anim += dt;
    if (e.rig.anim) e.rig.anim.loop(moving ? (it.speed > 2.5 ? 'run' : 'walk') : 'idle', moving ? Math.max(0.6, it.speed / 4.5) : 1);
    else if (e.kind === 'golem') {
      animateRig(e.rig, moving, 2.2, e.anim);
      if (e.attackAnim > 0) { e.attackAnim -= dt; e.rig.body.rotation.x = Math.sin((1 - e.attackAnim / 0.35) * Math.PI) * 0.35; } else e.rig.body.rotation.x = 0;
    } else if (e.kind === 'vine') {
      // 藤蔓：原地摇摆，攻击时向前甩
      e.rig.body.rotation.z = Math.sin(e.anim * 2.2) * 0.12;
      e.rig.body.rotation.x = e.attackAnim > 0 ? Math.sin((1 - e.attackAnim / 0.35) * Math.PI) * 0.5 : Math.sin(e.anim * 1.7) * 0.08;
      if (e.attackAnim > 0) e.attackAnim -= dt;
    } else {
      if (e.rig.tick) e.rig.tick(dt, moving); else animateRig(e.rig, moving, e.kind === 'spider' ? 6 : e.kind === 'toad' || e.kind === 'boar' || e.kind === 'goldboar' ? 4.5 : 3, e.anim);
      if (e.attackAnim > 0) { e.attackAnim -= dt; e.rig.body.rotation.x = Math.sin((1 - e.attackAnim / 0.4) * Math.PI) * 0.5; } else e.rig.body.rotation.x = 0;
    }
    // 受击后仰（硬直期间身体往后仰一下）
    const rx0 = e.rig.anim ? (e.rig.body.userData.rx0 ??= e.rig.body.rotation.x) as number : 0;
    if (e.stagger > 0) e.rig.body.rotation.x = rx0 - Math.sin(Math.min(1, e.stagger / 0.22) * Math.PI) * 0.22;
    else if (e.rig.anim) e.rig.body.rotation.x = rx0;
    if (e.kind === 'wolf' && it.state === 'chase' && Math.random() < 0.002) audio.wolfHowl();
    if (e.status.isStunned && Math.random() < 0.2) particles.emit({ x: e.pos.x, y: 2.3 * e.rig.scale, z: e.pos.z }, { count: 1, color: 0xffe14d, speed: 1.2, up: 0.1, life: 0.4, size: 0.2 });
    if (e.status.has('slow') && Math.random() < 0.15) particles.emit({ x: e.pos.x, y: 0.3, z: e.pos.z }, { count: 1, color: 0x9fe8ff, speed: 0.3, up: 0.6, radius: 0.5, life: 0.6, size: 0.2 });
    if (e.status.has('dot') && Math.random() < 0.3) particles.emit({ x: e.pos.x, y: 1, z: e.pos.z }, { count: 1, color: 0xff4a10, color2: 0xffc040, speed: 0.3, up: 1.5, radius: 0.4, life: 0.6, size: 0.3 });
  }
  perfStat.shown = shown;
  // 互相推开，避免叠在一起
  const live = liveEnemies();
  for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
    const A = live[a].pos, B = live[b].pos, d = dist2d(A, B), min = 0.6 * (live[a].rig.scale + live[b].rig.scale);
    if (d > 0.001 && d < min) { const k = (min - d) / d * 0.5; const dx = (B.x - A.x) * k, dz = (B.z - A.z) * k; A.x -= dx; A.z -= dz; B.x += dx; B.z += dz; }
  }
}

/** v0.9.3c 刷新条件：死亡超过 respawn 秒；普通野外群还要玩家离出生点 30 米外（不在眼前凭空出现） */
function respawnDue(e: Enemy) {
  if (!e.respawn || T - e.deadAt <= e.respawn) return false;
  if (!e.awayRespawn || e.z !== zone) return true;
  if (T - e.deadAt > e.respawn * RESPAWN.awayCap) return true;   // 守在旁边太久也照刷，免得任务点刷不出怪
  return Math.hypot(player.pos.x - e.spawn.x, player.pos.z - e.spawn.z) > RESPAWN.away;
}
function respawnEnemy(e: Enemy) {
  if (e.rareRoll) e.respawn = Math.round(e.rareRoll[0] + Math.random() * (e.rareRoll[1] - e.rareRoll[0]));
  if (e.spots) {        // 稀有怪：换一个出现点
    e.spawn.copy(e.spots[Math.floor(Math.random() * e.spots.length)]);
    if (zone === e.z) toast(`稀有首领「${e.type.name.split(' ')[0]}」出现在${MAPS[currentMap()]?.name ?? '这片土地'}上！`, '#d0a0ff');
  }
  if (e.route) { e.routeI = 0; e.spawn.copy(e.route[0]); }
  e.hp = e.maxHp; e.status.clear(); e.deadAt = -1;
  e.pos.copy(e.spawn); e.rig.root.rotation.z = 0; e.rig.root.position.y = groundAt(e.pos.x, e.pos.z); e.rig.root.visible = true;
  setOpacity(e.rig, 1);
  e.rig.anim?.revive();
  e.brain = e.rebrain ? e.rebrain() : new EnemyBrain(e, e.getPos(), enemyConfig(e.type), (tg, d) => enemyStrike(e, tg, d));
}

function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const to = p.tgt.pos.clone().setY(p.tgt.pos.y + 1);
    const d = p.mesh.position.distanceTo(to);
    if (!p.spell && !p.noSpin) p.mesh.rotation.z -= dt * 25;
    const col = new THREE.Color(ELEMENT_COLOR[p.skill.element]).getHex();
    const mfx = p.spell && mageProjTick(p.mesh, p.skill, dt, to);   // 11-17 法师专属弹体：朝向 + 拖尾自己画
    if (p.spell && !mfx) VFX.projTrail(p.mesh.position, p.skill.element, p.skill.slot !== 'basic');   // v0.9.1h 元素拖尾
    if (!mfx && !classExtTrail(p.skill, p.mesh.position)) particles.emit(p.mesh.position, { count: p.spell ? 3 : 2, color: col, color2: 0xffffff, speed: 0.3, up: 0.2, life: p.spell ? 0.45 : 0.3, size: p.spell ? 0.4 : 0.3 });
    if (d < 0.6 || !p.tgt.alive) {
      if (p.tgt.alive && mageProjHit(p.mesh, p.skill, p.tgt, () => applyHits(p.skill, [p.tgt]))) { /* 11-17 法师专属命中（结算在 apply 里，时机同原） */ }
      else if (p.tgt.alive) {
        if (p.skill.element === 'nature') spawnLightning(p.mesh.position.clone().setY(p.tgt.pos.y + 6), p.tgt.pos.clone().setY(p.tgt.pos.y + 1));
        applyHits(p.skill, [p.tgt]); spawnRing(p.tgt.getPos(), 1.2, ELEMENT_COLOR[p.skill.element], 0.25);
        if (p.skill.tags.includes('arrow')) audio.hitSample('h_arrow_hit');   // 11-17 箭矢命中样本（I07，DLC 包注册；无样本则静默）
      }
      scene.remove(p.mesh); projectiles.splice(i, 1); continue;
    }
    p.mesh.position.addScaledVector(to.sub(p.mesh.position).normalize(), Math.min(d, p.speed * dt));
    if (!p.spell) p.mesh.lookAt(p.tgt.pos.x, 1, p.tgt.pos.z);
  }
}

function updateTelegraphs(dt: number) {
  telegraphs.forEach(t => { t.left -= dt; t.mat.uniforms.progress.value = Math.min(1, 1 - t.left / t.total); t.mat.uniforms.time.value = T; });
}

/** 场景动画：火焰、火把闪烁、晶石呼吸、旗帜飘动、传送门 */
function updateAmbient(dt: number, nowMs: number) {
  if (FIRE_FLICK_OFF) {
  for (const f of animated.flames) f.scale.set(1 + Math.sin(nowMs / 90 + f.id) * 0.1, 1 + Math.sin(nowMs / 70 + f.id) * 0.18, 1 + Math.sin(nowMs / 110 + f.id) * 0.1);
  for (const l of animated.lights) { const base = l.userData.base ?? (l.userData.base = l.intensity); l.intensity = base * (0.85 + Math.sin(nowMs / 60 + l.id) * 0.08 + Math.random() * 0.1); }
  } else {   // 11-18 专长包 v8 第 120 步：火苗与灯同一平滑噪声（fire_flicker.ts；?off=fireflick 回上面原样）
    const ts = nowMs / 1000;
    for (const f of animated.flames) { const n = fireNoise(fireSeed(f), ts) - 0.5, w = fireNoise(fireSeed(f) + 0.5, ts * 0.8) - 0.5; f.scale.set(1 + w * 0.2, 1 + n * 0.36, 1 - w * 0.2); }
    for (const l of animated.lights) { const base = l.userData.base ?? (l.userData.base = l.intensity); l.intensity = base * (0.75 + fireNoise(fireSeed(l), ts) * 0.3); }
  }
  for (const p of campDgPools) if (p.group.parent?.visible) p.update(camera, dt);   // opt1118A 营地副本灯池：每帧挑灯 + 淡入淡出（?off=raidlpool_camp）
  for (const c of animated.crystals) { c.position.y = Math.sin(nowMs / 600 + c.id) * 0.08; c.rotation.y += dt * 0.3; }
  for (const c of animated.cloths) c.rotation.y = Math.sin(nowMs / 400 + c.id) * 0.25;
  [scene.getObjectByName('worldPortal'), scene.getObjectByName('fieldGate'), fieldAnim.returnPortal, exitPortal, bossPortal, swampExit, swampBossPortal].forEach(p => {
    const inner = p?.getObjectByName('inner'); if (inner && !inner.userData.noSpin) inner.rotation.z += dt;
  });
  updateEnvFx(dt, nowMs);
  if (zone === 'field') for (const sp of fieldAnim.spin) if (sp.o.parent?.parent?.visible !== false) sp.o.rotation[sp.axis] += dt * sp.speed;   // v0.9.3b 风车叶 / 水车轮
  if (zone === 'field' && fieldAnim.altar) {
    const st = fieldAnim.altar.getObjectByName('star'), co = fieldAnim.altar.getObjectByName('core');
    if (st) st.rotation.z += dt * 0.4;
    if (co) { co.rotation.y += dt; co.position.y = 1.9 + Math.sin(nowMs / 500) * 0.15; }
    if (Math.random() < 0.3) particles.emit({ x: fieldAnim.altar.position.x, y: 1, z: fieldAnim.altar.position.z }, { count: 1, color: 0x9ad0ff, color2: 0xffffff, speed: 0.2, up: 1.2, radius: 1.5, life: 1.6, size: 0.2, drag: 0.3 });
    if (Math.random() < 0.15) particles.emit({ x: player.pos.x + (Math.random() - 0.5) * 30, y: 3 + Math.random() * 4, z: player.pos.z + (Math.random() - 0.5) * 30 }, { count: 1, color: 0xf0a030, color2: 0xd06020, speed: 0.4, up: -0.6, life: 4, size: 0.22, drag: 0.2 });   // 飘落的秋叶
  }
  if (zone === 'world' && Math.random() < 0.5) particles.emit({ x: 0, y: 0.6, z: 4 }, { count: 1, color: 0xff6a10, color2: 0xffd060, speed: 0.4, up: 2.4, radius: 0.3, life: 1.4, size: 0.18, drag: 0.3 });   // 篝火火星
  updateWater(dt); cineWaterTick(dt);
  if (zone === 'dungeon' && layout.id === 'rotting_temple') {
    for (const f of swampAnim.fog) { f.userData.drift += dt * 0.15; f.position.x += Math.sin(f.userData.drift) * dt * 0.4; (f as THREE.Mesh).rotation.z += dt * 0.03; }
    for (const pl of swampAnim.pools) (pl as THREE.Mesh).scale.setScalar(1 + Math.sin(nowMs / 400) * 0.04);
    if (Math.random() < 0.5) particles.emit({ x: player.pos.x + (Math.random() - 0.5) * 24, y: 0.3 + Math.random() * 2, z: player.pos.z + (Math.random() - 0.5) * 24 }, { count: 1, color: 0x9aff40, color2: 0x40ffd0, speed: 0.15, up: 0.25, life: 3, size: 0.16, drag: 0.1 });   // 孢子
    for (const z of poisonZones.values()) if (Math.random() < 0.5) particles.emit({ x: z.p.x, y: 0.1, z: z.p.z }, { count: 1, color: 0x7aff3a, color2: 0x30a010, speed: 0.3, up: 1.4, radius: z.r * 0.9, life: 0.9, size: 0.4, drag: 0.6 });
  } else if (zone === 'dungeon' && Math.random() < 0.3) particles.emit({ x: player.pos.x + (Math.random() - 0.5) * 20, y: 0.5 + Math.random() * 3, z: player.pos.z + (Math.random() - 0.5) * 20 }, { count: 1, color: 0x9a5cff, speed: 0.1, up: 0.2, life: 2.5, size: 0.12, drag: 0.1 });   // 矿洞浮尘
}

const targetRing = M.makeRing('#ffd100', 0.9); targetRing.visible = false; scene.add(targetRing);
function updateTargetRing() {
  targetRing.visible = !!target && target.alive && target.z === zone;
  if (targetRing.visible) { targetRing.position.set(target!.pos.x, 0.06, target!.pos.z); targetRing.scale.setScalar(0.9 * target!.rig.scale); targetRing.rotation.z += 0.02; }
}

// v0.9.1d：传送门 / 裂隙 / 晶石的环境粒子（每秒重扫附近对象）
let envList: THREE.Object3D[] = [], envScan = 0;
const _ep = new THREE.Vector3(), _es = new THREE.Vector3();
function updateEnvFx(dt: number, nowMs: number) {
  G.ENV_T.value = nowMs / 1000;
  if (!player?.pos) return;
  envScan -= dt;
  if (envScan <= 0) { envScan = 1; envList = []; scene.traverse(o => { if (!(o.userData.portal || o.userData.crystal !== undefined)) return; for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return; o.getWorldPosition(_ep); if (_ep.distanceTo(player.pos) < 40) envList.push(o); }); }
  for (const o of envList) {
    o.getWorldPosition(_ep); const s = o.getWorldScale(_es).x;
    if (o.userData.portal) {
      const { color, style } = o.userData.portal as { color: number; style: string };
      // 被吸进门里的光点（切向旋转 + 向心）+ 地面升起的符文光
      if (Math.random() < 0.6) VFX.fx('dot', { x: _ep.x, y: _ep.y + 1.7 * s, z: _ep.z }, { count: 1, color, color2: 0xffffff, radius: 2.4 * s, ring: true, speed: -1.6 * s, swirl: 2.5, up: 0.05, life: 1.1, size: 0.16 * s, sizeEnd: 0.03 });
      if (Math.random() < 0.15) VFX.fx('rune', { x: _ep.x, y: _ep.y + 0.4, z: _ep.z }, { count: 1, color, radius: 2 * s, speed: 0, up: 1.2, life: 1.6, size: 0.4 * s, sizeEnd: 0.1, spin: 0.2 });
      if (style === 'rift') {
        if (Math.random() < 0.3) VFX.fx('smoke', { x: _ep.x, y: _ep.y + 0.3, z: _ep.z }, { count: 1, color: 0x2a1040, colorEnd: 0x100818, radius: 1.4 * s, speed: 0.2, up: 0.8, life: 2.4, size: 1.4 * s, sizeEnd: 2.6 * s });
        o.children.forEach(c => { if (c.name === 'shard') { c.position.y += Math.sin(nowMs / 700 + c.userData.ph) * 0.004; c.rotation.y += dt * 0.6; } });
      }
    } else if (Math.random() < 0.08) {
      VFX.fx('star', { x: _ep.x, y: _ep.y + 0.6 * s, z: _ep.z }, { count: 1, color: o.userData.crystal as number, color2: 0xffffff, radius: 0.5 * s, speed: 0, up: 0.6, life: 1.2, size: 0.3, sizeEnd: 0.05 });
    }
  }
}

// v0.9.1：营火 / 火把改为序列帧火焰（每秒重建一次附近火源列表）
let fireList: { o: THREE.Object3D; s: number }[] = [], fireScan = 0;
const _fp = new THREE.Vector3();
function updateFires(dt: number) {
  if (!player?.pos) return;
  fireScan -= dt;
  if (fireScan <= 0) {
    fireScan = 1; fireList = [];
    scene.traverse(o => {
      if (o.name !== 'fire' && o.name !== 'flame') return;
      if (!o.visible || !o.parent?.visible) return;
      o.getWorldPosition(_fp); if (_fp.distanceTo(player.pos) > 45) return;
      fireList.push({ o, s: o.name === 'fire' ? 1.15 : 0.45 });
      o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined; if (m && m.transparent && !m.userData.fx91) { m.userData.fx91 = true; m.opacity *= 0.35; } });
    });
  }
  for (const f of fireList) { f.o.getWorldPosition(_fp); fireTick({ x: _fp.x, y: _fp.y + (f.s > 1 ? 0.15 : -0.1), z: _fp.z }, f.s); }
}

let camZone: unknown = null;   // 11-07 BUG#3
function updateCamera(dt: number) {
  if (!started && selectCamera(camera, dt)) { sky.position.copy(camera.position); cineSnapShadow(sun, player.pos, cineSunOffset(_sunOff, dayNightOn(), gameClock().h + gameClock().m / 60)); /* 11-14 第 2 / 8 步 */ return; }   // v1.2.49 选角画面机位
  const locked = started && camLocked();
  if (locked) camPitch = LOCK_PITCH;
  const wantFov = locked ? 40 : 55;
  if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  const wantFp = QL_DEMO.fp && started && !locked && camDist < FP_D;
  if (wantFp !== fpOn) { fpOn = wantFp; player.rig.root.visible = !fpOn; camera.near = fpOn ? 0.05 : 0.1; camera.updateProjectionMatrix(); }
  if (fpOn) {   // 第一人称：眼睛位置 + 朝向（与第三人称同一个 yaw，看向角色前方）
    const p = THREE.MathUtils.clamp(camPitch, -1.2, 1.2); player.rig.root.visible = false;   // 换职业 / 重生换了 player 也保持隐藏
    camera.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
    const sh = feel.shake; if (sh > 0.001) { const t = performance.now() / 1000; camera.position.y += Math.sin(t * 53 + 1.3) * sh * 0.08; }
    camera.lookAt(camera.position.x - Math.sin(camYaw) * Math.cos(p), camera.position.y - Math.sin(p), camera.position.z - Math.cos(camYaw) * Math.cos(p));
    sky.position.copy(camera.position);
    cineSnapShadow(sun, shadowCenter(player.pos), demoSunDist(cineSunOffset(_sunOff, dayNightOn(), gameClock().h + gameClock().m / 60)));
    return;
  }
  const tgt = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  // 副本里有洞顶 / 拱门横梁：限制镜头高度（矿洞 9 米、神殿 8.6 米），拉远时自动压低距离
  const op = Math.max(camPitch, CAM_ORBIT_MIN), lookUp = camPitch < CAM_ORBIT_MIN ? (CAM_ORBIT_MIN - camPitch) : 0;
  const d0 = zone === 'dungeon' ? Math.min(camDist, (layout.id === 'darkrock_mine' ? 7.4 : 7) / Math.max(0.2, Math.sin(op))) : camDist;
  const d = (d0 + (isWildId(zone) ? packCamPull() : 0)) * (1 - lookUp * 0.55);   // 抬头时拉近，避免角色挡满下半屏；raidA A7 包可让镜头额外拉远（大型首领）
  const off = new THREE.Vector3(Math.sin(camYaw) * Math.cos(op), Math.sin(op), Math.cos(camYaw) * Math.cos(op));
  // 11-07 BUG#3 相机防穿透：注视点到相机之间有石头 / 墙 → 拉近（src/web/camcollide.ts）
  if (camZone !== zone) { camZone = zone; camCollideReset(); }
  const dc = camCollide(scene, tgt, off, d, dt, performance.now() / 1000, [player.rig.root, ...enemies.map(e => e.rig.root), ...npcs.map(n => n.rig.root)]);
  off.multiplyScalar(dc);
  camera.position.copy(tgt).add(off);
  // 镜头震动：几组不同频率的正弦叠加（比纯随机更顺），强度由 HitFeel 按事件给出并随时间衰减
  const sh = feel.shake;
  if (sh > 0.001) { const t = performance.now() / 1000; camera.position.add(new THREE.Vector3(Math.sin(t * 61) + Math.sin(t * 23) * 0.5, Math.sin(t * 53 + 1.3) * 0.8, Math.sin(t * 47 + 2.1) + Math.sin(t * 17) * 0.4).multiplyScalar(sh * 0.32)); }
  if (feel.push > 0.001) { const k = feel.push * feel.push * 0.35; camera.position.x += feel.dirX * k; camera.position.z += feel.dirZ * k; }   // v1.2.56 方向震屏
  if (lookUp > 0) camera.position.y = Math.max(camera.position.y - lookUp * 1.6, player.pos.y + 0.7);
  camera.lookAt(lookUp > 0 ? tgt.clone().add(new THREE.Vector3(0, Math.tan(lookUp * 1.9) * d, 0)) : tgt);
  { const ov = (window as unknown as { __camOv?: number[] }).__camOv; if (ov) { camera.position.set(ov[0], ov[1], ov[2]); camera.lookAt(ov[3], ov[4], ov[5]); } }   // v1.2.35 截图工具（dev/cmpshots.mjs）定机位
  sky.position.copy(camera.position);
  cineSnapShadow(sun, shadowCenter(player.pos), demoSunDist(cineSunOffset(_sunOff, dayNightOn(), gameClock().h + gameClock().m / 60))); /* 11-14 第 2 / 8 步；11-17g Demo 前推 + 160 m */
}

/** 背景音乐跟着场景切换：营地 / 矿洞 / Boss 战 */
let musicBoss: string | null = null, musicBossT = 0, musicBossZone = '';
function updateMusic() {
  const bi = boss?.intent;
  const bossFight = zone === 'dungeon' && boss && boss.alive && bi && (bi.state === 'chase' || bi.state === 'attack');
  const evOn = worldEvents.some(ev => ev.active && ev.map === zone);
  // v1.2.48 选曲场景：区域 + 正在交战的首领（世界首领 / 内容包首领 / 副本首领；脱战后保持 4 秒，避免首领走位时曲目来回切）
  const wh = zone !== 'dungeon' && zone !== 'raid' ? (wbHud() ?? packBossHud()) : null;
  const bk = wh ? (wh.boss.pboss ?? wh.boss.wb ?? 'boss') : bossFight ? 'dungeon' : null;
  if (bk) { musicBoss = bk; musicBossT = T; } else if (musicBoss && (T - musicBossT > 4 || musicBossZone !== zone)) musicBoss = null;
  musicBossZone = zone;
  audio.setTheme(zone === 'world' ? 'camp' : zone === 'field' ? 'field' : isWildId(zone) ? (evOn ? 'event' : WILD[zone].palette.music) : zone === 'raid' ? raidMusic() : bossFight ? layout.bossTheme : layout.theme, { zone: String(zone), boss: musicBoss, map: zone === 'dungeon' ? layout.id : zone === 'raid' ? raidMusicKey() : undefined });   // 11-18 map = 副本 id（本体地图专属曲）
  // 野外战斗层：遇敌鼓点淡入（副本和世界事件自带战斗音乐）
  audio.setCombat(zone !== 'dungeon' && zone !== 'raid' && !evOn && inCombatNow());
}

let started = false;
let lastGrade = '';
let last = performance.now();
let saveTimer = 0;
let wmTimer = 0;
let mainSkip = 0, mainSkipped = 0;
let nextDue = 0;   // v1.2.39 帧率上限节拍
const loadingEl = document.getElementById('loading') as HTMLElement;   // fix1109c #5
// 11-18 A1 画质验收接口（画质专长包 v8 §二 verify.py）：?verify=1 时 window.__noLoop 为真则主循环不自跑，改由 __dbg.frame(dt) 一帧一帧推；
//   不带 ?verify=1 时 __noLoop 不起作用，行为与原来完全一样
const VERIFY = new URLSearchParams(location.search).get('verify') === '1';
const noLoop = () => VERIFY && !!(window as unknown as { __noLoop?: boolean }).__noLoop;
/** __dbg.frame(dt)：按给定步长推一帧（dt 秒，0 = 时间不走，只重画；主循环内部仍按 0.05 s 封顶） */
function verifyFrame(dt: number) { const now = performance.now(); last = now - Math.max(0, dt) * 1000; nextDue = 0; step(now, true); }
function loop() {
  requestAnimationFrame(loop);
  if (noLoop()) return;
  step(performance.now(), false);
}
function step(nowMs: number, forced: boolean) {
  if (hiddenNow && !forced) { last = nowMs; stutterReset(); return; }                // 后台：不更新、不渲染
  // v1.2.39 帧率上限改累加式：按 1000/fps 的节拍排下一帧，144 / 75 / 90 / 100Hz 下长期平均也是整 60（原来按「距上帧」跳帧会掉到 48 / 37 等）
  const capFps = rec.on ? 60 : settings.fps === 30 ? 30 : settings.fps === 60 ? 60 : 0;
  if (capFps && !forced) {
    const iv = 1000 / capFps;
    if (nowMs < nextDue - 1) return;
    nextDue = nowMs - nextDue > iv ? nowMs + iv : nextDue + iv;
  }
  fpsTick(nowMs);
  stutterFrame(nowMs);   // v1.2.73b 长帧探针（>150ms 记录）
  const recDt = Math.min(0.25, (nowMs - last) / 1000);   // v1.2.38c 录制相机用真实时间（低帧率也不拖慢镜头路径）
  const realDt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
  const rawDt = realDt * (rec.on ? rec.timeScale : 1);   // v1.2.38c 时间缩放
  // 顿帧：命中/暴击/重击时游戏慢放一瞬间（40~90 毫秒），击杀 Boss 更长（core/HitFeel.ts）
  const dt = rawDt * feel.update(rawDt, HITSTOP_REAL ? Math.max(rawDt, recDt) : rawDt);   // 11-19 C21 hitstopreal（?off=hitstopreal 回旧）
  if (started && player) {
    T += dt;
    if (rec.free) player.rig.anim?.update(dt); else updatePlayer(dt);   // v1.2.38c 自由相机时角色不吃输入
    if ((isWildId(zone) || zone === 'field') && !(dash && dash.skill.tags.includes('leap'))) player.pos.y = packLift() ?? groundAt(player.pos.x, player.pos.z);   // v0.9.3a 贴地（英勇跳跃的抛物线除外）；raidA A6 包可接管高度（升降梯 / 高架栈道）
    updateGear(player.rig, dt);
    stowTick(dt);   // v1.2.48 武器收纳 / 取出
    updateRecall(rawDt);
    updateStatusHud(rawDt);
    dayNightTick(rawDt, document.documentElement.classList.contains('selui') || document.documentElement.classList.contains('intitle'));   // v1.2.69 野外昼夜光照
    checkWaypoints();
    updateWorldEvents(dt);
    wbUpdate(dt);   // v0.9.3d 世界首领刷新 / 喊话
    exUpdate(dt);   // v0.9.3e 采集点 / 宝箱刷新
    regionalUpdate(dt);   // v0.9.3f 动态事件 / 天气
    if (packBuffTick(dt)) syncCharacter();   // v1.2.37c 增益到期重算
    updatePacks(dt);   // v1.0.3 内容包每帧（没有包 = 空循环）
    extKeyUpdate(dt);   // v1.1.1 扩展按键显隐 / 充能（没有包 = 直接返回）
    slotKeyUpdate(dt);   // v1.2.15 第 8 技能格显隐 / 冷却（没有包 = 直接返回）
    if ((rareTick += dt) > 1) { rareTick = 0; noteRareSightings(); }   // v0.6.9 稀有首领刷新点
    if (isWildId(zone) && wilds[zone]) updateWild(wilds[zone]!, rec.freezeAI ? 0 : rawDt, T, player.pos.x, player.pos.z);
    chronoUpdate(dt);
    alchemyUpdate(dt);
    setfxUpdate(dt); lgfxUpdate(dt); trigfxUpdate(dt); classExtUpdate(dt);
    updateResHud(dt);   // v0.7.5
    // v0.7.0 终刻（时停）：敌人、首领脚本、红圈、弹幕全部静止
    const edt = chronoFrozen() || rec.freezeAI ? 0 : dt;
    updateEnemies(edt);
    updateRaid(edt);
    for (const n of npcs) if (n.z === zone) n.rig.anim?.update(dt);
    if (pendingArrive) onAutoArrive();
    updateGuide(rawDt);
    updateTutorial(dt);
    updatePathLine(); if (rec.noUI) hidePathLine();
    updateObjMarker();
    if (boss && !boss.alive && bossBrain) bossBrain.update(edt, player);  // Boss 死后让红圈结算完
    fx.update(dt);
    dungeonRun?.update(dt);
    dgxUpdate(dt);
    packDungeonUpdate(dt);   // v1.2.16
    updateProjectiles(dt);
    updateEnemyShots(edt);
    updateMinimap(rawDt);
    updateTelegraphs(edt);
    updateLoot();
    for (const g of gateAnims) { g.t += dt; g.g.position.y = -g.t * 2.5; if (g.t > 1.8) g.g.visible = false; if (g.t < 1.5 && Math.random() < 0.5) { const gw = g.g.getWorldPosition(_gateW); /* 11-18 副本组放大后 position 是组内坐标 */ particles.emit({ x: gw.x, y: 0.2, z: gw.z }, { count: 3, color: 0x8a7a66, speed: 2, up: 1, radius: 2.5, life: 0.8, size: 0.5, gravity: 3 }); } }
    if (yellTimer > 0) { yellTimer -= dt; if (yellTimer <= 0) $('yell').textContent = ''; }
    playMs += rawDt * 1000;
    saveTimer += rawDt; if (saveTimer > 30) { saveTimer = 0; save(); }   // 自动保存：每 30 秒
    updateHUD();
    if ($('worldmap').style.display === 'flex') { wmTimer -= rawDt; if (wmTimer <= 0) { wmTimer = 0.5; renderWorldMap(); } }
    if ($('raidmap').style.display === 'flex') { wmTimer -= rawDt; if (wmTimer <= 0) { wmTimer = 0.5; renderRaidMap(); } }
    rm3dFrame(rawDt, $('raidmap').style.display === 'flex');   // v0.9.6f 3D 副本浮岛：面板开着才渲染，关掉即释放
    altarFrame(rawDt, id => $(id).style.display === 'flex');   // v0.9.6d 战利品祭坛 3D（说明书 / 深渊结算）
    wm3dFrame(rawDt, $('worldmap').style.display === 'flex');   // v0.9.6e 3D 沙盘（世界 / 区域地图）
    updateMusic();
    ambTick(audio, rawDt, audio.sceneKey, nightness() > 0.5);   // 11-18 环境音（?off=ambsfx）：按地图 + 昼夜放底层环境音，森林夜间狼嚎
    updateTargetRing(); if (rec.noUI) targetRing.visible = false;
  } else if (player) {
    // 标题画面（角色选择）：镜头在角色正面，轻轻摆动；角色站在营火旁
    camYaw = 0.1 + Math.sin(nowMs / 4000) * 0.3;
    for (const n of npcs) n.rig.anim?.update(rawDt);
    player.rig.anim?.update(rawDt);
    updateGear(player.rig, rawDt);
    gearStowTick(player.rig, rawDt, false);   // v1.2.48 选角画面：武器收着
    selectTick(rawDt);   // v1.2.49 选角重做：职业站位 / 名字牌 / 背景动画
  }
  if (started && $('char').style.display === 'flex') preview.update(rawDt);
  updateAmbient(rawDt, nowMs);
  updateFx(dt);
  updateFires(dt);
  updateVfx(dt);
  G.ENV_T.value = performance.now() / 1000;
  updateFlash();
  nightRimTick(rawDt, mirrorMoon ? 0.85 : nightness(), (function* () { for (const e of enemies) if (e.alive && e.z === zone) yield e; })());   // 11-18 Rhett「夜间怪物也要有亮度」
  nightGlowTick(rawDt, mirrorMoon ? 0.6 : nightness(), started && (zone === 'world' || zone === 'field' || isWildId(zone)), player ? player.pos : null);   // 11-18 夜间人物暖光 + 漂浮光点
  particles.update(dt);
  if (player) { updateCamera(rawDt); if (recUpdate(recDt) || photoUpdate()) sky.position.copy(camera.position); updateFloats(rawDt); updatePlates(); }
  { const zk = String(zone);   // 11-16 各图画风表（map_look.ts）：调色 / 空气 / 体积光按气候
    if (zk !== lastGrade) { lastGrade = zk; const lk = setMapLook(zk); pipeline.setGrade(lk.grade); pipeline.setLook(lk); ssSetSunLock(lk.sunEl); sun.shadow.intensity = lk.shK; } }   // 11-17f DLC 光影：阴影浓度按图（?off=dlclight）
  // v0.9.6f 3D 副本地图打开时（面板几乎盖满屏幕）主场景限帧：电脑 1/4、手机 1/8
  if ((rm3dActive() || altarActive() || wm3dActive()) && (mainSkip = (mainSkip + 1) % (isMobile ? 8 : 4)) !== 0) { mainSkipped++; return; }
  if (started) prewarmTick();   // v1.2.73b 分帧预上传贴图（每帧约 4ms）
  lightPadFrame();   // v1.2.77 点光源个数固定（不因灯出现 / 消失整场重编着色器）
  // fix1109c #5：加载画面（不透明度 .88，盖住整个场景）显示期间不渲染主场景 —— 原来进世界 / 换区的加载画面后面主循环照常 render，
  //   预热 compileAsync 还没编完的程序会在这一帧里被同步编译 + 链接（实测进世界那段的大头），加载动画也跟着冻住；预热自己会实渲一帧（含阴影）
  if (loadingEl.style.display === 'flex') return;
  if (PERF_ON) renderer.info.reset();
  cineUpdate(dt, { sun, sky, scene, enabled: CINE.on[3], outdoor: dayNightOn(), day: dayLevel() });
  if (player) wakeTick(renderer, dt, player.pos.x, player.pos.y, player.pos.z);   // 11-18 水面尾迹：玩家脚底低于水面才加源
  qlSplashTick(renderer, scene, camera, dt);   // 11-19 qlsplash：r8 水花 v2 + 落水涟漪（玩家在原野河 / 腐沼水里涉水才发射；?off=qlsplash）
  { if (!motesMade) { motesMade = true; makeMotes(scene, G.curQuality); } updateMotes(performance.now() / 1000, camera, sun, dayNightOn() && G.curQuality !== 'low', renderer.domElement.height); }   // 11-16 阳光浮尘（秋林逆光）
  if (selectBlank()) { renderer.setRenderTarget(null); const c0 = renderer.getClearColor(new THREE.Color()), a0 = renderer.getClearAlpha(); renderer.setClearColor(0x020708, 1); renderer.clear(); renderer.setClearColor(c0, a0); return; }   // 11-18 旧选人画面删除：详情页之前不画场景
  pipeline.render();
  photoAfterRender();
  if (PERF_ON) perfHud(rawDt);
}

// v1.2.37b 帧率模块：玩家血条上方，每 0.5 秒刷新（设置「显示帧率」开关）
let fpsT0 = 0, fpsN = 0, fpsEl: HTMLElement | null = null;
function fpsTick(nowMs: number) {
  fpsN++;
  if (!fpsT0) { fpsT0 = nowMs; return; }
  if (nowMs - fpsT0 < 500) return;
  const v = Math.round(fpsN * 1000 / (nowMs - fpsT0)); fpsT0 = nowMs; fpsN = 0;
  fpsEl ??= document.getElementById('fps-hud');
  if (fpsEl && settings.showFps !== false) { fpsEl.textContent = `FPS ${v}`; fpsEl.style.color = v >= 50 ? '#9f9' : v >= 28 ? '#ffd860' : '#ff7a6a'; }
}
// v0.9.3a 性能面板：网址加 ?perf=1 打开（帧率 / 绘制调用 / 三角面 / 怪物 激活·显示·总数 / 区块）
const PERF_ON = /[?&]perf=1/.test(location.search);
let perfAcc = 0, perfFrames = 0, perfDiv: HTMLDivElement | null = null;
if (PERF_ON) renderer.info.autoReset = false;
function perfHud(dt: number) {
  perfAcc += dt; perfFrames++;
  if (perfAcc < 0.5) return;
  perfStat.fps = Math.round(perfFrames / perfAcc); perfAcc = 0; perfFrames = 0;
  perfStat.calls = renderer.info.render.calls; perfStat.tris = renderer.info.render.triangles;
  if (!perfDiv) { perfDiv = document.createElement('div'); perfDiv.id = 'perf-hud'; perfDiv.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:60;font:12px/1.5 monospace;color:#ffe9b0;background:rgba(0,0,0,.55);padding:4px 8px;border-radius:4px;pointer-events:none;white-space:pre'; document.body.appendChild(perfDiv); }
  const out = !!outdoorNav();
  perfDiv.textContent = `FPS ${perfStat.fps}  绘制 ${perfStat.calls}  三角面 ${(perfStat.tris / 1000).toFixed(0)}k\n` + (out ? `怪物 激活 ${perfStat.active}/${perfStat.total}  显示 ${perfStat.shown}（上限 ${MAX_ACTIVE}）  区块 ${perfStat.chunk}  地面 ${player.pos.y.toFixed(1)} 米` + (perfStat.chunksAll ? `\n物件分块 显示 ${perfStat.chunksOn}/${perfStat.chunksAll}` : '') : `怪物 ${enemies.filter(e => e.z === zone && e.alive).length}`);
}

// ======================================================================
// 开始 / 复活
// ======================================================================
$('respawn').onclick = () => {
  $('death').style.display = 'none';
  if (zone === 'raid') { raidRespawn(); player.status.clear(); player.hp = player.maxHp; player.rig.root.rotation.z = 0; player.rig.anim?.revive(); target = null; audio.portal(); return; }
  if (zone === 'dungeon') { leaveDungeon(true); clearLootInZone(); }
  if (zone === 'field') player.pos.set(F.x + FIELD_SPOTS.arrive.x, 0, F.z + FIELD_SPOTS.arrive.z - 12);   // 原野里阵亡：在翠风前哨复活
  else if (isWildId(zone)) { const d = recallDest(); player.pos.set(d.pos.x, 0, d.pos.z); }   // 新地图：最近的已开通营地
  else player.pos.copy(CAMP);
  player.rig.root.rotation.y = Math.PI; camYaw = 0;
  player.status.clear();
  player.hp = player.maxHp;
  player.rig.root.rotation.z = 0;
  player.rig.anim?.revive();
  target = null;
  audio.portal();
};
// 状态留在 main（title.ts 通过 C 读写）
let chosen: ClassId = 'warrior';
let selSlot = 0;          // 选中的角色栏位
bindTitle(C);   // → title.ts

// ======================================================================
// 启动：先加载角色模型（内嵌在页面里），再生成角色
// ======================================================================
let lastNotices: string[] = [];   // 测试用：最近一次显示的迁移提示
/** 新版本第一次进游戏：弹一次「本次更新」 */
function showChangelog(force = false, returning = true) {
  const seen = safeLS.get('darkrock_seen_version');
  if (!force && seen === GAME_VERSION) return;
  safeLS.set('darkrock_seen_version', GAME_VERSION);
  if (!force && !returning) return;   // 新角色（新玩家）不弹
  const c = CHANGELOG[0];
  $('cl-body').innerHTML = CHANGELOG.slice(0, force ? CHANGELOG.length : 1).map(e => `<h3>${e.v} · ${e.title} <small>${e.date}</small></h3><ul>${e.items.map(i => `<li>${i}</li>`).join('')}</ul>`).join('');
  $('cl-title').textContent = force ? '更新日志' : `本次更新 · ${c.v}`;
  togglePanel('changelog', true);
}
/** 11-14 片头 LOGO 抠黑底（GPU 版）：a = max(r,g,b) 压底噪 8 后 ×2.1，颜色反预乘——与 2D 版同一公式。返回逐帧绘制函数；不支持 WebGL 返回 null */
function logoKeyGL(cv: HTMLCanvasElement): ((v: HTMLVideoElement) => void) | null {
  const gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false, preserveDrawingBuffer: true }) as WebGLRenderingContext | null; if (!gl) return null;
  const sh = (t: number, src: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 u;void main(){u=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 u;uniform sampler2D t;void main(){vec3 c=texture2D(t,u).rgb;float m=max(c.r,max(c.g,c.b));float a=m<=8./255.?0.:min(1.,(m-8./255.)*2.1);gl_FragColor=vec4(a>0.?c/m:c,a);}'));
  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  return (v: HTMLVideoElement) => {
    if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
    gl.viewport(0, 0, cv.width, cv.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);   // 跨源 / 被污染会抛错 → 外层 catch 退回 screen 视频
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
// v1.2.81 Rhett 11-06：左上角 LOGO 黑底块 —— #title 是独立层叠上下文（fixed + z-index），视频的 screen 混合只跟 #title 自身半透明底混，
// 3D 场景在层外，黑底露出。改为逐帧把视频画进 canvas、按亮度生成透明度（a = max(r,g,b)，颜色反预乘），真透明叠在场景上；canvas 取不到像素才退回 screen 视频
function logoAlphaCanvas(lg: HTMLElement, v: HTMLVideoElement) {
  const cv = document.createElement('canvas'); cv.className = 'sel-logo-vid sel-logo-cv'; cv.setAttribute('aria-label', GAME_NAME);
  // 11-14 Rhett「创建角色进入很慢」：剖析显示点下后主线程几乎全耗在这里逐帧 drawImage + getImageData（视频整帧读回 CPU 再逐像素算），
  //   跟 3D 选角台抢主线程。改为 WebGL 小画布在 GPU 上抠黑底（同一公式），取不到 WebGL 才退回 2D 逐像素
  const gk = logoKeyGL(cv);
  const ctx = gk ? null : cv.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null; if (!gk && !ctx) return;
  let on = false, last = -1;
  const tl = document.getElementById('title');
  const draw = () => {
    if (!v.isConnected) { cv.remove(); return; }
    // fix1109c #5：标题收起后不再逐帧 drawImage + getImageData（原来进世界后一直跑：视频解码 + 整帧读回 + 逐像素算透明度，实测进世界那段里占主线程最多），视频也暂停；回到标题再播
    if (tl && tl.style.display === 'none') { if (!v.paused) v.pause(); requestAnimationFrame(draw); return; }
    if (v.paused && v.readyState >= 2) v.play().catch(() => { /* 自动播放被拒：停在当前帧 */ });
    if (v.readyState >= 2 && v.videoWidth && v.currentTime !== last) {
      last = v.currentTime;
      if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
      try {
        if (gk) { gk(v); if (!on) { on = true; v.classList.add('src'); lg.insertBefore(cv, v); } requestAnimationFrame(draw); return; }
        if (!ctx) return;
        ctx.drawImage(v, 0, 0); const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]; let m = r > g ? r : g; if (b > m) m = b;
          const a = m <= 8 ? 0 : Math.min(255, (m - 8) * 2.1);   // 压掉编码底噪（黑底不是纯 0）；×2.1 让暗金属字身在亮场景上也够实
          if (a > 0) { const k = 255 / m; d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; }
          d[i + 3] = a;
        }
        ctx.putImageData(im, 0, 0);
        if (!on) { on = true; v.classList.add('src'); lg.insertBefore(cv, v); }
      } catch { cv.remove(); return; }   // 跨源 / 被污染：保持原 screen 视频
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
async function boot() {
  // v0.9.2f 登录动画：和加载并行播放，结束时标题画面依次入场
  $('t-name').innerHTML = titleHtml(GAME_NAME_MAIN); $('t-subname').textContent = GAME_NAME_SUB; document.title = GAME_NAME; $('t-sub').textContent = subText();
  { // v1.2.74 左上角 LOGO 换动态版（M1_logo_anim_a）；视频播不了（不支持 H.264 等）就退回文字标题
    const lg = document.querySelector('#title .sel-logo') as HTMLElement | null;
    if (lg && LOGO_ANIM) { const v = document.createElement('video'); v.className = 'sel-logo-vid'; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.setAttribute('aria-label', GAME_NAME);
      v.addEventListener('playing', () => lg.classList.add('vid'), { once: true }); v.addEventListener('error', () => { if (si >= srcs.length - 1) v.remove(); });
      const srcs = [LOGO_ANIM_WEBM, LOGO_ANIM].filter(u => u && v.canPlayType(u.slice(5, u.indexOf(';'))) !== ''); if (!srcs.length) srcs.push(LOGO_ANIM); let si = 0; v.addEventListener('error', () => { if (++si < srcs.length) { v.src = srcs[si]; v.play().catch(() => {}); } }); v.src = srcs[0]; lg.prepend(v); v.play().catch(() => { /* 自动播放被拒：保持文字标题 */ }); logoAlphaCanvas(lg, v); }
  }
  // v1.2.48 标题画面曲目（首次交互后才出声）+ 开场旁白（开场动画被点掉时，内容包 PackAudio.opening 提供）
  audio.setTheme('none', { zone: 'title' });
  { const first = () => { window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true); audio.unlock(); };
    window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true); }
  // v1.2.54 Rhett：标题 / 选角画面不要说话，只放音乐 → 开场旁白不再在标题画面播放
  audio.introDone = null; void packOpeningVoice;
  loadingStart();   const cgFirst = firstCG(audio);   // v1.2.74 首次打开播宣传片（盖在加载画面上，加载后台继续）
  // v1.2.49 加载画面接管（资产就绪后才淡入开场 / 选角，不再先跳出界面再卡住）
  const startBtn = $('start') as HTMLButtonElement;
  startBtn.textContent = '加载中…'; startBtn.disabled = true;
  applySettings();
  // 存档：IndexedDB 镜像里更新的存档补回 localStorage → 读角色列表 → 老存档（每职业一个）迁成角色
  const restored = await storage.init();
  roster = new Roster(storage, LOOT_DATA);
  const migrated = roster.migrateLegacy(['warrior', 'mage'], { warrior: '战士', mage: '法师' });
  roster.probe();
  const lastI = roster.data.last ? roster.slots.findIndex(m => !!m && m.id === roster.data.last) : -1;
  selSlot = lastI >= 0 ? lastI : roster.slots.findIndex(Boolean) >= 0 ? roster.slots.findIndex(Boolean) : 0;
  if (slotMeta()) chosen = (slotMeta()!.classId as ClassId) in CLASSES ? slotMeta()!.classId as ClassId : 'warrior';
  ($('cs-name') as HTMLInputElement).value = randomName();
  if (restored) console.info(`从 IndexedDB 恢复了 ${restored} 份存档`);
  if (migrated) console.info(`老存档迁移成 ${migrated} 个角色`);
  if (!storage.lsOk && !storage.idbOk) $('cs-warn').textContent = '当前环境无法保存进度（浏览器禁用了本地存储），刷新页面后进度会丢失。';
  setCharModelMode(settings.charModel, settings.quality);   // v1.2.0-m1
  (window as unknown as Record<string, unknown>).__loadDbg = loadingDebug;   // v1.2.55 无头测试排查加载卡住
  // fix1106 载入提速：角色模型与怪物模型同时解析（贴图解码 / meshopt 等待互相重叠），两者都完成才往下走
  const okP = loadTask('角色模型', 4, loadCharacters()), crP = loadTask('怪物模型', 3, loadCreatures());
  const ok = await okP; await crP; void startLazyCreatures().then(() => { prewarmNote('lazy'); for (const t of creatureTextures()) prewarmTexture(t); }); /* v1.2.54 分包：后台拉延后模型 */ void weaponSkinRestore().then(n => { if (n) { refreshGear(true); if (!started && !selOff('selsavegear')) { try { titleModel(); } catch { /* 标题没就绪就算了 */ } } } });   // Rhett 11-18：铸造台模型后台登记完，标题选中的存档角色重挂一次（?off=selsavegear 回旧）   // v0.9.4b AI 生成怪物模型（失败则用程序化模型）
  if (!ok) console.warn('角色模型加载失败，使用方块模型');
  player = new Unit('player', 'player', cls.baseHp, M.makeWarrior(), '勇士');
  player.rig.root.userData.cls = 'warrior';
  player.critChance = cls.critChance;
  scene.add(player.rig.root);
  player.pos.copy(CAMP);
  player.rig.root.rotation.y = Math.PI;   // 面朝北（营地和传送阵方向）
  player.rig.anim?.loop('idle');
  addNpc('bran', 3, 1, -0.6);
  addNpc('tom', 4, -28, -1.2);
  addNpc('ayla', -12, 5, Math.PI / 2);
  addNpc('gerda', 0, 12.8, Math.PI);
  for (const [id, n] of Object.entries(FIELD_NPCS)) addNpc(id as M.NpcKind, F.x + n.x, F.z + n.z, n.yaw, 'field');
  addNpc('kai' as M.NpcKind, -3.6, 13.4, Math.PI, 'world', M.makeNpcModel('Rogue', 0x8a7a5a, 0.3));   // 阶段四：灰石营地的仓库管理员
  for (const n of packZoneNpcs('world')) { try { if (!NPCS[n.id]) NPCS[n.id] = { name: n.name ?? n.id, title: n.title ?? '' }; addNpc(n.id as M.NpcKind, n.x, n.z, n.yaw, 'world', M.makeNpcModel(n.model, n.tint, n.tintK)); } catch (e) { console.error('内容包营地 NPC 出错', e); } }   // v1.2.71 可选挂点
  for (const n of FIELD_SERVICE_NPCS) { addNpc(n.id as M.NpcKind, F.x + n.x, F.z + n.z, n.yaw, 'field', M.makeNpcModel(n.model, n.tint, 0.3)); npcs[npcs.length - 1].role = n.role; }   // 翠风前哨补齐补给商 / 铁匠 / 仓库
  for (const id of WILD_IDS) if (wilds[id]) { spawnWildEnemies(id); spawnWildNpcs(id); exBuild(id); }
  spawnWorldEnemies();
  exBuild('field');   // v0.9.3e 翠风原野的瞭望塔 / 采集点 / 宝箱
  spawnDummy();
  syncCharacter();
  player.hp = player.maxHp;
  camDist = 6.2; camPitch = 0.16;   // 标题：镜头拉近看角色和装备，角色站在营火旁
  player.pos.set(1.3, 0, 7.6); player.rig.root.rotation.y = 0.15;
  try { SC.grayCampApply(); } catch (e) { console.error('灰石营地换装出错', e); }   // 11-18 Rhett：本体营地用 DLC 营地模型（内容包 GRAY_CAMP_HOOKS；不注册 = 不变）
  titleModel();
  selectPrepare();   // v1.2.49 选角背景（内容包机位 / 本体营地）+ 职业站位，计进加载
  renderTitle();
  // v1.2.49 高精贴图（高 / 超高）解码 + 显存上传、标题场景着色器预编译，都计进加载进度；全部就绪再淡出加载画面
  await loadTask('无缝贴图', 1, tileLoad(renderer));   // fix1106 代码模型无缝贴图：解码 + 上传显存在加载画面里完成
  await envHdReady(); envHdTrack(scene, renderer);
  prewarmInit({ renderer, scene, camera, zone: () => String(zone), target: () => pipeline.prewarmTarget(), padPool: padPoolExtra });   // v1.2.73b；11-18 target：按后期离屏目标编程序（永霜墓穴首领倒下卡顿）
  setZoneStormView(innerHeight || 720);
  await loadTask('预编译特效', 1, prewarmFx([G.telegraphMaterial(), G.portalMaterial(0xffffff), G.portalMaterial(0xffffff, true), G.runePlateMaterial(0xffffff), G.lavaMaterial(0xff6020), G.lavaMaterial(0x80c0ff, true), G.haloMaterial(0xffffff), G.darkFlameMaterial(), G.helixMaterial(), G.ancientHelixMaterial(), G.beamMaterial(0xffffff), ...VFX.fxSampleMaterials(), ...blizzardSampleMaterials(), ...zoneStormSampleMaterials(), groundFxWarm().material as THREE.Material, ...bladestormSampleMaterials(), ...mageFxSampleMaterials()]));   /* 11-17 法师专属特效 */   // v1.2.73 暴风雪材质也预编译
  selectWarm(true);   // Rhett 11-18：选角第一帧的场景状态（雾 / 区域 / 灯 / 环境贴图）一起编译，点「创建角色」不再全场重编译（?off=selprewarm 回旧）
  { // Rhett 11-18 ②（?off=selprewarm 回旧）：整场景预编译也按后期离屏目标编（35fca98 同一根因：中 / 高 / 超高档画进离屏目标，屏幕目标下编出的程序 outputColorSpace / toneMapping 对不上，标题首帧和点「创建角色」又全编一遍）。
    //   compile 本身同步建程序，切目标只包住这一下，等待就绪在外面
    const rt0 = renderer.getRenderTarget(), rt = selOff('selprewarm') ? rt0 : pipeline.prewarmTarget();
    renderer.setRenderTarget(rt);
    let p: Promise<unknown> = Promise.resolve();
    try { p = (renderer as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }).compileAsync?.(scene, camera) ?? p; } finally { renderer.setRenderTarget(rt0); }
    await loadTask('预编译着色器', 2, p); }
  selectWarm(false);
  await loadTask('预载角色与装备', 2, prewarmKit(buildPreloadKit(), player.pos, o => o.userData.kitProp === true));   // 11-04 Rhett 15:34 ④
  await loadingFinish(); zoneLoaderInit();   // v1.2.81 切区载入画面复用 N1
  await cgFirst;   // v1.2.74 宣传片没放完就等它
  // v1.2.74 Rhett：宣传片 → 载入条 → 直接进角色选择，不再播岩层开场（岩层开场已删）
  document.getElementById('intro-pre')?.remove(); titleEnter(); if (!started) titleFx(true);
  startBtn.textContent = '开始冒险'; startBtn.disabled = !!slotMeta() && slotMeta()!.status === 'corrupt';
  $('ver').textContent = GAME_VERSION + ' · ' + BUILD_TAG;   // 11-18 补丁编号
  try { const msg = `build ${BUILD_TAG} ${GAME_VERSION} q=${G.curQuality}`; console.info(msg); (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log?.(msg); } catch { /* 网页版无日志 */ }
  $('pf-portrait').innerHTML = uiIcon(M.portraitKey(chosen));
  // 调试/自动化测试入口
  // 11-14 画质专长包 Self-check：无头浏览器自查用的调试钩子（只读写镜头角度 / 画质，不影响游戏）
  (window as unknown as Record<string, unknown>).__dbg = { WAKE, renderer, scene, camera, sun, sky, pipeline, CINE, player: () => player, npcs: () => npcs,
    /** 自查：只开第 1..k 步 */
    cineSet: (n: string, v: boolean) => { const i = CINE_NAMES[n]; if (!i) return false; CINE.on[i] = v; cineApplyFlags(); pipeline.setQuality(pipeline.quality); cineSwapWater(scene); return true; },   // 11-14 A 档 第 21 步：单项开关对比
    cineStep: (k: number) => { for (let i = 1; i <= 16; i++) CINE.on[i] = i <= k; cineApplyFlags(); const u = (sky.material as THREE.ShaderMaterial).uniforms; u.uS1.value = CINE.on[1] ? 1 : 0; pipeline.setQuality(pipeline.quality); cineSwapWater(scene); },
    cam: (yaw?: number, pitch?: number, dist?: number) => { if (yaw !== undefined) camYaw = yaw; if (pitch !== undefined) camPitch = pitch; if (dist !== undefined) camDist = dist; return { yaw: camYaw, pitch: camPitch, dist: camDist }; },
    // 11-18 A1 v8 verify.py 约定的接口：R = 渲染器、frame(dt) 推一帧（?verify=1 + __noLoop 时由脚本驱动）、setYaw / setPitch 镜头角度（弧度）
    ambDebug, R: renderer, frame: verifyFrame, setYaw: (y: number) => { camYaw = y; }, setPitch: (p: number) => { camPitch = p; } };
  (window as unknown as Record<string, unknown>).__game = {
    channelInfo: () => ({ active: channelActive(), cc: player.ccImmune, spin }),
    hudClockDebug, setGameHour, dayNightDebug, cursorDebug, cursorAtXY: (x: number, y: number) => { const en = enemyAt(x, y); return cursorAt(en); }, mobTipDebug, renderQuestLog, questZonesOf: (id: string) => { const a = quests.active().find(x => x.q.id === id); const q = a?.q ?? quests.defs.find(x => x.id === id)!; return questZones(q, a?.p ?? q.objectives.map(() => 0), a?.ready ?? false); },   // v1.2.68
    questZoneAudit: () => quests.defs.map(q => ({ id: q.id, name: q.name, zones: questZones(q, q.objectives.map(() => 0), false).map(z => z.name) })),
    fxReal: { elementHit: VFX.elementHit, groundMark: VFX.groundMark, markCount: VFX.markCount, hitMatOf: VFX.hitMatOf, matHit: VFX.matHit },   // v1.2.57 写实特效库测试用   // v1.2.56 引导技能（剑刃风暴）测试用
    outdoorNav, runeHudDebug, hudDemo, ancientBanner, toast, gearScoreInfo, scoreHtml, itemTip, gearRoleNow, ancientBannerDemo: () => ancientBanner('裂光法杖（太古）'),
    stutter: stutterLog, prewarm: prewarmDebug,   // v1.2.73b
    exportSave: exportWithSkins, checkSkillLayout, perf: () => ({ ...perfStat }),
    /** 压力测试：在当前野外地图随机可走处多刷 n 只怪（不刷新） */
    stressSpawn: (n: number, kind = 'wolf') => { const nav = outdoorNav(); if (!nav) return 0; const b = nav.bounds; let k = 0;
      for (let t = 0; k < n && t < n * 20; t++) { const x = b.x0 + srand() * (b.x1 - b.x0), z = b.z0 + srand() * (b.z1 - b.z0); if (!nav.isFree(x, z)) continue; enemies.push(new Enemy(kind, ENEMY_TYPES[kind], new THREE.Vector3(x, 0, z), zone, '', 0)); k++; }
      refreshActive(); return k; }, groundAt, refreshActive, get activeCount() { return activeSet ? activeSet.size : -1; },
    classTune: () => ({ spec: mainSpec(), mul: tuneFor(cls.id, mainSpec()) }), syncCharacter, setfx: setfxDebug, lgfx: lgfxDebug, trigfx: trigfxDebug, resetStats, doReset, get fx() { return fx; },
    audio, player, enemies, quests, inventory, get tree() { return tree; }, progression, loadout, get target() { return target; }, set target(v: Enemy | null) { target = v; },
    wbDebug, wbSpawnNow, wbHud, wbState, wbClock, exDebug, exState, exClock, exInteract, repState, repClock, repAdd, repBuy, repTier, repPts, dynDebug, dynStart, dynForceNext, wxState, wxForce,
    get zone() { return zone; }, get boss() { return boss; }, get dungeonRun() { return dungeonRun; }, tryCast, get projectiles() { return projectiles; }, enterDungeon, leaveDungeon, openDialog, currentInteractable,
    rm3dDebug, altarDebug, buffHudDebug, buffTipDebug, buffDemo, slotKeyState, slotKeyUse, slotEquip, buffIconsOf: (u: never, w: never) => iconsOf(u, w), wm3dDebug, wmPoiAct, openAltarFromMap, altarLocate, altarState, whereDrops: (k: string) => whereDrops(k, LOOT_DATA, cls.id).map(w => w.src.id), abyDarkShow, abyDarkSel, get mainSkipped() { return mainSkipped; },
    packsDebug: () => ({ packs: packs().map(p => p.id), maxLevel: progression.maxLevel, level: progression.level, savedLevel: progression.savedLevel, held: progression.held, packFix, sealed: (loadedSave as PackGameSave | null)?.packSealed ?? null, park: (loadedSave as PackGameSave | null)?.packPark ?? null }),   // v0.9.7
    introDebug, introOpen, introSync, renderChapter, get cls() { return cls; }, gen, paragon, paragonGainXp, refreshTalentPoints, talentPointsTotal, resDebug, enterAbyss, enterStory, storyActive, storyDone, showEnding, closeEnding, endingOpen, enterWeekly, weeklyDebug, weeklySetNow, abyPick, abyssDebug, abyssKillAll, openAbyss, get abyssPending() { return abyssPending(); }, get talentPage() { return talentPage; }, switchTalentPage, applyGearSet, saveGearSet, gearSetsDebug, achDebug, achCheck, ach: ACH_, nextDebug, milestoneCheck, showLesson: (lv: number) => { const l = LESSONS.find(x => x.lv === lv); if (l) showLesson(l); }, openNext, lessonOnLevel, spiritDebug, spiritOnKill, openSpirits, get spirits() { return SPIRITS_; }, get res() { return RES; }, awakenDebug, awakenBossKill, openAwaken, chronoDebug, chronoRewind, chronoMark, chrono, classExtDebug, alchemyDebug, alchemySmoke, alchemy, renderTalents, get lastNotices() { return lastNotices; }, selectTalent: (id: string) => { talSel = tree.node(id) ?? null; renderTalents(); }, bakeStats, renderChar, charSheet, get charSel() { return charSel; }, get layout() { return layout.id; }, get layoutObj() { return layout; }, wildDef: (id: WildId) => WILD[id], dmSelect, dmTeleport, dmView, forge, shop, openShop, openScholar, setRaidDarkChance, setAncientChance, raidEndgameDrop, abyDarkTake, raidEntry, raidLoad, raidSave, raidPropsDebug, dgxDebug, dgxPick, dgxAct, dgxForceAnomaly, dgxChoose, rescueForce, rescueDebug, rescueAlly, ensureHd, hdAvailable, openTravel, usePotion, startGame, renderShop, get bossBrain() { return bossBrain; },
    setShopTab: (t: ShopTab, sel: string | null = null) => { shopTab = t; shopSel = sel; renderShop(); },
    __zones: () => [...poisonZones.values()].map(z => ({ p: z.p, r: z.r })),
    get T() { return T; }, loots, npcs, scene, camera, modelsOk: ok,
    __telegraphs: () => [...telegraphs.values()].map(t => ({ p: { x: t.disc.position.x, z: t.disc.position.z }, r: t.r, left: t.left })), camYawSet: (v: number) => { camYaw = v; }, camDistSet: (v: number) => { camDist = v; }, camPitchSet: (v: number) => { camPitch = v; }, camSet: (d: number, p: number) => { camMin = Math.min(5, d); camDist = d; camPitch = p; },
    // 翠风原野 / 任务指引
    autoPath, startAutoPath, get guide() { return guide; }, get guidePath() { return guidePath; }, trackedIds, focusQuestId, setFocus, toggleTrack, currentMap, navFor, enterField, leaveField,
    openWorldMap, toggleWorldMap, get wmView() { return wmView; }, chevCount: () => chevMesh.count, keys,
    // 第七版：翻滚 / 打击感 / 新手引导 / 设置
    dodge, tryDodge, feel, settings, applySettings, renderSettings, get tutStep() { return tutStep; }, tutStart, get tutState() { return tutState; }, get tutId() { return tutStep >= 0 ? TUT_ORDER[tutStep] : null; },
    get dummy() { return dummy; }, get tutItem() { return tutD.item; }, get tutCircle() { return tutD.circle ? { p: tutD.circle.p, r: tutD.circle.r, left: tutD.circle.left } : null; }, replayTutorial, tutFinish, equipFromBook,
    tutHl: () => (tutStep >= 0 ? TUT[TUT_ORDER[tutStep]].hl().filter(Boolean).map(e => (e as HTMLElement).id || (e as HTMLElement).className) : []), tutArrow: () => (tutStep >= 0 ? !!TUT[TUT_ORDER[tutStep]].arrow?.() : false),
    selectInfo, selectScreens,   // v1.2.49 选角重做（测试 / 截图）
    roster: () => roster, get curChar() { return curChar; }, storage, save, importSave, renderTitle, get selSlot() { return selSlot; }, set selSlot(v: number) { selSlot = v; renderTitle(); }, get saveBlocked() { return saveBlocked; }, get loadStatus() { return loadStatus; }, get playMs() { return playMs; }, codex, startSelected, pickClass,
    get skillBook() { return skillBook; }, openRaidMap, startRaidAuto, raidCleanup, raidWalk, raidLightPool, raidStepToward, raidStraight, raidBotGoal, raidRouteInfo, raidTeleport, mapStats, poisFor, wmHits: () => wmHits, bookDrop, swapBlocked, get blinked() { return blinked; }, renderSkillBook, togglePanel,
    packDungeon: { enter: enterPackDungeon, entry: packDungeonEntry, end: packDungeonEnd, state: packDungeonState, units: packDungeonUnits, defs: () => packDungeons().map(d => d.id), here: packDungeonHere },   // v1.2.16
    fxTest: { zone: spawnZoneFx, ring: spawnRing, storm: zoneStorm, sigil: vfxSigil }, fxScene: scene,   // v1.2.78 特效截图测试
    enterRaid, raidDebug, raidBossDev, raidBotTarget, get raidSafe() { return raidSafeSpot; }, openRaidGuide,
    goMap, useGate, ensureWild, dungeonLock, wilds, get waypoints() { return waypoints; }, openWaypoints, startRecall, get recall() { return recall; }, openBank, get bank() { return bank; }, worldEvents, startEvent, wildLock, recallDest, worldMapLegend,
    introActive, skipIntro, loadingDebug, envHdDebug,
    recState: () => ({ ...rec }), recLerp: lerpPose, recCam: camera,   // v1.2.38c
    addXp, abyFloorItems, abyMats, abyDarkOptions, abySetOptions,   // v0.9.6a；v1.2.38 第 10 层套装结算
    openDropGuide, renderDropGuide, get tryOn() { return tryOn; }, tryGuideItem, preview, showChangelog,
    get dungeonBest() { return dungeonBest; }, repairAll: repairAllNow,
    durability: { deathLoss: () => inventory.deathLoss() },
    sets: { setPity, activeSet4, raidSetDrop, get fxCount() { return variantFxCount; } },
    smith: { get exchange() { return exchange; }, openExchange, renderExchange, setX: setXState, dialogOpen: smithDialogOpen, closeDialog: closeSmithDialog, autoSellJunk, toggleLock: toggleLockUi },
    rawSave: () => (curChar ? storage.get(`darkrock_char_${curChar.id}`) : null),
    // v0.9.1 样板截图用：放一个不造成伤害的演示红圈
    VFX, BFX, M, setGrade: (n: string) => pipeline.setGrade(n), camLocked, toggleCamLock, applyCamMode, fxEmit: vfxEmit, fxWhirl: (d: number) => vfxWhirl(() => player.pos, 3, '#ffffff', d),
    fxDemoTele: (x: number, z: number, r: number, t: number) => { const mat = G.telegraphMaterial(); const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat)); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.05, z); scene.add(disc); telegraphs.set(900000 + Math.floor(Math.random() * 99999), { disc, mat, r, total: t, left: t } as never); },
    stow: { info: () => stowInfo(player.rig), force: (f?: 'drawn' | 'stowed') => stowForce(player.rig, f), clip: (n: string) => player.rig.anim?.clipName(n as never) ?? '', act: () => ({ age: player.rig.anim?.actAge ?? null, last: player.rig.anim?.lastAct ?? null }), combat: () => stowCombat, after: STOW_AFTER },   // v1.2.48
    floatCount: () => floats.length, gearSummary: () => gearSummary(player.rig), refreshGear, gearDebug, spawnLoot, floatPoolSize: () => floatPool.length + floats.length, combatText,
  };
}
loop();
boot();
