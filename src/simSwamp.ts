// 运行：npm run swamp —— 命令行模拟“腐沼神殿”：两波小怪（巨蟾/树妖/远程祭徒）+ 三阶段 Boss 腐根祭司
// 玩家（10 级战士，带一套蓝紫装）会躲红圈和毒池、用冲锋打断「腐化汲取」；--lazy 站桩对比
import { runDungeonSim } from './simLib';
import { CLASSES } from './data/classes';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from './data/dungeon_swamp';
import { ITEMS } from './data/warrior';

declare const process: { argv: string[]; exitCode?: number };
const lazy = process.argv.includes('--lazy');
const M = SWAMP_MOBS;
const mob = (k: keyof typeof M, enc: string, x: number, z: number) => ({ name: M[k].name, enc, pos: { x, z }, hp: M[k].hp, config: M[k].config });

const res = runDungeonSim({
  cls: CLASSES.warrior, level: 10,
  talents: ['wf_frenzy', 'wf_frenzy', 'wf_frenzy', 'wf_flame', 'wf_whirl', 'wf_whirl', 'wp_tough', 'wp_tough', 'wp_tough'],   // 狂怒 6 + 防护 3
  items: [ITEMS[2], ITEMS[3]],                  // 狂怒套装两件（冷却 -10% + 重置冲锋）
  bonusHp: 420, armor: 160,                    // 约等于 10 级时的蓝紫装备
  dungeon: ROTTING_TEMPLE, boss: BOSS_ROTROOT, bossHp: BOSS_ROTROOT_HP, bossPos: { x: 70, z: 0 },
  mobs: [mob('toad', 'causeway', 8, -1), mob('toad', 'causeway', 9, 1), mob('treant', 'causeway', 11, 0),
    mob('cultist', 'nave', 34, -2), mob('cultist', 'nave', 35, 2), mob('treant', 'nave', 32, 0), mob('toad', 'nave', 33, 1)],
  summons: { vine: { hp: M.vine.hp, config: M.vine.config } },
  lazy, dodge: 'roll', seed: 11,
});
if (!lazy && !res.completed) process.exitCode = 1;
