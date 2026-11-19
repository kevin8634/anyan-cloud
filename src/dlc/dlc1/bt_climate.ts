// 11-14d 钟楼气候收尾：死寂调色脉冲 · 无声闪电 · 抉择后赤 / 青天空
// 全部是叠在画布上方的屏幕层（插在 #game 画布之后，排在 HUD 之前），不碰共享后期管线。
//   死寂：进入「死寂」时画面褪色偏铜、四角压暗，持续期间缓慢呼吸，结束时淡出（低画质只留暗角，不做 backdrop-filter）
//   无声闪电：在钟楼区域每 18–40 秒一次冷白闪两三下，没有雷声（钟楼的规矩是「无声」）
//   抉择后：选 A（安魂）天顶偏青，选 B（斩绳）天顶偏赤，柔光叠加在画面上半部
import { curQuality } from '../../web/gfx';

type Layers = { mute: HTMLDivElement; flash: HTMLDivElement; sky: HTMLDivElement };
let L: Layers | null = null;
let dbgMute = 0, dbgFate: 'A' | 'B' | null = null;
/** 自查用：window.__btClimate.flash() / .mute(秒) / .fate('A'|'B') */
(globalThis as any).__btClimate = { flash: () => { nextFlash = 0; }, mute: (s: number) => { dbgMute = s; }, fate: (f: 'A' | 'B' | null) => { dbgFate = f; } };
let muteK = 0, flashT = -1, nextFlash = 22, skyK = 0, skyFate: 'A' | 'B' | null = null, T = 0;
const FLICK = [[0, 0.34], [0.06, 0.04], [0.12, 0.22], [0.2, 0.02], [0.3, 0.12], [0.48, 0]];   // 时间（秒）→ 亮度

function layers(): Layers | null {
  if (L) return L;
  const cv = document.getElementById('game'); if (!cv || !cv.parentElement) return null;
  const mk = (css: string) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:none;' + css; return d; };
  const low = curQuality === 'low';
  const mute = mk((low ? '' : 'backdrop-filter:grayscale(0.65) sepia(0.4) contrast(1.08) brightness(0.92);-webkit-backdrop-filter:grayscale(0.65) sepia(0.4) contrast(1.08) brightness(0.92);')
    + 'background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(30,18,8,0.55) 100%);');
  const flash = mk('background:radial-gradient(ellipse at 50% 0%, rgba(225,238,255,1) 0%, rgba(180,205,240,0.75) 45%, rgba(150,175,215,0.35) 100%);mix-blend-mode:screen;');
  const sky = mk('mix-blend-mode:soft-light;');
  let at: Element = cv;
  for (const d of [sky, mute, flash]) { at.insertAdjacentElement('afterend', d); at = d; }
  return (L = { mute, flash, sky });
}

/** 每帧调用。inZone = 玩家在钟楼区域；silent = 死寂剩余秒数；fate = 抉择结果 */
export function btClimateTick(dt: number, inZone: boolean, silent: number, fate: 'A' | 'B' | null) {
  if (!inZone && !L) return;
  const l = layers(); if (!l) return;
  T += dt;
  if (dbgMute > 0) { silent = Math.max(silent, dbgMute); dbgMute = Math.max(0, dbgMute - dt); }
  if (dbgFate) fate = dbgFate;
  // 死寂：进 0.6 秒、出 1.5 秒
  const muteTo = inZone && silent > 0 ? 1 : 0;
  muteK += (muteTo - muteK) * Math.min(1, dt * (muteTo > muteK ? 1 / 0.6 * 2.2 : 1 / 1.5 * 2.2));
  l.mute.style.opacity = (muteK < 0.005 ? 0 : muteK * (0.82 + 0.18 * Math.sin(T * 1.7))).toFixed(3);
  // 无声闪电（死寂期间也会闪，更瘆人）
  if (!inZone) { flashT = -1; nextFlash = 12 + Math.random() * 10; l.flash.style.opacity = '0'; }
  else {
    if (flashT < 0 && (nextFlash -= dt) <= 0) { flashT = 0; nextFlash = 18 + Math.random() * 22; }
    if (flashT >= 0) {
      flashT += dt; let v = 0;
      for (let i = 0; i < FLICK.length - 1; i++) if (flashT >= FLICK[i][0] && flashT < FLICK[i + 1][0]) { v = FLICK[i][1]; break; }
      if (flashT >= FLICK[FLICK.length - 1][0]) flashT = -1;
      l.flash.style.opacity = v.toFixed(3);
    }
  }
  // 抉择后天色：A 青、B 赤，进区 2 秒淡入
  if (fate && fate !== skyFate) {
    skyFate = fate;
    l.sky.style.background = fate === 'A'
      ? 'linear-gradient(to bottom, rgba(70,205,225,0.9) 0%, rgba(70,205,225,0.35) 32%, rgba(70,205,225,0) 58%)'
      : 'linear-gradient(to bottom, rgba(225,62,40,0.9) 0%, rgba(225,62,40,0.35) 32%, rgba(225,62,40,0) 58%)';
  }
  const skyTo = inZone && fate ? 1 : 0;
  skyK += (skyTo - skyK) * Math.min(1, dt * 1.1);
  l.sky.style.opacity = (skyK < 0.005 ? 0 : skyK * 0.55).toFixed(3);
}
