// 铁匠「兑换」页配置（v0.5 C，原创内容）：兑换货币、暗岩锻造系列、套装缺件、每周限购
// 主线 v0.6.6：词条重铸（→ A 的淬炼）、强化保护符（A 的强化不掉级）取消；兑换货币改由长副本 / 史诗+ 普通副本掉落（RAID_CURRENCY）
// 规则在 core/Exchange.ts；命令行模拟 npm run smith / npm run economy 共用
import { EquipSlot } from '../core/Inventory';
import { Quality } from '../core/Loot';

export const CUR_EMBER = 'cur_ember';    // 熔心余烬：熔心王座（阶段六）
export const CUR_FROST = 'cur_frost';    // 永霜碎晶：永霜墓穴（阶段六）
export const CUR_SIGIL = 'cur_sigil';    // 暗岩徽记：两个长副本通用，Boss 掉得多
export const CURRENCIES = [CUR_EMBER, CUR_FROST, CUR_SIGIL];

export interface CurCost { gold: number; cur: { id: string; count: number }[] }
const C = (gold: number, ember = 0, frost = 0, sigil = 0): CurCost =>
  ({ gold, cur: [[CUR_EMBER, ember], [CUR_FROST, frost], [CUR_SIGIL, sigil]].filter(([, n]) => +n > 0).map(([id, n]) => ({ id: id as string, count: n as number })) });

// ---------------------------------------------------------------- 暗岩锻造系列（定向获取）
export const FORGE_SERIES = '暗岩锻造';
/** 品质与装等：史诗，装等 = 玩家等级 + 3（约等于英雄难度副本的掉落） */
export const FORGE_QUALITY: Quality = 'purple';
export const FORGE_ILVL_BONUS = 3;
/** 每个穿戴格可选的底材（按职业，护甲类型跟职业走）；第一个是默认，多个 = 玩家可以挑 */
export const FORGE_BASES: Record<string, Record<EquipSlot, string[]>> = {
  warrior: {
    head: ['b_helm'], neck: ['b_amulet', 'b_necklace'], shoulder: ['b_pauldron'], back: ['b_cloak'], chest: ['b_chest'], wrist: ['b_bracer'],
    hands: ['b_gauntlet'], waist: ['b_girdle'], legs: ['b_legs'], feet: ['b_sabaton'], ring1: ['b_ring', 'b_signet'], ring2: ['b_signet', 'b_ring'],
    trinket1: ['b_idol'], trinket2: ['b_idol'], mainHand: ['b_greataxe', 'b_greatsword', 'b_sword', 'b_axe', 'b_mace'], offHand: ['b_shield'],
  },
  mage: {
    head: ['b_hood'], neck: ['b_necklace', 'b_amulet'], shoulder: ['b_mantle'], back: ['b_cloak'], chest: ['b_robe'], wrist: ['b_wrap'],
    hands: ['b_silk_gloves'], waist: ['b_sash'], legs: ['b_cloth_legs'], feet: ['b_cloth_shoes'], ring1: ['b_signet', 'b_ring'], ring2: ['b_ring', 'b_signet'],
    trinket1: ['b_idol'], trinket2: ['b_idol'], mainHand: ['b_staff', 'b_wand', 'b_dagger'], offHand: ['b_tome', 'b_orb'],
  },
  chrono: {
    head: ['b_lhood'], neck: ['b_necklace', 'b_amulet'], shoulder: ['b_lshoulder'], back: ['b_cloak'], chest: ['b_lvest'], wrist: ['b_lbracer'],
    hands: ['b_lgloves'], waist: ['b_lbelt'], legs: ['b_llegs'], feet: ['b_lboots'], ring1: ['b_signet', 'b_ring'], ring2: ['b_ring', 'b_signet'],
    trinket1: ['b_idol'], trinket2: ['b_idol'], mainHand: ['b_chakram'], offHand: ['b_chakram', 'b_hourglass'],
  },
  alchemy: {
    head: ['b_amask'], neck: ['b_necklace', 'b_amulet'], shoulder: ['b_amantle'], back: ['b_cloak'], chest: ['b_acoat'], wrist: ['b_awrap'],
    hands: ['b_agloves'], waist: ['b_abelt'], legs: ['b_alegs'], feet: ['b_aboots'], ring1: ['b_signet', 'b_ring'], ring2: ['b_ring', 'b_signet'],
    trinket1: ['b_idol'], trinket2: ['b_idol'], mainHand: ['b_flask'], offHand: ['b_reagent'],
  },
};
const ARMORISH: EquipSlot[] = ['head', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];
const JEWELRY: EquipSlot[] = ['neck', 'ring1', 'ring2', 'trinket1', 'trinket2'];
/** 锻造价格：护甲/披风 = 余烬为主；首饰 = 碎晶为主；主手最贵；金币 = 15 × 等级 */
export function forgeCost(slot: EquipSlot, level: number): CurCost {
  const g = 15 * level;
  if (ARMORISH.includes(slot)) return C(g, 6, 0, 3);
  if (JEWELRY.includes(slot)) return C(g, 0, 6, 3);
  if (slot === 'mainHand') return C(Math.round(g * 1.5), 6, 6, 6);
  return C(g, 4, 4, 3);   // 副手
}

