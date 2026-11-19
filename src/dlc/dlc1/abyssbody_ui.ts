// ======================================================================
// DLC1 渊噬之躯界面（v1.1.2）：变异界面（6 个部位卡片 + 渊化规则）+ HUD 渊化条（技能区上方，点它打开变异界面）
// 电脑：居中面板，部位 3×2 卡片；手机（html.phone）：全屏，2 列，按钮加大；渊化条放在摇杆右边、经验条上方
// 只对渊噬者（选了断绳、已解锁）显示；其他角色什么都不创建
// ======================================================================
import type { PackCtx } from '../../core/ContentPacks';
import { PARTS, PART_BY, MAX_LV, UP_COST, AB, type PartId, abyssOpen, abyssState, baseLv, lvOf, whyNot, upgrade, R, inForm, dirty, devourThr, devourR, formSec, gainK } from './abyssbody';

let ctx: PackCtx | null = null;
export const bindAbyssUi = (c: PackCtx) => { ctx = c; };
let wrap: HTMLDivElement | null = null, lastVer = -1, msg = '';

const CSS = `
#d1-aby{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(6,0,10,.6);color:#ece4f4;user-select:none;-webkit-user-select:none}
#d1-aby .aw{position:relative;width:min(1000px,96vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(30,10,40,.97),rgba(8,2,12,.98));border:2px solid #8a5ad0;border-radius:12px;box-shadow:0 0 30px rgba(150,80,255,.28),0 10px 40px #000;overflow:hidden}
#d1-aby .ah{display:flex;align-items:center;gap:14px;padding:10px 50px 8px 16px;border-bottom:1px solid rgba(180,140,255,.25);flex:none;flex-wrap:wrap}
#d1-aby .ah b{font-size:22px;letter-spacing:4px;color:#d8b8ff;text-shadow:0 0 8px rgba(160,90,255,.7)}
#d1-aby .ah i{font-style:normal;font-size:12px;color:#a898b8}
#d1-aby .chips{margin-left:auto;display:flex;gap:10px;font-size:14px;font-weight:bold;flex-wrap:wrap}
#d1-aby .chips span{padding:2px 10px;border-radius:12px;background:rgba(0,0,0,.4);white-space:nowrap}
#d1-aby .x{position:absolute;right:8px;top:6px;width:30px;height:30px;border-radius:50%;border:1px solid #a8a;background:#0008;color:#ecd;font-size:18px;cursor:pointer;line-height:26px;text-align:center}
#d1-aby .ab{overflow:auto;padding:10px 16px 14px;flex:1;min-height:0}
#d1-aby .msg:empty{display:none}
#d1-aby .msg{min-height:18px;font-size:13px;color:#ffd890;margin:0 0 6px}
#d1-aby .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#d1-aby .card{position:relative;overflow-wrap:anywhere;word-break:break-word;border:1px solid rgba(180,140,255,.28);border-radius:9px;padding:8px 10px 10px;background:rgba(0,0,0,.32);display:flex;flex-direction:column;gap:4px;min-width:0}
#d1-aby .card.off{opacity:.62}
#d1-aby .card.tmp{border-color:#ffd070;box-shadow:0 0 12px rgba(255,208,112,.35)}
#d1-aby .card .t{display:flex;align-items:center;gap:8px}
#d1-aby .card .ic{flex:none;width:38px;height:38px;border-radius:8px;border:1px solid var(--c);background:radial-gradient(circle,#2a1038,#0a0210);display:flex;align-items:center;justify-content:center}
#d1-aby .card .t b{font-size:16px;color:var(--c)}
#d1-aby .card .t em{font-style:normal;font-size:11px;color:#b8a8c8;margin-left:auto;white-space:nowrap}
#d1-aby .lv{display:flex;gap:3px}
#d1-aby .lv u{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.12)}
#d1-aby .lv u.on{background:var(--c)}
#d1-aby .lv u.tp{background:#ffd070}
#d1-aby .look{font-size:11.5px;color:#a898b8}
#d1-aby .cur{font-size:12.5px;color:#e0c8ff}
#d1-aby .nx{font-size:12px;color:#f0d890}
#d1-aby .why{font-size:11.5px;color:#ff9a7a}
#d1-aby .btn{margin-top:auto;padding:6px 6px;border-radius:7px;border:1px solid #9a6ae0;background:rgba(110,50,170,.4);color:#f4ecff;font-size:13px;font-weight:bold;cursor:pointer;white-space:nowrap}
#d1-aby .btn[disabled]{opacity:.45;cursor:default}
#d1-aby .rules{margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
#d1-aby .rule{border:1px solid rgba(180,140,255,.22);border-radius:8px;padding:8px 10px;background:rgba(40,10,60,.3);font-size:12.5px;line-height:1.55}
#d1-aby .rule b{display:block;font-size:14px;color:#d8b8ff;margin-bottom:2px}
html.phone #d1-aby .aw{width:100vw;max-height:100vh;height:100vh;border-radius:0;border:none}
html.phone #d1-aby .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
html.phone #d1-aby .rules{grid-template-columns:1fr}
html.phone #d1-aby .ah b{font-size:18px}
html.phone #d1-aby .chips{gap:6px;font-size:12px;margin-left:0}
html.phone #d1-aby .btn{padding:9px 4px}
html.phone #d1-aby .x{width:38px;height:38px;font-size:22px;line-height:34px}
#d1-abybar{position:fixed;left:50%;bottom:calc(170px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;width:300px;cursor:pointer;touch-action:manipulation;font:bold 12px/1 sans-serif;color:#ecdcff;text-shadow:0 1px 2px #000}
#d1-abybar .bt{display:flex;justify-content:space-between;margin-bottom:3px;white-space:nowrap}
#d1-abybar .bt small{font-weight:normal;color:#c8b0e8}
#d1-abybar .bb{position:relative;height:10px;border-radius:5px;border:1px solid #6a3aa8;background:rgba(10,2,16,.8);overflow:hidden;box-shadow:0 0 6px rgba(0,0,0,.7)}
#d1-abybar .bb i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#4a1a8a,#a060ff);transition:width .1s linear}
#d1-abybar .bb s{position:absolute;top:0;bottom:0;left:70%;width:1px;background:#ff6a6a;opacity:.8}
#d1-abybar.hi .bb i{background:linear-gradient(90deg,#7a1a5a,#ff4a7a)}
#d1-abybar.form .bb{border-color:#d0a0ff;box-shadow:0 0 12px rgba(180,110,255,.9)}
#d1-abybar.form .bb i{background:linear-gradient(90deg,#a060ff,#ffd0ff,#a060ff);background-size:200% 100%;animation:abyf 1s linear infinite}
#d1-abybar.form .bt b{color:#ffd0ff}
@keyframes abyf{to{background-position:-200% 0}}
html.phone #d1-abybar{left:180px;transform:none;bottom:calc(26px + env(safe-area-inset-bottom,0px));width:210px;font-size:11px}
html.phone #d1-abybar .bb{height:8px}
`;
const css = () => { if (!document.getElementById('d1-aby-css')) { const st = document.createElement('style'); st.id = 'd1-aby-css'; st.textContent = CSS; document.head.appendChild(st); } };

