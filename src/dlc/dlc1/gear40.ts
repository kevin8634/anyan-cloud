// ======================================================================
// DLC1 40 级装备第二批（v1.2.8 d1.10b-2）：
//   1. 两新职业 40 级橙装各 6 件 → 并入 legendaries40.ts 同一门槛（角色 38 级起）
//   2. 两新职业的长副本职业套装（6 件，2 / 4 / 6 件效果）→ PackManifest.sets + items（cls = 职业 id → 本体长副本自动掉）
//   3. 钟楼套装「无声钟楼」4 件首饰 / 披风，六职业通用 → 只在无声钟楼首领掉
//   4. 两新职业暗金武器各 1 件 → 沉眠者（A / B）掉
//   只用通用修饰器（ModifierDef），数值初稿（平衡整体暂缓）。只 import core 的类型。
// ======================================================================
import type { LegendaryPower, ItemSlot } from '../../core/Loot';
import type { ItemDef, SetBonus } from '../../core/Loadout';
import type { SetDef } from '../../core/Sets';
import type { ModifierDef } from '../../core/types';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';
import { CondFlags } from '../../core/CondFlags';
import { FIXED_MIGRATE } from '../../core/Loot';

type M = Omit<ModifierDef, 'id' | 'name' | 'source' | 'priority'>;
const LV = 38;
function lg(cls: string, id: string, name: string, slots: ItemSlot[], kind: string, m: M): LegendaryPower {
  const mod = { id, name, source: 'equipment', priority: 20, cls, ...m } as ModifierDef;
  return { id, name, slots, cls, modifier: mod, kind, source: '沉钟之海 · 角色 38 级起随机橙装', minLevel: LV } as LegendaryPower;
}

// ---------------------------------------------------------------- 1. 新职业 40 级橙装
export const LEGENDARIES_40B: LegendaryPower[] = [
  // 灵契猎手
  lg(HUNTER_ID, 'lg40_h_tideglaive', '潮汐契刃', ['twoHand', 'oneHand'], '连锁触发', { desc: '契刃斩命中后潮水回卷（半径 3，40% 伤害）', match: { slots: ['basic'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.4 } }] }),
  lg(HUNTER_ID, 'lg40_h_whalehelm', '鲸骨兽盔', ['head'], '形态变换', { desc: '熊契技能伤害 +20%，并获得护盾（最大生命 8%，4 秒）', match: { tagsAll: ['bear'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.08, duration: 4 } }] }),
  lg(HUNTER_ID, 'lg40_h_gullmantle', '海鸥羽披', ['shoulder'], '形态变换', { desc: '鹰契技能伤害 +20%，射程 +3 米', match: { tagsAll: ['eagle'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'add', stat: 'range', value: 3 }] }),
  lg(HUNTER_ID, 'lg40_h_packmail', '群狼锁甲', ['chest'], '形态变换', { desc: '狼契技能附带撕裂（每秒 10，持续 4 秒），伤害 +15%', match: { tagsAll: ['wolf'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.15 }, { op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 10, duration: 4 } }] }),
  lg(HUNTER_ID, 'lg40_h_pactlegs', '盟誓链腿', ['legs'], '条件强化', { desc: '对身上有持续伤害（感电灼烧 / 流血等）的敌人，所有技能伤害 +18%', match: {}, conditions: [{ type: 'targetHasEffect', effect: 'dot' }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.18 }] }),
  lg(HUNTER_ID, 'lg40_h_beastbind', '万兽链腕', ['wrist'], '条件强化', { desc: '大招伤害 +30%，冷却 -15%', match: { slots: ['ultimate'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'mul', stat: 'cooldown', value: -0.15 }] }),
  // 负棺人
  lg(COFFIN_ID, 'lg40_c_bellcoffin', '沉钟铁棺', ['twoHand'], '连锁触发', { desc: '棺击敲出钟声余波（半径 3.5，40% 伤害）', match: { slots: ['basic'] },
    ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3.5, damagePercent: 0.4 } }] }),
  lg(COFFIN_ID, 'lg40_c_drownedmask', '溺亡送葬面', ['head'], '条件强化', { desc: '每持有 1 个魂，所有技能伤害 +7%（3 魂 +21%）', match: {}, conditions: [{ type: 'stacks', key: 'souls', scale: true }],
    ops: [{ op: 'mul', stat: 'damage', value: 0.07 }] }),
  lg(COFFIN_ID, 'lg40_c_nailpads', '镇魂钉肩', ['shoulder'], '条件强化', { desc: '技能 2 伤害 +30%，眩晕 1 秒（首领只打断）', match: { slots: ['skill2'] },
    ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'stun', duration: 1 } }] }),
  lg(COFFIN_ID, 'lg40_c_shroudplate', '寿衣铁铠', ['chest'], '资源循环', { desc: '大招命中后获得护盾（最大生命 18%，6 秒）', match: { slots: ['ultimate'] },
    ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.18, duration: 6 } }] }),
  lg(COFFIN_ID, 'lg40_c_gravelegs', '墓潮腿铠', ['legs'], '召唤与地面', { desc: '技能 3 留下墓潮地面（3 米，4 秒）', match: { slots: ['skill3'] },
    ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'shadow', dps: 60, radius: 3, duration: 4 } }] }),
  lg(COFFIN_ID, 'lg40_c_chainbind', '冥河链腕', ['wrist'], '资源循环', { desc: '技能 1 冷却 -2 秒，伤害 +20%', match: { slots: ['skill1'] },
    ops: [{ op: 'add', stat: 'cooldown', value: -2 }, { op: 'mul', stat: 'damage', value: 0.2 }] }),
];

