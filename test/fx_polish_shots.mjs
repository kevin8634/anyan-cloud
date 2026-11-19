// 11-04 polish 前后对照截图（swiftshader 实机）：node test/fx_polish_shots.mjs <html> <outdir> <aby|zone> [tag]
//   aby ：深渊第 5 层首领，击杀后连拍，看胜利光柱（过曝 / 挡顶部对白）
//   zone：同一首领场地清场后，先拍待机画面，再在玩家身边铺一个首领地面区域（zoneStorm，ZONE_GAIN=1 为旧、0.8 为新；
//         旧版构建没有 gain 参数，传了也按 1），连拍，按区域所在屏幕方块和全屏算平均亮度，最亮帧 / 待机
//   输出：<outdir>/<mode>_<tag>_NN.png + <mode>_<tag>.json（每帧游戏时间、亮度）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || 'shots', MODE = process.argv[4] || 'aby', TAG = process.argv[5] || 'x';
const GAIN = +(process.env.ZONE_GAIN ?? 1), EL = process.env.ZONE_EL || 'fire', N = +(process.env.SHOT_N || 10);
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'high' })); } });
page.setDefaultTimeout(600000); await page.goto('file://' + HTML, { timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 30; document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); g.player.maxHp = g.player.hp = 1e9; });
const ok = await page.evaluate(() => window.__game.enterAbyss(777, 5));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 600000 }); await page.waitForTimeout(2500);
const info = await page.evaluate(() => { const g = window.__game; const d = g.abyssDebug().run;
  const bs = g.enemies.filter(e => e.alive && e.z === g.zone && e.isBoss); const e = bs[0];
  if (!e) return { ok: false, d };
  g.enemies.filter(x => x !== e && x.alive && x.z === g.zone).forEach(x => { x.hp = 0; x.alive = false; });
  g.player.pos.set(e.pos.x, 0, e.pos.z + 7); g.target = null; g.camYawSet?.(0); g.camSet(16, 0.75);
  return { ok: true, floor: d.floor, boss: e.type?.name, x: e.pos.x, z: e.pos.z }; });
console.log('enter', ok, JSON.stringify(info));
const hide = () => page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp; const a = document.getElementById('abyss'); if (a) a.style.display = 'none'; });
// 亮度：在页面里用 canvas 解码截图（避免依赖 node 图像库）
async function lum(buf, box) {
  return page.evaluate(async ({ b64, box }) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const m = (x0, y0, w, h) => { const d = x.getImageData(x0, y0, w, h).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4); };
    return { full: m(0, 0, c.width, c.height), box: box ? m(box.x, box.y, box.w, box.h) : null, top: m(Math.round(c.width * 0.25), 0, Math.round(c.width * 0.5), Math.round(c.height * 0.22)) }; }, { b64: buf.toString('base64'), box });
}
const rows = []; let k = 0;
async function shot(label, box) { await hide(); const T = await page.evaluate(() => window.__game.T); const buf = await page.screenshot({ timeout: 120000 });
  const f = `${OUT}/${MODE}_${TAG}_${String(k++).padStart(2, '0')}_${label}.png`; writeFileSync(f, buf); const L = await lum(buf, box); rows.push({ f, label, T, ...L }); console.log(label, T.toFixed(2), JSON.stringify(L)); }
if (MODE === 'aby') {
  await page.waitForTimeout(1500); await shot('idle');
  await page.evaluate(() => window.__game.abyssKillAll());
  for (let i = 0; i < N; i++) { await page.waitForTimeout(250); await shot('kill' + i); }
} else {
  await page.evaluate(() => window.__game.abyssKillAll());
  const T0 = await page.evaluate(() => window.__game.T);
  await page.waitForFunction(t0 => window.__game.T - t0 > 7, T0, { timeout: 600000, polling: 1000 });   // 等首领倒下特效放完
  const p = await page.evaluate(() => { const g = window.__game, P = g.player.pos; return { x: P.x, z: P.z - 3 }; });
  const box = await page.evaluate(({ p }) => { const g = window.__game, cam = g.camera, V = cam.position.constructor; const pts = [];
    for (const [dx, dz] of [[-3.4, 0], [3.4, 0], [0, -3.4], [0, 3.4]]) { const v = new V(p.x + dx, 0.2, p.z + dz).project(cam); pts.push([(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]); }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.min(innerWidth, Math.max(...xs)) - x0), h: Math.round(Math.min(innerHeight, Math.max(...ys)) - y0) }; }, { p });
  console.log('box', JSON.stringify(box));
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(400); await shot('idle' + i, box); }
  await page.evaluate(({ p, GAIN, EL }) => window.__game.fxTest.storm(p, 3.4, EL, 8, undefined, undefined, false, GAIN), { p, GAIN, EL });
  for (let i = 0; i < N; i++) { await page.waitForTimeout(300); await shot('zone' + i, box); }
  const idle = rows.filter(r => r.label.startsWith('idle')), zone = rows.filter(r => r.label.startsWith('zone'));
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sum = { gain: GAIN, el: EL, idleBox: avg(idle.map(r => r.box)), maxBox: Math.max(...zone.map(r => r.box)), idleFull: avg(idle.map(r => r.full)), maxFull: Math.max(...zone.map(r => r.full)) };
  sum.ratioBox = sum.maxBox / sum.idleBox; sum.ratioFull = sum.maxFull / sum.idleFull; console.log('SUMMARY', JSON.stringify(sum)); rows.push({ summary: sum });
}
writeFileSync(`${OUT}/${MODE}_${TAG}.json`, JSON.stringify({ html: HTML, info, rows, errors }, null, 1));
console.log(errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : 'NO ERRORS'); await b.close();
