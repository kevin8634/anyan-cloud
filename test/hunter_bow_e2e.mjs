// 11-05 灵契猎手武器两栏（Rhett）：node test/hunter_bow_e2e.mjs [html=web/index_dlc1_比赛版.html] [截图目录]
//   老存档（主手单手弓 + 副手短刃、背包一把长柄）进游戏 → 读档迁移：短刃回背包、弓进弓位、长柄进主手；
//   两栏同时装备；狼 / 熊：右手长柄、弓锁在背；鹰：左手弓、长柄锁在背；鹰形态普攻 = 箭矢弹体 + shoot（拉弓）动作；页面错误 0
//   截图：人形（收纳）正 / 背、狼形态出手、熊形态出手、鹰形态拉弓，外加鹰形态拉弓 GIF 帧（gif/ 目录，之后用 ffmpeg 拼）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/hunter_bow';
mkdirSync(OUT + '/gif', { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const it = (id, baseId, name, slot, weaponType, quality = 'blue', itemLevel = 20) => ({ id, baseId, name, slot, weaponType, quality, itemLevel, hp: 0, armor: 0, bonus: { power: 10 }, modifiers: [], lines: [], sellPrice: 1, pack: 'dlc1', durability: 100 });
const meta = { id: 'hb', name: '弓栏测试', classId: 'hunter', look: 0, level: 20, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
const SAVE = { version: 10, savedAt: 1, classId: 'hunter', name: '弓栏测试', level: { level: 20, xp: 0 }, talents: {}, quests: { active: {}, done: [] },
  inventory: { gold: 10, bag: [it('old_gl', 'b_h_glaive', '契约长柄弯刃', 'twoHand', 'glaive', 'blue', 22)], equipped: { mainHand: it('old_bow', 'b_h_bow', '猎卫长弓', 'oneHand', 'bow', 'purple', 21), offHand: it('old_sb', 'b_h_shortblade', '兽牙短刃', 'offHand', 'shortblade') }, stacks: {} } };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERR', (e.stack || e.message).split('\n').slice(0, 3).join(' ⏎ ')); });
page.setDefaultTimeout(900000);
await page.addInitScript(([m, s]) => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1');
  localStorage.setItem('darkrock_roster', JSON.stringify({ v: 1, slots: [m, null, null, null, null, null, null, null], last: 'hb', legacyMigrated: true })); localStorage.setItem('darkrock_char_hb', JSON.stringify(s)); } }, [meta, SAVE]);
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => { const g = window.__game; g.selSlot = 0; g.renderTitle?.(); document.getElementById('start').click(); });
await page.waitForFunction(() => window.__game.curChar && window.__game.cls?.id === 'hunter', null, { timeout: 300000 });
await page.waitForTimeout(4000);
const closeUi = () => page.evaluate(() => { const g = window.__game; g.tutFinish?.(); try { g.togglePanel?.('changelog', false); } catch { /* 没开 */ } document.getElementById('cls-help')?.remove(); g.camDistSet?.(5.5); });   // 老角色进游戏会弹「本次更新」+ 职业要点
await closeUi(); await page.waitForTimeout(800); await closeUi();
// 1 老存档迁移
const inv = () => page.evaluate(() => { const v = window.__game.inventory; return { mh: v.equipped.mainHand?.id ?? null, mhT: v.equipped.mainHand?.weaponType ?? null, oh: v.equipped.offHand?.id ?? null, ohT: v.equipped.offHand?.weaponType ?? null, bag: v.bag.map(i => i.id), on: v.slotName('offHand'), mn: v.slotName('mainHand') }; });
const i1 = await inv();
ok(i1.mh === 'old_gl' && i1.oh === 'old_bow' && i1.bag.includes('old_sb'), '老存档迁移：短刃回背包、弓进弓位、背包长柄进主手 ' + JSON.stringify(i1));
const again = await page.evaluate(() => window.__game.inventory.migrateRangedOffhand(() => null));
ok(again.length === 0, '迁移幂等（再跑一遍不动）');
ok(i1.on === '弓' && i1.mn === '主手：长柄', `格子名：${i1.mn} / ${i1.on}`);
// 2 两栏同时装备：换一把新长柄 + 新弓，互不卸下
const i2 = await page.evaluate(() => { const g = window.__game, v = g.inventory; const gl = g.gen.generateFromBase('b_h_glaive', 20, 'orange'), bw = g.gen.generateFromBase('b_h_bow', 20, 'purple'); v.bag.push(gl, bw);
  const a = v.tryEquip(gl.id), c = v.tryEquip(bw.id), d = v.tryEquip('old_sb'); g.refreshGear(); return { a: a.ok, c: c.ok && c.slot, d: d.ok, mh: v.equipped.mainHand?.id === gl.id, oh: v.equipped.offHand?.id === bw.id }; });
ok(i2.a && i2.c === 'offHand' && i2.mh && i2.oh && !i2.d, '两栏同时装备（长柄 → 主手、弓 → 弓位，互不卸下；短刃不能装备）' + JSON.stringify(i2));
await page.waitForTimeout(2500);
const H = () => page.evaluate(() => { const s = window.__game.stow.info(); const r = window.__game.player.rig.root; const q = r.getObjectByName('h_quiver');
  return { k: s?.k, items: (s?.items ?? []).filter(x => x.name === 'h_glaive' || x.name === 'h_bow').map(x => ({ n: x.name, parent: x.parent, lock: x.lock, kk: x.kk, dHand: +x.dHand.toFixed(3), dSock: x.dSock === null ? null : +x.dSock.toFixed(3), spot: x.spot })), quiver: !!q, quiverParent: q?.parent?.name ?? null }; });
