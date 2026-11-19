// ======================================================================
// DLC1「负棺人」：天赋树（3 专精）/ 符文 / 推荐配装 / 英灵 / 职业任务 / 重甲与葬棺底材 / 扩展天赋层 / 棺中魂（v1.0.7，d1.6）
// 只 import core 的类型（见 manifest.ts 约定）。数值初稿，整体平衡暂缓（Rhett 10-22）。
// ======================================================================
import type { TalentTreeDef, TalentNodeDef } from '../../core/TalentTree';
import type { ModifierDef, SlotId, EffectDef, ModOp } from '../../core/types';
import type { ItemBase } from '../../core/Loot';
import type { QuestDef } from '../../core/Quest';
import type { ClassBook, ClassResDef } from '../../core/ClassExt';
import type { PackTalentTierDef, PackTalentNodeDef } from '../../core/PackTalents';
import type { SpiritDef } from '../../data/spirits';
import { COFFIN_SKILLS, COFFIN_CHOICES, COFFIN_ROLES, COFFIN_ID, CSkill } from './coffin_skills';

type N = Omit<TalentNodeDef, 'modifier'> & { modifier?: TalentNodeDef['modifier'] };
const mod = (name: string, match: ModifierDef['match'], ops: ModOp[], priority?: number) => ({ name, desc: '', match, ops, ...(priority ? { priority } : {}) });

