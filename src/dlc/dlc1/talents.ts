// ======================================================================
// DLC1「沉钟之海」扩展天赋层（v1.0.1）
// Rhett 2026-10-22 定：31–40 级 5 个扩展天赋点（32/34/36/38/40 级），五层分别 1 / 2 / 1 / 2 / 3 个候选，每层只能选 1 个，
// 1 个天赋 = 1 点；第五层终极天赋 = DLC 新技能，学会后放进第 4 技能槽「绝技」（按 4），技能书里可与原绝技互换。
// 只 import core 的类型（见 manifest.ts 约定）。数值是初稿，整体平衡暂缓（Rhett 10-22）。
// ======================================================================
import type { PackTalentTierDef, PackTalentNodeDef } from '../../core/PackTalents';
import type { SkillDef, EffectDef, Element } from '../../core/types';
import { registerSkillSfx } from '../../web/audio';
import { D1_SFX, D1_SFX_MAP } from './sfx.gen';
registerSkillSfx(D1_SFX, D1_SFX_MAP);   // 1107：40 级绝技音效样本（tools/sfx/build.py）
import { addIcons } from '../../web/icons';
import { PACK_ICONS } from './icons.gen';
// fix1109c #1（Rhett 11-09 18:04：法师 / 战士 / 时砂 / 炼金的 40 级绝技没图标，显示通用图标）：12 张 sk_d1_*.jpg 一直在 icons/ 里、构建也打进了 icons.gen.ts，
//   但只有猎手 / 负棺人的职业定义（ext.art）把自己的 sk_hp_ / sk_cf_ 登记进图标表，前四职业是本体职业、没有 ext → sk_d1_* 从没登记，skillIcon / talentIcon 查不到回落通用图标。
//   这里在包加载时直接登记（addIcons 在样式表装好前后调用都行）
addIcons(Object.fromEntries(Object.entries(PACK_ICONS).filter(([k]) => k.startsWith('sk_d1_') || k.startsWith('pl_') || k.startsWith('it_'))));   // 11-13 I10：pl_* 写实模型头像；I11：it_glaive / it_bow / it_coffin 原来没登记，长柄和弓格子回退成通用剑图标

type PSkill = SkillDef & { cls: string; desc: string };
const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const S = (cls: string, id: string, name: string, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string): PSkill =>
  ({ cls, id, name, slot: 'skill4', element, shape, tags: [...tags, 'skill4', 'dlc_ult'], stats: { ...base, ...stats }, effects, desc });

