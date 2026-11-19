// 打包浏览器试玩版（单文件，双击即可打开）
//   node build-web.mjs              → web/index.html          本体（src/dlc/ 下的代码物理上不进产物）
//   node build-web.mjs --dlc=dlc1   → web/index_dlc1.html     本体 + 内容包（可写多个：--dlc=dlc1,dlc2 → index_dlc1_dlc2.html）
//   node build-web.mjs --assets=aholo [--dlc=dlc1] → web/index_比赛版.html / web/index_dlc1_比赛版.html
//     v1.2.21 资产双包：比赛版叠加 assets_aholo/（Aholo 黑客松资产，只用于参赛）；默认 base = 原有资产包，产物与之前逐字节一致
//     比赛版构建结束后自动把 src/web/assets.gen.ts 还原成 base，避免后续 tsc / playtest 误用比赛资产
//     fix1106 比赛版默认 --ktx2：写实模型 / DLC1 怪物贴图换成 KTX2（Basis）GPU 压缩版（tools/ktx2/convert.mjs 缓存），--no-ktx2 回到原 webp 版
// v0.9.7 DLC 框架：内容包由 src/dlc/<id>/boot.ts 在游戏主模块之前注册；授权列表用 define 注入 __DARKROCK_DLC__（core/Entitlement.ts）
import { build } from 'esbuild';
import { genAssets, musicFiles } from './gen-assets.mjs';
import { packFromArgv, ktx2FromArgv } from './tools/asset-pack.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';

const arg = process.argv.find(a => a.startsWith('--dlc='));
const dlcs = arg ? arg.slice(6).split(',').map(s => s.trim()).filter(Boolean) : [];
for (const id of dlcs) {
  if (!/^[a-z0-9_]+$/.test(id)) { console.error(`内容包 id 不合法：${id}`); process.exit(1); }
  if (!existsSync(`src/dlc/${id}/boot.ts`)) { console.error(`找不到内容包：src/dlc/${id}/boot.ts`); process.exit(1); }
}
const showcase = process.argv.includes('--showcase');   // v1.2.54 DLC 展示版：资产白名单 tools/lite-assets.json + 只开放快速体验
if (showcase && (!dlcs.length)) { console.error('--showcase 需要配合 --dlc=<id>'); process.exit(1); }
if (showcase) process.env.ASSET_LITE = 'tools/lite-assets.json';
const split = process.argv.includes('--split');   // v1.2.54 分包加载：评委路径用不到的怪物模型拆到 lazy/*.js（<script> 注入，file:// 离线也能用），输出 web/online/
if (split) process.env.ASSET_SPLIT = '1';
const pack = packFromArgv();
// 11-11 桌面版（wip/electron1109）：--desktop → 资产不内嵌，原样写到 web/desktop/assets/，页面 web/desktop/index.html 只带代码（几十 MB）；不拆 raid/lazy 分块（桌面版按需读盘）
const desktop = process.argv.includes('--desktop');
if (desktop && split) { console.error('--desktop 不能和 --split 同用'); process.exit(1); }
if (desktop) { process.env.DESKTOP_ASSETS = '1'; process.env.KTX2_DESKTOP = '1'; globalThis.__desktopFiles = {}; rmSync('web/desktop', { recursive: true, force: true }); mkdirSync('web/desktop', { recursive: true }); }   // 桌面版：KTX2 扩到本体怪物 / 武器 / DLC 场景件（tools/ktx2/convert.mjs）
// A10：比赛版 DLC 默认把长副本首领正式绑骨件拆到页面旁的 raid/*.js（进副本时 <script> 注入，file:// 离线也能用）；--raid-inline 关闭（旧单页行为）
const raidLazy = pack === 'aholo' && dlcs.length > 0 && !showcase && !process.argv.includes('--raid-inline');
if (raidLazy) process.env.ASSET_RAID = '1';
// fix1106 KTX2 GPU 压缩贴图（比赛版默认开，--no-ktx2 关闭）：先补齐缓存（tools/ktx2/convert.mjs，按源 md5；全命中时只算 md5），再让资产表读缓存版 GLB
const ktx2 = ktx2FromArgv(pack);
if (ktx2) { const { ensureKtx2 } = await import('./tools/ktx2/convert.mjs'); const k = await ensureKtx2({ log: s => { if (!s.startsWith('  ')) console.log(s); } }); if (!k.complete) console.warn('KTX2 缓存未完成，缺的模型用原 webp 版'); }
const usedAholo = genAssets(pack, { ktx2 });
const lazyChunks = [];
if (split) {
  const moved = Object.entries(globalThis.__assetSplit ?? {}); rmSync('web/online', { recursive: true, force: true }); mkdirSync('web/online/lazy', { recursive: true });
  let cur = {}, n = 0;
  const flush = () => { if (!Object.keys(cur).length) return; const f = `c${lazyChunks.length + 1}.js`; writeFileSync(`web/online/lazy/${f}`, `(window.__drLazyQ=window.__drLazyQ||[]).push(${JSON.stringify(cur)});window.__drLazyPing&&window.__drLazyPing();`); lazyChunks.push(f); cur = {}; n = 0; };
  for (const [k, v] of moved) { cur[k] = v; n += v.length; if (n > 3.6e6) flush(); }   // 每块 ≤ 约 4MB（魔搭仓库单文件不走 LFS）
  flush();
}
const raidChunks = [], raidIds = Object.keys(globalThis.__assetRaid ?? {});
if (raidLazy) {
  const rdir = desktop ? 'web/desktop/raid' : split ? 'web/online/raid' : 'web/raid'; rmSync(rdir, { recursive: true, force: true }); mkdirSync(rdir, { recursive: true });
  // 每块 ≤ 约 3.5 MB 字符（魔搭仓库单文件不走 LFS）：大件按片切开，加载端按 [键, 片号, 片数] 拼回
  const CH = 3.5e6; let n = 0;
  for (const [k, v] of Object.entries(globalThis.__assetRaid ?? {})) { const parts = Math.ceil(v.length / CH);
    for (let i = 0; i < parts; i++) { const f = `r${++n}.js`; writeFileSync(`${rdir}/${f}`, `(window.__drRaidQ=window.__drRaidQ||[]).push(${JSON.stringify([k, i, parts, v.slice(i * CH, (i + 1) * CH)])});`); raidChunks.push(f); } }
}
const dlcDir = resolve('src/dlc');
/** 本体构建：任何模块 import 到 src/dlc/ 直接报错（保证本体产物物理上不含 DLC 代码） */
const guard = {
  name: 'dlc-guard',
  setup(b) {
    b.onResolve({ filter: /dlc/ }, a => {
      const p = resolve(a.resolveDir, a.path);
      if (p.startsWith(dlcDir) && !dlcs.some(id => p.startsWith(resolve(dlcDir, id)))) return { errors: [{ text: `本体 / 当前构建不允许引用 ${a.path}（DLC 代码只能由 --dlc=<id> 构建引入）` }] };
      return undefined;
    });
  },
};
const common = { bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, tsconfig: 'src/web/tsconfig.json', legalComments: 'none',
  define: { __DARKROCK_LAZY__: JSON.stringify(lazyChunks), __DARKROCK_RAID__: JSON.stringify({ files: raidChunks, ids: raidIds }), __DARKROCK_DLC__: JSON.stringify(dlcs), __DARKROCK_SHOWCASE__: JSON.stringify(showcase) }, plugins: [guard] };
