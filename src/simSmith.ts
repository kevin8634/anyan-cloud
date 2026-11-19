// 运行：npm run smith —— v0.5 C 铁匠改版（主线 v0.6.6 留下来的部分）：锁定（A 的一键分解 / 自动分解都跳过）、分解金币、杂物自动出售、
//        兑换（暗岩锻造：职业护甲 / 16 部位 / 自选特殊属性 / 价格与每周限购；套装缺件只换没有的）、兑换货币来源（长副本）、存档 v7 → v8
//        （B 的三档批量分解 / +8 掉级与保护符 / 词条重铸随 A 的装备体系退役：一键分解、部位强化、淬炼见 npm run forge）
import { LootGenerator, ItemInstance, Quality, affixRegex } from './core/Loot';
import { Inventory, EQUIP_SLOTS } from './core/Inventory';
import { Forge } from './core/Forge';
import { Exchange, raidCurrencyDrop, weekKey } from './core/Exchange';
import { SaveManager, SaveStorage, SAVE_VERSION } from './core/SaveManager';
import { LOOT_DATA, LOOT_TABLES, SPECIAL_AFFIXES } from './data/loot';
import { FORGE_DATA } from './data/shop';
import { classSet } from './data/sets';
import { CUR_EMBER, CUR_FROST, CUR_SIGIL, forgeCost, setPieceCost, WEEKLY_LIMIT, FORGE_ILVL_BONUS } from './data/exchange';
import { CLASSES } from './data/classes';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rng = seeded(777);
const gen = new LootGenerator(LOOT_DATA, rng); gen.classId = 'warrior';
const name = (id: string) => FORGE_DATA.stacks.find(s => s.id === id)?.name ?? id;

// ================================================================ 1. 锁定 + 一键分解
console.log('\n【1】锁定与一键分解（A 的按品质勾选）');
{
  const inv = new Inventory(60, { hp: 0, armor: 0 }); inv.rules = CLASSES.warrior.equip;
  const forge = new Forge(FORGE_DATA, inv, rng);
  const mk = (q: Quality, slot: string = 'chest') => { const it = gen.generate(20, q, [slot as never]); inv.add(it); return it; };
  const head = mk('orange', 'head'); inv.equip(head.id);   // 身上一件高装等，背包里的都不算「比身上好」
  const w = mk('white', 'head'), g = mk('green', 'head'), b = mk('blue', 'head'), p = mk('purple', 'head');
  const lockedB = mk('blue', 'head'), lockedP = mk('purple', 'head');
  const set = gen.generateFixed('i_fury_legs', 20)!; inv.add(set);
  const dark = gen.generateFixed('d_bloodoath', 25)!; inv.add(dark);
  check(inv.toggleLock(lockedB.id) === true && inv.toggleLock(lockedP.id) === true && lockedB.locked === true, '锁定 2 件（背包）：toggleLock → true');
  check(inv.toggleLock(head.id) === true && inv.toggleLock(head.id) === false && !head.locked, '身上的装备也能锁定 / 解锁（再点一次解锁，字段删除）');
  const ids = (l: ItemInstance[]) => l.map(i => i.id).sort().join();
  const all = forge.salvagePick({ qualities: ['white', 'green', 'blue', 'purple', 'orange', 'dark'], keepBetter: false, keepElite: false, keepSet: true });
  check(ids(all) === ids([w, g, b, p]), `勾选全部品质：${all.length} 件（跳过锁定 ×2、套装件、暗金、身上的）`);
  const gold = forge.salvageGoldTotal(all);
  check(gold === all.reduce((s, i) => s + forge.salvageGold(i), 0) && gold > 0, `确认框金币 = 每件分解金币之和（${gold}）`);
  const gold0 = inv.gold;
  forge.salvageMany([...all, lockedB, lockedP, dark]);
  check(inv.gold === gold0 + gold && [lockedB, lockedP, dark, set, head].every(x => inv.find(x.id)) && all.every(x => !inv.find(x.id)), 'salvageMany 再次检查：传入锁定 / 暗金也不会分解；金币到账');
  check(forge.salvage(lockedB.id) === null && forge.whyCannotSalvage(lockedB) === '已锁定（先解锁）', '单件分解也拒绝锁定的装备');
  const loose = gen.generate(20, 'green'); const g1 = inv.gold; forge.salvageLoose(loose);
  check(inv.gold === g1 + forge.salvageGold(loose), '拾取自动分解也给分解金币');
  check(inv.sell(lockedP.id) === 0, '锁定的装备也不能被（模拟用的）sell 卖掉');
}

