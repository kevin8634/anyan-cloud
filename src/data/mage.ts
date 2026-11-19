// 法师职业（原创内容）：远程施法，火焰 / 冰霜 / 奥术三系
// 普攻：奥能弹（投射物）；技能1 烈焰弹（投射物 + 灼烧 + 小范围爆炸）；技能2 霜环（自身周围冻结）
// 技能3 奥术禁锢（远程单体：打断读条 + 眩晕）；大招 陨星坠落（以目标为圆心的大范围火焰 + 燃烧地面）
// 标签约定：ranged = 远程（表现层发射投射物）；targeted = 范围技能以目标为圆心
import { SkillDef, ModifierDef } from '../core/types';
import { LegendaryPower, AffixDef } from '../core/Loot';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };

export const MAGE_SKILLS: Record<string, SkillDef> = {
  arcane_bolt: { id: 'arcane_bolt', name: '奥能弹', slot: 'basic', element: 'arcane', shape: 'projectile', tags: ['ranged', 'spell', 'bolt'],
    stats: { ...base, damage: 24, cooldown: 0.85, range: 14 }, effects: [] },
  flame_orb: { id: 'flame_orb', name: '烈焰弹', slot: 'skill1', element: 'fire', shape: 'projectile', tags: ['ranged', 'spell', 'bolt', 'fire'],
    stats: { ...base, damage: 62, cooldown: 5, range: 16 },
    effects: [{ type: 'dot', element: 'fire', dps: 7, duration: 4 }, { type: 'explode', radius: 2.5, damagePercent: 0.5 }] },
  frost_ring: { id: 'frost_ring', name: '霜环', slot: 'skill2', element: 'frost', shape: 'circle', tags: ['spell', 'aoe', 'nova', 'frost'],
    stats: { ...base, damage: 38, cooldown: 9, radius: 5, range: 0 },
    effects: [{ type: 'stun', duration: 1.5 }, { type: 'slow', percent: 0.5, duration: 4 }] },
  arcane_bind: { id: 'arcane_bind', name: '奥术禁锢', slot: 'skill3', element: 'arcane', shape: 'single', tags: ['ranged', 'spell', 'control'],
    stats: { ...base, damage: 45, cooldown: 8, range: 16 },
    effects: [{ type: 'interrupt' }, { type: 'stun', duration: 1 }] },
  meteor: { id: 'meteor', name: '陨星坠落', slot: 'ultimate', element: 'fire', shape: 'circle', tags: ['spell', 'aoe', 'ultimate', 'targeted', 'fire'],
    stats: { ...base, damage: 175, cooldown: 45, radius: 5.5, range: 18 },
    effects: [{ type: 'groundZone', element: 'fire', dps: 14, radius: 3.5, duration: 4 }] },
};

// ---------- 技能组合 ----------
export const MAGE_COMBOS: ModifierDef[] = [
  { id: 'c_shatter', name: '碎冰', source: 'combo', desc: '霜环后 4 秒内释放烈焰弹：伤害 +60%', match: { skillIds: ['flame_orb'] }, priority: 60,
    conditions: [{ type: 'recentCast', skillId: 'frost_ring', within: 4 }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.6 }, { op: 'rename', prefix: '碎冰' }] },
  { id: 'c_bind_meteor', name: '星坠', source: 'combo', desc: '奥术禁锢后 5 秒内释放大招：范围 +30%', match: { slots: ['ultimate'] },
    conditions: [{ type: 'recentCast', skillId: 'arcane_bind', within: 5 }],
    ops: [{ op: 'mul', stat: 'radius', value: 0.3 }] },
];

// ---------- 传说特效（只掉给法师）：把技能变成另一种形态 ----------
export const MAGE_LEGENDARIES: LegendaryPower[] = [
  { kind: '条件强化', id: 'lg_frostfire', name: '霜火法珠', slots: ['trinket', 'offHand'], cls: 'mage', modifier: {
      id: 'lg_frostfire', name: '霜火法珠', source: 'equipment', priority: 15,
      desc: '烈焰弹变为冰霜伤害，命中减速 30%；同一目标叠 3 次冻结 1 秒（首领只打断）', match: { skillIds: ['flame_orb'] },
      ops: [{ op: 'setElement', value: 'frost' }, { op: 'addTag', value: 'frost' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 3 } }, { op: 'addEffect', effect: { type: 'stackStun', stacks: 3, duration: 1, name: '冻结' } }, { op: 'rename', prefix: '霜火' }] } },
  { kind: '形态变换', id: 'lg_split_staff', name: '裂光法杖', slots: ['twoHand', 'oneHand'], cls: 'mage', modifier: {
      id: 'lg_split_staff', name: '裂光法杖', source: 'equipment', priority: 20,
      desc: '奥能弹分裂为 3 发，每发伤害 -35%；每第 3 次施放必定暴击', match: { skillIds: ['arcane_bolt'] },
      ops: [{ op: 'add', stat: 'projectileCount', value: 2 }, { op: 'mul', stat: 'damage', value: -0.35 }, { op: 'addEffect', effect: { type: 'critEvery', n: 3 } }, { op: 'rename', prefix: '裂光' }] } },
  { kind: '召唤与地面', id: 'lg_ember_robe', name: '余烬长袍', slots: ['chest'], cls: 'mage', modifier: {
      id: 'lg_ember_robe', name: '余烬长袍', source: 'equipment', priority: 15,
      desc: '霜环变为火焰新星，并留下燃烧地面', match: { skillIds: ['frost_ring'] },
      ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' }, { op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 10, radius: 4, duration: 4 } }, { op: 'rename', prefix: '炎环·' }] } },
  { kind: '形态变换', id: 'lg_astral_legs', name: '星界护腿', slots: ['legs'], cls: 'mage', modifier: {
      id: 'lg_astral_legs', name: '星界护腿', source: 'equipment', priority: 20,
      desc: '奥术禁锢变为以目标为中心的范围禁锢（半径 4 米）', match: { skillIds: ['arcane_bind'] },
      ops: [{ op: 'setShape', value: 'circle' }, { op: 'addTag', value: 'aoe' }, { op: 'addTag', value: 'targeted' }, { op: 'add', stat: 'radius', value: 4 }, { op: 'rename', prefix: '星界' }] } },
];

// ---------- 法师专属词条 ----------
export const MAGE_AFFIXES: AffixDef[] = [
  { id: 'a_orb', kind: 'skill', cls: 'mage', text: '烈焰弹伤害 +{v}%', slots: ['legs', 'trinket', 'head', 'offHand', 'hands'], weight: 6, stat: 'damage', op: 'mul', min: 0.12, max: 0.25, match: { skillIds: ['flame_orb'] } },
  { id: 'a_bolt_chill', kind: 'effect', cls: 'mage', text: '奥能弹命中减速 25%（2 秒）', slots: ['oneHand', 'twoHand', 'offHand'], weight: 3, minQuality: 'purple',
    effect: { type: 'slow', percent: 0.25, duration: 2 }, match: { skillIds: ['arcane_bolt'] } },
  { id: 'a_ring_dur', kind: 'effect', cls: 'mage', text: '霜环冻结时间 +1 秒', slots: ['legs', 'chest', 'feet'], weight: 3, minQuality: 'purple',
    effect: { type: 'stun', duration: 2.5 }, match: { skillIds: ['frost_ring'] } },
];