const r = dlcs.length
  // DLC 构建：先 import 各包的 boot（注册），再 import 主模块（ES 模块按 import 顺序求值）
  ? await build({ ...common, stdin: { contents: [...dlcs.map(id => `import './src/dlc/${id}/boot.ts';`), `import './src/web/main.ts';`].join('\n'), resolveDir: resolve('.'), sourcefile: 'dlc-entry.ts', loader: 'ts' } })
  : await build({ ...common, entryPoints: ['src/web/main.ts'] });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = readFileSync('src/web/index.html', 'utf8').replace('<script>/*GAME_JS*/</script>', () => `<script>${js}</script>`);
mkdirSync('web', { recursive: true });
if (desktop) { let n = 0, b = 0; for (const [rel, buf] of Object.entries(globalThis.__desktopFiles ?? {})) { mkdirSync(dirname(`web/desktop/${rel}`), { recursive: true }); writeFileSync(`web/desktop/${rel}`, buf); n++; b += buf.length; } console.log(`桌面版资产：${n} 个文件，${(b / 1048576).toFixed(1)} MB → web/desktop/assets/`);
  // 11-17 离线武器库：assets_forgelib/*.glb 原样拷到 web/desktop/assets/forgelib/（页面按需读盘，src/web/forge_lib.ts）
  if (existsSync('assets_forgelib')) { mkdirSync('web/desktop/assets/forgelib', { recursive: true }); let m = 0; for (const f of readdirSync('assets_forgelib').filter(f => f.endsWith('.glb'))) { copyFileSync(`assets_forgelib/${f}`, `web/desktop/assets/forgelib/${f}`); m++; } console.log(`离线武器库：${m} 件 → web/desktop/assets/forgelib/`); }
}
const suffix = showcase ? '_展示版' : pack === 'aholo' ? '_比赛版' : '';
const out = desktop ? 'web/desktop/index.html' : split ? 'web/online/index.html' : dlcs.length ? `web/index_${dlcs.join('_')}${suffix}.html` : `web/index${suffix}.html`;
writeFileSync(out, html);
// v1.2.48 比赛版背景曲目：复制到页面旁的 web/music/（页面按需加载；离线单文件没带 music/ 目录时自动回退程序化音乐）
let musicN = 0;
const mdir = desktop ? 'web/desktop/music' : split ? 'web/online/music' : 'web/music';
if (pack === 'aholo') { mkdirSync(mdir, { recursive: true }); for (const m of musicFiles(pack)) { writeFileSync(`${mdir}/${m.name}`, m.data()); musicN++; } }
if (split) console.log(`分包：lazy/ ${lazyChunks.length} 个分块`);
if (raidChunks.length) console.log(`长副本按需加载：${desktop ? 'web/desktop/raid' : split ? 'web/online/raid' : 'web/raid'}/ ${raidChunks.length} 块（${raidIds.join(', ')}）`);
delete process.env.ASSET_LITE; delete process.env.DESKTOP_ASSETS; delete process.env.ASSET_SPLIT; delete process.env.ASSET_RAID;
if (pack !== 'base') genAssets('base');   // 还原 base 的 assets.gen.ts
console.log(`${out} ${(html.length / 1024).toFixed(0)} KB${dlcs.length ? `（内容包：${dlcs.join(', ')}）` : '（本体）'}${pack === 'aholo' ? `（比赛版，比赛资产 ${usedAholo.length} 个；曲目 ${musicN} 首 → web/music/）` : ''}`);
