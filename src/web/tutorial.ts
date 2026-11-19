// 新手引导：移动 / 对话 / 接任务 / 战斗 / 翻滚 / 背包 / 天赋，步骤提示与箭头
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindTutorial(C) 初始化
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
import type { Ctx, Enemy } from './main';

let CX!: Ctx;
   // → shopmap.ts

// ======================================================================
// 新手引导：新角色第一次进营地时开始（进度存在角色存档里），一步一步提示 + 高亮界面 + 场景箭头；
// 每一步在玩家真的做了那件事之后自动前进；随时可跳过，设置里可以重玩
// 移动 → 和布兰对话 → 接任务并跟随路线/自动寻路 → 打训练假人（普攻 + 技能）→ 翻滚躲红圈 → 拾取并穿上装备 → 加天赋点 → 打开世界地图
// ======================================================================
export type TutId = 'move' | 'talk' | 'quest' | 'fight' | 'dodge' | 'loot' | 'equip' | 'talent' | 'map';

export const TUT_ORDER: TutId[] = ['move', 'talk', 'quest', 'fight', 'dodge', 'loot', 'equip', 'map'];   // v0.7.7：天赋 10 级才开放，引导里去掉天赋一步（升到 10 级时提示）

export let tutStep = -1;           // 当前正在进行的步骤（-1 = 没有在引导）

export let tutReplay = false;      // 从设置里重玩（已经玩过：放宽部分条件）

export let dummy: Enemy | null = null;

export const DUMMY_POS = new THREE.Vector3(7, 0, -6);

export const tutD = {
  from: new THREE.Vector3(), moved: 0, acceptFrom: null as THREE.Vector3 | null,
  basic: false, skill: false,
  circle: null as null | { disc: THREE.Mesh; mat: THREE.ShaderMaterial; p: Pos; r: number; left: number; total: number; rolled: boolean },
  circleCd: 0, walkOuts: 0, hits: 0,
  item: null as ItemInstance | null, spent0: 0, autoNext: 0,
};

export let tutWantsDummy!: () => boolean;

export const kc = (k: string) => `<b class="kc">${k}</b>`;

/** 手机抽屉收起时，菜单按钮要先高亮「≡」 */
export let menuBtn!: (id: string) => HTMLElement;

export let TUT!: Record<TutId, { title: string; text: () => string; hl: () => (globalThis.Element | null)[]; arrow?: () => THREE.Vector3 | null }>;

/** v1.2.2 训练假人掉的武器部位：法师双手；其他职业单手，本职业没有单手武器底材（只用双手武器的内容包职业）时改双手 */
function tutWeaponSlots(): ('oneHand' | 'twoHand')[] {
  if (CX.cls.id === 'mage') return ['twoHand'];
  const own = LOOT_DATA.bases.filter(b => b.weaponType && (!b.cls || b.cls === CX.cls.id) && (CX.cls.equip.weapons ?? []).includes(b.weaponType));
  return own.some(b => b.slot === 'oneHand') || !own.some(b => b.slot === 'twoHand') ? ['oneHand'] : ['twoHand'];
}
export function tutStart(step: number, replay = false) {
  if (CX.zone !== 'world' || step < 0 || step >= TUT_ORDER.length) return;
  tutReplay = replay;
  tutStep = step; CX.tutState = step;
  document.documentElement.classList.add('tut-on');
  CX.$('tut').style.display = 'block';
  tutEnter();
}

export function tutEnter() {
  const id = TUT_ORDER[tutStep];
  tutD.from.copy(CX.player.pos); tutD.moved = 0; tutD.autoNext = 0;
  if (id === 'quest') tutD.acceptFrom = null;
  if (id === 'fight') { tutD.basic = tutD.skill = false; if (autoPath.active) autoPath.stop('cancel'); if (dummy) CX.target = dummy; }
  if (id === 'dodge') { tutD.circleCd = 1.2; tutD.walkOuts = 0; tutD.hits = 0; if (dummy) CX.target = dummy; }
  if (id === 'loot') {
    // 训练假人掉一件绿色武器（新角色手上是空的，必然是提升）
    const it = CX.gen.generate(Math.max(3, CX.progression.level + 1), 'green', tutWeaponSlots());
    tutD.item = it;
    const at = dummy ? dummy.pos.clone().lerp(CX.player.pos, CX.dist2d(dummy.pos, CX.player.pos) > 6 ? 0.8 : 0.3) : CX.player.pos.clone();
    CX.spawnLoot(it, at, 0, 1);
    CX.audio.loot('green');
  }
  if (id === 'talent') {
    tutD.spent0 = CX.tree.totalPoints - CX.tree.available;
    if (CX.tree.available < 1 && CX.progression.level < 2) { CX.toast('训练完成！获得经验', '#ffd100'); CX.addXp(Math.max(1, CX.progression.xpToNext() - CX.progression.xp)); }
    if (CX.tree.available < 1) tutD.autoNext = CX.T + 2.5;          // 重玩时点数可能早就花完了
  }
  renderTut(true);
}

