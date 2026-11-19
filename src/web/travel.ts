import { hasPack, packList, PackWaypoint } from '../core/ContentPacks';   // v0.9.7 DLC 框架
import { migrateAwk } from '../core/Awaken';   // v1.2.37 旧觉醒词条迁移
import { splitBank } from '../core/PackSave';
import { SET_RENAMES } from '../data/sets';
import { abyssLock, abyRec } from './raid';   // v0.8.0
import { openAbyss } from './abyss_ui';
import { ABYSS } from '../data/abyss';
// 阶段四：地图切换 goMap、营地传送阵、回程、共享仓库、世界事件
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindTravel(C) 初始化
import * as THREE from 'three';
import { prewarmFlush } from './prewarm';
import { exWaystones, exWaystoneTotal, EX_MAPS } from './explore';
import { travelArt } from './travelart';   // v1.2.73 传送阵横版
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
import { applyUpgrade } from '../core/Forge';
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
import { raidCleanup } from './raid';
import { tagItems } from './loottag';
import { dgxEnd, dgxHud } from './dungeonplus';
import { migrateDurability } from '../core/Durability';
import { migrateItemV9 } from '../core/SaveManager';
import { wbOnEvent } from './worldboss';
import type { Ctx, Enemy, Zone } from './main';
import { repAdd, REP_GAIN } from './regional';

let CX!: Ctx;

// ======================================================================
// 阶段四：地图切换（石门 / 传送阵 / 回程 / 读档都走 goMap）、传送阵、回程、仓库、世界事件
// ======================================================================
/** 已开通的传送阵（营地 id）；灰石营地、翠风前哨默认开通 */
export const waypoints = new Set<string>(['camp', 'field']);

export const BANK_SIZE = 48;

/** 仓库是账号共享的（同一浏览器的 3 个角色共用），单独存一份，不跟角色存档走 */
export const BANK_KEY = 'darkrock_bank';

export function loadBank() { try { let v = JSON.parse(CX.safeLS.get(BANK_KEY) ?? '[]'); if (Array.isArray(v)) v = bankPackFix(v); CX.bank = Array.isArray(v) ? v.filter(x => x && x.id && x.slot).slice(0, BANK_SIZE) : []; migrateDurability(CX.bank); migrateAwk(CX.bank); CX.bank.forEach(it => { migrateItemV9(it, LOOT_DATA); try { CX.gen.migrateIlvl(it, (x, l) => applyUpgrade(x, l, FORGE_DATA)); CX.gen.refreshEffects(it); } catch { /* 生成器未就绪：下次读档再刷新 */ } if (it.fixedId && SET_RENAMES[it.fixedId]) it.name = SET_RENAMES[it.fixedId]; }); } catch { CX.bank = []; } }   // v0.5：仓库里的老装备补耐久

/** v0.9.7 DLC 框架：共享仓库里没注册的包的物品单独封存在这个 key（不删）；注册了的包读仓库时放回（仓库满了继续封存） */
export const BANK_SEALED_KEY = 'darkrock_bank_sealed';
function bankPackFix(v: ItemInstance[]): ItemInstance[] {
  const raw = CX.safeLS.get(BANK_SEALED_KEY);
  const { keep, seal } = splitBank(v, { hasPack });
  if (!seal.length && !raw) return v;   // 没有任何内容包物品：原样（本体行为不变）
  let sealed: ItemInstance[] = [];
  try { const x = JSON.parse(raw ?? '[]'); if (Array.isArray(x)) sealed = x; } catch { /* 坏了：保留原文不覆盖 */ return keep; }
  const out = [...keep], stay: ItemInstance[] = [];
  for (const it of sealed) { if (it?.pack && hasPack(it.pack) && out.length < BANK_SIZE) out.push(it); else stay.push(it); }
  const all = [...stay, ...seal];
  if (all.length) CX.safeLS.set(BANK_SEALED_KEY, JSON.stringify(all)); else if (sealed.length) CX.safeLS.set(BANK_SEALED_KEY, '[]');
  if (all.length !== sealed.length || seal.length) CX.safeLS.set(BANK_KEY, JSON.stringify(out));   // 先写封存再写仓库：中途断电也不丢
  return out;
}

