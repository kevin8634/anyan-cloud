// ======================================================================
// DLC1「负棺人」立棺墓碑表现（11-04 立棺墓碑，负棺人_技能特效.md §3.1 / §3.5）
//   立棺：铁棺砸立入地（0.08 秒落下、棺底插进土里）、四周墓土翻起；棺盖刻痕一道冷白魂火（亮度 ≤ 1.2）；碑周贴地薄冷雾。
//   凋魂墓碑（腐朽之地）：从棺底向外 0.8 秒爬满的树根状紫灰腐蚀纹（边缘不规则、薄油膜微光）+ 贴地暗紫油烟（普通混合，不加色）。
//   收棺：留一个土坑 6 秒。回响：灰青亡者（去饱和、70% 亮度、无白闪）。
//   不画几何圆环；所有材质 userData.outlineParameters = { visible: false }；不用加色混合。
// 只 import three 和本体 gfx（同 coffin_model.ts）。动画按 performance.now() 走（onBeforeRender 驱动，离屏时也会被扫掉）。
// ======================================================================
import * as THREE from 'three';
import { toon } from '../../web/gfx';
import { makeCoffin } from './coffin_model';

type P2 = { x: number; z: number };
/** 色板（特效文档 §1 / §3.5） */
export const TOMB_PAL = { soulFire: 0xdce6e8, ghost: 0xa9c3c6, ghostDeep: 0x5e7478, corrode1: 0x4a3a5c, corrode2: 0x6b4f7a, corrodeDark: 0x1a1420, sheen: 0x8c6e9e, soil: 0x2e241c, soil2: 0x4a3a2c };
/** 魂火亮度上限（文档：冷白，亮度 ≤ 1.2） */
export const SOUL_FIRE_K = 1.1;
/** 回响亡者亮度（文档：70%） */
export const ECHO_K = 0.7;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
export const noOl = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) for (const x of Array.isArray(m) ? m : [m]) x.userData.outlineParameters = { visible: false }; }); return o; };
/** 普通混合的半透明色（不加色、不过曝） */
export const flatMat = (c: number, k: number, op: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: op, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
/** 回响亡者材质：灰青、去饱和、70% 亮度 */
export const echoMat = (op = 0.55) => flatMat(TOMB_PAL.ghost, ECHO_K, op);

function hash(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
const ROOT_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
// ---------------------------------------------------------------- 软烟（着色器：径向衰减 × 噪声，普通混合；不依赖贴图）
const SMOKE_FRAG = `
uniform vec3 col; uniform float op; uniform float t; uniform float seed;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.07; a *= 0.5; } return s; }
void main(){
  vec2 p = vUv * 2.0 - 1.0; float d = length(p);
  float f = fbm(p * 2.2 + vec2(t * 0.07, -t * 0.05));
  float a = smoothstep(1.0, 0.15, d + (f - 0.5) * 0.55) * (0.35 + 0.65 * f);
  gl_FragColor = vec4(col * (0.85 + 0.3 * f), clamp(a, 0.0, 1.0) * op);
}`;
let smokeGeo: THREE.PlaneGeometry | null = null;
/** 软烟片：flat = 贴地平放；否则每帧朝向相机 */
function smokeSprite(c: number, op: number, size: number, flat = false): THREE.Mesh {
  smokeGeo ??= new THREE.PlaneGeometry(1, 1);
  const m = new THREE.ShaderMaterial({ vertexShader: ROOT_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(c) }, op: { value: op }, t: { value: 0 }, seed: { value: Math.random() * 20 } } });
  m.userData.outlineParameters = { visible: false };
  const o = new THREE.Mesh(smokeGeo, m); o.scale.set(size, flat ? size : size * 0.6, 1); o.frustumCulled = false; o.renderOrder = 2;
  if (flat) o.rotation.x = -Math.PI / 2;
  o.userData.flat = flat;
  return o;
}
/** 软烟片的透明度 / 时间 / 朝向（每帧调） */
function smokeSet(o: THREE.Mesh, op: number, tt: number, cam?: THREE.Camera) {
  const u = (o.material as THREE.ShaderMaterial).uniforms; u.op.value = op; u.t.value = tt % 1000;
  if (!o.userData.flat && cam) o.quaternion.copy(cam.quaternion);
}

