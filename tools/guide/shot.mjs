// 攻略 html → 长图：node tools/guide/shot.mjs <html> <png>
import { chromium } from 'playwright-core';
const [src, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1200 } });
await p.goto('file://' + process.cwd() + '/' + src); await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log(out);
