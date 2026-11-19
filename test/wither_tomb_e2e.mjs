// 11-04 立棺墓碑 负棺人 · 凋魂者「立棺墓碑」主循环实机（node test/wither_tomb_e2e.mjs [html=web/index_dlc1.html] [截图目录]）
// 立碑 → 回响（60%，回响命中叠侵蚀）→ 碑周减速 30% → 墓土侵蚀（每 1 秒 / 腐朽之地 0.5 秒 +1 层）→ 上限（侵蚀 30 层、冥河凋零首领 / 精英每秒 20+3×等级）
// → 收碑（再按 F 留土坑 / 走出 30 米自动收回）→ 送葬者立棺不变（没有墓土侵蚀）。表现：无几何圈、无加色、魂火 ≤ 1.2、全部关描边。
// swiftshader 约 60 秒 / 游戏秒：只等必要的游戏时间。
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1.html');
const SHOTS = process.argv[3] ? resolve(process.argv[3]) : ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && /职业运行时|职业技能/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('coffin')); await page.waitForTimeout(3000);
const D = () => page.evaluate(() => window.__dlc1.coffin.debug());
const V = () => page.evaluate(() => window.__dlc1.coffin.tombVis());
const wait = async s => { const t0 = await page.evaluate(() => window.__game.T); await page.waitForFunction(([t0, s]) => window.__game.T > t0 + s, [t0, s], { timeout: 900000 }); };
const shot = async (name, ms = 600) => { if (!SHOTS) return; await page.waitForTimeout(ms); try { await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 240000 }); console.log('  截图', name); } catch (e) { console.log('  截图失败', name, e.message); } };
const pick = (spec, k1, k2, cap) => page.evaluate(([spec, k1, k2, cap]) => {
  const g = window.__game; g.progression.level = 30; g.tree.totalPoints = 30; g.tree.reset();
  const sp = g.tree.def.specs.find(s => s.id === spec), row = r => sp.nodes.filter(n => n.row === r);
  const fill = r => { for (const n of row(r)) while (g.tree.add(n.id)); };
  const r = []; fill(1); r.push(g.tree.add(k1)); fill(3); r.push(g.tree.add(k2)); fill(5); r.push(g.tree.add(cap));
  g.syncCharacter?.(); g.player.hp = g.player.maxHp;
  return { name: sp.name, adds: r, spent: g.tree.spent };
}, [spec, k1, k2, cap]);
/** 附近 4 个怪站桩不还手；目标 = 第一个（血量放大、按精英算） */
const dummies = () => page.evaluate(() => { const g = window.__game, foes = g.enemies.filter(e => e.alive && e.z === g.zone).slice(0, 4), t = foes[0];
  window.__tb = t; window.__foes = foes;
  for (const e of foes) { e.brain.update = () => ({ state: 'idle', moveDir: null, speed: 0, faceTo: null, attacked: false }); e.evadeUntil = 0; e.type = { ...e.type, dmg: 0 }; }
  t.maxHp = t.hp = 3e6; t.type = { ...t.type, elite: true };
  foes.slice(1).forEach((e, i) => { e.maxHp = e.hp = 3e5; e.pos.set(t.pos.x + 1 + i * 0.6, 0, t.pos.z + 1); });
  g.player.pos.set(t.pos.x - 2.2, 0, t.pos.z); g.target = t; g.faceTo?.(t.pos);
  for (const id of ['bag', 'char', 'talent', 'quests', 'dialog', 'settings', 'shop', 'travel', 'worldmap', 'changelog', 'skillbook', 'spirit', 'nextstep', 'lesson']) { const el = document.getElementById(id); if (el?.style.display === 'flex') el.style.display = 'none'; }
  return foes.length; });
const cast = slots => page.evaluate(slots => { const g = window.__game, t = window.__tb; g.target = t; g.faceTo?.(t.pos); for (const s of slots) g.tryCast(s); }, slots);
const key = k => page.evaluate(k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); }, k);
const goodVis = (v, m) => { ok(v.grave && !v.ring, `${m}：墓碑在场景里，没有几何圆环`); ok(v.maxK <= 1.2 + 1e-6 && v.additive === 0 && v.noOutline, `${m}：材质最亮 ${v.maxK.toFixed(2)}（≤ 1.2）、加色 ${v.additive} 个、全部关描边 ${v.noOutline}（${v.mats} 个材质）`); };

