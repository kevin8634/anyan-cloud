// v1.0.9 职业专属音效检查：逐个技能（技能书全部可选技能）释放，统计本体默认音效 vs 职业合成音
// 用法：node dev/sfxcheck.mjs <职业id> [html] [形态]
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const CLS = process.argv[2] || 'hunter', HTML = process.argv[3] || 'web/index_dlc1.html', FORM = process.argv[4] || '';
const waitT0 = () => page.waitForFunction(() => window.__game.T > 0.5, null, { timeout: 120000, polling: 200 });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 480, height: 300 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto('file://' + resolve(HTML));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.evaluate(c => window.__game.startGame(c), CLS);
await page.waitForTimeout(2500); await waitT0();
await page.evaluate(f => {
  const g = window.__game; g.audio.unlock(); g.progression.level = 30;
  const w = g.enemies.filter(e => e.alive && !e.isDummy).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  window.__tg = w; if (w) { w.maxHp = w.hp = 1e7; }
  if (f) window.__dlc1.hunter.setForm(f);
  const log = window.__snd = [];
  for (const m of ['swing', 'whirl', 'thunder', 'charge', 'ultimate', 'projectile', 'castBolt', 'element', 'meteor', 'frostNova', 'extTone', 'extNoise']) {
    const o = g.audio[m].bind(g.audio); g.audio[m] = (...a) => { log.push(m); return o(...a); };
  }
}, FORM);
/** 按游戏时间等（软件渲染很慢，墙钟时间不可靠） */
const waitT = async sec => { const t0 = await page.evaluate(() => window.__game.T); await page.waitForFunction(t => window.__game.T >= t, t0 + sec, { timeout: 120000, polling: 100 }); };
const slots = ['basic', 'skill1', 'skill2', 'skill3', 'skill4', 'ultimate'];
const rows = [];
for (const slot of slots) {
  const ids = await page.evaluate(s => { const g = window.__game; return s === 'basic' ? [g.loadout.slots?.get?.('basic')?.id ?? null] : g.skillBook.options(s).map(x => x.id); }, slot);
  for (const id of ids) {
    const r = await page.evaluate(([s, id]) => {
      const g = window.__game, w = window.__tg;
      if (id && s !== 'basic') g.loadout.equipSkill(g.skillBook.options(s).find(x => x.id === id), s);
      if (w) { w.hp = w.maxHp; g.target = w; g.player.pos.set(w.pos.x - 2.2, 0, w.pos.z); }
      g.player.hp = g.player.maxHp ?? g.player.hp; if (g.player.status) { g.player.status.stunUntil = 0; }
      window.__snd.length = 0; g.loadout.resetCooldown(s); g.tryCast(s);
      return window.__snd.length ? null : JSON.stringify({ open: [...document.querySelectorAll('div')].filter(d => d.id && d.style.display === 'flex').map(d => d.id).slice(0, 8), tg: g.target ? [g.target.alive, +g.target.pos.distanceTo(g.player.pos).toFixed(1), g.target.z, g.zone] : null, cd: g.loadout.cooldownLeft(s, 1e9), pre: g.loadout.slots.get(s)?.id, alive: g.player.alive, stun: g.player.status?.isStunned, dbg: (window.__dlc1.coffin?.debug?.() ?? null) }).slice(0, 160);
    }, [slot, id]);
    await waitT(1.0);   // 冲锋 / 落棺落地后的声音
    const log = await page.evaluate(() => window.__snd.slice());
    const def = log.filter(x => x !== 'extTone' && x !== 'extNoise');
    if (r) { console.log(id, r); if (process.env.SHOT) await page.screenshot({ path: '/tmp/sfx_' + id + '.png' }); }
    rows.push({ slot, id: id ?? '(basic)', synth: log.length - def.length, base: [...new Set(def)].join(',') || '-' });
  }
}
// 开棺（负棺人）：每种魂各开一次
if (CLS === 'coffin') {
  for (const souls of [['beast', 'beast', 'beast'], ['man', 'man', 'man'], ['giant', 'man', 'eldritch'], ['eldritch', 'eldritch', 'beast']]) {
    const ok = await page.evaluate(sv => { const D = window.__dlc1.coffin; window.__snd.length = 0; try { D.debugSouls?.(sv); D.openCoffin?.(); return true; } catch (e) { return String(e); } }, souls);
    await waitT(1.2);
    const log = await page.evaluate(() => window.__snd.slice());
    const def = log.filter(x => x !== 'extTone' && x !== 'extNoise');
    rows.push({ slot: 'open', id: souls.join('+') + (ok === true ? '' : ' ' + ok), synth: log.length - def.length, base: [...new Set(def)].join(',') || '-' });
  }
}
console.table(rows);
console.log('errors', errors.slice(0, 5));
await b.close();
