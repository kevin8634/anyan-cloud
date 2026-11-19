import { ancientMod, ancName, ANCIENT_COLOR } from './Ancient';
// ========== 装备掉落（引擎无关） ==========
// 装备 = 底材（部位、生命、护甲）+ 随机词条。
// 词条本身就是修饰器：“攻击+12%”= 对所有技能 mul damage 0.12；“旋风斩范围+30%”= 只匹配旋风斩。
// 所以装备不需要单独的属性系统，直接喂给 Loadout 就能改变技能。
// 生成结果是纯 JSON，可直接存档。
import { ModifierDef, StatKey, EffectDef } from './types';
import { ItemDef, ItemSlot } from './Loadout';
import { GearElem, GEAR_ELEMS, ELEM_NAME } from './Resonance';

import { migrateTarget, shellScale } from './EndgameIlvl';
/** 11-05 固定装备换代表（旧 fixedId → 新 fixedId）：内容包加载时登记（如 DLC1 D40_MIGRATE），读档时 main.ts 调 migrateFixed */
export const FIXED_MIGRATE: Record<string, string> = {};
export type { ItemSlot };
export type Quality = ItemDef['quality'];
export const QUALITIES: Quality[] = ['white', 'green', 'blue', 'purple', 'orange', 'dark'];
export const QUALITY_NAME: Record<Quality, string> = { white: '普通', green: '优秀', blue: '精良', purple: '史诗', orange: '传说', dark: '暗金' };
export const QUALITY_COLOR: Record<Quality, string> = { white: '#FFFFFF', green: '#1EFF00', blue: '#0070DD', purple: '#A335EE', orange: '#FF8000', dark: '#C9A44C' };
/** v0.6.7：各品质词条按层固定（c = 属性◇，s = 技能✚，e = 小特效★）；[a, b] = a~b 条（各 50%）。
 *  绿 1/0/0；蓝 2/0~1/0；紫 2/1/0~1；橙 2/1/0（+ 传说大特效）；暗金 2/0/0（+ 2 条固定大特效 + 拓印） */
export interface AffixPlan { c: number; s: [number, number]; e: [number, number] }
export const AFFIX_PLAN: Record<Quality, AffixPlan> = {
  white: { c: 0, s: [0, 0], e: [0, 0] }, green: { c: 1, s: [0, 0], e: [0, 0] }, blue: { c: 2, s: [0, 1], e: [0, 0] },
  purple: { c: 2, s: [1, 1], e: [0, 1] }, orange: { c: 2, s: [1, 1], e: [0, 0] }, dark: { c: 2, s: [0, 0], e: [0, 0] },
};
/** 固定装备（套装件 / 副本小套 / 隐藏橙装 / 野外首领件）：2 属性 + 1 技能；暗金 2 属性 */
export const FIXED_PLAN = (q: Quality): AffixPlan => ({ c: 2, s: q === 'dark' ? [0, 0] : [1, 1], e: [0, 0] });
/** 副本套装名字显示金色（存档里的品质不变） */
export const SET_COLOR = '#2ED573';   // v0.9.1m 套装改深翠绿（与「优秀」#1EFF00 拉开）
export const itemColor = (it: { quality: Quality; setId?: string; ancient?: boolean }) => it.ancient ? ANCIENT_COLOR : it.setId ? SET_COLOR : QUALITY_COLOR[it.quality];
/** 各品质数值倍率 */
export const QUALITY_MUL: Record<Quality, number> = { white: 0.8, green: 1, blue: 1.15, purple: 1.3, orange: 1.45, dark: 1.6 };

/** 护甲类型：护甲部位（头/肩/胸/腕/手/腰/腿/脚）按职业限定；项链/戒指/饰品/披风通用 */
export type ArmorType = 'plate' | 'cloth' | 'leather' | 'mail';   // v1.0.6 mail 链甲（本体职业不用，给内容包职业）
/** 武器/副手类型 */
export type WeaponType = 'sword' | 'axe' | 'mace' | 'greatsword' | 'greataxe' | 'staff' | 'wand' | 'dagger' | 'shield' | 'tome' | 'orb' | 'chakram' | 'hourglass' | 'flask' | 'reagent' | 'glaive' | 'bow' | 'shortblade' | 'coffin';   // v1.0.6 长柄弯刃 / 弓 / 短刃；v1.0.7 棺（给内容包职业）

// ---------- v1.2.55 名字与武器类型一致：传说特效名带武器名词（如「血怒·风暴战斧」）但掉在别的底材上（巨剑）时，把名词换成底材的 ----------
/** 名字里的武器名词 → 类型（取最后出现、同位置取最长，与铸造台识别同规则） */
const NAME_TYPE_KW: [string, WeaponType][] = [
  ['剑', 'sword'], ['长剑', 'sword'], ['细剑', 'sword'], ['佩剑', 'sword'], ['弯刀', 'sword'], ['刀', 'sword'],
  ['巨剑', 'greatsword'], ['大剑', 'greatsword'], ['双手剑', 'greatsword'], ['重剑', 'greatsword'], ['大刀', 'greatsword'],
  ['斧', 'axe'], ['战斧', 'axe'], ['手斧', 'axe'], ['巨斧', 'greataxe'], ['大斧', 'greataxe'], ['双手斧', 'greataxe'],
  ['锤', 'mace'], ['战锤', 'mace'], ['槌', 'mace'], ['杖', 'staff'], ['法杖', 'staff'], ['长杖', 'staff'], ['魔杖', 'wand'], ['短杖', 'wand'],
  ['匕首', 'dagger'], ['短刀', 'dagger'], ['短剑', 'dagger'], ['盾', 'shield'], ['圆盾', 'shield'], ['塔盾', 'shield'],
  ['法典', 'tome'], ['典籍', 'tome'], ['魔典', 'tome'], ['法球', 'orb'], ['宝珠', 'orb'], ['时轮', 'chakram'], ['轮刃', 'chakram'],
  ['沙漏', 'hourglass'], ['药瓶', 'flask'], ['试剂匣', 'reagent'], ['试剂', 'reagent'], ['弓', 'bow'], ['长弓', 'bow'], ['弩', 'bow'],
  ['长柄刃', 'glaive'], ['偃月', 'glaive'], ['短刃', 'shortblade'], ['棺', 'coffin'], ['铁棺', 'coffin'],
];
const TYPE_NOUN: Record<WeaponType, string> = { sword: '长剑', greatsword: '巨剑', axe: '战斧', greataxe: '巨斧', mace: '战锤', staff: '法杖', wand: '魔杖', dagger: '匕首',
  shield: '盾', tome: '法典', orb: '法球', chakram: '时轮', hourglass: '沙漏', flask: '药瓶', reagent: '试剂匣', glaive: '长柄刃', bow: '长弓', shortblade: '短刃', coffin: '铁棺' };
