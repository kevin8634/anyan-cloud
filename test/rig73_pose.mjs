// v1.2.73 程序化绑骨姿态联系表：node test/rig73_pose.mjs <比赛版 DLC html> [输出目录]
// 把评委路线 P0 怪的 rig 摘出 AI，放到营地（亮）玩家身前，手动推进 ProcAnim：待机 / 走 25% / 走 75% / 预备末 / 出手 / 收招 / 受击 / 死亡
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html = 'web/index_dlc1_比赛版.html', OUT = '/tmp/rig73p'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 640 } }); page.setDefaultTimeout(240000);
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + resolve(html), { timeout: 300000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 38; g.player.hp = g.player.maxHp = 1e7; });
// 先在两张图生成怪（含巨鲸），每张图到了就收集 rig（摘出 AI 列表，主循环不再管它）
await page.evaluate(() => { window.__R = {}; });
for (const [map, boss] of [['dlc1_mirror'], ['dlc1_coast', 'dwb_whale']]) {
  await page.evaluate(([map, boss]) => { const g = window.__game; g.ensureWild(map); g.goMap(map); if (boss) window.__dlc1.wb.setNext(boss, 0); }, [map, boss]);
  await page.waitForTimeout(4000);
  await page.evaluate(boss => { if (boss) window.__dlc1.wb.tick(); }, boss);
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const g = window.__game;
    for (const e of [...g.enemies]) { const r = e.rig?.root?.userData?.procRig; if (!r) continue; const key = r.tpl + '|' + (e.type?.name ?? e.name ?? ''); if (window.__R[key] || /强壮/.test(key)) continue; window.__R[key] = e.rig; g.enemies.splice(g.enemies.indexOf(e), 1); } });
}
const got = await page.evaluate(() => Object.keys(window.__R));
console.log(JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(window.__R).map(([k, r]) => [k, r.root.userData.procRig])))));
console.log('rigs', got.join(' / '));
await page.evaluate(() => { const g = window.__game; g.goMap('camp'); });
await page.waitForTimeout(3000);
await page.evaluate(() => { for (let k = 0; k < 3; k++) [...document.querySelectorAll('button')].filter(x => x.offsetParent && /知道了|关闭|确定/.test(x.textContent)).forEach(x => x.click()); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });
const POSES = ['idle', 'walk25', 'walk75', 'windup', 'strike', 'recover', 'cast', 'death'];
const ONLY = process.argv[4] ? new RegExp(process.argv[4]) : null;
for (const key of got) {
  if (ONLY && !ONLY.test(key)) continue;
  const safe = key.replace(/[|· ]/g, '_');
  for (const pose of POSES) {
    await page.evaluate(([key, pose]) => {
      const g = window.__game, rig = window.__R[key], A = rig.anim;
      for (const k of Object.keys(window.__R)) { const r = window.__R[k]; if (r.root.parent) r.root.parent.remove(r.root); }
      const big = rig.root.userData.procRig.tpl === 'G鲸';
      const P = g.player.pos, d = big ? 9 : 4.2;
      rig.root.position.set(P.x - d, P.y, P.z + (big ? 1 : 0.4)); g.player.rig.root.visible = false; rig.root.rotation.set(0, Math.PI / 2 + 0.7, 0); rig.root.visible = true; g.scene.add(rig.root);
      g.camSet?.(big ? 13 : 7.5, 0.25); g.camYawSet?.(Math.PI / 2);
      A.revive(); A.loop('idle');
      const step = (n, dt, mv) => { for (let i = 0; i < n; i++) { if (mv) rig.root.position.z += mv * dt; A.update(dt); } };
      step(20, 1 / 30, 0);
      if (pose === 'walk25' || pose === 'walk75') { A.loop('walk'); const v = big ? 2 : 1.6; step(pose === 'walk25' ? 14 : 22, 1 / 30, v); }
      if (pose === 'windup') { A.play('windup'); step(Math.round(A.windup * 30) + 2, 1 / 30, 0); }
      if (pose === 'strike') { A.play('windup'); step(Math.round(A.windup * 30) + 2, 1 / 30, 0); A.play('attack1'); step(Math.round(0.12 * (big ? 1.5 : 1) * 30), 1 / 30, 0); }
      if (pose === 'recover') { A.play('windup'); step(Math.round(A.windup * 30) + 2, 1 / 30, 0); A.play('attack1'); step(Math.round(0.3 * (big ? 1.5 : 1) * 30), 1 / 30, 0); }
      if (pose === 'cast') { A.play('castLong'); step(20, 1 / 30, 0); }
      if (pose === 'death') { A.play('death'); step(big ? 95 : 40, 1 / 30, 0); }
      rig.root.updateMatrixWorld(true);
    }, [key, pose]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${safe}_${POSES.indexOf(pose)}_${pose}.png`, clip: { x: 80, y: 60, width: 480, height: 480 } });
  }
  console.log('SHOT', key);
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
