import { prewarmNote, perfMark } from './prewarm';   // v1.2.73b
import { SKILL4_LEVEL } from '../data/skills_v078';
import { setfxHits, setfxCast } from './setfx';
import { lgfxHits, lgfxCast } from './lgfx';
import { trigfxHits, trigfxCast } from './trigfx';
import { classExtCanCast, classExtCast, classExtHits, classExtFx, classExtHasFx, classExtProjectile, classExtSfx } from './classext';   // v1.0.6；v1.0.8 职业专属表现
// 技能释放：施法、冷却、普攻连击、技能命中结算
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindCasting(C) 初始化
import { resBeforeCast, resAfterCast, res } from './reshud';
import { resFreeUlt } from '../core/Resource';
import * as THREE from 'three';
import { VFXTEX } from './vfxtex.gen';   // 11-07 天神下凡贴图
import { withZoneStyle } from './zonestorm';   // v1.2.83
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
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef, CastContext } from '../core/types';
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
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import { bindTitle, CLASS_INFO, LOCKED_CLASSES, newLook, delArmed, MAP_NAME, fmtTime, slotMeta, renderTitle, pickClass, titleModel, demoSkill, swapPlayerModel, importSave, startSelected, startGame, startChar } from './title';
import { bindHudBar, potionReady, usePotion, mini, mctx, miniTimer, updateMinimap, updateCompassPip, tipEl, showTip, hideTip, skillTip, SKILL_KEYS, skillEls, dodgeHud, updateHUD, wildSubArea, fieldSubArea, updatePlates } from './hudbar';
import { bindShopMap, goldHtml, stacksHtml, ShopTab, openShop, renderShop, openTravel, WmView, wmView, wmMap, WORLD_NODES, mapLock, openWorldMap, toggleWorldMap, allTargets, MK_TEXT, worldMapLegend, renderWorldMap, wmCv, drawWorldMap } from './shopmap';
import { bindGuideUi, pinned, unpinned, focusId, npcName, trackedIds, focusQuestId, safe, trackKey, saveTrack, loadTrack, setFocus, toggleTrack, Guide, guide, guidePath, guideTimer, guideFor, arriveR, goalDist, updateGuide, autoPath, pendingArrive, resumeAuto, inCombatNow, startAutoPath, toggleAutoPath, onAutoArrive, onZoneChanged, renderTracker, CHEV_MAX, chevMesh, chevM4, chevQ, chevS, chevP, chevC, chevUp, onBridge, pathY, updatePathLine, objMarker, updateObjMarker } from './guideui';
import { bindPanels, applySettings, renderSettings, saveAgo, bagSel, itemSlotHtml, itemKind, STAT_LABEL, itemTip, statLine, doEquip, doUnequip, renderBag, renderBagTip, DOLL_LEFT, DOLL_RIGHT, DOLL_BOTTOM, slotSilhouette, dollSlot, preview, tryOn, renderChar, dgSrc, dgFilter, openDropGuide, tryGuideItem, renderDropGuide, ROMAN, talState, renderTalents, talentTip, renderTalentTip } from './panels';
import { bindTravel, waypoints, BANK_SIZE, BANK_KEY, loadBank, saveBank, wildLock, BASE_CAMPS, allCamps, showLoading, hideLoading, goPending, goMap, defaultArrive, useGate, checkWaypoints, openWaypoints, RECALL_TIME, recall, recallDest, startRecall, cancelRecall, updateRecall, openBank, renderBank, WorldEventState, worldEvents, updateWorldEvents, startEvent, spawnEventWave, finishEvent } from './travel';
import { bindTutorial, TutId, TUT_ORDER, tutStep, tutReplay, dummy, DUMMY_POS, tutD, tutWantsDummy, kc, menuBtn, TUT, tutStart, tutEnter, tutAdvance, tutFinish, tutClearCircle, tutEvent, tutTimer, updateTutorial, updateTutCircle, tutHls, renderTut, replayTutorial, spawnDummy } from './tutorial';
import { bindLootNpc, loots, spawnLoot, updateLoot, pickupReq, nearestLoot, clearLootInZone, Npc, spawnWildNpcs, npcs, addNpc, Interactable, currentInteractable } from './lootnpc';
import { arcBolt, shockHit, stormCell, boltElements, withBolt } from './arcbolt';   // v1.2.72
import { blizzardStorm } from './blizzard';   // v1.2.73
import { mageProjMake, mageArea } from './mage_fx';   // 11-17 法师专属魔法特效（未登记的技能@元素回退原画法）
import { bladestormFx, type BladestormFx } from './bladestorm';   // v1.2.73 剑刃风暴 v2
import { meteorTrail, meteorImpact, frostNova, avatarRise, thunderSlam, coneSweep, groundRupture, arcaneBind, blinkFx, sigil as vfxSigil, fx as vfxFx, live as vfxLive, groundMark } from './vfx';
import { bindEffects, fxList, addFx, spawnRing, spawnSlash, spawnWhirl, spawnPillar, spawnLightning, zonesFx, spawnZoneFx, ZONE_FX, updateFx, FloatKind, Floater, FLOAT_CAP, floatPool, floats, floatLane, escHtml, releaseFloater, showFloat, DMG_COLOR, floatText, combatText, v3, project, updateFloats } from './effects';
import type { Ctx, Enemy } from './main';
import { chronoCanPay, chronoExecute } from './chrono';
import { alchemyCanPay, alchemyExecute } from './alchemy';

let CX!: Ctx;

// ======================================================================
// 技能释放
// ======================================================================
export let ctx!: () => CastContext;

export const projectiles: { mesh: THREE.Object3D; tgt: Enemy; skill: ResolvedSkill; speed: number; spell: boolean; noSpin?: boolean }[] = [];
const norm2 = (x: number, z: number) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };

export const dist2d = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export function liveEnemies() { return CX.enemies.filter(e => e.alive && e.z === CX.zone && CX.isActive(e)); }

