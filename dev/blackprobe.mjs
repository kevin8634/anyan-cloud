// 10-27 排查倒钟广场「黑色碎片」（结论：envhd 崖脚碎石 envhd_debris 按本体地形撒在海底地面下 / 上，已在 plaza_dress 标 envNoDebris）。经典 / 写实 + 超高画质：列出营地附近网格的材质概况，再数近景近黑像素、逐个隐藏候选网格找来源
//   node dev/blackprobe.mjs <html> [charModel=auto] [quality=ultra]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, CM = 'auto', Q = 'ultra'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
page.setDefaultTimeout(300000); page.setDefaultNavigationTimeout(300000);
await page.addInitScript(([q, cm]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, charModel: cm })); } }, [Q, CM]);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); });
await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse(o => { if (o.name?.startsWith('luxscene_')) n++; }); return n > 0; }, null, { timeout: 150000, polling: 2000 }).catch(() => console.log('no luxscene'));
await page.waitForTimeout(8000);
const r = await page.evaluate(() => { const g = window.__game, V = g.scene.position.constructor, O = [2400, -2100], out = {};
  g.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh)) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
    const w = o.getWorldPosition(new V()), lx = w.x - O[0], lz = w.z - O[1]; if (lx < -30 || lx > 40 || lz < 30 || lz > 100) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material; const chain = []; for (let p = o; p && p !== g.scene && chain.length < 5; p = p.parent) chain.push(p.name || p.type);
    const a = o.geometry?.getAttribute('position'); const col = m?.color ? m.color.getHexString() : '-';
    const k = `${chain.join('<')} | ${m?.type} col=${col} map=${!!m?.map} ${m?.map?.image ? m.map.image.width : ''} inst=${o.isInstancedMesh ? o.count : 0} v=${a?.count} arr=${a?.array?.constructor?.name} norm=${a?.normalized} ud=${Object.keys(o.userData || {}).join(',')}/${Object.keys(m?.userData || {}).join(',')}`;
    (out[k] ??= []).push([+lx.toFixed(1), +w.y.toFixed(1), +lz.toFixed(1)]); });
  return out; });
for (const [k, v] of Object.entries(r)) console.log(`${v.length}× ${k} @ ${JSON.stringify(v.slice(0, 3))}`);
await page.evaluate(() => { const O = [2400, -2100]; window.__camOv = [O[0] + 20, 7, O[1] + 94, O[0] - 2, 5, O[1] + 50]; });

// 10-27 第二步：截图数近黑像素；包围盒落在近景区的网格逐个隐藏，看哪一个让黑像素变少
await page.waitForTimeout(4000);
const sharp = (await import('sharp')).default;
const blackCount = async (path) => { const buf = await page.screenshot(path ? { path } : {}); const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); let n = 0;
  for (let y = 300; y < 530; y += 3) for (let x = 180; x < 800; x += 3) { const i = (y * info.width + x) * info.channels; if (data[i] + data[i + 1] + data[i + 2] < 24) n++; } return n; };
const base = await blackCount('/tmp/blackprobe.png'); console.log('black px base', base);
const cands = await page.evaluate(() => { const g = window.__game, O = [2400, -2100], L = []; window.__cands = [];
  g.scene.traverse(o => { if (!o.isMesh) return; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (!v) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (o.isInstancedMesh) { bb.min.x -= 400; bb.max.x += 400; bb.min.z -= 400; bb.max.z += 400; }
    if (bb.max.x - O[0] < -40 || bb.min.x - O[0] > 45 || bb.max.z - O[1] < 60 || bb.min.z - O[1] > 100) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material, ch = []; for (let q = o; q && q !== g.scene && ch.length < 4; q = q.parent) ch.push(q.name || q.type);
    window.__cands.push(o); L.push(`${ch.join('<')} | ${m.type} ${m.color ? m.color.getHexString() : ''} inst=${o.isInstancedMesh ? o.count : 0} v=${o.geometry.getAttribute('position').count} ud=${Object.keys(o.userData).join(',')}/${Object.keys(m.userData).join(',')}`); });
  return L; });
console.log('cands', cands.length);
for (let i = 0; i < cands.length && i < (+process.env.MAXC || 160); i++) {
  await page.evaluate(i => { window.__cands[i].visible = false; }, i); await page.waitForTimeout(250);
  const n = await blackCount(); if (n < base * 0.85) { console.log(`HIDE#${i} black ${base}→${n} :: ${cands[i]}`);
    console.log(JSON.stringify(await page.evaluate(i => { const o = window.__cands[i], m = o.material, h = o.userData.hdOrig, bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const info = (x) => x && ({ type: x.type, name: x.name, col: x.color?.getHexString(), map: x.map?.userData?.texName ?? !!x.map, ud: x.userData, transparent: x.transparent, depthWrite: x.depthWrite, side: x.side, vc: x.vertexColors, key: x.customProgramCacheKey?.toString().slice(0, 120) });
      return { name: o.name, pos: o.position.toArray(), ro: o.renderOrder, bb: [bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))], attrs: Object.keys(o.geometry.attributes), idx: o.geometry.index?.count, ud: Object.keys(o.userData), mat: info(m), orig: info(h), parentKids: o.parent.children.length, sibIdx: o.parent.children.indexOf(o) }; }, i), (k, v) => typeof v === 'number' ? +v.toFixed(3) : v)); }
  await page.evaluate(i => { window.__cands[i].visible = true; }, i); }
console.log('probe done');
await Promise.race([b.close().catch(() => {}), new Promise(r => setTimeout(r, 15000))]); process.exit(0);
