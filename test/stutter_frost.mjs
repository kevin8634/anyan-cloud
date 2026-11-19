// 11-18 永霜墓穴尾王倒下卡顿：量倒下前后新编译程序数、最长帧、perfMark CPU 事件、存档大小。
// node test/stutter_frost.mjs [html] [标签] [额外 query，如 off=bdwarm]
// 环境变量：QUAL=low|medium|high|ultra（默认 low；沙箱 8 GB 别跑中档以上截图）、VW=视口宽（默认 960，高按 16:9）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'new', Q = process.argv[4] || '';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960);
const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } });
await page.addInitScript(q => { try { const k = 'darkrock_settings', o = JSON.parse(localStorage.getItem(k) || '{}'); o.quality = q; localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }, QUAL);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { window.__gl = { link: 0, names: [] }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const src = new WeakMap(); const ss = P.shaderSource; P.shaderSource = function (sh, s) { src.set(sh, s); return ss.call(this, sh, s); };
  const l = P.linkProgram; P.linkProgram = function (prog) { window.__gl.link++; (window.__gl.at = window.__gl.at || []).push(Math.round(performance.now()));
    try { const shs = this.getAttachedShaders(prog) || []; const fs = shs.map(x => src.get(x) || '').join('\n');
      const nm = (fs.match(/#define SHADER_NAME (\S+)/) || [])[1] || '?'; const defs = fs.split('\n').filter(x => x.startsWith('#define') && !/SHADER_NAME|PI|RECIPROCAL|LOG2|EPSILON|saturate|whiteComplement|GAMMA|precision/.test(x)).slice(0, 12).join(' ; ');
      const vs = src.get(shs.find(x => /gl_Position/.test(src.get(x) || '')) ) || ''; const fsrc = shs.map(x => src.get(x) || '').find(x => /gl_FragColor|pc_fragColor/.test(x) && !/gl_Position/.test(x)) || '';
      const un = (fsrc.match(/uniform\s+\w+\s+\w+/g) || []).filter(u => !/(modelMatrix|viewMatrix|projectionMatrix|cameraPosition|isOrthographic|fog|toneMapping|directional|point|spot|hemi|ambient|lightProbe|shadow|Shadow|normalMatrix|modelView)/.test(u)).slice(0, 10).map(u => u.split(/\s+/).pop()).join(',');
      const mainF = (fsrc.split('void main')[1] || '').replace(/\s+/g, ' ').slice(0, 160);
      window.__gl.names.push(nm + ' | ' + defs.replace(/#define (attribute in|varying out|texture2D texture|HIGH_PRECISION|varying in|gl_FragColor pc_fragColor|gl_FragDepthEXT gl_FragDepth|textureCube texture) ; /g, '') + ' | U: ' + un + ' | F: ' + mainF); } catch (e) {}
    return l.call(this, prog); }; }
  // 帧间隔记录
  window.__fr = []; const raf = () => { window.__fr.push(performance.now()); if (window.__fr.length > 4000) window.__fr.shift(); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  // 存档写入耗时
  const si = Storage.prototype.setItem; window.__save = { n: 0, ms: 0, max: 0, bytes: 0 };
  Storage.prototype.setItem = function (k, v) { const t = performance.now(); const r = si.call(this, k, v); const d = performance.now() - t; const s = window.__save; s.n++; s.ms += d; s.max = Math.max(s.max, d); s.bytes = Math.max(s.bytes, String(v).length); return r; };
});
page.setDefaultTimeout(900000);
const T0 = Date.now(), lg = m => console.log(TAG, Math.round((Date.now() - T0) / 1000) + 's', m);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0' + (Q ? '&' + Q : ''), { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 }); lg('title');
lg('quality ' + await page.evaluate(() => (JSON.parse(localStorage.getItem('darkrock_settings') || '{}').quality) + ' canvas ' + (document.querySelector('canvas')?.width) + 'x' + (document.querySelector('canvas')?.height)));
await page.evaluate(q => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); }, QUAL);

await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 }); lg('world');
await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
const links = () => page.evaluate(() => window.__gl.link);
const loaded = () => page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 300000 });
await page.evaluate(() => window.__game.enterRaid('frost_crypt', 4)); await page.waitForTimeout(500); await loaded(); lg('raid');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const g = window.__game; let B = g.raidBossDev(); if (!B || B.room !== 4) B = g.raidBossDev(4); const c = B.center; g.player.pos.set(c.x, 0, c.z + 3); g.player.maxHp = g.player.hp = 1e9; return { name: B.def.name, id: B.def.id, room: B.room }; });
console.log(TAG, 'boss', JSON.stringify(info));
await page.waitForFunction(() => window.__game.raidBossDev()?.engaged, null, { timeout: 120000 });
await page.waitForTimeout(3000);
// 尾王「永冬之王」30% 以下进永夜（setDarkness(true)）——实战里倒下时一定处在黑暗阶段
await page.evaluate(() => { const B = window.__game.raidBossDev(); B.unit.hp = B.unit.maxHp * 0.25; });
await page.waitForTimeout(3000);
console.log(TAG, '永夜', JSON.stringify(await page.evaluate(() => { const g = window.__game, B = g.raidBossDev(); return { phase: B.phase, hp: +(B.unit.hp / B.unit.maxHp).toFixed(2), fogFar: g.scene?.fog?.far ?? null }; })));
const L1 = await links();
const K1 = await page.evaluate(() => (window.__game.prewarm(true).names || []).map(n => n.split('#').slice(2).join('#')));
const cdp = process.env.PROF ? await page.context().newCDPSession(page) : null;
if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
await page.evaluate(() => { window.__profStart = performance.now(); window.__save.n = 0; window.__save.ms = 0; window.__save.max = 0; window.__t0 = performance.now(); const B = window.__game.raidBossDev(); for (const u of B.units) { u.hp = 0; } });
await page.waitForTimeout(+(process.env.POSTWAIT || 8000));
const L2 = await links();
if (cdp) { const { profile } = await cdp.send('Profiler.stop'); const t0 = await page.evaluate(() => window.__t0);
  // 只看最长那一帧（倒下后）里的样本：按函数自耗时 / 总耗时排名
  const fr = await page.evaluate(() => window.__fr.filter(t => t >= window.__t0 - 50)); let a = t0, b = t0; for (let i = 1; i < fr.length; i++) if (fr[i] - fr[i - 1] > b - a) { a = fr[i - 1]; b = fr[i]; }
  const byId = new Map(profile.nodes.map(n => [n.id, n])), par = new Map(); for (const n of profile.nodes) for (const c of n.children || []) par.set(c, n.id);
  const T0 = profile.startTime; let t = T0; const self = new Map(), tot = new Map(); const nowOff = await page.evaluate(() => performance.timeOrigin); // µs 时间轴与 performance.now 不同源：按 timeDeltas 推算并以采样起点对齐 t0 之前
  const startPerf = (profile.startTime / 1000) - (nowOff % 1e9) ; void startPerf;
  const samples = profile.samples, dts = profile.timeDeltas; const ts = []; for (let i = 0; i < samples.length; i++) { t += dts[i]; ts.push(t); }
  // 采样时间轴（µs，单调钟）换算到 performance.now：用 Profiler.start 前一刻的 performance.now 近似对齐
  const pStart = await page.evaluate(() => window.__profStart ?? null);
  const off = (pStart ?? (t0 - 5)) - T0 / 1000;
  for (let i = 0; i < samples.length; i++) { const ms = ts[i] / 1000 + off; if (ms < a || ms > b) continue; const n = byId.get(samples[i]); const k = n.callFrame.functionName || '(anon)'; const key = k + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + n.callFrame.lineNumber; self.set(key, (self.get(key) || 0) + 1);
    const seen = new Set(); let id = samples[i]; while (id) { const m = byId.get(id); const kk = (m.callFrame.functionName || '(anon)') + ' :' + m.callFrame.lineNumber + ':' + m.callFrame.columnNumber; if (!seen.has(kk)) { seen.add(kk); tot.set(kk, (tot.get(kk) || 0) + 1); } id = par.get(id); } }
  { const busy = (lo, hi) => { let n = 0, g = 0; for (let i = 0; i < samples.length; i++) { const ms = ts[i] / 1000 + off - t0; if (ms < lo || ms >= hi) continue; const f = byId.get(samples[i]).callFrame.functionName; if (f === '(idle)') continue; n += dts[i] / 1000; if (f === '(garbage collector)') g += dts[i] / 1000; } return Math.round(n); };
    const tot3 = new Map(); for (let i = 0; i < samples.length; i++) { const ms = ts[i] / 1000 + off - t0; if (ms < 0 || ms >= 3000 || byId.get(samples[i]).callFrame.functionName === '(idle)') continue; const seen = new Set(); let id = samples[i]; while (id) { const m = byId.get(id); const kk = (m.callFrame.functionName || '(anon)') + ':' + m.callFrame.lineNumber; if (!seen.has(kk)) { seen.add(kk); tot3.set(kk, (tot3.get(kk) || 0) + dts[i] / 1000); } id = par.get(id); } }
    console.log(TAG, 'BUSY 主线程 JS 忙碌 ms（不含 idle）：倒下前 1s', busy(-1000, 0), '倒下后 0-0.5s', busy(0, 500), '0-3s', busy(0, 3000), '3-8s', busy(3000, 8000));
    console.log(TAG, 'BUSY 0-3s 调用栈累计 ms', JSON.stringify([...tot3].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([k, v]) => [k, Math.round(v)]))); }
  console.log(TAG, 'PROF 最长帧', Math.round(a - t0), '→', Math.round(b - t0), 'ms（相对倒下）');
  console.log(TAG, 'PROF self', JSON.stringify([...self].sort((x, y) => y[1] - x[1]).slice(0, 25)));
  console.log(TAG, 'PROF total', JSON.stringify([...tot].sort((x, y) => y[1] - x[1]).slice(0, 45))); }
