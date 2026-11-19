import { renderSlotBag } from './slotkey';
import { photoToggle } from './photomode';   // v1.2.52
import { achTitle } from './codex_ui';
import { renderParagon } from './paragon_ui';
import { talentArtMap, badgeSvg, badgeOf, BADGE_NAME } from './talent_icons';
import { nextUnlock } from '../data/unlocks';
import { renderGearSets } from './gearsets';
import { TALENT_START_LEVEL, TALENT_TOTAL } from '../core/TalentTree';
import { ptal, ptalPackName, ptalSyncSkills } from './packtal';
import { hasPack, packById } from '../core/ContentPacks';   // v1.0.1 扩展天赋层
import { PACK_TALENT_LEVELS } from '../core/PackTalents';
// 设置面板、背包、角色面板、掉落说明书、天赋树
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 CX（惰性 getter），在 main 原位置调用 bindPanels(C) 初始化
import * as THREE from 'three';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { gearLayers, gearScore, lostEffects, specGearRole, StatK, GearScoreCtx, GearRole, LostFx } from '../core/GearView';
import { renderSalvagePanel, salvPickIds } from './salvage_ui';
import { tipLines as awkTipLines } from '../core/Awaken';
import { LootGenerator, ItemInstance, itemColor, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { weaponSkinExport, weaponSkinGet, weaponSkinMeta, weaponSkinHas } from './weaponskin';   // v1.2.46 导出存档带运行时武器模型
import { GAME_VERSION, CHANGELOG } from './version';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName, upgradeDesc } from '../core/Forge';
import { ELEM_NAME, ELEM_COLOR, GEAR_ELEMS, RESONANCE, RES_TIERS } from '../core/Resonance';
import { DARK_ITEMS } from '../data/darkgold';
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
import { loadCharacters, AnimName, ensureHd } from './chars';
import { setCharModelMode, wantHd } from './rig';
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { sigilSvg, FRAME_SVG } from './talent_sigils';
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
import { durLine, durBadge } from './durability_ui';
import { DUNGEON_GUIDE_NOTE, DURABILITY_GUIDE_NOTE } from './dropguide';
import { isBroken, durOf, DUR_MAX } from '../core/Durability';
import { lockBtnHtml, toggleLockUi } from './smith';
import type { Ctx, Settings } from './main';
import { setTipHtml, charSetRows, setGuideNote, DARKGOLD } from './sets_ui';
import { raidSetExtras, srcItems, srcAncient, itemAncient, whereDrops, srcLocation, srcOfBoss, GuideSource } from './dropguide';
import { altarShow, altarStop, bindAltar3d, type AltarItem } from './altar3d';
import { openRaidMap, dmSelect } from './raidmap';

let CX!: Ctx;

// ----- 设置（⚙ 按钮 / 手机「≡」抽屉 / 电脑 Esc）-----
export function applySettings() {
  { const before = wantHd(); setCharModelMode(CX.settings.charModel, CX.settings.quality);   // v1.2.0-m1 角色模型切换：立即重建玩家模型
    if (before !== wantHd() && CX.player?.rig?.root?.userData?.cls) { const u = CX.player.rig.root.userData; u.want = ''; void (wantHd() ? ensureHd() : Promise.resolve()).then(() => swapPlayerModel(u.cls, CX.look ?? 0)); } }
  CX.pipeline.setQuality(CX.settings.quality);
  CX.grass.visible = CX.settings.quality !== 'low';
  const fgr = CX.fieldGroup.getObjectByName('fieldGrass'); if (fgr) fgr.visible = CX.settings.quality !== 'low';
  CX.audio.masterVol = CX.settings.master; CX.audio.musicVol = CX.settings.music; CX.audio.sfxVol = CX.settings.sfx; CX.audio.ambVol = CX.settings.amb; CX.audio.voiceVol = CX.settings.voice; CX.audio.muted = CX.settings.muted; CX.audio.applyVolumes();
  CX.feel.settings = { shake: CX.settings.shake, shakeIntensity: CX.settings.shakeAmt, hitStop: true };
  if (!CX.settings.shake) CX.feel.shake = 0;
  const root = document.documentElement;
  root.classList.toggle('lefty', CX.settings.lefty);
  root.classList.toggle('nohudfx', CX.settings.hudFx === false);
  root.classList.toggle('show-fps', CX.settings.showFps !== false);
  root.style.setProperty('--joy', CX.settings.joySize.toFixed(2));
  if (CX.settings.dmgText === 'off') { CX.floats.forEach(CX.releaseFloater); CX.floats.length = 0; }
  CX.saveSettings();
}

/** 设置面板：分组 + 分段按钮 + 滑块；改动立即生效并保存（和角色存档分开） */
let setTab = 0;   // 设置横版当前页签（11-07 BUG#20）
export function renderSettings() {
  const b = CX.$('set-body');
  const seg = (key: string, opts: [string | number | boolean, string][], cur: unknown) => `<span class="seg">${opts.map(([v, t]) => `<button class="btn ${cur === v ? 'on' : ''}" data-set="${key}" data-v="${String(v)}">${t}</button>`).join('')}</span>`;
  const slider = (id: string, v: number, min: number, max: number, label: string) => `<span class="sl"><input type="range" min="${min}" max="${max}" value="${Math.round(v)}" id="${id}"><b id="${id}-v">${label}</b></span>`;
  b.innerHTML = `<div class="setsec"><h4>画面</h4>
    <div class="setrow"><span>画质</span>${seg('quality', [['low', '低'], ['medium', '中'], ['high', '高'], ['ultra', '超高']], CX.settings.quality)}</div>
    <div class="setrow"><span>帧率上限</span>${seg('fps', [[30, '30'], [60, '60'], [0, '不限制']], CX.settings.fps)}</div>
    <div class="setrow"><span>显示帧率</span>${seg('showFps', [[true, '开'], [false, '关']], CX.settings.showFps !== false)}</div>
    <div class="tipline">超高：更强泛光 + 抗锯齿 + 6144 阴影 + 高精贴图（高端电脑 / 演示）；高：描边 + 泛光 + 高清阴影；中：描边 + 阴影；低：关闭阴影和草丛。30 帧更省电；不限制 = 跟随显示器刷新率（如 120 / 144 Hz，浏览器无法超过屏幕刷新率）。${CX.isMobile ? '<br>已识别为手机：默认中画质，分辨率上限 1.5 倍（低画质 1 倍），阴影和粒子减半' : ''}</div>
    <div class="setrow"><span>3D 副本地图 / 世界沙盘</span>${seg('map3d', [['off', '关'], ['auto', '自动'], ['on', '开']], CX.settings.map3d ?? 'auto')}</div>
    <div class="setrow"><span>角色模型</span>${seg('charModel', [['auto', '自动'], ['new', '写实'], ['classic', '经典']], CX.settings.charModel ?? 'auto')}</div>
    <div class="tipline">写实：新的写实比例人形（目前战士已替换，其它职业陆续更新）；经典：原来的模型；自动：低画质用经典。</div>
    <div class="setrow"><span>HUD 粒子</span>${seg('hudFx', [[false, '关'], [true, '开']], CX.settings.hudFx !== false)}</div>
    <div class="setrow"><span>全屏</span><button class="btn" id="set-fs">${document.fullscreenElement ? '退出全屏' : '⛶ 全屏'}${CX.isTouch ? ' / 横屏' : ''}</button></div>
    <div class="setrow"><span>拍照模式</span><button class="btn" id="set-photo">📷 进入${CX.isTouch ? '' : '（P）'}</button></div></div>
  <div class="setsec"><h4>声音</h4>
    <div class="setrow"><span>主音量</span>${slider('vol-master', CX.settings.master * 100, 0, 100, `${Math.round(CX.settings.master * 100)}`)}</div>
    <div class="setrow"><span>音乐</span>${slider('vol-music', CX.settings.music * 100, 0, 100, `${Math.round(CX.settings.music * 100)}`)}</div>
    <div class="setrow"><span>音效</span>${slider('vol-sfx', CX.settings.sfx * 100, 0, 100, `${Math.round(CX.settings.sfx * 100)}`)}</div>
    <div class="setrow"><span>环境音</span>${slider('vol-amb', CX.settings.amb * 100, 0, 100, `${Math.round(CX.settings.amb * 100)}`)}</div>
    <div class="setrow"><span>语音</span>${slider('vol-voice', CX.settings.voice * 100, 0, 100, `${Math.round(CX.settings.voice * 100)}`)}</div>
    <div class="setrow"><span>静音</span>${seg('muted', [[false, '关'], [true, '开']], CX.settings.muted)}</div></div>
  <div class="setsec"><h4>战斗与镜头</h4>
    <div class="setrow"><span>镜头灵敏度</span>${slider('cam-sens', CX.settings.camSens * 100, 30, 250, `${CX.settings.camSens.toFixed(1)}×`)}</div>
    <div class="setrow"><span>镜头震动</span>${seg('shake', [[false, '关'], [true, '开']], CX.settings.shake)}</div>
    <div class="setrow ${CX.settings.shake ? '' : 'dim'}"><span>震动强度</span>${slider('shake-amt', CX.settings.shakeAmt * 100, 0, 150, `${Math.round(CX.settings.shakeAmt * 100)}%`)}</div>
    <div class="setrow"><span>伤害数字</span>${seg('dmgText', [['all', '全部'], ['compact', '精简'], ['off', '关闭']], CX.settings.dmgText)}</div>
    <div class="tipline">精简：不显示持续伤害跳字，普通伤害只显示当前目标；暴击、治疗、受到的伤害照常显示。</div>
    <div class="setrow"><span>自动拾取</span>${seg('autoLoot', [[false, '关'], [true, '开']], CX.settings.autoLoot)}</div>
    <div class="setrow"><span>装备说明</span>${seg('tipDetail', [[false, '简洁'], [true, '详细']], CX.settings.tipDetail)}</div>
    <div class="tipline">简洁：只看 4 层词条和装备分；详细：再显示强化、来源、套装、耐久和逐项对比。${CX.isTouch ? '' : '背包里按 Alt 随时切换。'}</div></div>
  <div class="setsec"><h4>操作</h4>
    ${CX.isTouch ? `<div class="setrow"><span>摇杆大小</span>${slider('joy-size', CX.settings.joySize * 100, 70, 140, `${Math.round(CX.settings.joySize * 100)}%`)}</div>` : ''}
    <div class="setrow"><span>左右手布局</span>${seg('lefty', [[false, '摇杆在左'], [true, '摇杆在右']], CX.settings.lefty)}</div>
    <div class="tipline">${CX.isTouch ? '摇杆在右：技能键移到左下角，右侧按住拖动移动。' : '电脑：Shift 闪避翻滚，Esc 打开/关闭设置；左右手布局只影响触屏。'}</div>
    <div class="setrow"><span>新手引导</span><button class="btn" id="set-tut">${CX.started ? '重玩新手引导' : '开始游戏后可重玩'}</button></div></div>
  <div class="setsec"><h4>存档</h4>
    <div class="setrow"><span>上次保存</span><b id="set-saved">${saveAgo()}</b></div>
    <div class="setrow"><span>存档操作</span><span class="seg"><button class="btn" id="set-save">立即保存</button><button class="btn" id="set-export">导出存档文件</button></span></div>
    <div class="tipline">每 30 秒自动保存，升级、拾取史诗/传说、任务变化、切换地图、切到后台和关闭页面时也会立刻保存；保留 3 份轮换备份（localStorage + IndexedDB 双份）。导入存档在角色选择画面。${CX.saveBlocked ? '<br><span style="color:#c02010">这个角色的存档读取失败，为防止覆盖已暂停保存。</span>' : ''}</div>
    <div class="setrow"><span>切换角色</span><button class="btn" id="set-back" ${CX.started ? '' : 'disabled'}>${CX.started ? '保存并返回角色选择' : '已在角色选择画面'}</button></div>
    <div class="setrow"><span>版本</span><span>${GAME_VERSION} <button class="btn" id="set-cl">更新日志</button></span></div></div>
  <div class="tipline">设置单独保存，不影响角色存档。角色模型：KayKit Adventurers（CC0，Kay Lousberg）；图标、头像、地形贴图为本作原创手绘风格图像；${CX.audio.tracks.names().length ? '音效为程序实时合成；背景音乐与配音为 AI 生成（曲目缺失时回退程序合成音乐）' : '音乐音效为程序实时合成'}。</div>`;
  // 11-07 BUG#20 横版：左侧分类页签 + 右侧当前分类（两列）；最后那条版权说明并入最后一页
  {
    const secs = Array.from(b.children).filter(e => e.classList.contains('setsec')) as HTMLElement[];
    Array.from(b.children).filter(e => !e.classList.contains('setsec')).forEach(e => secs[secs.length - 1]?.appendChild(e));
    if (setTab >= secs.length) setTab = 0;
    const nav = document.createElement('div'), main = document.createElement('div'); nav.className = 'setnav'; main.className = 'setmain';
    const show = (i: number) => { setTab = i; secs.forEach((x, k) => x.classList.toggle('on', k === i)); nav.querySelectorAll('button').forEach((x, k) => x.classList.toggle('on', k === i)); main.scrollTop = 0; };
    secs.forEach((sec, i) => { const bt = document.createElement('button'); bt.className = 'btn'; bt.textContent = sec.querySelector('h4')?.textContent ?? ''; bt.onclick = () => show(i); nav.appendChild(bt); main.appendChild(sec); });
    b.classList.add('setwide'); b.append(nav, main); show(setTab);
  }
  b.querySelectorAll('[data-set]').forEach(x => (x as HTMLElement).onclick = () => {
    const el = x as HTMLElement, k = el.dataset.set as keyof Settings, raw = el.dataset.v!;
    const v = raw === 'true' ? true : raw === 'false' ? false : k === 'fps' ? +raw : raw;
    (CX.settings as unknown as Record<string, unknown>)[k] = v;
    applySettings(); renderSettings();
  });
  const bindSlider = (id: string, f: (v: number) => string) => { const inp = CX.$(id) as HTMLInputElement; inp.oninput = () => { CX.$(`${id}-v`).textContent = f(+inp.value); applySettings(); }; };
  bindSlider('vol-master', v => { CX.settings.master = v / 100; return `${v}`; });
  bindSlider('vol-music', v => { CX.settings.music = v / 100; return `${v}`; });
  bindSlider('vol-sfx', v => { CX.settings.sfx = v / 100; CX.audio.hit(); return `${v}`; });
  bindSlider('vol-amb', v => { CX.settings.amb = v / 100; return `${v}`; });
  bindSlider('vol-voice', v => { CX.settings.voice = v / 100; return `${v}`; });
  bindSlider('cam-sens', v => { CX.settings.camSens = v / 100; return `${(v / 100).toFixed(1)}×`; });
  bindSlider('shake-amt', v => { CX.settings.shakeAmt = v / 100; return `${v}%`; });
  if (CX.isTouch) bindSlider('joy-size', v => { CX.settings.joySize = v / 100; return `${v}%`; });
  CX.$('set-photo').onclick = () => { CX.togglePanel('settings', false); photoToggle(true, CX.camYaw, CX.camPitch, CX.camDist); };
  CX.$('set-fs').onclick = () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else CX.goFullscreen(); setTimeout(renderSettings, 300); };
  CX.$('set-tut').onclick = () => { if (CX.started) CX.replayTutorial(); };
  // v0.8.2.1 返回角色选择：先保存，再重新载入页面（场景 / 计时器全部干净重建，回到标题时自动选中当前角色）
  CX.$('set-back').onclick = () => {
    if (!CX.started) return;
    const btn = CX.$('set-back') as HTMLButtonElement;
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = '确认返回（会先保存）'; CX.audio.click(); return; }
    btn.dataset.armed = '';
    if ((window as unknown as { __drBackToSelect?: () => boolean }).__drBackToSelect?.()) return;   // Rhett 11-18 不刷新返回选角（?off=selback 回旧重载）
    CX.save();
    if (CX.saveBlocked) CX.toast('存档已暂停，这次不会覆盖读取失败的存档', '#f66');
    const w = window as unknown as { __reloadHook?: () => void };   // 测试用钩子
    window.setTimeout(() => (w.__reloadHook ? w.__reloadHook() : location.reload()), 150);
  };
  CX.$('set-save').onclick = () => { if (!CX.started) return; CX.save(); CX.$('set-saved').textContent = saveAgo(); CX.toast(CX.saveBlocked ? '存档已暂停（读取失败的存档不会被覆盖）' : '已保存', CX.saveBlocked ? '#f66' : '#3f3'); };
  CX.$('set-export').onclick = () => { void exportWithSkins(); };
  CX.$('set-cl').onclick = () => { CX.togglePanel('settings', false); CX.showChangelog(true); };
}