export function tutAdvance() {
  if (tutStep < 0) return;
  CX.audio.tutStep();
  tutClearCircle();
  tutStep++;
  if (tutStep >= TUT_ORDER.length) { tutFinish(false); return; }
  CX.tutState = tutStep;
  tutEnter();
  CX.save();
}

export function tutFinish(skipped: boolean) {
  tutClearCircle();
  tutStep = -1; CX.tutState = -1; tutReplay = false;
  document.documentElement.classList.remove('tut-on');
  CX.$('tut').style.display = 'none'; CX.$('tut-arrow').style.display = 'none';
  document.querySelectorAll('.tut-hl').forEach(h => (h as HTMLElement).style.display = 'none');
  CX.toast(skipped ? '已跳过新手引导（设置里可以重玩）' : '新手引导完成！去狼林帮布兰解决狼患吧', '#ffd100');
  if (!skipped) { CX.audio.questDone(); CX.particles.emit({ x: CX.player.pos.x, y: 0.3, z: CX.player.pos.z }, { count: 60, color: 0xffd34d, color2: 0xffffff, speed: 2, up: 3, life: 1.2, size: 0.35, drag: 0.6 }); }
  CX.save();
}

export function tutClearCircle() { if (tutD.circle) { CX.scene.remove(tutD.circle.disc); tutD.circle = null; } }

/** 游戏事件 → 引导（对话、打假人、翻滚、打开面板） */
export function tutEvent(kind: 'talk' | 'dummyHit' | 'roll' | 'panel', arg?: string) {
  if (tutStep < 0) return;
  const id = TUT_ORDER[tutStep];
  if (kind === 'talk' && id === 'talk' && arg === 'bran') { tutAdvance(); return; }
  if (kind === 'dummyHit' && id === 'fight') { if (arg === 'basic') tutD.basic = true; else tutD.skill = true; renderTut(true); if (tutD.basic && tutD.skill) tutAdvance(); return; }
  if (kind === 'roll' && id === 'dodge' && tutD.circle) tutD.circle.rolled = true;
  if (kind === 'panel' && id === 'map' && arg === 'worldmap') { tutAdvance(); return; }
  if (kind === 'panel' && id === 'equip' && arg === 'char' && tutReplay) { tutAdvance(); return; }
}

export let tutTimer = 0;

export function updateTutorial(dt: number) {
  if (tutStep < 0) return;
  if (CX.zone !== 'world') { CX.$('tut').style.display = 'none'; CX.$('tut-arrow').style.display = 'none'; document.querySelectorAll('.tut-hl').forEach(h => (h as HTMLElement).style.display = 'none'); return; }
  CX.$('tut').style.display = 'block';
  const id = TUT_ORDER[tutStep];
  switch (id) {
    case 'move': tutD.moved += Math.max(CX.dist2d(CX.player.pos, tutD.from), CX.inputDir() && !CX.anyPanelOpen() ? dt * 3 : 0); tutD.from.copy(CX.player.pos); if (tutD.moved > 3) tutAdvance(); break;   // 累计走 3 米（顶着篝火推也算在操作）
    case 'quest': {
      const st = CX.quests.state('q_wolves', CX.progression.level);
      if (st !== 'available' && st !== 'locked') {
        if (!tutD.acceptFrom) tutD.acceptFrom = CX.player.pos.clone();
        if ((autoPath.active || CX.dist2d(CX.player.pos, tutD.acceptFrom) > 6) && CX.$('dialog').style.display !== 'flex') tutAdvance();
      }
      break;
    }
    case 'dodge': updateTutCircle(dt); break;
    case 'loot': if (tutD.item && (CX.inventory.bag.some(i => i.id === tutD.item!.id) || CX.inventory.equippedItems().some(i => i.id === tutD.item!.id))) tutAdvance();
      else if (tutD.item && !CX.loots.some(l => l.loot === tutD.item)) tutAdvance();   // 背包满等意外：别卡住
      break;
    case 'equip': if (tutD.item && CX.inventory.equippedItems().some(i => i.id === tutD.item!.id)) tutAdvance(); break;
    case 'talent': if (CX.tree.totalPoints - CX.tree.available > tutD.spent0 || (tutD.autoNext && CX.T > tutD.autoNext)) tutAdvance(); break;
    default: break;
  }
  if (tutStep < 0) return;
  tutTimer -= dt;
  renderTut(tutTimer <= 0);
}

