// lux3d.mjs — Lux3D（Aholo 国内站）命令行：文生 / 图生 / 多图生 3D、概念图、四视图、绑骨、动作重定向，生成后自动减面 + webp + meshopt，并写资产登记表
// 出自《暗岩传说：深渊回响》Aholo 黑客松参赛工程（MIT）。
//
// Key：只从环境变量 AHOLO_API_KEY 读，不写入任何文件 / 日志。国内站 https://api.aholo3d.cn（AHOLO_API_BASE 可改）。
// 代理：Node 22 的 fetch 默认不读 HTTPS_PROXY，需要时加 NODE_USE_ENV_PROXY=1。
// 输出：LUX3D_OUT_DIR（默认 ./assets）；原始件 LUX3D_RAW_DIR（默认 ./lux3d_raw）；日志 LUX3D_LOG（默认 ./lux3d_log.jsonl）；
//       每个产物在 <LUX3D_OUT_DIR>/README.md 的登记表里留一行（用途 / 工具 / 输入 / 任务号 / 积分 / 减面前后）。
//
// 用法：
//   node bin/lux3d.mjs ping                                       连通测试（只查任务列表，不花积分）
//   node bin/lux3d.mjs gen --text "提示词" [--image 参考图] [--mode turbo|standard] [--style photorealistic|hand_painted]
//        [--faces 30000] [--target 8000] [--tex 1024] --out props/axe.glb --use "用途" [--force]
//        turbo = G1-Turbo（约 1 积分，约 20 秒），standard = G1（约 20 积分）
//   node bin/lux3d.mjs gen --images a.png,b.png,c.png,d.png --mode standard --out chars/hero.glb --use "主角"   多图（四视图）生 3D
//   node bin/lux3d.mjs img --prompt "概念图描述" [--image 参考] --save concept.png      概念图
//   node bin/lux3d.mjs fourview --image concept.png --save views/                      四视图
//   node bin/lux3d.mjs rig <glb 或 URL> --save rigged.glb                              人形自动绑骨
//   node bin/lux3d.mjs status <taskId>  /  fetch <taskId> --out ... --use ...          查询 / 补下载（结果链接 2 小时有效）
//   node bin/lux3d.mjs post <原始.glb> --out ... --use ...                             只做后处理 + 登记（网页工作台下载的 GLB）
//   通用：--dry-run --sample <glb>（不调 API，演练后处理和登记）
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, appendFileSync } from 'fs';
import { dirname, join, resolve, extname, basename } from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier as Simp13 } from 'meshoptimizer-next';   // meshoptimizer 1.3：Permissive（允许跨 UV 接缝减面，Lux3D 贴图接缝多，0.18 减不下去）
const MeshoptSimplifier = { ready: Simp13.ready, simplify: (i, p, s, t, e, f = []) => Simp13.simplify(i, p, s, t, e, [...f, 'Permissive']) };
import sharp from 'sharp';
import { execFileSync } from 'child_process';
const AHOLO_DIR = process.env.LUX3D_OUT_DIR || 'assets';
const BASE_DIR = process.env.LUX3D_BASE_DIR || '';   // 可选：「原有资产」目录，同路径文件登记为「替换」

const API = process.env.AHOLO_API_BASE || 'https://api.aholo3d.cn';
const RAW_DIR = process.env.LUX3D_RAW_DIR || 'lux3d_raw';
const LOG = process.argv.includes('--dry-run') ? 'lux3d_log_dryrun.jsonl' : (process.env.LUX3D_LOG || 'lux3d_log.jsonl');   // 演练不写正式记录
const CREDITS = { turbo: 1, standard: 20 };   // 估算（10-24 官网说明）；真实扣分以 Aholo 账号积分记录为准，报告前核对
const VERSION = { turbo: 'G1-Turbo', standard: 'G1' };

// ---------------------------------------------------------------- 参数
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = {}; const pos = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; opt[k] = v; } else pos.push(a);
}
const die = m => { console.error('✗ ' + m); process.exit(1); };
const now = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);   // 北京时间

function key() {
  const k = process.env.AHOLO_API_KEY;
  if (!k) die('没有 AHOLO_API_KEY：export AHOLO_API_KEY=...（用完 unset，不要写进文件）');
  return k.trim();
}
/** 打印时把 Key 打码（防止报错信息带出来） */
const mask = s => { const k = process.env.AHOLO_API_KEY; return k ? String(s).split(k.trim()).join('***') : String(s); };

