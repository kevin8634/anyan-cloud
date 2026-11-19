// ======================================================================
// 11-16 本体野外旗帜：营地 / 野外现有旗帜（makeBanner 的 'cloth'、帐篷顶小三角旗）换成顶点着色器布料摆动
//   （画质专长包第 86 步：banner moves with the one wind；参考 Rhett 秋林逆光 v2 的 flag 风摆，本文件自有实现）
//   · 沿旗杆一边固定，旗面朝下风向展开；风弱时下垂贴杆，风强 / 阵风时展平
//   · 波沿旗面从旗杆往自由端传播（相位 k·x − ω·t），振幅随离杆距离增大，频率随风强变快；自由端轻微上下抖
//   · 法线由形变函数差分得出（高 / 超高 / 中），背光时旗面透光（太阳 = 场景第一盏方向光）
//   · 风 = field_flora 的共享风场（风向 / 强度 / 阵风随空气漂移）；本图没有新版草木（低画质）时旗帜自己推时间
//   画质：低 = 分段少、单一正弦、无差分法线（"简化摆动"）；?off=flags 回旧版（静态布片 + main.ts 原来的整片转动）
//   11-19 flagdemo（Rhett「旗子的风有点大，换成和秋林逆光里面的旗子一样飘动」）：旗面形变换成秋林逆光 Demo 的 wind 'flag' 原式
//     （旗顶挂住、下摆顺风后摆 hang·(0.12+0.38g)、侧向波 sin(3.3t − 2.6·hang + 2.2·x)·0.10·(0.8·hang+0.5·x)·(0.5+g)、
//      上下起伏 sin(2.7t − 3x − hang)·0.03·hang），阵风 g = Demo gustAt 原式（0..1），风向 / 时间 / 阵风图样推进接共享风场 FF_SHARED；
//     强度口径：Demo 没有强度，共享风强 s = 1（qlwind 开时就是 1）时与 Demo 完全一致，s < 1 时整体乘 0.55 + 0.45 s，绝不超过 Demo；
//     透光 = Demo trans 0.6 原式（背光 1.25 + 正对太阳 3.4·pow4），阴影深度材质同一形变。
//     分档：中 / 高 / 超高 = Demo 全式 + 差分法线；低 = 去掉上下起伏、法线不变（Demo 本身也不重算法线）。?off=flagdemo 回 11-16 旧摆动
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cinePatch } from './cine';
import { FF_SHARED } from './field_flora';

export function fieldFlagsOn(): boolean {
  return !(typeof location !== 'undefined' && /[?&]off=[^&]*\bflags\b/.test(location.search));   // 11-19 改整词匹配：原子串匹配会被 ?off=flagskin 误伤（flagskin 含 "flags"）
}
/** 11-17e 旗子接线（镜渊城钟楼领地的建筑旗、野外动态事件「守卫」战旗换布料摆动）：?off=flagwire（或 localStorage darkrock_cine_off 含 flagwire）只关这批新接的，
 *  ?off=flags 仍然全部关（含原有营地 / 野外旗） */
let offWire: boolean | null = null;
export function flagWireOn(): boolean {
  if (!fieldFlagsOn()) return false;
  if (offWire === null) {
    offWire = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offWire = `${q},${ls}`.split(',').map(x => x.trim()).includes('flagwire');
    } catch { offWire = false; }
  }
  return !offWire;
}

/** ?off=<tok>（或 localStorage darkrock_cine_off 含 tok）：按逗号分隔的整词匹配 */
const OFF_TOK = new Map<string, boolean>();
function offTok(tok: string): boolean {
  let v = OFF_TOK.get(tok);
  if (v === undefined) {
    v = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      v = `${q},${ls}`.split(',').map(x => x.trim()).includes(tok);
    } catch { v = false; }
    OFF_TOK.set(tok, v);
  }
  return v;
}
/** 11-19 旗面摆动换秋林逆光 Demo 原式（?off=flagdemo 回 11-16 旧摆动） */
export function flagDemoOn(): boolean { return !offTok('flagdemo'); }
/** 11-19 旗面换样子（秋林逆光 bannerTex 画法：Demo 纤维纹、金边、圆环徽记 + 褪色 / 磨损 / 毛边 / 破洞；竖幡加横杆、下摆改 Demo 尖角）。?off=flagskin 回旧样子 */
export function flagSkinOn(): boolean { return !offTok('flagskin'); }

