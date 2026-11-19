// v1.2.42 10 把高清武器游戏内近景（写实战士 / 法师，长焦），检查朝向、光效、泛光：/tmp/wclose/<key>.png + sheet.png
// 用法：Q=ultra|high node dev/weaponclose.mjs [html] [输出目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/wclose'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 900, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + HTML);
await page.evaluate(q => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: 'new' })); }, process.env.Q || 'high');
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(22000);   // 开局出生光效（光球 → 散成光点）约 20 秒，等它散掉再拍（之前误以为是武器泛光）
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); });
const keys = (process.env.KEYS || '').split(',').filter(Boolean);
const lib = keys.length ? keys : (await page.evaluate(() => window.__dlc1.smithy.lib())).map(l => l.key);
for (const k of lib) {
  await page.evaluate(k => { window.__dlc1.smithy.pickSet(k, true); const g = window.__game; g.player.rig.root.rotation.y = 1.2; g.camera.fov = 12; g.camera.updateProjectionMatrix(); }, k);
  await page.waitForTimeout(1500);
  const c = await page.evaluate(() => { const g = window.__game, v = g.player.rig.root.getWorldPosition(new g.player.rig.root.position.constructor()); v.y += 1; v.project(g.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
  await page.screenshot({ path: `${OUT}/${k}.png`, clip: { x: Math.max(0, Math.min(900 - 420, c.x - 210)), y: Math.max(0, Math.min(900 - 500, c.y - 260)), width: 420, height: 500 } });
  console.log('SHOT', k);
}
console.log('errors', errs.length, errs.slice(0, 3).join(' | '));
await b.close();
