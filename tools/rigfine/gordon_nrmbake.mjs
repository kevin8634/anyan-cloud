// raidA 11-01：高模 → 低模 切线空间法线贴图烘焙（零积分，纯 JS 射线投射 + BVH，2 线程）。
// 低模每个三角在 UV 空间光栅化；每个纹素沿低模插值法线正反两向投射，取最近且朝向一致的高模交点，
// 用高模插值法线换到低模切线空间（TANGENT 用 meshopt generateTangents 生成并写入低模，three.js 用 bitangent = cross(N,T)*w，烘焙与之一致）。
// UV 接缝外做 16px 膨胀 padding。输出：带 TANGENT + normalTexture 的低模 glb，以及法线图 png。
// 用法：node tools/rigfine/gordon_nrmbake.mjs 高模.glb 低模.glb 输出.glb [--size 2048] [--dist 0.012(身高比例)]
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

function buildBVH(P, I) {
  const nT = I.length / 3, cen = new Float32Array(nT * 3), tmn = new Float32Array(nT * 3), tmx = new Float32Array(nT * 3);
  for (let t = 0; t < nT; t++) for (let r = 0; r < 3; r++) { const a = P[I[t*3]*3+r], b = P[I[t*3+1]*3+r], c = P[I[t*3+2]*3+r]; tmn[t*3+r] = Math.min(a,b,c); tmx[t*3+r] = Math.max(a,b,c); cen[t*3+r] = (a+b+c)/3; }
  const order = new Uint32Array(nT); for (let i = 0; i < nT; i++) order[i] = i;
  const maxN = nT * 2; const bmn = new Float32Array(maxN*3), bmx = new Float32Array(maxN*3), left = new Int32Array(maxN), start = new Uint32Array(maxN), cnt = new Uint32Array(maxN);
  let nN = 0; const stack = [[0, nT, nN++]];
  while (stack.length) {
    const [s, e, id] = stack.pop();
    let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9], cmn = [1e9,1e9,1e9], cmx = [-1e9,-1e9,-1e9];
    for (let i = s; i < e; i++) { const t = order[i]; for (let r = 0; r < 3; r++) { mn[r] = Math.min(mn[r], tmn[t*3+r]); mx[r] = Math.max(mx[r], tmx[t*3+r]); cmn[r] = Math.min(cmn[r], cen[t*3+r]); cmx[r] = Math.max(cmx[r], cen[t*3+r]); } }
    for (let r = 0; r < 3; r++) { bmn[id*3+r] = mn[r]; bmx[id*3+r] = mx[r]; }
    if (e - s <= 4) { left[id] = -1; start[id] = s; cnt[id] = e - s; continue; }
    let ax = 0; for (let r = 1; r < 3; r++) if (cmx[r]-cmn[r] > cmx[ax]-cmn[ax]) ax = r;
    const sub = Array.from(order.subarray(s, e)).sort((a, b) => cen[a*3+ax] - cen[b*3+ax]); order.set(sub, s);
    const m = (s + e) >> 1; const l = nN++, rr = nN++; left[id] = l;
    stack.push([s, m, l], [m, e, rr]);
  }
  return { bmn, bmx, left, start, cnt, order };
}
// 射线最近交点：返回 [t, tri, u, v] 或 null（Möller–Trumbore，双面）
function makeTracer(P, I, B) {
  const st = new Int32Array(128);
  return (ox, oy, oz, dx, dy, dz, tmax) => {
    const ix = 1/dx, iy = 1/dy, iz = 1/dz; let best = tmax, bt = -1, bu = 0, bv = 0, sp = 0; st[sp++] = 0;
    while (sp) {
      const n = st[--sp];
      let t0 = (B.bmn[n*3]-ox)*ix, t1 = (B.bmx[n*3]-ox)*ix; let lo = Math.min(t0,t1), hi = Math.max(t0,t1);
      t0 = (B.bmn[n*3+1]-oy)*iy; t1 = (B.bmx[n*3+1]-oy)*iy; lo = Math.max(lo, Math.min(t0,t1)); hi = Math.min(hi, Math.max(t0,t1));
      t0 = (B.bmn[n*3+2]-oz)*iz; t1 = (B.bmx[n*3+2]-oz)*iz; lo = Math.max(lo, Math.min(t0,t1)); hi = Math.min(hi, Math.max(t0,t1));
      if (hi < Math.max(lo, 0) || lo > best) continue;
      if (B.left[n] >= 0) { st[sp++] = B.left[n]; st[sp++] = B.left[n] + 1; continue; }
      for (let k = B.start[n], e = k + B.cnt[n]; k < e; k++) {
        const t = B.order[k], a = I[t*3]*3, b = I[t*3+1]*3, c = I[t*3+2]*3;
        const e1x = P[b]-P[a], e1y = P[b+1]-P[a+1], e1z = P[b+2]-P[a+2], e2x = P[c]-P[a], e2y = P[c+1]-P[a+1], e2z = P[c+2]-P[a+2];
        const px = dy*e2z-dz*e2y, py = dz*e2x-dx*e2z, pz = dx*e2y-dy*e2x; const det = e1x*px+e1y*py+e1z*pz; if (Math.abs(det) < 1e-14) continue;
        const inv = 1/det, sx = ox-P[a], sy = oy-P[a+1], sz = oz-P[a+2]; const u = (sx*px+sy*py+sz*pz)*inv; if (u < -1e-6 || u > 1+1e-6) continue;
        const qx = sy*e1z-sz*e1y, qy = sz*e1x-sx*e1z, qz = sx*e1y-sy*e1x; const v = (dx*qx+dy*qy+dz*qz)*inv; if (v < -1e-6 || u+v > 1+1e-6) continue;
        const tt = (e2x*qx+e2y*qy+e2z*qz)*inv; if (tt > 0 && tt < best) { best = tt; bt = t; bu = u; bv = v; }
      }
    }
    return bt < 0 ? null : [best, bt, bu, bv];
  };
}

