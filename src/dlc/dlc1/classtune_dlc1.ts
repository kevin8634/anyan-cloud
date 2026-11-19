// v1.2.77 天赋方案 B · 资料片两职业平衡系数（§7.6）：按主天赋系给全技能一个独立乘区，接到本体 CLASS_TUNE（不改 src/core）
// 依据：PLAYTEST_DLC=dlc1 ROT_ELITE=1 ROT_MAXHP=60000 node test/playtest.mjs rot（30 级、30 点 311、首领木桩 60 秒）
//   本体输出系同条件均值 ≈ 400；目标：输出系 ≈ 400、范围系单体低约 10%、饮血者（生存系）≈ 85%
//   机制伤害（雷暴、侵蚀、冥河凋零、魂爆等直接走 ClassExt.damage）不吃这个系数，系数只按直接技能部分折算
import { CLASS_TUNE } from '../../data/classtune_v0714';

/** 调整前实测（系数 1，首领上限仍为 60 + 12 × 等级）：DPS / 其中机制伤害；之后雷暴、冥河凋零上限改为 20 + 3 × 等级 */
export const DLC1_ROT_BASE: Record<string, [number, number]> = {
  h_wolf: [750, 357], h_bear: [333, 0], h_eagle: [283, 0],
  c_und: [395, 78], c_war: [289, 65], c_fer: [667, 316],
};
export const DLC1_TUNE: Record<string, number> = {
  h_wolf: 0.9, h_bear: 1.05, h_eagle: 1.42,
  c_und: 0.95, c_war: 1.29, c_fer: 0.8,   // 11-04 立棺墓碑 凋魂者主循环改为立棺墓碑（回响 60%）：按立棺实测下调 0.92 → 0.8（见文件尾）
};
Object.assign(CLASS_TUNE, DLC1_TUNE);
/** 第 3 轮实测（h_eagle 1.51、c_fer 1.04 时）：雷狼 417 · 巨熊 349 · 苍鹰 435 · 送葬者 381 · 饮血者 349 · 凋魂者 469 → 苍鹰 / 凋魂者再按比例下调 */
/** 11-04 立棺墓碑 凋魂者「立棺墓碑」主循环（ROT_PLANT=1 开场立棺，整段在墓碑旁打）：系数 0.92 时 背棺 394 / 立棺 480（回响 46 次，+22%）
 *  → 以立棺为主循环下调到 0.8（侵蚀跳伤按命中伤害折算，也跟着降；冥河凋零吃首领上限，不降）；背棺打法相应约 -12%（离开墓碑 = 放弃回响） */
