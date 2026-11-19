// 鹰契 H2–H4 实机
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/hunter_dk40';
mkdirSync(OUT + '/gif', { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const it = (id, baseId, name, slot, weaponType, quality = 'blue', itemLevel = 20) => ({ id, baseId, name, slot, weaponType, quality, itemLevel, hp: 0, armor: 0, bonus: { power: 10 }, modifiers: [], lines: [], sellPrice: 1, pack: 'dlc1', durability: 100 });
const meta = { id: 'hb', name: '弓栏测试', classId: 'hunter', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
const SAVE = { version: 10, savedAt: 1, classId: 'hunter', name: '弓栏测试', level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] },
  inventory: { gold: 10, bag: [it('old_gl', 'b_h_glaive', '契约长柄弯刃', 'twoHand', 'glaive', 'blue', 22)], equipped: { mainHand: it('old_bow', 'b_h_bow', '猎卫长弓', 'oneHand', 'bow', 'purple', 21), offHand: it('old_sb', 'b_h_shortblade', '兽牙短刃', 'offHand', 'shortblade') }, stacks: {} } };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERR', (e.stack || e.message).split('\n').slice(0, 3).join(' ⏎ ')); });
page.setDefaultTimeout(900000); page.on('crash', () => console.log('PAGE CRASH')); page.on('close', () => console.log('PAGE CLOSE')); b.on('disconnected', () => console.log('BROWSER DISCONNECTED')); page.on('console', m => { if (m.type() === 'error' || process.env.CL) console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
await page.addInitScript(([m, s, q]) => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q }));
  localStorage.setItem('darkrock_roster', JSON.stringify({ v: 1, slots: [m, null, null, null, null, null, null, null], last: 'hb', legacyMigrated: true })); localStorage.setItem('darkrock_char_hb', JSON.stringify(s)); } }, [meta, SAVE, process.env.Q ?? 'low']);   // 11-06：沙箱 8 GB，默认低画质防 OOM（逻辑测试不看画面）
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => { const g = window.__game; g.selSlot = 0; g.renderTitle?.(); document.getElementById('start').click(); });
await page.waitForFunction(() => window.__game.curChar && window.__game.cls?.id === 'hunter', null, { timeout: 300000 });
await page.waitForTimeout(4000);
const closeUi = () => page.evaluate(() => { const g = window.__game; g.tutFinish?.(); try { g.togglePanel?.('changelog', false); } catch { /* 没开 */ } document.getElementById('cls-help')?.remove(); g.camDistSet?.(5.5); });   // 老角色进游戏会弹「本次更新」+ 职业要点
// 11-05 鹰契 d40_h_bow 实机（规格 v0.2 §8 H2–H4）：node test/hunter_dk40_e2e.mjs
//   H4 弓位装鹰契、鹰形手持才叠层；H3 鹰形远射命中标记目标叠层 → 满 5 层穿云（穿透 + 对标记目标追加一箭）；H2 鹰 → 狼切形把层数转成交契，狼形首击破甲 + 每层增伤
await closeUi(); await page.waitForTimeout(800); await closeUi();
const eq = await page.evaluate(() => { const g = window.__game, v = g.inventory; const bw = g.gen.generateFixed('d40_h_bow', 40); if (!bw) return null; v.bag.push(bw); const r = v.tryEquip(bw.id); g.refreshGear(); return { ok: r.ok, slot: r.slot, has: !!window.__dlc1.hunter.api()?.hasDark?.('d40_h_bow') }; });
ok(eq && eq.ok && eq.slot === 'offHand' && eq.has, 'H4 鹰契装进弓位、hasDark 生效 ' + JSON.stringify(eq));
const D = () => page.evaluate(() => window.__dlc1.hunter.debug());
const form = (f, force = true) => page.evaluate(([f, force]) => window.__dlc1.hunter.setForm(f, force), [f, force]);
await form('eagle'); await page.waitForTimeout(600);
const tgt = await page.evaluate(() => { const g = window.__game, P = g.player.pos; g.stressSpawn?.(3); const es = g.enemies.filter(x => x.alive && !x.isBoss).slice(0, 3); if (!es.length) return 0;
  es.forEach((e, i) => { e.pos.set(P.x + (i - 1) * 1.2, e.pos.y, P.z + 4); e.hp = e.maxHp = 1e7; e.speed = 0; }); g.target = es[1]; g.player.rig.root.rotation.y = 0; return es.length; });