export function nearestEnemy(maxDist: number, exclude: Enemy[] = []) {
  let best: Enemy | null = null, bd = maxDist;
  for (const e of liveEnemies()) {
    if (exclude.includes(e)) continue;
    const d = dist2d(e.pos, CX.player.pos);
    if (e.isDummy && d > 8 && !tutWantsDummy()) continue;     // 训练假人：只在身边或引导需要时自动选中
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function tryCast(slot: SlotId) {
  prewarmNote('cast:' + slot);   // v1.2.73b 长帧探针上下文
  if (channel) return;   // v1.2.55b 引导中（剑刃风暴）不能放别的技能
  if (!CX.player.alive || CX.player.status.isStunned || CX.dash || !CX.started || CX.anyPanelOpen()) return;
  if (CX.loadout.cooldownLeft(slot, CX.T) > 0 && !(slot === 'ultimate' && resFreeUlt(res))) return;   // v0.7.5：怒气满 100 大招无视冷却
  if (slot === 'skill4' && CX.progression.level < SKILL4_LEVEL) { CX.toast(`第 4 技能槽 ${SKILL4_LEVEL} 级开放`); CX.audio.error(); return; }   // v0.7.8
  const pre = CX.loadout.preview(slot, ctx());
  if (!pre) return;
  if (!chronoCanPay(pre) || !alchemyCanPay(pre) || !classExtCanCast(pre)) return;   // v0.7.0 时砂行者：时砂不够
  const targeted = pre.shape === 'circle' && pre.tags.includes('targeted');   // 以目标为圆心的范围技能（陨星坠落等）
  const blink = pre.tags.includes('blink');   // v0.6.8 闪现：不需要目标
  const needsTarget = !blink && (targeted || pre.shape === 'single' || pre.shape === 'dash' || pre.shape === 'projectile' || pre.shape === 'cone' || pre.shape === 'line');
  if (needsTarget) {
    const dk = CX.target?.dgS ?? 1;   // 11-18 副本 ×1.5：怪体型变大，贴身余量跟着放大（技能本身射程不变）
    const range = pre.shape === 'single' && !pre.tags.includes('ranged') ? pre.stats.range + (CX.target?.isBoss ? 1.6 : 0.8) * dk : pre.stats.range + (CX.target?.isBoss ? 1 : 0) * dk;
    if (!CX.target || !CX.target.alive || CX.target.z !== CX.zone) CX.target = nearestEnemy(Math.max(range, 15));
    if (!CX.target) { if (slot !== 'basic') { CX.toast('没有目标'); CX.audio.error(); } return; }
    const d = dist2d(CX.target.pos, CX.player.pos);
    if (d > range) { if (slot !== 'basic') { CX.toast('距离太远'); CX.audio.error(); } return; }
  }
  resBeforeCast(slot, pre);   // v0.7.5：职业资源强化
  const cast = CX.loadout.tryCast(slot, ctx());
  resAfterCast(slot, cast);
  if (cast) { setfxCast(cast); lgfxCast(cast); trigfxCast(cast); classExtCast(cast); }   // v0.9.1m 套装；v0.9.1r 橙装
}

export let basicCombo = 0;

export function executeSkill(s: ResolvedSkill) {
  // 11-08：持续性技能（地面区域 / 引导）音效持续到效果结束
  const hold = Math.max(0, ...s.effects.map(e => (e.type === 'groundZone' ? (e as { duration?: number }).duration ?? 0 : 0)), s.tags.includes('channel') ? (s.stats as Partial<Record<string, number>>).duration ?? 0 : 0, s.baseId === 'bladestorm' ? CHANNEL.dur : 0);   // 11-08 剑刃风暴引导 6 秒
  const smp = CX.audio.skillSample(s.baseId, hold, s.element, s.tags.find(t => t === 'wolf' || t === 'bear' || t === 'eagle'));   // 11-13 I07 按契取样本   // 1107：技能音效样本（有就播，合成施法音随后静音）
  if (chronoExecute(s) || alchemyExecute(s)) return;   // v0.7.0 时砂行者的技能（web/chrono.ts）
  const el = CX.ELEMENT_COLOR[s.element];
  // 阶段四：技能音效按冷却分档（普攻 / 短冷却 / 长冷却·大招）
  const cd = s.stats.cooldown ?? 0;
  if (!smp) CX.audio.skillLayer(s.slot === 'basic' || cd <= 0.5 ? 0 : s.slot === 'ultimate' || cd >= 12 ? 2 : 1, s.element);
  const anim = CX.player.rig.anim;
  if (CX.target) CX.faceTo(CX.target.pos);
  const spell = s.tags.includes('spell');
  if (s.baseId === 'chain_lightning' && CX.target) { castChainLightning(s, CX.target); return; }   // v1.2.72 闪电链：折线电弧瞬连，不再是飞行光球
  if (spell && s.shape === 'single' && s.tags.includes('ranged') && CX.target) {
    // 远程单体法术（奥术禁锢）：发射弹体，命中时结算（含打断）
    anim?.play('shoot', 1.6);
    if (!classExtSfx('projectile', s)) CX.audio.castBolt(s.element);
    launchProjectile(CX.target, s, true, 0);
    return;
  }
  if (s.baseId === 'bladestorm') { startBladestorm(s); return; }   // v1.2.56 剑刃风暴改为 6 秒引导
  if (s.shape === 'circle' && s.tags.includes('targeted') && CX.target) { castTargetedCircle(s, CX.target); return; }
  if (s.tags.includes('blink')) { castBlink(s); return; }
  if ((s.shape === 'cone' || s.shape === 'line') && s.slot !== 'basic' && CX.target) { castArea(s, CX.target); return; }
  switch (s.shape) {
    case 'single': case 'cone': case 'line': {
      CX.swing = 0.25;
      anim?.play((['attack1', 'attack2', 'attack3'] as const)[basicCombo++ % 3], 1.6);
      if (!classExtSfx('melee', s)) CX.audio.swing();
      if (CX.target) { const tg = CX.target; const tp = tg.getPos(), pp = CX.player.getPos(); if (!classExtFx('melee', s, tp, norm2(tp.x - pp.x, tp.z - pp.z))) spawnSlash(el, basicCombo % 2 === 0); applyHits(s, [tg]); }   // 目标可能被打死置空，先存下来
      break;
    }
    case 'dash': {
      const tgt = CX.target!;
      const dir = new THREE.Vector3().subVectors(tgt.pos, CX.player.pos).setY(0).normalize();
      const to = tgt.pos.clone().addScaledVector(dir, -(tgt.isBoss ? 2.4 : 1.4));
      CX.dash = { from: CX.player.pos.clone(), to, t: 0, dur: s.tags.includes('leap') ? 0.32 : 0.18, skill: s, tgt };
      anim?.play('dash', 1.8);
      if (!classExtSfx('dash', s)) CX.audio.charge();
      classExtFx('dash', s, tgt.getPos(), { x: dir.x, z: dir.z });   // v1.0.8：at = 冲锋目标
      break;
    }
    case 'circle': {
      const isSpin = s.tags.includes('spin');
      CX.spin = isSpin ? 0.5 : 0; CX.swing = isSpin ? 0 : 0.3;
      const p0 = CX.player.getPos();
      if (s.slot === 'ultimate' && classExtFx('ultimate', s, p0)) {   // v1.0.8 职业专属大招表现
        anim?.play('heavy', 1.2);
        CX.feel.emit('ultimate'); if (!classExtSfx('ultimate', s)) CX.audio.ultimate();
      } else if (s.slot === 'ultimate') {
        anim?.play('heavy', 1.2);
        CX.feel.emit('ultimate'); CX.audio.ultimate();
        let mageUlt = false;
        if (s.baseId === 'war_banner') { plantBanner(p0, s); thunderSlam(p0, s.stats.radius * 0.6, el); }   // v1.2.86 战旗：真插一面旗（原来误放天神下凡的光柱 + 升腾）
        else if (s.baseId === 'avatar') avatarTitan(p0, s.stats.radius);   // 11-07 天神下凡样板（战士技能特效 §3）：不再用金色光柱 / 法阵
        else if (mageArea(s, { x: p0.x, y: G.gy(p0.x, p0.z), z: p0.z }, unitsInRadius(CX.world, p0, s.stats.radius, 'player') as Enemy[], null)) mageUlt = true;   // 11-17 法师专属大招（冰河时代）：不放金光柱 / 升腾 / 金环，结算仍走下面 applyHits
        else { spawnPillar(CX.player.pos, '#ffd34d'); avatarRise(() => CX.player.pos, s.stats.radius); }
        if (s.baseId !== 'avatar' && !mageUlt) { spawnRing(p0, s.stats.radius, el, 0.6); spawnRing(p0, s.stats.radius * 0.6, '#ffd100', 0.5);
          CX.particles.emit({ x: p0.x, y: 0.2, z: p0.z }, { count: 90, color: 0xffd34d, color2: 0xffffff, speed: 5, up: 2, radius: 1, life: 1.1, size: 0.4, gravity: 3, drag: 1 }); }
      } else if (spell) {
        // 霜环 / 炎环：以自身为中心的法术新星
        anim?.play('cast', 1.8);
        if (s.element === 'frost') CX.audio.frostNova(); else CX.audio.thunder();
        CX.feel.emit('heavy', 0.7);
        spawnRing(p0, s.stats.radius, el, 0.5); spawnRing(p0, s.stats.radius * 0.6, '#ffffff', 0.35);
        const c1 = new THREE.Color(el).getHex();
        CX.particles.emit({ x: p0.x, y: 0.3, z: p0.z }, { count: 80, color: c1, color2: 0xffffff, speed: 9, up: 0.25, radius: 0.5, life: 0.55, size: 0.4, drag: 2.5 });
        if (s.element === 'frost') { spawnIceShards(p0, s.stats.radius); frostNova(p0, s.stats.radius); }
        else { vfxSigil(p0, s.stats.radius, c1, 0.8); vfxFx(s.element === 'fire' ? 'flame' : 'spark', { x: p0.x, y: 0.3, z: p0.z }, { count: 30, color: 0xffffff, color2: c1, colorEnd: c1, radius: 0.4, ring: true, speed: s.stats.radius * 2.4, up: 0.3, life: 0.45, size: 0.8, sizeEnd: 0.2, drag: 2.5 }); }   // v0.9.1h 炎环等
      } else if (isSpin && classExtFx('spin', s, p0)) {
        anim?.play('spin', 1.4);
        if (!classExtSfx('spin', s)) CX.audio.whirl();
      } else if (isSpin) {
        anim?.play('spin', 1.4);
        CX.audio.whirl();
        spawnWhirl(el, s.stats.radius);
        CX.particles.emit({ x: p0.x, y: 0.15, z: p0.z }, { count: 30, color: 0x9c8a6a, speed: 4, up: 0.4, radius: s.stats.radius * 0.6, life: 0.6, size: 0.45 });
      } else if (classExtFx(s.tags.includes('slam') ? 'slam' : 'nova', s, p0)) {
        anim?.play('heavy', 1.5);
        if (!classExtSfx(s.tags.includes('slam') ? 'slam' : 'nova', s)) CX.audio.thunder();
        CX.feel.emit('heavy');
      } else {
        anim?.play('heavy', 1.5);
        CX.audio.thunder();
        CX.feel.emit('heavy');
        spawnRing(p0, s.stats.radius, el, 0.45); spawnRing(p0, s.stats.radius * 0.5, '#ffffff', 0.3);
        thunderSlam(p0, s.stats.radius, el);   // v0.9.1h 雷霆一击
        CX.particles.emit({ x: p0.x, y: 0.1, z: p0.z }, { count: 50, color: 0x8a7a66, color2: new THREE.Color(el).getHex(), speed: 6, up: 1, radius: 0.8, life: 0.7, size: 0.45, gravity: 8 });
        if (s.element === 'nature') for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28, r = Math.random() * s.stats.radius; spawnLightning(new THREE.Vector3(p0.x + Math.cos(a) * r, 8, p0.z + Math.sin(a) * r), new THREE.Vector3(p0.x + Math.cos(a) * r, 0, p0.z + Math.sin(a) * r)); }
      }
      variantFx(s, p0);   // v0.5 B：套装 4 件 / 暗金典藏的专属外观
      applyHits(s, unitsInRadius(CX.world, p0, s.stats.radius, 'player') as Enemy[]);
      break;
    }
    case 'projectile': {
      CX.swing = 0.25;
      if (spell) { anim?.play(s.slot === 'basic' ? 'shoot' : 'cast', s.slot === 'basic' ? 1.8 : 1.6); CX.audio.castBolt(s.element); }
      else { anim?.play(s.tags.includes('arrow') ? 'shoot' : 'attack3', 1.6); if (!classExtSfx('projectile', s)) CX.audio.projectile(); }   // 11-05 arrow 标签（猎手鹰形态弓）= 拉弓动作
      const n = Math.max(1, Math.round(s.stats.projectileCount));
      const tgts: Enemy[] = CX.target ? [CX.target] : [];
      while (tgts.length < n) { const e = nearestEnemy(s.stats.range, tgts); if (!e) break; tgts.push(e); }
      while (tgts.length < n && tgts.length) tgts.push(tgts[tgts.length % tgts.length]);
      tgts.forEach((tg, i) => launchProjectile(tg, s, spell, i));
      break;
    }
  }
}

/** v0.6.8：扇形（顺劈斩 / 震荡波）和直线（地震波）真正按范围命中 */
export function castArea(s: ResolvedSkill, tg: Enemy) {
  const el = CX.ELEMENT_COLOR[s.element];
  const p0 = CX.player.getPos();
  const dir = new THREE.Vector3(tg.pos.x - p0.x, 0, tg.pos.z - p0.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  const anim = CX.player.rig.anim;
  const hits = areaTargets(s, p0, dir);
  if (!hits.includes(tg) && tg.alive) hits.unshift(tg);   // 选中的目标在射程内总能打到
  if (classExtFx(s.shape === 'cone' ? 'cone' : 'line', s, p0, { x: dir.x, z: dir.z })) {   // v1.0.8 职业专属表现
    CX.swing = 0.3;
    anim?.play(s.shape === 'cone' && !s.tags.includes('slam') ? 'attack2' : 'heavy', 1.6);
    const own = classExtSfx(s.shape === 'cone' ? 'cone' : 'line', s);   // v1.0.9
    if (s.shape === 'line' || s.tags.includes('slam')) { if (!own) CX.audio.thunder(); CX.feel.emit('heavy', 0.8); } else if (!own) CX.audio.swing();
  } else if (s.shape === 'cone') {
    CX.swing = 0.3;
    anim?.play(s.tags.includes('slam') ? 'heavy' : 'attack2', 1.6);
    if (s.tags.includes('slam')) { CX.audio.thunder(); CX.feel.emit('heavy', 0.7); } else CX.audio.swing();
    spawnSlash(el, true); spawnSlash(el, false);
    coneSweep(p0, dir, s.stats.radius, el, s.tags.includes('slam'));   // v0.9.1h
    const r = s.stats.radius;
    for (let i = -3; i <= 3; i++) {
      const a = Math.atan2(dir.z, dir.x) + i * 0.17;
      CX.particles.emit({ x: p0.x + Math.cos(a) * r * 0.6, y: 0.4, z: p0.z + Math.sin(a) * r * 0.6 }, { count: 8, color: new THREE.Color(el).getHex(), color2: 0xffffff, speed: 3, up: 0.6, radius: 0.4, life: 0.5, size: 0.4, drag: 2 });
    }
  } else {
    anim?.play('heavy', 1.5);
    CX.audio.thunder(); CX.feel.emit('heavy', 0.8);
    const len = s.stats.range;
    for (let d = 1; d <= len; d += 1.2) {
      const c = { x: p0.x + dir.x * d, y: 0.1, z: p0.z + dir.z * d };
      const delay = d / len * 0.35;
      setTimeout(() => groundRupture(c, s.stats.radius, el), delay * 1000);   // v0.9.1h
      setTimeout(() => CX.particles.emit(c, { count: 10, color: 0x7a6a50, color2: new THREE.Color(el).getHex(), speed: 3, up: 3, radius: s.stats.radius * 0.4, life: 0.7, size: 0.5, gravity: 9 }), delay * 1000);
    }
    spawnRing({ x: p0.x + dir.x * len, z: p0.z + dir.z * len }, s.stats.radius, el, 0.4);
  }
  variantFx(s, p0);
  applyHits(s, hits);
}

/** 扇形：半径 radius、半角 60°；直线：长 range、半宽 radius */
export function areaTargets(s: ResolvedSkill, p0: Pos, dir: THREE.Vector3): Enemy[] {
  return liveEnemies().filter(e => {
    const dx = e.pos.x - p0.x, dz = e.pos.z - p0.z, along = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
    const pad = (e.isBoss ? 1.2 : 0.5) * (e.dgS ?? 1);   // 11-18 副本 ×1.5：体型余量
    if (s.shape === 'cone') { const d = Math.hypot(dx, dz); return d <= s.stats.radius + pad && (d < 1 || along / d >= 0.5); }
    return along >= -0.5 && along <= s.stats.range + pad && side <= s.stats.radius + pad;
  });
}

/** v0.6.8 闪现：原地奥术爆炸（打断 + 眩晕），然后向后（背离目标 / 面朝的反方向）闪 range 米，逐米检查碰撞 */
export function castBlink(s: ResolvedSkill) {
  const el = CX.ELEMENT_COLOR[s.element];
  const p0 = CX.player.getPos();
  CX.player.rig.anim?.play('cast', 2);
  if (!classExtSfx('blink', s)) CX.audio.element(s.element);   // v1.0.9 职业专属音效
  const ownFx = !!CX.cls.ext?.fx?.cast;   // v1.0.8：职业专属表现在落点一起画
  if (!ownFx) spawnRing(p0, s.stats.radius, el, 0.5), spawnRing(p0, s.stats.radius * 0.5, '#ffffff', 0.35);
  if (!ownFx) CX.particles.emit({ x: p0.x, y: 1, z: p0.z }, { count: 60, color: new THREE.Color(el).getHex(), color2: 0xffffff, speed: 5, up: 1.5, radius: 0.6, life: 0.6, size: 0.4, drag: 2 });
  variantFx(s, p0);
  applyHits(s, unitsInRadius(CX.world, p0, s.stats.radius, 'player') as Enemy[]);
  // v1.2.37a：闪现朝方向键 / 摇杆方向；没按方向 = 角色面朝方向（原来固定背离目标向后闪）
  const ry = CX.player.rig.root.rotation.y, mv = CX.inputDir();
  const dir = mv ? new THREE.Vector3(mv.x, 0, mv.z) : new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize();
  for (let i = 0; i < Math.round(s.stats.range * 2); i++) {
    const prev = { x: CX.player.pos.x, z: CX.player.pos.z };
    CX.player.pos.addScaledVector(dir, 0.5);
    CX.clampToZone(CX.player.pos, prev);
  }
  const p1 = CX.player.getPos();
  if (classExtFx('blink', s, p1, norm2(p1.x - p0.x, p1.z - p0.z))) { CX.blinked++; return; }   // v1.0.8
  blinkFx(p0, p1, el);   // v0.9.1h
  CX.particles.emit({ x: p1.x, y: 1, z: p1.z }, { count: 40, color: new THREE.Color(el).getHex(), color2: 0xffffff, speed: 3, up: 1, radius: 0.5, life: 0.5, size: 0.35, drag: 2 });
  CX.blinked++;
}

/** 发射弹体：法术是发光球（颜色=元素，分裂时左右散开），飞斧是旋转的斧头 */
export function launchProjectile(tg: Enemy, s: ResolvedSkill, spell: boolean, i: number) {
  const own = spell ? null : classExtProjectile(s, i);   // v1.0.8 职业专属弹体（羽刃 / 送行刀 / 噬魂兽……）
  const m = spell ? (mageProjMake(s, i) ?? M.makeOrb(CX.ELEMENT_COLOR[s.element], s.slot === 'basic' ? 0.17 : 0.26)) : own ? own.obj : M.makeAxe();   // 11-17 法师专属弹体
  const side = new THREE.Vector3(Math.cos(CX.player.rig.root.rotation.y), 0, -Math.sin(CX.player.rig.root.rotation.y)).multiplyScalar(((i % 3) - 1) * 0.6);
  m.position.copy(CX.player.pos).add(new THREE.Vector3(0, spell ? 1.5 : 1.4 + i * 0.15, 0)).add(side);
  const fromName = own?.obj.userData.launchFromObj as string | undefined;   // 11-14d 职业弹体可指定从手持物中心发出（猎手箭 = 弓的中间，原来固定 1.4 米 → 弓下缘）
  const src = fromName ? CX.player.rig.root.getObjectByName(fromName) : undefined;
  if (src) { src.updateWorldMatrix(true, true); const c = new THREE.Box3().setFromObject(src).getCenter(new THREE.Vector3()); if (Number.isFinite(c.y) && c.distanceTo(CX.player.pos) < 4) m.position.copy(c).add(side).y += i * 0.08; }
  CX.scene.add(m);
  projectiles.push({ mesh: m, tgt: tg, skill: s, speed: spell ? (s.slot === 'basic' ? 24 : 20) - i : 26 - i * 2, spell, noSpin: own ? !own.spin : undefined });
}

/** 以目标为圆心的范围法术：陨星坠落从天而降；其它（星界禁锢）直接在目标处爆开 */
export function castTargetedCircle(s: ResolvedSkill, tg: Enemy) {
  const el = CX.ELEMENT_COLOR[s.element];
  const c = tg.getPos();
  CX.player.rig.anim?.play(s.tags.includes('arrow') ? 'shoot' : 'castLong', 1.6);   // 11-05 猎手鹰形态：拉弓抛射
  const own = classExtFx('targeted', s, c, norm2(c.x - CX.player.pos.x, c.z - CX.player.pos.z));   // v1.0.8 职业专属表现（含从天而降的过程）
  if (own) {
    const go = () => { variantFx(s, c); const hs = unitsInRadius(CX.world, c, s.stats.radius, 'player') as Enemy[]; applyHits(s, hs); if (hs.length && s.tags.includes('arrow')) CX.audio.hitSample('h_arrow_hit');   /* 11-17 鹰契箭雨落地命中 */ CX.feel.emit(s.slot === 'ultimate' ? 'ultimate' : 'heavy', s.slot === 'ultimate' ? 1 : 0.8); };
    const snd = classExtSfx('targeted', s);   // v1.0.9
    if (s.slot === 'ultimate') { if (!snd) CX.audio.ultimate(); addFx(new THREE.Group(), 0.4, k => { if (k >= 1) go(); }); } else { if (!snd) CX.audio.element(s.element); go(); }
    return;
  }
  if (s.baseId === 'arcane_storm') { castArcaneStorm(s, tg); return; }   // v1.2.72 奥术风暴：瞬发 + 6 秒区域雷云落雷，不砸球、不铺地板
  if (s.baseId === 'blizzard' && (s.element === 'frost' || s.element === 'fire')) {   // v1.2.73 暴风雪接入 vfxlab 六层样板；「火雨」同结构换火焰色板（不再退回陨星画法）
    castBlizzard(s, c); return;
  }
  {   // 11-17 法师专属范围表现（寒焰交织 / DLC 钟律共鸣 · 渊海潮汐）：结算、区域与音效同原 hit()，只换画法
    const hits = unitsInRadius(CX.world, c, s.stats.radius, 'player') as Enemy[];
    const apply = (skip?: Element) => {
      const n0 = zonesFx.length, prev = ZONE_FX.skip; if (skip) ZONE_FX.skip = skip;
      try { variantFx(s, c); applyHits(s, hits); } finally { ZONE_FX.skip = prev; }
      return zonesFx.slice(n0).filter(z => z.el === skip).map(z => ({ x: z.p.x, z: z.p.z, r: z.r, dur: z.left }));
    };
    if (mageArea(s, { x: c.x, y: G.gy(c.x, c.z), z: c.z }, hits, apply)) {
      if (s.slot === 'ultimate') CX.audio.meteor(); else CX.audio.element(s.element);
      CX.feel.emit(s.slot === 'ultimate' ? 'ultimate' : 'heavy', s.slot === 'ultimate' ? 1 : 0.8);
      return;
    }
  }
  const hit = () => {
    variantFx(s, c);
    const rain = s.baseId === 'acid_cloud';   // v1.2.83 酸雨云：不再走奥术禁锢法阵，伤害区整段换成酸雨样式
    if (s.element === 'fire') meteorImpact(c, s.stats.radius); else if (!rain) arcaneBind(c, s.stats.radius, el);   // v0.9.1h
    if (rain) withZoneStyle('acidrain', () => applyHits(s, unitsInRadius(CX.world, c, s.stats.radius, 'player') as Enemy[]), true);
    else applyHits(s, unitsInRadius(CX.world, c, s.stats.radius, 'player') as Enemy[]);
    spawnRing(c, s.stats.radius, el, 0.6); spawnRing(c, s.stats.radius * 0.55, '#ffffff', 0.4);
    CX.particles.emit({ x: c.x, y: 0.3, z: c.z }, { count: 90, color: new THREE.Color(el).getHex(), color2: 0xffe0a0, speed: 7, up: 2.5, radius: 1, life: 0.9, size: 0.5, gravity: 5, drag: 1 });
    CX.feel.emit(s.slot === 'ultimate' ? 'ultimate' : 'heavy', s.slot === 'ultimate' ? 1 : 0.8);
  };
  if (s.slot === 'ultimate') {
    // v1.2.73 报告 5.2：延迟落点 0.5 → 1.5 秒，带预兆：前 0.9 秒天空亮起火光、地面预警渐浓，最后 0.6 秒陨石划落
    const DELAY = METEOR_DELAY, FALL = 0.6;
    const rock = M.makeOrb(el, 0.7); rock.visible = false;
    const from = G.lift({ x: c.x - 6, z: c.z - 6 }, 16), to = G.lift(c, 0.5);
    const warn = M.makeDisc(el, 0.25, s.stats.radius); warn.position.set(c.x, G.gy(c.x, c.z) + 0.06, c.z);
    addFx(warn, DELAY, k => { (warn.material as THREE.MeshBasicMaterial).opacity = 0.08 + k * 0.32 + 0.06 * Math.sin(k * DELAY * 14); });
    const omen = M.makeOrb(el, 1.6); omen.position.copy(from);
    addFx(omen, DELAY - FALL, k => { omen.scale.setScalar(0.3 + k * 0.9);
      if (Math.random() < 0.5) CX.particles.emit({ x: from.x, y: from.y, z: from.z }, { count: 3, color: new THREE.Color(el).getHex(), color2: 0xffe0a0, speed: 1.5, up: 0, radius: 1.2, life: 0.5, size: 0.4, drag: 1 }); });
    CX.audio.meteor();
    addFx(new THREE.Group(), DELAY - FALL, k => { if (k < 1) return; rock.visible = true;
      addFx(rock, FALL, kk => {
        rock.position.lerpVectors(from, to, kk * kk);
        meteorTrail(rock.position);
        if (kk >= 1) hit();
      }); });
  } else { CX.audio.element(s.element); hit(); }
}

/** v1.2.72 闪电链：杖头电荷 → 0.05 秒后电弧瞬连首目标并结算；弹射由 onChain 画（同一组电束颜色） */
export function castChainLightning(s: ResolvedSkill, tg: Enemy) {
  const els = boltElements(s.baseId, s.element, s.elements);
  CX.player.rig.anim?.play('shoot', 1.8);
  CX.audio.castBolt('nature');
  const hand = CX.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
  for (let i = 0; i < 2; i++) arcBolt({ x: hand.x + (Math.random() - 0.5) * 0.3, y: hand.y + Math.random() * 0.2, z: hand.z + (Math.random() - 0.5) * 0.3 }, { x: hand.x + (Math.random() - 0.5) * 0.3, y: hand.y + 0.1, z: hand.z + (Math.random() - 0.5) * 0.3 }, { els, life: 0.1, width: 0.02, branches: 0 });
  addFx(new THREE.Group(), 0.05, k => {
    if (k < 1 || !tg.alive) return;
    const to = tg.pos;
    arcBolt(hand, { x: to.x, y: to.y + 1.1, z: to.z }, { els, life: 0.5, width: 0.08, branches: 3 });   // v1.2.73 电弧挂 0.5 秒（原 0.12 一闪就没），再补两次复闪
    for (const dly of [0.16, 0.32]) addFx(new THREE.Group(), dly, kk => { if (kk >= 1 && tg.alive) arcBolt(CX.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), { x: tg.pos.x, y: tg.pos.y + 1.1, z: tg.pos.z }, { els, life: 0.3, width: 0.06, branches: 2 }); });
    withBolt(els, () => { applyHits(s, [tg]); shockHit(to, els, true); });
  });
}

/** v1.2.72 奥术风暴：瞬发；0.3 秒卷起雷云，首击时按数据结算（伤害 + 弹射 + 地面区域），之后 6 秒持续落雷（纯视觉，优先劈区域内敌人） */
export function castArcaneStorm(s: ResolvedSkill, tg: Enemy) {
  const els = boltElements(s.baseId, s.element, s.elements);
  const c = tg.getPos();
  CX.player.rig.anim?.play('castLong', 1.8);
  CX.audio.ultimate();
  const r = s.stats.radius;
  stormCell(c, r, {
    els, dur: 6,
    pick: () => {
      const es = (unitsInRadius(CX.world, c, r, 'player') as Enemy[]).filter(e => e.alive);
      if (!es.length || Math.random() < 0.25) return null;
      const e = es[Math.floor(Math.random() * es.length)], p = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
      shockHit(p, els, false);
      return p;
    },
    onFirst: () => {
      withBolt(els, () => { variantFx(s, c); applyHits(s, unitsInRadius(CX.world, c, r, 'player') as Enemy[], c); });   // v1.2.73 伤害区圆心 = 雷云中心
      CX.feel.emit('ultimate', 1);
    },
  });
}

/** v1.2.86 战旗：旗从 2.6 米处 0.16 秒砸进地里（缓入）+ 碎土 + 旗面摆动；持续 = 地面区域时长，最后 0.6 秒下沉收起。旗面颜色随元素（物理 = 战士暗红） */
function plantBanner(p0: Pos, s: ResolvedSkill) {
  const dur = (s.effects.find(e => e.type === 'groundZone') as { duration: number } | undefined)?.duration ?? 8;
  const col = s.element === 'physical' ? 0x8a2418 : new THREE.Color(CX.ELEMENT_COLOR[s.element]).multiplyScalar(0.8).getHex();
  const b = M.makeBanner(col), cloth = b.getObjectByName('cloth'), y0 = G.gy(p0.x, p0.z) - 0.35;
  b.position.set(p0.x + 0.4, y0 + 2.6, p0.z - 0.3); b.rotation.y = Math.random() * 6.28;
  let landed = false;
  addFx(b, dur, k => {
    const t = k * dur;
    if (t < 0.16) { const q = t / 0.16; b.position.y = y0 + 2.6 * (1 - q * q); }
    else { if (!landed) { landed = true; b.position.y = y0;
        CX.particles.emit({ x: b.position.x, y: 0.15, z: b.position.z }, { count: 26, color: 0x6a5a40, color2: 0x3a3020, speed: 4, up: 2.6, radius: 0.3, life: 0.7, size: 0.3, gravity: 12 });
        vfxFx('spark', { x: b.position.x, y: 0.3, z: b.position.z }, { count: 16, color: 0xffd080, color2: 0xff9a3c, radius: 0.2, ring: true, speed: 5, up: 0.6, life: 0.35, size: 0.35, sizeEnd: 0.05 }); }
      const sink = t > dur - 0.6 ? (t - (dur - 0.6)) / 0.6 : 0; b.position.y = y0 - 3.2 * sink * sink; }
    if (cloth) { cloth.rotation.y = Math.sin(CX.T * 2.3) * 0.28 + Math.sin(CX.T * 5.1) * 0.08; }
    if (k >= 1) b.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  });
}

/** v1.2.73 暴风雪 / 火雨：瞬发；表现 = blizzardStorm（半径取 s.stats.radius、时长取伤害区数据）；伤害区圆心在目标点，不再另画 spawnZoneFx 冰面 */
export function castBlizzard(s: ResolvedSkill, c: Pos) {
  const fire = s.element === 'fire';
  CX.player.rig.anim?.play('cast', 2.2); if (fire) CX.audio.element('fire'); else CX.audio.frostNova(); CX.feel.emit('heavy', 0.5);
  const zone = s.effects.find(e => e.type === 'groundZone' && e.element === s.element) as { duration: number } | undefined;
  const els: Element[] = [s.element, ...(s.elements ?? []).filter(x => x !== s.element)];
  blizzardStorm(c, s.stats.radius, zone?.duration ?? 8, els, innerHeight || 720);
  variantFx(s, c);
  ZONE_FX.skip = s.element;   // 本体区域的表现已由 blizzardStorm 画；其它元素的附加区域（如火雨符文的燃烧地面）照常
  try { applyHits(s, unitsInRadius(CX.world, c, s.stats.radius, 'player') as Enemy[], c); } finally { ZONE_FX.skip = null; }
}

/** 霜环的冰刺：一圈向外倾斜的冰晶，0.8 秒后碎掉 */
export function spawnIceShards(p: Pos, r: number) {
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 4), G.glow(0x9fe8ff, 1.4, { transparent: true, opacity: 0.85 }));
    M.noOutline(m);
    m.position.set(p.x + Math.cos(a) * r * 0.75, G.gy(p.x + Math.cos(a) * r * 0.75, p.z + Math.sin(a) * r * 0.75) + 0.4, p.z + Math.sin(a) * r * 0.75);
    m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    addFx(m, 0.8, k => { m.scale.setScalar(k < 0.15 ? k / 0.15 : 1); (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - Math.max(0, k - 0.6) / 0.4); });
  }
}