export function nameWeaponType(name: string): { type: WeaponType; at: number; len: number } | null {
  let best: { type: WeaponType; at: number; len: number; end: number } | null = null;
  for (const [w, t] of NAME_TYPE_KW) for (let i = name.indexOf(w); i >= 0; i = name.indexOf(w, i + 1)) {
    const end = i + w.length; if (!best || end > best.end || (end === best.end && w.length > best.len)) best = { type: t, at: i, len: w.length, end };
  }
  return best;
}
export function nameFitsWeapon(name: string, wt?: WeaponType): boolean {
  if (!wt) return true; const d = nameWeaponType(name); if (!d || d.type === wt) return true;
  if (d.type === 'axe' && wt === 'greataxe') return true;   // 「战斧」出在双手斧上可以；反过来「巨斧」出在单手斧上不行
  if (d.type === 'sword' && wt === 'greatsword' && d.len === 1) return true;   // 单字「剑」通用
  return false;
}
/** 名字和武器类型不符时把名词换成底材类型的（只换最后一个武器名词，前缀保留） */
export function fitWeaponName(name: string, wt?: WeaponType): string {
  if (!wt || nameFitsWeapon(name, wt)) return name;
  const d = nameWeaponType(name)!; return name.slice(0, d.at) + TYPE_NOUN[wt] + name.slice(d.at + d.len);
}
export const ARMOR_TYPE_NAME: Record<ArmorType, string> = { plate: '重甲', cloth: '布甲', leather: '皮甲', mail: '链甲' };
export const WEAPON_TYPE_NAME: Record<WeaponType, string> = {
  sword: '剑', axe: '斧', mace: '锤', greatsword: '巨剑', greataxe: '巨斧', staff: '法杖', wand: '魔杖', dagger: '匕首', shield: '盾牌', tome: '典籍', orb: '法球', chakram: '时轮', hourglass: '沙漏', flask: '药瓶', reagent: '试剂匣', glaive: '长柄弯刃', bow: '弓', shortblade: '短刃', coffin: '棺',
};
/** 角色二级属性（装备底材、词条都能提供）：强度=攻击/法术强度（每点技能伤害 +0.4%），其余为百分点 */
export type BonusStat = 'power' | 'crit' | 'critDmg' | 'haste' | 'speed';
export const BONUS_STATS: BonusStat[] = ['power', 'crit', 'critDmg', 'haste', 'speed'];
export const BONUS_NAME: Record<BonusStat, string> = { power: '强度', crit: '暴击率', critDmg: '暴击伤害', haste: '急速', speed: '移动速度' };
/** 显示文本：强度是整数，其余是百分比 */
export const bonusText = (k: BonusStat, v: number, cls?: string) =>
  k === 'power' ? `${cls === 'mage' || cls === 'alchemy' ? '法术' : '攻击'}强度 +${v}` : `${BONUS_NAME[k]} +${v}%`;

/** cls：职业限定（不填 = 通用），如法杖只给法师；bonus：底材自带的二级属性（双手武器强度高，副手给急速/暴击） */
export interface ItemBase {
  id: string; name: string; slot: ItemSlot; hp: number; armor: number; cls?: string;
  armorType?: ArmorType; weaponType?: WeaponType; bonus?: Partial<Record<BonusStat, number>>;
  /** 哪个版本加入（掉落说明书上新版本的装备标「新」） */
  since?: string;
  /** v1.0.6：来自哪个内容包（合并时自动打上），生成的物品带同样的 pack 标记 */
  pack?: string;
  /** 11-05：退役底材（不再随机掉落 / 不进任何底材池），定义保留给老存档按 id 查 */
  noDrop?: boolean;
}

export type AffixDef = (
  | { id: string; kind: 'skill'; text: string; slots: ItemSlot[]; weight: number; stat: StatKey; op: 'add' | 'mul'; min: number; max: number; match?: ModifierDef['match'] }
  | { id: string; kind: 'char'; text: string; slots: ItemSlot[]; weight: number; stat: 'hp' | 'armor' | BonusStat; min: number; max: number }
  | { id: string; kind: 'effect'; text: string; slots: ItemSlot[]; weight: number; minQuality: Quality; effect: EffectDef; match?: ModifierDef['match'] }
) & { cls?: string };   // cls：只对某职业出现（词条匹配的是该职业的技能）

/** 传说特效：改变技能形态的大词条，只出现在橙装上 */
export interface LegendaryPower {
  id: string; name: string; slots: ItemSlot[]; modifier: ModifierDef; cls?: string;
  /** v0.6.9：额外的特效（第二条 / 多职业首饰的另一职业版本，用 ModifierDef.cls 区分） */
  extra?: ModifierDef[];
  /** v0.6.9：特效类别（形态变换 / 连锁触发 / 资源循环 / 召唤与地面 / 条件强化）与来源说明（掉落说明书） */
  kind?: string; source?: string;
  /** v1.2.7：最低角色等级（随机橙装只在玩家等级 ≥ minLevel 时进池；不填 = 任何等级）。30 级起装等固定，所以按角色等级而不是装等 */
  minLevel?: number;
  /** v0.9.7：来自哪个内容包（core/ContentPacks 合并时自动打上；本体条目没有） */
  pack?: string;
}
const CLS_TAG: Record<string, string> = { warrior: '【战士】', mage: '【法师】' };
/** 特效文字：只对某职业生效的加职业前缀 */
export const fxLine = (m: ModifierDef) => m.desc;   // v0.9.1o：橙装都是职业专属，不再加【职业】前缀
void CLS_TAG;

