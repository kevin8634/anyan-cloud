import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]), r = doc.getRoot();
console.log('skins', r.listSkins().map(s=>s.listJoints().length), 'scenes', r.listScenes().length);
for (const n of r.listNodes()) if (n.getMesh()) { const par = r.listNodes().find(p=>p.listChildren().includes(n)); console.log(n.getName(), 'skin', !!n.getSkin(), 'parent', par?.getName(), 'prims', n.getMesh().listPrimitives().map(p=>p.getMaterial()?.getName()+':'+(p.getIndices()?.getCount()/3)).join(',')); }
