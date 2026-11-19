import { withPacks } from '../core/ContentPacks';
// ======================================================================
// 阶段四：三张新野外地图（原创内容），数据驱动 —— 场景、寻路、怪物、营地、NPC、任务、掉落都从这里来
//   赤砂裂谷 20~23 · 霜脊高地 22~25 · 烬落荒原 25~30（满级大地图：3 个营地、20+ 任务、悬赏、世界事件、两个长副本入口）
// 坐标：世界坐标 = 区域原点 + 局部坐标；局部 x 向东、z 向南（北 = -z）。可走范围 ±half，边缘是山崖
// 新地图只要在 WILD 里加一项：场景由 web/wild.ts 按 palette / scatter 生成，任务和掉落自动接入
// ======================================================================
import { QuestDef } from '../core/Quest';
import { LootTable } from '../core/Loot';
import type { Rise } from '../core/Terrain';
import { WORLD_BOSSES, WB_IDS } from './world_bosses';

export type WildId = 'star' | 'redsand' | 'frost' | 'ember' | 'foothill' | 'marsh';
export const WILD_IDS: WildId[] = ['star', 'redsand', 'frost', 'ember', 'foothill', 'marsh'];   // v0.9.2b 副本区：暗岩山麓 / 腐沼湿地
/** v0.9.2b 副本区（小区域：只有副本门口、传送阵、补给商和少量怪；不做瞭望塔 / 宝箱 / 动态事件 / 声望） */
export const HUB_IDS: WildId[] = ['foothill', 'marsh'];
export const isHub = (id: string) => (HUB_IDS as string[]).includes(id);
/** 完整野外图（不含副本区） */
export const FULL_WILD_IDS: WildId[] = ['star', 'redsand', 'frost', 'ember'];   // v0.9.3e 星落高原（16~20，翠风与赤砂之间）

/** 怪物：model = 用哪个基础模型（web/wild.ts 里对应），tint 染色、scale 缩放、glow 自发光 */
export interface WildMob {
  name: string; level: number; hp: number; dmg: number; interval: number; speed: number; aggro: number; range: number;
  xp: number; ilvl: number; loot: string; model: string; tint?: number; tintK?: number; scale?: number; glow?: number;
  ranged?: boolean; shot?: { color: number; el: 'fire' | 'frost' | 'nature' | 'physical' | 'shadow' | 'arcane' };
  elite?: boolean; rare?: boolean; onHitDot?: { dps: number; duration: number }; leash?: number; patrol?: number;
}
export interface WildNpc { id: string; name: string; title: string; role: NpcRole; x: number; z: number; yaw: number; model: string; tint?: number; tintK?: number; idle: string; }
/** 功能 NPC：quest 任务；supply 补给商（药水/材料/出售）；smith 铁匠（强化/分解）；bank 仓库；bounty 悬赏板；exchange 兑换（阶段五）；mentor 精英等级导师（阶段六）；scholar 副本学者 */
export type NpcRole = 'quest' | 'supply' | 'smith' | 'bank' | 'bounty' | 'exchange' | 'mentor' | 'scholar';
export interface WildCamp { id: string; name: string; x: number; z: number; r: number; main?: boolean; waypoint: { x: number; z: number }; }
export interface WildGate { to: string; x: number; z: number; name: string; arrive: { x: number; z: number }; }
export interface WildSpot { x: number; z: number; r: number; name: string; }
/** 怪群：respawn 秒；v0.9.3c 起：hot = 刷怪点（25 秒、不等玩家走开）、lv = 离营地远近的等级加成（+0 / +1 / +2）、gen = 程序生成的 */
export interface WildPack { kinds: string[]; x: number; z: number; respawn?: number; hot?: boolean; lv?: number; gen?: boolean; }
/** 普通群是否用「走开 30 米才刷」：只有外环新生成的（老任务区不动） */
export const awayRule = (p: WildPack) => !!p.gen && !p.hot;
export interface WildEvent { id: string; name: string; spot: string; every: number; duration: number; waves: string[][]; boss?: string; reward: { gold: number; xp: number; minQuality: 'blue' | 'purple' }; }

export interface WildPalette {
  sky: number; fog: number; fogNear: number; fogFar: number; hemi: number; ground: number; hemiI: number; sun: number; sunColor: number;
  /** 地形顶点色（两种混合）+ 路面/崖壁色；贴图层 0/1/2 = 主地面 / 路 / 崖 */
  tA: number; tB: number; path: number; cliff: number; tex: [string, string, string];
  /** 小地图底色 */
  map: [string, string];
  /** 草 / 地面散点颜色（0 = 不长草） */
  grass: number;
  /** 地面发光裂纹（熔岩） */
  cracks?: number;
  /** 空中飘的粒子：雪花 / 灰烬 / 沙尘 */
  weather?: 'snow' | 'ash' | 'dust';
  music: 'field' | 'redsand' | 'frost' | 'ember' | 'tide' | 'bell';   // v1.2.9 tide 海潮 / bell 钟楼（给内容包区域用）
  /** 11-17 夜间光照（web/daynight.ts）：hemiK = 深夜半球光占白天的比例（缺省 0.58）；hemiC = 夜里半球光偏向的颜色（缺省冷蓝 0x7088c8）；
   *  groundC = 夜里半球光地面反光色；fogC / fogK = 夜里雾色再偏向的颜色和比例 */
  night?: { hemiK: number; hemiC: number; groundC?: number; fogC?: number; fogK?: number };
}
/** 散布物件：kind 由 web/wild.ts 解释；n = 数量；r = 碰撞半径；s = 缩放范围 */
export interface Scatter { kind: string; n: number; r: number; s: [number, number]; color?: number; edge?: boolean; }

export interface WildDef {
  id: WildId; name: string; levels: [number, number]; minLevel: number; desc: string;
  origin: { x: number; z: number }; half: number;
  /** v0.9.3c 扩建前的范围（老内容都在这里面；外环由 layoutWild 生成怪群和环路） */
  inner?: number;
  palette: WildPalette;
  scatter: Scatter[];
  camps: WildCamp[];
  gates: WildGate[];
  spots: Record<string, WildSpot>;
  /** 土路（局部坐标折线） */
  paths: [number, number][][];
  /** 固定装饰：kind + 局部坐标（帐篷、篝火、塔、祭坛、副本门…） */
  decor: { kind: string; x: number; z: number; ry?: number; s?: number; r?: number; v?: number }[];
  npcs: WildNpc[];
  mobs: Record<string, WildMob>;
  packs: WildPack[];
  /** v0.9.3a 地形起伏：山丘（缓坡可走）/ 台地（陡崖 + 坡道） */
  rises?: Rise[];
  elite?: { kind: string; route: [number, number][]; respawn: number };
  rare?: { kind: string; spots: [number, number][]; respawn: number };
  events?: WildEvent[];
  /** 长副本入口（阶段六开放） */
  dungeonGates?: { id: string; name: string; x: number; z: number; opens: string; desc: string }[];
  /** v1.0.2 内容包野外：世界地图 / 沙盘上的名牌位置（底图 0–1 坐标）和沙盘地形标签；本体区域不填（用 shopmap 的固定表） */
  worldNode?: { x: number; y: number };
  sandIcon?: string;
  /** v1.2.5 内容包野外：世界地图 / 沙盘 / 传送阵上的醒目标记（返回文字 = 显示，null = 不显示；如「新区域」「首领出现」） */
  mapBadge?: () => string | null;
  /** v1.2.39b 内容包野外：区域地图上额外的首领标记（局部坐标；如还没解锁的首领「敲响抉择之钟后出现」） */
  mapBosses?: () => { name: string; x: number; z: number; level: number; state: string }[];
  /** v1.0.2 内容包野外：所属包 id（mergePackWilds 自动填） */
  pack?: string;
  /** v1.0.3 内容包野外：怪物种类 → 击杀区域（spots 里的 id），并进 WILD_KILL_AREA（任务指引） */
  killArea?: Record<string, string>;
  /** v1.0.3 内容包野外：自定义造景（本体生成场景时调用一次） */
  build?: (api: import('../core/ContentPacks').WildBuildApi) => void;
  /** v1.2.50 内容包野外：地面微起伏（局部坐标，叠加在 wildGroundY 上；地形 / 高度图 / 贴地 / 寻路共用） */
  groundAdd?: (lx: number, lz: number) => number;
  /** v1.2.50 内容包野外：额外不可走地形（局部坐标；寻路格 + 碰撞推回，如深水） */
  solidAt?: (lx: number, lz: number) => boolean;
  /** v1.2.50 内容包野外：包自己铺了整片地面网格时，本体地形网格在可走范围内整体下沉多少米（避免穿插） */
  floorSink?: number;
}

const mob = (name: string, level: number, model: string, o: Partial<WildMob> & { loot: string }): WildMob => {
  // 数值按等级缩放：原野 9~16 级的怪（生命 380~720、伤害 20~36）往上延伸
  const k = 1 + (level - 16) * 0.13;
  return { name, level, model, hp: Math.round(640 * k), dmg: Math.round(34 * k), interval: 1.7, speed: 4, aggro: 9, range: 2.2, xp: level * 4, ilvl: level + 2, leash: 30, patrol: 3, ...o };
};
const R = (a: number, b: number) => [a, b] as [number, number];

