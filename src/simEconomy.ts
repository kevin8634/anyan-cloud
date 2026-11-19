// 运行：npm run economy —— v0.5 C 金币经济：取消装备出售后，按真实掉落表 + 任务奖励模拟 10 / 20 / 30 级每小时的收入和支出，
//        再模拟「一件装备强化到 +10」花多少金币，打印收支表并检查目标：
//          ① 药水 + 修理 ≤ 每小时收入的 35%（付得起，还有余钱）
//          ② 主线 v0.6.6：强化改成 A 的「部位强化」（+1~+15、不掉级、祝福值，强化跟着格子走、换装不丢），
//             所以不再按「一件装备 +10 ≈ 3 小时」（B 的目标）检查，改为：一个部位 +10 ≤ 2 小时、16 个部位全部 +10 在 6~30 小时之间
//          ③ 分解金币只是「零钱」：≤ 收入的 25%
//        npm run economy -- --write 把表格写进 docs/economy.md（<!-- ECON:BEGIN --> … <!-- ECON:END --> 之间）
import { LootGenerator, ItemInstance, ItemSlot, Quality } from './core/Loot';
import { Inventory, EQUIP_SLOTS, EquipSlot } from './core/Inventory';
import { Forge } from './core/Forge';
import { applyDeathLoss, repairAllCost } from './core/Durability';
import { LOOT_DATA, LOOT_TABLES } from './data/loot';
import { FORGE_DATA } from './data/shop';
import { QUESTS } from './data/quests';
import { forgeCost, setPieceCost } from './data/exchange';

declare const process: { argv: string[]; exitCode?: number };
declare function require(m: string): { readFileSync(p: string, e: string): string; writeFileSync(p: string, t: string): void; existsSync(p: string): boolean };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const price = (id: string) => (FORGE_DATA.shop.find(e => e.kind === 'stack' && e.id === id) as { price: number } | undefined)?.price ?? 0;

// ---------------------------------------------------------------- 假设（写进 docs/economy.md）
/** 一小时的「典型玩法」：野外刷怪 + 做任务（不算副本；副本金币另算，见文档） */
interface Band {
  lv: number; zone: string; trash: string; ilvl: number; kills: number;
  elite: string; rare: string; eliteN: number; rareN: number;
  /** 每小时交几个任务、取哪些任务的平均金币 */
  questsPerHour: number; questFilter: (q: { minLevel: number; repeatable?: boolean; id: string }) => boolean;
  potions: Record<string, number>; deaths: number; gear: { quality: Quality; ilvl: number };
}
const BANDS: Band[] = [
  { lv: 10, zone: '翠风原野', trash: 'trash_field', ilvl: 13, kills: 140, elite: 'elite_field', rare: 'rare_field', eliteN: 0.3, rareN: 0.4,
    questsPerHour: 4, questFilter: q => q.id.startsWith('q_field') || q.id.startsWith('q_swamp'), potions: { potion_s: 5 }, deaths: 1, gear: { quality: 'blue', ilvl: 12 } },
  { lv: 20, zone: '赤砂裂谷', trash: 'trash_redsand', ilvl: 22, kills: 130, elite: 'elite_redsand', rare: 'rare_redsand', eliteN: 0.4, rareN: 0.4,
    questsPerHour: 3.5, questFilter: q => q.id.startsWith('rs_'), potions: { potion_s: 4, potion_l: 2 }, deaths: 1, gear: { quality: 'blue', ilvl: 22 } },
  { lv: 30, zone: '烬落荒原', trash: 'trash_ember', ilvl: 30, kills: 120, elite: 'elite_ember', rare: 'rare_ember', eliteN: 0.5, rareN: 0.4,
    questsPerHour: 3, questFilter: q => !!q.repeatable && q.id.startsWith('bt_'), potions: { potion_s: 4, potion_l: 4 }, deaths: 1, gear: { quality: 'purple', ilvl: 32 } },
];
const HOURS = 200;   // 每档模拟 200 小时取平均

