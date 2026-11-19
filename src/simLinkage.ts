// v1.2.66 技能替换联动自检：npm run linkage（也在 npm run packs 里跑）
// 规则见 docs/设计/天赋与技能联动核查_1030.md 第三节：槽位继承 + 元素转译 + 整名改前缀
declare const process: { exitCode?: number };
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
import { SkillBook, slotOrigin, inheritedElements } from './core/SkillBook';
import { TalentTree, slotTalents } from './core/TalentTree';
import { CLASSES, skillBookData } from './data/classes';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };

const M = CLASSES.mage;
const book = new SkillBook(skillBookData(M));
const tree = new TalentTree(M.tree, 30);
const set = (id: string, r: number) => (tree as any).ranks.set(id, r);
set('mf_ignite', 2); set('mf_wildfire', 1); set('mf_inferno', 1);
const mods = () => slotTalents(tree.activeNodes(), id => book.slotOf(id), slotOrigin(book)).map(n => n.modifier);
const R = new SkillResolver(new ComboTracker());
const sk = (id: string) => book.data.skills[id];

// 原配：烈焰弹
const orb = R.resolve(sk('flame_orb'), mods(), ctx);
ok(orb.displayName.includes('燎原'), `烈焰弹带燎原：${orb.displayName}`);
ok(orb.effects.some(e => e.type === 'groundZone' && e.element === 'fire'), '烈焰弹：火焰地面');
// 技能 1 换闪电链
const base = R.resolve(sk('chain_lightning'), [], ctx).stats.damage;
const cl = R.resolve(sk('chain_lightning'), mods(), ctx);
ok(cl.stats.damage > base * 1.1, `闪电链继承「炽热」火焰技能伤害：${base} → ${cl.stats.damage.toFixed(1)}`);
ok(cl.effects.some(e => e.type === 'groundZone' && e.element === 'nature'), '燎原在闪电链上变雷属性地面');
ok(cl.displayName.includes('雷殛场') && !cl.displayName.includes('燎原'), `闪电链改名：${cl.displayName}`);
// 冰枪在技能 1：火焰天赋也继承，地面变霜原
const il = R.resolve(sk('ice_lance'), mods(), ctx);
ok(il.effects.some(e => e.type === 'groundZone' && e.element === 'frost') && il.displayName.includes('霜原'), `冰枪：${il.displayName}`);
// 技能 2 原配霜环（冰）——火焰天赋不该加成霜环
const fr = R.resolve(sk('frost_ring'), mods(), ctx), frBase = R.resolve(sk('frost_ring'), [], ctx);
ok(Math.abs(fr.stats.damage - frBase.stats.damage) < 1e-6, '冰槽位（霜环）不吃火焰天赋');
// 大招：熔火陨星换冰河时代 → 前缀「霜原·」，岩浆变冰
const ia = R.resolve(sk('ice_age'), mods(), ctx);
ok(!ia.displayName.startsWith('熔火陨星') && ia.displayName.includes('冰河时代'), `冰河时代不再整名改成熔火陨星：${ia.displayName}`);
ok(ia.effects.some(e => e.type === 'groundZone' && e.element === 'frost'), '冰河时代：地面变冰');
const mt = R.resolve(sk('meteor'), mods(), ctx);
ok(mt.displayName === '熔火陨星', `陨星原配仍是熔火陨星：${mt.displayName}`);
// 炽燃 / 爆燃按元素判定：技能 1 换闪电链后自然（雷）也算
book.equip.skill1 = 'chain_lightning';
ok(inheritedElements(book, 'fire').has('nature'), '炽燃 / 爆燃认闪电链');
book.equip.skill1 = 'flame_orb';
ok(!inheritedElements(book, 'fire').has('nature'), '换回烈焰弹后不再认自然');

// v1.2.66 多重元素附加：各自独立一段伤害，不互相覆盖
{
  const conv = (id: string, el: any) => ({ id, desc: id, match: { skillIds: ['frost_ring'] }, ops: [{ op: 'setElement', value: el }] }) as any;
  const two = R.resolve(sk('frost_ring'), [conv('a', 'fire'), conv('b', 'nature')], ctx);
  ok(two.element === 'fire' && two.effects.some(e => e.type === 'elemHit' && e.element === 'nature'), `两次元素转换：主元素火 + 独立雷伤（${two.elements?.join('+')}）`);
  const add = R.resolve(sk('frost_ring'), [{ id: 'c', desc: 'c', match: { skillIds: ['frost_ring'] }, ops: [{ op: 'addElement', value: 'fire', damagePercent: 0.3 }, { op: 'addElement', value: 'shadow', damagePercent: 0.2 }] } as any], ctx);
  ok(add.element === 'frost' && (add.elements ?? []).join() === 'frost,fire,shadow', `附加元素不改主元素：${add.elements?.join('+')}`);
  const burn = R.resolve(sk('frost_ring'), [conv('a', 'fire'), { id: 'd', desc: 'd', match: { skillIds: ['frost_ring'] }, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'shadow', dps: 5, duration: 3 } }] } as any], ctx);
  ok(burn.effects.some(e => e.type === 'dot' && e.element === 'shadow'), '其它来源明确带元素的持续伤害不被主元素转换吞掉');
}

console.log(`\n技能替换联动：${pass} 通过，${fail} 失败`);
if (fail) process.exitCode = 1;
