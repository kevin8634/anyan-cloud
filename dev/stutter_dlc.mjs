// v1.2.77 卡顿预热验收（资料片）：node dev/stutter_dlc.mjs [html] [标签] [职业]
// 在 stutter73 基础上：资料片职业、三张沉钟地图、每张图里放一轮技能。
// 无头 Chromium（swiftshader）开局 → 依次首次进入 原野 / 星陨 / 赤砂 / 霜岭，再放一轮技能；
// 页面内 rAF 量每帧间隔，统计「进入后（加载画面撤掉后）6 秒内」>150ms 的长帧数和最长帧。修复前后各跑一次对比。
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index_dlc1.html', TAG = process.argv[3] || 'new', CLS = process.argv[4] || 'dlc1_coffin';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push((e.stack || e.message).slice(0, 700))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); else if (m.text().startsWith('goMap')) console.log(m.text()); });
page.setDefaultNavigationTimeout(180000);
// 两套构建通用：钩 WebGL 统计着色器链接 / 贴图上传次数
await page.addInitScript(() => { window.__gl = { link: 0, tex: 0 }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const src = new WeakMap(); const ss = P.shaderSource; P.shaderSource = function (sh, x) { src.set(sh, x); return ss.call(this, sh, x); }; window.__gl.names = [];
  const l = P.linkProgram; P.linkProgram = function (...a) { window.__gl.link++; try { const fs = (this.getAttachedShaders(a[0]) || []).map(x => src.get(x) || '').join('\n'); const nm = (fs.match(/#define SHADER_NAME (.+)/) || [])[1] || ''; const u = fs.split('\n').filter(x => /^uniform /.test(x)).slice(0, 6).join(';').slice(0, 160); window.__gl.names.push(nm + '|' + u); } catch (e) {} return l.apply(this, a); };
  for (const k of ['texImage2D', 'texImage3D', 'compressedTexImage2D', 'texStorage2D']) { const f = P[k]; if (f) P[k] = function (...a) { window.__gl.tex++; return f.apply(this, a); }; } } });
await page.goto('file://' + resolve(HTML));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(c => window.__game.startGame(c), CLS);
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40;
  window.__fr = []; let last = performance.now(); const f = () => { const n = performance.now(); window.__fr.push([n, n - last]); last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const hide = () => page.evaluate(() => document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }));
const res = [];
async function measure(name, act) {
  await hide();
  const t0 = await page.evaluate(act);
  // 等加载画面撤掉
  await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 60000 }).catch(async e => { console.log(TAG, name, '加载画面未撤', JSON.stringify(await page.evaluate(() => ({ zone: String(window.__game.zone), ld: document.getElementById('loading').innerText.slice(0, 200), pw: window.__game.prewarm?.() ?? null }))), 'ERR', errors.slice(0, 5).join(' | ')); throw e; });
  // swiftshader 下每帧都 >150ms，长帧数没意义 → 量进入后 6 秒游戏中新编译的着色器程序数 / 新上传贴图数（真机卡几秒的来源）
  const snap = () => page.evaluate(() => { return { p: window.__gl.link, t: window.__gl.tex, z: String(window.__game.zone), f: window.__game.prewarm().flushes }; });
  const a = await snap(); const n0 = await page.evaluate(() => window.__game.prewarm(true).names);
  await page.waitForTimeout(6000);
  const z = await snap();
  const r = { newPrograms: z.p - a.p, newTextures: z.t - a.t, zone: z.z, flushes: z.f };
  const lw = await page.evaluate(() => performance.now()) ;
  res.push({ name, ...r }); console.log(TAG, name, JSON.stringify(r)); if (r.newPrograms) { const n1 = await page.evaluate(() => window.__game.prewarm(true).names); const old = new Set(n0); console.log(TAG, '  新程序', JSON.stringify(n1.filter(x => !old.has(x)))); } void lw;
}
const cast = () => { const g = window.__game; for (const s of ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate']) { try { g.tryCast(s); } catch {} } return performance.now(); };
await measure('技能@营地', cast);
for (const w of ['dlc1_coast', 'dlc1_mirror', 'dlc1_belltower', 'star']) { await measure(w, `(() => { const ok = window.__game.goMap('${w}'); console.log('goMap ${w}', ok); return performance.now(); })()`); await measure('技能@' + w, cast); }
const dbg = await page.evaluate(() => ({ prewarm: window.__game.prewarm?.() ?? null, stutter: window.__game.stutter?.() ?? null }));
console.log(TAG, 'prewarm', JSON.stringify(dbg.prewarm));
if (dbg.stutter) console.log(TAG, 'stutterLog', JSON.stringify(dbg.stutter.slice(-12)));
console.log(TAG, 'TOTAL 游戏中新编译程序', res.reduce((s, r) => s + r.newPrograms, 0), '新上传贴图', res.reduce((s, r) => s + r.newTextures, 0), errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
