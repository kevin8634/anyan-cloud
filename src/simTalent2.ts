import { SKILL4, RUNES_V078 } from './data/skills_v078';
import { skillBookData } from './data/classes';
// v0.7.7 天赋树 2.0 自动测试：npm run talent2
declare const process: { exitCode?: number };
import { CLASSES, LEGACY_TREES } from './data/classes';
import { TalentTree, Progression } from './core/TalentTree';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const p = new Progression();
for (const lv of [1, 9, 10, 20, 30]) { p.level = lv; ok(p.talentPoints === ({ 1: 0, 9: 0, 10: 1, 20: 15, 30: 28 } as Record<number, number>)[lv], `${lv} 级：${p.talentPoints} 个天赋点`); }
/** 往一系里按层灌点直到点出终极；返回花了多少点 */
function rush(t: TalentTree, specId: string): number {
  const sp = t.spec(specId)!; const cap = sp.nodes.find(n => n.capstone)!;
  for (let guard = 0; guard < 60 && !t.rank(cap.id); guard++) {
    if (t.add(cap.id)) break;
    const n = sp.nodes.filter(n => !n.capstone && t.rank(n.id) < n.maxRank && !t.whyCannotAdd(n.id)).sort((a, b) => a.row - b.row)[0];
    if (!n || !t.add(n.id)) break;
  }
  return t.rank(cap.id) ? t.spentIn(specId) : -1;
}
for (const c of Object.values(CLASSES)) {
  const def = (LEGACY_TREES as Record<string, typeof c.tree>)[c.id] ?? c.tree;
  ok(def.tiers === 6 && def.specs.every(s => s.nodes.filter(n => n.capstone).every(n => n.row === 6)), `${c.name}：6 层，终极在第 6 层`);
  ok(def.specs.every(s => s.nodes.filter(n => n.resNode && n.res && n.row === 2).length === 1), `${c.name}：每系第 2 层 1 个资源节点`);
  ok(def.specs.every(s => s.nodes.filter(n => n.row === 4 && n.modifier?.match.slots?.includes('skill4')).length === 1), `${c.name}：每系第 4 层 1 个绝技槽位节点`);
  ok(def.specs.every(s => s.nodes.every(n => !n.group)), `${c.name}：没有跨树互斥组`);
  ok(def.specs.every(s => { const cells = s.nodes.map(n => `${n.row}:${n.col}`); return new Set(cells).size === cells.length; }), `${c.name}：节点格子不重叠`);
  for (const s of def.specs) { const t = new TalentTree(def, 21); const n = rush(t, s.id); ok(n === 16, `${c.name}「${s.name}」30 级（21 点）点出终极：本系 ${n} 点`); }
  const t = new TalentTree(def, 28); rush(t, def.specs[0].id); const second = rush(t, def.specs[1].id);
  ok(second === -1, `${c.name}：28 点（毕业）也点不出第二个终极（第二系最多 ${t.spentIn(def.specs[1].id)} 点）`);
  const t2 = new TalentTree(def, 21); const rn = def.specs[0].nodes.find(n => n.resNode)!;
  for (const n of def.specs[0].nodes.filter(n => n.row === 1)) while (t2.add(n.id) && t2.spentIn(def.specs[0].id) < 3);
  ok(t2.add(rn.id) && Object.keys(t2.resBonus()).length > 0, `${c.name}：资源节点「${rn.name}」生效 ${JSON.stringify(t2.resBonus())}`);
}
for (const c of Object.values(CLASSES)) {
  const d = skillBookData(c), k = c.id as keyof typeof SKILL4;
  ok(d.defaults.skill4 === SKILL4[k][0].id && d.choices.skill4?.join() === SKILL4[k].map(s => s.id).join(), `${c.name}：第 4 槽 ${SKILL4[k].map(s => s.name).join(' / ')}`);
  ok(SKILL4[k].every(s => d.runes.filter(r => r.skillId === s.id).length === 3), `${c.name}：每个绝技 3 枚符文`);
}
ok(RUNES_V078.length === 24, `绝技符文共 ${RUNES_V078.length} 枚`);
console.log(fail ? `\n❌ ${fail} 项失败` : '\n✅ 天赋树 2.0 全部通过');
process.exitCode = fail ? 1 : 0;
