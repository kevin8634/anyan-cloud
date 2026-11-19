// v1.2.37d 截图：角色面板（电脑 1280×720 / 手机竖屏 390×844 / 手机横屏 844×390）：node dev/charshots.mjs web/index.html out_prefix [职业]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, out, cls = 'warrior'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [tag, vp, touch] of [['pc', { width: 1280, height: 720 }, false], ['phone', { width: 390, height: 844 }, true], ['phoneL', { width: 844, height: 390 }, true]]) {
  const page = await b.newPage({ viewport: vp, hasTouch: touch, isMobile: touch });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('file://' + resolve(html));
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
  await page.evaluate(c => window.__game.startGame(c), cls);
  await page.waitForTimeout(2500);
  await page.evaluate(c => {
    const g = window.__game; g.tutFinish?.(); g.progression.addXp(400000);
    document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') p.style.display = 'none'; });
    g.gen.classId = c;
    const qs = ['orange', 'purple', 'blue', 'dark', 'green'];
    ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'neck', 'back', 'ring', 'ring', 'trinket', 'trinket', 'mainHand', 'offHand'].forEach((sl, i) => {
      try { const it = g.gen.generate(30, qs[i % qs.length] === 'dark' ? 'orange' : qs[i % qs.length], [sl]); g.inventory.add(it); g.inventory.equip(it.id); } catch { /* 职业不能用的部位 */ } });
    g.syncCharacter();
  }, cls);
  await page.waitForTimeout(300);
  await page.evaluate(() => { [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '知道了' && b.offsetParent).forEach(b => b.click()); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '知道了' && b.offsetParent).forEach(b => b.click()); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') p.style.display = 'none'; }); window.__game.togglePanel('char', true); return [window.__game.started, document.getElementById('char').style.display]; }).then(v => console.log('open', v));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}_${tag}.png` });
  const info = await page.evaluate(() => { const r = e => { const x = document.querySelector(e)?.getBoundingClientRect(); return x ? [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)] : null; };
    return JSON.stringify({ char: r('#char'), doll: r('.doll'), p3d: r('#pd-3d'), slot: r('#pd-left .slot'), phone: document.documentElement.classList.contains('phone') }); });
  console.log(tag, info, await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()).slice(0, 12).join('|')));
  await page.close();
}
await b.close();
