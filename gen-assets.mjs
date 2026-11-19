// 把 assets 里的模型、贴图、图标转成 base64 模块，打进单文件 HTML（双击就能玩，不需要服务器）
// - assets/models   KayKit Adventurers（CC0，Kay Lousberg）
// - assets/icons    技能/装备/天赋图标、头像（本项目原创，图像生成 + tools/art.py 切片压缩，见 assets/ART_LICENSE.md）
// - assets/textures 手绘风格无缝贴图（同上）
// v1.2.21 资产双包：node gen-assets.mjs [--assets=base|aholo]（默认 base = 原有资产包；aholo = 叠加 assets_aholo/ 比赛资产，见 tools/asset-pack.mjs）
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { assetView, packFromArgv, ktx2FromArgv } from './tools/asset-pack.mjs';

// 11-11 桌面版资源拆包（wip/electron1109）：DESKTOP_ASSETS=1 时资产不再内嵌 base64，文件原样放进 globalThis.__desktopFiles（build-web 写到页面旁 assets/），
//   表里只留引用：模型表 'drf:<相对路径>'（b64ToBuf 经桌面外壳同步读盘），data URI 表换成相对网址 'assets/<相对路径>'。不设该变量时产物与原来逐字节一致
const DESK = () => process.env.DESKTOP_ASSETS === '1';
const deskStash = (rel, buf) => { (globalThis.__desktopFiles ??= {})['assets/' + rel] = buf; return 'assets/' + rel; };
/** 模型表的值：base64（网页版）或 'drf:assets/<rel>'（桌面版） */
const B64 = (A, rel) => { const b = A.read(rel); return DESK() ? 'drf:' + deskStash(rel, b) : b.toString('base64'); };
/** data URI 表的值：data URI（网页版）或相对网址（桌面版） */
const URI = (A, rel, mime) => { const b = A.read(rel); return DESK() ? deskStash(rel, b) : `data:${mime};base64,` + b.toString('base64'); };

