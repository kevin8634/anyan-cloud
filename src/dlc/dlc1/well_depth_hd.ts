// 11-04 raidA 场景改造：竖井层次造景（配合 well_terrain.ts 的下降走廊 + 深渊地形）
// 深渊黑水 + 分层深渊雾、崖边不规则碎岩、深渊里拔起的岩柱、井壁两层回廊 + 垂链 + 井壁水帘、三件 Lux3D 地标（悬钟 / 礼拜堂断拱 / 冰封钟楼尖）。
// 全部按画质分级（低档只留黑水 + 碎岩 + 地标），多数用 InstancedMesh 控 draw call。只在 ?scene=new 调用。
import { QL } from '../../web/ql_water_flags';
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { wetStone, quality } from './well_dock_hd';
import { wellEdge, wfbm, WELL_ABYSS, WELL_R, WL_BELL, WELL_ROUTE } from './well_terrain';
import { sceneOr } from './lux_dlc';
import { waterUp, waterBind, rippleNormal } from './water_fx';
import { WELL_FALL_ON, wellFalls, wellFallTick } from './well_falls';   // 11-18 20:06 井壁瀑布（r8 水花移植）   // 11-07 统一水体六条

const offD = (n: string) => { try { return new RegExp('(?:[?&]off=[^&]*\\b' + n + '\\b)').test(location.search); } catch { return false; } };
let seed = 911; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 绝对高度放置：api.add 会把地面高度叠到 y 上，这里先减掉 */
const addAbs = (api: WildBuildApi, o: THREE.Object3D, x: number, z: number, y: number, ry = 0) => { o.position.y += y - api.groundY(x, z); api.add(o, x, z, ry); };

