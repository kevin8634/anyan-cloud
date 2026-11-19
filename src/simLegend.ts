// 运行：npm run legend —— v0.6.9 橙装特效：每职业 +6、4 件多职业首饰、5 类特效、护盾 / 叠层冻结 / 第 3 次必暴 / 溢出治疗转护盾、老装备刷新、按职业显示
import { CondFlags } from './core/CondFlags';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { Loadout } from './core/Loadout';
import { ResolvedSkill, SLOT_IDS, ModifierDef } from './core/types';
import { LootGenerator, ItemInstance } from './core/Loot';
import { gearLayers } from './core/GearView';
import { CLASSES } from './data/classes';
import { LOOT_DATA, LEGENDARIES_OLD as LEGENDARIES } from './data/loot';   // v0.9.1o：本测试校验老特效数据；新池见 simLegend91
import { WARRIOR_LG_069, MAGE_LG_069, SHARED_LG_069, LG_KINDS } from './data/legendary_v069';
import { DUNGEON_SET_ITEMS } from './data/dungeon_new';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; dmg = 0; crits = 0; stuns = 0; ccImmune = false; critChance = 0; critMult = 2;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number, _e: unknown, _s: unknown, crit?: boolean) { this.dmg += n; if (crit) this.crits++; }
  onInterrupt() { this.stuns++; return false; }
}
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };
const noop = { execute: (_s: ResolvedSkill) => {} };

console.log('=== 数据 ===');
check(WARRIOR_LG_069.length === 6 && MAGE_LG_069.length === 6 && SHARED_LG_069.length === 4, '每职业 +6 件职业专属橙装，4 件多职业首饰');
const all069 = [...WARRIOR_LG_069, ...MAGE_LG_069, ...SHARED_LG_069];
check(LG_KINDS.every(k => all069.some(l => l.kind === k)), `5 类特效都有：${LG_KINDS.map(k => `${k} ${all069.filter(l => l.kind === k).length}`).join('，')}`);
check(new Set(LEGENDARIES.map(l => l.id)).size === LEGENDARIES.length && all069.every(l => LEGENDARIES.includes(l)), `传说池共 ${LEGENDARIES.length} 个，id 不重复`);
check(WARRIOR_LG_069.every(l => l.cls === 'warrior' && l.slots.every(s => !['neck', 'ring', 'trinket', 'back'].includes(s))) && MAGE_LG_069.every(l => l.cls === 'mage'), '武器 / 护甲橙装职业专属');
check(SHARED_LG_069.every(l => !l.cls && l.slots.every(s => ['neck', 'ring', 'trinket', 'back'].includes(s)) && [l.modifier, ...(l.extra ?? [])].map(m => m.cls).sort().join() === 'alchemy,chrono,mage,warrior'), '首饰 / 披风一件多职业：四职业各一条（v0.7.4 补新职业）');
// 每条特效指向的技能都存在于对应职业
for (const l of all069) {
  const mods = [l.modifier, ...(l.extra ?? [])];
  for (const m of mods) {
    const cls = (m.cls ?? l.cls) as 'warrior' | 'mage';
    const ids = m.match.skillIds ?? [];
    if (ids.length && !ids.every(id => CLASSES[cls].skills[id])) check(false, `${l.name}：技能 ${ids.join(',')} 不在 ${cls}`);
  }
}
check(true, '所有新橙装指向的技能都存在');

