// v0.9.1 特效底座：序列帧粒子（程序生成图集）、拖尾条带、地面贴花
// 不依赖 main 的上下文：bindVfx(scene) 后即可使用；updateVfx(dt) 每帧调用一次
import * as THREE from 'three';
import { zoneStorm } from './zonestorm';   // v1.2.82
import { gy, gyRel } from './gfx';

// ---------------------------------------------------------------- 图集（512×512，4×4 帧，每帧 128）
// 第 0 行 火焰 4 帧（动画）  第 1 行 火花 / 星芒 / 光点 / 拖尾光条
// 第 2 行 烟雾 4 帧（动画）  第 3 行 碎片 / 沙粒 / 符文 / 冰晶
export type FxKind = 'flame' | 'spark' | 'star' | 'dot' | 'streak' | 'smoke' | 'shard' | 'sand' | 'rune' | 'ice';
const FRAME: Record<FxKind, [number, number]> = {   // [起始帧, 帧数]：帧数 > 1 时按寿命播放
  flame: [0, 4], spark: [4, 1], star: [5, 1], dot: [6, 1], streak: [7, 1], smoke: [8, 4], shard: [12, 1], sand: [13, 1], rune: [14, 1], ice: [15, 1],
};

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function buildAtlas(): THREE.Texture {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 4;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const cell = (i: number, fn: (x: number, y: number) => void) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); fn(S / 2, S / 2); g.restore(); };
  const radial = (x: number, y: number, r: number, stops: [number, string][]) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, s]) => gr.addColorStop(o, s)); return gr; };
  // 火焰：手绘风格的舌形，4 帧逐渐升高、分叉
  for (let f = 0; f < 4; f++) cell(f, (cx, cy) => {
    const r = rng(11 + f * 7);
    const tongues = 3 + (f % 2);
    for (let t = 0; t < tongues; t++) {
      const ox = (r() - 0.5) * 34, h = 70 + f * 8 + r() * 18, w = 22 + r() * 12;
      g.beginPath();
      g.moveTo(cx + ox - w, cy + 40);
      g.bezierCurveTo(cx + ox - w * 1.1, cy + 5, cx + ox - w * 0.2 + (r() - 0.5) * 20, cy - h * 0.5, cx + ox + (r() - 0.5) * 16, cy + 40 - h);
      g.bezierCurveTo(cx + ox + w * 0.3, cy - h * 0.4, cx + ox + w * 1.1, cy + 5, cx + ox + w, cy + 40);
      g.closePath();
      g.fillStyle = radial(cx + ox, cy + 30, h, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
      g.fill();
    }
  });
  // 火花：细长菱形
  cell(4, (cx, cy) => { g.beginPath(); g.moveTo(cx, cy - 58); g.lineTo(cx + 7, cy); g.lineTo(cx, cy + 58); g.lineTo(cx - 7, cy); g.closePath(); g.fillStyle = 'white'; g.fill(); g.fillStyle = radial(cx, cy, 30, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(cx - 30, cy - 30, 60, 60); });
  // 星芒：四角星 + 光晕
  cell(5, (cx, cy) => {
    g.fillStyle = radial(cx, cy, 60, [[0, 'rgba(255,255,255,0.8)'], [0.3, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S);
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? 9 : 56; g.lineTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); } g.closePath(); g.fillStyle = 'white'; g.fill();
  });
  // 光点
  cell(6, (cx, cy) => { g.fillStyle = radial(cx, cy, 62, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S); });
  // 拖尾光条
  cell(7, (cx, cy) => { const gr = g.createLinearGradient(cx, cy - 62, cx, cy + 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 10, 62, 0, 0, Math.PI * 2); g.fill(); });
  // 烟雾：几团圆叠成的手绘烟团，4 帧逐渐散开
  for (let f = 0; f < 4; f++) cell(8 + f, (cx, cy) => {
    const r = rng(101 + f * 13);
    const n = 6 + f * 2, spread = 16 + f * 9;
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * spread * 2, y = cy + (r() - 0.5) * spread * 1.6, rr = 20 + r() * 16 - f * 2;
      g.fillStyle = radial(x, y, rr, [[0, `rgba(255,255,255,${0.75 - f * 0.12})`], [0.6, `rgba(255,255,255,${0.45 - f * 0.08})`], [1, 'rgba(255,255,255,0)']]);
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  });
  // 碎片：不规则多边形 + 亮边
  cell(12, (cx, cy) => { g.beginPath(); [[-30, -40], [22, -50], [40, 6], [8, 46], [-36, 20]].forEach(([x, y]) => g.lineTo(cx + x, cy + y)); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); g.lineWidth = 6; g.strokeStyle = 'white'; g.stroke(); });
  // 沙粒：一小簇颗粒
  cell(13, (cx, cy) => { const r = rng(55); for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = r() * 40; g.fillStyle = `rgba(255,255,255,${0.6 + r() * 0.4})`; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + r() * 5, 0, 6.28); g.fill(); } });
  // 符文：圆环 + 刻痕
  cell(14, (cx, cy) => {
    g.strokeStyle = 'white'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx, cy + 30); g.moveTo(cx - 20, cy - 10); g.lineTo(cx + 20, cy + 14); g.moveTo(cx - 20, cy + 14); g.lineTo(cx + 4, cy - 2); g.stroke();
    g.fillStyle = radial(cx, cy, 60, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S);
  });
  // 冰晶：六角尖晶
  cell(15, (cx, cy) => { g.beginPath(); g.moveTo(cx, cy - 58); g.lineTo(cx + 16, cy - 10); g.lineTo(cx + 10, cy + 50); g.lineTo(cx - 10, cy + 50); g.lineTo(cx - 16, cy - 10); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); g.lineWidth = 5; g.strokeStyle = 'white'; g.stroke(); g.beginPath(); g.moveTo(cx, cy - 50); g.lineTo(cx, cy + 46); g.stroke(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- 序列帧粒子
export interface FxOpts {
  count: number; color: THREE.ColorRepresentation; color2?: THREE.ColorRepresentation; /** 寿命末尾的颜色（颜色随寿命过渡） */ colorEnd?: THREE.ColorRepresentation;
  speed?: number; spread?: number; up?: number; life?: number; size?: number; sizeEnd?: number; gravity?: number; radius?: number; drag?: number; spin?: number;
  /** 沿切线方向的速度（旋风、漩涡） */ swirl?: number; ring?: boolean;
  /** v1.2.57 写实：走正常混合（会压暗、会遮挡），用于尘土 / 碎屑 / 血 / 毒雾 */ normal?: boolean;
}

class FlipbookParticles {
  readonly points: THREE.Points;
  private max: number; private cursor = 0;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array; private frame: Float32Array; private rot: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array; private s0: Float32Array; private s1: Float32Array; private grav: Float32Array; private drag: Float32Array; private spin: Float32Array;
  private f0: Float32Array; private fn: Float32Array; private c0: Float32Array; private c1: Float32Array;
  constructor(atlas: THREE.Texture, max: number, additive: boolean) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    const F = (n: number) => new Float32Array(max * n);
    this.pos = F(3); this.col = F(3); this.size = F(1); this.alpha = F(1); this.frame = F(1); this.rot = F(1);
    this.vel = F(3); this.life = F(1); this.maxLife = F(1); this.s0 = F(1); this.s1 = F(1); this.grav = F(1); this.drag = F(1); this.spin = F(1);
    this.f0 = F(1); this.fn = F(1); this.c0 = F(3); this.c1 = F(3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('frame', new THREE.BufferAttribute(this.frame, 1));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: atlas }, scale: { value: window.innerHeight / 2 }, boost: { value: additive ? 1.5 : 1.0 }, aMul: { value: additive ? 1.0 : 0.75 } },
      vertexShader: `attribute float size; attribute float alpha; attribute float frame; attribute float rot; attribute vec3 color;
        varying vec3 vC; varying float vA; varying float vF; varying float vR; uniform float scale;
        void main(){ vC = color; vA = alpha; vF = frame; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform float boost; uniform float aMul; varying vec3 vC; varying float vA; varying float vF; varying float vR;
        void main(){
          vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
          float f = floor(vF + 0.5); vec2 cellUv = (vec2(mod(f, 4.0), 3.0 - floor(f / 4.0)) + vec2(p.x, 1.0 - p.y)) * 0.25;
          float a = texture2D(map, cellUv).a * vA * aMul; if (a < 0.01) discard;
          gl_FragColor = vec4(vC * boost, a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 4;
  }
  emit(kind: FxKind, p: { x: number; y: number; z: number }, o: FxOpts) {
    const [fs, fc] = FRAME[kind];
    const by = gyRel(p);
    const a1 = new THREE.Color(o.color), a2 = new THREE.Color(o.color2 ?? o.color), tmp = new THREE.Color();
    const end = o.colorEnd !== undefined ? new THREE.Color(o.colorEnd) : null;
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const a = o.ring ? (n / o.count) * Math.PI * 2 + Math.random() * 0.3 : Math.random() * Math.PI * 2;
      const r = (o.radius ?? 0) * (o.ring ? 1 : Math.sqrt(Math.random()));
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      this.pos[i * 3] = p.x + ox; this.pos[i * 3 + 1] = p.y + by; this.pos[i * 3 + 2] = p.z + oz;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8), sa = o.ring ? a : Math.random() * Math.PI * 2, spread = o.spread ?? 1;
      const sw = o.swirl ?? 0;
      this.vel[i * 3] = Math.cos(sa) * sp * spread - Math.sin(a) * sw; this.vel[i * 3 + 2] = Math.sin(sa) * sp * spread + Math.cos(a) * sw;
      this.vel[i * 3 + 1] = (o.up ?? 1) * sp * (0.5 + Math.random() * 0.8);
      tmp.copy(a1).lerp(a2, Math.random());
      this.c0[i * 3] = tmp.r; this.c0[i * 3 + 1] = tmp.g; this.c0[i * 3 + 2] = tmp.b;
      const e = end ?? tmp; this.c1[i * 3] = e.r; this.c1[i * 3 + 1] = e.g; this.c1[i * 3 + 2] = e.b;
      this.maxLife[i] = this.life[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.8);
      const sz = (o.size ?? 0.5) * (0.6 + Math.random() * 0.8);
      this.s0[i] = sz; this.s1[i] = o.sizeEnd !== undefined ? o.sizeEnd * sz / (o.size ?? 0.5) : sz * 0.3;
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
      this.rot[i] = kind === 'spark' || kind === 'streak' ? Math.atan2(this.vel[i * 3], this.vel[i * 3 + 1] + 0.001) : Math.random() * Math.PI * 2;
      this.spin[i] = kind === 'spark' || kind === 'streak' ? 0 : (o.spin ?? 1) * (Math.random() - 0.5) * 4;
      this.f0[i] = fs; this.fn[i] = fc; this.frame[i] = fs;
      this.size[i] = sz; this.alpha[i] = 1;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.03; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 1.6);
      this.rot[i] += this.spin[i] * dt;
      this.frame[i] = this.f0[i] + Math.min(this.fn[i] - 1, Math.floor(k * this.fn[i]));
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * k;
    }
    const g = this.points.geometry;
    for (const n of ['position', 'color', 'size', 'alpha', 'frame', 'rot']) (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 拖尾条带（弧形）
function ribbonMaterial(color: THREE.Color, core = new THREE.Color(1, 0.96, 0.85)) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { color: { value: color }, core: { value: core }, fade: { value: 1 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // u：0 = 拖尾末端，1 = 头部；v：条带宽度方向
    fragmentShader: `uniform vec3 color; uniform vec3 core; uniform float fade; uniform float time; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float head = pow(vUv.x, 1.4);
        float band = 1.0 - abs(vUv.y - 0.5) * 2.0;
        // 沿长度方向的几道风痕（随宽度错开），整体平滑不出块
        float lines = 0.55 + 0.45 * sin(vUv.y * 18.0 + sin(vUv.x * 5.0 + time * 3.0) * 2.0);
        float flow = 0.7 + 0.3 * sin(vUv.x * 10.0 - time * 12.0);
        float a = min(1.0, head * smoothstep(0.0, 0.55, band) * (0.35 + 0.65 * lines) * flow * fade * 1.5);
        vec3 c = mix(color, core, smoothstep(0.6, 1.0, band) * head * 0.8);
        gl_FragColor = vec4(c * 1.9, a);
      }`,
  });
}
function ribbonArc(radius: number, arc: number, width: number, seg = 64, rows = 6) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = -arc * (1 - u);
    const w = width * (0.3 + 0.7 * u);   // 头部宽、尾部窄
    for (let j = 0; j <= rows; j++) {
      const v = j / rows, rr = radius + (v - 0.5) * w;
      pos.push(Math.cos(a) * rr, (v - 0.5) * w * 0.35 * u, Math.sin(a) * rr);
      uv.push(u, v);
    }
    if (i < seg) for (let j = 0; j < rows; j++) { const b = i * (rows + 1) + j, n = b + rows + 1; idx.push(b, b + 1, n, b + 1, n + 1, n); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- 地面贴花（焦痕、尘环）
function scorchMaterial(tint: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { fade: { value: 1 }, tint: { value: tint }, seed: { value: Math.random() * 100 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float fade; uniform vec3 tint; uniform float seed; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 d = vUv - 0.5; float r = length(d) * 2.0; float ang = atan(d.y, d.x);
        float edge = 0.78 + 0.18 * n(vec2(ang * 3.0, 1.0)) ;
        if (r > edge) discard;
        float burn = smoothstep(edge, edge * 0.55, r) * (0.55 + 0.45 * n(vUv * 9.0));
        float ring = smoothstep(0.1, 0.0, abs(r - edge * 0.86)) * 0.9;
        vec2 ec = vUv * 34.0; float ember = step(0.9, h(floor(ec))) * smoothstep(0.32, 0.12, length(fract(ec) - 0.5)) * smoothstep(edge, 0.2, r);
        vec3 c = vec3(0.05, 0.035, 0.03) + tint * (ring * 1.4 + ember * 2.5);
        float a = (burn * 0.6 + ring * 0.5 + ember) * fade;
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// ---------------------------------------------------------------- 管理
let scene: THREE.Scene | null = null;
let add: FlipbookParticles | null = null, norm: FlipbookParticles | null = null;
interface Live { obj: THREE.Object3D; t: number; dur: number; update: (k: number, dt: number) => void }
const lives: Live[] = [];
let T = 0;
/** v0.9.6d 粒子图集（祭坛等小渲染器复用，不另加贴图；不要 dispose） */
let atlasTex: THREE.Texture | null = null;
export function fxAtlas(): THREE.Texture { return atlasTex ??= buildAtlas(); }
/** v1.2.72 由 arcbolt.withBolt 打开（避免循环引用放这里） */
export const BOLT_HIT = { on: false };
export let fxQuality: 'high' | 'medium' | 'low' = 'high';
const CAP = { high: 1, medium: 0.6, low: 0.3 };

export function bindVfx(s: THREE.Scene, mobile = false) {
  scene = s;
  const atlas = fxAtlas();
  add = new FlipbookParticles(atlas, mobile ? 1200 : 2500, true);
  norm = new FlipbookParticles(atlas, mobile ? 450 : 1000, false);   // v1.2.57 写实特效更多走正常混合
  s.add(add.points); s.add(norm.points);
}
export function setVfxQuality(q: 'high' | 'medium' | 'low') { fxQuality = q; }

/** 发射序列帧粒子：烟雾走正常混合（压暗），其余加法混合（发光） */
export function fx(kind: FxKind, p: { x: number; y: number; z: number }, o: FxOpts) {
  const sys = kind === 'smoke' || o.normal ? norm : add; if (!sys) return;
  const count = Math.max(1, Math.round(o.count * CAP[fxQuality]));
  sys.emit(kind, p, { ...o, count });
}
export function live(obj: THREE.Object3D, dur: number, update: Live["update"]) { scene?.add(obj); lives.push({ obj, t: 0, dur, update }); }

export function updateVfx(dt: number) {
  T += dt;
  add?.update(dt); norm?.update(dt);
  for (let i = lives.length - 1; i >= 0; i--) {
    const l = lives[i]; l.t += dt; const k = Math.min(1, l.t / l.dur); l.update(k, dt);
    if (k >= 1) { scene?.remove(l.obj); l.obj.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); lives.splice(i, 1); }
  }
}

const noOutline = (m: THREE.Mesh) => { (m.material as THREE.Material).userData.outlineParameters = { visible: false }; return m; };

/** 焦痕贴花 */
export function scorch(p: { x: number; z: number }, r: number, tint: THREE.ColorRepresentation, dur = 2.4) {
  const m = noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), scorchMaterial(new THREE.Color(tint))));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, gy(p.x, p.z) + 0.035, p.z); m.renderOrder = 2;
  live(m, dur, k => { (m.material as THREE.ShaderMaterial).uniforms.fade.value = k < 0.08 ? k / 0.08 : 1 - Math.pow((k - 0.08) / 0.92, 2); });
}

/**
 * 旋风斩（战士样板）：三层弧形风刃拖尾 + 余烬火花 + 地面尘环 + 焦痕
 * follow() 返回角色当前位置，特效跟随角色移动
 */
export function whirlwind(follow: () => THREE.Vector3, radius: number, color: THREE.ColorRepresentation, dur = 0.55, keepHue = false) {
  const col = new THREE.Color(color);
  if (!keepHue && col.r > 0.9 && col.g > 0.9 && col.b > 0.9) col.set(0xff9a3c);   // 物理系（白色）改成战士的余烬橙
  const hot = keepHue ? col.clone().multiplyScalar(0.6) : col.clone().lerp(new THREE.Color(1, 0.85, 0.5), 0.45);   // v1.0.8 keepHue：职业专属色，不往余烬橙偏
  const layers = [ { r: radius * 0.6, y: 0.5, w: 1.0, arc: Math.PI * 1.4, spd: 15, tilt: 0.22 }, { r: radius * 0.92, y: 0.95, w: 1.5, arc: Math.PI * 1.7, spd: 12, tilt: -0.14 }, { r: radius * 0.78, y: 1.4, w: 0.8, arc: Math.PI * 1.15, spd: 17, tilt: 0.3 } ];
  for (const L of layers) {
    const mat = ribbonMaterial(hot.clone());
    const m = noOutline(new THREE.Mesh(ribbonArc(L.r, L.arc, L.w), mat));
    const g = new THREE.Group(); g.add(m); m.rotation.x = L.tilt;
    live(g, dur, (k, dt) => {
      { const fp = follow(); g.position.copy(fp).setY(fp.y + L.y); }
      g.rotation.y -= L.spd * dt;
      mat.uniforms.time.value = T;
      mat.uniforms.fade.value = (k < 0.15 ? k / 0.15 : 1) * (1 - Math.pow(k, 3));
      g.scale.setScalar(0.85 + 0.15 * Math.min(1, k * 4));
    });
  }
  // 持续发射：沿外圈切向甩出火花与余烬
  const em = new THREE.Group();
  let acc = 0;
  live(em, dur, (k, dt) => {
    acc += dt; const p = follow();
    while (acc > 0.03) {
      acc -= 0.03;
      fx('spark', { x: p.x, y: 0.7 + Math.random() * 0.8, z: p.z }, { count: 7, color: keepHue ? col : 0xffc070, color2: hot, colorEnd: col, radius: radius * 0.9, ring: true, speed: 3.5, swirl: -10, up: 0.7, life: 0.4, size: 0.5, sizeEnd: 0.1, drag: 2 });
      if (!keepHue) fx('flame', { x: p.x, y: 0.4, z: p.z }, { count: 3, color: 0xffc060, color2: 0xff7020, colorEnd: 0x802010, radius: radius * 0.85, ring: true, speed: 0.6, swirl: -5, up: 2.4, life: 0.5, size: 0.9, sizeEnd: 0.2 });
    }
    void k;
  });
  const p0 = follow();
  // 起手：地面尘环 + 焦痕
  fx('smoke', { x: p0.x, y: 0.15, z: p0.z }, { count: 14, color: 0x5a4a3a, color2: 0x4a3c30, colorEnd: 0x2a2420, radius: radius * 0.7, ring: true, speed: 2.6, up: 0.12, life: 0.8, size: 0.8, sizeEnd: 1.5, drag: 2.4 });
  fx('dot', { x: p0.x, y: 0.1, z: p0.z }, { count: 26, color: 0xffb060, color2: 0xff6020, radius: radius * 0.9, ring: true, speed: 0.3, up: 1.2, life: 0.8, size: 0.18, sizeEnd: 0.05 });
  scorch(p0, radius * 1.05, col, 2.2);
}

/** 命中火花（按元素着色），供后续替换普通命中 */
export function hitSpark(p: { x: number; y: number; z: number }, color: THREE.ColorRepresentation, big = false) {
  fx('star', p, { count: 1, color: 0xffffff, color2: color, life: 0.18, size: big ? 1.4 : 0.9, sizeEnd: 0.2, speed: 0, up: 0 });
  fx('spark', p, { count: big ? 14 : 8, color: 0xffffff, color2: color, colorEnd: color, speed: big ? 7 : 5, up: 0.6, life: 0.3, size: 0.32, sizeEnd: 0.06, drag: 3, gravity: 4 });
}

/** 环境：营火 / 火把持续火焰（每帧调用 tick） */
export function fireTick(p: { x: number; y: number; z: number }, scale = 1) {
  fx('flame', p, { count: 1, color: 0xffd080, color2: 0xff8a30, colorEnd: 0xa02808, radius: 0.18 * scale, speed: 0.2, up: 2.4 * scale, life: 0.55, size: 0.75 * scale, sizeEnd: 0.2 * scale, spin: 0.3 });
  if (Math.random() < 0.25) fx('dot', { x: p.x, y: p.y + 0.5 * scale, z: p.z }, { count: 1, color: 0xff8a30, color2: 0xff4010, radius: 0.2, speed: 0.4, up: 3, life: 1.4, size: 0.09, sizeEnd: 0.02 });
  if (Math.random() < 0.08) fx('smoke', { x: p.x, y: p.y + 1.1 * scale, z: p.z }, { count: 1, color: 0x3a3430, colorEnd: 0x2a2624, speed: 0.2, up: 1.5, life: 2.2, size: 0.8 * scale, sizeEnd: 2 * scale, spin: 0.2 });
}

// ================================================================ v0.9.1b 其他职业招牌 + 元素命中
/** 法阵贴花：双层旋转符文环 + 刻度 + 内圈六芒（时砂法阵 / 魔法阵通用） */
export function sigilMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3,
    uniforms: { color: { value: color }, fade: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform float fade; uniform float time; varying vec2 vUv;
      float ring(float r, float c, float w){ return smoothstep(w, 0.0, abs(r - c)); }
      void main(){
        vec2 d = vUv - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float a1 = atan(d.y, d.x) + time * 0.8, a2 = atan(d.y, d.x) - time * 1.3;
        float outer = ring(r, 0.95, 0.025) + ring(r, 0.80, 0.015);
        float ticks = step(0.7, fract(a1 * 48.0 / 6.2832)) * step(0.82, r) * step(r, 0.93);
        float glyph = step(0.55, fract(a2 * 12.0 / 6.2832)) * step(0.3, fract(a2 * 36.0 / 6.2832)) * ring(r, 0.66, 0.04);
        // 内圈：两个三角形组成的六芒
        float tri = 0.0;
        for (int k = 0; k < 6; k++) { float ang = float(k) * 1.0472 + time * 0.5; vec2 n = vec2(cos(ang), sin(ang)); tri += smoothstep(0.012, 0.0, abs(dot(d * 2.0, n) - 0.25)) * step(r, 0.52); }
        float inner = ring(r, 0.5, 0.015) + ring(r, 0.18, 0.02);
        float glow = smoothstep(1.0, 0.0, r) * 0.15;
        float a = (outer + ticks * 0.8 + glyph + min(tri, 1.0) * 0.8 + inner + glow) * fade;
        gl_FragColor = vec4(color * 1.6, min(a, 1.0));
      }`,
  });
}
/** v1.2.82 六芒法阵 → 通用区域件的符文光晕（arcane/rune 贴花 + 星尘 + 断弧，按传入颜色着色）。
 *  所有职业 / 资料片经 sigil()（含 ClassExt F.sigil）铺的法阵一并替换。旧法阵材质 sigilMaterial 仍保留（预热样本用）。 */
