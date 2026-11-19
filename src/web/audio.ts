// 音频：全部用 WebAudio 实时合成，不需要音频文件
// 背景音乐（营地 / 原野 / 矿洞 / 腐沼 / 两套 Boss，按场景交叉淡入）+ 技能、打击、怪物、界面音效
// v1.2.48 曲目 + 配音（可选）：有音频文件的构建（比赛版）按场景播放曲目（HTMLAudioElement 按需加载，交叉淡入淡出），
//   曲目缺失 / 加载失败自动回退程序化音乐；配音播放时背景音乐自动压低（ducking）。浏览器自动播放限制：首次交互（unlock）后才出声。
import { packMusicFor, packTracks, type MusicScene } from '../core/ContentPacks';
import { MUSIC_TRACKS } from './assets.gen';
import { SKILL_SFX, SKILL_SFX_MAP, SKILL_SFX_LOOP } from './sfx.gen';
import { CHAINLIGHT_SFX } from './sfx_chainlight';
const SFX_LOOP = new Set(SKILL_SFX_LOOP);   // 11-08：只有持续类样本循环到技能时长；其余留地面的技能样本放一次 + 元素底噪

// 1107：技能音效样本层（AI 生成样本，见 tools/sfx/）。播放样本后 0.4 秒内静音这些程序合成的施法音，避免叠音；样本缺失 / 解码失败则照旧用合成音
const SFX_SRC: Record<string, string> = { ...SKILL_SFX }, SFX_MAP: Record<string, string> = { ...SKILL_SFX_MAP };
// 11-19 C21 lightsfx：闪电链换 Rhett 给的新样本（?off=lightsfx 回旧 m_lightning）
(() => { try {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
  const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
  if (`${q},${ls}`.split(',').some(n => n.trim() === 'lightsfx')) return;
} catch { /* 取不到参数就用新样本 */ }
  SFX_SRC.m_chainlight_1119 = CHAINLIGHT_SFX; SFX_MAP.chain_lightning = 'm_chainlight_1119'; })();
