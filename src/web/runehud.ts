// v0.9.6c 符文 HUD：血球 / 资源球 + 经验弧、技能环冷却扫光 + 就绪火星、首领阶段符印刻度、统一通知栏分类、太古掉落全屏横幅
// 全部 DOM/CSS：每帧只在数值变化时写 CSS 变量 / 类名（不读布局），动画都是 transform / opacity（合成层），手机 30 帧不加负担。
// 「HUD 粒子」设置关闭时 html.nohudfx 隐藏火星 / 余烬 / 液面波纹。
import type { Ctx } from './main';
import { res } from './reshud';
import { resMax, resDef } from '../core/Resource';

let CX!: Ctx;
const $ = (id: string) => document.getElementById(id);

// ---------- 血球 / 资源球 ----------
let hpK = -1, resK = -1, xpK = -1, lowOn = false, shOn = false, resCol = '', lastHp = -1, hpTxt = '', resTxt = '';
function setK(el: HTMLElement | null, k: number) { el?.style.setProperty('--k', k.toFixed(3)); }

export function updateOrbs(xpk: number) {
  const p = CX.player;
  const hp0 = p.hp / Math.max(1, p.maxHp), hp = Number.isFinite(hp0) ? hp0 : 0, k = Math.round(hp * 200) / 200;
  const orb = $('orb-hp');
  if (!orb) return;
  if (k !== hpK) { hpK = k; setK(orb, k); }
  // 受击：液面晃一下（Web Animations，不触发重排）
  if (lastHp >= 0 && p.hp < lastHp - p.maxHp * 0.03) (orb.querySelector('.liq') as HTMLElement | null)?.animate?.([{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '5deg' }, { rotate: '0deg' }], { duration: 420, easing: 'ease-out' });
  lastHp = p.hp;
  const low = hp < 0.3 && p.alive;
  if (low !== lowOn) { lowOn = low; orb.classList.toggle('low', low); }
  const sh = p.status.shield > 0;
  if (sh !== shOn) { shOn = sh; orb.classList.toggle('sh', sh); }
  const t = Number.isFinite(p.hp) ? `${p.hp}` : '—';   // 11-05 防 NaN：血球不显示 NaN
  if (t !== hpTxt) { hpTxt = t; $('orb-hpt')!.textContent = t; }
  // 资源球：怒气 / 奥能 / 连击点 / 反应热度
  const d = resDef(res), mx = resMax(res), rk = Math.round(res.value / mx * 100) / 100;
  const ro = $('orb-res');
  if (ro) {
    if (rk !== resK) { resK = rk; setK(ro, rk); }
    const col = res.value >= mx - 1e-6 ? d.full : d.color;
    if (col !== resCol) { resCol = col; ro.style.setProperty('--c', col); }
    const rt = mx <= 10 ? `${Math.floor(res.value + 1e-6)}/${mx}` : `${Math.round(res.value)}`;
    if (rt !== resTxt) { resTxt = rt; $('orb-rest')!.textContent = rt; ro.title = `${d.name} ${rt}`; }
  }
  const xk = Math.round(xpk * 200) / 200;
  if (xk !== xpK) { xpK = xk; $('orb-xpf')?.setAttribute('stroke-dasharray', `${(xk * 50).toFixed(1)} 100`); }
}

// ---------- 技能环：冷却扫光 + 就绪火星 ----------
const SPARKS = 8;
export function skillRuneHtml() { return `<div class="sw"></div><div class="spk">${Array.from({ length: SPARKS }, (_, i) => `<i style="--a:${i * 360 / SPARKS}deg"></i>`).join('')}</div>`; }
const cdCache = new WeakMap<HTMLElement, string>();
/** 冷却比例写进 --cd（conic 扫光），变化才写 */
export function setSweep(el: HTMLElement, k: number) {
  const v = k > 0.001 ? k.toFixed(3) : '0';
  if (cdCache.get(el) === v) return;
  cdCache.set(el, v); el.style.setProperty('--cd', v); el.classList.toggle('cding', v !== '0');
}
/** 翻滚键内容是别处生成的：缺扫光层就补上 */
export function ensureRune(el: HTMLElement | null) { if (el && !el.querySelector('.sw')) el.insertAdjacentHTML('beforeend', skillRuneHtml()); }

// ---------- 首领条：阶段符印刻度 ----------
let tickKey = '', tickEls: HTMLElement[] = [], tickVals: number[] = [], tickGone: boolean[] = [];
export function updateBossTicks(ticks: number[] | undefined, hpFrac: number) {
  const box = $('bf-ticks');
  if (!box) return;
  const tk = (ticks ?? []).filter(x => x > 0.01 && x < 0.99);
  const key = tk.join(',');
  if (key !== tickKey) {
    tickKey = key; tickVals = tk;
    box.innerHTML = tk.map(x => `<i style="left:${(x * 100).toFixed(1)}%"><b></b></i>`).join('');
    tickEls = Array.from(box.children) as HTMLElement[];
    tickGone = tk.map(x => hpFrac <= x);
    tickEls.forEach((e, i) => e.classList.toggle('gone', tickGone[i]));   // 初次显示：已过的直接灰掉，不播碎裂
    tickEls.forEach((e, i) => e.classList.toggle('past', tickGone[i]));
    return;
  }
  for (let i = 0; i < tickVals.length; i++) {
    const g = hpFrac <= tickVals[i];
    if (g !== tickGone[i]) { tickGone[i] = g; tickEls[i].classList.toggle('gone', g); if (!g) tickEls[i].classList.remove('past'); else if (CX.started) CX.audio.phaseStinger?.(); }
  }
}