/** 假人的红圈：玩家在假人附近时，每隔一会儿在脚下砸一个（1.5 秒），被砸中扣一点血，翻滚躲开就过关 */
export function updateTutCircle(dt: number) {
  if (!dummy) { tutAdvance(); return; }
  const c = tutD.circle;
  if (!c) {
    tutD.circleCd -= dt;
    if (tutD.circleCd <= 0 && CX.dist2d(CX.player.pos, dummy.pos) < 14 && CX.player.alive && !CX.anyPanelOpen()) {
      const mat = G.telegraphMaterial();
      const r = 2.6, total = 1.5;
      const disc = M.noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
      disc.rotation.x = -Math.PI / 2; disc.position.set(CX.player.pos.x, 0.06 + M.groundY(CX.player.pos.x, CX.player.pos.z), CX.player.pos.z);
      CX.scene.add(disc);
      tutD.circle = { disc, mat, p: CX.player.getPos(), r, left: total, total, rolled: CX.dodge.rolling };
      dummy.rig.body.rotation.z = 0.3;
      CX.audio.telegraph();
    }
    return;
  }
  c.left -= dt;
  c.mat.uniforms.progress.value = Math.min(1, 1 - c.left / c.total); c.mat.uniforms.time.value = CX.T;
  if (c.left > 0) return;
  dummy.rig.body.rotation.z = 0;
  const inside = Math.hypot(CX.player.pos.x - c.p.x, CX.player.pos.z - c.p.z) <= c.r;
  CX.spawnRing(c.p, c.r, '#ff6040', 0.3);
  CX.particles.emit({ x: c.p.x, y: 0.1, z: c.p.z }, { count: 30, color: 0x8a7a66, color2: 0xff7040, speed: 3, up: 1.2, radius: c.r * 0.8, life: 0.7, size: 0.4, gravity: 6 });
  CX.audio.bossSlam(); CX.feel.emit('bossSlamMiss');
  tutClearCircle();
  if (inside && !CX.player.status.isInvulnerable) {
    tutD.hits++; tutD.circleCd = 2.2;
    CX.fx.dealDamage(CX.player, Math.max(1, Math.round(CX.player.maxHp * 0.06)), 'physical', dummy);
    renderTut(true);
    return;
  }
  if (inside || c.rolled) { CX.floatText(CX.player, inside ? '完美闪避！' : '躲开了！', '#bfe6ff', 1.3); tutAdvance(); return; }
  // 走出去的也算躲开，但这一步是教翻滚：提示一次再来，第二次直接过
  if (++tutD.walkOuts >= 2) { CX.floatText(CX.player, '躲开了！', '#bfe6ff', 1.2); tutAdvance(); return; }
  CX.toast('躲开了！这次试试用翻滚', '#bfe6ff'); tutD.circleCd = 1.5;
}

/** 提示框文字 + 高亮框 + 场景箭头（位置每帧更新，文字每 0.25 秒刷新一次） */
export const tutHls: HTMLElement[] = [];

