// ========== v0.7.10：暗岩印记（精英等级，满级 30 之后的长期成长） ==========
// 30 级后经验转成「印记经验」：长副本（熔心王座 / 永霜墓穴）里全额，其他地方 25%。
// 精英等级 0~100，每级 1 点投进四条印记（每条最多 25 点，单点收益递减）；精英 20/40/60/80/100 级各送 1 个天赋点。
export const PARAGON_MAX = 100;
export const MARK_CAP = 25;
export type MarkId = 'might' | 'grit' | 'swift' | 'fate';
export interface MarkDef { id: MarkId; name: string; desc: string; per: Partial<Record<'power' | 'hp' | 'armor' | 'haste' | 'speed' | 'crit' | 'critDmg', number>> }
export const MARKS: MarkDef[] = [
  { id: 'might', name: '力量之印', desc: '主属性（强度）', per: { power: 6 } },
  { id: 'grit', name: '坚韧之印', desc: '生命和护甲', per: { hp: 40, armor: 4 } },
  { id: 'swift', name: '迅捷之印', desc: '急速和移速', per: { haste: 0.4, speed: 0.3 } },
  { id: 'fate', name: '命运之印', desc: '暴击和暴伤', per: { crit: 0.25, critDmg: 1.2 } },
];
/** 递减：第 i 点收益 = 1 − (i−1)/50，25 点合计 19 点的效果 */
export const markEff = (p: number) => p * (1 - (p - 1) / 100);
export const PARAGON_TALENT_LEVELS = [20, 40, 60, 80, 100];
export interface ParagonSave { level: number; xp: number; marks: Partial<Record<MarkId, number>> }

export class Paragon {
  level = 0; xp = 0;
  marks: Record<MarkId, number> = { might: 0, grit: 0, swift: 0, fate: 0 };
  onLevelUp: ((lv: number) => void) | null = null;
  xpToNext(lv = this.level) { return 4000 + 400 * lv; }
  get spent() { return Object.values(this.marks).reduce((a, b) => a + b, 0); }
  get available() { return this.level - this.spent; }
  get talentPoints() { return PARAGON_TALENT_LEVELS.filter(l => this.level >= l).length; }
  addXp(n: number): number {
    if (this.level >= PARAGON_MAX || n <= 0) return 0;
    this.xp += Math.round(n); let g = 0;
    while (this.level < PARAGON_MAX && this.xp >= this.xpToNext()) { this.xp -= this.xpToNext(); this.level++; g++; this.onLevelUp?.(this.level); }
    if (this.level >= PARAGON_MAX) this.xp = 0;
    return g;
  }
  add(id: MarkId): boolean { if (this.available < 1 || this.marks[id] >= MARK_CAP) return false; this.marks[id]++; return true; }
  remove(id: MarkId): boolean { if (this.marks[id] < 1) return false; this.marks[id]--; return true; }
  reset() { for (const k of Object.keys(this.marks) as MarkId[]) this.marks[k] = 0; }
  stats() {
    const s = { power: 0, hp: 0, armor: 0, haste: 0, speed: 0, crit: 0, critDmg: 0 };
    for (const m of MARKS) { const e = markEff(this.marks[m.id]); for (const [k, v] of Object.entries(m.per) as [keyof typeof s, number][]) s[k] += Math.round(v * e * 10) / 10; }
    return s;
  }
  save(): ParagonSave { return { level: this.level, xp: this.xp, marks: { ...this.marks } }; }
  load(s: Partial<ParagonSave> | null | undefined) {
    this.level = Math.max(0, Math.min(PARAGON_MAX, (s?.level ?? 0) | 0)); this.xp = Math.max(0, (s?.xp ?? 0) | 0);
    this.reset();
    for (const m of MARKS) this.marks[m.id] = Math.max(0, Math.min(MARK_CAP, (s?.marks?.[m.id] ?? 0) | 0));
    while (this.spent > this.level) { const k = (Object.keys(this.marks) as MarkId[]).find(x => this.marks[x] > 0)!; this.marks[k]--; }
  }
}
