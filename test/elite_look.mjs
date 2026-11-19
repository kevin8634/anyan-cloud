// v1.2.73 精英 5 只绑骨显示件（LUX_E_*）实机外观：node test/elite_look.mjs [html] [outdir]
//   ① 每只单独生成（__dlc1.elite.make）放到营地玩家身前，待机 / 走 / 跑 / 攻击 / 重击 / 受击 / 死亡 各截一帧 → 每只一张联系表
//   ② 镜海 / 海岸地图里实际刷出的怪：统计用上绑骨显示件（root.userData.eliteHd）的个数与名字
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/elite_look';
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(q => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, process.env.Q || '');   // 11-06：Q=medium/low 画质（沙箱 8 GB 高画质会 OOM）
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.player.hp = g.player.maxHp = 1e7; g.player.pos.z += 4; }); await page.waitForTimeout(1500);
const ids = await page.evaluate(() => window.__dlc1.elite.ids);
const POSES = [['idle', 'loop', 0.8], ['walk', 'loop', 0.5], ['run', 'loop', 0.4], ['attack1', 'play', 0.35], ['heavy', 'play', 0.5], ['hit', 'play', 0.2], ['death', 'play', 1.6], ['death', 'play', 3.2, 'death_late']];
for (const id of ids) {
  const st = await page.evaluate(id => { const g = window.__game; if (window.__E) window.__E.root.parent?.remove(window.__E.root);
    const r = window.__dlc1.elite.make(id); window.__E = r; if (!r) return null;
    const P = g.player.pos; g.player.rig.root.visible = false; r.root.position.set(P.x, P.y, P.z); r.root.rotation.set(0, 0.6, 0); g.scene.add(r.root);
    g.camDistSet?.(id.includes('foreman') || id.includes('priest') ? 6 : 5);
    r.root.updateMatrixWorld(true); const B = { y0: 1e9, y1: -1e9 }; r.root.traverse(o => { if (o.isBone) { const v = o.getWorldPosition(r.root.position.clone()); B.y0 = Math.min(B.y0, v.y); B.y1 = Math.max(B.y1, v.y); } });
    return { model: r.root.userData.eliteHd, bones: (() => { let n = 0; r.root.traverse(o => { if (o.isBone) n++; }); return n; })(), h: +(B.y1 - B.y0).toFixed(2) }; }, id);
  ok(!!st, `${id} 绑骨显示件 ${JSON.stringify(st)}`); if (!st) continue;
  const info = await page.evaluate(() => { const r = window.__E, A = r.anim; const d = A.pick?.('death')?.getClip?.(); const w = []; r.root.traverse(o => { if (o.userData?.eliteWield) w.push(o.userData.eliteWield); });
    return { death: d ? d.name + ' ' + d.duration.toFixed(2) + 's' : null, wield: w }; }); console.log(id, JSON.stringify(info));
  for (const [a, how, t, tag] of POSES) {
    await page.evaluate(([a, how, t]) => { const A = window.__E.anim; A.revive?.(); if (how === 'loop') A.loop(a); else { A.loop('idle'); A.play(a); } for (let i = 0; i < Math.round(t * 30); i++) A.update(1 / 30); }, [a, how, t]);
    await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${id}_${tag ?? a}.png` });
  }
}
await page.evaluate(() => { const g = window.__game; if (window.__E) window.__E.root.parent?.remove(window.__E.root); g.player.rig.root.visible = true; });
for (const map of ['dlc1_mirror', 'dlc1_coast']) {
  await page.evaluate(m => { const g = window.__game; g.ensureWild?.(m); g.goMap(m); }, map); await page.waitForTimeout(8000);
  const got = await page.evaluate(() => [...window.__game.enemies].filter(e => e.rig?.root?.userData?.eliteHd).map(e => (e.type?.name ?? e.name ?? '?') + '=' + e.rig.root.userData.eliteHd));
  console.log(map, '绑骨显示件怪', got.length, got.slice(0, 6).join(' / '));
}
ok(!errors.length, '页面错误 ' + errors.length + '：' + JSON.stringify(errors.slice(0, 3)));
console.log(`elite_look ${pass}/${pass + fail}`);
await b.close(); process.exitCode = fail ? 1 : 0;
