// 11-11 桌面版阶段二自检：网页构建里模拟桌面环境（假 __drfs），超高档 GTAO 开 / 关同机位截图 + F3 统计（SwiftShader，只看画面是否正常）
// node test/desk_stage2_shots.mjs [html] [gtao=1|0]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1.html'), G = process.argv[3] ?? '1', D = '/workspace/work/shots/desk_stage2'; mkdirSync(D, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript((g) => { window.__drfs = { read: () => null, mark: () => {} }; if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'ultra' })); localStorage.setItem('darkrock_gtao', g); localStorage.setItem('darkrock_stats', '1'); } }, G);
page.setDefaultTimeout(600000); await page.goto('file://' + HTML + '?cg=0&op=0', { timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(1500);
await page.screenshot({ path: `${D}/camp_gtao${G}.jpg`, quality: 80 });
await page.evaluate(() => window.__game.packDungeon.enter('dlc1_well_dg', 'normal'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; (g.enemies ?? []).forEach(e => { if (e.alive && !e.pboss) { e.hp = 0; e.alive = false; } }); g.player.pos.x = 2700; g.player.pos.z = -2700 + 92; });
await page.waitForTimeout(25000);
const st = await page.evaluate(() => [...document.querySelectorAll('div')].find(d => /fps/.test(d.textContent) && d.style.position === 'fixed')?.textContent ?? '');
await page.screenshot({ path: `${D}/dock_gtao${G}.jpg`, quality: 80 });
console.log('gtao', G, JSON.stringify(st), errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
