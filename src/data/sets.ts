// v0.5 B：职业套装（原创内容）。规则见 core/Sets.ts
//   战士「狂怒战魂」、法师「霜誓秘仪」各 5 件（头 / 肩 / 胸 / 手 / 腿）；曦誓者的套装只有名字占位（后续开放，不掉落）
//   部件是固定装备（史诗品质，底材属性和 2 条词条随机），英雄及以上难度副本 Boss 掉落
import { ItemDef, SetBonus } from '../core/Loadout';
import { SetDef } from '../core/Sets';
import { ITEMS } from './warrior';
import { withPacks } from '../core/ContentPacks';
/** v1.2.8 内容包套装（没有包 = 空） */
const PACK_SETS = withPacks<SetDef>([], 'sets');

const V = 'v0.5.0-b';
const V6 = 'v0.9.1m';
type Fixed = ItemDef & { baseId: string; since?: string; affixes?: number };

// ---------------- 部件 ----------------
export const SET_ITEMS: Fixed[] = [
  // 阶段七 v0.7.2-br.A：时砂行者「时痕」、炼金投弹手「赤青碧」（部件底材是各自的皮甲 / 布甲）
  { id: 'i_chrono_hood', name: '时痕兜帽', slot: 'head', quality: 'purple', setId: 'set_chrono', baseId: 'b_lhood', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_chrono_shoulder', name: '时痕肩垫', slot: 'shoulder', quality: 'purple', setId: 'set_chrono', baseId: 'b_lshoulder', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_chrono_vest', name: '时痕皮甲', slot: 'chest', quality: 'purple', setId: 'set_chrono', baseId: 'b_lvest', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_chrono_gloves', name: '时痕手套', slot: 'hands', quality: 'purple', setId: 'set_chrono', baseId: 'b_lgloves', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_chrono_legs', name: '时痕长裤', slot: 'legs', quality: 'purple', setId: 'set_chrono', baseId: 'b_llegs', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_alc_mask', name: '赤青碧鸟嘴兜帽', slot: 'head', quality: 'purple', setId: 'set_alchemy', baseId: 'b_amask', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_alc_mantle', name: '赤青碧披肩', slot: 'shoulder', quality: 'purple', setId: 'set_alchemy', baseId: 'b_amantle', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_alc_coat', name: '赤青碧长衣', slot: 'chest', quality: 'purple', setId: 'set_alchemy', baseId: 'b_acoat', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_alc_gloves', name: '赤青碧手套', slot: 'hands', quality: 'purple', setId: 'set_alchemy', baseId: 'b_agloves', since: 'v0.7.2', affixes: 2, modifiers: [] },
  { id: 'i_alc_legs', name: '赤青碧绑腿', slot: 'legs', quality: 'purple', setId: 'set_alchemy', baseId: 'b_alegs', since: 'v0.7.2', affixes: 2, modifiers: [] },
  // 狂怒战魂（战士）：狂怒头盔、狂怒胸甲沿用老版本（老存档里的这两件自动算进新套装）
  { ...ITEMS.find(i => i.id === 'i_helm')!, baseId: 'b_helm', affixes: 2 },
  { id: 'i_fury_pauldron', name: '狂怒肩铠', slot: 'shoulder', quality: 'purple', setId: 'set_fury', baseId: 'b_pauldron', since: V, affixes: 2, modifiers: [] },
  { ...ITEMS.find(i => i.id === 'i_chest')!, baseId: 'b_chest', affixes: 2 },
  { id: 'i_fury_gauntlet', name: '狂怒手甲', slot: 'hands', quality: 'purple', setId: 'set_fury', baseId: 'b_gauntlet', since: V, affixes: 2, modifiers: [] },
  { id: 'i_fury_legs', name: '狂怒腿铠', slot: 'legs', quality: 'purple', setId: 'set_fury', baseId: 'b_legs', since: V, affixes: 2, modifiers: [] },
  // 霜誓秘仪（法师）
  { id: 'i_frost_hood', name: '霜誓兜帽', slot: 'head', quality: 'purple', setId: 'set_frost', baseId: 'b_hood', since: V, affixes: 2, modifiers: [] },
  { id: 'i_frost_mantle', name: '霜誓披肩', slot: 'shoulder', quality: 'purple', setId: 'set_frost', baseId: 'b_mantle', since: V, affixes: 2, modifiers: [] },
  { id: 'i_frost_robe', name: '霜誓法袍', slot: 'chest', quality: 'purple', setId: 'set_frost', baseId: 'b_robe', since: V, affixes: 2, modifiers: [] },
  { id: 'i_frost_gloves', name: '霜誓手套', slot: 'hands', quality: 'purple', setId: 'set_frost', baseId: 'b_silk_gloves', since: V, affixes: 2, modifiers: [] },
  { id: 'i_frost_legs', name: '霜誓长裤', slot: 'legs', quality: 'purple', setId: 'set_frost', baseId: 'b_cloth_legs', since: V, affixes: 2, modifiers: [] },
  // v0.9.1m：长副本职业套装第 6 件「护腕」
  { id: 'i_fury_bracer', name: '狂怒护腕', slot: 'wrist', quality: 'purple', setId: 'set_fury', baseId: 'b_bracer', since: V6, affixes: 2, modifiers: [] },
  { id: 'i_frost_wrap', name: '霜誓护腕', slot: 'wrist', quality: 'purple', setId: 'set_frost', baseId: 'b_wrap', since: V6, affixes: 2, modifiers: [] },
  { id: 'i_chrono_bracer', name: '时痕护腕', slot: 'wrist', quality: 'purple', setId: 'set_chrono', baseId: 'b_lbracer', since: V6, affixes: 2, modifiers: [] },
  { id: 'i_alc_wrap', name: '赤青碧护腕', slot: 'wrist', quality: 'purple', setId: 'set_alchemy', baseId: 'b_awrap', since: V6, affixes: 2, modifiers: [] },
];
/** v0.9.1m：老存档里的手部件改名（防止和护腕混淆） */
export const SET_RENAMES: Record<string, string> = { i_fury_gauntlet: '狂怒手甲', i_chrono_gloves: '时痕手套' };