/** v1.2.46 导出存档：角色存档 + 运行时武器模型（GLB base64，压缩后约 1MB/个）同一个文件 */
export async function exportWithSkins(): Promise<string | null> {
  if (!CX.curChar) return null; CX.save();
  let t = CX.roster.exportText(CX.curChar.id); if (!t) return null;
  let n = 0;
  try { const ws = await weaponSkinExport(); if (ws) { const f = JSON.parse(t); f.wskin = ws; n = ws.items.length; t = JSON.stringify(f); } } catch { /* 模型导不出就只导存档 */ }
  downloadText(exportFileName(CX.curChar), t);
  CX.toast(n ? `存档文件已导出（含 ${n} 个自定义武器模型）` : '存档文件已导出', '#3f3');
  return t;
}

export function saveAgo() {
  if (!CX.lastSaveAt) return '还没有保存';
  const s = Math.round((Date.now() - CX.lastSaveAt) / 1000);
  return s < 5 ? '刚刚' : s < 60 ? `${s} 秒前` : `${Math.floor(s / 60)} 分钟前`;
}

// ----- 背包 -----
export let bagSel: { item: ItemInstance; equipped: boolean } | null = null;
/** v0.6.7：背包右侧显示一键分解面板（点格子回到装备说明） */
export let bagSalv = false;

/** v0.9.1s：套装绿色描边、套装 / 暗金粒子光效 */
export const slotFx = (it: { quality: string; setId?: string; ancient?: boolean }) => (it.ancient ? ' is-anc' : it.setId && it.quality !== 'dark' ? ' is-set' : '');
export const sparks = (it: { quality: string; setId?: string; ancient?: boolean }) => (it.setId || it.quality === 'dark' || it.ancient ? '<i class="spk"></i>' : '');
/** 装备格子：手绘图标 + 品质色斜面边框 + 强化等级角标 */
export function itemSlotHtml(it: ItemInstance) {
  const base = it.baseId === 'b_legs' && it.armorType === 'cloth' ? 'b_cloth_legs' : it.baseId;   // 老存档法师的皮革护腿
  return `<div class="slot q-${it.quality}${slotFx(it)}">${itemIcon(base, it.slot)}${sparks(it)}${it.upgrade ? `<b class="uplv">+${it.upgrade}</b>` : ''}${it.locked ? '<i class="slk" title="已锁定"></i>' : ''}${durBadge(it)}</div>`;
}

/** 类别 + 武器/护甲类型：「双手 · 巨剑」「胸甲 · 重甲」 */
export function itemKind(it: ItemInstance) {
  const sub = it.weaponType ? WEAPON_TYPE_NAME[it.weaponType] : it.armorType ? ARMOR_TYPE_NAME[it.armorType] : '';
  return `${SLOT_NAME[it.slot]}${sub ? ' · ' + sub : ''}`;
}

export let STAT_LABEL!: (k: BonusStat | "hp" | "armor") => string;

/** v0.6.7：属性数值文字（强度是整数，其余百分比） */
const statVal = (k: StatK, v: number) => k === 'hp' || k === 'armor' || k === 'power' ? `${v}` : `${v}%`;
/** 技能层：这条加成点名的技能身上有没有（没有 → 灰色）；返回图标用的技能 id */
const SLOT_LABEL: Record<string, string> = { basic: '普攻', skill1: '技能 1', skill2: '技能 2', skill3: '技能 3', skill4: '技能 4', ultimate: '大招' };
function skillState(sk: { skillIds?: string[]; slots?: string[] }): { on: boolean; icon?: string; note?: string } {
  const ids = SLOT_IDS.map(sl => { try { return CX.loadout.preview(sl, CX.ctx())?.baseId ?? ''; } catch { return ''; } });
  if (sk.skillIds?.length) {
    const hit = sk.skillIds.find(id => ids.includes(id));
    if (hit) return { on: true, icon: hit };
    // v0.9.1l：换成同槽的新技能后按槽位继续生效
    const sl = sk.skillIds.map(id => CX.skillBook.slotOf(id)).find(Boolean) as SlotId | undefined;
    if (sl) { const i = SLOT_IDS.indexOf(sl); const cur = CX.skillBook.skillAt(sl); return { on: true, icon: ids[i] || undefined, note: `（${SLOT_LABEL[sl] ?? sl}，当前：${cur?.name ?? ''}）` }; }
    return { on: false, icon: sk.skillIds[0] };
  }
  if (sk.slots?.length) { const i = SLOT_IDS.indexOf(sk.slots[0] as SlotId); return { on: true, icon: ids[i] || undefined }; }
  return { on: true };
}
/** v1.2.14 G3：装备分按当前主专精取权重（防护 / 巨熊这类 gearRole = tank；没投天赋 = 通用权重） */
export function gearRoleNow(): GearRole | undefined {
  const sp = CX.tree?.mainSpec;
  return sp ? specGearRole(sp) : undefined;
}
const live = (l: ItemInstance[]) => l.filter(i => !isBroken(i));
/** 装备分上下文：除 skip 之外身上生效的同套件数（G2 套装进度） */
function scoreCtx(skip: ItemInstance[]): GearScoreCtx {
  const m = new Map(CX.inventory.setCounts());
  for (const r of live(skip)) if (r.setId) m.set(r.setId, Math.max(0, (m.get(r.setId) ?? 0) - 1));
  return { role: gearRoleNow(), classId: CX.cls.id, setBonuses: CX.inventory.setBonuses, setOthers: m };
}
export interface GearScoreInfo { score: number; delta: number | null; lost: LostFx[]; breaksSet: boolean; role: GearRole | 'all' }
/** v1.2.14：装备分 / 和要替换的那几件比 / 将失去的特效（G1–G4） */
export function gearScoreInfo(it: ItemInstance, equipped: boolean, target?: EquipSlot): GearScoreInfo {
  const role = gearRoleNow() ?? 'all';
  if (equipped) return { score: gearScore(it, LOOT_DATA, scoreCtx([it])), delta: null, lost: [], breaksSet: false, role };
  if (!CX.inventory.canEquip(it)) return { score: gearScore(it, LOOT_DATA, scoreCtx([])), delta: null, lost: [], breaksSet: false, role };
  const c = CX.inventory.compare(it, target);
  const ctx = scoreCtx(c.replacesAll), sc = gearScore(it, LOOT_DATA, ctx);
  const old = c.replacesAll.reduce((s, r) => s + gearScore(r, LOOT_DATA, scoreCtx([r])), 0);
  const lost = lostEffects(it, c.replacesAll, LOOT_DATA, CX.cls.id, ctx);
  return { score: sc, delta: sc - old, lost, breaksSet: lost.some(l => l.kind === 'setTier'), role };
}
/** 装备分 + 装等（G4 分开显示）+ 和身上（要替换的那几件）比 ▲▼；断套标出来 */
export function scoreHtml(it: ItemInstance, equipped: boolean, target?: EquipSlot) {
  const g = gearScoreInfo(it, equipped, target), dv = g.delta;
  const d = dv === null ? '' : dv > 0 ? ` <b class="cmp-up">▲${dv}</b>` : dv < 0 ? ` <b class="cmp-dn">▼${-dv}</b>` : ' <b style="color:#aaa">＝</b>';
  return `<span class="tt-score">装备分 <b>${g.score}</b>${d}${g.breaksSet ? ' <b class="cmp-dn">断套</b>' : ''}<span class="tt-ilvl"> · 装等 <b>${it.itemLevel}</b></span></span>`;
}
const LOST_LABEL: Record<LostFx['kind'], string> = { big: '传说特效 ★', dark: '暗金 ❖', engrave: '拓印 ✦', small: '特效 ☆', set: '套装件特效', setTier: '套装效果' };
const cut = (t: string, n = 28) => t.length > n ? t.slice(0, n) + '…' : t;
/** G4：对比时列出「将失去的特效」（红字） */
export function lostFxHtml(lost: LostFx[]) {
  if (!lost.length) return '';
  return `<span class="cmp-dn tt-lost">将失去的特效：${lost.map(l => `${LOST_LABEL[l.kind]}「${cut(l.text)}」`).join('；')}</span>`;
}