const LIVE: GameAudio[] = [];
/** 内容包登记技能音效样本：src = 样本名 → data URI，map = 技能 baseId → 样本名（包加载时调用，早于或晚于 GameAudio 建立都行） */
export function registerSkillSfx(src: Record<string, string>, map: Record<string, string>) { Object.assign(SFX_SRC, src); Object.assign(SFX_MAP, map); for (const a of LIVE) a.refreshSfx(); }
const SYNTH_MUTE = new Set(['skl1', 'skl2', 'swing', 'bolt', 'charge', 'ult', 'el', 'whirl', 'thunder', 'meteor', 'nova', 'ctick', 'glass', 'slam', 'phase', 'tele', 'roar']);
export type Theme = 'camp' | 'dungeon' | 'boss' | 'swamp' | 'boss2' | 'field' | 'redsand' | 'frost' | 'ember' | 'event' | 'abyss' | 'final' | 'ending' | 'tide' | 'bell' | 'none';
const THEMES: Theme[] = ['camp', 'dungeon', 'boss', 'swamp', 'boss2', 'field', 'redsand', 'frost', 'ember', 'event', 'abyss', 'final', 'ending', 'tide', 'bell'];
/** 各主题的速度（BPM） */
const BPM: Partial<Record<Theme, number>> = { boss: 140, boss2: 126, dungeon: 72, swamp: 66, field: 96, camp: 88, redsand: 100, frost: 76, ember: 84, event: 132, abyss: 60, final: 116, ending: 70, tide: 70, bell: 56 };   // v0.8.4 深渊 / 最终战 / 结局
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  /** 阶段四：环境音（风、虫鸣、熔岩）单独一路音量；战斗层（野外遇敌时淡入的鼓点） */
  private ambBus!: GainNode;
  private combatGain!: GainNode;
  private combatOn = false;
  ambVol = 0.7;
  private noiseBuf!: AudioBuffer;
  private themeGains = new Map<Theme, GainNode>();
  theme: Theme = 'none';
  private nextStep = 0; private step = 0;
  private timer: number | null = null;
  musicVol = 0.55; sfxVol = 0.8; muted = false; masterVol = 1;   // 主音量（设置）
  voiceVol = 0.9;   // v1.2.48 语音（首领配音 / 旁白）
  /** v1.2.48 曲目播放器（没有曲目的构建 = 永远走程序化音乐） */
  readonly tracks = new TrackPlayer(() => this.trackVolume(), name => this.onTrackFail(name));
  private scene: { zone: string; boss: string | null; map?: string } = { zone: '', boss: null };
  private trackOn = false;
  private duck = 1;
  /** v1.2.71 场景压低（内容包按场景压低音乐，如风暴环境声盖过音乐；和配音 ducking 相乘） */
  private dim = 1;
  private gestured = false;
  private vo: HTMLAudioElement | null = null;
  /** v1.2.48 开场动画被玩家点掉时调用（main.ts 挂开场旁白） */
  introDone: (() => void) | null = null;
  private lastPlay = new Map<string, number>();

  /** 必须在用户点击后调用（浏览器自动播放限制） */
  unlock() {
    if (!this.gestured) { this.gestured = true; this.tracks.gestured = true; this.refreshMusic(); }
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master = c.createGain(); this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.connect(this.master);
    this.combatGain = c.createGain(); this.combatGain.gain.value = 0; this.combatGain.connect(this.musicBus);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const t of THEMES) { const g = c.createGain(); g.gain.value = 0; g.connect(this.musicBus); this.themeGains.set(t, g); }
    this.applyVolumes();
    this.nextStep = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.decodeSfx();
  }
  applyVolumes() {
    if (!this.ctx) { this.tracks.applyVolume(); if (this.vo) this.vo.volume = this.voiceVolume(); return; }
    this.master.gain.value = this.muted ? 0 : this.masterVol;
    this.musicBus.gain.value = this.musicVol * 0.5 * this.duck * this.dim;
    this.sfxBus.gain.value = this.sfxVol;
    this.ambBus.gain.value = this.ambVol * 0.8;
    this.tracks.applyVolume();
    if (this.vo) this.vo.volume = this.voiceVolume();
  }
  // ======================= v1.2.48 曲目 / 配音 =======================
  private trackVolume() { return this.muted ? 0 : Math.max(0, Math.min(1, this.masterVol * this.musicVol * 0.5 * this.duck * this.dim)); }
  private voiceVolume() { return this.muted ? 0 : Math.max(0, Math.min(1, this.masterVol * this.voiceVol)); }
  /** 选曲：结局 → 标题 → 内容包规则 → 本体默认（首领战）；曲目不可用 = null（走程序化） */
  pickTrack(t: Theme): string | null {
    const has = (n: string | null) => (n && this.tracks.has(n) ? n : null);
    if (t === 'ending') return has('ending');
    if (this.scene.zone === 'title') return has('title_theme');
    const s: MusicScene = { theme: t, zone: this.scene.zone, boss: this.scene.boss };
    const p = has(packMusicFor(s)); if (p) return p;
    if (s.boss || t === 'boss' || t === 'boss2' || t === 'final' || (t === 'event' && s.zone === 'raid')) return has('boss_battle');
    if (baseMusicOn()) return has(baseTrackFor(t, this.scene.zone, this.scene.map));   // 11-18 本体各地图专属曲（Suno），曲目缺失 = null（程序化）
    return null;
  }
  private onTrackFail(name: string) { console.warn(`曲目 ${name} 加载失败，回退程序化音乐`); this.refreshMusic(); }
  /** 重新按当前主题 / 场景选曲（曲目加载失败、首次交互时调用） */
  refreshMusic() { const w = this.want; this.theme = 'none' as Theme; this.lastTrack = undefined; this.setTheme(w); }
  private lastTrack: string | null | undefined = undefined;
  /** 配音：播放一句（data URI / URL），onDur = 拿到时长后回调（秒，用于字幕停留时间）；返回是否开始播放（未交互 / 静音失败 = false） */
  playVoice(src: string, onDur?: (sec: number) => void): boolean {
    if (!this.gestured || !src || typeof Audio === 'undefined') return false;
    this.stopVoice();
    let a: HTMLAudioElement;
    try { a = new Audio(src); } catch { return false; }
    this.vo = a; a.preload = 'auto'; a.volume = this.voiceVolume();
    const end = () => { if (this.vo === a) { this.vo = null; this.setDuck(false); } };
    a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration)) onDur?.(a.duration); });
    a.addEventListener('ended', end); a.addEventListener('error', end);
    this.setDuck(true);   // 先压低（数据已内联，基本立即出声）；播放失败 / 结束时恢复
    const pr = a.play(); if (pr && pr.catch) pr.catch(end);
    return true;
  }
  stopVoice() { const a = this.vo; if (!a) return; this.vo = null; try { a.pause(); } catch { /* 已释放 */ } this.setDuck(false); }
  get voicePlaying() { return !!this.vo; }
  /** 压低背景音乐（配音期间约 30%），淡入 0.25 秒、恢复 0.8 秒 */
  private setDuck(on: boolean) {
    const k = on ? 0.3 : 1; if (this.duck === k) return;
    this.duck = k; this.tracks.fadeVolume(on ? 0.25 : 0.8);
    if (this.ctx) { const g = this.musicBus.gain, now = this.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(this.musicVol * 0.5 * k * this.dim, now + (on ? 0.25 : 0.8)); }
  }
  /** v1.2.71 场景压低背景音乐：k = 0.2–1（1 = 不压），sec 秒渐变（曲目与程序化音乐都生效） */
  setSceneDim(k: number, sec = 1.2) {
    k = Number.isFinite(k) ? Math.max(0.2, Math.min(1, k)) : 1; if (Math.abs(k - this.dim) < 0.005) return;
    this.dim = k; this.tracks.fadeVolume(sec);
    if (this.ctx) { const g = this.musicBus.gain, now = this.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(this.musicVol * 0.5 * this.duck * k, now + sec); }
  }
  get sceneDim() { return this.dim; }
  /** 11-18 环境音（amb_sfx.ts）：当前选曲场景 key（副本 / 长副本 = map，否则 zone），与 BASE_TRACKS 同口径 */
  get sceneKey() { return this.scene.map || this.scene.zone; }
  /** v1.2.71 环境声输出：WebAudio 上下文 + 环境音总线（受环境音量设置控制）；音频还没解锁 = null */
  ambientOut(): { ctx: AudioContext; out: AudioNode } | null { return this.ctx && this.ambBus ? { ctx: this.ctx, out: this.ambBus } : null; }
  /** 野外战斗层：遇敌时鼓点淡入，脱战淡出（Boss / 副本主题自带节奏，不叠加） */
  setCombat(on: boolean) {
    if (this.trackOn) on = false;   // v1.2.48 曲目在播：不叠程序化鼓点
    if (on === this.combatOn || !this.ctx) { this.combatOn = on; return; }
    this.combatOn = on;
    const now = this.ctx.currentTime, g = this.combatGain.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(on ? 1 : 0, now + (on ? 0.8 : 2.5));
  }
  /** v0.8.4：强制主题（结局过场期间不被场景音乐覆盖），null 取消 */
  held: Theme | null = null; private want: Theme = 'none';
  hold(t: Theme | null) { this.held = t; const w = this.want; this.theme = 'none' as Theme; this.setTheme(w); }
  /** sc（v1.2.48，可选）= 选曲场景：zone 区域 id（标题画面 'title'）、boss 正在交战的首领 key；不填 = 沿用上次 */
  setTheme(t: Theme, sc?: { zone: string; boss?: string | null; map?: string }) {
    if (sc) this.scene = { zone: sc.zone, boss: sc.boss ?? null, map: sc.map };
    this.want = t; if (this.held) t = this.held;
    const track = this.gestured ? this.pickTrack(t) : null;
    if (t === this.theme && track === this.lastTrack) return;
    this.theme = t; this.lastTrack = track;
    this.trackOn = !!track;
    this.tracks.play(track);
    if (track && this.combatOn) this.setCombat(false);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.themeGains.forEach((g, k) => { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(k === t && !track ? 1 : 0, now + 1.5); });
  }

  // ======================= 基础合成 =======================
  private env(g: GainNode, t: number, peak: number, a: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  private tone(o: { f: number; f2?: number; type?: OscillatorType; dur: number; gain: number; a?: number; t?: number; out?: AudioNode; detune?: number; lp?: number }) {
    const c = this.ctx!; const t = o.t ?? c.currentTime;
    const osc = c.createOscillator(); osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain(); this.env(g, t, o.gain, o.a ?? 0.005, o.dur);
    let node: AudioNode = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.out ?? this.sfxBus);
    osc.start(t); osc.stop(t + (o.a ?? 0.005) + o.dur + 0.05);
  }
  private noise(o: { dur: number; gain: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; a?: number; t?: number; out?: AudioNode }) {
    const c = this.ctx!; const t = o.t ?? c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = c.createGain(); this.env(g, t, o.gain, o.a ?? 0.005, o.dur);
    s.connect(f); f.connect(g); g.connect(o.out ?? this.sfxBus);
    s.start(t, Math.random()); s.stop(t + (o.a ?? 0.005) + o.dur + 0.05);
  }
  /** 同一个音效短时间内只播一次，避免群怪时爆音 */
  private gate(key: string, minGap: number) {
    if (!this.ctx) return false;
    // 11-07 通用件与 AI 核心层混用（Rhett 22:23）：样本 = 核心层，只顶替紧随其后的第一个合成施法音（同键重复也算）；
    // 挥空 / 命中 / 尾音等其他合成层照常叠在样本上，别的技能的合成音也不再被整窗吞掉
    if (this.ctx.currentTime < this.synthMute && (SYNTH_MUTE.has(key) || key.startsWith('x:'))) { if (this.muteKey === null) this.muteKey = key; if (this.muteKey === key) return false; }
    const now = this.ctx.currentTime, last = this.lastPlay.get(key) ?? -9;
    if (now - last < minGap) return false;
    this.lastPlay.set(key, now); return true;
  }

  // ======================= 扩展合成（v1.0.9：职业自带音效用；d = 延迟秒） =======================
  extGate(key: string, gap: number) { return this.gate('x:' + key, gap); }

  // ======================= 1107 技能音效样本层 =======================
  private sfxBuf = new Map<string, AudioBuffer | null>();
  private synthMute = -9;
  private muteKey: string | null = null;
  private sfxLive = (LIVE.push(this), true);
  refreshSfx() { if (this.sfxLive && this.ctx) this.decodeSfx(); }
  private decodeSfx() {
    const c = this.ctx; if (!c) return;
    for (const [k, u] of Object.entries(SFX_SRC)) {
      if (this.sfxBuf.has(k)) continue; this.sfxBuf.set(k, null);
      try {
        const bin = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        c.decodeAudioData(a.buffer).then(b => this.sfxBuf.set(k, b), () => console.warn(`技能音效 ${k} 解码失败，回退合成音`));
      } catch { console.warn(`技能音效 ${k} 读取失败，回退合成音`); }
    }
  }
  /** 技能施放：有样本就播样本并返回 true（随后 0.4 秒内第一个合成施法音被样本顶替，其余合成层照常） */
  /** hold = 持续性技能（地面区域 / 引导）的持续秒数：11-08 Rhett「持续性技能的声效应该跟随技能效果持续到结束，暴风雪 8 秒就响 8 秒」
   *  → 样本先完整起音，之后在样本中后段（35%–92%）循环，到 hold 秒时 0.5 秒淡出停止；没有样本时铺一层按元素的滤波噪声底 */
  skillSample(baseId: string, hold = 0, element?: string, variant?: string): boolean {
    const c = this.ctx; if (!c) return false;
    const k = (variant && SFX_MAP[baseId + '@' + variant]) || (element && SFX_MAP[baseId + '@' + element]) || SFX_MAP[baseId]; const b = k ? this.sfxBuf.get(k) : null;   // 11-13 I07：variant = 灵契猎手的契（wolf / bear / eagle）
    if (!b) { if (hold > 1.2) this.sustainBed(hold, element); return false; }
    this.synthMute = c.currentTime + 0.4; this.muteKey = null;
    if (!this.gate('smp:' + k, 0.06)) return true;
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = c.createGain(); g.gain.value = 0.9; src.connect(g); g.connect(this.sfxBus);
    const t = c.currentTime;
    if (hold > b.duration + 0.3 && !SFX_LOOP.has(k!)) { src.start(t); this.sustainBed(hold, element); return true; }   // 11-08 冲击类（陨星、裂地等）不再反复循环爆炸声
    if (hold > b.duration + 0.3) {
      const le = k === 'm_blizzard_fire' ? 0.82 : 0.92;   // 11-17 Rhett 的火焰暴风雪样本末尾 1.2 秒自带淡出，循环段避开
      src.loop = true; src.loopStart = b.duration * 0.35; src.loopEnd = b.duration * le;
      g.gain.setValueAtTime(0.9, t); g.gain.setValueAtTime(0.9, t + b.duration * 0.92); g.gain.linearRampToValueAtTime(0.7, t + b.duration * 0.92 + 0.3);   // 循环段略压低，不盖过后续技能
      g.gain.setValueAtTime(0.7, t + hold - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + hold);
      src.start(t); src.stop(t + hold + 0.05);
    } else {
      src.start(t);
      if (hold > 0.8 && hold < b.duration - 0.3 && SFX_LOOP.has(k!)) { g.gain.setValueAtTime(0.9, t + hold - 0.8); g.gain.linearRampToValueAtTime(0.0001, t + hold); src.stop(t + hold + 0.05); }   // 11-17 持续时间比样本短（如被改短）：到时长 0.8 秒淡出
    }
    return true;
  }
  /** 11-17 命中类短样本（如 h_arrow_hit 箭矢命中）：只播样本，不顶替合成施法音；样本未注册 / 未解码返回 false（调用方不补合成音） */
  hitSample(key: string, gain = 0.8, gap = 0.05): boolean {
    const c = this.ctx; if (!c) return false;
    const k = SFX_MAP[key] ?? key, b = this.sfxBuf.get(k); if (!b) return false;
    if (!this.gate('hsmp:' + k, gap)) return true;
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = c.createGain(); g.gain.value = gain; src.connect(g); g.connect(this.sfxBus); src.start(c.currentTime);
    return true;
  }
  private sustainBed(hold: number, element?: string) {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const F: Record<string, [BiquadFilterType, number]> = { frost: ['bandpass', 1800], fire: ['lowpass', 700], nature: ['bandpass', 900], arcane: ['bandpass', 2400], shadow: ['lowpass', 420], holy: ['bandpass', 3000], lightning: ['highpass', 2500], physical: ['lowpass', 500] };
    const [ft, ff] = F[element ?? ''] ?? ['bandpass', 1200];
    const t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = ft; f.frequency.value = ff; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.4); g.gain.setValueAtTime(0.12, t + hold - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + hold);
    s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + hold + 0.05);
  }
  extTone(o: { f: number; f2?: number; type?: OscillatorType; dur: number; gain: number; a?: number; d?: number; lp?: number; hp?: number; detune?: number; vib?: number; vibHz?: number }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + (o.d ?? 0), a = o.a ?? 0.005;
    const osc = c.createOscillator(); osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + a + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    let lfo: OscillatorNode | null = null;
    if (o.vib) { lfo = c.createOscillator(); lfo.frequency.value = o.vibHz ?? 6; const lg = c.createGain(); lg.gain.value = o.vib; lfo.connect(lg); lg.connect(osc.detune); lfo.start(t); lfo.stop(t + a + o.dur + 0.05); }
    const g = c.createGain(); this.env(g, t, o.gain, a, o.dur);
    let node: AudioNode = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
    node.connect(g); g.connect(this.sfxBus);
    osc.start(t); osc.stop(t + a + o.dur + 0.05);
  }
  extNoise(o: { f: number; f2?: number; type?: BiquadFilterType; q?: number; dur: number; gain: number; a?: number; d?: number }) {
    if (!this.ctx) return;
    this.noise({ ...o, t: this.ctx.currentTime + (o.d ?? 0) });
  }

  // ======================= 音效 =======================
  click() { if (!this.gate('click', 0.03)) return; this.tone({ f: 1200, f2: 900, dur: 0.05, gain: 0.15, type: 'triangle' }); }
  open() { if (!this.gate('open', 0.05)) return; this.tone({ f: 500, f2: 900, dur: 0.12, gain: 0.12, type: 'triangle' }); this.noise({ dur: 0.1, gain: 0.05, f: 3000 }); }
  close() { if (!this.gate('close', 0.05)) return; this.tone({ f: 800, f2: 450, dur: 0.1, gain: 0.12, type: 'triangle' }); }
  error() { if (!this.gate('err', 0.2)) return; this.tone({ f: 220, dur: 0.12, gain: 0.12, type: 'square', lp: 1200 }); }
  swing() { if (!this.gate('swing', 0.05)) return; this.noise({ dur: 0.16, gain: 0.25, f: 700, f2: 2600, q: 1.5 }); }
  hit(heavy = false) {
    if (!this.gate('hit', 0.04)) return;
    this.tone({ f: heavy ? 160 : 220, f2: 45, dur: heavy ? 0.22 : 0.12, gain: heavy ? 0.7 : 0.45 });
    this.noise({ dur: 0.08, gain: 0.35, type: 'lowpass', f: heavy ? 1200 : 2500 });
    this.tone({ f: 2400 + Math.random() * 600, f2: 1800, dur: 0.06, gain: 0.06, type: 'square', lp: 4000 });
  }
  element(el: string) {
    if (!this.gate('el' + el, 0.12)) return;
    const c = this.ctx!; const t = c.currentTime;
    if (el === 'fire') { this.noise({ dur: 0.35, gain: 0.3, type: 'lowpass', f: 900, f2: 300 }); for (let i = 0; i < 5; i++) this.noise({ t: t + Math.random() * 0.3, dur: 0.02, gain: 0.25, type: 'highpass', f: 3000 }); }
    else if (el === 'frost') { for (let i = 0; i < 4; i++) this.tone({ t: t + i * 0.04, f: 2000 + Math.random() * 1800, dur: 0.25, gain: 0.08, type: 'sine' }); this.noise({ dur: 0.2, gain: 0.12, type: 'highpass', f: 5000 }); }
    else if (el === 'nature') { this.tone({ f: 1800, f2: 120, dur: 0.18, gain: 0.18, type: 'sawtooth', lp: 5000 }); this.noise({ dur: 0.25, gain: 0.3, type: 'highpass', f: 2500 }); this.noise({ t: t + 0.05, dur: 0.6, gain: 0.25, type: 'lowpass', f: 300 }); }
    else if (el === 'shadow') { this.tone({ f: 110, f2: 70, dur: 0.4, gain: 0.25, type: 'sawtooth', lp: 600, detune: 15 }); }
    else if (el === 'arcane') { this.tone({ f: 900, f2: 1600, dur: 0.18, gain: 0.1, type: 'triangle' }); this.tone({ t: t + 0.03, f: 1350, f2: 2400, dur: 0.15, gain: 0.06, type: 'sine' }); }
  }
  // ---- 法师 ----
  /** 施放弹体：奥术=清脆的嗡鸣，火=呼的一声，冰=高频碎响 */
  castBolt(el: string) {
    if (!this.gate('bolt' + el, 0.06)) return;
    if (el === 'fire') { this.noise({ dur: 0.3, gain: 0.3, type: 'bandpass', f: 500, f2: 1600, q: 0.8 }); this.tone({ f: 200, f2: 420, dur: 0.2, gain: 0.08, type: 'sawtooth', lp: 1200 }); }
    else if (el === 'frost') { this.tone({ f: 1800, f2: 2600, dur: 0.15, gain: 0.07, type: 'triangle' }); this.noise({ dur: 0.18, gain: 0.12, type: 'highpass', f: 4000 }); }
    else { this.tone({ f: 600, f2: 1400, dur: 0.16, gain: 0.1, type: 'triangle' }); this.tone({ f: 1200, f2: 2000, dur: 0.12, gain: 0.05, type: 'sine', detune: 10 }); }
  }
  frostNova() {
    if (!this.gate('nova', 0.3)) return;
    const t = this.ctx!.currentTime;
    this.noise({ dur: 0.5, gain: 0.35, type: 'highpass', f: 2500, f2: 6000 });
    for (let i = 0; i < 6; i++) this.tone({ t: t + i * 0.03, f: 1500 + Math.random() * 2500, dur: 0.4, gain: 0.06, type: 'sine' });
    this.tone({ f: 140, f2: 60, dur: 0.4, gain: 0.3 });
  }
  meteor() {
    if (!this.gate('meteor', 1)) return;
    const t = this.ctx!.currentTime;
    this.noise({ dur: 0.5, gain: 0.3, type: 'bandpass', f: 300, f2: 1800, q: 0.7 });
    this.tone({ t: t + 0.45, f: 80, f2: 25, dur: 1.0, gain: 0.95 });
    this.noise({ t: t + 0.45, dur: 1.0, gain: 0.6, type: 'lowpass', f: 1500, f2: 90 });
  }
  /** 毒池 / 腐化 */
  poison() { if (!this.gate('poison', 0.3)) return; this.noise({ dur: 0.5, gain: 0.25, type: 'lowpass', f: 600, f2: 200 }); for (let i = 0; i < 4; i++) this.tone({ t: this.ctx!.currentTime + i * 0.08, f: 250 + Math.random() * 300, f2: 600, dur: 0.07, gain: 0.06 }); }
  heal() { if (!this.gate('heal', 0.3)) return; const t = this.ctx!.currentTime; [72, 76, 79].forEach((n, i) => this.tone({ t: t + i * 0.06, f: midi(n), dur: 0.4, gain: 0.07, type: 'sine' })); }
  shop() { if (!this.gate('shop', 0.1)) return; this.coin(); }
  anvil(ok: boolean) {
    if (!this.gate('anvil', 0.2)) return;
    const t = this.ctx!.currentTime;
    this.tone({ f: 1600, f2: 1500, dur: 0.5, gain: 0.15, type: 'triangle' }); this.tone({ f: 2400, dur: 0.35, gain: 0.08 }); this.noise({ dur: 0.05, gain: 0.3, type: 'highpass', f: 3000 });
    if (ok) [72, 76, 79, 84].forEach((n, i) => this.tone({ t: t + 0.2 + i * 0.07, f: midi(n), dur: 0.35, gain: 0.08, type: 'triangle' }));
    else this.tone({ t: t + 0.2, f: 200, f2: 90, dur: 0.4, gain: 0.15, type: 'sawtooth', lp: 900 });
  }
  whirl() {
    if (!this.gate('whirl', 0.2)) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) this.noise({ t: t + i * 0.13, dur: 0.16, gain: 0.3, f: 600, f2: 2200, q: 2 });
  }
  thunder() {
    if (!this.gate('thunder', 0.2)) return;
    this.tone({ f: 90, f2: 30, dur: 0.7, gain: 0.8 });
    this.noise({ dur: 0.9, gain: 0.55, type: 'lowpass', f: 900, f2: 120 });
    this.noise({ dur: 0.08, gain: 0.4, type: 'highpass', f: 2500 });
  }
  charge() {
    if (!this.gate('charge', 0.2)) return;
    this.noise({ dur: 0.22, gain: 0.35, f: 400, f2: 3000, q: 1.2 });
    this.tone({ f: 300, f2: 900, dur: 0.18, gain: 0.08, type: 'triangle' });
  }
  ultimate() {
    if (!this.gate('ult', 1)) return;
    const t = this.ctx!.currentTime;
    [57, 61, 64, 69].forEach((n, i) => this.tone({ t: t + i * 0.05, f: midi(n), f2: midi(n + 12), dur: 1.0, gain: 0.12, type: 'sawtooth', a: 0.15, lp: 2500 }));
    this.tone({ t: t + 0.35, f: 70, f2: 28, dur: 1.0, gain: 0.9 });
    this.noise({ t: t + 0.35, dur: 1.1, gain: 0.5, type: 'lowpass', f: 1200, f2: 100 });
  }
  projectile() { if (!this.gate('proj', 0.06)) return; this.noise({ dur: 0.25, gain: 0.2, f: 1500, f2: 700, q: 3 }); }
  enemyAttack(kind: string) {
    if (!this.gate('ea' + kind, 0.12)) return;
    if (kind === 'wolf') { this.tone({ f: 95, dur: 0.18, gain: 0.25, type: 'sawtooth', lp: 700 }); this.noise({ dur: 0.07, gain: 0.25, f: 1800 }); }
    else if (kind === 'spider') this.noise({ dur: 0.22, gain: 0.25, type: 'highpass', f: 4000 });
    else { this.tone({ f: 620, dur: 0.15, gain: 0.12, type: 'square', lp: 2500 }); this.tone({ f: 930, dur: 0.12, gain: 0.08, type: 'square', lp: 3000 }); this.noise({ dur: 0.1, gain: 0.2, f: 900, f2: 2400 }); }
  }
  playerHurt() { if (!this.gate('hurt', 0.15)) return; this.tone({ f: 130, f2: 60, dur: 0.15, gain: 0.45 }); this.tone({ f: 190, f2: 120, dur: 0.18, gain: 0.12, type: 'sawtooth', lp: 900 }); }
  enemyDeath(kind: string) {
    if (!this.gate('ed', 0.08)) return;
    if (kind === 'wolf') { this.tone({ f: 700, f2: 300, dur: 0.6, gain: 0.12, type: 'sawtooth', lp: 1500, a: 0.05 }); }
    else if (kind === 'spider') { this.noise({ dur: 0.35, gain: 0.25, type: 'highpass', f: 3000, f2: 1200 }); }
    else this.tone({ f: 220, f2: 70, dur: 0.6, gain: 0.18, type: 'sawtooth', lp: 800 });
  }
  wolfHowl() { if (!this.gate('howl', 6)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 420, f2: 680, dur: 0.6, gain: 0.07, type: 'triangle', a: 0.2 }); this.tone({ t: t + 0.8, f: 680, f2: 380, dur: 0.9, gain: 0.06, type: 'triangle' }); }
  bossSlam() { if (!this.gate('slam', 0.2)) return; this.tone({ f: 70, f2: 25, dur: 0.9, gain: 1 }); this.noise({ dur: 1, gain: 0.6, type: 'lowpass', f: 600, f2: 80 }); }
  bossCast() { if (!this.gate('bcast', 0.5)) return; this.tone({ f: 200, f2: 700, dur: 1.6, gain: 0.1, type: 'sawtooth', lp: 1500, a: 0.3 }); this.tone({ f: 203, f2: 706, dur: 1.6, gain: 0.08, type: 'sawtooth', lp: 1500, a: 0.3 }); }
  interrupt() {
    if (!this.gate('intr', 0.2)) return;
    [1, 2.76, 5.4, 8.9].forEach((m, i) => this.tone({ f: 520 * m, dur: 0.8 / (i + 1), gain: 0.2 / (i + 1), type: 'sine' }));
    this.noise({ dur: 0.05, gain: 0.4, f: 4000 });
  }
  telegraph() { if (!this.gate('tele', 0.4)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 330, dur: 0.12, gain: 0.12, type: 'square', lp: 1500 }); this.tone({ t: t + 0.15, f: 247, dur: 0.15, gain: 0.12, type: 'square', lp: 1500 }); }
  roar() { if (!this.gate('roar', 1)) return; this.tone({ f: 85, f2: 55, dur: 1.4, gain: 0.35, type: 'sawtooth', lp: 500, a: 0.1 }); this.noise({ dur: 1.4, gain: 0.35, f: 400, q: 3, a: 0.1 }); }
  levelUp() {
    if (!this.gate('lvl', 0.5)) return;
    const t = this.ctx!.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.tone({ t: t + i * 0.09, f: midi(n), dur: 0.5, gain: 0.18, type: 'triangle' }));
    for (let i = 0; i < 8; i++) this.tone({ t: t + 0.35 + i * 0.04, f: midi(84 + (i % 4) * 3), dur: 0.3, gain: 0.05 });
  }
  questAccept() { const t = this.ctx?.currentTime ?? 0; if (!this.gate('qa', 0.3)) return; [67, 72].forEach((n, i) => this.tone({ t: t + i * 0.1, f: midi(n), dur: 0.3, gain: 0.15, type: 'triangle' })); }
  questDone() {
    if (!this.gate('qd', 0.5)) return;
    const t = this.ctx!.currentTime;
    [[67, 0], [72, 0.12], [76, 0.24], [79, 0.36], [84, 0.5]].forEach(([n, d]) => this.tone({ t: t + d, f: midi(n), dur: 0.45, gain: 0.16, type: 'triangle' }));
    [60, 64, 67].forEach(n => this.tone({ t: t + 0.5, f: midi(n), dur: 0.9, gain: 0.08, type: 'sawtooth', lp: 1800, a: 0.05 }));
  }
  loot(quality: string) {
    if (!this.gate('loot' + quality, 0.1)) return;
    const t = this.ctx!.currentTime;
    const base = ({ white: 72, green: 74, blue: 76, purple: 79, orange: 84 } as Record<string, number>)[quality] ?? 72;
    const n = quality === 'orange' || quality === 'dark' ? 6 : quality === 'purple' ? 4 : 2;
    for (let i = 0; i < n; i++) this.tone({ t: t + i * 0.07, f: midi(base + [0, 4, 7, 12, 16, 19][i]), dur: 0.4, gain: 0.12, type: 'sine' });
    if (quality === 'orange' || quality === 'dark') this.noise({ t, dur: 1.2, gain: 0.08, type: 'highpass', f: 6000, a: 0.2 });
  }
  /** v0.9.6c 太古掉落：低沉轰鸣 + 上行和弦 + 高频金属闪光 */
  ancient() {
    if (!this.gate('ancient', 0.8)) return; const t = this.ctx!.currentTime;
    this.tone({ t, f: 55, f2: 38, dur: 1.4, gain: 0.55 }); this.noise({ t, dur: 1.2, gain: 0.3, type: 'lowpass', f: 500, f2: 90 });
    [57, 64, 69, 72, 76].forEach((n, i) => this.tone({ t: t + 0.12 + i * 0.09, f: midi(n), dur: 1.3 - i * 0.1, gain: 0.08, type: 'sawtooth', lp: 2200, a: 0.05 }));
    [88, 91, 96].forEach((n, i) => this.tone({ t: t + 0.6 + i * 0.07, f: midi(n), dur: 0.5, gain: 0.04, type: 'triangle' }));
    this.noise({ t: t + 0.55, dur: 0.6, gain: 0.08, f: 6000, q: 2 });
  }
  coin() { if (!this.gate('coin', 0.06)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 1975, dur: 0.08, gain: 0.1, type: 'square', lp: 6000 }); this.tone({ t: t + 0.07, f: 2637, dur: 0.2, gain: 0.1, type: 'square', lp: 6000 }); }
  equip() { if (!this.gate('equip', 0.1)) return; this.noise({ dur: 0.12, gain: 0.25, f: 1500, q: 0.8 }); this.tone({ f: 800, f2: 1200, dur: 0.06, gain: 0.08, type: 'square', lp: 3000 }); }
  /** 闪避翻滚：短促的风声 + 衣料摩擦 */
  roll() { if (!this.gate('roll', 0.1)) return; this.noise({ dur: 0.3, gain: 0.3, f: 500, f2: 2200, q: 1.2 }); this.noise({ dur: 0.18, gain: 0.08, type: 'lowpass', f: 400 }); }
  /** 无敌帧躲过攻击：清脆的叮声 */
  dodged() { if (!this.gate('dodged', 0.25)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 1568, dur: 0.18, gain: 0.08, type: 'sine' }); this.tone({ t: t + 0.05, f: 2349, dur: 0.25, gain: 0.06, type: 'sine' }); }
  /** 新手引导：完成一步 */
  tutStep() { if (!this.gate('tut', 0.2)) return; const t = this.ctx!.currentTime; [76, 81].forEach((n, i) => this.tone({ t: t + i * 0.08, f: midi(n), dur: 0.25, gain: 0.1, type: 'triangle' })); }
  footstep() { if (!this.gate('step', 0.2)) return; this.noise({ dur: 0.06, gain: 0.05, type: 'lowpass', f: 500 + Math.random() * 300 }); }
  portal() { if (!this.gate('portal', 0.5)) return; this.noise({ dur: 1, gain: 0.3, f: 300, f2: 3000, q: 2, a: 0.2 }); [60, 67, 72, 79].forEach((n, i) => this.tone({ t: this.ctx!.currentTime + i * 0.08, f: midi(n), dur: 0.6, gain: 0.06 })); }
  playerDeath() { if (!this.gate('pdeath', 1)) return; const t = this.ctx!.currentTime; [64, 60, 57, 52].forEach((n, i) => this.tone({ t: t + i * 0.25, f: midi(n), dur: 0.7, gain: 0.14, type: 'triangle' })); }
  victory() {
    if (!this.gate('victory', 2)) return;
    const t = this.ctx!.currentTime;
    [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [67, 0.75], [72, 0.9]].forEach(([n, d]) => this.tone({ t: t + d, f: midi(n), dur: 0.6, gain: 0.15, type: 'sawtooth', lp: 2500 }));
    [48, 55, 60, 64].forEach(n => this.tone({ t: t + 0.9, f: midi(n), dur: 1.8, gain: 0.08, type: 'sawtooth', lp: 1500, a: 0.1 }));
  }

  // ======================= 背景音乐（步进音序器） =======================
  private schedule() {
    const c = this.ctx; if (!c) return;
    while (this.nextStep < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextStep);
      const bpm = BPM[this.theme] ?? 88;
      this.nextStep += 60 / bpm / 4;   // 16 分音符
      this.step++;
    }
  }
  private playStep(s: number, t: number) {
    const bar = Math.floor(s / 16), st = s % 16;
    // 三套音乐都在跑，靠增益交叉淡入淡出；未激活的不调度节省性能
    const g = (k: Theme) => this.themeGains.get(k)!;
    const live = (k: Theme) => (this.theme === k && !this.trackOn) || g(k).gain.value > 0.01;
    if (live('camp')) this.campStep(bar, st, t, g('camp'));
    if (live('dungeon')) this.dungeonStep(bar, st, t, g('dungeon'));
    if (live('boss')) this.bossStep(bar, st, t, g('boss'));
    if (live('swamp')) this.swampStep(bar, st, t, g('swamp'));
    if (live('boss2')) this.boss2Step(bar, st, t, g('boss2'));
    if (live('field')) this.fieldStep(bar, st, t, g('field'));
    if (live('redsand')) this.redsandStep(bar, st, t, g('redsand'));
    if (live('frost')) this.frostStep(bar, st, t, g('frost'));
    if (live('ember')) this.emberStep(bar, st, t, g('ember'));
    if (live('event')) this.eventStep(bar, st, t, g('event'));
    if (live('abyss')) this.abyssStep(bar, st, t, g('abyss'));
    if (live('final')) this.finalStep(bar, st, t, g('final'));
    if (live('ending')) this.endingStep(bar, st, t, g('ending'));
    if (live('tide')) this.tideStep(bar, st, t, g('tide'));
    if (live('bell')) this.bellStep(bar, st, t, g('bell'));
    if (this.combatOn || this.combatGain.gain.value > 0.01) this.combatStep(bar, st, t, this.combatGain);
  }
  // ---- v0.8.4 新主题 ----
  /** 暗岩深渊：极低的持续音 + 远处的钟 + 心跳般的底鼓（越往下越压抑） */
  private abyssStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 60;
    if (st === 0 && bar % 2 === 0) { this.tone({ t, f: midi(29), dur: spb * 8, gain: 0.14, type: 'sawtooth', a: 2, lp: 220, out }); this.tone({ t, f: midi(36), dur: spb * 8, gain: 0.05, type: 'triangle', a: 2.5, lp: 400, detune: 8, out }); }
    if (st === 0 || st === 3) this.tone({ t, f: st ? 52 : 58, f2: 32, dur: 0.3, gain: st ? 0.2 : 0.3, out });   // 心跳
    if (st === 8 && bar % 4 === 1) { const n = [70, 73, 66][bar % 3]; this.tone({ t, f: midi(n), dur: spb * 3, gain: 0.04, type: 'sine', a: 0.003, out }); this.tone({ t, f: midi(n) * 2.76, dur: spb * 2, gain: 0.012, type: 'sine', out }); }   // 远钟（非整数泛音）
    if (st === 0 && bar % 8 === 4) this.noise({ t, dur: spb * 6, gain: 0.02, type: 'bandpass', f: 180, f2: 90, q: 2, a: 2, out });   // 地底气流
  }
  /** 暗岩之魂：首领鼓 + 低音铜管 + 合唱般的长音（小调，带半音下行） */
  private finalStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 116;
    const roots = [38, 38, 36, 37];   // D D C C#
    const r = roots[bar % 4];
    if (st % 4 === 0) this.tone({ t, f: 70, f2: 30, dur: 0.25, gain: 0.5, out });
    if (st === 4 || st === 12) this.noise({ t, dur: 0.14, gain: 0.25, type: 'bandpass', f: 1600, q: 0.8, out });
    if (st === 14 || st === 15) this.tone({ t, f: 90, f2: 40, dur: 0.12, gain: 0.3, out });
    if (st % 2 === 0) this.tone({ t, f: midi(r - 12 + (st % 8 === 6 ? 7 : 0)), dur: 0.2, gain: 0.12, type: 'sawtooth', lp: 500, out });
    if (st === 0) [r + 12, r + 15, r + 19, r + 24].forEach((n, i) => this.tone({ t, f: midi(n), dur: spb * 4, gain: 0.025, type: i % 2 ? 'triangle' : 'sawtooth', a: 0.5, lp: 1400, detune: (i - 1.5) * 6, out }));   // 合唱
    if (st === 8 && bar % 2 === 1) this.tone({ t, f: midi(r + 24 + 3), f2: midi(r + 24 - 1), dur: spb * 2, gain: 0.04, type: 'sawtooth', a: 0.2, lp: 2200, out });   // 半音下行
  }
  /** 结局：温暖的大调，钢琴般的琶音 + 弦乐长音（营地主题的变奏） */
  private endingStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 70;
    const chords = [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]];   // C Am F G
    const ch = chords[bar % 4];
    if (st === 0) { this.tone({ t, f: midi(ch[0] - 12), dur: spb * 4, gain: 0.1, type: 'sine', out }); ch.forEach(n => this.tone({ t, f: midi(n + 12), dur: spb * 4.2, gain: 0.025, type: 'triangle', a: 1, lp: 1800, out })); }
    if (st % 2 === 0) { const n = ch[[0, 1, 2, 3, 2, 1, 2, 3][st / 2]] + 24; this.tone({ t, f: midi(n), dur: 0.9, gain: 0.04, type: 'triangle', a: 0.004, lp: 3000, out }); }
    const mel = [[76, 79], [76, 72], [77, 81], [79, 74]][bar % 4];
    if (st === 0 || st === 8) this.tone({ t, f: midi(mel[st ? 1 : 0]), dur: spb * 1.8, gain: 0.045, type: 'sine', a: 0.1, out });
  }
  /** 首领转阶段：低音冲击 + 上行刺耳和弦 */
  phaseStinger() {
    if (!this.gate('phase', 1.5)) return;
    const t = this.ctx!.currentTime;
    this.tone({ t, f: 60, f2: 28, dur: 1.2, gain: 0.8 }); this.noise({ t, dur: 0.8, gain: 0.35, type: 'lowpass', f: 900, f2: 150 });
    [50, 53, 56, 59].forEach((n, i) => this.tone({ t: t + 0.05 + i * 0.06, f: midi(n), dur: 0.9, gain: 0.07, type: 'sawtooth', lp: 2400 }));
  }
  /** 时砂行者：钟表滴答 + 反向的沙流 */
  chronoTick() {
    if (!this.gate('ctick', 0.1)) return;
    const t = this.ctx!.currentTime;
    this.tone({ t, f: 3200, dur: 0.025, gain: 0.08, type: 'square', lp: 6000 }); this.tone({ t: t + 0.09, f: 2600, dur: 0.025, gain: 0.06, type: 'square', lp: 6000 });
    this.noise({ t, dur: 0.3, gain: 0.12, type: 'highpass', f: 2000, f2: 6000, a: 0.25 });   // 先弱后强 = 倒放感
  }
  /** 炼金投弹手：玻璃瓶碎 + 气泡 */
  alchemyGlass() {
    if (!this.gate('glass', 0.1)) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) this.tone({ t: t + i * 0.015, f: 3000 + Math.random() * 3000, dur: 0.12, gain: 0.05, type: 'sine' });
    this.noise({ t, dur: 0.12, gain: 0.2, type: 'highpass', f: 3500 });
    for (let i = 0; i < 3; i++) { const f = 300 + Math.random() * 300; this.tone({ t: t + 0.1 + i * 0.06, f, f2: f * 2, dur: 0.05, gain: 0.05, type: 'sine' }); }
  }
  /** 翠风原野：G 大调利底亚风，拨弦琶音 + 长笛般的旋律 + 风声和鸟鸣，比营地更开阔 */
  private fieldStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 96;
    const chords = [[43, 47, 50, 54], [45, 49, 52, 57], [40, 47, 52, 55], [48, 52, 55, 59]];   // G - A - Em - C（利底亚的升 C）
    const ch = chords[bar % 4];
    if (st === 0) { this.tone({ t, f: midi(ch[0] - 12), dur: spb * 3.6, gain: 0.13, type: 'sine', out }); ch.forEach(n => this.tone({ t, f: midi(n + 12), dur: spb * 4, gain: 0.03, type: 'triangle', a: 0.6, lp: 1600, out })); }
    if (st % 2 === 0) { const n = ch[(st / 2) % 4] + 12 + (st >= 8 ? 12 : 0); this.tone({ t, f: midi(n), dur: 0.28, gain: 0.05, type: 'triangle', lp: 2600, out }); }   // 拨弦琶音
    const mel = [74, 76, 78, 79, 81, 83, 86];
    if ((st === 0 || st === 6 || st === 10) && Math.random() < 0.75) {
      const n = mel[Math.floor(Math.random() * mel.length)];
      this.tone({ t, f: midi(n), dur: spb * 1.4, gain: 0.05, type: 'sine', a: 0.08, out });
      this.tone({ t, f: midi(n) * 2.003, dur: spb * 1.2, gain: 0.012, type: 'sine', a: 0.1, out });   // 气声泛音
    }
    if (st === 0 && bar % 4 === 0) this.noise({ t, dur: spb * 6, gain: 0.025, type: 'bandpass', f: 500, f2: 900, q: 0.6, a: 1.5, out });   // 风
    if (Math.random() < 0.02) { const f = 2400 + Math.random() * 1200; this.tone({ t, f, f2: f * 1.25, dur: 0.07, gain: 0.03, out }); this.tone({ t: t + 0.09, f: f * 1.1, f2: f * 1.4, dur: 0.06, gain: 0.025, out }); }   // 鸟鸣
  }
  /** 腐沼：低沉的持续音 + 不协和的木管感旋律 + 蛙鸣和水泡 */
  private swampStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 66;
    if (st === 0 && bar % 2 === 0) {
      this.tone({ t, f: midi(38), dur: spb * 8, gain: 0.12, type: 'triangle', a: 1.2, lp: 400, out });
      this.tone({ t, f: midi(44), dur: spb * 8, gain: 0.05, type: 'sawtooth', a: 1.5, lp: 500, detune: -12, out });   // 三全音，阴森
    }
    const scale = [62, 63, 66, 67, 70, 74];
    if (st % 4 === 0 && Math.random() < 0.35) {
      const n = scale[Math.floor(Math.random() * scale.length)];
      this.tone({ t, f: midi(n), dur: 0.9, gain: 0.05, type: 'triangle', a: 0.12, lp: 1600, out });
    }
    if (Math.random() < 0.025) { this.tone({ t, f: 180, f2: 120, dur: 0.09, gain: 0.08, type: 'square', lp: 700, out }); this.tone({ t: t + 0.12, f: 170, f2: 110, dur: 0.09, gain: 0.07, type: 'square', lp: 700, out }); }   // 蛙鸣
    if (Math.random() < 0.04) this.tone({ t, f: 300 + Math.random() * 300, f2: 900, dur: 0.08, gain: 0.05, out });   // 水泡
  }
  /** 腐根祭司：部落鼓 + 低音律动 */
  private boss2Step(bar: number, st: number, t: number, out: GainNode) {
    if (st === 0 || st === 3 || st === 8 || st === 11) this.tone({ t, f: 95, f2: 45, dur: 0.22, gain: 0.5, out });
    if (st === 6 || st === 14) { this.tone({ t, f: 240, f2: 150, dur: 0.1, gain: 0.22, type: 'triangle', out }); this.noise({ t, dur: 0.06, gain: 0.12, f: 1200, out }); }
    if (st % 2 === 1) this.noise({ t, dur: 0.025, gain: 0.04, type: 'highpass', f: 6000, out });
    const riff = [38, 38, 41, 38, 44, 43, 41, 39];
    if (st % 2 === 0) this.tone({ t, f: midi(riff[(st / 2) % 8] + (bar % 4 === 3 ? 1 : 0)), dur: 0.2, gain: 0.15, type: 'sawtooth', lp: 700, out });
    if (st === 0 && bar % 2 === 1) [62, 65, 68].forEach(n => this.tone({ t, f: midi(n), dur: 1.2, gain: 0.05, type: 'triangle', a: 0.3, lp: 2000, out }));
  }
  private campStep(bar: number, st: number, t: number, out: GainNode) {
    // D 大调：I - vi - IV - V
    const chords = [[50, 54, 57], [47, 50, 54], [43, 47, 50], [45, 49, 52]];
    const ch = chords[bar % 4];
    const spb = 60 / 88;
    if (st === 0) ch.forEach(n => this.tone({ t, f: midi(n + 12), dur: spb * 4, gain: 0.05, type: 'triangle', a: 0.4, lp: 1400, out }));
    if (st === 0 || st === 8) this.tone({ t, f: midi(ch[0] - 12), dur: spb * 1.6, gain: 0.16, type: 'sine', out });
    const pent = [62, 64, 66, 69, 71, 74, 76, 78];
    if (st % 2 === 0 && Math.random() < 0.7) {
      const n = st % 4 === 0 ? ch[(st / 4) % 3] + 24 : pent[Math.floor(Math.random() * pent.length)];
      this.tone({ t, f: midi(n), dur: 0.35, gain: 0.07, type: 'sine', out });
      this.tone({ t: t + 0.33, f: midi(n), dur: 0.3, gain: 0.025, type: 'sine', out });   // 回声
    }
    if (st % 4 === 2) this.noise({ t, dur: 0.04, gain: 0.03, type: 'highpass', f: 7000, out });
  }
  private dungeonStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 72;
    if (st === 0 && bar % 2 === 0) {
      this.tone({ t, f: midi(33), dur: spb * 8, gain: 0.14, type: 'sawtooth', a: 1, lp: 260, out });
      this.tone({ t, f: midi(40), dur: spb * 8, gain: 0.07, type: 'sawtooth', a: 1, lp: 300, detune: 8, out });
    }
    if (st === 0) this.tone({ t, f: 60, f2: 35, dur: 0.5, gain: 0.25, out });
    if (st === 10 && bar % 2 === 1) this.tone({ t, f: 55, f2: 35, dur: 0.4, gain: 0.15, out });
    const minor = [69, 72, 74, 76, 79, 81];
    if (Math.random() < 0.09) {
      const n = minor[Math.floor(Math.random() * minor.length)];
      [1, 2.01, 3.03].forEach((m, i) => this.tone({ t, f: midi(n) * m, dur: 1.4 / (i + 1), gain: 0.05 / (i + 1), out }));
    }
    if (Math.random() < 0.03) this.tone({ t, f: 1800 + Math.random() * 800, f2: 900, dur: 0.12, gain: 0.04, out });   // 滴水
  }
  private bossStep(bar: number, st: number, t: number, out: GainNode) {
    if (st === 0 || st === 6 || st === 8 || (st === 14 && bar % 2)) this.tone({ t, f: 120, f2: 40, dur: 0.18, gain: 0.5, out });
    if (st === 4 || st === 12) { this.noise({ t, dur: 0.14, gain: 0.3, f: 1800, q: 0.7, out }); this.tone({ t, f: 200, f2: 120, dur: 0.08, gain: 0.15, type: 'triangle', out }); }
    if (st % 2 === 1) this.noise({ t, dur: 0.03, gain: 0.05, type: 'highpass', f: 8000, out });
    const riff = [45, 45, 48, 45, 43, 45, 46, 45];
    if (st % 2 === 0) this.tone({ t, f: midi(riff[(st / 2) % 8] - 12 + (bar % 4 === 3 ? 3 : 0)), dur: 0.16, gain: 0.16, type: 'sawtooth', lp: 900, out });
    if (st === 0 && bar % 2 === 0) [57, 60, 64].forEach(n => this.tone({ t, f: midi(n + (bar % 4 === 2 ? -2 : 0)), dur: 0.9, gain: 0.07, type: 'sawtooth', lp: 1800, a: 0.02, out }));
    if (st === 0 && bar % 4 === 3) this.tone({ t, f: 300, f2: 1200, dur: 1.6, gain: 0.04, type: 'sawtooth', lp: 3000, a: 0.8, out });
  }
  // ======================= 阶段四：三张新地图的音乐 + 战斗层 + 世界事件 =======================
  /** 赤砂裂谷：D 弗里吉亚属音阶（沙漠感），手鼓 + 拨弦 + 长音笛，环境音是风沙 */
  private redsandStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 100;
    const root = [50, 50, 48, 51][bar % 4];
    if (st === 0) { this.tone({ t, f: midi(root - 12), dur: spb * 3.8, gain: 0.12, type: 'triangle', lp: 500, out }); this.tone({ t, f: midi(root + 7), dur: spb * 4, gain: 0.025, type: 'sawtooth', a: 0.8, lp: 1200, out }); }
    if (st === 0 || st === 7 || st === 10) this.tone({ t, f: 140, f2: 70, dur: 0.12, gain: 0.18, out });                // 低音手鼓
    if (st === 4 || st === 12 || st === 14) this.noise({ t, dur: 0.05, gain: 0.07, f: 2200, q: 1.5, out });           // 高音手鼓
    const scale = [62, 63, 66, 67, 69, 70, 72, 74];                                                                     // 弗里吉亚属：降 2、升 3
    if (st % 2 === 0 && Math.random() < 0.55) this.tone({ t, f: midi(scale[Math.floor(Math.random() * scale.length)]), dur: 0.22, gain: 0.05, type: 'triangle', lp: 2400, out });
    if ((st === 0 || st === 8) && bar % 2 === 1 && Math.random() < 0.7) { const n = scale[Math.floor(Math.random() * 5) + 3] + 12; this.tone({ t, f: midi(n), dur: spb * 1.8, gain: 0.04, type: 'sine', a: 0.15, out }); this.tone({ t: t + spb * 0.6, f: midi(n - 1), dur: spb * 1.2, gain: 0.03, type: 'sine', out }); }
    if (st === 0 && bar % 4 === 0) this.noise({ t, dur: spb * 8, gain: 0.05, type: 'bandpass', f: 300, f2: 700, q: 0.4, a: 2, out: this.ambBus });   // 风沙
  }
  /** 霜脊高地：E 小调，慢速、空旷，钟琴般的高音 + 冰裂声，环境音是呼啸的雪风 */
  private frostStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 76;
    const chords = [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 50, 54]];
    const ch = chords[bar % 4];
    if (st === 0) { ch.forEach(n => this.tone({ t, f: midi(n), dur: spb * 4.2, gain: 0.035, type: 'triangle', a: 1, lp: 1100, out })); this.tone({ t, f: midi(ch[0] - 24), dur: spb * 4, gain: 0.12, type: 'sine', a: 0.4, out }); }
    if (st % 4 === 0 && Math.random() < 0.6) { const n = ch[Math.floor(Math.random() * 3)] + 24 + (Math.random() < 0.3 ? 12 : 0); [1, 2.76, 5.4].forEach((m, i) => this.tone({ t, f: midi(n) * m, dur: 1.6 / (i + 1), gain: 0.04 / (i + 1), out })); }
    if (Math.random() < 0.01) this.noise({ t, dur: 0.08, gain: 0.05, type: 'highpass', f: 4000, out: this.ambBus });                       // 冰裂
    if (st === 0 && bar % 2 === 0) this.noise({ t, dur: spb * 8, gain: 0.06, type: 'bandpass', f: 900, f2: 500, q: 0.8, a: 2.5, out: this.ambBus });   // 雪风
  }
  /** v1.2.9 海潮：D 多利亚，长弦铺底 + 远处浮钟（钟的非整数泛音），环境音是一呼一吸的浪 */
  private tideStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 70;
    const chords = [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]];
    const ch = chords[bar % 4];
    if (st === 0) { ch.forEach((n, i) => this.tone({ t: t + i * 0.05, f: midi(n), dur: spb * 4.4, gain: 0.03, type: 'triangle', a: 1.4, lp: 900, out })); this.tone({ t, f: midi(ch[0] - 12), dur: spb * 4, gain: 0.11, type: 'sine', a: 0.8, out }); }
    if (st === 8 && bar % 2 === 1) { const n = ch[2] + 12; [1, 2.0, 2.76, 5.4].forEach((m, i) => this.tone({ t, f: midi(n) * m, dur: 3.2 / (i + 1), gain: 0.05 / (i + 1), out })); }   // 远处浮钟
    if (st % 2 === 0 && Math.random() < 0.18) this.tone({ t, f: midi(ch[Math.floor(Math.random() * 4)] + 24), dur: 0.9, gain: 0.025, type: 'sine', a: 0.05, out });
    if (st === 0 && bar % 2 === 0) this.noise({ t, dur: spb * 3.5, gain: 0.09, type: 'lowpass', f: 700, f2: 260, q: 0.6, a: 1.8, out: this.ambBus });   // 浪涌
    if (st === 8 && bar % 2 === 0) this.noise({ t, dur: spb * 2.5, gain: 0.05, type: 'highpass', f: 2600, a: 0.4, out: this.ambBus });                     // 浪花
  }
  /** v1.2.9 钟楼：降 E 小调，很慢；每小节一记大钟（低沉的 5 个泛音），中间是低音人声般的方波长音 */
  private bellStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 56;
    const roots = [39, 39, 37, 34];
    const r0 = roots[bar % 4];
    if (st === 0) { [1, 2.0, 2.4, 3.0, 4.2].forEach((m, i) => this.tone({ t, f: midi(r0 + 12) * m, dur: 5 / (i * 0.5 + 1), gain: 0.07 / (i + 1), out })); this.tone({ t, f: midi(r0 - 12), dur: spb * 4, gain: 0.1, type: 'sine', a: 0.6, out }); }
    if (st === 0 || st === 8) this.tone({ t, f: midi(r0 + (st ? 7 : 3)), dur: spb * 2.2, gain: 0.03, type: 'square', a: 0.9, lp: 700, out });   // 低吟
    if (st === 12 && bar % 4 === 3) [1, 2.76].forEach((m, i) => this.tone({ t, f: midi(r0 + 31) * m, dur: 1.4, gain: 0.03 / (i + 1), out }));   // 小钟
    if (Math.random() < 0.006) this.noise({ t, dur: 0.25, gain: 0.04, type: 'bandpass', f: 1600, q: 3, out: this.ambBus });                   // 铜链轻响
    if (st === 0 && bar % 2 === 0) this.noise({ t, dur: spb * 8, gain: 0.04, type: 'bandpass', f: 420, f2: 300, q: 0.7, a: 3, out: this.ambBus });   // 塔里的风
  }
  /** 烬落荒原：C 小调 + 三全音，低沉的铜管长音和战鼓，环境音是熔岩翻涌 */
  private emberStep(bar: number, st: number, t: number, out: GainNode) {
    const spb = 60 / 84;
    const roots = [36, 36, 39, 42];
    const r0 = roots[bar % 4];
    if (st === 0) { this.tone({ t, f: midi(r0), dur: spb * 4, gain: 0.14, type: 'sawtooth', a: 0.6, lp: 350, out }); this.tone({ t, f: midi(r0 + 7), dur: spb * 4, gain: 0.05, type: 'sawtooth', a: 0.8, lp: 600, detune: 6, out }); }
    if (st === 0 || st === 10) this.tone({ t, f: 80, f2: 38, dur: 0.4, gain: 0.3, out });
    if (st === 0 && bar % 2 === 1) [60, 63, 66].forEach((n, i) => this.tone({ t: t + i * 0.02, f: midi(n), dur: spb * 3, gain: 0.04, type: 'sawtooth', a: 0.5, lp: 1300, out }));   // 铜管减三和弦
    if (st % 4 === 2 && Math.random() < 0.35) this.tone({ t, f: midi([72, 75, 78, 79][Math.floor(Math.random() * 4)]), dur: 0.8, gain: 0.035, type: 'triangle', a: 0.1, lp: 1800, out });
    if (Math.random() < 0.05) this.noise({ t, dur: 0.4 + Math.random() * 0.4, gain: 0.05, type: 'lowpass', f: 250, f2: 120, out: this.ambBus });   // 熔岩咕嘟
    if (Math.random() < 0.012) this.tone({ t, f: 90, f2: 40, dur: 0.6, gain: 0.08, out: this.ambBus });                                          // 远处地鸣
  }
  /** 世界事件：快速战鼓 + 号角 */
  private eventStep(bar: number, st: number, t: number, out: GainNode) {
    if (st % 4 === 0 || st === 14) this.tone({ t, f: 110, f2: 45, dur: 0.18, gain: 0.45, out });
    if (st === 4 || st === 12) { this.noise({ t, dur: 0.12, gain: 0.25, f: 1600, q: 0.8, out }); }
    if (st % 2 === 1) this.noise({ t, dur: 0.03, gain: 0.05, type: 'highpass', f: 7000, out });
    if (st === 0 && bar % 2 === 0) [55, 60, 63].forEach(n => this.tone({ t, f: midi(n), dur: 0.7, gain: 0.07, type: 'sawtooth', lp: 1600, a: 0.04, out }));
    const riff = [43, 43, 46, 43, 48, 46, 43, 42];
    if (st % 2 === 0) this.tone({ t, f: midi(riff[(st / 2) % 8] - 12), dur: 0.15, gain: 0.14, type: 'sawtooth', lp: 800, out });
  }
  /** 战斗层：所有野外地图通用的鼓点 + 低音脉冲（跟随当前速度） */
  private combatStep(_bar: number, st: number, t: number, out: GainNode) {
    if (st === 0 || st === 8 || st === 11) this.tone({ t, f: 100, f2: 42, dur: 0.16, gain: 0.32, out });
    if (st === 4 || st === 12) this.noise({ t, dur: 0.1, gain: 0.16, f: 1800, q: 0.7, out });
    if (st % 2 === 1) this.noise({ t, dur: 0.02, gain: 0.03, type: 'highpass', f: 8000, out });
    if (st % 4 === 2) this.tone({ t, f: 55, dur: 0.12, gain: 0.1, type: 'sawtooth', lp: 300, out });
  }

  // ======================= 阶段四：技能音效按冷却分档 + 暴击 / 格挡 / 吸收 / 回程 =======================
  /**
   * 叠在技能原有音效上的一层：tier 0 普攻/无冷却（不加）；1 短冷却（加一层质感：低频冲击 + 金属泛音）；
   * 2 长冷却 / 大招（蓄力上扬 → 爆发 → 余韵 + 低频冲击）
   */
  skillLayer(tier: 0 | 1 | 2, el: string) {
    if (!this.ctx || tier === 0 || !this.gate('skl' + tier, 0.08)) return;
    const t = this.ctx.currentTime;
    // 同一技能连续释放：音高随机浮动 ±4%，避免听腻
    const bright = (el === 'fire' ? 1800 : el === 'frost' ? 3200 : el === 'arcane' ? 2600 : el === 'shadow' ? 900 : 1400) * (0.96 + Math.random() * 0.08);
    if (tier === 1) {
      this.tone({ t, f: 140, f2: 60, dur: 0.18, gain: 0.35 });
      this.noise({ t, dur: 0.18, gain: 0.12, f: bright, f2: bright * 0.5, q: 2 });
      this.tone({ t: t + 0.02, f: bright * 1.5, f2: bright, dur: 0.25, gain: 0.03, type: 'triangle' });
      return;
    }
    this.noise({ t, dur: 0.35, gain: 0.12, f: 300, f2: bright * 2, q: 3, a: 0.25 });                          // 蓄力
    this.tone({ t, f: 120, f2: 480, dur: 0.35, gain: 0.05, type: 'sawtooth', lp: 1800, a: 0.25 });
    this.tone({ t: t + 0.32, f: 90, f2: 28, dur: 0.9, gain: 0.7 });                                              // 低频冲击
    this.noise({ t: t + 0.32, dur: 0.7, gain: 0.35, type: 'lowpass', f: 1800, f2: 120 });                        // 爆发
    [0, 4, 7, 12].forEach((n, i) => this.tone({ t: t + 0.36 + i * 0.03, f: bright / 4 * Math.pow(2, n / 12), dur: 1.4, gain: 0.025, type: 'triangle', lp: 2400 }));   // 余韵
  }
  crit() { if (!this.gate('crit', 0.08)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 2400, f2: 1600, dur: 0.12, gain: 0.08, type: 'square', lp: 5000 }); this.noise({ t, dur: 0.1, gain: 0.18, f: 4000, q: 2 }); this.tone({ t, f: 180, f2: 70, dur: 0.12, gain: 0.25 }); }
  block() { if (!this.gate('block', 0.12)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 900, f2: 700, dur: 0.25, gain: 0.08, type: 'triangle' }); this.tone({ t, f: 1350, f2: 1100, dur: 0.3, gain: 0.05, type: 'triangle' }); this.noise({ t, dur: 0.06, gain: 0.15, f: 2500, q: 1 }); }
  absorb() { if (!this.gate('absorb', 0.15)) return; const t = this.ctx!.currentTime; this.tone({ t, f: 600, f2: 1200, dur: 0.25, gain: 0.05, type: 'sine' }); this.tone({ t, f: 900, f2: 1800, dur: 0.25, gain: 0.03, type: 'sine' }); }
  recallStart() { if (!this.gate('recall', 0.5)) return; const t = this.ctx!.currentTime;
    const rb = this.sfxBuf.get('u_recall'); if (rb) { const src = this.ctx!.createBufferSource(), g = this.ctx!.createGain(); src.buffer = rb; g.gain.value = 0.8; src.connect(g); g.connect(this.sfxBus); src.start(t); return; }   // 11-08 回程 3 秒读条音（钟铃上行 + 结尾传送），没解码好时用旧合成音
    this.noise({ t, dur: 3, gain: 0.08, f: 400, f2: 2400, q: 4, a: 1 }); [72, 76, 79, 84].forEach((n, i) => this.tone({ t: t + i * 0.7, f: midi(n), dur: 0.9, gain: 0.04, type: 'sine', a: 0.2 })); }

}


