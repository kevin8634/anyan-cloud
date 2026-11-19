// v1.1.0 无声钟楼 / 命运的岔路 截图（电脑 + 手机）：node dev/btshots.mjs [输出目录] [desktop|phone]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/bt'; mkdirSync(OUT, { recursive: true });
const MODE = process.argv[3] || 'desktop';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const phone = MODE === 'phone';
const page = await b.newPage(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto('file://' + resolve('web/index_dlc1.html'));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.tutFinish?.(); });
await page.evaluate(() => {
  const g = window.__game; g.progression.level = 38;
  document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex' || p.style.display === 'block') p.style.display = 'none'; });
  g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower');
});
await page.waitForTimeout(2500);
// 1. 钟楼全景：站在第四层前，朝北看钟楼
await page.evaluate(() => { const g = window.__game; g.player.pos.set(2400 - 12, 0, -1800 - 18); g.camSet(30, 0.4); g.camYawSet(0.35); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${MODE}_1_tower.png` });
// 2. 首领：铸钟巨像
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_b1'); if (e) { g.player.pos.set(e.pos.x + 1, 0, e.pos.z + 7); g.target = e; e.brain.provoke?.(); } g.camSet(14, 0.5); g.player.hp = g.player.maxHp = 1e7; });
await page.waitForTimeout(2600);
await page.evaluate(() => { window.__game.player.hp = 1e7; });
await page.screenshot({ path: `${OUT}/${MODE}_2_boss.png` });
// 3. 横幅
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_b1'); if (e) e.brain.reset?.(); g.target = null; g.player.pos.set(2400, 0, -1800 - 40); g.camSet(18, 0.55); window.__dlc1.bt.fateBanner(60000); });
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('#anc-banner .ab-band'); b.style.animation = 'none'; b.style.opacity = '1'; const t = document.querySelector('#anc-banner b'); t.style.animation = 'none'; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${MODE}_3_banner.png` });
// 4. 抉择界面（按住一半）
console.log('banner', await page.evaluate(() => [document.getElementById('anc-banner').className, document.documentElement.className, document.getElementById('anc-big').textContent]));
console.log('open', await page.evaluate(() => [window.__dlc1.bt.openFateUI(), !!document.getElementById('d1-fate')]));
await page.waitForTimeout(1200);
console.log('open2', await page.evaluate(() => [!!document.getElementById('d1-fate')]));
const btn = await page.$('#d1-fate .fhold[data-f="B"]');
const bb = await btn.boundingBox();
await page.evaluate(() => { const b = document.querySelector('#d1-fate .fhold[data-f="B"]'); b.querySelector('.pg').style.width = '45%'; b.querySelector('span').textContent = '继续按住…… 2'; document.getElementById('anc-banner').classList.remove('on'); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${MODE}_4_fate.png` });
// 溢出检查：每个元素的 scrollWidth > clientWidth
const ov = await page.evaluate(() => {
  const out = []; const ui = document.getElementById('d1-fate'); if (!ui) return ['no ui'];
  ui.querySelectorAll('*').forEach(el => { const cs = getComputedStyle(el); if (cs.overflow === 'auto' || el.tagName === 'CANVAS') return; if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) out.push(`${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth}`); });
  const r = ui.getBoundingClientRect(); const bot = ui.querySelector('.fbot').getBoundingClientRect();
  if (bot.bottom > r.bottom + 1) out.push(`底栏溢出 ${bot.bottom} > ${r.bottom}`);
  const fs = [...ui.querySelectorAll('.fs')].map(x => `${x.scrollHeight}/${x.clientHeight}`);
  out.push('fs ' + fs.join(' '));
  return out;
});
console.log('overflow', JSON.stringify(ov));
await page.evaluate(() => { document.querySelector('#d1-fate .fhold[data-f="B"] .pg').style.width = '0'; });
// 5. 沉眠者 A / B
await page.evaluate(() => { window.__dlc1.bt.closeFateUI(); window.__dlc1.bt.chooseFate('B'); });
await page.waitForTimeout(1600);
await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.pboss === 'bt_sleeper_b'); if (e) { g.player.pos.set(e.pos.x + 2, 0, e.pos.z + 10); } g.camSet(18, 0.45); });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/${MODE}_5_sleeper.png` });
// 6. 结局字幕
await page.evaluate(() => window.__dlc1.bt.showEnding('B', 60000));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${MODE}_6_ending.png` });
const fps = await page.evaluate(() => window.__game.perf?.()?.fps ?? null);
console.log('fps', fps, 'errors', errors.slice(0, 5));
await b.close();
