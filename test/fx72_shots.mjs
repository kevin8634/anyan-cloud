// v1.2.72 技能特效修复：前后对比截图（闪电链默认 / 闪电链·火链 / 奥术风暴·雷暴）
// 用法：node test/fx72_shots.mjs <html> <输出目录> [画质 high]   每个场景连拍几张，取电弧最亮的一张
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/tmp/fx72', Q = process.argv[4] || 'high';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const SCENES = [
  { id: 'chain', slot: 'skill1', rune: null, shots: [40, 90, 140, 200] },
  { id: 'chain_fire', slot: 'skill1', rune: 'r_chain_lightning_1', shots: [40, 90, 140, 200] },
  { id: 'storm_thunder', slot: 'ultimate', rune: 'r_arcane_storm_1', shots: [900, 1500, 2200, 3000] },
];
const ONLY = process.argv[5] ? process.argv[5].split(',') : null;
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(sc.id + ': ' + e.message));
  await page.addInitScript(q => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
  page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.startGame('mage'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__game.tutFinish?.(true));
  const info = await page.evaluate(({ rune }) => {
    const g = window.__game; g.progression.addXp(400000);
    const sb = g.skillBook; ['chain_lightning', 'arcane_storm'].forEach(id => { sb.learn(id); sb.mastery[id] = 2000; });
    const e1 = sb.setSkill('skill1', 'chain_lightning'), e2 = sb.setSkill('ultimate', 'arcane_storm');
    sb.setRune('chain_lightning', null); sb.setRune('arcane_storm', null); if (rune) sb.setRune(rune.replace(/^r_|_\d$/g, ''), rune); g.equipFromBook?.(); g.syncCharacter?.();
    document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; });
    return [e1, e2, g.player?.level].join('|');
  }, { rune: sc.rune });
  await page.waitForTimeout(3000);
  const closeAll = () => page.evaluate(() => { for (let k = 0; k < 3; k++) { [...document.querySelectorAll('button')].filter(x => x.offsetParent && /知道了|关闭|确定/.test(x.textContent)).forEach(x => x.click()); document.querySelectorAll('[data-close]').forEach(x => { if (x.offsetParent) x.click(); }); } });
  await closeAll(); await page.waitForTimeout(500); await closeAll();
  const setup = await page.evaluate(() => {
    const g = window.__game; g.player.maxHp = 1e6; g.player.hp = 1e6;
    const wolves = g.enemies.filter(e => e.kind === 'wolf' && e.alive && e.z === 'world').slice(0, 5);
    if (!wolves.length) return 'no wolves';
    const c = wolves[0].pos.clone(); g.player.pos.set(c.x - 7, 0, c.z);
    wolves.forEach((w, i) => { w.maxHp = w.hp = 1e7; w.pos.set(c.x + Math.cos(i * 1.3) * (i ? 2.6 : 0), 0, c.z + Math.sin(i * 1.3) * (i ? 2.6 : 0)); w.brain?.provoke?.(); });
    g.target = wolves[0]; g.player.rig.root.rotation.y = Math.PI / 2; g.camYawSet(-Math.PI / 2 + 0.45); g.camSet?.(12, 0.55);
    return 'ok ' + wolves.length;
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const g = window.__game; const w = g.enemies.filter(e => e.kind === 'wolf' && e.alive && e.z === 'world' && e.maxHp >= 1e7); const c = w[0].pos; w.forEach((e, i) => i && e.pos.set(c.x + Math.cos(i * 1.3) * 2.6, 0, c.z + Math.sin(i * 1.3) * 2.6)); g.player.pos.set(c.x - 7, 0, c.z); g.target = w[0]; });
  const st = await page.evaluate(s => { const g = window.__game; return [g.skillBook.skillAt(s).id, g.anyPanelOpen?.() ?? '?'].join(','); }, sc.slot); console.log('  slot', st);
  const t0 = Date.now();
  await page.evaluate(s => { const g = window.__game; g.loadout.resetCooldown?.(s); g.player.mp = g.player.maxMp ?? 999; g.tryCast(s); }, sc.slot);
  for (const [i, ms] of sc.shots.entries()) { const w = ms - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/${sc.id}_${i}.png`, timeout: 180000 }); }
  console.log(sc.id, info, setup);
  await page.close();
}
await b.close();
console.log(errors.length ? '错误：\n' + errors.slice(0, 5).join('\n') : '无页面错误');
