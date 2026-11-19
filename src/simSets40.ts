// 11-05 DLC1 40 级职业套装规则自测（不开浏览器）：npx tsc -p . && node dist/simSets40.js
//   数据完整性（6 套 × 6 件、底材存在、2/4/6 件效果、分支 priority 35）、hitRules（s40m / s40t / s40h / s40he）、
//   12 个终极天赋读数 s40cap_*（时砂 / 炼金走 PackCtx.talentRank）、分支门控（读数 / 标签）经 SkillResolver 实际解析。
import { Entitlement, installPack } from './core/Entitlement';
import { DLC1 } from './dlc/dlc1/manifest';
import { S40_SETS, S40_ITEMS, S40_BY_CLASS, S40_CAPS, bindSets40, sets40Caps, s40Roll, s40Save, s40Load, s40ForgeChance, s40Debug } from './dlc/dlc1/sets40';
import { CondFlags } from './core/CondFlags';
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
import type { ModifierDef, SkillDef, SlotId } from './core/types';
import type { PackCtx } from './core/ContentPacks';

declare const require: (m: string) => unknown; declare const process: { exitCode?: number };
let ok = 0, bad = 0;
const check = (c: boolean, m: string) => { if (c) ok++; else bad++; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
Entitlement.grantForTest('dlc1'); installPack(DLC1);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LOOT_DATA } = require('./data/loot') as typeof import('./data/loot');

console.log('\n=== 数据');
check(S40_SETS.length === 6 && S40_SETS.every(s => s.pieces.length === 6), `6 套 × 6 件（${S40_SETS.map(s => s.id).join(' / ')}）`);
const ids = S40_ITEMS.map(i => i.id);
check(new Set(ids).size === 36, `36 件 id 不重复`);
check(S40_ITEMS.every(i => LOOT_DATA.bases.some(b => b.id === i.baseId)), '每件底材都在 LOOT_DATA.bases：' + S40_ITEMS.filter(i => !LOOT_DATA.bases.some(b => b.id === i.baseId)).map(i => i.baseId).join(','));
check(S40_ITEMS.every(i => LOOT_DATA.fixedItems.some(f => f.id === i.id)), '36 件都已注册进 fixedItems（PackManifest.items）');
check(S40_SETS.every(s => s.cls.startsWith('dlc1_s40_')), 'SetDef.cls 用假 cls dlc1_s40_*（不抢 classSet）');
check(S40_SETS.every(s => [2, 4, 6].every(n => s.bonuses.some(b => b.pieces === n))), '每套都有 2 / 4 / 6 件效果');
check(S40_SETS.every(s => s.bonuses.filter(b => b.pieces === 6 && b.modifier?.priority === 35).length >= 3), '每套 6 件分支修饰器 ≥ 3 条，priority 35');
check(Object.keys(S40_BY_CLASS).length === 6, 'S40_BY_CLASS 六职业');
const six = S40_SETS.map(s => s.bonuses.find(b => b.pieces === 6 && b.desc)?.desc ?? '');
check(six.every(d => d.split('；').length >= 4), '6 件说明 = 通用 + 3 分支');

console.log('\n=== hitRules');
for (const k of ['s40m', 's40t', 's40h', 's40he']) check(CondFlags.hitRules.some(r => r.key === k), `已登记 ${k}`);
const he = CondFlags.hitRules.find(r => r.key === 's40he');
check(!!he && he.max === 1 && he.dur === 10 && he.skillIds?.join() === 'hp_shift_eagle', 's40he = 换鹰单层 10 秒计时器');

console.log('\n=== 终极天赋读数 s40cap_*');
const ranks: Record<string, number> = {};
bindSets40({ talentRank: (id: string) => ranks[id] ?? 0 } as unknown as PackCtx);
const all = Object.values(S40_CAPS).flat();
check(all.length === 12 && Object.keys(sets40Caps()).length === 12, '12 个读数');
check(all.every(id => CondFlags.get(`s40cap_${id}`, 0) === 0), '没点终极：12 个读数全 0');
ranks.cm_doom = 1; ranks.ag_boil = 1;
check(CondFlags.get('s40cap_cm_doom', 0) === 1 && CondFlags.get('s40cap_ag_boil', 0) === 1 && CondFlags.get('s40cap_ce_parallel', 0) === 0, '点了命定之刻 / 沸腾之地 → 对应读数 1，其它 0（PackCtx.talentRank）');
check(CondFlags.get('s40cap_hw_alpha', 0) === 0 && CondFlags.get('s40cap_cs_full', 0) === 0, '猎手 / 负棺读数没绑职业运行时 = 0（不报错）');

console.log('\n=== 分支门控（SkillResolver 实际解析）');
const res = new SkillResolver(new ComboTracker());
const mods = (setId: string): ModifierDef[] => S40_SETS.find(s => s.id === setId)!.bonuses.map(b => b.modifier!).filter(Boolean);
const sk = (id: string, slot: SlotId, tags: string[], element: SkillDef['element'] = 'physical'): SkillDef =>
  ({ id, name: id, slot, element, shape: 'single', tags, effects: [], stats: { damage: 100, cooldown: 10, radius: 3, range: 5, projectileCount: 1, castTime: 0, cost: 0 } } as unknown as SkillDef);
