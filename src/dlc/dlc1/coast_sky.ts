// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 天空 / 天气（纯程序化，不用生成图）
//   1. 天空穹顶（跟随镜头，盖住本体渐变天空球）：阴天层云 fbm + 地平线一道暖色破口（概念图 A / C）；
//      风暴（uStorm）→ 紫黑积雨云压低、云底被闪电照亮（概念图 B 远处紫黑雷云）
//   2. 闪电：远处折线闪电（自发光带状网格，0.2 秒内 2–3 次闪烁）+ 全场闪光（uFlash：天空 / 海面 / 地面 / 半球光一起亮）
//   3. 雨：镜头周围斜向雨线（GPU 顶点里下落，风向倾斜），风暴权重淡入
//   4. 场景光照 / 雾：在本体（含昼夜）设置的值上按风暴程度压暗、雾拉近（检测本体是否重设，避免叠乘）
//   5. 贴地海雾：2–3 层慢速滚动雾片（C 区最浓、A 区淡、B 区风暴时被风吹散成雨雾）
//   档位：low = 天空 2 层噪声 / 雨 500 线 / 无雾片；medium = 4 层 / 1800 线 / 1 层雾；high = 5 层 / 3600 线 / 3 层；ultra = 5 层 / 5200 线 / 3 层
// ======================================================================
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { COAST_GLSL } from './coast_layout';
import { seaSkyOn, seaSkyDomeMaterial, COAST_CLOUD_LESS } from './coast_seasky';   // 11-15 海天 v2（?off=seasky 回旧版穹顶）

export const skyU = { uTime: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
  uHorizon: { value: new THREE.Color(0x8a9496) }, uReef: { value: 0 },
  /** 11-15 贴地海雾片颜色（旧版固定 0.70/0.76/0.78；海天 v2 按天色走，夜里不再发灰白） */
  uMistC: { value: new THREE.Color(0.70, 0.76, 0.78) } };
const q = () => curQuality;
const TIER = { low: { oct: 2, rain: 500, fog: 0 }, medium: { oct: 4, rain: 1800, fog: 1 }, high: { oct: 5, rain: 3600, fog: 3 }, ultra: { oct: 5, rain: 5200, fog: 3 } } as const;

