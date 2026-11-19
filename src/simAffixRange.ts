// v0.9.1p 词条区间自检：每条词条的实际数值都在显示的区间内
import { LootGenerator, affixRollRange } from './core/Loot';
import { LOOT_DATA } from './data/loot';
declare const process: { exitCode?: number };
let bad = 0, n = 0; const ex: string[] = [];
for (const cls of ['warrior', 'mage', 'chrono', 'alchemy']) {
  const g = new LootGenerator(LOOT_DATA, Math.random); g.classId = cls;
  for (let k = 0; k < 400; k++) {
    const it = g.generate(30 + (k % 12), (['blue', 'purple', 'orange'] as const)[k % 3]);
    const off = it.lines.length - (it.affixLog?.length ?? 0);
    it.affixLog?.forEach((_, i) => {
      const r = affixRollRange(it, i, LOOT_DATA); if (!r) return;
      const line = it.lines[off + i]; const v = Number(line.replace(/〔.*?〕|✧/g, '').match(/\d+(\.\d+)?/)?.[0]);
      n++; if (!(v >= +r.lo - 1e-9 && v <= +r.hi + 1e-9)) { bad++; if (ex.length < 5) ex.push(`${line} 〔${r.text}〕`); }
    });
  }
}
console.log(bad ? `❌ ${bad}/${n} 条超出区间：${ex.join(' | ')}` : `✅ ${n} 条词条全部落在显示区间内`);
if (bad) process.exitCode = 1;
