import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import fs from 'fs';
globalThis.self = globalThis; globalThis.createImageBitmap = undefined;
await MeshoptDecoder.ready;
const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
const strip = buf => { // remove images/textures from glb json to avoid image decoding in node
  const n = buf.readUInt32LE(12); const j = JSON.parse(buf.slice(20, 20 + n));
  delete j.images; delete j.textures; delete j.samplers; for (const m of j.materials || []) { for (const k of Object.keys(m.pbrMetallicRoughness || {})) if (k.endsWith('Texture')) delete m.pbrMetallicRoughness[k]; delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; }
  let s = Buffer.from(JSON.stringify(j)); const pad = (4 - s.length % 4) % 4; s = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  const rest = buf.slice(20 + n); const out = Buffer.alloc(12); out.write('glTF'); out.writeUInt32LE(2, 4);
  const hdr = Buffer.alloc(8); hdr.writeUInt32LE(s.length, 0); hdr.write('JSON', 4);
  const all = Buffer.concat([out, hdr, s, rest]); all.writeUInt32LE(all.length, 8); return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
};
export const load = f => new Promise((res, rej) => L.parse(strip(fs.readFileSync('assets/models_hd/' + f + '.glb')), '', res, rej));
if (process.argv[2] === 'probe') {
  const ual = await load('UAL_Mannequin'), ubc = await load('UBC_Male');
  console.log('UAL clips', ual.animations.map(a => a.name + ':' + a.duration.toFixed(2)).join(' '));
  const dir = (sc, a, b) => { sc.updateMatrixWorld(true); const pa = new THREE.Vector3(), pb = new THREE.Vector3(); sc.getObjectByName(a).getWorldPosition(pa); sc.getObjectByName(b).getWorldPosition(pb); return pb.sub(pa).normalize().toArray().map(x => x.toFixed(2)); };
  const m = new THREE.AnimationMixer(ual.scene); const tp = ual.animations.find(a => a.name === 'A_TPose'); m.clipAction(tp).play(); m.update(0);
  console.log('UAL tpose upperarm.L->forearm', dir(ual.scene, 'DEF-upper_armL', 'DEF-forearmL'), 'hips->head', dir(ual.scene, 'DEF-hips', 'DEF-head'));
  console.log('UBC bind upperarm_l->lowerarm', dir(ubc.scene, 'upperarm_l', 'lowerarm_l'), 'pelvis->Head', dir(ubc.scene, 'pelvis', 'Head'));
  const h = s => { const b = new THREE.Box3().setFromObject(s); return (b.max.y - b.min.y).toFixed(2); };
  console.log('heights', h(ual.scene), h(ubc.scene));
}
