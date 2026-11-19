// v1.2.55 浏览器端减面（导入本地 GLB 的游戏版用）：与服务端 cloud/forge-fc/glbslim.js decimateGlb 同一套规则
// 只减三角面、不新建顶点（边界 / UV 接缝顶点由简化器锁住，贴图不错位），丢掉没用到的顶点后重排 bufferView。
// 只处理「三角形 + 有索引 + 浮点坐标」；其他情况原样返回（info.skip 写原因），出错原样返回，绝不拖垮导入。
// 简化器：meshoptimizer（MIT，src/dlc/dlc1/vendor/meshopt_simplifier.js，内嵌 WASM，约 16 KB）
import { parseGlb, buildGlb } from './glbslim_web';

type Acc = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[]; sparse?: unknown };
type View = { buffer?: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number };
type Prim = { attributes: Record<string, number>; indices?: number; mode?: number; targets?: unknown };
type J = { accessors: Acc[]; bufferViews: View[]; meshes?: { primitives?: Prim[] }[]; images?: { bufferView?: number }[]; buffers?: { byteLength: number }[] };
type Simp = { ready: Promise<void>; simplify(ind: Uint32Array, pos: Float32Array, stride: number, target: number, err: number): [Uint32Array, number] };
let _S: Simp | null = null;   // 懒加载（node 端 core 测试编译到 dist 时不带 vendor 的 js，不能在模块顶层 require）
async function simp(): Promise<Simp> {
  if (_S) return _S;
  type M = { MeshoptSimplifier?: Simp; default?: M; simplify?: unknown };
  let m: M | undefined = await import('./vendor/meshopt_simplifier.js') as unknown as M;
  for (let i = 0; i < 3 && m && !m.MeshoptSimplifier && !m.simplify; i++) m = m.default;   // esbuild / tsc 包 CJS 的层数不同；CJS 下 module.exports 就是简化器本身
  const r = (m?.MeshoptSimplifier ?? (m?.simplify ? m : null)) as Simp | null;
  if (!r) throw new Error('减面库没有加载');
  return (_S = r);
}

