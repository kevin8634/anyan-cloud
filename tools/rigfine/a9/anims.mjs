import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) { const doc = await io.read(f), r = doc.getRoot();
  const an = r.listAnimations().map(a => { let mx=0; for (const s of a.listSamplers()) { const t=s.getInput().getArray(); mx=Math.max(mx,t[t.length-1]); } return a.getName()+':'+mx.toFixed(2)+'s/'+a.listChannels().length; });
  console.log(f.split('/').pop(), 'anims', an.length, an.join(' '), '| nodes', r.listNodes().filter(n=>!r.listSkins()[0]?.listJoints().includes(n)).map(n=>n.getName()).join(','));
}
