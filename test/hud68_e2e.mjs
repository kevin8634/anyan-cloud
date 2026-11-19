// v1.2.68 HUD：小地图时间条 / BUFF·DEBUFF 显示区 / 任务日志区域标注 / 怪物悬停任务进度
// node test/hud68_e2e.mjs [html]   → 截图 shots_hud68/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), OUT = resolve(ROOT, 'shots_hud68'); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };

// ---------- 1. 时间条 ----------
let ck = await page.evaluate(() => window.__game.hudClockDebug());
ok(ck.shown && /^\d\d:\d\d$/.test(ck.text), `时间条显示：第 ${ck.day} 日 ${ck.text}（${ck.phase}）`);
await page.evaluate(() => window.__game.setGameHour(21.5)); ck = await page.evaluate(() => window.__game.hudClockDebug());
ok(ck.phase === 'night' && ck.text === '21:30' && Math.abs(parseFloat(ck.marker) - 89.58) < 0.2, `设到 21:30 → 夜，进度标记 ${ck.marker}`);
await page.evaluate(() => window.__game.setGameHour(12)); ck = await page.evaluate(() => window.__game.hudClockDebug());
ok(ck.phase === 'day' && ck.text === '12:00', '设到 12:00 → 白昼');
await page.waitForTimeout(2100); const ck2 = await page.evaluate(() => window.__game.hudClockDebug());
ok(ck2.m >= 1 && ck2.h === 12, `时钟在走：2 秒后 ${ck2.text}`);

// ---------- 2. BUFF / DEBUFF ----------
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.player.maxHp = 1e7; g.player.hp = 1e7;
  g.player.status.add({ key: 'tslow', kind: 'slow', remaining: 12, percent: 0.3, source: null });
  g.player.status.add({ key: 'tstun', kind: 'stun', remaining: 0.01, source: null });
  g.player.status.addShield('tsh', 800, 20, 800, null);
  g.player.status.add({ key: 'tref', kind: 'reflect', remaining: 15, percent: 0.2, source: null });
  g.player.status.add({ key: 'dot1', kind: 'dot', element: 'fire', dps: 50, remaining: 8, source: {} });
  g.hudDemo(true); g.buffDemo(true); });
await page.waitForFunction(() => document.querySelectorAll('#pf-buffs .bh').length >= 3 && document.querySelectorAll('#bf-buffs .bh').length >= 5, null, { timeout: 15000 }).catch(async () => console.log('  （等待图标超时）', await page.evaluate(() => [document.getElementById('pf-buffs').innerHTML.length, document.getElementById('boss-frame').style.display, window.__game.player.alive, window.__game.player.status.view().length].join(','))));
await page.waitForTimeout(300);
const bd = await page.evaluate(() => window.__game.buffHudDebug());
ok(bd.player.filter(x => !x.debuff).every(x => x.row === 'b') && bd.player.filter(x => x.debuff).every(x => x.row === 'd') && bd.player.some(x => x.debuff) && bd.player.some(x => !x.debuff), `玩家增益 / 减益分两行：${JSON.stringify(bd.player)}`);
ok(bd.boss.length === 5 && bd.boss.filter(x => x.row === 'd').length === 3, `首领增益 2 / 减益 3：${JSON.stringify(bd.boss)}`);
const tipTxt = await page.evaluate(() => window.__game.buffTipDebug('pf-buffs', 'slow'));
ok(/减速/.test(tipTxt) && /减益/.test(tipTxt) && /剩余/.test(tipTxt), `悬停浮窗：${tipTxt}`);
// 真实悬停
await page.waitForTimeout(400); const box = await page.evaluate(() => { const r = document.querySelector('#pf-buffs .bh').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
console.log('  hit', await page.evaluate(b => { const e = document.elementFromPoint(b.x, b.y); return e ? (e.id || e.className) + ' < ' + (e.parentElement?.id || e.parentElement?.className) : 'none'; }, box));
await page.mouse.move(box.x - 3, box.y - 3); await page.mouse.move(box.x, box.y, { steps: 3 }); await page.waitForTimeout(200);
const tipVis = await page.evaluate(() => { const t = document.getElementById('bh-tip'); return t && getComputedStyle(t).display !== 'none' ? t.textContent : ''; });
ok(tipVis.length > 3, `鼠标悬停显示浮窗：${tipVis}`);
await page.mouse.move(960, 600);

// ---------- 3. 任务日志区域 ----------
const qa = await page.evaluate(() => { const g = window.__game; const all = g.questZoneAudit(); return { n: all.length, none: all.filter(x => !x.zones.length).map(x => x.id + ' ' + x.name) }; });
ok(qa.none.length === 0, `全部 ${qa.n} 个任务都能标出区域${qa.none.length ? '；缺：' + qa.none.join('，') : ''}`);
const ql = await page.evaluate(() => { const g = window.__game; g.progression.level = 30;
  const ids = ['ch6_2', g.quests.defs.find(q => q.objectives.some(o => o.target === 'boar'))?.id, g.quests.defs.find(q => q.objectives.some(o => o.target === 'wolf'))?.id].filter(Boolean);
  for (const id of ids) { const q = g.quests.defs.find(x => x.id === id); g.quests.progress.set(id, q.objectives.map(() => 0)); }
  g.togglePanel('quests', true); g.renderQuestLog();
  return { ids, map: g.currentMap(), rows: [...document.querySelectorAll('#quest-body .qrow')].map(r => ({ id: r.dataset.qid, z: r.querySelector('.qzone')?.textContent, here: r.classList.contains('qhere') })) }; });
console.log('  当前地图', ql.map, JSON.stringify(ql.rows));
ok(ql.rows.length >= 3 && ql.rows.every(r => r.z && r.z.length > 1), '每个任务都有绿色区域小字');
ok(ql.rows.find(r => r.id === 'ch6_2')?.z.includes('副本'), 'ch6_2 标注副本名');
const firstNotHere = ql.rows.findIndex(r => !r.here), lastHere = ql.rows.map(r => r.here).lastIndexOf(true);
ok(lastHere < 0 || firstNotHere < 0 || lastHere < firstNotHere, '当前区域的任务排在最前');
const zc = await page.evaluate(() => getComputedStyle(document.querySelector('#quest-body .qzone')).color);
ok(/rgb\((\d+), (\d+), (\d+)\)/.test(zc) && (([, r, g, bb]) => +g > +r && +g > +bb)(zc.match(/rgb\((\d+), (\d+), (\d+)\)/)), `区域字是绿色 ${zc}`);
await page.screenshot({ path: `${OUT}/questlog.png`, clip: await page.evaluate(() => { const r = document.getElementById('quests').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, innerHeight - r.y) }; }) });
await page.evaluate(() => window.__game.togglePanel('quests', false));

