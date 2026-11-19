// DLC 启动顺序守卫：src/dlc/<id>/boot.ts 的「静态」import 图不能碰到「模块顶层就读挂载点」的文件（withPacks / withPackRecord / packList / packClassField），
// 否则数据在 installPack 前被读取 → 「内容包注册太晚」→ 标题页卡 0%。动态 import()（延后加载）不算。
// 用法：node test/dlc_boot_order.mjs [dlc1]
// 11-18 *.gen.ts 一律换成空壳（只看 import 图，不打包内容）：gen-assets 生成的纯数据文件（没有任何 import），比赛资源（--assets=aholo）下
// assets.gen.ts 约 458 MB、dlc1 creatures.gen.ts 约 136 MB 的 data URI，原样打包时 esbuild 峰值约 6 GB，8 GB 沙箱里被系统 OOM 杀掉
// →「The service was stopped」。数据文件不 import 任何模块、也不读挂载点，换空壳不影响本守卫的判断。
import { build } from 'esbuild';
import { readFileSync } from 'fs';
// 11-18 补顶层 for / if 语句（cbba04f：zones_wild.ts 顶层 `for (const d of withPacks(...))` 旧正则漏报，DLC 版卡 0% 没被守住；Rhett 11-18 03:54 专长包提升，MMORPG 包第 9 章自动测试）
const READS = /^(export )?((const|let|var)\b[^\n]*|(for|if)\s*\([^\n]*)\b(withPacks|withPackRecord|packList|packClassField)\s*[<(]/m;   // 顶层读挂载点
const id = process.argv[2] || 'dlc1', entry = `src/dlc/${id}/boot.ts`;
const GEN = /\.gen(\.ts)?$/;
const genStub = { name: 'gen-stub', setup(b) { b.onLoad({ filter: GEN }, () => ({ contents: 'module.exports = {};', loader: 'js' })); } };
const r = await build({ plugins: [genStub], entryPoints: [entry], bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm', logLevel: 'silent', external: ['three', 'three/*'],
  loader: { '.glsl': 'text', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty', '.glb': 'empty', '.mp3': 'empty' } });
const ins = r.metafile.inputs, prev = { [entry]: null }, q = [entry];
while (q.length) { const f = q.shift(); for (const im of (ins[f]?.imports ?? []).filter(x => x.kind === 'import-statement')) if (!(im.path in prev)) { prev[im.path] = f; q.push(im.path); } }
const bad = Object.keys(prev).filter(f => f.startsWith('src/') && !f.includes('ContentPacks') && !GEN.test(f) && READS.test(readFileSync(f, 'utf8')));
if (!bad.length) { console.log(`✓ ${entry} 静态 import 图不含顶层读挂载点的模块（${Object.keys(prev).length} 个模块）`); process.exit(0); }
let c = bad[0], path = []; while (c) { path.unshift(c); c = prev[c]; }
console.log(`✗ ${entry} 静态 import 碰到游戏数据：\n  ` + path.join('\n  → ') + '\n  改成延后动态 import（见 boot.ts mage_fx_d1 写法）'); process.exit(1);