// ---------------------------------------------------------------- 腐蚀纹（贴地着色器，普通混合）
const ROOT_FRAG = `
uniform float t; uniform float grow; uniform float seed; uniform float alpha; uniform float pit;
uniform vec3 c1; uniform vec3 c2; uniform vec3 cd; uniform vec3 ch;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 p = vUv * 2.0 - 1.0; float d = length(p); float a = atan(p.y, p.x);
  if (pit > 0.5) {   // 收棺后的土坑：中心深色、边缘不规则
    float e = 0.55 + (fbm(vec2(a * 2.0, 3.0)) - 0.5) * 0.35;
    float m = smoothstep(e, e * 0.35, d);
    gl_FragColor = vec4(mix(c2, cd, m), m * 0.85 * alpha); return;
  }
  float w = (fbm(p * 2.6) - 0.5) * 1.6 * d;           // 越往外越弯
  float aa = a + w;
  float r1 = abs(sin(aa * 4.0 + fbm(p * 5.0) * 1.5));   // 8 条主根
  float r2 = abs(sin(aa * 11.0 + fbm(p * 8.0 + 3.0) * 3.0));   // 细根
  float wid = mix(0.34, 0.09, clamp(d, 0.0, 1.0));
  float root = smoothstep(wid, 0.0, r1) * (0.75 + 0.25 * fbm(p * 12.0));
  float fine = smoothstep(wid * 0.55, 0.0, r2) * smoothstep(0.25, 0.5, d) * step(0.55, fbm(p * 3.0 + 7.0));
  float edge = 0.92 + (fbm(vec2(a * 1.7, 5.0)) - 0.5) * 0.4;   // 边缘不规则（不是正圆）
  float reach = grow * edge;
  float front = smoothstep(reach, reach - 0.18, d);
  float m = max(root, fine * 0.8) * front;
  float stain = smoothstep(reach * 0.55, 0.0, d) * 0.45 * (0.55 + 0.45 * fbm(p * 4.0));
  float sheen = pow(fbm(p * 3.5 + vec2(t * 0.04, -t * 0.03)), 3.0) * 0.55;   // 薄油膜反光
  vec3 col = mix(cd, mix(c1, c2, fbm(p * 6.0)), m) + ch * sheen * m;
  float al = clamp(m * 0.92 + stain * (1.0 - m), 0.0, 0.9) * alpha;
  gl_FragColor = vec4(col, al);
}`;
function rootMat(pit = false) {
  const m = new THREE.ShaderMaterial({ vertexShader: ROOT_VERT, fragmentShader: ROOT_FRAG, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { t: { value: 0 }, grow: { value: pit ? 1 : 0 }, seed: { value: Math.random() * 10 }, alpha: { value: 1 }, pit: { value: pit ? 1 : 0 },
      c1: { value: new THREE.Color(TOMB_PAL.corrode1) }, c2: { value: new THREE.Color(pit ? TOMB_PAL.soil2 : TOMB_PAL.corrode2) }, cd: { value: new THREE.Color(TOMB_PAL.corrodeDark) }, ch: { value: new THREE.Color(TOMB_PAL.sheen) } } });
  m.userData.outlineParameters = { visible: false };
  return m;
}

