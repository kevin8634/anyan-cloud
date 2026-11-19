// v1.2.71 沉钟海岸地图升级 e2e：node test/coast71_e2e.mjs [html=web/index_dlc1.html] [画质=low,medium,high,ultra]
//   每档单独开页：建场景 0 报错、地面 / 海面 / 天空 / 造景按档；完整检查（地标 / 风暴进出 / 灯塔光束 / 音效节点 / 寻路 / 旧坐标）在第一档跑
//   headless 环境噪声（WebP / 图片解码 / media play）不计入报错
import { chromium } from 'playwright-core';
import { resolve } from 'path';
const ROOT = new URL('..', import.meta.url).pathname;
const HTML = resolve(ROOT, process.argv[2] || 'web/index_dlc1.html');
const QS = (process.argv[3] || 'low,medium,high,ultra').split(',');
const FULL = process.env.FULL_Q || QS[0];
const NOISE = /webp|decode|media|play\(\)|NotAllowedError|AudioContext was not allowed|Failed to load resource|ERR_FILE_NOT_FOUND/i;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✓' : '✗', m); };
const O = [2400, -2400];

async function run(Q) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--js-flags=--max-old-space-size=4096'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.setDefaultTimeout(600000);
  await page.addInitScript(([q]) => { if (!sessionStorage.getItem('c71')) { sessionStorage.setItem('c71', '1'); localStorage.clear(); localStorage.setItem('darkrock_intro_seen', '1'); localStorage.setItem('darkrock_settings', JSON.stringify({ quality: q, dayNight: false })); } }, [Q]);
  const t0 = Date.now();
  await page.goto('file://' + HTML + '?perf=1', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__game && document.getElementById('start').textContent === '开始冒险', null, { timeout: 600000 });
  await page.evaluate(() => { window.__game.startGame('warrior'); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; g.tutFinish?.(); try { g.audio.unlock(); } catch (e) {} g.progression.level = 35; g.player.hp = g.player.maxHp = 1e7; g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); });
  await page.waitForTimeout(4000);
  const tl = ((Date.now() - t0) / 1000).toFixed(0);
  const d = await page.evaluate(() => window.__dlc1.coast71());
  console.log(`--- ${Q}（加载 + 进图 ${tl}s）`, JSON.stringify({ q: d.q, sea: d.sea, sky: d.sky, dress: d.dress }));
  ok(d.built && d.q === Q && d.floor, `[${Q}] 海岸场景建成（地面着色器已替换，画质 ${d.q}）`);
  ok(d.sea.seg > 0 && d.sky.rainN > 0 && d.dress.inst >= 20, `[${Q}] 海面 ${d.sea.seg} 段 / ${d.sea.waves} 道波、雨 ${d.sky.rainN} 线、实例化 ${d.dress.inst} 组 ${d.dress.instCount} 件`);
  // 帧率（swiftshader 软渲染，只做相对参考）
  await page.evaluate(([O]) => { const g = window.__game; g.player.pos.set(O[0] + 2, 0, O[1] + 20); }, [O]);
  await page.waitForTimeout(6000);
  const pf = await page.evaluate(() => window.__game.perf?.());
  console.log(`  [${Q}] perf A 区`, JSON.stringify(pf));

  if (Q === FULL) {
    // ---------- 三区地标
    const names = await page.evaluate(() => { const s = new Set(); window.__game.wilds.dlc1_coast.group.traverse(o => { if (o.name) s.add(o.name); }); let lathe = 0; window.__game.wilds.dlc1_coast.group.traverse(o => { if (o.geometry?.type === 'LatheGeometry') lathe++; }); return { names: [...s], lathe }; });
    const has = n => names.names.includes(n);
    const A = ['coast_basalt', 'coast_seawall', 'coast_smallbells', 'coast_bellshards', 'coast_chains', 'coast_rocks', 'coast_barnacles'];
    const B = ['coast_planks', 'coast_piles', 'coast_anchor0', 'coast_anchor1', 'coast_anchor2', 'coast_lighthouse', 'coast_beam', 'coast_keel', 'coast_lamp_posts', 'coast_lamp_cores', 'coast_well', 'coast_cage'];
    const C = ['coast_whale_ribs', 'coast_vertebrae', 'coast_bonearch0', 'coast_bonearch3', 'coast_sunk_tower', 'coast_cyan', 'coast_stele'];
    ok(A.every(has) && names.lathe >= 3, `A 退潮沉钟浅滩地标：${A.filter(has).length}/${A.length}，钟（Lathe）${names.lathe} 个；缺 ${A.filter(n => !has(n))}`);
    ok(B.every(has), `B 风暴锈锚码头地标：${B.filter(has).length}/${B.length}；缺 ${B.filter(n => !has(n))}`);
    ok(C.every(has), `C 鲸骨礁湾地标：${C.filter(has).length}/${C.length}；缺 ${C.filter(n => !has(n))}`);
    ok(['coast_sea', 'coast_sky', 'coast_rain', 'coast_bolt', 'coast_spray'].every(n => has(n) || (n === 'coast_spray' && Q === 'low')), '海面 / 天空 / 雨 / 闪电 / 飞溅对象存在');
    // ---------- 寻路 / 旧坐标
    const nav = await page.evaluate(([O]) => { const g = window.__game, nav = g.outdoorNav(), W = g.wildDef('dlc1_coast'), from = [O[0] - 8, O[1] + 68], bad = [], tgt = [];
      for (const [k, s] of Object.entries(W.spots)) tgt.push(['spot:' + k, s.x, s.z]);
      for (const n of W.npcs) tgt.push(['npc:' + n.id, n.x, n.z]);
      for (const gt of W.gates) tgt.push(['gate:' + gt.to, gt.x, gt.z]);
      W.packs.forEach((p, i) => tgt.push(['pack' + i, p.x, p.z])); (W.elite?.route ?? []).forEach((p, i) => tgt.push(['elite' + i, p[0], p[1]]));
      tgt.push(['chest', -46, 16], ['pierEnd', 128, 18], ['wellDeck', 106, -5.5], ['islet', 116, -34], ['northDock', 100, 40]);
      for (const [name, x, z] of tgt) { const f = nav.nearestFree(O[0] + x, O[1] + z, 3); if (!f) { bad.push(name + '(无空位)'); continue; } if (!nav.findPath(from[0], from[1], f.x, f.z)) bad.push(name); }
      const deep = [[110, 30], [-118, -10], [112, -5.5], [124, -38]].map(([x, z]) => nav.walkable(O[0] + x, O[1] + z));
      const camp = W.camps[0], gates = W.gates.map(g => [g.x, g.z]);
      return { n: tgt.length, bad, deep, camp: [camp.x, camp.z, camp.waypoint.x, camp.waypoint.z], gates, half: W.half, bellSpot: W.spots.cs_bell_core, chestY: g.wilds.dlc1_coast.hf ? +(g.wilds.dlc1_coast.hf.at?.(O[0] - 46, O[1] + 16) ?? 0).toFixed(2) : null }; }, [O]);
    console.log('  nav', JSON.stringify(nav));
    ok(!nav.bad.length, `寻路：营地 → ${nav.n} 个目标（spots / NPC / 传送门 / 怪群 / 精英路线 / 宝箱 / 栈桥尽头 / 井台 / 灯塔礁岛）全部可达；不可达 ${nav.bad}`);
    ok(nav.deep.every(w => !w), '深海 / 井口 / 灯塔塔身不可走');
    ok(nav.camp.join() === '0,62,-8,68' && JSON.stringify(nav.gates) === '[[0,84],[0,-84]]' && nav.bellSpot.x === 0 && nav.bellSpot.z === -12, '旧坐标保留：营地 (0,62)、传送阵 (-8,68)、南北传送门、沉钟 (0,-12)');
    ok(nav.half === 135 && 135 + 90 < 300, '场地 135（与镜渊城 z 间隔 300，不重叠）');
    // 潮汐：涨潮水面高出低洼地面，退潮宝箱 (-46,16)
    const tide = await page.evaluate(([O]) => { const D = window.__dlc1, g = window.__game; D.setTidePhase('high'); return new Promise(r => setTimeout(() => { const hi = D.tideDebug(); D.setTidePhase('low'); g.player.pos.set(O[0] - 46, 0, O[1] + 16); setTimeout(() => r({ hi: hi.waters, lo: D.tideDebug().waters, chest: D.tideDebug().chests[0], tide: D.coast71().tide }), 2500); }, 2500)); }, [O]);
    ok(tide.hi.every((y, i) => y > tide.lo[i] + 0.45), `涨潮水面高出所在低洼地面（v1.2.71 海床下沉后不再用绝对 y > 0；涨 ${tide.hi} / 退 ${tide.lo}，地面 = 退 + 0.45）`);
    ok(tide.chest.open, '退潮：沉船宝箱 (-46,16) 走到即开');
    // ---------- 风暴进出（平滑）
    await page.evaluate(([O]) => { const g = window.__game; g.player.pos.set(O[0] + 2, 0, O[1] + 20); }, [O]);
    await page.waitForFunction(() => window.__dlc1.coast71().storm < 0.02, null, { timeout: 120000, polling: 500 }).catch(() => {});
    const calm = await page.evaluate(() => window.__dlc1.coast71());
    ok(calm.storm < 0.02 && calm.zone === 'A', `A 区平静：风暴 ${calm.storm.toFixed(3)}，区 ${calm.zone}`);
    await page.evaluate(([O]) => { window.__game.player.pos.set(O[0] + 86, 0, O[1] + 18); }, [O]);
    const rise = []; for (let i = 0; i < 20 && !(i >= 8 && rise[rise.length - 1][0] > 0.05); i++) {   // swiftshader 掉帧时游戏时间走得慢：8 次之后没升过 0.05 就多采几次（最多 20 次 / 30 秒）
      await page.waitForTimeout(1500); rise.push(await page.evaluate(() => { const d = window.__dlc1.coast71(); return [+d.storm.toFixed(3), d.stormRT.T ?? 0]; })); }
    const rv = rise.map(x => x[0]); console.log('  进入 B 区风暴权重', rv.join(' → '));
    const mono = rv.every((v, i) => !i || v >= rv[i - 1] - 1e-3), steps = rv.map((v, i) => i ? v - rv[i - 1] : v);
    ok(rv[rv.length - 1] > 0.05 && rv[rv.length - 1] < 0.98 && mono && Math.max(...steps) < 0.6, `进入 B 区：风暴权重平滑上升（单调、单步 < 0.6，最后 ${rv[rv.length - 1]}）`);
    await page.evaluate(() => window.__dlc1.coastStorm.snap(1)); await page.waitForTimeout(2500);
    await page.waitForFunction(() => { const d = window.__dlc1.coast71(); return d.storm > 0.95 && d.wind > 0.7 && d.rain > 0.9; }, null, { timeout: 30000, polling: 500 }).catch(() => {});   // swiftshader 掉帧：风雨按游戏时间跟上，最多再等 30 秒
    const st = await page.evaluate(() => { const d = window.__dlc1.coast71(); return { d, rain: window.__game.wilds.dlc1_coast.group.getObjectByName('coast_rain')?.visible }; });
    ok(st.d.zone === 'B' && st.d.storm > 0.95 && st.d.wind > 0.7 && st.d.rain > 0.9 && st.rain, `风暴满：风 ${st.d.wind.toFixed(2)}、雨 ${st.d.rain.toFixed(2)}（雨线可见 ${st.rain}）、海面最大浪高 ${st.d.sea.maxAmp} 米`);
    // 闪电 + 雷声同步
    const b0 = st.d.stormRT.bolts, th0 = st.d.audio.thunders;
    await page.evaluate(() => window.__dlc1.coastStorm.flashNow()); await page.waitForTimeout(1800);
    const fl = await page.evaluate(() => window.__dlc1.coast71());
    ok(fl.stormRT.bolts > b0 && fl.stormRT.thunderDelay <= 0.6 && Math.abs(fl.stormRT.lastThunderAt - fl.stormRT.lastBoltAt - fl.stormRT.thunderDelay) < 0.02, `闪电 ${fl.stormRT.bolts} 道，雷声延迟 ${fl.stormRT.thunderDelay}s（距离 ${fl.stormRT.boltDist} 米，≤ 0.6s 与闪光同步）`);
    ok(!fl.audio.connected || fl.audio.thunders > th0, `雷声音效触发（${th0} → ${fl.audio.thunders}）`);
    // 灯塔光束
    const bm1 = await page.evaluate(() => window.__dlc1.coast71().beam); await page.waitForTimeout(2000); const bm2 = await page.evaluate(() => window.__dlc1.coast71().beam);
    ok(bm1 && bm1.visible && bm2.angle !== bm1.angle && bm1.k >= 0.7 && bm1.on > 1, `灯塔光束：旋转（${bm1?.angle} → ${bm2?.angle}）、风暴亮度 ${bm1?.k}、海面扫光 ${bm1?.on}`);
    // 音效节点
    const au = fl.audio;
    ok(au.connected && au.nodes >= 15, `环境声已接本体环境音总线：${au.nodes} 个节点`);
    ok(au.gains.sea > 0.2 && au.gains.wind > 0.15 && au.gains.rain > 0.15 && au.dim < 0.6, `风暴音：海浪 ${au.gains.sea} / 风 ${au.gains.wind} / 雨 ${au.gains.rain}，音乐压到 ${au.dim}`);
    // 潮渊钟井
    await page.evaluate(([O]) => { window.__game.player.pos.set(O[0] + 106, 0, O[1] - 5.5); }, [O]); await page.waitForTimeout(1500);
    await page.waitForFunction(() => window.__dlc1.coast71().stormRT.hintShown, null, { timeout: 20000, polling: 500 }).catch(() => {});   // swiftshader 掉帧时 1.5 秒可能还没跑到提示那一帧，最多再等 20 秒
    const wl = await page.evaluate(() => window.__dlc1.coast71().stormRT);
    ok(wl.wellNear && wl.hintShown && /潮渊钟井/.test(wl.hintText), `井口提示「${wl.hintText}…」显示（只做地标，不建副本）`);
    // 离开 → 平滑还原
    await page.evaluate(([O]) => { window.__game.player.pos.set(O[0] - 4, 0, O[1] + 30); }, [O]);
    const fall = []; for (let i = 0; i < 6; i++) { await page.waitForTimeout(1500); fall.push(await page.evaluate(() => +window.__dlc1.coast71().storm.toFixed(3))); }
    console.log('  离开 B 区风暴权重', fall.join(' → '));
    ok(fall.every((v, i) => !i || v <= fall[i - 1] + 1e-3) && fall[fall.length - 1] < 0.99, '离开 B 区：风暴权重平滑回落');
    await page.evaluate(() => window.__dlc1.coastStorm.snap(0)); await page.waitForTimeout(3000);
    const back = await page.evaluate(() => window.__dlc1.coast71());
    ok(back.audio.dim > 0.95 && back.audio.gains.rain < 0.02 && !back.stormRT.hintShown, `回到 A 区：音乐还原 ${back.audio.dim}、雨声 ${back.audio.gains.rain}、井口提示收起`);
    // 离开海岸：天空球 / 光照还原
    await page.evaluate(() => window.__game.goMap('camp'));
    await page.waitForFunction(() => !window.__dlc1.coast71().here, null, { timeout: 60000, polling: 500 }).catch(() => {});
    await page.waitForTimeout(1500);
    const lv = await page.evaluate(() => { const g = window.__game; let sky = null; g.scene.children.forEach(o => { const u = o.material?.uniforms; if (u && 'top' in u && 'mid' in u) sky = o.visible; }); return { zone: g.zone, map: g.currentMap(), sky, here: window.__dlc1.coast71().here }; });
    ok(lv.sky === true && !lv.here, `离开海岸（${lv.zone} / ${lv.map}）：本体天空球恢复显示（${lv.sky}），海岸更新停止（here ${lv.here}）`);
  }
  const real = errors.filter(e => !NOISE.test(e));
  if (errors.length) console.log(`  [${Q}] 页面报错`, errors.length, '其中非环境噪声', real.length, real.slice(0, 5).join(' | '));
  ok(!real.length, `[${Q}] 0 报错（环境噪声 ${errors.length - real.length} 条不计）`);
  await b.close();
}
for (const q of QS) { try { await run(q); } catch (e) { ok(false, `[${q}] 运行失败：${e.message.slice(0, 300)}`); } }
console.log(`coast71_e2e ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
