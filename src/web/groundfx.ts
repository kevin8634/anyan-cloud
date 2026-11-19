// v1.2.78 共用地面特效件（Rhett 11-03 23:41：省积分走共用件 + Unity 质感；不要明显的正圆范围圈，用不规则光晕 / 符文 / 断开弧段表达范围）
// 一个 ShaderMaterial 模板（所有实例共用同一个着色器程序，只 clone uniforms），全程序化、0 积分：
//   zoneDecal  —— 持续区域：噪声不规则外缘 + 断开的流光弧段 + 缓转的符文刻点 + 按元素换的地表纹理（焦痕余烬 / 尘土刮痕 / 腐蚀泡 / 墨烟 / 星尘符文 / 电焦纹 / 灵雾）
//   groundBurst —— 爆开 / 命中：不规则冲击前沿向外推（断续、带碎屑点），替代旧的正圆光环 spawnRing
// 色板按《技能特效总纲》§3（UI 文字仍用 main 的 ELEMENT_COLOR，不动）。
import * as THREE from 'three';
import type { Element } from '../core/types';
import { noOutline } from './models';

export type FxPattern = 'physical' | 'fire' | 'frost' | 'lightning' | 'arcane' | 'poison' | 'shadow' | 'holy' | 'spirit' | 'bleed' | 'tide';
const PAT_ID: Record<FxPattern, number> = { physical: 0, fire: 1, frost: 2, lightning: 3, arcane: 4, poison: 5, shadow: 6, holy: 7, spirit: 8, bleed: 9, tide: 10 };