const SKY_FS = (oct: number) => `
uniform float uTime; uniform float uStorm; uniform float uFlash; uniform vec3 uFlashDir; uniform vec3 uHorizon; uniform float uReef;
varying vec3 vD;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < ${oct}; i++) { v += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vD); float y = d.y;
  // 云层投影到一个平面（越近地平线越扁）
  vec2 cp = d.xz / max(0.08, y + 0.12) * 1.3;
  float t = uTime * (0.006 + 0.02 * uStorm);
  float c = fbm(cp + vec2(t, t * 0.4));
  float c2 = fbm(cp * 2.2 - vec2(t * 1.8, 0.0) + 4.0);
  float cloud = smoothstep(${COAST_CLOUD_LESS ? 'mix(0.42, 0.3, uStorm)' : '0.3'}, ${COAST_CLOUD_LESS ? 'mix(0.82, 0.75, uStorm)' : '0.75'}, c * 0.75 + c2 * 0.35 + uStorm * 0.25);   // 11-19 ?off=coastcloud 回旧：晴天 0.3–0.75 → 0.42–0.82
  // 平静：灰蓝阴天，地平线淡暖亮带；风暴：墨蓝 / 紫黑
  vec3 zen = mix(vec3(0.22, 0.27, 0.30), vec3(0.025, 0.03, 0.04), uStorm);
  vec3 hor = uHorizon;
  vec3 col = mix(hor, zen, smoothstep(-0.02, 0.55, y));
  vec3 cloudC = mix(vec3(0.42, 0.45, 0.47), vec3(0.055, 0.06, 0.075), uStorm);
  vec3 cloudD = mix(vec3(0.20, 0.23, 0.26), vec3(0.018, 0.02, 0.028), uStorm);
  vec3 cl = mix(cloudD, cloudC, smoothstep(0.35, 0.95, c2));
  col = mix(col, cl, cloud * smoothstep(-0.05, 0.12, y) * (0.75 + 0.25 * uStorm));
  // 暖色破口（东北偏北，概念图 A / C 远处的夕光）——风暴时被盖住
  vec3 gapDir = normalize(vec3(0.35, 0.05, -0.94));
  float gap = pow(max(0.0, dot(d, gapDir)), 6.0) * (1.0 - smoothstep(0.0, 0.25, y)) * smoothstep(-0.05, 0.02, y);
  col += vec3(0.95, 0.70, 0.45) * gap * 0.55 * (1.0 - uStorm) * (1.0 - cloud * 0.6);
  // 风暴云底的紫色电光 + 闪电照亮
  float fl = pow(max(0.0, dot(d, uFlashDir)), 3.0);
  col += vec3(0.55, 0.45, 0.85) * uFlash * (0.25 + 1.6 * fl) * (0.4 + cloud);
  col += vec3(0.035, 0.025, 0.06) * uStorm * cloud * smoothstep(0.0, 0.3, y) * (0.5 + 0.5 * n(cp * 0.7 + uTime * 0.05));
  // 礁湾：雾更白
  col = mix(col, hor * 1.05, uReef * 0.25 * (1.0 - smoothstep(0.0, 0.35, y)));
  // 地平线以下融进雾色
  col = mix(col, hor, 1.0 - smoothstep(-0.12, 0.02, y));
  col = mix(col, hor, (1.0 - smoothstep(0.0, 0.18, y)) * 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let dome: THREE.Mesh | null = null, rain: THREE.LineSegments | null = null, bolt: THREE.Mesh | null = null;
const fogSheets: THREE.Mesh[] = [];
const rainU = { uTime: skyU.uTime, uRain: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: 0 }, uFlash: skyU.uFlash };
export const skyStats = { oct: 0, rainN: 0, fog: 0, bolts: 0 };
export function skyBuild(root: THREE.Object3D) {
  const T = TIER[q()];
  const mat = seaSkyOn() ? seaSkyDomeMaterial(skyU) : new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SKY_FS(T.oct) });
  dome = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), mat); dome.name = 'coast_sky'; dome.frustumCulled = false; dome.renderOrder = -0.5;
  dome.userData.outlineParameters = { visible: false };
  root.add(dome);
  // 雨线
  const N = T.rain, pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 30, z = (Math.random() - 0.5) * 70, sp = 0.8 + Math.random() * 0.5, len = 0.6 + Math.random() * 0.7;
    for (let e = 0; e < 2; e++) { pos.set([x, y, z], (i * 2 + e) * 3); seed.set([sp, len, e, Math.random()], (i * 2 + e) * 4); } }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const rm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: rainU,
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform float uWind; varying float vA; varying float vE;
      void main(){ float sp = aSeed.x * 22.0; float y = mod(position.y - uTime * sp, 30.0);
        vec3 p = vec3(position.x, y, position.z);
        p.xz = mod(p.xz - uCam.xz + 35.0, 70.0) - 35.0 + uCam.xz;   // 绕镜头循环
        p.x += (30.0 - y) * uWind * 0.35;
        vec3 dir = normalize(vec3(uWind * 0.35, -1.0, 0.05));
        p += dir * aSeed.y * aSeed.z * 1.6 * (1.0 - 0.0);
        p.y += uCam.y - 12.0;
        vE = aSeed.z; vA = 0.5 + 0.5 * aSeed.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uRain; uniform float uFlash; varying float vA; varying float vE; void main(){ float a = uRain * vA * 0.32 * mix(0.15, 1.0, vE); gl_FragColor = vec4(vec3(0.62, 0.70, 0.76) * (1.0 + uFlash * 2.0), a); }` });
  rain = new THREE.LineSegments(rg, rm); rain.frustumCulled = false; rain.name = 'coast_rain'; rain.visible = false; rain.renderOrder = 4;
  root.add(rain);
  // 闪电（折线带状网格，每次重新生成顶点）
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3 * 2), 3));
  bolt = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 3.4), transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  bolt.frustumCulled = false; bolt.visible = false; bolt.name = 'coast_bolt'; root.add(bolt);
  // 贴地海雾
  for (let i = 0; i < T.fog; i++) {
    const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true, uniforms: { ...THREE.UniformsLib.fog, uMistC: skyU.uMistC, uTime: skyU.uTime, uK: { value: [0.22, 0.16, 0.1][i] }, uSeed: { value: i * 17.3 }, uStorm: skyU.uStorm, uO: { value: new THREE.Vector2() } },
      vertexShader: `varying vec3 vW; varying vec2 vP; uniform vec2 uO;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vP = w.xz - uO; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uMistC; uniform float uTime; uniform float uK; uniform float uSeed; uniform float uStorm; varying vec3 vW; varying vec2 vP;
        ${COAST_GLSL}
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){ vec2 p = vW.xz * 0.035 + vec2(uTime * 0.012, uTime * 0.006) + uSeed;
          float v = n(p) * 0.55 + n(p * 2.3 + 3.0) * 0.3 + n(p * 5.1) * 0.15;
          float reef = csReef(vP), sea = smoothstep(-6.0, 10.0, csShore(vP));
          float dens = mix(0.35, 1.0, max(reef, sea * 0.8)) * (1.0 - uStorm * csStorm(vP) * 0.6);
          float a = smoothstep(0.42, 0.85, v) * uK * dens;
          float camD = length(cameraPosition - vW); a *= smoothstep(3.0, 14.0, camD);
          gl_FragColor = vec4(uMistC, a);
          #include <fog_fragment>
        }` });
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), fm); fg.rotation.x = -Math.PI / 2; fg.position.y = 0.35 + i * 0.55; fg.name = 'coast_fog' + i; fg.renderOrder = 5; fg.frustumCulled = false;
    fg.userData.outlineParameters = { visible: false };
    root.add(fg); fogSheets.push(fg);
  }
  Object.assign(skyStats, { oct: T.oct, rainN: N, fog: T.fog });
}
export function fogOrigin(O: { x: number; z: number }) { for (const f of fogSheets) ((f.material as THREE.ShaderMaterial).uniforms.uO.value as THREE.Vector2).set(O.x, O.z); }

