// v0.7.4 觉醒 + 岩纹 + 槽位天赋 自动测试：npm run awaken
declare const process: { exitCode?: number };
import { canAwaken, onBossKill, choose, socketCount, openCost, insert, remove, wordOf, modsOf, awakenItem, runesOf } from './core/Awaken';
import { AWK_NEED, RUNE_WORDS, RUNE_STONES, AWK_AFFIXES } from './data/awaken';
import { slotTalents } from './core/TalentTree';
import { ItemInstance } from './core/Loot';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) fail++; };
const mk = (q: ItemInstance['quality'], slot: ItemInstance['slot'], tier?: ItemInstance['tier']): ItemInstance =>
  ({ id: `t_${q}_${slot}`, name: `${q} ${slot}`, slot, quality: q, modifiers: [], baseId: 'x', itemLevel: 30, hp: 0, armor: 0, lines: [], sellPrice: 1, tier } as ItemInstance);
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const pW = mk('purple', 'twoHand'), bD = mk('blue', 'ring', 'dungeon'), bW = mk('blue', 'chest', 'wild'), oC = mk('orange', 'chest'), dW = mk('dark', 'oneHand');
ok(canAwaken(pW) && canAwaken(bD) && !canAwaken(bW), '可觉醒：紫装 / 副本蓝装可以，野外蓝装不行');
for (let i = 0; i < AWK_NEED - 1; i++) onBossKill([pW, bD, bW], 'dungeon', rng);
ok(pW.awk!.xp === AWK_NEED - 1 && !pW.awk!.opts && bW.kills === AWK_NEED - 1 && !bW.awk, `历练 ${pW.awk!.xp}/${AWK_NEED}，野外蓝装只记击杀数`);
const ready = onBossKill([pW, bD], 'dungeon', rng);
ok(ready.length === 2 && pW.awk!.opts!.length === 3 && new Set(pW.awk!.opts).size === 3, `历练满：3 个不重复选项 ${pW.awk!.opts!.join(',')}`);
ok(pW.awk!.opts!.every(id => AWK_AFFIXES.find(a => a.id === id)!.groups.includes('weapon')), '武器只抽武器词条');
const r2 = onBossKill([mk('purple', 'neck')], 'raid', rng)[0];
ok(!r2 && true, '长副本首领 +2 历练（单次不满）');
ok(choose(pW, 1) === null && !!pW.awk!.pick && !pW.awk!.opts && modsOf(pW).length === 1, `选择隐藏词条：${pW.awk!.pick}`);
ok(choose(pW, 0) !== null, '选过不能再选');
onBossKill([pW], 'raid', rng); ok(pW.awk!.xp === AWK_NEED && !pW.awk!.opts, '已觉醒装备继续计击杀但不再出选项');

ok(socketCount(pW) === 1 && socketCount(oC) === 2 && socketCount(dW) === 3 && socketCount(bD) === 0, '孔数：紫 1 / 橙 2 / 暗金 3 / 首饰 0');
ok(openCost(pW)!.gold === 400 && openCost(dW) === null, '开孔花费随孔数递增，满 3 孔不能再开');
const bag: Record<string, number> = {}; RUNE_STONES.forEach(r => bag[r.id] = 3);
const take = (id: string) => bag[id] > 0 ? (bag[id]--, true) : false, give = (id: string) => { bag[id]++; };
const w = RUNE_WORDS[0];
w.seq.forEach((s, i) => ok(insert(dW, i, s, take, give) === null, `镶嵌 ${s} → 孔 ${i + 1}`));
ok(wordOf(dW)?.id === w.id && modsOf(dW).length === 4, `纹语「${w.name}」触发（3 颗岩纹 + 纹语 = 4 个修饰器）`);
ok(insert(dW, 0, w.seq[1], take, give) === null && !wordOf(dW) && bag[w.seq[0]] === 3, '换掉一颗：顺序错了纹语消失，原岩纹退回');
ok(remove(dW, 0, give) === null && runesOf(dW)[0] === null && remove(dW, 0, give) !== null, '取下岩纹 / 空孔不能取');
ok(insert(bD, 0, 'rs_blaze', take, give) !== null, '首饰不能镶岩纹');
ok(new Set(RUNE_WORDS.map(x => x.seq.join())).size === RUNE_WORDS.length, `${RUNE_WORDS.length} 条纹语顺序互不相同`);
const all = awakenItem([pW, dW, bD]);
ok(!!all && all.modifiers.every(m => !m.match.skillIds), '觉醒 / 岩纹修饰器都按槽位或通用匹配（4 职业通用）');

