// v1.2.69 专属鼠标指针 + 野外昼夜光照：node test/cur69_e2e.mjs [html] → shots_cur69/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), OUT = resolve(ROOT, 'shots_cur69'); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1366, height: 768 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); localStorage.setItem('darkrock_intro_seen', '1'); sessionStorage.setItem('__init', '1'); } });
page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 300000 });
await page.evaluate(() => window.__game.startGame('warrior')); await page.waitForTimeout(2500);
await page.evaluate(() => window.__game.tutFinish?.());
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };

// ---------- 1. 指针 ----------
const cd = await page.evaluate(() => window.__game.cursorDebug());
ok(cd.on && cd.styleLen > 2000 && /image-set|url/.test(cd.set), `指针已启用（画布 cursor：${cd.set}…）`);
// 指针图集（2x，深浅两种底）
await page.evaluate(async () => {
  const kinds = ['default', 'attack', 'talk', 'loot', 'interact', 'shop', 'disabled', 'aim'], names = ['默认', '攻击', '对话', '拾取', '交互', '商店/铸造', '不可用', '施法瞄准'];
  const st = getComputedStyle(document.documentElement); const d = document.createElement('div'); d.id = 'cur-sheet';
  d.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:grid;grid-template-columns:repeat(8,120px);background:#222;padding:10px;gap:0;font:12px sans-serif;color:#eee;text-align:center';
  for (const bg of ['#3a4a2a', '#d8d0bc']) kinds.forEach((k, i) => { const v = st.getPropertyValue('--cur-' + k); const m = [...v.matchAll(/url\("([^"]+)"\)/g)].map(x => x[1]); const src = m[1] ?? m[0];
    d.insertAdjacentHTML('beforeend', `<div style="background:${bg};padding:8px;border:1px solid #000"><img src="${src}" style="width:64px;height:64px;image-rendering:auto;outline:1px dashed rgba(255,0,0,.3)"><div style="color:${bg === '#d8d0bc' ? '#222' : '#eee'}">${names[i]}</div></div>`); });
  document.body.appendChild(d); await new Promise(r => setTimeout(r, 300)); });
await page.screenshot({ path: `${OUT}/cursor_sheet.png`, clip: await page.evaluate(() => { const r = document.getElementById('cur-sheet').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
await page.evaluate(() => document.getElementById('cur-sheet').remove());
const two = await page.evaluate(() => { const v = getComputedStyle(document.documentElement).getPropertyValue('--cur-attack'); return { two: /2x/.test(v), hot: /\) 3 3,|2x\) 3 3,/.test(v) }; });
ok(!two.two && /url\(/.test(cd.set), 'v1.2.70：统一 32px 单图 url（不用 image-set，避免部分浏览器退回系统白手）');
ok(two.hot, '攻击指针热点在剑尖 (3,3)');
// 场景悬停：敌人 / NPC
const scr = await page.evaluate(() => { const g = window.__game, cam = g.camera, out = {};
  const proj = (p, dy) => { const v = p.clone(); v.y += dy; v.project(cam); return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 ? { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight } : null; };
  const n = g.npcs.find(n => n.z === g.zone && proj(n.rig.root.position, 1.1)); if (n) out.npc = { id: n.id, role: n.role ?? '', ...proj(n.rig.root.position, 1.1) };
  return out; });
if (scr.npc) {
  await page.mouse.move(scr.npc.x - 30, scr.npc.y - 30); await page.mouse.move(scr.npc.x, scr.npc.y, { steps: 3 }); await page.waitForTimeout(150);
  const c = await page.evaluate(() => document.documentElement.dataset.cur);
  ok(c === 'talk' || c === 'shop', `悬停 NPC ${scr.npc.id}（${scr.npc.role || '普通'}）→ ${c}`);
} else ok(false, '屏幕上没找到 NPC');
// 把一只怪挪到镜头前测攻击
const ex = await page.evaluate(() => { const g = window.__game; const e = g.enemies.find(x => x.alive && x.z === g.zone && x.kind !== 'dummy') ?? g.enemies.find(x => x.alive && x.z === g.zone);
  if (!e) return null; const p = g.player.pos; e.pos.set(p.x + 2, p.y, p.z + 2); e.rig.root.position.copy(e.pos); e.brain.update = () => ({ type: 'idle' });
  const v = e.pos.clone(); v.y += e.rig.scale; v.project(g.camera); return { k: e.kind, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; });
if (ex) { const c = await page.evaluate(([x, y]) => window.__game.cursorAtXY(x, y), [ex.x, ex.y]); ok(c === 'attack', `悬停怪物 ${ex.k} → ${c}`); } else ok(false, '没有可测的怪');
const empty = await page.evaluate(() => { const g = window.__game; for (const [x, y] of [[683, 25], [40, 25], [1320, 25], [683, 740]]) { const c = g.cursorAtXY(x, y); if (c === 'default') return c; } return g.cursorAtXY(683, 25); }); ok(empty === 'default', `空地 → ${empty}`);
// 界面：按钮 = 交互，冷却技能 = 不可用
const ui = await page.evaluate(() => { const st = getComputedStyle(document.documentElement); const want = k => st.getPropertyValue('--cur-' + k).trim().slice(0, 60);
  const btn = document.getElementById('btn-map'); const sk = document.querySelector('#skillbar .skill:not(#sk-potion)'); sk.classList.add('oncd');
  const cb = getComputedStyle(btn).cursor.slice(0, 60), cs = getComputedStyle(sk).cursor.slice(0, 60); sk.classList.remove('oncd');
  return { btn: cb === want('interact'), sk: cs === want('disabled') }; });
ok(ui.btn, '界面按钮 → 交互指针'); ok(ui.sk, '冷却中的技能 → 不可用指针');

// ---------- 2. 昼夜光照 ----------
const dn = {}; for (const h of [0, 6, 12, 19, 23]) dn[h] = await page.evaluate(h => window.__game.dayNightDebug(h), h);
console.log('  ', JSON.stringify(dn));
ok(dn[12].on && dn[12].d === 1 && Math.abs(dn[12].sunI - dn[12].baseSunI) < 0.01, '正午：太阳光 = 区域原值');
ok(dn[0].d === 0 && dn[0].sunI < dn[12].sunI * 0.15 && dn[0].hemiI < dn[12].hemiI * 0.4, '深夜：太阳光 ≤ 15%、半球光 ≤ 40%');
ok(dn[6].w > 0.9 && dn[19].w > 0.9 && dn[6].d > 0 && dn[6].d < 1, '黎明 / 黄昏：暖色最强、亮度过渡');
await page.mouse.move(683, 700);
for (const h of [6, 12, 19, 23]) { await page.evaluate(h => { window.__game.setGameHour(h); window.__game.dayNightDebug(h); }, h); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/day_${String(h).padStart(2, '0')}.png` }); }
// 走表：设到 23 点后 tick 不会把光调回白天
await page.evaluate(() => window.__game.setGameHour(23)); await page.waitForTimeout(800);
const live = await page.evaluate(() => window.__game.dayNightDebug()); ok(live.d === 0, `走表：23 点保持夜间（d=${live.d}）`);
await page.evaluate(() => window.__game.setGameHour(12)); await page.waitForTimeout(800);

console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors'); ok(!errors.length, '无页面错误');
console.log(`cur69_e2e ${pass}/${pass + fail}`); await b.close(); process.exit(fail ? 1 : 0);
