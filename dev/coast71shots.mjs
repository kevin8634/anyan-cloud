// v1.2.71 沉钟海岸地图升级截图：node dev/coast71shots.mjs <html> <输出目录> [quality=ultra] [only=名字前缀,...] [storm=1]
//   固定机位（局部坐标，原点 COAST_O）；怪物挪走、界面藏起；B 区机位先把玩家放进码头等风暴权重升满
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html = 'web/index_dlc1.html', OUT = 'docs/设计/沉钟海岸升级/shots', Q = 'ultra', ONLY = ''] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const W = +(process.env.SHOT_W || 1600), H = +(process.env.SHOT_H || 900);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.setDefaultTimeout(600000); page.setDefaultNavigationTimeout(600000);
await page.addInitScript(([q]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, dayNight: false })); } }, [Q]);
const t0 = Date.now();
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
console.log('loaded', ((Date.now() - t0) / 1000).toFixed(0) + 's');
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 35; g.player.hp = g.player.maxHp = 1e7; try { g.setGameHour?.(12); } catch (e) {} g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); });
await page.waitForTimeout(5000);
console.log('enter', ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(await page.evaluate(() => { const d = window.__dlc1.coast71(); return { built: d.built, q: d.q, floor: d.floor, sea: d.sea, sky: d.sky, dress: d.dress, objs: d.objs?.length }; })));
const O = [2400, -2400];
// [名字, 镜头 [x,y,z,看x,看y,看z]（局部）, 玩家（null = 藏起）, 风暴（B 区等权重升满）]
const SH = [
  ['A_退潮沉钟浅滩', [-16, 7, 14, 4, 0.5, -16], null, 0],
  ['A2_巨钟近景', [9, 3.2, 2, 0, 1.5, -12], null, 0],
  ['A3_石堤玄武岩', [28, 5, -78, 58, 1, -104], null, 0],
  ['B_风暴锈锚码头', [76, 9, 34, 112, 3, 0], [86, 18], 1],
  ['B2_低机位风暴', [84, 1.6, 14.5, 120, 6, -14], [92, 18], 1],
  ['B3_灯塔光束', [96, 5, -14, 124, 18, -38], [96, -18], 1],
  ['B4_井口升降笼', [101, 4.5, 5, 112, 3, -5.5], [104, 2], 1],
  ['C_鲸骨礁湾', [-52, 6, 6, -86, 4, -34], null, 0],
  ['C2_骨拱挂钟', [-54, 2.8, -36, -63, 3.5, -45], null, 0],
  ['W_全景俯瞰', [0, 90, 90, 0, 0, -20], null, 0],
].filter(s => !ONLY || ONLY.split(',').some(k => s[0].startsWith(k)));
for (const [name, c, pp, storm] of SH) {
  await page.evaluate(([O, c, pp]) => { const g = window.__game; g.enemies.forEach(x => { if (x.z === 'dlc1_coast') { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; } });
    const p = pp ?? [c[3], c[5]]; g.player.pos.set(O[0] + p[0], 0, O[1] + p[1]); if (g.player.rig) g.player.rig.root.visible = !!pp;
    window.__camOv = [O[0] + c[0], c[1], O[1] + c[2], O[0] + c[3], c[4], O[1] + c[5]];
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    document.body.style.visibility = 'hidden'; document.querySelectorAll('body *').forEach(x => { x.style.visibility = x === cv ? 'visible' : 'hidden'; }); }, [O, c, pp]);
  if (!process.env.SMOOTH) await page.evaluate((k) => window.__dlc1.coastStorm.snap(k), storm);
  if (storm) { await page.waitForFunction(() => window.__dlc1.coast71().storm > 0.9, null, { timeout: 240000, polling: 1000 }).catch(() => console.log('storm 未升满')); if (process.env.FLASH) await page.evaluate(() => window.__dlc1.coastStorm?.flashNow?.()); }
  else await page.waitForFunction(() => window.__dlc1.coast71().storm < 0.05, null, { timeout: 240000, polling: 1000 }).catch(() => console.log('storm 未退'));
  await page.waitForTimeout(+(process.env.SHOT_WAIT || 2500));
  await page.screenshot({ path: `${OUT}/${name}_${Q}.png` });
  console.log('shot', name, JSON.stringify(await page.evaluate(() => { const d = window.__dlc1.coast71(); return { storm: +d.storm.toFixed(2), zone: d.zone, fps: window.__game.fps?.() }; })));
}
console.log(errors.length ? 'errors: ' + errors.slice(0, 8).join(' | ') : 'no page errors');
await b.close();
