// ======================================================================
// DLC1 第 5 职业「灵契猎手」职业定义（v1.0.6，d1.5）→ PackManifest.classes / bases / spirits / classQuests / talentTier / skills
// 方案（Rhett 10-22 确认）：链甲、攻击强度；武器两栏：长柄弯刃（主手，狼 / 熊）+ 弓（弓栏，鹰契远程）（11-05，原「弓 + 短刃」取消）；资源「兽魂」；狼 / 熊 / 鹰三形态随时切换，
// 同一技能三种打法，换形瞬间触发「换形技」；专精 雷狼（雷电、感电连锁）/ 巨熊（破甲、震地）/ 苍鹰（远程、标记）。
// 只 import core 的类型、three 和本体 gfx（见 manifest.ts 约定）。
// ======================================================================
import type { ClassDef } from '../../data/classes';
import type { ModifierDef } from '../../core/types';
import { HUNTER_ID, HUNTER_SKILLS, HUNTER_LOADOUT, HUNTER_ICONS, HSkill } from './hunter_skills';
import { talentTree3, rp, md, dmgSlot, cdSlot, vsHigh, ultName } from '../../data/talents3';   // v1.2.58 天赋 3.0
import type { TalentNodeDef } from '../../core/TalentTree';
/** v1.2.77 关键节点（区域一 row 2 / 区域二 row 4，col 0 或 2） */
const K1 = (id: string, name: string, col: number, icon: string, desc: string, modifier?: TalentNodeDef['modifier']): TalentNodeDef => ({ id, name, row: 2, col, kind: 'choice', maxRank: 1, icon, desc, ...(modifier ? { modifier } : {}) });
const K2 = (id: string, name: string, col: number, icon: string, desc: string, modifier?: TalentNodeDef['modifier']): TalentNodeDef => ({ ...K1(id, name, col, icon, desc, modifier), row: 4 });
import { HUNTER_TREE, HUNTER_BOOK, HUNTER_RES, HUNTER_ULT_SKILLS, HUNTER_BASE_ICONS } from './hunter_data';
import { D40_ICONS } from './gear40';   // 11-14d 40 级暗金图标（别名对所有职业生效）
import { HUNTER_RUNTIME, onFormVisual, hunterApi } from './hunter_runtime';
import { hunterDress, formAura, hunterWeaponForm } from './hunter_model';
import { HUNTER_FX } from './hunter_fx';   // v1.0.8 专属施法表现
import { hunterSfx } from './hunter_sfx';   // v1.0.9 专属音效
import { PACK_ICONS } from './icons.gen';
import { HUNTER_GUIDE } from './class_guide';   // v1.2.2 职业引导   // v1.0.8 专属技能图标

