// v1.2.73 M 地图 3D 反复开关 + 2D/3D 按钮回归
import { chromium } from '../node_modules/playwright-core/index.mjs';
const HTML = process.argv[2] || new URL('../web/index.html', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.setDefaultTimeout(420000);
await p.goto('file://' + HTML);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); });
await p.reload();
await p.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险');
await p.evaluate(() => window.__game.startGame('warrior')); await p.waitForTimeout(3000); await p.evaluate(() => window.__game.tutFinish?.());
const st = () => p.evaluate(() => { const d = window.__game.wm3dDebug(); return { active: d.active, failed: d.failed, btn: document.querySelector('#worldmap [data-m3sw]').textContent }; });
let ok = true;
for (let i = 0; i < 4; i++) {
  await p.evaluate(() => window.__game.toggleWorldMap()); await p.waitForTimeout(4000);
  const s = await st(); console.log('open', i, JSON.stringify(s)); if (!s.active || s.failed) ok = false;
  await p.evaluate(() => window.__game.toggleWorldMap()); await p.waitForTimeout(1500);
}
await p.evaluate(() => window.__game.toggleWorldMap()); await p.waitForTimeout(4000);
await p.click('#worldmap [data-m3sw]'); await p.waitForTimeout(1500);
let s = await st(); console.log('btn->2D', JSON.stringify(s)); if (s.active || s.btn !== '3D') ok = false;
await p.click('#worldmap [data-m3sw]'); await p.waitForTimeout(4000);
s = await st(); console.log('btn->3D', JSON.stringify(s)); if (!s.active || s.btn !== '2D') ok = false;
console.log('errs', JSON.stringify(errs.slice(0, 8)), errs.length ? 'FAIL' : '');
console.log(ok && !errs.length ? 'ALL PASS' : 'FAIL');
await b.close();
