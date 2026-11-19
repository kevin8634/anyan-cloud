// ======================================================================
// Rhett 11-18 DLC 欢迎动画 / 选角背景的「活图」着色器：一张定稿概念图 + 代码动态（不调用视频生成，零费用）
//   分层视差：没有深度图，按画面高度（下 = 近）+ 亮度近似深度，镜头缓推 + 鼠标微视差
//   水面：地平线以下横向细波纹扰动 + 钟鸣同心涟漪 + 碎光
//   雾：两层流动 fbm，冷青绿；光：从光源（月 / 天窗）径向 6 采样的光束；粒子：两层上浮微光（水下气泡 / 余烬）
//   景深：uDof > 0 时对远处（画面上半）做 8 采样模糊；暗角
// 同一段片元着色器两处用：欢迎动画（独立 WebGL 画布，LiveBg 类）与选角背景（three ShaderMaterial，selhud.ts）
// ======================================================================

export const LIVE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex; uniform sampler2D uTex2;
uniform float uMix, uTime, uZoom, uFog, uRays, uDof, uVig, uBright, uFade;
uniform vec2 uRes, uImg, uImg2, uPan, uMouse, uRayPos, uRipPos;
uniform float uHorizon, uRip, uMotes;
uniform vec3 uTint, uMoteCol;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
// 屏幕 uv → 图片 uv（cover 裁切 + 推镜 + 平移）
vec2 coverUv(vec2 uv, vec2 img){
  float va = uRes.x / max(uRes.y, 1.0), ta = img.x / max(img.y, 1.0);
  vec2 k = va > ta ? vec2(1.0, ta / va) : vec2(va / ta, 1.0);
  return (uv - 0.5) * k / uZoom + 0.5 + uPan;
}
vec3 samp(sampler2D t, vec2 uv, vec2 img, float near){
  vec2 u = coverUv(uv, img);
  u += uMouse * (0.004 + near * 0.012);                       // 视差：近处位移大
  float below = smoothstep(uHorizon - 0.02, uHorizon + 0.06, 1.0 - uv.y);   // 水面（画面下部）
  u.x += below * min(uRip * 4.0, 1.0) * (sin(uv.y * 140.0 - uTime * 1.6) * 0.0012 + sin(uv.y * 57.0 + uTime * 0.9) * 0.0016);
  vec2 rd = uv - uRipPos; rd.x *= uRes.x / uRes.y; float rr = length(rd);
  float ring = sin(rr * 90.0 - uTime * 3.2) * exp(-rr * 6.0) * uRip * below;      // 钟鸣涟漪
  u += normalize(rd + 1e-4) * ring * 0.004;
  vec3 c = texture2D(t, u).rgb;
  if (uDof > 0.0) {   // 景深：远处（画面上半）模糊，8 采样圆盘
    float r = uDof * (1.0 - near) * 0.006; vec3 acc = c;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; acc += texture2D(t, u + vec2(cos(a), sin(a)) * r * vec2(uRes.y / uRes.x, 1.0)).rgb; }
    c = acc / 9.0;
  }
  return c;
}
void main(){
  vec2 uv = vUv;
  float near = smoothstep(0.25, 1.0, 1.0 - uv.y);
  vec3 c = samp(uTex, uv, uImg, near);
  if (uMix > 0.001) c = mix(c, samp(uTex2, uv, uImg2, near), uMix);
  // 光束：朝光源径向取 6 个亮度
  if (uRays > 0.0) {
    vec2 d = (uRayPos - uv) / 6.0; vec2 p = uv; float acc = 0.0;
    for (int i = 0; i < 6; i++) { p += d; vec3 s = texture2D(uTex, coverUv(p, uImg)).rgb; acc += max(dot(s, vec3(0.3, 0.5, 0.2)) - 0.35, 0.0); }
    float fall = exp(-length((uv - uRayPos) * vec2(uRes.x / uRes.y, 1.0)) * 1.6);
    c += uTint * acc * uRays * 0.5 * fall * (0.8 + 0.2 * sin(uTime * 0.7));
  }
  // 雾：两层流动
  float f1 = fbm(uv * vec2(3.0, 6.0) + vec2(uTime * 0.03, uTime * 0.005));
  float f2 = fbm(uv * vec2(5.0, 9.0) - vec2(uTime * 0.05, 0.0) + 3.0);
  float band = exp(-pow((1.0 - uv.y - uHorizon) * 4.0, 2.0));      // 地平线附近最浓
  c = mix(c, uTint * 0.55, clamp(uFog * (f1 * 0.6 + f2 * 0.4) * (0.35 + band * 0.65), 0.0, 0.6));
  // 水面碎光
  float below = smoothstep(uHorizon, uHorizon + 0.08, 1.0 - uv.y);
  float sp = pow(vn(vec2(uv.x * 260.0, uv.y * 40.0 + uTime * 0.6)), 18.0) * below * min(uRip * 4.0, 1.0);   // 11-18 Rhett「向上飘动的蓝光去掉」：碎光只跟涟漪走，选角背景 ripK=0 → 不再有竖条上飘
  c += uTint * sp * 0.9;
  // 上浮微光（两层）
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 26.0 : 48.0, sp2 = L == 0 ? 0.035 : 0.022;
    vec2 g = vec2(uv.x * sc * uRes.x / uRes.y, uv.y * sc - uTime * sp2 * sc);
    vec2 id = floor(g), fp = fract(g) - 0.5;
    float rnd = h21(id + float(L) * 17.0);
    vec2 o = vec2(sin(uTime * 0.6 + rnd * 6.28) * 0.25, (rnd - 0.5) * 0.6);
    float m = smoothstep(0.09, 0.0, length(fp - o)) * step(0.82, rnd) * (0.5 + 0.5 * sin(uTime * 2.0 + rnd * 40.0));
    c += uMoteCol * m * uMotes * (L == 0 ? 0.9 : 0.5);
  }
  c *= uBright;
  vec2 vd = uv - 0.5; c *= 1.0 - uVig * smoothstep(0.3, 0.85, length(vd * vec2(1.0, 0.85)) * 1.2);
  gl_FragColor = vec4(c * uFade, 1.0);
}`;

export const LIVE_VERT = /* glsl */ `
attribute vec2 p; varying vec2 vUv;
void main(){ vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

/** 每张图的动态参数（地平线 = 从下往上量的比例；光源 / 涟漪 = 屏幕 uv，左上为 0,0） */
export interface LiveLook { horizon: number; rays: [number, number]; rip: [number, number]; ripK: number; fog: number; raysK: number; motes: number; tint: [number, number, number]; mote: [number, number, number]; zoom0: number; zoom1: number; pan0: [number, number]; pan1: [number, number] }
export const LOOK_DEF: LiveLook = { horizon: 0.3, rays: [0.5, -0.05], rip: [0.5, 0.75], ripK: 0.0, fog: 0.35, raysK: 0.6, motes: 0.6, tint: [0.35, 0.85, 0.82], mote: [0.55, 1.0, 0.92], zoom0: 1.0, zoom1: 1.06, pan0: [0, 0], pan1: [0, 0] };

/** 欢迎动画用的独立 WebGL 画布（不碰游戏渲染器；关掉时 loseContext 释放显存） */
export class LiveBg {
  gl: WebGLRenderingContext | null; prog: WebGLProgram | null = null;
  private tex: (WebGLTexture | null)[] = [null, null]; private size: [number, number][] = [[1, 1], [1, 1]];
  private U: Record<string, WebGLUniformLocation | null> = {};
  constructor(public cv: HTMLCanvasElement, maxW = 1600) {
    this.maxW = maxW;
    this.gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    const gl = this.gl; if (!gl) return;
    const sh = (t: number, src: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn('欢迎动画着色器', gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, LIVE_VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, LIVE_FRAG)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('欢迎动画着色器链接失败'); this.gl = null; return; }
    this.prog = pr; gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uTex', 'uTex2', 'uMix', 'uTime', 'uZoom', 'uFog', 'uRays', 'uDof', 'uVig', 'uBright', 'uFade', 'uRes', 'uImg', 'uImg2', 'uPan', 'uMouse', 'uRayPos', 'uRipPos', 'uHorizon', 'uRip', 'uMotes', 'uTint', 'uMoteCol']) this.U[n] = gl.getUniformLocation(pr, n);
    gl.uniform1i(this.U.uTex, 0); gl.uniform1i(this.U.uTex2, 1);
  }
  private maxW: number;
  get ok() { return !!this.gl; }
  /** 放图到第 i 层（0 = 当前，1 = 交叉淡入的下一张） */
  setImage(i: 0 | 1, img: HTMLImageElement) {
    const gl = this.gl; if (!gl) return;
    if (!this.tex[i]) this.tex[i] = gl.createTexture();
    gl.activeTexture(i ? gl.TEXTURE1 : gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.size[i] = [img.naturalWidth || 1, img.naturalHeight || 1];
  }
  /** 交叉淡入完成：第 1 层变成第 0 层 */
  swap() { [this.tex[0], this.tex[1]] = [this.tex[1], this.tex[0]]; [this.size[0], this.size[1]] = [this.size[1], this.size[0]]; }
  draw(t: number, look: LiveLook, o: { mix?: number; k?: number; mouse?: [number, number]; dof?: number; vig?: number; fade?: number; bright?: number }) {
    const gl = this.gl; if (!gl || !this.tex[0]) return;
    const d = Math.min(1.5, window.devicePixelRatio || 1), W = Math.min(this.maxW, Math.round(window.innerWidth * d)), H = Math.round(W * window.innerHeight / Math.max(1, window.innerWidth));
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[1] ?? this.tex[0]);
    const k = Math.min(1, Math.max(0, o.k ?? 0)), e = k * k * (3 - 2 * k), L = look, U = this.U;
    gl.uniform1f(U.uMix, o.mix ?? 0); gl.uniform1f(U.uTime, t); gl.uniform1f(U.uZoom, L.zoom0 + (L.zoom1 - L.zoom0) * e);
    gl.uniform2f(U.uPan, L.pan0[0] + (L.pan1[0] - L.pan0[0]) * e, L.pan0[1] + (L.pan1[1] - L.pan0[1]) * e);
    gl.uniform1f(U.uFog, L.fog); gl.uniform1f(U.uRays, L.raysK); gl.uniform1f(U.uDof, o.dof ?? 0); gl.uniform1f(U.uVig, o.vig ?? 0.55); gl.uniform1f(U.uBright, o.bright ?? 1); gl.uniform1f(U.uFade, o.fade ?? 1);
    gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uImg, ...this.size[0]); gl.uniform2f(U.uImg2, ...(this.tex[1] ? this.size[1] : this.size[0]));
    gl.uniform2f(U.uMouse, ...(o.mouse ?? [0, 0])); gl.uniform2f(U.uRayPos, ...L.rays); gl.uniform2f(U.uRipPos, ...L.rip);
    gl.uniform1f(U.uHorizon, L.horizon); gl.uniform1f(U.uRip, L.ripK); gl.uniform1f(U.uMotes, L.motes);
    gl.uniform3f(U.uTint, ...L.tint); gl.uniform3f(U.uMoteCol, ...L.mote);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  dispose() { const gl = this.gl; if (!gl) return; for (const t of this.tex) if (t) gl.deleteTexture(t); try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* 无 */ } this.gl = null; }
}

/** data URI → Blob URL（长 data URI 给 video 在部分浏览器里拖不动） */
export function blobUrl(u: string) {
  const m = /^data:([^;,]+);base64,/.exec(u); if (!m) return u;
  try { const bin = atob(u.slice(m[0].length)), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type: m[1] })); } catch { return u; }
}
/** 读 ?off= / localStorage darkrock_cine_off（DLC 自己的开关，不 import 本体） */
export function d1Off(k: string) {
  try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').some(n => n.trim() === k); } catch { return false; }
}
export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('图加载失败')); im.src = src; });
}
