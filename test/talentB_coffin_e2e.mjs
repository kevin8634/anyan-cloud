// v1.2.77 天赋方案 B 实机：负棺人 送葬者 / 饮血者 / 凋魂者 关键节点（node test/talentB_coffin_e2e.mjs [html=web/index_dlc1.html]）
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
await page.evaluate(() => window.__game.startGame('coffin')); await page.waitForTimeout(3000);
const D = () => page.evaluate(() => window.__dlc1.coffin.debug());
const wait = async s => { const t0 = await page.evaluate(() => window.__game.T); await page.waitForFunction(([t0, s]) => window.__game.T > t0 + s, [t0, s]); };
/** 选专精：主系填满 1/3/5 行 + 两个关键 + 绝技 */
const pick = (spec, k1, k2, cap) => page.evaluate(([spec, k1, k2, cap]) => {
  const g = window.__game; g.progression.level = 30; g.tree.totalPoints = 30; g.tree.reset();
  const sp = g.tree.def.specs.find(s => s.id === spec), row = r => sp.nodes.filter(n => n.row === r);
  const fill = r => { for (const n of row(r)) while (g.tree.add(n.id)); };
  const r = []; fill(1); r.push(g.tree.add(k1)); fill(3); r.push(g.tree.add(k2)); fill(5); r.push(g.tree.add(cap));
  g.syncCharacter?.(); window.__game.player.hp = window.__game.player.maxHp;
  return { name: sp.name, adds: r, spent: g.tree.spent };
}, [spec, k1, k2, cap]);
/** 让附近 4 个怪站桩、血量放大，目标 = 第一个 */
const dummies = () => page.evaluate(() => { const g = window.__game, foes = g.enemies.filter(e => e.alive && e.z === g.zone).slice(0, 4), t = foes[0];
  window.__tb = t; for (const e of foes) { e.brain.update = () => ({ state: 'idle', moveDir: null, speed: 0, faceTo: null, attacked: false }); e.evadeUntil = 0; } t.maxHp = t.hp = 3e6; foes.slice(1).forEach((e, i) => { e.maxHp = e.hp = 3e5; e.pos.set(t.pos.x + 1 + i * 0.6, 0, t.pos.z + 1); }); });
const hit = slots => page.evaluate(slots => { const g = window.__game, t = window.__tb; t.pos.set(t.pos.x, 0, t.pos.z); g.player.pos.set(t.pos.x - 1.5, 0, t.pos.z); g.target = t;
  for (const id of ['bag', 'char', 'talent', 'quests', 'dialog', 'settings', 'shop', 'travel', 'worldmap', 'changelog', 'skillbook', 'spirit', 'nextstep', 'lesson']) { const el = document.getElementById(id); if (el?.style.display === 'flex') el.style.display = 'none'; }
  for (const s of slots) g.tryCast(s); }, slots);
const key = k => page.evaluate(k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); }, k);

// ---------------- 凋魂者：暗影侵蚀 / 恐惧 / 冥河凋零
let s = await pick('c_fer', 'cw_k_erode', 'cw_k_fear', 'cr_styx'); console.log(JSON.stringify(s));
ok(s.name === '凋魂者' && s.adds.every(Boolean), `凋魂者：关键 + 绝技能点（投入 ${s.spent}）`);
await dummies();
const r0 = Date.now(); for (let i = 0; i < 3; i++) { await hit(['basic', 'skill1', 'skill2', 'skill3', 'skill4']); await wait(0.9); const q = await D(); console.log(i, ((Date.now() - r0) / 1000).toFixed(0) + 's', q.b.erodes, q.b.withers); }
// 实机打满 30 层太慢（swiftshader 约 60 秒/游戏秒）：先实打验证叠层，再补足到 30 验证恐惧 / 凋零触发
await page.evaluate(() => window.__dlc1.coffin.addErode(window.__tb, 30)); await hit(['basic']); await wait(1.6);
let d = await D(); console.log(JSON.stringify(d.b));
ok(d.b.erodes >= 10 && d.b.erodeDmg > 0, `侵蚀叠 ${d.b.erodes} 层，跳伤 ${Math.round(d.b.erodeDmg)}`);
ok(d.b.fears + d.b.vulns >= 1, `侵蚀满 10 层 → 恐惧 ${d.b.fears} / 首领易伤 ${d.b.vulns}`);
ok(d.b.withers >= 1, `侵蚀满 30 层 → 冥河凋零 ${d.b.withers} 次，伤害 ${Math.round(d.b.witherDmg)}`);
const st = await page.evaluate(() => document.getElementById('cls-status')?.textContent ?? ''); ok(/侵蚀/.test(st), `状态行：${st.slice(0, 80)}`);

// ---------------- 饮血者：血祭 / 饮魂 / 血棺
s = await pick('c_war', 'cb_k_rite', 'cb_k_drink', 'cg_night');
ok(s.name === '饮血者' && s.adds.every(Boolean), `饮血者：关键 + 绝技能点（投入 ${s.spent}）`);
await page.evaluate(() => { const p = window.__game.player; p.hp = p.maxHp * 0.8; });
await wait(2.5);   // 冷却回转
for (let i = 0; i < 4; i++) { await hit(['skill1', 'skill2', 'skill3']); await wait(1.0); }
d = await D(); const hp1 = await page.evaluate(() => window.__game.player.hp / window.__game.player.maxHp);
ok(d.b.rites >= 1 && d.b.hpSpent > 0, `血祭消耗生命 ${d.b.rites} 次，共 ${Math.round(d.b.hpSpent)}（生命 ${(hp1 * 100).toFixed(0)}%）`);
ok(d.b.healed > 0, `饮魂吸血 ${Math.round(d.b.healed)}，溢出护盾 ${Math.round(d.b.shielded)}`);
await page.evaluate(() => window.__dlc1.coffin.debugSouls(['beast', 'man', 'giant'])); await key('x'); await wait(0.5);
await wait(8.5);   // 冷却回转
d = await D(); const bb0 = d.b.bloodBursts;
ok(d.blood > 0, `开棺 → 血棺 ${d.blood > 0 ? '已触发' : '未触发'}`);

// ---------------- 送葬者：五魂棺 / 魂爆 / 满棺齐放
s = await pick('c_und', 'cu_k_cap', 'cu_k_burst', 'cs_full');
ok(s.name === '送葬者' && s.adds.every(Boolean), `送葬者：关键 + 绝技能点（投入 ${s.spent}）`);
await wait(1.2);
const cap = await page.evaluate(() => ({ max: window.__dlc1.coffin.debug().max, res: window.__dlc1.coffin.api().res().max }));
ok(cap.max === 4 && cap.res === 4, `五魂棺：魂上限 ${cap.max}，资源条 ${cap.res}`);
await dummies(); await hit([]); await page.evaluate(() => window.__dlc1.coffin.debugSouls(['beast'])); await key('x'); await wait(1.0);
d = await D(); console.log(JSON.stringify(d.b), d.last);
ok(d.b.fills >= 1 && d.b.soulBursts >= 4, `满棺齐放补满 ${d.b.fills} 次，魂爆 ${d.b.soulBursts} 次（开棺 ${d.last}）`);
ok(errors.length === 0, `errors=${JSON.stringify(errors.slice(0, 3))}`);
console.log(`talentB_coffin ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
