import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const CLS = process.argv[2] || 'hunter', FORM = process.argv[5] || '', OUT = process.argv[3] || '/tmp/cls'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1100, height: 620 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto('file://' + resolve(process.argv[4] || 'web/index_dlc1.html'));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => { localStorage.clear(); });
await page.evaluate(c => { const g = window.__game; g.startGame(c); }, CLS);
await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.progression.level = 30; const w = g.enemies.filter(e => e.alive && !e.isDummy).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0]; window.__tg = w; if (w) { g.player.pos.set(w.pos.x - 2, 0, w.pos.z); g.target = w; w.maxHp = w.hp = 1e7; } });
await page.evaluate(f => { if (f) window.__dlc1.hunter.setForm(f); }, FORM);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/00_bar.png` });
for (const slot of ['basic', 'skill1', 'skill2', 'skill3', 'skill4', 'ultimate']) {
  await page.evaluate(s => { const g = window.__game; const w = window.__tg; if (w) { w.hp = w.maxHp; g.target = w; g.player.pos.set(w.pos.x - 2, 0, w.pos.z); } g.loadout.resetCooldown(s); g.tryCast(s); }, slot);
  await page.waitForTimeout(slot === 'ultimate' ? 350 : 200);
  await page.screenshot({ path: `${OUT}/${slot}.png` });
  await page.waitForTimeout(900);
}
console.log('errors', errors.slice(0, 5));
await b.close();
