// v1.1.1 钟楼领地 / 第 7 键钟鸣 截图（电脑 + 手机）：node dev/dmshots.mjs [输出目录] [desktop|phone]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/dm'; mkdirSync(OUT, { recursive: true });
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
await page.evaluate(() => { window.__game.tutFinish?.(); const g = window.__game; g.progression.level = 40; g.inventory.addGold(500000); window.__dlc1.bt.chooseFate('A'); });
await hidePanels();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const D = window.__dlc1.domain; D.ensureUnlocked(); D.grant(3000, 1000);
  for (const [id, l] of [['belfry', 3], ['forge', 3], ['academy', 2], ['dock', 2], ['sanctum', 3], ['archive', 1]]) D.setLv(id, l);
  D.startBuild('market'); D.startBuild('training');
  D.shiftMs(70000);
  const S = D.state(); for (const r of ['echo_ouf', 'echo_goz', 'echo_valkaz', 'echo_pike', 'echo_otta', 'echo_lian']) if (!S.res.includes(r)) S.res.push(r);
  D.setLv('belfry', 3);
  D.ringRule(D.offered()[0]);
  const g = window.__game; g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror');
});
await hidePanels();
await page.waitForTimeout(3000);
// 1. 领地全景
await page.evaluate((ph) => { const g = window.__game; g.player.pos.set(2400 - 6, 0, -2100 + 30); g.target = null; g.camSet(ph ? 58 : 52, 0.68); g.camYawSet(0.0); document.querySelectorAll('.nameplate').forEach(n => { n.style.visibility = 'hidden'; }); }, phone);
await page.waitForTimeout(3500);
await hidePanels();
await page.screenshot({ path: `${OUT}/${MODE}_1_domain.png` });
await page.evaluate(() => { document.querySelectorAll('.nameplate').forEach(n => { n.style.visibility = ''; }); });
console.log('world', JSON.stringify(await page.evaluate(() => window.__dlc1.domain.world())));
// 2. 建造界面
await page.evaluate(() => { const g = window.__game; g.player.pos.set(2400 + 36, 0, -2100 + 14); g.camSet(16, 0.6); window.__dlc1.domain.open('forge'); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${MODE}_2_build.png` });
const ov = await page.evaluate(() => {
  const out = []; const ui = document.getElementById('d1-dom'); if (!ui) return ['no ui'];
  ui.querySelectorAll('.card *, .dh *, .tabs *').forEach(el => { if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && getComputedStyle(el).overflow !== 'auto') out.push(`${el.className || el.tagName}: ${el.scrollWidth}>${el.clientWidth} «${el.textContent.slice(0, 20)}»`); });
  const dw = ui.querySelector('.dw').getBoundingClientRect(); if (dw.bottom > innerHeight + 1 || dw.right > innerWidth + 1) out.push(`面板超出屏幕 ${dw.right}x${dw.bottom}`);
  return out;
});
console.log('overflow', JSON.stringify(ov));
// 2b. 钟律页
await page.evaluate(() => { document.querySelector('#d1-dom [data-a="tab"][data-t="l"]').click(); });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/${MODE}_2b_rules.png` });
await page.evaluate(() => window.__dlc1.domain.close());
// 3. 第 7 键 HUD：拉几只怪到身边，钟鸣充满
await page.evaluate(() => {
  const g = window.__game; g.player.hp = g.player.maxHp = 1e7;
  g.player.pos.set(2400 + 8, 0, -2100 + 20); g.camSet(15, 0.6); g.camYawSet(0.3);
  const es = g.enemies.filter(e => e.z === 'dlc1_mirror' && e.alive && !e.isBoss).slice(0, 4);
  es.forEach((e, i) => { e.pos.set(g.player.pos.x + 2 + i * 0.8, 0, g.player.pos.z - 2 + (i % 2)); e.brain.provoke?.(); });
  g.target = es[0] ?? null;
  window.__dlc1.chime.add(300);
});
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__game.player.hp = 1e7; const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
await page.screenshot({ path: `${OUT}/${MODE}_3_hud.png` });
console.log('ext', JSON.stringify(await page.evaluate(() => { const e = document.getElementById('sk-ext'); const r = e?.getBoundingClientRect(); const others = [...document.querySelectorAll('#skillbar > div')].filter(x => x !== e && x.offsetParent).map(x => { const q = x.getBoundingClientRect(); return { id: x.id, hit: r && !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom) }; }).filter(x => x.hit); return { r: r && [r.left, r.top, r.width], cls: e?.className, overlap: others }; })));
// 3b. 钟鸣释放瞬间
await page.evaluate(() => window.__dlc1.chime.use());
await page.waitForTimeout(260);
await page.screenshot({ path: `${OUT}/${MODE}_3b_chime.png` });
console.log('chime', JSON.stringify(await page.evaluate(() => window.__dlc1.chime.last())));
const fps = await page.evaluate(() => window.__game.perf?.()?.fps ?? null);
console.log('fps', fps, 'version', await page.evaluate(() => document.body.innerText.match(/v1\.\d+\.\d+/)?.[0]), 'errors', errors.slice(0, 5));
await b.close();