export const DLC1_SKILLS: PSkill[] = [
  // 战士
  S('warrior', 'd1_tide_cleave', '怒潮裂斩', 'frost', 'line', ['melee', 'aoe', 'slam', 'line'], { damage: 150, cooldown: 14, radius: 3, range: 14 },
    [{ type: 'knockback', distance: 3 }, { type: 'slow', percent: 0.4, duration: 3 }, { type: 'groundZone', element: 'frost', dps: 18, radius: 3, duration: 4 }], '向前劈出一道潮浪：击退、减速 40%，留下 4 秒寒潮'),
  S('warrior', 'd1_bell_quake', '沉钟震地', 'physical', 'circle', ['melee', 'aoe', 'slam'], { damage: 135, cooldown: 16, radius: 7 },
    [{ type: 'stun', duration: 1.5 }, { type: 'stackStun', stacks: 3, duration: 1, name: '钟鸣' }], '巨锤如钟砸地：震晕 1.5 秒；同一敌人被震 3 次额外「钟鸣」眩晕'),
  S('warrior', 'd1_abyss_roar', '渊潮战吼', 'shadow', 'circle', ['aoe', 'shout'], { damage: 110, cooldown: 18, radius: 6 },
    [{ type: 'heal', percentOfDamage: 0.25, overflowShield: 0.15 }, { type: 'reflect', reduce: 0.25, percent: 0.15, duration: 6 }], '深渊回响的战吼：按伤害 25% 回血（溢出转护盾），6 秒受伤 -25% 并反弹 15%'),
  // 法师
  S('mage', 'd1_drown_orb', '溺光法球', 'frost', 'projectile', ['ranged', 'spell', 'bolt'], { damage: 160, cooldown: 14, range: 20, projectileCount: 1 },
    [{ type: 'explode', radius: 4, damagePercent: 0.6 }, { type: 'slow', percent: 0.5, duration: 3 }], '射出裹着海水的法球：命中爆开 60% 范围伤害，减速 50%'),
  S('mage', 'd1_bell_resonance', '钟律共鸣', 'arcane', 'circle', ['spell', 'aoe', 'targeted'], { damage: 140, cooldown: 16, radius: 5, range: 18 },
    [{ type: 'stackStun', stacks: 2, duration: 1.2, name: '钟律' }, { type: 'dot', element: 'arcane', dps: 20, duration: 5 }], '在目标处敲响无形之钟：5 秒奥术震荡；同一敌人被敲 2 次「钟律」定身'),
  S('mage', 'd1_abyss_tide', '渊海潮汐', 'shadow', 'circle', ['spell', 'aoe', 'targeted'], { damage: 120, cooldown: 18, radius: 6.5, range: 18 },
    [{ type: 'groundZone', element: 'shadow', dps: 26, radius: 6, duration: 6 }, { type: 'slow', percent: 0.35, duration: 4 }], '唤来漆黑潮水：6 秒暗影潮池，减速 35%'),
  // 时砂行者
  S('chrono', 'd1_tide_mark', '潮痕回溯', 'frost', 'circle', ['ranged', 'targeted', 'zone_cast', 'aoe'], { damage: 150, cooldown: 14, radius: 5, range: 16 },
    [{ type: 'slow', percent: 0.5, duration: 3 }, { type: 'explode', radius: 3, damagePercent: 0.5 }], '在目标处留下潮痕并回卷：减速 50%，再爆一次 50% 伤害'),
  S('chrono', 'd1_silent_toll', '无声钟时', 'arcane', 'circle', ['ranged', 'targeted', 'zone_cast', 'aoe', 'control'], { damage: 120, cooldown: 18, radius: 6, range: 16 },
    [{ type: 'stun', duration: 1.8 }, { type: 'interrupt' }], '让一片区域的时间停在钟响前：震晕 1.8 秒并打断读条'),
  S('chrono', 'd1_drift_blade', '流沙潮刃', 'physical', 'line', ['ranged', 'aoe', 'line'], { damage: 140, cooldown: 12, radius: 2.5, range: 16 },
    [{ type: 'dot', element: 'physical', dps: 22, duration: 5 }, { type: 'resetCooldown', slot: 'skill1', chance: 0.3 }], '掷出一线时砂潮刃：5 秒切割，30% 几率重置技能 1'),
  // 炼金投弹手
  S('alchemy', 'd1_brine_bomb', '咸潮炸弹', 'frost', 'circle', ['spell', 'aoe', 'targeted'], { damage: 150, cooldown: 14, radius: 5, range: 16 },
    [{ type: 'slow', percent: 0.45, duration: 3 }, { type: 'groundZone', element: 'frost', dps: 20, radius: 4.5, duration: 5 }], '掷出灌满海水的炸弹：减速 45%，留下 5 秒咸潮（不消耗试剂）'),
  S('alchemy', 'd1_bell_flask', '钟铜爆瓶', 'fire', 'single', ['ranged', 'spell', 'chain'], { damage: 120, cooldown: 14, range: 16 },
    [{ type: 'chain', jumps: 5, radius: 6, damagePercent: 0.75 }, { type: 'stun', duration: 0.6 }], '熔钟铜碎片做的爆瓶：弹射 5 次，每次短暂震晕（不消耗试剂）'),
  S('alchemy', 'd1_abyss_brew', '渊泥药雾', 'nature', 'circle', ['spell', 'aoe', 'targeted'], { damage: 100, cooldown: 18, radius: 6, range: 16 },
    [{ type: 'dot', element: 'nature', dps: 30, duration: 6 }, { type: 'heal', percentOfDamage: 0.2 }], '深渊淤泥熬成的毒雾：6 秒剧毒，按伤害 20% 回血（不消耗试剂）'),
];
const ult = (id: string, icon: string): PackTalentNodeDef => {
  const s = DLC1_SKILLS.find(x => x.id === id)!;
  return { id: `pt_${id}`, name: s.name, desc: `终极：学会新绝技「${s.name}」—— ${s.desc}`, icon: PACK_ICONS[`sk_${id}`] ? `sk_${id}` : icon, skill: id };
};
const T = (cls: string, layers: PackTalentNodeDef[][]): PackTalentTierDef =>
  ({ id: `dlc1_${cls}`, name: '沉钟天赋', cls, desc: '沉钟之海资料片专属：31–40 级的 5 个扩展天赋点只能用在这里。', layers });

