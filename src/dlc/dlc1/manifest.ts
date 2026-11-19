// ======================================================================
// DLC1「沉钟之海」内容包清单（d1.0 框架阶段：空骨架）
// 本目录（src/dlc/dlc1/）只在 node build-web.mjs --dlc=dlc1 时打进产物，本体构建物理上不含这里的代码。
// 约定：DLC 的全部内容只放在 src/dlc/dlc1/，通过本清单挂到本体（core/ContentPacks.ts），本体代码里不写任何 DLC 文字。
// 这个文件不能 import 本体的 data/ 或 web/ 模块（会让数据表在包注册前求值）；只用 core 的类型。
// ======================================================================
import { eliteHd, ELITE_HD } from './elite_hd';   // v1.2.73 精英绑骨显示件（测试钩子）
import type { PackManifest } from '../../core/ContentPacks';
import { DLC1_TALENTS, DLC1_SKILLS } from './talents';   // v1.0.1 扩展天赋层 + 终极天赋新技能
import { COAST_WILD, COAST_WAYPOINT, COAST_ID, COAST_O, bindCoast, coastCtx } from './coast';   // v1.0.2 沉钟海岸（v1.0.3 正式版）
import { tideUpdate, tideDebug, setTidePhase } from './tide';
import { coastSceneUpdate, coastSceneDebug, coastStormApi } from './coast_scene';
import { seaSkyApi } from './coast_seasky';   // 11-15 海天调试：__dlc1.seasky.setHour(h)
import { GATE_QUESTS, GATE_NPCS, GATE_PROPS, GATE_INTERACT, bindGate, gateUpdate, gateEvent, gateSave, gateLoad, gateApi, gateOpen, gateDone } from './coast_gate';   // v1.2.71 入口剧情「潮音钟门」   // v1.2.71 沉钟海岸地图升级
import { CH7_QUESTS } from './chapter7';
import { DLC1_MODELS } from './models';
import { look40Dress } from './look40';   // 11-12 I17 40 级套装外观
import { plazaDebug } from './plaza_dress';
import { bindNpcC, NPC_C, npcC, patchScholar, setNpcPlayerPos } from './npc_c';   // v1.2.73 C 组 NPC 写实件
bindNpcC();
import { DLC1_AUDIO } from './voice';   // v1.2.48 配音 + 曲目
import { seabedBurst } from './seabed';   // v1.2.48 倒钟广场补完
import { lakeStats } from './mirrorlake';
import { skyStats } from './mirrorsky';
import { MIRROR_WILD, MIRROR_WAYPOINT, bindMirror, mirrorCtx, mirrorUpdate, mirrorDebug } from './mirror';   // v1.0.5 镜渊城
import { CH8_QUESTS } from './chapter8';   // v1.0.4 新怪物模型
import { HUNTER_CLASS } from './hunter';   // v1.0.6 第 5 职业 灵契猎手
import { HUNTER_ID } from './hunter_skills';
import { HUNTER_TIER, HUNTER_ULT_SKILLS, HUNTER_SPIRITS, HUNTER_QUESTS, HUNTER_BASES } from './hunter_data';
import { hunterApi, setForm, HUNTER_RUNTIME } from './hunter_runtime';
import { COFFIN_CLASS } from './coffin';   // v1.0.7 第 6 职业 负棺人
import './classtune_dlc1';   // v1.2.77 天赋方案 B：资料片两职业平衡系数
import { COFFIN_ID } from './coffin_skills';
import { COFFIN_TIER, COFFIN_ULT_SKILLS, COFFIN_SPIRITS, COFFIN_QUESTS, COFFIN_BASES } from './coffin_data';
import { coffinApi, setMode, openCoffin, harvest, debugSouls, addErode, erodeN, COFFIN_RUNTIME } from './coffin_runtime';
import { tombVisualDebug } from './coffin_model';
import { BT_WILD, BT_WAYPOINT, bindBelltower, btUpdate, btOnTalk, btDebug, BT_O, BT_ARENAS, BT_SOULS } from './belltower';   // v1.1.0 无声钟楼 + 第九章 + 命运的岔路
import { CH9_QUESTS } from './chapter9';
import { BT_MODELS } from './models_bt';
import { DLC1_CLASS_LEGENDARIES } from './class_legendaries';   // v1.2.1 新职业橙装（1–30 级可掉）
import { DLC1_FATE, bindFate, btSave, btLoad, btState, openFateUI, closeFateUI, fateConfirmNow, fateUiOpen, fateHoldK, showEnding, closeEnding, endingOpen, endingLines, chooseFate, fateBanner } from './fate';
import { bindDomain, domainSave, domainLoad, domainUpdate, domainMods, domainDebug, ensureUnlocked, startBuild, rush, service, ringRule, moveIn, offered } from './domain';   // v1.1.1 钟楼领地（结局 A）
import { domainWorldUpdate, domainWorldDebug } from './domain_world';
import { bindDomainUi, openDomainUI, closeDomainUI, domainUiOpen, domainUiUpdate } from './domain_ui';
import { CHIME_KEY, bindChime, chimeEvent, chimeUpdate, chimeUse, chimeAdd, chimeCharge, chimeStats, chimeLast } from './bellchime';
import { btMods, silenceActive, endSilence, btSetRng, sfxLog } from './belltower';
import { MIRROR_ID } from './mirror';
import { MIRROR_SELECT } from './select_stage';   // v1.2.49 角色选择背景
import { ensureUnlocked as abyssUnlock, absorbEchoes, bindAbyss, abyssSave, abyssLoad, abyssUpdate, abyssEvent, abyssMods, abyssDebug, upgrade as abyssUpgrade, PARTS as ABYSS_PARTS } from './abyssbody';   // v1.1.2 渊噬之躯（结局 B）
import { abyssDress, abyssDressInfo, abyssModelUpdate, abyssDressProbe } from './abyssbody_model';
import { bindAbyssUi, openAbyssUI, closeAbyssUI, abyssUiOpen, abyssUiUpdate, abyssBarState } from './abyssbody_ui';
import { DEVOUR_KEY, devourUse, devourUpdate, devourCharge, devourLast, devourResetCd } from './devour';
import { WB_MODELS } from './models_wb';   // v1.2.6 d1.10a 世界首领
import { WB_ITEMS, wbSfxLog } from './worldboss';
import { LEGENDARIES_40 } from './legendaries40';
import './body40';   // 11-04 法师 40 级长袍外观（穿潮汐长袍换身体）
import { DLC1_ACHIEVEMENTS, dlc1AchStats } from './achievements';   // v1.2.9 d1.11a
import { LEGENDARIES_40B, DLC1_SETS_ALL, GEAR40_ITEMS, D40_BASES } from './gear40';
import { S40_SETS, S40_ITEMS, bindSets40, sets40Caps, s40Load, s40Save, s40Debug } from './sets40';   // 11-05 40 级职业套装（2/4/6 件 + 终极天赋分支）   // v1.2.8 d1.10b-2   // v1.2.7 d1.10b-1 40 级橙装
import { ECHO_SLOT, ECHO_DEFS, ECHO_DROP_TABLE, bindEcho, echoLoad, echoSave, echoUpdate, echoEvent, echoGive, echoGiveAll, echoUse, echoLast, echoState, echoResetCd, ECHO_K, echoCd, rollEchoDrop } from './echomark';   // v1.2.15 回响钟纹（第 8 技能格）
import { bindSmithy, openSmithy, closeSmithy, smithyRun, smithyPickOffline, smithyDetectType, smithyDetectLabel, smithyBuildPrompt, smithyLib, smithyPickSet, smithyForge, forgeShowState, smithyPing, SMITHY, smithyPending, smithyItems, smithyWear, smithyDelete, smithyLastToast, smithyProgressLog, claimCfg, refreshMine, smithyClaim, smithyCheckVersion, devId, smithyForging, smithyImportGlb, smithyMode, smithyKeyPing, smithyImportLog, smithyLocalKey, smithyLocalCheck } from './smithy';
import { forgeCgState } from './forgecg';
import { forgeHdHas, forgeHdSize, forgeHdEnsure, hdJobs, hdViewerState, closeHdViewer, HD_SUFFIX } from './forge_hd';   // v1.2.54 铸造品高精度版（测试钩子）   // v1.2.40 铸造台（一句话铸武器外观）
import { FORGE_WILD, FORGE_DUNGEON, bindForge, forgeUseNewLoot, forgeLoad, forgeSave, forgeDebug, forgeSetRng } from './forge';   // v1.2.16 40 级副本「钟铜熔炉」
import { bindWorldBoss, wbUpdate, wbSave, wbLoad, wbDebug, coastBadge, mirrorBadge, wbArena } from './worldboss';
Object.assign(COAST_WILD, { mapBadge: coastBadge }); Object.assign(COAST_WAYPOINT, { badge: coastBadge, hidden: () => !gateOpen() });   // v1.2.71 首次从古井下行（或老存档）后才列出   // v1.2.6 地图 / 沙盘 / 传送阵醒目标记
Object.assign(MIRROR_WILD, { mapBadge: mirrorBadge }); Object.assign(MIRROR_WAYPOINT, { badge: mirrorBadge });
export { DLC1_FATE };   // d1.8 钟楼领地（A）/ d1.9 渊噬之躯（B）读这里

