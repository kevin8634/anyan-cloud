// ======================================================================
// 铸造台 GLB 瘦身（纯 JS，零 npm 依赖：PNG 解码用 Node 自带 zlib，JPEG 编解码用 vendor/jpeg-js）
// Lux3D 返回的 GLB 约 9–10MB，其中 9MB+ 是两张 2048² PNG 贴图。这里把每张贴图缩到 ≤ maxSize（默认 1024）
// 并重新编码成 JPEG（质量 85）；带透明度且材质不是 OPAQUE 的贴图保留 PNG（只缩小）。几何数据原样保留。
// 做法：解析 GLB（JSON 块 + BIN 块）→ 替换 images 对应的 bufferView 数据 → 按 4 字节对齐重排所有 bufferView 偏移 → 重新拼 GLB。
// 用法：const { slimGlb } = require('./glbslim'); const { buf, info } = slimGlb(原始Buffer, { maxSize: 1024, quality: 85 });
// ======================================================================
'use strict';
const zlib = require('zlib');
const jpegEncode = require('./vendor/jpeg-js/encoder.js');
const jpegDecode = require('./vendor/jpeg-js/decoder.js');

// ---------------------------------------------------------------- PNG 解码（8/16 位，灰度 / RGB / 调色板 / 灰度+α / RGBA；不支持隔行）
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let p = 8, w = 0, h = 0, depth = 8, ct = 0, inter = 0, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; inter = d[12]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (inter) throw new Error('不支持隔行 PNG');
  if (depth !== 8 && depth !== 16 && !(ct === 3 && depth <= 8)) throw new Error(`不支持 ${depth} 位 PNG`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) throw new Error('未知 PNG 颜色类型');
  const bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil(w * ch * depth / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {   // 反滤波
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(w * h * 4); let alpha = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, row = y * stride; let r, g, b, a = 255;
    if (ct === 3) {
      const bit = x * depth, v = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      r = pal[v * 3]; g = pal[v * 3 + 1]; b = pal[v * 3 + 2]; if (trns && v < trns.length) a = trns[v];
    } else {
      const s = depth === 16 ? 2 : 1, i = row + x * ch * s, at = k => px[i + k * s];
      if (ct === 0) { r = g = b = at(0); } else if (ct === 4) { r = g = b = at(0); a = at(1); }
      else if (ct === 2) { r = at(0); g = at(1); b = at(2); } else { r = at(0); g = at(1); b = at(2); a = at(3); }
    }
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a; if (a < 250) alpha = true;
  }
  return { width: w, height: h, data: rgba, alpha };
}

// ---------------------------------------------------------------- PNG 编码（RGBA 8 位，逐行 Sub 滤波 + deflate）
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function encodePng({ width: w, height: h, data }) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { const o = y * (stride + 1); raw[o] = 1; for (let i = 0; i < stride; i++) raw[o + 1 + i] = (data[y * stride + i] - (i >= 4 ? data[y * stride + i - 4] : 0)) & 255; }
  const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- 缩小（面积平均，任意比例；只缩不放）
