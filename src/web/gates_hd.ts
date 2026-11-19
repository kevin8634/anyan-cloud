// ======================================================================
// 11-16 门重做（定稿概念图 03_概念图/07_门_1116/：field_portal / small_dungeon / return_portal）
//   · 野外传送门（地图之间的门：营地南门 / 东北 / 西南路口、原野东门 / 星落门、各野外图边上的门）：
//     圆形双层石台 + 地面符文盘，两根尖顶符文巨石夹一道竖椭圆漩涡，外侧两块矮立石，周围悬浮发光符文碎石
//   · 小副本门（wild.ts 'dgate'，s < 2；DLC 图里的同类门也走这里）：半埋进岩堆的古墓门脸——双柱 + 三钟山花 + 暗门洞（激活后门洞里是漩涡），
//     两侧挂灯，碎骨 / 断柱 / 石板路
//   · 回程门（原野回营地石门、副本出口）：残破石拱 + 菱形拱心石符文，拱内漩涡，地面一圈发光符文，两根矮符文柱，两侧发光晶簇
//   只换外观：门的位置、触发半径、落点、寻路障碍（调用方原样 block）、小地图标记都不变；
//   约定沿用旧模型：野外 / 回程门根节点 userData.portal = { color, style }（main.ts 环境粒子）、漩涡面名 'inner'（noSpin）、点光源是根节点的直接子节点（营地会摘掉）；
//   小副本门根节点 userData.dportal、dp_beam / dp_gem / dp_glow / dp_pool / dp_light / dp_em 名字给 setDungeonPortalActive。
//   低画质：少碎石 / 少装饰、低分段、无悬浮动画。?off=gates（或 localStorage darkrock_cine_off 含 gates）回旧门。
//   钟井 Raid 的门不经过这里（raid.ts 原样）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { curQuality, ENV_T, portalMaterial, runePlateMaterial, haloMaterial } from './gfx';
import { makeVortex } from './vortex_hd';
import { tex } from './textures';
import { pbrTex, type PbrOpt } from './pbr_tex';

let offC: boolean | null = null;
export function gatesHdOn(): boolean {
  if (offC === null) {
    offC = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(s => s.trim()).includes('gates');
    } catch { offC = false; }
  }
  return !offC;
}

// ---------------------------------------------------------------- 材质（按 key 缓存，不描边）
const cache: Record<string, THREE.Material> = {};
function std(key: string, p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const hit = cache[key]; if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial(p); m.userData.outlineParameters = { visible: false }; cache[key] = m;
  const t = GT_PBR[key]; if (t) pbrTex(m, t[0], t[1]);   // 11-16d 补写实贴图（stone / dark / warm 已有 UV 贴图，不动）
  return m;
}
const GT_PBR: Record<string, [string, PbrOpt]> = {
  bronze: ['bronze', { s: 1.2, k: 0.85, bump: 0.4 }], patina: ['bronze', { s: 1.0, bump: 0.5 }], bone: ['bone', { s: 1.2, bump: 0.6 }],
  iron: ['iron', { s: 1.5, bump: 0.5 }], rockv: ['frostrock', { s: 0.4, k: 0.7, bump: 1 }],
};
const texRep = (name: string, r: number) => { const t = tex(name, r); return t ?? undefined; };
const stoneM = () => std('stone', { color: 0xd2cec8, map: texRep('stone', 1), roughness: 0.86, metalness: 0.02 });
const darkM = () => std('dark', { color: 0x8e8a9a, map: texRep('rock', 1), roughness: 0.82, metalness: 0.05 });
const warmM = () => std('warm', { color: 0xd4c4a8, map: texRep('stone', 1), roughness: 0.88 });
const bronzeM = () => std('bronze', { color: 0xb88c3e, roughness: 0.34, metalness: 0.88 });
const patinaM = () => std('patina', { color: 0x6a7a52, roughness: 0.6, metalness: 0.5 });
const boneM = () => std('bone', { color: 0xd8ccb0, roughness: 0.7 });
function glowM(color: number, k = 1): THREE.MeshBasicMaterial {
  const key = `g${color.toString(16)}_${k}`; const hit = cache[key]; if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, side: THREE.DoubleSide });
  m.userData.outlineParameters = { visible: false }; m.userData.noBake = true; cache[key] = m; return m;
}
const tag = <T extends THREE.Object3D>(o: T): T => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.userData.outlineParameters = { visible: false }; }); return o; };

