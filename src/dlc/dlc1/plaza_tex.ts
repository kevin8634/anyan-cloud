// ======================================================================
// DLC1 镜渊城 · 倒钟广场地面（v1.2.48 待办 4）：程序化石板 / 鹅卵石贴图（底色 + 法线 + 粗糙度），零外部资产
//   全部用 canvas 现算（无缝平铺），同尺寸只算一次；低画质只要底色（不做法线）
// ======================================================================
import * as THREE from 'three';

export interface StoneSet { map: THREE.Texture; normal: THREE.Texture | null; rough: THREE.Texture | null }

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 可平铺的值噪声（周期 per 格），返回 S×S 的 0..1 数组 */
function tileNoise(S: number, per: number, oct = 3): Float32Array {
  const out = new Float32Array(S * S);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, per *= 2, amp *= 0.5) {
    const lat = new Float32Array(per * per); for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const cell = S / per; tot += amp;
    for (let y = 0; y < S; y++) {
      const fy = y / cell, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), y0 = yi % per, y1 = (yi + 1) % per;
      for (let x = 0; x < S; x++) {
        const fx = x / cell, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), x0 = xi % per, x1 = (xi + 1) % per;
        const a = lat[y0 * per + x0], b = lat[y0 * per + x1], c = lat[y1 * per + x0], d = lat[y1 * per + x1];
        out[y * S + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 高度图 → 切线空间法线贴图（无缝：取邻居时回绕） */
function normalFrom(h: Float32Array, S: number, k: number): ImageData {
  const img = new ImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = h[y * S + (x - 1 + S) % S], r = h[y * S + (x + 1) % S], u = h[((y - 1 + S) % S) * S + x], dn = h[((y + 1) % S) * S + x];
    let nx = (l - r) * k, ny = (dn - u) * k, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * S + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  return img;
}
function toTex(img: ImageData, srgb: boolean): THREE.Texture {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
}
function pack(S: number, h: Float32Array, col: Float32Array, rough: Float32Array, detail: boolean, nk: number): StoneSet {
  const ci = new ImageData(S, S), ri = new ImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    ci.data[i * 4] = Math.min(255, col[i * 3] * 255); ci.data[i * 4 + 1] = Math.min(255, col[i * 3 + 1] * 255); ci.data[i * 4 + 2] = Math.min(255, col[i * 3 + 2] * 255); ci.data[i * 4 + 3] = 255;
    const r = Math.min(255, rough[i] * 255); ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = r; ri.data[i * 4 + 3] = 255;
  }
  return { map: toTex(ci, true), normal: detail ? toTex(normalFrom(h, S, nk), false) : null, rough: detail ? toTex(ri, false) : null };
}

// 冷灰青石色板（和镜渊城青色雾气同调；略带一点暖褐避免发闷）
const SLAB = [[0.40, 0.39, 0.37], [0.35, 0.35, 0.34], [0.44, 0.42, 0.39], [0.32, 0.32, 0.31], [0.38, 0.38, 0.36], [0.42, 0.40, 0.36]];   // 偏暖中性灰：场景是青色冷光，底色再偏冷就发蓝发绿

/** 石板：错缝铺的不规则长方形石板，倒角 + 磨损 + 缝里的青苔 */
export function makeFlagstone(S: number, detail: boolean): StoneSet {
  seed = 4242;
  const rows = 6, gap = Math.max(2, Math.round(S / 340)), bev = Math.max(4, Math.round(S / 90));
  const hs: number[] = []; let acc = 0; for (let i = 0; i < rows; i++) { const v = 0.85 + rnd() * 0.3; hs.push(v); acc += v; }
  const bounds: number[] = [0]; for (let i = 0; i < rows; i++) bounds.push(Math.round(bounds[i] + hs[i] / acc * S)); bounds[rows] = S;
  const nz = tileNoise(S, 8, 4), fine = tileNoise(S, 64, 2), moss = tileNoise(S, 4, 3), pit = tileNoise(S, 128, 1);
  const h = new Float32Array(S * S), col = new Float32Array(S * S * 3), rough = new Float32Array(S * S);
  for (let r = 0; r < rows; r++) {
    const y0 = bounds[r], y1 = bounds[r + 1];
    // 本行切缝（从随机起点开始，回绕）
    const cuts: number[] = []; let x = Math.floor(rnd() * S); const start = x;
    while (x < start + S) { cuts.push(x % S); x += Math.round(S / 4.2 * (0.6 + rnd() * 0.8)); }
    cuts.sort((a, b) => a - b);
    const slabCol = cuts.map(() => { const k = 0.88 + rnd() * 0.24; return SLAB[Math.floor(rnd() * SLAB.length)].map(c => c * k); });
    const tilt = cuts.map(() => [(rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.12]);
    for (let xx = 0; xx < S; xx++) {
      let k = cuts.length - 1; for (let i = 0; i < cuts.length; i++) if (cuts[i] <= xx) k = i;
      const left = cuts[k], right = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + S;
      const xl = (xx - left + S) % S, xr = (right - xx + S) % S || S, dx = Math.min(xl, xr), w = (right - left + S) % S || S;
      for (let y = y0; y < y1; y++) {
        const dy = Math.min(y - y0, y1 - y), d = Math.min(dx, dy), i = y * S + xx;
        const n = nz[i], f = fine[i];
        const wear = 0.25 * sstep(0.62, 0.8, n);   // 磨圆的角
        const e = sstep(gap, gap + bev * (1 + wear * 3), d);
        const tl = tilt[k], u = xl / w - 0.5, v = (y - y0) / (y1 - y0) - 0.5;
        if (d < gap) {   // 缝：深色土 + 青苔
          h[i] = 0.05 + f * 0.05;
          const m = sstep(0.45, 0.7, moss[i]);
          col.set([0.10 + 0.05 * m, 0.12 + 0.10 * m, 0.11 + 0.08 * m], i * 3); rough[i] = 1;
        } else {
          h[i] = 0.25 + 0.6 * e + (n - 0.5) * 0.3 + (f - 0.5) * 0.16 + (pit[i] < 0.18 ? -0.08 : 0) + tl[0] * u + tl[1] * v + tl[2];
          const c = slabCol[k], shade = (0.7 + 0.45 * n) * (0.7 + 0.3 * e) * (0.85 + 0.3 * f) * (pit[i] < 0.18 ? 0.8 : 1);
          const m = sstep(0.62, 0.8, moss[i]) * (1 - e) * 0.6;   // 边上爬一点青苔
          col.set([c[0] * shade * (1 - m * 0.5), c[1] * shade * (1 - m * 0.2), c[2] * shade * (1 - m * 0.35)], i * 3);
          rough[i] = 0.7 + 0.25 * (1 - e) + (f - 0.5) * 0.1;
        }
      }
    }
  }
  return pack(S, h, col, rough, detail, S / 40);
}

/** 鹅卵石：抖动网格 Voronoi，圆顶高度 + 缝 */
export function makeCobble(S: number, detail: boolean): StoneSet {
  seed = 9191;
  const G = 14, cell = S / G, pts: [number, number][] = [], cc: number[][] = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) { pts.push([(gx + 0.15 + rnd() * 0.7) * cell, (gy + 0.15 + rnd() * 0.7) * cell]); const b = SLAB[Math.floor(rnd() * SLAB.length)]; const k = 0.75 + rnd() * 0.4; cc.push([b[0] * k * 1.02, b[1] * k, b[2] * k * 0.96]); }
  const nz = tileNoise(S, 16, 3), fine = tileNoise(S, 64, 2);
  const h = new Float32Array(S * S), col = new Float32Array(S * S * 3), rough = new Float32Array(S * S);
  const gap = cell * 0.07;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell); let f1 = 1e9, f2 = 1e9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = (gx + ox + G) % G, cy = (gy + oy + G) % G, p = pts[cy * G + cx];
      const px = p[0] + (gx + ox - cx) * cell + (gx + ox < 0 ? 0 : 0), py = p[1] + (gy + oy - cy) * cell;
      const d = Math.hypot(x - px, y - py);
      if (d < f1) { f2 = f1; f1 = d; id = cy * G + cx; } else if (d < f2) f2 = d;
    }
    const i = y * S + x, edge = (f2 - f1) / 2, n = nz[i], f = fine[i];
    if (edge < gap) { h[i] = 0.05 + f * 0.05; col.set([0.09, 0.11, 0.10], i * 3); rough[i] = 1; continue; }
    const r = cell * 0.62, dome = Math.sqrt(Math.max(0, 1 - Math.pow(f1 / r, 2))), e = sstep(gap, gap + cell * 0.18, edge);
    h[i] = 0.2 + 0.7 * Math.min(dome, e) + (f - 0.5) * 0.06;
    const c = cc[id], shade = (0.7 + 0.35 * dome) * (0.85 + 0.25 * n) * (0.94 + 0.12 * f);
    col.set([c[0] * shade, c[1] * shade, c[2] * shade], i * 3);
    rough[i] = 0.6 + 0.3 * (1 - dome);
  }
  return pack(S, h, col, rough, detail, S / 48);
}

