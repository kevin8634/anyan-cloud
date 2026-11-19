// fix1106 KTX2（Basis Universal）GPU 压缩：比赛版模型贴图 webp/jpg/png → KTX2，保持原分辨率（2048 不降）
//   node tools/ktx2/convert.mjs [--budget=秒] [--only=正则] [--dry]
//   - 只改缓存，不动 git 里的源 GLB：输出 /workspace/work/ktx2cache/（KTX2_CACHE 可改）
//       glb/<目录>/<名>.<源 md5 前 12 位>.<SET>.glb    整个 GLB（几何 / 动画 / meshopt 块逐字节保留，只换贴图块）
//       img/<图 md5>.<用途>.<SET>.ktx2 + .json        单张贴图（按图内容缓存：同一张图出现在多个 GLB 里只编一次；可分批续跑）
//   - 编码规则（画质判断见 docs 与 manifest 里每张的 psnr）：
//       法线          UASTC 4x4 + zstd，basisu normal 预设（线性、不做感知加权、mip 重新归一化）
//       颜色 / 自发光  ETC1S 最高质量（q255）先编；用 three 自带的同版本转码器解回 RGBA 和源图比 PSNR，< 35 dB 改用 UASTC + zstd
//       金属粗糙 / AO  同上但线性（不标 sRGB），阈值 33 dB
//     全部 UASTC 的话单页会到 ~700 MB（超过 V8 单字符串上限 ~512 MB，页面直接打不开），所以颜色类先试 ETC1S、画质不够才上 UASTC
//   - 逐张串行编码（8 GB 内存）；--budget 到点就退出（退出码 3 = 还没编完，再跑一次接着编）
//   - 构建：build-web.mjs --assets=aholo 默认 --ktx2（调用本文件 ensureKtx2 + tools/asset-pack.mjs 读缓存）；--no-ktx2 关闭
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { createHash, } from 'crypto';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE = process.env.KTX2_CACHE || '/workspace/work/ktx2cache';
/** 编码参数版本：改了编码规则就 +1（缓存自动失效） */
export const SET = 'k1';
const ENC_DIR = process.env.KTX2_ENCODER_DIR || '/workspace/work/ktxenc/node_modules/ktx2-encoder';
/** 要转换的比赛资产（相对 assets_aholo/）：models_hd 里打进单页的写实模型（同 gen-assets HD_EMBED 规则，_raw 不打包不转） + DLC1 怪物 / NPC / 首领件 */
export const KTX2_SCOPE = [
  { dir: 'models_hd', test: f => /^LUX_\w+\.glb$/.test(f) && !/_raw\.glb$/.test(f) },
  { dir: 'dlc1/creatures', test: f => f.endsWith('.glb') },
  // 11-11 桌面版（wip/electron1109，KTX2_DESKTOP=1 时才加）：本体怪物、武器、DLC 场景件也转（开机解析的贴图 CPU 内存约降到 1/4）；比赛版不受影响
  ...(process.env.KTX2_DESKTOP === '1' ? [
    { dir: 'creatures', test: f => f.endsWith('.glb') && !/^wl_ferry_death_(apose|fit|t|t_rigged)\.glb$/.test(f) },
    { dir: 'props', test: f => /^weapon_\w+\.glb$/.test(f) },
    { dir: 'dlc1/props', test: f => /^scene_\w+\.glb$/.test(f) },
  ] : []),
];
export const inScope = rel => KTX2_SCOPE.some(s => rel.startsWith(s.dir + '/') && !rel.slice(s.dir.length + 1).includes('/') && s.test(rel.slice(s.dir.length + 1)));
const THR = { srgb: 35, linear: 33 };

export const md5 = b => createHash('md5').update(b).digest('hex');
/** 源 GLB → 缓存 GLB 路径 */
export function cachedPath(rel, srcBuf) { return join(CACHE, 'glb', rel.replace(/\.glb$/, '') + `.${md5(srcBuf).slice(0, 12)}.${SET}.glb`); }

