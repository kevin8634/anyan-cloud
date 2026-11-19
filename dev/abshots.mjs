// v1.1.2 渊噬之躯截图（电脑 + 手机）：node dev/abshots.mjs [输出目录] [desktop|phone]
// 1 变异界面 · 2 渊化角色外观（6 部位 3 级，近景）· 3 渊形态外观 · 4 渊形态 / 吞噬 HUD
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/ab'; mkdirSync(OUT, { recursive: true });
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
const hidePanels = () => page.evaluate(() => { document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
await page.evaluate(() => { window.__game.tutFinish?.(); const g = window.__game; g.progression.level = 40; const B = window.__dlc1.bt; B.state().kills = { bt_b1: 1, bt_b2: 1, bt_b3: 1, bt_b4: 1, bt_b5: 1, bt_sleeper_b: 1 }; B.chooseFate('B'); });
await hidePanels();
await page.waitForTimeout(2000);
await page.evaluate(() => { const A = window.__dlc1.abyss; A.unlock(); A.grant(80); A.setLv('arm', 3); A.setLv('spine', 3); A.setLv('shadow', 3); A.setLv('head', 3); A.setLv('eye', 2); A.setLv('heart', 2);
  const g = window.__game; g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); });
await hidePanels();
await page.waitForTimeout(2500);
// 1. 变异界面
await page.evaluate(() => { const g = window.__game; g.player.pos.set(2400 + 6, 0, -1800 + 62); g.camSet(14, 0.6); window.__dlc1.abyss.temp('heart'); window.__dlc1.abyss.setVal(46); window.__dlc1.abyss.tick(0.2); window.__dlc1.abyss.open(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${MODE}_1_ui.png` });
const ov = await page.evaluate(() => {
  const out = []; const ui = document.getElementById('d1-aby'); if (!ui) return ['no ui'];
  ui.querySelectorAll('.card *, .ah *, .rule').forEach(el => { if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && getComputedStyle(el).overflow !== 'auto') out.push(`${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth} «${el.textContent.slice(0, 20)}»`); });
  const dw = ui.querySelector('.aw').getBoundingClientRect(); if (dw.bottom > innerHeight + 1 || dw.right > innerWidth + 1) out.push(`面板超出屏幕 ${dw.right}x${dw.bottom}`);
  return out;
});
console.log('overflow', JSON.stringify(ov));
await page.evaluate(() => window.__dlc1.abyss.close());
// 2. 角色近景（正面 / 背面）
const close = async (yaw, name) => {
  await page.evaluate((y) => { const g = window.__game; g.target = null; g.player.rig.root.rotation.y = y; g.camSet(5.5, 0.32); g.camYawSet(0); document.querySelectorAll('.nameplate').forEach(n => { n.style.visibility = 'hidden'; }); }, yaw);
  await page.waitForTimeout(1500); await hidePanels();
  await page.evaluate((y) => { window.__game.player.rig.root.rotation.y = y; }, yaw);
  await page.screenshot({ path: `${OUT}/${MODE}_${name}.png` });
};
await page.evaluate(() => { const g = window.__game; g.player.pos.set(2400 + 6, 0, -1800 + 62); });
await close(0, '2a_front'); await close(Math.PI * 0.8, '2b_back');
// 3. 渊形态外观
await page.evaluate(() => { const A = window.__dlc1.abyss; A.form(); for (let i = 0; i < 20; i++) A.tick(0.05); });
await page.waitForTimeout(900); await hidePanels();
await close(0.5, '3_form');
console.log('dress', JSON.stringify(await page.evaluate(() => window.__dlc1.abyss.dress())), 'summary', await page.evaluate(() => window.__game.gearSummary()));
// 4. HUD：渊形态 + 身边几只怪 + 吞噬瞬间
await page.evaluate(() => {
  const g = window.__game; g.player.hp = g.player.maxHp = 1e7;
  g.player.pos.set(2400 + 40, 0, -1800 + 40); g.camSet(15, 0.6); g.camYawSet(0.3);
  document.querySelectorAll('.nameplate').forEach(n => { n.style.visibility = ''; });
  const es = g.enemies.filter(e => e.z === 'dlc1_belltower' && e.alive && !e.isBoss).slice(0, 4);
  es.forEach((e, i) => { e.pos.set(g.player.pos.x + 2 + i * 0.8, 0, g.player.pos.z - 2 + (i % 2)); e.hp = e.maxHp * 0.2; e.brain?.provoke?.(); });
  g.target = es[0] ?? null; window.__dlc1.devour.resetCd();
  if (!window.__dlc1.abyss.rt().form) window.__dlc1.abyss.form();
  for (let i = 0; i < 10; i++) window.__dlc1.abyss.tick(0.05);
});
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__game.player.hp = 1e7; const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
await page.screenshot({ path: `${OUT}/${MODE}_4_hud.png` });
console.log('ext', JSON.stringify(await page.evaluate(() => { const e = document.getElementById('sk-ext'); const r = e?.getBoundingClientRect(); const bar = document.getElementById('d1-abybar')?.getBoundingClientRect(); const hits = [...document.querySelectorAll('body *')].filter(x => x.offsetParent && x.id !== 'd1-abybar' && !x.closest('#d1-abybar') && getComputedStyle(x).position === 'fixed').map(x => [x.id || x.className, x.getBoundingClientRect()]).filter(([, q]) => bar && q.width > 0 && !(q.right <= bar.left || q.left >= bar.right || q.bottom <= bar.top || q.top >= bar.bottom)).map(([n]) => n); return { ext: r && [r.left, r.top, r.width], id: e?.dataset.id, bar: bar && [bar.left, bar.top, bar.width, bar.height], barOverlap: hits.slice(0, 6) }; })));
await page.evaluate(() => window.__dlc1.devour.use());
await page.waitForTimeout(220);
await page.screenshot({ path: `${OUT}/${MODE}_4b_devour.png` });
console.log('devour', JSON.stringify(await page.evaluate(() => window.__dlc1.devour.last())));
const fps = await page.evaluate(() => window.__game.perf?.()?.fps ?? null);
console.log('fps', fps, 'version', await page.evaluate(() => document.body.innerText.match(/v1\.\d+\.\d+/)?.[0]), 'errors', errors.slice(0, 5));
await b.close();