// ---------------------------------------------------------------- 时间 / 风：草木节拍器不在时自己推
const DEF_WIND = { s: 0.5, h: 0.8 };
let selfT = 0, selfLast = -1;
function flagTick() {
  const now = performance.now() / 1000;
  if (now - FF_SHARED.lastTick < 0.25) { selfLast = now; return; }   // field_flora 的节拍器在跑：用它的风
  const dt = selfLast < 0 ? 0 : Math.min(0.1, Math.max(0, now - selfLast)); selfLast = now;
  if (dt === 0 && selfT > 0) return;
  selfT += dt;
  const U = FF_SHARED.U, W = U.uFfWind.value, A = U.uFfAir.value;
  const head = DEF_WIND.h + 0.35 * Math.sin(selfT * 0.013) + 0.2 * Math.sin(selfT * 0.031 + 1.3);
  W.set(Math.cos(head), Math.sin(head), DEF_WIND.s, selfT);
  A.x += W.x * (2.2 + 3 * DEF_WIND.s) * dt; A.y += W.y * (2.2 + 3 * DEF_WIND.s) * dt;
}

// ---------------------------------------------------------------- 顶点：布料形变
const flagGLSL = (lo: boolean) => /* glsl */ `
uniform vec2 uFlSize;
vec3 flagW(vec2 q, vec3 P0top, float t, vec2 d, float s, float g, float ph){
  // q.x = 离杆距离（0..L），q.y = 离旗顶向下（0..H）
  float L = uFlSize.x, H = uFlSize.y, u = q.x / L;
  float sg = s * g;
  float ext = clamp(0.25 + sg * 1.25, 0.25, 1.0);                       // 展开度：1 = 平展，越小越下垂贴杆
  vec3 A = normalize(vec3(d.x * ext, -(1.0 - ext) * 1.35 - 0.06, d.y * ext));
  vec3 N = normalize(vec3(-d.y, 0.0, d.x));                            // 水平垂直于风向
  float om = 3.3 * (0.75 + 0.7 * sg), k = 6.2832 / max(L * 1.6, 0.2);   // 11-16 Rhett「旗子飘动很怪」：原 0.9–3.3 周/秒又短波，像抽搐；按秋林逆光改成约 0.4–0.75 周/秒、一面旗约 0.6 个波长
  float amp = (0.05 + 0.17 * sg) * L * pow(u, 1.25);
  float wv = sin(k * q.x - om * t + q.y * 0.9 + ph);
  ${lo ? '' : 'wv = 0.78 * wv + 0.22 * sin(2.1 * k * q.x - 1.7 * om * t + q.y * 2.3 + ph * 1.3);'}
  vec3 p = P0top + vec3(0.0, -q.y, 0.0) + A * q.x * (1.0 - 0.05 * abs(wv) * u);
  p += N * wv * amp;
  p.y += ${lo ? '0.0' : 'sin(om * 0.8 * t - k * 0.7 * q.x + 1.3 + ph) * 0.025 * L * u * (0.4 + sg)'};
  p.y -= (1.0 - ext) * 0.12 * u * (q.y / H) * L;                          // 风弱时下角多垂一点
  return p;
}
`;
const flagMain = (lo: boolean, normals: boolean) => /* glsl */ `
{
  vec3 P0top = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float t = uFfWind.w, s = uFfWind.z; vec2 d = uFfWind.xy;
  float g = ffGust(P0top.xz), ph = 6.2832 * ffH(P0top.xz);
  vec2 q = vec2(max(position.x, 0.0), max(-position.y, 0.0));
  vec3 wp = flagW(q, P0top, t, d, s, g, ph);
  ${normals ? (lo ? `vec3 fA = normalize(vec3(d.x, 0.0, d.y)); vec3 fN = normalize(cross(fA, vec3(0.0, -1.0, 0.0)));`
    : `vec3 wx = flagW(q + vec2(0.02, 0.0), P0top, t, d, s, g, ph), wy = flagW(q + vec2(0.0, 0.02), P0top, t, d, s, g, ph);
  vec3 fN = normalize(cross(wx - wp, wy - wp));`) + `
  vFlN = normalize(transpose(mat3(modelMatrix)) * fN);
  vFlT = (inverse(modelMatrix) * vec4(wp, 1.0)).xyz;` : 'transformed = (inverse(modelMatrix) * vec4(wp, 1.0)).xyz;'}
}`;

