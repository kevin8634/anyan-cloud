// 11-15 沉钟海岸草木 v2（flora_hd，Rhett 规则：成片、不稀稀拉拉、树至少 3–4 种）：
//   草：后滩草甸（离水线 > 14 米、避开涨潮淹没的低洼地，按权重成片，边缘渐稀）高草 + 贴地短草，沙丘带枯黄草丛，湿沙上沿 / 潮池 / 低洼地外沿芦苇
//   花：草甸里成团的海石竹粉 / 海薰衣草淡紫 / 海滨蝇子草白 / 角罂粟黄；沙丘带零星白黄小花
//   树（四种，轮廓 / 高度 / 叶色都不同，成林团不均撒）：
//     盐风黑松（7–11 米，锥形分层、针叶深蓝绿、被海风压成旗形）· 海岸栎（6.5–9.5 米，圆阔冠、暗绿）
//     风剪柽柳（2.6–4.2 米，低矮伏倒、灰橄榄绿）· 漂白枯树（4.5–7 米，银灰树皮、零星褐叶）
//   + 林缘 / 草甸里的低矮灌丛。
//   避让表（coast_flora_layout.floraFree）：主路、营地、码头、钟井、出入口、潮池、巨钟 / 小钟、沉船、礁柱、玄武岩柱群、鲸骨、骨拱、石碑、石堤、陡坡。
//   低画质不放；中画质草花 ×0.45、树 ×0.5、灌丛 ×0.5。草不投影，树投影。?off=coastflora 整体关掉。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality } from '../../web/gfx';
import type { WildBuildApi } from '../../core/ContentPacks';
import { makeGrassHD, makeFlowersHD, makeTreeHD, barkTextures, floraShade, chunkFlora } from './flora_hd';
import { dynPlant, dynDepth } from './dyn_world';
import { COAST_HALF, eastCoast, westCoast } from './coast_layout';
import { meadowOk, duneOk, reedOk, coastTreeSpots, coastShrubSpots, rngC, type CoastTreeKind } from './coast_flora_layout';

export const coastFloraStats = { grass: 0, flowers: 0, trees: 0, shrubs: 0, chunks: 0, treeMeshes: 0, kinds: {} as Record<string, number> };

