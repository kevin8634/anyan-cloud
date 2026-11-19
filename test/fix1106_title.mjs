// fix1106 首屏：选角背景改 VideoTexture（不再画布重画 / 声环），并量玩家与写实 NPC 显示高度
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/fix1106/title'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); const T00 = Date.now(); page.on('console', m => { const x = m.text(); if (/怪物模型|写实 NPC|加载任务失败/.test(x)) console.log('[' + ((Date.now() - T00) / 1000 | 0) + 's]', x.slice(0, 200)); });
page.setDefaultTimeout(900000);
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
console.log('title after', (Date.now() - T00) / 1000, 's');
for (let i = 0; i < 3; i++) { await page.waitForTimeout(1500); console.log('selbg', JSON.stringify(await page.evaluate(() => ({ bg: window.__selBg?.(), isVid: !!window.__game.scene.background?.isVideoTexture, loader: !!document.getElementById('anyan-loader'), spin: !!document.querySelector('#loading .spin') })))); await page.screenshot({ path: `${OUT}/title_${i}.png`, timeout: 120000 }); }
if (process.env.TITLE_ONLY) { console.log('errors=' + JSON.stringify(errors)); await b.close(); process.exit(0); }
const T0 = Date.now(); await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForFunction(() => document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
console.log('world after', (Date.now() - T0) / 1000, 's'); await page.waitForTimeout(6000);
const m = await page.evaluate(() => { const g = window.__game, T = g.THREE || window.THREE; const box = o => { const B = new (o.constructor.prototype.constructor === undefined ? Object : Object)(); return null; };
  const h = o => { o.updateMatrixWorld(true); let lo = 1e9, hi = -1e9; o.traverse(c => { if (c.isMesh && c.visible && c.geometry && c.name !== 'npcHalo') { c.geometry.computeBoundingBox?.(); const bb = c.geometry.boundingBox; if (!bb) return; for (const y of [bb.min.y, bb.max.y]) for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) { const v = c.localToWorld(new c.position.constructor(x, y, z)); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } } }); return +(hi - lo).toFixed(2); };
  const out = { map: g.curMap?.id ?? g.mapId, player: h(g.player.rig.root), pScale: g.player.rig.root.scale.y, npcs: [] };
  g.scene.traverse(o => { if (o.userData?.npcC && out.npcs.length < 12) out.npcs.push([o.userData.npcC, h(o), o.scale.y]); });
  return out; });
console.log('measure', JSON.stringify(m)); console.log('errors=' + JSON.stringify(errors)); await b.close();
