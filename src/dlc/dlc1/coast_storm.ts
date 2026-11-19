// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 风暴调度（B 区 风暴锈锚码头）
//   玩家进入东岸 → 风暴权重平滑升到 1（时间常数约 3 秒，整体 6–8 秒过渡）；离开平滑回落
//   风暴 ≥ 0.4：随机 3–10 秒一道闪电（远处东边天空 → 海面折线 + 2–3 次闪光脉冲），雷声按距离延迟（≤ 0.6 秒）与闪光同步
//   风：0.15 → 1（加阵风），雨：风暴 0.25 起淡入；灯塔光束在风暴里更亮
//   潮渊钟井：fix1107 起井口为正式入口（门在 raid_well.ts wellMountGate），靠近提示「乘升降笼下井」
// ======================================================================
import * as THREE from 'three';
import { stormW, zoneAt, WELL, WELL_HINT_R, SEA_Y } from './coast_layout';
import { strikeBolt, boltOff, skyU } from './coast_sky';
import { registerAmbRain } from '../../web/amb_registry';   // 11-18 环境音：风暴下雨叠 amb_rain（?off=ambsfx）

export const stormRT = {
  target: 0, storm: 0, flash: 0, wind: 0.15, rain: 0, T: 0,
  nextBolt: 2.5, boltOffAt: -1, pulses: [] as [number, number][],
  bolts: 0, lastBoltAt: -1, lastThunderAt: -1, lastThunderDelay: 0, lastBoltDist: 0,
  wellNear: false, wellHints: 0, forced: null as number | null,
};
/** 雷声回调（音效模块注册）：delay 秒后响，k = 强度 0..1，dist 米 */
let onThunder: ((delay: number, k: number, dist: number) => void) | null = null;
registerAmbRain(() => stormRT.rain);   // 11-18 雨层强度 = 风暴雨量（离开海岸 stormLeave 归 0）
export const setThunderSink = (f: typeof onThunder) => { onThunder = f; };

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let hintEl: HTMLDivElement | null = null;
function hint(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on && !hintEl) {
    hintEl = document.createElement('div'); hintEl.id = 'd1-coast-hint';
    hintEl.style.cssText = 'position:fixed;left:50%;bottom:168px;transform:translateX(-50%);z-index:30;pointer-events:none;padding:7px 16px;border-radius:6px;background:rgba(8,16,20,.78);border:1px solid rgba(90,230,220,.45);color:#9ff0e8;font:600 15px/1.3 system-ui,sans-serif;letter-spacing:.06em;text-shadow:0 1px 2px #000;transition:opacity .35s';
    hintEl.innerHTML = '潮渊钟井 · 海岸井口<div style="font:400 12px/1.4 system-ui,sans-serif;color:#7fb8b4;letter-spacing:0">井下传来钟声……走到栈桥尽头，乘升降笼下井</div>';   // fix1107 BUG#1 入口开放
    document.body.appendChild(hintEl);
  }
  if (hintEl) hintEl.style.opacity = on ? '1' : '0';
}

/** 立刻打一道闪电（调试 / 截图），dir = 世界水平方向角（默认东） */
export function strikeNow(cam: THREE.Vector3, O: { x: number; z: number }, ang?: number) {
  const S = stormRT, a = ang ?? (-0.7 + Math.random() * 1.4), dist = 110 + Math.random() * 110;
  const dx = Math.cos(a), dz = Math.sin(a);
  const to = new THREE.Vector3(cam.x + dx * dist, SEA_Y, cam.z + dz * dist), from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 95 + Math.random() * 25, (Math.random() - 0.5) * 30));
  strikeBolt(from, to, cam);
  skyU.uFlashDir.value.set(dx, 0.35, dz).normalize();
  const t = S.T; S.pulses = [[t, 1], [t + 0.08 + Math.random() * 0.05, 0.55 + Math.random() * 0.4], ...(Math.random() < 0.6 ? [[t + 0.22 + Math.random() * 0.1, 0.4] as [number, number]] : [])];
  S.boltOffAt = t + 0.32; S.bolts++; S.lastBoltAt = t; S.lastBoltDist = dist;
  const delay = Math.min(0.6, dist / 343 * 0.9); S.lastThunderDelay = delay; S.lastThunderAt = t + delay;
  onThunder?.(delay, Math.min(1, 0.55 + S.storm * 0.45) * (1.25 - dist / 400), dist);
  void O;
}

/** 每帧：lx / lz = 玩家局部坐标；返回风暴状态 */
export function stormUpdate(dt: number, lx: number, lz: number, cam: THREE.Vector3, O: { x: number; z: number }) {
  const S = stormRT; S.T += dt;
  S.target = S.forced ?? stormW(lx, lz);
  S.storm += (S.target - S.storm) * (1 - Math.exp(-dt / 3.0));
  if (Math.abs(S.storm - S.target) < 1e-3) S.storm = S.target;
  // 闪电
  if (S.storm > 0.4) { S.nextBolt -= dt; if (S.nextBolt <= 0) { strikeNow(cam, O); S.nextBolt = (3 + Math.random() * 7) / Math.max(0.6, S.storm); } }
  else S.nextBolt = Math.min(S.nextBolt + dt, 2.5);
  if (S.boltOffAt > 0 && S.T > S.boltOffAt) { boltOff(); S.boltOffAt = -1; }
  let f = 0; for (const [t0, a] of S.pulses) if (S.T >= t0) f += a * Math.exp(-(S.T - t0) / 0.075);
  if (S.pulses.length && S.T - S.pulses[S.pulses.length - 1][0] > 1) S.pulses = [];
  S.flash = Math.min(1.6, f) * Math.min(1, S.storm * 1.5);
  // 风：基础和风 + 风暴 + 阵风
  const gust = 0.5 + 0.5 * Math.sin(S.T * 0.37) * Math.sin(S.T * 0.13 + 1.1);
  S.wind = 0.15 + S.storm * (0.65 + 0.3 * gust);
  S.rain = ss(0.25, 0.85, S.storm);
  // 潮渊钟井提示
  const near = Math.hypot(lx - WELL.x, lz - WELL.z) < WELL_HINT_R;
  if (near !== S.wellNear) { S.wellNear = near; hint(near); if (near) S.wellHints++; }
  return S;
}
export function stormLeave() { const S = stormRT; S.storm = 0; S.target = 0; S.flash = 0; S.rain = 0; S.wind = 0.15; S.pulses = []; boltOff(); if (S.wellNear) { S.wellNear = false; hint(false); } }
export const stormDebug = () => ({ target: +stormRT.target.toFixed(3), storm: +stormRT.storm.toFixed(3), flash: +stormRT.flash.toFixed(3), wind: +stormRT.wind.toFixed(2), rain: +stormRT.rain.toFixed(2),
  bolts: stormRT.bolts, lastBoltAt: +stormRT.lastBoltAt.toFixed(2), lastThunderAt: +stormRT.lastThunderAt.toFixed(2), thunderDelay: +stormRT.lastThunderDelay.toFixed(2), boltDist: Math.round(stormRT.lastBoltDist),
  wellNear: stormRT.wellNear, wellHints: stormRT.wellHints, hintText: hintEl?.textContent?.slice(0, 9) ?? '', hintShown: !!hintEl && hintEl.style.opacity === '1' });
export { zoneAt };
