// ======================================================================
// DLC1 职业音效小件（v1.0.9）：全部用本体给的 ClassSynthApi 实时合成，不带音频文件
// 兽：狼嚎 / 低吼 / 熊咆 / 鹰唳 / 振翅 / 爪击；葬：铁器撞击 / 丧钟 / 铁链 / 拖棺刮地 / 棺盖吱呀 / 亡魂低语 / 挽歌和弦
// ======================================================================
import type { ClassSynthApi as A } from '../../core/ClassExt';

const jit = (k = 0.06) => 1 - k + Math.random() * k * 2;   // 音高随机浮动，连放不腻
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ---------------------------------------------------------------- 兽
/** 狼嚎：先上扬后回落，带颤音 */
export function howl(S: A, d = 0, g = 0.09, len = 0.9, f = 420) {
  const j = jit(); f *= j;
  S.tone({ d, f: f * 0.8, f2: f * 1.5, dur: len * 0.35, gain: g, type: 'triangle', a: 0.12, vib: 25, vibHz: 5.5 });
  S.tone({ d: d + len * 0.4, f: f * 1.5, f2: f * 0.9, dur: len * 0.6, gain: g * 0.9, type: 'triangle', vib: 35, vibHz: 6 });
  S.tone({ d, f: f * 1.6, f2: f * 3, dur: len * 0.35, gain: g * 0.25, type: 'sine', a: 0.12 });
  S.noise({ d, f: f * 3, dur: len, gain: g * 0.3, q: 4, a: 0.1 });
}
/** 低吼：低频锯齿 + 粗颤音（狼咬 / 熊） */
export function growl(S: A, d = 0, g = 0.2, len = 0.35, f = 95) {
  f *= jit();
  S.tone({ d, f, f2: f * 0.75, dur: len, gain: g, type: 'sawtooth', lp: 700, vib: 120, vibHz: 28, a: 0.03 });
  S.tone({ d, f: f * 1.5, f2: f * 1.1, dur: len, gain: g * 0.4, type: 'sawtooth', lp: 900, vib: 160, vibHz: 31, a: 0.03 });
  S.noise({ d, f: 380, dur: len, gain: g * 0.9, q: 2, a: 0.03 });
}
/** 熊咆：比低吼更长更低更响 */
export function roar(S: A, d = 0, g = 0.32, len = 0.9) {
  growl(S, d, g, len, 70);
  S.noise({ d, f: 260, f2: 160, dur: len, gain: g * 0.8, q: 1.5, a: 0.08 });
  S.tone({ d: d + 0.05, f: 55, f2: 35, dur: len, gain: g * 0.9 });
}
/** 鹰唳：尖细下滑的长鸣，两声 */
export function screech(S: A, d = 0, g = 0.07, n = 2) {
  for (let i = 0; i < n; i++) {
    const t = d + i * 0.22, f = 2900 * jit(0.08);
    S.tone({ d: t, f, f2: f * 0.62, dur: 0.3 - i * 0.05, gain: g, type: 'sawtooth', lp: 5200, hp: 900, vib: 60, vibHz: 18, a: 0.02 });
    S.tone({ d: t, f: f * 1.5, f2: f * 0.9, dur: 0.22, gain: g * 0.35, type: 'sine', a: 0.02 });
    S.noise({ d: t, f: 4200, dur: 0.18, gain: g * 0.8, q: 6 });
  }
}
/** 振翅：一下下的低沉风压 */
export function flaps(S: A, d = 0, n = 3, gap = 0.11, g = 0.22) {
  for (let i = 0; i < n; i++) { S.noise({ d: d + i * gap, f: 340, f2: 160, dur: 0.09, gain: g, type: 'lowpass', a: 0.02 }); S.noise({ d: d + i * gap, f: 1300, dur: 0.06, gain: g * 0.25, q: 1 }); }
}
/** 爪击：几道很快的撕裂声（从高到低） */
export function claw(S: A, d = 0, n = 3, g = 0.22) {
  for (let i = 0; i < n; i++) { const f = 3800 * jit(0.1); S.noise({ d: d + i * 0.045, f, f2: f * 0.35, dur: 0.07, gain: g, q: 2.5 }); }
  S.tone({ d, f: 260, f2: 90, dur: 0.08, gain: g * 0.9 });
}
/** 风：起落的呼啸 */
export function wind(S: A, d = 0, len = 0.35, g = 0.22, f0 = 500, f1 = 2200) {
  S.noise({ d, f: f0, f2: f1, dur: len, gain: g, q: 1.6, a: len * 0.3 });
  S.noise({ d, f: f1 * 1.6, dur: len * 0.6, gain: g * 0.25, q: 5, a: len * 0.2 });
}
/** 闷响：重物落地 / 熊掌砸地 */
export function thud(S: A, d = 0, g = 0.75, f = 120, len = 0.35) {
  S.tone({ d, f: f * jit(), f2: 32, dur: len, gain: g });
  S.noise({ d, f: 900, f2: 120, dur: len * 1.2, gain: g * 0.55, type: 'lowpass' });
}
/** 碎石滚落 */
export function rubble(S: A, d = 0, n = 7, g = 0.12) {
  for (let i = 0; i < n; i++) S.noise({ d: d + 0.05 + Math.random() * 0.35, f: 700 + Math.random() * 1500, dur: 0.04, gain: g * jit(0.4), q: 3 });
}
/** 契约木鸣：图腾 / 契印用的木头敲击 + 清亮和声 */
export function pactChime(S: A, d = 0, g = 0.07) {
  S.tone({ d, f: 330, f2: 240, dur: 0.12, gain: g * 3, type: 'triangle', lp: 1600 });   // 木头
  S.noise({ d, f: 1100, dur: 0.05, gain: g * 2, q: 4 });
  [69, 76, 81].forEach((n, i) => S.tone({ d: d + 0.04 + i * 0.05, f: midi(n), dur: 0.7, gain: g, type: 'sine' }));
}

