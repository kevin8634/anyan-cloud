// ======================================================================
// 11-14 无声钟楼 · 环形山盆地（Rhett「参考安戈洛环形山」，规格 场景升级规格_1114.md 第一节）
// 地形：外圈环形山脊（南侧山口 = 营地）、内侧阶梯台地向中心下沉、抉择之钟在中央石岬、钟楼立在西北高台
// 五层守钟者不再画地面圆圈 → 各自一块平整「房间」地形 + 主题布景（铸钟台 / 缄默堂 / 断绳廊 / 金沙厅 / 沉眠者之门）
// 全部程序生成：几何 + 少量自带着色器；不加真点光（除原有抉择之钟两盏）；低档少放
// ======================================================================
import * as THREE from 'three';
import { sceneOr } from './lux_dlc';
import { bellGeo } from './models_bt';
import { waterUp, waterBind, rippleNormal } from './water_fx';

// ---------------------------------------------------------------- 地形
const sm = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number) => vn(x, z) * 0.55 + vn(x * 2.03, z * 2.03) * 0.3 + vn(x * 4.1, z * 4.1) * 0.15;

/** 11-14b Rhett「面积 ×2、多不规则地形、非必要不做规则圆」：区域 half 90 → 128（面积约 ×2），
 *  全部布局点集中在 BT_L（belltower.ts / forge.ts / voice.ts 都从这里取），山脊、台地、场地边缘都按角度噪声变形 */
export const BT_HALF = 128;
export const BT_L = {
  camp: { x: 4, z: 92 }, waypoint: { x: 11, z: 97 }, mirrorGate: { x: 4, z: 121 }, mirrorArrive: { x: 4, z: 114 },
  forgeGate: { x: -46, z: 74 }, tower: { x: -72, z: -88 },
  b1: { x: -6, z: 46 }, b2: { x: -62, z: 14 }, b3: { x: 66, z: 2 }, b4: { x: 8, z: -18 },
  cross: { x: -4, z: -52 }, b5: { x: 6, z: -80 }, sleeper: { x: 8, z: -101 },
  soul1: { x: -88, z: -38 }, soul2: { x: 86, z: -48 }, soul3: { x: 50, z: -98 },
  wreck: { x: 80, z: 30 },
};
/** 盆地中心（局部） */
export const BASIN_C = { x: 0, z: -10 };
/** 平整「房间」：R = 平地半径（按角度噪声只会外扩到 ×1.3，不会缩），F = 过渡带宽，H = 地面高度（米，相对区域基准）。顺序 = 叠加顺序（后者覆盖前者）
 *  坡度自查：过渡带最陡 ≈ 1.5·|ΔH|/F，全部 < 32°（MAX_WALK_SLOPE）；钟楼高台故意陡（崖壁，不可走） */
