// ======================================================================
// DLC1 镜渊城 · 第五轮：实体石板（高 / 超高档）
//   每格一块不规则四边形石板（四角共享抖动 → 相邻石板贴合），每条缝单独内缩（紧贴 / 普通 / 宽缝），
//   缺失格露出底下的砂砾；下沉、翘起（整块倾斜）、挤裂（一刀切成两块、各自错位）；四周有侧壁，翘起时能看到厚度。
//   顶面 UV 落在板岩贴图 5×5 里随机一格（随机 90° 旋转 / 镜像），材质与地面同一套 shader（plaza_dress floorMat）
// ======================================================================
import * as THREE from 'three';
import { slabRegion, slabInfo, slabCorner, slabGap, seaBase, h3, SEA_HALF } from './seafloor';

type V2 = [number, number];
/** 凸多边形每条边各自向内平移 g[k]（边 k = V[k] → V[k+1]） */
function inset(V: V2[], g: number[]): V2[] {
  const n = V.length, cx = V.reduce((a, v) => a + v[0], 0) / n, cz = V.reduce((a, v) => a + v[1], 0) / n;
  const lines = V.map((a, k) => { const b = V[(k + 1) % n]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let nx = -dz, nz = dx; if ((cx - a[0]) * nx + (cz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
    return { px: a[0] + nx * g[k], pz: a[1] + nz * g[k], dx, dz }; });
  return V.map((_, k) => { const A = lines[(k + n - 1) % n], B = lines[k]; const den = A.dx * B.dz - A.dz * B.dx;
    if (Math.abs(den) < 1e-6) return [B.px, B.pz] as V2; const t = ((B.px - A.px) * B.dz - (B.pz - A.pz) * B.dx) / den; return [A.px + A.dx * t, A.pz + A.dz * t] as V2; });
}
/** 半平面裁剪：保留 nx·x + nz·z ≥ d 的部分 */
function clip(V: V2[], nx: number, nz: number, d: number): V2[] {
  const out: V2[] = [];
  for (let k = 0; k < V.length; k++) {
    const a = V[k], b = V[(k + 1) % V.length], fa = a[0] * nx + a[1] * nz - d, fb = b[0] * nx + b[1] * nz - d;
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export type SlabStats = { slabs: number; cracked: number; raised: number; sunk: number; missing: number; verts: number };
/** 生成整片石板几何（局部坐标，y 为绝对高度）。r = 只铺离 (cx, cz) r 米以内（降级用） */
export function slabGeometry(stats?: SlabStats, cx0 = 0, cz0 = 0, r = 1e9): THREE.BufferGeometry {
  let cap = 1 << 18, nv = 0, P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), U = new Float32Array(cap * 2), C = new Float32Array(cap);
  const grow = () => { cap *= 2; const g3 = (a: Float32Array, k: number) => { const b = new Float32Array(cap * k); b.set(a); return b; }; P = g3(P, 3); N = g3(N, 3); U = g3(U, 2); C = g3(C, 1); };
  const put = (p: number[], n: number[], u: number[], c: number) => { if (nv >= cap) grow(); P[nv * 3] = p[0]; P[nv * 3 + 1] = p[1]; P[nv * 3 + 2] = p[2]; N[nv * 3] = n[0]; N[nv * 3 + 1] = n[1]; N[nv * 3 + 2] = n[2]; U[nv * 2] = u[0]; U[nv * 2 + 1] = u[1]; C[nv] = c; nv++; };
  const st = stats ?? { slabs: 0, cracked: 0, raised: 0, sunk: 0, missing: 0, verts: 0 };
  const tri = (a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[], col: number) => {
    // 保证朝向与 n 一致（逆时针 = 正面）
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    put(a, n, ua, col); put(b, n, ub, col); put(c, n, uc, col);
  };
  const emit = (poly: V2[], e: number, tx: number, tz: number, ci: number, cj: number, uvf: (x: number, z: number) => number[], tint: number, tight: boolean[] | null) => {
    if (poly.length < 3) return;
    const top = poly.map(([x, z]) => [x, seaBase(x, z) + e + tx * (x - ci) + tz * (z - cj), z]);
    const bot = poly.map(([x, z]) => [x, seaBase(x, z) - 0.1, z]);
    // 顶面法线（Newell）
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < top.length; k++) { const a = top[k], b = top[(k + 1) % top.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const L = Math.hypot(nx, ny, nz) || 1; let n = [nx / L, ny / L, nz / L]; if (n[1] < 0) n = n.map(v => -v);
    const uv = poly.map(([x, z]) => uvf(x, z));
    for (let k = 1; k < top.length - 1; k++) tri(top[0], top[k], top[k + 1], n, uv[0], uv[k], uv[k + 1], tint);
    // 侧壁
    const mx = poly.reduce((a, v) => a + v[0], 0) / poly.length, mz = poly.reduce((a, v) => a + v[1], 0) / poly.length;
    for (let k = 0; k < poly.length; k++) {
      if (tight && tight[k]) continue;   // 紧贴的缝看不到侧壁
      const k2 = (k + 1) % poly.length, a = poly[k], b = poly[k2]; let sx = b[1] - a[1], sz = -(b[0] - a[0]); const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      if ((a[0] + b[0]) / 2 * sx + (a[1] + b[1]) / 2 * sz - (mx * sx + mz * sz) < 0) { sx = -sx; sz = -sz; }
      const sn = [sx, 0, sz], ua = uv[k], ub = uv[k2], h = 0.03;
      tri(top[k], top[k2], bot[k2], sn, ua, ub, [ub[0], ub[1] + h], tint * 0.42); tri(top[k], bot[k2], bot[k], sn, ua, [ub[0], ub[1] + h], [ua[0], ua[1] + h], tint * 0.42);
    }
    st.slabs++;
  };
  for (let j = -SEA_HALF; j <= SEA_HALF; j++) for (let i = -SEA_HALF; i <= SEA_HALF; i++) {
    if (Math.hypot(i - cx0, j - cz0) > r || !slabRegion(i, j)) continue;
    const s = slabInfo(i, j); if (s.kind === 1) { st.missing++; continue; }
    const jit = (c: V2, k: number): V2 => [c[0] + (h3(i, j, 20 + k) - 0.5) * 0.03, c[1] + (h3(i, j, 24 + k) - 0.5) * 0.03];
    const quad: V2[] = [jit(slabCorner(i - 1, j - 1), 0), jit(slabCorner(i, j - 1), 1), jit(slabCorner(i, j), 2), jit(slabCorner(i - 1, j), 3)];
    const gaps = [slabGap(i, j - 1, 0), slabGap(i, j, 1), slabGap(i, j, 0), slabGap(i - 1, j, 1)];
    const poly = inset(quad, gaps.map(g => g / 2));
    const tight = s.kind === 0 ? gaps.map(g => g < 0.01) : null;
    // 贴图：5×5 板岩里随机一格，随机旋转 / 镜像
    const ti = Math.floor(h3(i, j, 30) * 5), tj = Math.floor(h3(i, j, 31) * 5), rot = Math.floor(h3(i, j, 32) * 4), mir = h3(i, j, 33) > 0.5 ? -1 : 1;
    const uvf = (x: number, z: number) => { let lx = (x - i) * mir, lz = z - j; for (let k = 0; k < rot; k++) [lx, lz] = [-lz, lx];
      return [(ti + 0.5 + Math.max(-0.47, Math.min(0.47, lx * 0.8))) / 5, (tj + 0.5 + Math.max(-0.47, Math.min(0.47, lz * 0.8))) / 5]; };
    const tint = (s.kind === 2 ? 0.78 : s.kind === 3 ? 1.05 : 1) * (0.86 + 0.26 * h3(i, j, 34));
    if (s.kind === 2) st.sunk++; if (s.kind === 3) st.raised++;
    if (s.kind === 4) {   // 挤裂：一刀切成两块，缝 1–2.5 厘米，第二块错位下沉 + 换个倾斜
      st.cracked++;
      const a = h3(i, j, 40) * Math.PI, nx = Math.cos(a), nz = Math.sin(a), d = i * nx + j * nz + (h3(i, j, 41) - 0.5) * 0.4, w = 0.006 + 0.008 * h3(i, j, 42);
      emit(clip(poly, nx, nz, d + w), s.e, s.tx, s.tz, i, j, uvf, tint, null);
      emit(clip(poly, -nx, -nz, -(d - w)), s.e - 0.012 - 0.02 * h3(i, j, 43), s.tx + (h3(i, j, 44) - 0.5) * 0.06, s.tz + (h3(i, j, 45) - 0.5) * 0.06, i, j, uvf, tint * 0.94, null);
    } else emit(poly, s.e, s.tx, s.tz, i, j, uvf, tint, tight);
  }
  const g = new THREE.BufferGeometry();
  const col = new Float32Array(nv * 3); for (let k = 0; k < nv; k++) { col[k * 3] = C[k]; col[k * 3 + 1] = C[k] * 0.995; col[k * 3 + 2] = C[k] * 0.985; }
  g.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(N.slice(0, nv * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U.slice(0, nv * 2), 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); st.verts = nv;
  return g;
}
