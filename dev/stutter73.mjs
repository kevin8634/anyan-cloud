// v1.2.73b 卡顿预热验收：node dev/stutter73.mjs [html] [标签]
// 无头 Chromium（swiftshader）开局 → 依次首次进入 原野 / 星陨 / 赤砂 / 霜岭，再放一轮技能；
// 页面内 rAF 量每帧间隔，统计「进入后（加载画面撤掉后）6 秒内」>150ms 的长帧数和最长帧。修复前后各跑一次对比。
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'new';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultNavigationTimeout(180000);
// 两套构建通用：钩 WebGL 统计着色器链接 / 贴图上传次数
await page.addInitScript(() => { window.__gl = { link: 0, tex: 0 }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const l = P.linkProgram; P.linkProgram = function (...a) { window.__gl.link++; return l.apply(this, a); };
  for (const k of ['texImage2D', 'texImage3D', 'compressedTexImage2D', 'texStorage2D']) { const f = P[k]; if (f) P[k] = function (...a) { window.__gl.tex++; return f.apply(this, a); }; } } });
await page.goto('file://' + resolve(HTML));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40;
  window.__fr = []; let last = performance.now(); const f = () => { const n = performance.now(); window.__fr.push([n, n - last]); last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const hide = () => page.evaluate(() => document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }));
const res = [];
async function measure(name, act) {
  await hide();
  const t0 = await page.evaluate(act);
  // 等加载画面撤掉
  await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 120000 });
  // swiftshader 下每帧都 >150ms，长帧数没意义 → 量进入后 6 秒游戏中新编译的着色器程序数 / 新上传贴图数（真机卡几秒的来源）
  const snap = () => page.evaluate(() => { return { p: window.__gl.link, t: window.__gl.tex, z: String(window.__game.zone) }; });
  const a = await snap();
  await page.waitForTimeout(6000);
  const z = await snap();
  const r = { newPrograms: z.p - a.p, newTextures: z.t - a.t, zone: z.z };
  const lw = await page.evaluate(() => performance.now()) ;
  res.push({ name, ...r }); console.log(TAG, name, JSON.stringify(r)); void lw;
}
for (const w of ['star', 'redsand', 'frost', 'ember']) await measure(w, `(() => { window.__game.goMap('${w}'); return performance.now(); })()`);
await measure('技能', () => { const g = window.__game; for (const s of ['s1', 's2', 's3', 's4', 'ultimate']) { try { g.tryCast(s); } catch {} } return performance.now(); });
const dbg = await page.evaluate(() => ({ prewarm: window.__game.prewarm?.() ?? null, stutter: window.__game.stutter?.() ?? null }));
console.log(TAG, 'prewarm', JSON.stringify(dbg.prewarm));
if (dbg.stutter) console.log(TAG, 'stutterLog', JSON.stringify(dbg.stutter.slice(-12)));
console.log(TAG, 'TOTAL 游戏中新编译程序', res.reduce((s, r) => s + r.newPrograms, 0), '新上传贴图', res.reduce((s, r) => s + r.newTextures, 0), errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
