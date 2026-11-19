import { packModels } from '../core/ContentPacks';   // v1.0.4
// 怪物种类表：数值、模型、AI 配置（营地 / 原野 / 副本 / 阶段四新地图）
// 从 main.ts 拆出（tools/split-main.cjs）：引用 main 的状态都走上下文 C（惰性 getter），在 main 原位置调用 bindEnemyTypes(C) 初始化
import * as THREE from 'three';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Faction, Pos, unitsInRadius } from '../core/Combat';
import { EnemyBrain, AIIntent } from '../core/EnemyBrain';
import { BossBrain, BossIntent, BossDef } from '../core/BossBrain';
import { DungeonRun, DungeonDef } from '../core/Dungeon';
import { Loadout } from '../core/Loadout';
import { LootGenerator, ItemInstance, QUALITY_COLOR, QUALITY_NAME, QUALITIES, BONUS_STATS, BonusStat, bonusText, WEAPON_TYPE_NAME, ARMOR_TYPE_NAME } from '../core/Loot';
import { Inventory, EQUIP_SLOTS, SLOT_NAME, EQUIP_SLOT_NAME, EquipSlot, CharStats } from '../core/Inventory';
import { TalentTree, Progression, TalentNodeDef, MAX_LEVEL } from '../core/TalentTree';
import { QuestLog, QuestDef } from '../core/Quest';
import { SaveManager, GameSave, LoadStatus } from '../core/SaveManager';
import { Roster, CharMeta, randomName, nameError, exportFileName, MAX_SLOTS } from '../core/Roster';
import { BrowserStorage, downloadText, pickTextFile } from './save';
import { GAME_VERSION, CHANGELOG } from './version';
import { Preview } from './preview';
import { GUIDE_SOURCES, guideItems, allCollectibles, collected, RATE_NAME, GuideItem } from './dropguide';
import { Forge, Shop, upgradedName } from '../core/Forge';
import { SlotId, SLOT_IDS, ResolvedSkill, Element, ModifierDef, EffectDef } from '../core/types';
import { SET_BONUSES } from '../data/warrior';
import { LOOT_DATA, LOOT_TABLES } from '../data/loot';
import { CLASSES, ClassDef, ClassId } from '../data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from '../data/dungeon_darkrock';
import { DodgeRoll } from '../core/Dodge';
import { HitFeel, FeelEvent } from '../core/HitFeel';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from '../data/dungeon_swamp';
import { QUESTS, NPCS } from '../data/quests';
import { FORGE_DATA } from '../data/shop';
import * as M from './models';
import { makeChiyi, makeSakar, makeSandWormling } from './creatures';
import { makeGlbCreature, creatureReady } from './creatures_glb';
import type { RigTpl } from './procrig';
import * as G from './gfx';
import { GameAudio, Theme } from './audio';
import { loadCharacters, AnimName } from './chars';
import { applyGear, updateGear, gearSummary, gearDebug } from './gear';
import { skillIcon, itemIcon, talentIcon, stackIcon, uiIcon, installArt } from './icons';
import { updateWater } from './textures';
import { NavGrid, Circle, Pos2 } from '../core/NavGrid';
import { AutoPath, AUTOPATH_STOP_TEXT } from '../core/AutoPath';
import { questTarget, nextHop, trackedList, GuideTarget, MapLink } from '../core/QuestGuide';
import { objectiveMax } from '../core/Quest';
import { EnemyBrain as Brain } from '../core/EnemyBrain';
import { MAPS, MAP_LINKS, NPC_HOME, AREAS, MapId, locateObjective, FIELD_GATE, MAP_ORIGIN, FIELD_EAST_GATE } from '../data/world_map';
import { WILD, WILD_IDS, WildId, isWildId, WildMob, WildNpc, FIELD_SERVICE_NPCS } from '../data/zones_wild';
import { buildWild, updateWild, WildScene } from './wild';
import { buildScenes } from './scenes';
import { FIELD_ORIGIN, FIELD_SPOTS, FIELD_NPCS, FIELD_PACKS, FIELD_MOBS, FIELD_BOUNDS, FIELD_PATHS, CHIEF_ROUTE, CHIEF_RESPAWN, RARE_SPOTS, RARE_RESPAWN,
  fieldProps, fieldObstacles, fieldSolid, fieldPathDist, riverZ, RIVER_HALF, BRIDGE, FORD } from '../data/zone_field';
