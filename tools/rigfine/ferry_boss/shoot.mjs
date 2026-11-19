// raidA 11-02：摆渡双子出图。node tools/rigfine/ferry_boss/shoot.mjs <glb(相对 anyan)> <输出目录> [clip1,clip2]  env CAMS=front,side,face,q34 STILLS_ONLY=1 F0/F1 分批
import { chromium } from 'playwright-core';
import http from 'http'; import { readFileSync, existsSync, mkdirSync, statSync } from 'fs'; import { join, extname, resolve } from 'path';
import { CLIPS, IDLE } from './clips.mjs';
if (process.env.EXTRA) Object.assign(CLIPS, (await import(process.env.EXTRA)).default);   // 11-03：诊断用临时动作（diag/hiptest.mjs）
const [glb, out, clips = 'idle,thrust'] = process.argv.slice(2); const ROOT = resolve('.');
mkdirSync(out, { recursive: true });
const MT = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MT[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(8778);
const W = +(process.env.W || 640);
// A8fix：同 morvis/shoot.mjs，用本沙箱装好的 chromium（系统默认那个缺依赖起不来），开前串行等别的浏览器退出、内存 ≥4G
const EXE = process.env.CHROME || '/workspace/work/.pw/chromium-1140/chrome-linux/chrome';
{ const { execSync } = await import('child_process'); for (let i = 0; i < +(process.env.WAITN || 9); i++) { const busy = execSync("pgrep -f '[c]hrome-linux/chrome|[c]hromium|[h]eadless_shell' || true").toString().trim(); const free = +execSync("free -g | awk '/Mem/{print $7}'").toString(); if (!busy && free >= 4) break; console.log('等浏览器空闲', busy.split('\n').length, free + 'G'); await new Promise(r => setTimeout(r, 10000)); } }
const b = await chromium.launch({ executablePath: EXE, env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '/tmp/libs/usr/lib/aarch64-linux-gnu' }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: W, height: W } });
pg.on('console', m => { if (m.type() === 'error') console.log('页面错误', m.text()); });
await pg.goto(`http://127.0.0.1:8778/tools/rigfine/skin_gordon.html?glb=/${glb}&w=${W}&h=${W}`); await pg.waitForFunction(() => window.ready, null, { timeout: 180000 });
await pg.evaluate(() => { const S = window.__scene; });
if (!process.env.F0) for (const c of (process.env.CAMS || 'front,side,face').split(',').filter(Boolean)) { await pg.evaluate(([c, p]) => { window.cam(c); window.pose(p); }, [c, process.env.TPOSE ? {} : { ...IDLE, ...JSON.parse(process.env.POSE || '{}') }]); await pg.screenshot({ path: join(out, `${c}.png`) }); }
if (process.env.STILLS_ONLY) { await b.close(); srv.close(); process.exit(0); }
const ease = t => t * t * (3 - 2 * t);
function at(k, t) { let i = 0; while (i < k.length - 2 && t > k[i + 1][0]) i++; const [t0, a] = k[i], [t1, c] = k[i + 1]; const u = ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))); const o = {};
  for (const n of new Set([...Object.keys(a), ...Object.keys(c)])) { const z = n === '_hy' ? 0 : [0, 0, 0]; const va = a[n] ?? z, vc = c[n] ?? z; o[n] = Array.isArray(va) ? va.map((x, j) => x + (vc[j] - x) * u) : va + (vc - va) * u; } return o; }
await pg.evaluate(c => window.cam(c), process.env.GCAM || 'q34');
const F0 = +(process.env.F0 || 0), F1 = +(process.env.F1 || 1e9); let f = 0;
mkdirSync(join(out, 'frames'), { recursive: true });
for (const id of clips.split(',')) { const c = CLIPS[id]; const dur = c.k.at(-1)[0];
  for (let t = 0; t <= dur + 1e-6; t += +(process.env.STEP || 0.1)) { if (f >= F0 && f < F1) { await pg.evaluate(v => window.pose(v), at(c.k, t)); await pg.screenshot({ path: join(out, 'frames', `f${String(f).padStart(3, '0')}.png`) }); } f++; } }
console.log('frames', F0, Math.min(f, F1), 'total', f); await b.close(); srv.close();
