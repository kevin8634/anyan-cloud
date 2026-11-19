// 11-17g 秋林移植 · 屏幕射线（照搬画质专长包 v8 reference/autumn_forest_src.html 的 maskMat / rayMat / 合成段；?off=qlrays 回旧 GodRaysPass）
//   1) 遮罩（1/4 分辨率）：只取天空像素（深度 = 远平面）、太阳周围半径 0.45、HDR 亮度 1.6–5 之间的部分；
//   2) 径向步进：采样数按档（超高 / 高 56、中 36、低 24），衰减 0.975、跨度 0.92，IGN 抖动；高档以上 1/2 分辨率，其余 1/4；
//   3) 合成：4 点模糊 × 暖色 (1, 0.86, 0.62) × 增益 0.8 × 朝向^1.5，加在色调映射之前（线性 HDR，与 Demo 同位置）。
//   方向 / 夜里月光沿用 seasky_core.ssRays（与天空日盘同源）；室内图不画。
// 11-19 qlrayfix（Rhett 录屏「你看他的光线是会动的」，?off=qlrayfix 回旧）：
//   a) 太阳屏幕位置原来取 相机 + 太阳方向 × 900 m 再投影——Demo 相机 far = 1400，游戏相机 far = 700，900 m 的点永远在远平面外（NDC z > 1）
//      → facing 恒 0、k 恒 0，遮罩 / 步进根本没画（太阳偏离视轴 > 约 39° 时才 < 1，那时 facing 又很小）。改成在 far 以内取点（0.9 far，屏幕位置与 900 m 相同）。
//   b) 遮罩读体积光合成之前的场景（Demo 的 maskMat 读 rtScene，体积光在合成里才加）；游戏体积光是单独一道在射线之前，天空像素被加上 HG 光雾后
//      会把太阳周围整片天抬进 1.6–5 的遮罩亮度窗 → 射线成一团。Demo 户外区改读场景渲染目标（sceneRT），NaN / Inf 像素按 0 处理（原来 nanFix 之后才读）。
//   c) 合成 4 点模糊偏移按全分辨率 1 像素（Demo uVolTx·0.5 = 1/W），原来按射线 RT 半像素。
//   只在 Demo 户外区生效（cineIsDemoZone）；其它户外图（及镜渊城月光射线）保持原样。
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ssRays } from './seasky_core';
import { cineIsDemoZone } from './cine';
const QLRAYFIX_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('qlrayfix'); } catch { return false; } })();

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const IGN = 'float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }';
/** 专长包 cinematic.config.js post.rays（勿改；要改改配置并写明） */
export const QL_RAYS = { decay: 0.975, span: 0.92, maskRadius: 0.45, maskLumLo: 1.6, maskLumHi: 5.0, gain: 0.8, tint: [1.0, 0.86, 0.62] as const, facingPow: 1.5 };
/** 11-17g 镜渊城：光源（月亮）在穹顶破口里，不是天空像素 → 关掉天空深度判定，只按亮度和离光源距离取遮罩 */
export const qlRaysOpt = { skyOnly: true };
export const qlRaySamples = (q: string) => (q === 'ultra' || q === 'high' ? 56 : q === 'medium' ? 36 : 24);