// ---------------------------------------------------------------- 墓碑（立棺）
/** 墓碑整组：r = 墓碑范围；rot = 凋魂墓碑（腐朽之地）。原点 = 墓碑脚下 */
export function makeTombGrave(r: number, rot: boolean): THREE.Group {
  const g = new THREE.Group(); g.name = 'coffin_grave';
  const t0 = now();
  // 铁棺：微倾成碑，棺底插进土里 0.4 米
  const c = makeCoffin(TOMB_PAL.soulFire, 2, 1.25); c.name = 'grave_coffin';
  c.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;   // 碑上的发光件（铭灯）压到魂火冷白 ≤ 1.2
    if (m && (m as THREE.Material).type === 'MeshBasicMaterial' && !o.userData.soulWin) m.color.setHex(TOMB_PAL.soulFire).multiplyScalar(SOUL_FIRE_K * 0.9); });
  const restY = 0.775 * 1.25 - 0.4, tilt = { x: 0.1, z: 0.07 };
  c.rotation.set(tilt.x, 0, tilt.z); c.position.set(0, restY + 1.6, 0); g.add(c);
  // 棺盖刻痕里的魂火（冷白，亮度 ≤ 1.2）
  const groove = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1.05), flatMat(TOMB_PAL.soulFire, SOUL_FIRE_K, 0.85)); groove.name = 'grave_soulfire';
  groove.position.set(0, 0.05, 0.3 * 1.25 * 0.5 + 0.1); c.add(groove);
  const groove2 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.03), groove.material); groove2.position.set(0, 0.36, groove.position.z); c.add(groove2);
  // 墓土堆（不规则，翻开的湿黑土）
  const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), toon(TOMB_PAL.soil)); mound.scale.set(1.15, 0.2, 1); mound.position.y = 0.02; mound.name = 'grave_mound';
  { const pa = mound.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pa.count; i++) { const k = 0.85 + hash(i, 3) * 0.3; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i), pa.getZ(i) * k); } mound.geometry.computeVertexNormals(); }
  mound.frustumCulled = false; g.add(mound);
  // 翻起的墓土块（落地后留在碑脚）
  const clods: { m: THREE.Mesh; v: THREE.Vector3; p: THREE.Vector3 }[] = [];
  const clodMat = [toon(TOMB_PAL.soil), toon(TOMB_PAL.soil2), toon(0x3a342c)];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + hash(i, 1) * 0.5, sp = 1.6 + hash(i, 2) * 2.4;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + hash(i, 5) * 0.09, 0), clodMat[i % 3]); m.position.set(0, 0.1, 0); m.visible = false;
    clods.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 2.2 + hash(i, 7) * 2.2, Math.sin(a) * sp), p: new THREE.Vector3(Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4) }); g.add(m);
  }
  // 碑周贴地薄冷雾
  const mist: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const s = smokeSprite(0x8e9a9c, 0.0, r * 1.1, true); const a = i / 6 * Math.PI * 2; s.position.set(Math.cos(a) * r * 0.45, 0.12 + i * 0.02, Math.sin(a) * r * 0.45); s.userData.a = a; s.userData.base = 0.2; mist.push(s); g.add(s); }
  // 凋魂墓碑：腐蚀纹 + 暗紫油烟
  let roots: THREE.Mesh | null = null; const oily: THREE.Mesh[] = [];
  if (rot) {
    roots = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.3, r * 2.3), rootMat()); roots.name = 'grave_corrode'; roots.rotation.x = -Math.PI / 2; roots.position.y = 0.04; roots.renderOrder = 1; roots.frustumCulled = false; g.add(roots);
    for (let i = 0; i < 9; i++) { const s = smokeSprite(TOMB_PAL.corrode1, 0, r * (0.7 + hash(i, 4) * 0.4), i % 3 !== 0); const a = i / 9 * Math.PI * 2 + 0.3; s.position.set(Math.cos(a) * r * 0.55, 0.3, Math.sin(a) * r * 0.55); s.userData.a = a; s.userData.rr = 0.3 + hash(i, 9) * 0.5; oily.push(s); g.add(s); }
  }
  g.userData.tomb = { t0, r, rot };
  noOl(g);
  // 动画：0–0.08 砸落；0.08 墓土翻起；0.08–0.9 腐蚀纹爬满；之后雾 / 烟缓慢翻涌、魂火微抖
  let last = t0;
  const step = (_r?: unknown, _s?: unknown, cam?: THREE.Camera) => {
    const tt = now(), k = tt - t0, dt = Math.min(0.1, Math.max(0, tt - last)); last = tt;
    if (k < 0.08) c.position.y = restY + 1.6 * (1 - (k / 0.08) ** 2);
    else if (k < 0.3) { const u = (k - 0.08) / 0.22; c.position.y = restY - 0.06 * Math.sin(u * Math.PI) * (1 - u); c.rotation.z = tilt.z + 0.03 * Math.sin(u * 18) * (1 - u); }
    else { c.position.y = restY; c.rotation.z = tilt.z; }
    if (k >= 0.08) for (const cl of clods) {
      if (!cl.m.visible && !cl.m.userData.done) { cl.m.visible = true; cl.m.position.copy(cl.p); }
      if (cl.m.userData.done) continue;
      cl.v.y -= 12 * dt; cl.m.position.addScaledVector(cl.v, dt); cl.m.rotation.x += dt * 6; cl.m.rotation.z += dt * 4;
      if (cl.m.position.y <= 0.04 && cl.v.y < 0) { cl.m.position.y = 0.04; cl.m.userData.done = true; }
    }
    for (const s of mist) { s.userData.a += dt * 0.12; const a = s.userData.a; s.position.x = Math.cos(a) * r * 0.45; s.position.z = Math.sin(a) * r * 0.45; smokeSet(s, s.userData.base * Math.min(1, Math.max(0, (k - 0.1) / 0.6)), tt + a * 10, cam); }
    if (roots) { const u = (roots.material as THREE.ShaderMaterial).uniforms; u.t.value = tt % 1000; u.grow.value = Math.min(1, Math.max(0, (k - 0.08) / 0.8)); }
    for (const s of oily) { s.userData.a -= dt * 0.08; const a = s.userData.a, rr = r * (0.35 + s.userData.rr * Math.min(1, k / 0.9)); s.position.set(Math.cos(a) * rr, (s.userData.flat ? 0.15 : 0.45) + 0.08 * Math.sin(tt * 0.7 + a * 3), Math.sin(a) * rr); smokeSet(s, (s.userData.flat ? 0.38 : 0.28) * Math.min(1, Math.max(0, (k - 0.3) / 0.8)) * (0.8 + 0.2 * Math.sin(tt * 0.9 + a)), tt + a * 10, cam); }
    (groove.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.15 * Math.sin(tt * 3.1) * Math.sin(tt * 1.7);
  };
  mound.onBeforeRender = step;
  return g;
}

