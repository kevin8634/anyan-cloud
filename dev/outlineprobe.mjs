// 10-27 描边排查：列出仍套卡通描边的「有贴图写实材质」网格，带世界坐标 / 包围盒 / 顶点数 / 祖先链 / 材质与贴图信息，方便定位无名网格的来源
//   node dev/outlineprobe.mjs <html> [maps=dlc1_mirror,dlc1_coast] [quality=ultra]
//   ALL=1：不限「有贴图」——列出所有还带描边的可见网格（程序化岩块 / 山体没有 map，原版筛不到）；NEAR=x,z,r 只看本地图原点坐标附近
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, MAPS = 'dlc1_mirror,dlc1_coast', Q = 'ultra'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);
await page.addInitScript(q => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: 'new' })); } }, Q);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(5000);
for (const map of MAPS.split(',')) {
  await page.evaluate(id => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
    try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); } catch (e) {}
    try { g.ensureWild(id); } catch (e) {} g.goMap(id); }, map);
  await page.waitForTimeout(15000);
  const r = await page.evaluate(([ALL, NEAR]) => { const g = window.__game, V = g.scene.position.constructor, out = {};
    g.scene.traverse(o => { if (!o.isMesh) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m || (!ALL && (!m.isMeshStandardMaterial || !m.map)) || m.userData?.outlineParameters?.visible === false || o.userData?.outlineParameters?.visible === false || m.isShaderMaterial || m.isMeshBasicMaterial || m.transparent) continue;
        if (NEAR) { const [nx, nz, nr] = NEAR; const w = o.getWorldPosition(new g.scene.position.constructor()); const ox = 2400, oz = -2100; /* 镜渊城原点（同 sea5shots） */ if (Math.hypot(w.x - ox - nx, w.z - oz - nz) > nr) continue; }
        const chain = []; for (let p = o; p && p !== g.scene; p = p.parent) chain.push((p.type || '?') + (p.name ? ':' + p.name : '') + (Object.keys(p.userData || {}).length ? '{' + Object.keys(p.userData).join(',') + '}' : ''));
        const wp = o.getWorldPosition(new V()); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const s = o.geometry.boundingBox.getSize(new V()).multiply(o.getWorldScale(new V()));
        const img = m.map?.image, key = chain.join(' < ') + ` | v=${o.geometry.getAttribute('position')?.count} size=${s.x.toFixed(1)}x${s.y.toFixed(1)}x${s.z.toFixed(1)} map=${m.map?.name || m.map?.userData?.texName || ''}${img ? ' ' + img.width + 'x' + img.height : ''} mat=${m.name || ''}{${Object.keys(m.userData || {}).join(',')}}`;
        (out[key] ??= []).push([+wp.x.toFixed(0), +wp.y.toFixed(1), +wp.z.toFixed(0)]); } });
    return out; }, [!!process.env.ALL, process.env.NEAR ? process.env.NEAR.split(',').map(Number) : null]);
  console.log('== ' + map); for (const [k, v] of Object.entries(r)) console.log(`${v.length}× ${k}\n    @ ${JSON.stringify(v.slice(0, 4))}`);
}
await b.close().catch(() => {});
