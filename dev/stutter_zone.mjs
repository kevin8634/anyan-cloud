// v1.2.79 卡顿验收（通用区域件）：开局后首次放各元素地面区域 + 爆开冲击，量新链接的着色器程序数（应为 0）。node dev/stutter_zone.mjs [html]
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const HTML = process.argv[2] || 'web/index.html';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultNavigationTimeout(180000);
await page.addInitScript(() => { window.__gl = { link: 0, log: [] }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const l = P.linkProgram; const ss = P.shaderSource; P.shaderSource = function (sh, src) { this.__last = src; return ss.call(this, sh, src); }; P.linkProgram = function (...a) { window.__gl.link++; const src = this.__last || ''; const nm = (src.match(/SHADER_NAME (\S+)/) || [])[1] || '?'; const def = (src.match(/#define (USE_\w+|MAP\w*|\w*ENCOD\w*|FOG\w*)/g) || []).join(','); const body = src.slice(src.lastIndexOf('main()'), src.lastIndexOf('main()') + 90).replace(/\s+/g, ' '); window.__gl.log.push(nm + ' | ' + def + ' | ' + body); return l.apply(this, a); }; } });
await page.goto('file://' + resolve(HTML));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('mage')); await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
await page.waitForTimeout(4000);
await page.waitForFunction(() => { const d = window.__game.prewarm?.(); return !d || ((d.stat || d).queue === 0); }, null, { timeout: 600000 }).catch(() => console.log('queue 未清空'));   // 后台懒预热队列会链接程序，先等它清空，免得算到区域头上
const links = () => page.evaluate(() => window.__gl.link);
let bad = 0;
for (const el of (process.env.ELS || 'fire,physical,nature,shadow,arcane,lightning,holy').split(',')) {
  const a = await links();
  await page.evaluate(el => { const g = window.__game, p = g.player.pos; g.fxTest.zone({ x: p.x + 3, z: p.z }, 3, el, 6); g.fxTest.ring({ x: p.x - 3, z: p.z }, 3, '#ffffff', 1); }, el);
  await page.waitForTimeout(5000); const z = await links(); console.log(el, '新编译', z - a, JSON.stringify(await page.evaluate(() => { const d = window.__game.prewarm?.(); const L = {}; window.__game.fxScene?.traverseVisible(o => { if (o.isLight) { const k = o.type + (o.castShadow ? '*' : ''); L[k] = (L[k] || 0) + 1; } }); return L; }))); if (z - a) console.log((await page.evaluate(() => window.__gl.log.slice(-8))).join('\n')); bad += z - a;
}
console.log('TOTAL', bad, errors.length ? 'ERRORS ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