// 噪声 / 随机
const fr = (x: number) => x - Math.floor(x);
const h2 = (x: number, z: number) => fr(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
function vn(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const rng = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const sm = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** 自然岩块（顶点位移 + 顶点色：朝上长苔 / 积灰），合并成一批 */
function rockBatch(list: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }[], R: () => number, det: number, top: number, base: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const cA = new THREE.Color(base), cB = new THREE.Color(base).multiplyScalar(1.35), cT = new THREE.Color(top), c = new THREE.Color();
  for (const r of list) {
    const g = new THREE.IcosahedronGeometry(1, det), p = g.getAttribute('position') as THREE.BufferAttribute, o1 = R() * 40, o2 = R() * 40;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = vn(v.x * 1.6 + o1, v.y * 1.6 + v.z * 1.2 + o2) * 0.55 + vn(v.x * 3.7 + o2, v.z * 3.7 + o1) * 0.22; v.multiplyScalar(0.62 + n * 1.1); v.y = Math.round(v.y * 3) / 3 * 0.3 + v.y * 0.7; p.setXYZ(i, v.x * r.sx, v.y * r.sy, v.z * r.sz); }
    g.applyMatrix4(m4.compose(v.set(r.x, r.y, r.z), q.setFromEuler(e.set((R() - 0.5) * 0.25, r.ry, (R() - 0.5) * 0.25)), new THREE.Vector3(1, 1, 1)));
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { c.copy(cA).lerp(cB, h2(Math.floor(i / 3), 3.1)); c.lerp(cT, sm((nrm.getY(i) - 0.5) / 0.3) * 0.75); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); geos.push(g);
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false); geos.forEach(x => x.dispose()); if (!g) return null;
  const m = new THREE.Mesh(g, std('rockv', { vertexColors: true, flatShading: true, roughness: 0.9 })); m.castShadow = true; m.receiveShadow = true; return m;
}

/** 符文字形（菱形框 + 竖笔 + 两撇），一块面片组；front/back 两面 */
function runeGlyph(color: number, s: number, k = 1.6): THREE.Group {
  const g = new THREE.Group(), m = glowM(color, k);
  const bar = (w: number, h: number, x: number, y: number, rz: number) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(w * s, h * s), m); b.position.set(x * s, y * s, 0); b.rotation.z = rz; g.add(b); };
  bar(0.07, 0.62, 0, 0, 0); bar(0.06, 0.28, -0.1, 0.14, 0.7); bar(0.06, 0.28, 0.1, 0.14, -0.7); bar(0.06, 0.24, -0.09, -0.16, -0.6); bar(0.06, 0.24, 0.09, -0.16, 0.6);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36 * s, 0.42 * s, 4, 1), m); g.add(ring);
  return g;
}
/** 铜框符文板：贴在面上（z 朝外） */
function runePanel(color: number, w: number, h: number, hd: boolean): THREE.Group {
  const g = new THREE.Group();
  const fr2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), bronzeM()); g.add(fr2);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, h * 0.86, 0.1), darkM()); g.add(inner);
  const gl = runeGlyph(color, Math.min(w, h * 0.6) * 1.15); gl.position.z = 0.065; g.add(gl);
  if (hd) { const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.3), haloMaterial(color, 0.35)); glow.position.z = 0.07; glow.material.userData.noBake = true; g.add(glow); }
  return g;
}
/** 发光晶簇（回程门两侧）：几根拉长八面体，本色 + 自发光 */
function crystalCluster(color: number, s: number, R: () => number): THREE.Group {
  const g = new THREE.Group(), m = std('crys' + color.toString(16), { color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), emissive: color, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9, flatShading: true });
  const oc = new THREE.OctahedronGeometry(0.35, 0);
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(oc, m); const h = (i === 0 ? 2.6 : 1.2 + R() * 1.2) * s; c.scale.set(0.8 * s, h, 0.8 * s); c.position.set((R() - 0.5) * 0.9 * s, h * 0.3, (R() - 0.5) * 0.9 * s); c.rotation.set((R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7); g.add(c); }
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(3 * s, 3 * s), haloMaterial(color, 0.4)); hl.rotation.x = -Math.PI / 2; hl.position.y = 0.06; hl.material.userData.noBake = true; g.add(hl);
  return g;
}
/** 竖椭圆漩涡面（portalMaterial 是圆形遮罩，面片拉成 w×h 就是椭圆） */
function vortex(color: number, w: number, h: number, rift = false): THREE.Object3D {
  return makeVortex(color, w, h, rift);   // 11-16 魔法动效（vortex_hd.ts，?off=vortex 回旧版）
}

