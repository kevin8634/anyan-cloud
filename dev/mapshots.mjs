// 待办 4 地图补完效果图：镜渊城 · 倒钟广场固定机位（1920×1080）
//   node dev/mapshots.mjs <html> <输出目录> <前缀> [quality=ultra] [only=名字,名字]
//   守钟人状态（选 A + 领地解锁 + 钟楼 1 级，和 Rhett 截图一致）；怪物挪走；营地机位保留玩家做比例尺
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/mapshots', PRE = 'shot', Q = 'ultra', ONLY = ''] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(240000); page.setDefaultNavigationTimeout(240000);
await page.addInitScript(q => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q })); } }, Q);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 240000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(6000);
const O = [2400, -2100];
// [名字, 镜头 [x,y,z,看x,看y,看z]（局部）, 玩家位置（null = 藏起来）]
const SH = [
  ['1_营地同机位', [3, 12, 82, 0, 0, 52], [1, 64]],
  ['2_广场全景', [34, 26, 96, -2, 0, 30], null],
  ['3_营地火焰近景', [4.5, 2.6, 64.5, 0, 0.9, 58], null],
  ['4_钟楼', [24, 6, -1, 62, 11, -12], null],
  ['5_领地钟楼与长街', [-42, 7, 66, -26, 4, 38], null],
  ['6_帐篷货箱栅栏', [-15, 3.4, 67, -6, 0.9, 55], null],   // 第四轮：写实帐篷 / 木栅 / 铁箍木箱
  ['7_营地NPC', [1, 2.3, 45, 1, 1.3, 55], null],   // 第四轮：NPC 差异化（卡戎 / 伊奥拉 / 米拉 / 奥塔 …）
  ['8_长街NPC', [1, 2.4, 33, -14, 1.2, 20], null],
].filter(s => !ONLY || ONLY.split(',').includes(s[0].split('_')[0]));
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
  try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); d.domain.setLv('belfry', +(window.__belfryLv || 1)); } catch (e) { console.log('domain', e.message); }
  try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); });
await page.waitForTimeout(9000);
for (const [name, c, pp] of SH) {
  await page.evaluate(([O, c, pp]) => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    const p = pp ?? [c[0], c[2] - 3]; g.player.pos.set(O[0] + p[0], 0, O[1] + p[1]); if (g.player.rig) g.player.rig.root.visible = !!pp;
    window.__camOv = [O[0] + c[0], c[1], O[1] + c[2], O[0] + c[3], c[4], O[1] + c[5]];
    document.querySelectorAll('body > *:not(canvas)').forEach(p => { if (!p.querySelector('canvas')) p.style.visibility = 'hidden'; }); }, [O, c, pp]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` });
  console.log('shot', name);
}
const info = await page.evaluate(() => { const g = window.__game; let lux = 0, tris = 0; g.scene?.traverse?.(o => { if (o.userData?.luxScene) lux++; });
  const r = g.renderer?.info?.render; return { lux, calls: r?.calls, tris: r?.triangles, dress: window.__dlc1?.plaza?.() ?? null, npcHd: (() => { let n = 0; g.scene?.traverse?.(o => { if (o.userData?.npcHd) n++; }); return n; })() }; });
console.log('info', JSON.stringify(info), 'errors:', JSON.stringify(errors.slice(0, 8)));
// 第四轮：新建筑碰撞 + 寻路自检（玩家从外面走向建筑中心会被挡在外面；营地到各地点 / NPC 都有路）
const col = await page.evaluate(O => { const g = window.__game, w = g.ensureWild('dlc1_mirror'), nav = w.nav; const L = (x, z) => ({ x: O[0] + x, z: O[1] + z });
  const B = [['城中钟楼', 62, -12], ['倒钟纪念碑', 17, 72], ['塔楼', -42, 54], ['塔楼', 66, 30], ['塔楼', 26, -78], ['城门左柱', -2.47, 38], ['城门右柱', 2.47, 38]];
  const walls = B.map(([n, x, z]) => { const p = L(x, z), prev = L(x - 12, z + 0.3), q = { x: prev.x, z: prev.z }; for (let i = 1; i <= 60; i++) { const pv = { x: q.x, z: q.z }; q.x = prev.x + (p.x - prev.x) * i / 60; q.z = prev.z + (p.z - prev.z) * i / 60; nav.resolveMove(pv, q, 0.45); }
    return [n, +Math.hypot(q.x - p.x, q.z - p.z).toFixed(2)]; });
  // 城门通道：从门北走到门南（沿主路中线），应能走通（残差≈0）
  const thru = (() => { const a = L(0, 30), b = L(0, 46), q = { x: a.x, z: a.z }; const dx = (b.x - a.x) / 80, dz = (b.z - a.z) / 80; for (let i = 1; i <= 80; i++) { const pv = { x: q.x, z: q.z }; q.x += dx; q.z += dz; nav.resolveMove(pv, q, 0.45); } return +Math.hypot(q.x - b.x, q.z - b.z).toFixed(2); })();
  const T = { 钟楼区: [46, -10], 去钟楼阶梯: [30, -74], 提灯塔: [0, -50], 镜廊: [-46, 0], 小圣堂: [-36, -42], 长街: [0, 22], 城门下: [0, 38], 南门: [0, 80], 面包炉: [26, 36] };
  const npcs = { 欧芙: [22, 32], 布伦: [-6, 40], 缇莎: [-12, 26], 汉斯: [14, 16], 梅洛: [-20, 14], 戈兹: [32, 4], 莉安: [-30, -30], 派克: [38, -18], 赛恩: [16, -28], 奥塔: [-7.5, 59.5], 米拉: [9.2, 58] };
  const st = L(0, 58), path = {}; for (const [k, [x, z]] of Object.entries({ ...T, ...npcs })) { const t = L(x, z); const pth = nav.findPath(st.x, st.z, t.x, t.z); path[k] = pth ? pth.length : 'NO'; }
  const kits = []; const v = { x: 0, z: 0 }; g.scene.traverse(o => { if (o.userData?.npcKit) { const e = o.matrixWorld.elements, lx = e[12] - O[0], lz = e[14] - O[1]; kits.push(o.userData.npcHd + ':' + o.userData.npcKit + '@' + lx.toFixed(1) + ',' + lz.toFixed(1) + ' 距营地心 ' + Math.hypot(lx, lz - 58).toFixed(1)); } });
  return { walls, gateThru: thru, path, colliders: window.__dlc1?.plaza?.()?.colliders, kits }; }, O);
console.log('collide', JSON.stringify(col));
await b.close().catch(() => {});
