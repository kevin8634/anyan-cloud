// 任务指引：HUD 追踪、焦点任务、路线、自动寻路、地面箭头、浮动目标标记
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindGuideUi(C) 初始化
import { introNew } from './nextstep';   // v0.9.6g
import * as THREE from 'three';
import { questHtml } from '../data/quest_tags';
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
import { sortByHere, zoneTag } from './questzone';   // v1.2.68
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
import { exShow } from './explore';
import { regionalOnZone } from './regional';
import type { Ctx, Enemy } from './main';

let CX!: Ctx;

// ======================================================================
// 任务指引：HUD 追踪（最多 3 个）/ 焦点任务 / 目标标记 / 地面路线 / 自动寻路
// ======================================================================
export let pinned: string[] = [];                 // 手动追踪的任务（顺序）

export const unpinned = new Set<string>();        // 手动取消追踪的任务

export let focusId: string | null = null;

export const npcName = (id: string) => NPCS[id]?.name ?? id;

export function trackedIds() {
  const act = CX.quests.active().map(a => a.q.id);
  return trackedList(act.filter(id => !unpinned.has(id)), pinned, 3);
}

export function focusQuestId(): string | null {
  const ids = trackedIds();
  if (!focusId || !ids.includes(focusId)) focusId = ids[0] ?? null;
  return focusId;
}

export const safe = <R>(f: () => R, fb: R): R => { try { return f(); } catch { return fb; } };

export let trackKey!: () => string;

export function saveTrack() { CX.safeLS.set(trackKey(), JSON.stringify({ pinned, unpinned: [...unpinned], focus: focusId })); }

export function loadTrack() {
  const t = safe(() => JSON.parse(CX.safeLS.get(trackKey()) ?? '{}'), {}) as { pinned?: string[]; unpinned?: string[]; focus?: string | null };
  pinned = t.pinned ?? []; unpinned.clear(); (t.unpinned ?? []).forEach(id => unpinned.add(id)); focusId = t.focus ?? null;
}

/** 设为焦点任务（点追踪栏的任务名） */
export function setFocus(id: string) {
  unpinned.delete(id);
  pinned = [id, ...pinned.filter(x => x !== id)].slice(0, 3);
  if (focusId !== id && autoPath.active) autoPath.stop('cancel');
  focusId = id; guideTimer = 0;
  saveTrack(); renderTracker();
}

export function toggleTrack(id: string) {
  if (trackedIds().includes(id)) { unpinned.add(id); pinned = pinned.filter(x => x !== id); if (focusId === id) focusId = null; }
  else { unpinned.delete(id); pinned = [id, ...pinned.filter(x => x !== id)].slice(0, 3); }
  guideTimer = 0; saveTrack(); renderTracker();
}

export interface Guide { t: GuideTarget; goal: { x: number; z: number; r: number }; final: boolean; link: MapLink | null; follow: boolean }

export let guide: Guide | null = null;

export let guidePath: Pos2[] = [];

export let guideTimer = 0;