export const GAME_FACES_WEB = 6000;   // 与服务端 GAME_FACES 默认值一致
export type DecInfo = { trisBefore: number; trisAfter: number; vertsBefore: number; vertsAfter: number; before: number; after: number; ms: number; skip?: string; error?: string };
type TA = Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array;
const COMP: Record<number, [new (n: number) => TA, number]> = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAcc(json: J, bin: Uint8Array, ai: number) {
  const a = json.accessors[ai], v = json.bufferViews[a.bufferView!], [T, sz] = COMP[a.componentType], n = NCOMP[a.type];
  if (a.sparse) throw new Error('不支持稀疏访问器');
  const stride = v.byteStride || n * sz, base = (v.byteOffset || 0) + (a.byteOffset || 0), out = new T(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const rd: (o: number) => number = ({ 5120: (o: number) => dv.getInt8(o), 5121: (o: number) => dv.getUint8(o), 5122: (o: number) => dv.getInt16(o, true), 5123: (o: number) => dv.getUint16(o, true), 5125: (o: number) => dv.getUint32(o, true), 5126: (o: number) => dv.getFloat32(o, true) } as Record<number, (o: number) => number>)[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = rd(base + i * stride + k * sz);
  return { a, out, n, T };
}
export async function decimateGlbWeb(src: ArrayBuffer, o: { targetTris?: number; maxError?: number } = {}): Promise<{ buf: ArrayBuffer; info: DecInfo }> {
  const target = Math.max(500, o.targetTris || GAME_FACES_WEB), t0 = performance.now();
  const info: DecInfo = { before: src.byteLength, after: src.byteLength, trisBefore: 0, trisAfter: 0, vertsBefore: 0, vertsAfter: 0, ms: 0 };
  const fin = () => { info.ms = Math.round(performance.now() - t0); return { buf: src, info }; };
  try {
    const { json: j0, bin } = parseGlb(src); const json = j0 as unknown as J;
    const prims: Prim[] = []; for (const m of json.meshes || []) for (const p of m.primitives || []) prims.push(p);
    for (const p of prims) { info.trisBefore += p.indices !== undefined ? json.accessors[p.indices].count / 3 : 0; info.vertsBefore += json.accessors[p.attributes.POSITION].count; }
    info.trisAfter = info.trisBefore; info.vertsAfter = info.vertsBefore;
    if (info.trisBefore <= target) { info.skip = `面数 ${info.trisBefore} 不超过 ${target}，不减`; return fin(); }
    if (prims.some(p => (p.mode !== undefined && p.mode !== 4) || p.indices === undefined || p.targets)) { info.skip = '图元不是带索引的三角形（或有变形目标），不减'; return fin(); }
    const S = await simp(); await S.ready;
    const ratio = target / info.trisBefore, views = json.bufferViews, newData = new Map<number, Uint8Array>(), used = new Set<number>(); let trisA = 0, vertsA = 0;
    for (const p of prims) {
      const idx = readAcc(json, bin, p.indices!), pos = readAcc(json, bin, p.attributes.POSITION);
      if (!(pos.out instanceof Float32Array)) throw new Error('顶点坐标不是浮点（量化过），不减');
      const ind = Uint32Array.from(idx.out as ArrayLike<number>), want = Math.max(3, Math.floor(ind.length * ratio / 3) * 3);
      const [res] = S.simplify(ind, pos.out, 3, want, o.maxError || 0.02);
      const remap = new Int32Array(pos.a.count).fill(-1); let nv = 0; for (let i = 0; i < res.length; i++) if (remap[res[i]] < 0) remap[res[i]] = nv++;
      for (const ai of Object.values(p.attributes)) {
        if (used.has(ai)) throw new Error('属性被多个图元共用，不减');
        used.add(ai); const A = readAcc(json, bin, ai), out = new A.T(nv * A.n);
        for (let v = 0; v < A.a.count; v++) if (remap[v] >= 0) for (let k = 0; k < A.n; k++) out[remap[v] * A.n + k] = A.out[v * A.n + k];
        const vi = views.length; views.push({ buffer: 0, byteLength: out.byteLength, target: 34962 }); newData.set(vi, new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
        Object.assign(A.a, { bufferView: vi, byteOffset: 0, count: nv });
        if (A.a.min && A.a.max) { const mn = new Array(A.n).fill(Infinity), mx = new Array(A.n).fill(-Infinity); for (let v = 0; v < nv; v++) for (let k = 0; k < A.n; k++) { const x = out[v * A.n + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; } A.a.min = mn; A.a.max = mx; }
      }
      const ni = nv < 65536 ? new Uint16Array(res.length) : new Uint32Array(res.length); for (let i = 0; i < res.length; i++) ni[i] = remap[res[i]];
      const vi = views.length; views.push({ buffer: 0, byteLength: ni.byteLength, target: 34963 }); newData.set(vi, new Uint8Array(ni.buffer, ni.byteOffset, ni.byteLength));
      const ia = json.accessors[p.indices!]; Object.assign(ia, { bufferView: vi, byteOffset: 0, count: res.length, componentType: nv < 65536 ? 5123 : 5125 }); delete ia.min; delete ia.max;
      trisA += res.length / 3; vertsA += nv;
    }
    const ref = new Set<number>(); for (const a of json.accessors) if (a.bufferView !== undefined) ref.add(a.bufferView); for (const im of json.images || []) if (im.bufferView !== undefined) ref.add(im.bufferView);
    const keep: View[] = [], map = new Map<number, number>(), parts: Uint8Array[] = []; let off = 0;
    views.forEach((v, i) => { if (!ref.has(i)) return; const d = newData.get(i) ?? bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; }
      map.set(i, keep.length); const nvw: View = { ...v, byteOffset: off, byteLength: d.length }; if (newData.has(i)) delete nvw.byteStride; keep.push(nvw); parts.push(d); off += d.length; });
    json.bufferViews = keep; for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = map.get(a.bufferView); for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = map.get(im.bufferView);
    const nb = new Uint8Array(off); { let q = 0; for (const p of parts) { nb.set(p, q); q += p.length; } }
    if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = nb.length;
    const buf = buildGlb(json as unknown as Parameters<typeof buildGlb>[0], nb);
    Object.assign(info, { after: buf.byteLength, trisAfter: trisA, vertsAfter: vertsA });
    info.ms = Math.round(performance.now() - t0); return { buf, info };
  } catch (e) { info.error = (e as Error).message; return fin(); }
}
