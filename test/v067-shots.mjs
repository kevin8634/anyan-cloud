// v0.6.7 截图 + 按钮重叠检测
// 用法：node test/v067-shots.mjs [输出目录] [视口 desk,se,lefty]
// 场景：HUD（回程按钮在左下 / 触屏在摇杆上方）、tip（4 层装备说明 详细 / 简洁）、salv（背包一键分解 + 回购栏）、shop（铁匠分解页）
// 重叠检测：所有可见的 HUD 按钮（技能键、翻滚、药水、回程、菜单）两两不相交，任何一对重叠就退出码 1
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/v067shots';
mkdirSync(OUT, { recursive: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  small: { viewport: { width: 1024, height: 600 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  se: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS },
  pro: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS },
  lefty: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS, lefty: true },
};
const pick = (process.argv[3] || 'desk,small,se,pro,lefty').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
for (const name of pick) {
  const V = VIEWS[name];
  const ctx = await b.newContext(V);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(l => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', lefty: l })); } catch { } }, !!V.lefty);
  await page.goto('file://' + resolve('web/index.html'));
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (s, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}_${s}.png` }); console.log('📸', name, s); };
  await ev(() => {
    const g = window.__game; g.startGame('warrior'); g.tutFinish?.();
    for (let i = 0; i < 40 && g.progression.level < 30; i++) g.progression.addXp(20000);
    g.gen.classId = 'warrior'; g.inventory.addGold(20000);
    for (const [q, s] of [['purple', ['twoHand']], ['blue', ['chest']], ['purple', ['legs']], ['blue', ['ring']]]) { const it = g.gen.generate(30, q, s); g.inventory.add(it); g.inventory.equip(it.id); }
    g.inventory.add(g.gen.generate(36, 'orange', ['twoHand']));
    g.inventory.add(g.gen.generateFixed('i_fury_pauldron', 36));
    for (let i = 0; i < 8; i++) g.inventory.add(g.gen.generate(18 + i * 2, ['white', 'green', 'blue', 'purple'][i % 4]));
    g.mage = g.gen.classId; g.gen.classId = 'mage'; g.inventory.add(g.gen.generate(30, 'blue', ['twoHand'])); g.gen.classId = 'warrior';
    g.player.pos.set(2, 0, 8);
  });
  await page.waitForTimeout(1500);
  // ---- 按钮重叠检测
  const rects = await ev(() => [...document.querySelectorAll('#skillbar .skill, #sk-recall, .mbtn#btn-menu, #menu .mbtn')]
    .filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[style*="display: none"]'); })
    .map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const hit = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j], pad = 1;
    if (a.x + a.w - pad > c.x && c.x + c.w - pad > a.x && a.y + a.h - pad > c.y && c.y + c.h - pad > a.y) hit.push(`${a.id} × ${c.id}`);
  }
  const rc = rects.find(r => r.id === 'sk-recall');
  const vw = V.viewport.width;
  const leftOk = rc && (V.lefty ? rc.x > vw / 2 : rc.x < vw / 2);
  console.log(`${hit.length || !leftOk ? '  ✗' : '  ✓'} ${name}：${rects.length} 个按钮无重叠${hit.length ? ' ← ' + hit.join('，') : ''}；回程在${V.lefty ? '右下（左右手互换）' : '左下'} ${rc ? `(${Math.round(rc.x)},${Math.round(rc.y)})` : '缺失'}`);
  if (hit.length || !leftOk) fails++;
  await shot('hud');
  // ---- 4 层装备说明
  await ev(() => { document.getElementById('btn-bag').click(); });
  await page.waitForTimeout(300);
  await ev(() => { const cells = [...document.querySelectorAll('#bag-grid .cell:not(.empty)')]; cells[0]?.click(); });
  await shot('tip_detail');
  await ev(() => document.getElementById('b-tipm')?.click());
  await shot('tip_simple');
  await ev(() => document.getElementById('b-tipm')?.click());
  // ---- 一键分解 + 回购
  await ev(() => document.getElementById('bag-salv').click());
  await shot('salv');
  await ev(() => { document.getElementById('b-salvall')?.click(); });
  await page.waitForTimeout(100);
  await ev(() => { document.getElementById('b-salv-ok')?.click(); });
  await shot('salv_buyback');
  const st = await ev(() => ({ bb: window.__game.forge.buyback.length, bag: window.__game.inventory.bag.length }));
  console.log(`${st.bb > 0 ? '  ✓' : '  ✗'} ${name}：一键分解后回购栏 ${st.bb} 件，背包剩 ${st.bag} 件`);
  if (!st.bb) fails++;
  if (errors.length) { fails++; console.log('  ✗ 页面错误：', errors.slice(0, 3).join(' | ')); }
  await ctx.close();
}
await b.close();
console.log(fails ? `✗ ${fails} 项失败` : '✅ v0.6.7 截图 + 按钮重叠检测通过');
process.exit(fails ? 1 : 0);
