// ======================================================================
// 阶段四：数据驱动的野外地图场景（赤砂裂谷 / 霜脊高地 / 烬落荒原）
//   第一次进入某张地图时才生成（按地图懒加载：首屏只建营地，切图时显示加载画面）
//   地形、散布物件、营地、传送门、传送阵、天气粒子都从 data/zones_wild.ts 生成；寻路网格和碰撞一一对应
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIRE_FLICK_OFF, fireNoise, fireSeed } from './fire_flicker';   // 11-18 专长包 v8 第 120 步
import { makeIceLakeHd, wildIceOn } from './icelake_hd';   // 11-18 野外冰湖换钟井冰面
import { bakeRoad, road2On, type RoadMask, type RoadLook } from './road2';
import * as M from './models';
import { toon, glow } from './gfx';
import { splatMaterial, setSplat } from './textures';
import { cineWind } from './cine';
import { NavGrid, Circle } from '../core/NavGrid';
import { WILD_PROP_HOOKS, WILD_BUILD_HOOKS } from '../core/ContentPacks';
import { makeUnifiedWaypoint, WAYPOINT_BLOCKS } from './waypoint3d';
import { WildDef, WildId } from '../data/zones_wild';
import { HeightField, risesY, onRamp, MAX_WALK_SLOPE, CHUNK } from '../core/Terrain';
import { buildFieldFlora, fieldFloraOn, ffSmooth, groveNav } from './field_flora';   // 11-15 写实草木（高 / 超高 / 中画质；低画质与 ?off=fieldflora 用旧版）
import { wildFloraOpt, wildFloraHas } from './field_flora_maps';
import { upgradeFlags } from './field_flags';   // 11-16 旗帜布料摆动（?off=flags）
import { buildMountains, hasMountainStyle, mountainHdOn } from './mountain_hd';
import { buildSnowFar, hasSnowFar, snowFarOn } from './snow_far';   // 11-17e 天边雪山（?off=snowfar）
import { iceHdOn, makeIceCluster } from './ice_hd';   // 11-16 地面冰锥簇（?off=icehd）   // 11-16 远景雪山 / 山体（?off=mountainhd）
import { crHdOn, iceCrOn, iceSpikeCrOn, makeStarCrystal, makeIceCrystal, makeIceSpikeHd, crSeed, crAllOn, makeCrystalAny } from './crystal_hd';   // 11-18 星落紫晶 / 霜脊冰晶升级（?off=crhd / ?off=icehd）
import { surfOn as dgSurfOn } from './dungate_hd';
import { dungateOn, dungateY, dungateZone, dungateSkip, dungateRock, dungateSpec, makeDungate, dungateTint, dungateNavSlope } from './dungate_hd';   // 11-16 长副本山体门
import { gatesHdOn, makeFieldPortal, makeSmallDungeonGate, dungeonGateFacing } from './gates_hd';   // 11-16 野外传送门 / 小副本门新外观（?off=gates）
import { rsHdOn, rsHdHas, newRsRec, buildRedsandHd } from './redsand_hd';
import { bakeLate, LATE_BAKE_ON } from './wild_latebake';
import { lavaFakeOn, makeLavaGlow, circleShore } from './lava_hd';   // 11-18 opt1118B 熔岩池假光 / 新观感   // 11-18 opt1118B 造景钩子之后补合批（?off=wildbatchlate）   // 11-18 赤砂裂谷画面升级（?off=rshd 回旧版）

