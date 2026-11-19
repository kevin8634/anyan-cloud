// 海底第五轮效果图：镜渊城（B3 镜湖 / 石堤桥 / 穹顶 / 倒悬城 / 不规则地板 / 能量池 / 接触泡沫）固定机位（1920×1080）
//   node dev/seashots.mjs <html> <输出目录> <前缀> [quality=ultra] [only=名字,名字]
//   守钟人状态（选 A + 领地解锁 + 钟楼 1 级，和 Rhett 截图一致）；怪物挪走；营地机位保留玩家做比例尺
import { chromium } from 'playwright-core';
import { resolve } from 'path'; import { mkdirSync } from 'fs';
const [html, OUT = '/tmp/mapshots', PRE = 'shot', Q = 'ultra', ONLY = ''] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.setDefaultTimeout(420000); page.setDefaultNavigationTimeout(420000);
// 10-27：CM=new 拍写实角色 / 写实营地（默认 auto = 经典）
await page.addInitScript(([q, cm]) => { if (!sessionStorage.getItem('ms')) { sessionStorage.setItem('ms', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify(Object.assign({ quality: q }, cm ? { charModel: cm } : {}))); } }, [Q, process.env.CM || '']);
await page.goto('file://' + resolve(html), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 420000 });
await page.evaluate(() => window.__game.startGame('mage'));
await page.waitForTimeout(6000);
const O = [2400, -2100];
// [名字, 镜头 [x,y,z,看x,看y,看z]（局部）, 玩家位置（null = 藏起来）]
const SH = [
  ['1_营地同机位', [3, 12, 82, 0, 0, 52], [1, 64]],
  ['c1_营地南门低角', [-1.5, 3.4, 77, 0, 1.2, 56], null],   // 10-28 营地 A 沉船拾荒营
  ['c2_营地锻造角', [3, 2.8, 68.5, -7, 0.9, 63], null],
  ['c3_北门船首像', [-3.2, 2.3, 40.6, -6.2, 2.0, 44.6], null],
  ['c4_米拉商摊', [3, 2.6, 56, 11, 1.2, 54], null],
  ['3_水面倒影', [17, 7, -52, 60, 5, -14], null],
  ['8_概念构图', [19, 4.0, -50, 36, 0.5, -34], null],
  ['w_倒钟广场低角全景', [20, 7, 94, -2, 5, 50], null],   // 10-27 总览：同选角背景机位（dev/shots/env_select.json）
  ['b3_B3同构图', [26.5, 2.8, 47.8, 54, 9, 33], null],
  ['b3w_深水石桥', [33, 4.5, 51, 56, 0.5, 26], [32.5, 47]],
  ['b3d_桥面', [43.5, 2.2, 45.5, 54, 0.6, 30], null],
  ['p_能量池', [-10.5, 3.2, 50.5, -14, 0.2, 46], null],
  ['f1_接触泡沫浅滩', [29, 2.6, -24, 35, 0, -31], null],
  ['f2_接触泡沫桥墩', [37, 2.6, 49, 45, 0, 42], null],
  ['g1_地板近景', [-26, 2.4, -14, -29, 0, -20], null],
  ['g2_地板沙堆', [-36, 3.0, 25, -40, 0, 30], null],
  ['s1_天空仰视', [12, 2.5, 8, 40, 60, 36], null],
  ['s2_倒悬城仰视', [30, 3, 40, 60, 34, 48], null],
].filter(s => !ONLY || ONLY.split(',').includes(s[0].split('_')[0]));
await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); g.progression.level = 40; g.player.hp = g.player.maxHp = 1e7;
  try { const d = window.__dlc1; d.bt.chooseFate('A'); d.domain.ensureUnlocked(); d.domain.setLv('belfry', +(window.__belfryLv || 1)); } catch (e) { console.log('domain', e.message); }
  try { g.ensureWild('dlc1_mirror'); } catch (e) {} g.goMap('dlc1_mirror'); });
