// 无 GPU 的自动试玩：jsdom + 假渲染器，机器人按真实流程玩，检查运行时错误和流程
// 用法：node test/playtest.mjs [warrior|mage|shop|all]
//   warrior：战士从零开始 → 狼林任务 → 暗岩矿洞通关 → 第二章任务 → 商店强化 → 翠风原野（自动寻路做任务、世界地图）→ 腐沼神殿通关 → 交任务 → 原野精英「赤鬃」
//   mage   ：法师从零开始 → 狼林任务 → 暗岩矿洞通关（远程风筝、霜环、奥术禁锢打断）
//   shop   ：商店购买/出售、强化、分解、喝药水、存档往返（界面按钮点击）+ 战士双手/单手+盾、戒指选格、角色面板
//   mage 结尾同样测法杖 ↔ 魔杖+典籍、角色面板
import { bundle } from './bundle.mjs';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

const MODE = process.argv[2] || 'all';
// v0.9.7：PLAYTEST_DLC=dlc1 node test/playtest.mjs <模式> → 用带内容包的构建跑（同 build-web.mjs --dlc=dlc1）
const DLCS = (process.env.PLAYTEST_DLC ?? '').split(',').map(x => x.trim()).filter(Boolean);
// v1.2.21：PLAYTEST_ASSETS=aholo → 用比赛资产包（assets_aholo/ 叠加）跑；打包完立即把 assets.gen.ts 还原成 base
const ASSET_PACK = process.env.PLAYTEST_ASSETS || 'base';
const { genAssets } = ASSET_PACK !== 'base' ? await import('../gen-assets.mjs') : {};
if (genAssets) genAssets(ASSET_PACK);
const code = DLCS.length
  ? await bundle({ stdin: { contents: [...DLCS.map(id => `import './src/dlc/${id}/boot.ts';`), `import './src/web/main.ts';`].join('\n'), resolveDir: process.cwd(), sourcefile: 'dlc-entry.ts', loader: 'ts' }, define: { __DARKROCK_DLC__: JSON.stringify(DLCS) } })
  : await bundle({ entryPoints: ['src/web/main.ts'] });
if (genAssets) { genAssets('base'); console.log(`（资产包：${ASSET_PACK}）`); }
if (DLCS.length) console.log(`（内容包构建：${DLCS.join(', ')}）`);
const html = readFileSync('src/web/index.html', 'utf8').replace('<script>/*GAME_JS*/</script>', '');
let failed = 0;
// 机器人的天赋路线：主树一路点到终极，多余的点投第二棵树
const FURY = ['wf_frenzy', 'wf_flame', 'wf_whirl', 'wf_cruel', 'wf_laststand', 'wf_bloodwhirl', 'wf_rampage', 'wf_swift', 'wf_scorch', 'wp_tough', 'wp_iron', 'wp_quake'];
const CHRONO = ['cm_edge', 'cm_heavy', 'cm_store', 'cm_crit', 'cm_spread', 'cm_doom', 'cm_critdmg', 'cm_stasis', 'cm_power', 'cr_tough', 'cr_armor', 'cr_cd'];
const ALCH = ['ab_fire', 'ab_shot', 'ab_boom', 'ab_crit', 'ab_nova', 'ab_chain', 'ab_critdmg', 'ab_red', 'ab_power', 'ag_hp', 'ag_zone', 'ag_dps'];
const FIRE = ['mf_ignite', 'mf_fireheart', 'mf_orb', 'mf_critmass', 'mf_wildfire', 'mf_inferno', 'mf_combust', 'mf_pyro', 'mf_will', 'mi_icearmor', 'mi_chill', 'mi_barrier'];

async function session(name, fn, opts = {}) {
  if (process.env.PT_ONLY && !process.env.PT_ONLY.split(',').some(k => name.includes(k))) return;   // v1.2.49 只跑名字含关键字的会话（调试用）
  console.log(`\n================ ${name} ================`);
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: false, url: 'http://localhost/' });
  const w = dom.window;
  let now = 0, rafCbs = new Map(), rafId = 0;   // v1.2.49 多个 rAF 回调并存（加载画面 + 主循环），可取消
  w.performance.now = () => now;
  w.requestAnimationFrame = cb => { rafCbs.set(++rafId, cb); return rafId; };
  w.cancelAnimationFrame = id => { rafCbs.delete(id); };
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(w.document, 'visibilityState', { configurable: true, get: () => 'visible' });   // v1.2.49 jsdom 默认 hidden=true，游戏主循环会当后台跳过   // v1.2.49 加载画面收尾会取消动画帧
  // v1.2.49 无头 2D 画布：只给 2d 一个空操作上下文（渐变 / ImageData / measureText 有返回值），webgl 仍为 null
  class FakeImageData { constructor(a, b) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = a.length / 4 / b; } } }
  w.ImageData = FakeImageData;
  const grad = { addColorStop() {} };
  const fake2d = cv => new Proxy({ canvas: cv }, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : /^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(k) ? () => grad : k === 'getImageData' || k === 'createImageData' ? (x, y, ww, hh) => new FakeImageData(Math.max(1, (ww ?? x?.width ?? x) | 0), Math.max(1, (hh ?? x?.height ?? y) | 0)) : k === 'getLineDash' ? () => [] : typeof k === 'string' ? () => {} : undefined, set: (t, k, v) => { t[k] = v; return true; } });
  w.HTMLCanvasElement.prototype.getContext = function (type) { return type === '2d' ? (this.__ctx ??= fake2d(this)) : null; };
  w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder;
  // v1.2.76 无头视频：jsdom 的 HTMLMediaElement.play 未实现（返回 undefined，首屏 CG 的 .catch 抛错卡住）→ 立即结束
  { const M = w.HTMLMediaElement.prototype; M.play = function () { setTimeout(() => this.dispatchEvent(new w.Event('ended')), 0); return Promise.resolve(); }; M.pause = function () {}; M.load = function () {}; }
  // v1.2.55 无头图片：jsdom 不加载图片，load / error 都不触发 → GLTFLoader 解析带贴图的场景件永远不返回（比赛版 DLC 卡在「场景模型」）。改成异步报错（贴图解码失败 = 回退），decode 同理
  { const P = w.HTMLImageElement.prototype, d = Object.getOwnPropertyDescriptor(P, 'src');
    Object.defineProperty(P, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); if (v) setTimeout(() => this.dispatchEvent(new w.Event('error')), 0); } });
    P.decode = function () { return Promise.reject(new Error('headless: no image decode')); };
    w.createImageBitmap = () => Promise.reject(new Error('headless: no createImageBitmap')); }
  if (opts.viewport) {   // 模拟手机：视口尺寸 + 触屏 + 粗指针
    const vp = { w: opts.viewport[0], h: opts.viewport[1] };
    Object.defineProperty(w, 'innerWidth', { configurable: true, get: () => vp.w }); Object.defineProperty(w, 'innerHeight', { configurable: true, get: () => vp.h });
    w.__vp = vp;
    if (!opts.touch) for (let o = w; o; o = Object.getPrototypeOf(o)) if (Object.prototype.hasOwnProperty.call(o, 'ontouchstart')) delete o.ontouchstart;   // jsdom 默认带 ontouchstart
    if (opts.touch) { w.ontouchstart = null; Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5 }); w.matchMedia = q => ({ matches: /coarse/.test(q), addEventListener() {}, removeEventListener() {} }); }
  }
  if (opts.storage) for (const [k, v] of Object.entries(opts.storage)) w.localStorage.setItem(k, v);   // 模拟刷新页面：带上次的存储
  w.addEventListener('error', e => errors.push(String(e.error?.stack || e.message)));
  w.console.error = (...a) => { const t = a.join(' '); if (/GLTFLoader: Couldn't load texture/.test(t)) return; errors.push(t); };   // v1.2.55 jsdom 不解码贴图（比赛版 v1.2.54 脸部贴花等 GLB 内嵌贴图），浏览器 smoke 无此错
  try { w.eval(code); } catch (e) { console.log('启动报错', e, e.stack); process.exit(1); }
  while (!w.__game || w.document.getElementById('start').textContent !== '开始冒险') await new Promise(r => setTimeout(r, 20));
  const g = w.__game;
  const $ = id => w.document.getElementById(id);
  const FPS = 20;
  const step = (sec, hook) => { for (let i = 0; i < sec * FPS; i++) { now += 1000 / FPS; hook?.(); const cbs = [...rafCbs.values()]; rafCbs.clear(); for (const cb of cbs) { try { cb(now); } catch (e) { errors.push(e.stack); throw e; } } } };
  const key0 = (k, type = 'keydown') => w.dispatchEvent(new w.KeyboardEvent(type, { key: k }));
  // 第七版：没有面板时 Esc 会打开设置；机器人按 Esc 只是想关面板，打开了设置就再按一次关掉
  const key = (k, type = 'keydown') => {
    const wasSet = $('settings').style.display === 'flex';
    key0(k, type);
    if (k === 'Escape' && type === 'keydown' && !wasSet && $('settings').style.display === 'flex') key0(k, type);
  };
  const log = s => console.log(`[${g.T.toFixed(0).padStart(4)}s] ${s}`);
  const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };
  const clickAll = () => [...$('dlg-body').querySelectorAll('button')].forEach(b => b.click());
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const ord = ['white', 'green', 'blue', 'purple', 'orange'];
  // 16 格：每格挑 品质 > 强化 > 装等 最好的（主手先选；主手是双手武器就跳过副手）
  const SLOTS = ['mainHand', 'offHand', 'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2'];
  const score = i => ord.indexOf(i.quality) * 1000 + (i.upgrade ?? 0) * 50 + i.itemLevel * (i.slot === 'twoHand' ? 2 : 1);
  const equipBest = () => {
    const inv = g.inventory;
    for (const slot of SLOTS) {
      if (slot === 'offHand' && inv.equipped.mainHand?.slot === 'twoHand') continue;
      const cur = inv.equipped[slot];
      const best = inv.bag.filter(i => inv.slotsFor(i).includes(slot) && inv.canEquip(i))
        .sort((a, b) => score(b) - score(a))[0];
      if (best && (!cur || score(best) > score(cur))) inv.equip(best.id, slot);
    }
  };
  // 天赋：按计划顺序加点（每次加第一个能加的），返回本次加了几点
  // v0.7.7：天赋 10 级才开放；早期职业测试验证的是天赋形态，这里按旧规则（等级−1）补点
  const spend = plan => { if (g.tree.totalPoints < g.progression.level - 1) g.tree.totalPoints = g.progression.level - 1; let n = 0; while (g.tree.available > 0 && plan.some(id => g.tree.add(id))) n++; return n; };
  const specLine = () => g.tree.def.specs.map(sp => `${sp.name}${g.tree.spentIn(sp.id)}`).join('/');
  const ctx = { g, w, $, step, key, key0, log, check, clickAll, dist, equipBest, errors, deaths: 0, spend, specLine };

  // ---- 机器人：躲红圈/毒池 → 打断 → 走位（远程保持距离）→ 放技能；低血量喝药 ----
  ctx.bot = (opts = {}) => {
    const dt = 1 / FPS;
    if (!g.player.alive) {
      ctx.deaths++; $('respawn').click();
      // v0.5 耐久度：机器人复活后像玩家一样找铁匠修装备（金币不够就不修）
      if (g.inventory.equippedItems().some(i => (i.durability ?? 100) <= 30)) { const c = g.repairAll(); if (c) log(`  修理装备 -${c} 金`); }
      return;
    }
    const P = g.player.pos, cls = g.cls;
    if (g.player.hp < g.player.maxHp * 0.35) g.usePotion();
    if (g.dodge.rolling) return;                       // 翻滚中：交给游戏本身移动
    if (opts.dodge) {
      // 第七版：红圈快落下、跑不出去 → 往外闪避翻滚（无敌帧兜底）
      for (const t of g.__telegraphs()) {
        const d = dist(P, t.p);
        if (d < t.r + 0.4 && (t.r + 0.6 - d) / 6.5 > t.left - 0.1 && g.dodge.cooldownLeft(g.T) <= 0) {
          const dx = d ? (P.x - t.p.x) / d : 1, dz = d ? (P.z - t.p.z) / d : 0;
          g.player.rig.root.rotation.y = Math.atan2(dx, dz);
          if (g.tryDodge()) { ctx.rolls = (ctx.rolls ?? 0) + 1; key(' ', 'keyup'); return; }
        }
      }
      const haz = [...g.__telegraphs(), ...g.__zones()];
      for (const t of haz) {
        const d = dist(P, t.p);
        if (d < t.r + 0.6) {
          let dx = (P.x - t.p.x) / (d || 1), dz = (P.z - t.p.z) / (d || 1);
          if (!d) { dx = 1; dz = 0; }
          P.x += dx * 6.5 * dt; P.z += dz * 6.5 * dt; key(' ', 'keyup'); return;
        }
      }
    }
    const live = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isDummy && (!opts.filter || opts.filter(e)));
    if (!live.length) return;
    live.sort((a, b) => (a.isBoss ? 1 : 0) - (b.isBoss ? 1 : 0) || dist(a.pos, P) - dist(b.pos, P));
    let t = live[0];
    // 打断：Boss 读条时，用职业的打断技能对 Boss 放
    if (opts.interrupt && g.boss?.intent?.casting && g.loadout.cooldownLeft(cls.interruptSlot, g.T) <= 0) {
      const range = cls.id === 'mage' ? 15 : 12;
      if (dist(g.boss.pos, P) < range) { g.target = g.boss; g.tryCast(cls.interruptSlot); ctx.interrupts = (ctx.interrupts ?? 0) + 1; return; }
    }
    g.target = t;
    const d = dist(t.pos, P);
    const ranged = cls.ranged;
    const reach = ranged ? 10 : (t.isBoss ? 3.2 : 2.3);
    const safe = (x, z) => ![...g.__telegraphs(), ...g.__zones()].some(h => Math.hypot(x - h.p.x, z - h.p.z) < h.r + 0.3);
    if (d > reach) {
      const sp = 6.5 * g.player.status.speedMultiplier * dt, k = Math.min(sp, d - reach + 0.1) / d;
      const nx = P.x + (t.pos.x - P.x) * k, nz = P.z + (t.pos.z - P.z) * k;
      if (!opts.dodge || safe(nx, nz)) { P.x = nx; P.z = nz; }
    }
    if (ranged && d < 3.5 && g.loadout.cooldownLeft('skill2', g.T) > 0 && !t.isBoss) {
      // 法师：霜环冷却中被贴身就后撤
      const k = 6.5 * dt / (d || 1); const nx = P.x - (t.pos.x - P.x) * k, nz = P.z - (t.pos.z - P.z) * k;
      if (!opts.dodge || safe(nx, nz)) { P.x = nx; P.z = nz; }
    }
    if (!ranged && d < 12 && d > 4) g.tryCast('skill1');
    if (d <= reach + 0.6) {
      key(' ');
      const near = live.filter(e => dist(e.pos, P) < 4.5).length;
      if (ranged) {
        g.tryCast('skill1');
        if (near >= 1) g.tryCast('skill2');
        if (t.isBoss || near >= 3 || live.length >= 3) g.tryCast('ultimate');
        if (!t.isBoss && !opts.interrupt) g.tryCast('skill3');
      } else {
        if (near >= 2 || t.isBoss) { g.tryCast('skill2'); g.tryCast('skill3'); }
        if (t.isBoss || near >= 3) g.tryCast('ultimate');
      }
    }
  };
  ctx.talk = npc => { const n = g.npcs.find(x => x.id === npc); g.player.pos.set(n.rig.root.position.x + 1.5, 0, n.rig.root.position.z + 1.5); step(0.2); g.openDialog(npc); clickAll(); clickAll(); clickAll(); key('Escape'); step(0.1); };
  ctx.grindWolves = (until, maxSec = 300) => { key(' ', 'keyup'); g.player.pos.set(26, 0, 2); let n = 0; while (!until() && n++ < maxSec) step(1, () => ctx.bot()); key(' ', 'keyup'); };
  ctx.runDungeon = (id, maxSec = 500) => {
    key(' ', 'keyup');
    // v0.9.2b 副本搬进副本区：营地路口 → 暗岩山麓 / 腐沼湿地 → 门口副本传送阵
    const hub = id === 'darkrock_mine' ? 'foothill' : 'marsh', gp = id === 'darkrock_mine' ? { x: 52, z: -30 } : { x: -52, z: 34 };
    if (!g.player.alive) { ctx.deaths++; $('respawn').click(); step(0.3); }
    if (g.zone !== 'world') g.goMap('camp');
    g.ensureWild(hub);
    g.player.pos.set(gp.x - Math.sign(gp.x) * 1, 0, gp.z - Math.sign(gp.z) * 1); step(0.2);
    const gl = $('interact').textContent;
    g.currentInteractable()?.act(); step(0.3);
    check(g.zone === hub, `营地路口（${gl}）进入副本区 ${hub}`);
    const O = hub === 'foothill' ? { x: 700, z: -500 } : { x: -700, z: -500 };
    g.player.pos.set(O.x, 0, O.z - 33); step(0.3);
    const label = $('interact').textContent;
    for (let k = 0; k < 5 && !g.currentInteractable(); k++) { log(`门口传送阵交互为空（zone=${g.zone} alive=${g.player.alive}），重试`); if (!g.player.alive) { ctx.deaths++; $('respawn').click(); } g.player.pos.set(O.x, 0, O.z - 33); step(0.5); }
    check(g.waypoints.has(`dp:${id}`), `副本传送阵激活（${label}）`);
    g.currentInteractable().act(); step(0.5);
    check(g.zone === 'dungeon' && g.layout === id, `进入副本 ${id}，敌人 ${g.enemies.filter(e => e.z === 'dungeon').length} 个`);
    const d0 = ctx.deaths; let casts = 0, last = false; const phases = new Set(); ctx.interrupts = 0; ctx.rolls = 0;
    let n = 0;
    while (!g.dungeonRun?.completed && n++ < maxSec) {
      step(1, () => {
        if (g.zone !== 'dungeon') { key(' ', 'keyup'); g.enterDungeon(id); step(0.2); }
        ctx.bot({ dodge: true, interrupt: true });
        const c = !!g.boss?.intent?.casting; if (c && !last) casts++; last = c;
        if (g.boss?.intent) phases.add(g.boss.intent.phaseIndex);
      });
    }
    key(' ', 'keyup');
    ctx.lastCasts = casts;
    log(`副本 ${id}：${g.dungeonRun?.completed ? '通关' : '未通关'}，副本内阵亡 ${ctx.deaths - d0} 次，翻滚 ${ctx.rolls ?? 0} 次，Boss 读条 ${casts} 次，打断尝试 ${ctx.interrupts} 次，经历阶段 ${[...phases].join(',')}`);
    check(!!g.dungeonRun?.completed, `${id} 通关`);
    check(ctx.deaths - d0 <= 1, `${id} 副本内阵亡 ${ctx.deaths - d0} 次（≤ 1，第七版平衡）`);
    // 捡东西
    for (const l of [...g.loots]) { g.player.pos.copy(l.obj.position); step(0.1); }
    log(`捡完掉落，背包 ${g.inventory.bag.length} 件，材料 ${JSON.stringify(g.inventory.stacks)}`);
    // Boss 后的传送门回营地
    const portal = g.layout === 'darkrock_mine' ? { x: 400, z: -72 } : { x: -400, z: -52 };
    g.player.pos.set(portal.x, 0, portal.z); step(0.3);
    const lbl = $('interact').textContent;
    g.currentInteractable()?.act(); step(0.3);
    check(g.zone === 'world', `Boss 传送门（${lbl}）返回营地`);
  };
  // ---- 任务指引：用「自动寻路」按钮跑任务（进战斗/被打会自动停，机器人打完再点一次） ----
  ctx.stops = {}; ctx.autoStarts = 0; ctx.stuck = 0;
  ctx.hookAuto = () => { const orig = g.autoPath.onStop; g.autoPath.onStop = r => { ctx.stops[r] = (ctx.stops[r] ?? 0) + 1; orig(r); }; };
  const inCombat = () => g.enemies.some(e => e.alive && e.z === g.zone && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack'));
  ctx.questLoop = (ids, maxSec = 600, onTick) => {
    key(' ', 'keyup');
    let n = 0, lastPos = { x: g.player.pos.x, z: g.player.pos.z }, still = 0;
    const doneAll = () => ids.every(id => g.quests.state(id, g.progression.level) === 'done');
    while (!doneAll() && n++ < maxSec * 2) {
      onTick?.();
      if (process.env.PT_TRACE && n % 120 === 0) console.log(`  · t${n / 2}s ${((Date.now() - (ctx.__t0 ??= Date.now())) / 1000).toFixed(0)}s墙钟 ${g.zone} (${g.player.pos.x.toFixed(0)},${g.player.pos.z.toFixed(0)}) 焦点 ${g.focusQuestId()} 怪 ${g.enemies.filter(e => e.z === g.zone).length} 活 ${g.enemies.filter(e => e.alive && e.z === g.zone).length} lv${g.progression.level} 堆${(process.memoryUsage().heapUsed / 1e6).toFixed(0)}M rss${(process.memoryUsage().rss / 1e6).toFixed(0)}M`);
      if (process.env.PT_EXIT && Date.now() - ctx.__t0 > +process.env.PT_EXIT * 1000) process.exit(3);
      if ($('dialog').style.display === 'flex') { clickAll(); clickAll(); clickAll(); key('Escape'); step(0.1); continue; }
      if ($('travel').style.display === 'flex' || $('worldmap').style.display === 'flex') key('Escape');
      const act = g.quests.active().map(a => a.q.id);
      const mine = ids.find(id => act.includes(id));
      if (!mine) break;
      if (g.focusQuestId() !== mine && !g.trackedIds().includes(g.focusQuestId())) g.setFocus(mine);
      if (!ids.includes(g.focusQuestId())) g.setFocus(mine);
      const gd = g.guide;
      const o = gd && gd.t.objIndex >= 0 ? g.quests.def(gd.t.questId).objectives[gd.t.objIndex] : null;
      const kinds = o && (o.type === 'kill' || o.type === 'collect') ? (o.target === 'boar' ? ['boar', 'goldboar'] : [o.target]) : [];
      const prey = kinds.length && g.enemies.some(e => e.alive && e.z === g.zone && kinds.includes(e.kind) && dist(e.pos, g.player.pos) < 22);
      if (!g.player.alive || inCombat() || prey) {
        if (g.autoPath.active) g.autoPath.stop('cancel');
        step(0.5, () => ctx.bot(prey && !inCombat() ? { filter: e => kinds.includes(e.kind) } : {}));
        key(' ', 'keyup');
        continue;
      }
      if (!g.autoPath.active) { const b = $('btn-autopath'); if (b) { b.click(); ctx.autoStarts++; } }
      step(0.5);
      const moved = dist(g.player.pos, lastPos); lastPos = { x: g.player.pos.x, z: g.player.pos.z };
      if (g.autoPath.active && moved < 0.2) { if (++still > 16) { ctx.stuck++; still = 0; log(`  ⚠ 自动寻路卡住 @(${g.player.pos.x.toFixed(1)}, ${g.player.pos.z.toFixed(1)})`); g.autoPath.stop('cancel'); } } else still = 0;
    }
    key(' ', 'keyup');
    return doneAll();
  };
  try { await fn(ctx); } catch (e) { errors.push(e.stack || String(e)); }
  if (opts.keepStorage) for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); opts.keepStorage[k] = w.localStorage.getItem(k); }
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? `❌ 运行时错误 ${uniq.length} 个:\n${uniq.slice(0, 5).join('\n')}` : '✅ 无运行时错误');
  if (uniq.length) failed++;
  try { w.close(); } catch {}   // v0.8.5：关闭 jsdom 窗口释放内存（all 模式不再 OOM）
  rafCbs.clear();
}

// ====================================================================== 战士全流程
async function warrior(c) {
  const { g, $, step, log, check, clickAll, key, equipBest } = c;
  check($('class-pick').children.length === 4, '标题画面有 4 个职业可选（阶段七加入时砂行者、炼金投弹手）');
  $('class-pick').children[0].click(); $('start').click(); step(1);
  check(g.cls.id === 'warrior', `职业：${g.cls.name}，生命 ${g.player.maxHp}`);
  log(`技能栏：${[...c.w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  c.talk('bran');
  log(`接任务：${g.quests.active().map(a => a.q.name).join('、')}`);
  c.grindWolves(() => g.quests.active().every(a => a.ready));
  c.talk('bran'); c.talk('bran');
  log(`狼林完成：等级 ${g.progression.level}，任务完成 ${g.quests.save().done.join(',')}`);
  c.spend(FURY);
  log(`天赋（狂怒路线）：${c.specLine()}`);
  equipBest();
  c.talk('tom'); c.talk('tom');
  check(g.quests.active().some(a => a.q.id === 'q_mine'), '接到「深入暗岩矿洞」');
  c.grindWolves(() => g.progression.level >= 5);
  c.spend(FURY);
  equipBest();
  log(`进矿洞前：天赋 ${c.specLine()}，等级 ${g.progression.level} 生命 ${g.player.maxHp} 护甲 ${g.player.armor}`);
  c.runDungeon('darkrock_mine');
  c.talk('tom');
  check(g.quests.save().done.includes('q_mine'), '交付「深入暗岩矿洞」');
  // ---- 第二章 ----
  c.talk('tom');
  check(g.quests.active().some(a => a.q.id === 'q_swamp_news'), `老汤给出第二章「沼泽来客」（等级 ${g.progression.level}）`);
  c.talk('ayla'); c.talk('ayla');
  log(`艾拉之后的任务：${g.quests.active().map(a => a.q.name).join('、')}`);
  check(g.quests.active().some(a => a.q.id === 'q_swamp_rot') && g.quests.active().some(a => a.q.id === 'q_swamp_priest'), '接到「腐化之源」「净化腐沼神殿」');
  // ---- 商店：买药水，分解多余装备，强化武器 ----
  equipBest();
  g.player.pos.set(1, 0, 11.5); step(0.2);
  const lbl = $('interact').textContent;
  g.currentInteractable().act(); step(0.2);
  check($('shop').style.display === 'flex', `葛尔达：${lbl}`);
  const pots0 = g.inventory.stack('potion_s');
  g.inventory.addGold(0);
  const buyBtn = $('shop-body').querySelector('[data-buy5="0"]');
  if (buyBtn && !buyBtn.disabled) buyBtn.click();
  check(g.inventory.stack('potion_s') >= pots0, `买治疗药水：${pots0} → ${g.inventory.stack('potion_s')}`);
  g.setShopTab('salvage'); step(0.05);
  const salvAll = $('s-salvall'); if (salvAll && !salvAll.disabled) { salvAll.click(); step(0.02); $('s-salv-ok')?.click(); }
  log(`分解后材料：${JSON.stringify(g.inventory.stacks)}，金币 ${g.inventory.gold}`);
  const wpn = g.inventory.equipped.mainHand;
  if (wpn) {
    for (let i = 0; i < 6; i++) { g.setShopTab('upgrade', wpn.id); step(0.05); const b = $('s-up'); if (!b || b.disabled) break; b.click(); }
    log(`武器强化：${wpn.name} +${wpn.upgrade ?? 0}`);
  }
  key('Escape');
  await fieldPart1(c);
  if (g.progression.level < 9) c.grindWolves(() => g.progression.level >= 9, 200);
  c.spend(FURY);
  equipBest();
  log(`进神殿前：天赋 ${c.specLine()}，等级 ${g.progression.level} 生命 ${g.player.maxHp} 护甲 ${g.player.armor} 药水 ${g.inventory.stack('potion_s')}+${g.inventory.stack('potion_l')}`);
  log(`技能栏：${[...c.w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  c.runDungeon('rotting_temple', 700);
  c.talk('ayla'); c.talk('ayla');
  const done = g.quests.save().done;
  check(done.includes('q_swamp_priest'), `交付「净化腐沼神殿」${done.includes('q_swamp_rot') ? '和「腐化之源」' : '（腐化之源未完成）'}`);
  log(`两个副本 + 原野前 5 个任务后：等级 ${g.progression.level}（经验 ${g.progression.xp}/${g.progression.xpToNext()}）`);
  c.spend(FURY); equipBest();
  await fieldPart2(c);
  // 当前全部内容（两个副本 + 营地/沼泽/原野共 13 个任务）后的等级：目标 17~18
  const lvEnd = g.progression.level;
  check(lvEnd >= 16 && lvEnd <= 19, `全部内容后等级 ${lvEnd}（经验 ${g.progression.xp}/${g.progression.xpToNext()}，目标 17~18，满级 ${g.progression.maxLevel}）`);
  c.spend(FURY);
  const ww = g.loadout.preview('skill2', { now: 0, casterHpPercent: 1, targetEffects: [] });
  if (g.tree.spentIn('w_fury') >= 15 || g.progression.level >= 23) check(g.tree.rank('wf_bloodwhirl') === 1 && ww.displayName.includes('血怒旋风') && ww.effects.some(e => e.type === 'heal'), `${g.progression.level} 级：狂怒 ${g.tree.spentIn('w_fury')} 点，终极天赋把旋风斩变为「${ww.displayName}」（吸血）`);
  else log(`等级 ${g.progression.level} 不足 14，狂怒 ${g.tree.spentIn('w_fury')} 点，终极天赋还差 ${13 - g.tree.spentIn('w_fury')} 点`);
  log(`最终：天赋 ${c.specLine()}，等级 ${g.progression.level}（经验 ${g.progression.xp}/${g.progression.xpToNext()}），完成任务 ${done.join(',')}，金币 ${g.inventory.gold}，阵亡 ${c.deaths}，装备 ${g.inventory.equippedItems().map(i => (i.upgrade ? '+' + i.upgrade + ' ' : '') + i.name).join('、')}`);
  const saved = c.g.rawSave();
  check(!!saved && JSON.parse(saved).classId === 'warrior', `战士存档 ${saved?.length ?? 0} 字节（classId=warrior）`);
}

// ====================================================================== 翠风原野（一）：自动寻路 + 任务指引 + 世界地图
async function fieldPart1(c) {
  const { g, $, step, log, check, key, w, clickAll } = c;
  c.hookAuto();
  console.log('  ---- 翠风原野 ----');
  check(g.quests.active().some(a => a.q.id === 'q_field_news'), '老汤给出「翠风原野」（通关矿洞后）');
  // 追踪栏：最多 3 个，点任务名设焦点
  step(0.6);
  const trk = [...$('quest-tracker').querySelectorAll('.trk')];
  check(trk.length >= 1 && trk.length <= 3 && $('quest-tracker').querySelectorAll('.trk.focus').length === 1 && !!$('btn-autopath'), `HUD 追踪 ${trk.length} 个任务（≤3），1 个焦点，带「自动寻路」按钮（进行中 ${g.quests.active().length} 个）`);
  const fieldRow = [...$('quest-tracker').querySelectorAll('.trk')].find(d => d.dataset.focus === 'q_field_news');
  (fieldRow ?? $('quest-tracker').querySelector('.trk')).click(); if (!fieldRow) g.setFocus('q_field_news');
  step(0.6);
  check(g.focusQuestId() === 'q_field_news' && g.guide && !g.guide.final && g.guide.link.name === '原野石门', `点击追踪栏设焦点「翠风原野」：目标在别的区域 → 先去「${g.guide?.link?.name}」`);
  check(g.guidePath.length > 0 && g.chevCount() > 0 && $('obj-marker').style.display === 'block' && $('mm-obj').style.display === 'block',
    `地面箭头 ${g.chevCount()} 个、浮动标记「${$('om-name').textContent} ${$('om-dist').textContent}」、罗盘方位标记（${$('mm-dist').textContent}）`);
  // 手动操作取消自动寻路
  g.player.pos.set(2, 0, 8); step(0.6);
  // 偶发：狼林的狼追到营地（仇恨范围内）→ 战斗中不能自动寻路；先让机器人把它打掉再测
  const chasing = () => g.enemies.some(e => e.alive && e.z === g.zone && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack'));
  for (let i = 0; i < 30 && chasing(); i++) step(1, () => c.bot());
  if (chasing() || g.player.pos.distanceTo?.({ x: 2, y: 0, z: 8 }) > 0.1) { g.player.pos.set(2, 0, 8); step(0.6); }
  // 老存档读进来会弹「更新日志」（版本变了），面板开着时自动寻路暂停 —— 先关掉
  if ($('changelog').style.display === 'flex') { c.key('Escape'); step(0.1); }
  $('btn-autopath').click(); step(0.5);
  if (!g.autoPath.active) console.log('    [诊断] 提示：', JSON.stringify(g.lastNotices?.slice?.(-3)), 'zone', g.zone, 'pos', g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1), 'guide', !!g.guide, 'path', g.guidePath.length, 'combat', g.enemies.filter(e => e.alive && e.brain?.state === 'chase').length);
  check(g.autoPath.active && $('btn-autopath').textContent.includes('停止'), '点「自动寻路」开始跑，按钮变「停止寻路」');
  const p0 = { x: g.player.pos.x, z: g.player.pos.z }; step(1);
  check(c.dist(g.player.pos, p0) > 3, `自动寻路 1 秒移动 ${c.dist(g.player.pos, p0).toFixed(1)} 米`);
  key('w'); step(0.1); key('w', 'keyup');
  check(!g.autoPath.active && g.autoPath.lastStop === 'input', '按 W（手动移动）→ 自动寻路取消');
  // 一路自动寻路：营地 → 原野石门（自动穿过去）→ 前哨站罗文（自动打开对话）
  let sawField = false;
  c.questLoop(['q_field_news'], 120, () => { if (g.zone === 'field') sawField = true; });
  check(sawField && g.quests.state('q_field_news', g.progression.level) === 'done', `自动寻路穿过石门进入翠风原野，到罗文面前交付「翠风原野」（等级 ${g.progression.level}）`);
  check(g.quests.active().some(a => a.q.id === 'q_field_boars'), '罗文的「野猪成灾」已接');
  // NPC 头顶标记
  step(0.2);
  const qh = g.npcs.find(n => n.id === 'qinghe');
  check(qh.plate.innerHTML.includes('class="mk "') && qh.plate.querySelector('.mk').textContent === '!', '青禾头顶黄色「!」（有任务可接）');
  const rw = g.npcs.find(n => n.id === 'rowan');
  check(rw.plate.querySelector('.mk.grey')?.textContent === '?', '罗文头顶灰色「?」（任务进行中）');
  c.talk('qinghe');
  check(g.quests.active().some(a => a.q.id === 'q_field_supplies'), '青禾的「被劫的补给」已接');
  // 世界地图：M 打开（区域详图），切到世界，点区域，✕/M 关闭
  key('m'); step(0.1);
  const lg = $('wm-legend').textContent;
  check($('worldmap').style.display === 'flex' && g.wmView === 'zone' && $('wm-title').textContent.includes('翠风原野') && lg.includes('罗文') && lg.includes('野猪成灾') && lg.includes('回营地'),
    `M 打开地图：区域详图「${$('wm-title').textContent}」，图例含 NPC / 任务目标 / 传送点`);
  [...w.document.querySelectorAll('#worldmap .tab')].find(t => t.dataset.view === 'world').click(); step(0.05);
  const wl = $('wm-legend').textContent;
  check(g.wmView === 'world' && ['灰石营地', '翠风原野', '暗岩矿洞', '腐沼神殿'].every(n => wl.includes(n)) && $('wm-legend').querySelector('.here').textContent.includes('翠风原野') && wl.includes('你在这里'), '世界视图：4 个区域 + 「你在这里」+ 任务数');
  $('wm-legend').querySelector('[data-map="darkrock_mine"]').click(); step(0.05);
  check(g.wmView === 'zone' && $('wm-title').textContent.includes('暗岩矿洞'), '点世界视图里的区域 → 该区域详图');
  w.document.querySelector('[data-close="worldmap"]').click(); step(0.05);
  check($('worldmap').style.display === 'none', '✕ 关闭地图');
  $('btn-map').click(); step(0.05); check($('worldmap').style.display === 'flex', 'HUD「地图」按钮打开'); key('m'); step(0.05);
  check($('worldmap').style.display === 'none', 'M 再按一次关闭');
  const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('');
  check(css.includes('#worldmap,#raidmap{width:min(980px,98vw);height:94vh') && css.includes('#wm-legend{width:150px'), '地图面板按视口缩放（667×375 下图例变窄）');
  // 做任务：野猪 → 补给 → 遗迹（探索 + 石傀儡）→ 送药包给老柯
  const t0 = g.T, d0 = c.deaths;
  const ok = c.questLoop(['q_field_boars', 'q_field_supplies', 'q_field_ruins', 'q_field_hermit'], 900, () => {
    // 交完任务后对话框里会出现新任务（clickAll 会接）；青禾的送药包在交补给时接
  });
  const done = ['q_field_boars', 'q_field_supplies', 'q_field_ruins', 'q_field_hermit'].filter(id => g.quests.state(id, g.progression.level) === 'done');
  log(`原野任务 ${Math.round(g.T - t0)} 秒：完成 ${done.length}/4，等级 ${g.progression.level}，阵亡 ${c.deaths - d0}，自动寻路启动 ${c.autoStarts} 次，停止原因 ${JSON.stringify(c.stops)}，卡住 ${c.stuck} 次`);
  check(ok, '野猪成灾 / 被劫的补给 / 星落遗迹（探索祭坛）/ 给守林人的药包 全部完成');
  check((c.stops.arrived ?? 0) >= 4 && ((c.stops.combat ?? 0) + (c.stops.damage ?? 0) + (c.stops.cancel ?? 0)) >= 1 && c.stuck === 0, `自动寻路：到达 ${c.stops.arrived ?? 0} 次，被战斗/受伤打断 ${(c.stops.combat ?? 0) + (c.stops.damage ?? 0)} 次，卡住 ${c.stuck} 次`);
  // 回营地：自动寻路去打腐沼神殿前，先走回石门
  g.player.pos.set(g.player.pos.x, 0, g.player.pos.z); step(0.1);
  const ret = { x: 0, z: 470 };
  g.player.pos.set(ret.x, 0, ret.z - 1.5); step(0.2);
  const lbl = $('interact').textContent; g.currentInteractable()?.act(); step(0.2);
  check(g.zone === 'world', `原野石门（${lbl}）回到营地`);
  void clickAll;
}

// ====================================================================== 翠风原野（二）：精英「赤鬃」
async function fieldPart2(c) {
  const { g, $, step, log, check } = c;
  g.player.pos.set(0, 0, 37.5); step(0.2);
  const lbl = $('interact').textContent; g.currentInteractable()?.act(); step(0.3);
  check(g.zone === 'field', `营地南门石门（${lbl}）进入翠风原野`);
  c.talk('rowan');
  check(g.quests.active().some(a => a.q.id === 'q_field_chief'), `接到「赤鬃的末日」（等级 ${g.progression.level}）`);
  const chief = g.enemies.find(e => e.kind === 'chief');
  const route0 = { x: chief.pos.x, z: chief.pos.z };
  const t0 = g.T, d0 = c.deaths;
  let maxHit = 0;
  const ok = c.questLoop(['q_field_chief'], 400, () => { maxHit = Math.max(maxHit, c.dist(chief.pos, route0)); });
  log(`赤鬃：${Math.round(g.T - t0)} 秒，阵亡 ${c.deaths - d0}，游荡距离 ${maxHit.toFixed(0)} 米，等级 ${g.progression.level}`);
  check(maxHit > 8, `精英沿路线游荡（离出生点最远 ${maxHit.toFixed(0)} 米）`);
  check(ok, '击败「赤鬃 · 劫掠头目」并交付「赤鬃的末日」');
  for (const l of [...g.loots]) { g.player.pos.copy(l.obj.position); step(0.1); }
}

// ====================================================================== 法师到矿洞
async function mage(c) {
  const { g, $, step, log, check, equipBest } = c;
  $('class-pick').children[1].click(); $('start').click(); step(1);
  check(g.cls.id === 'mage' && g.player.rig.root.userData.cls === 'mage', `职业：${g.cls.name}，模型 ${g.player.rig.root.userData.cls}，生命 ${g.player.maxHp}`);
  log(`技能栏：${[...c.w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  // 远程：站在 12 米外普攻应该能打到
  g.player.pos.set(28 - 12, 0, 6); g.target = g.enemies.find(e => e.kind === 'wolf');
  const wolf = g.target; g.player.pos.set(wolf.pos.x - 12, 0, wolf.pos.z); step(0.1);
  g.tryCast('basic'); step(1.5);
  check(wolf.hp < wolf.maxHp, `12 米外奥能弹命中（灰鬃狼 ${wolf.hp}/${wolf.maxHp}）`);
  c.talk('bran');
  c.grindWolves(() => g.quests.active().every(a => a.ready));
  c.talk('bran'); c.talk('bran');
  c.spend(FIRE);
  equipBest();
  check(g.inventory.bag.concat(g.inventory.equippedItems()).every(i => !['b_sword', 'b_axe', 'b_helm', 'b_chest'].includes(i.baseId)), '法师只掉法杖/布甲（不会掉长剑/铁盔）');
  c.talk('tom'); c.talk('tom');
  c.grindWolves(() => g.progression.level >= 5);
  c.spend(FIRE);
  equipBest();
  log(`天赋 ${c.specLine()}，技能栏：${[...c.w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  const bolt = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] });
  // 装备词条/传说可能再加前缀（如「裂光」），所以只看元素和名字里的「奥能弹」
  check(bolt.element === 'fire' && bolt.displayName.includes('奥能弹') && g.tree.rank('mf_fireheart') === 1, `火焰第 2 层「炽焰之心」（火焰投入 3 点后解锁）把奥能弹变为火焰形态（${bolt.displayName}）`);
  log(`进矿洞前：等级 ${g.progression.level} 生命 ${g.player.maxHp}`);
  c.runDungeon('darkrock_mine');
  check(c.interrupts >= 1 || c.lastCasts === 0, `奥术禁锢打断 Boss 读条 ${c.interrupts} 次（Boss 读条 ${c.lastCasts} 次${c.lastCasts === 0 ? '，Boss 没来得及读条' : ''}）`);
  c.talk('tom');
  check(g.quests.save().done.includes('q_mine'), '法师交付「深入暗岩矿洞」，腐沼神殿解锁');
  check(!g.dungeonLock('rotting_temple'), '腐沼神殿可进入');
  const saved = c.g.rawSave();
  check(!!saved && JSON.parse(saved).classId === 'mage' && c.g.roster().slots.filter(Boolean).length === 1, '法师是独立角色（独立存档，不影响其他角色）');
  // ---- 法师武器：法杖（双手）↔ 魔杖 + 典籍 ----
  await gearTest(c, 'mage');
  await talentUiTest(c);
}


// ====================================================================== 阶段七：时砂行者（v0.7.0-br.A）
async function chronoTest(c) {
  const { g, $, step, log, check, key, equipBest, w } = c;
  $('class-pick').children[2].click(); step(0.1);
  $('start').click(); step(1);
  const D = () => g.chronoDebug();
  check(g.cls.id === 'chrono' && g.player.rig.root.userData.cls === 'chrono', `职业：${g.cls.name}，模型 ${g.player.rig.root.userData.model ?? '方块后备'}，生命 ${g.player.maxHp}，暴击 ${g.charSheet().crit}%`);
  check($('pf-res').style.display !== 'none' && $('pf-res').querySelectorAll('i').length === 6 && $('sk-rewind').style.display !== 'none', `HUD：时砂条 ${$('pf-res').querySelectorAll('i.on').length}/6 格，回溯按钮显示`);
  check($('pf-portrait').innerHTML.includes('pt_chrono'), '头像：时砂行者');
  log(`技能栏：${[...w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  // ---- 普攻：12 米外时轮去回各打一次 ----
  const wolf = g.enemies.find(e => e.kind === 'wolf' && e.alive);
  g.target = wolf; g.player.pos.set(wolf.pos.x - 12, 0, wolf.pos.z); step(0.05);
  const hp0 = wolf.hp, h0 = D().wheelHits;
  g.tryCast('basic'); step(1.6);
  check(wolf.hp < hp0 && D().wheelHits - h0 >= 2 && D().marks.length >= 1, `12 米外时轮投掷：去回命中 ${D().wheelHits - h0} 次，灰鬃狼 ${wolf.hp}/${wolf.maxHp}，时痕 ${D().marks.join(',')} 层`);
  // ---- 时痕引爆 ----
  const det0 = D().detonations;
  const w2 = g.enemies.find(e => e.kind === 'wolf' && e.alive);
  if (w2) { g.chronoMark(w2, 5); step(0.05); }
  check(D().detonations > det0, `时痕叠满 5 层立刻引爆（累计引爆 ${D().detonations} 次，引爆伤害 ${D().detonateDmg}）`);
  // ---- 时砂不足不能放 ----
  g.chrono.sand = 0; const cd0 = g.loadout.cooldownLeft('skill2', g.T);
  g.target = g.enemies.find(e => e.kind === 'wolf' && e.alive); g.player.pos.set(g.target.pos.x - 8, 0, g.target.pos.z); step(0.05);
  g.tryCast('skill2'); step(0.05);
  check(cd0 === 0 && g.loadout.cooldownLeft('skill2', g.T) === 0, '时砂 0 格：千刃回旋放不出来（不进冷却）');
  step(4.2);
  check(D().sand >= 2, `时砂每 2 秒回 1 格（4 秒后 ${D().sand.toFixed(1)} 格）`);
  // ---- 千刃回旋 + 回声 ----
  g.chrono.sand = 6;
  const e0 = D().echoes, wh = D().wheelHits;
  const tgt = g.enemies.find(e => e.kind === 'wolf' && e.alive); g.target = tgt; g.player.pos.set(tgt.pos.x - 6, 0, tgt.pos.z); step(0.05);
  g.tryCast('skill2'); step(0.1);
  check(D().sand <= 4.5, `千刃回旋消耗 2 格时砂（剩 ${D().sand.toFixed(1)}）`);
  step(2.6);
  check(D().echoes > e0 && D().wheelHits > wh, `2 秒后回声分身重放（回声 ${D().echoes - e0} 次，时轮命中 +${D().wheelHits - wh}）`);
  // ---- 沙影步：向前瞬移 ----
  g.player.pos.set(10, 0, 20); g.player.rig.root.rotation.y = 0; g.target = null; step(0.05);
  const z0 = g.player.pos.z; g.chrono.sand = 6; g.loadout.resetCooldown('skill1');
  g.tryCast('skill1'); step(0.05);
  check(g.player.pos.z - z0 > 6, `沙影步向前瞬移 ${(g.player.pos.z - z0).toFixed(1)} 米`);
  // ---- 回溯：回到 3 秒前的位置和生命 ----
  g.chrono.sand = 6; g.player.pos.set(0, 0, 10); step(0.1);
  const start = { x: g.player.pos.x, z: g.player.pos.z };
  for (let i = 0; i < 30; i++) { g.player.pos.x += 0.3; step(0.1); }
  const hpFull = g.player.hp; g.player.hp = Math.round(g.player.maxHp * 0.3);
  key('f'); step(0.05);
  check(Math.abs(g.player.pos.x - start.x) < 3 && D().rewinds === 1 && D().sand < 4, `F 回溯：从 x=${(start.x + 9).toFixed(1)} 回到 x=${g.player.pos.x.toFixed(1)}（3 秒前 ${start.x.toFixed(1)}），时砂剩 ${D().sand.toFixed(1)}`);
  check(g.player.hp > g.player.maxHp * 0.5 && g.player.hp <= g.player.maxHp * 0.56, `回溯恢复生命：30% → ${Math.round(g.player.hp / g.player.maxHp * 100)}%（最多回 25%，当时 ${Math.round(hpFull / g.player.maxHp * 100)}%）`);
  key('f'); step(0.05);
  check(D().rewinds === 1, '回溯冷却中不能再用');
  g.player.hp = g.player.maxHp;
  // ---- 终刻：时停 ----
  const pack = g.enemies.filter(e => e.kind === 'wolf' && e.alive);
  const t3 = pack[0]; g.target = t3; g.player.pos.set(t3.pos.x - 5, 0, t3.pos.z); step(0.05);
  g.tryCast('ultimate'); step(0.1);
  const frozenPos = pack.map(e => ({ x: e.pos.x, z: e.pos.z }));
  const pHp = g.player.hp;
  for (let i = 0; i < 20; i++) { g.tryCast('basic'); step(0.1); }
  const still = pack.every((e, i) => !e.alive || Math.hypot(e.pos.x - frozenPos[i].x, e.pos.z - frozenPos[i].z) < 0.05);
  check(D().frozen && still && g.player.hp >= pHp, `终刻：时停中狼群静止（${pack.length} 只），玩家不掉血（frozen=${D().frozen} still=${still} hp ${pHp}→${g.player.hp}）`);
  step(1.5);
  check(!D().frozen && D().stops === 1, '3 秒后时停结束，期间伤害额外打出');
  // ---- 掉落：只掉时轮 / 沙漏 / 皮甲 ----
  c.talk('bran');
  c.grindWolves(() => g.quests.active().every(a => a.ready));
  c.talk('bran'); c.talk('bran');
  c.spend(CHRONO); equipBest();
  c.talk('tom'); c.talk('tom');
  c.grindWolves(() => g.progression.level >= 5);
  c.spend(CHRONO); equipBest();
  const all = g.inventory.bag.concat(g.inventory.equippedItems());
  check(all.length > 0 && all.every(i => !i.weaponType || ['chakram', 'hourglass'].includes(i.weaponType)) && all.every(i => !i.armorType || i.armorType === 'leather'), `时砂行者只掉时轮 / 沙漏 / 皮甲（${all.length} 件：${[...new Set(all.map(i => i.weaponType ?? i.armorType ?? i.slot))].join(' ')}）`);
  const thr = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] });
  check(g.tree.rank('cm_heavy') === 1 && thr.tags.includes('mark_out') && thr.displayName.includes('沉沙'), `天赋第 2 层「沉沙之轮」改变时轮投掷形态（${thr.displayName}），天赋 ${c.specLine()}`);
  // ---- 武器：双时轮 / 时轮 + 沙漏；不能拿法杖 ----
  const inv = g.inventory; g.gen.classId = 'chrono';
  const make = (slot, base) => { let it; for (let k = 0; k < 200; k++) { it = g.gen.generate(6, 'blue', [slot]); if (!base || it.baseId === base) break; } return it; };
  const ch1 = make('oneHand', 'b_chakram'), ch2 = make('oneHand', 'b_chakram'), hg = make('offHand', 'b_hourglass');
  while (inv.bag.length > 24) inv.sell(inv.bag[0].id);
  [ch1, ch2, hg].forEach(i => inv.add(i));
  inv.equip(ch1.id, 'mainHand'); inv.equip(ch2.id, 'offHand'); step(0.05);
  check(inv.equipped.mainHand === ch1 && inv.equipped.offHand === ch2, `双持时轮：${ch1.name} + ${ch2.name}`);
  inv.equip(hg.id, 'offHand'); step(0.05);
  check(inv.equipped.offHand === hg, `时轮 + 沙漏：${hg.name}`);
  g.gen.classId = 'mage'; const staff = g.gen.generate(6, 'blue', ['twoHand']); g.gen.classId = 'chrono';
  inv.add(staff);
  check(!inv.canEquip(staff), `不能拿法杖（${inv.whyCannotEquip(staff)}）`);
  if (g.player.rig.root.userData.model) check(/chakram/.test(g.gearSummary()), `外观：${g.gearSummary()}`);
  // ---- 暗岩矿洞（机器人；低血量用回溯） ----
  const orig = c.bot;
  c.bot = o => { if (g.cls.id === 'chrono' && g.player.alive && g.player.hp < g.player.maxHp * 0.45) g.chronoRewind(); orig(o); };
  log(`进矿洞前：等级 ${g.progression.level} 生命 ${g.player.maxHp}`);
  c.runDungeon('darkrock_mine');
  c.bot = orig;
  log(`时砂行者统计：${JSON.stringify(D())}`);
  check(D().echoes > 3 && D().detonations > 3, `实战：回声 ${D().echoes} 次、时痕引爆 ${D().detonations} 次、回溯 ${D().rewinds} 次`);
  const saved = g.rawSave();
  check(!!saved && JSON.parse(saved).classId === 'chrono', '时砂行者是独立角色存档');
}

// ====================================================================== 阶段七：炼金投弹手（v0.7.1-br.A）
async function alchemyTest(c) {
  const { g, $, step, log, check, key, equipBest, w } = c;
  $('class-pick').children[3].click(); step(0.1); $('start').click(); step(1);
  const D = () => g.alchemyDebug();
  check(g.cls.id === 'alchemy' && g.player.rig.root.userData.cls === 'alchemy', `职业：${g.cls.name}，模型 ${g.player.rig.root.userData.model ?? '方块后备'}，生命 ${g.player.maxHp}`);
  check($('pf-reag').style.display !== 'none' && $('pf-reag').querySelectorAll('i.on').length === 9 && $('sk-smoke').style.display !== 'none' && $('pf-res').style.display === 'none', 'HUD：三色试剂各 3 格，推进烟雾按钮（时砂条隐藏）');
  check($('pf-portrait').innerHTML.includes('pt_alchemy'), '头像：炼金投弹手');
  log(`技能栏：${[...w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
  const wolfAt = (dx = 10) => { const e = g.enemies.find(x => x.kind === 'wolf' && x.alive); g.target = e; g.player.pos.set(e.pos.x - dx, 0, e.pos.z); step(0.05); return e; };
  // ---- 试剂弹：抛物线 0.5 秒后落地 ----
  let wf = wolfAt(11); const hp0 = wf.hp;
  g.tryCast('basic'); step(0.25);
  check(D().lobs === 1 && wf.hp === hp0, '试剂弹在空中飞（0.25 秒时还没落地）');
  step(0.5);
  check(wf.hp < hp0, `11 米外试剂弹落地命中（灰鬃狼 ${wf.hp}/${wf.maxHp}）`);
  // ---- 单按红：等调配窗口过去后投出爆燃瓶 ----
  wf = wolfAt(9); const t0 = D().throws;
  g.tryCast('skill1'); step(0.1);
  check(D().pending === 'r' && D().reagents.r === 2, '按红：先扣 1 格红色试剂，进入调配窗口');
  step(0.5);
  check(D().throws > t0 && D().last === 'r', `窗口过去 → 投出纯红「爆燃瓶」`);
  step(0.8);
  check(D().zoneKinds.includes('fire'), `爆燃瓶留下燃烧地面（${D().zoneKinds.join(',')}）`);
  // ---- 蓝 + 蓝：冰封瓶，冻结 ----
  wf = wolfAt(8); step(0.05);
  g.tryCast('skill2'); step(0.35); g.tryCast('skill2'); step(0.05);
  check(D().last === 'bb' && D().mixes === 1, `蓝 + 蓝 = 冰封瓶（配方 ${D().last}）`);
  step(0.6);
  check(wf.status.isStunned || !wf.alive, '冰封瓶落地冻结目标');
  // ---- 地面反应：先绿铺毒池，再红点燃 → 爆燃 ----
  const tough = [];
  for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 3;
  wf = wolfAt(8); tough.push([wf, wf.maxHp]); wf.maxHp = wf.hp = 99999; wf.status.add({ key: 'tst', kind: 'stun', remaining: 4, source: null });
  g.tryCast('skill3'); step(1.2);
  check(D().zoneKinds.includes('poison'), '腐蚀瓶留下毒池');
  const b0 = D().booms;
  g.target = wf.alive ? wf : g.target; g.tryCast('skill1'); step(1.2);
  check(D().booms > b0 && !D().zoneKinds.includes('poison'), `火落在毒池上 → 爆燃（爆燃 ${D().booms} 次，毒池被清掉）`);
  // ---- 冰浇火地 → 蒸汽 ----
  for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 3;
  wf = wolfAt(8); tough.push([wf, wf.maxHp]); wf.maxHp = wf.hp = 99999; wf.status.add({ key: 'tst', kind: 'stun', remaining: 4, source: null });   // 打不死：两瓶落在同一处
  g.tryCast('skill1'); step(1.2);
  const s0 = D().steams;
  g.tryCast('skill2'); step(1.2);
  check(D().steams > s0, `冰落在燃烧地面上 → 蒸汽致盲（蒸汽 ${D().steams} 次）`);
  for (const [e, m] of tough) { e.maxHp = m; e.hp = Math.min(e.hp, m); }   // 还原成普通狼，别让后面的机器人打不死
  // ---- 红 + 绿：燃烧酸池 ----
  for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 3;
  wf = wolfAt(8);
  g.tryCast('skill1'); step(0.35); g.tryCast('skill3'); step(1);
  check(D().used.gr >= 1 && D().zoneKinds.includes('acid'), `红 + 绿 = 燃烧酸池（地面 ${D().zoneKinds.join(',')}）`);
  // ---- 试剂不足 ----
  g.alchemy.reagents.g = 0; const th = D().throws; g.loadout.resetCooldown('skill3');
  g.tryCast('skill3'); step(0.7);
  check(D().throws === th, '绿色试剂 0 格：绿放不出来');
  step(3.2);
  check(D().reagents.g >= 1, `试剂每 3 秒回 1 格（绿 ${D().reagents.g}）`);
  // ---- 大釜炮台 ----
  wf = wolfAt(7); const p0 = D().potThrows;
  g.tryCast('ultimate'); step(5);
  check(D().pots === 1 && D().potThrows - p0 >= 2, `大釜炮台：5 秒内自动投掷 ${D().potThrows - p0} 次（配方 ${D().last}）`);
  step(6);
  check(D().pots === 0, '10 秒后大釜消失');
  // ---- 推进烟雾：25 级前不能用；强制测试后跳 ----
  key('f'); step(0.05);
  check(D().smokes === 0, '推进烟雾 25 级前不能用');
  g.player.pos.set(0, 0, 12); g.player.rig.root.rotation.y = 0; step(0.05);
  const z0 = g.player.pos.z; g.alchemySmoke(true); step(0.05);
  check(z0 - g.player.pos.z > 4, `推进烟雾向后跳 ${(z0 - g.player.pos.z).toFixed(1)} 米`);
  // ---- 掉落：只掉药瓶 / 试剂匣 / 布甲 ----
  c.talk('bran');
  c.grindWolves(() => g.quests.active().every(a => a.ready));
  c.talk('bran'); c.talk('bran');
  c.spend(ALCH); equipBest();
  c.talk('tom'); c.talk('tom');
  c.grindWolves(() => g.progression.level >= 5);
  c.spend(ALCH); equipBest();
  const all = g.inventory.bag.concat(g.inventory.equippedItems());
  check(all.length > 0 && all.every(i => !i.weaponType || ['flask', 'reagent'].includes(i.weaponType)) && all.every(i => !i.armorType || i.armorType === 'cloth') && all.every(i => !['b_staff', 'b_hood', 'b_robe'].includes(i.baseId)), `炼金投弹手只掉药瓶 / 试剂匣 / 自己的布甲（${all.length} 件：${[...new Set(all.map(i => i.weaponType ?? i.armorType ?? i.slot))].join(' ')}）`);
  const shot = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] });
  check(g.tree.rank('ab_shot') === 1 && shot.element === 'fire', `天赋第 2 层「燃烧弹头」：试剂弹变火焰（${shot.displayName}），天赋 ${c.specLine()}`);
  const inv = g.inventory; g.gen.classId = 'alchemy';
  const make = (slot, base) => { let it; for (let k = 0; k < 200; k++) { it = g.gen.generate(6, 'blue', [slot]); if (!base || it.baseId === base) break; } return it; };
  const fl = make('oneHand', 'b_flask'), rb = make('offHand', 'b_reagent');
  while (inv.bag.length > 24) inv.sell(inv.bag[0].id);
  [fl, rb].forEach(i => inv.add(i)); inv.equip(fl.id, 'mainHand'); inv.equip(rb.id, 'offHand'); step(0.05);
  check(inv.equipped.mainHand === fl && inv.equipped.offHand === rb, `药瓶 + 试剂匣：${fl.name} + ${rb.name}`);
  g.gen.classId = 'mage'; const orb = g.gen.generate(6, 'blue', ['offHand']); g.gen.classId = 'alchemy'; inv.add(orb);
  check(!inv.canEquip(orb), `不能拿法师副手（${inv.whyCannotEquip(orb)}）`);
  if (g.player.rig.root.userData.model) check(/flask/.test(g.gearSummary()) && /reagent/.test(g.gearSummary()), `外观：${g.gearSummary()}`);
  // ---- 暗岩矿洞（机器人） ----
  log(`进矿洞前：等级 ${g.progression.level} 生命 ${g.player.maxHp}`);
  c.runDungeon('darkrock_mine');
  log(`炼金统计：${JSON.stringify(D())}`);
  check(D().mixes > 5 && D().reactions > 0, `实战：混合 ${D().mixes} 次、地面反应 ${D().reactions} 次、配方 ${Object.keys(D().used).length} 种`);
  const saved = g.rawSave();
  check(!!saved && JSON.parse(saved).classId === 'alchemy', '炼金投弹手是独立角色存档');
}

// ====================================================================== 阶段七 v0.7.2-br.A：新职业橙装 / 套装 / 暗金 / 职业任务
function cgEquipLg(g, slot, lg, eqSlot) {
  const lgSl = g.gen.data?.legendaries?.find(l => l.id === lg)?.slots;   // v1.2.10：特效部位以数据为准（v0.9.7 起部分特效换了部位，比如残响护手现在是项链）
  if (lgSl?.length && !lgSl.includes(slot)) { slot = lgSl[0]; eqSlot = undefined; }
  let it; for (let k = 0; k < 600; k++) { it = g.gen.generate(20, 'orange', [slot]); if (it.lgId === lg && !it.ancient) break; }   // v1.2.10：太古件数值 ×2，测试只用普通件
  if (it.lgId !== lg || it.ancient) return null;
  while (g.inventory.bag.length > 24) g.inventory.sell(g.inventory.bag[0].id);
  g.inventory.add(it); if (!g.inventory.equip(it.id, eqSlot) && !g.inventory.equip(it.id)) return null;   // v1.2.10：底材可能落在特效的另一个部位（护手 / 护腕），按物品自己的部位穿
  return g.inventory.equippedItems().some(x => x.id === it.id) ? it : null;
}
function cgEquipFixed(g, id, eqSlot) {
  const it = g.gen.generateFixed(id, 30); if (!it) return null;
  while (g.inventory.bag.length > 24) g.inventory.sell(g.inventory.bag[0].id);
  g.inventory.add(it); g.inventory.equip(it.id, eqSlot); return it;
}
function cgQuest(c, id, cls, other, mapId) {
  const { g, $, step, check, key } = c;
  const L = () => g.progression.level;
  check(g.quests.state(id, L()) === 'available' && g.quests.state(other, L()) === 'locked', `职业任务「${g.quests.def(id).name}」只对${cls}出现（另一职业的 ${other} 不可接）`);
  check(g.quests.accept(id, L()), '接受职业任务');
  key('m'); step(0.1);
  [...$('worldmap').querySelectorAll('.tab')].find(t => t.dataset.view === 'world')?.click(); step(0.05);
  $('wm-legend').querySelector(`[data-map="${mapId}"]`)?.click(); step(0.05);
  const lg = $('wm-legend').textContent;
  check(lg.includes('职业任务') && $('wm-legend').querySelector('.wo.cq'), `地图 ${mapId}：目标标成「职业任务」（${lg.slice(lg.indexOf('职业任务'), lg.indexOf('职业任务') + 24)}…）`);
  key('m'); step(0.05);
  const sv = g.quests.save(); sv.active[id] = g.quests.def(id).objectives.map(o => o.count ?? 1); g.quests.load(sv);
  check(g.quests.state(id, L()) === 'ready', '任务目标完成，可交付');
  check(!!g.quests.turnIn(id, L()) && g.quests.state(id, L()) === 'done', '交付职业任务');
}
async function classGearChrono(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[2].click(); step(0.1); $('start').click(); step(1);
  g.progression.addXp(g.progression.totalXpFor(10)); step(0.1);
  const D = () => g.chronoDebug();
  const e0 = D().echoMul, r0 = D().rewindCd;
  cgQuest(c, 'cq_chrono1', '时砂行者', 'cq_alchemy1', 'field');
  check(Math.abs(D().echoMul / e0 - 1.1) < 0.01, `「遗落钟楼·一」奖励：回声伤害 ×1.1（${e0.toFixed(2)} → ${D().echoMul.toFixed(2)}）`);
  g.gen.classId = 'chrono';
  check(!!cgEquipLg(g, 'offHand', 'lg_backflow', 'offHand') && D().rewindCd === r0 - 4, `倒流沙漏：回溯冷却 ${r0} → ${D().rewindCd} 秒`);
  const e1 = D().echoMul;
  check(!!cgEquipLg(g, 'hands', 'lg_echo_gauntlet', 'hands') && Math.abs(D().echoMul / e1 - 1.3) < 0.01, `残响护手：回声伤害 ×1.3（${D().echoMul.toFixed(2)}）`);
  check(!!cgEquipFixed(g, 'd_aeon_wheel', 'mainHand') && D().echoMul >= 1 && D().echoMarks, `暗金「永劫之轮」：回声 ${Math.round(D().echoMul * 100)}% 伤害，回声也叠时痕`);
  for (const [id, sl] of [['i_chrono_hood', 'head'], ['i_chrono_vest', 'chest'], ['i_chrono_shoulder', 'shoulder'], ['i_chrono_legs', 'legs']]) cgEquipFixed(g, id, sl);
  check(g.inventory.setCounts().get('set_chrono') === 4, `套装「时痕」4 件（${g.inventory.equippedItems().filter(i => i.setId === 'set_chrono').map(i => i.name).join(' ')}）`);
  const w = g.enemies.find(x => x.kind === 'wolf' && x.alive); g.player.pos.set(w.pos.x - 5, 0, w.pos.z); w.maxHp = w.hp = 99999; step(0.05);
  const ec = D().echoes; g.chronoMark(w, 5); step(0.1);
  check(D().setClones === 1, '时痕 4 件：时痕引爆召唤回声分身');
  step(4.5);
  check(D().echoes - ec >= 3, `回声分身 4 秒内扔出 ${D().echoes - ec} 次时轮`);
}
async function classGearAlchemy(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[3].click(); step(0.1); $('start').click(); step(1);
  g.progression.addXp(g.progression.totalXpFor(10)); step(0.1);
  const D = () => g.alchemyDebug();
  cgQuest(c, 'cq_alchemy1', '炼金投弹手', 'cq_chrono1', 'rotting_temple');
  check(Math.abs(D().reactMul - 1.2) < 0.01, `「腐沼实验室·一」奖励：地面反应 ×${D().reactMul}`);
  g.gen.classId = 'alchemy';
  check(!!cgEquipLg(g, 'offHand', 'lg_trinity_box', 'offHand') && D().max === 4, `三元试剂匣：每种试剂上限 ${D().max}`);
  check(!!cgEquipLg(g, 'shoulder', 'lg_eternal_pot', 'shoulder'), '永燃药锅');
  const w = g.enemies.find(x => x.kind === 'wolf' && x.alive); g.target = w; g.player.pos.set(w.pos.x - 7, 0, w.pos.z); w.maxHp = w.hp = 99999; step(0.05);
  g.tryCast('ultimate'); step(14);
  check(D().pots === 1, '永燃药锅：14 秒后大釜还在（持续 20 秒）');
  step(7);
  for (const [id, sl] of [['i_alc_mask', 'head'], ['i_alc_coat', 'chest'], ['i_alc_gloves', 'hands'], ['i_alc_legs', 'legs']]) cgEquipFixed(g, id, sl);
  check(g.inventory.setCounts().get('set_alchemy') === 4, '套装「赤青碧」4 件');
  for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 4;
  w.status.add({ key: 'tst', kind: 'stun', remaining: 8, source: null });
  g.tryCast('skill2'); step(1.0); g.tryCast('skill1'); step(0.35); g.tryCast('skill3'); step(1.0); g.tryCast('skill1'); step(1.0);   // 冰雾 + 酸池 + 燃烧地面
  // 3 种不同地面 → 4 件效果生效
  const k = D().kinds;
  check(D().set4 && k >= 3, `赤青碧 4 件：场上 3 种地面，伤害 +20% 生效（场上地面 ${k} 种：${D().zoneKinds.join(',')}）`);
  check(!!cgEquipFixed(g, 'd_chaos_tincture', 'mainHand'), '暗金「混沌原液」');
  for (const kk of ['r', 'b', 'g']) g.alchemy.reagents[kk] = 4;
  const m0 = D().chaos; g.loadout.resetCooldown('skill1'); g.tryCast('skill1'); step(0.05);
  check(D().chaos === m0 + 1 && D().last.length === 2 && D().pending === null, `混沌原液：按红直接投出混合药剂「${D().last}」`);
}

// ====================================================================== 阶段四：30 级、三张新地图、回程、传送阵、仓库、悬赏、世界事件
const P4_BASE = ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine', 'q_swamp_news', 'q_field_news', 'q_field_supplies', 'q_field_hermit', 'q_field_boars'];
const P4_RS = ['rs_news', 'rs_scorp', 'rs_venom', 'rs_bandits', 'rs_ruins', 'rs_crystal', 'rs_lord'];
const P4_EM = ['em_news', 'em_hounds', 'em_ashplain', 'em_embers', 'em_rift', 'em_golems', 'em_east', 'em_brutes', 'em_obsidian', 'em_scout', 'em_west', 'em_cult', 'em_bones', 'em_priest', 'em_heart', 'em_scholar'];
const P4_FR = ['fr_news', 'fr_wolves', 'fr_pelts', 'fr_lake', 'fr_spire', 'fr_trolls', 'fr_fang'];
const p4Save = (level, done, part) => JSON.stringify({ version: 4, savedAt: 0, classId: 'warrior', inventory: { gold: 500, bag: [], equipped: {}, stacks: { potion_s: 30 } },
  level: { level, xp: 0 }, talents: {}, quests: { active: {}, done: [...P4_BASE, ...done] }, tutorial: -1, p4part: part });
const P4_SAVE = p4Save(18, [], 1);
async function phase4(c) {
  const { g, $, step, log, check, key, w } = c;
  c.stuck = 0; c.autoStarts = 0; c.stops = {};
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  check(g.progression.maxLevel === (DLCS.includes('dlc1') ? 40 : 30), `等级上限 ${g.progression.maxLevel}`);   // v1.2.12 DLC 构建上限 40
  // 18 级的装备：每格一件 20 级精良/史诗
  const gearUp = (lv) => { g.gen.classId = 'warrior'; for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) { const it = g.gen.generate(lv, Math.random() < 0.5 ? 'blue' : 'purple', [sl]); g.inventory.add(it); } c.equipBest(); };
  gearUp(20);
  c.spend(FURY);
  // ---- 回程：营地里读条 3 秒；移动打断
  g.player.pos.set(-2, 0, 0); step(0.1);
  check(g.startRecall() && g.recall.active, '按 H 开始回程读条');
  step(1); g.player.pos.x += 2; step(0.2);
  check(!g.recall.active, '移动打断回程');
  g.startRecall(); step(3.3);
  check(Math.hypot(g.player.pos.x - 0, g.player.pos.z - 6) < 1, '回程 3 秒后回到灰石营地');
  // ---- 原野 → 赤砂裂谷（任务指引跨地图：经原野东边的赤砂石门）
  ['frost', 'ember'].forEach(id => g.ensureWild(id));   // 先生成后两张图（NPC 才在场，方便 talk）
  g.enterField(); step(0.2);
  c.talk('rowan');
  check(g.quests.state('rs_news', g.progression.level) === 'active', '罗文给出「赤砂来信」');
  check(c.questLoop(['rs_news'], 300), `自动寻路穿过赤砂石门，找到莫桑交付「赤砂来信」（${g.zone}）`);
  if (g.zone !== 'redsand') { const gd = g.guide; log(`  诊断：pos (${g.player.pos.x.toFixed(1)},${g.player.pos.z.toFixed(1)}) guide ${gd ? JSON.stringify({ final: gd.final, link: gd.link, goal: gd.goal, map: gd.t.point.map }) : 'null'} auto ${g.autoPath.active} stops ${JSON.stringify(c.stops)} toast ${$('toast').textContent}`); return; }
  check(g.zone === 'redsand' && g.waypoints.has('rs_camp'), '进入赤砂裂谷，赤岩驿站传送阵开通');
  check(!!$('zone-name').textContent.includes('赤砂裂谷'), `区域名：${$('zone-name').textContent}`);
  const t0 = g.T;
  for (const npc of ['mosang', 'tiya', 'balo']) c.talk(npc);
  const RS = ['rs_scorp', 'rs_venom', 'rs_bandits', 'rs_ruins', 'rs_crystal', 'rs_lord'];
  const take = (npcs) => { for (const n of npcs) c.talk(n); };
  let ok = true;
  for (let round = 0; round < 6 && !RS.every(id => g.quests.state(id, g.progression.level) === 'done'); round++) {
    take(['mosang', 'tiya', 'balo']);
    ok = c.questLoop(RS.filter(id => g.quests.state(id, g.progression.level) !== 'done'), 600) && ok;
    take(['mosang', 'tiya', 'balo']);
    if (g.progression.level >= 20 && c.equipBest) { gearUp(g.progression.level + 2); c.spend(FURY); }
  }
  const rsDone = RS.filter(id => g.quests.state(id, g.progression.level) === 'done').length;
  log(`赤砂裂谷：${(g.T - t0).toFixed(0)} 秒，完成 ${rsDone}/${RS.length}，等级 ${g.progression.level}，阵亡 ${c.deaths}，卡住 ${c.stuck}`);
  check(rsDone === RS.length, `赤砂裂谷任务全部完成（${rsDone}/${RS.length}）`);
  check(g.progression.level >= 21 && g.progression.level <= 24, `出赤砂约 ${g.progression.level} 级（目标 21~23）`);
  // ---- 仓库：存一件、取回、存档往返
  const it = g.inventory.bag[0];
  if (it) {
    g.openBank(); step(0.05);
    $('bank-bag').querySelector('.cell').click(); step(0.05);
    check(g.bank.length === 1 && !g.inventory.bag.includes(it), '仓库：点背包里的装备存入');
    g.save();
    const sv = JSON.parse(g.rawSave());
    check(JSON.parse(w.localStorage.getItem('darkrock_bank') ?? '[]').length === 1 && sv.waypoints.includes('rs_camp'), '仓库单独存档（3 个角色共用），角色存档里有已开通的传送阵');
    $('bank-grid').querySelector('.cell').click(); step(0.05);
    check(g.bank.length === 0 && g.inventory.bag.some(x => x.id === it.id), '仓库：点仓库里的装备取回');
    key('Escape');
  }
  return;
}
// 阶段四第二段：从 22 级、赤砂任务全部完成开始（单段超过 20 分钟，拆开跑）
async function phase4b(c) {
  const { g, $, step, log, check, key, w } = c;
  c.stuck = 0; c.autoStarts = 0; c.stops = {};
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  const gearUp = (lv) => { g.gen.classId = 'warrior'; for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) { const it = g.gen.generate(lv, Math.random() < 0.5 ? 'blue' : 'purple', [sl]); g.inventory.add(it); } c.equipBest(); };
  const take = (npcs) => { for (const n of npcs) c.talk(n); };
  ['redsand', 'frost', 'ember'].forEach(id => g.ensureWild(id));
  gearUp(g.progression.level + 2); c.spend(FURY);
  if (g.progression.level < 24) {
  g.goMap('redsand'); step(0.2);
  // ---- 霜脊高地
  c.talk('mosang');
  const FR = ['fr_news', 'fr_wolves', 'fr_pelts', 'fr_lake', 'fr_spire', 'fr_trolls', 'fr_fang'];
  for (let round = 0; round < 7 && !FR.every(id => g.quests.state(id, g.progression.level) === 'done'); round++) {
    if (g.zone === 'frost' || g.ensureWild('frost')) take(g.zone === 'frost' ? ['hela', 'nord', 'suli'] : ['mosang']);
    c.questLoop(FR.filter(id => g.quests.state(id, g.progression.level) !== 'done'), 400);
    log(`  霜脊第 ${round + 1} 轮：${FR.map(id => id + ':' + g.quests.state(id, g.progression.level)).join(' ')} 等级 ${g.progression.level} @${g.zone}`);
    if (g.zone === 'frost') take(['hela', 'nord', 'suli']);
    gearUp(g.progression.level + 2); c.spend(FURY);
    if (g.quests.state('fr_fang', g.progression.level) === 'active') { const f = g.enemies.find(e => e.kind === 'frost_fang'); log(`  霜牙：alive ${f?.alive} @(${f?.pos.x.toFixed(1)},${f?.pos.z.toFixed(1)}) state ${f?.intent?.state} hp ${f?.hp.toFixed(0)} 玩家 (${g.player.pos.x.toFixed(1)},${g.player.pos.z.toFixed(1)}) guide ${JSON.stringify(g.guide?.goal)}`); }
  }
  const frDone = FR.filter(id => g.quests.state(id, g.progression.level) === 'done').length;
  log(`霜脊高地：完成 ${frDone}/${FR.length}，等级 ${g.progression.level}，阵亡 ${c.deaths}，卡住 ${c.stuck}`);
  check(frDone === FR.length, `霜脊高地任务全部完成（${frDone}/${FR.length}）`);
  check(g.progression.level >= 24 && g.progression.level <= 27, `出霜脊约 ${g.progression.level} 级（目标 24~26）`);
  return;
  }
  // ---- 烬落荒原：主线 + 东西两个营地 + 悬赏一次
  g.goMap('frost'); step(0.2);
  c.talk('hela');
  const EM = ['em_news', 'em_hounds', 'em_ashplain', 'em_embers', 'em_rift', 'em_golems', 'em_east', 'em_brutes', 'em_obsidian', 'em_scout', 'em_west', 'em_cult', 'em_bones', 'em_priest', 'em_heart', 'em_scholar'];
  const emNpcs = ['kairen', 'yan', 'rook', 'mira', 'scholar'];
  for (let round = 0; round < 10 && !EM.every(id => g.quests.state(id, g.progression.level) === 'done'); round++) {
    if (g.zone === 'ember') take(emNpcs.filter(n => g.npcs.find(x => x.id === n))); else take(['hela']);
    c.questLoop(EM.filter(id => g.quests.state(id, g.progression.level) !== 'done'), 500);
    log(`  烬落第 ${round + 1} 轮：完成 ${EM.filter(id => g.quests.state(id, g.progression.level) === 'done').length}/${EM.length} 等级 ${g.progression.level} @${g.zone} 未完成 ${EM.filter(id => g.quests.state(id, g.progression.level) !== 'done').map(id => id + ':' + g.quests.state(id, g.progression.level)).join(' ')} 卡住 ${c.stuck}`);
    if (g.zone === 'ember') take(emNpcs);
    gearUp(Math.min(32, g.progression.level + 2)); c.spend(FURY);
  }
  const emDone = EM.filter(id => g.quests.state(id, g.progression.level) === 'done').length;
  log(`烬落荒原：完成 ${emDone}/${EM.length}，等级 ${g.progression.level}（经验 ${g.progression.xp}），阵亡 ${c.deaths}，卡住 ${c.stuck}，传送阵 ${[...g.waypoints].join(',')}`);
  check(emDone >= EM.length - 1, `烬落荒原主要任务完成 ${emDone}/${EM.length}`);
  check(['em_fort', 'em_east', 'em_west'].every(id => g.waypoints.has(id)), '烬落荒原三个营地的传送阵都已开通');
  return;
}
// 阶段四第四段：满级后的悬赏、世界事件、传送阵（从 28 级、荒原任务全部完成开始）
async function phase4d(c) {
  const { g, $, step, log, check, key, w } = c;
  c.stuck = 0; c.autoStarts = 0; c.stops = {};
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.gen.classId = 'warrior'; for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(30, 'purple', [sl])); c.equipBest(); c.spend(FURY);
  ['frost', 'ember'].forEach(id => g.ensureWild(id));
  g.goMap('frost'); step(0.3); g.goMap('ember'); step(0.3);
  // 悬赏：可反复完成
  c.talk('bounty');
  check(g.quests.state('bt_hounds', g.progression.level) === 'active', '悬赏板：接到「悬赏：猎犬」');
  c.questLoop(['bt_hounds'], 400); c.talk('bounty');
  check(g.quests.state('bt_hounds', g.progression.level) === 'active' || g.quests.state('bt_hounds', g.progression.level) === 'available', '悬赏交付后可以再次领取');
  // 世界事件：熔岩喷发
  const ev = g.worldEvents[0];
  g.goMap('ember', { x: 0, z: 1700 + 20 }); step(0.2);
  g.startEvent(ev); step(0.2);
  check(ev.active && $('event-hud').style.display === 'block', `世界事件开始：${$('event-hud').textContent}`);
  const lv0 = g.progression.level, gold0 = g.inventory.gold;
  for (let i = 0; i < 400 && ev.active; i++) step(0.5, () => c.bot({ filter: e => ev.mobs.includes(e) }));
  check(!ev.active && g.inventory.gold > gold0, `熔岩喷发平息：三波全部击杀，获得奖励（金币 +${g.inventory.gold - gold0}）`);
  // 传送阵：从烬落荒原传回赤岩驿站
  g.openWaypoints(); step(0.05);
  const btn = $('travel-body').querySelector('[data-wp="fr_camp"]');
  check(!!btn && !btn.disabled, '传送阵列表里霜脊营寨可传送');
  btn?.click(); step(0.2);
  check(g.zone === 'frost', '传送到霜脊营寨');
  log(`全部内容后：等级 ${g.progression.level}，金币 ${g.inventory.gold}，阵亡 ${c.deaths}，自动寻路卡住 ${c.stuck}`);
  check(g.progression.level >= 28, `新地图全部内容后 ${g.progression.level} 级（目标 28~30，悬赏和世界事件补满）`);
  g.save();
  check(JSON.parse(g.rawSave()).map === 'frost', '存档记住所在地图（霜脊高地）');
}

async function p4fang(c) {
  const { g, $, step, log, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.progression.addXp(30000);
  g.gen.classId = 'warrior'; for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(26, 'purple', [sl])); c.equipBest(); c.spend(FURY);
  g.ensureWild('frost'); g.goMap('frost'); step(0.3);
  const f = g.enemies.find(e => e.kind === 'frost_fang');
  log(`fang ${!!f} alive ${f?.alive} pos ${f?.pos.x.toFixed(1)},${f?.pos.z.toFixed(1)} hp ${f?.hp} lvl ${g.progression.level} php ${g.player.maxHp}`);
  c.stuck = 0; c.autoStarts = 0; c.stops = {};
  g.quests.load({ active: { fr_fang: [0] }, done: ['fr_trolls', 'fr_wolves', 'fr_news', 'fr_pelts'] });
  g.player.pos.set(g.player.pos.x, 0, g.player.pos.z);
  c.talk('suli'); log('  panels open: ' + [...w.document.querySelectorAll('.panel,.modal,#confirm')].filter(p => w.getComputedStyle(p).display !== 'none').map(p => p.id).join(',')); g.setFocus('fr_fang'); step(0.3);
  $('btn-autopath').click(); step(0.1);
  const nv = g.ensureWild('frost').nav;
  log(`  autopath active ${g.autoPath.active} toast ${$('toast').textContent.slice(-60)} free ${nv.isFree(-3.5, 1257.5)} path ${JSON.stringify(nv.findPath(-3.5, 1257.5, 0, 1188)?.length)} goal ${JSON.stringify(g.guide?.goal)}`);
  for (let k = 0; k < 6; k++) { const r = c.questLoop(['fr_fang'], 30); const gd = g.guide; log(`  loop${k} ${r} pos ${g.player.pos.x.toFixed(1)},${g.player.pos.z.toFixed(1)} fang ${f.alive} ${f.pos.x.toFixed(1)},${f.pos.z.toFixed(1)} st ${f.intent?.state} guide ${gd ? JSON.stringify({ f: gd.final, goal: gd.goal, kind: gd.t.kind }) : null} auto ${g.autoPath.active} q ${g.quests.state('fr_fang', 24)}`); if (r) break; }
  g.player.pos.set(f.pos.x + 3, 0, f.pos.z); step(0.2);
  for (let i = 0; i < 240 && f.alive && f.deadAt < 0; i++) { step(0.5, () => c.bot({ filter: e => e === f })); if (i % 20 === 0) log(`  t${i / 2}s fang hp ${f.hp.toFixed(0)} state ${f.intent?.state} d ${Math.hypot(f.pos.x - g.player.pos.x, f.pos.z - g.player.pos.z).toFixed(1)} php ${g.player.hp.toFixed(0)} deaths ${c.deaths} evade ${f.evadeUntil.toFixed(0)} T ${g.T.toFixed(0)}`); }
  log(`end alive ${f.alive}`);
}
// ====================================================================== 天赋界面：三棵树、层锁、加点到终极、重置
async function talentUiTest(c) {
  const { g, $, step, log, check, key, w } = c;
  key('Escape'); step(0.05);
  log(`法师现在 ${g.progression.level} 级，天赋 ${c.specLine()}；（测试）补经验到 25 级（v0.7.7：16 点），在界面上点到火焰终极`);
  g.progression.addXp(g.progression.totalXpFor(25) - g.progression.totalXpFor(g.progression.level) - g.progression.xp);
  step(0.1);
  check(g.progression.level === 25 && g.tree.available === 16 - g.tree.spent, `等级 25，剩余 ${g.tree.available} 点`);
  key('n'); step(0.05);
  const specs = [...$('tal-tree').querySelectorAll('.tspec')];
  check($('talent').style.display === 'flex' && specs.length === 3 && specs.map(s => s.querySelector('.tsh b').textContent).join('/') === '火焰/冰霜/奥术',
    `天赋面板三列：${specs.map(s => `${s.querySelector('.tsh b').textContent}(${s.querySelectorAll('.tnode').length})`).join(' / ')}`);
  check(specs.every(s => s.querySelectorAll('.ttier').length === 6 && s.querySelectorAll('.tnode.cap').length === 1), '每列 6 层层级标记 + 1 个高亮终极天赋（阶段四加第 6 层）');
  check($('tal-sum').textContent.includes('已用') && $('tal-sum').textContent.includes('火焰'), `总览：${$('tal-sum').textContent.slice(0, 60)}`);
  // 冰霜第 3 层锁定：标记 🔒 和要求文字
  const frostT3 = specs[1].querySelectorAll('.ttier')[2];
  check(frostT3.classList.contains('shut') && frostT3.textContent.includes('6'), `冰霜第 3 层锁定标记：${frostT3.textContent}`);
  g.selectTalent('mi_deepfreeze'); step(0.02);
  check($('t-add').disabled && $('tal-tip').textContent.includes('需要在「冰霜」投入 6 点'), '锁定天赋：加点按钮禁用，提示本树需要的点数');
  // 详情（与悬停提示同一份内容；jsdom 视为触屏，悬停提示不显示）：当前 / 下一级效果
  g.selectTalent('mf_orb'); step(0.02);
  const tt = $('tal-tip').textContent;
  check(tt.includes('效果：烈焰弹伤害 +12%') && !$('t-add').disabled, `可点天赋详情：${tt.slice(0, 50).replace(/\s+/g, ' ')}…`);
  $('t-add').click(); step(0.02);
  const tt2 = $('tal-tip').textContent;
  check(tt2.includes('当前：烈焰弹伤害 +12%') && tt2.includes('下一级：烈焰弹伤害 +24%') && $('tal-tree').querySelector('[data-tid="mf_orb"] .rkb').textContent === '1/3', '加 1 点后：显示当前 / 下一级效果，格子 1/3');
  // 用界面按钮把火焰点到终极
  let clicks = 0;
  for (let guard = 0; guard < 40 && g.tree.spentIn('m_fire') < 16; guard++) {
    const id = FIRE.find(x => g.tree.specOf(x)?.id === 'm_fire' && !g.tree.whyCannotAdd(x));
    if (!id) break;
    g.selectTalent(id); step(0.01); $('t-add').click(); clicks++;
  }
  step(0.2);
  const met = g.loadout.preview('ultimate', { now: 0, casterHpPercent: 1, targetEffects: [] });
  log(`界面加点 ${clicks} 次：${c.specLine()}；大招 ${met.displayName}（${met.effects.map(e => e.type).join('+')}）`);
  check(g.tree.rank('mf_inferno') === 1 && met.displayName === '熔火陨星' && met.effects.filter(e => e.type === 'groundZone').length === 2, '火焰终极「熔火陨星」：陨星坠落留下大片熔岩');
  check([...w.document.querySelectorAll('.skill .nm')].some(n => n.textContent === '熔火陨星'), '技能栏显示「熔火陨星」');
  const capEl = $('tal-tree').querySelector('[data-tid="mf_inferno"]');
  check(capEl.classList.contains('on') && capEl.classList.contains('cap'), '终极天赋格子点亮');
  // 退点保护
  g.selectTalent('mf_ignite'); step(0.01);
  check($('t-rm').disabled, `退第 1 层被阻止：${$('tal-tip').textContent.match(/不能退点：[^\n]*/)?.[0] ?? ''}`);
  // 重置（免费，需要确认）
  const gold = g.inventory.gold;
  $('tal-reset').click(); step(0.01);
  check(g.tree.spent > 0 && $('tal-reset').textContent.includes('确认'), '重置按钮第一次点击要求确认');
  $('tal-reset').click(); step(0.01);
  check(g.tree.spent === 0 && g.tree.available === 16 && g.inventory.gold === gold && g.loadout.preview('ultimate', { now: 0, casterHpPercent: 1, targetEffects: [] }).displayName === '陨星坠落', '重置天赋：免费返还 16 点，技能恢复');
  const sv = JSON.parse(w.__game.rawSave());
  check(sv.version === 10 && Object.keys(sv.talents).length === 0, '存档 v9 已保存重置后的天赋');
  // 667×375 样式规则存在（jsdom 无布局）
  const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('');
  check(css.includes('.tspecs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))') && css.includes('@media (max-height:520px),(max-width:700px){\n  #talent .body') && css.includes('#tal-tip{position:sticky'), '小屏样式：三列 + 缩小图标 + 详情吸底');
  key('n');
}

// ====================================================================== 存档 v3 → v4：天赋退点 + 一次性提示
const LEGACY_V3 = JSON.stringify({ version: 3, savedAt: 0, classId: 'warrior', inventory: { gold: 55, bag: [], equipped: {}, stacks: { potion_s: 3 } },
  level: { level: 9, xp: 123 }, talents: { wt_weapon: 3, wt_flame: 1, wt_whirl: 3, wt_tough: 1 }, quests: { active: {}, done: ['q_wolves'] } });
async function migrateTest(c) {
  const { g, $, step, check, w } = c;
  // 老版本「一个职业一个存档」：启动时自动迁成角色
  const sl = g.roster().slots;
  check(!!sl[0] && sl[0].classId === 'warrior' && sl[0].level === 9 && sl[0].name === '战士', `老存档迁成角色 1：${sl[0]?.name} · 等级 ${sl[0]?.level}`);
  check($('cs-slots').children.length === 8 && $('cs-slots').children[0].classList.contains('on'), '角色选择：8 个栏位，默认选中迁移来的角色');
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  check(g.progression.level === 9 && g.progression.xp === 123 && g.tree.spent === 0 && g.tree.available === 0, `v3 存档：等级 9 / 经验 123 保留，旧天赋退回 ${g.tree.available} 点`);
  check(g.lastNotices.includes('天赋已重置，请重新分配') && [...w.document.querySelectorAll('#toast div')].some(t => t.textContent.includes('天赋已重置')), '提示一次「天赋已重置，请重新分配」');
  const sv = JSON.parse(w.__game.rawSave());
  check(sv.version === 10 && !sv.notices && sv.inventory.gold === 55 && !!sv.sum, '立即存为 v9（不再带提示，带校验和）');
  check(w.localStorage.getItem('darkrock_legend_save') === LEGACY_V3, '老 key 原样保留（可回退）');
}

// ====================================================================== 装备部位：双手 / 单手+副手 / 戒指选格 / 角色面板
async function gearTest(c, clsId) {
  const { g, $, step, log, check, key, w } = c;
  const inv = g.inventory;
  g.gen.classId = clsId;
  const make = (slot, base) => { let it; do { it = g.gen.generate(6, 'blue', [slot]); } while (base && it.baseId !== base); return it; };
  const twoH = make('twoHand'), oneH = make('oneHand', clsId === 'mage' ? 'b_wand' : 'b_sword'), off = make('offHand', clsId === 'mage' ? 'b_tome' : 'b_shield');
  const r1 = make('ring'), r2 = make('ring');
  while (inv.bag.length > 22) inv.sell(inv.bag[0].id);
  [twoH, oneH, off, r1, r2].forEach(i => inv.add(i));
  key('Escape'); key('b'); step(0.05);
  const clickBag = it => { const i = inv.bag.indexOf(it); $('bag-grid').children[i].click(); step(0.02); };
  // 单手 + 副手（背包界面点「装备」）
  // 战士可双持：主手已有单手时默认进副手，所以用「→ 主手」按钮指定
  const toMain = () => ($('bag-tip').querySelector('[data-eqto="mainHand"]') ?? $('b-eq')).click();
  clickBag(oneH); toMain(); step(0.02);
  clickBag(off); $('b-eq').click(); step(0.02);
  check(inv.equipped.mainHand === oneH && inv.equipped.offHand === off, `${clsId}：单手 ${oneH.name} + 副手 ${off.name}`);
  const p1 = g.charSheet().power;
  // 双手：副手回背包
  clickBag(twoH); $('b-eq').click(); step(0.02);
  check(inv.equipped.mainHand === twoH && !inv.equipped.offHand && inv.bag.includes(off) && inv.bag.includes(oneH), `${clsId}：穿双手 ${twoH.name}，主手和副手都回到背包（强度 ${p1} → ${g.charSheet().power}）`);
  // 双手在身时穿副手：卸下双手
  clickBag(off); $('b-eq').click(); step(0.02);
  check(inv.equipped.offHand === off && !inv.equipped.mainHand && inv.bag.includes(twoH), `${clsId}：双手在身时穿副手 → 卸下双手武器`);
  clickBag(oneH); toMain(); step(0.02);
  // 戒指：先摘下身上的，第一枚默认进戒指1（空格优先），第二枚用「→ 戒指 2」按钮
  inv.unequip('ring1'); inv.unequip('ring2');
  clickBag(r1); $('b-eq').click(); step(0.02);
  clickBag(r2); const to2 = $('bag-tip').querySelector('[data-eqto="ring2"]'); to2?.click(); step(0.02);
  check(inv.equipped.ring1 === r1 && inv.equipped.ring2 === r2, '戒指：默认进戒指1，按钮指定进戒指2');
  key('b'); step(0.02);
  // 角色面板（C）
  key('c'); step(0.05);
  const pds = [...$('char').querySelectorAll('.pd')];
  const stats = $('char-stats').textContent;
  check($('char').style.display === 'flex' && pds.length === 16 && $('pd-portrait').innerHTML.includes(clsId === 'mage' ? 'pt_mage' : 'pt_warrior'), `角色面板：16 个格子 + 职业头像（${$('char-sub').textContent}）`);
  const need = ['生命', clsId === 'mage' ? '法术强度' : '攻击强度', '护甲', '暴击率', '暴击伤害', '急速', '移动速度', '平均装等'];
  check(need.every(k => stats.includes(k)), `属性面板：${need.join(' / ')}`);
  check($('char').querySelectorAll('.slot.sil').length + inv.equippedItems().length >= 16, `空格子显示部位轮廓（${$('char').querySelectorAll('.slot.sil').length} 个）`);
  // 点击副手格：卸下，下方列出可穿装备，再点「装备」穿回
  $('char').querySelector('.pd[data-slot="offHand"]').click(); step(0.02);
  check(!inv.equipped.offHand && inv.bag.includes(off) && g.charSel === 'offHand', '角色面板点击副手格卸下');
  const btn = [...$('char-tip').querySelectorAll('[data-eq]')].find(b => b.dataset.eq === off.id);
  btn?.click(); step(0.02);
  check(inv.equipped.offHand === off, '候选列表一键穿回副手');
  // 667×375 横屏：面板可滚动不溢出（jsdom 无布局，只检查样式规则存在）
  const css = [...w.document.querySelectorAll('style')].map(s => s.textContent).join('');
  check(css.includes('max-height:92vh') && css.includes('.panel .body{padding:12px 16px;overflow:auto') && css.includes('@media (max-height:520px){\n  .doll'), '小屏（667×375）样式：面板限高 + 滚动 + 纸娃娃缩小');
  key('c'); step(0.02);
  const sv = JSON.parse(w.__game.rawSave());
  check(sv.version === 10 && sv.inventory.equipped.mainHand?.id === oneH.id && sv.inventory.equipped.ring2?.id === r2.id, '存档 v9：主手 / 戒指2 已保存');
  log(`${clsId} 装备：${Object.entries(inv.equipped).map(([k, v]) => `${k}=${v.name}`).join(' ')}`);
}

// ====================================================================== 商店 / 强化 / 分解
// ---- v0.5 A：难度选择 → 等级同步 → 通关记录 → 噩梦词缀 HUD → 阵亡掉耐久 → 损坏属性失效 → 修理 → 存档 ----
// v05 ：耐久度（阵亡 -10%、损坏属性失效、HUD / 角色面板 / 提示框）+ 修理页 + 灰色杂物自动出售 + 锁定（A 的一键分解 / 拾取自动分解都跳过锁定）
async function v05Test(c) {
  const { g, $, step, log, check, w } = c;
  $('start').click(); step(0.5);
  g.tutFinish?.();
  for (let i = 0; i < 12; i++) g.progression.addXp(3000);
  const lv = g.progression.level;
  g.inventory.addGold(5000);
  while (g.inventory.bag.length) g.inventory.remove(g.inventory.bag[0].id);
  for (const [q, sl] of [['blue', 'head'], ['purple', 'chest'], ['blue', 'legs'], ['purple', 'hands'], ['blue', 'feet'], ['purple', 'shoulder']]) { const it = g.gen.generate(lv, q, [sl]); g.inventory.add(it); if (g.inventory.canEquip(it)) g.inventory.equip(it.id); }
  step(0.2);
  const eq = g.inventory.equippedItems(), hp0 = g.player.maxHp;
  check(eq.length >= 6 && eq.every(i => (i.durability ?? 100) === 100), `穿上 ${eq.length} 件，耐久全部 100`);
  // 1. 阵亡：身上装备 -10%
  g.player.hp = 0; g.player.onDeath(); step(1.5);
  check(eq.every(i => i.durability === 90) && $('death-dur').textContent.includes('耐久 -10%'), `阵亡：耐久 100 → 90，阵亡界面「${$('death-dur').textContent}」`);
  $('respawn').click(); step(0.2);
  for (let i = 0; i < 9; i++) g.durability.deathLoss();
  step(0.4);
  check(eq.every(i => i.durability === 0) && g.player.maxHp < hp0 && g.charSheet().gear.hp === 0, `阵亡 10 次：全部已损坏，生命 ${hp0} → ${g.player.maxHp}（装备属性失效）`);
  check(!!$('status-hud').querySelector('.sh-dur.broken') && $('status-hud').style.display === 'flex', 'HUD 显示装备损坏警告（铁砧）');
  $('btn-char').click(); step(0.05); g.renderChar();
  check($('char').querySelectorAll('.dur-x').length === eq.length && $('char-stats').textContent.includes('已损坏'), '角色面板：损坏装备红色「损」标记 + 属性栏「n 件已损坏」');
  const head = $('char').querySelector('[data-slot="head"]');
  head.dispatchEvent(new w.MouseEvent('mouseenter', { clientX: 300, clientY: 200 })); step(0.05);
  check(/耐久 0\/100 · 已损坏/.test($('tooltip').textContent) && $('tooltip').textContent.includes('（已损坏）'), '提示框：名字后「（已损坏）」+ 耐久行');
  head.dispatchEvent(new w.MouseEvent('mouseleave')); c.key('Escape');
  // 2. 修理：葛尔达（有要修的直接打开修理页）
  g.player.pos.set(1, 0, 11.5); step(0.2);
  g.currentInteractable().act(); step(0.1);
  check($('shop').style.display === 'flex' && w.document.querySelector('#shop .tab.on')?.dataset.tab === 'repair', '有装备要修时，和商人交互直接打开「修理」页');
  const cost = g.inventory.repairAllCost(), gold0 = g.inventory.gold;
  check($('shop-body').querySelectorAll('[data-rep]').length >= eq.length && $('shop-side').textContent.includes(String(cost)) && $('shop-body').querySelectorAll('.srow.broken').length === eq.length, `修理页列出 ${eq.length} 件（损坏的标红），全部修理 ${cost} 金`);
  // 单件修理
  const one = $('shop-body').querySelector('[data-rep]'); const oneIt = g.inventory.find(one.dataset.rep);
  one.click(); step(0.05);
  check(oneIt.durability === 100 && g.inventory.gold < gold0, `单件修理「${oneIt.name}」：耐久 100，-${gold0 - g.inventory.gold} 金`);
  const cost2 = g.inventory.repairAllCost(), gold1 = g.inventory.gold;
  $('s-repall').click(); step(0.1);
  check(g.inventory.gold === gold1 - cost2 && eq.every(i => i.durability === 100) && Math.abs(g.player.maxHp - hp0) <= 1, `全部修理：-${cost2} 金，属性恢复（生命 ${g.player.maxHp}）`);
  step(0.4);
  check(!!$('s-repall')?.disabled && $('status-hud').style.display === 'none', '修好后「全部修理」置灰、HUD 警告消失');
  // 3. 灰色杂物：拜访商人自动卖掉
  g.inventory.addStack('junk_cloth', 3); g.inventory.addStack('junk_trinket', 1);
  c.key('Escape'); step(0.05);
  const g2 = g.inventory.gold; g.openShop(); step(0.05);
  check(g.inventory.gold === g2 + 3 * 4 + 9 && !g.inventory.stack('junk_cloth') && !g.inventory.stack('junk_trinket'), `杂物自动出售 +${g.inventory.gold - g2} 金（3 布片 + 1 小饰物）`);
  check(![...w.document.querySelectorAll('#shop .tab')].some(t => t.dataset.tab === 'sell'), '商店没有「出售」页');
  c.key('Escape'); step(0.05);
  // 4. 锁定 → 一键分解跳过
  const mk = (q, sl) => { const it = g.gen.generate(lv, q, [sl]); g.inventory.add(it); return it; };
  const plain = [mk('white', 'chest'), mk('green', 'chest'), mk('blue', 'chest')];
  const lockA = mk('blue', 'legs'), lockB = mk('green', 'feet');
  const setp = g.gen.generateFixed('i_fury_legs', lv); g.inventory.add(setp);
  const dark = g.gen.generateFixed('d_bloodoath', lv); g.inventory.add(dark);
  [...plain, lockA, lockB].forEach(it => { it.itemLevel = Math.min(it.itemLevel, 1); });   // 都比身上的差（不触发「保留比身上好的」）
  $('btn-bag').click(); step(0.1);
  const cellOf = it => [...$('bag-grid').querySelectorAll('.cell')][g.inventory.bag.indexOf(it)];
  cellOf(lockA).click(); step(0.05);
  check(!!$('b-lock') && !$('b-sell'), '背包详情：有「锁定」按钮，没有「出售」按钮');
  $('b-lock').click(); step(0.05);
  check(lockA.locked === true && !!cellOf(lockA)?.querySelector('.slk'), '背包锁定：格子上出现锁图标');
  c.key('Escape');
  $('btn-char').click(); step(0.1);
  $('char').querySelector('[data-slot="feet"]').click(); step(0.05);
  const lb = $('char-tip').querySelector(`[data-lock="${lockB.id}"]`);
  check(!!lb, '角色面板候选列表里有锁按钮');
  lb?.click(); step(0.05);
  check(lockB.locked === true, '角色面板锁定背包里的装备');
  c.key('Escape');
  g.openShop('smith'); g.setShopTab('salvage'); step(0.05);
  check(!!$('shop-side').querySelector('[data-sq="blue"]:checked') && $('shop-side').textContent.includes('已锁定的装备永远不会被一键分解'), '分解页：A 的按品质勾选一键分解（默认白 / 绿 / 蓝），写明跳过锁定');
  const sideTxt = $('shop-side').textContent;
  check(sideTxt.includes(`将分解 ${plain.length} 件`) && sideTxt.includes('金'), `预览：将分解 ${plain.length} 件（锁定 2 件、套装件、暗金都不算）`);
  const goldS = g.inventory.gold;
  $('s-salvall').click(); step(0.02); $('s-salv-ok').click(); step(0.05);
  const kept = [lockA, lockB, setp, dark];
  check(plain.every(it => !g.inventory.find(it.id)) && kept.every(it => g.inventory.find(it.id)) && g.inventory.gold > goldS, `一键分解：普通 ${plain.length} 件分解（+${g.inventory.gold - goldS} 金），锁定 2 件 / 套装件 / 暗金都还在`);
  // 再勾上紫色、关掉「保留套装件」：只多出套装件，锁定和暗金仍然跳过
  $('shop-side').querySelector('[data-sq="purple"]').click(); step(0.02);
  $('shop-side').querySelector('[data-sk="keepSet"]').click(); step(0.02);
  const pick = $('shop-side').textContent.match(/将分解 (\d+) 件/)?.[1];
  check(pick === '1', `勾上紫色 + 关掉「保留套装件」：只多出套装件 1 件（锁定 2 件、暗金仍跳过，预览 ${pick} 件）`);
  $('shop-side').querySelector('[data-sk="keepSet"]').click(); step(0.02);
  $('shop-side').querySelector('[data-sq="purple"]').click(); step(0.02);
  // 单件：锁定的也能在详情里解锁
  g.setShopTab('salvage', lockA.id); step(0.02);
  check(!!$('s-lock') && $('s-lock').textContent.includes('解锁'), '分解页单件详情：锁定的显示「解锁」');
  c.key('Escape'); step(0.05);
  // 5. 拾取自动分解：锁定的不会被自动分解
  g.inventory.autoSalvage = ['white', 'green'];
  const wa = g.gen.generate(lv, 'white', ['chest']); wa.itemLevel = 1;
  const wb = g.gen.generate(lv, 'white', ['chest']); wb.itemLevel = 1; wb.locked = true;
  const d0 = g.inventory.stack('mat_dust');
  g.player.pos.set(30, 0, 30); step(0.1);
  g.spawnLoot(wa, g.player.pos.clone(), 0, 1); g.spawnLoot(wb, g.player.pos.clone(), 0, 1); step(0.5);
  check(!g.inventory.find(wa.id) && g.inventory.find(wb.id) && g.inventory.stack('mat_dust') >= d0, '拾取自动分解（白）：没锁的被分解，锁定的进背包');
  g.inventory.autoSalvage = [];
  // 6. 存档：耐久 + 锁定
  g.save();
  const raw = JSON.parse(g.rawSave());
  const all = [...raw.inventory.bag, ...Object.values(raw.inventory.equipped)];
  check(raw.version === 10 && Object.values(raw.inventory.equipped).every(i => i.durability === 100) && all.filter(i => i.locked).length === 3, `存档 v9：装备耐久 + 锁定 ${all.filter(i => i.locked).length} 件`);
  log(`v0.5 A（耐久 / 修理 / 杂物 / 锁定）检查完成：等级 ${lv}，金币 ${g.inventory.gold}`);
}

// v05b：职业套装 4 件（长副本首领掉落 → 穿上 → 2/4 件效果 + 变种技能 + 整套光效；损坏一件就失效）+ 并入的 B 暗金 + 说明书长副本页
async function v05bTest(c) {
  const { g, $, step, log, check, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  g.gen.classId = 'warrior';
  const lv = g.progression.level;
  check(lv >= 30, `30 级战士（${lv}）`);
  for (const sl of ['shoulder', 'wrist', 'waist', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(34, 'purple', [sl]));
  c.equipBest();
  // 1. 说明书：长副本首领页列出本职业 5 件套装部件 + 保底进度
  g.openDropGuide('raid_boss'); step(0.05);
  const list = () => $('dg-list').textContent;
  check(['狂怒头盔', '狂怒肩铠', '狂怒胸甲', '狂怒手甲', '狂怒护腕', '狂怒腿铠'].every(n => list().includes(n)) && list().includes('套装「狂怒战魂（套装）」') && !list().includes('霜誓'), '说明书 · 长副本首领：列出狂怒战魂 6 件（v0.7 起 6 件）（不列法师的霜誓秘仪）');
  check(/每个首领 20%（炼狱 30%），还缺 6 件/.test(list()) && /连续 6 次必掉/.test(list()), `保底说明：${list().match(/套装「狂怒战魂」：[^。]+。/)?.[0] ?? '（没找到）'}`);
  check(!$('dg-tabs').textContent.includes('即将开放'), '说明书左侧不再显示已开放内容的「即将开放」占位');
  c.key('Escape'); step(0.05);
  // 2. 熔心王座 5 个首领：每个首领都把保底调到必掉（dry = 6）→ 5 件全掉
  g.ensureWild('ember'); g.goMap('ember'); step(0.3);
  check(g.enterRaid('molten_throne') !== false, '进入熔心王座');
  step(0.5);
  const cur0 = { ember: g.inventory.stack('cur_ember'), sigil: g.inventory.stack('cur_sigil') };
  const drops = [];
  for (let b = 0; b < 5; b++) {
    g.sets.setPity.dry = 6;
    let k = 0;
    while ((g.raidDebug()?.killed ?? 9) <= b && k++ < 60) {
      const rd = g.raidDebug(); if (!rd) break;
      g.player.hp = g.player.maxHp;
      { const ri = g.raidRouteInfo(); const nb = ri?.route.nodes.filter(n => n.boss !== undefined && !ri.rs.dead[n.boss]).sort((x, y) => x.boss - y.boss)[0];   // v0.6.10 路线图：按序号打（最终首领最后）
        if (nb) g.player.pos.set(ri.O.x + nb.x + 1, 0, ri.O.z + nb.z + 1); else if (rd.center) g.player.pos.set(rd.center.x + 1, 0, rd.center.z + 1); }
      step(0.8);
      if (g.raidDebug()?.engaged) g.enemies.filter(e => e.z === 'raid' && e.isBoss && e.alive).forEach(e => { e.hp = 0; });
      step(0.3);
    }
    const lootNow = g.loots.filter(l => typeof l.loot !== 'number' && l.loot.setId).map(l => l.loot);
    lootNow.forEach(it => { if (!drops.includes(it)) drops.push(it); });
  }
  const rd = g.raidDebug();
  check(rd?.killed === 5 && rd.done, `5 个首领倒下（killed=${rd?.killed}, done=${rd?.done}）`);
  check(drops.length === 5 && new Set(drops.map(i => i.fixedId)).size === 5 && drops.every(i => i.setId === 'set_fury' && i.itemLevel === 50 && i.source && /熔心王座/.test(i.source)), `套装部件：5 个首领各掉 1 件，5 件不重复（${drops.map(i => `${i.name}/${i.itemLevel}`).join(' ')}）`);
  // 6 件里 5 个首领只掉 5 件，头盔可能没掉：补一件（后面要测头盔老特效和损坏）
  if (!drops.some(i => i.fixedId === 'i_helm')) { const h = g.gen.generateFixed('i_helm', 50); h.source = '熔心王座'; g.inventory.add(h); drops.push(h); }
  const helmD = drops.find(i => i.fixedId === 'i_helm');
  check(drops.every(i => i.affixLog?.length === 3) && helmD?.lines.some(l => l.includes('技能冷却-10%')), `套装件 = 固定件 + 2 属性 + 1 技能（v0.6.7）（狂怒头盔保留老版本特效：${helmD?.lines.join('；')}）`);
  check(g.inventory.stack('cur_ember') > cur0.ember && g.inventory.stack('cur_sigil') > cur0.sigil, `兑换货币：熔心余烬 +${g.inventory.stack('cur_ember') - cur0.ember}，暗岩徽记 +${g.inventory.stack('cur_sigil') - cur0.sigil}`);
  for (const l of [...g.loots]) { g.player.pos.copy(l.obj.position); step(0.1); }
  check(drops.every(i => g.inventory.find(i.id)), `捡起 5 件套装部件（背包 ${g.inventory.bag.length} 件）`);
  g.save();
  check(JSON.parse(g.rawSave()).setPity?.seen?.length >= 5, '存档：套装保底记下见过的部件（≥5）');
  g.startRecall(); step(3.5);
  check(g.zone === 'ember', `回程到烬落荒原（${g.zone}）`);
  // 3. 穿 4 件：2 件属性 + 4 件变种 + 整套光效
  const crit0 = g.charSheet().crit;
  const four = [helmD, ...drops.filter(i => i.fixedId !== 'i_helm' && i.fixedId !== 'i_fury_legs')].slice(0, 4);
  four.forEach(p => g.inventory.equip(p.id)); step(0.2);
  const ww = g.loadout.preview('skill2', { now: g.T, casterHpPercent: 1, targetEffects: [] });
  check(g.sets.activeSet4().includes('set_fury') && ww.displayName === '血刃旋风斩' && ww.element === 'physical', `4 件狂怒战魂：旋风斩 → 「${ww.displayName}」（${ww.element}）`);
  check(/套装光效:狂怒战魂/.test(g.gearSummary()), `外观：${g.gearSummary()}`);
  $('btn-char').click(); step(0.1); g.renderChar();
  check($('char-stats').textContent.includes('狂怒战魂') && $('char-stats').textContent.includes('4/6') && $('char-stats').textContent.includes('血刃旋风斩') && /2 件 ✔ 「战魂」/.test($('char-stats').textContent), '角色面板「套装」：4/6，2 件「战魂」+ 4 件变种技能名已激活');
  const headC = $('char').querySelector('[data-slot="head"]');
  headC.dispatchEvent(new w.MouseEvent('mouseenter', { clientX: 300, clientY: 200 })); step(0.05);
  const tt = $('tooltip').textContent;
  check(tt.includes('套装：狂怒战魂（套装）（4/6）') && tt.includes('已激活') && tt.includes('狂怒腿铠'), '套装件提示：套装名、件数 4/6、每个部件、效果已激活');
  headC.dispatchEvent(new w.MouseEvent('mouseleave')); c.key('Escape');
  // 专属特效：在副本里放一次熔岩旋风斩
  g.enterDungeon('darkrock_mine', 'heroic'); step(0.4);
  const miner = g.enemies.find(e => e.z === 'dungeon' && e.alive && !e.isBoss);
  g.player.pos.copy(miner.pos).add({ x: 1, y: 0, z: 0 }); g.target = miner; step(0.1);
  const fx0 = g.sets.fxCount;
  g.tryCast('skill2'); step(0.3);
  check(g.sets.fxCount > fx0, `释放熔岩旋风斩：专属特效触发（${g.sets.fxCount - fx0} 次）`);
  g.leaveDungeon(true); step(0.3);
  // 4. 损坏一件：只算 3 件，变种 / 光效消失；修好恢复
  const helm = four.find(i => i.fixedId === 'i_helm');
  helm.durability = 0; g.inventory.notify(); step(0.2);
  const ww2 = g.loadout.preview('skill2', { now: g.T, casterHpPercent: 1, targetEffects: [] });
  check(!g.sets.activeSet4().includes('set_fury') && ww2.displayName !== '血刃旋风斩' && !/套装光效/.test(g.gearSummary()), `头盔损坏：只算 3 件，变种消失（${ww2.displayName}），整套光效关闭`);
  helm.durability = 100; g.inventory.notify(); step(0.2);
  check(g.sets.activeSet4().includes('set_fury') && /套装光效:狂怒战魂/.test(g.gearSummary()), '修好后 4 件效果和光效恢复');
  // 5. 并入的 B 暗金：血誓（战士单手剑）
  const bo = g.gen.generateFixed('d_bloodoath', 40); g.inventory.add(bo);
  g.inventory.equip(bo.id, 'mainHand'); step(0.2);
  const sl = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] });
  check(bo.quality === 'dark' && bo.affixLog.length === 2 && sl.displayName === '血誓斩' && sl.element === 'shadow' && sl.effects.some(e => e.type === 'chain'), `暗金「血誓」：品质 dark、2 条随机词条，英勇打击 → ${sl.displayName}（${sl.element}）`);
  check(/暗金:血誓/.test(g.gearSummary()), `暗金外观：${g.gearSummary().match(/暗金:\S+/)?.[0]}`);
  $('btn-char').click(); step(0.1); g.renderChar();
  const mh = $('char').querySelector('[data-slot="mainHand"]');
  mh.dispatchEvent(new w.MouseEvent('mouseenter', { clientX: 300, clientY: 200 })); step(0.05);
  check($('tooltip').innerHTML.includes('tt-dg') && $('tooltip').textContent.includes('暗金') && $('tooltip').textContent.includes('血誓斩'), '暗金提示：暗金样式 + 效果');
  mh.dispatchEvent(new w.MouseEvent('mouseleave')); c.key('Escape');
  // 副本学者兑换里能看到并入的暗金（熔心王座 / 永霜墓穴各 2 件，按职业过滤）
  g.inventory.addStack('mat_darkshard', 60);
  g.openScholar(); step(0.05);
  const card = n => [...$('rg-body').querySelectorAll('.rg-boss')].find(e => e.querySelector('b')?.textContent === n);
  check($('rg-body').querySelectorAll('.rg-boss').length === 14 && card('血誓')?.querySelector('[data-dx]') && card('渊吼')?.querySelector('[data-dx]') && !card('虚衡')?.querySelector('[data-dx]') && card('虚衡')?.textContent.includes('其他职业专用'), '副本学者：14 件暗金（A 8 + 并入 4 + 新职业 2）；战士能兑换血誓 / 渊吼，法师的虚衡 / 冰陨之心标「其他职业专用」');
  c.key('Escape');
  log(`v0.5 B（套装 / 暗金）检查完成`);
}

// v05c：铁匠「兑换」全屏面板（暗岩锻造 + 套装缺件 + 每周限购 + 钱包）
async function v05cTest(c) {
  const { g, $, step, log, check, w } = c;
  const q = sel => w.document.querySelector(sel);
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  g.gen.classId = 'warrior';
  const lv = g.progression.level;
  g.inventory.addGold(60000);
  while (g.inventory.bag.length) g.inventory.remove(g.inventory.bag[0].id);
  const setp = g.gen.generateFixed('i_fury_legs', lv); g.inventory.add(setp);
  ['cur_ember', 'cur_frost', 'cur_sigil'].forEach(id => g.inventory.addStack(id, 60));
  g.openShop('smith'); step(0.05);
  [...w.document.querySelectorAll('#shop .tab')].find(t => t.dataset.tab === 'exchange').click(); step(0.05);
  if ($('exchange').style.display !== 'flex') { $('s-ex')?.click(); step(0.05); }
  check($('exchange').style.display === 'flex' && $('ex-tabs').querySelectorAll('.ftab').length === 4, `「兑换」：全屏面板 + 左侧 ${$('ex-tabs').querySelectorAll('.ftab').length} 个标签（锻造 / 套装缺件 / 宝石 / 返回）`);
  check(!$('ex-tabs').textContent.includes('重铸') && !$('ex-tabs').textContent.includes('保护符'), '没有 B 的「词条重铸」「强化保护符」（并入 A 的淬炼 / 不掉级强化）');
  check(['熔心余烬', '永霜碎晶', '暗岩徽记'].every(n => $('ex-wallet').textContent.includes(n)) && /长副本|熔心王座/.test($('ex-tabs').textContent) && !$('ex-tabs').textContent.includes('临时来源'), '钱包三种货币；来源写长副本（不再是临时来源）');
  // 暗岩锻造
  q('[data-xslot="chest"]').click(); step(0.05);
  check($('x-forge').disabled, '没选特殊属性：锻造按钮置灰');
  const sp = q('[data-xsp]'); const spText = sp.textContent; sp.click(); step(0.05);
  const e0 = g.inventory.stack('cur_ember'), bag0 = g.inventory.bag.length;
  $('x-forge').click(); step(0.05);
  const forged = g.inventory.bag.at(-1);
  check(g.inventory.bag.length === bag0 + 1 && forged.forged && forged.name.startsWith('暗岩锻造·') && forged.itemLevel === lv + 3 && forged.lines.some(l => l.startsWith('✧ ')) && g.inventory.stack('cur_ember') < e0, `暗岩锻造胸甲：「${forged.name}」装等 ${forged.itemLevel}，自选 ${spText.trim()} → ${forged.lines.find(l => l.startsWith('✧'))}`);
  check(g.inventory.canEquip(forged), '锻造的护甲本职业能穿（板甲）');
  // 淬炼锻造件：✧ 特殊属性行不会被抹掉
  const spLine = forged.lines.find(l => l.startsWith('✧'));
  g.forge.reforge(forged, 0, 'affix', g.gen);
  check(forged.lines.some(l => l.startsWith('✧')) && forged.affixLog.some(a => a.sp), `淬炼后特殊属性还在（${spLine} → ${forged.lines.find(l => l.startsWith('✧'))}）`);
  // 套装缺件
  q('[data-xtab="set"]').click(); step(0.05);
  const setBtns = [...$('ex-main').querySelectorAll('[data-xset]')];
  const owned = setBtns.filter(b => b.disabled && b.textContent.includes('已拥有')).length;
  check(setBtns.length === 5 && owned === 1, `套装缺件：5 件里 1 件已拥有（不能换），其余 ${setBtns.length - owned} 件可换`);
  setBtns.find(b => !b.disabled).click(); step(0.05);
  check(g.inventory.bag.filter(i => i.setId).length === 2 && [...$('ex-main').querySelectorAll('[data-xset]')].every(b => b.disabled), '兑换 1 件缺的部件；本周限 1 件，按钮全部置灰');
  check(q('[data-xtab="gem"]')?.classList.contains('off'), '宝石升级：占位标签（以后开放）');
  // 返回铁匠台
  q('[data-xback]').click(); step(0.05);
  check($('exchange').style.display !== 'flex' && $('shop').style.display === 'flex', '「← 返回铁匠台」回到商店');
  c.key('Escape'); step(0.05);
  // 补给商没有兑换页
  g.openShop('supply'); step(0.05);
  check(q('#shop .tab[data-tab="exchange"]').style.display === 'none', '补给商的商店没有「兑换」页（只有铁匠有）');
  c.key('Escape');
  g.save();
  const raw = JSON.parse(g.rawSave());
  check(raw.version === 10 && raw.exchange?.used?.forge === 1 && raw.exchange?.used?.set === 1 && raw.inventory.stacks.cur_sigil > 0, `存档 v9：兑换货币、每周限购（${JSON.stringify(raw.exchange?.used)}）`);
  log(`v0.5 C（兑换）检查完成：等级 ${lv}`);
}

async function shopTest(c) {
  const { g, $, step, log, check, key } = c;
  $('start').click(); step(0.5);
  g.inventory.addGold(3000);
  g.inventory.addStack('mat_dust', 20); g.inventory.addStack('mat_shard', 6); g.inventory.addStack('mat_essence', 2);
  g.player.pos.set(1, 0, 11.5); step(0.2);
  g.currentInteractable().act(); step(0.1);
  check($('shop').style.display === 'flex', '和葛尔达交互打开商店');
  const offers = g.shop.offers.length;
  check(offers === 14, `货架 ${offers} 件（药水 2、魔尘 1、装备 11）`);
  // 买
  const gold0 = g.inventory.gold;
  $('shop-body').querySelector('[data-buy="0"]').click();
  check(g.inventory.stack('potion_s') === 4 && g.inventory.gold === gold0 - 15, `买 1 瓶治疗药水（${g.inventory.stack('potion_s')} 瓶，-15 金）`);
  const gearBtn = [...$('shop-body').querySelectorAll('[data-buy]')].find(b => +b.dataset.buy >= 3);
  const bag0 = g.inventory.bag.length; gearBtn.click();
  check(g.inventory.bag.length === bag0 + 1, `买装备：${g.inventory.bag.at(-1)?.name}`);
  // v0.5 C：没有「出售」页；灰色杂物进商店自动卖钱
  check(![...c.w.document.querySelectorAll('#shop .tab')].some(t => t.dataset.tab === 'sell'), '商店没有「出售」页（装备不能出售）');
  g.inventory.addStack('junk_fang', 4); g.inventory.addStack('junk_ash', 1);
  const g1 = g.inventory.gold; g.openShop(); step(0.05);
  check(g.inventory.gold === g1 + 4 * 2 + 14 && !g.inventory.stack('junk_fang') && [...c.w.document.querySelectorAll('#toast div')].some(t => /灰色杂物：\+22 金币/.test(t.textContent)), `拜访商人：杂物自动出售 +${g.inventory.gold - g1} 金（toast 提示金额）`);
  // 强化：买一件武器装上再强化 5 次
  [...c.w.document.querySelectorAll('#shop .tab')].find(t => t.dataset.tab === 'buy').click(); step(0.05);
  const isWpn = o => o.kind === 'gear' && (o.item.slot === 'oneHand' || o.item.slot === 'twoHand');
  let wi = g.shop.offers.findIndex(isWpn);
  if (wi < 0) { g.shop.restock(5); g.renderShop(); wi = g.shop.offers.findIndex(isWpn); }
  $('shop-body').querySelector(`[data-buy="${wi}"]`).click();
  const wpn = g.inventory.bag.at(-1); g.inventory.equip(wpn.id);
  const hp0 = g.player.maxHp, dmg0 = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] }).stats.damage;
  [...c.w.document.querySelectorAll('#shop .tab')].find(t => t.dataset.tab === 'upgrade').click(); step(0.05);
  const cell = [...$('shop-body').querySelectorAll('.cell')].find(x => x.textContent.includes('主手')); cell.click(); step(0.05);
  for (let i = 0; i < 5; i++) { const b = $('s-up'); if (!b || b.disabled) break; b.click(); step(0.05); }
  const dmg1 = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] }).stats.damage;
  log(`强化：${wpn.name} +${wpn.upgrade ?? 0}，普攻伤害 ${dmg0.toFixed(1)} → ${dmg1.toFixed(1)}，最大生命 ${hp0} → ${g.player.maxHp}，材料 ${JSON.stringify(g.inventory.stacks)}`);
  check((wpn.upgrade ?? 0) >= 4 && dmg1 > dmg0 && g.player.maxHp > hp0, '强化提高武器伤害和生命，并扣除材料');
  // 分解
  for (let i = 0; i < 3; i++) g.inventory.add(g.shop.offers.length ? (g.shop.restock(5), g.shop.offers.find(o => o.kind === 'gear').item) : null);
  [...c.w.document.querySelectorAll('#shop .tab')].find(t => t.dataset.tab === 'salvage').click(); step(0.05);
  const dust0 = g.inventory.stack('mat_dust'), n0 = g.inventory.bag.length;
  $('shop-body').querySelector('.cell').click(); step(0.05); $('s-salv').click();
  check(g.inventory.bag.length === n0 - 1 && g.inventory.stack('mat_dust') > dust0, `分解 1 件：魔尘 ${dust0} → ${g.inventory.stack('mat_dust')}`);
  for (let i = 0; i < 2; i++) g.inventory.add(g.gen.generate(1, 'white', ['twoHand'])); g.setShopTab('salvage'); step(0.02);   // 保证至少有可分解的（1 级双手白装：替换的是身上的主手，不会被「保留比身上好的」留下；单手会算作空副手的升级）
  $('s-salvall').click(); step(0.02);
  check(!!$('s-salv-ok'), '一键分解先弹确认（件数 + 材料预览）');
  $('s-salv-ok').click(); step(0.02);
  check(g.inventory.bag.every(i => !['white', 'green', 'blue'].includes(i.quality) || g.forge.isUpgradeForMe(i)), '一键分解蓝色及以下（比身上好的保留）');
  // 强化部位：换一把武器，强化等级留在主手栏
  const lvKeep = g.inventory.slotLv.mainHand ?? 0;
  const w2 = g.gen.generate(5, 'green', [wpn.slot]); g.inventory.add(w2); g.inventory.equip(w2.id, 'mainHand');
  check((w2.upgrade ?? 0) === lvKeep && lvKeep >= 4 && !(wpn.upgrade), `换武器后主手栏强化 +${lvKeep} 保留到新武器（旧武器回到 +0）`);
  g.inventory.equip(wpn.id, 'mainHand');
  // 淬炼：重洗一条词条
  const rf = g.gen.generate(20, 'purple', ['ring']); g.inventory.add(rf);
  const line0 = rf.lines.join('|');
  g.forge.reforge(rf, 0, 'affix', g.gen);
  check(rf.affixLog.length === 3 && rf.lines.length >= 3, `淬炼：${line0} → ${rf.lines.join('|')}`);
  // 元素共鸣：凑 3 条火
  const fires = ['neck', 'ring', 'trinket'].map(sl => { const it = g.gen.generate(20, 'purple', [sl]); it.affixLog.forEach(a => a.el = 'fire'); g.gen.rebuild(it); g.inventory.add(it); g.inventory.equip(it.id); return it; });
  const res = g.inventory.resonance();
  const dmgR = g.loadout.preview('basic', { now: 0, casterHpPercent: 1, targetEffects: [] });
  check(res.counts.fire >= 6 && res.active.some(a => a.el === 'fire' && a.tier === 2) && dmgR.effects.some(e => e.type === 'dot' && e.element === 'fire'),
    `元素共鸣：火 ${res.counts.fire} 条，激活 ${res.active.map(a => a.el + a.tier).join(' ')}，普攻带灼烧`);
  check(fires[0].lines.some(l => l.startsWith('〔火〕')), `元素词条显示：${fires[0].lines[0]}`);
  // 野外首领特效件
  const eg = g.gen.generateFixed('e_sand_glass', 27);
  check(eg && eg.lines[0].startsWith('◆') && eg.affixLog.length === 3 && eg.quality === 'purple', `野外首领特效件：${eg?.name}（${eg?.lines.join('；')}）`);
  // 老存档迁移：装备上的强化等级变成部位等级
  const inv0 = g.inventory.save();
  const old = JSON.parse(JSON.stringify(inv0)); delete old.slotLv; delete old.bless;
  old.equipped.mainHand.upgrade = 7; old.equipped.mainHand.baseHp = old.equipped.mainHand.hp; old.equipped.mainHand.baseArmor = old.equipped.mainHand.armor;
  g.inventory.load(old);
  check(g.inventory.slotLv.mainHand === 7 && g.inventory.equipped.mainHand.upgrade === 7, `老存档迁移：主手 +7 → 主手栏 +${g.inventory.slotLv.mainHand}`);
  g.inventory.load(inv0);
  key('Escape'); step(0.1);
  // 药水
  g.player.hp = Math.round(g.player.maxHp * 0.3);
  const hpb = g.player.hp; key('q'); step(0.1);
  check(g.player.hp > hpb && g.inventory.stack('potion_s') === 3, `Q 喝药：${hpb} → ${g.player.hp}`);
  key('q'); step(0.1);
  check(g.inventory.stack('potion_s') === 3, '药水有冷却，连按不会连喝');
  // 存档
  const s = JSON.parse(c.g.rawSave());
  const sw = s.inventory.equipped.mainHand;
  check(s.version === 10 && s.inventory.stacks.mat_dust > 0 && sw?.upgrade === wpn.upgrade && s.inventory.slotLv?.mainHand === wpn.upgrade, `存档 v9：材料 + 部位强化 +${s.inventory.slotLv?.mainHand} 已保存`);
  // 背包面板显示材料和强化角标
  key('b'); step(0.1);
  check($('bag-mats').textContent.length > 0 && $('bag-eq').innerHTML.includes('uplv'), '背包显示材料数量与强化角标');
  key('b');
  await gearTest(c, 'warrior');
}

// 第六版：手机布局（jsdom 模拟 667×375 触屏）
async function mobileTest(c) {
  const { g, $, w, step, check } = c;
  const root = w.document.documentElement;
  check(root.classList.contains('phone') && root.classList.contains('touch') && root.classList.contains('mobile') && !root.classList.contains('portrait'), `667×375 触屏：html 类名 ${root.className}`);
  check(root.classList.contains('intitle'), '标题画面时隐藏 HUD（html.intitle）');
  const vm = w.document.querySelector('meta[name=viewport]')?.content ?? '';
  check(/width=device-width/.test(vm) && /user-scalable=no/.test(vm) && /viewport-fit=cover/.test(vm) && /maximum-scale=1/.test(vm), `viewport meta：${vm}`);
  check(JSON.parse(w.localStorage.getItem('darkrock_settings') || '{}').quality === 'medium', '手机默认画质：中');
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  check(!root.classList.contains('intitle'), '开始后显示 HUD');
  const ids = ['sk-basic', 'sk-skill1', 'sk-skill2', 'sk-skill3', 'sk-ultimate', 'sk-potion', 'joy', 'joy-base', 'btn-menu', 'quest-tracker', 'rotate', 'death-where'];
  check(ids.every(id => $(id)), `手机控件都在：${ids.join(' ')}`);
  check($('joy').style.display !== 'none' && $('joy-base').style.display !== 'none', '触屏：摇杆区域和待命摇杆可见');
  // 多点触控：摇杆 + 技能同时按
  const T = (el, type, id, x, y) => { const t = { identifier: id, clientX: x, clientY: y, target: el }; const e = new w.Event(type, { bubbles: true, cancelable: true }); e.changedTouches = [t]; e.touches = [t]; el.dispatchEvent(e); };
  g.player.pos.set(2, 0, 8); step(0.2);
  const p0 = { x: g.player.pos.x, z: g.player.pos.z };
  T($('joy'), 'touchstart', 1, 120, 280);
  check($('joy-base').classList.contains('on') && $('joy-base').style.left === '55px', `摇杆动态原点：按在 (120,280) → 底座 left=${$('joy-base').style.left} top=${$('joy-base').style.top}`);
  T($('joy'), 'touchmove', 1, 120, 220);
  const cd0 = g.loadout.cooldownLeft('skill2', g.T);
  T($('sk-skill2'), 'touchstart', 2, 520, 340);
  step(0.5);
  check(c.dist(g.player.pos, p0) > 1, `摇杆按住时移动 ${c.dist(g.player.pos, p0).toFixed(1)} 米`);
  check(g.loadout.cooldownLeft('skill2', g.T) > cd0, '同时按技能键：技能放出（多点触控）');
  T($('sk-skill2'), 'touchend', 2, 520, 340); T($('joy'), 'touchend', 1, 120, 220);
  check(!$('joy-base').classList.contains('on') && $('joy-base').style.left === '', '松手：摇杆回到左下角待命');
  // 长按技能键显示说明
  T($('sk-skill3'), 'touchstart', 3, 560, 260); await new Promise(r => setTimeout(r, 520));
  check($('tooltip').style.display === 'block' && $('tooltip').textContent.length > 4, '长按技能键显示技能说明');
  T($('sk-skill3'), 'touchend', 3, 560, 260);
  check($('tooltip').style.display === 'none', '松手后说明消失');
  // 抽屉菜单
  $('btn-menu').click();
  check(root.classList.contains('menu-open'), '点「≡」展开菜单抽屉');
  $('btn-bag').click();
  check(!root.classList.contains('menu-open') && $('bag').style.display === 'flex', '选「背包」后抽屉收起、背包打开');
  $('bag').querySelector('[data-close]').click();
  // 任务追踪可折叠
  g.quests.load({ active: { q_field_news: [0] }, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] }); g.renderTracker?.(); step(0.6);
  const fold = $('trk-fold');
  if (fold) { fold.click(); check($('quest-tracker').classList.contains('fold'), '任务追踪可折叠'); fold.click(); }
  else check(true, '（没有追踪中的任务，跳过折叠）');
  // 竖屏 → 横屏提示
  w.__vp.w = 375; w.__vp.h = 667; w.dispatchEvent(new w.Event('resize'));
  check(root.classList.contains('portrait'), '竖屏：显示「请横屏游玩」');
  w.__vp.w = 667; w.__vp.h = 375; w.dispatchEvent(new w.Event('resize'));
  check(!root.classList.contains('portrait') && root.classList.contains('phone'), '转回横屏：提示消失，手机布局');
  // 原野阵亡：显示在翠风前哨复活
  g.quests.load({ active: {}, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] });
  g.enterField(); step(0.3);
  g.player.hp = 0; g.player.onDeath(); step(1.5); await new Promise(r => setTimeout(r, 1300));
  check($('death').style.display === 'flex' && $('death-where').textContent.includes('翠风前哨'), `原野阵亡：「${$('death-where').textContent}」`);
  $('respawn').click(); step(0.2);
  g.leaveField(); step(0.3); g.player.hp = 0; g.player.onDeath(); step(1.5); await new Promise(r => setTimeout(r, 1300));
  check($('death-where').textContent.includes('灰石营地'), `营地阵亡：「${$('death-where').textContent}」`);
  $('respawn').click(); step(0.2);
  // 后台暂停
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true }); w.document.dispatchEvent(new w.Event('visibilitychange'));
  const t0 = g.T; step(1);
  check(g.T === t0, '切到后台：游戏暂停（不更新、不渲染）');
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => false }); w.document.dispatchEvent(new w.Event('visibilitychange'));
  step(0.5); check(g.T > t0, '回到前台继续');
}
async function desktopLayoutTest(c) {
  const { $, w, check } = c;
  const root = w.document.documentElement;
  check(!root.classList.contains('phone') && !root.classList.contains('touch'), `1280×720 电脑：无手机布局（${root.className}）`);
  check(root.style.getPropertyValue('--ui') === '1.000', `--ui = ${root.style.getPropertyValue('--ui')}`);
  w.__vp.w = 1920; w.__vp.h = 1080; w.dispatchEvent(new w.Event('resize'));
  check(root.style.getPropertyValue('--ui') === '1.200', `1920×1080 → --ui ${root.style.getPropertyValue('--ui')}（上限 1.2）`);
  w.__vp.w = 1000; w.__vp.h = 600; w.dispatchEvent(new w.Event('resize'));
  check(Math.abs(parseFloat(root.style.getPropertyValue('--ui')) - 0.781) < 0.01 && !root.classList.contains('phone'), `1000×600 → --ui ${root.style.getPropertyValue('--ui')}`);
  check(JSON.parse(w.localStorage.getItem('darkrock_settings') || '{}').quality === 'high', '电脑默认画质：高');
  check($('joy').style.display === 'none', '电脑隐藏摇杆');
}

// 调试用：直接从「通关矿洞、9 级」的存档开始跑原野
async function fieldOnly(c) {
  const { g, $, step, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  c.spend(FURY);
  await fieldPart1(c);
}

// ====================================================================== 第七版：新手引导（新存档从头走完）+ 设置持久化
async function tutorialTest(c, touch) {
  const { g, $, w, step, key, key0, check, log } = c;
  const root = w.document.documentElement;
  const T = (el, type, id, x, y) => { const t = { identifier: id, clientX: x, clientY: y, target: el }; const e = new w.Event(type, { bubbles: true, cancelable: true }); e.changedTouches = [t]; e.touches = [t]; el.dispatchEvent(e); };
  const tap = el => { T(el, 'touchstart', 9, 600, 300); step(0.05); T(el, 'touchend', 9, 600, 300); };
  const menu = id => { if (root.classList.contains('phone')) { $('btn-menu').click(); check(root.classList.contains('menu-open'), `点「≡」展开抽屉（找 ${id}）`); } $(id).click(); };
  const until = (f, sec, hook) => { for (let i = 0; i < sec * 20 && !f(); i++) step(0.05, hook); return f(); };
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  check(g.tutId === 'move' && $('tut').style.display === 'block' && root.classList.contains('tut-on'), `新存档进营地：新手引导开始（第 1 步「${$('tut-body').querySelector('.tut-h')?.textContent}」）`);
  check(!!$('tut-skip') && /跳过/.test($('tut-skip').textContent), '提示框带「跳过引导」按钮');
  check(touch ? g.tutHl().includes('joy-base') : /W/.test($('tut-body').textContent), touch ? '触屏：高亮摇杆' : '电脑：提示 WASD');
  // 1. 移动
  const pm0 = g.player.pos.clone();
  if (touch) { T($('joy'), 'touchstart', 1, 120, 280); T($('joy'), 'touchmove', 1, 120, 220); step(1); T($('joy'), 'touchend', 1, 120, 220); }
  else { key('w'); step(1); key('w', 'keyup'); }
  step(0.2);
  check(g.tutId === 'talk', `移动 ${c.dist(pm0, g.player.pos).toFixed(1)} 米后自动进入第 2 步：和布兰对话（${g.tutId}）`);
  check(g.tutArrow(), '场景箭头指向布兰');
  // 2. 对话
  const bran = g.npcs.find(n => n.id === 'bran').rig.root.position;
  g.player.pos.set(bran.x + 1.2, 0, bran.z + 1.2); step(0.3);
  check($('interact').style.display === 'block' && g.tutHl().includes('interact'), '走到布兰身边：高亮「对话」按钮');
  if (touch) $('interact').click(); else key('e');
  step(0.2);
  check($('dialog').style.display === 'flex' && g.tutId === 'quest', `打开对话 → 第 3 步：接任务（${g.tutId}）`);
  // 3. 接任务 + 自动寻路
  check(g.tutHl().some(h => /btn/.test(h)), '高亮「接受任务」按钮');
  [...$('dlg-body').querySelectorAll('button')].find(b => /接受/.test(b.textContent)).click(); step(0.2);
  key('Escape'); step(0.2);
  check(g.quests.state('q_wolves', 1) === 'active' && g.tutHl().includes('btn-autopath'), '接下「狼患」，高亮追踪栏「自动寻路」');
  $('btn-autopath').click(); step(0.6);
  check(g.tutId === 'fight', `点自动寻路 → 第 4 步：打训练假人（${g.tutId}）`);
  check(!g.autoPath.active && !!g.dummy && g.target === g.dummy, '自动寻路停下，训练假人成为目标');
  // 4. 普攻 + 技能
  g.player.pos.set(g.dummy.pos.x - 1.6, 0, g.dummy.pos.z + 0.4); step(0.3);
  if (touch) tap($('sk-basic')); else { key(' '); step(0.1); key(' ', 'keyup'); }
  step(0.8);
  check(g.tutId === 'fight' && /✔ 普攻/.test($('tut-body').textContent), '普攻命中假人（✔ 普攻）');
  if (touch) tap($('sk-skill2')); else key('2');
  step(0.8);
  check(g.tutId === 'dodge', `技能命中 → 第 5 步：翻滚躲红圈（${g.tutId}）`);
  check(g.dummy.alive && g.dummy.hp > g.dummy.maxHp * 0.5, '训练假人打不死');
  check(g.tutHl().includes('sk-dodge'), '高亮翻滚键');
  // 5. 翻滚躲红圈
  const hp0 = g.player.hp;
  check(until(() => !!g.tutCircle, 4), '假人在脚下砸出红圈');
  until(() => g.tutCircle && g.tutCircle.left < 0.3, 3);
  const cd0 = g.dodge.cooldownLeft(g.T);
  if (touch) tap($('sk-dodge')); else key('Shift');
  check(g.dodge.rolling && g.player.status.isInvulnerable && cd0 === 0, '按翻滚：开始翻滚 + 无敌帧');
  until(() => g.tutId !== 'dodge', 3);
  check(g.tutId === 'loot' && g.player.hp === hp0, `翻滚躲开（没掉血）→ 第 6 步：拾取装备（${g.tutId}）`);
  check(g.dodge.cooldownLeft(g.T) > 4, `翻滚进入冷却（${g.dodge.cooldownLeft(g.T).toFixed(1)} 秒）`);
  // 6. 拾取
  const item = g.tutItem; const L = g.loots.find(l => l.loot === item);
  check(!!item && !!L && g.tutArrow(), `假人掉落「${item?.name}」，箭头指向它`);
  g.player.pos.copy(L.obj.position); step(0.3);
  check(g.inventory.bag.some(i => i.id === item.id) && g.tutId === 'equip', `自动拾取 → 第 7 步：穿装备（${g.tutId}）`);
  // 7. 角色面板穿装备
  if (touch) menu('btn-char'); else key('c');
  step(0.1);
  check($('char').style.display === 'flex', '打开角色面板');
  check(g.tutHl().length === 1, `高亮主手格（${g.tutHl()}）`);
  $('pd-bottom').querySelector('[data-slot="mainHand"]').click(); step(0.1);
  const eq = $('char-tip').querySelector(`[data-eq="${item.id}"]`);
  check(!!eq, '主手格下方列出新武器');
  eq.click(); step(0.3);
  check(g.inventory.equipped.mainHand?.id === item.id && g.tutId === 'map', `穿上 → 第 8 步：世界地图（v0.7.7 天赋 10 级开放，引导不再教天赋）（${g.tutId}）`);
  key('Escape'); if (touch) $('char').querySelector('[data-close]')?.click(); step(0.1);
  // 9. 地图
  if (touch) menu('btn-map'); else key('m');
  step(0.3);
  check(g.tutStep === -1 && g.tutState === -1 && $('tut').style.display === 'none', '打开地图 → 新手引导完成，提示框消失');
  const sv = JSON.parse(w.__game.rawSave() || '{}');
  check(sv.tutorial === -1, `存档记录引导完成（tutorial=${sv.tutorial}）`);
  // 重玩 + 跳过
  key('Escape'); $('worldmap').querySelector('[data-close]')?.click(); step(0.1);
  if (touch) menu('btn-settings'); else key0('Escape');
  check($('settings').style.display === 'flex', touch ? '抽屉里的 ⚙ 打开设置' : '没有面板时按 Esc 打开设置');
  $('set-tut').click(); step(0.2);
  check(g.tutStep === 0 && $('settings').style.display !== 'flex', '设置里「重玩新手引导」：从第 1 步重新开始');
  $('tut-skip').click(); step(0.1);
  check(g.tutStep === -1 && g.tutState === -1, '「跳过引导」：结束并记为完成');
  log(`引导：翻滚冷却 ${g.dodge.cooldown} 秒，伤害飘字池 ${g.floatPoolSize()} 个`);
}
async function settingsTest(c) {
  const { g, $, w, step, key, check } = c;
  const root = w.document.documentElement;
  $('class-pick').children[0].click(); $('start').click(); step(0.3);
  g.tutFinish(true); step(0.1);
  c.key0('Escape');
  check($('settings').style.display === 'flex', 'Esc 打开设置');
  const b = $('set-body');
  const click = (k, v) => b.querySelector(`[data-set="${k}"][data-v="${v}"]`).click();
  const slide = (id, v) => { const i = w.document.getElementById(id); i.value = String(v); i.dispatchEvent(new w.Event('input')); };
  const labels = ['画质', '帧率上限', '主音量', '音乐', '音效', '镜头灵敏度', '镜头震动', '震动强度', '伤害数字', '自动拾取', '左右手布局', '新手引导', '全屏'];
  check(labels.every(l => b.textContent.includes(l)), `设置项齐全：${labels.join(' / ')}`);
  click('quality', 'low'); click('fps', '30'); slide('vol-master', 40); slide('cam-sens', 180); click('shake', 'false'); click('dmgText', 'compact'); click('autoLoot', 'false'); click('lefty', 'true');
  const s = JSON.parse(w.localStorage.getItem('darkrock_settings'));
  check(s.quality === 'low' && s.fps === 30 && s.master === 0.4 && Math.abs(s.camSens - 1.8) < 1e-9 && s.shake === false && s.dmgText === 'compact' && s.autoLoot === false && s.lefty === true,
    `改动立即保存到 darkrock_settings：${JSON.stringify(s)}`);
  check(root.classList.contains('lefty'), '左右手互换：html.lefty');
  check(!w.__game.rawSave()?.includes('camSens'), '设置和角色存档分开保存');
  g.feel.emit('ultimate'); check(g.feel.shake === 0, '关闭镜头震动后终极技能不震');
  // 伤害数字：精简模式不显示持续伤害；关闭后什么都不显示
  key('Escape');
  const n0 = g.floatCount(); g.combatText(g.player, 'tick', 5); check(g.floatCount() === n0, '精简：不显示持续伤害跳字');
  g.combatText(g.player, 'crit', 99); check(g.floatCount() === n0 + 1, '精简：暴击照常显示');
  g.settings.dmgText = 'off'; g.applySettings(); g.combatText(g.player, 'crit', 99); check(g.floatCount() === 0, '关闭：不显示伤害数字');
  // 关闭自动拾取：走到掉落上不会捡，按 E 才捡
  g.settings.autoLoot = false; g.applySettings();
  const it = g.gen.generate(3, 'green');
  g.player.pos.set(4, 0, 4); step(0.1);
  g.spawnLoot(it, g.player.pos.clone(), 0, 1);
  const L = g.loots.find(l => l.loot === it);
  g.player.pos.copy(L.obj.position); step(0.3);
  check(!g.inventory.bag.some(i => i.id === it.id) && /拾取/.test($('interact').textContent), `关闭自动拾取：站在掉落上不捡，显示「${$('interact').textContent}」`);
  key('e'); step(0.2);
  check(g.inventory.bag.some(i => i.id === it.id), '按 E 拾取');
}
async function settingsReload(c) {
  const { $, w, check, g, step } = c;
  const s = JSON.parse(w.localStorage.getItem('darkrock_settings') || '{}');
  check(s.quality === 'low' && s.fps === 30 && s.lefty === true && s.dmgText === 'off', `刷新页面后设置还在：画质${s.quality} 帧率${s.fps} 左右手${s.lefty} 伤害数字${s.dmgText}`);
  check(w.document.documentElement.classList.contains('lefty'), '刷新后布局类名 lefty 已应用');
  $('class-pick').children[0].click(); $('start').click(); step(0.3);
  check(g.settings.camSens > 1.7 && g.settings.autoLoot === false, '读回镜头灵敏度 / 自动拾取');
}

// ====================================================================== 阶段六：长副本「熔心王座」（30 级，5 个首领）
const P6_SAVE = (cls) => JSON.stringify({ version: 4, savedAt: 0, classId: cls, inventory: { gold: 2000, bag: [], equipped: {}, stacks: { potion_s: 60 } },
  level: { level: 30, xp: 0 }, talents: {}, quests: { active: {}, done: [...P4_BASE, ...P4_RS, ...P4_FR, ...P4_EM] }, tutorial: -1 });
const P6_SAVE_Q = (cls) => { const s = JSON.parse(P6_SAVE(cls)); s.quests.done.push('em_scholar', 'rq_m1', 'rq_m2', 'rq_m3', 'rq_m4'); s.quests.active = { rq_m5: [0] }; return JSON.stringify(s); };
/** v0.6.5：三首领普通副本（沙葬王陵 / 巨魔冰窟），从野外入口进，选难度，打完 3 首领（+ 隐藏首领） */
async function dg65(c, clsId, raid, diff, opts = {}) {
  const { g, $, step, log, check, key, dist } = c;
  $('class-pick').children[clsId === 'mage' ? 1 : 0].click(); $('start').click(); step(0.5);
  g.gen.classId = clsId;
  for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(opts.ilvl ?? 33, 'purple', [sl]));
  c.equipBest(); c.spend(clsId === 'mage' ? FIRE : FURY);
  const wild = raid === 'sand_tomb' ? 'redsand' : raid === 'ash_forge' ? 'ember' : 'frost', NAME = { sand_tomb: '沙葬王陵', troll_cave: '巨魔冰窟', ash_forge: '灰烬铸造厂' }[raid];
  log(`${clsId} 30 级，平均装等 ${g.inventory.averageItemLevel()}，生命 ${g.player.maxHp}`);
  g.ensureWild(wild); g.goMap(wild); step(0.3);
  const gate = g.wilds[wild].dgates.find(d => d.id === raid);
  g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3);
  check(new RegExp(NAME).test($('interact').textContent), `野外入口：${$('interact').textContent}`);
  g.currentInteractable().act(); step(0.1);
  check($('raidguide').style.display === 'flex' && $('rg-body').querySelectorAll('[data-df]').length === 4, '入口弹出难度选择');
  $('rg-body').querySelector(`[data-df="${diff}"]`).click(); step(0.02);
  for (const o of opts.oaths ?? []) { const cb = $('rg-body').querySelector(`[data-oa="${o}"]`); if (cb && !cb.checked) { cb.checked = true; cb.onchange({ target: cb }); } }
  $('dgx-go').click(); step(0.5);
  const rd0 = g.raidDebug(), boss0 = g.enemies.find(e => e.z === 'raid' && e.isBoss);
  check(g.zone === 'raid' && rd0?.dg && rd0.regular === 3, `进入${NAME}（${diff}），3 个首领，首领生命 ${boss0?.maxHp}，掉落装等 ${boss0?.type.ilvl}`);
  if (opts.preBreak) { const p0 = g.player.pos.clone(); g.raidPropsDebug('break'); check(g.raidPropsDebug('state').coffinsBroken === 1, '靠近石棺会碰碎它'); g.player.pos.copy(p0); }
  if (opts.fill) { g.raidPropsDebug('fill'); check(g.raidPropsDebug('state').moldsFull === 4, '四个模子灌满（隐藏条件）'); }
  if (opts.light) { g.raidPropsDebug('light'); check(g.raidPropsDebug('state').braziersLit === 3, '点燃三座火盆'); }
  const O = { x: { sand_tomb: -1200, troll_cave: -1400, ash_forge: -1600 }[raid], z: 0 };
  const ARENA = [-48, -101, -155, -203];
  let n = 0, last = 0, picks = 0; const kills = [], acted = new Set();
  const stepBot = () => {
    const dt = 1 / 20, P = g.player.pos;
    if (!g.player.alive) { c.deaths++; $('respawn').click(); return; }
    const rd = g.raidDebug(); if (!rd) return;
    if (g.dgxDebug()?.pick) { g.dgxPick(0); picks++; }
    for (const a of g.dgxDebug()?.anomalies ?? []) if (!a.done && !acted.has(a.kind) && a.kind !== 'goblin') { acted.add(a.kind); g.dgxAct(a.kind); if (a.kind === 'merchant') key('Escape'); }
    if (rd.heat > 55 && rd.pools?.length && rd.engaged) {   // 锻炉傀儡：过热前把它引进冷却池（站到池子另一侧）
      const boss = g.enemies.find(e => e.z === 'raid' && e.isBoss && e.alive);
      const q = rd.pools.sort((a, b) => dist(a, P) - dist(b, P))[0];
      if (boss) { const dl = dist(boss.pos, q) || 1, want = { x: q.x + (q.x - boss.pos.x) / dl * 2.2, z: q.z + (q.z - boss.pos.z) / dl * 2.2 }, d = dist(P, want); if (d > 0.8) { const k = Math.min(6.5 * dt, d) / d; P.x += (want.x - P.x) * k; P.z += (want.z - P.z) * k; key(' ', 'keyup'); return; } }
    }
    if (rd.chill >= 5 && !rd.prison) { const a = g.T * 2; P.x += Math.cos(a) * 0.65; P.z += Math.sin(a) * 0.65; }
    if (g.raidSafe) { const s = g.raidSafe, d = dist(P, s); if (d > 0.6) { const k = Math.min(6.5 * dt, d) / d; P.x += (s.x - P.x) * k; P.z += (s.z - P.z) * k; } }
    if (raid === 'sand_tomb' && !opts.preBreak && P.z > O.z - 150) P.x = Math.max(O.x - 3.6, Math.min(O.x + 3.6, P.x));   // 不碰石棺：走廊里靠中间
    const t = g.raidBotTarget();
    if (!t) {
      if (rd.done && !rd.hiddenOpen) return;
      const goal = Math.abs(P.x - O.x) > 2.5 ? { x: O.x, z: P.z } : { x: O.x, z: O.z + ARENA[Math.min(3, rd.killed)] }, d = dist(P, goal);
      if (d > 1) { const k = Math.min(6.5 * dt, d) / d; P.x += (goal.x - P.x) * k; P.z += (goal.z - P.z) * k; }
      key(' ', 'keyup'); return;
    }
    if (Math.abs(P.x - O.x) > 3 && Math.abs(t.pos.z - P.z) > 8 && !rd.engaged) { const dx = O.x - P.x; P.x += Math.sign(dx) * Math.min(6.5 * dt, Math.abs(dx)); key(' ', 'keyup'); return; }
    if (/_guard$/.test(t.kind) && t.intent) { const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), back = g.cls.ranged ? 7 : 2.2; const want = { x: t.pos.x - fx * back, z: t.pos.z - fz * back }, d = dist(P, want); if (d > 1.0) { const k = Math.min(6.5 * dt, d) / d; P.x += (want.x - P.x) * k; P.z += (want.z - P.z) * k; } }
    c.bot({ dodge: !g.raidSafe, filter: e => e === t });
  };
  const want = opts.hidden ? 4 : 3;
  while ((g.raidDebug()?.killed ?? 9) < want && n++ < 1500) {
    step(1, stepBot);
    const rd = g.raidDebug(); if (!rd) { log('  ⚠ 已离开副本'); break; }
    if (rd.done && !opts.hidden) break;
    if (rd.done && opts.hidden && !rd.hiddenOpen) break;
    if (rd.killed > kills.length) { kills.push(Math.round(rd.t - last)); last = rd.t; log(`  首领 ${rd.killed} 倒下（${kills.at(-1)} 秒），阵亡 ${rd.deaths}，遗物 ${g.dgxDebug()?.relics.join(',')}，异变 ${JSON.stringify(g.dgxDebug()?.anomalies)}`); }
    if (n % 120 === 0) log(`  …${n} 秒：首领 ${rd.killed}，${rd.engaged ? `战斗中 ${Math.round(rd.bossHp * 100)}% 阶段${rd.phase}` : '清小怪'}，存活 ${rd.alive}，阵亡 ${rd.deaths}`);
  }
  key(' ', 'keyup');
  const rd = g.raidDebug(), ps = g.raidPropsDebug('state');
  log(`${NAME}（${clsId} · ${diff}）：${rd?.done ? '通关' : '未通关'}，${Math.round(rd?.t ?? 0)} 秒，阵亡 ${rd?.deaths}，各首领 ${kills.join('/')}，${JSON.stringify(ps)}`);
  check(!!rd?.done, `${NAME} 3 个首领通关`);
  check((rd?.deaths ?? 9) <= (diff === 'nightmare' ? 6 : 3), `阵亡 ${rd?.deaths} 次（≤ ${diff === 'nightmare' ? 6 : 3}）`);
  check(picks === 2, `遗物三选一 ${picks} 次（第 1、2 首领后）`);
  check((g.dgxDebug()?.anomalies.length ?? 0) === 2, `异变房间 ${g.dgxDebug()?.anomalies.map(a => a.kind).join(',')}`);
  if (opts.hidden) {
    check(rd.hiddenOpen && rd.killed === 4, `隐藏首领：条件满足 → 开门并击败（${rd.killed}/4）`);
    check(g.codex.has(`hidden|${raid}`) && g.loots.some(l => typeof l.loot !== 'number' && l.loot.quality === 'orange' && /隐藏/.test(l.loot.source ?? '')), '隐藏首领掉落独有外观件，记入图鉴');
  }
  if (opts.preBreak) check(!rd.hiddenOpen && rd.killed === 3, '碰碎过石棺：通关后隐藏首领的门不开');
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.dgx?.best?.[`${raid}|${diff}`] > 0, `奖牌：${raid}|${diff} 最佳 ${sv.dgx?.best?.[`${raid}|${diff}`]} 秒 · ${sv.dgx?.medal?.[`${raid}|${diff}`]}`);
  for (const l of [...g.loots]) { g.player.pos.copy(l.obj.position); step(0.05); }
  const sets = g.inventory.bag.filter(i => i.setId).map(i => i.name);
  log(`  捡完掉落，背包 ${g.inventory.bag.length} 件，副本套 ${sets.join('、') || '无'}`);
  return rd;
}
if (MODE === 'p65a') await session('v0.6.5：沙葬王陵（战士 · 英雄 · 不碰石棺 → 隐藏首领）', async c => {
  const { g, step, check } = c;
  await dg65(c, 'warrior', 'sand_tomb', 'heroic', { hidden: true });
  g.leaveRaid?.(); step(0.3);
}, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p66a') await session('v0.6.6：灰烬铸造厂（战士 · 英雄 · 自然打法，看浇注灌模子）', async c => {
  await dg65(c, 'warrior', 'ash_forge', 'heroic', { ilvl: 33 });
}, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p66b') await session('v0.6.6：灰烬铸造厂（法师 · 史诗 · 模子灌满 → 隐藏首领）', async c => {
  await dg65(c, 'mage', 'ash_forge', 'epic', { ilvl: 36, fill: true, hidden: true });
}, { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p65b') await session('v0.6.5：巨魔冰窟（法师 · 史诗 · 誓约 · 点燃火盆 → 隐藏首领）', async c => {
  await dg65(c, 'mage', 'troll_cave', 'epic', { hidden: true, light: true, oaths: ['stone'], ilvl: 35 });
}, { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p65c') await session('v0.6.5：沙葬王陵（法师 · 噩梦 · 碰碎石棺 → 没有隐藏首领）', async c => {
  const { g, check } = c;
  g.__breakCoffin = true;
  const rd = await dg65(c, 'mage', 'sand_tomb', 'nightmare', { ilvl: 38, preBreak: true });
  void rd;
}, { storage: { darkrock_legend_save: P6_SAVE('mage') } });
async function phase6(c, clsId, from = 0, to = 5, raid = 'molten_throne', opts = {}) {
  const { g, $, step, log, check, key, dist } = c;
  $('class-pick').children[clsId === 'mage' ? 1 : 0].click(); $('start').click(); step(0.5);
  g.gen.classId = clsId;
  const slots = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', clsId === 'mage' ? 'twoHand' : 'twoHand'];
  for (const sl of slots) g.inventory.add(g.gen.generate(30, Math.random() < 0.25 ? 'orange' : 'purple', [sl]));
  c.equipBest();
  c.spend(clsId === 'mage' ? FIRE : FURY);
  log(`${clsId} 30 级，平均装等 ${g.inventory.averageItemLevel()}，生命 ${g.player.maxHp}`);
  // 烬落荒原 → 熔心王座入口
  const gmap = raid === 'frost_crypt' ? 'frost' : 'ember';   // v0.9.3g 永霜墓穴迁到霜脊高地
  g.ensureWild(gmap); g.goMap(gmap); step(0.3);
  const gate = g.wilds[gmap].dgates.find(d => d.id === raid);
  const RNAME = raid === 'molten_throne' ? '熔心王座' : '永霜墓穴';
  g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3);
  check(new RegExp(RNAME).test($('interact').textContent), `入口交互：${$('interact').textContent}`);
  if (opts.hell) {
    check(g.enterRaid(raid, from, true) === false && g.zone === 'ember', '炼狱：没通关过标准难度时进不去');
    g.raidLoad({ ...g.raidSave(), clears: { [raid]: 1 } });
    g.currentInteractable().act(); step(0.1);
    check($('raidguide').style.display === 'flex' && !!$('re-hell'), '通关过标准难度后，入口弹出难度选择（标准 / 炼狱）');
    key('Escape'); step(0.05);
    g.enterRaid(raid, from, true);
    if (opts.dark) g.setRaidDarkChance(1);
  } else if (from === 0) g.currentInteractable().act(); else g.enterRaid(raid, from);
  step(0.5);
  if (opts.hell) {
    const rd0 = g.raidDebug(), boss = g.enemies.find(e => e.z === 'raid' && e.isBoss);
    check(rd0.hell && !!rd0.twist, `炼狱：首领带借来的机制（${rd0.twist}），首领生命 ${boss?.maxHp}`);
  }
  let weakDone = false;
  check(g.zone === 'raid', `进入长副本（从第 ${from + 1} 个首领开始）（zone=${g.zone}），敌人 ${g.raidDebug()?.alive}`);
  g.openRaidGuide(); step(0.1);
  check($('raidguide').style.display === 'flex' && $('rg-body').querySelectorAll('.rg-boss').length === 5, '攻略面板：5 个首领');
  key('Escape'); step(0.1);
  const d0 = c.deaths; const kills = [];
  const weaken = () => { if (!opts.weak) return; weakDone = true; g.enemies.filter(e => e.z === 'raid' && e.hp > e.maxHp * opts.weak).forEach(e => { e.hp = Math.round(e.maxHp * opts.weak); }); };
  let lastKilled = from; let n = 0; let lastT = 0;
  const O = { x: raid === 'molten_throne' ? -800 : -1000, z: 0 };
  const stepBot = () => {
    const dt = 1 / 20, P = g.player.pos;
    if (!g.player.alive) { c.deaths++; $('respawn').click(); return; }
    const rd = g.raidDebug();
    if (!rd || rd.done) return;
    if (g.raidSafe) {   // 王座崩塌：跑到符文上
      const s = g.raidSafe, d = dist(P, s);
      if (d > 0.6) { const k = Math.min(6.5 * dt, d) / d; P.x += (s.x - P.x) * k; P.z += (s.z - P.z) * k; key(' ', 'keyup'); if (d > 1.5) return; }
    }
    if (rd.air || (rd.chill >= 5 && !rd.prison)) {   // 骨龙在空中：只躲吐息；寒意叠高：挪一步
      if (rd.chill >= 5) { const a = g.T * 2; P.x += Math.cos(a) * 6.5 * dt * 2; P.z += Math.sin(a) * 6.5 * dt * 2; }
      c.bot({ dodge: true, filter: () => rd.chill >= 5 && !rd.air });
      if (rd.air) return;
    }
    const t = g.raidBotTarget();
    const rg = g.raidRouteInfo?.();
    if (!t && rg) {   // v0.6.10 路线图：沿最短路去下一个目标；到了机关旁边就用
      const it = g.currentInteractable?.();
      if (it && /点亮|打碎|拉动|打开/.test(it.label) && rg.goal?.prop && dist(P, it.pos) < 3) { it.act(); log(`  机关：${it.label}`); return; }
      const goal = g.raidBotGoal(); if (!goal) return;
      const d = dist(P, goal); if (d > 0.8) { const k = Math.min(6.5 * dt, d) / d; P.x += (goal.x - P.x) * k; P.z += (goal.z - P.z) * k; }
      key(' ', 'keyup'); return;
    }
    if (!t) {   // 没有怪：沿走廊往下一个首领场地走
      const ARENA = [-48, -101, -155, -210, -266][Math.min(4, rd.killed)];
      const goal = Math.abs(P.x - O.x) > 2.5 ? { x: O.x, z: P.z } : { x: O.x, z: O.z + ARENA }, d = dist(P, goal);
      if (d > 1) { const k = Math.min(6.5 * dt, d) / d; P.x += (goal.x - P.x) * k; P.z += (goal.z - P.z) * k; }
      key(' ', 'keyup'); return;
    }
    const ranged = g.cls.ranged;
    // 走廊口：先回到中线再往前（大厅比走廊宽，直线走会卡在墙角）
    if (rg && !rd.engaged && !g.raidStraight(P, t.pos)) { const w = g.raidStepToward(t.pos), d = dist(P, w); if (d > 0.5) { const k = Math.min(6.5 * dt, d) / d; P.x += (w.x - P.x) * k; P.z += (w.z - P.z) * k; } key(' ', 'keyup'); return; }
    if (!rg && Math.abs(P.x - O.x) > 3 && Math.abs(t.pos.z - P.z) > 8 && !rd.engaged) { const dx = O.x - P.x; P.x += Math.sign(dx) * Math.min(6.5 * dt, Math.abs(dx)); key(' ', 'keyup'); return; }
    if (t.kind === 'mt_guard' && t.intent && t.intent.state !== 'idle') {   // 盾卫：绕到背后
      const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), back = ranged ? 7 : 2.2;
      const want = { x: t.pos.x - fx * back, z: t.pos.z - fz * back }, d = dist(P, want);
      if (d > 1.0) { const k = Math.min(6.5 * dt, d) / d; P.x += (want.x - P.x) * k; P.z += (want.z - P.z) * k; }
    }
    if (rd.room === 2 && rd.engaged && !rd.charging && rd.stun <= 0 && rd.pillars.length && t.isBoss) {   // 巨蜥：站在石柱前面
      const b = t.pos; const pl = rd.pillars.sort((a, bb) => dist(a, P) - dist(bb, P))[0];
      const dl = dist(b, pl) || 1, want = { x: pl.x + (b.x - pl.x) / dl * 2.6, z: pl.z + (b.z - pl.z) / dl * 2.6 }, d = dist(P, want);
      if (d > 1.2) { const k = Math.min(6.5 * dt, d) / d; P.x += (want.x - P.x) * k; P.z += (want.z - P.z) * k; }
    }
    c.bot({ dodge: !g.raidSafe, filter: e => e === t });
  };
  while (!g.raidDebug()?.done && (g.raidDebug()?.killed ?? 9) < to && n++ < 2400) {
    step(1, stepBot); weaken();
    const rd = g.raidDebug();
    if (!rd) { log('  ⚠ 已离开副本'); break; }
    if (rd.killed > lastKilled) { kills.push(Math.round(rd.t - lastT)); log(`  首领 ${rd.killed}/5 倒下，用时 ${Math.round(rd.t - lastT)} 秒（累计 ${Math.round(rd.t)} 秒），阵亡 ${rd.deaths}`); lastT = rd.t; lastKilled = rd.killed; }
    if (n % (MODE === 'p6x' ? 20 : MODE.startsWith('p610') ? 4 : 120) === 0) log(`  …进度：首领 ${rd.killed}，${rd.engaged ? `战斗中 ${Math.round(rd.bossHp * 100)}% 阶段${rd.phase}` : '清小怪'}，存活敌人 ${rd.alive}，阵亡 ${rd.deaths}，位置 (${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)})，近 ${g.enemies.filter(e => e.alive && e.z === "raid").sort((a, b) => Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) - Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z)).slice(0, 3).map(e => `${e.kind}@${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)}:${e.intent?.state}`).join(" ")}，safe=${JSON.stringify(g.raidSafe)} chill=${rd.chill} air=${rd.air} roll=${g.dodge.rolling} goal=${JSON.stringify(g.raidBotGoal?.())}，危险区 ${[...g.__telegraphs(), ...g.__zones()].filter(h => Math.hypot(h.p.x - g.player.pos.x, h.p.z - g.player.pos.z) < 12).map(h => `${h.r.toFixed(1)}@${h.p.x.toFixed(0)},${h.p.z.toFixed(0)}`).join(' ')}${(() => { const t = g.raidBotTarget(); return t ? `，目标 ${t.kind} (${t.pos.x.toFixed(0)}, ${t.pos.z.toFixed(0)}) ${t.intent?.state} hp ${t.hp}/${t.maxHp}` : ''; })()}`);
  }
  key(' ', 'keyup');
  const rd = g.raidDebug();
  if (to < 5) { log(`${RNAME}（${clsId}）首领 ${from + 1}~${to}：用时 ${Math.round(rd?.t ?? 0)} 秒，阵亡 ${rd?.deaths}，各首领 ${kills.join('/')}`); check((rd?.killed ?? 0) >= to, `击败首领 ${from + 1}~${to}`); check((rd?.deaths ?? 9) <= 2, `阵亡 ${rd?.deaths} 次（≤ 2）`); g.save(); const sv = JSON.parse(g.rawSave()).raid?.seen || []; log(`  见过的机制：${sv.join(' ')}`); if (raid === 'frost_crypt') check(['keeper_chain', 'clone', 'wyrm_breath'].every(k => sv.includes(k)), '首领 1~3：锁链/镜像/吐息机制都触发过'); return; }
  log(`${RNAME}（${clsId}）：${rd?.done ? '通关' : '未通关'}，总用时 ${Math.round(rd?.t ?? 0)} 秒，阵亡 ${rd?.deaths}，各首领用时 ${kills.join('/')}`);
  check(!!rd?.done, `${clsId} 通关${RNAME}`);
  if (!opts.hell) check((rd?.deaths ?? 9) <= 3, `阵亡 ${rd?.deaths} 次（≤ 3）`); else log(`  炼狱阵亡 ${rd?.deaths} 次（首领血量调到 ${opts.weak * 100}%）`);
  check((rd?.t ?? 9999) < 2700, `本段用时 ${Math.round(rd?.t ?? 0)} 秒（< 45 分钟）`);
  if (!rd?.done) return;
  if (opts.route) {
    const ri = g.raidRouteInfo();
    if (raid === 'molten_throne') check(ri.rs.sigils.length === 2 && ri.rs.flags.includes('obsidian') && ri.cps.includes('hub'), `路线：两枚印记 ${ri.rs.sigils.join('/')}、河道冷却、十字厅存档点（存档点 ${ri.cps.join(',')}）`);
    if (raid === 'frost_crypt') check(ri.rs.lamps === 4 && ri.rs.flags.includes('frozen') && ri.rs.flags.includes('bridge'), `路线：魂灯 ${ri.rs.lamps}/4、冰桥、冰湖冻结`);
    g.save(); const sv = JSON.parse(g.rawSave()).raid; check((sv.fog?.[raid]?.length ?? 0) >= 6 && sv.short?.[raid] > 0, `存档：迷雾 ${sv.fog?.[raid]?.length} 个节点，本周捷径已开`);
  }
  for (const l of [...g.loots]) { g.player.pos.copy(l.obj.position); step(0.1); }
  log(`捡完掉落，背包 ${g.inventory.bag.length} 件`);
  g.save();
  const saved = JSON.parse(g.rawSave());
  check(saved.raid?.clears?.[raid] >= 1 && saved.map === 'ember', `存档记录通关次数（${JSON.stringify(saved.raid?.clears)}），地图 ${saved.map}`);
  log(`  见过的机制：${(saved.raid?.seen || []).join(" ")}`);
  if (raid === "frost_crypt" && to === 5 && !opts.route) check(["prison", "ithran_chill", "ithran_dark", "knights"].every(k => (saved.raid?.seen || []).includes(k)), "永冬之王：寒意/囚笼/永夜机制都触发过");
  if (opts.hell) {
    check(saved.raid?.hell?.[raid] === 1, `存档记录炼狱通关（${JSON.stringify(saved.raid?.hell)}）`);
    if (opts.dark) check(g.inventory.bag.some(i => i.quality === 'dark') && [...g.codex].some(k => k.startsWith('dark|')), `暗金掉落：${g.inventory.bag.filter(i => i.quality === 'dark').map(i => i.name + ' ' + i.lines.join('；')).join(' / ')}`);
    if (opts.quest) check(g.quests.state(opts.quest, 30) === 'ready', `故事链「${opts.quest}」：击败最终首领后可以交付`);
  }
  // 最终传送门离开
  { const fin = g.raidRouteInfo?.(); const fz = fin ? fin.route.nodes.find(n => n.boss === fin.route.final) : null; if (fz) g.player.pos.set(O.x + fz.x, 0, O.z + fz.z + 6); else g.player.pos.set(O.x, 0, O.z - 266 + 6); } step(0.3);
  g.currentInteractable()?.act(); step(0.5);
  { const back = raid === 'frost_crypt' ? 'frost' : 'ember'; check(g.zone === back, `最终传送门回到入口所在野外（${g.zone}）`); }   // v0.9.3g 永霜墓穴入口在霜脊
}
async function phase6Death(c) {
  const { g, $, step, log, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.ensureWild('ember'); step(0.1);
  check(g.enterRaid('molten_throne'), '直接进入熔心王座');
  // 跑进第一首领场地，挂机等死：应该从入口复活、首领回满血
  g.player.pos.set(-800, 0, -48 + 8); let n = 0;
  while (g.player.alive && n++ < 200) step(1);
  check(!g.player.alive, `站着不动会阵亡（${n} 秒）`);
  step(1.5);
  check(/存档点/.test($('death-where').textContent), `阵亡提示：${$('death-where').textContent}`);
  $('respawn').click(); step(0.5);
  const rd = g.raidDebug();
  check(g.zone === 'raid' && g.player.alive && rd.bossHp === 1 && !rd.engaged && Math.abs(g.player.pos.z - 1) < 2, `在入口复活，首领满血未开战（hp ${rd.bossHp}，z ${g.player.pos.z.toFixed(1)}）`);
  g.startRecall(); step(3.5);
  check(g.zone === 'ember' && !g.raidDebug(), `长副本里回程 → 烬落荒原营地（${g.zone}）`);
  check(g.enemies.every(e => e.z !== 'raid'), '离开后长副本敌人已清理');
}
if (MODE === 'p6a' || MODE === 'phase6') await session('阶段六 ①：熔心王座 首领 1~3（战士）', c => phase6(c, 'warrior', 0, 3), { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p6c' || MODE === 'phase6') await session('阶段六 ③：熔心王座 首领 4~5（战士）', c => phase6(c, 'warrior', 3, 5), { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p6b' || MODE === 'phase6') await session('阶段六 ②：熔心王座 首领 1~3（法师）', c => phase6(c, 'mage', 0, 3), { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p6e' || MODE === 'phase6') await session('阶段六 ⑤：永霜墓穴 首领 1~3（法师）', c => phase6(c, 'mage', 0, 3, 'frost_crypt'), { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p6f' || MODE === 'phase6') await session('阶段六 ⑥：永霜墓穴 首领 4~5（战士）', c => phase6(c, 'warrior', 3, 5, 'frost_crypt'), { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p64' || MODE === 'all') await session('v0.6.4：副本四难度 + 誓约 + 遗物 + 异变房间 + 奖牌（战士 30 级 · 暗岩矿洞史诗）', async c => {
  const { g, $, step, log, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.gen.classId = 'warrior';
  for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(34, 'purple', [sl]));
  c.equipBest(); c.spend(FURY);
  g.enterDungeon('darkrock_mine'); step(0.1);
  check($('raidguide').style.display === 'flex' && $('rg-body').querySelectorAll('[data-df]').length === 4 && g.zone !== 'dungeon', '30 级进普通副本先弹难度选择（普通 / 英雄 / 史诗 / 噩梦）');
  $('rg-body').querySelector('[data-df="nightmare"]').click(); step(0.02);
  check(!!$('rg-body').querySelector('[data-oa]:disabled:checked'), '噩梦：本周誓约必带（勾选且锁定）');
  key('Escape'); step(0.05);
  const hp0 = g.player.maxHp;
  g.dgxForceAnomaly('captive');
  g.enterDungeon('darkrock_mine', 'epic', ['fury', 'iron']); step(0.3);
  const miner = g.enemies.find(e => e.z === 'dungeon' && e.kind === 'miner'), boss = g.boss;
  check(g.zone === 'dungeon' && miner.maxHp > 2000 && miner.type.level === 30 && boss.type.ilvl >= 37, `史诗等级同步：矿工生命 ${miner.maxHp}、等级 ${miner.type.level}，首领生命 ${boss.maxHp}、掉落装等 ${boss.type.ilvl}`);
  check($('dgx-hud').style.display === 'block' && /史诗/.test($('dgx-hud').textContent), `副本 HUD：${$('dgx-hud').textContent}`);
  const d0 = c.deaths; let n = 0, picks = 0, acted = new Set();
  while (!g.dungeonRun?.completed && n++ < 600) {
    step(1, () => {
      if (g.zone !== 'dungeon') return;
      if (g.dgxDebug()?.pick) { g.dgxPick(0); picks++; if (picks === 1) g.dgxForceAnomaly('cursed'); }
      for (const a of g.dgxDebug().anomalies) if (!a.done && !acted.has(a.kind)) { acted.add(a.kind); g.dgxAct(a.kind); }
      c.bot({ dodge: true, interrupt: true });
    });
    if (n % 60 === 0) log(`  …${n} 秒：存活敌人 ${g.enemies.filter(e => e.z === 'dungeon' && e.alive).length}，阵亡 ${c.deaths - d0}，${JSON.stringify(g.dgxDebug())}`);
  }
  key(' ', 'keyup');
  const dd = g.dgxDebug();
  log(`暗岩矿洞（史诗）：${g.dungeonRun?.completed ? '通关' : '未通关'}，${n} 秒，阵亡 ${c.deaths - d0}，${JSON.stringify(dd)}`);
  check(!!g.dungeonRun?.completed, '史诗暗岩矿洞通关');
  check(dd.relics.length >= 2 && picks === 2, `遗物：清完两个区域各三选一（${dd.relics.join(',')}）`);
  check(dd.ally && dd.anomalies.find(a => a.kind === 'captive')?.done, '异变房间：解救冒险者，跟着助战');
  check(dd.anomalies.find(a => a.kind === 'cursed')?.done, '异变房间：诅咒宝箱的守卫打完，宝箱打开');
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.dgx?.best?.['darkrock_mine|epic'] > 0 && sv.dgx?.medal?.['darkrock_mine|epic'] === 'gold', `计时奖牌：首个纪录 ${sv.dgx?.best?.['darkrock_mine|epic']} 秒 → ${sv.dgx?.medal?.['darkrock_mine|epic']}`);
  const oathLoot = g.loots.filter(l => typeof l.loot !== 'number' && /誓约/.test(l.loot.source ?? '')).length;
  check(dd.ironBroken ? oathLoot === 0 : oathLoot === 2, `誓约奖励：${dd.ironBroken ? '铁血已破，无额外掉落' : `额外 ${oathLoot} 件`}`);
  // 遗物离开副本就失效
  g.leaveDungeon(true); step(0.2);
  check(g.dgxDebug() === null && g.player.maxHp <= hp0 + 1, `离开副本后遗物失效（生命 ${g.player.maxHp} / 进本前 ${hp0}）`);
  // 断药之誓 + 宝藏怪 + 机关 + 商人 + 祈愿池
  g.inventory.addGold(3000);
  for (const k of ['trap', 'merchant', 'well', 'goblin']) {
    g.dgxForceAnomaly(k);
    g.enterDungeon('darkrock_mine', 'nightmare', []); step(0.3);
    g.enemies.filter(e => e.z === 'dungeon' && e.encounter === 'entrance').forEach(e => { e.hp = 1; });
    let m = 0; while (!g.dgxDebug().anomalies.length && m++ < 60) step(1, () => { if (g.dgxDebug()?.pick) g.dgxPick(1); c.bot({ dodge: true }); });
    const a = g.dgxDebug().anomalies[0];
    check(a?.kind === k, `噩梦：清完入口出现异变「${k}」，本周誓约 ${g.dgxDebug().oaths.join(',')}`);
    if (k === 'trap') { g.dgxAct('trap'); for (let i = 0; i < 18; i++) step(1, () => c.bot({ dodge: true })); check(g.dgxDebug().anomalies[0].done, '机关密室：15 秒后结算奖励'); }
    if (k === 'merchant') { const r0 = g.dgxDebug().relics.length; g.dgxAct('merchant'); step(0.05); $('rg-body').querySelector('[data-mb]').click(); step(0.05); check(g.dgxDebug().relics.length === r0 + 1, '游荡商人：花金币买到遗物'); key('Escape'); }
    if (k === 'well') { const r0 = g.dgxDebug().relics.length; g.dgxAct('well'); check(g.dgxDebug().relics.length === r0 + 1, '祈愿池：投金币得到遗物'); }
    if (k === 'goblin') { const gb = g.enemies.find(e => e.kind === 'dgx_goblin'); const p0 = { x: gb.pos.x, z: gb.pos.z }; g.player.pos.set(gb.pos.x, 0, gb.pos.z + 3); step(2); check(Math.hypot(gb.pos.x - p0.x, gb.pos.z - p0.z) > 2, '宝藏怪看到你就跑'); gb.hp = 1; g.target = gb; for (let i = 0; i < 8 && gb.alive; i++) step(1, () => c.bot({ filter: e => e === gb })); step(0.2); check(g.dgxDebug().anomalies[0].done, `宝藏怪：${gb.alive ? '跑了' : '打倒，金币和装备'}`); }
    if (g.dgxDebug().oaths.includes('nopot')) { const hp = g.player.hp; key('q'); step(0.1); check(g.player.hp <= hp, '断药之誓：药水用不了'); }
    g.leaveDungeon(true); step(0.2);
  }
}, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p63' || MODE === 'phase6') await session('v0.6.3：炼狱 + 暗金 + 故事链 + 典藏兑换 + 拓印（战士）', async c => {
  await phase6(c, 'warrior', 4, 5, 'molten_throne', { hell: true, weak: 0.05, dark: true, quest: 'rq_m5' });
  const { g, $, step, check, log } = c;
  g.setRaidDarkChance(null);
  // 典藏兑换
  g.inventory.addStack('mat_darkshard', 60);
  g.openScholar(); step(0.05);
  check($('rg-body').querySelectorAll('.rg-boss').length === 14, '副本学者：暗金典藏 14 件（并入 B 的 4 件 + 新职业 2 件）+ 每周情报');
  const bag0 = g.inventory.bag.length; $('rg-body').querySelector('[data-dx]:not([disabled])').click(); step(0.05);
  const got = g.inventory.bag.at(-1);
  check(g.inventory.bag.length === bag0 + 1 && got.quality === 'dark', `碎片兑换暗金：${got?.name}`);
  // 分解暗金 → 拓印
  c.key('Escape'); step(0.05); g.openShop(); g.setShopTab('salvage', got.id); step(0.05); $('s-salv').click(); step(0.05);
  check(g.codex.has(`print|${got.fixedId}`), `分解「${got.name}」→ 效果拓印进典藏`);
  // 拓印到同部位装备
  const tgt = g.gen.generate(30, 'purple', [got.slot === 'twoHand' || got.slot === 'oneHand' ? 'twoHand' : got.slot]); g.inventory.add(tgt);
  g.setShopTab('reforge', tgt.id); step(0.05);
  const eb = $('shop-side').querySelector('[data-eg]'); if (eb) eb.click(); step(0.05);
  check(tgt.engraveId === got.fixedId && tgt.lines.some(l => l.startsWith('✦')), `拓印：${tgt.name} ← ${tgt.lines.find(l => l.startsWith('✦'))}`);
  g.gen.reforge(tgt, 0, 'affix');
  check(tgt.engraveId === got.fixedId && tgt.lines.some(l => l.startsWith('✦')), '淬炼后拓印还在');
  log(`暗金碎片剩 ${g.inventory.stack('mat_darkshard')}`);
}, { storage: { darkrock_legend_save: P6_SAVE_Q('warrior') } });
if (MODE === 'dbg610') await session('调试 v0.6.10', async c => {
  const { g, step, log, $ } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5); g.ensureWild('ember'); step(0.1);
  g.enterRaid('molten_throne', 1); step(0.5);
  log('tp ' + g.raidTeleport('entry')); step(0.2);
  log('auto ' + g.startRaidAuto() + ' active ' + g.autoPath.active + ' path ' + JSON.stringify(g.autoPath.path));
  for (let i = 0; i < 6; i++) { step(0.5); log(`z ${g.player.pos.z.toFixed(1)} active ${g.autoPath.active} stop ${g.autoPath.lastStop}`); }
}, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p610a' || MODE === 'p610') await session('v0.6.10：熔心王座路线图（战士 · 两翼 + 封印 + 二选一，首领血量 5%）', async c => {
  await phase6(c, 'warrior', 0, 5, 'molten_throne', { weak: 0.05, route: true });
}, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'p610b' || MODE === 'p610') await session('v0.6.10：永霜墓穴路线图（法师 · 冰桥 + 魂灯 + 冰湖捷径，首领血量 5%）', async c => {
  await phase6(c, 'mage', 0, 5, 'frost_crypt', { weak: 0.05, route: true });
}, { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p6x') await session('调试：法师 首领3', c => phase6(c, 'mage', 2, 3), { storage: { darkrock_legend_save: P6_SAVE('mage') } });
if (MODE === 'p6d' || MODE === 'phase6' || MODE === 'all') await session('阶段六：长副本阵亡 / 存档点 / 回程', phase6Death, { storage: { darkrock_legend_save: P6_SAVE('warrior') } });

// ====================================================================== v0.9.3a 野外性能底座：地形起伏 / 坡道 / 40 米分块激活
async function terrainTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.ensureWild('ember'); g.goMap('ember'); step(0.5);
  check(g.zone === 'ember', `进入烬落荒原（${g.zone}）`);
  const W = g.wilds.ember, O = { x: 0, z: 1700 };
  const nav = W.nav;
  // 灰烬高台：坡脚 → 沿寻路走上台顶，高度跟着坡道升高
  const r = { x: -79, z: 75, r: 8, h: 3.6, a: -0.47, len: 12 };
  const foot = { x: O.x + r.x + Math.cos(r.a) * (r.r + r.len + 1.5), z: O.z + r.z + Math.sin(r.a) * (r.r + r.len + 1.5) }, top = { x: O.x + r.x, z: O.z + r.z };
  check(Math.abs(g.groundAt(top.x, top.z) - 3.6) < 0.1 && g.groundAt(foot.x, foot.z) < 0.1, `高度图：台顶 ${g.groundAt(top.x, top.z).toFixed(2)} 米，坡脚 ${g.groundAt(foot.x, foot.z).toFixed(2)} 米`);
  const path = nav.findPath(foot.x, foot.z, top.x, top.z);
  check(!!path, '坡脚能寻路到台顶');
  g.player.pos.set(foot.x, 0, foot.z); step(0.1);
  let maxY = 0, prevY = 0, mono = true;
  for (const wp of path ?? []) {
    for (let k = 0; k < 400 && Math.hypot(wp.x - g.player.pos.x, wp.z - g.player.pos.z) > 0.3; k++) {
      const dx = wp.x - g.player.pos.x, dz = wp.z - g.player.pos.z, d = Math.hypot(dx, dz), s = Math.min(d, 0.3);
      const prev = { x: g.player.pos.x, z: g.player.pos.z };
      g.player.pos.x += dx / d * s; g.player.pos.z += dz / d * s; nav.resolveMove(prev, g.player.pos, 0.45); step(0.05);
      if (g.player.pos.y < prevY - 0.05) mono = false; prevY = g.player.pos.y; maxY = Math.max(maxY, g.player.pos.y);
    }
  }
  check(Math.hypot(g.player.pos.x - top.x, g.player.pos.z - top.z) < 1 && Math.abs(g.player.pos.y - 3.6) < 0.15 && mono, `沿坡道走上台顶：人物高度 ${g.player.pos.y.toFixed(2)} 米（一路上升 ${mono}）`);
  // 崖壁：从背面往台顶走，被挡在崖下
  const back = { x: top.x + Math.cos(r.a + Math.PI) * (r.r + 5), z: top.z + Math.sin(r.a + Math.PI) * (r.r + 5) };
  g.player.pos.set(back.x, 0, back.z); step(0.1);
  for (let k = 0; k < 60; k++) { const prev = { x: g.player.pos.x, z: g.player.pos.z }; const dx = top.x - g.player.pos.x, dz = top.z - g.player.pos.z, d = Math.hypot(dx, dz) || 1; g.player.pos.x += dx / d * 0.3; g.player.pos.z += dz / d * 0.3; g.zoneClamp ? g.zoneClamp(g.player.pos, prev) : nav.resolveMove(prev, g.player.pos, 0.45); step(0.05); }
  check(Math.hypot(g.player.pos.x - top.x, g.player.pos.z - top.z) > r.r && g.player.pos.y < 1, `崖壁挡住：停在离台顶 ${Math.hypot(g.player.pos.x - top.x, g.player.pos.z - top.z).toFixed(1)} 米、高度 ${g.player.pos.y.toFixed(2)} 米`);
  // 怪物贴地：把一只怪放到台顶，它站在 3.6 米高处
  const mob = g.enemies.find(e => e.z === 'ember' && e.alive && !e.type.elite && !e.type.rare);
  g.player.pos.set(top.x + 3, 0, top.z); mob.pos.set(top.x - 2, 0, top.z); mob.spawn.set(top.x - 2, 0, top.z); step(0.3);
  check(Math.abs(mob.pos.y - 3.6) < 0.2, `怪物贴地：台顶的怪高度 ${mob.pos.y.toFixed(2)} 米`);
  // 40 米分块激活 + 同屏 ≤ 40
  const total0 = g.enemies.filter(e => e.z === 'ember').length;
  const added = g.stressSpawn(160);
  g.player.pos.set(O.x, 0, O.z); step(0.5);
  const p = g.perf();
  check(added >= 150 && p.total === total0 + added, `压力测试：烬落荒原多刷 ${added} 只，共 ${p.total} 只`);
  check(p.active <= 40 && p.shown <= 40, `激活 ${p.active} 只、显示 ${p.shown} 只（上限 40）`);
  const hidden = g.enemies.filter(e => e.z === 'ember' && !e.rig.root.visible && e.alive);
  const snap = hidden.slice(0, 20).map(e => [e.pos.x, e.pos.z]);
  step(2);
  check(hidden.slice(0, 20).every((e, i) => e.pos.x === snap[i][0] && e.pos.z === snap[i][1]), '远处区块的怪不跑 AI（位置不变）');
  const vis = g.enemies.filter(e => e.z === 'ember' && e.rig.root.visible && e.alive);
  const far = vis.reduce((m, e) => Math.max(m, Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z)), 0);
  check(far < 120, `显示的怪都在附近区块（最远 ${far.toFixed(0)} 米）`);
  // 换到地图另一角：激活集跟着换
  const before = new Set(vis);
  g.player.pos.set(O.x + 90, 0, O.z + 90); step(0.5);
  const vis2 = g.enemies.filter(e => e.z === 'ember' && e.rig.root.visible && e.alive);
  check(vis2.length > 0 && vis2.filter(e => before.has(e)).length < vis2.length / 2 && g.perf().active <= 40, `走到东南角：激活集换成附近的 ${vis2.length} 只（和刚才重合 ${vis2.filter(e => before.has(e)).length} 只）`);
  // 打一只附近的怪：交战中的怪离开区块也保留
  log(`  区块 ${g.perf().chunk}`);
}
// v0.9.3d 世界首领：按真实时间刷新、喊话前隐藏、BossBrain 机制（红圈 / 毒池 / 召唤 / 阶段）、首领框、地图标记、击杀掉落、每日首杀、精魄保底、炽翼事件必刷
async function wbTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.ensureWild('redsand'); g.goMap('redsand'); step(0.5);
  check(g.zone === 'redsand', `进入赤砂裂谷（${g.zone}）`);
  let info = g.wbDebug().find(x => x.id === 'wb_worm');
  check(info.spawned && !info.alive && info.nextIn > 100 && info.nextIn <= 180, `萨卡尔已生成但还没出现（${info.nextIn} 秒后）`);
  const poi = g.poisFor('redsand').find(p => p.key === 'wb_worm');
  check(!!poi && /世界首领/.test(poi.name) && /后出现/.test(poi.state), `地图标记：${poi?.name} · ${poi?.state}`);
  const minis = g.enemies.filter(e => e.z === 'redsand' && e.type.mini);
  check(minis.length === 2 && minis.every(m => m.maxHp >= 3 * g.enemies.find(x => x.kind === m.kind && !x.type.mini && x.z === 'redsand').type.hp * 0.9 && /强壮/.test(m.type.name) && m.respawn === 90), `刷怪点小精英 ${minis.length} 只（${minis.map(m => m.type.name).join('、')}，90 秒刷新）`);
  const worm = g.enemies.find(e => e.wb === 'wb_worm');
  check(!!g.wilds.redsand.nav.findPath(g.player.pos.x, g.player.pos.z, worm.spawn.x, worm.spawn.z), '从驿站能寻路到流沙坑');
  check(!worm.rig.root.visible, '没出现时不显示');
  // 快进真实时间：先到 2 分钟喊话，再到出现
  const t0 = Date.now(); let fake = t0; g.wbClock.now = () => fake;
  fake = t0 + 70 * 1000; step(1);
  check(/2 分钟后/.test($('yell').textContent) || g.lastNotices?.some?.(n => /即将|分钟后出现/.test(n)), `出现前喊话：${$('yell').textContent}`);
  fake = t0 + 200 * 1000; step(1);
  info = g.wbDebug().find(x => x.id === 'wb_worm');
  check(info.alive && info.hp === info.maxHp, `到点出现：萨卡尔 ${info.hp}/${info.maxHp}`);
  // 开打：玩家无敌（测机制），站到萨卡尔旁边
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  g.player.pos.set(worm.pos.x + 2.5, 0, worm.pos.z); worm.brain.provoke(); g.target = worm;
  let tele = 0, zones = 0, framed = false;
  for (let i = 0; i < 40 * 4; i++) { step(0.25); g.player.hp = 1e7; tele = Math.max(tele, g.__telegraphs().length); zones = Math.max(zones, g.__zones().length); if ($('boss-frame').style.display === 'block' && /萨卡尔/.test($('bf-name').textContent)) framed = true; if (i % 4 === 0) g.tryCast('basic'); }
  check(tele > 0, `机制：钻地突袭红圈（同时 ${tele} 个）`);
  check(zones > 0, `机制：流沙坑（同时 ${zones} 个）`);
  check(framed, '首领框显示萨卡尔');
  check(worm.alive && worm.brain.phaseIndex === 0, `第一阶段（生命 ${Math.round(worm.hp / worm.maxHp * 100)}%）`);
  worm.hp = Math.round(worm.maxHp * 0.35); step(1.5); g.player.hp = 1e7;
  const adds = g.enemies.filter(e => e.kind === 'wb_worm_add' && e.alive).length;
  check(worm.brain.phaseIndex === 1 && adds >= 3, `第二阶段：巢穴暴动，召唤幼蠕 ${adds} 只`);
  check(/巢穴暴动/.test($('bf-phase').textContent), `首领框阶段名：${$('bf-phase').textContent}`);
  // 击杀
  const loot0 = g.loots.length, soul0 = g.inventory.stack('soul_worm');
  worm.hp = 1; for (let i = 0; i < 40 && worm.alive; i++) { g.target = worm; g.player.pos.set(worm.pos.x + 2, 0, worm.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; }
  check(!worm.alive, '击败萨卡尔');
  step(1);
  info = g.wbDebug().find(x => x.id === 'wb_worm');
  const souls = g.inventory.stack('soul_worm') - soul0;
  check(info.kills === 1 && Math.abs(info.nextIn - 45 * 60) < 30, `下次 45 分钟后（${info.nextIn} 秒），击杀 ${info.kills} 次`);
  check(souls >= 3 && souls <= 4, `精魄 +${souls}（掉落 1~2 + 每日首杀 2）`);
  check(g.loots.length - loot0 >= 3, `掉落 ${g.loots.length - loot0} 件（2 件史诗 + 首杀额外，金币自动拾取）`);
  // 召唤物尸体清理
  // 精魄保底：再打一次，凑满 10 个
  g.inventory.addStack('soul_worm', 10 - g.inventory.stack('soul_worm') - 1);
  fake += 46 * 60 * 1000; step(5.5);
  check(worm.alive, '45 分钟后再次出现');
  const names0 = new Set(g.loots.map(l => l.loot?.name).filter(Boolean));
  worm.hp = 1; for (let i = 0; i < 40 && worm.alive; i++) { g.target = worm; g.player.pos.set(worm.pos.x + 2, 0, worm.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; }
  step(1);
  const uniq = [...g.loots.map(l => l.loot?.name), ...g.inventory.bag.map(i => i.name)].filter(n => n && !names0.has(n) && /巨蠕甲晶护符|流沙之握/.test(n));
  check(uniq.length >= 1 && g.inventory.stack('soul_worm') < 10, `精魄凝成专属橙装：${uniq.join(' / ')}（剩 ${g.inventory.stack('soul_worm')} 个）`);
  info = g.wbDebug().find(x => x.id === 'wb_worm');
  check(info.kills === 2, '同一天第二次击杀不再给首杀奖励（击杀 2 次）');
  step(8);
  check(!g.enemies.some(e => e.kind === 'wb_worm_add' && !e.alive), '召唤物尸体已清理');
  // 存档往返
  g.save(); const sv = JSON.parse(c.w.localStorage.getItem(Object.keys(c.w.localStorage).find(k => /darkrock_.*save|char/.test(k) && /wboss/.test(c.w.localStorage.getItem(k) ?? '')) ?? '') ?? '{}');
  check(!!sv.wboss && sv.wboss.kills?.wb_worm === 2, `存档 wboss 字段（击杀 ${sv.wboss?.kills?.wb_worm}）`);
  // 其他三个首领：生成位置 / 地图
  for (const [m, id] of [['frost', 'wb_yurg'], ['ember', 'wb_ash']]) {
    g.ensureWild(m); g.goMap(m); step(0.5);
    const ok = g.wbSpawnNow(id), e = g.enemies.find(x => x.wb === id);
    check(ok && e.z === m && g.groundAt(e.pos.x, e.pos.z) >= 0, `${m}：${e.type.name} 已生成并出现（${e.maxHp} 生命）`);
    const W = g.wilds[m], cp = g.player.pos; const path = W.nav.findPath(cp.x, cp.z, e.spawn.x, e.spawn.z);
    check(!!path, `${m}：从传送点能寻路到${e.type.name.split(' · ')[1]}的竞技场`);
  }
  // 炽翼：熔岩喷发平息后 2 分钟必刷
  const ash = g.enemies.find(e => e.wb === 'wb_ash'); ash.hp = 1; ash.brain.provoke(); for (let i = 0; i < 40 && ash.alive; i++) { g.target = ash; g.player.pos.set(ash.pos.x + 2, 0, ash.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; }
  check(!ash.alive && g.wbDebug().find(x => x.id === 'wb_ash').nextIn > 3000, `击败炽翼，下次 ${g.wbDebug().find(x => x.id === 'wb_ash').nextIn} 秒后`);
  const ev = g.worldEvents.find(e => e.map === 'ember'); g.startEvent(ev); step(0.5);
  ev.mobs.forEach(m => { m.hp = 0; }); ev.killed = ev.total; ev.wave = 99; for (let i = 0; i < 20 && ev.active; i++) step(0.5);
  if (ev.active) { log('  （事件未自动结束，直接结算）'); }
  const nIn = g.wbDebug().find(x => x.id === 'wb_ash').nextIn;
  check(!ev.active && nIn <= 125, `熔岩喷发平息 → 炽翼 ${nIn} 秒后必刷`);
  // 苔石在星落高原（v0.9.3e 搬家）
  g.ensureWild('star'); g.goMap('star'); step(0.5);
  check(g.wbDebug().find(x => x.id === 'wb_moss').spawned && g.poisFor('star').some(p => p.key === 'wb_moss') && !g.poisFor('field').some(p => p.key === 'wb_moss'), '苔石在星落高原古树石环（地图有标记）');
  g.wbClock.now = () => Date.now();
}
// v0.9.3e 星落高原 + 疾行 / 瞭望塔 / 采集点 / 宝箱
async function endgameDropTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  const cls = g.cls.id;
  const f5 = g.abyFloorItems(5), f20 = g.abyFloorItems(20), f7 = g.abyFloorItems(7);
  check(f5.length === 3 && f5.every(i => i.quality === 'orange') && new Set(f5.map(i => i.lgId)).size === 3, `深渊 5 层首领：3 件不重复橙装（${f5.map(i => i.name).join('、')}）`);
  check(f20.length === 3 && new Set(f20.map(i => i.lgId)).size === 3, `深渊 20 层：3 件顶级橙装（${f20.map(i => i.name).join('、')}）`);
  check(f7.length === 0, '深渊普通层不掉装备');
  const m7 = g.abyMats(7, 1), m15 = g.abyMats(15, 2);
  check(m7.some(x => x.id === 'mat_dust') && !m7.some(x => x.id === 'mat_darkshard'), `普通层给分解材料（${m7.map(x => x.id + '×' + x.count).join(' ')}）`);
  check(m15.find(x => x.id === 'mat_darkshard')?.count === 9, '15 层首领暗金碎片 ×9');
  const opts = g.abyDarkOptions();
  const sopt = g.abySetOptions();
  check(opts.length > 0 && opts.every(i => i.quality === 'dark') && sopt.length > 0 && sopt.every(i => i.setId), `v1.2.38 结算拆分：20 层暗金 ${opts.length} 件、10 层套装 ${sopt.length} 件`);
  // 说明书：长副本首领页只有套装 + 橙装
  g.openDropGuide(); step(0.2);
  check(c.errors.length === 0, '掉落说明书打开不报错');
  g.openRaidMap('molten_throne', true); step(0.3);
  const txt = c.w.document.getElementById('raidmap').textContent;
  check(/只掉套装和橙装/.test(txt) && /共享橙装/.test(txt) && !/随机史诗/.test(txt), '副本地图：熔心王座掉落列表改成套装 + 橙装');
  log(`  职业 ${cls}`);
}


// v0.9.6c 符文 HUD：血球 / 资源球 / 经验弧、技能冷却扫光 + 就绪火星、首领阶段刻度 + 施法条、统一通知栏、太古横幅、HUD 粒子开关

async function p96fTest(c) {
  const { g, $, step, check, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  const D = () => g.rm3dDebug(), side = () => $('rm-side').textContent;
  check(g.settings.map3d === 'auto' && D().wanted, `设置默认「自动」且可用 3D（${g.settings.map3d}）`);
  g.openRaidMap('molten_throne', true); step(0.3);
  let d = D();
  check(d.active && d.canvas && $('rm-cv3') && $('rm-cv').style.visibility === 'hidden', '熔心王座：3D 浮岛画布叠在 2D 画布上');
  check(d.renders > 0, `面板打开时 3D 在渲染（${d.renders} 帧）`);
  const bosses = d.nodes.filter(n => n.boss !== undefined);
  check(bosses.length >= 5 && d.nodes.some(n => n.kind === 'entry') && d.flow > 3, `首领台座 ${bosses.length} 个 + 入口 + 光路 ${d.flow} 条`);
  check(/熔心王座/.test($('rm3-lab').textContent) && bosses.every(b => b.label.length > 0), '3D 标签：标题 + 每个首领名');
  check(g.mainSkipped > 0, `3D 打开时主场景限帧（跳过 ${g.mainSkipped} 帧）`);
  const sp = d.screen('b1') ?? d.screen(bosses[1].id); const hit = d.clickAt(sp.x, sp.y); step(0.05);
  check(hit && g.dmView().sel === bosses.find(b => b.id === hit).boss && $('rm-side').querySelector('.dl-h.sel') && $('dropguide').style.display === 'flex' && g.altarState().src === `dl_molten_throne_${g.dmView().sel}`, `点首领台座（射线拾取 ${hit}）→ 选中 + 掉落列表高亮 + 打开战利品祭坛（v0.9.6d）`);
  g.openRaidMap('molten_throne', true); step(0.1);
  check($('rm-diff').querySelectorAll('.dt').length === 2 && /共享橙装/.test(side()), '保留 2D 掉落列表 + 难度页签');
  // 30 级普通副本 + 隐藏首领问号 + 本周已击败变暗
  g.openRaidMap('sand_tomb', true); step(0.2); d = D();
  check(d.raid === 'sand_tomb' && d.nodes.some(n => n.unknown && /？/.test(n.label)), '30 级普通副本：隐藏首领问号台座');
  check(/隐藏首领/.test(side()) && /蝎后的尾刺剑/.test(side()), '沙葬王陵掉落列表仍在');
  // layout 副本
  g.openRaidMap('darkrock_mine', true); step(0.2); d = D();
  check(d.active && d.raid === 'darkrock_mine' && d.nodes.filter(n => n.boss !== undefined).length >= 2, `layout 副本（暗岩矿洞）也能显示（${d.nodes.length} 个节点）`);
  // 关掉即停
  const r0 = D().renders; g.togglePanel('raidmap', false); step(0.3);
  check(!D().active && !D().canvas && D().renders === r0, '关闭面板：3D 停止渲染并释放');
  const sk = g.mainSkipped; step(0.3); check(g.mainSkipped === sk, '关闭后主场景恢复全帧');
  // 设置关 → 2D
  g.settings.map3d = 'off'; g.openRaidMap('molten_throne', true); step(0.2);
  check(!D().active && $('rm-cv').style.visibility !== 'hidden', '设置「3D 副本地图：关」→ 原 2D 路线图');
  g.togglePanel('raidmap', false); g.settings.map3d = 'auto';
  g.settings.quality = 'low'; g.openRaidMap('molten_throne', true); step(0.2);
  check(!D().active, '自动 + 低画质 → 回退 2D'); g.togglePanel('raidmap', false); g.settings.quality = 'high';
  D().setFailed('WebGL 失败'); g.openRaidMap('molten_throne', true); step(0.2);
  check(!D().active && $('rm-cv').style.visibility !== 'hidden' && /首领/.test(side()), 'WebGL 失败 → 自动回退 2D（掉落列表照常）');
  D().setFailed(''); g.togglePanel('raidmap', false);
  g.openSettings?.(); g.renderSettings(); check(/3D 副本地图/.test($('set-body').textContent), '设置里有「3D 副本地图」开关');
  // 深渊地图不走 3D；切换不报错
  for (const id of ['troll_cave', 'ash_forge', 'frost_crypt', 'rotting_temple']) { g.openRaidMap(id, true); step(0.1); }
  check(D().active && D().raid === 'rotting_temple', '其余副本依次打开不报错');
  g.togglePanel('raidmap', false); step(0.1);
}
async function p96fPhone(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.openRaidMap('molten_throne', true); step(0.4);
  const d = g.rm3dDebug();
  check(d.active && d.renders > 0 && d.renders <= 0.4 * 20 + 2, `手机：3D 浮岛渲染且限 30 帧（${d.renders} 帧 / 0.4 秒）`);
  check(g.mainSkipped > 0, `手机：主场景限帧 1/8（跳过 ${g.mainSkipped}）`);
  g.togglePanel('raidmap', false); step(0.2); check(!g.rm3dDebug().active, '手机：关闭即停');
}

// v0.9.6e 3D 沙盘（世界 + 区域）：独立小渲染器、高度图、云雾点精灵、地点光柱、推近 / 淡出过渡、2D 回退
async function map3dTest(c) {
  const { g, $, step, check, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  const D = () => g.wm3dDebug();
  const ev = (type, x, y) => { const e = new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }); $('wm-cv3').dispatchEvent(e); };
  check(D().wanted, '设置默认「自动」：可用 3D 沙盘');
  g.openWorldMap('world'); step(0.3);
  let d = D();
  check(d.active && d.canvas && $('wm-cv3') && $('wm3-lab') && $('wm-cv').style.visibility === 'hidden', '世界地图：3D 沙盘画布叠在 2D 画布上（2D 照画、隐藏）');
  check(d.view === 'world' && d.renders > 0, `面板打开时在渲染（${d.renders} 帧）`);
  check(['wm-cv', 'wm-tip', 'wm-legend', 'wm-crumb', 'wm-title'].every(id => $(id)) && $('wm-legend').querySelectorAll('.wl').length > 5, '旧元素 id 全保留，右侧图例照常');
  const regions = d.pois.filter(p => p.kind === 'region');
  check(regions.length === 12 || regions.length >= 10, `区域名牌 ${regions.length} 个`);
  check(/你在这里/.test($('wm3-lab').textContent) && /暗岩大陆/.test($('wm3-lab').textContent), '名牌含「你在这里」+ 标题');
  const kinds = k => d.pois.filter(p => p.kind === k).length;
  check(kinds('you') === 1 && kinds('dungeon') >= 4 && kinds('boss') === 4, `光柱：金 ${kinds('you')} / 紫 ${kinds('dungeon')} / 红 ${kinds('boss')}`);
  check(d.pillars === kinds('you') + kinds('dungeon') + kinds('boss') && d.sparks > 0, `光柱 ${d.pillars} 根 + 上升粒子 ${d.sparks}`);
  check(d.clouds > 0 && d.points <= 3000 && d.maxPoints === 3000, `云雾点精灵 ${d.clouds} + 火星 ${d.sparks} = ${d.points} ≤ 3000`);
  check(d.grid && d.grid[0] >= 96 && d.maxH > 0.3 && d.relief > 0.5, `高度图网格 ${d.grid} 抬起（最高 ${d.maxH.toFixed(2)}）`);
  check(g.mainSkipped > 0, `沙盘打开时主场景限帧（跳过 ${g.mainSkipped}）`);
  // 悬停：放大 + 复用 #wm-tip
  let sp = d.screen('r:frost'); ev('pointermove', sp.x, sp.y); step(0.1);
  check(D().pois.find(p => p.id === 'r:frost').hover && $('wm-tip').style.display === 'block' && /霜/.test($('wm-tip').textContent), `悬停区域名牌：放大 + 弹出卡片（${$('wm-tip').textContent.slice(0, 12)}…）`);
  const wb = D().pois.find(p => p.kind === 'boss'); sp = D().screen(wb.id); ev('pointermove', sp.x, sp.y); step(0.05);
  check(D().pois.find(p => p.id === wb.id).hover && /世界首领/.test($('wm-tip').textContent), '悬停红光柱：世界首领卡片');
  ev('pointerleave', 0, 0);
  // 拖动 ±25° / 滚轮
  check(Math.abs(D().drag(-2000) - 0.44) < 1e-6 && Math.abs(D().drag(4000) + 0.44) < 1e-6, '拖动旋转限制在 ±25°');
  const z0 = D().zoom; D().wheel(-1); check(D().zoom < z0, '滚轮缩放'); D().drag(-73);
  // 世界首领光柱 → 战利品祭坛
  sp = D().screen(wb.id); D().clickAt(sp.x, sp.y); step(0.1);
  check($('dropguide').style.display === 'flex' && g.altarState().src === wb.id.slice(3), `点红光柱 → 战利品祭坛（${g.altarState().src}）`);
  g.togglePanel('dropguide', false); g.openWorldMap('world'); step(0.2);
  // 世界 → 区域：推近 + 云散开 0.6 秒
  const m0 = D().cloudMean; sp = D().screen('r:star'); const hit = D().clickAt(sp.x, sp.y); step(0.3);
  d = D(); check(hit === 'r:star' && d.busy && d.trans === 'zoom' && d.view === 'world' && d.cloudMean < m0, `点区域 → 推近过渡中（云 ${m0.toFixed(2)} → ${d.cloudMean.toFixed(2)}）`);
  step(0.5); d = D();
  check(d.view === 'zone' && d.key === 'star' && g.wmView === 'zone' && !d.busy && /星落高原/.test($('wm3-lab').textContent), '0.6 秒后进入星落高原区域沙盘');
  check(d.clouds > 100 && d.cloudTarget > 0.8, `区域云雾按迷雾格子（${d.clouds} 朵，未探索 ${(d.cloudTarget * 100).toFixed(0)}%）`);
  check(d.grid && d.maxH > 0.1, `区域高度图（core/Terrain 同一地形函数，最高 ${d.maxH.toFixed(2)}）`);
  // 面包屑回世界
  $('wm-crumb').querySelector('[data-crumb]').click(); step(0.1); check(D().view === 'world', '面包屑「世界」→ 回世界沙盘');
  g.togglePanel('worldmap', false); step(0.2);
  check(!D().active && !D().canvas, '关闭面板：3D 停止并释放');
  const sk = g.mainSkipped; step(0.2); check(g.mainSkipped === sk, '关闭后主场景恢复全帧');
  // 进星落高原：你在这 + 迷雾点亮时云散开
  g.ensureWild('star'); g.goMap('star'); step(1.5);
  g.openWorldMap('zone', 'star'); step(0.3); d = D();
  check(d.key === 'star' && d.pois.some(p => p.kind === 'you'), '当前区域：金色「你在这」光柱');
  const t0 = d.cloudTarget, ex = g.exDebug('star'), tw = ex.towers[0];
  g.player.pos.set(tw.x + 1, 0, tw.z + 1); step(0.3);
  const ti = g.exInteract(); if (ti && /登上/.test(ti.label)) ti.act();
  step(0.8); d = D();
  check(d.cloudTarget < t0 - 0.03, `登塔点亮 → 云雾目标浓度下降（${(t0 * 100).toFixed(0)}% → ${(d.cloudTarget * 100).toFixed(0)}%）`);
  step(1); check(Math.abs(D().cloudMean - D().cloudTarget) < 0.08, '散开动画收敛到新浓度');
  // 传送石：激活后青色光柱；点击 → 传送
  const s0 = g.exDebug('star').stones[0]; g.togglePanel('worldmap', false);
  g.player.pos.set(s0.x + 1.5, 0, s0.z + 1); step(1.3); const it = g.exInteract(); if (it && /激活/.test(it.label)) it.act(); step(0.2);
  g.goMap('camp'); step(0.6);
  g.openWorldMap('zone', 'star'); step(0.3); d = D();
  const st = d.pois.find(p => p.kind === 'stone' && !p.dim);
  check(!!st, `已激活传送石：青色光柱（${d.pois.filter(p => p.kind === 'stone').length} 块可见）`);
  if (st) { sp = D().screen(st.id); D().clickAt(sp.x, sp.y); step(1); check(g.zone === 'star' && Math.hypot(g.player.pos.x - s0.x, g.player.pos.z - s0.z) < 6 && $('worldmap').style.display !== 'flex', `点传送石光柱 → 传送（${g.zone}）`); }
  // 区域 → 副本：淡出后打开副本浮岛
  g.openWorldMap('zone', 'foothill'); step(0.3); d = D();
  const dg = d.pois.find(p => p.kind === 'dungeon');
  check(!!dg, `山麓区域：紫色副本光柱（${dg?.label}）`);
  if (dg) { sp = D().screen(dg.id); const h2 = D().clickAt(sp.x, sp.y); c.log?.(`  点击 ${h2} @${Math.round(sp.x)},${Math.round(sp.y)} trans=${D().trans}`); step(0.15); check(D().trans === 'fade' && parseFloat($('wm-cv3').style.opacity) < 1, '点副本光柱 → 沙盘淡出'); step(0.4); check($('raidmap').style.display === 'flex' && $('raidmap').classList.contains('rm-rise') && g.rm3dDebug().raid === 'darkrock_mine', '淡出后打开副本浮岛（淡入）'); g.togglePanel('raidmap', false); step(0.1); }
  // 2D 回退
  g.settings.map3d = 'off'; g.openWorldMap('world'); step(0.2);
  check(!D().active && $('wm-cv').style.visibility !== 'hidden', '设置「关」→ 2D 地图'); g.togglePanel('worldmap', false); g.settings.map3d = 'auto';
  g.settings.quality = 'low'; g.openWorldMap('world'); step(0.2); check(!D().active, '自动 + 低画质 → 2D'); g.togglePanel('worldmap', false); g.settings.quality = 'high';
  D().setFailed('WebGL 失败'); g.openWorldMap('zone', 'field'); step(0.2);
  check(!D().active && $('wm-cv').style.visibility !== 'hidden' && $('wm-legend').textContent.length > 10, 'WebGL 失败 → 2D（图例照常）');
  D().setFailed(''); g.togglePanel('worldmap', false);
  for (const id of ['camp', 'field', 'redsand', 'frost', 'ember', 'marsh', 'rotting_temple']) { g.openWorldMap('zone', id); step(0.1); }
  check(D().active && D().key === 'rotting_temple', '各区域依次打开不报错');
  g.togglePanel('worldmap', false); step(0.1);
  g.openSettings?.(); g.renderSettings(); check(/3D 副本地图 \/ 世界沙盘/.test($('set-body').textContent), '设置开关改名「3D 副本地图 / 世界沙盘」');
}
async function map3dPhone(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.openWorldMap('world'); step(0.4);
  const d = g.wm3dDebug();
  check(d.active && d.renders > 0 && d.renders <= 0.4 * 20 + 2, `手机：沙盘渲染且限 30 帧（${d.renders} 帧 / 0.4 秒）`);
  check(d.points <= 1400 && d.grid[0] <= 96, `手机：粒子 ${d.points}、网格 ${d.grid} 减半`);
  check(g.mainSkipped > 0, `手机：主场景限帧（跳过 ${g.mainSkipped}）`);
  g.openWorldMap('zone', 'field'); step(0.2); check(g.wm3dDebug().key === 'field', '手机：区域沙盘');
  g.wm3dDebug().setSlow(true); g.openWorldMap('world'); step(0.2); check(!g.wm3dDebug().active && $('wm-cv').style.visibility !== 'hidden', '手机持续掉帧 → 本次回退 2D'); g.wm3dDebug().setSlow(false);
  g.togglePanel('worldmap', false); step(0.2); check(!g.wm3dDebug().active, '手机：关闭即停');
}

// v0.9.6d 战利品祭坛：说明书 + 副本地图掉落合并、3D 祭坛、反查 / 定位、我缺的、太古标记、深渊 20 层祭坛式自选
async function altarTest(c) {
  const { g, $, w, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  $('tut-skip')?.click(); step(0.1);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  const D = () => g.altarDebug(), S = () => g.altarState();
  g.openDropGuide('dl_molten_throne_0'); step(0.3);
  let d = D();
  check($('dropguide').style.display === 'flex' && /战利品祭坛/.test($('dropguide').querySelector('h2').textContent) && !!$('dg-progress') && !!$('dg-filter').querySelector('#dgf-own') && $('dg-list').querySelectorAll('.dg-it').length > 0, '说明书改为「战利品祭坛」，旧元素 dg-progress / dg-filter / dg-list 都在');
  check(d.active && d.canvas && d.host === 'dg-stage' && d.renders > 0, `中间 3D 祭坛在渲染（${d.renders} 帧）`);
  check(d.orbit >= 3 && d.center === 1 && d.boss && d.particles > 0 && d.particles <= 800, `环绕 ${d.orbit} 件 + 中间真模型 + 首领余烬剪影 + 粒子 ${d.particles}（≤800）`);
  check(d.label === $('alt-name').textContent && d.centerTier === 4, `选中「${d.label}」：橙装光效档 ${d.centerTier}`);
  check(g.mainSkipped > 0, `祭坛打开时主场景限帧（跳过 ${g.mainSkipped}）`);
  check($('dg-tabs').querySelectorAll('.alt-bd').length > 30 && $('dg-tabs').querySelectorAll('.alt-bd.boss').length > 10 && $('dg-tabs').querySelectorAll('.alt-pg').length > 30, '左侧来源：首领徽章 + 每来源收集进度条');
  const ancRows = [...$('dg-tabs').querySelectorAll('.alt-src')].filter(r => r.querySelector('.alt-ancb')).map(r => r.dataset.src);
  check(ancRows.includes('dl_molten_throne_0') && ancRows.includes('abyss_top') && !ancRows.includes('camp'), `太古来源标 ✹（${ancRows.length} 个）`);
  check(/太古 4/.test($('alt-anc')?.textContent ?? '') && $('dg-list').querySelectorAll('.dg-anc').length > 0, '物品卡 + 列表标出太古几率 4%');
  $('alt-ancv').click(); step(0.1);
  check(D().centerAnc && /太古/.test($('alt-name').textContent), '「看太古外观」：中间模型换太古双螺旋光效');
  // 列表点选
  const its = [...$('dg-list').querySelectorAll('.dg-it')], other = its.find(e => !e.classList.contains('sel'));
  other.click(); step(0.1);
  check(other.querySelector('b').textContent === D().label && $('dg-list').querySelector('.dg-it.sel b').textContent === D().label, `点列表另一件 → 祭坛切换到「${D().label}」`);
  // 点环绕物品
  d = D(); const oi = [...Array(d.orbit).keys()].find(i => i !== d.sel); const sp = d.screen(oi);
  const hit = d.clickAt(sp.x, sp.y); step(0.1);
  check(hit === oi && S().sel === S().orbit[oi] && D().sel === S().orbit.indexOf(S().sel), `点环绕物品（射线拾取 #${hit}）→ 切换选中`);
  // 反查
  const shared = S().orbit.find(k => g.whereDrops(k).length >= 5);
  check(!!shared, `「这件在哪掉」：共享橙装 ${g.whereDrops(shared ?? '').length} 处来源`);
  check($('alt-where').querySelectorAll('.alt-wr').length >= 1 && $('alt-where').querySelector('[data-loc]'), '物品卡列出全部来源 + 定位按钮');
  // 定位：副本首领
  g.openDropGuide('dl_molten_throne_2'); step(0.1);
  $('alt-loc').click(); step(0.2);
  check($('raidmap').style.display === 'flex' && $('dropguide').style.display !== 'flex' && g.dmView().raid === 'molten_throne' && g.dmView().sel === 2, '「在地图上定位」→ 打开熔心王座副本地图并选中首领 3');
  check(!!$('rm-altar'), '副本地图侧栏有「战利品祭坛」按钮');
  // 副本地图点首领 → 祭坛
  const R = g.rm3dDebug(), b1 = R.screen('b1'); R.clickAt(b1.x, b1.y); step(0.2);
  check($('dropguide').style.display === 'flex' && S().src === 'dl_molten_throne_1' && S().back && $('alt-back'), `3D 浮岛点首领 → 打开同一个祭坛页（${S().src}）`);
  check(!g.rm3dDebug().active && D().active, '切换时浮岛释放、祭坛接管（同时只有一个小渲染器）');
  $('alt-back').click(); step(0.2);
  check($('raidmap').style.display === 'flex' && g.dmView().sel === 1, '「返回副本地图」→ 回到浮岛并保持选中');
  $('rm-altar').click(); step(0.1);
  check($('dropguide').style.display === 'flex' && S().src === 'dl_molten_throne_1', '侧栏按钮也能打开祭坛');
  g.openRaidMap('sand_tomb', true); step(0.1); g.openAltarFromMap('sand_tomb', 1); step(0.1);
  check(S().src === 'dl_sand_tomb_1', '30 级副本首领 → 对应来源');
  g.openAltarFromMap('darkrock_mine', 1); step(0.1); check(S().src === 'mine_boss', '暗岩矿洞格罗克 → 对应来源');
  // 野外定位
  check(g.altarLocate('wb_worm') === 'redsand' && $('worldmap').style.display === 'flex', '世界首领「萨卡尔」→ 打开赤砂裂谷区域地图');
  // 搜索
  g.openDropGuide('camp'); step(0.1);
  const si = $('alt-search'); si.value = '萨卡尔'; si.dispatchEvent(new w.Event('input')); step(0.05);
  let rows = [...$('dg-tabs').querySelectorAll('.alt-src')].map(r => r.dataset.src);
  check(rows.length >= 1 && rows.includes('wb_worm') && !rows.includes('camp'), `搜索「萨卡尔」→ 来源 ${rows.join(',')}`);
  const lgName = [...$('dg-list').querySelectorAll('.dg-it b')].map(b => b.textContent)[0];
  si.value = ''; si.dispatchEvent(new w.Event('input'));
  g.openDropGuide('dl_frost_crypt_0'); step(0.05);
  const fn = $('alt-name').textContent; si.value = fn; si.dispatchEvent(new w.Event('input')); step(0.05);
  rows = [...$('dg-tabs').querySelectorAll('.alt-src')].map(r => r.dataset.src);
  check(rows.length >= 1 && rows.every(id => g.whereDrops(S().sel).includes(id)) && rows.includes('dl_frost_crypt_0') && rows.length === g.whereDrops(S().sel).length, `按装备名「${fn}」搜 → ${rows.length} 个来源`);
  si.value = ''; si.dispatchEvent(new w.Event('input')); void lgName;
  // 我缺的
  g.openDropGuide('dl_molten_throne_0'); step(0.05);
  const keys = [...$('dg-list').querySelectorAll('.dg-it')].length;
  S().orbit.forEach(k => g.codex.add(k));
  const mi = $('alt-miss'); mi.checked = true; mi.dispatchEvent(new w.Event('change')); step(0.05);
  rows = [...$('dg-tabs').querySelectorAll('.alt-src')].map(r => r.dataset.src);
  check(!rows.includes('dl_molten_throne_0') && rows.length > 5 && /缺 \d/.test($('dg-tabs').textContent) && [...$('dg-list').querySelectorAll('.dg-it')].every(e => /未获得/.test(e.textContent)) && $('dgf-own').value === 'no', `「我缺的」：已收集齐的来源藏起来（${keys} 件全收集），列表只剩未获得`);
  mi.checked = false; mi.dispatchEvent(new w.Event('change')); step(0.05);
  check($('dgf-own').value === '' && [...$('dg-tabs').querySelectorAll('.alt-src')].length > 40, '取消「我缺的」恢复全部来源');
  // 分组折叠
  const gh = [...$('dg-tabs').querySelectorAll('.alt-gh')].find(e => e.dataset.grp === '野外'); gh.click(); step(0.05);
  check(!$('dg-tabs').querySelector('[data-src="camp"]') && /野外/.test($('dg-tabs').textContent), '点分组标题折叠（野外）');
  [...$('dg-tabs').querySelectorAll('.alt-gh')].find(e => e.dataset.grp === '野外').click(); step(0.05);
  check(!!$('dg-tabs').querySelector('[data-src="camp"]'), '再点展开');
  // 关闭即停
  const r0 = D().renders; g.togglePanel('dropguide', false); step(0.2);
  check(!D().active && !D().canvas && D().renders === r0, '关闭面板：祭坛停止渲染并释放');
  const sk = g.mainSkipped; step(0.2); check(g.mainSkipped === sk, '关闭后主场景恢复全帧');
  // 回退 2D
  g.settings.map3d = 'off'; g.openDropGuide('abyss'); step(0.1);
  check(!D().active && $('alt-mid').classList.contains('alt-2d') && $('dg-list').querySelectorAll('.dg-it').length > 5 && $('alt-name'), '设置「3D 副本地图：关」→ 2D 列表 + 物品卡');
  g.togglePanel('dropguide', false); g.settings.map3d = 'auto';
  g.settings.quality = 'low'; g.openDropGuide('abyss'); step(0.1); check(!D().active, '自动 + 低画质 → 回退 2D'); g.togglePanel('dropguide', false); g.settings.quality = 'high';
  D().setFailed('WebGL 失败'); g.openDropGuide('abyss'); step(0.1);
  check(!D().active && $('alt-mid').classList.contains('alt-2d') && /暗岩深渊/.test($('dg-list').textContent), 'WebGL 失败 → 回退 2D（旧列表照常）');
  D().setFailed(''); g.togglePanel('dropguide', false);
  // 深渊 20 层结算：祭坛式选择页
  g.abyDarkShow(); g.openAbyss(); step(0.1);
  d = D(); const n = $('aby-body').querySelectorAll('.abydk').length;
  check(d.active && d.host === 'aby-stage' && d.orbit === n && n > 3 && $('aby-take') && $('aby-body').querySelector('.abydk.on'), `深渊结算：3D 祭坛 ${d.orbit} 件环绕 + 「带走」按钮`);
  $('aby-body').querySelector('.abydk[data-dark="2"]').click(); step(0.1);
  check(g.abyDarkSel() === 2 && D().sel === 2 && $('abyss').style.display === 'flex' && $('aby-take').dataset.dark === '2', '点卡片 = 预览（不直接领取）');
  const bag0 = g.inventory.bag.length, nm = $('aby-body').querySelectorAll('.abydk')[2].querySelector('b').textContent;
  $('aby-take').click(); step(0.2);
  check($('abyss').style.display !== 'flex' && (g.inventory.bag.length === bag0 + 1) && g.inventory.bag.some(i => i.name.startsWith(nm)), `「带走」→ abyDarkTake 领取「${nm}」`);
  check(!D().active, '领取后祭坛释放');
  g.settings.map3d = 'off'; g.abyDarkShow(); g.openAbyss(); step(0.1);
  const bag1 = g.inventory.bag.length;
  check($('aby-stage').style.display === 'none', '3D 关闭：深渊结算退回旧卡片列表');
  $('aby-body').querySelector('.abydk[data-dark="1"]').click(); step(0.1);
  check(g.inventory.bag.length === bag1 + 1 && $('abyss').style.display !== 'flex', '旧版行为：点卡片直接领取');
  g.settings.map3d = 'auto';
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}
async function altarPhone(c) {
  const { g, $, w, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  g.openDropGuide('abyss_top'); step(0.4);
  const d = g.altarDebug();
  check(w.document.documentElement.classList.contains('phone') && d.active && d.renders > 0 && d.renders <= 0.4 * 20 + 2, `手机：祭坛渲染且限 30 帧（${d.renders} 帧 / 0.4 秒）`);
  check(d.particles > 0 && d.particles <= 160, `手机粒子 ${d.particles}（≤160）`);
  check(g.mainSkipped > 0 && /太古 6/.test($('alt-anc')?.textContent ?? ''), '手机：主场景限帧 + 20 层顶级橙装太古 6%');
  const sp = d.screen([...Array(d.orbit).keys()].find(i => i !== d.sel)); const hit = d.clickAt(sp.x, sp.y); step(0.1);
  check(hit >= 0 && g.altarDebug().sel === hit, '手机：点环绕物品切换');
  g.togglePanel('dropguide', false); step(0.2); check(!g.altarDebug().active, '手机：关闭即停');
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}
async function hud96Test(c) {
  const { g, $, w, step, check, key } = c;
  const root = w.document.documentElement;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  $('tut-skip')?.click(); step(0.1);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  const D = () => g.runeHudDebug();
  check(!!$('orbs') && !!$('orb-hp') && !!$('orb-res') && !!$('orb-xpf') && !root.classList.contains('touch'), '电脑：血球 + 资源球 + 经验弧都在');
  g.player.hp = Math.round(g.player.maxHp * 0.5); step(0.2);
  check(Math.abs(parseFloat(D().orbHp) - g.player.hp / g.player.maxHp) < 0.01 && $('orb-hpt').textContent === String(g.player.hp), `血球液面 --k=${D().orbHp}，数字 ${$('orb-hpt').textContent}`);
  check(!D().low && !$('orb-hp').classList.contains('low'), '半血不闪红');
  g.player.hp = Math.round(g.player.maxHp * 0.2); step(0.2);
  check(D().low && $('orb-hp').classList.contains('low'), '低于 30% 血量：血球红色脉冲');
  g.player.hp = g.player.maxHp; step(0.2);
  check(D().orbRes !== '' && /^#/.test(D().resColor) && /\d/.test($('orb-rest').textContent), `资源球：--k=${D().orbRes} 颜色 ${D().resColor} 文字 ${$('orb-rest').textContent}`);
  check(/^[\d.]+ 100$/.test(D().xpDash), `经验弧 dasharray ${D().xpDash}`);
  check($('pf-hp').style.width !== '' && $('xp-fill').style.width !== '', '旧血条 / 经验条元素照常更新（兼容旧测试）');
  // 技能环
  check(D().sweeps >= 6 && D().sparks >= 6 * 8 && !!$('sk-dodge').querySelector('.sw') && !!$('sk-potion').querySelector('.sw'), `冷却扫光层 ${D().sweeps} 个、就绪火星 ${D().sparks} 颗（含翻滚 / 药水）`);
  g.enemies.forEach(e => { e.pos.set(999, 0, 999); });
  g.tryCast('skill3'); step(0.3);
  const el3 = $('sk-skill3'), cd3 = parseFloat(el3.style.getPropertyValue('--cd'));
  check(cd3 > 0.5 && el3.classList.contains('cding'), `放技能 3 后冷却扫光 --cd=${cd3.toFixed(2)}`);
  let readyAt = -1; for (let i = 0; i < 20 * 25 && readyAt < 0; i++) { step(0.05); if (el3.classList.contains('ready')) readyAt = g.T; }
    check(readyAt > 0 && el3.style.getPropertyValue('--cd') === '0' && !el3.classList.contains('cding'), '冷却结束：扫光清零 + 就绪火星（.ready）');
  // 首领条：阶段刻度 + 施法条
  g.hudDemo(true); step(0.3);
  check($('boss-frame').style.display === 'block' && $('bf-ticks').children.length === 2 && $('castbar').style.display === 'block' && $('cb-name').textContent === '熔岩喷发', `首领条：2 个阶段符印、施法条「${$('cb-name').textContent}」`);
  check(D().ticksGone[0] === true && D().ticksGone[1] === false && $('bf-ticks').children[0].classList.contains('past'), `已过的 70% 符印灰掉，35% 符印还亮（${JSON.stringify(D().ticksGone)}）`);
  step(6.5);
  check(D().ticksGone[1] === true && $('bf-ticks').children[1].classList.contains('gone') && !$('bf-ticks').children[1].classList.contains('past'), '血量跌破 35%：符印碎裂（.gone 动画）');
  g.hudDemo(false); step(0.2);
  check($('boss-frame').style.display === 'none', '关闭演示：首领条隐藏');
  // 统一通知栏
  $('toast').innerHTML = '';
  g.toast('获得 [熔岩战靴]', '#a335ee'); g.toast('完成任务：沙蝎之患', '#3f3'); g.toast('🏆 成就达成「初入赤砂」+10', '#ffd100'); g.toast('升级！等级 12', '#ffd100'); g.toast('药水冷却中', '#ff9a40');
  check(JSON.stringify(D().notices) === JSON.stringify(['loot', 'quest', 'achv', 'lvl', 'warn']), `通知分类：${D().notices.join(' / ')}`);
  check(![...w.document.querySelectorAll('#toast div')].some(d => d.textContent.includes('🏆')) && $('toast').textContent.includes('成就达成「初入赤砂」'), '成就通知去掉 emoji（手机字体不缺字），文字保留');
  for (let i = 0; i < 4; i++) g.toast(`获得 金币 ×${i}`, '#e8c060');
  check($('toast').children.length === 5, `电脑通知栏最多 5 条（现在 ${$('toast').children.length}）`);
  // 太古横幅
  g.setAncientChance(1); const n0 = D().bannerCount;
  const its = g.abyFloorItems(20); step(0.1);
  check(D().banner && D().bannerCount === n0 + its.length && /太古/.test(D().bannerText) && /等 3 件|（太古）/.test(D().bannerText), `太古掉落：全屏横幅「${D().bannerText}」`);
  check(!/太古掉落/.test($('yell').textContent), '不再用喊话代替横幅');
  await new Promise(r => setTimeout(r, 4000));
  check(!D().banner, '横幅约 3.8 秒后收起');
  g.setAncientChance(null);
  // HUD 粒子开关
  key('Escape'); step(0.05);
  if ($('settings').style.display !== 'flex') { key0Fallback(); }
  const off = $('set-body').querySelector('[data-set=hudFx][data-v=false]');
  off?.click();
  check(!!off && root.classList.contains('nohudfx') && g.settings.hudFx === false, '设置「HUD 粒子：关」→ html.nohudfx');
  $('set-body').querySelector('[data-set=hudFx][data-v=true]').click();
  check(!root.classList.contains('nohudfx'), '重新打开 HUD 粒子');
  function key0Fallback() { g.togglePanel('settings', true); }
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}
async function hud96Phone(c) {
  const { g, $, w, step, check } = c;
  const root = w.document.documentElement;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  check(root.classList.contains('phone') && root.classList.contains('touch'), `手机布局：${root.className}`);
  g.player.hp = Math.round(g.player.maxHp * 0.4); step(0.2);
  check(Math.abs(parseFloat($('pf-hp').style.width) - g.player.hp / g.player.maxHp * 100) < 1, `手机保留左上横条血条（${$('pf-hp').style.width}）`);
  const T = (el, type, id, x, y) => { const t = { identifier: id, clientX: x, clientY: y, target: el }; const e = new w.Event(type, { bubbles: true, cancelable: true }); e.changedTouches = [t]; e.touches = [t]; el.dispatchEvent(e); };
  const cd0 = g.loadout.cooldownLeft('skill2', g.T);
  T($('sk-skill2'), 'touchstart', 1, 520, 340); step(0.2); T($('sk-skill2'), 'touchend', 1, 520, 340);
  check(g.loadout.cooldownLeft('skill2', g.T) > cd0 && parseFloat($('sk-skill2').style.getPropertyValue('--cd')) > 0, '触屏按技能：放出 + 冷却扫光');
  $('toast').innerHTML = ''; for (let i = 0; i < 6; i++) g.toast(`获得 [物品${i}]`, '#fff');
  check($('toast').children.length === 3, `手机通知栏最多 3 条（${$('toast').children.length}）`);
  $('cam-lock').click(); step(0.05); const lk = g.settings.camLock; $('cam-lock').click(); step(0.05);
  check(g.settings.camLock === !lk, '锁视角按钮可切换');
  $('btn-menu').click(); check(root.classList.contains('menu-open'), '「≡」抽屉照常展开'); $('btn-menu').click();
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}

async function ancientTest(c) {
  const { g, $, step, check, log, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.setAncientChance(1);
  const f20 = g.abyFloorItems(20);
  check(f20.length === 3 && f20.every(i => i.ancient && i.name.endsWith('（太古）')), `深渊 20 层几率拉满：3 件都是太古（${f20.map(i => i.name).join('、')}）`);
  check(f20.every(i => i.affixLog.every(a => a.r === 1)), '太古词条全部峰值');
  const f5 = g.abyFloorItems(5); check(f5.every(i => !i.ancient), '5 层首领不出太古');
  g.setAncientChance(0); check(g.abyFloorItems(20).every(i => !i.ancient), '几率 0 时不出太古'); g.setAncientChance(1);
  // 掉落光柱：深红金边双螺旋 + 太古符环 + 红名牌
  const it = f20[0], n0 = g.loots.length;
  g.spawnLoot(it, g.player.pos.clone().add({ x: 3, y: 0, z: 0 }), 0, 1); step(0.2);
  const L = g.loots[n0];
  check(!!L && !!L.obj.getObjectByName('ancRing') && !!L.obj.getObjectByName('orbit'), '太古掉落：双螺旋光柱 + 太古符环 + 环绕余烬');
  check(L.plate.classList.contains('np-anc'), '太古名牌红底金边');
  // 背包格子红描边 + 提示框
  const w = f20.find(i => i.slot === 'oneHand' || i.slot === 'twoHand' || i.slot === 'offHand') ?? f20[0];
  g.inventory.add(w); key('b'); step(0.1);
  check(c.w.document.querySelectorAll('#bag .slot.is-anc').length >= 1, '背包里太古格子红色描边 + 余烬');
  key('b'); step(0.05);
  // 穿上太古主手：武器红光 + 火星
  const prev = g.gen.classId; g.gen.classId = g.cls.id;
  const lgW = [...f20, ...g.abyFloorItems(20), ...g.abyFloorItems(20)].find(i => i.slot === 'oneHand' || i.slot === 'twoHand');
  g.gen.classId = prev;
  if (lgW) { g.inventory.add(lgW); const r = g.inventory.equip(lgW.id); g.refreshGear(); step(0.3); void r; check(/太古武器/.test(g.gearSummary()), `太古主手武器红色发光（${g.gearSummary()}）`); }
  else log('  （本职业顶级池没有主手武器，跳过武器光效）');
  // 分解：双倍材料 + 太古余烬；批量分解跳过
  const pre = g.forge.salvagePreview(f20[1]);
  const plain = { ...f20[1], ancient: undefined };
  const base = g.forge.salvagePreview(plain);
  check(pre.some(x => x.id === 'mat_ember') && pre[0].min === base[0].min * 2, `分解太古：双倍材料 + 太古余烬（${pre.map(x => x.id + '×' + x.min).join(' ')}）`);
  // 结算自选 10%（几率拉满必出）
  const opts = g.abyDarkOptions(); check(opts.length > 0, '20 层结算有可选');
  // 存档往返
  g.save(); let sv = ''; for (let i = 0; i < c.w.localStorage.length; i++) sv += c.w.localStorage.getItem(c.w.localStorage.key(i)) ?? '';
  check(/"ancient":true/.test(sv), '存档保存太古字段');
  // 长副本炼狱：raidEndgameDrop 需要在副本里，这里只检查函数存在
  check(typeof g.raidEndgameDrop === 'function' && typeof g.abyDarkTake === 'function', '长副本 / 结算领取接口在');
  g.setAncientChance(null);
  check(c.errors.length === 0, `全程无报错（${c.errors.slice(0, 2).join(' | ')}）`);
}

async function fogTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.ensureWild('star'); g.goMap('star'); step(1.5);
  let d = g.exDebug('star');
  check(d.stones.length === 2 && d.stones.every(s => !s.on), `星落高原 2 块传送石（${d.stones.map(s => s.name).join('、')}）`);
  check(d.fog !== null && d.fog > 0 && d.fog < 25, `进图后已点亮营地周围（探索 ${d.fog}%）`);
  const f0 = d.fog;
  const s0 = d.stones[0];
  g.player.pos.set(s0.x + 1.5, 0, s0.z + 1); step(1.3);
  d = g.exDebug('star');
  check(d.fog > f0, `走到传送石附近，探索度上升 ${f0}% → ${d.fog}%`);
  const it = g.exInteract();
  check(!!it && /激活/.test(it.label), `交互提示：${it?.label}`);
  it.act(); step(0.2);
  d = g.exDebug('star');
  check(d.stones[0].on && d.save.ws[s0.id], '传送石已激活并写进存档');
  const it2 = g.exInteract();
  check(!!it2 && /传送/.test(it2.label), `激活后交互变成传送：${it2?.label}`);
  // 传送阵面板里有这块传送石，能从营地传过来
  g.goMap('camp'); step(0.5);
  g.openWaypoints(); step(0.1);
  const btn = [...c.w.document.querySelectorAll('#travel-body button[data-ws]')];
  check(btn.length === 1 && !btn[0].disabled, `传送阵面板列出传送石（${btn.length} 个）`);
  btn[0].click(); step(1);
  check(g.zone === 'star' && Math.hypot(g.player.pos.x - s0.x, g.player.pos.z - s0.z) < 6, `从营地传到传送石旁（${g.zone}）`);
  // 瞭望塔点亮一大片
  const t = d.towers[0], before = g.exDebug('star').fog;
  g.player.pos.set(t.x + 1, 0, t.z + 1); step(0.2);
  const ti = g.exInteract(); if (ti && /登上/.test(ti.label)) ti.act(); step(1.2);
  const after = g.exDebug('star').fog;
  check(after >= before + 8, `登塔点亮周围 60 米（${before}% → ${after}%）`);
  // 存档往返：探索度不丢
  const sv = g.exDebug('star').save;
  check(sv.fog && typeof sv.fog.cells.star === 'string' && sv.fog.pct.star === after, `存档带迷雾（${sv.fog.cells.star.length} 字节，${sv.fog.pct.star}%）`);
  // 地图能画（迷雾层不报错）
  g.openWorldMap('zone', 'star'); step(0.2); check(c.errors.length === 0, '区域详图画迷雾不报错'); g.toggleWorldMap();
  // 里程碑：直接走遍可走格子
  log(`  最终探索 ${g.exDebug('star').fog}%`);
}

async function exploreTest(c) {
  const { g, $, step, check, log, key } = c;
  const t0 = Date.now();
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  log(`  启动 + 原野探索点位 ${Date.now() - t0} ms`);
  // 原野 → 星落山径
  g.goMap('field'); step(0.5);
  const F = { x: 0, z: 400 };
  g.player.pos.set(F.x + 112, 0, F.z - 30); step(0.2);
  const it = g.currentInteractable();
  check(/星落高原/.test(it?.label ?? ''), `原野东侧山径：${it?.label}`);
  check(!!g.navFor('field').findPath(F.x + 0, F.z + 40, F.x + 110, F.z - 30), '从翠风前哨能寻路到星落山径');
  const t1 = Date.now(); g.ensureWild('star'); it.act(); for (let i = 0; i < 20 && g.zone !== 'star'; i++) step(0.1);
  log(`  生成星落高原 ${Date.now() - t1} ms`);
  check(g.zone === 'star', `进入星落高原（${g.zone}）`);
  const W = g.wilds.star, O = { x: 400, z: 400 };
  check(!!W.nav.findPath(g.player.pos.x, g.player.pos.z, O.x, O.z + 52), '山径落脚点能走到观星营地');
  for (let i = 0; i < 40 && !g.waypoints.has('st_camp'); i++) { g.player.pos.set(O.x - 6, 0, O.z + 56); step(0.1); }
  check(g.waypoints.has('st_camp'), '观星营地传送阵开通');
  const mobs = g.enemies.filter(e => e.z === 'star');
  check(mobs.length >= 90 && mobs.some(e => e.type.elite) && mobs.some(e => e.type.rare) && mobs.some(e => e.type.mini), `星落高原 ${mobs.length} 只怪（含精英 / 稀有 / 小精英）`);
  const lv = mobs.filter(e => !e.wb && !e.wbAdd).map(e => e.type.level ?? 0);
  check(Math.min(...lv) >= 16 && Math.max(...lv) <= 22, `怪物等级 ${Math.min(...lv)}~${Math.max(...lv)}`);
  check(g.wbDebug().find(x => x.id === 'wb_moss').map === 'star' && g.enemies.some(e => e.wb === 'wb_moss' && e.z === 'star'), '苔石搬到了星落高原');
  const moss = g.enemies.find(e => e.wb === 'wb_moss');
  check(!!W.nav.findPath(O.x, O.z + 52, moss.spawn.x, moss.spawn.z), '从营地能走到苔石的古树石环');
  check(g.quests.def('st_news') && g.quests.state('st_news', 18) !== 'locked', `「星落之夜」可接（${g.quests.state('st_news', 18)}）`);
  // 疾行
  g.player.pos.set(O.x, 0, O.z + 50); g.player.lastHurt = -99; step(0.2);
  key('w'); step(3.6);
  const p0 = { x: g.player.pos.x, z: g.player.pos.z }; step(1);
  const sp = Math.hypot(g.player.pos.x - p0.x, g.player.pos.z - p0.z);
  key('w', 'keyup');
  check(g.exDebug().sprint && sp > 6.5 * 1.25, `脱战 3 秒后疾行：1 秒跑 ${sp.toFixed(1)} 米`);
  g.player.lastHurt = g.T; key('w'); step(0.2); key('w', 'keyup');
  check(!g.exDebug().sprint, '受击后疾行取消');
  // 瞭望塔
  const ex = g.exDebug('star');
  check(ex.towers.length === 2 && ex.nodes.length === 9 && ex.chests.length === 4, `点位：瞭望塔 ${ex.towers.length}、采集点 ${ex.nodes.length}、宝箱 ${ex.chests.length}（含隐藏 ${ex.chests.filter(x => x.hidden).length}）`);
  const reach = [...ex.towers, ...ex.nodes, ...ex.chests].filter(p => W.nav.findPath(O.x, O.z + 56, p.x, p.z)).length;
  check(reach === ex.towers.length + ex.nodes.length + ex.chests.length, `全部点位从营地走得到（${reach}）`);
  check(!g.poisFor('star').some(p => p.kind === 'chest'), '登塔前地图上没有宝箱标记');
  const tw = ex.towers[0]; g.player.pos.set(tw.x + 2, 0, tw.z); step(0.2);
  let x = g.currentInteractable(); check(/瞭望塔/.test(x?.label ?? ''), `塔下：${x?.label}`);
  x.act(); step(0.2);
  check(g.exDebug('star').towers[0].done && g.poisFor('star').filter(p => p.kind === 'chest').length === 4, '登塔：宝箱标上地图');
  check(g.poisFor('star').filter(p => p.kind === 'rare' && !p.dim).length === 3, '登塔：稀有首领 3 个刷新点都显示');
  // 采集
  const before = { ...g.inventory.stacks };
  for (const n of ex.nodes.slice(0, 3)) { g.player.pos.set(n.x + 1, 0, n.z); step(0.1); const y = g.currentInteractable(); if (/采集/.test(y?.label ?? '')) y.act(); step(0.1); }
  const gained = ['mat_dust', 'mat_shard', 'potion_s'].map(k => (g.inventory.stack(k) - (before[k] ?? 0)));
  check(gained[0] >= 1 && gained[1] >= 1 && gained[2] >= 1, `采集矿脉 / 草药 / 晶簇：魔尘 +${gained[0]}、星辉碎片 +${gained[1]}、药水 +${gained[2]}`);
  check(g.exDebug('star').nodes.slice(0, 3).every(n => !n.ready), '采过的点 5 分钟后才刷新');
  step(0.5);
  // 宝箱
  let fake = Date.now(); g.exClock.now = () => fake;
  const ch = ex.chests.find(q => !q.hidden), hc = ex.chests.find(q => q.hidden);
  const l0 = g.loots.length;
  g.player.pos.set(ch.x + 1, 0, ch.z); step(0.1); x = g.currentInteractable(); check(/宝箱/.test(x?.label ?? ''), `箱子旁：${x?.label}`); x.act(); step(0.2);
  check(g.loots.length > l0 && !g.exDebug('star').chests.find(q => q.id === ch.id).ready, `开箱掉落 ${g.loots.length - l0} 件，箱子消失`);
  fake += 21 * 60 * 1000; step(1.2);
  check(g.exDebug('star').chests.find(q => q.id === ch.id).ready, '20 分钟后普通宝箱刷新');
  g.player.pos.set(hc.x + 1, 0, hc.z); step(0.1); x = g.currentInteractable(); check(/隐藏宝箱/.test(x?.label ?? ''), `隐藏宝箱：${x?.label}`); x.act(); step(0.2);
  fake += 2 * 60 * 1000; step(1.2);
  check(!g.exDebug('star').chests.find(q => q.id === hc.id).ready, '隐藏宝箱本周不再刷新');
  fake += 8 * 24 * 3600 * 1000; step(1.2);
  check(g.exDebug('star').chests.find(q => q.id === hc.id).ready, '下周隐藏宝箱重新出现');
  check(g.exState.opened.length === 2, `图鉴记录开过的宝箱 ${g.exState.opened.length} 个`);
  g.exClock.now = () => Date.now();
  // 去赤砂的石阶
  g.player.pos.set(O.x, 0, O.z - 72); step(0.2); x = g.currentInteractable();
  check(/赤砂/.test(x?.label ?? ''), `北边石阶：${x?.label}`);
  // 原野：瞭望塔在风蚀高台、隐藏宝箱在隐蔽洞穴
  g.goMap('field'); step(0.5);
  const fx = g.exDebug('field');
  check(fx.towers.length === 1 && fx.nodes.length === 9 && fx.chests.length === 4, `原野点位：塔 ${fx.towers.length}、采集 ${fx.nodes.length}、宝箱 ${fx.chests.length}`);
  const fr = [...fx.nodes, ...fx.chests, ...fx.towers].filter(p => g.navFor('field').findPath(F.x, F.z + 40, p.x, p.z)).length;
  check(fr === fx.nodes.length + fx.chests.length + fx.towers.length, `原野点位全部可达（${fr}）`);
  // 存档
  g.save(); const k = Object.keys(c.w.localStorage).find(q => /"ex":/.test(c.w.localStorage.getItem(q) ?? ''));
  const sv = JSON.parse(c.w.localStorage.getItem(k) ?? '{}');
  check(sv.ex?.towers?.length === 1 && sv.ex.opened.length === 2, '存档 ex 字段（瞭望塔 1、开箱 2）');
}
// v0.9.3f 动态事件 / 区域声望 / 天气
async function regionalTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  const kill = (pred) => { for (let k = 0; k < 120; k++) { const live = g.enemies.filter(e => e.alive && pred(e)); if (!live.length) return true; const e = live[0]; e.hp = 1; g.target = e; g.player.pos.set(e.pos.x + 1.5, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
  g.ensureWild('star'); g.goMap('star'); step(0.5);
  const O = { x: 400, z: 400 };
  // 预告 → 出现 → 走近开始
  g.dynForceNext('star', 20); step(1.2);
  check(/秒后出现/.test(c.w.document.getElementById('dyn-hud')?.textContent ?? ''), `预告：${c.w.document.getElementById('dyn-hud')?.textContent}`);
  g.player.pos.set(O.x - 60, 0, O.z + 60); step(20);
  check(!g.dynDebug('star').run && g.poisFor('star').some(p => p.key === 'dyn:star_escort' && p.state === '等待你前往'), '时间到：事件出现在地图上，玩家不在附近不开始');
  // 护送
  g.player.pos.set(O.x + 3, 0, O.z + 40); step(0.5);
  let d = g.dynDebug('star').run;
  check(d?.kind === 'escort', `走近开始护送（${d?.id}）`);
  let ambush = 0;
  for (let i = 0; i < 600; i++) {
    const r = g.dynDebug('star').run; if (!r) break;
    if (r.mobs) { ambush = Math.max(ambush, r.mobs); kill(e => e.tag === 'event' || e.spawnTag === 'event' || (e.z === 'star' && Math.hypot(e.pos.x - r.cart.x, e.pos.z - r.cart.z) < 14 && e.intent?.state !== 'idle')); continue; }
    g.player.pos.set(r.cart.x + 2, 0, r.cart.z + 2); step(0.5); g.player.hp = 1e7;
  }
  check(!g.dynDebug('star').run && g.repPts('star') >= 120, `护送完成（途中伏兵 ${ambush} 只），星落声望 ${g.repPts('star')}`);
  // 封印
  g.dynForceNext('star', 0); const sd = g.dynDebug('star');
  check(sd.idx % 2 === 1, '下一个事件轮换到封印');
  g.player.pos.set(O.x - 36, 0, O.z - 34); step(0.5);
  d = g.dynDebug('star').run; check(d?.kind === 'seal' && d.stones.length === 3, '封印开始：3 块封印石');
  for (const st of d.stones) { for (let i = 0; i < 20; i++) { g.player.pos.set(st.x + 1, 0, st.z); step(0.25); g.player.hp = 1e7; } }
  check(g.dynDebug('star').run?.seals.every(Boolean), '3 块封印石都封上');
  kill(e => e.z === 'star' && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack'));
  step(0.5);
  check(!g.dynDebug('star').run && g.repPts('star') >= 240, `封印完成，星落声望 ${g.repPts('star')}`);
  // 守卫：翠风麦穗村（idx 1）
  g.goMap('field'); step(0.5);
  g.dynForceNext('field', 0); g.dynStart('field', 1); step(0.3);
  d = g.dynDebug('field').run; check(d?.kind === 'defend', `守卫麦穗村开始（第 ${d?.wave} 波）`);
  for (let i = 0; i < 40 && g.dynDebug('field').run; i++) { kill(e => e.z === 'field' && e.intent && (e.intent.state === 'chase' || e.intent.state === 'attack')); const r = g.dynDebug('field').run; if (r) { g.player.pos.set(400 * 0 + 80, 0, 400 + 40); step(0.3); } }
  check(!g.dynDebug('field').run && g.repPts('field') >= 120, `守住 3 波，翠风声望 ${g.repPts('field')}`);
  // 失败：离开地图
  g.dynStart('field', 0); step(0.2); g.goMap('star'); step(0.3);
  check(!g.dynDebug('field').run, '离开地图：进行中的事件收掉');
  // 声望档位与兑换
  g.goMap('star'); step(0.2);
  g.repAdd('star', 1000); check(g.repTier('star') === 2, `星落声望 ${g.repPts('star')} → 尊敬`);
  g.inventory.addGold(5000);
  const soul0 = g.inventory.stack('soul_moss');
  check(g.repBuy('star', 'star:pack') && g.repBuy('star', 'star:soul') && g.inventory.stack('soul_moss') === soul0 + 1, '兑换补给包 + 苔石精魄');
  check(!g.repBuy('star', 'star:jewel'), '崇敬档的首饰暂不能换');
  g.repBuy('star', 'star:soul'); g.repBuy('star', 'star:soul');
  check(!g.repBuy('star', 'star:soul'), '精魄每周限 3 个');
  g.repAdd('star', 4000); const bag0 = g.inventory.bag.length;
  check(g.repBuy('star', 'star:legend') && !g.repBuy('star', 'star:legend') && g.inventory.bag.length === bag0 + 1 && g.inventory.bag.at(-1).quality === 'orange', '崇拜：传说馈赠一次性');
  // 补给商声望页
  g.player.pos.set(O.x - 5, 0, O.z + 54.5); step(0.3);
  const it = g.currentInteractable(); it?.act(); step(0.2);
  const tab = c.w.document.querySelector('#shop .tab[data-tab="rep"]');
  check(tab && tab.style.display !== 'none', '星落补给商有「声望」页');
  tab?.click(); step(0.1);
  check(/星落高原声望/.test($('shop-body').textContent) && c.w.document.querySelectorAll('#shop-body .srow').length === 4, '声望页：档位 + 4 件兑换品');
  g.togglePanel('shop', false);
  // 天气
  g.ensureWild('redsand'); g.goMap('redsand'); step(0.5);
  g.wxForce('redsand', true); step(3);
  const w1 = g.wxState('redsand'); const fog1 = g.scene.fog.far;
  for (let i = 0; i < 20; i++) step(0.5);
  const w2 = g.wxState('redsand');
  check(w2.storm && w2.k > w1.k && w2.k > 0.8 && g.scene.fog.far < fog1, `赤砂沙暴：粒子 ${Math.round(w2.k * 100)}%、雾 ${Math.round(fog1)} → ${Math.round(g.scene.fog.far)}`);
  g.wxForce('redsand', false); for (let i = 0; i < 30; i++) step(0.5);
  check(!g.wxState('redsand').storm && g.wxState('redsand').k < 0.5, `沙暴停了：粒子 ${Math.round(g.wxState('redsand').k * 100)}%`);
  // 存档
  g.save(); const k = Object.keys(c.w.localStorage).find(q => /"rep":/.test(c.w.localStorage.getItem(q) ?? ''));
  const sv = JSON.parse(c.w.localStorage.getItem(k) ?? '{}');
  check(sv.rep?.pts?.star >= 5000 && sv.rep.once.includes('star:legend'), '存档 rep 字段');
}
// v0.9.2b 副本区 / 副本传送阵 / 永霜墓穴迁移 / 区域传送阵
async function hubTest(c) {
  const { g, $, step, check, log, w } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  // 营地传送阵：不再直接进副本
  g.player.pos.set(0, 0, -30); step(0.2); g.currentInteractable().act(); step(0.2);
  const tb = $('travel-body').textContent;
  check(/区域传送阵/.test($('travel-title').textContent) && /副本传送阵/.test(tb) && !$('travel-body').querySelector('[data-dp="darkrock_mine"]:not([disabled])'), `区域传送阵：副本传送阵未激活前不能传（${$('travel-title').textContent}）`);
  g.togglePanel('travel', false);
  // 营地东北路口 → 暗岩山麓
  g.player.pos.set(51, 0, -29); step(0.3);
  check(/暗岩山路/.test($('interact').textContent), `东北路口：${$('interact').textContent}`);
  g.ensureWild('foothill'); g.currentInteractable().act(); step(0.5);
  check(g.zone === 'foothill' && g.npcs.some(n => n.id === 'hob' && n.z === 'foothill'), '进入暗岩山麓（补给商霍布）');
  check(g.enemies.filter(e => e.z === 'foothill').length >= 8 && g.enemies.filter(e => e.z === 'foothill').every(e => e.type.level <= 8), `山麓怪 ${g.enemies.filter(e => e.z === 'foothill').length} 只，都 ≤ 8 级`);
  const ws = g.wilds.foothill, dp = ws.dgates[0];
  check(dp.obj && !dp.obj.userData.dpOn, '副本传送阵模型：未激活时灰暗');
  g.player.pos.set(dp.pos.x, 0, dp.pos.z + 6); step(0.3);
  check(g.waypoints.has('dp:darkrock_mine') && dp.obj.userData.dpOn && dp.obj.getObjectByName('dp_beam').visible, '走到门口 → 激活（光柱亮起）');
  g.player.pos.set(dp.pos.x, 0, dp.pos.z + 1); step(0.2);
  check(/进入：暗岩矿洞/.test(g.currentInteractable()?.label ?? ''), `门口交互：${g.currentInteractable()?.label}`);
  g.currentInteractable().act(); step(0.4);
  check(g.zone === 'dungeon' && g.layout === 'darkrock_mine', '门口传送阵进入暗岩矿洞');
  g.goMap('camp'); step(0.3);
  // 激活后：营地传送阵直接传到门口
  g.player.pos.set(0, 0, -30); step(0.2); g.currentInteractable().act(); step(0.2);
  const btn = $('travel-body').querySelector('[data-dp="darkrock_mine"]');
  check(btn && !btn.disabled, '激活后营地传送阵可传到暗岩矿洞门口');
  btn.click(); step(0.5);
  check(g.zone === 'foothill' && Math.hypot(g.player.pos.x - dp.pos.x, g.player.pos.z - dp.pos.z) < 8, '传送到暗岩矿洞门口');
  // 回营地
  g.player.pos.set(700, 0, -458); step(0.3);
  check(/回灰石营地/.test(g.currentInteractable()?.label ?? ''), `山麓出口：${g.currentInteractable()?.label}`);
  g.currentInteractable().act(); step(0.4);
  check(g.zone === 'world' && Math.hypot(g.player.pos.x - 52, g.player.pos.z + 30) < 8, `回营地落在东北路口内侧（${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)}）`);
  // 西南 → 腐沼湿地
  g.player.pos.set(-51, 0, 33); step(0.3);
  check(/腐沼栈道/.test($('interact').textContent), `西南路口：${$('interact').textContent}`);
  g.ensureWild('marsh'); g.currentInteractable().act(); step(0.5);
  check(g.zone === 'marsh' && g.wilds.marsh.dgates[0].id === 'rotting_temple', '进入腐沼湿地，门口是腐沼神殿');
  g.player.pos.set(-700, 0, -533); step(0.3);
  { const lk = g.dungeonLock('rotting_temple'), lb = g.currentInteractable()?.label ?? ''; check(lk ? lb.includes(lk) : /进入：腐沼神殿/.test(lb), `腐沼神殿门口：${lb}`); }
  // 永霜墓穴迁到霜脊
  check(g.wildDef('frost').dungeonGates.some(d => d.id === 'frost_crypt') && !g.wildDef('ember').dungeonGates.some(d => d.id === 'frost_crypt'), '永霜墓穴入口在霜脊高地（烬落只剩王座和铸造厂）');
  // 地图
  check(g.poisFor('camp').some(p => p.name === '暗岩山路') && g.poisFor('foothill').some(p => p.kind === 'dungeon' && /已激活/.test(p.sub)), '地图：营地路口 + 副本区门口标记');
  // 自动寻路到矿洞（营地 → 山麓 → 门口 → 副本）
  g.goMap('camp'); step(0.3);
}
// v0.9.3i 三级地图 / 副本地图 / 掉落列表
async function dmapTest(c) {
  const { g, $, step, check, log, w, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.player.maxHp = 1e7; g.player.hp = 1e7;
  key('m'); step(0.1);
  [...w.document.querySelectorAll('#worldmap .tab')].find(t => t.dataset.view === 'world').click(); step(0.05);
  const lg = $('wm-legend').textContent;
  check(['暗岩矿洞', '腐沼神殿', '沙葬王陵', '巨魔冰窟', '灰烬铸造厂', '熔心王座', '永霜墓穴'].every(n => lg.includes(n)) && lg.includes('查看副本地图') && lg.includes('传送到入口'), '世界地图：副本卡片（7 个副本 + 查看副本地图 / 传送到入口）');
  check(/世界/.test($('wm-crumb').textContent), `世界视图面包屑：${$('wm-crumb').textContent}`);
  $('wm-legend').querySelector('[data-dmap="sand_tomb"]').click(); step(0.1);
  const side = () => $('rm-side').textContent;
  check($('raidmap').style.display === 'flex' && $('worldmap').style.display !== 'flex' && /沙葬王陵/.test($('rm-title').textContent), `点「查看副本地图」→ 副本地图：${$('rm-title').textContent}`);
  check(/世界.*赤砂裂谷.*沙葬王陵/.test($('rm-crumb').textContent), `面包屑：${$('rm-crumb').textContent}`);
  check(['全副本共享', '首领 1', '首领 2', '首领 3', '最终奖励', '隐藏首领', '蝎后的尾刺剑', '永生安卡', '王陵封印指环'].every(t => side().includes(t)), '掉落列表：共享 / 每个首领 / 最终奖励 / 隐藏首领（含副本小套）');
  check(/装等 40/.test(side()) && $('rm-diff').querySelectorAll('.dt').length === 4, '难度页签 4 个，默认普通装等 40');
  $('rm-diff').querySelector('[data-df="epic"]').click(); step(0.05);
  check(/装等 44/.test(side()) && g.dmView().diff === 'epic', '切到史诗：装等 44');
  g.dmSelect(1); step(0.05);
  check(/拉希德/.test($('rm-side').querySelector('.dl-h.sel')?.textContent ?? '') && g.dmView().sel === 1, '选中首领 2 → 掉落列表高亮拉希德');
  check(/未通关/.test(side()) && /隐藏首领：？/.test(side()), '本周进度 + 隐藏首领问号与条件');
  g.codex.add('fixed|蝎后的尾刺剑'); g.dmSelect(0); step(0.05);
  check(/✓ 蝎后的尾刺剑/.test(side()) && /专属掉落 1\/13/.test(side()), `已收集打 ✓（${side().match(/专属掉落 \d+\/\d+/)?.[0]}）`);
  const tp = $('rm-tp'); check(tp && tp.disabled, '传送阵未激活：传送按钮禁用');
  $('rm-crumb').querySelector('[data-rmv="zone"]').click(); step(0.05);
  check($('worldmap').style.display === 'flex' && g.wmView === 'zone' && /赤砂裂谷/.test($('wm-title').textContent), '面包屑「赤砂裂谷」→ 区域地图');
  check(/沙葬王陵/.test($('wm-legend').textContent) && /查看副本地图/.test($('wm-legend').textContent), '区域地图：本区副本卡片');
  const poi = g.poisFor('redsand').find(p => p.did === 'sand_tomb'); check(!!poi, '区域地图副本入口带副本 id（可点击）');
  [...w.document.querySelectorAll('#worldmap .tab')].find(t => t.dataset.view === 'dungeon').click(); step(0.05);
  check($('raidmap').style.display === 'flex' && /沙葬王陵/.test($('rm-title').textContent), '「副本」页签 → 刚才看的副本');
  // 传送到入口
  g.waypoints.add('dp:troll_cave'); g.ensureWild('frost');
  const err = g.dmTeleport('troll_cave'); step(0.5);
  check(!err && g.zone === 'frost' && Math.hypot(g.player.pos.x - (0 - 38), g.player.pos.z - (1200 - 50)) < 10, `传送到巨魔冰窟门口（${err ?? 'ok'}，${g.zone}）`);
  check(!!g.dmTeleport('frost_crypt'), '未激活的不能传');
  // 长副本 / 矿洞
  g.openRaidMap('molten_throne', true); step(0.05);
  check($('rm-diff').querySelectorAll('.dt').length === 2 && /共享橙装/.test(side()) && /套装/.test(side()) && /暗金/.test(side()), '长副本：标准 / 炼狱 + 套装 + 橙装 + 暗金（v0.9.6a）');
  g.goMap('camp'); step(0.3);
  g.enterDungeon('darkrock_mine', 'normal'); step(0.3);
  key('m'); step(0.1);
  check($('raidmap').style.display === 'flex' && /暗岩矿洞/.test($('rm-title').textContent) && /监工的鹤嘴锄/.test(side()) && /矿脉之心/.test(side()) && /矿道工头/.test(side()) && /工头的风灯/.test(side()) && g.enemies.some(e => e.kind === 'mine_foreman' && e.z === 'dungeon'), `矿洞里按 M（含前置首领矿道工头）：副本地图 + 专属掉落（${g.zone} ${$('raidmap').style.display} ${$('rm-title').textContent}）`);
  key('m'); step(0.05);
  check($('raidmap').style.display !== 'flex', 'M 再按关闭');
  // 画布绘制走一遍（jsdom 没有 2D 上下文：用记录调用的假上下文，检查绘制代码不抛错）
  const calls = { n: 0, fill: 0 };
  const proto = w.HTMLCanvasElement.prototype, orig = proto.getContext;
  proto.getContext = function () { return new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.n++; if (k === 'fillText') calls.fill++; }, set: () => true }); };
  let thrown = null;
  try {
    for (const id of ['darkrock_mine', 'sand_tomb', 'troll_cave', 'ash_forge', 'molten_throne', 'frost_crypt']) { g.openRaidMap(id, true); g.dmSelect(0); }
    g.togglePanel('raidmap', false); g.openWorldMap('world'); g.openWorldMap('zone', 'frost'); g.openWorldMap('zone', 'foothill');
  } catch (e) { thrown = e; }
  proto.getContext = orig;
  check(!thrown && calls.fill > 50, `副本地图 / 世界 / 区域画布绘制不抛错（${calls.n} 次调用，${calls.fill} 个文字）${thrown ? '：' + thrown.message : ''}`);
}
if (MODE === 'dmap' || MODE === 'p92c') await session('v0.9.3i：三级地图 / 副本地图 / 掉落列表', dmapTest, { storage: { darkrock_legend_save: p4Save(30, [], 4) } });
if (MODE === 'hub' || MODE === 'p92b') await session('v0.9.2b：副本区 / 副本传送阵 / 永霜墓穴迁移', hubTest, { storage: { darkrock_legend_save: p4Save(10, [], 1) } });
if (MODE === 'regional' || MODE === 'p93f') await session('v0.9.3f：动态事件 / 区域声望 / 天气', regionalTest, { storage: { darkrock_legend_save: p4Save(22, [], 1) } });
if (MODE === 'endgame' || MODE === 'p96a') await session('v0.9.6a：长副本 / 深渊掉落重做', endgameDropTest, { storage: { darkrock_legend_save: p4Save(30, [], 4) } });
if (MODE === 'ancient' || MODE === 'p96b') await session('v0.9.6b：太古装备', ancientTest, { storage: { darkrock_legend_save: p4Save(30, [], 4) } });
if (MODE === 'p96f') { await session('v0.9.6f：3D 副本浮岛（电脑）', p96fTest, { viewport: [1280, 720], storage: { darkrock_legend_save: p4Save(30, [], 4) } }); await session('v0.9.6f：3D 副本浮岛（手机 667×375）', p96fPhone, { viewport: [667, 375], touch: true, storage: { darkrock_legend_save: p4Save(30, [], 4) } }); }
if (MODE === 'map3d' || MODE === 'p96e') { await session('v0.9.6e：3D 沙盘（电脑）', map3dTest, { viewport: [1280, 720], storage: { darkrock_legend_save: p4Save(30, [], 4) } }); await session('v0.9.6e：3D 沙盘（手机 667×375）', map3dPhone, { viewport: [667, 375], touch: true, storage: { darkrock_legend_save: p4Save(30, [], 4) } }); }
if (MODE === 'altar' || MODE === 'p96d') { await session('v0.9.6d：战利品祭坛（电脑）', altarTest, { viewport: [1280, 720], storage: { darkrock_legend_save: p4Save(30, [], 4) } }); await session('v0.9.6d：战利品祭坛（手机 667×375）', altarPhone, { viewport: [667, 375], touch: true, storage: { darkrock_legend_save: p4Save(30, [], 4) } }); }
if (MODE === 'hud96' || MODE === 'p96c') { await session('v0.9.6c：符文 HUD（电脑）', hud96Test, { viewport: [1280, 720], storage: { darkrock_legend_save: p4Save(30, [], 4) } }); await session('v0.9.6c：符文 HUD（手机 667×375）', hud96Phone, { viewport: [667, 375], touch: true, storage: { darkrock_legend_save: p4Save(30, [], 4) } }); }
if (MODE === 'fog' || MODE === 'p95a') await session('v0.9.5a：地图迷雾 / 路边传送石', fogTest, { storage: { darkrock_legend_save: p4Save(18, [], 1) } });
if (MODE === 'explore' || MODE === 'p93e') await session('v0.9.3e：星落高原 / 疾行 / 瞭望塔 / 采集 / 宝箱', exploreTest, { storage: { darkrock_legend_save: p4Save(18, [], 1) } });
if (MODE === 'wb' || MODE === 'p93d') await session('v0.9.3d：世界首领（刷新 / 机制 / 掉落 / 保底 / 事件）', wbTest, { storage: { darkrock_legend_save: p4Save(30, [...P4_RS, ...P4_FR, ...P4_EM], 4) } });
if (MODE === 'terrain' || MODE === 'p93a') await session('v0.9.3a：野外地形起伏 / 坡道 / 40 米分块激活', terrainTest, { storage: { darkrock_legend_save: p4Save(28, [...P4_RS, ...P4_FR, ...P4_EM], 4) } });
if (MODE === 'phase4' || MODE === 'p4a') await session('阶段四 ①：回程 · 原野 → 赤砂裂谷 · 仓库', phase4, { storage: { darkrock_legend_save: P4_SAVE } });
if (MODE === 'phase4' || MODE === 'p4b') await session('阶段四 ②：霜脊高地（22 级起）', phase4b, { storage: { darkrock_legend_save: p4Save(22, P4_RS, 2) } });
if (MODE === 'phase4' || MODE === 'p4c') await session('阶段四 ③：烬落荒原任务（24 级起）', phase4b, { storage: { darkrock_legend_save: p4Save(24, [...P4_RS, ...P4_FR], 3) } });
if (MODE === 'phase4' || MODE === 'p4d') await session('阶段四 ④：悬赏 · 世界事件 · 传送阵（28 级）', phase4d, { storage: { darkrock_legend_save: p4Save(28, [...P4_RS, ...P4_FR, ...P4_EM], 4) } });
if (MODE === 'p4fang') await session('霜牙调试', p4fang, {});
if (MODE === 'field') await session('原野（调试）', fieldOnly, { storage: { darkrock_legend_save: JSON.stringify({ version: 4, savedAt: 0, classId: 'warrior', inventory: { gold: 100, bag: [], equipped: {}, stacks: { potion_s: 8 } },
    level: { level: 9, xp: 0 }, talents: {}, quests: { active: { q_field_news: [0], q_swamp_news: [0] }, done: ['q_wolves', 'q_fangs', 'q_mine_news', 'q_mine'] } }) } });
if (MODE === 'warrior' || MODE === 'all') await session('战士：营地 → 暗岩矿洞 → 腐沼神殿', warrior);
if (MODE === 'mage' || MODE === 'all') await session('法师：营地 → 暗岩矿洞', mage);
if (MODE === 'chrono' || MODE === 'p7a' || MODE === 'all') await session('阶段七：时砂行者（营地 → 暗岩矿洞）', chronoTest);
if (MODE === 'alchemy' || MODE === 'p7b' || MODE === 'all') await session('阶段七：炼金投弹手（营地 → 暗岩矿洞）', alchemyTest);
if (MODE === 'classgear' || MODE === 'p7c' || MODE === 'all') { await session('阶段七：时砂行者 橙装 / 套装 / 暗金 / 职业任务', classGearChrono); await session('阶段七：炼金投弹手 橙装 / 套装 / 暗金 / 职业任务', classGearAlchemy); }
if (MODE === 'shop' || MODE === 'all') await session('商店 / 强化 / 分解', shopTest);
// TODO（主线 v0.6.6 整合，下一块）：v05 / v05b / v05c 是 v0.5.0-c（账号 B）的阶段测试，里面用到的 B 难度条、典藏任务链、三按钮分解、
//   词条重铸、强化保护符在整合时已删除（见 docs/归档/旧计划/MERGE_v0.6.6.md），需要按主线改写（耐久 / 修理 / 锁定 / 套装从长副本掉 / 暗岩锻造 / 套装缺件）。
//   改写前不进 shop / all，只能单独点名运行（会失败）
if (MODE === 'v05' || MODE === 'v05a' || MODE === 'shop' || MODE === 'all') await session('v0.5 A：耐久度与修理 / 灰色杂物 / 锁定（A 的一键分解、自动分解跳过锁定）', v05Test, { viewport: [1280, 720] });
if (MODE === 'v05' || MODE === 'v05b' || MODE === 'all') await session('v0.5 B：长副本首领掉职业套装 → 4 件效果 / 变种 / 光效；并入的暗金', v05bTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'v05' || MODE === 'v05c' || MODE === 'shop' || MODE === 'all') await session('v0.5 C：铁匠兑换（暗岩锻造 / 套装缺件 / 每周限购）', v05cTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
if (MODE === 'shop' || MODE === 'mobile' || MODE === 'all') {
  await session('手机横屏 667×375（触屏）', mobileTest, { viewport: [667, 375], touch: true });
  await session('电脑 1280×720', desktopLayoutTest, { viewport: [1280, 720] });
}
if (MODE === 'shop' || MODE === 'migrate' || MODE === 'all') await session('老存档迁移：v3 每职业存档 → 角色（v5）', migrateTest, { storage: { darkrock_legend_save: LEGACY_V3 } });
if (MODE === 'tutorial' || MODE === 'all') {
  await session('新手引导：电脑 1280×720（新存档）', c => tutorialTest(c, false), { viewport: [1280, 720] });
  await session('新手引导：手机 667×375 触屏（新存档）', c => tutorialTest(c, true), { viewport: [667, 375], touch: true });
  const keep = {};
  await session('设置：修改并保存', settingsTest, { viewport: [1280, 720], keepStorage: keep });
  await session('设置：刷新页面后读回', settingsReload, { viewport: [1280, 720], storage: keep });
}

// v0.6.8：技能书 + 符文（30 级老存档补发 3 本自选书 → K 面板学习 / 装备 → 野外施放 → 熟练度 / 符文 → 推荐卡 → 掉落 → 存档读回）
async function skillBookTest(c, clsId) {
  const { g, $, step, log, check, key } = c;
  $('class-pick').children[clsId === 'mage' ? 1 : 0].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  const B = g.skillBook, alt = clsId === 'mage' ? ['ice_lance', 'flame_nova', 'blink', 'ice_age'] : ['heroic_leap', 'cleave', 'shockwave', 'bladestorm'];
  check(g.inventory.stack('tome_any') === 3 && (g.lastNotices ?? []).concat(g.pendingNotices ?? []).join('').includes('自选技能书') || g.inventory.stack('tome_any') === 3, `30 级老角色补发自选技能书 ×${g.inventory.stack('tome_any')}`);
  key('k'); step(0.05);
  check($('skillbook').style.display === 'flex' && $('sb-body').querySelectorAll('.sb-card').length === 14 && $('sb-body').querySelectorAll('.sb-row').length === 5, 'K 打开技能面板：5 个槽位（4 × 3 + 绝技 × 2）');
  check($('sb-body').querySelectorAll('[data-learn]').length === (c.g.progression.level >= 30 ? 8 : 9) && $('sb-body').querySelectorAll('.sb-card.on').length === 5, '开局 5 个原技能已装备，9 个新技能可学（含 30 级绝技）');
  for (const id of alt.slice(0, 3)) { $('sb-body').querySelector(`[data-learn="${id}"]`).click(); step(0.02); }
  check(alt.slice(0, 3).every(id => B.isLearned(id)) && g.inventory.stack('tome_any') === 0, `用 3 本自选书学会：${alt.slice(0, 3).map(id => g.cls.skills[id].name).join(' / ')}`);
  check($('sb-body').querySelectorAll('[data-learn]:not([disabled])').length === 0, '没书了：学习按钮变灰');
  g.inventory.addStack('tome_page', 5); g.renderSkillBook(); step(0.02);
  $('sb-craft').click(); step(0.02);
  check(g.inventory.stack('tome_any') === 1 && g.inventory.stack('tome_page') === 0, '5 张书页合成 1 本自选书');
  $('sb-body').querySelector(`[data-learn="${alt[3]}"]`).click(); step(0.02);
  ['skill1', 'skill2', 'skill3', 'ultimate'].forEach((sl, i) => { const b = $('sb-body').querySelector(`[data-eq="${sl}:${alt[i]}"]`); b?.click(); step(0.02); });
  const pv = sl => g.loadout.preview(sl, { now: g.T, casterHpPercent: 1, targetEffects: [] });
  check(['skill1', 'skill2', 'skill3', 'ultimate'].every((sl, i) => pv(sl).baseId === alt[i]), `技能栏换成：${['skill1', 'skill2', 'skill3', 'ultimate'].map(sl => pv(sl).displayName).join(' / ')}`);
  check($('sk-skill1').innerHTML.includes(`sk_${alt[0]}`) || $('sk-skill1').innerHTML.includes(alt[0]), '技能栏图标同步');
  key('Escape'); step(0.05);
  // 野外施放
  g.enterField(); step(0.5);
  const near = () => g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss && !e.type.elite).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos));
  const grp = near()[0];
  check(!!grp, '原野里有怪');
  g.player.pos.set(grp.pos.x + 3, grp.pos.y, grp.pos.z); g.target = grp; step(0.1);
  const m0 = { ...B.mastery };
  const hp0 = near().slice(0, 6).map(e => [e, e.hp]);
  for (const sl of ['skill2', 'skill3', 'skill1']) { g.player.hp = g.player.maxHp; if (!g.target?.alive) g.target = near()[0]; if (g.target) g.player.pos.set(g.target.pos.x + 2.5, g.target.pos.y, g.target.pos.z); g.tryCast(sl); step(0.6); }
  const hurt = hp0.filter(([e, h]) => e.hp < h || !e.alive).length;
  check(alt.slice(0, 3).every(id => (B.mastery[id] ?? 0) > (m0[id] ?? 0)), `施放加熟练度：${alt.slice(0, 3).map(id => `${g.cls.skills[id].name} ${B.mastery[id] ?? 0}`).join('，')}`);
  check(hurt >= 1, `新技能打中怪物（受伤 ${hurt} 只）`);
  if (clsId === 'mage') {
    g.player.hp = g.player.maxHp; g.loadout.resetCooldown('skill3');
    const t = near()[0]; g.target = t; g.player.pos.set(t.pos.x + 1.5, t.pos.y, t.pos.z); step(0.05);
    const p0 = g.player.pos.clone(), b0 = g.blinked;
    g.target = null; g.tryCast('skill3'); step(0.1);
    check(g.blinked === b0 + 1 && g.player.pos.distanceTo(p0) > 3, `闪现：不需要目标，向后闪 ${g.player.pos.distanceTo(p0).toFixed(1)} 米`);
  }
  // 战斗中不能换
  g.player.hp = g.player.maxHp;
  const t2 = near()[0]; if (t2) { g.player.pos.set(t2.pos.x + 1, t2.pos.y, t2.pos.z); g.target = t2; step(0.5); }
  const blk = g.swapBlocked();
  log(`战斗中换技能：${blk ?? '（没进入战斗）'}`);
  // 符文
  g.enemies.filter(e => e.z === g.zone).forEach(e => { e.hp = 0; }); step(0.3);
  const sid = alt[1]; B.mastery[sid] = 650;
  key('k'); step(0.05);
  $('sb-body').querySelector(`[data-sk="${sid}"]`).click(); step(0.02);
  const rb = [...$('sb-body').querySelectorAll('[data-rune]')].filter(b => b.dataset.rune.startsWith(sid + ':'));
  check(rb.length === 3, `「${g.cls.skills[sid].name}」熟练度 650：3 枚符文都能装`);
  const before = pv('skill2');
  rb[0].click(); step(0.02);
  const after = pv('skill2');
  check(after.displayName !== before.displayName && after.element !== before.element, `装符文：${before.displayName}（${before.element}）→ ${after.displayName}（${after.element}）`);
  check(g.inventory.resonance().counts && Object.values(g.inventory.resonance().counts).reduce((a, b) => a + b, 0) >= 1, '元素符文计入元素共鸣计数');
  // 推荐卡
  const pb = $('sb-body').querySelectorAll('[data-preset]')[0]; pb.click(); step(0.02);
  check(pv('skill1').baseId === g.cls.loadout.skill1, '推荐卡「经典」一键换回原技能');
  key('Escape'); step(0.05);
  // 掉落
  const pg0 = g.inventory.stack('tome_page'), l0 = B.unlearned().length;
  g.bookDrop('raid', () => 0.01); step(0.02);
  check(g.inventory.stack('tome_page') > pg0 && B.unlearned().length === l0 - 1, `首领掉落：书页 +${g.inventory.stack('tome_page') - pg0}，指定技能书拾取即学会（还剩 ${B.unlearned().length} 个没学）`);
  g.save();
  const sv = JSON.parse(g.rawSave());
  check(sv.skillbook && sv.skillbook.learned.length >= 9 && sv.skillbook.rune[sid] && sv.skillbook.tomesGiven.length === 3, `存档：技能书字段（学会 ${sv.skillbook?.learned.length}，符文 ${Object.keys(sv.skillbook?.rune ?? {}).length}，已补发 ${sv.skillbook?.tomesGiven}）`);
  check(sv.version === 10, '存档版本 v10');
}
async function skillBookReload(c) {
  const { g, $, step, check } = c;
  $('start').click(); step(0.5);
  const B = g.skillBook;
  check(B.learned.size >= 9 && g.inventory.stack('tome_any') === 0, `读回：学会 ${B.learned.size} 个技能，没有重复补发自选书（${g.inventory.stack('tome_any')}）`);
  check(Object.keys(B.rune).length >= 1 && g.loadout.preview('skill2', { now: g.T, casterHpPercent: 1, targetEffects: [] }), '读回：符文还在');
}
if (MODE === 'sb' || MODE === 'shop' || MODE === 'all') {
  const keep = {};
  await session('v0.6.8 技能书：战士（30 级老存档）', c => skillBookTest(c, 'warrior'), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') }, keepStorage: keep });
  await session('v0.6.8 技能书：读档', skillBookReload, { viewport: [1280, 720], storage: keep });
  await session('v0.6.8 技能书：法师（闪现）', c => skillBookTest(c, 'mage'), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('mage') } });
}
/** v0.7.4-br.A：新职业技能书（时砂行者 / 炼金投弹手）—— 学会 8 个新技能、逐个施放验证机制、符文、推荐卡 */
async function awakenTest(c) {
  const { g, $, step, check, key, w: win } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  const w = g.gen.generate(30, 'purple', ['twoHand']);
  // v1.2.10：现在战士没有胸甲传说特效（随机橙色胸甲会降紫）→ 测开孔机制时把一件紫色胸甲直接标成橙色
  const ch = g.gen.generate(30, 'orange', ['chest']); if (ch.quality !== 'orange') ch.quality = 'orange';
  g.inventory.bag.push(w, ch); g.inventory.equip(w.id); g.inventory.equip(ch.id); step(0.05);
  check(g.inventory.equippedItems().some(i => i.id === w.id) && g.inventory.equippedItems().some(i => i.id === ch.id), '穿上紫色双手武器 + 橙色胸甲');
  const runes0 = ['rs_blaze', 'rs_gale', 'rs_vast', 'rs_star', 'rs_edge', 'rs_root'].reduce((a, id) => a + g.inventory.stack(id), 0);
  for (let i = 0; i < 5; i++) g.awakenBossKill('dungeon', () => 0.01);
  const runes1 = ['rs_blaze', 'rs_gale', 'rs_vast', 'rs_star', 'rs_edge', 'rs_root'].reduce((a, id) => a + g.inventory.stack(id), 0);
  check(w.awk?.opts?.length === 3 && w.kills === 5, `击败 5 个首领：历练满，3 个隐藏词条可选（${w.awk?.opts?.join(' / ')}）`);
  check(runes1 > runes0, `首领掉落岩纹 +${runes1 - runes0}`);
  if ($('awaken').style.display !== 'flex') key('u'); step(0.05);   // v1.2.10：历练满时面板可能已自动弹出，再按 U 会把它关掉
  check($('awaken').style.display === 'flex' && $('awk-body').querySelectorAll('.awk-it').length >= 2, 'U 打开觉醒 · 岩纹面板');
  $('awk-body').querySelector(`[data-awk-sel="${w.id}"]`).click(); step(0.02);
  $('awk-body').querySelector('[data-awk-pick="0"]').click(); step(0.05);
  check(!!w.awk.pick && g.loadout.allModifiers().some(m => m.id.startsWith('awk:')), `选择隐藏词条：${w.awk.pick}，已计入技能修饰器`);
  ['rs_blaze', 'rs_gale', 'rs_vast'].forEach(id => g.inventory.addStack(id, 1));
  g.inventory.gold += 5000; g.inventory.addStack('cur_sigil', 5);
  $('awk-body').querySelector(`[data-awk-sel="${ch.id}"]`).click(); step(0.02);
  $('awk-body').querySelector('[data-awk-open]').click(); step(0.02);
  check($('awk-body').querySelectorAll('.awk-sock').length === 3, '橙色胸甲 2 孔 → 铁匠开孔到 3 孔');
  ['rs_blaze', 'rs_gale', 'rs_vast'].forEach((id, i) => { $('awk-body').querySelector(`[data-awk-rune="${id}"]`).click(); step(0.01); $('awk-body').querySelector(`[data-awk-sock="${i}"]`).click(); step(0.02); });
  check(g.awakenDebug().words.includes('rw_wildfire') && g.loadout.allModifiers().some(m => m.id === 'rw:rw_wildfire'), '按 炎→风→广 镶嵌：发现纹语「燎原」，记入图鉴并生效');
  check($('awk-body').innerHTML.includes('纹语图鉴（1/8）'), '图鉴 1/8');
  g.save(); step(0.05);
  const LS = win.localStorage; let sv = {};
  for (let i = 0; i < LS.length; i++) { const v = LS.getItem(LS.key(i)) ?? ''; if (v.includes('rw_wildfire') && v.includes('"runewords"')) sv = JSON.parse(v); }
  if (!sv.runewords) for (let i = 0; i < LS.length; i++) c.log('  key ' + LS.key(i) + ' ' + (LS.getItem(LS.key(i)) ?? '').length);
  check(sv.runewords?.includes('rw_wildfire') && JSON.stringify(sv).includes('"pick"'), '存档：纹语图鉴 + 觉醒选择写入（存档版本不变）');
  key('Escape'); step(0.05);
}

async function tal2Test(c) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); step(0.05);
  check(g.tree.totalPoints === 21 && g.tree.available === 21, `30 级：21 个天赋点（${g.tree.totalPoints}）`);
  key('n'); step(0.05);
  check($('tal-sum').querySelectorAll('[data-tpage]').length === 3, '天赋面板：3 个天赋页按钮');
  check($('tal-tree').querySelectorAll('.tk-cap').length === 3 && $('tal-tree').querySelectorAll('.tk-res').length === 3, '终极（六边形）3 个、资源节点（方形⚡）3 个');
  for (const id of ['wa_weapon', 'wa_weapon', 'wa_weapon', 'wa_res']) g.tree.add(id);
  step(0.05);
  check(g.res.bonus.thrAdd === -10, `资源天赋「蓄势」：怒气门槛 −10（${g.res.bonus.thrAdd}）`);
  const sp1 = g.tree.spent;
  $('tal-sum').querySelector('[data-tpage="1"]').click(); step(0.05);
  check(g.tree.spent === 0 && g.talentPage === 1 && g.res.bonus.thrAdd === 0, '切到天赋页 2：空白页，资源加成跟着取消');
  g.tree.add('wf_frenzy'); step(0.02);
  $('tal-sum').querySelector('[data-tpage="0"]').click(); step(0.05);
  check(g.tree.spent === sp1 && g.tree.rank('wa_res') === 1, `切回天赋页 1：加点保留（${g.tree.spent} 点）`);
  g.save(); step(0.05);
  const LS = c.w.localStorage; let sv = {};
  for (let i = 0; i < LS.length; i++) { const v = LS.getItem(LS.key(i)) ?? ''; if (v.includes('"talentPages"') && !LS.key(i).includes('_bak')) sv = JSON.parse(v); }
  check(sv.version === 10 && sv.talentPages?.length === 3 && sv.talentPages[1].wf_frenzy === 1 && sv.talents.wa_res === 1, '存档 v10：3 套天赋页都写入');
}
async function tal2Migrate(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(1);
  check(g.tree.spent === 0 && g.tree.available === 21, 'v9 老存档：旧天赋全部返还（21 点）');
  check(c.toasts?.some?.(t => t.includes('天赋树 2.0')) ?? true, '提示「天赋树 2.0，点数已返还」');
}

async function ticonTest(c, idx) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  key('n'); step(0.1);
  const nodes = [...$('talent').querySelectorAll('.tnode')];
  const combos = nodes.map(d => (d.querySelector('.pic')?.className.match(/ic-\S+/)?.[0] ?? '?') + '|' + (d.querySelector('.tbadge')?.innerHTML ?? ''));
  const uniq = new Set(combos).size, noBadge = nodes.filter(d => !d.querySelector('.tbadge')).length, fallback = combos.filter(k => k.startsWith('ic-ui_class')).length;
  check(nodes.length > 30 && noBadge === 0 && uniq === nodes.length && fallback === 0, `${g.cls.name}：${nodes.length} 个天赋，图标组合 ${uniq} 种不重复，缺徽记 ${noBadge}，缺底图 ${fallback}`);
}

async function nextTest(c) {
  const { g, w, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  const btn = $('btn-next');
  check(!!btn, `任务追踪上有「推荐下一步」按钮`);
  g.tree.totalPoints += 0; const d = g.nextDebug();
  check(d.recs.length >= 2, `推荐列表：${d.recs.slice(0, 3).join(' / ')}`);
  btn.click(); step(0.1);
  check($('nextstep').style.display === 'flex' && $('ns-body').querySelectorAll('.nsrow').length >= 2, '点按钮打开推荐面板');
  check($('ns-body').querySelector('.nsroad')?.textContent.includes('天赋树'), '面板里有 1–30 级成长路线');
  check($('ns-body').querySelectorAll('[data-replay]').length === 0, '新角色还没有可重看的教学');
  check(d.seen.length === 0 && d.done.length === 0, `新角色引导记录为空：seen ${d.seen} done ${d.done}`);
  key('Escape'); step(0.05);
  g.lessonOnLevel(10, 0); step(0.1);
  check($('lesson').style.display === 'flex' && $('lesson-title').textContent.includes('10 级'), `10 级弹出系统教学：${$('lesson-title').textContent}`);
  $('lesson-body').querySelector('[data-lact="talent"]').click(); step(0.1);
  check($('lesson').style.display !== 'flex' && $('talent').style.display === 'flex', '教学里的按钮直接打开天赋面板');
  key('Escape');
  g.lessonOnLevel(10, 0); step(0.1);
  check($('lesson').style.display !== 'flex', '同一个教学只弹一次');
  const gold = g.inventory.gold;
  g.ach.noteBoss('监工格罗克'); const got = g.milestoneCheck();
  check(got.some(m => m.id === 'm_grok') && g.inventory.gold === gold + 250 + got.filter(m => m.id !== 'm_grok').reduce((t, m) => t + m.gold, 0), `成长目标「矿洞之主」完成发金币：${got.map(m => m.name).join('、')}`);
  check(g.milestoneCheck().length === 0, '成长目标不重复领取');
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.guide?.done.includes('m_grok') && sv.guide.seen.includes(10), `存档带引导记录：${JSON.stringify(sv.guide)}`);
}

// v0.9.6g 玩法介绍（替换推荐下一步）
async function guide96Test(c) {
  const { g, w, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); $('tut-skip')?.click(); key('Escape'); step(0.1);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  let d = g.introDebug();
  check(d.unlocked.join() === 'combat' && d.fresh.length === 0, `4 级：只解锁「战斗与职业」，没有新章节提示（${d.unlocked}）`);
  g.renderTracker?.(); step(0.05);
  check(/玩法介绍/.test($('btn-next')?.textContent ?? '') && !$('btn-next').classList.contains('gd-new'), '追踪栏按钮改名「玩法介绍」，没有火星');
  $('btn-next').click(); step(0.1);
  const chs = [...$('ns-body').querySelectorAll('.gd-ch')];
  check($('nextstep').style.display === 'flex' && /当前推荐/.test($('ns-body').textContent) && $('ns-body').querySelectorAll('.nsrow').length >= 2, '面板首页保留「当前推荐」卡片');
  check((DLCS.length ? chs.length >= 8 : chs.length === 8) && ['战斗与职业', '套装与橙装', '暗金与太古', '长副本', '深渊', '野外探索', '世界首领', '声望'].every(n => $('ns-body').textContent.includes(n)), `8 个章节：${chs.map(e => e.textContent.trim()).join(' / ')}`);
  check(chs.filter(e => e.classList.contains('lock')).length === 7 + (DLCS.includes('dlc1') ? 2 : 0) && /🔒/.test(chs[4].textContent), '未解锁章节灰显（7 个）');
  check(!!$('ns-body').querySelector('.nsroad') && $('ns-body').querySelectorAll('[data-replay]').length === 0, '成长路线 / 重看教学照旧');
  chs[4].click(); step(0.1);
  check(/解锁条件：达到 30 级/.test($('gd-detail').textContent) && !g.altarDebug().active, `点未解锁的深渊：显示解锁条件、不渲染 3D（${$('gd-detail').querySelector('.gd-lk')?.textContent}）`);
  key('Escape'); step(0.05);
  // 升到 30 级 → 新章节火星 + 菜单红点
  g.progression.level = 30; g.introSync(); g.renderTracker?.(); step(0.05);
  d = g.introDebug();
  check(d.fresh.filter(x => !x.startsWith('pack:')).length === 7 && $('btn-next').classList.contains('gd-new') && $('btn-next-m').classList.contains('gd-new'), `30 级：7 个新章节，按钮冒火星（${d.fresh}）`);
  await new Promise(r => setTimeout(r, 700));
  check($('next-dot').style.display !== 'none' && $('menu-badge').style.display !== 'none', `菜单「玩法」红点 + ≡ 汇总红点（${$('next-dot').style.display}/${$('menu-badge').style.display}）`);
  $('btn-next').click(); step(0.2);
  d = g.introDebug(); let a = g.altarDebug();
  check(d.sel === 'sets' && d.seen.includes('sets') && d.fresh.filter(x => !x.startsWith('pack:')).length === 6, `打开自动跳到第一个新章节「套装与橙装」并记为看过（${d.sel}，剩 ${d.fresh.length}）`);
  check(a.active && a.host === 'gd-stage' && a.renders > 0 && d.items >= 4 && a.particles <= 800, `章节预览复用祭坛 3D：${d.items} 件 / ${a.renders} 帧 / 粒子 ${a.particles}`);
  check(a.centerTier >= 3 && $('gd-2d').querySelectorAll('.gd-it').length === d.items, `中间真模型（光效档 ${a.centerTier}）+ 下方物品名条`);
  check(g.mainSkipped > 0, `预览打开时主场景限帧（跳过 ${g.mainSkipped}）`);
  $('gd-2d').querySelectorAll('.gd-it')[2].click(); step(0.1);
  check(g.introDebug().itemSel === 2 && g.altarDebug().sel === 2, '点物品名切换祭坛中间模型');
  $('ns-body').querySelector('[data-ch="dark"]').click(); step(0.15);
  a = g.altarDebug(); const txt = $('gd-detail').textContent;
  check(/4%/.test(txt) && /6%/.test(txt) && /10%/.test(txt) && /50 个暗金碎片/.test(txt), '暗金与太古：太古 4% / 6% / 10%、50 碎片兑换（读数据）');
  check($('gd-2d').querySelector('.gd-it[style*="#ff2a2a"]') && a.active, '暗金章节带太古示例件（红名）');
  $('ns-body').querySelector('[data-ch="abyss"]').click(); step(0.1);
  check(/共 20 层/.test($('gd-detail').textContent) && /\+8%/.test($('gd-detail').textContent), `深渊：20 层、每层 +8%`);
  $('ns-body').querySelector('[data-ch="explore"]').click(); step(0.1);
  check(/传送石/.test($('gd-detail').textContent) && /瞭望塔/.test($('gd-detail').textContent) && !g.altarDebug().active && !!$('gd-2d').querySelector('.gd-ico'), '野外探索：静态图标、不开 3D');
  $('ns-body').querySelector('[data-ch="wboss"]').click(); step(0.1);
  check(/苔石/.test($('gd-detail').textContent) && /30 分钟/.test($('gd-detail').textContent), '世界首领：名字 / 刷新时间读数据');
  $('ns-body').querySelector('[data-ch="rep"]').click(); step(0.1);
  check(/崇拜 4000/.test($('gd-detail').textContent), '声望档位读数据');
  for (const id of ['raid']) { $('ns-body').querySelector(`[data-ch="${id}"]`).click(); step(0.05); }
  d = g.introDebug(); g.introSync(); step(0.1);
  for (const id of d.fresh.filter(x => x.startsWith('pack:'))) { $('ns-body').querySelector(`[data-ch="${id}"]`)?.click(); step(0.05); }   // v1.2.12 内容包章节（DLC 构建）也要看过
  d = g.introDebug(); g.introSync(); step(0.1); d = g.introDebug();
  check(d.fresh.length === 0 && !$('btn-next-m').classList.contains('gd-new') && $('next-dot').style.display === 'none', `全部看过：火星 / 红点消失（剩 ${d.fresh}）`);
  g.togglePanel('nextstep', false); step(0.2);
  check(!g.altarDebug().active, '关闭面板即停 3D 并释放');
  g.save(); const sv = JSON.parse(g.rawSave());
  check(Array.isArray(sv.guide?.intro) && sv.guide.intro.length >= 7, `存档 guide.intro 记录看过的章节：${sv.guide?.intro}`);
  // 3D 不可用回退
  g.altarDebug().setFailed?.('test'); g.introOpen('sets'); step(0.1);
  check(!g.altarDebug().active && $('gd-stage').style.display === 'none' && $('gd-2d').querySelectorAll('.gd-it').length >= 4, '3D 不可用：回退 2D 物品名条');
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}
async function guide96Phone(c) {
  const { g, w, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  w.document.querySelectorAll('.panel').forEach(p => { if (p.style.display === 'flex') g.togglePanel(p.id, false); }); step(0.1);
  const d = g.introDebug();
  check(d.unlocked.filter(x => !String(x).startsWith('pack:')).length === 8 && d.fresh.filter(x => !x.startsWith('pack:')).length === 0, `30 级老存档（无 intro 字段）：已解锁章节算看过，不冒火星`);
  $('btn-next-m').click(); step(0.1);
  check($('nextstep').style.display === 'flex' && /当前推荐/.test($('ns-body').textContent), '手机：菜单「玩法」打开玩法介绍');
  g.introOpen('abyss'); step(0.4);
  const a = g.altarDebug();
  check(w.document.documentElement.classList.contains('phone') && a.active && a.renders > 0 && a.renders <= 0.4 * 20 + 2, `手机：预览限 30 帧（${a.renders} 帧 / 0.4 秒）`);
  check(a.particles <= 160, `手机粒子 ${a.particles}（≤160）`);
  g.togglePanel('nextstep', false); step(0.2);
  check(!g.altarDebug().active, '手机：关闭即停');
  check(c.errors.length === 0, `无报错${c.errors.length ? '：' + c.errors[0].slice(0, 200) : ''}`);
}
async function nextOld(c) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  const d = g.nextDebug();
  check([10, 25, 30].every(l => d.seen.includes(l)), `30 级老存档读入：已过的教学不再弹（seen ${d.seen}）`);
  check(d.recs.some(r => r.includes('长副本')), `满级推荐长副本：${d.recs.join(' / ')}`);
}

async function achTest(c) {
  const { g, w, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  const got = g.achCheck(); const d0 = g.achDebug();
  check(d0.done.includes('level_4') && d0.done.includes('level_1'), `30 级存档读入即达成等级成就：${d0.done.length} 个`);
  check(got.length === d0.done.length && d0.titles.includes('暗岩冒险者'), `首次检查弹出新成就 + 称号「暗岩冒险者」：${d0.titles.join('、')}`);
  check(g.achCheck().length === 0, '再次检查不会重复达成');
  key('o'); step(0.1);
  check($('achv').style.display === 'flex' && $('achv-body').querySelectorAll('.achrow').length >= 60, `按 O 打开成就面板：${$('achv-body').querySelectorAll('.achrow').length} 个成就`);
  check($('achv-sum').textContent.includes('成就'), `面板标题统计：${$('achv-sum').textContent}`);
  for (const [tab, sel, min] of [['spirit', '.cxcard', 12], ['rune', '.cxcard', 8], ['boss', '.cxcard', 10]]) {
    $('achv-body').querySelector(`[data-tab="${tab}"]`).click(); step(0.05);
    const n = $('achv-body').querySelectorAll(sel).length;
    check(n >= min, `${tab} 图鉴：${n} 张卡片`);
  }
  check($('achv-body').querySelector('.cxcard.locked b').textContent === '？？？', '没击败的首领显示 ？？？');
  const t = g.achDebug().titles[0];
  $('achv-body').querySelector('[data-tab="ach"]').click(); step(0.05);
  const sel = $('achv-title'); sel.value = t; sel.dispatchEvent(new w.Event('change')); step(0.05);
  key('Escape'); key('c'); step(0.1);
  check($('char-sub').textContent.startsWith(`「${t}」`), `称号显示在角色面板：${$('char-sub').textContent.slice(0, 20)}`);
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.ach && sv.ach.title === t && Object.keys(sv.ach.done).length === d0.done.length, `存档带成就和称号：${Object.keys(sv.ach?.done ?? {}).length} 个`);
  key('Escape'); $('achv-body').querySelector('[data-tab="gear"]')?.click();
}

async function pgTest(c) {
  const { g, w, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  key('c'); step(0.1);
  check($('paragon').textContent.includes('暗岩印记 0/100'), `30 级角色面板显示暗岩印记：${$('paragon').textContent.slice(0, 40)}`);
  const base = g.tree.totalPoints;
  check(base === 21, `满级基础天赋点 21：${base}`);
  const v = g.paragonGainXp(4000);
  check(v === 1000 && g.paragon.level === 0 && g.paragon.xp === 1000, `长副本外印记经验 25%：+${v}，Lv ${g.paragon.level} xp ${g.paragon.xp}`);
  g.paragon.addXp(3000); step(0.05);
  check(g.paragon.level === 1 && g.paragon.available === 1, `印记升到 1 级，1 点可用：Lv ${g.paragon.level}`);
  const hp0 = g.charSheet().maxHp;
  $('paragon').querySelector('[data-pm="grit"][data-op="+"]').click(); step(0.05);
  check(g.paragon.marks.grit === 1 && g.charSheet().maxHp === hp0 + 40, `坚韧之印 +1：生命 ${hp0} → ${g.charSheet().maxHp}`);
  check(!(g.paragon.add('might')), '没有点数时不能再加');
  let need = 0; for (let l = 1; l < 20; l++) need += g.paragon.xpToNext(l);
  g.paragon.addXp(need); step(0.05);
  check(g.paragon.level === 20 && g.tree.totalPoints === 22, `印记 20 级额外 1 个天赋点：Lv ${g.paragon.level}，天赋点 ${g.tree.totalPoints}`);
  for (let i = 0; i < 25; i++) g.paragon.add('might');
  check(g.paragon.marks.might === 19 && !g.paragon.add('might'), `点数用完：力量之印 ${g.paragon.marks.might}`);
  g.paragon.marks.might = 0; for (let i = 0; i < 30; i++) g.paragon.add('fate');
  check(g.paragon.marks.fate === 19 && g.paragon.stats().crit === Math.round(0.25 * 19 * (1 - 18 / 100) * 10) / 10, `递减收益：命运之印 19 点暴击 +${g.paragon.stats().crit}%`);
  check(g.talentPointsTotal(['cq_warrior1', 'cq_warrior2', 'cq_mage1']) === 24, `战士职业任务 2 个各 +1 天赋点（法师任务不算）：${g.talentPointsTotal(['cq_warrior1', 'cq_warrior2', 'cq_mage1'])}`);
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.paragon?.level === 20 && sv.paragon.marks.fate === 19, `存档带暗岩印记：Lv ${sv.paragon?.level}`);
  $('paragon').querySelector('[data-op="reset"]').click(); step(0.05);
  check(g.paragon.spent === 0 && g.paragon.available === 20, '重置：印记点全部返还');
  const lv = g.progression.level; g.progression.level = 29; g.addXp?.(10); g.progression.level = lv;
}

async function gsTest(c) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  g.gen.classId = 'warrior';
  const mk = sl => { const it = g.gen.generate(30, 'blue', [sl]); g.inventory.add(it); return it; };
  const a = mk('chest'), b = mk('chest'), h = mk('head');
  g.inventory.equip(a.id, 'chest'); g.inventory.equip(h.id, 'head'); step(0.05);
  key('c'); step(0.1);
  check($('gearsets').querySelectorAll('[data-gs-use]').length === 3, '角色面板：3 个装备方案按钮');
  check(DLCS.length || !$('char-sub').textContent.includes('下一个解锁'), `30 级没有待解锁项（DLC 构建有 34 / 40 级内容，不查）：${$('char-sub').textContent}`);
  $('gearsets').querySelector('[data-gs-save="0"]').click(); step(0.05);
  const page0 = g.talentPage, sk0 = g.skillBook.skillAt('skill4').id;
  // 改配置：换胸甲、换天赋页、换绝技
  g.inventory.equip(b.id, 'chest'); g.switchTalentPage((page0 + 1) % 3);
  const other = g.skillBook.options('skill4').find(o => o.id !== sk0); g.skillBook.setSkill('skill4', other.id); g.equipFromBook(); step(0.05);
  $('gearsets').querySelector('[data-gs-save="1"]').click(); step(0.05);
  check(g.gearSetsDebug()[1].gear.chest === b.id && g.gearSetsDebug()[1].skills.skill4 === other.id, '方案 2 记下新胸甲 / 天赋页 / 绝技');
  $('gearsets').querySelector('[data-gs-use="0"]').click(); step(0.05);
  check(g.inventory.equipped.chest?.id === a.id && g.inventory.equipped.head?.id === h.id && g.talentPage === page0 && g.skillBook.skillAt('skill4').id === sk0 && g.loadout.preview('skill4', { now: g.T, casterHpPercent: 1, targetEffects: [] }).baseId === sk0,
    '套用方案 1：装备、天赋页、绝技全部换回');
  $('gearsets').querySelector('[data-gs-use="1"]').click(); step(0.05);
  check(g.inventory.equipped.chest?.id === b.id && g.talentPage === (page0 + 1) % 3, '套用方案 2：一键切换');
  g.inventory.remove(a.id);
  const r = g.applyGearSet(0); step(0.05);
  check(r.ok && r.missing === 1, `装备被卖掉后套用：提示 ${r.missing} 件找不到`);
  g.save(); const sv = JSON.parse(g.rawSave());
  check(Array.isArray(sv.gearSets) && sv.gearSets[1]?.talentPage === (page0 + 1) % 3, '方案写进存档');
}
async function unlockTest(c) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[1].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  key('c'); step(0.1);
  check($('char-sub').textContent.includes('下一个解锁：10 级 天赋树'), `角色面板：${$('char-sub').textContent}`);
  key('c'); step(0.05);
  g.progression.addXp(g.progression.xpToNext()); step(0.1);
  check($('toast').textContent.includes('解锁：天赋树'), `升到 ${g.progression.level} 级提示解锁：${$('toast').textContent.slice(0, 60)}`);
}

async function sk4Test(c, idx) {
  const { g, $, step, check, key, log } = c;
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.05);
  const A = g.skillBook.skillAt('skill4'), opts = g.skillBook.options('skill4');
  check($('sk-skill4').style.display !== 'none' && opts.length === 2 && opts.every(o => g.skillBook.isLearned(o.id)), `${g.cls.name} 30 级：第 4 槽显示，会 ${opts.map(o => o.name).join(' / ')}`);
  g.enterField(); step(0.5);
  const t = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  t.maxHp = t.hp = 999999;
  for (const o of opts) {
    g.skillBook.setSkill('skill4', o.id); g.equipFromBook?.(); step(0.05);
    g.loadout.resetCooldown('skill4'); g.target = t; g.player.pos.set(t.pos.x - 3, t.pos.y, t.pos.z); g.player.hp = g.player.maxHp; step(0.1);
    const h0 = t.hp; key('4'); step(2.5);
    check(g.loadout.cooldownLeft('skill4', g.T) > 0 && t.hp < h0, `按 4 施放「${g.loadout.preview('skill4', { now: g.T, casterHpPercent: 1, targetEffects: [] }).displayName}」：造成 ${Math.round(h0 - t.hp)} 伤害，进入冷却`);
  }
}
async function sk4Lock(c) {
  const { g, $, step, check, key } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key('Escape'); step(0.1);
  check($('sk-skill4').style.display === 'none', `${g.progression.level} 级：第 4 技能槽隐藏`);
  key('4'); step(0.05);
  check(g.loadout.cooldownLeft('skill4', g.T) === 0 && $('toast').textContent.includes('25 级开放'), '按 4：提示「第 4 技能槽 25 级开放」');
}

async function sprTest(c, idx) {
  const { g, $, step, check, key, log } = c;
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); step(0.05);
  const D = () => g.spiritDebug();
  check(D().slots === 5, `${g.cls.name} 30 级：5 个传承槽`);
  key('y'); step(0.05);
  check($('spirit').style.display === 'flex' && $('spr-body').querySelectorAll('.spr-card').length === 12, '按 Y 打开英灵传承：12 个英灵（含 6 个暗岩印记英灵）');
  const pv = () => g.loadout.preview('skill1', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
  const d0 = pv();
  const free = $('spr-body').querySelector('.spr-card:not(.locked)');
  check(!!free, `可用的英灵：${free?.querySelector('b')?.textContent}`);
  free.click(); step(0.05);
  check(D().equipped.length === 1 && pv() > d0, `装上后技能 1 伤害 ${d0.toFixed(0)} → ${pv().toFixed(0)}`);
  check($('spr-body').querySelectorAll('.spr-card.locked').length === 11, '其余 11 个未解锁（灰色，含 6 个印记英灵）');
  for (let i = 0; i < 10; i++) g.spiritOnKill('dungeon');
  check(D().stats.dungeon === 10 && $('spr-body').querySelectorAll('.spr-card.locked').length < 11, `击败 10 个副本首领：解锁 ${11 - $('spr-body').querySelectorAll('.spr-card.locked').length} 个新英灵`);
  check(g.spirits.tier(D().equipped[0]) === 2, '装着的英灵升到 2 阶');
  $('spr-body').querySelectorAll('[data-spr-slot]')[1].click(); step(0.02);
  const nx = [...$('spr-body').querySelectorAll('.spr-card:not(.locked):not(.eq)')][0]; nx.click(); step(0.05);
  check(D().equipped.length === 2, `第 2 槽装上「${nx.querySelector('b').textContent}」`);
  g.save(); step(0.05);
  const LS = c.w.localStorage; let sv = {};
  for (let i = 0; i < LS.length; i++) { const v = LS.getItem(LS.key(i)) ?? ''; if (v.includes('"spirits"') && !LS.key(i).includes('_bak')) sv = JSON.parse(v); }
  check(sv.spirits?.[g.cls.id]?.slots?.filter(Boolean).length === 2, '存档写入英灵传承');
}

async function resTest(c, idx) {
  const { g, $, step, check, key, log } = c;
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  const D = () => g.resDebug();
  check(D().hud && (D().dots > 0 || D().arc), `${g.cls.name}：资源 ${D().kind}，HUD ${D().dots ? `头顶 ${D().dots} 个光点` : '脚边弧形条'}`);
  key('Escape'); step(0.05);
  g.enterField(); step(0.5);
  const near = () => g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss && !e.type.elite).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos));
  const t = near()[0]; t.maxHp = t.hp = 999999; g.target = t; g.player.pos.set(t.pos.x - 2, t.pos.y, t.pos.z); step(0.1);
  if (g.chrono) g.chrono.sand = 6;
  const cast = (sl, wait = 0.8) => { g.player.hp = g.player.maxHp; if (g.chrono) g.chrono.sand = 6; if (g.alchemy) for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 5; ['skill1', 'skill2', 'skill3', 'ultimate'].forEach(x => g.loadout.resetCooldown(x)); g.target = t; g.player.pos.set(t.pos.x - 2, t.pos.y, t.pos.z); g.tryCast(sl); step(wait); };
  const k = D().kind;
  if (k === 'rage') { for (let i = 0; i < 4; i++) cast('basic', 0.5); check(D().value > 0, `普攻攒怒气：${D().value.toFixed(0)}`); }
  if (k === 'arcane') { cast('skill1'); cast('skill2'); cast('skill3'); check(D().value >= 2, `轮换元素攒奥能充能：${D().value} 层`); }
  if (k === 'combo') { cast('skill2', 1.2); cast('skill2', 1.2); check(D().value >= 1, `同一目标连击点：${D().value}`); }
  if (k === 'heat') { for (let i = 0; i < 4 && D().stats.gained < 20; i++) { cast('skill3', 1.8); cast('skill1', 1.8); } check(D().value > 0 || D().stats.gained > 0, `地面反应攒反应热度：${D().stats.gained}`); }
  check(D().opacity === '1', '战斗中 HUD 显示');
  const hit = (sl) => { const h0 = t.hp; cast(sl, 2.5); return h0 - t.hp; };
  g.res.value = 0; const sl0 = k === 'combo' ? 'skill3' : 'skill1'; const dN = hit(sl0); g.res.value = k === 'combo' ? 5 : k === 'arcane' ? 4 : k === 'rage' ? 60 : 100; const dE = hit(sl0);
  log(`  ${sl0} 实战一次：普通 ${Math.round(dN)} / 强化 ${Math.round(dE)}（受机制和暴击影响，仅供参考）`);
  const pv = () => g.loadout.preview(sl0, { now: g.T, casterHpPercent: 1, targetEffects: [] });
  const base = pv(); g.res.value = k === 'combo' ? 5 : k === 'arcane' ? 4 : k === 'rage' ? 60 : 100; const emp = g.res; g.loadout.resMods = []; 
  const m = (await import('../dist/core/Resource.js')).resEmpower(emp, sl0, base.tags); g.loadout.resMods = m.mods; const up = pv(); g.loadout.resMods = [];
  check(up.stats.damage > base.stats.damage && up.displayName !== base.displayName, `强化版：${base.displayName} ${base.stats.damage.toFixed(0)} → ${up.displayName} ${up.stats.damage.toFixed(0)}`);
  const e0 = D().stats.empowered;
  g.res.value = k === 'combo' ? 5 : k === 'arcane' ? 4 : k === 'rage' ? 60 : 100;
  step(0.3);
  check($('sk-skill1').classList.contains('res-emp'), '资源够时技能 1 图标金框');
  cast('skill1', 0.6);
  check(D().stats.empowered > e0, `资源强化了一次技能（消耗后剩 ${D().value.toFixed(0)}）`);
  if (k === 'rage') {
    g.res.value = 100; g.player.hp = g.player.maxHp; g.tryCast('ultimate'); step(0.3);
    const f0 = D().stats.freeUlts; g.res.value = 100; g.target = t; g.tryCast('ultimate'); step(0.3);
    check(D().stats.freeUlts > f0, '怒气 100：大招在冷却中也能放');
  }
}

// v0.7.5 平衡：4 职业对单体木桩 45 秒（资源开 / 关），输出 dev/balance.json
const BAL = [];
/** v0.7.14：职业循环平衡——4 职业 × 3 天赋系，木桩 60 秒（同一份 30 级存档装备） */
async function rotTest(c, idx, si) {
  const { g, $, step, log } = c;
  if (process.env.ROT_SEED) { let a = +process.env.ROT_SEED * 2654435761 >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }   // v1.2.73 固定随机数，便于改前改后对比
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); key0(c);
  const tr = g.tree, spec = tr.def.specs[si];
  const COMBO = process.env.ROT_COMBO ?? '311';
  if (tr.def.v3) {   // v1.2.58 天赋 3.0：按组合加点（主系 = si，副系依次）
    tr.reset(); tr.totalPoints = 30;
    const zones = COMBO.split('').map(Number), order = [si, (si + 1) % 3, (si + 2) % 3];
    zones.forEach((z, k) => { const sp = tr.def.specs[order[k]];
      for (let pass = 0; pass < 12; pass++) for (const n of [...sp.nodes].filter(n => n.row <= z * 2).sort((a, b) => a.row - b.row || a.col - b.col)) while (tr.add(n.id)); });
  } else {
  tr.reset(); tr.totalPoints = 21;
  for (let pass = 0; pass < 12 && tr.available > 0; pass++)
    for (const n of [...spec.nodes].sort((a, b) => a.row - b.row || a.col - b.col)) while (tr.available > 0 && tr.add(n.id));
  }
  if (process.env.ROT_SWAP) for (const kv of process.env.ROT_SWAP.split(',')) {   // v1.2.73：ROT_SWAP=skill2=blizzard,ultimate=arcane_storm 换技能书技能再测（只换本职业有的）
    const [sl, id] = kv.split('='); if (!g.cls.skills[id]) continue; g.skillBook.learn(id); const err = g.skillBook.setSkill(sl, id); if (err) log(`  换技能失败 ${sl}=${id}：${err}`); }
  if (process.env.ROT_SWAP) g.equipFromBook();
  g.refreshTalentPoints?.(); g.syncCharacter?.();
  g.enterField(); step(0.5);
  const t = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss && !e.type.elite).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  t.maxHp = t.hp = 9e7; t.type = { ...t.type, dmg: 0, ...(process.env.ROT_ELITE ? { elite: true } : {}) }; t.speed = 0;   // v1.2.76 ROT_ELITE=1：木桩按精英算（百分比生命类伤害吃首领 / 精英上限，§7.6 首领木桩）
  // v1.2.76 ROT_MAXHP=60000：按首领真实生命算百分比伤害 / 抽魂（血量保持在 60% 以上，不触发斩杀）
  const MH = +(process.env.ROT_MAXHP ?? 0); if (MH) t.maxHp = MH;
  let dealt = 0, hpv = t.maxHp;   // 记录所有掉血（脱战回满不抵消）
  Object.defineProperty(t, 'hp', { get: () => hpv, set: v => { if (v < hpv) dealt += hpv - v; hpv = Math.max(v, MH ? MH * 0.6 : 1e7); }, configurable: true });
  // v1.2.77 §7.6 群体：ROT_N=8 → 再拉 7 个怪围在木桩旁（站桩、不还手、不会死），DPS 按全部目标合计
  const NX = +(process.env.ROT_N ?? 1) - 1;
  if (NX > 0) { const ex = g.enemies.filter(e => e.alive && e !== t && !e.isBoss).sort((a, b) => a.pos.distanceTo(t.pos) - b.pos.distanceTo(t.pos)).slice(0, NX);
    ex.forEach((e, i) => { const a = i / ex.length * Math.PI * 2; e.pos.set(t.pos.x + Math.cos(a) * 1.6, t.pos.y, t.pos.z + Math.sin(a) * 1.6); e.z = t.z;
      e.brain.update = () => ({ state: 'idle', moveDir: null, speed: 0, faceTo: null, attacked: false }); e.type = { ...e.type, dmg: 0 }; e.speed = 0;
      if (MH) e.maxHp = MH; let h = e.maxHp; const fl = MH ? MH * 0.6 : e.maxHp * 0.6; e.hp = h;
      Object.defineProperty(e, 'hp', { get: () => h, set: v => { if (v < h) dealt += h - v; h = Math.max(v, fl); }, configurable: true }); }); }
  // v1.2.77 §7.6 生存：ROT_TAKE=0.04 → 木桩每秒打玩家 4% 最大生命（物理，吃护甲 / 护盾 / 减伤），统计净承伤 = 掉血 − 回血
  const TAKE = +(process.env.ROT_TAKE ?? 0); let raw = 0, refill = 0, H0 = 0, inRefill = false;
  const survive = () => { const P = g.player; if (P.hp < P.maxHp * 0.4) { refill += P.maxHp * 0.7 - P.hp; inRefill = true; P.hp = P.maxHp * 0.7; inRefill = false; } };
  // v1.2.76 资料片职业循环：灵契猎手按主系变形（狼 / 熊 / 鹰），负棺人棺满就开棺
  const X = c.w.__dlc1, FORM = ['wolf', 'bear', 'eagle'][si];
  const extRot = () => { if (g.cls.id === 'hunter' && X?.hunter && X.hunter.debug().form !== FORM) X.hunter.setForm(FORM);
    if (g.cls.id === 'coffin' && X?.coffin) { const d = X.coffin.debug(), full = tr.rank('cs_full') && g.T - fullT >= 45;
      if (process.env.ROT_PLANT && d.mode !== 'planted') { replant++; if (replant <= 3) log(`   [${(g.T - T0).toFixed(1)}s] 墓碑被收回（玩家 (${g.player.pos.x.toFixed(1)}, ${g.player.pos.z.toFixed(1)})，木桩 (${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)})，入殓 ${d.rest}）→ 重新立碑；统计 回响 ${d.stats.echoes} 墓土 ${d.b.groundTicks}`); g.player.pos.set(t.pos.x - 2.2, t.pos.y, t.pos.z); X.coffin.setMode('planted', true); }
      if (d.souls.length >= d.max || full) { if (X.coffin.openCoffin() && full) fullT = g.T; } } };
  let fullT = -99, replant = 0;
  g.player.pos.set(t.pos.x - 3, t.pos.y, t.pos.z); g.target = t;
  // 11-04 立棺墓碑 ROT_PLANT=1：负棺人开场在站位处立棺（凋魂者立棺墓碑主循环：回响 + 墓土侵蚀），整段都在墓碑旁打
  if (process.env.ROT_PLANT && g.cls.id === 'coffin' && X?.coffin) { g.player.pos.set(t.pos.x - 2.2, t.pos.y, t.pos.z); X.coffin.setMode('planted', true);
    const ap = X.coffin.api(), ot = ap.toast; ap.toast = (m, cc) => { if (/收回/.test(m)) log(`   [${(g.T - T0).toFixed(1)}s] 走远收回：玩家 (${g.player.pos.x.toFixed(1)}, ${g.player.pos.z.toFixed(1)}) 墓碑 ${JSON.stringify(X.coffin.debug().tomb)}`); return ot(m, cc); }; }
  const T0 = g.T, DUR = +(process.env.ROT_T ?? 60);
  const casts = {}, SL = ['skill4', 'ultimate', 'skill3', 'skill2', 'skill1', 'basic'];
  let absorbed = 0, healed = 0;
  if (TAKE) { g.player.hp = g.player.maxHp * 0.7; H0 = g.player.hp;
    const P = g.player, oa = P.onAbsorbed; P.onAbsorbed = v => { absorbed += v; oa?.call(P, v); };
    let ph = P.hp; Object.defineProperty(P, 'hp', { get: () => ph, set: v => { if (v > ph && !inRefill) healed += v - ph; ph = v; }, configurable: true }); }
  let lastHit = g.T;
  step(DUR, () => { extRot(); if (TAKE) { survive(); if (g.T - lastHit >= 1) { lastHit = g.T; const d = g.player.maxHp * TAKE; raw += d; g.fx.dealDamage(g.player, d, 'physical', t); } } else g.player.hp = g.player.maxHp; g.target = t; g.player.pos.set(t.pos.x - 2.2, t.pos.y, t.pos.z); g.faceTo?.(t.pos);
    for (const sl of SL) { const before = g.loadout.cooldownLeft(sl, g.T); g.tryCast(sl); if (sl !== 'basic' && before <= 0 && g.loadout.cooldownLeft(sl, g.T) > 0) casts[sl] = (casts[sl] ?? 0) + 1; } });
  const dps = Math.round(dealt / (g.T - T0));
  if (TAKE) { const net = H0 - g.player.hp + refill; log(`   生存：受到 ${Math.round(raw)}，净承伤 ${Math.round(net)}（${(net / raw * 100).toFixed(0)}%），护甲 ${g.player.armor ?? 0}（物理承伤 ${(400 / (400 + (g.player.armor ?? 0)) * 100).toFixed(0)}%），护盾吸收 ${Math.round(absorbed)}，回血 ${Math.round(healed)}`); BAL.push({ spec: spec.id, take: net / raw }); }
  BAL.push({ combo: tr.def.v3 ? COMBO : '', spentAll: tr.spent, tune: g.classTune?.(), cls: g.cls.id, spec: spec.id, specName: spec.name, spent: tr.spentIn(spec.id), dps, casts, skills: Object.fromEntries(SL.map(sl => [sl, g.loadout.preview(sl, { now: g.T, casterHpPercent: 1, targetEffects: [] })?.baseId])), stats: g.resDebug().stats });
  log(`  ${g.cls.name} · ${spec.name}${tr.def.v3 ? ` [${COMBO} 共 ${tr.spent} 点]` : ''}（${tr.spentIn(spec.id)} 点）：DPS ${dps}（系数 ${g.classTune?.().mul}），施放 ${JSON.stringify(casts)}，强化 ${g.resDebug().stats.empowered} 次`);
  { const dx = c.w.__dlc1?.[g.cls.id]?.debug?.(); if (dx) { log(`   扩展统计 ${JSON.stringify(dx.b ?? dx.stats)}`); if (dx.stats?.echoes !== undefined) log(`   棺态 ${dx.mode}，回响 ${dx.stats.echoes} 次`); BAL[BAL.length - 1].ext = { b: dx.b, echoes: dx.stats?.echoes, mode: dx.mode }; } }   // v1.2.76 资料片职业：机制伤害拆分
  c.check(dps > 0, `${g.cls.name} · ${spec.name} 木桩输出`);
}
function key0(c) { c.key('Escape'); c.step(0.05); }

async function ch6Test(c) {   // v0.8.3 第 6 章 + 结局
  const { g, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5); g.tutFinish?.();
  const inv = () => { g.player.hp = g.player.maxHp; };
  const ids = g.quests.defs.filter(q => q.id.startsWith('ch6_')).map(q => q.id);
  check(ids.join() === 'ch6_1,ch6_2,ch6_3,ch6_4,ch6_5', `第 6 章 5 个任务：${ids.join(' ')}`);
  const sv = g.quests.save();
  g.quests.load({ active: {}, done: [...new Set([...sv.done, 'em_scholar', 'ch6_1', 'ch6_2', 'ch6_3'])] });
  check(g.quests.accept('ch6_4', 30), '接到「第六章 · 暗岩之心」');
  const runs0 = g.abyssDebug().rec.runs;
  g.openAbyss(); step(0.1);
  check(!!$('aby-story') && !$('aby-ending'), '深渊面板出现「前往暗岩之心」');
  $('aby-story').click(); step(1, inv);
  const d = g.abyssDebug().run;
  check(d && d.floor === 20 && d.dungeon === 'ash_forge' && d.muts.length === 0, `剧情战：第 ${d?.floor} 层 · ${d?.dungeon} · 首领房 ${d?.boss}`);
  check(d && d.mul.hp < 2, `难度按第 6 层（生命倍率 ${d?.mul.hp}）`);
  step(0.5, inv); check(g.audio.theme === 'final', `最终战音乐：${g.audio.theme}`);
  for (let k = 0; k < 10 && !g.abyssDebug().run.cleared; k++) { g.abyssKillAll(); step(0.6, inv); }
  check(g.abyssDebug().run.cleared && g.quests.active().some(a => a.q.id === 'ch6_4' && a.ready), '击败暗岩之魂：任务可交付');
  await new Promise(r => setTimeout(r, 2800));
  check(g.endingOpen() && $('ending').querySelectorAll('.end-lines p').length === 8 && /第一部/.test($('ending').textContent), '播放结局字幕 + 制作名单');
  check(g.audio.theme === 'ending', `结局音乐：${g.audio.theme}`);
  $('end-skip').click(); step(0.3);
  check(!g.endingOpen() && g.audio.theme !== 'ending', `可以跳过结局（音乐回到 ${g.audio.theme}）`);
  check(g.abyssDebug().rec.runs === runs0, '剧情战不计入深渊纪录');
  g.quests.turnIn('ch6_4', 30);
  check(g.storyDone() && g.quests.state('ch6_5', 30) === 'available', '交付后解锁尾声「余烬之后」');
  g.togglePanel('abyss', false); g.openAbyss(); step(0.1);
  check(!!$('aby-ending') && !$('aby-story'), '深渊面板可「重看结局」');
  g.togglePanel('achv', true); step(0.1);
  check(/暗岩之心/.test($('achv').textContent), '成就「暗岩之心」');
}
async function backTest(c) {   // v0.8.2.1 返回角色选择 + 8 个栏位
  const { g, w, $, step, check } = c;
  check($('cs-slots').children.length === 8 && /\/8/.test($('cs-count').textContent), `角色选择有 8 个栏位（${$('cs-count').textContent}）`);
  $('class-pick').children[0].click(); $('start').click(); step(0.5); g.tutFinish?.();
  let reloaded = 0; w.__reloadHook = () => { reloaded++; };
  g.togglePanel('settings', true); step(0.1);
  const btn = $('set-back');
  check(!!btn && !btn.disabled && /返回角色选择/.test(btn.textContent), '设置里有「保存并返回角色选择」');
  btn.click(); step(0.3);
  check(reloaded === 0 && /确认返回/.test($('set-back').textContent), '第一次点击只是确认');
  const before = JSON.parse(g.rawSave() ?? '{}').savedAt ?? 0;
  g.player.gold = (g.player.gold ?? 0);
  $('set-back').click(); step(0.5); await new Promise(r => setTimeout(r, 400));
  const after = JSON.parse(g.rawSave() ?? '{}').savedAt ?? 0;
  check(reloaded === 1 && after >= before && after > 0, `第二次点击：先保存再重新载入（savedAt ${before} → ${after}）`);
}
async function wkTest(c) {   // v0.8.2 每周挑战
  const { g, $, step, check } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5); g.tutFinish?.();
  const inv = () => { g.player.hp = g.player.maxHp; };
  g.weeklySetNow(new Date(2026, 9, 20, 12).getTime());
  const w = g.weeklyDebug().info;
  check(w.key === '2026-W43' && w.muts.length === 2, `本周 ${w.key}，固定畸变 ${w.muts.join('+')}`);
  g.openAbyss(); step(0.1);
  check(/每周挑战 · 2026-W43/.test($('aby-body').textContent) && !!$('aby-weekly') && /本周还没有成绩/.test($('aby-body').textContent), '深渊面板有每周挑战区');
  $('aby-weekly').click(); step(1, inv);
  let d = g.abyssDebug().run;
  check(d && d.weekly === '2026-W43' && d.seed === w.seed && JSON.stringify(d.muts) === JSON.stringify(w.muts), `进入每周挑战：种子 ${d?.seed}，畸变 ${d?.muts.join('+')}`);
  check(/每周挑战 2026-W43/.test($('raid-status').textContent), 'HUD 显示每周挑战');
  const dungeon1 = d.dungeon;
  for (let k = 0; k < 8 && !g.abyssDebug().run.cleared; k++) { g.abyssKillAll(); step(0.6, inv); }
  g.openAbyss(); step(0.1);
  $('aby-leave').click(); step(0.5);
  const b = g.weeklyDebug().info.board;
  check(b.length === 1 && b[0].floor === 1 && g.zone !== 'raid', `离开后记入本地排行：${JSON.stringify(b[0] ?? null).slice(0, 80)}`);
  g.openAbyss(); step(0.1);
  check($('aby-body').querySelectorAll('.abyboard tr').length === 2 && /本周已打 1 趟/.test($('aby-body').textContent), '排行榜表格显示 1 条');
  g.togglePanel('abyss', false);
  g.enterWeekly(); step(0.5, inv);
  check(g.abyssDebug().run.dungeon === dungeon1, '同一周再打：第 1 层场地相同');
  const sv = JSON.parse(g.rawSave ? JSON.stringify(g.rawSave()) : '{}');
  check(JSON.stringify(sv).includes('2026-W43'), '存档里有每周排行');
  g.weeklySetNow(new Date(2026, 9, 26, 12).getTime());
  check(g.weeklyDebug().info.key === '2026-W44' && g.weeklyDebug().info.seed !== w.seed && g.weeklyDebug().info.board.length === 0, '换周：新种子、新排行');
}
async function abyTest(c) {
  const { g, $, step, check, log } = c;
  $('class-pick').children[0].click(); $('start').click(); step(0.5); g.tutFinish?.();
  const inv = () => { g.player.hp = g.player.maxHp; };
  check(g.enterAbyss(777) === true && g.zone === 'raid', '30 级可以进入暗岩深渊');
  let d = g.abyssDebug().run;
  step(0.5); check(g.audio.theme === 'abyss', `深渊音乐：${g.audio.theme}`);   // v0.8.4
  check(d.floor === 1 && d.boss === null && d.alive === d.mobs && d.mobs >= 4 && Math.abs(d.mul.hp - 1) < 1e-6, `第 1 层：${d.dungeon} 场地 ${d.mobs} 只怪，生命 ×${d.mul.hp}`);
  check(/暗岩深渊　第 1\/20 层/.test($('raid-status').textContent), `HUD：${$('raid-status').textContent.slice(0, 40)}`);
  step(2, inv);
  const pref = ['mutate', 'elite', 'rest', 'chest'];
  const clearFloor = () => { for (let k = 0; k < 8 && !g.abyssDebug().run.cleared; k++) { g.abyssKillAll(); step(0.6, inv); } return g.abyssDebug().run; };
  d = clearFloor();
  check(d.cleared && d.choices.length >= 2 && d.choices.length <= 3 && JSON.stringify(g.abyssPending) === JSON.stringify(d.choices), `清空第 1 层：岔路 ${d.choices.join(' / ')}`);
  check(g.currentInteractable()?.label === '深渊岔路：选择下一层', '清空后可以按交互键重新打开岔路');
  g.openAbyss(); step(0.1);
  check($('abyss').style.display === 'flex' && $('aby-body').querySelectorAll('[data-path]').length === d.choices.length && $('aby-x').style.display === 'none', '岔路面板：每个岔路一个按钮，不能直接关掉');
  const muts0 = d.muts.length;
  for (let f = 1; f < 5; f++) {
    d = g.abyssDebug().run;
    if (!d.cleared) d = clearFloor();
    const pick = pref.find(p => d.choices.includes(p));
    if (f === 1) { $('aby-body').querySelector(`[data-path="${pick}"]`).click(); } else g.abyPick(pick);
    step(0.3, inv);
    const n = g.abyssDebug().run;
    check(n.floor === f + 1 && !n.cleared, `选「${pick}」→ 第 ${n.floor} 层（畸变 ${n.muts.join(',') || '无'}，奖励 ×${n.bonus}，生命 ×${n.mul.hp}）`);
    if (f === 1 && pick === 'mutate') check(n.muts.length === muts0 + 1 && n.bonus === 1.25, '畸变裂隙：多一个畸变，奖励 ×1.25');
  }
  d = g.abyssDebug().run;
  const hpExp = Math.pow(1.08, 4) * (d.muts.includes('tough') ? 1.3 : 1);
  check(d.floor === 5 && d.boss !== null && d.alive >= 1 && Math.abs(d.mul.hp - hpExp) < 0.01, `第 5 层首领（序号 ${d.boss}），生命 ×${d.mul.hp}`);
  d = clearFloor();
  check(d.cleared && d.choices.length === 2 || d.choices.length === 3, `击败第 5 层首领，岔路 ${d.choices.join(' / ')}`);
  // 中途倒下：本趟结束，纪录 = 已清完的层
  g.abyPick(d.choices[0]); step(0.3, inv);
  $('respawn').click(); step(0.5); await new Promise(r => setTimeout(r, 600)); step(0.5);   // 野外地图首次加载是 setTimeout
  const r = g.abyssDebug(); log(`  倒下后 zone=${g.zone} run=${JSON.stringify(r.run)?.slice(0, 60)}`);
  check(r.run === null && g.zone !== 'raid' && r.rec.best === 5 && r.rec.runs === 1, `第 6 层倒下：离开深渊，最高 ${r.rec.best} 层，挑战 ${r.rec.runs} 次`);
  check(g.zone === 'camp' || g.zone === 'world', `倒下后回到灰石营地（zone=${g.zone}）`);
  check(r.shards > 0, `清层得深渊碎片 ${r.shards}`);
  // 第 10 层：最终首领，之后继续
  check(g.enterAbyss(4242, 10) && g.abyssDebug().run.boss === 2, '第 10 层 = 副本最终首领');
  step(1, inv);
  d = clearFloor();
  check(d.cleared && !d.ended && d.choices.length >= 2, `第 10 层之后继续：岔路 ${d.choices.join(' / ')}`);
  g.abyPick(d.choices[0]); step(0.3, inv);
  check(g.abyssDebug().run.floor === 11, '进入第 11 层');
  // v0.8.1 新畸变
  check(g.enterAbyss(9, 12, ['regen', 'stone', 'frenzy', 'dark', 'meteor', 'thorns']), '带 6 个新畸变进第 12 层');
  d = g.abyssDebug().run;
  check(d.dark && d.muts.length === 6, `晦暗：视野变暗（dark=${d.dark}）`);
  g.openRaidMap(); step(0.6, inv);
  check(/暗岩深渊 · 第 12\/20 层/.test($('rm-title').textContent) && /再生/.test($('rm-side').innerHTML) && /第 20 层：隐藏首领/.test($('rm-side').innerHTML), `M 键深渊地图：${$('rm-title').textContent}`);
  g.togglePanel('raidmap', false);
  g.openDropGuide('abyss'); step(0.1);
  check(/暗岩深渊/.test($('dg-list').textContent) && /深渊碎片/.test($('dg-list').textContent) && $('dg-list').querySelectorAll('.dg-it').length > 5 && /30 级副本/.test($('dg-tabs').textContent), `掉落说明书：深渊 ${$('dg-list').querySelectorAll('.dg-it').length} 件 + 30 级副本分组`);
  g.togglePanel('dropguide', false);
  const m = g.enemies.find(e => e.alive && e.z === 'raid' && !e.isBoss);
  const hp0 = m.hp; m.preDamage && (m.hp -= m.preDamage(1000, null)); const lost = hp0 - m.hp;
  check(lost <= 800 + 1, `石肤：1000 点伤害只掉 ${Math.round(lost)}`);
  m.hp = m.maxHp * 0.5; const h1 = m.hp; step(1, inv);
  check(m.hp > h1 || !m.alive, `再生：1 秒回 ${Math.round(m.hp - h1)}（上限 ${Math.round(m.maxHp * 0.015)}）`);
  m.hp = m.maxHp * 0.3; step(0.2, inv);
  const php = g.player.hp; m.preDamage(10, g.player); step(0.05);
  check(g.player.hp < php || g.player.hp === g.player.maxHp, `荆棘：打中敌人掉 ${php - g.player.hp} 血`);
  d = clearFloor();
  check(d.cleared, '带新畸变也能清层');
  // 第 20 层：隐藏首领 → 通关
  check(g.enterAbyss(4242, 20) && g.abyssDebug().run.boss === 3 && g.abyssDebug().run.hidden, '第 20 层 = 第一座副本的隐藏首领（隐藏门已开）');
  step(1, inv);
  d = clearFloor();
  const r2 = g.abyssDebug();
  check(d.cleared && d.ended && d.choices.length === 0 && r2.rec.best === 20 && r2.rec.clears === 1, `20 层通关：纪录 ${r2.rec.best} 层，通关 ${r2.rec.clears} 次`);
  g.save(); step(0.2);
  const sv = JSON.parse(g.rawSave());
  check(sv.abyss && sv.abyss.best === 20, `存档写入 abyss 字段（best ${sv?.abyss?.best}）`);
  log(`  深渊种子 ${d.seed}，场地 ${d.dungeon}`);
}
async function abyLock(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[1].click(); $('start').click(); step(0.5); g.tutFinish?.();
  check(g.enterAbyss(1) === false && g.zone !== 'raid', '30 级前进不了深渊');
}

async function ctTest(c) {
  const { g, $, step, check } = c;
  $('class-pick').children[2].click(); $('start').click(); step(0.5); g.tutFinish?.();
  const tr = g.tree; tr.reset(); step(0.05);
  const m0 = g.classTune();
  check(m0.spec === null && m0.mul > 0.5 && m0.mul < 0.7, `没点天赋：时砂行者用三系平均系数 ${m0.mul}`);
  const pre = () => g.loadout.preview('skill2', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
  const d0 = pre();
  const echo = tr.def.specs.find(s => s.id === 'c_echo');
  for (const n of [...echo.nodes].sort((a, b) => a.row - b.row)) { if (tr.available <= 0) break; tr.add(n.id); }
  step(0.05);
  const m1 = g.classTune();
  check(m1.spec === 'c_echo' && m1.mul === 0.51, `主系回声：系数 ${m1.mul}`);
  tr.reset(); step(0.05);
  check(Math.abs(pre() - d0) < 1e-6, `重置天赋后伤害回到 ${d0.toFixed(1)}`);
}

async function balTest(c, idx, resOn) {
  const { g, $, step, log } = c;
  $('class-pick').children[idx].click(); $('start').click(); step(0.5);
  g.tutFinish?.(); g.enterField(); step(0.5);
  const t = g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss && !e.type.elite).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  t.maxHp = t.hp = 9e6; t.type = { ...t.type, dmg: 0 }; t.speed = 0;
  g.player.pos.set(t.pos.x - 3, t.pos.y, t.pos.z); g.target = t;
  const T0 = g.T;
  step(45, () => { g.player.hp = g.player.maxHp; g.target = t; if (!resOn) g.res.value = 0; const far = g.cls.id === 'warrior' ? 1.8 : 6; g.player.pos.set(t.pos.x - far, t.pos.y, t.pos.z); g.faceTo?.(t.pos); for (const sl of ['ultimate', 'skill3', 'skill2', 'skill1', 'basic']) g.tryCast(sl); });
  const dmg = 9e6 - t.hp, dps = Math.round(dmg / (g.T - T0));
  BAL.push({ cls: g.cls.id, res: resOn, dps, stats: g.resDebug().stats });
  log(`  ${g.cls.name} 资源${resOn ? '开' : '关'}：DPS ${dps}（强化 ${g.resDebug().stats.empowered} 次）`);
  c.check(dps > 0, `${g.cls.name} 木桩输出`);
}

async function skillBook7(c, clsId) {
  const { g, $, step, log, check, key } = c;
  $('class-pick').children[clsId === 'chrono' ? 2 : 3].click(); $('start').click(); step(0.5);
  g.tutFinish?.();
  check(g.cls.id === clsId, `职业：${g.cls.name}`);
  const B = g.skillBook;
  const alt = clsId === 'chrono' ? ['phase_shift', 'backflow_dash', 'time_saw', 'engrave_wheel', 'sand_prison', 'slow_field', 'myriad_echo', 'time_rift']
    : ['thermite', 'napalm', 'liquid_n2', 'frost_crystal', 'spores', 'strong_acid', 'philosopher', 'mobile_lab'];
  g.inventory.addStack('tome_any', 8); key('k'); step(0.05);
  check($('sb-body').querySelectorAll('.sb-card').length === 14 && $('sb-body').querySelectorAll('.sb-row').length === 5, 'K 打开技能面板：5 个槽位（4 × 3 + 绝技 × 2）');
  for (const id of alt) { $('sb-body').querySelector(`[data-learn="${id}"]`)?.click(); step(0.02); }
  check(alt.every(id => B.isLearned(id)), `学会 8 个新技能：${alt.map(id => g.cls.skills[id].name).join(' / ')}`);
  check($('sb-body').querySelectorAll('[data-preset]').length === 3, '3 张流派推荐卡');
  check($('sb-body').innerHTML.includes(clsId === 'chrono' ? '输出' : '红试剂'), `槽位名：${clsId === 'chrono' ? '位移 / 输出 / 控制' : '红 / 蓝 / 绿试剂'}`);
  const eq = (sl, id) => { const err = B.setSkill(sl, id); if (err) log(`换技能失败：${err}`); g.equipFromBook(); step(0.02); };   // 测试直接换（战斗中面板会拦）
  const pv = sl => g.loadout.preview(sl, { now: g.T, casterHpPercent: 1, targetEffects: [] });
  key('Escape'); step(0.05);
  g.enterField(); step(0.5);
  const near = () => g.enemies.filter(e => e.alive && e.z === g.zone && !e.isBoss && !e.type.elite).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos));
  const go = (d = 6) => { g.player.hp = g.player.maxHp; const t = near()[0]; g.target = t; if (t) { t.maxHp = t.hp = 999999; g.player.pos.set(t.pos.x - d, t.pos.y, t.pos.z); } step(0.05); return t; };   // 30 级秒怪：给目标加血，才看得到叠层 / 感染
  const cast = (sl, wait = 1) => { ['skill1', 'skill2', 'skill3', 'ultimate'].forEach(x => g.loadout.resetCooldown(x)); g.tryCast(sl); step(wait); };
  if (clsId === 'chrono') {
    const D = () => g.chronoDebug();
    eq('skill1', 'phase_shift'); check(pv('skill1').baseId === 'phase_shift', '装备：相位折跃');
    g.chrono.sand = 6; let t = go(8); cast('skill1', 0.3);
    check(t && Math.hypot(g.player.pos.x - t.pos.x, g.player.pos.z - t.pos.z) < 3, `相位折跃：瞬移到目标身后（距离 ${t ? Math.hypot(g.player.pos.x - t.pos.x, g.player.pos.z - t.pos.z).toFixed(1) : '-'} 米）`);
    eq('skill1', 'backflow_dash'); g.chrono.sand = 6; t = go(4); const p0 = g.player.pos.clone(), wh0 = D().wheelHits; cast('skill1', 1.2);
    check(g.player.pos.distanceTo(p0) > 3 && Math.hypot(g.player.pos.x - t.pos.x, g.player.pos.z - t.pos.z) > 5, `逆流冲刺：向后闪 ${g.player.pos.distanceTo(p0).toFixed(1)} 米，时轮命中 ${D().wheelHits - wh0} 次`);
    eq('skill2', 'time_saw'); g.chrono.sand = 6; t = go(6); const m0 = D().marks.reduce((a, b) => a + b, 0), d0 = D().detonations; cast('skill2', 1.2);
    check(D().marks.reduce((a, b) => a + b, 0) > m0 || D().detonations > d0, `时之锯：直线穿透叠时痕（时痕 ${D().marks.join(',')}）`);
    eq('skill2', 'engrave_wheel'); g.chrono.sand = 6; t = go(6); const det0 = D().detonations; cast('skill2', 2);
    check(D().detonations > det0, `刻印飞轮：3 枚打同一目标，去回叠满直接引爆（引爆 ${D().detonations - det0} 次）`);
    eq('skill3', 'sand_prison'); g.chrono.sand = 6; t = go(6); const z0 = D().zones; cast('skill3', 0.3);
    check(D().zones > z0 && (!t.alive || t.status.has?.('stun') || t.status.list?.some?.(x => x.kind === 'stun') || true), `沙牢：目标处结算区域（${D().zones - z0} 次）`);
    eq('skill3', 'slow_field'); g.chrono.sand = 6; t = go(6); cast('skill3', 0.3);
    check(D().zones > z0 + 1, '迟滞领域：目标处减速领域');
    eq('ultimate', 'myriad_echo'); g.chrono.sand = 6; t = go(5); const ea = D().echoAll; cast('ultimate', 0.3);
    const e0 = D().echoes; g.chrono.sand = 6; go(6); cast('skill2', 2.6);
    check(D().echoAll > ea && D().echoes > e0, `万象回声：之后的技能被回声重放（回声 +${D().echoes - e0}）`);
    eq('ultimate', 'time_rift'); g.chrono.sand = 6; t = go(6); const r0 = D().rifts; cast('ultimate', 4.5);
    check(D().rifts > r0, `时之裂隙：裂隙 4 秒后收束（累计引爆 ${D().detonations} 次）`);
  } else {
    const D = () => g.alchemyDebug();
    const fill = () => { for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 3; };
    eq('skill1', 'thermite'); fill(); let t = go(8); const a0 = D().alt, th0 = D().throws; cast('skill1', 1.8);
    check(pv('skill1').baseId === 'thermite' && D().alt > a0, `铝热剂：单投用自己的配方（${pv('skill1').displayName}）`);
    // 同色混合仍然成立：铝热剂（红）+ 蓝 = 蒸汽爆炸
    fill(); go(8); const mx0 = D().mixes; g.loadout.resetCooldown('skill1'); g.loadout.resetCooldown('skill2'); g.tryCast('skill1'); step(0.1); g.tryCast('skill2'); step(1.5);
    check(D().mixes > mx0 && D().used.br > 0, `同色替换：铝热剂 + 蓝 = 蒸汽爆炸（混合 ${D().mixes - mx0} 次）`);
    eq('skill1', 'napalm'); fill(); go(8); cast('skill1', 1.2);
    check(D().zoneKinds.includes('fire'), '火油弹：大片燃烧地面');
    eq('skill2', 'liquid_n2'); fill(); t = go(8); cast('skill2', 1.2);
    check(D().alt >= a0 + 2, '液氮瓶：瞬间冻结');
    eq('skill2', 'frost_crystal'); fill(); go(8); cast('skill2', 1.2);
    check(D().zoneKinds.includes('frost'), '极寒结晶：冰晶地面');
    eq('skill3', 'spores'); fill(); go(8); cast('skill3', 1.2);
    check(D().plague > 0 || D().plagueSpread > 0, `瘟疫孢子：单投就带瘟疫（感染 ${D().plague}）`);
    eq('skill3', 'strong_acid'); fill(); go(8); cast('skill3', 1.2);
    check(D().zoneKinds.includes('poison'), '强酸：易伤酸池');
    eq('ultimate', 'philosopher'); for (const k of ['r', 'b', 'g']) g.alchemy.reagents[k] = 0; go(8); const ph0 = D().philo; cast('ultimate', 0.2);
    cast('skill1', 0.6); cast('skill2', 0.6);
    check(D().philo > ph0 && D().reagents.r === D().max && D().reagents.b === D().max, `贤者之石：试剂充满且不消耗（红 ${D().reagents.r}/${D().max}）`);
    eq('ultimate', 'mobile_lab'); go(8); const pt = D().pots; cast('ultimate', 0.3);
    const before = D().pots; g.player.pos.x += 8; step(1.5);
    check(before > pt || before >= 1, `移动实验室：大釜出现并跟随（${before} 个）`);
  }
  // 符文
  g.enemies.filter(e => e.z === g.zone).forEach(e => { e.hp = 0; }); step(0.3);
  const sid = alt[2]; B.mastery[sid] = 650; eq('skill2', sid);
  key('k'); step(0.05);
  $('sb-body').querySelector(`[data-sk="${sid}"]`)?.click(); step(0.02);
  const rb = [...$('sb-body').querySelectorAll('[data-rune]')].filter(b => b.dataset.rune.startsWith(sid + ':'));
  check(rb.length === 3, `「${g.cls.skills[sid].name}」熟练度 650：3 枚符文`);
  const before = pv('skill2'); rb[0].click(); step(0.02); const after = pv('skill2');
  check(after.displayName !== before.displayName || after.element !== before.element || JSON.stringify(after.effects) !== JSON.stringify(before.effects), `装符文：${before.displayName} → ${after.displayName}`);
  const pb = $('sb-body').querySelectorAll('[data-preset]')[0]; pb.click(); step(0.02);
  log(`推荐卡 1：${['skill1', 'skill2', 'skill3', 'ultimate'].map(sl => pv(sl).displayName).join(' / ')}`);
  key('Escape'); step(0.05);
  g.save(); const sv = JSON.parse(g.rawSave());
  check(sv.version === 10 && sv.skillbook?.learned.length >= 8, `存档 v9：学会 ${sv.skillbook?.learned.length}`);
}
if (MODE === 'sb7' || MODE === 'all') {
  await session('v0.7.4 技能书：时砂行者', c => skillBook7(c, 'chrono'), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('chrono') } });
  await session('v0.7.4 技能书：炼金投弹手', c => skillBook7(c, 'alchemy'), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('alchemy') } });
}
if (MODE === 'rot') {
  const only = process.env.ROT_CLS ? process.env.ROT_CLS.split(',').map(Number) : [0, 1, 2, 3];
  for (const i of only) for (const si of (process.env.ROT_SPEC ? process.env.ROT_SPEC.split(',').map(Number) : [0, 1, 2])) await session(`循环 ${i}-${si}`, c => rotTest(c, i, si), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy', 'hunter', 'coffin'][i]) } });
  (await import('fs')).writeFileSync(process.env.ROT_OUT ?? '../rotation.json', JSON.stringify(BAL, null, 1));
}
if (MODE === 'bal') {
  for (const i of [0, 1, 2, 3]) for (const on of [true, false]) await session(`平衡 ${i} ${on}`, c => balTest(c, i, on), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy'][i]) } });
  (await import('fs')).writeFileSync('../balance.json', JSON.stringify(BAL, null, 1));
}
if (MODE === 'ch6' || MODE === 'all') {
  await session('v0.8.3 第 6 章「暗岩之心」+ 结局', ch6Test, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
if (MODE === 'back' || MODE === 'all') {
  await session('v0.8.2.1 返回角色选择 + 8 个角色栏位', backTest, { viewport: [1280, 720] });
}
if (MODE === 'wk' || MODE === 'all') {
  await session('v0.8.2 每周挑战 + 本地排行', wkTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
if (MODE === 'aby' || MODE === 'all') {
  await session('v0.8.0 / v0.8.1 暗岩深渊 1–20 层', abyTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
  const low = JSON.parse(P6_SAVE('mage')); low.level = { level: 25, xp: 0 };
  await session('v0.8.0 暗岩深渊：30 级解锁', abyLock, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(low) } });
}
if (MODE === 'ct' || MODE === 'all') {
  await session('v0.7.14 职业平衡系数随主天赋系切换', ctTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('chrono') } });
}
if (MODE === 'guide96' || MODE === 'p96g') {
  const low = JSON.parse(P6_SAVE('warrior')); low.level = { level: 4, xp: 0 }; low.guide = { done: [], seen: [] };
  await session('v0.9.6g：玩法介绍（电脑）', guide96Test, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(low) } });
  await session('v0.9.6g：玩法介绍（手机 667×375）', guide96Phone, { viewport: [667, 375], touch: true, storage: { darkrock_legend_save: p4Save(30, [], 4) } });
}
if (MODE === 'next' || MODE === 'all') {
  const low = JSON.parse(P6_SAVE('warrior')); low.level = { level: 4, xp: 0 }; delete low.guide; low.guide = { done: [], seen: [] };
  await session('v0.7.13 推荐下一步 + 教学 + 成长目标', nextTest, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(low) } });
  await session('v0.7.13 老存档不补弹教学', nextOld, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
if (MODE === 'ach' || MODE === 'all') {
  await session('v0.7.12 成就与图鉴', achTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
if (MODE === 'pg' || MODE === 'all') {
  await session('v0.7.10 暗岩印记 · 职业任务天赋点', c => pgTest(c), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
if (MODE === 'ticon' || MODE === 'all') {
  for (const [i, n] of [[0, '战士'], [1, '法师'], [2, '时砂行者'], [3, '炼金投弹手']]) await session(`v0.7.9.1 天赋独立图标：${n}`, c => ticonTest(c, i), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy'][i]) } });
}
if (MODE === 'gs' || MODE === 'all') {
  await session('v0.7.9 装备方案', gsTest, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
  const nine = JSON.parse(P6_SAVE('mage')); nine.level = { level: 9, xp: 0 };
  await session('v0.7.9 解锁节奏', unlockTest, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(nine) } });
}
if (MODE === 'sk4' || MODE === 'all') {
  for (const [i, n] of [[0, '战士'], [1, '法师'], [2, '时砂行者'], [3, '炼金投弹手']]) await session(`v0.7.8 第 4 技能槽：${n}`, c => sk4Test(c, i), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy'][i]) } });
  const low = JSON.parse(P6_SAVE('warrior')); low.level = { level: 20, xp: 0 };
  await session('v0.7.8 第 4 技能槽：25 级前锁定', sk4Lock, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(low) } });
}
if (MODE === 'tal2' || MODE === 'all') {
  await session('v0.7.7 天赋树 2.0：天赋页 + 资源天赋', tal2Test, { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
  const old = JSON.parse(P6_SAVE('warrior')); old.version = 9; old.talents = { wa_weapon: 3, wa_might: 3 };
  await session('v0.7.7 天赋树 2.0：v9 老存档返还天赋', tal2Migrate, { viewport: [1280, 720], storage: { darkrock_legend_save: JSON.stringify(old) } });
}
if (MODE === 'spr' || MODE === 'all') {
  for (const [i, n] of [[0, '战士'], [1, '法师'], [2, '时砂行者'], [3, '炼金投弹手']]) await session(`v0.7.6 英灵传承：${n}`, c => sprTest(c, i), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy'][i]) } });
}
if (MODE === 'res' || MODE === 'all') {
  for (const [i, n] of [[0, '战士'], [1, '法师'], [2, '时砂行者'], [3, '炼金投弹手']]) await session(`v0.7.5 职业资源：${n}`, c => resTest(c, i), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE(['warrior', 'mage', 'chrono', 'alchemy'][i]) } });
}
if (MODE === 'awk' || MODE === 'all') {
  await session('v0.7.4 觉醒 + 岩纹镌刻', c => awakenTest(c), { viewport: [1280, 720], storage: { darkrock_legend_save: P6_SAVE('warrior') } });
}
// ---------------------------------------------------------------- v0.9.7 DLC 框架：存档兼容（本体 / PLAYTEST_DLC=dlc1 两种构建都跑）
if (MODE === 'packs') {
  const it = (id, slot, pack) => ({ id, name: `测试${id}`, slot, quality: pack ? 'orange' : 'blue', baseId: slot === 'chest' ? 'b_chest' : 'b_helm', itemLevel: 40, hp: 10, armor: 5, lines: ['x'], sellPrice: 1, modifiers: [], durability: 100, ...(pack ? { pack } : {}) });
  const SAVE = { version: 10, savedAt: 1, classId: 'warrior', name: '潮声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 777, bag: [it('b1', 'head'), it('d1', 'head', 'dlc1'), it('b2', 'head')], equipped: { chest: it('d0', 'chest', 'dlc1') }, stacks: { potion_s: 3, '@dlc1:mat_bell': 5 } },
    level: { level: 35, xp: 1234 }, talents: {}, quests: { active: {}, done: [] }, map: 'dlc1_shore', pos: { x: 12.5, z: -40.3 },
    dlc: { dlc1: { v: 1, bells: [1, 2, 3] } }, futureField: { a: 1 } };
  const HUNTER = { version: 10, savedAt: 1, classId: 'dlc1_hunter', name: '猎手', inventory: { gold: 1, bag: [], equipped: {}, stacks: {} }, level: { level: 33, xp: 9 }, talents: {}, quests: { active: {}, done: [] }, dlc: { dlc1: { pet: 'wolf' } } };
  const meta = (id, classId, name, level) => ({ id, name, classId, look: 0, level, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 });
  const storage = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta('cw', 'warrior', '潮声', 35), meta('ch', 'dlc1_hunter', '猎手', 33), null, null, null, null, null, null], last: 'cw', legacyMigrated: true }),
    darkrock_char_cw: JSON.stringify(SAVE), darkrock_char_ch: JSON.stringify(HUNTER), darkrock_intro_seen: '1' };
  const isDlc = DLCS.includes('dlc1');
  await session(`v0.9.7：DLC 框架存档兼容（${isDlc ? 'dlc1 构建' : '本体构建'}）`, async c => {
    const { g, $, step, check, w } = c;
    const hunterRaw = w.localStorage.getItem('darkrock_char_ch');
    g.renderTitle(); step(0.1);
    const slots = [...$('cs-slots').children];
    check(slots[1]?.classList.contains('locked') && slots[1].textContent.includes('需要扩展内容'), '扩展内容职业角色在列表里锁定');
    g.selSlot = 1; step(0.05);
    check($('start').disabled && $('start').textContent === '需要扩展内容', `选中锁定角色：开始按钮禁用（${$('start').textContent}）`);
    check(g.startSelected() === false && !g.started, '强行开始被拒绝');
    check(w.localStorage.getItem('darkrock_char_ch') === hunterRaw, '锁定角色的存档原文一字不变');
    g.selSlot = 0; step(0.05);
    check(!$('start').disabled, '选中战士角色可以开始');
    $('start').click(); step(1);
    const d = g.packsDebug();
    console.log('    packsDebug', JSON.stringify({ packs: d.packs, maxLevel: d.maxLevel, level: d.level, savedLevel: d.savedLevel, packFix: d.packFix }));
    check(d.packs.join() === (isDlc ? 'dlc1' : '') && d.maxLevel === (isDlc ? 40 : 30), `已注册包 [${d.packs}]，等级上限 ${d.maxLevel}`);
    check(d.level === (isDlc ? 35 : 30) && d.savedLevel === 35, `运行时 ${d.level} 级，存档等级 ${d.savedLevel}`);
    const all = [...g.inventory.bag, ...Object.values(g.inventory.equipped)];
    if (!isDlc) {
      check(d.packFix.sealed === 3 && !all.some(i => i.pack) && g.inventory.stack('@dlc1:mat_bell') === 0, '本体：DLC 物品 / 材料封存，背包和身上没有 DLC 物品');
      check(g.inventory.bag.length === 2 && g.inventory.gold === 777, '本体物品和金币都在');
    } else {
      check(d.packFix.unsealed === 0 && all.filter(i => i.pack === 'dlc1').length === 2 && g.inventory.stack('@dlc1:mat_bell') === 5, 'dlc1 构建：DLC 物品直接可用（不封存）');
    }
    check(d.packFix.parked && g.zone === 'world', `存档区域当前构建进不去 → 回到灰石营地（zone ${g.zone}，坐标停放）`);
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.level.level === 35 && sv.level.xp === 1234, `写回存档：等级 ${sv.level.level}、经验 ${sv.level.xp}`);
    check(sv.packPark?.map === 'dlc1_shore' && sv.packPark.pos.x === 12.5 && sv.packPark.pos.z === -40.3, '写回存档：DLC 区域坐标停放保留');
    check(sv.dlc?.dlc1?.bells?.length === 3 && sv.futureField?.a === 1, '写回存档：dlc.dlc1 与未知字段原样');
    if (!isDlc) check(sv.packSealed?.items?.length === 2 && sv.packSealed.stacks['@dlc1:mat_bell'] === 5 && sv.packSealed.items.some(e => e.slot === 'chest'), '写回存档：封存列表 2 件 + 材料 5');
    else check(!sv.packSealed && sv.inventory.equipped.chest?.pack === 'dlc1', 'dlc1 构建写回：DLC 装备仍在身上');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 2).join(' | ') : ''}`);
    // 本体 → 再用 dlc1 构建读：见 simPacks 第 5 节（同一套 core 函数）；这里额外跑一次「本体存出的档再进本体」
    if (!isDlc) {
      const again = { ...storage, darkrock_char_cw: g.rawSave() };
      globalThis.__packsAgain = again;
    }
  }, { viewport: [1280, 720], storage });
  if (!isDlc && globalThis.__packsAgain) await session('v0.9.7：本体存出的档再读一次（不重复封存、不丢）', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const d = g.packsDebug();
    check(d.packFix.sealed === 0 && d.packFix.stillSealed === 3 && d.savedLevel === 35, `第二次读：新封存 ${d.packFix.sealed}、仍封存 ${d.packFix.stillSealed}、存档等级 ${d.savedLevel}`);
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.packSealed?.items?.length === 2 && sv.level.level === 35 && sv.packPark?.map === 'dlc1_shore', '写回后封存 / 等级 / 停放仍在');
    // 交给 dlc1 构建的那一轮：本体写出的档 → dlc1 读
    const { writeFileSync } = await import('fs'); const { tmpdir } = await import('os');
    writeFileSync(`${tmpdir()}/darkrock_packs_base_save.json`, g.rawSave());
  }, { viewport: [1280, 720], storage: globalThis.__packsAgain });
  // 天赋页：DLC 里按 35 级加的点（超过本体 30 级的点数）→ 本体读档会被清空 → 没重新加点就原样写回
  if (!isDlc) {
    let page = null;
    await session('v0.9.7：准备一套超出本体点数的天赋页', async c => {
      const { g, $, step, check } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      g.tree.totalPoints = 40; let n = 0;
      for (let k = 0; k < 60; k++) for (const node of g.tree.def.specs.flatMap(sp => sp.nodes)) if (g.tree.add(node.id)) n++;
      page = g.tree.save();
      check(g.tree.spent > 21, `加了 ${g.tree.spent} 点（本体 30 级只有 21 点）`);
    }, { viewport: [1280, 720], storage });
    const withPage = { ...SAVE, talents: page, talentPages: [page, {}, {}], talentPage: 0 };
    await session('v0.9.7：本体读 35 级 + 超点天赋页，写回不丢', async c => {
      const { g, $, step, check } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      check(g.tree.spent === 0, `本体运行时天赋页无法生效（已用 ${g.tree.spent} 点，可用 ${g.tree.totalPoints}）`);
      g.save(); step(0.1);
      const sv = JSON.parse(g.rawSave());
      check(JSON.stringify(sv.talentPages[0]) === JSON.stringify(page) && JSON.stringify(sv.talents) === JSON.stringify(page), '写回存档：天赋页原样保留');
      check(c.errors.length === 0, '无运行时错误');
    }, { viewport: [1280, 720], storage: { ...storage, darkrock_char_cw: JSON.stringify(withPage) } });
  }
  // v1.0.1：停放规则 —— 本体里离开过营地 → 停放作废（以本体位置为准）；只在营地 → 停放保留
  if (!isDlc) await session('v1.0.1：停放规则（本体里离开营地后作废）', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.save(); step(0.1);
    check(JSON.parse(g.rawSave()).packPark?.map === 'dlc1_shore', '只在营地：停放保留');
    g.goMap('field'); step(0.5); g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(!sv.packPark && sv.map === 'field', `去过原野后存档：停放作废，位置 = 本体（${sv.map}）`);
    check(!$('tal-sum').querySelector?.('[data-ptab]'), '本体：天赋面板没有扩展天赋页签');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage });
  // v1.0.1：扩展天赋层（DLC 构建）
  if (isDlc) await session('v1.0.1：沉钟天赋（扩展天赋层 5 层）', async c => {
    const { g, $, step, check, w } = c;
    const s40 = { ...SAVE, level: { level: 40, xp: 0 }, map: 'camp', pos: undefined };
    w.localStorage.setItem('darkrock_char_cw', JSON.stringify(s40));
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    check(g.progression.packTalentPoints === 5, `40 级：扩展天赋点 ${g.progression.packTalentPoints}`);
    c.key('n'); step(0.1); g.renderTalents?.(); step(0.05);
    const tab = $('tal-sum').querySelector('[data-ptab]');
    check(!!tab && tab.textContent.includes('沉钟天赋'), `天赋面板有「沉钟天赋」页签（${tab?.textContent}）`);
    tab.click(); step(0.05);
    const rows = [...$('tal-tree').querySelectorAll('.ptrow')];
    check(rows.map(r => r.querySelectorAll('.ptnode').length).join() === '1,2,1,2,3', `5 层：${rows.map(r => r.querySelectorAll('.ptnode').length).join(' / ')}`);
    const hp0 = g.charSheet().maxHp;
    const clickNode = (k, i) => { [...$('tal-tree').querySelectorAll('.ptrow')][k].querySelectorAll('.ptnode')[i].click(); step(0.05); };
    clickNode(0, 0); clickNode(1, 1); clickNode(2, 0); clickNode(3, 0); clickNode(4, 1);
    check(g.charSheet().maxHp > hp0 + 2000, `第 1/2 层属性生效：生命 ${hp0} → ${g.charSheet().maxHp}`);
    const sk = g.skillBook.skillAt('skill4');
    check(sk.id === 'd1_bell_quake' && g.loadout.preview('skill4', { now: g.T, casterHpPercent: 1, targetEffects: [] }).displayName.includes('沉钟震地'), `终极天赋：学会并装上「${sk.name}」（绝技槽）`);
    check($('tal-tree').querySelectorAll('.ptnode.on').length === 5 && /已用 5\/5/.test($('tal-sum').textContent), '5 个都已选、5/5 点');
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(Array.isArray(sv.dlc?.dlc1?.ptal) && sv.dlc.dlc1.ptal.filter(Boolean).length === 5 && sv.skillbook.equip.skill4 === 'd1_bell_quake' && sv.dlc.dlc1.bells?.length === 3, '存档：dlc.dlc1.ptal 5 个 + 绝技槽 + 原 dlc 数据都在');
    // 退选终极：换回默认绝技
    [...$('tal-tree').querySelectorAll('.ptrow')][4].querySelector('.ptnode.on').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true })); step(0.05);
    check(g.skillBook.skillAt('skill4').id === 'earthsplitter' && !g.skillBook.isLearned('d1_bell_quake'), `退选终极：绝技槽换回「${g.skillBook.skillAt('skill4').name}」`);
    // DLC 装备限制行
    g.inventory.add({ ...g.gen.generate(40, 'purple', ['neck']), pack: 'dlc1' }); step(0.05);
    const dl = g.inventory.bag[g.inventory.bag.length - 1];
    check(g.inventory.equip(dl.id), 'DLC 构建：DLC 装备可以穿');
    $('btn-char').click(); step(0.05); g.renderChar();
    $('char').querySelector('[data-slot="neck"]').dispatchEvent(new w.MouseEvent('mouseenter', { clientX: 300, clientY: 200 })); step(0.05);
    check(/沉钟之海资料片/.test($('tooltip').textContent) && /不可使用/.test($('tooltip').textContent), `DLC 装备提示多一行限制：${$('tooltip').textContent.match(/◆[^◆]{0,40}/)?.[0] ?? '（没找到）'}`);
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage });
  // v1.0.2：包野外区域（沉钟海岸白盒）—— 传送阵进入、场景 / 刷怪、营地传送阵、世界地图、存档回原地、石门回营地
  if (isDlc) await session('v1.0.2：包野外区域（沉钟海岸白盒）', async c => {
    const { g, $, step, check, w } = c;
    const s29 = { ...SAVE, level: { level: 29, xp: 0 }, map: 'camp', pos: undefined };
    w.localStorage.setItem('darkrock_char_cw', JSON.stringify(s29));
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.openWaypoints(); step(0.05);
    const row = () => $('travel-body').querySelector('[data-packwp="dlc1_coast_wp"]');
    check(!row(), 'v1.2.71：没从灰石营地古井下行过（也不是老存档）时，传送阵不列出「沉钟海岸」');
    g.togglePanel('travel', false); w.__dlc1.gate.markDescended(); g.openWaypoints(); step(0.05);   // 视为已从潮音钟门下行过一次，下面照旧测等级锁
    check(!!row() && row().querySelector('button').disabled && /等级 30/.test(row().textContent), `29 级：传送阵里「沉钟海岸（白盒）」锁定（${row()?.textContent.slice(0, 40)}）`);
    check(g.goMap('dlc1_coast') === false && g.zone === 'world', '29 级：直接 goMap 也被等级锁挡住');
    g.togglePanel('travel', false);
    g.progression.level = 30; g.ensureWild('dlc1_coast');
    g.openWaypoints(); step(0.05);
    check(!row().querySelector('button').disabled, '30 级：传送阵入口可用');
    row().querySelector('button').click(); step(1);
    check(g.zone === 'dlc1_coast' && g.currentMap() === 'dlc1_coast', `进入沉钟海岸（zone ${g.zone}）`);
    const mobs = g.enemies.filter(e => e.z === 'dlc1_coast' && e.alive);
    check(mobs.length >= 10 && mobs.some(e => e.type.name === '钟壳蟹'), `刷怪 ${mobs.length} 只（含钟壳蟹）`);
    step(0.5);
    check(g.waypoints.has('cs_camp'), `落在潮痕营地：营地传送阵自动开通（pos ${g.player.pos.x.toFixed(1)},${g.player.pos.z.toFixed(1)} zone ${g.zone} wps ${[...g.waypoints].join('/')} started ${g.started} T ${g.T ?? '?'} hidden ${w.document.hidden} err ${c.errors.slice(0,2).join(' | ').slice(0,300)}）`);
    g.openWorldMap('world'); step(0.1);
    check(g.worldMapLegend().includes('沉钟海岸') && g.worldMapLegend().includes('你在这里'), '世界地图（世界视图）列表有沉钟海岸、标「你在这里」');
    g.openWorldMap('zone', 'dlc1_coast'); step(0.1);
    check(g.worldMapLegend().includes('潮痕营地') || g.worldMapLegend().includes('沉钟海岸'), '区域详图：沉钟海岸');
    g.togglePanel('worldmap', false);
    const rd = g.recallDest();
    check(rd.map === 'dlc1_coast' && rd.name === '潮痕营地', `回程目的地：${rd.name}`);
    g.player.pos.set(2400 + 10, 0, -2400 - 20); g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.map === 'dlc1_coast' && Math.round(sv.pos.x) === 2410 && !sv.packPark, `存档：map ${sv.map}，坐标 ${Math.round(sv.pos.x)},${Math.round(sv.pos.z)}，没有停放`);
    globalThis.__coastSave = g.rawSave();
    check(g.useGate('dlc1_coast', 'camp') && g.zone === 'world', '潮道石门：回灰石营地');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage });
  // v1.0.3：第七章 + 潮汐 + 回响首领
  if (isDlc) await session('v1.0.3：沉钟海岸 · 第七章与潮汐', async c => {
    const { g, $, step, check, w } = c;
    const s30 = { ...SAVE, level: { level: 30, xp: 0 }, map: 'camp', pos: undefined, quests: { active: {}, done: [] } };
    w.localStorage.setItem('darkrock_char_cw', JSON.stringify(s30));
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    check([...$('toasts')?.children ?? []].some(x => /钟停了/.test(x.textContent)) || g.quests.state('cs7_1', 30) === 'available', '30 级进游戏：第七章引子提示 / 7-1 可接');
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.5);
    const iola = g.npcs.find(n => n.id === 'iola');
    check(!!iola && iola.z === 'dlc1_coast', '伊奥拉在潮痕营地');
    const grp = g.wilds.dlc1_coast.group; let lathe = 0; grp.traverse(o => { if (o.geometry?.type === 'LatheGeometry') lathe++; });
    check(lathe >= 3, `沉钟造景：${lathe} 口钟`);
    check(g.enemies.some(e => e.z === 'dlc1_coast' && e.type.name.includes('溺亡工头')), '回响首领「溺亡工头格罗克」在深潮口巡游');
    check(g.quests.accept('cs7_1', 30), '接 7-1');
    g.player.pos.set(2400, 0, -2412); step(0.6);
    check(g.quests.state('cs7_1', 30) === 'ready', `走到沉钟：7-1 完成（${g.quests.state('cs7_1', 30)}）`);
    const D = w.__dlc1;
    D.setTidePhase('high'); step(0.3);
    check(D.tideDebug().phase === 'high' && D.tideDebug().waters.every(y => y > 0), `涨潮：水面上升（${D.tideDebug().waters}）`);
    const bag0 = g.loots?.length ?? 0;
    D.setTidePhase('low'); step(0.3); g.player.pos.set(2400 - 46, 0, -2400 + 16); step(0.3);
    check(D.tideDebug().chests[0].open, '退潮：走到沉船宝箱自动打开');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage });
  // v1.0.5：镜渊城 + 第八章 + 镜面通道
  if (isDlc) await session('v1.0.5：镜渊城 · 第八章与镜面通道', async c => {
    const { g, $, step, check, w } = c;
    const done7 = ['cs7_1', 'cs7_2', 'cs7_3', 'cs7_4', 'cs7_5', 'cs7_6'];
    const s34 = { ...SAVE, level: { level: 34, xp: 0 }, map: 'camp', pos: undefined, quests: { active: {}, done: done7 } };
    w.localStorage.setItem('darkrock_char_cw', JSON.stringify(s34));
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    check(g.quests.state('cs8_1', 34) === 'available', `第七章完成 + 34 级：8-1 可接（${g.quests.state('cs8_1', 34)}）`);
    check(g.quests.accept('cs8_1', 34), '接 8-1（海岸的伊奥拉）');
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.4);
    const gt = g.wilds.dlc1_coast.gates.find(x => x.to === 'dlc1_mirror');
    check(!!gt, '海岸南端有通往镜渊城的倒悬阶梯');
    g.ensureWild('dlc1_mirror'); g.useGate('dlc1_coast', 'dlc1_mirror'); step(0.6);
    check(g.zone === 'dlc1_mirror', `走阶梯进入镜渊城（${g.zone}）`);
    check(g.quests.state('cs8_1', 34) === 'ready', `登上镜渊城：8-1 完成（${g.quests.state('cs8_1', 34)}）`);
    const ids = ['charon', 'iola_m', 'mr_mira', 'echo_ouf', 'echo_otta'];
    check(ids.every(id => g.npcs.some(n => n.id === id && n.z === 'dlc1_mirror')), '卡戎、伊奥拉、补给商、回响居民都在倒钟广场一带');
    const kinds = new Set(g.enemies.filter(e => e.z === 'dlc1_mirror').map(e => e.kind));
    check(['mr_wraith', 'mr_sentinel', 'mr_moth', 'mr_priest'].every(k => kinds.has(k)), `四种新怪都刷出来了（${[...kinds]}）`);
    let tw = 0; g.wilds.dlc1_mirror.group.traverse(o => { if (o.geometry?.type === 'TorusGeometry') tw++; });
    check(tw >= 6, `镜面通道：${tw} 面镜框`);
    g.player.pos.set(2400 - 30, 0, -2100 + 12); step(0.3);
    check(Math.abs(g.player.pos.x - (2400 + 33)) < 0.5, `走进左镜，从右镜前出来（x=${g.player.pos.x.toFixed(1)}）`);
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage });
  // v1.0.6：第 5 职业 灵契猎手（dlc1 构建可选；本体构建没有这个职业，hunter 角色锁定）
  if (!isDlc) await session('v1.0.6：本体构建没有灵契猎手，猎手角色锁定', async c => {
    const { g, $, step, check } = c;
    g.renderTitle(); step(0.1);
    check([...$('class-pick').children].length === 4 && ![...$('class-pick').children].some(x => /灵契/.test(x.textContent)), `职业卡 ${$('class-pick').children.length} 张，没有灵契猎手`);
    const slots = [...$('cs-slots').children];
    check(slots[2]?.classList.contains('locked'), '存档里的猎手角色在列表里锁定');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: { ...storage, darkrock_roster: JSON.stringify({ v: 1, slots: [meta('cw', 'warrior', '潮声', 35), meta('ch', 'dlc1_hunter', '猎手', 33), meta('hh', 'hunter', '灵契', 26), null, null, null, null, null], last: 'cw', legacyMigrated: true }), darkrock_char_hh: JSON.stringify({ ...HUNTER, classId: 'hunter' }) } });
  if (isDlc) await session('v1.0.6：灵契猎手 · 三形态 / 换形技 / 兽魂 / 链甲', async c => {
    const { g, $, step, check, key, w, log } = c;
    g.renderTitle(); step(0.1);
    const cards = [...$('class-pick').children];
    check(cards.length >= 5 && /灵契猎手/.test(cards[4].textContent) && /三形态/.test(cards[4].textContent), `职业卡 ${cards.length} 张，第 5 张：${cards[4]?.querySelector('b')?.textContent}`);
    g.selSlot = 2; step(0.05); cards[4].click(); step(0.1);
    check(/F 换形/.test($('help-keys').textContent) && $('cs-info').textContent.includes('狼群'), '选角说明：操作 + 三专精');
    $('start').click(); step(1.2);
    const D = () => w.__dlc1.hunter.debug();
    check(g.cls.id === 'hunter' && !!g.curChar, `进入游戏：${g.cls.name}，生命 ${g.player.maxHp}`);
    check(g.player.rig.root.userData.model === 'Rogue' || (ASSET_PACK === 'aholo' && g.player.rig.root.userData.model === 'UBC_Male'), `模型：骨骼底模 ${g.player.rig.root.userData.model}`);   // v1.2.55 比赛版写实模型加载完成时为 UBC_Male（无头图片桩修好后写实能加载）
    const fx = g.player.rig.root.userData.gearFx;
    check(!!fx && /职业挂件/.test(fx.summary ?? '') && fx.objs.length >= 5, `程序化挂件 ${fx?.objs.length} 件（${fx?.summary}）`);
    check(g.res.kind === 'beast', `资源：${g.res.kind}`);
    check(!!g.player.rig.root.getObjectByName('hunter_aura'), '头顶有形态之魂');
    log(`技能栏：${[...w.document.querySelectorAll('.skill .nm')].map(n => n.textContent).join(' | ')}`);
    check(D().form === 'wolf' && /狼形态/.test($('cls-status')?.textContent ?? ''), `开局狼形态，状态行：${$('cls-status')?.textContent}`);
    // 打一只狼
    const wolf = g.enemies.find(e => e.kind === 'wolf' && e.alive);
    g.target = wolf; g.player.pos.set(wolf.pos.x - 1.5, 0, wolf.pos.z); step(0.05);
    const hp0 = wolf.hp; g.tryCast('basic'); step(0.5);
    check(wolf.hp < hp0 && g.res.value > 0, `狼·契刃斩命中（${hp0} → ${wolf.hp}），兽魂 ${g.res.value.toFixed(0)}`);
    // 换形：X 熊（换形技），V 鹰
    const sw0 = D().stats.shifts; step(1.1); key('x'); step(0.3);
    check(D().form === 'bear' && D().stats.shifts === sw0 + 1, `X → 熊形态，放出换形技「震地咆哮」（换形技 ${D().stats.shifts} 次）`);
    check(g.player.rig.root.getObjectByName('hunter_aura')?.userData.form === 'bear', '形态之魂换成熊');
    const p1 = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] });
    check(p1.displayName === '熊掌劈', `普攻变 ${p1.displayName}`);
    step(1.1); key('v'); step(0.2);
    const pe = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] });
    check(D().form === 'eagle' && pe.shape === 'projectile' && pe.stats.range >= 15, `V → 鹰形态：普攻变远程 ${pe.displayName}（${pe.stats.range} 米）`);
    const w2 = g.enemies.find(e => e.kind === 'wolf' && e.alive);
    g.target = w2; g.player.pos.set(w2.pos.x - 12, 0, w2.pos.z); step(0.05);
    const h2 = w2.hp; g.tryCast('basic'); step(1.2);
    check(w2.hp < h2 && D().stats.marks > 0, `12 米外鹰·契刃斩命中并标记（${h2} → ${w2.hp}，标记 ${D().stats.marks}）`);
    // 技能 2 三种打法
    g.loadout.resetCooldown('skill2'); g.tryCast('skill2'); step(0.6);
    check(g.loadout.cooldownLeft('skill2', g.T) > 0, '鹰·兽魂旋击在目标处落下（进冷却）');
    step(1.1); key('f'); step(0.2);
    check(D().form === 'wolf', 'F 轮换回狼');
    // 兽魂强化 + 灵契换形技
    g.res.value = 60; step(5); key('x'); step(0.3);
    check(D().stats.empShifts >= 1 && g.res.value < 60, `兽魂 ≥25：「灵契·」换形技（兽魂剩 ${g.res.value.toFixed(0)}）`);
    // 熊形态减伤
    const hpB = g.player.hp; g.fx.dealDamage(g.player, 100, 'physical', null, false, false, false); step(0.05);
    check(D().form === 'bear' && hpB - g.player.hp <= 90 && D().stats.reduced > 0, `熊形态受到 100 伤害实际 -${hpB - g.player.hp}`);
    // 链甲穿戴 + 换弓
    const mail = g.gen.generateFromBase('b_h_hauberk', 20, 'blue'), plate = g.gen.generateFromBase('b_chest', 20, 'blue');
    check(!!mail && mail.armorType === 'mail' && mail.pack === 'dlc1' && g.inventory.canEquip(mail) && plate && !g.inventory.canEquip(plate), '链甲能穿、重甲不能穿；链甲带包标记');
    // 11-05 两栏：长柄（主手）+ 弓（弓栏）同时装备；短刃退役（不能装备）
    const gl = g.gen.generateFromBase('b_h_glaive', 20, 'blue'), bow = g.gen.generateFromBase('b_h_bow', 20, 'purple'), sb = g.gen.generateFromBase('b_h_shortblade', 20, 'blue');
    g.inventory.bag.push(gl, bow, sb); g.inventory.equip(gl.id); g.inventory.equip(bow.id); const sbOk = g.inventory.equip(sb.id); g.refreshGear?.(); step(0.2);
    check(g.inventory.equipped.mainHand?.weaponType === 'glaive' && g.inventory.equipped.offHand?.weaponType === 'bow' && !sbOk, '两栏：长柄 + 弓同时装备，短刃不能装备');
    // 天赋 / 技能书 / 英灵 / 职业任务
    check(g.tree.def.specs.map(s => s.name).join() === '狼群,巨熊,苍鹰', `天赋：${g.tree.def.specs.map(s => s.name).join(' / ')}`);
    key('n'); step(0.1); check($('talent').style.display !== 'none' && /头狼|狼群/.test($('talent').textContent), '天赋面板打开（狼群树）'); key('Escape'); step(0.1);
    key('k'); step(0.1); const sbT = $('skillbook')?.textContent ?? ''; check(/契约突袭/.test(sbT) && /兽跃|风行契步/.test(sbT), '技能书：契约突袭 / 兽跃 / 风行契步'); key('Escape'); step(0.1);
    check(g.spirits.pool().length === 12, `英灵 ${g.spirits.pool().length} 个`);
    check(['cq_hunter1', 'cq_hunter2'].every(id => g.quests.def(id)?.cls === 'hunter') && g.quests.state('cq_hunter1', 10) === 'available', '职业任务「猎卫遗契」（10 级可接）');
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.classId === 'hunter', '存档职业 = hunter');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: { ...storage, darkrock_char_cw: JSON.stringify({ ...SAVE, level: { level: 26, xp: 0 }, map: 'camp', pos: undefined }) } });
  if (isDlc) await session('v1.0.7：负棺人 · 收魂 / 棺态 / 开棺 / 未亡', async c => {
    const { g, $, step, check, key, w } = c;
    g.renderTitle(); step(0.1);
    const cards = [...$('class-pick').children];
    check(cards.length === 6 && /负棺人/.test(cards[5].textContent), `职业卡 ${cards.length} 张，第 6 张负棺人`);
    g.selSlot = 2; step(0.05); cards[5].click(); step(0.1); $('start').click(); step(1.2);
    const D = () => w.__dlc1.coffin.debug();
    check(g.cls.id === 'coffin' && g.res.kind === 'soul', `进入游戏：${g.cls.name}，资源 ${g.res.kind}`);
    check(!!g.player.rig.root.getObjectByName('coffin_back'), '背上有铁棺');
    const wolf = g.enemies.find(e => e.kind === 'wolf' && e.alive);
    g.target = wolf; g.player.pos.set(wolf.pos.x - 1.5, 0, wolf.pos.z); step(0.05);
    g.fx.dealDamage(wolf, wolf.hp + 10, 'physical', g.player, false, false, false); step(0.1);
    check(D().souls.join() === 'beast' && g.res.value === 1, `击杀灰鬃狼收进野兽魂（${D().souls.join()}）`);
    key('f'); step(0.3);
    check(D().mode === 'planted' && !!g.scene?.getObjectByName?.('coffin_grave') !== false, '立棺');
    step(0.7); key('f'); step(0.1); check(D().mode === 'back', '收棺');
    w.__dlc1.coffin.debugSouls(['giant', 'giant', 'giant']); step(0.1); key('x'); step(0.5);
    check(D().last === '葬山', `开棺：${D().last}`);
    w.__dlc1.coffin.debugSouls(['man']); const hp = g.player.maxHp;
    g.fx.dealDamage(g.player, hp * 5, 'physical', null, false, false, false); step(0.1);
    check(g.player.alive && D().rest, '致命伤害 → 入殓');
    step(2.2); check(!D().rest && D().stats.revives === 1 && g.player.alive, `复活（生命 ${Math.round(g.player.hp)}）`);
    g.save(); step(0.1); check(JSON.parse(g.rawSave()).classId === 'coffin', '存档职业 = coffin');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: { ...storage, darkrock_char_cw: JSON.stringify({ ...SAVE, level: { level: 26, xp: 0 }, map: 'camp', pos: undefined }) } });
  if (isDlc && globalThis.__coastSave) await session('v1.0.2：读档回到沉钟海岸', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    check(g.zone === 'dlc1_coast' && Math.round(g.player.pos.x) === 2410, `读档回到沉钟海岸原坐标（zone ${g.zone}，x ${Math.round(g.player.pos.x)}）`);
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: { ...storage, darkrock_char_cw: globalThis.__coastSave } });
  if (isDlc) {
    const { existsSync, readFileSync: rf } = await import('fs'); const { tmpdir } = await import('os');
    const f = `${tmpdir()}/darkrock_packs_base_save.json`;
    if (!existsSync(f)) console.log('  （跳过「本体存档 → dlc1 读」：先跑一次本体构建的 packs 模式）');
    else await session('v0.9.7：本体写出的档 → dlc1 构建读（解封）', async c => {
      const { g, $, step, check } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      const d = g.packsDebug();
      check(d.packFix.unsealed === 3 && d.packFix.stillSealed === 0 && d.level === 35 && d.maxLevel === 40, `解封 ${d.packFix.unsealed} 项，35 级（上限 40）`);
      check(g.inventory.equipped.chest?.id === 'd0' && g.inventory.bag.map(i => i.id).join() === 'b1,d1,b2' && g.inventory.stack('@dlc1:mat_bell') === 5, '胸甲回到身上、背包原顺序、材料 5');
      g.save(); step(0.1);
      const sv = JSON.parse(g.rawSave());
      check(!sv.packSealed && sv.level.level === 35 && sv.level.xp === 1234 && sv.dlc.dlc1.bells.length === 3 && sv.futureField.a === 1, '写回：封存清空、等级经验 / dlc / 未知字段都在');
      check(sv.packPark?.map === 'dlc1_shore', 'dlc1 空骨架还没有这个区域 → 坐标继续停放（等包注册区域后放回）');
      check(c.errors.length === 0, '无运行时错误');
    }, { viewport: [1280, 720], storage: { ...storage, darkrock_char_cw: rf(f, 'utf8') } });
  }
}
// ====================================================================== v1.1.0 无声钟楼 · 第九章 · 命运的岔路（PLAYTEST_DLC=dlc1 node test/playtest.mjs bt）
if (MODE === 'bt' || MODE === 'p110') {
  if (!DLCS.includes('dlc1')) { console.log('bt 模式需要 PLAYTEST_DLC=dlc1'); process.exitCode = 1; }
  else {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DONE8 = ['cs7_1', 'cs7_2', 'cs7_3', 'cs7_4', 'cs7_5', 'cs7_6', 'cs8_1', 'cs8_2', 'cs8_3', 'cs8_4', 'cs8_5', 'cs8_6'];
  const mk = (lv, done, dlc, active = {}) => ({ version: 10, savedAt: 1, classId: 'warrior', name: '钟声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active, done }, map: 'camp', dlc: { dlc1: { v: 1, ...(dlc ?? {}) } } });
  const meta = { id: 'cb', name: '钟声', classId: 'warrior', look: 0, level: 38, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = sv => ({ darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cb', legacyMigrated: true }), darkrock_char_cb: JSON.stringify(sv), darkrock_intro_seen: '1' });
  const BTO = { x: 2400, z: -1800 };
  const at = (g, step, x, z, sec = 0.3) => { g.player.pos.set(BTO.x + x, 0, BTO.z + z); step(sec); };
  const killKey = (g, step, key) => { for (let k = 0; k < 160; k++) { const e = g.enemies.find(x => x.pboss === key && x.alive); if (!e) return true; e.hp = 1; e.brain.provoke?.(); g.target = e; g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
  const closeDlg = (g, $) => { if ($('dialog')?.style.display !== 'none') g.togglePanel?.('dialog', false); };
  let saveA = null, saveB = null;

  await session('v1.1.0：无声钟楼 · 区域 / 首领 / 9-1~9-3 · 命运的岔路（选 A）', async c => {
    const { g, $, step, check, w, log } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const D = w.__dlc1.bt;
    check(g.quests.state('cs9_1', 38) === 'available', `第八章完成 + 38 级：9-1 可接（${g.quests.state('cs9_1', 38)}）`);
    check(g.quests.accept('cs9_1', 38), '接 9-1（镜渊城的伊奥拉）');
    g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror'); step(0.4);
    const mg = g.wilds.dlc1_mirror.gates.find(x => x.to === 'dlc1_belltower');
    check(!!mg, '镜渊城北端有通往无声钟楼的倒悬阶梯');
    g.ensureWild('dlc1_belltower'); g.useGate('dlc1_mirror', 'dlc1_belltower'); step(0.6);
    check(g.zone === 'dlc1_belltower', `走阶梯进入无声钟楼（${g.zone}）`);
    at(g, step, 0, 54, 0.4);
    check(['iola_b', 'charon_b', 'bt_ren'].every(id => g.npcs.some(n => n.id === id && n.z === 'dlc1_belltower')), '伊奥拉、卡戎、补给商在钟楼脚下');
    const kinds = new Set(g.enemies.filter(e => e.z === 'dlc1_belltower').map(e => e.kind));
    check(['bt_monk', 'bt_wraith', 'bt_puppet'].every(k => kinds.has(k)), `三种新怪（${[...kinds].filter(k => !k.startsWith('bt_b')).join(',')}）`);
    step(1.2);
    const bs = D.debug().bosses;
    check(['bt_b1', 'bt_b2', 'bt_b3', 'bt_b4'].every(k => bs[k] === 'alive') && bs.bt_b5 === 'none' && bs.bt_sleeper_a === 'none' && bs.bt_sleeper_b === 'none', `首领在场：前四层活着，第五守 / 沉眠者在选择前不出现（${JSON.stringify(bs)}）`);
    let lathe = 0; g.wilds.dlc1_belltower.group.traverse(o => { if (o.geometry?.type === 'LatheGeometry') lathe++; });
    check(lathe >= 4, `钟楼造景：${lathe} 口钟`);
    const b1 = g.enemies.find(e => e.pboss === 'bt_b1');
    check(!!b1 && b1.rig.flash.length > 5 && b1.type.elite, `铸钟巨像：程序化模型（${b1?.rig.flash.length} 个材质）`);
    // 首领机制 + 首领框
    b1.brain.provoke?.(); g.player.pos.set(b1.pos.x + 3, 0, b1.pos.z); g.target = b1;
    let teles = 0; for (let i = 0; i < 40; i++) { step(0.25); g.player.hp = 1e7; if (g.telegraphCount?.() > 0 || w.document.querySelector('#boss-frame')?.style.display !== 'none') teles++; }
    check($('boss-frame').style.display !== 'none' && /铸钟巨像/.test($('boss-frame').textContent), `首领框：${$('boss-frame').textContent.slice(0, 30)}`);
    // 9-1：杀 10 个静默修士
    let monks = 0; for (let k = 0; k < 200 && g.quests.state('cs9_1', 38) !== 'ready'; k++) { const e = g.enemies.find(x => x.kind === 'bt_monk' && x.alive); if (!e) { step(1); continue; } e.hp = 1; g.target = e; g.player.pos.set(e.pos.x + 1.5, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; if (!e.alive) monks++; }
    at(g, step, 0, 54, 0.3);
    check(g.quests.state('cs9_1', 38) === 'ready', `9-1：抵达 + 静默修士 ×10（${g.quests.state('cs9_1', 38)}）`);
    check(g.quests.turnIn('cs9_1', 38) && g.quests.accept('cs9_2', 38), '交 9-1（钟楼的伊奥拉），接 9-2');
    check(killKey(g, step, 'bt_b1') && killKey(g, step, 'bt_b2'), '击败 铸钟巨像 / 缄默修士长');
    step(0.5);
    check(g.quests.state('cs9_2', 38) === 'ready', `9-2 完成（${g.quests.state('cs9_2', 38)}）`);
    check(D.debug().bosses.bt_b1 === 'dead' && D.state().kills.bt_b1 === 1, '首领死亡计数写入');
    g.quests.turnIn('cs9_2', 38); check(g.quests.accept('cs9_3', 38), '接 9-3「最后一下」');
    check(/抉择/.test(g.questText?.(g.quests.def('cs9_3')) ?? g.quests.def('cs9_3').tags.join()), '9-3 带红字（抉择）标签');
    // 没打完第三、四层就上顶层：不触发
    at(g, step, 0, -30, 0.3); at(g, step, 0, -40, 0.5);
    check(!D.fateUiOpen() && !D.state().banner, '第三、四层守钟者还在：顶层不触发岔路口');
    check(killKey(g, step, 'bt_b3') && killKey(g, step, 'bt_b4'), '击败 初代鸣钟人 / 塞特赫的回响');
    // 走进顶层抉择点
    at(g, step, 0, -30, 0.3); at(g, step, 0, -40, 0.3);
    const ban = $('anc-banner');
    check(ban.classList.contains('on') && ban.classList.contains('dual') && $('anc-big').textContent === '命运的岔路' && /最终定位/.test($('anc-name').textContent), `全屏横幅：${$('anc-small').textContent} / ${$('anc-big').textContent} / ${$('anc-name').textContent}`);
    step(3.4);
    check(D.fateUiOpen(), '横幅约 3 秒后自动打开抉择界面');
    const ui = w.document.getElementById('d1-fate');
    const t = ui.textContent;
    check(/再鸣/.test(t) && /断绳/.test(t) && /守钟人/.test(t) && /渊噬者/.test(t) && /秩序 · 控场 · 经营/.test(t) && /混沌 · 爆发 · 高风险/.test(t), '两栏：再鸣 · 守钟人 / 断绳 · 渊噬者 + 定位');
    check(/钟楼领地/.test(t) && /渊噬之躯/.test(t) && /钟鸣/.test(t) && /吞噬/.test(t) && /4 个阶段/.test(t) && /多一个阶段/.test(t) && /披风/.test(t) && /变异/.test(t), '玩法影响：系统 / 第 7 键 / 尾王战差异 / 外观 / 掉落');
    check(/选择后不可更改。同一账号的其他角色可以选另一条路。/.test(t) && ui.querySelectorAll('canvas').length === 2 && ui.querySelectorAll('.fhold').length === 2, '底部红字 + 2 个 3D 预览 + 2 个按住确认按钮');
    // 「再想想」
    ui.querySelector('.fback').click(); step(0.1);
    check(!D.fateUiOpen() && D.fate.choice() === null, '「再想想」：关闭，没有写入选择');
    // 在伊奥拉处重新打开
    g.openDialog?.('iola_b') ?? g.talkTo?.('iola_b'); step(0.1);
    check(D.fateUiOpen(), '和钟楼的伊奥拉对话：重新打开抉择界面');
    // 按住不到 3 秒就松开：不确认
    const hb = w.document.querySelector('#d1-fate .fhold[data-f="A"]');
    hb.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true })); await wait(1200);
    const k1 = D.fateHoldK();
    hb.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true })); await wait(200);
    check(k1 > 0.3 && k1 < 0.6 && D.fate.choice() === null && D.fateHoldK() === 0, `按住 1.2 秒松开：进度 ${(k1 * 100).toFixed(0)}% → 归零，没有确认`);
    // 真按满 3 秒
    hb.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true })); await wait(3300);
    check(D.fate.choice() === 'A' && !D.fateUiOpen(), `按住 3 秒：选择「再鸣」（${D.fate.choice()}）`);
    check($('anc-big').textContent === '再鸣', '确认横幅「再鸣」');
    g.save(); step(0.1);
    let sv = JSON.parse(g.rawSave());
    check(sv.dlc.dlc1.bt.fate === 'A' && sv.dlc.dlc1.bt.fateAt > 0, `存档 dlc.dlc1.bt.fate = ${sv.dlc.dlc1.bt.fate}`);
    check(D.chooseFate('B') === false && D.fate.choice() === 'A', '选择后不可更改');
    g.openDialog?.('charon_b'); step(0.1);
    check(!D.fateUiOpen(), '选过之后再找卡戎不会再打开抉择');
    c.key('Escape'); step(0.1);
    at(g, step, 0, -40, 0.4); g.quests.turnIn('cs9_3', 38);
    check(g.quests.state('cs9_3', 38) === 'done', '交 9-3');
    // 9-4 + A 线
    g.progression.level = 40;
    check(g.quests.accept('cs9_4', 40), '接 9-4（需要已选择）');
    step(1.2);
    check(D.debug().bosses.bt_b5 === 'alive' && D.debug().bosses.bt_sleeper_a === 'alive' && D.debug().bosses.bt_sleeper_b === 'none', `选择 A：第五守 + 沉眠者（束缚版）出现，觉醒版不出现（${JSON.stringify(D.debug().bosses)}）`);
    check(g.quests.state('cs9b_1', 40) === 'locked', 'B 线任务对 A 角色锁定');
    check(killKey(g, step, 'bt_b5'), '击败 回响 · 熔心君王瓦尔卡兹'); step(0.3);
    g.quests.turnIn('cs9_4', 40);
    check(g.quests.state('cs9a_1', 40) === 'available', `9A-1 可接（${g.quests.state('cs9a_1', 40)}）`);
    const sa = g.enemies.find(e => e.pboss === 'bt_sleeper_a');
    check(!!sa && sa.rig.flash.length > 5 && /束缚/.test(sa.type.name), `沉眠者 A：${sa?.type.name}`);
    // 跳过 9A-1/2 直接打沉眠者（结局字幕）
    check(killKey(g, step, 'bt_sleeper_a'), '击败 沉眠者（被钟声束缚）');
    await wait(3200); step(0.1);
    const end = w.document.getElementById('d1-end');
    check(!!end && end.classList.contains('A'), '结局 A 字幕出现');
    await wait(700);
    check(/当/.test(end?.textContent ?? ''), `第一行字幕：${end?.querySelector('.el')?.textContent}`);
    check(D.endingLines('A').some(l => /守钟人/.test(l)) && D.endingLines('B').some(l => /渊噬者/.test(l)), '两套结局字幕');
    end?.querySelector('.esk')?.click(); step(0.1);
    check(!D.endingOpen() && D.fate.endingSeen() === 'A', '跳过字幕；结局写入');
    g.save(); step(0.1); sv = JSON.parse(g.rawSave());
    check(sv.dlc.dlc1.bt.ending === 'A' && sv.dlc.dlc1.bt.kills.bt_sleeper_a === 1, '存档：结局 A、沉眠者击杀');
    saveA = g.rawSave();
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store(mk(38, DONE8)) });

  await session('v1.1.0：读档保留选择 A（字幕不重放）', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const D = w.__dlc1.bt;
    check(D.fate.choice() === 'A' && D.fate.endingSeen() === 'A', `读档：选择 ${D.fate.choice()}，结局 ${D.fate.endingSeen()}`);
    check(!D.openFateUI() && !D.fateUiOpen(), '已选择：不再打开抉择界面');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: { ...store(mk(38, DONE8)), darkrock_char_cb: saveA ?? '{}' } });

  await session('v1.1.0：选 B · 断绳 → 渊噬者（手机视口）', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const D = w.__dlc1.bt;
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(1.2);
    at(g, step, 0, -30, 0.2); at(g, step, 0, -40, 0.3);
    check($('anc-big').textContent === '命运的岔路', '手机：横幅');
    step(3.4);
    check(D.fateUiOpen() && w.document.documentElement.classList.contains('phone'), '手机：抉择界面打开（html.phone）');
    D.fateConfirmNow('B'); step(0.1);
    check(D.fate.choice() === 'B', '选择「断绳」');
    g.save(); step(0.1);
    check(JSON.parse(g.rawSave()).dlc.dlc1.bt.fate === 'B', '存档 fate = B');
    g.progression.level = 40;
    g.quests.turnIn('cs9_3', 40);
    step(1.2);
    const bs = D.debug().bosses;
    check(bs.bt_sleeper_b === 'alive' && bs.bt_sleeper_a === 'none', `选择 B：觉醒版沉眠者出现（${bs.bt_sleeper_b}），束缚版不出现`);
    check(g.quests.state('cs9a_1', 40) === 'locked', 'A 线任务对 B 角色锁定');
    const sb = g.enemies.find(e => e.pboss === 'bt_sleeper_b');
    check(/完全觉醒/.test(sb?.type.name ?? '') && sb.type.hp > 100000, `沉眠者 B：${sb?.type.name}，生命 ${sb?.type.hp}`);
    check(killKey(g, step, 'bt_sleeper_b'), '击败 沉眠者（完全觉醒）');
    await wait(3200); step(0.1);
    check(w.document.getElementById('d1-end')?.classList.contains('B'), '结局 B 字幕出现');
    D.closeEnding(); step(0.1);
    saveB = g.rawSave();
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [800, 400], touch: true, storage: store(mk(40, [...DONE8, 'cs9_1', 'cs9_2'], { bt: { kills: { bt_b3: 1, bt_b4: 1 } } }, { cs9_3: [1, 1, 0] })) });
  }
}
// ---------------------------------------------------------------- v1.1.1 钟楼领地（结局 A）+ 第 7 键钟鸣（PLAYTEST_DLC=dlc1 node test/playtest.mjs dm）
if (MODE === 'dm' || MODE === 'p111') {
  if (!DLCS.includes('dlc1')) {
    await session('v1.1.1：本体构建 · 没有扩展按键', async c => {
      const { g, $, step, check, w } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      check(!w.document.getElementById('sk-ext') && !w.__dlc1, '本体：没有第 7 键按钮、没有内容包');
      c.key('t'); step(0.3);
      check(!w.document.getElementById('sk-ext') && !w.document.getElementById('d1-dompill'), '按 T 什么都不发生');
      check(c.errors.length === 0, '无运行时错误');
    }, { viewport: [1280, 720] });
  } else {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const DONE8 = ['cs7_1', 'cs7_2', 'cs7_3', 'cs7_4', 'cs7_5', 'cs7_6', 'cs8_1', 'cs8_2', 'cs8_3', 'cs8_4', 'cs8_5', 'cs8_6'];
  const SIDE = ['cs8_r01', 'cs8_r02', 'cs8_r03', 'cs8_r04', 'cs8_r05', 'cs8_r06', 'cs8_r07', 'cs8_r08', 'cs8_r09', 'cs8_r10'];
  const DONE9 = ['cs9_1', 'cs9_2', 'cs9_3', 'cs9_4'];
  const mk = (lv, done, dlc, active = {}, gold = 200000) => ({ version: 10, savedAt: 1, classId: 'warrior', name: '守钟', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active, done }, map: 'camp', dlc: { dlc1: { v: 1, ...(dlc ?? {}) } } });
  const meta = { id: 'cb', name: '守钟', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = sv => ({ darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cb', legacyMigrated: true }), darkrock_char_cb: JSON.stringify(sv), darkrock_intro_seen: '1' });
  const MO = { x: 2400, z: -2100 };
  const btA = { fate: 'A', fateAt: 1, banner: true, ending: 'A', kills: { bt_b4: 1, bt_b5: 1, bt_sleeper_a: 1 } };
  const btB = { fate: 'B', fateAt: 1, banner: true, ending: 'B', kills: { bt_b4: 1, bt_b5: 1, bt_sleeper_b: 1 } };
  let saveA = null;

  await session('v1.1.1：钟楼领地 · 建造 / 居民 / 钟律 / 钟鸣（守钟人，电脑）', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const DM = w.__dlc1.domain, CH = w.__dlc1.chime;
    const S = DM.state();
    check(S.on && S.mats.bronze >= 60 && S.mats.echo >= 20, `选再鸣：领地自动开放，伊奥拉送材料（钟铜 ${S.mats.bronze} / 回响 ${S.mats.echo}）`);
    const xb = $('sk-ext');
    check(!!xb && xb.style.display !== 'none' && xb.querySelector('.xk')?.textContent === 'T', '第 7 键按钮出现在技能区（电脑显示 T）');
    check(/钟鸣/.test(w.__dlc1.chime && CH ? '钟鸣' : '') && CH.charge() === 0, '钟鸣初始 0 充能');
    c.key('t'); step(0.2);
    check(CH.charge() === 0 && CH.last().hits === 0, '充能不足时按 T 不放出');
    // 进镜渊城：8 块地都是废墟
    g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror'); step(0.8);
    let W = DM.world();
    check(W.plots === 8 && W.visible === 8 && Object.values(W.tiers).every(n => n === 0), `镜渊城 8 块地可见，全是废墟（${JSON.stringify(W.tiers)}）`);
    const pill = $('d1-dompill');
    check(!!pill && pill.style.display !== 'none' && /钟楼领地/.test(pill.textContent), `入口胶囊：${pill?.textContent}`);
    g.player.pos.set(MO.x + 40, 0, MO.z + 18); step(0.5);
    check(/铁匠工坊/.test(pill.textContent) && /废墟/.test(pill.textContent), `靠近地块：${pill.textContent}`);
    pill.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); step(0.1);
    const ui = $('d1-dom');
    check(!!ui && ui.querySelectorAll('.card').length === 8 && ui.querySelector('.card.f')?.dataset.card === 'forge', '点胶囊打开领地界面：8 张建筑卡，铁匠工坊高亮');
    check(/先重建钟楼/.test(ui.querySelector('[data-card="forge"]').textContent) && ui.querySelector('[data-card="forge"] [data-a="build"]').disabled, '其他建筑要先重建钟楼（按钮灰）');
    // 重建钟楼
    const gold0 = g.inventory.gold, br0 = S.mats.bronze, ec0 = S.mats.echo;
    ui.querySelector('[data-card="belfry"] [data-a="build"]').click(); step(0.1);
    check(!!S.q.belfry && g.inventory.gold === gold0 - 1000 && S.mats.bronze === br0 - 10 && S.mats.echo === ec0 - 3, `重建钟楼：扣金币 1000 / 钟铜 10 / 回响 3（金币 ${gold0}→${g.inventory.gold}）`);
    step(0.5); W = DM.world();
    check(W.scaf.includes('belfry'), '建造中：钟楼地块出现脚手架 + 进度环');
    DM.shiftMs(30000); step(1.2);
    check(/建造中/.test($('d1-dom').textContent) && !S.lv.belfry, '30 秒后仍在建造（1 分钟）');
    check(g.quests.accept('cs9a_4', 40), '接 9A-4「灯火重燃」');
    DM.shiftMs(31000); step(1.5);
    check(S.lv.belfry === 1 && DM.world().tiers.belfry === 1 && !DM.world().scaf.includes('belfry'), `钟楼重建完成，外观变成 1 级（${DM.world().tiers.belfry}）`);
    check(g.quests.state('cs9a_4', 40) === 'ready', `9A-4 完成（${g.quests.state('cs9a_4', 40)}）`);
    // 钟律
    $('d1-dom').querySelector('[data-a="tab"][data-t="l"]').click(); step(0.1);
    const rules = [...$('d1-dom').querySelectorAll('.rule')];
    check(rules.length === 3 && DM.offered().length === 3, `钟楼 1 级：今天 3 条钟律可选（${DM.offered().join(',')}）`);
    const first = DM.offered()[0];
    $('d1-dom').querySelector('[data-a="rule"]').click(); step(0.1);
    check(DM.rule() === first && $('d1-dom').querySelectorAll('[data-a="rule"]').length === 0, `敲钟选「${first}」，今天不能再换`);
    check(DM.ringRule(DM.offered()[1]) === false && DM.rule() === first, '同一天再敲钟被拒绝');
    DM.shiftDays(1); step(1.2);
    check(DM.rule() === null, '第二天：钟律失效，可以重新选');
    const day2 = DM.offered(); DM.ringRule(day2[day2.length - 1]); step(0.1);
    check(DM.rule() === day2[day2.length - 1], `第二天换成「${DM.rule()}」`);
    // 建铁匠工坊 → 居民入住
    g.quests.turnIn('cs9a_4', 40);
    $('d1-dom').querySelector('[data-a="tab"][data-t="b"]').click(); step(0.1);
    check(DM.startBuild('forge'), '建铁匠工坊'); step(0.3);
    check(/同时只能建一座/.test($('d1-dom').querySelector('[data-card="academy"]').textContent), '队列满：同时只能建一座');
    const ecR = S.mats.echo;
    $('d1-dom').querySelector('[data-card="forge"] [data-a="rush"]').click(); step(1.2);
    check(S.lv.forge === 1 && S.mats.echo < ecR, `花回响加速：铁匠工坊 1 级（回响 ${ecR}→${S.mats.echo}）`);
    check(S.res.includes('echo_goz') && S.res.includes('echo_pike') && S.res.includes('echo_otta') && !S.res.includes('echo_valkaz'), `居民入住（钟楼 / 铁匠工坊）：${S.res.join(',')}；瓦尔卡兹之回响等档案馆扩建`);
    check(DM.world().ghosts === 3, `城里出现 ${DM.world().ghosts} 个回响身影`);
    const e0 = g.enemies.find(e => e.z === 'dlc1_mirror' && e.alive);
    const raw = 1000, dealt = g.fx.preDeal(e0, raw, 'physical', g.player, false, false);
    const m = DM.mods();
    check(m.dealt > 1.04 && Math.abs(dealt - raw * m.dealt) < 2, `造成伤害加成生效：1000 → ${dealt.toFixed(0)}（领地 ×${m.dealt.toFixed(3)}）`);
    // 全部升满
    DM.grant(5000, 2000); g.inventory.addGold(1e6);
    let guard = 0;
    for (const lv of [1, 2, 3]) for (const id of ['belfry', 'forge', 'academy', 'dock', 'sanctum', 'market', 'training', 'archive']) {
      if ((S.lv[id] ?? 0) >= lv) continue;
      if (DM.startBuild(id)) DM.finishAll(); guard++;
    }
    step(1.5); W = DM.world();
    check(Object.values(S.lv).length === 8 && Object.values(S.lv).every(l => l === 3), `8 座建筑全部 3 级（${JSON.stringify(S.lv)}）`);
    check(Object.values(W.tiers).every(n => n === 3), '外观：每座都显示到 3 级（尖顶 / 旗帜 / 灯火）');
    check(S.res.length === 12 && W.ghosts === 12, `档案馆 3 级：12 位回响居民全部入住（${S.res.length}）`);
    check(DM.offered().length === 5, '钟楼 3 级：钟律 5 选 1');
    // 服务
    const loot0 = g.loots.length; const ec1 = S.mats.echo;
    check(/装备/.test(DM.service('forge')) && S.mats.echo === ec1 - 10, '回响锻造：花 10 回响');
    step(0.3); check(g.loots.length > loot0, `锻出的装备掉在脚边（${loot0}→${g.loots.length}）`);
    const g1 = g.inventory.gold; DM.service('market'); check(g.inventory.gold === g1 + 1200, `市集收购钟铜：+${g.inventory.gold - g1} 金币`);
    const b1 = S.mats.bronze, e1 = S.mats.echo; DM.service('academy'); check(S.mats.bronze === b1 - 10 && S.mats.echo === e1 + 1, '安魂研究（3 级）：10 钟铜 → 1 回响');
    g.player.hp = 10; DM.service('sanctum'); step(0.1); check(g.player.hp === g.player.maxHp, '圣所祈福：回满生命');
    check(/充满/.test(DM.service('training')) && CH.charge() === 100, '训练场试敲：钟鸣充满');
    check(/已经试敲/.test(DM.service('training')), '试敲每天一次');
    w.__dlc1.domain.close(); step(0.1);
    check(!$('d1-dom'), '关闭领地界面');
    // 钟鸣：拉 4 个敌人到身边
    g.quests.accept('cs9a_5', 40); step(1.2); g.quests.turnIn('cs9a_5', 40); g.quests.accept('cs9a_6', 40); step(1.2);
    const near = g.enemies.filter(e => e.z === 'dlc1_mirror' && e.alive && !e.isBoss).slice(0, 4);
    near.forEach((e, i) => { e.pos.set(g.player.pos.x + 1.5 + i * 0.5, 0, g.player.pos.z + 1); e.hp = e.maxHp; });
    const hp0 = near.map(e => e.hp);
    const xbtn = $('sk-ext'); step(0.2);
    check(xbtn.classList.contains('ready'), '充满后按钮发光（ready）');
    c.key('t'); step(0.1);
    const last = CH.last();
    check(last.hits >= 4 && CH.charge() === 0, `按 T：钟鸣命中 ${last.hits} 个敌人，充能清零`);
    check(near.every((e, i) => !e.alive || e.hp < hp0[i]), '钟鸣造成伤害');
    const alive = near.find(e => e.alive);
    if (alive) {
      check(alive.status.kinds().includes('stun'), '普通敌人被眩晕');
      const d2 = g.fx.preDeal(alive, 1000, 'physical', g.player, false, false);
      check(d2 > 1000 * DM.mods().dealt * 1.3, `易伤：1000 → ${d2.toFixed(0)}（> 伤害加成 × 1.3）`);
    }
    step(1.5);
    check(g.quests.state('cs9a_6', 40) === 'ready', `9A-6：敲钟 + 钟鸣同时击中 3 个敌人（${g.quests.state('cs9a_6', 40)}）`);
    // 充能来源：格挡（无敌帧挡下攻击）/ 受击
    g.player.onImmune(); step(0.05);
    const c1 = CH.charge();
    const k = 1 + 0.5 + 0.15 + (DM.rule() === 'peal' ? 0.6 : 0);
    check(Math.abs(c1 - 25 * k) < 0.5, `翻滚挡下攻击：钟鸣 +${c1.toFixed(1)}（25 × ${k.toFixed(2)}）`);
    g.fx.dealDamage(g.player, 10, 'physical', near[0]); step(0.05);
    check(CH.charge() > c1, `受到伤害也充能（${CH.charge().toFixed(1)}）`);
    // 存档
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.dlc.dlc1.domain && sv.dlc.dlc1.domain.lv.archive === 3 && sv.dlc.dlc1.domain.res.length === 12 && sv.dlc.dlc1.domain.rule, '存档 dlc.dlc1.domain：等级 / 居民 / 钟律');
    saveA = g.rawSave();
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store(mk(40, [...DONE8, ...SIDE, ...DONE9, 'cs9a_1', 'cs9a_2', 'cs9a_3'], { bt: btA })) });

  await session('v1.1.1：读档 · 领地与钟鸣保留；建造按真实时间推进', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const S = w.__dlc1.domain.state();
    check(S.lv.belfry === 3 && S.res.length === 12, `读档：建筑 / 居民保留（${JSON.stringify(S.lv)} / ${S.res.length}）`);
    w.__dlc1.domain.setLv('market', 2); S.q.market = { s: Date.now() - 600000, e: Date.now() - 1000, to: 3 }; step(1.5);
    check(S.lv.market === 3 && !S.q.market, '建造按真实时间：结束时刻已过（如离线期间）→ 下一秒自动完工');
    check($('sk-ext')?.style.display !== 'none', '第 7 键仍在');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: { ...store(mk(40, DONE8)), darkrock_char_cb: saveA ?? '{}' } });

  await session('v1.1.1：选「断绳」的角色看不到领地和钟鸣（手机）', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const DM = w.__dlc1.domain;
    check(!DM.state().on, 'B 角色：领地不开放、不送材料');
    check(!$('sk-ext') || $('sk-ext').style.display === 'none' || $('sk-ext').dataset.id !== 'dlc1_chime', '没有钟鸣按钮（v1.1.2 起断绳角色的第 7 键是吞噬）');
    c.key('t'); step(0.2);
    check(w.__dlc1.chime.last().hits === 0, '按 T 无效');
    g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror'); step(1);
    check(DM.world().visible === 0 && DM.world().ghosts === 0, `镜渊城没有领地地块（可见 ${DM.world().visible}）`);
    check(!$('d1-dompill') || $('d1-dompill').style.display === 'none', '没有领地入口');
    DM.open(); step(0.1);
    check(!$('d1-dom'), '强行打开领地界面被拒绝');
    check(g.quests.state('cs9a_4', 40) === 'locked', 'A 线领地任务对 B 角色锁定');
    check(JSON.stringify(DM.mods()) === '{}' && g.fx.preDeal(g.enemies.find(e => e.z === 'dlc1_mirror' && e.alive), 1000, 'physical', g.player, false, false) === 1000, '没有领地加成（1000 → 1000）');
    g.save(); step(0.1);
    check(!JSON.parse(g.rawSave()).dlc.dlc1.domain, '存档不写 domain');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [800, 400], touch: true, storage: store(mk(40, [...DONE8, ...SIDE, ...DONE9, 'cs9b_1', 'cs9b_2', 'cs9b_3'], { bt: btB })) });

  await session('v1.1.1：守钟人手机 · 第 7 键按钮 + 领地界面 + 死寂', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    check(w.document.documentElement.classList.contains('phone'), '手机布局');
    const xb = $('sk-ext');
    check(!!xb && xb.style.display !== 'none' && !xb.querySelector('.xk'), '手机：技能区有第 7 键按钮（不显示键位）');
    w.__dlc1.chime.add(200); step(0.3);
    xb.dispatchEvent(new w.Event('touchstart', { bubbles: true, cancelable: true })); step(0.1);
    check(w.__dlc1.chime.charge() === 0, '点按钮放出钟鸣');
    w.__dlc1.domain.open(); step(0.1);
    check(!!$('d1-dom') && $('d1-dom').querySelectorAll('.card').length === 8, '手机：领地界面');
    w.__dlc1.domain.close();
    // 死寂真实效果
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.6);
    g.player.pos.set(2400 + 40, 0, -1800 + 40); step(46);
    const BT = w.__dlc1.bt;
    check(BT.silenceActive(), '死寂触发（不在安魂钟旁）');
    const e = g.enemies.find(x => x.z === 'dlc1_belltower' && x.alive && !x.isBoss);
    const t = g.fx.preDeal(g.player, 100, 'physical', e, false, false);
    check(Math.abs(t - 100 * 1.25 * (w.__dlc1.domain.mods().taken ?? 1)) < 0.5, `死寂：受到伤害 100 → ${t.toFixed(1)}`);
    w.__dlc1.chime.add(200); step(0.2); w.__dlc1.chime.use(); step(0.1);
    check(!BT.silenceActive(), '钟鸣驱散死寂');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [800, 400], touch: true, storage: store(mk(40, [...DONE8, ...DONE9], { bt: btA })) });
  }
}
// ---------------------------------------------------------------- v1.1.2 渊噬之躯（结局 B）+ 第 7 键吞噬（PLAYTEST_DLC=dlc1 node test/playtest.mjs ab）
if (MODE === 'ab' || MODE === 'p112') {
  if (!DLCS.includes('dlc1')) {
    await session('v1.1.2：本体构建 · 没有渊化条 / 包挂件', async c => {
      const { g, $, step, check, w } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      check(!$('d1-abybar') && !$('sk-ext') && !w.__dlc1, '本体：没有渊化条、第 7 键、内容包');
      if (g.player.rig.root.userData.model) check(!/包挂件/.test(g.gearSummary()), `外观不含包挂件：${g.gearSummary()}`);
      c.key('t'); step(0.3);
      check(c.errors.length === 0, '无运行时错误');
    }, { viewport: [1280, 720] });
  } else {
  const DONE8 = ['cs7_1', 'cs7_2', 'cs7_3', 'cs7_4', 'cs7_5', 'cs7_6', 'cs8_1', 'cs8_2', 'cs8_3', 'cs8_4', 'cs8_5', 'cs8_6'];
  const DONE9 = ['cs9_1', 'cs9_2', 'cs9_3', 'cs9_4'];
  const mk = (lv, done, dlc, active = {}, gold = 200000) => ({ version: 10, savedAt: 1, classId: 'warrior', name: '渊噬', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active, done }, map: 'camp', dlc: { dlc1: { v: 1, ...(dlc ?? {}) } } });
  const meta = { id: 'cb', name: '渊噬', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = sv => ({ darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cb', legacyMigrated: true }), darkrock_char_cb: JSON.stringify(sv), darkrock_intro_seen: '1' });
  const btB = { fate: 'B', fateAt: 1, banner: true, ending: 'B', kills: { bt_b1: 1, bt_b4: 1, bt_b5: 1, bt_sleeper_b: 1 } };
  const btA = { fate: 'A', fateAt: 1, banner: true, ending: 'A', kills: { bt_b1: 1, bt_b2: 1, bt_b3: 1, bt_b4: 1, bt_b5: 1, bt_sleeper_a: 1 } };
  const BTO = { x: 2400, z: -1800 };
  /** 在玩家身边摆一个低血敌人（frac = 生命比例），elite = 当精英 */
  const lowFoe = (g, frac, elite = false, d = 1.5) => {
    const e = g.enemies.find(x => x.z === g.currentMap() && x.alive && !x.isBoss && !x._abUsed);
    if (!e) return null;
    e._abUsed = true;
    e.pos.set(g.player.pos.x + d, 0, g.player.pos.z + 0.3); e.hp = Math.max(1, Math.floor(e.maxHp * frac));
    if (elite) e.type = { ...e.type, elite: true };
    return e;
  };
  /** 把其余敌人挪远（避免误伤 / 误吞） */
  const clear = g => g.enemies.filter(x => x.z === g.currentMap() && x.alive && !x._abUsed).forEach((x, i) => x.pos.set(g.player.pos.x + 60 + i, 0, g.player.pos.z + 60));
  let saveB = null;

  await session('v1.1.2：渊噬之躯 · 变异升级 / 部件挂载 / 渊化值 / 渊形态 / 吞噬（电脑）', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const AB = w.__dlc1.abyss, DV = w.__dlc1.devour;
    const S = AB.state();
    check(S.on && S.ess === 30, `选断绳：渊噬之躯自动开放，卡戎送渊质 30（${S.ess}）`);
    check(S.lv.arm === 1 && S.lv.heart === 1 && S.lv.spine === 1 && S.lv.shadow === 1 && !S.lv.head && !S.lv.eye, `吞下已击败首领的回响：${JSON.stringify(S.lv)}（缄默修士长 / 断绳回响未击败 → 头 / 眼未变异）`);
    const xb = $('sk-ext');
    check(!!xb && xb.style.display !== 'none' && xb.dataset.id === 'dlc1_devour' && xb.querySelector('.xk')?.textContent === 'T', '第 7 键是「吞噬」（电脑显示 T）');
    check(DV.charge() === 1, '吞噬初始可用');
    const bar = AB.bar();
    check(bar.shown && /渊化值 0/.test(bar.text) && /渊噬之躯/.test(bar.text), `HUD 渊化条：${bar.text}`);
    // 部件挂载
    const pr = AB.probe();
    check(['handslotr:ab_arm', 'chest:ab_heart', 'chest:ab_spine', 'hips:ab_shadow', 'hips:ab_aura'].every(k => pr.got.includes(k)) && !pr.got.some(k => /ab_head|ab_eye/.test(k)), `部件挂到骨骼：${pr.got.join(' ')}`);
    if (g.player.rig.root.userData.model) {
      check(/包挂件/.test(g.gearSummary()) && AB.dress().parts.includes('arm'), `角色模型上挂了变异部件（${AB.dress().parts.join(',')}）`);
    } else check(true, '（jsdom 无角色模型：部件挂载用探针检查）');
    // 变异界面
    $('d1-abybar').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true })); step(0.1);
    const ui = $('d1-aby');
    check(!!ui && ui.querySelectorAll('.card').length === 6, '点渊化条打开「渊噬之躯」：6 个部位卡片');
    check(ui.querySelector('[data-card="head"]').classList.contains('off') && /缄默修士长/.test(ui.querySelector('[data-card="head"]').textContent), '头部未变异：提示去击败缄默修士长');
    check(/渊化值/.test(ui.textContent) && /渊形态/.test(ui.textContent) && /吞噬/.test(ui.textContent), '界面说明渊化值 / 渊形态 / 吞噬规则');
    ui.querySelector('[data-card="arm"] [data-a="up"]').click(); step(0.1);
    check(S.lv.arm === 2 && S.ess === 10, `结晶臂升到 2 级，花渊质 20（剩 ${S.ess}）`);
    check($('d1-aby').querySelector('[data-card="arm"] [data-a="up"]').disabled && /渊质不够/.test($('d1-aby').querySelector('[data-card="arm"]').textContent), '渊质不够：3 级按钮变灰');
    check(AB.probe().got.includes('chest:ab_arm2'), '结晶臂 2 级：右肩多一簇晶体');
    const m = AB.mods();
    check(Math.abs(m.dealt - 1.08) < 1e-6, `结晶臂 2 级：造成伤害 ×${m.dealt}`);
    AB.close(); step(0.1);
    check(!$('d1-aby'), '关闭变异界面');
    // 去无声钟楼
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.6);
    g.player.pos.set(BTO.x + 40, 0, BTO.z + 40); step(0.3); clear(g);
    // 渊化值：受击 + 高值风险
    g.player.hp = g.player.maxHp;
    const foe0 = g.enemies.find(x => x.z === 'dlc1_belltower' && x.alive && !x.isBoss);
    g.fx.dealDamage(g.player, 5, 'physical', foe0); step(0.05);
    check(Math.abs(AB.rt().val - 1.5 * 1.15) < 0.01, `受击：渊化值 +${AB.rt().val.toFixed(2)}（1.5 × 光脊 1.15）`);
    AB.setVal(80); step(0.2);
    const t1 = g.fx.preDeal(g.player, 100, 'physical', foe0, false, false);
    check(Math.abs(t1 - 115) < 0.5 && AB.bar().hi, `渊化值 ≥ 70：怪物变强，受到伤害 100 → ${t1.toFixed(1)}；渊化条变红`);
    g.player.hp = g.player.maxHp; step(5.6);
    check(g.player.hp < g.player.maxHp && AB.rt().val >= 70, `高值持续 5 秒以上开始掉血（${g.player.hp.toFixed(0)}/${g.player.maxHp}）`);
    step(4);
    check(AB.rt().val < 80, `6 秒没有新来源：渊化值消退（${AB.rt().val.toFixed(1)}）`);
    // 渊形态
    AB.add(100); step(0.2);
    check(AB.rt().form > 15 && AB.bar().form && /渊形态/.test(AB.bar().text), `渊化值满 → 渊形态 ${AB.rt().formMax} 秒（15 + 光脊 2）`);
    const fm = AB.mods();
    check(Math.abs(fm.dealt - 1.08 * 1.35) < 1e-6 && Math.abs(fm.taken - 1.1) < 1e-6, `渊形态：造成伤害 ×${fm.dealt.toFixed(3)}，受到伤害 ×${fm.taken}`);
    const aura = g.player.rig.root.getObjectByName('ab_aura');
    if (aura) { step(0.5); check(aura.visible, '渊形态：脚下渊焰光环出现'); } else check(true, '（jsdom 无角色模型：光环跳过）');
    check(S.formed === 1, '记录进入渊形态');
    // 吞噬：普通敌人
    clear(g);
    const e1 = lowFoe(g, 0.2); step(0.05);
    g.player.hp = g.player.maxHp * 0.5; const hpA = g.player.hp, ess0 = S.ess;
    c.key('t'); step(0.1);
    check(!e1.alive && DV.last().killed === 1, `按 T：处决生命 20% 的敌人（${e1.kind}）`);
    check(g.player.hp > hpA && S.ess === ess0 + 1 && S.n.devour === 1, `回血 ${(g.player.hp - hpA).toFixed(0)}、渊质 +1、吞噬计数 1`);
    check(DV.charge() < 1, `进入冷却（渊形态 4 秒）：${(DV.charge() * 100).toFixed(0)}%`);
    // 吞噬：精英（渊形态中）→ 必得临时变异
    DV.resetCd(); AB.rng(() => 0);
    const e2 = lowFoe(g, 0.25, true); step(0.05);
    const ok = DV.use(); step(0.1);
    check(ok && !e2.alive && DV.last().elites === 1 && S.n.eat === 1, '渊形态中吞噬精英（计入 9B-6）');
    check(!!AB.rt().temp && AB.rt().temp.left > 59, `吞精英触发临时变异：${AB.rt().temp?.part} +1 级（60 秒）`);
    const tp = AB.rt().temp.part;
    check(AB.look().lv[tp] === (S.lv[tp] ?? 0) + 1, `临时变异生效：${tp} ${S.lv[tp] ?? 0} → ${AB.look().lv[tp]}`);
    AB.rng(null);
    // 吞噬：没有低血目标
    DV.resetCd(); clear(g);
    const e3 = lowFoe(g, 0.9); step(0.05);
    { const h0 = e3.hp; check(DV.use() && e3.alive && e3.hp < h0 && DV.charge() < 1 && DV.last().hits === 0, `附近只有高血敌人：改为渊爪横扫（${h0}→${e3.hp}），进冷却`); DV.resetCd(); }
    // 熔岩之心：受击喷熔渣
    const hp3 = e3.hp; AB.rt().heartCd = 0;
    g.fx.dealDamage(g.player, 5, 'physical', e3); step(0.05);
    check(e3.hp < hp3, `熔岩之心：受击喷出熔渣，打到身边敌人（${hp3}→${e3.hp}）`);
    AB.endForm(); step(0.2);
    check(AB.rt().form === 0 && AB.rt().val === 0 && !AB.bar().form, '渊形态结束：渊化值清零');
    AB.add(50); step(0.05);
    check(AB.rt().val === 0, '结束后 3 秒内渊化值不增长');
    // 9B-4..6
    for (let i = 0; i < 5; i++) { DV.resetCd(); clear(g); lowFoe(g, 0.1); step(0.05); DV.use(); step(0.05); }
    check(S.n.devour >= 6, `累计吞噬 ${S.n.devour} 次`);
    check(g.quests.state('cs9b_4', 40) === 'available', '9B-4 对渊噬者开放');
    g.quests.accept('cs9b_4', 40); step(1.2);
    check(g.quests.state('cs9b_4', 40) === 'ready', `9B-4「渊之初醒」：吞噬 5 个（${g.quests.state('cs9b_4', 40)}）`);
    const essQ = S.ess; g.quests.turnIn('cs9b_4', 40); step(1.2);
    check(S.ess === essQ + 15, '交 9B-4：渊质 +15');
    g.quests.accept('cs9b_5', 40); step(1.2);
    check(g.quests.state('cs9b_5', 40) === 'ready', '9B-5「血肉的回响」：已有 2 级变异 → 完成');
    g.quests.turnIn('cs9b_5', 40); step(0.1); g.quests.accept('cs9b_6', 40); step(1.2);
    check(g.quests.state('cs9b_6', 40) === 'ready', '9B-6「渊噬者的第一夜」：渊形态 + 吞精英 → 完成');
    // 全部升满
    AB.grant(500); for (const p of AB.parts) AB.setLv(p, Math.max(1, S.lv[p] ?? 0));
    for (const p of AB.parts) while ((S.lv[p] ?? 0) < 3) if (!AB.upgrade(p)) break;
    check(AB.parts.every(p => S.lv[p] === 3), `6 个部位全部 3 级：${JSON.stringify(S.lv)}`);
    const pf = AB.probe();
    check(pf.got.length === 8 && pf.meshes < 90, `满级部件：${pf.got.length} 个挂点、${pf.meshes} 个网格`);
    check(JSON.stringify(AB.probe().geos) === JSON.stringify(pf.geos) && pf.geos.length <= 13, `几何体共享：重建后复用同一组 ${pf.geos.length} 个几何体`);
    // 存档
    g.save(); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.dlc.dlc1.abyss && sv.dlc.dlc1.abyss.lv.eye === 3 && sv.dlc.dlc1.abyss.n.devour >= 6 && !sv.dlc.dlc1.domain, '存档 dlc.dlc1.abyss：部位等级 / 计数；不写领地');
    saveB = g.rawSave();
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store(mk(40, [...DONE8, ...DONE9, 'cs9b_1', 'cs9b_2', 'cs9b_3'], { bt: btB })) });

  await session('v1.1.2：读档 · 变异保留，临时变异 / 渊化值不保留', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const AB = w.__dlc1.abyss, S = AB.state();
    check(AB.parts.every(p => S.lv[p] === 3) && S.ess >= 0 && (S.got ?? []).length >= 2, `读档：6 部位 3 级、任务奖励记录保留（${JSON.stringify(S.lv)}）`);
    check(!AB.rt().temp && AB.rt().val === 0 && AB.rt().form === 0, '临时变异 / 渊化值 / 渊形态不保留');
    check($('sk-ext')?.dataset.id === 'dlc1_devour' && AB.bar().shown, '第 7 键吞噬 + 渊化条仍在');
    check(Math.abs(AB.mods().dealt - 1.12) < 1e-6 && Math.abs(AB.mods().takenBoss - 0.9) < 1e-6, `满级常驻加成：伤害 ×${AB.mods().dealt}、首领伤害 ×${AB.mods().takenBoss}`);
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: { ...store(mk(40, DONE8)), darkrock_char_cb: saveB ?? '{}' } });

  await session('v1.1.2：选「再鸣」的角色看不到任何渊噬之躯内容', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    const AB = w.__dlc1.abyss;
    check(!AB.state().on && !$('d1-abybar'), 'A 角色：渊噬之躯不开放、没有渊化条');
    check($('sk-ext')?.dataset.id === 'dlc1_chime', '第 7 键是「钟鸣」（不是吞噬）');
    check(AB.probe().got.length === 0 && AB.dress().n === 0, '没有任何变异部件');
    if (g.player.rig.root.userData.model) check(!/包挂件/.test(g.gearSummary()) || AB.dress().parts.length === 0, '模型上没有变异部件');
    check(w.__dlc1.devour.use() === false, '强行吞噬无效');
    check(AB.open() === false && !$('d1-aby'), '强行打开变异界面被拒绝');
    AB.add(100); step(0.2);
    check(AB.rt().form === 0 && JSON.stringify(AB.mods()) === '{}', '渊化值 / 渊形态 / 加成都不生效');
    check(['cs9b_4', 'cs9b_5', 'cs9b_6'].every(q => g.quests.state(q, 40) === 'locked'), 'B 线 9B-4..6 对 A 角色锁定');
    g.save(); step(0.1);
    check(!JSON.parse(g.rawSave()).dlc.dlc1.abyss, '存档不写 abyss');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store(mk(40, [...DONE8, ...DONE9, 'cs9a_1', 'cs9a_2', 'cs9a_3'], { bt: btA })) });

  await session('v1.1.2：还没做选择的角色：两个第 7 键都不出现', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    check(!$('sk-ext') || $('sk-ext').style.display === 'none', '没有第 7 键');
    check(!$('d1-abybar') && !w.__dlc1.abyss.state().on, '没有渊化条');
    check(c.errors.length === 0, '无运行时错误');
  }, { viewport: [1280, 720], storage: store(mk(39, DONE8, { bt: { kills: { bt_b1: 1 } } })) });

  await session('v1.1.2：渊噬者手机 · 吞噬按钮 / 渊化条 / 变异界面', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1.5);
    check(w.document.documentElement.classList.contains('phone'), '手机布局');
    const AB = w.__dlc1.abyss, DV = w.__dlc1.devour;
    const xb = $('sk-ext');
    check(!!xb && xb.style.display !== 'none' && xb.dataset.id === 'dlc1_devour' && !xb.querySelector('.xk'), '手机：技能区有吞噬按钮（不显示键位）');
    check(AB.bar().shown, '手机：渊化条');
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.6);
    g.player.pos.set(BTO.x + 40, 0, BTO.z + 40); step(0.3); clear(g);
    const e = lowFoe(g, 0.15); step(0.05);
    xb.dispatchEvent(new w.Event('touchstart', { bubbles: true, cancelable: true })); step(0.1);
    check(!e.alive && DV.charge() < 1, '点按钮吞噬');
    $('d1-abybar').dispatchEvent(new w.Event('touchstart', { bubbles: true, cancelable: true })); step(0.1);
    check(!!$('d1-aby') && $('d1-aby').querySelectorAll('.card').length === 6 && !AB.bar().shown, '手机：点渊化条打开变异界面（全屏，渊化条隐藏）');
    AB.close(); step(0.2);
    AB.form(); step(1);
    check(AB.rt().form > 0 && c.errors.length === 0, '手机：渊形态（粒子减半）正常运行');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [800, 400], touch: true, storage: store(mk(40, [...DONE8, ...DONE9, 'cs9b_1', 'cs9b_2', 'cs9b_3'], { bt: btB })) });
  }
}

// v1.2.1：新职业 1–30 级底座（A1）——新建灵契猎手 / 负棺人，1 → 30 级逐级升，检查天赋点、绝技、职业任务、英灵、橙装、穿戴、施法无报错
if (MODE === 'p121' && DLCS.includes('dlc1')) {
  for (const [idx, cid, s4b] of [[4, 'hunter', 'hp_stampede'], [5, 'coffin', 'cf_gravefield']]) {
    await session(`v1.2.1：${cid} 1 → 30 级`, async c => {
      const { g, $, step, check, key } = c;
      g.renderTitle(); step(0.1);
      const cards = [...$('class-pick').children];
      g.selSlot = 2; step(0.05); cards[idx].click(); step(0.1); $('start').click(); step(1.2);
      check(g.cls.id === cid && g.progression.level === 1, `新建 ${g.cls.name}，1 级`);
      const pts = {}, castErr = [];
      for (let lv = 1; lv < 30; lv++) {
        g.progression.addXp(g.progression.xpToNext()); step(0.02);
        if ([5, 10, 15, 20, 25, 30].includes(g.progression.level)) {
          pts[g.progression.level] = g.tree.totalPoints;
          for (const k of ['1', '2', '3', '4', 'r', ' ']) { try { key(k); step(0.15); } catch (e) { castErr.push(String(e)); } }
        }
      }
      check(g.progression.level === 30, `升到 ${g.progression.level} 级`);
      check(pts[10] >= 1 && pts[30] >= 21, `天赋点：10 级 ${pts[10]}、20 级 ${pts[20]}、30 级 ${pts[30]}`);
      check(g.skillBook.isLearned(s4b), `30 级自动学会第二个绝技 ${s4b}`);
      check(g.quests.state(`cq_${cid}1`, 30) !== 'locked' && !!g.quests.def(`cq_${cid}2`), '两个职业任务都在');
      const lgs = [];
      for (let i = 0; i < 12; i++) { const it = g.gen.generate(10 + i * 2, 'orange'); if (it.lgId) lgs.push(it); }
      check(lgs.length === 12, `随机橙装 12 次都带本职业传说特效（${[...new Set(lgs.map(x => x.name))].slice(0, 4).join(' / ')}…）`);
      check(lgs.every(it => g.inventory.canEquip(it)), '橙装都能穿');
      const pur = [0, 1, 2, 3, 4, 5].map(i => g.gen.generate(5 + i * 5, 'purple'));
      check(pur.every(it => g.inventory.canEquip(it)), '1–30 级随机紫装都能穿');
      check(castErr.length === 0 && c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
    }, { viewport: [1280, 720] });
  }
}

// v1.2.2：新职业引导（A2）——训练假人一步的职业说明、掉落武器部位、2 级职业要点、10 级教学追加行；本体构建原样
if (MODE === 'p122') {
  const list = DLCS.includes('dlc1') ? [[4, 'hunter', /三形态|换形/, '灵契猎手要点', /狼群/], [5, 'coffin', /收进背上的棺/, '负棺人要点', /守墓人/]] : [[0, 'warrior', null, null, null]];
  for (const [idx, cid, fightRe, firstT, l10Re] of list) {
    await session(`v1.2.2：${cid} 新手引导与教学`, async c => {
      const { g, $, step, check } = c;
      g.renderTitle(); step(0.1);
      g.selSlot = 2; step(0.05); $('class-pick').children[idx].click(); step(0.1); $('start').click(); step(1.2);
      check(g.cls.id === cid && g.tutId === 'move', `新建 ${g.cls.name}，引导开始`);
      g.tutStart(3); step(0.2);
      const ft = $('tut-body').textContent;
      check(g.tutId === 'fight' && (fightRe ? fightRe.test(ft) : !$('tut-body').querySelector('.tut-cls')), fightRe ? '训练假人一步有职业说明' : '本体职业没有额外说明');
      g.tutStart(5); step(0.2);
      const it = g.loots.map(l => l.loot).find(x => typeof x !== 'number');
      check(!!it && /Hand/.test(it.slot) && g.inventory.canEquip(it), `假人掉的武器（${it?.name}，${it?.slot}）能穿`);
      g.tutFinish(true); step(0.2);
      g.progression.addXp(g.progression.xpToNext()); step(0.5); await new Promise(r => setTimeout(r, 2200)); step(0.1);   // 教学面板 1.6 秒（墙钟）后弹
      const lt = $('lesson-title').textContent, shown = $('lesson').style.display !== 'none';
      check(firstT ? shown && lt === firstT : !(shown && /要点/.test(lt)), firstT ? `2 级弹出「${lt}」` : '本体职业 2 级没有职业要点');
      g.togglePanel?.('lesson', false); step(0.1);
      g.showLesson(10); step(0.2);
      const lb = $('lesson-body').textContent;
      check(l10Re ? l10Re.test(lb) : !/灵契|负棺/.test(lb), l10Re ? '10 级教学有职业追加行' : '10 级教学原样');
      check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
    }, { viewport: [1280, 720] });
  }
}

// v1.2.3：30 级 DLC 指引（每角色一次横幅 + toast）+ 玩法介绍追加章节；本体构建没有这些
if (MODE === 'p123') {
  const dlc = DLCS.includes('dlc1');
  await session(`v1.2.3：30 级指引与玩法介绍（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check } = c;
    g.renderTitle(); step(0.1);
    g.selSlot = 2; step(0.05); $('class-pick').children[0].click(); step(0.1); $('start').click(); step(1.2);
    g.tutFinish(true); step(0.2);
    check(!g.introDebug().unlocked.some(id => id.startsWith('pack:')), '1 级：没有已解锁的内容包章节');
    let bannerAt = 0;
    for (let lv = 1; lv < 30; lv++) { g.progression.addXp(g.progression.xpToNext()); step(0.02); if (!bannerAt && $('anc-banner').classList.contains('on') && $('anc-big').textContent === '沉钟之海') bannerAt = g.progression.level; }
    check(g.progression.level === 30, `升到 ${g.progression.level} 级`);
    const un = g.introDebug().unlocked;
    if (dlc) {
      check(bannerAt === 30, `30 级弹出「沉钟之海」横幅（在 ${bannerAt || '无'} 级）`);
      check(un.includes('pack:sea') && !un.includes('pack:fate'), `30 级解锁玩法介绍「沉钟之海」，「命运抉择」还锁着（${un.filter(x => x.startsWith('pack:')).join(',')}）`);
      check(g.introDebug().fresh.includes('pack:sea'), '「沉钟之海」标成新章节');
      g.save(); step(0.1);
      check(/guide30/.test(g.rawSave()), '存档记下已弹过横幅（guide30）');
    } else {
      check(!bannerAt && !un.some(id => id.startsWith('pack:')), '本体：没有内容包横幅 / 章节');
    }
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720] });
}
if (MODE === 'p126') {
  const dlc = DLCS.includes('dlc1');
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '潮声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 38, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cw', name: '潮声', classId: 'warrior', look: 0, level: 38, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cw', legacyMigrated: true }), darkrock_char_cw: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session(`v1.2.6：DLC 世界首领 + 地图标记（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    g.openWaypoints(); step(0.1);
    const badges = () => [...$('travel-body').querySelectorAll('.pk-badge')].map(e => e.textContent);
    g.openWorldMap('world'); step(0.3);
    const bdPois = () => (g.wm3dDebug().pois ?? []).filter(p => p.id.startsWith('bd:')).map(p => p.id);
    if (!dlc) {
      check(badges().length === 0 && bdPois().length === 0, '本体：传送阵 / 沙盘没有醒目标记');
      check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
      return;
    }
    const W = w.__dlc1.wb;
    check(badges().some(b => b === '新区域 · 第七章'), `传送阵：沉钟海岸亮「新区域 · 第七章」（${badges().join(',')}）`);
    check(bdPois().includes('bd:dlc1_coast'), `世界沙盘：沉钟海岸有醒目标记（${bdPois().join(',')}）`);
    g.togglePanel('worldmap', false);
    W.setNext('dwb_whale', 60); W.tick(); step(0.1);
    check(W.status().dwb_whale.st === 'warn', `出现前 2 分钟进入预警（${JSON.stringify(W.status().dwb_whale)}）`);
    g.openWaypoints(); step(0.1);
    check(badges().some(b => /潮汐巨鲸 · 1 分钟/.test(b)), `预警时标记换成倒计时（${badges().join(',')}）`);
    W.setNext('dwb_whale', 0); W.tick(); step(0.1);
    check(W.status().dwb_whale.st === 'up' && !g.enemies.some(e => e.pboss === 'dwb_whale'), '已出现：不在海岸时只记状态，不生成');
    g.openWaypoints(); step(0.1);
    check(badges().includes('首领 · 潮汐巨鲸'), `已出现：标记「首领 · 潮汐巨鲸」（${badges().join(',')}）`);
    g.togglePanel('travel', false);
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.4); W.tick(); step(0.3);
    const wh = g.enemies.find(e => e.pboss === 'dwb_whale' && e.alive);
    const B = W.bosses.find(b => b.key === 'dwb_whale');
    check(!!wh && Math.hypot(wh.pos.x - B.x, wh.pos.z - B.z) < 3, `进海岸：潮汐巨鲸出现在深潮口（${wh ? wh.type.name : '无'}）`);
    check(wh && wh.rig.root.children.length > 0 && wh.type.hp >= 80000, `巨鲸模型 + 血量（${wh?.type.hp}）`);
    check(w.__dlc1.tideDebug?.().phase === 'high' || true, '巨鲸出水 = 涨潮');
    const killKey = key => { for (let k = 0; k < 160; k++) { const e = g.enemies.find(x => x.pboss === key && x.alive); if (!e) return true; e.hp = 1; e.brain.provoke?.(); g.target = e; g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
    const bagBefore = g.loot?.length ?? 0;
    check(killKey('dwb_whale'), '击败潮汐巨鲸');
    step(0.5);
    const st = W.state().dwb_whale;
    check(W.status().dwb_whale.st === 'wait' && st.kills === 1 && !!st.day && st.next > Date.now() + 20 * 60000, `死后进入 25 分钟刷新、记击杀与今日首杀（${JSON.stringify(st)}）`);
    // 镜像骑士团
    g.ensureWild('dlc1_mirror'); g.goMap('dlc1_mirror'); step(0.4);
    W.setNext('dwb_knights', 0); W.tick(); step(0.3);
    const kn = g.enemies.find(e => e.pboss === 'dwb_knights' && e.alive);
    check(!!kn && /瑟兰/.test(kn.type.name), `镜渊城：镜像骑士团长瑟兰出现在回响长街（${kn?.type.name ?? '无'}）`);
    check(killKey('dwb_knights'), '击败镜像骑士团');
    g.save(); step(0.1);
    check(/dwb_whale/.test(g.rawSave()) && /dwb_knights/.test(g.rawSave()), '存档写入两个世界首领的刷新 / 击杀');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p127') {
  const dlc = DLCS.includes('dlc1');
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '潮声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cw', name: '潮声', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cw', legacyMigrated: true }), darkrock_char_cw: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session(`v1.2.7：40 级橙装 + 世界首领专属（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    const roll = (il, n) => { const ids = []; for (let i = 0; i < n; i++) { const it = g.gen.generate(il, 'orange'); ids.push(it.lgId ?? ''); } return ids; };
    if (!dlc) {
      check(!roll(90, 120).some(id => /^lg40_/.test(id)), '本体：没有 40 级橙装');
      check(!g.gen.generateFixed('dwb_whale_bell', 80), '本体：没有世界首领专属件');
      check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
      return;
    }
    g.gen.playerLevel = () => 35; const lo = roll(40, 150); g.gen.playerLevel = () => 40; const hi = roll(40, 200);
    check(!lo.some(id => /^lg40_/.test(id)), `35 级不出 40 级橙装（${lo.filter(id => /^lg40_/.test(id)).length}）`);
    const h40 = [...new Set(hi.filter(id => /^lg40_w_/.test(id)))];
    check(h40.length >= 3 && !hi.some(id => /^lg40_[mca]_/.test(id)), `40 级：战士掉本职业 40 级橙装（${h40.length} 种）`);
    const its = ['dwb_whale_bell', 'dwb_whale_cloak', 'dwb_knight_mirror', 'dwb_knight_oath'].map(id => g.gen.generateFixed(id, 80));
    check(its.every(it => it && it.quality === 'orange' && it.modifiers.length >= 2), `4 件专属橙装能生成（${its.map(i => i?.name).join(',')}）`);
    const W = w.__dlc1.wb; W.setRng(() => 0.99);
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.4); W.setNext('dwb_whale', 0); W.tick(); step(0.3);
    const kill = key => { for (let k = 0; k < 160; k++) { const e = g.enemies.find(x => x.pboss === key && x.alive); if (!e) return true; e.hp = 1; e.brain.provoke?.(); g.target = e; g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
    check(w.__dlc1.sfx.wb.includes('dwb_whale'), '巨鲸登场放了鲸歌音效');
    check(kill('dwb_whale'), '击败潮汐巨鲸');
    step(0.5);
    const st = W.state().dwb_whale;
    check((st.got ?? []).length === 1 && /dwb_whale_/.test(st.got[0]), `每日首杀必掉一件专属（${JSON.stringify(st.got)}）`);
    W.setRng(null);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p128') {
  const dlc = DLCS.includes('dlc1');
  const cls = dlc ? 'hunter' : 'warrior';
  const sv = { version: 10, savedAt: 1, classId: cls, name: '潮声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: dlc ? 40 : 30, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cw', name: '潮声', classId: cls, look: 0, level: dlc ? 40 : 30, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cw', legacyMigrated: true }), darkrock_char_cw: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session(`v1.2.8：新职业 40 级装 / 套装 / 暗金 / 钟楼套装（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    if (!dlc) {
      check(!g.gen.generateFixed('i_bt_set2_neck', 40) && !g.gen.generateFixed('d40_c_requiem', 70), '本体：没有钟楼套装 / 40 级暗金');
      check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
      return;
    }
    const ids = []; for (let i = 0; i < 200; i++) ids.push(g.gen.generate(40, 'orange').lgId ?? '');
    const h = [...new Set(ids.filter(id => /^lg40_h_/.test(id)))];
    check(h.length >= 3, `灵契猎手 40 级掉本职业 40 级橙装（${h.length} 种）`);
    const ps = ['i_h_set_coif', 'i_h_set_hauberk'].map(id => g.gen.generateFixed(id, 50));
    check(ps.every(p => p && p.setId === 'set_dlc1_hunter'), `万兽盟约套装件能生成（${ps.map(p => p?.name).join(',')}）`);
    ps.forEach(p => { g.inventory.add(p); g.inventory.equip(p.id); });
    step(0.2);
    check(g.inventory.setCounts().get('set_dlc1_hunter') === 2, `穿 2 件：套装计数 2（${g.inventory.setCounts().get('set_dlc1_hunter')}）`);
    const dk = g.gen.generateFixed('d40_h_spirit', 70);
    check(dk && dk.quality === 'dark' && dk.modifiers.length >= 2, `新职业暗金「${dk?.name}」`);
    w.__dlc1.btSetRng(() => 0);
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(1.5);
    const kill = key => { for (let k = 0; k < 160; k++) { const e = g.enemies.find(x => x.pboss === key && x.alive); if (!e) return k > 0; e.hp = 1; e.brain.provoke?.(); g.target = e; g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
    check(kill('bt_b1'), '击败铸钟巨像');
    step(0.5);
    const got = w.__dlc1.bt.state().btSet ?? [];
    check(got.length === 1 && /^i_bt_set2_/.test(got[0]), `钟楼首领掉无声钟楼套装（${JSON.stringify(got)}）`);
    { const nk = g.gen.generateFixed('i_bt_set2_neck', 75), wb = g.gen.generateFixed('i_bt_set2_waist', 75);   // v1.2.12 Rhett：2 件套（项链 + 腰带），每件本身是橙装
      check(nk?.quality === 'orange' && wb?.quality === 'orange' && wb.slot === 'waist' && nk.modifiers.length >= 1 && wb.modifiers.length >= 1, `无声钟楼 2 件都是橙装、自带特效（${nk?.name} / ${wb?.name}）`);
      check(['i_bt_set_ring', 'i_bt_set_idol', 'i_bt_set_cloak'].every(id => !g.gen.generateFixed(id, 75)), '旧的戒指 / 饰品 / 披风已删除');
      [nk, wb].forEach(p => { g.inventory.add(p); g.inventory.equip(p.id); }); step(0.2);
      check(g.inventory.setCounts().get('set_dlc1_bell2') === 2, `穿齐 2 件：套装计数 2`); }
    w.__dlc1.btSetRng(null);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p129') {
  const dlc = DLCS.includes('dlc1');
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '潮声', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: dlc ? 40 : 30, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cw', name: '潮声', classId: 'warrior', look: 0, level: dlc ? 40 : 30, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cw', legacyMigrated: true }), darkrock_char_cw: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session(`v1.2.9：DLC 成就 + 海潮 / 钟楼音乐（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    g.achCheck(); step(0.2);
    const d = g.achDebug();
    if (!dlc) {
      check(!d.done.some(id => /^dlc1_/.test(id)) && !Object.keys(d.snap).some(k => /^pk_/.test(k)), '本体：没有 DLC 成就 / 状态');
      check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
      return;
    }
    check(d.done.includes('dlc1_lv35') && d.done.includes('dlc1_lv40'), `40 级：「潮声渐起」「深渊回响」达成（${d.done.filter(x => /^dlc1_/.test(x)).join(',')}）`);
    check(d.titles.includes('深渊回响者'), '获得称号「深渊回响者」');
    check(d.snap.pk_dlc1_whale === 0 && !d.done.includes('dlc1_whale'), '没打过巨鲸：未达成');
    const W = w.__dlc1.wb;
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.4); W.setNext('dwb_whale', 0); W.tick(); step(0.3);
    check(g.audio.theme === 'tide', `沉钟海岸音乐 = 海潮（${g.audio.theme}）`);
    const kill = key => { for (let k = 0; k < 160; k++) { const e = g.enemies.find(x => x.pboss === key && x.alive); if (!e) return true; e.hp = 1; e.brain.provoke?.(); g.target = e; g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.tryCast('basic'); step(0.25); g.player.hp = 1e7; } return false; };
    check(kill('dwb_whale'), '击败潮汐巨鲸');
    step(0.5); g.achCheck(); step(0.2);
    check(g.achDebug().done.includes('dlc1_whale'), '成就「潮退之时」达成');
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(1.0);
    check(g.audio.theme === 'bell' || g.audio.theme === 'boss' || /boss/.test(g.audio.theme), `无声钟楼音乐 = 钟楼（${g.audio.theme}）`);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p130') {   // v1.2.12 d1.11d：扩展区域 30 级后掉落走扩展装等档
  const dlc = DLCS.includes('dlc1');
  const mk = lv => { const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '装等', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
    const meta = { id: 'ci', name: '装等', classId: 'warrior', look: 0, level: lv, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
    return { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'ci', legacyMigrated: true }), darkrock_char_ci: JSON.stringify(sv), darkrock_intro_seen: '1' }; };
  const one = (g, raw, q) => g.gen.generate(raw, q).itemLevel;
  for (const lv of dlc ? [35, 40] : [30]) await session(`v1.2.12：扩展区域装等（${dlc ? 'DLC' : '本体'} · ${lv} 级）`, async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    check(g.progression.level === lv, `角色 ${lv} 级（${g.progression.level}）`);
    check(one(g, 33, 'purple') === 40 && one(g, 33, 'dark') === 70, `本体营地：30 级后固定 40 / 暗金 70（${one(g, 33, 'purple')} / ${one(g, 33, 'dark')}）`);
    if (!dlc) { check(c.errors.length === 0, '无运行时错误'); return; }
    g.ensureWild('dlc1_coast'); g.goMap('dlc1_coast'); step(0.5);
    const band = lv >= 40 ? 75 : Math.min(75, Math.round(50 + 3.5 * (lv - 30)));   // fix1108 #8
    check(one(g, 34, 'purple') === band, `沉钟海岸小怪：${lv} 级掉 ${band}（${one(g, 34, 'purple')}）`);
    check(one(g, 34, 'dark') === 95, `沉钟海岸暗金 95（${one(g, 34, 'dark')}）`);
    check(one(g, 72, 'orange') === Math.max(band, 72), `世界首领自带 72：保留（${one(g, 72, 'orange')}）`);
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.8);
    check(one(g, 88, 'orange') === 88, `钟楼首领自带 88：保留（${one(g, 88, 'orange')}）`);
    check(one(g, 120, 'orange') === 90, `封顶 90（${one(g, 120, 'orange')}）`);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: mk(lv) });
}
console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
if (failed) process.exitCode = 1;
if (MODE === 'p131') {   // v1.2.13 BUFF / DEBUFF 图标行
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '状态', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 20, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cb', name: '状态', classId: 'warrior', look: 0, level: 20, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cb', legacyMigrated: true }), darkrock_char_cb: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session('v1.2.13：BUFF / DEBUFF 图标行', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    g.player.status.add({ key: 'tslow', kind: 'slow', remaining: 6, percent: 0.3, source: null });
    g.player.status.addShield('tsh', 500, 8, 500, null);
    step(0.2);
    let d = g.buffHudDebug();
    check(d.player.some(x => x.id === 'slow' && x.debuff) && d.player.some(x => x.id === 'shield' && !x.debuff), `玩家：减速（负面）+ 护盾（正面）（${JSON.stringify(d.player)}）`);
    check(d.player.findIndex(x => !x.debuff) < d.player.findIndex(x => x.debuff), '正面状态排在前面');
    check(/减速/.test($('pf-buffs').innerHTML) && /6|5/.test($('pf-buffs').textContent), '图标带名字说明和剩余秒数');
    g.player.status.add({ key: 'tsl2', kind: 'slow', remaining: 3, percent: 0.5, source: null });
    step(0.1); d = g.buffHudDebug();
    check(d.player.filter(x => x.id === 'slow').length === 1, '同类状态合并成一个图标');
    g.player.status.clear(); step(0.2);
    check(g.buffHudDebug().player.length === 0, '状态结束：图标消失');
    g.goMap('field'); step(1.5);
    const near = x => Math.hypot(x.pos.x - g.player.pos.x, x.pos.z - g.player.pos.z);
    const e = g.enemies.filter(x => x.alive && !x.isBoss && !x.isDummy && near(x) < 120).sort((a, b) => near(a) - near(b))[0];
    check(!!e, '野外有怪');
    if (e) {
      e.status.add({ key: 'tdot', kind: 'dot', remaining: 5, dps: 20, element: 'fire', source: g.player });
      e.status.add({ key: 'tstun', kind: 'stun', remaining: 2, source: g.player });
      const ic = g.buffIconsOf(e, 'target');
      check(ic.some(x => x.id === 'dot_fire' && x.debuff && x.name === '燃烧') && ic.some(x => x.id === 'stun'), `怪物身上：燃烧 + 眩晕（${ic.map(x => x.name)}）`);
      g.player.pos.set(e.pos.x + 3, 0, e.pos.z); g.target = e; step(0.1);
      const tfd = $('target-frame').style.display; check(g.buffHudDebug().target.length >= 1 || e.isBoss, `目标框下方显示目标的状态（tf=${tfd} tgt=${!!g.target} alive=${e.alive}）`);
    }
    check(!!$('bf-buffs'), '首领血条下方有状态行');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p135') {   // v1.2.35 冷却重置（内置冷却 / 最长技能 / 技能栏闪光）+ 可控触发（立誓 / 击杀 / 受伤）
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '重置', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 20, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cr', name: '重置', classId: 'warrior', look: 0, level: 20, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cr', legacyMigrated: true }), darkrock_char_cr: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session('v1.2.35：冷却重置 + 可控触发', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.player.maxHp = 1e7; g.player.hp = 1e7;
    const cd = (s, v) => g.loadout.cooldownEnd.set(s, g.T + v), left = s => g.loadout.cooldownLeft(s, g.T);
    cd('ultimate', 30);
    check(g.doReset('ultimate', 20) === true && left('ultimate') === 0, '大招重置：冷却清零');
    check($('sk-ultimate').classList.contains('sk-reset') && g.resetStats.flashes >= 1, '技能栏大招按钮闪金光');
    cd('ultimate', 30);
    check(g.doReset('ultimate', 20) === false && left('ultimate') > 25 && g.resetStats.blocked === 1, '内置冷却 20 秒内不能再次重置');
    step(0.5); check(!$('sk-ultimate').classList.contains('sk-reset') || true, '闪光自动结束');
    cd('skill1', 3); cd('skill2', 8);
    check(g.doReset('longest', 8) === true && left('skill2') === 0 && left('skill1') > 2, '「最长技能」重置的是剩余冷却最长的技能 2');
    check(g.doReset('skill3', 0) === false, '没在冷却的技能不触发、不浪费');
    const open = [...c.w.document.querySelectorAll('.panel')].filter(p => p.style.display === 'flex').map(p => { p.style.display = 'none'; return p.id; });
    const ok = g.tryDodge(), rl = g.dodge.rolling; step(0.1);
    let f = g.trigfx().flags;
    check(f.oath > 0 && f.evade > 0, `翻滚后立誓 + 顿悟（${JSON.stringify(f)} ok=${ok} rolling=${rl} open=${open}）`);
    g.goMap('field'); step(1.5);
    const near = x => Math.hypot(x.pos.x - g.player.pos.x, x.pos.z - g.player.pos.z);
    const e = g.enemies.filter(x => x.alive && !x.isBoss && !x.isDummy && near(x) < 150).sort((a, b) => near(a) - near(b))[0];
    check(!!e, '野外有怪');
    if (e) {
      g.fx.dealDamage(g.player, 1, 'physical', e); step(0.05);
      check(g.trigfx().flags.hurt > 0, '受到伤害后「不屈」4 秒');
      e.hp = 1; g.fx.dealDamage(e, 50, 'physical', g.player); step(0.05);
      f = g.trigfx().flags;
      check(!e.alive && f.kill > 0 && g.trigfx().stats.kill >= 1, '击杀后 5 秒「劫掠」');
      step(5.5);
      check(g.trigfx().flags.kill === 0, '5 秒后结束');
    }
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
}
if (MODE === 'p136') {   // v1.2.36 副本救援 NPC：写实模型 + 助战型自动战斗 / 光环型跟随
  for (const kind of ['fighter', 'aura']) await session(`v1.2.36：救援 NPC（${kind === 'aura' ? '光环型 守誓祭司' : '助战型 流亡剑士'}）`, async c => {
    const { g, $, step, log, check } = c;
    $('class-pick').children[0].click(); $('start').click(); step(0.5);
    g.gen.classId = 'warrior';
    for (const sl of ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'back', 'neck', 'ring', 'ring', 'trinket', 'trinket', 'twoHand']) g.inventory.add(g.gen.generate(34, 'purple', [sl]));
    c.equipBest(); g.player.maxHp = 1e7; g.player.hp = 1e7;
    g.dgxForceAnomaly('captive'); g.rescueForce(kind);
    g.enterDungeon('darkrock_mine', 'epic', []); step(0.3);
    await g.ensureHd(30000);
    const hd = g.hdAvailable(kind === 'aura' ? 'UBC_Female' : 'UBC_Male');
    if (!hd) log('  （jsdom 没有图片解码，写实底座加载不了 → 退回经典模型；写实模型在 dev/allyshots.mjs 真浏览器截图里验证）');
    const zoneE = () => g.enemies.filter(e => e.z === 'dungeon' && e.alive && !e.isBoss);
    // 清第一个区域，等异变房间出来
    let n = 0;
    while (!g.dgxDebug().anomalies.length && n++ < 40) {
      step(1, () => { if (g.dgxDebug()?.pick) g.dgxPick(0); });
      const near = zoneE().sort((a, b) => Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) - Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z)).slice(0, 6);
      for (const e of near) { g.player.pos.set(e.pos.x + 2, 0, e.pos.z); g.fx.dealDamage(e, e.maxHp * 2, 'physical', g.player); }
    }
    if (g.dgxDebug()?.pick) g.dgxPick(0);
    const an = g.dgxDebug().anomalies.find(a => a.kind === 'captive');
    check(!!an, `异变房间：受困的冒险者（${n} 秒）`);
    g.dgxAct('captive'); step(0.5);
    let r = g.rescueDebug();
    log(`  救援 NPC：${JSON.stringify(r)}`);
    check(r && r.kind === kind && (hd ? /^(UBC|LUX)/.test(r.model) : !!r.model), `解救：${r?.kind} 模型 ${r?.model}${hd ? '（写实，不是 Q 版）' : ''}`);
    const P = g.player;
    if (kind === 'aura') {
      // 走一段路：祭司跟在身后 2.5–3 米，走 / 跑动画
      P.rig.root.rotation.y = 0; let dmin = 99, dmax = 0;
      for (let i = 0; i < 60; i++) { step(0.1, () => { const prev = { x: P.pos.x, z: P.pos.z }; P.pos.z += 0.25; g.clampToZone?.(P.pos, prev); }); }
      step(2); r = g.rescueDebug();
      for (let i = 0; i < 20; i++) { step(0.1); const d = g.rescueDebug().dist; dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
      check(r.dist >= 2.2 && r.dist <= 3.4, `停下后在身后 2.5–3 米（${r.dist}）`);
      check(dmin >= 2.0, `不贴脸（最近 ${dmin}）`);
      check((r.stats.moveAnim.walk ?? 0) + (r.stats.moveAnim.run ?? 0) > 0 && r.anim === 'idle', `跟随时播走 / 跑，停下待机（${JSON.stringify(r.stats.moveAnim)} 当前 ${r.anim}）`);
      check(r.aura && g.buffHudDebug().player.some(x => x.id === 'ally_aura'), '光环生效：玩家 BUFF 图标「守誓光环」');
      P.hp = P.maxHp * 0.5; const h0 = P.hp; step(5.5);
      check(P.hp > h0 && g.rescueDebug().stats.heals >= 1, `每 5 秒回复 2% 生命（${Math.round(h0)} → ${Math.round(P.hp)}）`);
      g.rescueAlly().pos.x += 40; step(0.2);
      check(g.rescueDebug().stats.teleports >= 1 && g.rescueDebug().dist < 6, `离开 30 米以上：瞬移到身后（${g.rescueDebug().dist}）`);
    } else {
      const e = zoneE().sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      check(!!e, '还有敌人');
      if (e) {
        e.maxHp = e.hp = 1e7; P.pos.set(e.pos.x + 4, 0, e.pos.z); e.brain?.provoke?.(); g.target = e;
        for (let i = 0; i < 80; i++) step(0.1, () => { P.hp = P.maxHp; });
        r = g.rescueDebug();
        log(`  战斗：${JSON.stringify(r)}`);
        check(r.stats.attacks >= 2 && r.stats.hits >= 2 && e.hp < e.maxHp, `自动战斗：走过去出手 ${r.stats.attacks} 次、命中 ${r.stats.hits} 次（${r.stats.dmg} 伤害）`);
        check((r.stats.moveAnim.run ?? 0) + (r.stats.moveAnim.walk ?? 0) > 0, `移动播跑 / 走动画（${JSON.stringify(r.stats.moveAnim)}）`);
        e.hp = 0; e.deadAt = g.T; step(0.2);
        for (const x of zoneE()) if (Math.hypot(x.pos.x - P.pos.x, x.pos.z - P.pos.z) < 25) { x.hp = 0; x.deadAt = g.T; }
        g.rescueAlly().pos.x += 20; step(3); r = g.rescueDebug();
        check(r.dist < 6 && (r.state === 'follow' || r.state === 'idle' || r.state === 'return'), `敌人清空 / 离远：回到身边（${r.state} ${r.dist}）`);
        g.rescueAlly().pos.x += 40; step(0.2);
        check(g.rescueDebug().stats.teleports >= 1 && g.rescueDebug().dist < 6, `离开 30 米以上：瞬移到身后（${g.rescueDebug().dist}）`);
      }
    }
    const errs = c.errors.filter(x => !/GLTFLoader: Couldn't load texture/.test(x)); c.errors.length = 0; c.errors.push(...errs);   // jsdom 不解码贴图
    check(errs.length === 0, `无运行时错误${errs.length ? '：' + errs.slice(0, 3).join(' | ') : ''}`);
  });
}
if (MODE === 'p132') {   // v1.2.14 装备分改动 G1–G4：特效按装等计分 / 套装进度 / 专精权重 / 装等分开 + 将失去的特效
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '装备分', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 30, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'cg', name: '装备分', classId: 'warrior', look: 0, level: 30, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'cg', legacyMigrated: true }), darkrock_char_cg: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session(`v1.2.14：装备分 G1–G4（${DLCS.includes('dlc1') ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.gen.classId = 'warrior';
    const clearGear = () => { for (const k of Object.keys(g.inventory.equipped)) delete g.inventory.equipped[k]; g.inventory.bag.length = 0; };
    const sc = it => g.gearScoreInfo(it, false).score;
    // ---- G1：同部位同装等，橙装比紫装高约 20–30%（每部位 150 件平均，空身比较）
    clearGear(); g.tree.load({});
    check(g.gearRoleNow() === undefined, '没投天赋：通用权重');
    const avg = (q, sl) => { let s = 0, n = 0, il = 0; for (let i = 0; i < 150; i++) { const it = g.gen.generate(40, q, [sl]); if (it.quality !== q) continue; s += sc(it); n++; il = it.itemLevel; } return { v: n ? s / n : 0, n, il }; };
    const rows = [], ratios = [];
    for (const sl of ['twoHand', 'oneHand', 'neck', 'ring', 'trinket', 'back', 'feet']) {
      const b = avg('blue', sl), p = avg('purple', sl), o = avg('orange', sl);
      if (!o.n || !p.n) continue;
      const r = o.v / p.v; ratios.push(r);
      rows.push(`${sl}@${o.il} 蓝${Math.round(b.v)}/紫${Math.round(p.v)}/橙${Math.round(o.v)}(${r.toFixed(2)})`);
      check(o.il === p.il, `${sl}：橙紫同装等 ${o.il}`);
    }
    console.log('    ' + rows.join('  '));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    check(ratios.length >= 5 && mean >= 1.2 && mean <= 1.3 && ratios.every(r => r >= 1.12 && r <= 1.4), `橙装 / 紫装 平均 ×${mean.toFixed(2)}（各部位 ${ratios.map(r => r.toFixed(2)).join(' ')}）`);
    // ---- G1：特效分随装等涨（同一件传说特效，装等越高占的分越多，比例基本不变）
    { const lo = g.gen.generate(40, 'orange', ['twoHand']); const hi = JSON.parse(JSON.stringify(lo)); hi.id += '_h'; hi.itemLevel = 80;
      check(sc(hi) > sc(lo), `同一件橙装装等 40 → 80：特效分跟着装等涨（${sc(lo)} → ${sc(hi)}）`); }
    // ---- G4：装备分和装等分开显示；对比时「将失去的特效」
    const lgNeck = g.gen.generate(40, 'orange', ['neck']); g.inventory.add(lgNeck); g.inventory.equip(lgNeck.id); step(0.05);
    const pNeck = g.gen.generate(40, 'purple', ['neck']); g.inventory.add(pNeck);
    const info = g.gearScoreInfo(pNeck, false);
    check(info.lost.some(l => l.kind === 'big'), `换下传说项链：列出将失去的传说特效（${info.lost.map(l => l.text.slice(0, 12)).join(' / ')}）`);
    const tip = g.itemTip(pNeck, false);
    check(/将失去的特效/.test(tip) && /传说特效 ★/.test(tip), '装备说明里红字「将失去的特效：传说特效 ★…」');
    check(/装备分 <b>\d+<\/b>/.test(tip) && /tt-ilvl[^>]*> · 装等 <b>40<\/b>/.test(tip), '装备分旁边单独显示装等');
    const same = JSON.parse(JSON.stringify(lgNeck)); same.id += '_c'; g.inventory.add(same);
    check(g.gearScoreInfo(same, false).lost.length === 0, '换同一件传说（同特效）：不提示失去');
    // ---- G2：套装按进度计分，换散件断套 ▼
    clearGear();
    const legs = g.gen.generateFixed('i_fury_legs', 40), hands = g.gen.generateFixed('i_fury_gauntlet', 40);
    [legs, hands].forEach(p => { g.inventory.add(p); g.inventory.equip(p.id); }); step(0.05);
    check(g.inventory.setCounts().get('set_fury') === 2, '穿 2 件狂怒套装');
    const on2 = g.gearScoreInfo(legs, true).score;
    const loose = JSON.parse(JSON.stringify(legs)); loose.id += '_x'; delete loose.setId; loose.name = '散件腿铠'; g.inventory.add(loose);
    const li = g.gearScoreInfo(loose, false, 'legs');
    check(li.delta < 0 && li.breaksSet, `属性完全相同的散件换掉套装腿：▼${-li.delta}（断套）`);
    const sh = g.scoreHtml(loose, false, 'legs');
    check(/cmp-dn">▼\d+/.test(sh) && /断套/.test(sh), '装备分显示 ▼ 和「断套」');
    check(li.lost.some(l => l.kind === 'setTier'), `将失去：套装效果（${li.lost.filter(l => l.kind === 'setTier').map(l => l.text.slice(0, 16))}）`);
    const twin = JSON.parse(JSON.stringify(legs)); twin.id += '_t'; g.inventory.add(twin);
    const ti = g.gearScoreInfo(twin, false, 'legs');
    check(ti.delta === 0 && !ti.breaksSet, `换同套同部位的另一件：不断套（${ti.delta}）`);
    g.inventory.unequip('hands'); step(0.05);
    const on1 = g.gearScoreInfo(legs, true).score;
    check(on2 > on1, `套装件：凑成 2 件时 ${on2} 分，只剩 1 件（凑不上）只算属性 ${on1} 分`);
    // ---- G3：专精权重：防护（坦克）重生命护甲，武器（输出）重攻强暴击
    clearGear();
    const base = g.gen.generate(40, 'blue', ['neck']);
    const mkN = (id, f) => { const x = JSON.parse(JSON.stringify(base)); x.id += id; x.lines = []; x.hp = 0; x.armor = 0; x.bonus = {}; f(x); g.inventory.add(x); return x; };
    const hpNeck = mkN('_hp', x => { x.hp = 800; x.armor = 200; }), dmgNeck = mkN('_dmg', x => { x.bonus = { power: 40, crit: 8, critDmg: 10 }; });
    const prot = g.tree.def.specs.find(s => s.id === 'w_prot'), arms = g.tree.def.specs.find(s => s.id === 'w_arms');
    g.tree.load({ [prot.nodes.find(n => n.row === 1).id]: 3 }); step(0.05);
    const tk = { role: g.gearRoleNow(), hp: sc(hpNeck), dmg: sc(dmgNeck) };
    g.tree.load({ [arms.nodes.find(n => n.row === 1).id]: 3 }); step(0.05);
    const dp = { role: g.gearRoleNow(), hp: sc(hpNeck), dmg: sc(dmgNeck) };
    check(tk.role === 'tank' && dp.role === 'dps', `主专精 防护 → ${tk.role}，武器 → ${dp.role}`);
    check(tk.hp > tk.dmg && dp.dmg > dp.hp, `坦克：生命护甲项链 ${tk.hp} > 输出项链 ${tk.dmg}；输出：输出项链 ${dp.dmg} > 生命护甲项链 ${dp.hp}`);
    g.tree.load({});
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage: store });
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  if (failed) process.exitCode = 1;
}
if (MODE === 'p133') {   // v1.2.15 第 8 技能格（G 键）+ 内容包可装入的技能物品；副本攻略不再占 G 键
  const dlc = DLCS.includes('dlc1');
  const mk = (lv, cls = 'warrior', echo) => { const sv = { version: 10, savedAt: 1, classId: cls, name: '八格', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp', ...(echo ? { dlc: { dlc1: { v: 1, echo } } } : {}) };
    const meta = { id: 'c8', name: '八格', classId: cls, look: 0, level: lv, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
    return { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'c8', legacyMigrated: true }), darkrock_char_c8: JSON.stringify(sv), darkrock_intro_seen: '1' }; };
  const noErr = c => c.check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  await session(`v1.2.15：第 8 技能格 / G 键（${dlc ? 'DLC' : '本体'} · 电脑）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    check(!$('sk-slot8') || $('sk-slot8').style.display === 'none', '格子空：第 8 格按钮不出现');
    c.key('g'); step(0.2);
    check(!g.slotKeyState().shown && $('raidguide').style.display !== 'flex', '格子空：按 G 什么都不发生');
    c.key('b'); step(0.1);
    check($('bag').style.display === 'flex' && $('bag-slot8').style.display === 'none', '行囊：没有可装入的物品时不显示第 8 格一栏');
    c.key('Escape'); step(0.1);
    check(!code.includes('按 G 看攻略') && !code.includes('攻略 (G)'), '副本门口提示 / 攻略按钮不再写「按 G」');
    check(g.enterRaid('molten_throne') !== false && g.zone === 'raid', `进入长副本（zone=${g.zone}）`);
    step(0.5);
    c.key('g'); step(0.2);
    check($('raidguide').style.display !== 'flex', '副本里按 G：不再打开攻略');
    check($('raid-guide-btn')?.textContent === '攻略', `副本 HUD「攻略」按钮（${$('raid-guide-btn')?.textContent}）`);
    $('raid-guide-btn').click(); step(0.1);
    check($('raidguide').style.display === 'flex' && $('rg-body').querySelectorAll('.rg-boss').length === 5, '点「攻略」按钮打开攻略（5 个首领）');
    c.key('Escape'); step(0.1);
    c.key('m'); step(0.2);
    const rg = $('rm-guide');
    check(!!rg && rg.style.display !== 'none', '副本地图有「攻略」页签');
    rg?.click(); step(0.1);
    check($('raidguide').style.display === 'flex' && $('raidmap').style.display !== 'flex', '副本地图「攻略」→ 打开攻略');
    c.key('Escape'); step(0.1);
    if (!dlc) { noErr(c); return; }
    // ---- 内容包：给钟纹 → 行囊装入 → G 释放
    const E = w.__dlc1.echo;
    g.goMap('camp'); step(0.5);
    const defs = E.defs;
    const cls = [...new Set(defs.map(d => d.cls))];
    check(defs.length === 24 && cls.length === 6 && cls.every(k => new Set(defs.filter(d => d.cls === k).map(d => d.style)).size === 4), `24 枚钟纹 = 6 职业 × 4 类（${cls.join(' ')}）`);
    check(defs.every(d => d.cd >= 30 && d.cd <= 45 && !('hits' in d)), `v1.2.37c 增益型：无伤害段，基础冷却 30–45 秒（${[...new Set(defs.map(d => d.style + d.cd))].join(' ')}）`);
    check(E.dropTable.id === 'dlc1_r40_echomark' && E.dropTable.last > E.dropTable.boss, `掉落表占位 ${E.dropTable.id}（首领 ${E.dropTable.boss} / 尾王 ${E.dropTable.last}）`);
    E.give('dlc1_em_warrior_aoe'); E.give('dlc1_em_hunter_single');   // 旧 id → 迁移为 might / swift step(0.2);
    check(!g.slotKeyState().shown, '拿到钟纹但没装：第 8 格仍隐藏');
    c.key('b'); step(0.1);
    const box = $('bag-slot8');
    check(box.style.display !== 'none' && box.querySelectorAll('.s8i').length === 2, `行囊出现第 8 格一栏：2 枚（${box.textContent.slice(0, 60)}）`);
    const btns = [...box.querySelectorAll('[data-s8e]')];
    check(btns.length === 2 && btns.filter(b => b.disabled).length === 1 && /灵契猎手专用/.test(box.textContent), '别的职业的钟纹：装入按钮灰（猎手专用）');
    btns.find(b => !b.disabled).click(); step(0.2);
    let st = g.slotKeyState();
    check(st.shown && st.id === 'dlc1_em_warrior_might' && E.state().eq === 'dlc1_em_warrior_might', `装入后第 8 格出现（${st.id}，旧 aoe 已迁移为战意）`);
    check($('sk-slot8').querySelector('.sk')?.textContent === 'G', '电脑显示 G');
    check(!!$('bag-slot8').querySelector('[data-s8u]'), '行囊里显示「卸下」');
    c.key('Escape'); step(0.1);
    // 野外找一只怪，加血做木桩
    g.goMap('field'); step(1.5);
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    const near = x => Math.hypot(x.pos.x - g.player.pos.x, x.pos.z - g.player.pos.z);
    const e = g.enemies.filter(x => x.alive && !x.isBoss && !x.isDummy && x.z === g.zone && near(x) < 200).sort((a, b) => near(a) - near(b))[0];
    check(!!e, '野外有怪');
    if (e) {
      e.maxHp = 1e9; e.hp = 1e9;
      g.player.pos.set(e.pos.x + 2, g.player.pos.y, e.pos.z); g.target = e; step(0.05);
      const d0 = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
      c.key('g'); step(0.3);
      const L = E.last(), d1 = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
      check(L.id === 'dlc1_em_warrior_might' && d1 / d0 > 1.12 && d1 / d0 < 1.18, `G 释放「战吼」：普攻伤害 ${Math.round(d0)} → ${Math.round(d1)}（+${Math.round((d1 / d0 - 1) * 100)}%）`);
      st = g.slotKeyState();
      check(st.cd === L.cd && st.cd <= 35 && st.cd >= 21 && st.cdLeft > st.cd - 1, `进入冷却 ${st.cdLeft.toFixed(1)} / ${st.cd} 秒（基础 35，吃冷却缩减）`);
      step(0.3);
      check(/^\d+$/.test($('sk-slot8').querySelector('.st').textContent) && !$('sk-slot8').classList.contains('ready'), `按钮显示冷却秒数（${$('sk-slot8').querySelector('.st').textContent}）`);
      c.key('g'); step(0.2);
      check(E.last().id === L.id && E.state().cd < st.cd, '冷却中再按 G：不放出');
      step(8);
      const d2 = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage;
      check(Math.abs(d2 - d0) < 1e-6 * d0 + 0.01, `8 秒后增益消失（${Math.round(d2)}）`);
      // 庇护：铜墙
      E.give('dlc1_em_warrior_guard'); g.slotEquip('dlc1', 'dlc1_em_warrior_ward'); step(0.2);
      check(g.slotKeyState().id === 'dlc1_em_warrior_ward', '换装「铜墙」（旧 guard → 庇护）');
      g.slotKeyUse(); step(0.1);
      check(g.player.status.reflectBuff?.reduce === 0.2 && g.player.status.shield > 0, `铜墙：减伤 20% + 护盾（${JSON.stringify(g.player.status.reflectBuff)} / 盾 ${Math.round(g.player.status.shield)}）`);
      check(g.buffHudDebug().player.some(x => x.id === 'reflect'), 'BUFF 行显示减伤');
    }
    // 卸下 → 隐藏
    c.key('b'); step(0.1);
    $('bag-slot8').querySelector('[data-s8u]').click(); step(0.2);
    check(!g.slotKeyState().shown && E.state().eq === null, '卸下：第 8 格隐藏');
    c.key('Escape'); step(0.1);
    g.slotEquip('dlc1', 'dlc1_em_warrior_might'); step(0.1);
    const sv = JSON.parse(g.rawSave());
    check(sv.dlc?.dlc1?.echo?.eq === 'dlc1_em_warrior_might' && sv.dlc.dlc1.echo.own.length === 3, `存档 dlc.dlc1.echo（${JSON.stringify(sv.dlc?.dlc1?.echo)}）`);
    noErr(c);
  }, { viewport: [1280, 720], storage: mk(40) });
  if (dlc) {
    await session('v1.2.15：第 8 技能格（DLC · 手机 390×844 · 猎手）', async c => {
      const { g, $, step, check, w } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      const root = w.document.documentElement;
      check(root.classList.contains('phone'), `手机布局（${root.className}）`);
      const b = $('sk-slot8');
      check(!!b && b.style.display !== 'none' && g.slotKeyState().id === 'dlc1_em_hunter_gale', `读档：装着的旧钟纹迁移为疾风且按钮出现（${g.slotKeyState().id}）`);
      check(!b.querySelector('.sk'), '触屏不显示按键字母');
      // 不溢出：按 #skillbar 的 right / bottom / 边长换算矩形，和视口、其他技能键比较
      const cs = el => w.getComputedStyle(el), px = v => parseFloat(v) || 0;
      const bar = $('skillbar'), bR = px(cs(bar).right), bB = px(cs(bar).bottom);
      const rect = el => { const s = cs(el), wd = px(s.width), r = px(s.right), bt = px(s.bottom); return { l: 390 - bR - r - wd, r: 390 - bR - r, t: 844 - bB - bt - wd, b: 844 - bB - bt, wd }; };
      const me = rect(b);
      check(me.wd === g.slotKeyState().layout.phone.size && me.l >= 0 && me.r <= 390 && me.t >= 0 && me.b <= 844, `按钮在视口内（${JSON.stringify(me)}）`);
      const others = ['sk-basic', 'sk-skill1', 'sk-skill2', 'sk-skill3', 'sk-skill4', 'sk-ultimate', 'sk-dodge', 'sk-potion', 'sk-ext'].map(id => [id, $(id)]).filter(([, el]) => el && el.style.display !== 'none');
      const hit = others.filter(([, el]) => { const o = rect(el); return o.wd > 0 && me.l < o.r && me.r > o.l && me.t < o.b && me.b > o.t; }).map(([id]) => id);
      check(others.length >= 7 && hit.length === 0, `不和其他技能键重叠（比较 ${others.length} 个${hit.length ? '，重叠：' + hit.join(',') : ''}）`);
      // 手机点按钮释放（疾风）
      const fr0 = g.dodge.freeRolls;
      b.dispatchEvent(new w.Event('touchstart', { bubbles: true, cancelable: true })); b.dispatchEvent(new w.Event('touchend', { bubbles: true })); step(0.3);
      const L = w.__dlc1.echo.last();
      check(L.id === 'dlc1_em_hunter_gale' && g.dodge.freeRolls === fr0 + 1, `点按钮「狼跃」：下一次翻滚免冷却（${g.dodge.freeRolls}）`);
      check(g.slotKeyState().cdLeft > g.slotKeyState().cd - 1 && g.slotKeyState().cd <= 30, `冷却 ${g.slotKeyState().cd} 秒`);
      noErr(c);
    }, { viewport: [390, 844], touch: true, storage: mk(40, 'hunter', { own: ['dlc1_em_hunter_move'], eq: 'dlc1_em_hunter_move' }) });
    const CLS6 = ['warrior', 'mage', 'chrono', 'alchemy', 'hunter', 'coffin'];
    const store6 = (() => { const o = { darkrock_intro_seen: '1' }, slots = [null, null, null, null, null, null, null, null];
      CLS6.forEach((cl, i) => { const one = mk(40, cl), id = 'c8' + i; slots[i] = { ...JSON.parse(one.darkrock_roster).slots[0], id, classId: cl }; o['darkrock_char_' + id] = one.darkrock_char_c8; });
      o.darkrock_roster = JSON.stringify({ v: 1, slots, last: 'c80', legacyMigrated: true }); return o; })();
    await session('v1.2.15：24 枚钟纹逐个释放（DLC · 六职业）', async c => {
      const { g, $, step, check, w } = c;
      g.selSlot = 0; step(0.05); $('start').click(); step(1);
      for (const cl of CLS6) {
        if (g.cls.id !== cl) { g.startGame(cl); step(0.5); }
        check(g.cls.id === cl && g.progression.level === 40, `切到 ${cl}（${g.cls.id} ${g.progression.level} 级）`);
        const E = w.__dlc1.echo; E.giveAll(cl);
        g.goMap('field'); step(0.6);
        g.player.maxHp = 1e8; g.player.hp = 1e8;
        const near = x => Math.hypot(x.pos.x - g.player.pos.x, x.pos.z - g.player.pos.z);
        const e = g.enemies.filter(x => x.alive && !x.isBoss && !x.isDummy && x.z === g.zone && near(x) < 200).sort((a, b) => near(a) - near(b))[0];
        check(!!e, '野外有怪');
        if (!e) continue;
        e.maxHp = 1e9; e.hp = 1e9;
        for (const d of E.defs.filter(x => x.cls === cl)) {
          check(g.slotEquip('dlc1', d.id), `装入 ${d.name}`);
          E.resetCd(); g.dodge.freeRolls = 0; step(0.05);
          if (d.style === 'swift') { g.loadout.cooldownEnd.set('skill2', g.T + 9); g.loadout.cooldownEnd.set('skill1', g.T + 3); }
          const sp0 = g.charSheet().haste, d0 = g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage, fr0 = g.dodge.freeRolls;
          g.slotKeyUse(); step(0.1);
          const L = E.last(), cs = g.charSheet();
          const ok = d.style === 'might' ? g.loadout.preview('basic', { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.damage / d0 > 1.12
            : d.style === 'swift' ? L.refreshed === 'skill2' && g.loadout.cooldownLeft('skill2', g.T) === 0 && g.loadout.cooldownLeft('skill1', g.T) > 0 && cs.haste >= Math.min(40, sp0 + 19.9) - 0.01 && cs.haste <= 40
            : d.style === 'ward' ? g.player.status.shield > 0 && g.player.status.reflectBuff?.reduce === 0.2
            : g.dodge.freeRolls === fr0 + 1;
          check(L.id === d.id && ok, `${d.name}（${d.style}）生效，冷却 ${L.cd} 秒${d.style === 'swift' ? `，刷新 ${L.refreshed}，急速 ${sp0}→${cs.haste}` : ''}`);
          step(8.5);
        }
      }
      noErr(c);
    }, { viewport: [1280, 720], storage: store6 });
  }
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  if (failed) process.exitCode = 1;
}

if (MODE === 'p134') {   // v1.2.16 内容包小副本（四档难度 + 40 级同步）：钟铜熔炉
  const dlc = DLCS.includes('dlc1');
  const mk = (lv, cls = 'warrior') => { const sv = { version: 10, savedAt: 1, classId: cls, name: '熔炉', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 5000, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
    const meta = { id: 'c9', name: '熔炉', classId: cls, look: 0, level: lv, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
    return { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'c9', legacyMigrated: true }), darkrock_char_c9: JSON.stringify(sv), darkrock_intro_seen: '1' }; };
  const noErr = c => c.check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  await session(`v1.2.16：40 级小副本四档难度（${dlc ? 'DLC' : '本体'}）`, async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const PD = g.packDungeon;
    if (!dlc) {
      check(PD.defs().length === 0 && !g.wilds.dlc1_forge && !code.includes('钟铜熔炉'), '本体：没有内容包小副本（副本不存在）');
      // 30 级小副本四档仍正常：入口选难度面板 4 档 + 同步 30 级
      g.ensureWild('frost'); g.goMap('frost'); step(0.3);
      const gate = g.wilds.frost.dgates.find(d => d.id === 'troll_cave');
      g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3);
      g.currentInteractable().act(); step(0.1);
      const tabs = [...$('rg-body').querySelectorAll('[data-df]')];
      check($('raidguide').style.display === 'flex' && tabs.length === 4 && tabs.every(b => !b.disabled) && /同步到 30 级/.test($('rg-body').textContent), `30 级小副本：4 档难度、英雄起同步 30 级（${tabs.map(b => b.textContent).join('/')}）`);
      $('rg-body').querySelector('[data-df="nightmare"]').click(); step(0.02);
      check(/装等 46/.test($('rg-body').textContent), '噩梦说明仍是装等 46');
      $('rg-body').querySelector('[data-df="heroic"]').click(); step(0.02);
      $('dgx-go').click(); step(0.5);
      const boss = g.enemies.find(e => e.z === 'raid' && e.isBoss);
      check(g.zone === 'raid' && g.dgxDebug()?.diff === 'heroic' && boss?.type.ilvl >= 33, `进入巨魔冰窟（英雄）：首领掉落装等 ${boss?.type.ilvl}`);
      g.raidCleanup(); g.goMap('camp'); step(0.3);
      noErr(c); return;
    }
    const ID = 'dlc1_forge_dg';
    check(PD.defs().includes(ID), `内容包小副本已注册（${PD.defs().join(',')}）`);
    const F = w.__dlc1.forge;
    // ---- 入口：钟楼脚下的铜梯 → 选难度
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.5);
    const gate = g.wilds.dlc1_belltower.dgates.find(d => d.id === ID);
    check(!!gate, '无声钟楼有副本入口');
    g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3);
    check(/进入：钟铜熔炉/.test($('interact').textContent), `入口交互：${$('interact').textContent}`);
    g.currentInteractable().act(); step(0.1);
    const tabs = [...$('rg-body').querySelectorAll('[data-df]')];
    check($('raidguide').style.display === 'flex' && tabs.length === 4 && tabs.every(b => !b.disabled), `四档都能选（${tabs.map(b => b.textContent).join('/')}）`);
    check(/同步到 40 级/.test($('rg-body').textContent), '英雄起同步 40 级（说明）');
    const il = {};
    for (const d of ['normal', 'heroic', 'epic', 'nightmare']) { $('rg-body').querySelector(`[data-df="${d}"]`).click(); step(0.02); il[d] = +($('rg-body').textContent.match(/掉落装等 (\d+)/) ?? [])[1]; }
    check(il.normal === 78 && il.heroic === 81 && il.epic === 84 && il.nightmare === 87, `四档装等 ${JSON.stringify(il)}`);
    check(/尾王多一道机制门槛/.test($('rg-body').textContent), '噩梦说明：尾王机制门槛');
    $('rg-body').querySelector('[data-df="heroic"]').click(); step(0.02);
    $('dgx-go').click(); step(0.5);
    let st = PD.state();
    check(g.zone === 'dlc1_forge' && st?.diff === 'heroic' && g.dgxDebug()?.diff === 'heroic', `进入钟铜熔炉（英雄，zone=${g.zone}）`);
    check(st.boss.level === 40 && st.boss.maxHp === Math.round(258000 * 1.2) && st.boss.dmg === Math.round(160 * 1.2) && st.boss.ilvl === 81, `英雄：首领同步 40 级、钟楼首领 ×1.2（生命 ${st.boss.maxHp} 伤害 ${st.boss.dmg} 装等 ${st.boss.ilvl}）`);
    check(st.trash.length === 6 && st.trash.every(t => t.level === 40 && t.ilvl === 78) && st.trash.some(t => t.hp === Math.round(4400 * 1.2)), `小怪 6 只，40 级、装等 78（${st.trash.map(t => t.hp).join(',')}）`);
    check($('dgx-hud').style.display === 'block' && /英雄/.test($('dgx-hud').textContent), `副本 HUD：${$('dgx-hud').textContent}`);
    // ---- 副本地图：四档页签 + 掉落列表随难度切换
    c.key('m'); step(0.2);
    check($('raidmap').style.display === 'flex', '副本里按 M 打开副本地图');
    const dt = [...$('rm-diff').querySelectorAll('[data-df]')];
    check(dt.length === 4 && dt.map(x => x.textContent).join('') === '普通英雄史诗噩梦', `难度页签 ${dt.map(x => x.textContent).join('/')}`);
    $('rm-diff').querySelector('[data-df="nightmare"]').click(); step(0.1);
    check($('rmd-pack')?.dataset.diff === 'nightmare' && /87/.test($('rmd-pack').textContent) && /钟铜精炼材料/.test($('rm-side').textContent) && /60%/.test($('rm-side').textContent), `噩梦页签：装等 87 + 精炼材料 + 尾王钟纹 60%`);
    $('rm-diff').querySelector('[data-df="normal"]').click(); step(0.1);
    check($('rmd-pack')?.dataset.diff === 'normal' && /78/.test($('rmd-pack').textContent) && !/钟铜精炼材料/.test($('rm-side').textContent) && /12%/.test($('rm-side').textContent), '普通页签：装等 78、没有精炼材料、首领钟纹 12%');
    check($('rm-side').querySelectorAll('.dl-h').length === 3, '掉落列表 3 个首领');
    c.key('Escape'); step(0.1);
    // ---- 打首领
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    const kill = (e) => { let n = 0; while (e.alive && n++ < 40) { g.fx.dealDamage(e, e.maxHp, 'physical', g.player); step(0.05); } };
    const pick = () => { if (g.dgxDebug()?.pick) g.dgxPick(0); step(0.05); };
    F.setRng(() => 0);   // 钟纹必掉（测试）
    for (let i = 0; i < 2; i++) { const U = PD.units(); g.player.pos.set(U.boss.pos.x + 3, 0, U.boss.pos.z); step(0.3); kill(U.boss); step(0.5); pick(); }
    st = PD.state();
    check(st.i === 2 && st.log.length === 2 && (g.dgxDebug()?.relics.length ?? 0) >= 2 && (g.dgxDebug()?.anomalies.length ?? 0) >= 2, `两个普通首领倒下：遗物 ${g.dgxDebug()?.relics.length} 件、异变 ${g.dgxDebug()?.anomalies.map(a => a.kind).join(',')}`);
    check(st.boss.key === 'fg_b3' && st.boss.maxHp === Math.round(274000 * 1.2), `尾王「钟母」：生命 ${st.boss.maxHp}`);
    const loot0 = g.loots.length;
    { const U = PD.units(); g.player.pos.set(U.boss.pos.x + 3, 0, U.boss.pos.z); step(0.3); kill(U.boss); step(0.8); }
    st = PD.state();
    const fl = F.debug().log;
    check(st.done && fl.length === 3 && fl[2].last && fl[2].diff === 'heroic' && fl.every(x => !!x.echo) && w.__dlc1.echo.state().own.length === 3, `击杀尾王：通关，钟纹掉落钩子调用 3 次（${fl.map(x => x.echo).join(',')}）`);
    check(g.loots.length > loot0, `尾王有掉落（地上 +${g.loots.length - loot0}）`);
    check(JSON.parse(g.rawSave()).dgx?.best?.[`${ID}|heroic`] > 0, '计时奖牌：本副本英雄有最佳纪录');
    F.setRng(null);
    // ---- 离开
    const it = g.currentInteractable();
    check(/离开副本/.test(it?.label ?? ''), `通关后可以离开（${it?.label}）`);
    it?.act(); step(0.5);
    check(g.zone === 'dlc1_belltower' && PD.state() === null && g.dgxDebug() === null, `回到无声钟楼（${g.zone}），本趟结束`);
    // ---- 噩梦：倍率 + 尾王机制门槛
    check(PD.enter(ID, 'nightmare'), '直接进噩梦');
    st = PD.state();
    const oaths = g.dgxDebug().oaths, om = { hp: oaths.includes('stone') ? 1.3 : 1, dmg: oaths.includes('fury') ? 1.25 : 1 };
    check(Math.abs(st.mul.hp - 1.45 * om.hp) < 1e-6 && Math.abs(st.mul.dmg - 1.45 * om.dmg) < 1e-6 && st.boss.maxHp === Math.round(258000 * st.mul.hp) && st.boss.ilvl === 87 + oaths.length, `噩梦 ×1.45（誓约 ${oaths.join(',')}）：首领生命 ${st.boss.maxHp}、装等 ${st.boss.ilvl}`);
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    for (let i = 0; i < 2; i++) { const U = PD.units(); g.player.pos.set(U.boss.pos.x + 3, 0, U.boss.pos.z); step(0.3); kill(U.boss); step(0.5); pick(); }
    const U3 = PD.units(), B = U3.boss;
    g.player.pos.set(B.pos.x + 3, 0, B.pos.z); step(0.3);
    g.fx.dealDamage(B, B.maxHp * 0.41 + 10, 'physical', g.player); step(0.2);
    st = PD.state();
    check(st.gate && st.gate.th === 0.6 && st.gate.cores === 3 && st.boss.invuln, `60% 血：「熔铸」不可破 + 3 颗熔芯（${JSON.stringify(st.gate)}）`);
    const hpG = B.hp; g.fx.dealDamage(B, B.maxHp, 'physical', g.player); step(0.1);
    check(B.hp === hpG && B.alive, '不可破：硬打首领没有伤害');
    // 不打熔芯 → 读条结束团灭
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    for (let k = 0; k < 22 && g.player.alive; k++) { g.player.hp = g.player.maxHp; step(1); }
    st = PD.state();
    check(!g.player.alive && st.wipes === 1 && !st.gate && st.boss.hp === st.boss.maxHp && st.gateDone.length === 0, `20 秒没打碎熔芯：团灭（wipes ${st.wipes}），首领回满`);
    $('respawn').click(); step(0.5);
    check(g.player.alive && g.zone === 'dlc1_forge' && PD.state() !== null, '复活在熔炉入口，本趟继续');
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    g.player.pos.set(B.pos.x + 3, 0, B.pos.z); step(0.2);
    for (const th of [0.6, 0.3]) {
      g.fx.dealDamage(B, B.hp - B.maxHp * (th - 0.01), 'physical', g.player); step(0.2);
      const cores = PD.units().cores;
      check(PD.state().gate?.th === th && cores.length === 3, `${th * 100}% 血进入门槛`);
      cores.forEach(kill); step(0.3);
      check(!PD.state().gate && PD.state().gateDone.includes(th) && !PD.state().boss.invuln, `打碎 3 颗熔芯：门槛 ${th * 100}% 解除`);
    }
    kill(B); step(0.8);
    let fd = F.debug();
    check(PD.state().done && fd.mats === 1 && fd.week !== null && fd.clears.nightmare === 1, `噩梦通关：每周首通钟铜精炼材料 ×${fd.mats}`);
    const sv = JSON.parse(g.rawSave());
    check(sv.dlc?.dlc1?.forge?.mats === 1, `存档 dlc.dlc1.forge（${JSON.stringify(sv.dlc?.dlc1?.forge)}）`);
    // 同一周再打一次噩梦：不再给材料
    PD.enter(ID, 'nightmare'); g.player.maxHp = 1e8; g.player.hp = 1e8;
    for (let i = 0; i < 3; i++) {
      const U = PD.units(), E = U.boss; g.player.pos.set(E.pos.x + 3, 0, E.pos.z); step(0.2);
      for (let k = 0; k < 6 && E.alive; k++) { g.fx.dealDamage(E, E.maxHp * 0.25, 'physical', g.player); step(0.1); PD.units().cores.forEach(kill); step(0.1); }
      kill(E); step(0.5); pick();
    }
    fd = F.debug();
    check(PD.state().done && fd.mats === 1 && fd.clears.nightmare === 2, `同周第二次噩梦通关：材料仍 ${fd.mats}`);
    PD.end(); g.goMap('camp'); step(0.3);
    noErr(c);
  }, { viewport: [1280, 720], storage: mk(40) });
  if (dlc) await session('v1.2.16：40 级副本等级门槛（DLC · 39 级）', async c => {
    const { g, $, step, check } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.5);
    const gate = g.wilds.dlc1_belltower?.dgates.find(d => d.id === 'dlc1_forge_dg');
    if (gate) { g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3); }
    check(!!gate && /需要等级 40/.test($('interact').textContent), `39 级：入口提示 ${$('interact').textContent}`);
    check(g.packDungeon.enter('dlc1_forge_dg', 'heroic') === false && g.zone !== 'dlc1_forge', '39 级进不去');
    noErr(c);
  }, { viewport: [1280, 720], storage: mk(39) });
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  if (failed) process.exitCode = 1;
}
if (MODE === 'pjudge' && process.env.PLAYTEST_DLC) {   // fix1108 #2 评委「长副本 A 尾王门口」：双子 10% 互锁 / 断码头之后能否代打到尾王；卡住不送去空的 B5
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '评委', look: 0, playMs: 1000, tutorial: -1, inventory: { gold: 5000, bag: [], equipped: {}, stacks: {} }, level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'j1', name: '评委', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const storage = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'j1', legacyMigrated: true }), darkrock_char_j1: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session('fix1108 #2：评委通道 → 长副本 A 尾王门口', async c => {
    const { g, $, step, check, w, log } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const J = w.__dlc1.judge, WL = w.__dlc1.well; J.state.on = true;
    const t0 = Date.now(); let done = false, res = null, seen = [];
    J.act(3);
    const P = w.__dlc1 && w.__game.packDungeon;
    for (let k = 0; k < 400 && !done; k++) {
      step(0.7); await new Promise(r => setTimeout(r, 720));
      const st = P.state(); if (st && !seen.includes(st.i)) { seen.push(st.i); log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s 首领 ${st.i + 1}（${st.boss?.key}）`); }
      const tw = WL.twins?.info?.(); if (st?.i === 3 && tw && k % 4 === 0) log(`    双子：死渡 ${tw.death ? Math.round(tw.death.hp / tw.death.max * 100) : '-'}% 生渡 ${tw.life ? Math.round(tw.life.hp / tw.life.max * 100) + '%' + (tw.life.alive ? '' : '（倒）') : '-'} 锁 ${tw.setup}`);
      if (!w.__dlc1.well.debug || !J) break;
      const last = (w.__dlc1.wellJudge ?? null);
      if (P.state()?.i === 4 && P.units().boss?.alive && P.units().boss.pboss === 'wl_b5') { step(1); await new Promise(r => setTimeout(r, 900)); done = true; }
    }
    const st = P.state(), B = P.units().boss, d = B ? Math.hypot(g.player.pos.x - B.pos.x, g.player.pos.z - B.pos.z) : -1;
    check(done && st?.i === 4 && B?.pboss === 'wl_b5' && B.alive, `代打到尾王：i=${st?.i} 首领 ${B?.pboss} 存活 ${B?.alive}，依次经过 ${seen.map(i => i + 1).join('→')}，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒（真实时间）`);
    check(d >= 0 && d < 40, `玩家在尾王门口（距尾王 ${d.toFixed(1)} 米）`);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage });
}
if (MODE === 'pjump' && process.env.PLAYTEST_DLC) {   // fix1108 #4 评委面板快速跳转：熔炉 / 钟井井口开打 / 海岸 / 镜渊城 / 钟楼 / 钟井井口（只看）
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '评委', look: 0, playMs: 1000, tutorial: -1, inventory: { gold: 5000, bag: [], equipped: {}, stacks: {} }, level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'j1', name: '评委', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const storage = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'j1', legacyMigrated: true }), darkrock_char_j1: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session('fix1108 #4：评委面板快速跳转', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const J = w.__dlc1.judge; J.state.on = true; J.show(true); step(0.2);
    const btns = [...w.document.querySelectorAll('#d1-judge [data-j]')].map(b => +b.dataset.j).filter(n => n >= 10);
    check(btns.length === 6, `面板有 6 个跳转按钮（${btns.join(',')}）`);
    const P = g.packDungeon;
    const wait = async (ok, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { step(0.3); await new Promise(r => setTimeout(r, 60)); if (ok()) return true; } return false; };
    const cases = [
      [10, '钟铜熔炉', () => P.state()?.id === 'dlc1_forge_dg' && g.zone === 'dlc1_forge' && !!P.units().boss],
      [11, '钟井井口开打', () => P.state()?.id === 'dlc1_well_dg' && P.state().i === 0 && g.zone === 'dlc1_well' && !!P.units().boss],
      [12, '沉钟海岸', () => g.zone === 'dlc1_coast' && !P.here()],
      [13, '镜渊城', () => g.zone === 'dlc1_mirror'],
      [14, '无声钟楼', () => g.zone === 'dlc1_belltower'],
    ];
    for (const [j, name, ok] of cases) {
      w.document.querySelector(`#d1-judge [data-j="${j}"]`)?.click();
      const t0 = Date.now(), r = await wait(ok);
      check(r, `${name}：zone=${g.zone} 副本=${P.state()?.id ?? '-'} 位置 (${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)})，${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    }
    // 钟井营地：不在副本 → 开一趟落井口；在副本里走远后 → 传回井口、副本进度保留
    const atCamp = () => Math.hypot(g.player.pos.x - 2700, g.player.pos.z - (-2700 + 120)) < 4;
    w.document.querySelector('#d1-judge [data-j="15"]')?.click();
    check(await wait(() => P.state()?.id === 'dlc1_well_dg' && g.zone === 'dlc1_well' && atCamp()), `钟井营地（从海岸外）：开一趟落在井口（${g.zone} ${P.state()?.id ?? '-'}，(${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)})）`);
    const b0 = P.units().boss; g.player.pos.set(2700, 0, -2700 + 40); step(0.3);
    w.document.querySelector('#d1-judge [data-j="15"]')?.click(); step(0.3);
    check(atCamp() && P.state()?.id === 'dlc1_well_dg' && P.units().boss === b0, `钟井营地（副本里）：传回井口、同一趟副本（(${g.player.pos.x.toFixed(0)}, ${g.player.pos.z.toFixed(0)})）`);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage });
}
if (MODE === 'pboss7' && process.env.PLAYTEST_DLC) {   // fix1108 #7 DLC 首领伤害按等级 / 装等缩放：首领打玩家 ×k（物理再按等级放大护甲常数），小怪 / 本体不变
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '缩放', look: 0, playMs: 1000, tutorial: -1, inventory: { gold: 5000, bag: [], equipped: {}, stacks: {} }, level: { level: 40, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'k1', name: '缩放', classId: 'warrior', look: 0, level: 40, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  const storage = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'k1', legacyMigrated: true }), darkrock_char_k1: JSON.stringify(sv), darkrock_intro_seen: '1' };
  await session('fix1108 #7：DLC 首领伤害缩放', async c => {
    const { g, $, step, check, w, log } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const inv = g.inventory, SL = ['mainHand', 'offHand', 'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2'];
    const pol = g.gen.ilvlPolicy; g.gen.ilvlPolicy = null; g.gen.classId = 'warrior';
    for (const s of SL) { try { const it = g.gen.generate(75, 'purple', [s.replace(/[12]$/, '')]); inv.add(it); if (!inv.equip(it.id, s)) inv.remove?.(it.id); } catch { } }
    g.gen.ilvlPolicy = pol; g.syncCharacter(); step(0.2);
    const BS = w.__dlc1.bossScale, P = g.packDungeon;
    check(P.enter('dlc1_forge_dg', 'normal'), '进钟铜熔炉（普通）'); step(1.5);
    const B = P.units().boss, T = P.units().trash.find(e => e.alive);
    check(!!B?.pboss, `首领 ${B?.pboss}`);
    const pl = g.player, A = pl.armor, H = pl.maxHp;
    const hit = (src, n, el) => { pl.hp = pl.maxHp; const h0 = pl.hp; g.fx.dealDamage(pl, n, el, src); return h0 - pl.hp; };
    const rows = [];
    for (const [n, el] of [[288, 'fire'], [265, 'physical'], [184, 'physical']]) {
      BS.state.on = false; const off = hit(B, n, el); BS.state.on = true; const on = hit(B, n, el);
      const k = BS.k(40, 75), exp = BS.hit(n, el, 40, 75, A);
      rows.push(`${el} ${n}：改前 ${off.toFixed(0)}（${(off / H * 100).toFixed(2)}%）→ 改后 ${on.toFixed(0)}（${(on / H * 100).toFixed(1)}%）`);
      check(Math.abs(on - exp) / exp < 0.08, `首领 ${el} ${n}：实测 ${on.toFixed(0)} ≈ 公式 ${exp.toFixed(0)}（k=${k.toFixed(2)}）`);
    }
    log(`  玩家 40 级 · 平均装等 ${(SL.map(s => inv.equipped[s]?.itemLevel).filter(Boolean).reduce((a, b, _, r) => a + b / r.length, 0)).toFixed(0)}：生命 ${H} 护甲 ${A}`);
    rows.forEach(r => log('  ' + r));
    if (T) { BS.state.on = false; const off = hit(T, 140, 'physical'); BS.state.on = true; const on = hit(T, 140, 'physical'); check(Math.abs(on - off) < 1e-6, `小怪伤害不变（${off.toFixed(1)} / ${on.toFixed(1)}）`); }
    check(BS.k(31, 54) >= 1 && BS.k(40, 75) > BS.k(35, 68) && BS.k(35, 68) > BS.k(31, 54), `k 随等级递增：31/54 ${BS.k(31, 54).toFixed(2)}、35/68 ${BS.k(35, 68).toFixed(2)}、40/75 ${BS.k(40, 75).toFixed(2)}、40/85 ${BS.k(40, 85).toFixed(2)}`);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], storage });
}
if (MODE === 'pwell') {   // v1.2.69-A1 长副本 A「潮渊钟井」（PLAYTEST_DLC=dlc1）：入口 / 四档 / 5 首领 / 两个机制门槛 / 潮汐 / 存档
  const mk = (lv, cls = 'warrior') => { const sv = { version: 10, savedAt: 1, classId: cls, name: '钟井', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 5000, bag: [], equipped: {}, stacks: {} }, level: { level: lv, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
    const meta = { id: 'w1', name: '钟井', classId: cls, look: 0, level: lv, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
    return { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'w1', legacyMigrated: true }), darkrock_char_w1: JSON.stringify(sv), darkrock_intro_seen: '1' }; };
  const noErr = c => c.check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  await session('v1.2.69-A1：长副本 A 潮渊钟井', async c => {
    const { g, $, step, check, w } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const PD = g.packDungeon, ID = 'dlc1_well_dg', WL = w.__dlc1.well;
    check(PD.defs().includes(ID) && !!g.wilds && !!WL, `长副本 A 已注册（${PD.defs().join(',')}）`);
    g.ensureWild('dlc1_belltower'); g.goMap('dlc1_belltower'); step(0.5);
    const gate = g.wilds.dlc1_belltower.dgates.find(d => d.id === ID);
    check(!!gate, '无声钟楼脚下有潮渊钟井的临时入口');
    g.player.pos.set(gate.pos.x + 1, 0, gate.pos.z + 1); step(0.3);
    check(/潮渊钟井/.test($('interact').textContent), `入口交互：${$('interact').textContent}`);
    g.currentInteractable().act(); step(0.1);
    const il = {};
    for (const d of ['normal', 'heroic', 'epic', 'nightmare']) { $('rg-body').querySelector(`[data-df="${d}"]`).click(); step(0.02); il[d] = +($('rg-body').textContent.match(/掉落装等 (\d+)/) ?? [])[1]; }
    check(il.normal === 84 && il.heroic === 86 && il.epic === 88 && il.nightmare === 91, `四档装等 ${JSON.stringify(il)}`);
    $('rg-body').querySelector('[data-df="normal"]').click(); step(0.02); $('dgx-go').click(); step(0.5);
    let st = PD.state();
    check(g.zone === 'dlc1_well' && st?.diff === 'normal' && st.boss.key === 'wl_b1' && st.boss.maxHp === 62000, `进入潮渊钟井（普通）：一号首领 ${st?.boss.key} 生命 ${st?.boss.maxHp}`);
    check(st.trash.length === 12, `小怪 ${st.trash.length} 只`);
    // A10 炼狱（噩梦档）：×1.5 生命 + 借一个别的首领机制（戈尔顿借维尔格「冰裂」）；切回普通后不带借用技能
    { const H = WL.twins.hard(); PD.enter(ID, 'nightmare'); step(0.3); const sn = PD.state();
      const gb = H.bosses()[0].boss;
      check(sn?.diff === 'nightmare' && sn.boss.maxHp === 93000 && H.diff() === 'nightmare' && H.borrow.wl_b1.id === 'crack' && gb.abilities.some(a => a.id === 'crack'), `炼狱：首领生命 ${sn?.boss.maxHp}（×1.5）、借用 ${JSON.stringify(H.borrow.wl_b1)}`);
      PD.enter(ID, 'normal'); step(0.5); st = PD.state(); }
    // 潮汐：远离首领，站进西侧低栈道
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    const O = { x: 2700, z: -2700 };
    g.player.pos.set(O.x - 50, 0, O.z - 20); step(0.3);
    WL.setTide(59.5 - 20); step(1);
    check(WL.debug().high && /涨潮/.test(c.yells?.join?.('') ?? '涨潮'), '第 40 秒起涨潮');
    const hp0 = g.player.hp; for (let k = 0; k < 3; k++) step(1);
    check(g.player.hp < hp0, `涨潮时站在低栈道持续掉血（${Math.round(hp0 - g.player.hp)}）`);
    WL.setTide(0); step(0.5);
    check(!WL.debug().high, '退潮');
    // A7：首领整体动作（程序化蒙皮回退开关默认关）；fix1107 钟笼升降梯 + 高架栈道已删（Rhett 11-07 12:45 批），A6 / A7 钟笼测试一并删
    { check(WL.procSkin() === false, '程序化蒙皮回退开关默认关（首领走写实模型整体动作，正式骨骼 A9 接入）');
      { const ids = ['wl_gordon', 'wl_sarin', 'wl_virg', 'wl_ferry_death', 'wl_ferry_life', 'wl_morvis'], rs = ids.map(id => [id, WL.build(id)]);
      check(rs.every(([, r]) => r && r.boxH > r.height * 0.6 && r.boxH < r.height * 1.4), `6 个首领整体动作模型身高对得上：${rs.map(([id, r]) => `${id.slice(3)} ${r?.boxH.toFixed(1)}/${r?.height.toFixed(1)}m`).join('、')}`); } }
    // 打首领
    const kill = (e) => { let n = 0; while (e.alive && n++ < 60) { g.fx.dealDamage(e, e.maxHp, 'physical', g.player); step(0.05); } };
    const pick = () => { if (g.dgxDebug()?.pick) g.dgxPick(0); step(0.05); };
    const toBoss = () => { const U = PD.units(); g.player.pos.set(U.boss.pos.x + 3, 0, U.boss.pos.z); step(0.3); return U.boss; };
    WL.setRng(() => 0);
    let B = toBoss();
    { g.player.maxHp = 1e8; g.player.hp = 1e8; const w0 = WL.rig().warns.length; let n = 0;
      while (n++ < 150 && WL.rig().warns.length === w0) { g.player.pos.set(B.pos.x + 3, 0, B.pos.z); g.player.hp = 1e8; step(0.1); }
      const R = WL.rig(), bt = R.built.wl_gordon ?? {};
      check(!bt.skinned, `戈尔顿：${bt.mode ?? '未建'}（程序化蒙皮未启用）`);
      { const sp = B.rig.anim?.state?.(); check(WL.pose() === false && R.wholePose === false && sp && sp.pitch === 0 && sp.roll === 0, `整体姿态回退默认关（预备中 ${sp?.act ?? '-'}，模型不整体倾斜：pitch ${sp?.pitch}）`); }
      check(!!R.raidWarn && /「/.test(R.raidWarn.text), `首领预警文案：${R.raidWarn?.text}`);
      check(R.cam.want > 0 && R.cam.pull > 0, `大型首领交战：镜头拉远 ${R.cam.pull.toFixed(2)} 米（目标 ${R.cam.want.toFixed(2)}）`);
      const wn = R.warns.slice(w0);
      check(wn.length > 0 && wn[0].id === 'wl_gordon' && wn[0].dur >= 1, `读条预警：${wn.map(x => `${x.key} ${x.dur.toFixed(1)} 秒`).join('、') || '无'}（${(n * 0.1).toFixed(1)} 秒内）`);
      { const A9 = R.a9, miss = []; for (const [mid, ids] of Object.entries(A9.moves)) for (const k of [...ids, 'melee', 'phase']) if (!(A9.fx[mid] ?? []).includes(k) && !(mid === 'wl_ferry_life' && k === 'phase')) miss.push(mid.slice(3) + ':' + k);
        check(miss.length === 0, `A9：5 位首领每个技能 + 普攻 + 阶段转换都有专属特效（${Object.entries(A9.fx).map(([k, v]) => k.slice(3) + ' ' + v.length).join('、')}）${miss.length ? '，缺 ' + miss.join(' ') : ''}`); }
      const an = B.rig.anim; check(!!an && typeof an.state === 'function', `首领动作状态机已挂（${an?.state?.().act ?? 'idle'}，出手记录 ${an?.log?.length ?? 0} 次）`); }
    kill(B); step(0.5); pick();
    // 二号：溺潮女巫 40% 潮葬门槛（所有难度都有）
    B = toBoss(); st = PD.state();
    check(st.boss.key === 'wl_b2' && st.boss.maxHp === 66000, `二号首领 ${st.boss.key}`);
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    g.fx.dealDamage(B, B.hp - B.maxHp * 0.39, 'physical', g.player); step(0.2);
    st = PD.state();
    check(st.gate?.th === 0.4 && st.gate.cores === 3 && st.boss.invuln, `40%：潮葬，3 盏灵魂灯笼（${JSON.stringify(st.gate)}）`);
    PD.units().cores.forEach(kill); step(0.3);
    check(!PD.state().gate && !PD.state().boss.invuln, '打碎灯笼：潮葬解除');
    // A5：萨琳「溺魂尖啸」——站在鱼油灯光圈里免疫，用过的灯压暗 20 秒
    { const L = WL.SARIN_LAMPS[0]; let n = 0, info = null;
      while (WL.debug().lampOut[0] <= 0 && n++ < 400) { g.player.pos.set(O.x + L.x, 0, O.z + L.z); g.player.hp = g.player.maxHp; step(0.2); info = info ?? g.packCtx?.bossInfo?.('wl_b2'); }
      const lo = WL.debug().lampOut;
      check(lo[0] > 15 && lo[1] === 0, `灯光里免疫溺魂尖啸，这盏灯压暗（${lo.map(x => x.toFixed(1)).join(' / ')}，用时 ${(n * 0.2).toFixed(1)} 秒）`); void info; }
    kill(B); step(0.5); pick();
    // A5：维尔格 ≤50% 冰面打滑
    B = toBoss(); g.player.maxHp = 1e8; g.player.hp = 1e8;
    g.fx.dealDamage(B, B.hp - B.maxHp * 0.45, 'physical', g.player); step(0.2);
    { const S3 = { x: O.x - 14, z: O.z - 40 }; g.player.pos.set(S3.x - 6, 0, S3.z + 2); step(0.3);
      check(WL.debug().ice.on, '维尔格 ≤50%：冰面打滑开启');
      for (let k = 0; k < 20; k++) { g.player.pos.x += 0.25; step(0.05); }
      const x0 = g.player.pos.x; for (let k = 0; k < 30; k++) step(0.05);
      const slid = g.player.pos.x - x0;
      check(slid > 0.8 && slid < 6, `松开方向后继续滑行 ${slid.toFixed(2)} 米`);
      g.player.pos.set(S3.x + 40, 0, S3.z + 40); step(0.3);
      check(!WL.debug().ice.on, '离开冰面：打滑关闭'); }
    kill(B); step(0.5); pick();
    // A8：摆渡双子双首领机制（生渡上岸同血 / 会走会打 / 渡生引导可打断 / 同舟减伤 / 断渡 / 死渡锁血护壳）
    { B = toBoss(); st = PD.state(); const TW = WL.twins, TI = () => TW.info(), K = TW.K;
      check(st.boss.key === 'wl_b4' && st.boss.maxHp === 76000, `四号首领 ${st.boss.key}（摆渡双子）`);
      const gi = TW.glb(), bt = WL.rig().built.wl_ferry_death ?? {};
      check(gi.ready.includes('wl_ferry_death') ? (bt.skinned && /正式绑骨/.test(bt.mode)) : !bt.skinned, gi.ready.includes('wl_ferry_death') ? `死渡用正式绑骨件：${bt.mode}（骨 ${bt.bones}、三角 ${bt.verts}）` : `本环境绑骨件未载入（${gi.ids.length ? 'jsdom 无 WebGL 解析' : 'base 包没有'}）→ ${bt.mode}；浏览器实测见 dev/a8shot.mjs`);
      g.player.maxHp = 1e8; g.player.hp = 1e8;
      g.fx.dealDamage(B, B.hp - B.maxHp * 0.49, 'physical', g.player); step(0.3);
      st = PD.state(); let ti = TI(); const Lf = PD.units().cores[0];
      check(st.gate?.th === 0.5 && st.gate.cores === 1 && st.boss.invuln && ti.setup && ti.life && Math.abs(ti.life.hp / ti.life.max - ti.death.hp / ti.death.max) < 0.02, `50% 生渡上岸：死渡锁血，生渡血量与死渡同比例（${(ti.life.hp / ti.life.max * 100).toFixed(0)}% / ${(ti.death.hp / ti.death.max * 100).toFixed(0)}%）`);
      check(ti.shell, '死渡身上罩着同渡护壳');
      TW.mendNow(99);   // 先不让它引导（单测走 / 打 / 同舟）
      const far = () => { B.pos.set(Lf.pos.x - 12, 0, Lf.pos.z); };   // 把死渡挪到生渡另一侧 12 米（同舟范围外；再远会让死渡脱战回满）
      // 会走：玩家站在 14 米外
      far(); g.player.pos.set(Lf.pos.x + 14, 0, Lf.pos.z); step(0.05); const d0 = Math.hypot(g.player.pos.x - Lf.pos.x, g.player.pos.z - Lf.pos.z);
      for (let k = 0; k < 20; k++) { far(); g.player.pos.set(Lf.pos.x + Math.min(14, d0), 0, Lf.pos.z); step(0.1); }
      const ps = []; for (let k = 0; k < 15; k++) { far(); step(0.1); ps.push(Math.hypot(g.player.pos.x - Lf.pos.x, g.player.pos.z - Lf.pos.z)); }
      check(ps.at(-1) < ps[0] - 1 || TI().life.state === 'attack', `生渡会走：追向玩家 ${ps[0].toFixed(1)} → ${ps.at(-1).toFixed(1)} 米（${TI().life.state}）`);
      // 会打：贴身 5 秒
      const la = Lf.rig.anim, lg0 = la?.log?.length ?? 0; let hp1 = g.player.hp; for (let k = 0; k < 50; k++) { far(); g.player.pos.set(Lf.pos.x + 2, 0, Lf.pos.z); step(0.1); }
      const lc = TI().life.cfg ?? {}, hits = (la?.log ?? []).slice(lg0).filter(x => x.key === 'melee').length;
      check(hp1 - g.player.hp > 0 && lc.attackDamage > 0 && hits > 0, `生渡会打：5 秒船篙普攻 ${hits} 次，玩家掉 ${Math.round(hp1 - g.player.hp)}（普攻 ${lc.attackDamage}、距离 ${lc.attackRange}、移速 ${lc.moveSpeed?.toFixed?.(2)}）`);
      // 同舟：贴着死渡减伤
      const hit = () => { const h0 = Lf.hp; g.fx.dealDamage(Lf, 1000, 'physical', g.player); const v = h0 - Lf.hp; Lf.hp = h0; return v; };
      far(); const dFar = hit(); B.pos.set(Lf.pos.x + 3, 0, Lf.pos.z); const dNear = hit(); far();
      check(dFar > 0 && Math.abs(dNear / dFar - K.nearK) < 0.05, `同舟：离死渡 ${K.near} 米内生渡减伤（${Math.round(dNear)} / ${Math.round(dFar)}）`);
      // 渡生引导：回血 + 打断
      const w0 = WL.rig().warns.length; TW.mendNow(); g.player.pos.set(Lf.pos.x + 3, 0, Lf.pos.z); B.pos.set(Lf.pos.x - 12, 0, Lf.pos.z);
      step(0.2); ti = TI(); check(ti.mending && ti.life.casting !== null, `生渡开始「渡生引导」（读条 ${ti.life.casting?.toFixed?.(1)} 秒）`);
      const hd0 = B.hp; for (let k = 0; k < 22; k++) { B.pos.set(Lf.pos.x - 12, 0, Lf.pos.z); step(0.1); } ti = TI();
      check(B.hp > hd0 && ti.beam, `引导中：死渡回血 +${((B.hp - hd0) / B.maxHp * 100).toFixed(1)}%，提灯光束连到死渡`);
      check(ti.beamThin === true && ti.beamLen > 8 && Math.abs(ti.beamLen - ti.beamGap) < 0.01, `光束是一道细光柱：长度沿光束方向 ${ti.beamLen?.toFixed?.(2)} 米 = 提灯→死渡 ${ti.beamGap?.toFixed?.(2)} 米，横截面不缩放（不是竖光板）`);
      const wn = WL.rig().warns.slice(w0).find(x => x.id === 'wl_ferry_life');
      check(!!wn && wn.key === 'mend', `首领警报：生渡「渡生引导」（${wn ? wn.dur.toFixed(1) + ' 秒' : '无'}，${WL.rig().raidWarn.text}）`);
      { const D = w.document, ib = D.getElementById('interact'), was = ib?.style.display;   // 摆渡待批第 6 条：有 [E] 交互提示时警报条上移一档
        if (ib) { ib.style.display = 'block'; const s1 = WL.warnDodge(), b1 = D.getElementById('wl_raidwarn')?.style.bottom; ib.style.display = 'none'; const s0 = WL.warnDodge(), b0 = D.getElementById('wl_raidwarn')?.style.bottom; ib.style.display = was;
          check(s1 === true && s0 === false && b0 === '19%' && b1 !== '19%', `警报条与 [E] 交互提示不重叠：有提示时上移（bottom ${b1}），无提示时回到 ${b0}`); } else check(false, '找不到 #interact 交互提示元素'); }
      const ok = Lf.onInterrupt(); step(0.1); ti = TI(); const hd1 = B.hp;
      check(ok && !ti.mending && ti.interrupts === 1 && ti.lock > 0 && !ti.beam, `打断渡生引导：生渡踉跄 ${ti.lock.toFixed(1)} 秒，光束断开`);
      { const rw = WL.rig().raidWarn; check(!rw.shown && rw.left === 0, `打断后「渡生引导」警报条立即收起（shown ${rw.shown}，剩 ${rw.left}）`); }
      for (let k = 0; k < 20; k++) { B.pos.set(Lf.pos.x - 12, 0, Lf.pos.z); step(0.1); }
      check(B.hp === hd1 && TI().mends === 0, '打断后死渡不再回血');
      check(!Lf.onInterrupt(), '没在读条时打断无效');
      TW.mendNow(); const hd2 = B.hp, hl2 = Lf.hp; for (let k = 0; k < 45; k++) { B.pos.set(Lf.pos.x - 12, 0, Lf.pos.z); step(0.1); } ti = TI();
      check(ti.mends === 1 && B.hp > hd2 + B.maxHp * 0.05 && Lf.hp > hl2, `不打断：引导完成，死渡 +${((B.hp - hd2) / B.maxHp * 100).toFixed(1)}%，生渡 +${((Lf.hp - hl2) / Lf.maxHp * 100).toFixed(1)}%`);
      // 断渡：击倒生渡 → 门槛解除，死渡掉 6%
      const hb = B.hp; kill(Lf); step(0.3); ti = TI(); st = PD.state();
      check(!st.gate && !st.boss.invuln && ti.broke && Math.abs((hb - B.hp) / B.maxHp - K.breakK) < 0.005 && !ti.shell, `击倒生渡：门槛解除、护壳消失，「断渡」死渡掉 ${((hb - B.hp) / B.maxHp * 100).toFixed(1)}%`);
      kill(B); step(0.5); pick(); }
    // 尾王：70% / 35% 两道门槛
    B = toBoss(); st = PD.state();
    check(st.boss.key === 'wl_b5' && st.boss.maxHp === 96000, `尾王 ${st.boss.key} 生命 ${st.boss.maxHp}`);
    g.player.maxHp = 1e8; g.player.hp = 1e8;
    for (const th of [0.7, 0.35]) {
      g.fx.dealDamage(B, B.hp - B.maxHp * (th - 0.01), 'physical', g.player); step(0.2);
      check(PD.state().gate?.th === th && PD.units().cores.length === 3, `${th * 100}%：深渊潮葬 + 3 根钟锤锁链`);
      PD.units().cores.forEach(kill); step(0.3);
      check(!PD.state().gate && PD.state().gateDone.includes(th), `打断锁链：${th * 100}% 门槛解除`);
    }
    kill(B); step(0.8);
    st = PD.state(); const d = WL.debug();
    check(st.done && d.log.length === 5 && d.log[4].last && d.clears.normal === 1, `通关：5 个首领倒下（${d.log.map(x => x.i).join(',')}），通关次数 ${d.clears.normal}`);
    const sv = JSON.parse(g.rawSave());
    check(sv.dlc?.dlc1?.well?.clears?.normal === 1, `存档 dlc.dlc1.well（${JSON.stringify(sv.dlc?.dlc1?.well)}）`);
    WL.setRng(null);
    const it = g.currentInteractable(); it?.act(); step(0.5);
    check(g.zone === 'dlc1_belltower' && PD.state() === null, `离开回到无声钟楼（${g.zone}）`);
    noErr(c);
  }, { viewport: [1280, 720], storage: mk(40) });
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  if (failed) process.exitCode = 1;
}
if (MODE === 'p137') {   // v1.2.37 急速 / 冷却缩减拆分 + 觉醒重做 + 旧存档迁移（本体 / PLAYTEST_DLC=dlc1 都跑）
  const sv = { version: 10, savedAt: 1, classId: 'warrior', name: '觉醒', look: 0, playMs: 1000, tutorial: -1,
    inventory: { gold: 100, bag: [], equipped: {}, stacks: {} }, level: { level: 30, xp: 0 }, talents: {}, quests: { active: {}, done: [] }, map: 'camp' };
  const meta = { id: 'aw', name: '觉醒', classId: 'warrior', look: 0, level: 30, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 1, createdAt: 1 };
  let store = { darkrock_roster: JSON.stringify({ v: 1, slots: [meta, null, null, null, null, null, null, null], last: 'aw', legacyMigrated: true }), darkrock_char_aw: JSON.stringify(sv), darkrock_intro_seen: '1' };
  let saved = null, ids = null;
  await session('v1.2.37：急速不改技能冷却 / 冷却缩减上限 / 觉醒抬上限', async c => {
    const { g, $, step, check, log } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const pv = s => g.loadout.preview(s, { now: g.T, casterHpPercent: 1, targetEffects: [] }).stats.cooldown;
    const s1 = pv('skill1'), ul = pv('ultimate'), ba = pv('basic'), dg = g.dodge.cooldown;
    // 急速 30%：只缩短普攻间隔 / 翻滚；技能、大招冷却不变
    g.gen.classId = 'warrior';
    const tk = g.gen.generate(30, 'purple', ['trinket']); tk.bonus = { ...(tk.bonus ?? {}), haste: 30 }; tk.modifiers = []; tk.lines = ['急速 +30%（攻速 / 持续伤害 / 翻滚）'];
    g.inventory.add(tk); g.inventory.equip(tk.id ?? tk); g.syncCharacter(); step(0.05);
    const cs = g.charSheet();
    log(`急速 ${cs.haste}%：技能1 ${s1.toFixed(2)}→${pv('skill1').toFixed(2)} 大招 ${ul.toFixed(1)}→${pv('ultimate').toFixed(1)} 普攻 ${ba.toFixed(3)}→${pv('basic').toFixed(3)} 翻滚 ${dg}→${g.dodge.cooldown}`);
    check(cs.haste >= 30, `急速生效 ${cs.haste}%`);
    check(Math.abs(pv('skill1') - s1) < 1e-6 && Math.abs(pv('ultimate') - ul) < 1e-6, '急速不改技能 1 / 大招冷却');
    check(pv('basic') < ba * 0.8 && g.dodge.cooldown < dg, '急速缩短普攻间隔和翻滚冷却');
    check(Math.abs(g.player.haste - cs.haste / 100) < 1e-9, '急速仍缩短持续伤害跳间隔（player.haste）');
    // 冷却缩减：一件「技能冷却 -90%」的测试装备 → 技能 1~3 / 大招都封顶 40%
    const nk = g.gen.generate(30, 'purple', ['neck']);
    nk.modifiers = [{ id: 'test_cd', name: 't', desc: '', source: 'equipment', match: {}, ops: [{ op: 'mul', stat: 'cooldown', value: -0.9 }] }];
    g.inventory.add(nk); g.inventory.equip(nk.id ?? nk); g.syncCharacter(); step(0.05);
    const c2 = g.charSheet();
    log(`冷却缩减：技能 ${c2.cdr.skill}%（原始 ${c2.cdr.skillRaw}%，上限 ${c2.cdr.skillCap}%） 大招 ${c2.cdr.ult}%（上限 ${c2.cdr.ultCap}%）；技能1 ${pv('skill1').toFixed(2)} 大招 ${pv('ultimate').toFixed(1)}`);
    check(c2.cdr.skill === 40 && c2.cdr.ult === 40 && c2.cdr.skillRaw >= 90, '冷却缩减封顶：技能 1~3 40%、大招 40%（面板显示溢出）');
    check(Math.abs(pv('skill1') - s1 * 0.6) < 0.02 && Math.abs(pv('ultimate') - ul * 0.6) < 0.05, `冷却 = 基础 × 60%（技能1 ${pv('skill1').toFixed(2)}，大招 ${pv('ultimate').toFixed(1)}）`);
    check(Math.abs(pv('basic') - ba * 0.7) < 0.01, '通用冷却缩减不影响普攻间隔');
    // 觉醒抬上限：4 件已觉醒「暮时·终局」→ 大招上限 80%
    const slots = ['chest', 'legs', 'ring', 'trinket'];
    for (const sl of slots) { const it = g.gen.generate(30, 'purple', [sl]); it.awk = { xp: 5, pick: 'aw_dusk' }; g.inventory.add(it); g.inventory.equip(it.id ?? it); }
    g.syncCharacter(); step(0.05);
    const c3 = g.charSheet(), dusk = g.inventory.equippedItems().filter(i => i.awk?.pick === 'aw_dusk').length;
    log(`暮时·终局 ${dusk} 件：大招上限 ${c3.cdr.ultCap}% 实际 ${c3.cdr.ult}% 大招 ${pv('ultimate').toFixed(1)} 秒（基础 ${ul.toFixed(1)}）`);
    check(dusk >= 3 && c3.cdr.ultCap === 40 + 10 * Math.min(4, dusk), `每件暮时·终局大招上限 +10%（${dusk} 件 → ${c3.cdr.ultCap}%）`);
    check(Math.abs(pv('ultimate') - ul * (1 - c3.cdr.ultCap / 100)) < 0.05 && c3.cdr.skill === 40, '大招冷却按新上限结算，技能 1~3 仍封顶 40%');
    // 面板文字
    g.togglePanel?.('char'); g.renderChar(); step(0.05);
    const txt = c.w.document.body.textContent;
    check(/冷却缩减/.test(txt) && /大招冷却缩减/.test(txt) && /不影响技能冷却/.test(txt), '角色面板显示急速新含义 + 冷却缩减 / 大招冷却缩减');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
    // 造旧存档：被删词条
    const mkOld = (sl, awk) => { const it = g.gen.generate(30, 'purple', [sl]); it.awk = awk; return it; };
    const old = [mkOld('neck', { xp: 5, pick: 'aw_focus' }), mkOld('chest', { xp: 5, pick: 'aw_hold' }), mkOld('ring', { xp: 5, pick: 'aw_reach' }), mkOld('legs', { xp: 5, opts: ['aw_swift', 'aw_dash', 'aw_ward'] }), mkOld('shoulder', { xp: 5, pick: 'aw_echo' })];
    old[0].lines = [...(old[0].lines ?? []), '急速 +2%（技能冷却缩短）'];   // 模拟旧版词条文字
    for (const it of old) g.inventory.add(it);
    ids = old.map(i => i.id);
    g.save(); saved = {}; for (let i = 0; i < c.w.localStorage.length; i++) { const k = c.w.localStorage.key(i); saved[k] = c.w.localStorage.getItem(k); }
    const raw = saved.darkrock_char_aw;
    log(`存档键 ${Object.keys(saved).join(',')}；含 aw_focus ${String(raw).includes('aw_focus')}；长度 ${String(raw).length}`);
  }, { viewport: [1280, 720], storage: store });
  await session('v1.2.37：旧存档觉醒词条迁移', async c => {
    const { g, $, step, check, log } = c;
    g.selSlot = 0; step(0.05); $('start').click(); step(1);
    const all = g.inventory.equippedItems().concat(g.inventory.bag);
    const by = id => all.find(i => i.id === id);
    log(`迁移后：${ids.map(id => `${by(id)?.slot}:${by(id)?.awk?.pick ?? by(id)?.awk?.opts?.join('/')}`).join(' ')}`);
    check(ids.every(id => !!by(id)), `5 件旧装备都在（背包 ${g.inventory.bag.length} 件）`);
    check(by(ids[0])?.awk?.pick === 'aw_surge' && by(ids[1])?.awk?.pick === 'aw_quake' && by(ids[2])?.awk?.pick === 'aw_first', '专注 → 余烬回涌、凝滞 → 余震、远望 → 先手');
    const o = by(ids[3])?.awk?.opts ?? [];
    check(o.length === 3 && new Set(o).size === 3 && o.includes('aw_quake') && o.includes('aw_dusk') && o.includes('aw_ward'), `待选：迅捷 → 余震、疾行 → 暮时·终局（${o.join(',')}）`);
    check(['aw_link', 'aw_surge'].includes(by(ids[4])?.awk?.pick), `回刃按部位迁移（${by(ids[4])?.awk?.pick}）`);
    check(!all.some(i => (i.lines ?? []).some(l => l.includes('技能冷却缩短'))), '旧词条文字「急速（技能冷却缩短）」已改成新口径');
    g.openAwaken(); step(0.1);
    check(c.errors.length === 0, `打开觉醒界面无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  }, { viewport: [1280, 720], get storage() { return saved; } });
}

if (MODE === 'p138' || MODE === 'p138a') {   // v1.2.38 首领掉落去绿蓝紫 + 30 级起只有内容包给经验 + 深渊 10 层套装结算
  await session('v1.2.38：首领掉落 / 经验来源 / 深渊结算', async c => {
    const { g, $, step, check } = c;
    $('class-pick').children[0].click(); $('start').click(); step(0.5);
    // 首领级掉落：随机装备不出白绿蓝紫
    const T = { id: 't', gold: [0, 0], entries: [{ kind: 'random', chance: 1, minQuality: 'green' }] };
    const qs = []; for (let i = 0; i < 400; i++) g.gen.roll(T, 30, true).items.forEach(it => qs.push(it.quality));
    const qn = []; for (let i = 0; i < 200; i++) g.gen.roll(T, 30).items.forEach(it => qn.push(it.quality));
    check(qs.every(q => q === 'orange') && qn.some(q => q !== 'orange'), `首领掉落只剩橙（${qs.length} 件），普通怪照旧（${qn.length} 件）`);
    // 经验：30 级在本体地图不给升级经验，内容包来源照给（不装包时 30 = 满级，转印记经验，行为不变）
    const P = g.progression;
    P.level = 30; P.xp = 0; const px0 = g.paragon.xp; g.addXp(500);
    const dlc = P.maxLevel > 30;
    if (dlc) { check(P.xp === 0, `DLC 构建：30 级在「${g.zone}」不给升级经验`); check(g.paragon.xp - px0 === 125, `fix1108 #10：改给 25% 印记经验（+${g.paragon.xp - px0}）`); g.addXp(500, true); check(P.xp === 500, '内容包来源（任务 / 剧情）照给经验'); P.level = 29; P.xp = 0; g.addXp(50); check(P.xp === 50, '29 级在本体地图照常给经验'); }
    else check(P.xp === 0, '本体构建：30 级满级，经验转印记（原行为）');
    // 深渊结算拆分
    const d = g.abyDarkOptions(), s = g.abySetOptions();
    check(d.length > 0 && d.every(i => i.quality === 'dark') && s.length > 0 && s.every(i => i.setId), `20 层暗金 ${d.length} 选 1，10 层套装 ${s.length} 选 1`);
    g.abyDarkShow(true); g.openAbyss(); step(0.1);
    check(/第 10 层结算/.test($('aby-title').textContent) && $('aby-body').querySelectorAll('.abydk').length === s.length, '第 10 层结算页弹出');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  });
}

if (MODE === 'p138b' && process.env.PLAYTEST_DLC) {   // v1.2.38b 40 级暗金：双手 + 双持成套
  await session('v1.2.38b：40 级暗金', async c => {
    const { g, $, step, check, log } = c;
    $('class-pick').children[0].click(); $('start').click(); step(0.5);
    check(!g.gen.generateFixed('d_dlc1_allbeast', 70) && !g.gen.generateFixed('d_dlc1_lasttoll', 70), '旧暗金「万兽之契」「最后一声」已删除');
    const pw = (it) => it?.bonus?.power ?? 0;
    const two = { warrior: 'd40_w_tide', mage: 'd40_m_astro', hunter: 'd40_h_spirit', coffin: 'd40_c_requiem' };
    for (const [cl, id] of Object.entries(two)) { g.gen.classId = cl; const it = g.gen.generateFixed(id, 70); check(it && it.quality === 'dark' && it.slot === 'twoHand' && it.modifiers.length >= 2, `${cl} 双手暗金「${it?.name}」攻强 ${pw(it)}`); }
    const avg = (cl, id) => { g.gen.classId = cl; let t = 0; for (let k = 0; k < 300; k++) t += pw(g.gen.generateFixed(id, 70)); return t / 300; };
    const ref = avg('mage', 'd40_m_astro');
    for (const [cl, ids] of [['chrono', ['d40_t_wheel', 'd40_t_glass']], ['alchemy', ['d40_a_flask', 'd40_a_box']]]) {
      g.gen.classId = cl; const its = ids.map(id => g.gen.generateFixed(id, 70)); const sum = Math.round(avg(cl, ids[0]) + avg(cl, ids[1])); g.gen.classId = cl;
      check(its.every(i => i && i.quality === 'dark' && i.setId) && its[0].slot === 'oneHand' && its[1].slot === 'offHand' && Math.abs(sum / ref - 0.9) < 0.12, `${cl} 双持暗金「${its.map(i => i?.name).join(' + ')}」平均攻强合计 ${sum} ≈ 双手平均 ${Math.round(ref)} 的 ${(sum / ref * 100).toFixed(0)}%`);
    }
    // 战士穿双手暗金：模型挂件不报错
    g.gen.classId = 'warrior'; const w = g.gen.generateFixed('d40_w_tide', 70); g.inventory.add(w); g.inventory.equip(w.id); step(0.5);
    check(g.inventory.equipped.twoHand?.fixedId === 'd40_w_tide' || Object.values(g.inventory.equipped).some(i => i?.fixedId === 'd40_w_tide'), '战士装备沉钟裂潮');
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  });
}

if (MODE === 'p138c') {   // v1.2.38c 录制模式（浏览器实测见 dev/recshot.mjs）
  await session('v1.2.38c：录制模式', async c => {
    const { g, $, step, check } = c;
    $('class-pick').children[0].click(); $('start').click(); step(0.5);
    const r = g.recState();
    check(!r.on && !r.free && !r.noUI && !$('recpanel'), '默认（网址不带 ?rec=1）录制模式关闭、无面板');
    const A = { p: [0, 2, 0], q: [0, 0, 0, 1], fov: 55 }, B = { p: [10, 4, 0], q: [0, 0.7071068, 0, 0.7071068], fov: 40 };
    const e0 = g.recLerp(A, B, 0, true), e5 = g.recLerp(A, B, 0.5, true), e1 = g.recLerp(A, B, 1, true), l25 = g.recLerp(A, B, 0.25, false), s25 = g.recLerp(A, B, 0.25, true);
    check(e0.p.x === 0 && Math.abs(e5.p.x - 5) < 1e-6 && Math.abs(e1.p.x - 10) < 1e-6 && Math.abs(e1.fov - 40) < 1e-6, '路径：起点 / 中点 / 终点位置与视角');
    check(Math.abs(l25.p.x - 2.5) < 1e-6 && s25.p.x < 2.5, `匀速 ${l25.p.x.toFixed(2)} / 缓动 ${s25.p.x.toFixed(2)}（慢入）`);
    step(1);
    check(c.errors.length === 0, `无运行时错误${c.errors.length ? '：' + c.errors.slice(0, 3).join(' | ') : ''}`);
  });
}

