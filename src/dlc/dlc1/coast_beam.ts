// ======================================================================
// DLC1 沉钟海岸 · 灯塔体积光束（从 coast_dress 拆出，11-15 海天 v3 一起升级）
//   两道相背的开口圆锥（加法混合，沿长度衰减 + 视角软边 + 噪声尘埃）
//   v3 风暴（uRain）：光束在雨雾里更「实」——软边变宽、外层散射晕、贴着光束的斜向雨丝闪亮、远端被雨雾吃掉；闪电（uFlash）瞬间压过光束
// ======================================================================
import * as THREE from 'three';

export type BeamUniforms = { uK: THREE.IUniform<number>; uTime: THREE.IUniform<number>; uRain: THREE.IUniform<number>; uFlash: THREE.IUniform<number> };
/** low = 段数少；uTime 按引用共享 */
export function makeBeam(low: boolean, uTime: THREE.IUniform<number>): { group: THREE.Group; mat: THREE.ShaderMaterial } {
  const beamG = new THREE.CylinderGeometry(0.35, 12, 150, low ? 16 : 32, low ? 1 : 12, true); beamG.translate(0, -75, 0); beamG.rotateZ(Math.PI / 2);   // 指向 +x
  const haloG = new THREE.CylinderGeometry(1.2, 26, 150, low ? 12 : 24, 1, true); haloG.translate(0, -75, 0); haloG.rotateZ(Math.PI / 2);
  const uniforms: BeamUniforms = { uK: { value: 1 }, uTime, uRain: { value: 0 }, uFlash: { value: 0 } };
  const VS = `varying vec3 vW; varying vec3 vN; varying float vT; void main(){ vT = clamp(position.x / 150.0, 0.0, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const NOISE = `float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
  const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms,
    vertexShader: VS,
    fragmentShader: `uniform float uK; uniform float uTime; uniform float uRain; uniform float uFlash; varying vec3 vW; varying vec3 vN; varying float vT;
        ${NOISE}
        void main(){ vec3 V = normalize(cameraPosition - vW); float edge = pow(abs(dot(normalize(vN), V)), mix(1.6, 1.0, uRain));
          float fall = pow(1.0 - vT, mix(1.7, 2.2, uRain)) * smoothstep(0.0, 0.03, vT);
          // v4 尘埃：细颗粒（约 0.6 米）+ 很弱的大尺度起伏，像素盖住多颗时淡成平均 → 不再成一块块斑
          float fp = length(fwidth(vW));
          float grain = n3(vW * 1.7 + vec3(uTime * 0.5, uTime * 0.2, uTime * 0.35)) * 0.6 + n3(vW * 3.9 - vec3(uTime * 0.3, 0.0, uTime * 0.6)) * 0.4;
          float gK = 1.0 - smoothstep(0.25, 0.9, fp * 3.9);
          float dust = 0.8 + 0.08 * (n3(vW * 0.05 + vec3(uTime * 0.05)) - 0.5) + 0.22 * (grain - 0.5) * gK;
          // 雨丝：细、竖直拉长、快速下落；远处（一个像素盖住几道雨丝）淡成均匀的亮度
          float streak = n3(vW * vec3(3.2, 0.12, 3.2) + vec3(uTime * 1.5, uTime * 9.0, 0.0));
          float sK = 1.0 - smoothstep(0.3, 1.0, fp * 3.2);
          dust += uRain * (0.25 + 0.9 * mix(0.12, smoothstep(0.66, 0.9, streak), sK));
          float a = edge * fall * dust * uK * (1.0 - 0.6 * min(uFlash, 1.0)); gl_FragColor = vec4(vec3(0.72, 0.86, 1.0) * a, a); }` });
  // 外层散射晕（只在雨雾里出现）：更宽更淡，让光束有「穿过雨雾」的体积
  const hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms,
    vertexShader: VS,
    fragmentShader: `uniform float uK; uniform float uTime; uniform float uRain; uniform float uFlash; varying vec3 vW; varying vec3 vN; varying float vT;
        ${NOISE}
        void main(){ vec3 V = normalize(cameraPosition - vW); float edge = pow(abs(dot(normalize(vN), V)), 2.5);
          float fall = pow(1.0 - vT, 2.6) * smoothstep(0.0, 0.05, vT);
          float mist = 0.85 + 0.15 * n3(vW * 0.06 + vec3(uTime * 0.25, -uTime * 0.1, 0.0));   // v4 雾晕起伏收小（原来 ±45% 成斑块）
          float a = edge * fall * mist * uK * uRain * 0.22 * (1.0 - 0.6 * min(uFlash, 1.0)); gl_FragColor = vec4(vec3(0.66, 0.8, 0.95) * a, a); }` });
  const group = new THREE.Group();
  const b1 = new THREE.Mesh(beamG, bm); b1.rotation.z = -0.05; const b2 = new THREE.Mesh(beamG, bm); b2.rotation.y = Math.PI; b2.rotation.z = 0.05;   // 稍微下压，扫过海面
  const h1 = new THREE.Mesh(haloG, hm); h1.rotation.z = -0.05; const h2 = new THREE.Mesh(haloG, hm); h2.rotation.y = Math.PI; h2.rotation.z = 0.05;
  for (const m of [b1, b2, h1, h2]) { m.frustumCulled = false; m.renderOrder = 7; }
  h1.name = h2.name = 'coast_beam_halo';
  group.add(b1, b2); if (!low) group.add(h1, h2);
  group.name = 'coast_beam';
  return { group, mat: bm };
}
