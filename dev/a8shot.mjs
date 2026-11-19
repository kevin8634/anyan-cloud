// raidA A8 摆渡双子双首领机制 浏览器实测截图：node dev/a8shot.mjs [html] [outDir]
// 比赛版 DLC（node build-web.mjs --assets=aholo --dlc=dlc1）中画质 swiftshader：进潮渊钟井 → 跳到摆渡双子 →
//   ① 死渡交战（正式绑骨件）② 50% 生渡上岸、死渡锁血护壳、双子同场 ③ 渡生引导（警报条 + 光束）④ 打断（踉跄、光束断）⑤ 生渡倒下「断渡」
// 每段存 jpg，并连拍帧（frames/）给 GIF。状态写 a8_log.json。
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, process.argv[3] || 'shots_a8');
mkdirSync(OUT + '/frames', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(300000); page.setDefaultTimeout(300000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
const log = { t0: Date.now(), steps: [] };
const note = async (tag) => { const s = await page.evaluate(() => { const W = window.__dlc1.well; return { twins: W.twins.info(), glb: W.twins.glb(), built: W.rig().built, warn: W.rig().raidWarn, gate: window.__game.packDungeon.state()?.gate ?? null }; }); s.events = undefined; log.steps.push({ tag, ...s }); console.log(tag, JSON.stringify({ d: s.twins.death && Math.round(s.twins.death.hp / s.twins.death.max * 100), l: s.twins.life && Math.round(s.twins.life.hp / s.twins.life.max * 100), mend: s.twins.mending, beam: s.twins.beam, shell: s.twins.shell, warn: s.warn?.text, mode: s.built.wl_ferry_death?.mode, lifeMode: s.built.wl_ferry_life?.mode })); };
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.jpg`, quality: 80 });
let fi = 0; const burst = async (n, gap) => { for (let k = 0; k < n; k++) { await page.screenshot({ path: `${OUT}/frames/f${String(fi++).padStart(3, '0')}.jpg`, quality: 70 }); if (gap) await page.waitForTimeout(gap); } };
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(20000);
const god = () => page.evaluate(() => { const g = window.__game; g.player.maxHp = 1e12; g.player.hp = 1e12; });
for (let i = 0; i < 3; i++) {   // 跳过前三个首领
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(B.pos.x, 0, B.pos.z + 9); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; for (let k = 0; k < 6; k++) { g.fx.dealDamage(B, B.maxHp, 'physical', g.player); g.packDungeon.units().cores?.forEach(c => g.fx.dealDamage(c, c.maxHp * 9, 'physical', g.player)); } });
  await page.waitForTimeout(2500); await page.evaluate(() => { const g = window.__game; if (g.dgxDebug()?.pick) g.dgxPick(0); }); await page.waitForTimeout(1500);
}
// ① 死渡交战
await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(B.pos.x + 1, 0, B.pos.z + 10); });
await page.waitForTimeout(9000); await god(); await note('A8_1_死渡交战'); await shot('A8_1_死渡交战'); await burst(6, 600);
// ② 50%：生渡上岸，死渡锁血
await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; window.__dlc1.well.twins.mendNow(99); g.fx.dealDamage(B, B.hp - B.maxHp * 0.49, 'physical', g.player); });
await page.waitForTimeout(2500);
const frame2 = () => page.evaluate(() => { const g = window.__game, U = g.packDungeon.units(), B = U.boss, L = U.cores[0]; if (!L) return; const mx = (B.pos.x + L.pos.x) / 2, mz = (B.pos.z + L.pos.z) / 2, d = Math.hypot(B.pos.x - L.pos.x, B.pos.z - L.pos.z); g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(mx, 0, mz + 7 + d * 0.4); });
await frame2(); await page.waitForTimeout(5000); await frame2(); await page.waitForTimeout(3000);
await note('A8_2_双子同场_锁血'); await shot('A8_2_双子同场_锁血'); await burst(6, 600);
// ③ 渡生引导
await frame2(); await page.evaluate(() => window.__dlc1.well.twins.mendNow(0));
await page.waitForFunction(() => window.__dlc1.well.twins.info().beam, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1500);   // 1 FPS 软件渲染：等光束真正出现（渐显 0.4 秒）再拍
await note('A8_3_渡生引导'); await shot('A8_3_渡生引导'); await burst(5, 300);
// ④ 打断
await page.evaluate(() => { const L = window.__game.packDungeon.units().cores[0]; window.__a8int = L?.onInterrupt?.(); });
await page.waitForTimeout(500); await note('A8_4_打断引导'); await shot('A8_4_打断引导'); await burst(6, 400);
// ⑤ 击倒生渡：断渡
await page.evaluate(() => { const g = window.__game, L = g.packDungeon.units().cores[0]; for (let k = 0; k < 20 && L?.alive; k++) g.fx.dealDamage(L, L.maxHp, 'physical', g.player); });
await page.waitForTimeout(2500); await note('A8_5_断渡'); await shot('A8_5_断渡'); await burst(4, 500);
log.errors = errors; log.int = await page.evaluate(() => window.__a8int); log.events = await page.evaluate(() => window.__dlc1.well.twins.info().events);
writeFileSync(`${OUT}/a8_log.json`, JSON.stringify(log, null, 1));
console.log('errors', errors.length, errors.slice(0, 3).join(' | '), 'interrupt', log.int);
await b.close();