/** 部位小图标（svg） */
const ICONS: Record<PartId, string> = {
  head: '<path d="M8 22c-2-7 1-13 6-15-3 4-3 8-1 11M30 22c2-7-1-13-6-15 3 4 3 8 1 11" stroke="var(--c)" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="19" cy="24" r="7" fill="#1a1020" stroke="var(--c)"/>',
  eye: '<ellipse cx="19" cy="19" rx="7" ry="12" fill="var(--c)"/><ellipse cx="19" cy="19" rx="2" ry="8" fill="#140008"/>',
  arm: '<path d="M10 30l5-14 4 6 3-12 4 9 4-4-3 15z" fill="var(--c)" opacity=".85" stroke="#e0d0ff" stroke-width="1"/>',
  heart: '<path d="M19 30C8 22 9 12 15 12c2 0 4 2 4 4 0-2 2-4 4-4 6 0 7 10-4 18z" fill="var(--c)"/><path d="M19 16l-2 5 3 2-2 4" stroke="#401000" stroke-width="1.5" fill="none"/>',
  spine: '<path d="M19 6v26" stroke="#3a5a6a" stroke-width="2"/><g fill="var(--c)"><path d="M19 8l-6 3 6 2z"/><path d="M19 14l-7 3 7 2z"/><path d="M19 20l-7 3 7 2z"/><path d="M19 26l-6 3 6 2z"/></g>',
  shadow: '<ellipse cx="19" cy="31" rx="13" ry="3" fill="#000"/><path d="M12 31c-3-8 3-10 0-18M19 31c2-9-3-12 1-22M26 31c3-8-2-10 2-17" stroke="var(--c)" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
};
const icon = (p: PartId) => `<svg viewBox="0 0 38 38" width="34" height="34">${ICONS[p]}</svg>`;

