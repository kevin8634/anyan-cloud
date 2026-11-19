// ======================================================================
// DLC1 40 级职业套装（规格 /workspace/work/chars/specs/DLC1_40级职业套装_v0.2.md，Rhett 11-04 03:12「6 件套效果和 3 个终极天赋以及大招联动，一套适配 3 系」）
//   六职业各 6 件（purple，affixes 2）：2 / 4 / 6 件效果；6 件 = 通用（大招联动）+ 3 条终极天赋分支（priority 35）。
//   分支门控：战士 / 法师按终极天赋自带标签（mortal / blood / wall / molten / shatter / chain）；
//            时砂 / 炼金 / 猎手 / 负棺按「终极天赋读数」flag s40cap_<终极天赋 id>（12 个，见下方 bindSets40）。
//   SetDef.cls 用假 cls dlc1_s40_<职业>（不抢 classSet() 的长副本掉落）；按职业查表用 S40_BY_CLASS。
//   11-05 本轮：数据 + 修饰器 + 读数 + hitRules 全部接上；11-05 02:xx 掉落（熔炉英雄+ / 沉眠者）+ 每套独立保底存档（DLC1 包存档 s40）接上（规格 §8、§9 1~3）。
// ======================================================================
import type { ItemDef, SetBonus } from '../../core/Loadout';
import { rollSetPiece, newPity, type SetDef, type SetPityState } from '../../core/Sets';
import type { ModifierDef, ModOp, ModCondition } from '../../core/types';
import type { PackCtx } from '../../core/ContentPacks';
import { CondFlags } from '../../core/CondFlags';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';
import { hunterApi } from './hunter_runtime';
import { coffinApi } from './coffin_runtime';

type Fixed = ItemDef & { baseId: string; affixes: number };
/** 同 data/sets.ts 的 Set6Branch 形状（DLC 不 import data） */
interface Set6Branch { spec: string; capstone: string; name: string; desc: string; hidden?: string }
const piece = (id: string, name: string, slot: ItemDef['slot'], baseId: string, setId: string): Fixed =>
  ({ id, name, slot, quality: 'purple', setId, baseId, affixes: 2, modifiers: [] });
const bonus = (setId: string, pieces: number, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): SetBonus =>
  ({ setId, pieces, desc, modifier: { id: `${setId}_${pieces}`, name: desc, source: 'equipment', priority: 30, desc, ...m } as ModifierDef });

export const S40_SET6: Record<string, { general: string; generalHidden?: string; branches: Set6Branch[] }> = {
  set40_warrior: { general: '「巨誓·断潮」通用：绝技伤害 +20%，命中每个敌人大招冷却 -1 秒（单次最多 4 秒）；大招命中后重置绝技冷却', branches: [
    { spec: 'w_arms', capstone: 'wa_mortal', name: '断潮·断首', desc: '裂伤 · 致死打击：致死打击命中大招冷却 -1.5 秒（每 3 秒一次）；大招后 6 秒内致死打击 +40%，同一敌人被命中 2 次眩晕 0.8 秒' },
    { spec: 'w_fury', capstone: 'wf_bloodwhirl', name: '断潮·怒涡', desc: '暴怒 · 血怒旋风：命中每个敌人大招冷却 -0.4 秒（最多 2 秒）；大招后 8 秒内血怒旋风 +25%，同一敌人被卷 3 次眩晕 1 秒' },
    { spec: 'w_prot', capstone: 'wp_wall', name: '断潮·镇岳', desc: '铁壁 · 盾墙：施放盾墙获得 15% 最大生命护盾；盾墙后 8 秒内技能 1~4 命中每个敌人盾墙冷却 -0.5 秒（最多 2 秒），绝技附带眩晕 1 秒' },
  ] },
  set40_mage: { general: '「星潮·倒灌」通用：施放大招后 8 秒内技能 1~4 冷却 -25%、伤害 +10%；大招冷却 -15%', branches: [
    { spec: 'm_fire', capstone: 'mf_inferno', name: '倒灌·星陨', desc: '炽焰 · 熔火陨星：命中每个敌人绝技冷却 -1 秒（最多 4 秒）；陨星后 8 秒内绝技落点再爆一次（半径 4，50%）' },
    { spec: 'm_frost', capstone: 'mi_shatter', name: '倒灌·碎星', desc: '凛冬 · 碎裂霜环：命中每个敌人大招冷却 -0.5 秒（最多 2.5 秒）；大招后 8 秒内碎裂霜环附带冻结 1 秒' },
    { spec: 'm_arcane', capstone: 'ma_chain', name: '倒灌·星链', desc: '星痕 · 连锁禁锢：每弹到一个敌人大招冷却 -0.5 秒（最多 2 秒）；禁锢后 6 秒内绝技对眩晕中的敌人 +35%' },
  ] },
  set40_chrono: { general: '「钟摆·永动」通用：技能 1 命中叠摆幅（最多 3 层），大招消耗摆幅每层 +15%；大招命中后重置技能 1 与绝技冷却', branches: [
    { spec: 'c_mark', capstone: 'cm_doom', name: '永动·命定', desc: '时痕 · 命定之刻：大招每第 2 次施放必定暴击；大招后 8 秒内技能 2~4 附加 25% 奥术伤害' },
    { spec: 'c_echo', capstone: 'ce_parallel', name: '永动·平行', desc: '回声 · 平行回响：技能 3 命中每个敌人大招冷却 -0.5 秒（最多 2 秒）；大招后 8 秒内技能 3 附带眩晕 0.6 秒' },
    { spec: 'c_rewind', capstone: 'cr_eternal', name: '永动·永恒', desc: '回溯 · 永恒一瞬：受到伤害后 4 秒内绝技与大招 +25%；施放大招获得 15% 最大生命护盾（5 秒）' },
  ] },
  set40_alchemy: { general: '「秘方·沸海」通用：绝技命中每个敌人大招冷却 -0.8 秒（最多 3 秒）；大招后 10 秒内投掷瓶附加 30% 奥术伤害、绝技 +20%', branches: [
    { spec: 'a_blast', capstone: 'ab_chain', name: '沸海·殉爆', desc: '爆破 · 连锁殉爆：火焰投掷瓶 0.8 秒后原地余震（半径 3，30%）；大招后 10 秒内火焰投掷瓶范围 +25%' },
    { spec: 'a_ground', capstone: 'ag_boil', name: '沸海·沸地', desc: '腐蚀 · 沸腾之地：大招落点留下 8 秒潮锈地面（半径 5，每秒 30）并减速 30%；绝技命中减速中的敌人每个再让大招冷却 -0.4 秒（最多 2 秒）' },
    { spec: 'a_turret', capstone: 'at_twin', name: '沸海·双釜', desc: '炮台 · 双釜：放下大釜炮台后 10 秒内投掷瓶每第 3 次必定暴击，并在落点小爆一次（半径 2.5，35%）' },
  ] },
  set40_hunter: { general: '「潮契·轮转」通用：换形技命中每个敌人绝技与大招冷却 -0.6 秒（最多 3 秒）；施放绝技后 8 秒内换形技 +40%', branches: [
    { spec: 'h_wolf', capstone: 'hw_alpha', name: '轮转·奔雷', desc: '雷狼 · 头狼·奔雷：狼形绝技与大招连锁 2 次（60%）；狼形绝技命中每个敌人大招冷却 -0.5 秒（最多 2.5 秒）' },
    { spec: 'h_bear', capstone: 'hb_ursoc', name: '轮转·熊怒', desc: '巨熊 · 巨熊之怒：熊形绝技与大招 +20% 并叠破甲；巨熊之怒震地每次命中大招冷却 -0.3 秒（最多 0.9 秒）' },
    { spec: 'h_eagle', capstone: 'he_sky', name: '轮转·天王', desc: '苍鹰 · 天空之王：苍鹰俯冲后 10 秒内绝技与大招 +20% 并打标记，鹰形普攻命中每个敌人大招冷却 -0.25 秒（最多 0.5 秒）' },
  ] },
  set40_coffin: { general: '「长明」通用：大招后 10 秒内技能 1~4 命中每个敌人绝技冷却 -0.5 秒（最多 2 秒），绝技附加 20% 暗影伤害；每持有 1 个魂大招 +10%', branches: [
    { spec: 'c_und', capstone: 'cs_full', name: '长明·满棺', desc: '送葬者 · 满棺齐放：3 魂开棺命中每个敌人大招冷却 -1 秒（最多 5 秒），并重置绝技冷却' },
    { spec: 'c_war', capstone: 'cg_night', name: '长明·守陵', desc: '守墓人 · 永夜守陵：立棺时大招冷却 -20%、绝技冷却 -15%；立棺大招命中每个敌人绝技冷却 -1 秒（最多 3 秒）' },
    { spec: 'c_fer', capstone: 'cr_styx', name: '长明·冥河', desc: '摆渡人 · 冥河摆渡人：背棺普攻命中每个敌人大招冷却 -0.2 秒（最多 0.8 秒）；大招后 10 秒内背棺普攻附加 30% 暗影伤害' },
  ] },
};
/** 照 sets.ts six()：6 件那一条的 desc = 通用 + 各分支；不同点：40 级第 1 条带 modifier（通用机制） */
const six40 = (id: string, modifier: ModifierDef): SetBonus => ({ setId: id, pieces: 6, modifier,
  desc: [S40_SET6[id].general + (S40_SET6[id].generalHidden ?? ''), ...S40_SET6[id].branches.map(b => `${b.name}（${b.desc}${b.hidden ?? ''}）`)].join('；') });
