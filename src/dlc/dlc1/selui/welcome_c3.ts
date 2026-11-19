// ======================================================================
// Rhett 11-18（13:27「按你推荐的 3，包括按钮也要改用概念图的」）DLC 欢迎界面改版：六职业拱形卡（概念图 c3_cards）
//   替换首屏金钟城堡画面（selgate）与旧 3D 六人站位选角（A 态）：载入完成先看到这一屏；从选角详情「返回」也回到这一屏
//   画面全部静态图 + CSS 渐显（不用 livebg 着色器，不扭动人物）：背景 wc_bg、拱形卡框 wc_frame、按钮牌 wc_btn（无图时退回代码画框）；
//   卡内是职业立绘 port_<职业>（gpt-image-2，和创角渐显同一套），六张卡 2 秒内依次渐显
//   点卡 = 选职业（悬停 / 选中放大发光）；「开始游戏」/ 双击卡 / Enter = 进该职业的选角详情 HUD；右上角声音开关同本体 #snd-title
//   ?off=welc3 回 11-18 早先的 W1–W3 欢迎动画
// 只读写页面 DOM（#title / #class-pick / #sel-create / #snd-title / #cg-replay / #help-toggle / #demo-enter），不 import 本体模块
// ======================================================================
import { SELUI } from '../selui.gen';
import { blobUrl } from './livebg';

