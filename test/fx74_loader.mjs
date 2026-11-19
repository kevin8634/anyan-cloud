// v1.2.74 N1 载入画面截图：加载中若干帧 + 结束后进入开场；用法 node test/fx74_loader.mjs [html] [out] [宽x高]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/tmp/fx74_loader';
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultNavigationTimeout(240000);
page.goto('file://' + HTML).catch(e => errors.push('goto ' + e.message));
const t0 = Date.now(); let i = 0, gone = false, log = [];
while (Date.now() - t0 < 240000) {
  await page.waitForTimeout(i < 2 ? 1500 : 4000);
  const st = await page.evaluate(() => ({ dbg: window.__loadDbg ? window.__loadDbg() : null, el: !!document.getElementById('anyan-loader'), stage: document.querySelector('#anyan-loader .al-stage')?.textContent, pct: document.querySelector('#anyan-loader .al-pct')?.textContent })).catch(e => ({ err: e.message }));
  log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + JSON.stringify({ el: st.el, stage: st.stage, pct: st.pct, real: st.dbg?.real, fin: st.dbg?.finished }));
  if (st.el && i < 8) await page.screenshot({ path: `${OUT}/ld_${W}x${H}_${i}.png`, timeout: 60000 }).catch(e => log.push('shot fail ' + i));
  if (!st.el && st.dbg) { gone = true; break; }
  i++;
}
await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/ld_${W}x${H}_after.png`, timeout: 90000 }).catch(e => log.push('after shot fail'));
console.log(log.join('\n')); console.log('gone=' + gone, 'errors=' + JSON.stringify(errors));
await b.close();
