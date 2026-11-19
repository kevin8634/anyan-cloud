// v0.9.3b 真实 Chromium：翠风原野外环截图 + 性能 + 页面错误（node test/field-check.mjs [输出目录]）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/field'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto('file://' + resolve('web/index.html') + '?perf=1&intro=0', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.click('#start'); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.progression.addXp(4000); g.goMap('field'); });
await page.waitForFunction(() => window.__game.zone === 'field', null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(5000);
// 关掉可能弹出的提示面板
await page.evaluate(() => document.querySelectorAll('.panel, .modal').forEach(p => { if (p.id !== 'hud') p.style.display = 'none'; }));
const F = { x: 0, z: 400 };
const views = [['village', 80, 62], ['windmill', 100, 70], ['bridge2', 74, 20], ['temple', 86, -60], ['mesa_foot', -68, -62], ['mesa_top', -88, -84], ['mine', -84, 58], ['cave', -96, 8]];
const res = [];
for (const [n, x, z] of views) {
  await page.evaluate(([x, z]) => { const g = window.__game; g.player.pos.set(x, g.groundAt(x, z), z); g.refreshActive(); }, [F.x + x, F.z + z]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${n}.png` });
  res.push([n, await page.evaluate(() => ({ y: +window.__game.player.pos.y.toFixed(2), ...window.__game.perf() }))]);
}
for (const [n, r] of res) console.log(n, JSON.stringify(r));
console.log('errors:', errors.length ? errors : 'none');
await b.close();
