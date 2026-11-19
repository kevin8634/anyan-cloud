// v1.2.54 评委体验 UI 修复验证：铸造台不会因鼠标移动 / 点遮罩 / 输入关闭；Key 测试跨域提示 + 颜色；直连铸造前先测 Key；
// 评委面板默认位置、拖动（鼠标 + 触屏）、收起后小按钮、重新打开
// 用法：node dev/uifix_shot.mjs [html] [输出目录]   （Lux3D 接口全部用 page.route 拦截，不会真实请求 api.aholo3d.cn）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/diag/uifix'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(1500000);
// 拦截 Lux3D：mode = abort（模拟浏览器跨域拦截 → TypeError）/ ok（列表正常）
let luxMode = 'abort'; const luxReq = [];
await page.route('https://api.aholo3d.cn/**', route => {
  const u = route.request().url(); luxReq.push(route.request().method() + ' ' + u.replace('https://api.aholo3d.cn', ''));
  if (luxMode === 'abort') return route.abort('failed');
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (u.includes('/task/list')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ c: '0', d: { total: 7, list: [] } }) });
  return route.abort('failed');
});
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: 'new' })); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 1500000, polling: 2000 });
console.log('title ready', new Date().toISOString());
await page.evaluate(() => document.getElementById('demo-enter').click());
await page.waitForTimeout(15000);
const rect = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' }; }, sel);
const inter = (a, c) => a && c && a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
// ---------------- 评委面板默认位置
const J = await rect('#d1-judge'), MM = await rect('#minimap'), SB = await rect('#skillbar'), PF = await rect('#player-frame'), QT = await rect('#quest-tracker'), TB = await rect('#topbtns'), HP = await rect('#hp-orb') ?? await rect('#orbs');
console.log('rects', JSON.stringify({ J, MM, SB, PF, QT, TB, HP }));
ok(!!J && !inter(J, PF) && !(QT && QT.h > 0 && inter(J, QT)), '评委面板不压头像框 / 玩法介绍（任务追踪）');
ok(!!J && !inter(J, TB), '评委面板不压右上 背包/地图/菜单/设置 按钮');
ok(!!J && !inter(J, MM), `评委面板不压小地图（面板 ${JSON.stringify(J)} · 小地图 ${JSON.stringify(MM)}）`);
ok(!!J && !inter(J, SB), '评委面板不压技能栏');
ok(!!J && J.x >= 0 && J.r <= 1280 && J.b <= 720, '评委面板完整在屏幕内');
await page.screenshot({ path: `${OUT}/1_judge_default.png` });

// ---------------- ① 铸造台：真实鼠标点「打开铸造台」，然后移动 / 点遮罩 / 输入 / 点按钮
const go0 = await rect('#d1-judge .go[data-j="0"]');
await page.mouse.click(go0.x + 8, go0.y + 6);
await page.waitForTimeout(800);
ok(await page.evaluate(() => !!document.getElementById('d1-forge')), '鼠标点「打开铸造台」→ 铸造台打开');
const open = () => page.evaluate(() => !!document.getElementById('d1-forge'));
let alive = true;
for (const [x, y] of [[640, 360], [100, 100], [1200, 650], [30, 700], [1250, 40], [640, 20], go0 && [go0.x + 8, go0.y + 6]]) { await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(150); alive = alive && await open(); }
ok(alive, '鼠标在屏幕各处移动 7 次 → 铸造台仍在');
await page.mouse.click(30, 700); await page.waitForTimeout(300); await page.mouse.click(1250, 360); await page.waitForTimeout(300);
await page.mouse.dblclick(go0.x + 8, go0.y + 6); await page.waitForTimeout(300);
ok(await open(), '点遮罩（面板外）3 次 + 双击原按钮位置 → 铸造台仍在');
const inp = await rect('#fg-p');
await page.mouse.click(inp.x + 20, inp.y + inp.h / 2);
await page.keyboard.type('缠着海藻的锈蚀锚形巨斧 wasd mbnp', { delay: 20 });
await page.mouse.move(inp.x + 30, inp.y + inp.h / 2); await page.mouse.down(); await page.mouse.move(20, 700, { steps: 8 }); await page.mouse.up();   // 在输入框里按下拖选、移到面板外松开
await page.waitForTimeout(300);
ok(await open(), '输入文字（含 WASD/M/B/N/P）+ 输入框里拖选到面板外松开 → 铸造台仍在');
ok((await page.evaluate(() => document.getElementById('fg-p').value)).includes('锚形巨斧'), '输入框收到文字');
ok(await page.evaluate(() => !document.body.classList.contains('photo-on')), '输入 P 没有触发拍照模式');
// 点面板里的按钮（武器库第一把 + 展开 Key 区）
await page.evaluate(() => document.querySelector('#d1-forge .lib .btn')?.scrollIntoView());
const lib0 = await rect('#d1-forge .lib .btn'); if (lib0) await page.mouse.click(lib0.x + 10, lib0.y + 8);
await page.waitForTimeout(500);
for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, 300); await page.mouse.move(200 + k * 200, 300 + k * 50, { steps: 4 }); }
ok(await open(), '点面板里的按钮 + 滚轮 + 再移动 → 铸造台仍在');
await page.screenshot({ path: `${OUT}/2_smithy_after_mouse.png` });