import type { Ctx } from './main';

let CX!: Ctx;

export interface EnemyType {
  name: string; hp: number; dmg: number; interval: number; speed: number; aggro: number; range: number; xp: number; ilvl: number; model: () => M.Rig;
  ranged?: boolean;                           // 远程：发射毒弹，命中才结算
  onHitDot?: { dps: number; duration: number };   // 近战命中附加中毒（原野精英是流血）
  patrol?: number;
  level?: number;                             // 头像框显示的等级
  elite?: boolean; rare?: boolean;
  mini?: boolean;                             // v0.9.3d 刷怪点小精英（名牌带「小精英」，不算野外首领）
  leash?: number;
  shot?: { color: number; el: Element };      // 远程弹体颜色/元素（默认毒弹）
}

export const fieldType = (k: keyof typeof FIELD_MOBS, model: () => M.Rig, shot?: EnemyType['shot']): EnemyType => {
  const d = FIELD_MOBS[k], c = d.config;
  return { name: d.name, hp: d.hp, dmg: c.attackDamage, interval: c.attackInterval, speed: c.moveSpeed, aggro: c.aggroRange, range: c.attackRange, xp: d.xp, ilvl: d.ilvl, model,
    ranged: d.ranged, onHitDot: d.onHitDot, patrol: c.patrolRadius, level: d.level, elite: d.elite, rare: d.rare, leash: c.leashRange, shot };
};

export const swampType = (k: keyof typeof SWAMP_MOBS, model: () => M.Rig): EnemyType => {
  const d = SWAMP_MOBS[k], c = d.config;
  return { name: d.name, hp: d.hp, dmg: c.attackDamage, interval: c.attackInterval, speed: c.moveSpeed, aggro: c.aggroRange, range: c.attackRange, xp: d.xp, ilvl: d.ilvl, model, ranged: d.ranged, onHitDot: d.onHitDot, patrol: c.patrolRadius };
};

export const ENEMY_TYPES: Record<string, EnemyType> = {
  wolf: { name: '灰鬃狼', hp: 120, dmg: 10, interval: 1.4, speed: 4.6, aggro: 9, range: 1.9, xp: 30, ilvl: 4, model: M.makeWolf, patrol: 6 },
  // 矿洞小怪数值在 data/dungeon_darkrock.ts（和命令行模拟共用；第七版平衡）
  miner: { name: DARKROCK_MOBS.miner.name, hp: DARKROCK_MOBS.miner.hp, dmg: DARKROCK_MOBS.miner.config.attackDamage, interval: DARKROCK_MOBS.miner.config.attackInterval, speed: DARKROCK_MOBS.miner.config.moveSpeed, aggro: DARKROCK_MOBS.miner.config.aggroRange, range: DARKROCK_MOBS.miner.config.attackRange, xp: DARKROCK_MOBS.miner.xp, ilvl: DARKROCK_MOBS.miner.ilvl, model: M.makeMiner },
  // v0.9.3j 暗岩矿洞前置首领：塌方隧道里的矿道工头（精英，用矿工模型放大）
  mine_foreman: { name: '矿道工头 · 巴克', hp: 760, dmg: 24, interval: 1.9, speed: 3.3, aggro: 10, range: 2.4, xp: 160, ilvl: 10, elite: true, model: () => { const r = M.makeMiner(); r.root.scale.multiplyScalar(1.45); r.scale *= 1.45; r.flash.forEach(m => m.color.lerp(new THREE.Color(0xc08030), 0.35)); return r; } },
  spider: { name: DARKROCK_MOBS.spider.name, hp: DARKROCK_MOBS.spider.hp, dmg: DARKROCK_MOBS.spider.config.attackDamage, interval: DARKROCK_MOBS.spider.config.attackInterval, speed: DARKROCK_MOBS.spider.config.moveSpeed, aggro: DARKROCK_MOBS.spider.config.aggroRange, range: DARKROCK_MOBS.spider.config.attackRange, xp: DARKROCK_MOBS.spider.xp, ilvl: DARKROCK_MOBS.spider.ilvl, model: M.makeSpider },
  toad: swampType('toad', M.makeToad),
  treant: swampType('treant', M.makeTreant),
  cultist: swampType('cultist', M.makeCultist),
  vine: swampType('vine', M.makeVine),
  // 翠风原野
  boar: fieldType('boar', () => M.makeBoar(false)),
  raider: fieldType('raider', M.makeRaider),
  archer: fieldType('archer', M.makeArcher, { color: 0xffe0a0, el: 'physical' }),
  golem: fieldType('golem', M.makeGolem),
  chief: fieldType('chief', M.makeChief),
  goldboar: fieldType('goldboar', () => M.makeBoar(true)),
  // 新手引导：营地里的训练假人（打不死、不还手）
  dummy: { name: '训练假人', hp: 100000, dmg: 0, interval: 99, speed: 0, aggro: 0, range: 0, xp: 0, ilvl: 1, model: M.makeDummy, level: 1, patrol: 0 },
};

