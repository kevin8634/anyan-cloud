// v0.8.2 每周挑战：按 ISO 周编号生成固定种子 —— 同一周所有人（所有角色）打的是同一趟深渊：
//   同样的场地顺序、同样的岔路、开局自带 2 个固定畸变。本地排行榜记每一趟的成绩（每周前 10）。
import { MUTS_EARLY, MutId } from '../data/abyss';
import { rng } from './Abyss';

export interface IsoWeek { year: number; week: number; key: string }
/** ISO 8601 周：周一开始，含 1 月 4 日的那周是第 1 周（按本地日期算） */
export function isoWeek(d: Date): IsoWeek {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7;            // 周一 = 0
  t.setDate(t.getDate() - day + 3);            // 本周的周四决定年份
  const year = t.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { year, week, key: `${year}-W${String(week).padStart(2, '0')}` };
}
/** 本周一 00:00 到下周一 00:00 */
export function weekRange(d: Date): { start: Date; end: Date } {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate() - (s.getDay() + 6) % 7);
  const e = new Date(s); e.setDate(e.getDate() + 7);
  return { start: s, end: e };
}
/** FNV-1a：周编号 → 种子（固定，可复现） */
export function weekSeed(key: string): number {
  let h = 0x811c9dc5;
  for (const ch of `ankyan-weekly-${key}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** 本周固定畸变：前 6 种里挑 2 个 */
export function weekMuts(seed: number): MutId[] {
  const r = rng(seed, 9), a = MUTS_EARLY.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 2);
}

export interface WeekEntry { week: string; floor: number; cleared: boolean; t: number; cls: string; name: string; muts: number; score: number; at: number }
export interface WeeklySave { entries: WeekEntry[]; claimed: Record<string, number> }
export const newWeeklySave = (): WeeklySave => ({ entries: [], claimed: {} });
/** 分数：层数为主，同层用时越短越高（通关额外 +1 层的分） */
export const weekScore = (floor: number, cleared: boolean, t: number) => (floor + (cleared ? 1 : 0)) * 100000 + Math.max(0, 99999 - Math.round(t));
export const WEEK_KEEP = 10;                     // 每周保留前 10
export const WEEK_HISTORY = 8;                   // 最多保留最近 8 周
/** 每周首次达到的层数奖励（深渊碎片），每周每档只给一次 */
export const WEEK_REWARDS: { floor: number; shards: number }[] = [{ floor: 5, shards: 8 }, { floor: 10, shards: 15 }, { floor: 15, shards: 20 }, { floor: 20, shards: 30 }];

export function loadWeekly(s?: Partial<WeeklySave> | null): WeeklySave {
  const out = newWeeklySave();
  if (!s) return out;
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  for (const e of Array.isArray(s.entries) ? s.entries : []) {
    if (!e || typeof e.week !== 'string' || !/^\d{4}-W\d{2}$/.test(e.week)) continue;
    const floor = n(e.floor, 20), t = n(e.t, 1e6), cleared = !!e.cleared;
    out.entries.push({ week: e.week, floor, cleared, t, cls: String(e.cls ?? '').slice(0, 16), name: String(e.name ?? '').slice(0, 24), muts: n(e.muts, 12), score: weekScore(floor, cleared, t), at: n(e.at, 1e14) });
  }
  if (s.claimed && typeof s.claimed === 'object') for (const [k, v] of Object.entries(s.claimed)) if (/^\d{4}-W\d{2}$/.test(k)) out.claimed[k] = n(v, 20);
  trim(out);
  return out;
}
function trim(s: WeeklySave) {
  const weeks = [...new Set(s.entries.map(e => e.week))].sort().reverse().slice(0, WEEK_HISTORY);
  s.entries = weeks.flatMap(w => board(s, w));
  for (const k of Object.keys(s.claimed)) if (!weeks.includes(k) && Object.keys(s.claimed).length > WEEK_HISTORY) delete s.claimed[k];
}
/** 某周排行（分数高 → 低，同分先到先得） */
export function board(s: WeeklySave, week: string): WeekEntry[] {
  return s.entries.filter(e => e.week === week).sort((a, b) => b.score - a.score || a.at - b.at).slice(0, WEEK_KEEP);
}
/** 记一趟成绩：返回名次（1 起；没进前 10 返回 0）和本周新拿到的层数奖励 */
export function addWeekRun(s: WeeklySave, e: Omit<WeekEntry, 'score'>): { rank: number; shards: number; reached: number[] } {
  const entry: WeekEntry = { ...e, score: weekScore(e.floor, e.cleared, e.t) };
  s.entries.push(entry);
  trim(s);
  const rank = board(s, e.week).indexOf(entry) + 1;
  const had = s.claimed[e.week] ?? 0, got = WEEK_REWARDS.filter(r => r.floor > had && e.floor >= r.floor);
  if (got.length) s.claimed[e.week] = Math.max(had, ...got.map(r => r.floor));
  return { rank, shards: got.reduce((a, r) => a + r.shards, 0), reached: got.map(r => r.floor) };
}
