// 示例副本：暗岩矿洞（原创内容）
import { DungeonDef } from '../core/Dungeon';
import { BossDef } from '../core/BossBrain';
import { ROTTING_TEMPLE, BOSS_ROTROOT, ROTROOT_NIGHTMARE } from './dungeon_swamp';
import type { NightmareMechanic } from './dungeon_plus';

export const DARKROCK_MINE: DungeonDef = {
  id: 'darkrock_mine',
  name: '暗岩矿洞',
  recommendedLevel: 10,
  encounters: [
    { id: 'entrance', name: '矿洞入口', kind: 'trash' },
    { id: 'tunnel', name: '塌方隧道', kind: 'trash' },
    { id: 'boss', name: '监工格罗克', kind: 'boss' },
  ],
};

/** 矿洞小怪（试玩版和命令行模拟共用；第七版平衡：血量/伤害见 README） */
export interface MineMobDef { name: string; hp: number; xp: number; ilvl: number; config: { attackDamage: number; attackInterval: number; moveSpeed: number; attackRange: number; aggroRange: number } }
export const DARKROCK_MOBS: Record<'miner' | 'spider', MineMobDef> = {
  miner: { name: '被控制的矿工', hp: 290, xp: 45, ilvl: 8, config: { attackDamage: 18, attackInterval: 1.8, moveSpeed: 3.4, attackRange: 2.1, aggroRange: 10 } },
  spider: { name: '穴居蜘蛛', hp: 225, xp: 45, ilvl: 8, config: { attackDamage: 16, attackInterval: 1.2, moveSpeed: 5.2, attackRange: 1.9, aggroRange: 10 } },
};
export const BOSS_GROK_HP = 2900;
/** fix1108 #6（Rhett 11-08 批）：矿洞 2 级就能接、怪按 10 级做 → 10 级以下按玩家等级缩放小怪 / 格罗克的生命和伤害（含技能伤害）。
 *  k = 0.4 + 0.06 × 等级（2 级 0.52、4 级 0.64、7 级 0.82、10 级起 1，不变）；只用于暗岩矿洞，等级同步的高难度不受影响（那时已 30 级） */
export const mineLevelK = (lv: number): number => lv >= 10 ? 1 : Math.max(0.5, 0.4 + 0.06 * lv);
/** 噩梦新机制：矿道崩塌 —— 一次落下 5 块碎岩（散开 7 米），要连续走位或翻滚 */
export const GROK_NIGHTMARE: NightmareMechanic = {
  desc: '矿道崩塌：一次落下 5 块碎岩，散布在你周围',
  ability: { id: 'nm_collapse', kind: 'groundSlam', name: '矿道崩塌', cooldown: 15, telegraph: 1.7, radius: 2.2, damage: 140, element: 'physical', count: 5, spread: 7 },
};   // 第七版：2600 → 2900

export const BOSS_GROK: BossDef = {
  name: '监工格罗克',
  config: { aggroRange: 10, attackRange: 2.5, attackDamage: 40, attackInterval: 2, moveSpeed: 3.5, leashRange: 25, patrolRadius: 0 },
  globalCooldown: 4,
  abilities: [
    // 红圈：玩家脚下，1.5 秒后砸下 —— 看到就跑
    { id: 'slam', kind: 'groundSlam', name: '震地猛击', cooldown: 8, telegraph: 1.5, radius: 3, damage: 170, element: 'physical' },
    // 第七版：快速大红圈（0.9 秒、半径 5.5）——站在圆心跑不出去，要用闪避翻滚（位移或无敌帧）躲开
    { id: 'quake', kind: 'groundSlam', name: '裂地冲击', cooldown: 11, telegraph: 0.9, radius: 5.5, damage: 260, element: 'physical' },
    // 读条：2.5 秒，读完 220 暗影伤害 + 减速，用冲锋（眩晕）打断
    { id: 'bolt', kind: 'cast', name: '暗影矿镐', cooldown: 12, castTime: 2.5, damage: 220, element: 'shadow',
      effect: { type: 'slow', percent: 0.5, duration: 4 }, lockout: 3 },
    { id: 'adds', kind: 'summon', name: '呼叫矿工', cooldown: 999, count: 2 },
    // 二阶段：一次落 3 个圈
    { id: 'rocks', kind: 'groundSlam', name: '碎石雨', cooldown: 10, telegraph: 2, radius: 2.5, damage: 120, element: 'nature', count: 3, spread: 5 },
  ],
  phases: [
    { name: '第一阶段', hpBelow: 1, abilities: ['slam', 'bolt'] },
    { name: '第二阶段', hpBelow: 0.6, abilities: ['slam', 'bolt', 'rocks', 'quake'], onEnter: 'adds', yell: '小子们，干活了！' },
    { name: '狂暴', hpBelow: 0.25, abilities: ['rocks', 'bolt', 'quake'], damageMul: 1.5, speedMul: 1.3, yell: '我要把你埋在这里！' },
  ],
};

/** 注册表：Cocos 组件里用字符串 id 查配置（腐沼神殿在 dungeon_swamp.ts） */
export const DUNGEONS: Record<string, DungeonDef> = { [DARKROCK_MINE.id]: DARKROCK_MINE, [ROTTING_TEMPLE.id]: ROTTING_TEMPLE };
export const BOSSES: Record<string, BossDef> = { grok: BOSS_GROK, rotroot: BOSS_ROTROOT };
