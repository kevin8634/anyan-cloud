// 运行：npm run sets —— v0.5 B：套装（2/4 件生效与移除、已损坏不计件数、4 件技能变种）、并入主线暗金的 4 件 B 暗金（效果都真的触发）、
//        套装保底收敛（主线 v0.6.6：长副本首领掉率）、存档 v6→v7
//        （B 的噩梦掉率 / 典藏任务链测试随系统退役：暗金走 A 的 darkgold.ts，测试在 playtest p63）
import { CombatUnit, CombatWorld, EffectSystem, StatusSet, Pos, Faction } from './core/Combat';
import { Loadout } from './core/Loadout';
import { SlotId, ResolvedSkill, SLOT_IDS } from './core/types';
import { LootGenerator, ItemInstance } from './core/Loot';
import { Inventory } from './core/Inventory';
import { Forge } from './core/Forge';
import { CLASSES } from './data/classes';
import { LOOT_DATA, LEGENDARIES_OLD } from './data/loot';
import { SETS, ALL_SET_BONUSES, classSet, RAID_SET_CHANCE } from './data/sets';
import { DARK_ITEMS, RELIC_TO_DARK } from './data/darkgold';
import { FORGE_DATA } from './data/shop';
import { rollSetPiece, newPity, PITY_FORCE, PITY_BIAS, SetPityState } from './core/Sets';
import { SaveManager, SaveStorage, SAVE_VERSION } from './core/SaveManager';

declare const process: { argv: string[]; exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

class Dummy implements CombatUnit {
  status = new StatusSet(); hp: number; healed = 0; dmg = 0;
  constructor(public uid: string, public faction: Faction, public maxHp: number, public pos: Pos) { this.hp = maxHp; }
  get alive() { return this.hp > 0; }
  getPos() { return this.pos; }
  onDamaged(n: number) { this.dmg += n; }
  onHealed(n: number) { this.healed += n; }
}
const noop = { execute: (_s: ResolvedSkill) => {} };
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };
/** 某职业的一套技能栏 + 给定装备的 Loadout */
function loadoutFor(cls: 'warrior' | 'mage', items: ItemInstance[]) {
  const c = CLASSES[cls], lo = new Loadout(noop);
  SLOT_IDS.forEach(s => lo.equipSkill(c.skills[c.loadout[s]], s));
  lo.setSetBonuses(ALL_SET_BONUSES); lo.setItems(items);
  return lo;
}
const skillIn = (lo: Loadout, slot: SlotId) => lo.preview(slot, ctx)!;