ok(tgt >= 1, '刷出目标 ' + tgt);
const slots = ['skill1', 'skill2', 'skill3', 'skill4', 'basic'];
let d0 = await D(), d = d0;
for (let i = 0; i < 40 && !(d.stats.pierces > 0); i++) {   // 11-06：沙箱 SwiftShader 约 0.2 帧/秒、实时 dt 封顶 0.05，箭矢飞行慢 → 目标 4 米、每发等 1.5 秒
  await page.evaluate(sl => { const g = window.__game, P = g.player.pos; for (const e of g.enemies) if (e.alive && e.hp > 1e6) { e.hp = 1e7; } g.player.rig.root.rotation.y = 0; for (const s of sl) { g.loadout.resetCooldown?.(s); g.player.mana = g.player.maxMana ?? 999; g.tryCast(s); } }, i % 3 ? ['basic'] : slots);
  await page.waitForTimeout(1500); d = await D();
}
console.log('eagle stats', JSON.stringify(d.stats), 'form', d.form, 'marks', d.marks);
ok(d.stats.marks > d0.stats.marks, `鹰形标记命中（${d.stats.marks}）`);
ok(d.stats.bowStacks > 0, `H3 鹰契叠层（${d.stats.bowStacks}）`);
ok(d.stats.pierces > 0, `H3 满 5 层穿云触发（${d.stats.pierces}），追加箭 ${d.stats.pierceExtra}`);
await page.screenshot({ path: `${OUT}/eagle_pierce.png` });
// H2：再叠几层，非强制切到狼 → 交契
await page.waitForTimeout(6000); d = await D();   // 11-06：先等在途箭矢落完；再单发叠到 2–4 层（穿云会清空层数，切形时须有层才交契）
{ let lastP = d.stats.pierces, base = d.stats.bowStacks;
  for (let i = 0; i < 25; i++) { d = await D(); if (d.stats.pierces !== lastP) { lastP = d.stats.pierces; base = d.stats.bowStacks; } const cur = d.stats.bowStacks - base; if (cur >= 2 && cur <= 4) break;
    await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 0; g.loadout.resetCooldown?.('basic'); g.tryCast('basic'); }); await page.waitForTimeout(1800); }
  console.log('交契前层数估计', d.stats.bowStacks - base); }
const pre = await D();
await page.evaluate(() => { const g = window.__game, P = g.player.pos; g.enemies.filter(x => x.alive && x.hp > 1e6).forEach((e, i) => e.pos.set(P.x + (i - 1) * 0.8, e.pos.y, P.z + 1.6)); });
await form('wolf', false); await page.waitForTimeout(2500);
const pw = await D();
ok(pw.form === 'wolf' && pw.stats.pacts > pre.stats.pacts, `H2 鹰 → 狼转交契（pacts ${pre.stats.pacts} → ${pw.stats.pacts}）`);
for (let i = 0; i < 8; i++) { await page.evaluate(() => { const g = window.__game; for (const s of ['basic', 'skill1']) { g.loadout.resetCooldown?.(s); g.tryCast(s); } }); await page.waitForTimeout(1200); }
const pf = await D(); console.log('wolf stats', JSON.stringify(pf.stats));
ok(pf.stats.pactSunders > pre.stats.pactSunders, `H2 交契首击破甲（${pf.stats.pactSunders}）`);
ok(pf.stats.pactAmp > pre.stats.pactAmp, `H2 交契狼形命中标记目标增伤（${pf.stats.pactAmp} 次）`);
await page.screenshot({ path: `${OUT}/wolf_pact.png` });
// H4：卸下鹰契后鹰形不再叠层
await form('eagle'); const un = await page.evaluate(() => { const g = window.__game, v = g.inventory; const r = v.unequip?.('offHand'); g.refreshGear(); return { has: !!window.__dlc1.hunter.api()?.hasDark?.('d40_h_bow'), r: !!r }; });
const b4 = (await D()).stats.bowStacks; for (let i = 0; i < 6; i++) { await page.evaluate(() => { const g = window.__game; g.loadout.resetCooldown?.('basic'); g.tryCast('basic'); }); await page.waitForTimeout(1200); }
const b5 = (await D()).stats.bowStacks; ok(!un.has && b5 === b4, `H4 卸下鹰契后不叠层（${b4} → ${b5}）` + JSON.stringify(un));
ok(errors.length === 0, '页面错误 0：' + JSON.stringify(errors.slice(0, 3)));
console.log(`hunter_dk40 ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