// ---------------------------------------------------------------- 11-19 flagdemo：秋林逆光 Demo wind 'flag' 原式
//   Demo（src.html 第 113 行）：hang = clamp(-position.y, 0, 2)（离旗顶向下），x = 离旗杆一边的距离，g = gustAt(旗的位置)
//     D.xz += WDIR·hang·(.12 + .38g)
//     D    += perp(WDIR)·sin(uTime·3.3 − hang·2.6 + x·2.2)·.10·(hang·.8 + x·.5)·(.5 + g)
//     D.y  += sin(uTime·2.7 − x·3 − hang)·.03·hang
//   世界空间位移 D 按 Demo 的 transpose(IM)·D / isc 换回本地。游戏多面旗：每面加一个位置哈希相位 ph（Demo 只有一面旗）
const flagDemoGLSL = (lo: boolean) => /* glsl */ `
uniform vec2 uFlSize;
float flDemoGust(vec2 p){   // Demo gustAt 原式；阵风图样推进量 = 共享风场 uFfAir.xy（qlwind 开时就是 风向 × 3.2 × t）
  vec2 q = p - uFfAir.xy;
  float g = ffVn(q * 0.03) * 0.6 + ffVn(q * 0.11 + 7.0) * 0.4;
  float roll = sin(dot(p, uFfWind.xy) * 0.45 - uFfWind.w * 2.2 + ffVn(p * 0.06) * 5.0) * 0.5 + 0.5;
  return clamp(g * 0.8 + roll * g * 0.45 - 0.15, 0.0, 1.0);
}
vec3 flDemoD(vec2 q, float t, vec2 d, float g, float kS, float ph){
  float hang = clamp(q.y, 0.0, 2.0), x = q.x;
  vec3 D = vec3(0.0);
  D.xz += d * hang * (0.12 + 0.38 * g);
  D += vec3(-d.y, 0.0, d.x) * (sin(t * 3.3 - hang * 2.6 + x * 2.2 + ph) * 0.10 * (hang * 0.8 + x * 0.5) * (0.5 + g));
  ${lo ? '' : 'D.y += sin(t * 2.7 - x * 3.0 - hang + ph) * 0.03 * hang;'}
  return D * kS;
}
mat3 flIM; vec3 flIsc; float flT, flKS, flG, flPh; vec2 flDir;
vec3 flLocal(vec2 q){ return transpose(flIM) * flDemoD(q, flT, flDir, flG, flKS, flPh) / flIsc; }
`;
const flagDemoMain = (lo: boolean, normals: boolean) => /* glsl */ `
{
  flIM = mat3(modelMatrix); vec3 flP = modelMatrix[3].xyz;
  flIsc = vec3(dot(flIM[0], flIM[0]), dot(flIM[1], flIM[1]), dot(flIM[2], flIM[2]));
  flT = uFfWind.w; flDir = uFfWind.xy; flKS = clamp(0.55 + 0.45 * uFfWind.z, 0.55, 1.0);
  flG = flDemoGust(flP.xz); flPh = 6.2832 * ffH(flP.xz);
  vec2 q = vec2(max(position.x, 0.0), max(-position.y, 0.0));
  vFlD = flLocal(q);
  ${normals && !lo ? `{ vec3 tx = vec3(0.02, 0.0, 0.0) + flLocal(q + vec2(0.02, 0.0)) - vFlD, ty = vec3(0.0, -0.02, 0.0) + flLocal(q + vec2(0.0, 0.02)) - vFlD;
    objectNormal = normalize(cross(ty, tx)); }` : ''}
}`;
/** Demo 透光原式（patchMat trans:0.6，lights_fragment_begin 之后加到 directDiffuse）；r170 变量名 geometryNormal / geometryViewDir；
 *  方向光只有一盏时 directLight 就是它（含阴影，与 Demo 一致），多盏时取第一盏（太阳）不含阴影；上限 1.0 防高曝光场景发白 */
