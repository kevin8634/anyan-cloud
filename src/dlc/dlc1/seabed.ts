// ======================================================================
// DLC1 镜渊城 · 倒钟广场海底地面与水景（概念图 docs/黑客松素材/场景概念/seabed_floor.webp）
//   1. 浅层液态水面：平面镜面反射（Reflector，高 / 超高档）倒映钟楼与倒挂之城，涟漪法线扭曲倒影；中 / 低档回退到环境贴图
//   2. 水滴：随机水滴从穹顶落下（拉长的水线）→ 落水激起扩散环形涟漪 + 溅起水花；玩家在水里走也会带出涟漪
//   3. 岸边浪沫、月光高光（随涟漪闪烁）
//   4. 地面（plaza_dress 地面 shader 调用 seabedFloorPatch）：水下焦散光纹、积水遮罩（低粗糙度 + 压暗）、沙地波纹、湿地环境反射
//   5. 发光青色水潭 / 符文坑、漂浮青色光点、贴地薄雾
//   6. 海草丛（实体丝带叶片 instanced + 顶点 shader 摇摆；比赛版加 Lux3D 海草丛）、半埋铜钟、断锁链、藤壶礁石、远处沉船
//   档位：low = 无反射 / 无焦散 / 无水滴 / 无雾；medium = 环境反射 + 半强度焦散 + 水滴；high / ultra = 平面反射 + 全部
// ======================================================================
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { makeGlbScene } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { lakeBuild } from './mirrorlake';
import { WATER2, W2_GLSL } from '../../web/water2';   // 11-17 水体 v2：岸沫 Beer-Lambert 透明度 + 受光（?off=water2 回旧）
import { SEA_GLOW, SEA_WATER, SEA_SAND, SEA_PUDDLES, LAKE, LAKE_GLSL, SEA_MOON, lakeSd, seaGround, slabTopAt, seaFloorY, bridgeAt, deckY, BRIDGE_HW } from './seafloor';
/** 第五轮：贴地高度（局部坐标；地面有起伏 / 石板，散布物件不再固定在 y = 0） */
const gY = (x: number, z: number) => seaGround(x, z);

const HALF = 86;
const DRIFT_COB = (() => { try { return /(?:[?&]off=[^&]*\bcobsand\b)/.test(location.search); } catch { return false; } })();
/** 月亮方向（世界，指向月亮）：和概念构图机位（改后_8，向东北看钟楼）对齐，倒影里有亮斑；天上同方向放月亮精灵 */
export const MOON_DIR = new THREE.Vector3(SEA_MOON[0], SEA_MOON[1], SEA_MOON[2]).normalize();   // 第五轮：月亮升高到穹顶破口方向（倒影亮斑跟着它）
const MASK_S = 512;
const WATER_Y = 0.045;
const q = () => curQuality;
const hi = () => q() === 'ultra' || q() === 'high';
const has = (id: string) => id in PACK_CREATURE_GLB && q() !== 'low';
let seed = 77; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** 全局时间（地面焦散 / 水面 / 海草 / 光点共用） */
export const seaU = { uTime: { value: 0 } };

// ---------------------------------------------------------------- 水 / 沙 / 发光遮罩（局部坐标 → 512² canvas；CPU 保留一份供采样）
/** 水域（局部坐标，椭圆 [x, z, rx, rz, 旋转]）—— 第五轮：表格挪到 seafloor（地形洼地 / 遮罩共用） */
const WATER = SEA_WATER;
/** 发光水潭 / 符文坑 [x, z, r, 0 = 水潭 / 1 = 符文坑] */
const GLOW = SEA_GLOW;
/** 主角铜钟（半埋倾倒、钟口溢青光）[x, z, 尺寸, 钟口朝向点 x, z] */
const HERO_BELLS: [number, number, number, number, number][] = [[14, -40, 2.4, 3, -46], [45, -29.5, 2.2, 30, -42]];   // 第三轮：原 28.5,-36.5 那口换成前景大钟 FG_BELL
/** 第三轮：概念构图机位（8_概念构图）前景右上的大钟，坐在水边碎石堆上，钟口朝镜头左下 [x, z, 尺寸, 钟口朝向点 x, z, 抬高] */
const FG_BELL: [number, number, number, number, number, number] = [26.5, -35.5, 2.9, 29.5, -49, 0.7];   // 第五轮：3.4 → 2.9（部分机位压屏）
let maskData: Uint8ClampedArray | null = null, maskTex: THREE.CanvasTexture | null = null;
function buildMask(): THREE.CanvasTexture {
  if (maskTex) return maskTex;
  const S = MASK_S, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const px = (v: number) => (v / (HALF * 2) + 0.5) * S, pr = (v: number) => v / (HALF * 2) * S;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
  seed = 991;
  // R：水（大水域 + 散落积水坑）
  g.filter = 'blur(2px)'; g.fillStyle = 'rgb(255,0,0)';
  for (const [x, z, rx, rz, a] of WATER) { g.beginPath(); g.ellipse(px(x), px(z), pr(rx), pr(rz), a, 0, Math.PI * 2); g.fill(); }
  for (const [x, z, rx, rz, a, k] of SEA_PUDDLES) { g.fillStyle = `rgb(${Math.floor(k * 255)},0,0)`; g.beginPath(); g.ellipse(px(x), px(z), pr(rx), pr(rz), a, 0, Math.PI * 2); g.fill(); }   // 积水坑（与地形洼地同一张表）
  // 第五轮：深水湖（湖岸等值线外扩 0.4 米）
  g.fillStyle = 'rgb(255,0,0)'; g.beginPath();
  for (let i = 0; i <= 160; i++) { const an = i / 160 * Math.PI * 2; let r = LAKE.R * 1.2; for (let k = 0; k < 6; k++) { const sd = lakeSd(LAKE.x + Math.cos(an) * r, LAKE.z + Math.sin(an) * r) - 0.4; r -= sd * 0.8; }
    const X = px(LAKE.x + Math.cos(an) * r), Z = px(LAKE.z + Math.sin(an) * r); if (i) g.lineTo(X, Z); else g.moveTo(X, Z); }
  g.fill();
  // 外缘：平台边一圈浅海
  g.filter = 'blur(6px)'; g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = pr(9); g.strokeRect(px(-HALF + 3), px(-HALF + 3), pr(HALF * 2 - 6), pr(HALF * 2 - 6));
  // G：沙地
  g.filter = 'blur(5px)'; g.fillStyle = 'rgb(0,255,0)';
  for (const [x, z, rx, rz, a] of SEA_SAND) { g.beginPath(); g.ellipse(px(x), px(z), pr(rx * 1.1), pr(rz * 1.1), a, 0, Math.PI * 2); g.fill(); }
  // B：发光坑周围的湿痕
  g.filter = 'blur(4px)';
  for (const [x, z, r] of GLOW) { g.fillStyle = 'rgb(0,0,255)'; g.beginPath(); g.arc(px(x), px(z), pr(r * 3.2), 0, Math.PI * 2); g.fill(); }
  for (const [x, z, sz, tx, tz] of [...HERO_BELLS, FG_BELL]) {   // 钟口前方溢光区
    const L = Math.hypot(tx - x, tz - z) || 1, mx = x + (tx - x) / L * sz * 0.9, mz = z + (tz - z) / L * sz * 0.9;
    g.fillStyle = 'rgb(0,0,230)'; g.beginPath(); g.arc(px(mx), px(mz), pr(sz * 1.9), 0, Math.PI * 2); g.fill(); }
  g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  maskData = g.getImageData(0, 0, S, S).data;
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;   // flipY 关：canvas 行 = 局部 z，和 CPU 采样一致
  return (maskTex = t);
}
/** 局部坐标的水深（0..1） */
export function waterAt(lx: number, lz: number): number {
  if (!maskData) return 0;
  const x = Math.floor((lx / (HALF * 2) + 0.5) * MASK_S), z = Math.floor((lz / (HALF * 2) + 0.5) * MASK_S);
  if (x < 0 || z < 0 || x >= MASK_S || z >= MASK_S) return 0;
  return maskData[(z * MASK_S + x) * 4] / 255;
}

// ---------------------------------------------------------------- 第五轮：岸线距离场（水面接触泡沫）
//   1024² 覆盖整片平台：每格算真实表面高度（石板顶面 / 缝里砂砾 / 桥面 / 障碍物圆盘），比水面高 = 干；
//   两遍倒角距离变换 → R = 到最近干处的距离（0..2 米），G = 水深（0..0.6 米），B = 深水湖
const SHORE_S = 1024;
const dryDiscs: [number, number, number][] = [];
/** 登记一个露出水面的障碍物（局部坐标圆盘：铜钟、礁石、桥墩、塔基……），烘焙岸线泡沫时当作干地 */
export function seaDry(x: number, z: number, r: number) { dryDiscs.push([x, z, r]); }
let shoreTex: THREE.DataTexture | null = null;
export function seaShoreTex(): THREE.DataTexture {
  if (shoreTex) return shoreTex;
  const S = SHORE_S, cell = HALF * 2 / S, D = new Float32Array(S * S), data = new Uint8Array(S * S * 4), slabs = hi();
  const INF = 1e6;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell, k = j * S + i;
    const sd = lakeSd(x, z), w = waterAt(x, z);
    let wet = w > 0.3 || sd < 0.4, h = 0;
    if (wet) {
      const b = bridgeAt(x, z);
      if (b.d < BRIDGE_HW + 0.08) h = deckY(b.s);
      else { const t = slabs ? slabTopAt(x, z) : null; h = t ?? seaFloorY(x, z, slabs); }
      if (h > WATER_Y - 0.004) wet = false;
      data[k * 4 + 1] = Math.max(0, Math.min(255, (WATER_Y - h) / 0.6 * 255));
    }
    data[k * 4 + 2] = sd < -0.5 ? 255 : 0; data[k * 4 + 3] = 255;
    D[k] = wet ? INF : 0;
  }
  for (const [x, z, r] of dryDiscs) { const ci = (x + HALF) / cell, cj = (z + HALF) / cell, rr = r / cell;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(S - 1, Math.ceil(cj + rr)); j++) for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(S - 1, Math.ceil(ci + rr)); i++) if (Math.hypot(i + 0.5 - ci, j + 0.5 - cj) < rr) D[j * S + i] = 0; }
  // 倒角距离（3-4 近似欧氏）
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = j * S + i; let v = D[k]; if (!v) continue;
    if (i > 0) v = Math.min(v, D[k - 1] + 3); if (j > 0) { v = Math.min(v, D[k - S] + 3); if (i > 0) v = Math.min(v, D[k - S - 1] + 4); if (i < S - 1) v = Math.min(v, D[k - S + 1] + 4); } D[k] = v; }
  for (let j = S - 1; j >= 0; j--) for (let i = S - 1; i >= 0; i--) { const k = j * S + i; let v = D[k]; if (!v) continue;
    if (i < S - 1) v = Math.min(v, D[k + 1] + 3); if (j < S - 1) { v = Math.min(v, D[k + S] + 3); if (i < S - 1) v = Math.min(v, D[k + S + 1] + 4); if (i > 0) v = Math.min(v, D[k + S - 1] + 4); } D[k] = v; }
  for (let k = 0; k < S * S; k++) data[k * 4] = Math.min(255, D[k] / 3 * cell / 2 * 255);
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return (shoreTex = t);
}
/** 水面共用：细波纹法线 + 岸线接触泡沫 / 碎沫 / 小浪花（GLSL；需要 uShore、uTime、wh/wn） */
const FOAM_GLSL = `
vec2 seaFineWaves(vec2 p, float t){
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.97, -0.24), d4 = vec2(-0.2, -0.98), d5 = vec2(0.62, -0.78), d6 = vec2(-0.93, 0.37);
  g += d1 * cos(dot(p, d1) * 2.3 + t * 1.3) * 0.010; g += d2 * cos(dot(p, d2) * 4.1 + t * 1.8) * 0.009;
  g += d3 * cos(dot(p, d3) * 7.3 + t * 2.5) * 0.008; g += d4 * cos(dot(p, d4) * 11.9 + t * 3.3) * 0.007;
  g += d5 * cos(dot(p, d5) * 19.0 + t * 4.4) * 0.006; g += d6 * cos(dot(p, d6) * 27.0 + t * 5.6) * 0.005;
  vec2 q = p * 6.0 + vec2(t * 0.6, -t * 0.45);
  g += (vec2(wn(q), wn(q + 17.0)) - 0.5) * 0.035 + (vec2(wn(q * 2.3 - t), wn(q * 2.3 + 9.0)) - 0.5) * 0.02;
  return g;
}
// 接触泡沫：R = 到干处距离（0..2 米）。贴边一圈连续白边 + 外侧向岸推进的小浪花纹 + 碎沫斑点
float seaContactFoam(vec2 p, float t, vec4 S){
  float d = S.r * 2.0; if (d > 1.6) return 0.0;
  float br = wn(p * 4.0 + vec2(t * 0.35, -t * 0.25)) * 0.6 + wn(p * 11.0 - t * 0.6) * 0.4;
  float edge = (1.0 - smoothstep(0.02, 0.14 + 0.1 * br, d)) * smoothstep(0.0, 0.015, d + 0.02);
  float wave = sin(d * 9.0 + t * 1.6 + br * 2.0); float lap = smoothstep(0.55, 0.95, wave) * (1.0 - smoothstep(0.15, 0.9, d)) * smoothstep(0.35, 0.7, br);
  float spk = smoothstep(0.62, 0.8, wn(p * 26.0 + t * 0.3) * 0.55 + br * 0.45) * (1.0 - smoothstep(0.1, 0.75, d));
  return clamp(edge * (0.55 + 0.45 * br) + lap * 0.45 + spk * 0.5, 0.0, 1.0);
}
// 开阔水面上零散小浪花碎沫（很稀，随时间明灭）
float seaWhitecaps(vec2 p, float t){
  vec2 c = floor(p * 1.3), f = fract(p * 1.3) - 0.5; float h = wh(c);
  float life = smoothstep(0.75, 1.0, sin(t * (0.6 + h) + h * 30.0));
  vec2 o = (vec2(wh(c + 3.1), wh(c + 7.7)) - 0.5) * 0.6;
  float blob = smoothstep(0.16, 0.02, length((f - o) * vec2(1.0, 2.2))) * smoothstep(0.55, 0.8, wn(p * 14.0 + t));
  return blob * life * step(0.7, h);
}`;

