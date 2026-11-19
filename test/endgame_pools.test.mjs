// v0.9.6a：终局橙装分池自检（npx tsx test/endgame_pools.test.mjs）
import { LG_V091 } from '../src/data/legendary_v091_table.ts';
import { RAID_LG, ABY_LG, ABY_TOP, ALL_ENDGAME_LG } from '../src/data/endgame_pools.ts';
import { LOOT_DATA, LOOT_TABLES } from '../src/data/loot.ts';
import { LootGenerator } from '../src/core/Loot.ts';
import { RAID_RETIRED } from '../src/data/dungeon_loot.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const raidIds = Object.values(RAID_LG).flatMap(r => [...r.bosses.flatMap(b => Object.values(b)), ...Object.values(r.shared).flat()]);
const abyIds = [...Object.values(ABY_LG).flat(), ...Object.values(ABY_TOP).flat()];
ok(ALL_ENDGAME_LG.size === 96 && raidIds.length + abyIds.length === 96, `96 件全部分配且不重复（${ALL_ENDGAME_LG.size}）`);
ok(!raidIds.some(x => abyIds.includes(x)), '长副本和深渊零重复');
const byId = Object.fromEntries(LG_V091.map(a => [a.id, a]));
for (const [r, P] of Object.entries(RAID_LG)) for (const c of ['warrior', 'mage', 'chrono', 'alchemy']) ok(P.bosses.every(b => byId[b[c]]?.cls === c) && P.shared[c].length === 2 && P.shared[c].every(x => byId[x].cls === c), `${r} ${c}：5 首领独特 + 2 共享，都是本职业`);
for (const c of ['warrior', 'mage', 'chrono', 'alchemy']) ok(ABY_LG[c].length === 6 && ABY_TOP[c].length === 4, `深渊 ${c}：6 + 4`);
const g = new LootGenerator(LOOT_DATA);
let made = 0; for (const id of ALL_ENDGAME_LG) { g.classId = byId[id].cls; const it = g.generateLegendary(id, 50); if (it && it.quality === 'orange' && it.lgId === id && byId[id].slots.includes(it.slot)) made++; }
ok(made === 96, `96 件都能按指定特效生成（${made}）`);
g.classId = 'mage'; ok(g.generateLegendary(RAID_LG.molten_throne.bosses[0].warrior, 50) === null, '别的职业的指定橙装不生成');
for (const r of ['molten_throne', 'frost_crypt']) for (let i = 0; i < 5; i++) ok(LOOT_TABLES[`dl_${r}_${i}`].entries.length === 0, `${r} 首领 ${i + 1} 怪物表不再掉随机 / 紫装`);
ok(LOOT_TABLES.dl_ash_forge_2.entries.filter(e => e.kind === 'fixed' && e.chance === 0.003).length === RAID_RETIRED().length, `长副本退役的 ${RAID_RETIRED().length} 件命名装备进了 30 级副本`);
console.log(fail ? `❌ ${fail} 项失败` : '✅ 全部通过'); process.exit(fail ? 1 : 0);
