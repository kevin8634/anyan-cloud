// v0.8.0 暗岩深渊（引擎无关）：一趟 = 一个种子；每层的副本场地 / 怪数 / 首领、岔路选项、畸变、缩放、奖励都由种子决定
// 浏览器版 web/raid.ts 的 abyss* 函数按这里的计划摆怪；npm run abyss 验证确定性和数值曲线
import { ABYSS, MUTS, MutId, PathKind, PATHS, MUTS_EARLY } from '../data/abyss';

import { abyssIlvl, abyssGearRatio } from './EndgameIlvl';
export interface AbyState {
  seed: number; floor: number;          // 当前层（1 起）
  muts: MutId[];                         // 本趟已有的畸变
  bonus: number;                         // 奖励倍率（畸变岔路 +0.25、精英 +0.5 当层）
  elite: boolean;                        // 下一层有精英
  deaths: number; t: number;             // 用时（秒）
  dungeons: string[];                    // 1–5 层 / 6–10 层用哪个副本的场地
  /** v0.8.2：每周挑战的周编号（如 2026-W43）；普通深渊没有 */
  weekly?: string;
  /** v0.8.3：第 6 章剧情最终战（只有第 20 层，不记纪录） */
  story?: boolean;
}
export interface AbySave { best: number; runs: number; clears: number; bestTime: number; bestMuts: number }
export const newAbySave = (): AbySave => ({ best: 0, runs: 0, clears: 0, bestTime: 0, bestMuts: 0 });
export function abyLoadSave(s?: Partial<AbySave> | null): AbySave {
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return { best: n(s?.best, ABYSS.maxFloor), runs: n(s?.runs, 1e6), clears: n(s?.clears, 1e6), bestTime: n(s?.bestTime, 1e6), bestMuts: n(s?.bestMuts, 12) };
}

