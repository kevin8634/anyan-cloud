import { ModifierDef, SkillDef, SlotId, SLOT_IDS, CastContext, ResolvedSkill } from './types';
import { ComboTracker } from './ComboTracker';
import { SkillResolver, CDR_CAP, ULT_CDR_CAP_BASE, ULT_CDR_CAP_MAX } from './SkillResolver';

export interface TalentNode { id: string; tier: number; modifier: ModifierDef; }
/** 装备类别（物品本身的部位）。戒指/饰品各有两个穿戴格，单手武器可进主手（战士也可进副手），双手武器占主手并清空副手 */
export type ItemSlot =
  | 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'wrist' | 'hands' | 'waist' | 'legs' | 'feet'
  | 'ring' | 'trinket' | 'oneHand' | 'twoHand' | 'offHand';
export interface ItemDef { id: string; name: string; slot: ItemSlot; quality: 'white' | 'green' | 'blue' | 'purple' | 'orange' | 'dark'; setId?: string; modifiers: ModifierDef[]; }
/** 套装效果：modifier = 改技能的修饰器（4 件改技能形态）；stats = 角色属性（2 件加属性，由 Inventory.stats 计入）；desc = 显示文本 */
export interface SetBonus { setId: string; pieces: number; modifier?: ModifierDef; stats?: Partial<Record<'hp' | 'armor' | 'power' | 'crit' | 'critDmg' | 'haste' | 'speed', number>>; desc?: string; }

/** 技能执行器接口：由引擎层（Cocos）实现，负责动画、特效、命中判定 */
export interface SkillExecutor { execute(skill: ResolvedSkill): void; }

/**
 * 角色的技能配装：槽位 + 天赋 + 装备 + 组合修饰器
 * 引擎无关，Cocos 组件只需调用 tryCast / update / preview
 */
export class Loadout {
  readonly combo = new ComboTracker();
  private resolver = new SkillResolver(this.combo);
  private slots = new Map<SlotId, SkillDef>();
  private cooldownEnd = new Map<SlotId, number>();
  private talents: TalentNode[] = [];
  private items: ItemDef[] = [];
  private setBonuses: SetBonus[] = [];
  private comboMods: ModifierDef[] = [];
  /** v0.7.5：职业资源强化（只在这一次施法前临时设置） */
  resMods: ModifierDef[] = [];
  /** v0.9.1s：橙装按战况临时挂的修饰器（web/lgfx.ts 每帧更新） */
  lgMods: ModifierDef[] = [];
  /** v1.0.6：内容包职业运行时挂的修饰器（形态等，web/classext.ts） */
  classMods: ModifierDef[] = [];
  /** v0.6.9：当前职业；带 cls 的修饰器（多职业首饰）只在对应职业生效 */
  classId?: string;

  constructor(private executor: SkillExecutor) {}

  /** v1.2.37 大招冷却缩减上限（0.4 + 每件暮时·终局 0.1，封顶 0.8）；技能 1~4 固定 CDR_CAP */
  private ultCap = ULT_CDR_CAP_BASE;
  setUltCdrCap(cap: number) {
    this.ultCap = Math.max(ULT_CDR_CAP_BASE, Math.min(ULT_CDR_CAP_MAX, cap));
    this.resolver.cdCap = slot => slot === 'basic' ? null : slot === 'ultimate' ? this.ultCap : CDR_CAP;
  }
  get ultCdrCap() { return this.ultCap; }

  equipSkill(skill: SkillDef, slot: SlotId) {
    const ok = slot === 'basic' || slot === 'ultimate' ? skill.slot === slot : skill.slot.startsWith('skill');
    if (!ok) throw new Error(`${skill.name} 不能装到 ${slot}`);
    this.slots.set(slot, skill);
  }
  setTalents(nodes: TalentNode[]) { this.talents = nodes; }
  setItems(items: ItemDef[]) { this.items = items; }
  setSetBonuses(b: SetBonus[]) { this.setBonuses = b; }
  setComboModifiers(mods: ModifierDef[]) { this.comboMods = mods; }
  /** v0.9.1l：装备类修饰器的技能 ID → 槽位换算（技能书换技能后装备加成不失效），由表现层注入 SkillBook.remapToSlot */
  modRemap: ((m: ModifierDef) => ModifierDef) | null = null;

  /** 汇总当前所有修饰器 */
  allModifiers(): ModifierDef[] {
    const setCount = new Map<string, number>();
    this.items.forEach(i => i.setId && setCount.set(i.setId, (setCount.get(i.setId) ?? 0) + 1));
    const sets = this.setBonuses.filter(b => b.modifier && (setCount.get(b.setId) ?? 0) >= b.pieces).map(b => b.modifier!);
    return [
      ...this.talents.map(t => t.modifier),
      ...this.items.flatMap(i => i.modifiers).filter(m => !m.cls || !this.classId || m.cls === this.classId).map(m => this.modRemap ? this.modRemap(m) : m),
      ...(this.modRemap ? sets.map(this.modRemap) : sets),
      ...this.comboMods,
      ...this.resMods,
      ...this.lgMods,
      ...this.classMods,
    ];
  }

  /** UI 预览：技能面板显示变种后的名字、数值（不消耗组合） */
  preview(slot: SlotId, ctx: CastContext): ResolvedSkill | undefined {
    const def = this.slots.get(slot);
    return def && this.resolver.resolve(def, this.allModifiers(), ctx, false);
  }

  cooldownLeft(slot: SlotId, now: number) { return Math.max(0, (this.cooldownEnd.get(slot) ?? 0) - now); }

  /** 按下技能键 */
  tryCast(slot: SlotId, ctx: CastContext): ResolvedSkill | null {
    const def = this.slots.get(slot);
    if (!def || this.cooldownLeft(slot, ctx.now) > 0) return null;
    const skill = this.resolver.resolve(def, this.allModifiers(), ctx, true);
    this.cooldownEnd.set(slot, ctx.now + skill.stats.cooldown);
    this.combo.record({ baseId: skill.baseId, tags: [...skill.tags, `slot:${slot}`] }, ctx.now);   // v1.2.37：带槽位标签（连携觉醒 recentCast tag slot:skill1）
    this.executor.execute(skill);
    return skill;
  }

  /** 供 resetCooldown 之类效果调用 */
  resetCooldown(slot: SlotId) { this.cooldownEnd.delete(slot); }
  /** v0.9.1m：冷却缩短 sec 秒（套装 / 橙装用） */
  reduceCooldown(slot: SlotId, sec: number) { const e = this.cooldownEnd.get(slot); if (e !== undefined) this.cooldownEnd.set(slot, e - sec); }

  get equippedSlots(): SlotId[] { return SLOT_IDS.filter(s => this.slots.has(s)); }
}