// ---------------- 1. 凋魂者主系：立碑
let s = await pick('c_fer', 'cw_k_erode', 'cw_k_fear', 'cr_styx');
ok(s.name === '凋魂者' && s.adds.every(Boolean), `凋魂者：暗影侵蚀 + 恐惧 + 冥河凋零（投入 ${s.spent}）`);
const nf = await dummies(); ok(nf >= 2, `站桩怪 ${nf} 个`);
// 记录墓碑减速：每次施加后目标的移动速度倍率
await page.evaluate(() => { const ap = window.__dlc1.coffin.api(), o = ap.slow; window.__slows = []; ap.slow = (t, pc, d) => { o(t, pc, d); window.__slows.push({ pc, d, mul: t.status?.speedMultiplier }); }; });
let d = await D(); ok(d.witherTomb && d.groundOn && d.groundIv === 1, `主系凋魂者 → 凋魂墓碑（墓土每 ${d.groundIv} 秒 +1 层）`);
await key('f'); await page.waitForTimeout(400);
await page.evaluate(() => { const g = window.__game, t = window.__tb; g.player.pos.set(t.pos.x - 2.2, 0, t.pos.z + 1.6); g.faceTo?.(t.pos); });   // 侧跨一步，截图能看到墓碑
d = await D(); ok(d.mode === 'planted' && !!d.tomb, `立碑：棺态 ${d.mode}，墓碑 (${d.tomb?.x.toFixed(1)}, ${d.tomb?.z.toFixed(1)})`);
let v = await V(); goodVis(v, '立碑'); ok(v.rot && v.soulFire, `腐朽之地腐蚀纹 ${v.rot}、棺盖魂火 ${v.soulFire}`);
await shot('01_立碑', 900);
const st = await page.evaluate(() => document.getElementById('cls-status')?.textContent ?? ''); ok(/凋魂墓碑/.test(st) && /侵蚀/.test(st), `状态行：${st.slice(0, 70)}`);

// ---------------- 2. 回响：技能 0.25 秒后从墓碑处再放一次（60%），回响命中也叠侵蚀
const before = await D();
await cast(['skill2']); await wait(0.45);
d = await D();
ok(d.stats.echoes > before.stats.echoes, `回响 ${d.stats.echoes - before.stats.echoes} 次（倍率 ${d.echoMul}）`);
ok(Math.abs(d.echoMul - 0.6) < 1e-9, `回响伤害 = 原技能 60%（定稿）`);
ok(d.b.echoHits > 0 && d.b.echoErodes > 0, `回响命中 ${d.b.echoHits} 个，叠侵蚀 ${d.b.echoErodes} 层`);
await shot('02_回响', 50);

// ---------------- 3. 减速 + 墓土侵蚀
await wait(1.1);
d = await D();
const sl = await page.evaluate(() => ({ n: window.__slows.length, pc: [...new Set(window.__slows.map(x => x.pc))], mul: Math.min(...window.__slows.map(x => x.mul ?? 1)), dist: window.__foes.map(e => Math.hypot(e.pos.x - window.__dlc1.coffin.debug().tomb.x, e.pos.z - window.__dlc1.coffin.debug().tomb.z).toFixed(1)) }));
ok(d.stats.slowed > 0 && sl.n > 0 && sl.pc.length === 1 && Math.abs(sl.pc[0] - 0.3) < 1e-9 && Math.abs(sl.mul - 0.7) < 1e-6, `碑周 5 米减速 30%：施加 ${sl.n} 次，移动速度倍率 ${sl.mul}（怪离墓碑 ${sl.dist.join(' / ')} 米）`);
ok(d.b.groundTicks >= 1 && d.b.tombErodes >= 1, `墓土侵蚀：跳 ${d.b.groundTicks} 次，叠 ${d.b.tombErodes} 层`);
const en = await page.evaluate(() => window.__foes.map(e => window.__dlc1.coffin.erodeN(e)));
ok(en.filter(n => n > 0).length >= 2, `碑周敌人侵蚀层数 ${JSON.stringify(en)}`);
await page.evaluate(() => { const g = window.__game, t = window.__tb; g.player.pos.set(t.pos.x - 4.5, 0, t.pos.z + 3.5); g.faceTo?.(t.pos); });   // 退到碑外看腐朽之地
await shot('03_腐朽之地', 2500);
await page.evaluate(() => { const g = window.__game, t = window.__tb; g.player.pos.set(t.pos.x - 2.2, 0, t.pos.z + 1.6); });

