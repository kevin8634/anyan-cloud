// ========== v0.9.5a 野外地图迷雾 ==========
// 每张野外图（翠风 + 4 张大野外）按 6 米一格记「走过 / 看过」：
//   玩家身边 20 米每秒点亮；登瞭望塔点亮塔周围 60 米；激活路边传送石点亮 25 米；老存档按已登的塔 / 已开通的营地补点亮
// 区域详图（M）上没点亮的地方盖一层羊皮纸迷雾，图标也藏在下面；世界总览显示每张图的探索度
// 探索度只按「能走到的格子」算（导航网格空地），25 / 50 / 75 / 95% 各给一次经验 + 声望
// 存档：位压缩成 base64，跟 ex 存档走（ExSave.fog）
export const FOG_CELL = 6, FOG_R = { walk: 20, tower: 60, stone: 25, camp: 30 } as const;
export const FOG_MILESTONES = [25, 50, 75, 95] as const;

export interface FogGrid { map: string; x0: number; z0: number; n: number; seen: Uint8Array; walk: Uint8Array | null; total: number }
const grids: Record<string, FogGrid> = {};
const saved: Record<string, string> = {};          // 还没生成网格的图：先存着原始串
let marks: Record<string, number[]> = {};          // 已领过的里程碑
let pctCache: Record<string, number> = {};         // 本次还没生成网格的图：读档时带来的探索度

export function fogGrid(map: string, cx: number, cz: number, half: number): FogGrid {
  let g = grids[map];
  if (!g) {
    const n = Math.ceil(half * 2 / FOG_CELL);
    g = grids[map] = { map, x0: cx - half, z0: cz - half, n, seen: new Uint8Array(n * n), walk: null, total: n * n };
    if (saved[map]) { unpack(saved[map], g.seen); delete saved[map]; }
  }
  return g;
}
export const fogHas = (map: string) => !!grids[map];
export const fogGet = (map: string) => grids[map] as FogGrid | undefined;

/** 可走格子（导航网格空地）：探索度的分母。没有导航网格时全算 */
export function fogSetWalk(map: string, free: (x: number, z: number) => boolean) {
  const g = grids[map]; if (!g || g.walk) return;
  const w = new Uint8Array(g.n * g.n); let t = 0;
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    const x = g.x0 + (i + 0.5) * FOG_CELL, z = g.z0 + (j + 0.5) * FOG_CELL;
    const ok = free(x, z) || free(x - 2, z - 2) || free(x + 2, z - 2) || free(x - 2, z + 2) || free(x + 2, z + 2);
    if (ok) { w[j * g.n + i] = 1; t++; }
  }
  g.walk = w; g.total = Math.max(1, t);
}

/** 点亮半径 r 内的格子，返回新点亮的数量 */
export function fogReveal(map: string, x: number, z: number, r: number): number {
  const g = grids[map]; if (!g) return 0;
  const i0 = Math.max(0, Math.floor((x - r - g.x0) / FOG_CELL)), i1 = Math.min(g.n - 1, Math.floor((x + r - g.x0) / FOG_CELL));
  const j0 = Math.max(0, Math.floor((z - r - g.z0) / FOG_CELL)), j1 = Math.min(g.n - 1, Math.floor((z + r - g.z0) / FOG_CELL));
  let k = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = g.x0 + (i + 0.5) * FOG_CELL, cz = g.z0 + (j + 0.5) * FOG_CELL;
    if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
    const id = j * g.n + i; if (!g.seen[id]) { g.seen[id] = 1; k++; }
  }
  return k;
}
export function fogSeenAt(map: string, x: number, z: number): boolean {
  const g = grids[map]; if (!g) return true;
  const i = Math.floor((x - g.x0) / FOG_CELL), j = Math.floor((z - g.z0) / FOG_CELL);
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return true;
  // 边上一格也算（图标压在迷雾边缘时不至于整个藏起来）
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < g.n && b < g.n && g.seen[b * g.n + a] && (di === 0 && dj === 0 || Math.abs(di) + Math.abs(dj) === 1)) return true; }
  return false;
}
/** 探索度 0..100（只算能走到的格子） */
export function fogPct(map: string): number | null {
  const g = grids[map];
  if (!g) return pctCache[map] ?? null;
  let k = 0;
  if (g.walk) { for (let i = 0; i < g.seen.length; i++) if (g.seen[i] && g.walk[i]) k++; }
  else for (let i = 0; i < g.seen.length; i++) if (g.seen[i]) k++;
  return Math.min(100, Math.round(k / g.total * 100));
}
/** 新跨过的里程碑（调用方发奖励） */
export function fogNewMilestones(map: string): number[] {
  const p = fogPct(map); if (p === null) return [];
  const got = marks[map] ?? (marks[map] = []);
  const out = FOG_MILESTONES.filter(m => p >= m && !got.includes(m));
  got.push(...out); return out;
}

