// v0.9.1q 满级固定装等自检
import { LootGenerator, ItemInstance, affixRollRange } from './core/Loot';
import { LOOT_DATA } from './data/loot';
import { FORGE_DATA } from './data/shop';
import { applyUpgrade } from './core/Forge';
import { ENDGAME, abyssIlvl, dungeonIlvl, endgameIlvl, migrateTarget } from './core/EndgameIlvl';
import { DARK_ITEMS } from './data/darkgold';
declare const process: { exitCode?: number };
let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };

ok([0, 1, 2, 3].map(dungeonIlvl).join() === '40,42,44,46', '小副本：普通 40 · 英雄 42 · 史诗 44 · 噩梦 46');
ok([1, 5, 6, 10, 11, 15, 16, 20].map(abyssIlvl).join() === '40,40,45,45,50,50,55,55', '深渊：每 5 层一档 40 / 45 / 50 / 55');
ok(endgameIlvl(27, 'purple', 29, 50) === 27 && endgameIlvl(27, 'dark', 29, 50) === 27, '30 级以前：装等跟怪物走（不改）');
ok(endgameIlvl(33, 'purple', 30, ENDGAME.raid) === 50 && endgameIlvl(44, 'orange', 30, ENDGAME.hell) === 60 && endgameIlvl(33, 'dark', 30, 40) === 70, '30 级起：长副本 50 / 炼狱 60 / 暗金一律 70');

const g = new LootGenerator(LOOT_DATA, Math.random); g.classId = 'warrior';
let lv = 30, ctx = 40; g.ilvlPolicy = (raw, q) => endgameIlvl(raw, q, lv, ctx);
const a = Array.from({ length: 60 }, () => g.generate(31 + Math.floor(Math.random() * 15), 'purple'));
ok(a.every(it => it.itemLevel === 40 && it.ilv2 === 1), '满级野外：60 件装备全部 40（不再浮动）');
ctx = 50; ok(g.generate(36, 'blue').itemLevel === 50, '长副本普通：50');
const dk = g.generateFixed(DARK_ITEMS.find(d => !d.cls || d.cls === 'warrior')!.id, 44)!;
ok(dk.itemLevel === 70, `暗金：${dk.name} 装等 ${dk.itemLevel}`);
lv = 20; ok(g.generate(22, 'blue').itemLevel === 22, '20 级：装等照旧 22');

// 老存档迁移
g.ilvlPolicy = null;
const old = Array.from({ length: 80 }, (_, k) => { const it = g.generate(31 + (k % 18), (['blue', 'purple', 'orange'] as const)[k % 3]); delete it.ilv2; return it; });
const low = g.generate(28, 'purple'); delete low.ilv2;
let keepR = true, inRange = true, up = true;
for (const it of old) {
  const r0 = JSON.stringify(it.affixLog);
  const lvlUp = old.indexOf(it) % 2 ? 3 : 0; if (lvlUp) applyUpgrade(it, lvlUp, FORGE_DATA);
  g.migrateIlvl(it, (x, l) => applyUpgrade(x, l, FORGE_DATA));
  if (JSON.stringify(it.affixLog) !== r0) keepR = false;
  if ((it.upgrade ?? 0) !== lvlUp) up = false;
  const off = it.lines.length - (it.affixLog?.length ?? 0);
  if (!lvlUp) it.affixLog?.forEach((_, i) => { const rr = affixRollRange(it, i, LOOT_DATA); const v = Number(it.lines[off + i].replace(/〔.*?〕|✧/g, '').match(/\d+(\.\d+)?/)?.[0]); if (rr && !(v >= +rr.lo && v <= +rr.hi)) inRange = false; });
}
ok(old.every(it => it.itemLevel === 40 && it.ilv2 === 1), '老存档：30 以上的装备全部改成 40');
ok(keepR, '老存档：词条比例（随机记录）原样保留，不重新随机');
ok(inRange, '老存档：重算后的数值落在 40 装等的区间内');
ok(up, '老存档：强化等级保留');
ok(!g.migrateIlvl(low) && low.itemLevel === 28 && low.ilv2 === 1, '老存档：30 以下的不动');
ok(migrateTarget(old[0]) === null && !g.migrateIlvl(old[0]), '迁移只做一次');
const od = g.generateFixed(dk.fixedId!, 44)!; delete od.ilv2; g.migrateIlvl(od);
ok(od.itemLevel === 70, '老存档暗金：改成 70');
console.log(fail ? `❌ ${fail} 项失败` : '✅ 满级固定装等 全部通过');
if (fail) process.exitCode = 1;