/** v0.5 B：套装 4 件 / 暗金典藏改过的技能多一层专属特效（修饰器加的 fx_ 标签决定） */
export let variantFxCount = 0;
export function variantFx(s: ResolvedSkill, p: Pos) {
  const has = (t: string) => s.tags.includes(t);
  const ring = (r: number, c: string, d: number) => spawnRing(p, r, c, d);
  const burst = (color: number, color2: number, n: number, up: number, speed: number) => CX.particles.emit({ x: p.x, y: 0.2, z: p.z }, { count: n, color, color2, speed, up, radius: s.stats.radius * 0.5, life: 0.9, size: 0.45, gravity: 4, drag: 1 });
  let hit = true;
  if (has('fx_blood')) { ring(s.stats.radius * 1.05, '#ff2030', 0.7); ring(s.stats.radius * 0.65, '#a00818', 0.55); burst(0xc01020, 0xff6060, 70, 2.5, 5); }   // v0.9.1m 血刃旋风斩
  else if (has('fx_lava')) { ring(s.stats.radius * 1.05, '#ff5a10', 0.7); ring(s.stats.radius * 0.7, '#ffb040', 0.55); burst(0xff4a10, 0xffd060, 70, 2.5, 5); }
  else if (has('fx_permafrost')) { ring(s.stats.radius, '#bfe8ff', 0.8); spawnIceShards(p, s.stats.radius * 1.15); spawnIceShards(p, s.stats.radius * 0.6); burst(0x9fe8ff, 0xffffff, 60, 1, 6); }
  else if (has('fx_sunder')) { ring(s.stats.radius, '#d8a050', 0.7); ring(s.stats.radius * 0.5, '#ffc040', 0.5); burst(0x6a5040, 0xffc040, 80, 3, 7); CX.feel.emit('heavy', 0.6); }
  else if (has('fx_abyss')) { spawnPillar(CX.player.pos, '#a040ff'); ring(s.stats.radius * 0.8, '#ff7a20', 0.8); burst(0x5a1a7a, 0xff7a20, 70, 3, 4); }
  else if (has('fx_frostheart')) { ring(s.stats.radius, '#9fe8ff', 0.9); spawnIceShards(p, s.stats.radius * 0.8); burst(0xbfe8ff, 0xffffff, 80, 3, 6); }
  else if (has('fx_voidscale')) { ring(4, '#60a0ff', 0.6); burst(0x3050c0, 0xa0c8ff, 50, 2, 6); }
  else hit = false;
  if (hit) variantFxCount++;
}

