// ========== 商店 / 强化 / 分解（引擎无关，结果都存在 Inventory 里，随 SaveManager 存档） ==========
// 商店：买药水、材料、基础装备（每次打开按等级刷新货架），卖背包里的装备
// 强化（v0.6.2 重做）：强化的是「部位」——头部栏、武器栏……等级跟着格子走，换装备不丢。
//   +1 ~ +15，不再掉级；失败积累祝福值，成功率逐次上升，满了必成。
//   突破：升到 +5 / +10 / +15 需要首领之证（野外首领）/ 英雄徽记（副本首领）/ 王座之心（长副本首领）。
//   里程碑：+5 / +10 / +15 每次给该部位一个小加成（武器技能伤害、护甲部位生命、首饰暴击、披风移速）。
//   强化效果：生命/护甲 按强化前数值每级 +10%（再加固定值），武器/副手/首饰额外提高所有技能伤害（以修饰器形式挂在装备上，双手武器加得最多）
// 分解：装备 → 材料 + 少量金币（v0.5 C 的 salvageGold），品质越高给得越好；强化过的装备额外返还一部分材料
//   一键分解按品质勾选 + 保护选项（v0.6.2，取代 v0.5 C 的三个按钮）；永远跳过 已锁定（v0.5 C）/ 暗金
// v0.6.6 主线：v0.5 C 取消装备出售，灰色杂物进任何商人自动卖钱（sellJunk）；v0.5 C 的强化保护符因强化不掉级而取消
import { Inventory, EquipSlot, EQUIP_SLOTS } from './Inventory';
import { ItemInstance, ItemSlot, LootGenerator, Quality, QUALITIES } from './Loot';

/** 可堆叠物品种类：材料 / 药水 / 杂物（灰色，进商人自动卖钱）/ 兑换货币 / 强化保护符 */
export type StackKind = 'material' | 'potion' | 'junk' | 'currency' | 'charm';
export interface StackDef {
  id: string;
  name: string;
  kind: StackKind;
  quality: Quality;
  desc: string;
  /** 杂物：每个卖多少金币 */
  price?: number;
  /** 兑换货币：临时来源说明（阶段六长副本上线后替换） */
  source?: string;
  healPercent?: number;     // 药水：回复最大生命的百分比
  cooldown?: number;        // 药水：共享冷却（秒）
}

export interface UpgradeStep {
  gold: number;                                // 基础金币（再乘装等系数）
  mats: { id: string; count: number }[];
  chance: number;                              // 成功率 0~1
  dropOnFail?: boolean;                        // （旧版）失败掉 1 级；v0.6.2 起不再使用
}
/** 部位分组：决定强化伤害和里程碑加成 */
export type SlotGroup = 'weapon2' | 'weapon1' | 'off' | 'armor' | 'jewel' | 'back';

export type ShopEntry =
  | { kind: 'stack'; id: string; price: number }
  | { kind: 'gear'; slot: ItemSlot | ItemSlot[]; quality: Quality; priceMul: number };   // 多个类别 = 随机其一（如 单手/双手 武器）

export interface ForgeData {
  stacks: StackDef[];
  upgrade: UpgradeStep[];                      // 下标 0 = 升到 +1
  /** 每级：生命/护甲 +pct×强化前数值 + 固定值；技能伤害按部位 */
  perLevel: { hpPct: number; hpFlat: number; armorPct: number; damage: Partial<Record<ItemSlot, number>> };
  salvage: Record<Quality, { id: string; min: number; max: number }[]>;
  /** 强化等级 → 分解时额外返还 */
  salvageUpgradeBonus: (level: number) => { id: string; count: number }[];
  /** 按部位：强化金币倍率（双手武器贵一些，首饰便宜一些），分解额外材料（双手武器多给） */
  slotUpgradeMul?: Partial<Record<ItemSlot, number>>;
  salvageSlotBonus?: Partial<Record<ItemSlot, { id: string; count: number }[]>>;
  shop: ShopEntry[];
  /** v0.5 C：分解顺带给少量金币 = round((base + perIlvl × 装等) × 品质倍率) */
  salvageGold?: { base: number; perIlvl: number; quality: Record<Quality, number> };
}