/** 包 id（存档 dlc.dlc1、物品 pack 标记、堆叠物品前缀 @dlc1: 都用它） */
export const DLC1_ID = 'dlc1';

import { DLC1_INTRO, GUIDE30 } from './intro';
import type { PackCtx } from '../../core/ContentPacks';
import { bindJudge, judgeDemo, judgeUpdate, judgeMods, judgeState, judgeShow, judgeHide, judgeAct, judgeWhaleArena, judgeMinimize } from './judge';   // v1.2.53 评委通道
import { WELL_WILD, WELL_DUNGEON, bindWell, wellUpdate, wellLoad, wellSave, wellDebug, wellSetTide, wellSetRng, wellMountGate, WELL_MODELS, SARIN_LAMPS, wellRigInfo, wellWarnDodge, wellMeasureH, wellBuildTest, wellTwins, wellIolaTalk, CH10_QUESTS, setWellTablesHook } from './raid_well';   // fix1108 #3 挪到顶部：tsc/CommonJS 下第 106 行用 CH10_QUESTS 时必须已 require
import { bindCampLand, campLandUpdate, campLandStats } from './camp_land';   // fix1109 #4 传回营地落点挪到营地内空地
// camp_base（11-18 本体六个野外营地换 DLC 营地模型）改由 boot.ts 在 installPack 之后动态 import：它静态 import data/zones_wild，而 zones_wild 顶层 for 循环读 withPacks('wilds')，放在这里会早于注册 → DLC 版卡载入 0%（Rhett 11-18 修）
import { wellProcSkin, wellWholePose } from './raid_well_rig';
import { campDressUpdate } from './plaza_dress';
import { dynWorldUpdate, dynWrapBuild, dynSetMaps, dynDebug } from './dyn_world';   // 11-14 DLC 地图动态（风 / 吊挂 / 角色推开，全 GPU）
import { JUDGE_HP_K, bossScaleUpdate, bossScaleState, bossDmgK, bossArmorK, bossHitAfter } from './boss_scale';   // fix1108 #7 DLC 首领伤害按等级 / 装等缩放   // fix1107 其他营地火舌动画
let packCtx: PackCtx | null = null;
let hinted = false;
function ch7Hint() {
  const c = coastCtx(); if (!c || hinted || c.level() < 30) return;
  // v1.2.71 入口剧情：7-0 可接 → 去灰石营地找墨言 / 古井；钟已铸未下行 → 敲钟；已下行 / 老存档 → 找伊奥拉
  const q0 = c.questState('cs7_0'), q1 = c.questState('cs7_1'), open = gateOpen();
  if (q0 !== 'available' && !(q1 === 'available' && (open || gateDone()))) return;
  hinted = true;
  if (!dlc1Data.guide30) { dlc1Data.guide30 = 1; packCtx?.banner?.({ ...GUIDE30, theme: 'gold', ms: 4200 }); }   // v1.2.3：每个角色第一次弹横幅
  c.toast('墨言的笔记末页多了一行不是他写的字：「钟停了。谁来敲下一下？」', '#7fe8f0');
  c.toast(q0 === 'available' ? '去灰石营地找墨言 / 古井（7-0「余音」）' : open ? '在任意营地传送阵选「沉钟海岸」，去潮痕营地找伊奥拉' : '去灰石营地古井，敲响潮音钟', '#7fe8f0');
}