// ---------- 4. 怪物悬停任务进度 ----------
const mt = await page.evaluate(() => { const g = window.__game; const k = g.enemies.find(e => e.alive && ['wolf', 'boar'].includes(e.kind))?.kind; return k ? { k, h: g.mobTipDebug(k) } : null; });
ok(!!mt && /mt-q/.test(mt.h) && /\d+\s*\/\s*\d+/.test(mt.h), `悬停 ${mt?.k}：提示含任务名与进度`);
const mt2 = await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.alive && !['wolf', 'boar', 'goldboar', 'dummy'].includes(x.kind)); return e ? g.mobTipDebug(e.kind) : ''; });
ok(!/mt-q/.test(mt2 ?? ''), '无关怪物不显示任务行');

// ---------- 5. 多分辨率：HUD 组件互不重叠 ----------
let bad = 0;
for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720]]) {
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const ids = ['player-frame', 'pf-buffs', 'boss-frame', 'bf-buffs', 'minimap', 'mm-clock', 'quest-tracker', 'skillbar', 'topbtns', 'target-frame', 'xpbar', 'notice', 'castbar'];
    const R = {}; for (const id of ids) { const e = document.getElementById(id); if (!e || getComputedStyle(e).display === 'none') continue; const b = e.getBoundingClientRect(); if (b.width && b.height) R[id] = b; }
    const same = new Set(['player-frame|pf-buffs', 'boss-frame|bf-buffs', 'minimap|mm-clock', 'boss-frame|castbar', 'bf-buffs|castbar']);
    const ov = []; const k = Object.keys(R);
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (same.has(`${k[i]}|${k[j]}`) || same.has(`${k[j]}|${k[i]}`)) continue; const a = R[k[i]], c = R[k[j]];
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) ov.push(`${k[i]}×${k[j]}`); }
    const off = k.filter(id => R[id].right > innerWidth + 1 || R[id].bottom > innerHeight + 1 || R[id].left < -1 || R[id].top < -1);
    return { ov, off, shown: k };
  });
  console.log(`  ${w}x${h}`, JSON.stringify(r)); if (r.ov.length || r.off.length) bad++;
  ok(!r.ov.length && !r.off.length, `${w}x${h} HUD 无重叠、无越界`);
  await page.screenshot({ path: `${OUT}/hud_${w}x${h}.png` });
}
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors'); ok(!errors.length, '无页面错误');
console.log(`hud68_e2e ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