await page.waitForTimeout(9000);
// 10-27：比赛版写实场景件（Lux3D）解析较慢，没等到就拍会是程序化回退的 Q 版营地 → 最多等 150 秒出现 luxscene_*，再等细节层 / 贴图
if (!process.env.NOWAIT_LUX) { await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse(o => { if (o.name === 'luxscene_scene_ruins') n++; }); return n > 0; }, null, { timeout: 150000, polling: 2000 }).catch(() => console.log('等不到 luxscene 场景件'));
  await page.waitForTimeout(8000);
  // 10-27：写实 NPC 底座（UBC）解析完才把营地 NPC 从经典换成写实 → 最多再等 150 秒 pending 清零
  await page.waitForFunction(() => { const d = window.__dlc1?.plaza?.(); return !d || d.pending === 0; }, null, { timeout: 150000, polling: 2000 }).catch(() => {});
  console.log('plaza', JSON.stringify(await page.evaluate(() => { const d = window.__dlc1?.plaza?.(); return d && { pending: d.pending, upgraded: d.upgraded, upErr: d.upErr, hd: d.hd, hdF: d.hdF }; }))); }
// 寻路自检：入口 → 所有任务点 / NPC / 传送门 / 怪群 / 精英路线 / 镜子 / 桥两端；再走一遍石堤桥
const nav = await page.evaluate((O) => { const g = window.__game, nav = g.outdoorNav(), W = g.wildDef('dlc1_mirror'); if (!nav) return { err: 'no nav' };
  const from = [O[0], O[1] + 78], bad = [], tgt = [];
  for (const [k, s] of Object.entries(W.spots)) if (s.r > 0) tgt.push(['spot:' + k, s.x, s.z]);
  for (const n of W.npcs) tgt.push(['npc:' + n.id, n.x, n.z]);
  for (const gt of W.gates) tgt.push(['gate:' + gt.to, gt.x, gt.z]);
  W.packs.forEach((p, i) => tgt.push(['pack' + i, p.x, p.z]));
  (W.elite?.route ?? []).forEach((p, i) => tgt.push(['elite' + i, p[0], p[1]]));
  [[-30, 12], [30, 12], [-52, -28], [-12, -56], [42, -34], [12, -60]].forEach((p, i) => tgt.push(['mirror' + i, p[0], p[1]]));
  tgt.push(['bridgeW', 30, 46.5], ['bridgeE', 60.5, 10.5]);
  for (const [name, x, z] of tgt) { const gx = O[0] + x, gz = O[1] + z; const f = nav.nearestFree(gx, gz, 3); if (!f) { bad.push(name + '(无空位)'); continue; }
    const p = nav.findPath(from[0], from[1], f.x, f.z); if (!p) bad.push(name); }
  const bp = nav.findPath(O[0] + 30, O[1] + 46.5, O[0] + 60.5, O[1] + 10.5); let L = 0, a = { x: O[0] + 30, z: O[1] + 46.5 }; for (const b of bp ?? []) { L += Math.hypot(b.x - a.x, b.z - a.z); a = b; }
  const mid = nav.walkable(O[0] + 46.5, O[1] + 41.5), deep = nav.walkable(O[0] + 60, O[1] + 46);
  return { n: tgt.length, bad, bridgePath: bp ? +L.toFixed(1) : null, bridgeMidWalkable: mid, deepWalkable: deep }; }, O);
