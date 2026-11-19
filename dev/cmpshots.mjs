// v1.2.35 新旧对照用：隐藏 UI 与玩家，镜头对准怪物（派生自 mobshots）
// v1.2.24 野外怪物近景截图（比赛版 Lux3D 怪物 vs 程序化）：node dev/mobshots.mjs <html> <地图id> <怪物 kind,逗号> <输出目录>
//   例：node dev/mobshots.mjs web/index_dlc1_比赛版.html dlc1_coast cs_drowned,cs_bellcrab /tmp/mob
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, map, kinds, OUT = '/tmp/mob'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 900, height: 620 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/blob:/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto('file://' + resolve(html));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(2500);
await page.evaluate(m => { const g = window.__game; g.tutFinish?.(); g.progression.level = 38; g.player.hp = g.player.maxHp = 1e7; try { g.ensureWild(m); } catch (e) {} g.goMap(m); }, map);
await page.waitForTimeout(2000);
let fail = 0;
for (const k of kinds.split(',')) {
  const r = await page.evaluate(k => { window.__CD = Number(k.split('@')[1] || 5); k = k.split('@')[0]; const g = window.__game; const e = g.enemies.find(x => (x.kind ?? x.type) === k && x.hp > 0);
    if (!e) return { err: 'no ' + k, kinds: [...new Set(g.enemies.map(x => x.kind ?? x.type))].slice(0, 20) };
    g.enemies.forEach(x => { if (x !== e) { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; } });
    window.__P0 ??= e.pos.clone(); e.pos.copy(window.__P0); const P = e.pos; g.player.pos.set(P.x + 0.01, 0, P.z + 0.01); g.player.hp = 1e7; e.aggro = false; e.speed = 0;
    if (g.player.rig) g.player.rig.root.visible = false; clearInterval(window.__pin); window.__pin = setInterval(() => { e.pos.copy(window.__P0); e.aggro = false; if (e.rig) e.rig.root.rotation.y = 0.6; g.player.pos.set(window.__P0.x + 0.01, 0, window.__P0.z + 0.01); const D = window.__CD; window.__camOv = [window.__P0.x + D * 0.45, D * 0.42, window.__P0.z + D * 0.9, window.__P0.x, D * 0.24, window.__P0.z]; }, 16);
    const bx = new (e.rig.root.constructor.prototype.constructor === Object ? Object : Object)(); void bx;
    g.camYawSet?.(0);
    document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; });
    return { ok: true, glb: !!e.rig?.root?.children?.[0]?.children?.[0]?.material?.isMeshStandardMaterial }; }, k);
  if (r.err) { console.log('FAIL', r.err, JSON.stringify(r.kinds)); fail++; continue; }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${k.split('@')[0]}.png` });
  console.log(`SHOT ${k.split('@')[0]} lux=${r.glb}`);
  
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS'); await b.close(); process.exit(fail ? 1 : 0);
