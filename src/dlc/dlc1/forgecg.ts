// ======================================================================
// DLC1 铸造台 · 三段式 CG（v1.2.73，CG-1 全屏版；方案：云盘 铸造CG整合方案_1031.md，Rhett 10-31 16:41 确认）
//   ① 投纸 f1_drop（一次）→ ② 熔炼循环 f2_loop（结果没到就一直循环）→ ③ 出炉 f3_rise（末帧空光柱定格）
//   → forgeshow 切叠加模式（透明画布）接溶解成形 → 锻锤 → 飞入主手（原样保留）
//   失败：④ 熄炉 f4_fail → 直接用武器库预制武器（走 ③ + 成形），不做「重铸」按钮
//   · 只在 ② 的循环切点（每 FORGE_CG.cut 秒）切段；两个 video 交替，0.3 秒交叉淡入
//   · 结果在 ① 播完前就到 → ① 直接接 ③；续传（有未取回的任务）从 ② 开始
//   · ① / ③ / ④ 点击或 Esc 跳到下一段；② 不可跳（本来就在等）
//   · 兜底：没有视频（商用 base 包 forgecg.gen.ts 为空表）/ 解码失败 / 自动播放被拦 / 卡住 → 退回熔岩 brew，不影响铸造
//   · 视频自带音频，播放期间压低游戏音乐，结束恢复
// 视频：assets_aholo/dlc1/forge_cg/*.webm（VP9 720p）→ gen-assets.mjs 生成 forgecg.gen.ts（data URI，只被包代码 import；本体产物不含）
// ======================================================================
import type { ForgeShow } from './forgeshow';
import { PACK_FORGE_CG } from './forgecg.gen';

export type CgClip = 'f1_drop' | 'f2_loop' | 'f3_rise' | 'f4_fail';
export type CgResult = 'ok' | 'fail' | 'none';
const CLIPS: CgClip[] = ['f1_drop', 'f2_loop', 'f3_rise', 'f4_fail'];
export const FORGE_CG = { fade: 300, cut: 1.0, stallMs: 6000, claimPreview: 10000, volume: 0.85, musicDim: 0.25 };
/** 测试 / 截图：当前阶段与走过的段 */
export const forgeCgState = { phase: 'idle' as 'idle' | 'drop' | 'loop' | 'rise' | 'fail' | 'held' | 'off', path: [] as string[], why: '', loops: 0, skips: 0 };
/** 测试注入（e2e 用假视频；值为 URL / data URI） */
export const forgeCgSrc: Partial<Record<CgClip, string>> = {};

const rawSrc = (c: CgClip): string | undefined => forgeCgSrc[c] ?? (globalThis as { __forgeCgSrc?: Partial<Record<CgClip, string>> }).__forgeCgSrc?.[c] ?? PACK_FORGE_CG[c];
export const forgeCgAvailable = () => CLIPS.every(c => !!rawSrc(c));
/** data URI → blob URL（只转一次；seek / 循环更稳） */
const blobCache = new Map<string, string>();
function srcUrl(c: CgClip): string {
  const s = rawSrc(c)!; if (!s.startsWith('data:')) return s;
  let u = blobCache.get(s); if (u) return u;
  try {
    const i = s.indexOf(','), mime = s.slice(5, s.indexOf(';')) || 'video/webm', bin = atob(s.slice(i + 1)), a = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k);
    u = URL.createObjectURL(new Blob([a], { type: mime }));
  } catch { u = s; }
  blobCache.set(s, u); return u;
}

/** 字幕只留阶段词（Rhett 10-31：去掉秒数和 MB） */
export function forgeStageWord(txt: string): string {
  if (/排队|等待|提交/.test(txt)) return '排队中';
  if (/取回|下载|开炉|MB/.test(txt)) return '出炉';
  return '炉火锻造中';
}

export interface ForgeCg {
  /** 视频还在正常播（false = 已退回 brew） */
  ok(): boolean;
  /** 告诉 CG 结果：ok = ③；fail = ④ → ③（武器库预制武器）；none = ④ 后结束（没有任何模型）。③ 播完（末帧定格）resolve true；退回 brew resolve false */
  finish(kind: CgResult): Promise<boolean>;
  stop(): void;
}

