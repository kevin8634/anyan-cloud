// v1.2.54 开场动画截图：node dev/introshot.mjs <html> <输出目录>（?intro=1 强制播放；序幕 3 张概念图 + 岩层标题）
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/introshot'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=6144'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(400000);
await page.goto('file://' + resolve(html) + '?intro=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#intro-cine, #intro', { timeout: 400000 });
const t0 = Date.now(); const at = async (s, n) => { const w = s * 1000 - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/${n}.jpg`, quality: 82 }); console.log('shot', n, ((Date.now() - t0) / 1000).toFixed(1)); };
await at(2.0, 'i1'); await at(5.6, 'i2'); await at(9.2, 'i3'); await at(13.5, 'i4'); await at(16.5, 'i5');
console.log('errors', JSON.stringify(errors)); await b.close();
