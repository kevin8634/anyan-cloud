// 11-18 环境音接入（Rhett 11-18 10:14「合进游戏」）。素材：assets_aholo/audio/amb/amb_*.ogg（MiniMax-H3 文生视频抽音轨，-24 LUFS，约 5 s 无缝循环，
//   登记见 assets_aholo/README.md）；gen-assets 内联成 AMB_SRC（data URI），这里按当前地图用到的才解码（懒加载），base 包为空表 → 不播。
// 播法：环境音总线 ambBus 上（设置里「环境音量」滑杆管它）；有 day / night 两条的随游戏昼夜交叉淡化约 3 s，只有一条的全天用；下雨叠 amb_rain。
//   循环只有约 5 s：同一条开两路、错开半个循环、起点随机，两路各自音量每 4–8 s 慢速随机起伏，听不出整齐的重复。
//   狼嚎 amb_forest_night_howl 只在森林夜间，每 90–180 s 随机一次，随机声像与音量。
//   原有程序化风沙 / 雪风 / 浪涌（audio.ts schedule）保留；本层总音量压在音乐与技能音之下。
// ?off=ambsfx（或 localStorage darkrock_cine_off 含 ambsfx）关掉，回原样。
import type { GameAudio } from './audio';
import { AMB_SRC } from './assets.gen';
import { packAmbFor, packRain } from './amb_registry';

export const AMB_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('ambsfx'); } catch { return false; } })();

/** 区域 / 副本 id → 环境音底名（key 与 audio.ts BASE_TRACKS 相同：副本 / 长副本用 map，否则 zone） */
const BASE_AMB: Record<string, string> = {
  world: 'camp', field: 'forest', star: 'plateau', foothill: 'foothill', marsh: 'swamp', redsand: 'rift', frost: 'frost', ember: 'ember',
  darkrock_mine: 'mine', rotting_temple: 'temple', sand_tomb: 'temple', troll_cave: 'icecave', frost_crypt: 'icecave',
  ash_forge: 'foundry', molten_throne: 'foundry', abyss: 'abyss',
};
const LEVEL = 0.55;        // 底层每条的目标音量（两路各 ×0.35–0.65 起伏）；ambBus 默认 0.56，素材 -24 LUFS，音乐 -16 LUFS → 实际比音乐低约 12 dB
const RAIN_LEVEL = 0.6;    // 雨层（× 下雨强度）
const XFADE = 3;           // 昼夜 / 换图交叉淡化（秒）

type Layer = { name: string; gain: GainNode; srcs: AudioBufferSourceNode[]; mods: GainNode[]; nextMod: number; level: number; stopAt: number };
const bufs = new Map<string, Promise<AudioBuffer | null>>();
const layers = new Map<string, Layer>();
let howlT = -1;
let lastKey = '';

function load(ctx: AudioContext, name: string): Promise<AudioBuffer | null> {
  let p = bufs.get(name);
  if (!p) {
    const src = (AMB_SRC as Record<string, string>)[name];
    p = !src ? Promise.resolve(null) : fetch(src).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).catch(e => { console.warn('环境音解码失败', name, e); return null; });
    bufs.set(name, p);
  }
  return p;
}
const has = (n: string) => !!(AMB_SRC as Record<string, string>)[n];
/** 当前该放的底层：amb_<底名>_day / _night（有昼夜两条时）或 amb_<底名> */
function bedFor(base: string, night: boolean): string | null {
  const dn = `amb_${base}_${night ? 'night' : 'day'}`;
  if (has(`amb_${base}_day`) && has(`amb_${base}_night`)) return dn;
  if (has(`amb_${base}`)) return `amb_${base}`;
  return has(dn) ? dn : null;
}