console.log(TAG, 'LINK 时刻（相对倒下 ms）', JSON.stringify(await page.evaluate(() => (window.__gl.at || []).filter(t => t >= window.__t0 - 100).map(t => Math.round(t - window.__t0)))));
console.log(TAG, 'FRAMES 时刻（相对倒下 ms）', JSON.stringify(await page.evaluate(() => window.__fr.filter(t => t >= window.__t0 - 1000).map(t => Math.round(t - window.__t0)))));
const r = await page.evaluate(() => { const all = window.__fr, pre = all.filter(t => t < window.__t0 && t >= window.__t0 - 20000); const pg = []; for (let i = 1; i < pre.length; i++) pg.push(pre[i] - pre[i - 1]); pg.sort((a, b) => a - b);
  const preMed = pg.length ? Math.round(pg[pg.length >> 1]) : null, last = pre[pre.length - 1], post = all.filter(t => t > window.__t0); const killGap = post.length && last ? Math.round(post[0] - last) : null;
  window.__kill = { preMed, preN: pg.length, killGap, excess: killGap != null && preMed != null ? killGap - preMed : null };
  const fr = window.__fr.filter(t => t >= window.__t0 - 50); const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(Math.round(fr[i] - fr[i - 1]));
  const d = window.__game.prewarm(); return { gaps: gaps.slice(0, 40), max: Math.max(...gaps), sorted: [...gaps].sort((a, b) => b - a).slice(0, 5), ev: d.events.slice(-20), save: window.__save, stut: window.__game.stutter?.().slice(-3), kill: window.__kill }; });