// ---------------------------------------------------------------- 葬
/** 铁器撞击（不和谐泛音，像铁棺 / 铁链砸在一起） */
export function clang(S: A, d = 0, g = 0.12, f = 220, len = 0.6) {
  f *= jit(0.04);
  [1, 2.32, 3.94, 5.81].forEach((r, i) => S.tone({ d, f: f * r, dur: len * (1 - i * 0.18), gain: g / (1 + i * 0.6), type: i ? 'sine' : 'triangle' }));
  S.noise({ d, f: 3000, dur: 0.05, gain: g * 2.2, q: 1.5 });
}
/** 丧钟：低沉的钟声，长余韵 */
export function bell(S: A, d = 0, g = 0.14, f = 98, len = 2.4) {
  [[0.5, 1], [1, 1], [1.19, 0.6], [1.5, 0.45], [2, 0.5], [2.74, 0.25], [3.76, 0.15]].forEach(([r, k], i) =>
    S.tone({ d, f: f * r, dur: len * (i < 2 ? 1 : 0.55), gain: g * k, type: 'sine', vib: i === 1 ? 6 : 0, vibHz: 2.2 }));
  S.noise({ d, f: 1500, dur: 0.06, gain: g * 1.4, q: 2 });
  S.tone({ d, f: f * 0.5, f2: f * 0.45, dur: 0.3, gain: g * 2.5 });
}
/** 铁链哗啦 */
export function chains(S: A, d = 0, n = 8, len = 0.35, g = 0.07) {
  for (let i = 0; i < n; i++) { const t = d + (i / n) * len + Math.random() * 0.02, f = 2600 + Math.random() * 2200; S.tone({ d: t, f, dur: 0.06, gain: g, type: 'triangle' }); S.tone({ d: t, f: f * 1.37, dur: 0.04, gain: g * 0.5, type: 'sine' }); S.noise({ d: t, f: 6000, dur: 0.02, gain: g * 1.2, q: 3 }); }
}
/** 拖棺刮地：粗糙的长刮擦 + 火星噼啪 */
export function scrape(S: A, d = 0, len = 0.3, g = 0.22) {
  S.noise({ d, f: 1600, f2: 2600, dur: len, gain: g, q: 3, a: 0.03 });
  S.noise({ d, f: 260, dur: len, gain: g * 0.7, type: 'lowpass', a: 0.03 });
  for (let i = 0; i < 5; i++) S.noise({ d: d + Math.random() * len, f: 5500, dur: 0.015, gain: g * 0.8, type: 'highpass' });
}
/** 棺盖吱呀：慢慢下滑的锯齿 */
export function creak(S: A, d = 0, len = 0.5, g = 0.06) {
  S.tone({ d, f: 340 * jit(), f2: 210, dur: len, gain: g, type: 'sawtooth', lp: 1800, hp: 200, vib: 90, vibHz: 22, a: 0.05 });
  S.tone({ d, f: 520, f2: 330, dur: len * 0.8, gain: g * 0.4, type: 'square', lp: 1400, vib: 120, vibHz: 19, a: 0.05 });
}
/** 亡魂低语：带颤音的气声 + 一缕飘忽的音（f 随魂的种类变） */
export function whisper(S: A, d = 0, f = 600, g = 0.06, len = 0.8) {
  S.noise({ d, f: f * 2.2, f2: f * 1.2, dur: len, gain: g * 1.6, q: 8, a: len * 0.3 });
  S.tone({ d, f, f2: f * 1.25, dur: len, gain: g, type: 'sine', vib: 45, vibHz: 4.5, a: len * 0.3 });
  S.tone({ d, f: f * 1.5, f2: f * 1.3, dur: len, gain: g * 0.4, type: 'triangle', vib: 30, vibHz: 3.8, a: len * 0.3 });
}
/** 挽歌和弦：低沉的小调合唱（送葬 / 安魂） */
export function dirge(S: A, d = 0, g = 0.035, len = 1.8, root = 45) {
  [0, 3, 7, 12].forEach((n, i) => {
    S.tone({ d: d + i * 0.04, f: midi(root + n), dur: len, gain: g, type: 'sawtooth', lp: 1100, detune: -8, vib: 10, vibHz: 4.8, a: 0.35 });
    S.tone({ d: d + i * 0.04, f: midi(root + n), dur: len, gain: g * 0.8, type: 'sawtooth', lp: 1100, detune: 9, vib: 10, vibHz: 5.1, a: 0.35 });
  });
}
/** 下坠呼啸（铁棺从天而降前） */
export function fall(S: A, d = 0, len = 0.3, g = 0.12) {
  S.noise({ d, f: 2400, f2: 400, dur: len, gain: g, q: 3, a: len * 0.7 });
  S.tone({ d, f: 900, f2: 250, dur: len, gain: g * 0.3, type: 'sine', a: len * 0.7 });
}
/** 铁棺落地 = 闷响 + 铁器撞击 + 骨渣 */
export function coffinLand(S: A, d = 0, g = 1) {
  thud(S, d, 0.75 * g, 110, 0.4);
  clang(S, d, 0.08 * g, 160, 0.5);
  rubble(S, d, 6, 0.1 * g);
}

