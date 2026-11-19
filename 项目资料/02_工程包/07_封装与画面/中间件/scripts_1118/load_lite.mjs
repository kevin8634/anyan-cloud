// 11-18 轻量读条冒烟（打包前）：640×360、低画质存档、拦 movie、省内存参数；记录读条到 100% 耗时、进游戏耗时、registerMapLook 登记数、峰值内存
// 用法：ENTRY=base|dlc node load_lite.mjs   （base = web/index.html 本体；dlc = web/desktop/index.html 桌面 DLC 版）
import { chromium } from '/workspace/work/p73/node_modules/playwright-core/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
import { DRFS } from './_srv.mjs';
const E = process.env.ENTRY || 'base', WEB = '/workspace/work/pack1118/web', DESK = WEB + '/desktop';
const ENTRY_FILE = E === 'dlc' ? DESK + '/index.html' : WEB + '/index.html';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (u.startsWith('/movie/')) { r.writeHead(404); r.end(); return; }
  let f = u === '/index.html' ? ENTRY_FILE : path.join(DESK, u); if (!fs.existsSync(f)) f = path.join(WEB, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8773);
// 峰值内存：每 2 s 统计 chrome 全部进程 RSS 合计与 GPU 进程 / renderer 单项
let peak = { total: 0, gpu: 0, renderer: 0, sys_used: 0 };
const samp = setInterval(() => { try { const o = execSync("ps -eo rss,args --no-headers | grep -E 'chrom(e|ium)' | grep -v grep", { encoding: 'utf8' }); let t = 0, g = 0, rd = 0;
  for (const l of o.trim().split('\n')) { const kb = parseInt(l); if (!kb) continue; t += kb; if (/type=gpu-process/.test(l)) g = Math.max(g, kb); if (/type=renderer/.test(l)) rd = Math.max(rd, kb); }
  const used = parseInt(execSync("free -m | awk '/Mem:/{print $3}'", { encoding: 'utf8' }));
  peak = { total: Math.max(peak.total, t), gpu: Math.max(peak.gpu, g), renderer: Math.max(peak.renderer, rd), sys_used: Math.max(peak.sys_used, used) }; } catch { /* 进程还没起来 */ } }, 2000);
const MB = k => (k / 1024).toFixed(0) + ' MB';
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(1);
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
  '--js-flags=--max-old-space-size=2048', '--disable-gpu-compositing', '--renderer-process-limit=1', '--disable-extensions', '--disable-background-networking',
  '--num-raster-threads=1', '--force-gpu-mem-available-mb=512', '--disable-features=Translate,MediaRouter,OptimizationHints', '--mute-audio'];
const meta = { id: 'dk', name: '测试', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
const SAVE = { version: 10, savedAt: 1, classId: 'warrior', name: '测试', level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, inventory: { gold: 10, bag: [], equipped: {} } };
const b = await chromium.launch({ args: ARGS }); const page = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 300)));
page.on('console', m => { const t = m.text(); if (/Shader Error|WebGLProgram|patch miss|注册太晚|加载失败/i.test(t)) errs.push(t.slice(0, 300)); });
page.on('crash', () => { console.log('PAGE CRASH at', T(), 's'); });
await page.route('**/movie/**', r => r.abort());
await page.addInitScript(DRFS);
// registerMapLook 登记表不挂 window：页面脚本运行前包一层 Array.prototype.push，抓 {prefix, look, outdoor, moonLit} 形状的登记项，load 后还原
await page.addInitScript(() => { const P = Array.prototype.push; window.__mapLooks = []; Array.prototype.push = function (...a) { for (const x of a) if (x && typeof x === 'object' && typeof x.prefix === 'string' && x.look && 'moonLit' in x) window.__mapLooks.push.call(window.__mapLooks, { prefix: x.prefix, outdoor: x.outdoor, moonLit: x.moonLit }); return P.apply(this, a); };
  window.__mapLooks.push = (...a) => P.apply(window.__mapLooks, a); addEventListener('load', () => { Array.prototype.push = P; }); });
await page.addInitScript(([m, s]) => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' }));
  localStorage.setItem('darkrock_roster', JSON.stringify({ v: 1, slots: [m, null, null, null, null, null, null, null], last: 'dk', legacyMigrated: true })); localStorage.setItem('darkrock_char_dk', JSON.stringify(s)); } }, [meta, SAVE]);
let out = { entry: E, file: ENTRY_FILE };
try {
  await page.goto('http://127.0.0.1:8773/index.html?cg=0&op=0&intro=0', { waitUntil: 'domcontentloaded', timeout: 180000 });
  out.dom_s = T();
  // 标题读条：.al-pct 走到 100%（每 5 s 打一次进度，卡住 90 s 不动算卡死）
  let last = '', lastChange = Date.now();
  for (;;) { const s = await page.evaluate(() => ({ pct: document.querySelector('.al-pct')?.textContent ?? null, stage: document.querySelector('.al-stagetxt')?.textContent ?? null, start: document.getElementById('start')?.textContent ?? null, game: !!window.__game }));
    if (s.pct !== last) { console.log(T(), 's', JSON.stringify(s)); last = s.pct; lastChange = Date.now(); }
    if (s.pct === '100%' && !out.pct100_s) out.pct100_s = T();
    if (s.game && s.start === '开始冒险') { out.title_s = T(); if (!out.pct100_s) out.pct100_s = out.title_s + '（读条条已收起）'; break; }
    if (Date.now() - lastChange > 90000) { out.stuck = s; throw new Error('读条卡在 ' + s.pct + ' / ' + s.stage); }
    if (Date.now() - t0 > 400000) throw new Error('标题读条超时 400 s'); await page.waitForTimeout(1000); }
  out.mapLooks = await page.evaluate(() => window.__mapLooks);
  console.log('title', out.title_s, 's  mapLooks', JSON.stringify(out.mapLooks));
  await page.evaluate(() => { const g = window.__game; g.selSlot = 0; g.renderTitle?.(); document.getElementById('start').click(); });
  await page.waitForFunction(() => window.__game.curChar && document.getElementById('loading')?.style.display !== 'flex', null, { timeout: 300000, polling: 2000 });
  out.ingame_s = T(); await page.waitForTimeout(5000);
  out.state = await page.evaluate(() => ({ map: window.__game.curMap?.id ?? window.__game.mapId ?? null, char: window.__game.curChar?.name ?? !!window.__game.curChar }));
  await page.screenshot({ path: `/workspace/work/cineA/load_lite_${E}.png` });
} catch (e) { out.error = String(e.message || e).slice(0, 400); }
clearInterval(samp);
out.peak = { chrome_total: MB(peak.total), gpu_proc: MB(peak.gpu), renderer: MB(peak.renderer), sys_used: peak.sys_used + ' MB' };
out.errs = errs; console.log('RESULT ' + JSON.stringify(out));
await b.close().catch(() => {}); srv.close(); process.exit(out.error ? 2 : 0);
