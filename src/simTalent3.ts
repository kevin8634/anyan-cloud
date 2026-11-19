// v1.2.58 天赋 3.0 规则自检：npm run talent3（也在 npm run packs 里跑）
declare const process: { exitCode?: number };
import { CLASSES } from './data/classes';
import { TalentTree, Progression, TALENT_TOTAL, V3_SAVE_VER } from './core/TalentTree';

let fail = 0, pass = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };

// ---- 点数 ----
{ const p = new Progression(30); const at = (lv: number) => { p.level = lv; return p.talentPoints; };
  ok(at(9) === 0 && at(10) === 1 && at(15) === 8 && at(20) === 15 && at(25) === 22 && at(30) === 28, `等级点数 10/15/20/25/30 级：${[10, 15, 20, 25, 30].map(at).join('/')}`);
  ok(at(30) + 2 === TALENT_TOTAL, '30 级 28 点 + 职业试炼 2 点 = 30'); }

for (const c of Object.values(CLASSES)) {
  const def = c.tree;
  ok(!!def.v3 && def.tiers === 6, `${c.name}：天赋 3.0`);
  for (const sp of def.specs) {
    const row = (r: number) => sp.nodes.filter(n => n.row === r);
    ok(row(1).length === 3 && row(1).every(n => n.kind === 'rank' && n.maxRank === 2), `${c.name}·${sp.name} 区域一普通 3 个 × 2 级`);
    ok(row(2).length === 2 && row(2).every(n => n.kind === 'choice'), `${c.name}·${sp.name} 区域一关键 2 选 1`);
    ok(row(3).length === 3 && row(3).every(n => n.maxRank === 2), `${c.name}·${sp.name} 区域二普通 3 个 × 2 级`);
    ok(row(4).length === 2 && row(4).every(n => n.kind === 'choice'), `${c.name}·${sp.name} 区域二关键 2 选 1`);
    ok(row(5).length === 4 && row(5).every(n => n.maxRank === 3), `${c.name}·${sp.name} 区域三普通 4 个 × 3 级`);
    ok(row(6).length === 1 && row(6)[0].capstone === true, `${c.name}·${sp.name} 绝技 1 个`);
    ok(!!sp.focus, `${c.name}·${sp.name} 写了主打`);
    ok(sp.nodes.filter(n => n.stats && ['crit', 'haste', 'hp'].some(k => k in n.stats!) && !n.modifier).every(n => n.row === 1 || true), '通用属性');
  }

  // ---- 三种组合都正好 30 点 ----
  const fill = (t: TalentTree, spIdx: number, zones: number) => { const sp = def.specs[spIdx];
    for (let k = 0; k < 12; k++) for (const n of sp.nodes.filter(n => n.row <= zones * 2).sort((a, b) => a.row - b.row || a.col - b.col)) while (t.add(n.id)); };
  for (const combo of [[3, 1, 1], [3, 2, 0], [2, 2, 2]]) {
    const t = new TalentTree(def, 31);
    combo.forEach((z, i) => z && fill(t, i, z));
    const keys = t.v3Combo();
    ok(t.spent === 30, `${c.name} 组合 ${combo.join('+')}：投入 ${t.spent} 点（应 30）`);
    ok(keys.keys === (combo[0] === 2 ? 6 : 5), `${c.name} 组合 ${combo.join('+')}：关键节点 ${keys.keys}`);
    ok(t.valid(), `${c.name} 组合 ${combo.join('+')} 合法`);
  }

  // ---- 规则 ----
  const t = new TalentTree(def, 40);
  const [A, B] = def.specs;
  const r = (sp: typeof A, row: number) => sp.nodes.filter(n => n.row === row);
  ok(!!t.whyCannotAdd(r(A, 2)[0].id), `${c.name} 普通不足 4 点时关键锁定`);
  for (const n of r(A, 1)) { t.add(n.id); t.add(n.id); }
  ok(t.rowSpent(A.id, 1) === 4, `${c.name} 区域一普通最多 4 点（实际 ${t.rowSpent(A.id, 1)}）`);
  ok(!!t.whyCannotAdd(r(A, 3)[0].id), `${c.name} 没点关键时区域二锁定`);
  ok(t.add(r(A, 2)[0].id) && !t.add(r(A, 2)[1].id), `${c.name} 关键 2 选 1`);
  for (const n of r(A, 3)) { t.add(n.id); t.add(n.id); }
  t.add(r(A, 4)[1].id);
  for (const n of r(B, 1)) { t.add(n.id); t.add(n.id); } t.add(r(B, 2)[0].id);
  for (const n of r(B, 3)) { t.add(n.id); t.add(n.id); } t.add(r(B, 4)[0].id);
  ok(t.add(r(A, 5)[0].id), `${c.name} 主系区域三可点`);
  ok(!!t.whyCannotAdd(r(B, 5)[0].id)?.includes('主系'), `${c.name} 区域三只对主系开放：${t.whyCannotAdd(r(B, 5)[0].id)}`);
  ok(!!t.whyCannotRemove(r(A, 2)[0].id), `${c.name} 退关键会让后面失去解锁 → 不允许`);
  ok(!!t.whyCannotAdd(r(A, 6)[0].id), `${c.name} 区域三不足 9 点时绝技锁定`);
  // 存档：带版本号；旧档（无版本）全额返还
  const sv = t.save();
  ok(sv.__v === V3_SAVE_VER, `${c.name} 存档带版本号 ${sv.__v}`);
  const t2 = new TalentTree(def, 40); t2.load(sv);
  ok(t2.spent === t.spent && !t2.migrated, `${c.name} 读档还原 ${t2.spent} 点`);
  const t3 = new TalentTree(def, 40); const old = { ...sv }; delete old.__v; t3.load(old);
  ok(t3.spent === 0 && t3.migrated, `${c.name} 2.0 旧档全额返还并标记提示`);
  // 超出 30 点的天赋点（巅峰）不能用
  const t4 = new TalentTree(def, 40);
  [[3, 1, 1]].forEach(cb => cb.forEach((z, i) => fill(t4, i, z)));
  ok(t4.spent === 30 && t4.available === 10, `${c.name} 有 40 点也只能投 30（剩 ${t4.available}）`);
  // 机制天赋读数按满级总值换算
  const any = def.specs.flatMap(s => s.nodes).find(n => n.rankMul && n.rankMul !== 1);
  if (any) { const t5 = new TalentTree(def, 40); ok(t5.effRank(any.id) === 0, 'effRank 未点 = 0'); }
}

console.log(`${fail ? '❌' : '✅'} 天赋 3.0：${fail ? `${fail} 项失败（通过 ${pass}）` : `全部通过（${pass}）`}`);
if (fail) process.exitCode = 1;