// 深色湿板岩色板（海底：冷青灰，比 SLAB 暗得多；水下焦散 / 积水高光叠在上面才出效果）
// 第二轮：深灰黑湿板岩（概念图：近黑底 + 高对比焦散 / 高光），每块明暗差拉大
const SLATE = [[0.085, 0.09, 0.095], [0.065, 0.07, 0.075], [0.105, 0.105, 0.105], [0.055, 0.06, 0.065], [0.095, 0.09, 0.085], [0.075, 0.08, 0.09], [0.12, 0.118, 0.112]];
/** 海底板岩方砖：N×N 方砖，砖缝积水（低粗糙度），每块微倾斜 + 缺角 + 裂缝，少数碎成几块；板岩层理细纹 */
export function makeSlate(S: number, detail: boolean, N = 5): StoneSet {
  seed = 5151;
  const cell = S / N, gap = Math.max(2, Math.round(S / 300)), bev = Math.max(3, Math.round(S / 160));
  const nz = tileNoise(S, 8, 4), fine = tileNoise(S, 96, 2), streak = tileNoise(S, 32, 3), moss = tileNoise(S, 4, 3), sandN = tileNoise(S, 4, 3);
  const gapN = tileNoise(S, 20, 2), chipN = tileNoise(S, 40, 2);   // 第四轮：砖缝宽度不规则、砖边崩口
  const h = new Float32Array(S * S), col = new Float32Array(S * S * 3), rough = new Float32Array(S * S);
  type Tile = { c: number[]; tilt: number[]; segs: number[][]; hair: number[][]; split: number[] | null; chip: number[]; lift: number };
  const tiles: Tile[] = [];
  for (let t = 0; t < N * N; t++) {
    const k = 0.7 + rnd() * 0.65, c = SLATE[Math.floor(rnd() * SLATE.length)].map(v => v * k);
    const segs: number[][] = [];
    if (rnd() < 0.55) {   // 裂缝：从一条边走到另一条边的折线
      let x = rnd() < 0.5 ? 0 : rnd(), y = x === 0 ? rnd() : 0; const ang = Math.atan2(0.5 - y, 0.5 - x) + (rnd() - 0.5) * 0.9;
      for (let s = 0; s < 6; s++) { const L = 0.12 + rnd() * 0.12, a = ang + (rnd() - 0.5) * 1.1; const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L; segs.push([x, y, nx, ny]); x = nx; y = ny; if (x < 0 || y < 0 || x > 1 || y > 1) break;
        if (rnd() < 0.25) { const b = a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6); segs.push([x, y, x + Math.cos(b) * L * 0.8, y + Math.sin(b) * L * 0.8]); } }
    }
    const split = rnd() < 0.18 ? [rnd() * 0.6 + 0.2, rnd() * 0.6 + 0.2, rnd() * Math.PI] : null;   // 碎砖：一条贯穿的宽缝把砖分成两块，各自倾斜
    const hair: number[][] = [];   // 第四轮：细裂（短折线，发丝宽）
    for (let hN = rnd() < 0.75 ? 1 + Math.floor(rnd() * 3) : 0; hN > 0; hN--) { let hx = 0.1 + rnd() * 0.8, hy = 0.1 + rnd() * 0.8, ha = rnd() * 6.283; for (let s2 = 0; s2 < 4; s2++) { const L = 0.05 + rnd() * 0.08; ha += (rnd() - 0.5) * 1.2; const nx2 = hx + Math.cos(ha) * L, ny2 = hy + Math.sin(ha) * L; hair.push([hx, hy, nx2, ny2]); hx = nx2; hy = ny2; } }
    tiles.push({ hair, c, tilt: [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3], segs, split, chip: [Math.floor(rnd() * 4), rnd() < 0.45 ? 0.08 + rnd() * 0.14 : 0], lift: (rnd() - 0.5) * 0.12 });
  }
  const segD = (px: number, py: number, s: number[]) => { const dx = s[2] - s[0], dy = s[3] - s[1], L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / L)); return Math.hypot(px - s[0] - t * dx, py - s[1] - t * dy); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell), T = tiles[gy * N + gx];
    const u = (x - gx * cell) / cell, v = (y - gy * cell) / cell, i = y * S + x, n = nz[i], f = fine[i];
    const jag = (n - 0.5) * cell * 0.05;   // 砖边不直
    let d = Math.min(x - gx * cell, (gx + 1) * cell - x, y - gy * cell, (gy + 1) * cell - y) + jag;
    // 缺角
    if (T.chip[1] > 0) { const cx = T.chip[0] & 1, cy = T.chip[0] >> 1; const dc = Math.abs(u - cx) + Math.abs(v - cy); d = Math.min(d, (dc - T.chip[1]) * cell * 0.7 + jag); }
    let side = 1, tl = T.tilt;
    if (T.split) { const [sx, sy, a] = T.split, s = (u - sx) * Math.sin(a) - (v - sy) * Math.cos(a); d = Math.min(d, Math.abs(s) * cell - gap * 0.6 + jag * 0.6); side = s > 0 ? 1 : -1; if (side < 0) tl = [-tl[1], tl[0]]; }
    let crack = 1e9; for (const s of T.segs) crack = Math.min(crack, segD(u, v, s));
    crack *= cell;
    const gw = gap * (0.5 + 1.1 * gapN[i]);   // 砖缝宽度沿缝变化
    const sd = sandN[i], sgap = gw * (1 + 2.2 * sstep(0.6, 0.8, sd));   // 沙淤积的地方砖缝更宽，填满浅灰褐细沙
    if (d < sgap && sd > 0.6) {   // 第四轮：只在少数淤积处，沙色压暗（之前比砖面亮 4 倍 → 一条条亮线）
      const rp = 0.5 + 0.5 * Math.sin((x * 0.83 + y * 0.55) / S * Math.PI * 2 * 22 + n * 9);
      h[i] = 0.12 + rp * 0.05 + f * 0.03; const k2 = 0.85 + 0.2 * rp + 0.1 * f;
      col.set([0.17 * k2, 0.155 * k2, 0.13 * k2], i * 3); rough[i] = 0.9; continue;
    }
    if (d < gw) {   // 砖缝：深色泥 + 一点青苔（第四轮：粗糙度提高，不再反成一条条亮线）
      const m = sstep(0.45, 0.7, moss[i]);
      h[i] = 0.04 + f * 0.04; col.set([0.035 + 0.02 * m, 0.04 + 0.035 * m, 0.04 + 0.025 * m], i * 3); rough[i] = 0.6 + 0.25 * m; continue;
    }
    const e = sstep(gw, gw + bev * (1 + sstep(0.6, 0.85, n) * 2), d);
    const chipK = sstep(0.62, 0.74, chipN[i]) * (1 - sstep(gw + bev * 0.8, gw + bev * 3.2, d));   // 砖边崩口
    let hd = 1e9; for (const s of T.hair) hd = Math.min(hd, segD(u, v, s)); hd *= cell;
    const hk = hd < 0.7 ? (1 - hd / 0.7) * 0.7 : 0;
    const cw = 0.9 + f * 1.2, ck = crack < cw ? 1 - crack / cw : 0;
    const st = (streak[i] - 0.5);   // 板岩层理
    h[i] = 0.3 + 0.55 * e * (1 - chipK * 0.7) + (n - 0.5) * 0.18 + (f - 0.5) * 0.08 + st * 0.06 + tl[0] * (u - 0.5) + tl[1] * (v - 0.5) + T.lift + (side < 0 ? -0.05 : 0) - ck * 0.35 - hk * 0.12 - chipK * 0.2;
    const c = T.c, shade = (0.65 + 0.6 * n) * (0.7 + 0.3 * e) * (0.9 + 0.2 * f) * (1 + st * 0.25) * (1 - ck * 0.6) * (1 - hk * 0.45) * (1 - chipK * 0.3);
    const m = sstep(0.66, 0.82, moss[i]) * (1 - e) * 0.5;
    col.set([c[0] * shade * (1 - m * 0.5), c[1] * shade * (1 - m * 0.15), c[2] * shade * (1 - m * 0.3)], i * 3);
    rough[i] = 0.4 + 0.4 * sstep(0.4, 0.8, n) + (f - 0.5) * 0.15 - ck * 0.2 + chipK * 0.3;   // 湿板岩：整体偏光滑，干斑粗一点
  }
  return pack(S, h, col, rough, detail, S / 36);
}