const COMBOS: ModifierDef[] = [
  { id: 'hc_pounce_rend', name: '扑杀连击', desc: '技能 1 之后 3 秒内，技能 2 伤害 +20%', source: 'combo', match: { slots: ['skill2'] },
    conditions: [{ type: 'recentCast', tag: 'movement', within: 3, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'rename', suffix: '·连击' }] },
  { id: 'hc_howl_ult', name: '群兽号令', desc: '技能 3 之后 4 秒内，大招伤害 +25%', source: 'combo', match: { slots: ['ultimate'] },
    conditions: [{ type: 'recentCast', tag: 'control', within: 4, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] },
];

onFormVisual(f => { const r = hunterApi()?.playerObj(); formAura(r, f); hunterWeaponForm(r, f); });   // 11-05 换形态：切换弓 / 长柄在手（不重建挂件）

const skills: Record<string, HSkill> = Object.fromEntries([...HUNTER_SKILLS, ...HUNTER_ULT_SKILLS].map(s => [s.id, s]));

export const HUNTER_CLASS = {
  id: HUNTER_ID, name: '灵契猎手',
  desc: '鸣钟人的猎卫，与兽魂立契。链甲近战，狼 / 熊 / 鹰三形态随时切换：同一个技能三种打法，换形瞬间放出换形技。',
  skills, loadout: HUNTER_LOADOUT, tree: { ...talentTree3(HUNTER_TREE, {
    // v1.2.66 天赋内容核查：补位节点换成本系专属（docs/设计/天赋与技能联动核查_1030.md）
    // v1.2.77 天赋方案 B（未来开发报告 §7.4 定稿）：雷狼 / 巨熊 / 苍鹰 的区域一、区域二关键与绝技；机制在 hunter_runtime.ts
    h_wolf: { name: '雷狼', focus: '雷电 · 连锁 · 单体首领', keys1: [
      K1('hw_k_shock', '感电', 0, 'tl_storm', '关键：狼形攻击附带雷电并叠感电（最多 10 层）；每叠满 5 层放出电弧，跳向附近 3 个敌人，造成该次伤害的 35%'),
      K1('hw_k_step', '雷步', 2, 'tl_haste', '关键：狼形的位移技能在落点留下 2 秒雷痕（半径 2.5 米，每秒雷电伤害）'),
    ], keys2: [
      K2('hw_k_storm', '雷暴爆发', 0, 'tl_storm', '关键：感电满 10 层时落雷，6 秒内每秒造成目标最大生命 1.2% 的雷电伤害（首领 / 精英每秒有上限），之后感电清空'),
      K2('hw_k_pack', '群狼', 2, 'tl_wrath', '关键：换成狼形时召来 2 只雷狼影，6 秒内每秒各扑咬附近一个敌人'),
    ], replace: { h_wolf_p0: dmgSlot('獠牙', 'skill1', 4), h_wolf_p1: cdSlot('追猎', 'skill2', 5),
      hw_bleed: { name: '雷噬', desc: '对感电中的敌人伤害 +{v}%' },
      hw_rend: rp('雷痕', '狼契技能附带感电灼烧，每秒雷电伤害 +{v}', 3, { modifier: md('雷痕', { tagsAll: ['wolf'] }, [{ op: 'addEffect', effect: { type: 'dot', element: 'lightning', dps: 3, duration: 4 } }]) }),
      hw_alpha: { name: '头狼·奔雷', desc: '绝技：狼契每次命中叠 2 层感电，命中感电目标回 2 兽魂；雷暴爆发后感电回到 5 层；电弧多跳 2 个目标' } } },
    h_bear: { name: '巨熊', focus: '物理 · 范围清怪', keys1: [
      K1('hb_k_paw', '熊掌', 0, 'sk_quake', '关键：熊形的范围技能范围 +30%，伤害 +12%', md('熊掌', { tagsAll: ['bear'], tagsAny: ['aoe'] }, [{ op: 'mul', stat: 'radius', value: 0.3 }, { op: 'mul', stat: 'damage', value: 0.12 }])),
      K1('hb_k_hide', '厚皮', 2, 'tl_tough', '关键：熊形一次命中 3 个以上敌人时获得最大生命 8% 的护盾（5 秒，可叠到 16%，3 秒一次）'),
    ], keys2: [
      K2('hb_k_quake', '震地扩散', 0, 'tl_quake', '关键：熊形一次命中 3 个以上敌人后，下一次自身范围技能范围翻倍并减速 40%'),
      K2('hb_k_trample', '践踏', 2, 'tl_iron', '关键：熊形移动时撞开身边的小怪，造成伤害、击退 2 米并减速'),
    ], replace: { h_bear_p0: rp('熊踏', '范围技能伤害 +{v}%', 4, { modifier: md('熊踏', { tagsAny: ['aoe'] }, [{ op: 'mul', stat: 'damage', value: 0.04 }]) }),
      h_bear_p1: rp('坚毛', '生命 +{v}', 80, { stats: { hp: 80 } }),
      hb_ursoc: { name: '巨熊之怒', desc: '绝技：灵契·震地咆哮（兽魂满 25 换熊）后 8 秒内每秒自动震地一次；破甲上限 5 → 8 层，目标破甲 ≥5 层时你对它的伤害再 +25%' } } },
    h_eagle: { name: '苍鹰', focus: '远程 · 高暴击 · 标记', keys1: [
      K1('he_k_mark', '猎印', 0, 'tl_mark', '关键：对被标记的目标暴击时，总伤害约 +12.5%'),
      K1('he_k_sharp', '锐目', 2, 'tl_starfall', '关键：鹰契下，对 8 米外目标未暴击的攻击有 15% 概率双倍结算'),
    ], keys2: [
      K2('he_k_jump', '跳印', 0, 'tl_mark', '关键：被标记的目标死亡时，标记跳到 12 米内最近的敌人'),
      K2('he_k_dive', '鹰击长空', 2, 'sk_meteor', '关键：换形技「苍鹰俯冲」打断读条，对标记目标伤害 +40%'),
    ], replace: { h_eagle_p0: dmgSlot('鹰击', 'basic', 4), h_eagle_p1: cdSlot('疾羽', 'skill2', 5),
      he_sky: { name: '天空之王', desc: '绝技：灵契·苍鹰俯冲（兽魂满 25 换鹰）后 10 秒内鹰形普攻羽矢必定暴击、穿透并多射 1 枚；标记增伤再 +10%' } } },
  }), saveVer: 4 },   // v1.2.77 方案 B：旧天赋页全额返还
  combos: COMBOS,
  baseHp: 940, hpPerLevel: 56, critChance: 0.15, ranged: false, interruptSlot: 'skill3',
  keyHelp: '空格/J 契刃斩 · 1 契约突袭 · 2 兽魂旋击 · 3 慑魂嚎（可打断） · R 万兽归一 · F 换形（Z 狼 / X 熊 / V 鹰）',
  // 链甲；11-05 Rhett：武器两个栏位——主手 = 双手长柄弯刃（狼 / 熊 / 人形用），弓位（副手存档键）= 弓（鹰契远程）；两栏同时装备
  equip: { armorType: 'mail', weapons: ['glaive', 'bow'], dualWield: false, rangedOffhand: 'bow', slotNames: { mainHand: '主手：长柄', offHand: '弓' } }, powerName: '攻击强度',
  ext: {
    role: '近战 / 远程切换 · 三形态', diff: 3,
    sig: [{ slot: 'skill1', anim: 'dash', color: '#d0d8e8', ring: 2.4 }, { slot: 'skill2', anim: 'spin', color: '#c08040', ring: 3.2 }, { slot: 'ultimate', anim: 'heavy', color: '#80c8ff', ring: 4 }],
    looks: [{ name: '钢鬃', tint: 0x6a7480, k: 0.35, swatch: '#5a6470' }, { name: '霜狼', tint: 0xb8c8d8, k: 0.4, swatch: '#a0b0c0' }, { name: '赤熊', tint: 0x8a4a2a, k: 0.4, swatch: '#7a4028' }],
    rig: { model: 'Rogue', tex: 'rogue', show: [], height: 2.05,
      // v1.2.19 写实：UBC 男底座 + 游侠套染链甲钢灰（兽魂 / 三形态挂件照旧由 hunterDress 生成，挂点本体自动换算）；拉弓用 Mixamo 拉弓 / 瞄准后坐
      hd: { model: 'UBC_Male', lux: 'LUX_Hunter', parts: ['Outfit_Male_Ranger'], height: 2.05, tintScale: 1.3, gain: 1.2,
        mats: { MI_Ranger: 0xb4bcc8, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: 0xffffff },
        clips: { idle: ['MX_Idle_SS', 'Idle_Loop'], attack1: ['MX_Slash_c', 'Sword_Attack'], attack2: ['Sword_Slash_H'], attack3: ['MX_Downward', 'Sword_Thrust'],
          heavy: ['MX_GreatSlash_c', 'Sword_Heavy'], spin: ['Sword_Spin'], shoot: ['MX_DrawArrow|MX_AimRecoil', 'Throw_Over'], cast: ['MX_Magic_1H', 'Spell_Cast_Both'],
          hit: ['MX_Hit|Hit_Chest|Hit_Head'], death: ['MX_Death', 'Death01'], run: ['MX_Run_Lean', 'MX_Run', 'Jog_Fwd_Lean', 'Jog_Fwd_Loop'], walk: ['MX_Walk_Lean', 'MX_Walk', 'Walk_Lean', 'Walk_Loop'] }, luxClips: ['shoot'] } },   // 11-05 比赛版 Lux 模型也用拉弓（鹰契弓攻击）
    dress: hunterDress,
    portrait: 'pt_hunter',   // fix1109c #3：原借时砂行者头像（选角头像条 / 角色栏 / 左上头像都错）→ 自己的头像（icons/pt_hunter.jpg，由概念图裁头肩，见 tools/portrait/concept_portrait.py）
    weaponDesc: '长柄弯刃 + 弓',
    upgradeColor: 0x9fe8ff,
    silhouette: { head: 'b_h_coif', shoulder: 'b_h_spaulder', chest: 'b_h_hauberk', wrist: 'b_h_bracer', hands: 'b_h_gauntlet', waist: 'b_h_belt', legs: 'b_h_legs', feet: 'b_h_boots', mainHand: 'b_h_glaive', offHand: 'b_h_bow' },
    icons: { ...HUNTER_ICONS, ...HUNTER_BASE_ICONS, ...D40_ICONS },
    res: HUNTER_RES,
    guide: HUNTER_GUIDE,
    book: HUNTER_BOOK,
    runtime: HUNTER_RUNTIME,
    fx: { ...HUNTER_FX, sfx: hunterSfx },   // v1.0.9 专属音效
    art: Object.fromEntries(Object.entries(PACK_ICONS).filter(([k]) => k.startsWith('sk_hp_') || k === 'pt_hunter')),
  },
} as unknown as ClassDef;