// ---------------------------------------------------------------- GLB 读写（原样保留所有非贴图块）
export function parseGlb(b) {
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB');
  let p = 12, json = null, bin = Buffer.alloc(0);
  while (p + 8 <= b.length) { const len = b.readUInt32LE(p), type = b.readUInt32LE(p + 4), d = b.subarray(p + 8, p + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(d.toString('utf8').replace(/[\0 ]+$/, '')); else if (type === 0x004e4942) bin = d; p += 8 + len; }
  return { json, bin };
}
function writeGlb(json, bin) {
  const js = Buffer.from(JSON.stringify(json), 'utf8'), jp = Buffer.alloc((4 - js.length % 4) % 4, 0x20), bp = Buffer.alloc((4 - bin.length % 4) % 4, 0);
  const J = Buffer.concat([js, jp]), B = Buffer.concat([bin, bp]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + J.length + 8 + B.length, 8);
  const hj = Buffer.alloc(8); hj.writeUInt32LE(J.length, 0); hj.writeUInt32LE(0x4e4f534a, 4);
  const hb = Buffer.alloc(8); hb.writeUInt32LE(B.length, 0); hb.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, hj, J, hb, B]);
}
/** 每张图的用途：normal / srgb（底色、自发光）/ linear（金属粗糙、AO 等） */
export function imageUses(json) {
  const texSrc = t => { const x = json.textures?.[t]; if (!x) return -1; let s = x.source; for (const e of Object.values(x.extensions ?? {})) if (e && typeof e.source === 'number') s = e.source; return s ?? -1; };
  const use = new Map(); const add = (ti, k) => { if (!ti) return; const s = texSrc(ti.index); if (s < 0) return; if (!use.has(s)) use.set(s, new Set()); use.get(s).add(k); };
  for (const m of json.materials ?? []) { const p = m.pbrMetallicRoughness ?? {};
    add(p.baseColorTexture, 'srgb'); add(m.emissiveTexture, 'srgb'); add(p.metallicRoughnessTexture, 'linear'); add(m.occlusionTexture, 'linear'); add(m.normalTexture, 'normal');
    for (const [en, e] of Object.entries(m.extensions ?? {})) for (const [k, v] of Object.entries(e ?? {})) if (v && typeof v === 'object' && typeof v.index === 'number' && /texture/i.test(k)) add(v, /normal/i.test(k) ? 'normal' : /color|sheen|specularColor/i.test(k) && !/Roughness/.test(k) ? 'srgb' : 'linear');
  }
  return use;
}
const modeOf = set => !set ? 'srgb' : set.has('normal') ? 'normal' : set.has('srgb') ? 'srgb' : 'linear';

// ---------------------------------------------------------------- 编码（basisu wasm，ktx2-encoder 0.6 自带）+ 校验（three r170 自带转码器）
let encMod = null, sharp = null;
async function encoderModule() {
  if (encMod) return encMod;
  const BASIS = (await import(join(ENC_DIR, 'dist/basis/basis_encoder.js'))).default;
  encMod = await BASIS({ print: () => {}, printErr: () => {} }); encMod.initializeBasis(); return encMod;
}
async function decodeSrc(buf) { sharp ??= require(join(ROOT, 'node_modules/sharp')); const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), w: info.width, h: info.height }; }
function hasAlpha(px) { for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true; return false; }
async function encode(px, w, h, kind, mode) {
  const M = await encoderModule(); const e = new M.BasisEncoder();
  try {
    e.setCreateKTX2File(true); e.setDebug(false); e.setTexType(0); e.setMipGen(true); e.setCheckForAlpha(true);
    if (mode === 'normal') { e.setNormalMapPreset(); }
    else if (mode === 'linear') { e.setLinearPreset ? e.setLinearPreset() : (e.setPerceptual(false), e.setMipSRGB(false)); }
    else { e.setPerceptual(true); e.setMipSRGB(true); }
    e.setKTX2AndBasisSRGBTransferFunc(mode === 'srgb');
    if (kind === 'uastc') { e.setUASTC(true); e.setKTX2UASTCSupercompression(true); }
    else { e.setUASTC(false); e.setQualityLevel(255); e.setETC1SCompressionLevel(2); }
    if (!e.setSliceSourceImage(0, px, w, h, 0)) throw new Error('setSliceSourceImage 失败');
    let cap = Math.ceil(w * h * 4 * 4 / 3) + 65536;
    for (let a = 0; a < 2; a++, cap *= 2) { const out = new Uint8Array(cap); const n = e.encode(out); if (n > 0) return Buffer.from(out.slice(0, n)); }
    throw new Error('basisu encode 失败');
  } finally { e.delete(); }
}
const { decode: tdecode, psnr } = require('./verify.cjs');

