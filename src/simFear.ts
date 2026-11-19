// 运行：tsc && node dist/simFear.js —— v1.2.77 方案 B：恐惧（小怪逃跑不攻击）/ 首领免疫改易伤 / 雷电元素
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction, applyFear } from './core/Combat';
import { EnemyBrain } from './core/EnemyBrain';
import { ResolvedSkill } from './core/types';
declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; dmg = 0; interrupted = 0;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos, public ccImmune = false) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number) { this.dmg += n; }
  onInterrupt() { this.interrupted++; return true; }
}
const world = (u: Dummy[]): CombatWorld => ({ units: () => u, resetCooldown: () => {} });
const sk = (eff: ResolvedSkill['effects'], dmg = 0, element: ResolvedSkill['element'] = 'shadow'): ResolvedSkill => ({ baseId: 'f', displayName: 'f', slot: 'skill1', element, shape: 'single', tags: [], stats: { damage: dmg, cooldown: 1, range: 5, radius: 0, projectileCount: 1, castTime: 0, cost: 0 }, effects: eff } as unknown as ResolvedSkill);

console.log('\n=== 恐惧 ===');
const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), m = new Dummy('m', 'enemy', 1000, { x: 2, z: 0 }), b = new Dummy('b', 'enemy', 1e6, { x: -2, z: 0 }, true);
const fx = new EffectSystem(world([p, m, b]), () => 0.5);
fx.applySkill(sk([{ type: 'fear', duration: 2, bossVuln: 0.1 }]), p, [m, b]);
check(m.status.fearFrom === p && m.interrupted === 1, '小怪被恐惧：来源 = 施法者，并被打断');
check(b.status.fearFrom === undefined && Math.abs(b.status.vuln - 0.1) < 1e-9, '首领免疫恐惧，改为易伤 10%');
let hits = 0; const brain = new EnemyBrain(m, { x: 2, z: 0 }, undefined, () => { hits++; });
brain.provoke();
const it = brain.update(0.1, p);
check(!!it.moveDir && it.moveDir.x > 0.9 && !it.attacked, `恐惧中背对玩家逃跑、不攻击（方向 x=${it.moveDir?.x.toFixed(2)}）`);
for (let t = 0; t < 2.2; t += 0.1) fx.update(0.1);
check(m.status.fearFrom === undefined, '2 秒后恐惧结束');
const it2 = brain.update(0.1, p); check(!it2.moveDir || it2.moveDir.x < 0, '恐惧结束后回头追击 / 攻击');
console.log('\n=== 易伤 ===');
const b2 = new Dummy('b2', 'enemy', 1e6, { x: 1, z: 0 }, true), fx2 = new EffectSystem(world([p, b2]), () => 0.5);
fx2.dealDamage(b2, 100, 'shadow', p); const d0 = b2.dmg; applyFear(b2, p, 1.5, 0.1); fx2.dealDamage(b2, 100, 'shadow', p);
check(d0 === 100 && b2.dmg - d0 === 110, `易伤 +10%：${d0} → ${b2.dmg - d0}`);
console.log('\n=== 雷电元素 ===');
const t = new Dummy('t', 'enemy', 1e6, { x: 1, z: 0 }), fx3 = new EffectSystem(world([p, t]), () => 0.5);
fx3.dealDamage(t, 50, 'lightning', p); check(t.dmg === 50, '雷电伤害正常结算（不吃护甲）');
console.log(fails ? `\n${fails} 项失败` : '\n全部通过'); if (fails) process.exitCode = 1;
