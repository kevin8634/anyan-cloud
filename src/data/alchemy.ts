// 炼金投弹手（阶段七 v0.7.1-br.A，账号 A，原创内容）：法系远程药剂师，布甲，专属武器 药瓶（主手）/ 试剂匣（副手）
// 机制在 web/alchemy.ts：红 / 蓝 / 绿三色试剂（各 3 格），技能 1/2/3 = 红/蓝/绿，单按投纯色、0.45 秒内按两色 = 混合（9 种配方）
// 药剂抛物线投掷、落地留地面区域，后来的药剂落在已有区域上发生反应（爆燃 / 蒸汽 / 冰晶毒）
// 技能标签约定（alchemy.ts 读取）：lob = 抛物线投掷；reagent_r/b/g = 消耗哪种试剂；cauldron = 大釜炮台
import { SkillDef, ModifierDef, Element } from '../core/types';
import { LegendaryPower, AffixDef } from '../core/Loot';

const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };

export const ALCHEMY_SKILLS: Record<string, SkillDef> = {
  reagent_shot: { id: 'reagent_shot', name: '试剂弹', slot: 'basic', element: 'arcane', shape: 'circle', tags: ['spell', 'lob', 'targeted', 'aoe'],
    stats: { ...base, damage: 22, cooldown: 0.9, range: 14, radius: 1.6 }, effects: [] },
  red_flask: { id: 'red_flask', name: '爆燃瓶', slot: 'skill1', element: 'fire', shape: 'circle', tags: ['spell', 'lob', 'targeted', 'aoe', 'fire', 'reagent_r', 'fastcast'],
    stats: { ...base, damage: 52, cooldown: 0.3, range: 15, radius: 2.6, cost: 1 }, effects: [{ type: 'dot', element: 'fire', dps: 6, duration: 4 }] },   // v0.9.1l 持续伤害普及：灼烧
  blue_flask: { id: 'blue_flask', name: '霜雾瓶', slot: 'skill2', element: 'frost', shape: 'circle', tags: ['spell', 'lob', 'targeted', 'aoe', 'frost', 'reagent_b', 'fastcast'],
    stats: { ...base, damage: 30, cooldown: 0.3, range: 15, radius: 3, cost: 1 }, effects: [{ type: 'slow', percent: 0.5, duration: 3 }, { type: 'dot', element: 'frost', dps: 4, duration: 3 }] },   // v0.9.1l 持续伤害普及：冻伤
  green_flask: { id: 'green_flask', name: '腐蚀瓶', slot: 'skill3', element: 'nature', shape: 'circle', tags: ['spell', 'lob', 'targeted', 'aoe', 'nature', 'reagent_g', 'fastcast'],
    stats: { ...base, damage: 26, cooldown: 0.3, range: 15, radius: 2.8, cost: 1 }, effects: [{ type: 'dot', element: 'nature', dps: 8, duration: 5 }] },
  cauldron: { id: 'cauldron', name: '大釜炮台', slot: 'ultimate', element: 'arcane', shape: 'circle', tags: ['spell', 'ultimate', 'cauldron'],
    stats: { ...base, damage: 0, cooldown: 40, radius: 14 }, effects: [] },
};

export type Color = 'r' | 'b' | 'g';
export const COLOR_SLOT: Record<Color, 'skill1' | 'skill2' | 'skill3'> = { r: 'skill1', b: 'skill2', g: 'skill3' };
export const COLOR_HEX: Record<Color, number> = { r: 0xff4a20, b: 0x5ac8ff, g: 0x6aff4a };
export const COLOR_NAME: Record<Color, string> = { r: '红', b: '蓝', g: '绿' };

/** 地面区域种类：燃烧 / 冰雾 / 毒池 / 酸火 / 晶毒 */
export type ZoneKind = 'fire' | 'frost' | 'poison' | 'acid' | 'crystal';

