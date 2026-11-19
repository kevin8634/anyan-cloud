// 调试用：进游戏后执行一段 JS（文件），截图；node dev/probe.mjs <html> <mode> <cls> <js文件> <输出png>
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync } from 'fs';
const [html, mode, cls, js, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', e => console.log('pageerror', e.message)); page.on('console', m => { if (m.type() === 'error' || m.text().startsWith('P:')) console.log(m.text().slice(0, 400)); });
await page.goto('file://' + resolve(html));
await page.evaluate(m => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: m })); }, mode);
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(c => window.__game.startGame(c), cls);
await page.waitForTimeout(2000);
await page.evaluate(() => { for (const e of document.querySelectorAll('body > *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; const g = window.__game; g.camSet(4.6, 0.2); g.camYawSet(0); });
const steps = readFileSync(js, 'utf8').split('\n//SHOT\n');
let i = 0;
for (const st of steps) { const r = await page.evaluate(async src => { const f = new Function('g', 'return (async () => {' + src + '})()'); return f(window.__game); }, st); if (r !== undefined) console.log('R', JSON.stringify(r).slice(0, 1500)); await page.waitForTimeout(900); await page.screenshot({ path: out.replace('.png', `_${i++}.png`), clip: { x: 280, y: 30, width: 340, height: 560 } }); }
await b.close();