const L_ = BT_L;
export const BT_FLATS: { id: string; x: number; z: number; R: number; F: number; H: number }[] = [
  { id: 'camp', ...L_.camp, R: 17, F: 14, H: 3.4 },        // 南侧山口营地：比盆地高，进图先俯瞰
  { id: 'b1', ...L_.b1, R: 12, F: 11, H: 0.4 },            // 铸钟台
  { id: 'b2', ...L_.b2, R: 12, F: 11, H: -2.6 },           // 缄默堂
  { id: 'b3', ...L_.b3, R: 11, F: 9, H: 2.2 },             // 断绳廊（东侧崖边）
  { id: 'b4', ...L_.b4, R: 11, F: 9, H: -3.4 },            // 金沙厅（盆地最低）
  { id: 'b5', ...L_.b5, R: 11, F: 8, H: 1.2 },             // 沉眠者之门
  { id: 'sleeper', ...L_.sleeper, R: 12, F: 7, H: 1.2 },   // 沉眠者地窖（裂谷入口，与 b5 相连）
  { id: 'cross', ...L_.cross, R: 5, F: 16, H: 2.4 },       // 抉择之钟：中央石岬
  { id: 'soul1', ...L_.soul1, R: 4.5, F: 7, H: 0.2 }, { id: 'soul2', ...L_.soul2, R: 4.5, F: 7, H: 1.2 }, { id: 'soul3', ...L_.soul3, R: 4.5, F: 7, H: 0.8 },
  { id: 'forge', ...L_.forgeGate, R: 6, F: 8, H: 2.4 },    // 钟铜熔炉门
];
/** 钟楼高台（西北，崖壁） */
const TOWER = { ...L_.tower, R: 18, F: 5, H: 9 };
/** 角度噪声：0..1，周期 2π，k 控制起伏个数 */
const angN = (th: number, k: number, sd: number) => vn(Math.cos(th) * k + sd, Math.sin(th) * k + sd * 1.7);
/** 场地的不规则半径：只外扩（0..+30%） */
const flatR = (f: { x: number; z: number; R: number }, x: number, z: number) => f.R * (1 + 0.3 * angN(Math.atan2(x - f.x, z - f.z), 1.6, f.x * 0.013 + f.z * 0.007));
/** 山脊内沿半径（随角度起伏 84–112 米，东北鼓出、西南收进，不是正圆） */
const FLAT_POLAR = () => BT_FLATS.map(f => ({ th: Math.atan2(f.x - BASIN_C.x, f.z - BASIN_C.z), r: Math.hypot(f.x - BASIN_C.x, f.z - BASIN_C.z) + f.R * 1.3 + f.F + 6 }));
let _fp: ReturnType<typeof FLAT_POLAR> | null = null;
export function rimR(th: number) {
  let R = 78 + 30 * angN(th, 1.1, 4.1) + 12 * angN(th, 3.2, 9.3) + 7 * Math.sin(th - 0.9);
  for (const p of (_fp ??= FLAT_POLAR())) { const d = Math.atan2(Math.sin(th - p.th), Math.cos(th - p.th)); R = Math.max(R, p.r * Math.exp(-(d * d) / 0.05)); }   // 场地外沿至少留 6 米再起山
  return R;
}
/** 盆地里的石丘 / 断崖台（不规则起伏，避开场地和主路由 btGround 里的平地 / 坡道压平） */
const KNOLLS: [number, number, number, number][] = [[-30, 70, 9, 4.5], [36, 64, 11, 5], [-40, -10, 10, 5.5], [34, -30, 8, 4], [-30, -80, 10, 6], [56, 40, 8, 3.5], [-84, 40, 12, 6], [90, -10, 9, 4.5], [-16, 18, 7, 3], [30, -64, 7, 3.5], [-58, -56, 9, 4]];
const knolls = (x: number, z: number) => { let h = 0; for (const [kx, kz, r, kh] of KNOLLS) { const d = Math.hypot(x - kx, z - kz) / (r * (0.75 + 0.5 * fbm(x * 0.08 + kx, z * 0.08))); if (d < 1.6) h += kh * Math.exp(-d * d * 1.6) * (0.7 + 0.6 * fbm(x * 0.15, z * 0.15 + kz)); } return h; };

