import { chromium } from 'playwright-core'; import { resolve } from 'path';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message.slice(0,200)));
page.on('console', m => { if (m.type()==='error') console.log('CE', m.text().slice(0,200)); });
await page.goto('http://127.0.0.1:8790/index.html', { timeout: 0, waitUntil: 'commit' });
for (let i = 0; i < 9; i++) { await page.waitForTimeout(10000); console.log(i, await page.evaluate(() => [!!window.__game, document.getElementById('start')?.textContent, document.readyState])); }
await page.screenshot({ path: '/tmp/probe.png' }); await b.close();