/** v1.2.47 主手用了玩家铸造的外观 → 名字下面一行「外观：名字 · 铸造者：角色名」（铸造者以后可换成玩家 ID） */
function skinTipLine(it: ItemInstance, equipped: boolean): string {
  if (!equipped || !it.weaponType || CX.inventory.equipped.mainHand !== it) return '';
  const k = weaponSkinGet(it.weaponType, it.id); if (!k || !weaponSkinHas(k)) return '';
  const m = weaponSkinMeta(k); if (!m) return '';
  const esc = (v: unknown) => String(v ?? '').replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'));
  const author = (m.author as string | undefined) ?? CX.curChar?.name;
  return `<span class="tt-skin" style="color:#ffd070">✦ 外观：${esc(m.name ?? '铸造品')}${author ? ` · 铸造者：${esc(author)}` : ''}</span>`;
}
export function itemTip(it: ItemInstance, equipped: boolean, target?: EquipSlot) {
  const broken = isBroken(it), detail = CX.settings.tipDetail !== false;
  const L = gearLayers(it, LOOT_DATA, CX.cls.id);
  const EL: Record<string, string> = Object.fromEntries(GEAR_ELEMS.map(e => [ELEM_NAME[e], ELEM_COLOR[e]]));
  const elems = [...new Set(L.elems)].map(e => `<b style="color:${EL[e] ?? '#fff'}">〔${e}〕</b>`).join('');
  const lines = [`<b class="tt-name${broken ? ' tt-broken' : ''}${it.quality === 'dark' ? ' tt-dg' : ''}${it.setId ? ' tt-set' : ''}${it.ancient ? ' tt-anc' : ''}" style="color:${broken ? '#ff5050' : itemColor(it)}">${upgradedName(it)}${broken ? '（已损坏）' : ''}${scoreHtml(it, equipped, target)}</b>`,
    `<span class="tt-sub">${it.ancient ? '太古 · ' : ''}${it.setId ? '套装' : QUALITY_NAME[it.quality]} · ${itemKind(it)} · 装等 ${it.itemLevel}${elems ? ' · ' + elems : ''}</span>`];
  { const sk = skinTipLine(it, equipped); if (sk) lines.push(sk); }   // v1.2.47 铸造外观：名字 + 铸造者
  if (it.ancient) lines.push(`<span class="tt-ancline">✹ 太古：词条全部取峰值${it.setId ? '' : '，特效数值 ×2'}</span>`);
  const st = (x: { k: StatK; v: number; sp?: boolean }, plus = false) => `<span class="ly-v">${x.sp ? '✧' : ''}${STAT_LABEL(x.k)} ${plus ? '+' : ''}${statVal(x.k, x.v)}</span>`;
  if (L.base.length) lines.push(`<span class="ly ly-b"><i>基础</i>${L.base.map(x => st(x)).join(' ')}</span>`);
  if (L.attrs.length) lines.push(`<span class="ly ly-a"><i>属性 ◇</i>${L.attrs.map(x => st(x, true)).join(' ')}</span>`);
  for (const sk of L.skills) {
    const s = skillState(sk);
    lines.push(`<span class="ly ly-s${s.on ? '' : ' off'}"><i>技能 ✚</i>${s.icon ? `<span class="ly-ic">${skillIcon(s.icon, '#fff')}</span>` : ''}${sk.sp ? '✧ ' : ''}${sk.text}${s.note ?? ''}${s.on ? '' : '（身上没有这个技能）'}</span>`);
  }
  for (const e of L.effects) lines.push(`<span class="ly ly-e ly-${e.kind}"><i>${e.kind === 'dark' ? '暗金 ❖' : e.kind === 'engrave' ? '拓印 ✦' : e.kind === 'set' ? '套装' : e.kind === 'big' ? '特效 ★' : '特效 ☆'}</i>${e.text}</span>`);
  for (const l of awkTipLines(it)) lines.push(`<span class="tt-${l.cls.replace(' ', ' tt-')}">${l.text}</span>`);   // v0.7.4：觉醒 / 岩纹
  if (detail && it.lines.some(l => /急速|冷却/.test(l))) lines.push(`<span class="tt-src" style="color:#9ab">急速：攻速 / 持续伤害跳数 / 翻滚冷却（上限 40%）；冷却缩减：技能 1~3 与大招（上限 40%，大招可由「暮时·终局」觉醒抬到 80%）</span>`);   // v1.2.37
  if (detail && it.upgrade) lines.push(`<span class="tt-up">${equipped ? '部位' : ''}强化 +${it.upgrade}：${upgradeDesc(it, it.upgrade, FORGE_DATA).join('；')}</span>`);
  else if (it.upgrade) lines.push(`<span class="tt-up">强化 +${it.upgrade}</span>`);
  if (it.quality === 'dark') { const d = DARK_ITEMS.find(x => x.id === it.fixedId); if (d && detail) lines.push(`<span style="color:#a89060;font-style:italic">${d.flavor}</span>`); if (!equipped) lines.push(`<span style="color:#9ad8ff">分解会把效果拓印进暗金典藏</span>`); }
  if (detail && it.source) lines.push(`<span class="tt-src">来源：${it.source}</span>`);
  if (it.pack) lines.push(`<span class="tt-pack" style="color:#7fd4ff">◆ ${packById(it.pack)?.name ?? '扩展内容'}资料片</span><span class="tt-pack" style="color:${hasPack(it.pack) ? '#9ab' : '#f66'};font-size:11px">　未安装${packById(it.pack)?.name ?? '该'}资料片的玩家不可使用</span>`);   // v1.0.1：DLC 装备限制行
  if (it.setId && detail) lines.push(setTipHtml(it));      // v0.5 B：套装名、件数、2/4 件效果（副本小套同样显示）
  if (it.special && detail) lines.push(`<span style="color:#ff9a40">✧ 暗岩锻造：带一条自选特殊属性（淬炼时只换成另一条特殊属性）</span>`);
  if (broken || (detail && (equipped || durOf(it) < DUR_MAX))) lines.push(durLine(it));   // v0.5：耐久
  if (!equipped) {
    const why = CX.inventory.whyCannotEquip(it);
    if (!why) { const lf = lostFxHtml(gearScoreInfo(it, false, target).lost); if (lf) lines.push(lf); }   // v1.2.14 G4：将失去的特效（简洁模式也显示）
    if (why) lines.push(`<span class="cmp-dn">${why}</span>`);
    else if (detail) {
      const c = CX.inventory.compare(it, target);
      const f = (v: number, k: BonusStat | 'hp' | 'armor') => v ? `<span class="${v > 0 ? 'cmp-up' : 'cmp-dn'}">${STAT_LABEL(k)} ${v > 0 ? '+' : ''}${v}${k === 'hp' || k === 'armor' || k === 'power' ? '' : '%'}</span>` : '';
      const diff = [f(c.hp, 'hp'), f(c.armor, 'armor'), ...BONUS_STATS.map(k => f(c[k], k)), c.itemLevel ? `<span class="${c.itemLevel > 0 ? 'cmp-up' : 'cmp-dn'}">装等 ${c.itemLevel > 0 ? '+' : ''}${c.itemLevel}</span>` : ''].filter(Boolean).join(' ') || '属性相同';
      lines.push(c.replacesAll.length
        ? `<br>对比 ${c.replacesAll.map(r => `<span style="color:${itemColor(r)}">${r.name}</span>`).join(' + ')}（${CX.inventory.slotName(c.target)}）：${diff}`
        : `<br><span class="cmp-up">${CX.inventory.slotName(c.target)}没有装备</span>${diff !== '属性相同' ? '：' + diff : ''}`);
    }
    if (!why && it.slot === 'twoHand' && CX.inventory.twoHandBlocksOff() && CX.inventory.equipped.offHand) lines.push(`<span style="color:#ffb070">双手武器：副手会放回背包</span>`);
    if (!why && it.slot === 'offHand' && CX.inventory.twoHandBlocksOff() && CX.inventory.equipped.mainHand?.slot === 'twoHand') lines.push(`<span style="color:#ffb070">会卸下双手武器</span>`);
  }
  // v0.5 C：锁定的不会被分解
  if (it.locked) lines.push(`<span class="tt-lock"><i class="lockic"></i>已锁定：任何分解按钮都会跳过</span>`);
  else if (it.forged && detail) lines.push(`<span style="color:#c09060">铁匠兑换 · 暗岩锻造系列</span>`);
  return lines.join('<br>');
}

/** 简洁 / 详细 切换（设置里也能改） */
export function toggleTipDetail() { CX.settings.tipDetail = !CX.settings.tipDetail; CX.saveSettings(); CX.toast(`装备说明：${CX.settings.tipDetail ? '详细' : '简洁'}`, '#d8c090'); }
export const tipModeBtn = (id: string) => `<button class="btn" id="${id}" title="切换装备说明 简洁 / 详细${CX.isTouch ? '' : '（Alt）'}">${CX.settings.tipDetail ? '简洁' : '详细'}</button>`;

/** 等级 / 生命 / 护甲 / 平均装等 一行 */
export function statLine() {
  const cs = CX.charSheet();
  return `等级 ${cs.level} · 生命 ${CX.player.maxHp} · 护甲 ${CX.player.armor}（物理减伤 ${Math.round(CX.player.armor / (CX.player.armor + 400) * 100)}%）· 平均装等 ${cs.ilvl}`;
}

/** 穿装备（可指定格子），失败提示原因 */
export function doEquip(it: ItemInstance, target?: EquipSlot) {
  const r = CX.inventory.tryEquip(it.id, target);
  if (!r.ok) { CX.toast(r.reason, '#ff6060'); return false; }
  CX.audio.equip();
  CX.toast(`装备了 [${it.name}]${r.removed.length > 1 ? `，${r.removed.slice(1).map(x => x.name).join('、')} 放回背包` : ''}`, QUALITY_COLOR[it.quality]);
  CX.save();
  return true;
}

export function doUnequip(slot: EquipSlot) {
  const it = CX.inventory.equipped[slot];
  if (!it) return false;
  if (!CX.inventory.unequip(slot)) { CX.toast('背包已满，无法卸下', '#ff6060'); return false; }
  CX.audio.equip(); CX.toast(`卸下了 [${it.name}]`, '#d8c090'); CX.save();
  return true;
}

export function renderBag() {
  if (CX.$('bag').style.display !== 'flex') return;
  CX.$('bag-gold').innerHTML = goldHtml();
  CX.$('bag-mats').innerHTML = stacksHtml();
  renderSlotBag(document.getElementById('bag-slot8'));   // v1.2.15 第 8 技能格（没有可装入的物品 = 不显示）
  CX.$('bag-stats').innerHTML = statLine();
  const eq = CX.$('bag-eq'); eq.innerHTML = '';
  // 迷你穿戴栏：16 格只显示图标，点击查看/卸下；完整的纸娃娃在角色面板（C）
  EQUIP_SLOTS.forEach(slot => {
    const it = CX.inventory.equipped[slot];
    const c = document.createElement('div'); c.className = 'mcell'; c.title = CX.inventory.slotName(slot);
    c.innerHTML = it ? itemSlotHtml(it) : `<div class="slot empty sil">${slotSilhouette(slot)}</div>`;
    if (it) {
      c.onclick = () => { bagSel = { item: it, equipped: true }; renderBagTip(); };
      c.addEventListener('mouseenter', ev => showTip(itemTip(it, true), ev));
      c.addEventListener('mouseleave', hideTip);
    }
    eq.appendChild(c);
  });
  const g = CX.$('bag-grid'); g.innerHTML = '';
  const willSalv = bagSalv ? salvPickIds() : null;
  for (let i = 0; i < CX.inventory.capacity; i++) {
    const it = CX.inventory.bag[i];
    const c = document.createElement('div'); c.className = 'cell' + (it ? '' : ' empty');
    if (it) {
      c.innerHTML = `${itemSlotHtml(it)}<span class="nm" style="color:${itemColor(it)}">${it.name}</span>`;
      if (!CX.inventory.canEquip(it)) c.classList.add('noeq');
      else {
        const up = CX.inventory.compare(it);
        if (!up.replaces || QUALITIES.indexOf(it.quality) > QUALITIES.indexOf(up.replaces.quality) || up.itemLevel > 0) c.innerHTML += '<span class="up">▲</span>';
      }
      if (willSalv?.has(it.id)) c.classList.add('willsalv');
      c.onclick = () => { bagSalv = false; bagSel = { item: it, equipped: false }; renderBag(); };
    }
    g.appendChild(c);
  }
  renderBagTip();
}

