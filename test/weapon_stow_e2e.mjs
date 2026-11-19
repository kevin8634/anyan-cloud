// v1.2.48 武器收纳浏览器端到端：每个职业 闲置 → 武器在背 / 腰收纳挂点；出手（攻击动作）→ 回到手上；脱战约 4 秒 → 收回；受击 → 取出
// 两套：比赛版写实（index_dlc1_比赛版.html，charModel=new，Lux3D 模型 + 运行时铸造外观 lux_*）+ 普通版（index_dlc1.html，经典 KayKit）
// 用法：node test/weapon_stow_e2e.mjs [aholo|base|all] [职业,…]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
import { existsSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname;
const MODE = process.argv[2] || 'all';
const CLS = (process.argv[3] || 'warrior,mage,chrono,alchemy,hunter,coffin').split(',');
const RUNS = [
  { tag: '比赛版写实', html: resolve(ROOT, 'web/index_dlc1_比赛版.html'), model: 'new', want: 'aholo' },
  { tag: '普通版经典', html: resolve(ROOT, 'web/index_dlc1.html'), model: 'classic', want: 'base' },
].filter(r => (MODE === 'all' || MODE === r.want) && existsSync(r.html));
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
let b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let page = await b.newPage({ viewport: { width: 480, height: 360 } });
const errors = [];
const info = () => page.evaluate(() => window.__game.stow.info());
/** 等到收纳程度 k 到目标（画面帧率低，按游戏内时间推进，给足真实时间） */
const waitK = (k, ms) => page.waitForFunction(k => { const s = window.__game.stow.info(); return s && s.k === k; }, k, { timeout: ms, polling: 200 }).then(() => true, () => false);
async function runClass(R, c) {
  await b.close().catch(() => {}); b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); page = await b.newPage({ viewport: { width: 480, height: 360 } }); page.on('pageerror', e => { if (!errors.length) console.log('PAGEERR', c, (e.stack || e.message).split('\n').slice(0, 4).join(' ⏎ ')); errors.push(e.message); });
  await page.addInitScript(m => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low', charModel: m })); sessionStorage.setItem('__init', '1'); } }, R.model);
  page.setDefaultNavigationTimeout(180000);   // 10-27：比赛版页面 95–120 MB，file:// 加载在软件渲染 + 其他浏览器任务并发时常超过默认 30 秒 → 导航超时放宽到 180 秒
  await page.goto('file://' + R.html);   // 每职业新页面（比赛版 94MB 反复 reload 会把浏览器内存撑爆）
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
  await page.evaluate(c => window.__game.startGame(c), c);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.stow.force(undefined); });
  const T = `[${R.tag}·${c}]`;
  // 1 闲置：收好（在营地，没有怪追）
  const s1 = await waitK(1, 60000), i1 = await info();
  ok(s1 && i1.items.length > 0, `${T} 闲置收纳 k=${i1?.k} 件数 ${i1?.items.length}（${i1?.items.map(i => i.spot).join('/')}）`);
  const hd = R.model === 'new';
  for (const it of i1?.items ?? []) {
    ok(it.dSock !== null && it.dSock < 0.02, `${T} ${it.spot} 对准收纳挂点（偏差 ${it.dSock?.toFixed(3)}）`);
    ok(it.dHand > (it.spot === 'beltR' ? 0.2 : 0.15), `${T} ${it.spot} 离开手（${it.dHand.toFixed(2)}${it.spot === 'beltR' ? '，药瓶挂点 ≥ 0.20' : ''}）`);   // v1.2.48 beltR 前移
    if (it.spot === 'beltR') { const dc = Math.hypot(it.sock[0] - it.hand[0], it.sock[1] - it.hand[1], it.sock[2] - it.hand[2]); ok(dc >= 0.2, `${T} 药瓶瓶身中心离下垂的手 ${dc.toFixed(2)}（≥ 0.20）`); }
    ok(/^handslot[rl]$/.test(it.parent), `${T} ${it.spot} 父节点仍是手骨（${it.parent}）`);
    if (hd && it.lux.length) ok(true, `${T} 收纳时 lux 外观仍在武器下：${it.lux.join(',')}`);
  }
  const spots = (i1?.items ?? []).map(i => i.spot);
  const expect = { warrior: hd ? ['hipL'] : ['back'], mage: ['backStaff'], chrono: ['ringR'], alchemy: ['beltR'], hunter: ['backStaff'], coffin: ['beltFrontR'] }[c];
  if (expect) ok(expect.every(e => spots.includes(e)), `${T} 收纳位置 ${spots.join('/')}（应含 ${expect.join('/')}）`);
  if (hd) ok(await page.evaluate(() => window.__game.stow.clip('idle')) === 'Idle_Loop', `${T} 收纳时放松待机 ${await page.evaluate(() => window.__game.stow.clip('idle'))}`);
  // 光效：收纳时 weaponfx 光环 / 品级光焰隐藏
  const fxVis = await page.evaluate(() => { let v = 0; window.__game.player.rig.root.traverse(o => { if (o.name.startsWith('wfx_') && o.visible) v++; }); return v; });
  ok(fxVis === 0, `${T} 收纳时武器光环隐藏（可见 ${fxVis}）`);
  // 2 出手：攻击动作 → 取出到手上
  await page.evaluate(() => window.__game.player.rig.anim.play('attack1', 1));
  const s2 = await waitK(0, 30000), i2 = await info();
  ok(s2 && i2.items.every(i => i.dHand < 0.005), `${T} 出手后武器在手（k=${i2.k}，离手 ${i2.items.map(i => i.dHand.toFixed(3)).join('/')}）`);
  if (hd && c === 'warrior') ok(!/Idle_Loop/.test(await page.evaluate(() => window.__game.stow.clip('idle'))), `${T} 拿出后战斗待机`);
  // 刚出手 1 秒内不收
  ok(await page.evaluate(() => window.__game.stow.info().k === 0 && window.__game.stow.act().age < window.__game.stow.after), `${T} 脱战计时内保持在手`);
  // 3 脱战约 4 秒 → 收回
  const s3 = await waitK(1, 120000), a3 = await page.evaluate(() => window.__game.stow.act());
  ok(s3 && a3.age >= 4, `${T} 脱战 ${a3.age?.toFixed(1)} 秒后收回`);
  // 4 受击 → 取出
  await page.evaluate(() => { const g = window.__game; g.player.lastHurt = g.T; });
  const s4 = await waitK(0, 30000);
  ok(s4, `${T} 受击后取出`);
  // 5 换武器组合：各自的收纳位置（假物品直接穿上 → 重建外观）
  const V = { warrior: [[['greatsword'], ['back']], [['sword', 'shield'], [hd ? 'hipL' : 'back', 'backShield']], [['axe', 'axe'], hd ? ['hipL', 'hipR'] : ['back', 'backX']]],
    mage: [[['wand', 'orb'], [hd ? 'hipR' : 'beltR', 'beltL']], [['dagger', 'tome'], ['hipBack', 'beltL']]],
    chrono: [[['chakram', 'chakram'], ['ringR', 'ringL']], [['chakram', 'hourglass'], ['ringR', 'beltL']]] }[c] ?? [];
  for (const [w, want] of V) {
    await page.evaluate(w => { const g = window.__game, e = g.inventory.equipped; const mk = (t, s) => ({ uid: 'stow_' + s, id: 'stow_' + t, name: '收纳测试' + t, slot: s, weaponType: t, quality: 'purple', itemLevel: 20, upgrade: 0, durability: 100, stats: {}, modifiers: [], affixes: [], bonus: {} });
      e.mainHand = mk(w[0], 'mainHand'); if (w[1]) e.offHand = mk(w[1], 'offHand'); else delete e.offHand; g.refreshGear(true); g.stow.force('stowed'); }, w);
    const a = await waitK(1, 30000), iv = await info(), got = iv.items.map(i => i.spot);
    ok(a && want.every(x => got.includes(x)) && iv.items.every(i => i.dSock < 0.02), `${T} ${w.join('+')} 收纳 ${got.join('/')}（应为 ${want.join('/')}）`);
    await page.evaluate(() => window.__game.stow.force('drawn'));
    const d = await waitK(0, 30000), dv = await info();
    ok(d && dv.items.every(i => i.dHand < 0.005), `${T} ${w.join('+')} 取出在手`);
    if (c === 'warrior' && w[0] === 'greatsword') ok(/GreatSlash|2H_Melee/.test(await page.evaluate(() => window.__game.stow.clip('attack1'))), `${T} 双手巨剑普攻用双手劈砍：${await page.evaluate(() => window.__game.stow.clip('attack1'))}`);
    if (c === 'warrior' && w[0] === 'sword') ok(!/GreatSlash|2H_Melee/.test(await page.evaluate(() => window.__game.stow.clip('attack1'))), `${T} 单手剑恢复单手动作`);
  }
  if (V.length) await page.evaluate(() => window.__game.stow.force(undefined));
  if (hd && c === 'warrior') {   // 运行时铸造外观换上后仍能收纳（lux_<key> 仍在 rig.root 里）
    const has = await page.evaluate(() => { let f = 0; window.__game.player.rig.root.traverse(o => { if (o.name.startsWith('lux_')) f++; }); return f; });
    ok(has > 0, `${T} lux 武器在角色树里（${has}）`);
  }
}
for (const R of RUNS) {
  for (const c of CLS) {
    for (let tryN = 1; ; tryN++) {   // 沙箱内存紧张时浏览器偶尔被 OOM 杀掉：整个职业重来（最多 3 次）
      const n0 = n, f0 = fail;
      try { await runClass(R, c); break; }
      catch (e) { if (tryN >= 3 || !/closed|crash/i.test(String(e))) throw e; console.log(`… ${R.tag}·${c} 浏览器被关闭（${String(e).split('\n')[0]}），重试 ${tryN + 1}`); n = n0; fail = f0; }
    }
  }
}
ok(errors.length === 0, `页面错误 ${errors.length}：${errors.slice(0, 3).join(' | ')}`);
await b.close();
console.log(`${fail ? 'FAIL' : 'PASS'} weapon_stow_e2e ${n - fail}/${n}`);
process.exit(fail ? 1 : 0);
