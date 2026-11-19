// 运行：npm run sync —— v0.5 A（账号 B）留下来的部分：耐久度与修理、存档 v5→v6 迁移、噩梦 Boss 新机制。
// 主线 v0.6.6：B 的等级同步曲线 / 四档难度 / 每周词缀 / 副本掉落规则（core/Scaling.ts）由 A 的 dungeonplus 取代，对应测试退役；
//   A 的普通副本四难度由 node test/playtest.mjs p64 / p65a~c 覆盖
import { CLASSES } from './data/classes';
import { BOSS_GROK, GROK_NIGHTMARE } from './data/dungeon_darkrock';
import { BOSS_ROTROOT, ROTROOT_NIGHTMARE } from './data/dungeon_swamp';
import { applyNightmareMechanic } from './data/dungeon_plus';
import { LOOT_DATA } from './data/loot';
import { LootGenerator, ItemSlot } from './core/Loot';
import { Inventory } from './core/Inventory';
import { SaveManager, SaveStorage, SAVE_VERSION } from './core/SaveManager';
import { DUR_MAX, durOf, isBroken, repairCost, repairAllCost } from './core/Durability';

declare const process: { argv: string[]; exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

console.log('\n== 1. 耐久度与修理 ==');
{
  const gen = new LootGenerator(LOOT_DATA, seeded(5)); gen.classId = 'warrior';
  const inv = new Inventory(60, { hp: 0, armor: 0 }); inv.rules = CLASSES.warrior.equip;
  const fresh = gen.generate(10, 'blue');
  check(fresh.durability === DUR_MAX && durOf({ ...fresh, durability: undefined }) === DUR_MAX, '新装备耐久 100；没有字段（老装备）按 100');
  const slots: ItemSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring', 'ring', 'trinket', 'trinket', 'twoHand'];
  for (const sl of slots) { const it = gen.generate(32, 'purple', [sl]); inv.add(it); inv.equip(it.id); }
  check(inv.equippedItems().length === 15, '一身 15 件紫装（双手武器）');
  const full = inv.stats(), mods = inv.activeItems().flatMap(i => i.modifiers).length;
  inv.deathLoss();
  check(inv.equippedItems().every(i => i.durability === 90) && JSON.stringify(inv.stats()) === JSON.stringify(full), '阵亡一次：每件 -10（90），属性不变');
  const c1 = inv.repairAllCost();
  for (let i = 0; i < 9; i++) inv.deathLoss();
  check(inv.equippedItems().every(isBroken) && inv.equippedItems().length === 15 && inv.bag.length === 0, '阵亡 10 次：全部「已损坏」，但装备没有消失');
  const broken = inv.stats();
  check(broken.hp === 0 && broken.armor === 0 && broken.power === 0 && inv.activeItems().length === 0, `已损坏装备的属性全部失效（生命 ${full.hp} → ${broken.hp}，强度 ${full.power} → ${broken.power}，词条/套装/传说 ${mods} 个 → 0）`);
  const cAll = inv.repairAllCost();
  check(cAll >= 300 && cAll <= 450, `30 级紫装整套从 0 修满 ${cAll} 金（目标 ≈ 2~3 瓶药水 ×10 = 300~450）；阵亡一次修理 ${c1} 金`);
  const per = repairCost(inv.equipped.chest!);
  check(per === Math.ceil(100 * (0.04 + 0.005 * 32) * 1.25), `单件公式：缺失 100 × (0.04 + 0.005×装等32) × 紫 1.25 = ${per}`);
  inv.gold = cAll - 1;
  check(inv.repairAll() === 0 && inv.gold === cAll - 1 && inv.equippedItems().every(isBroken), '金币不够：全部修理不执行，不扣钱');
  const chest = inv.equipped.chest!;
  check(inv.repair(chest.id) === per && chest.durability === DUR_MAX && inv.stats().hp > 0 && inv.gold === cAll - 1 - per, `单件修理：扣 ${per} 金，胸甲恢复属性`);
  inv.gold += 1000;
  const paid = inv.repairAll();
  check(paid === cAll - per && inv.equippedItems().every(i => durOf(i) === DUR_MAX) && JSON.stringify(inv.stats()) === JSON.stringify(full), `全部修理：扣 ${paid} 金，属性完全恢复`);
  const low = gen.generate(12, 'blue'); low.durability = 90;
  check(repairCost(low) >= 1 && repairCost(low) <= 2, `10 级蓝装阵亡一次单件修理 ${repairCost(low)} 金（整套约 ${repairCost(low) * 16} 金）`);
  check(repairAllCost([]) === 0, '没有要修的装备：0 金');
  // 对比：已损坏的旧装备属性按 0 算
  const helm = inv.equipped.head!; helm.durability = 0;
  const newHelm = gen.generate(10, 'green', ['head']); inv.add(newHelm);
  check(inv.compare(newHelm).hp === newHelm.hp, '对比装备时，已损坏的旧装备属性按 0 计算');
}

// =====================================================================
console.log('\n== 2. 存档 v5 → v6+ 迁移（耐久） ==');
{
  const m = new Map<string, string>(); const st: SaveStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
  const it = (id: string): object => ({ id, baseId: 'b_helm', name: '铁盔', slot: 'head', quality: 'blue', itemLevel: 10, hp: 50, armor: 20, modifiers: [], lines: [], sellPrice: 10, armorType: 'plate' });
  const v5 = { version: 5, savedAt: 5, classId: 'warrior', inventory: { gold: 55, bag: [it('b1')], equipped: { head: it('e1') }, stacks: {} }, level: { level: 14, xp: 3 }, talents: {}, quests: { active: {}, done: ['q_mine'] }, bank: [it('k1')], playMs: 1, codex: [], look: 0, elite: 0 };
  m.set('s', JSON.stringify(v5));
  const r = new SaveManager(st, 's', LOOT_DATA).loadResult();
  const s = r.save!;
  check(r.status === 'ok' && s.version === SAVE_VERSION && SAVE_VERSION >= 6, `v5 存档升级到 v${s.version}`);
  check(s.inventory.equipped.head!.durability === 100 && s.inventory.bag[0].durability === 100 && s.bank![0].durability === 100, '老装备（身上、背包、旧仓库）耐久补成 100');
  check(JSON.stringify(s.dungeonBest) === '{}' && s.inventory.gold === 55 && s.level.level === 14, '副本最高难度记录为空，其余数据不变');
  const sm = new SaveManager(st, 's2', LOOT_DATA);
  sm.save({ ...s, dungeonBest: { darkrock_mine: 3 } } as never);
  const back = sm.loadResult().save!;
  check(back.dungeonBest?.darkrock_mine === 3, 'v0.5.0-c 的副本最高难度记录：存档往返不丢（v0.6.6 起只读）');
}

console.log('\n== 3. 噩梦 Boss 新机制（并入 A 的噩梦难度） ==');
for (const [b, m] of [[BOSS_GROK, GROK_NIGHTMARE], [BOSS_ROTROOT, ROTROOT_NIGHTMARE]] as const) {
  const out = applyNightmareMechanic(b, m);
  check(out.abilities.some(a => a.id === m.ability.id) && out.phases.every(p => p.abilities.includes(m.ability.id)) && !b.abilities.some(a => a.id === m.ability.id), `${b.name}：噩梦多一个「${m.ability.name}」，加进所有阶段，原定义不变`);
}

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
if (fails) process.exitCode = 1;
