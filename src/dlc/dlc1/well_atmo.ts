// 11-18 opt1118C #7 钟井区域氛围（RPG 场景搭建专长包 v0.9.2 第 7 章）：Rhett 嫌钟井「太乱、一路一个样」——
//   沿主路分 5 区：码头（井口营地 → 码头 → 西崖栈道 → 潮汐栈道 → 礼拜堂）/ 冰窟（寒潮冰窟 → 冰湖）/ 升降段（冰湖下行钟笼台阶 → 锈链断桥 → 黑水两岸 → 摆渡暗河）/
//   回廊（沉钟回廊）/ 首领台（下行台阶 → 井底沉钟腔）。每区一套：雾色 + 雾距（浓度）、主光色（场景平行光，半球天光按 40% 跟着染）、粒子（gen2/particles.png 2×2 图集）。
//   规则（第 7 章 7.2）：相邻区 4 项里至少 2 项不同（主光色相差 ≥30° / 雾亮度比 ≥1.4 / 雾浓度比 ≥1.4 / 粒子种类）——wellAtmoCheck() 自检；
//   过渡 7 米：区权重 = 1 − smoothstep(0, 7, 到本区路线距离 − 到最近区距离)，越过区界 7 米权重归 0；首领台主光饱和度全图最高、粒子最密、上升 ≥1 m/s。
//   雾用本体 THREE.Fog（材质里算），不加全屏 pass；按相机位置混色（不是逐像素分区，见返回说明）。粒子全部顶点着色器里动（CPU 每帧只写时间），总数 < 2000（低档减半）。
//   ?off=wellatmo 回旧（不建粒子、不改雾 / 主光）
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { WELL_ROUTE } from './well_terrain';
import { quality } from './well_dock_hd';
import { WELL_GEN2_TEX } from './well_gen2_tex';

export const ATMO_ON = (() => { try { return !/(?:[?&]off=[^&]*\bwellatmo\b)/.test(location.search); } catch { return true; } })();
/** 粒子图集格：0 左上冰晶 1 右上余烬 2 左下尘 3 右下青孢子 */
type Recipe = { name: string; fog: number; far: number; sun: number; hemiK: number; cell: 0 | 1 | 2 | 3; dens: number; size: number; rise: number; sway: number; h: number; col: number };
/** 5 区配方（一区一套，第 7 章 7.2 表的钟井版） */
export const ATMO: Recipe[] = [
  { name: '码头', fog: 0x22303a, far: 150, sun: 0xffd6a8, hemiK: 0.4, cell: 2, dens: 4, size: 0.22, rise: 0.03, sway: 0.35, h: 6, col: 0xd8d0c4 },     // 鱼油灯暖白 + 中性尘
  { name: '冰窟', fog: 0x1c3e58, far: 105, sun: 0xa8d4ff, hemiK: 0.4, cell: 0, dens: 6, size: 0.2, rise: -0.04, sway: 0.6, h: 7, col: 0xcfe6ff },      // 冷蓝、雾最浓之一、冰晶下沉
  { name: '升降段', fog: 0x10302e, far: 160, sun: 0x86f0d0, hemiK: 0.4, cell: 3, dens: 7, size: 0.26, rise: 0.12, sway: 0.9, h: 8, col: 0xa0ffe8 },    // 深井青、孢子上飘
  { name: '回廊', fog: 0x2c2a34, far: 125, sun: 0xd8c8ff, hemiK: 0.4, cell: 2, dens: 3, size: 0.2, rise: 0.02, sway: 0.25, h: 6, col: 0xc8c0d8 },     // 静：灰紫、雾薄、粒子最少最慢
  { name: '首领台', fog: 0x3c140c, far: 95, sun: 0xff5a24, hemiK: 0.45, cell: 1, dens: 14, size: 0.26, rise: 1.1, sway: 1.4, h: 10, col: 0xffb070 },  // 独一份：饱和红橙主光 + 最密余烬
];
/** 区 → 主路节点区间（段 i = 节点 i → i+1）；首领台再加沉钟腔圆台 */
export const ATMO_ZONES: { seg: [number, number]; disc?: [number, number, number] }[] = [
  { seg: [0, 12] }, { seg: [13, 19] }, { seg: [20, 32] }, { seg: [33, 37] }, { seg: [38, 39], disc: [30, -16, 22] },
];
const BAND = 7, NZ = ATMO.length;

const st = {
  hY: [] as number[], g0: 0, pts: [] as THREE.Points[], mats: [] as THREE.ShaderMaterial[],
  saved: null as null | { scene: THREE.Scene; sun: THREE.DirectionalLight | null; sunC: THREE.Color; hemi: THREE.HemisphereLight | null; hemiC: THREE.Color; near: number },
  w: new Float32Array(NZ), t: 0, built: false, total: 0, fogC: new THREE.Color(), sunC: new THREE.Color(), far: 150, fresh: true,
};

