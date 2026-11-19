// ======================================================================
// v1.2.74 宣传片 CG：首次打开游戏播放页面同目录下的 movie/intro.mp4；标题画面「重放 CG」按钮
//   视频不打进 HTML（离线包把 movie/ 文件夹放在 index.html 旁边即可；文件缺失时静默跳过，首播标记不写）
//   首播：加载画面之上全屏播放，加载在后台继续；放完 / 跳过后再进开场动画。
//   浏览器不允许无点击带声自动播放 → 先试带声，被拒就静音播 + 「点击开启声音」
//   ?cg=0 不播；?cg=1 强制首播；自动化测试（navigator.webdriver）默认不播
// ======================================================================
export const CG_SRC = 'movie/intro.mp4';
const SEEN_KEY = 'anyan_cg_seen';
let active = false;
export const cgActive = () => active;

interface CgAudio { unlock(): void; setSceneDim?(k: number, sec?: number): void }

function seen() { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* 隐私模式 */ } }

/** 首次打开时播放；返回 Promise，播完 / 跳过 / 文件缺失时 resolve */
export function firstCG(audio: CgAudio): Promise<void> {
  const q = location.search;
  if (/[?&]cg=0/.test(q)) return Promise.resolve();
  if (!/[?&]cg=1/.test(q) && (navigator.webdriver || seen())) return Promise.resolve();
  return playCG(audio, false);
}

// v1.2.75 开场动画（03 宣发出片，Rhett 11-03 批）：每个存档第一次进入世界时播 movie/opening.mp4（webm 回退），按住跳过；文件缺失即跳过
//   ?op=0 不播；?op=1 强制播；自动化测试默认不播
export const OPENING_SRC = [   // webm 优先（体积小一半；离线包只带 webm，控制在 150 MB 内），mp4 兜底
  'movie/opening.webm', 'movie/opening.mp4'];
export function playOpening(audio: CgAudio): Promise<void> {
  const q = location.search;
  if (/[?&]op=0/.test(q) || (!/[?&]op=1/.test(q) && navigator.webdriver)) return Promise.resolve();
  return playCG(audio, true, { src: OPENING_SRC, hold: true, quiet: true });
}
/** v1.2.81 首屏「重放开场」：手动重播开场动画（不受 ?op / webdriver 限制） */
export function replayOpening(audio: CgAudio): Promise<void> { return playCG(audio, true, { src: OPENING_SRC, hold: true, quiet: true }); }
/** 探测开场视频是否存在且可播：任一源读到元数据即 true，全部失败 / 超时即 false（不触发下载整片） */
export function probeOpening(timeoutMs = 8000): Promise<boolean> {
  return new Promise(res => {
    let i = 0, done = false; const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    const fin = (ok: boolean) => { if (done) return; done = true; clearTimeout(to); v.removeAttribute('src'); res(ok); };
    const to = window.setTimeout(() => fin(false), timeoutMs);
    v.addEventListener('loadedmetadata', () => fin(true));
    v.addEventListener('error', () => { if (++i < OPENING_SRC.length) v.src = OPENING_SRC[i]; else fin(false); });
    v.src = OPENING_SRC[0];
  });
}
interface CgOpt { src?: string[]; hold?: boolean; quiet?: boolean }
const HOLD_MS = 900;

