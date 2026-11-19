// v1.2.41 法杖高清化实拍：写实法师持钟铜法杖，近景 3 个角度（/tmp/staff/s<n>.png）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/staff'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1000, height: 1000 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + HTML);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); });
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(6000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); });
await page.waitForTimeout(4000);
const views = [[0, 0, 3.6], [0, 0, 1.6], [0, 0, 0.6]];
for (let i = 0; i < views.length; i++) {
  await page.evaluate(([p, d, r]) => { const g = window.__game; g.player.rig.root.rotation.y = r; g.camera.fov = 13; g.camera.updateProjectionMatrix(); }, views[i]);
  await page.waitForTimeout(1200);
  const c = await page.evaluate(() => { const g = window.__game, v = g.player.rig.root.getWorldPosition(new g.player.rig.root.position.constructor()); v.y += 1; v.project(g.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
  await page.screenshot({ path: `${OUT}/s${i}.png`, clip: { x: Math.max(0, Math.min(1000 - 560, c.x - 280)), y: Math.max(0, Math.min(1000 - 640, c.y - 330)), width: 560, height: 640 } });
  console.log('SHOT', i);
}
const info = await page.evaluate(() => { let n = 0, hd = 0; window.__game.player.rig.root.traverse(o => { if (o.name?.startsWith('wfx_')) n++; if (o.material?.userData?.hd) hd++; }); return { wfx: n, hd }; });
console.log('INFO', JSON.stringify(info), 'errors', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
