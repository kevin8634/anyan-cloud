// v1.2.79 通用区域件近景：node test/fx79_close.mjs <html> <out> <元素,元素>  每个元素单独一张近景（镜头 11、俯角 0.75）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/workspace/work/shots/fx79c', ELS = (process.argv[4] || 'frost,holy').split(','); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('mage')); await page.waitForTimeout(2000);
await page.evaluate(DX => { const g = window.__game; g.tutFinish?.(true); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; const p = g.player.pos; p.set(p.x - 8 + DX, 0, p.z + 6); }, +(process.env.FX_DX || 0));
await page.waitForTimeout(1500);
for (const el of ELS) {
  await page.evaluate(el => { const g = window.__game, p = g.player.pos; g.camYawSet?.(0.3); g.camSet?.(11, 0.75); const c = { x: p.x, z: p.z - 4.5 }; if (el.startsWith('g:')) g.fxTest.sigil(c, 4, parseInt(el.slice(2), 16), 30); else if (el.startsWith('s:')) { const [, st, e] = el.split(':'); g.fxTest.storm(c, 4, e || 'physical', 30, st); } else g.fxTest.zone(c, 4, el, 30); }, el);
  await page.waitForTimeout(14000); await page.screenshot({ path: `${OUT}/${el.replace(/:/g, '_')}.png`, timeout: 180000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = window.__game; g.fxTest.clear?.(); });
  await page.waitForTimeout(16000);   // 等上一个区域淡出（30 游戏秒在软件渲染下很长，换位置避免叠）
  await page.evaluate(() => { const p = window.__game.player.pos; p.set(p.x + 14, 0, p.z); });
  await page.waitForTimeout(1500);
}
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