// ======================================================================  v0.9.3e 星落高原 16~20（补翠风 16 → 赤砂 20 的等级断层；世界首领苔石的家）
const STAR: WildDef = {
  id: 'star', name: '星落高原', levels: [16, 20], minLevel: 15, desc: '观星营地 · 星斑草原 · 陨星坑 · 观星台遗迹 · 苔痕林',
  origin: { x: 400, z: 400 }, half: 110, inner: 70,
  palette: { sky: 0xb8c4e8, fog: 0xc4c8e4, fogNear: 40, fogFar: 150, hemi: 0xe8e4ff, ground: 0x4a5a3a, hemiI: 1.2, sun: 2.4, sunColor: 0xfff0e0,
    tA: 0x8aa868, tB: 0x6a8a58, path: 0xc8b898, cliff: 0x7a7088, tex: ['grass', 'dirt', 'rock'], map: ['#8aa070', '#6a6a88'], grass: 0x7a9a5a, music: 'field' },
  scatter: [
    { kind: 'pine', n: 90, r: 0.6, s: R(0.9, 1.5), color: 0x3a5a3a },
    { kind: 'rock', n: 40, r: 0.9, s: R(0.5, 1.5), color: 0x8a8498 },
    { kind: 'spire', n: 20, r: 0.7, s: R(0.7, 1.4), color: 0xb08aff },
    { kind: 'mesa', n: 18, r: 3.2, s: R(1, 2), color: 0x8a8098, edge: true },
  ],
  camps: [{ id: 'st_camp', name: '观星营地', x: 0, z: 52, r: 13, main: true, waypoint: { x: -8, z: 58 } }],
  gates: [
    { to: 'field', x: 0, z: 72, name: '回翠风原野的山径', arrive: { x: 0, z: 66 } },
    { to: 'redsand', x: 0, z: -74, name: '去赤砂裂谷的石阶', arrive: { x: 0, z: -66 } },
  ],
  spots: {
    star_meadow: { x: -42, z: 22, r: 16, name: '星斑草原' }, crater: { x: 38, z: 14, r: 15, name: '陨星坑' }, crater_core: { x: 38, z: 14, r: 4.5, name: '陨星核心' },
    observatory: { x: -36, z: -40, r: 13, name: '观星台遗迹' }, observatory_altar: { x: -36, z: -40, r: 4.5, name: '观星台' },
    moss_woods: { x: 40, z: -42, r: 14, name: '苔痕林' }, faller_route: { x: 0, z: -12, r: 22, name: '坠星者的游荡路线' },
  },
  paths: [[[0, 72], [0, 40], [0, 8], [0, -30], [0, -74]], [[0, 8], [-22, 18], [-42, 22]], [[0, 4], [20, 10], [38, 14]], [[0, -22], [-20, -34], [-36, -40]], [[0, -24], [22, -36], [40, -42]]],
  decor: [
    { kind: 'tent', x: -7, z: 46, v: 0x5a4a8a }, { kind: 'tent', x: 8, z: 47, v: 0x4a5a8a }, { kind: 'fire', x: 0, z: 50 }, { kind: 'tower', x: 10, z: 59 },
    { kind: 'stall', x: -6, z: 54, ry: Math.PI / 2 }, { kind: 'anvil', x: 6, z: 55 }, { kind: 'crate', x: 4, z: 58 }, { kind: 'banner', x: -3, z: 40, v: 0x6a4ab0 }, { kind: 'banner', x: 3, z: 40, v: 0x6a4ab0 },
    // 陨星坑（主地标）：中心巨型陨晶 + 一圈碎晶 + 立石
    { kind: 'crystal', x: 38, z: 14, v: 0xb070ff, s: 3.2 }, { kind: 'crystal', x: 33, z: 10, v: 0xd0a0ff, s: 1.4 }, { kind: 'crystal', x: 43, z: 18, v: 0xd0a0ff, s: 1.2 }, { kind: 'crystal', x: 42, z: 8, v: 0x9a70ff, s: 1.1 },
    { kind: 'stone', x: 28, z: 20 }, { kind: 'stone', x: 48, z: 6 }, { kind: 'stone', x: 30, z: 4 },
    // 观星台遗迹
    { kind: 'altar', x: -36, z: -40 }, { kind: 'pillar', x: -44, z: -36 }, { kind: 'pillar', x: -28, z: -46 }, { kind: 'pillar', x: -40, z: -50 }, { kind: 'pillar', x: -30, z: -32 },
  ],
  npcs: [
    { id: 'selen', name: '塞伦', title: '观星营地 · 观星者', role: 'quest', x: -2, z: 44, yaw: Math.PI, model: 'Mage', tint: 0x7a6ac0, tintK: 0.3, idle: '星星落下来的那晚，整片高原都亮了。' },
    { id: 'bram', name: '布拉姆', title: '护林人', role: 'quest', x: 9, z: 44, yaw: -Math.PI / 2, model: 'Rogue_Hooded', tint: 0x5a7a4a, tintK: 0.35, idle: '苔痕林里的树在动，我没喝多。' },
    { id: 'nia', name: '妮娅', title: '补给商', role: 'supply', x: -3.6, z: 55.1, yaw: Math.PI / 2, model: 'Rogue', tint: 0x9a8ac0, tintK: 0.3, idle: '陨晶粉末能入药，也能卖钱。' },
    { id: 'dorn', name: '多恩', title: '铁匠', role: 'smith', x: 7.5, z: 55, yaw: -Math.PI / 2, model: 'Barbarian', tint: 0x5a5a7a, tintK: 0.3, idle: '陨铁打的刀，能砍开石头。' },
    { id: 'qian_st', name: '钱小星', title: '仓库管理员', role: 'bank', x: 3, z: 58, yaw: Math.PI, model: 'Rogue', tint: 0x8a7a9a, tintK: 0.3, idle: '仓库是连通的，放心存。' },
  ],
  mobs: {
    star_wolf: mob('星斑狼', 16, 'wolf', { tint: 0xa0b0e0, tintK: 0.5, scale: 1.15, speed: 4.8, hp: 600, loot: 'trash_star' }),
    crystal_beetle: mob('陨晶甲虫', 17, 'spider', { tint: 0x9a6aff, tintK: 0.55, glow: 0x1a0a3a, scale: 1.2, onHitDot: { dps: 7, duration: 4 }, loot: 'trash_star' }),
    star_cultist: mob('观星邪教徒', 18, 'cultist', { tint: 0x6a5ab0, tintK: 0.45, ranged: true, range: 10, aggro: 13, interval: 2.2, hp: 540, shot: { color: 0xc0a0ff, el: 'arcane' }, loot: 'trash_star' }),
    meteor_golem: mob('陨石傀儡', 19, 'golem', { tint: 0x5a4a6a, tintK: 0.5, glow: 0x2a0a4a, hp: 1100, dmg: 48, interval: 2.4, speed: 2.8, range: 2.6, loot: 'trash_star' }),
    moss_treant: mob('苔痕树人', 18, 'treant', { tint: 0x5a8a3a, tintK: 0.45, hp: 900, dmg: 40, interval: 2.2, speed: 3, range: 2.4, loot: 'trash_star' }),
    star_faller: mob('坠星者 · 欧兰', 20, 'chief', { tint: 0x8a70d0, tintK: 0.45, glow: 0x1a0a3a, scale: 1.15, elite: true, hp: 5000, dmg: 70, interval: 2.1, range: 2.8, xp: 620, onHitDot: { dps: 12, duration: 4 }, leash: 34, loot: 'elite_star' }),
    star_stag: mob('星辉麋鹿 · 稀有', 19, 'boar', { tint: 0xd0c0ff, tintK: 0.6, glow: 0x2a1a4a, scale: 1.5, rare: true, hp: 2000, dmg: 52, xp: 340, speed: 5, loot: 'rare_star' }),
  },
  rises: [
    { kind: 'mesa', x: 38, z: 54, r: 6, h: 3.2, ramp: { a: Math.PI, w: 3.6, len: 11 }, name: '观星台地' },
    { x: -54, z: 56, r: 13, h: 2 }, { x: 58, z: -12, r: 11, h: 1.8 }, { x: -58, z: -10, r: 11, h: 1.8 },
    { kind: 'mesa', x: -84, z: -84, r: 9, h: 3.8, ramp: { a: Math.PI / 4, w: 4.2, len: 12 }, name: '落星崖' },
    { x: 86, z: 72, r: 13, h: 2.4 },
  ],
  packs: [
    { kinds: ['star_wolf', 'star_wolf', 'star_wolf'], x: -42, z: 22 }, { kinds: ['star_wolf', 'star_wolf'], x: -55, z: 8 }, { kinds: ['star_wolf', 'star_wolf'], x: -30, z: 34 },
    { kinds: ['crystal_beetle', 'crystal_beetle', 'crystal_beetle'], x: 38, z: 14, respawn: 32 }, { kinds: ['crystal_beetle', 'crystal_beetle'], x: 50, z: 26, respawn: 32 },
    { kinds: ['star_cultist', 'star_cultist', 'meteor_golem'], x: -36, z: -40 }, { kinds: ['star_cultist', 'star_cultist'], x: -50, z: -28 },
    { kinds: ['moss_treant', 'moss_treant'], x: 40, z: -42, respawn: 32 }, { kinds: ['moss_treant', 'meteor_golem'], x: 52, z: -30, respawn: 34 },
  ],
  elite: { kind: 'star_faller', route: [[-16, -8], [-2, -30], [18, -14], [6, 6], [-18, 6]], respawn: 180 },
  rare: { kind: 'star_stag', spots: [[-56, 44], [58, 46], [-54, -56]], respawn: 150 },
};

// ======================================================================  赤砂裂谷 20~23
const REDSAND: WildDef = {
  id: 'redsand', name: '赤砂裂谷', levels: [20, 23], minLevel: 18, desc: '赤岩驿站 · 蝎巢平原 · 沙匪峡谷 · 赤岩遗迹 · 火晶山脊',
  origin: { x: 0, z: 800 }, half: 130, inner: 80,
  palette: { sky: 0xe8b890, fog: 0xe0a878, fogNear: 45, fogFar: 160, hemi: 0xffe0c0, ground: 0x8a4a2a, hemiI: 1.15, sun: 2.6, sunColor: 0xffd0a0,
    tA: 0xe8b080, tB: 0xd09060, path: 0xd8b090, cliff: 0xa85a3a, tex: ['parchment', 'dirt', 'rock'], map: ['#d8905a', '#a8603a'], grass: 0xc89a50, weather: 'dust', music: 'redsand' },
  scatter: [
    { kind: 'mesa', n: 26, r: 3.2, s: R(1, 2.2), color: 0xb8603a, edge: true },
    { kind: 'rock', n: 40, r: 0.9, s: R(0.5, 1.6), color: 0xb86a48 },
    { kind: 'spire', n: 22, r: 0.7, s: R(0.8, 1.6), color: 0xff7a30 },
    { kind: 'deadtree', n: 18, r: 0.5, s: R(0.8, 1.2) },
    { kind: 'cactus', n: 30, r: 0.4, s: R(0.7, 1.3), color: 0x6a8a3a },
  ],
  camps: [{ id: 'rs_camp', name: '赤岩驿站', x: 0, z: 52, r: 13, main: true, waypoint: { x: -8, z: 58 } }],
  gates: [
    { to: 'field', x: 0, z: 72, name: '回翠风原野的石门', arrive: { x: 0, z: 66 } },
    { to: 'frost', x: 0, z: -74, name: '霜脊山口', arrive: { x: 0, z: -66 } },
  ],
  spots: {
    scorpion_flats: { x: -42, z: 22, r: 16, name: '蝎巢平原' }, bandit_canyon: { x: 42, z: 12, r: 15, name: '沙匪峡谷' },
    red_ruins: { x: -36, z: -40, r: 13, name: '赤岩遗迹' }, red_ruins_altar: { x: -36, z: -40, r: 4.5, name: '赤岩祭坛' },
    crystal_ridge: { x: 42, z: -42, r: 14, name: '火晶山脊' }, sandstorm_route: { x: 0, z: -14, r: 22, name: '沙暴之主的游荡路线' },
  },
  paths: [[[0, 72], [0, 40], [0, 10], [0, -30], [0, -74]], [[0, 10], [-20, 18], [-42, 22]], [[0, 0], [24, 8], [42, 12]], [[0, -20], [-20, -32], [-36, -40]], [[0, -24], [22, -36], [42, -42]]],
  decor: [
    { kind: 'dgate', x: -36, z: -58, v: 0xffc060 },
    { kind: 'tent', x: -7, z: 46, v: 0xb05a2a }, { kind: 'tent', x: 8, z: 47, v: 0x8a5a3a }, { kind: 'fire', x: 0, z: 50 }, { kind: 'tower', x: 10, z: 59 },
    { kind: 'stall', x: -6, z: 54, ry: Math.PI / 2 }, { kind: 'anvil', x: 6, z: 55 }, { kind: 'crate', x: 4, z: 58 }, { kind: 'banner', x: -3, z: 40, v: 0xb03a20 }, { kind: 'banner', x: 3, z: 40, v: 0xb03a20 },
    { kind: 'tent', x: 46, z: 6, v: 0x6a3020 }, { kind: 'tent', x: 36, z: 18, v: 0x5a2a1a }, { kind: 'fire', x: 42, z: 12 },
    { kind: 'altar', x: -36, z: -40 }, { kind: 'pillar', x: -44, z: -36 }, { kind: 'pillar', x: -28, z: -46 }, { kind: 'pillar', x: -40, z: -50 }, { kind: 'pillar', x: -30, z: -32 },
    { kind: 'crystal', x: 44, z: -44, v: 0xff6a20, s: 1.8 }, { kind: 'crystal', x: 38, z: -38, v: 0xff8a30, s: 1.3 },
  ],
  dungeonGates: [{ id: 'sand_tomb', name: '沙葬王陵', x: -36, z: -58, opens: 'v0.6.5', desc: '30 级普通副本 · 3 个首领 · 四难度' }],
  npcs: [
    { id: 'mosang', name: '莫桑', title: '赤岩驿站 · 驿站长', role: 'quest', x: -2, z: 44, yaw: Math.PI, model: 'Barbarian', tint: 0xb06a3a, tintK: 0.25, idle: '风沙大，喝口水再走。' },
    { id: 'tiya', name: '蒂雅', title: '补给商', role: 'supply', x: -3.6, z: 55.1, yaw: Math.PI / 2, model: 'Rogue', tint: 0xd09040, tintK: 0.3, idle: '药水、绷带，还有路上能用的东西。' },
    { id: 'balo', name: '巴洛', title: '铁匠', role: 'smith', x: 7.5, z: 55, yaw: -Math.PI / 2, model: 'Barbarian', tint: 0x6a4a3a, tintK: 0.3, idle: '砂子会钻进铠甲缝里，记得常来磨一磨。' },
    { id: 'qian_rs', name: '老钱', title: '仓库管理员', role: 'bank', x: 3, z: 58, yaw: Math.PI, model: 'Rogue', tint: 0x8a7a5a, tintK: 0.3, idle: '东西放我这儿，在哪个营地都能取。' },
  ],
  mobs: {
    scorpion: mob('赤砂巨蝎', 20, 'spider', { tint: 0xd06a2a, tintK: 0.55, scale: 1.35, speed: 4.4, onHitDot: { dps: 9, duration: 4 }, loot: 'trash_redsand' }),
    sand_bandit: mob('沙匪', 21, 'raider', { tint: 0xc08050, tintK: 0.4, loot: 'trash_redsand' }),
    sand_archer: mob('沙匪弩手', 21, 'archer', { tint: 0xc08050, tintK: 0.4, ranged: true, range: 10, aggro: 13, interval: 2.2, hp: 520, shot: { color: 0xffd0a0, el: 'physical' }, loot: 'trash_redsand' }),
    red_golem: mob('赤岩傀儡', 22, 'golem', { tint: 0xc04a2a, tintK: 0.5, hp: 1150, dmg: 52, interval: 2.4, speed: 2.8, range: 2.6, loot: 'trash_redsand' }),
    fire_sprite: mob('火晶精怪', 22, 'toad', { tint: 0xff6a20, tintK: 0.6, glow: 0x5a1800, scale: 0.8, ranged: true, range: 9, aggro: 12, hp: 560, shot: { color: 0xff7a30, el: 'fire' }, loot: 'trash_redsand' }),
    sand_lord: mob('沙暴之主 · 卡鲁', 23, 'chief', { tint: 0xd09050, tintK: 0.45, scale: 1.15, elite: true, hp: 5600, dmg: 78, interval: 2.1, range: 2.8, xp: 700, onHitDot: { dps: 14, duration: 4 }, leash: 34, loot: 'elite_redsand' }),
    amber_scorpion: mob('琥珀蝎王 · 稀有', 22, 'spider', { tint: 0xffc040, tintK: 0.6, scale: 1.8, glow: 0x3a2000, rare: true, hp: 2200, dmg: 58, xp: 380, speed: 5, loot: 'rare_redsand' }),
  },
  rises: [
    { kind: 'mesa', x: 38, z: 54, r: 6, h: 3.2, ramp: { a: Math.PI, w: 3.6, len: 11 }, name: '赤岩瞭望台' },
    { x: -56, z: 56, r: 14, h: 2.2 }, { x: -58, z: -12, r: 12, h: 1.8 }, { x: 60, z: -18, r: 12, h: 1.8 },
    // v0.9.3c 外环
    { kind: 'mesa', x: -98, z: -96, r: 10, h: 4, ramp: { a: Math.PI / 4, w: 4.4, len: 13 }, name: '断崖蝎巢' },
    { x: 104, z: 70, r: 16, h: 2.6 }, { x: 96, z: -100, r: 14, h: 2.2 },
  ],
  packs: [
    { kinds: ['scorpion', 'scorpion', 'scorpion'], x: -42, z: 22 }, { kinds: ['scorpion', 'scorpion'], x: -55, z: 8 }, { kinds: ['scorpion', 'scorpion'], x: -30, z: 34 },
    { kinds: ['sand_bandit', 'sand_bandit', 'sand_archer'], x: 42, z: 12 }, { kinds: ['sand_bandit', 'sand_archer', 'sand_archer'], x: 54, z: 2 }, { kinds: ['sand_bandit', 'sand_bandit'], x: 34, z: 26 },
    { kinds: ['red_golem', 'red_golem'], x: -36, z: -40, respawn: 34 }, { kinds: ['red_golem'], x: -48, z: -30, respawn: 34 },
    { kinds: ['fire_sprite', 'fire_sprite'], x: 42, z: -42 }, { kinds: ['fire_sprite', 'red_golem'], x: 54, z: -52 },
  ],
  elite: { kind: 'sand_lord', route: [[-14, -10], [0, -30], [16, -12], [4, 6], [-16, 4]], respawn: 180 },
  rare: { kind: 'amber_scorpion', spots: [[-60, 30], [60, 40], [-56, -56]], respawn: 150 },
};

