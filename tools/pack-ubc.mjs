// v1.2.0-m1b：Quaternius UBC 底座 + Outfits Fantasy 免费版服装 → meshopt GLB（原包放 /workspace/work/assets_raw，不进 git）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const R = '/workspace/work/assets_raw/x/';
const JOBS = [
  [R + 'Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf', 'UBC_Male.glb'],
  [R + 'Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf', 'UBC_Female.glb'],
  [R + 'Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/Male_Ranger.gltf', 'Outfit_Male_Ranger.glb'],
  [R + 'Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/Male_Peasant.gltf', 'Outfit_Male_Peasant.glb'],
];
for (const [src, name] of JOBS) {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = 'assets/models_hd/' + name; await io.write(out, doc);
  const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const bones = doc.getRoot().listSkins()[0]?.listJoints().map(j => j.getName()) ?? [];
  console.log(name, (fs.statSync(out).size / 1024).toFixed(0) + ' KB', tris + ' tris', bones.length + ' bones', bones.slice(0, 6).join(','), 'tex', doc.getRoot().listTextures().length);
}
