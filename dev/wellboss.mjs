// 长副本 A 首领逐个截图：node dev/wellboss.mjs [html] → shots_well/boss<i>.jpg
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, 'shots_well');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(22000);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(B.pos.x, 0, B.pos.z + 9); });
  await page.waitForTimeout(5000); await page.screenshot({ path: `${OUT}/boss${i}.jpg`, quality: 70 });
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; for (let k = 0; k < 6; k++) { g.fx.dealDamage(B, B.maxHp, 'physical', g.player); g.packDungeon.units().cores?.forEach(c => g.fx.dealDamage(c, c.maxHp * 9, 'physical', g.player)); } });
  await page.waitForTimeout(2500); await page.evaluate(() => { const g = window.__game; if (g.dgxDebug()?.pick) g.dgxPick(0); });
  await page.waitForTimeout(1500);
}
console.log('errors', errors.length, errors[0] ?? '');
await b.close();