/** 生成一道闪电（世界坐标起点在高空，落到远处海面） */
export function strikeBolt(from: THREE.Vector3, to: THREE.Vector3, cam: THREE.Vector3) {
  if (!bolt) return;
  const pts: THREE.Vector3[] = []; const N = 24;
  for (let i = 0; i <= N; i++) { const t = i / N; const p = from.clone().lerp(to, t); if (i && i < N) { p.x += (Math.random() - 0.5) * 14 * (1 - t * 0.5); p.z += (Math.random() - 0.5) * 14 * (1 - t * 0.5); } pts.push(p); }
  const arr = (bolt.geometry.getAttribute('position') as THREE.BufferAttribute);
  const side = new THREE.Vector3(); let k = 0; const w = 0.9;
  for (let i = 0; i < N && k < 96; i++) {
    const a = pts[i], b = pts[i + 1]; const v = cam.clone().sub(a).cross(b.clone().sub(a)).normalize().multiplyScalar(w * (1 - i / N * 0.6));
    side.copy(v);
    const q1 = a.clone().add(side), q2 = a.clone().sub(side), q3 = b.clone().add(side), q4 = b.clone().sub(side);
    for (const p of [q1, q2, q3, q3, q2, q4]) { arr.setXYZ(k++, p.x, p.y, p.z); }
  }
  for (; k < arr.count; k++) arr.setXYZ(k, 0, -999, 0);
  arr.needsUpdate = true; bolt.visible = true; skyStats.bolts++;
}
export function boltOff() { if (bolt) bolt.visible = false; }

export function skyUpdate(cam: THREE.Vector3, rainK: number, wind: number) {
  if (dome) dome.position.copy(cam);
  rainU.uRain.value = rainK; rainU.uCam.value.copy(cam); rainU.uWind.value = wind;
  if (rain) rain.visible = rainK > 0.02;
  for (const f of fogSheets) { f.position.x = Math.round(cam.x / 8) * 8; f.position.z = Math.round(cam.z / 8) * 8; }
}
export const rainOn = () => !!rain?.visible;

