// v1.2.49 环境高精化截图：任意地图 + 机位（无 UI），用于改前 / 改后对比与选角背景候选
//   node dev/envshots.mjs <html> <输出目录> <前缀> <quality> <机位.json> [宽x高=1920x1080] [only=名字,名字]
//   机位.json：[[名字, 地图id, [相机x,y,z, 看x,y,z]（地图局部坐标）, 玩家[x,z] 或 null], ...]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync, readFileSync } from 'fs';
const [html, OUT = '/tmp/envshots', PRE = 'shot', Q = 'ultra', SPEC, SIZE = '1920x1080', ONLY = ''] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const [W, H] = SIZE.split('x').map(Number);
const ORIGIN = { camp: [0, 0], frost: [0, 1200], ember: [0, 1700], foothill: [700, -500], star: [400, 400], dlc1_mirror: [2400, -2100], dlc1_coast: [2400, -2400], dlc1_belltower: [2400, -1800] };
const SH = JSON.parse(readFileSync(SPEC, 'utf8')).filter(s => !ONLY || ONLY.split(',').includes(s[0]));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /高精|envhd/.test(m.text())) errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);
await page.addInitScript(q => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
const t0 = Date.now();
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
  try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); d.domain.setLv('belfry', 1); } catch (e) { console.log('domain', e.message); } });
let cur = '';
for (const [name, map, c, pp] of SH) {
  if (map !== cur) { await page.evaluate(m => { const g = window.__game; try { g.ensureWild(m); } catch (e) {} g.goMap(m); }, map); await page.waitForTimeout(8000); cur = map; }
  const O = ORIGIN[map];
  await page.evaluate(([O, c, pp]) => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    const p = pp ?? [c[0], c[2] - 3]; g.player.pos.set(O[0] + p[0], 0, O[1] + p[1]); if (g.player.rig) g.player.rig.root.visible = !!pp;
    window.__camOv = [O[0] + c[0], c[1], O[1] + c[2], O[0] + c[3], c[4], O[1] + c[5]];
    if (!document.getElementById('shot-hide')) { const st = document.createElement('style'); st.id = 'shot-hide'; st.textContent = 'body *{visibility:hidden!important} #game{visibility:visible!important}'; document.head.appendChild(st); } }, [O, c, pp]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` });
  console.log('shot', name);
}
const info = await page.evaluate(() => { const g = window.__game; const r = g.renderer?.info?.render; return { env: g.envHdDebug?.() ?? null, load: g.loadingDebug?.()?.tasks?.length ?? null, calls: r?.calls, tris: r?.triangles }; });
console.log('info', JSON.stringify(info), 'errors:', JSON.stringify(errors.slice(0, 10)));
await b.close().catch(() => {});