// ---------------------------------------------------------------- 天赋树：送葬者 / 饮血者 / 凋魂者（v1.2.77 方案 B，原守墓人 / 摆渡人，名字与机制由 coffin.ts 覆盖）（规则同本体：第 t 层需本树投入 3×(t-1) 点，终极在第 6 层）
// 只写了 id 的「机制天赋」由 coffin_runtime.ts 按 talentRank 读取
const UNDERTAKER: N[] = [
  { id: 'cs_iron', name: '铁棺', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '所有技能伤害 +{v}%', perRankShown: 4, modifier: mod('铁棺', {}, [{ op: 'mul', stat: 'damage', value: 0.04 }], 70) },
  { id: 'cs_power', name: '扛棺', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '攻击强度 +{v}', perRankShown: 8, stats: { power: 8 } },
  { id: 'cs_open', name: '开棺', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'sk_thunderclap', desc: '开棺伤害 +{v}%', perRankShown: 10 },
  { id: 'cs_res', name: '收殓', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_wrath', desc: '资源：精英 / 首领被你击杀时收 2 个魂' , resNode: true },
  { id: 'cs_crit', name: '验尸', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'it_dagger', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
  { id: 'cs_wake', name: '守灵', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_laststand', desc: '「未亡」冷却 -{v} 秒', perRankShown: 15 },
  { id: 'cs_critdmg', name: '钉棺', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
  { id: 'c_und_s4', name: '绝技·锋锐', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_weapon', desc: '技能 4（绝技）伤害 +25%', modifier: mod('绝技·锋锐', { slots: ['skill4'] }, [{ op: 'mul', stat: 'damage', value: 0.25 }]) },
  { id: 'cs_fresh', name: '新魂', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_haste', desc: '开棺后 6 秒内技能伤害 +{v}%', perRankShown: 8 },
  { id: 'cs_rite', name: '葬仪', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_avatar', desc: '大招伤害 +{v}%', perRankShown: 12, modifier: mod('葬仪', { slots: ['ultimate'] }, [{ op: 'mul', stat: 'damage', value: 0.12 }]) },
  { id: 'cs_full', name: '满棺齐放', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_bladestorm', desc: '绝技：开棺时棺里没满就瞬间补满魂（45 秒一次）；满魂开棺伤害 +50%' },
  { id: 'cs6_master', name: '送葬长', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '攻击强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
];
const WARDEN: N[] = [
  { id: 'cg_plate', name: '墓甲', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_tough', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 60, perRankShown2: 20, stats: { hp: 60, armor: 20 } },
  { id: 'cg_stone', name: '碑石', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'it_shield', desc: '护甲 +{v}', perRankShown: 30, stats: { armor: 30 } },
  { id: 'cg_echo', name: '回响', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_echo', desc: '墓碑回响伤害 +{v}%（基础 60%）', perRankShown: 10 },
  { id: 'cg_res', name: '墓魂', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_iron', desc: '资源：立棺时在墓碑 6 米内击杀的敌人多收 1 个魂', resNode: true },
  { id: 'cg_slow', name: '阴土', row: 3, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_frost_ring', desc: '墓碑周围减速再 +{v}%', perRankShown: 10 },
  { id: 'cg_guard', name: '守陵', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_iron', desc: '立棺时你在墓碑 8 米内受到伤害 -{v}%', perRankShown: 6 },
  { id: 'cg_armor', name: '铁封', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_shield', desc: '护甲 +{v}', perRankShown: 40, stats: { armor: 40 } },
  { id: 'c_war_s4', name: '绝技·扩张', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_quake', desc: '技能 4（绝技）范围 +25%，伤害 +10%', modifier: mod('绝技·扩张', { slots: ['skill4'] }, [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.1 }]) },
  { id: 'cg_reach', name: '墓域', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_quake', desc: '墓碑影响范围 +{v} 米', perRankShown: 1 },
  { id: 'cg_toll', name: '晚钟', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_battle_shout', desc: '技能 3 冷却 -{v} 秒', perRankShown: 1.5, modifier: mod('晚钟', { slots: ['skill3'] }, [{ op: 'add', stat: 'cooldown', value: -1.5 }]) },
  { id: 'cg_night', name: '血棺', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_laststand', desc: '绝技：开棺后 8 秒进入「血棺」：每个技能都消耗 3% 当前生命并化为一次暗影爆炸，技能伤害 6% 转为生命，所有吸血翻倍' },
  { id: 'cg6_master', name: '守墓长', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_tough', desc: '生命 +{v}，攻击强度 +{v2}', perRankShown: 80, perRankShown2: 6, stats: { hp: 80, power: 6 } },
];
const FERRYMAN: N[] = [
  { id: 'cr_chain', name: '棺链', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '背棺时技能伤害 +{v}%', perRankShown: 5 },
  { id: 'cr_haste', name: '夜渡', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%', perRankShown: 3, stats: { haste: 3 } },
  { id: 'cr_reach', name: '长链', row: 2, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_whirlwind', desc: '背棺链甩范围 +{v} 米', perRankShown: 0.6 },
  { id: 'cr_res', name: '渡魂', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_mark', desc: '资源：背棺时击杀有 30% 几率多收 1 个魂', resNode: true },
  { id: 'cr_crit', name: '暗流', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'it_dagger', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
  { id: 'cr_flow', name: '链舞', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'tl_haste', desc: '背棺链甩一次扫中 3 个以上敌人时，25% 几率重置技能 1' },
  { id: 'cr_critdmg', name: '摆尾', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
  { id: 'c_fer_s4', name: '绝技·迅捷', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_haste', desc: '技能 4（绝技）冷却 -20%', modifier: mod('绝技·迅捷', { slots: ['skill4'] }, [{ op: 'mul', stat: 'cooldown', value: -0.2 }]) },
  { id: 'cr_sweep', name: '回旋', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_whirlwind', desc: '链扫类技能（f_sweep）伤害 +{v}%', perRankShown: 10, modifier: mod('回旋', { tagsAll: ['f_sweep'] }, [{ op: 'mul', stat: 'damage', value: 0.1 }]) },
  { id: 'cr_speed', name: '轻棺', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_haste', desc: '移动速度 +{v}%，急速 +{v2}%', perRankShown: 3, perRankShown2: 2, stats: { speed: 3, haste: 2 } },
  { id: 'cr_styx', name: '冥河凋零', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_plague', desc: '绝技：目标侵蚀满 30 层后 8 秒内每秒受到其最大生命 1% 的暗影伤害（首领 / 精英每秒上限 20 + 3×等级）' },
  { id: 'cr6_master', name: '摆渡长', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_starfall', desc: '攻击强度 +{v}，暴击率 +{v2}%', perRankShown: 10, perRankShown2: 1, stats: { power: 10, crit: 1 } },
];
export const COFFIN_TREE: TalentTreeDef = {
  id: COFFIN_ID, name: '负棺人', tierCost: 3, tiers: 6,
  specs: [
    { id: 'c_und', name: '送葬者', icon: 'tl_wrath', desc: '暗影幽魂 · 收魂爆发 · 恐惧：五魂棺、魂爆、百鬼夜行，绝技：满棺齐放', nodes: UNDERTAKER as TalentNodeDef[] },
    { id: 'c_war', name: '饮血者', icon: 'tl_tough', desc: '消耗生命 · 吸血续航：血祭换伤害、饮魂回血，绝技：血棺', nodes: WARDEN as TalentNodeDef[] },
    { id: 'c_fer', name: '凋魂者', icon: 'tl_plague', desc: '紫色腐蚀 · 立棺墓碑 · 暗影持续 · 恐惧：主系时立棺成凋魂墓碑（回响 60%、碑周 5 米减速 30%、每 1 秒叠 1 层侵蚀），叠侵蚀、恐惧蔓延，绝技：冥河凋零', nodes: FERRYMAN as TalentNodeDef[] },
  ],
};

// ---------------------------------------------------------------- 扩展天赋层（31–40 级）+ 3 个终极新绝技
const sbase = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const U = (id: string, name: string, el: 'physical' | 'shadow', shape: CSkill['shape'], tags: string[], stats: Partial<CSkill['stats']>, effects: EffectDef[], desc: string) =>
  ({ cls: COFFIN_ID, id, name, slot: 'skill4' as SlotId, element: el, shape, tags: [...tags, 'coffin', 'skill4', 'dlc_ult'], stats: { ...sbase, ...stats }, effects, desc });
export const COFFIN_ULT_SKILLS = [
  U('cf_u_mountain', '埋骨山', 'shadow',   // v1.2.77 方案 B：负棺人三系均为暗影，绝技改暗影
    'circle', ['aoe', 'slam', 'f_sweep'], { damage: 150, cooldown: 15, radius: 6 }, [{ type: 'stun', duration: 1.2 }, { type: 'knockback', distance: 3 }], '把铁棺高举砸下，压出一座骨山（暗影）：震晕 1.2 秒、击退'),
  U('cf_u_warden', '腐冢永夜', 'shadow', 'circle', ['aoe', 'targeted', 'f_target'], { damage: 140, cooldown: 16, radius: 6, range: 16 }, [{ type: 'groundZone', element: 'shadow', dps: 24, radius: 5.5, duration: 6 }, { type: 'slow', percent: 0.4, duration: 3 }], '目标处降下永夜：6 秒暗影地，减速 40%'),
  U('cf_u_ferryman', '渡魂长链', 'shadow', 'line', ['aoe', 'line', 'f_line'], { damage: 160, cooldown: 14, radius: 3, range: 16 }, [{ type: 'chain', jumps: 2, radius: 6, damagePercent: 0.5 }, { type: 'resetCooldown', slot: 'skill1', chance: 0.4 }], '棺链拉成一条冥河（暗影）：连跳 2 次，40% 几率重置技能 1'),
];
const ult = (s: (typeof COFFIN_ULT_SKILLS)[number], _icon: string): PackTalentNodeDef => ({ id: `pt_${s.id}`, name: s.name, desc: `终极：学会新绝技「${s.name}」—— ${s.desc}`, icon: `sk_${s.id}`, skill: s.id });   // fix1109c #1：终极节点用绝技专属图标（与技能栏一致；原借本体通用图标）
export const COFFIN_TIER: PackTalentTierDef = {
  id: 'dlc1_coffin', name: '沉钟天赋', cls: COFFIN_ID, desc: '沉钟之海资料片专属：31–40 级的 5 个扩展天赋点只能用在这里。',
  layers: [
    [{ id: 'pc_tideplate', name: '潮蚀墓甲', desc: '生命 +1600，护甲 +400', icon: 'tl_tough', stats: { hp: 1600, armor: 400 } }],
    [{ id: 'pc_nail', name: '沉钟棺钉', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'tl_wrath', stats: { crit: 4, critDmg: 15 } },
     { id: 'pc_lid', name: '钟铜棺盖', desc: '护甲 +900，生命 +1200', icon: 'it_shield', stats: { armor: 900, hp: 1200 } }],
    [{ id: 'pc_coffinecho', name: '棺中回声', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '棺中回声', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'pc_drag', name: '潮拖', desc: '技能 1 伤害 +30%，冷却 -15%', icon: 'sk_charge', modifier: { name: '潮拖', desc: '', match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] } },
     { id: 'pc_whirl', name: '漩涡棺链', desc: '技能 2 范围 +25%，伤害 +15%', icon: 'sk_whirlwind', modifier: { name: '漩涡棺链', desc: '', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.15 }] } }],
    [ult(COFFIN_ULT_SKILLS[0], 'tl_quake'), ult(COFFIN_ULT_SKILLS[1], 'sk_war_banner'), ult(COFFIN_ULT_SKILLS[2], 'sk_bladestorm')],
  ],
};

// ---------------------------------------------------------------- 符文（每个技能 3 枚，熟练度 100 / 300 / 600）
type Rune = ClassBook['runes'][number];
const R = (skillId: string, i: number, name: string, desc: string, ops: ModOp[]): Rune =>
  ({ id: `r_${skillId}_${i + 1}`, skillId, name, desc, need: [100, 300, 600][i], modifier: { id: `r_${skillId}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [skillId] }, priority: 40, ops } });
const mul = (stat: 'damage' | 'cooldown' | 'radius' | 'range', v: number): ModOp => ({ op: 'mul', stat, value: v });
const fx = (e: EffectDef): ModOp => ({ op: 'addEffect', effect: e });
const THEME: Record<string, [string, string, ModOp[]]> = {
  cf_drag: ['碾骨', '附带 4 秒流血', [fx({ type: 'dot', element: 'physical', dps: 6, duration: 4 })]],
  cf_vault: ['坠棺', '落地震晕 0.6 秒', [fx({ type: 'stun', duration: 0.6 })]],
  cf_shroudstep: ['阴风', '冷却 -25%', [mul('cooldown', -0.25)]],
  cf_sweep: ['铁锈', '附带 4 秒流血', [fx({ type: 'dot', element: 'physical', dps: 7, duration: 4 })]],
  cf_drop: ['封土', '留下 4 秒墓土（每秒伤害）', [fx({ type: 'groundZone', element: 'shadow', dps: 12, radius: 3, duration: 4 })]],
  cf_chainline: ['锁喉', '附带 0.8 秒眩晕', [fx({ type: 'stun', duration: 0.8 })]],
  cf_toll: ['长鸣', '减速提高到 55%', [fx({ type: 'slow', percent: 0.55, duration: 3 })]],
  cf_bind: ['死扣', '击晕 +0.6 秒', [fx({ type: 'stun', duration: 1.8 })]],
  cf_shroud: ['尸蜡', '反弹提高到 25%', [fx({ type: 'reflect', reduce: 0.3, percent: 0.25, duration: 6 })]],
  cf_procession: ['长队', '附带 1 秒眩晕', [fx({ type: 'stun', duration: 1 })]],
  cf_gravefield: ['乱葬', '墓土每秒伤害 +60%', [fx({ type: 'groundZone', element: 'shadow', dps: 9, radius: 4, duration: 5 })]],
  cf_requiem: ['挽歌', '附带 5 秒暗影侵蚀', [fx({ type: 'dot', element: 'shadow', dps: 18, duration: 5 })]],
  cf_hundred: ['千棺', '范围 +30%', [mul('radius', 0.3)]],
  cf_ferry: ['彼岸', '护盾提高到最大生命 30%', [fx({ type: 'shield', percentMaxHp: 0.1, duration: 6 })]],
};
const ALL_SKILLS: { id: string; slot: SlotId; stats: CSkill['stats'] }[] = [...COFFIN_SKILLS, ...COFFIN_ULT_SKILLS];
export const COFFIN_RUNES: Rune[] = ALL_SKILLS.filter(s => s.slot !== 'basic').flatMap(s => {
  const t = THEME[s.id] ?? ['强击', '伤害 +25%', [mul('damage', 0.25)]];
  return [
    R(s.id, 0, t[0], t[1], t[2]),
    R(s.id, 1, '迅捷', '冷却 -20%', [mul('cooldown', -0.2)]),
    s.stats.radius > 0 ? R(s.id, 2, '扩张', '范围 +30%，伤害 +10%', [mul('radius', 0.3), mul('damage', 0.1)]) : R(s.id, 2, '远链', '射程 +4 米，伤害 +15%', [{ op: 'add', stat: 'range', value: 4 }, mul('damage', 0.15)]),
  ];
});
export const COFFIN_PRESETS: ClassBook['presets'] = [
  { id: 'p_c_und', cls: COFFIN_ID, name: '送葬者', desc: '背棺冲进怪堆收魂，凑齐 3 个魂开棺打组合技', skills: { skill1: 'cf_drag', skill2: 'cf_sweep', skill3: 'cf_toll', skill4: 'cf_procession', ultimate: 'cf_hundred' }, runes: { cf_drag: 'r_cf_drag_1', cf_sweep: 'r_cf_sweep_1' } },
  { id: 'p_c_war', cls: COFFIN_ID, name: '饮血者', desc: '血祭换伤害，饮魂回血顶在怪堆里；开棺进血棺，消耗的生命化为暗影爆炸', skills: { skill1: 'cf_drag', skill2: 'cf_sweep', skill3: 'cf_shroud', skill4: 'cf_procession', ultimate: 'cf_requiem' }, runes: { cf_sweep: 'r_cf_sweep_1', cf_shroud: 'r_cf_shroud_1' } },
  { id: 'p_c_fer', cls: COFFIN_ID, name: '凋魂者', desc: '立棺成凋魂墓碑站桩打：技能从墓碑处回响（60%），碑周敌人减速并持续叠紫色侵蚀，满 10 层恐惧、满 30 层冥河凋零', skills: { skill1: 'cf_shroudstep', skill2: 'cf_drop', skill3: 'cf_shroud', skill4: 'cf_gravefield', ultimate: 'cf_ferry' }, runes: { cf_drop: 'r_cf_drop_1', cf_gravefield: 'r_cf_gravefield_1' } },
];
export const COFFIN_BOOK: ClassBook = {
  choices: { ...COFFIN_CHOICES, skill4: [...(COFFIN_CHOICES.skill4 ?? []), ...COFFIN_ULT_SKILLS.map(s => s.id)] },
  roles: COFFIN_ROLES, runes: COFFIN_RUNES, presets: COFFIN_PRESETS,
};

// ---------------------------------------------------------------- 棺中魂（资源条只是显示；魂的种类由 coffin_runtime.ts 记）
export const COFFIN_RES: ClassResDef = {
  kind: 'soul', name: '棺中魂', max: 3, threshold: 3, show: 'dots', color: '#9a90c0', full: '#e0d0ff', decayDelay: 1e9, decayPerSec: 0, gainBasic: 0, gainSkillHit: 0,
  desc: '击杀敌人把魂收进棺里（最多 3 个，不会衰减）：野兽 / 人形 / 巨躯 / 异类。X 开棺一次放出所有魂，按组合出招；生命归零时每个魂换 15% 生命复活（未亡）',
};

// ---------------------------------------------------------------- 英灵（12 个：6 个常规 + 6 个暗岩印记）
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sm = (id: string, name: string, match: ModifierDef['match'], ops: ModOp[]): ModifierDef => ({ id: `spirit:${id}`, name, desc: '', source: 'buff', match, ops, priority: 30 });
const dmg = (v: number): ModOp => ({ op: 'more', stat: 'damage', value: v });
const SP = (id: string, name: string, title: string, icon: string, color: string, unlock: SpiritDef['unlock'], desc: (t: number) => string, mods: (t: number) => ModifierDef[], lore: string): SpiritDef =>
  ({ id, cls: COFFIN_ID, name, title, icon, color, unlock, desc, mods, lore });
export const COFFIN_SPIRITS: SpiritDef[] = [
  SP('c_oldbearer', '老抬棺人', '负重', 'tl_tough', '#b0a090', { stat: 'level', n: 10 }, t => `所有技能伤害 +${pct(0.04 * t)}`, t => [sm('c_oldbearer', '负重', {}, [dmg(0.04 * t)])],
    '「棺材越沉，走得越稳。」他把棺链的第一个扣交到你手里。'),
  SP('c_mourner', '哭丧妇', '恸哭', 'sk_battle_shout', '#c0b0d0', { stat: 'dungeon', n: 3 }, t => `技能 3 伤害 +${pct(0.1 * t)}`, t => [sm('c_mourner', '恸哭', { slots: ['skill3'] }, [dmg(0.1 * t)])],
    '她哭过的每一场葬礼，死者都走得很安心。'),
  SP('c_digger', '掘墓人', '深掘', 'sk_quake', '#a08060', { stat: 'elite', n: 5 }, t => `技能 2 伤害 +${pct(0.08 * t)}，范围 +${pct(0.04 * t)}`, t => [sm('c_digger', '深掘', { slots: ['skill2'] }, [dmg(0.08 * t), { op: 'mul', stat: 'radius', value: 0.04 * t }])],
    '他挖过的坑比走过的路还多。'),
  SP('c_lantern', '提灯人', '引路', 'tl_starfall', '#e0c070', { stat: 'dungeon', n: 8 }, t => `开棺伤害 +${pct(0.08 * t)}`, t => [sm('c_lantern', '引路', { tagsAll: ['opencoffin'] }, [dmg(0.08 * t)])],
    '灯一亮，迷路的魂就知道往哪走。'),
  SP('c_frostbier', '霜棺', '冻土', 'sk_frost_ring', '#a0e8ff', { stat: 'raid', n: 1 }, t => `技能 1 伤害 +${pct(0.08 * t)}，命中减速 ${20 + 5 * t}%`, t => [sm('c_frostbier', '冻土', { slots: ['skill1'] }, [dmg(0.08 * t), { op: 'addEffect', effect: { type: 'slow', percent: (20 + 5 * t) / 100, duration: 2 } }])],
    '永霜之下埋着一口冰棺，里面的人还在等春天。'),
  SP('c_epitaph', '刻碑匠', '铭文', 'it_signet', '#ffd070', { stat: 'runeword', n: 3 }, t => `技能 4 伤害 +${pct(0.08 * t)}`, t => [sm('c_epitaph', '铭文', { slots: ['skill4'] }, [dmg(0.08 * t)])],
    '他刻的碑文，连死人都会念。'),
  SP('c_p_drowned', '溺钟人', '沉钟', 'sk_thunderclap', '#7fe8f0', { stat: 'paragon', n: 1 }, t => `普攻伤害 +${pct(0.06 * t)}`, t => [sm('c_p_drowned', '沉钟', { slots: ['basic'] }, [dmg(0.06 * t)])],
    '他跟着钟一起沉进海里，每次涨潮都会再敲一下。'),
  SP('c_p_bier', '灵车夫', '赶路', 'sk_charge', '#c89a40', { stat: 'paragon', n: 5 }, t => `技能 1 冷却 -${pct(0.05 * t)}`, t => [sm('c_p_bier', '赶路', { slots: ['skill1'] }, [{ op: 'mul', stat: 'cooldown', value: -0.05 * t }])],
    '灵车从不迟到，只是有时候早到。'),
  SP('c_p_raven', '守坟鸦', '啄目', 'tl_mark', '#6a6090', { stat: 'paragon', n: 10 }, t => `暗影伤害 +${pct(0.08 * t)}`, t => [sm('c_p_raven', '啄目', { elements: ['shadow'] }, [dmg(0.08 * t)])],
    '它记得每一块墓碑下埋的是谁。'),
  SP('c_p_stone', '无名碑', '长眠', 'it_shield', '#a0a0a0', { stat: 'paragon', n: 20 }, t => `大招伤害 +${pct(0.08 * t)}，附带按伤害 ${5 * t}% 回血`, t => [sm('c_p_stone', '长眠', { slots: ['ultimate'] }, [dmg(0.08 * t), { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.05 * t } }])],
    '碑上没有名字，所以谁都可以在它面前停一会儿。'),
  SP('c_p_styx', '冥河船夫', '引魂', 'tl_plague', '#60a0c0', { stat: 'paragon', n: 35 }, t => `技能 2 冷却 -${pct(0.05 * t)}，伤害 +${pct(0.06 * t)}`, t => [sm('c_p_styx', '引魂', { slots: ['skill2'] }, [dmg(0.06 * t), { op: 'mul', stat: 'cooldown', value: -0.05 * t }])],
    '船费是一枚铜钱，或者一个故事。'),
  SP('c_p_dark', '暗岩之魂', '岩心', 'it_reagent', '#ff7040', { stat: 'paragon', n: 50 }, t => `所有技能伤害 +${pct(0.05 * t)}`, t => [sm('c_p_dark', '岩心', {}, [dmg(0.05 * t)])],
    '暗岩深处有一颗心脏，它认得每一个回来的人。'),
];

// ---------------------------------------------------------------- 职业任务「负棺遗诏」（2 个，各 +1 天赋点）
export const CQ = ['cq_coffin1', 'cq_coffin2'] as const;
export const COFFIN_QUESTS: (QuestDef & { perk: string })[] = [
  { id: CQ[0], cls: COFFIN_ID, name: '负棺遗诏 · 魂灯', giver: 'hela', turnIn: 'hela', minLevel: 10,
    text: '你背上那口棺……我年轻时见过一次。老人们管背棺的人叫「送葬者」，死不了，也活不成，一辈子替别人收魂。矿洞里那些死了还在挖矿的矿工，魂都困在灯里。去把三盏魂灯拿回来，让我看看那口棺认不认它们。',
    doneText: '灯一靠近，棺盖就自己响了。它认你。往后你躺进去的时候，会醒得快一些。',
    objectives: [{ type: 'collect', target: 'miner', chance: 0.6, count: 3, label: '矿工魂灯' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } }, perk: '负棺遗诏：「未亡」冷却 -20 秒 · 天赋点 +1' },
  { id: CQ[1], cls: COFFIN_ID, name: '负棺遗诏 · 棺钉', giver: 'ayla', turnIn: 'ayla', minLevel: 22, requires: [CQ[0]],
    text: '赫拉说你的棺材缺了钉子。送葬者的棺要用冷火和寒核淬过的钉子封，不然魂放出来就收不回去。霜狼的心火、冰元素的寒核——各取几份来。',
    doneText: '钉子钉进去，棺盖上浮出一行字：「来者不拒，去者不留。」……你开棺的时候，魂会更听话。',
    objectives: [{ type: 'collect', target: 'frost_wolf', chance: 0.6, count: 3, label: '霜狼心火' }, { type: 'collect', target: 'ice_elemental', chance: 0.6, count: 2, label: '冰元素寒核' }],
    reward: { xp: 4200, gold: 520, item: { minQuality: 'orange' } }, perk: '负棺遗诏：开棺伤害 +20% · 天赋点 +1' },
];

// ---------------------------------------------------------------- 底材：重甲 8 件 + 葬棺
export const COFFIN_BASES: ItemBase[] = [
  { id: 'b_c_helm', name: '送葬铁面', slot: 'head', armorType: 'plate', hp: 42, armor: 21, cls: COFFIN_ID },
  { id: 'b_c_pauldron', name: '棺钉肩甲', slot: 'shoulder', armorType: 'plate', hp: 31, armor: 17, cls: COFFIN_ID },
  { id: 'b_c_chest', name: '负棺胸甲', slot: 'chest', armorType: 'plate', hp: 72, armor: 42, cls: COFFIN_ID },
  { id: 'b_c_bracer', name: '锁链护腕', slot: 'wrist', armorType: 'plate', hp: 19, armor: 10, cls: COFFIN_ID },
  { id: 'b_c_gauntlet', name: '扛棺铁手', slot: 'hands', armorType: 'plate', hp: 25, armor: 14, cls: COFFIN_ID },
  { id: 'b_c_girdle', name: '寿衣束带', slot: 'waist', armorType: 'plate', hp: 23, armor: 12, cls: COFFIN_ID },
  { id: 'b_c_legs', name: '墓土护腿', slot: 'legs', armorType: 'plate', hp: 52, armor: 29, cls: COFFIN_ID },
  { id: 'b_c_sabaton', name: '送葬铁靴', slot: 'feet', armorType: 'plate', hp: 27, armor: 15, cls: COFFIN_ID },
  { id: 'b_c_coffin', name: '铁葬棺', slot: 'twoHand', weaponType: 'coffin', hp: 40, armor: 20, cls: COFFIN_ID, bonus: { power: 30, crit: 1, critDmg: 6 } },
];
export const COFFIN_BASE_ICONS: Record<string, string> = {
  b_c_helm: 'it_helm', b_c_pauldron: 'it_plate_shoulder', b_c_chest: 'it_pauldron', b_c_bracer: 'it_bracer', b_c_gauntlet: 'it_gauntlet', b_c_girdle: 'it_girdle', b_c_legs: 'it_sabaton', b_c_sabaton: 'it_plate_boots',
  b_c_coffin: 'it_coffin',
};
