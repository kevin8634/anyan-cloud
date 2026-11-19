// v1.2.66 元素变种命名（docs/设计/天赋与技能联动核查_1030.md 第四节）：一眼看出属性，不用「火焰·」直译
import type { Element, ResolvedSkill } from './types';

export type ElemKey = Element | 'lightning';
export const ELEM_WORDS: Record<string, { dot: string; ground: string; pre: string }> = {
  fire: { dot: '灼烧', ground: '燎原', pre: '焚' },
  frost: { dot: '冻伤', ground: '霜原', pre: '霜' },
  lightning: { dot: '感电', ground: '雷殛场', pre: '霆' },
  nature: { dot: '蚀毒', ground: '瘴沼', pre: '蚀' },
  shadow: { dot: '暗蚀', ground: '冥土', pre: '冥' },
  arcane: { dot: '星蚀', ground: '星域', pre: '星' },
  physical: { dot: '流血', ground: '碎地', pre: '裂' },
  holy: { dot: '圣灼', ground: '圣域', pre: '辉' },
};
const LIGHTNING_TAGS = ['chain', 'lightning', 'thunder', 'storm'];
/** 自然元素里区分雷与毒 */
export function elemKey(r: Pick<ResolvedSkill, 'element' | 'tags' | 'baseId'>): string {
  if (r.element === 'nature' && (r.tags.some(t => LIGHTNING_TAGS.includes(t)) || /lightning|thunder|storm/.test(r.baseId))) return 'lightning';
  return r.element;
}
/** 把变种名里原元素的持续伤害 / 地面词换成当前技能元素的词 */
export function translateWords(text: string | undefined, from: string[], to: string): string | undefined {
  if (!text) return text;
  const t = ELEM_WORDS[to]; if (!t) return text;
  let out = text;
  for (const f of from) { const w = ELEM_WORDS[f]; if (!w || f === to) continue; out = out.split(w.ground).join(t.ground).split(w.dot).join(t.dot); }
  return out;
}
export function adaptRename<O extends { prefix?: string; suffix?: string; name?: string }>(op: O, src: readonly Element[] | undefined, r: Pick<ResolvedSkill, 'element' | 'tags' | 'baseId'>): O {
  const to = elemKey(r);
  if (!src?.length || src.includes(r.element as Element) && to !== 'lightning') return op;
  const from = src.map(String);
  return { ...op, prefix: translateWords(op.prefix, from, to), suffix: translateWords(op.suffix, from, to), name: translateWords(op.name, from, to) };
}
/** 整名重命名（终极天赋「熔火陨星」等）只给原技能；同槽换成别的技能时改成前缀：同元素取原名前两字，异元素用当前元素的地面词 */
export function renameFit<O extends { prefix?: string; suffix?: string; name?: string }>(op: O, m: { match: { renameFor?: string[]; adaptFrom?: readonly Element[] } }, r: Pick<ResolvedSkill, 'element' | 'tags' | 'baseId'>): O {
  const ids = m.match.renameFor;
  if (!op.name || !ids?.length || ids.includes(r.baseId)) return op;
  const src = m.match.adaptFrom, same = !src?.length || src.includes(r.element as Element);
  const pre = same ? (op.name.includes('·') ? op.name.split('·')[0] : op.name.slice(0, 2)) : (ELEM_WORDS[elemKey(r)]?.ground ?? op.name.slice(0, 2));
  return { ...op, name: undefined, prefix: (op.prefix ?? '') + pre + '·' };
}
