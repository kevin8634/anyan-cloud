// 暗岩传说 · 桌面版外壳（wip/electron1109）
// 用自定义协议 app://game/ 加载 game/index.html（同源，canvas 读图 / fetch 都正常）。
// 11-11 资源拆包：桌面版构建（build-web --desktop）的模型写成 'drf:assets/…'，由 preload 暴露的 __drfs.read 经 IPC 同步读盘；贴图 / 配音是相对网址 assets/…，走 app:// 协议。
// 快捷键：F11 / Alt+Enter 全屏切换，F12 开发者工具（排查用），Ctrl+R 重载。
// 存档：11-17 起 localStorage / IndexedDB（武器库）存在游戏目录 data/ 下（不可写时退回 %APPDATA%/暗岩传说），与浏览器里的存档互不相通。
// 启动计时：每次启动往 %APPDATA%/暗岩传说/launch.log 追加一行（页面载入完成的毫秒数）。
const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

const T0 = Date.now();
app.setName('暗岩传说');

// 11-17 Rhett：人物存档（localStorage）与武器库（IndexedDB）都放在游戏本体目录 <DarkRock.exe 所在目录>/data；
//   该目录不可写（例如装在 Program Files）时退回 %APPDATA%/暗岩传说 并在进游戏后提示一次。
//   第一次用 data 目录时，把旧位置 %APPDATA%/暗岩传说 里的存档 / 武器库搬过来（只复制，不删旧的）。
const OLD_DATA = app.getPath('userData');
const DATA = (() => {
  const want = path.join(path.dirname(process.execPath), 'data');
  try { fs.mkdirSync(want, { recursive: true }); const t = path.join(want, '.w'); fs.writeFileSync(t, '1'); fs.unlinkSync(t); return want; }
  catch { return ''; }
})();
let dataNote = '';
if (DATA) {
  for (const d of ['Local Storage', 'IndexedDB']) {
    const src = path.join(OLD_DATA, d), dst = path.join(DATA, d);
    try { if (fs.existsSync(src) && !fs.existsSync(dst)) { fs.cpSync(src, dst, { recursive: true }); dataNote += `已从 ${src} 迁移 ${d}；`; } } catch (e) { dataNote += `迁移 ${d} 失败 ${e.message}；`; }
  }
  app.setPath('userData', DATA);
}
const DATA_RO = !DATA;
let roShown = false;

// GPU：忽略显卡黑名单、优先独显、GPU 光栅化；视频/音乐不需要先点一下
for (const [k, v] of [
  ['ignore-gpu-blocklist'], ['enable-gpu-rasterization'], ['enable-zero-copy'],
  ['force_high_performance_gpu'], ['autoplay-policy', 'no-user-gesture-required'],
  ['js-flags', '--max-old-space-size=4096'],
]) app.commandLine.appendSwitch(k, v);
// 排查用：带 --angle=d3d11 / gl / vulkan 启动可换 ANGLE 后端
const angle = process.argv.find(a => a.startsWith('--angle='));
if (angle) app.commandLine.appendSwitch('use-angle', angle.slice(8));

if (!app.requestSingleInstanceLock()) { app.quit(); }

// app://game/<路径> → resources/app/game/<路径>（只读，不许跳出 game 目录）
const GAME = path.join(__dirname, 'game');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const inGame = rel => { const f = path.normalize(path.join(GAME, decodeURIComponent(rel))); if (f !== GAME && !f.startsWith(GAME + path.sep)) throw new Error('越界路径：' + rel); return f; };
let drfsN = 0, drfsB = 0, drfsMs = 0;
ipcMain.on('drfs-read', (e, rel) => {
  const t = Date.now();
  try { const b = fs.readFileSync(inGame(String(rel))); drfsN++; drfsB += b.length; e.returnValue = b; } catch (err) { log(`drfs-read 失败 ${rel} ${err.message}`); e.returnValue = null; }
  drfsMs += Date.now() - t;
});
ipcMain.on('drfs-exists', (e, rel) => { try { e.returnValue = fs.existsSync(inGame(String(rel))); } catch { e.returnValue = false; } });   // 11-17 离线武器库探测
ipcMain.on('drfs-mark', (_e, what) => log(`${String(what).slice(0, 80)} ${Date.now() - T0} ms（已读盘 ${drfsN} 个 ${(drfsB / 1048576).toFixed(0)} MB，读盘耗时 ${drfsMs} ms）`));