async function api(method, path, body, tries = 4) {
  for (let i = 0; ; i++) {
    let r, text;
    try {
      r = await fetch(API + path, { method, headers: { Authorization: key(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
      text = await r.text();
    } catch (e) { if (i < tries) { await sleep(2000 * 2 ** i); continue; } die(`网络错误 ${path}：${mask(e.message)}`); }
    if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(2000 * 2 ** i); continue; }
    let j; try { j = JSON.parse(text); } catch { die(`${method} ${path} HTTP ${r.status}：${mask(text.slice(0, 300))}`); }
    if (r.status === 401 || r.status === 403) die(`鉴权失败（HTTP ${r.status}）：检查 Key 是否为国内站 labs.aholo3d.cn 申请的。${mask(JSON.stringify(j).slice(0, 300))}`);
    if (j.c !== undefined && j.c !== '0') die(`${path} 业务错误 c=${j.c}：${mask(j.m || JSON.stringify(j.f))}`);
    if (!r.ok) die(`${method} ${path} HTTP ${r.status}：${mask(JSON.stringify(j).slice(0, 300))}`);
    return j;
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 上传本地参考图（官方 SDK，内部走 OUS 分片）
async function imageUrl(src) {
  if (/^https?:\/\//.test(src)) return src;
  if (!existsSync(src)) die(`找不到参考图 ${src}`);
  const { createAssetClient } = await import('@manycore/aholo-sdk-asset');
  const asset = createAssetClient({ region: 'cn', apiKey: key() });
  // 先压成 ≤1280 的 JPEG（原图 1 MB 级 PNG 经代理上传会 60 秒超时，10-24 实测），失败重试 3 次
  const buf = await sharp(src).resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
  for (let i = 0; ; i++) {
    try { const r = await asset.uploadBuffer(buf, { filename: basename(src).replace(/\.\w+$/, '.jpg'), partTimeoutMs: 180000 }); console.log(`  参考图已上传：${basename(src)}（${(buf.length / 1024).toFixed(0)} KB）`); return r.url; }
    catch (e) { if (i >= 2) die(`参考图上传失败：${basename(src)}：${mask(e.message)}`); await sleep(3000); }
  }
}

// ---------------------------------------------------------------- 任务
async function createTask(o) {
  const mode = o.mode === 'standard' ? 'standard' : 'turbo';
  const faceCount = Math.max(10000, Math.min(300000, Number(o.faces) || (mode === 'turbo' ? 30000 : 100000)));
  const common = { version: VERSION[mode], faceCount, outputFormat: ['glb'], aiPredictSize: false };
  let path, body;
  if (o.text) {
    path = '/lux3d/v1/generate/text-to-3d/task/create';
    body = { ...common, prompt: String(o.text), style: o.style || 'hand_painted' };
    if (o.image) body.img = await imageUrl(o.image);
  } else if (o.images) {            // 多图（四视图）：--images a.png,b.png,...，第一张为主参考
    path = '/lux3d/v1/generate/img-to-3d/task/create';
    body = { ...common, imgs: await (async () => { const out = []; for (const x of String(o.images).split(',')) out.push(await imageUrl(x)); return out; })() };   // 逐张上传，避免并发超时
  } else if (o.image) {
    path = '/lux3d/v1/generate/img-to-3d/task/create';
    body = { ...common, img: await imageUrl(o.image) };
  } else die('gen 需要 --text / --image / --images');
  const j = await api('POST', path, body);
  return { taskId: j.d, mode, faceCount, kind: o.text ? 'text' : 'image', style: body.style };
}

async function waitTask(taskId, timeoutMs = 15 * 60 * 1000) {
  const t0 = Date.now(); let last = -1;
  for (;;) {
    const j = await api('GET', `/lux3d/v1/generate/task/get?taskid=${taskId}`);
    const d = j.d || {};
    if (d.status !== last) { console.log(`  任务 ${taskId} 状态 ${({ 0: '初始化', 1: '进行中', 3: '成功', 4: '失败', 6: '已取消' })[d.status] ?? d.status}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`); last = d.status; }
    if (d.status === 3) return { outputs: (d.outputs || []).map(x => x.content).filter(c => c && c !== 'NOT_REQUESTED'), seconds: (Date.now() - t0) / 1000 };
    if (d.status === 4 || d.status === 6) die(`任务 ${taskId} ${d.status === 4 ? '失败' : '已取消'}：${JSON.stringify(j.f || d).slice(0, 300)}`);
    if (Date.now() - t0 > timeoutMs) die(`任务 ${taskId} 超时（${timeoutMs / 60000} 分钟），稍后用 status / fetch 补`);
    await sleep(4000);
  }
}

/** 立即下载全部结果（链接 2 小时有效），返回本地 GLB 路径 */
async function download(taskId, urls) {
  const dir = join(RAW_DIR, String(taskId)); mkdirSync(dir, { recursive: true });
  let glb = null;
  // v1.2.26：有 GLB 就不再下载 result.zip（同一模型的打包件，CDN 慢，白等一倍时间）
  const hasGlb = urls.some(u => /\.glb$/i.test(new URL(u).pathname));
  for (const u of urls) {
    const name = basename(new URL(u).pathname) || 'out.bin';
    if (hasGlb && /\.zip$/i.test(name)) continue;
    // 用 curl 下载：Node fetch 走代理时大文件会卡住（10-24 实测 9 MB GLB 120 秒超时，curl 2 秒）
    try { execFileSync('curl', ['-sSfL', '--retry', '3', '-m', '600', '-o', join(dir, name), u]); } catch (e) { die(`下载失败：${name}（${e.message.split('\n')[0]}）`); }
    const buf = readFileSync(join(dir, name));
    console.log(`  已下载 ${name} ${(buf.length / 1024).toFixed(0)} KB`);
    if (extname(name).toLowerCase() === '.glb' || buf.subarray(0, 4).toString() === 'glTF') glb = join(dir, name);
  }
  if (!glb) die(`任务 ${taskId} 结果里没有 GLB（${urls.length} 个文件，见 ${dir}）`);
  return glb;
}

// ---------------------------------------------------------------- 后处理：减面 + 贴图 webp + meshopt 压缩
const tris = doc => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : (p.getAttribute('POSITION')?.getCount() ?? 0)) / 3, 0), 0);

export async function postProcess(src, dst, { target = 8000, tex = 1024 } = {}) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(src);
  const before = Math.round(tris(doc));
  const ratio = Math.min(1, target / Math.max(1, before));
  await doc.transform(weld(), dedup());
  // 减面：误差上限逐步放宽，直到面数落到目标 115% 以内（Lux3D 标准版约 28 万面，游戏里角色 / 道具 0.5–1.5 万面）
  for (const error of [0.01, 0.03, 0.06, 0.12, 0.25]) {
    const cur = tris(doc); if (cur <= target * 1.15) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / cur), error, lockBorder: false }));
  }
  const steps = [prune()];
  if (doc.getRoot().listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }));
  steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  const after = Math.round(tris(doc));
  mkdirSync(dirname(dst), { recursive: true });
  await io.write(dst, doc);
  return { before, after, rawKB: Math.round(statSync(src).size / 1024), outKB: Math.round(statSync(dst).size / 1024), textures: doc.getRoot().listTextures().length };
}

