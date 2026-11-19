import { hasPack, packById } from './ContentPacks';
// ========== 背包与穿戴（引擎无关，可存档） ==========
// 16 个穿戴格：头部 项链 肩部 披风 胸甲 护腕 手套 腰带 腿甲 鞋子 戒指×2 饰品×2 主手 副手
// 规则：
//   - 护甲部位按职业护甲类型限定（战士重甲、法师布甲）；项链/戒指/饰品/披风通用
//   - 武器按职业可用类型限定；双手武器占主手，穿上时副手放回背包（背包满则失败）
//   - 双手武器在身时穿副手 → 卸下双手武器；可双持的职业（战士）单手武器也能进副手
//   - 戒指/饰品优先进空格，都满了替换 1 号格（UI 可以指定格子）
import { ItemInstance, ItemSlot, ArmorType, ARMOR_TYPE_NAME, WeaponType, BonusStat, BONUS_STATS, LootData, baseBonus, Quality } from './Loot';
import { resonanceOf } from './Resonance';
import { isBroken, repairCost, repairAllCost, applyDeathLoss, DUR_MAX } from './Durability';
import { SetBonus } from './Loadout';
import { setBonusStats, setCounts } from './Sets';

export type EquipSlot =
  | 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'wrist' | 'hands' | 'waist' | 'legs' | 'feet'
  | 'ring1' | 'ring2' | 'trinket1' | 'trinket2' | 'mainHand' | 'offHand';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainHand', 'offHand'];
export const EQUIP_SLOT_NAME: Record<EquipSlot, string> = {
  head: '头部', neck: '项链', shoulder: '肩部', back: '披风', chest: '胸甲', wrist: '护腕', hands: '手套', waist: '腰带', legs: '腿甲', feet: '鞋子',
  ring1: '戒指 1', ring2: '戒指 2', trinket1: '饰品 1', trinket2: '饰品 2', mainHand: '主手', offHand: '副手',
};
/** 物品类别名（提示框里显示） */
export const SLOT_NAME: Record<ItemSlot, string> = {
  head: '头部', neck: '项链', shoulder: '肩部', back: '披风', chest: '胸甲', wrist: '护腕', hands: '手套', waist: '腰带', legs: '腿甲', feet: '鞋子',
  ring: '戒指', trinket: '饰品', oneHand: '单手', twoHand: '双手', offHand: '副手',
};
/** 受护甲类型限制的部位 */
export const ARMOR_SLOTS: ItemSlot[] = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];

/** 职业穿戴规则（不设 = 不限制，命令行模拟用） */
export interface EquipRules {
  armorType?: ArmorType; weapons?: WeaponType[]; dualWield?: boolean;
  /** 11-05 职业开关（灵契猎手 = 'bow'）：副手格专放这一类远程武器（不管物品记的是单手 / 副手），主手只放其它武器；
   *  双手武器和它同时在身、互不卸下。不设 = 原规则（其他职业行为不变） */
  rangedOffhand?: WeaponType;
  /** 11-05 格子显示名覆盖（如猎手 mainHand「主手：长柄」、offHand「弓」）；存档键不变 */
  slotNames?: Partial<Record<EquipSlot, string>>;
}

/** stacks：可堆叠物品（强化材料、药水），id → 数量 */
export interface InventorySave {
  gold: number; bag: ItemInstance[]; equipped: Partial<Record<EquipSlot, ItemInstance>>; stacks?: Record<string, number>;
  /** v0.6.2：部位强化等级 / 祝福值（0~1）/ 拾取自动分解的品质（白、绿） */
  slotLv?: Partial<Record<EquipSlot, number>>; bless?: Partial<Record<EquipSlot, number>>; autoSalvage?: Quality[];
  /** v0.6.7：一键分解的勾选（记住）；没有 = 默认勾选 */
  salvOpts?: { qualities: Quality[]; keepBetter: boolean; keepElite: boolean; keepSet: boolean; onlyUnwearable?: boolean; maxIlvl?: number; keepEngraved?: boolean };
}

