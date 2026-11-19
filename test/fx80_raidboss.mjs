// v1.2.80 合并 raidA：长副本潮渊钟井首领实战截图（看首领地面区域走主线 zonestorm 后的亮度）：node test/fx80_raidboss.mjs <html> <out> [首领序号0-4]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/fx80_raid', BI = +(process.argv[4] || 0); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
b.on('disconnected', () => console.log('browser disconnected'));
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => console.log('PAGE CRASH'));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultTimeout(600000); await page.goto('file://' + HTML, { timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(2000);
const info = await page.evaluate((bi) => { const g = window.__game, st = g.packDungeon.state(); const bs = (g.enemies ?? []).filter(e => e.alive && (e.pboss || e.type?.boss || e.isBoss));
  const e = bs.find(x => x.pboss === st?.boss?.key) ?? bs[0]; if (!e) return { st: st?.boss?.key, n: bs.length };
  (g.enemies ?? []).filter(x => x !== e && x.z === e.z && !x.pboss).forEach(x => { x.hp = 0; x.alive = false; });
  g.player.maxHp = g.player.hp = 1e9; g.player.pos.set(e.pos.x, 0, e.pos.z + 6); g.camSet?.(14, 0.8); return { key: e.pboss, name: e.type?.name, x: e.pos.x, z: e.pos.z }; }, BI);
console.log('boss', JSON.stringify(info));
for (let i = 0; i < +(process.env.FX_N || 8); i++) { await page.waitForTimeout(5000); const c = await page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp; return document.getElementById('cb-name')?.textContent ?? ''; }); await page.screenshot({ path: `${OUT}/raid_${i}.png`, timeout: 180000 }); console.log(i, c); }
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
