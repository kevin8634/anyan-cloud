// v1.0.1：扩展天赋层（内容包）单元测试：node dist/simPackTalents.js
// 先授权并注册 dlc1，再 require 游戏数据模块（数据表在加载时合并包内容）
import { Entitlement, installPack } from './core/Entitlement';
import { DLC1 } from './dlc/dlc1/manifest';
import { PackTalentState, PACK_TALENT_LEVELS, packTalentPointsAt } from './core/PackTalents';
import { Progression } from './core/TalentTree';
declare const require: (m: string) => unknown; declare const process: { exitCode?: number };
let ok = 0, bad = 0;
const check = (c: boolean, m: string) => { if (c) ok++; else bad++; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
Entitlement.grantForTest('dlc1'); installPack(DLC1);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CLASSES, skillBookData } = require('./data/classes') as typeof import('./data/classes');
const { SkillBook } = require('./core/SkillBook') as typeof import('./core/SkillBook');
const { Inventory } = require('./core/Inventory') as typeof import('./core/Inventory');

console.log('\n=== 点数');
check(PACK_TALENT_LEVELS.join() === '32,34,36,38,40', '扩展天赋点：32/34/36/38/40 级各 1 点');
check([30, 31, 32, 35, 39, 40].map(packTalentPointsAt).join() === '0,0,1,2,4,5', `30/31/32/35/39/40 级 = ${[30, 31, 32, 35, 39, 40].map(packTalentPointsAt).join(' / ')}`);
{ const p = new Progression(40); p.load({ level: 40, xp: 0 }); check(p.packTalentPoints === 5 && p.talentPoints === 28, '40 级：本体 28 点（+ 职业试炼 2）+ 扩展 5 点'); }

console.log('\n=== 结构');
const tiers = DLC1.talentTier ?? [];
check(['warrior', 'mage', 'chrono', 'alchemy'].every(c => tiers.some(t => t.cls === c)), '4 个职业各有一棵扩展天赋层');
check(tiers.every(t => t.layers.map(l => l.length).join() === '1,2,1,2,3'), '每棵 5 层：1 / 2 / 1 / 2 / 3 个候选');
check(tiers.every(t => t.layers[4].every(n => !!n.skill) && t.layers.slice(0, 4).flat().every(n => !n.skill)), '只有第 5 层（终极）给新技能');
const ids = tiers.flatMap(t => t.layers.flat().map(n => n.id));
check(new Set(ids).size === ids.length, `节点 id 不重复（${ids.length} 个）`);

console.log('\n=== 选择规则');
{
  const st = new PackTalentState(tiers.find(t => t.cls === 'warrior')!, 0);
  const L = st.def.layers;
  check(!st.pick(L[0][0].id) && st.whyCannotPick(L[0][0].id)!.includes('32 级'), '0 点：第 1 层不能选（提示 32 级）');
  st.points = 2;
  check(st.pick(L[0][0].id) && !st.pick(L[2][0].id), '2 点：第 1 层可选；第 3 层不能跳着选');
  check(st.pick(L[1][0].id) && st.pick(L[1][1].id) && st.picks[1] === L[1][1].id && st.spent === 2, '同层换选：替换、不额外花点');
  check(st.whyCannotPick(L[2][0].id) !== null, '点数用完：第 3 层不能选');
  st.points = 5; [L[2][0], L[3][0], L[4][1]].forEach(n => st.pick(n.id));
  check(st.spent === 5 && st.skills().join() === L[4][1].skill, `5 点选满：终极给「${L[4][1].name}」`);
  check(!st.unpick(1) && st.unpick(4) && st.skills().length === 0, '退选只能从最下层开始');
  check(st.charStats().hp! > 0 && st.activeNodes().length >= 1, '属性 + 修饰器生效');
  const sv = st.save(); const st2 = new PackTalentState(st.def, 3); st2.load(sv);
  check(st2.spent === 3 && !st2.picks[3], '读档：点数不够（3 点）自动从下层退到 3 个');
  st2.load(['nope', 123]); check(st2.spent === 0, '读档：坏数据忽略');
}

console.log('\n=== 技能书');
for (const c of ['warrior', 'mage', 'chrono', 'alchemy'] as const) {
  const d = skillBookData(CLASSES[c]); const t = tiers.find(x => x.cls === c)!;
  const ult = t.layers[4].map(n => n.skill!);
  check(ult.every(id => d.skills[id] && d.choices.skill4?.includes(id) && d.talentOnly?.has(id)) && ult.every(id => d.runes.filter(r => r.skillId === id).length === 3), `${CLASSES[c].name}：3 个新绝技进第 4 槽可选项，各 3 枚符文，只能由天赋学会`);
  const b = new SkillBook(d);
  check(!b.unlearned().some(id => ult.includes(id)) && !b.learn(ult[0]) && b.learn(ult[0], true), `${CLASSES[c].name}：技能书不能学、天赋可以学`);
  check(b.setSkill('skill4', ult[0]) === null && b.skillAt('skill4').id === ult[0] && b.forget(ult[0]) && b.skillAt('skill4').id === d.defaults.skill4, '装进绝技槽；忘掉后换回默认绝技');
  b.learn(ult[1], true); b.setSkill('skill4', ult[1]); const sv = b.save();
  const b2 = new SkillBook(d); b2.load(sv);
  check(!b2.isLearned(ult[1]) && b2.skillAt('skill4').id === d.defaults.skill4 && b2.learn(ult[1], true) && b2.skillAt('skill4').id === ult[1], '读档：先不学，天赋重新学会后自动装回绝技槽');
}

console.log('\n=== DLC 装备限制');
{
  const inv = new Inventory(); const it = { id: 'x', name: '测试', slot: 'neck', quality: 'purple', itemLevel: 80, baseId: 'b_amulet', modifiers: [], pack: 'dlc1' } as never;
  check(inv.whyCannotEquip(it) === null, '装了 dlc1：DLC 装备可穿');
  const it2 = { ...(it as object), pack: 'dlc_x' } as never;
  check(/资料片/.test(inv.whyCannotEquip(it2) ?? ''), `没装的包：不能穿（${inv.whyCannotEquip(it2)}）`);
}
console.log(bad ? `\n❌ ${bad} 项失败（通过 ${ok}）` : `\n✅ 全部通过（${ok}）`);
if (bad) process.exitCode = 1;