// ---------------------------------------------------------------- 场景光照 / 雾（叠在本体值上）
type Lt = { o: THREE.Light; base: number; set: number };
let scene: THREE.Scene | null = null, hemi: Lt | null = null, sun: Lt | null = null, baseSky: THREE.Object3D | null = null, hidSky = false;
const fogBase = { c: new THREE.Color(), set: new THREE.Color(), near: 0, far: 0, setFar: -1 };
const STORM_FOG = new THREE.Color(0x0c1418);
export function bindScene(obj: THREE.Object3D) {
  let s: THREE.Object3D = obj; while (s.parent) s = s.parent;
  if (!(s as THREE.Scene).isScene) return false;
  if (scene === s) return true;
  scene = s as THREE.Scene; hemi = null; sun = null; baseSky = null;
  // 本体渐变天空球（uniforms top / mid / bottom）：在海岸里由本模块的穹顶代替（它在描边效果里会被整片描成暗紫）
  scene.children.forEach(o => { const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms; if (u && 'top' in u && 'mid' in u && 'bottom' in u) baseSky = o; });
  scene.children.forEach(o => { const l = o as THREE.Light; if ((l as THREE.HemisphereLight).isHemisphereLight && !hemi) hemi = { o: l, base: l.intensity, set: -1 }; if ((l as THREE.DirectionalLight).isDirectionalLight && !sun) sun = { o: l, base: l.intensity, set: -1 }; });
  return true;
}
/** k = 风暴程度，flash = 闪光；pal = 11-15 海天 v2 的雾色（按钟点；给了就代替本体雾色作基准）；返回当前（雾色）亮度 */
export function lightApply(k: number, flash: number, reef: number, pal?: THREE.Color): number {
  if (!scene) return 1;
  if (baseSky?.visible) { baseSky.visible = false; hidSky = true; }
  for (const L of [hemi, sun]) { if (!L) continue; if (Math.abs(L.o.intensity - L.set) > 1e-4) L.base = L.o.intensity;
    // v4（海天开着时）：闪电不再把半球光 / 平行光整场抬高（原来峰值整屏变淡紫）；亮度只给云内局部和海面反光（coast_seasky / coast_sea）
    const fl = pal ? (L === hemi ? 0.25 : 0.2) : (L === hemi ? 3.5 : 1.5);
    const mul = L === hemi ? (1 - 0.55 * k) * (1 + flash * fl) : (1 - 0.82 * k) * (1 + flash * fl);
    L.o.intensity = L.base * mul; L.set = L.o.intensity; }
  const fog = scene.fog as THREE.Fog | null; const bg = scene.background as THREE.Color | null;
  if (fog) {
    if (!fog.color.equals(fogBase.set)) fogBase.c.copy(fog.color);
    if (fog.far !== fogBase.setFar) { fogBase.far = fog.far; fogBase.near = fog.near; }
    fog.color.copy(pal ?? fogBase.c).lerp(STORM_FOG, k * 0.85).lerp(new THREE.Color(0x9aa4b0), reef * 0.18).multiplyScalar(1 + flash * (pal ? 0.12 : 1.8));
    fogBase.set.copy(fog.color);
    fog.far = fogBase.far * (1 - 0.45 * k) * (1 - 0.15 * reef); fog.near = fogBase.near * (1 - 0.6 * k); fogBase.setFar = fog.far;
    if (bg) bg.copy(fog.color);
    skyU.uHorizon.value.copy(fog.color);
    return fog.color.r * 0.3 + fog.color.g * 0.59 + fog.color.b * 0.11;
  }
  return 1;
}
/** 离开海岸：把光照 / 雾还原成本体值 */
export function lightRestore() {
  if (!scene) return;
  if (hidSky && baseSky) { baseSky.visible = true; hidSky = false; }
  for (const L of [hemi, sun]) { if (L && Math.abs(L.o.intensity - L.set) < 1e-4) L.o.intensity = L.base; if (L) L.set = -1; }
  const fog = scene.fog as THREE.Fog | null;
  if (fog && fog.color.equals(fogBase.set)) { fog.color.copy(fogBase.c); (scene.background as THREE.Color | null)?.copy(fogBase.c); }
  if (fog && fog.far === fogBase.setFar) { fog.far = fogBase.far; fog.near = fogBase.near; }
  fogBase.setFar = -1; fogBase.set.setRGB(-1, -1, -1);
}
