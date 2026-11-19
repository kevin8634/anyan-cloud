// 战斗事件：受伤、死亡、经验、顿帧与飘字触发
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindCombatEvents(C) 初始化
import { packXp, packGold, packEvent } from './packrt';
import { achOnKill, achOnDeath } from './codex_ui';
export const RAID_BOSS_GOLD_MUL = 4;
import { awakenBossKill } from './awaken_ui';
import { resHit, resHurt } from './reshud';
import { spiritOnKill } from './spirit_ui';
import * as THREE from 'three';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { CondFlags } from '../core/CondFlags';
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
import { elementHit, enemyDeath, hitMatOf, HitMat } from './vfx';
import { bindEffects, fxList, addFx, spawnRing, spawnSlash, spawnWhirl, spawnPillar, spawnLightning, zonesFx, spawnZoneFx, updateFx, FloatKind, Floater, FLOAT_CAP, floatPool, floats, floatLane, escHtml, releaseFloater, showFloat, DMG_COLOR, floatText, combatText, v3, project, updateFloats } from './effects';
import { bindCasting, ctx, projectiles, dist2d, liveEnemies, nearestEnemy, tryCast, basicCombo, executeSkill, launchProjectile, castTargetedCircle, spawnIceShards, applyHits } from './casting';
import { raidDeathText, raidName } from './raid';
import { tagByTable } from './loottag';
import { afterPlayerDeath } from './durability_ui';
import { bookDrop } from './skillbook_ui';
import { noteBossKill } from './mappoi';
import { chronoFrozen } from './chrono';
import { wbOnDeath } from './worldboss';
import { packBossOnDeath } from './packboss';
import { repOnKill } from './regional';
import type { Ctx, Enemy, Unit } from './main';

let CX!: Ctx;
   // → travel.ts
// ======================================================================
// 战斗事件
// ======================================================================
/** 本次技能结算的命中统计：applyHits 用它决定顿帧（每次施法只顿一次） */
export const castStat = { hits: 0, crit: false };

