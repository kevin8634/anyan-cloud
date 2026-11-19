import { readFileSync } from 'node:fs';
// 11-04 法师 40 级长袍外观（LUX_Mage40Robe，05 fix2）接入实测：node test/robe40_e2e.mjs [html=web/index_dlc1_比赛版.html] [截图目录]
//   法师开局 → 身上胸甲换成「潮汐长袍」（lg40_m_tiderobe）→ refreshGear → 身体换 LUX_Mage40Robe；脱掉 → 回 LUX_Mage
//   近景转 4 个角度 + 待机 / 跑 / 施法 / 长施法 / 普攻 / 冲刺 / 受击 / 死亡各一张（看长袍穿模、拉伸）
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const CLS = process.env.CLS || 'mage', LG = process.env.CHEST || { mage: 'lg40_m_tiderobe', chrono: 'lg40_c_tidecoat', coffin: 'lg40_c_shroudplate', warrior: 'lg40_w_echoplate', hunter: 'lg40_h_packmail', alchemy: 'lg40_a_apron' }[CLS], TAG = (CLS === 'mage' ? 'robe40' : CLS + '40') + (process.env.CHEST ? '_' + process.env.CHEST : '') + (process.env.SET40 === '1' ? '_set6' : '');
// 11-05：CHEST=<件 id> 指定胸甲（lg40_* 走 lgId；i_* 套装件走 fixedId，例 CHEST=i_h_set_hauberk 万兽盟约锁甲）；打印按职业输出
const CN = { mage: '法师', chrono: '时砂', coffin: '负棺人', warrior: '战士', hunter: '猎手', alchemy: '炼金' }[CLS] ?? CLS;
const MODEL = { mage: ['LUX_Mage', 'LUX_Mage40Robe'], chrono: ['LUX_Chrono', 'LUX_Chrono40'], coffin: ['LUX_Coffin', 'LUX_Coffin40'], warrior: ['LUX_Warrior', 'LUX_Warrior40'], hunter: ['LUX_Hunter', 'LUX_Hunter40'], alchemy: ['LUX_Alchemy', 'LUX_Alchemy40'] }[CLS] ?? ['写实', '40 级'];
const CHEST_NAME = { lg40_m_tiderobe: '潮汐长袍', lg40_c_tidecoat: '逆潮外衣', lg40_c_shroudplate: '寿衣铁铠', i_c_set_chest: '长夜送葬胸甲', lg40_w_echoplate: '回响胸铠', lg40_h_packmail: '群狼锁甲', i_h_set_hauberk: '万兽盟约锁甲', lg40_a_apron: '回响炼成围裙' }[LG] ?? LG;
const KEY = LG.startsWith('i_') ? 'fixedId' : 'lgId';
// 11-05 SET40=1：穿本职业 40 级套装全 6 件（Rhett：套装是 6 件，集齐才换整身，BODY40_MIN=6）→ 验证 body40 按件数触发；脱掉 = 卸下这 6 件
const S40P = process.env.SET40 === '1' ? [...readFileSync(new URL('../src/dlc/dlc1/sets40.ts', import.meta.url), 'utf8').matchAll(/piece\('(i40_[a-z]_[a-z]+)', '[^']*', '(\w+)'/g)].filter(m => m[1].startsWith('i40_' + { warrior: 'w', mage: 'm', chrono: 't', alchemy: 'a', hunter: 'h', coffin: 'c' }[CLS] + '_')).map(m => [m[2], m[1]]) : null;
// 11-05 Rhett：套装 6 件集齐才换整身 → 测试穿满 6 件（头 / 肩 / 胸 / 手 / 腕 / 腿），另抽测 5 件不换
const SET40P = S40P && S40P.length ? S40P : null;
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/' + TAG;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(c => window.__game.startGame(c), CLS); await page.waitForTimeout(4000); await page.evaluate(() => window.__game.camDistSet?.(5.5));
const body = () => page.evaluate(() => { const r = window.__game.player.rig.root; let model = null; r.traverse(o => { if (o.isSkinnedMesh && !model) model = o.name || o.parent?.name; }); return { body40: r.userData.body40 ?? false, lux: !!r.userData.lux, model }; });
ok((await body()).lux, '开局：写实' + CN + ' ' + JSON.stringify(await body()));
const hp = () => page.evaluate(() => { const p = window.__game.player; return { hp: p.hp, max: p.maxHp, chest: window.__game.inventory.equipped.chest?.name ?? null }; });
console.log('hp0', JSON.stringify(await hp()));
for (const [i, y] of [[0, 0], [1, 3.14]]) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, y); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/base_turn_${i}.png` }); }
await page.evaluate(() => { const g = window.__game; g.player.rig.anim?.play('cast'); }); await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/base_cast.png` });
await page.evaluate(([LG, KEY, SET40]) => { const g = window.__game, inv = g.inventory; const cur = inv.equipped.chest;
  // 11-05 假胸甲补齐 ItemInstance 必填数值字段（原来缺 hp / armor → 生命 NaN，血球显示 NaN）
  const fake = { id: 'robe40_test', baseId: 'robe40_test', name: '40 级胸甲', slot: 'chest', quality: 'orange', itemLevel: 40, hp: 0, armor: 0, lines: [], sellPrice: 0, durability: 100, modifiers: [] };
  if (SET40) { for (const [slot, pid] of SET40) inv.equipped[slot] = { ...fake, id: 's40_' + slot, slot, name: pid, fixedId: pid };
    g.refreshGear(); return; }
  const c = { ...(cur ?? fake), id: 'robe40_on' }; delete c.lgId; delete c.fixedId; c[KEY] = LG; inv.equipped.chest = c; g.refreshGear(); }, [LG, KEY, SET40P]);
