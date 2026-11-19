// 首次进入耗时对比（沙箱 swiftshader 无 GPU，只看相对差）：同一份 HTML，Chromium 打开 file:// vs Electron 外壳
//   node desktop/electron/bench.mjs chrome <html>
//   node desktop/electron/bench.mjs electron <electron 可执行> <app 目录>
// 指标与 test/fix1106_loadtime.mjs 一致：开机到标题按钮「开始冒险」、点开始到进世界
import { chromium, _electron } from 'playwright-core'; import { resolve } from 'path';
const [mode, a1, a2] = process.argv.slice(2), CLS = process.env.CLS || 'warrior';
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--max-old-space-size=4096'];
const T0 = Date.now(); let b, page;
if (mode === 'chrome') {
  b = await chromium.launch({ args: GL }); page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000); await page.goto('file://' + resolve(a1) + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
} else {
  b = await _electron.launch({ executablePath: a1, args: [resolve(a2), '--no-sandbox', ...GL], env: { ...process.env, DARKROCK_QUERY: 'cg=0&op=0' }, timeout: 900000 });
  page = await b.firstWindow({ timeout: 900000 }); page.setDefaultTimeout(900000);
}
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 900000, polling: 250 });
const tTitle = (Date.now() - T0) / 1000, T1 = Date.now();
await page.evaluate(c => window.__game.startGame(c), CLS);
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000, polling: 250 });
const tWorld = (Date.now() - T1) / 1000;
const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; });
console.log(JSON.stringify({ mode, tTitle, tWorld, gl, errs: errs.slice(0, 5) }));
await b.close();
