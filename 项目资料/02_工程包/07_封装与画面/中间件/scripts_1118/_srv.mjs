// 共用：静态服务 web/desktop（ROOT 环境变量可改），找不到再回 web/
import http from 'http'; import fs from 'fs'; import path from 'path';
export const ROOT = process.env.ROOT || '/workspace/work/pack1118/web/desktop';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2' };
export function serve(port) { return http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); let f = path.join(ROOT, u); if (!fs.existsSync(f)) f = path.join(path.dirname(ROOT), u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(port); }
export const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'];
export const DRFS = () => { window.__drfs = { read(p) { const x = new XMLHttpRequest(); x.open('GET', '/' + p, false); x.overrideMimeType('text/plain; charset=x-user-defined'); x.send(); const t = x.responseText, u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255; return u; }, mark() {}, log() {} }; };
