// ========== v0.9.3a 野外性能底座（引擎无关） ==========
// ① 地形起伏：小山丘（缓坡，能走上去）+ 台地（四周陡崖，只能从坡道上去）
// ② 高度图：把任意高度函数按 1 米一格采样成网格，查询 O(1)（双线性插值），并按坡度判断能不能走
// ③ 40 米分块激活：只更新 / 显示玩家附近区块里的怪，同屏最多 40 只（交战中的怪始终保留）
import type { Pos2 } from './NavGrid';

/** 地形起伏（局部坐标）：hill = 余弦山丘；mesa = 平顶台地，陡崖 + 一条坡道（ramp.a = 坡道朝向，弧度，0 = +x） */
export interface Rise {
  x: number; z: number; r: number; h: number;
  kind?: 'hill' | 'mesa';
  ramp?: { a: number; w: number; len: number };
  name?: string;
}
/** 台地崖壁水平宽度（米）：2.4 米升 3 米多 → 远超可走坡度 */
export const MESA_EDGE = 2.4;
/** 能走的最大坡度（度）：坡道 ~17°、山丘 ≤ ~15°，崖壁 50°+ */
export const MAX_WALK_SLOPE = 32;

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** 单个起伏的高度 */
export function riseHeight(r: Rise, x: number, z: number) {
  const dx = x - r.x, dz = z - r.z, d = Math.hypot(dx, dz);
  if (r.kind !== 'mesa') return d >= r.r ? 0 : r.h * 0.5 * (1 + Math.cos(Math.PI * d / r.r));
  let y = r.h * smooth((r.r + MESA_EDGE - d) / MESA_EDGE);
  if (r.ramp) {
    const ca = Math.cos(r.ramp.a), sa = Math.sin(r.ramp.a);
    const along = dx * ca + dz * sa, side = Math.abs(-dx * sa + dz * ca);
    if (along > 0 && side < r.ramp.w / 2 + 1) {
      const t = (along - r.r + 0.6) / r.ramp.len;                    // 0 = 台顶边缘，1 = 坡脚
      const k = 1 - smooth((side - r.ramp.w / 2) / 1);               // 坡道两侧 1 米收边（陡，走不了）
      const ry = r.h * (1 - Math.max(0, Math.min(1, t)));
      y = Math.max(y, ry * (side <= r.ramp.w / 2 ? 1 : k));
    }
  }
  return y;
}
/** 所有起伏叠加（取最高） */
export function risesY(rs: readonly Rise[] | undefined, x: number, z: number) {
  if (!rs) return 0;
  let y = 0;
  for (const r of rs) {
    const reach = r.r + (r.kind === 'mesa' ? MESA_EDGE + (r.ramp?.len ?? 0) + 1 : 0);
    if (Math.abs(x - r.x) > reach || Math.abs(z - r.z) > reach) continue;
    y = Math.max(y, riseHeight(r, x, z));
  }
  return y;
}
/** 点是否落在某个台地的坡道走廊上（散布物件要让开） */
export function onRamp(rs: readonly Rise[] | undefined, x: number, z: number, pad = 1.5) {
  if (!rs) return false;
  return rs.some(r => {
    if (r.kind !== 'mesa' || !r.ramp) return false;
    const dx = x - r.x, dz = z - r.z, ca = Math.cos(r.ramp.a), sa = Math.sin(r.ramp.a);
    const along = dx * ca + dz * sa, side = Math.abs(-dx * sa + dz * ca);
    return along > r.r - 1 && along < r.r + r.ramp.len + pad && side < r.ramp.w / 2 + pad;
  });
}
/** 坡脚和台顶的点（世界坐标需要再加区域原点）——测试 / 寻路调试用 */
export function rampEnds(r: Rise): { foot: Pos2; top: Pos2 } {
  const a = r.ramp?.a ?? 0, ca = Math.cos(a), sa = Math.sin(a), L = r.ramp?.len ?? 0;
  return { foot: { x: r.x + ca * (r.r + L + 1.5), z: r.z + sa * (r.r + L + 1.5) }, top: { x: r.x, z: r.z } };
}

/** 高度图：bounds 内按 cell 采样，查询双线性插值；slope() 用中心差分算坡度 */
export class HeightField {
  readonly w: number; readonly h: number; readonly data: Float32Array;
  constructor(readonly x0: number, readonly z0: number, readonly x1: number, readonly z1: number, fn: (x: number, z: number) => number, readonly cell = 1) {
    this.w = Math.ceil((x1 - x0) / cell) + 1; this.h = Math.ceil((z1 - z0) / cell) + 1;
    this.data = new Float32Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.data[j * this.w + i] = fn(x0 + i * cell, z0 + j * cell);
  }
  private v(i: number, j: number) { i = i < 0 ? 0 : i >= this.w ? this.w - 1 : i; j = j < 0 ? 0 : j >= this.h ? this.h - 1 : j; return this.data[j * this.w + i]; }
  at(x: number, z: number) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, t = fz - j;
    const a = this.v(i, j), b = this.v(i + 1, j), c = this.v(i, j + 1), d = this.v(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * t + (a - b - c + d) * u * t;
  }
  /** 坡度（度） */
  slope(x: number, z: number) {
    const e = this.cell * 0.5;
    const gx = (this.at(x + e, z) - this.at(x - e, z)) / (2 * e), gz = (this.at(x, z + e) - this.at(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }
  steep(x: number, z: number, maxDeg = MAX_WALK_SLOPE) { return this.slope(x, z) > maxDeg; }
}

// ---------------------------------------------------------------- 分块激活
export const CHUNK = 40;
/** 同屏（激活）怪物上限 */
export const MAX_ACTIVE = 40;
export const chunkOf = (x: number, z: number) => ({ cx: Math.floor(x / CHUNK), cz: Math.floor(z / CHUNK) });
/** 两点所在区块的切比雪夫距离（0 = 同块，1 = 相邻一圈） */
export function chunkDist(ax: number, az: number, bx: number, bz: number) {
  const a = chunkOf(ax, az), b = chunkOf(bx, bz);
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}
/**
 * 选出要激活的单位：玩家所在区块 + 周围一圈（3×3 块，最远约 80 米）里的，按距离取最近的 cap 个；
 * keep() 为真的（正在追 / 打玩家、当前目标）无论多远都保留，并且优先占名额
 */
export function pickActive<T>(units: readonly T[], pos: (u: T) => Pos2, px: number, pz: number, cap = MAX_ACTIVE, keep: (u: T) => boolean = () => false, ring = 1): Set<T> {
  const out = new Set<T>();
  const cand: { u: T; d: number }[] = [];
  for (const u of units) {
    if (keep(u)) { out.add(u); continue; }
    const p = pos(u);
    if (chunkDist(p.x, p.z, px, pz) > ring) continue;
    cand.push({ u, d: (p.x - px) ** 2 + (p.z - pz) ** 2 });
  }
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand) { if (out.size >= cap) break; out.add(c.u); }
  return out;
}