const by = (h, n) => h.items.find(x => x.n === n);
const form = f => page.evaluate(f => window.__dlc1.hunter.setForm(f, true), f);
const settle = async (want) => { await page.evaluate(w => window.__game.stow.force(w), want); await page.waitForFunction(w => { const s = window.__game.stow.info(); return s && s.items.every(x => x.kk === (x.lock ? 1 : (w === 'drawn' ? 0 : 1))); }, want, { timeout: 60000, polling: 200 }).catch(() => {}); await page.waitForTimeout(600); };
// 3 人形（收纳）：两把都在背上 + 箭袋
await form('wolf'); await settle('stowed');
const h0 = await H();
ok(h0.quiver && by(h0, 'h_glaive')?.dSock < 0.05 && by(h0, 'h_bow')?.dSock < 0.05, '人形收纳：长柄、弓都在背上挂点，箭袋常驻 ' + JSON.stringify(h0));
for (const [i, y] of [[0, 0.5], [1, 3.14]]) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, y); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/human_${i ? 'back' : 'front'}.png` }); }
// 4 狼 / 熊：右手长柄，弓锁在背
for (const f of ['wolf', 'bear']) {
  await form(f); await settle('drawn');
  const h = await H(), gl = by(h, 'h_glaive'), bw = by(h, 'h_bow');
  ok(gl && gl.parent === 'handslotr' && !gl.lock && gl.dHand < 0.01 && bw && bw.lock && bw.dSock < 0.05, `${f}：右手长柄在手、弓斜背 ` + JSON.stringify(h));
  await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 0.7; g.player.rig.anim?.play('attack1', 0.6); }); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${f}_glaive.png` });
}
// 5 鹰：左手弓，长柄锁在背
await form('eagle'); await settle('drawn');
const he = await H(), gle = by(he, 'h_glaive'), bwe = by(he, 'h_bow');
ok(bwe && bwe.parent === 'handslotl' && !bwe.lock && bwe.dHand < 0.01 && gle && gle.lock && gle.dSock < 0.05, '鹰：左手弓在手、长柄收在背 ' + JSON.stringify(he));
// 6 鹰形态普攻：投射物（箭矢）+ shoot 动作；目标 = 训练假人 / 任一活着的敌人（没有就刷一只挪到 9 米外）
const tg = await page.evaluate(() => { const g = window.__game, P = g.player.pos; let e = g.dummy && g.dummy.alive ? g.dummy : g.enemies.find(x => x.alive);
  if (!e) { g.stressSpawn?.(1); e = g.enemies.find(x => x.alive); }
  if (!e) return null; e.pos.set(P.x, e.pos.y, P.z + 9); g.target = e; g.player.rig.root.rotation.y = 0; return { kind: e.kind ?? e.type ?? '?', alive: e.alive }; });
ok(!!tg, '找到目标 ' + JSON.stringify(tg));
await closeUi(); await page.evaluate(() => window.__game.loadout.resetCooldown?.('basic'));
const shot = await page.evaluate(() => { const g = window.__game, n0 = g.projectiles.length; g.tryCast('basic'); const ps = g.projectiles.slice(n0);
  return { n: ps.length, arrow: ps.some(p => !!p.mesh.getObjectByName?.('h_arrow') || p.mesh.name === 'h_arrow'), shape: ps[0]?.skill.shape ?? null, tags: ps[0]?.skill.tags ?? [], range: ps[0]?.skill.stats.range ?? null, panel: [...document.querySelectorAll('.panel')].filter(e => e.style.display && e.style.display !== 'none').map(e => e.id).join(), last: g.stow.act().last, clip: g.stow.clip('shoot') }; });
ok(shot.n >= 1 && shot.arrow && shot.shape === 'projectile' && shot.tags.includes('arrow'), `鹰形态普攻发出投射物（箭矢 ${shot.arrow}，射程 ${shot.range}）`);
ok(shot.last === 'shoot' && /DrawArrow|AimRecoil|Throw/.test(shot.clip), `播放 shoot 动作（${shot.last} → ${shot.clip}）`);
// 截图：鹰形态拉弓 + GIF 帧
await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 0.9; g.player.rig.anim?.play('shoot', 0.5); }); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/eagle_draw.png` });
await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 0.9; g.player.rig.anim?.play('shoot', 0.35); });
for (let i = 0; i < 14; i++) { await page.screenshot({ path: `${OUT}/gif/f${String(i).padStart(2, '0')}.png`, clip: { x: 230, y: 90, width: 500, height: 560 } }); await page.waitForTimeout(150); }
// 7 狼形态普攻仍是近战（不发投射物）
await form('wolf'); await page.evaluate(() => { const g = window.__game, P = g.player.pos, e = g.target; if (e) e.pos.set(P.x, e.pos.y, P.z + 1.5); g.loadout.resetCooldown?.('basic'); }); await closeUi(); await page.waitForTimeout(1200);   // 目标挪到近战距离内（9 米外 basic 会因距离太远静默不出手）
const melee = await page.evaluate(() => { const g = window.__game, n0 = g.projectiles.length; g.tryCast('basic'); return { n: g.projectiles.length - n0, last: g.stow.act().last }; });
ok(melee.n === 0 && /attack/.test(melee.last ?? ''), '狼形态普攻：近战长柄（无投射物）' + JSON.stringify(melee));
ok(errors.length === 0, '页面错误 0：' + JSON.stringify(errors.slice(0, 3)));
console.log(`hunter_bow ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
