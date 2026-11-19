// 阶段六（v0.6.0）：满级单人长副本「熔心王座」—— 数据（数值、布局、台词、攻略、掉落）
// 设计原则（plan.md 6.1 / 6.1b）：
//   - 30 级才能进，5 个首领；小怪全是精英、各带一个小机制
//   - 每个首领倒下 = 存档点，阵亡从最近存档点重来，当前首领回满血
//   - 机制不依赖职业独占技能：统一靠「打破护盾（打伤害）」「翻滚」「走位」「选对目标」解决
//   - 近战补偿：首领身边始终有能站的位置（红圈不会铺满首领脚下，熔岩波缺口每次都在首领附近）
import type { LootTable } from '../core/Loot';

export type RaidId = 'molten_throne' | 'frost_crypt' | 'sand_tomb' | 'troll_cave' | 'ash_forge';
/** 长副本（5 首领）；普通副本（v0.6.5 起，kind = 'dungeon'）只有这两个之外的 id */
export const LONG_RAIDS: RaidId[] = ['molten_throne', 'frost_crypt'];

/** 精英小怪的机制 */
export type EliteMech = 'guard' | 'bomber' | 'healer' | 'totem' | 'berserk' | 'slag' | 'offering' | 'clone' | 'prison';

export interface RaidMob {
  name: string; model: string; tint: number; tintK?: number; glow?: number; scale?: number;
  hp: number; dmg: number; interval: number; speed: number; range: number; aggro: number;
  xp: number; eliteXp: number; mech: EliteMech; ranged?: boolean; shot?: { color: number; el: 'fire' | 'physical' | 'frost' | 'shadow' };
}

/** 机制说明（第一次遇到时屏幕上方提示一次；攻略里也会列出） */
export const MECH_TIPS: Record<EliteMech, string> = {
  guard: '盾卫：正面几乎免伤（-85%），绕到它背后打；它转身很慢',
  bomber: '熔渣自爆者：死后 2 秒原地爆炸，打完立刻离开红圈',
  healer: '治疗祭司：读条给周围的怪回血。优先集火——读条时打掉它 12% 生命就能打断',
  totem: '熔火图腾：附近的怪受到伤害 -50%，先拆图腾',
  berserk: '狂兽：生命低于 30% 狂暴、攻速翻倍，翻滚拉开或者趁狂暴前集火',
  slag: '熔渣：正往熔炉爬！爬进去首领回血并狂暴，必须拦下',
  offering: '祭品：大祭司的献祭材料，放着不管会让「炎狱献祭」的护盾更厚',
  clone: '镜像：维瑟拉的幻影，打它会在你脚下触发冰霜新星。只有脚下带影子的是真身',
  prison: '冰柱囚笼：你被冻在原地，打碎冰柱才能出来（8 秒内打不碎会受重伤）',
};

const L = 30;
export const bossScale = (list: RaidBossDef[]) => list.map(b => ({ ...b, hp: b.hp * RAID_BOSS_HP, dmg: Math.round(b.dmg * RAID_BOSS_DMG) }));
/** 第一版平衡（v0.6.0，30 级紫装/橙装机器人约 1.3 万生命）：小怪生命 ×3、伤害 ×2.5，首领生命 ×4、近战 ×3；机制伤害按玩家最大生命百分比 */
export const RAID_MOB_HP = 3, RAID_MOB_DMG = 2.5, RAID_BOSS_HP = 4, RAID_BOSS_DMG = 3;
export const mob = (name: string, model: string, mech: EliteMech, o: Partial<RaidMob>): RaidMob => {
  const m = { name, model, mech, tint: 0x3a2018, tintK: 0.5, hp: 3000, dmg: 72, interval: 2.1, speed: 3.6, range: 2.3, aggro: 13, xp: 260, eliteXp: 6, ...o };
  return { ...m, hp: Math.round(m.hp * RAID_MOB_HP), dmg: Math.round(m.dmg * RAID_MOB_DMG) };
};
export const RAID_LEVEL = L;

