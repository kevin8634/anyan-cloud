import { playCG, playOpening, replayOpening, probeOpening, CG_SRC, OPENING_SRC } from './cgmovie';
// 标题画面与角色选择：3 个角色栏位、新建 / 删除 / 导入导出、职业介绍、更新日志
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindTitle(C) 初始化
import { prewarmFlush } from './prewarm';
import { showLoading, hideLoading } from './travel';
import { SHOWCASE } from './showcase';
import { packBuffAdd } from './packbuff';   // v1.2.37c
import { packStrike } from './packrt';
/** 11-18 外观绑定：某武器类型当前装着的那件（主手或远程副手）的物品 id，没装备 = null */
const wsItem = (t: string): string | null => (Object.values(CX.inventory.equipped) as ({ weaponType?: string; id?: string } | undefined)[]).find(x => x?.weaponType === t)?.id ?? null;
import { weaponSkinGet, weaponSkinSet, weaponSkinLoad, weaponSkinHas, weaponSkinList, weaponSkinRemove, weaponSkinImport } from './weaponskin';
import { LUX_W } from './gear';
import { offlineLib, isLibKey, ensureLib } from './forge_lib';   // 11-17 离线武器库（桌面版）
import { classExtFxApi } from './classext';
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
import { packs, bindPacks, runStoryHooks, setPackMoveMul, setPackLift, setPackCamPull, setPackHitGuard, setPackInteract, packDemo } from '../core/ContentPacks';
import { initSealedButton } from './sealed_ui';
import { photoToggle } from './photomode';   // v1.2.53
import { lessonSkipTo } from './nextstep';
import { packBossSpawn, packBossState, packBossRemove, packBossInfo } from './packboss';
import { setCastWard } from './worldboss';   // raidA A5
import { fullBanner } from './runehud';
import { enterFlash, titleFx, titleEnter } from './intro';
import { Preview } from './preview';
import { bindSelect, selectFocus, selectLeave, selectHit, selectHover, selectActive, selectOpenStage, selectPrepare, selOff } from './selectstage';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName } from '../core/Forge';
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef } from '../core/types';
import { SET_BONUSES } from '../data/warrior';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassDef, ClassId, isClassAvailable } from '../data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import * as M from './models';
import * as G from './gfx';
import { GameAudio, Theme } from './audio';
import { loadCharacters, AnimName, classBodyOf, CLASS_BODY_HOOKS, setClassBody } from './chars';
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { updateWater } from './textures';
import { NavGrid, Circle, Pos2 } from '../core/NavGrid';
import { AutoPath, AUTOPATH_STOP_TEXT } from '../core/AutoPath';
import { questTarget, nextHop, trackedList, GuideTarget, MapLink } from '../core/QuestGuide';
import { objectiveMax } from '../core/Quest';
import { EnemyBrain as Brain } from '../core/EnemyBrain';
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE, isKnownMap, packZone } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD } from '../data/zone_field';
import { bindEnemyTypes, EnemyType, fieldType, swampType, ENEMY_TYPES, WILD_MODELS, wildModel, enemyConfig } from './enemy_types';
import type { Ctx } from './main';
import { lazyInfo, startLazyCreatures, deferDone } from './creatures_glb';

let CX!: Ctx;

// ----- 标题画面：角色选择（阶段三）：3 个角色栏位，一个角色一个存档 -----
/** 职业介绍（定位、难度、招牌技能演示） */
export const CLASS_INFO: Record<ClassId, { role: string; diff: number; sig: { slot: SlotId; anim: AnimName; color: string; ring: number }[] }> = {
  warrior: { role: '近战 · 坦克 / 爆发', diff: 1, sig: [{ slot: 'skill1', anim: 'dash', color: '#ffb040', ring: 2 }, { slot: 'skill2', anim: 'spin', color: '#ff7a30', ring: 3.2 }, { slot: 'ultimate', anim: 'cheer', color: '#ffd34d', ring: 4 }] },
  alchemy: { role: '远程法系 · 调配 / 地面控制', diff: 3, sig: [{ slot: 'skill1', anim: 'shoot', color: '#ff5a20', ring: 2.6 }, { slot: 'skill3', anim: 'shoot', color: '#6aff4a', ring: 2.8 }, { slot: 'ultimate', anim: 'cast', color: '#9aff3a', ring: 3.5 }] },
  chrono: { role: '远程物理 · 刺客 / 延时爆发', diff: 3, sig: [{ slot: 'skill1', anim: 'dash', color: '#ffd070', ring: 2.4 }, { slot: 'skill2', anim: 'attack3', color: '#ffc040', ring: 3.4 }, { slot: 'ultimate', anim: 'castLong', color: '#7ab0ff', ring: 5 }] },
  mage: { role: '远程 · 法术爆发 / 控制', diff: 2, sig: [{ slot: 'skill1', anim: 'shoot', color: '#ff7a30', ring: 1.6 }, { slot: 'skill2', anim: 'cast', color: '#9fe0ff', ring: 3.4 }, { slot: 'ultimate', anim: 'castLong', color: '#ff5020', ring: 4.2 }] },
};

/** v1.0.6：选角说明（内容包职业从 ClassDef.ext 取） */
export const classInfo = (id: string) => (CLASS_INFO as Record<string, (typeof CLASS_INFO)[ClassId]>)[id] ?? (CLASSES[id as ClassId]?.ext as unknown as (typeof CLASS_INFO)[ClassId] | undefined) ?? CLASS_INFO.warrior;
export const LOCKED_CLASSES: { name: string; role: string }[] = [];

export let newLook = 0;          // 创建角色时选的配色

export let delArmed = false;

export const MAP_NAME = (m: string) => (m === 'field' ? '翠风原野' : isWildId(m) ? WILD[m].name : m !== 'camp' && isKnownMap(m) ? MAPS[m as MapId].name : m && m !== 'camp' && !isKnownMap(m) ? '扩展内容区域' : '灰石营地');
/** v0.9.7：角色职业不在当前构建里（本体打开扩展内容职业）→ 锁定：不能进游戏，存档一字不动 */
export const charLocked = (c: CharMeta | null | undefined) => !!c && !isClassAvailable(c.classId);

export const fmtTime = (ms: number) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };

export let slotMeta!: (i?: number) => CharMeta | null;

