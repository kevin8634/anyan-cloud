// v0.6.9：橙装特效扩充——每职业 +6 件职业专属橙装（武器 / 护甲），4 件多职业首饰（按职业显示不同特效）
// 5 类特效：形态变换 / 连锁触发 / 资源循环 / 召唤与地面 / 条件强化
// 全部是纯数据修饰器（priority 15~20，和老传说同档），掉落走普通橙装池（LootGenerator.forClass 按职业挑；多职业首饰不写 cls，两个职业都掉）
import { LegendaryPower } from '../core/Loot';
import { ModifierDef } from '../core/types';

type M = Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>;
const mod = (id: string, name: string, desc: string, m: M, priority = 20): ModifierDef => ({ id, name, source: 'equipment', desc, priority, ...m });

export const LG_KINDS = ['形态变换', '连锁触发', '资源循环', '召唤与地面', '条件强化'] as const;
const SRC = '任意橙装掉落（副本首领 / 长副本 / 野外首领更容易出）';

export const WARRIOR_LG_069: LegendaryPower[] = [
  { id: 'lg_w_quakeboots', name: '震地战靴', slots: ['feet'], cls: 'warrior', kind: '召唤与地面', source: SRC,
    modifier: mod('lg_w_quakeboots', '震地战靴', '英勇跳跃落地留下震裂地面（4 秒，每秒 90 点物理伤害）', { match: { skillIds: ['heroic_leap'] },
      ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'physical', dps: 90, radius: 3.5, duration: 4 } }, { op: 'rename', prefix: '震地' }] }) },
  { id: 'lg_w_galegloves', name: '狂风护手', slots: ['hands'], cls: 'warrior', kind: '连锁触发', source: SRC,
    modifier: mod('lg_w_galegloves', '狂风护手', '顺劈斩命中后风刃弹向附近 2 个敌人（每跳 60% 伤害）', { match: { skillIds: ['cleave'] },
      ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.6 } }, { op: 'rename', prefix: '狂风' }] }) },
  { id: 'lg_w_roarhelm', name: '战嚎头盔', slots: ['head'], cls: 'warrior', kind: '资源循环', source: SRC,
    modifier: mod('lg_w_roarhelm', '战嚎头盔', '战吼命中时 50% 几率重置位移技能，并回复造成伤害的 30%', { match: { skillIds: ['battle_shout'] },
      ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.5 } }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.3 } }, { op: 'rename', prefix: '战嚎·' }] }) },
  { id: 'lg_w_stormplate', name: '雷暴肩铠', slots: ['shoulder'], cls: 'warrior', kind: '形态变换', source: SRC,
    modifier: mod('lg_w_stormplate', '雷暴肩铠', '剑刃风暴变为雷暴：自然伤害，范围 +1.5 米，命中弹出闪电（2 跳）', { match: { skillIds: ['bladestorm'] },
      ops: [{ op: 'setElement', value: 'nature' }, { op: 'addTag', value: 'nature' }, { op: 'add', stat: 'radius', value: 1.5 }, { op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 7, damagePercent: 0.5 } }, { op: 'rename', name: '雷暴' }] }, 15) },
  { id: 'lg_w_headsman', name: '斩首者', slots: ['twoHand'], cls: 'warrior', kind: '条件强化', source: SRC,
    modifier: mod('lg_w_headsman', '斩首者', '英勇打击每第 3 次必定暴击', { match: { skillIds: ['slash'] }, ops: [{ op: 'addEffect', effect: { type: 'critEvery', n: 3 } }, { op: 'rename', prefix: '斩首·' }] }),
    extra: [mod('lg_w_headsman2', '斩首者', '英勇打击对眩晕中的敌人伤害 +50%', { match: { skillIds: ['slash'] }, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], ops: [{ op: 'mul', stat: 'damage', value: 0.5 }] })] },
  { id: 'lg_w_oathbelt', name: '不屈腰带', slots: ['waist'], cls: 'warrior', kind: '资源循环', source: SRC,
    modifier: mod('lg_w_oathbelt', '不屈腰带', '位移技能命中时获得护盾（最大生命 12%，6 秒）', { match: { skillIds: ['charge', 'heroic_leap', 'shield_rush'] },
      ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.12, duration: 6 } }] }) },
];