// ---------------------------------------------------------------- 熔心王座
export const MOLTEN_MOBS: Record<string, RaidMob> = {
  mt_guard: mob('熔铸盾卫', 'brute', 'guard', { tint: 0x2a1a14, glow: 0x3a0e00, scale: 1.15, hp: 3400, dmg: 70, speed: 3.0 }),
  mt_bomber: mob('熔渣自爆者', 'toad', 'bomber', { tint: 0xff5a10, tintK: 0.65, glow: 0x7a2000, hp: 2100, dmg: 58, speed: 4.4, interval: 1.6 }),
  mt_healer: mob('炎誓治疗祭司', 'cultist', 'healer', { tint: 0x6a1a10, glow: 0x3a0800, hp: 2500, dmg: 52, ranged: true, range: 10, interval: 2.4, shot: { color: 0xff7a30, el: 'fire' } }),
  mt_totem: mob('熔火图腾', 'golem', 'totem', { tint: 0x1a1210, glow: 0xa03000, scale: 0.8, hp: 1500, dmg: 0, interval: 99, speed: 0, range: 0, aggro: 0 }),
  mt_berserk: mob('黑曜狂兽', 'wolf', 'berserk', { tint: 0x1a1418, tintK: 0.7, glow: 0x5a0a00, scale: 1.45, hp: 3000, dmg: 66, interval: 1.7, speed: 5.0 }),
  // 首领召唤物
  mt_slag: mob('熔渣', 'toad', 'slag', { tint: 0xff7a20, tintK: 0.7, glow: 0xa03000, scale: 0.6, hp: 520, dmg: 0, interval: 99, speed: 2.1, range: 0, aggro: 0, xp: 20, eliteXp: 0 }),
  mt_offering: mob('献祭者', 'cultist', 'offering', { tint: 0x8a6a5a, tintK: 0.5, scale: 0.85, hp: 900, dmg: 40, speed: 3.2, xp: 40, eliteXp: 0 }),
};

/** 布局（局部坐标，原点 = 副本入口；沿 -z 推进）：入口大厅 → 5 ×（走廊 + 首领场地） */
export interface RaidRoom { corridor: [number, number]; arena: { z: number; r: number }; pack: { kind: string; x: number; z: number }[] }
export const RAID_ORIGIN = { x: -800, z: 0 };
export const CORRIDOR_HALF = 5.5;

export interface RaidBossDef {
  id: string; name: string; title: string; hp: number; dmg: number; interval: number; speed: number; range: number;
  model: string; tint: number; tintK?: number; glow?: number; scale: number;
  xp: number; eliteXp: number; enrage?: number;
  phases: string[];
  lines: { intro: string; phase?: string[]; big?: string; kill: string; death: string };
  guide: { mechanics: string[]; tips: string[]; ilvl: number };
}

