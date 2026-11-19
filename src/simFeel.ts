// 运行：npm run feel —— 第七版战斗手感：闪避翻滚（无敌帧 / 冷却 / 眩晕不能滚）、打击感事件（顿帧 / 震动）、平衡对比（站桩 / 只会跑 / 会翻滚）
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { BossBrain, BossDef } from './core/BossBrain';
import { DodgeRoll, DEFAULT_DODGE } from './core/Dodge';
import { HitFeel, FEEL_TABLE } from './core/HitFeel';
import { runDungeonSim, SimOptions, SimResult } from './simLib';
import { CLASSES } from './data/classes';
import { DARKROCK_MINE, BOSS_GROK, BOSS_GROK_HP, DARKROCK_MOBS } from './data/dungeon_darkrock';
import { ROTTING_TEMPLE, BOSS_ROTROOT, BOSS_ROTROOT_HP, SWAMP_MOBS } from './data/dungeon_swamp';
import { ITEMS } from './data/warrior';

declare const process: { argv: string[]; exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

class U implements CombatUnit {
  status = new StatusSet(); hp: number; immune = 0; dmgTaken = 0;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onImmune() { this.immune++; }
  onDamaged(a: number) { this.dmgTaken += a; }
}

console.log('== 1. 闪避翻滚：位移 / 无敌帧 / 冷却 ==');
{
  const p = new U('玩家', 'player', 1000, { x: 0, z: 0 });
  const e = new U('怪', 'enemy', 1000, { x: 3, z: 0 });
  const world: CombatWorld = { units: () => [p, e], resetCooldown: () => {} };
  const fx = new EffectSystem(world);
  const dr = new DodgeRoll();
  let t = 0;
  check(dr.start(p, t, { x: 1, z: 0 }, { x: 0, z: 1 }), '开始翻滚（向 +x）');
  check(p.status.isInvulnerable, '翻滚开始即无敌');
  check(fx.dealDamage(p, 500, 'physical', e) === 0 && p.hp === 1000 && p.immune === 1, '无敌帧内受到 500 伤害 → 0，触发「免疫」');
  p.status.add({ key: 'stun', kind: 'stun', remaining: 2, source: e });
  p.status.add({ key: 'poison', kind: 'dot', remaining: 4, dps: 10, element: 'nature', source: e });
  check(!p.status.isStunned && !p.status.has('dot'), '无敌帧内不吃眩晕 / 中毒');
  let moved = 0;
  for (let i = 0; i < 20; i++) { const m = dr.step(0.05); if (m) { p.pos.x += m.x; p.pos.z += m.z; moved += Math.hypot(m.x, m.z); } t += 0.05; fx.update(0.05); p.status.tick(0); }
  check(Math.abs(p.pos.x - DEFAULT_DODGE.distance) < 0.01 && Math.abs(p.pos.z) < 1e-6, `翻滚位移 ${p.pos.x.toFixed(2)} 米（目标 ${DEFAULT_DODGE.distance}）`);
  check(!dr.rolling, `${DEFAULT_DODGE.duration} 秒后翻滚结束`);
  check(!p.status.isInvulnerable && fx.dealDamage(p, 100, 'physical', e) === 100, `${DEFAULT_DODGE.iframes} 秒后无敌结束，正常受伤`);
  check(!dr.start(p, t, { x: 1, z: 0 }, { x: 1, z: 0 }) && dr.whyNot(p, t) === '翻滚冷却中', `冷却中不能再滚（剩余 ${dr.cooldownLeft(t).toFixed(1)} 秒）`);
  t = DEFAULT_DODGE.cooldown + 0.01;
  check(dr.cooldownLeft(t) === 0 && dr.whyNot(p, t) === null, `${DEFAULT_DODGE.cooldown} 秒冷却后可以再滚`);
  p.status.add({ key: 'stun', kind: 'stun', remaining: 1, source: e });
  check(dr.whyNot(p, t) === '眩晕中无法翻滚' && !dr.start(p, t, null, { x: 0, z: 1 }), '眩晕中不能翻滚');
  p.status.clear();
  check(dr.start(p, t, null, { x: 0, z: -1 }) && dr.roll!.dir.z === -1, '静止时朝面朝方向翻滚');
  const fast = new DodgeRoll(); fast.haste = 25;
  check(Math.abs(fast.cooldown - 4.5) < 1e-9, `急速 25% → 冷却 ${fast.cooldown} 秒`);
  fast.haste = 90; check(Math.abs(fast.cooldown - 3.6) < 1e-9, `急速上限 40% → 冷却 ${fast.cooldown} 秒`);
}

console.log('\n== 2. Boss 红圈尊重无敌帧 ==');
{
  const def: BossDef = { name: '测试Boss', config: { aggroRange: 30, attackRange: 2.5, attackDamage: 0, attackInterval: 99, moveSpeed: 0, leashRange: 99, patrolRadius: 0 }, globalCooldown: 0.1,
    abilities: [{ id: 'slam', kind: 'groundSlam', name: '砸地', cooldown: 3, telegraph: 1, radius: 3, damage: 300, element: 'physical' }],
    phases: [{ name: 'P1', hpBelow: 1, abilities: ['slam'] }] };
  const p = new U('玩家', 'player', 1000, { x: 0, z: 0 });
  const b = new U('Boss', 'enemy', 5000, { x: 6, z: 0 });
  const world: CombatWorld = { units: () => [p, b], resetCooldown: () => {} };
  const fx = new EffectSystem(world);
  let resolved = 0, hits = 0, dodged = 0;
  const bb = new BossBrain(b, { ...b.pos }, def, (tg, d, el) => fx.dealDamage(tg, d, el, b),
    { onTelegraphResolve: (_i, hit) => { resolved++; if (hit) hits++; }, onTelegraphDodged: () => dodged++ }, () => 0.5);
  const dr = new DodgeRoll(); dr.cfg = { ...DEFAULT_DODGE, distance: 0.0001 };   // 原地翻滚：只靠无敌帧
  let t = 0, rolled = false;
  for (let i = 0; i < 200 && resolved < 1; i++) {
    t += 0.05; bb.update(0.05, p); fx.update(0.05);
    const tg = bb.activeTelegraphs[0];
    if (tg && tg.remaining <= 0.2 && !rolled) { rolled = dr.start(p, t, null, { x: 0, z: 1 }); }
    const m = dr.step(0.05); if (m) { p.pos.x += m.x; p.pos.z += m.z; }
  }
  check(rolled && resolved === 1 && hits === 0 && dodged === 1 && p.hp === 1000, `站在红圈里翻滚：无敌帧吃掉红圈（伤害 ${1000 - p.hp}，dodged=${dodged}）`);
  for (let i = 0; i < 200 && resolved < 2; i++) { t += 0.05; bb.update(0.05, p); fx.update(0.05); }
  check(resolved === 2 && hits === 1 && p.hp === 700, `不翻滚：被砸中 300（血量 ${p.hp}）`);
}

console.log('\n== 3. 打击感事件：顿帧 / 震动 / 设置 ==');
{
  const f = new HitFeel();
  const h = f.emit('hit');
  check(h.stop >= 0.04 && h.stop <= 0.09, `普通近战命中顿帧 ${h.stop * 1000} 毫秒（40~90）`);
  const c = f.emit('crit');
  check(c.stop >= 0.04 && c.stop <= 0.1 && c.shake > 0, `暴击顿帧 ${c.stop * 1000} 毫秒 + 震动 ${c.shake}`);
  check(FEEL_TABLE.heavy.stop <= 0.09 && FEEL_TABLE.hit.stop < FEEL_TABLE.heavy.stop && FEEL_TABLE.heavy.stop < FEEL_TABLE.crit.stop && FEEL_TABLE.crit.stop < FEEL_TABLE.ultimate.stop && FEEL_TABLE.ultimate.shake > FEEL_TABLE.crit.shake && FEEL_TABLE.bossSlam.shake > FEEL_TABLE.crit.shake, '重击/终极/Boss 砸地 震动按事件递增');
  { const d = new HitFeel(); d.emit('crit', 1, { x: 3, z: 4 }); check(Math.abs(d.dirX - 0.6) < 1e-6 && Math.abs(d.dirZ - 0.8) < 1e-6 && d.push > 0, 'v1.2.56 暴击震屏带攻击方向'); d.update(1); check(d.push === 0, '方向推镜 1 秒内衰减完'); check(FEEL_TABLE.eliteKill.scale! > FEEL_TABLE.bossKill.scale! && FEEL_TABLE.eliteKill.stop >= 0.1, 'v1.2.56 精英击杀 0.1 秒慢动作'); }
  const k = f.emit('bossKill');
  check(k.stop > 0.2 && f.stop === k.stop, `击杀 Boss 顿帧 ${k.stop * 1000} 毫秒（更长），时间倍率 ${f.stopScale}`);
  const sc = f.update(0.016);
  check(sc < 1 && f.shake > 0, `顿帧期间游戏时间倍率 ${sc}`);
  for (let i = 0; i < 60; i++) f.update(0.016);
  check(f.update(0.016) === 1 && f.shake < 0.01, '约 1 秒后顿帧/震动结束');
  check(f.log.map(x => x.ev).join(',') === 'hit,crit,bossKill', `事件记录：${f.log.map(x => x.ev).join(',')}`);
  const off = new HitFeel({ shake: false, shakeIntensity: 1, hitStop: true });
  check(off.emit('ultimate').shake === 0 && off.shake === 0, '关闭镜头震动：震动为 0（顿帧保留）');
  off.kick(0.5); check(off.shake === 0, '关闭后旧代码的 kick() 也不震');
  const half = new HitFeel({ shake: true, shakeIntensity: 0.5, hitStop: true });
  check(Math.abs(half.emit('bossSlam').shake - FEEL_TABLE.bossSlam.shake * 0.5) < 1e-9, '震动强度 50% → 震动减半');
}

console.log('\n== 4. 平衡对比：站桩 / 只会跑出红圈 / 跑 + 翻滚 ==');
const quiet = !process.argv.includes('--verbose');
const MM = DARKROCK_MOBS, SM = SWAMP_MOBS;
const mine = (x0: number): SimOptions['mobs'] => [
  ...['A', 'B', 'C'].map((n, i) => ({ name: `矿工${n}`, enc: 'entrance', pos: { x: x0 + i, z: i - 1 }, hp: MM.miner.hp, config: MM.miner.config })),
  ...['A', 'B', 'C'].map((n, i) => ({ name: `蜘蛛${n}`, enc: 'tunnel', pos: { x: x0 + 20 + i, z: i - 1 }, hp: MM.spider.hp, config: MM.spider.config })),
];
const swampMob = (k: keyof typeof SM, enc: string, x: number, z: number) => ({ name: SM[k].name, enc, pos: { x, z }, hp: SM[k].hp, config: SM[k].config });
const swamp = (x0: number): SimOptions['mobs'] => [swampMob('toad', 'causeway', x0, -1), swampMob('toad', 'causeway', x0 + 1, 1), swampMob('treant', 'causeway', x0 + 3, 0),
  swampMob('cultist', 'nave', x0 + 24, -2), swampMob('cultist', 'nave', x0 + 25, 2), swampMob('treant', 'nave', x0 + 22, 0), swampMob('toad', 'nave', x0 + 23, 1)];
// 和 simSwamp / simMage 相同的角色配置（等级、天赋、装备生命/护甲）
const SCEN: { name: string; o: Omit<SimOptions, 'lazy' | 'dodge'> }[] = [
  { name: '战士 7 级 · 暗岩矿洞', o: { cls: CLASSES.warrior, level: 7, talents: ['wf_frenzy', 'wf_frenzy', 'wf_frenzy', 'wf_flame', 'wf_whirl', 'wf_whirl'], bonusHp: 260, armor: 120,
    dungeon: DARKROCK_MINE, boss: BOSS_GROK, bossHp: BOSS_GROK_HP, bossPos: { x: 60, z: 0 }, mobs: mine(8), summons: { miner: { hp: MM.miner.hp, config: MM.miner.config } }, seed: 7 } },
  { name: '法师 7 级 · 暗岩矿洞', o: { cls: CLASSES.mage, level: 7, talents: ['mf_ignite', 'mf_ignite', 'mf_ignite', 'mf_fireheart', 'mf_orb', 'mf_orb'], bonusHp: 240, armor: 60,
    dungeon: DARKROCK_MINE, boss: BOSS_GROK, bossHp: BOSS_GROK_HP, bossPos: { x: 60, z: 0 }, mobs: mine(12), summons: { miner: { hp: MM.miner.hp, config: MM.miner.config } }, seed: 5 } },
  { name: '战士 10 级 · 腐沼神殿', o: { cls: CLASSES.warrior, level: 10, talents: ['wf_frenzy', 'wf_frenzy', 'wf_frenzy', 'wf_flame', 'wf_whirl', 'wf_whirl', 'wp_tough', 'wp_tough', 'wp_tough'],
    items: [ITEMS[2], ITEMS[3]], bonusHp: 420, armor: 160, dungeon: ROTTING_TEMPLE, boss: BOSS_ROTROOT, bossHp: BOSS_ROTROOT_HP, bossPos: { x: 70, z: 0 }, mobs: swamp(8), summons: { vine: { hp: SM.vine.hp, config: SM.vine.config } }, seed: 11 } },
  { name: '法师 10 级 · 腐沼神殿', o: { cls: CLASSES.mage, level: 10, talents: ['mf_ignite', 'mf_ignite', 'mf_ignite', 'mf_fireheart', 'mf_orb', 'mf_orb', 'mf_orb', 'mi_icearmor', 'mi_icearmor'], bonusHp: 380, armor: 110,
    dungeon: ROTTING_TEMPLE, boss: BOSS_ROTROOT, bossHp: BOSS_ROTROOT_HP, bossPos: { x: 70, z: 0 }, mobs: swamp(12), summons: { vine: { hp: SM.vine.hp, config: SM.vine.config } }, seed: 3 } },
];
const fmt = (r: SimResult) => `${r.completed ? '通关' : '失败'} 阵亡${r.deaths} 中圈${r.circleHits} 最低血${Math.round(r.minHpPct * 100)}%${r.rolls ? ` 翻滚${r.rolls}/无敌帧躲圈${r.rollSaves}` : ''} ${r.seconds.toFixed(0)}秒`;
const SEEDS = [0, 1, 2];
for (const sc of SCEN) {
  const res = { lazy: [] as SimResult[], walk: [] as SimResult[], roll: [] as SimResult[] };
  for (const k of SEEDS) {
    const seed = (sc.o.seed ?? 7) + k * 101;
    res.lazy.push(runDungeonSim({ ...sc.o, seed, lazy: true, quiet: true, revives: 3 }));
    res.walk.push(runDungeonSim({ ...sc.o, seed, dodge: 'walk', quiet, revives: 3 }));
    res.roll.push(runDungeonSim({ ...sc.o, seed, dodge: 'roll', quiet, revives: 3 }));
  }
  console.log(`  ${sc.name}`);
  for (const k of ['lazy', 'walk', 'roll'] as const) console.log(`    ${{ lazy: '站桩  ', walk: '只会跑', roll: '会翻滚' }[k]}：${res[k].map(fmt).join(' | ')}`);
  const deaths = (a: SimResult[]) => a.reduce((s, r) => s + r.deaths, 0);
  const hits = (a: SimResult[]) => a.reduce((s, r) => s + r.circleHits, 0);
  const avgHp = (a: SimResult[]) => a.reduce((s, r) => s + (r.deaths ? 0 : r.minHpPct), 0) / a.length;
  check(res.roll.every(r => r.completed && r.deaths <= 1), `${sc.name}：会翻滚的机器人每次都通关，单次阵亡 ≤ 1（共 ${deaths(res.roll)}）`);
  check(deaths(res.roll) <= deaths(res.walk) + 1 && hits(res.roll) < hits(res.walk) && avgHp(res.roll) >= avgHp(res.walk) - 0.1,
    `${sc.name}：翻滚比只会跑更稳（阵亡 ${deaths(res.roll)} vs ${deaths(res.walk)}，被红圈砸中 ${hits(res.roll)} vs ${hits(res.walk)} 次，平均最低血 ${Math.round(avgHp(res.roll) * 100)}% vs ${Math.round(avgHp(res.walk) * 100)}%）`);
  check(deaths(res.lazy) >= SEEDS.length, `${sc.name}：站桩机器人吃力（阵亡 ${deaths(res.lazy)} 次）`);
}
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 全部通过');
if (fails) process.exitCode = 1;
