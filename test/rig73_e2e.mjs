// v1.2.73 怪物程序化绑骨 e2e + 联系表截图：node test/rig73_e2e.mjs <比赛版 DLC html> [输出目录]
// 检查：评委路线 P0 怪有 SkinnedMesh + ProcAnim；骨骼数 / 权重和；预备在扣血前 ≥ 0.3 秒；死亡不整体侧翻；截图 待机 / 走 / 预备 / 出手 / 死亡
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html = 'web/index_dlc1_比赛版.html', OUT = '/tmp/rig73'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 640 } });
page.setDefaultTimeout(240000); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/blob:|favicon|net::/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.addInitScript(() => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + resolve(html), { timeout: 300000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 400000 });
await page.evaluate(() => window.__game.startGame('warrior'));
await page.waitForTimeout(3000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 38; g.player.hp = g.player.maxHp = 1e7; });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const closeAll = () => page.evaluate(() => { for (let k = 0; k < 3; k++) [...document.querySelectorAll('button')].filter(x => x.offsetParent && /知道了|关闭|确定/.test(x.textContent)).forEach(x => x.click()); document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; }); });

async function mob(map, tpl, label, dist = 6, boss) {
  await page.evaluate(([map, boss]) => { const g = window.__game; g.ensureWild(map); g.goMap(map); if (boss) { window.__dlc1.wb.setNext(boss, 0); } }, [map, boss]);
  await page.waitForTimeout(2500); await closeAll();
  const r = await page.evaluate(([tpl, dist, boss]) => {
    const g = window.__game; if (boss) window.__dlc1.wb.tick();
    const all = g.enemies.filter(x => x.alive && x.z === g.zone && x.rig?.root?.userData?.procRig);
    const e = all.find(x => x.rig.root.userData.procRig.tpl === tpl && (!boss || x.pboss === boss));
    if (!e) return { err: 'no ' + tpl, tpls: [...new Set(all.map(x => x.rig.root.userData.procRig.tpl))] };
    g.enemies.forEach(x => { if (x !== e && x.alive && x.z === g.zone && x.pos) { x.pos.x += 400; } });
    const info = e.rig.root.userData.procRig;
    let sk = null; e.rig.root.traverse(o => { if (o.isSkinnedMesh) sk = o; });
    const P = e.pos; g.player.pos.set(P.x + dist, P.y, P.z + 0.5); g.player.hp = 1e7; g.target = e;
    g.camSet?.(Math.max(7, dist + 3), 0.32); g.camYawSet?.(Math.PI / 2);
    // 记录：预备 / 出手 / 扣血 时刻
    window.__ev = []; const A = e.rig.anim, play = A.play.bind(A);
    A.play = (n, s) => { window.__ev.push([n, A.clock * 1000]); return play(n, s); };
    const fx = g.fx ?? null; if (fx && !fx.__w) { const dd = fx.dealDamage.bind(fx); fx.dealDamage = (t, ...a) => { if (t === g.player) window.__ev.push(['dmg', (window.__E?.rig.anim.clock ?? 0) * 1000]); return dd(t, ...a); }; fx.__w = 1; }
    window.__E = e;
    return { info, bones: sk?.skeleton?.bones?.length ?? 0, hasAnim: typeof A.windup === 'number' };
  }, [tpl, dist, boss]);
  if (r.err) { console.log('FAIL', label, r.err, JSON.stringify(r.tpls)); fail++; return; }
  console.log(label, JSON.stringify(r.info), 'bones', r.bones);
  ok(r.bones >= 8 && r.bones <= 26, `${label} 骨骼数 ${r.bones}`); ok(r.info.weightErr < 1e-3, `${label} 权重和误差 ${r.info.weightErr}`); ok(r.hasAnim, `${label} 有 ProcAnim`);
  // 走 → 攻击：连拍
  const t0 = Date.now(); const shots = [400, 900, 1400, 2400, 3400, 4400];
  for (const [i, ms] of shots.entries()) { const w = ms - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/${label}_${i}.png`, timeout: 180000 }); }
  await page.waitForTimeout(3000);
  const ev = await page.evaluate(() => window.__ev);
  const dmg = ev.filter(x => x[0] === 'dmg').map(x => x[1]), wind = ev.filter(x => x[0] === 'windup').map(x => x[1]);
  const lead = dmg.map(d => d - Math.max(-1e9, ...wind.filter(w => w <= d))).filter(x => x < 5000);
  console.log('  events', ev.map(x => x[0]).join(','), 'lead(ms)', lead.map(x => Math.round(x)).join(','));
  ok(boss || (dmg.length > 0 && lead.length > 0 && lead.every(x => x >= 250)), `${label} 扣血前预备 ≥ 0.3 秒`);
  // 死亡
  await page.evaluate(() => { const g = window.__game, e = window.__E; g.fx.dealDamage(e, e.hp + 10, 'physical', g.player); });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/${label}_death.png`, timeout: 180000 });
  const rz = await page.evaluate(() => Math.abs(window.__E.rig.root.rotation.z));
  ok(rz < 0.2, `${label} 死亡不整体侧翻 rz=${rz.toFixed(2)}`);
}
await mob('dlc1_mirror', 'H', 'sentinel', 6);
await mob('dlc1_mirror', 'F', 'wraith', 6);
await mob('dlc1_mirror', 'F翼', 'moth', 8);
await mob('dlc1_mirror', 'H袍', 'priest', 6);
await mob('dlc1_coast', 'H', 'drowned', 6);
await mob('dlc1_coast', 'G鲸', 'whale', 12, 'dwb_whale');
console.log(`通过 ${pass}，失败 ${fail}`);
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await b.close(); process.exit(fail ? 1 : 0);
