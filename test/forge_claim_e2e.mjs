// v1.2.47 铸造台「定时领取」浏览器端到端（零积分）：假 Lux3D + 真实 server.js（FORGE_CLAIM=1）+ 比赛版 DLC 页面
// 覆盖：提交后不演出、显示倒计时；离开（刷新、甚至本地 pending 丢失）后回来打开铸造台 → 到点自动领取、播成形画面、换上；
//   老页面（没带设备 ID）铸的任务同 IP 自动认领；领取后服务端不再列出；铸造者写进外观元数据、武器提示多一行「外观 · 铸造者」；
//   页面版本不符时判定需要刷新。全程玩家不需要手动粘贴任何东西。
// 用法：node test/forge_claim_e2e.mjs [html]
import http from 'http';
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const HTML = resolve(process.argv[2] || ROOT + 'web/index_dlc1_比赛版.html');
const OUT = '/tmp/forge_claim_shots'; mkdirSync(OUT, { recursive: true });
const GLB = readFileSync(ROOT + 'test/fixtures/lux3d_4390018.glb');
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const creates = []; let nextId = 8100; const tk = {};
const lux = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  if (q.url.startsWith('/lux3d') && q.headers.authorization !== 'E2EKEY') { s.writeHead(401); return s.end('{}'); }
  if (q.url.includes('/task/create')) { const body = JSON.parse(b); creates.push(body); const id = nextId++; tk[id] = { left: 5 }; return s.end(JSON.stringify({ c: '0', d: id })); }
  if (q.url.includes('/task/get')) { const id = +new URL(q.url, 'http://x').searchParams.get('taskid'), t = tk[id];
    if (!t) return s.end(JSON.stringify({ d: { status: 4 } }));
    if (t.left-- > 0) return s.end(JSON.stringify({ c: '0', d: { status: 1 } }));
    return s.end(JSON.stringify({ c: '0', d: { status: 3, outputs: [{ content: `http://127.0.0.1:${lux.address().port}/r/${id}/tex_mesh.glb` }] } })); }
  if (q.url.startsWith('/r/')) { s.writeHead(200); return s.end(GLB); }
  s.writeHead(404); s.end('{}');
}); });
await new Promise(r => lux.listen(0, r));
const DIR = '/tmp/forge_claim_e2e'; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
writeFileSync(DIR + '/p.html', '<html><head></head><body></body></html>');
const PORT = 19000 + Math.floor(Math.random() * 900);
let logs = '';
const ETA = 20;
const srv = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, PORT: String(PORT), PAGE_FILE: DIR + '/p.html', PAGE_VERSION: 'v0.0.1', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: 'E2EKEY', AHOLO_API_BASE: `http://127.0.0.1:${lux.address().port}`, POLL_MS: '100', DAILY_LIMIT: '5', PER_IP_LIMIT: '3', GLB_DIR: DIR + '/glb', FORGE_CLAIM: '1', CLAIM_ETA_S: String(ETA) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise(r => { srv.stdout.on('data', d => { logs += d; if (/\[server\]/.test(d)) r(); }); srv.stderr.on('data', d => { logs += d; }); });
const API = `http://127.0.0.1:${PORT}`;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/GLTFLoader: Couldn't load texture blob/.test(m.text())) errors.push('console: ' + m.text()); });
const S = 'window.__dlc1.smithy';
async function boot(first) {
  if (first) { await page.goto('file://' + HTML, { timeout: 180000 }); await page.evaluate(a => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' })); localStorage.setItem('darkrock_forge_api', a); }, API); }
  await page.reload({ timeout: 180000 });
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 180000 });
  await page.evaluate(() => window.__game.startGame('mage'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__game.tutFinish?.(); const s = window.__dlc1.smithy; s.show.speed = 6; s.cfg.chunk = 300000; s.cfg.pollMs = 500; });
}
const onHand = k => page.evaluate(k => { let f = false; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) f = true; }); return f; }, k);
const panelText = () => page.evaluate(() => document.getElementById('d1-forge')?.textContent ?? '');
await boot(true);
// 主手拿一把法杖（铸造品换上 + 提示行要用）
const eq = await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 300; i++) { const it = g.gen.generate(1, 'blue', ['twoHand']); if (it.weaponType === 'staff') { const why = g.inventory.whyCannotEquip(it); const added = g.inventory.add(it); const b = g.inventory.bag[g.inventory.bag.length - 1]; const r = g.inventory.equip(b.id); g.syncCharacter?.(); g.refreshGear?.(true); g.save?.(); return r ? it.name : `（${why} add=${added} err=${g.inventory.lastError} bag=${g.inventory.bag.length}）`; } } return ''; });
ok(!!eq && !eq.startsWith('（'), `主手装上法杖：${eq}`);

