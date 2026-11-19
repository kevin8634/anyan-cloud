// 11-15 液体不规则岸线共用件（Rhett 02:13：液体、熔岩不要规则边缘）
//   blobXY(r, seed)：替代 CircleGeometry（同样在 XY 平面、法线 +Z，用法不变：rotation.x = -π/2 贴地）。
//     uv 为「归一化极坐标」：length(uv - 0.5) * 2 = 到岸比例（0 中心 → 1 岸），所以 waterUp 的 'radial' 岸边白沫、
//     radialFade 软边都照常贴着不规则岸线走。另带 edgeT 属性（同一个比例）。
//   iceSlab(r, h, seed)：冰湖冰盘（XZ 平面，顶面 + 侧裙），edgeT 给 iceUp 算冰边。
import * as THREE from 'three';
import { lavaOutline } from './forge_lava_hd';

function fan(pts: THREE.Vector2[], rings: number, plane: 'xy' | 'xz', y = 0) {
  const n = pts.length, pos: number[] = [], uv: number[] = [], et: number[] = [], idx: number[] = [];
  let rmax = 0; for (const p of pts) rmax = Math.max(rmax, p.length());
  const put = (x: number, z: number, t: number, a: number) => { if (plane === 'xy') pos.push(x, z, 0); else pos.push(x, y, z); uv.push(0.5 + 0.5 * t * Math.cos(a), 0.5 + 0.5 * t * Math.sin(a)); et.push(t); };
  put(0, 0, 0, 0);
  for (let j = 1; j <= rings; j++) { const t = j / rings; for (let i = 0; i < n; i++) { const p = pts[i], a = Math.atan2(p.y, p.x); put(p.x * t, p.y * t, t, a); } }
  const flip = plane === 'xz';   // XZ 平面要逆过来，法线朝 +Y
  const tri = (a: number, b: number, c: number) => flip ? idx.push(a, c, b) : idx.push(a, b, c);
  for (let i = 0; i < n; i++) tri(0, 1 + i, 1 + (i + 1) % n);
  for (let j = 1; j < rings; j++) { const a0 = 1 + (j - 1) * n, b0 = 1 + j * n; for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; tri(a0 + i, b0 + i, a0 + i1); tri(a0 + i1, b0 + i, b0 + i1); } }
  return { pos, uv, et, idx, rmax };
}
function build(f: { pos: number[]; uv: number[]; et: number[]; idx: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2)); g.setAttribute('edgeT', new THREE.Float32BufferAttribute(f.et, 1));
  g.setIndex(f.idx); g.computeVertexNormals(); return g;
}
/** CircleGeometry 的不规则替身（XY 平面） */
export function blobXY(r: number, seed: number, rings = 4, n = 64): THREE.BufferGeometry { return build(fan(lavaOutline(r, seed, n), rings, 'xy')); }
/** 冰盘：顶面（y = h/2）+ 侧裙到 −h/2，岸线外扩 3% 做下沿 */
export function iceSlab(r: number, h: number, seed: number, n = 72): THREE.BufferGeometry {
  const pts = lavaOutline(r, seed, n), f = fan(pts, 5, 'xz', h / 2), base = f.pos.length / 3, ringStart = 1 + 4 * n;
  for (let i = 0; i < n; i++) { const p = pts[i]; f.pos.push(p.x * 1.03, -h / 2, p.y * 1.03); f.uv.push(f.uv[(ringStart + i) * 2], f.uv[(ringStart + i) * 2 + 1]); f.et.push(1); }
  for (let i = 0; i < n; i++) { const i1 = (i + 1) % n, a = ringStart + i, b = ringStart + i1, c = base + i, d = base + i1; f.idx.push(a, d, c, a, b, d); }
  return build(f);
}
