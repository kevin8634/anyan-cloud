// 法师天赋：三系专精 火焰 / 冰霜 / 奥术（原创内容），规则同战士：第 t 层需要在本树投入 3×(t-1) 点，满级 19 点
// 奥能弹的三种「形态之心」（炽焰 / 冰川 / 奥术）跨树互斥：只能有一种
import { TalentTreeDef } from '../core/TalentTree';

const SK = ['skill1', 'skill2', 'skill3'] as const;

export const MAGE_TREE: TalentTreeDef = {
  id: 'mage', name: '法师', tierCost: 3, tiers: 5,
  specs: [
    // ==================== 火焰：烈焰弹、燃烧地面、暴击 ====================
    { id: 'm_fire', name: '火焰', icon: 'sk_flame_orb', desc: '燃烧与暴击，终极：熔火陨星',
      nodes: [
        { id: 'mf_ignite', name: '炽热', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_flame', desc: '火焰技能伤害 +{v}%', perRankShown: 5,
          modifier: { name: '炽热', desc: '', match: { elements: ['fire'] }, priority: 70, ops: [{ op: 'mul', stat: 'damage', value: 0.05 }] } },
        { id: 'mf_will', name: '灼热意志', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_staff', desc: '法术强度 +{v}（每点技能伤害 +0.4%）', perRankShown: 8, stats: { power: 8 } },

        { id: 'mf_fireheart', name: '炽焰之心', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'bolt', icon: 'tl_fireheart', desc: '奥能弹形态：变为火焰伤害，命中附加 3 秒灼烧',
          modifier: { name: '炽焰之心', desc: '', match: { skillIds: ['arcane_bolt'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'fire' }, { op: 'addTag', value: 'fire' }, { op: 'addEffect', effect: { type: 'dot', element: 'fire', dps: 5, duration: 3 } }, { op: 'rename', prefix: '炽焰' }] } },
        { id: 'mf_orb', name: '烈焰弹大师', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_orbmaster', desc: '烈焰弹伤害 +{v}%', perRankShown: 12,
          modifier: { name: '烈焰弹大师', desc: '', match: { skillIds: ['flame_orb'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] } },

        { id: 'mf_critmass', name: '临界质量', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'it_orb', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
        { id: 'mf_wildfire', name: '燎原', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'tl_wildfire', desc: '烈焰弹命中后留下燃烧地面',
          modifier: { name: '燎原', desc: '', match: { skillIds: ['flame_orb'] }, priority: 50,
            ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 10, radius: 2.5, duration: 4 } }, { op: 'rename', suffix: '·燎原' }] } },

        { id: 'mf_combust', name: '燃尽', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_scorch', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
        { id: 'mf_pyro', name: '炎爆', row: 4, col: 3, kind: 'rank', maxRank: 2, icon: 'tl_starfall', desc: '陨星坠落伤害 +{v}%，冷却 -{v2} 秒', perRankShown: 15, perRankShown2: 4,
          modifier: { name: '炎爆', desc: '', match: { skillIds: ['meteor'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'add', stat: 'cooldown', value: -4 }] } },

        { id: 'mf_inferno', name: '熔火陨星', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_meteor',
          desc: '终极：陨星坠落变为「熔火陨星」——伤害 +20%，落点留下大片熔岩（半径 5 米，8 秒，每秒 30 火焰伤害）',
          modifier: { name: '熔火陨星', desc: '', match: { skillIds: ['meteor'] }, priority: 30,
            ops: [{ op: 'rename', name: '熔火陨星' }, { op: 'addTag', value: 'molten' }, { op: 'mul', stat: 'damage', value: 0.2 },
                  { op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 30, radius: 5, duration: 8 } }] } },
      ] },

    // ==================== 冰霜：控制、生存、碎冰 ====================
    { id: 'm_frost', name: '冰霜', icon: 'sk_frost_ring', desc: '冻结控制与生存，终极：碎裂霜环',
      nodes: [
        { id: 'mi_chill', name: '刺骨', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_frost', desc: '冰霜技能伤害 +{v}%', perRankShown: 6,
          modifier: { name: '刺骨', desc: '', match: { elements: ['frost'] }, priority: 70, ops: [{ op: 'mul', stat: 'damage', value: 0.06 }] } },
        { id: 'mi_icearmor', name: '寒冰护甲', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_icearmor', desc: '护甲 +{v}', perRankShown: 25, stats: { armor: 25 } },

        { id: 'mi_iceheart', name: '冰川之心', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'bolt', icon: 'tl_iceheart', desc: '奥能弹形态：变为冰霜伤害，命中减速 30%',
          modifier: { name: '冰川之心', desc: '', match: { skillIds: ['arcane_bolt'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'frost' }, { op: 'addTag', value: 'frost' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }, { op: 'rename', prefix: '冰川' }] } },
        { id: 'mi_barrier', name: '冰晶屏障', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_barrier', desc: '生命 +{v}', perRankShown: 55, stats: { hp: 55 } },

        { id: 'mi_deepfreeze', name: '深度冻结', row: 3, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_deepfreeze', desc: '霜环冻结延长到 2.5 秒，并打断读条',
          modifier: { name: '深度冻结', desc: '', match: { skillIds: ['frost_ring'] }, priority: 40,
            ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 2.5 } }, { op: 'addEffect', effect: { type: 'interrupt' } }, { op: 'rename', prefix: '深冻' }] } },
        { id: 'mi_frostbite', name: '冻伤', row: 3, col: 1, kind: 'choice', maxRank: 1, icon: 'it_frost_shield', desc: '霜环附加冻伤：冰霜 12/秒，持续 5 秒',
          modifier: { name: '冻伤', desc: '', match: { skillIds: ['frost_ring'] }, priority: 40, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'frost', dps: 12, duration: 5 } }] } },
        { id: 'mi_reach', name: '冰霜延展', row: 3, col: 3, kind: 'rank', maxRank: 2, icon: 'sk_frost_ring', desc: '霜环半径 +{v}%，冷却 -{v2}%', perRankShown: 12, perRankShown2: 6,
          modifier: { name: '冰霜延展', desc: '', match: { skillIds: ['frost_ring'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.12 }, { op: 'mul', stat: 'cooldown', value: -0.06 }] } },

        { id: 'mi_flow', name: '寒流', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_cloth_shoes', desc: '移动速度 +{v}%', perRankShown: 5, stats: { speed: 5 } },
        { id: 'mi_shard', name: '冰刺', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'it_wand', desc: '暴击伤害 +{v}%，暴击率 +{v2}%', perRankShown: 10, perRankShown2: 1, stats: { critDmg: 10, crit: 1 } },

        { id: 'mi_shatter', name: '碎裂霜环', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_frost_ring',
          desc: '终极：霜环变为「碎裂霜环」——伤害 +25%，冻结的敌人随即碎裂，对周围 3 米造成 60% 伤害；对冻结目标的所有技能伤害 +40%',
          modifier: { name: '碎裂霜环', desc: '', match: { skillIds: ['frost_ring'] }, priority: 30,
            ops: [{ op: 'rename', name: '碎裂霜环' }, { op: 'addTag', value: 'shatter' }, { op: 'mul', stat: 'damage', value: 0.25 },
                  { op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.6 } }] },
          extra: [{ name: '碎冰', desc: '', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'stun' }], priority: 80, ops: [{ op: 'mul', stat: 'damage', value: 0.4 }] }] },
      ] },

    // ==================== 奥术：普攻、急速、禁锢 ====================
    { id: 'm_arcane', name: '奥术', icon: 'tl_arcane', desc: '奥能弹与急速，终极：连锁禁锢',
      nodes: [
        { id: 'ma_arcane', name: '奥术专精', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_arcane', desc: '普通攻击伤害 +{v}%', perRankShown: 8,
          modifier: { name: '奥术专精', desc: '', match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } },
        { id: 'ma_quick', name: '迅思', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_quick', desc: '急速 +{v}%（攻速 / 持续伤害 / 翻滚）', perRankShown: 3, stats: { haste: 3 } },

        { id: 'ma_arcaneheart', name: '奥术之心', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'bolt', icon: 'tl_arcaneheart', desc: '奥能弹形态：一次发射 2 发，每发伤害 -15%',
          modifier: { name: '奥术之心', desc: '', match: { skillIds: ['arcane_bolt'] }, priority: 10,
            ops: [{ op: 'add', stat: 'projectileCount', value: 1 }, { op: 'mul', stat: 'damage', value: -0.15 }, { op: 'rename', prefix: '双生' }] } },
        { id: 'ma_focus', name: '奥术专注', row: 2, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_arcane_bind', desc: '奥术禁锢伤害 +{v}%，冷却 -{v2} 秒', perRankShown: 15, perRankShown2: 1,
          modifier: { name: '奥术专注', desc: '', match: { skillIds: ['arcane_bind'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'add', stat: 'cooldown', value: -1 }] } },

        { id: 'ma_echo', name: '奥术回响', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'tl_echo', desc: '普通攻击命中有 20% 几率重置烈焰弹冷却',
          modifier: { name: '奥术回响', desc: '', match: { slots: ['basic'] }, priority: 40, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.2 } }] } },
        { id: 'ma_blink', name: '闪现步法', row: 3, col: 1, kind: 'rank', maxRank: 2, icon: 'it_mantle', desc: '移动速度 +{v}%', perRankShown: 5, stats: { speed: 5 } },
        { id: 'ma_mind', name: '心灵洞察', row: 3, col: 3, kind: 'rank', maxRank: 3, icon: 'it_tome', desc: '暴击率 +{v}%', perRankShown: 1.5, stats: { crit: 1.5 } },

        { id: 'ma_epiphany', name: '濒死顿悟', row: 4, col: 0, kind: 'rank', maxRank: 1, icon: 'tl_epiphany', desc: '翻滚或闪现后 4 秒内，下一个技能（不含技能 4）伤害 +50% 并吸血 15%',
          modifier: { name: '濒死顿悟', desc: '', match: { slots: ['skill1', 'skill2', 'skill3', 'ultimate'] }, conditions: [{ type: 'flag', key: 'evade', consume: true }],
            ops: [{ op: 'mul', stat: 'damage', value: 0.5 }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.15 } }] } },
        { id: 'ma_potency', name: '奥能强化', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'it_amulet', desc: '法术强度 +{v}，技能 1~3 冷却 -{v2}%', perRankShown: 10, perRankShown2: 4, stats: { power: 10 },
          modifier: { name: '奥能强化', desc: '', match: { slots: [...SK] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.04 }] } },

        { id: 'ma_chain', name: '连锁禁锢', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_arcane_bind',
          desc: '终极：奥术禁锢变为「连锁禁锢」——伤害 +10%，在敌人之间弹跳 3 次（7 米内，每跳伤害 ×75%），每个目标都被眩晕并打断',
          modifier: { name: '连锁禁锢', desc: '', match: { skillIds: ['arcane_bind'] }, priority: 30,
            ops: [{ op: 'rename', name: '连锁禁锢' }, { op: 'addTag', value: 'chain' }, { op: 'mul', stat: 'damage', value: 0.1 },
                  { op: 'addEffect', effect: { type: 'chain', jumps: 3, radius: 7, damagePercent: 0.75 } }] } },
      ] },
  ],
};

