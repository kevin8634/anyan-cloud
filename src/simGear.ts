// 运行：npm run gear —— 16 格穿戴：部位/护甲类型/武器限制、双手 vs 单手+副手、双持、戒指/饰品选格、属性汇总、平均装等、强化/分解、v2→v3 存档迁移
import { LootGenerator, ItemInstance, ItemSlot, Quality, bonusText } from './core/Loot';
import { Inventory, EQUIP_SLOTS, EQUIP_SLOT_NAME, SLOT_NAME, EquipSlot } from './core/Inventory';
import { Forge, Shop } from './core/Forge';
import { SaveManager, SaveStorage, SAVE_VERSION } from './core/SaveManager';
import { LOOT_DATA } from './data/loot';
import { FORGE_DATA } from './data/shop';
import { CLASSES } from './data/classes';

declare const process: { exitCode?: number };
let seed = 777;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const gen = new LootGenerator(LOOT_DATA, rng);
/** 指定底材生成（测试用） */
const make = (baseId: string, ilvl = 10, q: Quality = 'blue'): ItemInstance => {
  const base = LOOT_DATA.bases.find(b => b.id === baseId)!;
  gen.classId = base.cls;
  let it: ItemInstance;
  do { it = gen.generate(ilvl, q, [base.slot]); } while (it.baseId !== baseId);
  return it;
};
const show = (it: ItemInstance, cls = 'warrior') => `${it.name}[${SLOT_NAME[it.slot]}${it.weaponType ? '·' + it.weaponType : ''}${it.armorType ? '·' + it.armorType : ''}] 生命${it.hp} 护甲${it.armor}${Object.entries(it.bonus ?? {}).map(([k, v]) => ' ' + bonusText(k as 'power', v!, cls)).join('')}`;

// ---------- 1. 底材覆盖所有部位 ----------
console.log('== 1. 底材 ==');
const ALL: ItemSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring', 'trinket', 'oneHand', 'twoHand', 'offHand'];
for (const cls of ['warrior', 'mage'] as const) {
  gen.classId = cls;
  const missing = ALL.filter(s => !LOOT_DATA.bases.some(b => b.slot === s && (!b.cls || b.cls === cls)));
  check(!missing.length, `${CLASSES[cls].name}：15 类部位都有底材${missing.length ? '，缺 ' + missing.join(',') : ''}`);
  const drops = Array.from({ length: 300 }, () => gen.generate(8, 'green'));
  const armorTypes = new Set(drops.filter(d => d.armorType).map(d => d.armorType));
  const wtypes = new Set(drops.filter(d => d.weaponType).map(d => d.weaponType));
  check(armorTypes.size === 1 && armorTypes.has(CLASSES[cls].equip.armorType!), `${CLASSES[cls].name} 掉落护甲只有 ${[...armorTypes].join(',')}`);
  check([...wtypes].every(w => CLASSES[cls].equip.weapons!.includes(w!)), `${CLASSES[cls].name} 掉落武器类型：${[...wtypes].join(',')}`);
}
const gs = make('b_greatsword'), sw = make('b_sword');
console.log('  ' + show(gs)); console.log('  ' + show(sw));
check((gs.bonus?.power ?? 0) > (sw.bonus?.power ?? 0) * 1.8, `双手巨剑强度 ${gs.bonus?.power} ≈ 单手 ${sw.bonus?.power} ×2`);

// ---------- 2. 战士：职业限制 ----------
console.log('\n== 2. 职业限制 ==');
const war = new Inventory(30, { hp: 0, armor: 0 });
war.rules = CLASSES.warrior.equip;
const robe = make('b_robe'), staff = make('b_staff'), helm = make('b_helm'), cloak = make('b_cloak');
[robe, staff, helm, cloak].forEach(i => war.add(i));
check(!war.equip(robe.id) && war.lastError.includes('重甲'), `战士穿不了布甲：${war.lastError}`);
check(!war.equip(staff.id) && war.bag.includes(staff), `战士用不了法杖：${war.lastError}`);
check(war.equip(helm.id) && war.equipped.head === helm, '战士穿上重甲头盔');
check(war.equip(cloak.id) && war.equipped.back === cloak, '披风通用');