function startLayer(ctx: AudioContext, out: AudioNode, name: string, level: number) {
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(out);
  const L: Layer = { name, gain, srcs: [], mods: [], nextMod: 0, level, stopAt: 0 };
  layers.set(name, L);
  void load(ctx, name).then(buf => {
    if (!buf || layers.get(name) !== L || L.stopAt) return;
    const now = ctx.currentTime, d = buf.duration, o = Math.random() * d;
    for (const off of [o, (o + d / 2) % d]) {   // 两路错开半个循环、起点随机
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const m = ctx.createGain(); m.gain.value = 0.5; s.connect(m); m.connect(gain);
      s.start(now, off); L.srcs.push(s); L.mods.push(m);
    }
    L.nextMod = now + 2;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(L.level, now + XFADE);
  });
}
function stopLayer(ctx: AudioContext, L: Layer) {
  if (L.stopAt) return;
  const now = ctx.currentTime; L.stopAt = now + XFADE + 0.1;
  L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(L.gain.gain.value, now); L.gain.gain.linearRampToValueAtTime(0, now + XFADE);
}
function setLevel(ctx: AudioContext, L: Layer, level: number) {
  if (Math.abs(level - L.level) < 0.03 || !L.srcs.length) { L.level = L.srcs.length ? L.level : level; return; }
  L.level = level; const now = ctx.currentTime;
  L.gain.gain.cancelScheduledValues(now); L.gain.gain.setValueAtTime(L.gain.gain.value, now); L.gain.gain.linearRampToValueAtTime(level, now + 1.5);
}
function howl(ctx: AudioContext, out: AudioNode) {
  void load(ctx, 'amb_forest_night_howl').then(buf => {
    if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.25 + Math.random() * 0.35;
    const p = ctx.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * 0.85;
    s.connect(g); g.connect(p); p.connect(out); s.start();
    s.onended = () => { try { s.disconnect(); g.disconnect(); p.disconnect(); } catch { /* 已断开 */ } };
  });
}

/** 每帧调用（main.ts）：key = 当前区域 / 副本 id（与选曲同一个），night = 是否夜间 */
export function ambTick(audio: GameAudio, dt: number, key: string, night: boolean) {
  if (AMB_OFF) return;
  const o = audio.ambientOut(); if (!o) return;
  const { ctx, out } = o, now = ctx.currentTime;
  const base = BASE_AMB[key] ?? packAmbFor(key);
  const want = new Map<string, number>();
  const bed = base ? bedFor(base, night) : null;
  if (bed) want.set(bed, LEVEL);
  const rain = packRain();
  if (rain > 0.02 && has('amb_rain')) want.set('amb_rain', RAIN_LEVEL * rain);
  for (const [n, lv] of want) { const L = layers.get(n); if (!L || L.stopAt) { if (L) layers.delete(n); startLayer(ctx, out, n, lv); } else setLevel(ctx, L, lv); }
  for (const L of [...layers.values()]) {
    if (!want.has(L.name)) stopLayer(ctx, L);
    if (L.stopAt && now >= L.stopAt) { for (const s of L.srcs) { try { s.stop(); s.disconnect(); } catch { /* 已停 */ } } L.gain.disconnect(); if (layers.get(L.name) === L) layers.delete(L.name); continue; }
    if (!L.stopAt && L.srcs.length && now >= L.nextMod) {   // 两路音量各自慢速随机起伏
      for (const m of L.mods) { m.gain.cancelScheduledValues(now); m.gain.setValueAtTime(m.gain.value, now); m.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.3, now + 4 + Math.random() * 4); }
      L.nextMod = now + 4 + Math.random() * 4;
    }
  }
  // 狼嚎：森林夜间，每 90–180 s 随机一次
  if (base === 'forest' && night && has('amb_forest_night_howl')) {
    if (howlT < 0 || key !== lastKey) howlT = 90 + Math.random() * 90;
    howlT -= dt; if (howlT <= 0) { howl(ctx, out); howlT = 90 + Math.random() * 90; }
  } else howlT = -1;
  lastKey = key;
}
/** 调试：当前在放的层与已解码的条目 */
export function ambDebug() { return { off: AMB_OFF, files: Object.keys(AMB_SRC as Record<string, string>).length, layers: [...layers.values()].map(L => ({ name: L.name, level: +L.level.toFixed(2), playing: L.srcs.length > 0, stopping: !!L.stopAt })), decoded: [...bufs.keys()], howlIn: +howlT.toFixed(1) }; }