/** 6 件额外修饰器（desc ''，同 set_fury_4b 写法）；分支一律 priority 35：排在终极天赋（30）/ 形态（15）/ 棺态（10）加标签之后 */
const x6 = (id: string, k: string, name: string, desc: string, match: ModifierDef['match'], ops: ModOp[], conditions?: ModCondition[], priority = k === 'b' || k === 'c' ? 30 : 35): SetBonus =>
  ({ setId: id, pieces: 6, desc: '', modifier: { id: `${id}_6${k}`, name, desc, source: 'equipment', priority, match, ops, ...(conditions ? { conditions } : {}) } });
/** 终极天赋门控：读「终极天赋读数」flag；战士 / 法师不用它，直接按终极天赋加的标签匹配 */
const cap = (capstoneId: string): ModCondition => ({ type: 'flag', key: `s40cap_${capstoneId}` });

// 叠层规则（本体 web/trigfx.ts 技能命中时按规则叠）：s40m 咒环 / s40t 摆幅 / s40h 相契 / s40he 天王窗口（换鹰后 10 秒单层计时器）
CondFlags.hitRules.push({ key: 's40m', slots: ['skill1', 'skill2', 'skill3'], max: 5, dur: 12 });
CondFlags.hitRules.push({ key: 's40t', slots: ['skill1'], max: 3, dur: 12 });
CondFlags.hitRules.push({ key: 's40h', skillIds: ['hp_shift_wolf', 'hp_shift_bear', 'hp_shift_eagle'], max: 3, dur: 12 });
CondFlags.hitRules.push({ key: 's40he', skillIds: ['hp_shift_eagle'], max: 1, dur: 10 });

// ---------------------------------------------------------------- 战士 · 断潮巨誓 `set40_warrior`（规格 §）
const W = 'set40_warrior';
const WARRIOR_PIECES: Fixed[] = [
  piece('i40_w_helm', '断潮巨誓战盔', 'head', 'b_helm', W),
  piece('i40_w_pauldron', '断潮巨誓肩铠', 'shoulder', 'b_pauldron', W),
  piece('i40_w_chest', '断潮巨誓胸铠', 'chest', 'b_chest', W),
  piece('i40_w_gauntlet', '断潮巨誓手甲', 'hands', 'b_gauntlet', W),
  piece('i40_w_bracer', '断潮巨誓护腕', 'wrist', 'b_bracer', W),
  piece('i40_w_legs', '断潮巨誓腿铠', 'legs', 'b_legs', W),
];
const WARRIOR_BONUS: SetBonus[] = [
bonus(W, 2, '「钟撼」：重击技能伤害 +15%，命中后 0.6 秒原地余震（半径 3，35% 伤害）', {
  match: { tagsAny: ['slam'] },
  ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'addEffect', effect: { type: 'aftershock', delay: 0.6, radius: 3, damagePercent: 0.35 } }] }),