/** v0.5 B：暗金典藏定义（只有武器和饰品）。modifier 是改变玩法的效果（纯数据修饰器，priority 25：排在传说 15~20 之后、套装 4 件 30 之前） */
export interface RelicDef {
  id: string; name: string; cls: string; baseId: string; modifier: ModifierDef;
  /** 背景一句话（提示框里灰字） */
  flavor: string;
  /** 外观：主色 / 流光色（浏览器版 gear.ts 用） */
  look: { main: number; glow: number };
  since?: string;
}

/** 生成出来的装备实例（满足 ItemDef，可直接给 Loadout） */
export interface ItemInstance extends ItemDef {
  baseId: string;
  /** v0.9.7：内容包物品标记（DLC 物品 = 包 id）。本体读到没注册的包的物品会封存（core/PackSave.ts），不删 */
  pack?: string;
  itemLevel: number;
  /** v0.9.1q：按新装等规则生成 / 已迁移（老存档读档时迁移一次） */
  ilv2?: number;
  hp: number;
  armor: number;
  lines: string[];       // 词条显示文本，按顺序
  sellPrice: number;
  /** 强化等级 +1~+10（core/Forge.ts）；baseHp/baseArmor 是强化前的数值 */
  upgrade?: number;
  baseHp?: number;
  baseArmor?: number;
  baseBonus?: Partial<Record<BonusStat, number>>;
  /** v3：护甲类型 / 武器类型（穿戴限制），二级属性 */
  armorType?: ArmorType;
  weaponType?: WeaponType;
  bonus?: Partial<Record<BonusStat, number>>;
  /** v0.6.2：来源（「腐沼神殿」「野外首领 · 沙暴之主」），提示框里显示 */
  source?: string;
  /** 来源档次：wild 野外 / elite 野外首领 / dungeon 副本 / raid 长副本 / shop 商店 */
  tier?: 'wild' | 'elite' | 'dungeon' | 'raid' | 'shop';
  /** v0.6.2：词条记录（淬炼重洗、元素共鸣用）；固定装备 / 传说的 id */
  affixLog?: AffixRoll[];
  fixedId?: string;
  lgId?: string;
  /** v0.6.3：拓印上去的暗金效果（暗金 id） */
  engraveId?: string;
  /** v0.5：耐久 0~100（core/Durability.ts）；没有字段 = 100。0 = 已损坏，属性全部失效 */
  durability?: number;
  /** v0.5：带一条 ✧ 特殊属性（v0.5 C 暗岩锻造自选；v0.6.6 主线起只有锻造会出） */
  special?: boolean;
  /** 不可分解（主线 v0.6.6 暂无装备使用；暗金走拓印，可以分解）；保留字段兼容 v0.5.0-c 存档 */
  noSalvage?: boolean;
  /** v0.5 C：玩家锁定（背包 / 角色面板的锁按钮）：一键分解、拾取自动分解都跳过 */
  locked?: boolean;
  /** v0.5 C：铁匠兑换「暗岩锻造」系列装备 */
  forged?: boolean;
  /** v0.7.4：觉醒（历练 xp / 待选 opts / 已选 pick，core/Awaken.ts） */
  awk?: { xp: number; opts?: string[]; pick?: string };
  /** v0.7.4：伴你击败的首领数 */
  kills?: number;
  /** v0.7.4：铁匠额外开的孔数；runes = 已镶嵌的岩纹（下标 = 孔位，null = 空孔） */
  sockOpen?: number;
  runes?: (string | null)[];
  /** v0.9.6b：太古（词条峰值 + 特效 ×2，core/Ancient.ts） */
  ancient?: boolean;
}
/** sp：特殊属性（v0.5 C 暗岩锻造自选，数值 ×1.6，从 LootData.specialAffixes 里找） */
export interface AffixRoll { id: string; r: number; el?: GearElem; sp?: boolean }
/** 特殊属性数值倍率 */
export const SPECIAL_MUL = 1.6;

/** v0.5 C：装备上一行可重铸的随机词条（按文字解析，老存档的装备也能用） */
export interface AffixLine { idx: number; def: AffixDef; special: boolean; value: number; text: string }

export type LootEntry =
  | { kind: 'random'; chance: number; minQuality?: Quality; slots?: ItemSlot[] }
  | { kind: 'fixed'; chance: number; itemId: string; ilvl?: number }
  | { kind: 'lg'; chance: number; lgId: string; /** 11-18 掉出后成为太古的几率（内容包副本用；缺省 0） */ anc?: number };   // v0.9.6a 指定传说特效的橙装（别的职业的特效不掉）   // 套装件、指定传说、野外首领特效件；ilvl = 装等加成

/** stacks：额外掉落的可堆叠物品（强化材料等） */
export interface LootTable { id: string; gold: [number, number]; entries: LootEntry[]; stacks?: { id: string; chance: number; min: number; max: number }[]; }

export interface LootData {
  bases: ItemBase[];
  affixes: AffixDef[];
  legendaries: LegendaryPower[];
  fixedItems: (ItemDef & { baseId: string; affixes?: number; desc?: string; since?: string; adapt?: boolean; pack?: string })[];   // v0.9.3h adapt：副本专属件，按职业换同部位底材（武器也换）   // 固定装备：套装件、野外首领特效件等，底材属性仍随机生成；affixes = 额外随机词条数（职业套装件默认 2）
  /** v0.5 C：特殊属性池（暗岩锻造自选的 ✧ 词条） */
  specialAffixes?: AffixDef[];
  /** v0.9.1o：传说 id 重映射（效果合并的老橙装） */
  legendaryRemap?: Record<string, string>;
  /** 品质权重（不含白装：怪物掉白装没意思） */
  qualityWeights: Partial<Record<Quality, number>>;
}

