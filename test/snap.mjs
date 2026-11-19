// 无头 Chromium 截图小工具：node test/snap.mjs [脚本.mjs]（脚本 export default async page => {...}）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const b = await chromium.launch({ env: { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/.cache/ms-playwright/chromium-1140/chrome-linux' }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('file://' + resolve('web/index.html'));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.waitForTimeout(1500);
const script = process.argv[2] ? (await import(resolve(process.argv[2]))).default : async () => { await page.screenshot({ path: '/tmp/s_title.png' }); };
await script(page);
console.log('errors', errors);
await b.close();
