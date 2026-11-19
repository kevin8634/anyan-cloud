// 11-15 钟井井壁 v2（Rhett 02:12：之前那版丑 → 先出 GPT 效果图 concepts/well/wall_*.png，再用代码模仿）
//   参照图要点：大块粗凿石砌（层高 0.22–0.5 米、块长 0.45–1.5 米、错缝不齐、砖面鼓起且各自凸凹）、
//   边角崩缺、深黑的灰缝、上沿和缝里长青苔、零星地衣斑、越往下越湿越暗越亮（湿反光）、偶有整片塌落露出碎石。
//   做法（专长第 7、12、13、28、38、79 步）：
//   1) bakeStone()：JS 一次性画 8 m × 4 m 的无缝石墙贴图（反照率 / 高度 / 法线 / 青苔遮罩），高画质 2048×1024，中画质 1024×512。
//   2) stoneWallMat()：MeshStandard + 世界坐标圆柱 UV（角度×半径, 高度），视差遮蔽（高 12 步 / 中 6 步），
//      大尺度色差、湿度渐变（反照率^1.6、粗糙度→0.18）、渗水条纹、整片塌落区（露碎石）、远处按每像素米数淡到平均色（防闪）。
//   低画质不用（走原 tiletex 纯色回退）。
import * as THREE from 'three';

const TW = 8, TH = 4;   // 贴图覆盖的米数（无缝）
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function vnoise(seed: number, W: number, H: number, cell: number) {   // 可平铺值噪声
  const gw = Math.max(1, Math.round(W / cell)), gh = Math.max(1, Math.round(H / cell)), R = rng(seed), g = new Float32Array(gw * gh).map(() => R());
  return (x: number, y: number) => { const fx = x / W * gw, fy = y / H * gh, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), a = (i: number, j: number) => g[((j % gh + gh) % gh) * gw + ((i % gw + gw) % gw)];
    return (a(ix, iy) * (1 - sx) + a(ix + 1, iy) * sx) * (1 - sy) + (a(ix, iy + 1) * (1 - sx) + a(ix + 1, iy + 1) * sx) * sy; };
}

export type StoneTex = { map: THREE.Texture; nrm: THREE.Texture; ht: THREE.Texture; avg: THREE.Color };
let cache: { [k: number]: StoneTex } = {};