// ======================================================================  霜脊高地 22~25
const FROST: WildDef = {
  id: 'frost', name: '霜脊高地', levels: [22, 25], minLevel: 21, desc: '霜脊营寨 · 松林狼径 · 冰湖 · 巨魔洞口 · 冰晶尖塔',
  origin: { x: 0, z: 1200 }, half: 130, inner: 80,
  palette: { sky: 0xc8d8f0, fog: 0xd0dcf0, fogNear: 35, fogFar: 140, hemi: 0xe0ecff, ground: 0x5a6a8a, hemiI: 1.25, sun: 2.2, sunColor: 0xe8f0ff,
    tA: 0xf8fbff, tB: 0xdde6f4, path: 0xc8c0b8, cliff: 0x8a98b0, tex: ['parchment', 'dirt', 'rock'], map: ['#e0e8f4', '#9aa8c0'], grass: 0, weather: 'snow', music: 'frost' },
  scatter: [
    { kind: 'pine', n: 150, r: 0.6, s: R(0.9, 1.6), color: 0x2a4a3a },
    { kind: 'rock', n: 36, r: 0.9, s: R(0.5, 1.5), color: 0x9aa4b4 },
    { kind: 'icespike', n: 26, r: 0.7, s: R(0.8, 1.8), color: 0xa8e0ff },
    { kind: 'mesa', n: 20, r: 3.2, s: R(1, 2), color: 0xa0aabc, edge: true },
  ],
  camps: [{ id: 'fr_camp', name: '霜脊营寨', x: 0, z: 52, r: 13, main: true, waypoint: { x: -8, z: 58 } }],
  gates: [
    { to: 'redsand', x: 0, z: 72, name: '回赤砂裂谷的山口', arrive: { x: 0, z: 66 } },
    { to: 'ember', x: 0, z: -74, name: '烬落裂隙', arrive: { x: 0, z: -66 } },
  ],
  spots: {
    wolf_pines: { x: -42, z: 24, r: 16, name: '松林狼径' }, frozen_lake: { x: 38, z: 16, r: 15, name: '冰湖' },
    troll_cave: { x: -38, z: -40, r: 13, name: '巨魔洞口' }, ice_spire: { x: 40, z: -42, r: 13, name: '冰晶尖塔' }, ice_spire_top: { x: 40, z: -42, r: 4.5, name: '尖塔底座' }, frost_gate: { x: 58, z: -66, r: 6, name: '永霜墓穴入口' },
    fang_route: { x: 0, z: -12, r: 22, name: '霜牙的游荡路线' },
  },
  paths: [[[0, 72], [0, 40], [0, 8], [0, -30], [0, -74]], [[0, 8], [-22, 18], [-42, 24]], [[0, 4], [20, 10], [38, 16]], [[0, -22], [-20, -34], [-38, -40]], [[0, -24], [22, -36], [40, -42]]],
  decor: [
    { kind: 'dgate', x: -38, z: -56, v: 0x9ad8ff }, { kind: 'dgate', x: 58, z: -66, v: 0x8ad0ff },   // v0.9.2b 永霜墓穴：冰晶尖塔后面
    { kind: 'tent', x: -7, z: 46, v: 0x4a6a9a }, { kind: 'tent', x: 8, z: 47, v: 0x6a7a9a }, { kind: 'fire', x: 0, z: 50 }, { kind: 'tower', x: 10, z: 59 },
    { kind: 'stall', x: -6, z: 54, ry: Math.PI / 2 }, { kind: 'anvil', x: 6, z: 55 }, { kind: 'crate', x: 4, z: 58 }, { kind: 'banner', x: -3, z: 40, v: 0x2a5a9a }, { kind: 'banner', x: 3, z: 40, v: 0x2a5a9a },
    { kind: 'icelake', x: 38, z: 16, s: 12 }, { kind: 'cave', x: -38, z: -46 },
    { kind: 'crystal', x: 40, z: -42, v: 0x9ae0ff, s: 2.6 }, { kind: 'crystal', x: 35, z: -38, v: 0xbfe8ff, s: 1.4 }, { kind: 'crystal', x: 45, z: -47, v: 0xbfe8ff, s: 1.2 },
  ],
  dungeonGates: [{ id: 'troll_cave', name: '巨魔冰窟', x: -38, z: -56, opens: 'v0.6.5', desc: '30 级普通副本 · 3 个首领 · 四难度' },
    { id: 'frost_crypt', name: '永霜墓穴', x: 58, z: -66, opens: '阶段六', desc: '30 级单人长副本 · 5 个首领 · 冰封的王陵' }],
  npcs: [
    { id: 'hela', name: '赫拉', title: '霜脊营寨 · 寨主', role: 'quest', x: -2, z: 44, yaw: Math.PI, model: 'Knight', tint: 0x6a8ac0, tintK: 0.3, idle: '山上的风能把骨头吹透，别在外面待太久。' },
    { id: 'nord', name: '诺德', title: '猎人', role: 'quest', x: 9, z: 44, yaw: -Math.PI / 2, model: 'Rogue_Hooded', tint: 0xa0b0c8, tintK: 0.35, idle: '狼群最近越来越近了。' },
    { id: 'suli', name: '苏莉', title: '补给商', role: 'supply', x: -3.6, z: 55.1, yaw: Math.PI / 2, model: 'Mage', tint: 0x8ab0e0, tintK: 0.3, idle: '热汤卖完了，药水还有。' },
    { id: 'gunn', name: '冈恩', title: '铁匠', role: 'smith', x: 7.5, z: 55, yaw: -Math.PI / 2, model: 'Barbarian', tint: 0x5a6a8a, tintK: 0.3, idle: '冻硬的钢更脆，打的时候小心点。' },
    { id: 'qian_fr', name: '老钱的表弟', title: '仓库管理员', role: 'bank', x: 3, z: 58, yaw: Math.PI, model: 'Rogue', tint: 0x7a8aa0, tintK: 0.3, idle: '各个营地的仓库是连通的。' },
  ],
  mobs: {
    frost_wolf: mob('霜鬃狼', 22, 'wolf', { tint: 0xe8f0ff, tintK: 0.6, scale: 1.25, speed: 5, hp: 760, loot: 'trash_frost' }),
    ice_elemental: mob('冰晶元素', 23, 'golem', { tint: 0x9ad8ff, tintK: 0.6, glow: 0x0a2a4a, hp: 1250, dmg: 56, interval: 2.4, speed: 2.8, range: 2.6, loot: 'trash_frost' }),
    frost_cultist: mob('霜誓教徒', 23, 'cultist', { tint: 0x8ab0ff, tintK: 0.45, ranged: true, range: 10, aggro: 13, interval: 2.2, hp: 640, shot: { color: 0x9fe0ff, el: 'frost' }, loot: 'trash_frost' }),
    ice_troll: mob('冰原巨魔', 24, 'brute', { tint: 0x6a9ac8, tintK: 0.5, scale: 1.35, hp: 1500, dmg: 66, interval: 2.3, speed: 3.4, range: 2.8, loot: 'trash_frost' }),
    frost_fang: mob('霜牙 · 狼王', 25, 'wolf', { tint: 0xffffff, tintK: 0.7, scale: 2.1, elite: true, hp: 6400, dmg: 86, interval: 1.8, speed: 4.6, range: 2.6, xp: 820, leash: 34, onHitDot: { dps: 15, duration: 4 }, loot: 'elite_frost' }),
    white_mammoth: mob('白鬃巨猪 · 稀有', 24, 'boar', { tint: 0xf0f4ff, tintK: 0.7, scale: 1.6, rare: true, hp: 2500, dmg: 64, xp: 420, speed: 4.6, loot: 'rare_frost' }),
  },
  rises: [
    { kind: 'mesa', x: 38, z: 54, r: 6, h: 3.4, ramp: { a: Math.PI, w: 3.6, len: 11.5 }, name: '雪顶台地' },
    { x: -40, z: 58, r: 14, h: 2.4 }, { x: 58, z: -10, r: 12, h: 2 }, { x: -40, z: -10, r: 12, h: 2 },
    // v0.9.3c 外环
    { kind: 'mesa', x: 100, z: -96, r: 10, h: 4.2, ramp: { a: Math.PI * 0.75, w: 4.4, len: 13 }, name: '冰牙崖' },
    { x: -104, z: 80, r: 16, h: 2.8 }, { x: -100, z: -90, r: 14, h: 2.4 },
  ],
  packs: [
    { kinds: ['frost_wolf', 'frost_wolf', 'frost_wolf'], x: -42, z: 24 }, { kinds: ['frost_wolf', 'frost_wolf'], x: -56, z: 10 }, { kinds: ['frost_wolf', 'frost_wolf'], x: -30, z: 36 },
    { kinds: ['ice_elemental', 'ice_elemental'], x: 38, z: 16, respawn: 32 }, { kinds: ['ice_elemental'], x: 50, z: 28, respawn: 32 },
    { kinds: ['ice_troll', 'ice_troll'], x: -38, z: -40, respawn: 34 }, { kinds: ['ice_troll'], x: -50, z: -28, respawn: 34 },
    { kinds: ['frost_cultist', 'frost_cultist', 'ice_elemental'], x: 40, z: -42 }, { kinds: ['frost_cultist', 'frost_cultist'], x: 52, z: -30 },
  ],
  elite: { kind: 'frost_fang', route: [[-16, -8], [-2, -30], [18, -14], [6, 6], [-18, 6]], respawn: 180 },
  rare: { kind: 'white_mammoth', spots: [[-60, 46], [62, 50], [-58, -58]], respawn: 150 },
};

