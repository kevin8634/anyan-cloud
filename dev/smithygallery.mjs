// v1.2.40 武器库游戏内效果：写实战士依次换上 10 把武器外观，近景截图（/tmp/smithy/g_<key>.png）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/smithy'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 900, height: 900 } });
await page.goto('file://' + HTML);
await page.evaluate(q => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: 'new' })); }, process.env.Q || 'high');
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.camDist = 5; document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); });
const lib = await page.evaluate(() => window.__dlc1.smithy.lib());
for (const l of lib) {
  await page.evaluate(k => { const g = window.__game; const ws = window.__dlc1.smithy; void ws; window.__wsSet ??= null; }, l.key);
  await page.evaluate(async k => { await window.__dlc1.smithy.pickSet(k, true); const g = window.__game; g.player.rig.anim?.loop('idle'); g.player.rig.root.rotation.y = 2.4; }, l.key);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/g_${l.key}.png`, clip: { x: 200, y: 150, width: 500, height: 600 } });
  console.log('SHOT', l.key);
}
await b.close();
