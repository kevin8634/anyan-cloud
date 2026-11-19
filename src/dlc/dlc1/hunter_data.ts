// ======================================================================
// DLC1「灵契猎手」：天赋树（3 专精）/ 符文 / 推荐配装 / 英灵 / 职业任务 / 链甲与武器底材 / 扩展天赋层 / 兽魂（v1.0.6，d1.5）
// 只 import core 的类型（见 manifest.ts 约定）。数值初稿，整体平衡暂缓（Rhett 10-22）。
// ======================================================================
import type { TalentTreeDef, TalentNodeDef } from '../../core/TalentTree';
import type { ModifierDef, SlotId, EffectDef, ModOp } from '../../core/types';
import type { ItemBase } from '../../core/Loot';
import type { QuestDef } from '../../core/Quest';
import type { ClassBook, ClassResDef } from '../../core/ClassExt';
import type { PackTalentTierDef, PackTalentNodeDef } from '../../core/PackTalents';
import type { SpiritDef, ResBonus } from '../../data/spirits';
import { HUNTER_SKILLS, HUNTER_CHOICES, HUNTER_ROLES, HUNTER_ID, HSkill } from './hunter_skills';

type N = Omit<TalentNodeDef, 'modifier'> & { modifier?: TalentNodeDef['modifier'] };
const mod = (name: string, match: ModifierDef['match'], ops: ModOp[], priority?: number) => ({ name, desc: '', match, ops, ...(priority ? { priority } : {}) });