let uidSeq = 0;
const newUid = (rng: () => number) => `it_${Date.now().toString(36)}_${(uidSeq++).toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;

function weighted<T>(list: T[], w: (t: T) => number, rng: () => number): T | undefined {
  const total = list.reduce((s, x) => s + w(x), 0);
  let r = rng() * total;
  for (const x of list) { r -= w(x); if (r <= 0) return x; }
  return list[list.length - 1];
}
const round = (v: number, step: number) => Math.round(v / step) * step;

/** v1.2.38 首领级怪的掉落池不出这些品质的随机装备 */
export const BOSS_NO_Q: ReadonlySet<Quality> = new Set<Quality>(['white', 'green', 'blue', 'purple']);

export class LootGenerator {
  /** 当前职业：决定底材（法杖/长剑）、职业词条、传说特效的池子；不设则全部可出 */
  classId: string | undefined;
  constructor(private data: LootData, private rng: () => number = Math.random) {}

  private forClass<T extends { cls?: string }>(list: T[]) { return list.filter(x => !(x as { noDrop?: boolean }).noDrop && (!x.cls || !this.classId || x.cls === this.classId)); }   // 11-05 noDrop 退役底材不进池

  rollQuality(min: Quality = 'green'): Quality {
    const minI = QUALITIES.indexOf(min);
    const pool = QUALITIES.filter((q, i) => i >= minI && (this.data.qualityWeights[q] ?? 0) > 0);
    return weighted(pool, q => this.data.qualityWeights[q]!, this.rng) ?? min;
  }

  /** 生成一件随机装备 */
  /** v0.9.1q：满级固定装等（web 层注入；core 测试不设 = 原装等） */
  ilvlPolicy: ((raw: number, q: Quality) => number) | null = null;
  /** v1.2.7：玩家等级（web 层注入，给 LegendaryPower.minLevel 用） */
  playerLevel: (() => number) | null = null;
  private lv(raw: number, q: Quality) { return this.ilvlPolicy ? this.ilvlPolicy(raw, q) : raw; }
  generate(itemLevel: number, quality: Quality, slots?: ItemSlot[]): ItemInstance {
    itemLevel = this.lv(itemLevel, quality);
    let bases = this.forClass(this.data.bases).filter(b => !slots || slots.includes(b.slot));
    if (!bases.length) bases = this.forClass(this.data.bases);
    // 橙装只出在有传说特效的部位上（否则会出现没有特效的「传说」）
    const plv = this.playerLevel ? this.playerLevel() : 99, lgOk = (l: LegendaryPower) => !l.minLevel || plv >= l.minLevel;   // v1.2.7 高等级专属特效（core 测试不设 = 不限）
    if (quality === 'orange') { const lgSlots = new Set(this.forClass(this.data.legendaries).filter(lgOk).flatMap(l => l.slots)); const ok = bases.filter(b => lgSlots.has(b.slot)); if (!ok.length && slots) return this.generate(itemLevel, 'purple', slots);   /* v1.2.10 指定了部位但那些部位没有可用传说特效：降紫，不再换成别的部位（以前会把「胸甲」出成武器） */ bases = ok.length ? ok : this.forClass(this.data.bases).filter(b => lgSlots.has(b.slot)); }   // v0.9.1o：指定的部位不出橙装（套装部位）时改到能出橙装的部位
    if (!bases.length && quality === 'orange') return this.generate(itemLevel, 'purple', slots);   // v1.2.1 本职业没有任何传说特效（新职业 / 内容包职业）：降为紫装，不报错
    const base = bases[Math.floor(this.rng() * bases.length)];
    const item = this.makeShell(base, itemLevel, quality, base.name, newUid(this.rng));

    // 传说特效放在第一行
    if (quality === 'orange') {
      const pool0 = this.forClass(this.data.legendaries).filter(l => lgOk(l) && l.slots.includes(base.slot));
      const fit = pool0.filter(l => nameFitsWeapon(l.name, base.weaponType)), pool = fit.length ? fit : pool0;   // v1.2.55 优先名字与底材一致的特效
      const lg = pool[Math.floor(this.rng() * pool.length)];
      if (lg) { item.lgId = lg.id; this.applyLegendary(item, lg); }
    }
    this.rollAffixes(item, base.slot, quality, AFFIX_PLAN[quality]);
    return item;
  }

  /** v0.9.6a 指定传说特效的橙装：在特效允许的部位里挑本职业底材 */
  generateLegendary(lgId: string, itemLevel: number): ItemInstance | null {
    const lg = this.data.legendaries.find(l => l.id === lgId); if (!lg) return null;
    if (lg.cls && this.classId && lg.cls !== this.classId) return null;
    itemLevel = this.lv(itemLevel, 'orange');
    const bases0 = this.forClass(this.data.bases).filter(b => lg.slots.includes(b.slot));
    if (!bases0.length) return null;
    const fitB = bases0.filter(b => nameFitsWeapon(lg.name, b.weaponType)), bases = fitB.length ? fitB : bases0;   // v1.2.55 指定特效时挑名字对得上的底材
    const base = bases[Math.floor(this.rng() * bases.length)];
    const item = this.makeShell(base, itemLevel, 'orange', base.name, newUid(this.rng));
    item.lgId = lg.id; this.applyLegendary(item, lg);
    this.rollAffixes(item, base.slot, 'orange', AFFIX_PLAN.orange);
    return item;
  }
  /** 固定装备（套装件等）：保留它自带的修饰器，再随机底材数值 */
  generateFixed(itemId: string, itemLevel: number): ItemInstance | null {
    { const d = this.data.fixedItems.find(f => f.id === itemId); if (d) itemLevel = this.lv(itemLevel, d.quality); }
    const def = this.data.fixedItems.find(i => i.id === itemId);
    let base = def && this.data.bases.find(b => b.id === def.baseId);
    if (!def || !base) return null;
    // v0.9.2e 职业装备限定兜底：别的职业的护甲底材换成本职业同部位底材（名字、特效不变）
    if (def.adapt && base.cls && this.classId && base.cls !== this.classId) {   // v0.9.3h 副本专属件：武器 / 副手 / 护甲都换成本职业的（主手武器单双手都算）
      const sl = base.slot, wpn = sl === 'oneHand' || sl === 'twoHand';
      let own = this.forClass(this.data.bases).filter(b => b.cls === this.classId && (wpn ? (b.slot === 'oneHand' || b.slot === 'twoHand') : b.slot === sl));
      if (!own.length && sl === 'offHand') own = this.forClass(this.data.bases).filter(b => b.cls === this.classId && (b.slot === 'oneHand' || b.slot === 'twoHand'));   // v1.2.1 没有副手的职业（只用双手武器）：副手件换成本职业主手武器
      { const fit = own.filter(b => nameFitsWeapon(def.name, b.weaponType)); if (fit.length) own = fit; }   // v1.2.55 名字对得上的底材优先
      if (own.length) base = own[Math.floor(this.rng() * own.length)];
    } else if (base.armorType && base.cls && this.classId && base.cls !== this.classId) {
      const sl = base.slot, own = this.forClass(this.data.bases).filter(b => b.slot === sl && b.armorType && b.cls === this.classId);
      if (own.length) base = own[Math.floor(this.rng() * own.length)];
    }
    const uid = newUid(this.rng);
    const item = this.makeShell(base, itemLevel, def.quality, fitWeaponName(def.name, base.weaponType), uid);
    item.fixedId = def.id;
    this.applyFixed(item, def);
    // v0.5 B：职业套装件另外随机 2 条词条（副本小套等自己写 affixes）
    if (def.affixes) this.rollAffixes(item, base.slot, def.quality, FIXED_PLAN(def.quality));
    return item;
  }

  /** boss = 首领级（野外首领 / 精英、副本 / 长副本 / 爬塔首领）：v1.2.38 随机装备不出绿 / 蓝 / 紫（掷出来就作废，橙装概率不变）；固定装备（专属件 / 套装）照旧 */
  roll(table: LootTable, itemLevel: number, boss = false): { gold: number; items: ItemInstance[]; stacks: { id: string; count: number }[] } {
    const gold = Math.round(table.gold[0] + this.rng() * (table.gold[1] - table.gold[0]));
    const items: ItemInstance[] = [];
    const stacks: { id: string; count: number }[] = [];
    for (const s of table.stacks ?? []) if (this.rng() < s.chance) stacks.push({ id: s.id, count: s.min + Math.floor(this.rng() * (s.max - s.min + 1)) });
    for (const e of table.entries) {
      if (this.rng() >= e.chance) continue;
      if (e.kind === 'random') { const q = this.rollQuality(e.minQuality); if (boss && BOSS_NO_Q.has(q)) continue; items.push(this.generate(itemLevel, q, e.slots)); }
      else if (e.kind === 'lg') { const it = this.generateLegendary(e.lgId, itemLevel); if (it) { if (e.anc && this.rng() < e.anc) this.ancientify(it); items.push(it); } }
      else {
        // 固定装备的底材限定职业时（套装件），别的职业不掉（v0.5 B 修正：法师不会再掉战士的重甲套装件）
        const def = this.data.fixedItems.find(i => i.id === e.itemId), base = def && this.data.bases.find(b => b.id === def.baseId);
        if (base?.cls && this.classId && base.cls !== this.classId && !def?.adapt) continue;
        const it = this.generateFixed(e.itemId, itemLevel + (e.ilvl ?? 0)); if (it) items.push(it);
      }
    }
    return { gold, items, stacks };
  }

  /** 按记录重新生成数值（淬炼后调用）；调用前应先把强化还原到 0 */
  rebuild(item: ItemInstance) {
    const base = this.data.bases.find(b => b.id === item.baseId);
    if (!base || !item.affixLog) return false;
    const keep = { id: item.id, name: item.name, source: item.source, tier: item.tier, affixLog: item.affixLog, fixedId: item.fixedId, lgId: item.lgId, engraveId: item.engraveId,
      durability: item.durability, locked: item.locked, forged: item.forged, setId: item.setId, noSalvage: item.noSalvage, ancient: item.ancient };
    const shell = this.makeShell(base, item.itemLevel, item.quality, item.name, item.id);
    for (const k of Object.keys(item) as (keyof ItemInstance)[]) delete (item as any)[k];
    Object.assign(item, shell, keep);
    item.modifiers = []; item.lines = [];
    if (item.fixedId) { const def = this.data.fixedItems.find(f => f.id === item.fixedId); if (def) this.applyFixed(item, def); }
    if (item.lgId) { const lg = this.data.legendaries.find(l => l.id === item.lgId); if (lg) this.applyLegendary(item, lg); }
    for (const a of keep.affixLog) { const def = (a.sp ? this.data.specialAffixes ?? [] : this.data.affixes).find(x => x.id === a.id); if (def) this.applyAffix(item, def, a); }
    if (keep.affixLog.some(a => a.sp)) item.special = true;
    if (!item.engraveId) delete item.engraveId; else this.engrave(item, item.engraveId);
    if (!item.ancient) delete item.ancient;
    return true;
  }

  /** v0.9.1q 老存档装等迁移：30 以上的装备 → 40（暗金 70），按原词条比例（affixLog 的 r）重算，不重新随机。
   *  upgrade：web 层传 applyUpgrade（先还原强化、重算后再按原等级强化）。返回是否改动 */
  migrateIlvl(item: ItemInstance, upgrade?: (it: ItemInstance, lvl: number) => void): boolean {
    const to = migrateTarget(item);
    if (to === null) { item.ilv2 = 1; return false; }
    const lvl = item.upgrade ?? 0, from = item.itemLevel;
    if (upgrade && item.baseHp !== undefined) upgrade(item, 0);
    item.itemLevel = to;
    if (!this.rebuild(item)) {
      const k = shellScale(to) / shellScale(from);
      item.hp = Math.round((item.baseHp ?? item.hp) * k); item.armor = Math.round((item.baseArmor ?? item.armor) * k);
      if (item.baseBonus) item.bonus = { ...item.baseBonus };
      delete item.baseHp; delete item.baseArmor; delete item.baseBonus; delete item.upgrade;
    }
    item.ilv2 = 1;
    if (upgrade && lvl) upgrade(item, lvl);
    return true;
  }

  /** 拓印：把一件暗金的固定效果刻到这件装备上（每件只能有一个拓印，新的替换旧的） */
  engrave(item: ItemInstance, darkId: string) {
    const def = this.data.fixedItems.find(f => f.id === darkId);
    if (!def) return false;
    item.modifiers = item.modifiers.filter(m => !m.id.includes(':eng:'));
    item.lines = item.lines.filter(l => !l.startsWith('✦'));
    item.engraveId = darkId;
    def.modifiers.forEach(m => { item.modifiers.push({ ...m, id: `${item.id}:eng:${m.id}` }); item.lines.unshift(`✦ 拓印「${def.name}」：${m.desc}`); });
    return true;
  }

  /** 淬炼：mode = affix 重洗第 i 条词条（保留元素）/ elem 重铸元素（词条不变）。返回新记录 */
  reforge(item: ItemInstance, i: number, mode: 'affix' | 'elem'): AffixRoll | null {
    const log = item.affixLog, cur = log?.[i];
    if (!log || !cur) return null;
    if (mode === 'elem') {
      const pool = GEAR_ELEMS.filter(e => e !== cur.el);
      cur.el = pool[Math.floor(this.rng() * pool.length)];
    } else {
      const qi = QUALITIES.indexOf(item.quality);
      const used = new Set(log.map(a => a.id));
      const pool = this.forClass(this.data.affixes).filter(a => a.slots.includes(item.slot) && !used.has(a.id) && (a.kind !== 'effect' || qi >= QUALITIES.indexOf(a.minQuality)));
      const src = cur.sp ? this.forClass(this.data.specialAffixes ?? []).filter(a => a.slots.includes(item.slot) && !used.has(a.id)) : pool;
      const a = src.length ? weighted(src, x => x.weight, this.rng)! : (cur.sp ? this.data.specialAffixes ?? [] : this.data.affixes).find(x => x.id === cur.id)!;
      log[i] = { id: a.id, r: item.ancient ? 1 : this.rng(), el: cur.el, ...(cur.sp ? { sp: true } : {}) };
    }
    this.rebuild(item);
    return log[i];
  }

  // ---------------- v0.5 C：铁匠兑换（暗岩锻造：指定底材 + 自选特殊属性） ----------------
  /** 底材定义 / 固定装备名字（兑换页用） */
  base(id: string): ItemBase | undefined { return this.data.bases.find(b => b.id === id); }
  fixedName(id: string): string | undefined { return this.data.fixedItems.find(f => f.id === id)?.name; }
  fixedBase(id: string): string | undefined { return this.data.fixedItems.find(f => f.id === id)?.baseId; }

  /** 用指定底材生成一件装备（暗岩锻造系列）：底材 + 该品质数量的随机词条；不出传说特效 */
  generateFromBase(baseId: string, itemLevel: number, quality: Quality): ItemInstance | null {
    itemLevel = this.lv(itemLevel, quality);
    const base = this.data.bases.find(b => b.id === baseId);
    if (!base) return null;
    const item = this.makeShell(base, itemLevel, quality, base.name, newUid(this.rng));
    this.rollAffixes(item, base.slot, quality, AFFIX_PLAN[quality]);
    return item;
  }

  /** 指定一条特殊属性（玩家在兑换页自选）：数值 ×1.6，文字前加 ✧，记进 affixLog（淬炼时只换成另一条特殊属性）；部位不合适或已有特殊属性返回 false */
  addChosenSpecial(item: ItemInstance, affixId: string, pool: AffixDef[] = this.data.specialAffixes ?? []): boolean {
    const a = pool.find(x => x.id === affixId);
    if (!a || !a.slots.includes(item.slot) || item.special) return false;
    const roll: AffixRoll = { id: a.id, r: this.rng(), sp: true };
    (item.affixLog ??= []).push(roll);
    this.applyAffix(item, a, roll);
    item.special = true;
    return true;
  }

  /** v0.9.6b 太古：词条全部取峰值、橙装 / 暗金特效 ×2、名字加「（太古）」。只对套装 / 橙装 / 暗金生效；已强化的先别调（掉落时调用） */
  ancientify(item: ItemInstance): boolean {
    if (item.ancient || item.upgrade || !(item.setId || item.quality === 'orange' || item.quality === 'dark')) return false;
    item.ancient = true;
    item.affixLog ??= [];
    item.affixLog.forEach(a => { a.r = 1; });
    this.rebuild(item);
    item.name = ancName(item.name);
    item.sellPrice = Math.round(item.sellPrice * 2);
    return true;
  }

  // ---------- 内部 ----------
  private applyLegendary(item: ItemInstance, lg: LegendaryPower) {
    if (lg.pack) item.pack = lg.pack;   // v0.9.7 内容包橙装：物品带包标记
    const A = (m: ModifierDef) => item.ancient ? ancientMod(m) : m;
    item.name = item.ancient ? ancName(fitWeaponName(lg.name, item.weaponType)) : fitWeaponName(lg.name, item.weaponType);
    { const m = A(lg.modifier); item.modifiers.push({ ...m, id: `${item.id}:${lg.id}` }); item.lines.push(`★ ${fxLine(m)}`); }
    (lg.extra ?? []).forEach((m0, k) => { const m = A(m0); item.modifiers.push({ ...m, id: `${item.id}:${lg.id}#${k}` }); item.lines.push(`★ ${fxLine(m)}`); });
  }
  /** v0.9.1o：老橙装迁移——合并的特效换新 id；部位不再出橙装 / 特效已删除的转紫装、删特效、恢复底材名 */
  migrateLegendary(item: ItemInstance): boolean {
    if (!item.lgId) return false;
    const old = item.lgId, to = this.data.legendaryRemap?.[old];
    const base = this.data.bases.find(b => b.id === item.baseId);
    const strip = (id: string) => { item.modifiers = item.modifiers.filter(m => !m.id.startsWith(`${item.id}:${id}`)); item.lines = item.lines.filter(l => !l.startsWith('★ ')); };
    if (to) { strip(old); item.lgId = to; const lg = this.data.legendaries.find(l => l.id === to); if (lg && base && lg.slots.includes(base.slot)) { this.applyLegendary(item, lg); return true; } }
    const lg = this.data.legendaries.find(l => l.id === item.lgId);
    if (lg && base && lg.slots.includes(base.slot)) return !!to;
    strip(item.lgId); delete item.lgId;
    item.quality = 'purple'; if (base) item.name = base.name;
    return true;
  }
  /** v0.6.9：读档时按最新配置刷新传说 / 固定特效（数值调整对老装备也生效）；套装件不动 */
  refreshEffects(item: ItemInstance): boolean {
    const mig = this.migrateLegendary(item);
    const lg = item.lgId ? this.data.legendaries.find(l => l.id === item.lgId) : undefined;
    const def = item.fixedId && !item.setId ? this.data.fixedItems.find(f => f.id === item.fixedId) : undefined;
    if (!lg && !def) return mig;
    const before = JSON.stringify([item.modifiers.map(m => m.id + m.desc), item.lines]);
    const ids = new Set<string>();
    if (lg) { ids.add(`${item.id}:${lg.id}`); (lg.extra ?? []).forEach((_, k) => ids.add(`${item.id}:${lg.id}#${k}`)); }
    if (def) def.modifiers.forEach(m => ids.add(`${item.id}:${m.id}`));
    const isFx = (id: string) => ids.has(id) || (!!lg && id.startsWith(`${item.id}:${lg.id}#`));
    const old = item.modifiers.filter(m => isFx(m.id));
    const oldLines = new Set(old.flatMap(m => [`★ ${m.desc}`, `★ ${fxLine(m)}`, `◆ ${m.desc}`, `◆ ${fxLine(m)}`, `❖ ${m.desc}`, `❖ ${fxLine(m)}`]));
    item.modifiers = item.modifiers.filter(m => !isFx(m.id));
    item.lines = item.lines.filter(l => !oldLines.has(l));
    if (lg) this.applyLegendary(item, lg);
    if (def) this.applyFixed(item, def);
    if (lg) item.name = item.ancient ? ancName(fitWeaponName(lg.name, item.weaponType)) : fitWeaponName(lg.name, item.weaponType);
    return mig || before !== JSON.stringify([item.modifiers.map(m => m.id + m.desc), item.lines]);
  }
  /** 11-05 固定装备换代（内容包 fixedMigrate，如 DLC1 旧 40 级暗金 → 新件）：去掉旧件特效行 / 修饰器，换 id 与名字，挂新件特效；底材属性与随机词条保留。返回是否改动 */
  migrateFixed(item: ItemInstance, map: Record<string, string>): boolean {
    const to = item.fixedId ? map[item.fixedId] : undefined;
    const oldDef = to ? this.data.fixedItems.find(f => f.id === item.fixedId) : undefined, def = to ? this.data.fixedItems.find(f => f.id === to) : undefined;
    if (!oldDef || !def) return false;
    const ids = new Set(oldDef.modifiers.map(m => `${item.id}:${m.id}`));
    const oldLines = new Set(oldDef.modifiers.flatMap(m => ['', '❖ ', '◆ '].map(p => `${p}${fxLine(m)}`).concat(['', '❖ ', '◆ '].map(p => `${p}${fxLine(ancientMod(m))}`))));
    item.modifiers = item.modifiers.filter(m => !ids.has(m.id));
    item.lines = item.lines.filter(l => !oldLines.has(l));
    item.fixedId = def.id; item.name = item.ancient ? ancName(fitWeaponName(def.name, item.weaponType)) : fitWeaponName(def.name, item.weaponType);
    this.applyFixed(item, def);
    return true;
  }
  private applyFixed(item: ItemInstance, def: LootData['fixedItems'][number]) {
    if (def.pack) item.pack = def.pack;   // v0.9.7 内容包固定装备：物品带包标记
    item.setId = def.setId;
    def.modifiers.forEach(m0 => { const m = item.ancient && !def.setId ? ancientMod(m0) : m0; item.modifiers.push({ ...m, id: `${item.id}:${m.id}` }); item.lines.push(`${def.setId ? '' : def.quality === 'dark' ? '❖ ' : '◆ '}${fxLine(m)}`); });
  }
  private makeShell(base: ItemBase, ilvl: number, quality: Quality, name: string, uid: string): ItemInstance {
    const scale = (1 + (ilvl - 1) * 0.12) * QUALITY_MUL[quality];
    const qi = QUALITIES.indexOf(quality);
    // 双手武器占两个格子：售价 ×1.5
    const price = Math.round((5 + ilvl * 2) * (qi + 1) ** 2 * (base.slot === 'twoHand' ? 1.5 : 1));
    const it: ItemInstance = {
      id: uid, baseId: base.id, name, slot: base.slot, quality, itemLevel: ilvl, ilv2: 1,
      hp: Math.round(base.hp * scale), armor: Math.round(base.armor * scale),
      modifiers: [], lines: [], sellPrice: price, durability: 100,
    };
    if (base.armorType) it.armorType = base.armorType;
    if (base.weaponType) it.weaponType = base.weaponType;
    if (base.pack) it.pack = base.pack;   // v1.0.6 内容包底材
    const b = baseBonus(base, ilvl, quality);
    if (b) it.bonus = b;
    return it;
  }

  private rollAffixes(item: ItemInstance, slot: ItemSlot, quality: Quality, plan: AffixPlan) {
    const qi = QUALITIES.indexOf(quality);
    const all = this.forClass(this.data.affixes).filter(a => a.slots.includes(slot) && (a.kind !== 'effect' || qi >= QUALITIES.indexOf(a.minQuality)));
    const used = new Set<string>();
    item.affixLog ??= [];
    const span = (r: [number, number]) => r[0] + (r[1] > r[0] && this.rng() < 0.5 ? r[1] - r[0] : 0);
    // 技能 / 小特效池为空的部位（如护腕）用属性补齐，保证条数不少
    let c = plan.c;
    const take = (kind: AffixDef['kind'], n: number) => {
      let got = 0;
      for (; got < n; got++) {
        const pool = all.filter(a => a.kind === kind && !used.has(a.id));
        if (!pool.length) break;
        const a = weighted(pool, x => x.weight, this.rng)!;
        used.add(a.id);   // 同一件装备词条不重复
        const roll: AffixRoll = { id: a.id, r: this.rng() };
        // 蓝色及以上：一半词条带元素标签（元素共鸣）
        if (qi >= 2 && this.rng() < 0.5) roll.el = GEAR_ELEMS[Math.floor(this.rng() * GEAR_ELEMS.length)];
        item.affixLog!.push(roll);
        this.applyAffix(item, a, roll);
      }
      return got;
    };
    const s = span(plan.s), e = span(plan.e);
    const sGot = take('skill', s);
    if (sGot < s && plan.s[0] > 0) c += s - sGot;
    take('effect', e);
    take('char', c);
  }

  private applyAffix(item: ItemInstance, a: AffixDef, roll: AffixRoll) {
    const quality = item.quality;
    const mul = roll.sp ? SPECIAL_MUL : 1, sp = roll.sp ? ':sp' : '';
    const tag = (roll.sp ? '✧ ' : '') + (roll.el ? `〔${ELEM_NAME[roll.el]}〕` : '');
    const scale = QUALITY_MUL[quality] * (1 + (item.itemLevel - 1) * 0.05) * mul;
    const pick = (a.kind === 'effect' ? 0 : a.min + roll.r * (a.max - a.min));
    if (a.kind === 'char' && (a.stat === 'hp' || a.stat === 'armor')) {
      const v = Math.round(pick * scale * (1 + (item.itemLevel - 1) * 0.07));
      item[a.stat] += v;
      item.lines.push(tag + a.text.replace('{v}', String(v)));
    } else if (a.kind === 'char') {
      // 二级属性：强度跟生命一样随装等成长；百分比属性成长慢
      const k = a.stat as BonusStat;
      const grow = k === 'power' ? scale * (1 + (item.itemLevel - 1) * 0.07) : QUALITY_MUL[quality] * (1 + (item.itemLevel - 1) * 0.04) * mul;
      const v = Math.max(1, Math.round(pick * grow));
      (item.bonus ??= {})[k] = (item.bonus[k] ?? 0) + v;
      item.lines.push(tag + a.text.replace('{v}', String(v)));
    } else if (a.kind === 'skill') {
      const raw = pick * scale;
      const v = a.op === 'mul' ? round(raw, 0.01) : round(raw, 0.1);
      const shown = a.op === 'mul' ? Math.round(Math.abs(v) * 100) : Math.abs(v);
      const text = a.text.replace('{v}', String(shown));
      item.modifiers.push({ id: `${item.id}:${a.id}${sp}`, name: item.name, source: 'equipment', desc: text, match: a.match ?? {}, ops: [{ op: a.op, stat: a.stat, value: v }] });
      item.lines.push(tag + text);
    } else {
      item.modifiers.push({ id: `${item.id}:${a.id}${sp}`, name: item.name, source: 'equipment', desc: a.text, match: a.match ?? {}, ops: [{ op: 'addEffect', effect: a.effect }] });
      item.lines.push(tag + a.text);
    }
  }
}

