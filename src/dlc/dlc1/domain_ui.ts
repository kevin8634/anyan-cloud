// ======================================================================
// DLC1 钟楼领地界面（v1.1.1）：建筑 / 回响居民 / 钟律 三页 + 镜渊城里的入口胶囊（靠近地块显示该建筑）
// 电脑：居中面板，建筑 4×2 卡片；手机（html.phone）：全屏，单列滚动，按钮加大
// ======================================================================
import type { PackCtx } from '../../core/ContentPacks';
import { BUILDINGS, BY_ID, RESIDENTS, MAX_LV, type BId, lvOf, building, progress, costOf, minutesOf, whyNot, startBuild, rush, rushCost, service, offered, todayRule, ringRule,
  residentWhy, resCap, domainState, domainOpen, domainMods, dirty, queueCap, queued, now } from './domain';
import { MIRROR_ID, MIRROR_O } from './mirror';
import { chimeCharge } from './bellchime';

let ctx: PackCtx | null = null;
export const bindDomainUi = (c: PackCtx) => { ctx = c; };
type Tab = 'b' | 'r' | 'l';
let wrap: HTMLDivElement | null = null, tab: Tab = 'b', focus: BId | null = null, lastVer = -1, lastSec = -1;

const CSS = `
#d1-dom{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,6,8,.55);font-family:inherit;color:#e4ecea;user-select:none;-webkit-user-select:none}
#d1-dom .dw{position:relative;width:min(1060px,96vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(10,30,36,.97),rgba(4,12,16,.98));border:2px solid #4ab8c8;border-radius:12px;box-shadow:0 0 30px rgba(60,200,230,.25),0 10px 40px #000;overflow:hidden}
#d1-dom .dh{display:flex;align-items:center;gap:14px;padding:10px 50px 8px 16px;border-bottom:1px solid rgba(127,232,240,.25);flex:none;flex-wrap:wrap}
#d1-dom .dh b{font-size:22px;letter-spacing:4px;color:#9ff0ff;text-shadow:0 0 8px rgba(80,220,240,.6)}
#d1-dom .dh i{font-style:normal;font-size:12px;color:#9ab8b8}
#d1-dom .mats{margin-left:auto;display:flex;gap:12px;font-size:14px;font-weight:bold}
#d1-dom .mats span{padding:2px 10px;border-radius:12px;background:rgba(0,0,0,.35);white-space:nowrap}
#d1-dom .x{position:absolute;right:8px;top:6px;width:30px;height:30px;border-radius:50%;border:1px solid #6aa;background:#0008;color:#cde;font-size:18px;cursor:pointer;line-height:26px;text-align:center}
#d1-dom .tabs{display:flex;gap:6px;padding:8px 16px 0;flex:none}
#d1-dom .tabs button{flex:none;padding:6px 18px;border-radius:8px 8px 0 0;border:1px solid rgba(127,232,240,.3);border-bottom:none;background:rgba(0,0,0,.3);color:#9ab8b8;font-size:15px;cursor:pointer}
#d1-dom .tabs button.on{background:rgba(60,160,180,.25);color:#e8ffff;font-weight:bold}
#d1-dom .db{overflow:auto;padding:10px 16px 14px;flex:1;min-height:0;border-top:1px solid rgba(127,232,240,.25)}
#d1-dom .sum{font-size:12.5px;color:#a8c8c8;margin:0 0 8px}
#d1-dom .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
#d1-dom .card{overflow-wrap:anywhere;word-break:break-word;position:relative;border:1px solid rgba(127,232,240,.25);border-radius:9px;padding:8px 10px 10px;background:rgba(0,0,0,.28);display:flex;flex-direction:column;gap:4px;min-width:0}
#d1-dom .card.f{border-color:#ffd070;box-shadow:0 0 12px rgba(255,208,112,.35)}
#d1-dom .card .t{display:flex;align-items:baseline;gap:6px}
#d1-dom .card .t b{font-size:16px;color:var(--c)}
#d1-dom .card .t em{font-style:normal;font-size:11px;color:#9ab;margin-left:auto;white-space:nowrap}
#d1-dom .lv{display:flex;gap:3px}
#d1-dom .lv u{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.12)}
#d1-dom .lv u.on{background:var(--c)}
#d1-dom .st{font-size:12px;color:#c8d8d8;min-height:16px}
#d1-dom .cur{font-size:12px;color:#9ff0ff}
#d1-dom .nx{font-size:12px;color:#f0d890}
#d1-dom .cost{font-size:12px;color:#ccc}
#d1-dom .cost .no{color:#ff7a6a}
#d1-dom .bar{height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
#d1-dom .bar i{display:block;height:100%;background:linear-gradient(90deg,#c08a30,#ffe08a)}
#d1-dom .btns{display:flex;gap:6px;margin-top:auto;flex-wrap:wrap}
#d1-dom .btn{flex:1;min-width:70px;padding:6px 6px;border-radius:7px;border:1px solid #4ab8c8;background:rgba(40,120,140,.35);color:#e8ffff;font-size:13px;font-weight:bold;cursor:pointer;white-space:nowrap}
#d1-dom .btn.gold{border-color:#d0a040;background:rgba(160,110,30,.35);color:#ffe8b0}
#d1-dom .btn[disabled]{opacity:.45;cursor:default}
#d1-dom .why{font-size:11.5px;color:#ff9a7a}
#d1-dom .rl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#d1-dom .rc{border:1px solid rgba(127,232,240,.2);border-radius:8px;padding:6px 10px;background:rgba(0,0,0,.25);font-size:12.5px}
#d1-dom .rc b{color:#b8f0ff;font-size:14px}
#d1-dom .rc.off{opacity:.5}
#d1-dom .rc.off b{color:#aaa}
#d1-dom .rules{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
#d1-dom .rule{border:2px solid rgba(255,208,112,.35);border-radius:10px;padding:10px;background:rgba(40,30,10,.35);display:flex;flex-direction:column;gap:6px}
#d1-dom .rule b{font-size:18px;color:#ffe08a;letter-spacing:2px}
#d1-dom .rule.on{border-color:#ffe08a;box-shadow:0 0 16px rgba(255,224,138,.4);background:rgba(90,70,20,.45)}
#d1-dom .rule span{font-size:13px}
#d1-dom .msg{min-height:18px;font-size:13px;color:#9ff0ff;margin-top:8px}
html.phone #d1-dom .dw{width:100vw;max-height:100vh;height:100vh;border-radius:0;border:none}
html.phone #d1-dom .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
html.phone #d1-dom .rl{grid-template-columns:repeat(2,minmax(0,1fr))}
html.phone #d1-dom .dh b{font-size:18px}
html.phone #d1-dom .mats{gap:6px;font-size:12px;margin-left:0}
html.phone #d1-dom .btn{padding:9px 4px;font-size:13px}
html.phone #d1-dom .x{width:38px;height:38px;font-size:22px;line-height:34px}
#d1-dompill{position:fixed;left:50%;bottom:calc(170px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;padding:7px 18px;border-radius:20px;border:2px solid #4ab8c8;background:rgba(6,24,30,.88);color:#cff8ff;font:bold 14px/1.3 sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 0 12px rgba(60,200,230,.35);touch-action:manipulation}
#d1-dompill small{color:#ffd890;font-weight:normal;margin-left:6px}
html.phone #d1-dompill{bottom:auto;top:calc(96px + env(safe-area-inset-top,0px));font-size:12px;padding:5px 14px}
`;
const fmt = (n: number) => n >= 10000 ? (n / 10000).toFixed(n % 10000 ? 1 : 0) + ' 万' : String(n);
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export const domainUiOpen = () => !!wrap;
export function openDomainUI(f: BId | null = null, t: Tab = 'b') {
  if (!domainOpen() || !domainState().on) { ctx?.toast('钟楼领地只对守钟人开放', '#ff9a40'); return; }
  focus = f; tab = t;
  if (!document.getElementById('d1-dom-css')) { const st = document.createElement('style'); st.id = 'd1-dom-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!wrap) {
    wrap = document.createElement('div'); wrap.id = 'd1-dom';
    const stop = (e: Event) => e.stopPropagation();
    ['mousedown', 'touchstart', 'pointerdown', 'wheel', 'click'].forEach(k => wrap!.addEventListener(k, stop, { passive: true } as AddEventListenerOptions));
    wrap.addEventListener('click', onClick);
    document.body.appendChild(wrap);
    window.addEventListener('keydown', onKey, true);
  }
  lastVer = -1; render();
}
export function closeDomainUI() { if (!wrap) return; wrap.remove(); wrap = null; window.removeEventListener('keydown', onKey, true); }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeDomainUI(); } }
let msg = '';
function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (!el) { if (e.target === wrap) closeDomainUI(); return; }
  const a = el.dataset.a!, id = el.dataset.id as BId;
  ctx?.synth?.()?.tone({ f: 740, type: 'triangle', dur: 0.05, gain: 0.03 });
  if (a === 'x') return closeDomainUI();
  if (a === 'tab') { tab = el.dataset.t as Tab; msg = ''; }
  else if (a === 'build') { if (startBuild(id)) msg = `开始${lvOf(id) ? '扩建' : '重建'}「${BY_ID[id].name}」`; }
  else if (a === 'rush') { if (rush(id)) msg = `「${BY_ID[id].name}」加速完成`; }
  else if (a === 'svc') {
    if (id === 'belfry') { tab = 'l'; msg = ''; }
    else if (id === 'archive') { tab = 'r'; msg = ''; }
    else { const r = service(id); msg = r ?? ''; if (id === 'dock' && r === '渡船起航') { closeDomainUI(); return; } }
  } else if (a === 'rule') { if (ringRule(el.dataset.r!)) msg = '钟声在镜渊城上空回荡'; }
  lastVer = -1; render();
}
function costHtml(id: BId): string {
  const l = lvOf(id); if (l >= MAX_LV) return '';
  const c = costOf(id, l + 1), S = domainState(), g = ctx?.gold?.() ?? 0;
  const p = (ok: boolean, s: string) => ok ? s : `<span class="no">${s}</span>`;
  return `<div class="cost">${l ? '扩建' : '重建'}：${p(g >= c.gold, `金币 ${fmt(c.gold)}`)} · ${p(S.mats.bronze >= c.bronze, `钟铜 ${c.bronze}`)} · ${p(S.mats.echo >= c.echo, `回响 ${c.echo}`)} · ${minutesOf(id, l + 1)} 分钟</div>`;
}
function render() {
  if (!wrap) return;
  lastVer = dirty; lastSec = Math.floor(now() / 1000);
  const S = domainState(), m = domainMods(), g = ctx?.gold?.() ?? 0;
  const built = BUILDINGS.filter(b => lvOf(b.id) > 0).length;
  let body = '';
  if (tab === 'b') {
    const q = queued();
    body = `<p class="sum">已重建 ${built} / 8 座 · 建造队列 ${q.length} / ${queueCap()} · 其他建筑的等级不能超过钟楼 · 加速：剩余每分钟 1 回响</p><div class="grid">` + BUILDINGS.map(b => {
      const l = lvOf(b.id), qq = building(b.id), w = whyNot(b.id);
      const lvBar = `<div class="lv">${[1, 2, 3].map(i => `<u class="${i <= l ? 'on' : ''}"></u>`).join('')}</div>`;
      const st = qq ? `<div class="st">建造中 → ${qq.to} 级 · 剩余 ${mmss(qq.e - now())}</div><div class="bar"><i style="width:${Math.round(progress(b.id) * 100)}%"></i></div>` : `<div class="st">${l ? `${l} 级 · ${b.role}` : '废墟'}</div>`;
      const cur = l ? `<div class="cur">现在：${b.lv[l - 1]}</div>` : `<div class="cur" style="color:#8aa">${b.desc}</div>`;
      const nx = l < MAX_LV ? `<div class="nx">${l + 1} 级：${b.lv[l]}</div>` : '<div class="nx">已满级</div>';
      const btns = [
        qq ? `<button class="btn gold" data-a="rush" data-id="${b.id}">加速（${rushCost(b.id)} 回响）</button>` : l < MAX_LV ? `<button class="btn" data-a="build" data-id="${b.id}" ${w ? 'disabled' : ''}>${l ? '扩建' : '重建'}</button>` : '',
        b.service && l > 0 ? `<button class="btn gold" data-a="svc" data-id="${b.id}" title="${b.service.desc(l)}">${b.service.name}</button>` : b.id === 'archive' && l > 0 ? `<button class="btn gold" data-a="svc" data-id="archive">居民名册</button>` : '',
      ].join('');
      return `<div class="card ${focus === b.id ? 'f' : ''}" style="--c:${hex(b.color)}" data-card="${b.id}"><div class="t"><b>${b.name}</b><em>${b.role}</em></div>${lvBar}${st}${cur}${nx}${qq ? '' : costHtml(b.id)}${!qq && w && l < MAX_LV ? `<div class="why">${w}</div>` : ''}<div class="btns">${btns}</div></div>`;
    }).join('') + '</div>';
  } else if (tab === 'r') {
    body = `<p class="sum">回响被安魂后会住进城里，每人带一个常驻加成。已入住 ${S.res.length} / ${resCap(lvOf('archive'))}（扩建档案馆提高上限）· 完成第八章回响居民支线、在无声钟楼击败回响首领来安魂他们</p><div class="rl">` + RESIDENTS.map(r => {
      const why = residentWhy(r);
      return `<div class="rc ${why ? 'off' : ''}"><b>${r.name}</b> <small>${r.title}</small><br>住在：${BY_ID[r.home].name}<br><span style="color:#f0d890">${r.desc}</span>${why ? `<br><span class="why">${why}</span>` : '<br><span style="color:#9ff0ff">已入住</span>'}</div>`;
    }).join('') + '</div>';
  } else {
    const t = todayRule(), list = offered();
    body = lvOf('belfry') < 1 ? '<p class="sum">先重建钟楼，才能敲钟选钟律。</p>' : `<p class="sum">每天敲一次钟，从 ${list.length} 条钟律中选一条，今天一整天都生效，明天换一批（钟楼等级越高，可选越多）。${t ? `今天：<b style="color:#ffe08a">${t.name}</b>` : '今天还没敲钟。'}</p><div class="rules">` + list.map(r => `<div class="rule ${t?.id === r.id ? 'on' : ''}"><b>${r.name}</b><span>${r.desc}</span>${t ? (t.id === r.id ? '<span style="color:#ffe08a">今天生效中</span>' : '') : `<button class="btn gold" data-a="rule" data-r="${r.id}">敲钟 · 选这条</button>`}</div>`).join('') + '</div>';
  }
  const pct = (k: number | undefined) => k && k !== 1 ? `${k > 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%` : '';
  const eff = [pct(m.dealt) && `伤害 ${pct(m.dealt)}`, pct(m.taken) && `承伤 ${pct(m.taken)}`, pct(m.takenBoss) && `首领伤害 ${pct(m.takenBoss)}`, pct(m.xp) && `经验 ${pct(m.xp)}`, pct(m.gold) && `金币 ${pct(m.gold)}`].filter(Boolean).join(' · ');
  wrap.innerHTML = `<div class="dw"><button class="x" data-a="x">×</button><div class="dh"><b>钟楼领地</b><i>镜渊城 · 守钟人${eff ? ' · 领地加成：' + eff : ''} · 钟鸣 ${Math.floor(chimeCharge())}%</i><div class="mats"><span style="color:#ffd100">金币 ${fmt(g)}</span><span style="color:#ffb070">钟铜 ${S.mats.bronze}</span><span style="color:#9ff0ff">回响 ${S.mats.echo}</span></div></div>
<div class="tabs"><button data-a="tab" data-t="b" class="${tab === 'b' ? 'on' : ''}">建筑</button><button data-a="tab" data-t="r" class="${tab === 'r' ? 'on' : ''}">回响居民</button><button data-a="tab" data-t="l" class="${tab === 'l' ? 'on' : ''}">钟律</button></div>
<div class="db">${body}<div class="msg">${msg}</div></div></div>`;
  if (focus && tab === 'b') { const c = wrap.querySelector(`[data-card="${focus}"]`); c?.scrollIntoView?.({ block: 'nearest' }); }
}

