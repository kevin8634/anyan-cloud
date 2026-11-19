// 假 Aholo（Lux3D）服务端：只给本机铸造服务的测试用，不联网、不扣分
// 用法：node dev/fake_aholo.mjs [端口=18790] [glb 文件]
//   有效 Key = 'fake-good-key'（其他 Key → 401）；GET /__stats 看各接口调用次数；POST /__mode {list:'ok'|'500'|'hang'} 切换 task/list 行为
import http from 'http';
import fs from 'fs';
const PORT = Number(process.argv[2] || 18790), GLB = process.argv[3] || '/workspace/work/diag/recover/forge_4467036.glb';
const stats = { list: 0, create: 0, get: 0, file: 0, badKey: 0 }, tasks = {}; let mode = { list: 'ok' }, seq = 9100000;
const J = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), auth = req.headers.authorization || '';
  if (u.pathname === '/__stats') return J(res, 200, stats);
  if (u.pathname === '/__mode') { let b = ''; req.on('data', c => b += c); req.on('end', () => { mode = { ...mode, ...JSON.parse(b || '{}') }; J(res, 200, mode); }); return; }
  if (u.pathname === '/files/model.glb') { stats.file++; const b = fs.readFileSync(GLB); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': b.length }); return res.end(b); }
  if (u.pathname.startsWith('/lux3d/')) {
    if (u.pathname.endsWith('/task/list')) {
      stats.list++;
      if (mode.list === '500') return J(res, 500, { m: 'Internal Server Error' });
      if (mode.list === 'hang') return;   // 不回
      if (auth !== 'fake-good-key') { stats.badKey++; return J(res, 401, { c: '401', m: 'Unauthorized: invalid token' }); }
      return J(res, 200, { c: '0', d: { total: 3, list: [] } });
    }
    if (auth !== 'fake-good-key') { stats.badKey++; return J(res, 401, { c: '401', m: 'Unauthorized' }); }
    if (u.pathname.endsWith('/task/create')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { stats.create++; const id = String(++seq); tasks[id] = { polls: 0, body: JSON.parse(b || '{}') }; J(res, 200, { c: '0', d: id }); }); return; }
    if (u.pathname.endsWith('/task/get')) {
      stats.get++; const t = tasks[u.searchParams.get('taskid')]; if (!t) return J(res, 200, { c: '404', m: 'task not found', d: null });
      t.polls++;
      if (t.polls < 3) return J(res, 200, { c: '0', d: { status: t.polls < 2 ? 0 : 1 } });
      return J(res, 200, { c: '0', d: { status: 3, outputs: [{ content: `http://127.0.0.1:${PORT}/files/model.glb?x=1` }] } });
    }
  }
  J(res, 404, { m: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('FAKE AHOLO READY', PORT));
