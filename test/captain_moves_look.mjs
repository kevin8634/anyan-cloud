// 11-06 团长瑟兰逐招 v1 接入实机：node test/captain_moves_look.mjs [html] [outdir]（Q=medium 环境变量）
//   ① 世界首领镜像骑士团刷出来，确认用的是绑骨件 + 自带 SC_* 片段（extras.hit 读到）
//   ② 直接走首领大脑的事件回调（onTelegraph / onCastStart / onSummon）触发每一招，确认播的是 SC_<id>、时长按出手对齐，推到出手帧截图
//   ③ 死亡：die 动作 = SC_death（1.5 秒），1.5 秒帧截图
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html'), OUT = process.argv[3] || '/workspace/work/shots/captain_moves';
mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 960, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(q => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); if (q) localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, process.env.Q || '');
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(4000);
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(true); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e8; g.ensureWild?.('dlc1_mirror'); g.goMap('dlc1_mirror'); }); await page.waitForTimeout(9000);
const sp = await page.evaluate(() => { const w = window.__dlc1.wb; w.setNext('dwb_knights', 0); w.tick(); w.tick(); const B = w.bosses.find(x => x.key === 'dwb_knights'); return B; });
await page.waitForTimeout(3000);
const st = await page.evaluate(B => { const g = window.__game; const e = [...g.enemies].find(x => x.alive && x.rig?.root?.userData?.eliteHd === 'LUX_E_MirrorCaptain');
  if (!e) return { found: false, names: [...g.enemies].filter(x => x.alive).slice(0, 8).map(x => x.type?.name) };
  window.__C = e; const A = e.rig.anim; const clips = ['SC_cleave', 'SC_lances', 'SC_blind', 'SC_squad', 'SC_oath', 'SC_death'].map(n => [n, A.clipInfo?.(n)]);
  // 首领站定、玩家站在它面前 6 米、镜头从斜前方看
  e.speed = 0; const P = e.pos; g.player.pos.set(P.x, P.y, P.z + 7); g.player.rig.root.visible = false;
  window.__P0 = { x: P.x, y: P.y, z: P.z }; e.rig.root.rotation.y = 0; window.__camOv = [P.x + 4.5, P.y + 3.2, P.z + 7.5, P.x, P.y + 1.8, P.z];
  return { found: true, clips, death: A.clipName('death') }; }, sp);
console.log('captain', JSON.stringify(st));
await page.waitForTimeout(+(process.env.WARM || 20000));   // 刷出时的光柱 / 登场过程走完再触发（第一招曾停在绑定姿势）
ok(st.found, '世界首领团长瑟兰用绑骨件 LUX_E_MirrorCaptain');
if (st.found) {
  ok(st.clips.every(([, i]) => i && i.hit > 0), '6 段 SC_* 都在且读到 extras.hit：' + st.clips.map(([n, i]) => `${n} ${i?.duration?.toFixed(2)}s hit ${i?.hit}`).join(' / '));
  ok(st.death === 'SC_death', '死亡动作 = SC_death');
  // [技能名, 触发方式, 预期片段, 预警 / 读条时长]
  const MV = [['镜刃横斩', 'tele', 'SC_cleave', 1.2], ['倒影长枪', 'tele4', 'SC_lances', 1.5], ['镜光致盲', 'cast', 'SC_blind', 2.0], ['列队', 'summon', 'SC_squad', 0], ['骑士誓言', 'cast', 'SC_oath', 3.0]];
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  for (const [name, how, clip, dur] of MV) {
    if (ONLY.length && !ONLY.includes(clip)) continue;
    const r = await page.evaluate(([name, how, dur]) => { const g = window.__game, e = window.__C, ev = e.brain.events, P = e.pos, P0 = window.__P0; window.__scLog = [];
      P.set(P0.x, P0.y, P0.z); e.rig.root.position.set(P0.x, P0.y, P0.z); e.rig.root.rotation.y = 0; g.player.pos.set(P0.x, P0.y, P0.z + 7); e.hp = e.maxHp; e.brain.provoke?.();
      window.__camOv = [P0.x + 4.5, P0.y + 3.2, P0.z + 7.5, P0.x, P0.y + 1.8, P0.z];
      e.rig.anim.revive(); e.rig.anim.loop('idle'); for (let i = 0; i < 6; i++) e.rig.anim.update(1 / 30);
      if (how === 'tele') ev.onTelegraph(9001, { x: P.x, z: P.z }, 5, dur, name);
      if (how === 'tele4') for (let i = 0; i < 4; i++) ev.onTelegraph(9010 + i, { x: P.x + (i - 1.5) * 3, z: P.z + 4 }, 3.2, dur, name);
      if (how === 'cast') ev.onCastStart(name, dur);
      if (how === 'summon') ev.onSummon(2, 'dwb_add_knight');
      const L = window.__scLog[window.__scLog.length - 1]; if (!L) return { log: window.__scLog };
      const tHit = L.hit / L.ts; for (let i = 0; i < Math.round(tHit * 30); i++) e.rig.anim.update(1 / 30);
      return { log: window.__scLog, tHit: +tHit.toFixed(2) }; }, [name, how, dur]);
    const L = r.log?.[r.log.length - 1];
    ok(L && L.clip === clip && r.log.length === 1 && (!dur || Math.abs(r.tHit - dur) < 0.05), `${name} → ${L?.clip ?? '无'}（播放 ${r.log?.length} 次），出手帧 ${r.tHit}s${dur ? ` = 预警/读条 ${dur}s` : ''}`);
    if (how === 'summon') { await page.waitForTimeout(1500); await page.evaluate(() => { const g = window.__game; for (let i = g.enemies.length - 1; i >= 0; i--) { const a = g.enemies[i]; if (a.wbAdd) { a.dispose(); g.enemies.splice(i, 1); } } }); }   // 召唤出的兵截图前清掉（沙箱渲染扛不住）
    await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/cap_${clip}_hit.png`, timeout: 180000 }).catch(x => console.log('shot', clip, x.message.slice(0, 100)));
    if (how === 'cast') await page.evaluate(name => window.__C.brain.events.onCastEnd(name, true), name);
    for (const id of [9001, 9010, 9011, 9012, 9013]) await page.evaluate(id => { try { window.__C.brain.events.onTelegraphResolve(id, false); } catch (e) {} }, id);
  }
  const dd = await page.evaluate(() => { const e = window.__C, P0 = window.__P0; e.pos.set(P0.x, P0.y, P0.z); e.rig.root.position.set(P0.x, P0.y, P0.z); e.rig.root.rotation.y = 0; const A = e.rig.anim; A.revive(); A.loop('idle'); A.play('death'); for (let i = 0; i < 45; i++) A.update(1 / 30); return A.clipName('death'); });
  await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/cap_SC_death_1p5.png`, timeout: 120000 }).catch(x => console.log('death shot', x.message.slice(0, 120)));
  ok(dd === 'SC_death', '死亡 1.5 秒帧（SC_death）');
  const w = await page.evaluate(() => { const r = []; window.__C.rig.root.traverse(o => { if (o.userData?.eliteWield) r.push(o.userData.eliteWield + '@' + o.parent?.parent?.name); }); return r; });
  ok(w.some(x => /hand_r/i.test(x)), '剑挂 hand_r：' + w.join(','));
}
ok(!errors.length, '页面错误 ' + errors.length + '：' + JSON.stringify(errors.slice(0, 3)));
console.log(`captain_moves_look ${pass}/${pass + fail}`);
await b.close(); process.exitCode = fail ? 1 : 0;
