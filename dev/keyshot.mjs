// ⚠ v1.2.54 起已过时：本地版不再直连 Lux3D 生成（smithyMode 本地 = 不发 task/create），这里测的直连铸造流程已删除；本地版断言见 dev/uifix_shot.mjs
// v1.2.54 铸造台「自带 Aholo Key 直连」实测（拦截 Lux3D 接口，不花积分）：填 Key → 测试 → 铸造 → 模型换上
// 用法：node dev/keyshot.mjs [html] [输出目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync, readFileSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/keyshot'; mkdirSync(OUT, { recursive: true });
const GLB = readFileSync('assets_aholo/props/weapon_bell_sword.glb');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], seen = { auth: '', create: null, gets: 0, glb: 0 };
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(420000);
let polls = 0;
await page.route('https://api.aholo3d.cn/**', async (route) => {
  const req = route.request(), u = req.url(); if (process.env.KEYSHOT_LOG) console.log('  →', req.method(), u.replace('https://api.aholo3d.cn', '')); seen.auth = req.headers()['authorization'] || '';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: '' });
  if (u.includes('/task/list')) return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ c: '0', d: { items: [], total: 7 } }) });
  if (u.includes('/text-to-3d/task/create')) { seen.create = JSON.parse(req.postData() || '{}'); return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ c: '0', d: 9990001 }) }); }
  if (u.includes('/task/get')) { seen.gets++; const done = ++polls >= 2; return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ c: '0', d: { status: done ? 3 : 1, outputs: done ? [{ content: 'https://qhsmodel.kujiale.com/lux3dPbrEmbedResult/test/textured.glb' }] : [] } }) }); }
  return route.fulfill({ status: 404, headers: cors, body: '{}' });
});
await page.route('https://qhsmodel.kujiale.com/**', (route) => { seen.glb++; route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'model/gltf-binary', body: GLB }); });
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 420000 });
await page.evaluate(() => document.getElementById('demo-enter').click());
await page.waitForTimeout(20000);
await page.evaluate(() => window.__dlc1.smithy.open());
await page.waitForTimeout(1500);
ok(await page.evaluate(() => !!document.querySelector('#fg-keybox[open] #fg-key')), '铸造台有「自带 Key」输入框（离线时默认展开）');
await page.fill('#fg-key', 'TEST-KEY-123456');
await page.click('[data-a="key"]');
await page.waitForFunction(() => /Key 可用|测试失败/.test(document.querySelector('#d1-forge .msg')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
const m1 = await page.evaluate(() => document.querySelector('#d1-forge .msg')?.textContent || '');
ok(/Key 可用/.test(m1), `测试 Key：${m1.slice(0, 60)}`);
ok(seen.auth === 'TEST-KEY-123456', 'Authorization 头是填写的原始 Key');
ok(await page.evaluate(() => !document.getElementById('d1-forge').innerHTML.includes('TEST-KEY-123456')), '面板里不明文显示 Key');
ok(await page.evaluate(() => /自己的 Aholo Key/.test(document.querySelector('#d1-forge .sub')?.textContent || '')), '顶部显示直连模式与积分提示');
await page.screenshot({ path: `${OUT}/1_key.png` });
await page.evaluate(() => window.__dlc1.smithy.close());
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 3; window.__dlc1.smithy.cfg.pollMs = 500; window.__fr = window.__dlc1.smithy.forge('缠着海藻的锈蚀锚形长剑'); });
await page.waitForFunction(() => window.__fr, null, { timeout: 300000, polling: 500 });
const r = await page.evaluate(async () => { const x = await window.__fr; return { ok: x.ok, online: x.online, key: x.key, msg: x.msg, worn: window.__game && window.__dlc1.smithy.items().map(i => i.key) }; });
ok(!!seen.create && /缠着海藻/.test(seen.create.prompt) && seen.create.version === 'G1-Turbo' && seen.create.faceCount === 12000, `创建任务参数 ${JSON.stringify(seen.create).slice(0, 120)}`);
ok(seen.gets >= 2 && seen.glb >= 1, `轮询 ${seen.gets} 次、下载模型 ${seen.glb} 次`);
ok(r.ok && r.online && r.key === 'forge_9990001', `铸造结果 ${r.msg}`);
ok((r.worn || []).includes('forge_9990001'), '收进「我的铸造品」');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/2_forged.png` });
ok(errors.length === 0, `页面错误 ${errors.length} ${errors.slice(0, 2).join(' | ')}`);
console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); await b.close(); process.exit(fail ? 1 : 0);
