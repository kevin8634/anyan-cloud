// 复现：评委面板点「打开铸造台」后移动鼠标
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/diag/uifix';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(1500000); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('GLTFLoader')) console.log('CERR', m.text().slice(0, 200)); }); page.on('pageerror', e => console.log('PERR', e.message));
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 1500000, polling: 2000 });
console.log('title ready', new Date().toISOString()); await page.evaluate(() => document.getElementById('demo-enter').click());
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/probe_old_0.png` });
const go = await page.$('#d1-judge .go'); const bb = await go.boundingBox(); console.log('go', bb);
await page.mouse.move(bb.x + 5, bb.y + 5); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(500);
console.log('open after click', await page.evaluate(() => !!document.getElementById('d1-forge')));
for (const [x, y] of [[640, 360], [300, 200], [900, 500], [640, 100], [50, 50]]) { await page.mouse.move(x, y, { steps: 5 }); await page.waitForTimeout(300); console.log('move', x, y, await page.evaluate(() => !!document.getElementById('d1-forge'))); }
await page.screenshot({ path: `${OUT}/probe_old_1_after_moves.png` });
// 旧版：在输入框里按下、拖到面板外松开（选文字的常见动作）
const inp = await page.$('#fg-p'); if (inp) { const r = await inp.boundingBox(); await page.mouse.move(r.x + 20, r.y + 10); await page.mouse.down(); await page.mouse.move(20, 700, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300); }
console.log('drag-select out of input', await page.evaluate(() => !!document.getElementById('d1-forge')));
await page.evaluate(() => window.__dlc1.smithy.open()); await page.waitForTimeout(500);
await page.mouse.click(30, 700); await page.waitForTimeout(300);
console.log('single click on backdrop', await page.evaluate(() => !!document.getElementById('d1-forge')));
await page.evaluate(() => window.__dlc1.smithy.open()); await page.waitForTimeout(500);
await page.mouse.dblclick(bb.x + 5, bb.y + 5); await page.waitForTimeout(300);
console.log('dblclick judge button', await page.evaluate(() => !!document.getElementById('d1-forge')));
await b.close();