export interface Cost { gold: number; mats: { id: string; count: number }[]; chance: number; dropOnFail: boolean; toLevel: number; bless: number; base: number }
export interface ReforgeCost { gold: number; mats: { id: string; count: number }[] }
/** 一键分解的勾选（v0.6.2 A）；v0.6.7 加：onlyUnwearable 只分解不能穿的、maxIlvl 装等低于 X（0 = 不限）、keepEngraved 保留带拓印的 */
export interface SalvageOpts { qualities: Quality[]; keepBetter: boolean; keepElite: boolean; keepSet: boolean; onlyUnwearable?: boolean; maxIlvl?: number; keepEngraved?: boolean }
/** v0.6.7：回购栏一条记录（本次游戏内保留最近 10 件；找回 = 退还当时拿到的材料和金币） */
export interface BuybackEntry { item: ItemInstance; mats: { id: string; count: number }[]; gold: number }
export const BUYBACK_MAX = 10;

export type UpgradeResult = { ok: true; level: number } | { ok: false; level: number; reason: string; consumed: boolean };

/** v0.8.1 暗金重铸价格（和 data/abyss.ts 的 ABYSS.recastShards / recastGold 一致） */
export const RECAST = { shards: 20, gold: 300 };

export class Forge {
  constructor(private data: ForgeData, private inv: Inventory, private rng: () => number = Math.random) {
    inv.slotApply = (it, _slot, lv) => applyUpgrade(it, lv, data);
  }

  get maxLevel() { return this.data.upgrade.length; }

  /** v0.6.7：最近分解的 10 件（新的在前），不进存档 */
  buyback: BuybackEntry[] = [];
  /** 找回：退还当时拿到的材料和金币；材料 / 金币不够或背包满返回原因 */
  whyCannotBuyback(i: number): string | null {
    const e = this.buyback[i];
    if (!e) return '没有这件';
    if (this.inv.bag.length >= this.inv.capacity) return '背包已满';
    if (this.inv.gold < e.gold) return `需要退还 ${e.gold} 金币`;
    const lack = e.mats.find(m => this.inv.stack(m.id) < m.count);
    if (lack) return `需要退还 ${lack.count} 个${this.data.stacks.find(d => d.id === lack.id)?.name ?? lack.id}`;
    return null;
  }
  buyBack(i: number): boolean {
    if (this.whyCannotBuyback(i)) return false;
    const e = this.buyback.splice(i, 1)[0];
    e.mats.forEach(m => this.inv.useStack(m.id, m.count));
    if (e.gold) this.inv.addGold(-e.gold);
    this.inv.bag.push(e.item);
    this.inv.onChange?.();
    return true;
  }
  stackDef(id: string) { return this.data.stacks.find(s => s.id === id); }

  // ---------------- 强化部位 ----------------
  /** 部位当前等级 */
  slotLevel(slot: EquipSlot) { return this.inv.slotLv[slot] ?? 0; }
  /** 这件装备对应哪个格子（穿着就是那个格子，没穿走默认格子） */
  slotFor(item: ItemInstance): EquipSlot { return this.inv.slotOf(item) ?? this.inv.defaultTarget(item); }

  costSlot(slot: EquipSlot, itemSlot?: ItemSlot): Cost | null {
    const lv = this.slotLevel(slot);
    const step = this.data.upgrade[lv];
    if (!step) return null;
    const eq = this.inv.equipped[slot];
    const key: ItemSlot = itemSlot ?? eq?.slot ?? (slot === 'mainHand' ? 'oneHand' : slot.replace(/[12]$/, '') as ItemSlot);
    const sMul = this.data.slotUpgradeMul?.[key] ?? 1;
    const bless = this.inv.bless[slot] ?? 0;
    return { gold: Math.round(step.gold * sMul), mats: step.mats.map(m => ({ ...m })), base: step.chance, chance: Math.min(1, step.chance + bless), dropOnFail: false, toLevel: lv + 1, bless };
  }

  whyCannotSlot(slot: EquipSlot): string | null {
    const c = this.costSlot(slot);
    if (!c) return `已强化到最高等级 +${this.maxLevel}`;
    if (this.inv.gold < c.gold) return `金币不足（需要 ${c.gold}）`;
    for (const m of c.mats) if (this.inv.stack(m.id) < m.count) return `${this.stackDef(m.id)?.name ?? m.id}不足（需要 ${m.count}）`;
    return null;
  }

