// ======================================================================
// 《暗岩传说》铸造台云函数 / 服务（v1.2.46 异步任务版）
// 运行方式：魔搭 Docker 创空间里由 deploy/modelscope/server.js 常驻进程调用 handler（推荐，后台任务可持续运行）；
//   也兼容阿里云 FC 3.0 HTTP 触发器风格的 event（FC 需开启「实例保活」或最大实例数 = 1，否则后台轮询可能被冻结，
//   不过每次查询状态时会自动接着推进任务，不会丢）。
// 作用：替前端调用 Lux3D（Aholo）文生 3D，Key 只在服务端环境变量里，前端不含 Key。
//
// 接口（与游戏前端 src/dlc/dlc1/smithy.ts 约定一致）：
//   POST /forge   body { prompt, weaponType }
//     → 200 { taskId, state:'queued' }       秒回：Lux3D 任务已创建（此时就计次，积分已花）
//     → 4xx/5xx { error: "中文原因" }         没创建任务（不计次）；前端退回离线武器库
//   GET  /forge/status/<taskId>
//     → 200 { taskId, state: queued|generating|downloading|done|failed, error?, size?, url? }
//        done 时 url = 'glb/<taskId>'（相对地址，前端以铸造服务地址解析；不再 base64 内联、不用 Host 头拼绝对地址）
//   GET  /glb/<taskId>    游戏版模型（减面 + 1024 贴图，二进制，带 CORS），支持 Range: bytes=a-b → 206 分块
//   GET  /glb/<taskId>/hd 高精度版（v1.2.54：原始几何不减面 + 2048 JPEG 贴图，展示窗用；status/mine 里 done 时带 hdUrl / hdSize，没有 = 只有游戏版）
//   GET  /health          { ok, today, used, limit, perIp, active, claim, eta, last:{ time, state, error, size, ms } }（不花积分）
//   v1.2.47 定时领取模式（FORGE_CLAIM=1，魔搭专用开关）：
//   POST /forge 可带 dev（设备 ID）→ 回 { taskId, state, claim:true, eta, readyAt }（readyAt = 创建时刻 + eta 秒，到点才可领取）
//   GET  /forge/mine?dev=<设备 ID>  → { claim, eta, tasks:[{ taskId, state, prompt, type, readyAt, url?, size?, error?, retry? }] }
//        本设备还没领取的任务；老页面没带 dev 的任务按 IP 认领（玩家永远不用手动粘贴 taskId）
//   POST /forge/claimed/<taskId> { dev }  → 标记已领取（不再出现在 mine 里）
//
// 后台流程（每个任务）：创建 → 每 POLL_MS 轮询 Lux3D → 完成后下载 .glb → 贴图压到 ≤1024 JPEG（glbslim.js，纯 JS）→ 存盘 GLB_DIR
//   任务表落盘（TASKS_FILE），进程重启后自动续跑未完成的任务；查询状态时若任务没人推进也会自动续跑。
//
// 环境变量（不要写进代码 / 仓库）：
//   AHOLO_API_KEY     必填，Aholo 国内站 API Key（Authorization 头直接放原始 Key，不加 Bearer）
//   DAILY_LIMIT       全站每日上限，默认 5（G1-Turbo 实测约 13 积分/次）
//   PER_IP_LIMIT      每 IP 每日上限，默认 2
//   ALLOW_ORIGIN      允许的前端来源，默认 *
//   FACE_COUNT        面数，默认 12000
//   TEX_MAX           贴图最大边长，默认 1024；TEX_QUALITY JPEG 质量，默认 85
//   GAME_FACES        游戏版减面目标（三角面），默认 6000，0 = 不减；FORGE_HD=0 不生成高精度版；HD_TEX_MAX 默认 2048，HD_TEX_QUALITY 默认 90
//   GLB_DIR           模型 + 任务表目录，默认 /tmp/forge_glb；TASKS_FILE 默认 <GLB_DIR>/tasks.json
//   KEEP_RAW          =1 时同时保留 Lux3D 原始 GLB（<id>.raw.glb，排查 / 对照用）
//   FORGE_CLAIM       =1 开启定时领取模式（魔搭创空间设；本地 / 离线不设 = 原来的即时模式）；CLAIM_ETA_S 锻造时长，默认 120 秒
// 计次：拿到 Lux3D taskId 才计次（请求已发出 = 积分已花）；Lux3D 创建失败不计次。
// ======================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { slimGlb, decimateGlb, countTris } = require('./glbslim');