export function sigil(p: { x: number; z: number }, r: number, color: THREE.ColorRepresentation, dur = 1.2) {
  return zoneStorm(p, r, 'arcane', Math.max(0.9, dur), 'arcane', color);
}
export const vfxTime = () => T;

/** 时砂法阵：金色法阵 + 向内卷的沙流 + 沙漏星芒 */
export function sandSigil(p: { x: number; z: number }, r: number, echo = false) {
  const gold = echo ? 0x7ab0ff : 0xffc860;
  sigil(p, r, gold, 1.1);
  fx('sand', { x: p.x, y: 0.25, z: p.z }, { count: 26, color: echo ? 0xa8c8ff : 0xe8c080, color2: echo ? 0x6080ff : 0xc08a40, radius: r * 0.95, ring: true, speed: -r * 1.1, spread: 1, swirl: 4, up: 0.35, life: 0.9, size: 0.45, sizeEnd: 0.15, drag: 0.5 });
  fx('dot', { x: p.x, y: 0.2, z: p.z }, { count: 20, color: gold, color2: 0xfff0c0, radius: r * 0.7, speed: 0.2, up: 2.2, life: 1.0, size: 0.16, sizeEnd: 0.04 });
  fx('star', { x: p.x, y: 1.0, z: p.z }, { count: 1, color: 0xfff4d0, color2: gold, speed: 0, up: 0, life: 0.35, size: 3, sizeEnd: 0.5 });
}