// ---------------------------------------------------------------- 场景（v1.2.9 d1.11b）
/** 安魂钟：清亮的小钟，三下由弱到强（9A-2 让钟记起声音） */
export function requiem(S: A, d = 0, g = 0.09) {
  [0, 0.55, 1.2].forEach((t, i) => { const f = midi(74 + [0, 3, 7][i]); [1, 2.0, 2.76, 5.4].forEach((r, j) => S.tone({ d: d + t, f: f * r, dur: (2.2 + i * 0.6) / (j + 1), gain: g * (0.6 + i * 0.25) / (j + 1), type: 'sine' })); });
  bell(S, d + 1.2, g * 0.6, 147, 3);
}
/** 斩绳：绷紧的绳子吱一声 → 啪地断开 → 钟往下一沉（9B-2） */
export function ropeSnap(S: A, d = 0, g = 0.14) {
  S.tone({ d, f: 180, f2: 420, dur: 0.22, gain: g * 0.35, type: 'sawtooth', lp: 1400, vib: 30, vibHz: 22, a: 0.05 });
  S.noise({ d: d + 0.22, f: 2400, dur: 0.07, gain: g * 3, q: 0.8 });
  S.tone({ d: d + 0.22, f: 900, f2: 120, dur: 0.18, gain: g * 0.6, type: 'triangle' });
  bell(S, d + 0.45, g * 0.8, 62, 2.6);
  S.tone({ d: d + 0.45, f: 48, f2: 30, dur: 1.2, gain: g * 2 });   // 沉眠者翻身
}
/** 巨鲸登场：长长的鲸歌滑音 + 浪拍岸 */
export function whaleSong(S: A, d = 0, g = 0.1) {
  S.tone({ d, f: 140, f2: 260, dur: 1.1, gain: g, type: 'sine', a: 0.3, vib: 8, vibHz: 3 });
  S.tone({ d: d + 1.0, f: 260, f2: 90, dur: 1.6, gain: g * 0.9, type: 'sine', vib: 12, vibHz: 4 });
  S.tone({ d, f: 280, f2: 520, dur: 1.1, gain: g * 0.25, type: 'triangle', a: 0.3 });
  S.noise({ d: d + 0.4, f: 600, f2: 200, dur: 2.4, gain: g * 1.6, type: 'lowpass', a: 0.8 });
  S.noise({ d: d + 1.6, f: 3000, dur: 0.9, gain: g * 0.6, type: 'highpass', a: 0.1 });
}
/** 骑士团登场：两声铜号 + 一排盾牌齐敲 */
export function warHorn(S: A, d = 0, g = 0.07) {
  [[50, 0, 0.9], [57, 1.0, 1.4]].forEach(([n, t, len]) => { S.tone({ d: d + t, f: midi(n), dur: len, gain: g, type: 'sawtooth', lp: 1100, a: 0.12 }); S.tone({ d: d + t, f: midi(n + 12), dur: len, gain: g * 0.35, type: 'sawtooth', lp: 1600, a: 0.15, detune: 8 }); });
  for (let i = 0; i < 4; i++) clang(S, d + 2.6 + i * 0.16, 0.09, 200 + i * 6, 0.4);
}
