// v1.2.55 装备一致性校验：名字里的武器名词 = 底材武器类型（图标、手持模型都按底材 baseId / weaponType 取，名字对上就三者一致）
// npm run gearname
import { LootGenerator, ItemInstance, nameWeaponType, nameFitsWeapon, fitWeaponName } from './core/Loot';
import { LOOT_DATA } from './data/loot';
declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const CLS = ['warrior', 'mage', 'chrono', 'alchemy'];

console.log('=== 规则 ===');
check(fitWeaponName('血怒·风暴战斧', 'greatsword') === '血怒·风暴巨剑', '战斧出在巨剑上 → 改名巨剑');
check(fitWeaponName('血怒·风暴战斧', 'greataxe') === '血怒·风暴战斧', '战斧出在双手斧上 → 不改');
check(fitWeaponName('霜语·冰川巨斧', 'axe') === '霜语·冰川战斧', '巨斧出在单手斧上 → 改名战斧');
check(fitWeaponName('处决·斩首者', 'mace') === '处决·斩首者', '名字没有武器名词 → 不改');
check(nameWeaponType('奥术典籍')?.type === 'tome', '识别：奥术典籍 = 法典');

console.log('=== 设计数据（改名前） ===');
const wpnSlots = new Set(['oneHand', 'twoHand', 'offHand']);
let raw = 0; const rawList: string[] = [];
for (const cls of CLS) {
  const bases = LOOT_DATA.bases.filter(b => (!b.cls || b.cls === cls) && wpnSlots.has(b.slot));
  for (const lg of LOOT_DATA.legendaries.filter(l => !l.cls || l.cls === cls)) for (const b of bases.filter(b => lg.slots.includes(b.slot)))
    if (!nameFitsWeapon(lg.name, b.weaponType)) { raw++; if (rawList.length < 12) rawList.push(`${lg.name} @ ${b.name}`); }
  for (const f of LOOT_DATA.fixedItems) { const b = LOOT_DATA.bases.find(x => x.id === f.baseId); if (b && wpnSlots.has(b.slot) && !nameFitsWeapon(f.name, b.weaponType)) { raw++; rawList.push(`固定件 ${f.name} @ ${b.name}`); } }
}
console.log(`  名字与底材不符的组合 ${raw} 个（运行时会挑对得上的底材或改名），例：${rawList.slice(0, 6).join('；')}`);

console.log('=== 实际掉落（每职业 3000 件橙 + 全部固定件） ===');
let bad = 0, renamed = 0; const badList: string[] = [];
const seen = (it: ItemInstance) => { if (!it.weaponType) return; const lgName = it.name; if (!nameFitsWeapon(lgName, it.weaponType as never)) { bad++; if (badList.length < 8) badList.push(`${it.name}(${it.weaponType})`); } };
for (const cls of CLS) {
  let s = 12345; const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = new LootGenerator(LOOT_DATA, rng); (g as unknown as { classId: string }).classId = cls;
  for (let i = 0; i < 3000; i++) { const it = g.generate(30, 'orange', ['oneHand', 'twoHand', 'offHand']); if (it) { seen(it); const lg = LOOT_DATA.legendaries.find(l => l.id === it.lgId); if (lg && lg.name !== it.name && !it.ancient) renamed++; } }
  for (const f of LOOT_DATA.fixedItems) { const it = g.generateFixed(f.id, 30); if (it) seen(it); }
}
check(bad === 0, `掉落物名字与手持武器类型全部一致（不符 ${bad}${badList.length ? '：' + badList.join('、') : ''}）`);
console.log(`  其中改名 ${renamed} 件（特效池里没有对得上的才改名）`);
console.log(fails ? `\n✗ ${fails} 项失败` : '\n✓ 全部通过');
if (fails) process.exitCode = 1;