/** 可复现随机（mulberry32），salt 区分用途 */
export function rng(seed: number, salt: number) {
  let a = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: readonly T[], r: () => number): T[] { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function newAbyRun(seed: number): AbyState {
  const d = shuffle(ABYSS.dungeons, rng(seed, 1));
  // 每 5 层一段：1–5 / 6–10 / 11–15 用三座不同副本，16–20 回到第一座（打它的隐藏首领）
  return { seed: seed >>> 0, floor: 1, muts: [], bonus: 1, elite: false, deaths: 0, t: 0, dungeons: [d[0], d[1], d[2], d[0]] };
}

export const isBossFloor = (f: number) => f % 5 === 0;
/** 层数缩放：生命 / 伤害每层 +8%（复利），机制伤害倍率封顶 */
export function floorScale(f: number, muts: MutId[] = []) {
  const s = Math.pow(1 + ABYSS.perFloor, f - 1), g = abyssGearRatio(f);
  const k = (id: MutId, v: number) => (muts.includes(id) ? v : 1);
  return {
    // v0.9.1q：按新装等档（40/45/50/55）的角色重调：生命 / 伤害 × 新旧装备强度比
    hp: +(ABYSS.baseHp * s * g * k('tough', MUTS.tough.value)).toFixed(3),
    dmg: +(ABYSS.baseDmg * s * g * k('fury', MUTS.fury.value)).toFixed(3),
    hz: +Math.min(ABYSS.hzCap, ABYSS.baseHz * s * k('fury', MUTS.fury.value)).toFixed(3),
    speed: k('swift', MUTS.swift.value),
    ilvlMob: abyssIlvl(f), ilvlBoss: abyssIlvl(f),   // v0.9.1q：每 5 层一档，小怪 / 首领同装等
  };
}

export interface FloorPlan { floor: number; dungeon: string; room: number; boss: number | null; mobs: number; elite: boolean; ember: boolean; burst: boolean; has: (m: MutId) => boolean }
/** 首领层用哪个首领：5 = 第 1/2 首领（种子决定），10 / 15 = 最终首领，20 = 隐藏首领 */
export const bossOf = (s: AbyState, f: number) => f === 5 ? Math.floor(rng(s.seed, 100 + f)() * 2) : f === 20 ? 3 : 2;
/** 这一层怎么摆：普通层用场地 (f-1)%3 */
export function floorPlan(s: AbyState, f = s.floor): FloorPlan {
  const seg = Math.min(s.dungeons.length - 1, Math.floor((f - 1) / 5)), dungeon = s.dungeons[seg] ?? s.dungeons[0];
  const boss = isBossFloor(f) ? bossOf(s, f) : null;
  const base = ABYSS.mobsBase + Math.floor(f / 2);
  const mobs = boss !== null ? 0 : Math.round(base * (s.muts.includes('horde') ? MUTS.horde.value : 1));
  const muts = s.muts.slice();
  return { floor: f, dungeon, room: boss ?? (f - 1) % 3, boss, mobs, elite: s.elite && boss === null, ember: muts.includes('ember'), burst: muts.includes('burst'), has: m => muts.includes(m) };
}

/** 清完一层后的岔路（2–3 个，种子决定）；最后一层没有岔路 */
export function pathChoices(s: AbyState): PathKind[] {
  if (s.floor >= ABYSS.maxFloor) return [];
  const r = rng(s.seed, 200 + s.floor);
  let pool: PathKind[] = ['elite', 'chest', 'mutate', 'rest'];
  if (!s.muts.length) pool = pool.filter(p => p !== 'rest');          // 没有畸变时休息只能回血，换成别的
  if (!nextMut(s)) pool = pool.filter(p => p !== 'mutate');
  const n = isBossFloor(s.floor + 1) ? 2 : 2 + (r() < 0.5 ? 1 : 0);   // 首领层前只给 2 个
  return shuffle(pool, r).slice(0, Math.min(n, pool.length));
}
/** 畸变岔路给哪个畸变（种子 + 层数决定，不和已有的重复） */
export function nextMut(s: AbyState): MutId | null {
  const all = s.floor >= 10 ? (Object.keys(MUTS) as MutId[]) : MUTS_EARLY;   // 第 10 层清完（进 11 层）起 12 种都可能
  const left = all.filter(m => !s.muts.includes(m));
  if (!left.length) return null;
  return left[Math.floor(rng(s.seed, 300 + s.floor)() * left.length)];
}

export interface PathResult { state: AbyState; chest?: { gold: number; rolls: number }; heal?: boolean; removed?: MutId; added?: MutId }
/** 选岔路：返回进入下一层的状态（不改原对象） */
export function applyPath(s: AbyState, kind: PathKind): PathResult {
  const st: AbyState = { ...s, muts: s.muts.slice(), floor: s.floor + 1, elite: false };
  const out: PathResult = { state: st };
  if (kind === 'elite') { st.elite = true; }
  else if (kind === 'chest') out.chest = chestFor(s.floor, s.bonus);
  else if (kind === 'mutate') { const m = nextMut(s); if (m) { st.muts.push(m); st.bonus = +(st.bonus + PATHS.mutate.bonus).toFixed(2); out.added = m; } }
  else if (kind === 'rest') { out.heal = true; if (st.muts.length) { out.removed = st.muts.pop(); st.bonus = Math.max(1, +(st.bonus - PATHS.mutate.bonus).toFixed(2)); } }
  return out;
}
/** 每层清完的奖励：金币 + 掉落次数（首领层另有首领掉落）；精英层 ×1.5 */
export function floorReward(f: number, bonus: number, elite = false) {
  const k = bonus * (elite ? PATHS.elite.bonus : 1);
  return { gold: Math.round((ABYSS.goldBase + ABYSS.goldPerFloor * f) * k * (isBossFloor(f) ? ABYSS.goldBossMul : ABYSS.goldMul)), rolls: Math.max(1, Math.round((isBossFloor(f) ? 2 : 1) * k)), paragon: Math.round(ABYSS.paragonPerFloor * f * k),
    shards: Math.round((ABYSS.shardBase + Math.floor(f / 5) + (isBossFloor(f) ? ABYSS.shardBoss : 0)) * k) };
}
export const chestFor = (f: number, bonus: number) => ({ gold: Math.round((ABYSS.goldBase * 2 + ABYSS.goldPerFloor * f * 2) * bonus), rolls: 2 });

/** 一趟结束（死亡 / 退出 / 通关）：更新最高层；返回是否破纪录 */
export function abyFinish(save: AbySave, s: AbyState, reached: number, cleared: boolean): boolean {
  const rec = reached > save.best || (reached === save.best && cleared && (!save.bestTime || s.t < save.bestTime));
  save.runs++;
  if (cleared) save.clears++;
  if (rec) { save.best = reached; save.bestMuts = s.muts.length; if (cleared) save.bestTime = Math.round(s.t); }
  return rec;
}