// ======================================================================  烬落荒原 25~30（满级大地图）
const EMBER: WildDef = {
  id: 'ember', name: '烬落荒原', levels: [25, 30], minLevel: 24, desc: '烬火堡垒 · 灰烬前哨 · 熔痕营地 · 熔岩裂谷（世界事件）· 两个长副本入口',
  origin: { x: 0, z: 1700 }, half: 160, inner: 115,
  palette: { sky: 0x4a3a3a, fog: 0x5a4038, fogNear: 30, fogFar: 150, hemi: 0xffc8a0, ground: 0x3a2a24, hemiI: 1.2, sun: 2.0, sunColor: 0xffa070,
    night: { hemiK: 0.85, hemiC: 0xd08a68, groundC: 0x6a3826, fogC: 0x3a2018, fogK: 0.5 },   // 11-17 Rhett「晚上太暗看不见路」：夜里环境光 58% → 85%、偏暖暗红（不再冷蓝），地面反光偏暖
    tA: 0x7a6a64, tB: 0x5a4c48, path: 0x8a6a50, cliff: 0x3a3230, tex: ['parchment', 'dirt', 'rock'], map: ['#5a4038', '#2a1a14'], grass: 0, cracks: 0xff5a10, weather: 'ash', music: 'ember' },
  scatter: [
    { kind: 'mesa', n: 34, r: 3.4, s: R(1.1, 2.4), color: 0x2a2220, edge: true },
    { kind: 'obsidian', n: 50, r: 0.9, s: R(0.6, 1.8), color: 0x1a1418 },
    { kind: 'deadtree', n: 60, r: 0.5, s: R(0.9, 1.5) },
    { kind: 'spire', n: 26, r: 0.7, s: R(0.8, 1.8), color: 0xff5a10 },
    { kind: 'bones', n: 26, r: 0, s: R(0.8, 1.3) },
  ],
  camps: [
    { id: 'em_fort', name: '烬火堡垒', x: 0, z: 88, r: 16, main: true, waypoint: { x: -10, z: 96 } },
    { id: 'em_east', name: '灰烬前哨', x: 78, z: 6, r: 11, waypoint: { x: 78, z: 14 } },
    { id: 'em_west', name: '熔痕营地', x: -78, z: -30, r: 11, waypoint: { x: -78, z: -22 } },
  ],
  gates: [{ to: 'frost', x: 0, z: 108, name: '回霜脊高地的裂隙', arrive: { x: 0, z: 102 } }],
  spots: {
    ash_plain: { x: -34, z: 52, r: 18, name: '灰烬平原' }, hound_den: { x: 44, z: 56, r: 15, name: '余烬猎犬巢' },
    cult_altar: { x: -60, z: 6, r: 14, name: '灰烬教团祭坛' }, cult_altar_core: { x: -60, z: 6, r: 4.5, name: '教团祭坛中心' },
    lava_rift: { x: 0, z: 8, r: 12, name: '熔岩裂谷' }, obsidian_waste: { x: 70, z: -56, r: 18, name: '黑曜石荒地' },
    bone_yard: { x: -50, z: -78, r: 16, name: '焦骨墓场' }, brute_ridge: { x: 30, z: -40, r: 14, name: '黑曜蛮兽山脊' },
    molten_gate: { x: -22, z: -104, r: 6, name: '熔心王座入口' },
    heart_route: { x: 0, z: -40, r: 26, name: '熔核巨像的游荡路线' }, east_outpost: { x: 78, z: 6, r: 10, name: '灰烬前哨' }, west_camp: { x: -78, z: -30, r: 10, name: '熔痕营地' },
    scout_ridge: { x: 96, z: -86, r: 6, name: '东南瞭望岩' },
  },
  paths: [
    [[0, 108], [0, 70], [0, 30], [0, 6], [0, -30], [0, -70], [-22, -104]], [[0, -70], [26, -104]], [[0, -70], [2, -110]],
    [[0, 30], [40, 20], [78, 6]], [[0, 20], [-40, 0], [-78, -30]], [[0, 60], [-34, 52]], [[0, 60], [44, 56]],
    [[78, 6], [74, -30], [70, -56], [96, -86]], [[-78, -30], [-60, -60], [-50, -78]], [[0, -30], [30, -40]],
  ],
  decor: [
    // 烬火堡垒：石墙 + 帐篷 + 功能区
    { kind: 'tent', x: -9, z: 80, v: 0x5a2a20 }, { kind: 'tent', x: 10, z: 80, v: 0x4a2a2a }, { kind: 'tent', x: -11, z: 92, v: 0x6a3020 }, { kind: 'fire', x: 0, z: 86 },
    { kind: 'tower', x: 13, z: 98 }, { kind: 'tower', x: -14, z: 74 }, { kind: 'stall', x: -6, z: 90, ry: Math.PI / 2 }, { kind: 'anvil', x: 6, z: 91 }, { kind: 'crate', x: 4, z: 96 },
    { kind: 'board', x: 3, z: 78 }, { kind: 'banner', x: -3, z: 72, v: 0xd04a10 }, { kind: 'banner', x: 3, z: 72, v: 0xd04a10 },
    // 两个前哨
    { kind: 'tent', x: 74, z: 2, v: 0x5a3a2a }, { kind: 'fire', x: 80, z: 8 }, { kind: 'tower', x: 86, z: 0 }, { kind: 'crate', x: 72, z: 10 },
    { kind: 'tent', x: -82, z: -34, v: 0x4a3a2a }, { kind: 'fire', x: -76, z: -28 }, { kind: 'tower', x: -88, z: -24 }, { kind: 'crate', x: -72, z: -34 },
    // 地标
    { kind: 'lava', x: 0, z: -8, s: 8 }, { kind: 'lava', x: -16, z: -14, s: 4 }, { kind: 'lava', x: 22, z: 4, s: 3.5 }, { kind: 'lava', x: 60, z: -70, s: 5 },
    { kind: 'altar', x: -60, z: 6 }, { kind: 'pillar', x: -68, z: 0 }, { kind: 'pillar', x: -52, z: 12 }, { kind: 'pillar', x: -66, z: 14 }, { kind: 'pillar', x: -54, z: -2 },
    { kind: 'dgate', x: -22, z: -104, v: 0xff5a10, s: 2 }, { kind: 'dgate', x: 2, z: -110, v: 0xffa040 },   // v0.9.2b 永霜墓穴迁到霜脊高地
    { kind: 'crystal', x: 30, z: -40, v: 0xff4a10, s: 2 }, { kind: 'stone', x: 96, z: -86 },
  ],
  npcs: [
    { id: 'kairen', name: '凯伦', title: '烬火堡垒 · 指挥官', role: 'quest', x: -3, z: 76, yaw: Math.PI, model: 'Knight', tint: 0x8a3a20, tintK: 0.3, idle: '荒原上没有安全的地方，只有更危险的地方。' },
    { id: 'yan', name: '焰歌', title: '火焰学者', role: 'quest', x: 9, z: 84, yaw: -Math.PI / 2, model: 'Mage', tint: 0xd06a30, tintK: 0.35, idle: '熔岩在说话，只是没人听得懂。' },
    { id: 'bounty', name: '悬赏板', title: '每日悬赏', role: 'bounty', x: 3, z: 78, yaw: Math.PI, model: 'board', idle: '完成悬赏可以反复领取。' },
    { id: 'fena', name: '菲娜', title: '补给商', role: 'supply', x: -5, z: 92, yaw: Math.PI / 2, model: 'Rogue', tint: 0xa05a3a, tintK: 0.3, idle: '荒原上药水比金子还贵——当然我卖得不贵。' },
    { id: 'dorn', name: '多恩', title: '铁匠', role: 'smith', x: 7.5, z: 91, yaw: -Math.PI / 2, model: 'Barbarian', tint: 0x3a2a2a, tintK: 0.35, idle: '熔岩烧过的钢最硬。' },
    { id: 'qian_em', name: '老钱的侄子', title: '仓库管理员', role: 'bank', x: 3, z: 97, yaw: Math.PI, model: 'Rogue', tint: 0x6a5a4a, tintK: 0.3, idle: '仓库连通全部营地。' },
    { id: 'xu', name: '徐砚', title: '兑换商', role: 'exchange', x: -7.6, z: 100.7, yaw: Math.PI / 2, model: 'Rogue_Hooded', tint: 0x8a6a3a, tintK: 0.3, idle: '长副本的战利品，以后可以来我这里换装备。' },
    { id: 'mentor', name: '伊薇', title: '精英等级导师', role: 'mentor', x: -12, z: 86, yaw: Math.PI / 2, model: 'Knight', tint: 0xc0a050, tintK: 0.3, idle: '满级之后，路才刚开始。' },
    { id: 'scholar', name: '墨言', title: '副本学者', role: 'scholar', x: 12, z: 88, yaw: -Math.PI / 2, model: 'Mage', tint: 0x5a4a8a, tintK: 0.3, idle: '王座和墓穴，我都研究过一点。' },
    { id: 'rook', name: '洛克', title: '灰烬前哨 · 哨长', role: 'quest', x: 75.6, z: 9.3, yaw: Math.PI, model: 'Knight', tint: 0x6a5a4a, tintK: 0.3, idle: '东边的黑曜石荒地，蛮兽越来越多。' },
    { id: 'mira', name: '米拉', title: '熔痕营地 · 祭司', role: 'quest', x: -72.9, z: -23.5, yaw: Math.PI, model: 'Mage', tint: 0xa04a4a, tintK: 0.3, idle: '教团在西边的祭坛上召唤着什么。' },
  ],
  mobs: {
    ember_hound: mob('余烬猎犬', 25, 'wolf', { tint: 0x8a2a10, tintK: 0.6, glow: 0x3a0a00, scale: 1.2, speed: 5.2, hp: 900, onHitDot: { dps: 14, duration: 3 }, loot: 'trash_ember' }),
    ash_cultist: mob('灰烬教徒', 26, 'cultist', { tint: 0x5a4a4a, tintK: 0.5, ranged: true, range: 10, aggro: 13, interval: 2.2, hp: 820, shot: { color: 0xff6a20, el: 'fire' }, loot: 'trash_ember' }),
    lava_spawn: mob('熔岩幼体', 26, 'toad', { tint: 0xff5a10, tintK: 0.6, glow: 0x6a1800, scale: 0.9, hp: 860, loot: 'trash_ember' }),
    charred: mob('焦骨战士', 27, 'miner', { tint: 0x3a3030, tintK: 0.6, hp: 1050, loot: 'trash_ember' }),
    magma_golem: mob('熔岩魔像', 28, 'golem', { tint: 0x3a2020, tintK: 0.5, glow: 0x5a1a00, hp: 1800, dmg: 76, interval: 2.4, speed: 2.8, range: 2.7, loot: 'trash_ember' }),
    obsidian_brute: mob('黑曜蛮兽', 29, 'brute', { tint: 0x1a1418, tintK: 0.6, scale: 1.4, hp: 2100, dmg: 84, interval: 2.3, speed: 3.4, range: 2.8, loot: 'trash_ember' }),
    flame_heart: mob('熔核巨像 · 炽心', 30, 'golem', { tint: 0x2a1a14, tintK: 0.5, glow: 0x8a2a00, scale: 2, elite: true, hp: 9800, dmg: 112, interval: 2.4, speed: 2.8, range: 3.4, xp: 1200, leash: 36, onHitDot: { dps: 20, duration: 4 }, loot: 'elite_ember' }),
    ash_priest: mob('灰烬祭司长 · 赛勒', 29, 'cultist', { tint: 0x3a1a1a, tintK: 0.5, glow: 0x3a0a00, scale: 1.45, elite: true, hp: 8200, dmg: 96, interval: 2, xp: 1000, leash: 30, ranged: true, range: 10, aggro: 13, shot: { color: 0xff4a10, el: 'fire' }, loot: 'elite_ember2' }),
    obsidian_king: mob('黑曜蝎王 · 稀有', 28, 'spider', { tint: 0x1a1418, tintK: 0.7, glow: 0x2a0a20, scale: 2, rare: true, hp: 3400, dmg: 80, xp: 520, speed: 5, loot: 'rare_ember' }),
  },
  rises: [
    { kind: 'mesa', x: -79, z: 75, r: 8, h: 3.6, ramp: { a: -0.47, w: 4, len: 12 }, name: '灰烬高台' },
    { kind: 'mesa', x: 81, z: 81, r: 7, h: 3.2, ramp: { a: -2.55, w: 3.6, len: 11 }, name: '熔脊台地' },
    { x: -87, z: -87, r: 16, h: 2.4 }, { x: 33, z: -75, r: 16, h: 2.4 },
    // v0.9.3c 外环
    { kind: 'mesa', x: 128, z: 124, r: 11, h: 4.4, ramp: { a: -Math.PI * 0.75, w: 4.4, len: 14 }, name: '焦骨台' },
    { x: -132, z: 110, r: 18, h: 3 }, { x: 130, z: -40, r: 16, h: 2.6 },
  ],
  packs: [
    { kinds: ['ember_hound', 'ember_hound', 'ember_hound'], x: 44, z: 56 }, { kinds: ['ember_hound', 'ember_hound'], x: 58, z: 44 }, { kinds: ['ember_hound', 'ember_hound'], x: 30, z: 66 },
    { kinds: ['charred', 'charred'], x: -34, z: 52 }, { kinds: ['charred', 'lava_spawn'], x: -48, z: 40 }, { kinds: ['lava_spawn', 'lava_spawn'], x: -22, z: 60 },
    { kinds: ['ash_cultist', 'ash_cultist', 'charred'], x: -60, z: 6 }, { kinds: ['ash_cultist', 'ash_cultist'], x: -70, z: 18 }, { kinds: ['ash_cultist', 'charred'], x: -48, z: -6 },
    { kinds: ['magma_golem', 'lava_spawn'], x: 20, z: -14, respawn: 34 }, { kinds: ['magma_golem'], x: -20, z: -24, respawn: 34 },
    { kinds: ['obsidian_brute', 'obsidian_brute'], x: 30, z: -40, respawn: 36 }, { kinds: ['obsidian_brute'], x: 70, z: -56, respawn: 36 }, { kinds: ['obsidian_brute', 'magma_golem'], x: 84, z: -40, respawn: 36 },
    { kinds: ['charred', 'charred', 'charred'], x: -50, z: -78 }, { kinds: ['charred', 'ash_cultist'], x: -36, z: -90 }, { kinds: ['magma_golem', 'charred'], x: -64, z: -66, respawn: 34 },
  ],
  elite: { kind: 'flame_heart', route: [[-16, -40], [0, -60], [20, -44], [10, -26], [-14, -28]], respawn: 240 },
  rare: { kind: 'obsidian_king', spots: [[96, -86], [-96, 40], [60, -96]], respawn: 180 },
  events: [{ id: 'eruption', name: '熔岩喷发', spot: 'lava_rift', every: 1200, duration: 150,
    waves: [['lava_spawn', 'lava_spawn', 'lava_spawn'], ['lava_spawn', 'lava_spawn', 'magma_golem'], ['magma_golem', 'magma_golem', 'lava_spawn', 'lava_spawn']],
    reward: { gold: 260, xp: 1400, minQuality: 'purple' } }],
  dungeonGates: [
    { id: 'molten_throne', name: '熔心王座', x: -22, z: -104, opens: '阶段六', desc: '30 级单人长副本 · 5 个首领 · 熔岩与王权' },
    { id: 'ash_forge', name: '灰烬铸造厂', x: 2, z: -110, opens: 'v0.6.6', desc: '30 级普通副本 · 3 个首领 · 四难度' },
  ],
};

