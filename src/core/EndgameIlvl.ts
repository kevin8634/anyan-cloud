// v0.9.1q 满级固定装等（用户 2026-10-21 定）
// - 30 级以前：装等跟怪物等级走（原样）
// - 30 级起：野外 / 锻造 / 兑换 40；小副本 普通 40、英雄 42、史诗 44、噩梦 46（每档 +2）；长副本 普通 50、炼狱 60
//   深渊 1-5 层 40、6-10 层 45、11-15 层 50、16-20 层 55；暗金一律 70
// - 老存档：30 以上的装备改成 40（暗金 70），按原词条比例重算，不重新随机
import type { Quality } from './Loot';

export const ENDGAME = { level: 30, base: 40, dungeonStep: 2, raid: 50, hell: 60, dark: 70, abyssBands: [40, 45, 50, 55], abyssBandSize: 5, oldCap: 30 } as const;

/** 深渊第 f 层的掉落装等（小怪 / 首领同装等） */
export const abyssIlvl = (f: number) => ENDGAME.abyssBands[Math.min(ENDGAME.abyssBands.length - 1, Math.max(0, Math.floor((f - 1) / ENDGAME.abyssBandSize)))];
/** 小副本难度档（0 普通、1 英雄、2 史诗、3 噩梦）的掉落装等 */
export const dungeonIlvl = (tier: number) => ENDGAME.base + ENDGAME.dungeonStep * Math.max(0, tier);
/** 掉落 / 锻造 / 兑换的最终装等：30 级以前 = 原装等；30 级起 = 当前内容的固定装等（暗金 70） */
export function endgameIlvl(raw: number, quality: Quality, level: number, ctx: number): number {
  if (level < ENDGAME.level) return raw;
  return quality === 'dark' ? ENDGAME.dark : ctx;
}
/** 老存档迁移的目标装等；不用迁移返回 null（已迁移过、30 及以下） */
export function migrateTarget(it: { itemLevel: number; quality: Quality; ilv2?: number }): number | null {
  if (it.ilv2) return null;
  if (it.itemLevel <= ENDGAME.oldCap) return null;
  const to = it.quality === 'dark' ? ENDGAME.dark : ENDGAME.base;
  return to === it.itemLevel ? null : to;
}
/** 底材数值随装等的系数（同 Loot.makeShell） */
export const shellScale = (ilvl: number) => 1 + (ilvl - 1) * 0.12;
/** 旧版深渊默认玩家装等（34 + 层数，封顶 48）→ 新装等档的强度比：深渊怪物生命 / 伤害乘这个 */
export const abyssGearRatio = (f: number) => +(shellScale(abyssIlvl(f)) / shellScale(Math.min(48, 34 + f))).toFixed(3);

// ---------------------------------------------------------------------- v0.9.9 扩展等级段（31–40，只有内容包抬高上限时才用）
// - 本体内容（野外 / 副本 / 长副本 / 深渊 / 暗金）的装等不变：30 级以上玩家回本体刷，掉的还是上面的固定装等
// - 扩展内容自己的区域用 bandIlvl / packIlvl：31–39 级升级期野外 = 50 + 3.5 × (等级 − 30)，封顶 75（54 → 75；fix1108 #8 Rhett 11-08 批，原 40 + 3.5×：44 → 72。31–35 级 54–68，不低于本体长副本 50 / 炼狱 60）；
//   40 级起固定：野外 / 锻造 75，小副本 75 / 77 / 79 / 81，长副本 85，炼狱 90，暗金 95
// - 扩展区域怪物等级 = 玩家等级夹在区域等级段里（bandMonsterLevel）
export const BAND = { from: 30, to: 40, levelingBase: 50, levelingPer: 3.5, field: 75, dungeonStep: 2, raid: 85, hell: 90, dark: 95 } as const;
export type BandKind = 'field' | 'dungeon' | 'raid' | 'hell';
/** 扩展区域野外掉落装等（31–39 升级期逐级上涨 54→75，40 起 75） */
export const bandIlvl = (level: number): number => level >= BAND.to ? BAND.field : Math.min(BAND.field, Math.round(BAND.levelingBase + BAND.levelingPer * Math.max(1, level - BAND.from)));   // fix1108 #8 封顶 75：38/39 级不超过 40 级野外档
/** 扩展内容掉落装等：40 级以前一律按 bandIlvl；40 级起按内容类型；暗金固定 95 */
export function packIlvl(kind: BandKind, level: number, quality: Quality, tier = 0): number {
  if (quality === 'dark') return BAND.dark;
  if (level < BAND.to) return bandIlvl(level);
  return kind === 'dungeon' ? BAND.field + BAND.dungeonStep * Math.max(0, tier) : kind === 'raid' ? BAND.raid : kind === 'hell' ? BAND.hell : BAND.field;
}
/** 扩展区域怪物等级：玩家等级夹在区域等级段 [lo, hi] 里 */
export const bandMonsterLevel = (playerLevel: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, playerLevel));

/** v1.2.12 扩展区域（内容包野外）实际掉落装等：30 级以前原样；30 级起 = max(packIlvl 野外档, 怪物自带装等)，封顶炼狱 90，暗金 95。
 *  怪物自带装等（世界首领 72 / 80、区域首领 84 / 88）高于档位时保留，低于档位时抬到档位。 */
export function packZoneIlvl(raw: number, quality: Quality, level: number): number {
  if (level < ENDGAME.level) return raw;
  if (quality === 'dark') return BAND.dark;
  return Math.max(packIlvl('field', level, quality), Math.min(raw, BAND.hell));
}