// ---------------------------------------------------------------- 固定装备工具
type Fixed = ItemDef & { baseId: string; affixes: number; adapt?: boolean; desc?: string; flavor?: string; look?: { main: number; glow: number; form?: 'bell' | 'astro' | 'wisp'; lux?: [string, number, number, number?] } };
const fx = (id: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>, cls?: string): ModifierDef => ({ id, name: desc, source: 'equipment', desc, ...(cls ? { cls } : {}), ...m });
const piece = (id: string, name: string, slot: ItemDef['slot'], baseId: string, setId: string): Fixed =>
  ({ id, name, slot, quality: 'purple', setId, baseId, affixes: 2, modifiers: [] });
const bonus = (setId: string, pieces: number, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): SetBonus =>
  ({ setId, pieces, desc, modifier: { id: `${setId}_${pieces}`, name: desc, source: 'equipment', priority: 30, desc, ...m } as ModifierDef });

// ---------------------------------------------------------------- 2. 新职业长副本职业套装
const HS = 'set_dlc1_hunter', CS = 'set_dlc1_coffin';
const HUNTER_PIECES: Fixed[] = [
  piece('i_h_set_coif', '万兽盟约兜帽', 'head', 'b_h_coif', HS), piece('i_h_set_spaulder', '万兽盟约肩披', 'shoulder', 'b_h_spaulder', HS),
  piece('i_h_set_hauberk', '万兽盟约锁甲', 'chest', 'b_h_hauberk', HS), piece('i_h_set_gauntlet', '万兽盟约护手', 'hands', 'b_h_gauntlet', HS),
  piece('i_h_set_bracer', '万兽盟约护腕', 'wrist', 'b_h_bracer', HS), piece('i_h_set_legs', '万兽盟约护腿', 'legs', 'b_h_legs', HS),
];
const COFFIN_PIECES: Fixed[] = [
  piece('i_c_set_helm', '长夜送葬铁面', 'head', 'b_c_helm', CS), piece('i_c_set_pauldron', '长夜送葬肩甲', 'shoulder', 'b_c_pauldron', CS),
  piece('i_c_set_chest', '长夜送葬胸甲', 'chest', 'b_c_chest', CS), piece('i_c_set_gauntlet', '长夜送葬铁手', 'hands', 'b_c_gauntlet', CS),
  piece('i_c_set_bracer', '长夜送葬护腕', 'wrist', 'b_c_bracer', CS), piece('i_c_set_legs', '长夜送葬腿铠', 'legs', 'b_c_legs', CS),
];
const HUNTER_BONUS: SetBonus[] = [
  bonus(HS, 2, '「三相」：狼 / 熊 / 鹰契技能伤害 +12%', { match: { tagsAny: ['wolf', 'bear', 'eagle'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.12 }] }),
  bonus(HS, 4, '「群猎」：技能 1~3 冷却 -15%，命中附带撕裂（每秒 8，4 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.15 }, { op: 'addEffect', effect: { type: 'dot', element: 'physical', dps: 8, duration: 4 } }] }),
  bonus(HS, 6, '「万兽归一」：大招伤害 +50%，命中后在周围召出兽群冲击（半径 5，60% 伤害）', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.5 }, { op: 'addEffect', effect: { type: 'explode', radius: 5, damagePercent: 0.6 } }] }),
];
const COFFIN_BONUS: SetBonus[] = [
  bonus(CS, 2, '「负重」：棺击伤害 +15%', { match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  bonus(CS, 4, '「长夜」：技能 1~3 命中后获得护盾（最大生命 6%，4 秒），伤害 +10%', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.1 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.06, duration: 4 } }] }),
  bonus(CS, 6, '「送终」：大招伤害 +50%，落地处留下 5 秒墓土（半径 4，持续暗影伤害）', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.5 }, { op: 'addEffect', effect: { type: 'groundZone', element: 'shadow', dps: 80, radius: 4, duration: 5 } }] }),
];

