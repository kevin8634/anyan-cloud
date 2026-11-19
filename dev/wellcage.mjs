// 长副本 A 钟笼升降梯浏览器自检 + 截图（A6）：node dev/wellcage.mjs [low|medium] [html] → shots_well/cage_<画质>_*.jpg
// 比赛版（gen-assets --assets=aholo）+ medium 走 Lux3D 铸铁吊笼；low / base 包走程序化回退。打印 JSON：两座笼的模型类型、乘坐高度曲线、错误数
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, Q = process.argv[2] || 'medium', HTML = resolve(ROOT, process.argv[3] || 'web/index_dlc1.html'), OUT = resolve(ROOT, 'shots_well');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(q => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, Q);
page.setDefaultNavigationTimeout(300000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(15000);
const W = () => page.evaluate(() => window.__dlc1.well.lift());
const put = (x, z) => page.evaluate(([x, z]) => { const g = window.__game; g.player.maxHp = 1e9; g.player.hp = 1e9; g.player.pos.set(2700 + x, g.player.pos.y, -2700 + z); }, [x, z]);
const C = await page.evaluate(() => window.__dlc1.well.CAGES);
const out = { quality: Q, zone: await page.evaluate(() => window.__game.zone) };
await put(C[0].x + 7, C[0].z + 3); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/cage_${Q}_bottom.jpg`, quality: 70 });
await put(C[0].x, C[0].z); await page.waitForTimeout(400);
// swiftshader 帧率很低（游戏时间每帧最多 0.05 秒），按游戏状态轮询到停靠，最多 6 分钟
const ys = []; let shot = false;
for (let k = 0; k < 360; k++) { await page.waitForTimeout(1000); const y = +(await page.evaluate(() => window.__game.player.pos.y)).toFixed(2); ys.push(y);
  if (!shot && y > 3) { shot = true; await page.screenshot({ path: `${OUT}/cage_${Q}_ride.jpg`, quality: 70 }); }
  const l = await W(); if (l.cages[0].at === 1 && !l.cages[0].moving) break; }
await page.screenshot({ path: `${OUT}/cage_${Q}_top.jpg`, quality: 70 });
const li = await W();
out.cages = li.cages.map(c => ({ lux: c.lux, rideR: c.rideR, at: c.at })); out.level = li.level; out.ys = ys.filter((_, i) => i % Math.max(1, Math.floor(ys.length / 12)) === 0).concat(ys.slice(-1));
out.errors = errors.length; out.err0 = errors[0] ?? '';
console.log(JSON.stringify(out));
await b.close();