// ======================= 11-18 本体地图专属曲目 =======================
/**
 * 11-18（Rhett 01:38「用 suno 补齐剩下没有音乐的地图」）：本体每张地图一首（assets_aholo/audio/music/，Suno chirp-v6）。
 * 选曲顺序：内容包 → 首领战 boss_battle → 本体区域曲目（本表）→ null（程序化）。key = 副本 / 长副本 id（map），否则区域 id（zone）。
 * ?off=basemusic 或 localStorage darkrock_cine_off 含 basemusic → 关掉，恢复原样程序化音乐。
 */
const BASE_TRACKS: Record<string, string> = {
  world: 'camp_greystone', field: 'field_greenwind',
  star: 'wild_star', redsand: 'wild_redsand', frost: 'wild_frost', ember: 'wild_ember', foothill: 'wild_foothill', marsh: 'wild_marsh',
  darkrock_mine: 'dg_darkrock', rotting_temple: 'dg_rotting', sand_tomb: 'dg_sand_tomb', troll_cave: 'dg_troll_cave', ash_forge: 'dg_ash_forge',
  molten_throne: 'raid_molten', frost_crypt: 'raid_frost', abyss: 'raid_abyss',
};
function baseTrackFor(t: Theme, zone: string, map?: string): string | null {
  if (t === 'event' && zone !== 'raid' && zone !== 'dungeon') return 'world_event';   // 野外世界事件（非首领）
  return BASE_TRACKS[map || zone] ?? null;
}
let baseMusicOff: boolean | null = null;
function baseMusicOn(): boolean {
  if (baseMusicOff === null) {
    baseMusicOff = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      baseMusicOff = `${q},${ls}`.split(',').some(n => n.trim() === 'basemusic');
    } catch { baseMusicOff = false; }
  }
  return !baseMusicOff;
}

