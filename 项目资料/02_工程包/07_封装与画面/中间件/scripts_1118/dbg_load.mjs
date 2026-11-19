import { chromium } from '/workspace/work/p73/node_modules/playwright-core/index.mjs';
import { serve, ARGS, DRFS } from './_srv.mjs';
const srv = serve(8773); const t0 = Date.now(); const b = await chromium.launch({ args: ARGS }); const page = await b.newPage({ viewport: { width: 960, height: 540 } });
let n = 0, bytes = 0; const big = [];
page.on('response', async r => { n++; const l = +(r.headers()['content-length'] || 0); });
page.on('request', r => { const u = r.url().replace('http://127.0.0.1:8773', ''); n++; if (n < 400) console.log(((Date.now()-t0)/1000).toFixed(1), r.method(), u.slice(0,120)); });
page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,200)));
await page.addInitScript(DRFS);
await page.goto('http://127.0.0.1:8773/index.html?cg=0&op=0', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 8; i++) { await page.waitForTimeout(10000); const s = await page.evaluate(() => ({ g: !!window.__game, st: document.getElementById('start')?.textContent, ld: document.getElementById('loading')?.textContent?.slice(0,80), heap: performance.memory?.usedJSHeapSize })); console.log('T', ((Date.now()-t0)/1000).toFixed(0), JSON.stringify(s)); }
await b.close(); srv.close();
