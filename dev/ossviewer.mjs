// v1.2.44 开源流水线示例页实测：本地静态服务 opensource/lux3d-web-pipeline → examples/viewer.html 选 GLB → 截图（three 走 unpkg CDN，需要外网）
import { chromium } from 'playwright-core';
import http from 'http'; import { readFileSync, existsSync } from 'fs'; import { join, extname } from 'path';
const ROOT = 'opensource/lux3d-web-pipeline', GLB = process.argv[2] || 'assets_aholo/props/weapon_rock_greataxe.glb', OUT = process.argv[3] || '/workspace/work/shots/ossviewer.png';
const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/node_modules/') ? '.' + u : join(ROOT, u); if (!existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(f)] ?? 'application/octet-stream' }); s.end(readFileSync(f)); });
await new Promise(r => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 800, height: 600 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/examples/viewer.html`); await page.waitForTimeout(4000);
await page.setInputFiles('#f', GLB); await page.waitForTimeout(15000);
await page.screenshot({ path: OUT }); console.log('errors', errs.length, errs.slice(0, 2).join(' | ')); await b.close(); srv.close();
