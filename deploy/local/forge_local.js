// 《暗岩传说：深渊回响》评委离线包 ·「启动铸造服务」本机小程序（v1.2.54）
// 作用：在 127.0.0.1 上同时托管同目录的游戏 html + 铸造台接口（复用 cloud/forge-fc/index.js 的异步任务 / 分块取回 / 续取逻辑），
//   并自动打开浏览器到 http://127.0.0.1:<端口>/ —— 页面同源，smithyMode() = 'server'，本地版也能真实在线生成且自动取回。
// 安全：只监听 127.0.0.1；Key 不写进程序、不写进包：玩家在铸造台填写，只发给本机这个服务，由服务转发到 api.aholo3d.cn；
//   勾选「记住」才写到本机用户目录 ~/.darkrock_forge/config.json（只本机可读），不上传任何第三方。
//   跨站防护：只接受 Host 为 127.0.0.1 / localhost 的请求；POST 必须是 application/json（跨站页面会被预检拦下），带 Origin 的必须同源。
// 防扣分：每次 task/create 之前先用 task/list（不扣积分）测 Key，测不通就不发 create。返回给页面的错误全中文。
// 构建：bun build --compile deploy/local/forge_local.js --target=bun-windows-x64 --outfile 启动铸造服务.exe（见 deploy/local/build.sh）
// 运行（无 exe 时）：node 启动铸造服务.js   可选环境变量：PORT（默认 17860，被占用自动往后找）、NO_BROWSER=1、FORGE_HOME（配置 / 模型目录）
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

if (process.platform === 'win32' && !process.versions.electron) { try { spawnSync('cmd', ['/c', 'chcp 65001 >nul'], { stdio: 'inherit' }); } catch (e) { /* 忽略 */ } }

const PAGE_NAME = '暗岩传说_深渊回响_评委版.html';
const HOME = process.env.FORGE_HOME || path.join(os.homedir(), '.darkrock_forge');
const CFG = path.join(HOME, 'config.json');
const API = process.env.AHOLO_API_BASE || 'https://api.aholo3d.cn';   // 只给测试用的假服务端改；正式就是 Aholo 官方
try { fs.mkdirSync(path.join(HOME, 'glb'), { recursive: true }); } catch (e) { /* 忽略 */ }

// ---- 铸造模块（cloud/forge-fc）读环境变量：本机模式 = 即时模式、Key 来自玩家、额度宽松（花的是玩家自己的积分）
Object.assign(process.env, {
  GLB_DIR: process.env.GLB_DIR || path.join(HOME, 'glb'),
  DAILY_LIMIT: process.env.DAILY_LIMIT || '30', PER_IP_LIMIT: process.env.PER_IP_LIMIT || '30',
  FORGE_CLAIM: '', AHOLO_API_BASE: API, ALLOW_ORIGIN: 'http://127.0.0.1',
});
const say = (...a) => console.log(new Date(Date.now() + 8 * 3600e3).toISOString().slice(11, 19), ...a);

// ---- Key（内存 + 可选本机配置文件）
let KEY = '';
function loadCfg() { try { const j = JSON.parse(fs.readFileSync(CFG, 'utf8')); if (j && typeof j.key === 'string') KEY = j.key.trim(); } catch (e) { /* 没有 */ } }
function saveCfg(remember) {
  try {
    if (remember && KEY) { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify({ key: KEY, saved: new Date().toISOString() }), { mode: 0o600 }); }
    else if (fs.existsSync(CFG)) fs.unlinkSync(CFG);
  } catch (e) { say('配置文件写入失败（只在本次运行内记住 Key）'); }
}
loadCfg();
process.env.AHOLO_API_KEY = KEY;
const setKey = k => { KEY = String(k || '').trim(); process.env.AHOLO_API_KEY = KEY; };
const masked = () => (KEY ? '••••' + KEY.slice(-4) : '');

const forge = require('../../cloud/forge-fc/index.js');