/** 点到区的距离（米）：水平到区内路段 + 0.6 × 高差（竖井上下层分得开） */
function zoneDist(z: number, x: number, y: number, zz: number): number {
  const Z = ATMO_ZONES[z]; let best = 1e9;
  for (let i = Z.seg[0]; i <= Z.seg[1] && i < WELL_ROUTE.length - 1; i++) {
    const [ax, az] = WELL_ROUTE[i].p, [bx, bz] = WELL_ROUTE[i + 1].p, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (zz - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t;
    const gy = (st.hY[i] ?? WELL_ROUTE[i].h) * (1 - t) + (st.hY[i + 1] ?? WELL_ROUTE[i + 1].h) * t;
    const d = Math.hypot(Math.hypot(x - px, zz - pz), Math.max(0, Math.abs(y - gy) - 3) * 0.6); if (d < best) best = d;
  }
  if (Z.disc) { const [cx, cz, r] = Z.disc; const d = Math.max(0, Math.hypot(x - cx, zz - cz) - r); const gy = st.hY[WELL_ROUTE.length - 1] ?? -54; best = Math.min(best, Math.hypot(d, Math.max(0, Math.abs(y - gy) - 3) * 0.6)); }
  return best;
}
/** 各区权重（和为 1）：过渡带 7 米 */
export function atmoWeights(x: number, y: number, z: number, out = st.w): Float32Array {
  const d = Array.from({ length: NZ }, (_, i) => zoneDist(i, x, y, z)), m = Math.min(...d); let s = 0;
  for (let i = 0; i < NZ; i++) { const k = Math.max(0, Math.min(1, (d[i] - m) / BAND)); out[i] = 1 - k * k * (3 - 2 * k); s += out[i]; }
  for (let i = 0; i < NZ; i++) out[i] /= s || 1;
  return out;
}

// ---------------------------------------------------------------- 粒子
let atlas: THREE.Texture | null = null;
function atlasTex(): THREE.Texture {
  if (atlas) return atlas;
  const t = new THREE.TextureLoader().load(WELL_GEN2_TEX.particles); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return (atlas = t);
}
const VS = `attribute vec4 aP; attribute float aG; uniform float uT, uRise, uSway, uH, uSize, uVH; varying float vA;
void main(){
  float ph = aP.x; vec3 p = position;
  float k = fract((p.y - aG) / uH + uRise * uT / uH);
  p.y = aG + 0.2 + k * uH;
  p.x += sin(uT * (0.5 + aP.z * 0.4) + ph) * uSway; p.z += cos(uT * (0.4 + aP.w * 0.4) + ph * 1.7) * uSway;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = uSize * aP.y * projectionMatrix[1][1] * uVH * 0.5 / max(dist, 0.5);
  vA = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.82, 1.0, k)) * (1.0 - smoothstep(26.0, 55.0, dist)) * smoothstep(0.8, 2.0, dist) * (0.6 + 0.4 * sin(uT * 2.3 + ph * 5.0));
  vA *= step(1.2, gl_PointSize);   // 小于 1.5 像素的直接不画（远处自动淡掉）
}`;
const FS = `uniform sampler2D uMap; uniform vec2 uCell; uniform vec3 uCol; uniform float uI; varying float vA;
void main(){ vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * 0.5 + uCell; vec3 c = texture2D(uMap, uv).rgb; gl_FragColor = vec4(c * uCol * uI * vA, 1.0); }`;
function zoneParticles(api: WildBuildApi, z: number, budget: number): THREE.Points | null {
  const R = ATMO[z], Z = ATMO_ZONES[z];
  // 投点范围：本区路段两侧 5 米 + 圆台
  const segs: [number, number, number, number, number][] = [];
  let area = 0;
  for (let i = Z.seg[0]; i <= Z.seg[1] && i < WELL_ROUTE.length - 1; i++) { const [ax, az] = WELL_ROUTE[i].p, [bx, bz] = WELL_ROUTE[i + 1].p, L = Math.hypot(bx - ax, bz - az); segs.push([ax, az, bx, bz, L]); area += L * 10; }
  if (Z.disc) area += Math.PI * Z.disc[2] ** 2;
  const n = Math.max(0, Math.min(budget, Math.round(area / 100 * R.dens))); if (!n) return null;
  let s = 7919 + z * 131; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(n * 3), aP = new Float32Array(n * 4), aG = new Float32Array(n);
  const discA = Z.disc ? Math.PI * Z.disc[2] ** 2 : 0;
  for (let k = 0; k < n; k++) {
    let x: number, zz: number;
    if (Z.disc && rnd() < discA / area) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Z.disc[2]; x = Z.disc[0] + Math.cos(a) * r; zz = Z.disc[1] + Math.sin(a) * r; }
    else { let pick = rnd() * segs.reduce((a, q) => a + q[4], 0), q = segs[0]; for (const g of segs) { if (pick < g[4]) { q = g; break; } pick -= g[4]; }
      const t = rnd(), o = (rnd() - 0.5) * 10, L = q[4], nx = -(q[3] - q[1]) / L, nz = (q[2] - q[0]) / L; x = q[0] + (q[2] - q[0]) * t + nx * o; zz = q[1] + (q[3] - q[1]) * t + nz * o; }
    const g = api.groundY(x, zz); aG[k] = g; pos.set([x, g + 0.2 + rnd() * R.h, zz], k * 3);
    aP.set([rnd() * 6.283, 0.7 + rnd() * 0.6, rnd(), rnd()], k * 4);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4)); geo.setAttribute('aG', new THREE.BufferAttribute(aG, 1));
  const cell = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]][R.cell];
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uRise: { value: R.rise }, uSway: { value: R.sway }, uH: { value: R.h }, uSize: { value: R.size }, uVH: { value: 720 }, uMap: { value: atlasTex() }, uCell: { value: new THREE.Vector2(cell[0], cell[1]) }, uCol: { value: new THREE.Color(R.col) }, uI: { value: z === NZ - 1 ? 1.6 : 1.1 } } });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false; p.renderOrder = 6; p.userData.noCamBlock = true; p.userData.wellAtmoZone = z;
  st.mats.push(mat); st.total += n;
  return p;
}

