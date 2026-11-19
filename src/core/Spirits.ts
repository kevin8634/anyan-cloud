// v0.7.6：英灵传承（引擎无关）。5 个传承槽（10/15/20/25/30 级），只能装本职业已解锁的英灵；装着的英灵随击败首领升阶
import { ModifierDef } from './types';
import { SPIRITS, SpiritDef, SpiritStat, spiritDef, SPIRIT_SLOT_LEVELS, SPIRIT_TIER_AT, ResBonus, NO_BONUS } from '../data/spirits';

export interface SpiritSave { stats: Partial<Record<SpiritStat, number>>; xp: Record<string, number>; slots: (string | null)[]; seen?: string[] }

export class Spirits {
  stats: Partial<Record<SpiritStat, number>> = {};
  /** 每个英灵装备期间累计的首领击杀（升阶用） */
  xp: Record<string, number> = {};
  slots: (string | null)[] = [null, null, null, null, null];
  /** 已经提示过解锁的英灵 */
  seen = new Set<string>();
  /** v0.7.11：暗岩印记等级（main 注入） */
  paragonLevel: () => number = () => 0;
  constructor(public cls: string, public level: () => number) {}

  slotCount() { return SPIRIT_SLOT_LEVELS.filter(l => this.level() >= l).length; }
  stat(s: SpiritStat) { return s === 'level' ? this.level() : s === 'paragon' ? this.paragonLevel() : this.stats[s] ?? 0; }
  pool(): SpiritDef[] { return SPIRITS.filter(s => s.cls === this.cls); }
  unlocked(d: SpiritDef) { return this.stat(d.unlock.stat) >= d.unlock.n; }
  tier(id: string) { const x = this.xp[id] ?? 0; return SPIRIT_TIER_AT.filter(n => x >= n).length; }
  equipped(): SpiritDef[] { return this.slots.slice(0, this.slotCount()).map(spiritDef).filter((d): d is SpiritDef => !!d && d.cls === this.cls); }

  /** 装 / 卸（slot 超出已开槽位、未解锁、别的职业 → false）；同一英灵只能装一个槽 */
  equip(slot: number, id: string | null): boolean {
    if (slot < 0 || slot >= this.slotCount()) return false;
    if (id) {
      const d = spiritDef(id);
      if (!d || d.cls !== this.cls || !this.unlocked(d)) return false;
      const j = this.slots.indexOf(id); if (j >= 0) this.slots[j] = null;
    }
    this.slots[slot] = id;
    return true;
  }
  /** 新解锁、还没提示过的英灵 */
  newlyUnlocked(): SpiritDef[] { const r = this.pool().filter(d => this.unlocked(d) && !this.seen.has(d.id)); r.forEach(d => this.seen.add(d.id)); return r; }
  /** 计数 +n；kind = 首领类型时给装着的英灵加升阶经验，返回升阶的英灵 */
  bump(s: SpiritStat, n = 1): SpiritDef[] {
    this.stats[s] = (this.stats[s] ?? 0) + n;
    const up: SpiritDef[] = [];
    if (s === 'dungeon' || s === 'raid') for (const d of this.equipped()) {
      const t0 = this.tier(d.id); this.xp[d.id] = (this.xp[d.id] ?? 0) + n * (s === 'raid' ? 2 : 1);
      if (this.tier(d.id) > t0) up.push(d);
    }
    return up;
  }
  setStat(s: SpiritStat, v: number) { this.stats[s] = Math.max(this.stats[s] ?? 0, v); }

  modifiers(): ModifierDef[] { return this.equipped().flatMap(d => d.mods(this.tier(d.id)).map(m => ({ ...m, cls: this.cls }))); }
  resBonus(): ResBonus {
    const b = { ...NO_BONUS };
    for (const d of this.equipped()) { const r = d.res?.(this.tier(d.id)); if (r) for (const k of Object.keys(r) as (keyof ResBonus)[]) b[k] += r[k] ?? 0; }
    return b;
  }

  save(): SpiritSave { return { stats: { ...this.stats }, xp: { ...this.xp }, slots: [...this.slots], seen: [...this.seen] }; }
  load(s?: SpiritSave | null) {
    this.stats = { ...(s?.stats ?? {}) }; this.xp = { ...(s?.xp ?? {}) };
    this.slots = [0, 1, 2, 3, 4].map(i => s?.slots?.[i] ?? null);
    this.seen = new Set(s?.seen ?? []);
  }
}