/** 生成 src/web/assets.gen.ts 与各内容包 icons.gen.ts；返回本次用到的比赛资产 */
/** fix1106：opts.ktx2 = 比赛版模型读 KTX2 缓存版 GLB（tools/ktx2/convert.mjs）并内嵌转码器 */
export function genAssets(pack = 'base', { ktx2 = false } = {}) {
  const A = assetView(pack, { ktx2 });
  const out = ['// 自动生成：node gen-assets.mjs —— 角色模型 KayKit Adventurers（CC0，Kay Lousberg）；图标与贴图为本项目原创（assets/ART_LICENSE.md）'];
  const glb = {}, tex = {}, icons = {}, textures = {};
  for (const f of A.list('models/')) {
    if (f.endsWith('.glb')) glb[f.replace('.glb', '')] = B64(A, 'models/' + f);
    if (f.endsWith('.png')) tex[f.replace('_texture.png', '')] = URI(A, 'models/' + f, 'image/png');
  }
  const jpgA = (d, target) => { if (A.has(d)) for (const f of A.list(d)) if (f.endsWith('.jpg')) target[f.replace('.jpg', '')] = URI(A, d + f, 'image/jpeg'); };
  jpgA('icons/', icons);
  jpgA('textures/', textures);
  out.push(`export const GLB: Record<string, string> = ${JSON.stringify(glb)};`);
  out.push(`export const TEX: Record<string, string> = ${JSON.stringify(tex)};`);
  out.push(`export const ICONS: Record<string, string> = ${JSON.stringify(icons)};`);
  out.push(`export const TEXTURES: Record<string, string> = ${JSON.stringify(textures)};`);
  // v1.2.49 环境高精化 PBR 贴图（比赛包 assets_aholo/textures_hd/，CC0，见 assets_aholo/README.md）：<套>_ca.webp 颜色 + AO、<套>_nr.jpg 法线 + 粗糙度；base 包为空表 → 不启用
  const texHd = {};
  if (A.has('textures_hd/')) for (const f of A.list('textures_hd/')) { const m = f.match(/^(\w+)\.(webp|jpg)$/); if (m) texHd[m[1]] = URI(A, 'textures_hd/' + f, `image/${m[2] === 'jpg' ? 'jpeg' : 'webp'}`); }
  out.push(`export const TEXTURES_HD: Record<string, string> = ${JSON.stringify(texHd)};`);
  // fix1106 代码模型无缝贴图（比赛包 assets_aholo/tex_tile/<种>_basecolor.jpg / _normal.png / _roughness.jpg，05 交件）；base 包为空表 → 原材质
  const tileTex = {};
  if (A.has('tex_tile/')) for (const f of A.list('tex_tile/')) { const m = f.match(/^(\w+)\.(jpg|png)$/); if (m) tileTex[m[1]] = URI(A, 'tex_tile/' + f, `image/${m[2] === 'jpg' ? 'jpeg' : 'png'}`); }
  out.push(`export const TILE_TEX: Record<string, string> = ${JSON.stringify(tileTex)};`);
  // v1.2.49 加载画面背景（比赛包 assets_aholo/ui/loading_bg.webp；base 包为空 → 纯暗色背景）
  const lbg = A.has('ui/') && A.list('ui/').includes('loading_bg.webp') ? URI(A, 'ui/loading_bg.webp', 'image/webp') : '';
  out.push(`export const LOADING_ART: string = ${JSON.stringify(lbg)};`);
  // v1.2.54 开场动画电影感镜头（比赛包 assets_aholo/ui/intro_N.webp，场景概念图；base 包为空 → 只播原岩层开场）
  const introArt = A.has('ui/') ? A.list('ui/').filter(f => /^intro_\d+\.webp$/.test(f)).sort().map(f => URI(A, 'ui/' + f, 'image/webp')) : [];
  out.push(`export const INTRO_ART: string[] = ${JSON.stringify(introArt)};`);
  // v1.2.0-m1 写实人形（Quaternius Universal 体系，CC0；meshopt 压缩，来源见 assets/MODEL_SOURCES.md）
  const hd = {};
  // v1.2.0-m1b：只嵌入已在 rig.ts HD_RIGS 注册使用的写实模型（UBC / Outfits 原样入库，接入后再加进来，避免离线 HTML 白涨）
  const HD_EMBED = ['UAL_Mannequin', 'UBC_Male', 'Outfit_Male_Ranger', 'Mixamo_Anims', 'UBC_Female', 'Outfit_Male_Peasant', 'LUX_Warrior'];   // v1.2.23 LUX_Warrior 只在比赛包 assets_aholo 里有   // v1.2.18 + 女底座（法师）+ 平民套（炼金），贴图 webp（tools/hd-webp.mjs）   // v1.2.17 + Mixamo 动作库（只有骨架 + 16 个动作）   // v1.2.4 战士写实：UBC 底座 + 游侠套（动作借 UAL）
  if (A.has('models_hd/')) for (const f of A.list('models_hd/')) if (f.endsWith('.glb') && (HD_EMBED.includes(f.replace('.glb', '')) || /^LUX_\w+(?<!_raw)\.glb$/.test(f))) hd[f.replace('.glb', '')] = B64(A, 'models_hd/' + f);
  out.push(`export const HD_GLB: Record<string, string> = ${JSON.stringify(hd)};`);
  const crea = {};
  const CREA_SKIP = new Set(['wl_ferry_death_apose', 'wl_ferry_death_fit', 'wl_ferry_death_t', 'wl_ferry_death_t_rigged']);   // v1.2.80 合并：死渡绑骨试验件未接入代码，不打进单页（文件保留）
  if (A.has('creatures/')) for (const f of A.list('creatures/')) if (f.endsWith('.glb') && !CREA_SKIP.has(f.replace('.glb', ''))) crea[f.replace('.glb', '')] = B64(A, 'creatures/' + f);
  // v1.2.26 比赛版 Lux3D 武器（assets_aholo/props/weapon_*.glb）也走怪物模型表：creatures_glb.makeGlbProp 取用
  if (A.has('props/')) for (const f of A.list('props/')) if (/^weapon_\w+\.glb$/.test(f)) crea[f.replace('.glb', '')] = B64(A, 'props/' + f);
  out.push(`export const CREATURE_GLB: Record<string, string> = ${JSON.stringify(crea)};`);
  // v1.2.48 比赛版背景曲目（assets_aholo/audio/music/*.mp3）：只登记曲目名，文件由 build-web.mjs 复制到页面旁的 web/music/（按需加载，不内联）
  const music = A.has('audio/music/') ? A.list('audio/music/').filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', '')) : [];
  out.push(`export const MUSIC_TRACKS: string[] = ${JSON.stringify(music)};`);
  // 11-18 环境音（比赛包 assets_aholo/audio/amb/amb_*.ogg，MiniMax-H3，约 5 s 循环）：data URI 内联，运行时 amb_sfx.ts 只解码当前地图用到的；base 包为空表 → 不播
  const amb = {};
  if (A.has('audio/amb/')) for (const f of A.list('audio/amb/')) if (f.endsWith('.ogg')) amb[f.replace('.ogg', '')] = URI(A, 'audio/amb/' + f, 'audio/ogg');
  out.push(`export const AMB_SRC: Record<string, string> = ${JSON.stringify(amb)};`);
  writeFileSync('src/web/assets.gen.ts', out.join('\n'));
  // fix1106 KTX2：比赛版 --ktx2 构建（A.ktx2）内嵌 three 自带的 Basis 转码器（离线单页不能走网络，运行时 blob URL 喂给 KTX2Loader）；其余构建写空串 → 不启用
  const BASIS_DIR = 'node_modules/three/examples/jsm/libs/basis/';
  const bjs = A.ktx2 ? readFileSync(BASIS_DIR + 'basis_transcoder.js', 'utf8') : '', bwasm = A.ktx2 ? readFileSync(BASIS_DIR + 'basis_transcoder.wasm').toString('base64') : '';
  writeFileSync('src/web/basis.gen.ts', `// 自动生成：node gen-assets.mjs —— KTX2 转码器（three r170 examples/jsm/libs/basis，Apache-2.0）；比赛版 --ktx2 构建内嵌，base 包为空（不启用 KTX2）\nexport const BASIS_JS: string = ${JSON.stringify(bjs)};\nexport const BASIS_WASM: string = ${JSON.stringify(bwasm)};\n`);
  if (A.ktx2) console.log(`KTX2：用到 ${A.ktx2Used().length} 个转换后的 GLB${A.ktx2Missing().length ? `；缓存缺 ${A.ktx2Missing().length} 个（用原 webp 版）：${A.ktx2Missing().join(', ')}` : ''}；转码器内嵌 ${((bjs.length + bwasm.length) / 1024).toFixed(0)} KB`);
  console.log('assets.gen.ts', Object.keys(glb).join(','), '| hd', Object.keys(hd).join(','), '|', Object.keys(tex).join(','), '| icons', Object.keys(icons).length, '| textures', Object.keys(textures).join(','));
  if (pack !== 'base') console.log(`assets.gen.ts 资产包 ${pack}：用到比赛资产 ${A.used().length} 个${A.used().length ? '：' + A.used().join(', ') : ''}`);
  // v1.0.8：内容包自带图标 src/dlc/<id>/icons/*.jpg → src/dlc/<id>/icons.gen.ts（只被包代码 import，本体产物不含）
  const jpgDir = (d, target) => { if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.jpg')) target[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + readFileSync(d + f).toString('base64'); };
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    const d = `src/dlc/${id}/icons/`;
    if (!existsSync(d)) continue;
    const m = {}; jpgDir(d, m);
    writeFileSync(`src/dlc/${id}/icons.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 的图标（本项目原创，见 assets/ART_LICENSE.md）\nexport const PACK_ICONS: Record<string, string> = ${JSON.stringify(m)};\n`);
    console.log(`src/dlc/${id}/icons.gen.ts | icons ${Object.keys(m).length}`);
  }
  // Rhett 11-18 DLC 欢迎动画 / 选角 HUD 图（src/dlc/<id>/selui/*.webp|*.webm → src/dlc/<id>/selui.gen.ts，只被包代码 import，本体产物不含）
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    const d = `src/dlc/${id}/selui/`; if (!existsSync(d)) continue;
    const m = {}; for (const f of readdirSync(d)) { const x = f.match(/^(\w+)\.(webp|webm)$/); if (x) m[x[1]] = `data:${x[2] === 'webm' ? 'video/webm' : 'image/webp'};base64,` + readFileSync(d + f).toString('base64'); }
    writeFileSync(`src/dlc/${id}/selui.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 欢迎动画 / 选角 HUD 图（03_概念图 07_DLC欢迎与HUD_1116、07_创角_1116）\nexport const SELUI: Record<string, string> = ${JSON.stringify(m)};\n`);
    console.log(`src/dlc/${id}/selui.gen.ts | ${Object.keys(m).length}`);
  }
  // v1.2.23：内容包专属的比赛模型 assets_aholo/<id>/creatures/*.glb → src/dlc/<id>/creatures.gen.ts（只被包代码 import，本体产物不含；base 包永远是空表 → 包代码回退程序化模型）
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    if (!existsSync(`src/dlc/${id}/boot.ts`)) continue;
    const m = {}; if (A.has(`${id}/creatures/`)) for (const f of A.list(`${id}/creatures/`)) if (f.endsWith('.glb')) m[f.replace('.glb', '')] = B64(A, `${id}/creatures/${f}`);
    if (A.has(`${id}/props/`)) for (const f of A.list(`${id}/props/`)) if (f.startsWith('scene_') && f.endsWith('.glb')) m[f.replace('.glb', '')] = B64(A, `${id}/props/${f}`);   // v1.2.45 场景件
    writeFileSync(`src/dlc/${id}/creatures.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 的比赛版怪物模型（Lux3D，仅比赛授权，见 assets_aholo/README.md；商用 base 包为空）\nexport const PACK_CREATURE_GLB: Record<string, string> = ${JSON.stringify(m)};\n`);
    if (Object.keys(m).length) console.log(`src/dlc/${id}/creatures.gen.ts | ${Object.keys(m).join(',')}`);
  }
  // v1.2.50：内容包比赛版贴图 assets_aholo/<id>/textures/*.jpg → src/dlc/<id>/textures.gen.ts（data URI，只被包代码 import；base 包为空表 → 包代码程序化回退）
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    if (!existsSync(`src/dlc/${id}/boot.ts`)) continue;
    const m = {}; if (A.has(`${id}/textures/`)) for (const f of A.list(`${id}/textures/`)) if (f.endsWith('.jpg')) m[f.replace('.jpg', '')] = URI(A, `${id}/textures/${f}`, 'image/jpeg');
    writeFileSync(`src/dlc/${id}/textures.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 的比赛版贴图（仅比赛授权，见 assets_aholo/README.md；商用 base 包为空）\nexport const PACK_TEXTURES: Record<string, string> = ${JSON.stringify(m)};\n`);
    if (Object.keys(m).length) console.log(`src/dlc/${id}/textures.gen.ts | ${Object.keys(m).join(',')}`);
  }
  // v1.2.48：内容包配音 assets_aholo/<id>/audio/vo/*.mp3 → src/dlc/<id>/audio.gen.ts（data URI 内联，只被包代码 import）；包曲目 <id>/audio/music/*.mp3 只登记名字（文件复制到 web/music/）
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    if (!existsSync(`src/dlc/${id}/boot.ts`)) continue;
    const vo = {}; if (A.has(`${id}/audio/vo/`)) for (const f of A.list(`${id}/audio/vo/`)) if (f.endsWith('.mp3')) vo[f.replace('.mp3', '')] = URI(A, `${id}/audio/vo/${f}`, 'audio/mpeg');
    const mus = A.has(`${id}/audio/music/`) ? A.list(`${id}/audio/music/`).filter(f => f.endsWith('.mp3')).map(f => f.replace('.mp3', '')) : [];
    writeFileSync(`src/dlc/${id}/audio.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 的比赛版配音（MiniMax 生成，仅比赛授权，见 assets_aholo/README.md；商用 base 包为空）与曲目名\nexport const PACK_VO: Record<string, string> = ${JSON.stringify(vo)};\nexport const PACK_MUSIC: string[] = ${JSON.stringify(mus)};\n`);
    if (Object.keys(vo).length || mus.length) console.log(`src/dlc/${id}/audio.gen.ts | 配音 ${Object.keys(vo).length} | 曲目 ${mus.join(',')}`);
  }
  // v1.2.73：内容包铸造 CG assets_aholo/<id>/forge_cg/*.webm → src/dlc/<id>/forgecg.gen.ts（data URI 内联，只被包代码 import；base 包为空表 → 退回熔岩 brew）
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) {
    if (!existsSync(`src/dlc/${id}/forgecg.ts`)) continue;
    const m = {}; if (A.has(`${id}/forge_cg/`)) for (const f of A.list(`${id}/forge_cg/`)) if (f.endsWith('.webm')) m[f.replace('.webm', '')] = URI(A, `${id}/forge_cg/${f}`, 'video/webm');
    writeFileSync(`src/dlc/${id}/forgecg.gen.ts`, `// 自动生成：node gen-assets.mjs —— 内容包 ${id} 的铸造 CG（Seedance 2.0 生成，仅比赛授权，见 assets_aholo/README.md；商用 base 包为空）\nexport const PACK_FORGE_CG: Record<string, string> = ${JSON.stringify(m)};\n`);
    if (Object.keys(m).length) console.log(`src/dlc/${id}/forgecg.gen.ts | ${Object.keys(m).join(',')}`);
  }
  liteProcess();
  return A.used();
}