// ---------- 3. 战士：单手 + 盾 → 双手 → 盾 ----------
console.log('\n== 3. 单手+副手 / 双手 ==');
const shield = make('b_shield'), axe = make('b_axe'), gaxe = make('b_greataxe');
[sw, shield, axe, gs, gaxe].forEach(i => war.add(i));
check(war.equip(sw.id) && war.equipped.mainHand === sw, '长剑 → 主手');
check(war.equip(shield.id) && war.equipped.offHand === shield, '盾牌 → 副手');
const cmp = war.compare(gs);
check(cmp.replacesAll.length === 2 && cmp.target === 'mainHand', `双手巨剑对比的是 主手+副手（强度 ${cmp.power >= 0 ? '+' : ''}${cmp.power}，护甲 ${cmp.armor}）`);
const bag0 = war.bag.length;
check(war.equip(gs.id) && war.equipped.mainHand === gs && !war.equipped.offHand && war.bag.includes(sw) && war.bag.includes(shield) && war.bag.length === bag0 + 1,
  '穿双手巨剑：长剑和盾牌都回到背包');
check(war.equip(shield.id) && war.equipped.offHand === shield && !war.equipped.mainHand && war.bag.includes(gs), '双手在身时穿盾牌：卸下双手武器');
war.equip(sw.id);   // 长剑回主手（盾牌仍在副手）
// 双持：主手有剑、副手空 → 第二把单手进副手
war.unequip('offHand');
const r2 = war.tryEquip(axe.id);
check(r2.ok && r2.slot === 'offHand' && war.equipped.offHand === axe, `双持：第二把单手武器自动进副手（${r2.ok ? EQUIP_SLOT_NAME[r2.slot] : ''}）`);
const r3 = war.tryEquip(gaxe.id);
check(r3.ok && war.equipped.mainHand === gaxe && !war.equipped.offHand, '双持状态穿双手巨斧：两把单手都回背包');
// 背包满：穿单手到副手需要卸双手 → 可以（1 换 1）；双手换下单手+副手需要多 1 格
war.unequip('mainHand');
war.equip(sw.id, 'mainHand'); war.equip(shield.id, 'offHand');
while (!war.isFull) war.add(make('b_ring', 1, 'green'));
const before = JSON.stringify(war.save());
const r4 = war.tryEquip(gs.id);
check(!r4.ok && JSON.stringify(war.save()) === before, `背包满时穿双手失败且不丢东西：${!r4.ok ? r4.reason : ''}`);
war.sell(war.bag[war.bag.length - 1].id);
check(war.equip(gs.id) && war.isFull && war.bag.includes(shield) && war.bag.includes(sw), '腾出 1 格后可以穿双手（背包刚好满）');
war.bag.filter(i => i.baseId === 'b_ring').forEach(i => war.sell(i.id));

// ---------- 4. 法师：法杖 / 魔杖 + 典籍 ----------
console.log('\n== 4. 法师武器 ==');
const mag = new Inventory(30, { hp: 0, armor: 0 });
mag.rules = CLASSES.mage.equip;
const st = make('b_staff'), wand = make('b_wand'), dag = make('b_dagger'), tome = make('b_tome'), orb = make('b_orb'), mace = make('b_mace');
[st, wand, dag, tome, orb, mace].forEach(i => mag.add(i));
console.log('  ' + show(st, 'mage')); console.log('  ' + show(wand, 'mage')); console.log('  ' + show(tome, 'mage'));
check(!mag.equip(mace.id), `法师不能用战锤：${mag.lastError}`);
check(mag.equip(st.id) && mag.equipped.mainHand === st, '法杖 → 主手（双手）');
check(mag.equip(tome.id) && mag.equipped.offHand === tome && !mag.equipped.mainHand && mag.bag.includes(st), '穿典籍：卸下法杖');
check(mag.equip(wand.id) && mag.equipped.mainHand === wand && mag.equipped.offHand === tome, '魔杖 + 典籍');
const r5 = mag.tryEquip(dag.id);
check(r5.ok && r5.slot === 'mainHand' && mag.equipped.offHand === tome && mag.bag.includes(wand), '法师不能双持：匕首替换主手魔杖');
check(!mag.equip(dag.id, 'offHand'), '法师的单手武器不能进副手');
check(mag.equip(orb.id) && mag.equipped.offHand === orb && mag.bag.includes(tome), '法球替换典籍');
check(mag.equip(st.id) && mag.bag.includes(orb) && mag.bag.includes(dag), '再穿法杖：匕首和法球都回背包');

// ---------- 5. 戒指 / 饰品 ----------
console.log('\n== 5. 戒指 / 饰品 ==');
const rings = [make('b_ring'), make('b_signet'), make('b_ring'), make('b_signet')];
const trs = [make('b_idol'), make('b_idol'), make('b_idol')];
[...rings, ...trs].forEach(i => war.add(i));
war.equip(rings[0].id); war.equip(rings[1].id);
check(war.equipped.ring1 === rings[0] && war.equipped.ring2 === rings[1], '两枚戒指分别进 戒指1 / 戒指2');
war.equip(rings[2].id);
check(war.equipped.ring1 === rings[2] && war.equipped.ring2 === rings[1] && war.bag.includes(rings[0]), '两格都满：默认替换 戒指1');
war.equip(rings[3].id, 'ring2');
check(war.equipped.ring2 === rings[3] && war.bag.includes(rings[1]), '指定格子：替换 戒指2');
war.unequip('ring1'); war.equip(rings[0].id);
check(war.equipped.ring1 === rings[0], '戒指1 空出后新戒指优先进空格');
trs.forEach(t => war.equip(t.id));
check(war.equipped.trinket1 === trs[2] && war.equipped.trinket2 === trs[1], '饰品：空格优先，满了替换 饰品1');
check(!war.equip(trs[0].id, 'ring1' as EquipSlot), '饰品不能放进戒指格');

