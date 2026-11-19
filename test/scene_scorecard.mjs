// 11-18 A4 场景评分卡（RPG 场景搭建 v0.8 第 11 章「自查与评审」，改写成读游戏 __dbg 的版本；算法照包内 demo/review.js 自写版改写）。
// 游戏地图不是包内生成器做的，第 2–9 章（骨架图 / 引导 / 节奏 / 散布…）的自检对不上，本脚本只跑两层：
//   ① 第 10 章性能：每机位整帧 draw call / 三角形对照包内预算（低 120 / 250k，中 250 / 500k）；
//   ② 第 11 章画面体检：缩到 240×135 后算 死黑 / 爆白 / 明暗跨度 / 饱和度 / 主体对比 / 噪点 6 项（阈值同 review.js IMG）。
// 每张图 3 个朝向；得分 = 通过项 ÷ 总项。只测量，不改游戏。人工盲评（11.3 第 5 条）另做。
// node test/scene_scorecard.mjs [html] [地图 id,逗号分隔] [标签]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
const HTML = process.argv[2] || 'web/index.html';
const IDS = (process.argv[3] || 'camp,field,darkrock_mine').split(',').map(s => s.trim()).filter(Boolean), TAG = process.argv[4] || 'card';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
const BUDGET = { low: { calls: 120, tris: 250e3 }, medium: { calls: 250, tris: 500e3 }, high: { calls: 250, tris: 500e3 }, ultra: { calls: 500, tris: 1.2e6 } }[QUAL] ?? { calls: 250, tris: 500e3 };
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } });
await page.addInitScript(q => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); } catch (e) {} }, QUAL);
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0&verify=1&perf=1', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && window.__dbg && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); try { g.progression.level = 70; } catch (e) {} });
// 第 11 章 11.2 阈值（review.js IMG）
const IMG = { w: 240, h: 135, black: 0.03, blackMax: 0.10, white: 0.97, whiteMax: 0.02, spanMin: 0.45, satLo: 0.06, satHi: 0.50, focusMin: 0.8, noiseMax: 0.045 };
const maps = [];
for (const id of IDS) {
  const ok = await page.evaluate(id => { window.__noLoop = false; const g = window.__game; if (g.currentMap() === id) return true; try { return !!g.goMap(id); } catch (e) { return 'ERR ' + e.message; } }, id);
  if (ok !== true) { maps.push({ id, err: String(ok) }); console.log(TAG, id, 'goMap', ok); continue; }
  try { await page.waitForFunction(id => document.getElementById('loading').style.display !== 'flex' && window.__game.currentMap() === id, id, { timeout: 600000 }); } catch (e) { maps.push({ id, err: 'timeout' }); console.log(TAG, id, 'timeout'); continue; }
  await page.waitForTimeout(2500);
  const shots = [];
  for (const [k, yaw] of [[1, 0], [2, 2.09], [3, 4.19]]) {
    const r = await page.evaluate(async ([yaw, I]) => {
      const d = window.__dbg, R = d.R, g = window.__game; g.setGameHour?.(12); window.__noLoop = true;
      document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; });
      d.setYaw(yaw); d.setPitch(0.25); for (let i = 0; i < 4; i++) d.frame(0.05); d.frame(0);
      const calls = R.info.render.calls, tris = R.info.render.triangles;
      const c = document.createElement('canvas'); c.width = I.w; c.height = I.h; const x = c.getContext('2d'); x.drawImage(R.domElement, 0, 0, I.w, I.h); const px = x.getImageData(0, 0, I.w, I.h).data;
      const w = I.w, h = I.h, n = w * h, L = new Float32Array(n); let S = 0, blk = 0, wht = 0;
      for (let i = 0; i < n; i++) { const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, bb = px[i * 4 + 2] / 255, l = 0.2126 * r + 0.7152 * gg + 0.0722 * bb; L[i] = l; if (l < I.black) blk++; if (l > I.white) wht++; const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); S += mx > 0.02 ? (mx - mn) / mx : 0; }
      const srt = Array.from(L).sort((a, b) => a - b);
      const std = (x0, y0, x1, y1) => { let s = 0, s2 = 0, cc = 0; for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) { const v = L[y * w + xx]; s += v; s2 += v * v; cc++; } const m = s / cc; return Math.sqrt(Math.max(0, s2 / cc - m * m)); };
      const all = std(0, 0, w, h), bw = Math.floor(w / 3), bh = Math.floor(h / 3); let mid = 0, at = '';
      for (const [cx, cy, nm] of [[0.5, 0.5, '中'], [1 / 3, 1 / 3, '左上'], [2 / 3, 1 / 3, '右上'], [1 / 3, 2 / 3, '左下'], [2 / 3, 2 / 3, '右下']]) { const x0 = Math.round(cx * w - bw / 2), y0 = Math.round(cy * h - bh / 2), v = std(x0, y0, x0 + bw, y0 + bh); if (v > mid) { mid = v; at = nm; } }
      let nz = 0, nc = 0; for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) { let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += L[(y + dy) * w + xx + dx]; nz += Math.abs(L[y * w + xx] - a / 9); nc++; }
      return { calls, tris, m: { black: blk / n, white: wht / n, span: srt[Math.floor(n * 0.98)] - srt[Math.floor(n * 0.02)], sat: S / n, focus: all > 1e-4 ? mid / all : 1, focusAt: at, noise: nz / nc } };
    }, [yaw, IMG]);
    const m = r.m, pc = v => (v * 100).toFixed(1) + '%';
    const checks = [
      ['死黑', m.black <= IMG.blackMax, pc(m.black)], ['爆白', m.white <= IMG.whiteMax, pc(m.white)], ['明暗跨度', m.span >= IMG.spanMin, m.span.toFixed(2)],
      ['饱和度', m.sat >= IMG.satLo && m.sat <= IMG.satHi, m.sat.toFixed(2)], ['主体对比', m.focus >= IMG.focusMin, m.focus.toFixed(2) + '@' + m.focusAt], ['噪点', m.noise <= IMG.noiseMax, m.noise.toFixed(3)],
    ].map(([name, pass, v]) => ({ name, pass: !!pass, v }));
    const perfOk = r.calls <= BUDGET.calls && r.tris <= BUDGET.tris;
    await page.screenshot({ path: `${OUT}/a4_${TAG}_${id}_${k}.jpg`, type: 'jpeg', quality: 70 });
    shots.push({ k, yaw, calls: r.calls, tris: r.tris, perfOk, checks });
    console.log(TAG, id, k, 'calls', r.calls, 'tris', r.tris, checks.map(c => `${c.name}${c.pass ? '✓' : '✗'}${c.v}`).join(' '));
  }
  const nI = shots.length * 6, okI = shots.reduce((s, x) => s + x.checks.filter(c => c.pass).length, 0), okP = shots.filter(x => x.perfOk).length;
  maps.push({ id, shots, image: `${okI}/${nI}`, perf: `${okP}/${shots.length}`, score: Math.round((okI + okP) / (nI + shots.length) * 100) });
  writeFileSync(`${OUT}/a4_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, budget: BUDGET, maps, errors: errors.slice(0, 8) }, null, 1));
}
writeFileSync(`${OUT}/a4_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, budget: BUDGET, maps, errors: errors.slice(0, 8) }, null, 1));
for (const m of maps) console.log(TAG, 'CARD', m.id, m.err ?? `画面体检 ${m.image}  性能 ${m.perf}  得分 ${m.score}`);
console.log(TAG, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS', 'DONE');
await b.close();
