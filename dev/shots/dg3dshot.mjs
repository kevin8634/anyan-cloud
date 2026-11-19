// v0.9.6f 3D 副本浮岛截图：node tools/preview/dg3dshot.mjs → dev/shots/out/dg3d_{molten,sand,phone}.png
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync(process.cwd()+'/dev/shots/out', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, raid, opt] of [['molten', 'molten_throne', { viewport: { width: 1280, height: 720 } }], ['sand', 'sand_tomb', { viewport: { width: 1280, height: 720 } }], ['phone', 'molten_throne', { viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }]]) {
  const p = await b.newPage(opt); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.clear(); });
  await p.goto('file://'+process.cwd()+'/web/index.html');
  await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 90000 });
  await p.evaluate(() => { document.getElementById('class-pick').children[0].click(); document.getElementById('start').click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(r => { const g = window.__game; document.getElementById('tut-skip')?.click(); g.progression.level = 30; g.openRaidMap(r, true); g.dmSelect(1); }, raid);
  await p.waitForTimeout(2500);
  const d = await p.evaluate(() => { const x = window.__game.rm3dDebug(); return { active: x.active, failed: x.failed, renders: x.renders, n: x.nodes.length }; });
  await p.screenshot({ path: `${process.cwd()}/dev/shots/out/dg3d_${tag}.png` });
  console.log(tag, JSON.stringify(d), 'errors', errs.slice(0, 3));
  await p.close();
}
await b.close();