export const abyssUiOpen = () => !!wrap;
export function openAbyssUI() {
  if (!abyssOpen() || !abyssState().on) { ctx?.toast('渊噬之躯只对渊噬者开放', '#ff9a40'); return false; }
  css();
  if (!wrap) {
    wrap = document.createElement('div'); wrap.id = 'd1-aby';
    const stop = (e: Event) => e.stopPropagation();
    ['mousedown', 'touchstart', 'pointerdown', 'wheel', 'click'].forEach(k => wrap!.addEventListener(k, stop, { passive: true } as AddEventListenerOptions));
    wrap.addEventListener('click', onClick);
    document.body.appendChild(wrap);
    window.addEventListener('keydown', onKey, true);
  }
  msg = ''; lastVer = -1; render(); return true;
}
export function closeAbyssUI() { if (!wrap) return; wrap.remove(); wrap = null; window.removeEventListener('keydown', onKey, true); }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeAbyssUI(); } }
function onClick(e: Event) {
  const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (!b) return;
  if (b.dataset.a === 'x') { closeAbyssUI(); return; }
  if (b.dataset.a === 'up') { const p = b.dataset.p as PartId; msg = upgrade(p) ? `「${PART_BY[p].name}」升到 ${baseLv(p)} 级` : `${PART_BY[p].name}：${whyNot(p) ?? ''}`; lastVer = -1; render(); }
}

function render() {
  if (!wrap) return;
  lastVer = dirty;
  const S = abyssState();
  const cards = PARTS.map(p => {
    const b = baseLv(p.id), l = lvOf(p.id), tmp = l > b;
    const pips = Array.from({ length: MAX_LV }, (_, i) => `<u class="${i < b ? 'on' : i < l ? 'tp' : ''}"></u>`).join('');
    const w = whyNot(p.id);
    const nx = b >= 1 && b < MAX_LV ? `<div class="nx">${tmp ? '永久升到' : '下一级'} ${b + 1} 级：${p.lv[b]}</div>` : '';
    const btn = b >= 1 && b < MAX_LV ? `<button class="btn" data-a="up" data-p="${p.id}" ${w ? 'disabled' : ''}>升到 ${b + 1} 级 · 渊质 ${UP_COST[b + 1]}</button>` : b >= MAX_LV ? '<button class="btn" disabled>已满级</button>' : '';
    return `<div class="card${b ? '' : ' off'}${tmp ? ' tmp' : ''}" data-card="${p.id}" style="--c:${p.color}">
      <div class="t"><span class="ic">${icon(p.id)}</span><b>${p.slot} · ${p.name}</b><em>${b ? `${l} 级${tmp ? '（临时 +1）' : ''}` : '未变异'}</em></div>
      <div class="lv">${pips}</div>
      <div class="look">${p.look}</div>
      ${l ? `<div class="cur">${p.lv[l - 1]}</div>` : `<div class="why">${w ?? ''}</div>`}
      ${nx}${b && w && b < MAX_LV ? `<div class="why">${w}</div>` : ''}${btn}</div>`;
  }).join('');
  const rules = `<div class="rules">
    <div class="rule"><b>渊化值</b>击杀 +${AB.gain.kill}（精英 +${AB.gain.elite}，首领 +${AB.gain.boss}）· 受击 +${AB.gain.hurt} · 吞噬 +${AB.gain.devour}；获取 ×${gainK().toFixed(2)}。${AB.decayAfter} 秒没有新来源开始消退。<br><span style="color:#ff8a9a">≥ ${AB.high}：怪物变强（你受到的伤害 +15%），持续 ${AB.highHurtAfter} 秒后每秒掉 1% 生命</span></div>
    <div class="rule"><b>渊形态</b>渊化值满了进入，持续 ${formSec()} 秒：造成伤害 +35%、击杀引发渊爆、吞噬冷却减半、影触须抽打；你受到的伤害 +10%。结束后 3 秒内渊化值不增长。</div>
    <div class="rule"><b>吞噬（T）</b>处决 ${devourR()} 米内最近的、生命 ≤ ${Math.round(devourThr() * 100)}% 的敌人（首领改为撕咬），回血并充渊化值、得渊质；吞精英有 35% 几率得到 60 秒的临时变异。</div></div>`;
  const temp = R.temp ? `<span style="color:#ffd070">临时变异 ${PART_BY[R.temp.part].name} ${Math.ceil(R.temp.left)} 秒</span>` : '';
  wrap.innerHTML = `<div class="aw"><button class="x" data-a="x">×</button>
    <div class="ah"><b>渊噬之躯</b><i>吞下首领的回响，让身体长出它们的力量</i>
      <div class="chips"><span style="color:#e0c0ff">渊质 ${S.ess}</span><span style="color:${inForm() ? '#ffd0ff' : R.val >= AB.high ? '#ff8a9a' : '#c8a8ff'}">${inForm() ? `渊形态 ${R.form.toFixed(1)} 秒` : `渊化值 ${Math.floor(R.val)}`}</span>${temp}</div></div>
    <div class="ab"><div class="msg">${msg}</div><div class="grid">${cards}</div>${rules}</div></div>`;
}