export interface WildScene {
  id: WildId; group: THREE.Group; nav: NavGrid;
  waypoints: Record<string, THREE.Vector3>;
  gates: { to: string; pos: THREE.Vector3; name: string }[];
  dgates: { id: string; name: string; pos: THREE.Vector3; opens: string; desc: string; obj?: THREE.Object3D }[];
  /** v0.9.2b 副本传送阵（符文盘旋转 / 石牌浮动） */
  dportals: THREE.Object3D[];
  anim: { flames: THREE.Object3D[]; lights: THREE.PointLight[]; spin: THREE.Object3D[]; lava: THREE.MeshBasicMaterial[]; cloths: THREE.Object3D[] };
  weather: Weather | null;
  stats: { before: number; after: number };
  /** v0.9.3a 高度图（世界坐标查询）：角色 / 怪 / 掉落 / 特效贴地，陡坡不可走 */
  hf: HeightField;
  /** v0.9.3c 散布物件按 40 米分块合批，main.ts 按玩家位置切换显示 */
  chunks: { g: THREE.Group; cx: number; cz: number }[];
}

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;
const segDist = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
export function pathDist(def: WildDef, lx: number, lz: number) {
  let d = Infinity;
  for (const pl of def.paths) for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, segDist(lx, lz, pl[i], pl[i + 1]));
  return d;
}
/** 11-16e 魔兽式主路：每张图烘焙一次路面遮罩（?off=road2 回旧路）；画面避让用 pathDistV（数据层 pathDist 不动） */
const ROADS = new Map<string, RoadMask | null>();
const ROAD_LOOK: Record<string, { look: RoadLook; ruts: number; puddles: number; halfW?: [number, number] }> = {
  star: { look: { tint: [1, 0.97, 1.02], gravel: 0.5, mud: 0.6 }, ruts: 0.8, puddles: 0.4 },
  redsand: { look: { tint: [1.25, 0.95, 0.75], gravel: 0.35, mud: 0.15 }, ruts: 0.6, puddles: 0, halfW: [1.4, 2.9] },
  frost: { look: { tint: [0.95, 0.98, 1.08], gravel: 0.7, mud: 0.8 }, ruts: 0.9, puddles: 0.3 },
  ember: { look: { tint: [0.7, 0.62, 0.6], gravel: 0.8, mud: 0.3 }, ruts: 0.5, puddles: 0 },
  foothill: { look: { tint: [1, 0.98, 0.95], gravel: 0.6, mud: 0.6 }, ruts: 0.8, puddles: 0.4 },
  marsh: { look: { tint: [0.8, 0.85, 0.72], gravel: 0.25, mud: 1 }, ruts: 0.9, puddles: 0.9 },
};
export function wildRoad(def: WildDef): RoadMask | null {
  if (!road2On()) return null;
  if (ROADS.has(def.id)) return ROADS.get(def.id)!;
  const H = def.half, L = ROAD_LOOK[def.id] ?? { look: {}, ruts: 0.7, puddles: 0.3 };
  const pins: [number, number][] = [...def.camps.map(c => [c.x, c.z] as [number, number]), ...def.gates.map(g => [g.x, g.z] as [number, number]), ...def.decor.filter(d => d.kind === 'dgate').map(d => [d.x, d.z] as [number, number])];
  const avoid = def.decor.filter(d => d.kind === 'lava' || d.kind === 'icelake').map(d => ({ x: d.x, z: d.z, r: (d.s ?? 6) + 1 }));
  let m: RoadMask | null = null;
  try { m = bakeRoad(def.paths, [-H - 4, -H - 4, H + 4, H + 4], [def.origin.x, def.origin.z], { seed: [...def.id].reduce((a, c) => a + c.charCodeAt(0), 0), pins, avoid, ruts: L.ruts, puddles: L.puddles, halfW: L.halfW }); }
  catch (e) { console.warn('road2 烘焙失败，回旧路', e); m = null; }
  ROADS.set(def.id, m); return m;
}
export function pathDistV(def: WildDef, lx: number, lz: number) { const m = wildRoad(def); return m ? Math.min(m.pd(lx, lz), pathDist(def, lx, lz) + 0.8) : pathDist(def, lx, lz); }
/** 地形高度（局部坐标）：可走范围内是平地，边缘外隆起成山崖 */
export function wildGroundY(def: WildDef, lx: number, lz: number) {
  const edge = Math.max(Math.abs(lx) - (def.half - 4), Math.abs(lz) - (def.half - 4), 0);
  const y = Math.min(1, edge / 12) * (6 + fbm(lx * 0.05 + 11, lz * 0.05) * 16) + risesY(def.rises, lx, lz) + (def.groundAdd ? def.groundAdd(lx, lz) : 0);
  return dungateY(def.id, lx, lz, y);   // 11-16 长副本山体门：冰窟盆地 / 火山 + 平台 + 山路（?off=dungate 原样返回）
}
/** 起伏的坡度（度，局部坐标）：地形上色（崖壁换岩石贴图）和散布物件避让用 */
function riseSlope(def: WildDef, lx: number, lz: number) {
  if (!def.rises) return 0;
  const e = 0.5, gx = (risesY(def.rises, lx + e, lz) - risesY(def.rises, lx - e, lz)) / (2 * e), gz = (risesY(def.rises, lx, lz + e) - risesY(def.rises, lx, lz - e)) / (2 * e);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
}

function terrain(def: WildDef) {
  const road = wildRoad(def);
  const P = def.palette, size = (def.half + 34) * 2, seg = Math.round(size / (def.rises?.length ? 1.5 : 2));   // v0.9.3a 有台地的图加密到 1.5 米，崖壁不锯齿
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3), splat = new Float32Array(p.count * 3);
  const tA = new THREE.Color(P.tA), tB = new THREE.Color(P.tB), c = new THREE.Color(), cliff = new THREE.Color(P.cliff), path = new THREE.Color(P.path);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = wildGroundY(def, x, z);
    p.setY(i, def.floorSink && Math.max(Math.abs(x), Math.abs(z)) < def.half - 3 ? y - def.floorSink : y);
    const n = fbm(x * 0.05, z * 0.05);
    c.copy(tA).lerp(tB, Math.min(1, Math.abs(n - 0.5) * 2));
    const pd = road ? 0 : Math.max(0, 1 - Math.max(0, pathDist(def, x, z) - 1.3) / 1.4) * 0.9;   // 11-16e road2：路交给着色器按像素画
    const yb = y - risesY(def.rises, x, z);   // 边缘山崖（不含起伏）
    let rock = Math.max(yb > 2 ? Math.min(1, (yb - 2) / 6) : 0, Math.min(1, Math.max(0, (riseSlope(def, x, z) - 24) / 14)));
    if (pd > 0) c.lerp(path, pd * 0.7);
    const dgr = dungateRock(def.id, x, z, (a, b) => wildGroundY(def, a, b)); if (dgr > rock) { rock = dgr; }   // 11-16 山体门崖壁换岩石
    if (rock > 0) c.lerp(cliff, rock);
    dungateTint(def.id, x, z, c);   // 11-16 火山坡提亮偏暖（原近乎纯黑）
    splat.set([Math.max(0, 1 - pd - rock), pd * (1 - rock), rock], i * 3);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  setSplat(g, splat);
  g.computeVertexNormals();
  const dgRock = dungateOn() && dgSurfOn() && (def.id === 'frost' || def.id === 'ember') ? def.id as 'frost' | 'ember' : null;   // 11-16c 山体门图崖壁写实层
  const m = new THREE.Mesh(g, splatMaterial(P.tex, [0.11, 0.13, 0.07], dgRock, road ? { mask: road, look: (ROAD_LOOK[def.id] ?? { look: {} }).look } : null));
  m.position.set(def.origin.x, 0, def.origin.z); m.receiveShadow = true;
  return M.noOutline(m);
}