// ================================================================ 野外传送门
/** 野外传送门（替换 makePortal(color) 'gate' + makeArch）：本地 z 朝外，门面在 xy 平面，中心可走 */
export function makeFieldPortal(color: number): THREE.Group {
  const hd = curQuality !== 'low', hi = curQuality === 'high' || curQuality === 'ultra';
  const g = new THREE.Group(); g.userData.portal = { color, style: 'gate' }; g.userData.gateHd = 'field';
  const R = rng(4421 + (color % 977));
  // 圆形双层石台（矮，脚下可走）+ 外圈散石
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.55, 0.16, hd ? 14 : 10), warmM()); t1.position.y = 0.08; t1.receiveShadow = true; g.add(t1);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.6, 0.14, hd ? 14 : 10), stoneM()); t2.position.y = 0.23; t2.receiveShadow = true; g.add(t2);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.05, 4, hd ? 40 : 20), bronzeM()); ringB.rotation.x = -Math.PI / 2; ringB.position.y = 0.3; g.add(ringB);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.y = 0.32; plate.material.userData.noBake = true; g.add(plate);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 8.5), haloMaterial(color, 0.42)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; pool.material.userData.noBake = true; g.add(pool);
  const rocks: Parameters<typeof rockBatch>[0] = [];
  for (let i = 0; i < (hd ? 14 : 6); i++) { const a = i / (hd ? 14 : 6) * Math.PI * 2 + R() * 0.3; if (Math.abs(Math.sin(a)) > 0.86) continue; const r = 3.5 + R() * 0.5, s = 0.22 + R() * 0.25; rocks.push({ x: Math.cos(a) * r, y: s * 0.3, z: Math.sin(a) * r, sx: s * 1.4, sy: s, sz: s * 1.2, ry: R() * 6 }); }
  // 两根尖顶符文巨石（挤出的五边形，略向内倾）+ 铜边 + 正反面各三块符文板
  const sh = new THREE.Shape(); sh.moveTo(-0.62, 0); sh.lineTo(0.6, 0); sh.lineTo(0.7, 3.9); sh.lineTo(0.15, 5.3); sh.lineTo(-0.55, 4.55); sh.lineTo(-0.62, 0);
  const monoG = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1, curveSegments: 2 }); monoG.translate(0, 0, -0.45);
  { const uv = monoG.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5); }
  for (const sx of [-1, 1]) {
    const mono = new THREE.Group(); mono.position.set(sx * 2.2, 0.28, 0); mono.rotation.z = sx * 0.05; if (sx > 0) mono.scale.x = -1;
    const body = new THREE.Mesh(monoG, darkM()); body.castShadow = true; body.receiveShadow = true; mono.add(body);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.9, 1.02), bronzeM()); edge.position.set(0.66, 1.95, 0); mono.add(edge);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 1.12), bronzeM()); cap.position.set(0.04, 0.15, 0); mono.add(cap);
    for (const face of hd ? [1, -1] : [1]) for (let k = 0; k < 3; k++) {
      const p = runePanel(color, 0.62, 0.9, hi); p.position.set(0.04, 1.0 + k * 1.15, face * 0.56); if (face < 0) p.rotation.y = Math.PI; mono.add(p);
    }
    g.add(mono);
    // 外侧矮立石（一块符文板）
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.55, 1, 1, 1), darkM()); st.position.set(sx * 3.55, 1.0, 0.85); st.rotation.set(0, sx * 0.4, sx * -0.08); st.castShadow = true; g.add(st);
    const stTop = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 4), darkM()); stTop.position.set(sx * 3.55 + sx * 0.08, 2.3, 0.85); stTop.rotation.y = Math.PI / 4 + sx * 0.4; g.add(stTop);
    const sp = runePanel(color, 0.42, 0.62, false); sp.position.set(sx * 3.55 + Math.sin(sx * 0.4) * 0.3, 1.2, 0.85 + Math.cos(sx * 0.4) * 0.3); sp.rotation.y = sx * 0.4; g.add(sp);
  }
  // 竖椭圆漩涡（名字 inner：main.ts 不转它）
  const inner = vortex(color, 2.9, 4.2); inner.position.y = 2.45; inner.name = 'inner'; inner.userData.noSpin = true; g.add(inner);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.8), haloMaterial(color, 0.5)); halo.position.set(0, 2.45, -0.02); halo.material.userData.noBake = true; g.add(halo);
  // 悬浮符文碎石：绕门缓慢浮动（中档起；onBeforeRender 里按 ENV_T 算位置，不占更新循环）
  const nShard = hi ? 9 : hd ? 6 : 3;
  const shardG = new THREE.OctahedronGeometry(0.3, 0);
  for (let i = 0; i < nShard; i++) {
    const a = -0.25 * Math.PI + (i / (nShard - 1 || 1)) * 1.5 * Math.PI, rx = 2.6 + R() * 0.7, ry = 3.0 + R() * 0.5;
    const sd = new THREE.Group(); const bx = Math.cos(a) * rx, by = 2.6 + Math.sin(a) * ry, bz = (R() - 0.5) * 1.2; sd.position.set(bx, by, bz);
    const s = 0.7 + R() * 0.7;
    const stone = new THREE.Mesh(shardG, darkM()); stone.scale.set(s * 0.9, s * 1.5, s * 0.45); stone.castShadow = hd; sd.add(stone);
    const rim = new THREE.Mesh(shardG, bronzeM()); rim.scale.set(s * 0.97, s * 1.57, s * 0.3); sd.add(rim);
    const gl = runeGlyph(color, s * 0.55, 2); gl.position.z = s * 0.15; sd.add(gl); const gl2 = gl.clone(); gl2.position.z = -s * 0.15; sd.add(gl2);
    if (hd) { const ph = R() * 6.28; stone.onBeforeRender = () => { const t = ENV_T.value; sd.position.y = by + Math.sin(t * 0.9 + ph) * 0.18; sd.rotation.y = Math.sin(t * 0.4 + ph) * 0.6; }; }
    sd.rotation.z = (R() - 0.5) * 0.6; g.add(sd);
  }
  if (rocks.length) { const rb = rockBatch(rocks, R, hd ? 1 : 0, 0x6a7a48, 0x4a4650); if (rb) g.add(rb); }
  const l = new THREE.PointLight(color, 4, 11); l.position.y = 2.2; g.add(l);
  return tag(g);
}