export function renderTut(text: boolean) {
  if (tutStep < 0) return;
  const id = TUT_ORDER[tutStep], def = TUT[id];
  if (text) {
    tutTimer = 0.25;
    const html = `<div class="tut-h"><span>新手引导 · ${def.title}</span><span class="tut-n">${tutStep + 1} / ${TUT_ORDER.length}</span></div><div class="tut-t">${def.text()}</div><div class="tut-dots">${TUT_ORDER.map((_, i) => `<i class="${i < tutStep ? 'done' : i === tutStep ? 'cur' : ''}"></i>`).join('')}</div>`;
    const body = CX.$('tut-body');
    if (body.dataset.h !== html) { body.dataset.h = html; body.innerHTML = html; }
  }
  // 高亮界面元素
  const els = def.hl().filter((e): e is HTMLElement => !!e && (e as HTMLElement).offsetParent !== null);
  while (tutHls.length < els.length) { const h = document.createElement('div'); h.className = 'tut-hl'; document.body.appendChild(h); tutHls.push(h); }
  tutHls.forEach((h, i) => {
    const e = els[i];
    const r = e?.getBoundingClientRect();
    if (!e || !r || (!r.width && !r.height)) { h.style.display = 'none'; return; }
    h.style.display = 'block';
    h.style.left = `${r.left - 5}px`; h.style.top = `${r.top - 5}px`; h.style.width = `${r.width + 10}px`; h.style.height = `${r.height + 10}px`;
    h.style.borderRadius = getComputedStyle(e).borderRadius || '10px';
  });
  // 场景里的箭头（NPC / 假人 / 掉落）
  const ar = CX.$('tut-arrow');
  const wp = CX.anyPanelOpen() ? null : def.arrow?.() ?? null;
  if (!wp) { ar.style.display = 'none'; return; }
  const s = CX.project(wp);
  ar.style.display = s.vis ? 'block' : 'none';
  ar.style.left = `${Math.max(20, Math.min(window.innerWidth - 20, s.x))}px`; ar.style.top = `${Math.max(40, Math.min(window.innerHeight - 20, s.y))}px`;
}

/** 设置里「重玩新手引导」 */
export function replayTutorial() {
  CX.togglePanel('settings', false);
  tutClearCircle();
  if (CX.zone === 'world') tutStart(0, true);
  else { CX.tutState = 0; tutReplay = true; CX.toast('回到灰石营地后开始新手引导', '#ffd100'); CX.save(); }
}

