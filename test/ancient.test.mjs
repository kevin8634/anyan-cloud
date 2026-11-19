// v0.9.6b：太古装备自检（npx tsx test/ancient.test.mjs）
import { LOOT_DATA } from '../src/data/loot.ts';
import { LootGenerator } from '../src/core/Loot.ts';
import { ancientMod, ancDesc, ancChance, ancEvery, rollAncient, ANCIENT_SUFFIX } from '../src/core/Ancient.ts';
import { ALL_ENDGAME_LG } from '../src/data/endgame_pools.ts';
import { LG_V091 } from '../src/data/legendary_v091_table.ts';
import { DARK_ITEMS } from '../src/data/darkgold.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
ok(ancChance(0.2) === 0.4 && ancChance(0.4) === 0.6 && ancChance(0.3, true) === 0.5, '几率 ×2 封顶 60%，重置类 50%');
ok(ancEvery(3) === 2 && ancEvery(2) === 2 && ancEvery(5) === 4, '每第 N 次 → N-1，最少 2');
const m = ancientMod({ id: 'x', name: 'x', desc: '', source: 'equipment', match: {}, ops: [
  { op: 'mul', stat: 'damage', value: 0.25 }, { op: 'mul', stat: 'cooldown', value: -0.4 }, { op: 'add', stat: 'projectileCount', value: 1 },
  { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.3 } }, { op: 'addEffect', effect: { type: 'critEvery', n: 4 } },
  { op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 10, duration: 4 } }, { op: 'addEffect', effect: { type: 'chain', jumps: 3, radius: 5, damagePercent: 0.6 } }] });
const [d, cd, pc, rc, ce, dot, ch] = m.ops;
ok(d.value === 0.5 && cd.value === -0.6 && pc.value === 2, '伤害 ×2、冷却缩减封顶 -60%、数量 +100%');
ok(rc.effect.chance === 0.5 && ce.effect.n === 3 && dot.effect.dps === 20 && dot.effect.duration === 6 && ch.effect.jumps === 6 && ch.effect.damagePercent === 1, '重置 50% 封顶 / 每第 N 次 / 持续 ×1.5 / 弹射 ×2');
ok(ancDesc('技能 1 伤害 +25%，持续 4 秒') === '技能 1 伤害 +50%，持续 6 秒', `描述换算：${ancDesc('技能 1 伤害 +25%，持续 4 秒')}`);
ok(ancDesc('20% 几率重置冷却').includes('40%') && ancDesc('暴击时 40% 几率').includes('60%'), '描述几率封顶');
ok(ancDesc('每第 3 次施放必定暴击').includes('第 2 次'), `描述每第 N 次：${ancDesc('每第 3 次施放必定暴击')}`);
ok(ancDesc('生命低于 50% 时伤害 +100%') === '生命低于 50% 时伤害 +200%', '条件阈值不翻倍');
const byId = Object.fromEntries(LG_V091.map(a => [a.id, a]));
const g = new LootGenerator(LOOT_DATA, (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
let n = 0, peak = 0, name = 0, fx = 0;
for (const id of ALL_ENDGAME_LG) {
  g.classId = byId[id].cls; const it = g.generateLegendary(id, 44); if (!it) continue;
  const before = JSON.stringify(it.modifiers.map(x => x.ops)), lines = it.lines.join('|');
  ok(g.ancientify(it) || false, `${it.name} 变太古`) || 0;
  n++; if (it.affixLog.every(a => a.r === 1)) peak++; if (it.name.endsWith(ANCIENT_SUFFIX) && it.ancient) name++;
  if (JSON.stringify(it.modifiers.map(x => x.ops)) !== before || it.lines.join('|') !== lines) fx++;
}
ok(n === 96 && peak === 96 && name === 96, `96 件橙装：词条全峰值 ${peak}、名字带（太古）${name}`);
ok(fx === 96, `96 件橙装特效 / 文字都变了（${fx}）`);
const dk = LOOT_DATA.fixedItems.find(f => f.quality === 'dark'); g.classId = undefined; const di = g.generateFixed(dk.id, 70);
ok(di && g.ancientify(di) && di.name.endsWith(ANCIENT_SUFFIX), `暗金 ${dk.name} 可变太古`);
const purple = g.generate(40, 'purple'); ok(!g.ancientify(purple) && !purple.ancient, '紫装不会变太古');
const it2 = g.generateLegendary([...ALL_ENDGAME_LG][0], 44); g.ancientify(it2); const nm = it2.name; g.refreshEffects(it2); g.rebuild(it2);
ok(it2.ancient && it2.name === nm && it2.affixLog.every(a => a.r === 1), '读档刷新 / 重建后太古保留');
const r = g.reforge(it2, 0, 'affix'); ok(!r || r.r === 1, '太古淬炼新词条也是峰值');
let hit = 0; for (let i = 0; i < 4000; i++) { const x = g.generateLegendary([...ALL_ENDGAME_LG][1], 44); if (x && rollAncient(g, x, 0.04)) hit++; }
ok(hit > 100 && hit < 230, `4% 几率实测 ${(hit / 40).toFixed(1)}%`);
console.log(fail ? `❌ ${fail} 项失败` : '✅ 全部通过'); process.exit(fail ? 1 : 0);
