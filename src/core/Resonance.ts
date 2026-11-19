// ========== 元素共鸣（v0.6.2，引擎无关） ==========
// 蓝色及以上装备的随机词条有一半几率带元素标签：火 / 霜 / 影 / 岩。
// 身上同元素的词条凑满 3 / 6 / 9 条，依次激活该元素的共鸣（不穿套装也能拼出流派）。
// 共鸣分两类：角色属性（加进 Inventory.stats）和技能修饰器（作为一件虚拟装备交给 Loadout）。
import { ModifierDef } from './types';
import type { ItemDef } from './Loadout';

export type GearElem = 'fire' | 'frost' | 'shadow' | 'stone';
export const GEAR_ELEMS: GearElem[] = ['fire', 'frost', 'shadow', 'stone'];
export const ELEM_NAME: Record<GearElem, string> = { fire: '火', frost: '霜', shadow: '影', stone: '岩' };
export const ELEM_COLOR: Record<GearElem, string> = { fire: '#ff7a3a', frost: '#7fd0ff', shadow: '#c08aff', stone: '#d8b070' };
export const RES_TIERS = [3, 6, 9];

/** 角色属性型共鸣：hpPct / armorPct 是百分比（0.08 = +8%），其余与 BonusStat 同单位 */
export interface ResStat { hpPct?: number; armorPct?: number; crit?: number; critDmg?: number; haste?: number; speed?: number; }
export interface ResTier { text: string; stat?: ResStat; mod?: Omit<ModifierDef, 'id' | 'name' | 'source'>; }

export const RESONANCE: Record<GearElem, ResTier[]> = {
  fire: [
    { text: '所有技能伤害 +4%', mod: { desc: '火之共鸣：所有技能伤害 +4%', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.04 }] } },
    { text: '普通攻击附带灼烧（3 秒）', mod: { desc: '火之共鸣：普通攻击附带灼烧', match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 30, duration: 3 } }] } },
    { text: '大招命中后爆炸（半径 3.5，40% 伤害）', mod: { desc: '火之共鸣：大招命中后爆炸', match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3.5, damagePercent: 0.4 } }] } },
  ],
  frost: [
    { text: '技能冷却 -4%', mod: { desc: '霜之共鸣：技能冷却 -4%', match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.04 }] } },
    { text: '技能命中减速 20%（2 秒）', mod: { desc: '霜之共鸣：技能命中减速', match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.2, duration: 2 } }] } },
    { text: '对减速中的敌人伤害 +15%', mod: { desc: '霜之共鸣：对减速目标伤害 +15%', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'slow' }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
  ],
  shadow: [
    { text: '暴击率 +3%', stat: { crit: 3 } },
    { text: '暴击伤害 +15%', stat: { critDmg: 15 } },
    { text: '技能伤害的 6% 转化为生命', mod: { desc: '影之共鸣：吸血 6%', match: {}, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.06 } }] } },
  ],
  stone: [
    { text: '护甲 +8%', stat: { armorPct: 0.08 } },
    { text: '生命 +8%', stat: { hpPct: 0.08 } },
    { text: '生命 +12%，范围技能半径 +15%', stat: { hpPct: 0.12 }, mod: { desc: '岩之共鸣：范围技能半径 +15%', match: { tagsAny: ['aoe'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.15 }] } },
  ],
};

/** 装备上带元素的词条记录（只需要 el 字段） */
export interface HasElems { affixLog?: { el?: GearElem }[] }

export function countElems(items: HasElems[]): Record<GearElem, number> {
  const c: Record<GearElem, number> = { fire: 0, frost: 0, shadow: 0, stone: 0 };
  for (const it of items) for (const a of it.affixLog ?? []) if (a.el) c[a.el]++;
  return c;
}

export function tierOf(n: number) { return RES_TIERS.filter(t => n >= t).length; }

/** 汇总：激活的角色属性 + 一件虚拟装备（技能修饰器） */
export function resonanceOf(items: HasElems[]) {
  const counts = countElems(items);
  const stat: Required<ResStat> = { hpPct: 0, armorPct: 0, crit: 0, critDmg: 0, haste: 0, speed: 0 };
  const mods: ModifierDef[] = [];
  const active: { el: GearElem; tier: number; text: string }[] = [];
  for (const el of GEAR_ELEMS) {
    const t = tierOf(counts[el]);
    RESONANCE[el].slice(0, t).forEach((r, i) => {
      active.push({ el, tier: i + 1, text: r.text });
      if (r.stat) for (const k of Object.keys(r.stat) as (keyof ResStat)[]) stat[k] += r.stat[k]!;
      if (r.mod) mods.push({ ...r.mod, id: `res_${el}_${i}`, name: `${ELEM_NAME[el]}之共鸣`, source: 'equipment' });
    });
  }
  const item: ItemDef | null = mods.length ? { id: 'resonance', name: '元素共鸣', slot: 'trinket', quality: 'orange', modifiers: mods } : null;
  return { counts, stat, item, active };
}
