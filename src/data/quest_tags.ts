// v0.9.1n：重要任务标识——奖励里有暗金 / 橙装 / 天赋点 / 技能强化的任务，名字用红色显示，后面跟（暗金）（技能）等奖励标识
//   规则按奖励自动判断，不用逐个任务手填；需要特别标的任务可以在 KEY_QUESTS 里补
import type { QuestDef } from '../core/Quest';
import { QUEST_PERKS } from './class_quests';

/** 深色底（HUD、提示条）用亮红；羊皮纸面板用深红（对比度 ≥ 4.5） */
export const KEY_QUEST_COLOR = '#ff4a4a';
export const KEY_QUEST_COLOR_PARCH = '#b00000';
/** 手动补标（任务 id → 标识） */
export const KEY_QUESTS: Record<string, string[]> = {};

/** v1.2.76 Rhett 11-03：主线标识。本体主线 = 6-4 的 requires 链（20 条，docs/设计/本体主线_第六章通关.png）+ 尾声；
 *  资料片主线 = 7-0 余音 + 第七~九章编号任务（cs7_1…cs9a_6 / cs9b_6；支线 cs8_r01… 不算） */
export const BASE_MAIN_QUESTS = new Set(['q_wolves', 'q_mine_news', 'q_mine', 'q_field_news', 'rs_news', 'rs_scorp', 'rs_bandits', 'rs_ruins', 'fr_news', 'fr_lake', 'fr_spire',
  'em_news', 'em_embers', 'em_rift', 'em_golems', 'em_scholar', 'ch6_1', 'ch6_2', 'ch6_3', 'ch6_4', 'ch6_5']);
export const MAIN_QUEST_COLOR = '#ffc94a', MAIN_QUEST_COLOR_PARCH = '#8a5a00';
export const isMainQuest = (q: { id: string }) => BASE_MAIN_QUESTS.has(q.id) || /^cs[7-9][ab]?_\d+$/.test(q.id);
const mainTag = (q: QuestDef, html: boolean, onDark: boolean) => !isMainQuest(q) ? '' : html ? `<span class="q-main" style="color:${onDark ? MAIN_QUEST_COLOR : MAIN_QUEST_COLOR_PARCH};font-weight:bold">【主线】</span>` : '【主线】';

export function questTags(q: QuestDef): string[] {
  const t: string[] = [];
  const st = q.reward.stacks ?? [];
  if (st.some(s => s.id === 'tok_dark')) t.push('暗金');
  if (q.reward.item?.minQuality === 'orange') t.push('橙装');
  const perk = QUEST_PERKS[q.id];
  if (perk) {
    if (/伤害|冷却|速度|技能/.test(perk)) t.push('技能');
    if (perk.includes('天赋点')) t.push('天赋');
  }
  for (const k of [...(KEY_QUESTS[q.id] ?? []), ...(q.tags ?? [])]) if (!t.includes(k)) t.push(k);
  return t;
}
export const isKeyQuest = (q: QuestDef) => questTags(q).length > 0;
/** 纯文字：名字（暗金）（技能） */
export const questText = (q: QuestDef) => mainTag(q, false, false) + q.name + questTags(q).map(x => `（${x}）`).join('');
/** HTML：重要任务红字 */
export const questHtml = (q: QuestDef, onDark = false) => mainTag(q, true, onDark) + (isKeyQuest(q) ? `<span class="q-key" style="color:${onDark ? KEY_QUEST_COLOR : KEY_QUEST_COLOR_PARCH};font-weight:bold">${questText(q)}</span>` : q.name);
