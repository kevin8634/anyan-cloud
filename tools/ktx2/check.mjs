// 校验缓存 GLB：gltf-transform 能读（meshopt 解码 + KHR_texture_basisu），所有访问器数据与源 GLB 逐值一致，贴图全为 KTX2 且尺寸不变
//   node tools/ktx2/check.mjs [--only=正则]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, existsSync } from 'fs';
import { scopeFiles, cachedPath } from './convert.mjs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const o = process.argv.find(a => a.startsWith('--only=')); const only = o ? new RegExp(o.slice(7)) : null;
let bad = 0, n = 0;
for (const rel of scopeFiles()) {
  if (only && !only.test(rel)) continue;
  const src = readFileSync('assets_aholo/' + rel), cp = cachedPath(rel, src); if (!existsSync(cp)) { console.log('缺缓存', rel); bad++; continue; }
  const a = await io.readBinary(new Uint8Array(src)), b = await io.readBinary(new Uint8Array(readFileSync(cp)));
  const A = a.getRoot().listAccessors(), B = b.getRoot().listAccessors(); let err = '';
  if (A.length !== B.length) err += `访问器数 ${A.length}≠${B.length} `;
  else for (let i = 0; i < A.length; i++) { const x = A[i].getArray(), y = B[i].getArray(); if (x.length !== y.length || x.some((v, j) => v !== y[j] && !(Number.isNaN(v) && Number.isNaN(y[j])))) { err += `访问器 ${i} 不一致 `; break; } }
  const ta = a.getRoot().listTextures(), tb = b.getRoot().listTextures();
  if (ta.length !== tb.length) err += `贴图数 ${ta.length}≠${tb.length} `;
  for (let i = 0; i < tb.length && i < ta.length; i++) { if (tb[i].getMimeType() !== 'image/ktx2') err += `贴图 ${i} 不是 ktx2 `; const sa = ta[i].getSize(), sb = tb[i].getSize(); if (sa && sb && (sa[0] !== sb[0] || sa[1] !== sb[1])) err += `贴图 ${i} 尺寸 ${sa}→${sb} `; }
  if (a.getRoot().listAnimations().length !== b.getRoot().listAnimations().length) err += '动画数不一致 ';
  if (a.getRoot().listSkins().length !== b.getRoot().listSkins().length) err += '蒙皮数不一致 ';
  n++; if (err) { bad++; console.log('✗', rel, err); }
}
console.log(`检查 ${n} 个，问题 ${bad} 个`); process.exit(bad ? 1 : 0);