const cx = { now: 100, casterHpPercent: 1, targetEffects: [] };
{ const r = res.resolve(sk('ult', 'ultimate', []), mods('set40_chrono'), cx);
  check(r.appliedModifiers.includes('set40_chrono_6m1'), '时砂：点命定之刻 → 大招挂「永动·命定」必暴（6m1）');
  check(!r.appliedModifiers.includes('set40_chrono_6r2'), '时砂：没点永恒一瞬 → 不挂护盾分支（6r2）');
  ranks.cm_doom = 0; ranks.cr_eternal = 1;
  const r2 = res.resolve(sk('ult', 'ultimate', []), mods('set40_chrono'), cx);
  check(!r2.appliedModifiers.includes('set40_chrono_6m1') && r2.appliedModifiers.includes('set40_chrono_6r2'), '换成永恒一瞬 → 命定分支关、永恒护盾分支开（三选一互斥）');
  check(r2.effects.some(e => e.type === 'resetCooldown'), '通用：大招命中重置技能 1 / 绝技（6b）'); }
{ const w = mods('set40_warrior');
  const mortal = res.resolve(sk('heroic', 'basic', ['melee', 'mortal']), w, cx);
  const plain = res.resolve(sk('heroic', 'basic', ['melee']), w, cx);
  check(mortal.appliedModifiers.includes('set40_warrior_6m1') && !plain.appliedModifiers.includes('set40_warrior_6m1'), '战士：带 mortal 标签（致死打击）才挂「断潮·断首」');
  const ult = res.resolve(sk('avatar', 'ultimate', ['wall']), w, cx);
  check(ult.appliedModifiers.includes('set40_warrior_6p1') && ult.effects.some(e => e.type === 'shield'), '战士：盾墙（wall 标签）挂 15% 护盾'); }
{ const m = mods('set40_mage');
  const met = res.resolve(sk('meteor', 'ultimate', ['molten'], 'fire'), m, cx);
  check(met.appliedModifiers.includes('set40_mage_6f1') && met.effects.some(e => e.type === 'cdRefund'), '法师：熔火陨星（molten）缩绝技冷却');
  const ice = res.resolve(sk('frost_ring', 'skill3', ['aoe'], 'frost'), m, cx);
  check(!ice.appliedModifiers.some(id => id.startsWith('set40_mage_6i')), '法师：没 shatter 标签不挂碎星分支'); }
{ const a = mods('set40_alchemy');
  const r = res.resolve(sk('cauldron', 'ultimate', ['reagent_r']), a, cx);
  check(r.appliedModifiers.some(id => id.startsWith('set40_alchemy_6g')) || r.appliedModifiers.some(id => /6[a-z]\d/.test(id) && id.includes('alchemy')), '炼金：点沸腾之地 → 大招挂沸地分支：' + r.appliedModifiers.filter(i => i.includes('set40')).join(',')); }

// 11-05 掉落 + 保底
{ const drops: string[] = []; let cls = 'warrior', saves = 0;
  bindSets40({ classId: () => cls, dropFixed: (id: string) => { drops.push(id); return id; }, toast: () => {}, save: () => { saves++; } } as unknown as PackCtx);
  check(s40ForgeChance('normal', false) === 0 && s40ForgeChance('heroic', false) === 0.2 && s40ForgeChance('nightmare', true) === 0.65, '熔炉概率：普通 0、英雄 20%、噩梦尾王 65%');
  s40Load(null);
  const never = () => 0.999;   // 永远不中
  let n = 0; for (let i = 0; i < 42 && drops.length < 6; i++) { s40Roll(0.2, 0, 0, never); n++; }
  const uniq = new Set(drops);
  check(uniq.size === 6 && drops.every(d => S40_ITEMS.some(x => x.id === d)), `保底：一直不中也会在 ${n} 次内集齐 6 件（${drops.length} 件，${uniq.size} 种）`);
  check(n <= 42, '6 件最坏 42 次内集齐（规格 §8）');
  const sv = s40Save() as { pity: Record<string, { dry: number; seen: string[] }> };
  check(!!sv && sv.pity.set40_warrior.seen.length === 6, '保底存档写进 s40.pity.set40_warrior');
  cls = 'mage'; drops.length = 0; s40Roll(1, 0, 0, () => 0);
  check(drops.length === 1 && drops[0] !== undefined && (s40Save() as typeof sv).pity.set40_mage.seen.length === 1 && (s40Save() as typeof sv).pity.set40_warrior.seen.length === 6, '换职业 → 另一套独立保底，不影响战士那套');
  s40Load(JSON.parse(JSON.stringify(s40Save())));
  check(s40Debug().pity.set40_warrior.seen.length === 6 && s40Debug().pity.set40_mage.seen.length === 1, '存档读回一致');
  s40Load({ pity: { bogus: { dry: 3, seen: [] }, set40_mage: { dry: 'x', seen: ['nope', 5] } } });
  check(!s40Debug().pity.bogus && s40Debug().pity.set40_mage.dry === 0 && s40Debug().pity.set40_mage.seen.length === 0, '坏存档：未知套 / 非法字段丢弃');
  check(saves > 0, '每次掷完调 ctx.save()');
  bindSets40(null); }

console.log(`\n结果：${ok} 通过，${bad} 失败`);
process.exitCode = bad ? 1 : 0;