export function saveBank() { CX.safeLS.set(BANK_KEY, JSON.stringify(CX.bank)); }

export function wildLock(id: WildId): string | null { const w = WILD[id]; return CX.progression.level < w.minLevel ? `需要等级 ${w.minLevel}（${w.name} ${w.levels[0]}~${w.levels[1]} 级）` : null; }

/** 地图在哪个营地（传送阵用）：名字和落脚点 */
export let BASE_CAMPS!: { id: string; map: MapId; name: string; pos: () => THREE.Vector3 }[];

export function allCamps() {
  return [...BASE_CAMPS, ...WILD_IDS.flatMap(id => WILD[id].camps.map(c => ({ id: c.id, map: id as MapId, name: c.name, pos: () => new THREE.Vector3(WILD[id].origin.x + c.waypoint.x + 2.5, 0, WILD[id].origin.z + c.waypoint.z) })))];
}

export function showLoading(text: string) { CX.$('loading-text').textContent = text; CX.$('loading').style.display = 'flex'; }

export function hideLoading() { CX.$('loading').style.display = 'none'; }

export let goPending = false;

/** 切换到某张野外地图的某个位置。新地图第一次进入时先显示加载画面再生成场景 */
export function goMap(map: MapId, at?: { x: number; z: number }, why = '', inLoad = false): boolean {
  if (isWildId(map)) { const lock = wildLock(map); if (lock) { CX.toast(lock, '#f66'); CX.audio.error(); return false; } }
  if (isWildId(map) && !CX.wilds[map]) {
    if (goPending) return false;
    goPending = true;
    showLoading(`正在前往 ${MAPS[map].name}…`);
    setTimeout(() => { CX.ensureWild(map); goPending = false; goMap(map, at, why, true); void prewarmFlush(map).then(hideLoading, hideLoading); }, 40);   // v1.2.73b 加载画面里把新地图着色器 / 贴图预热完再撤
    return true;
  }
  if (CX.zone === 'dungeon') { CX.clearDungeonEnemies(); CX.dungeonRun = null; CX.clearLootInZone(); dgxEnd(); dgxHud(); }
  if (CX.zone === 'raid') { raidCleanup(); CX.clearLootInZone(); }
  CX.panels.forEach(p => CX.togglePanel(p, false));
  CX.enemyShots.forEach(sh => CX.scene.remove(sh.mesh)); CX.enemyShots.length = 0;
  CX.setZoneLook(map === 'camp' ? 'world' : map === 'field' ? 'field' : map as Zone);
  const p = at ?? defaultArrive(map);
  CX.player.pos.set(p.x, 0, p.z);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0; CX.target = null;
  recall.active = false;
  CX.toast(`${why || '进入'}：${MAPS[map].name}（${MAPS[map].levels} 级）`, '#f0c040');
  CX.audio.portal();
  onZoneChanged();
  // v1.2.77 Rhett 11-03 22:28：换地图一律走加载画面，把新区域着色器 / 贴图预热完再撤（去过的地图很快就撤）
  if (!inLoad && CX.started) { showLoading(`正在前往 ${MAPS[map]?.name ?? '目的地'}…`); setTimeout(() => { void prewarmFlush(map).then(hideLoading, hideLoading); }, 30); }
  return true;
}

export function defaultArrive(map: MapId): { x: number; z: number } {
  if (map === 'camp') return { x: CX.CAMP.x, z: CX.CAMP.z };
  if (map === 'field') return { x: CX.F.x + FIELD_SPOTS.arrive.x, z: CX.F.z + FIELD_SPOTS.arrive.z };
  if (isWildId(map)) { const w = WILD[map], c = w.camps.find(x => x.main)!; return { x: w.origin.x + c.waypoint.x + 2.5, z: w.origin.z + c.waypoint.z }; }
  return { x: CX.CAMP.x, z: CX.CAMP.z };
}