  upgradeSlot(slot: EquipSlot): UpgradeResult {
    const why = this.whyCannotSlot(slot), lv = this.slotLevel(slot);
    if (why) return { ok: false, level: lv, reason: why, consumed: false };
    const c = this.costSlot(slot)!;
    this.inv.spendGold(c.gold);
    c.mats.forEach(m => this.inv.useStack(m.id, m.count));
    if (this.rng() < c.chance) {
      this.inv.slotLv[slot] = c.toLevel; delete this.inv.bless[slot];
      this.inv.reapplySlots(); this.inv.notify();
      return { ok: true, level: c.toLevel };
    }
    // 失败：祝福值增加（基础成功率越低加得越多），2~3 次失败内必成
    this.inv.bless[slot] = Math.min(1, c.bless + Math.max(0.15, (1 - c.base) * 0.5));
    this.inv.notify();
    return { ok: false, level: lv, reason: `强化失败，祝福值 ${Math.round(this.inv.bless[slot]! * 100)}%`, consumed: true };
  }

  /** 兼容旧接口：按装备找格子 */
  cost(item: ItemInstance): Cost | null { return this.costSlot(this.slotFor(item), item.slot); }
  whyCannotUpgrade(item: ItemInstance): string | null { return this.inv.slotOf(item) ? this.whyCannotSlot(this.slotFor(item)) : '先穿上它：强化的是部位'; }
  upgrade(uid: string): UpgradeResult {
    const item = this.inv.find(uid);
    if (!item) return { ok: false, level: 0, reason: '找不到装备', consumed: false };
    const s = this.inv.slotOf(item);
    if (!s) return { ok: false, level: 0, reason: '先穿上它：强化的是部位', consumed: false };
    return this.upgradeSlot(s);
  }

  /** 部位强化后某件装备的预览（不改原物品） */
  previewSlot(slot: EquipSlot, level: number): { hp: number; armor: number; desc: string[] } | null {
    const it = this.inv.equipped[slot];
    if (!it) return null;
    const c = JSON.parse(JSON.stringify(it)) as ItemInstance;
    applyUpgrade(c, level, this.data);
    return { hp: c.hp, armor: c.armor, desc: upgradeDesc(c, level, this.data) };
  }

  // ---------------- 淬炼 ----------------
  reforgeCost(item: ItemInstance, mode: 'affix' | 'elem'): ReforgeCost {
    const g = Math.round((mode === 'affix' ? 120 : 200) * (1 + item.itemLevel * 0.06));
    return mode === 'affix' ? { gold: g, mats: [{ id: 'mat_shard', count: 3 }] } : { gold: g, mats: [{ id: 'mat_essence', count: 1 }] };
  }
  whyCannotReforge(item: ItemInstance, i: number, mode: 'affix' | 'elem'): string | null {
    if (!item.affixLog?.[i]) return '这件装备不能淬炼（v0.6.2 以前的旧装备）';
    if (mode === 'elem' && !item.affixLog[i].el) return '这条词条没有元素';
    const c = this.reforgeCost(item, mode);
    if (this.inv.gold < c.gold) return `金币不足（需要 ${c.gold}）`;
    for (const m of c.mats) if (this.inv.stack(m.id) < m.count) return `${this.stackDef(m.id)?.name ?? m.id}不足（需要 ${m.count}）`;
    return null;
  }
  reforge(item: ItemInstance, i: number, mode: 'affix' | 'elem', gen: LootGenerator): string | null {
    const why = this.whyCannotReforge(item, i, mode);
    if (why) return why;
    const c = this.reforgeCost(item, mode);
    this.inv.spendGold(c.gold); c.mats.forEach(m => this.inv.useStack(m.id, m.count));
    const slot = this.inv.slotOf(item);
    applyUpgrade(item, 0, this.data);
    gen.reforge(item, i, mode);
    if (slot) applyUpgrade(item, this.slotLevel(slot), this.data);
    this.inv.notify();
    return null;
  }