// ---- 测 Key：task/list（不扣积分）→ 中文分类
const NOTE = '（测试只查询任务列表，不扣积分）';
const PING = {
  ok: n => `Key 正确，已通过本机铸造服务连上 Lux3D（账户里有 ${n} 个历史任务）。现在点「铸造」会在线实时生成`,
  nokey: `还没有填写 Key：请在铸造台底部粘贴自己的 Aholo Key 并保存`,
  auth: `Key 错误或已过期：Lux3D 拒绝了这个 Key，请到 Aholo 开放平台核对后重新粘贴`,
  net: `本机铸造服务连不上 Lux3D：请检查电脑是否联网、防火墙或代理是否拦截了「启动铸造服务」`,
  busy: `Lux3D 接口繁忙或超时，请稍后再试`,
  odd: st => `Lux3D 返回了无法识别的结果（状态码 ${st}），请稍后再试`,
};
const AUTH_RE = /auth|token|unauthor|forbidden|key|鉴权|认证|授权|无效|过期|权限|签名/i;
async function pingKey(k = KEY) {
  if (!k) return { ok: false, kind: 'nokey', text: PING.nokey };
  let r;
  try { r = await fetch(API + '/lux3d/v1/generate/task/list?page=1&pageSize=1', { headers: { Authorization: k }, signal: AbortSignal.timeout(20000) }); }
  catch (e) { say('测 Key：网络错误', e && e.name); return e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? { ok: false, kind: 'busy', text: PING.busy } : { ok: false, kind: 'net', text: PING.net }; }
  let j = null; try { j = JSON.parse(await r.text()); } catch (e) { /* 非 JSON */ }
  if (r.status === 401 || r.status === 403) return { ok: false, kind: 'auth', text: PING.auth };
  if (r.status === 429 || r.status >= 500) return { ok: false, kind: 'busy', text: PING.busy };
  if (!r.ok || !j) return { ok: false, kind: 'odd', text: PING.odd(r.status) };
  if (j.c != null && String(j.c) !== '0') return AUTH_RE.test(String(j.m || '')) || /^(401|403|1001|1002|1003)$/.test(String(j.c)) ? { ok: false, kind: 'auth', text: PING.auth } : { ok: false, kind: 'busy', text: PING.busy };
  const n = j.d && typeof j.d.total === 'number' ? j.d.total : '若干';
  return { ok: true, kind: 'ok', text: PING.ok(n) };
}

// ---- 错误文案中文化（铸造模块原文里可能有 HTTP 状态 / 接口原始 JSON；专名 Key / Lux3D / GLB / Aholo 保留）
function zh(msg) {
  let s = String(msg || '');
  if (!s) return s;
  if (/鉴权|401|403/.test(s)) return 'Key 错误或已过期：Lux3D 拒绝了这个 Key，请在铸造台底部重新填写';
  if (/超时|timeout/i.test(s) && !/下载/.test(s)) return s.replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g, '').trim() || '生成超时';
  s = s.replace(/HTTP\s*(\d+)/g, '状态码 $1').replace(/[：:]\s*[{[].*$/, '').replace(/[（(][^）)]*[A-Za-z]{2,}[^）)]*[）)]/g, '');
  const rest = s.replace(/Lux3D|Key|GLB|Aholo|glb/g, '');
  if (/[A-Za-z]/.test(rest)) return /状态码 (429|5\d\d)/.test(s) ? 'Lux3D 接口繁忙，请稍后再试' : '铸造服务出错，请稍后再试';
  return s.trim();
}
function zhBody(r) {
  const ct = String((r.headers || {})['Content-Type'] || '');
  if (!/json/.test(ct) || r.isBase64Encoded) return r;
  try {
    const j = JSON.parse(r.body || '{}'); let ch = false;
    if (j.error) { j.error = zh(j.error); ch = true; }
    if (Array.isArray(j.tasks)) for (const t of j.tasks) if (t.error) { t.error = zh(t.error); ch = true; }
    if (j.last && j.last.error) { j.last.error = zh(j.last.error); ch = true; }
    return ch ? { ...r, body: JSON.stringify(j) } : r;
  } catch (e) { return r; }
}