interface HourRow { mob: number; junk: number; salvage: number; quest: number; items: number; mats: Record<string, number>; potions: number; repair: number }
function simHour(b: Band, rng: () => number): HourRow {
  const gen = new LootGenerator(LOOT_DATA, rng); gen.classId = 'warrior';
  const inv = new Inventory(9999, { hp: 0, armor: 0 });
  const forge = new Forge(FORGE_DATA, inv, rng);
  let mob = 0;
  const roll = (t: string, n: number, ilvl: number) => {
    const whole = Math.floor(n) + (rng() < n - Math.floor(n) ? 1 : 0);
    for (let i = 0; i < whole; i++) {
      const r = gen.roll(LOOT_TABLES[t], ilvl);
      mob += r.gold; r.items.forEach(it => inv.add(it)); r.stacks.forEach(s => inv.addStack(s.id, s.count));
    }
  };
  roll(b.trash, b.kills, b.ilvl);
  roll(b.elite, b.eliteN, b.ilvl + 2);
  roll(b.rare, b.rareN, b.ilvl + 1);
  const items = inv.bag.length;
  const junk = forge.sellJunk().gold;
  const g0 = inv.gold; forge.salvageMany(forge.salvagePick({ qualities: ['white', 'green', 'blue', 'purple', 'orange'], keepBetter: false, keepElite: false, keepSet: false }));
  const sv = { gold: inv.gold - g0 };
  const qs = QUESTS.filter(b.questFilter);
  const avgQ = qs.reduce((s, q) => s + q.reward.gold, 0) / Math.max(1, qs.length);
  const quest = Math.round(avgQ * b.questsPerHour);
  const mats: Record<string, number> = {};
  for (const [k, v] of Object.entries(inv.stacks)) if (k.startsWith('mat_')) mats[k] = v;
  // 支出：药水 + 阵亡修理（一身 16 件）
  const potions = Object.entries(b.potions).reduce((s, [id, n]) => s + price(id) * n, 0);
  const gear: ItemInstance[] = EQUIP_SLOTS.map(s => gen.generate(b.gear.ilvl, b.gear.quality, [slotKind(s)]));
  for (let d = 0; d < b.deaths; d++) applyDeathLoss(gear);
  return { mob, junk, salvage: sv.gold, quest, items, mats, potions, repair: repairAllCost(gear) };
}
const slotKind = (s: EquipSlot): ItemSlot => (s === 'ring1' || s === 'ring2' ? 'ring' : s === 'trinket1' || s === 'trinket2' ? 'trinket' : s === 'mainHand' ? 'oneHand' : s === 'offHand' ? 'offHand' : s as ItemSlot);

function avgBand(b: Band) {
  const rng = seeded(1000 + b.lv);
  const sum: HourRow = { mob: 0, junk: 0, salvage: 0, quest: 0, items: 0, mats: {}, potions: 0, repair: 0 };
  for (let h = 0; h < HOURS; h++) {
    const r = simHour(b, rng);
    for (const k of ['mob', 'junk', 'salvage', 'quest', 'items', 'potions', 'repair'] as const) sum[k] += r[k];
    for (const [k, v] of Object.entries(r.mats)) sum.mats[k] = (sum.mats[k] ?? 0) + v;
  }
  const a = (v: number) => Math.round(v / HOURS);
  const mats: Record<string, number> = {}; for (const [k, v] of Object.entries(sum.mats)) mats[k] = Math.round(v / HOURS * 10) / 10;
  const r = { mob: a(sum.mob), junk: a(sum.junk), salvage: a(sum.salvage), quest: a(sum.quest), items: a(sum.items), mats, potions: a(sum.potions), repair: a(sum.repair) };
  const income = r.mob + r.junk + r.salvage + r.quest, cost = r.potions + r.repair;
  return { ...r, income, cost, net: income - cost };
}

