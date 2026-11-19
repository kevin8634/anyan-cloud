// ======================================================================
// Rhett 11-18（03:14「同时去就做欢迎和HUD重做」）DLC 欢迎动画（?off=welcome1118 关）
//   分镜按 03_概念图/07_DLC欢迎与HUD_1116：W1 沉钟之海开场 → W2 六职业群像 → W3 落版（M1 Logo 动画 + 开始冒险）
//   画面都是定稿概念图 + livebg.ts 代码动态（视差 / 水波 / 涟漪 / 雾 / 光束 / 微光），Logo 用 02_工程包/03_宣发/CG制作/logo_final/M1_logo_anim_a.mp4（转 webm，screen 混合去黑底）
//   W3 底部职业条：选中哪个职业，背景切到该职业的图（welcome_<职业>，炼金暂无人物图用 selbg_alchemy 占位）；「开始冒险」直接进该职业的选角 HUD
//   任意时刻「跳过」/ Esc 关闭，回到原首屏；载入画面结束、标题出现时播放，不阻塞游戏加载
// 只读写页面 DOM（#title / #loading / #class-pick / #sel-create），不 import 本体模块
// ======================================================================
import { SELUI } from '../selui.gen';
import { LiveBg, LiveLook, LOOK_DEF, blobUrl, d1Off, loadImg } from './livebg';
import { installWelcomeC3 } from './welcome_c3';

const SHOTS: { key: string; dur: number; look: LiveLook; cap?: string; sub?: string }[] = [
  { key: 'w1', dur: 5.2, cap: '沉钟之海', sub: '钟声沉入海底，倒悬之城在水面下醒来',
    look: { ...LOOK_DEF, horizon: 0.3, rays: [0.5, 0.0], rip: [0.5, 0.74], ripK: 1.0, fog: 0.42, raysK: 0.9, motes: 0.8, zoom0: 1.0, zoom1: 1.12, pan0: [0, 0.02], pan1: [0, -0.015] } },
  { key: 'w2', dur: 5.4, cap: '六位旅人', sub: '',
    look: { ...LOOK_DEF, horizon: 0.16, rays: [0.68, 0.0], rip: [0.5, 0.9], ripK: 0.4, fog: 0.3, raysK: 0.6, motes: 0.7, zoom0: 1.1, zoom1: 1.0, pan0: [-0.03, 0], pan1: [0.02, 0] } },
  { key: 'w3', dur: 0, look: { ...LOOK_DEF, horizon: 0.32, rays: [0.63, 0.0], rip: [0.5, 0.36], ripK: 0.8, fog: 0.4, raysK: 0.8, motes: 0.7, zoom0: 1.06, zoom1: 1.0 } },
];
/** 职业图（W3 选职业时切换）：人物在画面中间，背景动态轻一点 */
const CLS_LOOK: LiveLook = { ...LOOK_DEF, horizon: 0.18, rays: [0.5, 0.0], rip: [0.5, 0.92], ripK: 0.25, fog: 0.22, raysK: 0.45, motes: 0.55, zoom0: 1.04, zoom1: 1.0 };
const clsImgKey = (id: string) => SELUI[`welcome_${id}`] ? `welcome_${id}` : SELUI[`selbg_${id}`] ? `selbg_${id}` : 'w3';

