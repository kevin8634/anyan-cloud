// 运行：npm run forge —— 商店购买、杂物自动出售（v0.5 C 取消装备出售）、装备强化 +1~+10、分解成材料、喝药水、存档往返（法师职业，掉落只出法杖/布甲/法师传说）
import { LootGenerator, QUALITY_NAME } from './core/Loot';
import { Inventory } from './core/Inventory';
import { Forge, Shop, upgradedName } from './core/Forge';
import { SaveManager, SaveStorage, SAVE_VERSION } from './core/SaveManager';
import { LOOT_DATA, LOOT_TABLES } from './data/loot';
import { FORGE_DATA } from './data/shop';

declare const process: { exitCode?: number };
let seed = 2024;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gen = new LootGenerator(LOOT_DATA, rng);
gen.classId = 'mage';
const inv = new Inventory(30, { hp: 0, armor: 0 });
const forge = new Forge(FORGE_DATA, inv, rng);
const shop = new Shop(FORGE_DATA, inv, gen);
const name = (id: string) => forge.stackDef(id)?.name ?? id;
const mats = () => Object.entries(inv.stacks).map(([k, v]) => `${name(k)}×${v}`).join(' ') || '无';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

// 1. 刷几次 Boss 攒装备、金币、材料
for (let i = 0; i < 6; i++) {
  const r = gen.roll(i < 3 ? LOOT_TABLES.boss_grok : LOOT_TABLES.boss_rotroot, 12);
  inv.addGold(r.gold); r.items.forEach(it => inv.add(it)); r.stacks.forEach(s => inv.addStack(s.id, s.count));
}
console.log(`刷本 6 次：金币 ${inv.gold}，装备 ${inv.bag.length} 件，材料 ${mats()}`);
check(inv.bag.every(it => it.baseId !== 'b_sword' && it.baseId !== 'b_axe'), '法师不会掉长剑/战斧底材');
check(inv.bag.filter(it => it.lgId).every(it => /lg_(frostfire|split_staff|ember_robe|astral_legs)/.test(it.lgId!)), '传说特效只出法师的（该部位有法师传说时）');

// 2. 商店
shop.restock(10);
console.log('商店货架：' + shop.offers.map(o => o.kind === 'stack' ? `${name(o.id)} ${o.price}金` : `[${QUALITY_NAME[o.item.quality]}]${o.item.name} ${o.price}金`).join('；'));
const g0 = inv.gold;
check(shop.buy(0, 3) && inv.stack('potion_s') === 3 && inv.gold === g0 - 45, '买 3 瓶治疗药水（-45 金）');
const gearIdx = shop.offers.findIndex(o => o.kind === 'gear');
const gearItem = shop.offers[gearIdx].kind === 'gear' ? (shop.offers[gearIdx] as { item: { id: string; name: string } }).item : null;
check(shop.buy(gearIdx) && !!gearItem && inv.bag.some(i => i.id === gearItem.id), `买装备 ${gearItem?.name}`);
// v0.5 C：装备不能出售；灰色杂物拜访商人时自动卖钱
check(!('sell' in shop), '商店没有出售装备的接口（v0.5 C 取消装备出售）');
inv.addStack('junk_fang', 5); inv.addStack('junk_ash', 2);
const g1 = inv.gold; const sold = forge.sellJunk();
check(sold.count === 7 && sold.gold === 5 * 2 + 2 * 14 && inv.gold === g1 + sold.gold && !inv.stack('junk_fang'), `杂物自动出售：${sold.count} 件 +${sold.gold} 金`);

// 3. 喝药
const heal = forge.usePotion('potion_s', 2000);
check(heal === 700 && inv.stack('potion_s') === 2, `喝治疗药水回复 ${heal}`);

