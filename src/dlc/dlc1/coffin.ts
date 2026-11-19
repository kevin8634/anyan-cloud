// ======================================================================
// DLC1 第 6 职业「负棺人」职业定义（v1.0.7，d1.6）→ PackManifest.classes / bases / spirits / classQuests / talentTier / skills
// 方案（Rhett 10-22 确认）：重甲、攻击强度；专属双手武器「葬棺」（铁棺 + 棺链）；不死者但不是死亡骑士。
// 收魂（最多 3）→ 背棺 / 立棺 / 开棺三种棺态 + 开棺组合（20 种）+ 未亡；专精 送葬者 / 饮血者 / 凋魂者（v1.2.77 方案 B，原守墓人 / 摆渡人）。
// 只 import core 的类型、three 和本体 gfx（见 manifest.ts 约定）。
// ======================================================================
import type { ClassDef } from '../../data/classes';
import type { ModifierDef } from '../../core/types';
import { COFFIN_ID, COFFIN_SKILLS, COFFIN_LOADOUT, COFFIN_ICONS, CSkill } from './coffin_skills';
import { talentTree3, rp, md, dmgSlot, cdSlot, vsHigh, ultName } from '../../data/talents3';   // v1.2.58 天赋 3.0
import { COFFIN_TREE, COFFIN_BOOK, COFFIN_RES, COFFIN_ULT_SKILLS, COFFIN_BASE_ICONS } from './coffin_data';
import { COFFIN_RUNTIME, onCoffinVisual, onTombFx, coffinApi } from './coffin_runtime';
import { coffinDress, coffinVisual, coffinTombFx } from './coffin_model';
import { COFFIN_FX } from './coffin_fx';   // v1.0.8 专属施法表现
import { coffinSfxAll } from './coffin_sfx';   // v1.0.9 专属音效
import type { TalentNodeDef } from '../../core/TalentTree';
/** v1.2.77 关键节点（区域一 row 2 / 区域二 row 4，col 0 或 2） */
const K1 = (id: string, name: string, col: number, icon: string, desc: string, modifier?: TalentNodeDef['modifier'], res?: TalentNodeDef['res']): TalentNodeDef => ({ id, name, row: 2, col, kind: 'choice', maxRank: 1, icon, desc, ...(modifier ? { modifier } : {}), ...(res ? { res } : {}) });
const K2 = (id: string, name: string, col: number, icon: string, desc: string, modifier?: TalentNodeDef['modifier']): TalentNodeDef => ({ ...K1(id, name, col, icon, desc, modifier), row: 4 });
import { PACK_ICONS } from './icons.gen';
import { COFFIN_GUIDE } from './class_guide';   // v1.2.2 职业引导   // v1.0.8 专属技能图标
import { COMBOS as OPEN_COMBOS } from './coffin_skills';