// ---------------------------------------------------------------- 物件（程序生成的低多边形）
function makePine(s: number, color: number, snow: boolean) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 5), toon(0x5a3a22)); trunk.position.y = 0.6; g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25 - i * 0.32, 1.5, 7), toon(color)); cone.position.y = 1.4 + i * 0.85; cone.castShadow = true; g.add(cone);
    if (snow) { const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75 - i * 0.2, 0.55, 7), toon(0xf4f8ff)); cap.position.y = 1.95 + i * 0.85; g.add(cap); }
  }
  g.scale.setScalar(s);
  return g;
}
function makeCactus(s: number, color: number) {
  const g = new THREE.Group(), mt = toon(color);
  const main = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 6), mt); main.position.y = 1.1; main.castShadow = true; g.add(main);
  for (const sd of [1, -1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 6), mt); arm.position.set(sd * 0.42, 1.3 + sd * 0.2, 0); g.add(arm); const el = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 6), mt); el.rotation.z = Math.PI / 2; el.position.set(sd * 0.28, 0.95 + sd * 0.2, 0); g.add(el); }
  g.scale.setScalar(s);
  return g;
}
function makeSpike(s: number, color: number, glowK = 0) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const h = 1 + rnd() * 2.2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.22 + rnd() * 0.2, h, 5), glowK ? glow(color, glowK) : toon(color));
    m.position.set((rnd() - 0.5) * 0.9, h / 2 - 0.1, (rnd() - 0.5) * 0.9); m.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5); m.castShadow = true;
    g.add(glowK ? M.noOutline(m) : m);
  }
  g.scale.setScalar(s);
  return g;
}
function makeMesa(s: number, color: number) {
  const g = new THREE.Group();
  const base = M.makeRock(2.4, color); base.scale.set(1.4, 2.2 + rnd() * 1.5, 1.4); base.position.y = 1.4; g.add(base);
  const top = M.makeRock(1.6, new THREE.Color(color).multiplyScalar(1.15).getHex()); top.position.set((rnd() - 0.5), 4 + rnd() * 2, (rnd() - 0.5)); g.add(top);
  g.scale.setScalar(s);
  return g;
}
function makeBones(s: number) {
  const g = new THREE.Group(), mt = toon(0xe8dcc4);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), mt); spine.rotation.z = Math.PI / 2; spine.position.y = 0.2; g.add(spine);
  for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 3, 8, Math.PI), mt); rib.position.set(-0.9 + i * 0.45, 0.2, 0); rib.rotation.y = Math.PI / 2; g.add(rib); }
  const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), mt); skull.position.set(1.4, 0.25, 0); g.add(skull);
  g.scale.setScalar(s);
  return g;
}
function makeBoard() {
  const g = new THREE.Group(), wood = toon(0x6a4a2a);
  for (const x of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), wood); p.position.set(x, 1.1, 0); g.add(p); }
  const b = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.1), toon(0x8a6a42)); b.position.y = 1.5; g.add(b);
  for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.5), toon(0xf0e4c8, { side: THREE.DoubleSide })); n.position.set(-0.65 + i * 0.43, 1.5 + (i % 2) * 0.1, 0.06); n.rotation.z = (rnd() - 0.5) * 0.2; g.add(n); }
  return g;
}
function makeLavaPool(r: number, lavaMats: THREE.MeshBasicMaterial[]) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a10).multiplyScalar(1.6), toneMapped: false });
  lavaMats.push(mat);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 18), mat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; g.add(M.noOutline(pool));
  const crust = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.18, 18), toon(0x1a1210)); crust.rotation.x = -Math.PI / 2; crust.position.y = 0.06; g.add(M.noOutline(crust));
  for (let i = 0; i < Math.round(r * 1.5); i++) { const rk = M.makeRock(0.4 + rnd() * 0.5, 0x1a1418); const a = rnd() * 6.28, d = r * (0.3 + rnd() * 0.6); rk.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(rk); }
  if (lavaFakeOn()) g.add(makeLavaGlow(circleShore(r)));   // 11-18 opt1118B 点光 → 地面受热光晕假光（lava_hd.ts；?off=lavalight 回点光）
  else { const l = new THREE.PointLight(0xff6a20, 2.2, r * 3); l.position.y = 1.5; g.add(l); }
  return g;
}
function makeIceLake(r: number) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshPhongMaterial({ color: 0xbfe0f8, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.receiveShadow = true;
  return M.noOutline(m);
}
function makeCave() {
  const g = new THREE.Group();
  const arch = M.makeArch(6, 5); g.add(arch);
  for (let i = -3; i <= 3; i++) { const r = M.makeRock(2.2 + rnd(), 0x7a8494); r.position.set(i * 2.2, 2 + Math.abs(i) * 0.4, -1.8); g.add(r); }
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.8), new THREE.MeshBasicMaterial({ color: 0x050608 })); dark.position.set(0, 1.9, -0.6); g.add(M.noOutline(dark));
  return g;
}

// ---------------------------------------------------------------- 天气粒子：跟着玩家的一团（雪 / 灰烬 / 沙尘）
export class Weather {
  points: THREE.Points;
  private v: Float32Array;
  constructor(readonly kind: 'snow' | 'ash' | 'dust', n: number) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3); this.v = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([(Math.random() - 0.5) * 44, Math.random() * 18, (Math.random() - 0.5) * 44], i * 3); this.v[i] = 0.5 + Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = kind === 'snow' ? 0xffffff : kind === 'ash' ? 0xff8a40 : 0xe8c090;
    const m = new THREE.PointsMaterial({ color, size: kind === 'snow' ? 0.16 : kind === 'ash' ? 0.1 : 0.08, transparent: true, opacity: kind === 'dust' ? 0.5 : 0.85, depthWrite: false, blending: kind === 'ash' ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
  }
  update(dt: number, cx: number, cz: number, t: number) {
    const p = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.points.position.set(cx, 0, cz);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const v = this.v[i];
      if (this.kind === 'snow') { y -= dt * 1.4 * v; x += Math.sin(t * 0.8 + i) * dt * 0.5; }
      else if (this.kind === 'ash') { y += dt * 0.6 * v; x += Math.sin(t * 0.5 + i) * dt * 0.4; }
      else { x += dt * 4 * v; y += Math.sin(t + i) * dt * 0.3; }
      if (y < 0) y += 18; if (y > 18) y -= 18; if (x > 22) x -= 44; if (x < -22) x += 44;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }
}

