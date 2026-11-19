// 加载自检：无头 Chromium 打开 web/index.html，8 秒内无 pageerror / console.error（沙箱缺库时：LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu）
import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file:///workspace/work/proj/web/index.html');
await p.waitForTimeout(8000);
console.log('title', await p.title(), 'version', await p.evaluate(() => document.body.innerText.match(/v0\.\d+\.\w+/)?.[0]));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await b.close();