// ---------------------------------------------------------------- 天赋树：狼群 / 巨熊 / 苍鹰（规则同本体：第 t 层需本树投入 3×(t-1) 点，终极在第 6 层）
// 带 modifier / stats / res 的节点走通用系统；只写了 id 的「机制天赋」由 hunter_runtime.ts 按 talentRank 读取
const WOLF: N[] = [
  { id: 'hw_fang', name: '利齿', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '所有技能伤害 +{v}%', perRankShown: 4, modifier: mod('利齿', {}, [{ op: 'mul', stat: 'damage', value: 0.04 }], 70) },
  { id: 'hw_haste', name: '疾奔', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '急速 +{v}%', perRankShown: 3, stats: { haste: 3 } },
  { id: 'hw_bleed', name: '撕裂', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_wrath', desc: '对流血中的敌人伤害 +{v}%', perRankShown: 3 },
  { id: 'hw_res', name: '狼魂', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_wrath', desc: '资源：兽魂获取 +25%', res: { gainMul: 0.25 }, resNode: true },
  { id: 'hw_crit', name: '猎杀本能', row: 3, col: 0, kind: 'rank', maxRank: 3, icon: 'it_dagger', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
  { id: 'hw_pack', name: '群狼', row: 3, col: 2, kind: 'rank', maxRank: 1, icon: 'sk_whirlwind', desc: '狼契普攻第 3 下的撕咬伤害 ×2 → ×2.5' },
  { id: 'hw_critdmg', name: '咽喉', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
  { id: 'h_wolf_s4', name: '绝技·锋锐', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_weapon', desc: '技能 4（绝技）伤害 +25%', modifier: mod('绝技·锋锐', { slots: ['skill4'] }, [{ op: 'mul', stat: 'damage', value: 0.25 }]) },
  { id: 'hw_frenzy', name: '狂乱', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'tl_haste', desc: '狼契技能冷却再 -{v}%', perRankShown: 5 },
  { id: 'hw_rend', name: '血痕', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_wrath', desc: '狼契技能附带的流血每秒伤害 +{v}', perRankShown: 3,
    modifier: mod('血痕', { tagsAll: ['wolf'] }, [{ op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 3, duration: 4 } }], 80) },
  { id: 'hw_alpha', name: '头狼', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'sk_bladestorm', desc: '终极：狼契命中流血中的敌人回复 2 兽魂；换形技「群狼扑袭」伤害 ×2' },
  { id: 'hw6_master', name: '狼王', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '攻击强度 +{v}，暴击伤害 +{v2}%', perRankShown: 10, perRankShown2: 5, stats: { power: 10, critDmg: 5 } },
];
const BEAR: N[] = [
  { id: 'hb_hide', name: '厚毛', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_tough', desc: '生命 +{v}，护甲 +{v2}', perRankShown: 60, perRankShown2: 20, stats: { hp: 60, armor: 20 } },
  { id: 'hb_power', name: '蛮力', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_weapon', desc: '攻击强度 +{v}', perRankShown: 8, stats: { power: 8 } },
  { id: 'hb_sunder', name: '碎甲', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'it_mace', desc: '破甲每层再 +{v}% 受到伤害', perRankShown: 1 },
  { id: 'hb_res', name: '熊魂', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_iron', desc: '资源：兽魂脱战后多保留 3 秒才开始衰减', res: { delayAdd: 3 }, resNode: true },
  { id: 'hb_quake', name: '震地', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'sk_quake', desc: '熊契的自身范围技能范围 +20%',
    modifier: mod('震地', { tagsAll: ['bear', 'f_nova'] }, [{ op: 'mul', stat: 'radius', value: 0.2 }], 80) },
  { id: 'hb_thick', name: '岩皮', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_iron', desc: '熊契受到伤害再 -{v}%', perRankShown: 5 },
  { id: 'hb_armor', name: '铁鬃', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_shield', desc: '护甲 +{v}', perRankShown: 40, stats: { armor: 40 } },
  { id: 'h_bear_s4', name: '绝技·扩张', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_quake', desc: '技能 4（绝技）范围 +25%，伤害 +10%', modifier: mod('绝技·扩张', { slots: ['skill4'] }, [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.1 }]) },
  { id: 'hb_slam', name: '熊掌', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_thunderclap', desc: '熊契技能伤害再 +{v}%', perRankShown: 8 },
  { id: 'hb_roar', name: '咆哮', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_battle_shout', desc: '技能 3 冷却 -{v} 秒', perRankShown: 1.5,
    modifier: mod('咆哮', { slots: ['skill3'] }, [{ op: 'add', stat: 'cooldown', value: -1.5 }]) },
  { id: 'hb_ursoc', name: '巨熊之怒', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_laststand', desc: '终极：破甲上限 5 → 8 层；目标破甲 ≥5 层时你对它的伤害再 +25%' },
  { id: 'hb6_master', name: '熊王', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_tough', desc: '生命 +{v}，攻击强度 +{v2}', perRankShown: 80, perRankShown2: 6, stats: { hp: 80, power: 6 } },
];
const EAGLE: N[] = [
  { id: 'he_eye', name: '鹰眼', row: 1, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_starfall', desc: '暴击率 +{v}%', perRankShown: 2, stats: { crit: 2 } },
  { id: 'he_range', name: '远眺', row: 1, col: 2, kind: 'rank', maxRank: 3, icon: 'tl_haste', desc: '鹰契技能射程 +{v} 米，伤害 +{v2}%', perRankShown: 2, perRankShown2: 4 },
  { id: 'he_mark', name: '猎印', row: 2, col: 0, kind: 'rank', maxRank: 3, icon: 'tl_mark', desc: '标记的增伤再 +{v}%', perRankShown: 4 },
  { id: 'he_res', name: '鹰魂', row: 2, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_mark', desc: '资源：兽魂强化门槛 40 → 30', res: { thrAdd: -10 }, resNode: true },
  { id: 'he_volley', name: '连射', row: 3, col: 0, kind: 'rank', maxRank: 1, icon: 'sk_blade_spin', desc: '鹰契普攻多射 1 枚羽矢（每枚伤害 -20%）' },
  { id: 'he_haste', name: '迅翼', row: 3, col: 2, kind: 'rank', maxRank: 2, icon: 'tl_haste', desc: '急速 +{v}%，移动速度 +{v2}%', perRankShown: 3, perRankShown2: 2, stats: { haste: 3, speed: 2 } },
  { id: 'he_critdmg', name: '穿心', row: 4, col: 0, kind: 'rank', maxRank: 2, icon: 'it_dagger', desc: '暴击伤害 +{v}%', perRankShown: 12, stats: { critDmg: 12 } },
  { id: 'h_eagle_s4', name: '绝技·迅捷', row: 4, col: 3, kind: 'rank', maxRank: 1, icon: 'tl_haste', desc: '技能 4（绝技）冷却 -20%', modifier: mod('绝技·迅捷', { slots: ['skill4'] }, [{ op: 'mul', stat: 'cooldown', value: -0.2 }]) },
  { id: 'he_dive', name: '俯冲', row: 5, col: 0, kind: 'rank', maxRank: 2, icon: 'sk_meteor', desc: '换形技「苍鹰俯冲」伤害 +{v}%', perRankShown: 25 },
  { id: 'he_feather', name: '羽刃', row: 5, col: 2, kind: 'rank', maxRank: 2, icon: 'sk_blade_spin', desc: '技能 2 伤害 +{v}%', perRankShown: 12,
    modifier: mod('羽刃', { slots: ['skill2'] }, [{ op: 'mul', stat: 'damage', value: 0.12 }]) },
  { id: 'he_sky', name: '天空之王', row: 6, col: 1, kind: 'rank', maxRank: 1, capstone: true, icon: 'tl_starfall', desc: '终极：标记增伤再 +10%；鹰契普攻打中标记目标回复 3 兽魂' },
  { id: 'he6_master', name: '鹰王', row: 6, col: 3, kind: 'rank', maxRank: 3, icon: 'tl_starfall', desc: '攻击强度 +{v}，暴击率 +{v2}%', perRankShown: 10, perRankShown2: 1, stats: { power: 10, crit: 1 } },
];
export const HUNTER_TREE: TalentTreeDef = {
  id: HUNTER_ID, name: '灵契猎手', tierCost: 3, tiers: 6,
  specs: [
    { id: 'h_wolf', name: '雷狼', icon: 'tl_storm', desc: '雷电 · 连锁 · 单体首领：狼形叠感电、电弧连跳，绝技：头狼·奔雷', nodes: WOLF as TalentNodeDef[] },
    { id: 'h_bear', name: '巨熊', icon: 'tl_tough', desc: '破甲与震地：熊契硬扛、叠破甲，终极：巨熊之怒', gearRole: 'tank', nodes: BEAR as TalentNodeDef[] },
    { id: 'h_eagle', name: '苍鹰', icon: 'tl_starfall', desc: '远程与标记：鹰契远射、标记增伤，终极：天空之王', nodes: EAGLE as TalentNodeDef[] },
  ],
};

// ---------------------------------------------------------------- 扩展天赋层（31–40 级，结构同 talents.ts）+ 3 个终极新绝技
const base = { damage: 0, cooldown: 0, range: 2, radius: 0, projectileCount: 1, castTime: 0, cost: 0 };
const U = (id: string, name: string, shape: HSkill['shape'], tags: string[], stats: Partial<HSkill['stats']>, effects: EffectDef[], desc: string, element: 'physical' | 'lightning' = 'physical') =>
  ({ cls: HUNTER_ID, id, name, slot: 'skill4' as SlotId, element, shape, tags: [...tags, 'beast', 'skill4', 'dlc_ult'], stats: { ...base, ...stats }, effects, desc });
export const HUNTER_ULT_SKILLS = [
  U('hp_u_packlord', '潮狼王契', 'circle', ['aoe', 'spin', 'f_nova'], { damage: 150, cooldown: 14, radius: 5.5 }, [{ type: 'dot', element: 'lightning', dps: 24, duration: 5 }, { type: 'resetCooldown', slot: 'skill1', chance: 0.4 }], '雷潮狼王扑咬一圈（雷电）：5 秒感电灼烧，40% 几率重置技能 1', 'lightning'),   // v1.2.77 随雷狼改雷电
  U('hp_u_earthshaker', '沉钟巨熊', 'circle', ['aoe', 'slam', 'f_nova', 'sunder'], { damage: 140, cooldown: 16, radius: 6.5 }, [{ type: 'stun', duration: 1.5 }, { type: 'reflect', reduce: 0.25, percent: 0.1, duration: 6 }], '巨熊之魂如沉钟砸地：震晕 1.5 秒，6 秒受到伤害 -25%'),
  U('hp_u_skyhunt', '渊空鹰狩', 'circle', ['aoe', 'targeted', 'f_target', 'mark'], { damage: 160, cooldown: 14, radius: 5, range: 20 }, [{ type: 'slow', percent: 0.5, duration: 3 }, { type: 'explode', radius: 3, damagePercent: 0.5 }], '鹰群从深渊高空扑下：减速 50%，再爆一次 50% 伤害，标记所有命中的敌人'),
];
const ult = (s: (typeof HUNTER_ULT_SKILLS)[number], _icon: string): PackTalentNodeDef => ({ id: `pt_${s.id}`, name: s.name, desc: `终极：学会新绝技「${s.name}」—— ${s.desc}`, icon: `sk_${s.id}`, skill: s.id });   // fix1109c #1：终极节点用绝技专属图标（与技能栏一致；原借本体通用图标）
export const HUNTER_TIER: PackTalentTierDef = {
  id: 'dlc1_hunter', name: '沉钟天赋', cls: HUNTER_ID, desc: '沉钟之海资料片专属：31–40 级的 5 个扩展天赋点只能用在这里。',
  layers: [
    [{ id: 'ph_tidehide', name: '潮汐兽皮', desc: '生命 +1500，护甲 +300', icon: 'tl_tough', stats: { hp: 1500, armor: 300 } }],
    [{ id: 'ph_fang', name: '深潮獠牙', desc: '暴击率 +4%，暴击伤害 +15%', icon: 'tl_wrath', stats: { crit: 4, critDmg: 15 } },
     { id: 'ph_shell', name: '钟铜链环', desc: '护甲 +800，生命 +1200', icon: 'it_shield', stats: { armor: 800, hp: 1200 } }],
    [{ id: 'ph_echo', name: '兽魂回响', desc: '所有技能伤害 +8%', icon: 'tl_echo', modifier: { name: '兽魂回响', desc: '', match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.08 }] } }],
    [{ id: 'ph_pounce', name: '潮涌扑击', desc: '技能 1 伤害 +30%，冷却 -15%', icon: 'sk_charge', modifier: { name: '潮涌扑击', desc: '', match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] } },
     { id: 'ph_whirl', name: '漩涡契刃', desc: '技能 2 范围 +25%，伤害 +15%', icon: 'sk_whirlwind', modifier: { name: '漩涡契刃', desc: '', match: { slots: ['skill2'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.25 }, { op: 'mul', stat: 'damage', value: 0.15 }] } }],
    [ult(HUNTER_ULT_SKILLS[0], 'sk_bladestorm'), ult(HUNTER_ULT_SKILLS[1], 'tl_quake'), ult(HUNTER_ULT_SKILLS[2], 'tl_starfall')],
  ],
};

// ---------------------------------------------------------------- 符文（每个技能 3 枚，熟练度 100 / 300 / 600）
type Rune = ClassBook['runes'][number];
const R = (skillId: string, i: number, name: string, desc: string, ops: ModOp[]): Rune =>
  ({ id: `r_${skillId}_${i + 1}`, skillId, name, desc, need: [100, 300, 600][i], modifier: { id: `r_${skillId}_${i + 1}`, name: `符文·${name}`, source: 'rune', desc, match: { skillIds: [skillId] }, priority: 40, ops } });
const mul = (stat: 'damage' | 'cooldown' | 'radius' | 'range', v: number): ModOp => ({ op: 'mul', stat, value: v });
const fx = (e: EffectDef): ModOp => ({ op: 'addEffect', effect: e });
/** 主题符文（第 1 枚）：每个技能各自的；第 2、3 枚按技能类型给通用的 */
const THEME: Record<string, [string, string, ModOp[]]> = {
  hp_pounce: ['雷契', '附带 4 秒感电灼烧（雷电）', [fx({ type: 'dot', element: 'lightning', dps: 6, duration: 4 })]],
  hp_leap: ['陨跃', '落地震晕 0.6 秒', [fx({ type: 'stun', duration: 0.6 })]],
  hp_glide: ['风痕', '冷却 -25%', [mul('cooldown', -0.25)]],
  hp_rend: ['雷旋', '附带 4 秒感电灼烧（雷电）', [fx({ type: 'dot', element: 'lightning', dps: 7, duration: 4 })]],
  hp_volley: ['多重', '多射 1 枚羽刃', [{ op: 'add', stat: 'projectileCount', value: 1 }]],
  hp_maul: ['裂痕', '留下 4 秒碎地（每秒伤害）', [fx({ type: 'groundZone', element: 'physical', dps: 12, radius: 2.5, duration: 4 })]],
  hp_howl: ['威慑', '减速提高到 55%', [fx({ type: 'slow', percent: 0.55, duration: 3 })]],
  hp_snare: ['锁喉', '击晕 +0.6 秒', [fx({ type: 'stun', duration: 1.8 })]],
  hp_ward: ['倒刺', '反弹提高到 25%', [fx({ type: 'reflect', reduce: 0.3, percent: 0.25, duration: 6 })]],
  hp_totem: ['狼图腾', '兽魂之地每秒伤害 +60%', [fx({ type: 'groundZone', element: 'physical', dps: 9, radius: 4, duration: 5 })]],
  hp_stampede: ['踏碎', '附带 1 秒眩晕', [fx({ type: 'stun', duration: 1 })]],
  hp_avatar: ['群兽', '附带 5 秒撕裂', [fx({ type: 'dot', element: 'physical', dps: 18, duration: 5 })]],
  hp_wildhunt: ['猎神', '范围 +30%', [mul('radius', 0.3)]],
  hp_spiritbeast: ['巨像', '护盾提高到最大生命 30%', [fx({ type: 'shield', percentMaxHp: 0.1, duration: 6 })]],
  hp_u_packlord: ['强击', '伤害 +25%', [mul('damage', 0.25)]],
  hp_u_earthshaker: ['强击', '伤害 +25%', [mul('damage', 0.25)]],
  hp_u_skyhunt: ['强击', '伤害 +25%', [mul('damage', 0.25)]],
};
const ALL_SKILLS: { id: string; slot: SlotId; stats: HSkill['stats'] }[] = [...HUNTER_SKILLS, ...HUNTER_ULT_SKILLS];
export const HUNTER_RUNES: Rune[] = ALL_SKILLS.filter(s => s.slot !== 'basic').flatMap(s => {
  const t = THEME[s.id] ?? ['强击', '伤害 +25%', [mul('damage', 0.25)]];
  return [
    R(s.id, 0, t[0], t[1], t[2]),
    R(s.id, 1, '迅捷', '冷却 -20%', [mul('cooldown', -0.2)]),
    s.stats.radius > 0 ? R(s.id, 2, '扩张', '范围 +30%，伤害 +10%', [mul('radius', 0.3), mul('damage', 0.1)]) : R(s.id, 2, '远猎', '射程 +4 米，伤害 +15%', [{ op: 'add', stat: 'range', value: 4 }, mul('damage', 0.15)]),
  ];
});
export const HUNTER_PRESETS: ClassBook['presets'] = [
  { id: 'p_h_wolf', cls: HUNTER_ID, name: '雷狼', desc: '狼契常驻：突袭重置 + 旋击叠感电，满层雷暴爆发，换熊放震地再换回', skills: { skill1: 'hp_pounce', skill2: 'hp_rend', skill3: 'hp_howl', skill4: 'hp_totem', ultimate: 'hp_wildhunt' }, runes: { hp_pounce: 'r_hp_pounce_1', hp_rend: 'r_hp_rend_1' } },
  { id: 'p_h_bear', cls: HUNTER_ID, name: '巨熊', desc: '熊契顶在前面叠破甲，护契减伤，灵契巨兽护盾', skills: { skill1: 'hp_leap', skill2: 'hp_maul', skill3: 'hp_ward', skill4: 'hp_stampede', ultimate: 'hp_spiritbeast' }, runes: { hp_maul: 'r_hp_maul_1', hp_ward: 'r_hp_ward_1' } },
  { id: 'p_h_eagle', cls: HUNTER_ID, name: '苍鹰', desc: '鹰契远射标记，羽刃齐射 + 缚兽索控场', skills: { skill1: 'hp_glide', skill2: 'hp_volley', skill3: 'hp_snare', skill4: 'hp_totem', ultimate: 'hp_wildhunt' }, runes: { hp_volley: 'r_hp_volley_1', hp_snare: 'r_hp_snare_1' } },
];
export const HUNTER_BOOK: ClassBook = {
  choices: { ...HUNTER_CHOICES, skill4: [...(HUNTER_CHOICES.skill4 ?? []), ...HUNTER_ULT_SKILLS.map(s => s.id)] },
  roles: HUNTER_ROLES, runes: HUNTER_RUNES, presets: HUNTER_PRESETS,
};

// ---------------------------------------------------------------- 兽魂
export const HUNTER_RES: ClassResDef = {
  kind: 'beast', name: '兽魂', max: 100, threshold: 40, show: 'arc', color: '#c8843a', full: '#ffe0a0', decayDelay: 5, decayPerSec: 4, gainBasic: 6, gainSkillHit: 4,
  desc: '普攻命中 +6、技能命中 +4。满 40：下一个技能 1~4 变「兽魂·」强化版（伤害 +30%，消耗 40）；换形时兽魂 ≥25 自动消耗 25，换形技变「灵契·」（伤害 ×1.6）',
  empower: (v, thr, slot, _tags, more) => {
    if (slot === 'basic' || slot === 'ultimate' || v < thr) return null;
    return { cost: thr, label: '兽魂强化', mods: [{ id: 'res:beast', name: '兽魂·', desc: '', source: 'buff', match: { slots: [slot] }, priority: 40, ops: [{ op: 'more', stat: 'damage', value: 0.3 + more }, { op: 'rename', prefix: '兽魂·' }] }] };
  },
};

// ---------------------------------------------------------------- 英灵（12 个：6 个常规 + 6 个暗岩印记）
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sm = (id: string, name: string, match: ModifierDef['match'], ops: ModOp[]): ModifierDef => ({ id: `spirit:${id}`, name, desc: '', source: 'buff', match, ops, priority: 30 });
const dmg = (v: number): ModOp => ({ op: 'more', stat: 'damage', value: v });
const SP = (id: string, name: string, title: string, icon: string, color: string, unlock: SpiritDef['unlock'], desc: (t: number) => string, mods: (t: number) => ModifierDef[], lore: string, res?: (t: number) => Partial<ResBonus>): SpiritDef =>
  ({ id, cls: HUNTER_ID, name, title, icon, color, unlock, desc, mods, lore, ...(res ? { res } : {}) });
export const HUNTER_SPIRITS: SpiritDef[] = [
  SP('h_oldhunter', '老猎卫', '立契', 'it_dagger', '#d0a060', { stat: 'level', n: 10 }, t => `所有技能伤害 +${pct(0.04 * t)}`, t => [sm('h_oldhunter', '立契', {}, [dmg(0.04 * t)])],
    '「契约不是驯服，是并肩。」他把第一枚兽牙交到你手里。'),
  SP('h_greywolf', '灰鬃狼魂', '狼群', 'sk_whirlwind', '#c8d0e0', { stat: 'dungeon', n: 3 }, t => `狼契技能伤害 +${pct(0.07 * t)}`, t => [sm('h_greywolf', '狼群', { tagsAll: ['wolf'] }, [dmg(0.07 * t)])],
    '一匹从不独行的狼，死后也带着整个狼群的影子。'),
  SP('h_cavebear', '冰窟老熊', '熊皮', 'tl_tough', '#c08040', { stat: 'elite', n: 5 }, t => `熊契技能伤害 +${pct(0.06 * t)}，范围 +${pct(0.05 * t)}`, t => [sm('h_cavebear', '熊皮', { tagsAll: ['bear'] }, [dmg(0.06 * t), { op: 'mul', stat: 'radius', value: 0.05 * t }])],
    '冰窟深处睡了三百年的老熊，醒来只为再挥一掌。'),
  SP('h_sandhawk', '赤砂鹰', '远猎', 'tl_starfall', '#80c8ff', { stat: 'dungeon', n: 8 }, t => `鹰契技能伤害 +${pct(0.07 * t)}，射程 +${t} 米`, t => [sm('h_sandhawk', '远猎', { tagsAll: ['eagle'] }, [dmg(0.07 * t), { op: 'add', stat: 'range', value: t }])],
    '在赤砂上空盘旋的鹰，能看见十里外一粒金沙。'),
  SP('h_frostking', '永霜之王', '霜爪', 'sk_frost_ring', '#a0e8ff', { stat: 'raid', n: 1 }, t => `技能 2 伤害 +${pct(0.08 * t)}，命中减速 ${20 + 5 * t}%`, t => [sm('h_frostking', '霜爪', { slots: ['skill2'] }, [dmg(0.08 * t), { op: 'addEffect', effect: { type: 'slow', percent: (20 + 5 * t) / 100, duration: 2 } }])],
    '永霜之王的寒意认得每一只在雪里留下爪印的兽。'),
  SP('h_runescribe', '纹语契师', '契纹', 'it_signet', '#ffd070', { stat: 'runeword', n: 3 }, t => `兽魂获取 +${pct(0.1 * t)}`, () => [],
    '他把契约刻进纹语，从此兽魂不再随风散去。', t => ({ gainMul: 0.1 * t })),
  SP('h_p_tide', '潮痕狼', '涨潮', 'sk_whirlwind', '#7fe8f0', { stat: 'paragon', n: 1 }, t => `技能 1 伤害 +${pct(0.06 * t)}，冷却 -${pct(0.04 * t)}`, t => [sm('h_p_tide', '涨潮', { slots: ['skill1'] }, [dmg(0.06 * t), { op: 'mul', stat: 'cooldown', value: -0.04 * t }])],
    '它跟着潮水来，也跟着潮水走，只在你需要的时候上岸。'),
  SP('h_p_bellbear', '钟铜熊', '共鸣', 'sk_thunderclap', '#c89a40', { stat: 'paragon', n: 5 }, t => `技能 3 伤害 +${pct(0.1 * t)}`, t => [sm('h_p_bellbear', '共鸣', { slots: ['skill3'] }, [dmg(0.1 * t)])],
    '背上长出铜锈的老熊，每走一步都像在敲钟。'),
  SP('h_p_owl', '夜枭', '静羽', 'tl_mark', '#9a8ad0', { stat: 'paragon', n: 10 }, t => `兽魂强化门槛 −${3 * t}`, () => [],
    '夜枭从不出声，它的猎物也一样。', t => ({ thrAdd: -3 * t })),
  SP('h_p_stag', '白角鹿', '生生', 'tl_tough', '#e0f0d0', { stat: 'paragon', n: 20 }, t => `大招伤害 +${pct(0.08 * t)}，附带按伤害 ${5 * t}% 回血`, t => [sm('h_p_stag', '生生', { slots: ['ultimate'] }, [dmg(0.08 * t), { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.05 * t } }])],
    '白角鹿走过的地方，会长出新的草。'),
  SP('h_p_serpent', '渊蛇', '缠绞', 'tl_plague', '#60c080', { stat: 'paragon', n: 35 }, t => `技能 4 伤害 +${pct(0.1 * t)}，冷却 -${pct(0.05 * t)}`, t => [sm('h_p_serpent', '缠绞', { slots: ['skill4'] }, [dmg(0.1 * t), { op: 'mul', stat: 'cooldown', value: -0.05 * t }])],
    '盘在暗岩缝里的蛇，比任何人都早听见钟停了。'),
  SP('h_p_dark', '暗岩之魂', '岩心', 'it_reagent', '#ff7040', { stat: 'paragon', n: 50 }, t => `所有技能伤害 +${pct(0.05 * t)}，兽魂上限 +${10 * t}`, t => [sm('h_p_dark', '岩心', {}, [dmg(0.05 * t)])],
    '暗岩深处有一颗心脏，它认得每一个回来的人。', t => ({ maxAdd: 10 * t })),
];

// ---------------------------------------------------------------- 职业任务「猎卫遗契」（2 个，各 +1 天赋点）
export const HQ = ['cq_hunter1', 'cq_hunter2'] as const;
export const HUNTER_QUESTS: (QuestDef & { perk: string })[] = [
  { id: HQ[0], cls: HUNTER_ID, name: '猎卫遗契 · 狼牙', giver: 'ayla', turnIn: 'ayla', minLevel: 10,
    text: '你身上那股味道不像猎人，倒像是……狼。我小时候听老人说，很久以前有一支守卫用兽牙和野兽立契，狼替他们追，熊替他们挡，鹰替他们看。原野上的野狼牙根发着微光——帮我拔三颗回来，我想看看是不是真的。',
    doneText: '你看，牙根里的光会跟着你走。它们认你。往后你换形的时候，兽魂会来得更快一些。',
    objectives: [{ type: 'collect', target: 'wolf', chance: 0.6, count: 3, label: '发光的狼牙' }],
    reward: { xp: 900, gold: 160, item: { minQuality: 'purple' } }, perk: '猎卫遗契：换形技内置冷却 -1 秒 · 天赋点 +1' },
  { id: HQ[1], cls: HUNTER_ID, name: '猎卫遗契 · 霜契', giver: 'hela', turnIn: 'hela', minLevel: 22, requires: [HQ[0]],
    text: '艾拉托人带话给我了。猎卫的最后一份契约写在冰上——霜狼的心火和冰元素的寒核，一热一冷，契约才能封住。替我把它们取回来。',
    doneText: '冰上的字亮了：「兽不为奴，人不为主。」……拿着吧，你的换形技会更凶。',
    objectives: [{ type: 'collect', target: 'frost_wolf', chance: 0.6, count: 3, label: '霜狼心火' }, { type: 'collect', target: 'ice_elemental', chance: 0.6, count: 2, label: '冰元素寒核' }],
    reward: { xp: 4200, gold: 520, item: { minQuality: 'orange' } }, perk: '猎卫遗契：换形技伤害 +20% · 天赋点 +1' },
];

// ---------------------------------------------------------------- 底材：链甲 8 件 + 长柄弯刃（主手）+ 弓（弓位 = 副手存档键）；短刃 11-05 退役（只留定义给老存档）
export const HUNTER_BASES: ItemBase[] = [
  { id: 'b_h_coif', name: '链环兜帽', slot: 'head', armorType: 'mail', hp: 43, armor: 17, cls: HUNTER_ID },
  { id: 'b_h_spaulder', name: '链甲肩披', slot: 'shoulder', armorType: 'mail', hp: 32, armor: 13, cls: HUNTER_ID },
  { id: 'b_h_hauberk', name: '猎卫锁子甲', slot: 'chest', armorType: 'mail', hp: 74, armor: 34, cls: HUNTER_ID },
  { id: 'b_h_bracer', name: '链环护腕', slot: 'wrist', armorType: 'mail', hp: 19, armor: 8, cls: HUNTER_ID, bonus: { crit: 0.5 } },
  { id: 'b_h_gauntlet', name: '兽爪护手', slot: 'hands', armorType: 'mail', hp: 25, armor: 11, cls: HUNTER_ID },
  { id: 'b_h_belt', name: '兽牙腰链', slot: 'waist', armorType: 'mail', hp: 23, armor: 10, cls: HUNTER_ID },
  { id: 'b_h_legs', name: '链甲护腿', slot: 'legs', armorType: 'mail', hp: 52, armor: 24, cls: HUNTER_ID },
  { id: 'b_h_boots', name: '猎卫链靴', slot: 'feet', armorType: 'mail', hp: 27, armor: 12, cls: HUNTER_ID, bonus: { speed: 2 } },
  { id: 'b_h_glaive', name: '契约长柄弯刃', slot: 'twoHand', weaponType: 'glaive', hp: 0, armor: 0, cls: HUNTER_ID, bonus: { power: 28, crit: 2, critDmg: 4 } },
  { id: 'b_h_bow', name: '猎卫长弓', slot: 'offHand', weaponType: 'bow', hp: 0, armor: 0, cls: HUNTER_ID, bonus: { power: 15, crit: 1.5 } },
  { id: 'b_h_shortblade', name: '兽牙短刃', slot: 'offHand', weaponType: 'shortblade', hp: 0, armor: 0, cls: HUNTER_ID, bonus: { power: 8, haste: 2 }, noDrop: true },   // 11-05 退役：不掉落、不进底材池
];
export const HUNTER_BASE_ICONS: Record<string, string> = {
  b_h_coif: 'it_helm', b_h_spaulder: 'it_leather_shoulder', b_h_hauberk: 'it_chest', b_h_bracer: 'it_bracer', b_h_gauntlet: 'it_gauntlet', b_h_belt: 'it_girdle', b_h_legs: 'it_greaves', b_h_boots: 'it_leather_boots',
  b_h_glaive: 'it_glaive', b_h_bow: 'it_bow', b_h_shortblade: 'it_dagger',
};