export function renderTitle() {
  const m = slotMeta();
  const create = !m;
  // ---- 显示哪个职业：创建时是选的职业；选中已有角色时是它的职业
  const cid: ClassId = create ? CX.chosen : ((m!.classId as ClassId) in CLASSES ? m!.classId as ClassId : CX.chosen);
  const ti = CX.$('title'); ti.classList.toggle('sel-b', selOpen);
  // ---- 角色栏位（v1.2.49：只列这个职业的角色 + 一个「新建」空位；其余栏位保留节点但隐藏）
  const firstEmpty = CX.roster.firstEmpty();
  const sl = CX.$('cs-slots'); sl.innerHTML = '';
  CX.roster.slots.forEach((c, i) => {
    const d = document.createElement('div');
    const show = c ? (c.classId === cid || i === CX.selSlot) : (i === CX.selSlot || (!!m && i === firstEmpty));
    d.className = 'cslot' + (i === CX.selSlot ? ' on' : '') + (c ? '' : ' empty') + (c?.status === 'corrupt' ? ' bad' : '') + (charLocked(c) ? ' locked' : '') + (show ? '' : ' hide');
    d.dataset.slot = String(i);
    d.innerHTML = c
      ? `<div class="portrait">${uiIcon(M.portraitKey(c.classId))}</div><div class="cinfo"><b>${CX.escHtml(c.name)}</b><small>${CLASSES[c.classId as ClassId]?.name ?? c.classId} · 等级 ${c.level}${c.elite ? ` · 精英 ${c.elite}` : ''}</small>
         <i>${c.status === 'corrupt' ? '⚠ 存档损坏' : charLocked(c) ? '🔒 需要扩展内容' : `${MAP_NAME(c.map)} · ${fmtTime(c.playMs)}${c.ilvl ? ` · 装等 ${c.ilvl}` : ''}`}</i></div>`
      : `<div class="plus">＋</div><div class="cinfo"><b>新建角色</b><small>${CLASSES[cid]?.name ?? ''}</small></div>`;
    d.onclick = () => { CX.selSlot = i; delArmed = false; if (!c) { newLook = 0; (CX.$('cs-name') as HTMLInputElement).value = randomName(); } else if ((c.classId as ClassId) in CLASSES) CX.chosen = c.classId as ClassId; titleModel(); renderTitle(); CX.audio.click(); };
    sl.appendChild(d);
  });
  CX.$('cs-create').style.display = create ? '' : 'none';
  CX.$('cs-detail').style.display = create ? 'none' : '';
  // ---- 职业名字牌（A 态在模型脚下，B 态是底部头像条；点它 = 选这个职业）
  const box = CX.$('class-pick'); box.innerHTML = '';
  for (const c of Object.values(CLASSES)) {
    const d = document.createElement('div'); d.className = 'ccard' + (cid === c.id ? ' on' : '');
    d.dataset.cls = c.id;
    d.innerHTML = `<div class="portrait big">${uiIcon(M.portraitKey(c.id))}</div><b>${c.name}</b><small>${classInfo(c.id).role}</small><p>${c.desc}</p>`;
    d.onclick = () => pickClass(c.id);
    box.appendChild(d);
  }
  CX.$('class-locked').innerHTML = '';
  if (create) {
    const looks = M.LOOKS[CX.chosen] ?? M.LOOKS.warrior;
    CX.$('cs-looks').innerHTML = looks.map((l, i) => `<span class="sw${i === newLook ? ' on' : ''}" data-look="${i}" style="background:${l.swatch}" title="${l.name}"></span><small>${l.name}</small>`).join('');
    CX.$('cs-looks').querySelectorAll('.sw').forEach(e => { (e as HTMLElement).onclick = () => { newLook = +(e as HTMLElement).dataset.look!; titleModel(); renderTitle(); CX.audio.click(); }; });
    CX.$('cs-name-err').textContent = '';
  } else {
    const st = m.status === 'corrupt' ? '<span class="bad">存档损坏，且没有可用的备份。为了不覆盖你的进度，这个角色暂时不能进入游戏。原始数据已另存，可以导出交给开发者排查。</span>'
      : m.status === 'recovered' ? '<span class="warn">主存档读取失败，已从最近一次备份恢复。</span>' : '';
    const lockMsg = charLocked(m) ? '<span class="warn">这个角色的职业属于扩展内容，当前版本不能进入。角色数据原样保留，装上对应的扩展内容后即可继续。</span>' : '';
    CX.$('cs-detail-info').innerHTML = `<h3>${CX.escHtml(m.name)}</h3><div class="row">${CLASSES[m.classId as ClassId]?.name ?? ''} · 等级 ${m.level} · 精英等级 ${m.elite}</div>
      <div class="row">所在地图：${MAP_NAME(m.map)} · 平均装等 ${m.ilvl || '—'}</div><div class="row">游戏时长：${fmtTime(m.playMs)}${m.savedAt ? ` · 上次保存 ${new Date(m.savedAt).toLocaleString()}` : ''}</div>${st}${lockMsg}`;
    (CX.$('cs-del') as HTMLButtonElement).textContent = delArmed ? '确认删除' : '删除角色';
    CX.$('cs-del-box').style.display = delArmed ? '' : 'none';
  }
  // ---- 职业介绍（全部取自职业表：名字 / 定位 / 简介 / 生命 / 暴击 / 护甲 / 攻击方式 / 难度 / 专精 / 招牌技能）
  const C = CLASSES[cid], info = classInfo(cid);
  const diff = Math.max(1, Math.min(3, info.diff | 0));
  CX.$('cs-info').innerHTML = `<div class="si-name">${C.name}</div><div class="si-role">${info.role}</div><div class="si-rule"></div>
    <p class="si-desc">${C.desc}</p>
    <div class="si-stats"><div><small>初始生命</small><b>${C.baseHp}</b></div><div><small>暴击</small><b>${Math.round(C.critChance * 100)}%</b></div><div><small>护甲</small><b>${C.equip.armorType ? ARMOR_TYPE_NAME[C.equip.armorType] : '—'}</b></div><div><small>攻击方式</small><b>${C.ranged ? '远程' : '近战'}</b></div></div>
    <div class="si-diff">操作难度 ${[1, 2, 3].map(k => `<i class="${k <= diff ? 'on' : ''}"></i>`).join('')}</div>
    <div class="si-h">专精</div><div class="trees">${C.tree.specs.map(sp => `<div title="${sp.desc}"><b>${sp.name}</b><small>${sp.desc}</small></div>`).join('')}</div>
    <div class="si-h">招牌技能 · 点一下看演示</div><div class="sigs">${info.sig.map((sg, i) => { const sk = C.skills[C.loadout[sg.slot]]; return sk ? `<button class="sig" data-sig="${i}">${skillIcon(sk.id, "")}<span>${sk.name}</span></button>` : ''; }).join('')}</div>`;
  CX.$('cs-info').querySelectorAll('.sig').forEach(e => { (e as HTMLElement).onclick = () => demoSkill(cid, +(e as HTMLElement).dataset.sig!); });
  const bad = !create && (m!.status === 'corrupt' || charLocked(m));
  (CX.$('start') as HTMLButtonElement).disabled = bad;
  (CX.$('start') as HTMLButtonElement).textContent = !create && charLocked(m) ? '需要扩展内容' : create ? '创建并进入' : '进入游戏';
  CX.$('cs-export').style.display = create ? 'none' : '';
  CX.$('cs-del').style.display = create ? 'none' : '';
  CX.$('help-keys').textContent = C.keyHelp;
  CX.$('cs-count').textContent = `角色 ${CX.roster.count}/${MAX_SLOTS}`;
  // A 态右下「进入」：有选中的角色 = 直接进；否则打开详情
  const se = CX.$('sel-enter') as HTMLButtonElement;
  se.textContent = !create && !bad ? `进入 · ${m!.name}` : '选择职业';
  se.classList.toggle('none', create || bad);   // 首屏只在有可进入的角色时显示「进入 · 名字」
  selectFocus(selOpen);
}

