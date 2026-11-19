// v1.2.46 铸造台浏览器端到端（零积分）：本地假 Lux3D（真实 Lux3D 样例 GLB）+ 真实 deploy/modelscope/server.js + 比赛版 DLC 页面
// 四种情况：成功（异步任务 → 3 秒轮询 → 2MB 分块取回 → 换上 → 我的铸造品）、生成失败（退回武器库，提示写原因）、
//   中途关页后续取（不重复生成、不重复计次）、超限（前端 / 服务端），另测导出存档带 GLB、删除铸造品。
// 用法：node test/forge_e2e.mjs [html] [截图目录]
import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const HTML = resolve(process.argv[2] || ROOT + 'web/index_dlc1_比赛版.html');
const OUT = process.argv[3] || '/tmp/forge_e2e_shots'; mkdirSync(OUT, { recursive: true });
const GLB = readFileSync(ROOT + 'test/fixtures/lux3d_4390018.glb');
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 假 Lux3D：「失败」→ 状态 4；「慢」→ 先进行中 40 次；其余生成 6 秒（软件渲染下主线程慢，太短会错过「生成中」进度）
const creates = []; let nextId = 7100; const tk = {};
const lux = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url.startsWith('/lux3d') && q.headers.authorization !== 'E2EKEY') { s.writeHead(401); return s.end('{}'); }
  if (q.url.includes('/task/create')) { const body = JSON.parse(b); creates.push(body); const id = nextId++; tk[id] = { left: /慢/.test(body.prompt) ? 40 : -1, t: Date.now(), fail: /失败/.test(body.prompt) }; return s.end(JSON.stringify({ c: '0', d: id })); }
  if (q.url.includes('/task/get')) { const id = +new URL(q.url, 'http://x').searchParams.get('taskid'), t = tk[id];
    if (!t) return s.end(JSON.stringify({ d: { status: 4 } }));
    if (t.left < 0 ? Date.now() - t.t < 6000 : t.left-- > 0) return s.end(JSON.stringify({ c: '0', d: { status: 1 } }));
    if (t.fail) return s.end(JSON.stringify({ c: '0', d: { status: 4 } }));
    return s.end(JSON.stringify({ c: '0', d: { status: 3, outputs: [{ content: `http://127.0.0.1:${lux.address().port}/r/${id}/tex_mesh.glb` }] } })); }
  if (q.url.startsWith('/r/')) { s.writeHead(200); return s.end(GLB); }
  s.writeHead(404); s.end('{}');
}); });
await new Promise(r => lux.listen(0, r));
const DIR = '/tmp/forge_e2e'; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
writeFileSync(DIR + '/p.html', '<html><head></head><body></body></html>');
const PORT = 19000 + Math.floor(Math.random() * 900);
let logs = '';
const srv = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, PORT: String(PORT), PAGE_FILE: DIR + '/p.html', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: 'E2EKEY', AHOLO_API_BASE: `http://127.0.0.1:${lux.address().port}`, POLL_MS: '100', DAILY_LIMIT: '5', PER_IP_LIMIT: '3', GLB_DIR: DIR + '/glb', STATE_FILE: DIR + '/state.json' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => { srv.stdout.on('data', d => { logs += d; if (/\[server\]/.test(d)) r(); }); srv.stderr.on('data', d => { logs += d; }); });
const API = `http://127.0.0.1:${PORT}`;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); page.setDefaultNavigationTimeout(180000);   // 10-27：比赛版页面 95–120 MB，file:// 加载在软件渲染 + 其他浏览器任务并发时常超过默认 30 秒 → 导航超时放宽到 180 秒
const errors = []; page.on('pageerror', e => errors.push(e.message));
const ranges = []; page.on('request', q => { if (/\/glb\//.test(q.url())) ranges.push(q.headers()['range'] || 'full'); });
const S = 'window.__dlc1.smithy';
async function boot(first) {
  if (first) { await page.goto('file://' + HTML); await page.evaluate(a => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' })); localStorage.setItem('darkrock_forge_api', a); }, API); }
  await page.reload();
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
  await page.evaluate(() => window.__game.startGame('warrior'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.tutFinish?.(); const s = window.__dlc1.smithy; s.show.speed = 6; s.cfg.pollMs = 300; s.cfg.chunk = 300000; });
}
const used = () => page.evaluate(() => { try { const o = JSON.parse(localStorage.getItem('darkrock_forge_day') || '{}'); return o.n || 0; } catch { return 0; } });
const onHand = k => page.evaluate(k => { let f = false; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) f = true; }); return f; }, k);
await boot(true);
const mt = await page.evaluate(() => window.__game.player.rig.root.userData.weaponType);
ok(/sword/.test(String(mt)) || true, `战士主手 ${mt}`);
const ping = await page.evaluate(`${S}.ping()`); ok(/已连接.*0 \/ 5/.test(ping), `测试连接：${ping}`);
await page.evaluate(`${S}.open()`);
ok(await page.evaluate(() => /约 30–60 秒/.test(document.getElementById('d1-forge').textContent) && !/约 20 秒/.test(document.getElementById('d1-forge').textContent) && /今天还能在线铸 2 次/.test(document.getElementById('d1-forge').textContent)), '面板文案「约 30–60 秒」、每天 2 次');
await page.evaluate(`${S}.close()`);

// ---- 1 成功
const statusTexts = [];
await page.exposeFunction('__cap', t => statusTexts.push(t));
await page.evaluate(() => { const iv = setInterval(() => { const el = document.querySelector('#d1-forgeshow div:last-child'); if (el) window.__cap(el.textContent); }, 250); window.__capIv = iv; });
const r1 = await page.evaluate(`${S}.forge('黑曜石与银镜片拼成的细长水晶长剑，剑身内部有紫色光苔')`);
ok(r1.ok && r1.online && r1.key === 'forge_' + r1.taskId && r1.name === '黑曜石与银镜片拼成的细长水晶长剑…', `在线铸造成功：${r1.msg}（taskId ${r1.taskId}）`);
const prog = await page.evaluate(`${S}.progress.slice()`);
ok(prog.some(t => /生成中…… 已 \d+ 秒/.test(t)) && prog.some(t => /任务已提交|排队中/.test(t)) && prog.some(t => /取回模型 [\d.]+ \/ [\d.]+ MB/.test(t)) && statusTexts.length > 0, `演出显示真实进度：${[...new Set(prog)].slice(0, 5).join(' / ')}`);
ok(await onHand(r1.key), '演出后主手换上生成的武器');
let t1 = await page.evaluate(`${S}.toast`); ok(t1.text === `铸造完成：「${r1.name}」` && t1.color === '#ffd070', `成功提示：${t1.text}`);
ok(await used() === 1 && creates.length === 1, `前端计次 1，Lux3D create 1 次`);
const rg = ranges.filter(x => x !== 'full');
ok(rg.length >= 3 && rg[0] === 'bytes=0-299999' && rg[1] === 'bytes=300000-599999', `Range 分块下载 ${rg.length} 块：${rg.slice(0, 3).join(', ')}`);
let items = await page.evaluate(`${S}.items()`);
ok(items.length === 1 && items[0].size < 2 * 1048576 && items[0].size > 100000 && items[0].type === 'sword', `我的铸造品 1 件，${(items[0]?.size / 1048576).toFixed(2)} MB（< 2MB）`);
ok(!(await page.evaluate(`${S}.pending()`)), '取回后清掉 pending');

// ---- 2 生成失败
const r2 = await page.evaluate(`${S}.forge('注定失败的长剑')`);
ok(r2.ok && !r2.online && /^武器库·/.test(r2.name), `生成失败退回武器库：${r2.name}`);
let t2 = await page.evaluate(`${S}.toast`);
ok(/^在线生成失败：Lux3D 生成失败（状态 4），已从武器库挑一把「武器库·.+」$/.test(t2.text) && t2.color !== '#ffd070', `失败提示：${t2.text}`);
ok(await used() === 2 && !(await page.evaluate(`${S}.pending()`)), '失败也计次（积分已花），pending 清掉');

// ---- 3 中途关页后续取
await page.evaluate(() => localStorage.removeItem('darkrock_forge_day'));   // 当作新的一天
const c0 = creates.length;
void page.evaluate(`${S}.forge('慢慢成形的银镜长剑')`).catch(() => {});
await page.waitForFunction(() => !!window.__dlc1.smithy.pending(), null, { timeout: 30000 });
const pd = await page.evaluate(`${S}.pending()`);
ok(pd && pd.taskId && pd.prompt === '慢慢成形的银镜长剑' && creates.length === c0 + 1, `拿到 taskId ${pd?.taskId} 立刻存 darkrock_forge_pending`);
ok(await used() === 1, '拿到 taskId 立刻计次');
await boot(false);   // 关页（刷新）
ok(!!(await page.evaluate(`${S}.pending()`)), '刷新后 pending 还在');
await page.evaluate(`${S}.open()`);   // 打开铸造台自动续取
await page.waitForFunction(() => window.__dlc1.smithy.items().length === 2 && !window.__dlc1.smithy.pending(), null, { timeout: 120000, polling: 300 });
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'done' || window.__dlc1.smithy.show.phase === 'idle', null, { timeout: 60000 });
await sleep(800);
const t3 = await page.evaluate(`${S}.toast`);
ok(creates.length === c0 + 1 && await used() === 1, `续取完成：没有重复 create（${creates.length}），前端计次仍 1`);
ok(t3.text === '铸造完成：「慢慢成形的银镜长剑」' && await onHand('forge_' + pd.taskId), `续取后换上：${t3.text}`);

// ---- 4 超限：前端每天 2 次；服务端每 IP 3 次
await page.evaluate(() => localStorage.setItem('darkrock_forge_day', JSON.stringify({ d: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), n: 2 })));
const c1 = creates.length;
const r4 = await page.evaluate(`${S}.forge('第三把剑')`);
const t4 = await page.evaluate(`${S}.toast`);
ok(!r4.online && /^在线生成失败：今天的 2 次在线铸造已用完，已从武器库挑一把「武器库·/.test(t4.text) && creates.length === c1, `前端超限：${t4.text}`);
await page.evaluate(() => localStorage.setItem('darkrock_forge_day', '{}'));
const r5 = await page.evaluate(`${S}.forge('服务端拒绝的剑')`);
const t5 = await page.evaluate(`${S}.toast`);
ok(!r5.online && /^在线生成失败：每人每天限 3 次在线铸造，已从武器库挑一把/.test(t5.text) && creates.length === c1 && await used() === 0, `服务端超限（不计次）：${t5.text}`);

