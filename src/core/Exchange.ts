// ========== 铁匠「兑换」（引擎无关，v0.5 C） ==========
// 用兑换货币（熔心余烬 / 永霜碎晶 / 暗岩徽记，都是 Inventory 里的堆叠物品，随存档保存）+ 金币换：
//   1. 暗岩锻造系列：16 个穿戴格每格一件（护甲类型跟职业），史诗、装等 = 等级 + 3；玩家从特殊属性池里自选一条 ✦（定向获取）
//   2. 套装缺件：只列本职业套装里你还没有的部件（背包 / 身上 / 仓库都算有），比锻造贵，每周 1 件
//   （v0.5 C 的词条重铸、强化保护符在主线 v0.6.6 取消：重铸 → 铁匠「淬炼」，强化不再掉级）
//   宝石升级：以后开放
// 每周限购按 ISO 周（每周一刷新），状态存在存档 exchange 字段（v8）
import { Inventory, EquipSlot } from './Inventory';
import { LootGenerator, ItemInstance, AffixDef } from './Loot';
import { ForgeData } from './Forge';
import {
  CurCost, FORGE_BASES, FORGE_ILVL_BONUS, FORGE_QUALITY, FORGE_SERIES, forgeCost, setPieceCost, SET_ILVL_BONUS,
  WEEKLY_LIMIT, LimitKind, LIMIT_NAME, RAID_CURRENCY,
} from '../data/exchange';

/** ISO 周（周一开始；年份按该周周四所在的年）。原在 v0.5 A 的 core/Scaling.ts，Scaling 随 B 的难度层退役后搬到这里 */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - y0.getTime()) / 86400000 + 1) / 7) };
}

export interface ExchangeState { week: string; used: Partial<Record<LimitKind, number>> }
export const newExchangeState = (): ExchangeState => ({ week: '', used: {} });
export const weekKey = (d: Date) => { const w = isoWeek(d); return `${w.year}-W${w.week}`; };