/** B 态（详情面板）开关 */
export let selOpen = false;
export function setSelOpen(v: boolean) { selOpen = v; delArmed = false; renderTitle(); }

/** 点职业卡：空栏位里就是选职业；没选空栏位时，有这个职业的角色就选它，没有就去第一个空栏位创建 */
export function pickClass(id: ClassId) {
  CX.chosen = id; newLook = 0;
  if (slotMeta()) {
    const i = CX.roster.slots.findIndex(m => m?.classId === id);
    if (i >= 0) CX.selSlot = i; else { const e = CX.roster.firstEmpty(); if (e >= 0) CX.selSlot = e; }
  }
  selOpen = true; delArmed = false;
  titleModel(); renderTitle(); CX.audio.click();
}

/** 标题画面上的角色模型：选中的角色穿着它的装备；创建时是选的职业和配色 */
export function titleModel() {
  const m = slotMeta();
  // Rhett 11-18 15:29：下面职业条 = 创建用的默认模型——清掉上一个存档留下的职业身体覆盖（法师 40 级长袍），否则点职业仍穿套装。?off=selsavegear 回旧
  if (!m) { if (!selOff('selsavegear')) setClassBody(CX.chosen as ClassId, null); swapPlayerModel(CX.chosen, newLook); return; }
  const cid = (m.classId as ClassId) in CLASSES ? m.classId as ClassId : 'warrior';
  const s = CX.roster.saverFor(m.id).loadResult().save;
  // Rhett 11-18：选角站上来的是存档实际穿戴——职业身体覆盖（例：法师 40 级长袍）也按这个存档的装备算，不沿用上一个角色的。?off=selsavegear 回旧
  if (!selOff('selsavegear') && CLASS_BODY_HOOKS.length) { let body: string | null = null; for (const h of CLASS_BODY_HOOKS) { body = h(cid, (s?.inventory.equipped ?? {}) as never); if (body) break; } setClassBody(cid, body); }
  swapPlayerModel(cid, m.look);
  if (CX.player) applyGear(CX.player.rig, cid, s?.inventory.equipped ?? {});
  CX.gearSig = '';
}

/** 招牌技能演示：角色做出动作 + 一圈特效 */
export function demoSkill(cid: ClassId, i: number) {
  if (!CX.player) return;
  const sg = classInfo(cid).sig[i];
  CX.player.rig.anim?.play(sg.anim);
  const p = CX.player.getPos();
  setTimeout(() => { CX.spawnRing(p, sg.ring, sg.color, 0.6); CX.particles.emit({ x: p.x, y: 0.4, z: p.z }, { count: 50, color: new THREE.Color(sg.color).getHex(), color2: 0xffffff, speed: 3, up: 2.5, radius: sg.ring * 0.6, life: 0.9, size: 0.35, drag: 0.6 }); CX.audio.click(); }, 250);
}

/** 换玩家模型（标题画面上就能看到职业、配色） */
export function swapPlayerModel(id: ClassId, lk = 0) {
  if (!CX.player) return;
  const want = `${id}:${lk}:${classBodyOf(id) ?? ''}`;   // 11-04 身体覆盖变了也要重建
  if (CX.player.rig.root.userData.want === want) return;
  const pos = CX.player.pos.clone(), ry = CX.player.rig.root.rotation.y;
  CX.scene.remove(CX.player.rig.root);
  CX.player.rig = M.makeClassRig(id, lk);
  CX.player.rig.root.userData.cls = id;
  CX.player.rig.root.userData.want = want;
  CX.scene.add(CX.player.rig.root);
  CX.player.pos.copy(pos); CX.player.rig.root.rotation.y = CX.started ? ry : 0.15;
  CX.player.rig.anim?.loop('idle');
  // 11-18 Rhett「创建角色法师还是跟我角色一样」：标题画面创建态（空栏位）不能走 CX.refreshGear——它按上次读进来的存档（法师）装备算身体覆盖 + 挂件，
  //   法师就又穿回 40 级长袍和身上装备。创建态直接空装备；?off=selbare 回旧
  if (!CX.started && !slotMeta() && !selOff('selbare')) { applyGear(CX.player.rig, id, {}); return; }
  CX.refreshGear(true);
}

