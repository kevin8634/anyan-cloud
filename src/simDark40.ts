// 11-05 DLC1 新 40 级暗金（三魂同契 / 不眠棺）规则自测：npx tsc -p . && node dist/simDark40.js
//   数据 / 掉落表换新 / 旧件迁移（migrateFixed：去旧特效、挂新特效、保留词条）/ 残形与祖契门控 / 宿魂读数门控。
import { Entitlement, installPack } from './core/Entitlement';
import { DLC1 } from './dlc/dlc1/manifest';
import { DLC1_DARK, DARK_BY_CLASS, D40_MIGRATE } from './dlc/dlc1/gear40';
import { HUNTER_ID } from './dlc/dlc1/hunter_skills';
import { COFFIN_ID } from './dlc/dlc1/coffin_skills';
import { CondFlags } from './core/CondFlags';
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
import { LootGenerator, FIXED_MIGRATE } from './core/Loot';
import type { ModifierDef, SkillDef, SlotId } from './core/types';

declare const require: (m: string) => unknown; declare const process: { exitCode?: number };
let ok = 0, bad = 0;
const check = (c: boolean, m: string) => { if (c) ok++; else bad++; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
Entitlement.grantForTest('dlc1'); installPack(DLC1);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LOOT_DATA } = require('./data/loot') as typeof import('./data/loot');

console.log('\n=== 数据 / 掉落 / 迁移表');
const triad = DLC1_DARK.find(d => d.id === 'd40_h_triad'), sleep = DLC1_DARK.find(d => d.id === 'd40_c_sleepless');
check(!!triad && !!sleep && triad.slot === 'twoHand' && sleep.slot === 'twoHand', '三魂同契 / 不眠棺 已定义（双手）');
check(['d40_h_triad', 'd40_c_sleepless', 'd40_h_spirit', 'd40_c_requiem'].every(id => LOOT_DATA.fixedItems.some(f => f.id === id)), '新件进 fixedItems，旧件定义保留');
check(DARK_BY_CLASS[HUNTER_ID].join() === 'd40_h_triad' && DARK_BY_CLASS[COFFIN_ID].join() === 'd40_c_sleepless', '沉眠者掉落换新件（旧件不再掉落）');
check(FIXED_MIGRATE.d40_h_spirit === 'd40_h_triad' && FIXED_MIGRATE.d40_c_requiem === 'd40_c_sleepless' && Object.keys(D40_MIGRATE).length === 2, 'D40_MIGRATE 已登记进 FIXED_MIGRATE');
for (const [from, to] of Object.entries(D40_MIGRATE)) {
  const gen = new LootGenerator(LOOT_DATA as never), it = gen.generateFixed(from, 84)!;
  const aff = JSON.stringify(it.affixLog ?? null), base = it.baseId, oldFx = it.modifiers.filter(m => m.id.startsWith(`${it.id}:`)).length;
  const did = gen.migrateFixed(it, FIXED_MIGRATE);
  const newDef = LOOT_DATA.fixedItems.find(f => f.id === to)!, oldDef = LOOT_DATA.fixedItems.find(f => f.id === from)!;
  const has = (d: typeof newDef) => d.modifiers.every(m => it.modifiers.some(x => x.id === `${it.id}:${m.id}`));
  check(did && it.fixedId === to && it.name.includes(newDef.name) && has(newDef) && !oldDef.modifiers.some(m => it.modifiers.some(x => x.id === `${it.id}:${m.id}`)),
    `${from} → ${to}：换名「${it.name}」，旧特效 ${oldFx} 条去掉、新特效 ${newDef.modifiers.length} 条挂上`);
  check(JSON.stringify(it.affixLog ?? null) === aff && it.baseId === base && !it.lines.some(l => oldDef.modifiers.some(m => l.includes(m.desc.slice(0, 8)))), '  词条 / 底材保留，旧特效行清掉');
  check(!gen.migrateFixed(it, FIXED_MIGRATE), '  幂等（再迁一次不动）');
}

