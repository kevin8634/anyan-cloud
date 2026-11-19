// v1.2.4 写实战士近景截图：node dev/hd/closeup.mjs [html] [out]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/tmp/models/closeup';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 700, height: 700 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 160)); });
await page.goto('file://' + HTML);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); });
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); for (const id of ['tut']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; } });
for (let i = 0; i < 12; i++) { await page.mouse.move(350, 350); await page.mouse.wheel(0, -400); await page.waitForTimeout(60); }
for (const [n, ry, act] of [['front', 0, null], ['side', Math.PI / 2, null], ['attack', 0, 'attack1'], ['run', 0.6, 'run']]) {
  await page.evaluate(([ry, act]) => { const g = window.__game, r = g.player.rig; r.root.rotation.y = ry; if (act === 'run') r.anim?.loop('run'); else if (act) r.anim?.play(act); else r.anim?.loop('idle'); }, [ry, act]);
  await page.waitForTimeout(act === 'attack1' ? 350 : 500);
  await page.evaluate(ry => { window.__game.player.rig.root.rotation.y = ry; }, ry);
  await page.screenshot({ path: `${OUT}_${n}.png`, clip: { x: 175, y: 120, width: 350, height: 420 } });
}
await b.close();