// ---------------------------------------------------------------- 套装缺件兑换（比锻造贵，每周 1 件）
export const SET_ILVL_BONUS = 2;   // 装等 = 等级 + 2（= 英雄难度 Boss 掉落）
export const setPieceCost = (level: number): CurCost => C(30 * level, 8, 8, 15);

/** 每周限购（按 ISO 周，每周一 0 点刷新） */
export const WEEKLY_LIMIT = { forge: 3, set: 1 } as const;
export type LimitKind = keyof typeof WEEKLY_LIMIT;
export const LIMIT_NAME: Record<LimitKind, string> = { forge: '暗岩锻造', set: '套装缺件' };

// ---------------------------------------------------------------- 兑换货币来源（主线 v0.6.6：取代 v0.5 C 的临时来源）
type Drop = { id: string; chance: number; min: number; max: number };
/**
 * 长副本首领：熔心王座掉熔心余烬、永霜墓穴掉永霜碎晶，都掉暗岩徽记；最终首领多给；炼狱 ×1.5（向上取整）。
 * 普通副本（dungeonplus 四难度）：史诗 / 噩梦首领掉暗岩徽记 + 少量余烬或碎晶（按副本主题）。普通 / 英雄不掉。
 */
export const RAID_CURRENCY: { raid: Record<string, { boss: Drop[]; final: Drop[] }>; dungeon: Partial<Record<'epic' | 'nightmare', Drop[]>>; dungeonTheme: Record<string, string> } = {
  raid: {
    molten_throne: { boss: [{ id: CUR_EMBER, chance: 1, min: 2, max: 3 }, { id: CUR_SIGIL, chance: 1, min: 1, max: 2 }], final: [{ id: CUR_EMBER, chance: 1, min: 4, max: 5 }, { id: CUR_SIGIL, chance: 1, min: 3, max: 4 }] },
    frost_crypt: { boss: [{ id: CUR_FROST, chance: 1, min: 2, max: 3 }, { id: CUR_SIGIL, chance: 1, min: 1, max: 2 }], final: [{ id: CUR_FROST, chance: 1, min: 4, max: 5 }, { id: CUR_SIGIL, chance: 1, min: 3, max: 4 }] },
  },
  dungeon: {
    epic: [{ id: CUR_SIGIL, chance: 0.6, min: 1, max: 1 }, { id: '@theme', chance: 1, min: 1, max: 2 }],
    nightmare: [{ id: CUR_SIGIL, chance: 1, min: 1, max: 2 }, { id: '@theme', chance: 1, min: 2, max: 3 }],
  },
  /** 普通副本的主题货币：火系副本 → 余烬，冰 / 沼泽 → 碎晶 */
  dungeonTheme: { darkrock_mine: CUR_EMBER, rotting_temple: CUR_FROST, sand_tomb: CUR_EMBER, troll_cave: CUR_FROST, ash_forge: CUR_EMBER },
};