/** 总纲 §3 色板：主色 / 辅色 / 高光（神圣按金白补，总纲未列） */
export const FX_PAL: Record<FxPattern, [number, number, number]> = {
  physical: [0x8a8f96, 0x8b6f4e, 0xffc56b],
  fire: [0xe2481b, 0x2a2421, 0xffe7a3],
  frost: [0x9fd8e8, 0x2e5f7a, 0xf2fbff],
  lightning: [0x7b6cff, 0x6fd3ff, 0xf4f1ff],
  arcane: [0x8e5bff, 0x2b1a47, 0xf3d9ff],
  poison: [0x9dba3a, 0x3d4a1e, 0xd8e870],
  shadow: [0x14101c, 0x3a2350, 0x7a4aa0],
  holy: [0xf0c860, 0x6a4a18, 0xfff4cc],
  spirit: [0xa9c3c6, 0x5e7478, 0xe6f4f4],
  bleed: [0x6e0f12, 0xa3262b, 0xd04040],
  tide: [0x1e4c5c, 0xe6f2f0, 0x5fe3d0],
};
/** 游戏元素 → 特效纹理（自然 = 毒 / 腐蚀；雷电独立元素） */
export function patOf(el: Element | string): FxPattern {
  switch (el) {
    case 'fire': return 'fire'; case 'frost': return 'frost'; case 'lightning': return 'lightning'; case 'arcane': return 'arcane';
    case 'nature': return 'poison'; case 'shadow': return 'shadow'; case 'holy': return 'holy'; case 'physical': return 'physical';
    default: return (el in PAT_ID ? el : 'physical') as FxPattern;
  }
}

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FRAG = `
uniform vec3 c1; uniform vec3 c2; uniform vec3 ch;
uniform float t; uniform float k; uniform float mode; uniform float pat; uniform float seed; uniform float alpha;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 17.13) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
bool isPat(float id){ return abs(pat - id) < 0.5; }
void main(){
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float a = atan(d.y, d.x);
  vec2 ca = vec2(cos(a), sin(a));
  // 不规则外缘：沿圆周取无缝噪声（用单位圆坐标，没有接缝）
  float en = fbm(ca * 1.8 + vec2(seed * 3.1, t * 0.04));
  float edge = 0.74 + 0.22 * en;
  float grow = mode < 0.5 ? smoothstep(0.0, 0.35, t) : 1.0 - pow(1.0 - k, 3.0);
  float front = edge * (mode < 0.5 ? (0.55 + 0.45 * grow) : (0.12 + 0.88 * grow));
  if (r > front + 0.08) discard;
  float life = mode < 0.5 ? min(1.0, t * 5.0) * min(1.0, (1.0 - k) * 4.0) : pow(1.0 - k, 1.4);
  vec3 col = c1; float al = 0.0;
  float fn = fbm(d * 3.2 + vec2(seed, t * 0.12));
  float inside = 1.0 - smoothstep(front - 0.30, front, r);
  if (mode < 0.5) {
    // ---- 持续区域
    // 底层：按元素的地表纹理（低透明，靠噪声斑驳，不是实心盘）
    float base = 0.0; vec3 bc = mix(c2, c1, fn);
    if (isPat(1.0)) {        // 火：焦痕 + 一闪一闪的余烬点
      float charM = smoothstep(0.45, 0.75, fn); bc = mix(c1 * 0.55, c2, charM); base = 0.26 + 0.22 * charM;
      vec2 cell = floor(d * 26.0); float e = h21(cell);
      if (e > 0.93) { float tw = 0.5 + 0.5 * sin(t * (4.0 + e * 6.0) + e * 40.0); bc = mix(bc, ch, tw); base = max(base, 0.55 * tw); }
    } else if (isPat(0.0) || isPat(9.0)) {   // 物理 / 流血：尘土 + 刮痕
      float dust = smoothstep(0.4, 0.8, fn); base = 0.16 + 0.18 * dust;
      float sc = abs(sin((d.x * cos(seed * 6.0) + d.y * sin(seed * 6.0)) * 34.0 + fn * 6.0));
      float scr = (1.0 - smoothstep(0.0, 0.08, sc)) * step(0.55, vn(d * 5.0 + seed));
      bc = mix(bc, c2 * 0.45, scr); base = max(base, 0.42 * scr);
    } else if (isPat(5.0)) {  // 毒 / 腐蚀：斑块 + 冒泡
      float blot = smoothstep(0.42, 0.7, fn); base = 0.18 + 0.26 * blot; bc = mix(c2, c1, blot);
      vec2 g = d * 9.0; vec2 cell = floor(g); vec2 f = fract(g) - 0.5; float rnd = h21(cell);
      float ph = fract(t * (0.35 + rnd * 0.5) + rnd);
      float bub = (1.0 - smoothstep(0.0, 0.05, abs(length(f) - 0.32 * ph))) * step(0.72, rnd) * (1.0 - ph);
      bc = mix(bc, ch, bub); base = max(base, 0.6 * bub);
    } else if (isPat(6.0)) {  // 暗影：墨烟（吸光，深色）
      float ink = fbm(d * 2.4 + vec2(t * 0.1, -t * 0.07)); base = 0.32 + 0.4 * smoothstep(0.35, 0.75, ink); bc = mix(c1, c2, smoothstep(0.55, 0.9, ink) * 0.6);
    } else if (isPat(3.0)) {  // 雷电：电焦裂纹
      float cr = abs(fbm(d * 4.5 + seed) - 0.5); float line = 1.0 - smoothstep(0.0, 0.035, cr);
      float fl = step(0.6, fract(sin(floor(t * 12.0) + seed) * 91.7));
      bc = mix(c2 * 0.4, mix(c1, ch, fl), line); base = 0.1 + line * (0.4 + 0.4 * fl);
    } else if (isPat(2.0)) {  // 冰：霜斑（冰霜一般走 iceField，这里兜底）
      float fr = smoothstep(0.4, 0.8, fn); base = 0.2 + 0.3 * fr; bc = mix(c2, ch, fr);
    } else {                  // 奥术 / 神圣 / 灵 / 潮：星尘 + 雾
      float mist = smoothstep(0.35, 0.8, fbm(d * 2.2 + vec2(0.0, t * 0.15))); base = 0.12 + 0.18 * mist;
      vec2 cell = floor(d * 22.0); float s = h21(cell);
      if (s > 0.95) { float tw = 0.5 + 0.5 * sin(t * 3.0 + s * 50.0); bc = mix(bc, ch, tw); base = max(base, 0.6 * tw); }
    }
    base *= inside;
    // 外缘：断开的流光弧段（不是整圈），沿边缘缓慢流动
    float seg = smoothstep(0.5, 0.72, vn(vec2(a * 2.6 + t * 0.55, seed * 9.0)));
    float rim = exp(-abs(r - front) * 30.0) * (0.08 + 0.92 * seg);
    // 内圈符文刻点：一圈断续的短刻痕，缓转；只在奥术 / 神圣 / 灵 / 潮 / 雷 / 暗影出现，物理 / 火 / 毒用碎屑点代替
    float rr = front * 0.84;
    float q = fract((a / 6.2832 + t * 0.025) * 28.0);
    float glyphOn = step(0.38, vn(vec2(floor((a / 6.2832 + t * 0.025) * 28.0), seed * 5.0)));
    float tick = (1.0 - smoothstep(0.18, 0.32, abs(q - 0.5))) * exp(-abs(r - rr) * 70.0) * glyphOn;
    bool runic = isPat(4.0) || isPat(7.0) || isPat(8.0) || isPat(10.0) || isPat(3.0) || isPat(6.0);
    if (!runic) tick *= 0.35 * step(0.6, h21(vec2(floor(q * 3.0), floor(a * 9.0))));
    vec3 rc = isPat(6.0) ? c2 * 1.6 : mix(c1, ch, 0.5 + 0.5 * seg);
    col = bc; al = base;
    col = mix(col, rc, clamp(rim + tick, 0.0, 1.0));
    al = max(al, 0.6 * rim + 0.6 * tick);
  } else {
    // ---- 爆开：不规则冲击前沿 + 内侧尘雾，前沿断续
    float seg = smoothstep(0.3, 0.6, vn(vec2(a * 3.4, seed * 11.0)));
    float band = exp(-abs(r - front) * (16.0 + 18.0 * k)) * (0.3 + 0.7 * seg);
    float haze = (1.0 - smoothstep(0.0, front, r)) * (0.18 + 0.2 * fn) * (1.0 - k);
    vec2 cell = floor(d * 18.0); float s = h21(cell);
    float debris = step(0.94, s) * exp(-abs(r - front * (0.7 + 0.3 * s)) * 12.0);
    col = mix(mix(c2, c1, fn), mix(c1, ch, seg), clamp(band * 1.5, 0.0, 1.0));
    al = max(haze, max(0.85 * band, 0.7 * debris));
  }
  gl_FragColor = vec4(col, clamp(al * 1.6, 0.0, 0.95) * life * alpha);
}`;

