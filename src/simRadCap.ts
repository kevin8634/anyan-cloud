// v1.2.73 范围加成封顶回归：Σ范围 mul ≤ +50%，溢出每 10% 换伤害 +3%，最多 +15%
import { SkillResolver, RADIUS_CAP } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
let fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
const R = new SkillResolver(new ComboTracker());
const sk: any = { id: 'blizzard', name: 'b', slot: 'skill2', element: 'frost', shape: 'circle', tags: ['aoe'], effects: [], stats: { damage: 100, cooldown: 12, range: 16, radius: 5, projectileCount: 0, duration: 0 } };
const rm = (v: number): any => ({ id: 'r' + v, name: 'r', desc: '', source: 'equipment', match: {}, ops: [{ op: 'mul', stat: 'radius', value: v }] });
const ctx: any = { now: 0, casterHpPercent: 1, targetEffects: [] };
const a = R.resolve(sk, [rm(0.3)], ctx); ok(Math.abs(a.stats.radius - 6.5) < 1e-9 && Math.abs(a.stats.damage - 100) < 1e-9 && !a.radCap, '+30%：半径 6.5，伤害不变');
const b = R.resolve(sk, [rm(0.3), rm(0.4)], ctx); ok(Math.abs(b.stats.radius - 7.5) < 1e-9 && Math.abs(b.stats.damage - 106) < 1e-9, `+70%：半径封顶 7.5，伤害 ${b.stats.damage.toFixed(1)}（+6%）`);
const c = R.resolve(sk, [rm(0.8), rm(0.9)], ctx); ok(Math.abs(c.stats.radius - 7.5) < 1e-9 && Math.abs(c.stats.damage - 115) < 1e-9, `+170%：半径 7.5，伤害 ${c.stats.damage.toFixed(1)}（封顶 +15%）`);
ok(RADIUS_CAP === 0.5, '上限常量 0.5');
console.log(fail ? 'FAIL' : 'ALL PASS'); (globalThis as any).process?.exit(fail ? 1 : 0);