/** 焦点任务现在该去哪：同区域 → 目标地点（击杀目标附近有怪就指向最近的怪，精英直接跟随）；其它区域 → 下一个传送点 */
export function guideFor(qid: string): Guide | null {
  const a = CX.quests.active().find(x => x.q.id === qid); if (!a) return null;
  const t = questTarget(CX.quests, a.q, a.p, a.ready, locateObjective, NPC_HOME, npcName);
  if (!t) return null;
  const cur = CX.currentMap();
  if (t.point.map === cur) {
    let goal = { x: t.point.x, z: t.point.z, r: t.point.r ?? 2 }, follow = false;
    const o = t.objIndex >= 0 ? a.q.objectives[t.objIndex] : null;
    if (o && (o.type === 'kill' || o.type === 'collect')) {
      const kinds = o.target === 'boar' ? ['boar', 'goldboar'] : [o.target];
      const nearArea = Math.hypot(CX.player.pos.x - goal.x, CX.player.pos.z - goal.z) < goal.r + 10;
      let best: Enemy | null = null, bd = Infinity;
      for (const e of CX.enemies) {
        if (!e.alive || e.z !== CX.zone || !kinds.includes(e.kind)) continue;
        if (o.target !== 'chief' && Math.hypot(e.pos.x - goal.x, e.pos.z - goal.z) > goal.r * 1.6) continue;
        const d = CX.dist2d(e.pos, CX.player.pos); if (d < bd) { bd = d; best = e; }
      }
      if (best && (o.target === 'chief' || nearArea)) { goal = { x: best.pos.x, z: best.pos.z, r: 5 }; follow = true; }
    }
    return { t, goal, final: true, link: null, follow };
  }
  const hop = nextHop(cur, t.point.map, MAP_LINKS);
  if (!hop) return null;
  return { t, goal: { x: hop.x, z: hop.z, r: 2.2 }, final: false, link: hop, follow: false };
}

export const arriveR = (g: Guide) => (!g.final ? 2.2 : g.follow ? 5 : Math.max(1.6, g.t.kind === 'turnin' || g.goal.r <= 3 ? g.goal.r : g.goal.r * 0.7));

export let goalDist!: () => number;

/** 每 0.5 秒：探索检测、重算焦点目标和 A* 路线（自动寻路时同步替换路径） */
export function updateGuide(dt: number) {
  guideTimer -= dt;
  if (guideTimer > 0) return;
  guideTimer = 0.5;
  for (const area of CX.quests.pendingExplores()) {
    const a = AREAS[area];
    if (a && a.map === CX.currentMap() && Math.hypot(CX.player.pos.x - a.x, CX.player.pos.z - a.z) <= (a.r ?? 3)) { CX.quests.onExplore(area); CX.toast(`发现：${a.name}`, '#ffd100'); CX.audio.questAccept(); CX.save(); }
  }
  const id = CX.zone === 'raid' ? null : focusQuestId();   // 长副本里不做任务指引
  guide = id ? guideFor(id) : null;
  if (!autoPath.active) raidAuto.on = false;
  if (!guide) { guidePath = []; if (autoPath.active && !(CX.zone === 'raid' && raidAuto.on)) autoPath.stop('cancel'); return; }   // v0.6.10 副本地图的自动寻路不归任务指引管
  const p = CX.navFor(CX.currentMap()).findPath(CX.player.pos.x, CX.player.pos.z, guide.goal.x, guide.goal.z);
  guidePath = p ?? [];
  if (autoPath.active && p) autoPath.setPath(p, guide.goal, arriveR(guide));
}

export const autoPath = new AutoPath();
/** v0.6.10：副本地图发起的自动寻路（任务指引不去停它） */
export const raidAuto = { on: false };

export let pendingArrive!: boolean;

export let resumeAuto!: boolean;

