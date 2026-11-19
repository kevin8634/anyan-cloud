// 掉落配置：底材、词条池、传说特效、掉落表（原创内容）
import { DUNGEON_SET_ITEMS } from './dungeon_new';
import { DUNGEON_ITEMS, DL_TABLES, dlEntries } from './dungeon_loot';
import { ENDGAME_GUIDE_TABLES } from './endgame_tables';
import { buildLegendaries, LG_REMAP } from './legendary_v091';
import { withPacks } from '../core/ContentPacks';
import { LootData, LootTable, LegendaryPower, LootGenerator, ItemInstance, AffixDef, ItemBase } from '../core/Loot';
import { ITEMS } from './warrior';
import { MAGE_LEGENDARIES, MAGE_AFFIXES } from './mage';
import { WARRIOR_LG_069, MAGE_LG_069, SHARED_LG_069 } from './legendary_v069';
import { CHRONO_LEGENDARIES, CHRONO_AFFIXES } from './chrono';
import { ALCHEMY_LEGENDARIES, ALCHEMY_AFFIXES } from './alchemy';

import { ItemSlot } from '../core/Loadout';
import { WILD_LOOT } from './zones_wild';
import { RAID_LOOT } from './raid_molten';
import { ELITE_ITEMS, eliteEntries } from './elite_gear';
import { DARK_ITEMS } from './darkgold';
import { WB_ITEMS, WB_LOOT } from './world_bosses';
import './classfx_v07';   // v0.7.4-br.A：新职业的首饰职业版特效
import { SET_ITEMS, SETS, classSet } from './sets';
import { rollSetPiece, SetPityState } from '../core/Sets';

// 部位分组（词条池按部位挑）
const ARMOR: ItemSlot[] = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];
const JEWEL: ItemSlot[] = ['neck', 'ring', 'trinket'];
const WEAPON: ItemSlot[] = ['oneHand', 'twoHand'];
const ALL: ItemSlot[] = [...ARMOR, 'back', ...JEWEL, ...WEAPON, 'offHand'];

// 传说特效直接复用战士配置里的“寒冰核心”“风暴战斧”，再加两个
const frostCore = ITEMS.find(i => i.id === 'i_frost_core')!.modifiers[0];
const stormAxe = ITEMS.find(i => i.id === 'i_storm_axe')!.modifiers[0];

// 战士的传说特效标 cls: 'warrior'，法师的在 data/mage.ts（cls: 'mage'），掉落时按当前职业挑
/** v0.9.1o 之前的传说池（只用来沿用老特效） */
export const LEGENDARIES_OLD: LegendaryPower[] = [
  { kind: '条件强化', id: 'lg_frost_core', name: '寒冰核心', slots: ['trinket', 'neck'], cls: 'warrior', modifier: frostCore },
  { kind: '连锁触发', id: 'lg_storm_axe', name: '风暴战斧', slots: ['oneHand', 'twoHand'], cls: 'warrior', modifier: stormAxe },
  { kind: '召唤与地面', id: 'lg_quake_boots', name: '裂地者护腿', slots: ['legs', 'feet'], cls: 'warrior', modifier: {
      id: 'lg_quake', name: '裂地者护腿', source: 'equipment', priority: 20,
      desc: '冲锋落地时爆炸，对周围造成 80% 伤害，并震裂地面 3 秒', match: { skillIds: ['charge'] },
      ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 4, damagePercent: 0.8 } }, { op: 'addEffect', effect: { type: 'groundZone', element: 'physical', dps: 80, radius: 3.5, duration: 3 } }, { op: 'rename', prefix: '裂地' }] } },
  { kind: '资源循环', id: 'lg_vampire', name: '饮血者胸甲', slots: ['chest'], cls: 'warrior', modifier: {
      id: 'lg_vampire', name: '饮血者胸甲', source: 'equipment', priority: 20,
      desc: '旋风斩变为暗影伤害，造成伤害的 8% 转化为生命，溢出的治疗转为护盾（最多最大生命 20%）', match: { skillIds: ['whirlwind'] },
      ops: [{ op: 'setElement', value: 'shadow' }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.08, overflowShield: 0.2 } }, { op: 'rename', prefix: '饮血' }] } },
  ...MAGE_LEGENDARIES,
  // v0.6.9
  ...WARRIOR_LG_069, ...MAGE_LG_069, ...SHARED_LG_069,
  ...CHRONO_LEGENDARIES,
  ...ALCHEMY_LEGENDARIES,
];