// 阶段四：新地图的怪物（数据在 data/zones_wild.ts）——复用已有模型，染色 / 缩放 / 自发光区分
export const WILD_MODELS: Record<string, () => M.Rig> = {
  wolf: M.makeWolf, spider: M.makeSpider, raider: M.makeRaider, archer: M.makeArcher, golem: M.makeGolem, chief: M.makeChief,
  toad: M.makeToad, cultist: M.makeCultist, miner: M.makeMiner, treant: M.makeTreant, boar: () => M.makeBoar(false), worm: makeSakar, dragon: () => makeChiyi(M.makeGolem), wormling: makeSandWormling, brute: () => { const r = M.makeBoss(); r.root.scale.setScalar(1); r.scale = 1; return r; },
};

// v1.0.4 内容包的新怪物模型（本体同名优先）
for (const [k, f] of Object.entries(packModels())) if (!(k in WILD_MODELS)) WILD_MODELS[k] = f as () => M.Rig;

/** v1.2.26 比赛版 Lux3D 写实怪（长副本 / 深渊，assets_aholo/creatures/*.glb；商用包没有 → 照旧用通用模型染色）。按显示名查：名字 → [模型, 身高, 自发光色] */
type LuxMob = [string, number, number?, number?];   // [模型, 身高, 自发光色, yaw（侧身生成的模型转正）]
export const LUX_MOBS: Record<string, LuxMob> = {
  '熔铸者 戈拉克': ['raid_gorak', 3.6, 0xff5010], '焰灵 伊格': ['raid_twin', 3.0, 0xff6020], '焰灵 妮丝': ['raid_twin', 3.0, 0xffa030], '双生焰灵 伊格与妮丝': ['raid_twin', 3.0, 0xff6020],
  '岩鳞巨蜥 萨穆尔': ['raid_samur', 2.6, 0xff4010], '炎誓大祭司 卡萨': ['raid_priest', 3.0, 0xff5010], '熔心君王 瓦尔卡兹': ['raid_valkaz', 4.0, 0xff5010],
  '熔铸盾卫': ['mt_guard', 2.6, 0xff5010], '熔渣自爆者': ['mt_bomber', 1.6, 0xff6020], '炎誓治疗祭司': ['mt_healer', 2.2, 0xff6020], '熔火图腾': ['mt_totem', 2.2, 0xff5010],
  '黑曜狂兽': ['mt_berserk', 1.8, 0xff4010], '熔渣': ['mt_slag', 0.9, 0xff6020], '献祭者': ['mt_offering', 1.9],
  // v1.2.28 永霜墓穴（5 首领 + 6 小怪；亡誓骑士团三人共用一个模型）
  '墓穴守门人 莫戈斯': ['fr_keeper', 3.4, 0x3a8ad0], '霜语女巫 维瑟拉': ['fr_vesra', 3.0, 0x4aa0ff], '骨龙幼体 寒脊': ['fr_wyrm', 3.0, 0x3a8ad0], '亡誓骑士团': ['fr_knight', 2.7, 0x2a6ad0], '永冬之王 伊瑟兰': ['fr_ithran', 4.0, 0x4aa0ff],
  // v1.2.29 深渊·沙葬王陵（4 首领 + 7 小怪）/ 巨魔冰窟（4 首领，双子共用 + 5 小怪）
  '蝎后 卡瑟拉': ['dt_kasra', 2.2, 0xffa030], '沙匪头目 拉希德': ['dt_rashid', 2.8], '沙葬法老 塞特赫': ['dt_setekh', 3.2, 0xffc040], '无名守陵人': ['dt_warden', 3.6, 0xffb040],
  '王陵石卫': ['dt_guard', 2.6, 0xffa030], '爆裂圣甲虫': ['dt_scarab', 1.0, 0x40ff80], '沙葬祭司': ['dt_priest', 2.2, 0xffc040], '胡狼守卫': ['dt_jackal', 2.3, 0xffa030],
  '小沙蝎': ['dt_spawn', 0.6], '沙匪打手': ['dt_bandit', 2.1], '裹布木乃伊': ['dt_mummy', 2.0, 0xffc040],
  '巨魔双子 格鲁与莫格': ['ic_trolls', 3.4, 0x4aa0ff], '巨魔 格鲁': ['ic_trolls', 3.4, 0x4aa0ff], '巨魔 莫格': ['ic_trolls', 3.2, 0x3a8ad0], '冰窟萨满 乌尔嘎': ['ic_urga', 2.8, 0x4aa0ff],
  '雪原巨人 霍尔格': ['ic_holger', 4.0, 0x4aa0ff], '冰窟之心': ['ic_heart', 3.6, 0x6ab8ff],
  '冰甲巨魔': ['ic_guard', 2.8, 0x3a8ad0], '冰囊爆裂者': ['ic_bomber', 1.4, 0x4aa0ff], '巨魔巫医': ['ic_healer', 2.4, 0x3a8ad0], '霜火图腾': ['ic_totem', 2.0, 0x4aa0ff], '雪原座狼': ['ic_wolf', 1.8, 0x3a8ad0],
  // v1.2.29 深渊·灰烬铸造厂（4 首领 + 7 小怪）+ 终章 暗岩之魂
  '铸造监工 葛伦': ['fd_overseer', 3.0, 0xff6020], '锻炉傀儡': ['fd_golem', 3.6, 0xff5010], '熔铸大师 维克多': ['fd_master', 3.0, 0xff6020], '未竟之作 · 无名铸像': ['fd_statue', 3.6, 0xffa040],
  '铁甲铸卫': ['fd_guard', 2.6, 0xff5010], '熔渣罐': ['fd_bomber', 1.4, 0xff6020], '炉火司祭': ['fd_healer', 2.2, 0xff6020], '鼓风炉': ['fd_totem', 2.0, 0xff5010],
  '熔铁猎犬': ['fd_hound', 1.6, 0xff5010], '铸工': ['fd_worker', 2.0], '半成品傀儡': ['fd_mini', 1.6, 0xff5010], '暗岩之魂': ['ab_darksoul', 4.4, 0xffb040],
  // v1.2.32 本体野外怪（比赛版）：新模型 wd_* + 复用副本模型
  '山麓灰狼': ['wd_wolf', 1.2, 0, Math.PI / 2], '碎石蜘蛛': ['wd_spider', 0.9], '穴居蜘蛛': ['wd_spider', 0.9], '发狂矿工': ['wd_miner', 1.9], '被控制的矿工': ['wd_miner', 1.9],
  '毒沼蟾蜍': ['wd_toad', 1.0], '腐根树精': ['wd_treant', 2.8], '苔痕树人': ['wd_treant', 2.8], '沼泽信徒': ['wd_cultist', 2.0],
  '星斑狼': ['wd_starwolf', 1.4, 0x6080ff], '陨晶甲虫': ['wd_beetle', 1.1, 0x9a6aff], '观星邪教徒': ['wd_starcult', 2.0, 0x8070ff], '陨石傀儡': ['wd_metgolem', 2.6, 0x8040ff],
  '沙匪': ['dt_bandit', 2.0], '沙匪弩手': ['wd_archer', 2.0], '赤砂巨蝎': ['dt_spawn', 1.2],
  '霜鬃狼': ['ic_wolf', 1.6], '霜牙 · 狼王': ['ic_wolf', 2.7], '冰晶元素': ['wd_iceelem', 2.4, 0x60c8ff], '冰原巨魔': ['ic_trolls', 3.0],
  '余烬猎犬': ['fd_hound', 1.5, 0xff5010], '焦骨战士': ['wd_skeleton', 2.0, 0xff5010], '熔岩魔像': ['fd_golem', 2.8, 0xff5010], '熔核巨像 · 炽心': ['fd_golem', 4.5, 0xff5010], '黑曜蛮兽': ['wd_brute', 2.8, 0xff3010],
  // v1.2.33 野外精英 / 稀有 / 剩余小怪（比赛版）
  '坠星者 · 欧兰': ['wd_falling', 2.6, 0x9060ff], '星辉麋鹿 · 稀有': ['wd_elk', 2.6, 0xb090ff], '沙暴之主 · 卡鲁': ['wd_sandlord', 2.5], '火晶精怪': ['wd_firesprite', 1.0, 0xff6020],
  '琥珀蝎王 · 稀有': ['dt_kasra', 1.8, 0xffa030], '黑曜蝎王 · 稀有': ['dt_kasra', 2.0, 0xff3060], '白鬃巨猪 · 稀有': ['wd_boar', 2.0, 0, Math.PI / 4], '霜誓教徒': ['wd_frostcult', 2.0, 0x60c0ff],
  '灰烬教徒': ['wd_ashcult', 2.0, 0xff5010], '熔岩幼体': ['wd_lavapup', 1.0, 0xff5010], '灰烬祭司长 · 赛勒': ['wd_ashpriest', 2.8, 0xff5010], '赤岩傀儡': ['wd_redgolem', 2.6, 0xff6020],
  // v1.2.34 翠风原野 / 沼泽 / 矿洞（新手区）+ 世界首领（比赛版）
  '灰鬃狼': ['wd_wolf', 1.1, 0, Math.PI / 2], '矿道工头 · 巴克': ['wd_miner', 2.4], '腐沼巨蟾': ['wd_toad', 1.3], '腐根树妖': ['wd_treant', 2.6], '沼泽祭徒': ['wd_cultist', 2.0, 0x40c060],
  '鬃背野猪': ['wd_boar', 1.3, 0, Math.PI / 4], '荒原劫掠者': ['dt_bandit', 2.0], '劫掠弩手': ['wd_archer', 2.0], '遗迹石傀儡': ['wd_ruingolem', 2.6, 0x4080ff], '赤鬃 · 劫掠头目': ['wd_redmane', 2.5],
  '遗迹古树魔像 · 苔石': ['wd_mossgolem', 4.2, 0x40ff60], '霜巨人萨满 · 尤尔格': ['wd_yurg', 4.0, 0x60c0ff],
  '冰誓盾卫': ['fc_guard', 2.6, 0x2a6ad0], '冰尸自爆者': ['fc_bomber', 1.8, 0x4aa0ff], '霜语祭司': ['fc_healer', 2.2, 0x3a8ad0], '寒冰图腾': ['fc_totem', 2.2, 0x4aa0ff], '霜鬃狂兽': ['fc_berserk', 1.8, 0x3a8ad0], '冰柱囚笼': ['fc_prison', 2.2, 0x6ab8ff],
};
// 11-18 Rhett「老地图的怪要会走路、拳头 / 法术攻击」：本体野外人形怪接程序化绑骨（procrig.ts，低画质不绑；?off=wildrig 回静态）
//   H 人形（傀儡 / 矿工 / 沙匪 / 弩手 / 树人 / 骷髅 / 巨魔 / 蛮兽），H袍 长袍（各类教徒 / 祭司）。
// 11-19 Rhett 03:15「加一套四足绑骨」：四足 / 蟾蜍 / 多足 / 漂浮元素也接（Q4 / Q蟾 / Q多足 / F，程序化绑骨，非精绑）；?off=quadrig 只关这批，?off=wildrig 仍关全部
//   没接：坠星者 · 欧兰（长袍人形施法者，不在本批）、熔核巨像 · 炽心 / 霜巨人萨满 · 尤尔格 / 遗迹古树魔像 · 苔石（人形首领）、冰誓盾卫 / 冰尸自爆者 / 霜语祭司（人形）、
//   寒冰图腾 / 冰柱囚笼（静物）、火晶精怪（蹲伏小人形、脚着地，不是漂浮也不是四足，形态不明确先不接）
const WILD_RIG_OFF = (() => { try { return /(?:[?&]off=[^&]*\bwildrig\b)/.test(location.search); } catch { return false; } })();
const QUAD_RIG_OFF = (() => { try { return /(?:[?&]off=[^&]*\bquadrig\b)/.test(location.search); } catch { return false; } })();
const QUAD_RIG: Record<string, RigTpl> = {
  '山麓灰狼': 'Q4', '灰鬃狼': 'Q4', '星斑狼': 'Q4', '霜鬃狼': 'Q4', '霜牙 · 狼王': 'Q4', '余烬猎犬': 'Q4', '霜鬃狂兽': 'Q4',
  '鬃背野猪': 'Q4', '白鬃巨猪 · 稀有': 'Q4', '星辉麋鹿 · 稀有': 'Q4', '熔岩幼体': 'Q4',
  '毒沼蟾蜍': 'Q蟾', '腐沼巨蟾': 'Q蟾',
  '碎石蜘蛛': 'Q多足', '穴居蜘蛛': 'Q多足', '陨晶甲虫': 'Q多足', '赤砂巨蝎': 'Q多足', '琥珀蝎王 · 稀有': 'Q多足', '黑曜蝎王 · 稀有': 'Q多足',
  '冰晶元素': 'F',   // 下半身是旋转冰片、悬空 → 漂浮幽魂模板
};
/** 绑骨时的朝向补正（只作用于绑骨路径，静态路径仍按 LUX_MOBS 的 yaw）：离线三视图量出 wd_wolf 按 π/2 后身体斜 45°、wd_boar 按 π/4 后头朝 +X、wd_toad 头朝 +X；
 *  骨架按「头朝 +Z」生成，所以绑骨前补正到头朝 +Z（dev/quadrig_shot.mjs --static 1 可复查） */
