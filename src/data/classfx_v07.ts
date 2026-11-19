// ========== v0.7.4-br.A：多职业首饰 / 隐藏橙装 / 暗金首饰 —— 新职业的职业版特效（11 条，账号 A） ==========
// 单独一个文件，加载时把职业版效果追加到原物品上（避免改主线的数据文件）；规则同 v0.6.9：ModifierDef.cls 只对该职业生效、只显示该职业那条。
// 在 data/loot.ts 里 import 一次（副作用导入）。
import { ModifierDef } from '../core/types';
import { SHARED_LG_069 } from './legendary_v069';
import { DARK_ITEMS } from './darkgold';
import { DUNGEON_SET_ITEMS } from './dungeon_new';

type M = Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc' | 'cls'>;
const mk = (id: string, name: string, desc: string, cls: 'chrono' | 'alchemy', m: M): ModifierDef => ({ id, name, source: 'equipment', desc, priority: 20, ...m, cls });
const C = (id: string, name: string, desc: string, m: M) => mk(id + '_c', name, desc, 'chrono', m);
const A = (id: string, name: string, desc: string, m: M) => mk(id + '_a', name, desc, 'alchemy', m);

/** 多职业橙装（LegendaryPower.extra 追加） */
const SHARED: Record<string, ModifierDef[]> = {
  lg_x_twinheart: [
    C('lg_x_twinheart', '双生之心', '输出技能命中时 30% 几率重置位移技能', { match: { slots: ['skill2'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.3 } }] }),
    A('lg_x_twinheart', '双生之心', '药剂命中时 5% 几率重置大招冷却（内置冷却 20 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'ultimate', chance: 0.05, icd: 20 } }] }),
  ],
  lg_x_echoring: [
    C('lg_x_echoring', '回响指环', '控制技能命中后再弹向 2 个敌人（70% 伤害，同样控制）', { match: { slots: ['skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 7, damagePercent: 0.7 } }] }),
    A('lg_x_echoring', '回响指环', '红试剂单投命中后闪电弹射 2 次（每跳 50% 伤害）', { match: { slots: ['skill1'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.5 } }] }),
  ],
  lg_x_oathcharm: [
    C('lg_x_oathcharm', '誓约护符', '位移技能或翻滚后「立誓」4 秒：所有伤害 +20%，时痕每次多叠 1 层', { match: {}, conditions: [{ type: 'flag', key: 'oath' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
    A('lg_x_oathcharm', '誓约护符', '位移技能或翻滚后「立誓」4 秒：所有伤害 +30%（炼金没有位移技能，加成更高）', { match: {}, conditions: [{ type: 'flag', key: 'oath' }], ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }),
  ],
  lg_x_duskcloak: [
    C('lg_x_duskcloak', '晨昏披风', '大招命中后留下流沙地面（5 秒，每秒 120 点物理伤害）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'physical', dps: 120, radius: 5, duration: 5 } }] }),
    A('lg_x_duskcloak', '晨昏披风', '红试剂单投命中后额外留下燃烧地面（3 秒，每秒 60 点火焰伤害）', { match: { slots: ['skill1'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 60, radius: 2.5, duration: 3 } }] }),
  ],
};
/** 隐藏橙装第二条 + 暗金首饰职业版（物品 modifiers 追加） */
const ITEMS: Record<string, ModifierDef[]> = {
  h_warden_mask: [
    C('h_warden2', '守陵人', '大招伤害 +20%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
    A('h_warden2', '守陵人', '大招冷却 -15%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.15 }] }),
  ],
  h_statue_ring: [
    C('h_statue2', '无名铸像', '输出技能每次命中引发小爆炸（半径 2，20% 伤害）', { match: { slots: ['skill2'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2, damagePercent: 0.2 } }] }),
    A('h_statue2', '无名铸像', '火焰技能伤害 +10%', { match: { tagsAny: ['fire'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.1 }] }),
  ],
  h_heart_shard: [
    C('h_heart2', '冰窟之心', '对冻结 / 眩晕中的敌人伤害 +15%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
    A('h_heart2', '冰窟之心', '对冻结 / 眩晕中的敌人伤害 +15%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ],
  d_throne_ember: [
    C('ember', '王座余烬', '大招命中时获得护盾（最大生命 15%，8 秒）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 8 } }] }),
    A('ember', '王座余烬', '大招冷却 -12%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.12 }] }),
  ],
  d_molten_heart: [
    C('molten', '熔心护符', '时轮投掷命中后爆炸（半径 3，40% 伤害）', { match: { skillIds: ['chrono_throw'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.4 } }] }),
    A('molten', '熔心护符', '红试剂伤害 +25%', { match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }),
  ],
  d_warden_chain: [
    C('chain', '墓守锁链', '位移技能落点 6 米内的敌人被拉向锁链目标', { match: { skillIds: ['__none'] }, ops: [] }),
    A('chain', '墓守锁链', '蓝试剂单投冻结锁链目标 1 秒', { match: { skillIds: ['__none'] }, ops: [] }),
  ],
  d_oath_ring: [
    C('oathr', '骑士誓戒', '控制技能冷却 -20%', { match: { slots: ['skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }] }),
    A('oathr', '骑士誓戒', '绿试剂伤害 +20%', { match: { slots: ['skill3'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  ],
};

let done = false;
export function applyClassFxV07() {
  if (done) return; done = true;
  for (const lg of SHARED_LG_069) { const add = SHARED[lg.id]; if (add) lg.extra = [...(lg.extra ?? []), ...add]; }
  for (const it of [...DARK_ITEMS, ...DUNGEON_SET_ITEMS] as { id: string; modifiers?: ModifierDef[]; mods?: ModifierDef[] }[]) {
    const add = ITEMS[it.id]; if (!add) continue;
    if (it.modifiers) it.modifiers.push(...add); else if (it.mods) it.mods.push(...add);
  }
}
/** 测试用：11 件物品都追加了 */
export const CLASSFX_V07_IDS = [...Object.keys(SHARED), ...Object.keys(ITEMS)];
applyClassFxV07();