export type ExResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export class Exchange {
  state: ExchangeState = newExchangeState();
  constructor(private inv: Inventory, private gen: LootGenerator, private forgeData: ForgeData, private specialPool: AffixDef[],
    private names: (id: string) => string = id => id, public now: () => Date = () => new Date()) {}

  load(s?: ExchangeState | null) { this.state = { week: s?.week ?? '', used: { ...(s?.used ?? {}) } }; this.rollWeek(); }
  save(): ExchangeState { this.rollWeek(); return { week: this.state.week, used: { ...this.state.used } }; }

  /** 跨周了就清零限购 */
  rollWeek() { const k = weekKey(this.now()); if (this.state.week !== k) { this.state.week = k; this.state.used = {}; } }
  left(kind: LimitKind): number { this.rollWeek(); return Math.max(0, WEEKLY_LIMIT[kind] - (this.state.used[kind] ?? 0)); }

  /** 付不起的原因（金币 / 货币 / 每周限购），null = 可以 */
  whyCannotPay(cost: CurCost, kind?: LimitKind, n = 1): string | null {
    if (kind && this.left(kind) < n) return `本周${LIMIT_NAME[kind]}已兑换 ${WEEKLY_LIMIT[kind]} 次（每周一刷新）`;
    for (const c of cost.cur) if (this.inv.stack(c.id) < c.count * n) return `${this.names(c.id)}不足（需要 ${c.count * n}，拥有 ${this.inv.stack(c.id)}）`;
    if (this.inv.gold < cost.gold * n) return `金币不足（需要 ${cost.gold * n}）`;
    return null;
  }
  private pay(cost: CurCost, kind?: LimitKind, n = 1) {
    this.inv.spendGold(cost.gold * n);
    cost.cur.forEach(c => this.inv.useStack(c.id, c.count * n));
    if (kind) this.state.used[kind] = (this.state.used[kind] ?? 0) + n;
  }

  // ---------------- 1. 暗岩锻造 ----------------
  forgeBases(cls: string, slot: EquipSlot): string[] { return FORGE_BASES[cls]?.[slot] ?? []; }
  /** 这个格子能选的特殊属性（按物品部位过滤；主手按选的底材） */
  forgeSpecials(cls: string, slot: EquipSlot, baseId?: string): AffixDef[] {
    const b = this.gen.base(baseId ?? this.forgeBases(cls, slot)[0]);
    return b ? this.specialPool.filter(a => a.slots.includes(b.slot) && (!a.cls || a.cls === cls)) : [];
  }
  forgeCost(slot: EquipSlot, level: number) { return forgeCost(slot, level); }
  forgeItem(cls: string, slot: EquipSlot, baseId: string, specialId: string, level: number): ExResult<ItemInstance> {
    if (!this.forgeBases(cls, slot).includes(baseId)) return { ok: false, reason: '这个部位不能锻造这种底材' };
    if (!this.forgeSpecials(cls, slot, baseId).some(a => a.id === specialId)) return { ok: false, reason: '请选择一条特殊属性' };
    const cost = forgeCost(slot, level);
    const why = this.whyCannotPay(cost, 'forge') ?? (this.inv.isFull ? '背包已满' : null);
    if (why) return { ok: false, reason: why };
    const it = this.gen.generateFromBase(baseId, level + FORGE_ILVL_BONUS, FORGE_QUALITY);
    if (!it) return { ok: false, reason: '底材不存在' };
    this.gen.addChosenSpecial(it, specialId, this.specialPool);
    it.name = `${FORGE_SERIES}·${it.name}`;
    it.forged = true;
    this.pay(cost, 'forge');
    this.inv.add(it);
    return { ok: true, value: it };
  }

  // ---------------- 2. 套装缺件 ----------------
  /** 本职业套装里还没有的部件（owned = 背包 + 身上 + 仓库的装备） */
  missingSetPieces(pieces: string[], owned: ItemInstance[]): string[] {
    const have = new Set(owned.filter(i => i.setId).flatMap(i => [i.fixedId ?? '', i.name]));
    return pieces.filter(id => !have.has(id) && !have.has(this.gen.fixedName(id) ?? '\u0000'));
  }
  setCost(level: number) { return setPieceCost(level); }
  buySetPiece(pieceId: string, pieces: string[], owned: ItemInstance[], level: number): ExResult<ItemInstance> {
    if (!this.missingSetPieces(pieces, owned).includes(pieceId)) return { ok: false, reason: '只能兑换还没有的套装部件' };
    const cost = setPieceCost(level);
    const why = this.whyCannotPay(cost, 'set') ?? (this.inv.isFull ? '背包已满' : null);
    if (why) return { ok: false, reason: why };
    const it = this.gen.generateFixed(pieceId, level + SET_ILVL_BONUS);
    if (!it) return { ok: false, reason: '套装部件不存在' };
    this.pay(cost, 'set');
    this.inv.add(it);
    return { ok: true, value: it };
  }
}

/** 兑换货币掉落：长副本首领（final = 最终首领，hell = 炼狱 ×1.5）/ 普通副本史诗+ 首领。返回要加进背包的堆叠物品 */
export function raidCurrencyDrop(o: { raid?: string; final?: boolean; hell?: boolean; dungeon?: string; diff?: string }, rng: () => number = Math.random): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = [];
  let list: { id: string; chance: number; min: number; max: number }[] = [];
  if (o.raid && RAID_CURRENCY.raid[o.raid]) list = o.final ? RAID_CURRENCY.raid[o.raid].final : RAID_CURRENCY.raid[o.raid].boss;
  else if (o.dungeon && (o.diff === 'epic' || o.diff === 'nightmare')) list = (RAID_CURRENCY.dungeon[o.diff] ?? []).map(d => d.id === '@theme' ? { ...d, id: RAID_CURRENCY.dungeonTheme[o.dungeon!] ?? '' } : d).filter(d => d.id);
  for (const d of list) if (rng() < d.chance) {
    const n = d.min + Math.floor(rng() * (d.max - d.min + 1));
    out.push({ id: d.id, count: o.hell ? Math.ceil(n * 1.5) : n });
  }
  return out;
}