export function inCombatNow() { return CX.enemies.some(e => e.alive && e.z === CX.zone && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack')); }

export function startAutoPath(): boolean {
  if (!CX.started || !CX.player.alive) return false;
  if (inCombatNow()) { CX.toast('战斗中无法自动寻路', '#ff9a40'); CX.audio.error(); return false; }
  guideTimer = 0; updateGuide(0);
  if (!guide) { CX.toast('没有可前往的任务目标', '#dddddd'); return false; }
  if (goalDist() <= arriveR(guide)) { pendingArrive = true; return true; }
  if (!autoPath.start(guidePath, guide.goal, CX.T, arriveR(guide))) return false;
  CX.toast(`自动寻路：${guide.final ? guide.t.label : `前往${guide.link!.name}`}`, '#7fd7ff');
  CX.textCache.delete('qt');
  return true;
}

export function toggleAutoPath() { if (autoPath.active) autoPath.stop('cancel'); else startAutoPath(); renderTracker(); }

/** 自动寻路到达：传送点就穿过去继续走；NPC 就打开对话 */
export function onAutoArrive() {
  pendingArrive = false;
  const g = guide; if (!g) return;
  if (!g.final && g.link) {
    const l = g.link;
    if (l.to === 'darkrock_mine' || l.to === 'rotting_temple') {   // v0.9.2b 副本区门口传送阵：直接进
      const lock = CX.dungeonLock(l.to); if (lock) { CX.toast(lock, '#f66'); return; }
      CX.enterDungeon(l.to); return;
    }
    resumeAuto = true;
    let ok = true;
    if (l.from === 'camp' && l.to === 'field') ok = CX.enterField();
    else if (l.from === 'field' && l.to === 'camp') CX.leaveField();
    else if (isWildId(l.to) || isWildId(l.from) || l.to === 'field') { if (isWildId(l.to)) { if (CX.wildLock(l.to)) ok = false; else CX.ensureWild(l.to); } if (ok) ok = CX.useGate(l.from as MapId, l.to as MapId); }
    else CX.leaveDungeon();
    if (!ok) { resumeAuto = false; return; }
    guideTimer = 0;
    startAutoPath();
    resumeAuto = false;
    return;
  }
  CX.toast(`到达：${g.t.questName}`, '#3f3');
  const q = CX.quests.def(g.t.questId);
  const o = g.t.objIndex >= 0 ? q.objectives[g.t.objIndex] : null;
  const npc = g.t.kind === 'turnin' ? q.turnIn : o?.type === 'talk' ? o.npc : null;
  const n = npc ? CX.npcs.find(x => x.id === npc && x.z === CX.zone) : null;
  if (n && CX.dist2d(n.rig.root.position, CX.player.pos) < 4) CX.openDialog(n.id);
}

export function onZoneChanged() {
  exShow();   // v0.9.3e 探索物件只显示当前地图的
  regionalOnZone();   // v0.9.3f 离图：进行中的动态事件收掉
  CX.save();   // 切换地图立刻存档
  if (CX.zone === 'world' && CX.started && CX.tutStep < 0 && CX.tutState >= 0) setTimeout(() => { if (CX.zone === 'world' && CX.tutStep < 0 && CX.tutState >= 0) CX.tutStart(CX.tutState, true); }, 600);
  guideTimer = 0; guidePath = []; guide = null;
  if (!resumeAuto && autoPath.active) autoPath.stop('cancel');
}

export function renderTracker() {
  const ids = trackedIds(), fid = focusQuestId(), act = CX.quests.active();
  let html = CX.started ? `<div class="trk-next"><span class="trk-btn${introNew() ? ' gd-new' : ''}" id="btn-next">★ 玩法介绍<b class="gd-spk"><i></i><i></i><i></i></b></span></div>` : '';   // v0.7.13
  html += ids.length ? `<div class="trk-h"><span id="trk-fold" title="折叠/展开"><i>▾</i>任务追踪</span><span class="trk-btn${autoPath.active ? ' on' : ''}" id="btn-autopath">${autoPath.active ? '■ 停止寻路' : '➤ 自动寻路'}</span></div>` : '';
  const zs = new Map(sortByHere(act, CX.currentMap()).map(x => [x.q.id, x]));   // v1.2.68 区域小字
  for (const id of ids) {
    const a = act.find(x => x.q.id === id)!;
    const f = id === fid;
    const zz = zs.get(id);
    const where = (() => { const g = f ? guide : null; if (!g) return ''; return g.final ? '' : `<div class="trk-go">→ 经${g.link!.name}前往${MAPS[g.t.point.map as MapId]?.name ?? ''}</div>`; })();
    html += `<div class="trk${f ? ' focus' : ''}" data-focus="${id}"><div class="qt">${f ? '◆ ' : ''}${questHtml(a.q, true)}</div>${zz ? zoneTag(zz.zones, zz.rank) : ''}` + (a.ready
      ? `<div class="ok">✔ 回去找${npcName(a.q.turnIn)}</div>`
      : a.q.objectives.map((o, i) => `<div class="${a.p[i] >= objectiveMax(o) ? 'done' : ''}">${CX.quests.objectiveText(o, a.p[i])}</div>`).join('')) + where + '</div>';
  }
  if (act.length > ids.length) html += `<div class="trk-more">另有 ${act.length - ids.length} 个任务 · L 打开任务日志</div>`;
  if (CX.textCache.get('qt') !== html) { CX.textCache.set('qt', html); CX.$('quest-tracker').innerHTML = html; }
}

// ---------- 地面路线：发光的箭头（V 形）沿 A* 路线滚动 ----------
export const CHEV_MAX = 160;

export let chevMesh!: THREE.InstancedMesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap>;

export let chevM4!: THREE.Matrix4;

export let chevQ!: THREE.Quaternion;

export let chevS!: THREE.Vector3;

export let chevP!: THREE.Vector3;

export let chevC!: THREE.Color;

export let chevUp!: THREE.Vector3;

export let onBridge!: (x: number, z: number) => boolean;

export function pathY(x: number, z: number) { return CX.zone === 'field' ? (onBridge(x, z) ? 0.3 : Math.max(0, CX.fieldY(x, z)) + 0.1) : CX.zone === 'world' ? M.groundY(x, z) + 0.1 : CX.groundAt(x, z) + 0.1; }

export function hidePathLine() { chevMesh.count = 0; }   // v1.2.38c 录制模式
export function updatePathLine() {
  const pts: Pos2[] = autoPath.active ? autoPath.remaining(CX.player.pos) : guidePath.length ? [{ x: CX.player.pos.x, z: CX.player.pos.z }, ...guidePath] : [];
  if (!CX.started || !guide || pts.length < 2 || !CX.player.alive || goalDist() < 2.5) { chevMesh.count = 0; return; }
  const spacing = 1.6, start = 1.4;
  let n = 0, along = 0, next = start + ((CX.T * 2.6) % spacing);
  for (let i = 0; i < pts.length - 1 && n < CHEV_MAX; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-3) continue;
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    chevQ.setFromAxisAngle(chevUp, Math.atan2(-dx, -dz));
    while (next <= along + L && n < CHEV_MAX) {
      const t = next - along, x = a.x + dx * t, z = a.z + dz * t;
      chevP.set(x, pathY(x, z), z);
      chevM4.compose(chevP, chevQ, chevS); chevMesh.setMatrixAt(n, chevM4);
      const fade = Math.max(0.25, 1 - next / 120) * (autoPath.active ? 1 : 0.75);
      chevMesh.setColorAt(n, chevC.setScalar(fade));
      n++; next += spacing;
    }
    along += L;
  }
  chevMesh.count = n;
  chevMesh.instanceMatrix.needsUpdate = true;
  if (chevMesh.instanceColor) chevMesh.instanceColor.needsUpdate = true;
}

// ---------- 浮动目标标记（屏幕上的菱形 + 距离；目标在屏幕外时贴边并指向它）----------
export let objMarker!: HTMLElement;

export function updateObjMarker() {
  if (!CX.started || !guide || !CX.player.alive) { objMarker.style.display = 'none'; return; }
  const d = goalDist();
  // 击杀/采集类目标（目标点上有怪）：标记贴地，不压在怪物名牌和伤害数字上
  const onMobs = guide.final && guide.t.kind === 'objective' && /击杀|击败|消灭|收集|采集/.test(guide.t.label);
  const p3 = new THREE.Vector3(guide.goal.x, (CX.zone === 'field' ? Math.max(0, CX.fieldY(guide.goal.x, guide.goal.z)) : CX.groundAt(guide.goal.x, guide.goal.z)) + (onMobs ? 0.3 : 2.6), guide.goal.z);
  CX.v3.copy(p3).project(CX.camera);
  const W = window.innerWidth, H = window.innerHeight;
  let x = (CX.v3.x + 1) / 2 * W, y = (1 - CX.v3.y) / 2 * H;
  const behind = CX.v3.z > 1;
  if (behind) { x = W - x; y = H - y; }
  const m = 46;
  const off = behind || x < m || x > W - m || y < m || y > H - m;
  let ang = 0;
  if (off) {
    const cx = W / 2, cy = H / 2;
    let vx = x - cx, vy = y - cy; if (behind) { vx = -vx || 0.001; vy = Math.abs(vy) + 1; }
    const k = Math.min((W / 2 - m) / Math.abs(vx || 1e-3), (H / 2 - m) / Math.abs(vy || 1e-3));
    x = cx + vx * k; y = cy + vy * k; ang = Math.atan2(vy, vx) * 180 / Math.PI + 90;
  }
  objMarker.style.display = 'block';
  objMarker.style.left = `${x}px`; objMarker.style.top = `${y}px`;
  objMarker.classList.toggle('edge', off);
  // 战斗中：只留菱形和距离，任务文字收起、整体变淡
  objMarker.classList.toggle('fight', inCombatNow() || (onMobs && d < 18 && !off));
  (objMarker.querySelector('.arw') as HTMLElement).style.transform = `rotate(${ang}deg)`;
  const label = guide.final ? guide.t.label.replace(/ \d+\/\d+$/, '') : guide.link!.name;
  CX.setText('om-name', label); CX.setText('om-dist', `${Math.round(d)} 米`);
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindGuideUi(__ctx: Ctx) {
  CX = __ctx;
  trackKey = () => `darkrock_track_${CX.curChar?.id ?? CX.cls.id}`;
  goalDist = () => (guide ? Math.hypot(CX.player.pos.x - guide.goal.x, CX.player.pos.z - guide.goal.z) : 0);
  pendingArrive = false;
  resumeAuto = false;
  autoPath.onStop = reason => {
    if (reason === 'arrived') pendingArrive = true;       // 到达后的处理（穿传送门/开对话）放到下一帧，避免在移动中途换区域
    else CX.toast(AUTOPATH_STOP_TEXT[reason], reason === 'input' ? '#dddddd' : '#ff9a40');
    CX.textCache.delete('qt');
  };
  CX.$('quest-tracker').addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el.closest('#btn-autopath')) { toggleAutoPath(); CX.audio.click(); return; }
    if (el.closest('#trk-fold')) { CX.$('quest-tracker').classList.toggle('fold'); CX.audio.click(); return; }
    const f = el.closest('[data-focus]') as HTMLElement | null;
    if (f) { setFocus(f.dataset.focus!); CX.audio.click(); }
  });
  chevMesh = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.5, -0.15); sh.lineTo(0, 0.3); sh.lineTo(0.5, -0.15); sh.lineTo(0.5, 0.12); sh.lineTo(0, 0.57); sh.lineTo(-0.5, 0.12); sh.closePath();
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc840).multiplyScalar(1.8), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }), CHEV_MAX);
  m.frustumCulled = false; m.count = 0; m.renderOrder = 2;
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  return M.noOutline(m);
})();
  CX.scene.add(chevMesh);
  chevM4 = new THREE.Matrix4();
  chevQ = new THREE.Quaternion();
  chevS = new THREE.Vector3(1, 1, 1);
  chevP = new THREE.Vector3();
  chevC = new THREE.Color();
  chevUp = new THREE.Vector3(0, 1, 0);
  onBridge = (x: number, z: number) => CX.zone === 'field' && x - CX.F.x > BRIDGE.x0 - 0.5 && x - CX.F.x < BRIDGE.x1 + 0.5 && Math.abs(z - CX.F.z - riverZ(x - CX.F.x)) < 6.5;
  objMarker = CX.$('obj-marker');
}
