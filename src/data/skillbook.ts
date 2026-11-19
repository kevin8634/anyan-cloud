// ========== v0.6.8：技能书 + 符文（数据） ==========
// 每个技能槽 3 选 1：A = 原来的技能（开局就会），B / C 要学技能书。
//   战士：位移 冲锋/英勇跳跃/盾牌突进；范围 旋风斩/顺劈斩/地震波；控制 雷霆一击/震荡波/战吼；大招 天神下凡/剑刃风暴/战旗
//   法师：主攻 烈焰弹/冰枪/闪电链；范围 霜环/烈焰新星/暴风雪；控制 奥术禁锢/闪现/时间缓滞；大招 陨星坠落/冰河时代/奥术风暴
// 每个技能 3 枚符文：熟练度 100 / 300 / 600 解锁，同一时间只能装 1 枚，营地里免费切换。符文本身就是修饰器（source 'rune'，priority 40）。
// 熟练度：每次施放 +max(1, round(冷却 / 5))（大招一次 +10 左右，短冷却技能 +1~2）。
import { SkillDef, ModifierDef, SlotId, Element, EffectDef, ModOp } from '../core/types';
import { SKILL4, RUNES_V078 } from './skills_v078';
import { withPacks } from '../core/ContentPacks';
import { ALT_SKILLS_V07, SLOT_CHOICES_V07, SLOT_ROLE_V07, RUNES_V07, PRESETS_V07 } from './skillbook_v07';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const S = (id: string, name: string, slot: SlotId, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string): SkillDef & { desc: string } =>
  ({ id, name, slot, element, shape, tags, stats: { ...base, ...stats }, effects, desc });