/** 配方：key = 两种颜色排序后拼起来（单色 = 一个字母）。dmg = 相对两种颜色技能伤害平均值的倍率 */
export interface Recipe {
  key: string; name: string; element: Element; dmg: number; radius: number; color: number;
  slow?: number; stun?: number; interrupt?: boolean; knock?: number; blind?: number; dot?: number; plague?: boolean; vuln?: number;
  zone?: { kind: ZoneKind; r: number; dur: number; dps: number; slow?: number };
  desc: string;
}
export const RECIPES: Record<string, Recipe> = {
  r: { key: 'r', name: '爆燃瓶', element: 'fire', dmg: 1, radius: 2.6, color: 0xff5a20, zone: { kind: 'fire', r: 2.2, dur: 3, dps: 0.12 }, desc: '落点火焰爆炸，留下 3 秒燃烧地面' },
  b: { key: 'b', name: '霜雾瓶', element: 'frost', dmg: 1, radius: 3, color: 0x7ad8ff, slow: 0.5, zone: { kind: 'frost', r: 3, dur: 4, dps: 0, slow: 0.5 }, desc: '减速 50% 的冰雾，持续 4 秒' },
  g: { key: 'g', name: '腐蚀瓶', element: 'nature', dmg: 1, radius: 2.8, color: 0x6aff4a, dot: 1, zone: { kind: 'poison', r: 2.8, dur: 5, dps: 0.2 }, desc: '毒池：持续伤害 5 秒' },
  rr: { key: 'rr', name: '烈焰新星', element: 'fire', dmg: 1.9, radius: 4.5, color: 0xff7a10, desc: '大范围火焰爆炸' },
  bb: { key: 'bb', name: '冰封瓶', element: 'frost', dmg: 0.9, radius: 3.2, color: 0xbfefff, stun: 1.5, interrupt: true, desc: '冻结 1.5 秒，打断读条（职业控制技）' },
  gg: { key: 'gg', name: '瘟疫瓶', element: 'nature', dmg: 0.8, radius: 3, color: 0x9aff3a, dot: 1.6, plague: true, desc: '剧毒会在敌人之间传染' },
  br: { key: 'br', name: '蒸汽爆炸', element: 'fire', dmg: 1.3, radius: 3.4, color: 0xffffff, knock: 3, blind: 1, desc: '击退 + 致盲 1 秒' },
  gr: { key: 'gr', name: '燃烧酸池', element: 'fire', dmg: 0.8, radius: 3, color: 0xc8ff20, zone: { kind: 'acid', r: 3.2, dur: 6, dps: 0.38 }, desc: '伤害最高的持续区域：燃烧酸液 6 秒' },
  bg: { key: 'bg', name: '晶毒雾', element: 'nature', dmg: 0.8, radius: 3.2, color: 0x40e0c0, vuln: 0.15, zone: { kind: 'crystal', r: 3.2, dur: 5, dps: 0.08, slow: 0.3 }, desc: '减速 30%，雾里的敌人受到伤害 +15%' },
};
export const recipeKey = (a: Color, b?: Color) => (b ? [a, b].sort().join('') : a);

export const ALCHEMY_CFG = {
  reagentMax: 3, reagentRegen: 3,   // 每种试剂 3 格，每 3 秒回 1 格（急速缩短；试剂匣再快 25%）
  basicRefund: 0.4,                 // 试剂弹命中：三种试剂的回充计时各 +0.4 秒
  mixWindow: 0.45,                  // 两次按键间隔小于这个 = 混合
  flight: 0.5,                      // 抛物线飞行时间
  cauldronLife: 10, cauldronEvery: 1.6, cauldronMul: 0.6,
  smokeLevel: 25, smokeCd: 12, smokeBack: 6,
  boomMul: 2,                       // 爆燃（火落在毒池上）
  steamBlind: 1.5,                  // 蒸汽（冰落在火上）致盲
};