// ---------------------------------------------------------------- 夜空环境贴图（湿地 / 低档水面的假反射）：青黑天空 + 月亮 + 倒挂之城的冷光
let envTex: THREE.Texture | null = null;
export function seaEnv(): THREE.Texture {
  if (envTex) return envTex;
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#11302b'); gr.addColorStop(0.42, '#0c2420'); gr.addColorStop(0.5, '#13302a'); gr.addColorStop(0.55, '#050f0d'); gr.addColorStop(1, '#020706');   // 第三轮：墨绿、降饱和
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 只留大而淡的光斑：小光斑在 512×256 贴图里放大后是方块
  seed = 313; for (let i = 0; i < 18; i++) { const x = rnd() * W, y = 10 + rnd() * 90, r = 14 + rnd() * 22; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(140,215,185,0.14)'); rg.addColorStop(1, 'rgba(140,215,185,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const mx = W * 0.5, my = H * 0.2; const mg = g.createRadialGradient(mx, my, 0, mx, my, 40); mg.addColorStop(0, 'rgba(240,255,255,1)'); mg.addColorStop(0.15, 'rgba(210,250,255,0.9)'); mg.addColorStop(1, 'rgba(120,220,230,0)'); g.fillStyle = mg; g.fillRect(mx - 40, my - 40, 80, 80);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return (envTex = t);
}

// ---------------------------------------------------------------- 焦散（Dave Hoskins 式可平铺迭代焦散，4 次迭代）
const CAUSTIC_GLSL = `
float seaCaus(vec2 uv, float time){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0; vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) { float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 1.6);
}`;

/** 焦散（第三轮）：扭曲域 Voronoi 边缘距离 → 柔和亮线（宽度随噪声变化 + 指数辉光），两层不同尺度相减打断网格，更大更不规则 */
const VCAUS_GLSL = `
vec2 seaH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float seaVor(vec2 p, float t){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = seaH2(i + g); o = 0.5 + 0.45 * sin(t + 6.2831 * o);
    vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(d2) - sqrt(d1); }
float seaVn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = seaH2(i).x, b = seaH2(i + vec2(1, 0)).x, c = seaH2(i + vec2(0, 1)).x, d = seaH2(i + vec2(1, 1)).x; return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
// 柔和亮线：核心（宽度 w，fwidth 抗锯齿并夹住，免得换格处整块点亮）+ 宽辉光
float seaSoft(float e, float w){ float aa = min(fwidth(e), 0.06); float x = e / (w + aa); return exp(-x * x * 1.6) * 0.6 + exp(-x * 0.55) * 0.3; }   // 高斯核心 + 宽辉光（无硬边）
float seaCausV(vec2 p, float t){
  vec2 q = vec2(seaVn(p * 0.35 + t * 0.05), seaVn(p * 0.35 + vec2(5.2, 1.3) - t * 0.04));
  vec2 q2 = vec2(seaVn(p * 1.1 + 9.0 + t * 0.08), seaVn(p * 1.1 + vec2(2.7, 6.1) - t * 0.07));
  vec2 w = p + (q - 0.5) * 1.8 + (q2 - 0.5) * 0.75 + 0.18 * vec2(sin(p.y * 0.9 + t * 0.6), cos(p.x * 0.8 - t * 0.5));   // 两级扭曲域：把 Voronoi 直边掰弯
  float wv = 0.05 + 0.09 * seaVn(p * 0.6 + 3.0);                                                   // 线宽变化
  float l1 = seaSoft(seaVor(w, t), wv);
#ifdef SEA_CAUS2
  float l2 = seaSoft(seaVor(w * 1.85 + vec2(3.1, 7.7), t * 1.3 + 1.3), wv * 0.8);
  return clamp(l1 * 1.1 - l2 * 0.45 + l1 * l2 * 0.6, 0.0, 1.4);   // 两层相减：打断规则网格，交叠处略亮
#else
  return l1;
#endif
}`;

/** 地面 shader 补丁：plaza_dress floorMesh 的 onBeforeCompile 在自己的替换之后调用（需要 vPxz 局部坐标 varying 已声明） */
export function seabedFloorPatch(sh: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }, mat: THREE.MeshStandardMaterial) {
  const lvl = q(); if (lvl === 'low') return;
  const causK = lvl === 'medium' ? 0.6 : 1.0;
  Object.assign(sh.uniforms, { seaMask: { value: buildMask() }, seaTime: seaU.uTime, seaHalf: { value: HALF } });
  sh.fragmentShader = (lvl === 'medium' ? '' : '#define SEA_CAUS2\n') + (mat.userData.seaSlabBase ? '#define SEA_SLABBASE\n' : '') + sh.fragmentShader
    .replace('#include <common>', `#include <common>
uniform sampler2D seaMask; uniform float seaTime; uniform float seaHalf;
${VCAUS_GLSL}
float seaH(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float seaN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(seaH(i), seaH(i + vec2(1, 0)), f.x), mix(seaH(i + vec2(0, 1)), seaH(i + vec2(1, 1)), f.x), f.y); }
float seaWh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seaWn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(seaWh(i), seaWh(i + vec2(1, 0)), f.x), mix(seaWh(i + vec2(0, 1)), seaWh(i + vec2(1, 1)), f.x), f.y); }
vec4 seaM; float seaSand; float seaWet; float seaNear;`)
    // 沙地 + 积水压暗（在底色混合之后）
    .replace('diffuseColor *= sampledDiffuseColor;', `
  vec2 seaUv = vPxz / (seaHalf * 2.0) + 0.5; float seaO = 3.2 / (seaHalf * 2.0);
  seaM = texture2D(seaMask, seaUv);
  seaNear = max(seaM.r, (texture2D(seaMask, seaUv + vec2(seaO, 0.0)).r + texture2D(seaMask, seaUv - vec2(seaO, 0.0)).r + texture2D(seaMask, seaUv + vec2(0.0, seaO)).r + texture2D(seaMask, seaUv - vec2(0.0, seaO)).r) * 0.4);
  float seaJit = seaN(vPxz * 0.7) * 0.5 + seaN(vPxz * 2.1) * 0.5;
  float seaLum = dot(sampledDiffuseColor.rgb, vec3(0.333));
  float seaDrift = smoothstep(0.72, 0.84, seaN(vPxz * 0.09 + 11.0) * 0.65 + seaN(vPxz * 0.31) * 0.35) * 0.85;   // 全图零散沙斑
${DRIFT_COB ? '' : `  seaDrift *= 1.0 - pvC;   // 11-18 Rhett「镜渊城营地篝火旁那块条纹没用就删掉」：零散沙斑（带沙纹）不再落在鹅卵石区（营地 / 主路）；?off=cobsand 回旧
`}  float seaGroutSand = (0.04 - seaLum) * 2.0 * smoothstep(0.45, 0.7, seaN(vPxz * 0.35 + 2.0));   // 第四轮：砖缝填沙只在零散几段（之前整条缝都被浅色沙填满 = 一条条亮线）
  seaSand = smoothstep(0.35, 0.75, max(seaM.g, seaDrift) + (seaJit - 0.5) * 0.6 + seaGroutSand);    // 先填砖缝 / 低处，再盖砖面
  float seaInGrout = smoothstep(0.05, 0.02, seaLum) * (1.0 - smoothstep(0.3, 0.6, max(seaM.g, seaDrift)));
#ifdef SEA_SLABBASE
  seaSand = max(seaSand, 0.92 * (1.0 - pvC)); seaInGrout = max(seaInGrout, 0.62 * (1.0 - pvC));   // 第五轮：实体石板底下这层 = 缝里 / 缺失格的湿砂砾
#endif
  // 第四轮：沙纹两向叠加 + 低频噪声决定走向（每片沙走向不同），主纹 + 细纹 + 交叉纹
  float seaRa = (seaN(vPxz * 0.045 + 5.0) - 0.5) * 3.2 + (seaN(vPxz * 0.17) - 0.5) * 0.7;
  vec2 seaD1 = vec2(cos(seaRa), sin(seaRa)), seaD2 = vec2(cos(seaRa + 1.15), sin(seaRa + 1.15));
  float seaPh1 = dot(vPxz, seaD1) * 8.0 + seaN(vPxz * 0.6) * 6.0, seaPh2 = dot(vPxz, seaD2) * 15.0 + seaN(vPxz * 1.3 + 4.0) * 5.0;
  float seaRw2 = 0.35 + 0.4 * seaN(vPxz * 0.11 + 9.0);
  float seaRip = sin(seaPh1) * (1.0 - seaRw2 * 0.5) + sin(seaPh2) * seaRw2 * 0.6;
  vec3 sandC = vec3(0.36, 0.33, 0.27) * (0.8 + 0.17 * seaRip + 0.12 * seaN(vPxz * 9.0));
  sandC *= mix(1.0, 0.45, seaInGrout);   // 缝里的沙：湿、暗
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sandC, seaSand);
  seaWet = max(smoothstep(0.15, 0.55, seaM.r), smoothstep(0.2, 0.8, seaM.b) * 0.7);
  sampledDiffuseColor.rgb *= mix(2.2, 1.0, max(seaWet, seaSand));   // 第五轮：干砖再抬亮（第四轮仍偏暗）   // 第四轮：干砖面抬亮（线性 ×1.55 ≈ 屏幕亮度 +25%（湿处 / 水下不变，保留湿干对比）
#ifdef SEA_SLAB
  sampledDiffuseColor.rgb *= mix(2.6, 1.4, seaWet);   // 第五轮 r2：实体石板顶面（每块单独 UV，取到贴图暗格多）整体偏暗，再抬一档
#endif
  sampledDiffuseColor.rgb *= mix(1.0, 0.5, smoothstep(0.3, 0.75, seaM.r));
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.8, 0.95, 1.0), seaWet);
  diffuseColor *= sampledDiffuseColor;`)
    .replace('roughnessFactor = mix(roughnessFactor, 0.4, pvWet);', `roughnessFactor = mix(roughnessFactor, 0.4, pvWet);
  roughnessFactor = max(roughnessFactor, 0.5); roughnessFactor = mix(roughnessFactor, 0.9, seaSand); roughnessFactor = mix(roughnessFactor, 0.08, seaWet * (1.0 - seaSand));   // 干砖面别太镜面（掠射角会被方向光 / 环境刷白）`)
    // 沙地波纹法线（明显）
    .replace('normal = normalize(tbn * mapN);', `
  vec2 seaGr = seaD1 * cos(seaPh1) * (1.0 - seaRw2 * 0.5) * 0.85 + seaD2 * cos(seaPh2) * seaRw2 * 0.6;
  mapN.xy = mix(mapN.xy, vec2(seaGr.x, -seaGr.y), seaSand);
  mapN.xy *= 1.0 - 0.92 * smoothstep(0.08, 0.45, seaM.r) * (1.0 - seaSand);   // 水下 / 积水：法线压平（值噪声细节的方形小面会把环境月亮反成一颗颗方块亮点）
  normal = normalize(tbn * mapN);`)
    // 干砖面压掉方向光 / 环境高光（掠射角会把整片地刷成灰白），湿处保留
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  reflectedLight.directSpecular *= mix(0.2, 1.0, seaWet);
  reflectedLight.indirectSpecular *= mix(0.35, 1.0, seaWet);
  reflectedLight.directDiffuse *= mix(1.0, 0.8, seaWet);
  reflectedLight.indirectDiffuse *= mix(2.9, 1.0, max(seaWet, seaSand));   // 第四轮：干砖面环境光抬高（之前干砖面几乎全黑，看不清砖）`)
    // 焦散：只在水下 / 浅水覆盖的砖面（干砖面为 0），浅处最强、深处衰减；整体比第二轮暗约 40%
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float tt = seaTime * 0.5;
    float cs = seaCausV(vPxz * 0.82, tt);
    float wr = seaM.r + (seaWn(vPxz * 0.8) * 0.6 + seaWn(vPxz * 2.7) * 0.4 - 0.5) * 0.18;                                  // 与水面 shader 同一条水线
    float under = smoothstep(0.32, 0.46, wr);                                   // 干砖面 = 0
    float depthK = under * (1.0 - 0.7 * smoothstep(0.55, 0.95, wr));            // 浅处最强
    float patchy = 0.55 + 0.45 * smoothstep(0.3, 0.7, seaN(vPxz * 0.08 + tt * 0.03) * 0.7 + seaN(vPxz * 0.3) * 0.3);
    float k = depthK * patchy * (1.0 - seaSand * 0.5);
    float dist = length(vViewPosition);
    k *= 1.0 - 0.8 * smoothstep(16.0, 55.0, dist);
    totalEmissiveRadiance += vec3(0.32, 0.95, 0.72) * cs * k * ${(0.38 * causK).toFixed(3)};
    totalEmissiveRadiance += vec3(0.004, 0.022, 0.016) * under * ${causK.toFixed(2)};   // 水下微微透绿
  }`);
}

// ---------------------------------------------------------------- 1–3. 水面
const MAXD = 16;
const drops: { x: number; z: number; t: number; a: number }[] = [];
const dropU = Array.from({ length: MAXD }, () => new THREE.Vector4(0, 0, -99, 0));
const WATER_VS = `
uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUvR = textureMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
uniform sampler2D tDiffuse; uniform sampler2D envMap; uniform sampler2D uMask; uniform float uTime; uniform vec4 uDrops[${MAXD}];
uniform vec2 uOrigin; uniform float uHalf; uniform vec3 uMoonDir; uniform vec3 uTint; uniform vec2 uReflK; uniform sampler2D uShore;
varying vec4 vUvR; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
${LAKE_GLSL}
${FOAM_GLSL}
${WATER2.off ? '' : W2_GLSL}
void main(){
  vec2 p = vW.xz - uOrigin;
  vec4 M = texture2D(uMask, p / (uHalf * 2.0) + 0.5);
  vec4 SH = texture2D(uShore, p / (uHalf * 2.0) + 0.5);
  float jit = wn(p * 0.8) * 0.6 + wn(p * 2.7) * 0.4;
  float m = M.r + (jit - 0.5) * 0.18;
  float cover = smoothstep(0.3, 0.42, m) * (1.0 - smoothstep(-0.7, -1.9, seaLakeSd(p)));   // 第五轮：深水湖交给镜面深水
  if (cover < 0.004) discard;
  // 第五轮：细波纹（6 道方向正弦 + 两层细噪声，振幅压低、频率提高）
  float t = uTime;
  vec2 g = seaFineWaves(p, t);
  // 水滴涟漪：每滴两圈波包
  float ringGlow = 0.0;
  for (int i = 0; i < ${MAXD}; i++) {
    vec4 D = uDrops[i]; float age = t - D.z; if (age < 0.0 || age > 4.0) continue;
    vec2 dv = p - D.xy; float r = length(dv); if (r > 7.0) continue;
    vec2 dir = dv / max(r, 1e-3); float fall = exp(-age * 1.05) * D.w;
    for (int k = 0; k < 2; k++) {
      float front = age * (k == 0 ? 1.55 : 0.95); float x = r - front;
      float env = fall * exp(-x * x * 5.0) * smoothstep(0.0, 0.25, r) * (k == 0 ? 1.0 : 0.6);
      float s = cos(x * 11.0) * 11.0 * env;
      g += dir * s * 0.08; ringGlow += max(0.0, sin(x * 11.0)) * env;
    }
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 refl;
#ifdef USE_REFL
  vec2 uv = vUvR.xy / vUvR.w + n.xz * vec2(0.09, 0.09);
  refl = texture2D(tDiffuse, uv).rgb * 1.15;
  // 镜像外面（屏幕边）用环境补
  vec2 eq = vec2(atan(R.z, R.x) * 0.1591 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.3183 + 0.5);
  refl = max(refl, texture2D(envMap, vec2(eq.x, 1.0 - eq.y)).rgb * 0.16);
#else
  vec2 eq = vec2(atan(R.z, R.x) * 0.1591 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.3183 + 0.5);
  refl = texture2D(envMap, vec2(eq.x, 1.0 - eq.y)).rgb;
  refl = refl * refl * 1.4;
#endif
  { float rl = dot(refl, vec3(0.3, 0.5, 0.2)); refl = mix(vec3(rl), refl, 0.55) * vec3(0.7, 0.86, 0.76); }   // 墨绿深水：倒影降饱和、偏绿
  // 月光倒影：窄亮核 + 宽光晕 + 涟漪上碎闪（沿视线拉成一条光带）
  float md = max(dot(R, uMoonDir), 0.0);
  // 碎闪：每格一个随机位置的圆点，随时间明灭（之前用值噪声阈值，格子形状会出方块）
  vec2 gq = p * 9.0 + n.xz * 6.0; vec2 gc = floor(gq), gf = fract(gq) - 0.5;
  float gh = wh(gc), gon = smoothstep(0.6, 1.0, sin(t * (1.5 + gh * 3.0) + gh * 40.0));
  float glint = gon * step(0.55, wh(gc + 7.3)) * smoothstep(0.32, 0.0, length(gf - (vec2(wh(gc + 1.7), wh(gc + 3.1)) - 0.5) * 0.5));
  float spec = pow(md, 40000.0) * 0.4 + pow(md, 9000.0) * 0.035 + pow(md, 2500.0) * glint * 0.1;   // 第五轮：月光倒影再收窄（第四轮偏大）
  // 岸边浪沫：贴水边一条连续白线 + 外侧翻动的碎沫
  float fn = wn(p * 3.5 + vec2(t * 0.4, -t * 0.3)) * 0.6 + wn(p * 9.0 - t * 0.7) * 0.4;
  float line = smoothstep(0.31, 0.345, m) * (1.0 - smoothstep(0.355, 0.40, m + sin(t * 0.8 + dot(p, vec2(0.7, 0.4)) * 1.7) * 0.012));
  float band = smoothstep(0.36, 0.40, m) * (1.0 - smoothstep(0.42, 0.55, m));
  float foam = clamp(line * (0.25 + 0.2 * fn) + band * smoothstep(0.6, 0.85, fn) * 0.25, 0.0, 1.0) * 0.6;
  foam = max(foam, seaContactFoam(p, t, SH));                                  // 第五轮：砖 / 石 / 钟 / 桥墩接触边缘（岸线距离场）
  foam = max(foam, seaWhitecaps(p, t) * 0.5 * smoothstep(0.1, 0.5, SH.r));
  float rk = mix(uReflK.x, uReflK.y, fres);
  // fix1107 水体：Beer-Lambert 吸收（水深用积水遮罩 m 估算：水边浅、中间深）→ 深处透射偏墨绿、更不透明
  float wDep = smoothstep(0.34, 0.9, m) * 1.4; vec3 trans = exp(-vec3(0.9, 0.22, 0.32) * wDep);
  vec3 col = refl * rk + mix(uTint * 1.8, uTint, trans.g) * (1.0 - rk) * 0.25 + vec3(0.82, 0.96, 1.0) * spec + vec3(0.4, 0.9, 0.72) * ringGlow * 0.12;
  ${WATER2.off ? `col = mix(col, vec3(0.5, 0.6, 0.58), foam * 0.85);` : `foam *= 0.35 + 0.65 * w2FoamOp(foam * 1.4, fn);   // 11-17 v2：泡沫透明度按光学厚度（老沫透出水与倒影）
  col = mix(col, w2FoamLit(vec3(0.62, 0.7, 0.68), vec3(0.34, 0.4, 0.42) * max(dot(n, uMoonDir), 0.0), vec3(0.3, 0.35, 0.34), refl, fres), foam * 0.85);   // 泡沫受光：月光 Lambert + 穹顶半球 + 周围倒影 + 湿面菲涅耳`}   // 第五轮：泡沫压暗（水面偏乳白）
  col = min(col, vec3(0.56, 0.64, 0.62));
  float a = cover * clamp(0.14 + (1.0 - trans.g) * 0.22 + 0.78 * fres + rk * 0.18 + smoothstep(0.5, 0.85, m) * 0.3 + SH.g * 0.25 + spec * 0.5 + foam * 0.9 + ringGlow * 0.15, 0.0, 1.0);   // 第五轮：正视更透（偏乳白 → 透出焦散砖面）   // 正上方看更透（砖面 + 焦散透出来），掠射角是镜面
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let water: THREE.Mesh | null = null;
const lookAt = new THREE.Vector3(0, 0, 0);   // 镜头视线落地点（世界坐标；水滴围着它下）
const camPos = new THREE.Vector3();
let origin = { x: 0, z: 0 };
const ptsHide: THREE.Object3D[] = []; let ptsT = 0; const clr0 = new THREE.Color();
function waterMesh(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const useRefl = hi();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, color: { value: new THREE.Color() },
    envMap: { value: null }, uMask: { value: null }, uTime: { value: 0 }, uDrops: { value: [] }, uOrigin: { value: new THREE.Vector2() }, uHalf: { value: HALF },
    uMoonDir: { value: MOON_DIR.clone() }, uShore: { value: null }, uTint: { value: new THREE.Color(0x071512) }, uReflK: { value: new THREE.Vector2(useRefl ? 0.55 : 0.4, 1.0) },
  }]);
  let mesh: THREE.Mesh;
  if (useRefl) {
    const r = q() === 'ultra' ? 0.6 : 0.45;
    const rf = new Reflector(geo, { textureWidth: Math.round(innerWidth * r), textureHeight: Math.round(innerHeight * r), clipBias: 0.003, multisample: 0,
      shader: { name: 'SeaWater', uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS } });
    const mat = rf.material as THREE.ShaderMaterial; mat.defines = { USE_REFL: '' };
    mesh = rf;
  } else {
    mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS }));
  }
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.uniforms.envMap.value = seaEnv(); mat.uniforms.uMask.value = buildMask(); mat.uniforms.uTime = seaU.uTime; mat.uniforms.uDrops.value = dropU;
  mat.uniforms.uOrigin.value.set(origin.x, origin.z);
  mat.transparent = true; mat.depthWrite = false; mat.fog = true; (mat as THREE.ShaderMaterial & { toneMapped: boolean }).toneMapped = true;
  mat.userData.outlineParameters = { visible: false };
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = WATER_Y; mesh.renderOrder = 2; mesh.name = 'sea_water'; mesh.frustumCulled = false;
  // 记住镜头：水滴围着视线落地点下
  const prev = mesh.onBeforeRender.bind(mesh);
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    if (camera.userData?.seaVirtual !== true && !(camera as THREE.Camera & { isReflectorCamera?: boolean }).isReflectorCamera) {
      camPos.setFromMatrixPosition(camera.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
      if (dir.y < -0.05) { const t = (WATER_Y - camPos.y) / dir.y; lookAt.copy(camPos).addScaledVector(dir, Math.min(t, 60)); }
    }
    // 倒影里不画屏幕空间大小固定的点（天空星点在镜像分辨率下会变成方块）和天空球
    const now = performance.now();
    if (now - ptsT > 2000) { ptsT = now; ptsHide.length = 0; roundPoints(scene); scene.traverse(o => { if (o.name === 'sea_city') { ptsHide.push(o); return; } const mm = (o as THREE.Mesh).material as (THREE.Material & { isPointsMaterial?: boolean; uniforms?: Record<string, unknown> }) | undefined; if (!mm || Array.isArray(mm)) return;
      if ((o as THREE.Points).isPoints || o.name === 'sea_motes' || o.name === 'sea_city') ptsHide.push(o);   // 第五轮：倒悬城的倒影只出现在深水镜面   // 光点在低分辨率倒影里会糊成方块   // 所有点精灵（环境尘粒是方块点，倒影里成倍出现）
      else if (mm.uniforms && 'top' in mm.uniforms && 'mid' in mm.uniforms && 'bottom' in mm.uniforms && mm.side === THREE.BackSide) ptsHide.push(o);   // 天空球：天顶是亮蓝，倒影里换成深色夜空清屏
    }); }
    const hideL = ptsHide.slice(), vis = hideL.map(o => o.visible); hideL.forEach(o => { o.visible = false; });   // r4：用本地副本（嵌套反射里 2 秒一次重建 ptsHide 会让下标错位 → 倒悬城被永久隐藏）
    // 镜像相机看不到跟着主镜头走的天空球时露出清屏色（白）→ 换成夜空色
    renderer.getClearColor(clr0); const a0 = renderer.getClearAlpha(); renderer.setClearColor(0x0b1e26, 1);
    prev(renderer, scene, camera, geometry, material, group);
    renderer.setClearColor(clr0, a0);
    hideL.forEach((o, i) => { o.visible = vis[i]; });
  };
  return mesh;
}

