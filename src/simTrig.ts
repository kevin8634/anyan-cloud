// 运行：npm run trig —— v1.2.35 可控触发（替代低血条件）+ 冷却重置（every / longest / icd）+ 新特效数据
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
import { CondFlags } from './core/CondFlags';
import { ancientMod } from './core/Ancient';
import { ModifierDef, ResolvedSkill, SkillDef, SlotId } from './core/types';
import { LOOT_DATA } from './data/loot';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged() {}
}
const def: SkillDef = { id: 'x', name: 'x', slot: 'skill2', element: 'physical', shape: 'single', tags: [], stats: { damage: 100, cooldown: 10, range: 5, radius: 0, projectileCount: 1, castTime: 0, cost: 0 }, effects: [] };
const M = (id: string, conditions: ModifierDef['conditions'], v = 0.2): ModifierDef => ({ id, name: id, desc: '', source: 'equipment', match: {}, conditions, ops: [{ op: 'mul', stat: 'damage', value: v }] });
const R = new SkillResolver(new ComboTracker());
const ctx = (now: number, extra: object = {}) => ({ now, casterHpPercent: 1, targetEffects: [], ...extra });

console.log('\n=== flag / stacks / targetHpAbove / icd ===');
CondFlags.reset();
check(R.resolve(def, [M('a', [{ type: 'flag', key: 'oath' }])], ctx(0)).stats.damage === 100, '没有立誓：不生效');
CondFlags.setTimed('oath', 4);
check(Math.round(R.resolve(def, [M('a', [{ type: 'flag', key: 'oath' }])], ctx(1)).stats.damage) === 120, '立誓 4 秒内：+20%');
check(R.resolve(def, [M('a', [{ type: 'flag', key: 'oath' }])], ctx(4.1)).stats.damage === 100, '立誓过期：不生效');
CondFlags.addStack('tide', 3, 5, 6);
check(Math.round(R.resolve(def, [M('t', [{ type: 'stacks', key: 'tide', scale: true }], 0.04)], ctx(1)).stats.damage) === 112, '3 层 × 4% = +12%');
CondFlags.addStack('tide', 9, 5, 6);
check(Math.round(R.resolve(def, [M('t', [{ type: 'stacks', key: 'tide', scale: true }], 0.04)], ctx(1)).stats.damage) === 120, '叠层封顶 5 层 = +20%');
CondFlags.addStack('core', 10, 10);
const core = M('c', [{ type: 'stacks', key: 'core', min: 10, consume: true }], 0.6);
check(Math.round(R.resolve(def, [core], ctx(1), false).stats.damage) === 160 && CondFlags.get('core', 1) === 10, '满 10 层：预览不消耗');
check(Math.round(R.resolve(def, [core], ctx(1), true).stats.damage) === 160 && CondFlags.get('core', 1) === 0, '满 10 层：施放 +60% 并清空');
check(Math.round(R.resolve(def, [M('e', [{ type: 'targetHpAbove', percent: 0.8 }], 0.25)], ctx(1, { targetHpPercent: 0.9 })).stats.damage) === 125, '目标生命 90% > 80%：+25%');
check(R.resolve(def, [M('e', [{ type: 'targetHpAbove', percent: 0.8 }], 0.25)], ctx(1, { targetHpPercent: 0.5 })).stats.damage === 100, '目标生命 50%：不生效');
const ic = M('i', [{ type: 'icd', sec: 8 }]);
check(R.resolve(def, [ic], ctx(10), true).stats.damage > 100 && R.resolve(def, [ic], ctx(12), true).stats.damage === 100 && R.resolve(def, [ic], ctx(18.1), true).stats.damage > 100, '内置冷却 8 秒');
CondFlags.provide('near6', () => 4);
check(Math.round(R.resolve(def, [M('n', [{ type: 'stacks', key: 'near6', scale: true }], 0.08)], ctx(1)).stats.damage) === 132, '背水一战：4 个敌人 +32%');
CondFlags.unprovide('near6');

console.log('\n=== 冷却重置：every / longest / icd 透传 ===');
const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e6, { x: 1, z: 0 });
const got: { slot: SlotId | 'longest'; icd?: number }[] = [];
const world: CombatWorld = { units: () => [p, e], resetCooldown: (_o, slot, eff) => got.push({ slot, icd: eff?.icd }) };
const fx = new EffectSystem(world, () => 0.01);
const sk = (eff: ResolvedSkill['effects'][0]): ResolvedSkill => ({ baseId: 's', displayName: 's', slot: 'skill2', element: 'physical', shape: 'single', tags: [], stats: { ...def.stats }, effects: [eff], appliedModifiers: [] });
for (let i = 0; i < 12; i++) fx.applySkill(sk({ type: 'resetCooldown', slot: 'longest', chance: 1, every: 6 }), p, [e]);
check(got.length === 2 && got.every(g => g.slot === 'longest'), '每第 6 次命中重置（12 次 → 2 次）');
got.length = 0; fx.applySkill(sk({ type: 'resetCooldown', slot: 'ultimate', chance: 0.05, icd: 20 }), p, [e]);
check(got.length === 1 && got[0].icd === 20, '内置冷却参数传给表现层');
const anc = ancientMod({ id: 'k', name: 'k', desc: '技能命中叠「熔核」，满 10 层后下一个技能伤害 +60%', source: 'equipment', match: {}, conditions: [{ type: 'stacks', key: 'core', min: 10, consume: true }], ops: [] });
check((anc.conditions![0] as { min: number }).min === 9 && anc.desc.includes('满 9 层'), '太古：满 10 层 → 9 层（文字同步）');

console.log('\n=== 数据：低血条件全部移除 ===');
const all = JSON.stringify([LOOT_DATA.legendaries, LOOT_DATA.fixedItems]);
check(!all.includes('"hpBelow"'), '橙装 / 固定装备里不再有 hpBelow 条件');
check(!/生命低于 \d+% 时/.test(all), '装备说明里不再有「生命低于 X% 时」');
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
if (fails) process.exitCode = 1;