/** 陨星：下落途中每帧调 meteorTrail，落地调 meteorImpact */
export function meteorTrail(p: { x: number; y: number; z: number }) {
  fx('flame', p, { count: 3, color: 0xffe090, color2: 0xff7020, colorEnd: 0x601008, radius: 0.35, speed: 0.4, up: 0.6, life: 0.45, size: 1.4, sizeEnd: 0.4 });
  fx('smoke', p, { count: 1, color: 0x3a302a, colorEnd: 0x201a18, radius: 0.3, speed: 0.3, up: 0.4, life: 1.2, size: 1.2, sizeEnd: 2.6 });
}
export function meteorImpact(p: { x: number; z: number }, r: number) {
  scorch(p, r * 1.1, 0xff6a10, 3);
  fx('star', { x: p.x, y: 0.8, z: p.z }, { count: 1, color: 0xffffff, color2: 0xffe0a0, speed: 0, up: 0, life: 0.25, size: 6, sizeEnd: 1 });
  fx('flame', { x: p.x, y: 0.3, z: p.z }, { count: 36, color: 0xffb050, color2: 0xff5010, colorEnd: 0x501008, radius: r * 0.55, speed: 2.2, up: 1.4, life: 1.1, size: 1.6, sizeEnd: 0.5, drag: 2.5 });
  fx('flame', { x: p.x, y: 0.4, z: p.z }, { count: 14, color: 0xffd080, color2: 0xff7020, colorEnd: 0x601008, radius: r * 0.25, speed: 0.3, up: 4, life: 0.9, size: 2.2, sizeEnd: 0.6 });   // 火柱
  fx('shard', { x: p.x, y: 0.4, z: p.z }, { count: 22, color: 0x4a3a30, color2: 0xff8a40, speed: 8, up: 1.4, life: 0.9, size: 0.35, sizeEnd: 0.25, gravity: 14, spin: 3 });
  fx('spark', { x: p.x, y: 0.5, z: p.z }, { count: 30, color: 0xffd080, color2: 0xff7020, speed: 10, up: 0.9, life: 0.5, size: 0.4, sizeEnd: 0.08, gravity: 8, drag: 1.5 });
  fx('smoke', { x: p.x, y: 1.2, z: p.z }, { count: 22, color: 0x3a302a, color2: 0x241e1a, colorEnd: 0x141010, radius: r * 0.45, speed: 1.2, up: 1.8, life: 2.2, size: 2, sizeEnd: 3.8, drag: 0.8 });
}