export function startForgeCg(show: ForgeShow, o: { from?: 'drop' | 'loop' | 'rise'; musicDim?: (k: number) => void } = {}): ForgeCg | null {
  if (!forgeCgAvailable()) return null;
  forgeCgState.phase = 'idle'; forgeCgState.path = []; forgeCgState.why = ''; forgeCgState.loops = 0; forgeCgState.skips = 0;
  const layer = document.createElement('div'); layer.id = 'd1-forgecg';
  layer.style.cssText = 'position:absolute;inset:0;z-index:0;background:#000;overflow:hidden';
  const mk = () => { const v = document.createElement('video'); v.playsInline = true; v.preload = 'auto'; v.volume = FORGE_CG.volume;
    v.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity ${FORGE_CG.fade}ms linear`; layer.appendChild(v); return v; };
  const vids = [mk(), mk()];
  let cur = -1, dead = false, result: CgResult | null = null, onEnd: (() => void) | null = null, lastT = -1, lastTick = performance.now(), raf = 0, cutIdx = -1;
  const waiters: ((ok: boolean) => void)[] = [];
  show.host.insertBefore(layer, show.host.firstChild); show.hold(true);
  try { o.musicDim?.(FORGE_CG.musicDim); } catch { /* 无音乐 */ }

  const cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); try { o.musicDim?.(1); } catch { /* 无音乐 */ } };
  const settle = (ok: boolean) => { waiters.splice(0).forEach(w => w(ok)); };
  const bail = (why: string) => {
    if (dead) return; dead = true; forgeCgState.phase = 'off'; forgeCgState.why = why; cleanup();
    vids.forEach(v => { try { v.pause(); } catch { /* 已释放 */ } }); layer.remove(); show.hold(false); settle(false);
  };
  const play = (c: CgClip, loop = false, end?: () => void) => {
    if (dead) return;
    const n = (cur + 1) % 2, v = vids[n], old = cur >= 0 ? vids[cur] : null; cur = n;
    forgeCgState.path.push(c); onEnd = end ?? null; lastT = -1; lastTick = performance.now(); cutIdx = -1;
    v.loop = loop; v.src = srcUrl(c); v.currentTime = 0;
    v.onplaying = () => { if (dead || vids[cur] !== v) return; v.style.zIndex = '1'; v.style.opacity = '1';
      if (old) { old.style.zIndex = '0'; setTimeout(() => { if (vids[cur] !== old) { old.style.opacity = '0'; try { old.pause(); } catch { /* 已释放 */ } } }, FORGE_CG.fade); } };
    v.onended = () => { if (!dead && vids[cur] === v && onEnd) { const f = onEnd; onEnd = null; f(); } };
    v.onerror = () => { if (vids[cur] === v) bail('decode'); };
    const p = v.play(); if (p) p.catch(e => { if (vids[cur] === v && !dead) bail((e as Error)?.name === 'NotAllowedError' ? 'autoplay' : 'play'); });
  };
  const toResult = () => {
    if (dead || !result) return;
    if (result === 'ok') rise();
    else { forgeCgState.phase = 'fail'; play('f4_fail', false, () => { if (result === 'none') { forgeCgState.phase = 'held'; settle(true); } else rise(); }); }
  };
  const rise = () => { forgeCgState.phase = 'rise'; play('f3_rise', false, () => { forgeCgState.phase = 'held'; cleanup(); settle(true); }); };
  const loop = () => { forgeCgState.phase = 'loop'; play('f2_loop', true); };
  const drop = () => { forgeCgState.phase = 'drop'; play('f1_drop', false, () => { if (result) toResult(); else loop(); }); };

  // 每帧：② 循环切点检测；卡住检测（时间轴不走 = 解码卡死 / 被后台挂起）
  const tick = () => {
    if (dead) return;
    const v = vids[cur];
    if (v) {
      const t = v.currentTime, now = performance.now();
      if (t !== lastT) { if (forgeCgState.phase === 'loop' && t < lastT) forgeCgState.loops++; lastT = t; lastTick = now; }
      else if (!v.paused && !v.ended && forgeCgState.phase !== 'held' && !document.hidden && now - lastTick > FORGE_CG.stallMs) { bail('stall'); return; }
      if (forgeCgState.phase === 'loop' && result) { const k = Math.floor(t / FORGE_CG.cut); if (cutIdx < 0) cutIdx = k; else if (k !== cutIdx) { toResult(); } }
    }
    raf = requestAnimationFrame(tick);
  };
  // 跳过：① / ③ / ④ 点击或 Esc
  const skip = () => {
    if (dead) return; const ph = forgeCgState.phase, v = vids[cur];
    if (ph !== 'drop' && ph !== 'rise' && ph !== 'fail') return;
    forgeCgState.skips++;
    if (ph === 'rise') { try { v.pause(); if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.04); } catch { /* 无 */ } }
    const f = onEnd; onEnd = null; f?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dead && forgeCgState.phase !== 'held') { e.stopPropagation(); e.preventDefault(); skip(); } };
  layer.addEventListener('pointerdown', () => skip());
  window.addEventListener('keydown', onKey, true);

  if (o.from === 'rise') rise(); else if (o.from === 'loop') loop(); else drop();
  raf = requestAnimationFrame(tick);

  return {
    ok: () => !dead,
    finish: kind => new Promise<boolean>(res => {
      if (dead) return res(false);
      if (forgeCgState.phase === 'held') return res(true);
      waiters.push(res);
      if (result) return; result = kind;
      // ① 播放中：等 ① 播完自动接；② 循环中：等下一个切点（tick）；从 ③ 起步的（领取）本来就在出炉
    }),
    stop: () => { if (dead) return; dead = true; cleanup(); vids.forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* 已释放 */ } }); layer.remove(); settle(false); },
  };
}