/** 装备汇总属性：生命、护甲 + 二级属性（强度、暴击率%、暴击伤害%、急速%、移速%） */
export type CharStats = { hp: number; armor: number } & Record<BonusStat, number>;
export const emptyStats = (hp = 0, armor = 0): CharStats => ({ hp, armor, power: 0, crit: 0, critDmg: 0, haste: 0, speed: 0 });

export type EquipResult = { ok: true; slot: EquipSlot; removed: ItemInstance[] } | { ok: false; reason: string };

export interface Compare extends CharStats { itemLevel: number; replaces: ItemInstance | null; replacesAll: ItemInstance[]; target: EquipSlot }

export class Inventory {
  gold = 0;
  readonly bag: ItemInstance[] = [];
  readonly equipped: Partial<Record<EquipSlot, ItemInstance>> = {};
  /** 可堆叠物品：材料、药水（不占背包格子） */
  readonly stacks: Record<string, number> = {};
  /** 职业穿戴规则 */
  rules: EquipRules = {};
  /** 最近一次 equip 失败原因（UI 提示用） */
  lastError = '';
  /** 穿戴变化、背包变化时触发：UI 刷新、Loadout.setItems、玩家属性 */
  onChange: (() => void) | null = null;
  /** v0.6.2 强化部位：等级跟着格子走，换装备不丢；祝福值 0~1（失败积累，满了必成） */
  readonly slotLv: Partial<Record<EquipSlot, number>> = {};
  readonly bless: Partial<Record<EquipSlot, number>> = {};
  autoSalvage: Quality[] = [];
  salvOpts: InventorySave['salvOpts'] = undefined;
  /** 把格子的强化等级套到装备上（Forge 设置；level 0 = 还原） */
  slotApply: ((item: ItemInstance, slot: EquipSlot | null, level: number) => void) | null = null;
  /** 对外：重新把所有格子的强化套到身上的装备（升级部位后调用） */
  reapplySlots() { for (const s of EQUIP_SLOTS) { const it = this.equipped[s]; if (it) this.slotApply?.(it, s, this.slotLv[s] ?? 0); } }

  constructor(public capacity = 30, private baseStats: { hp: number; armor: number } = { hp: 1000, armor: 0 }) {}

  get isFull() { return this.bag.length >= this.capacity; }

  /** 拾取；背包满返回 false */
  add(item: ItemInstance): boolean {
    if (this.isFull) return false;
    this.bag.push(item);
    this.changed();
    return true;
  }

  addGold(n: number) { this.gold += n; this.changed(); }

  /** 金币不够返回 false */
  spendGold(n: number): boolean {
    if (n > this.gold) return false;
    this.gold -= n; this.changed();
    return true;
  }

  stack(id: string) { return this.stacks[id] ?? 0; }
  addStack(id: string, n = 1) { if (n <= 0) return; this.stacks[id] = this.stack(id) + n; this.changed(); }
  /** 消耗堆叠物品，数量不够返回 false（不扣） */
  useStack(id: string, n = 1): boolean {
    if (this.stack(id) < n) return false;
    this.stacks[id] -= n;
    if (this.stacks[id] <= 0) delete this.stacks[id];
    this.changed();
    return true;
  }
  /** 从背包移除（分解等），返回被移除的装备 */
  remove(uid: string): ItemInstance | null {
    const i = this.bag.findIndex(x => x.id === uid);
    if (i < 0) return null;
    const [item] = this.bag.splice(i, 1);
    this.changed();
    return item;
  }
  /** 背包或身上找装备 */
  find(uid: string): ItemInstance | null {
    return this.bag.find(x => x.id === uid) ?? this.equippedItems().find(x => x.id === uid) ?? null;
  }
  /** 装备穿在哪个格子（没穿返回 null） */
  slotOf(item: ItemInstance): EquipSlot | null {
    return EQUIP_SLOTS.find(s => this.equipped[s] === item) ?? null;
  }