// ---------------------------------------------------------------- 瞬时件（土坑 / 腐土烟 / 泥土下陷）
const live: { o: THREE.Object3D; until: number }[] = [];
function sweep() { const t = now(); for (let i = live.length - 1; i >= 0; i--) if (t >= live[i].until) { live[i].o.parent?.remove(live[i].o); live.splice(i, 1); } }
function spawn(sc: THREE.Object3D, o: THREE.Object3D, dur: number, upd: (k: number, cam?: THREE.Camera) => void) {
  sweep();
  const t0 = now(); noOl(o); o.frustumCulled = false; o.traverse(c => { c.frustumCulled = false; });
  const drv = (o as THREE.Mesh).isMesh ? o : o.children[0];
  if (drv) drv.onBeforeRender = (_r, _s, cam) => { const k = (now() - t0) / dur; if (k >= 1) { o.visible = false; setTimeout(() => o.parent?.remove(o), 0); return; } upd(k, cam); };
  sc.add(o); live.push({ o, until: t0 + dur + 1 });
  upd(0);
}
/** 收棺：棺被拽出地面后留下的土坑（6 秒） */
export function tombPit(sc: THREE.Object3D, at: P2, y: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), rootMat(true)); m.rotation.x = -Math.PI / 2; m.position.set(at.x, y + 0.035, at.z); m.name = 'coffin_pit'; m.renderOrder = 1;
  spawn(sc, m, 6, k => { (m.material as THREE.ShaderMaterial).uniforms.alpha.value = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; });
}
/** 腐朽之地：站在腐蚀地面上的敌人脚下冒一缕暗紫油烟 / 立棺减速：脚边泥土被吸住般下陷（扬起一点灰土） */
export function tombPuff(sc: THREE.Object3D, at: P2, y: number, kind: 'rot' | 'slow') {
  const s = smokeSprite(kind === 'rot' ? TOMB_PAL.corrode1 : 0x4a4038, 0, kind === 'rot' ? 0.9 : 0.7);
  s.position.set(at.x + (Math.random() - 0.5) * 0.3, y + 0.15, at.z + (Math.random() - 0.5) * 0.3);
  const y0 = s.position.y, base = kind === 'rot' ? 0.42 : 0.3;
  spawn(sc, s, kind === 'rot' ? 0.9 : 0.6, (k, cam) => {
    if (kind === 'rot') { s.position.y = y0 + k * 0.7; s.scale.set(0.6 + k * 0.7, (0.6 + k * 0.7) * 0.7, 1); }
    else { s.position.y = y0 - k * 0.12; s.scale.set(0.7 + k * 0.4, 0.3, 1); }
    smokeSet(s, base * Math.sin(Math.min(1, k) * Math.PI), now(), cam);
  });
}
export const tombFxDebug = () => ({ live: live.length });

// ---------------------------------------------------------------- 回响亡者（coffin_fx 用）
/** 灰青亡者：负棺人轮廓（兜帽 + 背棺）、无脸；普通混合、70% 亮度 */
export function echoGhost(s = 1): THREE.Group {
  const g = new THREE.Group(); g.name = 'echo_ghost';
  const m = echoMat(0.5), m2 = flatMat(TOMB_PAL.ghostDeep, ECHO_K, 0.45);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.46 * s, 1.55 * s, 8, 1, true), m); body.position.y = 0.78 * s; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23 * s, 10, 8), m); head.position.set(0, 1.62 * s, 0.03 * s); head.scale.set(1, 1.1, 1); g.add(head);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.5 * s, 8, 1, true), m2); hood.position.set(0, 1.75 * s, -0.04 * s); hood.rotation.x = -0.25; g.add(hood);
  const arm = new THREE.Group(); arm.name = 'echo_arm'; arm.position.set(0.3 * s, 1.3 * s, 0); g.add(arm);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.75 * s, 6), m); fore.position.y = -0.36 * s; arm.add(fore);
  const cf = makeCoffin(TOMB_PAL.ghost, 0, 0.6 * s); cf.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.material = m2; }); cf.position.set(0, 1.0 * s, -0.42 * s); cf.rotation.y = Math.PI; g.add(cf);
  return noOl(g);
}
/** 回响用的灰青弹体（取代发亮的魂球） */
export function echoWisp(s = 1): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 8, 6), echoMat(0.55)); g.add(b);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.7 * s, 6), flatMat(TOMB_PAL.ghostDeep, ECHO_K, 0.4)); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.38 * s; g.add(tail);
  return noOl(g);
}