  // ---------------- v0.8.1 暗金重铸：锁定 1 条词条，其余全部重随（深渊碎片） ----------------
  recastCost(item: ItemInstance): ReforgeCost {
    return { gold: Math.round(RECAST.gold * (1 + item.itemLevel * 0.06)), mats: [{ id: 'mat_abyss', count: RECAST.shards }] };
  }
  whyCannotRecast(item: ItemInstance, lock: number): string | null {
    if (item.quality !== 'dark') return '只有暗金装备能重铸';
    const n = item.affixLog?.length ?? 0;
    if (n < 2) return '这件暗金没有可重随的词条';
    if (!(lock >= 0 && lock < n)) return '先选一条要锁定的词条';
    const c = this.recastCost(item);
    if (this.inv.gold < c.gold) return `金币不足（需要 ${c.gold}）`;
    for (const m of c.mats) if (this.inv.stack(m.id) < m.count) return `${this.stackDef(m.id)?.name ?? m.id}不足（需要 ${m.count}）`;
    return null;
  }
  recast(item: ItemInstance, lock: number, gen: LootGenerator): string | null {
    const why = this.whyCannotRecast(item, lock);
    if (why) return why;
    const c = this.recastCost(item);
    this.inv.spendGold(c.gold); c.mats.forEach(m => this.inv.useStack(m.id, m.count));
    const slot = this.inv.slotOf(item);
    applyUpgrade(item, 0, this.data);
    item.affixLog!.forEach((_, j) => { if (j !== lock) gen.reforge(item, j, 'affix'); });
    if (slot) applyUpgrade(item, this.slotLevel(slot), this.data);
    this.inv.notify();
    return null;
  }

  // ---------------- 分解 ----------------
  /** 分解预览：每种材料的数量范围 */
  salvagePreview(item: ItemInstance): { id: string; min: number; max: number }[] {
    const base = this.data.salvage[item.quality].map(x => ({ ...x }));
    for (const b of [...this.data.salvageUpgradeBonus(item.upgrade ?? 0), ...(this.data.salvageSlotBonus?.[item.slot] ?? [])]) {
      const e = base.find(x => x.id === b.id);
      if (e) { e.min += b.count; e.max += b.count; } else base.push({ id: b.id, min: b.count, max: b.count });
    }
    if (item.ancient) { base.forEach(x => { x.min *= 2; x.max *= 2; }); base.push({ id: 'mat_ember', min: 1, max: 1 }); }   // v0.9.6b 太古：双倍材料 + 太古余烬
    return base;
  }

  /** v0.5 C：分解顺带的金币 */
  salvageGold(item: ItemInstance): number {
    const g = this.data.salvageGold;
    return g ? Math.round((g.base + g.perIlvl * item.itemLevel) * (g.quality[item.quality] ?? 0)) : 0;
  }

  /** 为什么这件不能分解（null = 可以）。单件分解：身上的、已锁定的、暗金典藏不行；套装件单独点可以分解 */
  whyCannotSalvage(item: ItemInstance): string | null {
    if (!this.inv.bag.includes(item)) return '身上的装备要先卸下';
    if (item.noSalvage) return '这件装备无法分解';
    if (item.locked) return '已锁定（先解锁）';
    return null;
  }

  /** 只能分解背包里的（身上的先卸下）；已锁定拒绝。暗金单件可以分解（拓印由界面先处理） */
  salvage(uid: string): { id: string; count: number }[] | null {
    const item = this.inv.bag.find(x => x.id === uid);
    if (!item || this.whyCannotSalvage(item)) return null;   // v0.5 B：暗金典藏不可分解；v0.5 C：锁定的也不行
    const out = this.salvagePreview(item).map(r => ({ id: r.id, count: r.min + Math.floor(this.rng() * (r.max - r.min + 1)) })).filter(r => r.count > 0);
    const gold = this.salvageGold(item);
    this.inv.remove(uid);
    out.forEach(r => this.inv.addStack(r.id, r.count));
    if (gold > 0) this.inv.addGold(gold);
    this.buyback.unshift({ item, mats: out.map(r => ({ ...r })), gold });
    if (this.buyback.length > BUYBACK_MAX) this.buyback.length = BUYBACK_MAX;
    return out;
  }

  /** 拾取时自动分解：不进背包直接变材料 */
  salvageLoose(item: ItemInstance): { id: string; count: number }[] {
    const out = this.salvagePreview(item).map(r => ({ id: r.id, count: r.min + Math.floor(this.rng() * (r.max - r.min + 1)) })).filter(r => r.count > 0);
    out.forEach(r => this.inv.addStack(r.id, r.count));
    const gold = this.salvageGold(item);
    if (gold > 0) this.inv.addGold(gold);
    return out;
  }
  /** 比身上同格的好（或那格空着）：自动分解 / 一键分解都会保护 */
  isUpgradeForMe(it: ItemInstance) {
    if (!this.inv.canEquip(it)) return false;
    let to = this.inv.defaultTarget(it);
    // v0.6.7 修正：主手单手 + 副手空着时，别把背包里所有单手武器都当成「升级」（只和主手比）
    if (it.slot === 'oneHand' && to === 'offHand' && !this.inv.equipped.offHand) to = 'mainHand';
    const cur = this.inv.equipped[to];
    return !cur || it.itemLevel > cur.itemLevel;
  }