  // ---------------- 穿戴规则 ----------------
  /** 职业能不能穿（不看格子），不能返回原因 */
  whyCannotEquip(item: ItemInstance): string | null {
    const r = this.rules;
    if (item.pack && !hasPack(item.pack)) return `无法穿戴：这是${packById(item.pack)?.name ?? '扩展内容'}资料片的装备，需要安装该资料片`;   // v1.0.1
    if (ARMOR_SLOTS.includes(item.slot) && r.armorType && item.armorType && item.armorType !== r.armorType)
      return `无法穿戴：这是${ARMOR_TYPE_NAME[item.armorType]}，你的职业只能穿${ARMOR_TYPE_NAME[r.armorType]}`;
    if ((item.slot === 'oneHand' || item.slot === 'twoHand' || item.slot === 'offHand') && r.weapons && item.weaponType && !r.weapons.includes(item.weaponType))
      return '无法使用：你的职业不能使用这类武器';
    return null;
  }
  canEquip(item: ItemInstance) { return !this.whyCannotEquip(item); }
  /** 11-05 格子显示名（职业可覆盖，见 EquipRules.slotNames） */
  slotName(s: EquipSlot): string { return this.rules.slotNames?.[s] ?? EQUIP_SLOT_NAME[s]; }
  /** 11-05 双手武器是否占用副手（rangedOffhand 职业 = 不占用） */
  twoHandBlocksOff(): boolean { return !this.rules.rangedOffhand; }

  /** 这件装备能放进哪些格子（第一个是默认） */
  slotsFor(item: ItemInstance): EquipSlot[] {
    const ro = this.rules.rangedOffhand;   // 11-05：远程副手职业按武器类型分格
    if (ro && item.weaponType && (item.slot === 'oneHand' || item.slot === 'twoHand' || item.slot === 'offHand')) return item.weaponType === ro ? ['offHand'] : ['mainHand'];
    switch (item.slot) {
      case 'ring': return ['ring1', 'ring2'];
      case 'trinket': return ['trinket1', 'trinket2'];
      case 'oneHand': return this.rules.dualWield ? ['mainHand', 'offHand'] : ['mainHand'];   // 双持职业单手武器也能进副手
      case 'twoHand': return ['mainHand'];
      case 'offHand': return ['offHand'];
      default: return [item.slot as EquipSlot];
    }
  }

  /** 不指定格子时的默认目标：空格优先，否则 1 号格；单手武器在双手武器在身时替换主手 */
  defaultTarget(item: ItemInstance): EquipSlot {
    const slots = this.slotsFor(item);
    if (slots.length === 1) return slots[0];
    if (item.slot === 'oneHand') {
      const mh = this.equipped.mainHand;
      if (!mh || mh.slot === 'twoHand') return 'mainHand';
      return this.equipped.offHand ? 'mainHand' : 'offHand';
    }
    return slots.find(s => !this.equipped[s]) ?? slots[0];
  }

  /** 穿到 target 格会被换下来的装备（第一件是同格旧装备） */
  displaced(item: ItemInstance, target: EquipSlot): ItemInstance[] {
    const out: ItemInstance[] = [];
    const old = this.equipped[target];
    if (old) out.push(old);
    if (!this.twoHandBlocksOff()) return out;   // 11-05 远程副手职业：双手武器和副手远程武器互不卸下
    if (item.slot === 'twoHand' && this.equipped.offHand) out.push(this.equipped.offHand);               // 双手 → 副手放回背包
    if (target === 'offHand' && this.equipped.mainHand?.slot === 'twoHand') out.push(this.equipped.mainHand); // 副手 → 卸下双手武器
    return out;
  }