// ---------------- 套装效果（v0.9.1m：6 件，2 / 4 / 6 件全部是特殊效果，不加副属性） ----------------
// 2 件、4 件通用；6 件按当前主专精（投点最多的系）变化：点了该系终极天赋时强化终极天赋，没点用通用版。
// 机制实现在 web/setfx.ts（spec6() 选分支）；4 件改形态的修饰器在这里（按槽位匹配，换技能后仍生效）。
export interface Set6Branch { spec: string; capstone: string; name: string; desc: string; /** 红色粒子漂浮提示（隐藏组合） */ hidden?: string }
export const SET6: Record<string, { general: string; generalHidden?: string; branches: Set6Branch[] }> = {
  set_fury: { general: '「战魂化身」通用：战魂满 10 点时，下一次大招伤害 +60%', branches: [
    { spec: 'w_arms', capstone: 'wa_mortal', name: '战魂·处决', desc: '武器 · 致死打击：一次结算目标身上全部剩余流血；消耗满 10 点战魂时必定暴击' },
    { spec: 'w_fury', capstone: 'wf_bloodwhirl', name: '战魂·血舞', desc: '狂怒 · 血怒旋风：旋风斩之后继续旋转 5 秒（每秒 40% 伤害并刷新流血），对流血目标额外吸血 8%', hidden: '（其他技能 2 可能会有意想不到的效果）' },
    { spec: 'w_prot', capstone: 'wp_wall', name: '战魂·铁血', desc: '防护 · 盾墙：盾墙期间攻击你的敌人流血；盾墙结束时按期间受到的伤害造成范围流血爆发' },
  ] },
  set_frost: { general: '「冰火同律」通用：冰原里燃烧的敌人死亡时爆炸，把燃烧传染给 4 米内的敌人', branches: [
    { spec: 'm_fire', capstone: 'mf_inferno', name: '同律·蒸爆', desc: '火焰 · 熔火陨星：大招落在冰原上时引发蒸爆，4 秒内每秒结算冰原里所有燃烧，每次蒸爆大招冷却 -1 秒', hidden: '（其他大招可能会有意想不到的效果）' },
    { spec: 'm_frost', capstone: 'mi_shatter', name: '同律·碎火', desc: '冰霜 · 碎裂霜环：霜环命中燃烧的敌人时，把它的燃烧扩散给 5 米内的敌人并刷新持续' },
    { spec: 'm_arcane', capstone: 'ma_chain', name: '同律·缚焰', desc: '奥术 · 连锁禁锢：禁锢命中的敌人被点燃（4 秒，每 0.5 秒一跳）', hidden: '（其他技能 3 可能会有意想不到的效果）' },
  ] },
  set_chrono: { general: '「时间裂缝」通用：终刻结束时，一次结算所有敌人身上剩余的切割', generalHidden: '（其他大招可能会有意想不到的效果）', branches: [
    { spec: 'c_mark', capstone: 'cm_doom', name: '裂缝·命定', desc: '时痕 · 命定之刻：引爆时目标身上每种切割让引爆伤害 +15%，并刷新切割' },
    { spec: 'c_echo', capstone: 'ce_parallel', name: '裂缝·平行', desc: '回声 · 平行回响：回声分身多一个；分身在场时切割伤害 +30%' },
    { spec: 'c_rewind', capstone: 'cr_eternal', name: '裂缝·重演', desc: '回溯 · 永恒一瞬：回溯时把过去 3 秒造成的切割伤害对当前目标重演一次' },
  ] },
  set_alchemy: { general: '「贤者之釜」通用：三色沼泽形成时重置大釜炮台', generalHidden: '（炮台可能会有意想不到的效果）', branches: [
    { spec: 'a_blast', capstone: 'ab_chain', name: '贤者·殉爆', desc: '爆破 · 连锁殉爆：三色沼泽里爆燃瓶命中时，一次结算沼泽里敌人的全部剩余持续伤害（4 秒一次）' },
    { spec: 'a_ground', capstone: 'ag_boil', name: '贤者·沸腾', desc: '地面 · 沸腾之地：三色沼泽在场时，沼泽里敌人受到你的持续伤害翻倍' },
    { spec: 'a_turret', capstone: 'at_twin', name: '贤者·双釜', desc: '炮台 · 双釜：三色沼泽在场时大釜炮台冷却每秒额外 -1 秒，沼泽里的敌人每秒被补上三种持续伤害' },
  ] },
};
/** 11-04 Rhett：4 件套除写明的形态外还有不写明的变化（狂怒：顺劈斩 / 地震波；霜誓：烈焰新星），提示框只给一句模糊提示 */
export const SET4_HINT: Record<string, string> = { set_fury: '集齐 4 件另有变化', set_frost: '集齐 4 件另有变化' };
const six = (id: string): SetBonus => ({ setId: id, pieces: 6, desc: [SET6[id].general + (SET6[id].generalHidden ?? ''), ...SET6[id].branches.map(b => `${b.name}（${b.desc}${b.hidden ?? ''}）`)].join('；') });

