// 11-16 体积光（移植自 Rhett 的「秋林逆光」Demo，作者本人授权直接套用）：
//   沿视线在太阳阴影贴图里步进，算出每个像素视线上「被照亮的空气长度」→ HG 前向散射加光、背阴空气压暗。
//   树冠的影子会在空气里切出一道道光柱（屏幕空间径向光做不到：太阳不在画面里也有效）。
//   半分辨率步进 + 交错噪声抖动（IGN），合成时 5 点模糊；画在色调映射之前（线性 HDR），泛光会接着把光柱晕开。
//   ?off=vol / localStorage darkrock_cine_off 含 vol 关闭。
import * as THREE from 'three';
import { LOOK_CUR } from './map_look';
import { cineIsDemoZone } from './cine';
import { ssU } from './seasky_core';
// 11-19 qlvol（?off=qlvol 回旧）：Demo 户外区白天合成按 Demo compMat 原式——压暗 c *= 1 − 0.5·sh·smoothstep(4,40,tot)，加光 uSunCol·(1,.86,.66)·hg·lit·0.026，
//   hg 不封顶（g 0.62，正对太阳 ≈0.9），uSunCol = 太阳色 × 强度 × 3.4/3.5（白天 = Demo 1,0.74,0.46 × 3.4）。
//   原游戏式：压暗 0.25、hg 封顶 0.35、只加「比均匀雾多出的部分」(lit − 0.55·lit) × 0.012 —— 正对太阳时只有 Demo 的约 1/12，背光看是一层薄雾、没有 Demo 那种发光的光雾 / 光柱。
//   按太阳可见度（ssK.y）在两式间过渡：夜里月光、其它户外图、室内 / 副本 / 钟井仍是原式。
const QLVOL_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qlvol'); } catch { return false; } })();
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const IGN = 'float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }';

/** 体积光步进片元（步数编进循环常量） */
const volFS = (N: number) => `#include <packing>
        varying vec2 vUv; uniform sampler2D tDepth, tShadow; uniform mat4 uInvVP, uShM; uniform vec3 uCam; uniform float uFrame, uMaxL; ${IGN}
        void main(){
          float d = texture2D(tDepth, vUv).r; vec4 h = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 wp = h.xyz / h.w;
          vec3 rd = wp - uCam; float L = length(rd); rd /= max(L, 1e-3); L = min(L, uMaxL);
          float st = L / ${N.toFixed(1)}; float j = ign(gl_FragCoord.xy + uFrame * 5.588);
          float lit = 0.0, tot = 0.0;
          for (int i = 0; i < ${N}; i++) {
            vec3 p = uCam + rd * st * (float(i) + j); vec4 sc = uShM * vec4(p, 1.0); float v = 1.0;
            if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) v = step(sc.z - 0.002, unpackRGBAToDepth(texture2D(tShadow, sc.xy)));
            float den = exp(-max(p.y - uCam.y + 1.6, 0.0) * 0.07); lit += v * den * st; tot += den * st;
          }
          gl_FragColor = vec4(lit, tot, 0.0, 1.0);
        }`;
