// v1.2.55 浏览器端减面（导入本地 GLB 游戏版）：与服务端 decimateGlb 结果一致。node test/glbdecimate_web.test.mjs
import { build } from 'esbuild'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url); const { countTris, decimateGlb } = require('../cloud/forge-fc/glbslim.js');
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fails++; };
function sphere(N) { const pos = [], uv = [], ind = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) { const u = x / N, v = y / N, th = u * Math.PI * 2, ph = v * Math.PI; pos.push(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)); uv.push(u, v); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1; ind.push(a, c, b, b, c, d); }
  const P = Buffer.from(new Float32Array(pos).buffer), U = Buffer.from(new Float32Array(uv).buffer), I = Buffer.from(new Uint32Array(ind).buffer), bin = Buffer.concat([P, U, I]), nv = pos.length / 3;
  const json = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2 }] }], buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: P.length }, { buffer: 0, byteOffset: P.length, byteLength: U.length }, { buffer: 0, byteOffset: P.length + U.length, byteLength: I.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] }, { bufferView: 1, componentType: 5126, count: nv, type: 'VEC2' }, { bufferView: 2, componentType: 5125, count: ind.length, type: 'SCALAR' }] };
  let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(28 + js.length + bin.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4E4F534A, 4); const c2 = Buffer.alloc(8); c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004E4942, 4);
  return Buffer.concat([h, c1, js, c2, bin]); }
const out = '/tmp/_dec_web_test.mjs';
await build({ stdin: { contents: "export { decimateGlbWeb } from './src/dlc/dlc1/glbdecimate_web.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
const { decimateGlbWeb } = await import(out);
const big = sphere(120), ab = big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength);
const r = await decimateGlbWeb(ab); const outBuf = Buffer.from(r.buf);
ok(r.info.trisBefore === 28800 && r.info.trisAfter <= 6000, `28800 面 → ${r.info.trisAfter} 面（目标 6000）`);
ok(countTris(outBuf) === r.info.trisAfter, '输出 GLB 能重新解析，面数一致');
const srv = await decimateGlb(big, { targetTris: 6000 });
ok(Math.abs(srv.info.trisAfter - r.info.trisAfter) <= 30, `与服务端结果一致（服务端 ${srv.info.trisAfter}）`);
const small = sphere(40), r2 = await decimateGlbWeb(small.buffer.slice(small.byteOffset, small.byteOffset + small.byteLength));
ok(!!r2.info.skip && r2.info.trisAfter === 3200, '3200 面不超过 6000 → 不减');
const bad = await decimateGlbWeb(new Uint8Array(40).buffer); ok(!!bad.info.error, '坏文件 → 原样返回并记错误');
console.log(fails ? `✗ ${fails} 项失败` : '✓ 全部通过'); process.exitCode = fails ? 1 : 0;