// ---------------------------------------------------------------- 3. 钟楼套装（六职业通用，2 件：项链 + 腰带；Rhett 10-24 改）
// 每件本身是橙装（自带 1 条传说特效），两件齐了再加套装效果（原 2 件 + 4 件效果合体）。原戒指 / 饰品 / 披风已删除。
const BS = 'set_dlc1_bell2';
const orangePiece = (id: string, name: string, slot: ItemDef['slot'], baseId: string, mod: ModifierDef): Fixed =>
  ({ id, name, slot, quality: 'orange', setId: BS, baseId, affixes: 2, modifiers: [mod], adapt: true });   // 六职业通用：腰带按职业换同部位底材
const BELL_PIECES: Fixed[] = [
  orangePiece('i_bt_set2_neck', '无声钟楼 · 钟舌坠', 'neck', 'b_amulet',
    fx('btneck', '大招命中后敲响钟舌：半径 5 米钟鸣冲击（80% 伤害）并减速 40%（3 秒）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 5, damagePercent: 0.8 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 3 } }] })),
  orangePiece('i_bt_set2_waist', '无声钟楼 · 钟绳腰带', 'waist', 'b_girdle',
    fx('btwaist', '普通攻击伤害 +20%，每第 15 次命中重置剩余冷却最长的技能（不含大招）', { match: { slots: ['basic'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }, { op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 1, every: 15 } }] })),
];
const BELL_BONUS: SetBonus[] = [
  bonus(BS, 2, '「钟鸣余音」：技能 1~3 命中后敲出余音（半径 3，30% 伤害）；大招冷却 -20%，命中后获得护盾（最大生命 12%，6 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.3 } }] }),
  { setId: BS, pieces: 2, desc: '', modifier: { id: `${BS}_2b`, name: '「钟鸣余音」大招部分', source: 'equipment', priority: 30, desc: '大招冷却 -20%，命中后获得护盾（最大生命 12%，6 秒）', match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.12, duration: 6 } }] } as ModifierDef } as SetBonus,
];

export const DLC1_SETS: SetDef[] = [
  { id: HS, name: '万兽盟约（套装）', cls: HUNTER_ID, className: '灵契猎手', open: true, since: 'v1.2.8', pieces: HUNTER_PIECES.map(p => p.id), pieceNames: HUNTER_PIECES.map(p => p.name), bonuses: HUNTER_BONUS },
  { id: CS, name: '长夜送葬（套装）', cls: COFFIN_ID, className: '负棺人', open: true, since: 'v1.2.8', pieces: COFFIN_PIECES.map(p => p.id), pieceNames: COFFIN_PIECES.map(p => p.name), bonuses: COFFIN_BONUS },
  { id: BS, name: '无声钟楼（套装）', cls: 'dlc1_any', className: '六职业通用', open: true, since: 'v1.2.8', pieces: BELL_PIECES.map(p => p.id), pieceNames: BELL_PIECES.map(p => p.name), bonuses: BELL_BONUS },
];
export const BELL_SET_PIECES = BELL_PIECES.map(p => p.id);

// ---------------------------------------------------------------- 4. 40 级暗金武器（v1.2.38b 重做，Rhett 10-25）
// 六职业各一套：能用双手的（战士 / 法师 / 灵契 / 负棺）= 双手暗金，底材属性 = 本职业主手 + 副手合并；
// 不能用双手的（时砂 / 炼金）= 主手 + 副手两件暗金，各自特效不同，两件合起来约为双手暗金的 90%，齐了再给「成长」套装效果。
// 原「万兽之契」「最后一声」（双手，冲突）已删除。掉落：沉眠者 8%（40 级回响之塔做好后改第 20 层自选）。
export const D40_BASES = [
  { id: 'b_greatsword_d40', name: '沉钟巨剑', slot: 'twoHand', weaponType: 'greatsword', hp: 40, armor: 45, cls: 'warrior', bonus: { power: 28, crit: 2 } },
  { id: 'b_staff_d40', name: '星盘长杖', slot: 'twoHand', weaponType: 'staff', hp: 20, armor: 0, cls: 'mage', bonus: { power: 28, haste: 2, crit: 2 } },
  { id: 'b_h_bow_d40', name: '鹰翼反曲弓', slot: 'offHand', weaponType: 'bow', hp: 0, armor: 0, cls: HUNTER_ID, bonus: { power: 16, crit: 2, haste: 2 } },   // 11-05 规格 v0.2 §4b 弓栏底材（初稿）
  { id: 'b_h_glaive_d40', name: '祖灵长柄弯刃', slot: 'twoHand', weaponType: 'glaive', hp: 0, armor: 0, cls: HUNTER_ID, bonus: { power: 28, crit: 2, critDmg: 4, haste: 2 } },
  { id: 'b_chakram_d40', name: '逆潮时轮', slot: 'oneHand', weaponType: 'chakram', hp: 0, armor: 0, cls: 'chrono', bonus: { power: 12, crit: 1.5 } },
  { id: 'b_hourglass_d40', name: '逆潮沙漏', slot: 'offHand', weaponType: 'hourglass', hp: 15, armor: 0, cls: 'chrono', bonus: { power: 7, haste: 3 } },
  { id: 'b_flask_d40', name: '渊液药瓶', slot: 'oneHand', weaponType: 'flask', hp: 0, armor: 0, cls: 'alchemy', bonus: { power: 12, crit: 1 } },
  { id: 'b_reagent_d40', name: '渊噬试剂匣', slot: 'offHand', weaponType: 'reagent', hp: 15, armor: 0, cls: 'alchemy', bonus: { power: 7, haste: 3 } },
];
const dark = (id: string, name: string, slot: ItemDef['slot'], baseId: string, flavor: string, mods: ModifierDef[], look: { main: number; glow: number; form?: 'bell' | 'astro' | 'wisp' }, affixes = 4, setId?: string): Fixed =>
  ({ id, name, slot, quality: 'dark', baseId, affixes, modifiers: mods, flavor, look: D40_LUX[id] ? { ...look, lux: D40_LUX[id] } : look, ...(setId ? { setId } : {}) });