// ---------------- 4. 上限：侵蚀 30 层；冥河凋零对精英每秒 ≤ 20 + 3×等级
await page.evaluate(() => window.__dlc1.coffin.addErode(window.__tb, 99));
const n30 = await page.evaluate(() => window.__dlc1.coffin.erodeN(window.__tb)); ok(n30 === 30, `侵蚀上限 30 层（加 99 层后 ${n30}）`);
d = await D(); const w0 = d.b.witherDmg; ok(d.wither >= 1, `满 30 层 → 冥河凋零（${d.b.withers} 次）`);
await wait(2.05); d = await D();
const per = (d.b.witherDmg - w0) / 2, cap = d.witherCap;
ok(cap === 20 + 3 * 30 && per > 0 && per <= cap * 1.1 + 1, `冥河凋零对精英每秒 ${per.toFixed(0)}（上限 ${cap}，目标 1% 最大生命 = 30000，含易伤 ≤ +10%）`);

// ---------------- 5. 收碑：再按 F（留土坑）；走出 30 米自动收回
await key('f'); await page.waitForTimeout(300);
d = await D(); v = await V(); ok(d.mode === 'back' && !d.tomb && !v.grave && v.pit, `再按 F 收碑：棺态 ${d.mode}，墓碑 ${v.grave}，土坑 ${v.pit}`);
await wait(0.7); await key('f'); await page.waitForTimeout(200);
d = await D(); ok(d.mode === 'planted', '再次立碑');
await page.evaluate(() => { const g = window.__game, p = g.player.pos; p.set(p.x + 31, p.y, p.z); });
await wait(0.15); d = await D(); ok(d.mode === 'back', `走出 30 米 → 自动收回（${d.mode}）`);
await page.evaluate(() => { const g = window.__game, t = window.__tb; g.player.pos.set(t.pos.x - 2.2, 0, t.pos.z); });

// ---------------- 6. 腐朽之地：墓土 0.5 秒一跳
s = await pick('c_fer', 'cw_k_rot', 'cw_k_spread', 'cr_styx');
d = await D(); ok(s.adds.every(Boolean) && d.groundIv === 0.5, `腐朽之地：墓土每 ${d.groundIv} 秒 +1 层`);
await wait(0.7); await key('f'); await page.waitForTimeout(200);
const g0 = (await D()).b.groundTicks; await wait(1.05); d = await D();
ok(d.b.groundTicks - g0 >= 2, `腐朽之地 1 秒内跳 ${d.b.groundTicks - g0} 次`);
await key('f'); await page.waitForTimeout(200);

// ---------------- 7. 送葬者 / 本体行为不变：立棺只有回响 + 减速，没有墓土侵蚀
s = await pick('c_und', 'cu_k_cap', 'cu_k_burst', 'cs_full');
d = await D(); ok(!d.witherTomb && !d.groundOn, `送葬者：不是凋魂墓碑（witherTomb ${d.witherTomb}）`);
await wait(0.7); await key('f'); await page.waitForTimeout(200);
const u0 = await D(); await cast(['skill2']); await wait(1.1); d = await D();
ok(d.mode === 'planted' && d.stats.echoes > u0.stats.echoes && d.b.groundTicks === u0.b.groundTicks, `送葬者立棺：回响 ${d.stats.echoes - u0.stats.echoes} 次，墓土侵蚀 0 跳（不变）`);
v = await V(); ok(v.grave && !v.rot, `送葬者墓碑没有腐朽之地腐蚀纹`); goodVis(v, '送葬者墓碑');
await key('f');

ok(errors.length === 0, `页面错误 ${errors.length}：${JSON.stringify(errors.slice(0, 3))}`);
console.log(`wither_tomb ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
