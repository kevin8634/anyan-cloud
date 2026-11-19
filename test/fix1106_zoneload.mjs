// fix1106 ②：切区载入画面换成 N1 古钟徽记 —— 进世界 → goMap 去一张没去过的地图，载入中 / 撤掉过程连拍
//   用法 node test/fix1106_zoneload.mjs [html] [out] [目标地图 id，默认第一张没生成的野外图]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/fix1106/zoneload', TGT = process.argv[4] || ''; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); const s = JSON.parse(localStorage.getItem('darkrock_settings') || '{}'); s.quality = 'low'; localStorage.setItem('darkrock_settings', JSON.stringify(s)); } });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
await page.waitForTimeout(3000);
const st = () => page.evaluate(() => ({ ld: document.getElementById('loading').style.display, host: document.getElementById('loading').classList.contains('al-host'), al: !!document.querySelector('#anyan-loader.al-zone'), out: !!document.querySelector('#anyan-loader.al-out'), stage: document.querySelector('#anyan-loader .al-stagetxt')?.textContent, pct: document.querySelector('#anyan-loader .al-pct')?.textContent, zone: window.__game.zone }));
const tgt = await page.evaluate(t => { const g = window.__game; const ids = t ? [t] : ['star', 'foothill', 'marsh', 'redsand', 'frost', 'ember', 'dlc1_coast']; for (const id of ids) { if (g.wilds?.[id]) continue; try { if (g.goMap(id)) return id; } catch (e) { } } return null; }, TGT);
console.log('target', tgt);
const log = []; let k = 0, seenAl = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(i < 3 ? 700 : 2500); const s = await st(); log.push(JSON.stringify(s)); if (s.al) seenAl = true;
  if (s.al && k < 4 && !s.out) await page.screenshot({ path: `${OUT}/zl_${k++}.png`, timeout: 120000 });
  if (s.ld !== 'flex' && seenAl) { if (s.al) await page.screenshot({ path: `${OUT}/zl_out.png`, timeout: 120000 }); break; }
}
await page.waitForTimeout(4000); const end = await st(); log.push('end ' + JSON.stringify(end));
await page.screenshot({ path: `${OUT}/zl_after.png`, timeout: 120000 });
console.log(log.join('\n')); console.log('PASS=' + (seenAl && !end.al && end.ld !== 'flex'), 'errors=' + JSON.stringify(errors)); await b.close();
