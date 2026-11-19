// ======================================================================
// DLC1 40 级传说特效（v1.2.7 d1.10b-1）：本体 4 职业各 6 件「回响」橙装 → PackManifest.legendaries
//   只在角色 ≥ 38 级时进随机橙装池（LegendaryPower.minLevel；30 级起装等固定，所以按角色等级），
//   所以 1–37 级的橙装池不被稀释。部位避开 1–30 级常用的首饰位：头 / 肩 / 胸 / 腿 / 护腕 + 武器。
//   主题：每件都带一点「回响」——第二次命中、余波、钟声，和 DLC 的钟 / 潮 / 镜对上。
//   只用通用修饰器；数值初稿（平衡整体暂缓）。只 import core 的类型。
// ======================================================================
import type { LegendaryPower, ItemSlot } from '../../core/Loot';
import { CondFlags } from '../../core/CondFlags';
import type { ModifierDef } from '../../core/types';

export const LG40_MIN_LEVEL = 38;
type M = Omit<ModifierDef, 'id' | 'name' | 'source' | 'priority'>;
function lg(cls: string, id: string, name: string, slots: ItemSlot[], kind: string, m: M, extra?: M): LegendaryPower {
  const mod = { id, name, source: 'equipment', priority: 20, cls, ...m } as ModifierDef;
  const out = { id, name, slots, cls, modifier: mod, kind, source: '沉钟之海 · 角色 38 级起随机橙装', minLevel: LG40_MIN_LEVEL } as LegendaryPower;
  if (extra) out.extra = [{ id: id + '2', name, source: 'equipment', priority: 20, cls, ...extra } as ModifierDef];
  return out;
}
const W = 'warrior', MG = 'mage', CH = 'chrono', AL = 'alchemy';

