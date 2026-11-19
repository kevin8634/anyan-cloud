// v1.2.77 卡顿验收（副本）：node dev/stutter_raid.mjs [html] [标签]
// 熔心王座：进副本（加载画面预热）→ 场景里突然多一盏点光（模拟符文灯 / 首领带灯模型 / 掉落光）→ 首领倒下。
// 量每一步之后游戏中新链接的着色器程序数（真机卡几秒的来源）。
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'new';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultNavigationTimeout(180000);
await page.addInitScript(() => { window.__gl = { link: 0 }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const l = P.linkProgram; P.linkProgram = function (...a) { window.__gl.link++; return l.apply(this, a); }; } });
await page.goto('file://' + resolve(HTML));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
const links = () => page.evaluate(() => window.__gl.link);
const loaded = () => page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 300000 });
async function step(name, fn, wait = 4000) { const a = await links(); await page.evaluate(fn); await page.waitForTimeout(500); await loaded(); const m = await links(); await page.waitForTimeout(wait); const z = await links(); console.log(TAG, name, JSON.stringify({ inLoad: m - a, afterLoad: z - m })); return z - m; }
let bad = 0;
await step('进副本', () => { window.__game.enterRaid('molten_throne', 0); });
bad += await step('多一盏点光', () => { const g = window.__game, pl = g.scene.getObjectByProperty('isPointLight', true); const n = pl.clone(); n.userData = {}; n.userData.lightPad = false; g.scene.add(n); window.__extra = n; });
bad += await step('灯熄灭', () => { window.__game.scene.remove(window.__extra); });
bad += await step('再多三盏', () => { const g = window.__game, pl = g.scene.getObjectByProperty('isPointLight', true); for (let i = 0; i < 3; i++) { const n = pl.clone(); n.userData = {}; g.scene.add(n); } });
const dbg = await page.evaluate(() => window.__game.prewarm?.() ?? null);
console.log(TAG, 'prewarm', JSON.stringify(dbg));
console.log(TAG, 'TOTAL 加载画面之外新编译', bad, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