const QUAD_YAW_FIX: Record<string, number> = { wd_wolf: -Math.PI / 4, wd_boar: -Math.PI / 2, wd_toad: -Math.PI / 2 };
const WILD_RIG: Record<string, RigTpl> = {
  '赤岩傀儡': 'H', '陨石傀儡': 'H', '遗迹石傀儡': 'H', '发狂矿工': 'H', '被控制的矿工': 'H', '矿道工头 · 巴克': 'H',
  '沙匪': 'H', '荒原劫掠者': 'H', '沙匪弩手': 'H', '劫掠弩手': 'H', '腐根树精': 'H', '苔痕树人': 'H', '腐根树妖': 'H',
  '焦骨战士': 'H', '冰原巨魔': 'H', '黑曜蛮兽': 'H', '熔岩魔像': 'H', '赤鬃 · 劫掠头目': 'H', '沙暴之主 · 卡鲁': 'H',
  '沼泽信徒': 'H袍', '沼泽祭徒': 'H袍', '观星邪教徒': 'H袍', '霜誓教徒': 'H袍', '灰烬教徒': 'H袍', '灰烬祭司长 · 赛勒': 'H袍',
};
function luxMob(d: WildMob): M.Rig | null {
  const L = LUX_MOBS[(d as { name?: string }).name ?? '']; if (!L || !creatureReady(L[0])) return null;
  const nm = (d as { name?: string }).name ?? '';
  const rt = WILD_RIG_OFF ? undefined : WILD_RIG[nm] ?? (QUAD_RIG_OFF ? undefined : QUAD_RIG[nm]);
  // 朝向补正只给绑骨路径（低画质 makeGlbCreature 不绑骨 → 仍用原 yaw，和 ?off=quadrig 一致）
  const yaw = rt && QUAD_RIG[nm] === rt && G.curQuality !== 'low' ? (L[3] ?? 0) + (QUAD_YAW_FIX[L[0]] ?? 0) : L[3];
  const r = makeGlbCreature(L[0], { height: L[1], yaw, wave: 0, bob: 0.01, rig: rt, pbr: { roughness: 0.6, metalness: 0.2, emissive: L[2] ?? 0, emissiveK: L[2] ? 0.35 : 0 } }) as unknown as M.Rig | null;
  if (r) r.root.userData.lux = true; return r;
}
// v1.2.34 新手区直接写模型函数的 ENEMY_TYPES 也按名字换 Lux（金鬃 = 稀有野猪，没有单独名字 → 按 key）
for (const [k, t] of Object.entries(ENEMY_TYPES)) {
  const nm = k === 'goldboar' ? '鬃背野猪' : t.name; if (!LUX_MOBS[nm]) continue;
  const m0 = t.model; t.model = () => luxMob({ name: nm } as unknown as WildMob) ?? m0();
}
export const wildModel = (d: WildMob) => () => {
  const lx = luxMob(d); if (lx) return lx;
  const r = (WILD_MODELS[d.model] ?? M.makeGolem)();
  if (d.tint !== undefined) r.flash.forEach(m => m.color.lerp(new THREE.Color(d.tint!), d.tintK ?? 0.4));
  if (d.glow) r.flash.forEach(m => { m.emissive.setHex(d.glow!); m.userData.baseEmissive = d.glow; });
  if (d.scale) { r.root.scale.multiplyScalar(d.scale); r.scale *= d.scale; }
  return r;
};

