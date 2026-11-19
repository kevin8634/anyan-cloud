// v1.2.76 选角首屏（循环背景 + 剪影人 + 创建角色）→ 3D 选角（NPC 藏起）：node test/fx76_gate.mjs <目录含 index.html> <输出目录>
import { chromium } from 'playwright-core'; import { mkdirSync } from 'fs';
const DIR = process.argv[2] || '/tmp/opt', OUT = process.argv[3] || '/tmp/fx76'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], log = [];
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(e.message));
page.setDefaultNavigationTimeout(240000); page.goto('file://' + DIR + '/index.html?cg=0&op=0').catch(e => errors.push(e.message));
await page.waitForFunction(() => window.__game && document.getElementById('start'), null, { timeout: 240000 });
await page.waitForTimeout(5000);
const st = () => page.evaluate(() => { const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  return { gate: document.documentElement.classList.contains('selgate'), create: vis('sel-create'), pick: vis('class-pick'), canvasBg: !!__game.scene.background?.isCanvasTexture,
    sel: __game.selectInfo?.(), bg: window.__selBg?.() }; });
log.push('gate ' + JSON.stringify(await st()));
await page.screenshot({ path: OUT + '/gate.png', timeout: 120000 }).catch(() => log.push('shot fail'));
await page.click('#sel-create'); await page.waitForTimeout(5000);
log.push('stage ' + JSON.stringify(await st()));
await page.screenshot({ path: OUT + '/stage.png', timeout: 120000 }).catch(() => log.push('shot2 fail'));
await page.evaluate(() => document.querySelector('#class-pick .ccard')?.click()); await page.waitForTimeout(3000);
await page.screenshot({ path: OUT + '/detail.png', timeout: 120000 }).catch(() => log.push('shot3 fail'));
console.log(log.join('\n')); console.log('errors=' + JSON.stringify(errors)); await b.close();