console.log(TAG, '尾王倒下 新编译', L2 - L1);
console.log(TAG, 'KILL', JSON.stringify(r.kill), 'bossDownCPU', (r.ev.find(e => /bossDown/.test(e)) || '').replace(/^.*?(\d+)ms.*$/, '$1') + 'ms', 'save', JSON.stringify({ n: r.save.n, ms: +r.save.ms.toFixed(1) }));
console.log(TAG, 'names', JSON.stringify(await page.evaluate(n => window.__gl.names.slice(n), L1), null, 1));
const K2 = await page.evaluate(() => (window.__game.prewarm(true).names || []).map(n => n.split('#').slice(2).join('#')));
{ const old = new Set(K1); for (const k of K2.filter(k => !old.has(k))) { const a = k.split(','); const sib = K1.map(o => o.split(',')).filter(o => o[0] === a[0] && o[1] === a[1]);
  if (!sib.length) { console.log(TAG, 'NEWKEY 无同源旧程序', a.slice(0, 3).join(','), 'len', a.length); continue; }
  const best = sib.map(o => ({ o, d: a.map((v, i) => v !== o[i] ? i : -1).filter(i => i >= 0) })).sort((x, y) => x.d.length - y.d.length)[0];
  console.log(TAG, 'NEWKEY', a.slice(0, 2).join(','), 'siblings', sib.length, 'diff', JSON.stringify(best.d.map(i => [i, best.o[i], a[i]]))); } }
console.log(TAG, 'frames', JSON.stringify(r));
console.log(TAG, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