// ---------------------------------------------------------------- 盐风黑松（针叶，锥形分层；flag：迎风侧枝短）
let _needle: THREE.CanvasTexture | null = null;
function needleTexture(): THREE.CanvasTexture {
  if (_needle) return _needle;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!, R = rngC(77);
  g.clearRect(0, 0, S, S); g.lineCap = 'round';
  g.strokeStyle = '#3a2e20'; g.lineWidth = 4; g.beginPath(); g.moveTo(S * 0.5, S * 0.99); g.lineTo(S * 0.5, S * 0.08); g.stroke();
  // 主枝 + 两侧小枝，针叶密集成刷（填满卡面 ~60%，远看是成团的针叶而不是线）
  const twig = (x0: number, y0: number, ang: number, len: number, nN: number) => {
    const ex = x0 + Math.sin(ang) * len, ey = y0 - Math.cos(ang) * len;
    g.strokeStyle = '#3a3024'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
    for (let k = 0; k < nN; k++) {
      const t = R(), px = x0 + (ex - x0) * t, py = y0 + (ey - y0) * t, side = R() < 0.5 ? -1 : 1, L = S * (0.07 + R() * 0.06) * (1 - t * 0.4), a = ang + side * (0.45 + R() * 0.5);
      const l = 0.7 + R() * 0.6, tipL = R() < 0.25 ? 1.35 : 1; g.strokeStyle = `rgb(${38 * l * tipL | 0},${78 * l * tipL | 0},${60 * l | 0})`; g.lineWidth = 1.5 + R() * 1.6;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(a) * L, py - Math.cos(a) * L); g.stroke();
    }
  };
  twig(S * 0.5, S * 0.99, 0, S * 0.9, 260);
  for (let k = 0; k < 8; k++) { const t = 0.15 + k * 0.09, side = k % 2 ? 1 : -1; twig(S * 0.5, S * (0.99 - t * 0.9), side * (0.6 + R() * 0.3), S * (0.32 - t * 0.18), 70); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_needle = t);
}
function makePineHD(seed: number, H: number): THREE.Group {
  const R = rngC(seed), grp = new THREE.Group(); grp.name = 'tree_pine';
  const lean = 0.05 + R() * 0.06, bendX = (y: number) => lean * H * Math.pow(Math.max(0, y) / H, 1.7);   // y 可能 < 0（埋进地里的根），负数开 1.7 次方 = NaN   // 树干向 +x（背风）弯
  // 树干：锥形，逐层顶点按高度弯
  const trunk = new THREE.CylinderGeometry(0.03 * H / 8, 0.032 * H, H, 9, 10, true); trunk.translate(0, H / 2 - 0.15, 0);
  { const p = trunk.attributes.position as THREE.BufferAttribute, uv = trunk.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), fl = 1 + 0.35 * Math.max(0, 1 - y / (0.08 * H)) ** 2; p.setX(i, p.getX(i) * fl + bendX(y)); p.setZ(i, p.getZ(i) * fl); uv.setXY(i, uv.getX(i) * 2, y * 1.2); } trunk.computeVertexNormals(); }
  const limbs: THREE.BufferGeometry[] = [trunk];
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  const card = (o: THREE.Vector3, fwd: THREE.Vector3, s: number, axis: THREE.Vector3, shade: number) => {
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize()).normalize();
    const n = new THREE.Vector3(o.x - bendX(o.y), 0, o.z).normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.6, 0)).normalize();
    c.setHSL(0.4 + (R() - 0.5) * 0.05, 0.28 + R() * 0.1, 0.3 + R() * 0.07); const k = shade * 1.7, b0 = pos.length / 3;
    for (const [u, v] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      const p = o.clone().addScaledVector(side, u * s * 1.1).addScaledVector(fwd, v * s);
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uvs.push(u + 0.5, v); col.push(c.r * k, c.g * k, c.b * k);
    }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); void axis; void up;
  };
  const tiers = 9 + Math.floor(R() * 3), y0 = 0.3 * H;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = y0 + (H * 0.97 - y0) * f + (R() - 0.5) * 0.2, n = 5 + Math.floor(R() * 3), ph = R() * 6.28;
    for (let b = 0; b < n; b++) {
      const az = ph + b / n * 6.28 + (R() - 0.5) * 0.4, dx = Math.cos(az), dz = Math.sin(az);
      const flag = 0.55 + 0.45 * (0.5 + 0.5 * dx);   // 迎风侧（-x）枝短
      const L = (0.12 + 0.3 * Math.pow(1 - f, 0.85)) * H * flag * (0.8 + R() * 0.35);
      const o = new THREE.Vector3(bendX(y), y, 0), dir = new THREE.Vector3(dx, -0.12 - 0.15 * (1 - f) + (R() - 0.5) * 0.1, dz).normalize();
      const tip = o.clone().addScaledVector(dir, L);
      const br = new THREE.CylinderGeometry(0.012 * H / 8, 0.03 * H / 8 * (1 - f * 0.6), L, 4, 1, true); br.translate(0, L / 2, 0);
      br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); br.translate(o.x, o.y, o.z); limbs.push(br);
      const m = 5 + Math.floor(L * 2.2);
      for (let k = 0; k < m; k++) {
        const s = (1.0 + R() * 0.5) * H / 9 * (1.25 - f * 0.45), at = o.clone().lerp(tip, 0.25 + 0.75 * (k + R()) / m);
        at.y += (R() - 0.3) * 0.25;
        const fwd = dir.clone().add(new THREE.Vector3((R() - 0.5) * 0.9, (R() - 0.4) * 0.5, (R() - 0.5) * 0.9)).normalize();
        card(at.addScaledVector(fwd, -s * 0.3), fwd, s, dir, 0.6 + 0.4 * f + 0.15 * R());
      }
    }
  }
  for (let k = 0; k < 4; k++) card(new THREE.Vector3(bendX(H * 0.92), H * 0.9, 0), new THREE.Vector3((R() - 0.5) * 0.5, 1, (R() - 0.5) * 0.5).normalize(), 0.9 * H / 9, up, 1);
  limbs.forEach(g => { if (g.index) { const ng = g.toNonIndexed(); g.copy(ng); } for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); });
  const bark = barkTextures();
  const barkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(1.15, 0.98, 0.86), map: bark.map, normalMap: bark.nrm, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.92, envMapIntensity: 0.6 });
  const bm = new THREE.Mesh(mergeGeometries(limbs), barkMat); bm.name = 'tree_bark';
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); lg.setIndex(idx);
  const leafMat = floraShade(new THREE.MeshStandardMaterial({ map: needleTexture(), alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75, envMapIntensity: 0.6 }), { trans: 0.35, rootDark: 0, key: 'needle' });
  const lm = new THREE.Mesh(lg, leafMat); lm.name = 'tree_leaves';
  dynPlant(barkMat, { tree: true, amp: 0.05, h0: H, baseY: 0, merged: false, leaf: false });   // 11-17 单株网格：按原点整棵同相
  dynPlant(leafMat, { tree: true, amp: 0.05, h0: H, baseY: 0, merged: false, leaf: true });
  for (const m of [bm, lm]) { m.castShadow = m.receiveShadow = true; const d = dynDepth(m.material as THREE.Material); if (d) m.customDepthMaterial = d; m.userData.dynDone = true; }
  grp.add(bm, lm); grp.userData.leafCards = idx.length / 6;
  return grp;
}

