// 11-04 raidA 场景改造：首领平台内部（礼拜堂 / 冰湖 / 黑水 / 井底）—— 打破「暗色平圆盘」
// 不规则碎石板地面（实例化，顶面 ≤0.03 米：本体红圈 / 地面特效画在 +0.05，不被遮）、平台边缘断墙残柱、
// 按定调图的色光（加色径向光斑贴地，不加实时点光：多一盏点光全场每个像素都要多算一次）。
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { wetStone, quality } from './well_dock_hd';
import { wfbm, WELL_ROUTE } from './well_terrain';
import { SELUI } from './selui.gen';

let seed = 4242; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();

/** 一块不规则石板（6–8 边形，边缘抖动，厚 0.14，顶面在 y=0） */
function slabGeo() {
  const sh = new THREE.Shape(), n = 7;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = 0.8 + (Math.sin(i * 2.7) * 0.5 + 0.5) * 0.35; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.03, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -0.17, 0); g.computeVertexNormals(); return g;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!, gr = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

interface Zone { x: number; z: number; r: number; tint: number[]; glow: [number, number, number, number, number][]; walls?: boolean; slabs?: boolean; skip?: (lx: number, lz: number) => boolean }
/** 各平台：中心 / 半径 / 石板色（几档随机）/ 光斑（局部 x, z, 半径, 颜色, 强度） */
const ZONES: Zone[] = [
  { x: -90, z: 6, r: 15.5, tint: [0xa8bcb0, 0x92a8a0, 0xb8c2b0, 0x82948e], walls: true, slabs: true,          // 半淹礼拜堂：绿青 + 金
    glow: [[0, 0, 11, 0x2a8a78, 0.35], [6, 5, 4, 0xd8a050, 0.35], [-7, 3, 4, 0xd8a050, 0.3], [2, -8, 4, 0xd8a050, 0.3]] },
  { x: -26, z: -102, r: 15, tint: [], slabs: false,                                                         // 冰湖：冰青 + 钢蓝（只加冷光斑）
    glow: [[0, 0, 13, 0x4a8ab8, 0.28], [-6, -5, 5, 0x9ad8ff, 0.22]] },
  { x: 86, z: 66, r: 18, tint: [0x9a94a4, 0x8a8494, 0xa8a2b0, 0x7c7888], slabs: true,                      // 黑水两岸：去饱和紫 + 幽绿
    skip: (lx) => Math.abs(lx) < 4.2,   // 中间黑水河道不铺
    glow: [[-10, 0, 9, 0x7a64a8, 0.22], [10, 0, 9, 0x7a64a8, 0.22],   // 11-07 BUG#14 紫光斑 0.6→0.22（石板缝发紫）
           ...(/(?:[?&]off=[^&]*\bbwlevel\b)/.test(location.search) ? [[0, 0, 6, 0x40c088, 0.3]] as [number, number, number, number, number][] : []), [-10, -6, 3.5, 0x60e0a0, 0.35], [10, 6, 3.5, 0x60e0a0, 0.35]] },   // 11-18 河心绿光斑透过水面成一条绿缝 → 去掉（?off=bwlevel 回旧）
  { x: 30, z: -16, r: 21, tint: [0x8ea0b0, 0x7e90a2, 0x9cacba, 0x728496], walls: true, slabs: true,         // 井底沉钟腔：深海蓝 + 铜高光
    glow: [[0, 0, 14, 0x3a6aa0, 0.6], [0, 0, 5, 0xd08848, 0.45], [-8, 6, 3.5, 0xd08848, 0.35], [7, -7, 3.5, 0xd08848, 0.35], [8, 5, 3, 0x6ab0e0, 0.3]] },
];