const G = 0x7dffb0;   // 幽影绿
/** 11-05 比赛版 40 级暗金 Lux3D 模型（05 交付 1105_暗金武器3D；assets_aholo/dlc1/creatures/w40_*.glb）：[模型名, 长度, 握点(0=底 1=顶), 竖握角]。
 *  旧件（沉钟裂潮等）先挂新模型，读档换代后沿用；猎手 / 负棺在 hunter_model / coffin_model 按 D40_LUX_KEY 换。鹰契弓 d40_h_bow：05 原件（弓 + 箭袋同网格）移 assets_aholo/dlc1/_src_05/，本地拆成 w40_hunter_bow_b + w40_hunter_quiver。
 *  11-05 挂点修正（Rhett 截图反馈）：偿潮原件剑柄朝 +Y（截面：0–50% 刃、50–80% 钟片护手、80–100% 柄）→ 长度传负数 = 翻转（makeGlbProp len<0），握点 0.14 同普通巨剑；
 *  相冲星仪头宽 = 长度 82%，原 2.0 长头宽 1.6 米罩住头 → 1.1 长、握点 0.22（头宽约 0.9 米，同钟铸法杖）；赊刻之轮 0.8 长时轮宽仅 0.53 米、藏在髋后 → 1.1（轮宽约 0.73，接近普通时轮）。
 *  注：营地出生点身后营火的烟在画面上正好落在头顶，像「头顶一团暗色」，与武器无关（不装暗金也在）；dark40_look 改为先离开营火再截图。 */