function shrink(img, max) {
  const { width: w, height: h, data } = img, k = Math.max(w, h) / max;
  if (k <= 1) return img;
  const W = Math.max(1, Math.round(w / k)), H = Math.max(1, Math.round(h / k)), out = Buffer.alloc(W * H * 4);
  const sx = w / W, sy = h / H;
  for (let Y = 0; Y < H; Y++) {
    const y0 = Math.floor(Y * sy), y1 = Math.max(y0 + 1, Math.floor((Y + 1) * sy));
    for (let X = 0; X < W; X++) {
      const x0 = Math.floor(X * sx), x1 = Math.max(x0 + 1, Math.floor((X + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++; }
      const o = (Y * W + X) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: W, height: H, data: out, alpha: img.alpha };
}

// ---------------------------------------------------------------- GLB
function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
  let p = 12, json = null, bin = null;
  while (p < buf.length) {
    const len = buf.readUInt32LE(p), type = buf.readUInt32LE(p + 4), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(d.toString('utf8').replace(/[\0 ]+$/, '')); else if (type === 0x004e4942) bin = d;
    p += 8 + len;
  }
  if (!json) throw new Error('GLB 没有 JSON 块');
  return { json, bin: bin || Buffer.alloc(0) };
}
function buildGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8'); const jp = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - bin.length % 4) % 4; bin = Buffer.concat([bin, Buffer.alloc(bp)]);
  const h = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  const total = 12 + 8 + js.length + (bin.length ? 8 + bin.length : 0);
  h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat(bin.length ? [h, jh, js, bh, bin] : [h, jh, js]);
}

/** 贴图是否被「需要透明」的材质用作底色（OPAQUE 材质的 α 通道本来就不显示，可放心转 JPEG） */
function alphaNeeded(json, imgIndex) {
  const texIdx = (json.textures || []).map((t, i) => (t.source === imgIndex ? i : -1)).filter(i => i >= 0);
  return (json.materials || []).some(m => m.alphaMode && m.alphaMode !== 'OPAQUE' && texIdx.includes(m.pbrMetallicRoughness?.baseColorTexture?.index));
}

/** 瘦身：返回 { buf, info }；出错时原样返回（info.error 写原因），绝不让压缩失败拖垮整次铸造 */
function slimGlb(src, o = {}) {
  const maxSize = o.maxSize || 1024, quality = o.quality || 85, t0 = Date.now();
  const info = { before: src.length, after: src.length, images: [], ms: 0 };
  try {
    const { json, bin } = parseGlb(src);
    const views = json.bufferViews || [], repl = new Map();
    (json.images || []).forEach((im, i) => {
      if (im.bufferView === undefined) return;
      const v = views[im.bufferView], data = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      const mime = im.mimeType || (data[0] === 0x89 ? 'image/png' : 'image/jpeg');
      let img;
      try { img = mime === 'image/png' ? decodePng(data) : { ...jpegDecode(data, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 }), alpha: false }; }
      catch (e) { info.images.push({ i, skip: e.message }); return; }
      const small = shrink(img, maxSize), keepPng = img.alpha && alphaNeeded(json, i);
      if (!keepPng && mime === 'image/jpeg' && small === img) { info.images.push({ i, skip: '已是小 JPEG' }); return; }
      const out = keepPng ? encodePng(small) : Buffer.from(jpegEncode({ width: small.width, height: small.height, data: small.data }, quality).data);
      if (out.length >= data.length && small === img) { info.images.push({ i, skip: '重编码没变小' }); return; }
      repl.set(im.bufferView, out); im.mimeType = keepPng ? 'image/png' : 'image/jpeg';
      info.images.push({ i, from: `${img.width}² ${mime.slice(6)} ${(data.length / 1024 | 0)}KB`, to: `${small.width}x${small.height} ${keepPng ? 'png' : 'jpeg'} ${(out.length / 1024 | 0)}KB` });
    });
    if (!repl.size) { info.ms = Date.now() - t0; return { buf: src, info }; }
    const parts = []; let off = 0;
    views.forEach((v, i) => {   // 所有 bufferView 按原顺序重排，4 字节对齐
      const d = repl.get(i) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      const pad = (4 - off % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
      v.byteOffset = off; v.byteLength = d.length; parts.push(d); off += d.length;
    });
    const nb = Buffer.concat(parts);
    if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = nb.length;
    const buf = buildGlb(json, nb);
    info.after = buf.length; info.ms = Date.now() - t0;
    return { buf, info };
  } catch (e) { info.error = e.message; info.ms = Date.now() - t0; return { buf: src, info }; }
}

// ---------------------------------------------------------------- v1.2.54 游戏版减面（vendor/meshoptimizer 简化器，MIT，单文件内嵌 WASM，零 npm 依赖）
// 只减三角面、不新建顶点：边界 / UV 接缝顶点由简化器锁住，贴图不错位；之后丢掉没用到的顶点，重排 bufferView。
// 只处理「三角形 + 有索引 + 浮点属性」的图元；其他情况原样返回（info.skip 写原因），绝不让减面失败拖垮铸造。
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAcc(json, bin, ai) {
  const a = json.accessors[ai], v = json.bufferViews[a.bufferView], [T, sz] = COMP[a.componentType], n = NCOMP[a.type];
  if (a.sparse) throw new Error('不支持稀疏访问器');
  const stride = v.byteStride || n * sz, base = (v.byteOffset || 0) + (a.byteOffset || 0), out = new T(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const rd = { 5120: o => dv.getInt8(o), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true), 5123: o => dv.getUint16(o, true), 5125: o => dv.getUint32(o, true), 5126: o => dv.getFloat32(o, true) }[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = rd(base + i * stride + k * sz);
  return { a, out, n, T };
}
let _simp = null;
const simplifier = () => { if (!_simp) _simp = (m => m.MeshoptSimplifier || m)(require('./vendor/meshoptimizer/meshopt_simplifier.js')); return _simp; };
/** 减面：targetTris = 目标三角面数（总面数不超过它就原样返回）；返回 Promise<{ buf, info:{ before, after, trisBefore, trisAfter, vertsBefore, vertsAfter, ms, skip?, error? } }> */
async function decimateGlb(src, o = {}) {
  const target = Math.max(500, o.targetTris || 6000), t0 = Date.now();
  const info = { before: src.length, after: src.length, trisBefore: 0, trisAfter: 0, vertsBefore: 0, vertsAfter: 0, ms: 0 };
  try {
    const { json, bin } = parseGlb(src);
    const prims = []; for (const m of json.meshes || []) for (const p of m.primitives || []) prims.push(p);
    for (const p of prims) { info.trisBefore += p.indices !== undefined ? json.accessors[p.indices].count / 3 : 0; info.vertsBefore += json.accessors[p.attributes.POSITION].count; }
    info.trisAfter = info.trisBefore; info.vertsAfter = info.vertsBefore;
    if (info.trisBefore <= target) { info.skip = `面数 ${info.trisBefore} 不超过 ${target}，不减`; info.ms = Date.now() - t0; return { buf: src, info }; }
    if (prims.some(p => (p.mode !== undefined && p.mode !== 4) || p.indices === undefined || p.targets)) { info.skip = '图元不是带索引的三角形（或有变形目标），不减'; info.ms = Date.now() - t0; return { buf: src, info }; }
    const S = simplifier(); await S.ready;
    const ratio = target / info.trisBefore, views = json.bufferViews, newData = new Map();   // bufferView 索引 → 新数据
    const used = new Set(); let trisA = 0, vertsA = 0;
    for (const p of prims) {
      const idx = readAcc(json, bin, p.indices), pos = readAcc(json, bin, p.attributes.POSITION);
      if (!(pos.out instanceof Float32Array)) throw new Error('顶点坐标不是浮点（量化过），不减');
      const ind = Uint32Array.from(idx.out), want = Math.max(3, Math.floor(ind.length * ratio / 3) * 3);
      const [res] = S.simplify(ind, pos.out, 3, want, o.maxError || 0.02);
      // 丢掉没用到的顶点（属性按新顺序重写成紧凑的独立 bufferView）
      const remap = new Int32Array(pos.a.count).fill(-1); let nv = 0; for (let i = 0; i < res.length; i++) if (remap[res[i]] < 0) remap[res[i]] = nv++;
      for (const [nm, ai] of Object.entries(p.attributes)) {
        if (used.has(ai)) throw new Error('属性被多个图元共用，不减');
        used.add(ai); const A = readAcc(json, bin, ai), out = new A.T(nv * A.n);
        for (let v = 0; v < A.a.count; v++) if (remap[v] >= 0) for (let k = 0; k < A.n; k++) out[remap[v] * A.n + k] = A.out[v * A.n + k];
        const vi = views.length; views.push({ buffer: 0, byteLength: out.byteLength, target: 34962 }); newData.set(vi, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
        Object.assign(A.a, { bufferView: vi, byteOffset: 0, count: nv }); void nm;
        if (A.a.min && A.a.max) { const mn = new Array(A.n).fill(Infinity), mx = new Array(A.n).fill(-Infinity); for (let v = 0; v < nv; v++) for (let k = 0; k < A.n; k++) { const x = out[v * A.n + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; } A.a.min = mn; A.a.max = mx; }
      }
      const ni = nv < 65536 ? new Uint16Array(res.length) : new Uint32Array(res.length); for (let i = 0; i < res.length; i++) ni[i] = remap[res[i]];
      const vi = views.length; views.push({ buffer: 0, byteLength: ni.byteLength, target: 34963 }); newData.set(vi, Buffer.from(ni.buffer, ni.byteOffset, ni.byteLength));
      const ia = json.accessors[p.indices]; Object.assign(ia, { bufferView: vi, byteOffset: 0, count: res.length, componentType: nv < 65536 ? 5123 : 5125 }); delete ia.min; delete ia.max;
      trisA += res.length / 3; vertsA += nv;
    }
    // 重排：只保留仍被访问器 / 图片引用的 bufferView，4 字节对齐
    const ref = new Set(); for (const a of json.accessors) if (a.bufferView !== undefined) ref.add(a.bufferView); for (const im of json.images || []) if (im.bufferView !== undefined) ref.add(im.bufferView);
    const keep = [], map = new Map(), parts = []; let off = 0;
    views.forEach((v, i) => { if (!ref.has(i)) return; const d = newData.get(i) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
      const pad = (4 - off % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
      map.set(i, keep.length); keep.push({ ...v, byteOffset: off, byteLength: d.length }); if (newData.has(i)) delete keep[keep.length - 1].byteStride; parts.push(d); off += d.length; });
    json.bufferViews = keep; for (const a of json.accessors) if (a.bufferView !== undefined) a.bufferView = map.get(a.bufferView); for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = map.get(im.bufferView);
    const nb = Buffer.concat(parts); if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = nb.length;
    const buf = buildGlb(json, nb);
    Object.assign(info, { after: buf.length, trisAfter: trisA, vertsAfter: vertsA, ms: Date.now() - t0 });
    return { buf, info };
  } catch (e) { info.error = e.message; info.ms = Date.now() - t0; return { buf: src, info }; }
}
/** 三角面数（统计用） */
function countTris(src) { const { json } = parseGlb(src); let n = 0; for (const m of json.meshes || []) for (const p of m.primitives || []) n += p.indices !== undefined ? json.accessors[p.indices].count / 3 : json.accessors[p.attributes.POSITION].count / 3; return n; }

module.exports = { slimGlb, decimateGlb, countTris, decodePng, encodePng, parseGlb };