  /** 穿上背包里的装备；target 不填走默认规则。失败返回原因（背包满、职业限制、格子不对） */
  tryEquip(uid: string, target?: EquipSlot): EquipResult {
    const i = this.bag.findIndex(x => x.id === uid);
    if (i < 0) return this.fail('背包里没有这件装备');
    const item = this.bag[i];
    const why = this.whyCannotEquip(item);
    if (why) return this.fail(why);
    const slots = this.slotsFor(item);
    const to = target ?? this.defaultTarget(item);
    if (!slots.includes(to)) return this.fail('不能放进这个格子');
    const off = this.displaced(item, to);
    // 装备本身离开背包空出 1 格，换下来的都要回背包
    if (this.bag.length - 1 + off.length > this.capacity) return this.fail('背包已满，无法卸下另一只手的装备');
    this.bag.splice(i, 1);
    for (const o of off) { const s = this.slotOf(o); if (s) delete this.equipped[s]; }
    if (off[0]) this.bag.splice(i, 0, off[0]);   // 放回原位置，交换手感更好
    for (const o of off.slice(1)) this.bag.push(o);
    this.equipped[to] = item;
    for (const o of off) this.slotApply?.(o, null, 0);
    this.slotApply?.(item, to, this.slotLv[to] ?? 0);
    this.lastError = '';
    this.changed();
    return { ok: true, slot: to, removed: off };
  }

  /**
   * 11-05 读档迁移（只对 rules.rangedOffhand 职业生效，幂等）：
   *   副手上不是远程武器的（猎手老存档的短刃）→ 退回背包；主手上是远程武器的（老存档单手弓）→ 挪到副手（弓位，被占就退回背包）；
   *   主手空着 → 背包里能进主手的最高装等那件，没有就用 makeMain() 补一把（基础长柄）。返回做了什么（测试 / 日志用）
   */
  migrateRangedOffhand(makeMain?: () => ItemInstance | null): string[] {
    const ro = this.rules.rangedOffhand, log: string[] = [];
    if (!ro) return log;
    const off = this.equipped.offHand;
    if (off && off.weaponType !== ro) { delete this.equipped.offHand; this.slotApply?.(off, null, 0); this.bag.push(off); log.push('副手→背包:' + off.baseId); }
    const mh = this.equipped.mainHand;
    if (mh && mh.weaponType === ro) {
      delete this.equipped.mainHand; this.slotApply?.(mh, null, 0);
      if (!this.equipped.offHand) { this.equipped.offHand = mh; this.slotApply?.(mh, 'offHand', this.slotLv.offHand ?? 0); log.push('主手弓→弓位:' + mh.baseId); }
      else { this.bag.push(mh); log.push('主手弓→背包:' + mh.baseId); }
    }
    if (!this.equipped.mainHand) {
      const cand = this.bag.filter(b => this.canEquip(b) && this.slotsFor(b).includes('mainHand') && b.weaponType && b.weaponType !== ro).sort((a, b) => b.itemLevel - a.itemLevel)[0] ?? null;
      const it = cand ?? makeMain?.() ?? null;
      if (it) {
        if (cand) this.bag.splice(this.bag.indexOf(cand), 1);
        this.equipped.mainHand = it; this.slotApply?.(it, 'mainHand', this.slotLv.mainHand ?? 0); log.push((cand ? '背包长柄→主手:' : '补基础长柄:') + it.baseId);
      }
    }
    if (log.length) this.changed();
    return log;
  }

  /** 兼容旧接口：成功返回 true，失败原因在 lastError */
  equip(uid: string, target?: EquipSlot): boolean { return this.tryEquip(uid, target).ok; }

  unequip(slot: EquipSlot): boolean {
    const item = this.equipped[slot];
    if (!item) return false;
    if (this.isFull) { this.lastError = '背包已满'; return false; }
    delete this.equipped[slot];
    this.slotApply?.(item, null, 0);
    this.bag.push(item);
    this.changed();
    return true;
  }

  // ---------------- 锁定（v0.5 C） ----------------
  /** 锁定 / 解锁（背包或身上）：锁定的装备不会被任何分解按钮处理（包括「全部」）。返回新的锁定状态，找不到返回 null */
  toggleLock(uid: string, on?: boolean): boolean | null {
    const it = this.find(uid);
    if (!it) return null;
    const v = on ?? !it.locked;
    if (v) it.locked = true; else delete it.locked;
    this.changed();
    return v;
  }

