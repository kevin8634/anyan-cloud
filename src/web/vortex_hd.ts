// 11-16 传送门漩涡：魔法技能级动效（Rhett 11-16 10:36 指令；规格见 07 交接 1116c / 对话中的「传送门漩涡魔法动效规格」）
//   贴图（vortex_tex.ts，gpt-image-2 生成的灰度图，按门色染色）+ 着色器分层：
//     1 深洞核（中心暗、深处慢转的远漩涡，有纵深）
//     2 主漩涡：螺旋纹按半径扭转（里快外慢）+ 两次采样交叉缩放 = 连续往中心吸
//     3 反转层（高 / 超高）：第二层反向、放大、半透明，叠出体积
//     4 边缘能量环：碎纹（sparks）按极坐标流动侵蚀亮边，偶尔闪电弧
//     5 吸入粒子：纯 GPU 无状态 Points（高 160 / 中 80），从门前螺旋飞进中心
//     6 加色光晕：门外一圈柔光随脉冲呼吸（不加新点光源，免重编材质）
//   HDR 峰值 ≤ 2.5（避免泛白）；低画质或 ?off=vortex（localStorage darkrock_cine_off 含 vortex）回旧版 portalMaterial。
//   返回 Group：调用方照旧设 name（'inner' / 'dp_beam'）、position、visible。
import * as THREE from 'three';
import { curQuality, ENV_T, portalMaterial } from './gfx';
import { VORTEX_SWIRL, VORTEX_SPARKS } from './vortex_tex';

let offC: boolean | null = null;
/** 自查用：?vxq=high|medium 强制漩涡档位（沙盒 swiftshader 以中 / 高画质启动会 OOM，只能低档启动） */
function vxQ(): string { try { return (typeof location !== 'undefined' && new URLSearchParams(location.search).get('vxq')) || curQuality; } catch { return curQuality; } }
export function vortexHdOn(): boolean {
  if (offC === null) {
    offC = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(s => s.trim()).includes('vortex');
    } catch { offC = false; }
  }
  return !offC && vxQ() !== 'low';
}

