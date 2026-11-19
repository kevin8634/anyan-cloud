// 11-07 钟井 v2（#15 大改，Rhett 18:46 批）：主路表面 + 崖壁 + 砖砌井壁 + 断桥链栏 + 壁灯
// 主路是本体高度图（well_terrain.ts WELL_ROUTE），这里只做贴在上面的「皮」：
//   路面：按路段类型铺一条贴地带（栈道石板 / 涨潮湿木栈板 / 冰窟冰面 / 断桥锈铁板 / 暗河黑泥岸），顶面 +0.02（低于本体红圈 +0.05）
//   崖壁：沿可走边缘往下垂 26 米的竖直岩壁（深渊岩），把高度图的缓坡盖成陡崖
//   井壁：一整圈砖砌井筒（半径 WELL_R + 2，−78 … +40 米，噪声起伏），代替原来只有岩块的井壁
//   断桥：每 6 米一根铁柱 + 两侧垂链；栈道：每 26 米一盏壁灯（只发光不加点光）
// 贴图：assets_aholo/tex_tile/well*（GPT 2048，tiletex 三向投影，不用 UV）；低画质 / base 包没有 → 纯色回退。全部合批（每种材质 1 个 draw call）。
import { WELL_TREAD_TEX } from './well_tread_tex';
import * as THREE from 'three';
import { wetWall } from './well_wet_hd';
import { wellWallDress } from './well_wall_hd';   // 11-15 井壁点缀
import { stoneWallMat, wellRubbleSites } from './well_stone_hd';   // 11-15 井壁 v2
const offWell = (n: string) => typeof location !== 'undefined' && new URLSearchParams(location.search).get('off')?.split(',').includes(n);
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WildBuildApi } from '../../core/ContentPacks';
import { tileMat, tileLoadKinds, type TileKind } from '../../web/tiletex';
import { quality } from './well_dock_hd';
import { WELL_ROUTE, WELL_R, WELL_ABYSS, wellSolid, wfbm } from './well_terrain';
import { sceneOr } from './lux_dlc';
import { TILE_TEX } from '../../web/assets.gen';
import { bossGlbEnsure, raidLazyHas, raidLazyGet } from './boss_glb';
import { campLampPost } from './camp_lux';
import { SELUI } from './selui.gen';
import { poolLight, lightPoolOn } from './well_lightpool';   // 11-18 点光源池
import { instanceClones } from './well_batch';   // 11-18 路灯实例化   // 11-18 主路地板 A   // 11-18 路灯用营地灯柱

/** 11-18 钟井路灯「幽兰」：冷兰紫（偏蓝的淡紫，压在钟井青灰岩色上不显绿也不显暖） */
// 11-18 21:07 Rhett「光的颜色换成幽影绿，能在夜间照亮地板」：幽影绿（偏青的冷绿，比钟井青灰岩色亮、饱和），灯下加地面光池；?off=welllampgreen 回幽兰、?off=welllamppool 不加光池
const LAMP_GREEN = (() => { try { return !/(?:[?&]off=[^&]*\bwelllampgreen\b)/.test(location.search); } catch { return true; } })();
const LAMP_POOL = (() => { try { return !/(?:[?&]off=[^&]*\bwelllamppool\b)/.test(location.search); } catch { return true; } })();
export const WELL_LAMP = LAMP_GREEN ? 0x52f0a2 : 0x8f86ff;
let poolTex: THREE.CanvasTexture | null = null;
/** 灯下地面光池：贴地的加色径向渐变圆（不是实时光，任何画质都放），中心在灯头正下方；把灯下 3 米内的地板照亮 */
function lampPool(headZ: number): THREE.Mesh {
  if (!poolTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!; const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(0.7, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); poolTex = new THREE.CanvasTexture(c); }
  const m = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), new THREE.MeshBasicMaterial({ map: poolTex, color: WELL_LAMP, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.06, headZ); m.renderOrder = 3; m.userData.wellLampPool = true;
  (m.material as THREE.Material).userData.outlineParameters = { visible: false };
  return m;
}
export const wallStats = { holes: 0, bands: 0, kinds: '', dress: {} as Record<string, number> };
export const WELL_TILES: TileKind[] = ['wellbrick', 'wellflag', 'wellcliff', 'wellarch', 'welliron', 'wellwood', 'wellice', 'wellbank', 'wellblocks', 'wellbricks', 'wellraw', 'wellmoss', 'wellhole'];
let tilesP: Promise<void> | null = null;
/** 到入口区域就先解码钟井贴图（只解码；上传在进井的加载画面 prewarmFlush 里做） */
// 11-08 比赛版单文件超过浏览器字符串上限（512 MB），井壁 5 种新贴图（wellblocks…wellhole）和 wa* 一样放进长副本按需包 raid/*.js：先等按需包，再填回 TILE_TEX
const LAZY_WALL = ['wellblocks', 'wellbricks', 'wellraw', 'wellmoss', 'wellhole'].flatMap(k => ['_basecolor', '_normal', '_roughness'].map(s => k + s));
export const wellTilesEnsure = () => (tilesP ??= (async () => {
  if (LAZY_WALL.some(k => !TILE_TEX[k] && raidLazyHas('tex:' + k))) { await bossGlbEnsure(); for (const k of LAZY_WALL) if (!TILE_TEX[k]) { const u = raidLazyGet('tex:' + k); if (u) (TILE_TEX as Record<string, string>)[k] = u; } }
  await tileLoadKinds(WELL_TILES);
})());

