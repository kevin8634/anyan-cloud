// 时砂行者天赋（阶段七，原创）：时痕 / 回声 / 回溯 三系，规则同其他职业：第 t 层需要在本树投入 3×(t-1) 点
// 带 modifier / stats 的节点走通用系统；只写了 id 的「机制天赋」由 web/chrono.ts 按 tree.rank(id) 读取
// 时轮投掷的三种「形态」跨树互斥（group: 'wheel'）
import { TalentTreeDef } from '../core/TalentTree';

export const CHRONO_TREE: TalentTreeDef = {
  id: 'chrono', name: '时砂行者', tierCost: 3, tiers: 6,
  specs: [
    // ==================== 时痕：延时伤害、引爆 ====================
    { id: 'c_mark', name: '时痕', icon: 'tl_mark', desc: '把伤害存进时间里，一刻引爆，终极：命定之刻',
      nodes: [
        { id: 'cm_edge', name: '锋锐沙刃', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'it_chakram', desc: '所有技能伤害 +{v}%', perRankShown: 4,
          modifier: { name: '锋锐沙刃', desc: '', match: {}, priority: 70, ops: [{ op: 'mul', stat: 'damage', value: 0.04 }] } },
        { id: 'cm_power', name: '刺客本能', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '攻击强度 +{v}（每点技能伤害 +0.4%）', perRankShown: 8, stats: { power: 8 } },

        { id: 'cm_heavy', name: '沉沙之轮', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'wheel', icon: 'sk_chrono_throw', desc: '时轮投掷形态：去程命中也叠 1 层时痕，伤害 +10%',
          modifier: { name: '沉沙之轮', desc: '', match: { skillIds: ['chrono_throw'] }, priority: 10,
            ops: [{ op: 'addTag', value: 'mark_out' }, { op: 'mul', stat: 'damage', value: 0.1 }, { op: 'rename', prefix: '沉沙' }] } },
        { id: 'cm_store', name: '深痕', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_mark', desc: '时痕每层储存的伤害 +{v}%（基础 10%）', perRankShown: 2 },

        { id: 'cm_crit', name: '致命间隙', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'it_dagger', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
        { id: 'cm_spread', name: '碎时', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'sk_stasis', desc: '时痕引爆时，对周围 4 米的敌人造成 50% 引爆伤害并各叠 1 层时痕' },

        { id: 'cm_critdmg', name: '一瞬', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
        { id: 'cm_stasis', name: '定格大师', row: 4, col: 3, kind: 'rank', maxRank: 2, icon: 'sk_stasis', desc: '停滞之刻伤害 +{v}%，冷却 -{v2} 秒', perRankShown: 20, perRankShown2: 1.5,
          modifier: { name: '定格大师', desc: '', match: { skillIds: ['stasis'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'add', stat: 'cooldown', value: -1.5 }] } },

        { id: 'cm_doom', name: '命定之刻', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_final_moment',
          desc: '终极：时痕引爆伤害 ×1.6；引爆后 2 秒内暴击率 +25%' },
        { id: 'cm6_master', name: '时痕宗师', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_mark', desc: '攻击强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
        { id: 'cm6_throw', name: '回旋锋', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_chrono_throw', desc: '时轮投掷伤害 +{v}%', perRankShown: 15,
          modifier: { name: '回旋锋', desc: '', match: { skillIds: ['chrono_throw'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
      ] },

    // ==================== 回声：分身重放 ====================
    { id: 'c_echo', name: '回声', icon: 'tl_ghost', desc: '同一处打两轮，终极：平行回响',
      nodes: [
        { id: 'ce_spin', name: '千刃', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_blade_spin', desc: '千刃回旋伤害 +{v}%', perRankShown: 8,
          modifier: { name: '千刃', desc: '', match: { skillIds: ['blade_spin'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } },
        { id: 'ce_haste', name: '流沙', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%', perRankShown: 3, stats: { haste: 3 } },

        { id: 'ce_twin', name: '双生之轮', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'wheel', icon: 'tl_ghost', desc: '时轮投掷形态：每次投掷 2 枚时轮（第二枚打附近另一个敌人），每枚伤害 -20%',
          modifier: { name: '双生之轮', desc: '', match: { skillIds: ['chrono_throw'] }, priority: 10,
            ops: [{ op: 'add', stat: 'projectileCount', value: 1 }, { op: 'mul', stat: 'damage', value: -0.2 }, { op: 'rename', prefix: '双生' }] } },
        { id: 'ce_power', name: '残响', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_echo', desc: '回声伤害 +{v}%（基础 50%）', perRankShown: 10 },

        { id: 'ce_step', name: '影步', row: 3, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_sand_step', desc: '沙影步冷却 -{v}%，伤害 +{v2}%', perRankShown: 12, perRankShown2: 15,
          modifier: { name: '影步', desc: '', match: { skillIds: ['sand_step'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.12 }, { op: 'mul', stat: 'damage', value: 0.15 }] } },
        { id: 'ce_mark', name: '回声刻印', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'tl_mark', desc: '回声命中也会叠时痕' },

        { id: 'ce_speed', name: '轻身', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_leather_boots', desc: '移动速度 +{v}%', perRankShown: 5, stats: { speed: 5 } },
        { id: 'ce_fan', name: '扇面', row: 4, col: 2, kind: 'rank', maxRank: 1, icon: 'sk_blade_spin', desc: '千刃回旋多飞出 1 枚时轮',
          modifier: { name: '扇面', desc: '', match: { skillIds: ['blade_spin'] }, priority: 40, ops: [{ op: 'add', stat: 'projectileCount', value: 1 }] } },

        { id: 'ce_parallel', name: '平行回响', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_ghost',
          desc: '终极：回声会重放两次（2 秒、3.5 秒），停滞之刻和时轮投掷也会被回声重放' },
        { id: 'ce6_flow', name: '时流', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%，暴击率 +{v2}%', perRankShown: 3, perRankShown2: 1, stats: { haste: 3, crit: 1 } },
        { id: 'ce6_spin', name: '回旋风暴', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_blade_spin', desc: '千刃回旋伤害 +{v}%', perRankShown: 15,
          modifier: { name: '回旋风暴', desc: '', match: { skillIds: ['blade_spin'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
      ] },

    // ==================== 回溯：生存与机动 ====================
    { id: 'c_rewind', name: '回溯', icon: 'sk_rewind', desc: '倒转时间躲过致命一击，终极：永恒一瞬',
      nodes: [
        { id: 'cr_tough', name: '韧皮', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'it_leather_vest', desc: '生命 +{v}', perRankShown: 60, stats: { hp: 60 } },
        { id: 'cr_armor', name: '硬化皮革', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_leather_shoulder', desc: '护甲 +{v}', perRankShown: 20, stats: { armor: 20 } },

        { id: 'cr_sand', name: '沙漏之轮', row: 2, col: 0, kind: 'choice', maxRank: 1, group: 'wheel', icon: 'it_hourglass', desc: '时轮投掷形态：暴击额外返还 0.5 格时砂，命中减速 20%',
          modifier: { name: '沙漏之轮', desc: '', match: { skillIds: ['chrono_throw'] }, priority: 10,
            ops: [{ op: 'addTag', value: 'sand_refund' }, { op: 'addEffect', effect: { type: 'slow', percent: 0.2, duration: 2 } }, { op: 'rename', prefix: '沙漏' }] } },
        { id: 'cr_cd', name: '倒流', row: 2, col: 2, kind: 'rank', maxRank: 3, icon: 'sk_rewind', desc: '回溯冷却 -{v} 秒', perRankShown: 1.5 },

        { id: 'cr_heal', name: '复原', row: 3, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_tough', desc: '回溯最多恢复的生命 +{v}%（基础 25%）', perRankShown: 10 },
        { id: 'cr_blast', name: '时爆', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'sk_final_moment', desc: '回溯时在离开的位置留下时砂爆炸（半径 4 米，伤害 = 沙影步的 120%）' },

        { id: 'cr_max', name: '满溢', row: 4, col: 0, kind: 'rank', maxRank: 1, icon: 'it_hourglass', desc: '时砂上限 +1' },
        { id: 'cr_ult', name: '漫长一刻', row: 4, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_final_moment', desc: '终刻冷却 -{v} 秒，时停 +{v2} 秒', perRankShown: 6, perRankShown2: 0.5,
          modifier: { name: '漫长一刻', desc: '', match: { skillIds: ['final_moment'] }, ops: [{ op: 'add', stat: 'cooldown', value: -6 }] } },

        { id: 'cr_eternal', name: '永恒一瞬', row: 5, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_rewind',
          desc: '终极：回溯后 3 秒内必定暴击，并返还 1 格时砂' },
        { id: 'cr6_wall', name: '不动沙丘', row: 6, col: 0, kind: 'rank', maxRank: 3, icon: 'it_leather_vest', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 90, perRankShown2: 20, stats: { hp: 90, armor: 20 } },
        { id: 'cr6_step', name: '无痕', row: 6, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_sand_step', desc: '沙影步伤害 +{v}%', perRankShown: 20,
          modifier: { name: '无痕', desc: '', match: { skillIds: ['sand_step'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] } },
      ] },
  ],
};