const FLAG_DEMO_TRANS = /* glsl */ `#include <lights_fragment_begin>
  #if NUM_DIR_LIGHTS > 0
  { IncidentLight flL;
    #if NUM_DIR_LIGHTS == 1
      flL = directLight;
    #else
      getDirectionalLightInfo(directionalLights[0], flL);
    #endif
    float bk = max(-dot(geometryNormal, flL.direction), 0.0), fw = pow(max(dot(-geometryViewDir, flL.direction), 0.0), 4.0);
    vec3 tc = material.diffuseColor * vec3(1.15, 1.0, 0.55) + vec3(0.10, 0.07, 0.0);
    reflectedLight.directDiffuse += min(flL.color * tc * RECIPROCAL_PI * 0.6 * (bk * 1.25 + fw * 3.4), vec3(1.0)); }
  #endif`;

/** CPU 版同一式（船旗等合并几何用）：gust = Demo gustAt（时间 t，阵风图样按 Demo 3.2 m/s 顺风推进） */
function vnCPU(x: number, z: number) {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
/** 共享风场当前风向（xy = 风吹向，z = 强度，w = 时间） */
export function flagWind(): THREE.Vector4 { return FF_SHARED.U.uFfWind.value; }
export function flagDemoGust(px: number, pz: number, t: number, dx: number, dz: number): number {
  const qx = px - dx * t * 3.2, qz = pz - dz * t * 3.2;
  const g = vnCPU(qx * 0.03, qz * 0.03) * 0.6 + vnCPU(qx * 0.11 + 7, qz * 0.11 + 7) * 0.4;
  const roll = Math.sin((px * dx + pz * dz) * 0.45 - t * 2.2 + vnCPU(px * 0.06, pz * 0.06) * 5) * 0.5 + 0.5;
  return Math.min(1, Math.max(0, g * 0.8 + roll * g * 0.45 - 0.15));
}
/** Demo 位移（x = 离杆距离，hang = 离旗顶向下；d = 风向；perp = (−d.y, 0, d.x)），写进 out（同一坐标系） */
export function flagDemoDisp(x: number, hang: number, t: number, dx: number, dz: number, g: number, out: THREE.Vector3, kS = 1, ph = 0): THREE.Vector3 {
  hang = Math.min(2, Math.max(0, hang));
  const a = hang * (0.12 + 0.38 * g), w = Math.sin(t * 3.3 - hang * 2.6 + x * 2.2 + ph) * 0.10 * (hang * 0.8 + x * 0.5) * (0.5 + g);
  return out.set((dx * a - dz * w) * kS, Math.sin(t * 2.7 - x * 3 - hang + ph) * 0.03 * hang * kS, (dz * a + dx * w) * kS);
}

function patchFlag(m: THREE.Material, lo: boolean, depth: boolean, size: { value: THREE.Vector2 }) {
  if (flagDemoOn()) return patchFlagDemo(m, lo, depth, size);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, FF_SHARED.U, { uFlSize: size });
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + FF_SHARED.glsl + flagGLSL(lo) + (depth ? '' : 'vec3 vFlN; vec3 vFlT;'), 'flag.common');
    if (!depth) {
      sh.vertexShader = cinePatch(sh.vertexShader, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + flagMain(lo, true) + '\nobjectNormal = vFlN;', 'flag.beginnormal');
      sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vFlT;', 'flag.begin_vertex');
    } else sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\n' + flagMain(lo, false), 'flag.begin_vertex');
    if (!depth) sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      { vec3 Vv = normalize(vViewPosition); float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 2.0);
        reflectedLight.indirectDiffuse += min(diffuseColor.rgb * vec3(1.1, 1.0, 0.85) * directionalLights[0].color * 0.95 * back, vec3(0.8)); }   // 背光透光
      #endif`, 'flag.trans');
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|flag' + (lo ? 'lo' : 'hi') + (depth ? 'd' : '');
  m.needsUpdate = true;
  return m;
}

