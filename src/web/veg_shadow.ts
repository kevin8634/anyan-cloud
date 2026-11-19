// ======================================================================
// 11-17 草花底部假阴影（?off=vegshadow，中档以上）
//   草不投真阴影（几十万根叶片进阴影 pass 拖帧率，专长包 v8「草花不进阴影」），只做两件便宜的：
//   · 接收主阴影（材质本来就 receiveShadow）
//   · 每丛 / 每朵一张贴地小圆片：根部一圈软 AO + 朝背光方向拉长的「太阳影子」（长度 ∝ 植株高 / tan(太阳仰角)，太阳落下就收回）
//   圆片与草分块一一对应，直接共用草的实例矩阵缓冲（不多占显存）；固定按实例哈希抬高 2–5 厘米（专长包第 27 步，不用 polygonOffset / 排序）；
//   镜头外 fadeA→fadeB 米淡出，分块同时整块隐藏。黑色 alpha 叠加，与顺序无关。进不了倒影（userData.noRefl）。
// ======================================================================
import * as THREE from 'three';
import { CU } from './cine';

const VS = /* glsl */ `
uniform vec4 cineSun; uniform vec4 uFfCam; uniform vec4 uVsK;   // uVsK: x = 浓度, y = 淡出半径, z = 植株本地高, w = 圆片本地半径
varying vec2 vQ; varying float vA;
void main() {
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  vec3 c = M[3].xyz;
  float hs = length(M[1].xyz) * uVsK.z;                 // 植株高（米）
  vec3 w = (M * vec4(position.x * uVsK.w, 0.0, position.z * uVsK.w, 1.0)).xyz;
  float rw = max(length(M[0].xyz) * uVsK.w, 0.02);      // 圆片世界半径
  vec2 q = w.xz - c.xz;
  float sl = length(cineSun.xz);
  vec2 sd = sl > 1e-3 ? -cineSun.xz / sl : vec2(0.0);
  float len = clamp(hs * 0.6 * sl / max(cineSun.y, 0.15), 0.0, min(hs * 2.5, 1.2)) * cineSun.w;   // 上限 1.2 米：坡地上拉长部分不至于悬空太多
  w.xz += sd * max(dot(q, sd), 0.0) / rw * len;           // 背光那半边拉长成影子
  float hh = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453);
  w.y = c.y + 0.02 + 0.03 * hh;
  vQ = position.xz;
  vA = 1.0 - smoothstep(uVsK.y * 0.7, uVsK.y, length(c.xz - uFfCam.xz));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = /* glsl */ `
uniform vec4 uVsK; uniform vec4 cineSun;
varying vec2 vQ; varying float vA;
void main() {
  float r = length(vQ); if (r > 1.0 || vA <= 0.0) discard;
  float a = 1.0 - smoothstep(0.1, 1.0, r); a *= a;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uVsK.x * (0.55 + 0.45 * cineSun.w) * vA);
}`;

const MATS = new Map<string, THREE.ShaderMaterial>();
let GEO: THREE.BufferGeometry | null = null;
/** 一个分块草 / 花实例网格的假阴影圆片（共用 im 的实例矩阵）。rLocal = 圆片在实例本地坐标的半径，hLocal = 植株本地高度；
 *  cam = 草的主镜头 uniform（uFfCam，xyz = 主镜头位置），fadeR = 淡出半径（米） */
export function vegContactShadow(im: THREE.InstancedMesh, o: { rLocal: number; hLocal: number; k: number; cam: THREE.IUniform<THREE.Vector4>; fadeR: number }): THREE.InstancedMesh {
  const key = `${o.rLocal}|${o.hLocal}|${o.k}|${o.fadeR}`;
  let mat = MATS.get(key);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      uniforms: { cineSun: { value: CU.sun }, uFfCam: o.cam, uVsK: { value: new THREE.Vector4(o.k, o.fadeR, o.hLocal, o.rLocal) } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    MATS.set(key, mat);
  }
  const geo = GEO ?? (GEO = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2));
  const d = new THREE.InstancedMesh(geo, mat, im.count);
  d.instanceMatrix = im.instanceMatrix;
  d.boundingSphere = im.boundingSphere ? im.boundingSphere.clone() : null;
  if (d.boundingSphere) d.boundingSphere.radius += 3;   // 影子拉长余量
  d.frustumCulled = true; d.castShadow = false; d.receiveShadow = false;
  d.renderOrder = 1; d.name = im.name + '_cs';
  d.userData.noRefl = true; d.userData.dynDone = true; d.userData.noBake = true;
  return d;
}