/** 生成一张野外地图（第一次进入时调用） */
export function buildWild(def: WildDef, touch: boolean): WildScene {
  seed = [...def.id].reduce((a, c) => a + c.charCodeAt(0) * 97, 12345);
  const O = def.origin, H = def.half, P = def.palette;
  const group = new THREE.Group(); group.name = `wild_${def.id}`;
  const circles: Circle[] = [];
  const anim: WildScene['anim'] = { flames: [], lights: [], spin: [], lava: [], cloths: [] };
  const dpObj = new Map<string, THREE.Object3D>();
  const lavaSolid: { x: number; z: number; r: number }[] = [];
  const put = (o: THREE.Object3D, lx: number, lz: number, ry = 0) => { o.position.set(O.x + lx, o.position.y + wildGroundY(def, lx, lz), O.z + lz); o.rotation.y = ry; group.add(o); return o; };
  const block = (lx: number, lz: number, r: number) => { if (r > 0) circles.push({ x: O.x + lx, z: O.z + lz, r }); };
  const chunks: WildScene['chunks'] = [], chunkMap = new Map<string, THREE.Group>();
  /** 散布物件放进 40 米分块 */
  const putS = (o: THREE.Object3D, lx: number, lz: number, ry = 0) => {
    const x = O.x + lx, z = O.z + lz, cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), k = cx + ',' + cz;
    let g = chunkMap.get(k); if (!g) { g = new THREE.Group(); chunkMap.set(k, g); group.add(g); chunks.push({ g, cx, cz }); }
    o.position.set(x, o.position.y + wildGroundY(def, lx, lz), z); o.rotation.y = ry; g.add(o); return o;
  };
  /** v0.9.3c 扩建后散布物件按面积放大数量（边缘山按周长） */
  const area = def.inner ? (H / def.inner) ** 2 : 1, perim = def.inner ? H / def.inner : 1;
  group.add(terrain(def));

  const hook = WILD_PROP_HOOKS[def.id];   // v1.2.49 内容包可替换营地栅栏 / 固定装饰的模型（返回 null = 用本体默认模型）
  const hooked = (kind: string, v?: number, s?: number): THREE.Object3D | null => { if (!hook) return null; try { return hook(kind, v, s) as THREE.Object3D | null; } catch (e) { console.error('造景替换出错', e); return null; } };
  // ---- 营地：木栅栏（南北留门）
  for (const c of def.camps) {
    const n = Math.round(c.r * 2 * Math.PI / 1.15);
    const placed: (THREE.Object3D | null)[] = [];
    for (let i = 0; i < n; i++) {
      placed.push(null);
      const a = i / n * Math.PI * 2;
      if (Math.abs(Math.sin(a)) > 0.93) continue;   // 南北门
      if (!c.main && Math.abs(Math.cos(a)) > 0.95) continue;   // 小营地东西也开门
      const lx = c.x + Math.cos(a) * c.r, lz = c.z + Math.sin(a) * c.r;
      const sh = 2 + rnd() * 0.5; placed[i] = put(hooked('stake', a, sh) ?? M.makeStake(sh), lx, lz); block(lx, lz, 0.35);
    }
    // fix1107 内容包木桩自带横杆工厂（userData.railTo）：相邻两根都在（门口不连）→ 按两桩实际位置连横杆
    for (let i = 0; i < n; i++) { const A = placed[i], B = placed[(i + 1) % n]; const f = A?.userData.railTo as ((a: THREE.Vector3, b: THREE.Vector3) => THREE.Object3D) | undefined;
      if (A && B && f) { try { group.add(f(A.position.clone(), B.position.clone())); } catch (e) { console.error('栅栏横杆出错', e); } } }
    const wpC = def.id === 'frost' ? 0x8ad0ff : def.id === 'ember' ? 0xff7a30 : 0xffb040;
    void wpC; const wp = makeUnifiedWaypoint();   // 11-18 Rhett「别乱换营地的」：营地传送阵保持统一传送阵，石拱悬晶只给野外路边传送石（explore.ts）
      // v1.2.67 所有营地统一传送阵（不再按区域换色，也不再让内容包替换外观）
    put(wp, c.waypoint.x, c.waypoint.z); wp.traverse(o => { if (o.name === 'spin') anim.spin.push(o); });
    for (const b of WAYPOINT_BLOCKS) block(c.waypoint.x + b.x, c.waypoint.z + b.z, b.r);
  }
  const waypoints: Record<string, THREE.Vector3> = Object.fromEntries(def.camps.map(c => [c.id, new THREE.Vector3(O.x + c.waypoint.x, 0, O.z + c.waypoint.z)]));

  // ---- 固定装饰
  for (const d of def.decor) {
    let o: THREE.Object3D; let r = d.r ?? 0;
    const ho = ['tent', 'crate', 'stall', 'anvil', 'board'].includes(d.kind) ? hooked(d.kind, d.v, d.s) : null;
    if (ho) { o = ho; r = d.kind === 'tent' ? 2.1 : d.kind === 'stall' ? 1.2 : 0.6; }
    else switch (d.kind) {
      case 'tent': o = M.makeTent(d.v ?? 0x8a5a3a); r = 2.1; break;
      case 'fire': { o = M.makeCampfire(); r = 0.9; anim.flames.push(o.getObjectByName('fire')!); const l = o.getObjectByName('fireLight') as THREE.PointLight; if (l) anim.lights.push(l); break; }
      case 'tower': o = M.makeWatchtower(); r = 1.7; break;
      case 'stall': o = M.makeStall(); r = 1.2; break;
      case 'anvil': o = M.makeAnvil(); r = 0.6; break;
      case 'crate': o = rnd() < 0.5 ? M.makeCrate(0.9) : M.makeBarrel(); r = 0.6; break;
      case 'banner': { o = M.makeBanner(d.v ?? 0x8a3a20); r = 0.3; anim.cloths.push(o.getObjectByName('cloth')!); break; }
      case 'altar': o = M.makeStarAltar(); r = 2.2; break;
      case 'pillar': o = M.makePillar(3 + rnd() * 2.5, rnd() < 0.4); r = 0.8; break;
      case 'crystal': { o = M.makeCrystalOld(d.v ?? 0xff6a20, 0.6 * (d.s ?? 1)); r = 0.8 * (d.s ?? 1);
        // 11-18 星落紫晶 / 霜脊冰晶换多层刻面晶簇（旧件照常生成一次再丢，models 随机序列不变；位置 / 碰撞半径不变）
        const hd = def.id === 'star' && crHdOn() ? makeStarCrystal : def.id === 'frost' && iceCrOn() ? makeIceCrystal : crAllOn() ? (c: number, sz: number, sd: number) => makeCrystalAny(c, sz * 0.6, sd) : null;   // 11-18 其他野外图按颜色换（?off=crall）
        if (hd) { o.traverse(c => (c as THREE.Mesh).geometry?.dispose()); o = hd(d.v ?? 0xff6a20, d.s ?? 1, crSeed(d.x, d.z)); }
        break; }
      case 'icelake': o = wildIceOn() ? makeIceLakeHd(d.s ?? 10) : makeIceLake(d.s ?? 10); r = 0; break;   // 11-18 钟井同款冰面
      case 'cave': o = makeCave(); r = 0; [-3, -1.6, 1.6, 3].forEach(x => block(d.x + x, d.z, 0.9)); break;
      case 'lava': o = makeLavaPool(d.s ?? 5, anim.lava); lavaSolid.push({ x: d.x, z: d.z, r: (d.s ?? 5) * 0.95 }); break;
      case 'dgate': { const ds = d.s ?? 1; const dsp = dungateSpec(def.id, d.x, d.z);
        if (dsp) { const bd = makeDungate(dsp, d.v ?? 0xff5a10, ds, (a, b) => wildGroundY(def, a, b)); o = bd.obj; o.scale.setScalar(ds); o.userData.dpScale = ds; M.setDungeonPortalActive(o, false); r = 0; dpObj.set(`${d.x},${d.z}`, o); bd.blocks.forEach(b => block(b.x, b.z, b.r)); break; }   // 11-16 长副本山体门（触发半径 4×ds 不变）
        o = ds >= 2 ? M.makeLongGatePortal(d.v ?? 0xff5a10) : gatesHdOn() ? makeSmallDungeonGate(d.v ?? 0xff5a10, dungeonGateFacing(d.x, d.z)) : M.makeDungeonPortal(d.v ?? 0xff5a10);   /* 11-16 小副本门新外观，障碍照旧 */ o.scale.setScalar(ds); o.userData.dpScale = ds; M.setDungeonPortalActive(o, false); r = 0; dpObj.set(`${d.x},${d.z}`, o); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; block(d.x + Math.cos(a) * 3.05 * ds, d.z + Math.sin(a) * 3.05 * ds, 0.4 * ds); } break; }   // fix1107（Rhett 10:28）：s = 尺寸倍数，长副本门 s: 2   // v0.9.2b 副本传送阵
      case 'board': o = makeBoard(); r = 0.6; break;
      case 'stone': o = M.makeStandingStone(); r = 0.9; break;
      default: continue;
    }
    if (d.s && !['crystal', 'icelake', 'lava'].includes(d.kind)) o.scale.setScalar(d.s);
    put(o, d.x, d.z, d.ry ?? (d.kind === 'tent' ? Math.atan2(-d.x, -d.z) : 0));
    block(d.x, d.z, r);
  }

  // ---- 传送门（去别的地图）
  const gates = def.gates.map(g => {
    const color = g.to === 'frost' ? 0x8ad0ff : g.to === 'ember' ? 0xff5a10 : g.to === 'redsand' ? 0xff9a40 : 0xf0b030;
    const hdG = gatesHdOn();   // 11-16 野外传送门新外观（自带巨石门框，不再摆石拱；障碍照旧）
    const pt = put(hdG ? makeFieldPortal(color) : M.makePortal(color), g.x, g.z); pt.name = 'gate';
    if (!hdG) put(M.makeArch(5.4, 4.2), g.x, g.z + (g.z > 0 ? -0.6 : 0.6));
    block(g.x - 2.7, g.z, 0.7); block(g.x + 2.7, g.z, 0.7);
    return { to: g.to, pos: new THREE.Vector3(O.x + g.x, 0, O.z + g.z), name: g.name };
  });
  const dgates = (def.dungeonGates ?? []).map(d => ({ id: d.id, name: d.name, pos: new THREE.Vector3(O.x + d.x, 0, O.z + d.z), opens: d.opens, desc: d.desc, obj: dpObj.get(`${d.x},${d.z}`) }));
  const dportals = [...dpObj.values()];

  // ---- 散布物件：避开路、营地、刷怪点、传送门
  const avoid: [number, number, number][] = [
    ...def.camps.map(c => [c.x, c.z, c.r + 4] as [number, number, number]),
    ...Object.values(def.spots).map(s => [s.x, s.z, Math.min(s.r, 10)] as [number, number, number]),
    ...def.packs.map(p => [p.x, p.z, 6] as [number, number, number]),
    ...def.gates.map(g => [g.x, g.z, 8] as [number, number, number]),
    ...def.decor.map(d => [d.x, d.z, d.kind === 'lava' ? (d.s ?? 5) + 2 : d.kind === 'icelake' ? (d.s ?? 10) + 1 : 3] as [number, number, number]),
  ];
  const rsOn = rsHdHas(def.id) && rsHdOn(), rsRec = newRsRec();   // 11-18 赤砂：旧仙人掌 / 边缘方山只记位置（随机序列、障碍照旧），新模型由 redsand_hd 生成
  const ffOn = fieldFloraOn() && wildFloraHas(def.id), ffSpots: { x: number; z: number; s: number; ry: number; kind: 'pine' | 'deadtree' }[] = [];
  for (const sc of def.scatter) {
    const want = Math.round(sc.n * (sc.edge ? perim : area));
    for (let i = 0, n = 0; i < want * 10 && n < want; i++) {
      let lx: number, lz: number;
      if (sc.edge) { const side = Math.floor(rnd() * 4), t = (rnd() - 0.5) * 2 * (H + 10), d = H - 3 + rnd() * 16; [lx, lz] = side === 0 ? [t, -d] : side === 1 ? [t, d] : side === 2 ? [-d, t] : [d, t]; }
      else { lx = (rnd() - 0.5) * 2 * (H - 3); lz = (rnd() - 0.5) * 2 * (H - 3); }
      if (!sc.edge && (pathDistV(def, lx, lz) < 3.5 || avoid.some(([x, z, r]) => Math.hypot(lx - x, lz - z) < r))) continue;
      if (!sc.edge && (onRamp(def.rises, lx, lz) || riseSlope(def, lx, lz) > 22)) continue;   // v0.9.3a 坡道 / 崖壁上不放东西
      if (sc.edge && Math.abs(lx) < 8 && Math.abs(lz) > H - 12) continue;   // 南北门口留空
      const s = sc.s[0] + rnd() * (sc.s[1] - sc.s[0]);
      if (ffOn && (sc.kind === 'pine' || sc.kind === 'deadtree') && !sc.edge) {   // 新版树：位置 / 障碍照旧，模型交给 field_flora（枯树仍调用一次旧模型，保持随机序列）
        if (sc.kind === 'deadtree') M.makeDeadTree(rnd);
        if (dungateSkip(def.id, lx, lz)) { rnd(); n++; continue; }   // 11-16 山体门让开
        ffSpots.push({ x: O.x + lx, z: O.z + lz, s, ry: rnd() * 6.28, kind: sc.kind });
        block(lx, lz, sc.r * s); n++; continue;
      }
      let o: THREE.Object3D;
      switch (sc.kind) {
        case 'pine': o = makePine(s, sc.color ?? 0x2a4a3a, def.id === 'frost'); break;
        case 'cactus': o = makeCactus(s, sc.color ?? 0x6a8a3a); break;
        case 'spire': o = makeSpike(s * 0.7, sc.color ?? 0xff6a20, def.id === 'ember' ? 1.6 : 0); break;
        case 'icespike': {   // 11-16 新版冰锥簇（低画质 / ?off=icehd 用旧版）；旧版照常调用一次，保持随机序列
          o = makeSpike(s * 0.8, sc.color ?? 0xa8e0ff);
          if (iceSpikeCrOn()) { o.traverse(c => (c as THREE.Mesh).geometry?.dispose()); o = makeIceSpikeHd(s * 0.8, sc.color ?? 0xa8e0ff, crSeed(lx, lz)); }   // 11-18 同水晶标准的冰晶簇（?off=icehd2 回 11-17 版）
          else if (iceHdOn()) { o.traverse(c => (c as THREE.Mesh).geometry?.dispose()); o = makeIceCluster(s * 0.8, sc.color ?? 0xa8e0ff, (Math.sin(lx * 12.9898 + lz * 78.233) * 43758.5453) % 1 + 1); }
          break;
        }
        case 'mesa': o = makeMesa(s, sc.color ?? 0xa86a4a); break;
        case 'deadtree': o = M.makeDeadTree(rnd); o.scale.setScalar(s); break;
        case 'bones': o = makeBones(s); break;
        case 'obsidian': case 'rock': default: o = M.makeRock(s, sc.color ?? 0x8a8478); o.position.y = 0.15; break;
      }
      if (!sc.edge && dungateSkip(def.id, lx, lz)) { rnd(); o.traverse(c => (c as THREE.Mesh).geometry?.dispose()); n++; continue; }   // 11-16 山体门盆地 / 火山坡 / 山路让开（照常消耗随机数，别处布局不变）
      if (rsOn && (sc.kind === 'cactus' || (sc.kind === 'mesa' && sc.edge))) {   // 11-18 赤砂新版：旧模型不挂，ry 照常消耗一次随机数
        const ry = rnd() * 6.28; o.traverse(c => (c as THREE.Mesh).geometry?.dispose());
        (sc.kind === 'cactus' ? rsRec.cactus : rsRec.edge).push({ lx, lz, s, ry });
        if (!sc.edge || (Math.abs(lx) < H && Math.abs(lz) < H)) block(lx, lz, sc.r * s);
        n++; continue;
      }
      putS(o, lx, lz, rnd() * 6.28);
      if (!sc.edge || (Math.abs(lx) < H && Math.abs(lz) < H)) block(lx, lz, sc.r * s);
      n++;
    }
  }
  // 熔岩裂纹：地面上的发光细线（烬落荒原）
  if (P.cracks) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.cracks).multiplyScalar(1.3), toneMapped: false });
    const cc = new THREE.Color(P.cracks); if (cc.g > cc.r) mat.userData.base = cc.clone().multiplyScalar(1.3);   // v1.2.39 冷色裂纹（沉钟海岸青色）只做明暗呼吸，不被熔岩脉动染成橙黄
    anim.lava.push(mat);
    // 11-18 opt1118B 裂纹原来每段一个 Plane 网格，材质在 anim.lava（呼吸）里 → 合批时整体保留不合，烬落几百段 = 几百次绘制。
    //   改成同样随机序列算出每段，几何变换后并成一张网格（同一材质，呼吸照旧），只 1 次绘制；?off=crackmerge 回旧
    const crackMerge = !/(?:[?&]off=[^&]*\bcrackmerge\b)/.test(typeof location !== 'undefined' ? location.search : '');
    const crackGeos: THREE.BufferGeometry[] = [], crackTf = new THREE.Object3D();
    for (let i = 0; i < Math.round((touch ? 50 : 90) * area); i++) {
      const lx = (rnd() - 0.5) * 2 * (H - 4), lz = (rnd() - 0.5) * 2 * (H - 4);
      if (pathDistV(def, lx, lz) < 2 || def.camps.some(c => Math.hypot(lx - c.x, lz - c.z) < c.r + 2) || risesY(def.rises, lx, lz) > 0.05) continue;
      let x = lx, z = lz, a = rnd() * 6.28;
      for (let k = 0; k < 4; k++) {
        const len = 1.2 + rnd() * 2.2; a += (rnd() - 0.5) * 1.2;
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.14 + rnd() * 0.1, len), mat);
        if (dungateSkip(def.id, x, z)) { seg.geometry.dispose(); x += -Math.sin(a) * len; z += Math.cos(a) * len; continue; }   // 11-16 火山坡上不画平地裂纹
        seg.rotation.x = -Math.PI / 2; seg.rotation.z = a;
        seg.position.set(O.x + x + Math.sin(a) * len / 2 * -1, 0.04, O.z + z + Math.cos(a) * len / 2);
        if (crackMerge) { crackTf.rotation.copy(seg.rotation); crackTf.position.copy(seg.position); crackTf.updateMatrix(); seg.geometry.applyMatrix4(crackTf.matrix); crackGeos.push(seg.geometry); }
        else group.add(M.noOutline(seg));
        x += -Math.sin(a) * len; z += Math.cos(a) * len;
      }
    }
    if (crackGeos.length) {
      const mg = mergeGeometries(crackGeos, false); crackGeos.forEach(g => g.dispose());
      if (mg) { const cm = new THREE.Mesh(mg, mat); cm.name = 'lavaCracks'; group.add(M.noOutline(cm)); }
    }
  }
  // 地面小草 / 碎石点缀
  if (P.grass) {
    const blade = new THREE.ConeGeometry(0.08, 0.5, 3); blade.translate(0, 0.25, 0);
    const n = Math.round((touch ? 900 : 2200) * area); const im = new THREE.InstancedMesh(blade, cineWind(toon(P.grass), 0.09), n);   // 11-14 第 5 步
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    let k = 0;
    for (let t = 0; k < n && t < n * 4; t++) {
      const lx = (rnd() - 0.5) * 2 * (H - 2), lz = (rnd() - 0.5) * 2 * (H - 2);
      if (fbm(lx * 0.12 + 3, lz * 0.12) < 0.5 || pathDistV(def, lx, lz) < 1.5 || riseSlope(def, lx, lz) > 26) continue;
      im.setMatrixAt(k++, m4.compose(pos.set(O.x + lx, wildGroundY(def, lx, lz), O.z + lz), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5)), sc.set(1, 0.6 + rnd(), 1)));
    }
    im.count = k; if (!ffOn) group.add(M.noOutline(im));   // 新版也照样生成（保持随机序列），只是不挂上
  }
  // 远景：可走范围外的一圈山（不挡路）
  for (let i = 0; i < Math.round(40 * perim); i++) {
    const a = rnd() * Math.PI * 2, r = H + 22 + rnd() * 14;
    const o = makeMesa(1.4 + rnd() * 1.2, P.cliff);
    if (rsOn) { const ry = rnd() * 6; o.traverse(c => (c as THREE.Mesh).geometry?.dispose()); rsRec.far.push({ lx: Math.cos(a) * r, lz: Math.sin(a) * r, s: o.scale.x, ry }); continue; }   // 11-18 赤砂新版远景方山
    putS(o, Math.cos(a) * r, Math.sin(a) * r, rnd() * 6);
  }
  // 11-18 赤砂新版：层理崖壁 / 地标 / 流沙瀑布 / 仙人掌群（障碍在建寻路网格之前登记；模型在合批之后挂，不参与合批）
  let rsGroup: THREE.Group | null = null;
  if (rsOn) {
    try {
      const rs = buildRedsandHd({ def, gy: (x, z) => wildGroundY(def, x, z), pd: (x, z) => pathDistV(def, x, z), slope: (x, z) => riseSlope(def, x, z), ramp: (x, z) => onRamp(def.rises, x, z) }, rsRec);
      rs.blocks.forEach(b => block(b.x, b.z, b.r)); rsGroup = rs.group;
    } catch (e) { console.error('赤砂新版造景出错', e); }
  }

  // ---- 寻路网格：边界外、熔岩池不可走
  // v0.9.3a 高度图：1 米一格采样（查询 O(1)），陡坡（台地崖壁）烘进寻路网格当不可走，坡道 / 山丘可走
  const hf = new HeightField(O.x - H - 4, O.z - H - 4, O.x + H + 4, O.z + H + 4, (x, z) => wildGroundY(def, x - O.x, z - O.z));
  const steep = def.rises?.length ? new Set<number>() : null;
  const dgNav = dungateOn();
  const nav = new NavGrid({ x0: O.x - H - 2, z0: O.z - H - 2, x1: O.x + H + 2, z1: O.z + H + 2 }, circles, {
    solid: (x, z) => {
      const lx = x - O.x, lz = z - O.z; if (Math.abs(lx) > H || Math.abs(lz) > H) return true;
      if (steep && risesY(def.rises, lx, lz) > 0.02 && hf.steep(x, z, MAX_WALK_SLOPE)) return true;
      if (dgNav && dungateZone(def.id, lx, lz) && hf.steep(x, z, dungateNavSlope(def.id, lx, lz, MAX_WALK_SLOPE))) return true;   // 11-16 山体门：崖壁 / 火山坡不可走，只走石阶 / 山路（11-16b 火山坡 28°）
      if (def.solidAt && def.solidAt(lx, lz)) return true;
      return lavaSolid.some(l => Math.hypot(lx - l.x, lz - l.z) < l.r);
    },
  });
  upgradeFlags(group);   // 11-16 合批前换旗面
  const keep: THREE.Object3D[] = [];
  group.traverse(o => { if (o.name === 'gate' || o.name === 'spin' || o.name === 'cloth' || o.name === 'fire' || (o as THREE.PointLight).isPointLight) keep.push(o); });
  // 11-18 Rhett「霜脊的传送门没有魔法效果」：统一传送阵的符文盘 / 光点 / 呼吸灯动画挂在符文盘的 onBeforeRender 上，合批后符文盘被并进静态网格 → 动画、光点全停。整组不合批（?off=wpkeep 回旧）
  if (!/(?:[?&]off=[^&]*\bwpkeep\b)/.test(typeof location !== 'undefined' ? location.search : '')) group.traverse(o => { if (o.name === 'waypoint_unified') keep.push(o); });
  anim.lava.forEach(() => {});
  group.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial; if (m && anim.lava.includes(m)) keep.push(o); });
  const keepAll = [...keep, ...anim.flames, ...anim.cloths];
  const stats = { before: 0, after: 0 };
  for (const c of chunks) { const st = M.bakeStatic(c.g, keepAll); stats.before += st.before; stats.after += st.after; }
  const rest = M.bakeStatic(group, [...keepAll, ...chunks.map(c => c.g)]); stats.before += rest.before; stats.after += rest.after;
  if (ffOn) {   // 11-15 写实草木：烘焙之后挂（实例化，不参与合批）
    const avoidC = [
      ...def.camps.map(c => ({ x: c.waypoint.x, z: c.waypoint.z, r: 3.5 })),
      ...def.gates.map(g => ({ x: g.x, z: g.z, r: 4 })),
      ...def.decor.map(d => ({ x: d.x, z: d.z, r: d.kind === 'lava' ? (d.s ?? 5) + 1.5 : d.kind === 'icelake' ? (d.s ?? 10) + 0.5 : d.kind === 'dgate' ? 4 * (d.s ?? 1) : (d.r ?? (d.kind === 'tent' ? 2.1 : 0.8)) + 0.3 })),
      ...circles.map(c => ({ x: c.x - O.x, z: c.z - O.z, r: c.r })),
    ];
    const W = (x: number, z: number) => {
      const lx = x - O.x, lz = z - O.z;
      if (Math.abs(lx) > H - 2 || Math.abs(lz) > H - 2 || riseSlope(def, lx, lz) > 26 || onRamp(def.rises, lx, lz) || (def.solidAt && def.solidAt(lx, lz))) return 0;
      let w = ffSmooth(1.4, 3.4, pathDistV(def, lx, lz));
      for (const c of avoidC) { const d = Math.hypot(lx - c.x, lz - c.z); if (d < c.r + 2) w = Math.min(w, ffSmooth(c.r + 0.2, c.r + 2, d)); if (w <= 0) return 0; }
      return w;
    };
    group.add(buildFieldFlora(wildFloraOpt(def, (x, z) => wildGroundY(def, x - O.x, z - O.z), W, ffSpots)));
    groveNav(def.id, nav);   // 11-18 林团树干进寻路障碍
  }
  if (rsGroup) group.add(rsGroup);
  if (mountainHdOn() && hasMountainStyle(def.id)) group.add(buildMountains({ style: def.id, cx: O.x, cz: O.z, r0: H + 40, reach: H * 1.42 + 15 }));   // 11-16 远景山环（高 / 超高 / 中；低档与 ?off=mountainhd 旧版）
  if (snowFarOn() && hasSnowFar(def.id)) group.add(buildSnowFar(def.id));   // 11-17e 天边雪山远景层（各档；低档一层简化；?off=snowfar）
  const weather = P.weather ? new Weather(P.weather, touch ? 220 : 500) : null;
  if (weather) group.add(weather.points);
  group.visible = false;
  const lateSnap = new Set(group.children);   // 11-18 opt1118B 造景钩子之前的子物体快照（之后新挂的才补合批）
  { const api = { add: (o: unknown, lx: number, lz: number, ry = 0) => put(o as THREE.Object3D, lx, lz, ry), groundY: (lx: number, lz: number) => wildGroundY(def, lx, lz), origin: O, block: (lx: number, lz: number, r: number) => { if (r > 0) nav.addCircle({ x: O.x + lx, z: O.z + lz, r }); } };
    if (def.build) { try { def.build(api); } catch (e) { console.error(`区域 ${def.id} 自定义造景出错`, e); } }   // v1.0.3 内容包造景
    const hk = WILD_BUILD_HOOKS[def.id]; if (hk) { try { hk(api); } catch (e) { console.error(`区域 ${def.id} 追加造景出错`, e); } } }   // 11-18 内容包给本体区域追加造景（营地换 DLC 模型）   // v1.0.3 内容包造景
  // 11-18 opt1118B 合批在造景钩子之前，DLC 五张图的造景和六个营地的 DLC 件都没进合批 → 对钩子新挂的物体补一次保守合批（wild_latebake.ts；?off=wildbatchlate）
  if (LATE_BAKE_ON) { try { const late = group.children.filter(c => !lateSnap.has(c)); const lb = bakeLate(group, late, def.id); stats.before += lb.before; stats.after += lb.after; } catch (e) { console.error(`区域 ${def.id} 后挂件合批出错`, e); } }
  return { id: def.id, group, nav, waypoints, gates, dgates, dportals, anim, weather, stats, hf, chunks };
}

