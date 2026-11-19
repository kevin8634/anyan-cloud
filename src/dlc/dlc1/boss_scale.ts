// ======================================================================
// fix1108 #7（Rhett 11-08 批）DLC 首领伤害按玩家等级 / 装等缩放
// 问题（eval1108 §1.1）：DLC 首领技能都是绝对伤害（90–426），40 级玩家生命 2.5–4.5 万、护甲 7–13k（护甲常数 400 → 物理只吃 3–5%），
//   首领一下打不到 1% 血，首领战没有威胁。
// 做法（只动 DLC，本体文件 0 改动）：在本体伤害结算链 fx.preDeal 外面再串一层（走 window.__game.fx，和评委通道同一个调试入口），
//   只处理「DLC 首领（pboss，即 PackCtx.spawnBoss / 内容包小副本 / 长副本生成的首领）打玩家」这一种伤害：
//   1) 倍率 k = K40 × (√(bandIlvl(等级) × 平均装等) / 75)^1.3，下限 1、上限 K_MAX。
//      40 级 HP 基本只跟装等走（实测 ≈ 33000 × (装等/75)^1.3，等级影响很小），所以 k 取「本等级应有装等」和「身上平均装等」的几何平均：
//      装备跟上本等级 → 重击固定约 8–12% 血；装备比本等级好 → 生命涨的那部分只被追回一半，装备仍然有用。
//   2) 物理伤害另按等级放大护甲常数：本体护甲公式 400/(400+护甲) 换成 K/(K+护甲)，K = 400×(1+0.45×(等级−1))（40 级 7420；护甲 8–12k 时物理承伤约 38–47%，本体常数下只有 3–5%），
//      只对 DLC 首领的物理伤害生效，护甲仍然有用（护甲越高减得越多），但不再把首领物理技能压到 0.04% 血。
//   首领召唤的小怪、野怪、本体首领、按百分比扣血的场地机制（drain）都不受影响；评委角色的承伤 ×0.5 照常叠加。
// ======================================================================
import { bandIlvl } from '../../core/EndgameIlvl';

export const BOSS_SCALE = { K40: 12, K_MAX: 20, REF_IL: 75, EXP: 1.3, ARMOR_BASE: 400, ARMOR_PER_LV: 0.45 } as const;
/** 首领伤害倍率（不含护甲修正）：lv = 玩家等级，il = 身上平均装等 */
export function bossDmgK(lv: number, il: number): number {
  const ref = bandIlvl(Math.max(31, Math.min(40, lv)));
  const eff = Math.sqrt(ref * Math.max(1, il || ref));
  return Math.max(1, Math.min(BOSS_SCALE.K_MAX, BOSS_SCALE.K40 * Math.pow(eff / BOSS_SCALE.REF_IL, BOSS_SCALE.EXP)));
}
/** DLC 首领物理伤害用的护甲常数（本体固定 400） */
export const bossArmorK = (lv: number) => BOSS_SCALE.ARMOR_BASE * (1 + BOSS_SCALE.ARMOR_PER_LV * (Math.max(1, lv) - 1));
/** 物理伤害的护甲修正：结算链后面本体还会乘 400/(400+护甲)，这里预先乘 [K/(K+护甲)] / [400/(400+护甲)] */
export function bossArmorFix(lv: number, armor: number): number {
  if (!(armor > 0)) return 1;
  const K = bossArmorK(lv);
  return (K / (K + armor)) / (BOSS_SCALE.ARMOR_BASE / (BOSS_SCALE.ARMOR_BASE + armor));
}
/** 一次受击的最终伤害（测试 / 报告用；不含评委 ×0.5 与其他承伤倍率） */
export function bossHitAfter(raw: number, el: string, lv: number, il: number, armor: number): number {
  let a = raw * bossDmgK(lv, il);
  if (el === 'physical') a *= bossArmorFix(lv, armor) * (BOSS_SCALE.ARMOR_BASE / (BOSS_SCALE.ARMOR_BASE + Math.max(0, armor)));
  return a;
}

// fix1108c #1（Rhett 11-08 21:37 批）评委血量折扣：评委模式下 DLC 首领等效血量 × JUDGE_HP_K[key]（玩家打该首领的伤害 ÷ 系数，
//   不改血量条 / 难度倍率 / 锁血与门槛的 syncHp 时序；×9 补刀照常）。目标：评委（伤害 ×3，85 装等中位 DPS 3532）约 35 秒（30–40）击杀。
//   系数 = min(1, 35×3 / 普通档中位击杀秒)（fix1_boss_hp.md）；只在评委模式生效，普通玩家不变。
export const JUDGE_HP_TARGET = 35;
const MED_T: Record<string, number> = { wl_b1: 87, wl_b2: 88, wl_b3: 90, wl_b4: 92, wl_b5: 99, fg_b1: 88, fg_b2: 90, fg_b3: 93,
  bt_b1: 86, bt_b2: 87, bt_b3: 88, bt_b4: 90, bt_b5: 93, bt_sleeper_a: 107, bt_sleeper_b: 114, dwb_whale: 90, dwb_knights: 90 };
export const JUDGE_HP_K: Record<string, number> = Object.fromEntries(Object.entries(MED_T).map(([k, t]) => [k, Math.min(1, Math.round(JUDGE_HP_TARGET * 3 / t * 1000) / 1000)]));
type U = { pboss?: string; armor?: number };
type G_ = { fx?: { preDeal?: (t: unknown, amt: number, el: string, src: unknown, crit: boolean, tick: boolean) => number }; player?: unknown;
  progression?: { level: number }; inventory?: { equipped: Record<string, { itemLevel?: number } | undefined> } };
let installed = false, avgIl = 0, avgAt = -1e9;
export const bossScaleState = { on: true, hits: 0, last: null as null | { raw: number; out: number; el: string; k: number; boss: string } };
/** 平均装等：已穿部位的 itemLevel 平均（1 秒缓存） */
function curIlvl(G: G_): number {
  const n = performance.now(); if (n - avgAt < 1000) return avgIl; avgAt = n;
  const its = Object.values(G.inventory?.equipped ?? {}).filter(i => i && typeof i.itemLevel === 'number') as { itemLevel: number }[];
  avgIl = its.length ? its.reduce((s, i) => s + i.itemLevel, 0) / its.length : 0;
  return avgIl;
}
/** 每帧（包 update）调用：__game.fx 就绪后串一次 preDeal（只装一次） */
let judgeOn = false;
export function bossScaleUpdate(judge = false) {
  judgeOn = judge;
  if (installed) return;
  const G = (globalThis as unknown as { __game?: G_ }).__game;
  if (!G?.fx || !G.player || !G.progression) return;
  installed = true;
  const fx = G.fx, prev = fx.preDeal, P = G.player, PR = G.progression;
  fx.preDeal = (t, amt, el, src, crit, tick) => {
    let a = prev ? prev(t, amt, el, src, crit, tick) : amt;
    if (judgeOn && src === P && a > 0) { const jk = JUDGE_HP_K[(t as U)?.pboss ?? '']; if (jk && jk < 1) return a / jk; }   // fix1108c #1
    if (!(a > 0) || !bossScaleState.on || t !== P || !src || !(src as U).pboss) return a;
    const lv = PR.level, k = bossDmgK(lv, curIlvl(G));
    const raw = a;
    a *= k;
    if (el === 'physical') a *= bossArmorFix(lv, (P as U).armor ?? 0);
    bossScaleState.hits++; bossScaleState.last = { raw, out: a, el, k, boss: (src as U).pboss! };
    return a;
  };
}