// ---------------------------------------------------------------- 存档
function pack(a: Uint8Array): string {
  const b = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) b[i >> 3] |= 1 << (i & 7);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return typeof btoa === 'function' ? btoa(s) : (globalThis as any).Buffer.from(s, 'binary').toString('base64');
}
function unpack(str: string, out: Uint8Array) {
  try {
    const s = typeof atob === 'function' ? atob(str) : (globalThis as any).Buffer.from(str, 'base64').toString('binary');
    for (let i = 0; i < out.length; i++) { const byte = s.charCodeAt(i >> 3) || 0; out[i] = (byte >> (i & 7)) & 1; }
  } catch { /* 坏数据：当没探索过 */ }
}
export interface FogSave { cells: Record<string, string>; marks: Record<string, number[]>; pct?: Record<string, number> }
export function fogSave(): FogSave {
  const cells: Record<string, string> = { ...saved };
  for (const [m, g] of Object.entries(grids)) cells[m] = pack(g.seen);
  const pct: Record<string, number> = { ...pctCache }; for (const m of Object.keys(grids)) pct[m] = fogPct(m) ?? 0;
  return { cells, marks: JSON.parse(JSON.stringify(marks)), pct };
}
export function fogLoad(s?: Partial<FogSave>) {
  for (const k of Object.keys(saved)) delete saved[k];
  Object.assign(saved, s?.cells ?? {});
  marks = JSON.parse(JSON.stringify(s?.marks ?? {})); pctCache = { ...(s?.pct ?? {}) };
  for (const g of Object.values(grids)) { g.seen.fill(0); if (saved[g.map]) { unpack(saved[g.map], g.seen); delete saved[g.map]; } }
}
/** 测试：清空网格（换角色时 fogLoad 已经清掉 seen） */
export function fogDebug(map: string) { const g = grids[map]; return g ? { n: g.n, total: g.total, pct: fogPct(map), seen: g.seen.reduce((a, b) => a + b, 0), marks: marks[map] ?? [] } : null; }

// ---------------------------------------------------------------- 画迷雾（区域详图）
let fogCv: HTMLCanvasElement | null = null;
/** X/Z：世界坐标 → 画布坐标；sc：每米像素 */
export function drawFog(g: CanvasRenderingContext2D, map: string, X: (x: number) => number, Z: (z: number) => number, sc: number, rect: { x: number; y: number; w: number; h: number }) {
  const fg = grids[map]; if (!fg || typeof document === 'undefined') return;
  const W = Math.max(1, Math.ceil(rect.w)), H = Math.max(1, Math.ceil(rect.h));
  fogCv ??= document.createElement('canvas');
  if (fogCv.width !== W || fogCv.height !== H) { fogCv.width = W; fogCv.height = H; }
  const f = fogCv.getContext('2d'); if (!f) return;
  f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, W, H);
  // 羊皮纸迷雾：暖灰底 + 几道淡淡的云纹
  const grd = f.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#b9a684'); grd.addColorStop(0.5, '#a8946f'); grd.addColorStop(1, '#bba987');
  f.fillStyle = grd; f.fillRect(0, 0, W, H);
  f.strokeStyle = 'rgba(255,245,220,.18)'; f.lineWidth = 2;
  for (let k = 0; k < 14; k++) { const y = (k + 0.5) * H / 14; f.beginPath(); for (let x = 0; x <= W; x += 16) { const yy = y + Math.sin(x * 0.025 + k * 1.7) * 6; x ? f.lineTo(x, yy) : f.moveTo(x, yy); } f.stroke(); }
  // 挖洞：每个点亮的格子画一个软边圆
  f.globalCompositeOperation = 'destination-out';
  const cellPx = FOG_CELL * sc, rr = cellPx * 1.25;
  for (let j = 0; j < fg.n; j++) for (let i = 0; i < fg.n; i++) {
    if (!fg.seen[j * fg.n + i]) continue;
    const px = X(fg.x0 + (i + 0.5) * FOG_CELL) - rect.x, py = Z(fg.z0 + (j + 0.5) * FOG_CELL) - rect.y;
    const r = f.createRadialGradient(px, py, rr * 0.35, px, py, rr);
    r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = r; f.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  f.globalCompositeOperation = 'source-over';
  g.save(); g.globalAlpha = 0.96; g.drawImage(fogCv, rect.x, rect.y); g.restore();
}
