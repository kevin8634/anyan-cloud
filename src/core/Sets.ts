// ========== 套装（引擎无关，v0.5 B） ==========
// 每个职业一套（4~5 件）：2 件 = 角色属性加成（stats，Inventory.stats 计入）；4 件 = 改变一个技能的形态和外观（modifier，纯数据，按 priority 应用）
// 规则：
//   - 只算「生效的装备」：已损坏（耐久 0）的套装件不计件数（Inventory.activeItems 已过滤）
//   - 套装件只在英雄及以上难度的副本 Boss 掉落（core/Scaling.ts rollDungeonLoot），装等跟随等级同步
//   - 保底（SetPity）：记录「见过的部件」和「连续多少次英雄+ Boss 击杀没出新部件」(dry)
//       dry ≥ PITY_BIAS（3）：套装掉落时只从缺的部件里挑
//       dry ≥ PITY_FORCE（6）：这次 Boss 必掉一件缺的部件（不再看掉率）
//       平时：缺的部件权重 ×2、已有的 ×1
//     => 每件新部件最多隔 PITY_FORCE + 1 = 7 次 Boss 击杀；5 件套最坏 35 次英雄+ Boss 击杀集齐（npm run sets 验证）
import { ItemDef, SetBonus } from './Loadout';
import type { CharStats } from './Inventory';
const emptyStats = (): CharStats => ({ hp: 0, armor: 0, power: 0, crit: 0, critDmg: 0, haste: 0, speed: 0 });

export interface SetDef {
  id: string; name: string;
  /** 职业 id；open = false 表示「后续开放」（只有数据占位，不掉落） */
  cls: string; className: string; open: boolean;
  /** 部件定义 id（data/loot.ts fixedItems）；占位套装只有名字 */
  pieces: string[];
  pieceNames: string[];
  bonuses: SetBonus[];
  since?: string;
}

export const PITY_BIAS = 3;
export const PITY_FORCE = 6;
export const MISSING_WEIGHT = 2;

export interface SetPityState { dry: number; seen: string[] }
export const newPity = (): SetPityState => ({ dry: 0, seen: [] });

/** 套装件数（传入的应该是生效的装备） */
export function setCounts(items: ItemDef[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) if (i.setId) m.set(i.setId, (m.get(i.setId) ?? 0) + 1);
  return m;
}
/** 已激活的套装效果 */
export function activeSetBonuses(items: ItemDef[], bonuses: SetBonus[]): SetBonus[] {
  const c = setCounts(items);
  return bonuses.filter(b => (c.get(b.setId) ?? 0) >= b.pieces);
}
/** 已激活套装效果带来的角色属性 */
export function setBonusStats(items: ItemDef[], bonuses: SetBonus[]): CharStats {
  const s = emptyStats();
  for (const b of activeSetBonuses(items, bonuses)) for (const [k, v] of Object.entries(b.stats ?? {})) (s as Record<string, number>)[k] += v ?? 0;
  return s;
}

/**
 * Boss 击杀时的套装部件判定（带保底）。返回掉落的部件 id（或 null），并更新 st。
 * chance：本难度套装掉率（DIFFS[d].setChance）；got：这次击杀里其它来源（掉落表固定件）已经掉出的部件 id
 */
export function rollSetPiece(pieces: string[], chance: number, st: SetPityState, rng: () => number, got: string[] = []): { piece: string | null; forced: boolean } {
  got.forEach(g => { if (!st.seen.includes(g)) { st.seen.push(g); st.dry = -1; } });   // -1：下面统一 +1 归零
  const missing = pieces.filter(p => !st.seen.includes(p));
  let piece: string | null = null, forced = false;
  if (pieces.length) {
    if (missing.length && st.dry >= PITY_FORCE) { piece = missing[Math.floor(rng() * missing.length)]; forced = true; }
    else if (rng() < chance) {
      if (missing.length && st.dry >= PITY_BIAS) piece = missing[Math.floor(rng() * missing.length)];
      else {
        const w = pieces.map(p => (missing.includes(p) ? MISSING_WEIGHT : 1));
        let r = rng() * w.reduce((a, b) => a + b, 0);
        piece = pieces[pieces.length - 1];
        for (let i = 0; i < pieces.length; i++) { r -= w[i]; if (r <= 0) { piece = pieces[i]; break; } }
      }
    }
  }
  if (piece && !st.seen.includes(piece)) { st.seen.push(piece); st.dry = 0; }
  else if (st.dry < 0) st.dry = 0;
  else st.dry = pieces.some(p => !st.seen.includes(p)) ? st.dry + 1 : 0;
  return { piece, forced };
}
