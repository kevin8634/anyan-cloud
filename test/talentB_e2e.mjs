// v1.2.77 天赋方案 B 实机：灵契猎手 雷狼 / 巨熊 关键节点（node test/talentB_e2e.mjs [html=web/index_dlc1.html]）
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1.html');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /职业运行时|职业技能/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(600000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
await page.evaluate(() => window.__game.startGame('hunter')); await page.waitForTimeout(3000);
const setup = await page.evaluate(() => {
  const g = window.__game; g.progression.level = 30; g.tree.totalPoints = 30;
  const sp = id => g.tree.def.specs.find(s => s.id === id), row = (id, r) => sp(id).nodes.filter(n => n.row === r);
  const fill = (id, r) => { for (const n of row(id, r)) while (g.tree.add(n.id)); };
  const r = [];
  fill('h_wolf', 1); r.push(g.tree.add('hw_k_shock')); fill('h_wolf', 3); r.push(g.tree.add('hw_k_storm')); fill('h_wolf', 5); r.push(g.tree.add('hw_alpha'));
  fill('h_bear', 1); r.push(g.tree.add('hb_k_hide')); fill('h_eagle', 1); r.push(g.tree.add('he_k_mark'));
  g.syncCharacter?.();
  return { cls: g.cls.id, wolf: sp('h_wolf').name, focus: sp('h_wolf').focus, cap: row('h_wolf', 6)[0].name, adds: r, spent: g.tree.spent };
});
console.log(JSON.stringify(setup));
ok(setup.cls === 'hunter' && setup.wolf === '雷狼', `职业 ${setup.cls}，狼系 = ${setup.wolf}（${setup.focus}），绝技 ${setup.cap}`);
ok(setup.adds.every(Boolean) && setup.spent === 30, `关键 / 绝技都能点，投入 ${setup.spent}`);
const D = () => page.evaluate(() => window.__dlc1.hunter.debug());
// 狼：叠感电 → 电弧 → 雷暴
await page.evaluate(() => { const g = window.__game, foes = g.enemies.filter(e => e.alive && e.z === g.zone).slice(0, 4), t = foes[0];
  window.__tb = t; for (const e of foes) { e.brain.update = () => ({ state: 'idle', moveDir: null, speed: 0, faceTo: null, attacked: false }); e.evadeUntil = 0; } t.maxHp = t.hp = 2e6; foes.slice(1).forEach((e, i) => { e.maxHp = e.hp = 2e5; e.pos.set(t.pos.x + 1 + i * 0.6, 0, t.pos.z + 1); }); });
for (let i = 0; i < 16; i++) { await page.evaluate(() => { const g = window.__game, t = window.__tb; g.player.pos.set(t.pos.x - 1.5, 0, t.pos.z); g.target = t; const P = ['bag', 'char', 'talent', 'quests', 'dialog', 'settings', 'shop', 'travel', 'worldmap', 'changelog', 'dropguide', 'bank', 'raidguide', 'exchange', 'skillbook', 'raidmap', 'awaken', 'spirit', 'achv', 'nextstep', 'lesson', 'abyss']; const open = P.filter(id => document.getElementById(id)?.style.display === 'flex'); for (const id of open) document.getElementById(id).style.display = 'none'; g.tryCast('basic'); (window.__dbgCast ??= []).push(window.__game.T.toFixed(1)); }); const t0 = await page.evaluate(() => window.__game.T); await page.waitForFunction(t0 => window.__game.T > t0 + 1.2, t0); }
{ const t0 = await page.evaluate(() => window.__game.T); await page.waitForFunction(t0 => window.__game.T > t0 + 4, t0); }
let d = await D(); console.log(JSON.stringify(d.stats), 'basicN', d.basicN, 'hp', await page.evaluate(() => [window.__tb.hp, window.__tb.alive, window.__game.player.alive, window.__game.cooldownLeft?.('basic')]));
ok(d.stats.shocks >= 10, `狼形命中叠感电 ${d.stats.shocks} 次`);
ok(d.stats.arcs >= 1, `感电电弧跳 ${d.stats.arcs} 次`);
ok(d.stats.storms >= 1 && d.stats.stormDmg > 0, `雷暴爆发 ${d.stats.storms} 次，伤害 ${Math.round(d.stats.stormDmg)}`);
const ui = await page.evaluate(() => ({ st: document.getElementById('cls-status')?.textContent ?? '', pv: window.__game.loadout.preview('basic', { now: window.__game.T, casterHpPercent: 1, targetEffects: [] }).displayName }));
ok(/雷狼/.test(ui.pv), `普攻名：${ui.pv}；状态行：${ui.st}`);
// 熊：厚皮
await page.evaluate(() => { const g = window.__game; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' })); });
await page.waitForTimeout(600);
await page.evaluate(() => { const g = window.__game, p = g.player.pos; g.enemies.filter(e => e.alive && e.z === g.zone).slice(0, 4).forEach((e, i) => e.pos.set(p.x + 1 + (i % 2), 0, p.z + (i - 1.5))); g.target = window.__tb; g.tryCast('skill2'); });
await page.waitForTimeout(1200);
d = await D(); ok(d.form === 'bear' && d.stats.shields >= 1, `熊形命中 3 个以上 → 厚皮护盾 ${d.stats.shields} 次（形态 ${d.form}）`);
ok(errors.length === 0, `errors=${JSON.stringify(errors.slice(0, 3))}`);
console.log(`talentB ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
