// 11-05 40 级暗金 Lux3D 武器外观（05 交付 1105_暗金武器3D）：CLS=<职业> node test/dark40_look.mjs [html] [outdir]
//   按职业装上本职业 40 级暗金（generateFixed），检查专属模型 lux_w40_* 已挂上、页面无错，正面 / 侧面 / 背面 / 出招截图
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
const CLS = process.env.CLS || 'warrior';
const ITEMS = { warrior: ['d40_w_tide'], mage: ['d40_m_astro'], chrono: ['d40_t_wheel', 'd40_t_glass'], alchemy: ['d40_a_flask', 'd40_a_box'], hunter: ['d40_h_triad', 'd40_h_bow'], coffin: ['d40_c_sleepless'] };
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/dark40_look/' + CLS;
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(q => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, process.env.Q || '');   // 11-06：Q=medium/low 画质（沙箱 8 GB 高画质会 OOM）
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
const cid = CLS;
await page.evaluate(c => window.__game.startGame(c), cid); await page.waitForTimeout(4000);
// 11-05 出生点身后是营火，烟正好落在头顶（易误看成武器）→ 先往前挪 4 米、离开营火再截图
await page.evaluate(() => { const g = window.__game; g.player.pos.z += 4; g.camDistSet?.(4.5); }); await page.waitForTimeout(1500);
const put = await page.evaluate(ids => { const g = window.__game, inv = g.inventory, out = [];
  for (const id of ids) { const it = g.gen.generateFixed(id, 84); if (!it) { out.push(id + ':无'); continue; }
    const slot = it.slot === 'twoHand' || it.slot === 'oneHand' ? 'mainHand' : it.slot; inv.equipped[slot] = it; if (it.slot === 'twoHand') delete inv.equipped.offHand; out.push(`${id}→${slot}:${it.name}`); }
  g.refreshGear(); return out; }, ITEMS[CLS] ?? []);
await page.waitForTimeout(2500);
const mesh = await page.evaluate(() => { const r = window.__game.player.rig.root, n = []; r.traverse(o => { const k = o.userData?.luxKey; if (/^lux_w40_/.test(o.name) || /^w40_/.test(k ?? '')) n.push(o.name + (k ? '=' + k : '')); }); return n; });
ok(put.length && !put.some(s => s.includes(':无')), '装上 ' + put.join(' / '));
ok(mesh.length >= (ITEMS[CLS] ?? []).length + (CLS === 'hunter' ? 1 : 0), '专属模型已挂 ' + mesh.join(','));
const yaw = [0, 1.57, 3.14, 4.71];
for (let i = 0; i < yaw.length; i++) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, yaw[i]); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${CLS}_turn_${i}.png` }); }
for (const a of ['attack1', 'cast']) { await page.evaluate(a => { const g = window.__game; g.player.rig.root.rotation.y = 0.8; g.player.rig.anim?.play(a, 0.6); }, a); await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${CLS}_${a}.png` }); }
ok(!errors.length, '页面错误 ' + errors.length + '：' + JSON.stringify(errors.slice(0, 3)));
// 11-05 猎手：鹰形拔弓（弓到左手、箭袋留背上）/ 狼形弓与箭袋都背着——背面 + 侧面 + 拉弓
if (CLS === 'hunter') for (const f of ['eagle', 'wolf']) {
  await page.evaluate(f => window.__dlc1.hunter.setForm(f, true), f); await page.waitForTimeout(2500);
  for (const [k, y] of [['back', 3.14], ['side', 1.2]]) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, y); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/form_${f}_${k}.png` }); }
  if (f === 'eagle') { await page.evaluate(() => { const g = window.__game; g.player.rig.root.rotation.y = 0.9; g.player.rig.anim?.play('shoot', 0.5); }); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/form_eagle_shoot.png` }); }
  const q = await page.evaluate(() => { let p = null; window.__game.player.rig.root.traverse(o => { if (o.name === 'h_quiver') p = o.parent?.name; }); return p; });
  ok(!!q, `${f} 形态箭袋挂在 ${q}`);
}
ok(errors.length === 0, '无页面错误' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));
console.log(`dark40_look ${CLS} ${pass}/${pass + fail}`);
await b.close(); process.exitCode = fail ? 1 : 0;
