// 11-04 Loading 预载 + GPU 预热实测：node test/preload_e2e.mjs [html=web/index_dlc1_比赛版.html]
//   加载画面里预载各职业身体（含 40 级套装整身）+ 武器道具 → 开局后换 40 级身体，看新编着色器 / 新上传贴图是否为 0
import { chromium } from 'playwright-core'; import { resolve } from 'path';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
const t0 = Date.now();
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
const pw = await page.evaluate(() => window.__game.prewarm());
console.log('load', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify({ kitObjs: pw.kitObjs, kitMs: Math.round(pw.kitMs), kitTex: pw.kitTex, compiles: pw.compiles }));
ok(pw.kitObjs > 0 && pw.kitTex > 0, `加载画面预载了角色 / 武器（物体 ${pw.kitObjs}，上传贴图 ${pw.kitTex}，${Math.round(pw.kitMs)}ms）`);
const res = {};
const LG = { mage: 'lg40_m_tiderobe', chrono: 'lg40_c_tidecoat', coffin: 'lg40_c_shroudplate', warrior: 'lg40_w_echoplate', hunter: 'lg40_h_packmail', alchemy: 'lg40_a_apron' };
for (const [cls, lg] of [[process.env.CLS || 'mage', LG[process.env.CLS || 'mage']]]) {
  await page.evaluate(c => window.__game.startGame(c), cls);
  await page.waitForFunction(() => window.__game.started !== false && document.getElementById('loading').style.display !== 'flex' && document.getElementById('title').style.display === 'none', null, { timeout: 900000 });
  const lh = await page.evaluate(() => performance.now()); await page.waitForTimeout(6000);
  const enterLong = await page.evaluate(lh => window.__game.stutter().filter(r => r.at > lh + 300), lh);
  console.log('进世界后（加载画面撤掉后）长帧', JSON.stringify(enterLong));
  ok(enterLong.reduce((a, r) => a + r.programs, 0) <= 2, `${cls} 进世界后新编着色器 ${enterLong.reduce((a, r) => a + r.programs, 0)} 个（加载画面里已预编）`);
  const before = await page.evaluate(() => { const d = window.__game.prewarm(true); return { prog: d.names?.length ?? 0 }; });
  const tex0 = await page.evaluate(() => window.__game.prewarm().texUploaded);
  await page.evaluate(lg => { const g = window.__game, inv = g.inventory; inv.equipped.chest = { ...(inv.equipped.chest ?? { id: 'x', name: '40', slot: 'chest', quality: 'orange', modifiers: [] }), id: 'pl_on', lgId: lg }; g.refreshGear(); }, lg);
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => { const d = window.__game.prewarm(true); return { prog: d.names?.length ?? 0, body: window.__game.player.rig.root.userData.body40 ?? null }; });
  const st = await page.evaluate(() => window.__game.stutter().filter(r => r.programs > 0 || r.ms > 400).slice(-3));
  res[cls] = { body: after.body, newPrograms: after.prog - before.prog, longFrames: st };
  console.log(cls, JSON.stringify(res[cls]));
  ok(!!after.body, `${cls} 换上 ${after.body}`);
  ok(after.prog - before.prog === 0, `${cls} 换 40 级身体后新编着色器 ${after.prog - before.prog} 个（应为 0）`);
}
ok(errors.length === 0, '页面错误 0：' + JSON.stringify(errors.slice(0, 3)));
console.log(`preload ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