function patchFlagDemo(m: THREE.Material, lo: boolean, depth: boolean, size: { value: THREE.Vector2 }) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, FF_SHARED.U, { uFlSize: size });
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + FF_SHARED.glsl + flagDemoGLSL(lo) + 'vec3 vFlD;', 'flagd.common');
    if (!depth) {
      sh.vertexShader = cinePatch(sh.vertexShader, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + flagDemoMain(lo, true), 'flagd.beginnormal');
      sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += vFlD;', 'flagd.begin_vertex');
      sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_begin>', FLAG_DEMO_TRANS, 'flagd.trans');
    } else sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\n' + flagDemoMain(lo, false) + '\ntransformed += vFlD;', 'flagd.begin_vertex');
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|flagd' + (lo ? 'lo' : 'hi') + (depth ? 'd' : '');
  m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------- 贴图：织物纹 + 暗边 + 金色纹章，自由端燕尾 / 三角旗
const TEX = new Map<string, THREE.CanvasTexture>();
type ClothKind = 'banner' | 'pennant' | 'flag';
function clothTex(color: THREE.Color, kind: ClothKind): THREE.CanvasTexture {
  const key = kind + color.getHexString(); const hit = TEX.get(key); if (hit) return hit;
  const W = kind === 'banner' ? 192 : 128, H = kind === 'banner' ? 256 : kind === 'flag' ? 88 : 80, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, c = color.clone().convertLinearToSRGB();
  const rgb = (k: number) => `rgb(${Math.min(255, c.r * 255 * k) | 0},${Math.min(255, c.g * 255 * k) | 0},${Math.min(255, c.b * 255 * k) | 0})`;
  g.fillStyle = rgb(1); g.fillRect(0, 0, W, H);
  let sd = 7; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < W * H / 6; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; g.fillRect(R() * W, R() * H, R() < 0.5 ? 1 : 3, R() < 0.5 ? 3 : 1); }   // 织物纹
  for (let y = 0; y < H; y += 2) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(0, y, W, 1); }
  g.fillStyle = rgb(0.55); g.fillRect(0, 0, 10, H);                   // 穿杆的套边（靠杆一侧）
  if (kind === 'banner') {
    g.strokeStyle = '#d8a83c'; g.lineWidth = 6; g.strokeRect(16, 9, W - 32 - 22, H - 18);   // 金边
    g.save(); g.translate(W * 0.44, H * 0.42);
    g.strokeStyle = '#e8b848'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f0c850'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); } g.closePath(); g.fill();
    g.restore();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(W + 1, H * 0.5 - 72); g.lineTo(W - 40, H * 0.5); g.lineTo(W + 1, H * 0.5 + 72); g.closePath(); g.fill();   // 燕尾
  } else if (kind === 'flag') {   // 11-17e 横旗（钟楼领地建筑旗）：金边 + 钟形纹章，自由端浅燕尾
    g.strokeStyle = '#d8a83c'; g.lineWidth = 4; g.strokeRect(14, 6, W - 14 - 18, H - 12);
    g.save(); g.translate(W * 0.47, H * 0.5); g.fillStyle = '#f0c850';
    g.beginPath(); g.moveTo(-11, 12); g.quadraticCurveTo(-11, -14, 0, -15); g.quadraticCurveTo(11, -14, 11, 12); g.closePath(); g.fill();   // 钟身
    g.fillRect(-14, 11, 28, 4); g.beginPath(); g.arc(0, 18, 3.5, 0, Math.PI * 2); g.fill(); g.restore();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(W + 1, H * 0.5 - 30); g.lineTo(W - 16, H * 0.5); g.lineTo(W + 1, H * 0.5 + 30); g.closePath(); g.fill();
  } else {
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H * 0.5); g.lineTo(0, H); g.lineTo(W + 1, H + 1); g.lineTo(W + 1, -1); g.closePath(); g.fill();   // 三角旗
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.set(key, t); return t;
}

