// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 环境声（全部 WebAudio 实时合成，不带音频文件；接本体 PackCtx.ambient() 环境音总线）
//   持续层（按风暴 / 区域平滑调音量）：海浪（褐噪声低通 + 涌浪包络）、浪花嘶声、风（带通 + 阵风扫频）、风啸（窄带）、雨（高通 + 雨点）
//   事件：雷声（闪电回调：炸裂 + 低频滚雷 + 二次回响，延迟与闪光同步）、远处铜钟（非谐泛音 + 回声）、锁链轻响、木头吱呀
//   A / C 区：柔浪 + 和风 + 远钟 / 锁链 / 木吱呀；B 区：雷暴 + 巨浪 + 狂风 + 雨，背景音乐压低（PackCtx.musicDim）
// ======================================================================
import type { PackCtx } from '../../core/ContentPacks';
import { setThunderSink } from './coast_storm';

type Amb = { ctx: AudioContext; out: AudioNode };
interface Layer { g: GainNode; f: BiquadFilterNode; f2?: BiquadFilterNode }
let A: { ctx: AudioContext; bus: GainNode; verb: GainNode; sea: Layer; hiss: Layer; wind: Layer; howl: Layer; rain: Layer; drip: Layer; white: AudioBuffer; brown: AudioBuffer } | null = null;
export const audioStats = { connected: false, nodes: 0, bells: 0, chains: 0, creaks: 0, thunders: 0, lastThunderCtxT: -1, dim: 1, gains: { sea: 0, wind: 0, rain: 0, bus: 0 } };
let T = 0, nextBell = 4, nextChain = 3, nextCreak = 5, lastDim = 1, retry = 0, wasHere = false;
let ctxRef: PackCtx | null = null;

function buffers(c: AudioContext) {
  const n = c.sampleRate * 4, w = c.createBuffer(1, n, c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), wd = w.getChannelData(0), bd = b.getChannelData(0);
  let last = 0; for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; wd[i] = r; last = (last + 0.02 * r) / 1.02; bd[i] = last * 3.5; }
  return { white: w, brown: b };
}
function loop(c: AudioContext, buf: AudioBuffer, dst: AudioNode) { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.connect(dst); s.start(c.currentTime + Math.random() * 0.1); audioStats.nodes++; return s; }
function layer(c: AudioContext, buf: AudioBuffer, bus: AudioNode, type: BiquadFilterType, f: number, q = 0.7, type2?: BiquadFilterType, f2?: number): Layer {
  const g = c.createGain(); g.gain.value = 0; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  let tail: AudioNode = fl, fl2: BiquadFilterNode | undefined;
  if (type2) { fl2 = c.createBiquadFilter(); fl2.type = type2; fl2.frequency.value = f2 ?? 8000; fl.connect(fl2); tail = fl2; }
  tail.connect(g); g.connect(bus); loop(c, buf, fl); audioStats.nodes += type2 ? 3 : 2;
  return { g, f: fl, f2: fl2 };
}
function connect(amb: Amb) {
  const c = amb.ctx, { white, brown } = buffers(c);
  const bus = c.createGain(); bus.gain.value = 0; bus.connect(amb.out);
  // 简易回声（远处钟声 / 雷声的空间感）：两路反馈延迟 + 低通
  const verb = c.createGain(); verb.gain.value = 1; const d1 = c.createDelay(1), d2 = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter();
  d1.delayTime.value = 0.23; d2.delayTime.value = 0.37; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400;
  verb.connect(d1); verb.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb); fb.connect(d1); lp.connect(bus); verb.connect(bus);
  audioStats.nodes += 6;
  A = { ctx: c, bus, verb, white, brown,
    sea: layer(c, brown, bus, 'lowpass', 420, 0.6),
    hiss: layer(c, white, bus, 'highpass', 1800, 0.5, 'lowpass', 7000),
    wind: layer(c, white, bus, 'bandpass', 500, 0.8),
    howl: layer(c, white, bus, 'bandpass', 760, 9),
    rain: layer(c, white, bus, 'highpass', 2800, 0.6, 'lowpass', 9500),
    drip: layer(c, white, bus, 'bandpass', 5200, 2.2) };
  audioStats.connected = true;
  setThunderSink(thunder);
}
const ramp = (p: AudioParam, v: number, tc = 0.35) => { if (!A) return; p.setTargetAtTime(v, A.ctx.currentTime, tc); };