const nodes = [{ id: 'a', modifier: { id: 'a', name: 'a', desc: '', source: 'talent' as const, match: { skillIds: ['charge'] }, ops: [] } },
  { id: 'b', modifier: { id: 'b', name: 'b', desc: '', source: 'talent' as const, match: { skillIds: ['slash'] }, ops: [] } },
  { id: 'c', modifier: { id: 'c', name: 'c', desc: '', source: 'talent' as const, match: { tagsAny: ['melee'] }, ops: [] } }];
const st = slotTalents(nodes, id => id === 'charge' ? 'skill1' : undefined);
ok(JSON.stringify(st[0].modifier.match) === '{"slots":["skill1"]}' && st[1].modifier.match.skillIds![0] === 'slash' && st[2] === nodes[2], '天赋按槽位：冲锋天赋 → 技能 1 槽；找不到槽位的保持原样');

// ===== v1.2.37 觉醒重做 + 冷却缩减上限 + 迁移 =====
import { migrateAwk, ultCdrCap, affixDef as affixDef37 } from './core/Awaken';
import { SkillResolver } from './core/SkillResolver';
import { ComboTracker } from './core/ComboTracker';
import { Loadout } from './core/Loadout';
import { EffectSystem, StatusSet, CombatUnit } from './core/Combat';
{
  const gone = ['aw_hold', 'aw_swift', 'aw_dash', 'aw_focus', 'aw_reach', 'aw_echo'];
  ok(gone.every(id => !AWK_AFFIXES.some(a => a.id === id)) && AWK_AFFIXES.length === 15, `觉醒池：删 6 个旧词条、暮时改终局、新增 5 个，共 ${AWK_AFFIXES.length} 个`);
  const items = [mk('purple', 'neck'), mk('purple', 'chest'), mk('purple', 'oneHand'), mk('purple', 'ring'), mk('purple', 'legs'), mk('purple', 'trinket')];
  items[0].awk = { xp: 5, pick: 'aw_focus' }; items[1].awk = { xp: 5, pick: 'aw_hold' }; items[2].awk = { xp: 5, pick: 'aw_echo' };
  items[3].awk = { xp: 5, pick: 'aw_echo' }; items[4].awk = { xp: 5, opts: ['aw_swift', 'aw_hold', 'aw_ward'] }; items[5].awk = { xp: 5, pick: 'aw_edge_unknown' };
  ok(!!affixDef37('aw_focus') && affixDef37('aw_echo', 'jewel')!.id === 'aw_surge', '未迁移的旧 id 也能读到等价词条（不报错）');
  const n = migrateAwk(items, rng);
  ok(n === 5 && items[0].awk!.pick === 'aw_surge' && items[1].awk!.pick === 'aw_quake' && items[2].awk!.pick === 'aw_link' && items[3].awk!.pick === 'aw_surge', `已选迁移：专注→余烬回涌、凝滞→余震、回刃（武器）→连携、回刃（首饰）→余烬回涌（${items.map(i => i.awk?.pick).join(',')}）`);
  const o = items[4].awk!.opts!;
  ok(o.length === 3 && new Set(o).size === 3 && o.every(id => AWK_AFFIXES.find(a => a.id === id)!.groups.includes('armor')) && o.includes('aw_quake') && o.includes('aw_ward'), `待选迁移：去重补足 3 个护甲词条（${o.join(',')}）`);
  ok(items[5].awk!.pick === 'aw_edge_unknown' && modsOf(items[5]).length === 0, '不认识的词条：原样保留、不生效、不报错');
  const dusk = [0, 1, 2, 3, 4].map(i => { const it = mk('purple', i % 2 ? 'chest' : 'neck'); it.id += i; it.awk = { xp: 5, pick: 'aw_dusk' }; return it; });
  ok(ultCdrCap([]) === 0.4 && Math.abs(ultCdrCap(dusk.slice(0, 2)) - 0.6) < 1e-9 && Math.abs(ultCdrCap(dusk) - 0.8) < 1e-9, '大招冷却缩减上限：0 件 40% / 2 件 60% / 5 件封顶 80%');
  // 冷却缩减封顶
  const R = new SkillResolver(new ComboTracker());
  const sk = (slot: 'basic' | 'skill1' | 'ultimate', cd: number) => ({ id: slot, name: slot, slot, element: 'physical', shape: 'cone', tags: [], effects: [], stats: { damage: 100, cooldown: cd, range: 3, radius: 3, projectileCount: 1, cost: 0 } } as never);
  const cdm = (v: number, slots?: string[]) => ({ id: 'cd' + v + slots, name: 'cd', desc: '', source: 'equipment' as const, match: slots ? { slots } : {}, ops: [{ op: 'mul' as const, stat: 'cooldown' as const, value: v }] }) as never;
  const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] };
  ok(Math.abs(R.resolve(sk('skill1', 10), [cdm(-0.7)], ctx).stats.cooldown - 6) < 1e-9, '技能冷却缩减 70% → 封顶 40%（10 → 6 秒）');
  ok(Math.abs(R.resolve(sk('basic', 1), [cdm(-0.3)], ctx).stats.cooldown - 1) < 1e-9 && Math.abs(R.resolve(sk('basic', 1), [cdm(-0.3, ['basic'])], ctx).stats.cooldown - 0.7) < 1e-9, '普攻不吃通用冷却缩减；点名普攻的（急速）照常缩短间隔');
  const lo = new Loadout({ execute: () => {} });
  lo.setUltCdrCap(ultCdrCap(dusk.slice(0, 4)));
  lo.equipSkill(sk('ultimate', 45), 'ultimate'); lo.setComboModifiers([cdm(-0.9)]);
  ok(Math.abs(lo.preview('ultimate', ctx)!.stats.cooldown - 9) < 1e-6, `4 件暮时·终局 + 冷却缩减堆满：45 秒大招 → ${lo.preview('ultimate', ctx)!.stats.cooldown.toFixed(1)} 秒`);
  lo.setUltCdrCap(0.4); ok(Math.abs(lo.preview('ultimate', ctx)!.stats.cooldown - 27) < 1e-6, '没有终局觉醒：45 秒大招最低 27 秒');
  // 新效果：余震 / 余烬回涌 / 汲血
  const units: CombatUnit[] = [];
  const U = (uid: string, f: 'player' | 'enemy', hp: number, x: number): CombatUnit => { const u: CombatUnit = { uid, faction: f, status: new StatusSet(), hp, maxHp: hp, get alive() { return this.hp > 0; }, getPos: () => ({ x, z: 0 }) }; units.push(u); return u; };
  const P = U('p', 'player', 1000, 0), e1 = U('a', 'enemy', 1000, 1), e2 = U('b', 'enemy', 50, 1.5);
  const red: [string, number][] = [];
  const fx = new EffectSystem({ units: () => units, resetCooldown() {}, reduceCooldown: (_o, s, sec) => { red.push([s, sec]); } }, () => 0.99);
  P.hp = 500;
  const rs = (effects: unknown[]) => ({ baseId: 'x', displayName: 'x', slot: 'skill3', element: 'physical', shape: 'cone', tags: [], stats: { damage: 100, cooldown: 1, range: 3, radius: 3, projectileCount: 1, cost: 0 }, effects, appliedModifiers: [] } as never);
  fx.applySkill(rs([{ type: 'aftershock', delay: 1, radius: 3, damagePercent: 0.5 }, { type: 'killHeal', percentMaxHp: 0.03 }, { type: 'cdRefund', perHit: 0.5, max: 3, slots: ['skill1', 'skill2'] }]), P, [e1, e2]);
  ok(!e2.alive && P.hp === 530, `汲血：技能击杀 1 个敌人回复 3% 最大生命（${P.hp}）`);
  ok(red.length === 2 && red[0][1] === 1, `余烬回涌：命中 2 个 → 技能冷却 -1 秒（${JSON.stringify(red)}）`);
  const h0 = e1.hp; fx.update(0.5); const h1 = e1.hp; fx.update(0.6);
  ok(h1 === h0 && e1.hp === h0 - 50, `余震：1 秒后在命中点再震 50%（${h0} → ${e1.hp}）`);
}
console.log(fail ? `\n❌ ${fail} 项失败` : '\n✅ 觉醒 / 岩纹 / 槽位天赋 全部通过');
process.exitCode = fail ? 1 : 0;