const API = process.env.AHOLO_API_BASE || 'https://api.aholo3d.cn';
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const DAILY = () => Number(env('DAILY_LIMIT', 5));
const PER_IP = () => Number(env('PER_IP_LIMIT', 2));
const ORIGIN = env('ALLOW_ORIGIN', '*');
const FACES = Math.max(5000, Math.min(60000, Number(env('FACE_COUNT', 12000))));
const TEX_MAX = Number(env('TEX_MAX', 1024)), TEX_Q = Number(env('TEX_QUALITY', 85));
// v1.2.54 双档：游戏版（减面到 GAME_FACES + 1024 贴图，角色手持）/ 高精度版（原始几何不减面 + HD_TEX_MAX 贴图，展示窗）
const GAME_FACES = Number(env('GAME_FACES', 6000)), HD_ON = env('FORGE_HD', '1') !== '0';
const HD_TEX_MAX = Number(env('HD_TEX_MAX', 2048)), HD_TEX_Q = Number(env('HD_TEX_QUALITY', 90));
const POLL_MS = Number(env('POLL_MS', 3000));
const TASK_MAX_MS = Number(env('TASK_MAX_MS', 10 * 60e3));   // 单个任务最长等 10 分钟（Lux3D 原链接 2 小时过期）
const KEEP_MS = Number(env('GLB_KEEP_H', 48)) * 3600e3;
const DL_MS = Number(env('DL_TIMEOUT_MS', 60000)), DL_TRIES = Number(env('DL_TRIES', 4)), DL_GAP = Number(env('DL_GAP_MS', 3000));
// v1.2.47 GLB_DIR 默认放持久盘（魔搭 /mnt/workspace，重启不丢任务表）；不可写就退回 /tmp
const GLB_DIR = (() => {
  const want = env('GLB_DIR', '/tmp/forge_glb');
  try { fs.mkdirSync(want, { recursive: true }); fs.accessSync(want, fs.constants.W_OK); return want; }
  catch (e) { console.log(`[forge] GLB_DIR ${want} 不可写，退回 /tmp/forge_glb`); return '/tmp/forge_glb'; }
})();
const CLAIM = () => env('FORGE_CLAIM', '') === '1';
const ETA_S = () => Math.max(1, Number(env('CLAIM_ETA_S', 120)));
const devOf = v => { const s = String(v || '').trim(); return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : ''; };
const STATE = env('STATE_FILE', path.join(GLB_DIR, 'forge_state.json'));
const TASKS_FILE = env('TASKS_FILE', path.join(GLB_DIR, 'tasks.json'));
const KEEP_RAW = env('KEEP_RAW', '') === '1';
const MAX_LEN = 40;
const BAN = ['政治', '色情', '裸', '血腥虐杀', '恐怖袭击', '毒品', '习近平', '法轮'];
const TYPES = new Set(['sword', 'greatsword', 'axe', 'greataxe', 'mace', 'staff', 'wand', 'dagger', 'chakram', 'flask', 'orb', 'tome', 'bow']);
const TYPE_ZH = { sword: '单手长剑', greatsword: '双手巨剑', axe: '单手战斧', greataxe: '双手巨斧', mace: '单手钉头锤', staff: '长法杖', wand: '短魔杖', dagger: '匕首', chakram: '圆形投掷飞刃', flask: '投掷药剂瓶', orb: '悬浮法球', tome: '魔法书', bow: '长弓' };

