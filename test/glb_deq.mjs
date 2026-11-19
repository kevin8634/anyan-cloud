// 11-18 钟铜法杖尖刺自查：量化（Int16 归一化）几何直接套矩阵 + 平移到脚底会溢出；先转浮点（creatures_glb deq）后高度正常
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const src = fs.readFileSync(new URL('../src/web/creatures_glb.ts', import.meta.url), 'utf8');
const ok0 = (src.match(/deq\(m\.geometry\.clone\(\)\)\.applyMatrix4/g) ?? []).length === 3;
const buf = fs.readFileSync(new URL('../assets_aholo/props/weapon_bell_staff.glb', import.meta.url));
const L0 = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + L0).toString());
delete j.textures; delete j.images; delete j.samplers; for (const m of j.materials ?? []) { const p = m.pbrMetallicRoughness; if (p) { delete p.baseColorTexture; delete p.metallicRoughnessTexture; } delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; }
for (const k of ['extensionsUsed', 'extensionsRequired']) if (j[k]) j[k] = j[k].filter(e => !/texture|webp|ktx/i.test(e));
let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const rest = buf.subarray(20 + L0), hdr = Buffer.alloc(20); hdr.write('glTF', 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(20 + js.length + rest.length, 8); hdr.writeUInt32LE(js.length, 12); hdr.writeUInt32LE(0x4E4F534A, 16);
const glb = Buffer.concat([hdr, js, rest]);
globalThis.self = globalThis; await MeshoptDecoder.ready; const Ld = new GLTFLoader(); Ld.setMeshoptDecoder(MeshoptDecoder);
const g = await Ld.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
let m; g.scene.traverse(o => { if (!m && o.isMesh) m = o; }); m.updateWorldMatrix(true, false);
const deq = geo => { for (const nm of ['position', 'normal']) { const a = geo.getAttribute(nm); if (!a || a.array instanceof Float32Array) continue; const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k); geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize)); } return geo; };
const run = d => { const geo = (d ? deq(m.geometry.clone()) : m.geometry.clone()).applyMatrix4(m.matrixWorld); geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0); geo.computeBoundingBox(); const p = geo.attributes.position; let wrap = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.3 && m.geometry.attributes.position.getY(i) > 0.9) wrap++; return { h: +(geo.boundingBox.max.y - geo.boundingBox.min.y).toFixed(3), wrap }; };
const a = run(false), b = run(true);
console.log({ quantized: m.geometry.attributes.position.array.constructor.name, old: a, fixed: b, wired: ok0 });
const ok = ok0 && b.wrap === 0 && Math.abs(b.h - 1.0) < 0.02;
console.log(ok ? '✓ glb deq' : '✗ glb deq'); process.exit(ok ? 0 : 1);
