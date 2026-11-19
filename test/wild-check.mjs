// v0.9.3c 真实 Chromium：三张野外图外环 / 刷怪点截图 + 性能 + 页面错误（node test/wild-check.mjs [输出目录]）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/wild'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto('file://' + resolve('web/index.html') + '?perf=1&intro=0', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.click('#start'); await page.waitForTimeout(2500);
await page.evaluate(() => window.__game.progression.addXp(60000));
const maps = [['redsand', 800, [['ring', -107, -68], ['hot', 38, 54], ['camp', 0, 0]]], ['frost', 1200, [['ring', 73, 103], ['hot', 38, 54]]], ['ember', 1700, [['ring', -90, -128], ['hot', -79, 75]]]];
const res = [];
for (const [id, oz, views] of maps) {
  await page.evaluate((id) => { const g = window.__game; g.ensureWild(id); g.goMap(id); }, id);
  await page.waitForFunction((id) => window.__game.zone === id, id, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(5000);
  await page.evaluate(() => document.querySelectorAll('.panel, .modal').forEach(p => { if (p.id !== 'hud') p.style.display = 'none'; }));
  for (const [n, x, z] of views) {
    await page.evaluate(([x, z]) => { const g = window.__game; g.player.pos.set(x, g.groundAt(x, z), z); g.refreshActive(); }, [x + 6, oz + z + 8]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/${id}_${n}.png` });
    res.push([`${id}_${n}`, await page.evaluate(() => ({ y: +window.__game.player.pos.y.toFixed(2), ...window.__game.perf() }))]);
  }
}
for (const [n, r] of res) console.log(n, JSON.stringify(r));
console.log('errors:', errors.length ? errors : 'none');
await b.close();
