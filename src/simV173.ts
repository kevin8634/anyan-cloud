// 运行：tsc && node dist/simV173.js —— v1.2.73 报告 5.2 数值落地（Rhett 11-02 22:01 批）
// ① 奥术风暴伤害区 6 秒 / 半径 6、总伤不变；② 暴风雪 8 秒 + 叠减速 + 第 4 跳冻结；英勇跳跃 4 米/50%/3 秒；剑刃风暴每跳叠流血
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { ResolvedSkill, EffectDef } from './core/types';
import { ALT_SKILLS } from './data/skillbook';
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; dmg = 0; ticks = 0; stuns = 0; interrupts = 0;
  dotPower?: number; ccImmune?: boolean;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number, _e: unknown, _s: unknown, _c?: boolean, tick?: boolean) { this.dmg += n; if (tick) this.ticks++; }
  onCC() { this.stuns++; }
  onInterrupt() { this.interrupts++; return false; }
}
const world = (units: Dummy[]): CombatWorld => ({ units: () => units, resetCooldown: () => {} });
const def = (cls: 'warrior' | 'mage', id: string) => ALT_SKILLS[cls].find(s => s.id === id)!;
const eff = <T extends EffectDef['type']>(id: string, cls: 'warrior' | 'mage', t: T) => def(cls, id).effects.find(e => e.type === t) as Extract<EffectDef, { type: T }>;
const only = (base: string, effects: EffectDef[], el: ResolvedSkill['element'] = 'frost'): ResolvedSkill => ({ baseId: base, displayName: base, slot: 'skill2', element: el, shape: 'circle', tags: [], stats: { damage: 0, cooldown: 1, range: 5, radius: 5, projectileCount: 1, cost: 0 } as ResolvedSkill['stats'], effects, appliedModifiers: [] });

console.log('\n=== ① 奥术风暴 ===');
{ const z = eff('arcane_storm', 'mage', 'groundZone');
  check(z.duration === 6 && z.radius === 6, `伤害区 ${z.duration} 秒 / 半径 ${z.radius}（表现 6 秒 / 半径 6）`);
  check(Math.abs(z.dps * z.duration - 80) < 1e-6, `总伤不变：${z.dps.toFixed(2)} × ${z.duration} = ${(z.dps * z.duration).toFixed(1)}（原 16 × 5 = 80）`);
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 0, z: 0 }), far = new Dummy('f', 'enemy', 1e9, { x: 5.5, z: 0 });
  const fx = new EffectSystem(world([p, e, far]), () => 0.5); fx.applySkill(only('arcane_storm', [z], 'arcane'), p, [e]);
  for (let t = 0; t < 8; t += 0.05) fx.update(0.05);
  check(e.ticks === 6 && far.ticks === 6, `6 跳；5.5 米外的敌人也在区域内（中心 ${e.ticks} 跳，5.5 米 ${far.ticks} 跳）`);
}