/** 穿过石门：落在目的地那边「回来的门」旁边 */
export function useGate(from: MapId, to: MapId) {
  if (isWildId(to)) { const g = WILD[to].gates.find(x => x.to === from); return goMap(to, g ? { x: WILD[to].origin.x + g.arrive.x, z: WILD[to].origin.z + g.arrive.z } : undefined); }
  if (to === 'field' && from === 'redsand') return goMap('field', { x: CX.F.x + FIELD_EAST_GATE.x - 6, z: CX.F.z + FIELD_EAST_GATE.z });
  if (to === 'field' && from === 'star') return goMap('field', { x: CX.F.x + FIELD_STAR_GATE.x - 6, z: CX.F.z + FIELD_STAR_GATE.z });
  if (to === 'camp' && (from === 'foothill' || from === 'marsh')) { const g = CAMP_GATES[from], L = Math.hypot(g.x, g.z); return goMap('camp', { x: g.x - g.x / L * 5, z: g.z - g.z / L * 5 }); }   // v0.9.2b 副本区回营地：落在路口内侧
  return goMap(to);
}

/** 走进营地范围：开通传送阵 */
export function checkWaypoints() {
  if (!isWildId(CX.zone)) return;
  const w = WILD[CX.zone];
  for (const c of w.camps) {
    if (waypoints.has(c.id)) continue;
    if (Math.hypot(CX.player.pos.x - w.origin.x - c.x, CX.player.pos.z - w.origin.z - c.z) < c.r + 2) {
      waypoints.add(c.id); CX.toast(`传送阵已开通：${c.name}`, '#7fd7ff'); CX.audio.questAccept(); CX.save();
    }
  }
  // v0.9.2b 副本传送阵：走到门口 8 米内激活（之后在任何传送阵都能直接传到门口）
  const ws = CX.wilds[CX.zone];
  for (const d of ws?.dgates ?? []) {
    if (!d.obj) continue;
    const on = waypoints.has(`dp:${d.id}`);
    if (!on && CX.dist2d(d.pos, CX.player.pos) < 8) { waypoints.add(`dp:${d.id}`); CX.toast(`副本传送阵已激活：${d.name}`, '#ffd34d'); CX.audio.questAccept(); CX.save(); }
    if (d.obj.userData.dpOn !== waypoints.has(`dp:${d.id}`)) M.setDungeonPortalActive(d.obj, waypoints.has(`dp:${d.id}`));
  }
}

/** v0.9.2b 所有副本传送阵（副本区 + 野外门口），按等级排 */
export function allDungeonPortals() {
  return WILD_IDS.flatMap(m => (WILD[m].dungeonGates ?? []).map(d => ({ id: d.id, name: d.name, map: m as MapId, desc: d.desc, x: WILD[m].origin.x + d.x, z: WILD[m].origin.z + d.z, on: waypoints.has(`dp:${d.id}`) })))
    .sort((a, b) => WILD[a.map as WildId].levels[0] - WILD[b.map as WildId].levels[0]);
}

// ----- 传送阵面板：v1.2.73 横版改版（Rhett 11-02）——左导航 · 中目的地卡片（风格小画） · 右详情；整张卡就是传送按钮 -----
type TvItem = { key: string; art: string; artMap: string; name: string; region: string; sub: string; desc: string; tag: string; state: 'on' | 'here' | 'lock'; label: string;
  attr: string; packwp?: string; go: () => void };
