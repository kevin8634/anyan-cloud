// v1.2.73 铸造 CG 接入 e2e（无头 Chromium + 假 Lux3D fetcher，不联网、不扣分）
//   A ①→③（秒回） B ①→②→③（慢回，② 至少循环一次） C 超时 → ④ 熄炉 → ③（武器库预制武器）
//   D 续传：C 保留的任务再铸造 → 从 ② 开始 → ③  E 视频不可用 → 退回熔岩 brew，铸造照常完成
// 用法：node dev/forgecg_e2e.mjs [web/index_dlc1_比赛版.html] [截图目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync, mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/forgecg'; mkdirSync(OUT, { recursive: true });
const GLB = readFileSync('assets_aholo/props/weapon_bell_sword.glb').toString('base64');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(600000); page.setDefaultNavigationTimeout(600000);
await page.goto('file://' + HTML + '?forge=http://fake.forge', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' })); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => window.__game.tutFinish?.());
await page.waitForTimeout(800);
await page.evaluate((glb) => {
  const S = window.__dlc1.smithy; S.cfg.dailyOnline = 99; S.claimCfg.known = true; S.claimCfg.claim = false;
  const bin = Uint8Array.from(atob(glb), c => c.charCodeAt(0));
  window.__fk = { readyAt: 0, n: 0 };
  window.__fake = async (url, init) => {
    const u = String(url), J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (init?.method === 'POST' && u.endsWith('/forge')) return J({ taskId: 'cg' + (++window.__fk.n) });
    if (u.includes('/forge/status/')) return Date.now() >= window.__fk.readyAt ? J({ state: 'done', url: '/f/' + u.split('/').pop() + '.glb' }) : J({ state: 'generating', elapsed: 3 });
    if (u.includes('/f/')) return new Response(bin, { status: 200, headers: { 'Content-Length': String(bin.length) } });
    return J({ error: 'x' }, 404);
  };
}, GLB);
const run = (label, readyIn, prompt, pre = '') => page.evaluate(async ([readyIn, prompt, pre]) => {
  if (pre) eval(pre);
  window.__fk.readyAt = readyIn < 0 ? Infinity : Date.now() + readyIn;
  const S = window.__dlc1.smithy; S.show.speed = 3;
  const r = await S.forge(prompt, window.__fake);
  return { ok: r.ok, online: r.online, why: r.why ?? '', path: [...S.cg.path], phase: S.cg.phase, cgWhy: S.cg.why, loops: S.cg.loops, pending: !!S.pending() };
}, [readyIn, prompt, pre]);
const shot = async (n, cond) => { try { await page.waitForFunction(cond, null, { timeout: 300000, polling: 100 }); await page.screenshot({ path: `${OUT}/${n}.png` }); } catch (e) { console.log('shot', n, e.message.split('\n')[0]); } };

// A 秒回
let pa = run('A', 0, '沉在海底的钟铜长剑');
await shot('A1_drop', () => window.__dlc1.smithy.cg.phase === 'drop');
await shot('A2_rise', () => window.__dlc1.smithy.cg.phase === 'rise');
await shot('A3_reveal_overlay', () => window.__dlc1.smithy.show.phase === 'reveal' && window.__dlc1.smithy.show.cut > 0.4);
let r = await pa; console.log('A', JSON.stringify(r));
ok(r.ok && r.online && r.path.join() === 'f1_drop,f3_rise', `A ①→③ ${r.path}`);
// B 慢回（① 5 秒播完结果还没到 → ② 循环）
pa = run('B', 9000, '冷青色符文长剑');
await shot('B1_loop', () => window.__dlc1.smithy.cg.phase === 'loop');
r = await pa; console.log('B', JSON.stringify(r));
ok(r.ok && r.online && r.path.join() === 'f1_drop,f2_loop,f3_rise', `B ①→②→③ ${r.path} 循环 ${r.loops}`);
// C 超时 → ④ → ③（武器库），任务保留
pa = run('C', -1, '锈蚀的锚形长剑', 'window.__dlc1.smithy.cfg.timeoutMs = 9000');
await shot('C1_fail', () => window.__dlc1.smithy.cg.phase === 'fail');
r = await pa; console.log('C', JSON.stringify(r));
ok(r.ok && !r.online && r.path.join() === 'f1_drop,f2_loop,f4_fail,f3_rise' && r.pending, `C 超时 ④→③ ${r.path} 保留任务 ${r.pending}`);
// D 续传：从 ②
r = await run('D', 3000, '锈蚀的锚形长剑', 'window.__dlc1.smithy.cfg.timeoutMs = 480000');
console.log('D', JSON.stringify(r));
ok(r.ok && r.online && r.path[0] === 'f2_loop' && r.path.join() === 'f2_loop,f3_rise' && !r.pending, `D 续传从 ② ${r.path}`);
// E 视频不可用 → brew
r = await run('E', 0, '黑铁短剑', "window.__forgeCgSrc = { f1_drop: 'data:video/webm;base64,AAAA', f2_loop: 'data:video/webm;base64,AAAA', f3_rise: 'data:video/webm;base64,AAAA', f4_fail: 'data:video/webm;base64,AAAA' }");
console.log('E', JSON.stringify(r));
ok(r.ok && r.phase === 'off' && !!r.cgWhy, `E 视频不可用退回 brew（${r.cgWhy}），铸造照常完成`);
ok(!errors.length, `页面无报错 ${errors.slice(0, 3).join(' | ')}`);
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
await b.close(); process.exit(fail ? 1 : 0);
