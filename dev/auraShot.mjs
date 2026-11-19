// v1.2.50 套装光环 / +13 光点实机截图：node dev/auraShot.mjs <html> <out.png> [classic]
//   法师穿霜誓 4 件 + 主手 +13，营地站定，近景镜头
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, out, cm = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(400000);
await page.addInitScript(([cm]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify(Object.assign({ quality: 'high' }, cm ? { charModel: cm } : {}))); } }, [cm]);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
if (process.env.NOSET) await page.evaluate(() => { window.__noset = 1; });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(22000);   // 出生光效散掉
const info = await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 30;
  const eq = (id, sl) => { const it = g.gen.generateFixed(id, 30); if (!it) return id + '?'; g.inventory.add(it); g.inventory.equip(it.id, sl); return it.name; };
  const r = window.__noset ? [] : [eq('i_frost_hood', 'head'), eq('i_frost_mantle', 'shoulder'), eq('i_frost_robe', 'chest'), eq('i_frost_gloves', 'hands')];
  const mh = g.inventory.equipped.mainHand ?? g.inventory.equipped.twoHand ?? Object.values(g.inventory.equipped).find(i => i.slot === 'weapon' || /staff|wand|sword/.test(i.baseId || '')); if (mh) mh.upgrade = 13; window.__eqk = Object.keys(g.inventory.equipped); g.refreshGear(true);
  g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
  const p = g.player.pos; window.__camOv = [p.x + 2.6, 1.7, p.z + 3.2, p.x, 0.9, p.z];
  document.querySelectorAll('body *').forEach(x => { if (x.tagName !== 'CANVAS') x.style.visibility = 'hidden'; });
  return { eqk: window.__eqk, r, sets: [...g.inventory.setCounts()], up: mh?.upgrade }; });
console.log('info', JSON.stringify(info));
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
console.log('pts', JSON.stringify(await page.evaluate(() => { const g = window.__game, r = []; g.player.rig.root.traverse(o => { if (!o.isPoints) return; const V = o.position.constructor, s = o.getWorldScale(new V()); o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; r.push({ mode: o.userData.flame?.mode, parent: o.parent?.name, n: o.geometry.getAttribute('position').count, size: o.material.size, att: o.material.sizeAttenuation, ws: [s.x, s.y, s.z].map(v => +v.toFixed(2)), bbH: +(bb.max.y - bb.min.y).toFixed(2), col: o.material.color.toArray().map(v => +v.toFixed(2)) }); }); return r; })));
await page.evaluate(() => { const g = window.__game; g.player.rig.root.traverse(o => { if (o.isPoints && o.userData.flame) o.visible = false; }); window.__noShoulder = 1; });
await page.waitForTimeout(1500); await page.screenshot({ path: out.replace('.png', '_noshoulder.png') });
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await b.close();
