// v0.9.2f 登录动画截图：node test/intro-shots.mjs [输出目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/intro'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto('file://' + resolve('web/index.html') + '?intro=1', { waitUntil: 'commit' });
await page.waitForSelector('#intro', { timeout: 60000 });
const tIntro = Date.now();
for (const ms of [500, 1300, 1900, 2500, 3200, 4200]) { const w = tIntro + ms - Date.now(); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/intro_${ms}.png` }); }
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
console.log('intro active before click:', await page.evaluate(() => window.__game.introActive()));
await page.mouse.click(640, 360);
await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/title_0500.png` });
await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/title_3000.png` });
console.log('intro removed:', await page.evaluate(() => !document.getElementById('intro')));
await page.click('#start');
await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/enter_0250.png` });
await page.waitForTimeout(1700); await page.screenshot({ path: `${OUT}/enter_1950.png` });
console.log('started:', await page.evaluate(() => document.getElementById('title').style.display === 'none' && !document.getElementById('enter-fx')));
console.log('errors:', errors.length ? errors : 'none', 'total', ((Date.now() - t0) / 1000).toFixed(1) + 's');
await b.close();