let drfsLogN = 0;   // 11-13 页面诊断行：每次启动最多 600 行，防日志无限长
ipcMain.on('drfs-log', (_e, line) => { if (++drfsLogN <= 600) log(String(line).slice(0, 400)); });
// 11-17 内置铸造服务：复用评委包「启动铸造服务」（deploy/local/forge_local.js → cloud/forge-fc），只监听 127.0.0.1，
//   第一次访问 app://game/forge|glb|health 时才启动；页面同源访问 app://game/…，主进程转发（Electron 主进程没有跨域限制）。
//   Key 由玩家在铸造台填写，经同一路由交给本机服务；勾选「记在本机」才写到 data/forge/config.json。任务和模型在 data/forge/glb，重启续跑。
let forgeMod = null, forgeReady = null;
function forgeStart() {
  if (forgeReady) return forgeReady;
  const home = path.join(app.getPath('userData'), 'forge');
  Object.assign(process.env, { FORGE_HOME: home, NO_BROWSER: '1', PORT: process.env.DARKROCK_FORGE_PORT || '17870', PAGE_FILE: path.join(GAME, 'index.html') });
  forgeReady = new Promise((res, rej) => {
    try {
      forgeMod = require('./deploy/local/forge_local.js');
      const s = forgeMod.server;
      if (s.listening) return res(forgeMod.port());
      s.once('listening', () => { log(`铸造服务已启动 127.0.0.1:${forgeMod.port()}（${home}）`); res(forgeMod.port()); });
      setTimeout(() => rej(new Error('铸造服务启动超时')), 15000);
    } catch (e) { rej(e); }
  });
  forgeReady.catch(e => { log('铸造服务启动失败 ' + e.message); forgeReady = null; });
  return forgeReady;
}
async function forgeProxy(req, u) {
  let port; try { port = await forgeStart(); } catch (e) { return new Response(JSON.stringify({ error: '本机铸造服务没有启动成功，已退回离线武器库' }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
  const h = {}; for (const k of ['content-type', 'range']) { const v = req.headers.get(k); if (v) h[k] = v; }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, { method: req.method, headers: h, body });
  const oh = {}; r.headers.forEach((v, k) => { if (!/^(content-encoding|transfer-encoding|connection)$/i.test(k)) oh[k] = v; });
  return new Response(req.method === 'HEAD' ? null : Buffer.from(await r.arrayBuffer()), { status: r.status, headers: oh });
}

let win = null;
function log(line) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'launch.log'), `${new Date().toISOString()} ${line}\n`); } catch {}
}

// 前 3 分钟每 5 秒往 launch.log 记一行内存（各进程常驻 MB）和已读盘量，排查首进耗时 / 内存用
const memTimer = setInterval(() => { if (Date.now() - T0 > 180000) return clearInterval(memTimer); const m = app.getAppMetrics().map(x => `${x.type}:${(x.memory.workingSetSize / 1024).toFixed(0)}`).join(' '); log(`mem t=${Date.now() - T0} 读盘=${drfsN}个/${(drfsB / 1048576).toFixed(0)}MB ${m}`); }, 5000);
function createWindow() {
  // 11-13 I01：原来先按 1600×900 建窗、ready-to-show 再最大化；Rhett 截图里标题页左上黑块正好约占窗口 86%×90%（≈1600×900 / 最大化后客户区），
  //   疑似初始尺寸的合成层 / 画布缓冲没跟上最大化 → 直接按工作区大小建窗，最大化后再补发一次 resize
  const wa = (() => { try { return require('electron').screen.getPrimaryDisplay().workAreaSize; } catch { return { width: 1600, height: 900 }; } })();
  win = new BrowserWindow({
    width: Math.max(960, wa.width), height: Math.max(540, wa.height), minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    title: '暗岩传说：深渊回响',
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.maximize(); win.show();
    for (const t of [200, 1000]) setTimeout(() => { if (!win.isDestroyed()) win.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'))").catch(() => {}); }, t); });
  // 最大化 / 还原 / 全屏切换后也补一次（个别显卡驱动下 Chromium 合成层尺寸会滞后一帧以上）
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => setTimeout(() => { if (!win.isDestroyed()) win.webContents.executeJavaScript("window.dispatchEvent(new Event('resize'))").catch(() => {}); }, 120));

  // 外链用系统浏览器打开，窗口本身不跳出游戏
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
  });

  win.webContents.on('did-finish-load', () => {
    log(`did-finish-load ${Date.now() - T0} ms`);
    if (DATA_RO && !roShown) { roShown = true; setTimeout(() => { if (!win.isDestroyed()) dialog.showMessageBox(win, { type: 'info', title: '暗岩传说', message: '游戏所在文件夹不能写入（可能装在受保护的目录里）', detail: `人物存档和武器库这次存在：\n${app.getPath('userData')}\n把游戏文件夹放到 D 盘等可写位置，存档就会跟着游戏文件夹走。` }).catch(() => {}); }, 3000); }
  });
  win.webContents.on('render-process-gone', (_e, d) => log(`render-process-gone ${d.reason} ${d.exitCode}`));

  win.loadURL('app://game/index.html' + (process.env.DARKROCK_QUERY ? '?' + process.env.DARKROCK_QUERY : ''));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  protocol.handle('app', req => { const u = new URL(req.url); if (/^\/(forge|glb|health)(\/|$)/.test(u.pathname)) return forgeProxy(req, u).catch(e => { log('铸造转发失败 ' + e.message); return new Response(JSON.stringify({ error: '本机铸造服务出错，请稍后再试' }), { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }); try { return net.fetch(pathToFileURL(inGame(u.pathname.replace(/^\/+/, ''))).toString(), { headers: req.headers }); } catch (e) { return new Response('forbidden', { status: 403 }); } });
  log(`数据目录 ${app.getPath('userData')}${DATA_RO ? '（游戏目录不可写，已退回用户目录）' : ''}${dataNote ? ' ' + dataNote : ''}`);
  Menu.setApplicationMenu(null); createWindow();
});
app.on('window-all-closed', () => app.quit());
