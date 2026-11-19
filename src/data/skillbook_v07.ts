// ========== v0.7.4-br.A：新职业技能书 + 符文（数据，账号 A） ==========
// 单独放一个文件，再并入 data/skillbook.ts 的 ALT_SKILLS / SLOT_CHOICES / SLOT_ROLE / RUNES / PRESETS，避免和主线改同一个文件。
// 时砂行者：位移 沙影步/相位折跃/逆流冲刺；输出 千刃回旋/时之锯/刻印飞轮；控制 停滞之刻/沙牢/迟滞领域；大招 终刻/万象回声/时之裂隙
// 炼金投弹手：「同色替换」—— 1/2/3 键仍是红/蓝/绿试剂，新技能只改「单投」那一瓶的效果，9 种双色混合配方不变（伤害取两槽技能平均值）
//   红 爆燃瓶/铝热剂/火油弹；蓝 霜雾瓶/液氮瓶/极寒结晶；绿 腐蚀瓶/瘟疫孢子/强酸；大招 大釜炮台/贤者之石/移动实验室
// 新的施法机制在 web/chrono.ts / web/alchemy.ts 里按标签读取：
//   时砂：phase（瞬移到目标身后）、back（向后闪）+ fan_after（闪完向前扇形 3 轮）、pierce（时之锯：直线穿透不回收）、focus（多枚时轮同一目标）、
//         zone_cast（在目标处结算一个圆形区域）、echo_all（万象回声）、rift（时之裂隙）
//   炼金：单投配方 ALC_SINGLE[技能 id]（覆盖 RECIPES 的单色那一条）、slowfuse（铝热剂慢引信）、philo（贤者之石）、follow（移动实验室）
import { SkillDef, ModifierDef, SlotId, Element, EffectDef, ModOp } from '../core/types';
import type { Recipe } from './alchemy';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
type Alt = SkillDef & { desc: string };
const S = (id: string, name: string, slot: SlotId, element: Element, shape: SkillDef['shape'], tags: string[], stats: Partial<SkillDef['stats']>, effects: EffectDef[], desc: string): Alt =>
  ({ id, name, slot, element, shape, tags, stats: { ...base, ...stats }, effects, desc });

