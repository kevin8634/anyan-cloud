// raidA 竖井层次地形验收：node dev/wellshot.mjs <html> <outDir> <old|new> [quality=high]
// 3 个全景机位（__camOv 定机位）+ 5 个首领场地的游戏机位（玩家放上去），记录帧耗时（SwiftShader 相对值）和玩家贴地高度
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, process.argv[3] || 'shots_well'), MODE = process.argv[4] || 'new', Q = process.argv[5] || 'high';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript((q) => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, Q);
page.setDefaultNavigationTimeout(400000); page.setDefaultTimeout(400000); await page.goto('file://' + HTML + '?scene=' + MODE);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(20000);
const O = { x: 2700, z: -2700 }, res = { mode: MODE, q: Q, shots: [] };
const put = (x, z) => page.evaluate(([x, z]) => { const g = window.__game; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(x, 0, z); }, [O.x + x, O.z + z]);
const frame = () => page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
const pano = [['p1_全景_南望北', [0, 40, 64], [0, -8, -6], 0, 66], ['p2_全景_西望东', [-62, 32, 4], [10, -8, 0], -46, 12], ['p3_全景_井底仰望', [8, -1, -4], [-12, 16, 40], 8, 4]];
for (const [n, c, l, px, pz] of pano) {
  await put(px, pz); await page.waitForTimeout(1500);
  await page.evaluate(([c, l]) => { window.__camOv = [c[0], c[1], c[2], l[0], l[1], l[2]]; }, [[O.x + c[0], c[1], O.z + c[2]], [O.x + l[0], l[1], O.z + l[2]]]);
  await page.waitForTimeout(3000); const ft = await frame(); await page.screenshot({ path: `${OUT}/${MODE}_${n}.jpg`, quality: 85 }); res.shots.push({ n, frameMs: Math.round(ft) }); console.log(n, Math.round(ft));
}
await page.evaluate(() => { delete window.__camOv; });
const spots = [['g1_码头', 0, 52], ['g2_礼拜堂', -44, 18], ['g3_冰湖', -12, -34], ['g4_黑水', 36, -12], ['g5_井底', 8, 10], ['g6_栈道_码头到礼拜堂', -24, 34]];
for (const [n, x, z] of spots) {
  for (let k = 0; k < 2; k++) { await put(x, z); await page.waitForTimeout(2200); }
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const y = await page.evaluate(() => window.__game.player.pos.y);
  const ft = await frame(); await page.screenshot({ path: `${OUT}/${MODE}_${n}.jpg`, quality: 85 }); res.shots.push({ n, frameMs: Math.round(ft), playerY: +y.toFixed(2) }); console.log(n, Math.round(ft), 'y', y.toFixed(2));
}
res.errors = errors; writeFileSync(`${OUT}/${MODE}_log.json`, JSON.stringify(res, null, 1));
console.log('errors', errors.length, errors.slice(0, 3).join(' | ')); await b.close();
