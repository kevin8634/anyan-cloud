// 调试：seashots 同机位 + 执行 JS 文件（node dev/seaprobe.mjs <html> <out> <pre> <q> <only> <js>）；原注释：海底地面 / 水景效果图：镜渊城 · 倒钟广场固定机位（1920×1080）
//   node dev/seashots.mjs <html> <输出目录> <前缀> [quality=ultra] [only=名字,名字]
//   守钟人状态（选 A + 领地解锁 + 钟楼 1 级，和 Rhett 截图一致）；怪物挪走；营地机位保留玩家做比例尺
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/mapshots', PRE = 'shot', Q = 'ultra', ONLY = '', JSF = ''] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(240000); page.setDefaultNavigationTimeout(240000);
await page.addInitScript(q => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(6000);
const O = [2400, -2100];
// [名字, 镜头 [x,y,z,看x,看y,看z]（局部）, 玩家位置（null = 藏起来）]
const SH = [
  ['1_营地同机位', [3, 12, 82, 0, 0, 52], [1, 64]],
  ['2_广场全景', [34, 26, 96, -2, 0, 30], null],
  ['3_水面倒影', [23, 3.4, -47, 62, 8, -14], null],
  ['4_滴水涟漪', [33, 2.4, -46, 39, 0, -36], null],
  ['5_焦散地砖', [-19, 3.0, 3, -22, 0, -7], null],
  ['6_海草沉钟角', [5, 2.6, -49, 15, 0.6, -39], null],
  ['7_南门水景', [9, 4.2, 85, 15, 1, 67], null],
  ['8_概念构图', [21, 3.6, -48, 36, 0.5, -34], null],   // 第二轮：贴近概念图的低机位俯视（水边看钟楼倒影，前景焦散砖 + 钟 + 海草）
].filter(s => !ONLY || ONLY.split(',').includes(s[0].split('_')[0]));
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
  try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); d.domain.setLv('belfry', +(window.__belfryLv || 1)); } catch (e) { console.log('domain', e.message); }
  try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); });
await page.waitForTimeout(9000);
import { readFileSync } from 'fs';
const SRC = readFileSync(JSF, "utf8"); if (process.env.PROBE_TINT) await page.evaluate(() => { window.__tint = 1; });
for (const [name, c, pp] of SH) {
  await page.evaluate(([O, c, pp]) => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    const p = pp ?? [c[0], c[2] - 3]; g.player.pos.set(O[0] + p[0], 0, O[1] + p[1]); if (g.player.rig) g.player.rig.root.visible = !!pp;
    window.__camOv = [O[0] + c[0], c[1], O[1] + c[2], O[0] + c[3], c[4], O[1] + c[5]];
    document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); }, [O, c, pp]);
  await page.waitForTimeout(3500);
  const r = await page.evaluate(src => { try { return new Function('g', src)(window.__game); } catch (e) { return 'ERR ' + e.message; } }, SRC);
  console.log('R', name, JSON.stringify(r, null, 0).slice(0, 6000));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` });
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await b.close().catch(() => {});