// ======================================================================  v0.9.2b 副本区：暗岩山麓（营地东北）/ 腐沼湿地（营地西南）
const hubMob = (name: string, level: number, model: string, hp: number, dmg: number, loot: string, o: Partial<WildMob> = {}): WildMob =>
  ({ name, level, model, hp, dmg, interval: 1.8, speed: 3.8, aggro: 8, range: 2.1, xp: level * 6, ilvl: level + 1, loot, leash: 24, patrol: 2.5, ...o });
const FOOTHILL: WildDef = {
  id: 'foothill', name: '暗岩山麓', levels: [4, 8], minLevel: 1, desc: '副本区 · 矿工营地 · 暗岩矿洞入口',
  origin: { x: 700, z: -500 }, half: 48,
  palette: { sky: 0xa8b4c8, fog: 0xa8b0bc, fogNear: 30, fogFar: 110, hemi: 0xe0e4ec, ground: 0x4a4440, hemiI: 1.2, sun: 2.2, sunColor: 0xffe8c8,
    tA: 0x7a8a5a, tB: 0x6a6a58, path: 0xb8a888, cliff: 0x5a5450, tex: ['grass', 'dirt', 'rock'], map: ['#7a8060', '#5a5450'], grass: 0x6a8048, music: 'field' },
  scatter: [
    { kind: 'pine', n: 40, r: 0.6, s: R(0.9, 1.4), color: 0x2a4a2a },
    { kind: 'rock', n: 30, r: 0.9, s: R(0.6, 1.6), color: 0x6d665c },
    { kind: 'mesa', n: 12, r: 3.2, s: R(1, 2), color: 0x5a5450, edge: true },
  ],
  camps: [{ id: 'fh_camp', name: '矿工营地', x: 0, z: 26, r: 10, main: true, waypoint: { x: -7, z: 30 } }],
  gates: [{ to: 'camp', x: 0, z: 42, name: '回灰石营地的山路', arrive: { x: 0, z: 36 } }],
  spots: { fh_slope: { x: -20, z: 0, r: 12, name: '碎石坡' }, fh_gate: { x: 0, z: -34, r: 6, name: '暗岩矿洞入口' } },
  paths: [[[0, 42], [0, 20], [0, -6], [0, -30]], [[0, 0], [-20, 0]], [[0, -8], [22, -14]]],
  decor: [
    { kind: 'tent', x: -6, z: 22, v: 0x8a6a3a }, { kind: 'fire', x: 0, z: 25 }, { kind: 'crate', x: 5, z: 28 }, { kind: 'cart', x: 7, z: 21, ry: 0.4 },
    { kind: 'banner', x: -3, z: 16, v: 0xc08030 }, { kind: 'banner', x: 3, z: 16, v: 0xc08030 },
    { kind: 'dgate', x: 0, z: -34, v: 0xffb040 }, { kind: 'cave', x: 0, z: -40 },
  ],
  dungeonGates: [{ id: 'darkrock_mine', name: '暗岩矿洞', x: 0, z: -34, opens: '', desc: '4~8 级普通副本 · 监工格罗克' }],
  npcs: [
    { id: 'hob', name: '霍布', title: '矿工营地 · 补给商', role: 'supply', x: -2.0, z: 28.3, yaw: Math.PI / 2, model: 'Barbarian', tint: 0x8a6a3a, tintK: 0.3, idle: '矿洞里塌了好几次，进去之前多带几瓶药。' },
  ],
  mobs: {
    fh_wolf: hubMob('山麓灰狼', 5, 'wolf', 180, 12, 'trash', { tint: 0x7a7a80, tintK: 0.4, speed: 4.4 }),
    fh_spider: hubMob('碎石蜘蛛', 6, 'spider', 200, 14, 'trash', { tint: 0x6a5a4a, tintK: 0.4 }),
    fh_miner: hubMob('发狂矿工', 7, 'miner', 260, 16, 'trash', {}),
  },
  packs: [
    { kinds: ['fh_wolf', 'fh_wolf'], x: -20, z: 2, respawn: 40 }, { kinds: ['fh_wolf', 'fh_wolf', 'fh_wolf'], x: -26, z: -16, respawn: 40 },
    { kinds: ['fh_spider', 'fh_spider'], x: 22, z: -12, respawn: 40 }, { kinds: ['fh_miner', 'fh_spider'], x: 14, z: -26, respawn: 40 },
  ],
};
const MARSH: WildDef = {
  id: 'marsh', name: '腐沼湿地', levels: [8, 12], minLevel: 1, desc: '副本区 · 苇丛哨站 · 腐沼神殿入口',
  origin: { x: -700, z: -500 }, half: 48,
  palette: { sky: 0x8a9a7a, fog: 0x7a8a6a, fogNear: 22, fogFar: 95, hemi: 0xc8d8b0, ground: 0x3a4a2a, hemiI: 1.15, sun: 1.9, sunColor: 0xe8f0c0,
    tA: 0x4a5a34, tB: 0x3a4a2a, path: 0x6a6a48, cliff: 0x3a3a2a, tex: ['grass', 'mud', 'rock'], map: ['#4a5a34', '#2a3a1a'], grass: 0x4a6a2a, music: 'field' },
  scatter: [
    { kind: 'deadtree', n: 40, r: 0.5, s: R(0.9, 1.5) },
    { kind: 'rock', n: 18, r: 0.9, s: R(0.5, 1.3), color: 0x4a4a3a },
    { kind: 'mesa', n: 10, r: 3, s: R(1, 1.8), color: 0x3a3a2a, edge: true },
  ],
  camps: [{ id: 'mr_camp', name: '苇丛哨站', x: 0, z: 26, r: 10, main: true, waypoint: { x: -7, z: 30 } }],
  gates: [{ to: 'camp', x: 0, z: 42, name: '回灰石营地的木栈道', arrive: { x: 0, z: 36 } }],
  spots: { mr_pool: { x: 20, z: 0, r: 12, name: '毒水洼' }, mr_gate: { x: 0, z: -34, r: 6, name: '腐沼神殿入口' } },
  paths: [[[0, 42], [0, 20], [0, -6], [0, -30]], [[0, 0], [20, 0]], [[0, -8], [-22, -14]]],
  decor: [
    { kind: 'tent', x: -6, z: 22, v: 0x5a6a3a }, { kind: 'fire', x: 0, z: 25 }, { kind: 'crate', x: 5, z: 28 },
    { kind: 'banner', x: -3, z: 16, v: 0x5a8a30 }, { kind: 'banner', x: 3, z: 16, v: 0x5a8a30 },
    { kind: 'dgate', x: 0, z: -34, v: 0x7ad040 }, { kind: 'pillar', x: -5, z: -40 }, { kind: 'pillar', x: 5, z: -40 },
  ],
  dungeonGates: [{ id: 'rotting_temple', name: '腐沼神殿', x: 0, z: -34, opens: '', desc: '8~12 级普通副本 · 腐根祭司' }],
  npcs: [
    { id: 'reed', name: '芦娘', title: '苇丛哨站 · 补给商', role: 'supply', x: -2.0, z: 28.3, yaw: Math.PI / 2, model: 'Rogue_Hooded', tint: 0x5a7a3a, tintK: 0.35, idle: '神殿里的毒雾会钻进骨头里，解毒药水多备点。' },
  ],
  mobs: {
    mr_toad: hubMob('毒沼蟾蜍', 9, 'toad', 320, 18, 'trash_swamp', { onHitDot: { dps: 3, duration: 4 } }),
    mr_treant: hubMob('腐根树精', 10, 'treant', 420, 22, 'trash_swamp', { speed: 3, tint: 0x4a5a2a, tintK: 0.4 }),
    mr_cultist: hubMob('沼泽信徒', 11, 'cultist', 340, 20, 'trash_swamp', { ranged: true, range: 9, aggro: 11, interval: 2.2, shot: { color: 0x7ad040, el: 'nature' } }),
  },
  packs: [
    { kinds: ['mr_toad', 'mr_toad'], x: 20, z: 2, respawn: 40 }, { kinds: ['mr_toad', 'mr_toad', 'mr_toad'], x: 26, z: -16, respawn: 40 },
    { kinds: ['mr_treant', 'mr_cultist'], x: -22, z: -12, respawn: 40 }, { kinds: ['mr_cultist', 'mr_cultist'], x: -14, z: -26, respawn: 40 },
  ],
};