// ---------------------------------------------------------------- 阔叶系：makeTreeHD + 叶色 / 树皮染色
function tint(g: THREE.Group, leaf: [number, number, number], bark?: [number, number, number]) {
  g.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    if (m.name === 'tree_leaves') { const ca = m.geometry.getAttribute('color') as THREE.BufferAttribute; for (let i = 0; i < ca.count; i++) ca.setXYZ(i, ca.getX(i) * leaf[0], ca.getY(i) * leaf[1], ca.getZ(i) * leaf[2]); }
    else if (bark && m.name === 'tree_bark') (m.material as THREE.MeshStandardMaterial).color.setRGB(...bark);
  });
  return g;
}
/** 每种树 3 个变体（固定高度 → 风摆着色器程序数有限），实例 clone 共用几何 / 材质，按 h / 基准高缩放 */
const BASE_H: Record<CoastTreeKind, number> = { pine: 9, oak: 8, tamarisk: 3.4, snag: 5.8 };
function makeKind(kind: CoastTreeKind, v: number): THREE.Group {
  const s = 500 + v * 37 + kind.length * 11, H = BASE_H[kind];
  if (kind === 'pine') return makePineHD(s, H);
  if (kind === 'oak') return tint(makeTreeHD({ seed: s, height: H, spread: 1.05 + v * 0.08, lean: 0.05, leafDensity: 1.25, leafSize: 0.85 }), [0.72, 0.82, 0.7]);
  if (kind === 'tamarisk') return tint(makeTreeHD({ seed: s, height: H, spread: 1.7, lean: 0.38, leafDensity: 1.5, leafSize: 0.55 }), [1.45, 1.08, 1.2]);   // 灰橄榄 / 鼠尾草绿
  return tint(makeTreeHD({ seed: s, height: H, spread: 1.25, lean: 0.12, leafDensity: 0.14, autumn: 1 }), [0.95, 0.75, 0.55], [1.55, 1.6, 1.65]);
}