ok(await page.evaluate(`${S}.checkVersion(true)`) === 'reload', '页面版本与服务端（v0.0.1）不符 → 判定需要自动刷新');
await page.evaluate(`${S}.open()`);
await page.waitForFunction(() => window.__dlc1.smithy.claimCfg.known, null, { timeout: 10000 });
await sleep(400);
ok(/锻造约 20 秒，提交后可离开，到点回来领取/.test(await panelText()), '面板写明定时领取（锻造时长、可以离开）');
await page.evaluate(`${S}.close()`);

// ---- 1 提交：不演出、不等待，倒计时
const t0 = Date.now();
const r1 = await page.evaluate(`${S}.forge('暗岩紫晶长法杖，铜爪托着紫晶的长法杖')`);   // v1.2.55 按提示词识别类型后（v1.2.54），「…水晶球」会识别成宝珠只入库不换上 → 提示词以法杖结尾
ok(r1.queued && r1.online && r1.taskId && Date.now() - t0 < 5000, `提交秒回：${r1.msg}`);
ok(await page.evaluate(`${S}.show.phase`) === 'idle', '提交时不播熔炉演出');
ok(/^炉火锻造中：「暗岩紫晶长法杖，[^」]*」约 \d+ 秒 后可以来领取/.test((await page.evaluate(`${S}.toast`)).text), '提示「炉火锻造中 · 多久后可以来领取」');
await page.evaluate(`${S}.open()`); await sleep(1500);
const cd = await page.evaluate(() => document.querySelector('#d1-forge .fg-task')?.textContent ?? '');
ok(/炉火锻造中 · \d+ 秒 后可以领取/.test(cd) && /炉里还有一把/.test(await panelText()), `面板倒计时：${cd.replace(/\s+/g, ' ').slice(0, 60)}`);
await page.screenshot({ path: `${OUT}/倒计时.png` });
await page.evaluate(`${S}.close()`);