/** 造景时调（raid_well build 新版分支） */
export function wellAtmoBuild(api: WildBuildApi) {
  st.hY = WELL_ROUTE.map(r => api.groundY(r.p[0], r.p[1])); st.g0 = api.groundY(0, 0);
  st.pts = []; st.mats = []; st.total = 0; st.saved = null; st.built = true;
  if (!ATMO_ON) return { on: false };
  const cap = quality() === 'low' ? 900 : 1800;   // 第 7 章：整张图 < 2000，低档减半
  // 先按密度算各区要的数，超预算整体按比例缩
  const want = ATMO.map((R, z) => { const Z = ATMO_ZONES[z]; let a = 0; for (let i = Z.seg[0]; i <= Z.seg[1] && i < WELL_ROUTE.length - 1; i++) a += Math.hypot(WELL_ROUTE[i + 1].p[0] - WELL_ROUTE[i].p[0], WELL_ROUTE[i + 1].p[1] - WELL_ROUTE[i].p[1]) * 10; if (Z.disc) a += Math.PI * Z.disc[2] ** 2; return a / 100 * R.dens; });
  const k = Math.min(1, cap / want.reduce((a, b) => a + b, 0));
  for (let z = 0; z < NZ; z++) { const p = zoneParticles(api, z, Math.floor(want[z] * k)); if (!p) continue; p.position.set(0, -st.g0, 0); api.add(p, 0, 0); st.pts.push(p); }
  return { on: true, particles: st.total, scale: +k.toFixed(2) };
}