console.log('\n=== ② 暴风雪 ===');
{ const z = eff('blizzard', 'mage', 'groundZone');
  check(z.duration === 8 && z.slowPerTick === 0.2 && z.slowMax === 0.6 && z.freezeTick === 4 && z.freezeDur === 1.5, `8 秒，每跳减速 +20%（最多 60%），第 4 跳冻结 1.5 秒`);
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 }), boss = new Dummy('b', 'enemy', 1e9, { x: -1, z: 0 }); boss.ccImmune = true;
  const fx = new EffectSystem(world([p, e, boss]), () => 0.5); fx.applySkill(only('blizzard', [z]), p, [e]);
  const slowAt: number[] = []; let stunAt = -1;
  for (let t = 0, n = 0; t < 9; t += 0.05) { const before = e.ticks; fx.update(0.05); if (e.ticks !== before) { n++; slowAt.push(Math.round((1 - e.status.speedMultiplier) * 100)); if (e.status.isStunned && stunAt < 0) stunAt = n; } }
  check(e.ticks === 8, `8 跳（实际 ${e.ticks}）`);
  check(slowAt.slice(0, 3).join() === '20,40,60', `减速逐跳 20→40→60%（实际 ${slowAt.join(',')}）`);
  check(stunAt === 4 && e.stuns === 1, `第 4 跳冻结一次（第 ${stunAt} 跳，共 ${e.stuns} 次）`);
  check(boss.stuns === 0 && boss.interrupts === 1 && boss.status.speedMultiplier === 1, `首领：不冻不减速，只打断 1 次`);
  // 火雨（转火焰）不带冻结
  const p2 = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e2 = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 });
  const fx2 = new EffectSystem(world([p2, e2]), () => 0.5); fx2.applySkill(only('blizzard', [{ ...z, element: 'fire' }], 'fire'), p2, [e2]);
  for (let t = 0; t < 9; t += 0.05) fx2.update(0.05);
  check(e2.stuns === 0 && e2.ticks === 8, `火雨：转火焰后不冻结、不叠减速（冻结 ${e2.stuns} 次）`);
}
{ const lp = def('warrior', 'heroic_leap'), ex = lp.effects.find(e => e.type === 'explode') as { radius: number }, sl = lp.effects.find(e => e.type === 'slow') as { percent: number; duration: number };
  check(ex.radius === 4 && sl.percent === 0.5 && sl.duration === 3, `英勇跳跃：落地 ${ex.radius} 米 / 减速 ${sl.percent * 100}% / ${sl.duration} 秒`); }
{ const ds = eff('bladestorm', 'warrior', 'dotStack');
  check(!!ds && ds.max === 5 && !def('warrior', 'bladestorm').effects.some(e => e.type === 'dot'), `剑刃风暴：每跳叠流血（每层 ${ds?.dpsPerStack}/秒，最多 ${ds?.max} 层）`);
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 }); p.dotPower = 1;
  const fx = new EffectSystem(world([p, e]), () => 0.5); const sk = only('bladestorm', [ds], 'physical');
  for (let i = 0; i < 12; i++) { fx.applySkill(sk, p, [e]); for (let k = 0; k < 10; k++) fx.update(0.05); }
  const st = e.status.stacks('dsk:bladestorm'), dot = e.status.dots().find(d => d.key === 'dot:bladestorm:physical');
  check(st === 5 && !!dot && Math.abs(dot.dps - 10) < 1e-6, `12 跳后 ${st} 层，流血每秒 ${dot?.dps}`);
  for (let k = 0; k < 120; k++) fx.update(0.05);
  console.log(`    单体 6 秒引导 + 4 秒余流血：流血总伤约 ${e.dmg}（原收尾一次 20/秒 × 4 秒 = 80）`);
}

console.log('\n=== ④ 地面区域吃范围加成 / 圆心在目标点（审计 G5 / G6） ===');
{ const R = new SkillResolver(new ComboTracker());
  const bz = def('mage', 'blizzard'); const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };
  const big = R.resolve(bz, [{ id: 'r', name: '大风雪', source: 'rune', desc: '', match: { skillIds: ['blizzard'] }, ops: [{ op: 'mul', stat: 'radius', value: 0.3 }] }], ctx);
  check(Math.abs((big.radScale ?? 1) - 1.3) < 1e-9 && Math.abs(big.stats.radius - 6.5) < 1e-9, `大风雪 +30%：半径 ${big.stats.radius}，倍率 ${big.radScale}`);
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 10, z: 0 }), edge = new Dummy('g', 'enemy', 1e9, { x: 6.2, z: 0 });
  const fx = new EffectSystem(world([p, e, edge]), () => 0.5);
  fx.applySkill(big, p, [], { x: 0, z: 0 });
  check(fx.activeZones.length === 1 && Math.abs(fx.activeZones[0].radius - 6.5) < 1e-9 && fx.activeZones[0].pos.x === 0, `没打到人也铺区域，圆心在目标点，区域半径 ${fx.activeZones[0]?.radius}（原写死 5）`);
  for (let t = 0; t < 9; t += 0.05) fx.update(0.05);
  check(edge.ticks === 8 && e.ticks === 0, `6.2 米处的敌人吃满 8 跳（原 5 米圈外）；10 米外不吃`);
  const plain = R.resolve(bz, [], ctx); check((plain.radScale ?? 1) === 1, '无范围加成：倍率 1');
}

console.log(fails ? `\n✗ ${fails} 项失败` : '\nALL PASS');
if (fails) process.exitCode = 1;
