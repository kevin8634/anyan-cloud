// 地面掉落（拾取 / 自动拾取）、NPC 与交互（对话、按 E 的交互目标）
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindLootNpc(C) 初始化
import * as THREE from 'three';
import { packInteractAt } from '../core/ContentPacks';   // v1.2.71
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { LootGenerator, ItemInstance, itemColor, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME } from '../core/Loot';
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
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE, FIELD_STAR_GATE, CAMP_GATES } from '../data/world_map';
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
import { enterRaid, raidInteract, raidEntry } from './raid';
import { dgxInteract } from './dungeonplus';
import { RAIDS } from '../data/raids';
import type { RaidId } from '../data/raid_molten';
import { openExchange } from './smith';
import { exInteract } from './explore';
import type { Ctx, Zone } from './main';

import * as VFX from './vfx';
import { packDungeonInteract, isPackDungeon, packDungeonLock, packDungeonEntry } from './packdungeon';   // v1.2.16 内容包小副本
import { packInteract } from '../core/ContentPacks';   // raidA A7 内容包交互项（没有包 = null）
/** 掉落品级 → 光效档：0 白绿 1 蓝 2 紫 3 套装 4 橙 5 暗金 */
function lootTier(l: ItemInstance) { return l.ancient ? 5 : l.quality === 'dark' ? 5 : l.quality === 'orange' ? 4 : l.setId ? 3 : l.quality === 'purple' ? 2 : l.quality === 'blue' ? 1 : 0; }
let CX!: Ctx;

// ======================================================================
// 掉落
// ======================================================================
export const loots: { obj: THREE.Object3D; loot: ItemInstance | number; plate: HTMLDivElement }[] = [];

export function spawnLoot(l: ItemInstance | number, at: THREE.Vector3, i: number, n: number) {
  const isGold = typeof l === 'number';
  const color = isGold ? '#ffd100' : l.setId && l.quality !== 'orange' && l.quality !== 'dark' ? '#ff3040' : QUALITY_COLOR[l.quality];   // v0.9.1m 套装掉落改红色光柱（与橙/暗金区分）
  const tall = isGold ? 0 : ({ white: 0, green: 0, blue: 0.7, purple: 1.2, orange: 2, dark: 2.8 } as Record<string, number>)[l.quality];
  const anc = !isGold && !!l.ancient;   // v0.9.6b 太古：深红金边双螺旋
  const obj = M.makeLootItem(isGold ? null : l.slot, anc ? '#ff2a2a' : color, anc ? 3 : tall, anc);
  const a = (i / n) * Math.PI * 2;
  obj.position.set(at.x + Math.cos(a) * 1.3, 0, at.z + Math.sin(a) * 1.3); obj.position.y = CX.groundAt(obj.position.x, obj.position.z);
  const tier = isGold ? 0 : lootTier(l); obj.userData.tier = tier; obj.userData.col = anc ? '#ff2a2a' : color;
  VFX.lootDrop(obj.position, anc ? '#ff2a2a' : color, tier);   // v0.9.1e 落地光效
  CX.scene.add(obj);
  const plate = document.createElement('div');
  plate.className = 'nameplate'; plate.style.color = color; plate.style.fontSize = '12px';
  if (anc) { plate.classList.add('np-anc'); plate.style.color = '#ff2a2a'; } else if (!isGold && l.quality === 'dark') plate.classList.add('np-dark'); else if (!isGold && l.quality === 'orange') plate.classList.add('np-orange');   // v0.9.1g 名牌也区分
  plate.textContent = isGold ? `${l} 金币` : l.name;
  CX.$('floats').appendChild(plate);
  loots.push({ obj, loot: l, plate });
}