// ---------------------------------------------------------------- 第五轮：深水湖镜面（B3：倒悬城倒影只出现在这里）
const DEEP_FS = `
uniform sampler2D tDiffuse; uniform sampler2D envMap; uniform sampler2D uShore; uniform float uTime;
uniform vec2 uOrigin; uniform float uHalf; uniform vec3 uMoonDir;
varying vec4 vUvR; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
${LAKE_GLSL}
${FOAM_GLSL}
${WATER2.off ? '' : W2_GLSL}
void main(){
  vec2 p = vW.xz - uOrigin; float sd = seaLakeSd(p);
  float cover = smoothstep(-0.6, -1.8, sd); if (cover < 0.004) discard;
  vec4 SH = texture2D(uShore, p / (uHalf * 2.0) + 0.5);
  float t = uTime;
  vec2 g = seaFineWaves(p, t) * 0.7;                       // 深水更静：镜面倒影清楚
  g += (vec2(wn(p * 0.35 + t * 0.05), wn(p * 0.35 - t * 0.04 + 5.0)) - 0.5) * 0.02;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 R = reflect(-V, n);
  vec3 refl;
#ifdef USE_REFL
  vec2 uv = vUvR.xy / vUvR.w + n.xz * 0.035;
  refl = texture2D(tDiffuse, uv).rgb;
  vec2 eq = vec2(atan(R.z, R.x) * 0.1591 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.3183 + 0.5);
  refl = max(refl, texture2D(envMap, vec2(eq.x, 1.0 - eq.y)).rgb * 0.1);
#else
  vec2 eq = vec2(atan(R.z, R.x) * 0.1591 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.3183 + 0.5);
  refl = texture2D(envMap, vec2(eq.x, 1.0 - eq.y)).rgb; refl = refl * refl * 1.2;
#endif
  { float rl = dot(refl, vec3(0.3, 0.5, 0.2)); refl = mix(vec3(rl), refl, 0.7) * vec3(0.8, 0.95, 0.9); refl = refl * (0.35 + 1.6 * refl);   // r2：压暗穹顶 / 雾的灰倒影，灯光 / 窗光等亮处保留 → 墨黑镜面
  }
  float md = max(dot(R, uMoonDir), 0.0);
  vec2 gq = p * 7.0 + n.xz * 5.0; vec2 gc = floor(gq), gf = fract(gq) - 0.5;
  float gh = wh(gc), gon = smoothstep(0.6, 1.0, sin(t * (1.2 + gh * 2.5) + gh * 40.0));
  float glint = gon * step(0.6, wh(gc + 7.3)) * smoothstep(0.3, 0.0, length(gf - (vec2(wh(gc + 1.7), wh(gc + 3.1)) - 0.5) * 0.5));
  float spec = pow(md, 40000.0) * 0.45 + pow(md, 9000.0) * 0.04 + pow(md, 2000.0) * glint * 0.12;
  float foam = seaContactFoam(p, t, SH) * 0.9 + seaWhitecaps(p * 0.8, t) * 0.25 * smoothstep(0.3, 0.8, SH.r);
  vec3 base = vec3(0.004, 0.014, 0.013);
  vec3 col = base + refl * (0.5 + 0.5 * fres) + vec3(0.82, 0.96, 1.0) * spec;
  ${WATER2.off ? '' : `foam = clamp(foam, 0.0, 1.0); foam *= 0.35 + 0.65 * w2FoamOp(foam * 1.4, wn(p * 3.5 + t * 0.3));   // 11-17 v2：泡沫 Beer-Lambert 透明度`}
  col = mix(col, ${WATER2.off ? 'vec3(0.46, 0.56, 0.55)' : 'w2FoamLit(vec3(0.58, 0.66, 0.65), vec3(0.34, 0.4, 0.42) * max(dot(n, uMoonDir), 0.0), vec3(0.3, 0.35, 0.34), refl, fres)'}, clamp(foam, 0.0, 1.0) * 0.85);
  col = min(col, vec3(0.62, 0.72, 0.7));
  gl_FragColor = vec4(col, cover * clamp(0.9 + 0.1 * fres + foam, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
let deep: THREE.Mesh | null = null;
function deepWaterMesh(): THREE.Mesh {
  const S = Math.max(LAKE.rx, LAKE.rz) * 2.5, geo = new THREE.PlaneGeometry(S, S);
  const useRefl = hi();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, color: { value: new THREE.Color() },
    envMap: { value: null }, uShore: { value: null }, uTime: { value: 0 }, uOrigin: { value: new THREE.Vector2() }, uHalf: { value: HALF }, uMoonDir: { value: MOON_DIR.clone() },
  }]);
  let mesh: THREE.Mesh;
  if (useRefl) {
    const r = q() === 'ultra' ? 0.7 : 0.5;
    const rf = new Reflector(geo, { textureWidth: Math.round(innerWidth * r), textureHeight: Math.round(innerHeight * r), clipBias: 0.002, multisample: 0,
      shader: { name: 'SeaDeep', uniforms, vertexShader: WATER_VS, fragmentShader: DEEP_FS } });
    (rf.material as THREE.ShaderMaterial).defines = { USE_REFL: '' }; mesh = rf;
  } else mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VS, fragmentShader: DEEP_FS }));
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.uniforms.envMap.value = seaEnv(); mat.uniforms.uTime = seaU.uTime; mat.uniforms.uOrigin.value.set(origin.x, origin.z);
  mat.transparent = true; mat.depthWrite = false; mat.fog = true; mat.userData.outlineParameters = { visible: false };
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 3; mesh.name = 'sea_deep'; mesh.frustumCulled = false;
  if (useRefl) {   // 镜像里不画点精灵 / 光点（低分辨率会糊成方块）
    const prev = mesh.onBeforeRender.bind(mesh);
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      const hid: THREE.Object3D[] = []; scene.traverse(o => { if (o.visible && ((o as THREE.Points).isPoints || o.name === 'sea_motes' || o.name === 'sea_mist')) { hid.push(o); o.visible = false; } });
      const c0 = new THREE.Color(); renderer.getClearColor(c0); const a0 = renderer.getClearAlpha(); renderer.setClearColor(0x050d0c, 1);
      prev(renderer, scene, camera, geometry, material, group);
      renderer.setClearColor(c0, a0); hid.forEach(o => { o.visible = true; });
    };
  }
  return mesh;
}