export const LEGENDARIES_40: LegendaryPower[] = [
  // ---------------- 战士
  lg(W, 'lg40_w_bellcleaver', '钟裂者', ['twoHand', 'oneHand'], '连锁触发', { desc: '旋风斩每转一圈都敲出钟声余波（半径 3.5，40% 伤害）', match: { slots: ['skill2'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3.5, damagePercent: 0.4 } }] },
    { desc: '旋风斩伤害 +20%', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  lg(W, 'lg40_w_tidehelm', '潮汐守望者之盔', ['head'], '条件强化', { desc: '旋风斩每命中 1 个敌人，6 秒内所有技能伤害 +4%（最多 +20%）', match: {}, conditions: [{ type: 'stacks', key: 'tide', scale: true }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.04 }] }),
  lg(W, 'lg40_w_chargeplate', '撞钟肩甲', ['shoulder'], '条件强化', { desc: '冲锋命中后眩晕 1.2 秒（首领只打断），冲锋伤害 +30%', match: { slots: ['skill1'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'stun', duration: 1.2 } }] }),
  lg(W, 'lg40_w_echoplate', '回响胸铠', ['chest'], '资源循环', { desc: '大招命中后获得护盾（最大生命 18%，6 秒）', match: { slots: ['ultimate'] },
    ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.18, duration: 6 } }] }),
  lg(W, 'lg40_w_thunderlegs', '雷鸣钟摆腿甲', ['legs'], '召唤与地面', { desc: '雷霆一击留下雷暴地面（3 米，4 秒）', match: { slots: ['skill3'] },
    ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'arcane', dps: 60, radius: 3, duration: 4 } }] }),
  lg(W, 'lg40_w_ironbind', '铸钟匠护腕', ['wrist'], '条件强化', { desc: '普通攻击对减速中的敌人伤害 +35%', match: { slots: ['basic'] }, conditions: [{ type: 'targetHasEffect', effect: 'slow' }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.35 }] }),
  // ---------------- 法师
  lg(MG, 'lg40_m_mirrorstaff', '倒影法杖', ['twoHand', 'oneHand'], '连锁触发', { desc: '奥术飞弹命中后在目标身上再炸一次倒影（半径 2.5，35% 伤害）', match: { slots: ['basic'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.35 } }] }),
  lg(MG, 'lg40_m_drownedhood', '溺亡学者兜帽', ['head'], '条件强化', { desc: '冰霜伤害 +18%，冰霜之环冷却 -2 秒', match: { elements: ['frost'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.18 }] },
    { desc: '冰霜之环冷却 -2 秒', match: { slots: ['skill2'] }, ops: [{ op: 'add', stat: 'cooldown', value: -2 }] }),
  lg(MG, 'lg40_m_bellmantle', '钟声披肩', ['shoulder'], '召唤与地面', { desc: '火球留下余烬地面（2.8 米，4 秒）', match: { slots: ['skill1'] },
    ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 58, radius: 2.8, duration: 4 } }] }),
  lg(MG, 'lg40_m_tiderobe', '潮汐长袍', ['chest'], '资源循环', { desc: '奥术禁锢冷却 -25%，并使目标受到的伤害显现（减速 40%，3 秒）', match: { slots: ['skill3'] },
    ops: [{ op: 'mul', stat: 'cooldown', value: -0.25 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 3 } }] }),
  lg(MG, 'lg40_m_starlegs', '沉星护腿', ['legs'], '条件强化', { desc: '大招伤害 +35%', match: { slots: ['ultimate'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.35 }] }),
  lg(MG, 'lg40_m_runebind', '镜纹护腕', ['wrist'], '条件强化', { desc: '对被减速的敌人，所有法术伤害 +20%', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'slow' }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  // ---------------- 时砂
  lg(CH, 'lg40_c_hourglaive', '沉钟时轮', ['twoHand', 'oneHand'], '连锁触发', { desc: '刃旋结束时再旋一圈（余波半径 3，45% 伤害）', match: { slots: ['skill2'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.45 } }] }),
  lg(CH, 'lg40_c_sandcrown', '流沙冠冕', ['head'], '资源循环', { desc: '沙步冷却 -2 秒，沙步伤害 +25%', match: { slots: ['skill1'] },
    ops: [{ op: 'add', stat: 'cooldown', value: -2 }, { op: 'mul', stat: 'damage', value: 0.25 }] }),
  lg(CH, 'lg40_c_pendulum', '钟摆肩饰', ['shoulder'], '条件强化', { desc: '凝滞命中后目标冻结在时间里 1.5 秒（首领只打断）', match: { slots: ['skill3'] },
    ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 1.5 } }] }),
  lg(CH, 'lg40_c_tidecoat', '逆潮外衣', ['chest'], '资源循环', { desc: '大招命中后获得护盾（最大生命 15%，5 秒），大招伤害 +15%', match: { slots: ['ultimate'] },
    ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 5 } }, { op: 'mul', stat: 'damage', value: 0.15 }] }),
  lg(CH, 'lg40_c_echolegs', '回响步履护腿', ['legs'], '条件强化', { desc: '位移技能伤害 +35%', match: { tagsAny: ['movement'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.35 }] }),
  lg(CH, 'lg40_c_secondhand', '秒针护腕', ['wrist'], '连锁触发', { desc: '飞刃命中叠时砂：同一目标 5 次冻结 1.2 秒（首领只打断）', match: { slots: ['basic'] },
    ops: [{ op: 'addEffect', effect: { type: 'stackStun', stacks: 5, duration: 1.2, name: '时砂封冻' } }] }),
  // ---------------- 炼金
  lg(AL, 'lg40_a_brinestaff', '盐潮蒸馏器', ['twoHand', 'oneHand'], '召唤与地面', { desc: '试剂射击命中溅出盐潮（2.4 米，3 秒持续伤害）', match: { slots: ['basic'] },
    ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'nature', dps: 40, radius: 2.4, duration: 3 } }] }),
  lg(AL, 'lg40_a_mask', '沉船药师面具', ['head'], '条件强化', { desc: '对持续伤害中的敌人，所有技能伤害 +20%', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'dot' }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  lg(AL, 'lg40_a_flaskpads', '烧瓶肩带', ['shoulder'], '连锁触发', { desc: '赤瓶爆开后再炸一次（半径 3，40% 伤害）', match: { slots: ['skill1'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.4 } }] }),
  lg(AL, 'lg40_a_apron', '回响炼成围裙', ['chest'], '资源循环', { desc: '蓝瓶冷却 -25%，并给自己护盾（最大生命 10%，4 秒）', match: { slots: ['skill2'] },
    ops: [{ op: 'mul', stat: 'cooldown', value: -0.25 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.1, duration: 4 } }] }),
  lg(AL, 'lg40_a_venomlegs', '蚀毒绑腿', ['legs'], '召唤与地面', { desc: '绿瓶毒池范围 +30%，伤害 +20%', match: { slots: ['skill3'] },
    ops: [{ op: 'mul', stat: 'radius', value: 0.3 }, { op: 'mul', stat: 'damage', value: 0.2 }] }),
  lg(AL, 'lg40_a_catalyst', '催化护腕', ['wrist'], '条件强化', { desc: '大招伤害 +30%，冷却 -15%', match: { slots: ['ultimate'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] }),
];

// v1.2.35 潮汐守望者之盔：旋风斩每命中 1 个敌人叠 1 层「潮汐」（6 秒，最多 5 层），由本体 web/trigfx.ts 按规则叠层
CondFlags.hitRules.push({ key: 'tide', skillIds: ['whirlwind'], perTarget: true, max: 5, dur: 6 });
