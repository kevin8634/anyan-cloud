import { chromium } from '/workspace/work/p73/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
p.on('console', m => { const t = m.text(); if (/error|warn|dress/i.test(t)) errs.push(t.slice(0, 800)); }); p.on('pageerror', e => errs.push('PE ' + e.message));
await p.goto('file:///workspace/work/wellt/index.html'); await p.waitForTimeout(6000);
for (const k of [0, 1, 2, 3]) { console.log('gl', k, await p.evaluate(k => window.shot(k), k)); await p.screenshot({ path: `/workspace/work/wellt/s${k}.png` }); }
console.log('ERRS', errs.length, errs.join('\n').slice(0, 2500)); await b.close();
