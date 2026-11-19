// ======================================================================
// DLC1 镜渊城 · 第五轮：B3 镜湖（概念图 scene_concept_B3_mirrorcity_cinematic）
//   石堤桥：低矮、湿润、弯曲（桥面 = 一排排不规则石块，两侧斜砌墙体扎进湖底，每隔一段一个扶壁桥墩）
//   青色矮灯：沿桥两侧交错（铸铁短柱 + 青灯笼 + 柔光晕 + 桥面光斑；灯光不加点光源，靠自发光 + 镜面倒影）
//   湖岸：碎石 + 浅滩过渡（岸边一圈半埋石块，水下更大更暗的乱石）
//   行走：seafloor.seaSolid（深水不可走、桥面可走）+ seaGround（桥面高度）
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { BRIDGE_PATH, BRIDGE_LEN, BRIDGE_HW, deckY, lakeSd, seaBase, h3, LAKE } from './seafloor';

type StoneSpec = { x: number; z: number; w: number; d: number; t: number; ry: number; sink: number; tilt: number; v: number };
export type LakeKit = {
  stones: (list: StoneSpec[], world: { x: number; z: number }) => THREE.InstancedMesh[];
  stoneRnd: (x: number, z: number, big?: number) => StoneSpec;
  env: THREE.Texture; dry: (x: number, z: number, r: number) => void; slate: THREE.Texture | null; lvl: string;
};
export const lakeStats = { blocks: 0, lamps: 0, piers: 0, rubble: 0 };

/** 沿桥中线取点：位置 + 切向 + 法向 */
function along(s: number) {
  const P = BRIDGE_PATH; let k = 0; while (k < P.length - 2 && P[k + 1].s < s) k++;
  const a = P[k], b = P[k + 1], t = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)));
  const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
  return { x: a.x + tx * t, z: a.z + tz * t, tx: tx / L, tz: tz / L, nx: -tz / L, nz: tx / L };
}
/** 圆角石块（挤出圆角矩形，单位尺寸 1×1×1，顶面 y = 1） */
function blockGeo(): THREE.BufferGeometry {
  const sh = new THREE.Shape(), r = 0.12, w = 0.5;
  sh.moveTo(-w + r, -w); sh.lineTo(w - r, -w); sh.quadraticCurveTo(w, -w, w, -w + r); sh.lineTo(w, w - r); sh.quadraticCurveTo(w, w, w - r, w);
  sh.lineTo(-w + r, w); sh.quadraticCurveTo(-w, w, -w, w - r); sh.lineTo(-w, -w + r); sh.quadraticCurveTo(-w, -w, -w + r, -w);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.86, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 2, curveSegments: 3 });
  g.rotateX(-Math.PI / 2); g.computeBoundingBox(); const y1 = g.boundingBox!.max.y; g.translate(0, 1 - y1, 0);
  // 顶面轻微起伏 + 侧面压暗
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = 0.42 + 0.58 * Math.max(0, Math.min(1, (n.getY(i) - 0.3) / 0.6)); c.set([v, v, v], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function wetStone(slate: THREE.Texture | null, env: THREE.Texture, rep: number, color = 0xb8bcb4): THREE.MeshStandardMaterial {
  let map: THREE.Texture | undefined;
  if (slate) { map = slate.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(rep, rep); map.needsUpdate = true; }
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(map ? 4.6 : 1), map, vertexColors: true, roughness: 0.36, metalness: 0.05, envMap: env, envMapIntensity: 0.8 });   // r2：×2.8 仍近乎全黑   // 板岩贴图很暗，提亮
  m.userData.outlineParameters = { visible: false }; return m;
}

