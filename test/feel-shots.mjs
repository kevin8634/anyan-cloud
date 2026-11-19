// 第七版截图：新手引导步骤 / 设置面板 / 战斗中的暴击飘字 / 翻滚键（手机 667×375 触屏 + 电脑 1280×720）
// 用法：node test/feel-shots.mjs [输出目录] [视口 se,desk] [画质 low|medium|high]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/shots-v7';
mkdirSync(OUT, { recursive: true });
const VIEWS = {
  se: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const pick = (process.argv[3] || 'se,desk').split(',');
const quality = process.argv[4] || 'medium';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let errs = 0;
for (const name of pick) {
  const ctx = await b.newContext({ ...VIEWS[name], userAgent: VIEWS[name].isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(q => { try { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } } catch { } }, quality);
  await page.goto('file://' + resolve('web/index.html'));
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
  const shot = async (s, ms = 400) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}/${name}_${s}.png` }); console.log('📸', name, s); };
  const ev = (f, a) => page.evaluate(f, a);
  // 1. 新手引导：新存档 → 走到「打训练假人」这一步（高亮普攻/技能键 + 假人头上的箭头）
  await ev(() => { const g = window.__game; g.startGame('warrior'); });
  await page.waitForTimeout(1200);
  await shot('tut_move');
  await ev(() => { const g = window.__game; g.player.pos.set(2, 0, 8); });
  await page.waitForTimeout(300);
  await ev(() => { const g = window.__game; g.keys.add('d'); });
  await page.waitForTimeout(900);
  await ev(() => { const g = window.__game; g.keys.delete('d'); g.openDialog('bran'); const bt = [...document.querySelectorAll('#dlg-body button')].find(x => /接受/.test(x.textContent)); bt?.click(); document.querySelector('[data-close=dialog]').click(); g.startAutoPath(); });
  await page.waitForTimeout(800);
  await ev(() => { const g = window.__game; g.player.pos.set(g.dummy.pos.x - 4.5, 0, g.dummy.pos.z + 5); g.player.rig.root.rotation.y = Math.atan2(g.dummy.pos.x - g.player.pos.x, g.dummy.pos.z - g.player.pos.z); g.camYawSet(Math.atan2(g.player.pos.x - g.dummy.pos.x, g.player.pos.z - g.dummy.pos.z)); });
  await shot('tutorial', 1200);
  // 翻滚这一步：红圈 + 翻滚键高亮
  await ev(() => { const g = window.__game; g.player.pos.set(g.dummy.pos.x - 2, 0, g.dummy.pos.z + 1.5); g.tryCast('basic'); });
  await page.waitForTimeout(700);
  await ev(() => { const g = window.__game; g.tryCast('skill2'); });
  await page.waitForFunction(() => !!window.__game.tutCircle && window.__game.tutCircle.left < 0.9, null, { timeout: 8000 }).catch(() => {});
  await shot('tut_dodge', 50);
  await ev(() => window.__game.tryDodge());
  await shot('dodge_roll', 120);
  await page.waitForTimeout(1500);
  // 2. 设置面板
  await ev(() => window.__game.tutFinish(true));
  await ev(() => { document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); document.getElementById('btn-settings').click(); });
  await shot('settings', 500);
  await ev(() => document.querySelector('[data-close=settings]').click());
  // 3. 战斗：狼林里打一群狼，提高暴击率让暴击飘字出现
  await ev(() => { const g = window.__game; g.progression.addXp(1200); g.player.critChance = 0.55; g.player.maxHp = 5000; g.player.hp = 5000;
    const wolves = g.enemies.filter(e => e.kind === 'wolf' && e.alive).slice(0, 4);
    const c = wolves[0].pos.clone(); g.player.pos.set(c.x - 2, 0, c.z); wolves.forEach((w, i) => { w.pos.set(c.x + Math.cos(i * 1.6) * 1.6, 0, c.z + Math.sin(i * 1.6) * 1.6); w.brain.provoke(); });
    g.target = wolves[0]; g.camYawSet(Math.PI / 2 + 0.3); });
  for (let i = 0; i < 6; i++) { await ev(() => { const g = window.__game; g.player.critChance = 0.55; g.tryCast('basic'); g.tryCast('skill2'); g.tryCast('skill3'); if (g.target && !g.target.alive) g.target = g.enemies.find(e => e.alive && e.kind === 'wolf' && e.z === 'world' && e.pos.distanceTo(g.player.pos) < 8) ?? null; }); await page.waitForTimeout(160); }
  await shot('crit_fight', 60);
  // 4. 翻滚键 / HUD
  await ev(() => { const g = window.__game; g.player.pos.set(2, 0, 8); g.camYawSet(Math.PI * 0.85); });
  await shot('hud_dodge', 1800);
  console.log(name, errors.length ? `❌ ${errors.length} 错误:\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}` : '✅ 无错误');
  errs += errors.length;
  await ctx.close();
}
await b.close();
if (errs) process.exitCode = 1;