/** 播放宣传片。fromClick = 由按钮触发（有用户手势，可直接带声）；opt.hold = 按住任意键 / 鼠标跳过；opt.quiet = 文件缺失不提示 */
export function playCG(audio: CgAudio, fromClick = true, opt: CgOpt = {}): Promise<void> {
  if (active) return Promise.resolve();
  active = true;
  const srcs = opt.src ?? [CG_SRC]; let si = 0;
  return new Promise(resolve => {
    const el = document.createElement('div'); el.id = 'cg-movie';
    el.innerHTML = '<video playsinline preload="auto"></video><button class="cg-sound" hidden>🔊 点击开启声音</button>'
      + (opt.hold ? '<div class="cg-skip cg-hold">按住任意键跳过<i></i></div>' : '<div class="cg-skip">跳过 ›</div>') + '<div class="cg-msg"></div>';
    // 11-18 Rhett「重放 CG 视频没在前面，被放到后面了」：沙箱（软件渲染）里宣传片层在最上面，实机 Windows 上视频走硬件叠加层（DirectComposition overlay / underlay）时
    //   会被画在页面底下、登录屏照样盖在上面。给视频加一个几乎无变化的滤镜，强制走普通合成（不进叠加层），z-index 才算数；播放期间再把登录屏 / 游戏画布藏起来。?off=cgtop 回旧
    const cgTop = !/(?:[?&]off=[^&]*\bcgtop\b)/.test(location.search);
    if (cgTop) { el.classList.add('cgtop'); document.documentElement.classList.add('cgplay'); }
    document.body.appendChild(el);
    const v = el.querySelector('video') as HTMLVideoElement;
    const sound = el.querySelector('.cg-sound') as HTMLButtonElement;
    const msg = el.querySelector('.cg-msg') as HTMLElement;
    let gone = false;
    if (fromClick) audio.setSceneDim?.(0.2, 0.4);
    const close = (delay = 0) => {
      if (gone) return; gone = true;
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); cancelAnimationFrame(holdRaf); clearTimeout(holdTo);
      window.setTimeout(() => {
        el.classList.add('out'); try { v.pause(); } catch { /* 已释放 */ } document.documentElement.classList.remove('cgplay');
        audio.setSceneDim?.(1, 1);
        window.setTimeout(() => { v.removeAttribute('src'); v.load(); el.remove(); active = false; resolve(); }, 600);
      }, delay);
    };
    // 按住跳过：按下开始计时，松开取消；进度条画在提示下面
    const bar = el.querySelector('.cg-hold i') as HTMLElement | null;
    let holdT0 = 0, holdRaf = 0, holdTo = 0;   // 计时用 setTimeout（低帧率下 rAF 不准），进度条用 rAF
    const holdTick = () => { const k = Math.min(1, (performance.now() - holdT0) / HOLD_MS); if (bar) bar.style.transform = `scaleX(${k})`; if (k >= 1) { holdT0 = 0; close(); } else holdRaf = requestAnimationFrame(holdTick); };
    const holdOn = () => { if (gone || holdT0) return; holdT0 = performance.now(); el.classList.add('holding'); holdRaf = requestAnimationFrame(holdTick); holdTo = window.setTimeout(() => { if (holdT0) { holdT0 = 0; close(); } }, HOLD_MS); };
    const holdOff = () => { if (!holdT0) return; holdT0 = 0; cancelAnimationFrame(holdRaf); clearTimeout(holdTo); el.classList.remove('holding'); if (bar) bar.style.transform = 'scaleX(0)'; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F11' || e.key === 'F12') return; e.preventDefault(); e.stopPropagation(); if (opt.hold) { if (!e.repeat) holdOn(); } else close(); };
    const onKeyUp = (e: KeyboardEvent) => { if (opt.hold) { e.stopPropagation(); holdOff(); } };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    if (opt.hold) {
      el.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('.cg-sound')) return; holdOn(); });
      el.addEventListener('pointerup', holdOff); el.addEventListener('pointercancel', holdOff); el.addEventListener('pointerleave', holdOff);
    } else el.querySelector('.cg-skip')!.addEventListener('click', e => { e.stopPropagation(); close(); });
    sound.addEventListener('click', e => { e.stopPropagation(); v.muted = false; sound.hidden = true; try { audio.unlock(); } catch { /* 无音频 */ } });
    v.addEventListener('playing', () => { el.classList.add('on'); if (!opt.src) markSeen(); }, { once: true });
    v.addEventListener('ended', () => close());
    const start = () => {
      v.src = srcs[si];
      v.play().catch((err: unknown) => {
        if (gone || v.error || (err as { name?: string })?.name === 'NotSupportedError') return;   // 格式不支持：交给 error 换下一个源
        v.muted = true;   // 无用户手势：静音自动播，给出开声按钮
        v.play().then(() => { sound.hidden = false; }).catch(() => close());
      });
    };
    v.addEventListener('error', () => {
      if (gone) return;
      if (++si < srcs.length) { start(); return; }   // mp4 不能播 → 试 webm
      console.warn('视频缺失或无法播放：', srcs.join(' / '));
      if (fromClick && !opt.quiet) { msg.textContent = `未找到宣传片（${srcs[0]}）`; el.classList.add('on', 'err'); close(1600); } else close();
    });
    start();
  });
}