const CSS = `
#d1-wc{position:fixed;inset:0;z-index:9000;background:#020708 center/cover no-repeat;overflow:hidden;font-family:"STKaiti","KaiTi","Kaiti SC","PingFang SC",serif;color:#e9f6ef;opacity:0;transition:opacity .8s;user-select:none}
#d1-wc.on{opacity:1}#d1-wc.out{opacity:0;pointer-events:none}
#d1-wc:before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 75% 70% at 50% 46%,transparent 40%,rgba(0,4,6,.72) 100%),linear-gradient(180deg,rgba(0,4,6,.35),transparent 22%,transparent 70%,rgba(0,4,6,.8));pointer-events:none}
#d1-wc .logo{position:absolute;left:clamp(14px,2.4vw,40px);top:clamp(8px,1.6vh,20px);width:clamp(220px,22vw,380px);mix-blend-mode:screen;pointer-events:none}
#d1-wc .snd{position:absolute;top:clamp(12px,2vh,22px);right:clamp(14px,2vw,30px);width:44px;height:44px;border-radius:50%;padding:9px;cursor:pointer;color:#f3e2b4;background:radial-gradient(circle at 40% 35%,#24383a,#061012);border:1px solid #b8862b;box-shadow:0 0 0 2px #000,0 2px 12px rgba(0,0,0,.7)}
#d1-wc .snd svg{width:100%;height:100%;fill:currentColor}
html #d1-wc .snd{width:auto!important;height:auto!important;display:flex!important;align-items:center;gap:8px;padding:6px 16px!important;border-radius:0;font:600 15px/1 "STKaiti","KaiTi","Kaiti SC",serif;letter-spacing:.15em}html #d1-wc .snd svg{width:22px;height:22px;flex:none}html.d1btn body #d1-wc .snd{border-width:clamp(9px,1.5vh,13px) clamp(16px,2.4vh,24px)!important;border-image-width:clamp(9px,1.5vh,13px) clamp(16px,2.4vh,24px)!important;padding:4px 10px!important}
#cg-movie{z-index:9600!important}   /* 11-18 Rhett「重放 CG 没用」：宣传片层原 z 600 被登录屏 9000 盖住 */#d1-wc .snd.off{color:#7d766a;border-color:#5a4a30}#d1-wc .snd:hover{box-shadow:0 0 0 2px #000,0 0 16px rgba(255,200,110,.6)}
#d1-wc .cards{position:absolute;left:50%;top:clamp(110px,17vh,190px);bottom:calc(max(52px,6vh) + clamp(80px,11vh,120px));transform:translateX(-50%);display:flex;align-items:flex-end;justify-content:center;gap:clamp(8px,1.2vw,22px);width:min(96vw,1500px)}
#d1-wc .card{position:relative;flex:1 1 0;max-width:230px;height:88%;cursor:pointer;opacity:0;transition:opacity 1.1s ease,height .35s ease,filter .35s;filter:brightness(.72) saturate(.75)}
#d1-wc .card.in{opacity:1}
#d1-wc .card:hover,#d1-wc .card.on{filter:none;height:100%}
#d1-wc .card .win{position:absolute;inset:6% 9% 15% 9%;border-radius:50% 50% 0 0/22% 22% 0 0;overflow:hidden;background:#061316}
#d1-wc .card .win img{width:100%;height:100%;object-fit:cover;object-position:50% 12%}
#d1-wc .card .win:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(2,8,10,.85));}
#d1-wc .card .fr{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none}
#d1-wc .card .fr.css{border:3px solid #9a7434;border-bottom-width:3px;border-radius:50% 50% 4px 4px/20% 20% 4px 4px;box-shadow:inset 0 0 0 2px #1a1206,inset 0 0 0 4px rgba(214,170,90,.55),0 0 0 2px #000,0 10px 30px rgba(0,0,0,.6)}
#d1-wc .card .nm{position:absolute;left:4%;right:4%;bottom:2%;height:12%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(180deg,rgba(18,24,22,.92),rgba(6,10,10,.96));border:1px solid #8a6a30;border-radius:3px;box-shadow:inset 0 0 0 2px #0b0804,inset 0 0 0 3px rgba(214,170,90,.35)}
#d1-wc .card .nm b{font-size:clamp(14px,1.25vw,20px);letter-spacing:.3em;color:#f2e4bc;text-shadow:0 1px 3px #000;font-weight:600}
#d1-wc .card .nm small{font-size:clamp(10px,.75vw,12px);color:#a8b9b0;letter-spacing:.08em;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:94%}
#d1-wc .card.on .fr{filter:drop-shadow(0 0 14px var(--glow,#7fe6da))}#d1-wc .card.on .fr.css{border-color:#e6c27a}
#d1-wc .card.on .win{box-shadow:inset 0 0 40px var(--glow,#7fe6da)}
#d1-wc .card.on .nm{border-color:#e6c27a}#d1-wc .card.on .nm b{color:#fff6d8;text-shadow:0 0 10px var(--glow,#7fe6da)}
html.d1wc #title.sel>.sel-logo,html.d1wc #title.sel>.sel-rule,html.d1wc.selgate #title.sel #sel-create,html.d1wc.selgate #title.sel #sel-enter,html.d1wc.selgate #title.sel .sel-hint{visibility:hidden!important}
html.d1noold #title.sel:not(.sel-b){visibility:hidden!important}html.d1noold #title.sel:not(.sel-b) *{visibility:hidden!important}html.d1noold canvas{visibility:hidden!important}html.d1noold body{background:#020708}
#d1-wc.now{transition:none!important}
#d1-wc.login .bar{bottom:max(14vh,96px)}#d1-wc.login .logo{left:50%;top:max(10vh,60px);transform:translateX(-50%);width:clamp(320px,34vw,620px)}
#d1-wc .bt.pick{font-size:clamp(15px,1.25vw,19px);padding:16px 30px 16px 38px}
#d1-wc .bar{height:auto!important;background:none!important;border:0!important;border-radius:0!important;overflow:visible!important;box-shadow:none!important;position:absolute;left:0;right:0;bottom:max(52px,6vh);display:flex;justify-content:center;align-items:center;gap:clamp(14px,2.6vw,48px)}
#d1-wc .bt{position:relative;cursor:pointer;color:#e6d7b0;font-family:inherit;font-weight:600;font-size:clamp(13px,1.05vw,16px);line-height:1.25;white-space:nowrap;overflow:visible;letter-spacing:.3em;padding:12px 26px 12px 30px;background:linear-gradient(180deg,rgba(14,22,22,.85),rgba(4,8,8,.9));border:1px solid rgba(154,116,52,.7);border-radius:2px;box-shadow:inset 0 0 0 2px #050302,0 0 0 1px #000}
#d1-wc .bt:hover{color:#fff4d4;border-color:#e6c27a}
#d1-wc .bt.go{font-size:clamp(17px,1.5vw,23px);letter-spacing:.45em;padding:0 34px 0 44px;min-width:clamp(200px,17vw,300px);height:clamp(52px,7vh,66px);color:#fff6dc;background:none;border:0;box-shadow:none}
#d1-wc .bt.go:before{content:'';position:absolute;inset:0;background:var(--btn) center/100% 100% no-repeat;z-index:-1}
#d1-wc .bt.go.css:before{background:linear-gradient(180deg,rgba(40,48,40,.95),rgba(8,12,10,.98));border:1px solid #b8862b;border-radius:3px;box-shadow:inset 0 0 0 3px #0a0804,inset 0 0 0 4px rgba(230,194,122,.6),0 0 24px rgba(230,180,90,.25)}
#d1-wc .bt.go:hover:before{filter:brightness(1.25) drop-shadow(0 0 10px rgba(255,210,130,.6))}
#d1-wc .bt.go span{position:relative;text-shadow:0 1px 4px #000,0 0 12px rgba(255,200,120,.35)}
#d1-wc .demo{position:absolute;right:clamp(14px,2vw,30px);top:calc(clamp(12px,2vh,22px) + 56px);font-size:13px;letter-spacing:.2em;padding:9px 16px 9px 20px}
#d1-wc .hint{position:absolute;left:0;right:0;bottom:calc(max(52px,6vh) + clamp(60px,8vh,76px));text-align:center;font-size:12px;letter-spacing:.3em;color:#8fa7a0;pointer-events:none}
#d1-wc .hp{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:min(86vw,820px);padding:18px 24px;font-size:14px;line-height:1.9;text-align:left;color:#dfe9e2;background:rgba(4,10,10,.92);border:1px solid #8a6a30;border-radius:4px;box-shadow:0 0 0 2px #000,0 10px 40px rgba(0,0,0,.7);display:none;z-index:2;cursor:pointer}#d1-wc .hp.on{display:block}#d1-wc .hp b{color:#f2d58a}
@media (max-height:600px){#d1-wc .cards{top:clamp(70px,14vh,110px);bottom:clamp(110px,22vh,140px)}#d1-wc .bar{bottom:28px}#d1-wc .hint{display:none}}
`;
const GLOW: Record<string, string> = { mage: '#7fb8ff', warrior: '#ffb060', hunter: '#7fe6b0', coffin: '#9fd8ff', chrono: '#ffd88a', alchemy: '#8dff7a' };
const SND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const SND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