/** 盆地碗 + 阶梯台地（不含平地 / 山脊）；台阶高度也随位置噪声，台沿不是同心圆 */
function bowl(x: number, z: number) {
  const dx = x - BASIN_C.x, dz = z - BASIN_C.z, r = Math.hypot(dx, dz), Rr = rimR(Math.atan2(dx, dz));
  const b = -9 * (1 - sm(r / (Rr - 4))) + (fbm(x * 0.03 + 3, z * 0.03) - 0.5) * 3.2;
  const s = 1.5, q = b / s + (fbm(x * 0.02 - 5, z * 0.02 + 2) - 0.5) * 0.9, f = q - Math.floor(q);
  return s * (Math.floor(q) + sm((f - 0.62) / 0.38)) + knolls(x, z);   // 台阶：每 1.5 米一级，台面占 62%；石丘叠在台阶之后（不出同心圈）
}
/** 外圈山脊：内沿半径 rimR(θ) 起隆起，南侧（营地山口 + 镜渊城阶梯）留出口，东北、西两处半低的断口；顶部碎峰 */
function ridge(x: number, z: number) {
  const dx = x - BASIN_C.x, dz = z - BASIN_C.z, r = Math.hypot(dx, dz), th = Math.atan2(dx, dz), R0 = rimR(th);   // th 0 = 正南（+z）
  if (r < R0) return 0;
  const gap = (a: number, w: number, depth: number) => 1 - depth * Math.exp(-((Math.atan2(Math.sin(th - a), Math.cos(th - a))) ** 2) / (w * w));
  const k = gap(0.04, 0.17, 1) * gap(Math.PI / 2 + 0.55, 0.11, 0.55) * gap(-Math.PI / 2 - 0.25, 0.09, 0.62);
  const peaks = 11 + fbm(x * 0.045 + 7, z * 0.045) * 13 + Math.max(0, fbm(x * 0.12, z * 0.12 - 3) - 0.55) * 16;
  return sm((r - R0) / (12 + 16 * angN(th, 2.2, 1.3))) * peaks * k;
}
/** 坡道：两块平地之间沿路线的直坡（宽 W 平、两侧 S 米收边），保证主路 < 25° */
const RAMPS: [string, string][] = [['camp', 'b1'], ['b1', 'b4'], ['b1', 'b2'], ['b1', 'b3'], ['b4', 'cross'], ['cross', 'b5'], ['b5', 'sleeper'], ['b2', 'soul1'], ['b3', 'soul2'], ['b5', 'soul3'], ['camp', 'forge'], ['b2', 'cross'], ['b3', 'b4']];
const RW = 4, RS = 10;
function rampH(x: number, z: number, h: number) {
  for (const [ia, ib] of RAMPS) {
    const A = BT_FLATS.find(f => f.id === ia)!, B = BT_FLATS.find(f => f.id === ib)!;
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const along = (x - A.x) * ux + (z - A.z) * uz, side = Math.abs(-(x - A.x) * uz + (z - A.z) * ux);
    const a0 = A.R + 1.5, a1 = L - B.R - 1.5; if (a1 - a0 < 1 || along < a0 - RS || along > a1 + RS || side > RW + RS) continue;
    const t = Math.max(0, Math.min(1, (along - a0) / (a1 - a0))), y = A.H + (B.H - A.H) * t;
    const k = (1 - sm((side - RW) / RS)) * (1 - sm((a0 - along) / RS)) * (1 - sm((along - a1) / RS));
    h += (y - h) * k;
  }
  return h;
}
/** 11-16 Rhett「钟楼盆地改成真湖」：盆底低于 LV 的洼地注水成湖，湖底压平到水下 bed 米（可涉水，不游泳）。
 *  11-17 Rhett「湖太浅，再深一倍」：bed 0.62 → 1.24（齐腰；岸线 y 不变，传送点 / 营地 / 五层场地都在湖面 0.8 米以上）。
 *  ?off=btlake 回旧版（只有雾层）。玩法场地都高于湖面（金沙厅 −3.4 最低），坡道不受影响。 */
export const BT_LAKE = { on: !(typeof location !== 'undefined' && /[?&]off=[^&]*btlake/.test(location.search)), y: -4.2, bed: (typeof location !== 'undefined' && /[?&]off=[^&]*btdeep/.test(location.search)) ? 1.24 : 2.48 };   // 11-18 Rhett「无声钟楼的水再深一倍」1.24 → 2.48（?off=btdeep 回 1.24）
export function btGround(x: number, z: number) {
  const corr = z > 84 ? sm((Math.abs(x - L_.camp.x) - 8) / 7) : 1;   // 南出口走廊（营地 → 镜渊城阶梯）：不让山脊压住
  let h = bowl(x, z) + ridge(x, z) * corr;
  for (const f of BT_FLATS) { const d = Math.hypot(x - f.x, z - f.z), R = flatR(f, x, z); if (d < R + f.F) h += (f.H - h) * sm((R + f.F - d) / f.F); }
  h = rampH(x, z, h);
  for (const f of BT_FLATS) { const d = Math.hypot(x - f.x, z - f.z), R = flatR(f, x, z); if (d < R + 1.5) h += (f.H - h) * sm((R + 1.5 - d) / 1.5); }   // 平地本身最后再压一次（坡道收边不啃进场地）
  const dt = Math.hypot(x - TOWER.x, z - TOWER.z), TR = TOWER.R * (0.85 + 0.55 * angN(Math.atan2(x - TOWER.x, z - TOWER.z), 2.4, 2.2) + 0.25 * fbm(x * 0.09, z * 0.09)); if (dt < TR + TOWER.F) h += (TOWER.H + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.6 - h) * sm((TR + TOWER.F - dt) / TOWER.F);
  if (BT_LAKE.on && h < BT_LAKE.y - BT_LAKE.bed + 0.5) {   // 湖底：深坑抬平到齐腰（11-17 ×2；带一点起伏，不是镜面平板；软 max 0.5 米，台阶沿不再起硬棱）
    const dx = x - BASIN_C.x, dz = z - BASIN_C.z;
    if (Math.hypot(dx, dz) < rimR(Math.atan2(dx, dz)) - 6) { const t = BT_LAKE.y - BT_LAKE.bed + (fbm(x * 0.15 + 9, z * 0.15) - 0.5) * 0.2, k = Math.max(0.5 - Math.abs(h - t), 0) / 0.5; h = Math.max(h, t) + k * k * 0.125; }
  }
  return h;
}
/** 湖水深度（局部；≤0 = 岸上） */
export const btLakeDepth = (x: number, z: number) => BT_LAKE.on ? BT_LAKE.y - btGround(x, z) : -1;