/** v1.2.54 展示版（只放 DLC 展示路径要用的资产，提升加载速度）：
 *  ASSET_TRACK=1 → 生成的资产表包一层 Proxy，运行时把读到的键记进 globalThis.__assetUse（dev/assetuse.mjs 跑评委路径导出 tools/lite-assets.json）
 *  ASSET_LITE=<json> → 只保留 json.keep 里的「表名:键」（json.keepTables 整表保留，json.keepPrefix 按前缀保留） */
function liteProcess() {
  const track = process.env.ASSET_TRACK === '1', liteF = process.env.ASSET_LITE, split = process.env.ASSET_SPLIT === '1', raid = process.env.ASSET_RAID === '1';
  // A10 长副本按需加载：ASSET_RAID=1 → 内容包 PACK_CREATURE_GLB 里的首领正式绑骨件（<id>_boss）拆出单页，放 globalThis.__assetRaid，build-web 写成 raid/*.js（进副本时再加载，失败回退静态件）
  const raidMoved = (globalThis.__assetRaid = {});
  if (raid) for (const id of existsSync('src/dlc/') ? readdirSync('src/dlc/') : []) {
    const f = `src/dlc/${id}/creatures.gen.ts`; if (!existsSync(f)) continue;
    writeFileSync(f, readFileSync(f, 'utf8').split('\n').map(line => {
      const m = line.match(/^export const (PACK_CREATURE_GLB): Record<string, string> = (\{.*\});$/); if (!m) return line;
      const o = JSON.parse(m[2]); for (const k of Object.keys(o)) if (k.endsWith('_boss')) { raidMoved[k] = o[k]; delete o[k]; }
      return `export const ${m[1]}: Record<string, string> = ${JSON.stringify(o)};`;
    }).join('\n'));
  }
  // 11-07 比赛版单文件超过 V8 字符串上限（约 512 MB）：钟井专用的回廊 / 栈道贴图（TILE_TEX 里 wa* 开头）也拆进 raid/*.js，键名加前缀 tex:（well_arcade_hd 按需取）
  if (raid && existsSync('src/web/assets.gen.ts')) { const f = 'src/web/assets.gen.ts';
    writeFileSync(f, readFileSync(f, 'utf8').split('\n').map(line => {
      const m = line.match(/^export const (TILE_TEX): Record<string, string> = (\{.*\});$/); if (!m) return line;
      const o = JSON.parse(m[2]); for (const k of Object.keys(o)) if (/^(wa[a-z]+|wellblocks|wellbricks|wellraw|wellmoss|wellhole)_/.test(k)) { raidMoved['tex:' + k] = o[k]; delete o[k]; }
      return `export const ${m[1]}: Record<string, string> = ${JSON.stringify(o)};`;
    }).join('\n')); }
  if (raid && Object.keys(raidMoved).length) console.log(`长副本按需加载：拆出 ${Object.keys(raidMoved).length} 件首领绑骨件，约 ${(Object.values(raidMoved).reduce((a, v) => a + v.length, 0) / 1048576).toFixed(1)} MB（base64）`);
  if (!track && !liteF && !split) return;
  // v1.2.54 分包加载：ASSET_SPLIT=1 → 只拆本体 CREATURE_GLB（评委路径用不到的怪物模型），拆出的放 globalThis.__assetSplit，build-web 写成 lazy/*.js
  const L = split ? JSON.parse(readFileSync('tools/lite-assets.json', 'utf8')) : liteF ? JSON.parse(readFileSync(liteF, 'utf8')) : null;
  const moved = (globalThis.__assetSplit = {});
  const keep = new Set(L?.keep ?? []), keepT = new Set(L?.keepTables ?? []), keepP = L?.keepPrefix ?? [];
  const files = ['src/web/assets.gen.ts'];
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) for (const g of ['creatures', 'textures', 'audio']) if (existsSync(`src/dlc/${id}/${g}.gen.ts`)) files.push(`src/dlc/${id}/${g}.gen.ts`);
  let drop = 0, dropB = 0;
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n').map(line => {
      const m = line.match(/^export const (\w+): Record<string, string> = (\{.*\});$/); if (!m) return line;
      const [, T] = m; let o = JSON.parse(m[2]);
      if (L && !keepT.has(T) && (!split || T === 'CREATURE_GLB')) o = Object.fromEntries(Object.entries(o).filter(([k, v]) => { const ok = keep.has(`${T}:${k}`) || keepP.some(p => `${T}:${k}`.startsWith(p)); if (!ok) { drop++; dropB += v.length; if (split) moved[k] = v; } return ok; }));
      const js = JSON.stringify(o);
      return track ? `export const ${T}: Record<string, string> = ((t: string, o: Record<string, string>) => new Proxy(o, { get(a, k) { if (typeof k === 'string' && k in a) ((globalThis as any).__assetUse ??= {})[t + ':' + k] = 1; return (a as any)[k]; }, ownKeys(a) { ((globalThis as any).__assetEnum ??= {})[t] = 1; return Reflect.ownKeys(a); } }))(${JSON.stringify(T)}, ${js});` : `export const ${T}: Record<string, string> = ${js};`;
    });
    writeFileSync(f, lines.join('\n'));
  }
  if (L) console.log(`${split ? '分包加载（延后）' : '展示版资产'}：去掉 ${drop} 项，约 ${(dropB / 1048576).toFixed(1)} MB（base64）`);
  if (track) console.log('资产追踪已开启（ASSET_TRACK=1）');
}

/** v1.2.48 比赛版曲目文件（本体 audio/music + 各内容包 <id>/audio/music）：[相对资产路径, 曲目名] */
export function musicFiles(pack = 'base') {
  const A = assetView(pack), out = [];
  if (A.has('audio/music/')) for (const f of A.list('audio/music/')) if (f.endsWith('.mp3')) out.push(['audio/music/' + f, f]);
  if (existsSync('src/dlc/')) for (const id of readdirSync('src/dlc/')) if (A.has(`${id}/audio/music/`)) for (const f of A.list(`${id}/audio/music/`)) if (f.endsWith('.mp3')) out.push([`${id}/audio/music/${f}`, f]);
  return out.map(([rel, f]) => ({ rel, name: f, data: () => A.read(rel) }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { const p = packFromArgv(); genAssets(p, { ktx2: ktx2FromArgv(p) }); }