async function convertImage(buf, mode) {
  // 11-18 伊奥拉黑脸：脸贴图 633×1024（非 4 的倍数 / 非 2 的幂）→ 桌面 GPU 转成 BC 压缩纹理时宽度不是 4 的倍数，WebGL 拒收，整张脸采样成黑。
  //   非 2 的幂的源图先缩放到最近的 2 的幂再编码（缓存键加 .p2，原有 2 的幂贴图缓存不受影响）
  sharp ??= require(join(ROOT, 'node_modules/sharp'));
  const md = await sharp(buf).metadata(), isP2 = (n) => n > 0 && (n & (n - 1)) === 0;
  const npot = !!(md.width && md.height) && (!isP2(md.width) || !isP2(md.height));
  const p2 = (n) => 2 ** Math.round(Math.log2(n));
  const key = `${md5(buf)}.${mode}.${SET}${npot ? '.p2' : ''}`, f = join(CACHE, 'img', key + '.ktx2');
  if (existsSync(f) && existsSync(f.replace(/\.ktx2$/, '.json'))) return { data: readFileSync(f), meta: JSON.parse(readFileSync(f.replace(/\.ktx2$/, '.json'), 'utf8')), cached: true };
  if (npot) buf = await sharp(buf).resize(p2(md.width), p2(md.height), { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const t0 = Date.now(); const { data: px, w, h } = await decodeSrc(buf); const alpha = hasAlpha(px), ch = alpha ? 4 : 3;
  let kind = mode === 'normal' ? 'uastc' : 'etc1s', out = await encode(px, w, h, kind, mode);
  let q = psnr((await tdecode(out)).rgba, px, ch), tried = [];
  if (kind === 'etc1s' && q < THR[mode]) { tried.push({ kind, psnr: +q.toFixed(2), bytes: out.length }); kind = 'uastc'; out = await encode(px, w, h, kind, mode); q = psnr((await tdecode(out)).rgba, px, ch); }
  const d = await tdecode(out); if (d.w !== w || d.h !== h) throw new Error(`尺寸不符 ${d.w}x${d.h} ≠ ${w}x${h}`);
  const meta = { mode, kind, w, h, levels: d.levels, alpha, psnr: +q.toFixed(2), src: buf.length, bytes: out.length, ms: Date.now() - t0, tried };
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + '.tmp', out); renameSync(f + '.tmp', f); writeFileSync(f.replace(/\.ktx2$/, '.json'), JSON.stringify(meta));
  return { data: out, meta, cached: false };
}

/** 一个 GLB：所有贴图转 KTX2，组装新 GLB（BIN 重排：保留全部非贴图块，丢掉旧 webp/jpg 字节） */
async function convertGlb(rel, src, deadline, log) {
  const out = cachedPath(rel, src); if (existsSync(out)) return { out, done: true, cached: true };
  const { json, bin } = parseGlb(src); const uses = imageUses(json);
  const imgs = json.images ?? [], repl = new Map(), metas = [];
  for (let i = 0; i < imgs.length; i++) {
    const im = imgs[i]; if (im.bufferView === undefined || im.mimeType === 'image/ktx2') continue;
    if (Date.now() > deadline) return { out, done: false };
    const bv = json.bufferViews[im.bufferView]; const buf = Buffer.from(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    const mode = modeOf(uses.get(i)); const r = await convertImage(buf, mode);
    repl.set(i, r.data); metas.push({ image: i, ...r.meta });
    log?.(`  ${rel} #${i} ${mode} ${r.meta.w}x${r.meta.h} → ${r.meta.kind}${r.meta.tried?.length ? '（ETC1S ' + r.meta.tried[0].psnr + ' dB 不够）' : ''} ${r.meta.psnr} dB ${(r.meta.src / 1024).toFixed(0)}→${(r.meta.bytes / 1024).toFixed(0)} KB${r.cached ? ' [缓存]' : ` ${(r.meta.ms / 1000).toFixed(1)}s`}`);
  }
  if (!repl.size) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, src); return { out, done: true }; }
  // BIN 重排：buffer 0 里被引用的区段（普通 bufferView + meshopt 压缩块）逐段拷过去；贴图 bufferView 换成新 KTX2
  const imgBV = new Map(); for (const [i, d] of repl) imgBV.set(imgs[i].bufferView, d);
  const parts = []; let off = 0; const seen = new Map();
  const put = (o, l, data) => { const k = `${o}:${l}`; if (!data && seen.has(k)) return seen.get(k); const pad = (16 - off % 16) % 16; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } const at = off; parts.push(data ?? bin.subarray(o, o + l)); off += l; if (!data) seen.set(k, at); return at; };
  for (let v = 0; v < (json.bufferViews ?? []).length; v++) {
    const bv = json.bufferViews[v], mo = bv.extensions?.EXT_meshopt_compression;
    if (imgBV.has(v)) { const d = imgBV.get(v); bv.byteOffset = put(0, d.length, d); bv.byteLength = d.length; delete bv.byteStride; bv.buffer = 0; continue; }
    if (mo && (mo.buffer ?? 0) === 0) mo.byteOffset = put(mo.byteOffset ?? 0, mo.byteLength);
    if ((bv.buffer ?? 0) === 0 && !(mo && json.buffers[bv.buffer ?? 0]?.extensions?.EXT_meshopt_compression?.fallback)) bv.byteOffset = put(bv.byteOffset ?? 0, bv.byteLength);
  }
  const nb = Buffer.concat(parts); json.buffers[0].byteLength = nb.length;
  for (const [i] of repl) { imgs[i].mimeType = 'image/ktx2'; delete imgs[i].uri; }
  for (const t of json.textures ?? []) {
    const ext = t.extensions ?? {}; let s = t.source; for (const [k, e] of Object.entries(ext)) if (e && typeof e.source === 'number') { s = e.source; delete ext[k]; }
    if (s !== undefined && repl.has(s)) { t.extensions = { ...ext, KHR_texture_basisu: { source: s } }; delete t.source; }
    else if (s !== undefined) t.source = s;
    if (t.extensions && !Object.keys(t.extensions).length) delete t.extensions;
  }
  const stillWebp = (json.textures ?? []).some(t => t.extensions?.EXT_texture_webp);
  const fix = a => { a = (a ?? []).filter(x => x !== 'EXT_texture_webp' || stillWebp); if (!a.includes('KHR_texture_basisu')) a.push('KHR_texture_basisu'); return a; };
  json.extensionsUsed = fix(json.extensionsUsed); json.extensionsRequired = fix(json.extensionsRequired);
  const glb = writeGlb(json, nb); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out + '.tmp', glb); renameSync(out + '.tmp', out);
  writeFileSync(out.replace(/\.glb$/, '.json'), JSON.stringify({ rel, src: src.length, out: glb.length, images: metas }));
  return { out, done: true };
}

