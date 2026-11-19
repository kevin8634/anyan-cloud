// v0.7.4：觉醒（隐藏词条 + 历练）与岩纹镌刻（纹语）的数据。规则见 docs/归档/旧计划/开发计划_v0.7.5起.md / core/Awaken.ts
// 所有效果只用槽位 / 通用匹配（不点名技能），4 个职业、任意技能书搭配都能生效
import { ModifierDef, SlotId } from '../core/types';
import { ItemSlot } from '../core/Loadout';

export type AwkGroup = 'weapon' | 'armor' | 'jewel';
export const AWK_GROUP: Record<ItemSlot, AwkGroup> = {
  oneHand: 'weapon', twoHand: 'weapon', offHand: 'weapon',
  head: 'armor', shoulder: 'armor', back: 'armor', chest: 'armor', wrist: 'armor', hands: 'armor', waist: 'armor', legs: 'armor', feet: 'armor',
  neck: 'jewel', ring: 'jewel', trinket: 'jewel',
};
/** 历练：击败首领累积；长副本首领算 2 点 */
export const AWK_NEED = 5;
export const AWK_XP: Record<'dungeon' | 'elite' | 'raid', number> = { dungeon: 1, elite: 1, raid: 2 };

const SK: SlotId[] = ['skill1', 'skill2', 'skill3'];
type M = Omit<ModifierDef, 'id' | 'source' | 'desc' | 'name'>;
export interface AwkAffix { id: string; name: string; desc: string; groups: AwkGroup[]; mod: M }
const mul = (stat: 'damage' | 'cooldown' | 'radius' | 'range', value: number, slots?: SlotId[]): M => ({ match: slots ? { slots } : {}, ops: [{ op: 'mul', stat, value }] });

