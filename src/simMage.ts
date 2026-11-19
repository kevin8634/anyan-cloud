// 运行：npm run mage —— 法师模拟：暗岩矿洞（7 级）+ 腐沼神殿（10 级），远程风筝、霜环冻结近身怪、奥术禁锢打断读条
// 同时打印传说装备把法师技能变成的变种
import { runDungeonSim } from './simLib';
import { LEGACY_TREES, CLASSES } from './data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from './data/dungeon_darkrock';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from './data/dungeon_swamp';
import { MAGE_LEGENDARIES } from './data/mage';
import { Loadout } from './core/Loadout';
import { SLOT_IDS } from './core/types';
import { TalentTree } from './core/TalentTree';

declare const process: { argv: string[]; exitCode?: number };
const mage = CLASSES.mage;

// ---- 技能变种展示：天赋 + 传说特效 ----
const lo = new Loadout({ execute: () => {} });
SLOT_IDS.forEach(s => lo.equipSkill(mage.skills[mage.loadout[s]], s));
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] };
const line = () => SLOT_IDS.map(s => { const r = lo.preview(s, ctx)!; return `${r.displayName}(${r.element}/${r.shape}${r.stats.projectileCount > 1 ? '×' + r.stats.projectileCount : ''}) ${Math.round(r.stats.damage)}伤`; }).join(' | ');
console.log('== 法师基础技能 ==\n' + line());
const tree = new TalentTree(LEGACY_TREES.mage, 12);   // v1.2.58：2.0 结构自检
['mi_chill', 'mi_chill', 'mi_chill', 'mi_iceheart', 'mi_barrier', 'mi_barrier', 'mi_deepfreeze', 'mf_ignite', 'mf_ignite', 'mf_ignite', 'mf_orb', 'mf_orb'].forEach(id => { if (!tree.add(id)) throw new Error(`天赋 ${id}：${tree.whyCannotAdd(id)}`); });
lo.setTalents(tree.activeNodes());
console.log('== 天赋：冰川之心 + 烈焰弹大师 + 深度冻结 ==\n' + line());
lo.setItems(MAGE_LEGENDARIES.map(l => ({ id: l.id, name: l.name, slot: l.slots[0], quality: 'orange', modifiers: [l.modifier] })));
console.log('== 再穿上 4 件法师传说 ==\n' + line() + '\n');

const lazy = process.argv.includes('--lazy');
const r1 = runDungeonSim({
  cls: mage, level: 7,
  talents: ['mf_ignite', 'mf_ignite', 'mf_ignite', 'mf_fireheart', 'mf_orb', 'mf_orb'],
  bonusHp: 240, armor: 60,
  dungeon: DARKROCK_MINE, boss: BOSS_GROK, bossHp: BOSS_GROK_HP, bossPos: { x: 60, z: 0 },
  mobs: [
    { name: '矿工A', enc: 'entrance', pos: { x: 12, z: 0 }, hp: DARKROCK_MOBS.miner.hp, config: DARKROCK_MOBS.miner.config },
    { name: '矿工B', enc: 'entrance', pos: { x: 13, z: 1 }, hp: DARKROCK_MOBS.miner.hp, config: DARKROCK_MOBS.miner.config },
    { name: '矿工C', enc: 'entrance', pos: { x: 14, z: -1 }, hp: DARKROCK_MOBS.miner.hp, config: DARKROCK_MOBS.miner.config },
    { name: '穴居蜘蛛A', enc: 'tunnel', pos: { x: 32, z: 0 }, hp: DARKROCK_MOBS.spider.hp, config: DARKROCK_MOBS.spider.config },
    { name: '穴居蜘蛛B', enc: 'tunnel', pos: { x: 33, z: -1 }, hp: DARKROCK_MOBS.spider.hp, config: DARKROCK_MOBS.spider.config },
    { name: '穴居蜘蛛C', enc: 'tunnel', pos: { x: 33, z: 1 }, hp: DARKROCK_MOBS.spider.hp, config: DARKROCK_MOBS.spider.config },
  ],
  summons: { miner: { hp: DARKROCK_MOBS.miner.hp, config: DARKROCK_MOBS.miner.config } },
  lazy, dodge: 'roll', seed: 5, quiet: process.argv.includes('--quiet'),
});
console.log('');
const M = SWAMP_MOBS;
const mob = (k: keyof typeof M, enc: string, x: number, z: number) => ({ name: M[k].name, enc, pos: { x, z }, hp: M[k].hp, config: M[k].config });
const r2 = runDungeonSim({
  cls: mage, level: 10,
  talents: ['mf_ignite', 'mf_ignite', 'mf_ignite', 'mf_fireheart', 'mf_orb', 'mf_orb', 'mf_orb', 'mi_icearmor', 'mi_icearmor'],
  bonusHp: 380, armor: 110,
  dungeon: ROTTING_TEMPLE, boss: BOSS_ROTROOT, bossHp: BOSS_ROTROOT_HP, bossPos: { x: 70, z: 0 },
  mobs: [mob('toad', 'causeway', 12, -1), mob('toad', 'causeway', 13, 1), mob('treant', 'causeway', 15, 0),
    mob('cultist', 'nave', 36, -2), mob('cultist', 'nave', 37, 2), mob('treant', 'nave', 34, 0), mob('toad', 'nave', 35, 1)],
  summons: { vine: { hp: M.vine.hp, config: M.vine.config } },
  lazy, dodge: 'roll', seed: 3, quiet: process.argv.includes('--quiet'),
});
console.log(`\n法师：暗岩矿洞 ${r1.completed ? '通关' : '失败'}（打断 ${r1.interrupts}/${r1.bossCasts}），腐沼神殿 ${r2.completed ? '通关' : '失败'}（打断 ${r2.interrupts}/${r2.bossCasts}）`);
if (!lazy && !(r1.completed && r2.completed)) process.exitCode = 1;
