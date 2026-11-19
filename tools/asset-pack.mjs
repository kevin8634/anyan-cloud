// v1.2.21 资产双包：assets/（原有资产包，商用默认，冻结）+ assets_aholo/（Aholo 黑客松比赛资产，只叠加进比赛版）
//   规则见 docs/交接.md 第 12 节。比赛包与原有包同相对路径 = 替换；新文件名 = 新增。
//   比赛包里的每个文件必须在 assets_aholo/README.md 的登记表里（第一列写 `相对路径`），未登记直接报错。
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
// fix1106 KTX2：比赛版构建默认读 tools/ktx2/convert.mjs 生成的缓存版 GLB（贴图 KHR_texture_basisu），--no-ktx2 关闭；缓存位置同 convert.mjs
export const KTX2_CACHE = process.env.KTX2_CACHE || '/workspace/work/ktx2cache';
export const KTX2_SET = 'k1';   // 与 convert.mjs SET 一致
const KTX2_SCOPE = [[/^models_hd\/LUX_\w+\.glb$/, /_raw\.glb$/], [/^dlc1\/creatures\/[^/]+\.glb$/, null]];
// 11-11 桌面版（KTX2_DESKTOP=1）：与 convert.mjs 同步扩大范围
const KTX2_DESK = [[/^creatures\/[^/]+\.glb$/, /^creatures\/wl_ferry_death_(apose|fit|t|t_rigged)\.glb$/], [/^props\/weapon_\w+\.glb$/, null], [/^dlc1\/props\/scene_\w+\.glb$/, null]];
const ktx2Scope = () => process.env.KTX2_DESKTOP === '1' ? [...KTX2_SCOPE, ...KTX2_DESK] : KTX2_SCOPE;
const ktx2Cached = (rel, buf) => join(KTX2_CACHE, 'glb', rel.replace(/\.glb$/, '') + `.${createHash('md5').update(buf).digest('hex').slice(0, 12)}.${KTX2_SET}.glb`);
/** 构建开关：--ktx2（比赛版默认开）/ --no-ktx2 */
export function ktx2FromArgv(pack, argv = process.argv) { return pack === 'aholo' && !argv.includes('--no-ktx2'); }

export const BASE_DIR = 'assets';
/** 比赛包目录；测试时可用环境变量 AHOLO_ASSETS_DIR 指向临时目录 */
export const AHOLO_DIR = process.env.AHOLO_ASSETS_DIR || 'assets_aholo';
export const PACKS = ['base', 'aholo'];

/** 从命令行读 --assets=base|aholo（默认 base） */
export function packFromArgv(argv = process.argv) {
  const a = argv.find(x => x.startsWith('--assets='));
  const p = a ? a.slice(9).trim() : 'base';
  if (!PACKS.includes(p)) { console.error(`--assets 只能是 ${PACKS.join(' / ')}：${p}`); process.exit(1); }
  return p;
}

/** 递归列出比赛包里的资产文件（相对路径，不含 README / 说明文档 / 隐藏文件） */
export function aholoFiles(dir = AHOLO_DIR) {
  const out = [];
  const walk = rel => {
    const d = join(dir, rel);
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      if (f.startsWith('.')) continue;
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(join(dir, r)).isDirectory()) walk(r);
      else if (!/\.md$/i.test(f)) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

/** 读登记表：assets_aholo/README.md 表格第一列里的 `相对路径` */
export function aholoRegistry(dir = AHOLO_DIR) {
  const p = join(dir, 'README.md');
  if (!existsSync(p)) return new Set();
  const set = new Set();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) set.add(m[1].replace(/^assets_aholo\//, '').trim());
  }
  return set;
}

/** 未登记的比赛文件（应为空） */
export function unregistered(dir = AHOLO_DIR) {
  const reg = aholoRegistry(dir);
  return aholoFiles(dir).filter(f => !reg.has(f));
}

/** 资产视图：pack='base' 只看 assets/；pack='aholo' 在 assets/ 上叠加 assets_aholo/（同名覆盖、新名新增） */
export function assetView(pack, { ktx2 = false } = {}) {
  const over = new Map();
  if (pack === 'aholo') {
    const bad = unregistered();
    if (bad.length) { console.error(`比赛资产未在 ${AHOLO_DIR}/README.md 登记，拒绝构建：\n  ${bad.join('\n  ')}`); process.exit(1); }
    for (const f of aholoFiles()) over.set(f, join(AHOLO_DIR, f));
  }
  const used = [], k2used = [], k2miss = [];
  return {
    pack,
    ktx2: !!(ktx2 && pack === 'aholo'),
    ktx2Used: () => [...k2used],
    ktx2Missing: () => [...k2miss],
    /** 目录下的文件名（相对 assets/ 的目录，如 'models_hd/'），比赛版含新增文件 */
    list(relDir) {
      const rd = relDir.replace(/\/$/, '');
      // 原有文件保持 readdirSync 原顺序（base 构建与旧版逐字节一致），比赛新增文件排在后面
      const names = existsSync(join(BASE_DIR, rd)) ? readdirSync(join(BASE_DIR, rd)) : [];
      for (const k of [...over.keys()].sort()) if (k.startsWith(rd + '/') && !k.slice(rd.length + 1).includes('/') && !names.includes(k.slice(rd.length + 1))) names.push(k.slice(rd.length + 1));
      return names;
    },
    has(relDir) { return existsSync(join(BASE_DIR, relDir)) || [...over.keys()].some(k => k.startsWith(relDir.replace(/\/$/, '') + '/')); },
    /** 读一个资产文件（比赛版优先读 assets_aholo/） */
    read(rel) {
      const o = over.get(rel);
      if (o) {
        used.push(rel); const b = readFileSync(o);
        if (ktx2 && pack === 'aholo' && ktx2Scope().some(([y, n]) => y.test(rel) && !(n && n.test(rel)))) {
          const c = ktx2Cached(rel, b); if (existsSync(c)) { k2used.push(rel); return readFileSync(c); }
          k2miss.push(rel);
        }
        return b;
      }
      return readFileSync(join(BASE_DIR, rel));
    },
    /** 本次构建实际用到的比赛文件 */
    used: () => [...used],
  };
}
