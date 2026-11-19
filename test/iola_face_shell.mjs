// 11-17 伊奥拉黑脸自查：发壳（Iola_hair）在脸前的三角形被去掉，脸本身与脑后 / 两侧发壳保留
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const buf = fs.readFileSync(new URL('../assets_aholo/dlc1/creatures/raw_iola3d.glb', import.meta.url));
const L0 = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + L0).toString());
delete j.textures; delete j.images; delete j.samplers;
for (const m of j.materials) { if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; }
if (j.extensionsUsed) j.extensionsUsed = j.extensionsUsed.filter(e => !/texture|webp|ktx/i.test(e));
let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const rest = buf.subarray(20 + L0), hdr = Buffer.alloc(20); hdr.write('glTF', 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(20 + js.length + rest.length, 8); hdr.writeUInt32LE(js.length, 12); hdr.writeUInt32LE(0x4E4F534A, 16);
const glb = Buffer.concat([hdr, js, rest]);
globalThis.self = globalThis;
const { execFileSync } = await import('child_process'); const out = new URL('./_iola3d_test.gen.mjs', import.meta.url).pathname;
execFileSync('npx', ['esbuild', new URL('../src/dlc/dlc1/iola_3d.ts', import.meta.url).pathname, '--bundle', '--format=esm', '--platform=node', '--external:three', '--outfile=' + out, '--log-level=error'], { stdio: 'inherit' });
const { clearFaceShell } = await import(out);
await MeshoptDecoder.ready; const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
const g = await L.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
const cnt = (n) => { let t = 0; g.scene.traverse(o => { if (o.isMesh && o.material.name === n) t += (o.geometry.index?.count ?? 0) / 3; }); return t; };
const h0 = cnt('Iola_hair'), f0 = cnt('Iola_face');
const n = clearFaceShell(g.scene);
const h1 = cnt('Iola_hair'), f1 = cnt('Iola_face');
console.log({ shellBefore: h0, shellAfter: h1, removed: n, face: f1 });
const ok = n > 0 && h1 === h0 - n && f1 === f0 && h1 > h0 * 0.5;
console.log(ok ? '✓ iola face shell' : '✗ iola face shell'); fs.rmSync(out, { force: true }); process.exit(ok ? 0 : 1);
