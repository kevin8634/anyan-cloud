// 11-17 本机铸造任务检查（只读，不联网，不扣积分）
//   读 GLB_DIR 下的 tasks.json / forge_state.json / <id>.glb / <id>.hd.glb，逐个核对：任务状态、模型文件在不在、GLB 头是否完整、
//   有没有孤儿文件（有模型没任务）、目录能不能写、今天用了几次；给出中文结论和建议（续取 = 只 task/get + 下载，不扣积分）。
//   用法：
//     node cloud/forge-fc/check.js [GLB 目录]          打印报告（默认 $GLB_DIR，或 ~/.darkrock_forge/glb）
//     node cloud/forge-fc/check.js [目录] --json        输出 JSON
//   桌面版 / 启动铸造服务：GET /forge/check 返回同一份 JSON（forge_local.js 调本文件的 checkForge）。
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const KEEP_H_DEF = 48;
const STATE_ZH = { queued: '排队中', running: '生成中', downloading: '下载中', slimming: '压缩中', done: '已完成', failed: '失败' };
const cst = ms => (ms ? new Date(ms + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' CST' : '—');
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB');

/** GLB 头：magic glTF、版本 2、头里的总长度 = 文件大小、第一个块是 JSON */
function glbHead(file) {
  let fd;
  try {
    const st = fs.statSync(file); if (st.size < 20) return { ok: false, size: st.size, why: '文件太小（不到 20 字节）' };
    fd = fs.openSync(file, 'r'); const b = Buffer.alloc(20); fs.readSync(fd, b, 0, 20, 0);
    if (b.toString('latin1', 0, 4) !== 'glTF') return { ok: false, size: st.size, why: '不是 GLB 文件（开头不是 glTF）' };
    if (b.readUInt32LE(4) !== 2) return { ok: false, size: st.size, why: `GLB 版本 ${b.readUInt32LE(4)}（应为 2）` };
    if (b.readUInt32LE(8) !== st.size) return { ok: false, size: st.size, why: `文件不完整（头里写 ${b.readUInt32LE(8)} 字节，实际 ${st.size}）` };
    if (b.readUInt32LE(16) !== 0x4E4F534A) return { ok: false, size: st.size, why: '第一个块不是 JSON' };
    return { ok: true, size: st.size };
  } catch (e) { return { ok: false, size: 0, why: e && e.code === 'ENOENT' ? '没有文件' : '读不了：' + (e && e.code || e && e.message) }; }
  finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* 忽略 */ } }
}

function writable(dir) {
  const f = path.join(dir, `.wtest_${process.pid}`);
  try { fs.writeFileSync(f, 'x'); fs.unlinkSync(f); return true; } catch (e) { return false; }
}

/**
 * @param {{ glbDir: string, keepH?: number, now?: number, running?: Iterable<string>, home?: string }} o
 * @returns 报告对象（ok / dir / writable / today / tasks[] / orphans[] / problems[] / tips[]）
 */