/** 首领（数值第一版，阶段八再整体平衡；ilvl = 攻略里显示的推荐平均装等） */
export const MOLTEN_BOSSES: RaidBossDef[] = ([
  { id: 'gorak', name: '熔铸者 戈拉克', title: '第一首领', hp: 30000, dmg: 96, interval: 2.2, speed: 3.4, range: 3.0, model: 'brute', tint: 0x3a2014, glow: 0x5a1800, scale: 1.7, xp: 3000, eliteXp: 120,
    phases: ['锻炉', '烈焰锻炉'],
    lines: { intro: '又一块好铁料……放进炉子里，看看能炼出什么！', phase: ['炉火！烧得更旺些！'], big: '大地，裂开！', kill: '回炉重造吧。', death: '炉火……熄了……' },
    guide: { ilvl: 30, mechanics: ['三连地裂：朝你的方向依次落下三个红圈，往侧面走就能躲开', '熔渣：每掉 30% 血，场边冒出 3 个熔渣往中央熔炉爬。爬进去首领回 6% 血并狂暴 12 秒'],
      tips: ['熔渣血很少，看到就切目标', '近战贴着首领侧面打，地裂是直线，侧移一步就躲掉'] } },
  { id: 'twins', name: '双生焰灵 伊格与妮丝', title: '第二首领', hp: 17000, dmg: 70, interval: 1.9, speed: 3.8, range: 2.6, model: 'cultist', tint: 0xff6a20, tintK: 0.55, glow: 0x7a2000, scale: 1.5, xp: 3200, eliteXp: 130,
    phases: ['双生', '孤焰'],
    lines: { intro: '伊格：哥哥在这里。妮丝：妹妹也在。——一起烧掉你！', phase: ['伊格：妮丝！', '妮丝：伊格！'], big: '妮丝：过来，到火里来！', kill: '伊格：太轻了，连灰都不剩。', death: '妮丝：伊格……我们……又分开了……' },
    guide: { ilvl: 31, mechanics: ['两个首领血量差超过 10%，血多的那个狂暴（伤害 +60%）——要轮流打，保持血量接近', '伊格走过的地方留下火焰轨迹，别站在火里', '妮丝读条「烈焰牵引」把你拉到身边，拉完紧接一个脚下红圈，翻滚出去'],
      tips: ['看头顶两条血条，谁血多打谁', '一个先死后，另一个进入「孤焰」，伤害提高但不再狂暴'] } },
  { id: 'samur', name: '岩鳞巨蜥 萨穆尔', title: '第三首领', hp: 36000, dmg: 104, interval: 2.3, speed: 3.6, range: 3.2, model: 'spider', tint: 0x4a3020, tintK: 0.6, glow: 0x3a1000, scale: 2.4, xp: 3400, eliteXp: 140,
    phases: ['岩鳞', '碎鳞'],
    lines: { intro: '（低沉的嘶吼，地面在颤抖）', big: '（刨地声——它要冲锋了！）', kill: '（巨蜥甩了甩尾巴）', death: '（巨蜥轰然倒地，鳞片碎了一地）' },
    guide: { ilvl: 32, mechanics: ['冲锋：刨地 1.4 秒后朝你冲过去，路径上有红色预警', '撞上石柱：眩晕 8 秒、护甲破碎（受到伤害 +50%）——这是主要输出窗口', '场上持续落石红圈'],
      tips: ['站在石柱前面，看到冲锋预警往侧面走或翻滚，让它撞柱子', '石柱撞 2 次会碎，4 根柱子要省着用'] } },
  { id: 'priest', name: '炎誓大祭司 卡萨', title: '第四首领', hp: 38000, dmg: 88, interval: 2.2, speed: 3.2, range: 2.8, model: 'cultist', tint: 0x5a0a08, tintK: 0.6, glow: 0x6a1000, scale: 1.8, xp: 3600, eliteXp: 150,
    phases: ['誓火', '献祭'],
    lines: { intro: '王座需要祭品，而你自己走了进来。', phase: ['献祭者们，把血献给王座！'], big: '炎狱……献祭！', kill: '你的灵魂，会在王座下燃烧。', death: '陛下……我的火……先熄了……' },
    guide: { ilvl: 33, mechanics: ['炎狱献祭：读条 6 秒，身上出一层护盾。读完前打掉护盾就打断；没打掉 = 全屏高额火焰伤害', '每个活着的献祭者让护盾变厚 25%（护盾约为首领生命的 1.2%）', '火焰喷发：脚下红圈'],
      tips: ['献祭者出现后先清掉再打首领', '护盾读条时开爆发技能'] } },
  { id: 'valkaz', name: '熔心君王 瓦尔卡兹', title: '最终首领', hp: 34000, dmg: 112, interval: 2.4, speed: 3.4, range: 3.4, model: 'brute', tint: 0x1a0a08, tintK: 0.7, glow: 0xa02800, scale: 2.1, xp: 6000, eliteXp: 300, enrage: 360,
    phases: ['熔岩之潮', '崩塌王庭', '王座崩塌'],
    lines: { intro: '凡人。你踏上的每一级台阶，都是我的王座。', phase: ['地面，替我吞掉他！', '够了——一切，都在熔心面前崩塌！'], big: '跪下，在熔心面前！', kill: '熔心永燃。', death: '王座……不会……熄灭……' },
    guide: { ilvl: 34, mechanics: ['一阶段「熔岩之潮」：一排排熔岩波推过来，找到缺口穿过去（或翻滚穿过）', '二阶段「崩塌王庭」（70%）：外圈地板一块块塌成熔岩，安全区越来越小', '三阶段「王座崩塌」（30%）：全场大红圈，只有发光的符文能站，符文位置每次随机', '6 分钟后狂暴'],
      tips: ['熔岩波缺口每次都在首领附近，近战跟着首领走就行', '三阶段听到「跪下」立刻找符文'] } },
] as RaidBossDef[]).map(b => ({ ...b, hp: b.hp * RAID_BOSS_HP, dmg: Math.round(b.dmg * RAID_BOSS_DMG) }));