bonus(W, 4, '「震慑」：技能 3 附带眩晕 0.8 秒（首领只打断）；控制敌人后 6 秒内，绝技与大招伤害 +30%', {
  match: { slots: ['skill3'] },
  ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 0.8 } }] }),          // 带 stun → trigfx 自动写 cc（6 秒）
{ setId: W, pieces: 4, desc: '', modifier: { id: `${W}_4b`, name: '「震慑」追击', source: 'equipment', priority: 30,
  desc: '控制敌人后 6 秒内，绝技与大招伤害 +30%', match: { slots: ['skill4', 'ultimate'] },
  conditions: [{ type: 'flag', key: 'cc' }], ops: [{ op: 'mul', stat: 'damage', value: 0.3 }] } },
// ---- 6 件（v0.2）：desc 由 six40(W) 照 sets.ts six() 拼（通用 + 3 分支），机制全部挂修饰器 ----
six40(W, { id: `${W}_6`, name: '「巨誓·断潮」通用', source: 'equipment', priority: 30, desc: '绝技 +20%，命中缩大招冷却',
  match: { slots: ['skill4'] },
  ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'cdRefund', perHit: 1, max: 4, slots: ['ultimate'] } }] }),
x6(W, 'b', '「巨誓·断潮」大招部分', '大招命中后重置绝技冷却', { slots: ['ultimate'] },
  [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill4', chance: 1 } }, { op: 'rename', suffix: '·断潮' }]),
// 分支 · 断首（wa_mortal 给英勇打击加 mortal 标签，priority 30；分支 priority 35 在其后）
x6(W, 'm1', '断潮·断首', '致死打击命中大招冷却 -1.5 秒（每 3 秒一次）', { tagsAll: ['mortal'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 1.5, max: 1.5, slots: ['ultimate'] } }], [{ type: 'icd', sec: 3 }]),
x6(W, 'm2', '断潮·断首', '大招后 6 秒致死打击 +40%，2 次钟鸣眩晕', { tagsAll: ['mortal'] },
  [{ op: 'mul', stat: 'damage', value: 0.4 }, { op: 'addEffect', effect: { type: 'stackStun', stacks: 2, duration: 0.8, name: '钟鸣' } }],
  [{ type: 'recentCast', tag: 'slot:ultimate', within: 6, consume: false }]),
// 分支 · 怒涡（wf_bloodwhirl → blood）
x6(W, 'f1', '断潮·怒涡', '血怒旋风命中缩大招冷却', { tagsAll: ['blood'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.4, max: 2, slots: ['ultimate'] } }]),
x6(W, 'f2', '断潮·怒涡', '大招后 8 秒血怒旋风 +25%，卷中 3 次眩晕', { tagsAll: ['blood'] },
  [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'addEffect', effect: { type: 'stackStun', stacks: 3, duration: 1, name: '怒涡' } }],
  [{ type: 'recentCast', tag: 'slot:ultimate', within: 8, consume: false }]),
// 分支 · 镇岳（wp_wall → wall；盾墙是大招，tryCast 记录解析后的标签 → recentCast tag:'wall' 可用）
x6(W, 'p1', '断潮·镇岳', '施放盾墙得 15% 护盾', { tagsAll: ['wall'] },
  [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 8 } }]),
x6(W, 'p2', '断潮·镇岳', '盾墙后 8 秒技能命中缩盾墙冷却', { slots: ['skill1', 'skill2', 'skill3', 'skill4'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2, slots: ['ultimate'] } }],
  [{ type: 'recentCast', tag: 'wall', within: 8, consume: false }]),
x6(W, 'p3', '断潮·镇岳', '盾墙后 8 秒绝技附带眩晕 1 秒', { slots: ['skill4'] },
  [{ op: 'addEffect', effect: { type: 'stun', duration: 1 } }],
  [{ type: 'recentCast', tag: 'wall', within: 8, consume: false }]),
];

// ---------------------------------------------------------------- 法师 · 星潮咒环 `set40_mage`（规格 §）
const MG = 'set40_mage';
const MAGE_PIECES: Fixed[] = [
  piece('i40_m_hood', '星潮咒环兜帽', 'head', 'b_hood', MG),
  piece('i40_m_mantle', '星潮咒环披肩', 'shoulder', 'b_mantle', MG),
  piece('i40_m_robe', '星潮咒环法袍', 'chest', 'b_robe', MG),
  piece('i40_m_gloves', '星潮咒环手套', 'hands', 'b_silk_gloves', MG),
  piece('i40_m_wrap', '星潮咒环护腕', 'wrist', 'b_wrap', MG),
  piece('i40_m_legs', '星潮咒环长裤', 'legs', 'b_cloth_legs', MG),
];
const MAGE_BONUS: SetBonus[] = [
bonus(MG, 2, '「缠咒」：技能 1~4 与大招附加 18% 奥术伤害（奥术技能改为伤害 +18%）', {
  match: { slots: ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'], elements: ['fire', 'frost', 'nature', 'lightning', 'physical'] },
  ops: [{ op: 'addElement', value: 'arcane', damagePercent: 0.18 }] }),
{ setId: MG, pieces: 2, desc: '', modifier: { id: `${MG}_2b`, name: '「缠咒」奥术', source: 'equipment', priority: 30, desc: '奥术技能伤害 +18%',
  match: { slots: ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate'], elements: ['arcane'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.18 }] } },
// 4 件：满层那条先判（priority 30，不消耗），按层那条后判并消耗（priority 31）
bonus(MG, 4, '「咒环」：技能 1~3 命中叠咒环（最多 5 层）；绝技消耗全部咒环，每层 +12% 伤害；满 5 层额外连锁 2 次（60%）', {
  match: { slots: ['skill4'] }, conditions: [{ type: 'stacks', key: 's40m', min: 5 }],
  ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 7, damagePercent: 0.6 } }, { op: 'rename', suffix: '·满环' }] }),
{ setId: MG, pieces: 4, desc: '', modifier: { id: `${MG}_4b`, name: '「咒环」层数', source: 'equipment', priority: 31, desc: '每层咒环绝技伤害 +12%',
  match: { slots: ['skill4'] }, conditions: [{ type: 'stacks', key: 's40m', scale: true, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] } },
// ---- 6 件（v0.2）----
six40(MG, { id: `${MG}_6`, name: '「星潮·倒灌」通用', source: 'equipment', priority: 30, desc: '大招后 8 秒技能 1~4 冷却 -25%、伤害 +10%',
  match: { slots: ['skill1', 'skill2', 'skill3', 'skill4'] }, conditions: [{ type: 'recentCast', tag: 'slot:ultimate', within: 8, consume: false }],
  ops: [{ op: 'mul', stat: 'cooldown', value: -0.25 }, { op: 'mul', stat: 'damage', value: 0.1 }] }),
x6(MG, 'b', '「星潮·倒灌」大招', '大招冷却 -15%', { slots: ['ultimate'] }, [{ op: 'mul', stat: 'cooldown', value: -0.15 }]),
// 分支 · 星陨（mf_inferno → molten，作用在大招 meteor 上）
x6(MG, 'f1', '倒灌·星陨', '熔火陨星命中缩绝技冷却', { tagsAll: ['molten'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 1, max: 4, slots: ['skill4'] } }]),
x6(MG, 'f2', '倒灌·星陨', '熔火陨星后 8 秒绝技落点再爆一次', { slots: ['skill4'] },
  [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.5 } }],
  [{ type: 'recentCast', tag: 'molten', within: 8, consume: false }]),