// ---------------------------------------------------------------- 事件音
/** 雷声：delay 秒后（闪电回调，和闪光同步） */
function thunder(delay: number, k: number, dist: number) {
  if (!A) return; const c = A.ctx, t = c.currentTime + Math.max(0, delay);
  // 炸裂（近雷才明显）
  const near = Math.max(0, 1 - dist / 260);
  const cr = c.createBufferSource(); cr.buffer = A.white; const crf = c.createBiquadFilter(); crf.type = 'highpass'; crf.frequency.value = 1400; const crg = c.createGain();
  crg.gain.setValueAtTime(0, t); crg.gain.linearRampToValueAtTime(0.5 * k * near + 0.08, t + 0.01); crg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  cr.connect(crf); crf.connect(crg); crg.connect(A.bus); cr.start(t, Math.random() * 2, 0.5);
  // 滚雷：褐噪声 → 低通扫频，长尾，两段
  for (const [dt, amp, len] of [[0.02, 1, 3.6 + Math.random() * 1.6], [0.45 + Math.random() * 0.3, 0.6, 2.8]] as [number, number, number][]) {
    const s = c.createBufferSource(); s.buffer = A.brown; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.9; const g = c.createGain(), t0 = t + dt;
    f.frequency.setValueAtTime(420, t0); f.frequency.exponentialRampToValueAtTime(90, t0 + len);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.85 * k * amp, t0 + 0.06); g.gain.setTargetAtTime(0.45 * k * amp, t0 + 0.25, 0.4); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    s.connect(f); f.connect(g); g.connect(A.bus); g.connect(A.verb); s.start(t0, Math.random() * 2, len + 0.2);
  }
  audioStats.thunders++; audioStats.lastThunderCtxT = +t.toFixed(3);
}
/** 远处铜钟：非谐泛音（1 / 2 / 2.76 / 5.4 / 8.9），长衰减，送回声 */
function bell(f0: number, g0: number) {
  if (!A) return; const c = A.ctx, t = c.currentTime + 0.02;
  const P: [number, number, number][] = [[1, 1, 5.5], [2, 0.45, 3.2], [2.76, 0.55, 2.6], [5.4, 0.22, 1.4], [8.9, 0.1, 0.8], [0.5, 0.3, 6.5]];
  for (const [r, a, d] of P) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * 0.004); const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0 * a, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(g); g.connect(A.verb); o.start(t); o.stop(t + d + 0.1); }
  audioStats.bells++;
}
/** 锁链：几声短促金属叮当 + 噪声擦响 */
function chain(g0: number) {
  if (!A) return; const c = A.ctx, n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) { const t = c.currentTime + 0.03 + i * (0.07 + Math.random() * 0.09), o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 2300 + Math.random() * 2200;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0 * (0.6 + Math.random() * 0.4), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12 + Math.random() * 0.1);
    o.connect(g); g.connect(A.verb); o.start(t); o.stop(t + 0.3);
    const s = c.createBufferSource(); s.buffer = A.white; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3500; f.Q.value = 3; const ng = c.createGain();
    ng.gain.setValueAtTime(g0 * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.06); s.connect(f); f.connect(ng); ng.connect(A.bus); s.start(t, Math.random() * 3, 0.08); }
  audioStats.chains++;
}
/** 木头吱呀：低频锯齿 + 滑音 + 低通，颤动 */
function creak(g0: number) {
  if (!A) return; const c = A.ctx, t = c.currentTime + 0.02, len = 0.45 + Math.random() * 0.6, f0 = 70 + Math.random() * 80;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1.25 + Math.random() * 0.5), t + len);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 18 + Math.random() * 14; lg.gain.value = f0 * 0.18; lfo.connect(lg); lg.connect(o.frequency);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650 + Math.random() * 500; f.Q.value = 2.5; const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0, t + 0.08); g.gain.setValueAtTime(g0 * 0.8, t + len - 0.1); g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(f); f.connect(g); g.connect(A.verb); o.start(t); o.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len + 0.05);
  audioStats.creaks++;
}