export function openWaypoints() {
  const b = CX.$('travel-body'); b.innerHTML = '';
  const esc = CX.escHtml;
  const secs: { id: string; title: string; hint: string; items: TvItem[] }[] = [];
  // v0.9.2b 副本不再从营地直接进：到过门口的副本传送阵可以直接传到门口
  secs.push({ id: 'dp', title: '副本传送阵', hint: '到过门口才能传送', items: allDungeonPortals().map(p => {
    const here = CX.currentMap() === p.map && Math.hypot(CX.player.pos.x - p.x, CX.player.pos.z - p.z) < 25;
    const lock = isWildId(p.map) ? wildLock(p.map) : null;
    const st = !p.on || lock ? 'lock' : here ? 'here' : 'on';
    return { key: p.id, art: p.id, artMap: p.map, name: p.name, region: MAPS[p.map].name, sub: `${MAPS[p.map].name} · ${MAPS[p.map].levels} 级`, desc: p.desc, tag: st === 'lock' ? (lock ?? '还没到过门口') : st === 'here' ? '你在这里' : '可传送', state: st, label: '传送',
      attr: `data-dp="${p.id}"`, go: () => goMap(p.map, { x: p.x, z: p.z + 6 }, '传送') };
  }) });
  // 营地
  secs.push({ id: 'wp', title: '营地传送阵', hint: '到过的营地才能传送', items: allCamps().map(c => {
    const on = waypoints.has(c.id), here = CX.currentMap() === c.map && CX.dist2d(c.pos(), CX.player.pos) < 25;
    const lock = isWildId(c.map) ? wildLock(c.map) : null;
    const st = !on || lock ? 'lock' : here ? 'here' : 'on';
    return { key: c.id, art: c.map, artMap: c.map, name: c.name, region: MAPS[c.map].name, sub: `${MAPS[c.map].name} · ${MAPS[c.map].levels} 级`, desc: MAPS[c.map].desc, tag: st === 'lock' ? (lock ?? '还没到过这个营地') : st === 'here' ? '你在这里' : '可传送', state: st, label: '传送',
      attr: `data-wp="${c.id}"`, go: () => { const p = c.pos(); goMap(c.map, { x: p.x, z: p.z }, '传送'); } };
  }) });
  // v0.9.5a 路边传送石：激活过的都能传
  { const list = exWaystones();
    secs.push({ id: 'ws', title: '路边传送石', hint: `已激活 ${list.length} / ${EX_MAPS.reduce((n, m) => n + exWaystoneTotal(m), 0)}，野外路边走过去激活`, items: list.map(w => {
      const here = CX.currentMap() === w.map && Math.hypot(CX.player.pos.x - w.x, CX.player.pos.z - w.z) < 25;
      const lock = isWildId(w.map) ? wildLock(w.map) : null;
      const st = lock ? 'lock' : here ? 'here' : 'on';
      return { key: w.id, art: w.map, artMap: w.map, name: w.name, region: MAPS[w.map].name, sub: `${MAPS[w.map].name} · ${MAPS[w.map].levels} 级`, desc: '野外路边的传送石', tag: st === 'lock' ? lock! : st === 'here' ? '你在这里' : '可传送', state: st, label: '传送',
        attr: `data-ws="${w.id}"`, go: () => goMap(w.map as MapId, { x: w.x + 2.2, z: w.z + 2.2 }, '传送') };
    }) }); }
  // v0.8.0 暗岩深渊 + v0.9.7 内容包入口
  { const items: TvItem[] = [];
    const lock = abyssLock();
    items.push({ key: 'abyss', art: 'abyss', artMap: 'abyss', name: '暗岩深渊', region: '终局', sub: lock ? '终局 · 未解锁' : `最高 ${abyRec.best} / ${ABYSS.maxFloor} 层`, desc: '每层 +8% · 随机畸变与岔路，任何传送阵都能进', tag: lock ?? '可进入', state: lock ? 'lock' : 'on', label: '查看', attr: 'data-abyss="1"', go: () => openAbyss() });
    secs.push({ id: 'end', title: '暗岩深渊', hint: `终局 · ${ABYSS.maxFloor} 层`, items });
    const dlc: TvItem[] = [];
    for (const w of packList<PackWaypoint>('waypoints')) {
      // v1.2.76 Rhett 11-03：任务已把人带进这张图（营地传送阵已开通）→ 入口直接开，不再看前置任务
      const been = isWildId(w.zone as MapId) && WILD[w.zone as WildId].camps.some(c => waypoints.has(c.id));
      try { if (!been && w.hidden?.()) continue; } catch { /* 包出错当显示 */ }   // v1.2.71 可选：暂不列出
      const wl = been ? null : w.locked?.() ?? null, bd = (() => { try { return w.badge?.() ?? ''; } catch { return ''; } })();
      dlc.push({ key: w.id, art: 'pack', artMap: 'pack', name: w.name + (bd ? ` · ${bd}` : ''), region: '资料片', sub: wl ?? w.desc, desc: w.desc, tag: wl ?? '可前往', state: wl ? 'lock' : 'on', label: '前往', attr: '', packwp: w.id,
        go: () => { CX.togglePanel('travel', false); w.go(); } });
    }
    if (dlc.length) secs.push({ id: 'dlc', title: '资料片地图', hint: `${dlc.length} 张地图`, items: dlc }); }

  const nav = document.createElement('nav'); nav.className = 'tv-nav';
  const list = document.createElement('div'); list.className = 'tv-list';
  const det = document.createElement('aside'); det.className = 'tv-detail';
  let first: TvItem | null = null, hereItem: TvItem | null = null;
  const show = (it: TvItem) => {
    det.innerHTML = `<div class="tv-big">${travelArt(it.art, it.artMap, 300, 170, it.key)}<span class="tv-region">${esc(it.region)}</span></div>
      <h3>${esc(it.name)}</h3><div class="tv-dsub">${esc(it.sub)}</div><p class="tv-desc">${esc(it.desc)}</p>
      <div class="tv-state s-${it.state}">${it.state === 'lock' ? '<i class="lockic"></i>' : ''}${esc(it.tag)}</div>`;
    const go = document.createElement('button'); go.className = 'btn tv-gobtn'; go.textContent = it.state === 'here' ? '你在这里' : it.label; go.disabled = it.state !== 'on';
    go.onclick = () => it.go(); det.appendChild(go);
  };
  for (const sec of secs) {
    if (!sec.items.length && sec.id !== 'dp' && sec.id !== 'wp') continue;
    const on = sec.items.filter(x => x.state !== 'lock').length;
    const nb = document.createElement('button'); nb.className = 'tv-navb'; nb.innerHTML = `<b>${sec.title}</b><small>${on} / ${sec.items.length}</small>`;
    const h = document.createElement('h4'); h.className = 'tv-h'; h.innerHTML = `${sec.title}<small>（${esc(sec.hint)}）</small>`;
    nb.onclick = () => { h.scrollIntoView({ block: 'start', behavior: 'smooth' }); nav.querySelectorAll('.tv-navb').forEach(x => x.classList.toggle('on', x === nb)); };
    nav.appendChild(nb); list.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'tv-grid';
    for (const it of sec.items) {
      first ??= it.state === 'on' ? it : null; if (it.state === 'here') hereItem ??= it;
      const d = document.createElement('div'); d.className = `tv-card s-${it.state}`; if (it.packwp) d.dataset.packwp = it.packwp;
      d.innerHTML = `<button class="tv-hit" ${it.attr} ${it.state === 'on' ? '' : 'disabled'} title="${esc(it.state === 'on' ? `${it.label}：${it.name}` : it.tag)}">${travelArt(it.art, it.artMap, 160, 96, it.key)}<span class="tv-cap"><b>${esc(it.name)}</b><small>${esc(it.sub)}</small></span><span class="tv-tag">${it.state === 'lock' ? '<i class="lockic"></i>' : ''}${esc(it.tag)}</span></button>`;
      d.querySelector('button')!.onclick = () => it.go();
      d.addEventListener('mouseenter', () => show(it)); d.addEventListener('focusin', () => show(it));
      grid.appendChild(d);
    }
    if (!sec.items.length) grid.innerHTML = '<div class="tv-empty">还没有</div>';
    list.appendChild(grid);
  }
  nav.firstElementChild?.classList.add('on');
  const wrap = document.createElement('div'); wrap.className = 'tv-wrap'; wrap.append(nav, list, det); b.appendChild(wrap);
  const pick = hereItem ?? first ?? secs[0].items[0]; if (pick) show(pick);
  CX.$('travel-title').textContent = CX.zone === 'world' ? '区域传送阵 · 营地与副本门口' : '传送阵';
  CX.togglePanel('travel', true);
}