export const D40_LUX: Record<string, [string, number, number, number?]> = {
  d40_w_tide: ['w40_warrior_ebb', -1.6, 0.14], d40_m_astro: ['w40_mage_clash', 1.1, 0.22, 0.15],
  d40_t_wheel: ['w40_chrono_owe', 1.1, 0.5], d40_t_glass: ['w40_chrono_repay', 0.42, 0.5],
  d40_a_flask: ['w40_alchemy_dissolve', 0.42, 0.45], d40_a_box: ['w40_alchemy_swallow', 0.4, 0.5],
};
export const D40_LUX_KEY: Record<string, string> = { d40_h_spirit: 'w40_hunter_triad', d40_h_triad: 'w40_hunter_triad', d40_c_requiem: 'w40_coffin_sleepless', d40_c_sleepless: 'w40_coffin_sleepless', d40_h_bow: 'w40_hunter_bow_b' };
const PC = 'set_dlc1_d40_chrono', PA = 'set_dlc1_d40_alchemy';
const BEAST_SK = { tagsAll: ['beast'] };
const C14 = ['skill1', 'skill2', 'skill3', 'skill4'] as ('skill1' | 'skill2' | 'skill3' | 'skill4')[];
export const DLC1_DARK: Fixed[] = [
  dark('d40_w_tide', '沉钟裂潮', 'twoHand', 'b_greatsword_d40', '刃上悬着三片铜钟残骸。挥下去的时候，海在后面跟着落下。', [
    fx('d40w1', '技能 1~3 命中后留下 4 秒「潮痕」（半径 3，每秒冰霜伤害 18），并减速 30%', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'frost', dps: 18, radius: 3, duration: 4 } }, { op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 3 } }] }, 'warrior'),
    fx('d40w2', '每第 3 次施放技能必定暴击并引发「钟震」：1 秒后原地再震一次（半径 4，80% 伤害），眩晕 1 秒（每 12 秒最多一次）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, conditions: [{ type: 'icd', sec: 12 }, { type: 'stacks', key: 'd40w', min: 3, consume: true }], ops: [{ op: 'addEffect', effect: { type: 'critEvery', n: 1 } }, { op: 'addEffect', effect: { type: 'aftershock', delay: 1, radius: 4, damagePercent: 0.8 } }, { op: 'addEffect', effect: { type: 'stun', duration: 1 } }, { op: 'rename', suffix: '·钟震' }] }, 'warrior'),
  ], { main: 0x1c2a24, glow: G, form: 'bell' }),
  dark('d40_m_astro', '回响星盘', 'twoHand', 'b_staff_d40', '三层星盘各转各的。它们对齐的那一刻，同一句咒语会被念第二遍。', [
    fx('d40m1', '每施放 4 次技能，下一个技能产生「回响」：0.5 秒后在命中处重放一次（半径 3.5，70% 伤害）', { match: { slots: ['skill1', 'skill2', 'skill3', 'ultimate'] }, conditions: [{ type: 'stacks', key: 'd40m', min: 4, consume: true }], ops: [{ op: 'addEffect', effect: { type: 'aftershock', delay: 0.5, radius: 3.5, damagePercent: 0.7 } }, { op: 'rename', suffix: '·回响' }] }, 'mage'),
    fx('d40m2', '所有技能伤害 +15%', { match: {}, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }, 'mage'),
    fx('d40m3', '大招冷却 -20%', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'cooldown', value: -0.2 }] }, 'mage'),
  ], { main: 0x1a2030, glow: G, form: 'astro' }),
  dark('d40_h_spirit', '潮汐祖灵', 'twoHand', 'b_h_glaive_d40', '刃柄上缠着三缕兽魂：狼、熊、鹰。它们记得你变成过它们。', [
    fx('d40h1', '狼 / 熊 / 鹰契技能命中后，祖灵兽魂扑向附近敌人（弹跳 2 次，每次 60% 伤害）', { match: { tagsAny: ['wolf', 'bear', 'eagle'] }, ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 6, damagePercent: 0.6 } }] }, HUNTER_ID),
    fx('d40h2', '技能每命中 1 个敌人叠 1 层「祖灵」（最多 5 层），满 5 层时下一个形态技能召出祖灵冲撞（半径 4，150% 伤害）', { match: { tagsAny: ['wolf', 'bear', 'eagle'] }, conditions: [{ type: 'stacks', key: 'd40h', min: 5, consume: true }], ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 1.5 } }, { op: 'rename', suffix: '·祖灵' }] }, HUNTER_ID),
  ], { main: 0x18261c, glow: G, form: 'wisp' }),
  dark('d40_c_requiem', '九钟安魂', 'twoHand', 'b_c_coffin', '棺盖上挂着九口小钟。第十口在棺里，等你把它装满。', [
    fx('d40c1', '棺击命中叠「钟音」，满 3 层时下一次棺击敲响安魂钟：半径 5 钟鸣（120% 伤害），眩晕 1.5 秒（首领只打断；每 15 秒最多一次）', { match: { slots: ['basic'] }, conditions: [{ type: 'icd', sec: 15 }, { type: 'stacks', key: 'd40c', min: 3, consume: true }], ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 5, damagePercent: 1.2 } }, { op: 'addEffect', effect: { type: 'stun', duration: 1.5 } }, { op: 'rename', suffix: '·安魂钟' }] }, COFFIN_ID),
    fx('d40c2', '大招伤害 +30%，命中留下 5 秒暗影钟域（半径 4，每秒暗影伤害 22）', { match: { slots: ['ultimate'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.3 }, { op: 'addEffect', effect: { type: 'groundZone', element: 'shadow', dps: 22, radius: 4, duration: 5 } }] }, COFFIN_ID),
  ], { main: 0x1a1a24, glow: G, form: 'bell' }),
  // 时砂：主手 + 副手
  dark('d40_t_wheel', '逆潮时轮', 'oneHand', 'b_chakram_d40', '它往回转的时候，你刚放过的技能还没冷却完——又像是从没放过。', [
    fx('d40t1', '技能命中每个敌人，技能 1~3 冷却 -0.4 秒（单次最多 2 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'cdRefund', perHit: 0.4, max: 2, slots: ['skill1', 'skill2', 'skill3'] } }] }, 'chrono'),
  ], { main: 0x1c2420, glow: G, form: 'astro' }, 2, PC),
  dark('d40_t_glass', '逆潮沙漏', 'offHand', 'b_hourglass_d40', '沙子往上流。握着它的人，也能往回走三秒。', [
    fx('d40t2', '位移技能获得护盾（最大生命 18%，4 秒），伤害 +25%', { match: { tagsAny: ['blink', 'movement'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.25 }, { op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.18, duration: 4 } }] }, 'chrono'),
  ], { main: 0x1c2420, glow: G, form: 'astro' }, 2, PC),
  // 炼金：主手 + 副手
  dark('d40_a_flask', '渊液药瓶', 'oneHand', 'b_flask_d40', '瓶里的东西是绿的，摔碎以后还是绿的，而且会长大。', [
    fx('d40a1', '投掷药瓶落地留下 5 秒渊液池（半径 3.5，每秒自然伤害 20）', { match: { tagsAll: ['lob'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'nature', dps: 20, radius: 3.5, duration: 5 } }] }, 'alchemy'),
  ], { main: 0x14261a, glow: G, form: 'wisp' }, 2, PA),
  dark('d40_a_box', '渊噬试剂匣', 'offHand', 'b_reagent_d40', '匣子里的试剂互相吞噬，最后只剩一种。', [
    fx('d40a2', '对持续伤害中的敌人，所有技能伤害 +22%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'dot' }], ops: [{ op: 'mul', stat: 'damage', value: 0.22 }] }, 'alchemy'),
  ], { main: 0x14261a, glow: G, form: 'wisp' }, 2, PA),
  // ---------------- 11-05 新 40 级暗金（规格 DLC1_40级暗金武器_v0.1，方案 B：旧件保留不再掉落，读档 D40_MIGRATE 换新件）
  // 灵契猎手 · 三魂同契：换形技命中留残形 10 秒（技能同时算该形态），三残形齐亮 → 下一个技能 1~4 祖契
  // 11-05 Rhett 14:14：四条只在狼 / 熊契手持长柄时生效（flag dk40h_hold 由 hunter_runtime 提供）；鹰形换弓，残形照常点亮（规格 v0.2 §4b 生效规则）
  dark('d40_h_triad', '三魂同契', 'twoHand', 'b_h_glaive_d40', '狼走了，牙还留在刃上；熊走了，力气还在；鹰走了，它的眼睛还替你看着。', [
    fx('dk40h_w', '（狼 / 熊契手持时生效）残狼：换形技「奔雷扑袭」命中后 10 秒，技能同时算狼契（感电、15% 雷电附加）', { match: BEAST_SK, priority: 12,
      conditions: [{ type: 'flag', key: 'dk40h_hold' }, { type: 'stacks', key: 'dk40h_w' }], ops: [{ op: 'addTag', value: 'wolf' }, { op: 'addElement', value: 'lightning', damagePercent: 0.15 }] }, HUNTER_ID),
    fx('dk40h_b', '残熊：换形技「震地咆哮」命中后 10 秒，技能同时算熊契（破甲）', { match: BEAST_SK, priority: 12,
      conditions: [{ type: 'flag', key: 'dk40h_hold' }, { type: 'stacks', key: 'dk40h_b' }], ops: [{ op: 'addTag', value: 'bear' }, { op: 'addTag', value: 'sunder' }] }, HUNTER_ID),
    fx('dk40h_e', '残鹰：换形技「苍鹰俯冲」命中后 10 秒，技能同时算鹰契（标记）', { match: BEAST_SK, priority: 12,
      conditions: [{ type: 'flag', key: 'dk40h_hold' }, { type: 'stacks', key: 'dk40h_e' }], ops: [{ op: 'addTag', value: 'eagle' }, { op: 'addTag', value: 'mark' }] }, HUNTER_ID),
    fx('dk40h_z', '祖契：三残形同时亮着时，下一个技能 1~4 召出祖灵冲撞（半径 5，150% 伤害）并眩晕 1 秒（首领只打断），三残形熄灭；大招命中点亮全部三残形', {
      match: { tagsAll: ['beast'], slots: ['skill1', 'skill2', 'skill3', 'skill4'] }, priority: 13,
      conditions: [{ type: 'flag', key: 'dk40h_hold' }, { type: 'stacks', key: 'dk40h_w', consume: true }, { type: 'stacks', key: 'dk40h_b', consume: true }, { type: 'stacks', key: 'dk40h_e', consume: true }],
      ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 5, damagePercent: 1.5 } }, { op: 'addEffect', effect: { type: 'stun', duration: 1 } }, { op: 'rename', prefix: '祖契·' }] }, HUNTER_ID),
  ], { main: 0x1a2418, glow: G, form: 'wisp' }),
  // 灵契猎手 · 鹰契（弓栏，规格 v0.2 §4b）：机制在 hunter_runtime（bowOn / 穿云 / 交契），这里的条目只做说明
  dark('d40_h_bow', '鹰誓', 'offHand', 'b_h_bow_d40', '鹰先替你点名，刀再替你收账。', [
    fx('dk40h_bow', '鹰眼：鹰契远射技能命中带标记的目标，叠 1 层鹰印（最多 5 层，10 秒）', { match: { skillIds: ['__none'] }, ops: [] }, HUNTER_ID),
    fx('dk40h_bow_pierce', '穿云：鹰印满 5 层时，下一个鹰契远射技能穿透，并对所有带标记的敌人各追加一箭（60% 伤害），消耗全部层数', { match: { skillIds: ['__none'] }, ops: [] }, HUNTER_ID),
    fx('dk40h_pact', '交契：从鹰契切到狼 / 熊时，鹰印层数转成 6 秒交契：狼 / 熊命中带标记目标每层 +6% 伤害，首次命中必定破甲', { match: { skillIds: ['__none'] }, ops: [] }, HUNTER_ID),
  ], { main: 0x1c2a33, glow: G, form: 'wisp' }),
  // 负棺人 · 不眠棺：魂按种类给被动（宿魂），棺满再收魂挤出最老的魂（coffin_runtime squeeze）
  dark('d40_c_sleepless', '不眠棺', 'twoHand', 'b_c_coffin', '棺里的人从没睡着过。他们只是在等，看你什么时候肯放他们出去。', [
    fx('dk40c', '「挤棺」：棺满时再收魂，最老的魂被挤出、自动以残魂出棺放出（立棺时墓碑也回响）', { match: { skillIds: ['__none'] }, ops: [] }, COFFIN_ID),
    fx('dk40c_b1', '兽魂：技能 1 命中 30% 几率不进冷却', { match: { slots: ['skill1'] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_B' }],
      ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'skill1', chance: 0.3 } }] }, COFFIN_ID),
    fx('dk40c_b3', '纯兽棺：普攻每第 4 次命中重置剩余冷却最长的技能', { match: { slots: ['basic'] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_B', min: 3 }],
      ops: [{ op: 'addEffect', effect: { type: 'resetCooldown', slot: 'longest', chance: 1, every: 4 } }] }, COFFIN_ID),
    fx('dk40c_h1', '人魂：棺击 / 链甩命中弹向 2 个敌人（每跳 55%）', { match: { slots: ['basic'] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_H' }],
      ops: [{ op: 'addEffect', effect: { type: 'chain', jumps: 2, radius: 5, damagePercent: 0.55 } }] }, COFFIN_ID),
    fx('dk40c_h3', '纯人棺：技能 1~4 每第 3 次施放必定暴击', { match: { slots: [...C14] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_H', min: 3 }],
      ops: [{ op: 'addEffect', effect: { type: 'critEvery', n: 3 } }] }, COFFIN_ID),
    fx('dk40c_g1', '巨魂：技能 1~4 命中余波（半径 3，每个巨魂 25%）', { match: { slots: [...C14] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_G', scale: true }],
      ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 3, damagePercent: 0.25 } }] }, COFFIN_ID),
    fx('dk40c_g3', '纯巨棺：技能 1~4 命中眩晕 0.8 秒（首领只打断）', { match: { slots: [...C14] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_G', min: 3 }],
      ops: [{ op: 'addEffect', effect: { type: 'stun', duration: 0.8 } }] }, COFFIN_ID),
    fx('dk40c_a1', '异魂：技能 1~4 附加暗影一段（每个异魂 15%）', { match: { slots: [...C14] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_A', scale: true }],
      ops: [{ op: 'addEffect', effect: { type: 'elemHit', element: 'shadow', damagePercent: 0.15 } }] }, COFFIN_ID),
    fx('dk40c_a3', '纯异棺：技能 1~4 命中恐惧 1.5 秒（首领改为易伤 8%）', { match: { slots: [...C14] }, priority: 40, conditions: [{ type: 'stacks', key: 'souls_A', min: 3 }],
      ops: [{ op: 'addEffect', effect: { type: 'fear', duration: 1.5, bossVuln: 0.08 } }] }, COFFIN_ID),
    fx('dk40c_u', '随葬：大招命中时棺中每个魂随之再爆一次（半径 4，每魂 40%）', { match: { slots: ['ultimate'], tagsAll: ['coffin'] }, priority: 40,
      conditions: [{ type: 'stacks', key: 'souls', scale: true }], ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.4 } }, { op: 'rename', suffix: '·随葬' }] }, COFFIN_ID),
  ], { main: 0x18161f, glow: G, form: 'bell' }),
];
// 双持「成长」套装：技能命中叠「潮涌」（6 秒内不命中清空，最多 10 层），每层所有技能伤害 +2.5%（满层 +25%）
const surge = (setId: string, key: string, cls: string, name: string): SetBonus =>
  ({ setId, pieces: 2, desc: `「${name}」（双持）：技能命中叠「潮涌」，每层所有技能伤害 +2.5%（最多 10 层 = +25%；6 秒不命中清空）`,
     modifier: { id: `${setId}_2`, name: `「${name}」`, source: 'equipment', priority: 30, cls, desc: '潮涌层数 × 2.5% 技能伤害', match: {}, conditions: [{ type: 'stacks', key, scale: true }], ops: [{ op: 'mul', stat: 'damage', value: 0.025 }] } });
