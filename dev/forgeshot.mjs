// v1.2.42 熔炉成形演出实测：比赛版 DLC 写实战士 → smithy.forge（离线武器库 / 在线桩）→ 等待期、溶解中、空中转、结束 各截一张
// 用法：node dev/forgeshot.mjs [html] [输出目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { readFileSync, mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/forgeshow'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const page = await b.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
if (process.env.NOCG) await page.addInitScript(() => { window.__forgeCgSrc = { f1_drop: '', f2_loop: '', f3_rise: '', f4_fail: '' }; });   // v1.2.73 关掉铸造 CG，回归旧熔岩路径
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(420000); page.setDefaultNavigationTimeout(420000);
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 420000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => window.__game.tutFinish?.());
await page.waitForTimeout(800);
const phase = () => page.evaluate(() => ({ ...window.__dlc1.smithy.show }));
// 1 离线：武器库
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.4; window.__fr = window.__dlc1.smithy.forge('沉在海底的钟铜长剑'); });
await page.waitForTimeout(1500);
let p = await phase(); ok(p.phase === 'brew', `等待期 ${p.phase} 帧 ${p.frames}`);
await page.screenshot({ path: `${OUT}/1_brew.png` });
const iv = setInterval(async () => { try { console.log('show', JSON.stringify(await phase())); } catch {} }, 20000);
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'reveal' && window.__dlc1.smithy.show.cut > 0.45, null, { timeout: 240000, polling: 100 });
await page.screenshot({ path: `${OUT}/2_dissolve.png` });
// v1.2.51 锻打：第二记锤落下瞬间
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'hammer' && window.__dlc1.smithy.show.strikes >= 2, null, { timeout: 600000, polling: 50 });
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.02; });
await page.screenshot({ path: `${OUT}/2b_hammer.png` });
ok((await phase()).strikes >= 2, '锻打：至少两记重锤');
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.4; });
await page.waitForFunction(() => window.__dlc1.smithy.show.phase === 'fly' || window.__dlc1.smithy.show.phase === 'done', null, { timeout: 240000, polling: 100 });
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.05; });
await page.screenshot({ path: `${OUT}/3_spin.png` });
// v1.2.50 淬火冷却中（展示期约 1 秒）
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.4; }); await page.waitForTimeout(2500); await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.05; });
await page.screenshot({ path: `${OUT}/3b_cool.png` });
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.4; }); await page.waitForTimeout(3500); await page.evaluate(() => { window.__dlc1.smithy.show.speed = 0.05; });
await page.screenshot({ path: `${OUT}/3c_cold.png` });
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 1; });
await page.waitForFunction(() => window.__fr, null, { timeout: 120000, polling: 200 });
const r0 = await page.evaluate(() => window.__fr);
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 1; });
p = await phase(); ok(r0.ok && p.phase === 'done', `离线成形结束：${r0.msg} → ${r0.key}（${p.phase}）`);
ok(!(await page.evaluate(() => !!document.getElementById('d1-forgeshow'))), '演出画布已移除');
const on = await page.evaluate(k => { let f = false; window.__game.player.rig.root.traverse(o => { if (o.name === 'lux_' + k) f = true; }); return f; }, r0.key);
ok(on, '演出后主手换上了武器');
await page.screenshot({ path: `${OUT}/4_after.png` });
// v1.2.52 铸造分享卡：演出后浮出按钮 → 点击下载 PNG
const hasBtn = await page.waitForSelector('#forge-card-btn', { timeout: 5000 }).then(() => true, () => false);
ok(hasBtn, '演出后浮出「保存铸造卡」按钮');
if (hasBtn) { const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null); await page.click('#forge-card-btn'); const d = await dl; ok(!!d, `铸造卡下载 ${d ? d.suggestedFilename() : ''}`); if (d) await d.saveAs(`${OUT}/5_card.png`); }
// 2 在线：v1.2.51 删掉旧的单请求桩（服务端已改异步任务 + 轮询），在线链路以 test/forge_e2e.mjs 为准
ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
clearInterval(iv); await b.close(); console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
