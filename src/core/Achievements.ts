// v0.7.12：成就与首领名册（引擎无关）。进度 = 读当前状态快照；完成后记时间戳，不会因为状态回落而撤销
import { ACHIEVEMENTS, AchDef, AchStat, POINT_TITLES, achDef } from '../data/achievements';

export type AchSnap = Record<AchStat, number> & Partial<Record<`pk_${string}`, number>>;   // v1.2.9 pk_ = 内容包状态
export interface AchSave { done: Record<string, number>; kills: number; deaths: number; boss: Record<string, number>; title?: string | null }

export class Achievements {
  done: Record<string, number> = {};
  kills = 0; deaths = 0;
  /** 首领名册：名字 → 击败次数 */
  boss: Record<string, number> = {};
  title: string | null = null;

  progress(a: AchDef, s: AchSnap) { return Math.min(a.n, Math.max(0, Math.floor(s[a.stat] ?? 0))); }
  /** 检查快照，返回这次新完成的成就 */
  check(s: AchSnap, now = Date.now()): AchDef[] {
    const r: AchDef[] = [];
    for (const a of ACHIEVEMENTS) if (!this.done[a.id] && (s[a.stat] ?? 0) >= a.n) { this.done[a.id] = now; r.push(a); }
    return r;
  }
  points() { return ACHIEVEMENTS.reduce((t, a) => t + (this.done[a.id] ? a.pts : 0), 0); }
  maxPoints() { return ACHIEVEMENTS.reduce((t, a) => t + a.pts, 0); }
  count() { return Object.keys(this.done).filter(id => achDef(id)).length; }
  titles(): string[] {
    const t = ACHIEVEMENTS.filter(a => a.title && this.done[a.id]).map(a => a.title!);
    const p = this.points(); POINT_TITLES.forEach(([n, name]) => { if (p >= n) t.push(name); });
    return [...new Set(t)];
  }
  setTitle(t: string | null) { if (t && !this.titles().includes(t)) return false; this.title = t; return true; }
  noteBoss(name: string) { this.boss[name] = (this.boss[name] ?? 0) + 1; }

  save(): AchSave { return { done: { ...this.done }, kills: this.kills, deaths: this.deaths, boss: { ...this.boss }, title: this.title }; }
  load(s?: Partial<AchSave> | null) {
    this.done = { ...(s?.done ?? {}) }; this.kills = s?.kills ?? 0; this.deaths = s?.deaths ?? 0; this.boss = { ...(s?.boss ?? {}) };
    this.title = typeof s?.title === 'string' ? s.title : null;
  }
}
