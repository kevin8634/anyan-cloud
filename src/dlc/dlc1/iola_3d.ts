// 11-17 Rhett 13:00 亲自从 Blender 导出伊奥拉（毛发卡片版：本体 + 脸 + 发壳 + 4 组发片），接进游戏替代立片。
//   源件 assets_aholo/dlc1/creatures/raw_iola3d.glb（去掉 Iola_orig 原件、空物体、风场动画；贴图压 1024 webp；meshopt）。
//   raw_ 前缀：不进 registerCreatureGlb（那条只取第一个网格），这里整棵场景解析。
//   用法同立片：原 NPC 网格不画，模型挂在 fx 组里；世界高度每帧锁 = 玩家实测身高（未量到 2.11）。?off=iola3d 回立片。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { b64ToBuf } from '../../web/b64';
import { withKtx2 } from '../../web/ktx2';
import { PACK_CREATURE_GLB } from './creatures.gen';

const ID = 'raw_iola3d';
let off3: boolean | null = null;
export function iola3dOn(): boolean {
  if (off3 === null) {
    off3 = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      off3 = `${q},${ls}`.split(',').map(s => s.trim()).includes('iola3d');
    } catch { off3 = false; }
  }
  return !off3 && ID in PACK_CREATURE_GLB;
}

function offKey(k: string): boolean {
  try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '', ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return `${q},${ls}`.split(',').map(x => x.trim()).includes(k); } catch { return false; }
}

/** 11-17 Rhett「修复她的黑脸」：Iola_fix 里的发壳（材质 Iola_hair，深棕 0.12/0.08/0.055 × 身体贴图，BLEND）一直包到脸的最前面
 *  （和脸同一 z 上限），透明物体排在不透明的脸之后画 → 整张脸被一层深棕盖住。把发壳在「脸包围盒」x / y 范围内、且在脸背面以前的三角形
 *  从索引里去掉（不动顶点，相邻发丝不变形）；两侧和脑后的发壳保留。?off=iolaface 回原样。返回去掉的三角形数 */
export function clearFaceShell(root: THREE.Object3D): number {
  // 11-18 Rhett 再报黑脸：真正的元凶还有头皮球 Iola_scalpM（不透明深棕 0.2/0.1/0.05，另一个节点、缩放 0.07）——前缘 z 0.094 穿出脸面（脸 z 0.070–0.122），
  //   y 范围 0.371–0.502 罩住整张脸。旧版只处理同节点的发壳，所以没修到。改为世界坐标比较：发壳与头皮在脸 x/y 范围内、朝前的三角形都去掉。
  root.updateMatrixWorld(true);
  let face: THREE.Mesh | null = null; const shells: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const n = (m.material as THREE.Material)?.name;
    if (n === 'Iola_face') face = m; else if (n === 'Iola_hair' || n === 'Iola_scalpM') shells.push(m); });
  if (!face || !shells.length) return 0;
  const fb = new THREE.Box3().setFromObject(face as THREE.Mesh);
  const pad = (fb.max.x - fb.min.x) * 0.08; fb.min.x -= pad; fb.max.x += pad; fb.min.y -= pad; fb.max.y += pad;
  const zCut = fb.min.z - (fb.max.z - fb.min.z) * 0.6;   // 脸背面再往后一点：穿脸的头皮前缘全部去掉
  let n = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const sh of shells) {
    const gq = sh.geometry, P = gq.getAttribute('position'); if (!P) continue;
    let I = gq.getIndex(); if (!I) { const arr: number[] = []; for (let i = 0; i < P.count; i++) arr.push(i); gq.setIndex(arr); I = gq.getIndex()!; }
    const M = sh.matrixWorld, scalp = (sh.material as THREE.Material).name === 'Iola_scalpM';
    const keep: number[] = [];
    for (let t = 0; t < I.count; t += 3) {
      const i0 = I.getX(t), i1 = I.getX(t + 1), i2 = I.getX(t + 2);
      a.fromBufferAttribute(P, i0).applyMatrix4(M); b.fromBufferAttribute(P, i1).applyMatrix4(M); c.fromBufferAttribute(P, i2).applyMatrix4(M);
      const nz = e1.subVectors(b, a).cross(e2.subVectors(c, a)).normalize().z;
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      const inXY = cx > fb.min.x && cx < fb.max.x && cy > fb.min.y && cy < fb.max.y;
      if (inXY && (scalp ? (cz > zCut && Math.abs(nz) > 0.25) : cz > fb.min.z)) { n++; continue; }
      keep.push(i0, i1, i2);
    }
    if (keep.length < I.count) gq.setIndex(keep);
  }
  return n;
}

let src: { scene: THREE.Group; h: number } | null = null, job: Promise<void> | null = null;
function load(): Promise<void> {
  return job ??= (async () => {
    try {
      await MeshoptDecoder.ready;
      const L = withKtx2(new GLTFLoader()); L.setMeshoptDecoder(MeshoptDecoder);
      const g = await L.parseAsync(b64ToBuf(PACK_CREATURE_GLB[ID]), '');
      const sc = g.scene; sc.updateMatrixWorld(true);
      if (!offKey('iolaface')) clearFaceShell(sc);
      const b = new THREE.Box3().setFromObject(sc), h = Math.max(1e-3, b.max.y - b.min.y);
      sc.position.set(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2);   // 脚底落到原点
      sc.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
          if (!mt) continue;
          if ('emissive' in mt && mt.emissive) { mt.emissive.setHex(0xffc860); mt.emissiveIntensity = 0.06; }   // 回响灵体：一点暖金自发光，不发白
          if (mt.transparent) mt.depthWrite = false;
        } });
      const wrap = new THREE.Group(); wrap.add(sc); src = { scene: wrap, h };
    } catch (e) { console.warn('伊奥拉 3D 件解析失败，回退立片', e); }
  })();
}
if (typeof atob === 'function' && ID in PACK_CREATURE_GLB) void load();

/** 返回挂件组：模型到了就填进来（克隆共享几何与材质）。scaleTo(h) 把模型高度对到本地高度 h */
export function makeIola3d(): { group: THREE.Group; ready: () => boolean; fail: () => boolean; baseH: () => number } {
  const group = new THREE.Group(); group.name = 'iola3d';
  let done = false, bad = false;
  const fill = () => { if (done) return; if (!src) { bad = true; return; } group.add(src.scene.clone(true)); done = true; };
  if (src) fill(); else void load().then(fill);
  return { group, ready: () => done, fail: () => bad, baseH: () => src?.h ?? 1 };
}
