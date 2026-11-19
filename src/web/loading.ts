// ======================================================================
// v1.2.74 载入画面：N1 古钟徽记（03 宣发 loading_v1，index.html 内联 #anyan-loader + window.AnyanLoader）
//   页面一打开就显示（纯 CSS 浮现/熔铜流动），脚本跑起来后接管：
//   真实进度 = 已完成的加载任务权重 / 总权重（模型解码、贴图解码 + 显存上传、着色器预编译）
//   资产就绪 → 走满 → 钟体一震 + 声环 → 淡出移除（约 2.3 s）→ 开场动画 / 选角画面
//   本文件只保留真实进度统计；显示层（平滑、单调递增、提示轮换）全在 AnyanLoader 里
// ======================================================================
interface AL {
  show(o?: object): unknown; setProgress(p: number, tip?: unknown): unknown;
  setStage(t: string): unknown; finish(cb?: () => void): Promise<void>; state(): { shown: number } | null; destroy(): void;
}
const AL = (): AL | null => (window as unknown as { AnyanLoader?: AL }).AnyanLoader || null;

interface Task { label: string; w: number; done: boolean }
const tasks: Task[] = [];
const pending = new Set<Promise<unknown>>();
let raf = 0, started = false, finished = false;

/** 登记一个加载任务（权重 w ≈ 耗时占比）；返回原 promise。加载画面结束前登记的都会被等待 */
export function loadTask<T>(label: string, w: number, p: Promise<T>): Promise<T> {
  const t: Task = { label, w, done: false }; tasks.push(t);
  const q = p.then(v => v, e => { console.warn('加载任务失败', label, e); return undefined as T; }).finally(() => { t.done = true; pending.delete(q); stage(); });
  pending.add(q); stage();
  return p;
}
function real() { const tot = tasks.reduce((a, t) => a + t.w, 0); return tot ? tasks.reduce((a, t) => a + (t.done ? t.w : 0), 0) / tot : 0; }
function stage() {
  const al = AL(); if (!al || !started || finished) return;
  const cur = tasks.find(t => !t.done);
  const n = tasks.filter(t => t.done).length;
  al.setStage(cur ? `${cur.label} · ${n}/${tasks.length}` : tasks.length ? '准备场景…' : '正在接收资源…');
}
function tick() {
  // 组件内部自带平滑追赶 + 单调递增（新任务登记让真实进度回落时显示不回退）
  const al = AL(); if (al) al.setProgress(finished ? 1 : Math.min(real(), 0.99));
  raf = requestAnimationFrame(tick);
}

/** 脚本接管加载画面（真实百分比、阶段文字；提示由组件自己轮换） */
export function loadingStart() {
  if (started) return; started = true;
  const el0 = document.getElementById('anyan-loader'); if (el0) tpl = el0.cloneNode(true) as HTMLElement;   // v1.2.81 留一份标记给切区载入画面复用
  const al = AL(); if (!al) return;
  al.show();
  stage(); raf = requestAnimationFrame(tick);
}

/** 等所有已登记（含等待期间新登记）的任务完成 → 走满 → 一震 → 淡出移除 */
export async function loadingFinish() {
  while (pending.size) await Promise.all([...pending]);
  const al = AL();
  if (al) al.setStage('就绪');
  finished = true;
  cancelAnimationFrame(raf);
  if (!al || !document.getElementById('anyan-loader')) return;
  await al.finish();
}
// ----------------------------------------------------------------------
// v1.2.81 Rhett 11-06 10:31：切区载入画面（「正在前往 …」转圈）换成开机同款 N1 古钟徽记。
//   各处仍只切 #loading 的 display（travel / raid / title / DLC 不用改，测试脚本照旧等 #loading 消失）；
//   这里监听 #loading：显示 → 挂一份开机载入画面（阶段文字 = loading-text，进度按时间缓升到 92%），
//   隐藏 → 走满、钟体一震后淡出（淡出期间不挡操作）；不足 0.4 秒的短加载直接淡出、不震。
let tpl: HTMLElement | null = null;
let zl: { t0: number; raf: number; out: boolean } | null = null;
function zoneShow(text: string) {
  const al = AL(); if (!al || !tpl) return false;
  if (zl) { cancelAnimationFrame(zl.raf); al.destroy(); zl = null; }
  if (document.getElementById('anyan-loader')) return false;   // 开机载入画面还在
  const root = tpl.cloneNode(true) as HTMLElement; root.classList.add('al-zone'); document.body.appendChild(root);
  al.show({ root }); al.setStage(text);
  const z = zl = { t0: performance.now(), raf: 0, out: false };
  const tick = () => { if (zl !== z || z.out) return; const t = (performance.now() - z.t0) / 1000; al.setProgress(0.92 * (1 - Math.exp(-t / 1.4))); z.raf = requestAnimationFrame(tick); };
  z.raf = requestAnimationFrame(tick);
  return true;
}
function zoneHide() {
  const al = AL(), z = zl; if (!al || !z || z.out) return; z.out = true; cancelAnimationFrame(z.raf);
  const root = document.querySelector('#anyan-loader.al-zone') as HTMLElement | null;
  const end = () => { if (zl === z) { al.destroy(); zl = null; } };
  if (!root) { end(); return; }
  const fade = (ms: number) => { root.style.pointerEvents = 'none'; root.classList.add('al-out'); setTimeout(end, ms); };
  if (performance.now() - z.t0 < 400) { root.style.transition = 'opacity .35s ease'; fade(400); return; }
  al.setProgress(1);
  const t1 = performance.now();
  const wait = () => {
    if (zl !== z) return;
    if ((al.state()?.shown ?? 1) < 0.999 && performance.now() - t1 < 700) { setTimeout(wait, 40); return; }
    root.classList.add('al-done', 'al-toll'); setTimeout(() => fade(1150), 520);
  };
  wait();
}
/** 开机载入画面结束后调用：接管 #loading 的显示 / 隐藏 */
export function zoneLoaderInit() {
  const el = document.getElementById('loading'), tx = document.getElementById('loading-text'); if (!el || !tpl) return;
  el.classList.add('al-host');
  let vis = el.style.display === 'flex';
  new MutationObserver(() => {
    const v = el.style.display === 'flex';
    if (v && !vis) { if (!zoneShow(tx?.textContent || '')) el.classList.remove('al-host'); else el.classList.add('al-host'); }
    else if (!v && vis) zoneHide();
    vis = v;
  }).observe(el, { attributes: true, attributeFilter: ['style'] });
  if (tx) new MutationObserver(() => { if (zl && !zl.out) AL()?.setStage(tx.textContent || ''); }).observe(tx, { childList: true, characterData: true, subtree: true });
}
export function loadingDebug() { return { tasks: tasks.map(t => ({ label: t.label, w: t.w, done: t.done })), real: real(), finished, present: !!document.getElementById('anyan-loader'), al: AL()?.state() }; }