/** 新技能（技能书学会） */
export const ALT_SKILLS: Record<'warrior' | 'mage' | 'chrono' | 'alchemy', (SkillDef & { desc: string })[]> = {
  ...ALT_SKILLS_V07,   // v0.7.4-br.A 新职业
  warrior: [
    S('heroic_leap', '英勇跳跃', 'skill1', 'physical', 'dash', ['melee', 'movement', 'leap', 'aoe', 'slam'], { damage: 40, cooldown: 10, range: 14 },
      [{ type: 'stun', duration: 0.5 }, { type: 'explode', radius: 4, damagePercent: 0.6 }, { type: 'slow', percent: 0.5, duration: 3 }], '跃向目标，落地震击周围 4 米，减速 50% 持续 3 秒（可打断）'),   // v1.2.73 报告 5.2：3.5 米/30%/2 秒 → 4 米/50%/3 秒
    S('shield_rush', '盾牌突进', 'skill1', 'physical', 'dash', ['melee', 'movement', 'shield'], { damage: 26, cooldown: 7, range: 10 },
      [{ type: 'interrupt' }, { type: 'stun', duration: 0.8 }, { type: 'reflect', reduce: 0.2, percent: 0.1, duration: 4 }], '冷却短的突进，打断并获得 4 秒减伤'),
    S('cleave', '顺劈斩', 'skill2', 'physical', 'cone', ['melee', 'aoe', 'cleave'], { damage: 52, cooldown: 5, radius: 5, range: 4 },
      [{ type: 'dot', element: 'physical', dps: 5, duration: 4 }], '向前方扇形横扫，附带流血'),
    S('quake', '地震波', 'skill2', 'nature', 'line', ['aoe', 'slam', 'line'], { damage: 58, cooldown: 7, radius: 2, range: 12 },
      [{ type: 'stun', duration: 0.6 }], '一道向前推进的地裂，直线上的敌人都会被震晕'),
    S('shockwave', '震荡波', 'skill3', 'nature', 'cone', ['aoe', 'slam', 'control'], { damage: 40, cooldown: 10, radius: 7, range: 7 },
      [{ type: 'interrupt' }, { type: 'stun', duration: 1.5 }], '前方大扇形震晕 1.5 秒（可打断）'),
    S('battle_shout', '战吼', 'skill3', 'physical', 'circle', ['aoe', 'shout', 'control'], { damage: 20, cooldown: 14, radius: 7 },
      [{ type: 'stun', duration: 1.2 }, { type: 'reflect', reduce: 0.25, percent: 0, duration: 6 }], '震慑周围敌人，自己 6 秒内受到伤害 -25%'),
    S('bladestorm', '剑刃风暴', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'spin'], { damage: 120, cooldown: 50, radius: 5.5 },
      [{ type: 'dotStack', element: 'physical', dpsPerStack: 2, max: 5, duration: 4 }, { type: 'heal', percentOfDamage: 0.1 }], '引导 6 秒化身旋风：可以移动、不会被打断、不能翻滚，每 0.5 秒伤害身边敌人并叠 1 层流血（最多 5 层），把周围敌人缓缓卷向自己，结束时爆发一击，造成伤害的 10% 回复生命'),   // v1.2.73 报告 5.2：每跳叠流血（每层 2/秒，满层 10/秒，4 秒）+ 吸怪 0.5 米/秒；原收尾一次 20/秒×4 秒
    S('war_banner', '战旗', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'banner', 'slam'], { damage: 100, cooldown: 55, radius: 7 },
      [{ type: 'groundZone', element: 'physical', dps: 18, radius: 5, duration: 8 }, { type: 'reflect', reduce: 0.3, percent: 0.15, duration: 8 }], '插下战旗：周围持续伤害 8 秒，期间受到伤害 -30% 并反弹 15%'),
  ],
  mage: [
    S('ice_lance', '冰枪', 'skill1', 'frost', 'projectile', ['ranged', 'spell', 'bolt', 'frost'], { damage: 55, cooldown: 4, range: 18 },
      [{ type: 'slow', percent: 0.4, duration: 3 }], '冷却短的冰霜弹体，命中减速 40%'),
    S('chain_lightning', '闪电链', 'skill1', 'nature', 'single', ['ranged', 'spell', 'chain'], { damage: 48, cooldown: 6, range: 16 },
      [{ type: 'chain', jumps: 3, radius: 6, damagePercent: 0.75 }], '弹射 3 次的闪电，适合打一群'),
    S('flame_nova', '烈焰新星', 'skill2', 'fire', 'circle', ['spell', 'aoe', 'nova', 'fire'], { damage: 46, cooldown: 8, radius: 5 },
      [{ type: 'dot', element: 'fire', dps: 8, duration: 4 }, { type: 'knockback', distance: 2 }], '以自己为中心的火焰爆发，灼烧并击退'),
    S('blizzard', '暴风雪', 'skill2', 'frost', 'circle', ['spell', 'aoe', 'targeted', 'frost'], { damage: 30, cooldown: 12, radius: 5, range: 16 },
      [{ type: 'groundZone', element: 'frost', dps: 7.5, radius: 5, duration: 8, slowPerTick: 0.2, slowMax: 0.6, freezeTick: 4, freezeDur: 1.5 }, { type: 'slow', percent: 0.2, duration: 1.6 }], '瞬发：目标处卷起 8 秒暴风雪，每秒 7.5 点伤害（共 60 点）并逐跳加深减速（每跳 +20%，最多 60%），在风雪中挨到第 4 跳冻结 1.5 秒（首领只打断）'),   // v1.2.73 报告 5.2：5 秒/固定减速 50% → 8 秒/叠减速/第 4 跳冻结；11-04 Rhett：每秒 12 → 7.5（8 秒合计 96 → 60）
    S('blink', '闪现', 'skill3', 'arcane', 'dash', ['spell', 'movement', 'blink', 'control'], { damage: 30, cooldown: 10, radius: 3, range: 8 },
      [{ type: 'interrupt' }, { type: 'stun', duration: 0.8 }], '原地留下奥术爆炸（打断 + 眩晕），朝方向键方向（没按方向 = 面朝方向）闪现 8 米，不需要目标'),
    S('time_warp', '时间缓滞', 'skill3', 'arcane', 'circle', ['ranged', 'spell', 'targeted', 'control'], { damage: 30, cooldown: 12, radius: 4.5, range: 16 },
      [{ type: 'interrupt' }, { type: 'slow', percent: 0.7, duration: 4 }], '目标处时间变慢：打断读条，减速 70%'),
    S('ice_age', '冰河时代', 'ultimate', 'frost', 'circle', ['spell', 'aoe', 'ultimate', 'frost'], { damage: 160, cooldown: 50, radius: 7 },
      [{ type: 'stun', duration: 2.5 }, { type: 'slow', percent: 0.5, duration: 5 }], '冻结周围 7 米 2.5 秒'),
    S('arcane_storm', '奥术风暴', 'ultimate', 'arcane', 'circle', ['spell', 'aoe', 'ultimate', 'targeted'], { damage: 140, cooldown: 45, radius: 6, range: 18 },
      [{ type: 'chain', jumps: 4, radius: 8, damagePercent: 0.5 }, { type: 'groundZone', element: 'arcane', dps: 80 / 6, radius: 6, duration: 6 }], '目标处奥术爆发，弹射 4 次并留下 6 秒奥术场（半径 6 米）'),   // v1.2.73 Rhett 11-02 22:01：伤害区与表现对齐 6 秒/半径 6，总伤不变（16×5 = 80 → 80/6 每秒）
  ],
};

