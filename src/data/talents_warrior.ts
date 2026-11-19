// 战士天赋：三系专精 武器 / 狂怒 / 防护（原创内容）
// 第 t 层需要在本树投入 3×(t-1) 点；满级 20 级共 19 点，一棵树点到终极天赋要 13 点，剩下 6 点分给别的树
// 「武器附魔」（风暴之刃 / 烈焰之刃 / 寒霜之刃）跨树互斥：只能有一种元素
import { TalentTreeDef } from '../core/TalentTree';
import { TALENTS } from './warrior';

const old = (id: string) => { const { id: _i, source: _s, ...rest } = TALENTS.find(t => t.id === id)!.modifier; return rest; };
const SK = ['skill1', 'skill2', 'skill3'] as const;

export const WARRIOR_TREE: TalentTreeDef = {
  id: 'warrior', name: '战士', tierCost: 3, tiers: 5,
  specs: [
    // ==================== 武器：单体爆发、暴击伤害 ====================
    { id: 'w_arms', name: '武器', icon: 'tl_weapon', desc: '单体爆发与暴击伤害，终极：致死打击',
      nodes: [
        { id: 'wa_weapon', name: '武器精通', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '普通攻击伤害 +{v}%', perRankShown: 8,
          modifier: { name: '武器精通', desc: '', match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } },
        { id: 'wa_might', name: '蛮力', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_gauntlet', desc: '攻击强度 +{v}（每点技能伤害 +0.4%）', perRankShown: 8, stats: { power: 8 } },

        { id: 'wa_brutal', name: '残暴', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'it_greataxe', desc: '暴击伤害 +{v}%', perRankShown: 10, stats: { critDmg: 10 } },
        { id: 'wa_charge', name: '破阵冲锋', row: 2, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_charge', desc: '冲锋伤害 +{v}%，距离 +{v2} 米', perRankShown: 25, perRankShown2: 2,
          modifier: { name: '破阵冲锋', desc: '', match: { skillIds: ['charge'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'add', stat: 'range', value: 2 }] } },

        { id: 'wa_rend', name: '撕裂伤口', row: 3, col: 0, kind: 'choice', maxRank: 1, icon: 'it_dagger', desc: '近战技能命中附加流血：物理 6/秒，持续 4 秒',
          modifier: { name: '撕裂伤口', desc: '', match: { tagsAny: ['melee'] }, priority: 45, ops: [{ op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 6, duration: 4 } }] } },
        { id: 'wa_storm', name: '风暴之刃', row: 3, col: 1, kind: 'choice', maxRank: 1, group: 'imbue', icon: 'tl_storm', desc: '武器附魔：近战技能变为自然伤害，命中后小范围爆炸（25% 伤害）',
          modifier: { name: '风暴之刃', desc: '', match: { tagsAny: ['melee'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'nature' }, { op: 'addTag', value: 'storm' }, { op: 'addEffect', effect: { type: 'explode', radius: 2, damagePercent: 0.25 } }] } },
        { id: 'wa_tactics', name: '战术大师', row: 3, col: 3, kind: 'rank', maxRank: 2, icon: 'tl_haste', desc: '技能 1~3 冷却 -{v}%', perRankShown: 5,
          modifier: { name: '战术大师', desc: '', match: { slots: [...SK] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.05 }] } },

        { id: 'wa_wrath', name: '天神之怒', row: 4, col: 1, kind: 'rank', maxRank: 1, icon: 'tl_wrath', desc: '天神下凡伤害 +40%，冷却 -15 秒',
          modifier: { name: '天神之怒', desc: '', match: { skillIds: ['avatar'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.4 }, { op: 'add', stat: 'cooldown', value: -15 }, { op: 'rename', suffix: '·怒' }] } },
        { id: 'wa_precision', name: '致命精准', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'it_sword', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },

        { id: 'wa_mortal', name: '致死打击', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_slash',
          desc: '终极：英勇打击变为「致死打击」——伤害 +80%，命中造成重伤流血（物理 10/秒，4 秒）',
          modifier: { name: '致死打击', desc: '', match: { skillIds: ['slash'] }, priority: 30,
            ops: [{ op: 'rename', name: '致死打击' }, { op: 'addTag', value: 'mortal' }, { op: 'mul', stat: 'damage', value: 0.8 },
                  { op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 10, duration: 4 } }] } },
      ] },

    // ==================== 狂怒：急速、暴击、旋风斩与吸血 ====================
    { id: 'w_fury', name: '狂怒', icon: 'sk_whirlwind', desc: '急速与暴击，旋风斩清场，终极：血怒旋风',
      nodes: [
        { id: 'wf_frenzy', name: '狂热', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_quick', desc: '急速 +{v}%（攻速 / 持续伤害 / 翻滚）', perRankShown: 3, stats: { haste: 3 } },
        { id: 'wf_swift', name: '疾驰', row: 1, col: 2, kind: 'rank', maxRank: 2, icon: 'it_sabaton', desc: '移动速度 +{v}%，冲锋冷却 -{v2}%', perRankShown: 5, perRankShown2: 10, stats: { speed: 5 },
          modifier: { name: '疾驰', desc: '', match: { skillIds: ['charge'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.1 }] } },

        { id: 'wf_flame', name: '烈焰之刃', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'imbue', icon: 'tl_flame', desc: '武器附魔：近战技能变为火焰伤害，命中附加 3 秒灼烧', modifier: old('t_flame_blade') },
        { id: 'wf_whirl', name: '旋风大师', row: 2, col: 1, kind: 'rank', maxRank: 3, icon: 'sk_whirlwind', desc: '旋风斩范围 +{v2}%，伤害 +{v}%', perRankShown: 10, perRankShown2: 8,
          modifier: { name: '旋风大师', desc: '', match: { skillIds: ['whirlwind'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.08 }, { op: 'mul', stat: 'damage', value: 0.1 }] } },
        { id: 'wf_frost', name: '寒霜之刃', row: 2, col: 3, kind: 'choice', maxRank: 1, group: 'imbue', icon: 'tl_frost', desc: '武器附魔：近战技能变为冰霜伤害，命中减速 20%',
          modifier: { name: '寒霜之刃', desc: '', match: { tagsAny: ['melee'] }, priority: 10,
            ops: [{ op: 'setElement', value: 'frost' }, { op: 'addTag', value: 'frost' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.2, duration: 2 } }] } },

        { id: 'wf_scorch', name: '焦土', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'tl_scorch', desc: '火焰范围技能留下燃烧地面（配合烈焰之刃）', modifier: old('t_scorched_earth') },
        { id: 'wf_cruel', name: '残忍', row: 3, col: 2, kind: 'rank', maxRank: 3, icon: 'it_axe', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },

        { id: 'wf_laststand', name: '背水一战', row: 4, col: 0, kind: 'rank', maxRank: 1, icon: 'tl_laststand', desc: '6 米内每有 1 个敌人，所有技能伤害 +8% 并吸血 3%（最多 5 个：+40%、吸血 15%）', modifier: old('t_last_stand') },
        { id: 'wf_rampage', name: '暴走', row: 4, col: 3, kind: 'rank', maxRank: 2, icon: 'tl_endless', desc: '旋风斩冷却 -{v}%，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 6, stats: { critDmg: 6 },
          modifier: { name: '暴走', desc: '', match: { skillIds: ['whirlwind'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.1 }] } },

        { id: 'wf_bloodwhirl', name: '血怒旋风', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_whirlwind',
          desc: '终极：旋风斩变为「血怒旋风」——伤害 +35%，半径 +1 米，回复造成伤害 20% 的生命',
          modifier: { name: '血怒旋风', desc: '', match: { skillIds: ['whirlwind'] }, priority: 30,
            ops: [{ op: 'rename', name: '血怒旋风' }, { op: 'addTag', value: 'blood' }, { op: 'mul', stat: 'damage', value: 0.35 }, { op: 'add', stat: 'radius', value: 1 },
                  { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.2 } }] } },   // v1.2.77 §7.6 暴怒生存 25% → 20%
      ] },

    // ==================== 防护：生命护甲、控制、反伤 ====================
    { id: 'w_prot', name: '防护', icon: 'tl_iron', desc: '生命护甲与控制，终极：盾墙反伤',
      nodes: [
        { id: 'wp_tough', name: '坚韧', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_tough', desc: '生命 +{v}', perRankShown: 60, stats: { hp: 60 } },
        { id: 'wp_iron', name: '钢铁皮肤', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_iron', desc: '护甲 +{v}', perRankShown: 12, stats: { armor: 12 } },   // v1.2.77 §7.6 铁壁生存：护甲减半（净承伤 ≥65%）

        { id: 'wp_quake', name: '震荡雷霆', row: 2, col: 0, kind: 'rank', maxRank: 1, icon: 'tl_quake', desc: '雷霆一击眩晕 1 秒并打断读条',
          modifier: { name: '震荡雷霆', desc: '', match: { skillIds: ['thunderclap'] }, priority: 40,
            ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 1 } }, { op: 'addEffect', effect: { type: 'interrupt' } }, { op: 'rename', prefix: '震荡' }] } },
        { id: 'wp_bulwark', name: '坚守', row: 2, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_thunderclap', desc: '雷霆一击伤害 +{v}%，范围 +{v2}%', perRankShown: 15, perRankShown2: 10,
          modifier: { name: '坚守', desc: '', match: { skillIds: ['thunderclap'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'mul', stat: 'radius', value: 0.1 }] } },

        { id: 'wp_endless', name: '无尽冲锋', row: 3, col: 0, kind: 'choice', maxRank: 1, icon: 'tl_endless', desc: '冲锋冷却 -40%',
          modifier: { name: '无尽冲锋', desc: '', match: { skillIds: ['charge'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.4 }] } },
        { id: 'wp_vigor', name: '活力', row: 3, col: 1, kind: 'rank', maxRank: 2, icon: 'it_chest', desc: '生命 +{v}', perRankShown: 80, stats: { hp: 80 } },
        { id: 'wp_bash', name: '盾牌猛击', row: 3, col: 3, kind: 'choice', maxRank: 1, icon: 'it_frost_shield', desc: '冲锋落地震击，对周围 3 米造成 50% 伤害',
          modifier: { name: '盾牌猛击', desc: '', match: { skillIds: ['charge'] }, priority: 40,
            ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.5 } }, { op: 'rename', prefix: '盾击' }] } },

        { id: 'wp_revenge', name: '复仇', row: 4, col: 0, kind: 'rank', maxRank: 1, icon: 'it_mace', desc: '英勇打击命中有 15% 几率重置雷霆一击冷却',
          modifier: { name: '复仇', desc: '', match: { skillIds: ['slash'] }, priority: 40, ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill3', chance: 0.15 } }] } },
        { id: 'wp_stance', name: '防御姿态', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'it_helm', desc: '护甲 +{v}，生命 +{v2}', perRankShown: 20, perRankShown2: 40, stats: { armor: 20, hp: 40 } },   // v1.2.77 护甲 40 → 20

        { id: 'wp_wall', name: '盾墙', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'it_shield',
          desc: '终极：天神下凡变为「盾墙」——伤害 -40%、冷却 -20 秒，释放后 8 秒内受到的伤害 -20%，并反弹 35% 给攻击者',
          modifier: { name: '盾墙', desc: '', match: { skillIds: ['avatar'] }, priority: 30,
            ops: [{ op: 'rename', name: '盾墙' }, { op: 'addTag', value: 'wall' }, { op: 'mul', stat: 'damage', value: -0.4 }, { op: 'add', stat: 'cooldown', value: -20 },
                  { op: 'addEffect', effect: { type: 'reflect', reduce: 0.2, percent: 0.35, duration: 8 } }] } },
      ] },
  ],
};

