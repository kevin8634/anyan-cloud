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
const page = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
page.on('console', m => { const t = m.text(); if (/Shader Error|WebGLProgram|ERROR:|THREE\.WebGL|patch miss/i.test(t)) errs.push(t.slice(0, 600)); });
page.on('pageerror', e => { errs.push('PAGEERR ' + e.message); console.log('PAGEERR', e.message.slice(0, 300)); });
page.setDefaultTimeout(900000);
await page.addInitScript(([m, s]) => {
  window.__drfs = { read(p) { const x = new XMLHttpRequest(); x.open('GET', '/' + p, false); x.overrideMimeType('text/plain; charset=x-user-defined'); x.send(); const t = x.responseText, u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255; return u; }, mark() {}, log() {} };
  if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' }));
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
await page.evaluate(ids => { const g = window.__game, inv = g.inventory; for (const id of ids) { const it = g.gen.generateFixed(id, 84); if (!it) continue; const slot = it.slot === 'twoHand' || it.slot === 'oneHand' ? 'mainHand' : it.slot; inv.equipped[slot] = it; } g.refreshGear(); }, ['d40_h_triad', 'd40_h_bow']);
await page.evaluate(() => window.__game.goMap('dlc1_coast')); await page.waitForTimeout(25000); await closeUi();
// 坏着色器：找出编译失败的材质挂在谁身上
await page.waitForTimeout(1);
const bad = await page.evaluate(() => { const { renderer, scene } = window.__dbg, out = []; scene.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const p = renderer.properties.get(m)?.currentProgram; if (p?.diagnostics && !p.diagnostics.runnable) { let path = [], q = o; while (q && path.length < 6) { path.push(q.name || q.type); q = q.parent; } out.push(m.type + ' ' + (m.name || '-') + ' @ ' + path.join('<') + ' ud=' + JSON.stringify(Object.keys(m.userData))); } } }); return [...new Set(out)].slice(0, 12); });
console.log('bad', JSON.stringify(bad));
// 伊奥拉
const io = await page.evaluate(() => { const g = window.__game, V = g.player.pos.constructor; const ns = window.__dbg.npcs() ?? []; const nn = ns.find(n => /iola/.test(n.def?.id ?? n.id ?? '')); if (!nn) return 'no iola npcs=' + ns.length + ' ' + JSON.stringify(Object.keys(ns[0] ?? {})) + ' ' + ns.map(n => n.def?.id ?? n.id).join(',');
  const r0 = nn.rig?.root ?? nn.root ?? nn.mesh; let r = null; r0?.traverse?.(o => { if (!r && o.userData?.bodyK) r = o; }); r = r ?? r0; if (!r) return 'no root ' + JSON.stringify(Object.keys(nn)); let top = 0; r.updateMatrixWorld(true);
  r.traverse(o => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox?.(); const bb = o.geometry.boundingBox; if (!bb) return; top = Math.max(top, new V(0, bb.max.y, 0).applyMatrix4(o.matrixWorld).y); } });
  const rp = r.getWorldPosition(new V()); window.__iolaP = rp.clone(); return { ud: Object.keys(r.userData).join(','), q: window.__game.settings?.quality, h: +(top - rp.y).toFixed(2), bodyK: r.userData.bodyK, labelH: r.userData.labelH, pl: +(g.player.rig.root.scale.y).toFixed(2), x: +rp.x.toFixed(1), z: +rp.z.toFixed(1) }; });
console.log('iola', JSON.stringify(io));
for (const [k, dx, dz] of [['front', 0, 9], ['side', 8, 3], ['back', -3, -8]]) {
  await page.evaluate(([dx, dz]) => { const g = window.__game, p = window.__iolaP; if (!p) return; g.player.pos.set(p.x + dx, p.y, p.z + dz); g.player.rig.root.rotation.y = Math.atan2(-dx, -dz); window.__dbg.cam(Math.atan2(dx, dz), undefined, 10); }, [dx, dz]);
  await page.waitForTimeout(3500); await page.screenshot({ path: `${OUT}/iola_${k}.png` }); }

for (const [k, yaw] of [['n', 0], ['e', Math.PI / 2], ['s', Math.PI], ['w', -Math.PI / 2]]) {
  await page.evaluate(y => { window.__dbg.cam(y, 0.32, 16); }, yaw); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/sea_${k}.png` }); console.log('sea', k); }
console.log('errs', JSON.stringify(errs.slice(0, 8)));
await b.close();