console.log('\n=== 每件都能掉、都能改出变种 ===');
for (const cls of ['warrior', 'mage'] as const) {
  const gen = new LootGenerator(LOOT_DATA, () => 0.5); gen.classId = cls;
  const pool = LOOT_DATA.legendaries.filter(l => !l.cls || l.cls === cls);   // v0.9.1o：掉落走新池
  const seen = new Set<string>();
  let r = 1; const rng = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const g2 = new LootGenerator(LOOT_DATA, rng); g2.classId = cls;
  for (let i = 0; i < 3000 && seen.size < pool.length; i++) { const it = g2.generate(30, 'orange'); if (it.lgId) seen.add(it.lgId); }
  check(seen.size === pool.length, `${cls}：橙装池 ${pool.length} 个特效都能掉到（3000 件内见到 ${seen.size}）`);
  void gen;
  // 每个新特效装上后，对应技能变了
  const c = CLASSES[cls];
  CondFlags.setTimed('oath', 99);   // v1.2.35 誓约护符改为立誓触发
  for (const l of [...(cls === 'warrior' ? WARRIOR_LG_069 : MAGE_LG_069), ...SHARED_LG_069]) {
    const lo = new Loadout(noop); lo.classId = cls;
    const mods = [l.modifier, ...(l.extra ?? [])].filter(m => !m.cls || m.cls === cls);
    const sid = mods[0].match.skillIds?.[0];
    const sk = sid ? c.skills[sid] : c.skills[c.loadout[mods[0].match.slots?.[0] as 'ultimate'] ?? c.loadout.ultimate];
    lo.equipSkill(sk, sk.slot === 'basic' ? 'basic' : sk.slot === 'ultimate' ? 'ultimate' : 'skill1');
    const slot = sk.slot === 'basic' ? 'basic' : sk.slot === 'ultimate' ? 'ultimate' : 'skill1';
    const before = JSON.stringify(lo.preview(slot, { ...ctx, casterHpPercent: 0.3, targetEffects: ['stun', 'slow'] as never[] }));
    lo.setItems([{ id: 'x', name: l.name, slot: l.slots[0], quality: 'orange', modifiers: [l.modifier, ...(l.extra ?? [])] } as never]);
    const after = lo.preview(slot, { ...ctx, casterHpPercent: 0.3, targetEffects: ['stun', 'slow'] as never[] });
    check(JSON.stringify(after) !== before, `${l.name}（${l.kind}）→ ${sk.name} 变为「${after?.displayName}」`);
  }
}

CondFlags.reset();
console.log('\n=== 新效果 ===');
{
  const units: Dummy[] = [];
  const world: CombatWorld = { units: () => units, resetCooldown: () => {} };
  const fx = new EffectSystem(world, () => 0.99);
  const me = new Dummy('p', 'player', 1000, { x: 0, z: 0 }); me.critChance = 0;
  const a = new Dummy('a', 'enemy', 1e6, { x: 2, z: 0 }), boss = new Dummy('b', 'enemy', 1e6, { x: 3, z: 0 }); boss.ccImmune = true;
  units.push(me, a, boss);
  const sk = (effects: ResolvedSkill['effects'], dmg = 100, id = 't'): ResolvedSkill => ({ baseId: id, displayName: id, slot: 'skill1', element: 'frost', shape: 'single', tags: [], stats: { damage: dmg, cooldown: 1, range: 5, radius: 0, projectileCount: 1, castTime: 0 } as never, effects, appliedModifiers: [] } as ResolvedSkill);
  // 护盾
  fx.applySkill(sk([{ type: 'shield', percentMaxHp: 0.12, duration: 6 }]), me, [a]);
  check(Math.round(me.status.shield) === 120, `护盾：最大生命 12% = ${Math.round(me.status.shield)}`);
  fx.dealDamage(me, 100, 'physical', a);
  check(me.hp === 1000 && Math.round(me.status.shield) === 20, `护盾吸收 100 伤害（剩 ${Math.round(me.status.shield)}，生命 ${me.hp}）`);
  fx.dealDamage(me, 100, 'physical', a);
  check(me.hp === 920 && me.status.shield === 0, `护盾破了，剩余伤害扣生命（${me.hp}）`);
  // 叠层冻结
  const st = sk([{ type: 'stackStun', stacks: 3, duration: 1, name: '冻结' }], 10, 'ff');
  fx.applySkill(st, me, [a]); fx.applySkill(st, me, [a]);
  check(!a.status.isStunned && a.status.stacks('stk:ff') === 2, '叠 2 层：还没冻结');
  fx.applySkill(st, me, [a, boss]);
  check(a.status.isStunned && a.status.stacks('stk:ff') === 0, '第 3 层：冻结，层数清零');
  fx.applySkill(st, me, [boss]); fx.applySkill(st, me, [boss]);
  check(!boss.status.isStunned && boss.stuns >= 1, `首领免控：不冻结，只打断（打断 ${boss.stuns} 次）`);
  // 第 3 次必暴
  const ce = sk([{ type: 'critEvery', n: 3 }], 100, 'cc');
  const c0 = a.crits; const out: number[] = [];
  for (let i = 0; i < 6; i++) { const before = a.crits; fx.applySkill(ce, me, [a]); out.push(a.crits - before); }
  check(out.join('') === '001001' && a.crits - c0 === 2, `第 3 / 6 次必暴（${out.join('')}）`);
  // 溢出治疗转护盾
  me.hp = 990; me.status.clear();
  fx.applySkill(sk([{ type: 'heal', percentOfDamage: 1, overflowShield: 0.2 }], 500, 'vamp'), me, [a]);
  check(me.hp === 1000 && Math.round(me.status.shield) === 200, `溢出治疗转护盾（上限 20% = ${Math.round(me.status.shield)}）`);
}