// ---------------- ③ 本地版：模式标签、Key 测试（全中文 + 颜色）、任何路径都不发 task/create
const EN_OK = t => !/[A-Za-z]/.test(t.replace(/Lux3D|Key|GLB|Aholo/g, ''));
await page.evaluate(() => { localStorage.setItem('darkrock_lux_key', 'test-key-xxxx1234'); window.__dlc1.smithy.close(); window.__dlc1.smithy.open(); });
await page.waitForTimeout(800);
const mode = await page.evaluate(() => ({ m: window.__dlc1.smithy.mode(), label: document.getElementById('fg-mode')?.textContent, go: document.querySelector('#d1-forge [data-a="go"]')?.textContent, imp: !!document.querySelector('#d1-forge [data-a="import"]') }));
console.log('mode', JSON.stringify(mode));
ok(mode.m === 'local' && mode.label.includes('本地版'), `本地模式 + 顶部标签「${mode.label}」`);
ok(await page.evaluate(() => { const t = document.querySelector('#d1-forge .sub')?.textContent ?? ''; return t.includes('想在线生成请双击『启动铸造服务』') && t.includes('http://127.0.0.1:17860/') && t.includes('「更多信息」→「仍要运行」'); }), '本地版提示「想在线生成请双击『启动铸造服务』」+ 地址 + Windows 安全提示');
ok(mode.go.includes('武器库') && mode.imp, `铸造按钮「${mode.go}」+ 有「导入本地 GLB」`);
await page.screenshot({ path: `${OUT}/3_smithy_local_mode.png` });
await page.evaluate(() => { const d = document.getElementById('fg-keybox'); if (d) d.open = true; d?.scrollIntoView(); });
luxMode = 'abort';
const kb = await rect('#d1-forge [data-a="keyping"]'); await page.mouse.click(kb.x + 10, kb.y + 8);
await page.waitForFunction(() => !/正在测试/.test(document.querySelector('#d1-forge .msg')?.textContent ?? '正在测试'), null, { timeout: 120000, polling: 500 });
let m = await page.evaluate(() => { const e = document.querySelector('#d1-forge .msg'); e.scrollIntoView({ block: 'center' }); return { t: e.textContent, c: e.className, col: getComputedStyle(e).color }; });
console.log('keyping(abort)', JSON.stringify(m));
ok(m.t.includes('跨域') && m.t.includes('本地版不能在线生成') && m.t.includes('不扣积分'), '跨域拦截 → 中文说明（本地版正常现象、不能在线生成、不扣积分）');
ok(EN_OK(m.t), '跨域拦截文案没有英文');
ok(m.c.includes('bad'), `失败用红色（${m.col}）`);
ok(await open(), '点「测试 Key」后铸造台仍在');
await page.screenshot({ path: `${OUT}/4_keytest_fail_red.png` });
luxMode = 'ok';
await page.evaluate(() => document.querySelector('#d1-forge [data-a="keyping"]').scrollIntoView({ block: 'center' }));
const kb2 = await rect('#d1-forge [data-a="keyping"]'); await page.mouse.click(kb2.x + 10, kb2.y + 8);
await page.waitForFunction(() => { const t = document.querySelector('#d1-forge .msg')?.textContent ?? ''; return t && !/正在测试|跨域/.test(t); }, null, { timeout: 180000, polling: 500 }).catch(() => console.log('等「Key 正确」超时'));
m = await page.evaluate(() => { const e = document.querySelector('#d1-forge .msg'); e.scrollIntoView({ block: 'center' }); return { t: e.textContent, c: e.className, col: getComputedStyle(e).color }; });
console.log('keyping(ok)', JSON.stringify(m));
ok(m.t.startsWith('Key 正确，已连上 Lux3D') && m.c.includes('ok') && EN_OK(m.t), `成功：绿色「Key 正确，已连上 Lux3D」（${m.col}）`);
await page.screenshot({ path: `${OUT}/5_keytest_ok_green.png` });
// 其他失败情况（用假 fetcher 直接调测试函数，不联网）
const variants = await page.evaluate(async () => {
  const P = window.__dlc1.smithy.keyPing, J = (st, o) => async () => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json' } });
  const out = {};
  out.s401 = await P(J(401, { c: '401', m: 'Unauthorized: invalid token' }));
  out.s403 = await P(J(403, { m: 'Forbidden' }));
  out.c_auth = await P(J(200, { c: '1001', m: 'API key expired', d: null }));
  out.s500 = await P(J(500, { m: 'Internal Server Error' }));
  out.s429 = await P(J(429, { m: 'Too Many Requests' }));
  out.timeout = await P(async () => { throw new DOMException('signal timed out', 'TimeoutError'); });
  out.typeerr = await P(async () => { throw new TypeError('Failed to fetch'); });
  out.html = await P(async () => new Response('<html>Bad Gateway</html>', { status: 404 }));
  out.c_busy = await P(J(200, { c: '5000', m: 'server busy, retry later', d: null }));
  return out;
});
const want = { s401: 'auth', s403: 'auth', c_auth: 'auth', s500: 'busy', s429: 'busy', timeout: 'busy', typeerr: 'net', html: 'odd', c_busy: 'busy' };
for (const [k, v] of Object.entries(variants)) { console.log('  ', k, v.kind, v.text); ok(v.kind === want[k] && !v.ok, `测试 Key ${k} → ${v.kind}`); ok(EN_OK(v.text) && v.text.includes('不扣积分'), `测试 Key ${k} 文案全中文、写明不扣积分`); }
// 本地版：铸造（含残留的直连续取任务）不发任何 Lux3D 请求
luxMode = 'ok'; luxReq.length = 0;
await page.evaluate(() => localStorage.setItem('darkrock_forge_pending', JSON.stringify({ taskId: '999', prompt: '旧直连任务', type: 'sword', api: 'lux3d-direct:', t: Date.now() })));
const r1 = await page.evaluate(async () => { const r = await window.__dlc1.smithy.run('沉在海底的钟铜长剑', undefined, false); return { ok: r.ok, online: r.online, msg: r.msg }; });
console.log('local run', JSON.stringify(r1));
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 3; document.querySelector('#d1-forge #fg-p') && (document.querySelector('#d1-forge #fg-p').value = '缠着海藻的锈蚀锚形巨斧'); });
const gb = await rect('#d1-forge [data-a="go"]'); if (gb) { await page.evaluate(() => document.querySelector('#d1-forge [data-a="go"]').scrollIntoView({ block: 'center' })); const g2 = await rect('#d1-forge [data-a="go"]'); await page.mouse.click(g2.x + 10, g2.y + 8); }
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'done', null, { timeout: 120000, polling: 500 }).catch(() => {});
await page.waitForTimeout(4000);
const creates = luxReq.filter(x => x.includes('/task/create')).length;
console.log('Lux3D requests during local forge:', JSON.stringify(luxReq));
ok(creates === 0, `本地版铸造：task/create 调用次数 = ${creates}`);
ok(luxReq.length === 0, `本地版铸造：没有任何 Lux3D 请求（${luxReq.length}）`);
ok(r1.ok && !r1.online && r1.msg.includes('本地版'), `本地版铸造 → 武器库（${r1.msg}）`);
await page.evaluate(() => { localStorage.removeItem('darkrock_forge_pending'); window.__dlc1.smithy.close?.(); });
// 魔搭版判定：配了铸造服务地址 → server，标签变「魔搭版」，Key 区隐藏（只看界面，不发铸造）
const sv = await page.evaluate(async () => { localStorage.setItem('darkrock_forge_api', 'http://127.0.0.1:9'); window.__dlc1.smithy.open(); await new Promise(r => setTimeout(r, 600)); const o = { m: window.__dlc1.smithy.mode(), label: document.getElementById('fg-mode')?.textContent, key: !!document.getElementById('fg-keybox') }; window.__dlc1.smithy.close(); localStorage.removeItem('darkrock_forge_api'); return o; });
console.log('server mode', JSON.stringify(sv));
ok(sv.m === 'server' && sv.label.includes('魔搭版') && !sv.key, '配了铸造服务 → 魔搭版标签，Key 区隐藏');
// ---------------- 导入本地 GLB（真实文件：任务 4467036）
await page.evaluate(() => { window.__dlc1.smithy.open(); });
await page.waitForTimeout(600);
await page.setInputFiles('#fg-file', '/workspace/work/diag/recover/forge_4467036.glb');
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'reveal' || /导入完成|解析失败/.test(window.__dlc1.smithy.toast.text), null, { timeout: 180000, polling: 300 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/6_import_reveal.png` });
await page.waitForFunction(() => /导入完成|解析失败|不是 GLB/.test(window.__dlc1.smithy.toast.text), null, { timeout: 180000, polling: 500 });
const imp = await page.evaluate(() => { const s = window.__dlc1.smithy, it = s.items().find(i => i.key === 'forge_4467036'); return { toast: s.toast.text, log: s.importLog, it, cur: window.__game && window.__dlc1.smithy.items && it ? true : false }; });
console.log('import', JSON.stringify(imp));
ok(!!imp.it && imp.toast.includes('导入完成'), `导入完成：${imp.toast}`);
ok(!!imp.it && imp.it.size < 6 * 1048576, `贴图压缩后 ${(imp.it?.size / 1048576).toFixed(2)}MB（原 10.3MB）`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/7_import_worn.png` });
await page.evaluate(() => { window.__dlc1.smithy.open(); }); await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('fg-mine')?.scrollIntoView());
const worn = await page.evaluate(() => document.querySelector('#d1-forge .card.on[data-k="forge_4467036"]') ? true : false);
ok(worn, '「我的铸造品」里有这把，并标为已换上');
await page.screenshot({ path: `${OUT}/8_import_in_mine.png` });
// Esc / × 才关
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ok(!(await open()), 'Esc → 铸造台关闭');
await page.evaluate(() => window.__dlc1.smithy.open()); await page.waitForTimeout(500);
const xb = await rect('#d1-forge .x'); await page.mouse.click(xb.x + 5, xb.y + 8); await page.waitForTimeout(300);
ok(!(await open()), '点 × → 铸造台关闭');
console.log('Lux3D 拦截请求（全部被 route 拦下，没有真实发出）：', luxReq.length);

