// ======================================================================
// DLC1 新职业橙装（v1.2.1，A1「新职业 1–30 级底座」）：灵契猎手 / 负棺人各 8 件传说特效 → PackManifest.legendaries
// 修 1–30 级的硬伤：两职业没有本职业传说特效时，掉橙装会因为找不到可出橙装的底材而报错（本体 4 职业各 24 条）。
// 只用通用修饰器（ModifierDef：伤害 / 冷却 / 范围倍率、附加效果、条件），不需要运行时钩子；40 级专属橙装在 d1.10b 另做。
// 数值初稿（平衡整体暂缓，Rhett 10-22）。只 import core 的类型（见 manifest.ts 约定）。
// ======================================================================
import type { LegendaryPower, ItemSlot } from '../../core/Loot';
import type { ModifierDef } from '../../core/types';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';

type M = Omit<ModifierDef, 'id' | 'name' | 'source' | 'priority'>;
function lg(cls: string, id: string, name: string, slots: ItemSlot[], kind: string, m: M): LegendaryPower {
  const mod = { id, name, source: 'equipment', priority: 20, cls, ...m } as ModifierDef;
  return { id, name, slots, cls, modifier: mod, kind, source: '野外 / 副本 / 长副本随机橙装' } as LegendaryPower;
}

export const HUNTER_LEGENDARIES: LegendaryPower[] = [
  lg(HUNTER_ID, 'lg_h_fang', '契刃·百兽之牙', ['twoHand', 'oneHand'], '条件强化', { desc: '契刃斩伤害 +25%，并附带感电灼烧（雷电，每秒 6，持续 4 秒）', match: { slots: ['basic'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'addEffect', effect: { type: 'dot', element: 'lightning', dps: 6, duration: 4 } }, { op: 'rename', prefix: '百兽·' }] }),
  lg(HUNTER_ID, 'lg_h_twin', '兽牙·双生', ['offHand'], '资源循环', { desc: '技能 1 冷却 -2 秒，伤害 +15%', match: { slots: ['skill1'] },
    ops: [{ op: 'add', stat: 'cooldown', value: -2 }, { op: 'mul', stat: 'damage', value: 0.15 }] }),
  lg(HUNTER_ID, 'lg_h_wolfking', '狼王项链', ['neck'], '条件强化', { desc: '狼契技能伤害 +15%', match: { tagsAll: ['wolf'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  lg(HUNTER_ID, 'lg_h_bearhide', '熊皮披风', ['back'], '形态变换', { desc: '熊契技能范围 +20%，伤害 +10%', match: { tagsAll: ['bear'] },
    ops: [{ op: 'mul', stat: 'radius', value: 0.2 }, { op: 'mul', stat: 'damage', value: 0.1 }] }),
  lg(HUNTER_ID, 'lg_h_eaglefeather', '鹰羽腰链', ['waist'], '形态变换', { desc: '鹰契技能伤害 +15%，射程 +2 米', match: { tagsAll: ['eagle'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'add', stat: 'range', value: 2 }] }),
  lg(HUNTER_ID, 'lg_h_stampede', '奔袭之靴', ['feet'], '条件强化', { desc: '技能 1 伤害 +30%，并使目标减速 30%（2 秒）', match: { slots: ['skill1'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] }),
  lg(HUNTER_ID, 'lg_h_pact', '盟约指环', ['ring'], '条件强化', { desc: '技能 3 冷却 -20%，并眩晕目标 1 秒（首领只打断）', match: { slots: ['skill3'] },
    ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }, { op: 'addEffect', effect: { type: 'stun', duration: 1 } }] }),
  lg(HUNTER_ID, 'lg_h_allbeasts', '万兽护符', ['trinket'], '召唤与地面', { desc: '大招伤害 +30%', match: { slots: ['ultimate'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] }),
];
HUNTER_LEGENDARIES[2].extra = [{ id: 'lg_h_wolfking2', name: '狼王项链', source: 'equipment', priority: 20, cls: HUNTER_ID, desc: '狼契对身上有持续伤害（感电灼烧等）的敌人伤害再 +10%', match: { tagsAll: ['wolf'] },
  conditions: [{ type: 'targetHasEffect', effect: 'dot' }], ops: [{ op: 'mul', stat: 'damage', value: 0.1 }] } as ModifierDef];
HUNTER_LEGENDARIES[7].extra = [{ id: 'lg_h_allbeasts2', name: '万兽护符', source: 'equipment', priority: 20, cls: HUNTER_ID, desc: '绝技冷却 -15%', match: { slots: ['skill4'] },
  ops: [{ op: 'mul', stat: 'cooldown', value: -0.15 }] } as ModifierDef];

export const COFFIN_LEGENDARIES: LegendaryPower[] = [
  lg(COFFIN_ID, 'lg_c_ironweight', '千钧铁棺', ['twoHand'], '条件强化', { desc: '棺击伤害 +25%；同一目标被棺击 4 次后眩晕 1 秒', match: { slots: ['basic'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'addEffect', effect: { type: 'stackStun', stacks: 4, duration: 1, name: '棺压' } }, { op: 'rename', prefix: '千钧·' }] }),
  lg(COFFIN_ID, 'lg_c_longtoll', '葬钟·长鸣', ['twoHand'], '形态变换', { desc: '技能 3 范围 +30%，伤害 +20%', match: { slots: ['skill3'] },
    ops: [{ op: 'mul', stat: 'radius', value: 0.3 }, { op: 'mul', stat: 'damage', value: 0.2 }, { op: 'rename', prefix: '长鸣·' }] }),
  lg(COFFIN_ID, 'lg_c_soulchain', '锁魂项坠', ['neck'], '条件强化', { desc: '技能 2 伤害 +20%，并使目标减速 30%（2 秒）', match: { slots: ['skill2'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] }),
  // v1.2.28 重做（旧：生命低于 35% 时 +25%，实战几乎不触发）→ 常驻 +6% + 满魂开棺后 8 秒爆发 +30%
  lg(COFFIN_ID, 'lg_c_shroud', '裹尸长披', ['back'], '爆发', { desc: '所有技能伤害 +6%；放出 3 个魂开棺后 8 秒内，所有技能伤害再 +30%', match: {},
    ops: [{ op: 'mul', stat: 'damage', value: 0.06 }] }),
  lg(COFFIN_ID, 'lg_c_warden', '守墓腰索', ['waist'], '资源循环', { desc: '技能 1 冷却 -2 秒', match: { slots: ['skill1'] },
    ops: [{ op: 'add', stat: 'cooldown', value: -2 }] }),
  lg(COFFIN_ID, 'lg_c_procession', '送葬者行靴', ['feet'], '条件强化', { desc: '技能 1 伤害 +30%，并眩晕目标 0.8 秒（首领只打断）', match: { slots: ['skill1'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'stun', duration: 0.8 } }] }),
  lg(COFFIN_ID, 'lg_c_ferryring', '冥河摆渡戒', ['ring'], '绝技强化', { desc: '绝技伤害 +25%，冷却 -15%', match: { slots: ['skill4'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] }),
  lg(COFFIN_ID, 'lg_c_undying', '未亡者护符', ['trinket'], '资源循环', { desc: '大招伤害 +30%，造成伤害的 10% 转为生命', match: { slots: ['ultimate'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.1 } }] }),
];
COFFIN_LEGENDARIES[3].extra = [{ id: 'lg_c_shroud2', name: '裹尸长披', source: 'equipment', priority: 20, cls: COFFIN_ID, desc: '', match: {},
  conditions: [{ type: 'recentCast', tag: 'open3', within: 8, consume: false }], ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] } as ModifierDef];
export const DLC1_CLASS_LEGENDARIES = [...HUNTER_LEGENDARIES, ...COFFIN_LEGENDARIES];
