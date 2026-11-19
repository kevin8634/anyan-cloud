// 运行：npm run talent —— 三系专精天赋：层解锁、跨树加点、互斥、终极天赋技能变形、洗点、存档 v3→v4 迁移、经验曲线
import { TalentTree, Progression, MAX_LEVEL } from './core/TalentTree';
import { Loadout } from './core/Loadout';
import { SaveManager, SAVE_VERSION, TALENT_RESET_NOTICE } from './core/SaveManager';
import { CombatUnit, CombatWorld, EffectSystem, StatusSet } from './core/Combat';
import { SLOT_IDS } from './core/types';
import { CLASSES, ClassDef } from './data/classes';

declare const process: { exitCode?: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const ctx = { now: 0, casterHpPercent: 1, targetEffects: [] as never[] };

function rig(cls: ClassDef, points: number) {
  const lo = new Loadout({ execute: () => {} });
  SLOT_IDS.forEach(s => lo.equipSkill(cls.skills[cls.loadout[s]], s));
  lo.setComboModifiers(cls.combos);
  const tree = new TalentTree(cls.tree, points);
  tree.onChange = () => lo.setTalents(tree.activeNodes());
  return { lo, tree };
}
const bar = (lo: Loadout) => SLOT_IDS.map(s => {
  const r = lo.preview(s, ctx)!;
  return `${r.displayName}[${r.element}] ${Math.round(r.stats.damage)}伤 ${r.stats.cooldown.toFixed(1)}秒${r.stats.radius ? ` 半径${r.stats.radius.toFixed(1)}` : ''}${r.effects.length ? ` (${r.effects.map(e => e.type).join('+')})` : ''}`;
}).join('\n    ');

// ---------------- 经验曲线 ----------------
console.log('== 等级与经验 ==');
const prog = new Progression();
check(prog.maxLevel === 30 && MAX_LEVEL === 30, `满级 ${prog.maxLevel}，天赋点 ${prog.maxLevel - 1}`);
console.log(`  每级经验：${Array.from({ length: 19 }, (_, i) => prog.xpToNext(i + 1)).join(' ')}`);
console.log(`  累计：到 10 级 ${prog.totalXpFor(10)}，13 级 ${prog.totalXpFor(13)}，14 级 ${prog.totalXpFor(14)}，20 级 ${prog.totalXpFor(20)}`);
// 现有内容估算（与试玩版数值一致）：任务 2470、狼 30×约 30 只、矿洞小怪 45×8 + Boss 450、神殿小怪约 60×9 + 藤蔓 + Boss 750
const content = 2470 + 30 * 30 + (45 * 8 + 450) + (60 * 9 + 20 * 4 + 750);
const p2 = new Progression(); p2.addXp(content);
console.log(`  现有内容约 ${content} 经验 → ${p2.level} 级`);
check(p2.level >= 12 && p2.level <= 14, `两个副本 + 全部任务后约 ${p2.level} 级（目标 13~14，后续新区域补到 20）`);
let pts = 0; const p3 = new Progression(); p3.onLevelUp = () => pts++; p3.addXp(prog.totalXpFor(30) + 999);
check(p3.level === 30 && p3.talentPoints === 29 && pts === 29 && p3.xp === 0, `升满 30 级获得 ${pts} 点，满级经验清零`);

// ---------------- 规则：层解锁 / 跨树 / 互斥 / 前置 / 退点 ----------------
for (const cls of [CLASSES.warrior, CLASSES.mage]) {
  console.log(`\n== ${cls.name}：三系专精 ${cls.tree.specs.map(s => `${s.name}(${s.nodes.length} 个天赋)`).join(' / ')} ==`);
  check(cls.tree.specs.length === 3 && cls.tree.specs.every(s => s.nodes.length >= 10 && s.nodes.length <= 12 && s.nodes.filter(n => n.capstone).length === 1 && s.nodes.find(n => n.capstone)!.row === 5 && s.nodes.filter(n => n.row === 6).length === 2) && cls.tree.tiers === 6,
    '3 棵树，每棵 10~12 个天赋、6 层：第 5 层 1 个终极天赋，第 6 层 2 个（阶段四，30 级）');
  check(cls.tree.specs.every(s => s.nodes.some(n => n.kind === 'choice' || n.group) && s.nodes.some(n => n.kind === 'rank' && n.maxRank > 1)), '每棵树都有多级天赋和选择天赋');
  const all = cls.tree.specs.flatMap(s => s.nodes);
  const { tree } = rig(cls, 19);
  const full = all.reduce((a, n) => a + n.maxRank, 0);
  check(full > 19, `全部点满需要 ${full} 点 > 19 点，必须取舍`);
  const [A, B, C] = cls.tree.specs;
  const t2 = A.nodes.find(n => n.row === 2)!;
  check(!!tree.whyCannotAdd(t2.id)?.includes('投入 3 点'), `直接点第 2 层「${t2.name}」：${tree.whyCannotAdd(t2.id)}`);
  // 在 B 树投 3 点不能解锁 A 树第 2 层（必须是同一棵树）
  const b1 = B.nodes.filter(n => n.row === 1);
  let k = 0; while (tree.spentIn(B.id) < 3) tree.add(b1[k++ % b1.length].id);
  check(!!tree.whyCannotAdd(t2.id), `「${B.name}」投了 3 点，「${A.name}」第 2 层仍然锁定（层数只看本树）`);
  const a1 = A.nodes.filter(n => n.row === 1);
  k = 0; while (tree.spentIn(A.id) < 3) tree.add(a1[k++ % a1.length].id);
  check(tree.tierUnlocked(A.id, 2) && !tree.tierUnlocked(A.id, 3), `「${A.name}」投 3 点 → 第 2 层解锁，第 3 层（需 6 点）仍锁`);
  check(tree.spentIn(A.id) === 3 && tree.spentIn(B.id) === 3 && tree.spentIn(C.id) === 0 && tree.available === 13, `跨树加点：${A.name} 3 / ${B.name} 3 / ${C.name} 0，剩 ${tree.available}`);
  tree.add(t2.id);
  const rm = a1.find(n => tree.rank(n.id) > 0)!;
  check(!!tree.whyCannotRemove(rm.id), `退「${rm.name}」：${tree.whyCannotRemove(rm.id)}`);
  // 跨树互斥（group）
  const grp = all.filter(n => n.group);
  const g1 = grp[0], g2 = grp.find(n => n.group === g1.group && tree.specOf(n.id) !== tree.specOf(g1.id))!;
  tree.reset();
  const fill = (spId: string, n: number, pick?: (id: string) => boolean) => {
    const sp = cls.tree.specs.find(s => s.id === spId)!;
    for (let guard = 0; guard < 60 && tree.spentIn(spId) < n; guard++) {
      const c = sp.nodes.filter(x => !x.capstone && !x.group && x.kind === 'rank' && (!pick || pick(x.id))).find(x => !tree.whyCannotAdd(x.id));
      if (!c) break; tree.add(c.id);
    }
  };
  fill(tree.specOf(g1.id)!.id, 3 * (g1.row - 1)); fill(tree.specOf(g2.id)!.id, 3 * (g2.row - 1));
  check(tree.add(g1.id) && !!tree.whyCannotAdd(g2.id)?.includes('互斥'), `跨树互斥：已点「${g1.name}」，再点「${g2.name}」→ ${tree.whyCannotAdd(g2.id)}`);
  // 同树同层 choice 互斥
  const choiceRow = cls.tree.specs.flatMap(s => s.nodes.filter(n => n.kind === 'choice' && !n.group).map(n => ({ s, n }))).find(({ s, n }) => s.nodes.some(o => o !== n && o.kind === 'choice' && o.row === n.row));
  if (choiceRow) {
    tree.reset();
    const other = choiceRow.s.nodes.find(o => o !== choiceRow.n && o.kind === 'choice' && o.row === choiceRow.n.row)!;
    fill(choiceRow.s.id, 3 * (choiceRow.n.row - 1));
    tree.add(choiceRow.n.id);
    check(!!tree.whyCannotAdd(other.id), `同层选择：已点「${choiceRow.n.name}」，「${other.name}」→ ${tree.whyCannotAdd(other.id)}`);
  }

  // ---------------- 每棵树点到终极天赋 ----------------
  for (const sp of cls.tree.specs) {
    const { lo, tree: t } = rig(cls, 13);
    const before = SLOT_IDS.map(s => lo.preview(s, ctx)!.displayName);
    const cap = sp.nodes.find(n => n.capstone)!;
    // 12 点：先点本树的多级天赋（不点互斥组），再补选择天赋
    for (let guard = 0; guard < 80 && t.spentIn(sp.id) < 12; guard++) {
      const c = sp.nodes.filter(n => !n.capstone).sort((a, b) => a.row - b.row || (a.kind === 'rank' ? -1 : 1)).find(n => !t.whyCannotAdd(n.id));
      if (!c) break; t.add(c.id);
    }
    const why12 = t.whyCannotAdd(cap.id);
    const ok = t.add(cap.id);
    const after = SLOT_IDS.map(s => lo.preview(s, ctx)!);
    const changed = after.find((r, i) => r.displayName !== before[i] && r.displayName === cap.name);
    check(ok && !!changed && t.spent === 13, `「${sp.name}」12 点后点终极「${cap.name}」${why12 ? `（✗ ${why12}）` : ''}：技能变为 ${changed?.displayName ?? '（未变化）'}${changed ? `，效果 ${changed.effects.map(e => e.type).join('+')}` : ''}`);
    if (sp === cls.tree.specs[0] || cap.id === 'wp_wall' || cap.id === 'ma_chain' || cap.id === 'mi_shatter') console.log(`    ${bar(lo)}`);
    if (cap.id === 'mi_shatter') {
      const frozen = lo.preview('skill1', { now: 0, casterHpPercent: 1, targetEffects: ['stun'] })!;
      const normal = lo.preview('skill1', ctx)!;
      check(frozen.stats.damage > normal.stats.damage * 1.3, `碎冰联动：对冻结目标烈焰弹 ${Math.round(normal.stats.damage)} → ${Math.round(frozen.stats.damage)}`);
    }
    // 第 5 层只有终极，12 点刚好够：少 1 点就点不了
    const { tree: t2b } = rig(cls, 13);
    for (let guard = 0; guard < 80 && t2b.spentIn(sp.id) < 11; guard++) {
      const c = sp.nodes.filter(n => !n.capstone).sort((a, b) => a.row - b.row).find(n => !t2b.whyCannotAdd(n.id));
      if (!c) break; t2b.add(c.id);
    }
    if (sp === cls.tree.specs[0]) check(!!t2b.whyCannotAdd(cap.id), `只投 11 点：${t2b.whyCannotAdd(cap.id)}`);
  }

  // ---------------- 洗点 / 存档往返 / 属性 ----------------
  const { lo, tree: t } = rig(cls, 19);
  for (const sp of cls.tree.specs) for (const n of sp.nodes.filter(x => x.row === 1)) while (t.add(n.id));
  const st = t.charStats();
  console.log(`  第 1 层全点满（${t.spent} 点）：生命 +${st.hp} 护甲 +${st.armor} 强度 +${st.power} 暴击 +${st.crit}% 暴伤 +${st.critDmg}% 急速 +${st.haste}% 移速 +${st.speed}%`);
  check(st.power + st.crit + st.critDmg + st.haste + st.speed > 0, '天赋提供二级属性（强度/暴击/暴伤/急速/移速）');
  const saved = JSON.stringify(t.save());
  const t3 = new TalentTree(cls.tree, 19); t3.load(JSON.parse(saved));
  check(t3.spent === t.spent && t3.valid(), `存档 ${saved.length} 字节，读档后 ${t3.spent} 点`);
  const t4 = new TalentTree(cls.tree, 19); t4.load({ [cls.tree.specs[0].nodes.find(n => n.capstone)!.id]: 1 });
  check(t4.spent === 0, '非法存档（没投够点就有终极天赋）读档时自动洗点');
  t.reset();
  check(t.spent === 0 && t.available === 19 && lo.allModifiers().every(m => m.source !== 'talent'), '洗点：19 点全部返还，技能恢复原样');
}

// ---------------- 盾墙反伤 / 连锁禁锢：战斗结算 ----------------
console.log('\n== 终极天赋战斗结算 ==');
{
  class U implements CombatUnit {
    status = new StatusSet(); hp: number;
    constructor(public uid: string, public faction: 'player' | 'enemy', public maxHp: number, public pos = { x: 0, z: 0 }) { this.hp = maxHp; }
    get alive() { return this.hp > 0; }
    getPos() { return this.pos; }
  }
  const p = new U('战士', 'player', 2000), e1 = new U('怪1', 'enemy', 1000, { x: 2, z: 0 }), e2 = new U('怪2', 'enemy', 1000, { x: 6, z: 0 }), e3 = new U('怪3', 'enemy', 1000, { x: 10, z: 0 }), far = new U('远处', 'enemy', 1000, { x: 30, z: 0 });
  const units = [p, e1, e2, e3, far];
  let jumps = 0;
  const world: CombatWorld = { units: () => units, resetCooldown: () => {}, onChain: () => jumps++ };
  const fx = new EffectSystem(world, () => 0.99);
  const { lo, tree } = rig(CLASSES.warrior, 13);
  for (const id of ['wp_tough', 'wp_tough', 'wp_tough', 'wp_iron', 'wp_iron', 'wp_iron', 'wp_bulwark', 'wp_bulwark', 'wp_quake', 'wp_vigor', 'wp_vigor', 'wp_endless', 'wp_wall']) tree.add(id);
  const wall = lo.preview('ultimate', ctx)!;
  fx.applySkill(wall, p, []);
  fx.dealDamage(p, 100, 'shadow', e1);
  check(p.hp === 1940 && e1.hp === 965, `盾墙：受到 100 点暗影伤害只掉 ${2000 - p.hp}，反弹 ${1000 - e1.hp} 给攻击者`);
  const m = rig(CLASSES.mage, 13);
  for (const id of ['ma_arcane', 'ma_arcane', 'ma_arcane', 'ma_focus', 'ma_focus', 'ma_quick', 'ma_echo', 'ma_mind', 'ma_mind', 'ma_potency', 'ma_potency', 'ma_epiphany', 'ma_chain']) m.tree.add(id);
  const bind = m.lo.preview('skill3', ctx)!;
  fx.applySkill(bind, p, [e1]);
  check(jumps === 2 && e1.status.isStunned && e2.status.isStunned && e3.status.isStunned && far.hp === 1000 && e3.hp > e2.hp && e2.hp > e1.hp,
    `连锁禁锢：弹跳 ${jumps} 次（7 米内只有 2 个目标），3 个目标全部眩晕，伤害 ${1000 - e1.hp}/${1000 - e2.hp}/${1000 - e3.hp}，远处的不受影响`);
}

// ---------------- 存档 v3 → v4 ----------------
console.log('\n== 存档 v3 → v4 迁移 ==');
{
  const mem = new Map<string, string>();
  const storage = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v), remove: (k: string) => void mem.delete(k) };
  mem.set('s', JSON.stringify({ version: 3, savedAt: 0, classId: 'warrior', inventory: { gold: 123, bag: [], equipped: {}, stacks: {} }, level: { level: 11, xp: 77 },
    talents: { wt_weapon: 3, wt_flame: 1, wt_whirl: 3, wt_tough: 3 }, quests: { active: {}, done: ['q_wolves'] } }));
  const sm = new SaveManager(storage, 's');
  const s = sm.load()!;
  check(s.version === SAVE_VERSION && SAVE_VERSION >= 4, `版本 ${s.version}`);
  check(Object.keys(s.talents).length === 0 && s.level.level === 11 && s.level.xp === 77 && s.inventory.gold === 123 && s.quests.done[0] === 'q_wolves', '旧天赋全部退点，等级 11 / 经验 77 / 金币 / 任务保留');
  check(s.notices?.length === 1 && s.notices[0] === TALENT_RESET_NOTICE, `提示一次：「${s.notices?.[0]}」`);
  const t = new TalentTree(CLASSES.warrior.tree, 10); t.load(s.talents);
  check(t.available === 10, `读档后可分配 ${t.available} 点（= 等级 - 1）`);
  sm.save({ classId: s.classId, inventory: s.inventory, level: s.level, talents: t.save(), quests: s.quests });
  const again = sm.load()!;
  check(!again.notices?.length, '保存一次后不再提示');
  const fresh = new SaveManager(storage, 'n');
  mem.set('n', JSON.stringify({ version: 3, savedAt: 0, classId: 'mage', inventory: { gold: 0, bag: [], equipped: {}, stacks: {} }, level: { level: 1, xp: 5 }, talents: {}, quests: { active: {}, done: [] } }));
  check(!fresh.load()!.notices, '1 级没点过天赋的旧存档：不弹提示');
}

console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 天赋测试全部通过');
if (fails) process.exitCode = 1;
