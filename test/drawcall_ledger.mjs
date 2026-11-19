// 11-18 A3 逐图 draw call 账本（画质专长包 v8 §三.1 合批目标 < 100；RPG 场景搭建 v0.8 第 10 章）：只测量，不改游戏。
// 每张图：等级拉满 → goMap → 加载画面撤掉后停主循环（?verify=1 + __noLoop），三个朝向各推几帧，
//   记整帧（?perf=1：info 不自动清零，含阴影 / 主场景 / 后期）的 draw call、三角面、着色器程序数、单帧渲染耗时（沙盒估算）。
// node test/drawcall_ledger.mjs [html] [地图 id,逗号分隔] [标签]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
const HTML = process.argv[2] || 'web/index.html';
const IDS = (process.argv[3] || 'camp,field').split(',').map(s => s.trim()).filter(Boolean), TAG = process.argv[4] || 'ledger';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
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
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.setGameHour?.(12); try { g.progression.level = 70; } catch (e) {} });
const rows = [];
for (const id of IDS) {
  const t0 = Date.now();
  const ok = await page.evaluate(id => { window.__noLoop = false; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); const g = window.__game; if (g.currentMap() === id) return true; try { return !!g.goMap(id); } catch (e) { return 'ERR ' + e.message; } }, id);
  if (ok !== true) { rows.push({ id, err: String(ok) }); console.log(TAG, id, 'goMap', ok); continue; }
  try { await page.waitForFunction(id => document.getElementById('loading').style.display !== 'flex' && window.__game.currentMap() === id, id, { timeout: 600000 }); } catch (e) { rows.push({ id, err: 'timeout' }); console.log(TAG, id, 'timeout'); continue; }
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const d = window.__dbg, R = d.R, g = window.__game; g.setGameHour?.(12); window.__noLoop = true; await new Promise(r => setTimeout(r, 200));
    const out = [];
    for (const yaw of [0, 2.09, 4.19]) {
      d.setYaw(yaw); d.setPitch(0.25); for (let i = 0; i < 4; i++) d.frame(0.05);
      const t = performance.now(); d.frame(0); const ms = performance.now() - t;
      out.push({ yaw, calls: R.info.render.calls, tris: R.info.render.triangles, ms: Math.round(ms) });
    }
    return { zone: g.zone, programs: R.info.programs?.length ?? null, geos: R.info.memory.geometries, texs: R.info.memory.textures, dirs: out };
  });
  await page.screenshot({ path: `${OUT}/a3_${TAG}_${id}.jpg`, type: 'jpeg', quality: 70 });
  const row = { id, loadS: Math.round((Date.now() - t0) / 1000), ...r, maxCalls: Math.max(...r.dirs.map(x => x.calls)), maxTris: Math.max(...r.dirs.map(x => x.tris)) };
  rows.push(row); console.log(TAG, JSON.stringify(row));
  writeFileSync(`${OUT}/a3_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, vw: VW, rows, errors: errors.slice(0, 8) }, null, 1));
}
writeFileSync(`${OUT}/a3_${TAG}.json`, JSON.stringify({ tag: TAG, qual: QUAL, vw: VW, rows, errors: errors.slice(0, 8) }, null, 1));
console.log(TAG, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS', 'DONE');
await b.close();
