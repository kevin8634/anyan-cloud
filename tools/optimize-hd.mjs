// v1.2.0-m1 写实人形底座（Quaternius Universal Animation Library Standard，CC0）：只留 m1 需要的动作 + meshopt 压缩
// 源文件：https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip → Godot/AnimationLibrary_Godot_Standard.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, resample, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const SRC = process.argv[2] ?? '/tmp/qa/ual/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb';
const KEEP = ['A_TPose', 'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sword_Attack', 'Punch_Cross', 'Punch_Jab', 'Spell_Simple_Shoot', 'Spell_Simple_Idle_Loop', 'Hit_Chest', 'Death01', 'Roll', 'Interact', 'Sword_Idle', 'Hit_Head'];   // v1.2.17 +Hit_Head（受击第二种）
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(SRC);
for (const a of doc.getRoot().listAnimations()) if (!KEEP.includes(a.getName())) { a.listChannels().forEach(c => c.dispose()); a.listSamplers().forEach(s => s.dispose()); a.dispose(); }
await doc.transform(resample({ tolerance: 1e-3 }), weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const out = 'assets/models_hd/UAL_Mannequin.glb';
await io.write(out, doc);
const tris = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(out, ((await import('fs')).statSync(out).size / 1024).toFixed(0) + ' KB', doc.getRoot().listAnimations().length + ' anims', tris + ' tris');