/** 霜环：冰晶向外炸开 + 霜花法阵 + 寒雾 */
export function frostNova(p: { x: number; z: number }, r: number) {
  sigil(p, r, 0x8fd8ff, 0.9);
  fx('ice', { x: p.x, y: 0.4, z: p.z }, { count: 30, color: 0xe8f8ff, color2: 0x7fd0ff, radius: 0.4, ring: true, speed: r * 2.6, up: 0.25, life: 0.45, size: 0.6, sizeEnd: 0.25, drag: 3, spin: 0.3 });
  fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 14, color: 0xcfe8ff, color2: 0xa0c8e8, colorEnd: 0x8090a0, radius: r * 0.85, ring: true, speed: 0.6, up: 0.15, life: 1.2, size: 1.2, sizeEnd: 2.2 });
  fx('star', { x: p.x, y: 0.6, z: p.z }, { count: 6, color: 0xffffff, color2: 0x9fe8ff, radius: r * 0.8, speed: 0, up: 0.3, life: 0.4, size: 0.9, sizeEnd: 0.2 });
}

/** 炼金药瓶落地：玻璃碎片 + 彩色烟团 + 液体溅射 */
export function potionSplash(p: { x: number; z: number }, r: number, color: number, big: boolean) {
  fx('shard', { x: p.x, y: 0.5, z: p.z }, { count: big ? 10 : 5, color: 0xe8f8ff, color2: color, speed: 5, up: 1.3, life: 0.6, size: 0.22, sizeEnd: 0.18, gravity: 14, spin: 4 });
  fx('dot', { x: p.x, y: 0.3, z: p.z }, { count: big ? 22 : 8, color, color2: 0xffffff, speed: 4, up: 1.5, life: 0.55, size: 0.22, sizeEnd: 0.08, gravity: 9 });
  if (big) {
    fx('smoke', { x: p.x, y: 0.3, z: p.z }, { count: 10, color, color2: new THREE.Color(color).multiplyScalar(0.6).getHex(), colorEnd: 0x303030, radius: r * 0.6, speed: 1.2, up: 0.6, life: 1.2, size: 1.0, sizeEnd: 2.0, drag: 1.5 });
    sigil(p, r, color, 0.6);
  }
}
/** 爆燃：火 + 绿火花 */
export function alchemyBoom(p: { x: number; z: number }, r: number) {
  meteorImpact(p, r);
  fx('spark', { x: p.x, y: 0.5, z: p.z }, { count: 24, color: 0xd8ff60, color2: 0x7aff3a, speed: 9, up: 1, life: 0.5, size: 0.4, sizeEnd: 0.08, gravity: 6, drag: 1.5 });
}