// ---------------------------------------------------------------- 登记
function outPath(rel) {
  if (!rel) die('需要 --out <相对输出目录的路径>，如 props/axe.glb');
  rel = String(rel).replace(/^\/+/, '');
  if (rel.includes('..')) die(`--out 不能含 ..：${rel}`);
  if (!rel.endsWith('.glb')) die('--out 必须是 .glb');
  return rel;
}
const cell = s => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

function register(rel, info) {
  const readme = join(AHOLO_DIR, 'README.md');
  const replace = !!BASE_DIR && existsSync(join(BASE_DIR, rel));
  if (!existsSync(readme)) { mkdirSync(AHOLO_DIR, { recursive: true }); writeFileSync(readme, '# 生成资产登记\n\n| 文件 | 替换 / 新增 | 用途 | 工具 | 输入 | 任务号 / 日期 | 积分 | 后处理 | 授权 |\n|---|---|---|---|---|---|---|---|---|\n'); }
  const row = `| \`${rel}\` | ${replace ? '替换' : '新增'} | ${cell(info.use)} | ${cell(info.tool)} | ${cell(info.input)} | ${cell(info.task)} | ${cell(info.credits)} | ${cell(info.post)} | 以 Aholo / Lux3D 用户协议为准 |`;
  const lines = readFileSync(readme, 'utf8').split('\n');
  const i = lines.findIndex(l => l.startsWith(`| \`${rel}\` |`));
  if (i >= 0) lines[i] = row;   // 重新生成同一文件：覆盖登记行
  else {
    // 插到登记表最后一行后面
    let last = lines.findLastIndex(l => /^\|.*\|\s*$/.test(l));
    lines.splice(last + 1, 0, row);
  }
  writeFileSync(readme, lines.join('\n'));
  return replace;
}

