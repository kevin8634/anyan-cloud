// v0.7.14 职业循环第一轮平衡：按“主天赋系”（点数最多的一系）给全技能一个独立乘区（op 'more'）。
// 依据：playtest rot（30 级、无装备、21 天赋点灌满一系、木桩 30 秒、固定优先级循环）。
// 目标：输出系 DPS ≈ 380（彼此差 ≤ 10%），生存系（防护 / 回溯）≈ 输出系的 85%。
// 没点天赋（< 10 级）时用本职业三系的平均值。
import type { ModifierDef } from '../core/types';

export const ROT_TARGET = { dps: 380, survival: 325 };

/** 调整前基线 DPS（v0.7.13，同条件）——留档，便于下一轮对比 */
export const ROT_BASELINE: Record<string, number> = {
  w_arms: 272, w_fury: 282, w_prot: 218,
  m_fire: 347, m_frost: 303, m_arcane: 514,
  c_mark: 632, c_echo: 759, c_rewind: 466,
  a_blast: 471, a_ground: 458, a_turret: 521,
};

export const SURVIVAL_SPECS = new Set(['w_prot', 'c_rewind']);

/** 实测样本：[系数, DPS]（playtest rot，30 秒木桩）。系数 = 目标 ÷ 平均“每单位系数 DPS”，样本越多越准 */
export const ROT_SAMPLES: Record<string, [number, number][]> = {
  w_arms: [[1, 272], [1.4, 297], [1.79, 389]], w_fury: [[1, 282], [1.35, 363], [1.41, 376]], w_prot: [[1, 218], [1.49, 292], [1.66, 305]],
  m_fire: [[1, 347], [1.1, 403], [1.04, 342]], m_frost: [[1, 303], [1.25, 354], [1.34, 403]], m_arcane: [[1, 514], [0.74, 359], [0.78, 425]],
  c_mark: [[1, 632], [0.6, 389]], c_echo: [[1, 759], [0.5, 370]], c_rewind: [[1, 466], [0.7, 345]],
  a_blast: [[1, 471], [0.81, 395]], a_ground: [[1, 458], [0.83, 373]], a_turret: [[1, 521], [0.73, 455]],
};
/** 每单位系数的平均 DPS */
export const perUnit = (spec: string) => { const l = ROT_SAMPLES[spec]; return l.reduce((a, [m, d]) => a + d / m, 0) / l.length; };
/** v1.2.58 天赋 3.0 实测（v1.2.64 再追加一轮、每系只留最近 6 个样本；v1.2.61 追加一轮：定稿区域一关键之后，撕裂满层放大修正后）（playtest rot，30 级、30 点，主 3 + 副 1 + 副 1 与 主 3 + 副 2 各一次，30 秒木桩）：[当时系数, DPS] */
export const ROT_SAMPLES_V3: Record<string, [number, number][]> = {"w_arms": [[1.63, 437], [1.63, 480], [1.42, 466], [1.42, 402], [1.36, 407], [1.36, 471]], "w_fury": [[1.39, 357], [1.39, 369], [1.53, 417], [1.53, 417], [1.5, 436], [1.5, 434]], "w_prot": [[1.63, 358], [1.63, 395], [1.48, 374], [1.48, 438], [1.35, 427], [1.35, 328]], "m_fire": [[1.09, 507], [1.09, 371], [0.99, 413], [0.99, 408], [0.98, 482], [0.98, 413]], "m_frost": [[1.29, 559], [1.29, 594], [0.9, 365], [0.9, 363], [0.94, 351], [0.94, 407]], "m_arcane": [[0.74, 417], [0.74, 432], [0.7, 348], [0.7, 385], [0.73, 330], [0.73, 424]], "c_mark": [[0.59, 573], [0.59, 603], [0.4, 335], [0.4, 417], [0.41, 459], [0.41, 508]], "c_echo": [[0.51, 366], [0.51, 361], [0.56, 421], [0.56, 392], [0.56, 559], [0.56, 486]], "c_rewind": [[0.68, 416], [0.68, 444], [0.54, 322], [0.54, 355], [0.54, 405], [0.54, 370]], "a_blast": [[0.79, 775], [0.79, 555], [0.48, 359], [0.48, 333], [0.51, 426], [0.51, 360]], "a_ground": [[0.84, 564], [0.84, 523], [0.62, 348], [0.62, 323], [0.67, 353], [0.67, 323]], "a_turret": [[0.66, 510], [0.66, 551], [0.5, 346], [0.5, 413], [0.51, 334], [0.51, 424]]};
/** 天赋 3.0 目标：30 点比旧 21 点略强（输出 400，生存系 85%） */
export const ROT_TARGET_V3 = { dps: 400, survival: 342 };
export const perUnitV3 = (spec: string) => { const l = ROT_SAMPLES_V3[spec]; return l.reduce((a, [m, d]) => a + d / m, 0) / l.length; };
/** 主天赋系 → 伤害乘数（v1.2.58 起按天赋 3.0 样本） */
export const CLASS_TUNE: Record<string, number> = Object.fromEntries(Object.keys(ROT_SAMPLES_V3).map(k =>
  [k, Math.round((SURVIVAL_SPECS.has(k) ? ROT_TARGET_V3.survival : ROT_TARGET_V3.dps) / perUnitV3(k) * 100) / 100]));

const CLASS_SPECS: Record<string, string[]> = {
  warrior: ['w_arms', 'w_fury', 'w_prot'], mage: ['m_fire', 'm_frost', 'm_arcane'],
  chrono: ['c_mark', 'c_echo', 'c_rewind'], alchemy: ['a_blast', 'a_ground', 'a_turret'],
};

export function tuneFor(clsId: string, mainSpec: string | null): number {
  if (mainSpec && CLASS_TUNE[mainSpec] != null) return CLASS_TUNE[mainSpec];
  const l = CLASS_SPECS[clsId]; if (!l) return 1;
  return Math.round(l.reduce((a, s) => a + CLASS_TUNE[s], 0) / l.length * 100) / 100;
}

export function classTuneMod(clsId: string, mainSpec: string | null): ModifierDef | null {
  const m = tuneFor(clsId, mainSpec);
  if (Math.abs(m - 1) < 1e-6) return null;
  return { id: 'class_tune', name: '职业平衡', source: 'buff', desc: '', match: {}, ops: [{ op: 'more', stat: 'damage', value: m - 1 }] };
}