// ----- 回程（H / 技能栏旁的按钮）：读条 3 秒，无冷却；战斗中不能用；移动、翻滚、受伤打断 -----
export const RECALL_TIME = 3;

export const recall = { active: false, t: 0, hurt: -99, x: 0, z: 0 };

export function recallDest(): { map: MapId; pos: { x: number; z: number }; name: string } {
  if (CX.zone === 'dungeon' || CX.zone === 'world') return { map: 'camp', pos: { x: CX.CAMP.x, z: CX.CAMP.z }, name: '灰石营地' };
  if (CX.zone === 'field') { const p = BASE_CAMPS[1].pos(); return { map: 'field', pos: { x: p.x, z: p.z }, name: '翠风前哨' }; }
  if (CX.zone === 'raid') { const e = WILD.ember, c = e.camps.find(x => x.main)!; return { map: 'ember', pos: { x: e.origin.x + c.waypoint.x + 2.5, z: e.origin.z + c.waypoint.z }, name: c.name }; }
  const w = WILD[CX.zone as WildId];
  // 去最近的已开通营地（大地图有好几个）
  let best = w.camps.find(c => c.main)!, bd = Infinity;
  for (const c of w.camps) { if (!waypoints.has(c.id) && !c.main) continue; const d = Math.hypot(CX.player.pos.x - w.origin.x - c.x, CX.player.pos.z - w.origin.z - c.z); if (d < bd) { bd = d; best = c; } }
  return { map: CX.zone as MapId, pos: { x: w.origin.x + best.waypoint.x + 2.5, z: w.origin.z + best.waypoint.z }, name: best.name };
}