/** 隐藏词条池：觉醒时按部位从这里抽 3 个给玩家选。v1.2.37 重做：删 凝滞 / 迅捷 / 疾行 / 专注 / 远望 / 回刃，强化 / 改 / 新增，见 docs/开发记录.md */
export const AWK_AFFIXES: AwkAffix[] = [
  // 武器
  { id: 'aw_edge', name: '锋芒觉醒', desc: '普通攻击伤害 +15%', groups: ['weapon'], mod: mul('damage', 0.15, ['basic']) },
  { id: 'aw_fury', name: '战意觉醒', desc: '技能 1~3 伤害 +10%', groups: ['weapon'], mod: mul('damage', 0.10, SK) },
  { id: 'aw_doom', name: '终焉觉醒', desc: '大招伤害 +20%', groups: ['weapon', 'jewel'], mod: mul('damage', 0.20, ['ultimate']) },
  { id: 'aw_bleed', name: '裂创觉醒', desc: '技能 1~3 命中附加流血：物理 14/秒，持续 4 秒（吃强度 / 急速 / 暴击）', groups: ['weapon'],
    mod: { match: { slots: SK }, priority: 45, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 14, duration: 4 } }] } },
  { id: 'aw_burst', name: '迸裂觉醒', desc: '技能 1 命中后小范围爆炸（半径 3 米，40% 伤害）', groups: ['weapon'],
    mod: { match: { slots: ['skill1'] }, priority: 50, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.4 } }] } },
  { id: 'aw_link', name: '连携觉醒', desc: '技能 1 施放后 4 秒内，下一个技能 2 伤害 +30%', groups: ['weapon'],
    mod: { match: { slots: ['skill2'] }, conditions: [{ type: 'recentCast', tag: 'slot:skill1', within: 4 }], ops: [{ op: 'mul', stat: 'damage', value: 0.30 }] } },
  { id: 'aw_scorch', name: '灼痕觉醒', desc: '你的持续伤害暴击时，额外结算一跳', groups: ['weapon', 'jewel'], mod: { match: { slots: [] }, ops: [] } },
  // 护甲
  { id: 'aw_ward', name: '守护觉醒', desc: '大招施放时获得 15% 最大生命的护盾（5 秒）', groups: ['armor'],
    mod: { match: { slots: ['ultimate'] }, priority: 60, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 5 } }] } },
  { id: 'aw_leech', name: '汲血觉醒', desc: '技能击杀敌人时，每个回复 3% 最大生命', groups: ['armor', 'jewel'],
    mod: { match: {}, priority: 60, ops: [{ op: 'addEffect', effect: { type: 'killHeal', percentMaxHp: 0.03 } }] } },
  { id: 'aw_wide', name: '广域觉醒', desc: '技能 2 范围 +20%，伤害 +8%', groups: ['armor', 'weapon'],
    mod: { match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.20 }, { op: 'mul', stat: 'damage', value: 0.08 }] } },
  { id: 'aw_quake', name: '余震觉醒', desc: '技能 3 命中 1 秒后在命中处再震一次（半径 3 米，50% 伤害，每次施放一次）', groups: ['armor'],
    mod: { match: { slots: ['skill3'] }, priority: 55, ops: [{ op: 'addEffect', effect: { type: 'aftershock', delay: 1, radius: 3, damagePercent: 0.5 } }] } },
  // 首饰
  { id: 'aw_soul', name: '魂火觉醒', desc: '所有技能伤害 +6%', groups: ['jewel', 'weapon'], mod: mul('damage', 0.06) },
  { id: 'aw_dusk', name: '暮时·终局', desc: '大招冷却 -10%，大招冷却缩减上限 +10%（最多 4 件 → 80%）', groups: ['jewel', 'armor'], mod: mul('cooldown', -0.10, ['ultimate']) },
  { id: 'aw_first', name: '先手觉醒', desc: '对生命高于 80% 的敌人技能伤害 +15%', groups: ['jewel'],
    mod: { match: {}, conditions: [{ type: 'targetHpAbove', percent: 0.8 }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
  { id: 'aw_surge', name: '余烬回涌', desc: '大招每命中 1 个敌人，技能 1~3 冷却 -0.5 秒（每次最多 -3 秒）', groups: ['jewel'],
    mod: { match: { slots: ['ultimate'] }, priority: 60, ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 3, slots: SK } }] } },
];
/** 暮时·终局：每件把大招冷却缩减上限 +10%，最多算 4 件 */
export const AWK_ULT_CAP_ID = 'aw_dusk', AWK_ULT_CAP_PER = 0.10, AWK_ULT_CAP_PIECES = 4;
/** v1.2.37 旧存档迁移：被删词条 → 新池同部位等价词条（回刃按部位：武器 → 连携，首饰 → 余烬回涌） */
export const AWK_LEGACY: Record<string, Partial<Record<AwkGroup, string>> & { any: string }> = {
  aw_hold: { any: 'aw_quake' },     // 凝滞（技能 3 减速）→ 余震（技能 3）
  aw_swift: { any: 'aw_quake' },    // 迅捷（技能 3 冷却）→ 余震（技能 3）
  aw_dash: { any: 'aw_dusk' },      // 疾行（技能 1 冷却）→ 暮时·终局（冷却类）
  aw_focus: { any: 'aw_surge' },    // 专注（技能 1~3 冷却）→ 余烬回涌（技能冷却返还）
  aw_reach: { any: 'aw_first' },    // 远望（距离）→ 先手
  aw_echo: { weapon: 'aw_link', jewel: 'aw_surge', any: 'aw_link' },   // 回刃（重置技能）
};

// ============ 岩纹镌刻 ============
/** 可开孔部位：武器（单手 / 双手）、胸甲 */
export const SOCKET_SLOTS: ItemSlot[] = ['oneHand', 'twoHand', 'chest'];
/** 自带孔数（按品质）；铁匠可以再开孔，最多 3 个 */
export const BASE_SOCKETS: Record<string, number> = { white: 0, green: 0, blue: 0, purple: 1, orange: 2, dark: 3 };
export const MAX_SOCKETS = 3;
/** 开第 n 个孔（下标 = 当前孔数）的花费 */
export const OPEN_COST = [{ gold: 150, sigil: 0 }, { gold: 400, sigil: 1 }, { gold: 900, sigil: 3 }];
/** 取下岩纹（岩纹退回背包）的金币 */
export const UNSOCKET_GOLD = 60;