export const WILD: Record<WildId, WildDef> = { star: STAR, redsand: REDSAND, frost: FROST, ember: EMBER, foothill: FOOTHILL, marsh: MARSH };
/** v1.0.2：内容包的野外区域并进 WILD / WILD_IDS（没有包 = 什么都不做，本体表不变）。包区域 id 不在 WildId 联合类型里，运行时当普通野外用；
 *  不进 FULL_WILD_IDS（探索物件 / 瞭望塔另做）和 HUB_IDS。id 和本体重复的忽略（包不能覆盖本体） */
export const PACK_WILD_IDS: string[] = [];
for (const d of withPacks<WildDef & { pack?: string }>([], 'wilds')) {
  if (!d?.id || d.id in WILD) continue;
  (WILD as Record<string, WildDef>)[d.id] = d;
  (WILD_IDS as string[]).push(d.id); PACK_WILD_IDS.push(d.id);
}
export const isPackWild = (id: string) => PACK_WILD_IDS.includes(id);

// ======================================================================  v0.9.3c 怪群与刷新规则
/** 刷新规则（秒）：普通群 45–60 且玩家走开 30 米才刷；刷怪点 25；精英 300；稀有 480–900 随机 */
export const RESPAWN = { normalMin: 45, normalMax: 60, hot: 25, elite: 300, rareMin: 480, rareMax: 900, away: 30, awayCap: 2 } as const;
/** away：普通群要玩家离出生点 away 米才刷；但玩家一直守在旁边时，等满 awayCap 倍刷新时间也照刷（任务点不会被守死） */
/** 营地周边 SAFE_R 米内不放怪；主路每 PACK_STEP 米一群 */
export const SAFE_R = 30, PACK_STEP = 30, PACK_GAP = 25;
/** 等级加成：老范围（inner）里 +0（任务区平衡不动）；外环离老范围 25 米内 +1，更远 +2 */
export function levelOffsetAt(def: WildDef, x: number, z: number) {
  const out = Math.max(Math.abs(x), Math.abs(z)) - (def.inner ?? def.half);
  return out <= 0 ? 0 : out < 25 ? 1 : 2;
}
const segD = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
export function wildPathDist(def: WildDef, x: number, z: number) { let d = Infinity; for (const pl of def.paths) for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, segD(x, z, pl[i], pl[i + 1])); return d; }
/** 起伏高度（不 import Terrain 的实现，避免循环：这里只要判断「在不在台地 / 山丘上」） */
const onRise = (def: WildDef, x: number, z: number, pad = 0) => (def.rises ?? []).some(r => Math.hypot(x - r.x, z - r.z) < r.r + pad + (r.kind === 'mesa' ? 3 : 0));
const onRampLane = (def: WildDef, x: number, z: number) => (def.rises ?? []).some(r => { if (r.kind !== 'mesa' || !r.ramp) return false; const dx = x - r.x, dz = z - r.z, ca = Math.cos(r.ramp.a), sa = Math.sin(r.ramp.a); const al = dx * ca + dz * sa, sd = Math.abs(-dx * sa + dz * ca); return al > r.r - 2 && al < r.r + r.ramp.len + 4 && sd < r.ramp.w / 2 + 3; });

/**
 * 扩建布局（每张图在模块加载时跑一次，确定性）：
 * ① 外环环路（老范围和新边缘之间一圈 + 4 条连到老路的支路）；② 沿所有路每 27 米在路边放一群（3–5 只，种类取最近的老怪群）；
 * ③ 每座台地台顶一个刷怪点（多 1 只、25 秒）；④ 所有怪群按离营地远近 +0~+2 级、普通群刷新 45–60 秒
 */
export function layoutWild(def: WildDef) {
  if (!def.inner || (def as { _laid?: boolean })._laid) return;
  (def as { _laid?: boolean })._laid = true;
  let seed = def.origin.z * 7 + 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const H = def.half, I = def.inner, R0 = (H + I) / 2 + 2, K = H / 130;   // K：大图（烬落 ±160）间距放宽，总数仍落在 30–40 群
  // ① 环路：超椭圆（|x|^4 + |z|^4 = R^4，四角饱满）16 个点，半径 ±5 米起伏
  const loop: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i % 16) / 16 * Math.PI * 2 + 0.2, c = Math.cos(a), sn = Math.sin(a), k = 1 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(sn), 4), 0.25);
    const r = Math.min(H - 10, R0 * k * (i % 16 === 0 ? 1 : 1 + (rnd() - 0.5) * 0.08));
    loop.push(i === 16 ? loop[0] : [Math.round(c * r), Math.round(sn * r)]);
  }
  const ends = def.paths.flatMap(pl => [pl[0], pl[pl.length - 1]]);
  const spokes: [number, number][][] = [];
  for (const q of [0, 4, 8, 12]) {
    const lp = loop[q]; let best = ends[0], bd = Infinity;
    for (const e of ends) { const d = Math.hypot(e[0] - lp[0], e[1] - lp[1]); if (d < bd && Math.max(Math.abs(e[0]), Math.abs(e[1])) < I) { bd = d; best = e; } }
    spokes.push([best, lp]);
  }
  def.paths.push(loop, ...spokes);
  // v0.9.3d 世界首领竞技场：装饰（流沙坑石环 / 冰湖 / 火山口熔岩），外环怪群不放进去
  const arenas = WB_IDS.map(i => WORLD_BOSSES[i]).filter(b => b.map === def.id);
  for (const b of arenas) {
    const ring = (n: number, r: number, f: (x: number, z: number, i: number) => void) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.3; f(Math.round(b.x + Math.cos(a) * r), Math.round(b.z + Math.sin(a) * r), i); } };
    if (def.id === 'frost') { def.decor.push({ kind: 'icelake', x: b.x, z: b.z, s: 13 }); ring(6, b.r - 2, (x, z) => def.decor.push({ kind: 'crystal', x, z, v: 0xa8e0ff, s: 1.4 })); }
    else if (def.id === 'ember') { ring(5, b.r - 2, (x, z, i) => def.decor.push(i % 2 ? { kind: 'crystal', x, z, v: 0xff5a10, s: 1.6 } : { kind: 'lava', x, z, s: 2.6 })); }
    else { ring(8, b.r - 3, (x, z, i) => def.decor.push({ kind: i % 2 ? 'pillar' : 'stone', x, z })); }
  }
  const inArena = (x: number, z: number) => arenas.some(b => Math.hypot(x - b.x, z - b.z) < b.r + 3);
  // ② 沿路放怪群
  const old = def.packs.slice();
  const nearKinds = (x: number, z: number) => { let b = old[0], bd = Infinity; for (const p of old) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b.kinds; };
  const clear = (x: number, z: number) => Math.abs(x) < H - 8 && Math.abs(z) < H - 8 && Math.max(Math.abs(x), Math.abs(z)) > I - 4   // 只在外环放：老范围的任务区保持原样
    && def.camps.every(c => Math.hypot(x - c.x, z - c.z) > SAFE_R + c.r * 0.3)
    && def.gates.every(g => Math.hypot(x - g.x, z - g.z) > 14) && (def.dungeonGates ?? []).every(g => Math.hypot(x - g.x, z - g.z) > 14)
    && def.decor.every(d => Math.hypot(x - d.x, z - d.z) > (d.kind === 'lava' ? (d.s ?? 5) + 6 : d.kind === 'icelake' ? (d.s ?? 10) + 4 : 5))
    && !onRise(def, x, z, 2) && !onRampLane(def, x, z)
    && def.packs.every(p => Math.hypot(p.x - x, p.z - z) > PACK_GAP * K)
    && Object.values(def.spots).every(sp => sp.r > 18 || Math.hypot(x - sp.x, z - sp.z) > 6) && !inArena(x, z)
    && !(def.solidAt && [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => def.solidAt!(x + dx, z + dz)));   // v1.2.50 包的不可走地形（深水）周围不放
  let side = 1;
  for (const pl of def.paths) for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (let t = PACK_STEP * K / 2; t < L; t += PACK_STEP * K) {
      side = -side;
      for (const off of [7, 10, 5]) {
        const x = Math.round(a[0] + ux * t - uz * off * side), z = Math.round(a[1] + uz * t + ux * off * side);
        if (!clear(x, z)) continue;
        const base = nearKinds(x, z), n = 3 + Math.floor(rnd() * 3);
        const kinds = Array.from({ length: n }, (_, j) => base[j % base.length]);
        def.packs.push({ kinds, x, z, gen: true });
        break;
      }
    }
  }
  // ③ 台地台顶刷怪点
  for (const r of def.rises ?? []) if (r.kind === 'mesa') {
    const base = nearKinds(r.x, r.z);
    def.packs.push({ kinds: [...base, base[0]].slice(0, Math.min(5, base.length + 1)).concat(base.length < 2 ? [base[0]] : []), x: r.x, z: r.z, hot: true, respawn: RESPAWN.hot, gen: true });
  }
  // ④ 刷新与等级
  for (const p of def.packs) {
    p.lv = levelOffsetAt(def, p.x, p.z);
    // 老范围里的任务怪群保持原来的刷新（30–36 秒、不等走开），任务节奏不变；新规则只管外环
    if (!p.hot && p.gen) p.respawn = Math.round(RESPAWN.normalMin + rnd() * (RESPAWN.normalMax - RESPAWN.normalMin));
  }
  if (def.elite) def.elite.respawn = RESPAWN.elite;
  if (def.rare) def.rare.respawn = RESPAWN.rareMin;
}
for (const id of WILD_IDS) layoutWild(WILD[id]);
export const isWildId = (s: string): s is WildId => (WILD_IDS as string[]).includes(s);
/** 世界坐标 → 局部 / 反过来 */
export const wildW = (id: WildId, lx: number, lz: number) => ({ x: WILD[id].origin.x + lx, z: WILD[id].origin.z + lz });

