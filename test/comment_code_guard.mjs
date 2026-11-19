// 11-18 守卫：行尾注释里吞了代码（b0d0f2f 主手 luxify、9a06b14 伊奥拉锁高各中招一次）
// 找「// …」之后又出现「a.b(…); c(…)」或「if (…) f(」的行；旧代码里确认是注释说明的，加进 ALLOW
import fs from 'fs'; import path from 'path';
const ROOT = new URL('../src', import.meta.url).pathname, hits = [];
const ALLOW = [];
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.gen.ts')) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
  if (l.length > 4000) return; const k = l.indexOf('// '); if (k < 0 || /['"`][^'"`]*\/\/ /.test(l.slice(0, k + 3))) return; const c = l.slice(k);
  if (/[A-Za-z_]\w*(\.\w+)*\([^()]*\)\s*;\s*[A-Za-z_]\w*(\.\w+)*\(/.test(c) || /\bif \([^)]*\) \w+\(/.test(c)) { const id = `${path.relative(ROOT, p)}:${i + 1}`; if (!ALLOW.some(a => id.startsWith(a))) hits.push(`${id}  ${l.trim().slice(0, 160)}`); } }); } };
walk(ROOT); console.log(hits.join('\n')); console.log(hits.length ? `✗ comment-code ${hits.length}` : '✓ comment-code'); process.exit(hits.length ? 1 : 0);