// ---------------------------------------------------------------- HUD 渊化条
let bar: HTMLDivElement | null = null, acc = 0, lastTxt = '';
export function abyssUiUpdate(dt: number) {
  if ((acc += dt) < 0.1) return;
  acc = 0;
  const show = abyssOpen() && !!abyssState().on;
  if (!show) { if (bar) bar.style.display = 'none'; if (wrap) closeAbyssUI(); return; }
  if (wrap && dirty !== lastVer) render();
  else if (wrap) { const c = wrap.querySelector('.chips span:nth-child(2)'); if (c) c.textContent = inForm() ? `渊形态 ${R.form.toFixed(1)} 秒` : `渊化值 ${Math.floor(R.val)}`; }
  if (!bar) {
    css();
    bar = document.createElement('div'); bar.id = 'd1-abybar';
    bar.innerHTML = '<div class="bt"><b></b><small></small></div><div class="bb"><i></i><s></s></div>';
    const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); openAbyssUI(); };
    bar.addEventListener('mousedown', go); bar.addEventListener('touchstart', go, { passive: false });
    document.body.appendChild(bar);
  }
  bar.style.display = wrap ? 'none' : '';
  const f = inForm(), hi = !f && R.val >= AB.high;
  bar.classList.toggle('form', f); bar.classList.toggle('hi', hi);
  (bar.querySelector('.bb i') as HTMLElement).style.width = `${Math.max(0, Math.min(100, R.val))}%`;
  const txt = f ? `渊形态 ${R.form.toFixed(1)} 秒|渊噬之躯 ›` : `渊化值 ${Math.floor(R.val)}${hi ? ' · 危险' : ''}|${R.temp ? `临时变异 ${Math.ceil(R.temp.left)} 秒 · ` : ''}渊噬之躯 ›`;
  if (txt !== lastTxt) { lastTxt = txt; const [a, b] = txt.split('|'); (bar.querySelector('.bt b') as HTMLElement).textContent = a; (bar.querySelector('.bt small') as HTMLElement).textContent = b; }
}
export const abyssBarState = () => ({ el: !!bar, shown: !!bar && bar.style.display !== 'none', text: bar?.textContent ?? '', form: !!bar?.classList.contains('form'), hi: !!bar?.classList.contains('hi') });