/** 词条文字 → 正则（{v} 换成数字捕获组） */
const RX = new Map<string, RegExp>();
export function affixRegex(a: AffixDef): RegExp {
  let r = RX.get(a.text);
  if (!r) { r = new RegExp('^' + a.text.split('{v}').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(\\d+(?:\\.\\d+)?)') + '$'); RX.set(a.text, r); }
  return r;
}
/** 词条修饰器 id（和 applyAffix 一致：特殊属性带 :sp） */
export const affixModId = (item: ItemInstance, a: AffixDef, special: boolean) => `${item.id}:${a.id}${special ? ':sp' : ''}`;

/** 底材自带的二级属性按装等/品质成长（强度按生命同样的系数，百分比属性成长慢）；没有返回 undefined */
export function baseBonus(base: ItemBase, ilvl: number, quality: Quality): Partial<Record<BonusStat, number>> | undefined {
  if (!base.bonus) return undefined;
  const out: Partial<Record<BonusStat, number>> = {};
  for (const k of BONUS_STATS) {
    const v = base.bonus[k];
    if (!v) continue;
    out[k] = k === 'power'
      ? Math.round(v * (1 + (ilvl - 1) * 0.12) * QUALITY_MUL[quality])
      : Math.round(v * QUALITY_MUL[quality] * (1 + (ilvl - 1) * 0.03) * 10) / 10;
  }
  return out;
}

/** v0.5 C：词条在某装等/品质下的数值范围文字（兑换页自选特殊属性时显示，公式同 applyAffix） */
export function affixRange(a: AffixDef, ilvl: number, quality: Quality, mul = 1): string {
  if (a.kind === 'effect') return a.text;
  const scale = QUALITY_MUL[quality] * (1 + (ilvl - 1) * 0.05) * mul;
  let lo: number, hi: number;
  if (a.kind === 'char' && (a.stat === 'hp' || a.stat === 'armor')) { const f = scale * (1 + (ilvl - 1) * 0.07); lo = Math.round(a.min * f); hi = Math.round(a.max * f); }
  else if (a.kind === 'char') {
    const f = a.stat === 'power' ? scale * (1 + (ilvl - 1) * 0.07) : QUALITY_MUL[quality] * (1 + (ilvl - 1) * 0.04) * mul;
    lo = Math.max(1, Math.round(a.min * f)); hi = Math.max(1, Math.round(a.max * f));
  } else if (a.op === 'mul') { lo = Math.round(Math.abs(a.min * scale) * 100); hi = Math.round(Math.abs(a.max * scale) * 100); }
  else { lo = Math.round(Math.abs(a.min * scale) * 10) / 10; hi = Math.round(Math.abs(a.max * scale) * 10) / 10; }
  if (lo > hi) [lo, hi] = [hi, lo];
  return a.text.replace('{v}', lo === hi ? `${lo}` : `${lo}~${hi}`);
}
/** v0.9.1p：一件装备第 i 条词条在它的装等 / 品质下的区间（淬炼时显示峰值）；特效词条返回 null */
export function affixRollRange(item: ItemInstance, i: number, data: LootData): { lo: string; hi: string; text: string } | null {
  const roll = item.affixLog?.[i]; if (!roll) return null;
  const a = (roll.sp ? data.specialAffixes ?? [] : data.affixes).find(x => x.id === roll.id);
  if (!a || a.kind === 'effect') return null;
  const t = affixRange(a, item.itemLevel, item.quality, roll.sp ? SPECIAL_MUL : 1);
  const m = t.match(/(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?)/) ?? t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { lo: m[1], hi: m[2] ?? m[1], text: m[2] ? `${m[1]}~${m[2]}` : m[1] };
}