// ================================================================ 2. 杂物
console.log('\n【2】灰色杂物自动出售 / 装备不能出售');
{
  const inv = new Inventory(30, { hp: 0, armor: 0 });
  const forge = new Forge(FORGE_DATA, inv, rng);
  inv.addStack('junk_fang', 3); inv.addStack('junk_cloth', 2); inv.addStack('junk_trinket', 1); inv.addStack('junk_ash', 4); inv.addStack('mat_dust', 5);
  const expect = 3 * 2 + 2 * 4 + 1 * 9 + 4 * 14;
  check(forge.junkValue().count === 10 && forge.junkValue().gold === expect, `杂物 10 件估价 ${expect} 金`);
  const r = forge.sellJunk();
  check(r.gold === expect && inv.gold === expect && !inv.stack('junk_ash') && inv.stack('mat_dust') === 5, '拜访商人：杂物全部卖掉，材料不动');
  check(forge.sellJunk().count === 0, '没有杂物时什么都不做');
  check(FORGE_DATA.stacks.filter(s => s.kind === 'junk').every(s => (s.price ?? 0) > 0), '每种杂物都有售价');
  const tables = ['trash', 'trash_swamp', 'trash_field', 'trash_redsand', 'trash_frost', 'trash_ember'];
  check(tables.every(t => LOOT_TABLES[t].stacks?.some(s => s.id.startsWith('junk_'))), `所有小怪掉落表都会掉杂物（${tables.length} 张）`);
}

// ================================================================ 4. 兑换：暗岩锻造
console.log('\n【4】兑换 · 暗岩锻造（定向获取）');
let now = new Date('2026-10-14T12:00:00Z');
for (const cls of ['warrior', 'mage'] as const) {
  const g2 = new LootGenerator(LOOT_DATA, seeded(cls.length * 31)); g2.classId = cls;
  const inv = new Inventory(60, { hp: 0, armor: 0 }); inv.rules = CLASSES[cls].equip;
  const ex = new Exchange(inv, g2, FORGE_DATA, SPECIAL_AFFIXES, name, () => now);
  const ok16 = EQUIP_SLOTS.every(s => { const bases = ex.forgeBases(cls, s); const b = bases.map(id => g2.base(id)!); return bases.length > 0 && b.every(x => inv.slotsFor({ slot: x.slot } as ItemInstance).includes(s) && (!x.armorType || x.armorType === CLASSES[cls].equip.armorType) && (!x.cls || x.cls === cls)); });
  check(ok16, `${CLASSES[cls].name}：16 个部位都有可锻造的底材，护甲类型 = ${CLASSES[cls].equip.armorType === 'plate' ? '重甲' : '布甲'}，武器是本职业的`);
  inv.gold = 100000; inv.addStack(CUR_EMBER, 100); inv.addStack(CUR_FROST, 100); inv.addStack(CUR_SIGIL, 100);
  const lv = 30;
  const sps = ex.forgeSpecials(cls, 'chest');
  const pick = sps[sps.length - 1];
  const g0 = inv.gold, e0 = inv.stack(CUR_EMBER), s0 = inv.stack(CUR_SIGIL);
  const r = ex.forgeItem(cls, 'chest', ex.forgeBases(cls, 'chest')[0], pick.id, lv);
  const c = forgeCost('chest', lv);
  check(r.ok && inv.gold === g0 - c.gold && inv.stack(CUR_EMBER) === e0 - 6 && inv.stack(CUR_SIGIL) === s0 - 3, `锻造胸甲：-${c.gold} 金、-6 熔心余烬、-3 暗岩徽记`);
  if (r.ok) {
    const it = r.value, sp = it.lines.find(l => l.startsWith('✧ '));
    check(it.itemLevel === lv + FORGE_ILVL_BONUS && it.quality === 'purple' && it.forged === true && it.name.startsWith('暗岩锻造·') && inv.canEquip(it), `「${it.name}」史诗，装等 ${it.itemLevel}，本职业能穿`);
    check(!!sp && affixRegex(pick).test(sp.slice(2)) && it.special === true, `自选特殊属性生效：${sp}`);
    check(it.lines.length === 4 || it.lines.length === 5, `史诗：2 属性 + 1 技能（+0~1 小特效）+ 1 条 ✧（共 ${it.lines.length} 行）`);
  }
  const bad = ex.forgeItem(cls, 'chest', ex.forgeBases(cls, 'chest')[0], 'nope', lv);
  check(!bad.ok && bad.reason === '请选择一条特殊属性', '没选特殊属性不能锻造');
  const wrongBase = ex.forgeItem(cls, 'head', cls === 'warrior' ? 'b_hood' : 'b_helm', ex.forgeSpecials(cls, 'head')[0].id, lv);
  check(!wrongBase.ok, '不能锻造别的职业护甲类型的底材');
  if (cls === 'warrior') {
    const mh = ex.forgeItem(cls, 'mainHand', 'b_greataxe', ex.forgeSpecials(cls, 'mainHand', 'b_greataxe')[0].id, lv);
    check(mh.ok && mh.value.slot === 'twoHand' && mh.value.weaponType === 'greataxe', '主手可以自选底材（双手巨斧）');
    const third = ex.forgeItem(cls, 'feet', 'b_sabaton', ex.forgeSpecials(cls, 'feet')[0].id, lv);
    const fourth = ex.forgeItem(cls, 'hands', 'b_gauntlet', ex.forgeSpecials(cls, 'hands')[0].id, lv);
    check(third.ok && !fourth.ok && /本周暗岩锻造已兑换 3 次/.test((fourth as { reason: string }).reason), `每周限购 ${WEEKLY_LIMIT.forge} 件：第 4 件被拒（${(fourth as { reason: string }).reason}）`);
    now = new Date('2026-10-19T08:00:00Z');   // 下周一
    check(ex.left('forge') === WEEKLY_LIMIT.forge && ex.state.week === weekKey(now), `跨周（${weekKey(now)}）限购刷新`);
    inv.useStack(CUR_EMBER, inv.stack(CUR_EMBER) - 2);
    const poor = ex.forgeItem(cls, 'legs', 'b_legs', ex.forgeSpecials(cls, 'legs')[0].id, lv);
    check(!poor.ok && /熔心余烬不足/.test((poor as { reason: string }).reason), `货币不足：${(poor as { reason: string }).reason}`);
  }
}