// 11-18 永霜墓穴首领倒下卡顿：尾王倒下后金币 / 套装 / 橙装 / 每周首通加倍掉落围在一圈（半径 1.3），走进去同一帧会连捡好几件，
// 原来每捡一件就整份存一次档（每次 parse + 校验 + stringify + 写盘），同一帧连存 N 次。改成这一帧捡完只存一次；?off=lootsave 回每件一存。
const LOOT_SAVE_ONCE = (() => { try { return !/(?:[?&]off=[^&]*\blootsave\b)/.test(location.search); } catch { return false; } })();
export function updateLoot() {
  let picked = false;
  for (let i = loots.length - 1; i >= 0; i--) {
    const L = loots[i];
    const item = L.obj.getObjectByName('item');
    if (item) { item.rotation.y += 0.04; item.position.y = 0.55 + Math.sin(CX.T * 3 + i) * 0.08; }
    const ar = L.obj.getObjectByName('ancRing'); if (ar) ar.rotation.y += 0.02;   // v0.9.6b 太古符环反转
    const orb = L.obj.getObjectByName('orbit'); if (orb) { orb.rotation.y -= 0.03; orb.position.y = 0.75 + Math.sin(CX.T * 2 + i) * 0.1; }   // v0.9.1g 暗金环绕金晶
    if (L.obj.userData.tier >= 2 && L.plate.style.display !== 'none') VFX.lootIdle(L.obj.position, L.obj.userData.col, L.obj.userData.tier);
    const s = CX.project(L.obj.position.clone().setY(L.obj.position.y + 0.9));
    const far = CX.dist2d(L.obj.position, CX.player.pos) > 30;
    L.plate.style.display = s.vis && !far ? '' : 'none';
    L.plate.style.left = `${s.x}px`; L.plate.style.top = `${s.y}px`;
    if (!CX.player.alive || CX.dist2d(L.obj.position, CX.player.pos) > 1.8) continue;
    if (!CX.settings.autoLoot && pickupReq !== L) continue;          // 关闭自动拾取：走近后按 E / 点「拾取」
    pickupReq = null;
    if (typeof L.loot === 'number') { CX.inventory.addGold(L.loot); CX.toast(`+${L.loot} 金币`, '#ffd100'); CX.audio.coin(); }
    else if (CX.inventory.autoSalvage.includes(L.loot.quality) && !L.loot.locked && !L.loot.ancient && !CX.forge.isUpgradeForMe(L.loot)) {
      const got = CX.forge.salvageLoose(L.loot);
      CX.toast(`自动分解 [${L.loot.name}]：${got.map(g => `${CX.forge.stackDef(g.id)?.name}×${g.count}`).join('、') || '无'}`, '#9ab0c0');
    }
    else if (CX.inventory.add(L.loot)) { CX.toast(`获得 [${L.loot.name}]`, itemColor(L.loot)); CX.audio.loot(L.loot.quality); CX.noteCodex(L.loot); if (L.loot.quality === 'purple' || L.loot.quality === 'orange' || L.loot.quality === 'dark' || L.loot.setId) { CX.save(); if (L.loot.quality === 'dark') { CX.yell(`暗金！[${L.loot.name}]`, '#e8c060', 3.5); CX.audio.victory(); } } }
    else { CX.toast('背包已满'); continue; }
    VFX.lootPickup(L.obj.position, CX.player.pos, L.obj.userData.col ?? '#ffd100', L.obj.userData.tier ?? 0);
    CX.scene.remove(L.obj); L.plate.remove(); loots.splice(i, 1);
    if (LOOT_SAVE_ONCE) picked = true; else CX.save();
  }
  if (picked) CX.save();   // 11-18 一帧只存一次（永霜墓穴首领倒下卡顿）
}

/** 关闭自动拾取时，玩家按 E / 点按钮要捡的那一件 */
export let pickupReq: (typeof loots)[number] | null = null;

export function nearestLoot() {
  let best: (typeof loots)[number] | null = null, bd = 1.8;
  for (const L of loots) { const d = CX.dist2d(L.obj.position, CX.player.pos); if (d < bd) { bd = d; best = L; } }
  return best;
}

