// v1.2.50 职业状态条收起 / 展开截图：node dev/clsStatusShot.mjs <html> <cls> <out前缀>
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, cls, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(() => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); } });
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(c => window.__game.startGame(c), cls);
await page.waitForTimeout(8000);
await page.evaluate(() => window.__game.tutFinish?.());
await page.mouse.move(640, 300); await page.waitForTimeout(1500);
await page.screenshot({ path: out + '_收起.png' });
const bb = await page.evaluate(() => { const r = document.getElementById('cls-status')?.getBoundingClientRect(); return r && [r.x, r.y, r.width, r.height]; });
console.log('bb', JSON.stringify(bb));
if (bb) { await page.mouse.move(bb[0] + 20, bb[1] + bb[3] / 2); await page.waitForTimeout(800); await page.screenshot({ path: out + '_展开.png' }); }
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await b.close();
