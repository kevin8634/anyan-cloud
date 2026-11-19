// ========== 寻路网格（引擎无关） ==========
// 每个区域一张可走网格：边界 + 圆形障碍（树、石头、帐篷、栅栏桩……）+ 不可走地形函数（河流、副本墙）
// 支持动态阻挡（副本里没开的门），A*（八方向、不切角）+ 视线平滑，另带圆形障碍的碰撞推挤
export interface Pos2 { x: number; z: number }
export interface Circle { x: number; z: number; r: number }
export interface NavBounds { x0: number; z0: number; x1: number; z1: number }

export interface NavOptions {
  cell?: number;                                 // 格子大小（米），默认 1
  agentR?: number;                               // 角色半径：障碍按这个半径膨胀，默认 0.45
  solid?: (x: number, z: number) => boolean;     // 静态不可走地形（河、墙），建网格时烘进去
  dynamic?: (x: number, z: number) => boolean;   // 动态阻挡（门），寻路/碰撞时实时判断
}

const SQ2 = Math.SQRT2;
const BUCKET = 8;

export class NavGrid {
  readonly w: number; readonly h: number; readonly cell: number;
  readonly blocked: Uint8Array;
  readonly agentR: number;
  solid?: (x: number, z: number) => boolean;
  dynamic?: (x: number, z: number) => boolean;
  private buckets = new Map<number, Circle[]>();
  /** 最近一次寻路展开的节点数（测试/调试用） */
  lastExpanded = 0;