/** 每帧：传送阵旋转、熔岩呼吸、火焰、天气 */
export function updateWild(w: WildScene, dt: number, t: number, cx: number, cz: number) {
  for (const s of w.anim.spin) s.rotation.z += dt * 0.8, s.rotation.y += dt * 0.6;
  const k = 1.3 + Math.sin(t * 1.7) * 0.35;
  for (const m of w.anim.lava) { const b = m.userData.base as THREE.Color | undefined; if (b) m.color.copy(b).multiplyScalar(0.55 + 0.45 * k); else m.color.setRGB(1 * k, 0.33 * k, 0.06 * k); }
  if (FIRE_FLICK_OFF) {
  for (const f of w.anim.flames) f.scale.y = 0.85 + Math.sin(t * 12 + f.id) * 0.15;
  for (const l of w.anim.lights) l.intensity = 2 + Math.sin(t * 9 + l.id) * 0.4;
  } else {   // 11-18 专长包 v8 第 120 步：火苗与灯同一平滑噪声（均值 / 幅度同上；?off=fireflick 回原样）
    for (const f of w.anim.flames) f.scale.y = 0.7 + fireNoise(fireSeed(f), t) * 0.3;
    for (const l of w.anim.lights) l.intensity = 1.6 + fireNoise(fireSeed(l), t) * 0.8;
  }
  w.weather?.update(dt, cx, cz, t);
  for (const p of w.dportals) { const sp = p.getObjectByName('dp_spin'); if (sp && p.userData.dpOn) sp.rotation.y += dt * 0.5; const tb = p.getObjectByName('dp_tab'); if (tb) { tb.position.y = 4.6 + Math.sin(t * 1.4) * 0.15; tb.rotation.y += dt * 0.4; } }
}