// ---------------------------------------------------------------- 11-19 flagskin：参考秋林逆光 bannerTex 重画（各旗仍用自己的阵营色 + 原纹章类别）
//   Demo bannerTex（src.html 第 251–258 行）：底色 → 4000 条竖向细纤维（暗 / 亮两档、透明 .06、2×4–14 px）→ 金边 strokeRect(14,14,W−28,H−60) 线宽 10
//     → 下摆两角切掉成尖角 → 圆环 r64 线宽 9 + 三支卷须 + 中心圆点。游戏另加：靠杆套边 + 缝线、晒褪（自由端 / 下摆发白）、下摆污渍、
//     金线磨损斑点、补丁、自由边毛边缺口、一两个小破洞（alphaTest 0.5 镂空）。纹章：竖幡 = Demo 卷须环，横旗（钟楼领地）= 环 + 钟，三角旗 = 金中线 + 小环
const GOLD = '#e4b24a', GOLD2 = '#d6a640';
function clothTexSkin(color: THREE.Color, kind: ClothKind): THREE.CanvasTexture {
  const key = 'skin' + kind + color.getHexString(); const hit = TEX.get(key); if (hit) return hit;
  const W = kind === 'pennant' ? 128 : 256, H = kind === 'banner' ? 320 : kind === 'flag' ? 160 : 68;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, c = color.clone().convertLinearToSRGB();
  const rgb = (k: number, a = 1) => `rgba(${Math.min(255, c.r * 255 * k + (k > 1 ? 14 : 0)) | 0},${Math.min(255, c.g * 255 * k + (k > 1 ? 10 : 0)) | 0},${Math.min(255, c.b * 255 * k + (k > 1 ? 6 : 0)) | 0},${a})`;
  let sd = 11 + ((c.r * 255) | 0) * 7 + ((c.b * 255) | 0) * 3; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const sl = kind === 'pennant' ? 8 : 12;   // 套边宽
  // 底色 + Demo 纤维
  g.fillStyle = rgb(1); g.fillRect(0, 0, W, H);
  for (let i = 0, n = (W * H / 33) | 0; i < n; i++) { g.fillStyle = R() < 0.5 ? rgb(0.32, 0.06) : rgb(1.6, 0.06); g.fillRect(R() * W, R() * H, 2, 4 + R() * 10); }
  for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y, W, 1); }   // 纬线
  // 套边 + 缝线
  g.fillStyle = rgb(0.55); g.fillRect(0, 0, sl, H);
  g.strokeStyle = 'rgba(255,236,190,0.35)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(sl + 2.5, 0); g.lineTo(sl + 2.5, H); g.stroke(); g.setLineDash([]);
  // 金边 + 纹章
  g.lineJoin = 'round'; g.lineCap = 'round';
  const ring = (cx: number, cy: number, r: number, lw: number) => { g.strokeStyle = GOLD; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); };
  if (kind === 'banner') {
    const ch = 30;   // Demo 下摆尖角（46 / 512 × H）
    g.strokeStyle = GOLD2; g.lineWidth = 10; g.strokeRect(sl + 8, 14, W - sl - 8 - 14, H - 14 - ch - 10);
    const cx = (W + sl) / 2, cy = H * 0.36; ring(cx, cy, 58, 9);
    g.lineWidth = 7; for (let i = 0; i < 3; i++) { g.save(); g.translate(cx, cy); g.rotate(i * 2.094); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(27, -9, 36, -36, 9, -47); g.stroke(); g.restore(); }
    g.fillStyle = GOLD; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
    // 补丁（下半，略浅 + 虚线缝）
    const px = W * 0.58, py = H * 0.66, pw = 34, ph = 26; g.fillStyle = rgb(1.18, 0.9); g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 1.2; g.setLineDash([3, 2]); g.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5); g.setLineDash([]);
  } else if (kind === 'flag') {
    g.strokeStyle = GOLD2; g.lineWidth = 6; g.strokeRect(sl + 6, 8, W - sl - 6 - 26, H - 16);
    const cx = W * 0.5, cy = H * 0.5; ring(cx, cy, 40, 6);
    g.save(); g.translate(cx, cy); g.fillStyle = GOLD;   // 钟（钟楼领地原纹章）
    g.beginPath(); g.moveTo(-15, 15); g.quadraticCurveTo(-15, -19, 0, -21); g.quadraticCurveTo(15, -19, 15, 15); g.closePath(); g.fill();
    g.fillRect(-19, 14, 38, 5); g.beginPath(); g.arc(0, 23, 4.5, 0, Math.PI * 2); g.fill(); g.restore();
  } else {
    g.fillStyle = GOLD2; g.beginPath(); g.moveTo(sl, H * 0.5 - 4); g.lineTo(W, H * 0.5 - 0.5); g.lineTo(W, H * 0.5 + 0.5); g.lineTo(sl, H * 0.5 + 4); g.closePath(); g.fill();
    ring(sl + 16, H * 0.5, 9, 3.5);
  }
  // 金线磨损：同底色小斑点盖在上面（金色处可见，底色处看不出）
  for (let i = 0, n = (W * H / 45) | 0; i < n; i++) { g.fillStyle = rgb(R() < 0.5 ? 0.85 : 1, 0.45); g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
  // 晒褪：自由端 / 下摆发白；下摆污渍
  const fa = g.createLinearGradient(sl, 0, W, H * 0.5); fa.addColorStop(0, 'rgba(238,224,196,0)'); fa.addColorStop(0.5, 'rgba(238,224,196,0.06)'); fa.addColorStop(1, 'rgba(238,224,196,0.2)');
  g.fillStyle = fa; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, H * 0.7, 0, H); gr.addColorStop(0, 'rgba(45,32,18,0)'); gr.addColorStop(1, 'rgba(45,32,18,0.24)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 外形 + 毛边 + 破洞（destination-out）
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  const nick = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const fray = (x0: number, y0: number, x1: number, y1: number, step: number, rMax: number) => {
    const L = Math.hypot(x1 - x0, y1 - y0); for (let d = 0; d < L; d += step) if (R() < 0.55) nick(x0 + (x1 - x0) * d / L, y0 + (y1 - y0) * d / L, 1 + R() * rMax);
  };
  if (kind === 'banner') {
    const ch = 30; g.beginPath(); g.moveTo(0, H - ch); g.lineTo(W / 2, H); g.lineTo(W, H - ch); g.lineTo(W + 1, H + 1); g.lineTo(-1, H + 1); g.closePath(); g.fill();   // Demo 尖角下摆
    fray(sl, H - ch * (1 - sl / (W / 2)), W / 2, H, 5, 3.5); fray(W / 2, H, W, H - ch, 5, 3.5); fray(W, 0, W, H - ch, 7, 2.5);
    for (let i = 0; i < 2; i++) { const hx = W * (0.62 + 0.22 * R()), hy = H * (0.72 + 0.12 * R()); nick(hx, hy, 2.5 + R() * 2); }
  } else if (kind === 'flag') {
    g.beginPath(); g.moveTo(W + 1, H * 0.5 - 34); g.lineTo(W - 18, H * 0.5); g.lineTo(W + 1, H * 0.5 + 34); g.closePath(); g.fill();   // 浅燕尾（原样保留）
    fray(W, 0, W, H * 0.5 - 34, 6, 2.5); fray(W, H * 0.5 + 34, W, H, 6, 2.5); fray(sl, H, W, H, 7, 2);
    nick(W * 0.8, H * 0.74, 2.5 + R() * 1.5);
  } else {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H * 0.5); g.lineTo(0, H); g.lineTo(W + 1, H + 1); g.lineTo(W + 1, -1); g.closePath(); g.fill();   // 三角旗
    fray(sl, 0, W, H * 0.5, 6, 2); fray(sl, H, W, H * 0.5, 6, 2);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = kind === 'banner' ? 8 : 4;
  TEX.set(key, t); return t;
}
/** 竖幡的横杆（Demo 旗杆上的横担，合批前加进旗杆组，跟旗杆一起烘焙） */
let barGeo: THREE.CylinderGeometry | null = null, barMat: THREE.MeshStandardMaterial | null = null;
function crossbar(L: number): THREE.Mesh {
  barGeo ??= new THREE.CylinderGeometry(0.025, 0.03, 1, 6); barMat ??= new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8, metalness: 0 });
  const m = new THREE.Mesh(barGeo, barMat); m.name = 'flagbar'; m.rotation.z = Math.PI / 2; m.scale.set(1, L + 0.2, 1); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- 主入口：在合批前调用