// ---------------------------------------------------------------- 镜渊城里的入口胶囊
let pill: HTMLDivElement | null = null, pillKey = '', acc = 0;
export function domainUiUpdate(dt: number) {
  if (wrap && (dirty !== lastVer || (queued().length && Math.floor(now() / 1000) !== lastSec))) render();
  if ((acc += dt) < 0.2) return;
  acc = 0;
  const show = !!ctx && ctx.map() === MIRROR_ID && domainOpen() && !!domainState().on;
  if (!show) { if (pill) pill.style.display = 'none'; return; }
  const p = ctx!.playerPos(), lx = p.x - MIRROR_O.x, lz = p.z - MIRROR_O.z;
  let near: BId | null = null, nd = 8;
  for (const b of BUILDINGS) { const d = Math.hypot(lx - b.plot.x, lz - b.plot.z); if (d < nd) { nd = d; near = b.id; } }
  if (!pill) {
    pill = document.createElement('div'); pill.id = 'd1-dompill';
    if (!document.getElementById('d1-dom-css')) { const st = document.createElement('style'); st.id = 'd1-dom-css'; st.textContent = CSS; document.head.appendChild(st); }
    const go = (e: Event) => { e.preventDefault(); e.stopPropagation(); openDomainUI(pill!.dataset.b ? pill!.dataset.b as BId : null); };
    pill.addEventListener('mousedown', go); pill.addEventListener('touchstart', go, { passive: false });
    document.body.appendChild(pill);
  }
  pill.style.display = wrap ? 'none' : '';
  const l = near ? lvOf(near) : 0, q = near ? building(near) : null;
  const key = near ? `${near}|${l}|${q ? Math.round(progress(near) * 20) : '-'}` : 'all';
  if (key === pillKey) return;
  pillKey = key; pill.dataset.b = near ?? '';
  pill.innerHTML = near ? `◆ ${BY_ID[near].name}<small>${q ? `建造中 ${Math.round(progress(near) * 100)}%` : l ? `${l} 级` : '废墟 · 可重建'}</small><small>点击管理</small>` : `◆ 钟楼领地<small>点击管理</small>`;
}