const COMBOS: ModifierDef[] = [
  { id: 'cc_drag_sweep', name: '拖棺横扫', desc: '技能 1 之后 3 秒内，技能 2 伤害 +20%', source: 'combo', match: { slots: ['skill2'] },
    conditions: [{ type: 'recentCast', tag: 'movement', within: 3, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'rename', suffix: '·连击' }] },
  { id: 'cc_toll_ult', name: '丧钟葬礼', desc: '技能 3 之后 4 秒内，大招伤害 +25%', source: 'combo', match: { slots: ['ultimate'] },
    conditions: [{ type: 'recentCast', tag: 'control', within: 4, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] },
];

onCoffinVisual(v => { coffinVisual(coffinApi()?.playerObj(), v); });
onTombFx(coffinTombFx);   // 11-04 立棺墓碑 墓碑瞬时表现（腐朽之地冒烟 / 减速泥土下陷）

const skills: Record<string, CSkill> = Object.fromEntries([...COFFIN_SKILLS, ...COFFIN_ULT_SKILLS].map(s => [s.id, s]));

export const COFFIN_CLASS = {
  id: COFFIN_ID, name: '负棺人',
  desc: '背着铁棺行走的不死送葬者。击杀敌人把魂收进棺里：背棺链甩、立棺成碑、开棺放魂出招；倒下时躺进棺里，用魂换命。',
  skills, loadout: COFFIN_LOADOUT, tree: { ...talentTree3(COFFIN_TREE, {
    // v1.2.66 天赋内容核查：补位节点换成本系专属（docs/设计/天赋与技能联动核查_1030.md）
    // v1.2.77 天赋方案 B（未来开发报告 §7.4 定稿）：送葬者 / 饮血者（原守墓人）/ 凋魂者（原摆渡人）；机制在 coffin_runtime.ts
    // 专精 id 沿用 c_und / c_war / c_fer（存档兼容）；旧关键节点 id 已不存在，老存档两职业天赋全额返还
    c_und: { name: '送葬者', focus: '暗影幽魂 · 收魂爆发 · 恐惧', keys1: [
      K1('cu_k_cap', '五魂棺', 0, 'tl_wrath', '关键：棺中魂上限 3 → 4；第 4 个魂让开棺伤害再 +25%', undefined, { maxAdd: 1 }),
      K1('cu_k_wail', '哀魂', 2, 'sk_battle_shout', '关键：开棺时魂尖啸，恐惧 6 米内小怪 2 秒（首领免疫，改为受到伤害 +8%）'),
    ], keys2: [
      K2('cu_k_burst', '魂爆', 0, 'sk_thunderclap', '关键：开棺时每个放出的魂化为一次暗影爆炸（落在附近敌人身上）'),
      K2('cu_k_ghosts', '百鬼夜行', 2, 'tl_plague', '关键：开棺放出的魂变成 4 秒追击幽魂，每 0.5 秒穿过附近敌人造成暗影伤害'),
    ], replace: { c_und_p0: vsHigh('哀悼', 4, 'shadow') } },
    c_war: { name: '饮血者', focus: '消耗生命 · 吸血续航', keys1: [
      K1('cb_k_rite', '血祭', 0, 'tl_wrath', '关键：技能消耗 3% 当前生命，伤害 +25%（生命不会因此扣到 30% 以下；低于 33% 时不消耗也不加成）'),
      K1('cb_k_ward', '血棺护体', 2, 'tl_tough', '关键：生命低于 50% 时，技能伤害的 4% 转为生命，你的吸血 / 治疗效果 +50%'),
    ], keys2: [
      K2('cb_k_drink', '饮魂', 0, 'tl_laststand', '关键：技能伤害的 9% 转为生命；满血时溢出的部分转为护盾（最多最大生命 15%，5 秒）'),
      K2('cb_k_debt', '血债', 2, 'tl_mark', '关键：消耗的生命 30% 存起来（最多最大生命 60%），下次开棺对目标一次性打出暗影伤害，附近敌人受到一半'),
    ], replace: { c_war_p0: vsHigh('嗜血', 4),
      cg_slow: { name: '血涌', desc: '生命低于 50% 时技能伤害 +{v}%', perRankShown: 6, rankMul: 1, modifier: md('血涌', {}, [{ op: 'mul', stat: 'damage', value: 0.06 }], [{ type: 'hpBelow', percent: 0.5 }]) },
      cg_guard: { name: '血契', desc: '你的吸血 / 治疗效果 +{v}%', perRankShown: 10, rankMul: 1 },
      cg_reach: { name: '血肉', desc: '生命 +{v}', perRankShown: 80, stats: { hp: 80 } },
      cg6_master: { name: '饮血长' } } },
    c_fer: { name: '凋魂者', focus: '紫色腐蚀 · 立棺墓碑 · 暗影持续 · 恐惧', keys1: [   // 11-04 立棺墓碑 主系凋魂者：立棺 = 凋魂墓碑（coffin_runtime.ts witherMain）
      K1('cw_k_erode', '暗影侵蚀', 0, 'tl_plague', '关键：技能命中叠「侵蚀」（普攻 1 层、技能 2 层，墓碑回响命中同样叠；最多 30 层，8 秒）：每层每秒造成该目标近期命中伤害 2% 的暗影伤害，跳伤吃急速、不会暴击'),
      K1('cw_k_rot', '腐朽之地', 2, 'sk_war_banner', '关键：立棺时墓碑周围 5 米地面腐蚀（腐朽之地），站在上面的敌人每 0.5 秒叠 1 层侵蚀（凋魂墓碑基础为每 1 秒 1 层）；你的技能命中（含墓碑回响）也叠 1 层'),
    ], keys2: [
      K2('cw_k_fear', '恐惧', 0, 'tl_wrath', '关键：侵蚀满 10 层时恐惧目标 1.5 秒（同一目标 8 秒一次；首领免疫，改为受到伤害 +10%）'),
      K2('cw_k_spread', '蔓延', 2, 'tl_plague', '关键：被恐惧或侵蚀满 10 层的敌人，每秒把 3 层侵蚀传给 2.5 米内的敌人'),
    ], replace: { c_fer_p0: cdSlot('回澜', 'skill1', 5), c_fer_p1: dmgSlot('逆浪', 'skill2', 4),
      cr_chain: { name: '蚀骨', desc: '侵蚀伤害 +{v}%', perRankShown: 10, rankMul: 1 },
      cr_reach: { name: '久腐', desc: '侵蚀持续 +{v} 秒', perRankShown: 2, rankMul: 1 },
      cr_sweep: rp('暗蚀', '暗影技能伤害 +{v}%', 6, { modifier: md('暗蚀', { elements: ['shadow'] }, [{ op: 'mul', stat: 'damage', value: 0.06 }]) }),
      cr6_master: { name: '凋魂长' } } },
  }), saveVer: 4 },   // v1.2.77 方案 B：旧天赋页全额返还
  combos: COMBOS,
  baseHp: 1000, hpPerLevel: 60, critChance: 0.12, ranged: false, interruptSlot: 'skill3',
  keyHelp: '空格/J 棺击 · 1 拖棺冲锋 · 2 链棺横扫 · 3 丧钟（可打断） · R 安魂葬礼 · F 立棺 / 收棺（凋魂者：凋魂墓碑） · X 开棺',
  equip: { armorType: 'plate', weapons: ['coffin'], dualWield: false }, powerName: '攻击强度',
  ext: {
    role: '近战 · 收魂 / 棺态', diff: 3,
    sig: [{ slot: 'skill1', anim: 'dash', color: '#c8c0b0', ring: 2.4 }, { slot: 'skill2', anim: 'spin', color: '#9a90c0', ring: 3.4 }, { slot: 'ultimate', anim: 'heavy', color: '#e0d0ff', ring: 4 }],
    looks: [{ name: '锈铁', tint: 0x5a4a40, k: 0.4, swatch: '#5a4a40' }, { name: '墓土', tint: 0x4a4038, k: 0.45, swatch: '#4a4038' }, { name: '尸蜡', tint: 0xc8c0a8, k: 0.35, swatch: '#b8b098' }],
    rig: { model: 'Knight', tex: 'knight', show: [], height: 2.1,
      // v1.2.19 写实：UBC 男底座 + 游侠套压暗 + 程序化暗色重甲（肩甲 + 胸甲）；背棺由 coffinDress 挂（写实时放大回原尺寸）
      hd: { model: 'UBC_Male', lux: 'LUX_Coffin', parts: ['Outfit_Male_Ranger'], height: 2.1, plate: 0x6c6a78, tintScale: 1.2, gain: 1.75,   // v1.2.20 提亮（原板甲 0x4a4852、衣物无提亮，整体近黑）

        mats: { MI_Ranger: 0x5a5460, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: 0xffffff },
        clips: { idle: ['MX_Idle_SS', 'Sword_Idle'], attack1: ['MX_Downward', 'Sword_Attack'], attack2: ['MX_Attack_SS', 'Sword_Slash_H'], attack3: ['MX_Slash_c', 'Sword_Thrust'],
          heavy: ['MX_GreatSlash_c', 'Sword_Heavy'], spin: ['Sword_Spin'], cast: ['MX_Magic_2H', 'Spell_Cast_Both'], shoot: ['Throw_Heavy'],
          hit: ['MX_Hit|Hit_Chest|Hit_Head'], death: ['MX_Death', 'Death01'], run: ['MX_Run_Lean', 'MX_Run', 'Jog_Fwd_Lean', 'Jog_Fwd_Loop'], walk: ['MX_Walk_Lean', 'MX_Walk', 'Walk_Lean', 'Walk_Loop'] } } },
    dress: coffinDress,
    portrait: 'pt_coffin',   // fix1109c #3：原借时砂行者头像 → 自己的头像（icons/pt_coffin.jpg，由概念图裁头肩，见 tools/portrait/concept_portrait.py）
    weaponDesc: '葬棺（铁棺 + 棺链，双手）',
    upgradeColor: 0xc8b8ff,
    silhouette: { head: 'b_c_helm', shoulder: 'b_c_pauldron', chest: 'b_c_chest', wrist: 'b_c_bracer', hands: 'b_c_gauntlet', waist: 'b_c_girdle', legs: 'b_c_legs', feet: 'b_c_sabaton', mainHand: 'b_c_coffin' },
    icons: { ...COFFIN_ICONS, ...COFFIN_BASE_ICONS, ...Object.fromEntries([...OPEN_COMBOS.map(c => c.skill.id), 'cf_open_p1', 'cf_open_p2'].map(k => [k, 'sk_cf_open'])) },
    res: COFFIN_RES,
    guide: COFFIN_GUIDE,
    book: COFFIN_BOOK,
    runtime: COFFIN_RUNTIME,
    fx: { ...COFFIN_FX, sfx: coffinSfxAll },   // v1.0.9 专属音效；11-04 立棺墓碑 墓碑回响 = 低通回声
    art: Object.fromEntries(Object.entries(PACK_ICONS).filter(([k]) => k.startsWith('sk_cf_') || k === 'pt_coffin')),
  },
} as unknown as ClassDef;