const log = (...a) => console.log(new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + ' [forge]', ...a);
try { fs.mkdirSync(GLB_DIR, { recursive: true }); } catch (e) { /* 只读盘 */ }

// ---------------------------------------------------------------- 计数（按北京时间算「今天」）
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
let st = { d: today(), n: 0, ip: {}, last: null };
try { const j = JSON.parse(fs.readFileSync(STATE, 'utf8')); if (j && j.d === st.d) st = { last: null, ...j }; else if (j && j.last) st.last = j.last; } catch (e) { /* 首次 */ }
const roll = () => { const d = today(); if (st.d !== d) st = { d, n: 0, ip: {}, last: st.last }; };
const save = () => { try { fs.writeFileSync(STATE, JSON.stringify(st)); } catch (e) { /* 只读盘就只在内存 */ } };

// ---------------------------------------------------------------- 任务表（落盘）
let tasks = {};
try { tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')) || {}; } catch (e) { tasks = {}; }
const saveTasks = () => { try { fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks)); } catch (e) { /* 只在内存 */ } };
const running = new Set();
const TERMINAL = new Set(['done', 'failed']);
function setState(t, state, extra = {}) {
  const from = t.state; Object.assign(t, extra, { state, tu: Date.now() }); saveTasks();
  if (from !== state) log(`task=${t.id} ${from || '-'} → ${state}${t.error ? ' 原因：' + t.error : ''}${state === 'done' ? ` size=${t.size}` : ''}`);
  if (TERMINAL.has(state)) { st.last = { time: new Date(t.tu + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + ' CST', taskId: t.id, state, error: t.error || null, size: t.size || null, raw: t.raw || null, ms: t.tu - t.t0 }; save(); }
}
function prune() {
  const now = Date.now();
  for (const [id, t] of Object.entries(tasks)) if (now - (t.t0 || 0) > KEEP_MS) {
    delete tasks[id];
    for (const f of [`${id}.glb`, `${id}.hd.glb`, `${id}.raw.glb`]) try { fs.unlinkSync(path.join(GLB_DIR, f)); } catch (e) { /* 没有 */ }
  }
  saveTasks();
}

// ---------------------------------------------------------------- 工具
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = () => (process.env.AHOLO_API_KEY || '').trim();
const mask = s => { const k = key(); return k && k.length > 6 ? String(s).split(k).join('***') : String(s); };
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges', 'Access-Control-Max-Age': '86400' };
const json = (code, o) => ({ statusCode: code, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(o) });
async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: key(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { throw new Error(`Lux3D HTTP ${r.status}`); }
  if (r.status === 401 || r.status === 403) throw new Error('Lux3D 鉴权失败（检查 AHOLO_API_KEY）');
  if (!r.ok) throw new Error(`Lux3D HTTP ${r.status}：${mask(JSON.stringify(j).slice(0, 120))}`);
  return j;
}
/** 把玩家的一句话包成稳定的生成提示：武器类型 + 暗黑奇幻游戏武器道具 + 单件、无底座（不再硬加材质，尊重玩家描述） */
function buildPrompt(p, type) {
  return `${p}。一把${TYPE_ZH[type] || '武器'}，暗黑奇幻游戏武器道具，单件完整、无底座、无手、白色背景，造型清晰。`;
}

// ---------------------------------------------------------------- 后台任务：轮询 → 下载 → 压缩 → 存盘
async function work(id) {
  const t = tasks[id]; if (!t || TERMINAL.has(t.state) || running.has(id)) return;
  running.add(id); log(`task=${id} 后台推进开始（当前 ${t.state}）`);
  try {
    let out = t.src || null, fails = 0;
    while (!out) {
      if (Date.now() - t.t0 > TASK_MAX_MS) throw new Error('生成超时（超过 10 分钟）');
      let d;
      try { const g = await api('GET', `/lux3d/v1/generate/task/get?taskid=${id}`); d = g.d || {}; fails = 0; }
      catch (e) { if (++fails >= 5 || /鉴权/.test(e.message)) throw e; log(`task=${id} 查询出错（第 ${fails} 次，继续）：${mask(e.message)}`); await sleep(POLL_MS); continue; }
      if (d.status === 3) {
        out = (d.outputs || []).map(x => x.content).filter(u => u && /\.glb(\?|$)/i.test(u))[0];
        if (!out) throw new Error('Lux3D 完成了但没有 .glb 输出');
        t.src = out; saveTasks(); break;
      }
      if (d.status === 4 || d.status === 6) throw new Error(`Lux3D 生成失败（状态 ${d.status}）`);
      if (d.status === 1 && t.state !== 'generating') setState(t, 'generating');
      await sleep(POLL_MS);
    }
    setState(t, 'downloading');
    // 下载：每次最多 60 秒，失败重试共 4 次（v1.2.46 实测：Lux3D 刚完成时偶发下载卡住 90 秒超时，几分钟后再取 2.5 秒就好）
    let raw = null, lastErr = '';
    for (let k = 1; k <= DL_TRIES && !raw; k++) {
      const t1 = Date.now();
      try {
        const r = await fetch(out, { signal: AbortSignal.timeout(DL_MS) });
        if (!r.ok) { lastErr = `模型下载失败（HTTP ${r.status}${r.status === 403 || r.status === 404 ? '，原链接可能已过期' : ''}）`; if (r.status === 403 || r.status === 404) break; }
        else { raw = Buffer.from(await r.arrayBuffer()); log(`task=${id} 下载完成 ${raw.length} 字节，用时 ${Date.now() - t1}ms（第 ${k} 次）`); }
      } catch (e) { lastErr = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? `模型下载超时（${Math.round(DL_MS / 1000)} 秒）` : `模型下载出错：${e && e.message}`; }
      if (!raw) { log(`task=${id} 第 ${k}/${DL_TRIES} 次下载失败：${lastErr}`); if (k < DL_TRIES) await sleep(DL_GAP); }
    }
    if (!raw) { t.dlFail = (t.dlFail || 0) + 1; throw new Error(lastErr || '模型下载失败'); }
    if (raw.length < 1000 || raw.readUInt32LE(0) !== 0x46546c67) throw new Error('下载到的不是 GLB');
    if (KEEP_RAW) try { fs.writeFileSync(path.join(GLB_DIR, `${id}.raw.glb`), raw); } catch (e) { /* 忽略 */ }
    const { buf: slim, info } = slimGlb(raw, { maxSize: TEX_MAX, quality: TEX_Q });
    log(`task=${id} 压缩 ${raw.length} → ${slim.length} 字节，${info.ms}ms ${JSON.stringify(info.images)}${info.error ? ' 压缩出错（用原文件）：' + info.error : ''}`);
    // 游戏版：再减面（失败 / 面数本来就少 → 用只压了贴图的版本）
    let buf = slim, faces = null;
    if (GAME_FACES > 0) { const d = await decimateGlb(slim, { targetTris: GAME_FACES }); buf = d.buf; faces = d.info.trisAfter; log(`task=${id} 游戏版减面 ${d.info.trisBefore} → ${d.info.trisAfter} 面，${slim.length} → ${buf.length} 字节，${d.info.ms}ms${d.info.skip ? '（' + d.info.skip + '）' : ''}${d.info.error ? ' 减面出错（用未减面版）：' + d.info.error : ''}`); }
    fs.mkdirSync(GLB_DIR, { recursive: true }); fs.writeFileSync(path.join(GLB_DIR, `${id}.glb`), buf);
    // 高精度版：原始几何不减面 + 2048 贴图（失败只记日志，不影响游戏版）
    let hd = null;
    if (HD_ON) try {
      const h = slimGlb(raw, { maxSize: HD_TEX_MAX, quality: HD_TEX_Q });
      if (h.info.error) throw new Error(h.info.error);
      fs.writeFileSync(path.join(GLB_DIR, `${id}.hd.glb`), h.buf); hd = { hdSize: h.buf.length, hdFaces: countTris(h.buf) };
      log(`task=${id} 高精度版 ${h.buf.length} 字节，${hd.hdFaces} 面（不减面），贴图 ${JSON.stringify(h.info.images)}`);
    } catch (e) { log(`task=${id} 高精度版生成失败（只给游戏版）：${e && e.message}`); }
    setState(t, 'done', { size: buf.length, faces: faces || undefined, raw: raw.length, error: undefined, ...(hd || { hdSize: undefined, hdFaces: undefined }) });
  } catch (e) {
    setState(t, 'failed', { error: mask((e && e.message) || '生成失败') });
  } finally { running.delete(id); }
}
/** 进程启动：续跑没结束的任务（重启 / 部署更新后不丢） */
setTimeout(() => { for (const t of Object.values(tasks)) if (!TERMINAL.has(t.state)) void work(t.id); }, 50).unref?.();

// ---------------------------------------------------------------- 处理
async function forge(body, ip) {
  if (!key()) return json(500, { error: '服务没有配置 AHOLO_API_KEY' });
  let o; try { o = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}); } catch (e) { return json(400, { error: '请求格式不对' }); }
  const prompt = String(o.prompt || '').trim().slice(0, MAX_LEN), type = String(o.weaponType || '');
  if (!prompt) return json(400, { error: '描述是空的' });
  if (!TYPES.has(type)) return json(400, { error: '不支持的武器类型' });
  if (BAN.some(w => prompt.includes(w))) return json(400, { error: '描述里有不能用的词' });
  roll();
  if (st.n >= DAILY()) { log(`拒绝 ip=${ip}：全站 ${st.n}/${DAILY()} 已用完`); return json(429, { error: `今天全服 ${DAILY()} 次在线铸造已用完` }); }
  if ((st.ip[ip] || 0) >= PER_IP()) { log(`拒绝 ip=${ip}：每人 ${PER_IP()} 次已用完`); return json(429, { error: `每人每天限 ${PER_IP()} 次在线铸造` }); }
  st.n++; st.ip[ip] = (st.ip[ip] || 0) + 1; save();   // 先占名额防并发；创建失败（没拿到 taskId）再退回
  const P = buildPrompt(prompt, type);
  log(`创建请求 ip=${ip} type=${type} faces=${FACES} prompt=「${prompt}」`);
  let id;
  try {
    const c = await api('POST', '/lux3d/v1/generate/text-to-3d/task/create', { version: 'G1-Turbo', faceCount: FACES, outputFormat: ['glb'], aiPredictSize: false, prompt: P, style: 'photorealistic' });
    id = c.d; if (!id) throw new Error(`Lux3D 没有返回任务号（${mask(JSON.stringify(c).slice(0, 80))}）`);
  } catch (e) {
    st.n = Math.max(0, st.n - 1); st.ip[ip] = Math.max(0, (st.ip[ip] || 1) - 1); save();
    const msg = mask((e && e.message) || '创建任务失败');
    log(`创建失败（不计次）ip=${ip}：${msg}`);
    st.last = { time: new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) + ' CST', taskId: null, state: 'failed', error: msg, size: null, ms: 0 }; save();
    return json(502, { error: msg });
  }
  id = String(id);
  log(`已创建 task=${id} ip=${ip} 计次 全站 ${st.n}/${DAILY()} 本 IP ${st.ip[ip]}/${PER_IP()}`);
  const now = Date.now(), dev = devOf(o.dev);
  tasks[id] = { id, prompt, type, ip, dev: dev || undefined, state: 'queued', t0: now, tu: now, readyAt: CLAIM() ? now + ETA_S() * 1000 : undefined }; prune(); saveTasks();
  void work(id);
  return json(200, CLAIM() ? { taskId: id, state: 'queued', claim: true, eta: ETA_S(), readyAt: tasks[id].readyAt } : { taskId: id, state: 'queued' });
}
/** 推进 / 自愈：下载阶段失败可重来；没人推进就接着跑（status 与 mine 共用） */
function nudge(t) {
  const id = t.id;
  if (t.state === 'failed' && t.src && (t.dlFail || 0) < 3 && Date.now() - t.t0 < 110 * 60e3 && !running.has(id)) { log(`task=${id} 下载失败的任务被再次查询 → 重新下载（第 ${(t.dlFail || 0) + 1} 轮）`); t.error = undefined; setState(t, 'downloading'); }
  if (!TERMINAL.has(t.state) && !running.has(id)) void work(id);
}
function view(t) {
  const o = { taskId: t.id, state: t.state, prompt: t.prompt, type: t.type, elapsed: Math.round((Date.now() - t.t0) / 1000) };
  if (t.readyAt) o.readyAt = t.readyAt;
  if (t.error) o.error = t.error;
  if (t.state === 'failed' && t.src && (t.dlFail || 0) < 3 && Date.now() - t.t0 < 110 * 60e3) o.retry = true;
  if (t.state === 'done') { o.size = t.size; o.url = `glb/${t.id}`; if (t.faces) o.faces = t.faces; if (t.hdSize) { o.hdUrl = `glb/${t.id}/hd`; o.hdSize = t.hdSize; o.hdFaces = t.hdFaces; } }   // v1.2.54 高精度版（展示窗用）
  return o;
}
/** v1.2.47 本设备（或老页面同 IP、没带设备 ID 的）还没领取的任务 */
const mineOf = (t, dev, ip) => !t.claimed && (dev ? t.dev === dev || (!t.dev && t.ip === ip) : !t.dev && t.ip === ip);
function mine(dev, ip) {
  dev = devOf(dev);
  const list = Object.values(tasks).filter(t => mineOf(t, dev, ip) && Date.now() - t.t0 < KEEP_MS).sort((a, b) => a.t0 - b.t0);
  for (const t of list) { if (!t.readyAt) t.readyAt = t.t0 + ETA_S() * 1000; nudge(t); }
  return json(200, { claim: CLAIM(), eta: ETA_S(), now: Date.now(), tasks: list.map(view) });
}
function claimed(id, body, ip) {
  let o = {}; try { o = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {}); } catch (e) { /* 空 */ }
  const t = tasks[id]; if (!t) return json(404, { error: '没有这个铸造任务（可能已过期）' });
  if (!mineOf(t, devOf(o.dev), ip) && !t.claimed) return json(403, { error: '不是这台设备的铸造任务' });
  if (!t.claimed) { t.claimed = Date.now(); saveTasks(); log(`task=${id} 已领取（${t.state}）`); }
  return json(200, { ok: true });
}
function status(id) {
  const t = tasks[id]; if (!t) return json(404, { error: '没有这个铸造任务（可能已过期）' });
  // 下载阶段失败（Lux3D 已生成好、原链接 2 小时内有效）：再次查询时自动重新下载（不重新生成、不再计次），最多重来 3 轮；没人推进就接着跑
  nudge(t);
  return json(200, view(t));
}
function glb(id, range, hd = false) {
  if (!/^\d+$/.test(id)) return json(404, { error: '没有这个模型' });
  let b; try { b = fs.readFileSync(path.join(GLB_DIR, `${id}${hd ? '.hd' : ''}.glb`)); } catch (e) { return json(404, { error: '模型已过期（服务重启或超过 48 小时会清空）' }); }
  const h = { ...cors, 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=86400', 'Accept-Ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (m && (m[1] || m[2])) {
    let a, z;
    if (m[1] === '') { a = Math.max(0, b.length - Number(m[2])); z = b.length - 1; } else { a = Number(m[1]); z = m[2] === '' ? b.length - 1 : Math.min(Number(m[2]), b.length - 1); }
    if (a >= b.length || a > z) return { statusCode: 416, headers: { ...h, 'Content-Range': `bytes */${b.length}` }, body: '' };
    const part = b.subarray(a, z + 1);
    log(`task=${id}${hd ? ' 高精度' : ''} 分块 ${a}-${z}/${b.length}`);
    return { statusCode: 206, headers: { ...h, 'Content-Range': `bytes ${a}-${z}/${b.length}`, 'Content-Length': String(part.length) }, body: part.toString('base64'), isBase64Encoded: true };
  }
  return { statusCode: 200, headers: { ...h, 'Content-Length': String(b.length) }, body: b.toString('base64'), isBase64Encoded: true };
}

/** HTTP 入口（FC 3.0 触发器 event / server.js 转来的同格式 event） */
exports.handler = async (event) => {
  let ev; try { ev = JSON.parse(Buffer.isBuffer(event) ? event.toString() : event); } catch (e) { ev = event || {}; }
  const http = (ev.requestContext && ev.requestContext.http) || {};
  const method = (http.method || ev.httpMethod || 'GET').toUpperCase();
  const p = ev.rawPath || http.path || ev.path || '/';
  const h = ev.headers || {};
  const ip = String(http.sourceIp || h['x-forwarded-for'] || h['X-Forwarded-For'] || 'unknown').split(',')[0].trim();
  const body = ev.isBase64Encoded ? Buffer.from(ev.body || '', 'base64').toString() : ev.body;
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (method === 'GET' && /\/health$/.test(p)) { roll(); return json(200, { ok: !!key(), today: st.d, used: st.n, limit: DAILY(), perIp: PER_IP(), active: running.size, claim: CLAIM(), eta: ETA_S(), last: st.last || null }); }
  let m = p.match(/\/forge\/status\/([^/]+)$/); if (method === 'GET' && m) return status(m[1]);
  m = p.match(/\/glb\/([^/]+?)\/hd$/); if (method === 'GET' && m) return glb(m[1], h.range || h.Range, true);   // v1.2.54 高精度版
  m = p.match(/\/glb\/([^/]+?)(\.glb)?$/); if (method === 'GET' && m) return glb(m[1], h.range || h.Range);
  if (method === 'GET' && /\/forge\/mine$/.test(p)) { const q = ev.rawQueryString || (ev.queryParameters ? new URLSearchParams(ev.queryParameters).toString() : ''); return mine(new URLSearchParams(q).get('dev'), ip); }
  m = p.match(/\/forge\/claimed\/([^/]+)$/); if (method === 'POST' && m) return claimed(m[1], body, ip);
  if (method === 'POST' && /\/forge$/.test(p)) return forge(body, ip);
  return json(404, { error: '只有 POST /forge、GET /forge/status/<id>、GET /forge/mine、POST /forge/claimed/<id>、GET /glb/<id>、GET /health' });
};

// ---------------------------------------------------------------- 仅本地测试用（不对外暴露 HTTP 入口，不会调用 create）
exports._state = () => st;
exports._tasks = () => tasks;
exports._running = () => [...running];   // 11-17 本机任务检查用
exports._glbDir = GLB_DIR;
exports._keepH = KEEP_MS / 3600e3;
exports._reset = () => { st = { d: today(), n: 0, ip: {}, last: null }; save(); tasks = {}; saveTasks(); };
/** 续取一个已在 Lux3D 完成 / 进行中的任务（零积分：只调 task/get + 下载），等它结束并返回任务记录 */
exports._resume = async (id, meta = {}) => {
  id = String(id);
  if (!tasks[id] || tasks[id].state === 'failed') tasks[id] = { id, prompt: meta.prompt || '(续取)', type: meta.type || 'sword', ip: 'local', state: 'queued', t0: Date.now(), tu: Date.now() };
  saveTasks(); await work(id);
  while (running.has(id)) await sleep(100);
  return tasks[id];
};
exports._buildPrompt = buildPrompt;
