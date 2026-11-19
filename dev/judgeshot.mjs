// v1.2.53 评委 3 分钟通道实测：标题按钮 → 40 级满装 → 倒钟广场 → ① 铸造（离线武器库）② 世界首领 ③ 拍照
// 用法：node dev/judgeshot.mjs [html] [输出目录]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/judgeshot'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], cerr = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('GLTFLoader')) cerr.push(m.text().slice(0, 600)); });
page.setDefaultTimeout(420000); page.setDefaultNavigationTimeout(420000);
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high', charModel: 'new' })); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 420000 });
ok(await page.evaluate(() => !!document.getElementById('demo-enter')), '标题画面有「评委快速体验」按钮');
await page.screenshot({ path: `${OUT}/0_title.png` });
await page.evaluate(() => document.getElementById('demo-enter').click());
await page.waitForTimeout(4000);
const s1 = await page.evaluate(() => { const g = window.__game; return { lv: g.progression.level, map: g.currentMap(), eq: Object.values(g.inventory.equipped).filter(Boolean).length, tut: g.tutState, hud: !!document.getElementById('d1-judge'), name: g.curChar?.name, on: window.__dlc1.judge.state.on }; });
ok(s1.lv === 40, `等级 ${s1.lv}`);
ok(s1.map === 'dlc1_mirror', `区域 ${s1.map}（v1.2.54 落地倒钟广场）`);
ok(s1.eq >= 12, `穿戴 ${s1.eq} 件`);
ok(s1.tut === -1, `新手引导已跳过（${s1.tut}）`);
ok(s1.hud && s1.on && s1.name === '评委体验', `引导面板 ${s1.hud} · 角色 ${s1.name}`);
await page.waitForTimeout(18000);   // 出生光效散掉
console.log('errs@arrive', cerr.length, cerr.slice(0,2).join(' || '));
await page.screenshot({ path: `${OUT}/1_arrive.png` });
// v1.2.54 三个按钮可反复点：① 打开铸造台 ×2（DOM 按钮，关掉再开）
for (let k = 0; k < 2; k++) {
  await page.evaluate(() => document.querySelector('#d1-judge .go[data-j="0"]').click());
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => !!document.getElementById('d1-forge')), `按钮①第 ${k + 1} 次 → 铸造台打开`);
  await page.evaluate(() => window.__dlc1.smithy.close());
}
// ① 铸造（离线：武器库）
await page.evaluate(() => { window.__dlc1.smithy.show.speed = 3; window.__fr = window.__dlc1.smithy.forge('沉在海底的钟铜长剑'); });
await page.waitForFunction(() => window.__fr, null, { timeout: 300000, polling: 300 });
await page.evaluate(() => window.__dlc1.smithy.close?.());
await page.waitForTimeout(1500);
console.log('show', JSON.stringify(await page.evaluate(() => window.__dlc1.smithy.show)));
let st = await page.evaluate(() => window.__dlc1.judge.state.step);
ok(st === 1, `铸造完成 → 第 2 步（${st}）`);
await page.screenshot({ path: `${OUT}/2_forged.png` });
// ② 世界首领
await page.evaluate(() => window.__dlc1.judge.act(1));
await page.waitForTimeout(6000);   // v1.2.54 评委版巨鲸在镜湖西岸（同图传送）
const boss = await page.evaluate(() => { const e = window.__game.enemies.find(x => x.pboss === 'dwb_whale' && x.alive); return e ? { hp: e.hp, d: Math.hypot(e.pos.x - window.__game.player.pos.x, e.pos.z - window.__game.player.pos.z) } : null; });
ok(!!boss, `巨鲸出现 ${boss ? `距离 ${boss.d.toFixed(1)}` : ''}`);
// 巨鲸活着时再点一次：只送回湖岸，不重复生成
await page.evaluate(() => document.querySelector('#d1-judge .go[data-j="1"]').click());
await page.waitForTimeout(3000);
const nAlive = await page.evaluate(() => window.__game.enemies.filter(x => x.pboss === 'dwb_whale' && x.alive).length);
ok(nAlive === 1, `按钮②第 2 次（巨鲸还活着）→ 在场巨鲸 ${nAlive} 头`);
await page.screenshot({ path: `${OUT}/3_boss.png` });
// 实测伤害倍率：同一普攻打一下
const dmg = await page.evaluate(() => { const g = window.__game, e = g.enemies.find(x => x.pboss === 'dwb_whale' && x.alive); return e ? e.hp : 0; });
for (let k = 0; k < 80; k++) {
  const alive = await page.evaluate(() => { const g = window.__game, e = g.enemies.find(x => x.pboss === 'dwb_whale' && x.alive); if (!e) return false; e.brain.provoke?.(); g.target = e; g.player.hp = g.player.maxHp; g.fx.dealDamage(e, e.hp + 10, 'physical', g.player); return true; });
  if (!alive) break; await page.waitForTimeout(1500);
}
console.log('whales', JSON.stringify(await page.evaluate(() => window.__game.enemies.filter(x => x.pboss === 'dwb_whale').map(e => ({ alive: e.alive, hp: e.hp, z: e.z })))));
await page.waitForFunction(() => window.__dlc1.judge.state.step >= 2, null, { timeout: 60000, polling: 300 }).catch(() => {});
await page.waitForTimeout(1500);
st = await page.evaluate(() => window.__dlc1.judge.state.step);
console.log('whales2', JSON.stringify(await page.evaluate(() => window.__game.enemies.filter(x => x.pboss === 'dwb_whale').map(e => ({ alive: e.alive, hp: e.hp, z: e.z })))));
ok(st === 2, `击败巨鲸 → 第 3 步（${st}，巨鲸初始生命 ${dmg}）`);
// 打完以后再点②：巨鲸重新浮出来（可反复体验）；勾选进度不倒退
ok(await page.evaluate(() => !!document.querySelector('#d1-judge .go[data-j="1"]')), '第②步完成后按钮仍在');
await page.evaluate(() => document.querySelector('#d1-judge .go[data-j="1"]').click());
await page.waitForFunction(() => window.__game.enemies.some(x => x.pboss === 'dwb_whale' && x.alive), null, { timeout: 60000, polling: 500 }).catch(() => {});
const again = await page.evaluate(() => window.__game.enemies.filter(x => x.pboss === 'dwb_whale' && x.alive).length);
ok(again === 1, `按钮②第 3 次（巨鲸已击败）→ 巨鲸再次出现 ${again}`);
await page.screenshot({ path: `${OUT}/3b_whale_again.png` });
for (let k = 0; k < 40; k++) {
  const alive = await page.evaluate(() => { const g = window.__game, e = g.enemies.find(x => x.pboss === 'dwb_whale' && x.alive); if (!e) return false; e.brain.provoke?.(); g.target = e; g.player.hp = g.player.maxHp; g.fx.dealDamage(e, e.hp + 10, 'physical', g.player); return true; });
  if (!alive) break; await page.waitForTimeout(1500);
}
st = await page.evaluate(() => window.__dlc1.judge.state.step);
ok(st === 2, `再打一次巨鲸后进度不变（${st}）`);
// ③ 拍照
await page.evaluate(() => window.__dlc1.judge.act(2));
await page.waitForFunction(() => window.__dlc1.judge.state.step >= 3, null, { timeout: 30000, polling: 300 }).catch(() => {});
console.log('photo-on', await page.evaluate(() => document.body.classList.contains('photo-on')));
await page.screenshot({ path: `${OUT}/4_photo.png` });
st = await page.evaluate(() => window.__dlc1.judge.state.step);
ok(st === 3, `拍照模式 → 完成（${st}）`);
await page.keyboard.press('p'); await page.waitForTimeout(800);
// 完成后③再点一次：仍能进入拍照模式；①也仍能打开铸造台
ok(await page.evaluate(() => document.querySelectorAll('#d1-judge .go').length) === 3, '三步完成后 3 个按钮都在');
await page.evaluate(() => document.querySelector('#d1-judge .go[data-j="2"]').click());
await page.waitForTimeout(800);
ok(await page.evaluate(() => document.body.classList.contains('photo-on')), '按钮③第 2 次 → 拍照模式');
await page.keyboard.press('p'); await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('#d1-judge .go[data-j="0"]').click());
await page.waitForTimeout(600);
ok(await page.evaluate(() => !!document.getElementById('d1-forge')), '三步完成后按钮① → 铸造台仍能打开');
await page.evaluate(() => window.__dlc1.smithy.close());
console.log('acts', JSON.stringify(await page.evaluate(() => window.__dlc1.judge.state.acts)));
await page.screenshot({ path: `${OUT}/5_done.png` });
const sv = await page.evaluate(() => { window.__game.save(); return JSON.parse(window.__game.rawSave()).dlc.dlc1; });
ok(sv.demo === 1 && sv.demoStep === 3, `存档 demo=${sv.demo} demoStep=${sv.demoStep}`);
ok(errors.length === 0, `页面错误 ${errors.length}${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);
if (process.env.ASSET_DUMP) { const u = await page.evaluate(() => ({ use: Object.keys(globalThis.__assetHit ?? {}), en: Object.keys(globalThis.__assetEnum ?? {}) })); (await import('fs')).writeFileSync(process.env.ASSET_DUMP, JSON.stringify(u, null, 1)); console.log('资产使用', u.use.length, '枚举表', u.en.join(',')); }
console.log('console.error:', cerr.slice(0, 6).join(' || '));
await b.close(); console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