export async function importSave(text?: string | null) {
  const t = text ?? await pickTextFile(); if (!t) return null;
  const slot = slotMeta() ? CX.roster.firstEmpty() : CX.selSlot;
  const r = CX.roster.importText(t, slot);
  if (typeof r === 'string') { CX.toast(r, '#f66'); CX.audio.error(); return r; }
  // v1.2.46 存档里带的运行时武器模型（导出时一并打包的 GLB）
  try { const f = JSON.parse(t); if (f?.wskin) { const n = await weaponSkinImport(f.wskin); if (n) CX.toast(`已恢复 ${n} 个自定义武器模型`, '#ffd070'); } } catch { /* 没有就算了 */ }
  CX.selSlot = CX.roster.slots.indexOf(r); CX.roster.probe(); titleModel(); renderTitle(); CX.toast(`已导入角色「${r.name}」`, '#3f3');
  return r;
}


/** Rhett 11-18 不刷新返回选角（?off=selback 回旧：保存后整页重载）。
 *  存档 → 关面板 → started = false、标题层回来 → 重建选角站位并直接打开当前角色的详情态。只在营地 / 野外（不在副本、长副本里）可用，否则走旧的重载。
 *  安全起见只有「回到同一个角色」是不刷新的：换别的角色或新建，包的运行时状态（深渊 / 领域 / 评委等）不能保证换人后干净，改为记下上次角色后整页重载（重载后标题自动选中它） */
let softFrom: string | null = null;
export function backToSelect(): boolean {
  if (selOff('selback') || !CX.started || !CX.curChar) return false;
  const z = String(CX.zone);
  if (z === 'dungeon' || z === 'raid' || CX.dungeonRun) return false;
  try {
    CX.save();
    softFrom = CX.curChar.id;
    for (const id of ['settings', 'bag', 'char', 'talent', 'quest', 'worldmap']) { try { CX.togglePanel(id, false); } catch { /* 没有这个面板 */ } }
    CX.started = false;
    CX.$('title').style.display = ''; document.documentElement.classList.add('intitle');
    CX.roster.probe();
    CX.selSlot = Math.max(0, CX.roster.slots.findIndex(m => m?.id === softFrom));
    if ((CX.curChar.classId as ClassId) in CLASSES) CX.chosen = CX.curChar.classId as ClassId;
    selectPrepare(); titleModel(); selectOpenStage();
    selOpen = true; renderTitle(); titleFx(true);
    return true;
  } catch (e) { console.error('不刷新返回选角失败，改为重载', e); softFrom = null; return false; }
}
if (typeof window !== 'undefined') (window as unknown as { __drBackToSelect?: () => boolean }).__drBackToSelect = () => backToSelect();   // panels.ts 经 window 调（不加 panels → title 静态依赖）
/** 软返回后进的不是原角色 → 记下它、整页重载（startSelected 前调用；返回 true = 已接管） */
function softSwitch(id: string): boolean {
  if (!softFrom || id === softFrom) return false;
  CX.roster.setLast(id);
  const w = window as unknown as { __reloadHook?: () => void };
  window.setTimeout(() => (w.__reloadHook ? w.__reloadHook() : location.reload()), 100);
  CX.toast('切换角色：重新载入中…', '#7fe6da');
  return true;
}
/** 开始：选中已有角色就读它；空栏位就用填的名字创建 */
export function startSelected() {
  let m = slotMeta();
  if (!m) {
    const inp = CX.$('cs-name') as HTMLInputElement;
    if (!inp.value.trim()) inp.value = randomName();
    let name = inp.value.trim();
    for (let k = 2; CX.roster.nameTaken(name) && k < 20; k++) name = `${inp.value.trim().slice(0, 6)}${k}`;
    const r = CX.roster.create(CX.chosen, name, newLook, CX.selSlot);
    if (typeof r === 'string') { CX.$('cs-name-err').textContent = r; CX.audio.error(); return false; }
    m = r;
  }
  if (m.status === 'corrupt') { CX.toast('这个角色的存档已损坏，不能进入', '#f66'); return false; }
  if (charLocked(m)) { CX.toast('这个角色属于扩展内容，当前版本不能进入（数据已保留）', '#f66'); return false; }
  if (softSwitch(m.id)) return false;
  return startChar(m);
}

/** 兼容入口（测试 / 调试）：startGame('warrior') = 有这个职业的角色就进它，没有就新建一个 */
export function startGame(id: ClassId = CX.chosen) {
  const i = CX.roster.slots.findIndex(m => m?.classId === id && m.status !== 'corrupt' && !charLocked(m));
  if (i >= 0) { CX.selSlot = i; return startChar(CX.roster.slots[i]!); }
  CX.chosen = id; const e = CX.roster.firstEmpty(); if (e < 0) return false;
  CX.selSlot = e; (CX.$('cs-name') as HTMLInputElement).value = ''; return startSelected();
}

/** fix1109c #5（Rhett 11-09 18:04「创建角色点击后会卡住」）：点「开始 / 进入 / 评委职业卡」原来直接同步跑 建角色 + 写存档 + 换玩家模型（克隆写实骨架、建材质）+ 读档 + 刷装备
 *  + 包钩子，跑完才 showLoading —— 这一段里浏览器不出帧，画面停在点击那一刻（实测 swiftshader 1.1–1.6 秒；之后加载画面里的整场景着色器编译 / 贴图上传才是大头）。
 *  改：先亮加载画面，等两帧（确定已上屏）再跑；startChar 认 data-pre 接手这块加载画面继续预热，失败（名字不合法等）就收起 */
