// ======================================================================
// v1.0.1：扩展天赋层（内容包的 talentTier）运行时状态 —— 本体代码，只用通用词
// 没有任何包 / 本职业没有扩展天赋层时，所有函数都是空操作，本体行为不变。
// 存档：dlc.<包 id>.ptal = 选中的节点（每层 1 个，null = 没选）
// ======================================================================
import { packs } from '../core/ContentPacks';
import { PackTalentState, PackTalentTierDef } from '../core/PackTalents';
import type { SkillBook } from '../core/SkillBook';
import type { TalentStats } from '../core/TalentTree';
import type { TalentNode } from '../core/Loadout';

let cur: { packId: string; packName: string; st: PackTalentState } | null = null;

/** 换职业 / 读档：找本职业的扩展天赋层（第一个包里的） */
export function ptalInit(clsId: string, points: number) {
  cur = null;
  for (const p of packs()) {
    const t = (p.talentTier ?? []).find((x: PackTalentTierDef) => x.cls === clsId);
    if (t) { cur = { packId: p.id, packName: p.name, st: new PackTalentState(t, points) }; return; }
  }
}
export const ptal = (): PackTalentState | null => cur?.st ?? null;
export const ptalPackName = () => cur?.packName ?? '';
export function ptalSetPoints(points: number) { if (cur) { cur.st.points = points; cur.st.clamp(); } }
/** 读档：dlc 字段里本包那份的 ptal */
export function ptalLoad(dlc: Record<string, unknown> | undefined) {
  if (!cur) return;
  const d = dlc?.[cur.packId] as { ptal?: unknown } | undefined;
  cur.st.load(d?.ptal);
}
/** 存档：写进 mine[包 id].ptal（mine 是各包 saveData 的结果） */
export function ptalSaveInto(mine: Record<string, unknown>) {
  if (!cur) return;
  const prev = mine[cur.packId];
  mine[cur.packId] = { ...(prev && typeof prev === 'object' ? prev as object : {}), ptal: cur.st.save() };
}
/** 让技能书跟天赋一致：选中的终极天赋学会技能，没选的忘掉（装着的换回默认）。返回新学会的 / 被卸下的技能 id */
export function ptalSyncSkills(book: SkillBook): { learned: string[]; unequipped: string[] } {
  const out = { learned: [] as string[], unequipped: [] as string[] };
  if (!cur) return out;
  const want = new Set(cur.st.skills());
  for (const id of cur.st.allSkills()) {
    if (want.has(id)) { if (!book.isLearned(id) && book.learn(id, true)) out.learned.push(id); }
    else if (book.isLearned(id) && book.forget(id)) out.unequipped.push(id);
  }
  return out;
}
export const ptalStats = (): Partial<TalentStats> => cur?.st.charStats() ?? {};
export const ptalNodes = (): TalentNode[] => cur?.st.activeNodes() ?? [];
