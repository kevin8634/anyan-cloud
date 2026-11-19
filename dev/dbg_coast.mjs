// v1.2.88 排查：沉钟海岸 ensureWild 抛错（加载画面卡死）
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultNavigationTimeout(180000);
await page.goto('file://' + resolve(process.argv[2] || 'web/index_dlc1.html'));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(c => window.__game.startGame(c), process.argv[3] || 'dlc1_coffin'); await page.waitForTimeout(3000);
console.log(await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; try { g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast', undefined, '', true); return 'ok ' + String(g.zone); } catch (e) { return e.stack; } }));
await b.close();
