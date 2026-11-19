// A10 按需加载验收：比赛版 DLC（web/raid/ 拆包）进潮渊钟井 → 首领绑骨件按需加载 / 解析 / 预热；NORAID=1 时先删掉 raid/ 验证回退静态件不报错
// 用法：node dev/a10lazy.mjs [html]
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultTimeout(600000); const t0 = Date.now(); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
console.log('boot s', ((Date.now() - t0) / 1000).toFixed(0), JSON.stringify(await page.evaluate(() => window.__dlc1?.well?.twins.glb() ?? null)));
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
// 正常玩家从无声钟楼的门进来（走过去 + 选难度的时间里资源已到齐）；这里直接等加载完再进副本，验证戈尔顿也拿到正式绑骨件
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; });
await page.evaluate(() => window.__dlc1.well.twins.glbEnsure?.());
await page.evaluate(() => window.__game.packDungeon.enter('dlc1_well_dg', 'normal'));
for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.__dlc1.well.twins.glb().lazy); if (s.state === 'done' && s.warm !== 'pending') break; await page.waitForTimeout(3000); }
const info = await page.evaluate(() => ({ glb: window.__dlc1.well.twins.glb(), built: window.__dlc1.well.rig().built }));
console.log(JSON.stringify(info.glb)); console.log(JSON.stringify(Object.fromEntries(Object.entries(info.built).map(([k, v]) => [k, v.mode]))));
console.log('errors', errors.length, errors.slice(0, 4).join(' | '));
await b.close();
