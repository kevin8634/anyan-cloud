// A10 评委通道 → 长副本 A 尾王门口 实机回归：评委面板「前往井底」→ 前 4 位首领代打 → 井底沉钟腔；打到 70% 看锁血（撞台门槛）→ 打碎核心 → 圆台坍塌；页面错误 0
// 用法：node dev/a10judge.mjs [html] [outDir]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/tmp/a10judge'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'medium' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultTimeout(900000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a); const R = { steps: [] }; const ok = (c, m) => { R.steps.push((c ? 'PASS ' : 'FAIL ') + m); say(c ? 'PASS' : 'FAIL', m); };
await page.click('#demo-enter'); await page.waitForTimeout(5000);
ok(await page.evaluate(() => window.__game.progression.level === 40 && !!document.querySelector('#d1-judge [data-j="3"]')), '评委角色 40 级，面板有「前往井底」');
const t0 = Date.now(); await page.evaluate(() => document.querySelector('#d1-judge [data-j="3"]').click());
for (let i = 0; i < 200; i++) { const s = await page.evaluate(() => { const st = window.__game.packDungeon.state(); return st ? { i: st.i, key: st.boss?.key } : null; }); if (s?.i === 4) break; await page.waitForTimeout(3000); }
await page.waitForTimeout(6000);
const s5 = await page.evaluate(() => { const g = window.__game, st = g.packDungeon.state(), B = g.packDungeon.units().boss; return { zone: g.zone, i: st?.i, key: st?.boss?.key, d: B ? Math.hypot(g.player.pos.x - B.pos.x, g.player.pos.z - B.pos.z) : -1, glb: window.__dlc1.well.twins.glb().lazy, built: Object.fromEntries(Object.entries(window.__dlc1.well.rig().built).map(([k, v]) => [k, v.mode])) }; });
ok(s5.zone === 'dlc1_well' && s5.i === 4 && s5.key === 'wl_b5' && s5.d < 30, `到达尾王门口：${JSON.stringify({ i: s5.i, key: s5.key, d: Math.round(s5.d), s: Math.round((Date.now() - t0) / 1000) })}`);
R.glb = s5.glb; await page.waitForTimeout(8000); R.warm = await page.evaluate(() => window.__dlc1.well.twins.glb().lazy); say('warm', JSON.stringify(R.warm)); R.built = s5.built; say(JSON.stringify(s5.glb), JSON.stringify(s5.built));
await page.screenshot({ path: `${OUT}/1_尾王门口.jpg`, quality: 80 });
// 70%：撞台门槛（锁血）
await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; g.player.maxHp = 1e12; g.player.hp = 1e12; g.fx.dealDamage(B, (B.hp - B.maxHp * 0.69) / 3, 'physical', g.player); });   // 评委角色伤害 ×3
await page.waitForTimeout(5000);
const s7 = await page.evaluate(() => { const st = window.__game.packDungeon.state(); return { gate: st.gate, invuln: st.boss?.invuln, hp: st.boss ? st.boss.hp / st.boss.maxHp : -1 }; });
ok(!!s7.gate && s7.invuln, `70% 锁血：门槛 ${JSON.stringify(s7)}`);
await page.screenshot({ path: `${OUT}/2_锁血撞台.jpg`, quality: 80 });
for (let r = 0; r < 20; r++) { const left = await page.evaluate(() => { const g = window.__game, U = g.packDungeon.units(); U.cores.forEach(c => c.alive && g.fx.dealDamage(c, c.maxHp * 9, 'physical', g.player)); return U.cores.filter(c => c.alive).length; }); if (!left) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(6000);
const sc = await page.evaluate(() => { const st = window.__game.packDungeon.state(); return { gateDone: st.gateDone, gate: st.gate, invuln: st.boss?.invuln, y: window.__game.player.pos.y }; });
ok(sc.gateDone.includes(0.7) && sc.y < -3, `圆台坍塌（撞台门槛完成、玩家落到下一层）：${JSON.stringify(sc)}`);
await page.screenshot({ path: `${OUT}/3_圆台坍塌.jpg`, quality: 80 });
R.perf = await page.evaluate(() => window.__game.perf?.() ?? null);
ok(errors.length === 0, `页面错误 ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`${OUT}/a10judge.json`, JSON.stringify({ ...R, errors }, null, 1)); await b.close();