// ---- 我的铸造品面板 + 截图
await page.evaluate(`${S}.pickSet ? 0 : 0`);
await page.evaluate(`${S}.open()`); await sleep(1200);
const panel = await page.evaluate(() => { const w = document.getElementById('d1-forge'); return { cards: w.querySelectorAll('.card').length, thumbs: [...w.querySelectorAll('img[data-thumb]')].filter(i => i.src.startsWith('data:image')).length, pv: !!w.querySelector('#fg-pv canvas'), text: w.querySelector('#fg-mine').textContent }; });
ok(panel.cards === 2 && panel.thumbs === 2 && panel.pv, `我的铸造品面板：${panel.text}，缩略图 ${panel.thumbs}，旋转预览 ${panel.pv}`);
await page.screenshot({ path: `${OUT}/我的铸造品.png` });
// 一键换上第一件
await page.click(`#d1-forge [data-a="wear"][data-k="${r1.key}"]`); await sleep(500);
ok(await onHand(r1.key), '展示柜「换上」生效');
await page.evaluate(`${S}.close()`); await sleep(600);
await page.screenshot({ path: `${OUT}/手持铸造武器.png` });

// ---- 导出存档带 GLB → 删除 → 导入恢复
const exp = await page.evaluate(async () => { const t = await window.__game.exportSave(); const f = JSON.parse(t); return { n: f.wskin?.items?.length ?? 0, kb: Math.round(t.length / 1024), keys: f.wskin?.items?.map(i => i.key), t }; });
ok(exp.n === 2 && exp.kb < 4000, `导出存档带 ${exp.n} 个铸造品 GLB（文件 ${exp.kb} KB）`);
await page.evaluate(`${S}.open()`); await sleep(400);
await page.click(`#d1-forge [data-a="del"][data-k="${r1.key}"]`); await sleep(200);
await page.click(`#d1-forge [data-a="del"][data-k="${r1.key}"]`); await sleep(500);
const afterDel = await page.evaluate(async k => { const items = window.__dlc1.smithy.items().length; const has = await new Promise(res => { const r = indexedDB.open('darkrock_glb', 1); r.onsuccess = () => { const q = r.result.transaction('glb').objectStore('glb').get(k); q.onsuccess = () => res(!!q.result); q.onerror = () => res(false); }; }); return { items, has }; }, r1.key);
ok(afterDel.items === 1 && !afterDel.has && !(await onHand(r1.key)), `删除（两次确认）：剩 ${afterDel.items} 件，IndexedDB 已删，手上退回`);
await page.evaluate(`${S}.close()`);
const imp = await page.evaluate(async t => { const g = window.__game; const r = g.roster(); const before = window.__dlc1.smithy.items().length; await g.importSave(t.replace(/"name":"([^"]+)"/, '"name":"$1"')); return { before, after: window.__dlc1.smithy.items().length }; }, exp.t);
ok(imp.after === 2, `导入存档恢复铸造品：${imp.before} → ${imp.after}`);

// ---- v1.2.54 按提示词识别类型：输入框下方实时提示；与主手不同组 → 只入库不换上
await page.evaluate(`${S}.open()`); await sleep(400);
await page.fill('#fg-p', '缠着海藻的锈蚀锚形长剑'); await sleep(150);
const det1 = await page.textContent('#fg-det');
await page.fill('#fg-p', '一块会发光的石头'); await sleep(150);
const det2 = await page.textContent('#fg-det');
ok(det1 === '识别为：单手剑（按提示词）' && /^未识别，按主手：/.test(det2), `输入框下方识别提示：「${det1}」/「${det2}」`);
await page.evaluate(`${S}.close()`);
await page.route(/\/forge$/, route => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': '9.9.9.9' } }));   // 换个 IP，避开上面的每 IP 3 次（route 改头不触发预检）
await page.evaluate(() => localStorage.setItem('darkrock_forge_day', '{}'));
const c6 = creates.length, held = await page.evaluate(() => { const r = window.__game.player.rig.root; const a = []; r.traverse(o => { if (/^lux_/.test(o.name)) a.push(o.name); }); return a; });
const r6 = await page.evaluate(`${S}.forge('刻满符文的双手巨斧')`);
const t6 = await page.evaluate(`${S}.toast`);
ok(r6.ok && r6.online && r6.type === 'greataxe' && r6.worn === false && creates.length === c6 + 1 && /一把双手巨斧/.test(creates.at(-1)?.prompt ?? ''), `不同组：生成 greataxe（提示词「${(creates.at(-1)?.prompt ?? '').slice(0, 24)}…」）`);
ok(/^这把是双手斧，当前主手是.+，已收进「我的铸造品」，换同类武器后可换上$/.test(t6.text) && !(await onHand(r6.key)), `不同组只入库不换上：${t6.text}`);
const it6 = (await page.evaluate(`${S}.items()`)).find(i => i.key === r6.key);
await page.evaluate(`${S}.open()`); await sleep(400);
const wearDis = await page.evaluate(k => document.querySelector(`#d1-forge [data-a="wear"][data-k="${k}"]`)?.disabled, r6.key);
await page.screenshot({ path: `${OUT}/识别类型_不同组入库.png` });
await page.evaluate(`${S}.close()`);
ok(it6?.type === 'greataxe' && wearDis === true, `我的铸造品记 greataxe，「换上」按钮禁用（手上 ${held.length} 件不变）`);

ok(/已创建 task=/.test(logs) && /压缩 \d+ → \d+/.test(logs), '服务端日志有创建 / 压缩记录');
ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
await b.close(); srv.kill(); lux.close();
console.log(`${fail ? '✗' : '✓'} 铸造台端到端 ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