export const ALT_SKILLS_V07: Record<'chrono' | 'alchemy', Alt[]> = {
  chrono: [
    S('phase_shift', '相位折跃', 'skill1', 'physical', 'circle', ['blink', 'phase', 'aoe', 'movement', 'mark1'], { damage: 40, cooldown: 8, radius: 3, range: 12, cost: 1 }, [],
      '瞬移到目标身后，落点爆开时砂（叠 1 层时痕）；目标已有时痕时返还 1 格时砂'),
    S('backflow_dash', '逆流冲刺', 'skill1', 'physical', 'circle', ['blink', 'back', 'fan_after', 'aoe', 'movement', 'mark1'], { damage: 22, cooldown: 9, radius: 3, range: 7, projectileCount: 3, cost: 1 }, [],
      '向后闪 7 米，同时向前扇形甩出 3 枚时轮（拉开距离用）'),
    S('time_saw', '时之锯', 'skill2', 'physical', 'projectile', ['ranged', 'chakram', 'fan', 'pierce', 'aoe', 'mark2', 'line'], { damage: 48, cooldown: 5, range: 17, radius: 1.6, projectileCount: 1, cost: 2 }, [],
      '一枚巨大的时轮直线锯过去，沿途每个敌人叠 2 层时痕'),
    S('engrave_wheel', '刻印飞轮', 'skill2', 'physical', 'projectile', ['ranged', 'chakram', 'return', 'focus', 'mark_out', 'mark_ret'], { damage: 18, cooldown: 7, range: 15, projectileCount: 3, cost: 2 }, [],
      '连射 3 枚时轮打同一个目标，去回各叠 1 层时痕（单体爆发，一套直接引爆）'),
    S('sand_prison', '沙牢', 'skill3', 'physical', 'circle', ['ranged', 'targeted', 'zone_cast', 'control', 'mark1'], { damage: 26, cooldown: 12, radius: 3.5, range: 15, cost: 1 },
      [{ type: 'interrupt' }, { type: 'stun', duration: 2 }], '目标处升起沙牢：范围内敌人困住 2 秒并打断（首领只打断）'),
    S('slow_field', '迟滞领域', 'skill3', 'physical', 'circle', ['ranged', 'targeted', 'zone_cast', 'control', 'mark1'], { damage: 20, cooldown: 14, radius: 5, range: 15, cost: 1 },
      [{ type: 'slow', percent: 0.5, duration: 6 }, { type: 'groundZone', element: 'physical', dps: 8, radius: 5, duration: 6 }], '目标处时间变慢 6 秒：敌人减速 50%，持续受到伤害'),
    S('myriad_echo', '万象回声', 'ultimate', 'physical', 'circle', ['aoe', 'ultimate', 'echo_all', 'mark1'], { damage: 50, cooldown: 50, radius: 6 }, [],
      '身边爆开时砂；之后 8 秒内你放的每个技能都会被回声以 100% 伤害重放'),
    S('time_rift', '时之裂隙', 'ultimate', 'physical', 'circle', ['ranged', 'targeted', 'aoe', 'ultimate', 'rift', 'mark2'], { damage: 40, cooldown: 55, radius: 6, range: 16 }, [],
      '目标处撕开裂隙 4 秒：把敌人往中心拉、持续切割，结束时引爆范围内所有时痕'),
  ],
  alchemy: [
    S('thermite', '铝热剂', 'skill1', 'fire', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'fire', 'reagent_r', 'fastcast', 'slowfuse'], { damage: 54, cooldown: 0.3, range: 15, radius: 2.2, cost: 1 }, [],
      '红：慢引信，落地后熔穿大爆（单投伤害 ×1.7，不留火地）；混合时仍算红色'),
    S('napalm', '火油弹', 'skill1', 'fire', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'fire', 'reagent_r', 'fastcast'], { damage: 48, cooldown: 0.3, range: 15, radius: 2.6, cost: 1 }, [],
      '红：溅出一大片火油（单投伤害 ×0.6，燃烧地面 5 秒、范围大）；混合时仍算红色'),
    S('liquid_n2', '液氮瓶', 'skill2', 'frost', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'frost', 'reagent_b', 'fastcast'], { damage: 32, cooldown: 0.3, range: 15, radius: 2.4, cost: 1 },
      [{ type: 'slow', percent: 0.6, duration: 3 }], '蓝：瞬间冻结 0.8 秒并减速 60%（不留冰雾）；混合时仍算蓝色'),
    S('frost_crystal', '极寒结晶', 'skill2', 'frost', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'frost', 'reagent_b', 'fastcast'], { damage: 26, cooldown: 0.3, range: 15, radius: 3.4, cost: 1 },
      [{ type: 'interrupt' }], '蓝：打断，并留下 7 秒大片冰晶地面（减速 70%）；混合时仍算蓝色'),
    S('spores', '瘟疫孢子', 'skill3', 'nature', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'nature', 'reagent_g', 'fastcast'], { damage: 24, cooldown: 0.3, range: 15, radius: 2.6, cost: 1 },
      [{ type: 'dot', element: 'nature', dps: 7, duration: 5 }], '绿：孢子会在敌人之间传染（单投就带瘟疫）；混合时仍算绿色'),
    S('strong_acid', '强酸', 'skill3', 'nature', 'circle', ['spell', 'lob', 'targeted', 'aoe', 'nature', 'reagent_g', 'fastcast'], { damage: 28, cooldown: 0.3, range: 15, radius: 2.8, cost: 1 },
      [{ type: 'dot', element: 'nature', dps: 5, duration: 4 }], '绿：酸池 5 秒，池里的敌人受到的所有伤害 +15%（火落上去照样爆燃）；混合时仍算绿色'),
    S('philosopher', '贤者之石', 'ultimate', 'arcane', 'circle', ['spell', 'ultimate', 'philo', 'aoe'], { damage: 40, cooldown: 45, radius: 5 }, [],
      '三种试剂立刻充满；10 秒内投药不消耗试剂'),
    S('mobile_lab', '移动实验室', 'ultimate', 'arcane', 'circle', ['spell', 'ultimate', 'cauldron', 'follow'], { damage: 0, cooldown: 45, radius: 14 }, [],
      '大釜跟在你身后走 10 秒，每次投掷 80% 伤害（边跑边打的大釜）'),
  ],
};

