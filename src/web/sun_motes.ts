// 11-16 阳光浮尘：移植自 Rhett「秋林逆光 v3」浮尘段（原创代码，three.js r149 MIT；Rhett 授权直接套用）。
// 无状态：位置 = f(id, 时间) 按 mod 包在相机周围的盒子里；只在阳光里亮（查太阳阴影图 + HG 前向散射），背阴处几乎看不见。
// 每张图浓度按 map_look.ts 的 mote（湿地、秋林多，冬 / 灰烬少）；高 / 超高 1400 粒，中 600，低关。?off=motes
import * as THREE from 'three';
import { LOOK_CUR } from './map_look';
import { cineIsDemoZone } from './cine';
import { ssU } from './seasky_core';

const off = () => typeof location !== 'undefined' && /[?&]off=[^&]*\bmotes\b/.test(location.search);   // 11-19 整词匹配（原子串匹配会被 ?off=qlmotes 误伤）
// 11-19 qlmotes（?off=qlmotes 回旧）：Demo 户外区白天按 Demo 浮尘原样——粒数 1400（Demo high / medium；原中档 600）、全部粒子（原按图浓度 LOOK_CUR.mote 截取，
//   营地 0.45 / 高原 0.3 / 霜脊 0.2 …）、亮度用 Demo uSunCol = 太阳色 × 强度 × 3.4/3.5（原 × 强度 / 2.3，只有 Demo 的约 45%）。盒子 22×7×22、漂移、HG g 0.7 × 0.08、
//   阴影图判亮、点大小均已是 Demo 原式。按太阳可见度 ssK.y 过渡：夜里 / 其它户外图仍原样；低档仍不建（游戏低档无阴影图，Demo 低档 500 粒）。
const QLMOTES_OFF = () => typeof location !== 'undefined' && /[?&]off=[^&]*\bqlmotes\b/.test(location.search);
let baseN = 1400;
let pts: THREE.Points | null = null, mat: THREE.ShaderMaterial | null = null;
const _d = new THREE.Vector3();

export function makeMotes(scene: THREE.Scene, quality: string) {
  if (off() || quality === 'low' || pts) return;
  baseN = quality === 'medium' ? 600 : 1400; const N = QLMOTES_OFF() ? baseN : 1400;   // qlmotes：建 1400，非 Demo 区按原粒数画（drawRange，前 600 粒与原中档同序列）
  mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3(1, 1, 1) },
      tShadow: { value: null }, uShM: { value: new THREE.Matrix4() }, uPx: { value: 600 }, uK: { value: 1 }, uHas: { value: 0 } },
    vertexShader: /* glsl */`attribute vec4 aR; uniform float uTime, uPx, uK; uniform vec3 uCam; varying vec3 vW; varying float vA;
      void main(){
        vec3 box = vec3(22.0, 7.0, 22.0);
        vec3 p = aR.xyz * box + vec3(0.35, 0.04, 0.18) * uTime * (0.4 + aR.w) + vec3(sin(uTime * 0.4 + aR.w * 40.0) * 0.4, sin(uTime * 0.6 + aR.x * 30.0) * 0.25, cos(uTime * 0.5 + aR.z * 20.0) * 0.4);
        vec3 c = uCam + vec3(0.0, 2.0, 0.0); p = c + mod(p - c + box * 0.5, box) - box * 0.5; vW = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float sz = (0.012 + 0.02 * aR.w) * uPx / max(-mv.z, 0.1); gl_PointSize = max(sz, 1.4);
        vA = min(sz / 1.4, 1.0) * smoothstep(11.0, 6.0, length(p - c)) * smoothstep(0.3, 1.5, -mv.z) * step(aR.w, uK);   // uK = 本图浓度（按粒子随机数截取，不闪）
      }`,
    fragmentShader: /* glsl */`#include <packing>
      uniform sampler2D tShadow; uniform mat4 uShM; uniform vec3 uCam, uSunDir, uSunCol; uniform float uHas; varying vec3 vW; varying float vA;
      void main(){
        if (vA <= 0.0) discard;
        vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * vA; float lit = 1.0;
        if (uHas > 0.5) { vec4 sc = uShM * vec4(vW, 1.0); if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0) lit = step(sc.z - 0.003, unpackRGBAToDepth(texture2D(tShadow, sc.xy))); }
        float mu = dot(normalize(vW - uCam), uSunDir); const float g = 0.7; float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
        gl_FragColor = vec4(uSunCol * (hg * lit + 0.004) * a * 1.3, 1.0);
      }`,
  });
  const g = new THREE.BufferGeometry(); let s = 20261114; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const a = new Float32Array(N * 4); for (let i = 0; i < a.length; i++) a[i] = rnd();
  g.setAttribute('aR', new THREE.BufferAttribute(a, 4)); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 10; pts.name = 'sunMotes'; pts.userData.noBake = true; pts.raycast = () => {};   // 位置在着色器里算，几何全在原点：不参与镜头防穿透 / 拾取射线
  scene.add(pts);
}

/** 每帧：outdoor = 户外图（洞穴 / 副本关） */
export function updateMotes(t: number, cam: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, outdoor: boolean, rtH: number) {
  if (!pts || !mat) return;
  const dw = outdoor && !QLMOTES_OFF() && cineIsDemoZone() ? Math.max(0, Math.min(1, ssU.ssK.value.y)) : 0;   // 11-19 qlmotes：Demo 程度
  const k = outdoor ? LOOK_CUR.mote + (1 - LOOK_CUR.mote) * dw : 0; pts.visible = k > 0.01 && sun.intensity > 0.05;
  if (!pts.visible) return;
  pts.geometry.setDrawRange(0, dw > 0.001 ? 1400 : baseN);
  const u = mat.uniforms; u.uTime.value = t % 3600; u.uK.value = k; cam.getWorldPosition(u.uCam.value);
  u.uSunDir.value.copy(_d.copy(sun.position).sub(sun.target.position).normalize());
  const I = Math.min(sun.intensity, 4) / 2.3 * (1 - dw) + sun.intensity * (3.4 / 3.5) * dw; u.uSunCol.value.set(sun.color.r * I, sun.color.g * I, sun.color.b * I);   // qlmotes：Demo uSunCol
  u.uPx.value = rtH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  const sm = sun.shadow.map; u.uHas.value = sm && sun.castShadow ? 1 : 0; if (sm) { u.tShadow.value = sm.texture; u.uShM.value.copy(sun.shadow.matrix); }
}