  /** v0.5 C：游戏内已取消装备出售（金币来自任务、怪物、杂物、分解）。这里只留给命令行模拟和测试清背包用 */
  sell(uid: string): number {
    const i = this.bag.findIndex(x => x.id === uid);
    if (i < 0 || this.bag[i].noSalvage || this.bag[i].locked) return 0;   // 暗金典藏、锁定的不能出售
    const [item] = this.bag.splice(i, 1);
    this.gold += item.sellPrice;
    this.changed();
    return item.sellPrice;
  }

  /** 一键出售某品质及以下（清背包；仅模拟/测试用） */
  sellBelow(maxQuality: ItemInstance['quality']): number {
    const order = ['white', 'green', 'blue', 'purple', 'orange'];   // 暗金不在里面：永远不会被一键出售
    const lim = order.indexOf(maxQuality);
    let total = 0;
    for (const it of [...this.bag]) { const qi = order.indexOf(it.quality); if (qi >= 0 && qi <= lim) total += this.sell(it.id); }
    return total;
  }

  equippedItems(): ItemInstance[] { return EQUIP_SLOTS.map(s => this.equipped[s]).filter((x): x is ItemInstance => !!x); }

  /** v0.5：真正生效的装备（已损坏 = 耐久 0 的不算：属性、词条、套装、传说特效全部失效） */
  activeItems(): ItemInstance[] { return this.equippedItems().filter(i => !isBroken(i)); }

  /** v0.5 B：套装效果（2 件属性加成在这里计入 stats；4 件的技能修饰器由 Loadout 处理） */
  setBonuses: SetBonus[] = [];
  /** 生效的套装件数（已损坏的不算） */
  setCounts(): Map<string, number> { return setCounts(this.activeItems()); }

  stats(): CharStats {
    // 只算生效的装备（v0.5：已损坏的不算）；套装 2 件属性（v0.5 B）；元素共鸣的角色属性（v0.6.2）
    const items = this.activeItems();
    const s = sumStats(items, emptyStats(this.baseStats.hp, this.baseStats.armor));
    const b = setBonusStats(items, this.setBonuses);
    for (const k of Object.keys(s) as (keyof CharStats)[]) s[k] = Math.round((s[k] + b[k]) * 10) / 10;
    const r = resonanceOf([...items, ...this.elemItems()]).stat;
    s.hp = Math.round(s.hp * (1 + (r.hpPct ?? 0))); s.armor = Math.round(s.armor * (1 + (r.armorPct ?? 0)));
    s.crit += r.crit ?? 0; s.critDmg += r.critDmg ?? 0; s.haste += r.haste ?? 0; s.speed += r.speed ?? 0;
    return s;
  }

  // ---------------- 耐久与修理（v0.5，规则见 core/Durability.ts） ----------------
  /** 阵亡：身上所有装备掉耐久，返回刚损坏的装备 */
  deathLoss(): ItemInstance[] { const b = applyDeathLoss(this.equippedItems()); this.changed(); return b; }
  /** 身上 + 背包里需要修理的装备 */
  damagedItems(): ItemInstance[] { return [...this.equippedItems(), ...this.bag].filter(i => repairCost(i) > 0); }
  repairAllCost(): number { return repairAllCost(this.damagedItems()); }
  /** 修一件（身上或背包）；金币不够返回 0 */
  repair(uid: string): number {
    const it = this.find(uid);
    const c = it ? repairCost(it) : 0;
    if (!it || c <= 0 || c > this.gold) return 0;
    this.gold -= c; it.durability = DUR_MAX; this.changed();
    return c;
  }
  /** 全部修理；金币不够全修就一件都不修，返回 0 */
  repairAll(): number {
    const list = this.damagedItems(), c = repairAllCost(list);
    if (c <= 0 || c > this.gold) return 0;
    this.gold -= c; list.forEach(i => { i.durability = DUR_MAX; }); this.changed();
    return c;
  }
  resonance() { return resonanceOf([...this.activeItems(), ...this.elemItems()]); }
  /** v0.6.8：技能符文带的元素（每枚算 1 个元素词条；自然 → 岩） */
  extraElems: string[] = [];
  private elemItems() {
    const map: Record<string, 'fire' | 'frost' | 'shadow' | 'stone'> = { fire: 'fire', frost: 'frost', shadow: 'shadow', nature: 'stone' };
    const log = this.extraElems.map(e => map[e]).filter(Boolean).map(el => ({ el }));
    return log.length ? [{ affixLog: log }] : [];
  }