function logJson(o) { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, JSON.stringify(o) + '\n'); }

async function finish(rawGlb, rel, meta) {
  const dst = join(AHOLO_DIR, rel);
  if (existsSync(dst) && !opt.force) die(`${dst} 已存在，覆盖请加 --force`);
  const r = await postProcess(rawGlb, dst, { target: Number(opt.target) || 8000, tex: Number(opt.tex) || 1024 });
  const replace = register(rel, {
    use: opt.use || '（未写用途）',
    tool: meta.tool,
    input: meta.input,
    task: `${meta.taskId ?? '手动'} / ${now().slice(0, 10)}`,
    credits: meta.credits ?? '',
    post: `${r.before}→${r.after} 面，${r.rawKB}→${r.outKB} KB，webp ${Number(opt.tex) || 1024}，meshopt`,
  });
  const entry = { time: now(), file: rel, replace, ...meta, seconds: meta.seconds ? Math.round(meta.seconds) : null, facesBefore: r.before, facesAfter: r.after, rawKB: r.rawKB, outKB: r.outKB };
  logJson(entry);
  console.log(`✓ ${dst}  ${replace ? '替换' : '新增'}  ${r.before}→${r.after} 面  ${r.rawKB}→${r.outKB} KB  已登记 ${AHOLO_DIR}/README.md`);
  return entry;
}

// ---------------------------------------------------------------- 图像 / 四视图 / 绑骨 / 重定向（v1.2.23）
async function runTask(path, body, label) {
  const t0 = Date.now();
  const j = await api('POST', path, body);
  console.log(`  已创建${label}任务 ${j.d}`);
  const w = await waitTask(j.d);
  logJson({ time: now(), kind: label, taskId: j.d, seconds: Math.round((Date.now() - t0) / 1000), input: body.prompt || body.modelUrl || body.rigModelUrl || '', note: opt.note || '' });
  return { taskId: j.d, outputs: w.outputs };
}
function saveUrl(u, file) { mkdirSync(dirname(file), { recursive: true }); execFileSync('curl', ['-sSfL', '--retry', '3', '-m', '600', '-o', file, u]); console.log(`  已保存 ${file} ${(statSync(file).size / 1024).toFixed(0)} KB`); }
async function refUrl(src) { return src ? (/^https?:/.test(src) ? src : await imageUrl(src)) : undefined; }
async function modelUrl(src) {
  if (/^https?:/.test(src)) return src;
  const { createAssetClient } = await import('@manycore/aholo-sdk-asset');
  const r = await createAssetClient({ region: 'cn', apiKey: key() }).uploadFile(src);
  console.log(`  模型已上传：${basename(src)}`); return r.url;
}