export const fieldFlagsStats = { flags: 0 };
function makeCloth(L: number, H: number, color: THREE.Color, kind: ClothKind, emissive = 0): THREE.Mesh {
  const lo = curQuality === 'low';
  const sx = lo ? 6 : kind === 'banner' ? 16 : 10, sy = lo ? 4 : kind === 'banner' ? 14 : kind === 'flag' ? 7 : 5;
  const geo = new THREE.PlaneGeometry(L, H, sx, sy); geo.translate(L / 2, -H / 2, 0);   // 旗杆边在 x = 0，旗顶在 y = 0
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -H * 0.5, 0), L + H);
  const mat = new THREE.MeshStandardMaterial({ map: flagSkinOn() ? clothTexSkin(color, kind) : clothTex(color, kind), side: THREE.DoubleSide, roughness: 0.88, metalness: 0, alphaTest: 0.5, envMapIntensity: 0.6 });
  if (emissive > 0) { mat.emissive.copy(color); mat.emissiveMap = mat.map; mat.emissiveIntensity = emissive; }   // 暗场景（镜渊城）原旗自带微光，保留
  mat.userData.noBake = true;
  const u = { value: new THREE.Vector2(L, H) };   // 每面旗自己的材质与尺寸 uniform（同一程序，切材质时上传）
  patchFlag(mat, lo, false, u);
  const depth = patchFlag(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5, side: THREE.DoubleSide }), lo, true, u);
  const m = new THREE.Mesh(geo, mat); m.name = 'flagcloth'; m.customDepthMaterial = depth as THREE.MeshDepthMaterial;
  m.castShadow = true; m.receiveShadow = true; m.userData.noBake = true; m.userData.dynDone = true;
  m.onBeforeRender = flagTick;
  return m;
}
/** 11-17e 给别的地图直接造一面摆动旗（旗杆边在本地 x = 0、旗顶 y = 0，调用方把它放到杆顶）。
 *  emissive：自发光倍数（暗场景用）。不受 flagWireOn 管，调用方自己判断开关 */