function checkForge(o) {
  const dir = o.glbDir, now = o.now || Date.now(), keepMs = (o.keepH || KEEP_H_DEF) * 3600e3, run = new Set(o.running || []);
  const rep = { ok: true, dir, exists: fs.existsSync(dir), writable: false, today: null, key: null, tasks: [], orphans: [], problems: [], tips: [] };
  const bad = (s, tip) => { rep.ok = false; rep.problems.push(s); if (tip && !rep.tips.includes(tip)) rep.tips.push(tip); };
  if (!rep.exists) { bad(`模型目录不存在：${dir}`, '还没有在线铸造过时这是正常的；铸造过却没有目录，说明数据目录被移动或清理了'); return rep; }
  rep.writable = writable(dir);
  if (!rep.writable) bad('模型目录不可写：新的铸造结果存不下来', '把游戏放到可写的文件夹（不要放在 C:\\Program Files 或只读 U 盘），或以普通用户重新运行');
  if (o.home) rep.key = { remembered: fs.existsSync(path.join(o.home, 'config.json')) };

  let tasks = {}, tasksOk = true;
  const tf = path.join(dir, 'tasks.json');
  if (fs.existsSync(tf)) { try { tasks = JSON.parse(fs.readFileSync(tf, 'utf8')) || {}; } catch (e) { tasksOk = false; bad('任务表 tasks.json 损坏，读不出来', '任务表坏了不影响已领取到存档里的武器；可以把 tasks.json 改名备份后重启铸造服务'); } }
  try { const s = JSON.parse(fs.readFileSync(path.join(dir, 'forge_state.json'), 'utf8')); rep.today = { date: s.d, used: s.n || 0, last: s.last || null }; } catch (e) { /* 没有计数文件 */ }

  const seen = new Set();
  for (const t of Object.values(tasks)) {
    if (!t || !t.id) continue; seen.add(String(t.id));
    const age = now - (t.t0 || 0), g = glbHead(path.join(dir, `${t.id}.glb`)), hdF = path.join(dir, `${t.id}.hd.glb`), hd = fs.existsSync(hdF) ? glbHead(hdF) : null;
    const row = { taskId: t.id, state: t.state, stateZh: STATE_ZH[t.state] || t.state, prompt: t.prompt || '', type: t.type || '', start: cst(t.t0), updated: cst(t.tu), ageH: +(age / 3600e3).toFixed(1), expiresInH: +((keepMs - age) / 3600e3).toFixed(1), claimed: !!t.claimed, running: run.has(String(t.id)), glb: g, hd, error: t.error || null, verdict: '正常', canResume: false };
    if (t.state === 'done') {
      if (!g.ok) { row.verdict = `已完成但游戏版模型有问题：${g.why}`; row.canResume = true; bad(`${t.id}「${row.prompt}」${row.verdict}`, '对有问题的任务点「取回高精度版」或调 POST /forge/refetch/<taskId> 续取（只查询 + 下载，不扣积分；Lux3D 原链接约 2 小时内有效，过期则取不回）'); }
      else if (hd && !hd.ok) { row.verdict = `高精度版有问题：${hd.why}`; row.canResume = true; bad(`${t.id}「${row.prompt}」${row.verdict}`, '对有问题的任务点「取回高精度版」或调 POST /forge/refetch/<taskId> 续取（只查询 + 下载，不扣积分；Lux3D 原链接约 2 小时内有效，过期则取不回）'); }
      else if (!t.claimed) row.verdict = '已完成，游戏还没领取（重新打开铸造台会自动取回）';
    } else if (t.state === 'failed') {
      row.verdict = `失败：${t.error || '未知原因'}`; row.canResume = /下载|超时|网络|HTTP 5|fetch|ECONN|ETIMEDOUT/i.test(t.error || '');
      if (row.canResume) rep.tips.includes('下载阶段失败的任务可以续取（不重新生成、不扣积分）') || rep.tips.push('下载阶段失败的任务可以续取（不重新生成、不扣积分）');
    } else {
      const idleMin = (now - (t.tu || t.t0 || 0)) / 60e3;
      if (!row.running && idleMin > 15) { row.verdict = `卡在「${row.stateZh}」已 ${Math.round(idleMin)} 分钟，没有在推进`; row.canResume = true; bad(`${t.id}「${row.prompt}」${row.verdict}`, '重启铸造服务会自动接着推进未完成的任务；也可以续取（不扣积分）'); }
      else row.verdict = row.running ? `${row.stateZh}（正在推进）` : `${row.stateZh}（等待推进）`;
    }
    if (age > keepMs) row.verdict += '；已超过保留时间，下次清理会删掉（已领取到存档的不受影响）';
    rep.tasks.push(row);
  }
  rep.tasks.sort((a, b) => (a.start < b.start ? 1 : -1));

  let files = []; try { files = fs.readdirSync(dir); } catch (e) { /* 忽略 */ }
  for (const f of files) {
    const m = /^(\d+)(\.hd|\.raw)?\.glb$/.exec(f); if (!m || (tasksOk && seen.has(m[1]))) continue;
    if (!tasksOk) continue;
    let size = 0; try { size = fs.statSync(path.join(dir, f)).size; } catch (e) { /* 忽略 */ }
    rep.orphans.push({ file: f, size });
  }
  if (rep.orphans.length) rep.tips.push(`有 ${rep.orphans.length} 个模型文件没有对应任务（任务表丢失或已清理），不影响游戏；需要时可以手动删`);
  rep.summary = summary(rep);
  return rep;
}

function summary(r) {
  if (!r.exists) return '还没有本机铸造记录';
  const n = r.tasks.length, done = r.tasks.filter(t => t.state === 'done').length, fail = r.tasks.filter(t => t.state === 'failed').length, live = n - done - fail;
  return `${n} 个任务：完成 ${done}、失败 ${fail}、进行中 ${live}；${r.problems.length ? `发现 ${r.problems.length} 个问题` : '没有发现问题'}${r.writable ? '' : '；目录不可写'}`;
}

function text(r) {
  const L = [`本机铸造任务检查 · ${cst(Date.now())}`, `目录：${r.dir}${r.exists ? (r.writable ? '（可写）' : '（不可写）') : '（不存在）'}`];
  if (r.today) L.push(`今天（${r.today.date}）已在线铸造 ${r.today.used} 次`);
  if (r.key) L.push(`Key：${r.key.remembered ? '已记在本机' : '没有记在本机'}`);
  L.push(r.summary || summary(r), '');
  for (const t of r.tasks) L.push(`· ${t.taskId}  ${t.stateZh}  ${t.start}  「${t.prompt}」${t.type ? ' ' + t.type : ''}`, `    模型 ${t.glb.ok ? kb(t.glb.size) : '✗ ' + t.glb.why}${t.hd ? `  高精度 ${t.hd.ok ? kb(t.hd.size) : '✗ ' + t.hd.why}` : ''}  → ${t.verdict}${t.canResume ? '（可续取）' : ''}`);
  if (r.orphans.length) { L.push('', '没有任务的模型文件：'); for (const o of r.orphans) L.push(`· ${o.file}  ${kb(o.size)}`); }
  if (r.problems.length) { L.push('', '问题：'); for (const p of r.problems) L.push('· ' + p); }
  if (r.tips.length) { L.push('', '建议：'); for (const p of r.tips) L.push('· ' + p); }
  return L.join('\n');
}

module.exports = { checkForge, glbHead, text };

if (require.main === module) {
  const a = process.argv.slice(2), asJson = a.includes('--json'), d = a.find(x => !x.startsWith('--'));
  const dir = d || process.env.GLB_DIR || path.join(process.env.FORGE_HOME || path.join(os.homedir(), '.darkrock_forge'), 'glb');
  const r = checkForge({ glbDir: path.resolve(dir), keepH: Number(process.env.GLB_KEEP_H || KEEP_H_DEF), home: path.dirname(path.resolve(dir)) });
  if (process.platform === 'win32') try { require('child_process').spawnSync('cmd', ['/c', 'chcp 65001 >nul'], { stdio: 'inherit' }); } catch (e) { /* 忽略 */ }
  console.log(asJson ? JSON.stringify(r, null, 1) : text(r));
  process.exitCode = r.ok ? 0 : 2;
}
