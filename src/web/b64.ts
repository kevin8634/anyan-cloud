// fix1106 载入提速：base64 → ArrayBuffer。浏览器有原生 Uint8Array.fromBase64（Chrome 140+ / Firefox 133+ / Safari 18.2+）就用原生解码
//   （C++ 一次解完，不再 atob 出二进制字符串再逐字节 charCodeAt 拷贝：几百 MB 内嵌模型省一次整份字符串 + JS 循环）；没有就走原来的写法
type FromB64 = { fromBase64?: (s: string) => Uint8Array };
export function b64ToBuf(b64: string): ArrayBuffer {
  // 11-11 桌面版资源拆包：'drf:<相对路径>' = 资产在页面旁的磁盘文件，由桌面外壳 preload 暴露的 __drfs.read 同步读出（网页版构建里永远不会出现这种值）
  if (b64.startsWith('drf:')) { const fs = (globalThis as unknown as { __drfs?: { read(p: string): ArrayBuffer | Uint8Array } }).__drfs; if (!fs) throw new Error('桌面版资源需要桌面外壳：' + b64);
    const r = fs.read(b64.slice(4)); if (r instanceof ArrayBuffer) return r; return r.byteOffset === 0 && r.byteLength === r.buffer.byteLength ? r.buffer as ArrayBuffer : r.slice().buffer as ArrayBuffer; }
  const F = (Uint8Array as unknown as FromB64).fromBase64;
  if (typeof F === 'function') { try { const u = F.call(Uint8Array, b64); return u.byteOffset === 0 && u.byteLength === u.buffer.byteLength ? u.buffer as ArrayBuffer : u.slice().buffer as ArrayBuffer; } catch { /* 非标准字符：回退 */ } }
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
