// 炼金投弹手天赋（阶段七 v0.7.1，原创）：爆破 / 地面 / 炮台 三系，规则同其他职业
// 只有 id 的「机制天赋」由 web/alchemy.ts 用 tree.rank(id) 读取；试剂弹的三种形态跨树互斥（group: 'shot'）
import { TalentTreeDef } from '../core/TalentTree';

export const ALCHEMY_TREE: TalentTreeDef = {
  id: 'alchemy', name: '炼金投弹手', tierCost: 3, tiers: 6,
  specs: [
    // ==================== 爆破：火焰、爆燃、暴击 ====================
    { id: 'a_blast', name: '爆破', icon: 'tl_blast', desc: '先铺毒再点火，终极：连锁殉爆',
      nodes: [
        { id: 'ab_fire', name: '硝石', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_red_flask', desc: '火焰伤害 +{v}%', perRankShown: 6,
          modifier: { name: '硝石', desc: '', match: { elements: ['fire'] }, priority: 70, ops: [{ op: 'mul', stat: 'damage', value: 0.06 }] } },
        { id: 'ab_power', name: '烈性配方', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_flask', desc: '法术强度 +{v}', perRankShown: 8, stats: { power: 8 } },
        { id: 'ab_shot', name: '燃烧弹头', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'shot', icon: 'sk_reagent_shot', desc: '试剂弹形态：变为火焰伤害，命中附加 3 秒灼烧',
          modifier: { name: '燃烧弹头', desc: '', match: { skillIds: ['reagent_shot'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' }, { op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 5, duration: 3 } }, { op: 'rename', prefix: '燃烧' }] } },
        { id: 'ab_boom', name: '爆燃大师', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_blast', desc: '爆燃反应伤害 +{v}%', perRankShown: 20 },
        { id: 'ab_crit', name: '不稳定', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_scorch', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
        { id: 'ab_nova', name: '新星', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_red_flask', desc: '混合药剂（两色）伤害 +{v}%', perRankShown: 12 },
        { id: 'ab_critdmg', name: '殉爆', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
        { id: 'ab_red', name: '大号药瓶', row: 4, col: 3, kind: 'rank', maxRank: 2, icon: 'sk_red_flask', desc: '爆燃瓶伤害 +{v}%，范围 +{v2}%', perRankShown: 15, perRankShown2: 10,
          modifier: { name: '大号药瓶', desc: '', match: { skillIds: ['red_flask'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'mul', stat: 'radius', value: 0.1 }] } },
        { id: 'ab_chain', name: '连锁殉爆', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_blast',
          desc: '终极：爆燃会点燃 6 米内其他所有毒池 / 酸池，接连爆炸；爆燃后 3 秒内火焰伤害 +25%' },
        { id: 'ab6_master', name: '爆破专家', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_blast', desc: '法术强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
        { id: 'ab6_shot', name: '速投', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_reagent_shot', desc: '试剂弹伤害 +{v}%', perRankShown: 15,
          modifier: { name: '速投', desc: '', match: { skillIds: ['reagent_shot'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
      ] },
    // ==================== 地面：区域、反应、控制 ====================
    { id: 'a_ground', name: '地面', icon: 'tl_steam', desc: '一地药剂，终极：沸腾之地',
      nodes: [
        { id: 'ag_zone', name: '浓缩', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_green_flask', desc: '地面区域持续时间 +{v}%', perRankShown: 15 },
        { id: 'ag_hp', name: '防护外套', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_robe', desc: '生命 +{v}', perRankShown: 55, stats: { hp: 55 } },
        { id: 'ag_shot', name: '冰晶弹头', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'shot', icon: 'sk_blue_flask', desc: '试剂弹形态：变为冰霜伤害，命中减速 30%',
          modifier: { name: '冰晶弹头', desc: '', match: { skillIds: ['reagent_shot'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'frost' }, { op: 'addTag', value: 'frost' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }, { op: 'rename', prefix: '冰晶' }] } },
        { id: 'ag_dps', name: '腐蚀性', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_plague', desc: '地面区域每秒伤害 +{v}%', perRankShown: 15 },
        { id: 'ag_freeze', name: '深冻配方', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'sk_blue_flask', desc: '冰封瓶冻结 +1 秒，霜雾瓶减速 +15%' },
        { id: 'ag_react', name: '催化剂', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_steam', desc: '蒸汽 / 冰晶毒反应效果 +{v}%', perRankShown: 25 },
        { id: 'ag_armor', name: '铅衬', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_mantle', desc: '护甲 +{v}', perRankShown: 30, stats: { armor: 30 } },
        { id: 'ag_size', name: '泼洒', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_green_flask', desc: '地面区域半径 +{v}%', perRankShown: 12 },
        { id: 'ag_boil', name: '沸腾之地', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_plague',
          desc: '终极：同时存在 3 种不同的地面区域时，法术伤害 +25%，试剂回充速度 +30%' },
        { id: 'ag6_wall', name: '橡胶长袍', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'it_robe', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 90, perRankShown2: 20, stats: { hp: 90, armor: 20 } },
        { id: 'ag6_green', name: '剧毒', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_green_flask', desc: '腐蚀瓶伤害 +{v}%', perRankShown: 20,
          modifier: { name: '剧毒', desc: '', match: { skillIds: ['green_flask'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] } },
      ] },
    // ==================== 炮台：大釜、试剂、急速 ====================
    { id: 'a_turret', name: '炮台', icon: 'sk_cauldron', desc: '让药锅替你扔，终极：双釜',
      nodes: [
        { id: 'at_haste', name: '熟练', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%', perRankShown: 3, stats: { haste: 3 } },
        { id: 'at_regen', name: '速溶', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_reagent', desc: '试剂回充速度 +{v}%', perRankShown: 8 },
        { id: 'at_shot', name: '剧毒弹头', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'shot', icon: 'sk_green_flask', desc: '试剂弹形态：变为自然伤害，命中附加 4 秒中毒',
          modifier: { name: '剧毒弹头', desc: '', match: { skillIds: ['reagent_shot'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'nature' }, { op: 'addTag', value: 'nature' }, { op: 'addEffect', effect: { type: 'dot', element: 'nature', dps: 6, duration: 4 } }, { op: 'rename', prefix: '剧毒' }] } },
        { id: 'at_pot', name: '大锅', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'sk_cauldron', desc: '大釜投掷伤害 +{v}%（基础 60%）', perRankShown: 15 },
        { id: 'at_max', name: '大容量', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'it_reagent', desc: '每种试剂上限 +1' },
        { id: 'at_life', name: '保温', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_cauldron', desc: '大釜持续 +{v} 秒，冷却 -{v2} 秒', perRankShown: 3, perRankShown2: 4,
          modifier: { name: '保温', desc: '', match: { skillIds: ['cauldron'] }, ops: [{ op: 'add', stat: 'cooldown', value: -4 }] } },
        { id: 'at_speed', name: '轻装', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_cloth_shoes', desc: '移动速度 +{v}%', perRankShown: 5, stats: { speed: 5 } },
        { id: 'at_free', name: '节约', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'it_flask', desc: '混合药剂有 {v}% 几率不消耗试剂', perRankShown: 10 },
        { id: 'at_twin', name: '双釜', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_cauldron',
          desc: '终极：大釜炮台一次放下两口锅，每口投掷你最近的两种不同配方' },
        { id: 'at6_flow', name: '流水线', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%，暴击率 +{v2}%', perRankShown: 3, perRankShown2: 1, stats: { haste: 3, crit: 1 } },
        { id: 'at6_blue', name: '寒霜', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_blue_flask', desc: '霜雾瓶伤害 +{v}%', perRankShown: 20,
          modifier: { name: '寒霜', desc: '', match: { skillIds: ['blue_flask'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] } },
      ] },
  ],
};
