// v0.9.7 本体纯净检查：本体产物里不能出现任何内容包（DLC）的标识和文本
//   node tools/check-purity.mjs [文件，默认 web/index.html]
// 搜的词 = 每个 src/dlc/<id>/ 的目录名 + manifest.ts 里的 name + purity.json 的 tokens。
// 框架本身的通用词（ContentPacks、Entitlement、packSealed、dlc 字段名等）允许出现。
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';

const file = process.argv[2] ?? 'web/index.html';
const text = readFileSync(file, 'utf8');
const tokens = new Set();
/** 本体里早就有、待决定是否删除的词：只警告 */
const legacy = new Map();
for (const id of existsSync('src/dlc') ? readdirSync('src/dlc') : []) {
  const dir = `src/dlc/${id}`;
  if (!statSync(dir).isDirectory()) continue;
  tokens.add(id);
  const man = existsSync(`${dir}/manifest.ts`) ? readFileSync(`${dir}/manifest.ts`, 'utf8') : '';
  for (const m of man.matchAll(/\bname:\s*'([^']+)'/g)) tokens.add(m[1]);
  if (existsSync(`${dir}/purity.json`)) {
    const j = JSON.parse(readFileSync(`${dir}/purity.json`, 'utf8'));
    for (const t of j.tokens ?? []) tokens.add(t);
    for (const [t, why] of Object.entries(j.legacy ?? {})) legacy.set(t, why);
  }
}
for (const t of legacy.keys()) tokens.delete(t);
/** esbuild 默认把非 ASCII 字符转义成 \uXXXX：中文词同时搜原文和转义形式（大小写两种） */
const forms = t => {
  const esc = [...t].map(c => (c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('');
  return [...new Set([t, esc, esc.replace(/\\u([0-9a-f]{4})/g, (_, h) => '\\u' + h.toUpperCase())])];
};
/** 10-27：比赛版内嵌 ~90 MB base64 资产（env-hd 起贴图 / 模型 / 音频），随机数据里按概率会撞出「dlc1」「DLC1」这类 4 字符词（约每 16 MB 一次）→ 误报。
 *  命中点所在的连续 base64 字符段（A-Z a-z 0-9 + / = - _）≥ 256 个字符时视为内嵌数据，跳过并单独计数；代码 / 字符串里的真实标识前后有引号、点号、空格，段很短 */
const B64 = new Uint8Array(128); for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_') B64[c.charCodeAt(0)] = 1;
const isB64 = i => { const c = text.charCodeAt(i); return c < 128 && B64[c] === 1; };
const inData = (i, len) => { let a = i, b = i + len; while (a > 0 && isB64(a - 1) && i - a < 4096) a--; while (b < text.length && isB64(b) && b - i < 4096) b++; return b - a >= 256; };
let bad = 0, skipped = 0;
for (const t of tokens) {
  let n = 0; const where = [];
  for (const f of forms(t)) {
    let i = text.indexOf(f);
    while (i >= 0) { if (/^[A-Za-z0-9]+$/.test(f) && inData(i, f.length)) { skipped++; i = text.indexOf(f, i + 1); continue; } n++; if (where.length < 3) where.push(JSON.stringify(text.slice(Math.max(0, i - 40), i + f.length + 40))); i = text.indexOf(f, i + 1); }
  }
  if (n) { bad++; console.log(`✗ 「${t}」出现 ${n} 次：\n   ${where.join('\n   ')}`); }
}
for (const [t, why] of legacy) { const n = forms(t).reduce((a, f) => a + text.split(f).length - 1, 0); if (n) console.log(`⚠ 「${t}」出现 ${n} 次（已知遗留，只警告）：${why}`); }
if (skipped) console.log(`· 内嵌 base64 数据段里的偶然命中 ${skipped} 处已跳过（非代码 / 文本）`);
console.log(`${bad ? '✗' : '✓'} 纯净检查 ${file}：${tokens.size} 个 DLC 标识，${tokens.size - bad}/${tokens.size} 未出现`);
process.exit(bad ? 1 : 0);
