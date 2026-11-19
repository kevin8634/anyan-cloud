// 暗岩传说 · 桌面版 preload（沙箱模式）：给页面一个只读的同步读盘口 __drfs.read(相对 game/ 的路径) → Uint8Array
//   只服务桌面版构建里 'drf:assets/…' 的模型引用（src/web/b64.ts）；__drfs.mark 往 launch.log 记一个时间点（排查首进耗时）
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('__drfs', {
  read: rel => { const r = ipcRenderer.sendSync('drfs-read', String(rel)); if (!r) throw new Error('读不到资源：' + rel); return r; },
  exists: rel => !!ipcRenderer.sendSync('drfs-exists', String(rel)),   // 11-17 离线武器库
  mark: what => ipcRenderer.send('drfs-mark', String(what)),
  log: line => ipcRenderer.send('drfs-log', String(line)),   // 11-13 自动诊断（帧数 / 报错 / NPC 身高）写 launch.log
  desktop: true,
});

// 11-17 内置铸造服务：铸造台地址指向同源 app://game（主进程转发到本机 127.0.0.1 铸造服务），smithyMode() = 'server' + 本机模式
try { localStorage.setItem('darkrock_forge_api', 'app://game'); localStorage.setItem('darkrock_forge_local', '1'); } catch (e) { /* 忽略 */ }