export class VolLightPass extends Pass {
  private steps = 16;
  /** 11-17g 按档换步数（专长包 v8：高 16 / 中 8），变了才重编 */
  setSteps(n: number) { const N = Math.max(1, n); if (N === this.steps) return; this.steps = N; this.volMat.fragmentShader = volFS(N); this.volMat.needsUpdate = true; }
  private rt: THREE.WebGLRenderTarget;
  private volMat: THREE.ShaderMaterial; private compMat: THREE.ShaderMaterial;
  private q = new FullScreenQuad();
  private frame = 0;
  /** 合成强度（0 = 关）；外部按地图 / 时段调 */
  k = 1;
  constructor(private camera: THREE.PerspectiveCamera, private sun: THREE.DirectionalLight, private depth: THREE.DepthTexture, steps: number, private depthOf: () => THREE.DepthTexture | null = () => null) {
    super();
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rt.texture.generateMipmaps = false;
    const N = Math.max(1, steps); this.steps = N;
    this.volMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: depth }, tShadow: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uShM: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uFrame: { value: 0 }, uMaxL: { value: 62 } },
      vertexShader: VS,
      fragmentShader: volFS(N),
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tVol: { value: this.rt.texture }, uTx: { value: new THREE.Vector2() }, uInvVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() }, uK: { value: 1 }, uDark: { value: 0.25 }, uWarm: { value: 1 }, uDemoW: { value: 0 } },
      vertexShader: VS,
      fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D tDiffuse, tVol; uniform vec2 uTx; uniform mat4 uInvVP; uniform vec3 uCam, uSunDir, uSunCol; uniform float uK, uDark, uWarm, uDemoW;
        void main(){
          vec4 base = texture2D(tDiffuse, vUv); vec3 c = base.rgb;
          vec2 v = texture2D(tVol, vUv).rg * 0.4 + (texture2D(tVol, vUv + uTx * vec2(1.5, 0.5)).rg + texture2D(tVol, vUv - uTx * vec2(1.5, 0.5)).rg
                 + texture2D(tVol, vUv + uTx * vec2(-0.5, 1.5)).rg + texture2D(tVol, vUv - uTx * vec2(-0.5, 1.5)).rg) * 0.15;
          vec4 h = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 rd = normalize(h.xyz / h.w - uCam); float mu = dot(rd, uSunDir);
          const float g = 0.62; float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566 + 0.012;
          float sh = 1.0 - v.x / max(v.y, 1e-3);
          vec3 c0 = c * (1.0 - uDark * sh * smoothstep(4.0, 40.0, v.y) * uK);
          c0 += uSunCol * mix(vec3(1.0), vec3(1.0, 0.86, 0.66), uWarm) * min(hg, 0.35) * (v.x - 0.55 * v.y * (1.0 - sh)) * 0.012 * uK;   // 只加与均匀雾的差：亮束比雾亮、阴影比雾暗（技能包 32）
          if (uDemoW > 0.001) {   // 11-19 qlvol：Demo compMat 原式
            vec3 c1 = c * (1.0 - 0.5 * sh * smoothstep(4.0, 40.0, v.y) * uK) + uSunCol * (3.4 / 3.5) * vec3(1.0, 0.86, 0.66) * hg * v.x * 0.026 * uK;
            c0 = mix(c0, c1, uDemoW);
          }
          c = c0;
          gl_FragColor = vec4(c, base.a);
        }`,
    });
  }
  setSize(w: number, h: number) { this.rt.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); this.compMat.uniforms.uTx.value.set(2 / Math.max(1, w), 2 / Math.max(1, h)); }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const cam = this.camera, sun = this.sun, sm = sun.shadow.map;
    const on = this.k > 0.001 && !!sm && sun.castShadow;
    const cu = this.compMat.uniforms;
    cu.tDiffuse.value = readBuffer.texture; cu.uK.value = on ? this.k : 0; cu.uWarm.value = LOOK_CUR.vt;   // 光束暖度按图：冷光图（霜脊 / 镜渊 / 钟楼）光束不染暖
    if (on) {
      const vu = this.volMat.uniforms; vu.tDepth.value = this.depthOf() ?? this.depth;
      const inv = vu.uInvVP.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
      cu.uInvVP.value.copy(inv); cam.getWorldPosition(vu.uCam.value); cu.uCam.value.copy(vu.uCam.value);
      vu.tShadow.value = sm!.texture; vu.uShM.value.copy(sun.shadow.matrix); vu.uFrame.value = (this.frame = (this.frame + 1) % 64);
      cu.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
      const s = sun.color, I = sun.intensity; cu.uSunCol.value.set(s.r * I, s.g * I, s.b * I);
      cu.uDemoW.value = !QLVOL_OFF && cineIsDemoZone() ? Math.max(0, Math.min(1, ssU.ssK.value.y)) : 0;   // 11-19 qlvol
      this.q.material = this.volMat; renderer.setRenderTarget(this.rt); this.q.render(renderer);
    }
    this.q.material = this.compMat; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.q.render(renderer);
  }
  dispose() { this.rt.dispose(); this.volMat.dispose(); this.compMat.dispose(); this.q.dispose(); }
}