export const MOLTEN_ROOMS: RaidRoom[] = [
  { corridor: [-33, -10], arena: { z: -48, r: 15 }, pack: [{ kind: 'mt_guard', x: 0, z: -20 }, { kind: 'mt_bomber', x: -2.5, z: -23 }, { kind: 'mt_bomber', x: 2.5, z: -23 }] },
  { corridor: [-86, -63], arena: { z: -101, r: 15 }, pack: [{ kind: 'mt_healer', x: 0, z: -78 }, { kind: 'mt_berserk', x: -2.5, z: -73 }, { kind: 'mt_bomber', x: 2.5, z: -73 }] },
  { corridor: [-139, -116], arena: { z: -155, r: 16 }, pack: [{ kind: 'mt_totem', x: 0, z: -130 }, { kind: 'mt_guard', x: -2.5, z: -126 }, { kind: 'mt_berserk', x: 2.5, z: -126 }] },
  { corridor: [-195, -171], arena: { z: -210, r: 15 }, pack: [{ kind: 'mt_healer', x: 0, z: -186 }, { kind: 'mt_guard', x: 0, z: -181 }, { kind: 'mt_bomber', x: -3, z: -182 }, { kind: 'mt_bomber', x: 3, z: -182 }] },
  { corridor: [-249, -225], arena: { z: -266, r: 17 }, pack: [{ kind: 'mt_totem', x: 0, z: -243 }, { kind: 'mt_healer', x: -3, z: -240 }, { kind: 'mt_berserk', x: 3, z: -236 }, { kind: 'mt_guard', x: 0, z: -235 }] },
];
/** 第三首领场地的 4 根石柱（相对场地圆心） */
export const SAMUR_PILLARS: [number, number][] = [[-8, -6], [8, -6], [-8, 6], [8, 6]];