let tmpl: THREE.ShaderMaterial | null = null;
function template(): THREE.ShaderMaterial {
  return tmpl ??= new THREE.ShaderMaterial({
    name: 'groundfx', vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4,
    uniforms: { c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, ch: { value: new THREE.Color() }, t: { value: 0 }, k: { value: 0 }, mode: { value: 0 }, pat: { value: 0 }, seed: { value: 0 }, alpha: { value: 1 } },
  });
}
const geo = new THREE.PlaneGeometry(2, 2);

export interface GroundFxHost { add: (obj: THREE.Object3D, dur: number, update: (k: number) => void) => void; groundY: (x: number, z: number) => number; time: () => number; }
let host: GroundFxHost | null = null;
export function bindGroundFx(h: GroundFxHost) { host = h; }

function mk(pat: FxPattern, mode: number, colOverride?: number) {
  const m = template().clone();   // clone 共用同一个着色器程序（源码相同 → 程序缓存命中）
  const [a, b, c] = FX_PAL[pat];
  (m.uniforms.c1.value as THREE.Color).setHex(colOverride ?? a);
  (m.uniforms.c2.value as THREE.Color).setHex(b);
  (m.uniforms.ch.value as THREE.Color).setHex(c);
  m.uniforms.pat.value = PAT_ID[pat]; m.uniforms.mode.value = mode; m.uniforms.seed.value = Math.random();
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; noOutline(mesh);
  return mesh;
}

/** 持续区域地面（替代 makeDisc + makeRing 的实心盘 + 正圆环） */
export function zoneDecal(p: { x: number; z: number }, r: number, el: Element | FxPattern, dur: number) {
  if (!host) return null;
  const pat = patOf(el), m = mk(pat, 0);
  m.scale.setScalar(r * 1.12);   // 外缘噪声在 0.74–0.96，放大一点让平均边缘≈判定半径
  m.position.set(p.x, host.groundY(p.x, p.z) + 0.045, p.z);
  m.rotation.z = Math.random() * 6.28;
  const u = (m.material as THREE.ShaderMaterial).uniforms, t0 = host.time();
  host.add(m, dur, k => { u.k.value = k; u.t.value = host!.time() - t0; if (k >= 1) (m.material as THREE.Material).dispose(); });
  return m;
}

/** 爆开 / 命中冲击（替代 spawnRing 的正圆光环）；color 给了就当主色 */
export function groundBurst(p: { x: number; z: number }, radius: number, el: Element | FxPattern, dur: number, color?: number) {
  if (!host) return null;
  const pat = patOf(el), m = mk(pat, 1, color);
  m.scale.setScalar(Math.max(0.6, radius * 1.1));
  m.position.set(p.x, host.groundY(p.x, p.z) + 0.06, p.z);
  m.rotation.z = Math.random() * 6.28;
  const u = (m.material as THREE.ShaderMaterial).uniforms, t0 = host.time();
  host.add(m, Math.max(0.25, dur * 1.2), k => { u.k.value = k; u.t.value = host!.time() - t0; if (k >= 1) (m.material as THREE.Material).dispose(); });
  return m;
}

/** 预热用：建一个实例（加载画面里画几帧） */
export function groundFxWarm(): THREE.Mesh { return mk('fire', 0); }