/** 包自己的存档数据（存档 dlc.dlc1）。框架阶段只有版本号，原样读写 */
let dlc1Data: { v: number; [k: string]: unknown } = { v: 1 };

export const DLC1: PackManifest = {
  id: DLC1_ID,
  name: '沉钟之海',
  levelCapDelta: 10,   // 30 → 40（Rhett 2026-10-22 定：仅 DLC）
  selectStage: MIRROR_SELECT,
  demo: judgeDemo(() => { dlc1Data.demo = 1; dlc1Data.guide30 = 1; hinted = true; gateApi.markDescended(); }),   // v1.2.53 评委快速体验   // v1.2.49 角色选择：倒钟广场低角全景
  // 测试用占位挂载（唯一一条）：剧情钩子，本体还没有调用点，不影响游戏
  storyHooks: [
    { id: 'dlc1_placeholder', at: 'ending', run: () => { /* d1.0 占位：通关结局后的第七章引子以后挂这里 */ } },
    // v1.0.3 第七章引子：30 级、7-1 还没接 → 进游戏 / 升到 30 级时提示一次（每次进游戏最多一次）
    { id: 'dlc1_ch7_hint', at: 'enterGame', run: () => ch7Hint() },
    { id: 'dlc1_judge_hud', at: 'enterGame', run: () => { if (judgeState.on) judgeShow(); } },   // v1.2.53 评委角色再进游戏：引导面板回来
    { id: 'dlc1_ch7_hint_lv', at: 'levelUp', run: () => ch7Hint() },
    { id: 'dlc1_bt_talk', at: 'talk', run: npc => btOnTalk(npc) },
    { id: 'dlc1_well_iola', at: 'talk', run: npc => wellIolaTalk(npc) },   // 11-07 钟井伊奥拉隐藏任务：自选 40 级套装 1 件   // v1.1.0 在伊奥拉 / 卡戎处重新打开抉择
  ],
  quests: [...GATE_QUESTS, ...CH7_QUESTS, ...CH8_QUESTS, ...CH9_QUESTS, ...CH10_QUESTS],
  zoneNpcs: GATE_NPCS, zoneProps: GATE_PROPS, interacts: [GATE_INTERACT],   // v1.2.71 灰石营地：墨言 + 潮音钟门
  models: { ...DLC1_MODELS, ...BT_MODELS, ...WB_MODELS },
  update: dt => { campLandUpdate(); bossScaleUpdate(judgeState.on); judgeUpdate(dt); wbUpdate(dt); tideUpdate(dt, coastCtx(), COAST_ID, COAST_O); coastSceneUpdate(dt, coastCtx()); gateUpdate(dt); mirrorUpdate(dt, mirrorCtx()); campDressUpdate(dt, mirrorCtx()?.map() === MIRROR_ID); btUpdate(dt); domainUpdate(dt); domainWorldUpdate(dt, mirrorCtx()?.map() === MIRROR_ID); domainUiUpdate(dt); abyssUpdate(dt); devourUpdate(dt); chimeUpdate(dt); abyssModelUpdate(dt); abyssUiUpdate(dt); echoUpdate(dt); },
  wilds: [COAST_WILD, MIRROR_WILD, BT_WILD, FORGE_WILD],
  dungeons: [FORGE_DUNGEON],   // v1.2.16 40 级副本（本体四档难度 + 40 级同步）
  waypoints: [COAST_WAYPOINT, MIRROR_WAYPOINT, BT_WAYPOINT],
  bind: ctx => { packCtx = ctx; bindCampLand(ctx, [COAST_WILD, MIRROR_WILD, BT_WILD, FORGE_WILD, WELL_WILD] as never); setNpcPlayerPos(() => ctx.playerPos()); patchScholar(); bindSets40(ctx); bindJudge(ctx); bindForge(ctx); bindSmithy(ctx); bindWorldBoss(ctx); bindCoast(ctx); bindGate(ctx); bindMirror(ctx); bindBelltower(ctx); bindFate(ctx); bindDomain(ctx); bindDomainUi(ctx); bindChime(ctx); bindEcho(ctx); bindAbyss(ctx); bindAbyssUi(ctx); (globalThis as unknown as { __dlc1?: unknown }).__dlc1 = { elite: { make: eliteHd, ids: Object.keys(ELITE_HD) }, npcC: { make: npcC, ids: Object.keys(NPC_C) }, tideDebug, setTidePhase, coast71: coastSceneDebug, coastStorm: coastStormApi, seasky: seaSkyApi, gate: gateApi, sfx: { bt: sfxLog, wb: wbSfxLog }, mirrorDebug, plaza: plazaDebug, seaBurst: seabedBurst, sea5: () => ({ lake: lakeStats, sky: skyStats }), sets40: { caps: sets40Caps, pity: s40Debug }, hunter: { setForm, debug: () => HUNTER_RUNTIME.debug?.(), api: hunterApi }, coffin: { setMode, openCoffin, harvest, debugSouls, addErode, erodeN, tombVis: tombVisualDebug, debug: () => COFFIN_RUNTIME.debug?.(), api: coffinApi },
    bt: { debug: btDebug, O: BT_O, arenas: BT_ARENAS, souls: BT_SOULS, state: btState, fate: DLC1_FATE, openFateUI, closeFateUI, fateConfirmNow, fateUiOpen, fateHoldK, fateBanner, chooseFate, showEnding, closeEnding, endingOpen, endingLines, silenceActive, endSilence },
    domain: { ...domainDebug, world: domainWorldDebug, ensureUnlocked, startBuild, rush, service, ringRule, moveIn, offeredDefs: offered, open: openDomainUI, close: closeDomainUI, isOpen: domainUiOpen },
    chime: { use: chimeUse, add: chimeAdd, charge: chimeCharge, stats: chimeStats, last: chimeLast },
    abyss: { ...abyssDebug, parts: ABYSS_PARTS.map(p => p.id), upgrade: abyssUpgrade, dress: abyssDressInfo, probe: abyssDressProbe, unlock: () => { abyssUnlock(); return absorbEchoes(); }, tick: (dt: number) => { abyssUpdate(dt); abyssModelUpdate(dt); abyssUiUpdate(dt); }, open: openAbyssUI, close: closeAbyssUI, isOpen: abyssUiOpen, bar: abyssBarState },
    wb: wbDebug, btSetRng,
    echo: { give: echoGive, giveAll: echoGiveAll, use: echoUse, last: echoLast, state: echoState, resetCd: echoResetCd, defs: ECHO_DEFS, K: ECHO_K, cdOf: echoCd, dropTable: ECHO_DROP_TABLE, roll: rollEchoDrop },
    forge: { debug: forgeDebug, setRng: forgeSetRng },
    judge: { state: judgeState, act: judgeAct, show: judgeShow, min: judgeMinimize },
    bossScale: { judgeHpK: JUDGE_HP_K, state: bossScaleState, k: bossDmgK, armorK: bossArmorK, hit: bossHitAfter },   // fix1108 #7
    smithy: { open: openSmithy, close: closeSmithy, run: smithyRun, pick: smithyPickOffline, detect: smithyDetectType, detectLabel: smithyDetectLabel, buildPrompt: smithyBuildPrompt, lib: smithyLib, pickSet: smithyPickSet, forge: smithyForge, show: forgeShowState, cg: forgeCgState, ping: smithyPing, cfg: SMITHY, pending: smithyPending, items: smithyItems, wear: smithyWear, del: smithyDelete, toast: smithyLastToast, progress: smithyProgressLog, claimCfg, mine: refreshMine, claim: smithyClaim, checkVersion: smithyCheckVersion, devId, forging: () => smithyForging, importGlb: smithyImportGlb, mode: smithyMode, keyPing: smithyKeyPing, importLog: smithyImportLog, localKey: smithyLocalKey, localCheck: smithyLocalCheck, hd: { has: forgeHdHas, size: forgeHdSize, ensure: forgeHdEnsure, jobs: hdJobs, viewer: hdViewerState, closeViewer: closeHdViewer, suffix: HD_SUFFIX } },
    devour: { use: devourUse, charge: devourCharge, last: devourLast, resetCd: devourResetCd } }; },   // __dlc1：测试 / 调试用
  talentTier: [...DLC1_TALENTS, HUNTER_TIER, COFFIN_TIER],
  skills: [...DLC1_SKILLS, ...HUNTER_ULT_SKILLS, ...COFFIN_ULT_SKILLS],
  // v1.0.6 灵契猎手 / v1.0.7 负棺人
  classes: { [HUNTER_ID]: HUNTER_CLASS, [COFFIN_ID]: COFFIN_CLASS },
  bases: [...HUNTER_BASES, ...COFFIN_BASES, ...D40_BASES],
  legendaries: [...DLC1_CLASS_LEGENDARIES, ...LEGENDARIES_40, ...LEGENDARIES_40B],
  items: [...WB_ITEMS, ...GEAR40_ITEMS, ...S40_ITEMS],
  sets: [...DLC1_SETS_ALL, ...S40_SETS],
  achievements: DLC1_ACHIEVEMENTS,
  achStats: () => dlc1AchStats(packCtx),   // v1.2.1
  spirits: [...HUNTER_SPIRITS, ...COFFIN_SPIRITS],
  classQuests: [...HUNTER_QUESTS, ...COFFIN_QUESTS],
  introChapters: DLC1_INTRO,   // v1.2.3 玩法介绍章节
  saveData: () => { const b = btSave(), o: Record<string, unknown> = { ...dlc1Data }; if (judgeState.on) o.demoStep = judgeState.step; { const gs = gateSave(); if (Object.values(gs).some(v => v)) o.gate = gs; else delete o.gate; } if (b.fate || b.ending || b.banner || Object.keys(b.kills ?? {}).length) o.bt = b; else delete o.bt;
    const dm = domainSave(); if (dm) o.domain = dm; else delete o.domain;
    const ab = abyssSave(); if (ab) o.abyss = ab; else delete o.abyss;
    const wb = wbSave(); if (wb) o.wb = wb; else delete o.wb;
    const em = echoSave(); if (em) o.echo = em; else delete o.echo;
    const fg = forgeSave(); if (fg) o.forge = fg; else delete o.forge; const s4 = s40Save(); if (s4) o.s40 = s4; else delete o.s40; return o; },   // 11-05 s40：40 级职业套装每套保底   // v1.2.16 forge：钟铜熔炉（精炼材料 / 噩梦每周首通 / 各难度通关次数）   // v1.2.15 echo：回响钟纹（拥有 / 装着的）   // v1.1.2 abyss：渊噬之躯（解锁后才写）   // v1.1.1 domain：钟楼领地（解锁后才写）   // v1.1.0 bt：命运的岔路选择（fate）/ 结局 / 首领击杀
  loadData: d => { hinted = false; dlc1Data = d && typeof d === 'object' ? { v: 1, ...(d as object) } : { v: 1 }; judgeState.on = !!dlc1Data.demo; if (judgeState.on) judgeWhaleArena(); else wbArena.dwb_whale = undefined; if (!judgeState.on) judgeHide(); else if (typeof dlc1Data.demoStep === 'number') judgeState.step = dlc1Data.demoStep; btLoad(dlc1Data.bt); gateLoad(dlc1Data.gate); domainLoad(dlc1Data.domain); closeDomainUI(); abyssLoad(dlc1Data.abyss); closeAbyssUI(); wbLoad(dlc1Data.wb); echoLoad(dlc1Data.echo); forgeLoad(dlc1Data.forge); s40Load(dlc1Data.s40); },
  // v1.1.1 第 7 键「钟鸣」（守钟人）/ 战斗事件（充能、领地材料、钟律）/ 全局倍率（领地建筑 + 居民 + 钟律 + 无声钟楼的死寂）
  // v1.1.2 第 7 键按选择分发：钟鸣（A）/ 吞噬（B），visible() 互斥；渊噬之躯的变异部件挂到角色身上（dress）
  extKey: [CHIME_KEY, DEVOUR_KEY],
  dress: d => { abyssDress(d); look40Dress(d); },   // 11-12 I17：40 级套装整身调色
  skillSlot: ECHO_SLOT,   // v1.2.15 第 8 技能格（G）：回响钟纹
  onEvent: ev => { chimeEvent(ev); abyssEvent(ev); echoEvent(ev); gateEvent(ev); },
  audio: DLC1_AUDIO,   // v1.2.48 首领配音 / 开场旁白 / 按区域选曲（比赛版才有音频，普通版全部回退）
  npcActs: () => { const a = [{ label: '铸造台 · 一句话铸武器', run: openSmithy }]; return { iola: a, echo_goz: a }; },
  mods: () => { const m = domainMods(), s = btMods() as { taken?: number }, a = abyssMods(), j = judgeMods(); return { dealt: (m.dealt ?? 1) * (a.dealt ?? 1) * j.dealt, taken: (m.taken ?? 1) * (s.taken ?? 1) * (a.taken ?? 1) * j.taken, takenBoss: (m.takenBoss ?? 1) * (a.takenBoss ?? 1), xp: m.xp, gold: m.gold }; },
};

