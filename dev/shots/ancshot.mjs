// v0.9.6b 太古对比截图：node tools/preview/ancshot.mjs → /tmp/anc_loot.png /tmp/anc_bag.png
import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 760 } }); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { localStorage.clear(); });
await p.goto('file://'+process.cwd()+'/web/index.html');
await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 60000 });
await p.evaluate(() => { document.getElementById('class-pick').children[0].click(); document.getElementById('start').click(); });
await p.waitForTimeout(1500);
await p.evaluate(() => { const g = window.__game; g.progression.level = 30; g.ensureWild('redsand'); g.goMap('redsand'); });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const g = window.__game; g.progression.level = 30; g.gen.classId = g.cls.id; g.setAncientChance(1);
  [...document.querySelectorAll('button')].find(x => x.textContent === '跳过引导')?.click();
  const anc = g.abyFloorItems(20); g.setAncientChance(0); const org = g.abyFloorItems(20)[0];
  const set = g.abyDarkOptions().find(i => i.setId), dark = g.abyDarkOptions().find(i => i.quality === 'dark');
  const P = g.player.pos, at = (dx, dz) => P.clone().add({ x: dx, y: 0, z: dz });
  // 从左到右：套装（红光柱）/ 橙装 / 暗金 / 太古
  [[set, -6], [org, -2], [dark, 2], [anc[0], 6]].forEach(([it, dx]) => { g.spawnLoot(it, at(dx, -3), 0, 1); const L = g.loots[g.loots.length - 1]; L.obj.position.set(P.x + dx * 0.8, g.groundAt ? g.groundAt(P.x + dx * 0.8, P.z - 4) : L.obj.position.y, P.z - 4); });
  window.__anc = anc;
});
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/anc_loot.png' });
await p.evaluate(() => { const g = window.__game; for (const it of window.__anc) g.inventory.add(it); });
await p.keyboard.press('b'); await p.waitForTimeout(800);
const slot = await p.$('#bag .slot.is-anc'); if (slot) { await slot.hover(); await p.waitForTimeout(500); await slot.click().catch(() => {}); await p.waitForTimeout(500); }
await p.screenshot({ path: '/tmp/anc_bag.png' });
console.log('errors', errs.slice(0, 3));
await b.close();