/** 每个槽位的 3 个选项（第 1 个 = 原技能） */
export const SLOT_CHOICES: Record<'warrior' | 'mage' | 'chrono' | 'alchemy', Partial<Record<SlotId, string[]>>> = {
  ...SLOT_CHOICES_V07,
  warrior: { skill1: ['charge', 'heroic_leap', 'shield_rush'], skill2: ['whirlwind', 'cleave', 'quake'], skill3: ['thunderclap', 'shockwave', 'battle_shout'], ultimate: ['avatar', 'bladestorm', 'war_banner'] },
  mage: { skill1: ['flame_orb', 'ice_lance', 'chain_lightning'], skill2: ['frost_ring', 'flame_nova', 'blizzard'], skill3: ['arcane_bind', 'blink', 'time_warp'], ultimate: ['meteor', 'ice_age', 'arcane_storm'] },
};
export const SLOT_ROLE: Record<'warrior' | 'mage' | 'chrono' | 'alchemy', Partial<Record<SlotId, string>>> = {
  ...SLOT_ROLE_V07,
  warrior: { skill1: '位移', skill2: '范围', skill3: '控制', ultimate: '大招' },
  mage: { skill1: '主攻', skill2: '范围', skill3: '控制', ultimate: '大招' },
};

// ---------------- 符文 ----------------
export interface RuneDef { id: string; skillId: string; name: string; desc: string; need: number; element?: Element; modifier: ModifierDef }
export const RUNE_NEED = [100, 300, 600];
const R = (skillId: string, i: number, name: string, desc: string, ops: ModOp[], element?: Element): RuneDef => ({
  id: `r_${skillId}_${i + 1}`, skillId, name, desc, need: RUNE_NEED[i], element,
  modifier: { id: `r_${skillId}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [skillId] }, priority: 40, ops },
});
const el = (e: Element, prefix: string): ModOp[] => [{ op: 'setElement', value: e }, { op: 'rename', prefix }];
const mul = (stat: 'damage' | 'cooldown' | 'radius' | 'range', value: number): ModOp => ({ op: 'mul', stat, value });
const fx = (effect: EffectDef): ModOp => ({ op: 'addEffect', effect });

export const RUNES: RuneDef[] = [
  // ---- 战士
  R('charge', 0, '烈焰冲锋', '变为火焰：留下 3 秒燃烧地面', [...el('fire', '烈焰'), fx({ type: 'groundZone', element: 'fire', dps: 10, radius: 2.5, duration: 3 })], 'fire'),
  R('charge', 1, '连环冲锋', '冷却 -35%', [mul('cooldown', -0.35)]),
  R('charge', 2, '破阵', '落地爆炸，对周围造成 70% 伤害', [fx({ type: 'explode', radius: 3, damagePercent: 0.7 })]),
  R('heroic_leap', 0, '寒霜着陆', '变为冰霜：落地减速 60%', [...el('frost', '寒霜'), fx({ type: 'slow', percent: 0.6, duration: 3 })], 'frost'),
  R('heroic_leap', 1, '远跃', '距离 +40%，冷却 -20%', [mul('range', 0.4), mul('cooldown', -0.2)]),
  R('heroic_leap', 2, '陨地', '伤害 +80%，眩晕 1.5 秒', [mul('damage', 0.8), fx({ type: 'stun', duration: 1.5 })]),
  R('shield_rush', 0, '圣盾', '变为神圣：减伤提升到 35%', [...el('holy', '圣光'), fx({ type: 'reflect', reduce: 0.35, percent: 0.1, duration: 4 })], 'holy'),
  R('shield_rush', 1, '回旋盾', '20% 几率重置冷却', [fx({ type: 'resetCooldown', slot: 'skill1', chance: 0.2 })]),
  R('shield_rush', 2, '铁壁', '反弹 30% 伤害，持续 6 秒', [fx({ type: 'reflect', reduce: 0.2, percent: 0.3, duration: 6 })]),
  R('whirlwind', 0, '烈焰旋风', '变为火焰：附带灼烧', [...el('fire', '烈焰'), fx({ type: 'dot', element: 'fire', dps: 8, duration: 4 })], 'fire'),
  R('whirlwind', 1, '龙卷', '范围 +35%', [mul('radius', 0.35)]),
  R('whirlwind', 2, '嗜血旋风', '造成伤害的 12% 回复生命', [fx({ type: 'heal', percentOfDamage: 0.12 })]),
  R('cleave', 0, '寒刃', '变为冰霜：减速 40%', [...el('frost', '寒刃'), fx({ type: 'slow', percent: 0.4, duration: 3 })], 'frost'),
  R('cleave', 1, '大开大合', '扇形范围 +40%', [mul('radius', 0.4)]),
  R('cleave', 2, '处决', '伤害 +45%', [mul('damage', 0.45)]),
  R('quake', 0, '熔岩裂隙', '变为火焰：地裂处留下燃烧地面', [...el('fire', '熔岩'), fx({ type: 'groundZone', element: 'fire', dps: 12, radius: 2, duration: 4 })], 'fire'),
  R('quake', 1, '长裂', '距离 +50%', [mul('range', 0.5)]),
  R('quake', 2, '崩山', '伤害 +60%，眩晕 1.2 秒', [mul('damage', 0.6), fx({ type: 'stun', duration: 1.2 })]),
  R('thunderclap', 0, '寒霜之踏', '变为冰霜：减速提高到 60%', [...el('frost', '寒霜'), fx({ type: 'slow', percent: 0.6, duration: 3 })], 'frost'),
  R('thunderclap', 1, '雷鸣', '范围 +30%，冷却 -20%', [mul('radius', 0.3), mul('cooldown', -0.2)]),
  R('thunderclap', 2, '雷暴', '闪电弹射 3 次', [fx({ type: 'chain', jumps: 3, radius: 6, damagePercent: 0.6 })]),
  R('shockwave', 0, '暗影震荡', '变为暗影：附带腐蚀', [...el('shadow', '暗影'), fx({ type: 'dot', element: 'shadow', dps: 9, duration: 4 })], 'shadow'),
  R('shockwave', 1, '宽波', '扇形 +35%', [mul('radius', 0.35)]),
  R('shockwave', 2, '余震', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('battle_shout', 0, '圣言', '变为神圣：造成伤害的 30% 回复生命', [...el('holy', '圣言'), fx({ type: 'heal', percentOfDamage: 0.3 })], 'holy'),
  R('battle_shout', 1, '咆哮', '范围 +40%', [mul('radius', 0.4)]),
  R('battle_shout', 2, '不屈', '减伤提升到 40%，持续 8 秒', [fx({ type: 'reflect', reduce: 0.4, percent: 0, duration: 8 })]),
  R('avatar', 0, '炎神', '变为火焰：落地留下燃烧地面', [...el('fire', '炎神'), fx({ type: 'groundZone', element: 'fire', dps: 20, radius: 4, duration: 5 })], 'fire'),
  R('avatar', 1, '巨像', '范围 +30%', [mul('radius', 0.3)]),
  R('avatar', 2, '神威', '冷却 -25%', [mul('cooldown', -0.25)]),
  R('bladestorm', 0, '烈风', '变为自然：附带减速', [...el('nature', '烈风'), fx({ type: 'slow', percent: 0.4, duration: 3 })], 'nature'),
  R('bladestorm', 1, '刃海', '范围 +30%', [mul('radius', 0.3)]),
  R('bladestorm', 2, '血战', '吸血提高到 25%', [fx({ type: 'heal', percentOfDamage: 0.15 })]),
  R('war_banner', 0, '圣旗', '变为神圣：插旗时造成伤害的 25% 回复生命', [...el('holy', '圣旗'), fx({ type: 'heal', percentOfDamage: 0.25 })], 'holy'),
  R('war_banner', 1, '军势', '范围 +30%', [mul('radius', 0.3)]),
  R('war_banner', 2, '号令', '冷却 -25%', [mul('cooldown', -0.25)]),
  // ---- 法师
  R('flame_orb', 0, '霜火弹', '变为冰霜：减速 40%', [...el('frost', '霜火'), fx({ type: 'slow', percent: 0.4, duration: 3 })], 'frost'),
  R('flame_orb', 1, '三连弹', '一次发射 3 枚（每枚伤害 -40%）', [{ op: 'add', stat: 'projectileCount', value: 2 }, mul('damage', -0.4)]),
  R('flame_orb', 2, '炎爆', '爆炸范围 +60%，伤害 +30%', [fx({ type: 'explode', radius: 4, damagePercent: 0.5 }), mul('damage', 0.3)]),
  R('ice_lance', 0, '雷枪', '变为自然：弹射 2 次', [...el('nature', '雷'), fx({ type: 'chain', jumps: 2, radius: 6, damagePercent: 0.6 })], 'nature'),
  R('ice_lance', 1, '冰刺齐射', '一次发射 2 枚', [{ op: 'add', stat: 'projectileCount', value: 1 }, mul('damage', -0.2)]),
  R('ice_lance', 2, '碎冰', '对减速中的目标伤害 +60%', [mul('damage', 0.6)]),
  R('chain_lightning', 0, '火链', '变为火焰：附带灼烧', [...el('fire', '火'), fx({ type: 'dot', element: 'fire', dps: 7, duration: 4 })], 'fire'),
  R('chain_lightning', 1, '长链', '多弹射 3 次', [fx({ type: 'chain', jumps: 3, radius: 6, damagePercent: 0.6 })]),
  R('chain_lightning', 2, '雷击', '伤害 +40%，冷却 -20%', [mul('damage', 0.4), mul('cooldown', -0.2)]),
  R('frost_ring', 0, '炎环', '变为火焰：附带灼烧', [...el('fire', '炎'), fx({ type: 'dot', element: 'fire', dps: 9, duration: 4 })], 'fire'),
  R('frost_ring', 1, '冰川', '范围 +35%', [mul('radius', 0.35)]),
  R('frost_ring', 2, '永冻', '冻结时间 +1 秒', [fx({ type: 'stun', duration: 2.5 })]),
  R('flame_nova', 0, '霜爆', '变为冰霜：冻结 1 秒', [...el('frost', '霜'), fx({ type: 'stun', duration: 1 })], 'frost'),
  R('flame_nova', 1, '烈日', '范围 +35%', [mul('radius', 0.35)]),
  R('flame_nova', 2, '焚身', '伤害 +50%', [mul('damage', 0.5)]),
  R('blizzard', 0, '火雨', '变为火焰：持续伤害 +50%', [...el('fire', '火雨'), fx({ type: 'groundZone', element: 'fire', dps: 8, radius: 5, duration: 5 })], 'fire'),
  R('blizzard', 1, '大风雪', '范围 +30%', [mul('radius', 0.3)]),
  R('blizzard', 2, '冰封', '命中时冻结 1.5 秒', [fx({ type: 'stun', duration: 1.5 })]),
  R('arcane_bind', 0, '冰锁', '变为冰霜：减速 50%', [...el('frost', '冰'), fx({ type: 'slow', percent: 0.5, duration: 3 })], 'frost'),
  R('arcane_bind', 1, '速锁', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('arcane_bind', 2, '奥术涌动', '弹射 2 次（同样打断）', [fx({ type: 'chain', jumps: 2, radius: 6, damagePercent: 0.7 })]),
  R('blink', 0, '火焰闪现', '变为火焰：原地留下燃烧地面', [...el('fire', '火焰'), fx({ type: 'groundZone', element: 'fire', dps: 10, radius: 3, duration: 4 })], 'fire'),
  R('blink', 1, '瞬移', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('blink', 2, '奥术残影', '爆炸范围 +50%，眩晕 1.5 秒', [mul('radius', 0.5), fx({ type: 'stun', duration: 1.5 })]),
  R('time_warp', 0, '寒冬', '变为冰霜：冻结 1 秒', [...el('frost', '寒冬'), fx({ type: 'stun', duration: 1 })], 'frost'),
  R('time_warp', 1, '时域', '范围 +40%', [mul('radius', 0.4)]),
  R('time_warp', 2, '时停', '冷却 -30%，伤害 +50%', [mul('cooldown', -0.3), mul('damage', 0.5)]),
  R('meteor', 0, '冰陨', '变为冰霜：冻结 1.5 秒', [...el('frost', '冰陨'), fx({ type: 'stun', duration: 1.5 })], 'frost'),
  R('meteor', 1, '流星群', '范围 +30%', [mul('radius', 0.3)]),
  R('meteor', 2, '天火', '冷却 -25%', [mul('cooldown', -0.25)]),
  R('ice_age', 0, '炎河', '变为火焰：附带灼烧', [...el('fire', '炎河'), fx({ type: 'dot', element: 'fire', dps: 18, duration: 5 })], 'fire'),
  R('ice_age', 1, '极地', '范围 +25%', [mul('radius', 0.25)]),
  R('ice_age', 2, '万古冰封', '冷却 -25%', [mul('cooldown', -0.25)]),
  R('arcane_storm', 0, '雷暴', '变为自然：多弹射 2 次', [...el('nature', '雷'), fx({ type: 'chain', jumps: 2, radius: 8, damagePercent: 0.6 })], 'nature'),
  R('arcane_storm', 1, '星海', '范围 +30%', [mul('radius', 0.3)]),
  R('arcane_storm', 2, '奥能过载', '冷却 -25%', [mul('cooldown', -0.25)]),
];

/** 流派推荐卡：一键套用技能 + 符文（没学会的技能 / 没解锁的符文会跳过并提示） */
export interface PresetDef { id: string; cls: string; name: string; desc: string; skills: Partial<Record<SlotId, string>>; runes: Record<string, string> }
export const PRESETS: PresetDef[] = [
  { id: 'p_w_classic', cls: 'warrior', name: '经典旋风', desc: '冲锋切入 + 旋风斩清场，上手最简单', skills: { skill1: 'charge', skill2: 'whirlwind', skill3: 'thunderclap', ultimate: 'avatar' }, runes: { whirlwind: 'r_whirlwind_3', charge: 'r_charge_3' } },
  { id: 'p_w_fire', cls: 'warrior', name: '烈焰战士', desc: '火焰符文叠满，配合火元素共鸣', skills: { skill1: 'charge', skill2: 'quake', skill3: 'thunderclap', ultimate: 'avatar' }, runes: { charge: 'r_charge_1', quake: 'r_quake_1', avatar: 'r_avatar_1' } },
  { id: 'p_w_tank', cls: 'warrior', name: '铁壁', desc: '盾牌突进 + 战吼 + 战旗，减伤和反弹', skills: { skill1: 'shield_rush', skill2: 'cleave', skill3: 'battle_shout', ultimate: 'war_banner' }, runes: { shield_rush: 'r_shield_rush_3', battle_shout: 'r_battle_shout_3' } },
  { id: 'p_m_classic', cls: 'mage', name: '烈焰法师', desc: '烈焰弹 + 霜环 + 陨星，原汁原味', skills: { skill1: 'flame_orb', skill2: 'frost_ring', skill3: 'arcane_bind', ultimate: 'meteor' }, runes: { flame_orb: 'r_flame_orb_2' } },
  { id: 'p_m_frost', cls: 'mage', name: '冰霜控场', desc: '冰枪 + 暴风雪 + 冰河时代，全程减速冻结', skills: { skill1: 'ice_lance', skill2: 'blizzard', skill3: 'time_warp', ultimate: 'ice_age' }, runes: { blizzard: 'r_blizzard_3', time_warp: 'r_time_warp_1' } },
  { id: 'p_m_storm', cls: 'mage', name: '雷霆风暴', desc: '闪电链 + 奥术风暴，专打成群的怪', skills: { skill1: 'chain_lightning', skill2: 'flame_nova', skill3: 'blink', ultimate: 'arcane_storm' }, runes: { chain_lightning: 'r_chain_lightning_2', arcane_storm: 'r_arcane_storm_1' } },
];

/** 书页 / 自选技能书（可堆叠物品，放在 inventory.stacks） */
export const PAGE_ID = 'tome_page';
export const TOME_ID = 'tome_any';
export const PAGES_PER_TOME = 5;
/** 10 / 20 / 30 级各送 1 本自选技能书 */
export const TOME_LEVELS = [10, 20, 30];
/** 掉落：副本首领 / 长副本首领 / 野外首领 / 稀有首领 —— 指定技能书几率 + 书页数量 */
export const BOOK_DROP: Record<'dungeon' | 'raid' | 'elite' | 'rare', { book: number; pages: [number, number] }> = {
  dungeon: { book: 0.08, pages: [1, 2] }, raid: { book: 0.15, pages: [2, 3] }, elite: { book: 0.1, pages: [1, 2] }, rare: { book: 0.12, pages: [1, 3] },
};

// 碎冰：只对减速中的目标生效
{ const r = RUNES.find(x => x.id === 'r_ice_lance_3')!; r.modifier.conditions = [{ type: 'targetHasEffect', effect: 'slow' }]; }

// v0.7.4-br.A：新职业符文 / 推荐卡
RUNES.push(...RUNES_V07);
// v0.7.8：25 / 30 级新技能（第 4 槽「绝技」）
for (const c of ['warrior', 'mage', 'chrono', 'alchemy'] as const) {
  ALT_SKILLS[c].push(...SKILL4[c]);
  SLOT_CHOICES[c] = { ...SLOT_CHOICES[c], skill4: SKILL4[c].map(s => s.id) };
  SLOT_ROLE[c] = { ...SLOT_ROLE[c], skill4: '绝技' };
}
RUNES.push(...RUNES_V078);

// v1.0.1：内容包技能（扩展天赋层的终极天赋学会；没有包 = 空，本体不变）
export type PackSkillDef = SkillDef & { cls: string; desc: string };
export const PACK_SKILLS: PackSkillDef[] = withPacks<PackSkillDef>([], 'skills');
/** 只能由扩展天赋学会的技能（自选技能书 / 书页不能学） */
export const TALENT_ONLY_SKILLS: ReadonlySet<string> = new Set(PACK_SKILLS.map(s => s.id));
for (const ps of PACK_SKILLS) {
  const c = ps.cls as keyof typeof ALT_SKILLS;
  if (!ALT_SKILLS[c]) continue;
  ALT_SKILLS[c].push(ps);
  const cur = SLOT_CHOICES[c][ps.slot] ?? [];
  SLOT_CHOICES[c] = { ...SLOT_CHOICES[c], [ps.slot]: [...cur, ps.id] };
  const RN = (i: number, name: string, desc: string, ops: ModOp[]): RuneDef => ({ id: `r_${ps.id}_${i + 1}`, skillId: ps.id, name, desc, need: [100, 300, 600][i],
    modifier: { id: `r_${ps.id}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [ps.id] }, priority: 40, ops } as ModifierDef });
  RUNES.push(RN(0, '强击', '伤害 +25%', [{ op: 'mul', stat: 'damage', value: 0.25 }]), RN(1, '迅捷', '冷却 -20%', [{ op: 'mul', stat: 'cooldown', value: -0.2 }]),
    ps.stats.radius > 0 ? RN(2, '扩张', '范围 +30%，伤害 +10%', [{ op: 'mul', stat: 'radius', value: 0.3 }, { op: 'mul', stat: 'damage', value: 0.1 }])
      : RN(2, '穿透', '命中后小范围爆炸（40% 伤害）', [{ op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.4 } }]));
}
PRESETS.push(...PRESETS_V07);
