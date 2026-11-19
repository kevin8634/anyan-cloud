// ========== v0.7.9：装备方案 UI（角色面板 C 顶部 3 个按钮） ==========
// 保存：记下当前装备 + 天赋页 + 英灵槽 + 技能书配置；套用：一键全部换上（战斗外）。
import { GearSetSave, loadSets, emptySets, gearPlan, GEARSET_COUNT } from '../core/GearSets';
import type { Inventory, EquipSlot } from '../core/Inventory';
import type { SkillBook } from '../core/SkillBook';
import { SLOT_IDS } from '../core/types';
import { spirits } from './spirit_ui';

export interface GearSetDeps {
  inventory: () => Inventory; skillBook: () => SkillBook;
  talentPage: () => number; switchTalentPage: (i: number) => boolean;
  inCombat: () => boolean; equipFromBook: () => void; sync: () => void; save: () => void;
  toast: (t: string, c?: string) => void; error: () => void; click: () => void; now: () => number;
}
let D!: GearSetDeps;
let sets: (GearSetSave | null)[] = emptySets();

export function gearSetsSave() { return { gearSets: sets.map(s => (s ? JSON.parse(JSON.stringify(s)) : null)) }; }
export function gearSetsLoad(raw: unknown) { sets = loadSets(raw); renderGearSets(); }
export const gearSetsDebug = () => sets;

export function saveGearSet(i: number): boolean {
  if (i < 0 || i >= GEARSET_COUNT) return false;
  const inv = D.inventory(), sb = D.skillBook();
  const gear: Partial<Record<EquipSlot, string>> = {};
  for (const [slot, it] of Object.entries(inv.equipped) as [EquipSlot, { id: string } | undefined][]) if (it) gear[slot] = it.id;
  const skills: GearSetSave['skills'] = {};
  for (const sl of SLOT_IDS) if (sl !== 'basic') skills[sl] = sb.skillAt(sl).id;
  sets[i] = { name: sets[i]?.name ?? `方案 ${i + 1}`, gear, talentPage: D.talentPage(), spirits: [...spirits.slots], skills, runes: { ...sb.rune }, savedAt: D.now() };
  D.toast(`已保存${sets[i]!.name}：装备 ${Object.keys(gear).length} 件 · 天赋页 ${D.talentPage() + 1}`, '#ffd100'); D.click(); D.save(); renderGearSets();
  return true;
}

export function applyGearSet(i: number): { ok: boolean; missing: number } {
  const s = sets[i];
  if (!s) { D.toast('这个方案还没保存'); D.error(); return { ok: false, missing: 0 }; }
  if (D.inCombat()) { D.toast('战斗中不能切换装备方案'); D.error(); return { ok: false, missing: 0 }; }
  const inv = D.inventory(), sb = D.skillBook();
  const { wear, missing } = gearPlan(s, inv.equipped, new Set(inv.bag.map(x => x.id)));
  let fail = 0;
  for (const [slot, id] of wear) if (!inv.tryEquip(id, slot).ok) fail++;
  if (s.talentPage !== D.talentPage()) D.switchTalentPage(s.talentPage);
  s.spirits.forEach((id, k) => { if (k < spirits.slotCount() && spirits.slots[k] !== id) spirits.equip(k, id); });
  for (const [sl, id] of Object.entries(s.skills)) if (id && sb.isLearned(id)) sb.setSkill(sl as never, id);
  for (const [sid, rid] of Object.entries(s.runes)) sb.setRune(sid, rid);
  D.equipFromBook(); D.sync(); D.save();
  const lost = missing.length + fail;
  D.toast(`已套用${s.name}${lost ? `（${lost} 件装备找不到或穿不上）` : ''}`, lost ? '#ffb040' : '#9aff80'); D.click(); renderGearSets();
  return { ok: true, missing: lost };
}

export function renderGearSets() {
  const el = document.getElementById('gearsets');
  if (!el || !D) return;
  el.innerHTML = `<span class="gs-t">装备方案</span>` + sets.map((s, i) => `<span class="gs"><button class="btn gs-use${s ? '' : ' off'}" data-gs-use="${i}" title="${s ? `套用：装备 + 天赋页 ${s.talentPage + 1} + 英灵 + 技能` : '还没保存'}">${s?.name ?? `方案 ${i + 1}`}</button><button class="btn gs-save" data-gs-save="${i}" title="把当前配置保存到这个方案">存</button></span>`).join('');
}

export function bindGearSets(deps: GearSetDeps) {
  D = deps;
  document.getElementById('gearsets')?.addEventListener('click', ev => {
    const b = (ev.target as HTMLElement).closest('[data-gs-use],[data-gs-save]') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.gsSave) saveGearSet(+b.dataset.gsSave); else applyGearSet(+b.dataset.gsUse!);
  });
  renderGearSets();
}