// ---------------------------------------------------------------- 阶段四：第 6 层（需要在本树投入 15 点），给 21~30 级的天赋点用
WARRIOR_TREE.tiers = 6;
const wSpec = (id: string) => WARRIOR_TREE.specs.find(s => s.id === id)!.nodes;
wSpec('w_arms').push(
  { id: 'wa6_master', name: '刃锋大师', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'it_greataxe', desc: '攻击强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
  { id: 'wa6_exec', name: '斩杀', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_slash', desc: '英勇打击 / 致死打击伤害 +{v}%', perRankShown: 15,
    modifier: { name: '斩杀', desc: '', match: { skillIds: ['slash'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
);
wSpec('w_fury').push(
  { id: 'wf6_frenzy', name: '无尽狂怒', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%，暴击率 +{v2}%', perRankShown: 3, perRankShown2: 1, stats: { haste: 3, crit: 1 } },
  { id: 'wf6_storm', name: '风暴旋舞', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_whirlwind', desc: '旋风斩伤害 +{v}%', perRankShown: 15,
    modifier: { name: '风暴旋舞', desc: '', match: { skillIds: ['whirlwind'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
);
wSpec('w_prot').push(
  { id: 'wp6_bulwark', name: '不动壁垒', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_iron', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 120, perRankShown2: 15, stats: { hp: 120, armor: 15 } },   // v1.2.77 护甲 30 → 15
  { id: 'wp6_quake', name: '震地余波', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'it_gauntlet', desc: '技能 1~3 伤害 +{v}%', perRankShown: 8,
    modifier: { name: '震地余波', desc: '', match: { slots: [...SK] }, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } },
);
