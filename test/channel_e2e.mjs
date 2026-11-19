// v1.2.56 剑刃风暴（6 秒引导：可移动、免控、不能翻滚 / 放技能、每 0.5 秒伤害、结束爆发）+ 暴风雪（瞬发、不规则冰面 + 冰刺、无圆圈）
// node test/channel_e2e.mjs [html]   截图 → /workspace/work/anyan/shots_channel/
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index.html'), OUT = resolve(ROOT, 'shots_channel'); mkdirSync(OUT, { recursive: true });
let fail = 0, n = 0; const ok = (c, m) => { n++; console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const errors = [];
async function boot(cls) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await b.newPage({ viewport: { width: 800, height: 540 } }); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: 'low' })); sessionStorage.setItem('__init', '1'); } });
  page.setDefaultNavigationTimeout(180000); await page.goto('file://' + HTML);
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
  await page.evaluate(c => window.__game.startGame(c), cls); await page.waitForTimeout(2000);
  await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); });
  return { b, page };
}
async function equip(page, slot, id) {
  return page.evaluate(([slot, id]) => { const g = window.__game; g.loadout.equipSkill(g.cls.skills[id], slot); g.loadout.resetCooldown(slot);
    return g.loadout.preview(slot, { now: g.T, casterHpPercent: 1, targetEffects: [] })?.baseId; }, [slot, id]);
}
async function mobsAround(page, k = 4) {
  return page.evaluate(k => { const g = window.__game; g.enterField(); return true; }, k);
}
// ---------- 战士：剑刃风暴
{
  const { b, page } = await boot('warrior');
  ok(await equip(page, 'ultimate', 'bladestorm') === 'bladestorm', '大招换成剑刃风暴');
  await mobsAround(page); await page.waitForTimeout(1500);
  const r0 = await page.evaluate(() => { const g = window.__game; const es = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos)); const e = es[0]; if (!e) return null;
    for (const x of es.slice(0, 4)) { x.maxHp = x.hp = 1e7; x.pos.set(e.pos.x + (Math.random() - 0.5) * 3, x.pos.y, e.pos.z + (Math.random() - 0.5) * 3); }
    g.player.pos.set(e.pos.x + 1, e.pos.y, e.pos.z); g.player.hp = g.player.maxHp = 1e7; g.target = e; g.loadout.resetCooldown('ultimate'); return { hp: e.hp, cc: g.player.ccImmune }; });
  ok(!!r0, '原野里有怪（已调成不死、围在身边）');
  const t0 = await page.evaluate(() => { const g = window.__game; g.tryCast('ultimate'); return g.T; });
  await page.waitForTimeout(800);
  const c1 = await page.evaluate(() => window.__game.channelInfo());
  ok(c1.active && c1.cc, `开始引导：引导中 ${c1.active}，免控 ${c1.cc}`);
  await page.screenshot({ path: OUT + '/1_bladestorm_channel.png' });
  ok(await page.evaluate(() => window.__game.tryDodge() === false), '引导中不能翻滚');
  const p0 = await page.evaluate(() => { const p = window.__game.player.pos; return [p.x, p.z]; });
  await page.keyboard.down('d'); await page.waitForTimeout(1200); await page.keyboard.up('d');
  const p1 = await page.evaluate(() => { const p = window.__game.player.pos; return [p.x, p.z]; });
  const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  ok(moved > 0.5 && (await page.evaluate(() => window.__game.channelInfo().active)), `引导中可以移动（${moved.toFixed(2)} 米），且没有被打断`);
  const hpMid = await page.evaluate(() => window.__game.target?.hp);
  ok(hpMid < r0.hp, `引导期间持续伤害（目标掉血 ${Math.round(r0.hp - hpMid)}）`);
  await page.waitForFunction(() => !window.__game.channelInfo().active, null, { timeout: 180000, polling: 300 });
  const t1 = await page.evaluate(() => window.__game.T);
  ok(t1 - t0 >= 5.8 && t1 - t0 < 8, `引导约 6 秒后结束（游戏时间 ${(t1 - t0).toFixed(1)} 秒）`);
  const c2 = await page.evaluate(() => window.__game.channelInfo());
  ok(!c2.active && c2.cc === r0.cc, '结束后免控还原');
  await page.waitForTimeout(150); await page.screenshot({ path: OUT + '/2_bladestorm_end.png' });
  await b.close();
}
// ---------- 法师：暴风雪
{
  const { b, page } = await boot('mage');
  ok(await equip(page, 'skill2', 'blizzard') === 'blizzard', '技能 2 = 暴风雪');
  await mobsAround(page); await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__game; const e = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
    e.maxHp = e.hp = 1e7; g.player.pos.set(e.pos.x + 6, e.pos.y, e.pos.z); g.player.hp = g.player.maxHp = 1e7; g.target = e; g.loadout.resetCooldown('skill2'); });
  const pre = await page.evaluate(() => window.__game.loadout.preview('skill2', { now: window.__game.T, casterHpPercent: 1, targetEffects: [] })?.baseId);
  const cnt = () => page.evaluate(() => { let rings = 0, ice = 0, spikes = 0; window.__game.scene.traverse(o => { const g = o.geometry; if (!g) return; const t = g.type; if (t === 'RingGeometry') rings++; if (t === 'ShapeGeometry') ice++; if (t === 'ConeGeometry' && o.material?.flatShading) spikes++; }); return { rings, ice, spikes }; });
  const before = await cnt();
  const tCast = await page.evaluate(() => { const g = window.__game; const t = g.T; g.tryCast('skill2'); return t; });
  await page.waitForTimeout(700);
  const after = await cnt();
  ok(pre === 'blizzard', `技能 2 是暴风雪（${pre}）`);
  ok(after.ice - before.ice >= 2, `冻出不规则冰面（新增冰面 ${after.ice - before.ice} 层）`);
  ok(after.spikes - before.spikes >= 8, `刺出冰刺 ${after.spikes - before.spikes} 根`);
  ok(after.rings <= before.rings, `没有圆圈（圆环 ${before.rings} → ${after.rings}）`);
  const hp = await page.evaluate(() => window.__game.target?.hp);
  ok(hp < 1e7, `瞬发即命中（目标掉血 ${Math.round(1e7 - hp)}）`);
  await page.screenshot({ path: OUT + '/3_blizzard.png' });
  await b.close();
}
ok(errors.length === 0, `页面错误 ${errors.length}：${errors.slice(0, 2).join(' | ')}`);
console.log(fail ? `✗ channel_e2e ${n - fail}/${n}` : `✓ channel_e2e ${n}/${n}`); process.exitCode = fail ? 1 : 0;