/** v0.9.3c 外环怪：同一种怪 +1 / +2 级（生命 +12% / 级、伤害 +8% / 级、经验 +10% / 级、装等 +1 / 级），按 kind 缓存 */
const lvCache = new Map<string, EnemyType>();
export function leveledType(k: string, o = 0): EnemyType {
  const t = ENEMY_TYPES[k]; if (!o || !t) return t;
  const key = k + '+' + o; let v = lvCache.get(key);
  if (!v) { v = { ...t, level: (t.level ?? 0) + o, hp: Math.round(t.hp * (1 + 0.12 * o)), dmg: Math.round(t.dmg * (1 + 0.08 * o)), xp: Math.round(t.xp * (1 + 0.1 * o)), ilvl: t.ilvl + o }; lvCache.set(key, v); }
  return v;
}
/** v0.9.3d 刷怪点小精英：同一种怪 生命 ×3、伤害 ×1.4、体型 ×1.3、经验 ×3、装等 +2；kind 不变（任务照常计数），不算野外首领 */
const miniCache = new Map<string, EnemyType>();
export function miniEliteType(k: string, o = 0): EnemyType {
  const key = k + '+' + o; let v = miniCache.get(key);
  if (!v) {
    const t = leveledType(k, o), m0 = t.model;
    v = { ...t, name: `${t.name}（强壮）`, mini: true, hp: Math.round(t.hp * 3), dmg: Math.round(t.dmg * 1.4), xp: t.xp * 3, ilvl: t.ilvl + 2,
      model: () => { const r = m0(); r.root.scale.multiplyScalar(1.3); r.scale *= 1.3; return r; } };
    miniCache.set(key, v);
  }
  return v;
}
export const enemyConfig = (t: EnemyType) => ({ aggroRange: t.aggro, attackRange: t.range, attackDamage: t.dmg, attackInterval: t.interval, moveSpeed: t.speed, leashRange: t.speed === 0 ? 99 : t.leash ?? 30, patrolRadius: t.patrol ?? 2 });

/** 绑定上下文并执行这一段原来的顶层初始化（变量初值、事件绑定），顺序和拆分前一致 */
export function bindEnemyTypes(__ctx: Ctx) {
  CX = __ctx;
for (const id of WILD_IDS) for (const [k, d] of Object.entries(WILD[id].mobs)) {
    ENEMY_TYPES[k] = { name: d.name, hp: d.hp, dmg: d.dmg, interval: d.interval, speed: d.speed, aggro: d.aggro, range: d.range, xp: d.xp, ilvl: d.ilvl, model: wildModel(d),
      ranged: d.ranged, onHitDot: d.onHitDot, patrol: d.patrol, level: d.level, elite: d.elite, rare: d.rare, leash: d.leash, shot: d.shot as EnemyType['shot'] };
  }
}
