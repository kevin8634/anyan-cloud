// v1.2.36 副本救援 NPC 实机截图（真浏览器，写实模型）：node dev/allyshots.mjs <html> <fighter|aura|archer> <out.png>
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const [html, kind, out] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/texture|blob:/.test(m.text())) errors.push(m.text().slice(0, 300)); });
await page.goto('file://' + resolve(html));
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 90000 });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); });
await page.evaluate(() => { const g = window.__game; g.settings.quality = 'low'; g.settings.fps = 60; try { g.applySettings(); } catch {} g.startGame('warrior'); });
await page.waitForTimeout(2500);
const closeP = () => document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') p.style.display = 'none'; });
await page.evaluate(([k, cp]) => { const g = window.__game; g.tutFinish?.(); eval(cp)(); g.progression.level = 30; g.dgxForceAnomaly('captive'); g.rescueForce(k); g.enterDungeon('darkrock_mine', 'epic', []); }, [kind, `(${closeP})`]);
await page.waitForTimeout(1500);
await page.evaluate(async cp => { const g = window.__game; eval(cp)(); await g.ensureHd(30000); setInterval(() => { g.player.hp = g.player.maxHp; }, 100); }, `(${closeP})`);
for (let i = 0; i < 30; i++) {
  const n = await page.evaluate(cp => { const g = window.__game; eval(cp)(); if (g.dgxDebug()?.pick) g.dgxPick(0); if (g.dgxDebug().anomalies.length) return -1;
    const P = g.player.pos; const es = g.enemies.filter(e => e.z === 'dungeon' && e.alive && !e.isBoss).sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z)).slice(0, 6);
    for (const e of es) { g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.fx.dealDamage(e, e.maxHp * 2, 'physical', g.player); } return es.length; }, `(${closeP})`);
  if (n < 0) break; await page.waitForTimeout(700);
}
// 先拍笼子
const cage = await page.evaluate(() => { const g = window.__game; const a = g.dgxDebug().anomalies.find(x => x.kind === 'captive'); return !!a; });
await page.evaluate(cp => { eval(cp)(); const g = window.__game; g.dgxPick?.(0); }, `(${closeP})`);
const info = await page.evaluate(() => { const g = window.__game; const d = g.dgxDebug(); return d; });
// 走到笼子旁解救
await page.evaluate(cp => { const g = window.__game; g.dgxAct('captive'); setInterval(() => { if (g.dgxDebug()?.pick) g.dgxPick(0); eval(cp)(); }, 200); }, `(${closeP})`);
await page.waitForTimeout(1500);
let r;
// 无头 swiftshader 下只有 1–3 帧/秒：按 AI 的站位规则摆好位置再拍（动作 / 光环都是游戏里的真实对象）
if (kind === 'aura') {
  await page.evaluate(() => { const g = window.__game, a = g.rescueAlly(), P = g.player.pos; const ry = g.player.rig.root.rotation.y = Math.PI / 2 + 0.2;
    a.pos.set(P.x - Math.sin(ry) * 2.75 + Math.cos(ry) * 0.35, 0, P.z - Math.cos(ry) * 2.75 - Math.sin(ry) * 0.35); a.root.rotation.y = Math.atan2(P.x - a.pos.x, P.z - a.pos.z); a.anim?.play('cast', 1); });
} else {
  await page.evaluate(() => { const g = window.__game, a = g.rescueAlly(), P = g.player.pos;
    const e = g.enemies.filter(e => e.z === 'dungeon' && e.alive && !e.isBoss).sort((x, y) => Math.hypot(x.pos.x - P.x, x.pos.z - P.z) - Math.hypot(y.pos.x - P.x, y.pos.z - P.z))[0];
    if (!e) return; e.maxHp = e.hp = 1e7; e.pos.set(P.x - 2.6, 0, P.z + 1.4); g.target = e; e.brain?.provoke?.();
    a.pos.set(e.pos.x + 1.0, 0, e.pos.z - 1.1); a.tgt = e; a.state = 'engage'; a.atkCd = 9; a.root.rotation.y = Math.atan2(e.pos.x - a.pos.x, e.pos.z - a.pos.z); a.anim?.play('attack2', 1.0); a.stats.attacks++; });
}
await page.waitForTimeout(5000);
r = await page.evaluate(() => window.__game.rescueDebug());
const t0 = await page.evaluate(() => [window.__game.T, document.hidden]); await page.waitForTimeout(3000);
console.log('T', t0, await page.evaluate(() => [window.__game.T, document.hidden, window.__game.zone, window.__game.anyPanelOpen?.(), [...document.querySelectorAll('.panel')].filter(p => p.style.display === 'flex').map(p => p.id), window.__game.player.alive]));
const dbg = await page.evaluate(() => { const g = window.__game, P = g.player.pos; return g.enemies.filter(e => e.z === 'dungeon' && e.alive).slice(0, 5).map(e => [e.kind, Math.round(Math.hypot(e.pos.x - P.x, e.pos.z - P.z)), e.intent?.state, g.isActive ? 1 : 0]); });
console.log(JSON.stringify(dbg));
// 镜头：侧面 45° 对准随从与玩家的中点
await page.evaluate(() => { const g = window.__game, al = g.rescueAlly(), a = al.pos, P = al.tgt?.alive ? al.tgt.pos : g.player.pos; const cx = (a.x + P.x) / 2, cz = (a.z + P.z) / 2; const D = Math.max(3.2, Math.hypot(a.x - P.x, a.z - P.z) * 0.9 + 2.2); window.__camOv = [cx + D * 0.75, D * 0.55, cz + D * 0.75, cx, 1.0, cz]; });
await page.waitForTimeout(2500);
await page.waitForTimeout(400);
await page.screenshot({ path: out });
console.log(JSON.stringify({ cage, r, relics: info?.relics, P: await page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]) }));
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'NO ERRORS'); await b.close();