export const FURY_SET_BONUSES: SetBonus[] = [
  { setId: 'set_fury', pieces: 2, desc: '「战魂」：你的流血每跳积 1 点战魂（最多 10），下一个直接伤害技能（普攻除外）消耗全部战魂，每点伤害 +4%' },
  { setId: 'set_fury', pieces: 4, desc: '技能 2 变为「血刃旋风斩」：范围 +25%，命中的敌人流血；同一敌人被命中 3 次时重置技能 1（冲锋）冷却', modifier: {
      id: 'set_fury_4', name: '狂怒战魂(4件)', source: 'equipment', priority: 30,
      desc: '旋风斩变为血刃旋风斩：范围 +25%，附带流血', match: { skillIds: ['whirlwind'] },
      ops: [{ op: 'addTag', value: 'fx_blood' }, { op: 'mul', stat: 'radius', value: 0.25 },
            { op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 10, duration: 4 } }, { op: 'rename', name: '血刃旋风斩' }] } },
  { setId: 'set_fury', pieces: 4, desc: '', modifier: {   // v1.2.73 顺劈斩 / 地震波也吃 4 件（范围 +25%、流血），不改名
      id: 'set_fury_4b', name: '狂怒战魂(4件)', source: 'equipment', priority: 30,
      desc: '技能 2 范围 +25%，附带流血', match: { skillIds: ['cleave', 'quake'] },
      ops: [{ op: 'addTag', value: 'fx_blood' }, { op: 'mul', stat: 'radius', value: 0.25 },
            { op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 10, duration: 4 } }] } },
  six('set_fury'),
];
// 霜誓秘仪：4 件保留「永冻新星」形态
export const FROST_BONUSES: SetBonus[] = [
  { setId: 'set_frost', pieces: 2, desc: '「霜火」：冰霜伤害命中燃烧中的敌人时，立刻结算它剩余燃烧的 30%（燃烧不移除）' },
  { setId: 'set_frost', pieces: 4, desc: '技能 2 变为「永冻新星」：范围 +30%，留下 5 秒冰原（减速 60%），命中后重置技能 1；冰原里敌人的燃烧伤害 ×1.5', modifier: {
      id: 'set_frost_4', name: '霜誓秘仪(4件)', source: 'equipment', priority: 30,
      desc: '霜环变为永冻新星：范围 +30%，留下冰原，命中后重置烈焰弹', match: { skillIds: ['frost_ring'] },
      ops: [{ op: 'addTag', value: 'fx_permafrost' }, { op: 'mul', stat: 'radius', value: 0.3 },
            { op: 'addEffect', effect: { type: 'groundZone', element: 'frost', dps: 10, radius: 4, duration: 5 } },
            { op: 'addEffect', effect: { type: 'slow', percent: 0.6, duration: 5 } },
            { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 1 } }, { op: 'rename', name: '永冻新星' }] } },
  { setId: 'set_frost', pieces: 4, desc: '', modifier: {   // v1.2.73 烈焰新星也留冰原（正常略高：火焰新星本身就在冰原里结算燃烧 ×1.5），不改名
      id: 'set_frost_4b', name: '霜誓秘仪(4件)', source: 'equipment', priority: 30,
      desc: '烈焰新星留下冰原，命中后重置烈焰弹', match: { skillIds: ['flame_nova'] },
      ops: [{ op: 'addTag', value: 'fx_permafrost' }, { op: 'mul', stat: 'radius', value: 0.3 },
            { op: 'addEffect', effect: { type: 'groundZone', element: 'frost', dps: 10, radius: 4, duration: 5 } },
            { op: 'addEffect', effect: { type: 'slow', percent: 0.6, duration: 5 } },
            { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 1 } }] } },
  six('set_frost'),
];
// 时痕：4 件的回声分身在 web/chrono.ts（setN >= 4），分身的时轮带切割
export const CHRONO_SET_BONUSES: SetBonus[] = [
  { setId: 'set_chrono', pieces: 2, desc: '「蚀刻」：切割每跳额外把 20% 伤害存进目标的时痕' },
  { setId: 'set_chrono', pieces: 4, desc: '时痕引爆时召唤一个回声分身 4 秒：每秒朝附近的敌人扔一次时轮，时轮附带切割（每 6 秒最多一次）' },
  six('set_chrono'),
];
// 赤青碧：4 件的三色沼泽判定在 web/alchemy.ts（3 种区域同时在场），附加效果在 web/setfx.ts
export const ALCHEMY_SET_BONUSES: SetBonus[] = [
  { setId: 'set_alchemy', pieces: 2, desc: '「三色」：连续投出 3 种不同颜色的瓶子时，第 3 瓶落点再引发一次混合反应（60% 伤害，带灼烧 / 冻伤 / 腐蚀）' },
  { setId: 'set_alchemy', pieces: 4, desc: '场上同时有 3 种区域时形成「三色沼泽」：你造成的伤害 +20%，区域里的敌人减速 30% 并被补上灼烧 / 冻伤 / 腐蚀' },
  six('set_alchemy'),
];

