// 诊断：加载页面，记录控制台 / 崩溃 / 加载任务进度
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const [html, Q = 'ultra', SIZE = '960x540'] = process.argv.slice(2); const [W, H] = SIZE.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('console', m => console.log('[c]', m.type(), m.text().slice(0, 300))); page.on('pageerror', e => console.log('[err]', e.message)); page.on('crash', () => console.log('[CRASH]'));
await page.addInitScript(q => { localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); }, Q);
const t0 = Date.now();
page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded', timeout: 300000 }).catch(e => console.log('goto', e.message));
for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 4000));
  try { const s = await page.evaluate(() => ({ st: document.getElementById('bl-stage')?.textContent, pct: document.getElementById('bl-pct')?.textContent, ld: window.__game?.loadingDebug?.(), btn: document.getElementById('start')?.textContent, env: window.__game?.envHdDebug?.() }));
    console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify({ st: s.st, pct: s.pct, btn: s.btn, env: s.env, real: s.ld?.real }));
    if (s.btn === '开始冒险') { await page.screenshot({ path: '/tmp/diag_title.png' }); break; } } catch (e) { console.log('eval fail', e.message.slice(0, 100)); if (/closed|crash/i.test(e.message)) break; } }
await b.close().catch(() => {});
