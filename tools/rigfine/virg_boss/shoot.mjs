// raidA 11-02 维尔格 / 萨琳首领出图（萨琳共用）。node tools/rigfine/virg_boss/shoot.mjs <glb 相对仓库> <输出目录> [动画1,动画2|all|none]
//   env CAMS=front,side,back,q34,face 静帧；GCAM=q34 动图机位；FPS=12；W=560；TPOSE=1 静帧用绑定姿势；POSE='{骨:[x,y,z]}' 静帧姿势
//   开浏览器前检查可用内存 ≥ 4 GB，不够每 20 秒重查，最多 10 分钟（与展示区窗口错开）
import { chromium } from 'playwright-core';
import http from 'http'; import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'; import { join, extname, resolve } from 'path'; import { execSync } from 'child_process';
const [glb, out, clips = 'all'] = process.argv.slice(2); const ROOT = resolve('.'); mkdirSync(out, { recursive: true });
const avail = () => +execSync("free -m | awk '/Mem:/{print $7}'").toString().trim();
for (let i = 0; avail() < 4000; i++) { if (i >= 30) { console.error('可用内存长时间 < 4 GB，放弃'); process.exit(3); } console.log('可用内存', avail(), 'MB，等待…'); execSync('sleep 20'); }
const MT = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const PORT = 8790 + (process.pid % 50);
const srv = http.createServer((q, r) => { const p = join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MT[extname(p)] || 'application/octet-stream' }); r.end(readFileSync(p)); }).listen(PORT);
const W = +(process.env.W || 560), Hh = +(process.env.H || W);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: W, height: Hh } });
  pg.on('console', m => { if (m.type() === 'error') console.log('页面错误', m.text()); }); pg.on('pageerror', e => console.log('页面异常', e.message));
  await pg.goto(`http://127.0.0.1:${PORT}/tools/rigfine/virg_boss/view.html?glb=/${glb}&w=${W}&h=${Hh}&bloom=${process.env.BLOOM ?? 1}`); await pg.waitForFunction(() => window.ready, null, { timeout: 240000 });
  const info = await pg.evaluate(() => window.info()); writeFileSync(join(out, 'clips.json'), JSON.stringify(info.clips)); console.log(JSON.stringify({ tris: info.tris, H: info.H, bones: info.bones, clips: info.clips.map(c => c.name + ':' + c.dur.toFixed(2)) }));
  const cl = info.clips.map(c => c.name);
  for (const c of (process.env.CAMS ?? 'front,side,back,q34,face').split(',').filter(Boolean)) {
    await pg.evaluate(([c, tp, ps, idle]) => { if (tp) window.rest(); else if (ps) window.pose(JSON.parse(ps)); else if (idle) window.play('idle', 0); else window.rest(); window.cam(c.includes(':') ? c.split(':').map(Number) : c); }, [c, !!process.env.TPOSE, process.env.POSE || '', cl.includes('idle')]);
    await pg.screenshot({ path: join(out, `${c.replace(/[:]/g, '_')}.png`) });
  }
  const want = clips === 'none' ? [] : clips === 'all' ? cl : clips.split(',');
  const FPS = +(process.env.FPS || 12);
  for (const id of want) { const c = info.clips.find(x => x.name === id); if (!c) { console.log('无动画', id); continue; }
    const dir = join(out, 'frames_' + id); mkdirSync(dir, { recursive: true }); const n = Math.round(c.dur * FPS);
    const gc = (process.env.GCAM || 'q34r,sider').split(',');
    for (let f = 0; f <= n; f++) { for (let k = 0; k < gc.length; k++) { await pg.evaluate(([id, t, cm]) => { window.cam(cm, true); window.play(id, t); }, [id, Math.min(c.dur, f / FPS), gc[k]]); await pg.screenshot({ path: join(dir, `f${String(f).padStart(3, '0')}_${k}.png`) }); } }
    console.log('帧', id, n + 1);
  }
} finally { await b.close(); srv.close(); }
