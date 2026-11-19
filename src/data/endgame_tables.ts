// v0.9.6a 长副本 / 深渊的「说明书展示表」：只给掉落说明书和副本地图掉落列表读（真正的掉落在 web/raid.ts 里按这些池子发，带保底）
import type { LootTable, LootEntry } from '../core/Loot';
import { RAID_LG, ABY_LG, ABY_TOP, RAID_LG_CHANCE, ABY_BOSS_LG } from './endgame_pools';
export const ENDGAME_GUIDE_TABLES: Record<string, LootTable> = {};
for (const [raid, P] of Object.entries(RAID_LG)) P.bosses.forEach((b, i) => {
  const entries: LootEntry[] = [
    ...Object.values(b).map(lgId => ({ kind: 'lg', chance: RAID_LG_CHANCE.unique[0], lgId }) as LootEntry),
    ...Object.values(P.shared).flat().map(lgId => ({ kind: 'lg', chance: RAID_LG_CHANCE.shared[0] / 2, lgId }) as LootEntry),
  ];
  ENDGAME_GUIDE_TABLES[`dlg_${raid}_${i}`] = { id: `dlg_${raid}_${i}`, gold: [0, 0], entries };
});
ENDGAME_GUIDE_TABLES.aby_boss_g = { id: 'aby_boss_g', gold: [0, 0], entries: Object.values(ABY_LG).flat().map(lgId => ({ kind: 'lg', chance: ABY_BOSS_LG / 6, lgId }) as LootEntry) };
ENDGAME_GUIDE_TABLES.aby_top_g = { id: 'aby_top_g', gold: [0, 0], entries: Object.values(ABY_TOP).flat().map(lgId => ({ kind: 'lg', chance: 3 / 4, lgId }) as LootEntry) };
/** 某个长副本首领对某职业：独特 1 件 + 共享 2 件 */
export function raidBossPool(raid: string, boss: number, cls: string): { unique: string | null; shared: string[] } {
  const P = RAID_LG[raid as keyof typeof RAID_LG]; if (!P) return { unique: null, shared: [] };
  return { unique: P.bosses[boss]?.[cls as 'warrior'] ?? null, shared: P.shared[cls as 'warrior'] ?? [] };
}
