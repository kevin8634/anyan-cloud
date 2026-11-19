// v1.2.58 天赋 3.0 法师关键节点：炽燃 / 余烬 / 冰脆
// node test/talent3_e2e.mjs [html]   截图 → shots_talent3b/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), OUT = resolve(ROOT, 'shots_talent3b'); mkdirSync(OUT, { recursive: true });
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const errors = [];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(180000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('mage')); await page.waitForTimeout(2000);
await page.evaluate(() => window.__game.tutFinish?.());
const r = await page.evaluate(() => {
  const g = window.__game, t = g.tree, e = g.enemies.filter(x => x.alive && !x.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  e.maxHp = e.hp = 1e7; const out = {};
  t.totalPoints = 30; t.reset(); const sp = t.def.specs[0]; for (const n of sp.nodes.filter(n => n.row === 1)) { t.add(n.id); t.add(n.id); }
  out.pick = t.add('mf_k_blaze');
  g.fx.dealDamage(e, 1000, 'fire', g.player, true);
  out.blaze = e.status.dots().find(d => d.key === 'dot:blaze')?.dps ?? 0;
  g.fx.dealDamage(e, 1000, 'fire', g.player, false);
  out.noCrit = e.status.dots().find(d => d.key === 'dot:blaze')?.dps ?? 0;
  out.names = t.def.specs.map(s => s.nodes.filter(n => n.row === 2).map(n => n.name).join('/')).join(' | ');
  return out; });
ok(r.pick && Math.round(r.blaze) === 300, `炽燃：1000 火焰暴击 → 每秒 ${Math.round(r.blaze)}（2 秒共 600）`);
ok(Math.round(r.noCrit) === 300, '非暴击不刷新炽燃');
ok(/炽燃\/余烬/.test(r.names) && /冰脆\/寒流/.test(r.names), `区域一关键：${r.names}`);
ok(errors.length === 0, `页面错误 ${errors.length}：${errors.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fail ? `✗ talent3b_e2e ${n - fail}/${n}` : `✓ talent3b_e2e ${n}/${n}`); process.exitCode = fail ? 1 : 0;
