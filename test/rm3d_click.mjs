// v1.2.76 副本 3D 地图真实鼠标点击存档点 → 传送：node test/rm3d_click.mjs [html=web/index_dlc1.html]
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1.html');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(600000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => { const g = window.__game; g.startGame('warrior'); }); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.progression.level = 30; g.ensureWild?.('ember'); window.__er = g.enterRaid('molten_throne', 1); }); await page.waitForTimeout(3000);
await page.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 600000 });   // v1.2.80（软件渲染下约 4–5 分钟） 进副本有预热加载画面（v1.2.77），等它撤掉再点
const info = await page.evaluate(() => { const g = window.__game; g.player.pos.z += 30; g.openRaidMap(); return { zone: g.zone, z: g.player.pos.z }; });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, d = g.rm3dDebug(); return { zone: g.zone, rm: document.getElementById('raidmap').style.display, wanted: d.wanted, active: d.active, failed: d.failed, raid: d.raid, n: d.nodes.length, view: g.dmView?.() }; })));
const st = await page.evaluate(() => { const g = window.__game, d = g.rm3dDebug(), c = document.getElementById('rm-cv3'), r = c?.getBoundingClientRect();
  const cpn = d.nodes.find(n => n.id === 'entry') ?? d.nodes[0], s = d.screen(cpn.id);
  const top = r ? document.elementFromPoint(r.left + s.x, r.top + s.y) : null;
  return { active: d.active, canvas: d.canvas, id: cpn.id, x: r.left + s.x, y: r.top + s.y, top: top ? (top.id || top.className || top.tagName) : null, cps: g.raidDebug?.()?.cps ?? null }; });
console.log(JSON.stringify(info), JSON.stringify(st));
ok(st.active && st.canvas, '副本里打开地图：3D 浮岛在用');
ok(st.top === 'rm-cv3', `存档点位置最上层元素是 3D 画布（实际：${st.top}）`);
for (const from of [1, 2]) {
  const pr = await page.evaluate(async (from) => { const g = window.__game; g.togglePanel('raidmap', false); g.enterRaid('molten_throne', from); await new Promise(r => setTimeout(r, 2500)); for (let i = 0; i < 1200 && document.getElementById('loading')?.style.display !== 'none'; i++) await new Promise(r => setTimeout(r, 500)); g.openRaidMap(); await new Promise(r => setTimeout(r, 2000));
    const d = g.rm3dDebug(); return d.nodes.map(n => { const s = d.screen(n.id); return { id: n.id, kind: n.kind, tp: n.tp, dead: n.dead, pick: d.pickId(s.x, s.y) }; }); }, from);
  console.log('from', from, JSON.stringify(pr));
  for (const n of pr.filter(n => n.tp)) ok(n.pick === n.id, `from${from} 存档点 ${n.id} 点到自己（实际 ${n.pick}）`);
}
await page.evaluate(() => { const g = window.__game; g.togglePanel('raidmap', false); g.enterRaid('molten_throne', 1); }); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.player.pos.z += 30; g.openRaidMap(); }); await page.waitForTimeout(2000);
const z0 = await page.evaluate(() => window.__game.player.pos.z);
await page.mouse.move(st.x, st.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(1500);
const after = await page.evaluate(() => { const g = window.__game; return { open: document.getElementById('raidmap').style.display, z: g.player.pos.z }; });
console.log(JSON.stringify(after));
ok(after.open !== 'flex' && Math.abs(after.z - z0) > 5, '第 4 次打开地图后真实鼠标点存档点 → 传送并关地图');
ok(errors.length === 0, `errors=${JSON.stringify(errors.slice(0, 3))}`);
console.log(`rm3d_click ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