// ---------------------------------------------------------------- 阶段四：第 6 层（需要在本树投入 15 点），给 21~30 级的天赋点用
MAGE_TREE.tiers = 6;
const mSpec = (id: string) => MAGE_TREE.specs.find(s => s.id === id)!.nodes;
mSpec('m_fire').push(
  { id: 'mf6_pyre', name: '焚天', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_flame_orb', desc: '法术强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
  { id: 'mf6_comet', name: '彗火', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_meteor', desc: '陨星坠落伤害 +{v}%', perRankShown: 15,
    modifier: { name: '彗火', desc: '', match: { skillIds: ['meteor'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
);
mSpec('m_frost').push(
  { id: 'mi6_glacier', name: '冰川之心', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_frost_ring', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 90, perRankShown2: 20, stats: { hp: 90, armor: 20 } },
  { id: 'mi6_bite', name: '霜噬', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_frost_ring', desc: '霜环伤害 +{v}%', perRankShown: 15,
    modifier: { name: '霜噬', desc: '', match: { skillIds: ['frost_ring'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
);
mSpec('m_arcane').push(
  { id: 'ma6_flux', name: '奥能涌流', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_arcane', desc: '急速 +{v}%，暴击率 +{v2}%', perRankShown: 3, perRankShown2: 1, stats: { haste: 3, crit: 1 } },
  { id: 'ma6_bolt', name: '奥能聚焦', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_arcane', desc: '奥能弹伤害 +{v}%', perRankShown: 12,
    modifier: { name: '奥能聚焦', desc: '', match: { skillIds: ['arcane_bolt'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] } },
);
