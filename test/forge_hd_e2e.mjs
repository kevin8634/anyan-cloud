// v1.2.54 铸造品双档浏览器端到端（零积分）：假 Lux3D（真实样例 GLB）+ 真实 deploy/modelscope/server.js + 比赛版 DLC 页面
// 测：两档都下载（/glb/<id> 与 /glb/<id>/hd）、成形演出与「我的铸造品」/ 大图用高精度版、角色手持用减面的游戏版、
//     高精度版缺失（404）时游戏版照常换上且展示回退游戏版、删除时高精度版一并删除。
// 用法：node test/forge_hd_e2e.mjs [html] [截图目录]
import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const HTML = resolve(process.argv[2] || ROOT + 'web/index_dlc1_比赛版.html');
const OUT = process.argv[3] || '/tmp/forge_hd_shots'; mkdirSync(OUT, { recursive: true });
const GLB = readFileSync(ROOT + 'test/fixtures/lux3d_4390018.glb');
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
let nextId = 8800; const tk = {};
const lux = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url.startsWith('/lux3d') && q.headers.authorization !== 'E2EKEY') { s.writeHead(401); return s.end('{}'); }
  if (q.url.includes('/task/create')) { const id = nextId++; tk[id] = Date.now(); return s.end(JSON.stringify({ c: '0', d: id })); }
  if (q.url.includes('/task/get')) { const id = +new URL(q.url, 'http://x').searchParams.get('taskid');
    if (Date.now() - tk[id] < 1500) return s.end(JSON.stringify({ c: '0', d: { status: 1 } }));
    return s.end(JSON.stringify({ c: '0', d: { status: 3, outputs: [{ content: `http://127.0.0.1:${lux.address().port}/r/${id}/tex_mesh.glb` }] } })); }
  if (q.url.startsWith('/r/')) { s.writeHead(200); return s.end(GLB); }
  s.writeHead(404); s.end('{}');
}); });
await new Promise(r => lux.listen(0, r));
const DIR = '/tmp/forge_hd_e2e'; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
writeFileSync(DIR + '/p.html', '<html><head></head><body></body></html>');
const PORT = 19000 + Math.floor(Math.random() * 900);
let logs = '';
const srv = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, PORT: String(PORT), PAGE_FILE: DIR + '/p.html', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: 'E2EKEY', AHOLO_API_BASE: `http://127.0.0.1:${lux.address().port}`, POLL_MS: '100', DAILY_LIMIT: '9', PER_IP_LIMIT: '9', GLB_DIR: DIR + '/glb', STATE_FILE: DIR + '/state.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => { srv.stdout.on('data', d => { logs += d; if (/\[server\]/.test(d)) r(); }); srv.stderr.on('data', d => { logs += d; }); });
const API = `http://127.0.0.1:${PORT}`;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultNavigationTimeout(180000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
const reqs = []; page.on('request', q => { if (/\/glb\//.test(q.url())) reqs.push(q.url().replace(API, '')); });
const S = 'window.__dlc1.smithy';
await page.goto('file://' + HTML);
await page.evaluate(a => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' })); localStorage.setItem('darkrock_forge_api', a); }, API);
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.tutFinish?.(); const s = window.__dlc1.smithy; s.show.speed = 6; s.cfg.pollMs = 300; s.cfg.chunk = 300000; });
/** 手上 lux_<k> 网格的三角面数（没有 = 0） */
const handTris = k => page.evaluate(k => { let t = 0; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) { const g = o.geometry; t = (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t; }, k);
let hdSeen = false; await page.exposeFunction('__hdcap', v => { if (v) hdSeen = true; });
await page.evaluate(() => { setInterval(() => { if (document.getElementById('d1-forgeshow-hd')) window.__hdcap(1); }, 200); });

// ---- 1 两档都有
const r1 = await page.evaluate(`${S}.forge('黑曜石与银镜片拼成的细长水晶长剑')`);
const k1 = r1.key, id1 = r1.taskId;
ok(r1.ok && r1.online && k1 === 'forge_' + id1, `在线铸造成功 ${k1}：${r1.msg}`);
ok(reqs.some(u => u === `/glb/${id1}`) && reqs.some(u => u === `/glb/${id1}/hd`), `两档都下载：${[...new Set(reqs)].join(' ')}`);
await page.waitForFunction(k => window.__dlc1.smithy.hd.has(k) && !window.__dlc1.smithy.hd.jobs.size, k1, { timeout: 30000 }).catch(() => {});
const sz = await page.evaluate(k => ({ hd: window.__dlc1.smithy.hd.size(k), game: window.__dlc1.smithy.items().find(i => i.key === k)?.size }), k1);
ok(sz.hd > sz.game && sz.game > 0, `高精度版存 IndexedDB ${(sz.hd / 1048576).toFixed(2)}MB，游戏版 ${(sz.game / 1048576).toFixed(2)}MB`);
ok(await page.evaluate(() => (localStorage.getItem('darkrock_forge_hd_idx') || '').length < 200), 'localStorage 只记小索引（不存模型）');
ok(hdSeen, '成形演出显示「高精度预览」角标（展示的是高精度版）');
const t1 = await handTris(k1), tHd = await handTris(k1 + '__hd');
ok(t1 > 0 && t1 < 11732 && tHd === 0, `角色手持的是减面的游戏版：${t1} 面（高精度原始 11732 面不上手）`);
// 「我的铸造品」预览 + 大图
await page.evaluate(`${S}.open()`); await page.waitForTimeout(1500);
const tag = await page.evaluate(() => document.getElementById('fg-hdtag')?.textContent);
ok(tag === '高精度预览', `「我的铸造品」预览标注：${tag}`);
await page.locator('#fg-mine').scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/1_mine_hd.png' });
await page.click('#fg-pv .big'); await page.waitForTimeout(1500);
const v1 = await page.evaluate(`${S}.hd.viewer`);
ok(v1.open && v1.hd && /__hd$/.test(v1.key) && v1.len > 2.4, `大图查看用高精度版 ${v1.key}（展示长度 ${v1.len.toFixed(2)}）`);
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(760, 330, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
await page.screenshot({ path: OUT + '/2_viewer_hd.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ok(!(await page.evaluate(`${S}.hd.viewer.open`)), 'Esc 关闭大图');
await page.evaluate(`${S}.close()`);

// ---- 2 高精度版缺失（/hd 404）→ 游戏版照常换上，展示回退游戏版
await page.route(/\/glb\/\d+\/hd$/, r => r.fulfill({ status: 404, body: '{"error":"没有"}' }));
hdSeen = false;
const r2 = await page.evaluate(`${S}.forge('刻着潮纹的锈蚀长剑')`);
const k2 = r2.key;
ok(r2.ok && r2.online && r2.worn !== false, `高精度缺失仍铸造成功并换上：${r2.msg}`);
await page.waitForTimeout(800);
ok(!(await page.evaluate(k => window.__dlc1.smithy.hd.has(k), k2)) && (await handTris(k2)) > 0, '没有高精度版；手上是游戏版');
ok(!hdSeen, '成形演出不标「高精度预览」（回退游戏版）');
await page.evaluate(`${S}.open()`); await page.waitForTimeout(800);
await page.evaluate(k => { document.querySelector(`[data-a="view"][data-k="${k}"]`)?.click(); }, k2); await page.waitForTimeout(800);
ok(await page.evaluate(() => document.getElementById('fg-hdtag')?.textContent) === '游戏版预览', '预览标注「游戏版预览」');
await page.click('#fg-pv .big'); await page.waitForTimeout(1000);
const v2 = await page.evaluate(`${S}.hd.viewer`);
ok(v2.open && !v2.hd && v2.key === k2, `大图回退游戏版 ${v2.key}`);
await page.screenshot({ path: OUT + '/3_viewer_fallback.png' });
await page.keyboard.press('Escape'); await page.evaluate(`${S}.close()`);
await page.unroute(/\/glb\/\d+\/hd$/);

// ---- 3 删除 → 高精度版一并删除；刷新后高精度版仍可从 IndexedDB 懒加载
await page.evaluate(k => window.__dlc1.smithy.del(k), k2);
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForFunction(() => window.__dlc1?.smithy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
const re = await page.evaluate(async k => ({ has: window.__dlc1.smithy.hd.has(k), ens: await window.__dlc1.smithy.hd.ensure(k) }), k1);
ok(re.has && re.ens, '刷新后高精度版从 IndexedDB 懒加载成功');
ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('darkrock_forge_hd_idx') || '{}') ? Object.keys(JSON.parse(localStorage.getItem('darkrock_forge_hd_idx') || '{}')).length : 0)) === 1, '删除的铸造品高精度索引已清');
ok(!errors.length, `页面无报错 ${errors.slice(0, 3).join(' | ')}`);
console.log(`\n${n - fail}/${n} 通过；截图 ${OUT}`);
await b.close(); srv.kill(); lux.close();
process.exit(fail ? 1 : 0);