export function renderBagTip() {
  const tip = CX.$('bag-tip');
  CX.$('bag-salv').classList.toggle('on', bagSalv);
  if (bagSalv) { bagSel = null; renderSalvagePanel(tip, renderBag, { prefix: 'b-' }); return; }
  if (!bagSel || (!bagSel.equipped && !CX.inventory.bag.includes(bagSel.item)) || (bagSel.equipped && !CX.inventory.slotOf(bagSel.item))) { tip.innerHTML = ''; bagSel = null; return; }
  const { item, equipped } = bagSel;
  // 多个可选格子（戒指/饰品、战士的单手武器）：额外给「装备到 X」按钮
  const alts = !equipped && CX.inventory.canEquip(item) ? CX.inventory.slotsFor(item) : [];
  tip.innerHTML = `<div class="tip">${itemTip(item, equipped)}<br>${equipped
    ? '<button class="btn" id="b-un">卸下</button>'
    : `<button class="btn" id="b-eq" ${CX.inventory.canEquip(item) ? '' : 'disabled'}>装备</button>${alts.length > 1 ? alts.map(s => `<button class="btn" data-eqto="${s}">→ ${CX.inventory.slotName(s)}</button>`).join('') : ''}`}${item.noSalvage ? '' : lockBtnHtml(item, 'b-lock')}${tipModeBtn('b-tipm')}</div>`;
  CX.$('b-tipm').onclick = () => { toggleTipDetail(); renderBag(); };
  const lk = document.getElementById('b-lock'); if (lk) lk.onclick = () => { toggleLockUi(item); renderBag(); };
  if (equipped) CX.$('b-un').onclick = () => { if (doUnequip(CX.inventory.slotOf(item)!)) bagSel = null; renderBag(); };
  else {
    CX.$('b-eq').onclick = () => { if (doEquip(item)) bagSel = { item, equipped: true }; renderBag(); };
    tip.querySelectorAll('[data-eqto]').forEach(b => (b as HTMLElement).onclick = () => { if (doEquip(item, (b as HTMLElement).dataset.eqto as EquipSlot)) bagSel = { item, equipped: true }; renderBag(); });
  }
}

// ----- 角色面板（C）：纸娃娃 + 属性 -----
// 左列 头部 项链 肩部 披风 胸甲 护腕；右列 手套 腰带 腿甲 鞋子 戒指×2 饰品×2；底部 主手 副手；中间职业头像
export const DOLL_LEFT: EquipSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands'];   // v1.2.37d 左右各 7 格

export const DOLL_RIGHT: EquipSlot[] = ['waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2'];

export const DOLL_BOTTOM: EquipSlot[] = ['mainHand', 'offHand'];

/** 空格子的淡色轮廓：按职业取该部位的代表图标 */
export function slotSilhouette(slot: EquipSlot) {
  const mage = CX.cls.id === 'mage';
  const m: Record<EquipSlot, string> = {
    head: mage ? 'b_hood' : 'b_helm', neck: 'b_amulet', shoulder: mage ? 'b_mantle' : 'b_pauldron', back: 'b_cloak', chest: mage ? 'b_robe' : 'b_chest',
    wrist: mage ? 'b_wrap' : 'b_bracer', hands: mage ? 'b_silk_gloves' : 'b_gauntlet', waist: mage ? 'b_sash' : 'b_girdle', legs: mage ? 'b_cloth_legs' : 'b_legs',
    feet: mage ? 'b_cloth_shoes' : 'b_sabaton', ring1: 'b_ring', ring2: 'b_ring', trinket1: 'b_idol', trinket2: 'b_idol',
    mainHand: mage ? 'b_staff' : 'b_sword', offHand: mage ? 'b_tome' : 'b_shield',
  };
  if (CX.cls.id === 'alchemy') Object.assign(m, { head: 'b_amask', shoulder: 'b_amantle', chest: 'b_acoat', wrist: 'b_awrap', hands: 'b_agloves', waist: 'b_abelt', legs: 'b_alegs', feet: 'b_aboots', mainHand: 'b_flask', offHand: 'b_reagent' });
  if (CX.cls.ext?.silhouette) Object.assign(m, CX.cls.ext.silhouette);   // v1.0.6 内容包职业
  if (CX.cls.id === 'chrono') Object.assign(m, { head: 'b_lhood', shoulder: 'b_lshoulder', chest: 'b_lvest', wrist: 'b_lbracer', hands: 'b_lgloves', waist: 'b_lbelt', legs: 'b_llegs', feet: 'b_lboots', mainHand: 'b_chakram', offHand: 'b_hourglass' });
  return itemIcon(m[slot]);
}

export function dollSlot(slot: EquipSlot) {
  const it = CX.inventory.equipped[slot];
  // 双手武器在身时副手格显示同一把武器的淡影
  const ghost = !it && slot === 'offHand' && CX.inventory.twoHandBlocksOff() && CX.inventory.equipped.mainHand?.slot === 'twoHand' ? CX.inventory.equipped.mainHand : null;
  const d = document.createElement('div');
  d.className = 'pd' + (CX.charSel === slot ? ' sel' : '');
  d.dataset.slot = slot;
  d.innerHTML = it ? itemSlotHtml(it) : ghost ? `<div class="slot ghost q-${ghost.quality}${slotFx(ghost)}">${itemIcon(ghost.baseId, ghost.slot)}${sparks(ghost)}</div>` : `<div class="slot empty sil">${slotSilhouette(slot)}</div>`;
  d.innerHTML += `<small>${CX.inventory.slotName(slot)}</small>`;
  d.addEventListener('mouseenter', ev => showTip(it ? itemTip(it, true) + '<br><span style="color:#aaa">点击卸下</span>' : `<b>${CX.inventory.slotName(slot)}</b><br><span style="color:#aaa">${ghost ? '双手武器占用' : '空'} · 点击查看背包里可穿的装备</span>`, ev));
  d.addEventListener('mouseleave', hideTip);
  // 点击：有装备就卸下（卸下后下方列出可换的装备，一键穿回）；空格子列出背包里能穿的
  d.onclick = () => { hideTip(); CX.charSel = slot; if (it) doUnequip(slot); renderChar(); };
  return d;
}

// 3D 预览（角色面板）+ 试穿
export let preview!: Preview;

export let tryOn: { slot: EquipSlot; item: ItemInstance } | null = null;

