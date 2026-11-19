// A7 调试：首领模型层级 + 几何包围盒（node dev/a7dbg.mjs medium）
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
const r = await page.evaluate(() => {
  const B = window.__game.packDungeon.units().boss, root = B.rig.root; root.updateMatrixWorld(true);
  const depth = (x) => { let n = 0; while (x && x !== root) { n++; x = x.parent; } return n; };
  const lines = []; root.traverse(o => { const e = o.matrixWorld.elements; const sy = Math.hypot(e[4], e[5], e[6]); let bb = '';
    if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; const P = o.geometry.attributes.position; bb = ` gbox y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} verts=${P.count} norm=${P.normalized} arr=${P.array.constructor.name}`; }
    lines.push(`${'  '.repeat(depth(o))}${o.type} ${o.name} sy=${sy.toFixed(3)} wy=${e[13].toFixed(2)}${bb}`); });
  return { pos: B.pos, scale: B.rig.scale, lines }; });
console.log(JSON.stringify(r, null, 1)); await b.close();
