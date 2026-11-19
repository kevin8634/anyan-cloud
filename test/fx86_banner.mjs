// v1.2.79 通用区域件近景：node test/fx79_close.mjs <html> <out> <元素,元素>  每个元素单独一张近景（镜头 11、俯角 0.75）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/workspace/work/shots/fx79c', ELS = (process.argv[4] || 'frost,holy').split(','); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
// v1.2.86 战旗截图：战士装战旗，原地放大招，0.3 / 2.5 秒各一张
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; const p = g.player.pos; p.set(p.x + 20, 0, p.z + 6);
  const sb = g.skillBook; sb.learned.add('war_banner'); sb.equip.ultimate = 'war_banner'; g.equipFromBook(); g.camYawSet?.(0.3); g.camSet?.(11, 0.75); });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const g = window.__game; g.tryCast('ultimate'); return g.skillBook.skillAt('ultimate').id; });
console.log('ult', info);
await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/banner_a.png`, timeout: 180000 });
await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/banner_b.png`, timeout: 180000 });
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