let texS: THREE.Texture | null = null, texP: THREE.Texture | null = null;
function textures(): [THREE.Texture, THREE.Texture] {
  if (!texS) {
    const L = new THREE.TextureLoader();
    texS = L.load(VORTEX_SWIRL); texS.wrapS = texS.wrapT = THREE.ClampToEdgeWrapping;
    texP = L.load(VORTEX_SPARKS); texP.wrapS = texP.wrapT = THREE.RepeatWrapping;
    for (const t of [texS, texP]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; }
  }
  return [texS!, texP!];
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

function swirlMaterial(color: THREE.Color, rift: boolean, hi: boolean, seed: number) {
  const [tS, tP] = textures();
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    defines: hi ? { VX_HI: 1 } : {},
    uniforms: { time: ENV_T, color: { value: color }, rift: { value: rift ? 1 : 0 }, seed: { value: seed }, tS: { value: tS }, tP: { value: tP } },
    vertexShader: VS,
    fragmentShader: `uniform float time; uniform vec3 color; uniform float rift; uniform float seed; uniform sampler2D tS; uniform sampler2D tP; varying vec2 vUv;
      mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      // 螺旋纹：按半径扭转 + 交叉缩放（两次采样，相位错开半周期）→ 连续往中心吸
      float swirl(vec2 d, float spin, float twist, float flow){
        float r = length(d);
        vec2 q = rot(spin + twist * (1.0 - r) * (1.0 - r)) * d;
        float p = fract(flow);
        float s1 = texture2D(tS, q * exp2(p) * 0.5 + 0.5).r;
        float s2 = texture2D(tS, q * exp2(p - 1.0) * 0.5 + 0.5).r;
        return mix(s1, s2, p);                   // p=1 时 s2 正好等于 p=0 时的 s1 → 无跳变
      }
      void main(){
        vec2 d = (vUv - 0.5) * 2.0;
        vec2 q = rift > 0.5 ? vec2(d.x * 1.15, d.y) : d;
        float r = length(q), a = atan(q.y, q.x);
        float t = time + seed * 17.0;
        // 边缘：碎纹侵蚀（极坐标流动）
        vec2 pu = vec2(a / 6.2832 * 3.0, r * 1.2 - t * 0.35);
        float spk = texture2D(tP, pu).r;
        float R = 0.94 + (spk - 0.5) * (rift > 0.5 ? 0.12 : 0.06) + 0.015 * sin(a * 5.0 + t * 1.7);
        if (r > R) discard;
        // 主漩涡（里快外慢）
        float m1 = swirl(q, -t * 0.45, 2.6, t * 0.22);
        float body = m1;
      #ifdef VX_HI
        float m2 = swirl(q * 0.78, t * 0.31 + 1.7, -1.8, t * 0.15 + 0.5);
        body = max(body, m2 * 0.55) + m2 * 0.18;
      #endif
        // 深洞核：中心暗，深处一圈慢转的远漩涡（纵深感）
        float core = smoothstep(0.42, 0.0, r);
        float deep = swirl(q * 2.4, -t * 0.9, 1.0, t * 0.4) * smoothstep(0.05, 0.32, r) * core;
        float armMask = smoothstep(0.08, 0.5, r);
        vec3 c = color * 0.16;                                       // 底色（深）
        c += color * body * armMask * 1.7;                          // 染色的能量丝
        c += mix(color, vec3(1.0), 0.55) * pow(body * armMask, 2.5) * 1.1;   // 丝的亮芯偏白
        c = mix(c, color * (0.02 + deep * 0.5), core * 0.9);         // 中心压暗 + 远漩涡
        // 边缘能量环 + 偶发电弧
        float rimW = smoothstep(R - 0.12, R - 0.01, r);
        float arc = smoothstep(0.62, 0.95, spk) * step(0.82, fract(sin(floor(t * 3.0 + seed * 9.0) * 12.9898) * 43758.5)); 
        c += mix(color, vec3(1.0), 0.25) * rimW * (0.7 + spk * 1.2);
        c += vec3(0.9, 0.95, 1.0) * arc * rimW * 1.2;
        float pulse = 0.92 + 0.08 * sin(t * 2.1);
        c *= pulse;
        c = min(c, vec3(2.5));                                       // HDR 峰值上限
        float alpha = clamp(0.86 + rimW * 0.14, 0.0, 1.0) * smoothstep(R, R - 0.025, r);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

function haloMat(color: THREE.Color, seed: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: ENV_T, color: { value: color }, seed: { value: seed } },
    vertexShader: VS,
    fragmentShader: `uniform float time; uniform vec3 color; uniform float seed; varying vec2 vUv;
      void main(){
        vec2 d = (vUv - 0.5) * 2.0; float r = length(d);
        float g = smoothstep(1.0, 0.55, r) * smoothstep(0.3, 0.62, r);     // 门边外一圈
        float br = 0.5 + 0.15 * sin(time * 2.1 + seed * 17.0);
        gl_FragColor = vec4(color * g * g * br, 1.0);
      }`,
  });
}

function particles(color: THREE.Color, w: number, h: number, n: number, seed: number) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), sd = new Float32Array(n * 2);
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) { sd[i * 2] = rnd(); sd[i * 2 + 1] = rnd(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('sd', new THREE.BufferAttribute(sd, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(w, h));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: ENV_T, color: { value: color }, hsz: { value: new THREE.Vector2(w * 0.5, h * 0.5) }, pxH: { value: 900 } },
    vertexShader: `uniform float time; uniform vec2 hsz; uniform float pxH; attribute vec2 sd; varying float vA;
      void main(){
        float t = fract(time * (0.16 + sd.y * 0.12) + sd.x);     // 0 → 1：从外缘 / 门前飞向中心
        float e = t * t;
        float ang = sd.x * 6.2832 + e * (3.5 + sd.y * 2.0);
        float rr = mix(1.25 + sd.y * 0.35, 0.06, e);
        vec3 p = vec3(cos(ang) * rr * hsz.x, sin(ang) * rr * hsz.y, (1.0 - e) * (0.35 + sd.y * 0.9));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.045 + sd.y * 0.05) * (1.0 - e * 0.6);
        float px = sz * pxH * projectionMatrix[1][1] * 0.5 / max(-mv.z, 0.1);
        vA = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.8, t) * min(px / 1.5, 1.0);   // 小于 1.5 px 时按面积减淡，不碎成点
        gl_PointSize = max(px, 1.5);
      }`,
    fragmentShader: `uniform vec3 color; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
        float k = (1.0 - d); gl_FragColor = vec4(mix(color, vec3(1.0), 0.5 * k) * k * k * vA * 1.6, 1.0); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = true;
  const sz = new THREE.Vector2();
  pts.onBeforeRender = (r) => { r.getDrawingBufferSize(sz); m.uniforms.pxH.value = sz.y; };
  return pts;
}

/** 漩涡（w×h 椭圆，门面在 xy 平面、本地 z 朝外）。低画质 / ?off=vortex 返回旧版单面片。 */
export function makeVortex(color: THREE.ColorRepresentation, w: number, h: number, rift = false): THREE.Object3D {
  if (!vortexHdOn()) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), portalMaterial(color, rift));
    m.material.userData.noBake = true; m.material.userData.outlineParameters = { visible: false };
    return m;
  }
  const q = vxQ(), hi = q === 'high' || q === 'ultra';
  const col = new THREE.Color(color);
  { const lum = col.r * 0.2126 + col.g * 0.7152 + col.b * 0.0722; if (lum > 0.42) col.multiplyScalar(0.42 / lum); }   // 亮色门（金 / 浅蓝）压到同一亮度，免泛白
  const seed = ((col.r * 7.1 + col.g * 3.3 + col.b * 1.7 + w * 0.37 + h * 0.21) % 1 + 1) % 1;
  const g = new THREE.Group(); g.userData.vortexHd = true;
  const main = new THREE.Mesh(new THREE.PlaneGeometry(w, h), swirlMaterial(col, rift, hi, seed));
  main.renderOrder = 2; g.add(main);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.55, h * 1.4), haloMat(col, seed)); halo.position.z = -0.02; halo.renderOrder = 1; g.add(halo);
  const pts = particles(col, w, h, hi ? 160 : 80, Math.floor(seed * 1000) + 7); pts.renderOrder = 3; g.add(pts);
  for (const o of [main, halo, pts]) { const mm = (o as THREE.Mesh).material as THREE.Material; mm.userData.noBake = true; mm.userData.outlineParameters = { visible: false }; }
  return g;
}