/** 按元素的命中层（叠在旧火花上）：形状区分元素，色弱也能认 */
// ================================================================ v1.2.57 写实特效库 v1：地面痕迹贴花（血迹 / 腐蚀 / 碎石裂纹 / 霜 / 墨渍）
// 原则（报告 §2）：少发光多物质 —— 痕迹用正常混合（会压暗地面），持续 4–8 秒淡出；同屏上限，超出挤掉最旧
export type MarkKind = 'blood' | 'poison' | 'crack' | 'frost' | 'ink';
const markTex: Partial<Record<MarkKind, THREE.CanvasTexture>> = {};
const marks: { m: THREE.Mesh; left: number }[] = [];
const MARK_CAP = 36;
function markTexture(k: MarkKind) {
  const hit = markTex[k]; if (hit) return hit;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const R = Math.random;
  if (g) {
    const blob = (x: number, y: number, r: number, col: string) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(0.7, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); };
    if (k === 'blood') {   // 中心一滩 + 外甩飞溅点 + 拉长的甩痕
      blob(64, 64, 26, 'rgba(90,6,6,0.9)');
      for (let i = 0; i < 26; i++) { const a = R() * 6.28, d = 20 + R() * 40; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + R() * 6, 'rgba(110,10,8,0.85)'); }
      g.strokeStyle = 'rgba(80,4,4,0.7)'; g.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = R() * 6.28; g.lineWidth = 2 + R() * 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18); g.lineTo(64 + Math.cos(a) * (40 + R() * 20), 64 + Math.sin(a) * (40 + R() * 20)); g.stroke(); }
    } else if (k === 'poison') {   // 黄绿腐蚀斑 + 深色坑点
      for (let i = 0; i < 14; i++) blob(64 + (R() - 0.5) * 60, 64 + (R() - 0.5) * 60, 10 + R() * 18, 'rgba(70,95,20,0.55)');
      for (let i = 0; i < 30; i++) blob(64 + (R() - 0.5) * 80, 64 + (R() - 0.5) * 80, 1.5 + R() * 3.5, 'rgba(25,35,8,0.8)');
    } else if (k === 'crack') {   // 放射裂纹 + 碎石灰
      blob(64, 64, 22, 'rgba(40,32,26,0.55)');
      g.strokeStyle = 'rgba(20,15,12,0.9)'; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) { let x = 64, y = 64, a = i / 9 * 6.28 + R() * 0.5; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { a += (R() - 0.5) * 0.8; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); g.lineWidth = Math.max(0.6, 2.5 - j * 0.35); } g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + R() * 40 | 0},${80 + R() * 30 | 0},${70 + R() * 20 | 0},0.9)`; const a = R() * 6.28, d = R() * 50; g.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + R() * 3, 1 + R() * 3); }
    } else if (k === 'frost') {
      blob(64, 64, 40, 'rgba(225,240,255,0.55)');
      g.strokeStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 16; i++) { const a = R() * 6.28; g.lineWidth = 1; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * (25 + R() * 30), 64 + Math.sin(a) * (25 + R() * 30)); g.stroke(); }
    } else {   // ink：墨渍，边缘不规则
      for (let i = 0; i < 10; i++) blob(64 + (R() - 0.5) * 40, 64 + (R() - 0.5) * 40, 14 + R() * 16, 'rgba(12,6,20,0.6)');
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; markTex[k] = t; return t;
}
/** 当前存活的痕迹数（测试用） */
export function markCount() { return marks.filter(r => r.m.visible && (r.m.material as THREE.MeshBasicMaterial).opacity > 0.02).length; }
/** 在地面留一块痕迹：r 半径（米），dur 秒（默认 6），最后 35% 淡出 */
export function groundMark(p: { x: number; z: number }, kind: MarkKind, r: number, dur = 6) {
  if (!scene || fxQuality === 'low') return;
  while (marks.length >= MARK_CAP) { const o = marks.shift()!; o.left = 0; o.m.visible = false; }
  const mat = new THREE.MeshBasicMaterial({ map: markTexture(kind), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: true });
  const m = noOutline(new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(p.x, gy(p.x, p.z) + 0.03, p.z); m.renderOrder = 1;
  const rec = { m, left: dur }; marks.push(rec);
  live(m, dur, k => {
    if (!m.visible) return;
    mat.opacity = Math.min(1, k * dur / 0.12) * (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1);
    if (k >= 1) { const i = marks.indexOf(rec); if (i >= 0) marks.splice(i, 1); }
  });
}

/** v1.2.57b 受击材质：决定物理命中的碎屑与痕迹 */
export type HitMat = 'flesh' | 'bone' | 'metal' | 'stone' | 'ghost' | 'wood';
export function hitMatOf(kind: string, name: string): HitMat {
  const t = kind + '|' + name;
  if (/假人|稻草|dummy|木|树/.test(t)) return 'wood';
  if (/魂|灵|幽|鬼|影|怨|wraith|ghost|spirit|shade|倒影/.test(t)) return 'ghost';
  if (/骷髅|骨|亡灵|尸|skel|bone|lich/.test(t)) return 'bone';
  if (/石|岩|晶|rock|stone|crystal/.test(t)) return 'stone';
  if (/傀儡|魔像|铁|机关|甲|钟|铜|golem|construct|armor|bell/.test(t)) return 'metal';
  return 'flesh';
}
/** 物理命中的材质层：骨 → 白骨屑；金属 → 橙色火星（加色）；石 → 碎石 + 裂纹；幽魂 → 灵雾散开（无血）；木 → 木屑；血肉 → 血 */
export function matHit(p: { x: number; y: number; z: number }, mat: HitMat, heavy: boolean) {
  const n = heavy ? 2 : 1;
  switch (mat) {
    case 'bone': fx('shard', p, { count: 4 * n, color: 0xe8e0cc, color2: 0xb0a890, speed: 4, up: 1.2, life: 0.55, size: 0.14, gravity: 13, spin: 6, normal: true }); if (heavy) groundMark(p, 'crack', 0.6, 5); break;
    case 'metal': fx('spark', p, { count: 8 * n, color: 0xffe0a0, color2: 0xff8a20, speed: 7, up: 1.2, life: 0.32, size: 0.12, gravity: 14 }); break;
    case 'stone': fx('shard', p, { count: 5 * n, color: 0x8a8478, color2: 0x56524a, speed: 4.5, up: 1.3, life: 0.6, size: 0.2, gravity: 13, spin: 4, normal: true }); if (heavy) groundMark(p, 'crack', 0.8, 6); break;
    case 'ghost': fx('smoke', p, { count: 3 * n, color: 0xc8d4e0, color2: 0x8a9aae, colorEnd: 0x2a3440, speed: 1.6, up: 0.4, life: 0.8, size: 0.7, sizeEnd: 1.6 }); break;
    case 'wood': fx('shard', p, { count: 4 * n, color: 0xc8a060, color2: 0x8a6a38, speed: 3.5, up: 1.2, life: 0.5, size: 0.14, gravity: 12, spin: 5, normal: true }); break;
    default: if (heavy) { fx('shard', p, { count: 5, color: 0x9a0c0c, color2: 0x5a0606, speed: 3, up: 1.4, life: 0.5, size: 0.12, gravity: 14, normal: true }); groundMark(p, 'blood', 0.7 + Math.random() * 0.4, 6); }
  }
}

export function elementHit(p: { x: number; y: number; z: number }, el: string, heavy: boolean, mat?: HitMat) {
  const n = heavy ? 2 : 1;
  switch (el) {
    // v1.2.57 写实：碎屑 / 尘土改正常混合（不发光）；重击留血迹或裂纹
    case 'physical':
      fx('star', p, { count: 1, color: 0xffffff, color2: 0xffd090, speed: 0, up: 0, life: 0.1, size: heavy ? 1.2 : 0.7, sizeEnd: 0.3 });
      fx('shard', p, { count: 3 * n, color: 0x8a7a68, color2: 0x4a3e32, speed: 4, up: 1, life: 0.5, size: 0.18, gravity: 12, spin: 4, normal: true });
      fx('smoke', p, { count: n, color: 0x8a7c6a, color2: 0x6a5e50, colorEnd: 0x3a342c, speed: 0.8, up: 0.3, life: 0.7, size: 0.6, sizeEnd: 1.4 });   // 尘土
      if (mat) matHit(p, mat, heavy);
      else if (heavy) groundMark(p, Math.random() < 0.6 ? 'blood' : 'crack', 0.7 + Math.random() * 0.4, 6);
      break;
    case 'fire':
      fx('flame', p, { count: 4 * n, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.2, speed: 0.8, up: 1.6, life: 0.5, size: 0.8, sizeEnd: 0.2 });
      fx('smoke', p, { count: 2 * n, color: 0x2a2420, color2: 0x1a1612, colorEnd: 0x0a0806, speed: 0.4, up: 1.4, life: 1.1, size: 0.7, sizeEnd: 1.8 });   // 黑烟
      if (heavy) scorch(p, 0.9, 0x1a0c06, 5);
      break;
    case 'frost':
      fx('ice', p, { count: 4 * n, color: 0xe8f8ff, color2: 0x7fd0ff, speed: 4, up: 0.6, life: 0.4, size: 0.4, sizeEnd: 0.2, drag: 3 });
      fx('smoke', p, { count: n, color: 0xe8f2fa, color2: 0xcfe0ee, colorEnd: 0x9fb4c4, speed: 0.5, up: 0.2, life: 0.8, size: 0.5, sizeEnd: 1.2 });   // 寒气白雾
      if (heavy) groundMark(p, 'frost', 0.9, 5);
      break;
    case 'arcane': fx('rune', p, { count: 1, color: 0xd07dff, color2: 0xf0c8ff, speed: 0, up: 0.4, life: 0.5, size: heavy ? 1.6 : 1.1, sizeEnd: 0.6, spin: 0.5 }); break;
    case 'nature':
      if (BOLT_HIT.on) break;   // v1.2.72 雷（电弧类技能）：命中层由 arcbolt.shockHit 画，不画毒雾
      fx('smoke', p, { count: 2 * n, color: 0x6a8a2a, color2: 0x4a6a18, colorEnd: 0x203010, speed: 0.6, up: 0.3, life: 1.1, size: 0.8, sizeEnd: 1.6 });   // 贴地毒雾（正常混合，不发荧光）
      if (heavy) groundMark(p, 'poison', 0.9, 7);
      break;
    case 'shadow':
      fx('smoke', p, { count: 3 * n, color: 0x2a1640, color2: 0x140820, colorEnd: 0x060208, speed: 1, up: 0.8, life: 0.9, size: 0.8, sizeEnd: 1.6 });
      fx('dot', p, { count: 2 * n, color: 0x9060d0, speed: 2, up: 1, life: 0.3, size: 0.12 });
      if (heavy) groundMark(p, 'ink', 0.8, 5);
      break;
    case 'holy': fx('star', p, { count: 2, color: 0xfff4c0, color2: 0xffd060, speed: 0.5, up: 0.5, life: 0.4, size: heavy ? 1.6 : 1.0, sizeEnd: 0.2 }); break;
  }
}

// ================================================================ v0.9.1e 装备 / 掉落 / 强化
/** 品级：0 白绿 1 蓝 2 紫 3 套装 4 橙(传说) 5 暗金 */
export function lootDrop(p: { x: number; z: number }, color: THREE.ColorRepresentation, tier: number) {
  const c = new THREE.Color(color).getHex();
  fx('spark', { x: p.x, y: 0.4, z: p.z }, { count: 6 + tier * 4, color: c, color2: 0xffffff, speed: 2 + tier * 0.5, up: 2.5, gravity: 6, life: 0.6, size: 0.3, sizeEnd: 0.05 });
  if (tier >= 2) fx('star', { x: p.x, y: 0.15, z: p.z }, { count: 10 + tier * 3, color: c, color2: 0xffffff, radius: 0.2, ring: true, speed: 3.5, up: 0.2, drag: 3, life: 0.7, size: 0.35, sizeEnd: 0.05 });
  if (tier === 4) {
    // 橙装：明亮的火光喷发
    sigil(p, 1.4, c, 1.6);
    fx('streak', { x: p.x, y: 0.2, z: p.z }, { count: 14, color: 0xffffff, color2: c, radius: 0.4, speed: 0.5, up: 9, drag: 1.2, life: 0.6, size: 0.6, sizeEnd: 0.1 });
    fx('flame', { x: p.x, y: 0.2, z: p.z }, { count: 14, color: 0xffd080, color2: 0xff7a10, colorEnd: 0x601008, radius: 0.5, speed: 0.6, up: 3, life: 0.7, size: 0.9, sizeEnd: 0.2 });
  }
  if (tier >= 5) {
    // 暗金「黑焰金纹」：先一团黑焰压暗，再金色符文与金线盘旋升起，最后白金闪光
    sigil(p, 1.6, 0xffc84a, 2);
    scorch(p, 1.8, 0x140806, 3.5);
    fx('smoke', { x: p.x, y: 0.3, z: p.z }, { count: 16, color: 0x0e0614, color2: 0x1a0a20, colorEnd: 0x000000, radius: 0.7, ring: true, speed: 1.4, up: 2.4, life: 1.6, size: 1.2, sizeEnd: 2.6 });
    fx('rune', { x: p.x, y: 0.4, z: p.z }, { count: 10, color: 0xffd36a, color2: 0xfff0c0, radius: 1.1, ring: true, speed: 0, swirl: 2.2, up: 2.2, life: 1.6, size: 0.5, sizeEnd: 0.1, spin: 0.6 });
    fx('streak', { x: p.x, y: 0.2, z: p.z }, { count: 10, color: 0xfff2c8, color2: 0xffc84a, radius: 0.25, speed: 0, up: 11, drag: 1.2, life: 0.7, size: 0.5, sizeEnd: 0.05 });
    fx('star', { x: p.x, y: 1.2, z: p.z }, { count: 1, color: 0xffffff, color2: 0xffd36a, speed: 0, up: 0, life: 0.35, size: 4, sizeEnd: 0.5 });
  }
}

/** 掉落物待拾取时的常驻光点（每帧调用，内部按品级控制频率） */
export function lootIdle(p: { x: number; z: number }, color: THREE.ColorRepresentation, tier: number) {
  const rate = [0, 0, 0.05, 0.07, 0.12, 0.16][tier] ?? 0;
  if (Math.random() > rate) return;
  const c = new THREE.Color(color).getHex();
  if (tier === 4) fx(Math.random() < 0.5 ? 'flame' : 'spark', { x: p.x, y: 0.15, z: p.z }, { count: 1, color: 0xffc060, color2: c, colorEnd: 0x601008, radius: 0.45, speed: 0.1, up: 1.8, life: 0.9, size: 0.35, sizeEnd: 0.05 });
  else if (tier >= 5) {
    // 暗金：黑色烟缕 + 金色符文 + 偶尔一道金线
    fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0x120818, colorEnd: 0x000000, radius: 0.5, speed: 0.1, up: 1.2, life: 1.5, size: 0.6, sizeEnd: 1.3 });
    if (Math.random() < 0.6) fx('rune', { x: p.x, y: 0.3, z: p.z }, { count: 1, color: 0xffd36a, radius: 0.7, ring: true, speed: 0, swirl: 1.4, up: 0.9, life: 1.5, size: 0.3, sizeEnd: 0.06, spin: 0.5 });
    if (Math.random() < 0.25) fx('streak', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0xfff2c8, color2: 0xffc84a, radius: 0.35, speed: 0, up: 4, life: 0.7, size: 0.4, sizeEnd: 0.05 });
  } else fx('dot', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: c, color2: 0xffffff, radius: 0.45, speed: 0, up: 1.4 + tier * 0.2, life: 1.2, size: 0.28, sizeEnd: 0.04 });
}

/** 拾取：物品处一圈光点向内收，玩家身上亮一下 */
export function lootPickup(at: { x: number; z: number }, me: { x: number; z: number }, color: THREE.ColorRepresentation, tier: number) {
  const c = new THREE.Color(color).getHex();
  fx('dot', { x: at.x, y: 0.6, z: at.z }, { count: 6 + tier * 3, color: c, color2: 0xffffff, radius: 0.9, ring: true, speed: -1.6, up: 1.2, life: 0.5, size: 0.22, sizeEnd: 0.05 });
  if (tier >= 2) fx('star', { x: me.x, y: 1.1, z: me.z }, { count: 4 + tier * 2, color: c, color2: 0xffffff, radius: 0.5, speed: 1.2, up: 1.5, life: 0.6, size: 0.35, sizeEnd: 0.05 });
}

/** 强化成功：法阵 + 升腾光柱 + 火花圈；+5 / +10 / +15 里程碑更大 */
export function upgradeBurst(p: { x: number; z: number }, level: number, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color).getHex();
  const big = level === 5 || level === 10 || level === 15;
  sigil(p, big ? 2.4 : 1.6, c, big ? 1.6 : 1.1);
  fx('spark', { x: p.x, y: 0.2, z: p.z }, { count: big ? 30 : 16, color: 0xffd34d, color2: 0xffffff, radius: 0.3, ring: true, speed: 5, up: 1.5, drag: 2, gravity: 4, life: 0.7, size: 0.3, sizeEnd: 0.05 });
  fx('streak', { x: p.x, y: 0.1, z: p.z }, { count: big ? 18 : 8, color: 0xffffff, color2: c, radius: 0.8, speed: 0, up: big ? 10 : 6, drag: 1.5, life: 0.7, size: 0.7, sizeEnd: 0.1 });
  if (big) { fx('rune', { x: p.x, y: 0.4, z: p.z }, { count: 10, color: c, radius: 1.8, ring: true, speed: 0, up: 1.8, life: 1.5, size: 0.5, sizeEnd: 0.1, spin: 0.5 }); scorch(p, 2, 0x3a2a10, 2); }
}

/** 强化 +10 以上的武器：刃上不断冒出的光点 / 余烬（元素按职业色） */
export function weaponGlowTick(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, level: number) {
  if (Math.random() > (level >= 13 ? 0.55 : 0.3)) return;
  const k = Math.random(), p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
  fx(level >= 13 && Math.random() < 0.5 ? 'flame' : 'dot', p, { count: 1, color, color2: 0xffffff, speed: 0.15, up: 0.6, life: 0.5, size: level >= 13 ? 0.22 : 0.15, sizeEnd: 0.02 });
}

/** 套装 4 件的周身环境：熔岩余烬 / 霜晶 / 暗影烟 / 圣光 */
export function setAuraTick(p: { x: number; z: number }, kind: string) {
  if (Math.random() > 0.35) return;
  if (kind === 'lava') fx(Math.random() < 0.5 ? 'flame' : 'spark', { x: p.x, y: 0.1, z: p.z }, { count: 1, color: 0xff6a20, color2: 0xffc060, colorEnd: 0x601000, radius: 0.6, speed: 0.2, up: 1.4, life: 0.9, size: 0.3, sizeEnd: 0.05 });
  else if (kind === 'frost') fx('ice', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0xbfe8ff, color2: 0xffffff, radius: 0.7, ring: true, speed: 0.1, swirl: 1.2, up: 0.5, life: 1.2, size: 0.25, sizeEnd: 0.05, spin: 2 });
  else if (kind === 'shadow') fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0x3a1a5a, colorEnd: 0x0a0010, radius: 0.5, speed: 0.1, up: 0.8, life: 1.2, size: 0.6, sizeEnd: 1.2 });
  else fx('star', { x: p.x, y: 0.2, z: p.z }, { count: 1, color: 0xffe080, color2: 0xffffff, radius: 0.6, speed: 0, up: 1.2, life: 1, size: 0.25, sizeEnd: 0.04 });
}

// ================================================================ v0.9.1h 其余职业技能特效
type P3 = { x: number; y: number; z: number }; type P2 = { x: number; z: number };
const elHex = (c: THREE.ColorRepresentation) => new THREE.Color(c).getHex();

/** 冲锋 / 跳斩：途中每帧调，地面拖出尘土 + 元素条纹 */
export function dashTrail(p: P3, color: THREE.ColorRepresentation, leap = false) {
  const c = elHex(color);
  fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: leap ? 1 : 2, color: 0x6a5a48, color2: 0x4a3e32, colorEnd: 0x2a2420, radius: 0.3, speed: 0.6, up: 0.4, life: 0.6, size: 0.7, sizeEnd: 1.4 });
  fx('streak', { x: p.x, y: 1.0, z: p.z }, { count: 2, color: 0xffffff, color2: c, radius: 0.5, speed: 0.2, up: 0.1, life: 0.22, size: 0.7, sizeEnd: 0.1 });
}
/** 冲锋到位：前方冲击波 + 碎石 + 白闪 */
export function chargeImpact(p: P2, color: THREE.ColorRepresentation, leap = false) {
  const c = elHex(color);
  fx('star', { x: p.x, y: 1, z: p.z }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.2, size: leap ? 3.2 : 2.2, sizeEnd: 0.4 });
  fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: leap ? 14 : 8, color: 0x7a6a56, color2: 0x5a4c3e, colorEnd: 0x2a2420, radius: 0.4, ring: true, speed: leap ? 4 : 3, up: 0.2, life: 0.7, size: 0.9, sizeEnd: 1.8, drag: 2 });
  fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: leap ? 14 : 8, color: 0x8a7a66, color2: 0x4a3a2c, speed: 6, up: 1.6, life: 0.7, size: 0.28, sizeEnd: 0.2, gravity: 14, spin: 3 });
  if (leap) scorch(p, 1.8, 0x3a2a18, 2);
}

/** 雷霆一击 / 震地：地裂焦痕 + 环形电弧火花 + 尘土冲击环 */
export function thunderSlam(p: P2, r: number, color: THREE.ColorRepresentation) {
  const c = elHex(color), lit = new THREE.Color(color).lerp(new THREE.Color(0x9fd0ff), 0.5).getHex();
  scorch(p, r * 0.9, 0x2a2018, 2.4);
  sigil(p, r * 0.85, lit, 0.7);
  fx('star', { x: p.x, y: 0.5, z: p.z }, { count: 1, color: 0xffffff, color2: 0xbfe0ff, speed: 0, up: 0, life: 0.18, size: 4, sizeEnd: 0.6 });
  fx('spark', { x: p.x, y: 0.4, z: p.z }, { count: 40, color: 0xffffff, color2: lit, colorEnd: c, radius: 0.5, ring: true, speed: r * 3, up: 0.6, life: 0.35, size: 0.35, sizeEnd: 0.05, drag: 2 });
  fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 18, color: 0x8a7a66, color2: 0x5a4c3e, colorEnd: 0x2a2420, radius: r * 0.4, ring: true, speed: r * 1.2, up: 0.25, life: 0.9, size: 1.1, sizeEnd: 2.2, drag: 2.2 });
  fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: 18, color: 0x8a7a66, color2: 0x4a3a2c, radius: r * 0.5, speed: 3, up: 2.2, life: 0.9, size: 0.3, sizeEnd: 0.22, gravity: 14, spin: 3 });
}

/** 天神下凡 / 大招：金色光柱冲天 + 大法阵 + 上升符文，之后 aura 跟随 */
export function avatarRise(follow: () => THREE.Vector3, r: number, color: THREE.ColorRepresentation = 0xffd34d, dur = 1.4) {
  const c = elHex(color), p = follow();
  sigil(p, r, c, dur);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, fade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 color; uniform float fade; varying vec2 vUv;
      void main(){ float s = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 6.0 + vUv.y * 8.0 - time * 10.0);
        gl_FragColor = vec4(color * 1.6, fade * pow(1.0 - vUv.y, 1.5) * (0.25 + 0.6 * s)); }`,
  });
  const beam = noOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 14, 20, 1, true), beamMat));
  live(beam, dur * 0.7, (k, dt) => { { const fp = follow(); beam.position.copy(fp).setY(fp.y + 7); } beamMat.uniforms.time.value += dt; beamMat.uniforms.fade.value = (k < 0.1 ? k / 0.1 : 1) * (1 - k * k); beam.scale.set(1 + k * 0.6, 1, 1 + k * 0.6); });
  fx('star', { x: p.x, y: 1.4, z: p.z }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.35, size: 6, sizeEnd: 1 });
  fx('rune', { x: p.x, y: 0.3, z: p.z }, { count: 12, color: c, color2: 0xfff4d0, radius: r * 0.7, ring: true, speed: 0, swirl: 2, up: 3, life: 1.2, size: 0.6, sizeEnd: 0.1, spin: 0.6 });
  fx('streak', { x: p.x, y: 0.2, z: p.z }, { count: 20, color: 0xffffff, color2: c, radius: 1.2, speed: 0.3, up: 12, drag: 1, life: 0.7, size: 0.7, sizeEnd: 0.1 });
}