// 落下的水线 + 溅起的水花（CPU 更新 ~130 个点）
const NSPRAY = 7;
let dropPts: THREE.Points | null = null;
const spray: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
const PT_VS = `attribute float aA; attribute float aS; varying float vA; varying float vS;
#include <common>
#include <fog_pars_vertex>
void main(){ vA = aA; vS = aS; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = (aS > 0.5 ? 420.0 : 45.0) / -mvPosition.z * (aA > 0.0 ? 1.0 : 0.0);
  #include <fog_vertex>
}`;
const PT_FS = `varying float vA; varying float vS;
#include <common>
#include <fog_pars_fragment>
void main(){ vec2 q = gl_PointCoord - 0.5; float a;
  if (vS > 0.5) { a = smoothstep(0.035, 0.0, abs(q.x)) * smoothstep(0.5, 0.15, abs(q.y)); }   // 水线：竖着的细长条
  else { float d = length(q); if (d > 0.5) discard; a = smoothstep(0.5, 0.1, d); }
  gl_FragColor = vec4(vec3(0.75, 0.97, 1.0) * 0.9, a * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function dropPoints(): THREE.Points {
  const n = MAXD * (1 + NSPRAY), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
  const s = new Float32Array(n); for (let i = 0; i < MAXD; i++) s[i] = 1; g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  m.userData.outlineParameters = { visible: false };
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 8; p.name = 'sea_drops';
  for (let i = 0; i < MAXD * NSPRAY; i++) spray.push({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  return p;
}
let dropAcc = 0, dropIdx = 0, playerAcc = 0;
const lastP = { x: 0, z: 0 };
function addDrop(lx: number, lz: number, tHit: number, a: number) {
  const i = dropIdx++ % MAXD; drops[i] = { x: lx, z: lz, t: tHit, a }; dropU[i].set(lx, lz, tHit, a);
}
function updateDrops(dt: number, player?: { x: number; z: number }) {
  const t = seaU.uTime.value, lvl = q(); if (lvl === 'low') return;
  // 新水滴：视线落地点周围 22 米内的水面（找 8 次，找不到就落在湿地上，只溅水花）
  dropAcc += dt * (lvl === 'medium' ? 1.6 : 2.6);
  while (dropAcc > 1) {
    dropAcc -= 0.6 + rnd() * 0.8;
    const cx = lookAt.x - origin.x, cz = lookAt.z - origin.z;
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 8 && !ok; k++) { x = cx + (rnd() - 0.5) * 30; z = cz + (rnd() - 0.5) * 24; ok = waterAt(x, z) > 0.55; }
    if (ok) addDrop(x, z, t + 0.75, 0.75 + rnd() * 0.5);
  }
  // 玩家蹚水
  if (player) {
    const lx = player.x - origin.x, lz = player.z - origin.z, mv = Math.hypot(lx - lastP.x, lz - lastP.z); lastP.x = lx; lastP.z = lz;
    playerAcc += dt; if (mv > 0.02 && playerAcc > 0.28 && waterAt(lx, lz) > 0.45) { playerAcc = 0; addDrop(lx, lz, t, 0.55); }
  }
  if (!dropPts) return;
  const pos = dropPts.geometry.attributes.position as THREE.BufferAttribute, al = dropPts.geometry.attributes.aA as THREE.BufferAttribute;
  for (let i = 0; i < MAXD; i++) {
    const d = drops[i]; if (!d) { al.setX(i, 0); continue; }
    const left = d.t - t;
    if (left > 0 && left < 0.75) { pos.setXYZ(i, origin.x + d.x, WATER_Y + left * 9 + 0.3, origin.z + d.z); al.setX(i, 0.9); }
    else al.setX(i, 0);
    if (left <= 0 && left > -dt * 1.5 && d.a > 0.7) for (let k = 0; k < NSPRAY; k++) {   // 刚落水：溅起水花
      const s = spray[i * NSPRAY + k], a = rnd() * 6.283, v = 0.6 + rnd() * 1.1;
      Object.assign(s, { x: origin.x + d.x, y: WATER_Y + 0.02, z: origin.z + d.z, vx: Math.cos(a) * v * 0.5, vy: 1.6 + rnd() * 1.4, vz: Math.sin(a) * v * 0.5, life: 1 });
    }
  }
  for (let j = 0; j < spray.length; j++) {
    const s = spray[j], idx = MAXD + j;
    if (s.life > 0) { s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < WATER_Y) s.life = 0; else s.life -= dt * 1.4; }
    pos.setXYZ(idx, s.x, s.y, s.z); al.setX(idx, Math.max(0, s.life) * 0.8);
  }
  pos.needsUpdate = true; al.needsUpdate = true;
}

// ---------------------------------------------------------------- 5. 发光水潭 / 符文坑、漂浮光点、薄雾
const POOL_FS = `uniform float uTime; uniform float uSeed; uniform float uRune; uniform vec3 uMoon; varying vec2 vUv; varying vec3 vW;
${CAUSTIC_GLSL}
void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard;
  float a = atan(q.y, q.x);
  vec3 c;
  if (uRune > 0.5) {   // 符文坑：暗底 + 两圈符文环 + 中心光
    float ring = smoothstep(0.05, 0.0, abs(r - 0.78)) + smoothstep(0.035, 0.0, abs(r - 0.56));
    float glyph = step(0.5, fract(a * 3.8197 + uSeed)) * smoothstep(0.1, 0.0, abs(r - 0.67)) * step(0.3, fract(a * 11.0 + uSeed * 3.0));
    float pulse = 0.75 + 0.25 * sin(uTime * 1.7 + uSeed * 9.0);
    c = vec3(0.25, 1.0, 0.92) * (ring * 1.4 + glyph * 1.2 + smoothstep(0.35, 0.0, r) * 0.9) * pulse + vec3(0.01, 0.04, 0.05);
  } else {             // 发光水潭：中心亮、边缘暗，水面焦散 + 一圈圈涟漪
    float cs = seaCaus(q * 1.6 + uSeed, uTime * 0.7);
    float rip = 0.5 + 0.5 * sin(r * 22.0 - uTime * 3.0);
    float core = smoothstep(1.0, 0.0, r);
    c = vec3(0.12, 0.85, 0.8) * (core * core * 1.6 + cs * 0.8 * core + rip * 0.25 * core) * (0.85 + 0.15 * sin(uTime * 1.3 + uSeed * 5.0));
  }
  float edge = smoothstep(1.0, 0.86, r);
  if (uRune < 0.5) {   // 第五轮：保留月光倒影（池面细波纹上的冷月亮斑）
    vec2 rp = q * 9.0; vec3 nn = normalize(vec3(sin(rp.x * 3.1 + uTime * 2.0) * 0.05 + sin(r * 22.0 - uTime * 3.0) * 0.04 * q.x / max(r, 0.05), 1.0, cos(rp.y * 2.7 - uTime * 1.7) * 0.05 + sin(r * 22.0 - uTime * 3.0) * 0.04 * q.y / max(r, 0.05)));
    vec3 V = normalize(cameraPosition - vW), R = reflect(-V, nn); float md = max(dot(R, uMoon), 0.0);
    c += vec3(0.75, 0.92, 0.95) * (pow(md, 3000.0) * 0.9 + pow(md, 300.0) * 0.12) * edge;
  }
  gl_FragColor = vec4(c * edge, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const POOL_VS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const rimGeo = new THREE.DodecahedronGeometry(1, 0);
function glowPool(r: number, rune: boolean, s: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: seaU.uTime, uSeed: { value: s }, uRune: { value: rune ? 1 : 0 }, uMoon: { value: MOON_DIR.clone() } }, vertexShader: POOL_VS, fragmentShader: POOL_FS, toneMapped: true });
  m.userData.outlineParameters = { visible: false };
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), m); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
  // 第五轮：坑沿碎石改到 poolRings（大小不一的不规则石块，统一实例化）
  return g;
}
/** 第五轮：能量池一圈不规则小石头（大小不一、半埋、偶尔叠两层）—— 返回石块表（局部坐标） */
function poolRings(): ReturnType<typeof stoneRnd>[] {
  const L: ReturnType<typeof stoneRnd>[] = [];
  GLOW.forEach(([x, z, r], gi) => {
    const n = 18 + Math.floor(r * 8);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + (rnd() - 0.5) * 0.35, big = rnd() < 0.22 ? 1.6 + rnd() * 0.8 : 0.45 + rnd() * 0.7, rr = r * (1.04 + rnd() * 0.22) + big * 0.12;
      const st = stoneRnd(x + Math.cos(a) * rr, z + Math.sin(a) * rr, big * 0.42); st.sink = 0.15 + rnd() * 0.45; st.tilt = (rnd() - 0.5) * 0.5; st.v *= 0.85; L.push(st);
      if (big > 1.5 && rnd() < 0.5) { const s2 = stoneRnd(x + Math.cos(a) * rr * 1.02, z + Math.sin(a) * rr * 1.02, 0.25); s2.sink = -1.2; L.push(s2); }   // 叠在大石上的小石
    }
    void gi;
  });
  return L;
}
/** 第五轮：能量池上方缓慢旋转上升的光粒（低密度、圆形柔光、实例化正对镜头圆片） */
function poolRise(per: number): THREE.Mesh {
  const n = GLOW.length * per, base = new THREE.CircleGeometry(0.5, 14), g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv); g.instanceCount = n;
  const c = new Float32Array(n * 4), sd = new Float32Array(n * 4);
  GLOW.forEach(([x, z, r], gi) => { for (let k = 0; k < per; k++) { const i = gi * per + k; c.set([origin.x + x, gY(x, z) + 0.06, origin.z + z, r], i * 4); sd.set([rnd(), rnd(), rnd(), rnd()], i * 4); } });
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(c, 4)); g.setAttribute('aS', new THREE.InstancedBufferAttribute(sd, 4));
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    vertexShader: `attribute vec4 aC; attribute vec4 aS; uniform float uTime; varying float vA; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main(){ float life = fract(uTime * (0.05 + aS.w * 0.04) + aS.x); float h = life * (2.4 + aS.y * 1.4);
  float ang = aS.z * 6.283 + uTime * (0.25 + aS.y * 0.2) * (aS.w > 0.5 ? 1.0 : -1.0); float rad = aC.w * (0.25 + 0.6 * aS.x) * (1.0 - life * 0.35);
  vec3 p = aC.xyz + vec3(cos(ang) * rad, h, sin(ang) * rad);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); mvPosition.xy += position.xy * (0.05 + aS.y * 0.07); gl_Position = projectionMatrix * mvPosition; vUv = uv;
  vA = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.6, 1.0, life));
  #include <fog_vertex>
}`,
    fragmentShader: `varying float vA; varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float a = (exp(-d * d * 10.0) * 0.6 + pow(1.0 - d, 2.0) * 0.3) * vA * 0.8;
  gl_FragColor = vec4(vec3(0.35, 1.0, 0.9) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  m.uniforms.uTime = seaU.uTime; m.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.name = 'sea_motes'; return mesh;
}
/** 漂浮光点：实例化的朝镜头四边形（不用 gl_PointSize 点精灵 —— 软件 GL / 倒影分辨率下点精灵会变方块），圆形柔光 = 亮核 + 宽光晕 */
function motes(n: number): THREE.Mesh {
  const base = new THREE.CircleGeometry(0.5, 16), g = new THREE.InstancedBufferGeometry();   // 第四轮：圆片几何（被后期 / 替换材质整片画出时也不是方块）
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv); g.instanceCount = n;
  const p = new Float32Array(n * 3), s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let x: number, z: number;
    if (i < n * 0.5) { const G = i % 3 === 0 ? [...HERO_BELLS[i % HERO_BELLS.length]] : GLOW[i % GLOW.length], a = rnd() * 6.283, r = rnd() * 4.5; x = G[0] + Math.cos(a) * r; z = G[1] + Math.sin(a) * r; }   // 发光坑 / 钟口上方聚得多
    else { x = (rnd() - 0.5) * 160; z = (rnd() - 0.5) * 160; }
    p.set([origin.x + x, 0.5 + rnd() * rnd() * 4.0, origin.z + z], i * 3); s.set([rnd(), rnd(), rnd(), 0.5 + rnd()], i * 4);
  }
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(p, 3)); g.setAttribute('seed', new THREE.InstancedBufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    vertexShader: `attribute vec3 aPos; attribute vec4 seed; uniform float uTime; varying float vA; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main(){ vec3 p = aPos; float t = uTime * 0.25 * seed.w + seed.x * 6.283;
  p += vec3(sin(t) * 0.6, sin(t * 1.7 + seed.y * 6.0) * 0.35 + mod(uTime * 0.08 * seed.w + seed.z * 3.0, 3.0) - 1.5, cos(t * 0.8) * 0.6);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float sz = 0.16 + seed.z * 0.2; mvPosition.xy += position.xy * sz;   // 视空间展开 = 永远正对镜头
  gl_Position = projectionMatrix * mvPosition; vUv = uv;
  vA = (0.55 + 0.45 * sin(uTime * (1.0 + seed.y * 2.0) + seed.z * 20.0)) * smoothstep(2.5, 7.0, -mvPosition.z) * 0.8;   // r2：镜头近处淡掉（近处光点成大白团）
  #include <fog_vertex>
}`,
    fragmentShader: `varying float vA; varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard;
  float core = exp(-d * d * 14.0), halo = pow(1.0 - d, 2.0) * 0.4; float a = (core * 0.55 + halo) * vA * 0.8;   // 第四轮：亮核压到泛光阈值以下（泛光在软件 GL 下是方形光晕）
  gl_FragColor = vec4(mix(vec3(0.3, 1.0, 0.9), vec3(0.85, 1.0, 1.0), core) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  m.uniforms.uTime = seaU.uTime; m.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.name = 'sea_motes'; return mesh;
}
/** 本体环境尘粒（无贴图 PointsMaterial = 方块点）：在这张图里换成圆形柔光贴图（克隆材质，不碰共享材质） */
let softDotTex: THREE.Texture | null = null;
/** 第四轮：镜渊城内把所有方块点精灵（本体环境尘粒 / 星点 / 漂浮光尘，贴图没就绪时是整块方形）换成圆形柔光；离开镜渊城（seabedLeave）换回原材质 */
const swappedPts = new Map<THREE.Object3D, THREE.Material>();
function roundPoints(scene: THREE.Object3D) {
  softDotTex ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  scene.traverse(o => { const P = o as THREE.Points; if (!P.isPoints || swappedPts.has(o) || P.name.indexOf('sea_') === 0) return;
    const sm = P.material as THREE.ShaderMaterial; if (Array.isArray(sm)) return;
    if (sm.isShaderMaterial) {
      if (/length\s*\(\s*(q|gl_PointCoord)/.test(sm.fragmentShader) || !/void\s+main\s*\(\s*\)/.test(sm.fragmentShader)) return;   // 已经是圆点（火星 / 烟）
      const c = sm.clone(); c.fragmentShader = sm.fragmentShader.replace(/void\s+main\s*\(\s*\)/, 'void seaOrigMain()') + `
void main(){ float seaPd = length(gl_PointCoord - 0.5) * 2.0; if (seaPd > 1.0) discard; seaOrigMain(); float seaK = exp(-seaPd * seaPd * 4.0) * 0.85; gl_FragColor.rgb *= seaK; gl_FragColor.a *= seaK; }`;
      c.transparent = true; c.needsUpdate = true; swappedPts.set(o, sm); P.material = c; return;
    }
    const mm = P.material as THREE.PointsMaterial; if (!mm.isPointsMaterial || mm.map) return;
    const c = mm.clone(); c.map = softDotTex; c.transparent = true; c.alphaTest = 0.01; c.size = mm.size * 1.8; c.needsUpdate = true; swappedPts.set(o, mm); P.material = c; });
}
/** 离开镜渊城：点精灵换回原材质（本体其他地图不受影响） */
export function seabedLeave() {
  if (!swappedPts.size) return;
  for (const [o, m] of swappedPts) { const P = o as THREE.Points; const cur = P.material as THREE.Material; if (cur !== m) { cur.dispose(); P.material = m; } }
  swappedPts.clear();
}
function mist(y: number, k: number, sp: number, waterK = 1.2): THREE.Mesh {
  const m = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uK: { value: k }, uSp: { value: sp }, uWK: { value: waterK }, uMask: { value: null }, uOrigin: { value: new THREE.Vector2(origin.x, origin.z) }, uHalf: { value: HALF } }]), transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vW;
