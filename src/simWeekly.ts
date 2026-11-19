// v0.8.2 每周挑战单元测试：npm run weekly
import { isoWeek, weekSeed, weekMuts, newWeeklySave, addWeekRun, board, loadWeekly, weekScore } from './core/Weekly';
import { newAbyRun, floorPlan } from './core/Abyss';
let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fail++; };
// ISO 周：已知日期
const cases: [string, string][] = [['2026-10-20', '2026-W43'], ['2026-01-01', '2026-W01'], ['2027-01-01', '2026-W53'], ['2021-01-03', '2020-W53'], ['2024-12-30', '2025-W01'], ['2026-10-25', '2026-W43'], ['2026-10-26', '2026-W44']];
for (const [d, k] of cases) { const [y, m, dd] = d.split('-').map(Number); check(isoWeek(new Date(y, m - 1, dd)).key === k, `${d} → ${isoWeek(new Date(y, m - 1, dd)).key}（应为 ${k}）`); }
const s1 = weekSeed('2026-W43'), s2 = weekSeed('2026-W44');
check(s1 === weekSeed('2026-W43') && s1 !== s2, `种子固定且每周不同：${s1} / ${s2}`);
const m = weekMuts(s1);
check(m.length === 2 && m[0] !== m[1] && JSON.stringify(m) === JSON.stringify(weekMuts(s1)), `本周固定畸变：${m.join(' + ')}`);
const a = newAbyRun(s1), b = newAbyRun(s1);
check(JSON.stringify(a.dungeons) === JSON.stringify(b.dungeons) && [1, 7, 13, 18].every(f => JSON.stringify(floorPlan(a, f)) === JSON.stringify(floorPlan(b, f))), `同周同场地：${a.dungeons.join(' → ')}`);
// 排行
const w = newWeeklySave();
const r1 = addWeekRun(w, { week: '2026-W43', floor: 7, cleared: false, t: 400, cls: '战士', name: 'A', muts: 3, at: 1 });
check(r1.rank === 1 && r1.shards === 8 && w.claimed['2026-W43'] === 5, `第一趟 7 层：第 ${r1.rank} 名，奖励碎片 ${r1.shards}`);
const r2 = addWeekRun(w, { week: '2026-W43', floor: 7, cleared: false, t: 300, cls: '法师', name: 'B', muts: 3, at: 2 });
check(r2.rank === 1 && r2.shards === 0, '同层更快排第一，奖励不重复给');
const r3 = addWeekRun(w, { week: '2026-W43', floor: 20, cleared: true, t: 1500, cls: '战士', name: 'A', muts: 6, at: 3 });
check(r3.rank === 1 && r3.shards === 15 + 20 + 30 && r3.reached.join() === '10,15,20', `通关 20 层：奖励 ${r3.shards}（10/15/20 层档）`);
check(weekScore(20, true, 1500) > weekScore(20, false, 10), '通关高于没通关的同层');
for (let i = 0; i < 12; i++) addWeekRun(w, { week: '2026-W43', floor: 1, cleared: false, t: 60, cls: '战士', name: 'C', muts: 0, at: 10 + i });
check(board(w, '2026-W43').length === 10 && board(w, '2026-W43')[0].floor === 20, '每周只留前 10');
for (let i = 1; i <= 10; i++) addWeekRun(w, { week: `2027-W${String(i).padStart(2, '0')}`, floor: 3, cleared: false, t: 100, cls: '战士', name: '', muts: 0, at: 100 + i });
check(new Set(w.entries.map(e => e.week)).size === 8 && !w.entries.some(e => e.week === '2026-W43'), '最多留最近 8 周');
const back = loadWeekly(JSON.parse(JSON.stringify(w)));
check(back.entries.length === w.entries.length && loadWeekly({ entries: [{ week: 'x' } as never, { week: '2026-W01', floor: 99, t: -5 } as never] }).entries[0].floor === 20, '存档读写 + 坏数据清洗');
console.log(fail ? `❌ ${fail} 项失败` : '✅ 每周挑战全部通过');
(globalThis as unknown as { process: { exit(n: number): void } }).process.exit(fail ? 1 : 0);
