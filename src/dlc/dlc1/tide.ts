// ======================================================================
// DLC1 沉钟海岸 · 潮汐（v1.0.3）
// 周期：退潮 100 秒 → 涨潮中 12 秒 → 涨潮 100 秒 → 退潮中 12 秒（全局时钟，不在海岸也在走）
// - 涨潮：浅滩 / 沉船湾 / 深潮口三片低洼地被淹，站在水里移动速度 -40%
// - 退潮：沉船湾和深潮口露出 4 个沉船宝箱，走近自动打开（每次退潮每个箱子开一次，必出蓝色以上装备）
// ======================================================================
import * as THREE from 'three';
import { poolWater } from './water_fx';
import type { PackCtx, WildBuildApi } from '../../core/ContentPacks';
import { tileMat } from '../../web/tiletex';   // 1107 05 第 2 批（宝箱）

export const TIDE = { low: 100, rise: 12, high: 100, fall: 12 };
const CYCLE = TIDE.low + TIDE.rise + TIDE.high + TIDE.fall;
/** 低洼地（局部坐标）：涨潮时淹没 */
export const TIDE_POOLS = [{ x: 0, z: -10, r: 18 }, { x: -42, z: 20, r: 18 }, { x: 0, z: -60, r: 16 }];
/** 沉船宝箱（局部坐标） */
export const WRECK_CHESTS = [{ x: -46, z: 16 }, { x: -32, z: 30 }, { x: -6, z: -64 }, { x: 10, z: -58 }];
export const WADE_MUL = 0.6;

export type TidePhase = 'low' | 'rise' | 'high' | 'fall';
let clock = 0;
/** 当前潮相和 0–1 的水位 */
export function tideAt(t: number): { phase: TidePhase; level: number; left: number } {
  const x = ((t % CYCLE) + CYCLE) % CYCLE;
  if (x < TIDE.low) return { phase: 'low', level: 0, left: TIDE.low - x };
  if (x < TIDE.low + TIDE.rise) { const k = (x - TIDE.low) / TIDE.rise; return { phase: 'rise', level: k, left: TIDE.low + TIDE.rise - x }; }
  if (x < TIDE.low + TIDE.rise + TIDE.high) return { phase: 'high', level: 1, left: TIDE.low + TIDE.rise + TIDE.high - x };
  const k = (x - TIDE.low - TIDE.rise - TIDE.high) / TIDE.fall; return { phase: 'fall', level: 1 - k, left: CYCLE - x };
}
export const tideNow = () => tideAt(clock);
/** 测试 / 调试：直接跳到某个潮相开头 */
export function setTidePhase(p: TidePhase) { clock = p === 'low' ? 0.01 : p === 'rise' ? TIDE.low + 0.01 : p === 'high' ? TIDE.low + TIDE.rise + 0.01 : TIDE.low + TIDE.rise + TIDE.high + 0.01; }

// ---------------------------------------------------------------- 场景对象（buildWild 时创建）
let waters: THREE.Mesh[] = [], chestObjs: THREE.Group[] = [];
/** 宝箱开没开（和场景对象无关，没生成场景时也能结算） */
const opened = WRECK_CHESTS.map(() => false);
function chestMesh(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.75), tileMat('coffinwood', { color: 0x9a7a5a, roughness: 0.85 }) ?? new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.8 }));
  box.position.y = 0.35;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 0.8), tileMat('chestmetal', { color: 0xc0a050, metalness: 0.6, roughness: 0.45, emissive: 0x30e8d8, emissiveIntensity: 0.35 }) ?? new THREE.MeshStandardMaterial({ color: 0x8a7030, metalness: 0.6, roughness: 0.4, emissive: 0x30e8d8, emissiveIntensity: 0.35 }));
  lid.position.y = 0.8; lid.name = 'lid';
  g.add(box, lid); return g;
}
export function buildTideMeshes(api: WildBuildApi) {
  waters = []; chestObjs = [];
  for (const p of TIDE_POOLS) {
    // 11-07 水体续：原为硬边纯色圆片 → 软边（外圈渐隐，半径放大 12% 补回可见面积）+ 流动细波纹（water_fx.ts）
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.12, 36)); m.material = poolWater(m, p.r, { color: 0x0e5a5a, emissive: 0x0a3a3a, emissiveIntensity: 0.45, opacity: 0.8 });
    m.rotation.x = -Math.PI / 2; m.position.y = -0.5; m.userData.pool = p;
    api.add(m, p.x, p.z); m.userData.baseY = m.position.y + 0.5; waters.push(m);
  }
  for (const c of WRECK_CHESTS) { const g = chestMesh(); api.add(g, c.x, c.z, c.x * 0.3); chestObjs.push(g); }
  applyLevel(tideNow().level);
}
function applyLevel(level: number) {
  for (const m of waters) { m.position.y = (m.userData.baseY as number) - 0.45 + level * 0.95; m.visible = level > 0.02; }
  chestObjs.forEach((g, i) => { g.visible = level < 0.3 && !opened[i]; });
}

/** 玩家在淹水的低洼地里？（局部坐标） */
export const inPool = (lx: number, lz: number) => TIDE_POOLS.some(p => Math.hypot(lx - p.x, lz - p.z) < p.r - 1);

// ---------------------------------------------------------------- 每帧
let lastPhase: TidePhase | null = null, wasHere = false;
export function tideUpdate(dt: number, ctx: PackCtx | null, zoneId: string, origin: { x: number; z: number }) {
  clock += dt;
  const t = tideNow();
  const here = !!ctx && ctx.map() === zoneId;
  if (!here) { if (wasHere) { ctx?.setMoveMul(1); wasHere = false; } lastPhase = t.phase; return; }
  wasHere = true;
  applyLevel(t.level);
  if (t.phase !== lastPhase) {
    if (t.phase === 'low') { opened.fill(false); ctx!.yell('退潮了 · 沉船宝箱露出水面'); }
    else if (t.phase === 'rise') ctx!.toast('潮水开始上涨：浅滩、沉船湾、深潮口即将被淹没', '#7fe8f0');
    else if (t.phase === 'high') ctx!.yell('涨潮 · 低洼地涉水减速');
    else ctx!.toast('潮水正在退去', '#7fe8f0');
    lastPhase = t.phase;
  }
  const p = ctx!.playerPos(), lx = p.x - origin.x, lz = p.z - origin.z;
  ctx!.setMoveMul(t.level > 0.5 && inPool(lx, lz) ? WADE_MUL : 1);
  if (t.level < 0.3) WRECK_CHESTS.forEach((c, i) => {
    if (opened[i] || Math.hypot(lx - c.x, lz - c.z) > 2.6) return;
    opened[i] = true; if (chestObjs[i]) chestObjs[i].visible = false;
    ctx!.dropLoot(origin.x + c.x, origin.z + c.z + 1.2, 'blue');
    ctx!.toast('打开了沉船宝箱', '#ffd34d');
  });
}
export const tideDebug = () => ({ clock, ...tideNow(), chests: opened.map((o, i) => ({ open: o, visible: chestObjs[i]?.visible ?? null })), waters: waters.map(w => +w.position.y.toFixed(2)) });