// ================================================================ 回程门
/** 回程门（替换 makePortal(color) + makeArch）：残破石拱 + 菱形拱心石 + 拱内漩涡 + 地面符文圈 + 矮符文柱 + 晶簇 */
export function makeReturnPortal(color: number): THREE.Group {
  const hd = curQuality !== 'low', hi = curQuality === 'high' || curQuality === 'ultra';
  const g = new THREE.Group(); g.userData.portal = { color, style: 'gate' }; g.userData.gateHd = 'return';
  const R = rng(7717 + (color % 911));
  // 地面：裂纹石台 + 符文圈（加色 runePlate 放大成外圈）
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.2, hd ? 12 : 8), warmM()); base.position.y = 0.1; base.receiveShadow = true; g.add(base);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 6.6), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.22, 0.4); plate.material.userData.noBake = true; g.add(plate);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), haloMaterial(color, 0.45)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; pool.material.userData.noBake = true; g.add(pool);
  // 双柱（柱础 + 柱身 + 柱头）
  for (const sx of [-1, 1]) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.5, 1.25), stoneM()); plinth.position.set(sx * 2.0, 0.45, -0.1); plinth.castShadow = true; g.add(plinth);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.0, 0.95), stoneM()); shaft.position.set(sx * 2.0, 2.2, -0.1); shaft.castShadow = true; g.add(shaft);
    for (const yy of [1.0, 3.4]) { const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 1.02), bronzeM()); band.position.set(sx * 2.0, yy, -0.1); g.add(band); }
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.4, 1.35), stoneM()); capital.position.set(sx * 2.0, 3.9, -0.1); g.add(capital);
    for (const face of hd ? [1, -1] : [1]) { const p = runePanel(color, 0.5, 1.2, hi); p.position.set(sx * 2.0, 2.3, -0.1 + face * 0.5); if (face < 0) p.rotation.y = Math.PI; g.add(p); }
  }
  // 拱：一块块拱石沿半圆排开；右肩缺几块（残破）
  const n = hd ? 11 : 7, rA = 2.0, cy = 4.1;
  const vous = new THREE.BoxGeometry(0.75, 0.7, 1.0);
  for (let i = 0; i < n; i++) {
    if (i === 1 && hd) continue;                               // 缺一块
    const a = Math.PI - (i + 0.5) / n * Math.PI, x = Math.cos(a) * rA, y = cy + Math.sin(a) * rA;
    const b = new THREE.Mesh(vous, i % 3 === 1 ? darkM() : stoneM()); b.position.set(x, y, -0.1 + (R() - 0.5) * 0.08); b.rotation.z = a - Math.PI / 2; b.scale.set(1, 0.9 + R() * 0.25, 1); b.castShadow = true; g.add(b);
  }
  // 拱心石：铜框菱形 + 发光符文
  const ks = new THREE.Group(); ks.position.set(0, cy + rA + 0.35, 0.05);
  const kb = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), darkM()); kb.scale.set(0.85, 1.1, 0.4); ks.add(kb);
  const kr = new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), bronzeM()); kr.scale.set(0.85, 1.1, 0.28); ks.add(kr);
  const kg = runeGlyph(color, 0.9, 2.2); kg.position.z = 0.36; ks.add(kg); const kg2 = kg.clone(); kg2.position.z = -0.36; ks.add(kg2);
  g.add(ks);
  // 拱内漩涡
  const inner = vortex(color, 3.0, 4.9); inner.position.set(0, 2.85, -0.12); inner.name = 'inner'; inner.userData.noSpin = true; g.add(inner);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 6.4), haloMaterial(color, 0.5)); halo.position.set(0, 3.0, -0.16); halo.material.userData.noBake = true; g.add(halo);
  // 前方两根矮符文柱
  for (const sx of [-1, 1]) {
    const pc = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.75), darkM()); pc.position.set(sx * 3.25, 0.95, 1.7); pc.castShadow = true; g.add(pc);
    const pt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), stoneM()); pt.position.set(sx * 3.25, 1.78, 1.7); g.add(pt);
    const p = runePanel(color, 0.42, 0.8, false); p.position.set(sx * 3.25, 1.0, 2.09); g.add(p);
  }
  // 两侧晶簇 + 散落拱石 / 碎岩
  if (hd) for (const [x, z, s] of [[-3.8, -0.9, 1.0], [3.9, -0.6, 0.85], [3.4, 2.6, 0.55]] as const) { const c = crystalCluster(color, s, R); c.position.set(x, 0.1, z); g.add(c); }
  const rocks: Parameters<typeof rockBatch>[0] = [];
  for (let i = 0; i < (hd ? 10 : 4); i++) { const a = R() * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.8) continue; const r = 3.6 + R() * 0.8, s = 0.25 + R() * 0.3; rocks.push({ x: Math.cos(a) * r, y: s * 0.3, z: Math.sin(a) * r, sx: s * 1.4, sy: s, sz: s * 1.2, ry: R() * 6 }); }
  rocks.push({ x: 2.9, y: 0.3, z: -1.4, sx: 0.5, sy: 0.4, sz: 0.55, ry: 0.6 });
  if (rocks.length) { const rb = rockBatch(rocks, R, hd ? 1 : 0, 0x6a6a50, 0x4c4842); if (rb) g.add(rb); }
  const l = new THREE.PointLight(color, 4, 11); l.position.y = 2.4; g.add(l);
  return tag(g);
}

