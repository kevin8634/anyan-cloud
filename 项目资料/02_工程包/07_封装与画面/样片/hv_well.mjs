// 电影感画质自查：桌面版构建 → 进游戏（营地或指定地图）→ 各画质 × 3 朝向（含正对太阳）截图 + 着色器报错统计 + 亮度统计
// node cine_shot.mjs <输出目录> [map=none] [qualities=high,medium,low]
import { chromium } from '/workspace/work/p73/node_modules/playwright-core/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const OUT = process.argv[2]; const logs = [], MAP = process.argv[3] || 'none', QS = (process.argv[4] || 'high,medium,low').split(',');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = '/workspace/work/electron1109/web/desktop';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) f = path.join('/workspace/work/electron1109/web', decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8767);
const meta = { id: 'dk', name: '测试', classId: process.env.CLS || 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
const SAVE = { version: 10, savedAt: 1, classId: process.env.CLS || 'warrior', name: '测试', level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, inventory: { gold: 10, bag: [], equipped: {} } };
const t0 = Date.now();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } }); const errs = [];
page.on('console', m => { const t = m.text(); if (/Shader Error|WebGLProgram|ERROR:|THREE\.WebGL|patch miss/i.test(t)) errs.push(t.slice(0, 600)); });
page.on('pageerror', e => { errs.push('PAGEERR ' + e.message); console.log('PAGEERR', (e.stack || e.message).slice(0, 600)); });
page.setDefaultTimeout(900000);
await page.addInitScript(([m, s]) => {
  window.__drfs = { read(p) { const x = new XMLHttpRequest(); x.open('GET', '/' + p, false); x.overrideMimeType('text/plain; charset=x-user-defined'); x.send(); const t = x.responseText, u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255; return u; }, mark() {}, log() {} };
  if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' }));
    localStorage.setItem('darkrock_roster', JSON.stringify({ v: 1, slots: [m, null, null, null, null, null, null, null], last: 'dk', legacyMigrated: true })); localStorage.setItem('darkrock_char_dk', JSON.stringify(s)); }
}, [meta, SAVE]);

page.on('console', m => { const t = m.text(); if (/selwarm|selopen|patch miss/.test(t)) logs.push(t); });
await page.goto('http://127.0.0.1:8767/index.html?cg=0&op=0' + (process.env.Q || '') + '', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 240000 });
const PART = process.env.PART || 'all';
await page.evaluate(() => { const g = window.__game; g.selSlot = 0; g.renderTitle?.(); document.getElementById('start').click(); });
await page.waitForFunction(() => window.__game.curChar && document.getElementById('loading')?.style.display !== 'flex', null, { timeout: 300000 });
await page.waitForTimeout(6000);
const closeUi = () => page.evaluate(() => { const g = window.__game; g.tutFinish?.(); try { g.togglePanel?.('changelog', false); } catch {} document.getElementById('cls-help')?.remove(); });
await closeUi();
console.log('pre', await page.evaluate(() => JSON.stringify({ lv: window.__game.level?.level ?? window.__game.curChar?.level, map: window.__game.curMap?.id ?? window.__game.mapId })));
console.log('enter', await page.evaluate(() => { try { return window.__game.packDungeon.enter('dlc1_well_dg', 'normal'); } catch (e) { return 'ERR ' + e.message; } })); await page.waitForTimeout(25000);
console.log('post', await page.evaluate(() => JSON.stringify({ p: [window.__game.player.pos.x|0, window.__game.player.pos.z|0], map: window.__game.curMap?.id ?? window.__game.mapId }))); await closeUi();
const O = { x: 2700, z: -2700 };
const shot = async (n, x, z, yaw, p, d) => { await page.evaluate(([x, z]) => { const g = window.__game; g.player.pos.x = 2700 + x; g.player.pos.z = -2700 + z; }, [x, z]); await page.waitForTimeout(4000);
  await page.evaluate(([y, p, d]) => window.__dbg.cam(y, p, d), [yaw, p, d]); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
await page.screenshot({ path: `${OUT}/entry.png` });
await shot('ice_a', -26, -96, 0, 0.55, 14); await shot('ice_b', -26, -108, Math.PI, 0.35, 12); await shot('ice_c', -20, -102, Math.PI / 2, 0.2, 10);
await shot('wall_b5', 30, -16, 0.6, 0.05, 14); await shot('wall_b4', 86, 66, -2.2, 0.08, 14); await shot('wall_b2', -90, 6, 1.6, 0.1, 14);
console.log('ERRS', errs.length, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(0);