export const MAGE_LG_069: LegendaryPower[] = [
  { id: 'lg_m_shatterstaff', name: '裂冰法杖', slots: ['twoHand'], cls: 'mage', kind: '连锁触发', source: SRC,
    modifier: mod('lg_m_shatterstaff', '裂冰法杖', '冰枪命中后碎裂，冰片弹向附近 2 个敌人（每跳 65% 伤害）', { match: { skillIds: ['ice_lance'] },
      ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.65 } }, { op: 'rename', prefix: '裂冰' }] }) },
  { id: 'lg_m_embergloves', name: '余烬手套', slots: ['hands'], cls: 'mage', kind: '召唤与地面', source: SRC,
    modifier: mod('lg_m_embergloves', '余烬手套', '烈焰新星留下燃烧地面（4 秒，每秒 110 点火焰伤害）', { match: { skillIds: ['flame_nova'] },
      ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 110, radius: 4, duration: 4 } }, { op: 'rename', prefix: '余烬' }] }) },
  { id: 'lg_m_wintercrown', name: '凛冬王冠', slots: ['head'], cls: 'mage', kind: '条件强化', source: SRC,
    modifier: mod('lg_m_wintercrown', '凛冬王冠', '暴风雪命中叠「寒意」，3 层冻结 1.5 秒（首领只打断）', { match: { skillIds: ['blizzard'] },
      ops: [{ op: 'addEffect', effect: { type: 'stackStun', stacks: 3, duration: 1.5, name: '冻结' } }, { op: 'rename', prefix: '凛冬' }] }) },
  { id: 'lg_m_chronomantle', name: '时序披肩', slots: ['shoulder'], cls: 'mage', kind: '资源循环', source: SRC,
    modifier: mod('lg_m_chronomantle', '时序披肩', '时间缓滞命中时重置主攻技能冷却', { match: { skillIds: ['time_warp'] },
      ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 1 } }, { op: 'rename', prefix: '时序·' }] }) },
  { id: 'lg_m_wardsash', name: '护法腰带', slots: ['waist'], cls: 'mage', kind: '资源循环', source: SRC,
    modifier: mod('lg_m_wardsash', '护法腰带', '技能 3 施放后获得护盾（最大生命 15%，6 秒）', { match: { skillIds: ['blink'] },
      ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 6 } }] }) },
  { id: 'lg_m_starfall', name: '坠星之靴', slots: ['feet'], cls: 'mage', kind: '形态变换', source: SRC,
    modifier: mod('lg_m_starfall', '坠星之靴', '奥术风暴变为流星风暴：火焰伤害 +20%，留下燃烧地面', { match: { skillIds: ['arcane_storm'] },
      ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' }, { op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 120, radius: 4.5, duration: 4 } }, { op: 'rename', name: '流星风暴' }] }, 15) },
];

/** 多职业首饰 / 披风：不写 cls（两个职业都掉）；每条特效带 cls，只对该职业生效、只显示该职业那条 */
const w = (m: ModifierDef): ModifierDef => ({ ...m, cls: 'warrior' });
const g = (m: ModifierDef): ModifierDef => ({ ...m, cls: 'mage' });
export const SHARED_LG_069: LegendaryPower[] = [
  { id: 'lg_x_twinheart', name: '双生之心', slots: ['neck'], kind: '资源循环', source: SRC,
    modifier: w(mod('lg_x_twinheart_w', '双生之心', '旋风斩命中时 30% 几率重置冲锋', { match: { skillIds: ['whirlwind'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.3 } }] })),
    extra: [g(mod('lg_x_twinheart_m', '双生之心', '霜环命中时 30% 几率重置烈焰弹', { match: { skillIds: ['frost_ring'] }, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.3 } }] }))] },
  { id: 'lg_x_echoring', name: '回响指环', slots: ['ring'], kind: '连锁触发', source: SRC,
    modifier: w(mod('lg_x_echoring_w', '回响指环', '雷霆一击命中后雷电再弹 3 次（每跳 50% 伤害）', { match: { skillIds: ['thunderclap'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 3, radius: 7, damagePercent: 0.5 } }] })),
    extra: [g(mod('lg_x_echoring_m', '回响指环', '奥术禁锢命中后再弹向 2 个敌人（同样禁锢）', { match: { skillIds: ['arcane_bind'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 7, damagePercent: 0.7 } }] }))] },
  { id: 'lg_x_oathcharm', name: '誓约护符', slots: ['trinket'], kind: '条件强化', source: SRC,
    modifier: w(mod('lg_x_oathcharm_w', '誓约护符', '位移技能或翻滚后「立誓」4 秒：所有伤害 +20%，技能伤害的 5% 转化为生命', { match: {}, conditions: [{ type: 'flag', key: 'oath' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.05 } }] })),
    extra: [g(mod('lg_x_oathcharm_m', '誓约护符', '位移技能或翻滚后「立誓」4 秒：所有伤害 +20%，立誓期间施放的技能冷却 -25%', { match: {}, conditions: [{ type: 'flag', key: 'oath' }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'mul', stat: 'cooldown', value: -0.25 }] }))] },
  { id: 'lg_x_duskcloak', name: '晨昏披风', slots: ['back'], kind: '召唤与地面', source: SRC,
    modifier: w(mod('lg_x_duskcloak_w', '晨昏披风', '大招命中后留下震裂地面（5 秒，每秒 140 点物理伤害）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'physical', dps: 140, radius: 4.5, duration: 5 } }] })),
    extra: [g(mod('lg_x_duskcloak_m', '晨昏披风', '大招命中后留下冰霜领域（5 秒，每秒 120 点冰霜伤害并减速）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'frost', dps: 120, radius: 5, duration: 5 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 3 } }] }))] },
];
