// 11-07 钟井 v2 性能探针：进潮渊钟井，在路线 7 个点各停 6 秒，记 绘制次数 / 三角面 / JS 堆 / 帧耗时（SwiftShader，帧耗时只作相对比较）
// node test/well2_perf.mjs [html] [quality]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { writeFileSync, mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), Q = process.argv[3] || 'high';
mkdirSync('/workspace/work/shots/well2_perf', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript((q) => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
page.setDefaultTimeout(600000); await page.goto('file://' + HTML, { timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; });
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(1500);
const t0 = Date.now();
await page.evaluate(() => window.__game.packDungeon.enter('dlc1_well_dg', 'normal'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 });
const loadMs = Date.now() - t0; await page.waitForTimeout(3000);
const O = { x: 2700, z: -2700 };
const pts = [['start', 0, 124], ['b1 码头', 0, 92], ['西崖栈道', -98, 90], ['b2 礼拜堂', -90, 6], ['b3 冰湖', -26, -102], ['断桥', -44, -30], ['b4 黑水', 92, 66], ['b5 井底', 30, -16]];
const out = { quality: Q, loadMs, pts: [] };
for (const [name, x, z] of pts) {
  await page.evaluate(([x, z]) => { const g = window.__game; (g.enemies ?? []).forEach(e => { if (e.alive && !e.pboss) { e.hp = 0; e.alive = false; } }); g.player.hp = g.player.maxHp; g.player.pos.x = x; g.player.pos.z = z; }, [O.x + x, O.z + z]);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(), n = 0; const f = () => { const t = performance.now(); ts.push(t - last); last = t; if (++n < 40) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); const p = window.__game.perf(); res({ calls: p.calls, tris: p.tris, med: +ts[20].toFixed(1), p95: +ts[37].toFixed(1), heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), y: +window.__game.player.pos.y.toFixed(1) }); } }; requestAnimationFrame(f); }));
  out.pts.push({ name, ...r }); console.log(name, JSON.stringify(r));
  await page.screenshot({ path: `/workspace/work/shots/well2_perf/${Q}_${name.split(' ')[0]}.jpg`, quality: 70 });
}
out.errors = errors.slice(0, 5);
writeFileSync(`/workspace/work/shots/well2_perf/${Q}.json`, JSON.stringify(out, null, 1));
console.log('load', loadMs, errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