export function applyHits(s: ResolvedSkill, hits: Enemy[], center?: Pos) {   // v1.2.73 center：目标点技能的地面区域圆心
  s = setfxHits(s, hits.filter(h => h.alive));   // v0.9.1m 套装 2/4/6 件
  s = lgfxHits(s, hits.filter(h => h.alive));    // v0.9.1r 橙装钩子
  s = trigfxHits(s, hits.filter(h => h.alive));  // v1.2.35 可控触发（替代低血条件）
  s = classExtHits(s, hits.filter(h => h.alive));   // v1.0.6 内容包职业
  if (s.tags.includes('fx_voidscale') && hits[0]) variantFx(s, hits[0].getPos());
  const live = hits.filter(h => h.alive);
  if (!live.length && !s.effects.some(e => e.type === 'reflect' || (center && e.type === 'groundZone'))) return;   // 盾墙：身边没有敌人也要给自己加增益；v1.2.73 目标点区域（暴风雪）没打到人也铺下
  CX.castStat.hits = 0; CX.castStat.crit = false;
  { const t0 = performance.now(); CX.fx.applySkill(s, CX.player, live, center); perfMark('skill:' + s.baseId + 'x' + live.length, t0, 12); }   // 11-19 C21 stutterlog：技能结算（伤害 + 命中特效）CPU 耗时
  // 顿帧：暴击（任何技能）或近战命中，每次施法只顿一次；重击/终极已在释放时触发
  if (CX.castStat.hits) {
    const melee = !s.tags.includes('spell') && !s.tags.includes('ranged') && s.shape !== 'projectile';
    { const fd = CX.target && CX.target.alive ? { x: CX.target.pos.x - CX.player.pos.x, z: CX.target.pos.z - CX.player.pos.z } : undefined;   // v1.2.56 震屏沿攻击方向
      if (CX.castStat.crit) { CX.feel.emit('crit', 1, fd); prewarmNote('feel:crit'); } else if (melee) { CX.feel.emit('hit', 1, fd); prewarmNote('feel:hit'); } }
  }
  if (live.some(h => h.isDummy)) tutEvent('dummyHit', s.slot);
  const kb = s.effects.find(e => e.type === 'knockback');
  if (kb && kb.type === 'knockback') for (const h of live) {
    if (!h.alive || h.isBoss) continue;
    const dir = new THREE.Vector3().subVectors(h.pos, CX.player.pos).setY(0).normalize();
    h.pos.addScaledVector(dir, kb.distance);
  }
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindCasting(__ctx: Ctx) {
  CX = __ctx;
  ctx = () => ({ now: CX.T, casterHpPercent: CX.player.hp / CX.player.maxHp, targetEffects: CX.target?.status.kinds() ?? [], targetHpPercent: CX.target?.alive ? CX.target.hp / CX.target.maxHp : undefined });
}

// ---------------------------------------------------------------- v1.2.56 引导技能：剑刃风暴
// 6 秒引导：可以移动；不能翻滚、不能放别的技能；免控（不会被打断）；每 0.5 秒对身边造成一次伤害，结束时一记收尾爆发（带原技能的流血 / 回血效果）。
// 伤害总量与原来一次性的剑刃风暴相同（12 跳 × 6% + 收尾 48% = 120%），平衡测试不变。
/** v1.2.73 陨星坠落延迟落点（报告 5.2）：1.5 秒 */
export const METEOR_DELAY = 1.5;
export const CHANNEL = { dur: 6, tick: 0.5, tickShare: 0.06, finalShare: 0.48, pull: 0.5 };
export let channel: { skill: ResolvedSkill; t: number; next: number; ccWas: boolean; vfx: BladestormFx | null } | null = null;
export const channelActive = () => !!channel;
export function startBladestorm(s: ResolvedSkill) {
  stopChannel(false);
  // v1.2.73 剑刃风暴 v2：跟随玩家、整段引导、半径 = s.stats.radius、色板随元素、流血层数驱动红线（职业扩展自带表现时不画）
  const ext = classExtHasFx();   // v1.2.76 只查职业扩展有没有自带表现，不再借 classExtFx 试探（试探会先画一次，第 0 跳又画一次）
  const hasBleed = s.effects.some(e => e.type === 'dotStack' && e.element === 'physical');
  const vfx = ext ? null : bladestormFx(() => CX.player.getPos(), s.stats.radius, CHANNEL.dur, s.element, hasBleed, () => bleedStacksNear(s), innerHeight || 720);
  channel = { skill: s, t: 0, next: 0, ccWas: CX.player.ccImmune, vfx };
  CX.player.ccImmune = true;
  CX.feel.emit('ultimate', 0.6); CX.audio.ultimate();
  const el = CX.ELEMENT_COLOR[s.element];
  CX.particles.emit({ x: CX.player.pos.x, y: 0.2, z: CX.player.pos.z }, { count: 40, color: 0x9c8a6a, color2: new THREE.Color(el).getHex(), speed: 5, up: 0.8, radius: 1, life: 0.6, size: 0.4, drag: 1.5 });
  const me = channel; addFx(new THREE.Group(), CHANNEL.dur, k => { if (channel === me) tickChannel(k); });
}
function tickChannel(k: number) {
  const c = channel; if (!c) return;
  if (!CX.player.alive || !CX.started) { stopChannel(false); return; }
  const dt = Math.max(0, k * CHANNEL.dur - c.t);
  c.t = k * CHANNEL.dur;
  CX.spin = 0.5;
  // v1.2.73 报告 5.2：轻吸怪——半径内非首领敌人以 0.5 米/秒卷向自己，贴到 1.2 米为止
  if (dt > 0) { const p0 = CX.player.pos, r = c.skill.stats.radius;
    for (const e of unitsInRadius(CX.world, CX.player.getPos(), r, 'player') as Enemy[]) {
      if (!e.alive || e.isBoss || e.ccImmune) continue;
      const dx = p0.x - e.pos.x, dz = p0.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.2) { const m = Math.min(CHANNEL.pull * dt, d - 1.2) / d; e.pos.x += dx * m; e.pos.z += dz * m; }
    } }
  while (c.t >= c.next && c.next < CHANNEL.dur - 1e-6) {
    const s = c.skill, el = CX.ELEMENT_COLOR[s.element], p0 = CX.player.getPos();
    CX.player.rig.anim?.play('spin', 1.6);
    if ((c.next / CHANNEL.tick) % 2 === 0) CX.audio.whirl();
    if (!c.vfx && !classExtFx('spin', s, p0)) spawnWhirl(el, s.stats.radius);   // v2 特效在跑时不再叠旧旋风圈
    const tickSkill: ResolvedSkill = { ...s, stats: { ...s.stats, damage: s.stats.damage * CHANNEL.tickShare }, effects: s.effects.filter(e => e.type !== 'dot' && e.type !== 'heal') };
    applyHits(tickSkill, unitsInRadius(CX.world, p0, s.stats.radius, 'player') as Enemy[]);
    c.next += CHANNEL.tick;
  }
  if (c.t >= CHANNEL.dur - 1e-6) stopChannel(true);
}
/** v1.2.73 剑刃风暴 v2：半径内敌人身上本技能叠层流血的最高层数（0~5），只读不改数值 */
function bleedStacksNear(s: ResolvedSkill): number {
  let n = 0;
  for (const e of unitsInRadius(CX.world, CX.player.getPos(), s.stats.radius, 'player') as Enemy[]) if (e.alive) n = Math.max(n, e.status.stacks(`dsk:${s.baseId}`));
  return n;
}
/** 结束引导：finish = 正常结束（放收尾爆发）；死亡 / 换场景 = 直接收掉 */
export function stopChannel(finish: boolean) {
  const c = channel; if (!c) return; channel = null;
  CX.player.ccImmune = c.ccWas; CX.spin = 0;
  c.vfx?.stop(finish);
  if (!finish) return;
  const s = c.skill, el = CX.ELEMENT_COLOR[s.element], p0 = CX.player.getPos();
  CX.player.rig.anim?.play('heavy', 1.4);
  CX.feel.emit('ultimate'); CX.audio.thunder();
  if (!c.vfx) { spawnRing(p0, s.stats.radius, el, 0.55); spawnRing(p0, s.stats.radius * 0.6, '#ffd100', 0.45); }   // v2 用自带的不规则收尾冲击，不画正圆环
  thunderSlam(p0, s.stats.radius, el);
  CX.particles.emit({ x: p0.x, y: 0.2, z: p0.z }, { count: 90, color: 0x8a7a66, color2: new THREE.Color(el).getHex(), speed: 8, up: 1.4, radius: 1, life: 0.8, size: 0.45, gravity: 6, drag: 1 });
  variantFx(s, p0);
  applyHits({ ...s, stats: { ...s.stats, damage: s.stats.damage * CHANNEL.finalShare } }, unitsInRadius(CX.world, p0, s.stats.radius, 'player') as Enemy[]);
}