export function startRecall() {
  if (!CX.started || !CX.player.alive) return false;
  if (recall.active) { cancelRecall('取消回程'); return false; }
  if (inCombatNow()) { CX.toast('战斗中不能回程', '#f66'); CX.audio.error(); return false; }
  recall.active = true; recall.t = 0; recall.hurt = CX.player.lastHurt; recall.x = CX.player.pos.x; recall.z = CX.player.pos.z;
  if (autoPath.active) autoPath.stop('cancel');
  CX.player.rig.anim?.play('channel');
  CX.audio.recallStart();
  return true;
}

export function cancelRecall(msg: string) { if (!recall.active) return; recall.active = false; CX.toast(msg, '#f88'); CX.player.rig.anim?.loop('idle'); }

export function updateRecall(dt: number) {
  const bar = CX.$('recall-bar');
  const rb = CX.$('sk-recall'), off = inCombatNow();   // v0.6.7：战斗中回程按钮变灰
  if (rb.classList.contains('off') !== off) rb.classList.toggle('off', off);
  if (!recall.active) { if (bar.style.display !== 'none') bar.style.display = 'none'; return; }
  if (Math.hypot(CX.player.pos.x - recall.x, CX.player.pos.z - recall.z) > 0.3 || CX.dodge.rolling) return cancelRecall('回程被打断（移动）');
  if (CX.player.lastHurt > recall.hurt) return cancelRecall('回程被打断（受到伤害）');
  if (inCombatNow()) return cancelRecall('回程被打断（进入战斗）');
  recall.t += dt;
  bar.style.display = 'block';
  const d = recallDest();
  CX.$('recall-fill').style.width = `${Math.min(1, recall.t / RECALL_TIME) * 100}%`;
  CX.$('recall-name').textContent = `回程 → ${d.name}　${Math.max(0, RECALL_TIME - recall.t).toFixed(1)}`;
  if (Math.random() < 0.5) CX.particles.emit({ x: CX.player.pos.x, y: 0.2, z: CX.player.pos.z }, { count: 2, color: 0x8ad0ff, color2: 0xffffff, speed: 0.4, up: 2.5, radius: 0.8, life: 0.9, size: 0.25 });
  if (recall.t >= RECALL_TIME) {
    recall.active = false;
    if (CX.zone === 'dungeon') CX.leaveDungeon(true);
    if (CX.zone === 'raid') { goMap(d.map, d.pos, '回程'); CX.player.rig.anim?.loop('idle'); return; }
    if (d.map === CX.currentMap()) { CX.player.pos.set(d.pos.x, 0, d.pos.z); CX.target = null; CX.audio.portal(); CX.toast(`回到：${d.name}`, '#7fd7ff'); onZoneChanged(); }
    else goMap(d.map, d.pos, '回程');
    CX.player.rig.anim?.loop('idle');
  }
}

