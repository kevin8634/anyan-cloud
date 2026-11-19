// fix1109 #1：05 AO 版（b9bf067）脸贴花最上层 MI_LuxFace 图元的顶点 AO（COLOR_0）烘坏成近黑（均值 0.07–0.21、最低 0）
//   → 乘到贴图上，游戏里脸是一块黑椭圆。其余图元 AO 都在 0.5–1。
//   修法：坏图元（COLOR_0 最小值 < 0.45 且均值 < 0.4）每个顶点取同网格其他图元里最近顶点的 AO 值（位置同一量化空间）。
//   只重编这一个 bufferView 的 meshopt 块（追加到 BIN 0 末尾），几何 / 贴图 / 动画字节不动。
//   node tools/facevc/fix_face_vc.mjs assets_aholo/models_hd/LUX_Warrior.glb ...   [--dry]
import { readFileSync, writeFileSync } from 'fs';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const dry = process.argv.includes('--dry');
function parse(b) { let p = 12, json, bin; while (p < b.length) { const len = b.readUInt32LE(p), t = b.readUInt32LE(p + 4), d = b.subarray(p + 8, p + 8 + len); if (t === 0x4e4f534a) json = JSON.parse(d.toString().replace(/[\0 ]+$/, '')); else bin = Buffer.from(d); p += 8 + len; } return { json, bin }; }
function write(json, bin) {
  const js = Buffer.from(JSON.stringify(json)); const J = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]); const B = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + J.length + B.length, 8);
  const hj = Buffer.alloc(8); hj.writeUInt32LE(J.length); hj.writeUInt32LE(0x4e4f534a, 4); const hb = Buffer.alloc(8); hb.writeUInt32LE(B.length); hb.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, hj, J, hb, B]);
}
function readAcc(json, bin, ai) {
  const a = json.accessors[ai], bv = json.bufferViews[a.bufferView], mo = bv.extensions?.EXT_meshopt_compression;
  const stride = bv.byteStride, cnt = a.count; let raw;
  if (mo) { raw = new Uint8Array(cnt * stride); MeshoptDecoder.decodeVertexBuffer(raw, cnt, stride, bin.subarray(mo.byteOffset, mo.byteOffset + mo.byteLength), mo.filter ?? 'NONE'); if (mo.filter && mo.filter !== 'NONE') throw new Error('filter ' + mo.filter); }
  else raw = new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength);
  return { a, bv, mo, raw, stride, cnt };
}
const posOf = (r) => { const dv = new DataView(r.raw.buffer, r.raw.byteOffset, r.raw.byteLength); const out = new Float64Array(r.cnt * 3);
  for (let i = 0; i < r.cnt; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = r.a.componentType === 5126 ? dv.getFloat32(i * r.stride + (r.a.byteOffset ?? 0) + k * 4, true) : dv.getInt16(i * r.stride + (r.a.byteOffset ?? 0) + k * 2, true); return out; };
for (const f of process.argv.slice(2).filter(x => !x.startsWith('--'))) {
  const src = readFileSync(f); let { json, bin } = parse(src); let changed = 0;
  for (const mesh of json.meshes) {
    const prims = mesh.primitives.map(p => ({ p, mat: json.materials[p.material]?.name, col: p.attributes.COLOR_0 !== undefined ? readAcc(json, bin, p.attributes.COLOR_0) : null, pos: posOf(readAcc(json, bin, p.attributes.POSITION)) }));
    for (const [pi, P] of prims.entries()) {
      if (!P.col || P.mat !== 'MI_LuxFace' || P.col.a.componentType !== 5121) continue;
      const c = P.col.raw; let mn = 255, sum = 0; for (let i = 0; i < P.col.cnt; i++) { mn = Math.min(mn, c[i * 4]); sum += c[i * 4]; }
      const mean = sum / P.col.cnt / 255; if (!(mn / 255 < 0.45 && mean < 0.4)) continue;
      const others = prims.filter((Q, qi) => qi !== pi && Q.col);
      const nc = new Uint8Array(c); let s2 = 0;
      for (let i = 0; i < P.col.cnt; i++) {
        let best = Infinity, bv = 255;
        for (const Q of others) { const qc = Q.col.raw; for (let j = 0; j < Q.col.cnt; j++) { const dx = Q.pos[j * 3] - P.pos[i * 3], dy = Q.pos[j * 3 + 1] - P.pos[i * 3 + 1], dz = Q.pos[j * 3 + 2] - P.pos[i * 3 + 2]; const d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bv = qc[j * 4]; } } }
        nc[i * 4] = nc[i * 4 + 1] = nc[i * 4 + 2] = bv; s2 += bv;
      }
      console.log(`${f} prim ${pi} ${P.mat} COLOR_0 min ${(mn / 255).toFixed(2)} mean ${mean.toFixed(3)} → mean ${(s2 / P.col.cnt / 255).toFixed(3)}`);
      changed++; if (dry) continue;
      const { bv, mo, cnt, stride } = P.col;
      if (mo) { const enc = Buffer.from(MeshoptEncoder.encodeVertexBuffer(nc, cnt, stride));
        const pad = (16 - bin.length % 16) % 16; const at = bin.length + pad; bin = Buffer.concat([bin, Buffer.alloc(pad), enc]); mo.byteOffset = at; mo.byteLength = enc.length; json.buffers[mo.buffer ?? 0].byteLength = bin.length; }
      else nc.forEach((v, i) => { P.col.raw[i] = v; });
      P.col.raw = nc;
    }
  }
  if (changed && !dry) { writeFileSync(f, write(json, bin)); console.log('写回', f); }
  if (!changed) console.log(f, '无坏 AO 图元');
}
