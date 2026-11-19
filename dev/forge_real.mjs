// v1.2.46 铸造台「游戏内真实生成」录像（会花约 13 积分：只触发 1 次 Lux3D create）
// 本地 server.js（新版 forge/）直连 https://api.aholo3d.cn（DAILY_LIMIT=1 / PER_IP_LIMIT=1 保证本进程最多创建 1 次）
// 录像：页面右上角叠加北京时间时钟；从打开铸造台 → 输入描述 → 点「铸造」→ 熔炉演出 → 飞入主手 → 角色手持新剑 → 打开「我的铸造品」
// 出错不重试 create：有 taskId 就靠铸造台的断点续取（重新打开面板自动续取）
// 用法：NODE_USE_ENV_PROXY=1 node dev/forge_real.mjs <输出目录>
// 续取（零积分，不调用 create）：RESUME_TASK=<taskId> RESUME_T=<点击铸造时的毫秒时间戳> node dev/forge_real.mjs <输出目录>
//   → 把 taskId 写进 darkrock_forge_pending（等同关页前铸造台记下的任务），打开铸造台自动续取
import { spawn } from 'child_process';
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = resolve(process.argv[2] || '/workspace/work/forge_test/shots'); mkdirSync(OUT, { recursive: true });
const HTML = ROOT + 'web/index_dlc1_比赛版.html';
const PROMPT = '黑曜石与银镜片拼成的细长水晶长剑，剑身内部有紫色光苔，镜面反光';
const GLB_DIR = '/workspace/work/forge_test/real_glb'; mkdirSync(GLB_DIR, { recursive: true });
const LOG = OUT + '/server_real.log', EV = OUT + '/real_events.log';
rmSync(EV, { force: true });
const bj = (t = Date.now()) => new Date(t + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + ' CST';
const ev = m => { const l = `${bj()} ${m}`; console.log(l); appendFileSync(EV, l + '\n'); };
const PORT = 18860;
const srv = spawn(process.execPath, [ROOT + 'deploy/modelscope/server.js'], { env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1', PORT: String(PORT), PAGE_FILE: ROOT + 'test/fixtures/blank.html', FORGE_MODULE: ROOT + 'cloud/forge-fc/index.js', AHOLO_API_KEY: process.env.AHOLO_API_KEY || 'placeholder-proxy-injects', DAILY_LIMIT: '1', PER_IP_LIMIT: '1', GLB_DIR, STATE_FILE: GLB_DIR + '/state.json', KEEP_RAW: '1', POLL_MS: '3000' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => appendFileSync(LOG, d)); srv.stderr.on('data', d => appendFileSync(LOG, d));
await new Promise(r => { const f = d => { if (/\[server\]/.test(d)) { srv.stdout.off('data', f); r(); } }; srv.stdout.on('data', f); });
const API = `http://127.0.0.1:${PORT}`;
ev(`server 已启动 ${API}，health=${await (await fetch(API + '/health')).text()}`);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const vctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT + '/_video', size: { width: 1280, height: 720 } } });
await vctx.addInitScript(() => {   // 右上角北京时间时钟（精确到秒）
  const mk = () => { if (!document.body || document.getElementById('bj-clock')) return; const d = document.createElement('div'); d.id = 'bj-clock';
    d.style.cssText = 'position:fixed;top:4px;right:4px;z-index:2147483647;background:rgba(0,0,0,.78);color:#7fffb0;font:700 18px/1.3 monospace;padding:4px 10px;border:1px solid #7fffb0;border-radius:6px;pointer-events:none';
    document.body.appendChild(d); const f = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const tick = () => { d.textContent = '北京时间 ' + f.format(new Date()).replace(/\//g, '-'); }; tick(); setInterval(tick, 200); };
  document.addEventListener('DOMContentLoaded', mk); setInterval(mk, 1000);
});
const page = await vctx.newPage(); const tVideo0 = Date.now();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + HTML, { timeout: 240000 });
await page.evaluate(a => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); localStorage.setItem('darkrock_forge_api', a); }, API);
await page.reload({ timeout: 240000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(22000);   // 等开局出生光效散掉
await page.evaluate(() => window.__game.tutFinish?.());
const mt = await page.evaluate(() => window.__game.player.rig.root.userData.weaponType);
ev(`战士主手 weaponType=${mt}`);
if (mt !== 'sword') { ev('主手不是 sword，停止（没有调用 create）'); process.exit(2); }

// ---- 录像正片：打开铸造台
const RESUME = process.env.RESUME_TASK;
let tOpen, tClick;
if (RESUME) {
  await page.evaluate(o => localStorage.setItem('darkrock_forge_pending', JSON.stringify(o)), { taskId: RESUME, prompt: PROMPT, type: 'sword', api: API, t: Number(process.env.RESUME_T || Date.now()) });
  ev(`续取模式：pending taskId=${RESUME}（不调用 create）`);
  tOpen = tClick = Date.now();
  await page.evaluate(() => window.__dlc1.smithy.open());
  ev('打开铸造台（自动续取）');
} else {
  tOpen = Date.now();
  await page.evaluate(() => window.__dlc1.smithy.open());
  ev('打开铸造台');
  await page.waitForTimeout(1500);
  await page.click('#fg-p'); await page.type('#fg-p', PROMPT, { delay: 90 });
  await page.waitForTimeout(1200);
  tClick = Date.now();
  await page.click('#d1-forge [data-a="go"]');
  ev(`点击「铸造」（北京时间 ${bj(tClick)}）`);
}
await page.waitForFunction(() => !!window.__dlc1.smithy.pending() || window.__dlc1.smithy.toast.text, null, { timeout: 60000, polling: 200 });
const pd = await page.evaluate(() => window.__dlc1.smithy.pending());
ev(`taskId=${pd?.taskId ?? '（没拿到）'}`);
let st = '';
const t0 = Date.now();
while (Date.now() - t0 < 12 * 60e3) {   // 等演出结束（成形 → 飞入主手）
  const s = await page.evaluate(() => ({ ph: window.__dlc1.smithy.show.phase, toast: window.__dlc1.smithy.toast.text, cap: document.querySelector('#d1-forgeshow div:last-child')?.textContent ?? '' }));
  if (s.cap && s.cap !== st) { st = s.cap; ev(`演出：${st}`); }
  if (s.toast && (s.ph === 'done' || s.ph === 'idle')) break;
  await page.waitForTimeout(1000);
}
let toast = await page.evaluate(() => window.__dlc1.smithy.toast.text);
ev(`结果提示：${toast}`);
if (!/^铸造完成/.test(toast) && await page.evaluate(() => !!window.__dlc1.smithy.pending())) {   // 任务还在（断网 / 超时）→ 续取，不重新 create
  ev('任务保留，重新打开铸造台续取（不调用 create）');
  await page.evaluate(() => { window.__dlc1.smithy.toast.text = ''; window.__dlc1.smithy.open(); });
  await page.waitForFunction(() => window.__dlc1.smithy.toast.text && !window.__dlc1.smithy.pending() && ['done', 'idle'].includes(window.__dlc1.smithy.show.phase), null, { timeout: 10 * 60e3, polling: 1000 });
  toast = await page.evaluate(() => window.__dlc1.smithy.toast.text); ev(`续取结果：${toast}`);
}
await page.waitForTimeout(2500);
const items = await page.evaluate(() => window.__dlc1.smithy.items());
const key = items[0]?.key;
const onHand = key && await page.evaluate(k => { let f = false; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) f = true; }); return f; }, key);
ev(`我的铸造品 ${items.length} 件；主手 ${onHand ? '已换上 ' + key : '没有换上'}`);
// ---- 角色手持新剑：长焦近景
await page.evaluate(() => { const g = window.__game; g.camSet(3.2, 0.18); g.player.rig.root.rotation.y = 0.9; });
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + '/手持新剑_真实生成.png' });
await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 2.6; });
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.camSet(11, 0.55); });
// ---- 打开「我的铸造品」
await page.evaluate(() => window.__dlc1.smithy.open());
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('fg-mine')?.scrollIntoView());
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + '/我的铸造品_真实生成.png' });
const tEnd = Date.now();
ev('录像结束');
writeFileSync(OUT + '/_video_times.json', JSON.stringify({ tVideo0, tOpen, tClick, tEnd, taskId: pd?.taskId, toast, key, errors: errors.slice(0, 5) }));
const video = page.video(); await vctx.close(); const vp = await video.path();
ev(`原始录像 ${vp}，页面错误 ${errors.length}`);
writeFileSync(OUT + '/_video_times.json', JSON.stringify({ tVideo0, tOpen, tClick, tEnd, taskId: pd?.taskId, toast, key, vp, errors: errors.slice(0, 5) }));
await b.close();
ev(`health=${await (await fetch(API + '/health')).text()}`);
srv.kill();
process.exit(0);