export function bakeStone(W = 2048): StoneTex {
  if (cache[W]) return cache[W];
  const H = W / 2, ppm = W / TW, R = rng(77);
  // 砌层：层高 0.22–0.5 米，总和 = TH
  const rows: { y0: number; h: number; blocks: { x0: number; w: number; tone: number; bulge: number; tiltX: number; tiltY: number; moss: number; hue: number; dt: number; db: number; sl: number; il: number; ir: number; rd: number }[] }[] = [];
  let y = 0;
  while (y < TH - 0.34) { let h = 0.34 + Math.pow(R(), 1.3) * 0.4; if (TH - y - h < 0.34) h = TH - y; rows.push({ y0: y, h, blocks: [] }); y += h; }
  for (const r of rows) { let x = R() * 1.2; const x0 = x;
    while (x < x0 + TW - 0.6) { let w = 0.6 + Math.pow(R(), 0.8) * 1.3; if (x0 + TW - x - w < 0.6) w = x0 + TW - x;
      r.blocks.push({ x0: x, w, tone: 0.7 + R() * 0.55, bulge: 0.5 + R() * 0.5, tiltX: (R() - 0.5) * 0.5, tiltY: (R() - 0.5) * 0.4, moss: R(), hue: R(), dt: -R() * 0.03, db: R() * 0.025, sl: (R() - 0.5) * 0.07, il: R() * 0.01, ir: R() * 0.01, rd: 0.015 + R() * 0.045 }); x += w; } }
  const C = (m: number) => m * ppm;   // 噪声格子按米算（与分辨率无关）
  const n1 = vnoise(11, W, H, C(0.09)), n2 = vnoise(12, W, H, C(0.22)), n3 = vnoise(13, W, H, C(0.6)), n4 = vnoise(14, W, H, C(0.012)), nM = vnoise(15, W, H, C(0.9)), nL = vnoise(16, W, H, C(0.07));
  const n5 = vnoise(17, W, H, C(0.035)), n6 = vnoise(18, W, H, C(0.16)), nF = vnoise(19, W, H, C(0.02));
  const alb = new Uint8ClampedArray(W * H * 4), hgt = new Float32Array(W * H), mos = new Float32Array(W * H);
  const sat = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v, sm = (a: number, b: number, v: number) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  for (let py = 0; py < H; py++) {
    const ym = (py + 0.5) / ppm;   // 贴图第 0 行 = 底（flipY=false，v=0）
    for (let px = 0; px < W; px++) {
      const xm = (px + 0.5) / ppm, i = py * W + px;
      // 边缘扰动：块边不是直线（崩缺）
      const jx = (n1(px, py) - 0.5) * 0.06 + (n5(px, py) - 0.5) * 0.025, jy = (n1(px + 333, py + 77) - 0.5) * 0.05 + (n5(px + 91, py) - 0.5) * 0.02;
      const yy = ((ym + jy) % TH + TH) % TH; let ri = 0; while (ri < rows.length - 1 && yy >= rows[ri].y0 + rows[ri].h) ri++;
      const row = rows[ri]; const bx0 = row.blocks[0].x0; let xx = xm + jx; while (xx < bx0) xx += TW; while (xx >= bx0 + TW) xx -= TW;
      let bi = 0; while (bi < row.blocks.length - 1 && xx >= row.blocks[bi].x0 + row.blocks[bi].w) bi++;
      const b = row.blocks[bi], u = (xx - b.x0) / b.w;
      // 每块自己的上下沿（下沉 / 上抬 / 斜）和左右内缩 → 灰缝宽窄不一，砌得不齐
      const bt = row.y0 + row.h + b.dt + b.sl * (u - 0.5), bb = row.y0 + b.db - b.sl * (u - 0.5) * 0.5, bl0 = b.x0 + b.il, br0 = b.x0 + b.w - b.ir;
      const v = (yy - bb) / Math.max(bt - bb, 0.05);
      const exl = xx - bl0, exr = br0 - xx, eyb = yy - bb, eyt = bt - yy;
      const ex = Math.min(exl, exr), ey = Math.min(eyb, eyt), e = Math.min(ex, ey);
      // 角上崩缺：靠角处额外削掉；角做圆（rd）
      const corner = Math.min(Math.hypot(Math.max(0, b.rd - ex), Math.max(0, b.rd - ey)), 1);
      const round = Math.max(0, corner - b.rd * 0.1);
      const chip = sm(0.45, 0.8, n2(px + bi * 97, py + ri * 31)) * (1 - sm(0.03, 0.2, e)) * 1.0;
      const gap = 0.002 + n6(px, py + 500) * 0.009;                 // 灰缝半宽
      const eR = (ex >= b.rd || ey >= b.rd) ? e : b.rd - Math.hypot(b.rd - ex, b.rd - ey);
      const edgeT = sm(gap, gap + 0.035, eR - chip * 0.07);
      // 砖面：鼓起 + 微倾 + 粗凿颗粒
      const dome = Math.sqrt(sat(1 - Math.pow(2 * u - 1, 4))) * Math.sqrt(sat(1 - Math.pow(2 * sat(v) - 1, 4)));
      const grain = n4(px, py) * 0.35 + n5(px, py) * 0.35 + n6(px, py) * 0.3;
      const facet = 1 - Math.abs(n6(px + 17, py + 9) * 2 - 1);            // 凿面：脊状噪声
      let h = edgeT * (0.45 + 0.35 * dome * b.bulge + b.tiltX * (u - 0.5) * 0.35 + b.tiltY * (v - 0.5) * 0.35 + (grain - 0.5) * 0.18 + facet * 0.12 - chip * 0.3);
      h = Math.max(h, (1 - edgeT) * n4(px + 7, py) * 0.08);          // 灰缝底：碎渣
      hgt[i] = sat(h);
      // 颜色：灰 / 灰绿 / 灰褐，块间色差 + 颗粒；灰缝近黑
      const base = b.hue < 0.45 ? [0.13, 0.135, 0.125] : b.hue < 0.8 ? [0.11, 0.125, 0.105] : [0.15, 0.14, 0.12];
      const speck = nF(px, py), t = b.tone * (0.72 + 0.45 * grain) * (0.8 + 0.4 * n3(px, py)) * (0.85 + 0.3 * sat(v)) * (0.9 + 0.25 * (speck - 0.5) * 2);
      const mot = 0.62 + 0.55 * n2(px + bi * 13, py) * n6(px, py + ri * 7) + 0.25 * (n1(px + 9, py) - 0.5);
      let r = base[0] * t * mot, g = base[1] * t * mot, bl = base[2] * t * mot * 0.97;
      const stain = sm(0.55, 0.9, n2(px + 400, py)) * (1 - sat(v)) * 0.5;   // 砖下半部水渍
      r *= 1 - stain * 0.5; g *= 1 - stain * 0.45; bl *= 1 - stain * 0.4;
      const lich = sm(0.6, 0.85, nL(px, py)) * sm(0.45, 0.75, n5(px + 77, py)) * 0.45;                    // 地衣斑：灰白 / 黄绿
      r = r + (0.55 - r) * lich * 0.5; g = g + (0.56 - g) * lich * 0.5; bl = bl + (0.45 - bl) * lich * 0.45;
      // 青苔：块上沿（v 大）+ 灰缝里 + 大片噪声，砖面凹处多
      const top = sm(0.6, 0.97, v) * sm(0.2, 0.6, b.moss) * sm(0.35, 0.6, n2(px + 50, py)), seam = (1 - edgeT) * 0.8, patch = sm(0.55, 0.72, nM(px, py)) * sm(0.35, 0.6, n2(px, py + 90));
      let m = sat(Math.max(top * (0.6 + 0.5 * n2(px + 9, py)), seam * sm(0.4, 0.6, nM(px + 200, py)), patch * (0.5 + 0.5 * n1(px, py + 40))) * (0.55 + 0.35 * n5(px + 3, py + 3) + 0.3 * n4(px, py + 7)));
      m = sat(m * 1.6 - (1 - n4(px + 5, py + 9)) * 0.55 - (1 - n5(px, py + 21)) * 0.35); m = sm(0.0, 0.6, m) * (0.35 + 0.65 * edgeT); mos[i] = m;
      const mg = 0.75 + 0.5 * n4(px + 11, py + 5);
      r = r + (0.055 * mg - r) * m; g = g + (0.095 * mg - g) * m; bl = bl + (0.03 * mg - bl) * m;
      const dark = 0.3 + 0.7 * sm(0.0, 0.45, hgt[i]);
      if (edgeT < 0.5) { const k2 = 1 - edgeT * 2, rb = 0.035 + 0.05 * n5(px + 3, py + 8); r = r + (rb * 1.05 - r) * k2; g = g + (rb - g) * k2; bl = bl + (rb * 0.85 - bl) * k2; }                // 灰缝 / 崩缺处暗（烘进 AO）
      r *= dark; g *= dark; bl *= dark;
      alb[i * 4] = Math.pow(sat(r), 1 / 2.2) * 255; alb[i * 4 + 1] = Math.pow(sat(g), 1 / 2.2) * 255; alb[i * 4 + 2] = Math.pow(sat(bl), 1 / 2.2) * 255; alb[i * 4 + 3] = m * 255;
    }
  }
  // 法线（Sobel，砖深 ≈ 6 厘米），高度 → R，青苔 → G
  const nrm = new Uint8Array(W * H * 4), hp = new Uint8Array(W * H * 4), at = (x: number, yy: number) => hgt[((yy + H) % H) * W + ((x + W) % W)];
  const depthPx = 0.12 * ppm;
  let sr = 0, sg = 0, sb = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px;
    const dx = (at(px + 1, py - 1) + 2 * at(px + 1, py) + at(px + 1, py + 1) - at(px - 1, py - 1) - 2 * at(px - 1, py) - at(px - 1, py + 1)) / 8 * depthPx;
    const dy = (at(px - 1, py + 1) + 2 * at(px, py + 1) + at(px + 1, py + 1) - at(px - 1, py - 1) - 2 * at(px, py - 1) - at(px + 1, py - 1)) / 8 * depthPx;
    const l = Math.hypot(dx, dy, 1);
    nrm[i * 4] = (-dx / l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
    hp[i * 4] = hgt[i] * 255; hp[i * 4 + 1] = mos[i] * 255; hp[i * 4 + 3] = 255;
    sr += alb[i * 4]; sg += alb[i * 4 + 1]; sb += alb[i * 4 + 2];
  }
  const mk = (d: ArrayBufferView, srgb: boolean) => { const t = new THREE.DataTexture(d as any, W, H, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.needsUpdate = true; return t; };
  const N = W * H * 255, avg = new THREE.Color(sr / N, sg / N, sb / N).convertSRGBToLinear();
  return (cache[W] = { map: mk(alb, true), nrm: mk(nrm, false), ht: mk(hp, false), avg });
}

export type RubbleSite = { a: number; y: number; r: number };
/** 塌落区（照 GPT 图右侧那片露碎石的缺口）：确定性随机，石材着色器挖暗、well_wall_hd 堆碎石，两边同一份 */
export function wellRubbleSites(y0: number, y1: number, holes: { a: number; y: number; r: number }[], R: number, n = 28): RubbleSite[] {
  const r = rng(31), out: RubbleSite[] = [];
  for (let t = 0; t < n * 8 && out.length < n; t++) {
    const a = (r() - 0.5) * Math.PI * 2, y = y0 + 6 + r() * (y1 - y0 - 12), rr = 1.3 + Math.pow(r(), 1.5) * 2.2;
    if (holes.some(h => Math.hypot(((a - h.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * R, y - h.y) < h.r + rr + 2)) continue;
    if (out.some(o => Math.hypot(((a - o.a + Math.PI * 3) % (Math.PI * 2) - Math.PI) * R, y - o.y) < o.r + rr + 6)) continue;
    out.push({ a, y, r: rr });
  }
  return out;
}

export type StoneOpt = { hi: boolean; top?: number; bottom?: number; side?: THREE.Side; sites?: RubbleSite[] };
/** 井壁石材：圆柱 UV（xz 取模型空间，井轴 = 模型 y 轴；高度取世界 y，与 top / bottom 一致）；模型不可旋转 */
export function stoneWallMat(o: StoneOpt): THREE.MeshStandardMaterial {
  const T = bakeStone(o.hi ? 2048 : 1024), top = o.top ?? 30, bottom = o.bottom ?? -60, steps = o.hi ? 12 : 6;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: o.side ?? THREE.BackSide });
  m.userData.stoneHD = true;
  const sites = (o.sites ?? []).slice(0, 32), sv = Array.from({ length: 32 }, (_, i) => sites[i] ? new THREE.Vector4(sites[i].a, sites[i].y, sites[i].r, i * 7.3) : new THREE.Vector4(0, -9999, 0, 0));
  const U = { stMap: { value: T.map }, stNrm: { value: T.nrm }, stHt: { value: T.ht }, stAvg: { value: T.avg }, stSite: { value: sv }, stTime: { value: 0 } };
  m.onBeforeRender = () => { U.stTime.value = performance.now() / 1000; };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 stW; varying vec3 stP; varying float stLY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nstP = (modelMatrix * vec4(transformed, 1.0)).xyz; stW = vec3(transformed.x, stP.y, transformed.z); stLY = transformed.y;');   // xz 用模型空间（井心 = 原点），y 用世界高度
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D stMap, stNrm, stHt; uniform vec3 stAvg; uniform vec4 stSite[32]; uniform float stTime; varying vec3 stW; varying vec3 stP; varying float stLY;
float stH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float stN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(stH(i), stH(i + vec2(1,0)), f.x), mix(stH(i + vec2(0,1)), stH(i + vec2(1,1)), f.x), f.y); }
float stF(vec2 p){ return stN(p) * 0.55 + stN(p * 2.07 + 3.1) * 0.3 + stN(p * 4.3 + 7.7) * 0.15; }
vec2 stUV, stDX, stDY; float stWet, stMoss, stFade, stRub, stHole, stSeep, stGlint; vec3 stNT, stHN;`)
      .replace('#include <map_fragment>', `
  { // 圆柱展开：u = 弧长（米）/8，v = 高度/4；每 4 米一层整体错位，打散重复
    float ang = atan(stW.z, stW.x), rad = length(stW.xz);
    vec2 wm = vec2(ang * rad, stW.y);
    float band = floor(stW.y / ${TH.toFixed(1)});
    float dAx = dFdx(ang), dAy = dFdy(ang); dAx -= 6.2831853 * floor(dAx / 6.2831853 + 0.5); dAy -= 6.2831853 * floor(dAy / 6.2831853 + 0.5);
    vec2 gX = vec2(dAx * rad, dFdx(stW.y)) / vec2(${TW.toFixed(1)}, ${TH.toFixed(1)}), gY = vec2(dAy * rad, dFdy(stW.y)) / vec2(${TW.toFixed(1)}, ${TH.toFixed(1)});   // 错位前取导数：层缝处不跳最低 mip
    wm.x += stH(vec2(band, 3.0)) * 37.0;
    vec2 uv = wm / vec2(${TW.toFixed(1)}, ${TH.toFixed(1)});
    float mpp = length(fwidth(stP));
    stFade = 1.0 - smoothstep(0.035, 0.12, mpp);                  // 第 12 步：远处淡到平均色
    // 视差遮蔽：视线转到墙面切线空间（切线 = 圆周方向，副切线 = 世界上）
    vec3 Nw = normalize(vec3(-stW.x, 0.0, -stW.z) / max(rad, 1e-3)), Tw = vec3(-sin(ang), 0.0, cos(ang)), Bw = vec3(0.0, 1.0, 0.0);
    vec3 Vw = normalize(cameraPosition - stP); vec3 Vt = vec3(dot(Vw, Tw), dot(Vw, Bw), max(dot(Vw, Nw), 0.15));
    if (stFade > 0.01) { const int NS = ${steps}; float dl = 1.0 / float(NS), cur = 1.0;
      vec2 dUV = -Vt.xy / Vt.z * 0.06 / vec2(${TW.toFixed(1)}, ${TH.toFixed(1)}) * dl * stFade; vec2 p = uv; float hh = textureGrad(stHt, p, gX, gY).r, prevH = hh, prevC = cur;
      for (int i = 0; i < NS; i++) { if (hh >= cur) break; prevH = hh; prevC = cur; p += dUV; cur -= dl; hh = textureGrad(stHt, p, gX, gY).r; }
      float a = (hh - cur), b = (prevH - prevC); float w = clamp(a / (a - b + 1e-4), 0.0, 1.0); uv = mix(p, p - dUV, w); }
    stUV = uv;
    vec4 al = textureGrad(stMap, uv, gX, gY);
    vec3 c = al.rgb;
    // 大尺度：块状色差、整片塌落（露碎石，更暗更糙）、湿度渐变、渗水条纹、青苔带
    float big = stF(wm * 0.05);
    c *= 0.82 + 0.36 * big;
    stRub = smoothstep(0.74, 0.86, stF(wm * vec2(0.08, 0.11) + 13.0));
    float rub = stN(wm * 9.0) * 0.6 + stN(wm * 23.0) * 0.4;
    c = mix(c, vec3(0.13, 0.125, 0.11) * (0.4 + 0.9 * rub), stRub * 0.9);
    float dep = clamp((${top.toFixed(1)} - stW.y) / ${(top - bottom).toFixed(1)}, 0.0, 1.0);
    float stk = smoothstep(0.7, 0.92, stN(vec2(wm.x * 0.9, stW.y * 0.02))) * smoothstep(0.3, 0.7, stF(vec2(wm.x * 0.2, stW.y * 0.1)));
    stWet = clamp(0.25 + dep * 0.75 + stk * (0.4 + 0.5 * dep), 0.0, 1.0);
    stMoss = al.a * (0.55 + 0.45 * smoothstep(0.35, 0.7, stF(wm * 0.04 + 5.0))) * (1.0 - stRub * 0.6);
    float mband = smoothstep(0.1, 0.35, dep) * (1.0 - smoothstep(0.7, 0.98, dep));
    stMoss = max(stMoss * (0.5 + mband), mband * smoothstep(0.62, 0.8, stF(wm * vec2(0.06, 0.09) + 21.0)) * 0.8);
    // 塌落缺口：噪声扰动的不规则边（不做圆），里面是暗的碎石堆，边上一圈断砖暗边
    stHole = 0.0; float rim = 0.0; vec2 hc = vec2(0.0);
    for (int i = 0; i < 32; i++) { vec4 S = stSite[i]; if (S.z <= 0.0) continue;
      float da = ang - S.x; da -= 6.2831853 * floor(da / 6.2831853 + 0.5); vec2 d = vec2(da * rad, stLY - S.y);
      if (abs(d.y) > S.z * 1.8 || abs(d.x) > S.z * 1.8) continue;
      float dn = length(d / vec2(S.z * 1.15, S.z * 0.85)) + (stF(d * 0.9 + S.w) - 0.5) * 0.7 + (stN(d * 4.0 + S.w) - 0.5) * 0.15;
      float h = 1.0 - smoothstep(0.82, 0.92, dn); if (h > stHole) { stHole = h; hc = d; } rim = max(rim, smoothstep(0.75, 0.9, dn) * (1.0 - smoothstep(0.92, 1.1, dn))); }
    if (stHole > 0.0) { vec2 q = wm * 5.5; vec2 iq = floor(q), fq = fract(q); float md = 9.0, md2 = 9.0; vec2 mid = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)), pp = o + vec2(stH(iq + o), stH(iq + o + 17.0)) - fq; float dd = dot(pp, pp); if (dd < md) { md2 = md; md = dd; mid = iq + o; } else if (dd < md2) md2 = dd; }
      float edge = smoothstep(0.0, 0.25, sqrt(md2) - sqrt(md)), tone = 0.5 + 0.6 * stH(mid + 3.0);
      vec3 rc = vec3(0.12, 0.115, 0.1) * tone * (0.25 + 0.75 * edge) * (0.7 + 0.5 * stN(wm * 30.0));
      c = mix(c, rc, stHole); stHN = normalize(vec3((stN(q * 1.7) - 0.5) * 1.6, (stN(q * 1.7 + 9.0) - 0.5) * 1.6, 1.0)); }
    c *= 1.0 - rim * 0.55; stMoss *= 1.0 - stHole;
    // 渗水细流：每 2.6 米一列随机出一条，宽 3–7 厘米、左右摆，水是暗的、极光滑、亮纹往下流
    stSeep = 0.0; stGlint = 0.0;
    { float cw = 1.3, cx = floor(wm.x / cw), hs = stH(vec2(cx, 41.0));   // 11-15 Rhett 03:36 水流加倍
      if (hs < 0.42) { float x0 = (cx + 0.2 + 0.6 * stH(vec2(cx, 7.0))) * cw, ytop = mix(${bottom.toFixed(1)} + 10.0, ${top.toFixed(1)}, stH(vec2(cx, 9.0))), len = 5.0 + 22.0 * stH(vec2(cx, 13.0));
        float dy = ytop - stW.y, wob = sin(stW.y * 1.3 + hs * 40.0) * 0.06 + sin(stW.y * 3.7) * 0.025, w = 0.012 + 0.018 * stH(vec2(cx, 5.0));
        float dx = abs(wm.x - x0 - wob), on = (1.0 - smoothstep(w * 0.5, w, dx)) * step(0.0, dy) * (1.0 - smoothstep(len * 0.7, len, dy));
        float halo = (1.0 - smoothstep(w, w * 3.0, dx)) * step(0.0, dy) * (1.0 - smoothstep(len * 0.8, len * 1.1, dy));
        stSeep = on; stWet = max(stWet, halo);
        stGlint = on * pow(fract(stW.y * 0.45 + stTime * 0.8 + hs * 9.0), 6.0) * stFade; } }
    c = mix(c, vec3(0.05, 0.085, 0.025) * (0.7 + 0.6 * stN(wm * 4.0)), clamp(stMoss - al.a, 0.0, 1.0) * 0.85);
    c = mix(c, pow(c, vec3(1.6)) * 1.15, stWet * (1.0 - stMoss * 0.5));   // 第 38 步：湿 = 孔隙先吸水变深
    c = mix(stAvg * (0.82 + 0.36 * big) * mix(1.0, 0.5, stWet), c, stFade);
    c = mix(c, c * 0.45, stSeep);
    diffuseColor.rgb *= c;
    stNT = textureGrad(stNrm, uv, gX, gY).xyz * 2.0 - 1.0; stDX = gX; stDY = gY;
    if (stHole > 0.0) stNT = normalize(mix(stNT, stHN, stHole));
    stNT.x += stSeep * sin(stW.y * 9.0 + stTime * 6.0) * 0.25; stNT.xy *= stFade * (1.0 - stRub * 0.5);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.72, 0.16, stWet * (1.0 - stMoss * 0.7)); roughnessFactor = mix(roughnessFactor, 1.0, max(stRub * 0.6, stHole * 0.9)); roughnessFactor = mix(roughnessFactor, 0.04, stSeep);
  { float v = (1.0 - stNT.z) * stFade; roughnessFactor = sqrt(roughnessFactor * roughnessFactor + min(2.0 * v, 0.18)); }   // 第 28 步`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(0.5, 0.6, 0.7) * stGlint * 0.12;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 s0 = stDX, s1 = stDY;
    vec3 N0 = normal, q1p = cross(q1, N0), q0p = cross(N0, q0); vec3 Tt = q1p * s0.x + q0p * s1.x, Bt = q1p * s0.y + q0p * s1.y;
    float det = max(dot(Tt, Tt), dot(Bt, Bt)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
    normal = normalize(mat3(Tt * sc, Bt * sc, N0) * stNT); }`);
  };
  m.customProgramCacheKey = () => 'stonewall2|' + steps;
  return m;
}
