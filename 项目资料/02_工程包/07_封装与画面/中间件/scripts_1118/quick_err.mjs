// 打包前冒烟 1：打开 web/desktop/index.html（默认流程，含开场探测），12 秒内不得有 PAGEERR；同时记 requestfailed
import { chromium } from '/workspace/work/p73/node_modules/playwright-core/index.mjs';
import { serve, ARGS, DRFS, ROOT } from './_srv.mjs';
const srv = serve(8771); const b = await chromium.launch({ args: ARGS }); const page = await b.newPage({ viewport: { width: 960, height: 540 } });
const pe = [], rf = [];
page.on('pageerror', e => pe.push(e.message.slice(0, 300)));
page.on('requestfailed', r => rf.push(r.url() + ' ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 400) rf.push(r.url() + ' HTTP ' + r.status()); });
await page.addInitScript(DRFS);
await page.goto('http://127.0.0.1:8771/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
const st = await page.evaluate(() => ({ game: !!window.__game, start: document.getElementById('start')?.textContent || null, title: document.title }));
console.log('ROOT', ROOT); console.log('state', JSON.stringify(st)); console.log('requestfailed', rf.length, JSON.stringify(rf.slice(0, 10)));
console.log('PAGEERR', pe.length); pe.forEach(m => console.log('PAGEERR', m));
await b.close(); srv.close(); process.exit(pe.length ? 1 : 0);