/** 炼金单投覆盖：key = 技能 id（只影响单色那一瓶；混合仍用 RECIPES） */
export const ALC_SINGLE: Record<string, Recipe> = {
  thermite: { key: 'r', name: '铝热剂', element: 'fire', dmg: 1.7, radius: 2.2, color: 0xffd040, stun: 0.4, desc: '慢引信大爆' },
  napalm: { key: 'r', name: '火油弹', element: 'fire', dmg: 0.6, radius: 2.6, color: 0xff7a20, zone: { kind: 'fire', r: 3.8, dur: 5, dps: 0.18 }, desc: '大片燃烧地面' },
  liquid_n2: { key: 'b', name: '液氮瓶', element: 'frost', dmg: 0.9, radius: 2.4, color: 0xe0f8ff, stun: 0.8, desc: '瞬间冻结' },
  frost_crystal: { key: 'b', name: '极寒结晶', element: 'frost', dmg: 0.5, radius: 3.4, color: 0x9ae8ff, zone: { kind: 'frost', r: 4, dur: 7, dps: 0, slow: 0.7 }, desc: '大片冰晶地面' },
  spores: { key: 'g', name: '瘟疫孢子', element: 'nature', dmg: 0.6, radius: 2.6, color: 0xb0ff50, plague: true, zone: { kind: 'poison', r: 2.2, dur: 4, dps: 0.12 }, desc: '传染' },
  strong_acid: { key: 'g', name: '强酸', element: 'nature', dmg: 0.9, radius: 2.8, color: 0xe0ff30, vuln: 0.15, zone: { kind: 'poison', r: 3, dur: 5, dps: 0.1 }, desc: '易伤酸池' },
};

export const SLOT_CHOICES_V07: Record<'chrono' | 'alchemy', Partial<Record<SlotId, string[]>>> = {
  chrono: { skill1: ['sand_step', 'phase_shift', 'backflow_dash'], skill2: ['blade_spin', 'time_saw', 'engrave_wheel'], skill3: ['stasis', 'sand_prison', 'slow_field'], ultimate: ['final_moment', 'myriad_echo', 'time_rift'] },
  alchemy: { skill1: ['red_flask', 'thermite', 'napalm'], skill2: ['blue_flask', 'liquid_n2', 'frost_crystal'], skill3: ['green_flask', 'spores', 'strong_acid'], ultimate: ['cauldron', 'philosopher', 'mobile_lab'] },
};
export const SLOT_ROLE_V07: Record<'chrono' | 'alchemy', Partial<Record<SlotId, string>>> = {
  chrono: { skill1: '位移', skill2: '输出', skill3: '控制', ultimate: '大招' },
  alchemy: { skill1: '红试剂', skill2: '蓝试剂', skill3: '绿试剂', ultimate: '大招' },
};