/** 横扫 / 扇形斩：沿扇面甩出条纹与尘土 */
export function coneSweep(p: P2, dir: { x: number; z: number }, r: number, color: THREE.ColorRepresentation, slam = false) {
  const c = elHex(color), a0 = Math.atan2(dir.z, dir.x);
  for (let i = -4; i <= 4; i++) {
    const a = a0 + i * 0.13, q = { x: p.x + Math.cos(a) * r * 0.7, y: slam ? 0.3 : 0.9, z: p.z + Math.sin(a) * r * 0.7 };
    fx('streak', q, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.2, size: 1.1, sizeEnd: 0.2 });
    if (slam) fx('smoke', q, { count: 1, color: 0x7a6a56, colorEnd: 0x2a2420, speed: 1.5, up: 0.5, life: 0.7, size: 0.9, sizeEnd: 1.8 });
  }
  if (slam) scorch({ x: p.x + dir.x * r * 0.5, z: p.z + dir.z * r * 0.5 }, r * 0.55, 0x2a2018, 1.8);
}
/** 地震波：沿直线一段段裂开 */
export function groundRupture(p: P2, r: number, color: THREE.ColorRepresentation) {
  scorch(p, r * 0.9, 0x2a2018, 1.6);
  fx('shard', { x: p.x, y: 0.2, z: p.z }, { count: 6, color: 0x8a7a66, color2: elHex(color), radius: r * 0.5, speed: 2, up: 4, life: 0.8, size: 0.35, sizeEnd: 0.25, gravity: 14, spin: 3 });
}