console.log('\n=== 现有橙装调整 + 老装备刷新 ===');
{
  const vamp = LEGENDARIES.find(l => l.id === 'lg_vampire')!, quake = LEGENDARIES.find(l => l.id === 'lg_quake_boots')!, ff = LEGENDARIES.find(l => l.id === 'lg_frostfire')!, split = LEGENDARIES.find(l => l.id === 'lg_split_staff')!;
  const eff = (l: typeof vamp) => l.modifier.ops.filter(o => o.op === 'addEffect').map(o => (o as { effect: { type: string } }).effect);
  check(eff(vamp).some(e => e.type === 'heal' && (e as never as { percentOfDamage: number }).percentOfDamage === 0.08 && (e as never as { overflowShield: number }).overflowShield === 0.2), '饮血者：吸血 15% → 8% + 溢出转护盾（≤ 20%）');
  check(eff(quake).some(e => e.type === 'explode' && (e as never as { damagePercent: number }).damagePercent === 0.8) && eff(quake).some(e => e.type === 'groundZone'), '裂地者：60% → 80% + 震裂地面 3 秒');
  check(eff(ff).some(e => e.type === 'slow' && (e as never as { percent: number }).percent === 0.3) && eff(ff).some(e => e.type === 'stackStun'), '霜火法珠：减速 50% → 30%，叠 3 次冻结');
  check(eff(split).some(e => e.type === 'critEvery'), '裂光法杖：第 3 发必暴');
  // 老存档里的饮血者胸甲（15% 版本）读档后刷新成新版本
  const gen = new LootGenerator(LOOT_DATA, () => 0.3); gen.classId = 'warrior';
  let it: ItemInstance | null = null;
  for (let i = 0; i < 400 && !it; i++) { const x = new LootGenerator(LOOT_DATA, Math.random); x.classId = 'warrior'; const y = x.generate(30, 'orange', ['chest']); if (y.lgId === 'lg_vampire') it = y; }
  check(!it, '饮血者胸甲不再掉落（v0.9.1o 胸部不出橙装）');
  if (it) {
    const old: ModifierDef = { ...it.modifiers.find(m => m.id.endsWith(':lg_vampire'))!, desc: '旋风斩变为暗影伤害，造成伤害的15%转化为生命' };
    old.ops = [{ op: 'setElement', value: 'shadow' }, { op: 'addEffect', effect: { type: 'heal', percentOfDamage: 0.15 } }];
    it.modifiers = it.modifiers.map(m => m.id === old.id ? old : m);
    it.lines = it.lines.map(l => l.startsWith('★') ? `★ ${old.desc}` : l);
    const nAff = it.affixLog?.length, nLines = it.lines.length;
    const changed = gen.refreshEffects(JSON.parse(JSON.stringify(it)));
    const fresh = JSON.parse(JSON.stringify(it)) as ItemInstance; gen.refreshEffects(fresh);
    check(changed && fresh.lines.filter(l => l.startsWith('★')).length === 1 && fresh.lines.some(l => l.includes('8%')) && !fresh.lines.some(l => l.includes('15%转化')), `读档刷新：★ ${fresh.lines.find(l => l.startsWith('★'))}`);
    check(fresh.lines.length === nLines && fresh.affixLog?.length === nAff && fresh.modifiers.filter(m => m.id.includes('lg_vampire')).length === 1, '刷新不动其它词条，特效不重复');
    check(!gen.refreshEffects(fresh), '再刷新一次：没有变化');
  }
}

// v0.9.1o：多职业首饰已归入战士（见 simLegend91）

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 橙装特效全部通过');
if (fails) process.exitCode = 1;