/** 训练假人：立在营地东南角（打不死、不还手、不会被当成战斗中） */
export function spawnDummy() {
  const d = new CX.Enemy('dummy', ENEMY_TYPES.dummy, DUMMY_POS, 'world');
  d.yaw = Math.atan2(CX.CAMP.x - DUMMY_POS.x, CX.CAMP.z - DUMMY_POS.z);
  d.brain = { update: () => ({ state: 'idle', moveDir: null, speed: 0, faceTo: null, attacked: false }), provoke() {} };
  d.plate.querySelector('div')!.setAttribute('style', 'color:#e8d8a8');
  CX.enemies.push(d);
  dummy = d;
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindTutorial(__ctx: Ctx) {
  CX = __ctx;
  tutWantsDummy = () => tutStep >= 0 && (TUT_ORDER[tutStep] === 'fight' || TUT_ORDER[tutStep] === 'dodge');
  menuBtn = (id: string) => (CX.$(id).closest('#menu') && !document.documentElement.classList.contains('menu-open') ? CX.$('btn-menu') : CX.$(id));
  TUT = {
  move: { title: '移动',
    text: () => CX.isTouch ? '按住屏幕<b>左侧</b>拖动摇杆移动角色；在右侧滑动可以转动镜头。' : `用 ${kc('W')}${kc('A')}${kc('S')}${kc('D')} 移动角色；按住鼠标拖动转动镜头，滚轮拉近拉远。`,
    hl: () => CX.isTouch ? [CX.$('joy-base')] : [] },
  talk: { title: '和 NPC 对话',
    text: () => `布兰头顶有黄色的 <b class="y">!</b>，说明他有任务给你。走到他身边，${CX.isTouch ? '点「对话」按钮' : `按 ${kc('E')}（或点「对话」按钮）`}和他交谈。`,
    hl: () => [CX.$('interact').style.display === 'block' ? CX.$('interact') : null],
    arrow: () => CX.npcs.find(n => n.id === 'bran')?.rig.root.position.clone().setY(3.4) ?? null },
  quest: { title: '接任务 · 跟随路线',
    text: () => CX.quests.state('q_wolves', CX.progression.level) === 'available' ? '点「接受任务」接下「狼患」。' : '任务已经出现在右侧的追踪栏里。点「<b>➤ 自动寻路</b>」，或者沿着地上的金色箭头走几步。',
    hl: () => CX.$('dialog').style.display === 'flex' ? [CX.$('dlg-body').querySelector('.btn')] : [document.getElementById('btn-autopath')] },
  fight: { title: '攻击训练假人',
    text: () => `出发前先热热身：攻击营地东南边的<b>训练假人</b>。${CX.isTouch ? '点普攻键，再点任意一个技能键。' : `普攻 ${kc('空格')} 和技能 ${kc('1')}${kc('2')}${kc('3')} 各用一次。`}<span class="tut-ck">${tutD.basic ? '✔' : '○'} 普攻　${tutD.skill ? '✔' : '○'} 技能</span>${CX.cls.ext?.guide?.fight ? `<div class="tut-cls">${CX.cls.ext.guide.fight}</div>` : ''}`,
    hl: () => [tutD.basic ? null : CX.$('sk-basic'), tutD.skill ? null : CX.$('sk-skill1')],
    arrow: () => dummy && CX.dist2d(dummy.pos, CX.player.pos) > 3 ? dummy.pos.clone().setY(3.2) : null },
  dodge: { title: '闪避翻滚',
    text: () => `训练假人会在你脚下砸出<b class="r">红圈</b>！红圈落下前${CX.isTouch ? '点<b>翻滚键</b>' : `按 ${kc('Shift')}`}闪避翻滚——翻滚的一瞬间<b>无敌</b>，冷却 ${CX.dodge.cooldown.toFixed(0)} 秒。${tutD.hits ? `<span class="tut-ck">被砸中 ${tutD.hits} 次，再试一次</span>` : ''}`,
    hl: () => [CX.$('sk-dodge')],
    arrow: () => dummy && CX.dist2d(dummy.pos, CX.player.pos) > 12 ? dummy.pos.clone().setY(3.2) : null },
  loot: { title: '拾取装备',
    text: () => `假人掉出了一件<b class="g">装备</b>！走过去${CX.settings.autoLoot ? '就能自动拾取' : (CX.isTouch ? '，点「拾取」按钮' : `，按 ${kc('E')} 拾取`)}。`,
    hl: () => [!CX.settings.autoLoot && CX.$('interact').style.display === 'block' ? CX.$('interact') : null],
    arrow: () => { const L = CX.loots.find(l => typeof l.loot !== 'number' && l.loot.id === tutD.item?.id); return L ? L.obj.position.clone().setY(2.2) : null; } },
  equip: { title: '穿上装备',
    text: () => `${CX.isTouch ? '点「角色」' : `按 ${kc('C')}（或点「角色」）`}打开角色面板，点<b>主手</b>格，再点新武器旁边的「装备」。`,
    hl: () => {
      if (CX.$('char').style.display !== 'flex') return [CX.$('bag').style.display === 'flex' ? CX.$('bag-char') : menuBtn('btn-char')];
      if (CX.charSel !== 'mainHand') return [CX.$('pd-bottom').querySelector('[data-slot="mainHand"]')];
      return [tutD.item ? CX.$('char-tip').querySelector(`[data-eq="${tutD.item.id}"]`) : null];
    } },
  talent: { title: '天赋',
    text: () => CX.tree.available > 0 ? `你有 <b class="g">${CX.tree.available}</b> 个天赋点！${CX.isTouch ? '点「天赋」' : `按 ${kc('N')}（或点「天赋」）`}，选一个发绿光的天赋，点「加点」。` : '天赋点已经分配好了。',
    hl: () => {
      if (CX.$('talent').style.display !== 'flex') return [menuBtn('btn-talent')];
      const add = document.getElementById('t-add') as HTMLButtonElement | null;
      return [add && !add.disabled ? add : CX.$('tal-tree').querySelector('.tnode.can')];
    } },
  map: { title: '世界地图',
    text: () => `最后，${CX.isTouch ? '点「地图」' : `按 ${kc('M')}（或点「地图」）`}打开世界地图，看看营地周围有什么。`,
    hl: () => [menuBtn('btn-map')] },
};
  CX.$('tut-skip').addEventListener('click', e => { e.stopPropagation(); tutFinish(true); });
  bindHudBar(CX.C);   // → hudbar.ts
}
