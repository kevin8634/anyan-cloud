// ======================================================================
// v0.9.3d 野外世界首领（方案：docs/设计/野外地图.md 第 4 节）
//   4 个首领：苔石（19，星落高原古树石环；v0.9.3d 暂住翠风坍塌神殿，v0.9.3e 搬家）/ 萨卡尔（26，赤砂）/ 尤尔格（28，霜脊）/ 炽翼（30，烬落）
//   刷新：按真实时间（存档 wboss），出现前 2 分钟全区喊话 + 地图倒计时；炽翼另外在「熔岩喷发」平息后 2 分钟必刷
//   掉落：专属掉落表（只在该首领掉，不进任何随机池）= 2 件专属橙装（各 12%）+ 首领精魄；精魄满 10 自动凝成一件专属橙装（保底）
//   每日首杀：额外 1 件史诗以上 + 精魄翻倍
// 机制走 core/BossBrain（红圈 / 读条 / 召唤 / 毒池 / 阶段），表现在 web/worldboss.ts
// ======================================================================
import type { BossDef } from '../core/BossBrain';
import type { ItemDef } from '../core/Loadout';
import type { ModifierDef } from '../core/types';
import type { LootTable } from '../core/Loot';
import type { WildMob } from './zones_wild';

export type WorldBossId = 'wb_moss' | 'wb_worm' | 'wb_yurg' | 'wb_ash';
export const WB_IDS: WorldBossId[] = ['wb_moss', 'wb_worm', 'wb_yurg', 'wb_ash'];

export interface WorldBossDef {
  id: WorldBossId; name: string; title: string; level: number;
  /** 所在地图：field = 翠风原野（世界坐标 = FIELD_ORIGIN + 局部），其余 = 野外图（世界坐标 = 区域原点 + 局部） */
  map: 'field' | 'star' | 'redsand' | 'frost' | 'ember';
  /** 竞技场中心（局部坐标）与半径：外环怪群不放进来（zones_wild.ts layoutWild） */
  x: number; z: number; r: number;
  arena: string;               // 竞技场名字（地图 / 喊话）
  respawnMin: number;          // 刷新（分钟）
  mob: Omit<WildMob, 'loot'>;
  boss: BossDef;
  /** 召唤物（kind → 外观 / 数值），web/worldboss.ts 注册进 ENEMY_TYPES */
  adds: Record<string, Omit<WildMob, 'loot'>>;
  soul: string;                // 首领精魄（材料 id）
  uniques: string[];           // 专属橙装（固定装备 id）
  theme: 'nature' | 'stone' | 'frost' | 'fire';
  yells: { warn: string; spawn: string; death: string };
}

const fx = (id: string, desc: string, m: Omit<ModifierDef, 'id' | 'name' | 'source' | 'desc'>): ModifierDef => ({ id, name: desc, source: 'equipment', desc, ...m });
export type WbItem = ItemDef & { baseId: string; affixes: number; wb: WorldBossId; flavor: string };
const slotOf: Record<string, ItemDef['slot']> = { b_idol: 'trinket', b_cloak: 'back', b_amulet: 'neck', b_ring: 'ring', b_signet: 'ring', b_necklace: 'neck' };
const item = (id: string, name: string, baseId: string, wb: WorldBossId, flavor: string, mods: ModifierDef[]): WbItem =>
  ({ id, name, baseId, slot: slotOf[baseId], quality: 'orange', modifiers: mods, affixes: 3, wb, flavor });

