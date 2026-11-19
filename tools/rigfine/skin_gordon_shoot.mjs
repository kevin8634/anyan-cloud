// raidA 11-01：绑骨首领出图。node tools/rigfine/skin_gordon_shoot.mjs <glb(相对 anyan)> <输出目录> [前缀]
// 出 正面/侧面/脸部特写 PNG + 举臂/弯膝试动帧（<out>/frames/），GIF 用 ffmpeg 合成
import { chromium } from 'playwright-core';
import http from 'http'; import { readFileSync, existsSync, mkdirSync, statSync } from 'fs'; import { join, extname, resolve } from 'path';
const [glb, out, pre = 'gordon'] = process.argv.slice(2); const ROOT = resolve('.');
mkdirSync(join(out, 'frames'), { recursive: true });
const MT = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MT[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(8777);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 720, height: 720 } });
pg.on('console', m => { if (m.type() === 'error') console.log('页面错误', m.text()); });
await pg.goto(`http://127.0.0.1:8777/tools/rigfine/skin_gordon.html?glb=/${glb}&w=720&h=720`); await pg.waitForFunction(() => window.ready, null, { timeout: 180000 });
console.log('骨骼', (await pg.evaluate(() => window.bones)).length);
if (!process.env.FRAMES_ONLY && !process.env.F0) for (const c of (process.env.CAMS || 'front,side,face').split(',')) { await pg.evaluate(c => { window.cam(c); window.pose({}); }, c); await pg.screenshot({ path: join(out, `${pre}_${c}.png`) }); }
if (process.env.STILLS_ONLY) { await b.close(); srv.close(); process.exit(0); }
// 试动：T → 双臂上举 → 放下到体侧 → 屈膝下蹲 → 回 T（看肩/肘/腋下/胯/膝撕裂）
await pg.evaluate(() => window.cam('q34'));
const Lr = (a, b, t) => a + (b - a) * t, ease = t => t * t * (3 - 2 * t);
const P = k => ({ LeftArm: [0, 0, -k.la], RightArm: [0, 0, k.la], LeftForeArm: [0, 0, -k.fa], RightForeArm: [0, 0, k.fa], Spine: [k.bend, 0, 0],
  LeftUpLeg: [k.kn, 0, 0], LeftLeg: [-k.kn * 2, 0, 0], RightUpLeg: [k.kn, 0, 0], RightLeg: [-k.kn * 2, 0, 0], LeftFoot: [k.kn, 0, 0], RightFoot: [k.kn, 0, 0], _hy: -k.kn * 0.16 });
const Z = { la: 0, fa: 0, bend: 0, kn: 0 }, up = { ...Z, la: -1.25 }, down = { ...Z, la: 1.25, fa: 0.35 }, squat = { ...down, kn: 0.85, bend: 0.25 }, flex = { ...Z, la: 0.2, fa: 1.6 };
const seq = [[Z, up, 10], [up, up, 4], [up, down, 14], [down, squat, 10], [squat, squat, 4], [squat, flex, 12], [flex, Z, 10]];
const F0 = +(process.env.F0 || 0), F1 = +(process.env.F1 || 1e9);
let f = 0; for (const [a, c, n] of seq) for (let i = 0; i < n; i++) { if (f < F0 || f >= F1) { f++; continue; } const t = ease(i / (n - 1 || 1)); const k = {}; for (const x in Z) k[x] = Lr(a[x], c[x], t); await pg.evaluate(v => window.pose(v), P(k)); await pg.screenshot({ path: join(out, 'frames', `f${String(f++).padStart(3, '0')}.png`) }); }
if (process.env.FRAMES_ONLY) { console.log('frames', F0, Math.min(f, F1)); await b.close(); srv.close(); process.exit(0); }
// 关键姿势单帧（上举 / 下蹲）便于看撕裂
await pg.evaluate(v => window.pose(v), P(up)); await pg.screenshot({ path: join(out, `${pre}_pose_armsup.png`) });
await pg.evaluate(v => window.pose(v), P(squat)); await pg.screenshot({ path: join(out, `${pre}_pose_squat.png`) });
console.log('frames', f); await b.close(); srv.close();
