// 遗迹件材质前后对比（比赛版 DLC 镜渊城）：沉钟近景 / 遗迹石件 / 广场全景 + 全图写实件排查（紫描边 = 有贴图的写实材质没关描边；未贴图 = luxscene 无 map）
//   node dev/ruinshots.mjs <html> <输出目录> <前缀> [quality=ultra] [maps=dlc1_mirror,dlc1_coast,...]
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/ruinshots', PRE = 'r', Q = 'ultra', MAPS = 'dlc1_mirror'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);
await page.addInitScript(q => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: 'new' })); } }, Q);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(5000);
const scan = () => page.evaluate(() => { const g = window.__game, R = {}, add = (k, n) => { R[k] ??= {}; R[k][n] = (R[k][n] || 0) + 1; };
  g.scene.traverse(o => { if (!o.isMesh || !o.visible) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) { if (!m) continue; const nm = (o.name || [o.parent?.name, o.parent?.parent?.name, o.parent?.parent?.parent?.name].filter(Boolean).join('<') || '?') + (o.name ? '' : ' {' + o.geometry?.type + (m.map?.userData?.texName ? ' ' + m.map.userData.texName : '') + '}');
      const ol = m.userData?.outlineParameters?.visible !== false && !m.isShaderMaterial && !m.isMeshBasicMaterial && !m.isPointsMaterial && !m.isSpriteMaterial;
      const real = m.isMeshStandardMaterial && !!m.map;
      if (real && ol) add('写实件仍有描边', nm + ' [' + m.type + ']');
      if (nm.startsWith('luxscene_') && !m.map && !m.userData?.envHd) add('luxscene 无贴图', nm);
      if (nm.startsWith('luxscene_')) add('luxscene 材质', nm + (m.userData?.envHd ? ' envhd=' + m.userData.envHd : ' (无细节层)') + (ol ? ' 描边' : '')); } });
  return R; });
for (const map of (process.env.NOSCAN ? [] : MAPS.split(','))) {
  await page.evaluate(id => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
    try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); d.domain.setLv('belfry', 1); } catch (e) {}
    try { g.ensureWild(id); } catch (e) {} g.goMap(id); }, map);
  await page.waitForTimeout(9000);
  console.log('scan', map, JSON.stringify(await scan(), null, 1));
}
// 机位：回镜渊城；找碎钟断柱组（luxscene_scene_ruins），按模型正面（+z，钟在这一侧）摆镜头
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); }); await page.waitForTimeout(8000);
// 10-27：NOSCAN 时场景模型可能还没解析完（断柱组走程序化回退）→ 最多再等 120 秒出现 luxscene_scene_ruins，再等 4 秒细节层
await page.waitForFunction(() => { let f = false; window.__game.scene.traverse(o => { if (o.name === 'luxscene_scene_ruins') f = true; }); return f; }, null, { timeout: 120000, polling: 2000 }).catch(() => console.log('等不到 luxscene_scene_ruins'));
await page.waitForTimeout(4000);
const ruins = await page.evaluate(() => { const g = window.__game, V = g.scene.position.constructor, out = [];
  g.scene.traverse(o => { if (o.name !== 'luxscene_scene_ruins') return; const p = o.getWorldPosition(new V()), f = new V(0, 0, 1).transformDirection(o.matrixWorld); const s = o.getWorldScale(new V()).x; out.push({ p: [p.x, p.y, p.z], f: [f.x, f.z], s }); });
  return out; });
console.log('ruins', JSON.stringify(ruins));
const O = [2400, -2100];
const pick = (lx, lz) => ruins.reduce((a, r) => Math.hypot(r.p[0] - O[0] - lx, r.p[2] - O[1] - lz) < Math.hypot(a.p[0] - O[0] - lx, a.p[2] - O[1] - lz) ? r : a, ruins[0]);
const shots = [];
if (ruins.length) {
  const A = pick(16, 44), B = pick(54, -24), C = pick(-14, 40), D = pick(-44, 18);
  const cam = (r, d, h, side, ty) => { const fx = r.f[0], fz = r.f[1], sx = -fz, sz = fx; return [r.p[0] + fx * d + sx * side, h, r.p[2] + fz * d + sz * side, r.p[0], ty, r.p[2]]; };
  // 10-27：原 3 号机位 cam(D,12,…) 落进建筑墙里 → 候选机位里挑「镜头点不在任何小于 80 m 的网格包围盒内」且离目标视线最通透的；CAM3=x,y,z,tx,ty,tz 可固定（改前/改后用同一机位）
  let c3 = process.env.CAM3 ? process.env.CAM3.split(',').map(Number) : null;
  if (!c3) { const cands = []; for (const r of ruins) if (r !== A && r !== B && r !== C) for (const d of [12, -12, 10, -10]) for (const sd of [3, -3, 0]) cands.push(cam(r, d, 4.4, sd, 2.4));
    const sc = await page.evaluate(cands => { const g = window.__game, V = g.scene.position.constructor; let B3 = null; const boxes = [];
      g.scene.traverse(o => { if (!o.isMesh || !o.visible || o.isInstancedMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); B3 ??= o.geometry.boundingBox.constructor; const bx = new B3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); const sz = bx.getSize(new V()); if (Math.max(sz.x, sz.y, sz.z) < 80 && sz.y > 1) boxes.push(bx); });
      return cands.map(c => { const cp = new V(c[0], c[1], c[2]), tp = new V(c[3], c[4], c[5]); let n = 0; for (const b of boxes) { if (b.containsPoint(cp)) n += 10; else for (let k = 1; k < 6; k++) if (b.containsPoint(cp.clone().lerp(tp, k / 8))) { n++; break; } } return n; }); }, cands);
    let bi = 0; sc.forEach((v, i) => { if (v < sc[bi]) bi = i; }); c3 = cands[bi]; console.log('cam3 score', sc[bi], 'CAM3=' + c3.map(v => +v.toFixed(2)).join(',')); }
  shots.push(['1_沉钟近景', cam(A, 6.8, 2.3, 1.6, 1.1)], ['2_沉钟近景B', cam(C, 6.0, 2.2, -1.4, 1.0)], ['3_遗迹石件', c3], ['4_遗迹石件侧', cam(B, -9.5, 4.0, 6, 2.4)]);
}
shots.push(['5_广场全景', [O[0] + 6, 16, O[1] + 92, O[0] + 2, 0, O[1] + 40]], ['6_长街全景', [O[0] + 30, 14, O[1] + 60, O[0] + 10, 0, O[1] + 20]]);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [name, c] of shots.filter(s => !ONLY || ONLY.includes(s[0].split('_')[0]))) {
  await page.evaluate(c => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    g.player.pos.set(c[0] + 2, 0, c[2] + 2); if (g.player.rig) g.player.rig.root.visible = false; window.__camOv = c;
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; document.querySelectorAll('body > *').forEach(p => { if (p !== cv && !p.contains(cv)) p.style.visibility = 'hidden'; }); document.querySelectorAll('canvas').forEach(x => { if (x !== cv) x.style.visibility = 'hidden'; }); }, c);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` }); console.log('shot', name);
}
console.log('errors:', JSON.stringify(errors.slice(0, 8)));
await b.close().catch(() => {});
