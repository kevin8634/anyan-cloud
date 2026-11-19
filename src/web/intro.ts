// v0.9.2f 登录动画：开场（岩层裂开 → 熔光 → 标题逐字落下 → 金光扫过 → 「点击任意处继续」）、
// 标题画面常驻效果（余烬粒子 + 标题流光）、进入游戏的过场（金色闪光淡出）。
// 纯 DOM + 2D canvas，不碰 three.js 场景；没有 2D canvas 的环境（jsdom 自动化测试）自动跳过开场。
import { GAME_NAME_MAIN, GAME_NAME_SUB, GAME_TAGLINE, GAME_VERSION } from './version';
import { INTRO_ART } from './assets.gen';

const LS_KEY = 'darkrock_intro';            // 'off' = 关闭开场动画
let ls: Storage | null = null;
try { ls = window.localStorage; } catch { ls = null; }

export const introEnabled = () => { try { return ls?.getItem(LS_KEY) !== 'off'; } catch { return true; } };
export const setIntroEnabled = (on: boolean) => { try { ls?.setItem(LS_KEY, on ? 'on' : 'off'); } catch { /* 无存储 */ } };

interface AudioLike { unlock(): void; phaseStinger(): void; portal(): void; introDone?: (() => void) | null; }

// ---------------- 余烬粒子（开场和标题画面共用） ----------------
interface Ember { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number; }
class Embers {
  cv: HTMLCanvasElement; g: CanvasRenderingContext2D; list: Ember[] = []; run = false; last = 0; rate: number; burstQ = 0;
  constructor(parent: HTMLElement, rate: number, cls: string) {
    this.cv = document.createElement('canvas'); this.cv.className = cls;
    parent.insertBefore(this.cv, parent.firstChild);
    this.g = this.cv.getContext('2d')!; this.rate = rate;
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize() { const d = Math.min(2, window.devicePixelRatio || 1); this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.g.setTransform(d, 0, 0, d, 0, 0); }
  spawn(x = Math.random() * innerWidth, y = innerHeight + 10, burst = false) {
    const a = burst ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 0.6, s = burst ? 60 + Math.random() * 220 : 25 + Math.random() * 60;
    const max = burst ? 0.6 + Math.random() * 0.8 : 3 + Math.random() * 4;
    this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0.8 + Math.random() * (burst ? 2.2 : 1.8), life: max, max, hue: 18 + Math.random() * 30 });
  }
  burst(x: number, y: number, n = 26) { for (let i = 0; i < n; i++) this.spawn(x, y, true); }
  start() { if (this.run) return; this.run = true; this.last = performance.now(); requestAnimationFrame(t => this.tick(t)); }
  stop() { this.run = false; this.g.clearRect(0, 0, innerWidth, innerHeight); this.list.length = 0; }
  tick(t: number) {
    if (!this.run) return;
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    this.burstQ += this.rate * dt; while (this.burstQ >= 1) { this.burstQ--; this.spawn(); }
    const g = this.g; g.clearRect(0, 0, innerWidth, innerHeight); g.globalCompositeOperation = 'lighter';
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]; e.life -= dt; if (e.life <= 0) { this.list.splice(i, 1); continue; }
      e.vx += Math.sin(t / 700 + e.y / 90) * 8 * dt; e.vy -= 6 * dt; e.vx *= 0.99; e.x += e.vx * dt; e.y += e.vy * dt;
      const k = e.life / e.max, a = Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 8);
      const rg = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
      rg.addColorStop(0, `hsla(${e.hue + 15},100%,75%,${a})`); rg.addColorStop(0.35, `hsla(${e.hue},100%,55%,${a * 0.6})`); rg.addColorStop(1, `hsla(${e.hue},100%,40%,0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(e.x, e.y, e.r * 4, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    requestAnimationFrame(tt => this.tick(tt));
  }
}

const canvas2d = () => { try { return !!document.createElement('canvas').getContext('2d'); } catch { return false; } };

// ---------------- 开场动画 ----------------
let introEl: HTMLElement | null = null;
let introOn = false;
let introEmbers: Embers | null = null;
let finishFn: (() => void) | null = null;
export const introActive = () => introOn;

/** 标题文字（游戏名逐字 span），开场和标题画面共用 */
export function titleHtml(name = GAME_NAME_MAIN) { return [...name].map((c, i) => `<span style="--i:${i}">${c}</span>`).join(''); }
export const subText = () => `${GAME_TAGLINE} · ${GAME_VERSION}`;

/**
 * 播放开场。force = 设置里「重看开场」；否则按开关 / 环境判断是否播放。
 * onDone 在开场淡出时调用（用于触发标题画面的入场动画）。
 */
export function playIntro(audio: AudioLike, onDone: () => void, force = false): boolean {
  const auto = /[?&]intro=0/.test(location.search) || (!force && !/[?&]intro=1/.test(location.search) && (navigator.webdriver || !introEnabled()));
  const pre = document.getElementById('intro-pre');   // 页面脚本解析期间的黑色遮罩（避免先闪一下标题画面）
  if (introOn || auto || !canvas2d()) { pre?.remove(); onDone(); return false; }
  introOn = true;
  // v1.2.54 电影感序幕（比赛包有 INTRO_ART 才播）：三张场景概念图依次推镜 + 题字 → 岩层裂开 → 标题落在概念图上
  if (INTRO_ART.length) { pre?.remove(); playCine(audio, () => rockIntro(audio, onDone)); return true; }
  return rockIntro(audio, onDone, pre);
}
const CINE_LINES = ['潮声之下，古钟未眠', '钟楼倾覆，回响不绝', '镜中之城，倒映深渊'];
const CINE_SEC = 3.6;
function playCine(audio: AudioLike, next: () => void) {
  const el = document.createElement('div'); el.id = 'intro-cine';
  el.innerHTML = INTRO_ART.map((u, i) => `<div class="cf cf${i % 3}" style="background-image:url(${u});animation-delay:${(i * CINE_SEC).toFixed(2)}s"><b style="animation-delay:${(i * CINE_SEC + 0.7).toFixed(2)}s">${CINE_LINES[i] ?? ''}</b></div>`).join('')
    + '<div class="cine-bar top"></div><div class="cine-bar bot"></div><div class="in-skip">跳过 ›</div>';
  document.body.appendChild(el);
  const emb = canvas2d() ? new Embers(el, 10, 'in-embers') : null; emb?.start();
  let gone = false;
  const go = () => { if (gone) return; gone = true; clearTimeout(t); window.removeEventListener('keydown', onKey, true); try { audio.unlock(); } catch { /* 无音频 */ }
    next(); el.classList.add('out'); window.setTimeout(() => { emb?.stop(); el.remove(); }, 900); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'F11' || e.key === 'F12') return; go(); };
  const t = window.setTimeout(go, INTRO_ART.length * CINE_SEC * 1000 - 300);
  el.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* 无音频 */ } go(); });
  window.addEventListener('keydown', onKey, true);
}
function rockIntro(audio: AudioLike, onDone: () => void, pre: HTMLElement | null = null): boolean {
  const el = introEl = document.createElement('div'); el.id = 'intro';
  if (INTRO_ART.length) el.style.setProperty('--in-bg', `url(${INTRO_ART[0]})`), el.classList.add('has-bg');
  el.innerHTML = `<div class="in-bgimg"></div><div class="in-glow"></div><div class="in-rock top"></div><div class="in-rock bot"></div>
    <svg class="in-crack" viewBox="0 0 1000 120" preserveAspectRatio="none"><path d="M0 62 L90 55 L150 70 L240 52 L310 66 L380 48 L450 64 L500 56 L560 68 L630 50 L700 63 L770 47 L850 66 L920 54 L1000 60"/></svg>
    <div class="in-logo"><h1>${titleHtml()}</h1><div class="in-subname">${GAME_NAME_SUB}</div><div class="in-sub">${subText()}</div></div>
    <div class="in-hint">点击任意处继续</div><div class="in-skip">跳过 ›</div>`;
  document.body.appendChild(el); pre?.remove();
  introEmbers = new Embers(el, 22, 'in-embers'); introEmbers.start();
  // 每个字落地时溅出余烬
  const chars = el.querySelectorAll('.in-logo h1 span');
  const timers: number[] = [];
  chars.forEach((c, i) => timers.push(window.setTimeout(() => {
    const r = (c as HTMLElement).getBoundingClientRect(); introEmbers?.burst(r.left + r.width / 2, r.top + r.height * 0.75, 22);
  }, 1500 + i * 260 + 220)));
  timers.push(window.setTimeout(() => el.classList.add('ready'), 3300));
  let done = false;
  const finish = () => {
    if (done) return; done = true; finishFn = null;
    timers.forEach(clearTimeout);
    try { audio.unlock(); audio.phaseStinger(); audio.introDone?.(); } catch { /* 无音频 */ }   // v1.2.48 introDone：开场旁白（有配音的构建）
    el.classList.add('ready', 'out');
    window.removeEventListener('keydown', onKey, true);
    onDone();
    window.setTimeout(() => { introEmbers?.stop(); introEmbers = null; el.remove(); introEl = null; introOn = false; }, 900);
  };
  finishFn = finish;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'F11' || e.key === 'F12') return; finish(); };
  el.addEventListener('pointerdown', finish);
  window.addEventListener('keydown', onKey, true);
  return true;
}
/** 测试 / 调试：立刻结束开场 */
export function skipIntro() { finishFn?.(); }

// ---------------- 标题画面常驻效果 ----------------
let titleEmbers: Embers | null = null;
/** 标题画面：余烬 + 标题流光；visible=false 时停掉粒子省电 */
export function titleFx(visible: boolean) {
  const t = document.getElementById('title'); if (!t) return;
  if (visible) {
    if (!titleEmbers && canvas2d()) titleEmbers = new Embers(t, 7, 'title-embers');
    titleEmbers?.start();
  } else titleEmbers?.stop();
}
/** 开场结束后，标题画面各块依次入场 */
export function titleEnter() {
  const t = document.getElementById('title'); if (!t) return;
  t.classList.remove('t-enter'); void t.offsetWidth; t.classList.add('t-enter');
  window.setTimeout(() => t.classList.remove('t-enter'), 2200);
}

// ---------------- 进入游戏的过场 ----------------
/** 点「开始冒险」：金色闪光从角色位置铺满屏幕再淡出（游戏在闪光后面同步开始） */
export function enterFlash(audio: AudioLike) {
  if (!canvas2d()) return;
  const f = document.createElement('div'); f.id = 'enter-fx';
  f.innerHTML = `<div class="ef-ring"></div><div class="ef-name">${GAME_NAME_MAIN}<small>${GAME_NAME_SUB}</small></div>`;
  document.body.appendChild(f);
  try { audio.portal(); } catch { /* 无音频 */ }
  window.setTimeout(() => f.remove(), 1700);
}
