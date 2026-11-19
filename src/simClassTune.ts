// v0.7.14 职业平衡系数自检：npm run classtune
declare const process: { exitCode?: number };
import { CLASS_TUNE, perUnitV3 as perUnit, ROT_BASELINE, ROT_TARGET_V3 as ROT_TARGET, SURVIVAL_SPECS, tuneFor, classTuneMod } from './data/classtune_v0714';
import { CLASSES } from './data/classes';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const specs = Object.values(CLASSES).flatMap(c => c.tree.specs.map(s => s.id));
ok(specs.length === 12 && specs.every(s => CLASS_TUNE[s] != null), `12 个天赋系都有系数（${specs.join(' ')}）`);
const P = (s: string) => perUnit(s) * CLASS_TUNE[s];   // 用所有实测样本按系数线性推算
const proj = specs.map(P);
const dps = specs.filter(s => !SURVIVAL_SPECS.has(s)).map(P);
const gap = (Math.max(...dps) - Math.min(...dps)) / Math.min(...dps);
ok(gap <= 0.1, `输出系预计 DPS 差 ${(gap * 100).toFixed(1)}%（≤ 10%）`);
ok(proj.every(v => v > 0) && specs.every(s => CLASS_TUNE[s] > 0.3 && CLASS_TUNE[s] < 2), '系数在 0.3–2 之间');
ok([...SURVIVAL_SPECS].every(s => Math.abs(P(s) / ROT_TARGET.dps - 0.855) < 0.05), '生存系 ≈ 输出系 85%');
ok(tuneFor('warrior', null) > 1 && tuneFor('chrono', null) < 1, '没点天赋用职业平均（战士 > 1，时砂 < 1）');
ok(classTuneMod('warrior', 'w_arms')!.ops[0].op === 'more', '用独立乘区 more');
ok(tuneFor('unknown', null) === 1 && classTuneMod('unknown', null) === null, '未知职业不调整');
for (const s of specs) console.log(`   ${s.padEnd(9)} 基线 ${ROT_BASELINE[s]} → 系数 ${CLASS_TUNE[s]}，推算 ${Math.round(P(s))}`);
if (fail) process.exitCode = 1;