export function onUnitDamaged(u: Unit, amount: number, el: Element, src: CombatUnit | null, crit: boolean, tick: boolean) {
  if (u === CX.player) {
    combatText(u, tick ? 'tick' : 'hurt', amount, el);
    if (tick) return;
    resHurt(amount);   // v0.7.5：怒气
    flash(u, 0xff2020); CX.audio.playerHurt();
    if (amount > CX.player.maxHp * 0.12) CX.feel.emit('hurt', Math.min(2, amount / (CX.player.maxHp * 0.12)));
    impactFx({ x: CX.player.pos.x, y: 1.1, z: CX.player.pos.z }, el, false, { small: true, poison: el === 'nature' });
    return;
  }
  const e = u as Enemy;
  combatText(u, tick ? 'tick' : crit ? 'crit' : 'dmg', amount, el);
  if (tick) {
    // 持续伤害：只冒一点元素粒子，不放打击音效
    impactFx({ x: e.pos.x, y: 1.1 * e.rig.scale, z: e.pos.z }, el, false, { small: true, tick: true, poison: el === 'nature' && src !== CX.player });
  } else {
    flash(u, 0xffffff);
    hitFx(e, el, crit);
  }
  if (src === CX.player) {
    e.brain.provoke(); if (!CX.target || !CX.target.alive) CX.target = e;
    if (!tick) {
      rendHit(e, amount, el);   // v1.2.58 天赋 3.0 裂伤关键：撕裂 / 深创
      if (crit && fireAlias.has(el) && e.alive && (CX.tree?.rank('mf_k_blaze') ?? 0)) blazeHit(e, amount, el);   // 炽焰关键：炽燃
      if (crit && (CX.tree?.rank('wf_k_frenzy') ?? 0)) CondFlags.addStack('frenzy', 1, 10, CX.T + 6, CX.T);   // 暴怒关键：狂乱
      if (crit && (CX.tree?.rank('cr_k_return') ?? 0) && CX.T - returnAt >= 1 && Math.random() < 0.15) {   // 回溯关键：返时
        const sl = (['skill1', 'skill2', 'skill3'] as const).map(k => [k, CX.loadout.cooldownLeft(k, CX.T)] as const).sort((a, b) => b[1] - a[1])[0];
        if (sl && sl[1] > 0) { CX.loadout.resetCooldown(sl[0]); returnAt = CX.T; CX.audio.click?.(); }
      }
      if (CX.tree?.rank('cm_k_stack')) CondFlags.addStack('cmark', 1, 5, CX.T + 6, CX.T);   // 时痕关键：刻痕
      if (el === 'nature' && (CX.tree?.rank('ag_k_corrode') ?? 0)) CondFlags.addStack('corrode', 1, 6, CX.T + 6, CX.T);   // 腐蚀关键
      if (crit && fireAlias.has(el) && !rendBusy && (CX.tree?.rank('ab_k_double') ?? 0)) {   // 爆破关键：爆燃二次爆炸
        const p0 = e.getPos(); rendBusy = true;
        try { for (const u of unitsInRadius(CX.world, p0, 3, 'player')) if (u.alive) CX.fx.dealDamage(u, amount * 0.4, el, CX.player, false); } finally { rendBusy = false; }
        spawnRing(p0, 3, '#ff8a30', 0.25);
      }
      if (el === 'arcane' && (CX.tree?.rank('ma_k_vuln') ?? 0)) CondFlags.addStack('arcane_vuln', 1, 10, CX.T + 6, CX.T);   // 星痕关键：奥术易伤
      resHit(e.uid);   // v0.7.5：怒气 / 连击点
      castStat.hits++; if (crit) { castStat.crit = true; CX.audio.crit(); }
      // 小怪：受击硬直 + 小幅击退（Boss 和训练假人不动）
      if (!e.isBoss && !e.isDummy && e.alive && !chronoFrozen()) {   // v0.7.0 时停中不被击退
        if (e.stagger <= 0) e.rig.anim?.play('hit', 1.8);
        e.stagger = crit ? 0.22 : 0.13;
        const d = new THREE.Vector3().subVectors(e.pos, CX.player.pos).setY(0), l = d.length();
        if (l > 0.01) {
          const prev = { x: e.pos.x, z: e.pos.z };
          e.pos.addScaledVector(d, (crit ? 0.45 : 0.22) * ((e.type.elite || e.type.rare || e.type.mini) ? 0.5 : 1) / l);   // v1.2.56 精英击退减半
          CX.outdoorNav()?.resolveMove(prev, e.pos, Math.min(0.6, 0.4 * e.rig.scale));
        }
      }
    }
  }
  if (e.isDummy && e.hp < e.maxHp * 0.5) e.hp = e.maxHp;   // 训练假人打不死
}