export const D40_SETS: SetDef[] = [
  { id: PC, name: '逆潮（双持）', cls: 'dlc1_d40_chrono', className: '时砂', open: true, since: 'v1.2.38b', pieces: ['d40_t_wheel', 'd40_t_glass'], pieceNames: ['逆潮时轮', '逆潮沙漏'], bonuses: [surge(PC, 'd40ts', 'chrono', '逆潮')] },
  { id: PA, name: '渊液（双持）', cls: 'dlc1_d40_alchemy', className: '炼金', open: true, since: 'v1.2.38b', pieces: ['d40_a_flask', 'd40_a_box'], pieceNames: ['渊液药瓶', '渊噬试剂匣'], bonuses: [surge(PA, 'd40as', 'alchemy', '渊液')] },
];
// 叠层规则（本体 web/trigfx.ts 按规则叠，读不到职业时也只是叠层、不生效）
CondFlags.hitRules.push(
  { key: 'd40w', slots: ['skill1', 'skill2', 'skill3'], max: 3, dur: 20 },
  { key: 'd40m', slots: ['skill1', 'skill2', 'skill3', 'ultimate'], max: 4, dur: 30 },
  { key: 'd40h', perTarget: true, max: 5, dur: 15 },
  { key: 'd40c', slots: ['basic'], max: 3, dur: 15 },
  { key: 'd40ts', slots: ['skill1', 'skill2', 'skill3', 'ultimate'], max: 10, dur: 6 },
  { key: 'd40as', slots: ['skill1', 'skill2', 'skill3', 'ultimate'], max: 10, dur: 6 },
  // 11-05 三魂同契：换形技命中 → 该残形 10 秒；大招命中 → 三相全亮
  { key: 'dk40h_w', skillIds: ['hp_shift_wolf'], max: 1, dur: 10 },
  { key: 'dk40h_b', skillIds: ['hp_shift_bear'], max: 1, dur: 10 },
  { key: 'dk40h_e', skillIds: ['hp_shift_eagle'], max: 1, dur: 10 },
  { key: 'dk40h_w', slots: ['ultimate'], max: 1, dur: 10 },
  { key: 'dk40h_b', slots: ['ultimate'], max: 1, dur: 10 },
  { key: 'dk40h_e', slots: ['ultimate'], max: 1, dur: 10 },
);
/** 沉眠者掉落：每个职业一组（双持职业两件随机一件，缺的优先） */
export const DARK_BY_CLASS: Record<string, string[]> = {
  warrior: ['d40_w_tide'], mage: ['d40_m_astro'], [HUNTER_ID]: ['d40_h_triad', 'd40_h_bow'], [COFFIN_ID]: ['d40_c_sleepless'],   // 11-05 猎手 / 负棺换新暗金（其余职业待机制接入后换）
  chrono: ['d40_t_wheel', 'd40_t_glass'], alchemy: ['d40_a_flask', 'd40_a_box'],
};