// ---------------------------------------------------------------- 专属橙装（8 件，首饰 / 披风，四职业通用）
export const WB_ITEMS: WbItem[] = [
  item('wb_moss_seed', '苔石之种', 'b_idol', 'wb_moss', '种子里有一整座森林在睡觉。', [
    fx('mossseed', '技能 2 命中时生成藤蔓护盾（最大生命 8%，4 秒）', { match: { slots: ['skill2'] }, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.08, duration: 4 } }] }),
    fx('mossseed2', '自然伤害 +15%', { match: { elements: ['nature'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('wb_moss_cloak', '古树根须披风', 'b_cloak', 'wb_moss', '苔石倒下时，根须还缠着你的脚踝。', [
    fx('mossroot', '范围技能留下缠绕根须（2.6 米，3 秒，自然持续伤害）', { match: { tagsAny: ['aoe'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'nature', dps: 34, radius: 2.6, duration: 3 } }] }),
    fx('mossroot2', '范围技能使敌人减速 30%（2 秒）', { match: { tagsAny: ['aoe'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 2 } }] }),
  ]),
  item('wb_worm_amulet', '巨蠕甲晶护符', 'b_amulet', 'wb_worm', '甲晶还在发烫，像刚从沙底钻出来。', [
    fx('wormspike', '技能 1 命中后从地下刺出沙刺（半径 2.5，45% 伤害）', { match: { slots: ['skill1'] }, ops: [{ op: 'addEffect', effect: { type: 'explode', radius: 2.5, damagePercent: 0.45 } }] }),
    fx('wormspike2', '技能 1 伤害 +20%', { match: { slots: ['skill1'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.2 }] }),
  ]),
  item('wb_worm_ring', '流沙之握', 'b_ring', 'wb_worm', '握紧它，脚下的沙子就开始往下陷。', [
    fx('quicksand', '技能 1~3 命中使敌人减速 30%（3 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.3, duration: 3 } }] }),
    fx('quicksand2', '对减速中的敌人伤害 +15%', { match: {}, conditions: [{ type: 'targetHasEffect', effect: 'slow' }], ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('wb_yurg_horn', '骨猛犸号角', 'b_idol', 'wb_yurg', '吹响它，远处会传来猛犸的回应。', [
    fx('horn', '位移技能伤害 +40%', { match: { tagsAny: ['movement'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.4 }] }),
    fx('horn2', '位移技能命中后击退敌人并减速 40%（2 秒）', { match: { tagsAny: ['movement'] }, ops: [{ op: 'addEffect', effect: { type: 'slow', percent: 0.4, duration: 2 } }, { op: 'addEffect', effect: { type: 'knockback', distance: 3 } }] }),
  ]),
  item('wb_yurg_totem', '尤尔格的冰柱图腾', 'b_signet', 'wb_yurg', '萨满用它在雪地上画出冰柱阵。', [
    fx('icetotem', '普通攻击叠霜：同一目标被命中 5 次冻结 1.5 秒（首领只打断）', { match: { slots: ['basic'] }, ops: [{ op: 'addEffect', effect: { type: 'stackStun', stacks: 5, duration: 1.5, name: '冰柱封冻' } }] }),
    fx('icetotem2', '冰霜伤害 +15%', { match: { elements: ['frost'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('wb_ash_heart', '炽翼之心', 'b_idol', 'wb_ash', '龙心停跳之后，火还在里面烧。', [
    fx('dragonheart', '技能 1~3 命中留下熔岩地面（2.6 米，3 秒）', { match: { slots: ['skill1', 'skill2', 'skill3'] }, ops: [{ op: 'addEffect', effect: { type: 'groundZone', element: 'fire', dps: 48, radius: 2.6, duration: 3 } }] }),
    fx('dragonheart2', '火焰伤害 +15%', { match: { elements: ['fire'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.15 }] }),
  ]),
  item('wb_ash_cloak', '灰烬龙鳞披风', 'b_cloak', 'wb_ash', '每一片鳞都挡过一次熔岩雨。', [
    fx('dragonscale', '大招命中后获得护盾（最大生命 15%，6 秒）', { match: { slots: ['ultimate'] }, ops: [{ op: 'addEffect', effect: { type: 'shield', percentMaxHp: 0.15, duration: 6 } }] }),
    fx('dragonscale2', '护盾存在期间所有技能伤害 +25%', { match: {}, conditions: [{ type: 'flag', key: 'shield' }], ops: [{ op: 'mul', stat: 'damage', value: 0.25 }] }),
  ]),
];

const cfg = (lv: number, dmg: number, speed: number, range: number, interval: number) => ({ aggroRange: 10, attackRange: range, attackDamage: dmg, attackInterval: interval, moveSpeed: speed, leashRange: 42, patrolRadius: 0 });

// ---------------------------------------------------------------- 4 个世界首领
export const WORLD_BOSSES: Record<WorldBossId, WorldBossDef> = {
  wb_moss: {
    id: 'wb_moss', name: '遗迹古树魔像 · 苔石', title: '世界首领', level: 19, map: 'star', x: -86, z: 84, r: 16, arena: '古树石环', respawnMin: 30, theme: 'nature',
    mob: { name: '遗迹古树魔像 · 苔石', level: 19, hp: 11000, dmg: 62, interval: 2.4, speed: 2.6, aggro: 10, range: 3.6, xp: 1600, ilvl: 21, model: 'treant', tint: 0x5a7a3a, tintK: 0.45, glow: 0x0a2a08, scale: 2.4, elite: true, leash: 42 },
    adds: { wb_moss_add: { name: '苔藓傀儡', level: 18, hp: 900, dmg: 26, interval: 1.8, speed: 3.4, aggro: 14, range: 2.2, xp: 60, ilvl: 18, model: 'treant', tint: 0x7aa04a, tintK: 0.5, scale: 0.9 } },
    boss: {
      name: '苔石', config: cfg(19, 62, 2.6, 3.6, 2.4), globalCooldown: 3.5,
      abilities: [
        { id: 'sweep', kind: 'groundSlam', name: '石柱横扫', cooldown: 11, telegraph: 1.6, radius: 6.5, damage: 150, element: 'physical', atSelf: true },
        { id: 'vines', kind: 'cast', name: '藤蔓缠绕', cooldown: 16, castTime: 2.2, damage: 90, element: 'nature', effect: { type: 'stun', duration: 2 }, lockout: 2.5 },
        { id: 'puppets', kind: 'summon', name: '召唤苔藓傀儡', cooldown: 30, count: 2, unit: 'wb_moss_add' },
        { id: 'spores', kind: 'poisonZone', name: '腐苔孢子', cooldown: 14, radius: 3.2, duration: 9, dps: 30, element: 'nature', count: 3, spread: 7 },
      ],
      phases: [
        { name: '第一阶段 · 苏醒', hpBelow: 1, abilities: ['sweep', 'vines', 'puppets'] },
        { name: '第二阶段 · 腐苔蔓生', hpBelow: 0.5, abilities: ['sweep', 'vines', 'puppets', 'spores'], damageMul: 1.2, onEnter: 'puppets', yell: '根……扎进……你的骨头里！' },
      ],
    },
    soul: 'soul_moss', uniques: ['wb_moss_seed', 'wb_moss_cloak'],
    yells: { warn: '星落高原西南的古树石环在震动……苔石将在 2 分钟后苏醒！', spawn: '遗迹古树魔像「苔石」在古树石环苏醒了！', death: '苔石碎成了一地苔藓和石块。' },
  },
  wb_worm: {
    id: 'wb_worm', name: '流沙巨蠕 · 萨卡尔', title: '世界首领', level: 26, map: 'redsand', x: -96, z: 100, r: 20, arena: '流沙坑', respawnMin: 45, theme: 'stone',
    mob: { name: '流沙巨蠕 · 萨卡尔', level: 26, hp: 19000, dmg: 96, interval: 2.2, speed: 3.6, aggro: 10, range: 3.4, xp: 2600, ilvl: 29, model: 'worm', scale: 2.4, elite: true, leash: 42 },
    adds: { wb_worm_add: { name: '沙穴幼蠕', level: 25, hp: 1300, dmg: 40, interval: 1.6, speed: 4.6, aggro: 14, range: 2, xp: 90, ilvl: 26, model: 'wormling', scale: 1 } },
    boss: {
      name: '萨卡尔', config: cfg(26, 96, 3.6, 3.4, 2.2), globalCooldown: 3,
      abilities: [
        { id: 'burrow', kind: 'groundSlam', name: '钻地突袭', cooldown: 12, telegraph: 1.5, radius: 3.6, damage: 220, element: 'physical', count: 3, spread: 7 },
        { id: 'pit', kind: 'poisonZone', name: '流沙坑', cooldown: 15, radius: 4, duration: 10, dps: 46, element: 'physical', count: 2, spread: 8 },
        { id: 'spray', kind: 'cast', name: '甲晶喷射', cooldown: 14, castTime: 2, damage: 160, element: 'nature', effect: { type: 'dot', element: 'nature', dps: 28, duration: 6 }, lockout: 2 },
        { id: 'brood', kind: 'summon', name: '幼蠕破沙', cooldown: 28, count: 3, unit: 'wb_worm_add' },
      ],
      phases: [
        { name: '第一阶段 · 沙下潜行', hpBelow: 1, abilities: ['burrow', 'pit', 'spray'] },
        { name: '第二阶段 · 巢穴暴动', hpBelow: 0.4, abilities: ['burrow', 'pit', 'spray', 'brood'], damageMul: 1.25, speedMul: 1.15, onEnter: 'brood', yell: '（地底传来一阵震耳的嘶鸣，沙子开始翻滚）' },
      ],
    },
    soul: 'soul_worm', uniques: ['wb_worm_amulet', 'wb_worm_ring'],
    yells: { warn: '赤砂西北的流沙在下陷……萨卡尔将在 2 分钟后破沙而出！', spawn: '流沙巨蠕「萨卡尔」从流沙坑里钻出来了！', death: '萨卡尔沉进了流沙，只留下发烫的甲晶。' },
  },
  wb_yurg: {
    id: 'wb_yurg', name: '霜巨人萨满 · 尤尔格', title: '世界首领', level: 28, map: 'frost', x: 104, z: 92, r: 20, arena: '冰湖', respawnMin: 45, theme: 'frost',
    mob: { name: '霜巨人萨满 · 尤尔格', level: 28, hp: 22000, dmg: 104, interval: 2.2, speed: 4.4, aggro: 10, range: 3.2, xp: 3000, ilvl: 31, model: 'brute', tint: 0xb8d8ff, tintK: 0.55, glow: 0x0a1a3a, scale: 1.7, elite: true, leash: 42 },
    adds: { wb_yurg_add: { name: '骨猛犸', level: 27, hp: 3600, dmg: 70, interval: 2, speed: 5.4, aggro: 18, range: 2.8, xp: 260, ilvl: 28, model: 'boar', tint: 0xe8e0d0, tintK: 0.7, scale: 2.2 } },
    boss: {
      name: '尤尔格', config: cfg(28, 104, 4.4, 3.2, 2.2), globalCooldown: 3,
      abilities: [
        { id: 'charge', kind: 'groundSlam', name: '猛犸冲锋', cooldown: 9, telegraph: 1.2, radius: 4.2, damage: 230, element: 'physical' },
        { id: 'stomp', kind: 'groundSlam', name: '践踏', cooldown: 13, telegraph: 1.5, radius: 6, damage: 170, element: 'frost', atSelf: true },
        { id: 'dismount', kind: 'summon', name: '下马', cooldown: 999, count: 1, unit: 'wb_yurg_add' },
        { id: 'pillars', kind: 'groundSlam', name: '冰柱阵', cooldown: 12, telegraph: 1.8, radius: 3, damage: 200, element: 'frost', count: 5, spread: 9 },
        { id: 'blizzard', kind: 'cast', name: '寒冰风暴', cooldown: 16, castTime: 2.5, damage: 210, element: 'frost', effect: { type: 'slow', percent: 0.5, duration: 4 }, lockout: 2.5 },
        { id: 'frostbite', kind: 'poisonZone', name: '冻土', cooldown: 15, radius: 3.6, duration: 9, dps: 44, element: 'frost', count: 2, spread: 7 },
      ],
      phases: [
        { name: '第一阶段 · 骑猛犸', hpBelow: 1, abilities: ['charge', 'stomp'], speedMul: 1.1 },
        { name: '第二阶段 · 下马施法', hpBelow: 0.5, abilities: ['pillars', 'blizzard', 'frostbite'], speedMul: 0.65, onEnter: 'dismount', yell: '猛犸！去踩碎他们！冰柱……听我号令！' },
      ],
    },
    soul: 'soul_yurg', uniques: ['wb_yurg_horn', 'wb_yurg_totem'],
    yells: { warn: '霜脊东南的冰湖上响起了骨号声……尤尔格将在 2 分钟后到来！', spawn: '霜巨人萨满「尤尔格」骑着骨猛犸踏上了冰湖！', death: '尤尔格倒在冰湖上，冰面裂开了一道长缝。' },
  },
  wb_ash: {
    id: 'wb_ash', name: '灰烬之龙 · 炽翼', title: '世界首领', level: 30, map: 'ember', x: 104, z: -134, r: 18, arena: '火山口', respawnMin: 60, theme: 'fire',
    mob: { name: '灰烬之龙 · 炽翼', level: 30, hp: 30000, dmg: 120, interval: 2.4, speed: 4, aggro: 11, range: 4, xp: 4200, ilvl: 33, model: 'dragon', scale: 2.6, elite: true, leash: 44 },
    adds: { wb_ash_add: { name: '灰烬幼龙', level: 29, hp: 1700, dmg: 52, interval: 2, speed: 4.4, aggro: 16, range: 9, xp: 120, ilvl: 30, model: 'toad', tint: 0xff5a10, tintK: 0.6, glow: 0x5a1000, scale: 1.1, ranged: true, shot: { color: 0xff6a20, el: 'fire' } } },
    boss: {
      name: '炽翼', config: cfg(30, 120, 4, 4, 2.4), globalCooldown: 2.8,
      abilities: [
        { id: 'breath', kind: 'groundSlam', name: '烈焰吐息', cooldown: 10, telegraph: 1.4, radius: 5.5, damage: 260, element: 'fire' },
        { id: 'dive', kind: 'groundSlam', name: '俯冲', cooldown: 14, telegraph: 1.6, radius: 3.4, damage: 240, element: 'fire', count: 4, spread: 10 },
        { id: 'rain', kind: 'poisonZone', name: '熔岩雨', cooldown: 13, radius: 3.4, duration: 10, dps: 56, element: 'fire', count: 4, spread: 10 },
        { id: 'roar', kind: 'cast', name: '灰烬咆哮', cooldown: 18, castTime: 2.4, damage: 240, element: 'fire', effect: { type: 'dot', element: 'fire', dps: 40, duration: 6 }, lockout: 2.5 },
        { id: 'whelps', kind: 'summon', name: '幼龙出巢', cooldown: 30, count: 3, unit: 'wb_ash_add' },
      ],
      phases: [
        { name: '第一阶段 · 地面', hpBelow: 1, abilities: ['breath', 'roar', 'rain'] },
        { name: '第二阶段 · 升空', hpBelow: 0.6, abilities: ['breath', 'dive', 'rain', 'roar'], damageMul: 1.1, yell: '（炽翼振翅升空，火山口开始下熔岩雨）' },
        { name: '第三阶段 · 焚尽', hpBelow: 0.25, abilities: ['breath', 'dive', 'rain', 'roar', 'whelps'], damageMul: 1.35, speedMul: 1.2, onEnter: 'whelps', yell: '烧吧……把这片荒原烧成灰！' },
      ],
    },
    soul: 'soul_ash', uniques: ['wb_ash_heart', 'wb_ash_cloak'],
    yells: { warn: '烬落东北的火山口在喷烟……炽翼将在 2 分钟后降临！', spawn: '灰烬之龙「炽翼」降落在火山口！', death: '炽翼坠入火山口，灰烬像雪一样落下来。' },
  },
};

export const WB_SOUL_NEED = 10;           // 精魄保底：攒满 10 个凝成一件专属橙装
export const WB_WARN_SEC = 120;           // 出现前 2 分钟喊话
export const WB_FIRST_SEC = 180;          // 新存档 / 老存档第一次：3 分钟后第一次出现
export const WB_EVENT_SEC = 120;          // 炽翼：熔岩喷发平息后 2 分钟必刷

/** 首领精魄（材料，shop.ts 注册） */
export const WB_SOULS = WB_IDS.map(id => ({ id: WORLD_BOSSES[id].soul, name: `${WORLD_BOSSES[id].name.split(' · ')[1]}的精魄`, boss: id }));

/** 专属掉落表：只在该首领掉 */
export const WB_LOOT: Record<string, LootTable> = Object.fromEntries(WB_IDS.map(id => {
  const d = WORLD_BOSSES[id];
  const t: LootTable = { id, gold: [d.level * 14, d.level * 20], entries: [
    { kind: 'random', chance: 1, minQuality: 'purple' },
    { kind: 'random', chance: 1, minQuality: 'purple', slots: ['neck', 'ring', 'trinket', 'back'] },
    { kind: 'random', chance: 0.25, minQuality: 'orange' },
    ...d.uniques.map(u => ({ kind: 'fixed' as const, chance: 0.12, itemId: u, ilvl: 4 })),
  ], stacks: [{ id: d.soul, chance: 1, min: 1, max: 2 }, { id: 'mat_proof', chance: 1, min: 2, max: 3 }, { id: 'mat_essence', chance: 1, min: 1, max: 2 }] };
  return [id, t];
}));
/** 召唤物掉落（少量金币） */
WB_LOOT.wb_add = { id: 'wb_add', gold: [6, 14], entries: [{ kind: 'random', chance: 0.15 }] };

export const wbOfItem = (fixedId: string) => WB_ITEMS.find(i => i.id === fixedId)?.wb;