// ---------- 技能组合 ----------
export const ALCHEMY_COMBOS: ModifierDef[] = [
  { id: 'c_shot_red', name: '引火', source: 'combo', desc: '试剂弹命中后 3 秒内，爆燃瓶伤害 +25%', match: { skillIds: ['red_flask'] },
    conditions: [{ type: 'recentCast', skillId: 'reagent_shot', within: 3 }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] },
];

// ---------- 传说（6 件，v0.7.2 定稿；带机制的效果在 web/alchemy.ts 里用 hasLg(id) 读取） ----------
const ALC_KIND: Record<string, LegendaryPower['kind']> = { lg_sage_flask: '资源循环', lg_trinity_box: '资源循环', lg_mad_mask: '条件强化', lg_corrode_gloves: '召唤与地面', lg_saltpeter_robe: '连锁触发', lg_eternal_pot: '召唤与地面' };
const lgA = (id: string, name: string, slots: LegendaryPower['slots'], desc: string, skillIds: string[] = ['__none'], ops: ModifierDef['ops'] = []): LegendaryPower =>
  ({ kind: ALC_KIND[id], id, name, slots, cls: 'alchemy', modifier: { id, name, source: 'equipment', priority: 20, desc, match: { skillIds }, ops } });
export const ALCHEMY_LEGENDARIES: LegendaryPower[] = [
  lgA('lg_sage_flask', '贤者药瓶', ['oneHand'], '混合药剂 20% 几率不消耗试剂；试剂弹伤害 +15%', ['reagent_shot'], [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'rename', prefix: '贤者' }]),
  lgA('lg_trinity_box', '三元试剂匣', ['offHand'], '每种试剂上限 +1'),
  lgA('lg_mad_mask', '疯狂学者面具', ['head'], '地面反应（爆燃 / 蒸汽 / 冰晶毒）效果 +40%'),
  lgA('lg_corrode_gloves', '腐蚀手套', ['hands', 'wrist'], '毒池范围 +30%，并会缓缓跟着池里的敌人移动'),
  lgA('lg_saltpeter_robe', '硝石长袍', ['chest', 'legs'], '爆燃会再点燃 6 米内的一个毒池（连锁一次）；爆燃瓶范围 +20%', ['red_flask'], [{ op: 'mul', stat: 'radius', value: 0.2 }, { op: 'rename', prefix: '硝石' }]),
  lgA('lg_eternal_pot', '永燃药锅', ['shoulder', 'waist'], '大釜炮台持续时间翻倍', ['cauldron'], [{ op: 'rename', prefix: '永燃' }]),
];

export const ALCHEMY_AFFIXES: AffixDef[] = [
  { id: 'a_power_a', kind: 'char', cls: 'alchemy', text: '法术强度 +{v}', slots: ['oneHand', 'twoHand', 'offHand', 'neck', 'ring', 'trinket'], weight: 8, stat: 'power', min: 3, max: 8 },
  { id: 'a_red', kind: 'skill', cls: 'alchemy', text: '爆燃瓶伤害 +{v}%', slots: ['legs', 'trinket', 'head', 'offHand', 'hands'], weight: 6, stat: 'damage', op: 'mul', min: 0.12, max: 0.25, match: { skillIds: ['red_flask'] } },
  { id: 'a_green', kind: 'skill', cls: 'alchemy', text: '腐蚀瓶伤害 +{v}%', slots: ['legs', 'chest', 'shoulder', 'offHand'], weight: 5, stat: 'damage', op: 'mul', min: 0.12, max: 0.25, match: { skillIds: ['green_flask'] } },
  { id: 'a_shot_slow', kind: 'effect', cls: 'alchemy', text: '试剂弹命中减速 25%（2 秒）', slots: ['oneHand', 'offHand'], weight: 3, minQuality: 'purple',
    effect: { type: 'slow', percent: 0.25, duration: 2 }, match: { skillIds: ['reagent_shot'] } },
];