  /** 一键分解：按勾选的品质 + 保护选项挑出背包里要分解的装备（不含暗金 / 已锁定） */
  salvagePick(o: SalvageOpts): ItemInstance[] {
    return this.inv.bag.filter(it => {
      if (it.quality === 'dark' || it.ancient || it.locked || it.noSalvage || !o.qualities.includes(it.quality)) return false;
      if (o.keepSet && it.setId) return false;
      if (o.keepElite && it.fixedId?.startsWith('e_')) return false;
      if (o.keepBetter && this.isUpgradeForMe(it)) return false;
      if (o.keepEngraved && it.engraveId) return false;
      if (o.onlyUnwearable && this.inv.canEquip(it)) return false;
      if (o.maxIlvl && it.itemLevel >= o.maxIlvl) return false;
      return true;
    });
  }
  salvageTotals(items: ItemInstance[]): { id: string; min: number; max: number }[] {
    const t = new Map<string, { min: number; max: number }>();
    for (const it of items) for (const p of this.salvagePreview(it)) { const e = t.get(p.id) ?? { min: 0, max: 0 }; e.min += p.min; e.max += p.max; t.set(p.id, e); }
    return [...t].map(([id, v]) => ({ id, ...v }));
  }
  /** 一键分解 / 自动分解的金币合计（确认框显示） */
  salvageGoldTotal(items: ItemInstance[]) { return items.reduce((s, it) => s + this.salvageGold(it), 0); }
  salvageMany(items: ItemInstance[]): { id: string; count: number }[] {
    const total = new Map<string, number>();
    items = items.filter(it => !it.locked && !it.ancient && !it.noSalvage && it.quality !== 'dark');   // 批量分解永远跳过暗金（单件分解走 salvage + 拓印）
    for (const it of items) for (const r of this.salvage(it.id) ?? []) total.set(r.id, (total.get(r.id) ?? 0) + r.count);
    return [...total].map(([id, count]) => ({ id, count }));
  }

  /** 一键分解某品质及以下 */
  salvageBelow(maxQuality: Quality): { id: string; count: number }[] {
    const lim = QUALITIES.indexOf(maxQuality);
    return this.salvageMany(this.inv.bag.filter(it => !it.locked && !it.ancient && !it.setId && !it.noSalvage && it.quality !== 'dark' && QUALITIES.indexOf(it.quality) <= lim));
  }

  // ---------------- 杂物（v0.5 C） ----------------
  /** 背包里的灰色杂物：件数和能卖的金币 */
  junkValue(): { count: number; gold: number } {
    let count = 0, gold = 0;
    for (const d of this.data.stacks) if (d.kind === 'junk') { const n = this.inv.stack(d.id); count += n; gold += n * (d.price ?? 0); }
    return { count, gold };
  }
  /** 拜访任何商人时自动卖掉所有杂物，返回卖了多少 */
  sellJunk(): { count: number; gold: number } {
    const v = this.junkValue();
    if (!v.count) return v;
    for (const d of this.data.stacks) if (d.kind === 'junk' && this.inv.stack(d.id) > 0) this.inv.useStack(d.id, this.inv.stack(d.id));
    this.inv.addGold(v.gold);
    return v;
  }

  // ---------------- 药水 ----------------
  /** 喝药：返回回复量（没药返回 0）；冷却由调用方管理 */
  usePotion(id: string, maxHp: number): number {
    const d = this.stackDef(id);
    if (!d?.healPercent || !this.inv.useStack(id, 1)) return 0;
    return Math.round(maxHp * d.healPercent);
  }
}

export function slotGroup(slot: ItemSlot): SlotGroup {
  if (slot === 'twoHand') return 'weapon2';
  if (slot === 'oneHand') return 'weapon1';
  if (slot === 'offHand') return 'off';
  if (slot === 'neck' || slot === 'ring' || slot === 'trinket') return 'jewel';
  if (slot === 'back') return 'back';
  return 'armor';
}
/** 里程碑数（+5 / +10 / +15） */
export const milestones = (level: number) => Math.floor(level / 5);
export const MILESTONE_TEXT: Record<SlotGroup, string> = { weapon2: '技能伤害 +3%', weapon1: '技能伤害 +3%', off: '技能伤害 +2%', armor: '本件生命 +5%', jewel: '暴击率 +1%', back: '移动速度 +2%' };