// 分支 · 碎星（mi_shatter → shatter）
x6(MG, 'i1', '倒灌·碎星', '碎裂霜环命中缩大招冷却', { tagsAll: ['shatter'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2.5, slots: ['ultimate'] } }]),
x6(MG, 'i2', '倒灌·碎星', '大招后 8 秒碎裂霜环附带冻结 1 秒', { tagsAll: ['shatter'] },
  [{ op: 'addEffect', effect: { type: 'stun', duration: 1 } }],
  [{ type: 'recentCast', tag: 'slot:ultimate', within: 8, consume: false }]),
// 分支 · 星链（ma_chain → arcane_bind 带 chain；闪电链也带 chain，所以同时按 skillIds 限定，并补专属标签 s40_cb 给 recentCast 用）
x6(MG, 'a1', '倒灌·星链', '连锁禁锢每弹一个敌人缩大招冷却', { skillIds: ['arcane_bind'], tagsAll: ['chain'] },
  [{ op: 'addTag', value: 's40_cb' }, { op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2, slots: ['ultimate'] } }]),
x6(MG, 'a2', '倒灌·星链', '连锁禁锢后 6 秒绝技对眩晕敌人 +35%', { slots: ['skill4'] },
  [{ op: 'mul', stat: 'damage', value: 0.35 }],
  [{ type: 'recentCast', tag: 's40_cb', within: 6, consume: false }, { type: 'targetHasEffect', effect: 'stun' }]),
];

// ---------------------------------------------------------------- 时砂 · 沉沙钟摆 `set40_chrono`（规格 §）
const TC = 'set40_chrono';
const CHRONO_PIECES: Fixed[] = [
  piece('i40_t_hood', '沉沙钟摆兜帽', 'head', 'b_lhood', TC),
  piece('i40_t_shoulder', '沉沙钟摆肩垫', 'shoulder', 'b_lshoulder', TC),
  piece('i40_t_vest', '沉沙钟摆皮甲', 'chest', 'b_lvest', TC),
  piece('i40_t_gloves', '沉沙钟摆手套', 'hands', 'b_lgloves', TC),
  piece('i40_t_bracer', '沉沙钟摆护腕', 'wrist', 'b_lbracer', TC),
  piece('i40_t_legs', '沉沙钟摆长裤', 'legs', 'b_llegs', TC),
];
const CHRONO_BONUS: SetBonus[] = [
bonus(TC, 2, '「摆出」：位移 / 闪身 / 翻滚后 4 秒内，技能 2~4 伤害 +18%', {
  match: { slots: ['skill2', 'skill3', 'skill4'] }, conditions: [{ type: 'flag', key: 'evade' }],   // 不消耗：与其他读 evade 的装备共存
  ops: [{ op: 'mul', stat: 'damage', value: 0.18 }] }),
bonus(TC, 4, '「摆回」：技能 2~4 命中每个敌人，技能 1 冷却 -0.5 秒（单次最多 2 秒）；闪身后 4 秒内绝技 1 秒后回放一次（半径 4，70%）', {
  match: { slots: ['skill2', 'skill3', 'skill4'] },
  ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2, slots: ['skill1'] } }] }),
{ setId: TC, pieces: 4, desc: '', modifier: { id: `${TC}_4b`, name: '「摆回」回放', source: 'equipment', priority: 30, desc: '闪身后 4 秒内绝技 1 秒后回放一次',
  match: { slots: ['skill4'] }, conditions: [{ type: 'flag', key: 'evade' }],
  ops: [{ op: 'addEffect', effect: { type: 'aftershock', delay: 1, radius: 4, damagePercent: 0.7 } }, { op: 'rename', suffix: '·回摆' }] } },
