// ========== v0.7.8：25 / 30 级新技能（第 4 技能槽「绝技」，按 4 键） ==========
// 每职业 2 个：25 级开放第 4 槽并自动会 A；30 级自动学会 B，在技能书里二选一。每个技能 3 枚符文（熟练度 100/300/600）。
// 全部用现有技能形态（line / circle / projectile / single / 时砂 zone_cast），不需要新的施法代码。
import { SkillDef, ModifierDef, Element, EffectDef, ModOp } from '../core/types';
import type { RuneDef } from './skillbook';

export const SKILL4_LEVEL = 25, SKILL4B_LEVEL = 30;
const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
type Alt = SkillDef & { desc: string };
const S = (id: string, name: string, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string): Alt =>
  ({ id, name, slot: 'skill4', element, shape, tags: [...tags, 'skill4'], stats: { ...base, ...stats }, effects, desc });

export const SKILL4: Record<'warrior' | 'mage' | 'chrono' | 'alchemy', [Alt, Alt]> = {
  warrior: [
    S('earthsplitter', '裂地猛击', 'physical', 'line', ['melee', 'aoe', 'slam', 'line'], { damage: 88, cooldown: 12, radius: 2.5, range: 12 },
      [{ type: 'stun', duration: 1 }, { type: 'groundZone', element: 'physical', dps: 12, radius: 2.5, duration: 4 }], '25 级：向前劈开一道地裂，震晕 1 秒并留下 4 秒碎石带'),
    S('rage_roar', '狂怒咆哮', 'physical', 'circle', ['aoe', 'shout'], { damage: 72, cooldown: 16, radius: 6 },
      [{ type: 'heal', percentOfDamage: 0.15 }, { type: 'reflect', reduce: 0.2, percent: 0.1, duration: 5 }], '30 级：震爆周围敌人，按伤害 15% 回血，5 秒内受到伤害 -20%'),
  ],
  mage: [
    S('star_barrage', '星界弹幕', 'arcane', 'projectile', ['ranged', 'spell', 'bolt'], { damage: 38, cooldown: 10, range: 18, projectileCount: 5 },
      [{ type: 'slow', percent: 0.2, duration: 2 }], '25 级：连射 5 枚奥术弹，命中减速'),
    S('frostfire', '寒焰交织', 'fire', 'circle', ['spell', 'aoe', 'targeted'], { damage: 112, cooldown: 15, radius: 4.5, range: 18 },
      [{ type: 'slow', percent: 0.4, duration: 3 }, { type: 'groundZone', element: 'frost', dps: 14, radius: 4, duration: 4 }], '30 级：目标处冰火同爆，减速 40% 并留下 4 秒寒霜地带'),
  ],
  chrono: [
    S('mark_burst', '时痕爆裂', 'physical', 'circle', ['ranged', 'targeted', 'zone_cast', 'aoe'], { damage: 96, cooldown: 12, radius: 5, range: 16 },
      [{ type: 'stun', duration: 0.8 }], '25 级：在目标处引爆一圈时砂，震晕 0.8 秒'),
    S('time_vortex', '时之涡', 'physical', 'circle', ['ranged', 'targeted', 'zone_cast', 'aoe', 'control'], { damage: 70, cooldown: 16, radius: 6, range: 16 },
      [{ type: 'slow', percent: 0.5, duration: 4 }, { type: 'dot', element: 'physical', dps: 12, duration: 5 }], '30 级：卷起时之漩涡，大范围减速 50% 并持续切割 5 秒'),
  ],
  alchemy: [
    S('acid_cloud', '酸雨云', 'nature', 'circle', ['spell', 'aoe', 'targeted'], { damage: 60, cooldown: 14, radius: 5, range: 16 },
      [{ type: 'groundZone', element: 'nature', dps: 20, radius: 5, duration: 6 }], '25 级：在目标上空洒下 6 秒酸雨（不消耗试剂）'),
    S('chain_bomb', '连锁爆裂', 'fire', 'single', ['ranged', 'spell', 'chain'], { damage: 76, cooldown: 12, range: 16 },
      [{ type: 'chain', jumps: 4, radius: 6, damagePercent: 0.7 }, { type: 'explode', radius: 3, damagePercent: 0.5 }], '30 级：弹射 4 次的爆裂瓶，每次命中再小范围爆炸（不消耗试剂）'),
  ],
};

const RUNE_NEED = [100, 300, 600];
const R = (skillId: string, i: number, name: string, desc: string, ops: ModOp[], element?: Element): RuneDef => ({
  id: `r_${skillId}_${i + 1}`, skillId, name, desc, need: RUNE_NEED[i], element,
  modifier: { id: `r_${skillId}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [skillId] }, priority: 40, ops } as ModifierDef,
});
/** 每个技能 3 枚：伤害 / 冷却 / 范围或附加效果 */
export const RUNES_V078: RuneDef[] = Object.values(SKILL4).flat().flatMap(s => [
  R(s.id, 0, '强击', '伤害 +25%', [{ op: 'mul', stat: 'damage', value: 0.25 }]),
  R(s.id, 1, '迅捷', '冷却 -20%', [{ op: 'mul', stat: 'cooldown', value: -0.2 }]),
  s.stats.radius > 0
    ? R(s.id, 2, '扩张', '范围 +30%，伤害 +10%', [{ op: 'mul', stat: 'radius', value: 0.3 }, { op: 'mul', stat: 'damage', value: 0.1 }])
    : R(s.id, 2, '穿透', '命中后小范围爆炸（40% 伤害）', [{ op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.4 } }]),
]);