/** 截图 / 测试用：假首领（不进战斗也能看首领条） */
let demo = false, demoT = 0;
export function hudDemo(on: boolean) { demo = on; demoT = CX.T; }
export function demoBoss() {
  if (!demo) return null;
  const t = CX.T - demoT;
  const hp = Math.max(0.05, 0.46 - (t % 16) * 0.02);
  return { name: '熔心暴君 · 萨卡尔', hp, phase: '二阶段 · 熔岩苏醒', ticks: [0.7, 0.35], cast: { name: '熔岩喷发', progress: (t % 2.5) / 2.5 } };
}

// ---------- 统一通知栏：拾取 / 任务 / 成就 / 升级 / 提示 ----------
export function noticeKind(text: string, color: string) {
  if (/成就|称号|🏆/.test(text)) return 'achv';
  if (/太古/.test(text)) return 'anc';
  if (/^获得|拾取|\[.+\]|套装部件|橙装|暗金/.test(text)) return 'loot';
  if (/任务|可以交了|悬赏/.test(text)) return 'quest';
  if (/升级|解锁|学会/.test(text)) return 'lvl';
  if (/^#f(66|f6|f4|f5)|^#ff9a40|^#f33/i.test(color)) return 'warn';
  return 'info';
}
/** main.toast 调用：生成一条通知（div.nt，文字保持原样，图标走 ::before） */
export function noticeEl(text: string, color: string) {
  const d = document.createElement('div');
  d.className = `nt nt-${noticeKind(text, color)}`;
  d.textContent = text.replace(/^🏆\s*/, '');
  d.style.color = color;
  return d;
}

// ---------- 太古掉落全屏横幅 ----------
let bannerNames: string[] = [], bannerTimer = 0, bannerCount = 0;
const ANC_TEXT = { small: '✹ 太古装备降世 ✹', big: '太古' };
/** v1.1.0 通用全屏横幅（同一个组件，换文字 / 配色；内容包剧情用）。ancientBanner 每次会换回太古文字 */
export function fullBanner(o: { big: string; small?: string; line?: string; theme?: 'gold' | 'dual'; ms?: number }) {
  const b = $('anc-banner'); if (!b) return;
  clearTimeout(bannerTimer); bannerNames = [];
  $('anc-small')!.textContent = o.small ?? ''; $('anc-big')!.textContent = o.big; $('anc-name')!.textContent = o.line ?? '';
  b.classList.toggle('dual', o.theme === 'dual');
  const ms = Math.max(1500, o.ms ?? 3800); (b.firstElementChild as HTMLElement).style.animationDuration = `${ms / 1000}s`;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  bannerTimer = window.setTimeout(() => { b.classList.remove('on'); bannerTimer = 0; }, ms);
}
export function ancientBanner(name: string) {
  const b = $('anc-banner');
  if (!b) return;
  if (b.classList.contains('dual') || $('anc-big')!.textContent !== ANC_TEXT.big) { b.classList.remove('dual'); $('anc-small')!.textContent = ANC_TEXT.small; $('anc-big')!.textContent = ANC_TEXT.big; (b.firstElementChild as HTMLElement).style.animationDuration = ''; clearTimeout(bannerTimer); bannerTimer = 0; }
  bannerCount++;
  if (bannerTimer) bannerNames.push(name); else bannerNames = [name];
  $('anc-name')!.textContent = bannerNames.length > 2 ? `[${bannerNames[0]}] 等 ${bannerNames.length} 件` : bannerNames.map(n => `[${n}]`).join('  ');
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');   // 只在掉落瞬间重启一次动画
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { b.classList.remove('on'); bannerTimer = 0; bannerNames = []; }, 3800);
  CX.audio.ancient?.();
}

export function runeHudDebug() {
  const q = (s: string) => document.querySelectorAll(s).length;
  return {
    orbHp: $('orb-hp')?.style.getPropertyValue('--k') ?? '', orbRes: $('orb-res')?.style.getPropertyValue('--k') ?? '', resColor: resCol,
    xpDash: $('orb-xpf')?.getAttribute('stroke-dasharray') ?? '', low: lowOn, sweeps: q('#skillbar .skill .sw'), sparks: q('#skillbar .spk i'),
    ticks: tickVals.slice(), ticksGone: tickGone.slice(), banner: $('anc-banner')?.classList.contains('on') ?? false, bannerText: $('anc-name')?.textContent ?? '', bannerCount,
    notices: Array.from(document.querySelectorAll('#toast .nt')).map(e => e.className.replace('nt nt-', '')),
  };
}

export function bindRuneHud(ctx: Ctx) { CX = ctx; }