// ---- 页面 / 静态文件
const BASE_DIR = (() => {
  const c = [path.dirname(process.execPath), process.cwd(), __dirname, path.dirname(process.argv[1] || '.')];
  return c.find(d => { try { return fs.existsSync(path.join(d, PAGE_NAME)); } catch (e) { return false; } })
    || c.find(d => { try { return fs.readdirSync(d).some(f => /评委版.*\.html$|比赛版.*\.html$/.test(f)); } catch (e) { return false; } })
    || process.cwd();
})();
const PAGE = process.env.PAGE_FILE || (() => {
  const p = path.join(BASE_DIR, PAGE_NAME); if (fs.existsSync(p)) return p;
  const f = fs.readdirSync(BASE_DIR).filter(x => /\.html$/i.test(x) && /评委版|比赛版/.test(x))[0];
  return f ? path.join(BASE_DIR, f) : p;
})();
let pageRaw = null, pageGz = null, pageTag = '';
function loadPage(origin) {
  if (pageRaw) return;
  let raw = fs.readFileSync(PAGE);
  // 同源铸造服务：强制把铸造台地址设成本机服务（smithyMode() = 'server'），并标记「本机铸造服务」
  const inj = Buffer.from(`<script>try{localStorage.setItem("darkrock_forge_api",location.origin);localStorage.setItem("darkrock_forge_local","1")}catch(e){}</script>`);
  const i = raw.indexOf('<head>');
  raw = i >= 0 ? Buffer.concat([raw.subarray(0, i + 6), inj, raw.subarray(i + 6)]) : Buffer.concat([inj, raw]);
  pageRaw = raw; pageGz = zlib.gzipSync(raw, { level: 4 });
  pageTag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20) + '"';
  say(`页面 ${path.basename(PAGE)} ${(raw.length / 1048576).toFixed(1)} MB`);
}
const MIME = { '.mp3': 'audio/mpeg', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
function sendPage(req, res) {
  try { loadPage(); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(`没有找到游戏页面「${PAGE_NAME}」：请把「启动铸造服务」和它放在同一个文件夹里`); }
  if ((req.headers['if-none-match'] || '') === pageTag) { res.writeHead(304, { ETag: pageTag }); return res.end(); }
  const g = /\bgzip\b/.test(req.headers['accept-encoding'] || ''), b = g ? pageGz : pageRaw;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: pageTag, 'Content-Length': b.length, ...(g ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(req.method === 'HEAD' ? undefined : b);
}
function sendStatic(req, res, rel) {
  const f = path.resolve(BASE_DIR, rel);
  if (!f.startsWith(path.resolve(BASE_DIR) + path.sep) || !MIME[path.extname(f).toLowerCase()] || !fs.existsSync(f) || !fs.statSync(f).isFile()) return false;
  const size = fs.statSync(f).size, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''), head = { 'Content-Type': MIME[path.extname(f).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
  if (m && (m[1] || m[2])) {
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]), z = m[1] && m[2] ? Math.min(size - 1, +m[2]) : size - 1;
    if (a >= size || a > z) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true; }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1 });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(f, { start: a, end: z }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(f).pipe(res);
  return true;
}

// ---- HTTP
let PORT = Number(process.env.PORT || 17860);
const J = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const hostOk = h => new RegExp(`^(127\\.0\\.0\\.1|localhost)(:${PORT})?$`, 'i').test(String(h || ''));
const originOk = o => !o || new RegExp(`^http://(127\\.0\\.0\\.1|localhost):${PORT}$`, 'i').test(String(o));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!hostOk(req.headers.host)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('只允许本机访问'); }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    if (!originOk(req.headers.origin)) return J(res, 403, { error: '只允许本机游戏页面调用铸造服务' });
    if (req.method === 'POST' && !/application\/json/i.test(req.headers['content-type'] || '')) return J(res, 415, { error: '请求格式不对' });
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const get = req.method === 'GET' || req.method === 'HEAD';
  if (get && (u.pathname === '/' || u.pathname === '/index.html')) return sendPage(req, res);
  if (get && u.pathname === '/version') return J(res, 200, { ver: '' });   // 本机托管的就是同目录的页面，不做版本刷新
  if (get && u.pathname === '/forge/key') return J(res, 200, { has: !!KEY, masked: masked(), remembered: fs.existsSync(CFG) });
  if (get && u.pathname === '/forge/key/test') return void pingKey().then(r => J(res, 200, r));
  // 11-17 本机任务检查（只读本机文件，不联网、不扣积分）：任务状态、模型文件完整性、孤儿文件、目录可写、建议
  if (get && u.pathname === '/forge/check') { try { const c = require('../../cloud/forge-fc/check.js'); const r = c.checkForge({ glbDir: forge._glbDir, keepH: forge._keepH, running: forge._running(), home: HOME }); r.key = { has: !!KEY, masked: masked(), remembered: fs.existsSync(CFG) }; if (u.searchParams.get('fmt') === 'text') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(c.text(r)); } return J(res, 200, r); } catch (e) { return J(res, 500, { error: '检查失败：' + (e && e.message) }); } }
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 64 * 1024) { J(res, 413, { error: '请求太大' }); req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    const body = Buffer.concat(chunks).toString();
    try {
      // 填 / 清 Key：{ key, remember }；先测（不扣积分），通过才保存
      if (req.method === 'POST' && u.pathname === '/forge/key') {
        let o = {}; try { o = JSON.parse(body || '{}'); } catch (e) { return J(res, 400, { error: '请求格式不对' }); }
        const k = String(o.key || '').trim();
        if (!k) { setKey(''); saveCfg(false); say('已清除 Key'); return J(res, 200, { ok: true, kind: 'cleared', text: '已清除本机铸造服务里的 Key' }); }
        if (k.length > 512 || /\s/.test(k)) return J(res, 200, { ok: false, kind: 'auth', text: 'Key 格式不对：请粘贴完整的 Aholo Key（不要带空格或换行）' });
        const p = await pingKey(k);
        if (p.ok || p.kind === 'net' || p.kind === 'busy') { setKey(k); saveCfg(!!o.remember); }   // 网络问题时也先记下，铸造前还会再测
        say(`收到 Key ${masked()}：${p.ok ? '测试通过' : '测试未通过（' + p.kind + '）'}${o.remember ? '，已记在本机' : ''}`);
        return J(res, 200, { ...p, masked: masked(), remembered: fs.existsSync(CFG) });
      }
      // 11-17 续取高精度版：只调 task/get + 下载（不发起生成、不扣积分）
      const rf = req.method === 'POST' && /^\/forge\/refetch\/([A-Za-z0-9_-]{1,64})$/.exec(u.pathname);
      if (rf) {
        if (!KEY) return J(res, 200, { ok: false, error: PING.nokey });
        try { const t = await forge._resume(rf[1], { prompt: '(续取高精度版)' }); say(`续取 ${rf[1]}：${t && t.state}`); return J(res, 200, t && t.state === 'done' ? { ok: true } : { ok: false, error: zh((t && t.error) || '续取失败') }); }
        catch (e) { return J(res, 200, { ok: false, error: zh(e && e.message) || '续取失败' }); }
      }
      // 铸造前先测 Key：测不通就不发 task/create（防扣分）
      if (req.method === 'POST' && /\/forge$/.test(u.pathname)) {
        const p = await pingKey();
        if (!p.ok) { say(`铸造请求被拦下（没有调用生成接口）：${p.kind}`); return J(res, p.kind === 'nokey' || p.kind === 'auth' ? 400 : 503, { error: p.text + '。没有发起生成，不扣积分', kind: p.kind }); }
      }
      const ev = { rawPath: u.pathname, rawQueryString: u.search.slice(1), headers: { ...req.headers, 'x-forwarded-for': '127.0.0.1' }, requestContext: { http: { method: req.method, path: u.pathname, sourceIp: '127.0.0.1' } }, body, isBase64Encoded: false };
      let r = await forge.handler(ev);
      if (/\/health$/.test(u.pathname)) { const j = JSON.parse(r.body); r = { ...r, body: JSON.stringify({ ...j, ok: !!KEY, local: true, hasKey: !!KEY, masked: masked() }) }; }
      r = zhBody(r);
      if (/\/forge$/.test(u.pathname) && r.statusCode === 200) say('已提交生成任务', JSON.parse(r.body).taskId);
      const out = r.isBase64Encoded ? Buffer.from(r.body, 'base64') : Buffer.from(r.body || '');
      res.writeHead(r.statusCode || 200, r.headers || {}); res.end(req.method === 'HEAD' ? undefined : out);
    } catch (e) { say('内部错误', e && e.message); J(res, 500, { error: '铸造服务内部错误' }); }
  });
  if (get && !/^\/(forge|glb|health)/.test(u.pathname)) {   // 静态文件（music/ 等），读完请求体前直接回
    req.removeAllListeners('end');
    let rel; try { rel = decodeURIComponent(u.pathname.slice(1)); } catch (e) { rel = ''; }
    if (!rel || !sendStatic(req, res, rel)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('没有这个文件'); }
  }
});