function enterSoon(go: () => boolean) {
  const ld = document.getElementById('loading');
  if (!ld || ld.style.display === 'flex' || typeof requestAnimationFrame === 'undefined') { if (go()) enterFlash(CX.audio); return; }
  showLoading('正在进入世界…'); ld.dataset.pre = '1';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let ok = false;
    try { ok = go(); } catch (e) { console.warn('进入世界出错', e); }
    if (ld.dataset.pre && !(ok && lazyWait)) { delete ld.dataset.pre; hideLoading(); }   // 没接手（失败）就收起；等延后资源时留着，waitLazy 完再进 startChar 接手
    if (ok) enterFlash(CX.audio);
  }));
}
let demoGo = false, lazyWait = false;
/** v1.2.54 分包加载：普通开局要等延后模型到齐（评委快速体验不等，它只用首屏资源） */
function waitLazy(m: CharMeta) {
  if (lazyWait) return; lazyWait = true;
  const el = document.createElement('div'); el.id = 'lazy-wait';
  el.style.cssText = 'position:fixed;left:50%;bottom:14%;transform:translateX(-50%);z-index:9999;padding:10px 22px;border:1px solid #c9a44c;border-radius:4px;background:rgba(10,6,4,.88);color:#ffd36a;font-size:15px;letter-spacing:1px';
  document.body.appendChild(el);
  void startLazyCreatures();
  const tick = () => { const L = lazyInfo(); el.textContent = `正在载入其余地图资源 ${L.got}/${L.total}…`; if (L.done) { el.remove(); lazyWait = false; startChar(m); } else setTimeout(tick, 300); };
  tick();
}
export function startChar(m: CharMeta): boolean {
  if (!CX.player) return false;
  if (!lazyInfo().done && (!demoGo || !deferDone())) { waitLazy(m); return true; }   // fix1106 快速体验也要等延后解析的 DLC 怪物
  if (charLocked(m)) return false;   // v0.9.7：扩展内容职业 —— 绝不能按战士读进来再写回（会改坏存档）
  const id: ClassId = (m.classId as ClassId) in CLASSES ? m.classId as ClassId : 'warrior';
  CX.curChar = m; CX.saver = CX.roster.saverFor(m.id); CX.look = m.look; CX.saveBlocked = false;
  CX.roster.setLast(m.id);
  CX.audio.unlock(); CX.audio.setTheme('camp'); CX.audio.click();
  selectLeave();   // v1.2.49 选角背景收起：区域 / 镜头 / 玩家模型还原
  CX.$('title').style.display = 'none'; titleFx(false);
  document.documentElement.classList.remove('intitle');
  swapPlayerModel(id, m.look);
  CX.applyCamMode();   // v0.9.1：按视角锁定设置摆镜头
  CX.applyClass(id);
  CX.player.critChance = CX.cls.critChance;
  const had = CX.load();
  if (CX.loadStatus === 'corrupt') CX.saveBlocked = true;
  CX.started = true;
  CX.loadTrack();
  CX.syncCharacter();
  CX.refreshGear(true);
  CX.player.hp = CX.player.maxHp;
  CX.player.pos.copy(CX.CAMP);
  CX.player.rig.root.rotation.y = Math.PI; CX.camYaw = 0;
  CX.$('pf-name').textContent = m.name;
  CX.$('pf-portrait').innerHTML = uiIcon(M.portraitKey(CX.cls.id));
  CX.skillEls.forEach(e => { e.icKey = ''; });
  CX.renderTracker();
  if (CX.tutState >= 0) CX.tutStart(CX.tutState, CX.tutReplay || had);
  // 回到上次的位置（原野 / 营地）；副本里存的档在营地
  const sv = CX.loadedSave;
  if (sv?.map === 'field' && !CX.fieldLock()) { CX.enterField(); if (sv.pos) CX.player.pos.set(sv.pos.x, 0, sv.pos.z); }
  else if (sv?.map && isWildId(sv.map) && !CX.wildLock(sv.map)) { CX.ensureWild(sv.map); CX.goMap(sv.map, sv.pos ?? undefined, '回到'); }
  else if (sv?.map && packZone(sv.map)?.enter) packZone(sv.map)!.enter!(sv.pos ?? undefined);   // v0.9.7 内容包区域：包自己负责进入
  else if (sv?.map && sv.map !== 'camp' && !isKnownMap(sv.map)) { /* 不认识的区域（applyPackCompat 已停放）：留在营地 */ }
  else if (sv?.pos && Math.hypot(sv.pos.x - CX.CAMP.x, sv.pos.z - CX.CAMP.z) < 60) CX.player.pos.set(sv.pos.x, 0, sv.pos.z);
  // 11-04 Loading 预热：从选角进世界时，营地 / 读档区域的着色器、阴影变体、贴图在加载画面里做完（实测首帧曾一次编 35 个程序、卡约 12 秒 swiftshader）
  { const ld = document.getElementById('loading'); if (ld && (ld.style.display !== 'flex' || ld.dataset.pre)) { delete ld.dataset.pre; showLoading('正在进入世界…'); setTimeout(() => { void prewarmFlush('enter').then(hideLoading, hideLoading); }, 30); } }   // fix1109c #5：enterSoon 先亮的加载画面（data-pre）在这里接手
  if (!had) void playOpening(CX.audio);   // v1.2.75 新存档第一次进入世界：开场动画（movie/opening.mp4，缺失即跳过）
  CX.toast(had ? `欢迎回来，${m.name}，等级 ${CX.progression.level}` : `欢迎来到灰石营地，${m.name}！去找头顶「!」的布兰`, '#ffd100');
  if (CX.loadStatus === 'recovered') CX.toast('主存档读取失败，已从最近的备份恢复', '#ff9a40');
  { const pf = CX.packFix;   // v0.9.7 DLC 框架：封存 / 停放提示（不出现任何具体扩展内容的名字）
    if (pf?.stillSealed) CX.toast(`有 ${pf.stillSealed} 件扩展内容物品已封存：需要对应的扩展内容才能使用，数据完整保留`, '#ff9a40');
    if (pf?.parked) CX.toast('上次所在的区域属于扩展内容，已回到灰石营地', '#ff9a40');
    if (pf?.unsealed) CX.toast(`扩展内容已启用：${pf.unsealed} 件封存物品已放回`, '#3f3'); }
  initSealedButton(CX);   // v0.9.9 封存页入口（只有有封存物品时才出现）
  // v0.9.9 内容包运行时钩子：每个包 bind 一次，然后跑「进入游戏」剧情钩子（没有包 = 什么都不做）
  if (packs().length) {
    bindPacks({ toast: (m, c) => CX.toast(m, c), level: () => CX.progression.level, classId: () => CX.cls.id, map: () => CX.currentMap(),
      talentRank: id => CX.tree?.effRank(id) ?? 0,   // 11-05 DLC1 40 级套装终极天赋读数（同 classext.ts 写法）
      toCamp: () => { CX.goMap('camp', { x: CX.CAMP.x, z: CX.CAMP.z }, '回到'); }, openPanel: id => CX.togglePanel(id, true), save: () => CX.save(),
      goMap: (map, at, why) => CX.goMap(map as MapId, at, why ?? ''),
      playerPos: () => ({ x: CX.player.pos.x, z: CX.player.pos.z }), setMoveMul: k => setPackMoveMul(k),
      dropLoot: (x, z, q) => { const it = CX.gen.generate(Math.max(5, CX.progression.level + 3), CX.gen.rollQuality(q ?? 'blue')); CX.spawnLoot(it, new THREE.Vector3(x, 0, z), 0, 1); },
      dropFixed: (id, x, z, anc) => { const it = CX.gen.generateFixed(id, Math.max(5, CX.progression.level + 4)); if (!it) return null; if (anc && Math.random() < anc && CX.gen.ancientify(it)) CX.ancientBanner(it.name); CX.spawnLoot(it, new THREE.Vector3(x, 0, z), 0, 1); return it.name; },
      questState: id => CX.quests.defs.some(q => q.id === id) ? CX.quests.state(id, CX.progression.level) : 'locked',
      yell: m => CX.yell(m, '#7fe8f0', 3.5), teleport: (x, z) => { CX.player.pos.set(x, CX.player.pos.y, z); },
      // v1.1.0 首领 / 全屏横幅 / 合成音效 / 经验
      spawnBoss: d => packBossSpawn(d), bossState: k => packBossState(k), removeBoss: k => packBossRemove(k), bossInfo: k => packBossInfo(k), castWard: f => setCastWard(f),
      setLift: y => { setPackLift(y); const v = y === null ? null : (Number.isFinite(y) ? y : null); if (v !== null) CX.player.pos.y = v; },   // raidA A6 升降梯 / 高架栈道
      camPull: m => setPackCamPull(m), hitGuard: f => setPackHitGuard(f), interact: f => setPackInteract(f),   // raidA A7 大型首领镜头拉远 / 高处命中过滤
      musicHold: t => CX.audio.hold(t),   // v1.2.48 包自己的结局过场
      ambient: () => CX.audio.ambientOut(), musicDim: k => CX.audio.setSceneDim(k),   // v1.2.71 环境声输出 / 场景压低音乐（通用、可选）
      banner: o => fullBanner(o), addXp: n => CX.addXp(Math.max(0, Math.round(n)), true),
      synth: () => ({ tone: o => CX.audio.extTone(o), noise: o => CX.audio.extNoise(o), gate: (k, g) => CX.audio.extGate(k, g) }),
      // v1.1.1 金币 / 回血 / 范围打击 / 任务推进 / 特效画笔
      gold: () => CX.inventory.gold, spendGold: n => CX.inventory.spendGold(Math.max(0, Math.round(n))), addGold: n => { if (n > 0) CX.inventory.addGold(Math.round(n)); },
      weaponSkin: {
        mainType: () => (CX.inventory.equipped.mainHand?.weaponType as string | undefined) ?? (CX.player.rig?.root.userData.weaponType as string | undefined) ?? null,
        offType: () => (CX.inventory.rules.rangedOffhand as string | undefined) ?? null,   // 11-05 猎手弓位
        library: () => [...Object.entries(LUX_W).filter(([, v]) => v && weaponSkinHas(v[0])).map(([t, v]) => ({ key: v![0], type: t })), ...offlineLib().map(i => ({ key: i.key, type: i.type }))],
        get: t => weaponSkinGet(t, wsItem(t)),
        set: (t, k) => {
          if (k && !weaponSkinHas(k) && isLibKey(k)) { void ensureLib(k).then(ok => { if (ok) { weaponSkinSet(t, k, wsItem(t)); CX.refreshGear(true); } }); return true; }   // 11-17 离线武器库：读盘登记后再换
          if (k && !weaponSkinHas(k)) return false; weaponSkinSet(t, k, wsItem(t)); CX.refreshGear(true); return true; },
        load: (k, b, m) => weaponSkinLoad(k, b, true, m ? { author: CX.curChar?.name, ...m } : m),   // v1.2.47 记下铸造者（当前角色名；以后可换成玩家 ID）
        has: k => weaponSkinHas(k),
        list: () => weaponSkinList(),
        remove: async k => { await weaponSkinRemove(k); CX.refreshGear(true); },
      },
      addStack: (id, n) => { if (!(n > 0)) return false; CX.inventory.addStack(id, Math.round(n)); return true; },
      heal: f => { if (CX.player.alive) CX.fx.heal(CX.player, CX.player.maxHp * Math.max(0, f)); },
      strike: o => packStrike(o),
      questEvent: (type, id) => { if (type === 'explore') CX.quests.onExplore(id); else CX.quests.onTalk(id); },
      fx: () => classExtFxApi(), questDone: id => CX.quests.state(id, CX.progression.level) === 'done',
      // v1.1.2 重建挂件 / 不致死扣血 / 生命
      redress: () => CX.refreshGear(true),
      drain: f => { const P = CX.player; if (P.alive && f > 0) P.hp = Math.max(1, P.hp - P.maxHp * f); },
      hp: () => ({ hp: CX.player.hp, max: CX.player.maxHp }),
      // v1.2.15 技能伤害预览 / 当前目标 / 护盾 / 减伤反弹（第 8 技能格等用）
      skillDamage: slot => CX.loadout.preview(slot as SlotId, CX.ctx())?.stats.damage ?? 0,
      target: () => { const t = CX.target; return t && t.alive ? { x: t.pos.x, z: t.pos.z, boss: !!t.isBoss } : null; },
      shield: (f, d) => { const P = CX.player; if (P.alive && f > 0) P.status.addShield('shield:pack', P.maxHp * f, d, P.maxHp * f, P); },
      dashTo: (x, z) => { const P = CX.player.pos, dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz), n = Math.ceil(d * 2);
        for (let i = 0; i < n; i++) { const prev = { x: P.x, z: P.z }; P.x += dx / n; P.z += dz / n; CX.clampToZone(P, prev); }
        if (d > 0.1) CX.player.rig.root.rotation.y = Math.atan2(dx, dz);
        return { x: P.x, z: P.z }; },
      // v1.2.37c 限时增益 / 刷新最长冷却 / 冷却缩减 / 免冷却翻滚
      buff: o => { packBuffAdd(o); CX.syncCharacter(); },
      refreshLongestCd: slots => { let best: string | null = null, m = 0; for (const s of slots) { const l = CX.loadout.cooldownLeft(s as SlotId, CX.T); if (l > m) { m = l; best = s; } } if (best) CX.loadout.reduceCooldown(best as SlotId, m + 1); return best; },
      skillCdr: () => (CX.charSheet().cdr.skill ?? 0) / 100,
      demoKit: (lv, ilvl, q) => demoKit(lv, ilvl, q), photo: () => photoToggle(true, CX.camYaw, CX.camPitch, CX.camDist),
      freeRoll: n => { CX.dodge.freeRolls = Math.max(CX.dodge.freeRolls, n); },
      guard: (r, rf, d) => { const P = CX.player; if (P.alive) P.status.add({ key: 'reflect', kind: 'reflect', remaining: d, percent: r, reflect: rf, source: P }); } });
    runStoryHooks('enterGame');
  }
  if (CX.pendingNotices.length) {
    // 只提示一次：显示后立即存档（新存档不带 notices）
    CX.pendingNotices.forEach(n => CX.toast(`${n}（${CX.tree.available} 点可分配，按 N 打开天赋）`, '#ff9a40'));
    CX.lastNotices = CX.pendingNotices; CX.pendingNotices = [];
  }
  CX.showChangelog(false, had);
  CX.save();
  if (CX.isTouch) CX.goFullscreen();
  return true;
}

