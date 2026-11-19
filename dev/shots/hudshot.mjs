// v0.9.6c HUD 截图：node tools/preview/hudshot.mjs <前缀>  → dev/shots/out/<前缀>_pc.png / _phone.png
// 场景：赤砂裂谷 30 级，打几下技能（冷却），推几条通知，有 demo 钩子时显示假首领条
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
const pre = process.argv[2] || 'new';
mkdirSync(process.cwd()+'/dev/shots/out', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [tag, opt] of [['pc', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }]]) {
  const p = await b.newPage(opt); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.clear(); });
  await p.goto('file://'+process.cwd()+'/web/index.html');
  await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 90000 });
  await p.evaluate(() => { document.getElementById('class-pick').children[0].click(); document.getElementById('start').click(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; g.progression.level = 30; g.ensureWild('redsand'); g.goMap('redsand'); });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const g = window.__game; document.getElementById('tut-skip')?.click();
    g.player.hp = Math.round(g.player.maxHp * 0.62);
    g.tryCast('skill1'); g.tryCast('skill3');
    g.toast?.('获得 [熔岩战靴]', '#a335ee'); g.toast?.('任务进度：赤岩沙蝎 6/10', '#ffd100'); g.toast?.('成就达成：初入赤砂', '#ffe080');
    g.hudDemo?.(true);
  });
  await p.waitForTimeout(700);
  if (tag === 'pc') await p.evaluate(() => window.__game.ancientBannerDemo?.());
  await p.waitForTimeout(450);
  await p.screenshot({ path: `${process.cwd()}/dev/shots/out/${pre}_${tag}.png` });
  console.log(tag, 'errors', errs.slice(0, 3));
  await p.close();
}
await b.close();
