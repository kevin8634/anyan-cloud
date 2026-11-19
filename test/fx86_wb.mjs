// v1.2.79 通用区域件近景：node test/fx79_close.mjs <html> <out> <元素,元素>  每个元素单独一张近景（镜头 11、俯角 0.75）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/workspace/work/shots/fx79c', ELS = (process.argv[4] || 'frost,holy').split(','); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
// v1.2.86 世界首领尤尔格（冻土 + 寒冰风暴）实战截图：node test/fx86_wb.mjs <html> <out>
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; g.goMap('frost', { x: 100, z: 100 }); });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 300000 }); await page.waitForTimeout(3000);
const ok = await page.evaluate(() => { const g = window.__game; const r = g.wbSpawnNow('wb_yurg'); g.player.maxHp = g.player.hp = 1e9; g.camSet?.(14, 0.8); return r; });
console.log('spawn', ok); await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; const e = g.enemies?.find?.(x => x.wb === 'wb_yurg'); if (e) { e.hp = e.maxHp * 0.45; g.player.pos.set(e.pos.x, 0, e.pos.z + 5); } return e ? [e.pos.x, e.pos.z, e.alive] : null; }).then(v => console.log('boss', v));
if (process.env.FX_FROST) await page.evaluate(() => { const g = window.__game, p = g.player.pos; g.fxTest.storm({ x: p.x - 4, z: p.z - 2 }, 3.6, 'frost', 30, undefined, 0x2a70c0, true); g.fxTest.storm({ x: p.x + 4, z: p.z - 2 }, 3.6, 'frost', 30); });
for (let i = 0; i < +(process.env.FX_N || 6); i++) { await page.waitForTimeout(5000); await page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp; }); await page.screenshot({ path: `${OUT}/wb_${i}.png`, timeout: 180000 }); }
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