await page.waitForTimeout(2500);
console.log('hp1', JSON.stringify(await hp()));
const on = await body(); const h1 = await hp(); ok(Number.isFinite(h1.hp) && h1.hp > 0 && Number.isFinite(h1.max), '换胸甲后生命正常 ' + JSON.stringify(h1));
ok(on.body40 === MODEL[1], (SET40P ? '穿 40 级套装 6 件' : '穿' + CHEST_NAME) + ' → 身体换 ' + MODEL[1] + ' ' + JSON.stringify(on));
const orb = await page.evaluate(() => document.getElementById('orb-hpt')?.textContent ?? ''); ok(!/NaN/.test(orb), '血球文字无 NaN：' + orb);
await page.evaluate(() => { const g = window.__game; g.camDistSet?.(5.5); }); await page.waitForTimeout(800);
const yaw = [0, 1.57, 3.14, 4.71];
for (let i = 0; i < yaw.length; i++) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, yaw[i]); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${TAG}_turn_${i}.png` }); }
for (const a of ['run', 'cast', 'castLong', 'attack1', 'dash', 'hit', 'channel']) {
  await page.evaluate(n => { const g = window.__game; g.player.rig.root.rotation.y = 0.6; n === 'run' ? g.player.rig.anim?.loop('run') : g.player.rig.anim?.play(n); }, a);
  await page.waitForTimeout(a === 'run' ? 900 : 450); await page.screenshot({ path: `${OUT}/${TAG}_${a}.png` });
}
await page.evaluate(() => { const g = window.__game, c = { ...g.inventory.equipped.chest, id: 'robe40_off' }; delete c.lgId; delete c.fixedId; g.inventory.equipped.chest = c; for (const sl of ['head', 'shoulder', 'chest', 'hands', 'wrist', 'legs']) if (g.inventory.equipped[sl]?.id === 's40_' + sl) delete g.inventory.equipped[sl]; g.refreshGear(); }); await page.waitForTimeout(2500);
const off = await body(); ok(!off.body40 && off.lux, '脱掉 → 回 ' + MODEL[0] + ' ' + JSON.stringify(off));
ok(errors.length === 0, '页面错误 0：' + JSON.stringify(errors.slice(0, 3)));
console.log(`${TAG} ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