const LG91 = buildLegendaries(LEGENDARIES_OLD);
/** v0.9.1o 传说池：96 条设计表里已实现的条目 */
export const LEGENDARIES: LegendaryPower[] = withPacks<LegendaryPower>(LG91.ready, 'legendaries');   // v0.9.7 内容包橙装（没有包 = 原数组）
export const LEGENDARIES_PENDING = LG91.pending;

export const LOOT_DATA: LootData = {
  // 底材数值思路：
  //   重甲（战士）护甲高；布甲（法师）护甲低、生命略高；披风/首饰通用
  //   双手武器强度 ≈ 单手 ×2.1 + 暴击类属性；单手 + 盾 = 防御（护甲/生命），单手 + 典籍/法球 = 急速/暴击
  //   老存档的底材 id（b_sword b_axe b_staff b_helm b_hood b_chest b_robe b_legs b_ring b_amulet）保持不变，迁移时按 id 补属性
  bases: withPacks<ItemBase>([
    // ---- 武器：战士 ----
    { id: 'b_sword', name: '铁刃长剑', slot: 'oneHand', weaponType: 'sword', hp: 0, armor: 0, cls: 'warrior', bonus: { power: 13, crit: 1 } },
    { id: 'b_axe', name: '伐木战斧', slot: 'oneHand', weaponType: 'axe', hp: 0, armor: 0, cls: 'warrior', bonus: { power: 14, critDmg: 4 } },
    { id: 'b_mace', name: '铁头战锤', slot: 'oneHand', weaponType: 'mace', hp: 20, armor: 0, cls: 'warrior', bonus: { power: 13 } },
    { id: 'b_greatsword', name: '双手巨剑', slot: 'twoHand', weaponType: 'greatsword', hp: 0, armor: 0, cls: 'warrior', bonus: { power: 28, crit: 2 } },
    { id: 'b_greataxe', name: '开山巨斧', slot: 'twoHand', weaponType: 'greataxe', hp: 0, armor: 0, cls: 'warrior', bonus: { power: 30, critDmg: 10 } },
    { id: 'b_shield', name: '橡木圆盾', slot: 'offHand', weaponType: 'shield', hp: 40, armor: 45, cls: 'warrior' },
    // ---- 武器：法师 ----
    { id: 'b_staff', name: '橡木法杖', slot: 'twoHand', weaponType: 'staff', hp: 20, armor: 0, cls: 'mage', bonus: { power: 28, haste: 2 } },
    { id: 'b_wand', name: '雕纹魔杖', slot: 'oneHand', weaponType: 'wand', hp: 0, armor: 0, cls: 'mage', bonus: { power: 14 } },
    { id: 'b_dagger', name: '仪式匕首', slot: 'oneHand', weaponType: 'dagger', hp: 0, armor: 0, cls: 'mage', bonus: { power: 12, crit: 1.5 } },
    { id: 'b_tome', name: '奥术典籍', slot: 'offHand', weaponType: 'tome', hp: 15, armor: 0, cls: 'mage', bonus: { power: 6, haste: 3 } },
    { id: 'b_orb', name: '寒晶法球', slot: 'offHand', weaponType: 'orb', hp: 0, armor: 0, cls: 'mage', bonus: { power: 7, crit: 2 } },
    // ---- 重甲（战士） ----
    { id: 'b_helm', name: '铁盔', slot: 'head', armorType: 'plate', hp: 40, armor: 20, cls: 'warrior' },
    { id: 'b_pauldron', name: '钢铁肩甲', slot: 'shoulder', armorType: 'plate', hp: 30, armor: 16, cls: 'warrior' },
    { id: 'b_chest', name: '链甲衫', slot: 'chest', armorType: 'plate', hp: 70, armor: 40, cls: 'warrior' },
    { id: 'b_bracer', name: '钢护腕', slot: 'wrist', armorType: 'plate', hp: 18, armor: 10, cls: 'warrior' },
    { id: 'b_gauntlet', name: '钢铁护手', slot: 'hands', armorType: 'plate', hp: 24, armor: 13, cls: 'warrior' },
    { id: 'b_girdle', name: '铁扣腰带', slot: 'waist', armorType: 'plate', hp: 22, armor: 12, cls: 'warrior' },
    { id: 'b_legs', name: '铁鳞护腿', slot: 'legs', armorType: 'plate', hp: 50, armor: 28, cls: 'warrior' },
    { id: 'b_sabaton', name: '钢铁战靴', slot: 'feet', armorType: 'plate', hp: 26, armor: 14, cls: 'warrior' },
    // ---- 布甲（法师） ----
    { id: 'b_hood', name: '织纹兜帽', slot: 'head', armorType: 'cloth', hp: 45, armor: 10, cls: 'mage' },
    { id: 'b_mantle', name: '织锦披肩', slot: 'shoulder', armorType: 'cloth', hp: 34, armor: 7, cls: 'mage' },
    { id: 'b_robe', name: '学徒法袍', slot: 'chest', armorType: 'cloth', hp: 80, armor: 18, cls: 'mage' },
    { id: 'b_wrap', name: '布质腕带', slot: 'wrist', armorType: 'cloth', hp: 20, armor: 4, cls: 'mage' },
    { id: 'b_silk_gloves', name: '丝绸手套', slot: 'hands', armorType: 'cloth', hp: 26, armor: 5, cls: 'mage' },
    { id: 'b_sash', name: '丝绸腰带', slot: 'waist', armorType: 'cloth', hp: 24, armor: 5, cls: 'mage' },
    { id: 'b_cloth_legs', name: '织布长裤', slot: 'legs', armorType: 'cloth', hp: 56, armor: 12, cls: 'mage' },
    { id: 'b_cloth_shoes', name: '软布便鞋', slot: 'feet', armorType: 'cloth', hp: 28, armor: 5, cls: 'mage', bonus: { speed: 2 } },
    // ---- 时砂行者（v0.7.0）：时轮（单手，可双持）、沙漏（副手）、皮甲 ----
    { id: 'b_chakram', name: '铁制时轮', slot: 'oneHand', weaponType: 'chakram', hp: 0, armor: 0, cls: 'chrono', bonus: { power: 13, crit: 1.5 }, since: 'v0.7.0' },
    { id: 'b_hourglass', name: '黄铜沙漏', slot: 'offHand', weaponType: 'hourglass', hp: 15, armor: 0, cls: 'chrono', bonus: { power: 6, haste: 3 }, since: 'v0.7.0' },
    { id: 'b_lhood', name: '夜行兜帽', slot: 'head', armorType: 'leather', hp: 42, armor: 15, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_lshoulder', name: '皮革肩垫', slot: 'shoulder', armorType: 'leather', hp: 32, armor: 11, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_lvest', name: '镶边皮甲', slot: 'chest', armorType: 'leather', hp: 75, armor: 28, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_lbracer', name: '束带护腕', slot: 'wrist', armorType: 'leather', hp: 19, armor: 7, cls: 'chrono', bonus: { crit: 0.5 }, since: 'v0.7.0' },
    { id: 'b_lgloves', name: '露指手套', slot: 'hands', armorType: 'leather', hp: 25, armor: 9, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_lbelt', name: '沙漏扣腰带', slot: 'waist', armorType: 'leather', hp: 23, armor: 8, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_llegs', name: '软皮长裤', slot: 'legs', armorType: 'leather', hp: 53, armor: 20, cls: 'chrono', since: 'v0.7.0' },
    { id: 'b_lboots', name: '沙行软靴', slot: 'feet', armorType: 'leather', hp: 27, armor: 10, cls: 'chrono', bonus: { speed: 2 }, since: 'v0.7.0' },
    // ---- 炼金投弹手（v0.7.1）：药瓶（单手）、试剂匣（副手）、布甲（独立底材，和法师的布甲同名不同件） ----
    { id: 'b_flask', name: '玻璃药瓶', slot: 'oneHand', weaponType: 'flask', hp: 0, armor: 0, cls: 'alchemy', bonus: { power: 14, crit: 1 }, since: 'v0.7.1' },
    { id: 'b_reagent', name: '木制试剂匣', slot: 'offHand', weaponType: 'reagent', hp: 15, armor: 0, cls: 'alchemy', bonus: { power: 6, haste: 3 }, since: 'v0.7.1' },
    { id: 'b_amask', name: '鸟嘴兜帽', slot: 'head', armorType: 'cloth', hp: 45, armor: 10, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_amantle', name: '油布披肩', slot: 'shoulder', armorType: 'cloth', hp: 34, armor: 7, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_acoat', name: '药剂师长衣', slot: 'chest', armorType: 'cloth', hp: 80, armor: 18, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_awrap', name: '浸油腕带', slot: 'wrist', armorType: 'cloth', hp: 20, armor: 4, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_agloves', name: '耐酸手套', slot: 'hands', armorType: 'cloth', hp: 26, armor: 5, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_abelt', name: '药瓶腰带', slot: 'waist', armorType: 'cloth', hp: 24, armor: 5, cls: 'alchemy', bonus: { haste: 1 }, since: 'v0.7.1' },
    { id: 'b_alegs', name: '粗布绑腿', slot: 'legs', armorType: 'cloth', hp: 56, armor: 12, cls: 'alchemy', since: 'v0.7.1' },
    { id: 'b_aboots', name: '防滑短靴', slot: 'feet', armorType: 'cloth', hp: 28, armor: 5, cls: 'alchemy', bonus: { speed: 2 }, since: 'v0.7.1' },
    // ---- 通用：披风、项链、戒指、饰品 ----
    { id: 'b_cloak', name: '旅者披风', slot: 'back', hp: 30, armor: 8 },
    { id: 'b_amulet', name: '护身符', slot: 'neck', hp: 35, armor: 0 },
    { id: 'b_necklace', name: '翡翠项链', slot: 'neck', hp: 22, armor: 0, bonus: { crit: 1 } },
    { id: 'b_ring', name: '铜戒指', slot: 'ring', hp: 30, armor: 0 },
    { id: 'b_signet', name: '蓝宝石印戒', slot: 'ring', hp: 18, armor: 0, bonus: { power: 4 } },
    { id: 'b_idol', name: '骨雕护符', slot: 'trinket', hp: 25, armor: 0, bonus: { haste: 2 } },
  ], 'bases'),   // v1.0.6 内容包底材
  affixes: [
    { id: 'a_dmg', kind: 'skill', text: '所有技能伤害 +{v}%', slots: [...WEAPON, 'offHand', ...JEWEL], weight: 10, stat: 'damage', op: 'mul', min: 0.06, max: 0.14 },
    { id: 'a_cd', kind: 'skill', text: '技能冷却 -{v}%', slots: ['head', 'shoulder', 'neck', 'trinket', 'offHand'], weight: 6, stat: 'cooldown', op: 'mul', min: -0.04, max: -0.08, match: { slots: ['skill1', 'skill2', 'skill3'] } },
    { id: 'a_basic', kind: 'skill', text: '普通攻击伤害 +{v}%', slots: [...WEAPON, 'hands'], weight: 8, stat: 'damage', op: 'mul', min: 0.15, max: 0.3, match: { slots: ['basic'] } },
    { id: 'a_aoe', kind: 'skill', text: '范围技能半径 +{v}%', slots: ['chest', 'legs', 'shoulder', 'waist'], weight: 6, stat: 'radius', op: 'mul', min: 0.1, max: 0.2, match: { tagsAny: ['aoe'] } },
    { id: 'a_ult', kind: 'skill', text: '大招伤害 +{v}%', slots: ['chest', 'head', 'shoulder', 'back'], weight: 5, stat: 'damage', op: 'mul', min: 0.15, max: 0.3, match: { slots: ['ultimate'] } },
    { id: 'a_hp', kind: 'char', text: '生命 +{v}', slots: ALL, weight: 12, stat: 'hp', min: 30, max: 70 },
    { id: 'a_armor', kind: 'char', text: '护甲 +{v}', slots: [...ARMOR, 'back', 'offHand'], weight: 10, stat: 'armor', min: 10, max: 30 },
    // 二级属性词条
    { id: 'a_power_w', kind: 'char', cls: 'warrior', text: '攻击强度 +{v}', slots: [...WEAPON, 'offHand', ...JEWEL], weight: 8, stat: 'power', min: 3, max: 8 },
    { id: 'a_power_m', kind: 'char', cls: 'mage', text: '法术强度 +{v}', slots: [...WEAPON, 'offHand', ...JEWEL], weight: 8, stat: 'power', min: 3, max: 8 },
    { id: 'a_crit', kind: 'char', text: '暴击率 +{v}%', slots: ['hands', 'wrist', 'neck', 'ring', ...WEAPON, 'offHand'], weight: 7, stat: 'crit', min: 1, max: 3 },
    { id: 'a_critdmg', kind: 'char', text: '暴击伤害 +{v}%', slots: ['hands', 'ring', 'twoHand', 'trinket'], weight: 5, stat: 'critDmg', min: 4, max: 10 },
    { id: 'a_haste', kind: 'char', text: '急速 +{v}%（攻速 / 持续伤害 / 翻滚）', slots: ['wrist', 'waist', 'trinket', 'neck', 'offHand', 'back'], weight: 6, stat: 'haste', min: 1, max: 3 },
    { id: 'a_speed', kind: 'char', text: '移动速度 +{v}%', slots: ['feet', 'back'], weight: 6, stat: 'speed', min: 2, max: 5 },
    // 效果词条：紫装起出现
    { id: 'a_burn', kind: 'effect', text: '普通攻击附带灼烧（每秒4点，3秒）', slots: WEAPON, weight: 3, minQuality: 'purple',
      effect: { type: 'dot', element: 'fire', dps: 4, duration: 3 }, match: { slots: ['basic'] } },
    { id: 'a_chill', kind: 'effect', cls: 'warrior', text: '雷霆一击减速时间 +2 秒', slots: ['legs', 'trinket', 'feet', 'waist'], weight: 3, minQuality: 'purple',
      effect: { type: 'slow', percent: 0.3, duration: 5 }, match: { skillIds: ['thunderclap'] } },
    ...MAGE_AFFIXES,
    ...CHRONO_AFFIXES,
    ...ALCHEMY_AFFIXES,
  ],
  legendaries: LEGENDARIES,
  legendaryRemap: LG_REMAP,
  // v0.5 B：两个职业套装的全部部件（data/sets.ts，含老的狂怒头盔 / 胸甲；v0.6.6 主线起从长副本首领掉落）+ 野外首领特效件 + 暗金 + 副本小套
  fixedItems: withPacks<LootData['fixedItems'][number]>([...SET_ITEMS, ...ELITE_ITEMS, ...DARK_ITEMS, ...DUNGEON_SET_ITEMS, ...WB_ITEMS, ...DUNGEON_ITEMS], 'items'),   // v0.9.7 内容包固定装备   // v0.9.3h 副本专属件   // v0.9.3d 世界首领专属橙装
  qualityWeights: { green: 60, blue: 28, purple: 10, orange: 2 },
};

export const LOOT_TABLES: Record<string, LootTable> = {
  // v0.5 C：小怪掉灰色杂物（stacks 里 junk_*，拜访商人自动卖钱）
  trash: { id: 'trash', gold: [3, 8], entries: [{ kind: 'random', chance: 0.3 }], stacks: [{ id: 'junk_fang', chance: 0.5, min: 1, max: 2 }] },
  boss_grok: { id: 'boss_grok', gold: [60, 90], entries: [
    { kind: 'random', chance: 1, minQuality: 'blue' },
    { kind: 'random', chance: 1, minQuality: 'purple' },     // 保底一件紫
    // v0.5 B：套装部件不再写在掉落表里，统一由难度的套装掉率 + 保底发放（dropSetPiece / core/Sets.ts）
  ], stacks: [{ id: 'mat_dust', chance: 1, min: 2, max: 4 }, { id: 'mat_shard', chance: 0.5, min: 1, max: 1 }] },
  // 腐沼神殿：小怪掉率更高、偶尔掉魔尘；Boss 保底紫装 + 15% 传说 + 虚空精华
  trash_swamp: { id: 'trash_swamp', gold: [6, 14], entries: [{ kind: 'random', chance: 0.4 }], stacks: [{ id: 'mat_dust', chance: 0.3, min: 1, max: 2 }, { id: 'junk_cloth', chance: 0.5, min: 1, max: 2 }] },
  boss_rotroot: { id: 'boss_rotroot', gold: [120, 180], entries: [
    { kind: 'random', chance: 1, minQuality: 'blue' },
    { kind: 'random', chance: 1, minQuality: 'purple' },
    { kind: 'random', chance: 0.5, minQuality: 'purple' },
    { kind: 'random', chance: 0.15, minQuality: 'orange' },
  ], stacks: [{ id: 'mat_shard', chance: 1, min: 2, max: 3 }, { id: 'mat_essence', chance: 1, min: 1, max: 2 }] },
  // 翠风原野：小怪偶尔掉新部位（肩/披风/护腕/腰带/首饰）；精英赤鬃保底蓝+紫，稀有金鬃保底紫色首饰/披风
  trash_field: { id: 'trash_field', gold: [8, 16], entries: [
    { kind: 'random', chance: 0.32 },
    { kind: 'random', chance: 0.12, slots: ['shoulder', 'back', 'wrist', 'waist', 'neck', 'ring', 'trinket'] },
  ], stacks: [{ id: 'mat_dust', chance: 0.3, min: 1, max: 2 }, { id: 'junk_cloth', chance: 0.5, min: 1, max: 2 }] },
  elite_field: { id: 'elite_field', gold: [90, 140], entries: [
    { kind: 'random', chance: 1, minQuality: 'blue', slots: ['shoulder', 'back', 'wrist', 'waist', 'hands', 'feet'] },
    { kind: 'random', chance: 1, minQuality: 'purple' },
    { kind: 'random', chance: 0.5, minQuality: 'purple', slots: ['neck', 'ring', 'trinket'] },
    { kind: 'random', chance: 0.1, minQuality: 'orange' },
  ], stacks: [{ id: 'mat_shard', chance: 1, min: 1, max: 2 }, { id: 'mat_essence', chance: 0.6, min: 1, max: 1 }] },
  rare_field: { id: 'rare_field', gold: [40, 70], entries: [
    { kind: 'random', chance: 1, minQuality: 'purple', slots: ['ring', 'trinket', 'neck', 'back'] },
    { kind: 'random', chance: 0.2, minQuality: 'orange' },
  ], stacks: [{ id: 'mat_shard', chance: 1, min: 1, max: 1 }] },
  ...WILD_LOOT,
  ...RAID_LOOT,
  ...WB_LOOT,   // v0.9.3d 世界首领（只在该首领掉）
};

// ---------------- v0.5 A：副本难度的掉落钩子 ----------------
// 「特殊属性」：史诗 / 噩梦难度的装备有几率多一条 ✦ 词条（数值 ×1.6，见 core/Loot.ts addSpecial）
const ARMOR_ALL: ItemSlot[] = [...ARMOR, 'back'];
export const SPECIAL_AFFIXES: AffixDef[] = [
  { id: 'sp_dmg', kind: 'skill', text: '所有技能伤害 +{v}%', slots: ALL, weight: 10, stat: 'damage', op: 'mul', min: 0.05, max: 0.08 },
  { id: 'sp_hp', kind: 'char', text: '生命 +{v}', slots: ALL, weight: 8, stat: 'hp', min: 40, max: 70 },
  { id: 'sp_crit', kind: 'char', text: '暴击率 +{v}%', slots: ALL, weight: 6, stat: 'crit', min: 1.5, max: 3 },
  { id: 'sp_haste', kind: 'char', text: '急速 +{v}%（攻速 / 持续伤害 / 翻滚）', slots: ALL, weight: 6, stat: 'haste', min: 1.5, max: 3 },
  { id: 'sp_armor', kind: 'char', text: '护甲 +{v}', slots: ARMOR_ALL, weight: 5, stat: 'armor', min: 20, max: 40 },
  { id: 'sp_ult', kind: 'skill', text: '大招伤害 +{v}%', slots: ALL, weight: 4, stat: 'damage', op: 'mul', min: 0.12, max: 0.2, match: { slots: ['ultimate'] } },
];

LOOT_DATA.specialAffixes = SPECIAL_AFFIXES;   // v0.5 C 暗岩锻造自选的特殊属性池（淬炼时 ✧ 行只换成另一条特殊属性）

/** 每个职业的套装部件（固定装备 id）。英雄及以上难度 Boss 额外掉落时从这里挑一件（v0.5 B：每职业 5 件；曦誓者后续开放，没有部件） */
export const SET_PIECES: Record<string, string[]> = Object.fromEntries(Object.values(SETS).map(s => [s.cls, s.pieces]));
/** 套装部件掉落钩子：按职业挑一件；给了 pity 就按保底规则偏向缺的部件（见 core/Sets.ts）；没有套装返回 null */
export function dropSetPiece(gen: LootGenerator, classId: string, ilvl: number, rng: () => number = Math.random, pity?: SetPityState): ItemInstance | null {
  const pool = classSet(classId)?.pieces ?? [];
  if (!pool.length) return null;
  const id = pity ? rollSetPiece(pool, 1, pity, rng).piece : pool[Math.floor(rng() * pool.length)];
  return id ? gen.generateFixed(id, ilvl) : null;
}
// v0.6.2：野外首领加特效件 + 首领之证；副本首领加英雄徽记；长副本首领加王座之心（部位强化突破材料）
for (const k of ['elite_field', 'elite_redsand', 'elite_frost', 'elite_ember', 'elite_ember2']) {
  const t = LOOT_TABLES[k], add = eliteEntries(k);
  LOOT_TABLES[k] = { ...t, entries: [...t.entries, ...add.entries], stacks: [...(t.stacks ?? []), ...add.stacks] };
}
const addStack = (k: string, id: string, min: number, max: number) => { const t = LOOT_TABLES[k]; if (t) LOOT_TABLES[k] = { ...t, stacks: [...(t.stacks ?? []), { id, chance: 1, min, max }] }; };
addStack('boss_grok', 'mat_badge', 1, 1); addStack('boss_rotroot', 'mat_badge', 1, 2);
addStack('raid_boss', 'mat_heart', 1, 1); addStack('raid_final', 'mat_heart', 1, 2);
addStack('raid_boss', 'mat_darkshard', 1, 2); addStack('raid_final', 'mat_darkshard', 3, 4);
// v0.9.3h 副本专属掉落：每个首领独立表（30 级副本 / 长副本），矿洞 / 腐沼首领追加专属件
Object.assign(LOOT_TABLES, DL_TABLES);
Object.assign(LOOT_TABLES, ENDGAME_GUIDE_TABLES);   // v0.9.6a 说明书展示表
for (const d of ['molten_throne', 'frost_crypt']) for (let i = 0; i < 5; i++) { const k = `dl_${d}_${i}`, f = i === 4; addStack(k, 'mat_heart', 1, f ? 2 : 1); addStack(k, 'mat_darkshard', f ? 3 : 1, f ? 4 : 2); }
LOOT_TABLES.boss_grok = { ...LOOT_TABLES.boss_grok, entries: [...LOOT_TABLES.boss_grok.entries, ...dlEntries('darkrock_mine', 1, true)] };
// v0.9.3j 矿道工头（前置首领）：保底精良 + 专属 3 件
LOOT_TABLES.boss_foreman = { id: 'boss_foreman', gold: [30, 50], entries: [{ kind: 'random', chance: 1, minQuality: 'blue' }, ...dlEntries('darkrock_mine', 0, false)], stacks: [{ id: 'mat_dust', chance: 1, min: 1, max: 2 }] };
LOOT_TABLES.boss_rotroot = { ...LOOT_TABLES.boss_rotroot, entries: [...LOOT_TABLES.boss_rotroot.entries, ...dlEntries('rotting_temple', 0, true)] };
