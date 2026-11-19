// ======================================================================
// 11-18 秋林移植 · 泛光（照搬画质专长包 v9.1 reference/autumn_forest_src.html 的 brightMat / downMat / upMat / 合成段 c+=tBloom*uBloomK）
//   Rhett 11-18 22:32「野外光影不如秋林逆光」：差距之一是泛光——游戏用 three UnrealBloom（强度 0.5–0.9、阈值 1.05、5 级高斯），
//   Demo 是 0.07 的轻泛光（软阈值：亮度 1.1 以上按 (l−1.1)/l /(1+0.1l) 取，封顶 30），游戏的泛光把逆光边缘和天空糊成一片，暗部反差被抬平。
//   做法与 Demo 同：1/2 分辨率亮部 → 4 级 2×2 降采样 → 3×3 帐篷上采样逐级相加 → 线性 HDR 里 ×0.07 加回（色调映射之前，与 Demo 同位置）。
//   只在户外秋林调色开着时替换 UnrealBloom（室内 / 熔岩 / 低档不变）；?off=qlbloom 回旧
// ======================================================================
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
/** 专长包 Demo 数值（勿改；要改写明来源） */
export const QL_BLOOM = { k: 0.07, knee: 1.1, cap: 30, levels: 5 };

export class QlBloomPass extends Pass {
  private bl: THREE.WebGLRenderTarget[] = [];
  private bright: THREE.ShaderMaterial; private down: THREE.ShaderMaterial; private up: THREE.ShaderMaterial; private comp: THREE.ShaderMaterial;
  private q = new FullScreenQuad();
  constructor() {
    super();
    for (let i = 0; i < QL_BLOOM.levels; i++) this.bl.push(new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.bright = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTx;
        vec3 k(vec2 o){ vec3 c = min(texture2D(tSrc, vUv + o * uTx).rgb, vec3(${QL_BLOOM.cap.toFixed(1)})); float l = dot(c, vec3(.2126, .7152, .0722)); return c * max(l - ${QL_BLOOM.knee.toFixed(2)}, 0.) / max(l, 1e-3) / (1. + l * .1); }
        void main(){ gl_FragColor = vec4((k(vec2(-1,-1)) + k(vec2(1,-1)) + k(vec2(-1,1)) + k(vec2(1,1))) * .25, 1.); }` });
    this.down = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTx; void main(){ vec3 c = texture2D(tSrc, vUv + uTx * vec2(-1,-1)).rgb + texture2D(tSrc, vUv + uTx * vec2(1,-1)).rgb + texture2D(tSrc, vUv + uTx * vec2(-1,1)).rgb + texture2D(tSrc, vUv + uTx * vec2(1,1)).rgb; gl_FragColor = vec4(c * .25, 1.); }` });
    this.up = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTx: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTx; void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.;
        c += texture2D(tSrc, vUv + uTx * vec2(1,0)).rgb * 2. + texture2D(tSrc, vUv + uTx * vec2(-1,0)).rgb * 2. + texture2D(tSrc, vUv + uTx * vec2(0,1)).rgb * 2. + texture2D(tSrc, vUv + uTx * vec2(0,-1)).rgb * 2.;
        c += texture2D(tSrc, vUv + uTx).rgb + texture2D(tSrc, vUv - uTx).rgb + texture2D(tSrc, vUv + uTx * vec2(1,-1)).rgb + texture2D(tSrc, vUv + uTx * vec2(-1,1)).rgb; gl_FragColor = vec4(c / 16., 1.); }` });
    this.comp = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tBloom: { value: this.bl[0].texture }, uK: { value: QL_BLOOM.k } }, vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse, tBloom; uniform float uK; void main(){ vec4 s = texture2D(tDiffuse, vUv); gl_FragColor = vec4(s.rgb + texture2D(tBloom, vUv).rgb * uK, s.a); }` });
  }
  setSize(w: number, h: number) { for (let i = 0; i < this.bl.length; i++) this.bl[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))); }
  private pass(r: THREE.WebGLRenderer, m: THREE.ShaderMaterial, t: THREE.WebGLRenderTarget | null) { this.q.material = m; r.setRenderTarget(t); this.q.render(r); }
  render(r: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const W = readBuffer.width, H = readBuffer.height, bl = this.bl, ac = r.autoClear;
    this.bright.uniforms.tSrc.value = readBuffer.texture; this.bright.uniforms.uTx.value.set(0.5 / W, 0.5 / H); this.pass(r, this.bright, bl[0]);
    for (let i = 1; i < bl.length; i++) { this.down.uniforms.tSrc.value = bl[i - 1].texture; this.down.uniforms.uTx.value.set(0.5 / bl[i - 1].width, 0.5 / bl[i - 1].height); this.pass(r, this.down, bl[i]); }
    r.autoClear = false;
    for (let i = bl.length - 1; i > 0; i--) { this.up.uniforms.tSrc.value = bl[i].texture; this.up.uniforms.uTx.value.set(1 / bl[i].width, 1 / bl[i].height); this.pass(r, this.up, bl[i - 1]); }
    r.autoClear = ac;
    this.comp.uniforms.tDiffuse.value = readBuffer.texture; this.pass(r, this.comp, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { for (const t of this.bl) t.dispose(); this.bright.dispose(); this.down.dispose(); this.up.dispose(); this.comp.dispose(); this.q.dispose(); }
}