  /** 平均装等：16 格，空格算 0；双手武器同时算副手 */
  averageItemLevel(): number {
    let sum = 0;
    for (const s of EQUIP_SLOTS) {
      const it = this.equipped[s] ?? (s === 'offHand' && this.twoHandBlocksOff() && this.equipped.mainHand?.slot === 'twoHand' ? this.equipped.mainHand : undefined);
      sum += it?.itemLevel ?? 0;
    }
    return Math.round(sum / EQUIP_SLOTS.length * 10) / 10;
  }

  /** 和会被换下的装备比较，给 UI 画绿色↑红色↓（双手对比主手+副手之和） */
  compare(item: ItemInstance, target?: EquipSlot): Compare {
    const to = target ?? this.defaultTarget(item);
    const all = this.displaced(item, to);
    // 已损坏的装备属性按 0 算（换上新装备的提升更真实）
    const live = (l: ItemInstance[]) => l.filter(i => !isBroken(i));
    const a = sumStats(live([item]), emptyStats()), b = sumStats(live(all), emptyStats());
    const d = emptyStats();
    for (const k of Object.keys(d) as (keyof CharStats)[]) d[k] = Math.round((a[k] - b[k]) * 10) / 10;
    return { ...d, itemLevel: item.itemLevel - (all[0]?.itemLevel ?? 0), replaces: all[0] ?? null, replacesAll: all, target: to };
  }

  save(): InventorySave { return JSON.parse(JSON.stringify({ gold: this.gold, bag: this.bag, equipped: this.equipped, stacks: this.stacks, slotLv: this.slotLv, bless: this.bless, autoSalvage: this.autoSalvage, ...(this.salvOpts ? { salvOpts: this.salvOpts } : {}) })); }

  load(s: InventorySave) {
    this.gold = s.gold;
    this.bag.length = 0;
    this.bag.push(...s.bag);
    for (const k of Object.keys(this.equipped)) delete this.equipped[k as EquipSlot];
    for (const k of EQUIP_SLOTS) if (s.equipped[k]) this.equipped[k] = s.equipped[k];
    for (const k of Object.keys(this.stacks)) delete this.stacks[k];
    Object.assign(this.stacks, s.stacks ?? {});
    for (const k of Object.keys(this.slotLv)) delete this.slotLv[k as EquipSlot];
    for (const k of Object.keys(this.bless)) delete this.bless[k as EquipSlot];
    this.autoSalvage = [...(s.autoSalvage ?? [])];
    this.salvOpts = s.salvOpts ? JSON.parse(JSON.stringify(s.salvOpts)) : undefined;
    if (s.slotLv) { Object.assign(this.slotLv, s.slotLv); Object.assign(this.bless, s.bless ?? {}); }
    else {
      // v0.6.2 迁移：旧的「装备强化」变成「部位强化」——每个格子取身上那件 / 背包里能放进这个格子的最高强化等级，不丢进度
      for (const sl of EQUIP_SLOTS) {
        const cands = [this.equipped[sl], ...this.bag.filter(b => this.slotsFor(b).includes(sl))];
        const lv = Math.max(0, ...cands.map(c => c?.upgrade ?? 0));
        if (lv) this.slotLv[sl] = lv;
      }
    }
    for (const it of this.bag) if (it.upgrade) this.slotApply?.(it, null, 0);
    this.reapplySlots();
    this.changed();
  }

  /** 外部直接改了装备数值（强化）后调用，触发刷新 */
  notify() { this.changed(); }
  private fail(reason: string): EquipResult { this.lastError = reason; return { ok: false, reason }; }
  private changed() { this.onChange?.(); }
}

