// v1.2.17：Mixamo 无皮肤动作 FBX → 一个只有骨架 + 动作的 meshopt GLB（assets/models_hd/Mixamo_Anims.glb）
// 原始 FBX 放 /workspace/work/mixamo/（Adobe Mixamo 授权：可用于游戏，原始文件不可单独分发，不进 git）
// 绑定姿势取带皮肤的 T 姿势角色（Paladin J Nordstrom）的骨架默认变换；动作只留四元数轨道 + 髋部位移，30 fps 重采样
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
const DIR = process.argv[2] ?? '/workspace/work/mixamo/';
const files = fs.readdirSync(DIR);
const find = p => files.find(f => f.startsWith(p));
/** 片段名 → FBX 文件名前缀 */
const JOBS = {
  MX_Idle_SS: 'Sword And Shield Idle', MX_Slash_SS: 'Sword And Shield Slash', MX_Attack_SS: 'Sword And Shield Attack', MX_GreatSlash: 'Great Sword Slash',
  MX_Downward: 'Standing Melee Attack Downward', MX_Magic_1H: 'Standing 1H Magic Attack 01', MX_Magic_2H: 'Standing 2H Magic Attack 01', MX_Spell: 'Magic Spell Casting',
  MX_Throw: 'Throw', MX_DrawArrow: 'Standing Draw Arrow', MX_AimRecoil: 'Standing Aim Recoil', MX_Hit: 'Hit Reaction', MX_Death: 'Dying',
  MX_Run: 'Running', MX_Walk: 'Walking', MX_Roll: 'Stand To Roll',
};
// three 的 FBXLoader 在 node 里没有 window / document：给个最小桩（只解析骨骼动画，不读贴图）
globalThis.window ??= globalThis; globalThis.self ??= globalThis;
globalThis.document ??= { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const loader = new FBXLoader();
const load = f => { const b = fs.readFileSync(DIR + f); return loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), DIR); };
const restSrc = load(find('Paladin J Nordstrom'));
const bones = []; restSrc.traverse(o => { if (o.isBone) bones.push(o); });
const root = bones.find(b => !b.parent?.isBone);
console.log('骨骼', bones.length, '根', root.name, 'scene scale', restSrc.scale.x);
const doc = new Document(); const buf = doc.createBuffer();
const nodeOf = new Map();
// FBXLoader 会给每根骨骼再生一个同名子骨骼（单位变换）：合并掉，否则 three 按名字绑定会绑到不动的那一个
const kids = o => o.children.filter(c => c.isBone).flatMap(c => c.name === o.name ? kids(c) : [c]);
let dupMax = 0; restSrc.traverse(o => { if (o.isBone && o.parent?.name === o.name) dupMax = Math.max(dupMax, o.position.length(), 2 * Math.acos(Math.min(1, Math.abs(o.quaternion.w)))); });
console.log('同名子骨骼最大偏移', dupMax.toFixed(4));
const mk = (o) => { const n = doc.createNode(o.name).setTranslation(o.position.toArray()).setRotation(o.quaternion.toArray()).setScale(o.scale.toArray()); nodeOf.set(o.name, n); for (const c of kids(o)) n.addChild(mk(c)); return n; };
const top = doc.createNode('MixamoRoot').setScale(restSrc.scale.toArray()); top.addChild(mk(root));
const scene = doc.createScene('Scene').addChild(top);

const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
for (const [name, pre] of Object.entries(JOBS)) {
  const f = find(pre); if (!f) { console.log('缺', pre); continue; }
  const g = load(f); const clip = g.animations[0]; if (!clip) { console.log('无动作', f); continue; }
  const anim = doc.createAnimation(name);
  for (const t of clip.tracks) {
    const [bn, prop] = t.name.split('.');
    const node = nodeOf.get(bn); if (!node) continue;
    if (prop === 'position' && bn !== root.name) continue;   // 只留髋部位移
    if (prop === 'scale') continue;
    const path = prop === 'quaternion' ? 'rotation' : 'translation';
    const s = doc.createAnimationSampler().setInput(acc(new Float32Array(t.times), 'SCALAR')).setOutput(acc(new Float32Array(t.values), prop === 'quaternion' ? 'VEC4' : 'VEC3')).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(s));
  }
  console.log(name, '←', f, clip.duration.toFixed(2) + 's', clip.tracks.length, 'tracks');
}
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
await doc.transform(resample({ tolerance: 1e-3 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const out = 'assets/models_hd/Mixamo_Anims.glb'; await io.write(out, doc);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