export const DLC1_TALENTS: PackTalentTierDef[] = [
  T('warrior', [
    [{ id: 'pw_tidebody', name: '潮汐之躯', desc: '生命 +1500，护甲 +300', icon: 'tl_tough', stats: { hp: 1500, armor: 300 } }],
    [{ id: 'pw_surge', name: '怒涛', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'tl_wrath', stats: { crit: 4, critDmg: 15 } },
     { id: 'pw_reef', name: '礁石', desc: '护甲 +900，生命 +1000', icon: 'it_shield', stats: { armor: 900, hp: 1000 } }],
    [{ id: 'pw_echo', name: '沉钟回响', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '沉钟回响', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'pw_breaker', name: '碎浪冲锋', desc: '技能 1 伤害 +30%，冷却 -15%', icon: 'sk_charge', modifier: { name: '碎浪冲锋', desc: '', match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] } },
     { id: 'pw_whirl', name: '漩涡之刃', desc: '技能 2 范围 +25%，命中附带 4 秒寒潮流血', icon: 'sk_whirlwind', modifier: { name: '漩涡之刃', desc: '', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'addEffect', effect: { type: 'dot', element: 'frost', dps: 10, duration: 4 } }] } }],
    [ult('d1_tide_cleave', 'tl_storm'), ult('d1_bell_quake', 'tl_quake'), ult('d1_abyss_roar', 'tl_laststand')],
  ]),
  T('mage', [
    [{ id: 'pm_seamind', name: '海潮心智', desc: '法术强度 +20，急速 +3%', icon: 'tl_arcane', stats: { power: 20, haste: 3 } }],
    [{ id: 'pm_undertow', name: '暗流', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'tl_starfall', stats: { crit: 4, critDmg: 15 } },
     { id: 'pm_brine', name: '盐壳', desc: '护甲 +700，生命 +1400', icon: 'tl_icearmor', stats: { armor: 700, hp: 1400 } }],
    [{ id: 'pm_echo', name: '钟声余韵', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '钟声余韵', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'pm_frostwave', name: '冷潮', desc: '技能 2 范围 +25%，命中减速 30%', icon: 'sk_frost_ring', modifier: { name: '冷潮', desc: '', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] } },
     { id: 'pm_surgebolt', name: '涌浪弹', desc: '技能 1 伤害 +30%，冷却 -15%', icon: 'sk_flame_orb', modifier: { name: '涌浪弹', desc: '', match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] } }],
    [ult('d1_drown_orb', 'tl_iceheart'), ult('d1_bell_resonance', 'tl_arcaneheart'), ult('d1_abyss_tide', 'tl_deepfreeze')],
  ]),
  T('chrono', [
    [{ id: 'pc_tidesand', name: '潮砂', desc: '急速 +4%，移动速度 +5%', icon: 'tl_haste', stats: { haste: 4, speed: 5 } }],
    [{ id: 'pc_edge', name: '锋潮', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'it_dagger', stats: { crit: 4, critDmg: 15 } },
     { id: 'pc_shell', name: '贝甲', desc: '护甲 +700，生命 +1400', icon: 'it_leather_vest', stats: { armor: 700, hp: 1400 } }],
    [{ id: 'pc_echo', name: '回潮', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '回潮', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'pc_spin', name: '涡流', desc: '技能 2 范围 +25%，伤害 +15%', icon: 'sk_blade_spin', modifier: { name: '涡流', desc: '', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.15 }] } },
     { id: 'pc_stasis', name: '静潮', desc: '技能 3 冷却 -20%，命中减速 30%', icon: 'sk_stasis', modifier: { name: '静潮', desc: '', match: { slots: ['skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] } }],
    [ult('d1_tide_mark', 'sk_rewind'), ult('d1_silent_toll', 'it_hourglass'), ult('d1_drift_blade', 'it_chakram')],
  ]),
  T('alchemy', [
    [{ id: 'pa_saltblood', name: '盐血', desc: '生命 +1500，强度 +10', icon: 'it_reagent', stats: { hp: 1500, power: 10 } }],
    [{ id: 'pa_volatile', name: '不稳定配方', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'tl_blast', stats: { crit: 4, critDmg: 15 } },
     { id: 'pa_tarcoat', name: '焦油外衣', desc: '护甲 +700，生命 +1400', icon: 'tl_steam', stats: { armor: 700, hp: 1400 } }],
    [{ id: 'pa_echo', name: '钟铜催化', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '钟铜催化', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'pa_red', name: '沸潮红瓶', desc: '技能 1 伤害 +30%，冷却 -15%', icon: 'sk_red_flask', modifier: { name: '沸潮红瓶', desc: '', match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] } },
     { id: 'pa_green', name: '藻毒绿瓶', desc: '技能 3 范围 +25%，附带 4 秒自然毒', icon: 'sk_green_flask', modifier: { name: '藻毒绿瓶', desc: '', match: { slots: ['skill3'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'addEffect', effect: { type: 'dot', element: 'nature', dps: 10, duration: 4 } }] } }],
    [ult('d1_brine_bomb', 'it_flask'), ult('d1_bell_flask', 'sk_cauldron'), ult('d1_abyss_brew', 'tl_plague')],
  ]),
];