// ---- 6 件（v0.2）----
six40(TC, { id: `${TC}_6`, name: '「钟摆·永动」通用', source: 'equipment', priority: 30, desc: '大招消耗摆幅，每层 +15%',
  match: { slots: ['ultimate'] }, conditions: [{ type: 'stacks', key: 's40t', scale: true, consume: true }],
  ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
x6(TC, 'b', '「钟摆·永动」重置', '大招命中后重置技能 1 与绝技冷却', { slots: ['ultimate'] },
  [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 1 } }, { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill4', chance: 1 } }]),
// 三个终极天赋都没有 modifier（web/chrono.ts 按 rank 读）→ 用「终极天赋读数」flag 门控（§9 需 01 新增 ①）
x6(TC, 'm1', '永动·命定', '大招每第 2 次必暴', { slots: ['ultimate'] },
  [{ op: 'addEffect', effect: { type: 'critEvery', n: 2 } }], [cap('cm_doom')]),
x6(TC, 'm2', '永动·命定', '大招后 8 秒技能 2~4 附加 25% 奥术', { slots: ['skill2', 'skill3', 'skill4'] },
  [{ op: 'addElement', value: 'arcane', damagePercent: 0.25 }],
  [cap('cm_doom'), { type: 'recentCast', tag: 'slot:ultimate', within: 8, consume: false }]),
x6(TC, 'e1', '永动·平行', '技能 3 命中缩大招冷却', { slots: ['skill3'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2, slots: ['ultimate'] } }], [cap('ce_parallel')]),
x6(TC, 'e2', '永动·平行', '大招后 8 秒技能 3 附带眩晕 0.6 秒', { slots: ['skill3'] },
  [{ op: 'addEffect', effect: { type: 'stun', duration: 0.6 } }],
  [cap('ce_parallel'), { type: 'recentCast', tag: 'slot:ultimate', within: 8, consume: false }]),
x6(TC, 'r1', '永动·永恒', '受击后 4 秒绝技 / 大招 +25%', { slots: ['skill4', 'ultimate'] },
  [{ op: 'mul', stat: 'damage', value: 0.25 }], [cap('cr_eternal'), { type: 'flag', key: 'hurt' }]),
x6(TC, 'r2', '永动·永恒', '施放大招得 15% 护盾', { slots: ['ultimate'] },
  [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 5 } }], [cap('cr_eternal')]),
];

// ---------------------------------------------------------------- 炼金 · 潮锈秘方 `set40_alchemy`（规格 §）
const AL = 'set40_alchemy';
const ALCHEMY_PIECES: Fixed[] = [
  piece('i40_a_mask', '潮锈秘方鸟嘴面罩', 'head', 'b_amask', AL),
  piece('i40_a_mantle', '潮锈秘方披肩', 'shoulder', 'b_amantle', AL),
  piece('i40_a_coat', '潮锈秘方长衣', 'chest', 'b_acoat', AL),
  piece('i40_a_gloves', '潮锈秘方手套', 'hands', 'b_agloves', AL),
  piece('i40_a_wrap', '潮锈秘方护腕', 'wrist', 'b_awrap', AL),
  piece('i40_a_legs', '潮锈秘方绑腿', 'legs', 'b_alegs', AL),
];
const ALCHEMY_BONUS: SetBonus[] = [
bonus(AL, 2, '「沉淀」：对持续伤害中的敌人，绝技与大招伤害 +25%', {
  match: { slots: ['skill4', 'ultimate'] }, conditions: [{ type: 'targetHasEffect', effect: 'dot' }],
  ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }),
bonus(AL, 4, '「潮锈」：绝技冷却 -20%，留下 6 秒潮锈地面（半径 4，每秒 24）并减速 30%；投掷瓶对减速中的敌人伤害 +15%', {
  match: { slots: ['skill4'] },
  ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 },
        { op: 'addEffect', effect: { type: 'groundZone', element: 'nature', dps: 24, radius: 4, duration: 6 } },
        { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 4 } }] }),
{ setId: AL, pieces: 4, desc: '', modifier: { id: `${AL}_4b`, name: '「潮锈」投掷', source: 'equipment', priority: 30, desc: '投掷瓶对减速中的敌人伤害 +15%',
  match: { slots: ['skill1', 'skill2', 'skill3'], tagsAll: ['lob'] }, conditions: [{ type: 'targetHasEffect', effect: 'slow' }],
  ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
// ---- 6 件（v0.2）----
six40(AL, { id: `${AL}_6`, name: '「秘方·沸海」通用', source: 'equipment', priority: 30, desc: '绝技命中缩大招冷却',
  match: { slots: ['skill4'] },
  ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.8, max: 3, slots: ['ultimate'] } }] }),
x6(AL, 'b', '「沸海」投掷', '大招后 10 秒内投掷瓶附加 30% 奥术伤害', { slots: ['skill1', 'skill2', 'skill3'], tagsAll: ['lob'] },
  [{ op: 'addElement', value: 'arcane', damagePercent: 0.3 }], [{ type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }]),
x6(AL, 'c', '「沸海」绝技', '大招后 10 秒内绝技伤害 +20%', { slots: ['skill4'] },
  [{ op: 'mul', stat: 'damage', value: 0.2 }], [{ type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }]),
// 三个终极天赋都没有 modifier（web/alchemy.ts 按 rank 读）→ flag 门控
x6(AL, 'x1', '沸海·殉爆', '火焰投掷瓶 0.8 秒后余震', { tagsAll: ['lob'], elements: ['fire'] },
  [{ op: 'addEffect', effect: { type: 'aftershock', delay: 0.8, radius: 3, damagePercent: 0.3 } }], [cap('ab_chain')]),
x6(AL, 'x2', '沸海·殉爆', '大招后 10 秒火焰投掷瓶范围 +25%', { tagsAll: ['lob'], elements: ['fire'] },
  [{ op: 'mul', stat: 'radius', value: 0.25 }], [cap('ab_chain'), { type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }]),
x6(AL, 'g1', '沸海·沸地', '大招落点留 8 秒潮锈地面并减速', { slots: ['ultimate'] },
  [{ op: 'addEffect', effect: { type: 'groundZone', element: 'nature', dps: 30, radius: 5, duration: 8 } },
   { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 4 } }], [cap('ag_boil')]),
x6(AL, 'g2', '沸海·沸地', '绝技命中减速中的敌人再缩大招冷却', { slots: ['skill4'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.4, max: 2, slots: ['ultimate'] } }],
  [cap('ag_boil'), { type: 'targetHasEffect', effect: 'slow' }]),
x6(AL, 't1', '沸海·双釜', '放下大釜后 10 秒投掷瓶每第 3 次必暴并小爆', { slots: ['skill1', 'skill2', 'skill3'], tagsAll: ['lob'] },
  [{ op: 'addEffect', effect: { type: 'critEvery', n: 3 } }, { op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.35 } }],
  [cap('at_twin'), { type: 'recentCast', skillId: 'cauldron', within: 10, consume: false }]),
];