const fin = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export function sumStats(items: ItemInstance[], start: CharStats): CharStats {
  const s = { ...start };
  for (const i of items) {
    // 11-05 防 NaN：缺 hp / armor / bonus 字段（或非数）的装备按 0 算（robe40_e2e 假胸甲把血球打成 NaN）
    s.hp += fin(i.hp); s.armor += fin(i.armor);
    for (const k of BONUS_STATS) s[k] += fin(i.bonus?.[k]);
  }
  for (const k of BONUS_STATS) s[k] = Math.round(s[k] * 10) / 10;
  return s;
}

// ---------------- 存档迁移 v2 → v3 ----------------
// v2 只有 5 个部位：weapon / head / chest / legs / trinket。
//   weapon：法杖 → 双手（staff），长剑/战斧 → 单手（sword/axe），穿在主手
//   trinket：铜戒指 → 戒指（ring1），护身符 → 项链（neck），其它（传说饰品）→ 饰品（trinket1）
//   head/chest/legs：按底材补护甲类型（皮革护腿按职业：战士重甲、法师布甲）
// lootData 给了就按新底材补上武器强度等二级属性（老武器不吃亏）
type V2Item = Omit<ItemInstance, 'slot'> & { slot: string };
const V2_BASE: Record<string, { slot: ItemSlot; weaponType?: WeaponType; armorType?: ArmorType | 'class' }> = {
  b_sword: { slot: 'oneHand', weaponType: 'sword' }, b_axe: { slot: 'oneHand', weaponType: 'axe' }, b_staff: { slot: 'twoHand', weaponType: 'staff' },
  b_helm: { slot: 'head', armorType: 'plate' }, b_chest: { slot: 'chest', armorType: 'plate' },
  b_hood: { slot: 'head', armorType: 'cloth' }, b_robe: { slot: 'chest', armorType: 'cloth' },
  b_legs: { slot: 'legs', armorType: 'class' }, b_ring: { slot: 'ring' }, b_amulet: { slot: 'neck' },
};
const V2_EQUIP: Record<string, EquipSlot> = { oneHand: 'mainHand', twoHand: 'mainHand', ring: 'ring1', neck: 'neck', trinket: 'trinket1', head: 'head', chest: 'chest', legs: 'legs' };

export function migrateItemV3(raw: V2Item, classId = 'warrior', lootData?: LootData): ItemInstance {
  const it = raw as unknown as ItemInstance;
  const known = V2_BASE[raw.baseId];
  if (raw.slot === 'weapon') {
    it.slot = known?.slot ?? (classId === 'mage' ? 'twoHand' : 'oneHand');
    it.weaponType = known?.weaponType ?? (classId === 'mage' ? 'staff' : 'axe');
  } else if (raw.slot === 'trinket') {
    it.slot = known && (known.slot === 'ring' || known.slot === 'neck') ? known.slot : 'trinket';
  }
  if (known?.armorType && !it.armorType) it.armorType = known.armorType === 'class' ? (classId === 'mage' ? 'cloth' : 'plate') : known.armorType;
  if (lootData && !it.bonus) {
    const base = lootData.bases.find(b => b.id === it.baseId);
    const b = base && base.slot === it.slot ? baseBonus(base, it.itemLevel, it.quality as Quality) : undefined;
    if (b) it.bonus = b;
  }
  return it;
}

/** 整个背包迁移：equipped 的旧键改成新格子 */
export function migrateInventoryV3(inv: InventorySave, classId = 'warrior', lootData?: LootData): InventorySave {
  const oldEq = inv.equipped as Record<string, V2Item | undefined>;
  const eq: Partial<Record<EquipSlot, ItemInstance>> = {};
  inv.bag = inv.bag.map(i => migrateItemV3(i as unknown as V2Item, classId, lootData));
  for (const [k, raw] of Object.entries(oldEq)) {
    if (!raw) continue;
    const it = migrateItemV3(raw, classId, lootData);
    const to = (EQUIP_SLOTS as string[]).includes(k) ? k as EquipSlot : V2_EQUIP[it.slot] ?? (it.slot as EquipSlot);
    if (eq[to]) inv.bag.push(it); else eq[to] = it;     // 冲突（理论上不会）就放回背包
  }
  inv.equipped = eq;
  return inv;
}