// ================================================================ 小副本门
/** 小副本门（替换 makeDungeonPortal）：facing = 门脸朝向（弧度，本地 +z 转到这个方向；调用方按 90° 取整，门柱对得上旧的四角障碍） */
export function makeSmallDungeonGate(color: number, facing: number): THREE.Group {
  const hd = curQuality !== 'low', hi = curQuality === 'high' || curQuality === 'ultra';
  const g = new THREE.Group(); g.userData.dportal = { color }; g.userData.gateHd = 'dungeon';
  const root = new THREE.Group(); root.rotation.y = facing; g.add(root);
  const R = rng(9931 + (color % 733));
  const FZ = -2.5;                                              // 门脸所在 z（旧四角障碍在 ±2.16）
  // 门洞：暗深处 + 漩涡（dp_beam，激活才显示）
  const deep = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 2.2), std('void', { color: 0x07040c, roughness: 1, side: THREE.BackSide })); deep.position.set(0, 1.45, FZ - 1.1); root.add(deep);
  const dv = vortex(color, 2.3, 2.8, true); dv.position.set(0, 1.45, FZ - 0.25); dv.name = 'dp_beam'; root.add(dv);
  // 双柱 + 符文（dp_em：未激活灰）
  const emM = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide }); emM.userData.noBake = true;
  for (const sx of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.6, 1.2), warmM()); base.position.set(sx * 1.85, 0.3, FZ); base.castShadow = true; root.add(base);
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.9, 0.95), warmM()); col.position.set(sx * 1.85, 2.0, FZ); col.castShadow = true; root.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.15), stoneM()); cap.position.set(sx * 1.85, 3.55, FZ); root.add(cap);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.7, 0.06), patinaM()); panel.position.set(sx * 1.85, 1.95, FZ + 0.5); root.add(panel);
    const em = new THREE.Group(); em.position.set(sx * 1.85, 1.95, FZ + 0.54);
    const eye = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.17, 12), emM); eye.name = 'dp_em'; em.add(eye);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), emM); dot.name = 'dp_em'; em.add(dot);
    for (const [y, h, rz] of [[0.42, 0.42, 0], [-0.42, 0.42, 0], [0.62, 0.18, 0.7], [0.62, 0.18, -0.7], [-0.62, 0.18, 0.7], [-0.62, 0.18, -0.7]] as const) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.05, h), emM); b.position.set(rz ? Math.sign(rz) * 0.06 : 0, y, 0); b.rotation.z = rz; b.name = 'dp_em'; em.add(b); }
    root.add(em);
    // 挂灯：铁臂 + 灯笼（暖光自发光 + 小光晕，不加点光源）
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), std('iron', { color: 0x2c2a28, metalness: 0.8, roughness: 0.5 })); arm.position.set(sx * 2.65, 2.75, FZ + 0.5); root.add(arm);
    const lan = new THREE.Group(); lan.position.set(sx * 2.95, 2.35, FZ + 0.5);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 6, 1, true), std('iron', { color: 0x2c2a28, metalness: 0.8, roughness: 0.5 })); lan.add(cage);
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.4, 6), glowM(0xffa040, 1.6)); lan.add(fl);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 6), std('iron', { color: 0x2c2a28, metalness: 0.8, roughness: 0.5 })); roof.position.y = 0.36; lan.add(roof);
    if (hd) { const hl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), haloMaterial(0xffa040, 0.55)); hl.material.userData.noBake = true; lan.add(hl); const hl2 = hl.clone(); hl2.rotation.y = Math.PI / 2; lan.add(hl2); }
    root.add(lan);
  }
  const over = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.8, 0.9), stoneM()); over.position.set(0, 3.3, FZ); root.add(over);   // 门洞上方的实墙
  // 门楣 + 三钟山花（中间高、两侧低）
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.55, 1.25), stoneM()); lintel.position.set(0, 3.95, FZ); lintel.castShadow = true; root.add(lintel);
  const gable = (x: number, w: number, h: number, y0: number) => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h * 0.55); sh.lineTo(0, h); sh.lineTo(-w / 2, h * 0.55); sh.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); const iw = w * 0.62, ih = h * 0.72; hole.moveTo(-iw / 2, 0.12); hole.lineTo(iw / 2, 0.12); hole.lineTo(iw / 2, ih * 0.6); hole.lineTo(0, ih); hole.lineTo(-iw / 2, ih * 0.6); hole.lineTo(-iw / 2, 0.12); sh.holes.push(hole);
    const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 }), warmM()); gm.position.set(x, y0, FZ - 0.5); gm.castShadow = true; root.add(gm);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), patinaM()); back.position.set(x, y0 + ih * 0.5, FZ - 0.2); root.add(back);
    const bl = bellMesh(h * 0.34); bl.position.set(x, y0 + ih * 0.78, FZ + 0.05); root.add(bl);
  };
  gable(0, 2.3, 2.1, 4.2); gable(-1.85, 1.35, 1.35, 4.2); gable(1.85, 1.35, 1.35, 4.2);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowM(color, 2)); gem.position.set(0, 4.0, FZ + 0.66); gem.name = 'dp_gem'; root.add(gem);
  // 岩堆：门脸后面和两肩埋进一堆岩石（苔绿顶）
  const rocks: Parameters<typeof rockBatch>[0] = [];
  rocks.push({ x: 0, y: 3.4, z: FZ - 3.1, sx: 3.4, sy: 3.2, sz: 1.5, ry: 0.3 });
  for (const sx of [-1, 1]) { rocks.push({ x: sx * 4.2, y: 1.3, z: FZ - 1.5, sx: 1.4, sy: 1.8, sz: 1.3, ry: R() * 6 }, { x: sx * 2.9, y: 4.6, z: FZ - 1.6, sx: 1.3, sy: 1.1, sz: 1.1, ry: R() * 6 }); }
  if (hd) for (let i = 0; i < (hi ? 10 : 6); i++) { const sx = i % 2 ? 1 : -1, x = sx * (3.2 + R() * 1.3), z = FZ + 1.0 + R() * 2.5, s = 0.3 + R() * 0.5; rocks.push({ x, y: s * 0.3, z, sx: s * 1.3, sy: s, sz: s * 1.2, ry: R() * 6 }); }
  const rb = rockBatch(rocks, R, hd ? 1 : 0, 0x5a6a3a, 0x4a4648); if (rb) root.add(rb);
  // 石板路（门前铺地，低矮）+ 符文盘（dp_glow）+ 光池（dp_pool）
  const slabs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (hd ? 12 : 6); i++) { const b = new THREE.BoxGeometry(0.9 + R() * 0.5, 0.08, 0.7 + R() * 0.4); b.rotateY((R() - 0.5) * 0.3); b.translate((i % 3 - 1) * 1.15 + (R() - 0.5) * 0.2, 0.04, FZ + 0.9 + Math.floor(i / 3) * 0.95); slabs.push(b); }
  const sg = mergeGeometries(slabs, false); slabs.forEach(x => x.dispose()); if (sg) { const m = new THREE.Mesh(sg, stoneM()); m.receiveShadow = true; root.add(m); }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 5.0), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.1, 0.6); plate.name = 'dp_glow'; plate.material.userData.noBake = true; root.add(plate);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), haloMaterial(color, 0.4)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.05, 0); pool.name = 'dp_pool'; pool.material.userData.noBake = true; root.add(pool);
  // 碎骨 / 断柱（中档起）
  if (hd) {
    const skull = new THREE.Group(); skull.position.set(-2.9, 0.18, FZ + 2.0);
    const cr = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), boneM()); cr.scale.set(1, 0.9, 1.15); skull.add(cr);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.16), boneM()); jaw.position.set(0, -0.13, 0.1); skull.add(jaw);
    for (const ex of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), std('blk', { color: 0x110c08 })); eye.position.set(ex, 0.02, 0.22); skull.add(eye); }
    skull.rotation.y = 0.5; root.add(skull);
    for (let i = 0; i < 4; i++) { const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6 + R() * 0.4, 5), boneM()); bn.rotation.set(Math.PI / 2, 0, R() * 3); bn.position.set((i < 2 ? -2.4 : 2.3) + (R() - 0.5) * 0.8, 0.05, FZ + 1.6 + R() * 1.6); root.add(bn); }
    const brk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 1.6, 8), warmM()); brk.position.set(3.4, 0.75, FZ + 1.2); brk.rotation.z = -0.25; brk.castShadow = true; root.add(brk);
  }
  const l = new THREE.PointLight(color, 3, 12); l.position.set(0, 1.8, FZ + 1.4); l.name = 'dp_light'; root.add(l);
  return tag(g);
}
const BELL_PROF = [[0.62, 0], [0.58, 0.07], [0.5, 0.2], [0.42, 0.46], [0.39, 0.78], [0.37, 1.02], [0.32, 1.2], [0.2, 1.31], [0.04, 1.35]].map(([r, y]) => new THREE.Vector2(r, y));
function bellMesh(s: number): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.LatheGeometry(BELL_PROF, curQuality === 'low' ? 10 : 16), bronzeM()); b.position.y = -1.35; b.castShadow = true; g.add(b);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10), bronzeM()); ring.position.y = 0.06; g.add(ring);
  g.scale.setScalar(s); return g;
}

/** 小副本门朝向：朝本图中心（局部原点）方向，按 90° 取整 */
export function dungeonGateFacing(lx: number, lz: number): number {
  const a = Math.atan2(-lx, -lz); return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
}
