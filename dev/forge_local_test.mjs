// 「启动铸造服务」接口测试（假 Aholo 服务端，不联网、不扣分）
// 用法：node dev/forge_local_test.mjs "<启动命令>"   例：node dev/forge_local_test.mjs "node deploy/local/forge_local.js"
//                                                   node dev/forge_local_test.mjs "dist_local/启动铸造服务_linux_arm64"
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
const CMD = process.argv[2] || 'node deploy/local/forge_local.js';
const FAKE = 18790, PORT = 18861, KEY = 'fake-good-key';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const EN_OK = t => !/[A-Za-z]/.test(String(t).replace(/Lux3D|Key|GLB|Aholo|glb/g, ''));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'forgehome-')), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgepkg-'));
fs.writeFileSync(path.join(dir, '暗岩传说_深渊回响_评委版.html'), '<!doctype html><html><head><title>t</title></head><body>页面</body></html>');
fs.mkdirSync(path.join(dir, 'music')); fs.writeFileSync(path.join(dir, 'music', 'a.mp3'), Buffer.alloc(1000, 7));
const fake = spawn('node', ['dev/fake_aholo.mjs', String(FAKE)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => fake.stdout.on('data', d => /READY/.test(d) && r()));
let out = '';
function start() {
  const [bin, ...args] = CMD.split(' ');
  const p = spawn(bin.includes('/') ? path.resolve(bin) : bin, args.map(a => path.resolve(a)), { cwd: dir, env: { ...process.env, FORGE_HOME: home, AHOLO_API_BASE: `http://127.0.0.1:${FAKE}`, NO_BROWSER: '1', PORT: String(PORT), POLL_MS: '300' }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  return p;
}
const B = `http://127.0.0.1:${PORT}`;
const stats = async () => (await fetch(`http://127.0.0.1:${FAKE}/__stats`)).json();
const mode = async o => fetch(`http://127.0.0.1:${FAKE}/__mode`, { method: 'POST', body: JSON.stringify(o) });
const post = (p, o, h = {}) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(o) });
let srv = start();
for (let k = 0; k < 100 && !/READY/.test(out); k++) await sleep(100);
ok(/READY http:\/\/127\.0\.0\.1:18861\//.test(out), '启动并监听 127.0.0.1:18861');
// 页面 + 注入 + 静态文件
let r = await fetch(B + '/'); let t = await r.text();
ok(r.status === 200 && t.includes('darkrock_forge_api') && t.includes('location.origin') && t.includes('页面'), '托管同目录评委版 html，并注入同源铸造地址');
r = await fetch(B + '/music/a.mp3', { headers: { Range: 'bytes=0-99' } });
ok(r.status === 206 && (await r.arrayBuffer()).byteLength === 100, 'music/ 静态文件 + Range');
r = await fetch(B + '/../../etc/passwd'); ok(r.status === 404, '不能越出游戏目录');
// 安全
const hostCode = await new Promise(res => http.get({ host: '127.0.0.1', port: PORT, path: '/forge/key', headers: { Host: 'evil.com' } }, x => { x.resume(); res(x.statusCode); }).on('error', () => res(0))); ok(hostCode === 403, 'Host 不是本机 → 403（防 DNS 重绑定）');
r = await post('/forge', { prompt: 'x', weaponType: 'sword' }, { Origin: 'https://evil.com' }); ok(r.status === 403, '跨站页面 POST → 403');
r = await fetch(B + '/forge', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"prompt":"x","weaponType":"sword"}' }); ok(r.status === 415, 'text/plain 简单请求 → 415（跨站页面无法绕过预检）');
// 没 Key：不发 create
r = await post('/forge', { prompt: '沉在海底的钟铜长剑', weaponType: 'sword', dev: 'dtest123' }); let j = await r.json();
console.log('  无 Key →', r.status, j.error);
ok(r.status === 400 && /还没有填写 Key/.test(j.error) && EN_OK(j.error), '没填 Key → 中文错误、不生成');
let s = await stats(); ok(s.create === 0, `没填 Key：create 调用 ${s.create} 次`);
// 错 Key
r = await post('/forge/key', { key: 'wrong-key-0000', remember: true }); j = await r.json();
console.log('  错 Key →', j.kind, j.text);
ok(!j.ok && j.kind === 'auth' && EN_OK(j.text), '错 Key → 「Key 错误或已过期」中文');
r = await post('/forge', { prompt: '沉在海底的钟铜长剑', weaponType: 'sword', dev: 'dtest123' }); j = await r.json();
ok(r.status === 400 && EN_OK(j.error), `错 Key 时铸造 → 被拦下（${j.error}）`);
s = await stats(); ok(s.create === 0, `错 Key：create 调用 ${s.create} 次`);
ok(!fs.existsSync(path.join(home, 'config.json')), '错 Key 不写配置文件');
// 正确 Key + 记住
r = await post('/forge/key', { key: KEY, remember: true }); j = await r.json();
console.log('  对 Key →', j.kind, j.text);
ok(j.ok && /Key 正确/.test(j.text) && EN_OK(j.text), '正确 Key → 绿色成功文案');
ok(fs.existsSync(path.join(home, 'config.json')), '勾选记住 → 写到本机用户目录配置文件');
r = await fetch(B + '/health'); j = await r.json(); ok(j.local === true && j.hasKey === true && j.ok === true && !JSON.stringify(j).includes(KEY), `/health 带 local / hasKey，不回传 Key（${JSON.stringify({ local: j.local, hasKey: j.hasKey, masked: j.masked })}）`);
r = await fetch(B + '/forge/key/test'); j = await r.json(); ok(j.ok && EN_OK(j.text), '测试 Key 接口（task/list）');
// 接口繁忙时：create 前测 Key 失败 → 不发 create
await mode({ list: '500' });
r = await post('/forge', { prompt: '沉在海底的钟铜长剑', weaponType: 'sword', dev: 'dtest123' }); j = await r.json();
console.log('  list 500 →', r.status, j.error);
ok(r.status === 503 && /繁忙/.test(j.error) && EN_OK(j.error), '测 Key 失败（接口繁忙）→ 不发生成、中文');
s = await stats(); ok(s.create === 0, `接口繁忙：create 调用 ${s.create} 次`);
await mode({ list: 'ok' });
// 完整流程：生成 → 轮询 → 分块取回
const l0 = (await stats()).list;
r = await post('/forge', { prompt: '沉在海底的钟铜长剑', weaponType: 'sword', dev: 'dtest123' }); j = await r.json();
console.log('  铸造 →', r.status, JSON.stringify(j));
s = await stats(); ok(r.status === 200 && j.taskId && s.create === 1 && s.list === l0 + 1, `铸造：先 task/list 再 task/create（list +${s.list - l0}，create ${s.create}）`);
const id = j.taskId; let st = {};
for (let k = 0; k < 200; k++) { st = await (await fetch(`${B}/forge/status/${id}`)).json(); if (st.state === 'done' || st.state === 'failed') break; await sleep(300); }
console.log('  状态 →', JSON.stringify(st));
ok(st.state === 'done' && st.url === `glb/${id}`, '任务完成（服务端下载 + 压缩）');
const parts = []; let off = 0, total = -1;
while (total < 0 || off < total) { const g = await fetch(`${B}/glb/${id}`, { headers: { Range: `bytes=${off}-${off + 2 * 1048576 - 1}` } }); const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(g.headers.get('content-range') || ''); const b = Buffer.from(await g.arrayBuffer()); if (!m) break; total = +m[3]; parts.push(b); off += b.length; }
const glb = Buffer.concat(parts), raw = fs.statSync('/workspace/work/diag/recover/forge_4467036.glb').size;
ok(glb.length === total && glb.readUInt32LE(0) === 0x46546c67, `分块取回 ${parts.length} 块，GLB 文件头正确`);
ok(glb.length < raw * 0.6, `贴图压缩 ${(raw / 1048576).toFixed(1)}MB → ${(glb.length / 1048576).toFixed(1)}MB`);
// 再查一次状态：不重复生成
await fetch(`${B}/forge/status/${id}`); s = await stats(); ok(s.create === 1, '续查状态不重复 create');
// 错误文案中文化（未知任务）
j = await (await fetch(`${B}/forge/status/123`)).json(); ok(EN_OK(j.error), `未知任务 → ${j.error}`);
// 重启：Key 记住
srv.kill(); await sleep(500); out = '';
srv = start(); for (let k = 0; k < 100 && !/READY/.test(out); k++) await sleep(100);
j = await (await fetch(B + '/forge/key')).json(); ok(j.has && j.remembered && !JSON.stringify(j).includes(KEY), `重启后仍记得 Key（${j.masked}）`);
r = await post('/forge/key', { key: '' }); j = await r.json(); ok(j.ok && !fs.existsSync(path.join(home, 'config.json')), '清除 Key → 删除配置文件');
// 只监听 127.0.0.1：非回环地址连不上
const ext = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal);
if (ext) { let reach = true; try { await fetch(`http://${ext.address}:${PORT}/forge/key`, { signal: AbortSignal.timeout(3000) }); } catch { reach = false; } ok(!reach, `非回环地址 ${ext.address} 连不上（只监听 127.0.0.1）`); }
srv.kill(); fake.kill();
ok(!out.includes(KEY) && !fs.readdirSync(home).some(f => f.endsWith('.log')), '控制台输出里没有 Key 原文');
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