// =====================================================================
console.log('== 1. 套装 2 件 / 4 件：生效与移除 ==');
for (const cls of ['warrior', 'mage'] as const) {
  const set = classSet(cls)!;
  const gen = new LootGenerator(LOOT_DATA, seeded(cls === 'warrior' ? 3 : 4)); gen.classId = cls;
  const inv = new Inventory(40, { hp: 1000, armor: 0 }); inv.setBonuses = ALL_SET_BONUSES; inv.rules = CLASSES[cls].equip;
  const pieces = set.pieces.map(id => gen.generateFixed(id, 30)!);
  check(pieces.length === 6 && pieces.every(p => p.setId === set.id && p.fixedId && p.quality === 'purple' && p.itemLevel === 30 && p.lines.length >= 2),
    `${set.className}「${set.name}」6 件：${set.pieceNames.join(' / ')}（史诗，装等跟随，带 2 条随机词条）`);
  const slot4 = set.bonuses.find(b => b.pieces === 4)!.modifier!;
  const target: SlotId = cls === 'warrior' ? 'skill2' : 'skill2';
  const base0 = inv.stats();
  const lo = loadoutFor(cls, []);
  const name0 = skillIn(lo, target).displayName;
  const results: string[] = [];
  const eff0 = skillIn(lo, target).effects.length;
  for (let n = 1; n <= 6; n++) {
    inv.add(pieces[n - 1]); inv.equip(pieces[n - 1].id);
    lo.setItems(inv.activeItems());
    const st = inv.stats(), sk = skillIn(lo, target);
    results.push(`${n}件 ${inv.setCounts().get(set.id)} ${sk.displayName}`);
    if (n === 1) check(st.crit === base0.crit + (pieces[0].bonus?.crit ?? 0) && st.haste === base0.haste + (pieces[0].bonus?.haste ?? 0), '1 件：没有套装加成');
    if (n === 2) {
      const b2 = set.bonuses.find(b => b.pieces === 2)!;
      const raw = pieces.slice(0, 2).reduce((a, p) => a + (p.bonus?.haste ?? 0), 0);
      check(!b2.stats && Math.abs(st.haste - (raw + base0.haste)) < 0.01 && !sk.appliedModifiers.includes(slot4.id), `2 件：特殊效果、不加副属性（${(b2.desc ?? "").slice(0, 12)}…），技能还没变`);
    }
    if (n === 3) check(!sk.appliedModifiers.includes(slot4.id) && sk.displayName === name0, '3 件：4 件效果未激活');
    if (n === 4) {
      check(sk.appliedModifiers.includes(slot4.id) && sk.displayName !== name0 && sk.tags.some(t => t.startsWith('fx_')) && sk.effects.length > eff0,
        `4 件：${name0} → 「${sk.displayName}」（半径 ${sk.stats.radius.toFixed(1)}，附加效果 ${sk.effects.map(e => e.type).join('/')}；外观标签 ${sk.tags.filter(t => t.startsWith('fx_')).join(',')}）`);
    }
    if (n === 6) check(set.bonuses.some(b => b.pieces === 6 && !b.stats && (b.desc ?? "").includes("通用")), `6 件：按主专精 / 终极天赋分支 + 通用版（${(set.bonuses.find(b => b.pieces === 6)!.desc ?? "").slice(0, 16)}…）`);
  }
  // 移除：卸下 3 件 → 3 件，4 件效果消失；再卸到 1 件 → 2 件属性消失
  inv.unequip('legs'); inv.unequip('hands'); inv.unequip('wrist'); lo.setItems(inv.activeItems());
  check(inv.setCounts().get(set.id) === 3 && !skillIn(lo, target).appliedModifiers.includes(slot4.id), '卸下 3 件（剩 3 件）：4 件效果移除，技能恢复原形');
  inv.unequip('chest'); inv.unequip('shoulder'); lo.setItems(inv.activeItems());
  check(inv.stats().haste === (pieces[0].bonus?.haste ?? 0) + base0.haste, '剩 1 件：2 件属性加成也移除');
  // 已损坏不算件数
  for (const p of pieces.slice(1)) inv.equip(p.id);
  lo.setItems(inv.activeItems());
  check(inv.setCounts().get(set.id) === 6 && skillIn(lo, target).appliedModifiers.includes(slot4.id), '重新穿齐 6 件：4 件效果回来');
  pieces[0].durability = 0; pieces[1].durability = 0; pieces[2].durability = 0; inv.notify(); lo.setItems(inv.activeItems());
  check(inv.setCounts().get(set.id) === 3 && !skillIn(lo, target).appliedModifiers.includes(slot4.id), '3 件已损坏（耐久 0）：只算 3 件，4 件效果失效（已损坏的装备不计件数）');
  pieces[0].durability = 100; inv.notify(); lo.setItems(inv.activeItems());
  check(inv.setCounts().get(set.id) === 4 && skillIn(lo, target).appliedModifiers.includes(slot4.id), '修好 1 件：回到 4 件，变种恢复');
}
{
  const open = Object.values(SETS).filter(s => s.open), stub = Object.values(SETS).filter(s => !s.open);
  check(open.length === 4 && open.some(s => s.id === 'set_chrono') && open.some(s => s.id === 'set_alchemy') && stub.length === 1 && stub.every(s => s.pieces.length === 0 && s.pieceNames.length >= 4), `后续开放占位：${stub.map(s => `${s.className}「${s.name}」`).join('、')}（只有名字，不掉落）`);
}