// ======================================================================  阶段四：翠风前哨补齐功能 NPC（灰石营地的仓库管理员老钱在 web/main.ts 里加）
export const FIELD_SERVICE_NPCS: { id: string; name: string; title: string; role: NpcRole; x: number; z: number; yaw: number; model: string; tint: number }[] = [
  { id: 'lin', name: '林叔', title: '翠风前哨 · 补给商', role: 'supply', x: -10, z: 49, yaw: Math.PI / 2, model: 'Rogue', tint: 0x6a8a4a },
  { id: 'hammer', name: '老锤', title: '翠风前哨 · 铁匠', role: 'smith', x: 4, z: 54.5, yaw: Math.PI, model: 'Barbarian', tint: 0x5a4a3a },
  { id: 'qian_fd', name: '钱小满', title: '翠风前哨 · 仓库管理员', role: 'bank', x: -2, z: 55, yaw: Math.PI, model: 'Rogue', tint: 0x8a7a5a },
];

// ======================================================================  NPC 名字（并入 data/quests.ts 的 NPCS）
export const WILD_NPC_NAMES: Record<string, { name: string; title: string }> = Object.fromEntries(
  [...WILD_IDS.flatMap(id => WILD[id].npcs), ...FIELD_SERVICE_NPCS].map(n => [n.id, { name: n.name, title: n.title }]));

// ======================================================================  掉落表
// v0.5 C：小怪多掉一种灰色杂物（junk，进商人自动卖钱）：赤砂/霜脊 生锈的小饰物，烬落 焦黑的残骸
const trash = (gold: [number, number], junk = 'junk_trinket'): LootTable => ({ id: '', gold, entries: [{ kind: 'random', chance: 0.34 }, { kind: 'random', chance: 0.1, slots: ['shoulder', 'back', 'wrist', 'waist', 'neck', 'ring', 'trinket'] }], stacks: [{ id: 'mat_dust', chance: 0.35, min: 1, max: 2 }, { id: 'mat_shard', chance: 0.08, min: 1, max: 1 }, { id: junk, chance: 0.5, min: 1, max: 2 }] });
const elite = (gold: [number, number], orange: number): LootTable => ({ id: '', gold, entries: [{ kind: 'random', chance: 1, minQuality: 'blue' }, { kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 0.5, minQuality: 'purple', slots: ['neck', 'ring', 'trinket'] }, { kind: 'random', chance: orange, minQuality: 'orange' }], stacks: [{ id: 'mat_shard', chance: 1, min: 2, max: 3 }, { id: 'mat_essence', chance: 0.8, min: 1, max: 2 }] });
const rare = (gold: [number, number], orange: number): LootTable => ({ id: '', gold, entries: [{ kind: 'random', chance: 1, minQuality: 'purple', slots: ['ring', 'trinket', 'neck', 'back'] }, { kind: 'random', chance: orange, minQuality: 'orange' }], stacks: [{ id: 'mat_shard', chance: 1, min: 1, max: 2 }] });
export const WILD_LOOT: Record<string, LootTable> = Object.fromEntries(Object.entries({
  trash_star: trash([10, 18], 'junk_cloth'), elite_star: elite([120, 180], 0.1), rare_star: rare([55, 90], 0.18),
  trash_redsand: trash([14, 24]), elite_redsand: elite([160, 220], 0.12), rare_redsand: rare([70, 110], 0.2),
  trash_frost: trash([16, 28]), elite_frost: elite([180, 240], 0.13), rare_frost: rare([80, 120], 0.22),
  trash_ember: trash([20, 34], 'junk_ash'), elite_ember: elite([220, 320], 0.16), elite_ember2: elite([220, 320], 0.16), rare_ember: rare([100, 150], 0.25),
  event_ember: { id: '', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 0.1, minQuality: 'orange' }], stacks: [{ id: 'mat_essence', chance: 1, min: 1, max: 2 }] } as LootTable,
}).map(([k, t]) => [k, { ...t, id: k }]));

// ======================================================================  任务
/** v0.5 C：取消装备出售后任务金币 ×1.5（docs/economy.md） */
export const QUEST_GOLD_MUL = 1.5;
const q = (id: string, name: string, giver: string, turnIn: string, minLevel: number, requires: string[] | undefined, text: string, doneText: string,
  objectives: QuestDef['objectives'], xp: number, gold: number, item?: QuestDef['reward']['item'], extra: Partial<QuestDef> = {}): QuestDef =>
  // 经验倍率（升级节奏：进赤砂约 18 级 → 出赤砂约 22 → 出霜脊约 25 → 烬落荒原任务 + 悬赏 + 世界事件到 30）
  ({ id, name, giver, turnIn, minLevel, requires, text, doneText, objectives, reward: { xp: Math.round(xp * (minLevel < 24 || id.startsWith('fr_') ? 0.45 : 0.42) / 10) * 10, gold: Math.round(gold * QUEST_GOLD_MUL / 10) * 10, item }, ...extra });
const K = (target: string, count: number, label: string) => ({ type: 'kill' as const, target, count, label });
const C = (target: string, chance: number, count: number, label: string) => ({ type: 'collect' as const, target, chance, count, label });
const E = (area: string, label: string) => ({ type: 'explore' as const, area, label });
const T = (npc: string, label: string) => ({ type: 'talk' as const, npc, label });