if (!isMainThread) {
  const { HP, HN, HI, LP, LN, LT, LU, LI, size, dist, t0, t1 } = workerData;
  const B = buildBVH(HP, HI), trace = makeTracer(HP, HI, B);
  const out = new Float32Array(size * size * 3), mask = new Uint8Array(size * size); let miss = 0, hit = 0;
  const hn = (r) => { const [, t, u, v] = r; const a = HI[t*3]*3, b = HI[t*3+1]*3, c = HI[t*3+2]*3, w = 1-u-v; let x = HN[a]*w+HN[b]*u+HN[c]*v, y = HN[a+1]*w+HN[b+1]*u+HN[c+1]*v, z = HN[a+2]*w+HN[b+2]*u+HN[c+2]*v; const l = Math.hypot(x,y,z)||1; return [x/l,y/l,z/l]; };
  for (let t = t0; t < t1; t++) {
    const v = [LI[t*3], LI[t*3+1], LI[t*3+2]]; const uv = v.map(k => [LU[k*2]*size - 0.5, LU[k*2+1]*size - 0.5]);
    const x0 = Math.max(0, Math.floor(Math.min(uv[0][0],uv[1][0],uv[2][0]))), x1 = Math.min(size-1, Math.ceil(Math.max(uv[0][0],uv[1][0],uv[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(uv[0][1],uv[1][1],uv[2][1]))), y1 = Math.min(size-1, Math.ceil(Math.max(uv[0][1],uv[1][1],uv[2][1])));
    const den = (uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0]) + (uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1]); if (Math.abs(den) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let a = ((uv[1][1]-uv[2][1])*(x-uv[2][0]) + (uv[2][0]-uv[1][0])*(y-uv[2][1])) / den, b = ((uv[2][1]-uv[0][1])*(x-uv[2][0]) + (uv[0][0]-uv[2][0])*(y-uv[2][1])) / den, c = 1-a-b;
      const eps = -1e-4; if (a < eps || b < eps || c < eps) continue;
      const pix = y*size+x; if (mask[pix]) continue;
      const W = [a,b,c]; const L = (A, k) => W.reduce((s, w, i) => s + A[v[i]*k] * w, 0);
      const p = [0,1,2].map(r => W.reduce((s, w, i) => s + LP[v[i]*3+r]*w, 0));
      let n = [0,1,2].map(r => W.reduce((s, w, i) => s + LN[v[i]*3+r]*w, 0)); let ln = Math.hypot(...n)||1; n = n.map(q => q/ln);
      let T = [0,1,2].map(r => W.reduce((s, w, i) => s + LT[v[i]*4+r]*w, 0)); const sgn = LT[v[0]*4+3] < 0 ? -1 : 1;
      const dn = T[0]*n[0]+T[1]*n[1]+T[2]*n[2]; T = T.map((q, r) => q - n[r]*dn); const lt = Math.hypot(...T)||1; T = T.map(q => q/lt);
      const Bt = [(n[1]*T[2]-n[2]*T[1])*sgn, (n[2]*T[0]-n[0]*T[2])*sgn, (n[0]*T[1]-n[1]*T[0])*sgn];
      // 从外侧 dist 处向内投射，长度 2*dist：取第一个朝向一致的交点（离外壳最近的面）
      let h = null, o = [p[0]+n[0]*dist, p[1]+n[1]*dist, p[2]+n[2]*dist];
      const r1 = trace(o[0], o[1], o[2], -n[0]||1e-12, -n[1]||1e-12, -n[2]||1e-12, dist*2);
      if (r1) { const q = hn(r1); if (q[0]*n[0]+q[1]*n[1]+q[2]*n[2] > 0.1) h = q; }
      if (!h) { const r2 = trace(p[0], p[1], p[2], -n[0]||1e-12, -n[1]||1e-12, -n[2]||1e-12, dist); if (r2) { const q = hn(r2); if (q[0]*n[0]+q[1]*n[1]+q[2]*n[2] > 0.1) h = q; } }
      let tx = 0, ty = 0, tz = 1; if (h) { tx = h[0]*T[0]+h[1]*T[1]+h[2]*T[2]; ty = h[0]*Bt[0]+h[1]*Bt[1]+h[2]*Bt[2]; tz = h[0]*n[0]+h[1]*n[1]+h[2]*n[2]; hit++; } else miss++;
      out[pix*3] = tx; out[pix*3+1] = ty; out[pix*3+2] = tz; mask[pix] = 1;
    }
  }
  parentPort.postMessage({ out, mask, hit, miss }, [out.buffer, mask.buffer]);
} else {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { dequantize } = await import('@gltf-transform/functions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  const { MeshoptTangents } = await import('meshoptimizer-next');
  const sharp = (await import('sharp')).default;
  const [hiPath, loPath, outPath] = process.argv.slice(2);
  const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const SIZE = opt('size', 2048), DISTR = opt('dist', 0.012);
  await MeshoptDecoder.ready; await MeshoptTangents.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const hiD = await io.read(hiPath), loD = await io.read(loPath); await loD.transform(dequantize());
  const f32 = (acc) => { const n = acc.getCount(), k = acc.getElementSize(), o = new Float32Array(n * k), el = []; for (let i = 0; i < n; i++) { acc.getElement(i, el); for (let j = 0; j < k; j++) o[i * k + j] = el[j]; } return o; };
  const hp = hiD.getRoot().listMeshes()[0].listPrimitives()[0], lp = loD.getRoot().listMeshes()[0].listPrimitives()[0];
  const HP = f32(hp.getAttribute('POSITION')), HN = f32(hp.getAttribute('NORMAL')), HI = new Uint32Array(hp.getIndices().getArray());
  const LP = f32(lp.getAttribute('POSITION')), LN = f32(lp.getAttribute('NORMAL')), LU = f32(lp.getAttribute('TEXCOORD_0')), LI = new Uint32Array(lp.getIndices().getArray());
  const LTc = MeshoptTangents.generateTangents(LI, LP, 3, LN, 3, LU, 2);   // 返回按索引角点的 MikkTSpace 切线
  const nLV = LP.length / 3, LT = new Float32Array(nLV * 4), wsum = new Float32Array(nLV);   // 角点 → 顶点：切线求和归一，w 取多数
  for (let k = 0; k < LI.length; k++) { const v = LI[k]; for (let r = 0; r < 3; r++) LT[v*4+r] += LTc[k*4+r]; wsum[v] += LTc[k*4+3]; }
  for (let v = 0; v < nLV; v++) { const l = Math.hypot(LT[v*4], LT[v*4+1], LT[v*4+2]); if (l > 1e-8) { LT[v*4] /= l; LT[v*4+1] /= l; LT[v*4+2] /= l; } else LT[v*4] = 1; LT[v*4+3] = wsum[v] < 0 ? -1 : 1; }
  let ymn = 1e9, ymx = -1e9; for (let i = 1; i < HP.length; i += 3) { ymn = Math.min(ymn, HP[i]); ymx = Math.max(ymx, HP[i]); }
  const dist = (ymx - ymn) * DISTR; const nT = LI.length / 3, NW = 2;
  console.log(`高模 ${HI.length/3} 面，低模 ${nT} 面，${SIZE}²，投射距离 ${dist.toFixed(4)}`);
  const t0 = Date.now();
  const res = await Promise.all([...Array(NW)].map((_, w) => new Promise((ok, no) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { HP, HN, HI, LP, LN, LT, LU, LI, size: SIZE, dist, t0: Math.floor(nT*w/NW), t1: Math.floor(nT*(w+1)/NW) } });
    wk.on('message', ok); wk.on('error', no);
  })));
  const N = new Float32Array(SIZE*SIZE*3), M = new Uint8Array(SIZE*SIZE); let hit = 0, miss = 0;
  for (const r of res) { hit += r.hit; miss += r.miss; for (let i = 0; i < M.length; i++) if (r.mask[i] && !M[i]) { M[i] = 1; N[i*3] = r.out[i*3]; N[i*3+1] = r.out[i*3+1]; N[i*3+2] = r.out[i*3+2]; } }
  console.log(`烘焙 ${((Date.now()-t0)/1000).toFixed(1)}s  覆盖纹素 ${hit+miss}  命中 ${(hit/(hit+miss)*100).toFixed(2)}%`);
  // padding：16 轮 8 邻域平均膨胀
  for (let it = 0; it < 16; it++) {
    const add = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = y*SIZE+x; if (M[i]) continue; let s = [0,0,0], c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x+dx, yy = y+dy; if (xx<0||yy<0||xx>=SIZE||yy>=SIZE) continue; const j = yy*SIZE+xx; if (M[j]) { s[0]+=N[j*3]; s[1]+=N[j*3+1]; s[2]+=N[j*3+2]; c++; } }
      if (c) add.push([i, s.map(q => q/c)]); }
    for (const [i, s] of add) { const l = Math.hypot(...s)||1; N[i*3] = s[0]/l; N[i*3+1] = s[1]/l; N[i*3+2] = s[2]/l; M[i] = 1; }
  }
  const px = Buffer.alloc(SIZE*SIZE*3); for (let i = 0; i < SIZE*SIZE; i++) { if (!M[i]) { px[i*3] = 128; px[i*3+1] = 128; px[i*3+2] = 255; continue; } for (let r = 0; r < 3; r++) px[i*3+r] = Math.max(0, Math.min(255, Math.round((N[i*3+r]*0.5+0.5)*255))); }
  const png = await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer();
  await sharp(png).toFile(outPath.replace(/\.glb$/, '_normal.png'));
  const buf = loD.getRoot().listBuffers()[0];
  lp.setAttribute('TANGENT', loD.createAccessor().setType('VEC4').setArray(LT).setBuffer(buf));
  const tex = loD.createTexture('gordon_normal').setImage(png).setMimeType('image/png');
  lp.getMaterial().setNormalTexture(tex).setNormalScale(1);
  await io.write(outPath, loD);
  console.log('✓', outPath, '+', outPath.replace(/\.glb$/, '_normal.png'));
}
