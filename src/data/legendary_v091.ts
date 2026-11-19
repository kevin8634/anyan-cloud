// v0.9.1o 橙装重做第一步：按 96 条设计表重建传说池
//   - 只出 8 个部位（主手 / 副手 / 项链 / 披风 / 腰带 / 鞋子 / 戒指 / 饰品），名字带专精前缀
//   - 沿用的老特效（frm）改名、换部位，技能匹配改成按槽位（换技能书照样生效）
//   - pending 条目需要新战斗钩子，本版不进掉落池（v0.9.1p 补齐）
//   - 老存档：特效还在的橙装按新名字刷新；部位不再出橙装的（套装 6 部位等）转紫装、删特效（见 Loot.migrateLegendary）
import { LegendaryPower, ItemSlot } from '../core/Loot';
import { ModifierDef, SlotId } from '../core/types';
import { LG_V091, LgSpec } from './legendary_v091_table';

const SRC = '任意橙装掉落（副本首领 / 长副本 / 野外首领更容易出）';
const KIND: Record<string, string> = {};
/** v0.9.1r：已在 web/lgfx.ts 实现战斗钩子的 pending 条目（进掉落池）；静态部分写在 LG_HOOK_OPS */
export const LG_HOOKED = new Set([3, 4, 5, 6, 9, 11, 12, 15, 17, 18, 20, 21, 23, 24, 27, 29, 33, 35, 38, 41, 43, 44, 45, 46, 47,
  50, 51, 53, 54, 57, 59, 60, 61, 62, 63, 65, 66, 67, 68, 69, 70, 71, 72, 74, 75, 80, 81, 83, 84, 85, 88, 89, 90, 91, 92, 93, 94, 95, 96]);   // v0.9.1s 时砂 + 炼金
const LG_HOOK_OPS: Record<number, { match: unknown; ops: unknown[] }> = { 17: { match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.25 }] } };

/** 老 id → 新 id（效果合并的） */
export const LG_REMAP: Record<string, string> = { lg_quake_boots: 'lg_w_quakeboots' };

export function buildLegendaries(old: LegendaryPower[]): { ready: LegendaryPower[]; pending: LgSpec[] } {
  const byId = new Map(old.map(l => [l.id, l]));
  const ready: LegendaryPower[] = [], pending: LgSpec[] = [];
  for (let e of LG_V091) {
    if (e.pending && !LG_HOOKED.has(e.n)) { pending.push(e); continue; }
    if (e.pending) e = { ...e, ...(LG_HOOK_OPS[e.n] ?? {}), pending: false };
    const src = e.frm ? byId.get(e.frm) : undefined;
    const base: Omit<ModifierDef, 'id'> = src
      ? { ...src.modifier, cls: undefined, ops: [...src.modifier.ops, ...((e.extraOps ?? []) as ModifierDef['ops'])] }
      : { name: e.name, source: 'equipment', priority: 20, desc: e.desc, match: (e.match ?? {}) as ModifierDef['match'], ops: (e.ops ?? []) as ModifierDef['ops'] };
    const match = e.slot ? { slots: [e.slot as SlotId] } : base.match;
    const modifier: ModifierDef = { ...base, id: e.id, name: e.name, desc: e.pend ? src!.modifier.desc : e.desc, match, cls: e.cls };
    const extra: ModifierDef[] = [];
    for (const x of src?.extra ?? []) if (!x.cls || x.cls === e.cls) extra.push({ ...x, name: e.name, cls: e.cls, match: e.slot && x.match.skillIds ? { slots: [e.slot as SlotId] } : x.match });
    (e.extra ?? []).forEach((x, k) => extra.push({ id: `${e.id}_x${k}`, name: e.name, source: 'equipment', priority: 20, desc: x.desc, cls: e.cls,
      match: x.match as ModifierDef['match'], conditions: x.conditions as ModifierDef['conditions'], ops: x.ops as ModifierDef['ops'] }));
    ready.push({ id: e.id, name: e.name, slots: e.slots as ItemSlot[], cls: e.cls, modifier, extra: extra.length ? extra : undefined, kind: src?.kind ?? KIND[e.id] ?? '条件强化', source: SRC });
  }
  return { ready, pending };
}