/** 不规则岩块几何：二十面体细分后按噪声推拉顶点（每块再随机缩放 / 旋转，看不出重复） */
function rockGeo(detail = 1, k = 0.38) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = wfbm(v.x * 1.7 + 5, v.z * 1.7 + v.y * 2.3); v.multiplyScalar(1 + (n - 0.5) * 2 * k); v.y *= 0.72; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
/** 径向软边贴图（雾片 / 水帘用） */
function softTex(kind: 'radial' | 'fall') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  if (kind === 'radial') { const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, '#888'); gr.addColorStop(1, '#000'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
  else { for (let i = 0; i < 128; i++) { const a = Math.sin(i / 128 * Math.PI) * (0.55 + 0.45 * Math.sin(i * 0.9) ** 2); x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(i, 0, 1, 128); }
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.15, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

export const depthFx: { fogs: THREE.Mesh[]; falls: THREE.Mesh[]; t: number } = { fogs: [], falls: [], t: 0 };

export function wellDepthHd(api: WildBuildApi) {
  const q = quality(), hi = q === 'high' || q === 'ultra', mid = q !== 'low';
  depthFx.fogs = []; depthFx.falls = []; depthFx.t = 0; leakFx.mats = []; leakFx.motes = null;
  // 1) 深渊黑水：井底一整片深色水面（深渊底 -16，水面 -13）
  const water = new THREE.Mesh(new THREE.CircleGeometry(WELL_R + 4, 96), new THREE.MeshStandardMaterial({ color: 0x03080b, roughness: 0.1, metalness: 0.55, envMapIntensity: 1.1 }));
  water.rotation.x = -Math.PI / 2; addAbs(api, water, 0, 0, WELL_ABYSS + 3);
  { const nm = rippleNormal().clone(); nm.repeat.set(40, 40); nm.needsUpdate = true; const wm = water.material as THREE.MeshStandardMaterial; wm.normalMap = nm; wm.normalScale = new THREE.Vector2(0.35, 0.35);   // 11-07 统一水体：井壁根部一圈白沫 + 深浅 + 菲涅尔
    waterUp(wm, { ql: true, cave: true, r8: true, edge: 'radial', shallow: 0x123034, deep: 0x03080b, sky: 0x6a8898, foamW: 0.05, caus: mid ? 0.12 : 0, speed: 0.6, depth: 8 }, !mid); if (QL.wellR8) water.receiveShadow = true; /* 11-19 Rhett 03:04「钟井撤回 cave 改法，回 r8 原样」：r8 = 撤 cave 本色 / 波速 1.0× / r8 skyRefl / 镜面 / 透明预乘 / 收阴影（?off=wellr8 回 C22） */ water.onBeforeRender = () => { const t = performance.now() / 1000; nm.offset.set(t * 0.006, t * 0.009); }; waterBind(water); }
  // 2) 分层深渊雾：低档 0 层 / 中档 1 层 / 高档 2 层，越往下越浓、越冷
  if (mid) {
    const soft = softTex('radial'), layers: [number, number, number][] = hi ? [[WELL_ABYSS + 5.5, 0.32, 0x1e3a44], [WELL_ABYSS + 11, 0.14, 0x34525a]] : [[WELL_ABYSS + 6, 0.3, 0x1e3a44]];
    for (const [y, a, col] of layers) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(WELL_R, 64), new THREE.MeshBasicMaterial({ color: col, alphaMap: soft, transparent: true, opacity: a, depthWrite: false, fog: true }));
      f.rotation.x = -Math.PI / 2; f.renderOrder = 3; addAbs(api, f, 0, 0, y); depthFx.fogs.push(f);
    }
  }
  // 3) 崖边碎岩：沿可走边缘外 0.4–3 米散一圈不规则岩块（大小不一、半埋），打碎平台轮廓
  const rg = rockGeo(1), stoneM = (() => { const m = wetStone().clone(); m.color = new THREE.Color(0x6e767a); return m; })(), rocks: THREE.Matrix4[] = [], m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e3 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const step = hi ? 2.8 : 3.6;
  for (let z = -WELL_R; z <= WELL_R; z += step) for (let x = -WELL_R; x <= WELL_R; x += step) {
    const jx = x + (rnd() - 0.5) * step, jz = z + (rnd() - 0.5) * step; if (Math.hypot(jx, jz) > WELL_R - 4) continue;
    const e = wellEdge(jx, jz); if (e < 0.4 || e > 3.2 || rnd() < 0.35) continue;
    const s = 0.7 + rnd() * 1.9 * (e > 1.5 ? 1.4 : 1);
    pv.set(jx, api.groundY(jx, jz) - s * 0.35, jz); e3.set((rnd() - 0.5) * 0.8, rnd() * 6.3, (rnd() - 0.5) * 0.8); qt.setFromEuler(e3); sv.set(s * (0.8 + rnd() * 0.6), s * (0.6 + rnd() * 0.7), s * (0.8 + rnd() * 0.6));
    rocks.push(m4.compose(pv, qt, sv).clone());
  }
  if (rocks.length) { const im = new THREE.InstancedMesh(rg, stoneM, rocks.length); rocks.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = true; fixWorld(api, im); }   // 碎岩不投影（几百个实例进阴影图太贵）
  // 4) 深渊岩柱：从井底拔起的高低岩柱（远景层次，顶部比走廊低或略高）
  const pillars: THREE.Matrix4[] = [], pg = rockGeo(2, 0.3); { const p = pg.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.72, t = (y + 1) / 2, k = 1.15 - t * 0.75; p.setXYZ(i, p.getX(i) * k, t, p.getZ(i) * k); } pg.computeVertexNormals(); }   // 不规则岩柱：上细下粗、表面起伏
  for (let n = 0, tries = 0; n < (hi ? 48 : mid ? 30 : 14) && tries < 500; tries++) {
    const a = rnd() * Math.PI * 2, r = 10 + rnd() * (WELL_R - 22), x = Math.cos(a) * r, z = Math.sin(a) * r; if (wellEdge(x, z) < 8) continue;
    const top = WELL_ABYSS + 14 + rnd() * 26, base = WELL_ABYSS - 3, w = 2 + rnd() * 3.2;   // 顶部都在走廊以下（-13…-2），从上往下看是深渊里的一层层石笋
    pillars.push(m4.compose(pv.set(x, base, z), qt.setFromEuler(e3.set((rnd() - 0.5) * 0.15, rnd() * 6, (rnd() - 0.5) * 0.15)), sv.set(w, top - base, w * (0.7 + rnd() * 0.5))).clone()); n++;
  }
  if (pillars.length) { const im = new THREE.InstancedMesh(pg, stoneM, pillars.length); pillars.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; fixWorld(api, im); }
  // 4b) 井壁：一圈不规则岩壁（细分岩块拉高、错落叠放），代替旧版六棱石柱
  { const wg = rockGeo(2, 0.34), per = hi ? 120 : 84, n = per, wm = new THREE.InstancedMesh(wg, stoneM, n);   // v2：井壁两层（下层 −75…−20，上层 −25…+35）
    for (let i = 0; i < n; i++) { const row = i < per ? 0 : 1, a = (i % per) / per * Math.PI * 2 + (rnd() - 0.5) * 0.05, rr = WELL_R - 1 + rnd() * 4, h = 40 + rnd() * 26, w = 8 + rnd() * 5;
      if (row === 1 && Math.abs(a - Math.PI / 2) < 0.12) { wm.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }   // 1107 BUG#2 入口扇区（井口营地 / 回程门 z≈70–78）留口，不挡传送点
      wm.setMatrixAt(i, m4.compose(pv.set(Math.cos(a) * rr, (row ? 4 : -48) + rnd() * 10, Math.sin(a) * rr), qt.setFromEuler(e3.set((rnd() - 0.5) * 0.2, -a, (rnd() - 0.5) * 0.2)), sv.set(w, h, w * 0.8))); }
    wm.receiveShadow = true; fixWorld(api, wm); }
  // 5) 井壁回廊（高档两层、中档一层）：半圈拱廊 + 栏柱，挂在井壁上，给竖井上下的层次
  if (mid && false) {   // 1107 BUG#5 单面回廊板看不见、只剩浮空黑方柱 → 关闭（第 15 条重做砖拱回廊再开）
    const gm = new THREE.MeshStandardMaterial({ color: 0x23292d, roughness: 0.9, metalness: 0.05 }), rail = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6, metalness: 0.6 });
    for (const [y, a0, a1] of (hi ? [[17, 0.4, 3.6], [27, 2.6, 6.0]] : [[19, 0.6, 3.4]]) as [number, number, number][]) {
      const ledge = new THREE.Mesh(new THREE.RingGeometry(66.5, 70.5, 72, 1, a0, a1 - a0), gm); ledge.rotation.x = -Math.PI / 2; addAbs(api, ledge, 0, 0, y);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 6, 0.9), gm, 18), lip = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 5), rail, 36);
      for (let i = 0; i < 18; i++) { const a = a0 + (i + 0.5) / 18 * (a1 - a0); posts.setMatrixAt(i, m4.compose(pv.set(Math.cos(a) * 70, y + 3, -Math.sin(a) * 70), qt.identity(), sv.set(1, 1, 1))); }
      for (let i = 0; i < 36; i++) { const a = a0 + (i + 0.5) / 36 * (a1 - a0); lip.setMatrixAt(i, m4.compose(pv.set(Math.cos(a) * 66.8, y + 0.6, -Math.sin(a) * 66.8), qt.identity(), sv.set(1, 1, 1))); }
      fixWorld(api, posts); fixWorld(api, lip);
    }
  }
  // 6) 垂链：从井口一路垂进深渊的长锁链（不同长度），中档以上
  // 11-18 Rhett「钟井空中漂浮很多晃动的绳子，去掉，重新设计」：垂链去掉 → 深渊魂火（从黑水升起的冷青光点，慢慢上飘、渐隐，加色，不投影；?off=wellmote 回垂链）
  if (mid && !offD('wellmote')) wellMotes(api, hi);
  if (mid && offD('wellmote')) {
    const cm = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.55, metalness: 0.75 }), cg = new THREE.CylinderGeometry(0.09, 0.09, 1, 5); cg.translate(0, -0.5, 0);
    const n = hi ? 16 : 10, ch = new THREE.InstancedMesh(cg, cm, n);
    for (let i = 0, k = 0, tries = 0; k < n && tries < 300; tries++, i++) { const a = rnd() * Math.PI * 2, r = 20 + rnd() * (WELL_R - 30), x = Math.cos(a) * r, z = Math.sin(a) * r; if (wellEdge(x, z) < 4) continue; const top = 60, bot = WELL_ABYSS + 20 + rnd() * 40; ch.setMatrixAt(k++, m4.compose(pv.set(x, top, z), qt.identity(), sv.set(1, top - bot, 1))); }
    ch.userData.dynHang = { len: 1, flex: 0.35 };   // 11-14 dyn_world：长链绕井口挂点慢慢摆（几何从原点向下，长度 = 实例 y 缩放）
    fixWorld(api, ch);
  }
  // 7) 井壁水帘：几道从井壁高处落进深渊的细水（高档动画）
  //   11-18 20:06 换成 well_falls 真瀑布（中档起）；旧水帘贴图往上爬，看着是上冲光条 → 仅 ?off=wellfall 时保留
  if (mid && WELL_FALL_ON) wellFalls(api, hi);
  else if (hi) {
    const ft = softTex('fall'); ft.wrapT = THREE.RepeatWrapping;
    for (const a of [1.1, 2.4, 4.3, 5.4]) {
      const fm = new THREE.MeshBasicMaterial({ color: 0x9fc4cc, map: ft, alphaMap: ft, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: true });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4 + rnd() * 3, 100), fm); f.rotation.y = -a + Math.PI / 2; addAbs(api, f, Math.cos(a) * (WELL_R - 1), Math.sin(a) * (WELL_R - 1), -18); depthFx.falls.push(f);
    }
  }
  // 7b) 11-18 Rhett「黑石的地方加上漏水的瀑布，小流量，分散」：可走平台崖边（黑石崖面）零散细水，从岸沿下方漏出往深渊落（?off=wellleak）
  if (mid && !offD('wellleak')) wellLeaks(api, hi);
  // 8) 地标（Lux3D）：井口悬钟悬在码头西北的深渊上空；礼拜堂断拱立在礼拜堂背后（靠井壁）；冰封钟楼尖半沉在冰湖外沿
  // 11-18 Rhett「中间的钟不要去掉，可以变大；旁边有一个吊笼，里面关着几个人」：悬钟 ×1.6（底沿不动、往上长），旁边吊笼（?off=wellbig 回原大小、无吊笼）
  const BIG = offD('wellbig') ? 1 : 1.6, BH = WL_BELL.h * BIG;
  const bell = sceneOr('scene_wl_well_bell', { h: BH }, () => null) as THREE.Group | null;   // v2：井心悬钟挂在井底沉钟腔正上方，断桥 / 回廊 / 井底都看得到
  if (bell) { const { x, z } = WL_BELL; addAbs(api, bell, x, z, WL_BELL.y, 0.6); if (BIG > 1) prisonCage(api, x, z, BH); const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * BIG, 0.22 * BIG, 60 - WL_BELL.y - BH, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a20, metalness: 0.7, roughness: 0.5 })); addAbs(api, cm, x, z, (60 + WL_BELL.y + BH) / 2); }
  const arch = sceneOr('scene_wl_chapel_arch', { h: 11 }, () => null) as THREE.Group | null;
  // 11-18 Rhett「门的位置也不对了」：断拱原立在礼拜堂背后井壁前（-106,-6），斜在冰窟入口左侧、不对洞口 → 挪到冰窟入口（主路礼拜堂→冰窟第一段起点内 2.5 米），拱面横跨路面、朝路线方向（?off=wellarch 回旧位）
  const archOld = /(?:[?&]off=[^&]*\bwellarch\b)/.test(location.search);
  if (arch) {
    if (archOld) addAbs(api, arch, -106, -6, -0.4, Math.PI / 2);
    else { const ci = WELL_ROUTE.findIndex((r, i) => i > 0 && r.k === 'cave'), A = WELL_ROUTE[ci - 1], B = WELL_ROUTE[ci], dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1], L = Math.hypot(dx, dz);
      // 11-18 16:03 Rhett「门位置不对」：原放首领点后 2.5 米 = 落在萨琳礼拜堂平台中间 → 改到路线离开礼拜堂平台（中心 -90,6，半径 17）处 = 冰窟口（?off=wellarch2 回 2.5 米版）
      let t = 2.5 / L; if (!/(?:[?&]off=[^&]*\bwellarch2\b)/.test(location.search)) { for (let u = 0; u <= 1; u += 0.01) { if (Math.hypot(A.p[0] + dx * u + 90, A.p[1] + dz * u - 6) >= 16.5) { t = u; break; } } }
      addAbs(api, arch, A.p[0] + dx * t, A.p[1] + dz * t, A.h + (B.h - A.h) * t - 0.4, Math.atan2(dx, dz)); }
  }
  const spire = sceneOr('scene_wl_frozen_spire', { h: 13 }, () => null) as THREE.Group | null;
  if (spire) {
    spire.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh && me.name.endsWith('.ice')) { const m = (me.material as THREE.MeshStandardMaterial).clone(); m.transparent = true; m.opacity = 0.72; m.roughness = 0.08; m.metalness = 0.05; m.depthWrite = false; me.material = m; me.renderOrder = 2; me.castShadow = false; } });
    spire.rotation.z = 0.2; addAbs(api, spire, -18, -112, -16, -0.4);   // 1107 BUG#13 移进冰湖（原 (-2,-56) 在湖外深渊上方），下埋 + 斜插约 11°
  }
}
// ---------------------------------------------------------------- 11-18 深渊魂火 / 漏水 / 吊笼
const leakFx: { mats: THREE.MeshBasicMaterial[]; motes: THREE.Points | null; mU: { uT: { value: number } } } = { mats: [], motes: null, mU: { uT: { value: 0 } } };
function wellMotes(api: WildBuildApi, hi: boolean) {
  const N = hi ? 420 : 220, pos = new Float32Array(N * 3), sd = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * (WELL_R - 14), x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.set([x, WELL_ABYSS + 3, z], i * 3); sd.set([rnd(), 0.6 + rnd() * 1.2], i * 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
  const m = new THREE.ShaderMaterial({ uniforms: { uT: leakFx.mU.uT, uCol: { value: new THREE.Color(0x7fe8ff) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 sd; uniform float uT; varying float vA;
void main() { float life = 26.0 / sd.y, ph = fract( uT / life + sd.x ); vec3 p = position;
  p.y += ph * 70.0; p.x += sin( uT * 0.3 + sd.x * 40.0 ) * 2.5 * ph; p.z += cos( uT * 0.27 + sd.x * 31.0 ) * 2.5 * ph;
  vA = smoothstep( 0.0, 0.12, ph ) * ( 1.0 - smoothstep( 0.55, 1.0, ph ) ) * ( 0.55 + 0.45 * sin( uT * 3.0 + sd.x * 60.0 ) );
  vec4 mv = modelViewMatrix * vec4( p, 1.0 ); gl_Position = projectionMatrix * mv; gl_PointSize = clamp( 260.0 * ( 0.12 + 0.1 * sd.y ) / - mv.z, 1.5, 9.0 ); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
void main() { vec2 c = gl_PointCoord - 0.5; float d = dot( c, c ) * 4.0; float a = exp( - d * 3.5 ) * vA; if ( a < 0.01 ) discard; gl_FragColor = vec4( uCol * a * 1.6, a ); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3; leakFx.motes = pts; fixWorld(api, pts);
}
function leakTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d')!;
  for (let k = 0; k < 9; k++) { const cx = 4 + rnd() * 24, w = 0.8 + rnd() * 2; for (let y = 0; y < 128; y += 2) { x.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.6).toFixed(2)})`; x.fillRect(cx + Math.sin(y * 0.2 + k) * 0.6, y, w, 2 + rnd() * 5); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function leakAlpha() {   // 横向细软边 × 纵向上实下渐隐（不随流动滚）
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d')!, im = x.createImageData(32, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 32; i++) { const ex = Math.sin(Math.PI * (i + 0.5) / 32), v = 1 - j / 127, a = ex * ex * Math.pow(v, 1.3); const o = (j * 32 + i) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = Math.round(a * 255); im.data[o + 3] = 255; }
  x.putImageData(im, 0, 0); return new THREE.CanvasTexture(c);
}
function wellLeaks(api: WildBuildApi, hi: boolean) {
  const sites: [number, number, number, number, number][] = [], minD = hi ? 11 : 15, cap = hi ? 46 : 28;
  for (let tries = 0; tries < 4000 && sites.length < cap; tries++) {
    const a = rnd() * Math.PI * 2, r = rnd() * (WELL_R - 8), x = Math.cos(a) * r, z = Math.sin(a) * r, e = wellEdge(x, z); if (e < 0.6 || e > 1.6) continue;
    if (sites.some(s => Math.hypot(s[0] - x, s[1] - z) < minD)) continue;
    let bx = 0, bz = 0, best = 9; for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2, sx = x + Math.cos(t) * 2.2, sz = z + Math.sin(t) * 2.2, se = wellEdge(sx, sz); if (se < best) { best = se; bx = Math.cos(t); bz = Math.sin(t); } }
    if (best > 0.3) continue;
    const top = api.groundY(x - bx * 1.6, z - bz * 1.6) - 0.35; if (top < WELL_ABYSS + 20) continue;
    sites.push([x, z, top, -bx, -bz]);
  }
  if (!sites.length) return;
  const map = leakTex(), alpha = leakAlpha(), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const [x, z, top, ox, oz] of sites) {
    const n = 1 + Math.floor(rnd() * 3), tx = -oz, tz = ox;
    for (let k = 0; k < n; k++) {
      const off = (rnd() - 0.5) * 2.4, w = 0.18 + rnd() * 0.42, L = 5 + rnd() * 16, u0 = rnd();
      const px = x + tx * off + ox * 0.2, pz = z + tz * off + oz * 0.2, y0 = top - rnd() * 0.6, b = pos.length / 3;
      const bend = 0.6 + rnd() * 0.8;   // 下段离崖面稍外抛
      for (const [s, v, y, out] of [[-1, 1, y0, 0], [1, 1, y0, 0], [-1, 0, y0 - L, bend], [1, 0, y0 - L, bend]] as const) {
        pos.push(px + tx * s * w / 2 + ox * out, y, pz + tz * s * w / 2 + oz * out); uv.push(u0 + (s + 1) * 0.12, v * L / 6);
      }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  // alphaMap 用第二套 uv：竖向 0..1 = 底..顶（不滚动）
  const uv2: number[] = []; for (let i = 0; i < uv.length; i += 2) uv2.push(i % 4 === 0 ? 0 : 1, (i / 2) % 4 < 2 ? 1 : 0); g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv2, 2));
  alpha.channel = 1;
  const m = new THREE.MeshBasicMaterial({ color: 0xa8d0d8, map, alphaMap: alpha, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: true });
  leakFx.mats.push(m); const me = new THREE.Mesh(g, m); me.renderOrder = 2; fixWorld(api, me);
}
/** 悬钟旁吊笼：Lux3D 钟笼件（没有就程序化铁笼）挂在钟侧，里面 3–4 个蜷缩 / 抓栏的囚徒（程序化低模，破布色） */
function prisonCage(api: WildBuildApi, bx: number, bz: number, bh: number) {
  const ang = 2.2, cx = bx + Math.cos(ang) * (bh * 0.55 + 4.5), cz = bz + Math.sin(ang) * (bh * 0.55 + 4.5), y = WL_BELL.y + bh * 0.55;
  const g = new THREE.Group(), iron = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.8, roughness: 0.45 });
  const lux = sceneOr('scene_wl_bell_cage', { h: 4.2 }, () => null) as THREE.Group | null;
  if (lux) g.add(lux);
  else {
    const R = 1.6, H = 3.6, barG = new THREE.CylinderGeometry(0.05, 0.05, H, 5);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = new THREE.Mesh(barG, iron); b.position.set(Math.cos(a) * R, H / 2, Math.sin(a) * R); g.add(b); }
    for (const yy of [0.05, H]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 6, 32), iron); ring.rotation.x = Math.PI / 2; ring.position.y = yy; g.add(ring); }
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 24), iron); floor.position.y = 0.05; g.add(floor);
    const dome = new THREE.Mesh(new THREE.ConeGeometry(R * 1.05, 1.0, 16, 1, true), iron); dome.position.y = H + 0.5; g.add(dome);
  }
  const cloth = [0x4a4238, 0x3c3a36, 0x5a4a3a, 0x403830].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })), skin = new THREE.MeshStandardMaterial({ color: 0x8a7464, roughness: 0.8 });
  const poses: [number, number, number, number][] = [[-0.6, 0.4, 0.2, 0], [0.7, -0.3, 1.9, 1], [0.1, 0.8, 3.6, 2], [-0.4, -0.7, 5.0, 1]];   // x, z, 朝向, 0 坐 / 1 蹲 / 2 站抓栏
  for (let i = 0; i < poses.length; i++) {
    const [px, pz, ry, kind] = poses[i], p = new THREE.Group(), cm = cloth[i % cloth.length];
    const hgt = kind === 2 ? 1.0 : kind === 1 ? 0.62 : 0.5;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, hgt * 0.7, 4, 8), cm); body.position.y = hgt * 0.55 + 0.1; body.rotation.x = kind === 2 ? 0.05 : 0.45; p.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); head.position.set(0, hgt + 0.32 - (kind ? 0 : 0.05), kind === 2 ? 0.02 : 0.2); p.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cm); hood.position.copy(head.position); hood.position.y += 0.02; p.add(hood);
    for (const s of [-1, 1]) {   // 手臂：站着的抬手抓栏，其余抱膝
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 3, 6), cm);
      if (kind === 2) { arm.position.set(s * 0.22, hgt + 0.25, 0.25); arm.rotation.x = -1.1; } else { arm.position.set(s * 0.18, hgt * 0.5 + 0.2, 0.22); arm.rotation.x = 1.2; }
      p.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, kind === 2 ? 0.5 : 0.4, 3, 6), cm);
      if (kind === 2) leg.position.set(s * 0.1, 0.35, 0); else { leg.position.set(s * 0.12, 0.25, 0.25); leg.rotation.x = kind === 1 ? 0.6 : 1.4; }
      p.add(leg);
    }
    p.position.set(px, 0.1, pz); p.rotation.y = ry; p.traverse(o => { (o as THREE.Mesh).castShadow = true; }); g.add(p);
  }
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 60 - y - 4.6, 6), iron); chain.position.y = 4.6 + (60 - y - 4.6) / 2; g.add(chain);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff9a40, emissiveIntensity: 3 })); lamp.position.set(0.9, 3.3, 0); g.add(lamp);   // 笼顶挂一盏昏暗鱼油灯（只自发光，不加实时点光，不改全图灯数）
  addAbs(api, g, cx, cz, y, ang);
}
export function wellLeakTick(dt: number) { leakFx.mU.uT.value += dt; for (const m of leakFx.mats) if (m.map) m.map.offset.y = (m.map.offset.y + dt * 1.1) % 1; }
/** InstancedMesh 的实例矩阵已是局部绝对坐标：放在区域原点、抵消 api.add 的地面高度 */
function fixWorld(api: WildBuildApi, im: THREE.Object3D) { im.position.set(0, -api.groundY(0, 0), 0); api.add(im, 0, 0); im.frustumCulled = false; }

export function wellDepthTick(dt: number) {
  depthFx.t += dt; wellLeakTick(dt); wellFallTick(dt);
  for (let i = 0; i < depthFx.fogs.length; i++) depthFx.fogs[i].rotation.z = depthFx.t * (i ? -0.006 : 0.009);
  const f0 = depthFx.falls[0], m = f0 ? (f0.material as THREE.MeshBasicMaterial).map : null; if (m) m.offset.y = (m.offset.y - dt * 0.6) % 1;   // 四道水帘共用一张贴图
}