// =====================================================================
console.log('\n== 2. 并入主线的 B 暗金（血誓 / 虚衡 / 渊吼 / 冰陨之心）：效果都真的触发 ==');
{
  const B4 = DARK_ITEMS.filter(d => d.from);
  check(B4.length === 4 && B4.every(d => d.quality === 'dark' && ['oneHand', 'twoHand', 'trinket'].includes(d.slot)) && Object.values(RELIC_TO_DARK).every(id => DARK_ITEMS.some(d => d.id === id)), `4 件 B 暗金进了 A 的暗金表（共 ${DARK_ITEMS.length} 件），6 个老 id 都有去处`);
  const gen = new LootGenerator(LOOT_DATA, seeded(77));
  for (const r of B4) {
    const cls = r.cls as 'warrior' | 'mage';
    gen.classId = cls;
    const it = gen.generateFixed(r.id, 40)!;
    const lo = loadoutFor(cls, [it]);
    const c = CLASSES[cls];
    const slot = SLOT_IDS.find(s => c.loadout[s] === r.modifiers[0].match.skillIds![0])!;
    const plain = skillIn(loadoutFor(cls, []), slot), sk = skillIn(lo, slot);
    const caster = new Dummy('P', 'player', 1000, { x: 0, z: 0 }); caster.hp = 500;
    const foes = [0, 1, 2, 3].map(i => new Dummy(`E${i}`, 'enemy', 5000, { x: 5 + i * 3, z: 0 }));
    const resets: (SlotId | "longest")[] = [];
    const world: CombatWorld = { units: () => [caster, ...foes], resetCooldown: (_o, s) => resets.push(s) };
    const fx = new EffectSystem(world, () => 0.01);
    fx.applySkill(sk, caster, [foes[0]]);
    const hitN = foes.filter(f => f.dmg > 0).length;
    let ok = false, what = '';
    switch (r.from) {
      case 'relic_abyss': ok = !!caster.status.reflectBuff && sk.stats.cooldown < plain.stats.cooldown * 0.7 && sk.displayName === '渊吼降临'; what = `反弹增益 ${JSON.stringify(caster.status.reflectBuff)}、冷却 ${plain.stats.cooldown}→${sk.stats.cooldown.toFixed(1)}`; break;
      case 'relic_bloodoath': ok = hitN === 3 && caster.healed > 0 && sk.element === 'shadow'; what = `连锁命中 ${hitN} 个、回血 ${caster.healed}`; break;
      case 'relic_frostheart': ok = sk.element === 'frost' && foes[0].status.isStunned && sk.stats.cooldown < plain.stats.cooldown; what = `冰霜 + 冻结、冷却 ${plain.stats.cooldown}→${sk.stats.cooldown.toFixed(1)}`; break;
      case 'relic_voidscale': ok = foes[1].dmg > 0 && resets.includes('skill2'); what = `爆裂波及 E1 ${foes[1].dmg}、重置 ${resets.join(',')}`; break;
    }
    check(ok && it.quality === 'dark' && !it.noSalvage && it.lines[0].startsWith('❖') && it.affixLog?.length === 2 && sk.displayName !== plain.displayName,
      `${cls === 'warrior' ? '战士' : '法师'}「${r.name}」：${plain.displayName} → ${sk.displayName}（${what}）`);
  }
  // 优先级：暗金（25）覆盖同技能的传说（15~20）的元素
  gen.classId = 'mage';
  const ember = LEGENDARIES_OLD.find(l => l.id === 'lg_ember_robe')!;   // v0.9.1o：余烬长袍已转紫，这里只借它的修饰器测优先级
  const robe: ItemInstance = { ...gen.generate(30, 'purple', ['chest']), modifiers: [ember.modifier] };
  const heart = gen.generateFixed('d_icemeteor', 30)!;
  const loP = loadoutFor('mage', [robe, heart]);
  check(skillIn(loP, 'ultimate').element === 'frost', '修饰器按优先级：暗金排在传说之后（同技能时暗金生效）');
  // 主线规则：暗金单件可以分解（拓印由界面处理），一键分解 / 按品质分解永远跳过
  const inv = new Inventory(10); const forge = new Forge(FORGE_DATA, inv);
  const r1 = gen.generateFixed('d_voidscale', 30)!; inv.add(r1);
  check(forge.salvagePick({ qualities: ['white', 'green', 'blue', 'purple', 'orange', 'dark'], keepBetter: false, keepElite: false, keepSet: false }).length === 0 && forge.salvageBelow('dark').length === 0 && inv.bag.includes(r1), '暗金不会被一键分解');
  check(!!forge.salvage(r1.id) && !inv.bag.includes(r1), '暗金单件可以分解（A 的拓印规则）');
}

