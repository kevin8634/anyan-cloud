// fix1109b：比赛版 DLC 怪物是否用 Lux3D 模型（无 GPU jsdom）—— 内存里把 dlc1/creatures.gen 换成真实 Lux3D 怪物 GLB（不改任何文件），
//   开机 → 标题（选角背景 = 镜渊城，开机就刷怪）→ 进世界 → 逐区检查 dlc1 怪：GLB 单网格 = Lux，多块方块 = 程序化替身
//   jsdom 不解码贴图：WebP 支持探测假装通过（贴图仍为空），只核几何是否为 GLB
//   用法 PLAYTEST_DLC 不需要：node test/fix1109_luxmob.mjs [high|low]
import { bundle } from './bundle.mjs';
import { readFileSync, readdirSync } from 'fs';
import { JSDOM } from 'jsdom';
const QUAL = process.argv[2] || 'high';
const D = 'assets_aholo/dlc1/creatures/';
const glb = Object.fromEntries(readdirSync(D).filter(f => /^dlc1_.*\.glb$/.test(f) && !/_boss|^dlc1_npc/.test(f)).map(f => [f.slice(0, -4), readFileSync(D + f).toString('base64')]));
const genPlug = { name: 'pack-glb', setup(b) {
  b.onResolve({ filter: /creatures\.gen$/ }, a => a.importer.includes('/dlc/dlc1/') ? { path: 'pack-glb', namespace: 'pg' } : undefined);
  b.onLoad({ filter: /.*/, namespace: 'pg' }, () => ({ contents: `export const PACK_CREATURE_GLB = ${JSON.stringify(glb)};`, loader: 'js' }));
} };
const three = { name: 'three-shim', setup(b) { const shim = process.cwd() + '/test/threeShim.ts'; b.onResolve({ filter: /^three$/ }, a => (a.importer === shim ? undefined : { path: shim })); } };
const code = await bundle({ stdin: { contents: `import './src/dlc/dlc1/boot.ts';\nimport './src/web/main.ts';`, resolveDir: process.cwd(), sourcefile: 'dlc-entry.ts', loader: 'ts' }, define: { __DARKROCK_DLC__: JSON.stringify(['dlc1']) }, plugins: [three, genPlug] });
const html = readFileSync('src/web/index.html', 'utf8').replace('<script>/*GAME_JS*/</script>', '');
const errors = [], cons = [];
{
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
    Object.defineProperty(P, 'src', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); if (v && /^data:image\/webp/.test(v)) { Object.defineProperty(this, 'height', { configurable: true, value: 1 }); setTimeout(() => this.dispatchEvent(new w.Event('load')), 0); } else if (v) setTimeout(() => this.dispatchEvent(new w.Event('error')), 0); } });
    P.decode = function () { return Promise.reject(new Error('headless: no image decode')); };
    w.createImageBitmap = () => Promise.reject(new Error('headless: no createImageBitmap')); }
  { for (let o = w; o; o = Object.getPrototypeOf(o)) if (Object.prototype.hasOwnProperty.call(o, 'ontouchstart')) delete o.ontouchstart; }
  if (false) {   // 模拟手机：视口尺寸 + 触屏 + 粗指针
    const vp = { w: opts.viewport[0], h: opts.viewport[1] };
    Object.defineProperty(w, 'innerWidth', { configurable: true, get: () => vp.w }); Object.defineProperty(w, 'innerHeight', { configurable: true, get: () => vp.h });
    w.__vp = vp;
    if (!opts.touch) for (let o = w; o; o = Object.getPrototypeOf(o)) if (Object.prototype.hasOwnProperty.call(o, 'ontouchstart')) delete o.ontouchstart;   // jsdom 默认带 ontouchstart
    if (opts.touch) { w.ontouchstart = null; Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5 }); w.matchMedia = q => ({ matches: /coarse/.test(q), addEventListener() {}, removeEventListener() {} }); }
  }
  w.localStorage.setItem('darkrock_settings', JSON.stringify({ quality: QUAL })); w.localStorage.setItem('darkrock_intro_seen', '1');   // 模拟刷新页面：带上次的存储
  w.addEventListener('error', e => errors.push(String(e.error?.stack || e.message)));
  w.console.error = (...a) => { const t = a.join(' '); if (/GLTFLoader: Couldn't load texture/.test(t)) return; errors.push(t); cons.push(t); };   // v1.2.55 jsdom 不解码贴图（比赛版 v1.2.54 脸部贴花等 GLB 内嵌贴图），浏览器 smoke 无此错
  try { w.eval(code); } catch (e) { console.log('启动报错', e, e.stack); process.exit(1); }
  w.console.warn = (...a) => { const t = a.map(String).join(' '); if (/模型|未就绪|解析/.test(t)) cons.push('warn ' + t.slice(0, 160)); };
  w.console.info = (...a) => { const t = a.map(String).join(' '); if (/模型|解析/.test(t)) cons.push('info ' + t.slice(0, 160)); };
  while (!w.__game || w.document.getElementById('start').textContent !== '开始冒险') await new Promise(r => setTimeout(r, 20));
  const g = w.__game;
  const step = sec => { for (let i = 0; i < sec * 20; i++) { now += 50; const cbs = [...rafCbs.values()]; rafCbs.clear(); for (const cb of cbs) { try { cb(now); } catch (e) { errors.push(e.stack); } } } };
  const probe = () => { const out = {}; for (const e of g.enemies) {
    if (!String(e.z).startsWith('dlc1')) continue;
    let meshes = 0; e.rig.root.traverse(o => { if (o.isMesh && !['blob', 'eliteAura'].includes(o.name)) meshes++; });
    const lux = !!e.rig.root.userData.lux || !!e.rig.root.userData.procRig || meshes <= 2;
    const k = e.z + '/' + e.kind; out[k] ??= { lux: 0, proc: 0 }; out[k][lux ? 'lux' : 'proc']++; } return out; };
  const T = probe(); console.log('标题（开机刷出的 dlc1 怪）', JSON.stringify(T));
  g.startGame('warrior');
  for (let i = 0; i < 600 && w.document.getElementById('title').style.display !== 'none'; i++) { await new Promise(r => setTimeout(r, 100)); step(0.1); }
  step(1);
  for (const id of ['dlc1_coast', 'dlc1_belltower']) { try { g.ensureWild?.(id); } catch (e) { console.log('ensureWild', id, e.message); } }
  const W = probe(); console.log('进世界', JSON.stringify(W));
  const bad = Object.entries(W).filter(([, v]) => v.proc);
  console.log(cons.join('\n'));
  console.log(`PASS=${!bad.length && Object.keys(W).length > 0} bad=${JSON.stringify(bad)} errors=${errors.filter(e => !/Couldn't load texture/.test(e)).length}`);
  process.exit(bad.length ? 1 : 0);
}