const classList = () => [...document.querySelectorAll('#class-pick .ccard')].map(e => ({ id: (e as HTMLElement).dataset.cls!, name: e.querySelector('b')?.textContent ?? '', role: e.querySelector('small')?.textContent ?? '' }));
const curCls = () => (document.querySelector('#class-pick .ccard.on') as HTMLElement | null)?.dataset.cls ?? classList()[0]?.id ?? 'mage';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

let root: HTMLElement | null = null, busy = false;
let bootNow = false;
// 11-18 15:25 Rhett「读条完进去就是 6 个角色的界面不对，应该是登录界面（去掉 6 个角色），点选择角色再出现可创建的职业和已建角色；旧界面还能看到」
//   → 默认登录屏：只有背景 + 标志 + 「进入游戏」（有存档时，进上次的角色）/「选择角色」（进角色列表 + 六职业）/ 重放 CG / 操作说明 / 声音；
//     本体首屏金钟城堡（selgate）的标志 / 按钮在登录屏期间全部藏起；?off=wclogin 回六卡
const LOGIN = !/(?:[?&]off=[^&]*\bwclogin\b)/.test(location.search);
export const welcomeC3Open = () => !!root;

export function showWelcomeC3() {
  if (root || busy) return;
  if (!document.getElementById('d1-wc-css')) { const st = document.createElement('style'); st.id = 'd1-wc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const list = classList(); if (!list.length) return;
  let pick = curCls();
  const el = document.createElement('div'); el.id = 'd1-wc'; root = el;
  const bg = SELUI.wc_bg ?? SELUI.w3; if (bg) el.style.backgroundImage = `url("${bg}")`;
  const fr = SELUI.wc_frame, btn = SELUI.wc_btn;
  const demo = document.getElementById('demo-enter') as HTMLButtonElement | null;
  el.innerHTML = `${SELUI.logo_m1 ? '<video class="logo" muted playsinline autoplay loop></video>' : ''}
    <button class="snd" type="button"></button>
    ${LOGIN ? '' : `<div class="cards">${list.map(c => `<div class="card" data-cls="${c.id}" style="--glow:${GLOW[c.id] ?? '#7fe6da'}"><div class="win">${SELUI[`port_${c.id}`] ? `<img src="${SELUI[`port_${c.id}`]}" alt="" draggable="false">` : ''}</div>${fr ? `<img class="fr" src="${fr}" alt="" draggable="false">` : '<div class="fr css"></div>'}<div class="nm"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></div></div>`).join('')}</div>`}
    <div class="hp"></div>
    ${LOGIN ? '' : '<div class="hint">点选一位职业 · 双击或「开始游戏」进入</div>'}
    <div class="bar"><button class="bt cg" type="button">重放 CG</button>${LOGIN ? '<button class="bt pick" type="button">选择角色</button>' : ''}<button class="bt go${btn ? '' : ' css'}" type="button"${btn ? ` style="--btn:url('${btn}')"` : ''}><span>${LOGIN ? '进入游戏' : '开始游戏'}</span></button><button class="bt help" type="button">操作说明</button></div>
    ${demo ? `<button class="bt demo" type="button" title="${esc(demo.textContent ?? '')}">⚡ 快速体验</button>` : ''}`;
  if (LOGIN) { el.classList.add('login'); document.documentElement.classList.add('d1wc'); }
  document.body.appendChild(el);
  const vid = el.querySelector('video.logo') as HTMLVideoElement | null;
  if (vid && SELUI.logo_m1) { vid.src = blobUrl(SELUI.logo_m1); void vid.play().catch(() => { /* 放不了就不显示 */ }); }
  // 声音开关：同本体标题右上角 #snd-title（点它 = 切换设置里的静音并存盘），这里只照它的状态画图标
  const snd = el.querySelector('.snd') as HTMLButtonElement, sndT = () => document.getElementById('snd-title');
  const paintSnd = () => { const off = !!sndT()?.classList.contains('off'); snd.classList.toggle('off', off); snd.innerHTML = (off ? SND_OFF : SND_ON) + `<span>${off ? '声音 关' : '声音 开'}</span>`;   /* 11-18 Rhett「看不出来是声音开关」：图标 + 文字 */ snd.title = off ? '声音：关（点击打开）' : '声音：开（点击静音）'; };
  snd.onclick = e => { e.stopPropagation(); sndT()?.click(); paintSnd(); };
  if (!sndT()) snd.style.display = 'none'; else paintSnd();
  const cards = [...el.querySelectorAll('.card')] as HTMLElement[];
  const mark = () => cards.forEach(c => c.classList.toggle('on', c.dataset.cls === pick));
  mark();
  cards.forEach(c => {
    c.onclick = () => { pick = c.dataset.cls!; mark(); };
    c.ondblclick = () => { pick = c.dataset.cls!; close(true); };
  });
  const close = (go: boolean) => {
    if (!root || busy) return; busy = true;
    window.removeEventListener('keydown', onKey, true);
    if (!(LOGIN && go)) el.classList.add('out');
    if (LOGIN && go) {   // 登录屏：进入游戏 = 有存档进上次的角色，没存档等同「选择角色」；选择角色 = 开 3D 选角（selhud 接着点当前职业进详情：左角色列表 + 底部六职业）
      const enter = document.getElementById('sel-enter') as HTMLButtonElement | null, has = !!enter && !enter.classList.contains('none') && !pickMode;
      (has ? enter : document.getElementById('sel-create') as HTMLButtonElement | null)?.click();
      setTimeout(() => el.classList.add('out'), has ? 0 : 450);   // 等 3D 选角第一帧起来再淡出，不露出底下的旧首屏
      setTimeout(() => { el.remove(); root = null; busy = false; document.documentElement.classList.remove('d1wc'); }, has ? 820 : 1300);
      return;
    }
    if (go) {
      const gated = document.documentElement.classList.contains('selgate');
      if (gated) (document.getElementById('sel-create') as HTMLButtonElement | null)?.click();
      setTimeout(() => (document.querySelector(`#class-pick .ccard[data-cls="${pick}"]`) as HTMLElement | null)?.click(), gated ? 80 : 0);
    }
    setTimeout(() => { el.remove(); root = null; busy = false; document.documentElement.classList.remove('d1wc'); }, 820);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const i = list.findIndex(c => c.id === pick), n = list.length; pick = list[(i + (e.key === 'ArrowLeft' ? n - 1 : 1)) % n].id; mark(); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey, true);
  let pickMode = false;
  (el.querySelector('.go') as HTMLElement).onclick = () => { pickMode = false; close(true); };
  const pk = el.querySelector('.pick') as HTMLElement | null; if (pk) pk.onclick = () => { pickMode = true; close(true); };
  (el.querySelector('.cg') as HTMLElement).onclick = () => (document.getElementById('cg-replay') as HTMLButtonElement | null)?.click();
  { const hp = el.querySelector('.hp') as HTMLElement; (el.querySelector('.help') as HTMLElement).onclick = () => { if (!hp.innerHTML) hp.innerHTML = document.getElementById('t-help')?.innerHTML ?? ''; hp.classList.toggle('on'); }; hp.onclick = () => hp.classList.remove('on'); }   // 操作说明就在这一屏里开（不露出旧首屏）
  const dm = el.querySelector('.demo') as HTMLElement | null; if (dm && demo) dm.onclick = () => { close(false); demo.click(); };
  // 渐显：整屏 0.8 秒，卡片 2 秒内依次出现（只改透明度，不移动）
  if (NOOLD && (shownOnce || bootNow)) { bootNow = false; el.classList.add('now', 'on'); requestAnimationFrame(() => el.classList.remove('now')); } else requestAnimationFrame(() => el.classList.add('on'));
  shownOnce = true;
  cards.forEach((c, i) => setTimeout(() => c.classList.add('in'), 250 + i * 160));
  (window as unknown as { __d1Wc?: unknown }).__d1Wc = { pick: (id: string) => { pick = id; mark(); }, go: () => close(true), close: () => close(false), get cur() { return pick; } };
}

/** 标题出现（载入画面结束、宣传片没在放）时显示；之后在首屏 / 选角 A 态（六人站位）时都换成这一屏，进详情 HUD 时让开 */
let shownOnce = false;
/** 11-18 Rhett「不想再看到旧版的画面」：登录模式下，首屏 / 选角 A 态（六人站位、评委快速体验、选择职业那一屏）整屏藏掉（含 3D 画布），
 *  只要回到 A 态（Esc / ✕ / 返回主画面）就立刻换回登录屏、不再淡入；?off=wcnoold 关 */
const NOOLD = LOGIN && !/(?:[?&]off=[^&]*\bwcnoold\b)/.test(location.search);
function markOld() {
  if (!NOOLD) return;
  const ti = document.getElementById('title'), html = document.documentElement;
  const a = !!ti && ti.style.display !== 'none' && ti.classList.contains('sel') && !ti.classList.contains('sel-b') && html.classList.contains('selui')
    && !document.getElementById('cg-movie') && !document.getElementById('intro-pre');
  html.classList.toggle('d1noold', a);
}
export function installWelcomeC3() {
  // 11-18 19:55：开局遮罩（d1boot）删除——旧选人画面已在 selectstage 里真删（详情页前不渲染），不再靠遮
  if (NOOLD) { const tick = () => { markOld(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  setInterval(() => {
    if (root || busy) return;
    const ti = document.getElementById('title'), ld = document.getElementById('loading');
    if (!(window as unknown as { __game?: unknown }).__game || !ti || ti.style.display === 'none' || (ld && ld.style.display === 'flex')) return;
    if (document.getElementById('anyan-loader') || document.getElementById('cg-movie') || document.getElementById('intro-pre')) return;
    if (!document.documentElement.classList.contains('selui')) return;
    if (ti.classList.contains('sel-b')) return;
    showWelcomeC3();
  }, NOOLD ? 50 : 200);
}