export function makeFlagCloth(L: number, H: number, color: THREE.ColorRepresentation, kind: ClothKind = 'flag', emissive = 0): THREE.Mesh {
  const m = makeCloth(L, H, new THREE.Color(color), kind, emissive); fieldFlagsStats.flags++; return m;
}
/**
 * 把 root 下的旗帜换成布料摆动版（调用方在 bakeStatic 之前调用）：
 *   · makeBanner 的 'cloth'（0.8×1.4 竖幡）→ 隐藏原布片、去掉原纹章片，旗杆顶下挂一面燕尾旗
 *   · makeTent 顶上的 0.5×0.3 小旗 → 三角旗
 */
export function upgradeFlags(root: THREE.Object3D): number {
  if (!fieldFlagsOn()) return 0;
  const cloths: THREE.Mesh[] = [], pennants: THREE.Mesh[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || !m.parent) return;
    if (m.name === 'cloth' && !m.userData.flagDone) cloths.push(m);
    const p = (m.geometry as THREE.PlaneGeometry).parameters as { width?: number; height?: number } | undefined;
    if (!m.name && p && p.width === 0.5 && p.height === 0.3 && Math.abs(m.position.y - 3.3) < 0.01 && !m.userData.flagDone) pennants.push(m);
  });
  let n = 0;
  for (const c of cloths) {
    const g = c.parent!, col = ((c.material as THREE.MeshToonMaterial).color ?? new THREE.Color(0x884422)).clone();
    c.visible = false; c.userData.flagDone = true;
    for (const s of [...g.children]) { const sm = s as THREE.Mesh; if (sm.isMesh && (sm.geometry as THREE.CircleGeometry).type === 'CircleGeometry' && Math.abs(sm.position.y - 2.9) < 0.05) g.remove(sm); }   // 原纹章（画进旗面了）
    const f = makeCloth(1.0, 1.25, col, 'banner'); f.position.set(0.05, 3.5, 0); g.add(f); n++;
    if (flagSkinOn()) { const b = crossbar(1.0); b.position.set(0.5, 3.515, 0); g.add(b); }   // 11-19 flagskin：Demo 横担
  }
  for (const p of pennants) {
    const g = p.parent!, col = ((p.material as THREE.MeshToonMaterial).color ?? new THREE.Color(0xc0392b)).clone();
    p.visible = false; p.userData.flagDone = true;
    const f = makeCloth(0.62, 0.32, col, 'pennant'); f.position.set(0.04, 3.44, 0); g.add(f); n++;
  }
  fieldFlagsStats.flags += n;
  return n;
}