#include <common>
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; uniform float uK; uniform float uSp; uniform float uWK; uniform sampler2D uMask; uniform vec2 uOrigin; uniform float uHalf; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
${LAKE_GLSL}
void main(){ vec2 p = vW.xz * 0.06; float t = uTime * uSp;
  float f = n(p + vec2(t, t * 0.4)) * 0.5 + n(p * 2.3 - vec2(t * 0.7, 0.0)) * 0.3 + n(p * 5.1 + t) * 0.2;
  vec2 mu = (vW.xz - uOrigin) / (uHalf * 2.0) + 0.5; float o = 4.0 / (uHalf * 2.0);
  float wn = (texture2D(uMask, mu).r * 2.0 + texture2D(uMask, mu + vec2(o, 0.0)).r + texture2D(uMask, mu - vec2(o, 0.0)).r + texture2D(uMask, mu + vec2(0.0, o)).r + texture2D(uMask, mu - vec2(0.0, o)).r) / 6.0;
  float a = smoothstep(0.45 - wn * 0.12, 0.88, f) * uK * (0.5 + uWK * smoothstep(0.05, 0.6, wn));   // 水边贴地更浓
  float cd = length(cameraPosition - vW); a *= smoothstep(2.0, 9.0, cd);   // 镜头近处淡掉，免得糊脸
  a *= mix(0.06, 1.0, smoothstep(-3.0, 0.5, seaLakeSd(vW.xz - uOrigin)));   // 第五轮：深水湖上只留薄雾（否则整片镜面被雾刷成乳白）
  gl_FragColor = vec4(vec3(0.25, 0.34, 0.31), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}` });
  m.uniforms.uTime = seaU.uTime; m.uniforms.uMask.value = buildMask(); m.userData.outlineParameters = { visible: false };
  const o = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.2, HALF * 2.2), m); o.rotation.x = -Math.PI / 2; o.position.y = y; o.renderOrder = 10; o.name = 'sea_mist'; o.frustumCulled = false; return o;
}

// ---------------------------------------------------------------- 6. 海草（丝带叶片：褶皱边、扭转、上细下宽；顶点 shader 摇摆）
function bladeGeo(): THREE.BufferGeometry {
  const SEG = 12, pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, w = 0.075 * Math.sin(Math.min(1, t * 1.15 + 0.08) * Math.PI) * (1 - t * 0.35) + 0.008, tw = t * 1.6, bend = t * t * 0.35;
    for (const s of [-1, 1]) {
      const ruffle = Math.sin(t * 38 + s * 1.3) * 0.035 * t;   // 褶皱边
      const x = Math.cos(tw) * w * s, z = Math.sin(tw) * w * s + bend + ruffle;
      pos.push(x, t, z);
      const k = 0.35 + t * 0.65; col.push(0.16 * k + 0.05, 0.24 * k + 0.05, 0.08 * k + 0.03);
    }
    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** 摇摆补丁：世界坐标高度越高摆得越大（instanced 与普通网格都可用） */
export function swayPatch(mat: THREE.Material, amp = 0.22, key = 'seaSway') {
  mat.onBeforeCompile = sh => {
    sh.uniforms.seaTime = seaU.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float seaTime;')
      .replace('#include <project_vertex>', `
  vec4 swW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  swW = instanceMatrix * swW;
  #endif
  swW = modelMatrix * swW;
  float swH = clamp(swW.y / 1.8, 0.0, 1.4); swH *= swH;
  float swPh = dot(swW.xz, vec2(0.37, 0.21));
  swW.x += (sin(seaTime * 1.1 + swPh) * 0.7 + sin(seaTime * 2.3 + swPh * 2.7) * 0.3) * ${amp.toFixed(3)} * swH;
  swW.z += (cos(seaTime * 0.9 + swPh * 1.3) * 0.6 + sin(seaTime * 1.9 + swPh) * 0.3) * ${(amp * 0.7).toFixed(3)} * swH;
  vec4 mvPosition = viewMatrix * swW;
  gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => key + amp;
}
const KELP_COL = [[0.4, 0.7, 0.45], [0.65, 0.85, 0.4], [1.15, 1.0, 0.32], [1.4, 1.15, 0.35], [0.35, 0.55, 0.4], [0.85, 0.9, 0.38]];   // 深绿 / 橄榄 / 黄橄榄
function kelpField(spots: [number, number, number][], per = 11): THREE.InstancedMesh {
  const n = spots.length * per;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, envMap: seaEnv(), envMapIntensity: 1.1, emissive: 0x040c06, emissiveIntensity: 1 });
  swayPatch(mat, 0.22); mat.userData.outlineParameters = { visible: false };
  const im = new THREE.InstancedMesh(bladeGeo(), mat, n), o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0;
  for (const [x, z, s] of spots) for (let k = 0; k < per; k++) {
    const a = rnd() * 6.283, r = rnd() * 0.45 * s;
    { const X = x + Math.cos(a) * r, Z = z + Math.sin(a) * r; o.position.set(origin.x + X, 0.02 + gY(X, Z), origin.z + Z); }
    o.rotation.set((rnd() - 0.5) * 0.35, rnd() * 6.283, (rnd() - 0.5) * 0.35);
    const h = s * (0.55 + rnd() * 1.0); o.scale.set(s * (0.8 + rnd() * 0.6), h, s * (0.8 + rnd() * 0.6)); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const kc = KELP_COL[Math.floor(rnd() * KELP_COL.length)], kv = 0.8 + rnd() * 0.45; c.setRGB(kc[0] * kv, kc[1] * kv, kc[2] * kv); im.setColorAt(i, c); i++;
  }
  im.castShadow = false; im.receiveShadow = true; im.name = 'sea_kelp'; im.frustumCulled = false; return im;
}

// ---------------------------------------------------------------- 6. 散布物：半埋铜钟、断锁链、藤壶礁石、沉船
/** Lux 场景件偏亮（贴图白斑多）：按件压暗染色，融进暗青场景 */
const LUX_TINT: Record<string, number> = { scene_sea_bell: 0x8a9c8c, scene_sea_rock: 0x6c7a78, scene_sea_chain: 0x7a6c62, scene_sea_kelp: 0x8c9468 };
function scn(id: string, size: { h?: number; w?: number }): THREE.Group | null {
  const g = has(id) ? makeGlbScene(id, size, { envK: 0.6, ...(LUX_TINT[id] !== undefined ? { tint: LUX_TINT[id] } : {}) }) : null;
  g?.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) { m.userData.outlineParameters = { visible: false }; if (m.isMeshStandardMaterial && !m.envMap) m.envMap = seaEnv(); } });
  return g;
}
const bronze = () => new THREE.MeshStandardMaterial({ color: 0x3e5a48, roughness: 0.5, metalness: 0.65, envMap: seaEnv(), envMapIntensity: 0.8 });
/** 程序化半埋铜钟（base 包 / Lux 缺件时） */
function lathBell(s: number): THREE.Group {
  const g = new THREE.Group(), prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.35 + 0.45 * t * t + (t > 0.9 ? (t - 0.9) * 1.2 : 0), 1.2 - t * 1.2)); }
  const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), bronze()); (b.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; b.castShadow = true; b.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.LatheGeometry(prof.map(v => new THREE.Vector2(v.x * 0.92, v.y * 0.95)), 20), bellInnerMat()); b.add(inner);   // 第三轮：不再用发光平板，钟腔内壁渐变
  b.scale.setScalar(s); b.rotation.z = 1.45; b.position.y = 0.35 * s; g.add(b);
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  return g;
}
function fallenBell(s: number): THREE.Group {
  const lux = scn('scene_sea_bell', { w: 2.4 * s });
  if (lux) { lux.children[0].position.y -= 0.18 * s; return lux; }   // 半埋：往地里沉一点
  const old = scn('scene_bell', { w: 2.2 * s });
  if (old) { const m = old.children[0]; m.rotation.z = 1.35; m.position.y = 0.55 * s; m.position.x = -0.4 * s; return old; }
  return lathBell(s);
}
const linkGeo = new THREE.TorusGeometry(0.16, 0.045, 6, 12);
let ironM: THREE.MeshStandardMaterial | null = null;
/** 一条地上的断锁链：沿折线摆链环，环环正交 */
function chainLine(pts: [number, number][], api: WildBuildApi): void {
  ironM ??= new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.55, metalness: 0.7, envMap: seaEnv(), envMapIntensity: 0.7 });
  ironM.userData.outlineParameters = { visible: false };
  const pos: THREE.Vector3[] = []; const step = 0.25;
  for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += step) pos.push(new THREE.Vector3(ax + (bx - ax) * s / L, 0, az + (bz - az) * s / L)); }
  const im = new THREE.InstancedMesh(linkGeo, ironM, pos.length), o = new THREE.Object3D();
  pos.forEach((p, i) => { const nx = pos[Math.min(i + 1, pos.length - 1)], pv = pos[Math.max(i - 1, 0)]; const yaw = Math.atan2(nx.x - pv.x, nx.z - pv.z);
    o.position.set(p.x, 0.06 + gY(p.x, p.z), p.z); o.rotation.set(0, yaw + Math.PI / 2, 0); if (i % 2) o.rotateX(Math.PI / 2); else o.rotateX(0.12); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = true; im.receiveShadow = true; api.add(im, 0, 0); im.position.y = 0;
}
function barnacleRock(s: number): THREE.Group {
  const lux = scn('scene_sea_rock', { w: 2.2 * s }); if (lux) { lux.children[0].position.y -= 0.08 * s; return lux; }
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 1), p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + rnd() * 0.45; p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i)) * k * 0.55, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x232c2c, roughness: 0.4, metalness: 0.05, flatShading: true, envMap: seaEnv(), envMapIntensity: 0.6 }));
  rock.castShadow = rock.receiveShadow = true; g.add(rock);
  const bar = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.09, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xb8b4a4, roughness: 0.7 }), 40), o = new THREE.Object3D();
  for (let i = 0; i < 40; i++) { const v = new THREE.Vector3(rnd() - 0.5, rnd() * 0.5, rnd() - 0.5).normalize(); o.position.copy(v).multiply(new THREE.Vector3(0.85, 0.45, 0.85)); o.lookAt(o.position.clone().multiplyScalar(2)); o.rotateX(Math.PI / 2); o.scale.setScalar(0.6 + rnd()); o.updateMatrix(); bar.setMatrixAt(i, o.matrix); }
  g.add(bar); g.scale.setScalar(s);
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  return g;
}

