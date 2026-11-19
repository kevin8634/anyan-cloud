// fix1109c #2：比赛版里实测玩家 / 写实 NPC 显示身高（蒙皮后真实高度 vs npc_c.ts runFit 的量法）
//   node test/fix1109c_npcfit.mjs <html> <cls...>   → 每个职业一行 JSON（stdout）
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'); const CLS = process.argv.slice(3).length ? process.argv.slice(3) : ['mage', 'warrior'];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
for (const cls of CLS) {
  const page = await b.newPage({ viewport: { width: 960, height: 540 } }); const T0 = Date.now(); page.setDefaultTimeout(1500000);
  page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 1500000 });
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 1500000 });
  await page.evaluate(c => window.__game.startGame(c), cls);
  await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 1500000 });
  await page.evaluate(() => { try { window.__game.goMap('dlc1_mirror'); } catch (e) { console.log('goMap err ' + e); } });
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex', null, { timeout: 1500000 });
  await page.waitForTimeout(8000);
  const m = await page.evaluate(() => { const g = window.__game; const T = g.player.rig.root.position.constructor;
    const raw = (o, sk) => { o.updateMatrixWorld(true); let lo = 1e9, hi = -1e9; o.traverse(c => { if (!c.isMesh || !c.visible || c.name === 'blob') return; if (sk && !c.isSkinnedMesh) return; if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const v = c.localToWorld(new T(x, y, z)); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } }); return +(hi - lo).toFixed(3); };
    const skinned = o => { o.updateMatrixWorld(true); let lo = 1e9, hi = -1e9; const v = new T(); o.traverse(c => { if (!c.isSkinnedMesh || !c.visible) return; const p = c.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i); c.applyBoneTransform(i, v); v.applyMatrix4(c.matrixWorld); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } }); return +(hi - lo).toFixed(3); };
    const r = g.player.rig.root; const out = { cls: g.cls?.id, body: r.userData.body40 ?? (r.userData.lux ? 'lux' : 'other'), rawSk: raw(r, true), trueH: skinned(r), fit: globalThis.__npcFit?.() ?? null, npcs: [] };
    g.scene.traverse(o => { const u = o.userData || {}; if (u.npcC && out.npcs.length < 10) out.npcs.push({ npc: u.npcC, rawAll: raw(o, false), trueH: skinned(o), scale: +o.scale.y.toFixed(3) }); });
    return out; });
  console.log('RESULT', cls, ((Date.now() - T0) / 1000 | 0) + 's', JSON.stringify(m));
  await page.close();
}
await b.close();
