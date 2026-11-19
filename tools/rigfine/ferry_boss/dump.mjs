// raidA 11-02 v2：从成品 glb 导出身体/脸 primitive（绑定姿势 pos/uv/idx）与贴图，供 hood.py / 诊断用（不依赖旧中间件）
// node tools/rigfine/ferry_boss/dump.mjs <glb> <outDir>
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder } from 'meshoptimizer'; import { dequantize } from '@gltf-transform/functions'; import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'fs'; import sharp from 'sharp';
await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [glb, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const d = await io.read(glb); await d.transform(dequantize()); const r = d.getRoot(); const sk = r.listSkins()[0]; const js = sk.listJoints(); const ibm = sk.getInverseBindMatrices();
const bones = {}; js.forEach((j, i) => bones[j.getName().replace(/^mixamorig:?/, '')] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm.getElement(i, [])).invert()).toArray());
writeFileSync(out + '/bones.json', JSON.stringify(bones));
const prims = r.listMeshes()[0].listPrimitives();
for (const [k, p] of [['body', prims[0]], ['face', prims[1]]]) {
  const w = (n, a) => writeFileSync(`${out}/${k}_${n}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  w('pos', new Float32Array(p.getAttribute('POSITION').getArray())); w('uv', new Float32Array(p.getAttribute('TEXCOORD_0').getArray())); w('idx', new Uint32Array(p.getIndices().getArray()));
  const ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'); w('jn', new Uint16Array(ja.getArray())); w('wt', new Float32Array(wa.getArray()));
  const m = p.getMaterial(); for (const [s, t] of [['base', m.getBaseColorTexture()], ['nrm', m.getNormalTexture()], ['emi', m.getEmissiveTexture()]]) if (t) await sharp(Buffer.from(t.getImage())).png().toFile(`${out}/${k}_${s}.png`);
}
const robe = prims[2]; if (robe) { const m = robe.getMaterial(); await sharp(Buffer.from(m.getBaseColorTexture().getImage())).png().toFile(`${out}/robe_base.png`); }
console.log('dumped', out, Object.keys(bones).length, 'bones');