export function scopeFiles(aholoDir = join(ROOT, 'assets_aholo')) {
  const out = [];
  for (const s of KTX2_SCOPE) { const d = join(aholoDir, s.dir); if (existsSync(d)) for (const f of readdirSync(d).sort()) if (s.test(f)) out.push(`${s.dir}/${f}`); }
  return out;
}
/** 构建前调用：缓存缺的就现编（全量冷编约 1 小时；平时全命中只算 md5） */
export async function ensureKtx2({ budgetSec = Infinity, only = null, log = console.log, aholoDir = join(ROOT, 'assets_aholo') } = {}) {
  const deadline = Date.now() + budgetSec * 1000; let todo = 0, made = 0;
  for (const rel of scopeFiles(aholoDir)) {
    if (only && !only.test(rel)) continue;
    const src = readFileSync(join(aholoDir, rel));
    if (existsSync(cachedPath(rel, src))) continue;
    const r = await convertGlb(rel, src, deadline, log);
    if (!r.done) { todo++; break; } made++; log?.(`KTX2 ✓ ${rel}`);
  }
  return { complete: todo === 0, made };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const b = process.argv.find(a => a.startsWith('--budget=')), o = process.argv.find(a => a.startsWith('--only='));
  process.chdir(ROOT);
  const r = await ensureKtx2({ budgetSec: b ? +b.slice(9) : Infinity, only: o ? new RegExp(o.slice(7)) : null });
  console.log(r.complete ? `KTX2 缓存完整（本次新编 ${r.made} 个 GLB）` : `KTX2 未完成（本次 ${r.made} 个 GLB），再跑一次继续`);
  process.exit(r.complete ? 0 : 3);
}