// ----- 仓库（所有营地连通）：点背包里的装备存入，点仓库里的取出 -----
export function openBank() {
  CX.togglePanel('dialog', false);
  renderBank();
  CX.togglePanel('bank', true);
  CX.audio.open();
}

export function renderBank() {
  if (CX.$('bank').style.display !== 'flex' && !CX.$('bank').dataset.force) { /* 打开时渲染 */ }
  const grid = (id: string, items: ItemInstance[], size: number, act: (it: ItemInstance) => void) => {
    const g = CX.$(id); g.innerHTML = '';
    for (let i = 0; i < size; i++) {
      const it = items[i];
      const d = document.createElement('div'); d.className = 'cell';
      if (it) { d.innerHTML = itemSlotHtml(it); d.onclick = () => { hideTip(); act(it); }; d.addEventListener('mouseenter', ev => showTip(itemTip(it, false), ev as MouseEvent)); d.addEventListener('mouseleave', hideTip); }
      else d.innerHTML = '<div class="slot empty"></div>';
      g.appendChild(d);
    }
  };
  grid('bank-bag', CX.inventory.bag, 30, it => { if (CX.bank.length >= BANK_SIZE) { CX.toast('仓库满了', '#f66'); return; } const x = CX.inventory.remove(it.id); if (x) { CX.bank.push(x); CX.audio.equip(); CX.save(); renderBank(); renderBag(); } });
  grid('bank-grid', CX.bank, BANK_SIZE, it => { if (!CX.inventory.add(it)) { CX.toast('背包满了', '#f66'); return; } CX.bank = CX.bank.filter(b => b !== it); CX.audio.equip(); CX.save(); renderBank(); });
  CX.$('bank-count').textContent = `仓库 ${CX.bank.length}/${BANK_SIZE} · 背包 ${CX.inventory.bag.length}/30`;
}

// ----- 世界事件：烬落荒原「熔岩喷发」 -----
export interface WorldEventState { def: NonNullable<typeof WILD.ember.events>[number]; map: WildId; next: number; active: boolean; wave: number; endAt: number; mobs: Enemy[]; killed: number; total: number; }

export const worldEvents: WorldEventState[] = WILD_IDS.flatMap(id => (WILD[id].events ?? []).map(def => ({ def, map: id, next: 90, active: false, wave: 0, endAt: 0, mobs: [], killed: 0, total: def.waves.reduce((a, w) => a + w.length, 0) })));

