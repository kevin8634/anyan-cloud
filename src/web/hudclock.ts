// ========== v1.2.68 小地图下方的时间条：游戏内时间 + 昼夜进度 ==========
// 游戏时钟：现实 1 秒 = 游戏 1 分钟（一天 24 分钟）；累计时间存 localStorage（各角色共用世界时钟），新世界从第 1 日 08:00 开始。
// 昼夜分段：夜 0–5 · 黎明 5–7 · 白昼 7–18 · 黄昏 18–20 · 夜 20–24。
// 目前只做显示（gameClock() 给以后的昼夜光照用）。
export const DAY_MIN = 24 * 60;
const KEY = 'darkrock_clock';
let base = 8 * 60, t0 = 0, lastSave = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function load() {
  try { const v = Number(localStorage.getItem(KEY)); if (Number.isFinite(v) && v > 0) base = v; } catch { /* 预览框没有 localStorage */ }
  t0 = now();
}
function persist(m: number) { try { localStorage.setItem(KEY, String(Math.floor(m))); } catch { /* 忽略 */ } }

/** 累计游戏分钟 */
// 11-18 Rhett「月亮运动太快」→「游戏一天等于现实半小时」：原 现实 1 秒 = 游戏 1 分钟（一天 24 分钟）→ 现实 1 秒 = 游戏 0.8 分钟（一天 30 分钟）；?off=slowclock 回旧
const RATE = (() => { try { return /[?&]off=[^&]*\bslowclock\b/.test(location.search) ? 1 : 0.8; } catch { return 0.8; } })();
const RATE_TXT = RATE === 1 ? '现实 1 分钟 = 游戏 1 小时' : '游戏一天 = 现实 30 分钟';
export function gameMinutes() { return base + (now() - t0) * RATE; }
export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
export const PHASE_NAME: Record<Phase, string> = { night: '夜', dawn: '黎明', day: '白昼', dusk: '黄昏' };
export function phaseOf(hour: number): Phase { return hour < 5 ? 'night' : hour < 7 ? 'dawn' : hour < 18 ? 'day' : hour < 20 ? 'dusk' : 'night'; }
/** 时钟：第几日、时、分、一天进度 0–1、昼夜段 */
export function gameClock(m = gameMinutes()) {
  const day = Math.floor(m / DAY_MIN) + 1, inDay = m % DAY_MIN, h = Math.floor(inDay / 60), mi = Math.floor(inDay % 60);
  return { day, h, m: mi, frac: inDay / DAY_MIN, phase: phaseOf(h), text: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` };
}
/** 测试 / 调试：直接设到某个钟点（hour 可带小数） */
export function setGameHour(hour: number) { const c = gameClock(); base = (c.day - 1) * DAY_MIN + hour * 60; t0 = now(); lastSave = base; render(true); }

let el: HTMLElement | null = null;
function build() {
  const mm = document.getElementById('minimap'); if (!mm) return;
  el = document.createElement('div'); el.id = 'mm-clock';
  el.innerHTML = `<span class="ck-ph"><i></i></span><span class="ck-bar"><b class="ck-sky"></b><b class="ck-mk"></b></span><span class="ck-t"></span>`;
  el.title = `游戏内时间（${RATE_TXT}）`;
  mm.appendChild(el);
  // 11-18 Rhett「右上角小地图没有真实时钟」：游戏时间条下再加一行现实时间（本机时钟 时:分）。?off=realclock 关
  let off = false; try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; off = `${q},${ls}`.split(',').some(n => n.trim() === 'realclock'); } catch { /* 忽略 */ }
  // 11-18 Rhett「方便录屏，给我切换清晨、正午、黄昏、夜晚的按钮」：时间条下一排四个小钮，点了直接跳到该钟点（?off=todbtn 关）
  let offT = false; try { offT = /[?&]off=[^&]*\btodbtn\b/.test(location.search); } catch { /* 忽略 */ }
  if (!offT) {
    const row = document.createElement('div'); row.id = 'mm-tod';
    for (const [lab, hr, tip] of [['晨', 6, '清晨 06:00'], ['午', 12, '正午 12:00'], ['昏', 19, '黄昏 19:00'], ['夜', 23, '夜晚 23:00']] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = lab; b.title = `切到${tip}`;
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); setGameHour(hr); persist(gameMinutes()); b.blur(); });
      row.appendChild(b);
    }
    mm.appendChild(row);
    // 11-18 Rhett 截图「时间选择按钮跟圆形按钮重叠」：桌面版右上圆形按钮（背包/地图/菜单/设置）整体下移，让出四个时段钮那一行（?off=todgap 回旧位置）
    let offG = false; try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; offG = `${q},${ls}`.split(',').some(n => n.trim() === 'todgap'); } catch { /* 忽略 */ }
    if (!offG) document.documentElement.classList.add('has-tod');
  }
  if (!off) { real = document.createElement('div'); real.id = 'mm-real'; real.title = '现实时间'; mm.appendChild(real); }
}
let real: HTMLElement | null = null;
function renderReal() { if (!real) return; const d = new Date(), t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; if (real.textContent !== t) real.textContent = t; }
let sig = '';
function render(force = false) {
  if (!el) return;
  const c = gameClock(), m = gameMinutes();
  const s = `${c.day}|${c.text}`;
  if (!force && s === sig) return; sig = s;
  el.dataset.phase = c.phase;
  (el.querySelector('.ck-mk') as HTMLElement).style.left = `${(c.frac * 100).toFixed(2)}%`;
  (el.querySelector('.ck-t') as HTMLElement).textContent = c.text;
  (el.querySelector('.ck-ph') as HTMLElement).title = `第 ${c.day} 日 · ${PHASE_NAME[c.phase]}`;
  (el.querySelector('.ck-ph i') as HTMLElement).textContent = c.phase === 'night' ? '☾' : c.phase === 'day' ? '☀' : c.phase === 'dawn' ? '◓' : '◒';
  el.title = `第 ${c.day} 日 ${c.text} · ${PHASE_NAME[c.phase]}（${RATE_TXT}）`;
  if (m - lastSave > 30) { lastSave = m; persist(m); }
}
export function initHudClock() {
  load(); build(); render(true);
  renderReal(); setInterval(() => { render(); renderReal(); }, 1000);
  addEventListener('beforeunload', () => persist(gameMinutes()));
}
export function hudClockDebug() { const c = gameClock(); return { ...c, shown: !!el && getComputedStyle(el).display !== 'none', marker: (el?.querySelector('.ck-mk') as HTMLElement | null)?.style.left ?? '' }; }
