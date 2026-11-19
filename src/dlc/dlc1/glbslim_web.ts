// v1.2.54 浏览器端 GLB 瘦身（导入本地 GLB 用）：与服务端 cloud/forge-fc/glbslim.js 同一套规则
// 每张贴图缩到 ≤ 1024，重新编码成 JPEG（质量 0.85）；被「需要透明」的材质用作底色的贴图保留 PNG（只缩小）；几何数据原样保留
// 解码 / 编码用浏览器自带的 createImageBitmap + canvas（不联网）；出错原样返回，绝不让压缩失败拖垮导入

type GJson = { images?: { bufferView?: number; mimeType?: string }[]; bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number }[]; buffers?: { byteLength: number }[]; textures?: { source?: number }[]; materials?: { alphaMode?: string; pbrMetallicRoughness?: { baseColorTexture?: { index?: number } } }[] };
export type SlimInfo = { before: number; after: number; images: string[]; error?: string; ms: number };

export function isGlb(buf: ArrayBuffer) { return buf.byteLength > 20 && new DataView(buf).getUint32(0, true) === 0x46546c67; }

export function parseGlb(buf: ArrayBuffer): { json: GJson; bin: Uint8Array } {
  const dv = new DataView(buf); if (!isGlb(buf)) throw new Error('不是 GLB 文件');
  let p = 12, json: GJson | null = null, bin: Uint8Array = new Uint8Array(0);
  while (p + 8 <= buf.byteLength) {
    const len = dv.getUint32(p, true), type = dv.getUint32(p + 4, true), d = new Uint8Array(buf, p + 8, len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(d).replace(/[\0 ]+$/, '')); else if (type === 0x004e4942) bin = d;
    p += 8 + len;
  }
  if (!json) throw new Error('GLB 没有 JSON 块');
  return { json, bin };
}
export function buildGlb(json: GJson, bin: Uint8Array): ArrayBuffer {
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - js.length % 4) % 4;
  if (jp) { const t = new Uint8Array(js.length + jp).fill(0x20); t.set(js); js = t; }
  const bp = (4 - bin.length % 4) % 4; if (bp) { const t = new Uint8Array(bin.length + bp); t.set(bin); bin = t; }
  const total = 12 + 8 + js.length + (bin.length ? 8 + bin.length : 0), out = new ArrayBuffer(total), dv = new DataView(out), u = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  if (bin.length) { const o = 20 + js.length; dv.setUint32(o, bin.length, true); dv.setUint32(o + 4, 0x004e4942, true); u.set(bin, o + 8); }
  return out;
}
function alphaNeeded(json: GJson, img: number) {
  const tex = (json.textures ?? []).map((t, i) => (t.source === img ? i : -1)).filter(i => i >= 0);
  return (json.materials ?? []).some(m => m.alphaMode && m.alphaMode !== 'OPAQUE' && tex.includes(m.pbrMetallicRoughness?.baseColorTexture?.index ?? -1));
}
async function reencode(data: Uint8Array, mime: string, max: number, png: boolean, q: number): Promise<{ out: Uint8Array; w: number; h: number; W: number; H: number } | null> {
  const bmp = await createImageBitmap(new Blob([data.slice()], { type: mime }));
  const k = Math.max(bmp.width, bmp.height) / max, W = k > 1 ? Math.max(1, Math.round(bmp.width / k)) : bmp.width, H = k > 1 ? Math.max(1, Math.round(bmp.height / k)) : bmp.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); if (!g) { bmp.close?.(); return null; }
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, H);
  const blob: Blob | null = await new Promise(res => c.toBlob(res, png ? 'image/png' : 'image/jpeg', q));
  const r = { w: bmp.width, h: bmp.height, W, H }; bmp.close?.();
  return blob ? { out: new Uint8Array(await blob.arrayBuffer()), ...r } : null;
}

/** 瘦身：返回 { buf, info }；出错时原样返回（info.error 写原因） */
export async function slimGlbWeb(src: ArrayBuffer, o: { maxSize?: number; quality?: number } = {}): Promise<{ buf: ArrayBuffer; info: SlimInfo }> {
  const max = o.maxSize ?? 1024, q = o.quality ?? 0.85, t0 = performance.now();
  const info: SlimInfo = { before: src.byteLength, after: src.byteLength, images: [], ms: 0 };
  try {
    const { json, bin } = parseGlb(src);
    const views = json.bufferViews ?? [], repl = new Map<number, Uint8Array>();
    const imgs = json.images ?? [];
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i]; if (im.bufferView === undefined) continue;
      const v = views[im.bufferView], data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
      const mime = im.mimeType || (data[0] === 0x89 ? 'image/png' : 'image/jpeg'), png = mime === 'image/png' && alphaNeeded(json, i);
      let r: Awaited<ReturnType<typeof reencode>>;
      try { r = await reencode(data, mime, max, png, q); } catch (e) { info.images.push(`#${i} 跳过：${(e as Error)?.message ?? e}`); continue; }
      if (!r) { info.images.push(`#${i} 跳过：编码失败`); continue; }
      if (!png && mime === 'image/jpeg' && r.W === r.w && r.out.length >= data.length) { info.images.push(`#${i} 已是小 JPEG`); continue; }
      if (r.out.length >= data.length && r.W === r.w) { info.images.push(`#${i} 重编码没变小`); continue; }
      repl.set(im.bufferView, r.out); im.mimeType = png ? 'image/png' : 'image/jpeg';
      info.images.push(`#${i} ${r.w}x${r.h} ${mime.slice(6)} ${(data.length / 1024) | 0}KB → ${r.W}x${r.H} ${png ? 'png' : 'jpeg'} ${(r.out.length / 1024) | 0}KB`);
    }
    if (!repl.size) { info.ms = Math.round(performance.now() - t0); return { buf: src, info }; }
    const parts: Uint8Array[] = []; let off = 0;
    views.forEach((v, i) => {   // 所有 bufferView 按原顺序重排，4 字节对齐
      const d = repl.get(i) ?? bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
      const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; }
      v.byteOffset = off; v.byteLength = d.length; parts.push(d); off += d.length;
    });
    const nb = new Uint8Array(off); let p = 0; for (const x of parts) { nb.set(x, p); p += x.length; }
    if (json.buffers?.[0]) json.buffers[0].byteLength = nb.length;
    const buf = buildGlb(json, nb);
    info.after = buf.byteLength; info.ms = Math.round(performance.now() - t0);
    return { buf, info };
  } catch (e) { info.error = (e as Error)?.message ?? String(e); info.ms = Math.round(performance.now() - t0); return { buf: src, info }; }
}
