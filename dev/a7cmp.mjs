// A7 前后对比截图（11-02）：node dev/a7cmp.mjs <比赛版DLC.html> <标签> [medium]
// 同一机位、同一流程跑 A6 / A7 两个构建：①北钟笼近景（开门 / 门框）②站进钟笼（交互键提示）③戈尔顿交战（预警 → 出手连拍，镜头拉远）
// 输出 shots_well/cmp_<标签>_*.jpg + 一行 JSON。两个版本都能跑（A6 没有 __dlc1.well.rig，按首领大脑判断预备）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(process.argv[2]), TAG = process.argv[3] || 'x', Q = process.argv[4] || 'medium', OUT = resolve(ROOT, 'shots_well');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(q => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, Q);
page.setDefaultNavigationTimeout(900000); page.setDefaultTimeout(900000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), TAG, ...a);
await page.goto('file://' + HTML); log('loaded');
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(15000); log('in dungeon');
const out = { tag: TAG, version: await page.evaluate(() => document.body.innerText.match(/v\d+\.\d+\.\d+[-\w]*/)?.[0]) };
const shot = async n => { await page.screenshot({ path: `${OUT}/cmp_${TAG}_${n}.jpg`, quality: 82 }); };
const put = (x, z) => page.evaluate(([x, z]) => { const g = window.__game; g.player.maxHp = 1e9; g.player.hp = 1e9; g.player.pos.set(2700 + x, g.player.pos.y, -2700 + z); }, [x, z]);
// 清小怪（截图干净、不被打断）
await page.evaluate(() => { const g = window.__game; for (const e of g.packDungeon.units().trash) if (e.alive) g.fx.dealDamage(e, e.maxHp * 2, 'physical', g.player); });
// ③ 戈尔顿：首领钉在出生点，玩家站在它正南 8 米
const bp = await page.evaluate(() => { const B = window.__game.packDungeon.units().boss; return { x: B.pos.x - 2700, z: B.pos.z + 2700 }; });
const pin = () => page.evaluate(([x, z]) => { const g = window.__game, B = g.packDungeon.units().boss; g.player.hp = g.player.maxHp; B.pos.x = 2700 + x; B.pos.z = -2700 + z; g.player.pos.set(2700 + x, g.player.pos.y, -2700 + z + 8); }, [bp.x, bp.z]);
await pin(); await page.waitForTimeout(3000); await pin(); await shot('3_boss');
const st = () => page.evaluate(() => { const B = window.__game.packDungeon.units().boss, br = B?.brain; return { tele: br?.activeTelegraphs?.length ?? 0, cast: br?.casting?.ab?.id ?? null, warn: document.getElementById('wl_raidwarn')?.style.opacity ?? null }; });
let frames = 0, got = false; const t0 = Date.now();
while (Date.now() - t0 < 900000) {
  await pin(); const s = await st();
  if (!got && (s.tele > 0 || s.cast)) { got = true; out.first = s; log('windup', JSON.stringify(s)); }
  if (got) { await shot(`4_f${String(frames).padStart(2, '0')}`); frames++; if (frames >= 10) break; }
  else await page.waitForTimeout(150);
}
const C = await page.evaluate(() => window.__dlc1.well.CAGES);
// ①（放在首领之后：站进笼子会触发乘坐，swiftshader 1 FPS 下一趟要几十秒）钟笼近景
await put(C[0].x + 4.2, C[0].z + 2.2); await page.waitForTimeout(3000); await shot('1_cage');
// ② 站进钟笼（A7：交互键提示；A6：0.6 秒后自动出发）
await put(C[0].x + 0.2, C[0].z); await page.waitForTimeout(400); await shot('2_cage_in');
out.prompt = await page.evaluate(() => window.__game.currentInteractable?.()?.label ?? null);
log('cage', JSON.stringify(out));
out.frames = frames; out.errors = errors.length; out.err0 = errors.slice(0, 3);
console.log(JSON.stringify(out));
await b.close();