// ---------- 6. 全身 16 格 + 属性 / 平均装等 ----------
console.log('\n== 6. 全身装备 ==');
const full = new Inventory(40, { hp: 0, armor: 0 });
full.rules = CLASSES.warrior.equip;
gen.classId = 'warrior';
const slotCat: Record<EquipSlot, ItemSlot> = { head: 'head', neck: 'neck', shoulder: 'shoulder', back: 'back', chest: 'chest', wrist: 'wrist', hands: 'hands', waist: 'waist', legs: 'legs', feet: 'feet', ring1: 'ring', ring2: 'ring', trinket1: 'trinket', trinket2: 'trinket', mainHand: 'oneHand', offHand: 'offHand' };
for (const s of EQUIP_SLOTS) { const it = gen.generate(12, 'purple', [slotCat[s]]); full.add(it); full.equip(it.id, s); }
check(EQUIP_SLOTS.every(s => !!full.equipped[s]), `16 格全部穿满：${EQUIP_SLOTS.map(s => EQUIP_SLOT_NAME[s]).join(' ')}`);
const st1 = full.stats();
console.log(`  属性：生命 ${st1.hp} 护甲 ${st1.armor} 攻击强度 ${st1.power} 暴击 ${st1.crit}% 暴伤 ${st1.critDmg}% 急速 ${st1.haste}% 移速 ${st1.speed}% 平均装等 ${full.averageItemLevel()}`);
check(st1.hp > 0 && st1.armor > 0 && st1.power > 0 && full.averageItemLevel() === 12, '属性汇总正确，平均装等 12');
const twoH = gen.generate(20, 'blue', ['twoHand']); full.add(twoH); full.equip(twoH.id);
check(full.averageItemLevel() === Math.round((12 * 14 + 20 * 2) / 16 * 10) / 10, `双手武器同时算副手：平均装等 ${full.averageItemLevel()}`);

// ---------- 7. 强化 / 分解 ----------
console.log('\n== 7. 强化 / 分解 / 商店 ==');
const fInv = new Inventory(30, { hp: 0, armor: 0 });
const forge = new Forge(FORGE_DATA, fInv, rng);
const a1 = make('b_sword', 10, 'blue'), a2 = make('b_greatsword', 10, 'blue');
check(forge.cost(a2)!.gold > forge.cost(a1)!.gold, `双手武器强化更贵：${forge.cost(a2)!.gold} > ${forge.cost(a1)!.gold} 金`);
const dust = (it: ItemInstance) => forge.salvagePreview(it).find(p => p.id === 'mat_dust')?.max ?? 0;
check(dust(a2) > dust(a1), `双手武器分解多给魔尘：${dust(a2)} > ${dust(a1)}`);
fInv.addGold(9999); fInv.addStack('mat_dust', 50);
fInv.add(a2); fInv.equip(a2.id);
for (let i = 0; i < 3; i++) forge.upgrade(a2.id);
check((a2.upgrade ?? 0) === 3 && a2.modifiers.some(m => m.id.endsWith(':upgrade') && m.desc.includes('10.5%')), `双手武器 +3：${a2.modifiers.find(m => m.id.endsWith(':upgrade'))?.desc}`);
gen.classId = 'mage';
const shop = new Shop(FORGE_DATA, fInv, gen);
shop.restock(6);
const gear = shop.offers.filter(o => o.kind === 'gear').map(o => o.kind === 'gear' ? o.item : null)!;
check(gear.length === 11 && gear.some(i => i!.slot === 'offHand') && gear.every(i => !i!.armorType || i!.armorType === 'cloth'),
  `法师商店 ${gear.length} 件装备：${gear.map(i => SLOT_NAME[i!.slot]).join(' ')}`);

