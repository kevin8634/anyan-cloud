// ======================================================================
// 魔搭网关限制诊断（零积分，不调用 Lux3D）
// 目的：用可重复的实验证明「同一份代码在本地全部成功，在魔搭某个档位开始失败」，
//       从而判断失败来自魔搭平台（网关的响应大小上限 / 请求超时），而不是我们的代码。
//
// 接口：
//   GET|POST /diag/blob?mb=8&mode=bin   返回 8MB 二进制（模拟直接下发 GLB 模型）
//   GET|POST /diag/blob?mb=8&mode=b64   返回约 8MB 的 JSON（模拟旧版把模型 base64 塞进 JSON）
//   GET|POST /diag/slow?s=60            等 60 秒再回一个小 JSON（模拟生成要等很久）
//   GET      /diag/log                  服务端视角的记录：每个请求是「完整发完」还是「中途被断开」
//
// 关键证据：服务端会监听连接的 close 事件。
//   - finish  = 数据已全部交给网络层（服务端这边成功）
//   - aborted = 还没发完 / 还没等到时间，连接就被对方（网关）掐断
//   如果客户端看到失败、而服务端记录是 finish 或 aborted，就说明是中间的魔搭网关出了问题。
// ======================================================================
'use strict';

const LOG = [];              // 最近 200 条诊断记录（内存，重启清空）
const MAX_MB = 32;           // 防止误用：单次最多 32MB
const MAX_S = 300;           // 单次最多等 5 分钟

// 北京时间字符串，方便和你本地的时间、魔搭日志对照
const bj = (t = Date.now()) => new Date(t + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);

function record(o) {
  LOG.push(o); if (LOG.length > 200) LOG.shift();
  console.log(`[diag] ${o.start} ${o.method} ${o.path} 结果=${o.result} 字节=${o.bytes} 耗时=${o.ms}ms`);
}

/** 跟踪一个响应：记录它最终是发完了（finish）还是被中途断开（aborted） */
function track(req, res, info) {
  const t0 = Date.now(); let done = false;
  const end = result => { if (done) return; done = true; record({ ...info, method: req.method, start: bj(t0), result, ms: Date.now() - t0 }); };
  res.on('finish', () => end('finish'));          // 服务端已把数据全部发出
  res.on('close', () => end('aborted'));          // 没 finish 就 close = 被对方掐断
}

/** 处理 /diag/*；不是诊断路径就返回 false，交回 server.js 继续处理 */
function handle(req, res, u) {
  if (!u.pathname.startsWith('/diag')) return false;
  const q = u.searchParams;
  const head = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

  if (u.pathname === '/diag/log') {
    res.writeHead(200, { ...head, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ now: bj(), count: LOG.length, log: LOG }, null, 1));
    return true;
  }

  if (u.pathname === '/diag/blob') {
    const mb = Math.min(MAX_MB, Math.max(0.1, Number(q.get('mb') || 1)));
    const mode = q.get('mode') === 'b64' ? 'b64' : 'bin';
    const raw = Buffer.alloc(Math.round(mb * 1048576), 0x41);   // 填充固定字节，内容无意义
    let body, type;
    if (mode === 'b64') { body = Buffer.from(JSON.stringify({ glb: raw.toString('base64') })); type = 'application/json'; }
    else { body = raw; type = 'application/octet-stream'; }
    track(req, res, { path: u.pathname + u.search, bytes: body.length });
    res.writeHead(200, { ...head, 'Content-Type': type, 'Content-Length': body.length });
    res.end(body);
    return true;
  }

  if (u.pathname === '/diag/slow') {
    const s = Math.min(MAX_S, Math.max(0, Number(q.get('s') || 10)));
    track(req, res, { path: u.pathname + u.search, bytes: 0 });
    const tm = setTimeout(() => {
      const body = Buffer.from(JSON.stringify({ ok: true, waited: s, at: bj() }));
      res.writeHead(200, { ...head, 'Content-Type': 'application/json', 'Content-Length': body.length });
      res.end(body);
    }, s * 1000);
    res.on('close', () => clearTimeout(tm));       // 被掐断就不用再等
    return true;
  }

  res.writeHead(404, head); res.end('unknown diag');
  return true;
}

module.exports = { handle };