export function wellZonesHd(api: WildBuildApi) {
  const q = quality(), hi = q === 'high' || q === 'ultra', mid = q !== 'low';
  const sg = slabGeo(), sm = wetStone().clone(); sm.color = new THREE.Color(0xffffff);
  // 1') 11-18 Rhett「这种地板很丑，全部换掉，用 GPT 生图选」→ 选 A（湿玄武岩碎石板，无缝 4.5 米一铺）+ 首领台中心 D（同心圆石地）：
  //     每个平台一张贴地网格（1 米格，顶面 +0.03，低于红圈 +0.05），黑水河道照旧留空；?off=wellfloor 回原来的散铺碎石板
  if (!/(?:[?&]off=[^&]*\bwellfloor\b)/.test(location.search) && SELUI.wl_floorA && wellFloors(api, mid)) { /* 新地板已铺 */ } else {
  // 1) 碎石板：按 1.55 米网格抖动铺，留缝（缝里露出底下暗色地面 = 勾缝）、少量缺块
  const mats: THREE.Matrix4[] = [], cols: number[] = [];
  for (const Z of ZONES) {
    if (!Z.slabs) continue;
    const st = 1.3;
    for (let gz = -Z.r; gz <= Z.r; gz += st) for (let gx = -Z.r; gx <= Z.r; gx += st) {
      const lx = gx + (rnd() - 0.5) * 0.7 + ((Math.round(gz / st) & 1) * st * 0.5), lz = gz + (rnd() - 0.5) * 0.7, d = Math.hypot(lx, lz);
      if (d > Z.r - 0.6 || (Z.skip && Z.skip(lx, lz))) continue;
      if (wfbm(lx * 0.35 + Z.x, lz * 0.35 + Z.z) < 0.3 && rnd() < 0.7) continue;   // 成片缺块（像被水冲掉 / 塌下去）
      const s = 0.62 + rnd() * 0.5;   // 大小不一，交错铺，不成蜂窝
      pv.set(Z.x + lx, api.groundY(Z.x + lx, Z.z + lz) + 0.032 - rnd() * 0.008, Z.z + lz);   // 顶面 +0.024…+0.032：盖住地形（缝里露出的是地面 = 勾缝），又低于红圈 +0.05
      qt.setFromEuler(e3.set((rnd() - 0.5) * 0.02, rnd() * 6.3, (rnd() - 0.5) * 0.02)); sv.set(s * (0.75 + rnd() * 0.5), 1, s * (0.75 + rnd() * 0.5));
      mats.push(m4.compose(pv, qt, sv).clone()); cols.push(Z.tint[Math.floor(rnd() * Z.tint.length)]);
    }
  }
  if (mats.length) {
    const im = new THREE.InstancedMesh(sg, sm, mats.length);
    mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, col.setHex(cols[i]).multiplyScalar(1.45)); /* 湿石贴图偏暗，乘 1.45 才读得出石板 */ });
    im.receiveShadow = true; im.frustumCulled = false; worldAdd(api, im);
  }
  }
  // 2) 平台边缘断墙 / 残柱（礼拜堂、井底）：高低错落，留出入口（朝走廊方向不放）
  const wm = wetStone().clone(); wm.color = new THREE.Color(0x8a9290);
  const walls: THREE.Matrix4[] = [], bg = new THREE.BoxGeometry(1, 1, 1);
  for (const Z of ZONES) {
    if (!Z.walls) continue;
    const n = hi ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + (rnd() - 0.5) * 0.12, wx = Z.x + Math.cos(a) * (Z.r + 0.9), wz = Z.z + Math.sin(a) * (Z.r + 0.9);
      if (gapNear(wx, wz)) continue;
      const tall = rnd() < 0.25, h = tall ? 2.6 + rnd() * 3.2 : 0.5 + rnd() * 1.3, w = tall ? 0.9 + rnd() * 0.4 : 1.6 + rnd() * 1.6;
      walls.push(m4.compose(pv.set(wx, api.groundY(wx, wz) + h / 2 - 0.25, wz), qt.setFromEuler(e3.set((rnd() - 0.5) * 0.12, -a + Math.PI / 2, (rnd() - 0.5) * (tall ? 0.1 : 0.2))), sv.set(w, h, tall ? w : 0.7 + rnd() * 0.3)).clone());
    }
  }
  if (walls.length) { const im = new THREE.InstancedMesh(bg, wm, walls.length); walls.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = hi; im.receiveShadow = true; im.frustumCulled = false; worldAdd(api, im); }
  // 3) 色光光斑（加色，贴地 +0.02，不写深度）：中档以上
  if (mid) {
    const gt = glowTex();
    for (const Z of ZONES) for (const [gx, gz, r, c, k] of Z.glow) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: c, map: gt, transparent: true, opacity: k, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; api.add(m, Z.x + gx, Z.z + gz);
    }
  }
}
/** 走廊进出口附近不放断墙：离主路节点连线方向 ±3.5 米内 */
const ROUTE_P = WELL_ROUTE.map(n => n.p);
function gapNear(x: number, z: number) {
  for (let i = 0; i < ROUTE_P.length - 1; i++) {
    const [ax, az] = ROUTE_P[i], [bx, bz] = ROUTE_P[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 4.5) return true;
  }
  return false;
}
function floorTex(url: string, rep: boolean) {
  const t = new THREE.TextureLoader().load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/** 平台地板：贴地网格（局部世界坐标），uv = 世界 xz / 铺距；skip 处三角不出（河道） */
function floorGrid(api: WildBuildApi, Z: Zone, R: number, lift: number, uvf: (x: number, z: number) => [number, number], clip: boolean) {
  const st = 1, n = Math.ceil(R / st) * 2 + 1, pos: number[] = [], uv: number[] = [], idx: number[] = [], id = new Int32Array(n * n).fill(-1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let lx = -R + i * st, lz = -R + j * st; const d = Math.hypot(lx, lz); if (d > R + st) continue;
    if (d > R) { lx *= R / d; lz *= R / d; }   // 外圈收到圆上
    if (clip && Z.skip && Z.skip(lx, lz)) continue;
    const x = Z.x + lx, z = Z.z + lz; id[j * n + i] = pos.length / 3; pos.push(x, api.groundY(x, z) + lift, z); uv.push(...uvf(lx, lz));
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = id[j * n + i], b = id[j * n + i + 1], c = id[(j + 1) * n + i], d = id[(j + 1) * n + i + 1];
    if (a >= 0 && b >= 0 && c >= 0) idx.push(a, c, b); if (b >= 0 && c >= 0 && d >= 0) idx.push(b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wellFloors(api: WildBuildApi, mid: boolean) {
  const A = floorTex(SELUI.wl_floorA, true), D = SELUI.wl_floorD ? floorTex(SELUI.wl_floorD, false) : null, T = 4.5;
  const fade = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!, gr = x.createRadialGradient(64, 64, 40, 64, 64, 63);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  let n = 0;
  for (const Z of ZONES) {
    if (!Z.slabs) continue;
    const tint = Z.tint.length ? new THREE.Color(Z.tint[0]).lerp(new THREE.Color(0xffffff), 0.35) : new THREE.Color(0xffffff);
    const m = new THREE.MeshStandardMaterial({ color: tint, map: A, bumpMap: mid ? A : null, bumpScale: 1.2, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
    const me = new THREE.Mesh(floorGrid(api, Z, Z.r - 0.3, 0.03, (lx, lz) => [(Z.x + lx) / T, (Z.z + lz) / T], true), m); me.receiveShadow = true; me.frustumCulled = false; worldAdd(api, me); n++;
    if (D && !Z.skip) {   // 首领台中心同心圆石地（河道平台不放）
      const rd = Math.min(Z.r * 0.6, 10);
      const dm = new THREE.MeshStandardMaterial({ color: tint, map: D, alphaMap: fade, transparent: true, depthWrite: false, bumpMap: mid ? D : null, bumpScale: 1.2, roughness: 0.6, metalness: 0, envMapIntensity: 0.5,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
      const dme = new THREE.Mesh(floorGrid(api, Z, rd, 0.034, (lx, lz) => [lx / rd * 0.5 + 0.5, lz / rd * 0.5 + 0.5], false), dm); dme.receiveShadow = true; dme.frustumCulled = false; dme.renderOrder = 1; worldAdd(api, dme);
    }
  }
  return n > 0;
}
function worldAdd(api: WildBuildApi, o: THREE.Object3D) { o.position.set(0, -api.groundY(0, 0), 0); api.add(o, 0, 0); }