const FALL: Record<string, number> = { wellflag: 0x3a4044, wellwood: 0x3a2c20, wellice: 0x6a8ca0, welliron: 0x4a3426, wellbank: 0x14161a, wellcliff: 0x1c2226, wellbrick: 0x262c28, wellblocks: 0x2a302e, wellbricks: 0x2c2a26, wellraw: 0x1c2022, wellmoss: 0x22302a, wellhole: 0x08090a };
const mat = (k: TileKind, o: Parameters<typeof tileMat>[1] = {}) => (quality() !== 'low' && tileMat(k, { roughness: 1, ...o }))
  || new THREE.MeshStandardMaterial({ color: FALL[k] ?? 0x30363a, roughness: 0.9, metalness: o.metalness ?? 0 });
// 11-18 Rhett「红色楼梯板重新设计」（23:08 批准 gpt-image-2 出图）：升降段踏板由红褐锈铁块改为发黑锻铁防滑花纹板（顶 / 底）+ 铆钉钟纹前沿饰条（四个侧面，凹槽一点幽影绿），
//   贴图 well_tread_tex.ts；三种材质全场共用一份（踏板仍是一个 InstancedMesh、一次绘制）；?off=welltread 回旧
const TREAD_NEW = !/(?:[?&]off=[^&]*\bwelltread\b)/.test(location.search);
let treadM: THREE.Material[] | null = null;
function treadMats(): THREE.Material[] | null {
  if (treadM) return treadM;
  try {
    const ld = new THREE.TextureLoader(), tx = (k: 'plate' | 'plateN' | 'trim', srgb: boolean, rx: number, ry: number) => { const t = ld.load(WELL_TREAD_TEX[k]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const plate = new THREE.MeshStandardMaterial({ map: tx('plate', true, 5, 1), normalMap: tx('plateN', false, 5, 1), normalScale: new THREE.Vector2(0.9, 0.9), metalness: 0.7, roughness: 0.62 });
    const trim = new THREE.MeshStandardMaterial({ map: tx('trim', true, 4, 1), metalness: 0.65, roughness: 0.7, emissive: new THREE.Color(0x1f5a4a), emissiveIntensity: 0.0 });
    const side = new THREE.MeshStandardMaterial({ map: tx('trim', true, 1, 1), metalness: 0.65, roughness: 0.75 });
    treadM = [side, side, plate, plate, trim, trim];   // BoxGeometry 面序：+x −x +y −y +z −z（z = 沿路方向，前后立面放饰条）
    return treadM;
  } catch { return null; }
}
function k_roadA(): THREE.Material | null {
  if (offWell('wellroadA') || quality() === 'low' || !SELUI.wl_floorA) return null;
  const t = new THREE.TextureLoader().load(SELUI.wl_floorA); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ color: 0xc4c8cc, map: t, bumpMap: t, bumpScale: 1.2, roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
}
/** 路段类型 → 路面贴图 */
const SURF: Record<string, TileKind> = { start: 'wellflag', path: 'wellflag', boss: 'wellflag', tide: 'wellwood', cave: 'wellice', lift: 'welliron', bridge: 'welliron', boat: 'wellbank' };
const HW: Record<string, number> = { path: 5, boss: 6, tide: 5.5, cave: 5.5, lift: 4, bridge: 3.6, boat: 6.5, start: 5 };
/** 首领台 / 码头上已有专门的地面（碎石板 / 甲板 / 冰面），路面带在这些圈内不铺 */
const SKIP: [number, number, number][] = [[0, 96, 23], [-90, 6, 15], [-26, -102, 15], [86, 66, 17], [30, -16, 21]];
export const skip = (x: number, z: number) => SKIP.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r);

/** 从 (x, z) 沿 (nx, nz) 往外找到可走边缘（最多 9 米） */
function edgeOut(x: number, z: number, nx: number, nz: number): number {
  for (let d = 0; d < 9; d += 0.25) if (wellSolid(x + nx * d, z + nz * d)) return Math.max(0, d - 0.15);
  return -1;
}

export const wellLampStats = { road: 0, want: 0, fix: 0 };
const BRIDGE_LAMP = (() => { try { return !/(?:[?&]off=[^&]*\bwellbridgelamp\b)/.test(location.search); } catch { return true; } })();
const lampLight = () => { const p = new THREE.PointLight(WELL_LAMP, 6, 16, 1.4); p.position.y = 2.6; return p; };   // 幽兰实光：照亮灯下路面 / 石阶
let lampGeo: { post: THREE.BufferGeometry; arm: THREE.BufferGeometry; cage: THREE.BufferGeometry; core: THREE.BufferGeometry; halo: THREE.Texture } | null = null;
/** 程序化灯柱：锈铁杆 + 横臂 + 灯笼框 + 幽兰发光芯 + 光晕片（不依赖 GLB，任何时候都能放） */
function procLamp(light: boolean): THREE.Group {
  if (!lampGeo) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    lampGeo = { post: new THREE.CylinderGeometry(0.07, 0.11, 2.8, 6), arm: new THREE.BoxGeometry(0.06, 0.06, 0.6), cage: new THREE.CylinderGeometry(0.2, 0.15, 0.42, 6, 1, true), core: new THREE.SphereGeometry(0.12, 8, 6), halo: new THREE.CanvasTexture(c) }; }
  const g = new THREE.Group(); g.userData.procLamp = true;
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.6, roughness: 0.6 });
  const post = new THREE.Mesh(lampGeo.post, iron); post.position.y = 1.4; g.add(post);
  const arm = new THREE.Mesh(lampGeo.arm, iron); arm.position.set(0, 2.72, 0.28); g.add(arm);
  const cage = new THREE.Mesh(lampGeo.cage, new THREE.MeshStandardMaterial({ color: 0x3a3028, metalness: 0.7, roughness: 0.5, wireframe: true })); cage.position.set(0, 2.42, 0.55); g.add(cage);
  const core = new THREE.Mesh(lampGeo.core, new THREE.MeshBasicMaterial({ color: WELL_LAMP })); core.position.set(0, 2.42, 0.55); g.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampGeo.halo, color: WELL_LAMP, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(1.8); halo.position.set(0, 2.42, 0.55); g.add(halo);
  if (light) { const p = lampLight(); p.position.set(0, 2.42, 0.55); if (!poolLight(g, p)) g.add(p); }
  return g;
}
export function wellRouteHd(api: WildBuildApi) {
  const q = quality(), hi = q === 'high' || q === 'ultra', mid = q !== 'low';
  const Y = (x: number, z: number) => api.groundY(x, z);
  const strips = new Map<TileKind, THREE.BufferGeometry[]>(), cliffs: THREE.BufferGeometry[] = [];
  const posts: THREE.Matrix4[] = [], chains: THREE.Matrix4[] = [], lamps: [number, number, number][] = [], treads: THREE.Matrix4[] = [], cages: [number, number, number, number][] = [], river: number[] = [], riverI: number[] = [], riverBreak: number[] = [];
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lampAcc = 0, postAcc = 0, roadAcc = 0, roadSide = 1;
  // 11-18 Rhett「行进路线两旁要有不是特别密集的路灯，模型用营地的，光亮用幽兰」：营地船木灯柱，左右交替每 15 米一盏（单侧 30 米），
  //   石板路 / 潮汐栈道 / 冰窟 / 暗河岸铺，断桥（已有铁柱垂链）、升降台阶、首领台不铺；?off=welllamp 回原来的壁灯
  const roadLamps: [number, number, number, number][] = [], roadOn = !offWell('welllamp');
  for (let i = 0; i < WELL_ROUTE.length - 1; i++) {
    const A = WELL_ROUTE[i].p, B = WELL_ROUTE[i + 1].p, k = WELL_ROUTE[i + 1].k, tk = SURF[k] ?? 'wellflag';
    const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const w = Math.max(1.6, (HW[k] ?? 5) - 1.4), n = Math.max(2, Math.ceil(L / 1.5)), C = 6;
    // 1) 路面带（段头尾各延 1.2 米盖住拐角）
    const pos: number[] = [], idx: number[] = [], uvs: number[] = [];
    let rows = 0;
    for (let s = 0; s <= n; s++) {
      const t = -1.2 / L + (1 + 2.4 / L) * s / n, cx = A[0] + dx * t, cz = A[1] + dz * t;
      if (skip(cx, cz)) { rows = 0; continue; }
      for (let c = 0; c <= C; c++) { const o = (c / C - 0.5) * 2 * w, x = cx + nx * o, z = cz + nz * o; pos.push(x, Y(x, z) + 0.018 + (i % 3) * 0.002, z); uvs.push(x / 4.5, z / 4.5); }
      if (rows > 0) { const b = pos.length / 3 - (C + 1) * 2; for (let c = 0; c < C; c++) { const a0 = b + c, a1 = a0 + 1, b0 = a0 + C + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); } }
      rows++;
    }
    if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals(); (strips.get(tk) ?? strips.set(tk, []).get(tk)!).push(g); }
    // 2) 崖壁：两侧沿可走边缘垂下（冰窟段也要；首领台内不做）
    if (k !== 'lift') for (const side of [-1, 1]) {
      const cp: number[] = [], ci: number[] = []; let prev = false;
      for (let s = 0; s <= n; s++) {
        const t = s / n, cx = A[0] + dx * t, cz = A[1] + dz * t, ex = nx * side, ez = nz * side;
        const d = skip(cx, cz) ? -1 : edgeOut(cx, cz, ex, ez);
        if (d < 0) { prev = false; continue; }
        const x = cx + ex * (d + 0.2), z = cz + ez * (d + 0.2), y = Y(cx + ex * d, cz + ez * d) + 0.25, j = (wfbm(x * 0.3, z * 0.3) - 0.5) * 1.2;
        cp.push(x + ex * j * 0.3, y, z + ez * j * 0.3, x + ex * (1.6 + j), y - 26, z + ez * (1.6 + j));
        if (prev) { const b = cp.length / 3 - 4; side > 0 ? ci.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) : ci.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        prev = true;
      }
      if (ci.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); g.setIndex(ci); g.computeVertexNormals(); cliffs.push(g); }
    }
    // 2a) 暗河：渡船段外侧（靠井壁那边）一条 9 米宽的黑水，水面在岸下 0.7 米
    if (k === 'boat') { const side = (A[0] + nx) ** 2 + (A[1] + nz) ** 2 > A[0] ** 2 + A[1] ** 2 ? 1 : -1; let prev = false;
      for (let s = 0; s <= n; s++) { const t = s / n, cx = A[0] + dx * t, cz = A[1] + dz * t, hh = WELL_ROUTE[i].h + (WELL_ROUTE[i + 1].h - WELL_ROUTE[i].h) * t - 0.7, d = Math.max(0, edgeOut(cx, cz, nx * side, nz * side)) - 0.6;
        river.push(cx + nx * side * d, hh, cz + nz * side * d, cx + nx * side * (d + 10), hh, cz + nz * side * (d + 10));
        if (prev) { const b = river.length / 3 - 4; side > 0 ? riverI.push(b, b + 1, b + 2, b + 1, b + 3, b + 2) : riverI.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); } prev = true; }
      riverBreak.push(river.length / 3); }
    // 2b) 钟笼段（陡）：锈铁台阶 + 旁边吊着钟笼（高度图不能浮空载人，原 A6 吊笼浮空问题不再出现；走台阶下去）
    if (k === 'lift') { for (let s = 0.3; s < L; s += 0.6) { const cx = A[0] + tx * s, cz = A[1] + tz * s; treads.push(m4.compose(pv.set(cx, Y(cx, cz) - 0.06, cz), qt.setFromAxisAngle(up, Math.atan2(tx, tz)), sv.set(w * 2 + 0.4, 0.2, 0.62)).clone()); }
      cages.push([A[0] + nx * (w + 2.6), A[1] + nz * (w + 2.6), Y(A[0], A[1]) + 1.2, Math.atan2(tx, tz)]); }
    // 3) 断桥铁柱 + 垂链；栈道壁灯（靠外侧）
    for (let s = 0; s < L; s += 1) {
      const cx = A[0] + tx * s, cz = A[1] + tz * s;
      if (k === 'bridge' && (postAcc += 1) >= 6) { postAcc = 0;
        for (const side of [-1, 1]) { const x = cx + nx * side * (w + 0.6), z = cz + nz * side * (w + 0.6), y = Y(cx, cz); posts.push(m4.compose(pv.set(x, y + 0.75, z), qt.identity(), sv.set(1, 1, 1)).clone());
          // 链：从这根柱顶到前一根柱顶（6 米），中间下垂 0.5 米 → 两节斜段
          for (const [a, b] of [[0, 0.5], [0.5, 1]] as const) { const x0 = x - tx * 6 * (1 - a), z0 = z - tz * 6 * (1 - a), x1 = x - tx * 6 * (1 - b), z1 = z - tz * 6 * (1 - b), y0 = y + 1.4 - (a === 0 ? 0 : 0.5), y1 = y + 1.4 - (b === 1 ? 0 : 0.5);
            const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = d.length(); qt.setFromUnitVectors(up, d.normalize()); chains.push(m4.compose(pv.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), qt, sv.set(1, len, 1)).clone()); }
        }
      }
      // 11-18 20:35 Rhett「钟井沿途一个路灯都没，主干道上加路灯」：探针 47/47 盏都建了，但断桥 / 升降台阶段（井中下半程主干道）按旧规则不铺 → 那一大段一盏没有。
      //   断桥 / 升降段也铺：断桥窄，灯贴可走边缘内 0.3 米立，不要求离中线 0.7w；?off=wellbridgelamp 回旧
      const BR = (k === 'bridge' || k === 'lift') && BRIDGE_LAMP;
      if (roadOn && (k === 'path' || k === 'tide' || k === 'boat' || k === 'cave' || k === 'start' || BR) && (roadAcc += 1) >= (BR ? 10 : 15)) { roadAcc = 0; roadSide = -roadSide;
        for (const sd of [roadSide, -roadSide]) { const e = edgeOut(cx, cz, nx * sd, nz * sd), o = BR ? (e < 0 ? w + 0.3 : Math.max(0.6, Math.min(w + 0.3, e - 0.3))) : e < 0 ? w + 0.9 : Math.min(w + 0.9, e - 0.5); if (!BR && o < w * 0.7) continue;   // 贴着崖边 / 井壁内侧立，不探出去
          const x = cx + nx * sd * o, z = cz + nz * sd * o; if (!wellSolid(x, z) && !skip(x, z)) { roadLamps.push([x, z, Math.atan2(-nx * sd, -nz * sd), Y(cx, cz)]); break; } } }
      if (!roadOn && (k === 'path' || k === 'tide' || k === 'boat') && (lampAcc += 1) >= 26) { lampAcc = 0; const side = (i % 2) ? 1 : -1, x = cx + nx * side * (w + 0.4), z = cz + nz * side * (w + 0.4); if (!wellSolid(x, z) && !skip(x, z)) lamps.push([x, z, Math.atan2(-nx * side, -nz * side)]); }
    }
  }
  // 2c) 首领台 / 码头外沿崖壁：从台心径向找边缘（台内路面带不铺，但边上要有崖）
  for (const [px, pz, r] of SKIP) {
    const cp: number[] = [], ci: number[] = [], M = 144; let first = -1, prev = false;
    for (let a = 0; a <= M; a++) { const t = (a % M) / M * Math.PI * 2, ex = Math.cos(t), ez = Math.sin(t), r0 = Math.max(0, r - 10), d = edgeOut(px + ex * r0, pz + ez * r0, ex, ez);
      if (d < 0) { prev = false; continue; }
      const x = px + ex * (r0 + d + 0.2), z = pz + ez * (r0 + d + 0.2), y = Y(px + ex * (r0 + d), pz + ez * (r0 + d)) + 0.25, j = (wfbm(x * 0.3, z * 0.3) - 0.5) * 1.2;
      cp.push(x, y, z, x + ex * (1.6 + j), y - 26, z + ez * (1.6 + j)); if (first < 0) first = 0;
      if (prev) { const b = cp.length / 3 - 4; ci.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } prev = true; }
    if (ci.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); g.setIndex(ci); g.computeVertexNormals(); cliffs.push(g); }
  }
  // 2d) 寒潮冰窟：冰窟段上方盖一道拱顶（离地 8.5–10.5 米，镜头够用），隔 24 米开一个天窗透光；顶下挂冰棱
  const vault: THREE.BufferGeometry[] = [], icicles: THREE.Matrix4[] = [];
  {
    const cave = WELL_ROUTE.map((r, i) => i > 0 && r.k === 'cave' ? i : -1).filter(i => i > 0); let acc = 0;
    for (const i of cave) {
      const A = WELL_ROUTE[i - 1].p, B = WELL_ROUTE[i].p, dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L, n = Math.ceil(L / 1.5), RW = (HW.cave ?? 5.5) + 2.2, AC = 14;
      const vp: number[] = [], vi: number[] = []; let rows = 0;
      for (let s = 0; s <= n; s++) {
        const t = -1.5 / L + (1 + 3 / L) * s / n, cx = A[0] + dx * t, cz = A[1] + dz * t; acc += 1.5 * (s > 0 ? 1 : 0);
        if (skip(cx, cz) || (acc % 24) < 4) { rows = 0; continue; }   // 天窗
        const g0 = Y(cx, cz);
        for (let c = 0; c <= AC; c++) { const a = c / AC * Math.PI, nn = (wfbm(cx * 0.2 + c, cz * 0.2) - 0.5), rr = RW + nn * 1.6, x = cx + nx * Math.cos(a) * rr, z = cz + nz * Math.cos(a) * rr;
          vp.push(x, g0 - 1.5 + Math.sin(a) * (10 + nn * 2), z); }
        if (rows > 0) { const b = vp.length / 3 - (AC + 1) * 2; for (let c = 0; c < AC; c++) { const a0 = b + c, a1 = a0 + 1, b0 = a0 + AC + 1, b1 = b0 + 1; vi.push(a0, a1, b0, a1, b1, b0); } }
        rows++;
        if (s % 2 === 0) for (let q = 0; q < 3; q++) { const o = (wfbm(cx * 0.7 + q * 5, cz * 0.7) - 0.5) * 2 * (RW - 2.5), hgt = 0.8 + wfbm(cx + q, cz - q) * 2.6, top = g0 - 1.5 + Math.sqrt(Math.max(0, 1 - (o / RW) ** 2)) * 10 - 0.3;
          icicles.push(m4.compose(pv.set(cx + nx * o, top - hgt / 2, cz + nz * o), qt.setFromAxisAngle(up, q * 2.1).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)), sv.set(0.35, hgt, 0.35)).clone()); }
      }
      if (vi.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); g.setIndex(vi); g.computeVertexNormals(); vault.push(g); }
    }
  }
  const world = (o: THREE.Object3D) => { o.position.set(0, -api.groundY(0, 0), 0); o.frustumCulled = false; api.add(o, 0, 0); };
  // 11-18 Rhett 14:56「可以」：主路石板路换首领台同款地板 A（selui wl_floorA，uv = 世界 xz / 4.5 与平台同铺距，接缝对齐）；?off=wellroadA 回旧 wellflag
  const roadA = k_roadA();
  for (const [k, gs] of strips) { const g = mergeGeometries(gs); if (!g) continue; const me = new THREE.Mesh(g, k === 'wellflag' && roadA ? roadA : mat(k, k === 'wellice' ? { roughness: 0.4, metalness: 0.1 } : k === 'welliron' ? { metalness: 0.55, roughness: 0.9 } : {})); me.receiveShadow = true; me.renderOrder = 0; world(me); }
  if (cliffs.length) { const g = mergeGeometries(cliffs); if (g) { const me = new THREE.Mesh(g, mat('wellcliff', { side: THREE.DoubleSide, color: 0xc8d0d4 })); me.receiveShadow = true; world(me); } }
  if (vault.length) { const g = mergeGeometries(vault); if (g) { const me = new THREE.Mesh(g, mat('wellcliff', { side: THREE.DoubleSide, color: 0x9cb8c8 })); me.castShadow = false; me.receiveShadow = true; world(me); } }
  if (icicles.length && mid) { const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 6), mat('wellice', { roughness: 0.25, metalness: 0.1, emissive: 0x16384c, emissiveIntensity: 0.6 }), icicles.length); icicles.forEach((m, i) => im.setMatrixAt(i, m)); world(im); }
  // 4) 井筒：11-08 Rhett「贴图太规整，换成多几种贴图的不规则排列，甚至有几个洞，重点是非规则随机」
  //    井壁按不规则大块（Voronoi 拼块，6–16 米）分成 5 种石面：旧砖 / 大块条石 / 碎砖 / 塌方原岩 / 苔藓水渍，每种合一个 draw call；
  //    另在井壁上随机掏 7 个不规则洞（向外凹 2–5 米，洞内贴暗洞贴图）；井口雕砖带改成断续的几段残带
  {
    const R = WELL_R + 2, segA = hi ? 360 : 220, segY = hi ? 90 : 56, H = 118, cy = (40 + WELL_ABYSS - 3) / 2;
    const h1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const C = 2 * Math.PI * R;
    // Voronoi 种子：在（弧长 u, 高度 y）平面撒点，格子 11 米抖动
    const CELL = 11, nu = Math.ceil(C / CELL), ny = Math.ceil(H / CELL) + 1;
    const KINDS: TileKind[] = ['wellbrick', 'wellblocks', 'wellbricks', 'wellraw', 'wellmoss'], W = [0.18, 0.3, 0.2, 0.12, 0.2];
    const kindOf = (u: number, y: number) => {
      const gu = Math.floor(u / CELL), gy = Math.floor((y + H / 2) / CELL); let best = 1e9, id = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ci = ((gu + di) % nu + nu) % nu, cj = gy + dj, sd = ci * 131 + cj * 17 + 5;
        let cu = (gu + di + 0.15 + h1(sd) * 0.7) * CELL; const cv = (cj + 0.15 + h1(sd + 9) * 0.7) * CELL - H / 2;
        const du0 = u - cu, du = du0 - Math.round(du0 / C) * C, dv = (y - cv) * (0.7 + h1(sd + 3) * 0.8);   // 拉伸：有的块横长、有的竖长
        const d = du * du + dv * dv; if (d < best) { best = d; id = sd; }
      }
      let t = h1(id + 77), k = 0; while (k < W.length - 1 && t > W[k]) { t -= W[k]; k++; }
      return k;
    };
    // 洞：7 个，角度 / 高度随机（避开井口雕砖带），半径 2.5–6 米，边缘按角度噪声参差
    const holes = Array.from({ length: 7 }, (_, i) => ({ a: (i / 7 + h1(i + 300) * 0.1) * Math.PI * 2, y: -45 + h1(i + 400) * 65, r: 2.5 + h1(i + 500) * 3.5, d: 2 + h1(i + 600) * 3, s: i }));
    const rubble = wellRubbleSites(cy - H / 2, Math.min(cy + H / 2, 36), holes, R, hi ? 28 : 18);   // 11-15 塌落碎石区（石材与碎石同一份）
    const holeK = (a: number, y: number) => { let m = 0;
      for (const o of holes) { let da = a - o.a; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; const du = da * R, dv = y - o.y, ang = Math.atan2(dv, du);
        const rr = o.r * (0.75 + 0.35 * Math.sin(ang * 3 + o.s) + 0.15 * Math.sin(ang * 7 + o.s * 2)), q = Math.hypot(du, dv) / rr;
        if (q < 1) m = Math.max(m, Math.sqrt(1 - q) * o.d); }
      return m; };
    const g0 = new THREE.CylinderGeometry(R, R, H, segA, segY, true).toNonIndexed(), p = g0.getAttribute('position') as THREE.BufferAttribute;
    const radial = (x: number, y: number, z: number) => { const a = Math.atan2(z, x); return [a, R + (wfbm(a * 9 + 3, y * 0.05) - 0.5) * 2.8 + Math.sin(y * 0.21 + a * 3) * 0.3 + holeK(a, y + cy)] as const; };
    const buckets: number[][] = KINDS.map(() => []), holeB: number[] = [];
    for (let t = 0; t < p.count; t += 3) {
      const tri: number[] = []; let ca = 0, cyy = 0, sx = 0, sz = 0, hd = 0;
      for (let v = 0; v < 3; v++) { const x = p.getX(t + v), y = p.getY(t + v), z = p.getZ(t + v), [a, r] = radial(x, y, z); tri.push(Math.cos(a) * r, y + cy, Math.sin(a) * r); sx += Math.cos(a); sz += Math.sin(a); cyy += y + cy; hd = Math.max(hd, holeK(a, y + cy)); }
      ca = Math.atan2(sz, sx); cyy /= 3;
      if (hd > 0.6) { holeB.push(...tri); continue; }
      const u = ((ca % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * R;
      buckets[kindOf(u, cyy)].push(...tri);
    }
    const mk = (arr: number[]) => { const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const g = mergeVertices(g0, 1e-3); g.computeVertexNormals(); return g; };
    // 按需包里的贴图可能晚到：先用纯色，到了再换上贴图材质
    const late = (me: THREE.Mesh, k: TileKind, o: Parameters<typeof tileMat>[1]) => { if (quality() === 'low' || tileMat(k, o)) return; void wellTilesEnsure().then(() => { const m = tileMat(k, { roughness: 1, ...o }); if (m) { if (k !== 'wellhole') wetWall(m); me.material = m; } }); };
    // 11-15 井壁 v2（GPT 效果图 → well_stone_hd 烘焙石墙 + 视差）：中高画质全墙一个材质；低画质照旧 tiletex 纯色
    if (mid && !offWell('stone')) { const all: number[] = []; for (const b of buckets) for (let j = 0; j < b.length; j++) all.push(b[j]);   /* 11-18 22:00 实机 launch.log：中高画质这里 push(...b) 参数过多 → Maximum call stack size exceeded，整个钟井造景中断（码头 / 路灯都没放）。改逐个 push */ const me = new THREE.Mesh(mk(all), stoneWallMat({ hi, sites: rubble })); me.receiveShadow = true; world(me); }
    else KINDS.forEach((k, i) => { if (!buckets[i].length) return; const o = { side: THREE.BackSide, color: k === 'wellmoss' ? 0xb4c4b8 : 0xb8c0b8 }; const me = new THREE.Mesh(mk(buckets[i]), mat(k, o)); wetWall(me.material as THREE.Material); me.receiveShadow = true;   // 11-15 井壁湿痕
    world(me); late(me, k, o); });
    if (holeB.length) { const o = { side: THREE.DoubleSide, color: 0x8a9090 }; const me = new THREE.Mesh(mk(holeB), mat('wellhole', o)); me.receiveShadow = true; world(me); late(me, 'wellhole', o); }
    // 井口外沿雕砖带：断续 5–7 段（每段 12°–40°，高度错落 ±2 米），不再一整圈
    const nb = 5 + Math.floor(h1(901) * 3);
    for (let i = 0; i < nb; i++) {
      const a0 = (i / nb + h1(i + 910) * 0.08) * Math.PI * 2, len = (12 + h1(i + 920) * 28) * Math.PI / 180, hh = 5 + h1(i + 930) * 3;
      const band = new THREE.CylinderGeometry(R - 0.6, R - 0.6, hh, Math.max(6, Math.round(len / (2 * Math.PI) * segA)), 1, true, a0, len); band.translate(0, 31 + (h1(i + 940) - 0.5) * 4, 0);
      const bm = new THREE.Mesh(band, mat('wellarch', { side: THREE.BackSide, color: 0xb0b4ac })); world(bm);
    }
    // 11-15 井壁点缀：凸出破砖 / 砖缝杂草 / 下垂水草 / 小花（well_wall_hd.ts）
    try { const rAt = (a: number, yw: number) => { const y = yw - cy; return R + (wfbm(a * 9 + 3, y * 0.05) - 0.5) * 2.8 + Math.sin(y * 0.21 + a * 3) * 0.3 + holeK(a, yw); };
      wallStats.dress = wellWallDress({ rAt, y0: cy - H / 2, y1: Math.min(cy + H / 2, 36), holes, R, hi, mid, add: world, sites: rubble }); } catch (e) { console.warn('wellWallDress', e); }
    wallStats.holes = holes.length; wallStats.bands = nb; wallStats.kinds = KINDS.map((k, i) => `${k}:${buckets[i].length / 9}`).join(' ');
  }
  // 5) 铁柱 / 链（InstancedMesh）
  if (posts.length) { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), mat('welliron', { metalness: 0.6, roughness: 0.85 }), posts.length); posts.forEach((m, i) => im.setMatrixAt(i, m)); world(im); }
  if (chains.length && mid) { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.75, roughness: 0.55 }), chains.length); chains.forEach((m, i) => im.setMatrixAt(i, m)); world(im); }
  if (treads.length) { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), (TREAD_NEW && treadMats()) || mat('welliron', { metalness: 0.55, roughness: 0.9 }), treads.length); treads.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; world(im); }
  for (const [x, z, y, ry] of cages) {
    const c = sceneOr('scene_wl_bell_cage', { h: 4.2 }, () => null) as THREE.Group | null; if (!c) break;
    c.position.y = y - api.groundY(x, z); api.add(c, x, z, ry);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 40, 5), new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.75, roughness: 0.55 })); ch.position.y = y + 4.2 + 20 - api.groundY(x, z); api.add(ch, x, z);
  }
  if (riverI.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(river, 3)); g.setIndex(riverI); g.computeVertexNormals();
    const me = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x05090c, roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide })); world(me); }
  // 摆渡暗河：两条渡船泊在黑水上（Lux3D）
  if (mid) for (const [x, z, h, ry] of [[127, 18, -31.5, 0.1], [121, -56, -33.6, -0.6]] as const) { const b = sceneOr('scene_wl_ferry_boat', { h: 2.2 }, () => null) as THREE.Group | null; if (!b) break; b.position.y = h - 0.9 - api.groundY(x, z); api.add(b, x, z, ry); }
  // 6) 壁灯（Lux3D 井灯；只发光，不加实时点光）
  if (mid) for (const [x, z, ry] of lamps) { const l = sceneOr('scene_wl_lantern', { h: 1.6 }, () => null) as THREE.Group | null; if (!l) break; l.position.y = 0.05; api.add(l, x, z, ry); }
  // 7) 11-18 路灯（营地灯柱，幽兰色：自发光 + 光晕，不加实时点光 —— 一路五十来盏）
  // 11-18 Rhett「钟井的路灯没加上」：钟井在开局批量建图时营地灯柱 / 井灯 GLB 往往还没解析好 → 两个都 null 直接 break，一盏都没放（旧壁灯又已关掉）。
  //   改：放不下的部分每秒重试，最多 90 秒，解析好就补上（?off=welllampretry 回旧）
  let road = 0;
  // 11-18 16:10 Rhett 仍报「路灯呢」：①原来低档整段不放；②两种 GLB 都没解析好时只等 90 秒、过后放弃。
  //   改：任何画质都放；GLB 没好就当场放程序化幽兰灯柱（不依赖模型），每 5 盏挂一个真点光（中档起，最多 10 个）把路面和楼梯照出来。?off=welllampproc 回旧
  // 11-18 18:59 Rhett 第三次报「路灯还是没装上」：灯立在路面带外缘（w+0.9），那里的高度图常是崖下 / 井壁外（低几十米或抬高），
  //   api.add 按灯脚的地面高度放 → 灯掉进崖底或埋进井壁，看不见。改：灯脚地面和路中心高度差超出 −0.3…+2.5 米时按路中心高度立。?off=welllampy 回旧
  const LAMPY = !offWell('welllampy');
  const PROC = !offWell('welllampproc'); let lights = 0;
  const lit = () => PROC && mid && (lightPoolOn() ? road % 2 === 0 : road % 5 === 0 && lights < 10) && ++lights > 0;   // 11-18 光源池开着：每 2 盏登记一盏虚拟灯（场景里只有池子那几盏真点光）   // 每 5 盏一个真点光，最多 10 个（实时点光多了全场景着色器都变慢）
  const placed: THREE.Object3D[] = [];
  // 11-18 帧率：全部放完后同模板灯柱按网格实例化（营地灯柱、程序化灯柱各合一组），?off=wellbatch 回旧
  const batchLamps = () => { const root = placed[0]?.parent; if (!root) return; for (const kind of [false, true]) { const gs = placed.filter(o => !!o.userData.procLamp === kind); try { instanceClones(gs, h => root.add(h)); } catch (e) { console.warn('钟井路灯合批', e); } } };
  const putLamps = () => { while (road < roadLamps.length) { const [x, z, ry, hy] = roadLamps[road]; const l = campLampPost({ color: WELL_LAMP, light: false, halo: true }) ?? sceneOr('scene_wl_lantern', { h: 1.6 }, () => null) as THREE.Group | null ?? (PROC ? procLamp(lit()) : null); if (!l) return false; if (!l.userData.procLamp && lit()) { const p = lampLight(); if (!poolLight(l, p)) l.add(p); } if (LAMP_POOL) l.add(lampPool(l.userData.procLamp ? 0.55 : 0.72)); if (LAMPY) { const gy = api.groundY(x, z); if (gy < hy - 0.3 || gy > hy + 2.5) { l.position.y = hy - gy; wellLampStats.fix++; } } api.add(l, x, z, ry); placed.push(l); road++; } batchLamps(); return true; };   // 营地件没解析好 → 退回井灯 → 程序化灯柱
  if ((mid || PROC) && roadLamps.length && !putLamps() && !offWell('welllampretry') && typeof setTimeout !== 'undefined') { let n = 0; const retry = () => { if (putLamps()) { wellLampStats.road = road; return; } if (++n < 90) setTimeout(retry, 1000); else console.warn('钟井路灯：灯柱模型 90 秒内没解析好，放了', road, '/', roadLamps.length); }; setTimeout(retry, 1000); }
  wellLampStats.road = road; wellLampStats.want = roadLamps.length;
  try { const msg = `welllamp road=${road}/${roadLamps.length} fix=${wellLampStats.fix} q=${q}`; console.info(msg); (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log?.(msg); } catch { /* 网页版无日志 */ }
  return { strips: [...strips.keys()], cliffs: cliffs.length, vault: vault.length, icicles: icicles.length, posts: posts.length, lamps: lamps.length, roadLamps: road };
}
