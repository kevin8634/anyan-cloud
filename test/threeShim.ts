// 测试用：真实 three.js，只把 WebGLRenderer 换成空实现（无 GPU 环境）
import { Vector2, Color } from '../node_modules/three/build/three.module.js';
export * from '../node_modules/three/build/three.module.js';
export class WebGLRenderer {
  shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
  autoClear = true; toneMapping = 0; toneMappingExposure = 1; outputColorSpace = 'srgb';
  domElement: unknown; info = { autoReset: true, reset() {} };
  capabilities = { isWebGL2: true, maxTextureSize: 4096 };
  private pr = 1; private w = 960; private h = 540; private rt: unknown = null;
  renderCount = 0;
  constructor(o?: { canvas?: unknown }) { this.domElement = o?.canvas; }
  setPixelRatio(p: number) { this.pr = p; } getPixelRatio() { return this.pr; }
  setSize(w: number, h: number) { this.w = w; this.h = h; }
  getSize(v: Vector2) { return v.set(this.w, this.h); }
  getDrawingBufferSize(v: Vector2) { return v.set(this.w * this.pr, this.h * this.pr); }
  setRenderTarget(rt: unknown) { this.rt = rt; } getRenderTarget() { return this.rt; }
  getClearColor(c: Color) { return c.set(0); } setClearColor() {} getClearAlpha() { return 1; } setClearAlpha() {}
  clear() {} clearDepth() {} render() { this.renderCount++; } compile() {} dispose() {}
  getContext() { return { getExtension: () => null }; }
}
