// fix1106 ③：三位写实 NPC 与玩家并排对比身高 / 光环（灰石营地），拍近景
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/fix1106/npc'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 600 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('mage')); await page.waitForTimeout(6000);
const h = await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); const P = g.player.pos, out = {};
  const H = r => { if (!r) return null; r.updateMatrixWorld(true); let y0 = 1e9, y1 = -1e9; r.traverse(o => { if (o.isMesh && o.visible && o.name !== 'npcHalo') { o.geometry.computeBoundingBox(); const B = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); y0 = Math.min(y0, B.min.y); y1 = Math.max(y1, B.max.y); } }); return +(y1 - y0).toFixed(2); };
  out.player = H(g.player?.rig?.root ?? g.playerRig?.root);
  ['npc_moyan', 'mr_iola', 'mr_charon'].forEach((id, i) => { const r = window.__dlc1.npcC.make(id); if (!r) { out[id] = null; return; } r.root.position.set(P.x - 1.6 + i * 1.6, P.y, P.z - 2.4); r.root.rotation.y = 0; g.scene.add(r.root); out[id] = H(r.root); });
  g.player.pos.x -= 2.4; g.camDistSet?.(5.5); return out; });
console.log(JSON.stringify(h)); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/lineup.png`, timeout: 300000 }); console.log('errors=' + JSON.stringify(errors)); await b.close();