// ---------------------------------------------------------------- 第二轮：主角铜钟（程序化车削，铜绿锈贴图，钟口溢光 + 点光源）、碎砖、蜿蜒锁链、月亮
const vh = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
function vn(x: number, y: number, px: number) {   // 周期 px 的值噪声（u 方向回绕）
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = vh(xi % px, yi), b = vh((xi + 1) % px, yi), c = vh(xi % px, yi + 1), d = vh((xi + 1) % px, yi + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
let patina: { map: THREE.Texture; orm: THREE.Texture; nrm: THREE.Texture } | null = null;
/** 铜钟外壁（第四轮）：u = 绕钟一圈、v = 沿轮廓（0 = 钟顶，1 = 口沿）
 *  暗铜褐为主 + 往下流的绿锈（辅）+ 锈褐斑驳 + 凹处黑垢；钟腰一圈 8 块浮雕框（框内 3×3 钟乳）+ 框下一圈铭文竖纹，凸起处磨出亮铜
 *  ORM：G = 粗糙度（铜 0.4–0.65 / 绿锈 0.85 / 锈 0.9 / 磨亮 0.3），B = 金属度（铜 0.75 / 锈 0.15） */
function patinaTex() {
  if (patina) return patina;
  const W = 512, H = 256, ci = new ImageData(W, H), oi = new ImageData(W, H), hgt = new Float32Array(W * H);
  const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const PAN = 8, V0 = 0.21, V1 = 0.35, I0 = 0.41, I1 = 0.5;   // v = 1 − y / 1.22（按高度，heroBell 里重写外壁 uv）   // 浮雕框带、铭文带（v 范围）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x;
    const n = vn(u * 8, v * 8, 8) * 0.5 + vn(u * 16, v * 16, 16) * 0.3 + vn(u * 40, v * 40, 40) * 0.2;
    const st = vn(u * 48, v * 3, 48) * 0.6 + vn(u * 96, v * 6, 96) * 0.4;   // 竖向流痕
    // 浮雕：框边（凸棱）+ 框内钟乳（凸点）+ 铭文竖纹（浅凸）
    let rel = 0;
    if (v > V0 && v < V1) {
      const pu = (u * PAN) % 1, pv = (v - V0) / (V1 - V0);
      const edge = Math.min(pu, 1 - pu) * 1.9, ev = Math.min(pv, 1 - pv);
      const fr = Math.min(edge, ev);
      rel = Math.max(rel, sm(0.07, 0.035, fr) * sm(0.0, 0.02, fr));   // 框棱
      const bu = (pu - 0.2) / 0.6 * 3, bv = (pv - 0.18) / 0.64 * 3;
      if (bu > 0 && bu < 3 && bv > 0 && bv < 3) { const du = (bu % 1) - 0.5, dv = (bv % 1) - 0.5; const d = Math.hypot(du * 1.0, dv * 1.25); rel = Math.max(rel, sm(0.36, 0.12, d)); }   // 钟乳
    }
    if (v > I0 && v < I1) {   // 铭文：短竖笔画 + 断续横笔
      const cu = u * 96, cv = (v - I0) / (I1 - I0); const ch = Math.floor(cu), on = vh(ch, 3.3) > 0.25;
      const fx = cu - ch, stroke = Math.abs(fx - 0.5) < 0.12 && vh(ch, Math.floor(cv * 4)) > 0.35, bar = Math.abs(((cv * 4) % 1) - 0.5) < 0.12 && vh(ch * 1.7, Math.floor(cv * 4)) > 0.6 && fx > 0.15 && fx < 0.85;
      if (on && cv > 0.1 && cv < 0.9 && (stroke || bar)) rel = Math.max(rel, 0.55);
    }
    const g = Math.min(1, Math.max(0, (n * 0.6 + st * 0.55 + (1 - v) * 0.1 - 0.7) * 4.0)) * (1 - rel * 0.6);   // 绿锈：少一些，凸起处被磨掉
    const rustN = vn(u * 20 + 3, v * 14 + 7, 20) * 0.65 + vn(u * 56, v * 40, 56) * 0.35;
    const rust = sm(0.58, 0.72, rustN) * (1 - g) * 0.85;                                                            // 锈褐斑驳
    const recess = (v > V0 - 0.02 && v < I1 + 0.02) ? Math.max(0, 0.35 - rel) * 0.6 : 0;
    const grime = Math.max(0, (0.38 - n) * 2.6) + recess * 0.5;
    const bk = 0.72 + 0.5 * vn(u * 24, v * 24, 24);
    let r = 82 * bk, gg = 56 * bk, b = 36 * bk;                                         // 暗铜褐
    r += (128 * bk - r) * rust; gg += (64 * bk - gg) * rust; b += (30 * bk - b) * rust;   // 锈褐
    const gk = 0.75 + 0.4 * vn(u * 30 + 5, v * 30, 30);
    r += (46 * gk - r) * g; gg += (98 * gk - gg) * g; b += (80 * gk - b) * g;          // 铜绿（降饱和）
    const worn = rel * (0.5 + 0.5 * vn(u * 60, v * 60, 60));
    r += (150 - r) * worn * 0.55; gg += (104 - gg) * worn * 0.55; b += (60 - b) * worn * 0.55;   // 凸起磨亮
    r *= 1 - grime * 0.6; gg *= 1 - grime * 0.55; b *= 1 - grime * 0.5;
    ci.data.set([r, gg, b, 255], i * 4);
    const rough = Math.min(1, 0.42 + 0.25 * vn(u * 34, v * 34, 34) + 0.43 * g + 0.45 * rust + 0.25 * grime - 0.18 * worn);
    const metal = Math.max(0, 0.38 - 0.35 * g - 0.3 * rust - 0.2 * grime);   // 金属度别太高：暗环境下高金属 = 一片黑
    oi.data.set([255, rough * 255, metal * 255, 255], i * 4);
    hgt[i] = g * 0.35 + rust * 0.2 + n * 0.3 + (vn(u * 120, v * 120, 120) - 0.5) * 0.3 + rel * 1.2;
  }
  const nimg = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = hgt[y * W + (x + W - 1) % W], r = hgt[y * W + (x + 1) % W], u = hgt[Math.max(0, y - 1) * W + x], d = hgt[Math.min(H - 1, y + 1) * W + x];
    const nx = (l - r) * 3, ny = (d - u) * 3; const L = Math.hypot(nx, ny, 1); nimg.data.set([(nx / L * 0.5 + 0.5) * 255, (ny / L * 0.5 + 0.5) * 255, (1 / L * 0.5 + 0.5) * 255, 255], (y * W + x) * 4); }
  const tex = (img: ImageData, srgb: boolean) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d')!.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  return (patina = { map: tex(ci, true), orm: tex(oi, false), nrm: tex(nimg, false) });
}
// 钟轮廓（单位：钟高 1.22，口沿半径 0.61）：外壁从钟顶到口沿，内壁从口沿回到钟顶
const BELL_OUT: [number, number][] = [[0.001, 1.22], [0.12, 1.21], [0.24, 1.18], [0.31, 1.12], [0.335, 1.02], [0.335, 0.9], [0.345, 0.75], [0.37, 0.58], [0.42, 0.42], [0.49, 0.26], [0.56, 0.13], [0.6, 0.075], [0.628, 0.045], [0.652, 0.026], [0.668, 0.012], [0.672, 0.0], [0.666, -0.012], [0.648, -0.02], [0.61, -0.022], [0.578, -0.014]];   // 第四轮：口沿外翻唇 + 厚度 + 倒角
const BELL_IN: [number, number][] = [[0.572, -0.01], [0.565, 0.0], [0.535, 0.06], [0.47, 0.2], [0.41, 0.36], [0.36, 0.55], [0.315, 0.75], [0.3, 0.95], [0.27, 1.08], [0.15, 1.14], [0.001, 1.15]];
let bellGeo: { out: THREE.BufferGeometry; inn: THREE.BufferGeometry } | null = null;
const BELL_GLOW = 'vec3(0.28, 1.0, 0.62)';
/** 钟腔内壁：局部 y（钟腔深度）→ 深处亮、口沿暗；正对视线处更亮（看进腔里），掠射处暗；竖向锈纹让内壁曲面看得出来 */
function bellInnerMat(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: seaU.uTime }, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV; void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vL; varying vec3 vN; varying vec3 vV;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
void main(){ float d = clamp(vL.y / 1.12, 0.0, 1.0);                 // 0 = 口沿，1 = 腔顶
  float ang = atan(vL.z, vL.x);
  float streak = 0.7 + 0.3 * n1(vec2(ang * 7.0, vL.y * 2.5)) + 0.15 * n1(vec2(ang * 23.0, vL.y * 9.0));
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float k = pow(d, 1.8) * 0.95 * (0.45 + 0.55 * facing) * streak + 0.02;
  k *= smoothstep(0.0, 0.45, d) * 0.9 + 0.1;                      // 口沿一圈暗
  k *= (0.88 + 0.12 * sin(uTime * 1.6)) * 0.75;   // 第四轮：钟腔光降 25%
  gl_FragColor = vec4(${BELL_GLOW} * k, 1.0);
  #include <colorspace_fragment>
}` });
  m.userData.outlineParameters = { visible: false }; return m;
}
/** 贴地溢光：钟口方向拉长的柔和光斑，流动噪声打散（像贴地的发光雾），加法混合 */
function spillMat(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: seaU.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: POOL_VS, fragmentShader: `uniform float uTime; varying vec2 vUv;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
void main(){ vec2 q = (vUv - 0.5) * 2.0; vec2 e = vec2((q.x + 0.75) * 0.62, q.y * (0.9 + max(q.x + 0.6, 0.0) * 0.25));
  float d = length(e); float a = exp(-d * d * 3.2) * smoothstep(1.0, 0.75, max(abs(q.x), abs(q.y)));
  float fl = n1(q * 2.2 + vec2(-uTime * 0.25, uTime * 0.07)) * 0.6 + n1(q * 5.0 + vec2(-uTime * 0.4, 0.0)) * 0.4;
  a *= 0.55 + 0.7 * fl; a *= 0.85 + 0.15 * sin(uTime * 1.6 + 1.0);
  gl_FragColor = vec4(${BELL_GLOW} * a * 0.083, a); }` });
  m.userData.outlineParameters = { visible: false }; return m;
}
/** 钟口前的低矮体积雾：几片交叉竖片（软边、底部浓、向上淡），加法 */
function bellHaze(s: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: seaU.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    vertexShader: POOL_VS, fragmentShader: `uniform float uTime; varying vec2 vUv;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
void main(){ float x = vUv.x - 0.5, y = vUv.y; float a = exp(-x * x * 9.0) * pow(1.0 - y, 2.2) * smoothstep(0.0, 0.08, y);
  a *= 0.5 + 0.8 * n1(vec2(vUv.x * 4.0 - uTime * 0.15, y * 3.0 - uTime * 0.3));
  gl_FragColor = vec4(${BELL_GLOW} * a * 0.0375, a); }` });
  m.userData.outlineParameters = { visible: false };
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * s, 1.5 * s), m); p.position.y = 0.75 * s; p.rotation.y = i * Math.PI / 3; p.renderOrder = 9; g.add(p); }
  return g;
}
/** 钟口上升光粒（局部坐标，正对镜头的小四边形） */
function riseMotes(n: number, s: number): THREE.Mesh {
  const base = new THREE.CircleGeometry(0.5, 16), g = new THREE.InstancedBufferGeometry();   // 第四轮：圆片几何（被后期 / 替换材质整片画出时也不是方块）
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv); g.instanceCount = n;
  const sd = new Float32Array(n * 4); for (let i = 0; i < n; i++) sd.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(sd, 4));
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: seaU.uTime, uS: { value: s } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute vec4 seed; uniform float uTime; uniform float uS; varying float vA; varying vec2 vUv;
void main(){ float ph = fract(uTime * (0.06 + seed.w * 0.06) + seed.x); float hgt = ph * 2.4 * uS;
  vec3 p = vec3((seed.y - 0.3) * 1.6 * uS + ph * 0.6 * uS, hgt, (seed.z - 0.5) * 1.4 * uS); p.x += sin(uTime * 0.7 + seed.x * 30.0) * 0.12 * uS; p.z += cos(uTime * 0.6 + seed.y * 30.0) * 0.12 * uS;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); mv.xy += position.xy * (0.05 + seed.z * 0.05) * uS; gl_Position = projectionMatrix * mv; vUv = uv;
  vA = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.55, 1.0, ph)); }`,
    fragmentShader: `varying float vA; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float a = (exp(-d * d * 14.0) + pow(1.0 - d, 2.0) * 0.25) * vA; gl_FragColor = vec4(mix(${BELL_GLOW}, vec3(0.85, 1.0, 0.9), exp(-d * d * 30.0)) * a * 0.8, a); }` });
  m.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.name = 'sea_bellmotes'; return mesh;
}
/** 第四轮：砖缝 / 低处 / 水边的细碎石子 + 藤壶簇（两个 InstancedMesh）；石子一半吸附到砖缝（局部坐标整米线） */
function gritScatter(nPeb: number, nClu: number): THREE.InstancedMesh[] {
  const o = new THREE.Object3D(), c = new THREE.Color();
  const okAt = (x: number, z: number) => Math.abs(x) > 3.2 && Math.hypot(x, z - 58) > 12 && waterAt(x, z) < 0.7;
  const pick = (): [number, number] => { for (let k = 0; k < 20; k++) { let x = (rnd() - 0.5) * 166, z = (rnd() - 0.5) * 166; const w = waterAt(x, z);
    if (!okAt(x, z)) continue; if (!(w > 0.08 && w < 0.6) && rnd() < 0.55) continue;   // 偏向水边 / 低处
    if (rnd() < 0.6) { if (rnd() < 0.5) x = Math.round(x) + (rnd() - 0.5) * 0.07; else z = Math.round(z) + (rnd() - 0.5) * 0.07; }   // 吸附砖缝
    return [x, z]; } return [40, -40]; };
  const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true }); pm.userData.outlineParameters = { visible: false };
  const peb = new THREE.InstancedMesh(rimGeo, pm, nPeb);
  for (let i = 0; i < nPeb; i++) { const [x, z] = pick(), k = 0.018 + rnd() * rnd() * 0.06;
    o.position.set(origin.x + x, 0.012 + gY(x, z), origin.z + z); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.scale.set(k * (1 + rnd() * 0.6), k * 0.55, k); o.updateMatrix(); peb.setMatrixAt(i, o.matrix);
    const r = rnd(); if (r < 0.25) c.setRGB(0.42, 0.38, 0.32); else if (r < 0.4) c.setRGB(0.5, 0.48, 0.44); else { const v = 0.16 + rnd() * 0.18; c.setRGB(v, v * 1.02, v * 1.03); } peb.setColorAt(i, c); }
  peb.receiveShadow = true; peb.name = 'sea_grit'; peb.frustumCulled = false;
  barnGeo ??= (() => { const g = new THREE.CylinderGeometry(0.012, 0.024, 0.026, 7, 1, true); g.translate(0, 0.013, 0); return g; })();
  const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }); bm.userData.outlineParameters = { visible: false };
  const per = 9, bar = new THREE.InstancedMesh(barnGeo, bm, nClu * per); let j = 0;
  for (let i = 0; i < nClu; i++) { const [cx, cz] = pick();
    for (let k = 0; k < per; k++) { const a = rnd() * 6.283, r = rnd() * 0.16; o.position.set(origin.x + cx + Math.cos(a) * r, gY(cx, cz), origin.z + cz + Math.sin(a) * r); o.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6.283, (rnd() - 0.5) * 0.7);
      o.scale.setScalar(1.6 + rnd() * 2.2); o.updateMatrix(); bar.setMatrixAt(j, o.matrix); const v = 0.42 + rnd() * 0.35; c.setRGB(v, v * 0.97, v * 0.88); bar.setColorAt(j, c); j++; } }
  bar.receiveShadow = true; bar.name = 'sea_barnfield'; bar.frustumCulled = false;
  return [peb, bar];
}
/** 外壁轮廓半径 r(y)（BELL_OUT 线性插值） */
function rOut(y: number): number {
  for (let i = 0; i + 1 < BELL_OUT.length; i++) { const [r0, y0] = BELL_OUT[i], [r1, y1] = BELL_OUT[i + 1]; if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) { const t = (y - y0) / ((y1 - y0) || 1); return r0 + (r1 - r0) * t; } }
  return 0.6;
}
/** 箍带：沿外壁 y0..y1 的凸起车削环，截面 = 倒角梯形（高 hh） */
function bandGeo(y0: number, y1: number, hh: number): THREE.BufferGeometry {
  const P: THREE.Vector2[] = [], e = (y1 - y0) * 0.22;
  for (const [y, k] of [[y1, 0], [y1 - e * 0.3, 0.7], [y1 - e, 1], [y0 + e, 1], [y0 + e * 0.3, 0.7], [y0, 0]] as const) P.push(new THREE.Vector2(rOut(y) - 0.003 + hh * k, y));
  const g = new THREE.LatheGeometry(P, 44), uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 0.86 + uv.getY(i) * 0.06);   // 箍带取口沿附近（无浮雕）的贴图
  return g;
}
let barnGeo: THREE.BufferGeometry | null = null;
/** 藤壶：几簇贴在外壁上的小开口锥（钟腰以下、口沿附近多），InstancedMesh，挂在钟局部坐标里 */
function barnacles(_m: THREE.Material): THREE.InstancedMesh {
  barnGeo ??= (() => { const g = new THREE.CylinderGeometry(0.012, 0.024, 0.026, 7, 1, true); g.translate(0, 0.013, 0); return g; })();
  const N = 90, mat = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }); mat.userData.outlineParameters = { visible: false };
  const im = new THREE.InstancedMesh(barnGeo, mat, N), o = new THREE.Object3D(), c = new THREE.Color(), nrm = new THREE.Vector3();
  const clusters = Array.from({ length: 7 }, () => [rnd() * 6.283, 0.04 + rnd() * rnd() * 0.75]);
  for (let i = 0; i < N; i++) {
    const [ca, cy] = clusters[i % clusters.length], a = ca + (rnd() - 0.5) * 0.5, y = Math.max(0.02, Math.min(1.0, cy + (rnd() - 0.5) * 0.14));
    const r = rOut(y), slope = (rOut(y - 0.02) - rOut(y + 0.02)) / 0.04;
    nrm.set(Math.cos(a), slope, Math.sin(a)).normalize();
    o.position.set(Math.cos(a) * r, y, Math.sin(a) * r); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    o.scale.setScalar(0.6 + rnd() * 1.1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const v = 0.55 + rnd() * 0.5; c.setRGB(v, v * 0.97, v * 0.9); im.setColorAt(i, c);
  }
  im.castShadow = false; im.receiveShadow = true; im.name = 'sea_bellbarn'; return im;
}
/** 钟外壁海草：在钟局部坐标取点（朝上的一侧），变到外层组坐标，叶片竖直向上长（摇摆） */
function bellWeed(m: THREE.Matrix4, s: number): THREE.InstancedMesh {
  const N = 26, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide, envMap: seaEnv(), envMapIntensity: 0.8, emissive: 0x040c06 });
  swayPatch(mat, 0.16, 'seaSwayBell'); mat.userData.outlineParameters = { visible: false };
  const im = new THREE.InstancedMesh(bladeGeo(), mat, N), o = new THREE.Object3D(), c = new THREE.Color(), p = new THREE.Vector3();
  let i = 0;
  for (let k = 0; k < 400 && i < N; k++) {
    const a = rnd() * 6.283, y = 0.08 + rnd() * 0.9; p.set(Math.cos(a) * rOut(y), y, Math.sin(a) * rOut(y)).applyMatrix4(m);
    if (p.y < 0.35 * s) continue;   // 只长在露出来的上侧
    o.position.copy(p); o.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5); const h = s * (0.18 + rnd() * 0.25); o.scale.set(s * 0.25, h, s * 0.25); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const kc = KELP_COL[Math.floor(rnd() * KELP_COL.length)], kv = 0.7 + rnd() * 0.4; c.setRGB(kc[0] * kv, kc[1] * kv, kc[2] * kv); im.setColorAt(i, c); i++;
  }
  im.count = i; im.name = 'sea_bellweed'; im.frustumCulled = false; return im;
}
function heroBell(s: number, light: boolean, sandMound = true): THREE.Group {
  bellGeo ??= (() => {
    const out = new THREE.LatheGeometry(BELL_OUT.map(([r, y]) => new THREE.Vector2(r, y)), 44);
    { const uv = out.attributes.uv as THREE.BufferAttribute, ps = out.attributes.position as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, 1 - ps.getY(i) / 1.22))); }   // 第四轮：外壁 v 按高度（浮雕框 / 铭文带位置固定）
    const inn = new THREE.LatheGeometry(BELL_IN.map(([r, y]) => new THREE.Vector2(r, y)), 44);
    const c = new Float32Array(inn.attributes.position.count * 3);   // 内壁：越深越亮（光从钟腔里溢出来）
    for (let i = 0; i < inn.attributes.position.count; i++) { const y = inn.attributes.position.getY(i), k = 0.35 + 0.65 * Math.min(1, y / 0.9); c.set([0.06 * k * 0.75, 0.75 * k * 0.75, 0.66 * k * 0.75], i * 3); }
    inn.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return { out, inn };
  })();
  const P = patinaTex();
  const bronzeM = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: 0xffffff, map: P.map, roughnessMap: P.orm, metalnessMap: P.orm, normalMap: P.nrm, normalScale: new THREE.Vector2(1.6, 1.6), roughness: 1, metalness: 1, envMap: seaEnv(), envMapIntensity: 0.55, emissive: 0xffffff, emissiveMap: P.map, emissiveIntensity: 0.14 });   // 自发光取底色 ×0.14：背光面也看得出铜褐 / 绿锈 / 浮雕   // 第四轮：环境反射减半（青色夜空把铜反成光滑绿色）
  bronzeM.userData.outlineParameters = { visible: false };
  const glowM = bellInnerMat();   // 第三轮：钟腔内壁渐变（深处亮、口沿暗 + Fresnel + 竖向纹理，内壁几何看得见）
  const g = new THREE.Group(), bell = new THREE.Group();
  const o = new THREE.Mesh(bellGeo.out, bronzeM); o.castShadow = true; o.receiveShadow = true; bell.add(o);
  bell.add(new THREE.Mesh(bellGeo.inn, glowM));
  // 钟纽 + 两道箍
  const lugM = bronzeM;
  for (const a of [0, Math.PI / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 18), lugM); t.position.y = 1.29; t.rotation.y = a; bell.add(t); }
  // 第四轮：钟肩 / 钟腰 / 钟唇上方箍带 = 贴着外壁轮廓的凸起车削带（有厚度和倒角），比细圆环粗得多
  for (const [y0, y1, hh] of [[1.13, 1.17, 0.018], [0.99, 1.06, 0.024], [0.755, 0.785, 0.02], [0.555, 0.585, 0.018], [0.2, 0.26, 0.026], [0.12, 0.15, 0.016]] as const) { const t = new THREE.Mesh(bandGeo(y0, y1, hh), lugM); t.castShadow = true; bell.add(t); }
  bell.add(barnacles(lugM));
  // 躺倒：钟顶埋进沙里、钟口斜朝上对着 +x
  const th = 1.9, tx = -Math.sin(th), ty = Math.cos(th);
  bell.rotation.z = th; bell.scale.setScalar(s); bell.position.set(-0.6 * s * tx, 0.3 * s - 0.6 * s * ty, 0);
  g.add(bell);
  bell.updateMatrix(); g.add(bellWeed(bell.matrix, s));   // 第四轮：外壁上长出的海草（摇摆）
  // 半埋：钟顶一侧堆起沙丘
  const sandM = new THREE.MeshStandardMaterial({ color: 0x6e6452, roughness: 0.95, envMap: seaEnv(), envMapIntensity: 0.25 }); sandM.userData.outlineParameters = { visible: false };
  const mg = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), mp = mg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), z = mp.getZ(i), y = mp.getY(i), k = 0.75 + 0.45 * vn(Math.atan2(z, x) * 1.6 + 9, y * 3 + s, 1e9); mp.setXYZ(i, x * k, y * (0.6 + 0.6 * vn(x * 3 + 2, z * 3, 1e9)), z * k); }
  mg.computeVertexNormals();
  const mound = new THREE.Mesh(mg, sandM); mound.scale.set(0.95 * s, 0.26 * s, 0.85 * s); mound.position.set(-0.55 * s, -0.02, 0); mound.receiveShadow = true; if (sandMound) g.add(mound);
  // 光从钟口沿地面流出：贴地加色光晕（噪声流动的柔和光斑）+ 低处体积雾片 + 少量上升光粒
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(4.2 * s, 3.4 * s), spillMat()); spill.rotation.x = -Math.PI / 2; spill.position.set(1.5 * s, 0.06, 0); spill.renderOrder = 3; g.add(spill);
  if (q() !== 'low') { const v = bellHaze(s); v.position.set(0.9 * s, 0, 0); g.add(v); const r = riseMotes(q() === 'medium' ? 10 : 22, s); r.position.set(0.55 * s, 0.25 * s, 0); g.add(r); }
  if (light) { const L = new THREE.PointLight(0x48ffb8, 0.98 * s, 5 * s, 2); L.position.set(0.75 * s, 0.5 * s, 0); g.add(L); }
  return g;
}
/** 第三轮：碎石块 = 不规则多边形挤出（有厚度、倒角），顶面板岩贴图、侧边压暗；贴地、部分半埋，不反射环境（不发蓝） */
let slateMap: THREE.Texture | null = null;
export function seaSetSlate(t: THREE.Texture) { slateMap = t; }
let stoneGeos: THREE.BufferGeometry[] | null = null;
function stoneGeoSet(): THREE.BufferGeometry[] {
  if (stoneGeos) return stoneGeos;
  const out: THREE.BufferGeometry[] = [], sv = seed; seed = 4242;
  for (let k = 0; k < 6; k++) {
    const n = 5 + Math.floor(rnd() * 3), sh = new THREE.Shape();
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + (rnd() - 0.5) * 0.5, r = 0.32 + rnd() * 0.22; const x = Math.cos(a) * r * (1.15 + k * 0.05), y = Math.sin(a) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.035, bevelSegments: 1, steps: 1 });
    g.rotateX(-Math.PI / 2);   // 挤出方向 → +y，顶面 y = 1 + 倒角
    const nm = g.attributes.normal as THREE.BufferAttribute, c = new Float32Array(nm.count * 3);
    for (let i = 0; i < nm.count; i++) { const ny = nm.getY(i), v = 0.28 + 0.72 * Math.min(1, Math.max(0, (ny - 0.45) / 0.5)); c.set([v, v, v], i * 3); }   // 侧边 / 倒角压暗
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    out.push(g);
  }
  seed = sv; return (stoneGeos = out);
}
let stoneM: THREE.MeshStandardMaterial | null = null;
function stoneMat(): THREE.MeshStandardMaterial {
  if (stoneM) return stoneM;
  let map: THREE.Texture | undefined;
  if (slateMap) { map = slateMap.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(0.45, 0.45); map.needsUpdate = true; }
  stoneM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe6e2da).multiplyScalar(3.4), map, vertexColors: true, roughness: 0.82, metalness: 0, emissive: new THREE.Color(0xc0ccc8), emissiveMap: map ?? null });   // r3：地面 shader 把环境光 ×2.9，石块没有 → 用贴图自发光补一层环境光，否则一圈黑石   // 第五轮：板岩贴图本身很暗（地面 shader 有提亮），石块同步提亮，否则发黑   // 不挂 envMap：夜空环境是青色，会把石块反成蓝色
  stoneM.userData.outlineParameters = { visible: false }; return stoneM;
}
/** 一组贴地石块（局部坐标，返回放在原点的 InstancedMesh 列表） */
function stoneScatter(list: { x: number; z: number; w: number; d: number; t: number; ry: number; sink: number; tilt: number; v: number }[], world: { x: number; z: number }): THREE.InstancedMesh[] {
  const G = stoneGeoSet(), by: typeof list[] = G.map(() => []);
  list.forEach((s0, i) => by[i % G.length].push(s0));
  const o = new THREE.Object3D(), c = new THREE.Color(), out: THREE.InstancedMesh[] = [];
  by.forEach((arr, gi) => { if (!arr.length) return;
    const im = new THREE.InstancedMesh(G[gi], stoneMat(), arr.length);
    arr.forEach((s0, i) => { o.position.set(world.x + s0.x, -s0.t * s0.sink + (world.x || world.z ? gY(s0.x, s0.z) : 0), world.z + s0.z); o.rotation.set(0, s0.ry, 0); o.rotateX(s0.tilt); o.rotateZ(s0.tilt * 0.6); o.scale.set(s0.w, s0.t, s0.d); o.updateMatrix(); im.setMatrixAt(i, o.matrix); c.setRGB(s0.v, s0.v * 0.99, s0.v * 0.97); im.setColorAt(i, c); });
    im.castShadow = true; im.receiveShadow = true; im.name = 'sea_slabs'; im.frustumCulled = false; out.push(im); });
  return out;
}
const stoneRnd = (x: number, z: number, big = 1) => ({ x, z, w: (0.45 + rnd() * 0.9) * big, d: (0.4 + rnd() * 0.8) * big, t: (0.07 + rnd() * 0.14) * big, ry: rnd() * 6.283, sink: 0.15 + rnd() * 0.6, tilt: (rnd() - 0.5) * 0.22, v: 0.6 + rnd() * 0.55 });
/** 不规则低矮碎石沙堆（纪念碑 / 前景大钟脚下）：深色湿石 + 一圈石块 */
export function seaMound(r: number, h: number, sd: number): THREE.Group {
  const sv = seed; seed = 1000 + sd; const g = new THREE.Group();
  const mg = new THREE.CircleGeometry(1, 40, 0, Math.PI * 2); mg.rotateX(-Math.PI / 2);
  const geo = new THREE.SphereGeometry(1, 36, 8, 0, Math.PI * 2, 0, Math.PI / 2), mp = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), z = mp.getZ(i), y = mp.getY(i), a = Math.atan2(z, x), k = 0.8 + 0.35 * vn(a * 1.9 + 3, sd * 0.1, 1e9) + 0.1 * vn(a * 7, y * 4, 1e9); mp.setXYZ(i, x * k, y * (0.55 + 0.5 * vn(x * 3 + sd, z * 3, 1e9)), z * k); }
  geo.computeVertexNormals(); void mg;
  const m = new THREE.MeshStandardMaterial({ color: 0x232523, roughness: 0.75, metalness: 0, flatShading: true }); m.userData.outlineParameters = { visible: false };
  const mound = new THREE.Mesh(geo, m); mound.scale.set(r, h, r * 0.85); mound.receiveShadow = true; mound.castShadow = true; g.add(mound);
  const L: ReturnType<typeof stoneRnd>[] = [];
  for (let i = 0; i < 14; i++) { const a = rnd() * 6.283, rr = r * (0.55 + rnd() * 0.6); const st = stoneRnd(Math.cos(a) * rr, Math.sin(a) * rr * 0.85, 1.1); st.sink = 0.1 + rnd() * 0.3; st.tilt = (rnd() - 0.5) * 0.5; L.push(st); }
  for (const im of stoneScatter(L, { x: 0, z: 0 })) { im.position.y = h * 0.5; g.add(im); }
  seed = sv; return g;
}
/** 碎石块 + 碎块：集中在钟、礁石、水边，零散铺开 */
function slabDebris(anchors: [number, number, number][], nSlab: number, nChunk: number): THREE.Object3D[] {
  const o = new THREE.Object3D(), c = new THREE.Color();
  const pick = (): [number, number] => { for (let k = 0; k < 12; k++) { const A = anchors[Math.floor(rnd() * anchors.length)], a = rnd() * 6.283, r = A[2] * (0.5 + rnd() * 1.6); const x = A[0] + Math.cos(a) * r, z = A[1] + Math.sin(a) * r;
    if (Math.abs(x) > 4.5 && Math.hypot(x, z - 58) > 13 && waterAt(x, z) < 0.5) return [x, z]; } return [(rnd() - 0.5) * 150, (rnd() - 0.5) * 150]; };
  const L: ReturnType<typeof stoneRnd>[] = [];
  for (let i = 0; i < nSlab; i++) { const [x, z] = pick(); L.push(stoneRnd(x, z)); }
  const stones = stoneScatter(L, origin);
  const sm = new THREE.MeshStandardMaterial({ color: 0x3a3b3a, roughness: 0.85, metalness: 0 }); sm.userData.outlineParameters = { visible: false };
  const chM = sm; const ch = new THREE.InstancedMesh(rimGeo, chM, nChunk);   // 碎块不反光（水下会被倒影 / 泛光放大成亮方块）
  for (let i = 0; i < nChunk; i++) {
    const [x, z] = pick(), k = 0.04 + rnd() * rnd() * 0.16;
    o.position.set(origin.x + x, 0.02 + gY(x, z), origin.z + z); o.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); o.scale.set(k * 1.5, k * 0.6, k); o.updateMatrix(); ch.setMatrixAt(i, o.matrix);
    if (rnd() < 0.3) c.setRGB(0.95, 0.85, 0.7); else { const v = 0.6 + rnd() * 0.9; c.setRGB(v, v, v); } ch.setColorAt(i, c);   // 三成是贝壳 / 沙砾色
  }
  (ch.material as THREE.Material).userData.outlineParameters = { visible: false }; ch.receiveShadow = true; ch.name = 'sea_chunks'; ch.frustumCulled = false;
  return [...stones, ch];
}
/** 蜿蜒锁链路径：平滑随机转向，每 0.5 米一个控制点 */
function windPath(x: number, z: number, ang: number, len: number): [number, number][] {
  const pts: [number, number][] = [[x, z]]; let a = ang, da = 0;
  for (let l = 0; l < len; l += 0.5) { da = da * 0.8 + (rnd() - 0.5) * 0.35; a += da; x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.5; pts.push([x, z]); }
  return pts;
}
function moonSprite(): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(240,255,255,1)'); r.addColorStop(0.16, 'rgba(225,250,255,1)'); r.addColorStop(0.2, 'rgba(160,235,240,0.5)'); r.addColorStop(0.45, 'rgba(90,200,210,0.12)'); r.addColorStop(1, 'rgba(60,160,170,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending });
  m.userData.outlineParameters = { visible: false };
  m.color.setScalar(0.26); const sp = new THREE.Sprite(m); sp.scale.setScalar(30); sp.name = 'sea_moon'; sp.frustumCulled = false; return sp;
}

