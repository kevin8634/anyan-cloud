// 用 three 自带的 basis_transcoder（运行时同一份）解 KTX2：验证兼容性 + 与源图比 PSNR
// node tools/ktx2/verify.cjs <a.ktx2> [src image]
const fs = require('fs'), path = require('path');
const BASIS = new Function('module', 'exports', 'require', '__filename', '__dirname', fs.readFileSync(path.resolve(__dirname, '../../node_modules/three/examples/jsm/libs/basis/basis_transcoder.js'), 'utf8') + '\n;return BASIS;')(undefined, undefined, require, __filename, __dirname);
let mod;
async function init() { if (mod) return mod; mod = await BASIS({ wasmBinary: fs.readFileSync(path.resolve(__dirname, '../../node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm')) }); mod.initializeBasis(); return mod; }
/** 返回 { w, h, levels, uastc, rgba(level0) }；fmt: 13 = RGBA32, 7 = BC7, 10 = ASTC4x4 */
async function decode(buf, fmt = 13) {
  const M = await init(); const f = new M.KTX2File(new Uint8Array(buf));
  try {
    if (!f.isValid()) throw new Error('KTX2 无效');
    const w = f.getWidth(), h = f.getHeight(), levels = f.getLevels(), uastc = f.isUASTC();
    if (!f.startTranscoding()) throw new Error('startTranscoding 失败');
    const outs = [];
    for (let l = 0; l < levels; l++) {
      const n = f.getImageTranscodedSizeInBytes(l, 0, 0, fmt); const dst = new Uint8Array(n);
      if (!f.transcodeImage(dst, l, 0, 0, fmt, 0, -1, -1)) throw new Error('transcode 失败 level ' + l);
      outs.push(dst);
    }
    return { w, h, levels, uastc, rgba: outs[0], bytes: outs.reduce((a, o) => a + o.length, 0) };
  } finally { f.close(); f.delete(); }
}
function psnr(a, b, ch = 3) { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < ch; c++) { const d = a[i + c] - b[i + c]; s += d * d; n++; } const mse = s / n; return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse); }
module.exports = { decode, psnr };
if (require.main === module) (async () => {
  const sharp = require(path.resolve(__dirname, '../../node_modules/sharp'));
  for (const p of process.argv.slice(2)) {
    const [k, src] = p.split('=');
    const d = await decode(fs.readFileSync(k)); const b7 = await decode(fs.readFileSync(k), 7);
    let q = '';
    if (src) { const { data } = await sharp(fs.readFileSync(src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); q = 'PSNR ' + psnr(d.rgba, data).toFixed(2); }
    console.log(path.basename(k), d.w + 'x' + d.h, 'levels', d.levels, d.uastc ? 'UASTC' : 'ETC1S', 'BC7 bytes', b7.bytes, q);
  }
})();
