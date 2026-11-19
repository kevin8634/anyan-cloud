// v1.2.73 剑刃风暴 v2 接入：截图（默认流血 / 刃海 +30% 范围 / 烈风换自然元素）
// 用法：node test/fx73_blade.mjs <html> <输出目录> [画质 high] [场景,逗号分隔]
import { chromium } from 'playwright-core'; import { resolve } from 'path'; import { mkdirSync } from 'fs';
const HTML = resolve(process.argv[2] || 'web/index.html'), OUT = process.argv[3] || '/tmp/fx73_blade', Q = process.argv[4] || 'high';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const SCENES = [
  { id: 'bs', slot: 'ultimate', rune: null, shots: [1500, 4000, 6400] },
  { id: 'bs_big', slot: 'ultimate', rune: 'r_bladestorm_2', shots: [2500] },
  { id: 'bs_nature', slot: 'ultimate', rune: 'r_bladestorm_1', shots: [2500] },
];
const ONLY = process.argv[5] ? process.argv[5].split(',') : null;
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(sc.id + ': ' + e.message));
  await page.addInitScript(q => { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
  page.setDefaultNavigationTimeout(240000); await page.goto('file://' + HTML);
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__game; g.startGame('warrior'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__game.tutFinish?.(true));
  const info = await page.evaluate(({ rune, bolt }) => {
    const g = window.__game; g.progression.addXp(400000);
    const sb = g.skillBook; ['bladestorm'].forEach(id => { sb.learn(id); sb.mastery[id] = 2000; });
    const e1 = sb.setSkill('ultimate', 'bladestorm'), e2 = '';
    sb.setRune('bladestorm', null); if (rune) sb.setRune('bladestorm', rune); g.equipFromBook?.(); g.syncCharacter?.();
    if (bolt) { const L = g.loadout, orig = L.setComboModifiers.bind(L); const add = m => [...m, { id: 't_bolt', name: '雷霆赋能（测试）', source: 'buff', desc: '', match: { skillIds: ['bladestorm'] }, ops: [{ op: 'addElement', value: 'nature', damagePercent: 0.2 }] }]; L.setComboModifiers = m => orig(add(m)); g.syncCharacter?.(); }
    document.querySelectorAll('.panel').forEach(p => { p.style.display = 'none'; });
    return [e1, e2, g.player?.level].join('|');
  }, { rune: sc.rune, bolt: !!sc.bolt });
  await page.waitForTimeout(3000);
  const closeAll = () => page.evaluate(() => { for (let k = 0; k < 3; k++) { [...document.querySelectorAll('button')].filter(x => x.offsetParent && /知道了|关闭|确定/.test(x.textContent)).forEach(x => x.click()); document.querySelectorAll('[data-close]').forEach(x => { if (x.offsetParent) x.click(); }); } });
  await closeAll(); await page.waitForTimeout(500); await closeAll();
  const setup = await page.evaluate(() => {
    const g = window.__game; g.player.maxHp = 1e6; g.player.hp = 1e6;
    const wolves = g.enemies.filter(e => e.kind === 'wolf' && e.alive && e.z === 'world').slice(0, 5);
    if (!wolves.length) return 'no wolves';
    const c = wolves[0].pos.clone(); g.player.pos.set(c.x - 1.5, 0, c.z);
    wolves.forEach((w, i) => { w.maxHp = w.hp = 1e7; w.pos.set(c.x + Math.cos(i * 1.3) * (i ? 2.6 : 0), 0, c.z + Math.sin(i * 1.3) * (i ? 2.6 : 0)); w.brain?.provoke?.(); });
    g.target = wolves[0]; g.player.rig.root.rotation.y = Math.PI / 2; g.camYawSet(-Math.PI / 2 + 0.45); g.camSet?.(12, 0.55);
    return 'ok ' + wolves.length;
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const g = window.__game; const w = g.enemies.filter(e => e.kind === 'wolf' && e.alive && e.z === 'world' && e.maxHp >= 1e7); const c = w[0].pos; w.forEach((e, i) => i && e.pos.set(c.x + Math.cos(i * 1.3) * 2.6, 0, c.z + Math.sin(i * 1.3) * 2.6)); g.player.pos.set(c.x - 1.5, 0, c.z); g.target = w[0]; });
  const st = await page.evaluate(s => { const g = window.__game; return [g.skillBook.skillAt(s).id, g.anyPanelOpen?.() ?? '?'].join(','); }, sc.slot); console.log('  slot', st);
  const t0 = Date.now();
  await page.evaluate(s => { const g = window.__game; g.loadout.resetCooldown?.(s); g.player.mp = g.player.maxMp ?? 999; g.tryCast(s); }, sc.slot);
  for (const [i, ms] of sc.shots.entries()) { const w = ms - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); await page.screenshot({ path: `${OUT}/${sc.id}_${i}.png`, timeout: 180000 }); }
  console.log(sc.id, info, setup, await page.evaluate(() => { const p = window.__game.loadout.preview('ultimate', { now: 0, casterHpPercent: 1, targetEffects: [] }); return p.displayName + ' r=' + p.stats.radius.toFixed(2) + ' el=' + (p.elements || []).join('/'); }));
  await page.close();
}
await b.close();
console.log(errors.length ? '错误：\n' + errors.slice(0, 5).join('\n') : '无页面错误');
