// 时砂行者（阶段七，账号 A，原创内容）：物理远程刺客，皮甲，专属武器 时轮（单手可双持）/ 沙漏（副手）
// 核心机制在 web/chrono.ts：时砂（6 格资源）、时痕（延时伤害，5 层或 6 秒引爆）、回声（2 秒后原地重放）、回溯（F 键，回到 3 秒前）
// 技能标签约定（chrono.ts 读取）：
//   chakram = 时轮投射物；return = 去回各打一次；fan = 扇形多枚时轮；blink = 沙影步瞬移；timestop = 时停
//   echo = 2 秒后回声重放（50% 伤害）；mark1 / mark2 = 命中叠几层时痕；mark_ret = 回程命中叠 1 层
import { SkillDef, ModifierDef } from '../core/types';
import { LegendaryPower, AffixDef } from '../core/Loot';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };

export const CHRONO_SKILLS: Record<string, SkillDef> = {
  chrono_throw: { id: 'chrono_throw', name: '时轮投掷', slot: 'basic', element: 'physical', shape: 'projectile', tags: ['ranged', 'chakram', 'return', 'mark_ret', 'weapon'],
    stats: { ...base, damage: 15, cooldown: 0.8, range: 15 }, effects: [{ type: 'dot', element: 'physical', dps: 2, duration: 4 }] },   // v0.9.1l 持续伤害普及：切割
  sand_step: { id: 'sand_step', name: '沙影步', slot: 'skill1', element: 'physical', shape: 'circle', tags: ['blink', 'echo', 'aoe', 'movement', 'mark1'],
    stats: { ...base, damage: 34, cooldown: 7, radius: 3.5, range: 8, cost: 1 }, effects: [{ type: 'dot', element: 'physical', dps: 5, duration: 3 }] },
  blade_spin: { id: 'blade_spin', name: '千刃回旋', slot: 'skill2', element: 'physical', shape: 'projectile', tags: ['ranged', 'chakram', 'fan', 'echo', 'aoe', 'mark1'],
    stats: { ...base, damage: 30, cooldown: 6, range: 13, radius: 1.4, projectileCount: 3, cost: 2 }, effects: [{ type: 'dot', element: 'physical', dps: 4, duration: 4 }] },
  stasis: { id: 'stasis', name: '停滞之刻', slot: 'skill3', element: 'physical', shape: 'single', tags: ['ranged', 'control', 'mark2'],
    stats: { ...base, damage: 32, cooldown: 10, range: 15, cost: 1 }, effects: [{ type: 'interrupt' }, { type: 'stun', duration: 1.5 }] },
  final_moment: { id: 'final_moment', name: '终刻', slot: 'ultimate', element: 'physical', shape: 'circle', tags: ['timestop', 'aoe', 'ultimate', 'mark1'],
    stats: { ...base, damage: 60, cooldown: 50, radius: 12 }, effects: [] },
};

/** 时砂消耗：回溯（不是技能槽，F 键）也在这里，方便 UI 和平衡统一调 */
export const CHRONO_CFG = {
  sandMax: 6, sandRegen: 2,         // 每 2 秒回 1 格（急速缩短）
  critRefund: 0.5,                  // 暴击返还
  markMax: 5, markLife: 6, markStore: 0.1,   // 每层把之后受到伤害的 10% 存起来
  markBase: 0.5,                    // 引爆额外伤害：每层 = 当前普攻伤害 × 0.5
  echoDelay: 2, echoMul: 0.5,
  rewindCost: 3, rewindCd: 12, rewindBack: 3, rewindHeal: 0.25,
  stopTime: 3, stopBonus: 0.5,      // 时停 3 秒；期间造成的伤害结束时额外打出 50%
};

// ---------- 技能组合 ----------
export const CHRONO_COMBOS: ModifierDef[] = [
  { id: 'c_step_spin', name: '残影连环', source: 'combo', desc: '沙影步后 3 秒内释放千刃回旋：伤害 +40%', match: { skillIds: ['blade_spin'] }, priority: 60,
    conditions: [{ type: 'recentCast', skillId: 'sand_step', within: 3 }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.4 }, { op: 'rename', prefix: '残影' }] },
  { id: 'c_stasis_throw', name: '定格', source: 'combo', desc: '停滞之刻后 3 秒内，时轮投掷伤害 +30%', match: { skillIds: ['chrono_throw'] },
    conditions: [{ type: 'recentCast', skillId: 'stasis', within: 3 }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] },
];