// =====================================================================
console.log('\n== 3. 套装保底：收敛（长副本首领） ==');
{
  const pieces = classSet('warrior')!.pieces;
  const run = (chance: number, pity: boolean, seed: number) => {
    const rng = seeded(seed), st: SetPityState = newPity(); let kills = 0, maxGap = 0, gap = 0;
    while (st.seen.length < pieces.length && kills < 800) {
      kills++; gap++;
      const before = st.seen.length;
      if (pity) rollSetPiece(pieces, chance, st, rng);
      else if (rng() < chance) { const p = pieces[Math.floor(rng() * pieces.length)]; if (!st.seen.includes(p)) st.seen.push(p); }
      if (st.seen.length > before) { maxGap = Math.max(maxGap, gap); gap = 0; }
    }
    return { kills, maxGap };
  };
  const N = 3000;
  const stat = (chance: number, pity: boolean) => { const ks = Array.from({ length: N }, (_, i) => run(chance, pity, 1000 + i)); const k = ks.map(x => x.kills).sort((a, b) => a - b); return { avg: k.reduce((a, b) => a + b, 0) / N, p95: k[Math.floor(N * 0.95)], max: k[N - 1], gap: Math.max(...ks.map(x => x.maxGap)) }; };
  const worst = pieces.length * (PITY_FORCE + 1);
  for (const [name, ch] of [['标准', RAID_SET_CHANCE.normal], ['炼狱', RAID_SET_CHANCE.hell]] as const) {
    const a = stat(ch, true), b = stat(ch, false);
    check(a.max <= worst && a.gap <= PITY_FORCE + 1 && a.avg < b.avg, `长副本${name}（每个首领 ${Math.round(ch * 100)}%）：集齐 ${pieces.length} 件 平均 ${a.avg.toFixed(1)} 个首领（≈ ${(a.avg / 5).toFixed(1)} 趟）/ 95% ${a.p95} / 最多 ${a.max}（保底上限 ${worst}；单件间隔 ≤ ${a.gap}）；无保底时平均 ${b.avg.toFixed(1)} / 最多 ${b.max}`);
  }
  const st: SetPityState = { dry: PITY_BIAS, seen: pieces.slice(0, pieces.length - 1) };   // 只缺最后一件
  const rng = seeded(5); let only = true;
  for (let i = 0; i < 200; i++) { const s2 = { dry: PITY_BIAS, seen: [...st.seen] }; const r = rollSetPiece(pieces, 1, s2, rng); if (r.piece && r.piece !== pieces[pieces.length - 1]) only = false; }
  const forced = rollSetPiece(pieces, 0, { dry: PITY_FORCE, seen: pieces.slice(0, pieces.length - 1) }, rng);
  check(only && forced.forced && forced.piece === pieces[pieces.length - 1], `连续 ${PITY_BIAS} 次没出新部件：只掉缺的部件；连续 ${PITY_FORCE} 次：掉率 0 也必掉缺的部件`);
  // 套装件生成：法师不会拿到战士的部件；部件 = 史诗 + 2 条随机词条
  const gen = new LootGenerator(LOOT_DATA, seeded(8)); gen.classId = 'mage';
  const p = gen.generateFixed(classSet('mage')!.pieces[0], 40)!;
  check(p.setId === 'set_frost' && p.quality === 'purple' && (p.affixLog?.length ?? 0) === 3, `套装部件：${p.name} 史诗 + 2 属性 + 1 技能词条（v0.6.7 固定条数，可淬炼）`);
}

// =====================================================================
console.log('\n== 6. 存档 v6 → v7 ==');
{
  const m = new Map<string, string>(); const st: SaveStorage = { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: k => void m.delete(k) };
  const it = (id: string, name: string, setId?: string, slot = 'head'): object => ({ id, baseId: slot === 'head' ? 'b_helm' : 'b_chest', name, slot, quality: 'purple', itemLevel: 20, hp: 50, armor: 20, modifiers: [], lines: [], sellPrice: 10, armorType: 'plate', durability: 100, ...(setId ? { setId } : {}) });
  const v6 = { version: 6, savedAt: 6, classId: 'warrior', inventory: { gold: 5, bag: [it('b1', '狂怒胸甲', 'set_fury', 'chest')], equipped: { head: it('e1', '狂怒头盔', 'set_fury') }, stacks: {} }, level: { level: 28, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, codex: ['fixed|狂怒头盔'], dungeonBest: { darkrock_mine: 2 } };
  m.set('s', JSON.stringify(v6));
  const s = new SaveManager(st, 's', LOOT_DATA).loadResult().save!;
  check(s.version === SAVE_VERSION && SAVE_VERSION >= 7, `v6 存档升级到 v${s.version}`);
  check(JSON.stringify(s.setPity?.seen.sort()) === JSON.stringify(['i_chest', 'i_helm']) && s.setPity?.dry === 0 && s.inventory.equipped.head!.fixedId === 'i_helm', '套装保底：老存档里的狂怒头盔 / 胸甲算「见过」，补上 fixedId');
  check(s.relicChain === undefined && s.dungeonBest?.darkrock_mine === 2, '典藏任务链（v9 取消）不再出现，其余数据不变');
  const inv = new Inventory(30); inv.setBonuses = ALL_SET_BONUSES; inv.load(s.inventory); inv.equip('b1');
  check(inv.setCounts().get('set_fury') === 2 && inv.stats().crit === 0, '老存档的两件狂怒自动算进新套装「狂怒战魂（套装）」2 件（v0.9.1m 起 2 件是特殊效果，不再加暴击）');
}

console.log(fails ? `\n✗ ${fails} 项失败` : '\n全部通过');
if (fails) process.exitCode = 1;
