// 11-18 A1 画质验收接口自测（画质专长包 v8 §二）：?verify=1 + window.__noLoop 时主循环停住、__dbg.frame(dt) 推一帧、setYaw / setPitch 转镜头。
// 同时按 verify.py 的口径算游戏这一侧的三个数：颗粒（冻结相机连续两帧之差，16×9 格中位数）、亮度直方图 p10 / p50 / p95、
//   并在三个朝向（含正对太阳）各截一张图。Demo 一侧（秋林逆光）本脚本不跑，对比值见差异表。
// node test/verify_api.mjs [html] [标签]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT、EXTRA（额外 query，如 off=shadowfocus）、HOUR（默认 17）、PITCH（默认 0.18）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'verify';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } });
await page.addInitScript(q => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); } catch (e) {} }, QUAL);
const errors = [], cons = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || /patch miss/.test(m.text())) cons.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(900000);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0&verify=1' + (process.env.EXTRA ? '&' + process.env.EXTRA : ''), { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && window.__dbg && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
await page.waitForTimeout(2000);
await page.evaluate(h => { const g = window.__game; g.tutFinish?.(); g.setGameHour?.(h); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); }, +(process.env.HOUR || 17));
await page.waitForTimeout(2000);
const api = await page.evaluate(() => { const d = window.__dbg; return { R: !!d.R, frame: typeof d.frame, setYaw: typeof d.setYaw, setPitch: typeof d.setPitch }; });
// 停主循环：__noLoop 之后 1.5 s 内渲染帧号不该再涨
const stop = await page.evaluate(async () => { const R = window.__dbg.R; window.__noLoop = true; await new Promise(r => setTimeout(r, 300)); const f0 = R.info.render.frame; await new Promise(r => setTimeout(r, 1500)); const f1 = R.info.render.frame; window.__dbg.frame(0); const f2 = R.info.render.frame; return { stoppedFrames: f1 - f0, afterFrame: f2 - f1 }; });
console.log(TAG, 'api', JSON.stringify(api), 'stop', JSON.stringify(stop));
// 三个朝向：太阳方位角来自 __dbg.sun（正对太阳 = 镜头朝向太阳的水平方向）
const sunYaw = await page.evaluate(() => { const s = window.__dbg.sun, p = window.__game.player.pos; const dx = s.position.x - (s.target?.position.x ?? p.x), dz = s.position.z - (s.target?.position.z ?? p.z); return Math.atan2(-dx, -dz); });
const DIRS = [{ n: 'sun', yaw: sunYaw }, { n: 'side', yaw: sunYaw + Math.PI / 2 }, { n: 'back', yaw: sunYaw + Math.PI }];
const rows = [];
for (const D of DIRS) {
  const r = await page.evaluate(async ([yaw, pitch]) => {
    const d = window.__dbg; d.setYaw(yaw); d.setPitch(pitch); for (let i = 0; i < 8; i++) d.frame(0.05);
    const grab = () => { const c = d.R.domElement, w = 160, h = 90, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.drawImage(c, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
    d.frame(0.5); const A = grab(); d.frame(0); const B = grab();
    const L = px => { const o = new Float32Array(px.length / 4); for (let i = 0; i < o.length; i++) o[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255; return o; };
    const la = L(A), lb = L(B), cells = [];
    for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 16; gx++) { let s = 0, n = 0; for (let y = gy * 10; y < gy * 10 + 10; y++) for (let x = gx * 10; x < gx * 10 + 10; x++) { s += Math.abs(la[y * 160 + x] - lb[y * 160 + x]); n++; } cells.push(s / n); }
    cells.sort((a, b) => a - b); const srt = Array.from(la).sort((a, b) => a - b), q = p => +srt[Math.floor(p * (srt.length - 1))].toFixed(3);
    return { grain: +cells[cells.length >> 1].toFixed(4), p10: q(0.1), p50: q(0.5), p95: q(0.95), calls: d.R.info.render.calls, shadowOff: (() => { const t = d.sun.target.position, q = window.__game.player.pos; return +Math.hypot(t.x - q.x, t.z - q.z).toFixed(1); })() };
  }, [D.yaw, +(process.env.PITCH || 0.18)]);
  await page.screenshot({ path: `${OUT}/a1_${TAG}_${D.n}.png` });
  rows.push({ dir: D.n, yaw: +D.yaw.toFixed(2), ...r }); console.log(TAG, D.n, JSON.stringify(r));
}
const sum = { tag: TAG, qual: QUAL, api, stop, rows, errors: errors.slice(0, 5), consoleErrors: cons.slice(0, 5) };
writeFileSync(`${OUT}/a1_${TAG}.json`, JSON.stringify(sum, null, 1));
console.log(TAG, errors.length || cons.length ? 'ERRORS ' + [...errors, ...cons].slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
