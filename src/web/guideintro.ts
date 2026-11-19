import { packList, PackIntroChapter } from '../core/ContentPacks';
// ========== v0.9.6g 玩法介绍：章节数据（文字里的数值全部从各系统常量 / 数据读，改了那边这里跟着变） ==========
// 方案：docs/设计/地图掉落HUD_3D.md 4.5。面板 / 存档 / 火星提示在 nextstep.ts。
import { CLASSES } from '../data/classes';
import { TALENT_START_LEVEL } from '../core/TalentTree';
import { SPIRIT_SLOT_LEVELS } from '../data/spirits';
import { SKILL4_LEVEL, SKILL4B_LEVEL } from '../data/skills_v078';
import { RAID_SET_CHANCE, SETS } from '../data/sets';
import { RAID_LG, ABY_LG, ABY_TOP, ABY_BOSS_LG, ABY_DARKSHARD, ANCIENT_CHANCE, RAID_LG_CHANCE } from '../data/endgame_pools';
import { DARK_EXCHANGE } from '../data/darkgold';
import { ANC } from '../core/Ancient';
import { RAIDS } from '../data/raids';
import { ABYSS, MUTS } from '../data/abyss';
import { WORLD_BOSSES, WB_IDS, WB_SOUL_NEED, WB_WARN_SEC } from '../data/world_bosses';
import { WILD } from '../data/zones_wild';
import { MAPS } from '../data/world_map';
import { FOG_MILESTONES } from './fog';
import { REP_TIERS, REP_GAIN } from './regional';

export type ChId = 'combat' | 'sets' | 'dark' | 'raid' | 'abyss' | 'explore' | 'wboss' | 'rep' | `pack:${string}`;
/** 解锁判定用的快照（main.ts 提供） */
export interface IntroSnap { level: number; codexLg: number; codexSet: number }
/** 预览：src = 说明书来源 id（祭坛 3D 用真掉落模型），kinds = 取哪类物品；glyph = 没有物品时的静态图标 */
export interface Chapter {
  id: ChId; name: string; glyph: string; lock: string; unlocked: (s: IntroSnap) => boolean;
  lines: (cls: string) => string[];
  preview?: { src: string; kinds: ('set' | 'legendary' | 'dark')[]; anc?: boolean; n: number };
  go?: [string, string];   // [动作, 按钮文字]：动作交给 main（同 LessonAct + 新增几个）
}
const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const FIELD_LV = parseInt(String(MAPS.field.levels), 10) || 9;           // 翠风原野推荐等级下限：野外探索 / 声望从这里开始
const WB_LV = Math.min(...WB_IDS.map(id => WILD[WORLD_BOSSES[id].map as keyof typeof WILD]?.minLevel ?? 99));
const RAID_LV = Math.min(RAIDS.molten_throne.level, RAIDS.frost_crypt.level);
const OPEN_CLS = Object.values(CLASSES).map(c => c.name);   // v1.2.3：内容包职业也算（原来只数有套装的职业）
const C4 = (cls: string) => (['warrior', 'mage', 'chrono', 'alchemy'].includes(cls) ? cls : 'warrior') as 'warrior';
const raidLgN = (r: 'molten_throne' | 'frost_crypt', cls: string) => RAID_LG[r].bosses.length + RAID_LG[r].shared[C4(cls)].length;

