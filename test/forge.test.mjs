// v1.2.46 铸造台服务端自检（零积分）：本地假 Lux3D（返回 task 号 / 状态 / 真实 Lux3D 样例 GLB）+ 真实 deploy/modelscope/server.js 子进程
// 覆盖：成功（异步任务 → 状态 → 压缩 → Range 分块）、生成失败、服务重启后续取、超限 / 创建失败不计次、提示词、/health last
// 用法：node test/forge.test.mjs
import http from 'http';
import { spawn } from 'child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const GLB = readFileSync(ROOT + 'test/fixtures/lux3d_4390018.glb');
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 假 Lux3D：提示词含「失败」→ 状态 4；含「慢」→ 先进行中 8 次；含「建不了」→ create 报 500
let creates = [], gets = 0, nextId = 5000;
const tasks = {};
const lux = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url.startsWith('/lux3d') && q.headers.authorization !== 'TESTKEY') { s.writeHead(401); return s.end('{}'); }
  if (q.url.includes('/task/create')) {
    const body = JSON.parse(b); creates.push(body);
    if (/建不了/.test(body.prompt)) { s.writeHead(500); return s.end('{"c":"500","m":"busy"}'); }
    const id = nextId++; tasks[id] = { left: /慢/.test(body.prompt) ? 8 : 2, fail: /失败/.test(body.prompt), hang: /卡住/.test(body.prompt) ? 2 : 0 };
    return s.end(JSON.stringify({ c: '0', d: id }));
  }
  if (q.url.includes('/task/get')) {
    gets++; const id = +new URL(q.url, 'http://x').searchParams.get('taskid'), t = tasks[id];
    if (!t) return s.end(JSON.stringify({ c: '0', d: { status: 4 } }));
    if (t.left-- > 0) return s.end(JSON.stringify({ c: '0', d: { status: 1, taskId: id } }));
    if (t.fail) return s.end(JSON.stringify({ c: '0', d: { status: 4, taskId: id } }));
    return s.end(JSON.stringify({ c: '0', d: { status: 3, taskId: id, outputs: [{ content: `http://127.0.0.1:${lux.address().port}/r/${id}/tex_mesh.glb` }] } }));
  }
  if (q.url.startsWith('/r/')) { const t = tasks[+q.url.split('/')[2]]; if (t && t.hang > 0) { t.hang--; return; /* 不回应：模拟下载卡住 */ } s.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); return s.end(GLB); }
  s.writeHead(404); s.end('{}');
}); });
await new Promise(r => lux.listen(0, r));

// ---------------------------------------------------------------- 起 server.js（真实部署入口）
const DIR = '/tmp/forge_unit'; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
writeFileSync(DIR + '/page.html', '<html><head></head><body>ok</body></html>');
const PORT = 17000 + Math.floor(Math.random() * 2000);
let srv = null, logs = '';
const startSrv = () => new Promise((res, rej) => {
  srv = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, PORT: String(PORT), PAGE_FILE: DIR + '/page.html', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: 'TESTKEY', AHOLO_API_BASE: `http://127.0.0.1:${lux.address().port}`, POLL_MS: '60', DAILY_LIMIT: '6', PER_IP_LIMIT: '2', GLB_DIR: DIR + '/glb', STATE_FILE: DIR + '/state.json', KEEP_RAW: '1', DL_TIMEOUT_MS: '400', DL_GAP_MS: '50' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => { logs += d; if (/\[server\]/.test(d)) res(); }); srv.stderr.on('data', d => { logs += d; });
  srv.on('exit', c => { if (c) rej(new Error('server 退出 ' + c)); });
});
await startSrv();
const B = `http://127.0.0.1:${PORT}`;
const call = async (method, p, body, ip = '1.1.1.1', headers = {}) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || ''; const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, h: r.headers, buf, j: ct.includes('json') ? JSON.parse(buf.toString() || '{}') : null };
};
const waitDone = async (id, ms = 30000) => { const t0 = Date.now(); const seen = new Set(); let r; while (Date.now() - t0 < ms) { r = await call('GET', `/forge/status/${id}`); seen.add(r.j.state); if (r.j.state === 'done' || r.j.state === 'failed') break; await sleep(100); } return { ...r.j, seen: [...seen] }; };