const v2 = new THREE.Vector2(), tmpC = new THREE.Color(), tmpS = new THREE.Color(), cF = new THREE.Color(), cS = new THREE.Color();
/** 每帧（井图内）：camPos = 相机世界坐标，o = 井图原点；scene / renderer 来自 wellRC() */
export function wellAtmoTick(dt: number, inMap: boolean, scene: THREE.Scene | null, renderer: THREE.WebGLRenderer | null, cam: THREE.Camera | null, o: { x: number; z: number }) {
  if (!ATMO_ON) return;
  if (!inMap || !scene) { atmoRestore(); return; }
  st.t += dt; const vh = renderer ? renderer.getDrawingBufferSize(v2).y : 720;
  for (const m of st.mats) { m.uniforms.uT.value = st.t; m.uniforms.uVH.value = vh; }
  if (!cam) return;
  if (!st.saved || st.saved.scene !== scene) {
    let sun: THREE.DirectionalLight | null = null, hemi: THREE.HemisphereLight | null = null;
    scene.traverse(ob => { const l = ob as THREE.Light; if ((l as THREE.DirectionalLight).isDirectionalLight && (!sun || l.intensity > sun.intensity)) sun = l as THREE.DirectionalLight; if ((l as THREE.HemisphereLight).isHemisphereLight && !hemi) hemi = l as THREE.HemisphereLight; });
    const s0 = sun as THREE.DirectionalLight | null, h0 = hemi as THREE.HemisphereLight | null;
    st.fresh = true;
    st.saved = { scene, sun: s0, sunC: s0 ? s0.color.clone() : new THREE.Color(), hemi: h0, hemiC: h0 ? h0.color.clone() : new THREE.Color(), near: (scene.fog as THREE.Fog | null)?.near ?? 0 };
  }
  const p = cam.position, w = atmoWeights(p.x - o.x, p.y - 2, p.z - o.z);
  tmpC.setRGB(0, 0, 0); tmpS.setRGB(0, 0, 0); let far = 0;
  for (let i = 0; i < NZ; i++) { if (!w[i]) continue; const R = ATMO[i]; cF.set(R.fog); cS.set(R.sun);
    tmpC.r += cF.r * w[i]; tmpC.g += cF.g * w[i]; tmpC.b += cF.b * w[i]; tmpS.r += cS.r * w[i]; tmpS.g += cS.g * w[i]; tmpS.b += cS.b * w[i]; far += R.far * w[i]; }
  // 平滑：区间切换不跳
  //   （码头调色 dockGradeTick 每帧会先按自己的存档重写雾色 / 雾距，所以平滑值存在本模块，最后直接覆盖）
  const k = st.fresh ? 1 : Math.min(1, dt * 3); st.fresh = false;
  st.fogC.lerp(tmpC, k); st.far += (far - st.far) * k; st.sunC.lerp(tmpS, k);
  const f = scene.fog as THREE.Fog | null;
  if (f) { f.color.copy(st.fogC); if ('far' in f) { f.far = st.far; f.near = Math.min(st.saved.near, st.far * 0.25); } }
  const S = st.saved;
  if (S.sun) S.sun.color.copy(st.sunC);
  if (S.hemi) { const R = ATMO[w.indexOf(Math.max(...w))]; S.hemi.color.copy(S.hemiC).lerp(st.sunC, R.hemiK); }
}
export function atmoRestore() {
  const S = st.saved; if (!S) return;
  if (S.sun) S.sun.color.copy(S.sunC); if (S.hemi) S.hemi.color.copy(S.hemiC);
  st.saved = null;   // 雾色 / 雾距不回写：换图时主程序按新图 palette 重设（同 well_dock_hd restore）
}

/** 第 7 章自检（离线可跑）：相邻区 ≥2 项不同、首领台饱和度最高 / 粒子最密、种类 ≤6、粒子总数 */
export function wellAtmoCheck() {
  const hsl = (c: number) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 });
  const lum = (c: number) => { const k = new THREE.Color(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };
  const rows: string[] = []; let ok = true;
  for (let i = 0; i + 1 < NZ; i++) {
    const A = ATMO[i], B = ATMO[i + 1], ha = hsl(A.sun).h * 360, hb = hsl(B.sun).h * 360, dh = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
    const lr = Math.max(lum(A.fog), lum(B.fog)) / Math.max(1e-4, Math.min(lum(A.fog), lum(B.fog))), dr = Math.max(A.far, B.far) / Math.min(A.far, B.far);
    const n = (dh >= 30 ? 1 : 0) + (lr >= 1.4 ? 1 : 0) + (dr >= 1.4 ? 1 : 0) + (A.cell !== B.cell ? 1 : 0);
    if (n < 2) ok = false; rows.push(`${A.name}→${B.name} 色相差 ${dh.toFixed(0)}° 雾亮度比 ${lr.toFixed(2)} 浓度比 ${dr.toFixed(2)} 粒子${A.cell !== B.cell ? '不同' : '相同'} = ${n} 项${n >= 2 ? '通过' : '不通过'}`);
  }
  const hsv = (c: number) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };   // HSV 饱和度（sRGB），同 demo「饱和 0.94」口径
  const sats = ATMO.map(r => hsv(r.sun)), boss = sats[NZ - 1];
  const bossTop = sats.every((s, i) => i === NZ - 1 || s < boss) && boss >= 0.85, densTop = ATMO.every((r, i) => i === NZ - 1 || r.dens < ATMO[NZ - 1].dens);
  if (!bossTop || !densTop) ok = false;
  rows.push(`首领台主光饱和度 ${boss.toFixed(2)}（其余最高 ${Math.max(...sats.slice(0, -1)).toFixed(2)}）${bossTop ? '通过' : '不通过'}；粒子密度最高 ${densTop ? '通过' : '不通过'}；种类 ${NZ} ≤ 6`);
  return { ok, rows, particles: st.total };
}
export const wellAtmoInfo = () => ({ on: ATMO_ON, built: st.built, particles: st.total, w: Array.from(st.w).map(v => +v.toFixed(2)) });