export function clearLootInZone() {
  for (let i = loots.length - 1; i >= 0; i--) if (loots[i].obj.position.x > 200) { CX.scene.remove(loots[i].obj); loots[i].plate.remove(); loots.splice(i, 1); }
}

// ======================================================================
// NPC 与交互
// ======================================================================
export interface Npc { id: string; rig: M.Rig; plate: HTMLDivElement; z: Zone; role?: WildNpc['role'] }

/** 新地图的功能 NPC（悬赏板没有角色模型，用一个空节点占位） */
export function spawnWildNpcs(id: WildId) {
  const O = WILD[id].origin;
  for (const n of WILD[id].npcs) {
    const rig: M.Rig = n.model === 'board' ? { root: new THREE.Group(), body: new THREE.Group(), legs: [], scale: 1, flash: [] } : M.makeNpcModel(n.model, n.tint, n.tintK);
    addNpc(n.id as M.NpcKind, O.x + n.x, O.z + n.z, n.yaw, id, rig);
    npcs[npcs.length - 1].role = n.role;
  }
}

export const npcs: Npc[] = [];

const NPC_GROUND_OFF = (() => { try { return /[?&]off=[^&]*\bnpcground\b/.test(location.search); } catch { return false; } })();
export function addNpc(id: M.NpcKind, x: number, z: number, yaw: number, zn: Zone = 'world', rig0?: M.Rig) {
  const rig = rig0 ?? M.makeNpc(id); rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw;
  (zn === 'field' ? CX.fieldGroup : isWildId(zn) ? CX.wilds[zn]!.group : CX.worldGroup).add(rig.root);
  // 11-18 Rhett「无声钟楼伊奥拉 / 卡戎跑到地下去了」：野外 NPC 原来一律 y = 0，营地在台地上（钟楼营地高 3.4 m）就埋进地里；改为生成时贴高度图。?off=npcground 回 y = 0
  if (isWildId(zn) && !NPC_GROUND_OFF) { const w = CX.wilds[zn]; if (w?.hf) rig.root.position.y = w.hf.at(x, z); }
  rig.anim?.loop('idle');
  const plate = document.createElement('div'); plate.className = 'nameplate';
  CX.$('floats').appendChild(plate);
  npcs.push({ id, rig, plate, z: zn });
}

export type Interactable = { label: string; act: () => void; pos: THREE.Vector3 };