// 1 健康检查 / CORS
let r = await call('GET', '/health');
ok(r.status === 200 && r.j.ok && r.j.used === 0 && r.j.limit === 6 && r.j.perIp === 2 && 'last' in r.j, `health ${JSON.stringify(r.j)}`);
r = await call('OPTIONS', '/forge'); ok(r.status === 204 && /Range/.test(r.h.get('access-control-allow-headers')) && /Content-Range/.test(r.h.get('access-control-expose-headers')), '预检 CORS（允许 Range、暴露 Content-Range）');
r = await call('GET', '/'); ok(r.status === 200 && /darkrock_forge_api/.test(r.buf.toString()), '页面注入同源铸造地址');

// 2 成功：POST 秒回 taskId → 状态 → done → 压缩 → Range 分块
const t0 = Date.now();
r = await call('POST', '/forge', { prompt: '黑曜石与银镜片拼成的细长水晶长剑', weaponType: 'sword' });
const id1 = r.j?.taskId;
ok(r.status === 200 && id1 && r.j.state === 'queued' && Date.now() - t0 < 2000, `POST /forge 秒回 taskId=${id1}（${Date.now() - t0}ms）`);
const P = creates.at(-1);
ok(P.version === 'G1-Turbo' && P.faceCount === 12000 && /单手长剑/.test(P.prompt) && /暗黑奇幻游戏武器道具，单件完整、无底座、无手、白色背景，造型清晰/.test(P.prompt) && !/金属与皮革/.test(P.prompt) && !/写实暗黑/.test(P.prompt), `提示词 / 面数：${P.faceCount} ${P.prompt}`);
r = await call('GET', '/health'); ok(r.j.used === 1, '拿到 taskId 立刻计次（全站 1）');
const s1 = await waitDone(id1);
ok(s1.state === 'done' && s1.url === `glb/${id1}` && !/^https?:/.test(s1.url), `状态 ${s1.seen.join('→')}，url 为相对地址 ${s1.url}`);
ok(s1.seen.includes('generating') || s1.seen.includes('queued'), '状态里看得到生成中');
ok(s1.size > 100000 && s1.size < 2 * 1048576, `压缩后 ${(s1.size / 1048576).toFixed(2)} MB < 2MB（原 ${(GLB.length / 1048576).toFixed(2)} MB）`);
const full = await call('GET', `/glb/${id1}`);
ok(full.status === 200 && full.buf.length === s1.size && full.buf.readUInt32LE(0) === 0x46546c67 && full.h.get('accept-ranges') === 'bytes', '整包下载 200，是 GLB');
const CH = 300000, parts = []; let total = 0, ranged = true;
for (let a = 0; ; a += CH) {
  const g = await call('GET', `/glb/${id1}`, null, '1.1.1.1', { Range: `bytes=${a}-${a + CH - 1}` });
  const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(g.h.get('content-range') || '');
  if (g.status !== 206 || !m || +m[1] !== a) { ranged = false; break; }
  total = +m[3]; parts.push(g.buf); if (+m[2] + 1 >= total) break;
}
const joined = Buffer.concat(parts);
ok(ranged && parts.length >= 3 && joined.equals(full.buf), `Range 206 分块 ${parts.length} 块拼回与整包一致（${total} 字节）`);
r = await call('GET', `/glb/${id1}`, null, '1.1.1.1', { Range: `bytes=${total + 5}-` }); ok(r.status === 416, '越界 Range → 416');
const { parseGlb } = require(ROOT + 'cloud/forge-fc/glbslim.js');
const gj = parseGlb(full.buf).json;
const { countTris } = require(ROOT + 'cloud/forge-fc/glbslim.js');
ok(gj.images.every(i => i.mimeType === 'image/jpeg') && gj.meshes.length === 1 && countTris(full.buf) < countTris(GLB) && s1.faces === countTris(full.buf), `游戏版：贴图全部转 JPEG + 减面 ${countTris(GLB)} → ${countTris(full.buf)} 面（${(full.buf.length / 1024 | 0)}KB）`);
// v1.2.54 高精度版：原始几何不减面 + 2048 JPEG，单独地址 glb/<id>/hd，同样支持 Range
ok(s1.hdUrl === `glb/${id1}/hd` && s1.hdSize > s1.size && s1.hdFaces === countTris(GLB), `status 带 hdUrl=${s1.hdUrl} hdSize=${s1.hdSize} hdFaces=${s1.hdFaces}`);
const hdf = await call('GET', `/glb/${id1}/hd`);
const hj = parseGlb(hdf.buf).json;
ok(hdf.status === 200 && hdf.buf.length === s1.hdSize && countTris(hdf.buf) === countTris(GLB) && hj.images.every(i => i.mimeType === 'image/jpeg') && hdf.buf.length < GLB.length, `高精度版整包 ${(hdf.buf.length / 1048576).toFixed(2)}MB，${countTris(hdf.buf)} 面不减，贴图 JPEG（原 ${(GLB.length / 1048576).toFixed(2)}MB）`);
const hr = await call('GET', `/glb/${id1}/hd`, null, '1.1.1.1', { Range: 'bytes=0-299999' });
ok(hr.status === 206 && /bytes 0-299999\//.test(hr.h.get('content-range') || '') && hr.buf.equals(hdf.buf.subarray(0, 300000)), '高精度版 Range 206 分块');
ok(existsSync(`${DIR}/glb/${id1}.hd.glb`) && existsSync(`${DIR}/glb/${id1}.glb`), '按 taskId 存两个文件（<id>.glb / <id>.hd.glb）');
ok(readFileSync(`${DIR}/glb/${id1}.raw.glb`).length === GLB.length, 'KEEP_RAW=1 保留原始 GLB');
r = await call('GET', '/health'); ok(r.j.last?.state === 'done' && r.j.last.size === s1.size && r.j.last.taskId === id1 && r.j.last.ms > 0 && /CST/.test(r.j.last.time), `health.last ${JSON.stringify(r.j.last)}`);

// 2b 下载卡住两次 → 自动重试，第 3 次成功（不重新生成）
r = await call('POST', '/forge', { prompt: '下载卡住的剑', weaponType: 'sword' }, '7.7.7.7');
const s2b = await waitDone(r.j.taskId);
ok(s2b.state === 'done' && /第 1\/4 次下载失败：模型下载超时/.test(logs) && /第 3 次/.test(logs), `下载卡住自动重试 → ${s2b.state}`);
r = await call('GET', '/health'); const usedAfter2b = r.j.used;
// 3 生成失败：状态 failed + 原因；仍计次（积分已花）
r = await call('POST', '/forge', { prompt: '注定失败的法杖', weaponType: 'staff' }, '2.2.2.2');
const s2 = await waitDone(r.j.taskId);
ok(s2.state === 'failed' && /生成失败/.test(s2.error), `生成失败 → failed：${s2.error}`);
r = await call('GET', '/health'); ok(r.j.used === usedAfter2b + 1 && r.j.last.state === 'failed' && /生成失败/.test(r.j.last.error), `失败也计次（${r.j.used}），health.last 写原因`);

// 4 创建失败（Lux3D 报错，没拿到 taskId）→ 不计次
r = await call('POST', '/forge', { prompt: '建不了的剑', weaponType: 'sword' }, '3.3.3.3');
ok(r.status === 502 && r.j.error, `Lux3D 创建失败 → 502 ${r.j.error}`);
r = await call('GET', '/health'); ok(r.j.used === usedAfter2b + 1, '没拿到 taskId 不计次');

// 5 中途重启（模拟实例重启 / 关页）：任务表落盘，重启后自动续跑，不重复 create
r = await call('POST', '/forge', { prompt: '慢慢成形的巨斧', weaponType: 'greataxe' }, '4.4.4.4');
const id3 = r.j.taskId; await sleep(150);
const c0 = creates.length;
srv.kill('SIGKILL'); await new Promise(res => srv.once('exit', res));
await startSrv();
const s3 = await waitDone(id3);
ok(s3.state === 'done' && creates.length === c0, `重启后续取完成（state=${s3.state}，create 没有增加：${creates.length}）`);
ok(/后台推进开始/.test(logs) && /下载完成/.test(logs) && /压缩 \d+ → \d+/.test(logs) && /已创建 task=/.test(logs), '服务端关键步骤都有日志');

// 6 超限：每 IP 2 次，全站 5 次
r = await call('POST', '/forge', { prompt: '第二把', weaponType: 'sword' }, '1.1.1.1'); ok(r.status === 200, '同 IP 第 2 次');
r = await call('POST', '/forge', { prompt: '第三把', weaponType: 'sword' }, '1.1.1.1'); ok(r.status === 429 && /每人每天限 2 次/.test(r.j.error), `同 IP 第 3 次 → ${r.j?.error}`);
r = await call('POST', '/forge', { prompt: '第六次', weaponType: 'sword' }, '5.5.5.5'); ok(r.status === 200, '全站第 6 次（本测试上限 6）');
const cBefore = creates.length;
r = await call('POST', '/forge', { prompt: '第七次', weaponType: 'sword' }, '6.6.6.6'); ok(r.status === 429 && /全服 6 次/.test(r.j.error) && creates.length === cBefore, `全站第 6 次 → ${r.j?.error}（不调 Lux3D）`);
r = await call('POST', '/forge', { prompt: '一把剑', weaponType: 'nuke' }); ok(r.status === 400, `非法类型 → ${r.j.error}`);
r = await call('POST', '/forge', { prompt: '毒品之剑', weaponType: 'sword' }); ok(r.status === 400, `敏感词 → ${r.j.error}`);
r = await call('GET', '/forge/status/999999'); ok(r.status === 404, '不存在的任务 → 404');

// 7 v1.2.47 定时领取模式（FORGE_CLAIM=1，魔搭专用开关）+ 页面版本 + 持久盘退回
srv.kill(); await new Promise(res => srv.once('exit', res));
const DIR2 = '/tmp/forge_unit_claim'; rmSync(DIR2, { recursive: true, force: true }); mkdirSync(DIR2, { recursive: true });
const PORT2 = PORT + 1; let logs2 = '';
const srv2 = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, PORT: String(PORT2), PAGE_FILE: DIR + '/page.html', PAGE_VERSION: 'v9.9.9', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: 'TESTKEY', AHOLO_API_BASE: `http://127.0.0.1:${lux.address().port}`, POLL_MS: '60', DAILY_LIMIT: '9', PER_IP_LIMIT: '3', GLB_DIR: DIR2 + '/glb', FORGE_CLAIM: '1', CLAIM_ETA_S: '2' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(res => { srv2.stdout.on('data', d => { logs2 += d; if (/\[server\]/.test(d)) res(); }); srv2.stderr.on('data', d => { logs2 += d; }); });
const B2 = `http://127.0.0.1:${PORT2}`;
const call2 = async (method, p, body, ip = '8.8.8.8') => { const r = await fetch(B2 + p, { method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; };
ok(/模式=定时领取/.test(logs2), '启动日志写明「定时领取」模式');
r = await call2('GET', '/health'); ok(r.j.claim === true && r.j.eta === 2, `health 带 claim / eta：${r.j.claim} ${r.j.eta}`);
r = await call2('GET', '/version'); ok(r.j.ver === 'v9.9.9', `GET /version → ${r.j.ver}`);
const DEV = 'devA_123456', DEV2 = 'devB_654321';
const tc = Date.now();
r = await call2('POST', '/forge', { prompt: '定时领取的法杖', weaponType: 'staff', dev: DEV });
const cid = r.j.taskId;
ok(r.status === 200 && r.j.claim === true && r.j.eta === 2 && r.j.readyAt >= tc + 1900, `POST 回 claim + readyAt（+${r.j.readyAt - tc}ms）`);
r = await call2('GET', `/forge/mine?dev=${DEV}`);
ok(r.j.claim && r.j.tasks.length === 1 && r.j.tasks[0].taskId === cid && r.j.tasks[0].prompt === '定时领取的法杖' && r.j.tasks[0].readyAt && typeof r.j.now === 'number', `mine 列出本设备任务（${r.j.tasks[0]?.state}）`);
r = await call2('GET', `/forge/mine?dev=${DEV2}`, null, '9.9.9.1'); ok(r.j.tasks.length === 0, '别的设备 / IP 看不到');
r = await call2('GET', `/forge/mine?dev=${DEV2}`); ok(r.j.tasks.length === 0, '同 IP 但别的设备：带了设备 ID 的任务不串');
// 老页面（没带 dev）→ 新页面同 IP 认领
r = await call2('POST', '/forge', { prompt: '老页面铸的剑', weaponType: 'sword' }, '6.6.6.9'); const oldId = r.j.taskId;
r = await call2('GET', `/forge/mine?dev=${DEV2}`, null, '6.6.6.9'); ok(r.j.tasks.some(t => t.taskId === oldId), '老页面没带设备 ID 的任务，同 IP 新页面能认领');
// 等完成 → done + url
let mm; for (let k = 0; k < 200; k++) { mm = await call2('GET', `/forge/mine?dev=${DEV}`); if (mm.j.tasks[0]?.state === 'done') break; await sleep(100); }
ok(mm.j.tasks[0].state === 'done' && mm.j.tasks[0].url === `glb/${cid}` && mm.j.tasks[0].size > 100000 && mm.j.tasks[0].hdUrl === `glb/${cid}/hd` && mm.j.tasks[0].hdSize > mm.j.tasks[0].size, `完成后 mine 带 url / hdUrl：${mm.j.tasks[0].url} ${mm.j.tasks[0].hdUrl}`);
r = await call2('POST', `/forge/claimed/${cid}`, { dev: DEV2 }, '9.9.9.2'); ok(r.status === 403, '别人领不走 → 403');
r = await call2('POST', `/forge/claimed/${cid}`, { dev: DEV }); ok(r.status === 200 && r.j.ok, '本设备标记已领取');
r = await call2('GET', `/forge/mine?dev=${DEV}`); ok(r.j.tasks.length === 0, '领取后不再出现在 mine');
ok(readFileSync(DIR2 + '/glb/tasks.json', 'utf8').includes('"claimed"') && readFileSync(DIR2 + '/glb/forge_state.json', 'utf8').includes('"n"'), '任务表 / 计数落在 GLB_DIR（持久盘）');
srv2.kill();
// GLB_DIR 不可写 → 自动退回 /tmp/forge_glb
const ro = spawn(process.execPath, ['-e', `process.env.GLB_DIR='/etc/hostname/forge_ro';require(${JSON.stringify(ROOT + 'cloud/forge-fc/index.js')});`], { stdio: ['ignore', 'pipe', 'pipe'] });
let roLog = ''; ro.stdout.on('data', d => roLog += d); await new Promise(res => ro.once('exit', res));
ok(/不可写，退回 \/tmp\/forge_glb/.test(roLog), `持久盘不可写时退回 /tmp：${roLog.trim().slice(0, 60)}`);

lux.close();
console.log(`${fail ? '✗' : '✓'} 铸造台服务端 ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
