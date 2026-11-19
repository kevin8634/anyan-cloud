// A7 验收截图（11-02）：node dev/a7shot.mjs [medium|low] [html] → shots_well/a7_<画质>_*.jpg + a7_<画质>_gordon_*.jpg（GIF 帧）
// 比赛版 + medium：Lux3D 吊笼开门、交互键提示；戈尔顿读条预警 → 预备 → 出手（震屏 / 裂纹 / 尘土）→ 收招；镜头拉远。打印 JSON
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, Q = process.argv[2] || 'medium', HTML = resolve(ROOT, process.argv[3] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, 'shots_well');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(q => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, Q);
page.setDefaultNavigationTimeout(600000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(15000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const out = { quality: Q, zone: await page.evaluate(() => window.__game.zone) };
const put = (x, z) => page.evaluate(([x, z]) => { const g = window.__game; g.player.maxHp = 1e9; g.player.hp = 1e9; g.player.pos.set(2700 + x, g.player.pos.y, -2700 + z); }, [x, z]);
const C = await page.evaluate(() => window.__dlc1.well.CAGES);
// 1) 吊笼开门 + 交互键
await put(C[0].x + 4.5, C[0].z + 1.5); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/a7_${Q}_cage_door.jpg`, quality: 80 });
await put(C[0].x, C[0].z);
for (let k = 0; k < 150 && !out.prompt; k++) { await page.waitForTimeout(100); out.prompt = await page.evaluate(() => window.__game.currentInteractable()?.label ?? null); }
await page.screenshot({ path: `${OUT}/a7_${Q}_cage_prompt.jpg`, quality: 80 });
out.doors = (await page.evaluate(() => window.__dlc1.well.lift())).doors; out.lux = (await page.evaluate(() => window.__dlc1.well.lift())).cages.map(c => c.lux);
log('cage', JSON.stringify(out));
await put(-50, -20); await page.waitForTimeout(800);
// 2) 戈尔顿：等读条预警，连拍
const bp = await page.evaluate(() => { const B = window.__game.packDungeon.units().boss; return { x: B.pos.x - 2700, z: B.pos.z + 2700 }; });
await page.evaluate(() => { const g = window.__game; for (const e of g.packDungeon.units().trash) if (e.alive) g.fx.dealDamage(e, e.maxHp * 2, 'physical', g.player); });
// 首领钉在出生点、玩家站在它正南 8 米（镜头从南往北看，首领在画面正中偏上）
const pin = () => page.evaluate(([x, z]) => { const g = window.__game, B = g.packDungeon.units().boss; g.player.hp = g.player.maxHp; B.pos.x = 2700 + x; B.pos.z = -2700 + z; g.player.pos.set(2700 + x, g.player.pos.y, -2700 + z + 8); }, [bp.x, bp.z]);
await pin(); await page.waitForTimeout(2500); await pin();
await page.screenshot({ path: `${OUT}/a7_${Q}_gordon_campull.jpg`, quality: 80 });
if (process.env.A7_QUICK) { console.log(JSON.stringify({ ...out, errors: errors.length, err0: errors.slice(0, 3) })); await b.close(); process.exit(0); }
const w0 = await page.evaluate(() => window.__dlc1.well.rig().warns.length);
let frames = 0, got = false; const t0 = Date.now();
while (Date.now() - t0 < 1200000) {
  await pin(); const st = await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; const r = window.__dlc1.well.rig(); return { w: r.warns.length, act: B?.rig?.anim?.state?.().act ?? null, cam: r.cam }; });
  if (!got && st.w > w0) { got = true; out.warn = await page.evaluate(() => window.__dlc1.well.rig().warns.slice(-1)[0]); out.cam = st.cam; log('warn', JSON.stringify(out.warn)); }
  if (got) { await page.screenshot({ path: `${OUT}/a7_${Q}_gordon_${String(frames).padStart(3, '0')}.jpg`, quality: 75 }); frames++; if (frames >= 24) break; }
  else await page.waitForTimeout(200);
}
out.frames = frames; out.built = await page.evaluate(() => window.__dlc1.well.rig().built.wl_gordon);
out.log = await page.evaluate(() => window.__game.packDungeon.units().boss?.rig?.anim?.log?.slice(-4) ?? []);
out.errors = errors.length; out.err0 = errors.slice(0, 3);
console.log(JSON.stringify(out));
await b.close();