/** 全部套装效果（Loadout.setSetBonuses / Inventory.setBonuses 用这个） */
export const ALL_SET_BONUSES: SetBonus[] = [...FURY_SET_BONUSES, ...FROST_BONUSES, ...CHRONO_SET_BONUSES, ...ALCHEMY_SET_BONUSES, ...PACK_SETS.flatMap(s => s.bonuses)];

export const SETS: Record<string, SetDef> = {
  set_fury: { id: 'set_fury', name: '狂怒战魂（套装）', cls: 'warrior', className: '战士', open: true, since: V,
    pieces: ['i_helm', 'i_fury_pauldron', 'i_chest', 'i_fury_gauntlet', 'i_fury_bracer', 'i_fury_legs'],
    pieceNames: ['狂怒头盔', '狂怒肩铠', '狂怒胸甲', '狂怒手甲', '狂怒护腕', '狂怒腿铠'], bonuses: FURY_SET_BONUSES },
  set_frost: { id: 'set_frost', name: '霜誓秘仪（套装）', cls: 'mage', className: '法师', open: true, since: V,
    pieces: ['i_frost_hood', 'i_frost_mantle', 'i_frost_robe', 'i_frost_gloves', 'i_frost_wrap', 'i_frost_legs'],
    pieceNames: ['霜誓兜帽', '霜誓披肩', '霜誓法袍', '霜誓手套', '霜誓护腕', '霜誓长裤'], bonuses: FROST_BONUSES },
  set_chrono: { id: 'set_chrono', name: '时痕（套装）', cls: 'chrono', className: '时砂行者', open: true, since: 'v0.7.2',
    pieces: ['i_chrono_hood', 'i_chrono_shoulder', 'i_chrono_vest', 'i_chrono_gloves', 'i_chrono_bracer', 'i_chrono_legs'],
    pieceNames: ['时痕兜帽', '时痕肩垫', '时痕皮甲', '时痕手套', '时痕护腕', '时痕长裤'], bonuses: CHRONO_SET_BONUSES },
  set_alchemy: { id: 'set_alchemy', name: '赤青碧（套装）', cls: 'alchemy', className: '炼金投弹手', open: true, since: 'v0.7.2',
    pieces: ['i_alc_mask', 'i_alc_mantle', 'i_alc_coat', 'i_alc_gloves', 'i_alc_wrap', 'i_alc_legs'],
    pieceNames: ['赤青碧鸟嘴兜帽', '赤青碧披肩', '赤青碧长衣', '赤青碧手套', '赤青碧护腕', '赤青碧绑腿'], bonuses: ALCHEMY_SET_BONUSES },
};
for (const s of PACK_SETS) if (!SETS[s.id]) SETS[s.id] = s;   // v1.2.8 内容包套装（本体 id 优先）
/** 职业 → 本职业套装 */
export const classSet = (cls: string): SetDef | undefined => Object.values(SETS).find(s => s.cls === cls && s.open);
export const setOf = (setId?: string): SetDef | undefined => (setId ? SETS[setId] : undefined);

/** 主线 v0.6.6：职业套装改由长副本首领掉落（每次首领击杀判定一次，带 core/Sets.ts 的保底）：标准 / 炼狱 */
export const RAID_SET_CHANCE = { normal: 0.35, hell: 0.9 };   // v1.2.38b 炼狱掉率翻倍（Rhett 10-25）：0.45 → 0.9   // v0.9.6a 长副本只掉套装 + 橙装：20/30% → 35/45%