/** 11-05 旧 40 级暗金 → 新件（规格 §1.2 方案 B）：读档时把旧件换成同职业新件、保留词条；旧定义保留（照常能穿，不再掉落） */
export const D40_MIGRATE: Record<string, string> = { d40_h_spirit: 'd40_h_triad', d40_c_requiem: 'd40_c_sleepless' };
Object.assign(FIXED_MIGRATE, D40_MIGRATE);
export const DLC1_SETS_ALL: SetDef[] = [...DLC1_SETS, ...D40_SETS];
export const GEAR40_ITEMS: Fixed[] = [...HUNTER_PIECES, ...COFFIN_PIECES, ...BELL_PIECES, ...DLC1_DARK];
/** 钟楼掉率：每个首领 25% 一件钟楼套装（优先缺的）；沉眠者 8% 本职业暗金（新职业） */
export const BT_SET_CHANCE = 0.25, BT_DARK_CHANCE = 0.08;

/** 11-14d Rhett（1114b 交接）：40 级暗金图标换成贴近模型的图示（dev/iconshot.mjs 用件本身的 GLB 渲染 + dev/iconcomp.py 合成）。
 *  按 _d40 专用底材登记别名（itemIcon 先查完整底材 id）；负棺两件底材是普通的 b_c_coffin，换了会连普通棺一起变，暂不登记。 */
export const D40_ICONS: Record<string, string> = {
  b_h_glaive_d40: 'it_d40_hunter_triad', b_h_bow_d40: 'it_d40_hunter_bow_b', b_greatsword_d40: 'it_d40_warrior_ebb', b_staff_d40: 'it_d40_mage_clash',
  b_chakram_d40: 'it_d40_chrono_owe', b_hourglass_d40: 'it_d40_chrono_repay', b_flask_d40: 'it_d40_alchemy_dissolve', b_reagent_d40: 'it_d40_alchemy_swallow',
};
