// 11-17 本机铸造任务检查：node test/forge_check.test.mjs（零积分，不联网）
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const { checkForge, text } = require(join(ROOT, 'cloud/forge-fc/check.js'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

const glb = (pad = 0) => { const js = Buffer.from('{"asset":{"version":"2.0"}}  '.padEnd(28 + pad, ' ')); const L = 12 + 8 + js.length; const h = Buffer.alloc(20); h.write('glTF', 0, 'latin1'); h.writeUInt32LE(2, 4); h.writeUInt32LE(L, 8); h.writeUInt32LE(js.length, 12); h.writeUInt32LE(0x4E4F534A, 16); return Buffer.concat([h, js]); };
const home = mkdtempSync(join(tmpdir(), 'fchk_')), dir = join(home, 'glb'); mkdirSync(dir);
const now = Date.now(), H = 3600e3;
const tasks = {
  '1001': { id: '1001', state: 'done', prompt: '紫晶长剑', type: 'sword', t0: now - H, tu: now - H, claimed: now - H },
  '1002': { id: '1002', state: 'done', prompt: '断掉的剑', type: 'sword', t0: now - 2 * H, tu: now - 2 * H },
  '1003': { id: '1003', state: 'failed', prompt: '下载失败', type: 'axe', t0: now - 3 * H, tu: now - 3 * H, error: '下载模型失败（HTTP 502）' },
  '1004': { id: '1004', state: 'queued', prompt: '卡住的', type: 'staff', t0: now - 40 * 60e3, tu: now - 40 * 60e3 },
  '1005': { id: '1005', state: 'running', prompt: '刚开始', type: 'mace', t0: now - 60e3, tu: now - 30e3 },
  '1006': { id: '1006', state: 'failed', prompt: '违禁词', type: 'sword', t0: now - 50 * H, tu: now - 50 * H, error: '描述里有不允许的内容' },
};
writeFileSync(join(dir, 'tasks.json'), JSON.stringify(tasks));
writeFileSync(join(dir, 'forge_state.json'), JSON.stringify({ d: '2026-11-17', n: 3, ip: {} }));
writeFileSync(join(dir, '1001.glb'), glb()); writeFileSync(join(dir, '1001.hd.glb'), glb(40));
writeFileSync(join(dir, '1002.glb'), glb().subarray(0, 30));   // 截断
writeFileSync(join(dir, '9999.glb'), glb());                     // 孤儿
writeFileSync(join(home, 'config.json'), '{"key":"x"}');

const r = checkForge({ glbDir: dir, home, now });
const T = id => r.tasks.find(t => t.taskId === id);
ok(r.exists && r.writable, '目录存在且可写');
ok(r.today && r.today.used === 3, '读到今天已用 3 次');
ok(r.key && r.key.remembered === true, '识别 Key 已记在本机（不读 Key 内容）');
ok(T('1001').glb.ok && T('1001').hd.ok && T('1001').verdict === '正常', '完整任务：模型 + 高精度都正常');
ok(!T('1002').glb.ok && /不完整/.test(T('1002').glb.why) && T('1002').canResume, '截断的 GLB：判为不完整，可续取');
ok(T('1003').canResume && /失败/.test(T('1003').verdict), '下载阶段失败：可续取');
ok(/卡在「排队中」/.test(T('1004').verdict) && T('1004').canResume, '排队 40 分钟没推进：判为卡住');
ok(/等待推进|正在推进/.test(T('1005').verdict) && !T('1005').canResume, '刚开始的任务：正常进行中');
ok(!T('1006').canResume && /超过保留时间/.test(T('1006').verdict), '违禁词失败不可续取；超过 48 小时提示会被清理');
ok(r.orphans.length === 1 && r.orphans[0].file === '9999.glb', '找到 1 个孤儿模型文件');
ok(!r.ok && r.problems.length === 2, `发现 2 个问题（截断 + 卡住）：${r.problems.length}`);
ok(/6 个任务：完成 2、失败 2、进行中 2/.test(r.summary), '摘要：' + r.summary);
const tx = text(r); ok(/本机铸造任务检查/.test(tx) && /建议：/.test(tx) && !/"key"/.test(tx), '文字报告有建议，不含 Key');

// 坏任务表 / 不存在目录 / 只读目录
const d2 = join(home, 'bad'); mkdirSync(d2); writeFileSync(join(d2, 'tasks.json'), '{坏');
const r2 = checkForge({ glbDir: d2 }); ok(!r2.ok && /损坏/.test(r2.problems[0]), '任务表损坏：报问题不崩');
const r3 = checkForge({ glbDir: join(home, 'none') }); ok(!r3.exists && /不存在/.test(r3.problems[0]), '目录不存在：报出');
if (process.getuid && process.getuid() !== 0) { const d4 = join(home, 'ro'); mkdirSync(d4); chmodSync(d4, 0o555); const r4 = checkForge({ glbDir: d4 }); ok(!r4.writable && /不可写/.test(r4.problems[0]), '只读目录：报不可写'); chmodSync(d4, 0o755); }
else console.log('· root 下跳过只读目录用例');

// 命令行
const cli = await new Promise(res => { const p = spawn(process.execPath, [join(ROOT, 'cloud/forge-fc/check.js'), dir]); let o = ''; p.stdout.on('data', d => o += d); p.on('close', c => res({ c, o })); });
ok(cli.c === 2 && /截断|不完整/.test(cli.o) && /9999\.glb/.test(cli.o), `命令行：有问题时退出码 2（${cli.c}）`);

// 本机铸造服务 GET /forge/check（不填 Key，不联网）
const srv = spawn(process.execPath, [join(ROOT, 'deploy/local/forge_local.js')], { env: { ...process.env, FORGE_HOME: home, GLB_DIR: dir, NO_BROWSER: '1', PORT: '17990', AHOLO_API_BASE: 'http://127.0.0.1:9' } });
const port = await new Promise((res, rej) => { let o = ''; srv.stdout.on('data', d => { o += d; const m = /READY http:\/\/127\.0\.0\.1:(\d+)/.exec(o); if (m) res(m[1]); }); setTimeout(() => rej(new Error('服务没起来')), 15000); });
const j = await (await fetch(`http://127.0.0.1:${port}/forge/check`)).json();
ok(j.tasks && j.tasks.length === 6 && j.key && j.key.has === true && !JSON.stringify(j).includes('"x"'), 'GET /forge/check：6 个任务，带 Key 状态但不回传 Key');
const t2 = await (await fetch(`http://127.0.0.1:${port}/forge/check?fmt=text`)).text();
ok(/本机铸造任务检查/.test(t2), 'GET /forge/check?fmt=text：文字报告');
const http = require('http'); const bad = await new Promise(res => { const q = http.get({ host: '127.0.0.1', port, path: '/forge/check', headers: { Host: 'evil.com' } }, r => { r.resume(); res(r.statusCode); }); q.on('error', () => res(0)); });
ok(bad === 403, `非本机 Host 被拒：${bad}`);
srv.kill();
console.log(`${fail ? '✗' : '✓'} 本机任务检查 ${pass}/${pass + fail}`); process.exitCode = fail ? 1 : 0;