/** 强化效果的文字（提示框用） */
export function upgradeDesc(item: ItemInstance, level: number, data: ForgeData): string[] {
  const out: string[] = [];
  const dmg = (data.perLevel.damage[item.slot] ?? 0) * level;
  out.push(`生命/护甲 +${Math.round(data.perLevel.hpPct * level * 100)}%${dmg > 0 ? `，技能伤害 +${Math.round(dmg * 1000) / 10}%` : ''}`);
  const ms = milestones(level);
  if (ms) out.push(`里程碑 ×${ms}：${MILESTONE_TEXT[slotGroup(item.slot)]}（每个）`);
  return out;
}

/** 按强化等级重算装备数值（可重复调用；等级 0 = 还原）；里程碑加成也在这里 */
export function applyUpgrade(item: ItemInstance, level: number, data: ForgeData) {
  if (item.baseHp === undefined) item.baseHp = item.hp;
  if (item.baseArmor === undefined) item.baseArmor = item.armor;
  if (item.baseBonus === undefined) item.baseBonus = item.bonus ? { ...item.bonus } : {};
  const p = data.perLevel, g = slotGroup(item.slot), ms = milestones(level);
  item.upgrade = level;
  item.hp = Math.round((item.baseHp * (1 + p.hpPct * level) + p.hpFlat * level * (1 + item.itemLevel * 0.05)) * (g === 'armor' ? 1 + 0.05 * ms : 1));
  item.armor = Math.round(item.baseArmor * (1 + p.armorPct * level));
  item.bonus = { ...item.baseBonus };
  if (g === 'jewel' && ms) item.bonus.crit = Math.round(((item.bonus.crit ?? 0) + ms) * 10) / 10;
  if (g === 'back' && ms) item.bonus.speed = (item.bonus.speed ?? 0) + 2 * ms;
  if (!Object.keys(item.bonus).length) delete item.bonus;
  const upgId = `${item.id}:upgrade`;
  item.modifiers = item.modifiers.filter(m => m.id !== upgId);
  const dmg = (p.damage[item.slot] ?? 0) * level + (g === 'weapon1' || g === 'weapon2' ? 0.03 : g === 'off' ? 0.02 : 0) * ms;
  if (dmg > 0) item.modifiers.push({ id: upgId, name: `强化+${level}`, source: 'equipment', desc: `强化：所有技能伤害 +${Math.round(dmg * 1000) / 10}%`, match: {}, ops: [{ op: 'mul', stat: 'damage', value: dmg }] });
  if (level === 0) { delete item.upgrade; delete item.baseHp; delete item.baseArmor; delete item.baseBonus; }
}

/** 强化后的显示名：+7 铁刃长剑 */
export const upgradedName = (it: ItemInstance) => (it.upgrade ? `+${it.upgrade} ` : '') + it.name;

// ---------------- 商店 ----------------
export type ShopOffer =
  | { kind: 'stack'; id: string; price: number }
  | { kind: 'gear'; item: ItemInstance; price: number };

export class Shop {
  offers: ShopOffer[] = [];
  constructor(private data: ForgeData, private inv: Inventory, private gen: LootGenerator) {}

  /** 打开商店时按玩家等级刷新装备货架 */
  restock(level: number) {
    this.offers = this.data.shop.map((e): ShopOffer => e.kind === 'stack'
      ? { kind: 'stack', id: e.id, price: e.price }
      : (() => { const item = this.gen.generate(Math.max(1, level), e.quality, Array.isArray(e.slot) ? e.slot : [e.slot]); return { kind: 'gear', item, price: Math.round(item.sellPrice * e.priceMul) }; })());
  }

  whyCannotBuy(i: number): string | null {
    const o = this.offers[i];
    if (!o) return '没有这件商品';
    if (this.inv.gold < o.price) return '金币不足';
    if (o.kind === 'gear' && this.inv.isFull) return '背包已满';
    return null;
  }

  buy(i: number, count = 1): boolean {
    const o = this.offers[i];
    if (!o) return false;
    if (o.kind === 'stack') {
      if (!this.inv.spendGold(o.price * count)) return false;
      this.inv.addStack(o.id, count);
      return true;
    }
    if (this.whyCannotBuy(i)) return false;
    this.inv.spendGold(o.price);
    this.inv.add(o.item);
    this.offers.splice(i, 1);           // 装备只有一件
    return true;
  }
  // v0.5 C：取消装备出售（Shop.sell 已删除）；金币来源见 docs/economy.md
}
