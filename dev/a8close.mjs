// raidA A8 摆渡双子 正式绑骨件近景核查：node dev/a8close.mjs [html] [outDir]
// 比赛版 DLC 中画质 swiftshader：跳到摆渡双子 → 50% 生渡上岸 → 把两只钉在原地、隐藏玩家，用 __camOv 定机位拍
//   死渡 / 生渡 正面 + 侧面近景（查手臂 / 躯干扭曲）、渡生引导光束（查起点 = 右手提灯灯芯）、同渡护壳（查尺寸）。
// 同时量：光束起点与 Prop_FerryLanternCore 世界坐标的距离、护壳半径与死渡身高之比、各骨（上臂 / 前臂 / 脊柱）世界朝向。写 close_log.json。
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, process.argv[3] || 'shots_a8close');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(300000); page.setDefaultTimeout(300000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
const log = { steps: [] };
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(20000);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(B.pos.x, 0, B.pos.z + 9); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; for (let k = 0; k < 6; k++) { g.fx.dealDamage(B, B.maxHp, 'physical', g.player); g.packDungeon.units().cores?.forEach(c => g.fx.dealDamage(c, c.maxHp * 9, 'physical', g.player)); } });
  await page.waitForTimeout(2500); await page.evaluate(() => { const g = window.__game; if (g.dgxDebug()?.pick) g.dgxPick(0); }); await page.waitForTimeout(1500);
}
await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(B.pos.x + 1, 0, B.pos.z + 10); });
await page.waitForTimeout(6000);
await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; window.__dlc1.well.twins.mendNow(999); g.fx.dealDamage(B, B.hp - B.maxHp * 0.49, 'physical', g.player); });
await page.waitForTimeout(4000);
// 钉住：死渡在 P0，生渡在 P0 + (9, 0)，都面朝 +z；玩家藏在后面 14 米、隐藏
await page.evaluate(() => {
  const g = window.__game, U = g.packDungeon.units(), D = U.boss, L = U.cores[0];
  window.__P0 = D.pos.clone(); window.__twin = { D, L };
  for (const e of (g.enemies ?? [])) if (e.alive && e.rig?.root !== D.rig.root && e.rig?.root !== L?.rig.root && !e.isBoss && !e.wbAdd && e.maxHp < 20000) { try { g.fx.dealDamage(e, e.maxHp * 9, 'physical', g.player); } catch {} }   // 只清小怪
  clearInterval(window.__pin);
  window.__pin = setInterval(() => {
    const P = window.__P0; D.pos.set(P.x, D.pos.y, P.z); D.rig.root.rotation.y = 0; if (L) { L.pos.set(P.x + 9, L.pos.y, P.z); L.rig.root.rotation.y = 0; }
    g.player.maxHp = 1e12; g.player.hp = 1e12; g.player.pos.set(P.x + 4.5, 0, P.z + 14); if (g.player.rig) g.player.rig.root.visible = false;
    if (window.__CAM) { const [ux, cx, cy, cz, tx, ty, tz] = window.__CAM; const X = P.x + ux; window.__camOv = [X + cx, cy, P.z + cz, X + tx, ty, P.z + tz]; }
  }, 16);
});
const H = await page.evaluate(() => window.__twin.D.rig.anim?.handle?.height ?? 4.3);
const measure = (tag) => page.evaluate((tag) => {
  const { D, L } = window.__twin, out = { tag, H: D.rig.anim?.handle?.height };
  const find = (u, n) => { let f = null; u?.rig.root.traverse(o => { if (!f && o.name === n) f = o; }); return f; };
  const wp = o => { const v = o.getWorldPosition(o.position.clone()); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]; };
  for (const [k, u] of [['death', D], ['life', L]]) {
    if (!u) continue; const h = u.rig.anim?.handle, r = {};
    for (const n of ['hips', 'chest', 'head', 'shR', 'elR', 'haR', 'shL', 'elL', 'haL']) { const v = h?.worldOf(n); if (v) r[n] = [+(v.x - u.pos.x).toFixed(2), +v.y.toFixed(2), +(v.z - u.pos.z).toFixed(2)]; }
    const lc = find(u, 'Prop_FerryLanternCore'); if (lc) { const p = wp(lc); r.lanternCore = [+(p[0] - u.pos.x).toFixed(2), p[1], +(p[2] - u.pos.z).toFixed(2)]; }
    out[k] = r;
  }
  let beam = null, shell = null; out.inScene = { death: !!D.rig.root.parent, life: !!L?.rig.root.parent, deathAlive: D.alive, lifeAlive: !!L?.alive };
  let sc = window.__game.player.rig?.root ?? D.rig.root; while (sc.parent) sc = sc.parent;
  sc.traverse(o => { if (o.name === 'wl_twin_beam') beam = o; if (o.name === 'wl_twin_shell') shell = o; });
  if (beam && beam.visible) { const piv = beam.userData.pivot, len = piv.scale.z, dir = beam.getWorldDirection(beam.position.clone()); const a = beam.position.clone().addScaledVector(dir, -len / 2); out.beamStart = [+(a.x - L.pos.x).toFixed(2), +a.y.toFixed(2), +(a.z - L.pos.z).toFixed(2)]; const lc = find(L, 'Prop_FerryLanternCore'); if (lc) out.beamToLantern = +a.distanceTo(lc.getWorldPosition(a.clone())).toFixed(2); }
  if (shell) out.shell = { visible: shell.visible, r: [+shell.scale.x.toFixed(2), +shell.scale.y.toFixed(2)], cy: +shell.position.y.toFixed(2) };
  out.twins = (({ mending, beam, shell, cd, lock }) => ({ mending, beam, shell, cd, lock }))(window.__dlc1.well.twins.info());
  return out;
}, tag);
const cam = async (name, c, wait = 2500) => { await page.evaluate(c => { window.__CAM = c; }, c); await page.waitForTimeout(wait); const m = await measure(name); log.steps.push(m); console.log(name, JSON.stringify(m)); await page.screenshot({ path: `${OUT}/${name}.jpg`, quality: 85 }); };
// 近景：正面 / 侧面（机位相对各自位置：death ux=0，life ux=9）
const d = H * 0.95, y = H * 0.55;
await cam('c1_死渡_正面', [0, 0, y, d, 0, H * 0.5, 0], 4000);
await cam('c2_死渡_侧面', [0, -d, y, 0.5, 0, H * 0.5, 0]);
await cam('c3_生渡_正面', [9, 0, y, d, 0, H * 0.5, 0]);
await cam('c4_生渡_侧面', [9, d, y, 0.5, 0, H * 0.5, 0]);
await cam('c5_生渡_上身', [9, -H * 0.15, H * 0.75, H * 0.55, -H * 0.05, H * 0.68, 0]);
// 护壳：两只同框
await cam('c6_护壳_双子', [4.5, 0, H * 0.7, H * 2.6, 0, H * 0.45, 0]);
// 渡生引导：光束
await page.evaluate(() => window.__dlc1.well.twins.mendNow(0)); await page.waitForTimeout(1500);
await cam('c7_引导光束', [4.5, 0, H * 0.75, H * 2.3, 0, H * 0.55, 0], 1500);
await cam('c8_引导光束_提灯近景', [9, -H * 0.2, H * 0.8, H * 0.8, -H * 0.15, H * 0.62, 0], 600);
log.errors = errors; writeFileSync(`${OUT}/close_log.json`, JSON.stringify(log, null, 1));
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await page.evaluate(() => clearInterval(window.__pin));
await b.close();