export class QlRaysPass extends Pass {
  private rtMask: THREE.WebGLRenderTarget; private rtRay: THREE.WebGLRenderTarget;
  private maskMat: THREE.ShaderMaterial; private rayMat: THREE.ShaderMaterial; private compMat: THREE.ShaderMaterial;
  private q = new FullScreenQuad();
  private dir = new THREE.Vector3(); private tint = new THREE.Color(); private v = new THREE.Vector3(); private fwd = new THREE.Vector3();
  private samples = 0; private half = false; private w = 4; private h = 4;
  private fix = false; private txRay = new THREE.Vector2(); private txFull = new THREE.Vector2();
  k = 0;
  constructor(private camera: THREE.PerspectiveCamera, private sun: THREE.DirectionalLight, private depthOf: () => THREE.DepthTexture | null, quality: string, private srcOf: () => THREE.Texture | null = () => null) {
    super();
    const mk = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtMask = mk(); this.rtRay = mk();
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tDepth: { value: null }, uHasDepth: { value: 0 }, uSunUv: { value: new THREE.Vector2() }, uAsp: { value: 1 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tScene, tDepth; uniform float uHasDepth; uniform vec2 uSunUv; uniform float uAsp;
        void main(){ float sky = uHasDepth > 0.5 ? step(0.99999, texture2D(tDepth, vUv).r) : 1.0;
          vec3 c0 = texture2D(tScene, vUv).rgb; vec3 c = (c0.r + c0.g + c0.b < 1e5) ? min(max(c0, vec3(0.0)), vec3(12.0)) : vec3(0.0);
          float r = length((vUv - uSunUv) * vec2(uAsp, 1.0)); float l = dot(c, vec3(0.3, 0.5, 0.2));
          gl_FragColor = vec4(c * sky * smoothstep(${QL_RAYS.maskRadius.toFixed(2)}, 0.0, r) * smoothstep(${QL_RAYS.maskLumLo.toFixed(2)}, ${QL_RAYS.maskLumHi.toFixed(2)}, l), 1.0); }`,
    });
    this.rayMat = this.makeRay(qlRaySamples(quality));
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRay: { value: this.rtRay.texture }, uTx: { value: new THREE.Vector2() }, uK: { value: 0 }, uTint: { value: new THREE.Color() } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse, tRay; uniform vec2 uTx; uniform float uK; uniform vec3 uTint;
        void main(){ vec4 b = texture2D(tDiffuse, vUv);
          if (uK <= 0.0001) { gl_FragColor = b; return; }
          vec2 rt = uTx * 0.5;
          vec3 r = (texture2D(tRay, vUv + rt).rgb + texture2D(tRay, vUv - rt).rgb + texture2D(tRay, vUv + vec2(rt.x, -rt.y)).rgb + texture2D(tRay, vUv - vec2(rt.x, -rt.y)).rgb) * 0.25;
          gl_FragColor = vec4(b.rgb + r * uTint * uK, b.a); }`,
    });
    this.setQuality(quality);
  }
  private makeRay(n: number) {
    this.samples = n;
    return new THREE.ShaderMaterial({
      uniforms: { tMask: { value: this.rtMask.texture }, uSunUv: { value: new THREE.Vector2() } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tMask; uniform vec2 uSunUv; ${IGN}
        void main(){ const int N = ${n}; vec2 dl = (vUv - uSunUv) / float(N) * ${QL_RAYS.span.toFixed(2)}; vec2 uv = vUv - dl * ign(gl_FragCoord.xy) * 0.5; float w = 1.0; vec3 a = vec3(0.0);
          for (int i = 0; i < N; i++) { a += texture2D(tMask, uv).rgb * w; w *= ${QL_RAYS.decay.toFixed(3)}; uv -= dl; }
          gl_FragColor = vec4(a / float(N), 1.0); }`,
    });
  }
  /** 换档：采样数、射线分辨率（高档以上 1/2，其余 1/4，同 Demo） */
  setQuality(q: string) {
    const n = qlRaySamples(q); this.half = q === 'ultra' || q === 'high';
    if (n !== this.samples) { this.rayMat.dispose(); this.rayMat = this.makeRay(n); }
    this.setSize(this.w, this.h);
  }
  setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.rtMask.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    const s = this.half ? 1 : 2; this.rtRay.setSize(Math.max(1, w >> s), Math.max(1, h >> s));
    this.txRay.set(1 / Math.max(1, w >> s), 1 / Math.max(1, h >> s)); this.txFull.set(2 / Math.max(1, w), 2 / Math.max(1, h));   // compMat 用 uTx·0.5
    (this.compMat.uniforms.uTx.value as THREE.Vector2).copy(this.fix ? this.txFull : this.txRay);
  }
  /** 每帧：outdoor = 户外图。太阳方向与颜色取海天共用件（null = 共用件没跑 → 用平行光方向、暖色） */
  update(outdoor: boolean) {
    if (!outdoor) { this.k = 0; return; }
    const sv = ssRays(this.dir, this.tint);
    if (sv === null) { this.dir.copy(this.sun.position).sub(this.sun.target.position).normalize(); this.tint.setRGB(1, 1, 1); }
    const vis = sv ?? (this.dir.y > 0 ? 1 : 0);
    this.camera.getWorldDirection(this.fwd);
    const fix = !QLRAYFIX_OFF && cineIsDemoZone();
    if (fix !== this.fix) { this.fix = fix; (this.compMat.uniforms.uTx.value as THREE.Vector2).copy(fix ? this.txFull : this.txRay); }
    this.v.copy(this.dir).multiplyScalar(fix ? this.camera.far * 0.9 : 900).add(this.camera.position).project(this.camera);   // qlrayfix a)：900 m 在游戏 far 700 之外
    const facing = Math.pow(Math.max(this.fwd.dot(this.dir), 0), QL_RAYS.facingPow) * (this.v.z < 1 ? 1 : 0);
    (this.maskMat.uniforms.uSunUv.value as THREE.Vector2).set(this.v.x * 0.5 + 0.5, this.v.y * 0.5 + 0.5);
    (this.rayMat.uniforms.uSunUv.value as THREE.Vector2).set(this.v.x * 0.5 + 0.5, this.v.y * 0.5 + 0.5);
    this.maskMat.uniforms.uAsp.value = this.w / Math.max(1, this.h);
    this.k = QL_RAYS.gain * facing * Math.min(1, vis);
    (this.compMat.uniforms.uTint.value as THREE.Color).setRGB(QL_RAYS.tint[0], QL_RAYS.tint[1], QL_RAYS.tint[2]);   // 只用配置暖色（遮罩里已带天色），同 Demo
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.compMat.uniforms.uK.value = this.k;
    if (this.k > 0.0001) {
      const d = this.depthOf();
      this.maskMat.uniforms.tScene.value = (this.fix ? this.srcOf() : null) ?? readBuffer.texture; /* qlrayfix b) */ this.maskMat.uniforms.tDepth.value = d; this.maskMat.uniforms.uHasDepth.value = d && qlRaysOpt.skyOnly ? 1 : 0;
      renderer.setRenderTarget(this.rtMask); this.q.material = this.maskMat; this.q.render(renderer);
      this.rayMat.uniforms.tMask.value = this.rtMask.texture;
      renderer.setRenderTarget(this.rtRay); this.q.material = this.rayMat; this.q.render(renderer);
    }
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.q.material = this.compMat; this.q.render(renderer);
  }
  dispose() { this.rtMask.dispose(); this.rtRay.dispose(); this.maskMat.dispose(); this.rayMat.dispose(); this.compMat.dispose(); this.q.dispose(); }
}
