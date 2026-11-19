// fix1106 载入耗时（无头、不截图）：开机到标题、标题到进世界、DLC 怪物延后解析的「未就绪」次数
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), CLS = process.env.CLS || 'warrior';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const T0 = Date.now(), errs = [], miss = [];
page.on('pageerror', e => errs.push(e.message)); page.on('crash', () => console.log('PAGE CRASH', (Date.now() - T0) / 1000)); page.on('console', m => { const x = m.text(); if (/未就绪|没解析完|出错|失败/.test(x)) { miss.push(x.slice(0, 160)); } });
page.setDefaultTimeout(900000);
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000, polling: 250 });
const tTitle = (Date.now() - T0) / 1000;
const tasks = await page.evaluate(() => window.__loadDbg?.().tasks);
const T1 = Date.now();
await page.evaluate(c => window.__game.startGame(c), CLS);
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000, polling: 250 });
const tWorld = (Date.now() - T1) / 1000;
await page.waitForTimeout(4000);
console.log(JSON.stringify({ tTitle, tWorld, tasks, miss: [...new Set(miss)].slice(0, 40), errs: errs.slice(0, 10) }, null, 1));
await b.close();
