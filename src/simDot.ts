// 运行：npm run dot —— v0.9.1l 伤害底座：持续伤害随强度 / 急速缩放、可暴击；装备按技能 ID 写的修饰器换技能后按槽位生效
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction, dotInterval } from './core/Combat';
import { Loadout } from './core/Loadout';
import { ModifierDef, ResolvedSkill, SlotId } from './core/types';
import { SkillBook } from './core/SkillBook';
import { CLASSES, skillBookData } from './data/classes';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; dmg = 0; ticks = 0; crits = 0;
  dotPower?: number; haste?: number; critChance?: number; critMult?: number;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number, _e: unknown, _s: unknown, crit?: boolean, tick?: boolean) { this.dmg += n; if (tick) { this.ticks++; if (crit) this.crits++; } }
}
function world(units: Dummy[]): CombatWorld { return { units: () => units, resetCooldown: () => {} }; }
const dotSkill = (dps: number, duration: number): ResolvedSkill => ({ baseId: 't', displayName: 't', slot: 'skill1', element: 'physical', shape: 'single', tags: [], stats: { damage: 0, cooldown: 1, range: 5, radius: 0, projectileCount: 1, cost: 0 } as ResolvedSkill['stats'], effects: [{ type: 'dot', element: 'physical', dps, duration }], appliedModifiers: [] });

function runDot(power: number, haste: number, crit = 0) {
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 });
  p.dotPower = 1 + power * 0.004; p.haste = haste; p.critChance = crit; p.critMult = 2;
  const fx = new EffectSystem(world([p, e]), () => 0.5);
  fx.applySkill(dotSkill(10, 4), p, [e]);
  for (let t = 0; t < 6; t += 0.05) fx.update(0.05);
  return e;
}
console.log('\n=== 持续伤害缩放 ===');
const a = runDot(0, 0); check(a.ticks === 4 && Math.abs(a.dmg - 40.6) <= 1, `无强度无急速：4 跳，侵蚀 0–3 层共 40.6（实际 ${a.ticks} 跳 ${a.dmg}）`);
const b = runDot(100, 0); check(b.ticks === 4 && Math.abs(b.dmg - 56.84) <= 1, `强度 100：每跳 ×1.4，含侵蚀共 56.84（实际 ${b.dmg}）`);
const c = runDot(0, 0.25); check(c.ticks === 5 && Math.abs(c.dmg - 50.3) <= 1, `急速 25%：跳间隔 ${dotInterval({ haste: 0.25 } as CombatUnit).toFixed(2)} 秒，4 秒内 5 跳（0.8 秒一跳，侵蚀按秒叠）（实际 ${c.ticks} 跳 ${c.dmg}）`);
const d = runDot(0, 0, 1); check(d.crits === d.ticks && Math.abs(d.dmg - 60.9) <= 1, `暴击率 100%：暴伤 ×2 只吃一半 → ×1.5，共约 60.9（实际 ${d.dmg}）`);
console.log('\n=== v1.2.35 持续伤害路线 V1 ===');
{ const e = runDot(0, 0.4); check(e.ticks === 6 && Math.abs(e.dmg - 57.3) <= 1.5, `急速 40%：5.6 跳 → 5 整跳 + 0.6 跳，含侵蚀约 57.3（实际 ${e.ticks} 跳 ${e.dmg.toFixed(2)}）`); }
{ // 传染：2 秒时重放 4 秒 dot → 4 + min(2, 1.2) = 5.2 秒
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 }); p.dotPower = 1;
  const fx = new EffectSystem(world([p, e]), () => 0.5); fx.applySkill(dotSkill(10, 4), p, [e]);
  for (let t = 0; t < 2 - 1e-9; t += 0.05) fx.update(0.05);
  fx.applySkill(dotSkill(10, 4), p, [e]); for (let t = 0; t < 8; t += 0.05) fx.update(0.05);
  check(e.ticks === 8, `传染刷新：前 2 跳 + 新的 5.2 秒（5 整跳 + 0.2 跳）= 8 跳（实际 ${e.ticks}）`);
}
{ // 侵蚀封顶 40 层：长 dot 跑 80 跳，最后一跳 ×2
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 }); p.dotPower = 1;
  const fx = new EffectSystem(world([p, e]), () => 0.5); fx.applySkill(dotSkill(10, 80), p, [e]);
  let last = 0, prev = 0; for (let t = 0; t < 81; t += 0.05) { fx.update(0.05); if (e.dmg !== prev) { last = e.dmg - prev; prev = e.dmg; } }
  check(e.ticks === 80 && Math.abs(last - 14) < 0.01 && e.status.stacks('erosion') === 40, `侵蚀满 40 层：每跳 10 → 14（实际最后一跳 ${last.toFixed(2)}，层数 ${e.status.stacks('erosion')}）`);
}
{ // 动态：施加后强度提高，后续每跳跟着变
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 1, z: 0 }); p.dotPower = 1;
  const fx = new EffectSystem(world([p, e]), () => 0.5); fx.applySkill(dotSkill(10, 2), p, [e]); fx.update(1.0); p.dotPower = 2; fx.update(1.0);
  check(Math.abs(e.dmg - (10 + 20 * 1.01)) <= 1, `动态 dot：第 2 跳读新强度（实际 ${e.dmg.toFixed(2)}）`);
}
{ // 怪物不填 dotPower：固定数值、不暴击
  const m = new Dummy('m', 'enemy', 100, { x: 0, z: 0 }), t = new Dummy('t', 'player', 1e9, { x: 1, z: 0 }); m.critChance = 1;
  const fx = new EffectSystem(world([m, t]), () => 0.5); fx.applySkill(dotSkill(10, 4), m, [t]); for (let k = 0; k < 120; k++) fx.update(0.05);
  check(t.dmg === 40 && t.crits === 0, `怪物持续伤害保持固定数值（实际 ${t.dmg}）`);
}
{ // 地面区域同样缩放
  const p = new Dummy('p', 'player', 100, { x: 0, z: 0 }), e = new Dummy('e', 'enemy', 1e9, { x: 0.5, z: 0 }); p.dotPower = 1.5; p.haste = 0.25;
  const fx = new EffectSystem(world([p, e]), () => 0.5);
  const s = dotSkill(0, 0); s.effects = [{ type: 'groundZone', element: 'fire', dps: 10, radius: 3, duration: 4 }];
  fx.applySkill(s, p, [e]); for (let k = 0; k < 120; k++) fx.update(0.05);
  check(e.ticks === 5 && Math.abs(e.dmg - 75) <= 1, `地面区域：强度 ×1.5、急速 25% → 5 跳共 75（实际 ${e.ticks} 跳 ${e.dmg}）`);
}