// ---------------------------------------------------------------- 灵契猎手 · 三相潮契 `set40_hunter`（规格 §）
const HT = 'set40_hunter';
const HUNTER_PIECES: Fixed[] = [
  piece('i40_h_coif', '三相潮契兜帽', 'head', 'b_h_coif', HT),
  piece('i40_h_spaulder', '三相潮契肩披', 'shoulder', 'b_h_spaulder', HT),
  piece('i40_h_hauberk', '三相潮契锁甲', 'chest', 'b_h_hauberk', HT),
  piece('i40_h_gauntlet', '三相潮契护手', 'hands', 'b_h_gauntlet', HT),
  piece('i40_h_bracer', '三相潮契护腕', 'wrist', 'b_h_bracer', HT),
  piece('i40_h_legs', '三相潮契护腿', 'legs', 'b_h_legs', HT),
];
const HUNTER_BONUS: SetBonus[] = [
bonus(HT, 2, '「换契」：换形技伤害 +40%，命中后获得护盾（最大生命 6%，4 秒）', {
  match: { tagsAll: ['shift'] },     // 不用 slots:['skill1']：换形技登记在 skill1，会误伤位移技
  ops: [{ op: 'mul', stat: 'damage', value: 0.4 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.06, duration: 4 } }] }),
bonus(HT, 4, '「三相」：换形技命中叠相契（最多 3 层）；绝技消耗相契，每层 +15%；满 3 层额外三兽冲击（半径 5，80%）', {
  match: { slots: ['skill4'] }, conditions: [{ type: 'stacks', key: 's40h', min: 3 }],
  ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 5, damagePercent: 0.8 } }, { op: 'rename', suffix: '·三相' }] }),
{ setId: HT, pieces: 4, desc: '', modifier: { id: `${HT}_4b`, name: '「三相」层数', source: 'equipment', priority: 31, desc: '每层相契绝技伤害 +15%',
  match: { slots: ['skill4'] }, conditions: [{ type: 'stacks', key: 's40h', scale: true, consume: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] } },
// ---- 6 件（v0.2）----
// 天王窗口：换形技走 A.fire（不进 ComboTracker，recentCast 看不到）→ 用 hitRules 单层 + dur 当 10 秒计时器
six40(HT, { id: `${HT}_6`, name: '「潮契·轮转」通用', source: 'equipment', priority: 30, desc: '换形技命中缩绝技 / 大招冷却',
  match: { tagsAll: ['shift'] },
  ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.6, max: 3, slots: ['skill4', 'ultimate'] } }] }),
x6(HT, 'b', '「轮转」换形', '施放绝技后 8 秒内换形技伤害 +40%', { tagsAll: ['shift'] },
  [{ op: 'mul', stat: 'damage', value: 0.4 }], [{ type: 'recentCast', tag: 'slot:skill4', within: 8, consume: false }]),
// 三个终极天赋机制在 hunter_runtime.ts 按 rank 读 → flag 门控（hunter_runtime 可直接 provide，纯 DLC）
x6(HT, 'w1', '轮转·奔雷', '狼形绝技 / 大招连锁 2 次', { slots: ['skill4', 'ultimate'], tagsAll: ['wolf'] },
  [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 7, damagePercent: 0.6 } }], [cap('hw_alpha')]),
x6(HT, 'w2', '轮转·奔雷', '狼形绝技命中缩大招冷却', { slots: ['skill4'], tagsAll: ['wolf'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2.5, slots: ['ultimate'] } }], [cap('hw_alpha')]),
x6(HT, 'b1', '轮转·熊怒', '熊形绝技 / 大招 +20% 并带破甲', { slots: ['skill4', 'ultimate'], tagsAll: ['bear'] },
  [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addTag', value: 'sunder' }], [cap('hb_ursoc')]),
x6(HT, 'b2', '轮转·熊怒', '巨熊之怒震地命中缩大招冷却', { skillIds: ['hp_t_quake'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.3, max: 0.9, slots: ['ultimate'] } }], [cap('hb_ursoc')]),
x6(HT, 'e1', '轮转·天王', '苍鹰俯冲后 10 秒绝技 / 大招 +20% 并带标记', { slots: ['skill4', 'ultimate'] },
  [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addTag', value: 'mark' }], [cap('he_sky'), { type: 'stacks', key: 's40he', min: 1 }]),
x6(HT, 'e2', '轮转·天王', '苍鹰俯冲后 10 秒鹰形普攻缩大招冷却', { slots: ['basic'], tagsAll: ['eagle'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.25, max: 0.5, slots: ['ultimate'] } }], [cap('he_sky'), { type: 'stacks', key: 's40he', min: 1 }]),
];

// ---------------------------------------------------------------- 负棺人 · 渡亡长明 `set40_coffin`（规格 §）
const CF = 'set40_coffin';
const COFFIN_PIECES: Fixed[] = [
  piece('i40_c_helm', '渡亡长明铁面', 'head', 'b_c_helm', CF),
  piece('i40_c_pauldron', '渡亡长明肩甲', 'shoulder', 'b_c_pauldron', CF),
  piece('i40_c_chest', '渡亡长明胸甲', 'chest', 'b_c_chest', CF),
  piece('i40_c_gauntlet', '渡亡长明铁手', 'hands', 'b_c_gauntlet', CF),
  piece('i40_c_bracer', '渡亡长明护腕', 'wrist', 'b_c_bracer', CF),
  piece('i40_c_legs', '渡亡长明腿铠', 'legs', 'b_c_legs', CF),
];
const COFFIN_BONUS: SetBonus[] = [
bonus(CF, 2, '「两态」：背棺时技能 1~3 按伤害 6% 回复生命；立棺时所有技能伤害 +12%', {
  match: { slots: ['skill1', 'skill2', 'skill3'], tagsAll: ['coffin', 'back'] },
  ops: [{ op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.06 } }] }),
{ setId: CF, pieces: 2, desc: '', modifier: { id: `${CF}_2b`, name: '「两态」立棺', source: 'equipment', priority: 30, desc: '立棺时所有技能伤害 +12%',
  match: { tagsAll: ['coffin', 'grave'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] } },
bonus(CF, 4, '「渡亡」：每持有 1 个魂，绝技伤害 +15%（3 魂 +45%）；立棺时绝技留下 5 秒墓灯地面（半径 4，每秒 30）', {
  match: { slots: ['skill4'] }, conditions: [{ type: 'stacks', key: 'souls', scale: true }],   // 读数，不消耗魂
  ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
{ setId: CF, pieces: 4, desc: '', modifier: { id: `${CF}_4b`, name: '「渡亡」墓灯', source: 'equipment', priority: 30, desc: '立棺时绝技留下 5 秒墓灯地面',
  match: { slots: ['skill4'], tagsAll: ['grave'] },
  ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'shadow', dps: 30, radius: 4, duration: 5 } }] } },
// ---- 6 件（v0.2）----
six40(CF, { id: `${CF}_6`, name: '「长明」通用', source: 'equipment', priority: 30, desc: '大招后 10 秒技能命中缩绝技冷却',
  match: { slots: ['skill1', 'skill2', 'skill3', 'skill4'] }, conditions: [{ type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }],
  ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.5, max: 2, slots: ['skill4'] } }] }),
