// 井口码头改造样板 前后同机位对照：node dev/dockshot.mjs <html> <outDir> <old|new> [quality=high]
// 比赛版 DLC，SwiftShader 软件渲染（帧耗时只能看相对值，不代表 2060）。进潮渊钟井 → 玩家放到 3 个机位 → 截图 + 5 秒平均帧耗时。
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, process.argv[3] || 'shots_dock'), MODE = process.argv[4] || 'new', Q = process.argv[5] || 'high';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript((q) => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, Q);
page.setDefaultNavigationTimeout(400000); page.setDefaultTimeout(400000); await page.goto('file://' + HTML + '?scene=' + MODE);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(20000);
const O = { x: 2700, z: -2700 }, B1 = { x: O.x, z: O.z + 46 };
const spots = [['1_码头正面', 0, 13], ['2_码头侧面', -12, 4], ['3_码头近景', 4, 6]];
const res = { mode: MODE, q: Q, shots: [] };
for (const [n, dx, dz] of spots) {
  for (let k = 0; k < 3; k++) { await page.evaluate(([x, z]) => { const g = window.__game; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(x, 0, z); g.packDungeon.units?.().boss && (g.packDungeon.units().boss.aggro = 0); }, [B1.x + dx, B1.z + dz]); await page.waitForTimeout(2500); }
  const ft = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r((performance.now() - t0) / n); }; requestAnimationFrame(f); }));
  await page.screenshot({ path: `${OUT}/${MODE}_${n}.jpg`, quality: 85 });
  res.shots.push({ n, frameMs: Math.round(ft) });
  console.log(MODE, n, 'frame ms', Math.round(ft));
}
res.grade = await page.evaluate(() => window.__dlc1?.well?.debug?.()?.dockGrade ?? null);
res.errors = errors; writeFileSync(`${OUT}/${MODE}_log.json`, JSON.stringify(res, null, 1));
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await b.close();
