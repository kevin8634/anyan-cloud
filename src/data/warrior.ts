// 示例数据：战士职业。正式项目里这些可以放 JSON 配置表，结构完全一样。
import { SkillDef, ModifierDef } from '../core/types';
import { TalentNode, ItemDef, SetBonus } from '../core/Loadout';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };

export const SKILLS: Record<string, SkillDef> = {
  slash: { id: 'slash', name: '英勇打击', slot: 'basic', element: 'physical', shape: 'single', tags: ['melee', 'weapon'],
    stats: { ...base, damage: 20, cooldown: 0.8 }, effects: [{ type: 'dot', element: 'physical', dps: 3, duration: 4 }] },   // v0.9.1l 持续伤害普及：流血
  charge: { id: 'charge', name: '冲锋', slot: 'skill1', element: 'physical', shape: 'dash', tags: ['melee', 'movement'],
    stats: { ...base, damage: 30, cooldown: 8, range: 12 }, effects: [{ type: 'stun', duration: 1 }, { type: 'dot', element: 'physical', dps: 5, duration: 4 }] },
  whirlwind: { id: 'whirlwind', name: '旋风斩', slot: 'skill2', element: 'physical', shape: 'circle', tags: ['melee', 'aoe', 'spin'],
    stats: { ...base, damage: 45, cooldown: 6, radius: 4, cost: 20 }, effects: [{ type: 'dot', element: 'physical', dps: 6, duration: 4 }] },
  thunderclap: { id: 'thunderclap', name: '雷霆一击', slot: 'skill3', element: 'nature', shape: 'circle', tags: ['aoe', 'slam'],
    stats: { ...base, damage: 35, cooldown: 10, radius: 5 }, effects: [{ type: 'slow', percent: 0.3, duration: 3 }] },
  avatar: { id: 'avatar', name: '天神下凡', slot: 'ultimate', element: 'physical', shape: 'circle', tags: ['aoe', 'ultimate', 'slam'],
    stats: { ...base, damage: 150, cooldown: 60, radius: 6 }, effects: [{ type: 'knockback', distance: 3 }] },
};

// ---------- 天赋：每层三选一，这里列出可选项 ----------
export const TALENTS: TalentNode[] = [
  { id: 't_flame_blade', tier: 1, modifier: { id: 't_flame_blade', name: '烈焰之刃', source: 'talent',
      desc: '近战技能变为火焰伤害，命中附加3秒灼烧', match: { tagsAny: ['melee'] }, priority: 10,
      ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' },
            { op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 5, duration: 3 } }] } },
  { id: 't_scorched_earth', tier: 2, modifier: { id: 't_scorched_earth', name: '焦土', source: 'talent',
      desc: '火焰范围技能留下燃烧地面', match: { elements: ['fire'], tagsAll: ['aoe'] }, priority: 50,
      ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 8, radius: 3, duration: 4 } },
            { op: 'rename', suffix: '·焦土' }] } },
  { id: 't_last_stand', tier: 3, modifier: { id: 't_last_stand', name: '背水一战', source: 'talent',
      desc: '6 米内每有 1 个敌人，所有技能伤害 +8% 并吸血 3%（最多 5 个：+40%、吸血 15%）', match: {}, conditions: [{ type: 'stacks', key: 'near6', scale: true }],
      ops: [{ op: 'mul', stat: 'damage', value: 0.08 }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.03 } }] } },
];

// ---------- 装备 ----------
export const ITEMS: ItemDef[] = [
  { id: 'i_frost_core', name: '寒冰核心', slot: 'trinket', quality: 'orange', modifiers: [{
      id: 'i_frost_core', name: '寒冰核心', source: 'equipment', priority: 15, // 排在烈焰之刃(10)之后，所以冰霜覆盖火焰
      desc: '旋风斩变为冰霜伤害并减速，范围+50%', match: { skillIds: ['whirlwind'] },
      ops: [{ op: 'setElement', value: 'frost' }, { op: 'mul', stat: 'radius', value: 0.5 },
            { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2 } }, { op: 'rename', prefix: '冰霜' }] }] },
  { id: 'i_storm_axe', name: '风暴战斧', slot: 'oneHand', quality: 'orange', modifiers: [{
      id: 'i_storm_axe', name: '风暴战斧', source: 'equipment', priority: 20,
      desc: '冲锋变为投射物，掷出3把斧头，伤害-40%', match: { skillIds: ['charge'] },
      ops: [{ op: 'setShape', value: 'projectile' }, { op: 'add', stat: 'projectileCount', value: 2 },
            { op: 'mul', stat: 'damage', value: -0.4 }, { op: 'rename', prefix: '飞斧' }] }] },
  { id: 'i_helm', name: '狂怒头盔', slot: 'head', quality: 'purple', setId: 'set_fury', modifiers: [{
      id: 'i_helm', name: '狂怒头盔', source: 'equipment', desc: '技能冷却-10%', match: { slots: ['skill1', 'skill2', 'skill3'] },
      ops: [{ op: 'mul', stat: 'cooldown', value: -0.1 }] }] },
  { id: 'i_chest', name: '狂怒胸甲', slot: 'chest', quality: 'purple', setId: 'set_fury', modifiers: [] },
];

// v0.5 B：狂怒战魂老版本效果（只给命令行 demo / sim / Cocos 用；游戏里的 6 件套效果以 data/sets.ts FURY_SET_BONUSES 为准）
//   2 件：暴击率 +4%、急速 +3%（角色属性）
//   4 件：旋风斩变为「熔岩旋风」——火焰伤害、范围 +25%、留下熔岩地面，命中 25% 重置冲锋（原 2 件效果并入 4 件）
export const SET_BONUSES: SetBonus[] = [
  { setId: 'set_fury', pieces: 2, stats: { crit: 4, haste: 3 }, desc: '暴击率 +4%，急速 +3%' },
  { setId: 'set_fury', pieces: 4, desc: '旋风斩变为「熔岩旋风斩」：火焰伤害，范围 +25%，留下 4 秒熔岩地面，命中 25% 几率重置冲锋', modifier: {
      id: 'set_fury_4', name: '狂怒战魂(4件)', source: 'equipment', priority: 30,
      desc: '旋风斩变为熔岩旋风：火焰伤害，范围 +25%，留下熔岩地面，命中 25% 几率重置冲锋', match: { skillIds: ['whirlwind'] },
      ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' }, { op: 'addTag', value: 'fx_lava' }, { op: 'mul', stat: 'radius', value: 0.25 },
            { op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 12, radius: 3.5, duration: 4 } },
            { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.25 } }, { op: 'rename', prefix: '熔岩' }] } },
];

// ---------- 技能组合 ----------
export const COMBOS: ModifierDef[] = [
  { id: 'c_charge_whirl', name: '冲锋旋风', source: 'combo',
    desc: '冲锋后3秒内释放旋风斩：伤害+80%，并眩晕', match: { skillIds: ['whirlwind'] }, priority: 60,
    conditions: [{ type: 'recentCast', skillId: 'charge', within: 3 }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.8 }, { op: 'addEffect', effect: { type: 'stun', duration: 1 } },
          { op: 'rename', prefix: '狂暴' }] },
  { id: 'c_slam_ult', name: '震地连击', source: 'combo',
    desc: '5秒内用过震地类技能后，大招范围+30%', match: { slots: ['ultimate'] },
    conditions: [{ type: 'recentCast', tag: 'slam', within: 5 }],
    ops: [{ op: 'mul', stat: 'radius', value: 0.3 }] },
];