const CSS = `
#d1-welcome{position:fixed;inset:0;z-index:9000;background:#010405;overflow:hidden;font-family:"STKaiti","KaiTi","Kaiti SC","PingFang SC",serif;color:#d8f2ee;opacity:1;transition:opacity .7s}
#d1-welcome.out{opacity:0;pointer-events:none}
#d1-welcome canvas.bg{position:absolute;inset:0;width:100%;height:100%}
#d1-welcome .logo{position:absolute;left:50%;top:6%;width:min(86vw,1100px);transform:translateX(-50%);mix-blend-mode:screen;opacity:0;transition:opacity 1.2s;pointer-events:none}
#d1-welcome.w3 .logo{opacity:1}
#d1-welcome .cap{position:absolute;left:0;right:0;bottom:15%;text-align:center;opacity:0;transition:opacity 1s;text-shadow:0 2px 8px #000,0 0 22px rgba(60,200,190,.35);pointer-events:none}
#d1-welcome .cap.on{opacity:1}
#d1-welcome .cap b{display:block;font-size:clamp(28px,3.6vw,54px);letter-spacing:.5em;color:#bff6ee;font-weight:600}
#d1-welcome .cap small{display:block;margin-top:10px;font-size:clamp(13px,1.2vw,17px);letter-spacing:.3em;color:#8fbfba}
#d1-welcome .names{display:flex;justify-content:center;gap:clamp(10px,2.4vw,40px);margin-top:12px;font-size:clamp(13px,1.15vw,17px);letter-spacing:.25em;color:#a9d8d2}
#d1-welcome .names span{opacity:0;transform:translateY(8px);transition:opacity .6s,transform .6s}
#d1-welcome .names span.on{opacity:1;transform:none}
#d1-welcome .skip{position:absolute;right:clamp(14px,2.4vw,36px);top:clamp(12px,2.2vh,26px);background:rgba(4,14,16,.55);border:1px solid rgba(110,200,190,.45);color:#a9d8d2;font:14px/1 inherit;letter-spacing:.3em;padding:8px 16px 8px 20px;cursor:pointer;border-radius:2px}
#d1-welcome .skip:hover{color:#e8fffb;border-color:#7fe6da}
#d1-welcome .w3ui{position:absolute;left:0;right:0;bottom:4%;display:flex;flex-direction:column;align-items:center;gap:14px;opacity:0;transform:translateY(12px);transition:opacity .9s,transform .9s;pointer-events:none}
#d1-welcome.w3ui-on .w3ui{opacity:1;transform:none;pointer-events:auto}
#d1-welcome .go{font:600 clamp(18px,1.6vw,24px)/1 inherit;letter-spacing:.5em;color:#e8fffb;padding:14px 46px 14px 56px;cursor:pointer;border-radius:3px;
  background:linear-gradient(180deg,rgba(26,72,74,.92),rgba(6,26,30,.95));border:1px solid #6fd6ca;box-shadow:inset 0 0 0 3px rgba(4,14,16,.9),inset 0 0 0 4px rgba(184,118,70,.55),0 0 26px rgba(80,220,200,.35);text-shadow:0 1px 3px #000}
#d1-welcome .go:hover{box-shadow:inset 0 0 0 3px rgba(4,14,16,.9),inset 0 0 0 4px rgba(214,140,80,.8),0 0 34px rgba(100,240,220,.6)}
#d1-welcome .chips{display:flex;gap:clamp(8px,1.4vw,22px)}
#d1-welcome .chip{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;background:none;border:0;color:#9cc8c2;font:12px/1.2 inherit;letter-spacing:.1em;padding:0}
#d1-welcome .chip .pt{width:46px;height:46px;border-radius:50%;overflow:hidden;border:2px solid rgba(110,180,175,.45);box-shadow:0 0 0 3px rgba(2,10,12,.85);filter:saturate(.6) brightness(.8)}
#d1-welcome .chip .pt>*{width:100%;height:100%}
#d1-welcome .chip.on{color:#dffcf7}#d1-welcome .chip.on .pt{border-color:#7fe6da;filter:none;box-shadow:0 0 0 3px rgba(2,10,12,.85),0 0 16px rgba(110,240,220,.7)}
#d1-welcome .chip:hover .pt{filter:none}
`;

let started = false;
function css() { if (document.getElementById('d1-welcome-css')) return; const st = document.createElement('style'); st.id = 'd1-welcome-css'; st.textContent = CSS; document.head.appendChild(st); }

