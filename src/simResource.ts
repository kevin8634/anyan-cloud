// v0.7.5 职业资源自动测试：npm run resource
declare const process: { exitCode?: number };
import { newRes, resOnHit, resOnHurt, resOnReaction, resOnCast, resEmpower, resSpend, resTick, resFreeUlt } from './core/Resource';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
// 战士
const w = newRes('warrior');
for (let i = 0; i < 5; i++) resOnHit(w, 'basic', 'a', i);
ok(w.value === 40, `怒气：普攻 5 次 = ${w.value}`);
resOnHurt(w, 100, 1000, 5); ok(w.value === 55, `受伤 10% 生命 +15 → ${w.value}`);
ok(!resEmpower(w, 'basic') && !!resEmpower(w, 'skill2'), '满 50：技能 1~3 可强化，普攻不强化');
resSpend(w, 50); ok(w.value === 5, '强化消耗 50');
w.value = 100; ok(resFreeUlt(w), '满 100：大招无视冷却');
resTick(w, 1, 6); ok(w.value === 100, '刚获得不衰减'); resTick(w, 1, 20); ok(w.value === 94, `脱战衰减 6/秒 → ${w.value}`);
// 法师
const m = newRes('mage');
resOnCast(m, 'skill1', 'fire', 0); resOnCast(m, 'skill2', 'fire', 1); resOnCast(m, 'skill3', 'frost', 2); resOnCast(m, 'skill1', 'arcane', 3); resOnCast(m, 'basic', 'arcane', 3.5);
ok(m.value === 3, `奥能：火→火→冰→奥术 = ${m.value} 层（同元素、普攻不加）`);
resOnCast(m, 'skill2', 'fire', 4); const me = resEmpower(m, 'ultimate');
ok(m.value === 4 && !!me && me.mods[0].ops.some(o => o.op === 'add' && o.stat === 'projectileCount'), '4 层：下一个技能多 1 发');
// 时砂
const c = newRes('chrono');
for (let i = 0; i < 3; i++) { c.castSeq++; resOnHit(c, 'skill2', 'x', i); resOnHit(c, 'skill2', 'x', i); }
ok(c.value === 3, `连击点：同一目标 3 次施法 = ${c.value}（一次施法多段只算 1 点）`);
c.castSeq++; resOnHit(c, 'skill2', 'y', 4); ok(c.value === 1, '换目标重新计数');
c.value = 5; const ce = resEmpower(c, 'skill3')!; ok(ce.cost === 5 && ce.mods[0].ops.some(o => o.op === 'addEffect'), '5 点：控制技能 +50% 伤害并附带眩晕');
ok(!resEmpower(c, 'skill2'), '输出技能（技能 2）不消耗连击点');
resTick(c, 0.1, 10); ok(c.value === 0, '断档 3 秒清零');
// 炼金
const a = newRes('alchemy');
for (let i = 0; i < 5; i++) resOnReaction(a, i);
ok(a.value === 100 && !!resEmpower(a, 'skill1', ['reagent_r']) && !resEmpower(a, 'skill1', []), '反应热度：5 次反应满 100，下一瓶试剂沸腾');
console.log(fail ? `\n❌ ${fail} 项失败` : '\n✅ 职业资源 全部通过');
process.exitCode = fail ? 1 : 0;