// ---------------- 符文（每技能 3 枚，熟练度 100 / 300 / 600） ----------------
export interface RuneDefV07 { id: string; skillId: string; name: string; desc: string; need: number; element?: Element; modifier: ModifierDef }
const NEED = [100, 300, 600];
const R = (skillId: string, i: number, name: string, desc: string, ops: ModOp[], element?: Element): RuneDefV07 => ({
  id: `r_${skillId}_${i + 1}`, skillId, name, desc, need: NEED[i], element,
  modifier: { id: `r_${skillId}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [skillId] }, priority: 40, ops },
});
const el = (e: Element, prefix: string): ModOp[] => [{ op: 'setElement', value: e }, { op: 'rename', prefix }];
const mul = (stat: 'damage' | 'cooldown' | 'radius' | 'range', value: number): ModOp => ({ op: 'mul', stat, value });
const fx = (effect: EffectDef): ModOp => ({ op: 'addEffect', effect });
const tag = (value: string): ModOp => ({ op: 'addTag', value });
const add = (stat: 'projectileCount' | 'cost', value: number): ModOp => ({ op: 'add', stat, value });

export const RUNES_V07: RuneDefV07[] = [
  // ---- 时砂行者
  R('sand_step', 0, '暗影步', '变为暗影：落点留下 3 秒暗影地面', [...el('shadow', '暗影'), fx({ type: 'groundZone', element: 'shadow', dps: 10, radius: 3, duration: 3 })], 'shadow'),
  R('sand_step', 1, '轻身', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('sand_step', 2, '深痕', '命中改为叠 2 层时痕', [tag('mark2')]),
  R('phase_shift', 0, '寒影', '变为冰霜：落点减速 50%', [...el('frost', '寒影'), fx({ type: 'slow', percent: 0.5, duration: 3 })], 'frost'),
  R('phase_shift', 1, '远折', '距离 +40%', [mul('range', 0.4)]),
  R('phase_shift', 2, '背刺', '伤害 +60%，附带回声', [mul('damage', 0.6), tag('echo')]),
  R('backflow_dash', 0, '焰轮', '变为火焰：时轮附带灼烧', [...el('fire', '焰轮'), fx({ type: 'dot', element: 'fire', dps: 6, duration: 4 })], 'fire'),
  R('backflow_dash', 1, '五轮', '甩出 5 枚时轮（每枚伤害 -20%）', [add('projectileCount', 2), mul('damage', -0.2)]),
  R('backflow_dash', 2, '急退', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('blade_spin', 0, '暗刃', '变为暗影：附带腐蚀', [...el('shadow', '暗刃'), fx({ type: 'dot', element: 'shadow', dps: 7, duration: 4 })], 'shadow'),
  R('blade_spin', 1, '刃雨', '多 2 枚时轮', [add('projectileCount', 2), mul('damage', -0.1)]),
  R('blade_spin', 2, '省砂', '时砂消耗 -1', [add('cost', -1)]),
  R('time_saw', 0, '霜锯', '变为冰霜：减速 40%', [...el('frost', '霜锯'), fx({ type: 'slow', percent: 0.4, duration: 3 })], 'frost'),
  R('time_saw', 1, '巨锯', '宽度 +50%，距离 +25%', [mul('radius', 0.5), mul('range', 0.25)]),
  R('time_saw', 2, '回锯', '附带回声', [tag('echo')]),
  R('engrave_wheel', 0, '焰刻', '变为火焰：附带灼烧', [...el('fire', '焰刻'), fx({ type: 'dot', element: 'fire', dps: 8, duration: 4 })], 'fire'),
  R('engrave_wheel', 1, '四连', '多 1 枚时轮', [add('projectileCount', 1)]),
  R('engrave_wheel', 2, '刻骨', '伤害 +40%', [mul('damage', 0.4)]),
  R('stasis', 0, '霜封', '变为冰霜：结束后减速 50%', [...el('frost', '霜封'), fx({ type: 'slow', percent: 0.5, duration: 3 })], 'frost'),
  R('stasis', 1, '长停', '定身延长到 2.5 秒', [fx({ type: 'stun', duration: 2.5 })]),
  R('stasis', 2, '连环停滞', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('sand_prison', 0, '熔牢', '变为火焰：沙牢里持续燃烧', [...el('fire', '熔牢'), fx({ type: 'groundZone', element: 'fire', dps: 12, radius: 3.5, duration: 3 })], 'fire'),
  R('sand_prison', 1, '大牢', '范围 +40%', [mul('radius', 0.4)]),
  R('sand_prison', 2, '刻牢', '改为叠 2 层时痕', [tag('mark2')]),
  R('slow_field', 0, '暗域', '变为暗影：领域伤害提高', [...el('shadow', '暗域'), fx({ type: 'groundZone', element: 'shadow', dps: 14, radius: 5, duration: 6 })], 'shadow'),
  R('slow_field', 1, '凝滞', '减速提高到 70%', [fx({ type: 'slow', percent: 0.7, duration: 6 })]),
  R('slow_field', 2, '久域', '冷却 -30%', [mul('cooldown', -0.3)]),
  R('final_moment', 0, '永夜', '变为暗影：时停开始时腐蚀所有敌人', [...el('shadow', '永夜'), fx({ type: 'dot', element: 'shadow', dps: 20, duration: 5 })], 'shadow'),
  R('final_moment', 1, '广域', '范围 +30%', [mul('radius', 0.3)]),
  R('final_moment', 2, '速停', '冷却 -25%', [mul('cooldown', -0.25)]),
  R('myriad_echo', 0, '寒响', '变为冰霜：爆开时减速 50%', [...el('frost', '寒响'), fx({ type: 'slow', percent: 0.5, duration: 4 })], 'frost'),
  R('myriad_echo', 1, '回响圈', '范围 +40%', [mul('radius', 0.4)]),
  R('myriad_echo', 2, '常响', '冷却 -25%', [mul('cooldown', -0.25)]),
  R('time_rift', 0, '虚空', '变为暗影：裂隙切割伤害 +30%', [...el('shadow', '虚空'), mul('damage', 0.3)], 'shadow'),
  R('time_rift', 1, '巨隙', '范围 +30%', [mul('radius', 0.3)]),
  R('time_rift', 2, '频隙', '冷却 -25%', [mul('cooldown', -0.25)]),
  // ---- 炼金投弹手（不改元素：药剂的元素由配方决定；符文元素只计入共鸣）
  R('red_flask', 0, '烈性', '红瓶伤害 +20%', [mul('damage', 0.2)], 'fire'),
  R('red_flask', 1, '大药瓶', '红瓶范围 +30%', [mul('radius', 0.3)], 'fire'),
  R('red_flask', 2, '余烬', '附带灼烧', [fx({ type: 'dot', element: 'fire', dps: 8, duration: 4 })], 'fire'),
  R('thermite', 0, '高爆', '伤害 +25%', [mul('damage', 0.25)], 'fire'),
  R('thermite', 1, '震爆', '眩晕 1 秒', [fx({ type: 'stun', duration: 1 })], 'fire'),
  R('thermite', 2, '破片', '爆炸再溅射一圈（60% 伤害）', [fx({ type: 'explode', radius: 4, damagePercent: 0.6 })], 'fire'),
  R('napalm', 0, '黏稠', '附带减速 30%', [fx({ type: 'slow', percent: 0.3, duration: 3 })], 'fire'),
  R('napalm', 1, '泼洒', '范围 +30%', [mul('radius', 0.3)], 'fire'),
  R('napalm', 2, '猛火', '伤害 +30%', [mul('damage', 0.3)], 'fire'),
  R('blue_flask', 0, '刺骨', '蓝瓶伤害 +25%', [mul('damage', 0.25)], 'frost'),
  R('blue_flask', 1, '弥漫', '蓝瓶范围 +30%', [mul('radius', 0.3)], 'frost'),
  R('blue_flask', 2, '霜冻', '减速提高到 65%', [fx({ type: 'slow', percent: 0.65, duration: 3 })], 'frost'),
  R('liquid_n2', 0, '深冻', '冻结后再减速 3 秒', [fx({ type: 'slow', percent: 0.7, duration: 3 })], 'frost'),
  R('liquid_n2', 1, '碎冰', '伤害 +35%', [mul('damage', 0.35)], 'frost'),
  R('liquid_n2', 2, '速冻', '附带打断', [fx({ type: 'interrupt' })], 'frost'),
  R('frost_crystal', 0, '晶刺', '伤害 +40%', [mul('damage', 0.4)], 'frost'),
  R('frost_crystal', 1, '冰原', '范围 +30%', [mul('radius', 0.3)], 'frost'),
  R('frost_crystal', 2, '寒晶', '冻结 0.6 秒', [fx({ type: 'stun', duration: 0.6 })], 'frost'),
  R('green_flask', 0, '剧毒', '额外附带一层剧毒', [fx({ type: 'dot', element: 'nature', dps: 6, duration: 5 })], 'nature'),
  R('green_flask', 1, '毒雾', '绿瓶范围 +30%', [mul('radius', 0.3)], 'nature'),
  R('green_flask', 2, '腐骨', '伤害 +25%', [mul('damage', 0.25)], 'nature'),
  R('spores', 0, '烈疫', '伤害 +30%', [mul('damage', 0.3)], 'nature'),
  R('spores', 1, '孢云', '范围 +30%', [mul('radius', 0.3)], 'nature'),
  R('spores', 2, '虚弱', '附带减速 30%', [fx({ type: 'slow', percent: 0.3, duration: 3 })], 'nature'),
  R('strong_acid', 0, '王水', '伤害 +30%', [mul('damage', 0.3)], 'nature'),
  R('strong_acid', 1, '酸雨', '范围 +30%', [mul('radius', 0.3)], 'nature'),
  R('strong_acid', 2, '蚀骨', '持续伤害翻倍', [fx({ type: 'dot', element: 'nature', dps: 6, duration: 4 })], 'nature'),
  R('cauldron', 0, '沸腾', '药锅投掷伤害 +20%', [mul('damage', 0.2)], 'arcane'),
  R('cauldron', 1, '大锅', '范围 +30%', [mul('radius', 0.3)], 'arcane'),
  R('cauldron', 2, '常备', '冷却 -25%', [mul('cooldown', -0.25)], 'arcane'),
  R('philosopher', 0, '金辉', '变为神圣：放下时爆开神圣光环', [...el('holy', '金辉'), fx({ type: 'explode', radius: 5, damagePercent: 1 })], 'holy'),
  R('philosopher', 1, '贤者', '范围 +40%', [mul('radius', 0.4)], 'arcane'),
  R('philosopher', 2, '炼成', '冷却 -25%', [mul('cooldown', -0.25)], 'arcane'),
  R('mobile_lab', 0, '快炉', '冷却 -20%', [mul('cooldown', -0.2)], 'arcane'),
  R('mobile_lab', 1, '远投', '药锅索敌距离 +30%', [mul('radius', 0.3)], 'arcane'),
  R('mobile_lab', 2, '浓汤', '药锅投掷伤害 +25%', [mul('damage', 0.25)], 'arcane'),
];

export interface PresetDefV07 { id: string; cls: string; name: string; desc: string; skills: Partial<Record<SlotId, string>>; runes: Record<string, string> }
export const PRESETS_V07: PresetDefV07[] = [
  { id: 'p_c_echo', cls: 'chrono', name: '回声流', desc: '相位折跃 + 千刃回旋 + 万象回声，技能放两遍', skills: { skill1: 'phase_shift', skill2: 'blade_spin', skill3: 'stasis', ultimate: 'myriad_echo' }, runes: { phase_shift: 'r_phase_shift_3', blade_spin: 'r_blade_spin_2', myriad_echo: 'r_myriad_echo_3' } },
  { id: 'p_c_mark', cls: 'chrono', name: '时痕爆发', desc: '刻印飞轮叠满 5 层直接引爆，时之裂隙收尾', skills: { skill1: 'sand_step', skill2: 'engrave_wheel', skill3: 'sand_prison', ultimate: 'time_rift' }, runes: { sand_step: 'r_sand_step_3', engrave_wheel: 'r_engrave_wheel_3', sand_prison: 'r_sand_prison_3' } },
  { id: 'p_c_kite', cls: 'chrono', name: '控场风筝', desc: '逆流冲刺拉开 + 时之锯 + 迟滞领域，近战怪摸不到你', skills: { skill1: 'backflow_dash', skill2: 'time_saw', skill3: 'slow_field', ultimate: 'final_moment' }, runes: { backflow_dash: 'r_backflow_dash_2', time_saw: 'r_time_saw_1', slow_field: 'r_slow_field_2' } },
  { id: 'p_a_boom', cls: 'alchemy', name: '爆燃流', desc: '强酸毒池 + 铝热剂引爆，单体和成群都狠', skills: { skill1: 'thermite', skill2: 'blue_flask', skill3: 'strong_acid', ultimate: 'cauldron' }, runes: { thermite: 'r_thermite_3', strong_acid: 'r_strong_acid_1' } },
  { id: 'p_a_ctrl', cls: 'alchemy', name: '冰毒控场', desc: '液氮冻结 + 瘟疫传染 + 极寒地面，安全刷图', skills: { skill1: 'red_flask', skill2: 'liquid_n2', skill3: 'spores', ultimate: 'philosopher' }, runes: { liquid_n2: 'r_liquid_n2_1', spores: 'r_spores_2' } },
  { id: 'p_a_pot', cls: 'alchemy', name: '大釜站桩', desc: '火油大片火地 + 大釜炮台，打首领站着输出', skills: { skill1: 'napalm', skill2: 'frost_crystal', skill3: 'green_flask', ultimate: 'mobile_lab' }, runes: { napalm: 'r_napalm_3', mobile_lab: 'r_mobile_lab_3' } },
];