console.log('\n=== 三魂同契：残形 / 祖契');
const res = new SkillResolver(new ComboTracker());
const sk = (id: string, slot: SlotId, tags: string[]): SkillDef =>
  ({ id, name: id, slot, element: 'physical', shape: 'single', tags, effects: [], stats: { damage: 100, cooldown: 10, radius: 3, range: 5, projectileCount: 1, castTime: 0, cost: 0 } } as unknown as SkillDef);
const cx = { now: 100, casterHpPercent: 1, targetEffects: [] };
const tm = triad!.modifiers as ModifierDef[], cm = sleep!.modifiers as ModifierDef[];
for (const k of ['dk40h_w', 'dk40h_b', 'dk40h_e']) check(CondFlags.hitRules.filter(r => r.key === k).length === 2, `hitRule ${k}：换形技 + 大招`);
CondFlags.reset();
let r = res.resolve(sk('hp_pounce', 'skill1', ['melee', 'beast']), tm, cx);
check(!r.tags.includes('bear') && !r.appliedModifiers.some(i => i.startsWith('dk40h')), '没残形 → 不加标签');
CondFlags.addStack('dk40h_b', 1, 1, 110, 100);
r = res.resolve(sk('hp_pounce', 'skill1', ['melee', 'beast']), tm, cx);
check(r.tags.includes('bear') && r.tags.includes('sunder') && !r.appliedModifiers.includes('dk40h_z'), '残熊 → 技能带 bear / sunder，不触发祖契');
CondFlags.addStack('dk40h_w', 1, 1, 110, 100); CondFlags.addStack('dk40h_e', 1, 1, 110, 100);
r = res.resolve(sk('hp_pounce', 'skill1', ['melee', 'beast']), tm, cx, true);
check(r.appliedModifiers.includes('dk40h_z') && r.displayName.startsWith('祖契·') && r.effects.some(e => e.type === 'explode') && ['wolf', 'bear', 'eagle', 'mark'].every(t => r.tags.includes(t)), '三残形齐亮 → 祖契·（冲撞 + 三相标签）');
check(CondFlags.get('dk40h_w', 100) === 0 && CondFlags.get('dk40h_b', 100) === 0, '祖契后三残形熄灭');
r = res.resolve(sk('hp_shift_wolf', 'skill1', ['shift', 'wolf']), tm, cx);
check(!r.appliedModifiers.some(i => i.startsWith('dk40h')), '换形技本身不吃残形（没有 beast 标签）');

console.log('\n=== 不眠棺：宿魂');
const souls: Record<string, number> = { souls: 0, souls_B: 0, souls_H: 0, souls_G: 0, souls_A: 0 };
for (const k of Object.keys(souls)) CondFlags.provide(k, () => souls[k]);
const ids = (rr: ReturnType<typeof res.resolve>) => rr.appliedModifiers.filter(i => i.startsWith('dk40c'));
r = res.resolve(sk('c_s2', 'skill2', ['coffin']), cm, cx);
check(ids(r).length === 0, '空棺 → 没有宿魂效果');
Object.assign(souls, { souls: 3, souls_G: 3 });
r = res.resolve(sk('c_s2', 'skill2', ['coffin']), cm, cx);
check(ids(r).includes('dk40c_g1') && ids(r).includes('dk40c_g3') && r.effects.some(e => e.type === 'stun'), '纯巨棺 → 余波 + 眩晕');
Object.assign(souls, { souls: 3, souls_G: 1, souls_A: 2 });
r = res.resolve(sk('c_s2', 'skill2', ['coffin']), cm, cx);
check(ids(r).includes('dk40c_g1') && ids(r).includes('dk40c_a1') && !ids(r).includes('dk40c_g3') && !ids(r).includes('dk40c_a3'), '混色棺 → 只有每魂档，没有纯色档');
r = res.resolve(sk('c_ult', 'ultimate', ['coffin']), cm, cx);
check(ids(r).includes('dk40c_u') && r.displayName.endsWith('·随葬'), '大招（coffin 标签）→ 随葬');
r = res.resolve(sk('c_open', 'ultimate', []), cm, cx);
check(!ids(r).includes('dk40c_u'), '开棺技能（无 coffin 标签）不吃随葬');

console.log(`\n结果：${ok} 通过，${bad} 失败`);
process.exitCode = bad ? 1 : 0;