// ---------------------------------------------------------------- 部位强化（A 的 v0.6.2 规则）
function upgradeRun(slot: ItemSlot, ilvl: number, quality: Quality, trials: number, to = 10) {
  const rng = seeded(4242 + slot.length + to);
  let gold = 0, tries = 0; const mats: Record<string, number> = {};
  for (let t = 0; t < trials; t++) {
    const gen = new LootGenerator(LOOT_DATA, rng); gen.classId = 'warrior';
    const inv = new Inventory(10, { hp: 0, armor: 0 });
    const forge = new Forge(FORGE_DATA, inv, rng);
    const it = gen.generate(ilvl, quality, [slot]); inv.add(it); inv.equip(it.id);
    const es = inv.slotOf(it)!;
    inv.gold = 1e9; for (const m of ['mat_dust', 'mat_shard', 'mat_essence', 'mat_proof', 'mat_badge', 'mat_heart']) inv.addStack(m, 100000);
    const g0 = inv.gold, s0 = { ...inv.stacks };
    while (forge.slotLevel(es) < to) { forge.upgradeSlot(es); tries++; }
    gold += g0 - inv.gold;
    for (const k of Object.keys(s0)) mats[k] = (mats[k] ?? 0) + s0[k] - inv.stack(k);
  }
  const m: Record<string, number> = {}; for (const [k, v] of Object.entries(mats)) m[k] = Math.round(v / trials * 10) / 10;
  return { gold: Math.round(gold / trials), tries: Math.round(tries / trials * 10) / 10, mats: m };
}

// ---------------------------------------------------------------- 输出
const MAT_NAME: Record<string, string> = { mat_dust: '魔尘', mat_shard: '星辉碎片', mat_essence: '虚空精华', mat_soul: '传说之魂', mat_proof: '首领之证', mat_badge: '英雄徽记', mat_heart: '王座之心' };
const matText = (m: Record<string, number>) => Object.entries(m).filter(([k]) => MAT_NAME[k]).map(([k, v]) => `${MAT_NAME[k]} ${v}`).join('、');

const rows = BANDS.map(b => ({ b, r: avgBand(b) }));
const up30 = upgradeRun('chest', 32, 'purple', 2000);
const up30w = upgradeRun('twoHand', 32, 'purple', 2000);
const up15 = upgradeRun('chest', 32, 'purple', 1000, 15);
const up20 = upgradeRun('chest', 22, 'blue', 2000);
const slotMul = (k: ItemSlot) => FORGE_DATA.slotUpgradeMul?.[k] ?? 1;
const KINDS: ItemSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring', 'ring', 'trinket', 'trinket', 'oneHand', 'offHand'];
const all16 = Math.round(KINDS.reduce((s, k) => s + up30.gold * slotMul(k) / slotMul('chest'), 0));
const net30 = rows[2].r.net;