export interface RuneStone { id: string; name: string; glyph: string; color: string; desc: string; mod: M }
export const RUNE_STONES: RuneStone[] = [
  { id: 'rs_blaze', name: '炎纹', glyph: '炎', color: '#ff7040', desc: '所有技能伤害 +3%', mod: mul('damage', 0.03) },
  { id: 'rs_gale', name: '风纹', glyph: '风', color: '#70e0c0', desc: '技能 1~3 冷却 -3%', mod: mul('cooldown', -0.03, SK) },
  { id: 'rs_vast', name: '广纹', glyph: '广', color: '#e0c060', desc: '技能范围 +5%', mod: mul('radius', 0.05) },
  { id: 'rs_star', name: '星纹', glyph: '星', color: '#a0a0ff', desc: '大招伤害 +6%', mod: mul('damage', 0.06, ['ultimate']) },
  { id: 'rs_edge', name: '锋纹', glyph: '锋', color: '#e0e0e0', desc: '普通攻击伤害 +6%', mod: mul('damage', 0.06, ['basic']) },
  { id: 'rs_root', name: '根纹', glyph: '根', color: '#80c060', desc: '大招冷却 -4%', mod: mul('cooldown', -0.04, ['ultimate']) },
];
/** 岩纹掉落：首领几率 / 数量 */
export const RUNE_DROP: Record<'dungeon' | 'elite' | 'raid', { chance: number; count: [number, number] }> = {
  dungeon: { chance: 0.35, count: [1, 1] }, elite: { chance: 0.15, count: [1, 1] }, raid: { chance: 1, count: [1, 2] },
};

/** 纹语：一件装备上 3 个孔按顺序镶嵌，额外触发；配方不告诉玩家，镶对了才记入图鉴 */
export interface RuneWord { id: string; name: string; seq: [string, string, string]; desc: string; hint: string; mod: M }
export const RUNE_WORDS: RuneWord[] = [
  { id: 'rw_wildfire', name: '燎原', seq: ['rs_blaze', 'rs_gale', 'rs_vast'], desc: '技能 1~3 命中处留下燃烧地面（火焰 10/秒，半径 2 米，3 秒）', hint: '火借风势，越烧越广',
    mod: { match: { slots: SK }, priority: 55, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 10, radius: 2, duration: 3 } }] } },
  { id: 'rw_finale', name: '终幕', seq: ['rs_star', 'rs_root', 'rs_blaze'], desc: '大招伤害 +20%，冷却 -10%', hint: '星辰落下，扎根，燃尽',
    mod: { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'mul', stat: 'cooldown', value: -0.1 }] } },
  { id: 'rw_relay', name: '连刃', seq: ['rs_edge', 'rs_edge', 'rs_gale'], desc: '普通攻击 20% 几率重置技能 1 冷却（内置冷却 3 秒）', hint: '两道锋，一阵风',
    mod: { match: { slots: ['basic'] }, priority: 60, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.2, icd: 3 } }] } },
  { id: 'rw_resound', name: '回响', seq: ['rs_gale', 'rs_star', 'rs_vast'], desc: '技能 2 命中后弹射 2 次（每跳 40% 伤害）', hint: '风把星光传得很远',
    mod: { match: { slots: ['skill2'] }, priority: 55, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.4 } }] } },
  { id: 'rw_nova', name: '新星', seq: ['rs_vast', 'rs_blaze', 'rs_star'], desc: '大招命中后爆炸（半径 4 米，50% 伤害）', hint: '广阔的火，最后化成一颗星',
    mod: { match: { slots: ['ultimate'] }, priority: 55, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.5 } }] } },
  { id: 'rw_thirst', name: '渴血', seq: ['rs_root', 'rs_edge', 'rs_blaze'], desc: '普通攻击伤害的 6% 转为治疗', hint: '根须饮下刃上的热',
    mod: { match: { slots: ['basic'] }, priority: 60, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.06 } }] } },
  { id: 'rw_haste', name: '迅时', seq: ['rs_gale', 'rs_root', 'rs_gale'], desc: '所有技能冷却 -8%', hint: '风绕着根转了一圈',
    mod: { match: {}, ops: [{ op: 'mul', stat: 'cooldown', value: -0.08 }] } },
  { id: 'rw_shatter', name: '裂解', seq: ['rs_edge', 'rs_vast', 'rs_edge'], desc: '普通攻击命中后爆炸（半径 2 米，30% 伤害）', hint: '锋刃之间夹着空旷',
    mod: { match: { slots: ['basic'] }, priority: 55, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2, damagePercent: 0.3 } }] } },
];
