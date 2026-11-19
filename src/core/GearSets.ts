// ========== v0.7.9：装备方案（引擎无关） ==========
// 3 套方案，每套记住：装备（物品 id）、天赋页、英灵槽、技能书配置（各槽技能 + 符文）。一键套用只能在战斗外。
import type { EquipSlot } from './Inventory';
import type { SlotId } from './types';

export interface GearSetSave {
  name: string;
  gear: Partial<Record<EquipSlot, string>>;
  talentPage: number;
  spirits: (string | null)[];
  skills: Partial<Record<SlotId, string>>;
  runes: Record<string, string>;
  savedAt: number;
}
export const GEARSET_COUNT = 3;
export const emptySets = (): (GearSetSave | null)[] => Array.from({ length: GEARSET_COUNT }, () => null);

export function loadSets(raw: unknown): (GearSetSave | null)[] {
  const out = emptySets();
  if (!Array.isArray(raw)) return out;
  raw.slice(0, GEARSET_COUNT).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const o = s as Partial<GearSetSave>;
    out[i] = { name: typeof o.name === 'string' ? o.name.slice(0, 12) : `方案 ${i + 1}`, gear: { ...(o.gear ?? {}) }, talentPage: Math.max(0, Math.min(2, Math.floor(o.talentPage ?? 0))),
      spirits: Array.isArray(o.spirits) ? o.spirits.map(x => (typeof x === 'string' ? x : null)) : [], skills: { ...(o.skills ?? {}) }, runes: { ...(o.runes ?? {}) }, savedAt: o.savedAt ?? 0 };
  });
  return out;
}

/** 套用计划：哪些装备要穿（物品在背包里），哪些找不到了 */
export function gearPlan(set: GearSetSave, equipped: Partial<Record<EquipSlot, { id: string }>>, bagIds: Set<string>) {
  const wear: [EquipSlot, string][] = [], missing: EquipSlot[] = [];
  for (const [slot, id] of Object.entries(set.gear) as [EquipSlot, string][]) {
    if (equipped[slot]?.id === id) continue;
    if (bagIds.has(id) || Object.values(equipped).some(x => x?.id === id)) wear.push([slot, id]); else missing.push(slot);
  }
  return { wear, missing };
}
