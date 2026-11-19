// 11-05 暗金武器握点实测：CLS=<职业> node test/grip_measure.mjs
// 装本职业 40 级暗金，各动作若干帧：手骨（武器父骨）世界位置、手掌（手骨→中指根中点）、Lux 武器原点（= 握点）距离，单位米
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const CLS = process.env.CLS || 'warrior';
const ITEMS = process.env.NOEQ ? {} : { warrior: ['d40_w_tide'], mage: ['d40_m_astro'], chrono: ['d40_t_wheel', 'd40_t_glass'], alchemy: ['d40_a_flask', 'd40_a_box'] };
const ROOT = new URL('..', import.meta.url).pathname, HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1_比赛版.html');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
const page = await b.newPage({ viewport: { width: 640, height: 480 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(900000);
await page.addInitScript(() => { if (!sessionStorage.getItem('rc')) { sessionStorage.setItem('rc', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); } });
await page.goto('file://' + HTML + '?cg=0&op=0', { waitUntil: 'domcontentloaded', timeout: 900000 });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 900000 });
await page.evaluate(c => window.__game.startGame(c), CLS); await page.waitForTimeout(4000);
const put = await page.evaluate(ids => { const g = window.__game, inv = g.inventory, out = [];
  for (const id of ids) { const it = g.gen.generateFixed(id, 84); if (!it) { out.push(id + ':无'); continue; }
    const slot = it.slot === 'twoHand' || it.slot === 'oneHand' ? 'mainHand' : it.slot; inv.equipped[slot] = it; if (it.slot === 'twoHand') delete inv.equipped.offHand; out.push(`${id}→${slot}`); }
  g.refreshGear(); return out; }, ITEMS[CLS] ?? []);
await page.waitForTimeout(2500);
console.log('装上', put.join(' / '));
const probe = () => page.evaluate(() => { const r = window.__game.player.rig.root; r.updateMatrixWorld(true); const out = [];
  r.traverse(o => { if (!/^(w40_|weapon_)/.test(o.userData?.luxKey ?? '')) return;
    const V = (x) => x.getWorldPosition(new o.position.constructor());
    let bone = o; while (bone && !bone.isBone) bone = bone.parent;
    const g = V(o), h = bone ? V(bone) : null;
    let mid = null; if (bone) bone.traverse(c => { if (!mid && c !== bone && c.isBone && /middle|Middle|mid/i.test(c.name)) mid = c; });
    const palm = h && mid ? h.clone().add(V(mid)).multiplyScalar(0.5) : null;
    // 握柄段：Lux 网格局部 y∈[-0.06L, +0.06L] 的顶点重心（握点附近）——看握点是否在柄上
    const B = { min: 1e9, max: -1e9 }; r.traverse(c => { if (c.isBone) { const p = V(c); B.min = Math.min(B.min, p.y); B.max = Math.max(B.max, p.y); } }); const H = (B.max - B.min) / 1.75;   // 骨架高度归一到 1.75 米
    out.push({ key: o.userData.luxKey, bone: bone?.name, dHand: h ? +(g.distanceTo(h) / H).toFixed(3) : null, dPalm: palm ? +(g.distanceTo(palm) / H).toFixed(3) : null, mid: mid?.name ?? null,
      vis: o.visible && (o.parent?.visible ?? true) }); });
  return out; });
const res = {};
await page.evaluate(() => window.__game.player.rig.anim?.loop('idle')); await page.waitForTimeout(1200);
res.idle = await probe();
const shot = async (tag) => { const pts = await page.evaluate(() => { const g = window.__game, r = g.player.rig.root, cam = g.camera; r.updateMatrixWorld(true); const out = [];
    const W = (o) => o.getWorldPosition(new r.position.constructor()), P = (v) => { const q = v.clone().project(cam); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; };
    r.traverse(o => { if (!/^(w40_|weapon_)/.test(o.userData?.luxKey ?? '')) return; let bone = o; while (bone && !bone.isBone) bone = bone.parent;
      out.push({ grip: P(W(o)), hand: bone ? P(W(bone)) : null, w: P(W(o.parent.parent)) }); }); return out; });
  const f = `/workspace/work/shots/grip/${CLS}_${tag}.png`; await page.screenshot({ path: f }); console.log('SHOT', f, JSON.stringify(pts)); };
if (process.env.SHOT) { await page.evaluate(() => { const g = window.__game; g.player.pos.z += 4; g.camDistSet?.(2.6); g.stow?.force('drawn'); }); await page.waitForTimeout(2500);
  for (const y of [0.8, 2.2, 4.0]) { await page.evaluate(y => { const g = window.__game; g.player.rig.root.rotation.y = y; g.player.rig.anim?.loop('idle'); }, y); await page.waitForTimeout(1000); await shot('idle_' + y); }
  for (const a of ['attack1', 'cast']) for (const t of [200, 400]) { await page.evaluate(a => { const g = window.__game; g.player.rig.root.rotation.y = 0.8; g.player.rig.anim?.play(a, 0.6); }, a); await page.waitForTimeout(t); await shot(a + '_' + t); await page.waitForTimeout(900); }
}

for (const a of ['attack1', 'cast']) { res[a] = [];
  for (const t of [150, 300, 450]) { await page.evaluate(a => window.__game.player.rig.anim?.play(a, 0.6), a); await page.waitForTimeout(t); res[a].push(await probe()); await page.waitForTimeout(900); } }
console.log(JSON.stringify(res, null, 1));
console.log('页面错误', errors.length, errors.slice(0, 2));
await b.close();
