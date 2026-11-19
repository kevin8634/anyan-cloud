// 1106 M 地图整理：现状截图（世界 / 区域 × 2D / 3D × 两种窗口）+ 3D 标签重叠统计
//   node dev/map_audit.mjs <html> <输出目录> [前缀=now] [Q=medium] [视口=1920x1080,1280x720]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/map', PRE = 'now', Q = 'medium', VPS = '1920x1080,1280x720'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const errs = [];
for (const vp of VPS.split(',')) {
  const [w, h] = vp.split('x').map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message)); p.setDefaultTimeout(400000);
  await p.addInitScript(q => { if (!sessionStorage.getItem('ma')) { sessionStorage.setItem('ma', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, map3d: 'on' })); } }, Q);
  await p.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险');
  await p.evaluate(() => window.__game.startGame('warrior')); await p.waitForTimeout(3000);
  await p.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; });
  await p.evaluate(() => window.__game.toggleWorldMap()); await p.waitForTimeout(5000);
  const overlap = () => p.evaluate(() => { const hid = window.__game.wm3dDebug?.().labHidden; const els = [...document.querySelectorAll('#wm3-lab > *')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden');
    const r = els.map(e => e.getBoundingClientRect()).filter(r => r.width > 0); let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], c = r[j]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) n++; }
    const pm = document.getElementById('worldmap').getBoundingClientRect(), cv = document.getElementById('wm-cv').getBoundingClientRect(), c3 = document.getElementById('wm-cv3')?.getBoundingClientRect();
    return { labels: r.length, overlapPairs: n, panel: [pm.width | 0, pm.height | 0], cv2d: [cv.width | 0, cv.height | 0], cv3d: c3 ? [c3.width | 0, c3.height | 0] : null, active: window.__game.wm3dDebug().active, hid }; });
  for (const view of ['zone', 'world']) {
    await p.click(`#worldmap .tab[data-view="${view}"]`); await p.waitForTimeout(5000);
    const btn = () => p.evaluate(() => document.querySelector('#worldmap [data-m3sw]').textContent);
    if ((await btn()) === '3D') { await p.click('#worldmap [data-m3sw]'); await p.waitForTimeout(5000); }
    console.log(vp, view, '3D', JSON.stringify(await overlap()));
    await p.screenshot({ path: `${OUT}/${PRE}_${w}_${view}_3d.png` });
    await p.click('#worldmap [data-m3sw]'); await p.waitForTimeout(2500);
    console.log(vp, view, '2D', JSON.stringify(await overlap()));
    await p.screenshot({ path: `${OUT}/${PRE}_${w}_${view}_2d.png` });
    await p.click('#worldmap [data-m3sw]'); await p.waitForTimeout(3000);
  }
  await p.click('#worldmap .tab[data-view="dungeon"]'); await p.waitForTimeout(6000);
  const rm = await p.evaluate(() => { const e = document.getElementById('raidmap').getBoundingClientRect(); return [e.width | 0, e.height | 0]; });
  console.log(vp, 'dungeon', JSON.stringify({ raidPanel: rm }));
  await p.screenshot({ path: `${OUT}/${PRE}_${w}_dungeon.png` });
  await p.close();
}
console.log('errs', errs.length, JSON.stringify(errs.slice(0, 6)));
await b.close();
