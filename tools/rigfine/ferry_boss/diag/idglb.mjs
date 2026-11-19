// A8fix 诊断：材质 ID 版（身体红、脸绿、其它灰，无贴图），看额角尖三角属于哪个材质。node idglb.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [a, b] = process.argv.slice(2); const d = await io.read(a);
for (const m of d.getRoot().listMaterials()) { const n = m.getName(); m.setBaseColorTexture(null).setEmissiveTexture(null).setNormalTexture(null).setEmissiveFactor([0, 0, 0]).setBaseColorFactor(/Body/.test(n) ? [0.9, 0.15, 0.1, 1] : /Face/.test(n) ? [0.1, 0.8, 0.2, 1] : [0.5, 0.5, 0.5, 1]); }
await io.write(b, d);