/** 当前选中的职业（读首屏职业牌） */
const curCls = () => (document.querySelector('#class-pick .ccard.on') as HTMLElement | null)?.dataset.cls ?? 'mage';
const classList = () => [...document.querySelectorAll('#class-pick .ccard')].map(e => ({ id: (e as HTMLElement).dataset.cls!, name: e.querySelector('b')?.textContent ?? '', pt: e.querySelector('.portrait')?.innerHTML ?? '' }));

export async function playWelcome() {
  if (started) return; started = true;
  css();
  const root = document.createElement('div'); root.id = 'd1-welcome';
  root.innerHTML = `<canvas class="bg"></canvas><video class="logo" muted playsinline preload="auto"></video>
    <div class="cap"><b></b><small></small><div class="names"></div></div>
    <button class="skip" title="跳过（Esc）">跳过 ›</button>
    <div class="w3ui"><button class="go">开始冒险</button><div class="chips"></div></div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('canvas') as HTMLCanvasElement, lb = new LiveBg(cv);
  const vid = root.querySelector('video') as HTMLVideoElement, cap = root.querySelector('.cap') as HTMLElement;
  if (!lb.ok) { root.remove(); return; }
  const imgs: Record<string, HTMLImageElement> = {};
  const img = async (k: string) => imgs[k] ?? (imgs[k] = await loadImg(SELUI[k]));
  try { for (const s of SHOTS) await img(s.key); } catch (e) { console.warn('欢迎动画图片', e); root.remove(); return; }
  if (SELUI.logo_m1) vid.src = blobUrl(SELUI.logo_m1);
  let shot = 0, t0 = performance.now(), tAll = 0, fadeK = 0, mix = 0, look = SHOTS[0].look, nextLook: LiveLook | null = null, done = false, raf = 0, last = performance.now();
  let pick = curCls(), picked = false;
  const mouse: [number, number] = [0, 0], mT: [number, number] = [0, 0];
  const onMove = (e: PointerEvent) => { mT[0] = (e.clientX / innerWidth - 0.5) * 2; mT[1] = (e.clientY / innerHeight - 0.5) * 2; };
  lb.setImage(0, imgs.w1);
  const setCap = (b: string, s: string) => { (cap.querySelector('b') as HTMLElement).textContent = b; (cap.querySelector('small') as HTMLElement).textContent = s; };
  const close = (go: boolean) => {
    if (done) return; done = true;
    root.classList.add('out'); window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointermove', onMove);
    try { vid.pause(); } catch { /* 无 */ }
    if (go) {   // 开始冒险：进 3D 选角并选中这个职业（selhud 接着打开详情 HUD）
      const card = document.querySelector(`#class-pick .ccard[data-cls="${pick}"]`) as HTMLElement | null;
      (document.getElementById('sel-create') as HTMLButtonElement | null)?.click();
      if (picked || card) setTimeout(() => card?.click(), 60);
    }
    setTimeout(() => { cancelAnimationFrame(raf); lb.dispose(); root.remove(); }, 800);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } else if (e.key === 'Enter' && root.classList.contains('w3ui-on')) { e.preventDefault(); close(true); } };
  window.addEventListener('keydown', onKey, true); window.addEventListener('pointermove', onMove);
  (root.querySelector('.skip') as HTMLElement).onclick = () => close(false);
  (root.querySelector('.go') as HTMLElement).onclick = () => close(true);
  // W2 字幕：六个职业名（读首屏职业牌，即游戏真数据）
  const names = root.querySelector('.names') as HTMLElement;
  names.innerHTML = classList().map(c => `<span>${c.name}</span>`).join('');
  // W3 职业条
  const chips = root.querySelector('.chips') as HTMLElement;
  chips.innerHTML = classList().map(c => `<button class="chip${c.id === pick ? ' on' : ''}" data-cls="${c.id}"><span class="pt">${c.pt}</span><span>${c.name}</span></button>`).join('');
  const toCls = async (id: string) => {
    pick = id; picked = true;
    chips.querySelectorAll('.chip').forEach(e => e.classList.toggle('on', (e as HTMLElement).dataset.cls === id));
    try { const im = await img(clsImgKey(id)); if (pick !== id) return; lb.setImage(1, im); nextLook = CLS_LOOK; mix = 0.0001; } catch { /* 留原图 */ }
  };
  chips.querySelectorAll('.chip').forEach(e => { (e as HTMLElement).onclick = () => void toCls((e as HTMLElement).dataset.cls!); });
  const toShot = async (i: number) => {
    shot = i; t0 = performance.now();
    lb.setImage(1, await img(SHOTS[i].key)); nextLook = SHOTS[i].look; mix = 0.0001;
    cap.classList.remove('on');
    if (i === 2) { root.classList.add('w3'); setCap('', ''); try { vid.currentTime = 0; void vid.play().catch(() => { /* 放不了就只剩背景 */ }); } catch { /* 无 */ } setTimeout(() => root.classList.add('w3ui-on'), 1800); }
  };
  setCap(SHOTS[0].cap ?? '', SHOTS[0].sub ?? ''); setTimeout(() => cap.classList.add('on'), 600);
  const frame = (now: number) => {
    if (!root.isConnected) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now; tAll += dt; fadeK = Math.min(1, fadeK + dt * 0.8);
    mouse[0] += (mT[0] - mouse[0]) * Math.min(1, dt * 2.5); mouse[1] += (mT[1] - mouse[1]) * Math.min(1, dt * 2.5);
    const ts = (now - t0) / 1000, S = SHOTS[shot];
    if (mix > 0) { mix = Math.min(1, mix + dt / 1.2); if (mix >= 1) { lb.swap(); look = nextLook ?? look; nextLook = null; mix = 0; } }
    if (S.dur && ts > S.dur && mix === 0 && shot < 2) void toShot(shot + 1);
    if (shot === 1 && mix === 0) { names.querySelectorAll('span').forEach((e, i) => e.classList.toggle('on', ts > 0.4 + i * 0.35)); if (ts > 0.2 && !cap.classList.contains('on')) { setCap(SHOTS[1].cap ?? '', ''); cap.classList.add('on'); } }
    if (shot === 0 && ts > S.dur - 1.0) cap.classList.remove('on');
    if (shot === 1 && ts > S.dur - 0.9) cap.classList.remove('on');
    const k = S.dur ? ts / S.dur : Math.min(1, ts / 8);
    lb.draw(tAll, look, { mix, k, mouse: [mouse[0] * 0.6, mouse[1] * 0.4], vig: 0.6, fade: fadeK });
  };
  raf = requestAnimationFrame(frame);
  (window as unknown as { __d1Welcome?: unknown }).__d1Welcome = { shot: () => shot, skip: () => close(false), go: () => close(true), to: (i: number) => void toShot(i), pick: (id: string) => void toCls(id) };
}

/** 等载入画面结束、标题出现（且宣传片没在放）再开始 */
export function installWelcome() {
  if (typeof document === 'undefined' || d1Off('welcome1118')) return;
  if (!d1Off('welc3')) { installWelcomeC3(); return; }   // Rhett 11-18 13:27：欢迎界面改六职业拱形卡（welcome_c3.ts），替换首屏与旧 A 态选角
  if (!SELUI.w1) return;
  const iv = setInterval(() => {
    const ti = document.getElementById('title'), ld = document.getElementById('loading');
    if (!(window as unknown as { __game?: unknown }).__game || !ti || ti.style.display === 'none' || (ld && ld.style.display === 'flex')) return;
    if (document.getElementById('anyan-loader') || document.getElementById('cg-movie') || document.getElementById('intro-pre')) return;
    if (!document.documentElement.classList.contains('selui')) return;
    clearInterval(iv); void playWelcome();
  }, 150);
}