export interface RaidDef {
  origin: { x: number; z: number }; theme: 'molten' | 'frost' | 'sand' | 'troll' | 'forge'; explore: 'dungeon' | 'frost';
  /** v0.6.5：'dungeon' = 普通副本（四难度 / 誓约 / 遗物 / 异变 / 奖牌），默认长副本 */
  kind?: 'raid' | 'dungeon';
  /** 入口所在的野外地图（默认烬落荒原） */
  wild?: 'redsand' | 'frost' | 'ember';
  /** 红圈 / 地面区域的元素（默认 frost 主题冰霜，其它火焰） */
  el?: 'fire' | 'frost' | 'physical' | 'nature' | 'shadow';
  /** 隐藏首领：bosses / rooms 的最后一个，条件满足才开门 */
  hidden?: { room: number; hint: string };
  palette: { sea: number; stone: number; stone2: number; rim: number; ring: number; torch: number; rock: number; wall: number; zone: string; zoneRing: string };
  id: RaidId; name: string; level: number; desc: string; mobs: Record<string, RaidMob>; bosses: RaidBossDef[]; rooms: RaidRoom[];
  look: { bg: number; fogNear: number; fogFar: number; hemi: number; ground: number; hemiI: number; sun: number };
}
export const MOLTEN_THRONE: RaidDef = {
  id: 'molten_throne', name: '熔心王座', level: 30, desc: '30 级单人长副本 · 5 个首领 · 熔岩与王权',
  mobs: MOLTEN_MOBS, bosses: MOLTEN_BOSSES, rooms: MOLTEN_ROOMS,
  origin: RAID_ORIGIN, theme: 'molten', explore: 'dungeon',
  palette: { sea: 0xff4a10, stone: 0x3a2c28, stone2: 0x2a1e1c, rim: 0x1a1210, ring: 0xff7a30, torch: 0xff7a3a, rock: 0x2a1e1a, wall: 0xff5a10, zone: '#ff5a10', zoneRing: '#ffb040' },
  look: { bg: 0x1a0806, fogNear: 14, fogFar: 62, hemi: 0xff9a6a, ground: 0x2a0a04, hemiI: 0.75, sun: 0.55 },
};

/** 每周第一次通关奖励加倍（按周一 0 点重置，玩家本地时间） */
export function weekKey(ms: number): number {
  const d = new Date(ms); const day = (d.getDay() + 6) % 7;
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime() / 86400000);
}

// ---------------------------------------------------------------- 掉落表（套装 / 暗金在阶段五系统整合后接入）
export const RAID_LOOT: Record<string, LootTable> = {
  raid_trash: { id: 'raid_trash', gold: [40, 70], entries: [{ kind: 'random', chance: 0.4, minQuality: 'blue' }, { kind: 'random', chance: 0.08, minQuality: 'purple' }], stacks: [{ id: 'mat_shard', chance: 0.5, min: 1, max: 2 }, { id: 'mat_essence', chance: 0.15, min: 1, max: 1 }] },
  raid_boss: { id: 'raid_boss', gold: [600, 900], entries: [{ kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 1, minQuality: 'purple', slots: ['neck', 'ring', 'trinket', 'back'] }, { kind: 'random', chance: 0.3, minQuality: 'orange' }], stacks: [{ id: 'mat_essence', chance: 1, min: 2, max: 4 }, { id: 'mat_shard', chance: 1, min: 3, max: 5 }] },
  // v0.6.5 普通副本（三首领）：装等由难度决定
  dg_trash: { id: 'dg_trash', gold: [20, 40], entries: [{ kind: 'random', chance: 0.3, minQuality: 'blue' }, { kind: 'random', chance: 0.05, minQuality: 'purple' }], stacks: [{ id: 'mat_shard', chance: 0.4, min: 1, max: 1 }] },
  dg_boss: { id: 'dg_boss', gold: [250, 400], entries: [{ kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 0.5, minQuality: 'blue', slots: ['neck', 'ring', 'trinket', 'back'] }, { kind: 'random', chance: 0.12, minQuality: 'orange' }], stacks: [{ id: 'mat_essence', chance: 1, min: 1, max: 2 }, { id: 'mat_shard', chance: 1, min: 2, max: 3 }] },
  dg_final: { id: 'dg_final', gold: [500, 800], entries: [{ kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 0.3, minQuality: 'orange' }], stacks: [{ id: 'mat_essence', chance: 1, min: 2, max: 4 }] },
  raid_final: { id: 'raid_final', gold: [1500, 2200], entries: [{ kind: 'random', chance: 1, minQuality: 'orange' }, { kind: 'random', chance: 1, minQuality: 'purple' }, { kind: 'random', chance: 1, minQuality: 'purple', slots: ['neck', 'ring', 'trinket'] }, { kind: 'random', chance: 0.35, minQuality: 'orange' }], stacks: [{ id: 'mat_essence', chance: 1, min: 5, max: 8 }] },
};
