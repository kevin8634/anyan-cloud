// 运行：node dist/simDungeonLoot.js —— v0.9.3h 副本专属掉落校验
//   ① 每个副本：每个首领独立 3 件 + 共享池 + 最终首领传说；名字不重复 ② 专属件只在副本表里（野外 / 世界首领 / 深渊表不含）
//   ③ 特效去重：副本件的「效果 + 匹配 + 条件」不和野外精英件 / 世界首领专属件相同；方案里列的 4 处重复已改
//   ④ 四个职业都能掉、底材换成本职业 ⑤ 掉率模拟：每个首领每件 20%、共享 6%、最终传说 10%
import { LootGenerator } from './core/Loot';
import { LOOT_DATA, LOOT_TABLES } from './data/loot';
import { DUNGEON_ITEMS, DL_BOSSES, DL_IDS, DL_TABLES, dlTableId } from './data/dungeon_loot';
import { ELITE_ITEMS } from './data/elite_gear';
import { WB_ITEMS } from './data/world_bosses';
import { DUNGEON_SET_ITEMS, DUNGEON_SETS } from './data/dungeon_new';
import type { ModifierDef } from './core/types';

declare const process: { exitCode?: number };
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };

console.log('== ① 数量 ==');
let total = 0;
for (const d of DL_IDS) {
  const items = DUNGEON_ITEMS.filter(x => x.dungeon === d), n = DL_BOSSES[d];
  const perBoss = Array.from({ length: n }, (_, i) => items.filter(x => x.boss === i).length);
  const shared = items.filter(x => x.boss === 'shared').length, lg = items.filter(x => x.boss === 'final');
  total += items.length;
  check(perBoss.every(c => c === 3) && shared >= 2 && lg.length === 1 && lg[0].quality === 'orange', `${d}：${n} 个首领 × 3（${perBoss.join('/')}）+ 共享 ${shared} + 传说 ${lg.length} = ${items.length} 件`);
}
const names = DUNGEON_ITEMS.map(x => x.name), ids = DUNGEON_ITEMS.map(x => x.id);
check(new Set(names).size === names.length && new Set(ids).size === ids.length, `共 ${total} 件新命名物品，名字 / id 不重复`);
const allFixed = LOOT_DATA.fixedItems.map(f => f.name);
check(DUNGEON_ITEMS.every(x => allFixed.filter(n => n === x.name).length === 1), '和已有固定装备（套装 / 精英 / 暗金 / 世界首领）不重名');

console.log('== ② 只在副本掉 ==');
const tablesWith = (id: string) => Object.entries(LOOT_TABLES).filter(([, t]) => t.entries.some(e => e.kind === 'fixed' && e.itemId === id)).map(([k]) => k);
const bad = DUNGEON_ITEMS.filter(x => tablesWith(x.id).some(k => !k.startsWith('dl_') && k !== 'boss_grok' && k !== 'boss_rotroot' && k !== 'boss_foreman'));
check(bad.length === 0, `专属件只出现在副本首领表里${bad.length ? '：' + bad.map(b => b.name).join('、') : ''}`);
check(DUNGEON_ITEMS.every(x => tablesWith(x.id).length >= 1), '每件都有表能掉');
check(!['dg_boss', 'dg_final', 'raid_boss', 'raid_final'].some(k => LOOT_TABLES[k].entries.some(e => e.kind === 'fixed' && e.itemId.startsWith('dl_'))), '深渊 / 宝箱用的通用表不含专属件');
for (const d of ['sand_tomb', 'troll_cave', 'ash_forge', 'molten_throne', 'frost_crypt']) for (let i = 0; i < DL_BOSSES[d as keyof typeof DL_BOSSES]; i++) if (!LOOT_TABLES[dlTableId(d, i)]) check(false, `缺表 ${dlTableId(d, i)}`);
check(!!LOOT_TABLES['dl_sand_tomb_hidden'] && !!LOOT_TABLES['dl_troll_cave_hidden'] && !!LOOT_TABLES['dl_ash_forge_hidden'], '三座 30 级副本隐藏首领有表');

