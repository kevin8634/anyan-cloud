// ========== 耐久度与修理（引擎无关，v0.5 A） ==========
// 规则（已定稿）：
//   - 每件装备耐久 100；只有阵亡时扣：身上所有装备各掉 10 点（10% 最大耐久）
//   - 耐久 0 = 「已损坏」：装备不会消失，但它的属性、词条、套装、传说特效全部失效，直到修理
//   - 任何铁匠（以及补给商人）都能修理：单件修理或「全部修理」
//   - 修理费 = 缺失耐久点数 × 装等系数 × 品质倍率，向上取整（每件至少 1 金）
//       装等系数 = 0.04 + 0.005 × 装等      品质倍率：白 0.6 / 绿 0.8 / 蓝 1 / 紫 1.25 / 橙 1.6
//     例：30 级一身紫装（装等 32，16 件）从 0 修满 ≈ 16 × ceil(100 × 0.2 × 1.25) = 400 金（约 27 瓶治疗药水）；
//         阵亡一次（每件 -10）修理约 40 金；10 级一身蓝装（装等 12）阵亡一次约 16 金
// 老存档的装备没有 durability 字段：读档迁移成 100；运行时没有字段也按 100 处理
import { ItemInstance, Quality } from './Loot';

export const DUR_MAX = 100;
/** 阵亡一次每件装备损失的耐久 */
export const DUR_DEATH_LOSS = 10;
/** 低于等于这个值 HUD 显示警告 */
export const DUR_WARN = 25;
export const REPAIR_QUALITY_MUL: Record<Quality, number> = { white: 0.6, green: 0.8, blue: 1, purple: 1.25, orange: 1.6, dark: 2 };
export const repairCoef = (itemLevel: number) => 0.04 + 0.005 * Math.max(1, itemLevel);

export const durOf = (it: ItemInstance) => Math.max(0, Math.min(DUR_MAX, it.durability ?? DUR_MAX));
export const isBroken = (it: ItemInstance) => durOf(it) <= 0;
export const isWorn = (it: ItemInstance) => durOf(it) <= DUR_WARN;

/** 修好这件装备要多少金币（满耐久 = 0） */
export function repairCost(it: ItemInstance): number {
  const missing = DUR_MAX - durOf(it);
  if (missing <= 0) return 0;
  return Math.max(1, Math.ceil(missing * repairCoef(it.itemLevel) * REPAIR_QUALITY_MUL[it.quality]));
}
export const repairAllCost = (items: ItemInstance[]) => items.reduce((s, it) => s + repairCost(it), 0);

/** 阵亡：所有给出的（身上的）装备各掉 DUR_DEATH_LOSS，返回这次刚损坏的装备 */
export function applyDeathLoss(items: ItemInstance[], loss = DUR_DEATH_LOSS): ItemInstance[] {
  const broke: ItemInstance[] = [];
  for (const it of items) {
    const before = durOf(it);
    it.durability = Math.max(0, before - loss);
    if (before > 0 && it.durability === 0) broke.push(it);
  }
  return broke;
}

/** 身上耐久状态：worst = 最低耐久；broken / worn = 件数 */
export function durSummary(items: ItemInstance[]) {
  let worst = DUR_MAX, broken = 0, worn = 0;
  for (const it of items) { const d = durOf(it); worst = Math.min(worst, d); if (d <= 0) broken++; else if (d <= DUR_WARN) worn++; }
  return { worst, broken, worn };
}

/** 存档迁移：没有耐久字段的装备补成 100 */
export function migrateDurability(items: (ItemInstance | undefined | null)[]) {
  for (const it of items) if (it && typeof it.durability !== 'number') it.durability = DUR_MAX;
}