x6(CF, 'b', '「长明」绝技', '大招后 10 秒内绝技附加 20% 暗影伤害', { slots: ['skill4'] },
  [{ op: 'addElement', value: 'shadow', damagePercent: 0.2 }], [{ type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }]),
x6(CF, 'c', '「长明」大招', '每持有 1 个魂大招伤害 +10%', { slots: ['ultimate'] },
  [{ op: 'mul', stat: 'damage', value: 0.1 }], [{ type: 'stacks', key: 'souls', scale: true }]),
// 三个终极天赋机制在 coffin_runtime.ts 按 rank 读 → flag 门控（coffin_runtime 可直接 provide，纯 DLC）
x6(CF, 'u1', '长明·满棺', '3 魂开棺缩大招冷却并重置绝技', { tagsAll: ['opencoffin', 'open3'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 1, max: 5, slots: ['ultimate'] } },
   { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill4', chance: 1 } }], [cap('cs_full')]),
x6(CF, 'w1', '长明·守陵', '立棺时大招冷却 -20%', { slots: ['ultimate'], tagsAll: ['coffin', 'grave'] },
  [{ op: 'mul', stat: 'cooldown', value: -0.2 }, { op: 'addEffect', effect: { type: 'cdRefund', perHit: 1, max: 3, slots: ['skill4'] } }], [cap('cg_night')]),
x6(CF, 'w2', '长明·守陵', '立棺时绝技冷却 -15%', { slots: ['skill4'], tagsAll: ['coffin', 'grave'] },
  [{ op: 'mul', stat: 'cooldown', value: -0.15 }], [cap('cg_night')]),
x6(CF, 'f1', '长明·冥河', '背棺普攻命中缩大招冷却', { slots: ['basic'], tagsAll: ['coffin', 'back'] },
  [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.2, max: 0.8, slots: ['ultimate'] } }], [cap('cr_styx')]),
x6(CF, 'f2', '长明·冥河', '大招后 10 秒背棺普攻附加 30% 暗影', { slots: ['basic'], tagsAll: ['coffin', 'back'] },
  [{ op: 'addElement', value: 'shadow', damagePercent: 0.3 }], [cap('cr_styx'), { type: 'recentCast', tag: 'slot:ultimate', within: 10, consume: false }]),
];

export const S40_SETS: SetDef[] = [
  { id: W, name: '断潮巨誓（套装）', cls: 'dlc1_s40_warrior', className: '战士', open: true, since: 'v1.2.81', pieces: WARRIOR_PIECES.map(p => p.id), pieceNames: WARRIOR_PIECES.map(p => p.name), bonuses: WARRIOR_BONUS },
  { id: MG, name: '星潮咒环（套装）', cls: 'dlc1_s40_mage', className: '法师', open: true, since: 'v1.2.81', pieces: MAGE_PIECES.map(p => p.id), pieceNames: MAGE_PIECES.map(p => p.name), bonuses: MAGE_BONUS },
  { id: TC, name: '沉沙钟摆（套装）', cls: 'dlc1_s40_chrono', className: '时砂', open: true, since: 'v1.2.81', pieces: CHRONO_PIECES.map(p => p.id), pieceNames: CHRONO_PIECES.map(p => p.name), bonuses: CHRONO_BONUS },
  { id: AL, name: '潮锈秘方（套装）', cls: 'dlc1_s40_alchemy', className: '炼金', open: true, since: 'v1.2.81', pieces: ALCHEMY_PIECES.map(p => p.id), pieceNames: ALCHEMY_PIECES.map(p => p.name), bonuses: ALCHEMY_BONUS },
  { id: HT, name: '三相潮契（套装）', cls: 'dlc1_s40_hunter', className: '灵契猎手', open: true, since: 'v1.2.81', pieces: HUNTER_PIECES.map(p => p.id), pieceNames: HUNTER_PIECES.map(p => p.name), bonuses: HUNTER_BONUS },
  { id: CF, name: '渡亡长明（套装）', cls: 'dlc1_s40_coffin', className: '负棺人', open: true, since: 'v1.2.81', pieces: COFFIN_PIECES.map(p => p.id), pieceNames: COFFIN_PIECES.map(p => p.name), bonuses: COFFIN_BONUS },
];
export const S40_ITEMS: Fixed[] = [...WARRIOR_PIECES, ...MAGE_PIECES, ...CHRONO_PIECES, ...ALCHEMY_PIECES, ...HUNTER_PIECES, ...COFFIN_PIECES];
/** 按职业查 40 级套装（掉落 / UI 用，不走 classSet()） */
export const S40_BY_CLASS: Record<string, string> = { ['warrior']: 'set40_warrior', ['mage']: 'set40_mage', ['chrono']: 'set40_chrono', ['alchemy']: 'set40_alchemy', [HUNTER_ID]: 'set40_hunter', [COFFIN_ID]: 'set40_coffin' };
/** 套装 id → 件 id 列表（body40 按件数换整身用） */
export const S40_PIECES_OF: Record<string, string[]> = Object.fromEntries(S40_SETS.map(s => [s.id, s.pieces]));

