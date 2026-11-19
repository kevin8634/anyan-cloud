// v0.9.1o 橙装 96 条第一步自检：npx tsc -p . && node dist/simLegend91.js
import { LootGenerator, ItemInstance } from './core/Loot';
import { LOOT_DATA, LEGENDARIES, LEGENDARIES_OLD, LEGENDARIES_PENDING } from './data/loot';
import { LG_V091 } from './data/legendary_v091_table';
declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const SET_SLOTS = ['head', 'shoulder', 'chest', 'hands', 'wrist', 'legs'];
const CLS = ['warrior', 'mage', 'chrono', 'alchemy'];
const PARTS: Record<string, string[]> = { 主手: ['oneHand', 'twoHand'], 副手: ['offHand'], 项链: ['neck'], 披风: ['back'], 腰带: ['waist'], 鞋子: ['feet'], 戒指: ['ring'], 饰品: ['trinket'] };

console.log('=== 设计表 ===');
check(LG_V091.length === 96 && new Set(LG_V091.map(e => e.id)).size === 96, '96 条，id 不重复');
for (const c of CLS) for (const [p, sl] of Object.entries(PARTS)) {
  const n = LG_V091.filter(e => e.cls === c && e.slots.some(s => sl.includes(s))).length;
  if (n !== 3) check(false, `${c} ${p}：${n} 件（应为 3）`);
}
check(true, '每职业每部位 3 件');
check(LG_V091.every(e => e.name.includes('·')), '名字都带专精前缀');
check(LG_V091.every(e => e.slots.every(s => !SET_SLOTS.includes(s))), '不出在套装 6 部位');
check(LEGENDARIES.length + LEGENDARIES_PENDING.length === 96, `本版可掉 ${LEGENDARIES.length} 件，待实现 ${LEGENDARIES_PENDING.length} 件`);
const bySkill = LEGENDARIES.filter(l => (l.modifier.match.skillIds ?? []).some(id => id !== '__none'));
check(bySkill.length === 0, `已实现的全部按槽位匹配（或纯钩子）${bySkill.length ? '：' + bySkill.map(l => l.name + ' ' + l.modifier.match.skillIds).join('、') : ''}`);

console.log('\n=== 掉落 ===');
for (const c of CLS) {
  const g = new LootGenerator(LOOT_DATA, Math.random); g.classId = c;
  const seen = new Set<string>(); let bad = 0;
  for (let i = 0; i < 3000; i++) { const it = g.generate(30, 'orange'); if (!it.lgId) bad++; else seen.add(it.lgId); if (SET_SLOTS.includes(it.slot)) bad++; }
  const pool = LEGENDARIES.filter(l => l.cls === c);
  check(bad === 0 && seen.size === pool.length, `${c}：3000 件橙装都有特效、不在套装部位，${pool.length} 种都能掉到`);
}

console.log('\n=== 老存档迁移 ===');
const g = new LootGenerator(LOOT_DATA, Math.random); g.classId = 'warrior';
const oldGen = new LootGenerator({ ...LOOT_DATA, legendaries: LEGENDARIES_OLD }, Math.random);
const oldItem = (cls: string, lgId: string, slot: string): ItemInstance | null => {
  oldGen.classId = cls;
  for (let i = 0; i < 3000; i++) { const it = oldGen.generate(30, 'orange', [slot as never]); if (it.lgId === lgId) return JSON.parse(JSON.stringify(it)); }
  return null;
};
const v = oldItem('warrior', 'lg_vampire', 'chest');
if (v) { g.refreshEffects(v); check(v.quality === 'purple' && !v.lgId && !v.lines.some(l => l.startsWith('★')) && !v.modifiers.some(m => m.id.includes('lg_vampire')), `饮血者胸甲 → 紫装「${v.name}」，特效删除`); }
const k = oldItem('chrono', 'lg_keeper_hood', 'head');
if (k) { g.refreshEffects(k); check(k.quality === 'purple' && !k.lgId, `头部守时者兜帽 → 紫装「${k.name}」`); }
const q = oldItem('warrior', 'lg_quake_boots', 'feet');
if (q) { g.refreshEffects(q); check(q.quality === 'orange' && q.lgId === 'lg_w_quakeboots' && q.name === '处决·震地战靴' && q.lines.filter(l => l.startsWith('★')).length === 1, `鞋子裂地者 → ${q.name}：${q.lines.find(l => l.startsWith('★'))}`); }
const ql = oldItem('warrior', 'lg_quake_boots', 'legs');
if (ql) { g.refreshEffects(ql); check(ql.quality === 'purple' && !ql.lgId, `腿部裂地者 → 紫装「${ql.name}」`); }
const e = oldItem('warrior', 'lg_x_echoring', 'ring');
if (e) { g.refreshEffects(e); check(e.quality === 'orange' && e.name === '处决·回响指环' && e.modifiers.filter(m => m.id.includes('lg_x_echoring')).every(m => m.cls === 'warrior'), `回响指环 → ${e.name}（只留战士特效）`); }
const again = e && !g.refreshEffects(e);
check(!!again, '再刷新一次没有变化');
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 橙装 96（第一步）全部通过');
if (fails) process.exitCode = 1;
