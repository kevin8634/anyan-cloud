// 第二个副本：腐沼神殿（原创内容）。通关暗岩矿洞（完成「深入暗岩矿洞」）后解锁
// 腐沼堤道（巨蟾 + 树妖）→ 沉没回廊（祭徒远程 + 树妖 + 巨蟾）→ Boss 腐根祭司（三阶段）
import { DungeonDef } from '../core/Dungeon';
import { BossDef } from '../core/BossBrain';
import { EnemyConfig } from '../core/EnemyBrain';
import type { NightmareMechanic } from './dungeon_plus';

export const ROTTING_TEMPLE: DungeonDef = {
  id: 'rotting_temple',
  name: '腐沼神殿',
  recommendedLevel: 9,
  encounters: [
    { id: 'causeway', name: '腐沼堤道', kind: 'trash' },
    { id: 'nave', name: '沉没回廊', kind: 'trash' },
    { id: 'boss', name: '腐根祭司', kind: 'boss' },
  ],
};

/** 小怪与召唤物（引擎层可直接用来建 EnemyBrain；onHit 为近战命中附加效果） */
export interface SwampMobDef { name: string; hp: number; xp: number; ilvl: number; config: EnemyConfig; ranged?: boolean; onHitDot?: { dps: number; duration: number } }
export const SWAMP_MOBS: Record<string, SwampMobDef> = {
  toad: { name: '腐沼巨蟾', hp: 460, xp: 60, ilvl: 13, onHitDot: { dps: 6, duration: 4 },
    config: { aggroRange: 9, attackRange: 2.2, attackDamage: 26, attackInterval: 1.6, moveSpeed: 3.6, leashRange: 30, patrolRadius: 3 } },
  treant: { name: '腐根树妖', hp: 700, xp: 70, ilvl: 13,
    config: { aggroRange: 9, attackRange: 2.6, attackDamage: 35, attackInterval: 2.2, moveSpeed: 2.7, leashRange: 30, patrolRadius: 2 } },
  cultist: { name: '沼泽祭徒', hp: 400, xp: 65, ilvl: 13, ranged: true,
    config: { aggroRange: 12, attackRange: 9, attackDamage: 24, attackInterval: 2.2, moveSpeed: 3.4, leashRange: 30, patrolRadius: 2 } },
  // Boss 召唤的缠绕藤蔓：不会移动，远程射毒刺，优先清掉
  vine: { name: '缠绕藤蔓', hp: 240, xp: 20, ilvl: 13, ranged: true,
    config: { aggroRange: 30, attackRange: 11, attackDamage: 14, attackInterval: 2, moveSpeed: 0, leashRange: 99, patrolRadius: 0 } },
};

/** 噩梦新机制：腐沼蔓生 —— 在你身边留下 2 片 12 秒的大毒沼，场地越打越小 */
export const ROTROOT_NIGHTMARE: NightmareMechanic = {
  desc: '腐沼蔓生：在你身边留下 2 片持续 12 秒的大毒沼，场地越打越小',
  ability: { id: 'nm_bloom', kind: 'poisonZone', name: '腐沼蔓生', cooldown: 17, radius: 3.4, duration: 12, dps: 34, element: 'nature', count: 2, spread: 5 },
};
export const BOSS_ROTROOT_HP = 4200;   // 第七版：3800 → 4200

export const BOSS_ROTROOT: BossDef = {
  name: '腐根祭司',
  config: { aggroRange: 11, attackRange: 2.8, attackDamage: 46, attackInterval: 2, moveSpeed: 3.2, leashRange: 40, patrolRadius: 0 },
  globalCooldown: 3.5,
  abilities: [
    // 红圈：玩家脚下根须穿刺
    { id: 'thorns', kind: 'groundSlam', name: '根须穿刺', cooldown: 7, telegraph: 1.4, radius: 2.6, damage: 170, element: 'nature' },
    // 读条：3 秒，读完伤害 + 中毒，且 Boss 回复 12% 生命 → 必须打断
    { id: 'drain', kind: 'cast', name: '腐化汲取', cooldown: 14, castTime: 3, damage: 160, element: 'nature', selfHealPercent: 0.12, lockout: 3,
      effect: { type: 'dot', element: 'nature', dps: 18, duration: 5 } },
    // 毒池：脚下留下 9 秒的毒沼
    { id: 'spit', kind: 'poisonZone', name: '毒沼喷吐', cooldown: 10, radius: 3, duration: 9, dps: 45, element: 'nature' },
    // 召唤藤蔓
    { id: 'vines', kind: 'summon', name: '唤醒藤蔓', cooldown: 28, count: 2, unit: 'vine' },
    // 以自身为圆心的大范围爆发：近战要跑出 6.5 米
    // 第七版：腐根猛扑——0.9 秒、半径 5.5 的快速大红圈，只能靠闪避翻滚躲开
    { id: 'lunge', kind: 'groundSlam', name: '腐根猛扑', cooldown: 12, telegraph: 0.9, radius: 5.5, damage: 280, element: 'nature' },
    { id: 'burst', kind: 'groundSlam', name: '腐根爆发', cooldown: 13, telegraph: 2.2, radius: 6.5, damage: 220, element: 'nature', atSelf: true },
    // 三阶段：一次 3 个毒池、4 个红圈
    { id: 'spores', kind: 'poisonZone', name: '孢子雨', cooldown: 12, radius: 2.5, duration: 7, dps: 40, element: 'nature', count: 3, spread: 6 },
    { id: 'thornfield', kind: 'groundSlam', name: '荆棘蔓延', cooldown: 10, telegraph: 1.8, radius: 2.5, damage: 140, element: 'nature', count: 4, spread: 6 },
  ],
  phases: [
    { name: '第一阶段', hpBelow: 1, abilities: ['thorns', 'drain', 'spit'] },
    { name: '第二阶段·藤蔓苏醒', hpBelow: 0.65, abilities: ['thorns', 'drain', 'spit', 'burst', 'vines', 'lunge'], onEnter: 'vines', yell: '沼泽的根须啊，吞噬这些闯入者！' },
    { name: '第三阶段·腐化狂潮', hpBelow: 0.3, abilities: ['thornfield', 'spores', 'drain', 'burst', 'vines', 'lunge'], damageMul: 1.35, speedMul: 1.2, onEnter: 'spores', yell: '腐烂……才是万物的归宿！' },
  ],
};