// ---------------------------------------------------------------- 终极天赋读数 s40cap_*（12 个）
// 时砂 / 炼金：本体职业，DLC 读不到天赋点 → PackCtx.talentRank（11-05 本体加的可选接口，越界两行：core/ContentPacks.ts + web/title.ts）
// 猎手 / 负棺：DLC 职业，直接读 hunter_runtime / coffin_runtime 的 ClassExtApi.talentRank（纯 DLC）
export const S40_CAPS = {
  chrono: ['cm_doom', 'ce_parallel', 'cr_eternal'], alchemy: ['ab_chain', 'ag_boil', 'at_twin'],
  hunter: ['hw_alpha', 'hb_ursoc', 'he_sky'], coffin: ['cs_full', 'cg_night', 'cr_styx'],
} as const;
let ctxRef: PackCtx | null = null;
const baseRank = (id: string) => { try { return ctxRef?.talentRank?.(id) ?? 0; } catch { return 0; } };
export function bindSets40(ctx: PackCtx | null) {
  ctxRef = ctx;
  for (const id of [...S40_CAPS.chrono, ...S40_CAPS.alchemy]) CondFlags.provide(`s40cap_${id}`, () => (baseRank(id) > 0 ? 1 : 0));
  for (const id of S40_CAPS.hunter) CondFlags.provide(`s40cap_${id}`, () => ((hunterApi()?.talentRank(id) ?? 0) > 0 ? 1 : 0));
  for (const id of S40_CAPS.coffin) CondFlags.provide(`s40cap_${id}`, () => ((coffinApi()?.talentRank(id) ?? 0) > 0 ? 1 : 0));
}
/** 测试用：12 个读数当前值 */
export const sets40Caps = () => Object.fromEntries(Object.values(S40_CAPS).flat().map(id => [id, CondFlags.get(`s40cap_${id}`, 0)]));

// ---------------------------------------------------------------------
// 11-05 掉落 + 保底（规格 §8）：熔炉英雄起各首领 / 尾王，沉眠者 A / B；每套一份独立 SetPityState（存进 DLC1 包存档 s40）
// ---------------------------------------------------------------------
/** 每个首领掉本职业 40 级套装件的概率（规格 §8 初稿） */
export const S40_DROP = {
  // fix1108b #2（Rhett 11-08 批）约 5 次完整通关收齐本职业 6 件（与钟楼 / 钟井共用保底）。原 熔炉 0.2/0.3/0.3/0.45、尾王 0.3/0.45/0.45/0.65，钟井借用熔炉档
  forge: { heroic: 0.5, epic: 0.55, mythic: 0.55, nightmare: 0.65 } as Record<string, number>,
  forgeLast: { heroic: 0.65, epic: 0.7, mythic: 0.7, nightmare: 0.8 } as Record<string, number>,
  well: { heroic: 0.25, nightmare: 0.56 } as Record<string, number>,
  wellLast: { heroic: 0.35, nightmare: 0.81 } as Record<string, number>,
  sleeper: 0.25,
};
let pity: Record<string, SetPityState> = {};
export function s40Load(d: unknown) {
  pity = {};
  if (!d || typeof d !== 'object') return;
  for (const [k, v] of Object.entries((d as { pity?: Record<string, unknown> }).pity ?? {})) {
    const o = v as Partial<SetPityState>;
    if (S40_PIECES_OF[k]) pity[k] = { dry: Number.isFinite(o?.dry) ? Number(o.dry) : 0, seen: Array.isArray(o?.seen) ? o!.seen!.filter(x => typeof x === 'string' && S40_PIECES_OF[k].includes(x)) : [] };
  }
}
export const s40Save = () => (Object.keys(pity).length ? { pity: Object.fromEntries(Object.entries(pity).map(([k, v]) => [k, { dry: v.dry, seen: [...v.seen] }])) } : null);
/** 熔炉难度 / 是否尾王 → 概率；普通难度不掉 */
// 11-19 00:36 Rhett「可以必掉」：熔炉尾王（英雄起）、钟楼沉眠者也必掉 1 件 40 级本职业套装，同钟井尾王，仍走共用保底挑件；普通难度照旧不掉。?off=lastset40 回 forgeLast / sleeper 0.25
const LAST_SET40_OFF = (() => { try { return /(?:[?&]off=[^&]*\blastset40\b)/.test(location.search); } catch { return false; } })();
export const s40ForgeChance = (diff: string, last: boolean) => { const c = (last ? S40_DROP.forgeLast : S40_DROP.forge)[diff] ?? 0; return last && c > 0 && !LAST_SET40_OFF ? 1 : c; };
export const s40SleeperChance = () => LAST_SET40_OFF ? S40_DROP.sleeper : 1;
/** fix1108b #2 钟井（标准 / 炼狱）套装概率；普通难度不掉 */
// 11-18 23:28 Rhett「尾王必定掉落 1 件套装」：钟井尾王（标准 / 炼狱）套装 100%，仍走共用保底挑件（优先缺的）；普通难度照旧不掉。?off=welllastset 回 0.35 / 0.81
const WELL_LAST_SET_OFF = (() => { try { return /(?:[?&]off=[^&]*\bwelllastset\b)/.test(location.search); } catch { return false; } })();
export const s40WellChance = (diff: string, last: boolean) => { const c = (last ? S40_DROP.wellLast : S40_DROP.well)[diff] ?? 0; return last && c > 0 && !WELL_LAST_SET_OFF ? 1 : c; };
/** 掷一次：按职业查 S40_BY_CLASS → rollSetPiece（dry≥3 只挑缺的，≥6 必掉缺的）→ ctx.dropFixed。返回掉出的件 id */
export function s40Roll(chance: number, x: number, z: number, rng: () => number = Math.random, anc = 0): string | null {
  const ctx = ctxRef, setId = ctx ? S40_BY_CLASS[ctx.classId()] : undefined;
  if (!ctx || !setId || chance <= 0) return null;
  const st = (pity[setId] ??= newPity());
  const r = rollSetPiece(S40_PIECES_OF[setId], chance, st, rng);
  if (!r.piece) { ctx.save?.(); return null; }
  const n = ctx.dropFixed?.(r.piece, x, z, anc);
  if (n) ctx.toast?.(`40 级套装：${n}${r.forced ? '（保底）' : ''}`, '#c080ff');
  ctx.save?.();
  return r.piece;
}
/** 测试 / 调试：各套保底状态 */
export const s40Debug = () => ({ pity: JSON.parse(JSON.stringify(pity)) as Record<string, SetPityState> });