// ---------------------------------------------------------------- 桥墙（沿中线两侧的带状网格，上沿压在桥面下，往下斜砌到湖底）
function wallGeo(side: number): THREE.BufferGeometry {
  const N = Math.ceil(BRIDGE_LEN / 0.5), V = 6, P: number[] = [], U: number[] = [], C: number[] = [], I: number[] = [];
  for (let k = 0; k <= N; k++) {
    const s = k / N * BRIDGE_LEN, a = along(s), top = deckY(s) - 0.06;
    for (let v = 0; v <= V; v++) {
      const f = v / V, y = top - f * (top + 2.7), bulge = 0.04 * Math.sin(s * 2.1 + v * 1.7) * (h3(k, v, side) - 0.3) + 0.03 * (h3(k >> 1, v, side + 5) - 0.5);
      const off = BRIDGE_HW - 0.02 + (top - y) * 0.16 + bulge;
      P.push(a.x + a.nx * off * side, y, a.z + a.nz * off * side); U.push(s * 0.5, y * 0.5);
      const under = y < 0.045 ? 0.62 : 1.0, moss = y < 0.12 && y > -0.25 ? 0.82 : 1.0;   // 水线附近一圈湿暗 / 青苔
      C.push(0.72 * under * moss, 0.78 * under, 0.74 * under * moss);
    }
  }
  for (let k = 0; k < N; k++) for (let v = 0; v < V; v++) { const a = k * (V + 1) + v, b = a + V + 1; if (side > 0) I.push(a, b, a + 1, b, b + 1, a + 1); else I.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I); g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- 青色矮灯
const haloMat = () => {
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    vertexShader: `attribute vec3 aPos; attribute float aS; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main(){ vec4 mvPosition = modelViewMatrix * vec4(aPos, 1.0); mvPosition.xy += position.xy * aS; gl_Position = projectionMatrix * mvPosition; vUv = uv;
  #include <fog_vertex>
}`,
    fragmentShader: `varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float a = exp(-d * d * 9.0) * 0.55 + pow(1.0 - d, 3.0) * 0.25;
  gl_FragColor = vec4(vec3(0.35, 0.95, 0.95) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  m.userData.outlineParameters = { visible: false }; return m;
};
/** 一组灯：短柱 + 灯笼 + 光晕 + 地面光斑（世界坐标列表） */
export function cyanLamps(list: { x: number; y: number; z: number; h: number }[], world: { x: number; z: number }): THREE.Object3D[] {
  const n = list.length, out: THREE.Object3D[] = [], o = new THREE.Object3D();
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c2224, roughness: 0.45, metalness: 0.8 }); iron.userData.outlineParameters = { visible: false };
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.07, 1, 6), iron, n);
  const cap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 0.12, 4), iron, n);
  const glassM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.6, 1.6), toneMapped: true }); glassM.userData.outlineParameters = { visible: false };
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.19, 0.13), glassM, n);
  const cage = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.025, 0.16), iron, n * 2);
  list.forEach((L, i) => {
    o.rotation.set(0, i * 0.7, 0);
    o.position.set(world.x + L.x, L.y + L.h / 2, world.z + L.z); o.scale.set(1, L.h, 1); o.updateMatrix(); post.setMatrixAt(i, o.matrix);
    o.scale.set(1, 1, 1); o.position.y = L.y + L.h + 0.11; o.updateMatrix(); glass.setMatrixAt(i, o.matrix);
    o.position.y = L.y + L.h + 0.0; o.updateMatrix(); cage.setMatrixAt(i * 2, o.matrix); o.position.y = L.y + L.h + 0.215; o.updateMatrix(); cage.setMatrixAt(i * 2 + 1, o.matrix);
    o.position.y = L.y + L.h + 0.28; o.rotation.y = Math.PI / 4 + i * 0.7; o.updateMatrix(); cap.setMatrixAt(i, o.matrix);
  });
  for (const m of [post, cap, glass, cage]) { m.frustumCulled = false; m.castShadow = m !== glass; out.push(m); }
  // 光晕（实例化正对镜头圆片）
  const base = new THREE.CircleGeometry(0.5, 16), g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv); g.instanceCount = n;
  const ap = new Float32Array(n * 3), as = new Float32Array(n);
  list.forEach((L, i) => { ap.set([world.x + L.x, L.y + L.h + 0.11, world.z + L.z], i * 3); as[i] = 0.9 + 0.3 * h3(i, 3, 9); });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(ap, 3)); g.setAttribute('aS', new THREE.InstancedBufferAttribute(as, 1));
  const halo = new THREE.Mesh(g, haloMat()); halo.frustumCulled = false; halo.renderOrder = 9; halo.name = 'sea_lamp_halo'; out.push(halo);
  // 地面光斑（加色圆片，贴在桥面 / 地面上）
  const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * 0.32; gl_FragColor = vec4(vec3(0.2, 0.75, 0.72) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  pm.userData.outlineParameters = { visible: false };
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
  const pool = new THREE.InstancedMesh(pg, pm, n);
  list.forEach((L, i) => { o.rotation.set(0, 0, 0); o.position.set(world.x + L.x, L.y + 0.02, world.z + L.z); o.scale.set(2.6, 1, 2.6); o.updateMatrix(); pool.setMatrixAt(i, o.matrix); });
  pool.frustumCulled = false; pool.renderOrder = 1; out.push(pool);
  return out;
}

// ---------------------------------------------------------------- 入口
export function lakeBuild(api: WildBuildApi, K: LakeKit) {
  const O = api.origin, hiQ = K.lvl === 'ultra' || K.lvl === 'high';
  const add = (o: THREE.Object3D) => { api.add(o, 0, 0); o.position.set(0, 0, 0); };
  const local = new THREE.Group(); local.position.set(O.x, 0, O.z);   // 局部坐标的网格挂在这里
  // 1. 桥面石块：每排 0.8–1.0 米，横向 2–3 块，宽度 / 高度 / 倾斜随机
  const bm = wetStone(K.slate, K.env, 0.55, 0xaab0aa), bg = blockGeo();
  const rows: { s: number; len: number }[] = []; for (let s = 0.2; s < BRIDGE_LEN - 0.3;) { const len = 0.75 + 0.3 * h3(rows.length, 1, 2); rows.push({ s: s + len / 2, len }); s += len + 0.03; }
  const blocks: THREE.Matrix4[] = []; const o = new THREE.Object3D(), cols: number[] = [];
  rows.forEach((r, k) => {
    const a = along(r.s), y0 = deckY(r.s), nB = h3(k, 2, 3) < 0.45 ? 2 : 3, W = BRIDGE_HW * 2 - 0.08;
    let cut = [0]; for (let b = 1; b < nB; b++) cut.push(b / nB + (h3(k, b, 4) - 0.5) * 0.18); cut.push(1); cut = cut.map(c => -W / 2 + c * W);
    for (let b = 0; b < nB; b++) {
      const w = cut[b + 1] - cut[b] - 0.035, c = (cut[b] + cut[b + 1]) / 2, th = 0.32;
      o.position.set(a.x + a.nx * c, y0 - th + (h3(k, b, 5) - 0.5) * 0.03, a.z + a.nz * c);
      o.rotation.set(0, Math.atan2(a.tx, a.tz) + (h3(k, b, 6) - 0.5) * 0.06, 0); o.rotateX((h3(k, b, 7) - 0.5) * 0.05); o.rotateZ((h3(k, b, 8) - 0.5) * 0.05);
      o.scale.set(w, th, r.len - 0.03); o.updateMatrix(); blocks.push(o.matrix.clone()); cols.push(0.75 + 0.4 * h3(k, b, 9));
    }
  });
  const deck = new THREE.InstancedMesh(bg, bm, blocks.length); const cc = new THREE.Color();
  blocks.forEach((m, i) => { deck.setMatrixAt(i, m); cc.setRGB(cols[i], cols[i] * 0.99, cols[i] * 0.97); deck.setColorAt(i, cc); });
  deck.receiveShadow = true; deck.castShadow = false; deck.frustumCulled = false; deck.name = 'sea_bridge_deck'; local.add(deck); lakeStats.blocks = blocks.length;
  // 2. 两侧墙体
  const wm = wetStone(K.slate, K.env, 1, 0x9aa29c); wm.side = THREE.DoubleSide;
  for (const side of [1, -1]) { const w = new THREE.Mesh(wallGeo(side), wm); w.receiveShadow = true; w.frustumCulled = false; w.name = 'sea_bridge_wall'; local.add(w); }
  // 3. 扶壁桥墩：每 6–7 米一对，扎进湖底
  const piers: THREE.Matrix4[] = [];
  for (let s = 4.5; s < BRIDGE_LEN - 3; s += 6 + 1.5 * h3(Math.floor(s), 1, 1)) {
    const a = along(s); if (lakeSd(a.x, a.z) > -1) continue;
    for (const side of [1, -1]) { const top = deckY(s) - 0.05, h = top + 2.8, off = BRIDGE_HW + 0.2;
      o.position.set(a.x + a.nx * off * side, top - h, a.z + a.nz * off * side); o.rotation.set(0, Math.atan2(a.tx, a.tz), 0); o.scale.set(0.7, h, 1.1); o.updateMatrix(); piers.push(o.matrix.clone());
      K.dry(a.x + a.nx * off * side, a.z + a.nz * off * side, 0.6); }
  }
  if (piers.length) { const pm = new THREE.InstancedMesh(bg, wm, piers.length); piers.forEach((m, i) => pm.setMatrixAt(i, m)); pm.frustumCulled = false; pm.castShadow = true; pm.receiveShadow = true; local.add(pm); lakeStats.piers = piers.length; }
  // 桥身当作干地（岸线泡沫贴着墙脚）
  for (let s = 0; s <= BRIDGE_LEN; s += 0.6) { const a = along(s); K.dry(a.x, a.z, BRIDGE_HW + 0.12); }
  add(local); local.position.set(O.x, 0, O.z);
  // 4. 桥边碎石（桥面边缘 + 墙脚）
  const curb: StoneSpec[] = [];
  for (let s = 1; s < BRIDGE_LEN - 1; s += 0.9 + h3(Math.floor(s * 3), 2, 2) * 1.6) {
    const a = along(s), side = h3(Math.floor(s * 7), 3, 3) < 0.5 ? 1 : -1, off = BRIDGE_HW + 0.15 + h3(Math.floor(s * 5), 4, 4) * 0.5;
    const st = K.stoneRnd(a.x + a.nx * off * side, a.z + a.nz * off * side, 0.7); st.sink = 0.3; curb.push(st);
  }
  // 5. 湖岸：一圈半埋碎石（岸上 / 浅滩）+ 水下更大更暗的乱石
  const shore: StoneSpec[] = [], deepR: StoneSpec[] = [];
  for (let i = 0; i < 900 && shore.length + deepR.length < (hiQ ? 260 : 120); i++) {
    const an = h3(i, 5, 5) * Math.PI * 2, rr = LAKE.R * (0.7 + h3(i, 6, 6) * 0.65), x = LAKE.x + Math.cos(an) * rr * 0.95, z = LAKE.z + Math.sin(an) * rr * 1.08, sd = lakeSd(x, z);
    if (Math.abs(x) > 83 || Math.abs(z) > 83) continue;
    if (sd > -1.2 && sd < 2.2) { const st = K.stoneRnd(x, z, 0.6 + h3(i, 7, 7) * 0.9); st.sink = 0.2 + 0.5 * h3(i, 8, 8); shore.push(st); }
    else if (sd < -1.2 && sd > -4.5 && h3(i, 9, 9) < 0.5) { const st = K.stoneRnd(x, z, 1.2 + h3(i, 7, 7) * 1.4); st.v *= 0.6; deepR.push(st); }
  }
  for (const L of [curb, shore, deepR]) for (const im of K.stones(L, O)) add(im);
  for (const st of shore) if (seaBase(st.x, st.z) + st.t * (1 - st.sink) > 0.05) K.dry(st.x, st.z, Math.min(st.w, st.d) * 0.5);
  lakeStats.rubble = curb.length + shore.length + deepR.length;
  // 6. 青色矮灯：沿桥两侧交错 + 两端桥头各一对
  const lamps: { x: number; y: number; z: number; h: number }[] = [];
  let side = 1;
  for (let s = 1.2; s < BRIDGE_LEN - 0.8; s += 5.2) { const a = along(s), off = BRIDGE_HW - 0.22; lamps.push({ x: a.x + a.nx * off * side, y: deckY(s), z: a.z + a.nz * off * side, h: 0.62 + 0.1 * h3(Math.floor(s), 1, 7) }); side = -side; }
  for (const s of [0.4, BRIDGE_LEN - 0.4]) { const a = along(s); for (const sd of [1, -1]) lamps.push({ x: a.x + a.nx * (BRIDGE_HW + 0.3) * sd, y: deckY(s), z: a.z + a.nz * (BRIDGE_HW + 0.3) * sd, h: 0.8 }); }
  for (const m of cyanLamps(lamps, O)) add(m);
  lakeStats.lamps = lamps.length;
}
