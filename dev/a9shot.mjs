// raidA A9 首领逐招动作 + 技能特效 实机验收：node dev/a9shot.mjs [html] [outDir] [boss1,boss2…] [quality]
// 比赛版 DLC（node build-web.mjs --assets=aholo --dlc=dlc1），swiftshader。进潮渊钟井，依次到 5 位首领：首领钉在出生点、玩家站在正南（镜头从南往北），
// 对每一招调 rig.anim.demo(key)（强制出招，期间不读首领大脑），连拍到收招结束。swiftshader 约 1 FPS、本体每帧 dt 封顶 0.05 秒 → 每张 = 0.05 秒游戏时间（天然慢放），
// 帧存 <out>/<boss>/<key>/f###.jpg；状态（片段名 / 片段时间 / 出手记录 / 构建方式 / 页面错误）写 <out>/a9_log.json。之后 python3 dev/a9gif.py 合成 GIF。
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync, writeFileSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = resolve(ROOT, process.argv[3] || 'shots_a9');
const WANT = (process.argv[4] || 'gordon,sarin,virg,ferry,morvis').split(','), QUAL = process.argv[5] || 'high';
const PLAN = {
  gordon: { model: 'wl_gordon', keys: ['melee', 'sweep', 'hook', 'blood', 'hooks', 'phase', 'stagger'] },
  sarin: { model: 'wl_sarin', keys: ['melee', 'fog', 'shriek', 'mark', 'souls', 'phase', 'stagger'] },
  virg: { model: 'wl_virg', keys: ['melee', 'crack', 'oath', 'spike', 'bash', 'guard', 'phase', 'stagger'] },
  ferry: { model: 'wl_ferry_death', keys: ['melee', 'oar', 'death', 'life', 'ferry', 'phase', 'stagger'], life: ['melee', 'mend', 'stagger'] },
  morvis: { model: 'wl_morvis', keys: ['melee', 'bite', 'surge', 'lure', 'drool', 'eels', 'flood', 'phase', 'stagger'] },
};
// 只补拍部分招式：A9KEYS='sarin=shriek+phase,virg=oath+phase,ferry_life=mend'（没列出的首领 / 生渡不拍）
const KF = process.env.A9KEYS ? Object.fromEntries(process.env.A9KEYS.split(',').map(x => { const [b, k] = x.split('='); return [b, k ? k.split('+') : []]; })) : null;
const kf = (id, ks) => KF ? ks.filter(k => (KF[id] || []).includes(k)) : ks;
const ORDER = ['gordon', 'sarin', 'virg', 'ferry', 'morvis'];
const STEP = +(process.env.STEP || 2), MAXF = +(process.env.MAXF || 46);
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 800, height: 500 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
await page.addInitScript(q => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } }, QUAL);
page.setDefaultNavigationTimeout(600000); page.setDefaultTimeout(600000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
const log = { t0: new Date().toISOString(), quality: QUAL, bosses: {} };
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.packDungeon.enter('dlc1_well_dg', 'normal'); });
await page.waitForTimeout(18000);
await page.evaluate(() => { const g = window.__game; for (const e of g.packDungeon.units().trash) if (e.alive) g.fx.dealDamage(e, e.maxHp * 3, 'physical', g.player); });
// 11-04：摆渡双子在 49% 门槛才让生渡上岸、击倒生渡后死渡才解除无敌——都要等游戏帧推进，一次 evaluate 里连打打不死 → 分轮打、每轮等 1.5 秒
// 11-04 A9 收尾：原来 8 轮 × 1.5 秒在 swiftshader（约 1 FPS、每帧 0.05 秒游戏时间）下不够摆渡双子走完生渡上岸 → 死渡解除无敌，静默放弃后下一位「莫尔维斯」实际拍的还是摆渡死渡（日志里的 oar / s_death 片段即由此而来）。改为最多 60 轮 × 3 秒，打不死就报错退出
const killBoss = async () => { for (let r = 0; r < 60; r++) { const dead = await page.evaluate(() => { const g = window.__game, U = g.packDungeon.units(), B = U.boss; g.player.maxHp = 1e12; g.player.hp = 1e12; U.cores?.forEach(c => c.alive && g.fx.dealDamage(c, c.maxHp * 9, 'physical', g.player)); if (B?.alive) g.fx.dealDamage(B, B.maxHp, 'physical', g.player); return !B?.alive && !(U.cores || []).some(c => c.alive); }); if (dead) return; await page.waitForTimeout(3000); } throw new Error('killBoss: 首领打不死'); };
// 等下一位首领真正刷出来（构建记录里出现它的模型 id），否则拍到的是上一位
const waitBoss = async (model) => { for (let r = 0; r < 120; r++) { const ok = await page.evaluate(m => { const B = window.__game.packDungeon.units().boss; return !!(B?.alive && window.__dlc1.well.rig().built[m]); }, model); if (ok) return; await page.waitForTimeout(3000); } throw new Error('waitBoss: 等不到 ' + model); };
// 首领钉住 + 玩家在正南 d 米（d 按首领身高）
const pinner = async (unitSel) => {
  const bp = await page.evaluate(sel => { const U = window.__game.packDungeon.units(), B = sel === 'core' ? U.cores[0] : U.boss; const h = B.rig?.anim?.handle?.height ?? 5; return { x: B.pos.x, z: B.pos.z, h }; }, unitSel);
  // 镜头：玩家站在首领右前方（离得近，镜头跟玩家），镜头压低、拉远到 2.3 倍身高，从首领正前偏右看过去；隐藏 HUD（保留首领警报条）
  const h = bp.h;
  return () => page.evaluate(([x, z, h, sel]) => { const g = window.__game, U = g.packDungeon.units(), B = sel === 'core' ? U.cores[0] : U.boss; if (!B) return; g.player.maxHp = 1e12; g.player.hp = 1e12; B.pos.x = x; B.pos.z = z;
    g.player.pos.set(x + h * 0.75, g.player.pos.y, z + h * 0.55); g.camSet?.(h * 2.3, 0.2); g.camYawSet?.(0.5);
    for (const e of document.querySelectorAll('body > *')) { if (e.tagName === 'CANVAS' || e.querySelector?.('canvas') || e.id === 'wl_raidwarn') continue; e.style.visibility = 'hidden'; } }, [bp.x, bp.z, h, unitSel]);
};
async function shootKeys(boss, keys, sel, tag) {
  const pin = await pinner(sel); await pin(); await page.waitForTimeout(2500); await pin();
  const dir = `${OUT}/${tag}`; mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/idle.jpg`, quality: 80 });
  const info = await page.evaluate(sel => { const U = window.__game.packDungeon.units(), B = sel === 'core' ? U.cores[0] : U.boss; return { state: B.rig?.anim?.state?.(), built: window.__dlc1.well.rig().built }; }, sel);
  log.bosses[tag] = { built: info.built, clips: info.state?.clips ?? null, keys: {} };
  say(tag, JSON.stringify(info.state?.clips ?? 'proc'), JSON.stringify(Object.fromEntries(Object.entries(info.built).map(([k, v]) => [k, v.mode]))));
  for (const key of keys) {
    const kd = `${dir}/${key}`; mkdirSync(kd, { recursive: true });
    await pin(); await page.evaluate(([sel, key]) => { const U = window.__game.packDungeon.units(), B = sel === 'core' ? U.cores[0] : U.boss; B.rig.anim.demo(key); }, [sel, key]);
    const rec = []; let f = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const st = await page.evaluate(sel => { const U = window.__game.packDungeon.units(), B = sel === 'core' ? U.cores[0] : U.boss; const s = B.rig.anim.state(); return { act: s.act, key: s.key, clip: s.clip, hold: B.rig.anim.demoHold, log: B.rig.anim.log.slice(-1)[0] ?? null }; }, sel);
      if (i % STEP === 0 && n < MAXF) { await page.screenshot({ path: `${kd}/f${String(n).padStart(3, '0')}.jpg`, quality: 72 }); n++; rec.push(st); }
      if (i > 2 && !(st.hold > 0)) break;
      if (i % 3 === 0) await pin();
      f++;
    }
    log.bosses[tag].keys[key] = { frames: n, ticks: f, states: rec };
    say(tag, key, 'frames', n, 'clip', rec.map(r => r.clip?.name).filter((v, i, a) => v && a.indexOf(v) === i).join('>'));
  }
}
for (const boss of ORDER) {
  if (!WANT.includes(boss)) { await waitBoss(PLAN[boss].model); say('skip', boss); await killBoss(); await page.waitForTimeout(2500); await page.evaluate(() => { const g = window.__game; if (g.dgxDebug()?.pick) g.dgxPick(0); }); await page.waitForTimeout(1500); continue; }
  const P = PLAN[boss]; await waitBoss(P.model); say('boss ready', boss, P.model);
  if (kf(boss, P.keys).length) await shootKeys(boss, kf(boss, P.keys), 'boss', boss);
  if (P.life && kf('ferry_life', P.life).length) {   // 摆渡：打到 49% 让生渡上岸，再拍生渡
    await page.evaluate(() => { const g = window.__game, B = g.packDungeon.units().boss; window.__dlc1.well.twins.mendNow(99); g.fx.dealDamage(B, B.hp - B.maxHp * 0.49, 'physical', g.player); });
    await page.waitForTimeout(4000);
    const has = await page.evaluate(() => !!window.__game.packDungeon.units().cores?.[0]);
    if (has) await shootKeys(boss, kf('ferry_life', P.life), 'core', 'ferry_life');
  }
  writeFileSync(`${OUT}/a9_log.json`, JSON.stringify({ ...log, errors }, null, 1));
  if (boss !== ORDER.at(-1)) { await killBoss(); await page.waitForTimeout(2500); await page.evaluate(() => { const g = window.__game; if (g.dgxDebug()?.pick) g.dgxPick(0); }); await page.waitForTimeout(1500); }
}
log.errors = errors; writeFileSync(`${OUT}/a9_log.json`, JSON.stringify(log, null, 1));
say('done errors', errors.length, errors.slice(0, 3).join(' | '));
await b.close();
