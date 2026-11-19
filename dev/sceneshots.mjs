// v1.2.45 场景件截图（比赛版 Lux3D 场景 vs 概念图）：node dev/sceneshots.mjs <html> <输出目录> [quality]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/scene', Q = 'ultra'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + resolve(html));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.evaluate(q => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: 'new' })); }, Q);
await page.reload();
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 120000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
// [地图, 原点, 镜头 [x,y,z,看x,看y,看z]（局部）, 名字]
const SH = [
  ['dlc1_coast', [2400, -2400], [14, 4, 14, 0, 2.5, -12], 'A_coast_bell'],
  ['dlc1_coast', [2400, -2400], [-30, 3, 30, -48, 2, 12], 'A_coast_wreck'],
  ['dlc1_coast', [2400, -2400], [30, 1.5, -6, 46, 6, -30], 'A_coast_spires_up'],
  ['dlc1_mirror', [2400, -2100], [0, 1.6, 10, 6, 30, -30], 'B_mirror_up'],
  ['dlc1_mirror', [2400, -2100], [0, 6, 40, 0, 4, 0], 'B_mirror_wide'],
  ['dlc1_belltower', [2400, -1800], [-20, 2, -30, -50, 18, -64], 'C_tower_up'],
  ['dlc1_belltower', [2400, -1800], [8, 3, -26, 0, 6, -40], 'C_gatebell'],
];
let cur = '';
for (const [m, o, c, name] of SH) {
  if (m !== cur) { await page.evaluate(m => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7; try { g.ensureWild(m); } catch (e) {} g.goMap(m); }, m); cur = m; await page.waitForTimeout(4000); }
  await page.evaluate(([o, c]) => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    g.player.pos.set(o[0] + c[0], 0, o[1] + c[2] - 3); if (g.player.rig) g.player.rig.root.visible = false;
    window.__camOv = [o[0] + c[0], c[1], o[1] + c[2], o[0] + c[3], c[4], o[1] + c[5]];
    document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); }, [o, c]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}
const lux = await page.evaluate(() => { let n = 0; window.__game.scene?.traverse?.(o => { if (o.userData?.luxScene) n++; }); return n; });
console.log('luxScene in last zone:', lux, 'errors:', errors.slice(0, 5));
await b.close();