console.log('\n=== 换技能后装备修饰器按槽位生效 ===');
const W = CLASSES.warrior;
const book = new SkillBook(skillBookData(W));
const lo = new Loadout({ execute: () => {} });
lo.modRemap = m => book.remapToSlot(m);
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };
const gearMod: ModifierDef = { id: 'g_ww', name: '旋风斩伤害', source: 'equipment', desc: '', priority: 50, match: { skillIds: ['whirlwind'] }, ops: [{ op: 'mul', stat: 'damage', value: 0.5 }] };
const formMod: ModifierDef = { id: 'g_lava', name: '熔岩', source: 'equipment', desc: '', priority: 30, match: { skillIds: ['whirlwind'] }, ops: [{ op: 'rename', name: '熔岩旋风斩' }] };
const runeMod: ModifierDef = { id: 'r_ww', name: '符文', source: 'rune', desc: '', priority: 40, match: { skillIds: ['whirlwind'] }, ops: [{ op: 'mul', stat: 'damage', value: 1 }] };
lo.setItems([{ id: 'x', name: 'x', slot: 'chest', quality: 'purple', modifiers: [gearMod, formMod, runeMod] }]);
const alt = book.options('skill2' as SlotId).find(s => s.id !== 'whirlwind')!;
lo.equipSkill(W.skills.whirlwind, 'skill2');
const base = lo.preview('skill2', ctx)!;
check(base.displayName === '熔岩旋风斩' && Math.abs(base.stats.damage - W.skills.whirlwind.stats.damage * 2.5) < 0.01, `原技能：整名换成熔岩旋风斩，伤害 +50% +100%（${base.displayName} ${base.stats.damage}）`);
book.learn(alt.id); book.setSkill('skill2', alt.id); lo.equipSkill(alt, 'skill2');
const sw = lo.preview('skill2', ctx)!;
check(Math.abs(sw.stats.damage - alt.stats.damage * 1.5) < 0.01, `换成「${alt.name}」：装备 +50% 仍生效，符文不跟随（${sw.stats.damage} = ${alt.stats.damage} × 1.5）`);
check(sw.displayName === `熔岩·${alt.name}`, `改形态的整名重命名改成前缀（${sw.displayName}）`);

console.log(fails ? `\n✗ ${fails} 项失败` : '\n✅ 伤害底座全部通过');
if (fails) process.exitCode = 1;
