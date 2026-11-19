// v1.2.35 截图：技能栏冷却重置闪光 + 立誓 BUFF：node dev/resetshot.mjs web/index.html out.png
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file://' + resolve(html));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') p.style.display = 'none'; }); g.player.hp = g.player.maxHp = 1e7; g.goMap('field'); });
await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') p.style.display = 'none'; }); g.tryDodge(); for (const s of ['skill2', 'ultimate']) g.loadout.cooldownEnd.set(s, g.T + 25); });
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.__game; g.doReset('ultimate', 20); });
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await b.close();
