// 11-18 B1 副本灯池量化：永霜墓穴固定机位，记点光数（场景里可见的真灯 / 占位灯；两者之和 = 着色器里逐像素循环的点光数）、着色器链接数、
//   单帧渲染耗时（pipeline.render + 1 像素回读同步，取中位数）、rAF 帧间隔中位数，并截图。帧耗时一律「沙盒估算」（SwiftShader 软件渲染）。
// node test/dunglight_frost.mjs [html] [标签] [额外 query，如 off=dunglightpool]   环境变量：QUAL（默认 low）、VW（默认 960）、OUT（截图目录）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
const HTML = process.argv[2] || 'web/index.html', TAG = process.argv[3] || 'new', Q = process.argv[4] || '';
const QUAL = process.env.QUAL || 'low', VW = +(process.env.VW || 960), OUT = process.env.OUT || '/workspace/work/shots/pack1118';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: VW, height: Math.round(VW * 9 / 16) } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(q => { try { const k = 'darkrock_settings', o = JSON.parse(localStorage.getItem(k) || '{}'); o.quality = q; localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }, QUAL);
await page.addInitScript(() => { window.__gl = { link: 0, npl: 0 }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype;
  const ss = P.shaderSource; P.shaderSource = function (sh, s) { const m = /#define NUM_POINT_LIGHTS (\d+)/.exec(s); if (m) window.__gl.npl = Math.max(window.__gl.npl, +m[1]); return ss.call(this, sh, s); };
  const l = P.linkProgram; P.linkProgram = function (prog) { window.__gl.link++; return l.call(this, prog); }; }
  window.__fr = []; const raf = () => { window.__fr.push(performance.now()); if (window.__fr.length > 2000) window.__fr.shift(); requestAnimationFrame(raf); }; requestAnimationFrame(raf); });
page.setDefaultTimeout(900000);
const T0 = Date.now(), lg = m => console.log(TAG, Math.round((Date.now() - T0) / 1000) + 's', m);
await page.goto('file://' + resolve(HTML) + '?cg=0&op=0' + (Q ? '&' + Q : ''), { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 }); lg('title');
await page.evaluate(q => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); }, QUAL);
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 }); lg('world');
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
const L0 = await page.evaluate(() => window.__gl.link);
await page.evaluate(() => window.__game.enterRaid('frost_crypt', 0)); await page.waitForTimeout(500);
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 300000 }); lg('raid');
await page.waitForTimeout(2000);
// 怪移出本区（不打死，免得溶解特效进画面）、玩家无敌，机位只看场景光
await page.evaluate(() => { const g = window.__game; for (const e of g.enemies) if (e.z === 'raid') { e.z = 'off'; if (e.rig?.root) e.rig.root.visible = false; } g.player.maxHp = g.player.hp = 1e9; document.querySelectorAll('.panel,#raid-hud').forEach(p => { p.style.display = 'none'; }); });
await page.waitForTimeout(1000);
const L1 = await page.evaluate(() => window.__gl.link);
const O = { x: -1000, z: 0 };
// 机位：局部坐标（副本原点 -1000,0）+ 镜头朝向
const SHOTS = [
  { n: 'corr_fwd', x: 0, z: -24, yaw: 0, note: 'entry→b0 corridor, facing forward' },
  { n: 'corr_back', x: 0, z: -24, yaw: Math.PI, note: 'same spot, facing back to entry' },
  { n: 'corr_side', x: 0, z: -24, yaw: Math.PI / 2, note: 'same spot, side view over the ice sea' },
  { n: 'fork', x: 0, z: -84, yaw: 0.75, note: 'fork hub, facing the north branch' },
  { n: 'b4', x: 0, z: -250, yaw: 0, note: 'final arena (b4)' },
];
const rows = [];
for (const s of SHOTS) {
  await page.evaluate(([x, z, yaw]) => { const g = window.__game; g.player.pos.set(x, 0, z); window.__dbg.cam(yaw, 0.42, 11); }, [O.x + s.x, O.z + s.z, s.yaw]);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const D = window.__dbg, R = D.renderer, gl = R.getContext(), px = new Uint8Array(4);
    let real = 0, pad = 0; D.scene.traverseVisible(o => { if (o.isPointLight) { if (o.userData.lightPad) pad++; else real++; } });
    const ts = []; for (let i = 0; i < 9; i++) { const t = performance.now(); D.pipeline.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); }
    ts.sort((a, b) => a - b);
    const f = window.__fr.slice(-40), gp = []; for (let i = 1; i < f.length; i++) gp.push(f[i] - f[i - 1]); gp.sort((a, b) => a - b);
    const ar = R.info.autoReset; R.info.autoReset = false; R.info.reset(); D.pipeline.render(); const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.autoReset = ar;
    return { real, pad, shaderLights: real + pad, programs: R.info.programs?.length ?? -1, renderMs: +ts[4].toFixed(1), rafMs: gp.length ? +gp[gp.length >> 1].toFixed(1) : null, calls, tris, pool: window.__game.raidLightPool?.() ?? null, q: D.pipeline.quality, canvas: R.domElement.width + 'x' + R.domElement.height };
  });
  await page.screenshot({ path: `${OUT}/b1_${TAG}_${s.n}.png` });
  rows.push({ shot: s.n, note: s.note, ...r }); lg(s.n + ' ' + JSON.stringify(r));
}
const L2 = await page.evaluate(() => window.__gl.link);
const sum = { tag: TAG, qual: QUAL, vw: VW, query: Q, linksEnterRaid: L1 - L0, linksDuringShots: L2 - L1, rows, errors: errors.slice(0, 5) };
writeFileSync(`${OUT}/b1_${TAG}.json`, JSON.stringify(sum, null, 1));
console.log(TAG, 'SUMMARY', JSON.stringify({ linksEnterRaid: sum.linksEnterRaid, linksDuringShots: sum.linksDuringShots }));
console.log(TAG, errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