// ---------------------------------------------------------------- 材质
const stone = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true });
const bronze = (c = 0x6a5226) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.45 });
const verdigris = () => new THREE.MeshStandardMaterial({ color: 0x3f7a6a, metalness: 0.35, roughness: 0.7 });
const glow = (c: number, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1, blending: o < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
const add = (g: THREE.Object3D, m: THREE.Object3D, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
const cs = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };
let seed = 91; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 熔渣坑（自带流动着色器：暗壳 + 裂缝里的橙光，不加真光） */
function slagMat() {
  const m = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } }, toneMapped: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float t; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 p = vP*0.55; float a = n(p+vec2(t*.05,0.)) * .6 + n(p*2.3-vec2(0.,t*.08)) * .4;
        float crack = smoothstep(.55,.5,abs(a-.5)*2.); float r = length(vP)/1.0;
        vec3 crust = vec3(.05,.035,.03), hot = vec3(2.4,.75,.18);
        gl_FragColor = vec4(mix(crust, hot, pow(crack,3.)*(.55+.45*sin(t*1.3+a*9.))), 1.); }`,
  });
  m.onBeforeCompile = () => {};
  return m;
}
const tickers: { u: { value: number } }[] = [];
const tick = (o: THREE.Object3D, u: { value: number }) => { tickers.push({ u }); o.onBeforeRender = () => { u.value = performance.now() / 1000; }; };

// ---------------------------------------------------------------- 各层「房间」
/** 第一层 · 铸钟台：熔渣坑 + 三口倒扣的铸模 + 倾倒的坩埚 */
function roomForge(R: number): THREE.Group {
  const g = new THREE.Group(), st = stone(0x2c2a2a);
  const sm1 = slagMat(), pit = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), sm1); pit.rotation.x = -Math.PI / 2; pit.scale.set(1, 0.7, 1); add(g, pit, R * 0.62, 0.06, -R * 0.35); tick(pit, sm1.uniforms.t);
  const rim = cs(new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.35, 5, 20), st)); rim.rotation.x = -Math.PI / 2; rim.scale.set(1, 0.7, 1); add(g, rim, R * 0.62, 0.15, -R * 0.35);
  for (let i = 0; i < 3; i++) {
    const a = 2.2 + i * 0.8, mold = cs(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 2.6, 10, 1, true), stone(0x3a302a)));
    (mold.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; add(g, mold, Math.cos(a) * (R + 0.4), 1.2, Math.sin(a) * (R + 0.4));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 2.2, 10), stone(0x1c1816)); add(g, core, Math.cos(a) * (R + 0.4), 1.1, Math.sin(a) * (R + 0.4));
  }
  const cru = cs(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.9, 1.8, 10, 1, true), bronze(0x4a3a2a))); (cru.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  cru.rotation.z = 1.0; add(g, cru, R * 0.62 + 2.6, 2.4, -R * 0.35 - 1.6);
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6), glow(0xff8030)); add(g, pour, R * 0.62 + 1.6, 1.2, -R * 0.35 - 1.6);
  return g;
}
/** 第二层 · 缄默堂：倒塌回廊柱林（一圈柱子高低不一，几根倒伏） */
function roomCloister(R: number): THREE.Group {
  const g = new THREE.Group(), st = stone(0x3a3c44);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + 0.2, h = k % 3 === 0 ? 1.4 + rnd() * 1.5 : 5 + rnd() * 3, r = R + 0.8;
    const c = cs(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, h, 8), st)); add(g, c, Math.cos(a) * r, h / 2, Math.sin(a) * r);
    if (h > 4) { const cap = cs(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.5), st)); add(g, cap, Math.cos(a) * r, h + 0.2, Math.sin(a) * r); }
    if (k % 3 === 0) { const f = cs(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 5.5, 8), st)); f.rotation.z = Math.PI / 2; f.rotation.y = a + 1.2; add(g, f, Math.cos(a) * (r + 3.2), 0.45, Math.sin(a) * (r + 3.2)); }
  }
  // 残存的拱梁（两段）
  for (const a of [0.9, 3.8]) { const b = cs(new THREE.Mesh(new THREE.BoxGeometry(6, 0.7, 1.1), st)); b.rotation.y = -a; add(g, b, Math.cos(a) * (R + 0.8), 7.4, Math.sin(a) * (R + 0.8)); }
  return g;
}
/** 第三层 · 断绳廊：东侧崖边的绞架 + 垂下的断绳 + 断栏 */
function roomRopes(R: number): THREE.Group {
  const g = new THREE.Group(), wood = stone(0x3a2a20, 0.8), rope = new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.9 });
  for (let k = 0; k < 4; k++) {
    const a = -0.9 + k * 0.6, x = Math.cos(a) * (R + 1), z = Math.sin(a) * (R + 1);
    const p1 = cs(new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), wood)); add(g, p1, x, 4.5, z);
    const arm = cs(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.4), wood)); arm.rotation.y = -a; add(g, arm, x - Math.cos(a) * 1.5, 8.8, z - Math.sin(a) * 1.5);
    for (let j = 0; j < 3; j++) { const L = 3 + rnd() * 4.5; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 4), rope); r.position.y = -L / 2; const hp = new THREE.Group(); hp.userData.dynHang = { len: L, flex: 0.8 }; hp.add(r); add(g, hp, x - Math.cos(a) * (0.8 + j), 8.6, z - Math.sin(a) * (0.8 + j)); }   // 11-14 dyn_world：断绳绕挂点摆，人走到下面会被碰晃
  }
  for (let k = 0; k < 9; k++) { const a = -1.2 + k * 0.3; if (k === 4) continue; const p = cs(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), wood)); add(g, p, Math.cos(a) * (R + 2.5), 0.55, Math.sin(a) * (R + 2.5)); }
  return g;
}
/** 第四层 · 金沙厅：金沙地 + 半埋的倒伏铜钟 */
function roomSand(R: number): THREE.Group {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CircleGeometry(R + 1.5, 40), new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.95, metalness: 0.1, emissive: 0x2a1a06, emissiveIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true; add(g, sand, 0, 0.04, 0);
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = R * 0.3 + rnd() * R; const d = cs(new THREE.Mesh(new THREE.SphereGeometry(1 + rnd() * 1.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a7838, roughness: 1, flatShading: true }))); d.scale.y = 0.3; add(g, d, Math.cos(a) * r, -0.05, Math.sin(a) * r); }
  // 11-14d Rhett：倒伏铜钟改用已有模型 scene_bell（低画质回退原程序钟）
  const glb = sceneOr('scene_bell', { w: 8.5 }, () => null);
  if (glb) { glb.rotation.y = 0.6; add(g, glb, -R - 1.5, -0.6, R * 0.3); }
  else { const bell = cs(new THREE.Mesh(bellGeo(3.2, 5.2, 24), bronze(0x7a5a24))); (bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    bell.rotation.set(0.2, 0.6, 1.35); add(g, bell, -R - 1.5, 1.6, R * 0.3); }
  return g;
}
/** 第五层 · 沉眠者之门：两块巨石碑夹一道赤色裂隙 */
function roomGate(R: number): THREE.Group {
  const g = new THREE.Group(), st = stone(0x1e1c22);
  for (const s of [-1, 1]) { const m = cs(new THREE.Mesh(new THREE.BoxGeometry(3, 14, 2.2), st)); m.rotation.z = s * -0.08; add(g, m, s * 4.6, 6.6, -R - 2); }
  const lintel = cs(new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 2.4), st)); lintel.rotation.z = 0.05; add(g, lintel, 0, 13.6, -R - 2);
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 12), glow(0xff2a30, 0.55)); add(g, rift, 0, 6.2, -R - 1.7);
  return g;
}
/** 沉眠者地窖：地面赤 / 青双色裂纹 + 碎石棺 */
function roomCrypt(R: number): THREE.Group {
  const g = new THREE.Group(), st = stone(0x26242a);
  for (let i = 0; i < 16; i++) { const a = rnd() * 6.28, L = 2 + rnd() * 5; const c = new THREE.Mesh(new THREE.PlaneGeometry(0.16, L), glow(i % 2 ? 0x40d0e0 : 0xff3040, 0.7)); c.rotation.x = -Math.PI / 2; c.rotation.z = a; add(g, c, Math.cos(a + 1) * rnd() * R, 0.07, Math.sin(a + 1) * rnd() * R); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.4; const s = cs(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 3.2), st)); s.rotation.y = a + (rnd() - 0.5); s.rotation.z = (rnd() - 0.5) * 0.3; add(g, s, Math.cos(a) * (R + 1.5), 0.4, Math.sin(a) * (R + 1.5)); }
  return g;
}
export const BT_ROOMS: Record<string, (R: number) => THREE.Group> = { b1: roomForge, b2: roomCloister, b3: roomRopes, b4: roomSand, b5: roomGate, sleeper: roomCrypt };

// ---------------------------------------------------------------- 盆地布景
/** 盆地底部浅雾层（一张大平面，自带着色器：噪声团 + 边缘淡出，跟时间缓慢漂移） */
export function basinMist(): THREE.Mesh {
  const u = { t: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 1, 1), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float t; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 p = vP*0.035; float a = n(p+vec2(t*.012,t*.007))*.6 + n(p*2.7-vec2(t*.02,0.))*.4;
        float edge = 1. - smoothstep(66., 102., length(vP));
        gl_FragColor = vec4(vec3(.42,.46,.58), smoothstep(.35,.85,a) * .32 * edge); }`,
  }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2; tick(m, u.t);
  return m;
}
/** 11-16 湖面：按 btGround 采样出岸线遮罩（alphaMap.g = 水深 0→bed 映射 0→1），统一水体 waterUp（深浅变色 / 菲涅耳 / 岸沫 / 焦散 / 涟漪环）。
 *  11-17 v2：depth = bed 米 → 吸收按真实水深（浅滩透出湖底、齐腰处墨青）；refl → 中 / 高档平面倒影（低档仍是天空 + 岸色兜底）。
 *  返回 { mesh, cx, cz } —— mesh 的 y 已是湖面局部高度，调用方按 api.add 的地面偏移扣掉。 */