console.log('nav', JSON.stringify(nav));
for (const [name, c, pp] of SH) {
  await page.evaluate(([O, c, pp]) => { const g = window.__game; g.enemies.forEach(x => { x.pos.set(x.pos.x + 3000, 0, x.pos.z + 3000); x.speed = 0; });
    const p = pp ?? [c[0], c[2] - 3]; g.player.pos.set(O[0] + p[0], 0, O[1] + p[1]); if (g.player.rig) g.player.rig.root.visible = !!pp;
    window.__camOv = [O[0] + c[0], c[1], O[1] + c[2], O[0] + c[3], c[4], O[1] + c[5]];
    // 10-27：整页 UI 全藏（小地图框 / 地面标签等），只留主画布（visibility 子元素可单独设回 visible）
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    document.body.style.visibility = 'hidden'; document.querySelectorAll('body *').forEach(x => { x.style.visibility = x === cv ? 'visible' : 'hidden'; }); }, [O, c, pp]);
  await page.waitForTimeout(+(process.env.SHOT_WAIT || 3500));
  await page.evaluate(() => { try { window.__dlc1?.seaBurst?.(12); } catch (e) {} });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${OUT}/${PRE}_${name}.png` });
  if (process.env.PROBE) console.log('probe', name, JSON.stringify(await page.evaluate((c) => { const g = window.__game, out = []; const V = g.scene.position.constructor, cam = new V(c[0], c[1], c[2]), w = new V();
    g.scene.traverse(o => { if (!o.isMesh || !o.visible || o.isInstancedMesh) return; o.getWorldPosition(w); const d = w.distanceTo(cam); if (d < 10) { let p = o, path = []; for (let k = 0; k < 4 && p; k++) { path.push(p.name || p.type); p = p.parent; }
      out.push([path.join('<'), +d.toFixed(1), [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)], o.geometry?.type, o.material?.color?.getHexString?.()]); } });
    const ov = window.__camOv, camO = { tgt: new V(ov[3], ov[4], ov[5]) }; { const D = camO.tgt.clone().sub(cam).normalize(), Rt = D.clone().cross(new V(0, 1, 0)).normalize(), Up = Rt.clone().cross(D); const T = Math.tan(25 * Math.PI / 180); const big = []; g.scene.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere; if (!bs) return;
      const sc = o.getWorldScale(new V()).x, r = bs.radius * sc; if (r < 3 || r > 60) return; const cw = bs.center.clone().applyMatrix4(o.matrixWorld), d = cw.distanceTo(cam); const vv = cw.clone().sub(cam), zz = vv.dot(D), pj = { x: vv.dot(Rt) / zz / T / (16 / 9), y: vv.dot(Up) / zz / T, z: zz > 0 ? 0 : 2 }; if (pj.z > 1 || pj.x < 0.3 || pj.y < -0.2) return;
      let p = o, path = []; for (let k = 0; k < 4 && p; k++) { path.push(p.name || p.type); p = p.parent; } big.push(['BIG ' + path.join('<'), +d.toFixed(1), +r.toFixed(1), [+cw.x.toFixed(1), +cw.y.toFixed(1), +cw.z.toFixed(1)], +pj.x.toFixed(2), +pj.y.toFixed(2)]); }); out.push(...big.slice(0, 20)); }
    return out.filter(e => String(e[0]).startsWith('BIG') || e[1] < 3).slice(0, 40); }, [O[0] + c[0], c[1], O[1] + c[2]]).catch(e => e.message)));
  console.log('shot', name);
  if (process.env.AB_STEPS) for (const [k, st] of process.env.AB_STEPS.split('|').entries()) {
    await page.evaluate(st => { const hid = []; window.__game.scene.traverse(o => { if ((st === 'points' && o.isPoints) || st.split(',').includes(o.name) || (st === 'transparent' && o.material && !Array.isArray(o.material) && o.material.transparent && !o.name.startsWith('sea_water'))) { if (o.visible) { o.visible = false; hid.push(o); } } }); window.__abHid = hid; }, st);
    await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${PRE}_${name}_s${k}.png`, clip: { x: 0, y: 700, width: 900, height: 380 } });
    await page.evaluate(() => { (window.__abHid || []).forEach(o => { o.visible = true; }); });
  }
  if (process.env.AB_HIDE) { await page.evaluate(n => { window.__game.scene.traverse(o => { if (n.split(',').includes(o.name)) o.visible = false; }); }, process.env.AB_HIDE); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${PRE}_${name}_ab.png` });
    await page.evaluate(n => { window.__game.scene.traverse(o => { if (n.split(',').includes(o.name)) o.visible = true; }); }, process.env.AB_HIDE); }
}
const info = await page.evaluate(() => { const g = window.__game; let lux = 0, tris = 0; g.scene?.traverse?.(o => { if (o.userData?.luxScene) lux++; });
  const r = g.renderer?.info?.render; const pts = []; g.scene?.traverse?.(o => { if (o.isPoints && o.visible) pts.push((o.name || '?') + ':' + o.material.type + ':' + (o.material.map ? 'map' : 'nomap') + ':' + o.geometry.attributes.position.count + ':' + (o.material.size ?? '')); });
  return { sea5: window.__dlc1?.sea5?.() ?? null, pts, lux, calls: r?.calls, tris: r?.triangles, dress: window.__dlc1?.plaza?.() ?? null, npcHd: (() => { let n = 0; g.scene?.traverse?.(o => { if (o.userData?.npcHd) n++; }); return n; })() }; });
console.log('info', JSON.stringify(info), 'errors:', JSON.stringify(errors.slice(0, 8)));
await b.close().catch(() => {});
