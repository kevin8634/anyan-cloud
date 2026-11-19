// v1.2.58 天赋 3.0 实机：三区域加点、组合显示、主打、区域三只对主系、旧档返还
// node test/talent3_e2e.mjs [html]   截图 → shots_talent3/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), OUT = resolve(ROOT, 'shots_talent3'); mkdirSync(OUT, { recursive: true });
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(180000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.tutFinish?.());
const r = await page.evaluate(() => {
  const g = window.__game, t = g.tree, out = {};
  out.v3 = !!t.def.v3; out.lv30 = (g.progression.level = 30, g.progression.talentPoints);
  t.totalPoints = 30; t.reset();
  const fill = (i, z) => { const sp = t.def.specs[i]; for (let k = 0; k < 12; k++) for (const n of sp.nodes.filter(n => n.row <= z * 2).sort((a, b) => a.row - b.row || a.col - b.col)) while (t.add(n.id)); };
  fill(0, 3); fill(1, 1); fill(2, 1);
  out.spent = t.spent; out.combo = t.v3Combo();
  out.z3B = t.whyCannotAdd(t.def.specs[1].nodes.find(n => n.row === 5).id);
  g.togglePanel('talent', true); g.renderTalents();
  out.sum = document.getElementById('tal-sum').textContent; out.focus = [...document.querySelectorAll('#tal-tree .tfocus')].map(e => e.textContent);
  out.save = t.save().__v;
  t.load({ wa_weapon: 3, wa_might: 2 }); out.mig = t.migrated && t.spent === 0;
  return out;
});
ok(r.v3, '战士用天赋 3.0');
ok(r.lv30 === 28, `30 级等级点数 ${r.lv30}（+ 职业试炼 2 = 30）`);
ok(r.spent === 30 && r.combo.combo === '3+1+1' && r.combo.keys === 5, `主 3 + 副 1 + 副 1：${r.spent} 点，组合 ${r.combo.combo}，关键 ${r.combo.keys}`);
ok(/主系/.test(r.z3B ?? ''), `副系区域三锁定：${r.z3B}`);
ok(/组合 3\+1\+1/.test(r.sum) && /关键节点 5\/6/.test(r.sum), '面板显示组合与关键节点数');
ok(r.focus.length === 3 && r.focus[0].includes('流血'), `每系主打：${r.focus.join(' | ')}`);
ok(r.save === 3, '存档带天赋版本号 3');
ok(r.mig, '2.0 旧天赋全额返还');
await page.evaluate(() => { const g = window.__game, t = g.tree; t.reset(); const fill = (i, z) => { const sp = t.def.specs[i]; for (let k = 0; k < 12; k++) for (const n of sp.nodes.filter(n => n.row <= z * 2).sort((a, b) => a.row - b.row || a.col - b.col)) while (t.add(n.id)); }; fill(0, 3); fill(1, 1); fill(2, 1); g.renderTalents(); });
const rd = await page.evaluate(() => {
  const g = window.__game, t = g.tree, e = g.enemies.filter(x => x.alive && !x.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  e.maxHp = e.hp = 1e7; const out = {};
  const pick = id => { t.reset(); const sp = t.def.specs[0]; for (const n of sp.nodes.filter(n => n.row === 1)) { t.add(n.id); t.add(n.id); } return t.add(id); };
  out.r = pick('wa_k_rend'); for (let i = 0; i < 3; i++) g.fx.dealDamage(e, 100, 'physical', g.player, false);
  out.rs = e.status.stacks('rend'); out.rd = e.status.dots().find(d => d.key === 'dot:rend')?.dps ?? 0;
  for (let i = 0; i < 20; i++) g.fx.dealDamage(e, 100, 'physical', g.player, false);
  out.r20 = e.status.dots().find(d => d.key === 'dot:rend')?.dps ?? 0;
  e.status.remove('rend'); e.status.remove('dot:rend');
  out.d = pick('wa_k_deep'); const hp0 = e.hp; for (let i = 0; i < 5; i++) g.fx.dealDamage(e, 100, 'physical', g.player, false);
  out.ds = e.status.stacks('rend'); out.lost = hp0 - e.hp;
  return out; });
ok(rd.r && rd.rs === 3 && rd.rd > 0, `撕裂：3 次命中叠 ${rd.rs} 层流血（每秒 ${Math.round(rd.rd)}）`);
const fz = await page.evaluate(() => {
  const g = window.__game, t = g.tree, e = g.enemies.filter(x => x.alive && !x.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  const dmg = () => g.loadout.preview('skill2', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
  t.reset(); const sp = t.def.specs[1]; for (const n of sp.nodes.filter(n => n.row === 1)) { t.add(n.id); t.add(n.id); }
  const d0 = dmg(); const pk = t.add('wf_k_frenzy'); const d1 = dmg();
  for (let i = 0; i < 4; i++) g.fx.dealDamage(e, 50, 'physical', g.player, true);
  const d2 = dmg();
  t.reset(); const sp2 = t.def.specs[2]; for (const n of sp2.nodes.filter(n => n.row === 1)) { t.add(n.id); t.add(n.id); }
  const a0 = dmg(); t.add('wp_k_armorhit'); const a1 = dmg();
  return { pk, d0, d1, d2, a0, a1, armor: g.player.armor }; });
ok(fz.pk && Math.abs(fz.d1 - fz.d0) < 1e-6 && fz.d2 / fz.d1 > 1.095, `狂乱：暴击 4 次后技能伤害 ×${(fz.d2 / fz.d1).toFixed(3)}`);
ok(fz.a1 > fz.a0, `甲击：护甲 ${fz.armor} → 技能伤害 ×${(fz.a1 / fz.a0).toFixed(3)}`);
ok(rd.r20 > 0 && rd.r20 <= 15.01, `撕裂满层不放大：再打 20 次后每秒 ${rd.r20.toFixed(1)}（上限 15）`);
ok(rd.d && rd.ds === 0 && rd.lost > 500, `深创：叠满 5 层引爆并清空（5 次 100 伤害共掉 ${Math.round(rd.lost)}）`);
await page.waitForTimeout(600); await page.screenshot({ path: OUT + '/1_talent3.png' });
ok(errors.length === 0, `页面错误 ${errors.length}：${errors.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fail ? `✗ talent3_e2e ${n - fail}/${n}` : `✓ talent3_e2e ${n}/${n}`); process.exitCode = fail ? 1 : 0;