export function coastFlora(api: WildBuildApi) {
  if (curQuality === 'low' || (typeof location !== 'undefined' && /[?&]off=[^&]*coastflora/.test(location.search))) return;
  const mid = curQuality === "medium", k = mid ? 0.4 : 1, root = new THREE.Group(); root.name = 'coast_flora';
  const G = (x: number, z: number) => api.groundY(x, z), A: [number, number, number, number] = [-COAST_HALF, -COAST_HALF, COAST_HALF, COAST_HALF];
  const mOk = (x: number, z: number) => meadowOk(x, z, G), dOk = (x: number, z: number) => duneOk(x, z, G), rOk = (x: number, z: number) => reedOk(x, z, G);
  const grass = [
    makeGrassHD({ count: Math.round(190000 * k), area: A, ground: G, accept: mOk, seed: 61, hMin: 0.3, hMax: 0.9, dry: 0.55 }),            // 后滩草甸高草
    makeGrassHD({ count: Math.round(90000 * k), area: A, ground: G, accept: mOk, seed: 67, hMin: 0.06, hMax: 0.2, dry: 0.45, cover: true }), // 贴地短草（铺满、不露斑点）
    makeGrassHD({ count: Math.round(14000 * k), area: A, ground: G, accept: dOk, seed: 63, hMin: 0.35, hMax: 0.8, dry: 0.95 }),            // 沙丘枯黄草丛
    makeGrassHD({ count: Math.round(16000 * k), area: A, ground: G, accept: rOk, seed: 71, hMin: 0.9, hMax: 1.7, dry: 0.45 }),             // 芦苇
  ];
  const flowers = [
    makeFlowersHD({ count: Math.round(7000 * k), area: A, ground: G, accept: mOk, seed: 43, colors: [0xd98aa8, 0xe8a0b8, 0xa898d8, 0xf0ece0, 0xe8c85a] }),
    makeFlowersHD({ count: Math.round(2600 * k), area: A, ground: G, accept: dOk, seed: 47, colors: [0xf0ece0, 0xe8d070] }),
  ];
  const cnt = (g: THREE.Group) => g.children.reduce((s, c) => s + ((c as THREE.InstancedMesh).isInstancedMesh ? (c as THREE.InstancedMesh).count : 0), 0);
  coastFloraStats.grass = grass.reduce((s, g) => s + cnt(g), 0); coastFloraStats.flowers = flowers.reduce((s, g) => s + cnt(g), 0);
  // 11-16 卡顿修复：草 / 花按 28 米分块（视锥剔除）+ 远处不画（高 70 米 / 中 48 米，已在海雾里）
  const fl = new THREE.Group(); fl.name = 'coast_grass'; for (const g of [...grass, ...flowers]) fl.add(g);
  coastFloraStats.chunks = chunkFlora(fl, 28, mid ? 48 : 70).chunks; root.add(fl);
  // 树：林团
  const cache = new Map<string, THREE.Group>(); const kinds: Record<string, number> = {};
  // 11-16 卡顿修复：同一变体的树 / 灌丛合成 InstancedMesh（原来每棵 clone 2 个网格 × 约 150 棵 × 主画 + 阴影两遍 ≈ 600 次 draw call）
  const inst = new Map<string, { src: THREE.Group; m: THREE.Matrix4[] }>();
  const place = (key: string, src: THREE.Group, m: THREE.Matrix4) => { let e = inst.get(key); if (!e) inst.set(key, e = { src, m: [] }); e.m.push(m.clone()); };
  for (const t of coastTreeSpots(mid ? 0.5 : 1, G)) {
    const key = t.kind + t.v; let src = cache.get(key); if (!src) { src = makeKind(t.kind, t.v); cache.set(key, src); }
    const g = new THREE.Object3D(), sc = t.h / BASE_H[t.kind];
    const leeward = t.x - eastCoast(t.z) > westCoast(t.z) - t.x ? Math.PI : 0;   // 海风从近的那侧海吹来：靠东岸 → 树冠倒向 -x，靠西岸 → +x
    g.scale.setScalar(sc); g.rotation.y = (t.kind === 'pine' || t.kind === 'tamarisk') ? leeward + (t.ry - 3.14) * 0.12 : t.ry;
    g.position.set(t.x, G(t.x, t.z) - 0.1 * sc, t.z); g.updateMatrix(); place(key, src, g.matrix);
    api.block?.(t.x, t.z, t.kind === 'tamarisk' ? 0.4 : 0.55);
    kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
  }
  coastFloraStats.trees = Object.values(kinds).reduce((a, b) => a + b, 0); coastFloraStats.kinds = kinds;
  // 灌丛：4 个变体
  const shrubSrc = [0, 1, 2, 3].map(v => tint(makeTreeHD({ seed: 800 + v * 13, height: 1.6, spread: 1.9, lean: 0.1, leafDensity: 1.6, leafSize: 0.7 }), v % 2 ? [0.8, 0.85, 0.7] : [0.95, 0.92, 0.75]));
  const shrubs = coastShrubSpots(Math.round(70 * (mid ? 0.5 : 1)), G);
  shrubs.forEach(([x, z, r], i) => { const g = new THREE.Object3D(), sc = 0.7 + r * 0.7; g.scale.set(sc * 1.2, sc, sc * 1.2); g.rotation.y = r * 6.28; g.position.set(x, G(x, z) - 0.1, z); g.updateMatrix(); place('shrub' + (i % 4), shrubSrc[i % 4], g.matrix); });
  let drawn = 0;
  for (const [key, { src, m }] of inst) {
    src.updateMatrixWorld(true);
    src.traverse(o => { const me = o as THREE.Mesh; if (!me.isMesh) return;
      const im = new THREE.InstancedMesh(me.geometry, me.material, m.length); im.name = me.name + '_' + key;
      const mm = new THREE.Matrix4(); m.forEach((M, i) => im.setMatrixAt(i, mm.multiplyMatrices(M, me.matrixWorld)));
      im.castShadow = me.castShadow; im.receiveShadow = me.receiveShadow; im.customDepthMaterial = me.customDepthMaterial; im.userData.dynDone = true;
      im.computeBoundingSphere(); root.add(im); drawn++; });
  }
  coastFloraStats.treeMeshes = drawn;
  coastFloraStats.shrubs = shrubs.length;
  root.position.y = -api.groundY(0, 0);   // api.add 会加上 (0,0) 的地面高度；子物体已按世界高度摆好
  api.add(root, 0, 0);
  console.log('coast flora ' + JSON.stringify(coastFloraStats));
}