/** 命中粒子：通用火花 + 按元素区分（物理碎屑 / 火焰 / 冰霜 / 奥术 / 毒 / 闪电 / 暗影 / 神圣）；手机数量减少 */
export function impactFx(p: { x: number; y: number; z: number }, el: Element, heavy: boolean, o: { small?: boolean; poison?: boolean; tick?: boolean; mat?: HitMat } = {}) {
  const k = (o.small ? 0.5 : 1) * (CX.isMobile ? 0.6 : 1);
  const n = (v: number) => Math.max(1, Math.round(v * k));
  if (!o.tick) CX.particles.emit(p, { count: n(heavy ? 10 : 5), color: 0xffffff,   /* v1.2.57 少发光：白火花减半 */ color2: el === 'physical' ? 0xffc060 : 0xffe0a0, speed: heavy ? 7.5 : 5.5, up: 0.6, life: 0.28, size: heavy ? 0.22 : 0.17, gravity: 12 });
  if (!o.tick) elementHit(p, el, heavy, o.mat);   // v0.9.1b 元素命中层
  switch (el) {
    case 'physical':
      if (!o.tick) CX.particles.emit(p, { count: n(heavy ? 9 : 4), color: 0xb09070, color2: 0x5a4a3a, speed: 3.2, up: 1.4, life: 0.55, size: 0.2, gravity: 10 });   // 碎屑
      else CX.particles.emit(p, { count: n(4), color: 0xc02020, color2: 0x600808, speed: 1.2, up: 0.4, life: 0.5, size: 0.18, gravity: 6 });                 // 流血
      break;
    case 'fire': CX.particles.emit(p, { count: n(o.tick ? 5 : 14), color: 0xff4a10, color2: 0xffc040, speed: 1.5, up: 2.5, life: 0.8, size: 0.4, drag: 1 }); break;
    case 'frost':
      CX.particles.emit(p, { count: n(o.tick ? 4 : 14), color: 0x9fe8ff, color2: 0xffffff, speed: 3.5, up: 1, life: 0.6, size: 0.25, gravity: 5 });
      if (heavy) CX.particles.emit(p, { count: n(8), color: 0xe0f8ff, color2: 0x6fd0ff, speed: 6, up: 0.3, life: 0.3, size: 0.32, drag: 3 });
      break;
    case 'arcane':
      CX.particles.emit(p, { count: n(o.tick ? 4 : 12), color: 0xd07dff, color2: 0xffffff, speed: 4, up: 0.8, life: 0.45, size: 0.22, drag: 2.5 });   // 奥术闪粉
      if (!o.tick) CX.particles.emit(p, { count: n(6), color: 0x8a40ff, color2: 0xf0c8ff, speed: 0.6, up: 1.6, radius: 0.4, life: 0.8, size: 0.3, drag: 0.6 });
      break;
    case 'nature':
      if (o.poison) CX.particles.emit(p, { count: n(o.tick ? 5 : 12), color: 0x7aff3a, color2: 0x2a8010, speed: 2.2, up: 1.6, life: 0.6, size: 0.28, gravity: 7 });   // 毒液飞溅
      else if (!o.tick) {
        CX.particles.emit(p, { count: n(10), color: 0x9fe0ff, color2: 0xffffff, speed: 5, up: 0.5, life: 0.25, size: 0.25 });
        if (Math.random() < 0.6) spawnLightning(new THREE.Vector3(p.x + (Math.random() - 0.5) * 2, 7, p.z + (Math.random() - 0.5) * 2), new THREE.Vector3(p.x, p.y, p.z));
      } else CX.particles.emit(p, { count: n(3), color: 0x9fe0ff, color2: 0xffffff, speed: 3, up: 0.4, life: 0.2, size: 0.2 });
      break;
    case 'shadow': CX.particles.emit(p, { count: n(o.tick ? 4 : 12), color: 0x8a40ff, color2: 0x200040, speed: 2, up: 1.5, life: 0.7, size: 0.4 }); break;
    case 'holy': CX.particles.emit(p, { count: n(o.tick ? 4 : 12), color: 0xffe070, color2: 0xffffff, speed: 3, up: 2, life: 0.6, size: 0.3, drag: 1.5 }); break;
  }
}

/** v1.2.58 天赋 3.0「裂伤」区域一关键：撕裂（叠流血最多 5 层，可暴击）/ 深创（满 5 层引爆剩余流血 60%）
 *  每层每秒 = 触发那一击伤害的 3%（取最近一击与原值的较大者），持续 6 秒；只算玩家的物理直伤（不吃流血自身的跳） */
let rendBusy = false, returnAt = -9;
export const REND = { per: 0.03, max: 5, dur: 6, burst: 0.6 };
function rendHit(e: Enemy, amount: number, el: Element) {
  if (rendBusy || el !== 'physical' || !e.alive) return;
  const rend = CX.tree?.rank('wa_k_rend') ?? 0, deep = CX.tree?.rank('wa_k_deep') ?? 0;
  if (!rend && !deep) return;
  const st = e.status, prevN = st.stacks('rend'), n = st.bumpStack('rend', REND.max, REND.dur, CX.player, 0);
  const old = st.dots().find(d => d.key === 'dot:rend');
  // 每层数值：取本击 3% 与原每层数值的较大者（原每层 = 原总 dps ÷ 原层数；不能除以新层数 −1，满层时会逐击放大）
  const per = Math.max(amount * REND.per * ((CX.tree?.rank('wa_k_bleed') ?? 0) ? 1.5 : 1), old && prevN > 0 ? old.dps / prevN : 0);
  const P = CX.player as unknown as { critChance?: number; critMult?: number };
  st.add({ key: 'dot:rend', kind: 'dot', remaining: REND.dur, dps: per * n, element: 'physical', source: CX.player, interval: 1, crit: rend ? P.critChance ?? 0 : 0, critMult: P.critMult });
  if (deep && n >= REND.max) {
    const d = st.dots().find(x => x.key === 'dot:rend');
    const burst = d ? d.dps * d.ticksLeft * REND.burst : 0;
    st.remove('dot:rend'); st.remove('rend');
    if (burst > 0) { rendBusy = true; try { CX.fx.dealDamage(e, burst, 'physical', CX.player, false, false, false); } finally { rendBusy = false; } spawnRing(e.getPos(), 1.2 * e.rig.scale, '#a01010', 0.25); }
  }
}

