// v0.9.1m 套装 6 件冒烟测试：无头 Chromium 开局战士，穿 6 件狂怒战魂（套装），对训练假人放技能，检查战魂 / 冲锋重置 / 6 件分支
// 运行：LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu node test/setfx-check.mjs
import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + process.cwd() + '/web/index.html');
await p.waitForFunction(() => window.__game && document.getElementById('start')?.textContent === '开始冒险', null, { timeout: 60000 });
await p.evaluate(() => { document.getElementById('class-pick').children[0].click(); document.getElementById('start').click(); });
await p.waitForTimeout(3000);
const r = await p.evaluate(async () => {
  const g = window.__game, out = {};
  g.tutFinish?.();
  const set = ['i_helm', 'i_fury_pauldron', 'i_chest', 'i_fury_gauntlet', 'i_fury_bracer', 'i_fury_legs'];
  for (const id of set) { const it = g.gen.generateFixed(id, 30); g.inventory.add(it); g.inventory.equip(it.id); }
  g.syncCharacter();
  out.count = g.inventory.setCounts().get('set_fury');
  out.spec0 = g.setfx().spec.fury;
  const d = g.dummy; out.dummy = !!d;
  if (d) { g.player.pos.set(d.pos.x + 1.2, g.player.pos.y, d.pos.z); g.target = d; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitT = async sec => { const t0 = g.T; for (let i = 0; i < 3000 && g.T < t0 + sec; i++) await wait(100); };
  for (let k = 0; k < 6; k++) { g.tryCast('basic'); await waitT(0.9); }
  await waitT(2);
  out.soulAfterBasics = g.setfx().soul; out.dummyHp = d?.hp; out.dummyMax = d?.maxHp; out.dots = d?.status.dots().map(x => x.key + ':' + x.ticksLeft); out.started = g.started; out.cd = g.loadout.cooldownLeft('basic', g.T); out.dist = d ? Math.hypot(d.pos.x - g.player.pos.x, d.pos.z - g.player.pos.z) : -1; out.T = g.T;
  g.tryCast('skill2'); await waitT(0.6);
  out.soulAfterWhirl = g.setfx().soul; out.spent = g.setfx().stats.soulSpent;
  out.whirlName = g.loadout.preview('skill2', g.ctx ? g.ctx() : { now: 0, casterHpPercent: 1, targetEffects: [] })?.displayName;
  return out;
});
console.log(JSON.stringify(r));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await b.close();