// ---------------------------------------------------------------- 每帧
export interface CoastAudioState { here: boolean; storm: number; wind: number; rain: number; reef: number; zone: 'A' | 'B' | 'C' }
export function coastAudioUpdate(dt: number, ctx: PackCtx | null, s: CoastAudioState) {
  ctxRef = ctx;
  if (!s.here) {
    if (wasHere) { wasHere = false; if (A) ramp(A.bus.gain, 0, 0.6); if (lastDim !== 1) { ctx?.musicDim?.(1); lastDim = 1; audioStats.dim = 1; } }
    return;
  }
  wasHere = true; T += dt;
  if (!A) { retry -= dt; if (retry > 0) return; retry = 1; const amb = ctx?.ambient?.() as Amb | null | undefined; if (amb?.ctx && amb.out) { try { connect(amb); } catch (e) { console.error('沉钟海岸环境声出错', e); retry = 30; } } if (!A) return; }
  const st = s.storm, calm = 1 - st, surge = Math.pow(0.5 + 0.5 * Math.sin(T * (0.5 + 0.35 * st)), 3);
  const seaG = (0.16 + 0.55 * st) * (0.45 + 0.55 * surge), windG = 0.035 + 0.04 * s.reef + 0.32 * st * (0.6 + 0.4 * Math.sin(T * 0.37) * Math.sin(T * 0.13 + 1)), rainG = 0.22 * s.rain;
  ramp(A.bus.gain, 1, 0.8);
  ramp(A.sea.g.gain, seaG, 0.25); ramp(A.sea.f.frequency, 380 + 620 * st + 200 * surge, 0.3);
  ramp(A.hiss.g.gain, (0.02 + 0.1 * st) * surge, 0.25);
  ramp(A.wind.g.gain, windG, 0.5); ramp(A.wind.f.frequency, 380 + 700 * (0.5 + 0.5 * Math.sin(T * 0.21 + Math.sin(T * 0.53))) * (0.6 + 0.6 * st), 0.6);
  ramp(A.howl.g.gain, 0.07 * st * (0.5 + 0.5 * Math.sin(T * 0.29)), 0.6); ramp(A.howl.f.frequency, 600 + 450 * (0.5 + 0.5 * Math.sin(T * 0.17)), 0.8);
  ramp(A.rain.g.gain, rainG, 0.6); ramp(A.drip.g.gain, 0.07 * s.rain, 0.6);
  Object.assign(audioStats.gains, { sea: +seaG.toFixed(3), wind: +windG.toFixed(3), rain: +rainG.toFixed(3), bus: 1 });
  // 远处铜钟 / 锁链 / 木头吱呀（风暴里钟声被盖住、吱呀和锁链更频繁）
  nextBell -= dt; nextChain -= dt; nextCreak -= dt;
  if (nextBell <= 0) { const C = s.zone === 'C'; const base = [196, 220, 262, 294, 330][Math.floor(Math.random() * 5)] * (C ? 1.5 : 1); bell(base, (C ? 0.07 : 0.05) * (0.35 + 0.65 * calm)); nextBell = C ? 5 + Math.random() * 7 : 8 + Math.random() * 10; }
  if (nextChain <= 0) { chain(0.035 + 0.04 * st); nextChain = (st > 0.5 ? 2.5 : 5) + Math.random() * 6; }
  if (nextCreak <= 0) { creak(0.05 + 0.06 * st); nextCreak = (st > 0.5 ? 2 : 6) + Math.random() * 8; }
  // 风暴压低音乐
  const dim = +(1 - 0.62 * st).toFixed(2);
  if (Math.abs(dim - lastDim) >= 0.04 || (dim === 1 && lastDim !== 1)) { ctx?.musicDim?.(dim); lastDim = dim; audioStats.dim = dim; }
}
export const coastAudioDebug = () => ({ ...audioStats, gains: { ...audioStats.gains }, hasCtx: !!ctxRef?.ambient });
