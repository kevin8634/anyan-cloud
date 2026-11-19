// 11-15 钟铜熔炉熔岩池 HD（Rhett 02:13：液体、熔岩不要规则边缘，要自然）
//   旧版是一片 18 边正圆的橙色 MeshBasic。新版：
//   1) lavaShape(r, seed)：多频噪声起伏的不规则岸线（不是圆也不是方），另带 1–2 个小舌头流出去。
//   2) 熔岩着色器：流动的冷却硬壳（Voronoi 板块，板缝发亮），离岸越近壳越厚越暗，中心最亮；壳板慢慢漂、裂缝脉动。
//   3) 岸边过渡：一圈暗红发热的地面光晕（叠加，不规则），外圈冷却黑壳碎石（实例化，大小不一，半埋）。
//   4) 火星：少量上飘火点（中高画质）。低画质：只用不规则形状 + 纯色。
import * as THREE from 'three';

function rng(seed: number) { let s = (seed * 9301 + 49297) >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

/** 不规则岸线：极坐标半径叠多频正弦 + 随机舌头；返回闭合点列（局部 xz） */
export function lavaOutline(r: number, seed: number, n = 72): THREE.Vector2[] {
  const R = rng(seed), ph = Array.from({ length: 6 }, () => R() * 6.283), tongues = Array.from({ length: 1 + Math.floor(R() * 2) }, () => ({ a: R() * 6.283, w: 0.25 + R() * 0.3, l: 0.35 + R() * 0.5 }));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let k = 1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.1 * Math.sin(a * 3 + ph[1]) + 0.06 * Math.sin(a * 5 + ph[2]) + 0.035 * Math.sin(a * 9 + ph[3]) + 0.02 * Math.sin(a * 17 + ph[4]);
    for (const t of tongues) { let d = Math.abs(((a - t.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / t.w; if (d < 1) k += t.l * (1 - d * d) * (1 - d * d); }
    k *= 0.985 + 0.015 * R();
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k));
  }
  return pts;
}

/** 形状几何：中心扇形三角化，uv.x = 离岸深度（0 岸 → 1 中心），uv.y = 角度；位置在 xz 平面 */
function poolGeo(pts: THREE.Vector2[], scale = 1): THREE.BufferGeometry {
  const rings = 5, n = pts.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pos.push(0, 0, 0); uv.push(1, 0);
  for (let j = 1; j <= rings; j++) { const t = j / rings; for (let i = 0; i < n; i++) { const p = pts[i]; pos.push(p.x * t * scale, 0, p.y * t * scale); uv.push(1 - t, i / n); } }
  for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
  for (let j = 1; j < rings; j++) { const a0 = 1 + (j - 1) * n, b0 = 1 + j * n; for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; idx.push(a0 + i, a0 + i1, b0 + i, a0 + i1, b0 + i1, b0 + i); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

const LU = { uT: { value: 0 } };
let _lavaMat: THREE.ShaderMaterial | null = null, _glowMat: THREE.ShaderMaterial | null = null;
function lavaMat(): THREE.ShaderMaterial {
  if (_lavaMat) return _lavaMat;
  _lavaMat = new THREE.ShaderMaterial({
    uniforms: LU, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vW;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
vec2 vor(vec2 p){ vec2 ip = floor(p), fp = fract(p); float d1 = 9.0, d2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)), c = o + 0.5 + 0.4 * sin(uT * 0.15 + 6.283 * vec2(h2(ip + o), h2(ip + o + 7.0))) - fp; float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(sqrt(d1), sqrt(d2)); }
void main(){
  vec2 p = vW.xz * 1.6 + vec2(uT * 0.05, uT * 0.03) + vec2(n2(vW.xz * 0.4 + uT * 0.07), n2(vW.zx * 0.4 - uT * 0.05)) * 1.2;
  vec2 v = vor(p); float seam = 1.0 - smoothstep(0.0, 0.07 + 0.05 * n2(vW.xz * 2.0), v.y - v.x);
  float depth = vUv.x;                                 // 0 岸 → 1 中心
  float crust = smoothstep(0.15, 0.75, 1.0 - depth + (n2(vW.xz * 1.3) - 0.5) * 0.5);   // 岸边壳厚
  float pulse = 0.75 + 0.25 * sin(uT * 1.7 + n2(vW.xz * 0.6) * 6.0);
  vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.75, 0.25), smoothstep(0.4, 1.0, depth) * 0.7);
  vec3 shell = vec3(0.035, 0.02, 0.015) * (0.5 + 0.9 * n2(vW.xz * 6.0)) + vec3(0.12, 0.02, 0.0) * smoothstep(0.3, 0.0, v.y - v.x);
  float molten = max(seam * pulse, (1.0 - crust) * (0.55 + 0.45 * n2(p * 2.0)));
  vec3 c = mix(shell, hot * (1.1 + 0.8 * depth), molten);
  c += vec3(0.5, 0.08, 0.0) * (1.0 - crust) * 0.3;
  float edge = smoothstep(0.0, 0.06, depth);           // 最外一圈压暗成冷却边
  c *= mix(0.25, 1.0, edge);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  return _lavaMat;
}
function glowMat(): THREE.ShaderMaterial {
  if (_glowMat) return _glowMat;
  _glowMat = new THREE.ShaderMaterial({
    uniforms: LU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vW;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
void main(){ float k = vUv.x; float a = smoothstep(0.0, 1.0, k) * (0.6 + 0.4 * n2(vW.xz * 1.5)) * (0.85 + 0.15 * sin(uT * 1.3 + vW.x));
  gl_FragColor = vec4(vec3(0.9, 0.22, 0.03) * a * 0.55, 1.0); }`,
  });
  return _glowMat;
}

const embers: { pts: THREE.Points; base: Float32Array; ph: Float32Array }[] = [];
let _last = -1;
/** 每帧一次（任一熔岩 onBeforeRender 调；同一帧重复调只算一次） */
export function lavaTick() {
  const now = performance.now() / 1000; if (now === _last) return; _last = now;
  LU.uT.value = now % 1000;
  for (const e of embers) { const a = e.pts.geometry.getAttribute('position') as THREE.BufferAttribute, t = LU.uT.value;
    for (let i = 0; i < a.count; i++) { const life = (t * 0.35 + e.ph[i]) % 1; a.setXYZ(i, e.base[i * 3] + Math.sin(t + i) * 0.3 * life, life * 4.5, e.base[i * 3 + 2] + Math.cos(t * 0.8 + i) * 0.3 * life); }
    a.needsUpdate = true; }
}
export function lavaReset() { embers.length = 0; }

/** 一个熔岩池（局部原点在池心，贴地）；q = 'low' | 'mid' | 'hi' */
export function lavaPool(r: number, seed: number, q: 'low' | 'mid' | 'hi'): THREE.Group {
  const g = new THREE.Group(), pts = lavaOutline(r, seed);
  if (q === 'low') { const m = new THREE.Mesh(poolGeo(pts), new THREE.MeshBasicMaterial({ color: 0xff6a10 })); m.position.y = 0.04; g.add(m); return g; }
  const lava = new THREE.Mesh(poolGeo(pts), lavaMat()); lava.position.y = 0.05; lava.onBeforeRender = lavaTick; g.add(lava);
  // 岸外发热光晕：同一岸线放大 1.9 倍的环带（uv.x 反过来：岸 1 → 外 0）
  const outer = pts.map(p => p.clone().multiplyScalar(1.9)), n = pts.length, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) { pos.push(pts[i].x, 0, pts[i].y, outer[i].x, 0, outer[i].y); uv.push(1, 0, 0, 0); const i1 = (i + 1) % n; idx.push(i * 2, i1 * 2, i * 2 + 1, i1 * 2, i1 * 2 + 1, i * 2 + 1); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx);
  const glow = new THREE.Mesh(gg, glowMat()); glow.position.y = 0.03; glow.renderOrder = 2; g.add(glow);
  // 冷却黑壳碎石：沿岸线内外 ±0.5 米，大小不一，半埋
  const R = rng(seed + 11), rock = new THREE.IcosahedronGeometry(1, 0), rm = new THREE.MeshStandardMaterial({ color: 0x120e0c, roughness: 0.95, emissive: 0x2a0600, emissiveIntensity: 0.35 });
  const N = Math.round(r * (q === 'hi' ? 14 : 8)), im = new THREE.InstancedMesh(rock, rm, N), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) { const p = pts[Math.floor(R() * n)], k = 0.92 + R() * 0.25, s = 0.12 + Math.pow(R(), 2) * 0.5;
    e.set(R() * 6, R() * 6, R() * 6); qq.setFromEuler(e); m4.compose(new THREE.Vector3(p.x * k, s * 0.2, p.y * k), qq, new THREE.Vector3(s * (1 + R() * 0.6), s * 0.6, s)); im.setMatrixAt(i, m4); }
  im.receiveShadow = true; g.add(im);
  // 火星
  if (q === 'hi' || r > 2.5) { const M = Math.round(r * 6), base = new Float32Array(M * 3), ph = new Float32Array(M);
    for (let i = 0; i < M; i++) { const p = pts[Math.floor(R() * n)], t = R() * 0.8; base[i * 3] = p.x * t; base[i * 3 + 2] = p.y * t; ph[i] = R(); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(M * 3), 3));
    const pts2 = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.08, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts2.frustumCulled = false; g.add(pts2); embers.push({ pts: pts2, base, ph }); }
  return g;
}