export function updateWorldEvents(dt: number) {
  const hud = CX.$('event-hud');
  let shown = false;
  for (const ev of worldEvents) {
    if (CX.zone !== ev.map) continue;           // 只在玩家所在地图跑
    const w = WILD[ev.map], sp = w.spots[ev.def.spot], cx = w.origin.x + sp.x, cz = w.origin.z + sp.z;
    if (!ev.active) {
      ev.next -= dt;
      if (ev.next <= 0) startEvent(ev);
      else if (ev.next < 30) { shown = true; hud.style.display = 'block'; CX.setText('event-hud', `${ev.def.name}：${Math.ceil(ev.next)} 秒后在${sp.name}爆发`); }
      continue;
    }
    shown = true;
    ev.killed = ev.mobs.filter(m => !m.alive).length + ev.def.waves.slice(0, ev.wave - 1).reduce((a, x) => a + x.length, 0);
    const left = Math.max(0, ev.endAt - CX.T);
    hud.style.display = 'block';
    CX.setText('event-hud', `⚠ ${ev.def.name} · 第 ${ev.wave}/${ev.def.waves.length} 波 · 击杀 ${ev.killed}/${ev.total} · 剩余 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    if (ev.mobs.every(m => !m.alive)) {
      if (ev.wave < ev.def.waves.length) spawnEventWave(ev, cx, cz);
      else finishEvent(ev, true, cx, cz);
    } else if (left <= 0) finishEvent(ev, false, cx, cz);
  }
  if (!shown && hud.style.display !== 'none') hud.style.display = 'none';
}

export function startEvent(ev: WorldEventState) {
  const w = WILD[ev.map], sp = w.spots[ev.def.spot];
  ev.active = true; ev.wave = 0; ev.endAt = CX.T + ev.def.duration; ev.mobs = []; ev.killed = 0;
  CX.yell(`${ev.def.name}！${sp.name}的地火正在喷涌，熔岩生物涌出来了！`, '#ff8a40', 6);
  CX.audio.roar();
  spawnEventWave(ev, w.origin.x + sp.x, w.origin.z + sp.z);
}

export function spawnEventWave(ev: WorldEventState, cx: number, cz: number) {
  ev.mobs.forEach(m => { const i = CX.enemies.indexOf(m); if (i >= 0 && !m.alive) { m.dispose(); CX.enemies.splice(i, 1); } });
  const kinds = ev.def.waves[ev.wave]; ev.wave++;
  ev.mobs = kinds.map((k, i) => {
    const a = i / kinds.length * Math.PI * 2, r = 5 + Math.random() * 3;
    const e = new CX.Enemy(k, ENEMY_TYPES[k], new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), ev.map, 'event', 0, 'trash_ember');
    e.brain.provoke?.();
    CX.enemies.push(e);
    CX.particles.emit({ x: e.pos.x, y: 0.2, z: e.pos.z }, { count: 30, color: 0xff5a10, color2: 0xffd080, speed: 3, up: 3, radius: 1, life: 0.9, size: 0.4 });
    return e;
  });
  if (ev.wave > 1) CX.toast(`${ev.def.name}：第 ${ev.wave} 波`, '#ff8a40');
}

export function finishEvent(ev: WorldEventState, ok: boolean, cx: number, cz: number) {
  ev.active = false; ev.next = ev.def.every;
  ev.mobs.forEach(m => { const i = CX.enemies.indexOf(m); if (i >= 0) { m.dispose(); CX.enemies.splice(i, 1); } if (CX.target === m) CX.target = null; });
  ev.mobs = [];
  wbOnEvent(ev.map, ok);   // v0.9.3d 熔岩喷发平息 → 炽翼 2 分钟后必刷
  if (!ok) { CX.yell(`${ev.def.name}平息了……这次没能守住。`, '#c0a080', 4); return; }
  CX.yell(`${ev.def.name}被平息了！`, '#ffd100', 4);
  repAdd(ev.map, REP_GAIN.event, '世界事件');   // v0.9.3f
  CX.audio.questDone();
  CX.inventory.addGold(ev.def.reward.gold); CX.toast(`+${ev.def.reward.gold} 金币`, '#ffd100');
  CX.addXp(ev.def.reward.xp);
  const r = CX.gen.roll(LOOT_TABLES.event_ember, CX.progression.level + 2);
  tagItems(r.items, 'wild', `世界事件 · ${ev.def.name}`);
  r.items.forEach((it, i) => CX.spawnLoot(it, new THREE.Vector3(cx, 0, cz), i, r.items.length));
  r.stacks.forEach(st => { CX.inventory.addStack(st.id, st.count); CX.toast(`获得 ${CX.forge.stackDef(st.id)?.name ?? st.id} ×${st.count}`, '#7fd7ff'); });
  CX.save();
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindTravel(__ctx: Ctx) {
  CX = __ctx;
  BASE_CAMPS = [
  { id: 'camp', map: 'camp', name: '灰石营地', pos: () => CX.CAMP.clone() },
  { id: 'field', map: 'field', name: '翠风前哨', pos: () => new THREE.Vector3(CX.F.x + FIELD_SPOTS.arrive.x, 0, CX.F.z + FIELD_SPOTS.arrive.z - 12) },
];
}
