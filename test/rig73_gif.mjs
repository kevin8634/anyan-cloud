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
  await page.waitForTimeout(7000);
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

// v1.2.73 GIF 帧：每只怪 待机→走→预备/出手/收招→施法→死亡，连续推进 ProcAnim，按怪物投影位置裁切
const ONLY = process.argv[4] ? new RegExp(process.argv[4]) : null;
const SEQ = [['idle', 4], ['walk', 12], ['atk', 13], ['cast', 8], ['death', 15]];
for (const key of got) {
  if (ONLY && !ONLY.test(key)) continue;
  const safe = key.replace(/[|· ]/g, '_');
  await page.evaluate(key => {
    const g = window.__game, rig = window.__R[key], A = rig.anim;
    for (const k of Object.keys(window.__R)) { const r = window.__R[k]; if (r.root.parent) r.root.parent.remove(r.root); }
    const big = rig.root.userData.procRig.tpl === 'G鲸';
    const P = g.player.pos; g.player.rig.root.visible = false;
    rig.root.position.set(P.x, P.y + (big ? 1.2 : 0), P.z); rig.root.rotation.set(0, Math.PI / 2 + 0.7, 0); rig.root.visible = true; g.scene.add(rig.root);
    g.camSet(big ? 12 : 4.6, 0.22); g.camYawSet(Math.PI / 2);
    A.revive(); A.loop('idle'); for (let i = 0; i < 20; i++) A.update(1 / 30);
    window.__F = 0;
  }, key);
  let f = 0;
  for (const [ph, nf] of SEQ) {
    for (let k = 0; k < nf; k++) {
      const box = await page.evaluate(([key, ph, k]) => {
        const g = window.__game, rig = window.__R[key], A = rig.anim, big = rig.root.userData.procRig.tpl === 'G鲸';
        const G = big ? 1.5 : 1;
        if (k === 0) { if (ph === 'idle') A.loop('idle'); if (ph === 'walk') A.loop('walk'); if (ph === 'atk') { A.loop('idle'); A.play('windup'); } if (ph === 'cast') { A.loop('idle'); A.play('castLong'); } if (ph === 'death') A.play('death'); }
        if (ph === 'atk' && k === Math.round(A.windup * 10)) A.play('attack1');
        const dt = ph === 'death' ? (big ? 0.14 : 0.1) : ph === 'atk' ? 0.1 * G : 0.1;
        for (let i = 0; i < 3; i++) A.update(dt / 3);
        rig.root.updateMatrixWorld(true);
        const h = rig.root.userData.procRig ? (big ? 2.2 : 1.0) : 1;
        const v = rig.root.position.clone(); v.y += big ? 0.6 : 0.85; v.project(g.camera);
        return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, big };
      }, [key, ph, k]);
      await page.waitForTimeout(180);
      const S = box.big ? 520 : 400;
      const x = Math.max(0, Math.min(640 - S, box.x - S / 2)), y = Math.max(0, Math.min(640 - S, box.y - S * 0.55));
      await page.screenshot({ path: `${OUT}/${safe}_${String(f).padStart(3, '0')}.png`, clip: { x, y, width: S, height: S } });
      f++;
    }
  }
  console.log('GIF', key, f);
}
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close();