console.log('== ③ 特效去重 ==');
const key = (m: ModifierDef) => JSON.stringify([m.match ?? {}, m.conditions ?? [], m.ops.map(o => o.op === 'addEffect' ? ['fx', o.effect.type, Object.keys(o.effect).sort().join()] : [o.op, (o as { stat?: string }).stat])]);
const wildKeys = new Map<string, string>();
for (const it of [...ELITE_ITEMS, ...WB_ITEMS] as { name: string; modifiers: ModifierDef[] }[]) for (const m of it.modifiers) wildKeys.set(key(m), it.name);
const dups: string[] = [];
for (const it of [...DUNGEON_ITEMS, ...DUNGEON_SET_ITEMS]) for (const m of it.modifiers) if (!m.cls && wildKeys.has(key(m))) dups.push(`${it.name}「${m.desc}」= ${wildKeys.get(key(m))}`);
for (const s of DUNGEON_SETS) if (s.modifier && wildKeys.has(key(s.modifier))) dups.push(`${s.modifier.name} = ${wildKeys.get(key(s.modifier))}`);
check(dups.length === 0, `副本件 / 副本小套特效和野外件不重复${dups.length ? '：' + dups.join('；') : ''}`);
const fixedDesc = (id: string) => DUNGEON_SET_ITEMS.find(x => x.id === id)!.modifiers[0].desc;
check(!/流沙（3 秒/.test(fixedDesc('h_warden_mask')) && !/爆炸/.test(fixedDesc('h_statue_ring')) && !/减速/.test(fixedDesc('h_heart_shard')), `隐藏首领件改成副本主题：${fixedDesc('h_warden_mask')} / ${fixedDesc('h_statue_ring')} / ${fixedDesc('h_heart_shard')}`);
check(/溢出转为护盾/.test(DUNGEON_SETS.find(s => s.modifier?.id === 'set_troll_2')!.modifier!.desc), '巨魔之血(2件)改为吸血 + 溢出护盾');

console.log('== ④ 四个职业 ==');
let seed = 7; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gen = new LootGenerator(LOOT_DATA, rng);
const CLS: Record<string, string> = { warrior: 'warrior', mage: 'mage', chrono: 'chrono', alchemy: 'alchemy' };
for (const c of Object.keys(CLS)) {
  gen.classId = c;
  const ok = DUNGEON_ITEMS.every(x => { const it = gen.generateFixed(x.id, 40); if (!it) return false; const b = LOOT_DATA.bases.find(bb => bb.id === it.baseId)!; return !b.cls || b.cls === c; });
  const t = gen.roll(LOOT_TABLES.dl_molten_throne_4, 50);
  check(ok, `${c}：${DUNGEON_ITEMS.length} 件全能生成且底材是本职业（一次熔心君王掉 ${t.items.length} 件：${t.items.map(i => i.name).join('、')}）`);
}

console.log('== ⑤ 掉率模拟 ==');
gen.classId = 'warrior';
const N = 4000;
for (const tid of ['dl_sand_tomb_0', 'dl_sand_tomb_2', 'dl_frost_crypt_4', 'boss_grok']) {
  const cnt: Record<string, number> = {}; let rnd = 0;
  for (let k = 0; k < N; k++) for (const it of gen.roll(LOOT_TABLES[tid], 40).items) { if (it.fixedId) cnt[it.fixedId] = (cnt[it.fixedId] ?? 0) + 1; else rnd++; }
  const own = DUNGEON_ITEMS.filter(x => LOOT_TABLES[tid].entries.some(e => e.kind === 'fixed' && e.itemId === x.id));
  const rate = (b: string | number) => own.filter(x => x.boss === b).map(x => (cnt[x.id] ?? 0) / N);
  const ob = rate(own.find(x => typeof x.boss === 'number')?.boss ?? 0), sh = rate('shared'), fn = rate('final');
  const ok = ob.every(r => Math.abs(r - 0.2) < 0.03) && sh.every(r => Math.abs(r - 0.06) < 0.02) && fn.every(r => Math.abs(r - 0.1) < 0.025);
  check(ok, `${tid}：专属 ${ob.map(r => (r * 100).toFixed(0) + '%').join('/')} · 共享 ${sh.map(r => (r * 100).toFixed(0) + '%').join('/')}${fn.length ? ` · 传说 ${(fn[0] * 100).toFixed(1)}%` : ''} · 随机填充 ${(rnd / N).toFixed(2)} 件/次`);
}
console.log(`专属表 ${Object.keys(DL_TABLES).length} 张`);

console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
if (failed) process.exitCode = 1;