/** v1.2.53 快速体验：升到 lv 级（走正常升级流程，技能 / 天赋点照常解锁）+ 每个部位一件装备 */
function demoKit(lv: number, ilvl: number, q: 'blue' | 'purple' | 'orange', kit: string[] = [], talents = false) {
  const P = CX.progression; lessonSkipTo(lv); if (P.level < lv) CX.addXp(Math.max(0, P.totalXpFor(Math.min(lv, P.maxLevel)) - P.totalXpFor(P.level) - P.xp + 1));
  for (const id of kit) {   // 11-08 评委版：套装件 / 暗金武器直接穿上（双持 / 主副手按 tryEquip 自动找空位）
    try { const it = CX.gen.generateFixed(id, ilvl); if (!it) continue; CX.inventory.add(it); if (!CX.inventory.equip(it.id)) CX.inventory.remove?.(it.id); } catch (e) { console.warn('评委装备', id, e); }
  }
  if (talents) demoTalents();
  for (const s of EQUIP_SLOTS) {
    if (CX.inventory.equipped[s]) continue;
    try { const it = CX.gen.generate(ilvl, q, [s.replace(/[12]$/, '') as never]); CX.inventory.add(it); if (!CX.inventory.equip(it.id, s)) CX.inventory.remove?.(it.id); } catch { /* 这个职业没有该部位 */ }
  }
  CX.refreshGear(true); CX.syncCharacter(); CX.player.hp = CX.player.maxHp;
}
/** 11-08 评委版：先选职业（6 职业），再进 40 级满装角色 */
function demoPick(classes: string[]) {
  document.getElementById('demo-pick')?.remove();
  const w = document.createElement('div'); w.id = 'demo-pick';
  w.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(6,4,2,.72);backdrop-filter:blur(3px)';
  const card = (id: string) => { const c = CLASSES[id as ClassId] as { name?: string; desc?: string } | undefined;
    return `<button data-c="${id}" style="width:210px;padding:14px 14px 12px;margin:7px;border:1px solid #c8a040;border-radius:10px;background:linear-gradient(#3a2810,#1a1208);color:#ffd890;font:600 17px serif;cursor:pointer;text-align:left;box-shadow:0 0 14px rgba(255,190,80,.18)">${CX.escHtml(c?.name ?? id)}<small style="display:block;margin-top:5px;color:#cbb790;font:12px/1.45 serif;font-weight:normal">${CX.escHtml((c?.desc ?? '').slice(0, 38))}…</small></button>`; };
  w.innerHTML = `<div style="max-width:720px;padding:18px 20px;border:1px solid #c8a040;border-radius:12px;background:linear-gradient(rgba(30,20,10,.96),rgba(12,8,4,.96));text-align:center">
    <div style="color:#ffd890;font:700 20px serif;margin-bottom:4px">⚡ 选择体验职业</div><div style="color:#bca;font:13px serif;margin-bottom:8px">40 级 · 本职业 40 级套装 + 暗金武器 · 天赋已点满</div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center">${classes.map(card).join('')}</div>
    <button data-c="" style="margin-top:8px;padding:5px 18px;border:1px solid #6a5636;border-radius:6px;background:none;color:#cba;cursor:pointer;font:13px serif">取消</button></div>`;
  w.onclick = e => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b && e.target !== w) return; w.remove(); const c = b?.dataset.c; if (!c) return; CX.audio.click(); enterSoon(() => startDemo(c)); };
  document.body.appendChild(w);
}
/** 11-08 评委版：自动点天赋——按主系（第一系）从上到下逐个加点，点不动再试其他系，直到点数用完 */
function demoTalents() {
  const T = CX.tree as unknown as { available: number; def: { specs: { id: string; nodes?: { id: string; row: number }[] }[] }; add(id: string): boolean; node(id: string): { row: number } | undefined };
  try {
    const specs = T.def.specs ?? [];
    for (let guard = 0; guard < 400 && T.available > 0; guard++) {
      let moved = false;
      for (const sp of specs) { for (const n of [...(sp.nodes ?? [])].sort((a, b) => a.row - b.row)) { if (T.available <= 0) break; if (T.add(n.id)) { moved = true; break; } } if (moved) break; }
      if (!moved) break;
    }
  } catch (e) { console.warn('评委天赋', e); }
  try { CX.refreshGear(true); CX.syncCharacter(); } catch { /* 忽略 */ }
}
/** v1.2.53 快速体验入口：独立角色（同名同职业就复用，没有就新建），跳过引导，交给包；11-08 cls = 评委选的职业 */
export function startDemo(cls?: string): boolean {
  const d0 = packDemo(); if (!d0) return false;
  const d = cls ? { ...d0, classId: cls, name: `${d0.name}·${CLASSES[cls as ClassId]?.name ?? cls}` } : d0;
  let i = CX.roster.slots.findIndex(m => m?.name === d.name && m.classId === d.classId && m.status !== 'corrupt');
  if (i < 0) {
    const r = CX.roster.create(d.classId, d.name, 0, CX.roster.firstEmpty());
    if (typeof r === 'string') { CX.toast(`没法创建体验角色：${r}`, '#f66'); return false; }
    i = CX.roster.slots.indexOf(r);
  }
  CX.selSlot = i; CX.chosen = d.classId as ClassId;
  demoGo = true; const ok = startChar(CX.roster.slots[i]!); demoGo = false; if (!ok) return false;
  try { CX.tutFinish(true); } catch { /* 已完成 */ }
  try { d.prepare?.(); } catch { /* 包出错 */ }
  demoKit(d.level, d.ilvl ?? d.level + 4, 'purple', d.kit?.(d.classId) ?? [], !!d.talents);
  try { d.enter(); } catch (e) { console.warn('demo enter', e); }
  CX.save();
  return true;
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindTitle(__ctx: Ctx) {
  CX = __ctx;
  slotMeta = (i = CX.selSlot) => CX.roster.slots[i] ?? null;
  CX.$('cs-rand').onclick = () => { (CX.$('cs-name') as HTMLInputElement).value = randomName(); CX.audio.click(); };
  CX.$('cs-del').onclick = () => {
    const m = slotMeta(); if (!m) return;
    if (!delArmed) { delArmed = true; (CX.$('cs-del-input') as HTMLInputElement).value = ''; renderTitle(); (CX.$('cs-del-input') as HTMLInputElement).focus(); return; }
    const typed = (CX.$('cs-del-input') as HTMLInputElement).value.trim();
    if (typed !== m.name) { CX.$('cs-del-err').textContent = `请输入角色名「${m.name}」确认删除`; CX.audio.error(); return; }
    CX.roster.remove(m.id); delArmed = false; CX.$('cs-del-err').textContent = '';
    (CX.$('cs-name') as HTMLInputElement).value = randomName();
    titleModel(); renderTitle(); CX.toast(`已删除角色「${m.name}」`, '#f88');
  };
  CX.$('cs-del-cancel').onclick = () => { delArmed = false; renderTitle(); };
  CX.$('cs-export').onclick = () => {
    const m = slotMeta(); if (!m) return;
    const t = CX.roster.exportText(m.id) ?? CX.storage.get(`darkrock_char_${m.id}_corrupt`) ?? CX.storage.get(`darkrock_char_${m.id}`);
    if (!t) { CX.toast('没有可以导出的存档', '#f66'); return; }
    downloadText(exportFileName(m), t); CX.toast('存档文件已导出', '#3f3');
  };
  CX.$('cs-import').onclick = () => { void importSave(); };
  CX.$('start').onclick = () => enterSoon(startSelected);
  // v1.2.74 Rhett：岩层开场删掉（不自动播、无「重看开场」/开关按钮）；只留「重放 CG」
  CX.$('cg-replay').onclick = () => { CX.audio.click(); playCG(CX.audio, true, { src: [CG_SRC, ...OPENING_SRC] }); };   // 11-18 桌面包没带 intro.mp4 时退回开场动画
  // v1.2.81 Rhett 11-04：首屏左下「重放开场」，重播开场动画（movie/opening.webm / .mp4）；探测不到视频就一直隐藏
  { const b = CX.$('op-replay'); b.onclick = () => { CX.audio.click(); void replayOpening(CX.audio); };
    void probeOpening().then(ok => { b.hidden = !ok; b.dataset.probed = ok ? '1' : '0'; }); }
  if (!CX.isTouch) CX.$('joy').style.display = 'none';
  // v1.2.49 选角重做：点 3D 模型选职业、返回 A 态、A 态右下「进入」、操作说明开关
  bindSelect(CX);
  CX.$('sel-back').onclick = () => { setSelOpen(false); CX.audio.click(); };
  CX.$('sel-create').onclick = () => { selectOpenStage(); CX.audio.click(); renderTitle(); };
  CX.$('sel-enter').onclick = () => { const m = slotMeta(); if (m && !charLocked(m) && m.status !== 'corrupt') enterSoon(startSelected); else setSelOpen(true); };
  { const d = packDemo();   // v1.2.53 快速体验按钮（有包提供才出现）
    if (d) { const b = document.createElement('button'); b.id = 'demo-enter'; b.className = 'sel-btn'; b.innerHTML = `${CX.escHtml(d.label)}${d.sub ? `<small>${CX.escHtml(d.sub)}</small>` : ''}`;
      b.onclick = () => { CX.audio.click(); if (d.classes?.length) return demoPick(d.classes); enterSoon(() => startDemo()); }; CX.$('title').appendChild(b); }
    if (SHOWCASE) CX.$('title').classList.add('showcase'); }   // v1.2.54 展示版：只留快速体验入口
  CX.$('help-toggle').onclick = () => { CX.$('title').classList.toggle('help-on'); CX.audio.click(); };
  { // Rhett 11-18「登录界面要有声音开关」：标题 / 选角右上角一键静音（同设置里的「静音」，存进设置）。?off=sndbtn 关
    if (!selOff('sndbtn')) { const b = document.createElement('button'); b.id = 'snd-title'; b.type = 'button';
      const paint = () => { b.classList.toggle('off', !!CX.settings.muted); b.title = CX.settings.muted ? '声音：关（点击打开）' : '声音：开（点击静音）'; b.innerHTML = CX.settings.muted ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2"/></svg>'; };
      b.onclick = e => { e.stopPropagation(); CX.settings.muted = !CX.settings.muted; CX.saveSettings(); CX.audio.muted = CX.settings.muted; CX.audio.applyVolumes(); paint(); if (!CX.settings.muted) { CX.audio.unlock(); CX.audio.click(); } };
      paint(); CX.$('title').appendChild(b); (window as unknown as { __sndPaint?: () => void }).__sndPaint = paint; } }
  { let down: { x: number; y: number } | null = null;
    const onCanvas = (e: Event) => !SHOWCASE && !CX.started && selectActive() && e.target instanceof HTMLCanvasElement && CX.$('title').style.display !== 'none';
    window.addEventListener('pointerdown', e => { down = onCanvas(e) ? { x: e.clientX, y: e.clientY } : null; });
    window.addEventListener('pointerup', e => { if (!down || !onCanvas(e)) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (moved > 8) return; const id = selectHit(e.clientX, e.clientY); if (id) pickClass(id); });
    window.addEventListener('pointermove', e => { if (!onCanvas(e)) return; const id = selectHit(e.clientX, e.clientY); selectHover(id); (e.target as HTMLElement).style.cursor = id ? 'pointer' : ''; });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && !CX.started && selOpen && CX.$('title').style.display !== 'none') setSelOpen(false); }); }
  window.addEventListener('beforeunload', () => { if (CX.started) CX.save(); });
}