function openBrowser(url) {
  if (process.env.NO_BROWSER === '1') return;
  try {
    const p = process.platform === 'win32' ? spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true })
      : process.platform === 'darwin' ? spawn('open', [url], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.on('error', () => say(`没能自动打开浏览器，请手动在 Chrome / Edge 打开：${url}`)); p.unref();
  } catch (e) { say(`没能自动打开浏览器，请手动在 Chrome / Edge 打开：${url}`); }
}
let tries = 0;
server.on('error', e => {
  if (e && e.code === 'EADDRINUSE' && tries++ < 20) { PORT++; return server.listen(PORT, '127.0.0.1'); }
  console.log('启动失败：' + (e && e.code === 'EADDRINUSE' ? '端口都被占用了' : e && e.message) + '（窗口 60 秒后关闭）'); if (process.versions.electron) return;   // 桌面版：铸造服务起不来只影响在线铸造，不退出游戏
  process.exitCode = 1; setTimeout(() => process.exit(1), 60000);
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('==============================================');
  console.log(' 暗岩传说：深渊回响 · 本机铸造服务 已启动');
  console.log(` 游戏地址：${url}`);
  console.log(` 游戏页面：${fs.existsSync(PAGE) ? path.basename(PAGE) : '没有找到「' + PAGE_NAME + '」（请放在同一文件夹）'}`);
  console.log(` Aholo Key：${KEY ? '已记住 ' + masked() : '未填写（在铸造台底部填写，只发给本机服务）'}`);
  console.log(' 只在本机 127.0.0.1 监听；关闭这个窗口 = 停止服务');
  console.log('==============================================');
  console.log(`READY ${url}`);
  if (!process.versions.electron) openBrowser(url);
});
server.listen(PORT, '127.0.0.1');
// 11-17 桌面版（Electron 主进程）内置：main.js require 本文件，用 port() 找到实际端口，把 app://game/forge|glb|health 转过来
module.exports = { server, port: () => PORT };