/** 弹体拖尾：按元素形状区分（法术每帧调） */
export function projTrail(p: P3, el: string, big: boolean) {
  const s = big ? 1.3 : 1;
  switch (el) {
    case 'fire': fx('flame', p, { count: 2, color: 0xffd080, color2: 0xff6a10, colorEnd: 0x601008, radius: 0.12, speed: 0.3, up: 0.6, life: 0.35, size: 0.7 * s, sizeEnd: 0.15 }); if (Math.random() < 0.3) fx('smoke', p, { count: 1, color: 0x3a302a, colorEnd: 0x1a1614, speed: 0.2, up: 0.5, life: 0.8, size: 0.5 * s, sizeEnd: 1.1 * s }); break;
    case 'frost': fx('ice', p, { count: 1, color: 0xe8f8ff, color2: 0x7fd0ff, radius: 0.15, speed: 0.4, up: 0, life: 0.4, size: 0.3 * s, sizeEnd: 0.1, spin: 1 }); fx('smoke', p, { count: 1, color: 0xcfe8ff, colorEnd: 0x8090a0, speed: 0.1, up: 0, life: 0.4, size: 0.4 * s, sizeEnd: 0.8 }); break;
    case 'arcane': fx('dot', p, { count: 2, color: 0xe0a0ff, color2: 0x8040ff, radius: 0.15, speed: 0.5, up: 0, life: 0.45, size: 0.22 * s, sizeEnd: 0.04 }); if (Math.random() < 0.35) fx('rune', p, { count: 1, color: 0xd07dff, speed: 0, up: 0, life: 0.4, size: 0.5 * s, sizeEnd: 0.2, spin: 1 }); break;
    case 'nature': fx('dot', p, { count: 2, color: 0xb0ff60, color2: 0x4ad010, radius: 0.12, speed: 0.4, up: 0.2, life: 0.4, size: 0.2 * s, sizeEnd: 0.05 }); break;
    case 'shadow': fx('smoke', p, { count: 1, color: 0x40206a, colorEnd: 0x100418, speed: 0.2, up: 0.1, life: 0.5, size: 0.5 * s, sizeEnd: 1 }); break;
    default: fx('streak', p, { count: 1, color: 0xffffff, color2: 0xffd090, speed: 0, up: 0, life: 0.15, size: 0.5, sizeEnd: 0.1 });
  }
}

