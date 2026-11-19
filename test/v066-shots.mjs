// 主线 v0.6.6 截图（取代 B 的 v05-shots / v05b-shots / v05c-shots，那三个引用了已删除的难度条 / 典藏页 / 三按钮分解 / 重铸 / 保护符）
// 用法：node test/v066-shots.mjs [输出目录] [视口 desk,se] [场景]
// 场景：repair（商店「修理」页 + HUD 耐久警告）、exchange（兑换 · 暗岩锻造）、exset（兑换 · 套装缺件）、dark（暗金血誓 + 渊吼外观，两帧看流光动画）、
//       darktip（暗金提示）、dropguide（掉落说明书 · 长副本首领页：职业套装部件）、charsheet（4 件套角色面板）、settip（套装件提示）
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/v066shots';
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  se: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const pick = (process.argv[3] || 'desk,se').split(',');
const scenes = (process.argv[4] || 'repair,exchange,exset,dark,darktip,dropguide,charsheet,settip').split(',');
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
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
  const shot = async (s, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}_${s}.png` }); console.log('📸', name, s); };
  const ev = (f, a) => page.evaluate(f, a);
  const hidePanels = () => ev(() => { document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); const t = document.getElementById('tooltip'); if (t) t.style.display = 'none'; const x = document.getElementById('exchange'); if (x) x.style.display = 'none'; });
  const closeAll = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); } await ev(() => { const s = document.getElementById('settings'); if (s?.style.display === 'flex') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await hidePanels(); };
  await ev(() => {
    const g = window.__game; g.startGame('warrior'); g.tutFinish?.();
    for (let i = 0; i < 40 && g.progression.level < 30; i++) g.progression.addXp(20000);
    g.gen.classId = 'warrior';
    g.inventory.addGold(50000);
    for (const id of ['i_helm', 'i_fury_pauldron', 'i_chest', 'i_fury_gauntlet']) { const it = g.gen.generateFixed(id, 40); g.inventory.add(it); g.inventory.equip(it.id); }
    for (const [q, s] of [['purple', ['legs']], ['purple', ['feet']], ['blue', ['waist']], ['purple', ['back']], ['purple', ['neck']], ['blue', ['ring']], ['purple', ['wrist']]]) { const it = g.gen.generate(34, q, s); g.inventory.add(it); g.inventory.equip(it.id); }
    const r = g.gen.generateFixed('d_bloodoath', 40); g.inventory.add(r); g.inventory.equip(r.id, 'mainHand');
    const t = g.gen.generateFixed('d_abyss', 40); g.inventory.add(t); g.inventory.equip(t.id, 'trinket1');
    const legs = g.gen.generateFixed('i_fury_legs', 40); g.inventory.add(legs);
    // 说明书「已获得」读 codex（正常拾取 / 兑换时记录），脚本直接生成的装备补记一下
    g.inventory.equippedItems().concat(g.inventory.bag).forEach(it => { if (it.setId) g.codex.add(`fixed|${it.name}`); if (it.quality === 'dark') g.codex.add(`dark|${it.fixedId}`); });
    g.player.pos.set(2, 0, 8);
  });
  await page.waitForTimeout(1500);
  const hov = async sel => { await ev(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: r.x + 20, clientY: r.y + 20 })); }, sel); };
  const unhov = sel => ev(s => document.querySelector(s)?.dispatchEvent(new MouseEvent('mouseleave')), sel);
  if (scenes.includes('repair')) {
    await ev(() => { const g = window.__game; const eq = g.inventory.equippedItems(); eq.forEach((it, i) => { it.durability = i % 4 === 0 ? 0 : i % 3 === 0 ? 18 : 60 + i * 3; }); g.inventory.notify(); });
    await page.waitForTimeout(600);
    await ev(() => { const g = window.__game; g.openShop('smith'); g.setShopTab('repair'); });
    await shot('repair');
    await closeAll();
    await shot('durhud', 400);
    await ev(() => { window.__game.repairAll(); });
  }
  if (scenes.includes('exchange') || scenes.includes('exset')) {
    await ev(() => { const g = window.__game; ['cur_ember', 'cur_frost', 'cur_sigil'].forEach(id => g.inventory.addStack(id, 40)); g.openShop('smith'); g.smith.openExchange('forge'); g.smith.setX({ tab: 'forge', slot: 'chest' }); const sp = document.querySelector('[data-xsp]'); sp?.click(); });
    if (scenes.includes('exchange')) await shot('exchange');
    await ev(() => window.__game.smith.setX({ tab: 'set' }));
    if (scenes.includes('exset')) await shot('exset');
    await closeAll();
  }
  if (scenes.includes('dark')) {
    await ev(() => { const g = window.__game; g.player.pos.set(-6, 0, 2); g.player.rig.root.rotation.y = Math.PI * 0.35; g.camSet(4.6, 0.24); g.camYawSet(Math.PI * 0.35); });
    await shot('dark', 1500);
    await shot('dark_b', 450);   // 半秒后再一帧：符文环 / 碎晶在转
  }
  if (scenes.includes('darktip')) {
    if (!VIEWS[name].hasTouch) {
      await ev(() => { window.__game.camSet(9, 0.5); document.getElementById('btn-char').click(); });
      await page.waitForTimeout(900);
      await hov('#char [data-slot="mainHand"]'); await shot('darktip');
      await unhov('#char [data-slot="mainHand"]');
    } else {
      await ev(() => { window.__game.camSet(9, 0.5); document.getElementById('btn-bag').click(); });
      await page.waitForTimeout(300);
      await ev(() => { const c = [...document.querySelectorAll('#bag-eq .mcell')].find(e => e.dataset.slot === 'mainHand') ?? document.querySelectorAll('#bag-eq .mcell')[0]; c.click(); });
      await shot('darktip');
    }
    await closeAll();
  }
  if (scenes.includes('dropguide')) {
    await ev(() => window.__game.openDropGuide('raid_boss'));
    await shot('dropguide');
    await closeAll();
  }
  if (scenes.includes('charsheet') || scenes.includes('settip')) {
    await ev(() => document.getElementById('btn-char').click());
    await page.waitForTimeout(1200);
    if (scenes.includes('charsheet')) {
      await shot('charsheet');
      await ev(() => { const s = document.getElementById('char-stats'); if (s) s.scrollTop = s.scrollHeight; });
      await shot('charsheet_sets', 300);
    }
    if (scenes.includes('settip') && !VIEWS[name].hasTouch) { await hov('#char [data-slot="head"]'); await shot('settip'); await unhov('#char [data-slot="head"]'); }
    await closeAll();
  }
  console.log(name, errors.length ? `❌ ${errors.length} 错误:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}` : '✅ 无错误');
  errs += errors.length;
  await ctx.close();
}
await b.close();
if (errs) process.exitCode = 1;