const lines: string[] = [];
lines.push('### 每小时收入（野外刷怪 + 任务；装备全部分解，杂物全部卖掉）');
lines.push('');
lines.push('| 等级 / 区域 | 怪物金币 | 灰色杂物 | 分解金币 | 任务金币 | **收入合计** | 药水 | 阵亡修理 | **净收入** | 支出占比 | 掉装备（件） | 分解材料 |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { b, r } of rows) lines.push(`| ${b.lv} 级 · ${b.zone} | ${r.mob} | ${r.junk} | ${r.salvage} | ${r.quest} | **${r.income}** | ${r.potions} | ${r.repair} | **${r.net}** | ${Math.round(r.cost / r.income * 100)}% | ${r.items} | ${matText(r.mats)} |`);
lines.push('');
lines.push('### 主要花费');
lines.push('');
lines.push('| 项目 | 金币 | 其它 | 约等于 30 级几小时净收入 |');
lines.push('|---|---|---|---|');
const h = (g: number) => (g / net30).toFixed(2);
lines.push(`| 治疗药水 / 强效治疗药水 | ${price('potion_s')} / ${price('potion_l')} | — | — |`);
lines.push(`| 阵亡一次修理（10 / 20 / 30 级一身装备） | ${rows.map(x => x.r.repair).join(' / ')} | — | ${h(rows[2].r.repair)} |`);
lines.push(`| 部位强化 +0→+10（胸甲栏） | ${up30.gold} | ${matText(up30.mats)}；平均 ${up30.tries} 次尝试 | **${h(up30.gold)}** |`);
lines.push(`| 部位强化 +0→+10（武器栏 · 双手） | ${up30w.gold} | ${matText(up30w.mats)}；平均 ${up30w.tries} 次 | ${h(up30w.gold)} |`);
lines.push(`| 部位强化 +0→+15（胸甲栏） | ${up15.gold} | ${matText(up15.mats)}；平均 ${up15.tries} 次 | ${h(up15.gold)} |`);
lines.push(`| 16 个部位全部 +10（按部位金币倍率估算） | ${all16} | — | **${h(all16)}** |`);
lines.push(`| 部位强化 +0→+10（20 级） | ${up20.gold} | ${matText(up20.mats)} | ${(up20.gold / rows[1].r.net).toFixed(2)}（20 级收入） |`);
lines.push(`| 暗岩锻造（30 级，护甲 / 首饰 / 主手） | ${forgeCost('chest', 30).gold} / ${forgeCost('ring1', 30).gold} / ${forgeCost('mainHand', 30).gold} | 余烬或碎晶 6 + 徽记 3（主手 6+6+6） | ${h(forgeCost('chest', 30).gold)} |`);
lines.push(`| 套装缺件（30 级） | ${setPieceCost(30).gold} | 余烬 8 + 碎晶 8 + 徽记 15 | ${h(setPieceCost(30).gold)} |`);
const table = lines.join('\n');
console.log(table);
console.log('');

// ---------------------------------------------------------------- 目标检查
console.log('目标检查：');
for (const { b, r } of rows) check(r.cost <= r.income * 0.35, `${b.lv} 级：药水 + 修理 ${r.cost} 金 = 收入 ${r.income} 的 ${Math.round(r.cost / r.income * 100)}%（≤ 35%，付得起）`);
for (const { b, r } of rows) check(r.salvage <= r.income * 0.25 && r.salvage > 0, `${b.lv} 级：分解金币 ${r.salvage} 是零钱（收入的 ${Math.round(r.salvage / r.income * 100)}% ≤ 25%）`);
check(rows[0].r.net < rows[1].r.net && rows[1].r.net < rows[2].r.net, `净收入随等级上涨：${rows.map(x => x.r.net).join(' < ')}`);
const hrs = up30.gold / net30;
check(hrs <= 2, `一个部位 +10 ≈ ${hrs.toFixed(2)} 小时净收入（≤ 2；部位强化换装不丢，一次性投入）`);
check(all16 / net30 >= 6 && all16 / net30 <= 30, `16 个部位全部 +10 ≈ ${(all16 / net30).toFixed(1)} 小时净收入（6~30，长期金币出口）`);
check(up15.gold > up30.gold * 2, `+15 明显更贵：${up15.gold} 金（+10 的 ${(up15.gold / up30.gold).toFixed(1)} 倍）`);
const dustH = (up30.mats.mat_dust ?? 0) / Math.max(0.1, rows[2].r.mats.mat_dust ?? 0), shardH = (up30.mats.mat_shard ?? 0) / Math.max(0.1, rows[2].r.mats.mat_shard ?? 0), essH = (up30.mats.mat_essence ?? 0) / Math.max(0.1, rows[2].r.mats.mat_essence ?? 0);
console.log(`  · 材料：+10 需要 ${matText(up30.mats)}；30 级野外每小时分解得到 ${matText(rows[2].r.mats)}（魔尘 ${dustH.toFixed(1)} 小时、碎片 ${shardH.toFixed(1)} 小时、精华 ${essH.toFixed(1)} 小时，精华主要来自副本 Boss）`);
check(Math.max(dustH, shardH) <= 4, `+10 的魔尘 / 星辉碎片 4 小时内能分解出来（${dustH.toFixed(1)} / ${shardH.toFixed(1)} 小时）`);

if (process.argv.includes('--write')) {
  const fs = require('fs'), p = 'docs/economy.md';
  if (fs.existsSync(p)) {
    const t = fs.readFileSync(p, 'utf8');
    const out = t.replace(/<!-- ECON:BEGIN -->[\s\S]*<!-- ECON:END -->/, `<!-- ECON:BEGIN -->\n${table}\n<!-- ECON:END -->`);
    fs.writeFileSync(p, out); console.log(`\n已写入 ${p}`);
  }
}
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 金币经济 全部达标');
if (fails) process.exitCode = 1;