// ================================================================ 5. 套装缺件
console.log('\n【5】兑换 · 套装缺件（只换还没有的）');
{
  const inv = new Inventory(60, { hp: 0, armor: 0 });
  const ex = new Exchange(inv, gen, FORGE_DATA, SPECIAL_AFFIXES, name, () => new Date('2026-10-14T12:00:00Z'));
  const set = classSet('warrior')!;
  const owned = [gen.generateFixed(set.pieces[0], 20)!, gen.generateFixed(set.pieces[2], 20)!];
  inv.add(owned[0]); inv.equip(owned[0].id);
  const bank = [owned[1]];   // 仓库里有一件
  const all = () => [...inv.equippedItems(), ...inv.bag, ...bank];
  const miss = ex.missingSetPieces(set.pieces, all());
  check(miss.length === 4 && !miss.includes(set.pieces[0]) && !miss.includes(set.pieces[2]), `身上 1 件 + 仓库 1 件：缺 ${miss.length} 件（${miss.map(id => gen.fixedName(id)).join('、')}）`);
  inv.gold = 100000; inv.addStack(CUR_EMBER, 50); inv.addStack(CUR_FROST, 50); inv.addStack(CUR_SIGIL, 50);
  const no = ex.buySetPiece(set.pieces[0], set.pieces, all(), 30);
  check(!no.ok && no.reason === '只能兑换还没有的套装部件', '已拥有的部件不能兑换');
  const c = setPieceCost(30), g0 = inv.gold, s0 = inv.stack(CUR_SIGIL);
  const yes = ex.buySetPiece(miss[0], set.pieces, all(), 30);
  check(yes.ok && yes.value.fixedId === miss[0] && yes.value.setId === 'set_fury' && inv.gold === g0 - c.gold && inv.stack(CUR_SIGIL) === s0 - 15, `兑换「${yes.ok ? yes.value.name : ''}」：-${c.gold} 金、-15 徽记（比锻造贵）`);
  check(ex.missingSetPieces(set.pieces, all()).length === 3, '兑换后缺件列表少一件');
  const again = ex.buySetPiece(ex.missingSetPieces(set.pieces, all())[0], set.pieces, all(), 30);
  check(!again.ok && /本周套装缺件/.test((again as { reason: string }).reason), `每周 ${WEEKLY_LIMIT.set} 件`);
  // 老存档的套装件没有 fixedId，按名字也算有
  const legacy = { ...gen.generateFixed(set.pieces[1], 20)! }; delete legacy.fixedId;
  check(!ex.missingSetPieces(set.pieces, [legacy]).includes(set.pieces[1]), '老存档没有 fixedId 的套装件按名字认');
}