// ---------------------------------------------------------------- 入口
const stats = { water: '', drops: 0, kelp: 0, luxKelp: 0, pools: 0, motes: 0, mist: 0, bells: 0, rocks: 0, chains: 0, slabs: 0, wreck: false, q: '' };
export function seabedBuild(api: WildBuildApi) {
  origin = api.origin; seed = 2027; drops.length = 0; dropU.forEach(v => v.set(0, 0, -99, 0)); spray.length = 0; dropPts = null; water = null;
  const lvl = q(); stats.q = lvl;
  buildMask();
  // 1. 水面
  water = waterMesh(); api.add(water, 0, 0); water.position.y = WATER_Y; stats.water = hi() ? 'reflector' : 'env';
  dryDiscs.length = 0; shoreTex = null;
  deep = deepWaterMesh(); api.add(deep, LAKE.x, LAKE.z); deep.position.y = WATER_Y + 0.001;
  if (lvl !== 'low') { dropPts = dropPoints(); api.add(dropPts, 0, 0); dropPts.position.set(0, 0, 0); stats.drops = MAXD; }
  // 5. 发光坑
  GLOW.forEach(([x, z, r, k], i) => { api.add(glowPool(r, k === 1, i * 0.37), x, z, i); stats.pools++; });
  for (const im of stoneScatter(poolRings(), origin)) { api.add(im, 0, 0); im.position.set(0, 0, 0); }
  if (lvl !== 'low') { const pr = poolRise(lvl === 'medium' ? 7 : 14); api.add(pr, 0, 0); pr.position.set(0, 0, 0); }
  if (lvl !== 'low') { const n = lvl === 'ultra' ? 300 : lvl === 'high' ? 220 : 90; const m = motes(n); api.add(m, 0, 0); m.position.set(0, 0, 0); stats.motes = n; }
  if (hi()) { api.add(mist(0.18, 0.13, 0.06, 2.0), 0, 0); api.add(mist(0.5, 0.09, 0.045, 1.4), 0, 0); api.add(mist(1.4, 0.06, 0.03, 0.3), 0, 0); stats.mist = 3; }
  else if (lvl === 'medium') { api.add(mist(0.35, 0.13, 0.05, 2.2), 0, 0); stats.mist = 1; }
  const CORNER: [number, number] = [14, -40];
  const rocks: [number, number, number][] = [[CORNER[0] + 3.4, CORNER[1] + 2.8, 0.9], [CORNER[0] - 3.8, CORNER[1] + 3.2, 0.7], [24, -43, 1.1], [52, -36, 1.3], [55, -22, 0.9], [27, 72, 1.0], [-14, 79, 0.9], [-55, 12, 1.0], [-17, -60, 0.9], [35, 40, 1.2], [-52, -62, 1.1], [20, -60, 0.8], [-70, -40, 1.4], [72, 10, 1.3], [35, -40, 0.8]];
  // 6. 海草（第二轮 ×3）：聚簇在主角铜钟、礁石、水边、发光潭周围，少量散在砖缝
  const nSpots = lvl === 'low' ? 40 : lvl === 'medium' ? 140 : 210;
  const spots: [number, number, number][] = [];
  const okAt = (x: number, z: number) => Math.abs(x) > 4.5 && Math.hypot(x, z - 58) > 14 && Math.abs(x) < 84 && Math.abs(z) < 84 && waterAt(x, z) < 0.62;
  const ring = (cx: number, cz: number, r0: number, r1: number, n: number, sz: [number, number]) => { for (let k = 0; k < n; k++) { const a = rnd() * 6.283, r = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (okAt(x, z)) spots.push([x, z, sz[0] + rnd() * (sz[1] - sz[0])]); } };
  for (const [x, z, sz] of [...HERO_BELLS, FG_BELL]) ring(x, z, sz * 0.9, sz * 2.4, lvl === 'low' ? 3 : 12, [0.9, 1.6]);
  for (const [x, z, sz] of rocks) ring(x, z, sz * 0.9, sz * 2.0, lvl === 'low' ? 1 : 4, [0.8, 1.4]);
  for (const [x, z, r] of GLOW) ring(x, z, r * 1.3, r * 2.6, lvl === 'low' ? 0 : 2, [0.6, 1.1]);
  for (let k = 0; k < 4000 && spots.length < nSpots; k++) {   // 水边成丛（一丛 2–4 簇）
    const x = (rnd() - 0.5) * 164, z = (rnd() - 0.5) * 164, w = waterAt(x, z);
    if (!okAt(x, z)) continue;
    if (w > 0.12 && w < 0.5) ring(x, z, 0, 1.4, 2 + Math.floor(rnd() * 3), [0.7, 1.3]);
    else if (rnd() < 0.02) ring(x, z, 0, 0.8, 2, [0.6, 1.0]);
  }
  spots.length = Math.min(spots.length, nSpots + 30);
  spots.push([CORNER[0] - 1.8, CORNER[1] + 1.6, 1.3], [CORNER[0] + 2.2, CORNER[1] - 1.6, 1.1], [CORNER[0] - 2.8, CORNER[1] - 2.2, 1.2]);
  const kelp = kelpField(spots, lvl === 'low' ? 8 : 11); api.add(kelp, 0, 0); kelp.position.set(0, 0, 0); stats.kelp = spots.length;
  if (has('scene_sea_kelp')) {   // 比赛版：Lux3D 海草丛（同一套摇摆）
    const put = (x: number, z: number, h: number) => { const g = scn('scene_sea_kelp', { h }); if (!g) return; const m = g.children[0] as THREE.Mesh; const mm = (m.material as THREE.MeshStandardMaterial).clone(); swayPatch(mm, 0.18, 'seaSwayLux'); m.material = mm; m.castShadow = false; api.add(g, x, z, rnd() * 6.283); stats.luxKelp++; };
    put(CORNER[0] - 2.6, CORNER[1] + 2.4, 1.9); put(CORNER[0] - 3.4, CORNER[1] - 0.6, 1.5);
    for (let i = 0; i < 18 && i < spots.length; i++) { const sp = spots[(i * 7) % spots.length]; put(sp[0] + 0.6, sp[1] - 0.4, 1.2 + rnd() * 0.8); }
  }
  // 3. 主角铜钟（程序化：钟形清楚、铜绿锈、钟口溢青光；高档 / 超高档每口一盏点光源）+ 其余散落的小钟
  for (const [x, z, sz, tx, tz] of HERO_BELLS) { const ry = Math.atan2(-(tz - z), tx - x) + 1.05; api.add(heroBell(sz, hi()), x, z, ry); stats.bells++; }
  { const [x, z, sz, tx, tz, lift] = FG_BELL, ry = Math.atan2(-(tz - z), tx - x);
    const g = heroBell(sz, hi(), false); g.position.y = lift; const mound = seaMound(sz * 0.8, lift + 0.2, 8); mound.position.set(-0.3 * sz, -lift, 0); g.add(mound);
    // 钟下礁石：几块藤壶礁石托住钟身（像概念图里坐在乱石上）
    for (const [dx, dz, k, r] of [[-0.55, 0.45, 1.25, 0.4], [-0.75, -0.5, 1.1, 2.1], [0.05, -0.75, 0.9, 4.0], [-1.1, 0.0, 1.0, 5.3]] as const) { const rk = barnacleRock(k * sz * 0.42); rk.position.set(dx * sz, -lift - 0.05, dz * sz); rk.rotation.y = r; g.add(rk); }
    api.add(g, x, z, ry); stats.bells++; }
  const bells: [number, number, number, number][] = [[-48, -58, 1.2, 1.1], [36, 58, 1.1, 4.0], [-24, 74, 1.0, 5.2], [-64, 6, 1.0, 2.8]];
  for (const [x, z, s, ry] of bells) { api.add(fallenBell(s), x, z, ry); stats.bells++; }
  // 锁链：从钟纽拖出来沿地面蜿蜒
  for (const [x, z, sz, tx, tz] of HERO_BELLS) { const back = Math.atan2(z - tz, x - tx); chainLine(windPath(x + Math.cos(back) * sz * 0.9, z + Math.sin(back) * sz * 0.9, back + (rnd() - 0.5) * 0.8, 7 + rnd() * 6), api); stats.chains++; }
  chainLine(windPath(42.5, -26, 2.6, 9), api); chainLine(windPath(-46, -57, 0.4, 8), api); chainLine(windPath(20, -50, -0.3, 10), api); stats.chains += 3;
  if (has('scene_sea_chain')) { for (const [x, z, w, ry] of [[CORNER[0] - 2.4, CORNER[1] - 3.2, 2.0, 0.7], [34, 55, 1.8, 2.0], [-62, 3, 1.6, 4.1]] as const) { const g = scn('scene_sea_chain', { w }); if (g) { api.add(g, x, z, ry); stats.chains++; } } }
  // 藤壶礁石
  for (const [x, z, s] of rocks) { api.add(barnacleRock(s), x, z, rnd() * 6.283); stats.rocks++; }
  // 2. 碎砖翘起 + 碎块（钟 / 礁石 / 水边周围）
  const anch: [number, number, number][] = [...HERO_BELLS.map(([x, z, s]) => [x, z, s * 1.6] as [number, number, number]), ...rocks.map(([x, z, s]) => [x, z, s * 2] as [number, number, number]), ...WATER.map(([x, z, rx]) => [x, z, rx * 0.9] as [number, number, number])];
  const nS = lvl === 'low' ? 24 : lvl === 'medium' ? 80 : 160;
  for (const o of slabDebris(anch, nS, nS * 2)) { api.add(o, 0, 0); o.position.set(0, 0, 0); } stats.slabs = nS;
  for (const o of gritScatter(lvl === 'low' ? 300 : lvl === 'medium' ? 900 : 1800, lvl === 'low' ? 20 : lvl === 'medium' ? 60 : 110)) { api.add(o, 0, 0); o.position.set(0, 0, 0); }
  // 月亮（倒影里的亮斑对齐它）
  // 第五轮：月亮改由穹顶破口 shader 画（mirrorsky），不再放精灵
  void moonSprite;
  // 远处沉船（比赛版场景件）
  // 第五轮：B3 深水湖 + 石堤桥 + 青灯 + 湖岸碎石
  try { lakeBuild(api, { stones: stoneScatter, stoneRnd, env: seaEnv(), dry: seaDry, slate: slateMap, lvl }); } catch (e) { console.error('深水湖 / 石堤桥出错', e); }
  for (const [x, z, sz] of [...HERO_BELLS, FG_BELL]) seaDry(x, z, sz * 0.55);
  for (const [x, z, s0] of rocks) seaDry(x, z, s0 * 0.9);
  for (const [x, z, s0] of bells) seaDry(x, z, s0 * 0.5);
  { const t = seaShoreTex(); for (const m of [water, deep]) if (m) (m.material as THREE.ShaderMaterial).uniforms.uShore.value = t; }
  const wreck = scn('scene_shipwreck', { w: 30 });
  if (wreck) { wreck.children[0].rotation.z = 0.12; wreck.children[0].position.y = -1.2; api.add(wreck, -78, -66, 0.9); stats.wreck = true; }
}
export function seabedUpdate(dt: number, player?: { x: number; z: number }) {
  seaU.uTime.value += dt;
  updateDrops(dt, player);
}
/** 截图 / 测试：在视线落地点附近立即补几滴 */
export function seabedBurst(n = 6) { const t = seaU.uTime.value; for (let i = 0; i < n; i++) { const x = lookAt.x - origin.x + (rnd() - 0.5) * 6, z = lookAt.z - origin.z + (rnd() - 0.5) * 4; if (waterAt(x, z) > 0.5) addDrop(x, z, t + 0.05 + i * 0.35, 0.9 + rnd() * 0.3); } }
export const seabedDebug = () => ({ ...stats, t: +seaU.uTime.value.toFixed(1), look: [+(lookAt.x - origin.x).toFixed(1), +(lookAt.z - origin.z).toFixed(1)], liveDrops: drops.filter(d => d && seaU.uTime.value - d.t < 4).length });
