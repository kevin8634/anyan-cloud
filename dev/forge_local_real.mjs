// 「启动铸造服务」真实生成验收（**会消耗约 13 积分，只跑 1 次**；用户 2026-10-29 17:38 授权 1 次）
// Key：沙箱网络层对 api.aholo3d.cn 注入真实 Key（覆盖 Authorization 头），铸造台里只填占位符，脚本与日志不接触真实 Key。
// 流程：启动 Linux 版本机铸造服务 → 无头 Chromium 打开 http://127.0.0.1:端口/ → 评委体验 → 铸造台填 Key → 测试 Key（绿）→ 输入提示词铸造
//       → 等待完成 → 自动取回 → 成形演出 → 进「我的铸造品」并装备。只允许 1 次 task/create，失败不重试。
// 用法：node dev/forge_local_real.mjs [html] [启动程序] [输出目录]
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const HTML = path.resolve(process.argv[2] || 'web/index_dlc1_比赛版.html');
const BIN = path.resolve(process.argv[3] || '/workspace/work/forge_local_bin/启动铸造服务_linux_arm64');
const OUT = process.argv[4] || '/workspace/work/diag/uifix'; fs.mkdirSync(OUT, { recursive: true });
const PORT = 18863, PROMPT = '缠着海藻的锈蚀锚形长剑';
const LOCK = path.join(OUT, 'real_LOCK');
if (fs.existsSync(LOCK)) { console.log('已经跑过一次真实生成（real_LOCK 存在），不再重复'); process.exit(2); }
const KEEP = new Set(['real_tool_1_started', 'real_2_key_green', 'real_4_brewing', 'real_5_reveal', 'real_7_in_mine', 'real_tool_5_done']);   // 用户 18:54：只留关键帧
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LUX = 'https://api.aholo3d.cn';
const list = async () => { try { return JSON.parse(execFileSync('curl', ['-s', '-m', '30', '-H', 'Authorization: vault-injected', LUX + '/lux3d/v1/generate/task/list?page=1&pageSize=5'], { encoding: 'utf8' })).d?.items ?? []; } catch (e) { console.log('task/list 失败', e.message); return []; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'judgepkg-')), home = fs.mkdtempSync(path.join(os.tmpdir(), 'forgehome-'));
fs.symlinkSync(HTML, path.join(dir, '暗岩传说_深渊回响_评委版.html'));
if (fs.existsSync(path.join(path.dirname(HTML), 'music'))) fs.symlinkSync(path.join(path.dirname(HTML), 'music'), path.join(dir, 'music'));
const before = await list(); const top0 = before[0]?.taskId;
console.log('生成前最新任务', top0);
let out = '';
// 「自动打开浏览器」：沙箱没有桌面浏览器，放一个假的 xdg-open 记录程序要打开的地址，再用无头 Chromium 打开同一地址
const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'xdg-')), opened = path.join(fakeBin, 'opened.txt');
fs.writeFileSync(path.join(fakeBin, 'xdg-open'), `#!/bin/sh\necho "$1" >> ${opened}\n`, { mode: 0o755 });
const srv = spawn(BIN, [], { cwd: dir, env: { ...process.env, PATH: fakeBin + ':' + process.env.PATH, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', FORGE_HOME: home, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
for (let k = 0; k < 100 && !/READY/.test(out); k++) await sleep(100);
ok(/READY/.test(out), `启动铸造服务（${path.basename(BIN)}）监听 127.0.0.1:${PORT}`);
await sleep(1500);
const openedUrl = fs.existsSync(opened) ? fs.readFileSync(opened, 'utf8').trim() : '';
ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(openedUrl) && out.includes(openedUrl), `程序自动打开浏览器地址：${openedUrl}`);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(1500000);
const direct = []; await page.route('https://api.aholo3d.cn/**', r => { direct.push(r.request().url()); r.abort('failed'); });   // 浏览器不许直连
const forgeReq = []; page.on('request', r => { if (/127\.0\.0\.1:\d+\/forge$/.test(r.url()) && r.method() === 'POST' && !r.url().includes('/key')) forgeReq.push(r.url()); });
// 控制台窗口截图（把程序输出渲染成终端样式图片）
const shot = async n => { if (!KEEP.has(n)) return; try { await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }); } catch (e) { console.log('截图失败（不影响流程）', n, e.message.split('\n')[0]); } };
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tool = await b.newPage({ viewport: { width: 980, height: 560 } });
async function toolShot(name, title) {
  const txt = out.replace(/\x1b\[[0-9;]*m/g, '');
  ok(!txt.includes('vault-injected-key') && !/KkrR/.test(txt), `控制台截图 ${name}：没有 Key 原文`);
  await tool.setContent(`<html><body style="margin:0;background:#1b1b1b;font-family:'Noto Sans Mono CJK SC','Noto Sans CJK SC',monospace"><div style="background:#2d2d2d;color:#ddd;padding:6px 12px;font:13px sans-serif">▣ 启动铸造服务（${esc(path.basename(BIN))}）— ${esc(title)}</div><pre style="margin:0;padding:12px 14px;color:#e8e8e8;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(txt.split('\n').slice(-26).join('\n'))}</pre></body></html>`);
  if (!KEEP.has('real_tool_' + name)) return;
  try { await tool.screenshot({ path: `${OUT}/real_tool_${name}.png`, timeout: 120000 }); } catch (e) { console.log('控制台截图失败（不影响流程）', name); }
}
await toolShot('1_started', '刚启动');
await page.goto(openedUrl || `http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 1500000, polling: 2000 });
console.log('title ready', new Date().toISOString());
await page.evaluate(() => document.getElementById('demo-enter').click());
await page.waitForTimeout(15000);
const rect = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
const click = async sel => { const r = await rect(sel); await page.mouse.click(r.x + Math.min(10, r.w / 2), r.y + Math.min(8, r.h / 2)); };
const msg = () => page.evaluate(() => { const e = document.querySelector('#d1-forge .msg'); return { t: e?.textContent ?? '', c: e?.className ?? '', col: e ? getComputedStyle(e).color : '' }; });
// 1 打开铸造台
await click('#d1-judge .go[data-j="0"]');
await page.waitForFunction(() => document.getElementById('fg-mode')?.textContent.includes('本机铸造服务'), null, { timeout: 120000, polling: 500 }).catch(() => {});
const m0 = await page.evaluate(() => ({ mode: window.__dlc1.smithy.mode(), label: document.getElementById('fg-mode')?.textContent }));
ok(m0.mode === 'server' && m0.label.includes('本机铸造服务'), `铸造台：${m0.label}`);
await shot('real_1_smithy_open');
// 2 填 Key（占位符；真实 Key 由网络层注入）→ 保存并测试 → 绿
await page.evaluate(() => { const d = document.getElementById('fg-lkbox'); if (d) d.open = true; });
await click('#fg-lkey'); await page.keyboard.type('vault-injected-key');
await click('#d1-forge [data-a="lkey"]');
await page.waitForFunction(() => { const t = document.querySelector('#d1-forge .msg')?.textContent ?? ''; return t && !/正在/.test(t); }, null, { timeout: 180000, polling: 500 });
let m = await msg(); console.log('保存并测试', JSON.stringify(m));
ok(m.c.includes('ok') && /Key 正确/.test(m.t), `测试 Key → 绿色（${m.col}）`);
await shot('real_2_key_green');
await toolShot('3_key_tested', 'Key 测试通过后');
if (!m.c.includes('ok')) { console.log('Key 测试没通过，停止（没有发起生成）'); await b.close(); srv.kill(); process.exit(1); }
// 3 输入提示词 → 铸造（唯一一次）
fs.writeFileSync(LOCK, new Date().toISOString());
await page.evaluate(p => { document.getElementById('fg-p').value = p; }, PROMPT);
await shot('real_3_prompt');
const t0 = Date.now();
await click('#d1-forge [data-a="go"]');
// 熔炉演出过程截图
let shotBrew = false, shotReveal = false;
for (let k = 0; k < 900; k++) {
  const st = await page.evaluate(() => ({ toast: window.__dlc1.smithy.toast.text, phase: window.__dlc1.smithy.show.phase, prog: window.__dlc1.smithy.progress.slice(-1)[0] ?? '' }));
  if (!shotBrew && Date.now() - t0 > 20000) { await shot('real_4_brewing'); await toolShot('4_generating', '生成中'); shotBrew = true; console.log('进度', st.prog); }
  if (!shotReveal && st.phase === 'reveal') { await page.waitForTimeout(1500); await shot('real_5_reveal'); shotReveal = true; }
  if (/铸造完成|在线生成失败/.test(st.toast)) break;
  if (k % 15 === 0) console.log(`${Math.round((Date.now() - t0) / 1000)}s`, st.phase, st.prog);
  await sleep(2000);
}
const sec = Math.round((Date.now() - t0) / 1000);
const toast = await page.evaluate(() => window.__dlc1.smithy.toast.text); console.log('结果', toast, `${sec}s`);
if (!shotReveal) await shot('real_5_reveal');
await page.waitForTimeout(3000);
await shot('real_6_equipped');
await toolShot('5_done', '生成完成、已取回');
ok(/铸造完成/.test(toast), `在线生成 + 自动取回：${toast}（${sec} 秒）`);
ok(forgeReq.length === 1, `页面只发了 ${forgeReq.length} 次 POST /forge`);
const it = await page.evaluate(() => { const its = window.__dlc1.smithy.items(); const l = its.filter(i => i.taskId).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0]; return { l, pending: window.__dlc1.smithy.pending() }; });
console.log('铸造品', JSON.stringify(it));
ok(!!it.l && !it.pending, `进「我的铸造品」：${it.l?.name} · 任务 ${it.l?.taskId} · ${(it.l?.size / 1048576).toFixed(2)} MB`);
await page.evaluate(() => window.__dlc1.smithy.open()); await page.waitForTimeout(2000);
const on = await page.evaluate(k => !!document.querySelector(`#d1-forge .card.on[data-k="${k}"]`), it.l ? `forge_${it.l.taskId}` : '');
ok(on, '「我的铸造品」里标为已装备');
await rect('#fg-mine');
await shot('real_7_in_mine');
await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
await shot('real_8_hero');
const after = await list(); const news = top0 == null ? [] : after.filter(x => x.taskId > top0);
console.log('生成后新任务', JSON.stringify(news));
ok(news.length === 1, `Aholo 账户新增任务 ${news.length} 个（只允许 1 次 create）`);
ok(direct.length === 0, `浏览器没有直连 api.aholo3d.cn（${direct.length}）`);
ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
console.log('--- 服务窗口输出 ---\n' + out.split('\n').filter(l => !/vault-injected/.test(l)).slice(-12).join('\n'));
const res = { taskId: news[0]?.taskId ?? it.l?.taskId, consumedCredits: news[0]?.consumedCredits, status: news[0]?.status, seconds: sec, glbBytes: it.l?.size, name: it.l?.name };
fs.writeFileSync(path.join(OUT, 'real_result.json'), JSON.stringify(res, null, 2));
console.log('RESULT', JSON.stringify(res));
await b.close(); srv.kill();
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
