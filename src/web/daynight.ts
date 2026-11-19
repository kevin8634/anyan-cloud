// ========== v1.2.69 野外昼夜光照（跟小地图时间条同一个时钟 hudclock.gameClock） ==========
// 只作用于户外（灰石营地 / 翠风原野 / 各野外图）；副本、长副本、深渊、选角台保持原来的光照。
// setZoneLook 设完区域光照后调用 dayNightBase() 记下基准值，之后每 0.25 秒按钟点在基准上调：
//   太阳强度 12%–100%、黎明黄昏偏暖、夜里偏冷蓝；半球光 38%–100%；雾 / 背景 / 天空球按同样的比例压暗、上色。
// 夜里保持可玩亮度（不做全黑），设置里可以关（settings.dayNight === false）。
import * as THREE from 'three';
import { gameClock } from './hudclock';
import { seaSkyOn, ssPalette, ssDemoSunOn, ssDayAtEl, DEMO_EL_DEG } from './seasky_core';   // 11-15 海天共用件：光色 / 雾色按天体模型 + 时段色表（?off=seasky 回旧版）
import { snowGlossDay } from './snow_gloss';
import { NIGHT_LIFT_OFF } from './night_glow';   // 11-18 夜色暗部略提（?off=nightlift）   // 11-17 霜脊雪：白天降反光（夜里原样）
const SS_ON = seaSkyOn();
// 11-18 16:15 Rhett「天黑太暗」（烬落 23:21 截图）：夜里再提一档——月光 32%→48%、默认环境光 64%→82%、区域另设的再 ×1.3；?off=nightlift2 回 11-18 上午值
const NL2 = (() => { try { return !/(?:[?&]off=[^&]*\bnightlift2\b)/.test(location.search); } catch { return true; } })();
const MOON = NL2 ? 0.48 : 0.32;
// 11-19 秋林 Demo 光照链路·日光色 qlsuncol：Demo 户外区白天太阳色 / 半球天光色保持 Demo 原值（1.0,0.74,0.46 / 0.40,0.47,0.52），
//   不再乘时段色表日光色、不再把天光色拉向色表天色 60%、晨昏不再叠 WARM；强度昼夜比例、夜里冷色月光 / 夜天光照旧。?off=qlsuncol 回旧
const QLSUNCOL_OFF = (() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qlsuncol'); } catch { return false; } })();
let demoCol = false;
/** setZoneLook 调（dayNightBase 之前）：当前区域吃 Demo 光 */
export function dayNightDemo(on: boolean) { demoCol = on && !QLSUNCOL_OFF; }

interface Refs { scene: THREE.Scene; hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; sky: THREE.Mesh }
let R: Refs | null = null;
const base = { hemiI: 1, sunI: 1, groundC: new THREE.Color(), hemiC: new THREE.Color(), sunC: new THREE.Color(), bg: new THREE.Color(), skyT: new THREE.Color(), skyM: new THREE.Color(), skyB: new THREE.Color(), on: false };
const NIGHT_SKY = new THREE.Color(0x0e1630), NIGHT_FOG = new THREE.Color(0x1c2540), NIGHT_HEMI = new THREE.Color(0x7088c8), NIGHT_SUN = new THREE.Color(0x8aa6ff);
const WARM = new THREE.Color(0xff9050), WARM_SKY = new THREE.Color(0xf08a50);
const tmp = new THREE.Color();
let acc = 1, enabled = true, last = { d: 1, w: 0 };
/** 11-17 区域夜间光照（WildPalette.night）：烬落「晚上太暗看不见路」——深夜半球光比例、夜色、地面反光、夜雾偏色 */
export interface NightLook { hemiK: number; hemiC: number; groundC?: number; fogC?: number; fogK?: number }
const NL = { hemiK: 0.58, hemiC: NIGHT_HEMI.clone(), groundC: null as THREE.Color | null, fogC: null as THREE.Color | null, fogK: 0 };
function setNight(nl?: NightLook) {
  NL.hemiK = nl?.hemiK !== undefined ? nl.hemiK * (NL2 ? 1.3 : 1) : (NIGHT_LIFT_OFF ? 0.58 : NL2 ? 0.82 : 0.64); NL.hemiC.set(nl ? nl.hemiC : NIGHT_HEMI);
  NL.groundC = nl?.groundC !== undefined ? new THREE.Color(nl.groundC) : null;
  NL.fogC = nl?.fogC !== undefined ? new THREE.Color(nl.fogC) : null; NL.fogK = nl?.fogK ?? 0;
}

export function bindDayNight(r: Refs) { R = r; }
/** 11-14 电影感：当前区域吃昼夜（户外）且开着 */
export const dayNightOn = () => base.on && enabled;
export function setDayNightEnabled(v: boolean) { enabled = v; if (!v) restore(); acc = 1; }

/** 白天程度 0（深夜）–1（正午前后），暖色程度 0–1（黎明 6 点、黄昏 19 点最强） */
export function daylight(hour: number) {
  const d = hour < 4.5 ? 0 : hour < 7.5 ? (hour - 4.5) / 3 : hour < 17.5 ? 1 : hour < 20.5 ? 1 - (hour - 17.5) / 3 : 0;
  const w = Math.max(0, 1 - Math.abs(hour - 6) / 1.6, 1 - Math.abs(hour - 19) / 1.6);
  const s = (x: number) => x * x * (3 - 2 * x);
  return { d: s(d), w: s(w) };
}

/** setZoneLook 之后调用：outdoor = 这个区域吃昼夜 */
export function dayNightBase(outdoor: boolean, night?: NightLook) {
  if (!R) return;
  setNight(night);
  const u = (R.sky.material as THREE.ShaderMaterial).uniforms;
  base.hemiI = R.hemi.intensity; base.sunI = R.sun.intensity;
  base.hemiC.copy(R.hemi.color); base.sunC.copy(R.sun.color); base.groundC.copy(R.hemi.groundColor);
  if ((R.scene.background as THREE.Color | null)?.isColor) base.bg.copy(R.scene.background as THREE.Color);
  if (!skyBaseSet) { base.skyT.copy(u.top.value); base.skyM.copy(u.mid.value); base.skyB.copy(u.bottom.value); skyBaseSet = true; }
  base.on = outdoor; acc = 1;
  if (!outdoor) restoreSky();
  if (!outdoor || !enabled) snowGlossDay(1);   // 不吃昼夜 / 昼夜关 = 全日照
}
let skyBaseSet = false;
function restoreSky() { if (!R || !skyBaseSet) return; const u = (R.sky.material as THREE.ShaderMaterial).uniforms; u.top.value.copy(base.skyT); u.mid.value.copy(base.skyM); u.bottom.value.copy(base.skyB); }
function restore() {
  if (!R || !base.on) return;
  R.hemi.intensity = base.hemiI; R.sun.intensity = base.sunI; R.hemi.color.copy(base.hemiC); R.sun.color.copy(base.sunC); R.hemi.groundColor.copy(base.groundC);
  if ((R.scene.background as THREE.Color | null)?.isColor) (R.scene.background as THREE.Color).copy(base.bg); else R.scene.background = base.bg.clone(); (R.scene.fog as THREE.Fog | null)?.color.copy(base.bg); restoreSky(); snowGlossDay(1);
}

/** 每帧调用（内部 0.25 秒节流）；paused = 选角台 / 标题等不该改光的时候 */
export function dayNightTick(dt: number, paused = false) {
  if (!R || !base.on || !enabled || paused) return;
  acc += dt; if (acc < 0.25) return; acc = 0;
  apply(gameClock().h + gameClock().m / 60);
}
const _p = new THREE.Color(), _q = new THREE.Color(), _z = new THREE.Color();
const lum = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
/** 11-15 海天共用件：太阳仰角查同一张时段色表（与天空 / 海岸同一套）。
 *  日光色 = 色表日光色（按最亮通道归一）× 区域原日光色；白天程度按仰角（夜里保持 32% 月光、58% 环境光的可玩亮度不变）；
 *  雾 / 背景 = 色表地平线平均色与区域雾色（按色表亮度缩放）各半——保留各野外图自己的空气色，又跟天色一起变；天空球 top = 色表天顶（cine 共享天顶色） */
function applySS(hour: number) {
  if (!R) return;
  const P = ssPalette(hour);
  let d = Math.max(0, Math.min(1, (P.day - 0.06) / 0.94)); const w = P.warm, n = P.night;
  if (ssDemoSunOn()) d = Math.min(1, d / Math.max(0.05, (ssDayAtEl(DEMO_EL_DEG) - 0.06) / 0.94));   // 11-19 qlsunlock：白天锁在 Demo 仰角 14.1°（色表 day≈0.87）→ 归一到 1，日光 3.5 / 天光 0.62 回 Demo 满值；夜里不变
  last = { d, w }; snowGlossDay(d);
  R.sun.intensity = base.sunI * (MOON + (1 - MOON) * d);
  const sm = Math.max(P.sunC.x, P.sunC.y, P.sunC.z);
  if (sm > 1e-3) _p.setRGB(P.sunC.x / sm, P.sunC.y / sm, P.sunC.z / sm); else _p.copy(NIGHT_SUN);
  if (demoCol) R.sun.color.copy(base.sunC).lerp(NIGHT_SUN, n * 0.7); else
  R.sun.color.copy(base.sunC).multiply(_p).lerp(NIGHT_SUN, n * 0.7);
  R.hemi.intensity = base.hemiI * (NL.hemiK + (1 - NL.hemiK) * d);
  _z.setRGB(P.zen.x * 0.5 + (P.hor.x + P.horA.x) * 0.25, P.zen.y * 0.5 + (P.hor.y + P.horA.y) * 0.25, P.zen.z * 0.5 + (P.hor.z + P.horA.z) * 0.25);
  const zl = Math.max(lum(_z), 1e-4); _z.multiplyScalar(1 / zl);   // 天光色（亮度归一）
  if (demoCol) R.hemi.color.copy(base.hemiC).lerp(NL.hemiC, n * 0.65); else
  R.hemi.color.copy(base.hemiC).lerp(_q.copy(base.hemiC).multiply(_z).multiplyScalar(lum(base.hemiC) / Math.max(lum(_q.copy(base.hemiC).multiply(_z)), 1e-4)), 0.6).lerp(NL.hemiC, n * 0.65);
  if (NL.groundC) R.hemi.groundColor.copy(base.groundC).lerp(NL.groundC, n);
  // 雾：色表地平线平均 × 0.8（与海岸 ssFog 同式）和区域雾色（亮度按色表）各半
  _p.setRGB((P.hor.x + P.horA.x) * 0.4, (P.hor.y + P.horA.y) * 0.4, (P.hor.z + P.horA.z) * 0.4);
  const pl = lum(_p), bl = Math.max(lum(base.bg), 1e-4);
  tmp.copy(base.bg).multiplyScalar(Math.min(1.3, pl / 0.42) * (0.42 / bl) * (bl > 0.42 ? bl / 0.42 : 1));
  tmp.lerp(_p, 0.5);
  if (NL.fogC) tmp.lerp(NL.fogC, n * NL.fogK);
  if ((R.scene.background as THREE.Color | null)?.isColor) (R.scene.background as THREE.Color).copy(tmp); (R.scene.fog as THREE.Fog | null)?.color.copy(tmp);
  const u = (R.sky.material as THREE.ShaderMaterial).uniforms;
  u.top.value.setRGB(P.zen.x, P.zen.y, P.zen.z);
  u.mid.value.copy(tmp); u.bottom.value.copy(tmp).multiplyScalar(0.85);
}
function apply(hour: number) {
  if (!R) return;
  if (SS_ON) { applySS(hour); return; }
  const { d, w } = daylight(hour); last = { d, w }; snowGlossDay(d);
  const n = 1 - d;
  R.sun.intensity = base.sunI * (MOON + (1 - MOON) * d);   // 11-08 Rhett「天黑了人都看不见了」：夜里月光 12% → 32%
  R.sun.color.copy(base.sunC).lerp(WARM, demoCol ? 0 : w * 0.8).lerp(NIGHT_SUN, n * 0.7);
  R.hemi.intensity = base.hemiI * (NL.hemiK + (1 - NL.hemiK) * d);   // 11-08 夜里环境光 38% → 58%（11-17 区域可另设，烬落 85%）
  R.hemi.color.copy(base.hemiC).lerp(WARM, demoCol ? 0 : w * 0.35).lerp(NL.hemiC, n * 0.65);
  if (NL.groundC) R.hemi.groundColor.copy(base.groundC).lerp(NL.groundC, n);
  tmp.copy(base.bg).lerp(WARM_SKY, w * 0.4).lerp(NIGHT_FOG, n * 0.82);
  if (NL.fogC) tmp.lerp(NL.fogC, n * NL.fogK);
  if ((R.scene.background as THREE.Color | null)?.isColor) (R.scene.background as THREE.Color).copy(tmp); (R.scene.fog as THREE.Fog | null)?.color.copy(tmp);
  const u = (R.sky.material as THREE.ShaderMaterial).uniforms;
  u.top.value.copy(base.skyT).lerp(NIGHT_SKY, n * 0.85);
  u.mid.value.copy(base.skyM).lerp(WARM_SKY, w * 0.5).lerp(NIGHT_FOG, n * 0.8);
  u.bottom.value.copy(base.skyB).lerp(WARM, w * 0.4).lerp(NIGHT_FOG, n * 0.75);
}
/** 11-19 白天程度 0..1（不吃昼夜的图 / 昼夜关 = 1），cine Demo 空气雾色日夜过渡用 */
export const dayLevel = () => base.on && enabled ? last.d : 1;
/** 11-18 深夜程度 0..1（不吃昼夜的图 = 0），怪物夜间轮廓光用 */
export const nightness = () => base.on && enabled ? 1 - last.d : 0;
/** 测试用 */
export function dayNightDebug(hour?: number) {
  if (hour !== undefined) apply(hour);
  return { on: base.on, enabled, d: +last.d.toFixed(3), w: +last.w.toFixed(3), sunI: R ? +R.sun.intensity.toFixed(3) : 0, baseSunI: base.sunI, hemiI: R ? +R.hemi.intensity.toFixed(3) : 0, bg: R ? '#' + (R.scene.background as THREE.Color).getHexString() : '' };
}
