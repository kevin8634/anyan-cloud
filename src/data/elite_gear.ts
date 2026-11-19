// v0.6.2：野外首领专属「特效小件」——每个野外首领 3 件（项链 / 披风 / 戒指 / 饰品），各带一个地域特效 + 2 条随机词条
// 只从对应首领身上掉，掉落装等 = 首领装等 + 4
import { ItemDef } from '../core/Loadout';
import { ModifierDef } from '../core/types';
import { LootEntry } from '../core/Loot';

type EliteItem = ItemDef & { baseId: string; affixes: number; elite: string };
const fx = (id: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): ModifierDef => ({ id, name: desc, source: 'equipment', desc, ...m });
const item = (id: string, name: string, baseId: string, elite: string, mod: ModifierDef): EliteItem =>
  ({ id, name, baseId, slot: baseId === 'b_cloak' ? 'back' : baseId === 'b_ring' ? 'ring' : baseId === 'b_idol' ? 'trinket' : 'neck', quality: 'purple', modifiers: [mod], affixes: 2, elite });

export const ELITE_ITEMS: EliteItem[] = [
  // 翠风原野 · 赤鬃 · 劫掠头目
  item('e_chief_fang', '赤鬃獠牙项链', 'b_amulet', 'elite_field', fx('fang', '普通攻击命中后小范围爆炸（半径 2，30% 伤害）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2, damagePercent: 0.3 } }] })),
  item('e_chief_cloak', '劫掠者披风', 'b_cloak', 'elite_field', fx('raider', '击杀敌人后 5 秒内所有技能伤害 +20%（可刷新）', { match: {}, conditions: [{ type: 'flag', key: 'kill' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] })),
  item('e_chief_ring', '头目的战利品戒指', 'b_ring', 'elite_field', fx('loot', '技能伤害的 3% 转化为生命', { match: {}, ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.03 } }] })),
  // 赤砂裂谷 · 沙暴之主 · 卡鲁
  item('e_sand_glass', '卡鲁的沙漏', 'b_idol', 'elite_redsand', fx('glass', '技能命中使敌人减速 25%（2 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.25, duration: 2 } }] })),
  item('e_sand_cloak', '沙暴斗篷', 'b_cloak', 'elite_redsand', fx('storm', '范围技能留下沙暴区域（3 秒，持续伤害）', { match: { tagsAny: ['aoe'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'physical', dps: 26, radius: 2.6, duration: 3 } }] })),
  item('e_sand_ring', '蝎尾指环', 'b_ring', 'elite_redsand', fx('venom', '普通攻击附带蝎毒（4 秒持续伤害）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'nature', dps: 22, duration: 4 } }] })),
  // 霜脊高地 · 霜牙 · 狼王
  item('e_fang_tooth', '狼王之牙', 'b_amulet', 'elite_frost', fx('tooth', '对减速中的敌人伤害 +20%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'slow' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] })),
  item('e_fang_cloak', '霜鬃披风', 'b_cloak', 'elite_frost', fx('mane', '普通攻击使敌人减速 20%（2 秒）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.2, duration: 2 } }] })),
  item('e_fang_totem', '狼群图腾', 'b_idol', 'elite_frost', fx('pack', '普通攻击弹向附近 1 个敌人（50% 伤害）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 1, radius: 5, damagePercent: 0.5 } }] })),
  // 烬落荒原 · 熔核巨像 · 炽心
  item('e_heart_core', '熔核', 'b_idol', 'elite_ember', fx('core', '技能命中叠「熔核」，满 10 层后下一个技能伤害 +60% 并吸血 8%，然后清空', { match: { slots: ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'] }, conditions: [{ type: 'stacks', key: 'core', min: 10, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.6 }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.08 } }] })),
  item('e_heart_amulet', '炽心护符', 'b_amulet', 'elite_ember', fx('blaze', '大招命中后爆炸（半径 4，50% 伤害）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.5 } }] })),
  item('e_heart_ring', '巨像碎片戒指', 'b_ring', 'elite_ember', fx('shard', '第一个技能命中留下燃烧地面（3 秒）', { match: { slots: ['skill1'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 30, radius: 2.4, duration: 3 } }] })),
  // 烬落荒原 · 灰烬祭司长 · 赛勒
  item('e_ash_prayer', '灰烬祷言', 'b_ring', 'elite_ember2', fx('prayer', '技能 2 或技能 3 每第 6 次命中，重置剩余冷却最长的技能（不含大招）', { match: { slots: ['skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 1, every: 6 } }] })),
  item('e_ash_ember', '祭司长的余烬', 'b_idol', 'elite_ember2', fx('ember', '火焰技能伤害 +20%', { match: { elements: ['fire'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] })),
  item('e_ash_cloak', '灰烬之袍', 'b_cloak', 'elite_ember2', fx('robe', '技能冷却 -8%', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.08 }] })),
];

/** 每个野外首领掉落表追加：3 件特效件各 22%，首领之证 1~2 */
export function eliteEntries(table: string): { entries: LootEntry[]; stacks: { id: string; chance: number; min: number; max: number }[] } {
  return {
    entries: ELITE_ITEMS.filter(i => i.elite === table).map(i => ({ kind: 'fixed', chance: 0.22, itemId: i.id, ilvl: 4 }) as LootEntry),
    stacks: [{ id: 'mat_proof', chance: 1, min: 1, max: 2 }],
  };
}