// ---------- 8. 存档迁移 v2 → v3 ----------
console.log('\n== 8. 存档迁移 v2 → v3 ==');
const mem = new Map<string, string>();
const storage: SaveStorage = { get: k => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v), remove: k => void mem.delete(k) };
const old = (id: string, slot: string, baseId: string, extra: object = {}) => ({ id, baseId, name: baseId, slot, quality: 'blue', itemLevel: 8, hp: 50, armor: 10, modifiers: [], lines: [], sellPrice: 10, ...extra });
const v2 = (cls: string, equipped: object, bag: object[]) => JSON.stringify({ version: 2, savedAt: 0, classId: cls, inventory: { gold: 77, bag, equipped, stacks: { mat_dust: 3 } }, level: { level: 6, xp: 0 }, talents: {}, quests: { active: {}, done: [] } });
storage.set('w', v2('warrior',
  { weapon: old('w1', 'weapon', 'b_axe', { upgrade: 4, baseHp: 0, modifiers: [{ id: 'w1:upgrade', name: '强化+4', source: 'equipment', desc: '强化：所有技能伤害 +12%', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] }] }),
    head: old('w2', 'head', 'b_helm'), legs: old('w3', 'legs', 'b_legs'), trinket: old('w4', 'trinket', 'b_ring'), chest: old('w5', 'chest', 'b_chest') },
  [old('w6', 'trinket', 'b_amulet'), old('w7', 'trinket', 'b_ring', { name: '寒冰核心', baseId: 'b_amulet_x' }), old('w8', 'weapon', 'b_sword')]));
const sw2 = new SaveManager(storage, 'w', LOOT_DATA).load()!;
const wi = new Inventory(30, { hp: 0, armor: 0 }); wi.rules = CLASSES.warrior.equip; wi.load(sw2.inventory);
const eq = wi.equipped;
console.log(`  战士：${EQUIP_SLOTS.filter(s => eq[s]).map(s => `${EQUIP_SLOT_NAME[s]}=${eq[s]!.baseId}`).join(' ')}；背包 ${wi.bag.map(i => `${i.baseId}(${SLOT_NAME[i.slot]})`).join(' ')}`);
check(sw2.version === SAVE_VERSION && eq.mainHand?.id === 'w1' && eq.mainHand.slot === 'oneHand' && eq.mainHand.weaponType === 'axe' && eq.mainHand.upgrade === 4, '旧武器 → 主手（单手斧），强化等级保留');
check((eq.mainHand?.bonus?.power ?? 0) > 0, `旧武器按新底材补上攻击强度 ${eq.mainHand?.bonus?.power}`);
check(eq.ring1?.id === 'w4' && eq.head?.armorType === 'plate' && eq.legs?.armorType === 'plate' && eq.chest?.id === 'w5', '旧饰品格的铜戒指 → 戒指1；头/胸/腿补上重甲类型');
check(wi.bag.find(i => i.id === 'w6')?.slot === 'neck' && wi.bag.find(i => i.id === 'w7')?.slot === 'trinket' && wi.bag.find(i => i.id === 'w8')?.slot === 'oneHand', '背包：护身符 → 项链，其它饰品保持饰品，长剑 → 单手');
check(wi.gold === 77 && wi.stack('mat_dust') === 3 && wi.equippedItems().length === 5 && wi.bag.length === 3, '金币、材料、件数不变');
storage.set('m', v2('mage', { weapon: old('m1', 'weapon', 'b_staff'), legs: old('m2', 'legs', 'b_legs'), head: old('m3', 'head', 'b_hood') }, []));
const sm2 = new SaveManager(storage, 'm', LOOT_DATA).load()!;
const mi = new Inventory(30, { hp: 0, armor: 0 }); mi.rules = CLASSES.mage.equip; mi.load(sm2.inventory);
check(mi.equipped.mainHand?.slot === 'twoHand' && mi.equipped.mainHand.weaponType === 'staff' && mi.equipped.legs?.armorType === 'cloth' && mi.equipped.head?.armorType === 'cloth', '法师：法杖 → 双手主手，皮革护腿 → 布甲');
// 迁移后还能正常换装
const tm = make('b_tome'); mi.add(tm);
check(mi.equip(tm.id) && mi.bag.some(i => i.id === 'm1'), '迁移后的法杖在穿副手时正常卸下');
// v3 存档往返
const sm3 = new SaveManager(storage, 'w3', LOOT_DATA);
sm3.save({ classId: 'warrior', inventory: full.save(), level: { level: 12, xp: 0 }, talents: {}, quests: { active: {}, done: [] } });
const back = sm3.load()!; const fi = new Inventory(40, { hp: 0, armor: 0 }); fi.load(back.inventory);
check(back.version === SAVE_VERSION && JSON.stringify(fi.stats()) === JSON.stringify(full.stats()) && fi.averageItemLevel() === full.averageItemLevel(), '存档往返（最新版本）：属性、平均装等一致');

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 装备部位系统全部通过');
if (fails) process.exitCode = 1;
