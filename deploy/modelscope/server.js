// 《暗岩传说：深渊回响》魔搭 Docker 创空间入口：同一服务提供游戏页面 + 铸造台 /forge
// 监听 0.0.0.0:7860（魔搭规定）。AHOLO_API_KEY 只从创空间「环境变量 / 密钥」读取，不进仓库。
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const forge = require(process.env.FORGE_MODULE || './forge/index.js');   // 测试时可指向 cloud/forge-fc/index.js
const diag = require('./diag.js');   // 魔搭网关限制诊断（零积分），见 diag.js 注释
const PORT = Number(process.env.PORT || 7860);
const PAGE = process.env.PAGE_FILE || path.join(__dirname, 'public', 'index.html');

// 页面启动时把铸造台地址设为同源（玩家无需手填云函数地址；用户已手动设置过的不覆盖）
const INJECT = Buffer.from('<script>try{if(!localStorage.getItem("darkrock_forge_api"))localStorage.setItem("darkrock_forge_api",location.origin+location.pathname.replace(/\\/[^/]*$/,""))}catch(e){}</script>');
// 魔搭 Docker 构建不拉 Git LFS：页面以 gzip 分片（public/page.gz.partNN，普通 git 文件）存放，启动时拼回
function loadPage() {
  const dir = path.join(__dirname, 'public');
  const parts = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^page\.gz\.part\d+$/.test(f)).sort() : [];
  if (parts.length) return zlib.gunzipSync(Buffer.concat(parts.map(f => fs.readFileSync(path.join(dir, f)))));
  return fs.readFileSync(PAGE);
}
let raw = loadPage();
// v1.2.47 页面版本号：打包时写进 public/version.txt（或环境变量 PAGE_VERSION）；GET /version 给前端比对，老页面自动刷新
const PAGE_VER = (() => { try { return fs.readFileSync(path.join(__dirname, 'public', 'version.txt'), 'utf8').trim(); } catch (e) { return process.env.PAGE_VERSION || ''; } })();
const i = raw.indexOf('<head>');
if (i >= 0) raw = Buffer.concat([raw.subarray(0, i + 6), INJECT, raw.subarray(i + 6)]);
const gz = zlib.gzipSync(raw, { level: 6 });
// 缓存校验：ETag = 页面内容哈希；版本不变返回 304（不重下），发新版内容一变自动重新下载
const ETAG = '"' + require('crypto').createHash('sha1').update(raw).digest('hex').slice(0, 20) + '"';
console.log(`[page] ${(raw.length / 1048576).toFixed(1)} MB → gzip ${(gz.length / 1048576).toFixed(1)} MB  etag ${ETAG}  ver ${PAGE_VER || '-'}`);

function sendPage(req, res) {
  const g = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const inm = req.headers['if-none-match'] || '';
  if (inm.split(',').some(t => t.trim().replace(/^W\//, '').replace(/-gzip"$/, '"') === ETAG)) { res.writeHead(304, { ETag: ETAG, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: ETAG, ...(g ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': (g ? gz : raw).length, Vary: 'Accept-Encoding' });
  res.end(req.method === 'HEAD' ? undefined : g ? gz : raw);
}

// v1.2.48 比赛版背景曲目（页面按需加载 music/<名>.mp3）：打包.sh 存成 public/music/<名>.track（避开创空间默认 LFS 规则），支持 Range
function sendMusic(req, res, name) {
  const dir = path.join(__dirname, 'public', 'music');
  const f = [path.join(dir, name + '.track'), path.join(dir, name + '.mp3')].find(x => fs.existsSync(x));
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('no track'); }
  const size = fs.statSync(f).size, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  if (m && (m[1] || m[2])) {
    const a = m[1] ? +m[1] : Math.max(0, size - +m[2]), b = m[1] && m[2] ? Math.min(size - 1, +m[2]) : size - 1;
    if (a >= size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  return req.method === 'HEAD' ? res.end() : fs.createReadStream(f).pipe(res);
}

// v1.2.54 分包加载：延后模型分块 /lazy/cN.js（打包.sh 预压成 public/lazy/cN.js.gz）
function sendLazy(req, res, name) {
  const f = path.join(__dirname, 'public', 'lazy', name + '.gz');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('no chunk'); }
  const g = /\bgzip\b/.test(req.headers['accept-encoding'] || ''), buf = fs.readFileSync(f), body = g ? buf : zlib.gunzipSync(buf);
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ...(g ? { 'Content-Encoding': 'gzip' } : {}), 'Content-Length': body.length, Vary: 'Accept-Encoding' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (diag.handle(req, res, u)) return;   // /diag/* 诊断接口
  if (req.method === 'GET' && u.pathname === '/version') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); return res.end(JSON.stringify({ ver: PAGE_VER })); }
  if ((req.method === 'GET' || req.method === 'HEAD') && (u.pathname === '/' || u.pathname === '/index.html')) return sendPage(req, res);
  if ((req.method === 'GET' || req.method === 'HEAD') && /^\/lazy\/c\d+\.js$/.test(u.pathname)) return sendLazy(req, res, u.pathname.slice(6));
  if ((req.method === 'GET' || req.method === 'HEAD') && /^\/music\/[a-z0-9_]+\.mp3$/.test(u.pathname)) return sendMusic(req, res, u.pathname.slice(7, -4));
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 64 * 1024) { res.writeHead(413); res.end(); req.destroy(); } else chunks.push(c); });
  req.on('end', async () => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const ev = { rawPath: u.pathname, rawQueryString: u.search.slice(1), headers: { ...req.headers, 'x-forwarded-for': ip }, requestContext: { http: { method: req.method, path: u.pathname, sourceIp: ip } }, body: Buffer.concat(chunks).toString(), isBase64Encoded: false };
    try {
      const r = await forge.handler(ev);
      const body = r.isBase64Encoded ? Buffer.from(r.body, 'base64') : Buffer.from(r.body || '');
      res.writeHead(r.statusCode || 200, r.headers || {}); res.end(body);
    } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: '服务内部错误' })); }
  });
}).listen(PORT, '0.0.0.0', () => console.log(`[server] http://0.0.0.0:${PORT}  key=${process.env.AHOLO_API_KEY ? '已配置' : '未配置（铸造台将退回离线武器库）'}  模式=${process.env.FORGE_CLAIM === '1' ? '定时领取' : '即时'}`));