// 4. 分解：把绿/蓝装分解成材料
const before = mats();
const got = forge.salvageBelow('blue');
console.log(`分解蓝色及以下：${got.map(g => `${name(g.id)}×${g.count}`).join(' ')}（分解前 ${before} → 现在 ${mats()}）`);
check(inv.bag.every(i => i.quality === 'purple' || i.quality === 'orange'), '背包只剩紫/橙');

// 5. 强化：拿一件紫装武器（没有就紫装）一路强化到 +10（材料不够就补给它）
const w = inv.bag.find(i => i.slot === 'oneHand' || i.slot === 'twoHand') ?? inv.bag[0];
inv.equip(w.id);
const hp0 = w.hp, mod0 = w.modifiers.length;
let attempts = 0;
while ((w.upgrade ?? 0) < 10 && attempts < 400) {
  attempts++;
  const why = forge.whyCannotUpgrade(w);
  if (why) {                                   // 模拟继续刷本：补材料和金币
    inv.addGold(800); inv.addStack('mat_dust', 6); inv.addStack('mat_shard', 4); inv.addStack('mat_essence', 2); inv.addStack('mat_proof', 1); inv.addStack('mat_badge', 1);
    continue;
  }
  const c = forge.cost(w)!;
  const r = forge.upgrade(w.id);
  console.log(`  强化 → +${c.toLevel}（${Math.round(c.chance * 100)}%，${c.gold}金 ${c.mats.map(m => `${name(m.id)}×${m.count}`).join(' ')}）：${r.ok ? '成功' : r.reason}，现在 ${upgradedName(w)}`);
}
check(w.upgrade === 10, `强化到 +10，共尝试 ${attempts} 次`);
check(w.modifiers.length === mod0 + (FORGE_DATA.perLevel.damage[w.slot] ? 1 : 0), '强化词条挂在装备上（伤害加成）');
console.log(`  ${w.name}：生命 ${hp0} → ${w.hp}；${w.modifiers.filter(m => m.id.endsWith(':upgrade')).map(m => m.desc).join('')}`);

// 6. 分解强化过的装备会返还更多
const wSlot = inv.slotOf(w)!;
inv.unequip(wSlot);
const pv = forge.salvagePreview(w);
console.log(`  分解 +10 ${w.name} 预计：${pv.map(p => `${name(p.id)}×${p.min}~${p.max}`).join(' ')}`);
check(!w.upgrade && inv.slotLv[wSlot] === 10, 'v0.6.2 部位强化：卸下后装备回到 +0，这一格保持 +10');

// 7. 存档往返（SaveManager v3：stacks + upgrade + 16 格穿戴）
const mem = new Map<string, string>();
const storage: SaveStorage = { get: k => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v), remove: k => void mem.delete(k) };
const sm = new SaveManager(storage, SaveManager.slotKey('save', 'mage'));
sm.save({ classId: 'mage', inventory: inv.save(), level: { level: 10, xp: 0 }, talents: {}, quests: { active: {}, done: [] } });
const back = sm.load()!;
const inv2 = new Inventory(30, { hp: 0, armor: 0 }); inv2.load(back.inventory);
check(back.version === SAVE_VERSION && back.classId === 'mage' && JSON.stringify(inv2.stacks) === JSON.stringify(inv.stacks) && inv2.slotLv[wSlot] === 10, `存档往返：职业/材料/部位强化等级一致（key=${SaveManager.slotKey('save', 'mage')}）`);
// 旧版 v1 存档迁移
storage.set('old', JSON.stringify({ version: 1, savedAt: 0, inventory: { gold: 5, bag: [], equipped: {} }, level: { level: 3, xp: 0 }, talents: {}, quests: { active: {}, done: [] } }));
const old = new SaveManager(storage, 'old').load()!;
check(old.version === SAVE_VERSION && old.classId === 'warrior' && !!old.inventory.stacks, 'v1 存档自动升级到最新版本（战士、空材料）');

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 商店 / 强化 / 分解 全部通过');
if (fails) process.exitCode = 1;
