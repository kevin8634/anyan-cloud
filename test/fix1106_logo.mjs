// fix1106 ①：标题页左上角动态 LOGO 黑底块 → canvas 亮度转透明。截改后 / 改前（运行时退回 screen 视频）左上角对照
// 用法 node test/fix1106_logo.mjs [html] [out] [宽x高]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/fix1106/logo';
const [W, H] = (process.argv[4] || '1920x1080').split('x').map(Number); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: W, height: H } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultNavigationTimeout(300000); page.goto('file://' + HTML + '?cg=0&Q=medium').catch(e => errors.push('goto ' + e.message));
await page.waitForFunction(() => window.__game && !document.getElementById('anyan-loader') && document.querySelector('#title .sel-logo')?.classList.contains('vid'), null, { timeout: 600000 });
await page.waitForTimeout(6000);
const st = await page.evaluate(() => { const c = document.querySelector('#title .sel-logo-cv'); const v = document.querySelector('#title video.sel-logo-vid'); return { canvas: !!c, cw: c?.width, ch: c?.height, vsrc: v?.classList.contains('src'), vt: v?.currentTime }; });
if (process.env.BRIGHT) await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:29;pointer-events:none;background:linear-gradient(90deg,#6a8a9a,#c9a46a 40%,#3a5a4a)'; document.body.appendChild(d); });   // 验证用亮底（模拟真机亮场景）
const clip = { x: 0, y: 0, width: Math.round(W * 0.42), height: Math.round(H * 0.36) };
await page.screenshot({ path: `${OUT}/after_${W}${process.env.BRIGHT ? '_bright' : ''}.png`, clip, timeout: 120000 });
await page.screenshot({ path: `${OUT}/after_full_${W}.png`, timeout: 120000 });
await page.evaluate(() => { document.querySelector('#title .sel-logo-cv')?.remove(); document.querySelector('#title video.sel-logo-vid')?.classList.remove('src'); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/before_${W}${process.env.BRIGHT ? '_bright' : ''}.png`, clip, timeout: 120000 });
console.log(JSON.stringify(st)); console.log('errors=' + JSON.stringify(errors)); await b.close();