export function basinLake(low: boolean): { mesh: THREE.Mesh; cx: number; cz: number } | null {
  if (!BT_LAKE.on) return null;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let z = -BT_HALF; z <= BT_HALF; z += 2) for (let x = -BT_HALF; x <= BT_HALF; x += 2) if (btLakeDepth(x, z) > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  if (x0 > x1) return null;
  x0 -= 4; x1 += 4; z0 -= 4; z1 += 4;
  const st = 0.5, W = Math.ceil((x1 - x0) / st), H = Math.ceil((z1 - z0) / st);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!, img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = btLakeDepth(x0 + (i + 0.5) * st, z0 + (j + 0.5) * st), k = Math.round(Math.max(0, Math.min(1, d / BT_LAKE.bed)) * 255), o = (j * W + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const am = new THREE.CanvasTexture(c); am.flipY = false;   // 行 j = z0 + j·st；平面绕 x 转 −90° 后 uv.y 从 z1 → z0，所以不翻转、uv 映射见下
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1); geo.rotateX(-Math.PI / 2);
  { const P = geo.attributes.position, U = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < P.count; i++) U.setXY(i, (P.getX(i) + (x1 - x0) / 2) / (x1 - x0), (P.getZ(i) + (z1 - z0) / 2) / (z1 - z0)); }
  const nm = rippleNormal().clone(); nm.repeat.set((x1 - x0) / 3, (z1 - z0) / 3); nm.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: 0x16242a, transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.1, alphaMap: am, normalMap: nm,
    normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false, envMapIntensity: 1.2 });
  waterUp(m, { ql: true, edge: 'alpha', shallow: 0x3a5a5c, deep: 0x0e1c24, sky: 0x9a9ab8, foam: 0xc8ccd4, foamW: 0.28, fres: 0.6, caus: 0.18, speed: 0.6, depth: BT_LAKE.bed, murk: 1.7, refl: true }, low);   // 11-17 水体 v2：真实水深（米）做 Beer-Lambert；中 / 高档倒影钟楼与山脊
  const mesh = new THREE.Mesh(geo, m); mesh.name = 'bt_lake'; mesh.position.y = BT_LAKE.y; mesh.renderOrder = 1; mesh.receiveShadow = !low;
  m.userData.outlineParameters = { visible: false };
  mesh.onBeforeRender = () => { const t = performance.now() / 1000; nm.offset.set(t * 0.008, t * 0.012); };
  waterBind(mesh);
  return { mesh, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
/** 悬浮碎钟片：缓慢自转 + 上下浮（onBeforeRender 里算，0 额外系统） */
export function floatingShards(n: number): THREE.Group {
  const g = new THREE.Group(), mat = bronze(0x6a5428);
  for (let i = 0; i < n; i++) {
    const s = 0.8 + rnd() * 2.2, m = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 1.3, s * 0.5, 7, 1, true, 0, 1.2 + rnd() * 1.6), mat);
    (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; m.castShadow = true;
    const a = rnd() * 6.28, r = 24 + rnd() * 58, y0 = 9 + rnd() * 14, sp = 0.1 + rnd() * 0.25, ph = rnd() * 6.28;
    m.position.set(Math.cos(a) * r, y0, BASIN_C.z + Math.sin(a) * r); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.onBeforeRender = () => { const t = performance.now() / 1000; m.rotation.y = ph + t * sp; m.rotation.x = 0.4 * Math.sin(t * sp * 0.7 + ph); m.position.y = y0 + 0.6 * Math.sin(t * 0.4 + ph); m.updateMatrixWorld(); };
    g.add(m);
  }
  return g;
}
/** 巨型倒伏铜钟残骸（半埋在盆地东侧坡上） */
export function wreckBell(): THREE.Group {
  const g = new THREE.Group();
  const b = cs(new THREE.Mesh(bellGeo(7, 11, 28), bronze(0x5a4a26))); (b.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; b.rotation.set(0.15, 0, 1.25); add(g, b, 0, 3.2, 0);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.1), glow(0x40e0f0, 0.6)); crack.rotation.z = 0.4; add(g, crack, 2.5, 5.5, 5.2);
  const lip = cs(new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.6, 6, 28), verdigris())); lip.rotation.set(0.15, Math.PI / 2, 1.25); add(g, lip, -5.6, 1.4, 0);
  return g;
}
/** 安魂钟加铜绿底座 + 光柱（机制不变，纯造景） */
export function soulBase(col = 0x60f0e0): THREE.Group {
  const g = new THREE.Group();
  const base = cs(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 12), verdigris())); add(g, base, 0, 0.1, 0);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 26, 16, 1, true), glow(col, 0.13)); (pillar.material as THREE.Material).side = THREE.DoubleSide; add(g, pillar, 0, 13, 0);
  return g;
}
/** 环形山顶垂下的断链落点：返回局部坐标（山脊内沿） */
export function rimPoints(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5 + (rnd() - 0.5) * 0.6) / n * Math.PI * 2 + 0.3; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue; { const R = rimR(a) + 3; out.push([BASIN_C.x + Math.sin(a) * R, BASIN_C.z + Math.cos(a) * R]); } }
  return out;
}