export function renderChar() {
  if (!CX.started || CX.$('char').style.display !== 'flex') return;
  const cs = CX.charSheet();
  { const nu = nextUnlock(cs.level); CX.$('char-sub').textContent = `${achTitle() ? `「${achTitle()}」` : ''}${CX.cls.name} · 等级 ${cs.level} · 平均装等 ${cs.ilvl}${nu ? ` · 下一个解锁：${nu.lv} 级 ${nu.name}` : ''}`; }
  renderGearSets(); renderParagon();
  const fill = (id: string, slots: EquipSlot[]) => { const el = CX.$(id); el.innerHTML = ''; slots.forEach(s => el.appendChild(dollSlot(s))); };
  fill('pd-left', DOLL_LEFT); fill('pd-right', DOLL_RIGHT); fill('pd-bottom', DOLL_BOTTOM);
  CX.$('pd-portrait').innerHTML = uiIcon(M.portraitKey(CX.cls.id));
  if (preview.ok) {
    CX.$('pd-portrait').style.display = 'none';
    const eq = { ...CX.inventory.equipped };
    if (tryOn) { eq[tryOn.slot] = tryOn.item; if (tryOn.item.slot === 'twoHand' && CX.inventory.twoHandBlocksOff()) delete eq.offHand; }
    preview.show(CX.cls.id, CX.look, eq);
    CX.$('pd-try').innerHTML = tryOn ? `试穿：<b style="color:${itemColor(tryOn.item)}">${tryOn.item.name}</b><button class="btn" id="pd-untry">还原</button>` : '';
    const ut = document.getElementById('pd-untry'); if (ut) ut.onclick = () => { tryOn = null; renderChar(); };
  } else CX.$('pd-3d').classList.add('no3d');
  CX.$('pd-name').innerHTML = `<b>${CX.cls.name}</b><br><small>${ARMOR_TYPE_NAME[CX.cls.equip.armorType ?? 'plate']} · ${CX.cls.ext ? CX.cls.ext.weaponDesc : CX.cls.id === 'mage' ? '法杖 / 魔杖·匕首 + 副手' : CX.cls.id === 'chrono' ? '双时轮 / 时轮 + 沙漏' : CX.cls.id === 'alchemy' ? '药瓶 + 试剂匣' : '单手 + 盾 / 双持 / 双手'}</small>`;
  const sets = new Map<string, number>();
  CX.inventory.activeItems().forEach(i => i.setId && sets.set(i.setId, (sets.get(i.setId) ?? 0) + 1));   // 已损坏的不算套装件数
  const row = (k: string, v: string, hint = '') => `<div class="strow"><span>${k}</span><b>${v}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;
  const pct = (v: number) => `${v}%`;
  CX.$('char-stats').innerHTML =
    `<h4>基础</h4>` +
    row('生命', `${CX.player.maxHp}`, `职业 ${CX.cls.baseHp + CX.cls.hpPerLevel * (cs.level - 1)} + 装备 ${cs.gear.hp}${cs.talent.hp ? ` + 天赋 ${cs.talent.hp}` : ''}`) +
    row('平均装等', `${cs.ilvl}`, '16 格平均，双手武器计两次') +
    (() => { const eq = CX.inventory.equippedItems(), br = eq.filter(isBroken).length, low = Math.min(DUR_MAX, ...eq.map(durOf));
      return eq.length ? row('耐久', br ? `<span class="dur-broken">${br} 件已损坏</span>` : `<span class="${low <= 25 ? 'dur-low' : 'dur-ok'}">最低 ${low}%</span>`, br ? '已损坏装备的属性不生效，找铁匠修理' : '阵亡时身上装备 -10%') : ''; })() +
    charSetRows(row) +   // v0.5 B：套装与暗金典藏（已损坏的不算件数）
    `<h4>攻击</h4>` +
    row(CX.cls.powerName, `${cs.power}`, `技能伤害 +${cs.powerDmg}%${cs.talent.power ? `（装备 ${cs.gear.power} + 天赋 ${cs.talent.power}）` : ''}`) +
    row('等级加成', `+${cs.levelDmg}%`, '技能伤害') +
    row('暴击率', pct(cs.crit), `职业 ${Math.round(CX.cls.critChance * 100)}% + 装备 ${cs.gear.crit}%${cs.talent.crit ? ` + 天赋 ${cs.talent.crit}%` : ''}（上限 ${CX.CRIT_CAP}%）`) +
    row('暴击伤害', pct(cs.critMult), `暴击时伤害倍率${cs.talent.critDmg ? `（天赋 +${cs.talent.critDmg}%）` : ''}`) +
    row('急速', pct(cs.haste), `攻速 / 持续伤害跳数 / 翻滚冷却 +${cs.haste}%${cs.talent.haste ? `（含天赋 ${cs.talent.haste}%）` : ''}（上限 ${CX.HASTE_CAP}%${cs.hasteRaw > CX.HASTE_CAP ? `，溢出 ${Math.round((cs.hasteRaw - CX.HASTE_CAP) * 10) / 10}%` : ''}）；不影响技能冷却`) +
    row('冷却缩减', pct(cs.cdr.skill), `技能 1~3 冷却 -${cs.cdr.skill}%（上限 ${cs.cdr.skillCap}%${cs.cdr.skillRaw > cs.cdr.skillCap ? `，溢出 ${Math.round((cs.cdr.skillRaw - cs.cdr.skillCap) * 10) / 10}%` : ''}）`) +
    row('大招冷却缩减', pct(cs.cdr.ult), `大招冷却 -${cs.cdr.ult}%（上限 ${cs.cdr.ultCap}%${cs.cdr.ultRaw > cs.cdr.ultCap ? `，溢出 ${Math.round((cs.cdr.ultRaw - cs.cdr.ultCap) * 10) / 10}%` : ''}；每件「暮时·终局」觉醒上限 +10%，最多 80%）`) +
    `<h4>防御</h4>` +
    row('护甲', `${CX.player.armor}`, `物理减伤 ${Math.round(CX.player.armor / (CX.player.armor + 400) * 1000) / 10}%`) +
    `<h4>其它</h4>` +
    row('移动速度', pct(100 + cs.speed), `装备 +${cs.gear.speed}%${cs.talent.speed ? ` + 天赋 ${cs.talent.speed}%` : ''}（上限 ${CX.SPEED_CAP}%）`) +
    (() => {
      const res = CX.inventory.resonance();
      const any = GEAR_ELEMS.some(e => res.counts[e] > 0);
      if (!any) return `<h4>元素共鸣</h4><div class="strow"><small>蓝色及以上装备的词条可能带〔火〕〔霜〕〔影〕〔岩〕元素，同元素凑满 3 / 6 / 9 条激活共鸣</small></div>`;
      return `<h4>元素共鸣</h4>` + GEAR_ELEMS.filter(e => res.counts[e] > 0).map(e => {
        const n = res.counts[e], next = RES_TIERS.find(t => n < t);
        const on = RESONANCE[e].filter((_, i) => n >= RES_TIERS[i]).map(r => r.text).join('；');
        return row(`<span style="color:${ELEM_COLOR[e]}">${ELEM_NAME[e]}</span>`, `${n} 条`, on ? `已激活：${on}${next ? `（${next} 条：${RESONANCE[e][RES_TIERS.indexOf(next)].text}）` : ''}` : `${next} 条激活：${RESONANCE[e][0].text}`);
      }).join('');
    })() +
    '';
  void sets;
  // 选中格子：列出背包里能放进这个格子的装备（带对比），一键穿上
  const tip = CX.$('char-tip');
  if (!CX.charSel) { tip.innerHTML = `<div class="hint" style="margin-top:6px">点击格子卸下装备，或查看背包里可以穿到该部位的装备。键盘 C 打开/关闭。</div>`; return; }
  const slot = CX.charSel;
  const cands = CX.inventory.bag.filter(i => CX.inventory.slotsFor(i).includes(slot) && CX.inventory.canEquip(i));
  tip.innerHTML = `<div class="tip"><b class="tt-name">${CX.inventory.slotName(slot)}</b>${CX.inventory.equipped[slot] ? `${itemTip(CX.inventory.equipped[slot]!, true)}<br><button class="btn" id="c-un">卸下</button>${CX.inventory.equipped[slot]!.noSalvage ? '' : lockBtnHtml(CX.inventory.equipped[slot]!, 'c-lock')}` : ''}
    ${cands.length ? `<div class="cands">${cands.map(i => `<div class="cand" data-uid="${i.id}">${itemSlotHtml(i)}<div class="sinfo"><b style="color:${QUALITY_COLOR[i.quality]}">${upgradedName(i)}</b><small>${itemKind(i)} · 装等 ${i.itemLevel}${(() => { const d = CX.inventory.compare(i, slot).itemLevel; return d ? ` <span class="${d > 0 ? 'cmp-up' : 'cmp-dn'}">(${d > 0 ? '+' : ''}${d})</span>` : ''; })()}</small></div><button class="btn" data-try="${i.id}">试穿</button><button class="btn" data-eq="${i.id}">装备</button>${i.noSalvage ? '' : lockBtnHtml(i, 'data-lock')}</div>`).join('')}</div>` : '<br><span style="color:#aaa">背包里没有可以穿到这里的装备</span>'}</div>`;
  const un = document.getElementById('c-un'); if (un) un.onclick = () => { doUnequip(slot); renderChar(); };
  const cl = document.getElementById('c-lock'); if (cl) cl.onclick = () => { toggleLockUi(CX.inventory.equipped[slot]!); renderChar(); };
  tip.querySelectorAll<HTMLElement>('[data-lock]').forEach(b => { b.onclick = () => { const it = CX.inventory.find(b.dataset.lock!); if (it) toggleLockUi(it); renderChar(); }; });
  tip.querySelectorAll('.cand').forEach(el => {
    const it = CX.inventory.bag.find(x => x.id === (el as HTMLElement).dataset.uid)!;
    el.querySelector('.slot')!.addEventListener('mouseenter', ev => showTip(itemTip(it, false, slot), ev as MouseEvent));
    el.querySelector('.slot')!.addEventListener('mouseleave', hideTip);
    (el.querySelector('[data-eq]') as HTMLElement).onclick = () => { hideTip(); tryOn = null; doEquip(it, slot); renderChar(); };
    const tb = el.querySelector('[data-try]') as HTMLElement | null; if (tb) tb.onclick = () => { tryOn = { slot, item: it }; renderChar(); };
  });
}

// ----- 掉落说明书（全屏面板 + 左侧标签模板）-----
export let dgSrc = GUIDE_SOURCES[0].id;

export let dgFilter = { slot: '', q: '', text: '', own: '' };
/** v0.5 B：副本来源的难度页（普通 / 英雄 / 史诗 / 噩梦），套装和暗金按难度出现 */

export function openDropGuide(src?: string, itemKey?: string) { if (src && src !== dgSrc) { dgSrc = src; altSel = ''; } if (itemKey) altSel = itemKey; altBack = null; CX.togglePanel('dropguide', true); renderDropGuide(); }

// ----- v0.9.6d 战利品祭坛：说明书掉落页 + 副本地图掉落列表合并（左来源 · 中 3D 祭坛 · 右物品卡 + 反查）-----
export let altSel = '';                                   // 选中的物品 key
let altMiss = false, altAncView = false;                  // 「我缺的」筛选、物品卡「看太古外观」
let altBack: { raid: string; boss: number } | null = null;  // 从副本地图进来：显示「返回副本地图」
const altFold = new Set<string>();                        // 折叠的来源分组
let altOrbit: GuideItem[] = [];
const altHas = (k: string) => { const c = collected(CX.codex, k); return Array.isArray(c) ? c.length > 0 : c; };
/** 物品 → 光效档（0 普通 1 蓝 2 紫 3 套装 4 橙 5 暗金）+ 颜色 */
function altTier(gi: GuideItem): { tier: number; color: string; qk: string } {
  if (gi.kind === 'legendary') return { tier: 4, color: QUALITY_COLOR.orange, qk: 'orange' };
  if (gi.kind === 'set' || gi.setId) return { tier: 3, color: '#ff3040', qk: 'purple' };
  const q = gi.kind === 'fixed' ? gi.qualities[0] : gi.qualities[gi.qualities.length - 1];
  const tier = q === 'dark' ? 5 : q === 'orange' ? 4 : q === 'purple' ? 2 : q === 'blue' ? 1 : 0;
  return { tier, color: QUALITY_COLOR[q as keyof typeof QUALITY_COLOR] ?? '#ccc', qk: gi.kind === 'fixed' && q !== 'dark' && q !== 'orange' ? 'purple' : q };
}
const pctTxt = (p: number) => p >= 0.1 ? `${Math.round(p * 100)}%` : p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`;
/** 来源徽章：首领名第一个字 + 分组颜色 */
function altBadge(s: GuideSource): string {
  const nm = (/「(.+?)」/.exec(s.name)?.[1] ?? s.name.split(/·|\s/).filter(Boolean).pop() ?? s.name).replace(/^(Boss|前置首领)\s*/, '');
  const k = s.group === '长副本' ? 'raid' : s.group === '终局' ? 'aby' : s.group === '30 级副本' ? 'dg' : /世界首领/.test(s.name) ? 'wb' : s.boss || /精英|稀有/.test(s.name) ? 'el' : 'fd';
  return `<span class="alt-bd b-${k}${s.boss || k === 'wb' || k === 'el' ? ' boss' : ''}">${nm.charAt(0)}</span>`;
}
function altBossName(s: GuideSource): string | null {
  if (!s.boss && !/世界首领|精英|稀有/.test(s.name) && !s.id.startsWith('abyss')) return null;
  return /「(.+?)」/.exec(s.name)?.[1] ?? s.name.split('·').pop()!.trim();
}
/** 「在地图上定位」：副本 = 打开副本地图并选中首领；野外 = 区域地图；深渊没有固定位置 */
/** v0.9.6g 玩法介绍预览：说明书来源 → 祭坛物品（按类别轮流取，anc = 最后一件橙装做成太古示例） */
export function introItems(srcId: string, kinds: string[], n: number, anc: boolean): AltarItem[] {
  const src = GUIDE_SOURCES.find(s => s.id === srcId); if (!src) return [];
  const tierOf: Record<string, number> = { set: 3, legendary: 4, dark: 5 };
  const all = srcItems(src, LOOT_DATA, CX.cls.id).map(gi => ({ gi, t: altTier(gi) }));
  const buckets = kinds.map(k => all.filter(x => x.t.tier === tierOf[k]));
  const out: AltarItem[] = [];
  for (let i = 0; out.length < n && buckets.some(b => b.length > i); i++) for (const b of buckets) if (b[i] && out.length < n) out.push({ key: b[i].gi.key, name: b[i].gi.name, slot: b[i].gi.slot, color: b[i].t.color, tier: b[i].t.tier });
  if (anc) { const k = out.map(x => x.tier).lastIndexOf(4); if (k >= 0) out[k] = { ...out[k], key: out[k].key + '|anc', name: out[k].name + '（太古）', anc: true }; }
  return out;
}
export function altarLocate(srcId: string): string | null {
  const s = GUIDE_SOURCES.find(x => x.id === srcId); if (!s) return null;
  const loc = srcLocation(s);
  if (!loc) { CX.toast('暗岩深渊：任意传送阵 → 终局 进入', '#c08aff'); return 'abyss'; }
  CX.togglePanel('dropguide', false);
  if ('raid' in loc) { openRaidMap(loc.raid, true); if (loc.boss >= 0) dmSelect(loc.boss); return loc.raid; }
  openWorldMap('zone', loc.map as MapId); return loc.map;
}
/** 副本地图点首领 → 打开同一个祭坛页（选中该首领来源） */
export function openAltarFromMap(raid: string, boss: number): boolean {
  const id = srcOfBoss(raid, boss); if (!id) return false;
  if (id !== dgSrc) altSel = '';
  dgSrc = id; CX.togglePanel('dropguide', true); altBack = { raid, boss }; renderDropGuide(); return true;
}
export function altarState() { return { src: dgSrc, sel: altSel, miss: altMiss, back: altBack, fold: [...altFold], orbit: altOrbit.map(i => i.key) }; }

/** 试穿说明书里的装备：按底材生成一件样品，打开角色面板穿上看 */
export function tryGuideItem(gi: GuideItem) {
  const prev = CX.gen.classId; CX.gen.classId = CX.cls.id;
  let it: ItemInstance | null = null;
  if (gi.kind === 'fixed' || gi.kind === 'set') { const def = LOOT_DATA.fixedItems.find(f => f.name === gi.name); it = def ? CX.gen.generateFixed(def.id, CX.progression.level + 2) : null; }
  else for (let k = 0; k < 300 && (!it || it.baseId !== gi.baseId); k++) it = CX.gen.generate(CX.progression.level + 2, gi.qualities[gi.qualities.length - 1], [gi.slot]);
  CX.gen.classId = prev;
  if (!it) return;
  if (gi.kind === 'legendary') it.name = gi.name;
  const slot = CX.inventory.slotsFor(it)[0]; if (!slot) { CX.toast('这件装备当前职业穿不了', '#f66'); return; }
  tryOn = { slot, item: it };
  CX.togglePanel('dropguide', false); CX.togglePanel('char', true); renderChar();
}

export function renderDropGuide() {
  const cls = CX.cls.id, all = allCollectibles(LOOT_TABLES, LOOT_DATA, cls);
  const got = [...all].filter(altHas).length;
  CX.$('dg-progress').textContent = `${CX.cls.name} · 收集进度 ${got}/${all.size}`;
  const f = dgFilter;
  // ---- 左侧：搜索 + 我缺的 + 来源（首领徽章 · 分组折叠 · 每来源收集进度条）
  const qi = document.getElementById('alt-search') as HTMLInputElement | null, mi = document.getElementById('alt-miss') as HTMLInputElement | null;
  if (qi && !qi.dataset.b) { qi.dataset.b = '1'; qi.oninput = () => { f.text = qi.value; const t = document.getElementById('dgf-text') as HTMLInputElement | null; if (t) t.value = qi.value; renderDropGuide(); }; }
  if (mi && !mi.dataset.b) { mi.dataset.b = '1'; mi.onchange = () => { altMiss = mi.checked; f.own = altMiss ? 'no' : ''; const o = document.getElementById('dgf-own') as HTMLSelectElement | null; if (o) o.value = f.own; renderDropGuide(); }; }
  if (qi && qi.value !== f.text) qi.value = f.text;
  if (mi) mi.checked = altMiss;
  const q = f.text.trim();
  let html = '', grp = '';
  const groups = [...new Set(GUIDE_SOURCES.map(s => s.group))];
  for (const gname of groups) {
    const srcs = GUIDE_SOURCES.filter(s => s.group === gname);
    const rows: string[] = []; let gGot = 0, gTot = 0;
    for (const s of srcs) {
      const its = srcItems(s, LOOT_DATA, cls), have = its.filter(i => altHas(i.key)).length;
      gGot += have; gTot += its.length;
      if (q && !s.name.includes(q) && !s.sub.includes(q) && !its.some(i => i.name.includes(q))) continue;
      if (altMiss && have >= its.length) continue;
      const anc = srcAncient(s);
      rows.push(`<div class="ftab alt-src${s.id === dgSrc ? ' on' : ''}" data-src="${s.id}">${altBadge(s)}<span class="alt-sn">${s.name}${anc ? `<i class="alt-ancb" title="可出太古：${anc.note}">✹</i>` : ''}<small>${s.sub}</small><i class="alt-pg" title="已收集 ${have}/${its.length}"><b style="width:${its.length ? Math.round(have / its.length * 100) : 0}%"></b></i>${altMiss ? `<em class="alt-need">缺 ${its.length - have}</em>` : ''}</span></div>`);
    }
    if (!rows.length) continue;
    grp = gname;
    const fold = altFold.has(gname) && !q;
    html += `<div class="fgroup alt-gh" data-grp="${gname}">${fold ? '▸' : '▾'} ${gname}<small>${gGot}/${gTot}</small></div>${fold ? '' : rows.join('')}`;
  }
  void grp;
  CX.$('dg-tabs').innerHTML = html || '<div class="hint">没有符合的来源</div>';
  CX.$('dg-tabs').querySelectorAll('[data-src]').forEach(e => { (e as HTMLElement).onclick = () => { const id = (e as HTMLElement).dataset.src!; if (id !== dgSrc) altSel = ''; dgSrc = id; altBack = null; altAncView = false; renderDropGuide(); CX.audio.click(); }; });
  CX.$('dg-tabs').querySelectorAll('[data-grp]').forEach(e => { (e as HTMLElement).onclick = () => { const g = (e as HTMLElement).dataset.grp!; if (altFold.has(g)) altFold.delete(g); else altFold.add(g); renderDropGuide(); }; });
  // ---- 筛选 + 列表（2D 列表始终照画：回退和旧测试都靠它）
  const src = GUIDE_SOURCES.find(s => s.id === dgSrc)!;
  let items = srcItems(src, LOOT_DATA, cls).slice();
  const slots = [...new Set(items.map(i => i.slot))];
  if (CX.$('dg-filter').dataset.built !== src.id) {
    CX.$('dg-filter').dataset.built = src.id;
    CX.$('dg-filter').innerHTML = `<select id="dgf-slot"><option value="">全部部位</option>${slots.map(s => `<option value="${s}">${SLOT_NAME[s]}</option>`).join('')}</select>
      <select id="dgf-q"><option value="">全部品质</option>${QUALITIES.filter(q => q !== 'white').map(q => `<option value="${q}">${QUALITY_NAME[q]}</option>`).join('')}</select>
      <select id="dgf-own"><option value="">全部</option><option value="got">已获得</option><option value="no">未获得</option></select>
      <input id="dgf-text" placeholder="搜索名字" style="width:120px">`;
    (['slot', 'q', 'own'] as const).forEach(k => { const el = CX.$(`dgf-${k}`) as HTMLSelectElement; el.value = f[k]; el.onchange = () => { f[k] = el.value; if (k === 'own') altMiss = el.value === 'no'; renderDropGuide(); }; });
    const ti = CX.$('dgf-text') as HTMLInputElement; ti.value = f.text; ti.oninput = () => { f.text = ti.value; renderDropGuide(); };
  }
  const textHit = !q || items.some(i => i.name.includes(q));   // 搜的是来源名时不过滤物品
  items = items.filter(i => (!f.slot || i.slot === f.slot) && (!f.q || i.qualities.includes(f.q as never)) && (!textHit || !q || i.name.includes(q)));
  if (f.own) items = items.filter(i => { const has = altHas(i.key); return f.own === 'got' ? has : !has; });
  if (!items.some(i => i.key === altSel)) altSel = (items.find(i => i.kind === 'legendary' && !altHas(i.key)) ?? items.find(i => i.kind !== 'base' && !altHas(i.key)) ?? items.find(i => i.kind !== 'base') ?? items[0])?.key ?? '';
  const qDots = (qs: string[]) => qs.map(q => `<span style="color:${QUALITY_COLOR[q as keyof typeof QUALITY_COLOR]}">●</span>`).join('');
  const srcAnc = srcAncient(src);
  CX.$('dg-list').innerHTML = `<div class="dg-src"><b>${src.name}</b>${src.desc ? ` · ${src.desc}` : ''}${srcAnc ? `<br><small class="alt-ancl">✹ 可出太古：${srcAnc.note}</small>` : ''}<br><small>掉率档位：常见 / 少见 / 稀有 / 极稀有（每次击杀的大致机会）。品质圆点 = 这里能出的品质。点一件装备在祭坛上查看。</small>${src.dungeon ? `<br><small style="color:#7a1a08">${DUNGEON_GUIDE_NOTE}</small>` : ''}${src.raid ? `<br><small style="color:var(--ink-warm,#6a4a00)">${setGuideNote()}</small>` : ''}<br><small style="color:#5a3a18">${DURABILITY_GUIDE_NOTE}</small></div>
    <div class="dg-grid">${items.map((gi, n) => {
      const c = collected(CX.codex, gi.key);
      const has = Array.isArray(c) ? c.length > 0 : c;
      const { qk, color } = altTier(gi);
      const kind = gi.kind === 'legendary' ? '传说特效' : gi.kind === 'set' ? `套装「${gi.setName}」· ${SLOT_NAME[gi.slot]}` : gi.kind === 'fixed' ? (gi.setId ? '套装部件' : `特效件 · ${SLOT_NAME[gi.slot]}`) : SLOT_NAME[gi.slot];
      const ap = itemAncient(src, gi);
      return `<div class="dg-it${gi.key === altSel ? ' sel' : ''}" data-gi="${n}">${gi.since === GAME_VERSION ? '<span class="new">新</span>' : ''}<div class="slot q-${qk}${slotFx({ quality: qk, setId: gi.kind === 'set' || gi.setId ? 'x' : undefined })}">${itemIcon(gi.baseId, gi.slot)}${sparks({ quality: qk, setId: gi.kind === 'set' || gi.setId ? 'x' : undefined })}</div>
        <div><b style="color:${color}">${gi.name}</b><span class="dg-rate r${gi.rate}">${RATE_NAME[gi.rate]}</span>${ap ? `<span class="dg-anc" title="太古几率">✹${pctTxt(ap)}</span>` : ''}<small>${kind} · ${gi.kind === 'base' ? qDots(gi.qualities) : ''}${gi.desc ? ` ${gi.desc}` : ''}</small>
        <small class="${has ? 'got' : 'no'}">${has ? `已获得${Array.isArray(c) ? '：' + c.map(q => QUALITY_NAME[q]).join('、') : ''}` : '未获得'}</small></div>
        ${(['head', 'shoulder', 'chest', 'back', 'oneHand', 'twoHand', 'offHand', 'hands', 'legs', 'feet', 'waist', 'wrist'].includes(gi.slot)) && preview.ok ? `<button class="btn try" data-try="${n}">试穿</button>` : ''}</div>`;
    }).join('') || '<div class="hint">没有符合筛选的装备</div>'}</div>`;
  CX.$('dg-list').querySelectorAll('[data-try]').forEach(e => { (e as HTMLElement).onclick = ev => { ev.stopPropagation(); tryGuideItem(items[+(e as HTMLElement).dataset.try!]); }; });
  CX.$('dg-list').querySelectorAll<HTMLElement>('[data-gi]').forEach(e => { e.onclick = () => { altSel = items[+e.dataset.gi!].key; altAncView = false; renderDropGuide(); CX.audio.click(); }; });
  // v1.2.28 鼠标悬停：橙装显示传说特效，套装件显示套装效果（件数按身上穿的算），特效件显示特效
  CX.$('dg-list').querySelectorAll<HTMLElement>('[data-gi]').forEach(e => {
    e.addEventListener('mouseenter', ev => { const h = guideTipHtml(items[+e.dataset.gi!]); if (h) showTip(h, ev); });
    e.addEventListener('mouseleave', () => hideTip());
  });
  renderAltarCard(src, items);
}
/** v1.2.28 说明书悬停提示 */
export function guideTipHtml(gi: GuideItem): string {
  const t = altTier(gi), head = `<b style="color:${t.color}">${gi.name}</b> <small style="color:#aaa">${SLOT_NAME[gi.slot]}</small>`;
  if (gi.setId) { const st = setTipHtml({ setId: gi.setId } as ItemInstance); if (st) return `${head}<br>${st}`; }
  if (gi.kind === 'legendary') return gi.desc ? `${head}<br><span style="color:#ff9a2a">传说特效：</span>${gi.desc}` : '';
  if (gi.kind === 'fixed' && gi.desc) return `${head}<br><span style="color:#e0c070">特效：</span>${gi.desc}`;
  return '';
}
/** 中间祭坛（3D / 回退）+ 右侧物品卡 + 「这件在哪掉」 */
function renderAltarCard(src: GuideSource, items: GuideItem[]) {
  const mid = document.getElementById('alt-mid'), stage = document.getElementById('dg-stage'), card = document.getElementById('alt-card');
  if (!mid || !stage || !card) return;
  const gi = items.find(i => i.key === altSel) ?? null;
  // 环绕物品：最多 14 件（选中那件一定在内）
  const ord = items.filter(i => i.kind !== 'base').concat(items.filter(i => i.kind === 'base'));
  altOrbit = ord.slice(0, 14); if (gi && !altOrbit.includes(gi)) altOrbit[altOrbit.length - 1] = gi;
  const ap = gi ? itemAncient(src, gi) : 0;
  const sel = gi ? altOrbit.indexOf(gi) : -1;
  const tint = src.group === '长副本' && /frost/.test(src.id) ? 0x7ad8ff : src.group === '长副本' || src.group === '终局' ? 0xff5a1a : src.boss ? 0xc070ff : 0xffb040;
  const on = gi ? altarShow(stage, 'dropguide', { id: src.id, sel, boss: altBossName(src), tint, items: altOrbit.map(i => { const t = altTier(i); return { key: i.key, name: i.name, slot: i.slot, color: t.color, tier: t.tier, anc: i === gi && altAncView && ap > 0 }; }) },
    i => { const it = altOrbit[i]; if (it) { altSel = it.key; altAncView = false; renderDropGuide(); CX.audio.click(); } }) : (altarStop(), false);
  mid.classList.toggle('alt-3d', on); mid.classList.toggle('alt-2d', !on);
  if (!gi) { card.innerHTML = '<div class="hint">这里没有可显示的装备</div>'; return; }
  const t = altTier(gi), has = altHas(gi.key);
  const where = whereDrops(gi.key, LOOT_DATA, CX.cls.id), top = where.slice(0, 8);
  const wearable = ['head', 'shoulder', 'chest', 'back', 'oneHand', 'twoHand', 'offHand', 'hands', 'legs', 'feet', 'waist', 'wrist'].includes(gi.slot) && preview.ok;
  const kind = gi.kind === 'legendary' ? '传说特效（橙装）' : gi.kind === 'set' ? `套装「${gi.setName}」` : gi.kind === 'fixed' ? (gi.setId ? '套装部件' : t.tier === 5 ? '暗金' : '特效件') : `随机底材 · ${gi.qualities.map(q => QUALITY_NAME[q]).join(' / ')}`;
  card.innerHTML = `${altBack ? `<button class="btn alt-back" id="alt-back">← 返回副本地图</button>` : ''}
    <div class="alt-ch"><div class="slot q-${t.qk}${slotFx({ quality: t.qk, setId: t.tier === 3 ? 'x' : undefined, ancient: altAncView && ap > 0 })}">${itemIcon(gi.baseId, gi.slot)}</div><div><b id="alt-name" style="color:${altAncView && ap ? '#ff2a2a' : t.color}">${gi.name}${altAncView && ap ? '（太古）' : ''}</b><small>${kind} · ${SLOT_NAME[gi.slot]}</small><small class="${has ? 'got' : 'no'}">${has ? '✓ 已获得（图鉴）' : '○ 未获得'}</small></div></div>
    <div class="alt-rl">在「${src.name}」<span class="dg-rate r${gi.rate}">${RATE_NAME[gi.rate]}</span></div>
    <div class="alt-rate" title="每次击杀大致机会"><i style="width:${Math.max(3, Math.min(100, Math.round(Math.sqrt(gi.p / 0.35) * 100)))}%"></i><span>约 ${pctTxt(gi.p)} / 次</span></div>
    ${ap ? `<div class="alt-anc" id="alt-anc">✹ 太古 ${pctTxt(ap)}<small>${srcAncient(src)!.note}</small><button class="btn" id="alt-ancv">${altAncView ? '看普通外观' : '看太古外观'}</button></div>` : ''}
    ${gi.desc ? `<div class="alt-desc">${gi.desc}</div>` : ''}
    <div class="alt-bt">${wearable ? '<button class="btn" id="alt-try">试穿</button>' : ''}<button class="btn" id="alt-loc"${srcLocation(src) ? '' : ' title="深渊从任意传送阵进入"'}>在地图上定位</button></div>
    <div class="alt-wh-h">这件在哪掉 <small>${where.length} 处</small></div>
    <div class="alt-wh" id="alt-where">${top.map(w => { const a = itemAncient(w.src, w.gi); return `<div class="alt-wr${w.src.id === src.id ? ' on' : ''}"><a data-go="${w.src.id}">${w.src.name}</a><small>${pctTxt(w.gi.p)}${a ? ` · <i class="alt-ancb">✹${pctTxt(a)}</i>` : ''}</small><button class="btn" data-loc="${w.src.id}">定位</button></div>`; }).join('')}${where.length > top.length ? `<div class="hint">另有 ${where.length - top.length} 处（多为野外随机掉落）</div>` : ''}</div>`;
  const B = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  B('alt-back', () => { const b = altBack!; CX.togglePanel('dropguide', false); openRaidMap(b.raid, true); dmSelect(b.boss); });
  B('alt-try', () => tryGuideItem(gi));
  B('alt-loc', () => { altarLocate(src.id); });
  B('alt-ancv', () => { altAncView = !altAncView; renderDropGuide(); });
  card.querySelectorAll<HTMLElement>('[data-loc]').forEach(e => { e.onclick = () => { altarLocate(e.dataset.loc!); }; });
  card.querySelectorAll<HTMLElement>('[data-go]').forEach(e => { e.onclick = () => { const k = gi.key; dgSrc = e.dataset.go!; altSel = k; altBack = null; renderDropGuide(); }; });
}

export const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

/** 节点状态：on=已点 / can=可点 / lock=未解锁或互斥 */
export let talState!: (n: TalentNodeDef) => "on" | "on max" | "lock" | "can";

/** v0.7.7 天赋树 2.0：系色 */
const SPEC_COLOR: Record<string, string> = { w_arms: '#b03a30', w_fury: '#e07a20', w_prot: '#5a86b8', m_fire: '#e05a20', m_frost: '#50a8e0', m_arcane: '#a060e0',
  c_mark: '#d8b040', c_echo: '#40c0b0', c_rewind: '#9060d0', a_blast: '#e04a30', a_ground: '#60b040', a_turret: '#4080d0' };
/** v1.0.1：天赋面板当前看的是扩展天赋层（内容包）还是本体天赋页 */
let ptView = false;
export function renderTalents() {
  if (CX.$('talent').style.display !== 'flex') return;
  if (ptView && ptal()) return renderPackTalents();
  const total = CX.tree.def.v3 ? CX.tree.totalPoints : CX.progression.talentPoints;
  CX.$('tal-title').textContent = `${CX.cls.name}天赋`;
  CX.$('tal-pts').textContent = CX.progression.level < TALENT_START_LEVEL ? `等级 ${CX.progression.level} · ${TALENT_START_LEVEL} 级开放天赋` : `等级 ${CX.progression.level}/${CX.progression.maxLevel} · 剩余 ${CX.tree.available} 点`;
  const main = CX.tree.mainSpec;
  const capNeed = main ? Math.max(0, CX.tree.tierNeed(CX.tree.def.tiers) + 1 - CX.tree.spentIn(main.id)) : 0;
  const pages = [0, 1, 2].map(i => `<button class="btn tpage${CX.talentPage === i ? ' on' : ''}" data-tpage="${i}">天赋页 ${i + 1}</button>`).join('') + ptTabBtn();
  CX.$('tal-sum').innerHTML = `<div class="tpages">${pages}<small class="thelp">　战斗外随时切换，各页独立加点</small></div>已用 <b>${CX.tree.spent}</b>/${total} 点（满级共 ${CX.tree.def.v3 ? TALENT_TOTAL : MAX_LEVEL - TALENT_START_LEVEL + 1} 点${ptal() && ptal()!.points ? `；另有 ${ptal()!.available}/${ptal()!.points} 个扩展天赋点，在「${ptal()!.def.name}」页签使用` : ''}）　` +
    CX.tree.def.specs.map(sp => `<span class="${main === sp ? 'tmain' : ''}">${sp.name} ${CX.tree.spentIn(sp.id)}</span>`).join(' / ') +
    (CX.tree.def.v3 ? (() => { const c = CX.tree.v3Combo(); return `　组合 <b>${c.combo}</b> · 关键节点 <b>${c.keys}</b>/6<span class="thelp">　区域一 / 二：普通节点投 4 点开关键（2 选 1）· 区域三只对主系开放，投 9 点开绝技 · 组合 3+1+1 / 3+2 / 2+2+2</span>`; })() :
    `${main ? `　主专精：<b>${main.name}</b>${capNeed ? `（距终极还差 ${capNeed} 点）` : '（可点终极）'}` : ''}<span class="thelp">　每层需要在本树投入 ${CX.tree.def.tierCost} 点 · 悬停/点击查看</span>`);
  const root = CX.$('tal-tree'); root.innerHTML = '';
  for (const sp of CX.tree.def.specs) {
    const col = document.createElement('div');
    const spent = CX.tree.spentIn(sp.id);
    col.className = `tspec${main === sp ? ' main' : ''}`; col.style.setProperty('--sc', SPEC_COLOR[sp.id] ?? '#c8a060');
    col.innerHTML = `<div class="tsh"><div class="tsigbox">${sigilSvg(sp.id, 'tsig tsig-h')}</div><div class="slot q-white tsi">${talentIcon(sp.icon, true)}</div><div><b>${sp.name}</b><small>已投 <span class="tsp">${spent}</span> 点</small></div></div><div class="tsd">${sp.focus ? `<b class="tfocus">主打：${sp.focus}</b>` : sp.desc}</div>`;
    const grid = document.createElement('div'); grid.className = 'tgrid';
    for (let r = 1; r <= CX.tree.def.tiers; r++) {
      const need = CX.tree.tierNeed(r), open = CX.tree.tierUnlocked(sp.id, r), v3 = CX.tree.def.v3;
      const lk = document.createElement('div');
      lk.className = `ttier ${open ? 'open' : 'shut'}${v3 && r % 2 === 1 && r > 1 ? ' tzone' : ''}`;
      lk.title = v3 ? `区域${['一', '二', '三'][(r - 1) >> 1]}${r % 2 ? '普通' : r === 6 ? '绝技' : '关键（2 选 1）'}${open ? '' : '：' + CX.tree.v3Need(sp, r)}` : need ? `第 ${r} 层：需要在「${sp.name}」投入 ${need} 点` : '第 1 层';
      lk.innerHTML = v3 ? (open ? (r % 2 ? ['', 'Ⅰ', '', 'Ⅱ', '', 'Ⅲ'][r] || '·' : r === 6 ? '绝' : '★') : `<i class="lockic"></i>`) : open ? ROMAN[r] : `<i class="lockic"></i><small>${need}</small>`;
      lk.style.gridRow = String(r); lk.style.gridColumn = '1';
      grid.appendChild(lk);
    }
    const art = talentArtMap(CX.cls.tree);
    for (const n of sp.nodes) {
      const rk = CX.tree.rank(n.id);
      const d = document.createElement('div');
      d.className = `tnode ${talState(n)}${n.capstone ? ' cap' : ''}${CX.talSel === n ? ' sel' : ''} ${n.capstone ? 'tk-cap' : n.resNode ? 'tk-res' : n.kind === 'choice' ? 'tk-choice' : 'tk-rank'}`;
      d.dataset.tid = n.id;
      d.style.gridRow = String(n.row); d.style.gridColumn = String(n.col + 2);
      if (n.kind === 'choice' || n.group || n.capstone) d.classList.add('tkey');   // v1.2.67 关键 / 绝技节点：符文流光
      d.innerHTML = `<div class="slot ${n.capstone ? 'q-orange' : n.kind === 'choice' || n.group ? 'q-purple' : 'q-white'} ${rk ? 'lit' : ''}">${sigilSvg(sp.id, 'tsig tsig-w')}${FRAME_SVG}<i class="tspark"></i>${talentIcon(art.get(n.id)?.icon ?? n.icon ?? n.id, rk > 0 || !CX.tree.whyCannotAdd(n.id))}${badgeSvg(art.get(n.id)?.badge ?? 'misc', SPEC_COLOR[sp.id] ?? '#ffd100')}<b class="rkb">${rk}/${n.maxRank}</b></div><div class="tnm">${n.name}</div>`;
      d.onclick = () => { CX.talSel = n; hideTip(); renderTalents(); };
      d.oncontextmenu = ev => { ev.preventDefault(); if (CX.tree.remove(n.id)) CX.save(); };
      d.addEventListener('mouseenter', ev => showTip(talentTip(n), ev as MouseEvent));
      d.addEventListener('mouseleave', hideTip);
      grid.appendChild(d);
    }
    col.appendChild(grid);
    root.appendChild(col);
  }
  renderTalentTip();
}

/** v1.0.1：扩展天赋层页签按钮（本职业没有扩展天赋层 = 不显示） */
function ptTabBtn() {
  const st = ptal(); if (!st) return '';
  return `<button class="btn tpage ptab${ptView ? ' on' : ''}" data-ptab="1" title="${ptalPackName()}资料片专属天赋">${st.def.name}${st.available ? ` <b class="ptdot">${st.available}</b>` : ''}</button>`;
}
/** v1.0.1：扩展天赋层：5 层，每层 1 个（1 点），第 k 层 = 第 k 个扩展天赋点；最后一层终极天赋给新技能 */
function renderPackTalents() {
  const st = ptal()!;
  CX.$('tal-title').textContent = `${CX.cls.name}天赋`;
  CX.$('tal-pts').textContent = `等级 ${CX.progression.level}/${CX.progression.maxLevel} · 扩展天赋点 ${st.available}/${st.points}`;
  const pages = [0, 1, 2].map(i => `<button class="btn tpage" data-tpage="${i}">天赋页 ${i + 1}</button>`).join('') + ptTabBtn();
  CX.$('tal-sum').innerHTML = `<div class="tpages">${pages}</div><b style="color:var(--ink-blue,#2a6a8a)">${st.def.name}</b>　已用 <b>${st.spent}</b>/${st.points} 点（${PACK_TALENT_LEVELS.join(' / ')} 级各得 1 点，共 ${PACK_TALENT_LEVELS.length} 点）<span class="thelp">　每层只能选 1 个；点击选择 / 换选，右键退选（从最下层开始退）。不随天赋页切换</span>${st.def.desc ? `<br><small>${st.def.desc}</small>` : ''}`;
  const root = CX.$('tal-tree'); root.innerHTML = '';
  const box = document.createElement('div'); box.className = 'ptree';
  st.def.layers.forEach((layer, k) => {
    const open = st.layerOpen(k), last = k === st.def.layers.length - 1;
    const row = document.createElement('div'); row.className = `ptrow${open ? '' : ' shut'}${last ? ' ult' : ''}`;
    row.innerHTML = `<div class="ptlv"><b>${['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'][k] ?? k + 1}</b><small>${PACK_TALENT_LEVELS[k] ?? '?'} 级${last ? '<br>终极' : ''}</small></div>`;
    for (const n of layer) {
      const on = st.picked(n.id), why = on ? null : st.whyCannotPick(n.id);
      const d = document.createElement('div');
      d.className = `ptnode${on ? ' on' : why ? ' lock' : ' can'}${last ? ' cap' : ''}`; d.dataset.ptid = n.id;
      d.innerHTML = `<div class="slot ${last ? 'q-orange' : layer.length > 1 ? 'q-purple' : 'q-white'} ${on ? 'lit' : ''}">${talentIcon(n.icon ?? n.id, on || !why)}</div><div class="ptxt"><b>${n.name}</b><small>${n.desc}</small>${!on && why && why !== '没有扩展天赋点' ? `<em>${why}</em>` : ''}</div>`;
      d.onclick = () => ptPick(n.id);
      d.oncontextmenu = ev => { ev.preventDefault(); ptUnpick(k); };
      row.appendChild(d);
    }
    box.appendChild(row);
  });
  root.appendChild(box);
  CX.$('tal-tip').innerHTML = `<div class="tip tip0">金色 = 已选，绿色 = 可选，灰色 = 未解锁。终极天赋学会的新技能会自动装进「绝技」槽（按 4），在技能书（K）里可以和原来的绝技互换。</div>`;
}
function ptAfterChange() {
  const st = ptal()!, r = ptalSyncSkills(CX.skillBook);
  for (const id of r.learned) {
    const sk = CX.skillBook.data.skills[id], slot = CX.skillBook.slotOf(id);
    if (slot && !CX.skillBook.setSkill(slot, id)) CX.toast(`学会「${sk?.name ?? id}」，已装进「绝技」槽（按 4）；技能书（K）里可换回原来的绝技`, '#ff9a40');
  }
  if (r.unequipped.length) CX.toast('终极天赋已退选：绝技槽换回默认技能', '#ccc');
  void st; CX.equipFromBook(); CX.syncCharacter(); CX.save(); renderTalents();
}
function ptPick(id: string) {
  const st = ptal(); if (!st) return;
  const why = st.picked(id) ? null : st.whyCannotPick(id);
  if (st.picked(id)) return;
  if (why) { CX.toast(why, '#f66'); CX.audio.error?.(); return; }
  st.pick(id); CX.audio.equip(); ptAfterChange();
}
function ptUnpick(k: number) {
  const st = ptal(); if (!st) return;
  const why = st.whyCannotUnpick(k);
  if (why) { if (why !== '这一层没选') CX.toast(why, '#f66'); return; }
  st.unpick(k); ptAfterChange();
}

/** 天赋说明（悬停提示和下方详情共用）：当前/下一级效果、层要求、互斥、终极 */
/** v0.7.4：点名技能的天赋改为按槽位生效，提示框说明 */
const SLOT_NAME_T: Record<string, string> = { skill1: '技能 1', skill2: '技能 2', skill3: '技能 3', ultimate: '大招' };
function slotNote(n: TalentNodeDef) {
  const ids = n.modifier?.match.skillIds; if (!ids?.length) return '';
  const sl = [...new Set(ids.map(id => CX.skillBook?.slotOf(id)).filter((x): x is NonNullable<typeof x> => !!x))];
  return sl.length ? `<span class="tl-sub">按槽位生效：${sl.map(x => `「${SLOT_NAME_T[x] ?? x}」槽`).join('')}当前装备的技能（技能书换技能后照样生效）</span><br>` : '';
}
export function talentTip(n: TalentNodeDef) {
  const r = CX.tree.rank(n.id), sp = CX.tree.specOf(n.id)!;
  const why = r < n.maxRank ? CX.tree.whyCannotAdd(n.id) : null;
  const peers = CX.tree.nodes.filter(o => o !== n && ((n.group && o.group === n.group) || (n.kind === 'choice' && o.kind === 'choice' && o.row === n.row && CX.tree.specOf(o.id) === sp)));
  return `<b class="tt-name" style="color:${n.capstone ? '#ff9a40' : '#ffd100'}">${n.name}</b><span class="tt-sub">${sp.name} · 第 ${n.row} 层 · ${BADGE_NAME[badgeOf(n)]}${n.capstone ? ' · 终极天赋' : n.kind === 'choice' || n.group ? ' · 选择天赋' : ''} · 等级 ${r}/${n.maxRank}</span>
    ${r ? `<span class="ln">当前：${CX.tree.describe(n, r)}</span><br>` : ''}${r < n.maxRank ? `${r ? '下一级' : '效果'}：${CX.tree.describe(n, r + 1)}<br>` : ''}
    ${n.row > 1 && !CX.tree.def.v3 ? `<span class="${CX.tree.tierUnlocked(sp.id, n.row) ? 'tl-sub' : 'cmp-dn'}">需要在「${sp.name}」投入 ${CX.tree.tierNeed(n.row)} 点（已投 ${CX.tree.spentIn(sp.id)}）</span><br>` : ''}${n.row > 1 && CX.tree.def.v3 && !CX.tree.tierUnlocked(sp.id, n.row) ? `<span class="cmp-dn">${CX.tree.v3Need(sp, n.row)}</span><br>` : ''}
    ${n.requires ? `前置：点满「${CX.tree.node(n.requires)!.name}」<br>` : ''}
    ${slotNote(n)}
    ${peers.length ? `<span class="tl-sub">与 ${peers.map(o => `「${o.name}」`).join('')} 互斥</span><br>` : ''}
    ${why && why !== '没有天赋点' && !why.startsWith('需要在') ? `<span class="cmp-dn">${why}</span>` : ''}`;
}

export function renderTalentTip() {
  const tip = CX.$('tal-tip');
  if (!CX.talSel && CX.tree.def.v3) { tip.innerHTML = `<div class="tip tip0">点击天赋查看并加点（右键退点）。每系三个区域：Ⅰ / Ⅱ 普通节点投 4 点 → ★ 关键节点 2 选 1；Ⅲ 只对主系开放，投 9 点 → 绝技。共 30 点，组合 3+1+1 / 3+2 / 2+2+2。洗点免费。</div>`; return; }
  if (!CX.talSel) { tip.innerHTML = `<div class="tip tip0">点击天赋查看并加点（右键退点）。金色 = 已点，绿色 = 可点，灰色 = 未解锁；<i class="lockic"></i>数字 = 本树需要投入的点数。每棵树最底层的橙框是终极天赋，会把一个技能变成新形态。</div>`; return; }
  const n = CX.talSel, r = CX.tree.rank(n.id);
  const why = r < n.maxRank ? CX.tree.whyCannotAdd(n.id) : '已点满';
  const whyR = CX.tree.whyCannotRemove(n.id);
  tip.innerHTML = `<div class="tip tsel"><div class="ttxt">${talentTip(n)}${why && r < n.maxRank ? `<span class="cmp-dn">无法加点：${why}</span>` : ''}${r && whyR && whyR !== '没有投入' ? `<br><span class="tl-sub">不能退点：${whyR}</span>` : ''}</div>
    <div class="tbtn"><button class="btn" id="t-add" ${why ? 'disabled' : ''}>加点</button><button class="btn" id="t-rm" ${whyR ? 'disabled' : ''}>退点</button></div></div>`;
  CX.$('t-add').onclick = () => { if (CX.tree.add(n.id)) { CX.audio.equip(); if (n.capstone) CX.toast(`终极天赋「${n.name}」：${CX.tree.describe(n, 1).replace(/^终极：/, '')}`, '#ff9a40'); } CX.save(); };
  CX.$('t-rm').onclick = () => { CX.tree.remove(n.id); CX.save(); };
}

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindPanels(__ctx: Ctx) {
  CX = __ctx;
  bindAltar3d(__ctx);   // v0.9.6d 战利品祭坛 3D
  STAT_LABEL = (k: BonusStat | 'hp' | 'armor') => k === 'hp' ? '生命' : k === 'armor' ? '护甲' : k === 'power' ? CX.cls.powerName : ({ crit: '暴击率', critDmg: '暴击伤害', haste: '急速', speed: '移速' } as Record<string, string>)[k];
  preview = new Preview(CX.$('pd-cv') as HTMLCanvasElement);
  CX.$('bag-guide').onclick = () => openDropGuide();
  CX.$('bag-salv').onclick = () => { bagSalv = !bagSalv; renderBag(); };
  // v0.6.7：背包 / 角色面板 / 商店打开时按 Alt 切换装备说明 简洁 ↔ 详细
  window.addEventListener('keydown', ev => {
    if (ev.key !== 'Alt' || ev.repeat) return;
    if (!['bag', 'char', 'shop'].some(id => { const el = document.getElementById(id); return el && el.style.display && el.style.display !== 'none'; })) return;
    ev.preventDefault(); toggleTipDetail(); hideTip(); renderBag(); if (CX.$('char').style.display === 'flex') renderChar(); CX.renderShop?.();
  });
  CX.$('char-guide').onclick = () => openDropGuide();
  CX.$('ver').onclick = () => { if (CX.started) CX.showChangelog(true); };
  talState = (n: TalentNodeDef) => CX.tree.rank(n.id) ? (CX.tree.rank(n.id) >= n.maxRank ? 'on max' : 'on') : CX.tree.whyCannotAdd(n.id) ? 'lock' : 'can';
  /** 洗点：免费，全部点数返还（误点时有确认） */
  CX.$('tal-sum').addEventListener('click', ev => {
    const pt = (ev.target as HTMLElement).closest('[data-ptab]'); if (pt) { ptView = true; CX.talSel = null; renderTalents(); return; }   // v1.0.1 扩展天赋层
    const b = (ev.target as HTMLElement).closest('[data-tpage]') as HTMLElement | null; if (!b) return;
    if (ptView && +b.dataset.tpage! === CX.talentPage) { ptView = false; renderTalents(); return; }
    ptView = false; if (CX.switchTalentPage(+b.dataset.tpage!)) CX.talSel = null; renderTalents(); });
  CX.$('tal-reset').onclick = () => {
    if (!CX.tree.spent) { CX.toast('还没有投入天赋点'); return; }
    const b = CX.$('tal-reset') as HTMLButtonElement;
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '确认重置？'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = '重置天赋'; }, 2500); return; }
    b.dataset.confirm = ''; b.textContent = '重置天赋';
    const n = CX.tree.spent; CX.tree.reset(); CX.talSel = null; CX.save(); CX.toast(`天赋已重置，返还 ${n} 点`);
  };
}