// ---------------------------------------------------------------- 长副本 A「潮渊钟井」挂载（v1.2.69-A1；独立追加，合并时不碰上面的大对象）
{
  const M = DLC1 as PackManifest & { wilds: unknown[]; dungeons: unknown[] };
  M.wilds.push(WELL_WILD); M.dungeons.push(WELL_DUNGEON); wellMountGate(); Object.assign(M.models!, WELL_MODELS);
  const u = M.update!, b = M.bind!, sv = M.saveData!, ld = M.loadData!;
  M.update = dt => { u(dt); wellUpdate(dt); };
  M.bind = ctx => { b(ctx); setWellTablesHook(forgeUseNewLoot); bindWell(ctx); const g = globalThis as unknown as { __dlc1?: Record<string, unknown> }; if (g.__dlc1) g.__dlc1.well = { SARIN_LAMPS, debug: wellDebug, setTide: wellSetTide, setRng: wellSetRng, rig: wellRigInfo, warnDodge: wellWarnDodge, measure: wellMeasureH, build: wellBuildTest, procSkin: wellProcSkin, pose: wellWholePose, twins: wellTwins }; };
  M.saveData = () => { const o = sv() as Record<string, unknown>; const w = wellSave(); if (w) o.well = w; else delete o.well; return o; };
  M.loadData = d => { ld(d); wellLoad((d as { well?: unknown } | null)?.well); };
}

// ---------------------------------------------------------------- 11-14 DLC 地图动态（dyn_world.ts；独立追加，合并时不碰上面的大对象）
{
  const M = DLC1 as PackManifest;
  const ws = [COAST_WILD, MIRROR_WILD, BT_WILD, FORGE_WILD, WELL_WILD] as unknown as { id: string; build?: (api: import('../../core/ContentPacks').WildBuildApi) => void }[];
  for (const w of ws) dynWrapBuild(w);   // 每张 DLC 野外 build 完后自动 dynApply
  dynSetMaps(ws.map(w => w.id));
  const u = M.update!, b = M.bind!;
  M.update = dt => { u(dt); dynWorldUpdate(dt, packCtx); };
  M.bind = ctx => { b(ctx); const g = globalThis as unknown as { __dlc1?: Record<string, unknown> }; if (g.__dlc1) g.__dlc1.dyn = dynDebug; };
}
