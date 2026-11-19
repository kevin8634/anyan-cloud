// v1.2.78 共用地面特效件截图：各元素持续区域 + 爆开冲击。node test/fx78_ground.mjs [html] [out]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/workspace/work/shots/fx78'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('mage')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; });
await page.waitForTimeout(1500);
const mode = process.argv[4] || 'zone';
await page.evaluate(m => { const g = window.__game, p = g.player.pos; g.camYawSet?.(0); g.camSet?.(19, 0.95);
  const els = ['fire', 'physical', 'nature', 'shadow', 'arcane', 'lightning', 'holy', 'frost'];
  els.forEach((el, i) => { const x = p.x + ((i % 4) - 1.5) * 7.5, z = p.z + (Math.floor(i / 4) - 0.5) * 7.5 - 3;
    if (m === 'zone') g.fxTest.zone({ x, z }, 3, el, 20); else g.fxTest.ring({ x, z }, 3.2, ({ lightning: '#a8c8ff', physical: '#ffffff', fire: '#ff7a1a', frost: '#6fd0ff', shadow: '#b060ff', holy: '#ffe070', nature: '#7dff5a', arcane: '#d07dff' })[el], 1.4); }); }, mode);
for (const [i, ms] of (mode === 'zone' ? [12000, 12000] : [250, 300, 300]).entries()) { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}/${mode}_${i}.png`, timeout: 180000 }); }
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS');
await b.close();
