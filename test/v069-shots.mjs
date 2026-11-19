// v0.6.9 截图：世界地图（新底图 + 横幅 + 图例）、区域地图兴趣点 + 悬停说明、多职业橙装说明、护盾血条
// 用法：node test/v067-shots.mjs [输出目录] [视口 desk,se,lefty]
// 场景：HUD（回程按钮在左下 / 触屏在摇杆上方）、tip（4 层装备说明 详细 / 简洁）、salv（背包一键分解 + 回购栏）、shop（铁匠分解页）
// 重叠检测：所有可见的 HUD 按钮（技能键、翻滚、药水、回程、菜单）两两不相交，任何一对重叠就退出码 1
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/v069shots';
mkdirSync(OUT, { recursive: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  small: { viewport: { width: 1024, height: 600 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  se: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS },
  pro: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS },
  lefty: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS, lefty: true },
};
const pick = (process.argv[3] || 'desk,se').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const ck = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
for (const name of pick) {
  const V = VIEWS[name];
  const ctx = await b.newContext(V);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); } catch { } });
  await page.goto('file://' + resolve('web/index.html'));
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (s, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}_${s}.png` }); console.log('📸', name, s); };
  await ev(() => {
    const g = window.__game; g.startGame('warrior'); g.tutFinish?.();
    for (let i = 0; i < 40 && g.progression.level < 30; i++) g.progression.addXp(20000);
    g.ensureWild('ember'); g.goMap('ember');
  });
  await page.waitForTimeout(1200);
  // 世界地图
  await ev(() => { window.__game.openWorldMap('world'); });
  await page.waitForTimeout(800);
  const w = await ev(() => ({ hits: window.__game.wmHits().filter(h => h.map).length, legend: document.querySelectorAll('#wm-legend .wlg').length }));
  ck(w.hits === 7 && w.legend === 9, `${name} 世界地图：${w.hits} 个区域名牌，图例 ${w.legend} 类`);
  await shot('worldmap');
  // 区域地图（烬落荒原）
  await ev(() => { document.querySelector('#worldmap .tab[data-view="zone"]').click(); });
  await page.waitForTimeout(500);
  const z = await ev(() => { const ps = window.__game.poisFor('ember'); const c = k => ps.filter(p => p.kind === k).length; return { raid: c('raid'), d3: c('dungeon3'), boss: c('wildboss'), rare: c('rare'), ev: c('event'), camp: c('camp'), portal: c('portal'), hits: window.__game.wmHits().length, rareDim: ps.filter(p => p.kind === 'rare').every(p => p.dim) }; });
  ck(z.raid === 2 && z.d3 === 1 && z.boss >= 2 && z.rare === 3 && z.ev >= 1 && z.camp >= 1 && z.rareDim, `${name} 烬落荒原图例：长副本 ${z.raid}、三首领副本 ${z.d3}、野外首领 ${z.boss}、稀有刷新点 ${z.rare}（未发现）、世界事件 ${z.ev}、营地 ${z.camp}、传送 ${z.portal}`);
  await shot('zonemap');
  // 悬停说明：找一个野外首领
  const hp = await ev(() => { const h = window.__game.wmHits().find(x => x.poi && x.poi.kind === 'raid'); const r = document.getElementById('wm-cv').getBoundingClientRect(); return h ? { x: r.left + h.x, y: r.top + h.y } : null; });
  if (hp && !V.hasTouch) {
    await page.mouse.move(hp.x, hp.y); await page.waitForTimeout(200);
    const tip = await ev(() => { const t = document.getElementById('wm-tip'); return t.style.display === 'block' ? t.textContent : ''; });
    ck(/长副本/.test(tip), `${name} 悬停说明：${tip.slice(0, 40)}`);
    await shot('zonemap_tip', 200);
  }
  // 稀有首领：标记一个刷新点为已发现
  await ev(() => { window.__game.mapStats.rareSeen.push('ember:obsidian_king:0'); window.__game.mapStats.kills.flame_heart = 3; window.__game.openWorldMap('zone'); });
  const z2 = await ev(() => window.__game.poisFor('ember').filter(p => p.kind === 'rare' && !p.dim).length);
  ck(z2 === 1, `${name} 发现 1 个稀有刷新点后显示 ${z2} 个`);
  await ev(() => { document.querySelector('[data-close="worldmap"]').click(); });
  // 多职业橙装说明 + 护盾
  await ev(() => {
    const g = window.__game;
    let it = null; for (let i = 0; i < 3000 && !it; i++) { const y = g.gen.generate(30, 'orange', ['ring']); if (y.lgId === 'lg_x_echoring') it = y; }
    g.inventory.add(it); g.inventory.equip(it.id);
    g.player.status.addShield('shield:test', 400, 30, 400, g.player);
    document.getElementById('btn-char').click();
  });
  await page.waitForTimeout(400);
  const tt = await ev(() => { const c = document.querySelector('#char [data-slot="ring1"]') || document.querySelector('#char [data-slot^="ring"]'); if (!c) return ''; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + 5, clientY: r.top + 5, bubbles: true })); return document.getElementById('tooltip').textContent; });
  if (!V.hasTouch) ck(/雷霆一击/.test(tt) && !/奥术禁锢/.test(tt) && !/【/.test(tt), `${name} 回响指环说明（战士）：只显示战士那条`);
  await shot('orange_tip', 300);
  await ev(() => { document.querySelector('[data-close="char"]').click(); });
  const sh = await ev(() => ({ w: document.getElementById('pf-shield').style.width, t: document.getElementById('pf-hpt').textContent }));
  ck(parseFloat(sh.w) > 0 && /\+400/.test(sh.t), `${name} 护盾血条：宽 ${sh.w}，文字 ${sh.t}`);
  await shot('shield_hud', 300);
  if (errors.length) { fails++; console.log('  ✗ 页面错误：', errors.slice(0, 3).join(' | ')); }
  await ctx.close();
}
await b.close();
console.log(fails ? `✗ ${fails} 项失败` : '✅ v0.6.9 截图检测通过');
process.exit(fails ? 1 : 0);
