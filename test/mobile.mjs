// 手机适配截图：无头 Chromium（SwiftShader）按多种视口打开 web/index.html，截 标题/营地 HUD/角色/背包/天赋/任务/地图/商店/原野路线
// 用法：node test/mobile.mjs [输出目录] [视口名逗号分隔，默认全部] [场景名逗号分隔，默认全部]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/mshots';
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  se: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  p14: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  max: { viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const pick = (process.argv[3] || Object.keys(VIEWS).join(',')).split(',');
const scenes = (process.argv[4] || 'title,camp,drawer,char,bag,talent,quests,map,shop,upgrade,dialog,field,death').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errs = 0;
for (const name of pick) {
  const ctx = await b.newContext({ ...VIEWS[name], userAgent: VIEWS[name].isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); } catch { } });
  await page.goto('file://' + resolve('web/index.html'));
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
  const shot = async s => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}_${s}.png` }); console.log('📸', name, s); };
  const ev = f => page.evaluate(f);
  if (scenes.includes('title')) await shot('title');
  if (name === 'portrait') { await ev(() => window.__game.startGame('warrior')); await page.waitForTimeout(800); await shot('camp'); await ctx.close(); continue; }
  await ev(() => { const g = window.__game; localStorage.removeItem('darkrock_legend_save'); g.startGame('warrior'); g.progression.addXp(3000); g.inventory.addGold(20000);
    g.quests.load({ active: { q_field_news: [0], q_swamp_news: [0] }, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] });
    const qs = ['green', 'blue', 'purple', 'orange', 'blue', 'green', 'purple', 'white']; for (const q of qs) g.inventory.add(g.gen.generate(11, q)); const it = g.inventory.bag.find(i => g.inventory.canEquip(i)); if (it) g.inventory.equip(it.id); g.player.pos.set(2, 0, 8); });
  await page.waitForTimeout(1500);
  if (scenes.includes('camp')) await shot('camp');
  const panel = async (s, f) => { if (!scenes.includes(s)) return; await ev(f); await shot(s); await ev(() => document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; })); };
  await panel('char', () => document.getElementById('btn-char').click());
  await panel('bag', () => document.getElementById('btn-bag').click());
  await panel('talent', () => document.getElementById('btn-talent').click());
  await panel('quests', () => document.getElementById('btn-quest').click());
  await panel('map', () => window.__game.openWorldMap('zone'));
  await panel('shop', () => window.__game.openShop());
  await panel('upgrade', () => { const g = window.__game; g.openShop(); const it = g.inventory.equippedItems?.()[0] ?? g.inventory.bag[0]; g.setShopTab('upgrade', it?.id ?? null); });
  await panel('dialog', () => window.__game.openDialog('bran'));
  if (scenes.includes('drawer')) { await ev(() => document.getElementById('btn-menu').click()); await shot('drawer'); await ev(() => document.documentElement.classList.remove('menu-open')); }
  if (scenes.includes('field')) {
    await ev(() => { const g = window.__game; g.quests.load({ active: { q_field_boars: [0], q_field_supplies: [0] }, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine', 'q_field_news'] }); g.enterField(); g.setFocus('q_field_boars'); });
    await page.waitForTimeout(2500); await shot('field');
  }
  if (scenes.includes('death')) { await ev(() => { const g = window.__game; g.player.hp = 0; g.player.onDeath(); }); await page.waitForTimeout(1600); await shot('death'); }
  console.log(name, errors.length ? `❌ ${errors.length} 错误:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}` : '✅ 无错误');
  errs += errors.length;
  await ctx.close();
}
await b.close();
if (errs) process.exitCode = 1;
