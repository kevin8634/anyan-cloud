// 11-18 A5 火焰高光保色对比：营地篝火 / 营地火把近景截图，并记火苗在屏幕上的包围框（给 python 算火苗区域 p95 亮度与最亮 5% 像素饱和度）。
// node test/flamedev_shots.mjs [html] [标签] [额外 query，如 off=flamedev]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'new', Q = process.argv[4] || '';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } });
await page.addInitScript(q => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); } catch (e) {} }, QUAL);
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0' + (Q ? '&' + Q : ''), { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.setGameHour?.(21); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
// 营地主篝火（世界原点附近名为 fire 的组）与营地南口火把（-3,-29）
const SHOTS = [{ n: 'campfire', name: 'fire', near: [0, 4], yaw: 0.4, pitch: 0.3, dist: 4 }, { n: 'torch', name: 'flame', near: [-3, -29], yaw: 0.6, pitch: 0.15, dist: 2.2 }];
const rows = [];
for (const s of SHOTS) {
  const box = await page.evaluate(async s => {
    const D = window.__dbg, g = window.__game, THREE_V = D.camera.position.constructor;
    let best = null, bd = 1e9; D.scene.traverse(o => { if (o.name !== s.name) return; const p = o.getWorldPosition(new THREE_V()); const d = Math.hypot(p.x - s.near[0], p.z - s.near[1]); if (d < bd) { bd = d; best = o; } });
    if (!best) return null;
    const p = best.getWorldPosition(new THREE_V()); g.player.pos.set(p.x, 0, p.z); g.player.rig.root.visible = false; D.cam(s.yaw, s.pitch, s.dist);   // 镜头对准火苗，主角藏起来不挡
    await new Promise(r => setTimeout(r, 2500));
    const bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }, v = new THREE_V(), W = D.renderer.domElement.clientWidth, H = D.renderer.domElement.clientHeight;
    best.traverse(o => { const pos = o.geometry?.attributes?.position; if (!pos) return; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(D.camera); const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y); } });
    return { ...bb, dist: +bd.toFixed(1), q: D.pipeline.quality };
  }, s);
  await page.screenshot({ path: `${OUT}/a5_${TAG}_${s.n}.png` });
  rows.push({ shot: s.n, box }); console.log(TAG, s.n, JSON.stringify(box));
}
writeFileSync(`${OUT}/a5_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, query: Q, rows, errors: errors.slice(0, 5) }, null, 1));
console.log(TAG, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