  constructor(readonly bounds: NavBounds, readonly circles: Circle[], o: NavOptions = {}) {
    this.cell = o.cell ?? 1;
    this.agentR = o.agentR ?? 0.45;
    this.solid = o.solid; this.dynamic = o.dynamic;
    this.w = Math.ceil((bounds.x1 - bounds.x0) / this.cell) + 1;
    this.h = Math.ceil((bounds.z1 - bounds.z0) / this.cell) + 1;
    this.blocked = new Uint8Array(this.w * this.h);
    // 地形
    if (this.solid) for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const p = this.center(i, j); if (this.solid(p.x, p.z)) this.blocked[j * this.w + i] = 1;
    }
    // 圆形障碍（膨胀 agentR）
    for (const c of circles) this.markCircle(c);
  }
  /** 圆形障碍：寻路格（膨胀 agentR）+ 碰撞分桶 */
  private markCircle(c: Circle) {
    const bounds = this.bounds;
    const R = c.r + this.agentR;
    const i0 = Math.max(0, Math.floor((c.x - R - bounds.x0) / this.cell)), i1 = Math.min(this.w - 1, Math.ceil((c.x + R - bounds.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((c.z - R - bounds.z0) / this.cell)), j1 = Math.min(this.h - 1, Math.ceil((c.z + R - bounds.z0) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p = this.center(i, j);
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < R * R) this.blocked[j * this.w + i] = 1;
    }
    // 碰撞用的空间分桶
    for (let bx = Math.floor((c.x - c.r) / BUCKET); bx <= Math.floor((c.x + c.r) / BUCKET); bx++)
      for (let bz = Math.floor((c.z - c.r) / BUCKET); bz <= Math.floor((c.z + c.r) / BUCKET); bz++) {
        const k = bx * 100003 + bz; let a = this.buckets.get(k); if (!a) this.buckets.set(k, a = []); a.push(c);
      }
  }
  /** 建好之后再加的圆形障碍（造景回调里放的建筑）；circles 列表同步追加 */
  addCircle(c: Circle) { this.circles.push(c); this.markCircle(c); }

  center(i: number, j: number): Pos2 { return { x: this.bounds.x0 + i * this.cell, z: this.bounds.z0 + j * this.cell }; }
  private ij(x: number, z: number) { return { i: Math.round((x - this.bounds.x0) / this.cell), j: Math.round((z - this.bounds.z0) / this.cell) }; }
  inBounds(x: number, z: number) { const b = this.bounds; return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1; }
  private freeIJ(i: number, j: number) {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h || this.blocked[j * this.w + i]) return false;
    if (this.dynamic) { const p = this.center(i, j); if (this.dynamic(p.x, p.z)) return false; }
    return true;
  }
  /** 网格意义上的可走（含障碍膨胀和动态阻挡） */
  isFree(x: number, z: number) { const { i, j } = this.ij(x, z); return this.freeIJ(i, j); }
  /** 地形意义上的可走（只看边界、地形、动态阻挡，不看圆形障碍；碰撞时用） */
  walkable(x: number, z: number) { return this.inBounds(x, z) && !(this.solid?.(x, z)) && !(this.dynamic?.(x, z)); }

  /** 点到圆形障碍的精确检测（m = 额外留出的半径） */
  hitsCircle(x: number, z: number, m: number) {
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = this.buckets.get((bx + dx) * 100003 + (bz + dz)); if (!a) continue;
      for (const c of a) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + m) ** 2) return true;
    }
    return false;
  }
  /** 直线是否畅通（按 1/4 格步长采样：网格 + 圆形障碍精确检测，留出角色半径） */
  lineOfSight(a: Pos2, b: Pos2) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / (this.cell * 0.25)));
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (!this.isFree(x, z) || this.hitsCircle(x, z, this.agentR * 0.85)) return false;
    }
    return true;
  }

  /** 找最近的可走格（起点/终点落在障碍里时用），半径 maxR 格 */
  nearestFree(x: number, z: number, maxR = 10): Pos2 | null {
    const { i, j } = this.ij(x, z);
    if (this.freeIJ(i, j)) return this.center(i, j);
    for (let r = 1; r <= maxR; r++) {
      let best: Pos2 | null = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.freeIJ(i + di, j + dj)) continue;
        const p = this.center(i + di, j + dj), d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A*：返回从起点到终点的路点（不含起点，最后一个是终点）；找不到返回 null
   * 八方向，斜走不切角；结果做视线平滑，路点更少、走起来更直
   */
  findPath(sx: number, sz: number, gx: number, gz: number, maxNodes = 60000): Pos2[] | null {
    const s = this.nearestFree(sx, sz), g = this.nearestFree(gx, gz);
    this.lastExpanded = 0;
    if (!s || !g) return null;
    const W = this.w, N = W * this.h;
    const si = this.ij(s.x, s.z), gi = this.ij(g.x, g.z);
    const start = si.j * W + si.i, goal = gi.j * W + gi.i;
    const goalPt = this.isFree(gx, gz) ? { x: gx, z: gz } : g;
    if (start === goal) return [goalPt];
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heapI: number[] = [], heapF: number[] = [];
    const push = (n: number, f: number) => {
      let k = heapI.length; heapI.push(n); heapF.push(f);
      while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; }
      heapI[k] = n; heapF[k] = f;
    };
    const pop = () => {
      const top = heapI[0], ln = heapI.pop()!, lf = heapF.pop()!;
      if (heapI.length) {
        let k = 0; const L = heapI.length;
        for (;;) { let c = 2 * k + 1; if (c >= L) break; if (c + 1 < L && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= lf) break; heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c; }
        heapI[k] = ln; heapF[k] = lf;
      }
      return top;
    };
    const h = (n: number) => { const dx = Math.abs((n % W) - gi.i), dz = Math.abs(((n / W) | 0) - gi.j); return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)); };
    gs[start] = 0; push(start, h(start));
    let found = false;
    while (heapI.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      if (++this.lastExpanded > maxNodes) break;
      const ci = cur % W, cj = (cur / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.freeIJ(ni, nj)) continue;
        if (di && dj && (!this.freeIJ(ci + di, cj) || !this.freeIJ(ci, cj + dj))) continue;   // 不切角
        const n = nj * W + ni;
        if (closed[n]) continue;
        const ng = gs[cur] + (di && dj ? SQ2 : 1);
        if (ng < gs[n]) { gs[n] = ng; came[n] = cur; push(n, ng + h(n)); }
      }
    }
    if (!found) return null;
    const raw: Pos2[] = [];
    for (let n = goal; n !== -1 && n !== start; n = came[n]) raw.push(this.center(n % W, (n / W) | 0));
    raw.reverse();
    raw[raw.length - 1] = goalPt;
    // 视线平滑（拉直）
    const out: Pos2[] = [];
    let from: Pos2 = { x: sx, z: sz };
    if (!this.isFree(sx, sz)) from = s;
    let k = 0;
    while (k < raw.length) {
      let far = k;
      for (let m = raw.length - 1; m > k; m--) if (this.lineOfSight(from, raw[m])) { far = m; break; }
      out.push(raw[far]); from = raw[far]; k = far + 1;
    }
    return out;
  }

  /** 碰撞：把位置推出圆形障碍（半径 r 的角色） */
  collide(p: Pos2, r = 0.45) {
    for (let pass = 0; pass < 2; pass++) {
      const bx = Math.floor(p.x / BUCKET), bz = Math.floor(p.z / BUCKET);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const a = this.buckets.get((bx + dx) * 100003 + (bz + dz)); if (!a) continue;
        for (const c of a) {
          const ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz), min = c.r + r;
          if (d < min) { if (d < 1e-4) { p.x += min; continue; } p.x = c.x + ox / d * min; p.z = c.z + oz / d * min; }
        }
      }
    }
    return p;
  }

  /** 移动后的位置修正：推出障碍；进了不可走地形就沿轴滑动或退回 */
  resolveMove(prev: Pos2, p: Pos2, r = 0.45) {
    this.collide(p, r);
    if (this.walkable(p.x, p.z)) return p;
    if (this.walkable(prev.x, p.z)) { p.x = prev.x; return p; }
    if (this.walkable(p.x, prev.z)) { p.z = prev.z; return p; }
    p.x = prev.x; p.z = prev.z;
    return p;
  }
}

/** 路径总长 */
export function pathLength(from: Pos2, path: Pos2[]) {
  let L = 0, a = from;
  for (const b of path) { L += Math.hypot(b.x - a.x, b.z - a.z); a = b; }
  return L;
}