export const WILD_QUESTS: QuestDef[] = [
  // ---------------- v0.9.3e 星落高原（16~20，可选：补翠风 → 赤砂的等级断层）
  q('st_news', '星落之夜', 'rowan', 'selen', 15, ['q_field_news'], '原野东边、水车磨坊北面有条山径，通往星落高原。观星者塞伦说那里落了一颗星星，四处都是怪事。', '罗文派你来的？快坐，星星落下来以后，这片高原就没安宁过。', [T('selen', '走原野东侧的星落山径，去观星营地找塞伦')], 1200, 60),
  q('st_wolves', '星斑狼群', 'bram', 'bram', 16, ['st_news'], '西边草原上的星斑狼吃了陨晶，跑得比马还快。帮我削减一下狼群。', '狼嚎声远了。谢谢你。', [K('star_wolf', 10, '击杀星斑狼')], 2000, 80, { minQuality: 'blue' }),
  q('st_shards', '陨晶粉末', 'nia', 'nia', 16, ['st_news'], '陨星坑里的甲虫背上长着陨晶。给我带 6 块，我拿去磨粉入药。', '成色真好，这批药能卖个好价钱。', [C('crystal_beetle', 0.55, 6, '收集陨晶')], 1800, 100),
  q('st_crater', '陨星坑', 'selen', 'selen', 17, ['st_news'], '去东边的陨星坑看看那颗星的核心，顺便打碎几只守着它的甲虫。', '核心在跳动……像一颗心脏。这不是普通的石头。', [E('crater_core', '调查陨星核心'), K('crystal_beetle', 6, '击杀陨晶甲虫')], 2400, 100),
  q('st_observ', '观星台遗迹', 'selen', 'selen', 17, ['st_crater'], '西北的观星台被一伙邪教徒占了，他们在用陨星的力量做法。赶走他们，看看观星台上刻了什么。', '星图……他们在找下一颗要落下的星。', [E('observatory_altar', '调查观星台'), K('star_cultist', 6, '击败观星邪教徒')], 2800, 120, { minQuality: 'blue' }),
  q('st_golems', '会走的陨石', 'dorn', 'dorn', 18, ['st_news'], '陨石傀儡身上的陨铁是打刀的好料。打碎 5 个，把碎片带回来。', '好陨铁！这批刀刃能砍开石头。', [K('meteor_golem', 5, '击碎陨石傀儡')], 2600, 110, { minQuality: 'blue', slots: ['oneHand', 'twoHand', 'offHand'] }),
  q('st_moss', '苔痕林', 'bram', 'bram', 18, ['st_wolves'], '东北的苔痕林里，树人开始拦路了。有人说西南的石环里还有更大的那个……先把小的清一清。', '林子里能走人了。西南古树石环里那个大的——苔石——别一个人去。', [K('moss_treant', 8, '击败苔痕树人')], 2800, 120),
  q('st_faller', '坠星者', 'selen', 'selen', 19, ['st_observ'], '邪教头目欧兰在中央荒地游荡，自称坠星者。除掉他，高原就安静了。', '欧兰倒下了。星星不会再听他的了。', [K('star_faller', 1, '击败坠星者 · 欧兰')], 3800, 200, { minQuality: 'purple' }),
  // ---------------- 赤砂裂谷
  q('rs_news', '赤砂来信', 'rowan', 'mosang', 18, ['q_field_news'], '原野东边的石门能通到赤砂裂谷，驿站长莫桑捎信来要人手。你已经够强了，去吧。', '罗文让你来的？太好了，驿站正缺能打的人。', [T('mosang', '去赤岩驿站找莫桑')], 900, 60),
  q('rs_scorp', '蝎巢清剿', 'mosang', 'mosang', 18, ['rs_news'], '西边的蝎巢平原上，赤砂巨蝎把商队的骆驼都咬死了。帮我清掉一批。', '平原上安静多了，商队能走了。', [K('scorpion', 10, '击杀赤砂巨蝎')], 2200, 90, { minQuality: 'blue' }),
  q('rs_venom', '蝎毒解药', 'tiya', 'tiya', 18, ['rs_news'], '巨蝎的毒囊能做解毒剂。给我带 6 个回来，我给你打个折。', '品相不错，解药够用一阵了。', [C('scorpion', 0.5, 6, '收集巨蝎毒囊')], 1800, 120),
  q('rs_bandits', '沙匪峡谷', 'mosang', 'mosang', 19, ['rs_scorp'], '东边峡谷里的沙匪抢了三支驼队。去教训他们。', '沙匪老实了几天，至少几天。', [K('sand_bandit', 8, '击杀沙匪'), K('sand_archer', 4, '击杀沙匪弩手')], 2600, 110, { minQuality: 'blue' }),
  q('rs_ruins', '赤岩遗迹', 'mosang', 'mosang', 20, ['rs_bandits'], '西北的赤岩遗迹里有傀儡在动。去看看祭坛，顺手打碎几个傀儡。', '祭坛在发光？看来有东西把它们唤醒了。', [E('red_ruins_altar', '调查赤岩祭坛'), K('red_golem', 5, '击碎赤岩傀儡')], 2900, 120),
  q('rs_crystal', '火晶山脊', 'balo', 'balo', 19, ['rs_news'], '山脊上的火晶精怪身上有好火晶，打铁正好用。带 5 块来。', '好东西！这火晶能把钢烧得通红。', [C('fire_sprite', 0.6, 5, '收集火晶')], 2400, 100, { minQuality: 'blue', slots: ['oneHand', 'twoHand', 'offHand'] }),
  q('rs_lord', '沙暴之主', 'mosang', 'mosang', 21, ['rs_ruins'], '沙匪头子卡鲁在中央荒地游荡，身边风沙不散。除掉他，赤砂就太平了。', '卡鲁倒下了！你是赤岩驿站的恩人。', [K('sand_lord', 1, '击败沙暴之主 · 卡鲁')], 4200, 220, { minQuality: 'purple' }),
  q('fr_news', '北方山口', 'mosang', 'hela', 21, ['rs_ruins'], '北边的霜脊山口通往霜脊高地。寨主赫拉托人带话，说山上出了怪事。', '驿站来的？正好，上山的路不好走，你能到这里就说明有本事。', [T('hela', '翻过霜脊山口，找霜脊营寨的赫拉')], 1600, 80),
  // ---------------- 霜脊高地
  q('fr_wolves', '松林狼径', 'nord', 'nord', 22, ['fr_news'], '西边松林里的霜鬃狼越来越大胆。帮我削减一下狼群。', '狼嚎声远了。谢了。', [K('frost_wolf', 10, '击杀霜鬃狼')], 2800, 110, { minQuality: 'blue' }),
  q('fr_pelts', '保暖的毛皮', 'suli', 'suli', 22, ['fr_news'], '营寨的人冻得受不了，狼皮最暖和。带 6 张回来。', '这下大家能睡个暖觉了。', [C('frost_wolf', 0.55, 6, '收集霜狼毛皮')], 2400, 130),
  q('fr_lake', '冰湖异象', 'hela', 'hela', 23, ['fr_news'], '东边冰湖上出现了会走的冰晶。去打碎几个，看看是怎么回事。', '冰晶里有符文……是霜誓教徒干的。', [K('ice_elemental', 6, '击碎冰晶元素')], 3000, 120),
  q('fr_spire', '冰晶尖塔', 'hela', 'hela', 23, ['fr_lake'], '霜誓教徒在东北的冰晶尖塔聚集。去尖塔底座看看，把教徒赶走。', '尖塔的寒气弱了。你干得漂亮。', [E('ice_spire_top', '调查冰晶尖塔'), K('frost_cultist', 6, '击败霜誓教徒')], 3300, 140, { minQuality: 'blue' }),
  q('fr_trolls', '巨魔洞口', 'nord', 'nord', 23, ['fr_wolves'], '西北的洞口里住着冰原巨魔。它们最近开始抢营寨的柴火。', '巨魔的脚印终于不往这边来了。', [K('ice_troll', 6, '击杀冰原巨魔')], 3500, 150, { minQuality: 'blue' }),
  q('fr_fang', '霜牙狼王', 'nord', 'nord', 23, ['fr_trolls'], '狼群的头领霜牙在中央雪原游荡，比马还大。只有你能对付它。', '霜牙倒了？我这辈子的猎人故事算是讲完了。', [K('frost_fang', 1, '击败霜牙 · 狼王')], 5000, 260, { minQuality: 'purple' }),
  q('fr_core', '冰晶之核', 'gunn', 'gunn', 22, ['fr_news'], '冰晶元素的核心冷得能让钢水瞬间凝固。帮我带 5 颗回来淬火。', '好核！这批刀刃能砍开冰原巨魔的皮。', [C('ice_elemental', 0.6, 5, '收集冰晶之核')], 2600, 120, { minQuality: 'blue', slots: ['oneHand', 'twoHand', 'offHand'] }),
  q('fr_patrol', '雪原巡逻', 'hela', 'hela', 22, ['fr_news'], '新来的都要巡一遍山：去松林狼径和巨魔洞口看看，回来告诉我路上的情况。', '狼和巨魔都在，路还算通。你记性不错。', [E('wolf_pines', '巡视松林狼径'), E('troll_cave', '巡视巨魔洞口')], 2000, 90),
  q('em_news', '烬落裂隙', 'hela', 'kairen', 24, ['fr_spire'], '高地北边的裂隙下面就是烬落荒原，满是灰烬和熔岩。凯伦指挥官在烬火堡垒等援手。', '你就是从霜脊下来的勇士？欢迎来到世界的尽头。', [T('kairen', '穿过烬落裂隙，找烬火堡垒的凯伦')], 2200, 100),
  // ---------------- 烬落荒原（烬火堡垒）
  q('em_hounds', '余烬猎犬', 'kairen', 'kairen', 24, ['em_news'], '东北的猎犬巢里，余烬猎犬成群结队。先把它们打散。', '猎犬退回巢里了，补给线能喘口气。', [K('ember_hound', 12, '击杀余烬猎犬')], 3800, 150, { minQuality: 'blue' }),
  q('em_ashplain', '灰烬平原', 'kairen', 'kairen', 24, ['em_news'], '西北的灰烬平原上，焦骨战士从灰里爬出来。去清一清。', '平原上暂时没有骨头在动了。', [K('charred', 8, '击败焦骨战士'), K('lava_spawn', 4, '击杀熔岩幼体')], 4000, 160),
  q('em_embers', '余烬之心', 'yan', 'yan', 24, ['em_news'], '猎犬体内有一颗还在发烫的余烬核心。给我 6 颗，我要研究它们。', '每一颗都在跳动……像心脏一样。', [C('ember_hound', 0.5, 6, '收集余烬核心')], 3600, 140),
  q('em_rift', '熔岩裂谷', 'yan', 'yan', 25, ['em_embers'], '荒原中央的熔岩裂谷隔一阵就会喷发。去裂谷边看看，记下地火的走向。', '喷发有规律！熔岩喷发时一起出手，能拿到好东西。', [E('lava_rift', '调查熔岩裂谷')], 3000, 120),
  q('em_golems', '熔岩魔像', 'yan', 'yan', 26, ['em_rift'], '裂谷边的熔岩魔像在守着什么。打碎它们，带回它们的熔核碎片。', '碎片里的火还没熄……这不是自然形成的。', [K('magma_golem', 6, '击碎熔岩魔像'), C('magma_golem', 0.7, 4, '收集熔核碎片')], 4800, 190, { minQuality: 'blue' }),
  q('em_heart', '熔核巨像', 'kairen', 'kairen', 27, ['em_golems'], '一尊巨大的熔核巨像在裂谷南边游荡，所有魔像都跟着它。毁掉它。', '炽心倒下了，整片荒原都在震动。', [K('flame_heart', 1, '击败熔核巨像 · 炽心')], 7500, 360, { minQuality: 'purple' }),
  q('em_scholar', '王座与墓穴', 'kairen', 'scholar', 27, ['em_golems'], '南边的熔心王座、霜脊冰晶尖塔后的永霜墓穴，都是古老的大门。墨言知道得最多，去问问他。', '你想知道王座和墓穴的事？坐下，故事很长。', [T('scholar', '找副本学者墨言'), E('molten_gate', '去熔心王座入口看看'), E('frost_gate', '去永霜墓穴入口看看（霜脊高地）')], 4200, 200),
  // ---------------- 烬落荒原（灰烬前哨）
  q('em_east', '东边的前哨', 'kairen', 'rook', 25, ['em_news'], '东边的灰烬前哨快撑不住了，去帮帮哨长洛克。', '援兵？就你一个？……好吧，一个能顶十个就行。', [T('rook', '去灰烬前哨找洛克')], 2000, 90),
  q('em_brutes', '黑曜蛮兽', 'rook', 'rook', 26, ['em_east'], '南边山脊上的黑曜蛮兽在冲撞前哨的栅栏。打退它们。', '栅栏保住了。你力气真大。', [K('obsidian_brute', 6, '击败黑曜蛮兽')], 5200, 200, { minQuality: 'blue' }),
  q('em_obsidian', '黑曜石荒地', 'rook', 'rook', 26, ['em_east'], '东南的荒地上到处是黑曜石。蛮兽身上嵌着最好的那种，带几块回来做箭头。', '这箭头能射穿魔像的外壳。', [C('obsidian_brute', 0.6, 5, '收集黑曜石')], 4600, 180),
  q('em_scout', '东南瞭望岩', 'rook', 'rook', 27, ['em_brutes'], '东南角的瞭望岩能看到整片荒地。去那里看看有没有新的敌人。', '你说看到了一只黑色的巨蝎？那是蝎王，小心它。', [E('scout_ridge', '登上东南瞭望岩')], 3400, 150),
  // ---------------- 烬落荒原（熔痕营地）
  q('em_west', '熔痕营地', 'kairen', 'mira', 25, ['em_news'], '西边的熔痕营地在监视灰烬教团。祭司米拉需要帮手。', '凯伦派你来的？教团的事，我们得抓紧。', [T('mira', '去熔痕营地找米拉')], 2000, 90),
  q('em_cult', '灰烬教团', 'mira', 'mira', 26, ['em_west'], '教团在西边的祭坛上做法，召唤火焰。打断他们，看看祭坛中心有什么。', '祭坛上的符文……他们在唤醒熔心王座里的东西。', [K('ash_cultist', 8, '击败灰烬教徒'), E('cult_altar_core', '调查教团祭坛中心')], 5000, 200, { minQuality: 'blue' }),
  q('em_bones', '焦骨墓场', 'mira', 'mira', 27, ['em_west'], '西南的焦骨墓场里，死者不得安宁。让它们安息。', '墓场安静了。愿他们终于能休息。', [K('charred', 12, '让焦骨战士安息')], 5400, 210),
  q('em_priest', '灰烬祭司长', 'mira', 'mira', 28, ['em_cult'], '教团首领赛勒就在祭坛附近。打败他，教团就散了。', '赛勒死了，但他召唤的东西……还在王座深处等着。', [K('ash_priest', 1, '击败灰烬祭司长 · 赛勒')], 8000, 380, { minQuality: 'purple' }),
  // ---------------- 悬赏（可反复完成）
  q('bt_hounds', '悬赏：猎犬', 'bounty', 'bounty', 24, ['em_news'], '悬赏：击杀 12 只余烬猎犬。可反复领取。', '悬赏完成，赏金已发放。', [K('ember_hound', 12, '击杀余烬猎犬')], 2600, 160, undefined, { repeatable: true }),
  q('bt_cult', '悬赏：教徒', 'bounty', 'bounty', 25, ['em_news'], '悬赏：击败 10 名灰烬教徒。可反复领取。', '悬赏完成，赏金已发放。', [K('ash_cultist', 10, '击败灰烬教徒')], 2800, 170, undefined, { repeatable: true }),
  q('bt_golems', '悬赏：魔像', 'bounty', 'bounty', 26, ['em_news'], '悬赏：打碎 8 个熔岩魔像。可反复领取。', '悬赏完成，赏金已发放。', [K('magma_golem', 8, '击碎熔岩魔像')], 3200, 200, undefined, { repeatable: true }),
  q('bt_brutes', '悬赏：蛮兽', 'bounty', 'bounty', 27, ['em_news'], '悬赏：击败 8 只黑曜蛮兽。可反复领取。', '悬赏完成，赏金已发放。', [K('obsidian_brute', 8, '击败黑曜蛮兽')], 3400, 220, undefined, { repeatable: true }),
];

/** 怪物种类 → 击杀区域（任务指引用） */
export const WILD_KILL_AREA: Record<string, string> = {
  ...Object.fromEntries(PACK_WILD_IDS.flatMap(id => Object.entries(WILD[id as WildId].killArea ?? {}))),   // v1.0.3 内容包野外
  fh_wolf: 'fh_slope', fh_spider: 'fh_slope', fh_miner: 'fh_slope', mr_toad: 'mr_pool', mr_treant: 'mr_pool', mr_cultist: 'mr_pool',   // v0.9.2b 副本区
  star_wolf: 'star_meadow', crystal_beetle: 'crater', star_cultist: 'observatory', meteor_golem: 'observatory', moss_treant: 'moss_woods', star_faller: 'faller_route', star_stag: 'star_meadow',
  scorpion: 'scorpion_flats', sand_bandit: 'bandit_canyon', sand_archer: 'bandit_canyon', red_golem: 'red_ruins', fire_sprite: 'crystal_ridge', sand_lord: 'sandstorm_route', amber_scorpion: 'scorpion_flats',
  frost_wolf: 'wolf_pines', ice_elemental: 'frozen_lake', frost_cultist: 'ice_spire', ice_troll: 'troll_cave', frost_fang: 'fang_route', white_mammoth: 'wolf_pines',
  ember_hound: 'hound_den', ash_cultist: 'cult_altar', lava_spawn: 'ash_plain', charred: 'ash_plain', magma_golem: 'lava_rift', obsidian_brute: 'brute_ridge', flame_heart: 'heart_route', ash_priest: 'cult_altar', obsidian_king: 'obsidian_waste',
};
/** 地点 id → 所在地图（AREAS 合并时用） */
export function wildAreas(): Record<string, { map: WildId; x: number; z: number; r: number; name: string }> {
  const out: Record<string, { map: WildId; x: number; z: number; r: number; name: string }> = {};
  for (const id of WILD_IDS) for (const [k, s] of Object.entries(WILD[id].spots)) out[k] = { map: id, ...wildW(id, s.x, s.z), r: s.r, name: s.name };
  // 焦骨墓场的焦骨战士也算灰烬平原的任务区：任务指引用最近的
  return out;
}