/** v1.2.66 槽位继承：原技能是火焰的槽位换上的技能元素也算「火焰」（炽燃、爆燃） */
export let fireAlias: ReadonlySet<string> = new Set(['fire']);
export function setFireAlias(s: ReadonlySet<string>) { fireAlias = s; }

/** v1.2.58「炽焰」关键：炽燃 = 火焰暴击伤害 60%，2 秒烧完；不叠层，刷新取高 */
function blazeHit(e: Enemy, amount: number, el: Element = 'fire') {
  const old = e.status.dots().find(d => d.key === 'dot:blaze');
  const dps = amount * 0.6 / 2;
  if (old && old.dps * old.ticksLeft >= dps * 2) return;
  e.status.add({ key: 'dot:blaze', kind: 'dot', remaining: 2, dps, element: el, source: CX.player, interval: 0.5 });   // v1.2.66 闪电链继承炽燃 → 感电
}

/** v1.2.57b 受击材质（按怪物 id + 名字推断，缓存） */
const matCache = new WeakMap<Enemy, HitMat>();
export function matOf(e: Enemy): HitMat { let m = matCache.get(e); if (!m) { m = e.isDummy ? 'wood' : hitMatOf(String(e.kind ?? ''), String(e.type?.name ?? '')); matCache.set(e, m); } return m; }

/** 打击特效：命中粒子 + 暴击白圈 + 音效 */
export function hitFx(e: Enemy, el: Element, heavy: boolean) {
  impactFx({ x: e.pos.x, y: 1.1 * e.rig.scale, z: e.pos.z }, el, heavy, { mat: matOf(e) });
  if (heavy) spawnRing(e.getPos(), 0.9 * e.rig.scale, '#fff2c0', 0.18);
  CX.audio.hit(heavy);
  if (el !== 'physical') CX.audio.element(el);
}