// ======================= v1.2.48 曲目播放器 =======================
/**
 * 背景曲目：每首一个 HTMLAudioElement（循环、按需加载，只有第一次要播时才请求文件），切换时交叉淡入淡出（约 2 秒）。
 * 用 HTMLAudioElement 而不是 WebAudio 解码：离线 file:// 页面也能播同目录下的 music/*.mp3（fetch 不行），整首也不用解码进内存。
 * 曲目来源：本体通用曲目 = assets.gen.ts 的 MUSIC_TRACKS（比赛版构建才有，文件在页面旁的 music/ 目录），内容包 = PackAudio.tracks。
 * 文件不存在 / 解码失败 → 记为坏曲目，回调 onFail（GameAudio 改回程序化音乐）。
 */
export class TrackPlayer {
  gestured = false;
  private srcs: Record<string, string> | null = null;
  private els = new Map<string, HTMLAudioElement>();
  private lvl = new Map<string, number>();
  private bad = new Set<string>();
  private cur: string | null = null;
  private timer: number | null = null;
  private g = 0;   // 当前总音量（ducking 时向 vol() 渐变）
  constructor(private vol: () => number, private onFail: (name: string) => void) {}
  private list() {
    if (!this.srcs) {
      this.srcs = {};
      for (const n of MUSIC_TRACKS) this.srcs[n] = `music/${n}.mp3`;
      try { Object.assign(this.srcs, packTracks()); } catch { /* 包出错不影响本体 */ }
    }
    return this.srcs;
  }
  /** 曲目可用（登记了且没加载失败过） */
  has(name: string) { return typeof Audio !== 'undefined' && !!this.list()[name] && !this.bad.has(name); }
  get current() { return this.cur; }
  names() { return Object.keys(this.list()); }
  private el(name: string) {
    let a = this.els.get(name);
    if (!a) {
      a = new Audio(); a.loop = true; a.preload = 'auto'; a.volume = 0;
      a.addEventListener('error', () => {
        this.bad.add(name); this.els.delete(name); this.lvl.delete(name);
        if (this.cur === name) { this.cur = null; this.onFail(name); }
      });
      a.src = this.list()[name];
      this.els.set(name, a); this.lvl.set(name, 0);
    }
    return a;
  }
  /** 切到曲目（null = 全部淡出） */
  play(name: string | null) {
    if (name === this.cur) return;
    this.cur = name;
    if (name && this.gestured && this.has(name)) {
      const a = this.el(name);
      if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => { /* 自动播放限制：下次交互时 GameAudio.unlock 会重新选曲 */ }); }
    }
    this.kick();
  }
  /** 设置变化：立即生效 */
  applyVolume() { this.g = this.vol(); this.write(); }
  private write() { this.els.forEach((a, n) => { a.volume = Math.max(0, Math.min(1, this.g * (this.lvl.get(n) ?? 0))); }); }
  private fadeSec = 0.5;
  /** ducking：音量在 sec 秒内渐变到新的 vol() */
  fadeVolume(sec: number) { this.fadeSec = Math.max(0.05, sec); this.kick(); }
  private kick() {
    if (this.timer !== null || typeof window === 'undefined') return;
    let last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
      let busy = false;
      this.els.forEach((a, n) => {
        const want = n === this.cur ? 1 : 0, l0 = this.lvl.get(n) ?? 0;
        const l = want > l0 ? Math.min(want, l0 + dt / 2) : Math.max(want, l0 - dt / 1.6);   // 淡入 2 秒、淡出 1.6 秒
        this.lvl.set(n, l);
        if (l !== want) busy = true;
        if (l <= 0 && want === 0 && !a.paused) { a.pause(); try { a.currentTime = 0; } catch { /* 未加载 */ } }
      });
      const tv = this.vol(), step = dt / this.fadeSec;
      this.g = tv > this.g ? Math.min(tv, this.g + step * 0.7) : Math.max(tv, this.g - step * 0.7);
      if (Math.abs(this.g - tv) > 0.002) busy = true;
      this.write();
      if (!busy) { window.clearInterval(this.timer!); this.timer = null; }
    }, 50);
  }
  /** 测试用：各曲目状态 */
  state() { const o: Record<string, { lvl: number; paused: boolean; vol: number }> = {}; this.els.forEach((a, n) => { o[n] = { lvl: +(this.lvl.get(n) ?? 0).toFixed(2), paused: a.paused, vol: +a.volume.toFixed(3) }; }); return { cur: this.cur, bad: [...this.bad], tracks: o }; }
}
