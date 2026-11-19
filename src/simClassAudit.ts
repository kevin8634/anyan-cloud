// v1.2.1 新职业 1–30 级审计：对比 6 个职业在 1–30 级能拿到的东西（不改数据，只打印）
import { Entitlement, installPack } from './core/Entitlement';
import { DLC1 } from './dlc/dlc1/manifest';
Entitlement.grantForTest('dlc1'); installPack(DLC1);
declare const require: (m: string) => any;
const { CLASSES } = require('./data/classes');
const { LOOT_DATA } = require('./data/loot');
const { CLASS_QUESTS } = require('./data/class_quests');
const { SPIRITS } = require('./data/spirits');
const { SKILL4 } = require('./data/skills_v078');
const ids = Object.keys(CLASSES);
const fit = (cls: string, x: { cls?: string }) => !x.cls || x.cls === cls;
for (const id of ids) {
  const c = CLASSES[id], eq = c.equip;
  const bases = LOOT_DATA.bases.filter((b: any) => fit(id, b));
  const armor = bases.filter((b: any) => b.armorType === eq.armorType).length, anyArmor = bases.filter((b: any) => b.armorType).length;
  const weap = bases.filter((b: any) => b.weaponType && eq.weapons.includes(b.weaponType)).length;
  const lg = LOOT_DATA.legendaries.filter((l: any) => l.cls === id).length, lgAll = LOOT_DATA.legendaries.filter((l: any) => !l.cls).length;
  const fx = LOOT_DATA.fixedItems.filter((f: any) => f.cls === id);
  const sets = fx.filter((f: any) => f.setId).length, dark = fx.filter((f: any) => f.quality === 'dark').length;
  const generic = LOOT_DATA.fixedItems.filter((f: any) => !f.cls).length;
  const aff = LOOT_DATA.affixes.filter((a: any) => a.cls === id).length;
  const q = CLASS_QUESTS.filter((x: any) => x.cls === id || x.classId === id || (x.id ?? '').includes(id)).map((x: any) => x.minLevel);
  const sp = SPIRITS.filter((s: any) => s.cls === id).map((s: any) => `${s.unlock?.stat}:${s.unlock?.n}`);
  const book = c.ext?.book; const s4 = SKILL4[id]?.length ?? 0;
  console.log(`\n## ${id} ${c.name}  护甲 ${eq.armorType} 武器 ${eq.weapons.join('/')}`);
  console.log(`  底材：本职业护甲 ${armor}（全部护甲 ${anyArmor}），可用武器 ${weap}；职业词条 ${aff}`);
  console.log(`  橙装 职业 ${lg} + 通用 ${lgAll}；固定装 职业套装件 ${sets}、职业暗金 ${dark}、通用固定 ${generic}`);
  console.log(`  职业任务等级 [${q.join(',')}]；英灵 ${sp.length} [${sp.join(' ')}]；SKILL4 绝技候选 ${s4}；包技能书 ${book ? `choices ${Object.values(book.choices).flat().length} runes ${book.runes.length} presets ${book.presets.length}` : '-'}`);
}
{
  const { LootGenerator } = require('./core/Loot');
  for (const id of ['warrior', 'hunter', 'coffin']) {
    const g = new LootGenerator(LOOT_DATA, () => Math.random()); g.classId = id;
    let r = ''; try { const it = g.generate(20, 'orange'); r = `${it.quality} ${it.name} lg=${it.lgId ?? '-'}`; } catch (e) { r = 'ERR ' + String(e).slice(0, 80); }
    console.log(`  orange@20 ${id}: ${r}`);
  }
}
for (const id of ['hunter', 'coffin']) { const c = CLASSES[id]; console.log(id, 'loadout', JSON.stringify(c.loadout), 'skill4 choices', JSON.stringify(c.ext.book.choices.skill4), JSON.stringify(c.ext.book.choices.ultimate)); }
{
  const { LootGenerator } = require('./core/Loot');
  for (const id of ids) {
    const eq = CLASSES[id].equip; const g = new LootGenerator(LOOT_DATA, () => 0.37); g.classId = id;
    let ok = 0, bad: string[] = [], none = 0;
    for (const f of LOOT_DATA.fixedItems) {
      if (f.cls && f.cls !== id) continue;
      let it: any = null; try { it = g.generateFixed(f.id, 25); } catch (e) { bad.push(f.id + '!'); continue; }
      if (!it) { none++; continue; }
      const wear = (!it.armorType || it.armorType === eq.armorType) && (!it.weaponType || eq.weapons.includes(it.weaponType));
      if (wear) ok++; else bad.push(`${f.id}(${it.armorType ?? it.weaponType})`);
    }
    let oq = 0; for (let i = 0; i < 40; i++) { const it = g.generate(15 + i % 15, 'orange'); if (it.quality === 'orange' && it.lgId) oq++; }
    console.log(`  ${id}: 固定装可穿 ${ok}，不可穿 ${bad.length} ${bad.slice(0, 6).join(' ')}，生成失败 ${none}；随机橙装 40 次有特效 ${oq}`);
  }
}
