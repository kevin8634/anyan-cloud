// 11-04 首屏「重放开场」按钮：node test/opreplay_e2e.mjs <html> <期望 shown|hidden> [截图路径]
//   html 同目录有 movie/opening.webm（或 .mp4）→ 按钮在首屏左下出现，点击弹出开场视频层（#cg-movie）；没有 → 按钮一直隐藏
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index.html'), WANT = process.argv[3] || 'hidden', SHOT = process.argv[4];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(600000); await page.goto('file://' + HTML + '?cg=0&op=0', { timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start'), null, { timeout: 600000 });
await page.waitForFunction(() => document.getElementById('op-replay')?.dataset.probed !== undefined, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const st = await page.evaluate(() => { const e = document.getElementById('op-replay'), r = e.getBoundingClientRect(), cg = document.getElementById('cg-replay').getBoundingClientRect();
  return { probed: e.dataset.probed ?? null, shown: getComputedStyle(e).display !== 'none' && r.width > 0, x: r.x, y: r.y, w: r.width, h: r.height, sameRow: Math.abs(r.y - cg.y) < 2, cls: e.className, text: e.textContent }; });
console.log('state', JSON.stringify(st));
const fails = [];
if (WANT === 'shown') {
  if (!st.shown) fails.push('按钮没出现');
  if (st.x > 1280 * 0.4 || st.y < 720 * 0.7) fails.push(`位置不在左下（${st.x},${st.y}）`);
  if (!st.sameRow || st.cls !== 'btn') fails.push('样式 / 行与「重放 CG」不一致');
  if (SHOT) await page.screenshot({ path: SHOT, timeout: 120000 }).catch(() => {});
  await page.click('#op-replay'); await page.waitForTimeout(1500);
  const cg = await page.evaluate(() => { const m = document.getElementById('cg-movie'); return m ? { hold: !!m.querySelector('.cg-hold'), src: m.querySelector('video')?.getAttribute('src') } : null; });
  console.log('click', JSON.stringify(cg));
  if (!cg || !/opening\.(webm|mp4)/.test(cg.src ?? '')) fails.push('点击后没有播放开场视频');
} else {
  if (st.shown) fails.push('没有视频时按钮不该出现');
  if (st.probed !== '0') fails.push(`探测结果应为 0（${st.probed}）`);
  if (SHOT) await page.screenshot({ path: SHOT, timeout: 120000 }).catch(() => {});
}
if (errors.length) fails.push('页面错误 ' + errors.slice(0, 3).join(' | '));
console.log(fails.length ? '❌ ' + fails.join('；') : `✅ 重放开场按钮（${WANT}）通过`); await b.close(); process.exitCode = fails.length ? 1 : 0;