// ---- 2 离开：刷新页面，并且把本地 pending 删掉（模拟旧页面 / 清缓存）→ 回来全靠服务端按设备认领
if (process.env.CLAIM_DEBUG) console.log('M close', new Date().toISOString(), 'items', await page.evaluate(`${S}.items().length`));
await boot(false);
if (process.env.CLAIM_DEBUG) console.log('M booted', new Date().toISOString(), 'items', await page.evaluate(`${S}.items().length`), await page.evaluate(`JSON.stringify(${S}.forging())`));
await page.evaluate(() => localStorage.removeItem('darkrock_forge_pending'));
const wait = ETA * 1000 - (Date.now() - t0) + 500; if (wait > 0) await sleep(wait);
ok(creates.length === 1, 'Lux3D 只 create 了 1 次');
await page.evaluate(`${S}.open()`);
if (process.env.CLAIM_DEBUG) console.log('M open', new Date().toISOString());
if (process.env.CLAIM_DEBUG) for (let k = 0; k < 3; k++) { await sleep(1500); console.log('T', k, JSON.stringify(await page.evaluate(() => { const s = window.__dlc1.smithy; return { ph: s.show.phase, t: s.toast.text, items: s.items().length, f: s.forging().map(x => x.state + '/' + (x.ready - Date.now())), msg: document.querySelector('#d1-forge .msg')?.textContent, show: !!document.getElementById('d1-forgeshow') }; }))); }
await page.waitForFunction(() => /^铸造完成/.test(window.__dlc1.smithy.toast.text), null, { timeout: 90000, polling: 300 }).catch(async e => { console.log('ERRS', errors.join(' | ')); console.log('DEBUG', JSON.stringify(await page.evaluate(() => { const s = window.__dlc1.smithy; return { errs: [], phase: s.show.phase, onHand: document.title, toast: s.toast, forging: s.forging(), pend: s.pending(), cfg: s.claimCfg, panel: document.getElementById('d1-forge')?.textContent }; }))); console.log(logs.slice(-1500)); throw e; });
await sleep(800);
const t2 = await page.evaluate(`${S}.toast`);
const hand1 = await page.waitForFunction(k => { let f = false; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) f = true; }); return f; }, 'forge_' + r1.taskId, { timeout: 15000 }).then(() => true, () => false);
ok(/^铸造完成：「暗岩紫晶长法杖/.test(t2.text) && hand1, `回来自动领取 → 成形画面 → 换上：${t2.text}`);
ok(/已领取/.test(logs) && (await (await fetch(`${API}/forge/mine?dev=${await page.evaluate(`${S}.devId()`)}`)).json()).tasks.length === 0, '服务端标记已领取，不再列出');
ok(creates.length === 1, '领取不重复 create');

// ---- 3 铸造者 + 武器提示行
const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('darkrock_wskin_meta') || '{}'));
const m = meta['forge_' + r1.taskId] || {};
const charName = await page.evaluate(() => window.__game.curChar?.name ?? '');
ok(m.author && m.author === charName, `外观元数据记下铸造者：${m.author}`);
const tip = await page.evaluate(() => { const g = window.__game; const it = g.inventory?.equipped?.mainHand; return it ? g.itemTip(it, true) : ''; });
ok(tip.includes(`✦ 外观：${m.name} · 铸造者：${charName}`) && /^暗岩紫晶长法杖/.test(m.name), `武器提示名字下多一行：${(/✦ 外观：[^<]+/.exec(tip) || [''])[0]}`);
const tipIdx = tip.indexOf('tt-skin'), subIdx = tip.indexOf('tt-sub');
ok(tipIdx > subIdx && subIdx > 0, '这一行紧跟在名字 / 类型行下面');

// ---- 4 老页面（没带设备 ID）铸的任务：同 IP 打开新页面自动认领
const old = await (await fetch(`${API}/forge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: '老页面铸的法杖', weaponType: 'staff' }) })).json();
ok(!!old.taskId, `老页面提交 task=${old.taskId}`);
await page.evaluate(`${S}.close()`); await sleep(ETA * 1000 + 800);
await page.evaluate(`${S}.open()`);
await page.evaluate(() => { window.__dlc1.smithy.toast.text = ''; });
await page.waitForFunction(() => window.__dlc1.smithy.items().length === 2 && /^铸造完成/.test(window.__dlc1.smithy.toast.text), null, { timeout: 90000, polling: 300 }).catch(async e => { console.log('ERRS', errors.join(' | ')); console.log('DEBUG', JSON.stringify(await page.evaluate(() => { const s = window.__dlc1.smithy; return { errs: [], phase: s.show.phase, onHand: document.title, toast: s.toast, forging: s.forging(), pend: s.pending(), cfg: s.claimCfg, panel: document.getElementById('d1-forge')?.textContent }; }))); console.log(logs.slice(-1500)); throw e; });
await sleep(800);
ok(await onHand('forge_' + old.taskId), '老页面的任务同 IP 自动认领并换上，不需要粘贴任何东西');
await page.evaluate(`${S}.open()`); await sleep(800);
await page.screenshot({ path: `${OUT}/领取后.png` });

ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
await b.close(); srv.kill(); lux.close();
console.log(`${fail ? '✗' : '✓'} 铸造台定时领取端到端 ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