// ---------------------------------------------------------------- 命令
if (cmd === 'ping') {
  const t0 = Date.now();
  const j = await api('GET', '/lux3d/v1/generate/task/list?page=1&pageSize=5');
  console.log(`✓ 连通 ${API}（${Date.now() - t0} ms），Key 有效，历史任务 ${j.d?.total ?? '?'} 个`);
} else if (cmd === 'gen') {
  const rel = outPath(opt.out);
  if (!opt.use) die('需要 --use "用途"（登记表必填）');
  let raw, meta;
  const mode = opt.mode === 'standard' ? 'standard' : 'turbo';
  const input = [opt.text ? `文：${opt.text}` : '', opt.image ? `图：${basename(String(opt.image))}` : '', opt.images ? `多图：${String(opt.images).split(',').map(x => basename(x)).join('+')}` : ''].filter(Boolean).join('；');
  if (opt['dry-run']) {
    if (!opt.sample) die('--dry-run 需要 --sample <glb>');
    raw = String(opt.sample); meta = { taskId: 'dry-run', tool: `Lux3D ${VERSION[mode]}（演练）`, input, credits: 0, seconds: 0, mode };
  } else {
    const t0 = Date.now();
    const t = await createTask({ ...opt, mode });
    console.log(`  已创建任务 ${t.taskId}（${VERSION[mode]}，${t.kind === 'text' ? '文生' : '图生'}，${t.faceCount} 面${t.style ? '，' + t.style : ''}）`);
    const w = await waitTask(t.taskId);
    raw = await download(t.taskId, w.outputs);
    meta = { taskId: t.taskId, tool: `Lux3D ${VERSION[mode]} ${t.kind === 'text' ? '文生' : '图生'}${t.style ? ' ' + t.style : ''}`, input, credits: `约 ${CREDITS[mode]}`, seconds: (Date.now() - t0) / 1000, genSeconds: w.seconds, mode, faceCount: t.faceCount };
  }
  await finish(raw, rel, meta);
} else if (cmd === 'post') {
  const src = pos[0]; if (!src || !existsSync(src)) die('post 需要原始 GLB 路径');
  await finish(src, outPath(opt.out), { taskId: opt.task || null, tool: opt.tool || 'Lux3D（网页工作台）', input: opt.prompt || '', credits: opt.credits ?? '' });
} else if (cmd === 'img') {          // 概念图：--prompt [--image 参考] --save x.png
  const body = {}; if (opt.prompt) body.prompt = String(opt.prompt); const ref = await refUrl(opt.image); if (ref) body.img = ref;
  const r = await runTask('/lux3d/v1/generate/multimodal-to-image/task/create', body, '单图');
  saveUrl(r.outputs[0], String(opt.save || `/tmp/lux3d_img_${r.taskId}.png`));
} else if (cmd === 'fourview') {     // 四视图：--prompt / --image --save 目录（输出 1_front34 2_opp34 3_side 4_back）
  const body = {}; if (opt.prompt) body.prompt = String(opt.prompt); const ref = await refUrl(opt.image); if (ref) body.img = ref;
  const r = await runTask('/lux3d/v1/generate/image-to-four-view/task/create', body, '四视图');
  const urls = JSON.parse(r.outputs[0]); const dir = String(opt.save || `/tmp/lux3d_4v_${r.taskId}`);
  ['1_front34', '2_opp34', '3_side', '4_back'].forEach((n, i) => saveUrl(urls[i], join(dir, n + extname(new URL(urls[i]).pathname || '.png') || '.png')));
} else if (cmd === 'rig') {          // 数字人自动绑骨：rig <glb 或 URL> --save x.glb
  const r = await runTask('/lux3d/v1/animations/rig/task/create', { modelUrl: await modelUrl(pos[0]) }, '绑骨');
  if (r.outputs[0].trim().startsWith('{')) die('绑骨失败：' + r.outputs[0].slice(0, 300));
  saveUrl(r.outputs[0], String(opt.save || join(RAW_DIR, r.taskId + '_rig.glb')));
} else if (cmd === 'retarget') {     // 动画重定向：retarget <已绑骨 glb> --anims Idle_Loop,Walk_Loop --save 目录 [--combined] [--inplace]
  const r = await runTask('/lux3d/v1/animations/retarget/task/create', { rigModelUrl: await modelUrl(pos[0]), animationIds: String(opt.anims).split(','), animationOutputMode: opt.combined ? 'combined' : 'separate', outFormat: 'glb', animateInPlace: !!opt.inplace }, '重定向');
  const j = JSON.parse(r.outputs[0]); const dir = String(opt.save || join(RAW_DIR, r.taskId + '_anims'));
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'result.json'), JSON.stringify(j, null, 1));
  for (const a of j.actions || []) { const u = a.url || a.resultUrl || a.content; if (u) saveUrl(u, join(dir, (a.id || a.animationId || a.name || 'anim') + '.glb')); else console.log('  动作失败', JSON.stringify(a).slice(0, 200)); }
} else if (cmd === 'status') {
  const j = await api('GET', `/lux3d/v1/generate/task/get?taskid=${pos[0]}`);
  console.log(JSON.stringify(j.d, null, 1));
} else if (cmd === 'fetch') {
  const id = pos[0]; if (!id) die('fetch 需要 taskId');
  const w = await waitTask(id, 60000);
  const raw = await download(id, w.outputs);
  await finish(raw, outPath(opt.out), { taskId: id, tool: opt.tool || 'Lux3D', input: opt.prompt || '', credits: opt.credits ?? '' });
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 20).join('\n'));
}