export const CHAPTERS: Chapter[] = [
  { id: 'combat', name: '战斗与职业', glyph: '⚔', lock: '', unlocked: () => true, go: ['talent', '天赋 N'],
    lines: () => [
      `${OPEN_CLS.length} 个职业：${OPEN_CLS.join('、')}，每个职业 3 个专精（天赋树三系）。`,
      `${SKILL4_LEVEL} 级开第 4 技能槽「绝技」（按 4），${SKILL4B_LEVEL} 级再开第二个绝技（按 K 在技能书里切换）。`,
      `${TALENT_START_LEVEL} 级起每升 1 级得 1 个天赋点（按 N，可存 3 套天赋页）；英灵传承槽在 ${SPIRIT_SLOT_LEVELS.join(' / ')} 级开放（按 Y）。`,
      '30 级满级后经验转成「暗岩印记」，在角色面板 C 里加点。',
    ] },
  { id: 'sets', name: '套装与橙装', glyph: '✦', lock: `达到 ${RAID_LV} 级，或获得第一件套装 / 橙装`, unlocked: s => s.level >= RAID_LV || s.codexLg + s.codexSet > 0, go: ['dropguide', '战利品祭坛'],
    preview: { src: 'dl_molten_throne_0', kinds: ['set', 'legendary'], n: 6 },
    lines: cls => [
      '每个职业一套 6 件套装：2 件 / 4 件改变技能，6 件按当前专精给不同的终极效果。',
      `套装只在长副本掉：每个首领掉套装部件 普通 ${pct(RAID_SET_CHANCE.normal)} / 炼狱 ${pct(RAID_SET_CHANCE.hell)}。`,
      `橙装每职业 24 件（3 专精 × 8 部位），按来源分池、互不重复：熔心王座 ${raidLgN('molten_throne', cls)} / 永霜墓穴 ${raidLgN('frost_crypt', cls)} / 深渊首领层 ${ABY_LG[C4(cls)].length} / 深渊 20 层 ${ABY_TOP[C4(cls)].length}。`,
      `长副本首领独有橙装 普通 ${pct(RAID_LG_CHANCE.unique[0])} / 炼狱 ${pct(RAID_LG_CHANCE.unique[1])}，副本共享橙装 ${pct(RAID_LG_CHANCE.shared[0])} / ${pct(RAID_LG_CHANCE.shared[1])}。`,
      `世界首领有专属橙装，没出也给精魄，攒满 ${WB_SOUL_NEED} 个凝成一件。说明书「战利品祭坛」里能看每件在哪掉、你还缺哪些。`,
    ] },
  { id: 'dark', name: '暗金与太古', glyph: '✹', lock: `达到 ${RAID_LV} 级`, unlocked: s => s.level >= RAID_LV, go: ['dropguide', '战利品祭坛'],
    preview: { src: 'dl_molten_throne_4', kinds: ['dark', 'legendary'], anc: true, n: 4 },
    lines: () => [
      '暗金只做武器和饰品：一个改变玩法的固定效果 + 2 条随机词条（可淬炼）。',
      `长副本最终首领掉暗金 普通 5% / 炼狱 20%，每周首通再翻倍；${DARK_EXCHANGE} 个暗金碎片可兑换指定一件。分解暗金会把效果拓印进暗金典藏，之后能刻到同部位装备上。`,
      `太古 = 红名「（太古）」：长副本炼狱的套装 / 橙装 / 暗金每件 ${pct(ANCIENT_CHANCE.raidHell)}；深渊 20 层顶级橙装每件 ${pct(ANCIENT_CHANCE.abyTop)}；20 层结算自选那件 ${pct(ANCIENT_CHANCE.abyPick)}。`,
      `太古词条全部取峰值；橙装 / 暗金特效数值 ×${ANC.mul}（几率类封顶 ${pct(ANC.chanceCap)}），持续时间 ×${ANC.dur}；分解给双倍材料 + 太古余烬。`,
    ] },
  { id: 'raid', name: '长副本', glyph: '🏰', lock: `达到 ${RAID_LV} 级`, unlocked: s => s.level >= RAID_LV, go: ['worldmap', '地图 M'],
    preview: { src: 'dl_frost_crypt_4', kinds: ['set', 'legendary', 'dark'], n: 6 },
    lines: () => [
      `${RAIDS.molten_throne.name}（${RAIDS.molten_throne.bosses.length} 个首领）和 ${RAIDS.frost_crypt.name}（${RAIDS.frost_crypt.bosses.length} 个首领），都是 ${RAID_LV} 级单人长副本，入口在烬落荒原。`,
      '分普通和炼狱两档；只掉套装和橙装（掉率见上一章），最终首领还掉暗金。',
      '熔心王座偏爆发进攻专精的橙装，永霜墓穴偏控制防守专精。副本地图（3D 浮岛）里点首领能直接看它的掉落。',
      '满级后印记经验全额，是暗金和橙装的主要来源。',
    ] },
  { id: 'abyss', name: '深渊', glyph: '🌀', lock: `达到 ${ABYSS.unlock} 级`, unlocked: s => s.level >= ABYSS.unlock, go: ['abyss', '深渊'],
    preview: { src: 'abyss_top', kinds: ['legendary'], anc: true, n: 4 },
    lines: cls => [
      `${ABYSS.unlock} 级开放，任意传送阵 → 终局进入。共 ${ABYSS.maxFloor} 层，每层敌人生命 / 伤害 +${pct(ABYSS.perFloor)}（复利），${Object.keys(MUTS).length} 种畸变和岔路可选。`,
      `5 / 10 / 15 层是首领层，必掉 ${ABY_BOSS_LG} 件不重复的深渊橙装（本职业 ${ABY_LG[C4(cls)].length} 件池）+ 暗金碎片 ${[5, 10, 15].map(f => ABY_DARKSHARD[f]).join(' / ')}。`,
      `第 20 层隐藏首领：必掉 3 件顶级橙装（本职业 ${ABY_TOP[C4(cls)].length} 件池）+ 暗金碎片 ${ABY_DARKSHARD[20]}，结算从本职业全部暗金里自选 1 件；第 10 层结算从本职业套装部件里自选 1 件。`,
      `普通层只给金币和材料；深渊碎片 ${ABYSS.recastShards} 片 + ${ABYSS.recastGold} 金可在铁匠「淬炼」页重铸暗金。`,
    ] },
  { id: 'explore', name: '野外探索', glyph: '🗼', lock: `达到 ${FIELD_LV} 级（翠风原野）`, unlocked: s => s.level >= FIELD_LV, go: ['worldmap', '地图 M'],
    lines: () => [
      `迷雾：野外没走过的地方盖着迷雾，走过就点亮；每张图探索度到 ${FOG_MILESTONES.join(' / ')}% 给经验和声望（${FOG_MILESTONES[FOG_MILESTONES.length - 1]}% 地图全开）。`,
      '瞭望塔：每张野外图 2 座（翠风原野 1 座，在风蚀高台）。登塔揭开本图的采集点 / 宝箱 / 稀有首领刷新点，并开通本图所有营地传送阵。',
      '传送石：每张野外图路边 2 块，走近按交互激活；之后站在任一传送石旁、或在区域地图（含 3D 沙盘）上点已激活的传送石就能传送。',
      '疾行：野外脱战 3 秒自动移速 +35%。宝箱每图 3 个（开过 20 分钟刷新）+ 1 个每周一次的隐藏箱。',
    ] },
  { id: 'wboss', name: '世界首领', glyph: '🐉', lock: `达到 ${WB_LV} 级（${WILD.star.name}）`, unlocked: s => s.level >= WB_LV, go: ['worldmap', '地图 M'],
    preview: { src: 'wb_moss', kinds: ['legendary'], n: 3 },
    lines: () => [
      ...WB_IDS.map(id => { const b = WORLD_BOSSES[id]; return `${b.name}：${b.level} 级 · ${WILD[b.map as keyof typeof WILD]?.name ?? b.map}「${b.arena}」· 约 ${b.respawnMin} 分钟刷新`; }),
      `出现前 ${WB_WARN_SEC / 60} 分钟全图喊话。每只有专属橙装，没出给精魄，攒满 ${WB_SOUL_NEED} 个凝成一件；击杀 +${REP_GAIN.worldboss} 区域声望。`,
    ] },
  { id: 'rep', name: '声望', glyph: '🏅', lock: `达到 ${FIELD_LV} 级（翠风原野）`, unlocked: s => s.level >= FIELD_LV, go: ['worldmap', '地图 M'],
    lines: () => [
      '翠风 / 星落 / 赤砂 / 霜脊 / 烬落 各自独立的区域声望。',
      `档位：${REP_TIERS.map(t => `${t.name} ${t.at}`).join(' → ')}。`,
      `来源：任务 +${REP_GAIN.quest}（悬赏 +${REP_GAIN.bounty}）、动态事件 / 世界事件 +${REP_GAIN.event}、世界首领 +${REP_GAIN.worldboss}、精英 +${REP_GAIN.elite}、稀有 +${REP_GAIN.rare}、登塔 +${REP_GAIN.tower}、开箱 +${REP_GAIN.chest}。`,
      '补给商的「声望」页用金币兑换（按周限购，部分一次性）。',
    ] },
];
/** 套装部件名（判定「获得过套装」用：图鉴 key = fixed|名字） */
for (const c of packList<PackIntroChapter>('introChapters')) CHAPTERS.push({ id: `pack:${c.id}`, name: c.name, glyph: c.glyph, lock: `达到 ${c.minLevel} 级`, unlocked: s => s.level >= c.minLevel, lines: c.lines, go: c.go });
export const SET_PIECE_NAMES = new Set(Object.values(SETS).filter(s => s.open).flatMap(s => s.pieceNames));
export const chapterOf = (id: string) => CHAPTERS.find(c => c.id === id);