// ---------------------------------------------------------------- 11-07 天神下凡样板（02_工程包/01_开发/技能特效设计/01_职业/战士 §3 天神下凡）
// 变身 15 秒：0.3 秒放大到 120%（表现层 rig.root 缩放，不改判定）→ 每两步脚下尘浪 + 裂纹（上限 8 张）→ 结束 1 秒回落 + 白汽。
// 开场：龟裂贴花 + 6 米冲击尘浪 + 翘起碎石雨 + 热气。色板：尘土 / 玄武岩 / 暗铜，删除全部金色。重复释放只刷新时长，不叠缩放。
// 贴图 avatar/crack · avatar/dust · avatar/rock（vfxtex.gen.ts，gpt-image-2 2048，Rhett 11-07 23:49 批）
const AVATAR = { dur: 15, scale: 1.2, grow: 0.3, step: 2.2, marks: 8 };
let avatarLive: { t: number; base: number } | null = null;
const avTexC = new Map<string, THREE.Texture>();
function avTex(id: string, cell = -1): THREE.Texture {
  const k = id + ':' + cell; let t = avTexC.get(k); if (t) return t;
  const src = avTexC.get(id + ':-1') ?? (() => { const b = new THREE.TextureLoader().load(VFXTEX[id]); b.colorSpace = THREE.SRGBColorSpace; b.anisotropy = 4; avTexC.set(id + ':-1', b); return b; })();
  if (cell < 0) return src;
  t = src.clone(); t.repeat.set(0.5, 0.5); t.offset.set((cell % 2) * 0.5, cell < 2 ? 0.5 : 0); t.needsUpdate = true; avTexC.set(k, t); return t;
}
/** 地面贴花：淡入 0.08 秒，后 40% 时长淡出 */
function avDecal(p: { x: number; y: number; z: number }, size: number, dur: number, peak = 1) {
  if (!VFXTEX['avatar/crack']) { groundMark(p, 'crack', size * 0.5, dur); return; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: avTex('avatar/crack'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0 }));
  m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2); m.position.set(p.x, p.y + 0.04, p.z); m.renderOrder = 2;
  const mat = m.material as THREE.MeshBasicMaterial;
  vfxLive(m, dur, (k) => { const t = k * dur; mat.opacity = peak * Math.min(1, t / 0.08) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4); });
}
/** 尘浪：向外推开、渐大、渐淡的尘雾面片 */
function avDust(p: { x: number; y: number; z: number }, n: number, r: number, size: number, life: number, tint = 0xffffff) {
  if (!VFXTEX['avatar/dust']) return;
  const g = new THREE.Group(), parts: { s: THREE.Sprite; vx: number; vz: number; vy: number; s0: number }[] = [];
  const nn = Math.max(3, Math.round(n * (CX.isMobile ? 0.5 : 1)));
  for (let i = 0; i < nn; i++) {
    const a = (i / nn) * Math.PI * 2 + Math.random() * 0.4, sp = r / life * (0.7 + Math.random() * 0.5);
    const mat = new THREE.SpriteMaterial({ map: avTex('avatar/dust'), color: tint, transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * 6.28 });
    const s = new THREE.Sprite(mat); s.position.set(p.x + Math.cos(a) * 0.3, p.y + size * 0.3, p.z + Math.sin(a) * 0.3);
    const s0 = size * (0.7 + Math.random() * 0.5); s.scale.setScalar(s0); g.add(s);
    parts.push({ s, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.3 + Math.random() * 0.5, s0 });
  }
  vfxLive(g, life, (k, dt) => { const drag = Math.exp(-2.2 * dt);
    for (const q of parts) { q.s.position.x += q.vx * dt; q.s.position.z += q.vz * dt; q.s.position.y += q.vy * dt; q.vx *= drag; q.vz *= drag;
      q.s.scale.setScalar(q.s0 * (1 + 1.4 * k)); (q.s.material as THREE.SpriteMaterial).opacity = 0.85 * Math.min(1, k / 0.08) * (1 - k) ** 1.4; } });
}
/** 碎石雨：四格碎石图集，抛物线 + 自转 */
function avRocks(p: { x: number; y: number; z: number }, n: number, r: number) {
  if (!VFXTEX['avatar/rock']) return;
  const g = new THREE.Group(), parts: { s: THREE.Sprite; v: THREE.Vector3; spin: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.5;
    const mat = new THREE.SpriteMaterial({ map: avTex('avatar/rock', i % 4), transparent: true, alphaTest: 0.35, depthWrite: true });
    const s = new THREE.Sprite(mat); s.position.set(p.x + Math.cos(a) * d, p.y + 0.2, p.z + Math.sin(a) * d); s.scale.setScalar(0.25 + Math.random() * 0.45); g.add(s);
    parts.push({ s, v: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 3), 5 + Math.random() * 5, Math.sin(a) * (1.5 + Math.random() * 3)), spin: (Math.random() - 0.5) * 10 });
  }
  vfxLive(g, 1.6, (k, dt) => { for (const q of parts) { if (q.s.position.y < p.y + 0.05 && q.v.y < 0) { q.v.set(0, 0, 0); q.spin = 0; }
    q.v.y -= 18 * dt; q.s.position.addScaledVector(q.v, dt); if (q.s.position.y < p.y + 0.05) q.s.position.y = p.y + 0.05;
    const m = q.s.material as THREE.SpriteMaterial; m.rotation += q.spin * dt; m.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25; } });
}
function avatarTitan(p0: Pos, r: number) {
  const y = CX.player.pos.y, c = { x: p0.x, y, z: p0.z };
  avDecal(c, Math.max(4, r * 1.25), 6);
  groundRupture(p0, r, 0x5a4a3a);
  avDust(c, 16, r, 2.6, 1.5, 0xc8b8a0);
  avRocks(c, 26, r);
  vfxFx('smoke', { x: p0.x, y: y + 0.3, z: p0.z }, { count: 40, color: 0x7a6a58, colorEnd: 0x4a4038, radius: r * 0.25, speed: r * 1.1, up: 0.8, life: 1.4, size: 1.4, sizeEnd: 2.6, drag: 1.6, ring: true });
  vfxFx('smoke', { x: p0.x, y: y + 1.2, z: p0.z }, { count: 18, color: 0x8a7a6a, radius: 0.8, speed: 1, up: 1.6, life: 1.6, size: 1.2, sizeEnd: 2.2, drag: 1 });   // 甲片缝隙热气
  if (avatarLive) { avatarLive.t = 0; return; }
  const root = CX.player.rig.root, base = root.scale.x; avatarLive = { t: 0, base };
  let last = CX.player.pos.clone(), walked = 0, steps = 0, marks = 0, ended = false;
  vfxLive(new THREE.Object3D(), 9999, (_k, dt) => {
    const L = avatarLive; if (!L || ended) return;
    L.t += dt; const t = L.t, end = AVATAR.dur;
    const k = t < AVATAR.grow ? t / AVATAR.grow : t < end ? 1 : Math.max(0, 1 - (t - end) / 1);
    root.scale.setScalar(base * (1 + (AVATAR.scale - 1) * (1 - Math.pow(1 - k, 3))));
    if (t < end && CX.player.alive) {
      const p = CX.player.pos, d = Math.hypot(p.x - last.x, p.z - last.z); last.copy(p); walked += d;
      if (walked >= AVATAR.step && d < 3) { walked = 0; steps++;
        avDust(p, 5, 1.2, 1.1, 0.9, 0xb8a890);
        if (steps % 2 === 0 && marks < AVATAR.marks) { marks++; avDecal(p, 1.6, 6, 0.85); } }
    } else if (t >= end && t - dt < end) {
      const p = CX.player.pos; vfxFx('smoke', { x: p.x, y: p.y + 1.6, z: p.z }, { count: 24, color: 0xe8e4dc, colorEnd: 0x9a948c, radius: 0.4, speed: 0.8, up: 1.4, life: 1.4, size: 0.9, sizeEnd: 2, drag: 1 });   // 回落喘气白汽
    }
    if (t >= end + 1 || !CX.player.alive) { root.scale.setScalar(base); avatarLive = null; ended = true; }
  });
}