export function currentInteractable(): Interactable | null {
  if (!CX.settings.autoLoot) {
    const L = nearestLoot();
    if (L) return { label: `拾取：${typeof L.loot === 'number' ? `${L.loot} 金币` : L.loot.name}`, act: () => { pickupReq = L; }, pos: L.obj.position };
  }
  { const ex = exInteract(); if (ex) return ex; }   // v0.9.3e 瞭望塔 / 宝箱 / 采集点
  { const pi = packInteractAt(String(CX.zone), CX.player.pos.x, CX.player.pos.z); if (pi) return { label: pi.label, act: pi.act, pos: new THREE.Vector3(pi.x, 0, pi.z) }; }   // v1.2.71 内容包交互点（没有包 = null）
  if (CX.zone === 'world' || CX.zone === 'field') {
    for (const n of npcs) if (n.z === CX.zone && CX.dist2d(n.rig.root.position, CX.player.pos) < 3.2) {
      if (n.id === 'kai' || n.role === 'bank') return { label: `仓库：${NPCS[n.id].name}`, act: openBank, pos: n.rig.root.position };
      if (n.role === 'supply') return { label: `交易：${NPCS[n.id].name}（补给 · 收购杂物）`, act: () => { CX.shopTab = 'buy'; openShop('supply'); renderShop(); }, pos: n.rig.root.position };
      if (n.role === 'smith') return { label: `铁匠：${NPCS[n.id].name}（修理 · 强化 · 淬炼 · 分解 · 兑换）`, act: () => { CX.shopTab = CX.inventory.repairAllCost() > 0 ? 'repair' : 'upgrade'; openShop('smith'); renderShop(); }, pos: n.rig.root.position };
      if (n.id === 'gerda' && !CX.quests.npcQuests('gerda', CX.progression.level).length) return { label: `交易：${NPCS[n.id].name}（商店 · 修理 · 强化 · 兑换）`, act: () => { if (CX.inventory.repairAllCost() > 0) CX.shopTab = 'repair'; openShop(); renderShop(); }, pos: n.rig.root.position };
      return { label: `对话：${NPCS[n.id].name}`, act: () => CX.openDialog(n.id), pos: n.rig.root.position };
    }
    if (CX.zone === 'world' && CX.dist2d(CX.WORLD_PORTAL, CX.player.pos) < 3) return { label: '区域传送阵：营地 · 副本门口', act: openWaypoints, pos: CX.WORLD_PORTAL };
    if (CX.zone === 'world') for (const id of ['foothill', 'marsh'] as const) { const gp = new THREE.Vector3(CAMP_GATES[id].x, 0, CAMP_GATES[id].z); if (CX.dist2d(gp, CX.player.pos) < 3) return { label: `${id === 'foothill' ? '暗岩山路' : '腐沼栈道'}：前往${WILD[id].name}（副本区 · ${MAPS[id === 'foothill' ? 'darkrock_mine' : 'rotting_temple'].name}）`, act: () => useGate('camp', id), pos: gp }; }   // v0.9.2b
    if (CX.zone === 'world' && CX.dist2d(CX.FIELD_GATE_POS, CX.player.pos) < 3) return { label: '石门：前往翠风原野', act: () => CX.enterField(), pos: CX.FIELD_GATE_POS };
    if (CX.zone === 'field' && CX.dist2d(CX.FIELD_RETURN, CX.player.pos) < 3) return { label: '石门：返回灰石营地', act: () => CX.leaveField(), pos: CX.FIELD_RETURN };
    if (CX.zone === 'field' && CX.dist2d(CX.FIELD_EAST_POS, CX.player.pos) < 3) return { label: '石门：前往赤砂裂谷（20~23 级）', act: () => useGate('field', 'redsand'), pos: CX.FIELD_EAST_POS };
    if (CX.zone === 'field') { const sp = new THREE.Vector3(CX.F.x + FIELD_STAR_GATE.x, 0, CX.F.z + FIELD_STAR_GATE.z); if (CX.dist2d(sp, CX.player.pos) < 3) return { label: '山径：前往星落高原（16~20 级）', act: () => useGate('field', 'star'), pos: sp }; }   // v0.9.3e
    if (CX.zone === 'field' && CX.dist2d(CX.FIELD_RETURN, CX.player.pos) < 6) return null;
  } else if (isWildId(CX.zone)) {
    const ws = CX.wilds[CX.zone]!;
    { const pd = packDungeonInteract(); if (pd) return pd; }   // v1.2.16 内容包小副本：异变房间 / 通关后离开
    { const pi = packInteract(); if (pi) return { label: pi.label, act: pi.act, pos: new THREE.Vector3(pi.x ?? CX.player.pos.x, CX.player.pos.y, pi.z ?? CX.player.pos.z) }; }   // raidA A7 内容包交互项（如升降笼）
    for (const n of npcs) if (n.z === CX.zone && CX.dist2d(n.rig.root.position, CX.player.pos) < 3.2) {
      const hasQ = CX.quests.npcQuests(n.id, CX.progression.level).length > 0;
      const nm = NPCS[n.id].name;
      if (!hasQ && n.role === 'supply') return { label: `交易：${nm}（补给 · 收购杂物）`, act: () => { CX.shopTab = 'buy'; openShop('supply'); renderShop(); }, pos: n.rig.root.position };
      if (!hasQ && n.role === 'smith') return { label: `铁匠：${nm}（修理 · 强化 · 淬炼 · 分解 · 兑换）`, act: () => { CX.shopTab = CX.inventory.repairAllCost() > 0 ? 'repair' : 'upgrade'; openShop('smith'); renderShop(); }, pos: n.rig.root.position };
      if (!hasQ && n.role === 'exchange') return { label: `兑换：${nm}`, act: () => { openShop('smith'); openExchange(); }, pos: n.rig.root.position };
      if (!hasQ && n.role === 'bank') return { label: `仓库：${nm}`, act: openBank, pos: n.rig.root.position };
      return { label: `${n.role === 'bounty' ? '查看' : '对话'}：${nm}`, act: () => CX.openDialog(n.id), pos: n.rig.root.position };
    }
    for (const [cid, wp] of Object.entries(ws.waypoints)) if (CX.dist2d(wp, CX.player.pos) < 2.6) return { label: `传送阵：${WILD[CX.zone].camps.find(c => c.id === cid)!.name}`, act: openWaypoints, pos: wp };
    for (const g of ws.gates) if (CX.dist2d(g.pos, CX.player.pos) < 3) return { label: `${g.name}：前往${MAPS[g.to as MapId].name}`, act: () => useGate(CX.zone as MapId, g.to as MapId), pos: g.pos };
    for (const d of ws.dgates) if (CX.dist2d(d.pos, CX.player.pos) < 4 * ((d.obj?.userData.dpScale as number | undefined) ?? 1) && d.id in RAIDS) return { label: `进入：${d.name}（${RAIDS[d.id as RaidId].kind === 'dungeon' ? '30 级普通副本 · 四难度' : '30 级长副本'}）`, act: () => raidEntry(d.id as RaidId), pos: d.pos };
    for (const d of ws.dgates) if (CX.dist2d(d.pos, CX.player.pos) < 4 * ((d.obj?.userData.dpScale as number | undefined) ?? 1) && d.id in CX.LAYOUTS) { const lock = CX.dungeonLock(d.id); return { label: lock ? `${d.name}：${lock}` : `进入：${d.name}（${d.desc}）`, act: () => { if (lock) { CX.toast(lock, '#f66'); CX.audio.error(); return; } CX.enterDungeon(d.id); }, pos: d.pos }; }   // v0.9.2b 暗岩矿洞 / 腐沼神殿门口传送阵
    for (const d of ws.dgates) if (CX.dist2d(d.pos, CX.player.pos) < 4 * ((d.obj?.userData.dpScale as number | undefined) ?? 1) && isPackDungeon(d.id)) { const lock = packDungeonLock(d.id); return { label: lock ? `${d.name}：${lock}` : `进入：${d.name}（${d.desc}）`, act: () => { packDungeonEntry(d.id); }, pos: d.pos }; }   // v1.2.16
    for (const d of ws.dgates) if (CX.dist2d(d.pos, CX.player.pos) < 4 * ((d.obj?.userData.dpScale as number | undefined) ?? 1)) return { label: `${d.name}（${d.opens}开放）`, act: () => CX.toast(`${d.name}：${d.desc}。${d.opens}开放。`, '#ffb080'), pos: d.pos };
  } else if (CX.zone === 'raid') {
    return raidInteract();
  } else {
    const dx = dgxInteract(); if (dx) return dx;   // v0.6.4 异变房间
    const L = CX.layout;
    // 11-18 副本 ×1.5：传送门在放大的副本组里 → 取世界坐标；互动半径跟门的体型一起 × s
    const ex = L.exit.getWorldPosition(new THREE.Vector3()), bp = L.bossPortal.getWorldPosition(new THREE.Vector3());
    if (CX.dist2d(ex, CX.player.pos) < 3 * L.s) return { label: '离开副本', act: () => CX.leaveDungeon(), pos: ex };
    if (L.bossPortal.visible && CX.dist2d(bp, CX.player.pos) < 3 * L.s) return { label: '返回营地', act: () => CX.leaveDungeon(true), pos: bp };
  }
  return null;
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindLootNpc(__ctx: Ctx) {
  CX = __ctx;

}
