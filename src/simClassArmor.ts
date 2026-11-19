// v0.9.2e 职业装备限定：随机装备 / 固定装备（套装、副本小套、暗金）的护甲类型都必须是本职业的
import { LootGenerator } from './core/Loot';
import { LOOT_DATA } from './data/loot';
import { CLASSES } from './data/classes';
const AS = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];
let fail = 0;
for (const c of Object.values(CLASSES)) {
  const g = new LootGenerator(LOOT_DATA, Math.random); g.classId = c.id; const want = c.equip.armorType;
  let bad = 0;
  for (let i = 0; i < 3000; i++) { const it = g.generate(30, (['white', 'green', 'blue', 'purple', 'orange'] as const)[i % 5]); if (AS.includes(it.slot) && it.armorType && it.armorType !== want) bad++; }
  for (const f of LOOT_DATA.fixedItems) { const it = g.generateFixed(f.id, 30); if (it && AS.includes(it.slot) && it.armorType && it.armorType !== want) bad++; }
  console.log(`${bad ? '❌' : '✅'} ${c.name}（${want}）不合职业的护甲：${bad}`); if (bad) fail++;
}
console.log(fail ? `❌ ${fail} 项失败` : '✅ 职业装备限定 全部通过');