// ================================================================ 8. 临时货币来源
console.log('\n【8】兑换货币来源（主线 v0.6.6：长副本 + 史诗/噩梦普通副本）');
{
  const r8 = seeded(5);
  const tally = (o: Parameters<typeof raidCurrencyDrop>[0], n = 2000) => { const t: Record<string, number> = {}; for (let i = 0; i < n; i++) for (const s of raidCurrencyDrop(o, r8)) t[s.id] = (t[s.id] ?? 0) + s.count; return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v / n * 100) / 100])); };
  const mb = tally({ raid: 'molten_throne' }), mf = tally({ raid: 'molten_throne', final: true }), fb = tally({ raid: 'frost_crypt' }), mh = tally({ raid: 'molten_throne', hell: true });
  check(mb[CUR_EMBER] > 2 && !mb[CUR_FROST] && fb[CUR_FROST] > 2 && !fb[CUR_EMBER] && mb[CUR_SIGIL] > 1, `熔心王座 → 熔心余烬，永霜墓穴 → 永霜碎晶（每个首领平均 余烬 ${mb[CUR_EMBER]} / 碎晶 ${fb[CUR_FROST]}，徽记 ${mb[CUR_SIGIL]}）`);
  check(mf[CUR_EMBER] > mb[CUR_EMBER] && mh[CUR_EMBER] > mb[CUR_EMBER], `最终首领更多（余烬 ${mf[CUR_EMBER]}），炼狱 ×1.5（${mh[CUR_EMBER]}）`);
  const none = ['normal', 'heroic'].every(d => !raidCurrencyDrop({ dungeon: 'darkrock_mine', diff: d }, r8).length && !raidCurrencyDrop({ dungeon: 'sand_tomb', diff: d }, r8).length);
  check(none, '普通副本普通 / 英雄难度首领不掉兑换货币');
  const te = tally({ dungeon: 'troll_cave', diff: 'epic' }), sn = tally({ dungeon: 'sand_tomb', diff: 'nightmare' });
  check(te[CUR_FROST] >= 1 && !te[CUR_EMBER] && sn[CUR_EMBER] >= 2 && sn[CUR_SIGIL] >= 1, `普通副本按主题：巨魔冰窟史诗 碎晶 ${te[CUR_FROST]}，沙葬王陵噩梦 余烬 ${sn[CUR_EMBER]} + 徽记 ${sn[CUR_SIGIL]}`);
  const perRun = mb[CUR_EMBER] * 4 + mf[CUR_EMBER];
  console.log(`    · 熔心王座一趟约 ${perRun.toFixed(1)} 余烬：锻造一件护甲（余烬 6 + 徽记 3）≈ ${(6 / perRun).toFixed(2)} 趟`);
}

// ================================================================ 9. 存档 v7 → v8
console.log('\n【9】存档 v7 → v8');
{
  const mem = new Map<string, string>();
  const storage: SaveStorage = { get: k => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v), remove: k => void mem.delete(k) };
  const it = (id: string, extra: object) => ({ id, baseId: 'b_helm', name: '铁盔', slot: 'head', quality: 'blue', itemLevel: 20, hp: 50, armor: 20, modifiers: [], lines: [], sellPrice: 10, armorType: 'plate', durability: 100, ...extra });
  const v7 = { version: 7, savedAt: 0, classId: 'warrior', inventory: { gold: 77, bag: [it('a', { locked: 'yes' }), it('b', { sellPrice: undefined }), it('c', { locked: true })], equipped: { head: it('d', {}) }, stacks: { mat_dust: 3, potion_s: 0 } },
    level: { level: 30, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, setPity: { dry: 0, seen: [] }, relicChain: { step: 0, rounds: 0 } };
  storage.set('k', JSON.stringify(v7));
  const s = new SaveManager(storage, 'k', LOOT_DATA).load()!;
  const bag = s.inventory.bag as ItemInstance[];
  check(s.version === SAVE_VERSION && SAVE_VERSION >= 8, `v7 → v${s.version}`);
  check(bag[0].locked === undefined && bag[2].locked === true && bag[1].sellPrice === 0 && bag[0].sellPrice === 10, '锁定字段只认 true；缺 sellPrice 的补 0（旧出售字段安全保留）');
  check(s.inventory.stacks!.mat_dust === 3 && !('potion_s' in s.inventory.stacks!) && s.exchange?.week === '' && s.inventory.gold === 77, '堆叠物品清掉 0 数量，兑换限购从头开始，金币保留');
  // 往返：锁定、货币、保护符、限购
  const inv = new Inventory(30, { hp: 0, armor: 0 }); inv.load(s.inventory);
  inv.addStack(CUR_EMBER, 4); inv.addStack(CUR_SIGIL, 2); inv.toggleLock('d');
  const sm = new SaveManager(storage, 'k2', LOOT_DATA);
  sm.save({ classId: 'warrior', inventory: inv.save(), level: s.level, talents: {}, quests: s.quests, exchange: { week: '2026-W42', used: { forge: 2 } } });
  const back = sm.load()!;
  const inv2 = new Inventory(30, { hp: 0, armor: 0 }); inv2.load(back.inventory);
  check(inv2.stack(CUR_EMBER) === 4 && inv2.stack(CUR_SIGIL) === 2 && inv2.equipped.head?.locked === true && inv2.bag.find(i => i.id === 'c')?.locked === true && back.exchange?.used.forge === 2, '存档往返：兑换货币、锁定、每周限购');
}

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 铁匠改版 全部通过');
if (fails) process.exitCode = 1;
