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
await page.evaluate(m => { const g = window.__game; g.tutFinish?.(); g.progression.level = 38; g.player.hp = g.player.maxHp = 1e7; g.ensureWild(m); g.goMap(m); }, map);
await page.waitForTimeout(2000);
let fail = 0;
for (const k of kinds.split(',')) {
  const r = await page.evaluate(k => { const g = window.__game; const e = g.enemies.find(x => (x.kind ?? x.type) === k && x.hp > 0);
    if (!e) return { err: 'no ' + k, kinds: [...new Set(g.enemies.map(x => x.kind ?? x.type))].slice(0, 20) };
    g.enemies.forEach(x => { if (x !== e && x.rig) x.rig.root.visible = false; });
    window.__P0 ??= e.pos.clone(); e.pos.copy(window.__P0); const P = e.pos; g.player.pos.set(P.x + 4.5, 0, P.z + 1); g.player.hp = 1e7; e.aggro = false;
    g.camSet?.(7, 0.3); g.camYawSet?.(Math.PI / 2); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; });
    return { ok: true, glb: !!e.rig?.root?.children?.[0]?.children?.[0]?.material?.isMeshStandardMaterial }; }, k);
  if (r.err) { console.log('FAIL', r.err, JSON.stringify(r.kinds)); fail++; continue; }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${k}.png` });
  console.log(`SHOT ${k} lux=${r.glb}`);
  await page.evaluate(() => { window.__game.enemies.forEach(x => { if (x.rig) x.rig.root.visible = true; }); });
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS'); await b.close(); process.exit(fail ? 1 : 0);
