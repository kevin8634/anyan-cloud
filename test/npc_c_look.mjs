// v1.2.73 C 组（11-06 修：NPC 位置取 n.rig.root.position，Npc 无 pos 字段） NPC 写实件：node test/npc_c_look.mjs [html=web/index_dlc1_比赛版.html] [截图目录]
//   1) 三件各自生成（npcC）→ 身高 / 骨数 / 半透明；2) 进灰石营地看墨言、进镜渊城看伊奥拉 / 卡戎实际 NPC 用的是写实件；页面错误 0
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/npc_c';
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.player.hp = g.player.maxHp = 1e7; }); await page.waitForTimeout(1500);
for (const id of await page.evaluate(() => window.__dlc1.npcC.ids)) {
  const st = await page.evaluate(id => { const g = window.__game; if (window.__N) window.__N.root.parent?.remove(window.__N.root);
    const r = window.__dlc1.npcC.make(id); window.__N = r; if (!r) return null; const P = g.player.pos; r.root.position.set(P.x + 2, P.y, P.z + 1.5); r.root.rotation.set(0, Math.PI + 0.4, 0); g.scene.add(r.root);
    r.root.updateMatrixWorld(true); const bb = new (r.root.position.constructor)(); let y0 = 1e9, y1 = -1e9, bones = 0, tr = false;
    r.root.traverse(o => { if (o.isBone) bones++; if (o.isMesh) { o.geometry.computeBoundingBox(); const B = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); y0 = Math.min(y0, B.min.y); y1 = Math.max(y1, B.max.y); if (o.material?.transparent) tr = true; } });
    for (let i = 0; i < 30; i++) r.anim?.update?.(1 / 30);
    return { glb: r.root.userData.npcC, h: +(y1 - y0).toFixed(2), bones, transparent: tr }; }, id);
  ok(!!st && st.h > 1.5 && st.h < 2.4, `${id} ${JSON.stringify(st)}`);
  if (id === 'mr_iola') ok(!!st?.transparent, 'iola 半透明');
  await page.evaluate(() => window.__game.camDistSet?.(4)); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${id}.png` });
}
await page.evaluate(() => { if (window.__N) window.__N.root.parent?.remove(window.__N.root); });
const scan = () => page.evaluate(() => { const out = []; window.__game.scene.traverse(o => { if (o.userData?.npcC) out.push(o.userData.npcC); }); return out; });
await page.waitForTimeout(10000);   // fix1106：营地 NPC 等分包解析完换写实件
const camp = await scan(); ok(camp.includes('dlc1_npc_moyan'), '灰石营地墨言用写实件 ' + JSON.stringify(camp));
await page.evaluate(() => { const g = window.__game; const n = (g.npcs ?? []).find(n => n.id === 'scholar' && (n.z == null || n.z === g.zone)) ?? (g.npcs ?? []).find(n => n.id === 'scholar'); const P = n?.rig?.root?.position; if (P) { g.player.pos.x = P.x + 2.2; g.player.pos.z = P.z + 2.2; } }); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/camp_moyan.png` });
await page.evaluate(() => { const g = window.__game; g.ensureWild?.('dlc1_mirror'); g.goMap('dlc1_mirror'); }); await page.waitForTimeout(12000);
const mr = await scan(); ok(mr.includes('dlc1_npc_iola') && mr.includes('dlc1_npc_charon'), '镜渊城伊奥拉 / 卡戎用写实件 ' + JSON.stringify(mr));
await page.evaluate(() => { const g = window.__game; const n = (g.npcs ?? []).find(n => n.id === 'charon'); const P = n?.rig?.root?.position; if (P) { g.player.pos.x = P.x + 1; g.player.pos.z = P.z - 3.5; } }); await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/mirror_charon_iola.png` });
// fix1106 ③：沉钟海岸（伊奥拉）、无声钟楼（伊奥拉 / 卡戎）也要用写实件；每处拍一张近景
for (const [map, ids, need] of [['dlc1_coast', ['iola'], ['dlc1_npc_iola']], ['dlc1_belltower', ['charon_b', 'iola_b'], ['dlc1_npc_iola', 'dlc1_npc_charon']]]) {
  await page.evaluate(m => { const g = window.__game; g.ensureWild?.(m); g.goMap(m); }, map); await page.waitForTimeout(12000);
  const got = await scan(); ok(need.every(x => got.includes(x)), `${map} 用写实件 ` + JSON.stringify(got));
  await page.evaluate(id => { const g = window.__game; const n = (g.npcs ?? []).find(n => n.id === id); const P = n?.rig?.root?.position; if (P) { g.player.pos.x = P.x + 1; g.player.pos.z = P.z - 3.5; } }, ids[0]); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${map}_npc.png` });
}
ok(!errors.length, '页面错误 ' + errors.length + '：' + JSON.stringify(errors.slice(0, 3)));
console.log(`npc_c_look ${pass}/${pass + fail}`); await b.close(); process.exitCode = fail ? 1 : 0;