export function onUnitDeath(u: Unit) {
  if (u === CX.player) {
    CX.player.rig.anim?.play('death');
    CX.audio.playerDeath();
    achOnDeath();   // v0.7.12
    CX.$('death-where').textContent = CX.zone === 'field' ? '灵魂将在翠风前哨重新凝聚' : isWildId(CX.zone) ? `灵魂将在${recallDest().name}重新凝聚` : CX.zone === 'raid' ? raidDeathText() : CX.zone === 'dungeon' ? '灵魂将在灰石营地重新凝聚（离开副本）' : '灵魂将在灰石营地重新凝聚';
    // v0.5（账号 B）：阵亡 = 身上装备耐久 -10%
    const durMsg = afterPlayerDeath();
    CX.$('death-dur').textContent = durMsg;
    CX.toast(durMsg, '#ff9060');
    setTimeout(() => { CX.$('death').style.display = 'flex'; }, 1200);
    return;
  }
  const e = u as Enemy;
  e.deadAt = CX.T;
  e.rig.anim?.play('death');
  enemyDeath(e.pos, e.rig.scale ?? 1, e.isBoss ? 'boss' : e.type.elite ? 'elite' : e.type.rare ? 'rare' : '');   // v0.9.1i
  CX.audio.enemyDeath(e.kind);
  if (CX.target === e) CX.target = null;
  CX.addXp(packXp(e.type.xp));   // v1.1.1 packXp：内容包经验倍率（没有包 = 原值）
  if (!e.isDummy) packEvent({ type: 'kill', kind: e.kind, elite: !!(e.type.elite || e.type.rare || e.type.mini), boss: !!e.isBoss, map: String(CX.zone), x: e.pos.x, z: e.pos.z });
  CX.quests.onKill(e.kind === 'boss_grok' ? 'boss' : e.kind);
  if (e.kind === 'goldboar') { CX.quests.onKill('boar'); CX.toast('击败稀有怪物「金鬃」！', '#d0a0ff'); }      // 金鬃也算野猪
  if (e.kind === 'chief') { CX.toast('击败精英「赤鬃 · 劫掠头目」！', '#ff8000'); CX.audio.victory(); }
  CX.dungeonRun?.onUnitDeath(e.uid);
  if (e.type.elite || e.type.rare) noteBossKill(e.kind);   // v0.6.9 地图图例：击杀次数
  if (!e.isDummy) achOnKill(e.type.name, CX.zone !== 'raid' && (e.isBoss || !!e.type.elite || !!e.type.rare));   // v0.7.12 成就 / 首领图鉴
  // v0.6.8：技能书 / 书页（长副本首领在 raid.ts 的 onBossDown 里单独发）
  if (CX.zone !== 'raid' && !e.isDummy && (e.isBoss || e.type.elite)) { awakenBossKill(e.isBoss ? 'dungeon' : 'elite'); spiritOnKill(e.isBoss ? 'dungeon' : 'elite'); }   // v0.7.4：历练 + 岩纹；v0.7.6 英灵
  if (CX.zone !== 'raid' && !e.isDummy) { const k = e.isBoss ? 'dungeon' : e.type.elite ? 'elite' : e.type.rare ? 'rare' : null; if (k) bookDrop(k); }
  // 掉落（材料直接进背包）
  const r = CX.gen.roll(LOOT_TABLES[e.lootTable], e.type.ilvl, !e.isDummy && (e.isBoss || !!e.type.elite || !!e.wb || !!e.pboss));   // v1.2.38 首领级不掉绿蓝紫
  tagByTable(r.items, e.lootTable, CX.zone, e.name, raidName());
  r.items.forEach(it => { if (it.ancient) CX.ancientBanner(it.name); });   // 11-18 掉落表条目带 anc（内容包副本太古）出了太古也弹横幅
  r.stacks.forEach(st => { const d = CX.forge.stackDef(st.id); CX.inventory.addStack(st.id, st.count); CX.toast(`获得 ${d?.name ?? st.id} ×${st.count}`, d?.kind === 'junk' ? '#b8b8b8' : d?.kind === 'currency' ? '#ffb060' : '#7fd7ff'); });
  // v0.9.1p 满级金币起飞：长副本 / 深渊首领金币 ×4（给淬炼洗词条用）
  if (CX.zone === 'raid' && e.isBoss && CX.progression.level >= MAX_LEVEL) r.gold = Math.round(r.gold * RAID_BOSS_GOLD_MUL);
  r.gold = packGold(r.gold);   // v1.1.1 内容包金币倍率（没有包 = 原值）
  const all: (ItemInstance | number)[] = [...r.items, r.gold];
  all.forEach((l, i) => spawnLoot(l, e.pos, i, all.length));
  CX.feel.emit(e.isBoss ? 'bossKill' : (e.type.elite || e.type.rare || e.type.mini) ? 'eliteKill' : 'kill');   // v1.2.56 精英击杀慢动作
  if (e.isBoss) { CX.yell(`${e.name} 倒下了！`, '#ff8000', 2.5); }
  if (e.pboss) packBossOnDeath(e);   // v1.1.0 内容包首领
  if (e.wb) wbOnDeath(e);   // v0.9.3d 世界首领：下次刷新 / 每日首杀 / 精魄保底
  repOnKill(e);   // v0.9.3f 区域声望
}

/** 受击闪白（约 80 毫秒，按真实时间，不受顿帧影响）；重复命中会续上而不是提前熄灭 */
export const flashing = new Map<Unit, number>();

export function flash(u: Unit, color: number) {
  u.rig.flash.forEach(m => m.emissive.setHex(color));
  flashing.set(u, performance.now() + 60);   // v1.2.56 受击闪白 0.06 秒
}

export function updateFlash() {
  if (!flashing.size) return;
  const now = performance.now();
  flashing.forEach((until, u) => { if (now >= until) { u.rig.flash.forEach(m => m.emissive.setHex(m.userData.baseEmissive ?? 0)); flashing.delete(u); } });
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindCombatEvents(__ctx: Ctx) {
  CX = __ctx;
  CondFlags.provide('armor_pct', () => Math.min(25, Math.floor((CX.player?.armor ?? 0) / 60)));   // v1.2.58 铁壁关键：甲击

}
