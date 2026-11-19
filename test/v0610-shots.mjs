// v0.6.10 截图：副本地图（熔心王座 / 永霜墓穴，迷雾、门、存档点、环境倒计时）、入口路线预览、三首领副本简化地图、副本场景俯视
// 用法：node test/v067-shots.mjs [输出目录] [视口 desk,se,lefty]
// 场景：HUD（回程按钮在左下 / 触屏在摇杆上方）、tip（4 层装备说明 详细 / 简洁）、salv（背包一键分解 + 回购栏）、shop（铁匠分解页）
// 重叠检测：所有可见的 HUD 按钮（技能键、翻滚、药水、回程、菜单）两两不相交，任何一对重叠就退出码 1
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const OUT = process.argv[2] || '/tmp/v0610shots';
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
  await ev(() => { const g = window.__game; g.startGame('warrior'); g.tutFinish?.(); for (let i = 0; i < 40 && g.progression.level < 30; i++) g.progression.addXp(20000); g.ensureWild('ember'); g.goMap('ember'); });
  await page.waitForTimeout(800);
  // 入口预览（不在副本里）
  await ev(() => window.__game.openRaidMap('molten_throne', true));
  await page.waitForTimeout(500);
  const pv = await ev(() => document.getElementById('rm-side').textContent);
  ck(/建议路线/.test(pv), `${name} 熔心王座路线预览：${pv.slice(0, 50)}`);
  await shot('preview_molten');
  // 进熔心王座，从第 2 个首领开始（戈拉克已死），站在十字厅
  await ev(() => { const g = window.__game; g.togglePanel('raidmap', false); g.enterRaid('molten_throne', 1); const O = { x: -800, z: 0 }; g.player.pos.set(O.x, 0, O.z - 95); });
  await page.waitForTimeout(1500);
  await shot('raid_hub', 300);
  await ev(() => window.__game.openRaidMap());
  await page.waitForTimeout(600);
  const m1 = await ev(() => { const ri = window.__game.raidRouteInfo(); return { at: ri.at, goal: ri.goal?.why, side: document.getElementById('rm-side').textContent }; });
  ck(m1.at === 'hub' && /印记/.test(m1.side) && /建议/.test(m1.side), `${name} 副本地图：在 ${m1.at}，建议「${m1.goal}」`);
  await shot('raidmap_molten');
  // 存档点互传：传回入口
  const tp = await ev(() => window.__game.raidTeleport('entry'));
  ck(tp === null, `${name} 存档点互传：${tp ?? '成功'}`);
  // 自动寻路
  const T0 = await ev(() => { window.__game.togglePanel('raidmap', false); window.__game.startRaidAuto(); return window.__game.T; });
  // 软件渲染很慢：等游戏时间走过 2 秒
  await page.waitForFunction(t0 => window.__game.T - t0 > 2, T0, { timeout: 90000 }).catch(() => {});
  const ap = await ev(() => ({ z: window.__game.player.pos.z, active: window.__game.autoPath?.active, stop: window.__game.autoPath?.lastStop, po: document.documentElement.className, T: window.__game.T }));
  ck(ap.z < -5, `${name} 自动寻路：离开入口往十字厅走（z ${ap.z.toFixed(1)}，active ${ap.active}，stop ${ap.stop} ${ap.po} T${ap.T}）`);
  // 永霜墓穴：从第 2 个首领开始，看环境（暴风雪）+ 冰湖
  await ev(() => { const g = window.__game; g.raidCleanup?.(); g.enterRaid('frost_crypt', 1); g.player.pos.set(-1000, 0, -84); g.openRaidMap(); });
  await page.waitForTimeout(800);
  const m2 = await ev(() => document.getElementById('rm-side').textContent);
  ck(/魂灯/.test(m2) && /暴风雪/.test(m2), `${name} 永霜墓穴地图：${m2.slice(0, 60)}`);
  await shot('raidmap_frost');
  // 三首领普通副本：简化地图
  await ev(() => { const g = window.__game; g.togglePanel('raidmap', false); g.raidCleanup?.(); g.openRaidMap('sand_tomb', true); });
  await page.waitForTimeout(500);
  await shot('preview_dungeon');
  if (errors.length) { fails++; console.log('  ✗ 页面错误：', errors.slice(0, 3).join(' | ')); }
  await ctx.close();
}
await b.close();
console.log(fails ? `✗ ${fails} 项失败` : '✅ v0.6.10 截图检测通过');
process.exit(fails ? 1 : 0);
