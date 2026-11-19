// 运行：npm run loot —— 刷 5 次副本，看掉落、穿装备、技能变化、存档
import { LootGenerator, QUALITY_NAME, ItemInstance } from './core/Loot';
import { Inventory, SLOT_NAME, EQUIP_SLOTS } from './core/Inventory';
import { Loadout } from './core/Loadout';
import { SKILLS, TALENTS, SET_BONUSES, COMBOS } from './data/warrior';
import { LOOT_DATA, LOOT_TABLES } from './data/loot';

let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gen = new LootGenerator(LOOT_DATA, rng);
const bag = new Inventory(30);
const loadout = new Loadout({ execute: () => {} });
loadout.equipSkill(SKILLS.slash, 'basic');
loadout.equipSkill(SKILLS.charge, 'skill1');
loadout.equipSkill(SKILLS.whirlwind, 'skill2');
loadout.equipSkill(SKILLS.thunderclap, 'skill3');
loadout.equipSkill(SKILLS.avatar, 'ultimate');
loadout.setTalents([TALENTS[0]]);
loadout.setSetBonuses(SET_BONUSES);
loadout.setComboModifiers(COMBOS);
bag.onChange = () => loadout.setItems(bag.equippedItems());   // 穿脱装备立即改变技能

const show = (it: ItemInstance) =>
  `[${QUALITY_NAME[it.quality]}] ${it.name}（${SLOT_NAME[it.slot]} 装等${it.itemLevel}${it.hp ? ` 生命${it.hp}` : ''}${it.armor ? ` 护甲${it.armor}` : ''}）${it.lines.length ? '：' + it.lines.join('；') : ''}`;
const skillLine = () => (['basic', 'skill1', 'skill2', 'skill3', 'ultimate'] as const).map(s => {
  const r = loadout.preview(s, { now: 0, casterHpPercent: 1, targetEffects: [] })!;
  return `${r.displayName} ${Math.round(r.stats.damage)}伤/${r.stats.cooldown.toFixed(1)}秒`;
}).join(' | ');

console.log('== 穿装备前 ==');
console.log(skillLine());

for (let run = 1; run <= 5; run++) {
  const drops: ItemInstance[] = [];
  let gold = 0;
  for (let i = 0; i < 5; i++) { const r = gen.roll(LOOT_TABLES.trash, 10); gold += r.gold; drops.push(...r.items); }
  const b = gen.roll(LOOT_TABLES.boss_grok, 12); gold += b.gold; drops.push(...b.items);
  drops.forEach(d => bag.add(d));
  bag.addGold(gold);
  console.log(`\n== 第 ${run} 次通关：${gold} 金币，${drops.length} 件装备 ==`);
  drops.forEach(d => console.log('  ' + show(d)));
}

// 给演示保底一件传说
const lg = gen.generate(12, 'orange', ['chest']);
bag.add(lg);
console.log(`\n== 额外掉落 ==\n  ${show(lg)}`);

// 自动穿戴：每个部位挑 品质 > 装等 最高的
const order = ['white', 'green', 'blue', 'purple', 'orange'];
for (const slot of EQUIP_SLOTS) {
  if (bag.equipped[slot]) continue;
  const best = bag.bag.filter(i => bag.slotsFor(i).includes(slot))
    .sort((a, b) => order.indexOf(b.quality) - order.indexOf(a.quality) || b.itemLevel - a.itemLevel)[0];
  if (best) { const c = bag.compare(best); bag.equip(best.id, slot); console.log(`穿上 ${best.name}（生命${c.hp >= 0 ? '+' : ''}${c.hp} 护甲${c.armor >= 0 ? '+' : ''}${c.armor}）`); }
}
const sold = bag.sellBelow('blue');
console.log(`一键出售蓝色及以下：+${sold} 金币，背包剩 ${bag.bag.length} 件，金币 ${bag.gold}`);

console.log('\n== 穿装备后 ==');
console.log(`角色：生命 ${bag.stats().hp}，护甲 ${bag.stats().armor}（物理减伤 ${Math.round(bag.stats().armor / (bag.stats().armor + 400) * 100)}%）`);
console.log(skillLine());

// 存档往返
const json = JSON.stringify(bag.save());
const bag2 = new Inventory(30);
bag2.load(JSON.parse(json));
console.log(`\n存档 ${json.length} 字节，读档后 金币${bag2.gold} 背包${bag2.bag.length}件 穿戴${bag2.equippedItems().length}件 ${bag2.stats().hp === bag.stats().hp ? '✓ 一致' : '✗ 不一致'}`);