// ---------- 传说特效（v0.7.0 两件 + v0.7.2 四件）：只掉给时砂行者；带机制的效果在 web/chrono.ts 里用 hasLg(id) 读取 ----------
export const CHRONO_LEGENDARIES: LegendaryPower[] = [
  { kind: '形态变换', id: 'lg_split_wheel', name: '裂时之轮', slots: ['oneHand', 'offHand'], cls: 'chrono', modifier: {
      id: 'lg_split_wheel', name: '裂时之轮', source: 'equipment', priority: 20,
      desc: '千刃回旋多飞出 2 枚时轮，每枚伤害 -15%', match: { skillIds: ['blade_spin'] },
      ops: [{ op: 'add', stat: 'projectileCount', value: 2 }, { op: 'mul', stat: 'damage', value: -0.15 }, { op: 'rename', prefix: '裂时' }] } },
  { kind: '条件强化', id: 'lg_endless_boots', name: '无尽长靴', slots: ['feet', 'legs'], cls: 'chrono', modifier: {
      id: 'lg_endless_boots', name: '无尽长靴', source: 'equipment', priority: 20,
      desc: '沙影步冷却 -40%，瞬移距离 +3 米', match: { skillIds: ['sand_step'] },
      ops: [{ op: 'mul', stat: 'cooldown', value: -0.4 }, { op: 'add', stat: 'range', value: 3 }, { op: 'rename', prefix: '无尽' }] } },
  // v0.7.2
  { kind: '资源循环', id: 'lg_backflow', name: '倒流沙漏', slots: ['offHand'], cls: 'chrono', modifier: {
      id: 'lg_backflow', name: '倒流沙漏', source: 'equipment', priority: 20,
      desc: '回溯冷却 -4 秒；回溯后回 1 格时砂', match: { skillIds: ['__none'] }, ops: [] } },
  { kind: '条件强化', id: 'lg_keeper_hood', name: '守时者兜帽', slots: ['head'], cls: 'chrono', modifier: {
      id: 'lg_keeper_hood', name: '守时者兜帽', source: 'equipment', priority: 20,
      desc: '时痕引爆后 2 秒内，你造成的伤害 +25%', match: { skillIds: ['__none'] }, ops: [] } },
  { kind: '召唤与地面', id: 'lg_echo_gauntlet', name: '残响护手', slots: ['hands', 'wrist'], cls: 'chrono', modifier: {
      id: 'lg_echo_gauntlet', name: '残响护手', source: 'equipment', priority: 20,
      desc: '回声伤害 +30%', match: { skillIds: ['__none'] }, ops: [] } },
  { kind: '连锁触发', id: 'lg_final_moment', name: '终末之刻', slots: ['chest', 'shoulder'], cls: 'chrono', modifier: {
      id: 'lg_final_moment', name: '终末之刻', source: 'equipment', priority: 20,
      desc: '终刻期间每次暴击让时停延长 0.2 秒（最多 +1.5 秒）', match: { skillIds: ['final_moment'] }, ops: [{ op: 'rename', prefix: '终末' }] } },
];

// ---------- 时砂行者专属词条 ----------
export const CHRONO_AFFIXES: AffixDef[] = [
  { id: 'a_power_c', kind: 'char', cls: 'chrono', text: '攻击强度 +{v}', slots: ['oneHand', 'twoHand', 'offHand', 'neck', 'ring', 'trinket'], weight: 8, stat: 'power', min: 3, max: 8 },
  { id: 'a_spin', kind: 'skill', cls: 'chrono', text: '千刃回旋伤害 +{v}%', slots: ['legs', 'trinket', 'head', 'offHand', 'hands'], weight: 6, stat: 'damage', op: 'mul', min: 0.12, max: 0.25, match: { skillIds: ['blade_spin'] } },
  { id: 'a_throw_slow', kind: 'effect', cls: 'chrono', text: '时轮投掷命中减速 25%（2 秒）', slots: ['oneHand', 'offHand'], weight: 3, minQuality: 'purple',
    effect: { type: 'slow', percent: 0.25, duration: 2 }, match: { skillIds: ['chrono_throw'] } },
  { id: 'a_stasis_dur', kind: 'effect', cls: 'chrono', text: '停滞之刻定身时间 +1 秒', slots: ['legs', 'chest', 'feet'], weight: 3, minQuality: 'purple',
    effect: { type: 'stun', duration: 2.5 }, match: { skillIds: ['stasis'] } },
];