// ---------------- ② 评委面板：收起 → 小按钮 → 重新打开 → 拖动
const x1 = await rect('#d1-judge [data-j="x"]'); await page.mouse.click(x1.x + 5, x1.y + 6); await page.waitForTimeout(400);
const T = await rect('#d1-judge-tab');
ok(!(await rect('#d1-judge')) && !!T && T.vis, `点 ✕ → 面板收起，左上出现「评委体验」按钮 ${JSON.stringify(T)}`);
ok(!!T && !inter(T, PF) && !inter(T, MM), '小按钮不压头像框 / 小地图');
await page.screenshot({ path: `${OUT}/9_judge_closed_tab.png` });
const stepBefore = await page.evaluate(() => window.__dlc1.judge.state.step);
await page.mouse.click(T.x + 10, T.y + 8); await page.waitForTimeout(400);
const J2 = await rect('#d1-judge');
ok(!!J2 && !(await rect('#d1-judge-tab')), '点「评委体验」→ 面板重新打开、小按钮消失');
ok(await page.evaluate(() => document.querySelectorAll('#d1-judge .go').length) === 3, '重新打开后 3 个按钮都在');
ok(await page.evaluate(() => window.__dlc1.judge.state.step) === stepBefore, '开关面板不影响进度');
await page.screenshot({ path: `${OUT}/10_judge_reopened.png` });
// 鼠标拖标题栏
const H = await rect('#d1-judge h4');
await page.mouse.move(H.x + 40, H.y + 10); await page.mouse.down(); await page.mouse.move(H.x + 40 + 700, H.y + 10 + 180, { steps: 12 }); await page.mouse.up();
await page.waitForTimeout(300);
const J3 = await rect('#d1-judge'), saved = await page.evaluate(() => localStorage.getItem('darkrock_judge_pos'));
console.log('drag', JSON.stringify(J2), '→', JSON.stringify(J3), saved);
ok(Math.abs(J3.x - (J2.x + 700)) <= 3 && Math.abs(J3.y - (J2.y + 180)) <= 3, '鼠标拖动标题栏 → 位置改变');
ok(!!saved && JSON.parse(saved).x === J3.x, `位置存进 localStorage（${saved}）`);
await page.screenshot({ path: `${OUT}/11_judge_dragged_mouse.png` });
// 触屏拖动（CDP 触摸事件 → pointerType=touch）
const cdp = await page.context().newCDPSession(page);
const H2 = await rect('#d1-judge h4'), tx = H2.x + 40, ty = H2.y + 10;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + k * 30, y: ty - k * 8 }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
const J4 = await rect('#d1-judge');
console.log('touch drag', JSON.stringify(J3), '→', JSON.stringify(J4));
ok(Math.abs(J4.x - Math.min(J3.x + 300, 1280 - 4 - J3.w)) <= 4 && Math.abs(J4.y - (J3.y - 80)) <= 4, '触屏拖动标题栏 → 位置改变');
// 收起再打开：回到拖动后的位置
await page.evaluate(() => { window.__dlc1.judge.min(); window.__dlc1.judge.show(true); });
const J5 = await rect('#d1-judge');
ok(J5.x === J4.x && J5.y === J4.y, `收起再打开 → 保持拖动后的位置（${J5.x},${J5.y}）`);
await page.screenshot({ path: `${OUT}/12_judge_dragged_touch.png` });
// 拖出屏幕会被夹回
await page.evaluate(() => { localStorage.setItem('darkrock_judge_pos', JSON.stringify({ x: 5000, y: -300 })); window.__dlc1.judge.min(); window.__dlc1.judge.show(true); });
const J6 = await rect('#d1-judge');
ok(J6.r <= 1280 && J6.y >= 0, `保存位置在屏幕外 → 夹回屏幕内 ${JSON.stringify(J6)}`);
await page.evaluate(() => { localStorage.removeItem('darkrock_judge_pos'); window.__dlc1.judge.min(); window.__dlc1.judge.show(true); });
// ---------------- 三个按钮各点两次（真实鼠标），每次都能进入
const clickGo = async i => { const g = await rect(`#d1-judge .go[data-j="${i}"]`); await page.mouse.click(g.x + 8, g.y + 6); };
for (let k = 1; k <= 2; k++) {
  await clickGo(0); await page.waitForTimeout(800);
  ok(await open(), `按钮①第 ${k} 次 → 铸造台打开`);
  await page.screenshot({ path: `${OUT}/13_btn1_click${k}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
for (let k = 1; k <= 2; k++) {
  await clickGo(1); await page.waitForTimeout(8000);
  const w = await page.evaluate(() => window.__game.enemies.filter(x => x.pboss === 'dwb_whale' && x.alive).length);
  ok(w === 1, `按钮②第 ${k} 次 → 前往镜湖、巨鲸在场 ${w} 头`);
  await page.screenshot({ path: `${OUT}/14_btn2_click${k}.png` });
}
for (let k = 1; k <= 2; k++) {
  await clickGo(2); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.body.classList.contains('photo-on')), `按钮③第 ${k} 次 → 拍照模式`);
  await page.screenshot({ path: `${OUT}/15_btn3_click${k}.png` });
  await page.keyboard.press('p'); await page.waitForTimeout(1200);
}
ok(JSON.stringify(await page.evaluate(() => window.__dlc1.judge.state.acts)) .startsWith('['), `按钮点击计数 ${JSON.stringify(await page.evaluate(() => window.__dlc1.judge.state.acts))}`);
ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
await b.close(); console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