/** 奥术禁锢 / 目标处法阵：符文环收紧 + 紫色锁链光点 */
export function arcaneBind(p: P2, r: number, color: THREE.ColorRepresentation = 0xb070ff) {
  const c = elHex(color);
  sigil(p, r, c, 1.2);
  fx('rune', { x: p.x, y: 1.0, z: p.z }, { count: 8, color: c, color2: 0xf0c8ff, radius: r * 0.9, ring: true, speed: -r * 0.8, swirl: 3, up: 0, life: 0.9, size: 0.6, sizeEnd: 0.25, spin: 0.8 });
  fx('dot', { x: p.x, y: 0.3, z: p.z }, { count: 24, color: 0xf0c8ff, color2: c, radius: r * 0.6, speed: 0.2, up: 2.4, life: 0.8, size: 0.18, sizeEnd: 0.04 });
  fx('star', { x: p.x, y: 1, z: p.z }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.25, size: 3, sizeEnd: 0.5 });
}
/** 闪现：起点奥术碎光 + 终点星芒，中间残影光点 */
export function blinkFx(a: P2, b: P2, color: THREE.ColorRepresentation) {
  const c = elHex(color);
  sigil(a, 1.6, c, 0.6);
  fx('shard', { x: a.x, y: 1, z: a.z }, { count: 14, color: 0xf0c8ff, color2: c, speed: 5, up: 1, life: 0.5, size: 0.25, sizeEnd: 0.1, drag: 2, spin: 3 });
  for (let i = 1; i < 8; i++) { const k = i / 8; fx('streak', { x: a.x + (b.x - a.x) * k, y: 1, z: a.z + (b.z - a.z) * k }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.25, size: 0.9, sizeEnd: 0.1 }); }
  fx('star', { x: b.x, y: 1, z: b.z }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.3, size: 2.4, sizeEnd: 0.3 });
}

/** 时轮投掷：轮刃飞行时每帧调，金色沙弧 */
export function wheelTrail(p: P3, echo: boolean) {
  const g = echo ? 0x7ab0ff : 0xffc860;
  fx('sand', p, { count: 2, color: echo ? 0xa8c8ff : 0xffe0a0, color2: g, radius: 0.45, ring: true, speed: 0.3, swirl: 6, up: 0, life: 0.35, size: 0.22, sizeEnd: 0.05 });
  if (Math.random() < 0.3) fx('streak', p, { count: 1, color: 0xfff0c0, color2: g, speed: 0, up: 0, life: 0.18, size: 0.8, sizeEnd: 0.1 });
}
/** 终刻 / 时停：巨大钟面法阵 + 时针扫过 + 碎裂的时间玻璃 */
export function timeStop(p: P2, r: number) {
  sigil(p, r, 0x7ab0ff, 2.4); sigil(p, r * 0.55, 0xffd070, 2.4);
  const hand = new THREE.Group(); const bar = noOutline(new THREE.Mesh(new THREE.PlaneGeometry(0.18, r * 0.9), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  bar.rotation.x = -Math.PI / 2; bar.position.z = r * 0.45; hand.add(bar); hand.position.set(p.x, gy(p.x, p.z) + 0.07, p.z);
  live(hand, 1.6, k => { hand.rotation.y = -k * Math.PI * 2; (bar.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k * k); });
  fx('shard', { x: p.x, y: 1.5, z: p.z }, { count: 26, color: 0xe8f4ff, color2: 0x7ab0ff, radius: 0.6, speed: r * 1.4, up: 0.8, life: 0.8, size: 0.35, sizeEnd: 0.2, drag: 1.5, spin: 2 });
  fx('sand', { x: p.x, y: 0.4, z: p.z }, { count: 40, color: 0xffe0a0, color2: 0xc08a40, radius: r, ring: true, speed: -r * 0.6, swirl: 3, up: 0.3, life: 1.2, size: 0.25, sizeEnd: 0.06 });
  fx('star', { x: p.x, y: 1.4, z: p.z }, { count: 1, color: 0xffffff, color2: 0x9ac8ff, speed: 0, up: 0, life: 0.4, size: 7, sizeEnd: 1 });
}
/** 时之裂隙常驻：向内卷的紫金沙 */
export function riftTick(p: P2, r: number) {
  fx('sand', { x: p.x, y: 0.4, z: p.z }, { count: 2, color: 0xb09aff, color2: 0xffd070, radius: r * 0.9, ring: true, speed: -r * 1.2, swirl: 5, up: 0.1, life: 0.6, size: 0.22, sizeEnd: 0.05 });
}

/** 炼金抛物瓶：飞行每帧调，冒色泡与细烟 */
export function lobTrail(p: P3, color: number) {
  fx('dot', p, { count: 1, color, color2: 0xffffff, radius: 0.08, speed: 0.3, up: 0.2, life: 0.4, size: 0.2, sizeEnd: 0.05 });
  if (Math.random() < 0.4) fx('smoke', p, { count: 1, color, colorEnd: 0x303030, speed: 0.1, up: 0.2, life: 0.5, size: 0.35, sizeEnd: 0.8 });
}
/** 大釜炮台：放下时绿色蒸汽爆 + 符文盘；常驻冒泡与蒸汽；开火时炮口闪 */
export function cauldronDrop(p: P2) {
  sigil(p, 1.5, 0x9aff3a, 1);
  fx('smoke', { x: p.x, y: 0.3, z: p.z }, { count: 12, color: 0xb8ff80, color2: 0x6ad030, colorEnd: 0x2a4020, radius: 0.5, ring: true, speed: 2.2, up: 0.6, life: 0.9, size: 0.9, sizeEnd: 1.8, drag: 2 });
  fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: 8, color: 0x8a7a66, color2: 0x4a3a2c, speed: 4, up: 1.6, life: 0.6, size: 0.22, sizeEnd: 0.18, gravity: 14, spin: 3 });
}
export function cauldronTick(p: P2, color = 0x8aff40) {
  if (Math.random() < 0.35) fx('dot', { x: p.x, y: 1.05, z: p.z }, { count: 1, color, color2: 0xffffff, radius: 0.3, speed: 0.1, up: 0.6, life: 0.5, size: 0.22, sizeEnd: 0.32 });
  if (Math.random() < 0.12) fx('smoke', { x: p.x, y: 1.2, z: p.z }, { count: 1, color: 0xcfffb0, colorEnd: 0x506048, speed: 0.15, up: 1.2, life: 1.4, size: 0.6, sizeEnd: 1.6 });
}
export function cauldronFire(p: P2, color = 0x8aff40) {
  fx('star', { x: p.x, y: 1.2, z: p.z }, { count: 1, color: 0xffffff, color2: color, speed: 0, up: 0, life: 0.15, size: 1.6, sizeEnd: 0.3 });
  fx('smoke', { x: p.x, y: 1.2, z: p.z }, { count: 4, color, colorEnd: 0x303030, radius: 0.2, speed: 1.2, up: 1.4, life: 0.7, size: 0.6, sizeEnd: 1.3 });
}

// ================================================================ v0.9.1i 敌人
/** 敌人倒下：尘土 + 灵魂光点；精英金色爆点、稀有紫色符文 */
export function enemyDeath(p: { x: number; z: number }, scale: number, tier: '' | 'elite' | 'rare' | 'boss') {
  if (tier === 'boss') return;   // 首领走 bossfx.bossDeath
  fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 6, color: 0x6a5a48, color2: 0x4a3e32, colorEnd: 0x2a2420, radius: 0.5 * scale, ring: true, speed: 1.6, up: 0.3, life: 0.8, size: 0.8 * scale, sizeEnd: 1.6 * scale, drag: 2 });
  fx('dot', { x: p.x, y: 0.8 * scale, z: p.z }, { count: 8, color: 0xd8b0ff, color2: 0x8a50ff, radius: 0.4 * scale, speed: 0.6, up: 2, life: 1.1, size: 0.2, sizeEnd: 0.04 });
  if (tier) {
    const c = tier === 'rare' ? 0xc080ff : 0xffb040;
    sigil(p, 2 * scale, c, 1.4);
    fx('star', { x: p.x, y: 1.2 * scale, z: p.z }, { count: 1, color: 0xffffff, color2: c, speed: 0, up: 0, life: 0.3, size: 3.5 * scale, sizeEnd: 0.5 });
    fx(tier === 'rare' ? 'rune' : 'spark', { x: p.x, y: 0.6, z: p.z }, { count: 18, color: c, color2: 0xffffff, radius: 0.6 * scale, ring: true, speed: 4, up: 2, life: 0.8, size: 0.4, sizeEnd: 0.08, drag: 1.5, spin: 0.6 });
    fx('streak', { x: p.x, y: 0.3, z: p.z }, { count: 10, color: 0xffffff, color2: c, radius: 0.5, speed: 0.3, up: 8, drag: 1, life: 0.6, size: 0.5, sizeEnd: 0.08 });
  }
}

/** v1.2.73b 卡顿修复：常用特效材质样本（prewarm.ts 开局预编译，同源码复用已编译程序） */
export function fxSampleMaterials(): THREE.Material[] {
  const c = new THREE.Color(1, 0.6, 0.2);
  return [ribbonMaterial(c.clone()), scorchMaterial(c.clone()), sigilMaterial(c.clone()),
    new THREE.MeshBasicMaterial({ map: fxAtlas(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: true }),
    new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })];
}
