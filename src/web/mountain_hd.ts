// ======================================================================
// 11-16 远景山体高精化（画质专长第 89 步 + 秋林逆光 v2 山体思路，代码本项目重写）
//   每张野外图（营地 / 翠风原野 / 星落 / 赤砂 / 霜脊 / 烬落 / 暗岩山麓 / 腐沼）外圈一环 ridged-fbm 高度场山脊：
//   · 剪影不规则（方位噪声调制山高 + 山脊带半径，留垭口），一张图一次绘制
//   · 世界坐标雪线（按图：霜脊低、星落 / 山麓中、原野只有远处高峰雪顶、营地零星；赤砂 / 烬落 / 腐沼无雪）
//   · 坡度露岩、沿坡向拉伸噪声做冲沟纹（细节法线 + 明暗）、赤砂分层岩、烬落黑岩 + 暗红熔岩辉光
//   · 阳面暖白 / 阴面冷蓝，跟随当前太阳（海天共用件 seasky_core 的 ssSunD；夜里 / ?off=seasky 用 cine 光方向）
//   · 远山单独的高度雾 + 大气透视（不吃场景雾；山脚沉进场景雾色，往上逐渐清晰）
//   · 高 / 超高：山脚低云带 + 霜脊 / 星落高峰顶的风吹雪粉带（细小，随风动）；中档：简化网格与着色；低档 / ?off=mountainhd：不建（旧版）
//   可走区域地形不动（山环内圈压在地形边缘山崖之下），只加远景。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cineUniforms } from './cine';
import { seaSkyOn, ssU } from './seasky_core';

export type MtnStyle = 'camp' | 'field' | 'star' | 'redsand' | 'frost' | 'ember' | 'foothill' | 'marsh';

/** 高 / 超高 / 中档用新版；低档或 ?off=mountainhd（也认 localStorage darkrock_cine_off）回旧版 */
export function mountainHdOn(): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    if (`${q},${ls}`.split(',').map(s => s.trim()).includes('mountainhd')) return false;
  } catch { /* 读不到按开 */ }
  return curQuality !== 'low';
}

interface Prof {
  /** 山高系数（× 山脊带中半径） */ hk: number;
  /** 雪线 = hmax × snow（>1 = 无雪） */ snow: number;
  low: number; rockA: number; rockB: number; snowC: number;
  /** 远山雾浓度倍数 */ fogK: number;
  /** 分层岩（赤砂）0/1 */ strata: number;
  /** 熔岩辉光色（0 = 无） */ glow: number;
  /** 山脚低云带颜色倍数 / 是否 */ band: number;
  /** 峰顶风吹雪粉（高雪山） */ drift: number;
  /** 山体粗糙度：ridged 指数（大 = 更尖） */ sharp: number;
}
const PROF: Record<MtnStyle, Prof> = {
  camp:     { hk: 0.36, snow: 0.84, low: 0x2c3a26, rockA: 0x3a3a38, rockB: 0x6a665e, snowC: 0xeef2f8, fogK: 1.15, strata: 0, glow: 0, band: 1, drift: 0, sharp: 1.25 },
  field:    { hk: 0.42, snow: 0.70, low: 0x3e4a26, rockA: 0x3e3a34, rockB: 0x7a7064, snowC: 0xf0f3f8, fogK: 1.0, strata: 0, glow: 0, band: 1, drift: 0, sharp: 1.3 },
  star:     { hk: 0.50, snow: 0.50, low: 0x3a4a3a, rockA: 0x3a3646, rockB: 0x726a84, snowC: 0xeef0fa, fogK: 0.95, strata: 0, glow: 0, band: 1, drift: 1, sharp: 1.35 },
  redsand:  { hk: 0.34, snow: 9, low: 0x8a4a2c, rockA: 0x6a2c1a, rockB: 0xb8683e, snowC: 0xffffff, fogK: 1.25, strata: 1, glow: 0, band: 0, drift: 0, sharp: 1.1 },
  frost:    { hk: 0.44, snow: 0.30, low: 0x2a343c, rockA: 0x262c36, rockB: 0x5a6474, snowC: 0xf2f6fc, fogK: 0.8, strata: 0, glow: 0, band: 1, drift: 1, sharp: 1.6 },
  ember:    { hk: 0.40, snow: 9, low: 0x1a1412, rockA: 0x0e0b0b, rockB: 0x2e2622, snowC: 0xffffff, fogK: 1.35, strata: 0, glow: 0xb81e08, band: 1, drift: 0, sharp: 1.45 },
  foothill: { hk: 0.46, snow: 0.66, low: 0x2e3326, rockA: 0x2a2826, rockB: 0x5a5650, snowC: 0xe8ecf2, fogK: 1.2, strata: 0, glow: 0, band: 1, drift: 0, sharp: 1.35 },
  marsh:    { hk: 0.26, snow: 9, low: 0x2a3420, rockA: 0x2a2c24, rockB: 0x4a4c3c, snowC: 0xffffff, fogK: 2.2, strata: 0, glow: 0, band: 1, drift: 0, sharp: 1.1 },
};

// ---------------------------------------------------------------- CPU 噪声（确定性）
function h2(x: number, y: number) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** ridged fbm：1−|2n−1| 平方后按上一层加权（山脊锐、谷宽） */
function ridged(x: number, y: number, oct = 7) {
  let s = 0, a = 0.55, w = 1, f = 1;
  for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(vn(x * f, y * f) * 2 - 1); n *= n; n *= w; w = Math.min(1, Math.max(0, n * 1.6)); s += n * a; f *= 2.07; a *= 0.5; x += 13.7; y += 7.1; }
  return s;
}
const fb2 = (x: number, y: number) => vn(x, y) * 0.6 + vn(x * 2.1 + 5, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3 + 9) * 0.1;

// ---------------------------------------------------------------- GLSL 公共
export const MTN_GL_NOISE = /* glsl */ `
float mh21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float mvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh21(i), mh21(i + vec2(1, 0)), f.x), mix(mh21(i + vec2(0, 1)), mh21(i + vec2(1, 1)), f.x), f.y); }
float mfb(vec2 p){ return mvn(p) * .5 + mvn(p * 2.1 + 5.) * .25 + mvn(p * 4.3 + 9.) * .15 + mvn(p * 9.1 + 2.) * .1; }
`;
/** 光方向（海天共用件的太阳；太阳落下 / 关闭时用 cine 平行光方向 = 月光）+ 远山空气色 */
export const MTN_GL_LIGHT = /* glsl */ `
uniform vec4 cineSun; uniform vec3 cineSunCol; uniform vec3 cineZen; uniform vec3 cineHor; uniform vec4 cineFog; uniform vec4 cineFog2;
uniform vec3 ssSunD; uniform vec4 ssK; uniform float uSSon;
vec3 mtnL(){ vec3 s = vec3(ssSunD.x, max(ssSunD.y, 0.02), ssSunD.z); return normalize(mix(cineSun.xyz, s, uSSon * step(0.02, ssK.y))); }
vec3 mtnAir(vec3 dir, vec3 L){ float mu = max(dot(dir, L), 0.0);
  return cineHor * vec3(0.90, 0.97, 1.07) + cineSunCol * (pow(mu, 8.0) * 0.32 + pow(mu, 2.0) * 0.05) * cineSun.w; }
`;

export interface MtnOpt {
  style: MtnStyle;
  /** 山环中心（世界坐标） */ cx: number; cz: number;
  /** 山环内圈半径（压在可走地形边缘山崖以外 / 之下） */ r0: number;
  /** 玩家离中心最远距离（用来把山环外圈留在相机远裁剪面 700 米以内） */ reach: number;
  seed?: number;
}
export const mountainStats: Record<string, { tris: number; hmax: number; snowY: number; r0: number; r1: number; peaks: number }> = {};

/** 生成一张图的远景山环（返回 Group；调用方挂进本图 group，烘焙合批之后挂） */
/** 11-16 修：只有本体 8 张野外图有山环配置；DLC 图（dlc1_coast / dlc1_mirror 等）没有 → 不建，否则高 / 超高 / 中档读 PROF[id].hk 报错、切图卡在载入 92% */
export function hasMountainStyle(id: string): id is MtnStyle { return Object.prototype.hasOwnProperty.call(PROF, id); }
export function buildMountains(o: MtnOpt): THREE.Group {
  const P = PROF[o.style], q = curQuality, lite = q === 'medium', ultra = q === 'ultra';
  const seed = o.seed ?? [...o.style].reduce((a, c) => a + c.charCodeAt(0) * 31, 7);
  const sx = (seed % 97) * 3.17, sz = (seed % 89) * 2.31;
  const G = new THREE.Group(); G.name = `mtnhd_${o.style}`;
  const r0 = o.r0, r1 = Math.max(r0 + 160, Math.min(640, 680 - o.reach)), rMid = (r0 + r1) / 2;
  const NA = ultra ? 640 : lite ? 300 : 500, NR = ultra ? 80 : lite ? 36 : 64;
  const pos = new Float32Array((NA + 1) * (NR + 1) * 3); const idx: number[] = [];
  const A = rMid * 0.12 * P.hk / 0.42, B = rMid * 0.54 * P.hk / 0.42;
  let hmax = 0, k = 0;
  for (let j = 0; j <= NR; j++) {
    const t = j / NR;
    for (let i = 0; i <= NA; i++) {
      const a = i / NA * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // 方位调制（环向无缝：在圆上取噪声）：山高起伏、留垭口；山脊带位置前后错动 → 剪影不是正圆环
      const az = Math.max(0.12, 0.30 + 1.0 * fb2(ca * 1.7 + sx, sa * 1.7 + sz) - 0.25 * vn(ca * 4.1 + 3, sa * 4.1 + 7));
      const shift = (vn(ca * 2.3 + 11 + sx, sa * 2.3 + sz) - 0.5) * 0.35;
      const r = r0 + (r1 - r0) * Math.pow(t, 0.85);
      const x = o.cx + sa * r, z = o.cz - ca * r;
      const te = (t - 0.2 - Math.max(0, shift)) / 0.78;   // 山脊带从内圈外 ~1/4 处才起：峰离可走区够远（视角 10–20°）
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, te))) ** 0.8;
      let h = env * az * (A + B * Math.pow(ridged((x - o.cx) * 0.0021 + sx, (z - o.cz) * 0.0021 + sz, lite ? 5 : 7), P.sharp))
        + ridged((x - o.cx) * 0.011 + sz, (z - o.cz) * 0.011 + sx, lite ? 3 : 5) * 14 * env - 16 + 8 * Math.min(1, t * 6);
      if (P.strata) { const st = 16, qh = Math.round(h / st) * st; h += (qh - h) * 0.45 * env; }   // 赤砂：软台阶（层状方山）
      pos[k++] = x; pos[k++] = h; pos[k++] = z; hmax = Math.max(hmax, h);
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  { // 绕序自检：法线朝上（专长第 89 步：法线反了山会整片看不见）
    const nn = g.getAttribute('normal') as THREE.BufferAttribute; let up = 0; for (let i = 0; i < nn.count; i += 97) up += nn.getY(i);
    if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  }
  g.computeBoundingSphere();
  const snowY = hmax * P.snow;
  const glowC = new THREE.Color(P.glow);
  const U = {
    ...cineUniforms(), ...(seaSkyOn() ? { ssSunD: ssU.ssSunD, ssK: ssU.ssK } : { ssSunD: { value: new THREE.Vector3(0, 1, 0) }, ssK: { value: new THREE.Vector4(0, 0, 0, 0) } }),
    uSSon: { value: seaSkyOn() ? 1 : 0 },
    uHmax: { value: hmax }, uSnowY: { value: snowY }, uC: { value: new THREE.Vector2(o.cx, o.cz) }, uR: { value: new THREE.Vector2(r0, r1) },
    uLow: { value: new THREE.Color(P.low) }, uRockA: { value: new THREE.Color(P.rockA) }, uRockB: { value: new THREE.Color(P.rockB) }, uSnowC: { value: new THREE.Color(P.snowC) },
    uGlow: { value: new THREE.Vector3(glowC.r, glowC.g, glowC.b) }, uP: { value: new THREE.Vector4(P.fogK, P.strata, P.glow ? 1 : 0, P.snow < 2 ? 1 : 0) },
  };
  const mm = new THREE.ShaderMaterial({
    uniforms: U, fog: false,
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: (lite ? '#define MTN_LITE 1\n' : '') + MTN_GL_NOISE + MTN_GL_LIGHT + /* glsl */ `
      uniform float uHmax; uniform float uSnowY; uniform vec2 uC; uniform vec2 uR; uniform vec3 uLow; uniform vec3 uRockA; uniform vec3 uRockB; uniform vec3 uSnowC; uniform vec3 uGlow; uniform vec4 uP;
      varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN); vec3 L = mtnL();
        vec2 p = vW.xz;
        // 冲沟：山环的坡大多朝向 / 背向中心，下坡方向 ≈ 径向 —— 用稳定的极坐标场（环向高频、径向低频）拉出一道道往下的沟。
        //   不按逐像素法线转坐标（那样方向场弯曲，会出年轮 / 木纹）；atan 接缝处两份采样交叉淡化
        vec2 lp = p - uC; float rr = length(lp), ang = atan(lp.y, lp.x);
        float ry = rr * .0075 + vW.y * .004;
        float gA = mfb(vec2(ang * 30., ry)), gB = mfb(vec2((ang < 0. ? ang + 6.2832 : ang) * 30. + 17., ry));
        float gul = mix(gA, gB, smoothstep(2.7, 3.1, abs(ang)));
        float gul2 = mvn(vec2(ang * 95., rr * .02 + vW.y * .01));
        gul = gul * .75 + gul2 * .25;
        vec2 pr = vec2(-lp.y, lp.x) / max(rr, 1.);                   // 环向（横跨沟的方向）
        float ribs = smoothstep(0.35, 0.75, gul);
        vec3 nb = n;                                   // 几何法线（雪 / 坡度判定用，不受细节法线影响 → 雪面不出木纹）
        float hn = clamp(vW.y / max(uHmax, 1.), 0., 1.), sl = nb.y;
        float nz2 = mfb(p * .012) * .7 + mfb(p * .11) * .3;
        // 雪：世界坐标雪线（噪声抖动）+ 坡度（陡坡挂不住雪露岩）；冲沟里雪多、棱上少
        float snow = 0.;
        if (uP.w > .5) {
          float line = (vW.y - uSnowY) / max(uHmax * .18, 1.) + (nz2 - .5) * .9 + (.5 - gul) * .45;   // 沟里雪下探、棱上退
          snow = smoothstep(-.15, .25, line) * smoothstep(.56, .80, sl + (nz2 - .5) * .26 + (1. - ribs) * .10);   // 陡坡挂不住雪 → 露岩
        }
      #ifndef MTN_LITE
        { vec2 q = p * .045; float n0 = mfb(q), nx = mfb(q + vec2(.05, 0.)), nz = mfb(q + vec2(0., .05));
          float gx = (mvn(vec2(ang * 95. + .25, rr * .02 + vW.y * .01)) - gul2) * 2.;
          vec3 pert = (vec3(n0 - nx, 0., n0 - nz) * .5 + vec3(pr.x, 0., pr.y) * gx * 1.1) * (1. - nb.y * .45);
          n = normalize(nb + pert * (1. - .75 * snow)); }   // 雪面平滑，岩面带沟壑起伏
      #endif
        vec3 rock = mix(uRockA, uRockB, mfb(p * .03)) * (.72 + .45 * mvn(p * .21));
        rock *= mix(1.0, .62, (1. - ribs) * smoothstep(.95, .55, sl));              // 沟里暗、棱上亮
        if (uP.y > .5) rock *= .78 + .34 * (.5 + .5 * sin(vW.y * .55 + mfb(p * .02) * 5.));   // 赤砂分层岩
        float veg = smoothstep(.34, .10, hn + (nz2 - .5) * .2) * smoothstep(.55, .78, sl);
        vec3 alb = mix(rock, uLow * (.8 + .4 * nz2), veg);
        alb = mix(alb, uSnowC * (.9 + .1 * nz2), snow);
        // 阳面暖、阴面冷（随当前太阳），天光按朝上程度
        float ndl = dot(n, L), lit = smoothstep(-.05, .25, ndl);
        float day = clamp(dot(cineHor, vec3(.3, .5, .2)) * 1.6, .03, 1.);
        vec3 sunL = cineSunCol * vec3(1., .91, .78) * max(ndl, 0.) * 1.05;
        vec3 sky = mix(vec3(.30, .42, .70), vec3(.44, .47, .56), lit) * (.55 + .45 * sl) * .62 * day;
        vec3 col = alb * (sunL + sky);
        vec3 v = vW - cameraPosition; float d = length(v); vec3 dir = v / d;
        col += cineSunCol * snow * pow(max(dot(dir, L), 0.), 10.) * (1. - lit) * .25 * cineSun.w;   // 逆光雪檐透亮
        if (uP.z > .5) {   // 烬落：沟底熔岩脉 + 山脚暗红辉光（呼吸）
          float vein = 1. - abs(mfb(p * .018 + vec2(gul * .6, 0.)) * 2. - 1.);
          float pulse = .78 + .22 * sin(cineFog2.z * .9 + p.x * .01);
          col += uGlow * (smoothstep(.93, .99, vein) * (1. - ribs) * smoothstep(.5, .05, hn) * .85 + exp(-max(vW.y, 0.) / 22.) * .2) * pulse;   // 暗红，只在下半山的沟底
        }
        // 远山自己的空气：距离消光（弱，≈ 800 m 一半清晰）× 高度雾（山脚沉进场景雾色）
        float dens = .0007 * uP.x * clamp(cineFog.x / .005, .6, 2.);
        float T = exp(-d * dens);
        float hz = exp(-max(vW.y + 4., 0.) / (16. + 10. * uP.x)) * smoothstep(uR.x + 20., uR.x + 140., length(p - uC));
        T *= 1. - .7 * hz;
        T *= mix(.30, 1., smoothstep(.025, .17, dir.y));   // 贴地平线的视线穿过最厚的低层空气：山脚和近处边缘山崖的雾墙柔和衔接
        vec3 air = mtnAir(dir, L);
        if (uP.z > .5) air += uGlow * .10 * hz;
        gl_FragColor = vec4(mix(air, col, clamp(T, 0., 1.)), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mm); m.name = 'mtnhd_ridge'; m.frustumCulled = false; m.matrixAutoUpdate = false; m.updateMatrix();
  G.add(m);
  let peaks = 0;
  if (!lite && P.band) G.add(makeBand(o, P, r0 + (r1 - r0) * 0.40));
  if (!lite && P.drift) { const d = makeDrift(pos, NA, NR, snowY, hmax, ultra ? 14 : 10, o); if (d) { G.add(d.mesh); peaks = d.n; } }
  G.traverse(c => { const mt = (c as THREE.Mesh).material as THREE.Material | undefined; if (mt) mt.userData.outlineParameters = { visible: false }; });   // 不套卡通描边
  mountainStats[o.style] = { tris: idx.length / 3, hmax: Math.round(hmax), snowY: Math.round(snowY), r0: Math.round(r0), r1: Math.round(r1), peaks };
  return G;
}

/** 山脚低云 / 雾带：环形圆筒，噪声团块缓慢飘（高 / 超高） */
function makeBand(o: MtnOpt, P: Prof, r: number) {
  const g = new THREE.CylinderGeometry(r, r, 40, 256, 1, true); g.translate(o.cx, 10, o.cz);
  const U = { ...cineUniforms(), ...(seaSkyOn() ? { ssSunD: ssU.ssSunD, ssK: ssU.ssK } : { ssSunD: { value: new THREE.Vector3(0, 1, 0) }, ssK: { value: new THREE.Vector4() } }), uSSon: { value: seaSkyOn() ? 1 : 0 },
    uTint: { value: new THREE.Color(P.glow ? 0x8a6a62 : P.strata ? 0xd8b090 : 0xffffff) } };
  const cm = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: MTN_GL_NOISE + MTN_GL_LIGHT + /* glsl */ `uniform vec3 uTint; varying vec2 vUv; varying vec3 vW;
      float bandN(float u, float y, float t){ return mvn(vec2(u + t * .015, y * 2.)) * .55 + mvn(vec2(u * 2.7 - t * .025, y * 5. + 3.)) * .3 + mvn(vec2(u * 7., y * 11.)) * .15; }
      void main(){ float y = vUv.y, t = cineFog2.z;
        float n = mix(bandN(vUv.x * 80., y, t), bandN((vUv.x - 1.) * 80., y, t), smoothstep(.92, 1., vUv.x));   // 圆筒接缝处交叉淡化（不出竖缝）
        float prof = smoothstep(0., .3, y) * smoothstep(.85, .25, y);
        float a = smoothstep(.42, .86, n * (1.2 - y * .7)) * prof * .38;
        vec3 L = mtnL(); vec3 dir = normalize(vW - cameraPosition);
        vec3 c = mtnAir(dir, L) * uTint * 1.02 + cineSunCol * pow(max(dot(dir, L), 0.), 6.) * .12 * cineSun.w;
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, cm); m.name = 'mtnhd_band'; m.frustumCulled = false; m.renderOrder = -0.4;
  return m;
}

/** 峰顶风吹雪粉带：在最高的几座雪峰（局部最高点，互相隔开）顶上，顺风拉出的细长半透明带，噪声条纹随风流动 */
function makeDrift(pos: Float32Array, NA: number, NR: number, snowY: number, hmax: number, want: number, o: MtnOpt) {
  const cand: { i: number; h: number }[] = [];
  const H = (i: number, j: number) => pos[(j * (NA + 1) + ((i + NA) % NA)) * 3 + 1];
  for (let j = 2; j < NR - 2; j++) for (let i = 0; i < NA; i++) {
    const h = H(i, j); if (h < Math.max(snowY + hmax * 0.12, hmax * 0.55)) continue;
    let top = true; for (let dj = -2; dj <= 2 && top; dj++) for (let di = -3; di <= 3; di++) if ((di || dj) && H(i + di, j + dj) > h) { top = false; break; }
    if (top) cand.push({ i: j * (NA + 1) + i, h });
  }
  cand.sort((a, b) => b.h - a.h);
  const pick: number[] = [];
  for (const c of cand) {
    const x = pos[c.i * 3], z = pos[c.i * 3 + 2];
    if (pick.every(p => Math.hypot(pos[p * 3] - x, pos[p * 3 + 2] - z) > 90)) pick.push(c.i);
    if (pick.length >= want) break;
  }
  if (!pick.length) return null;
  const n = pick.length, P = new Float32Array(n * 4 * 3), C = new Float32Array(n * 4 * 2), S = new Float32Array(n * 4); const I: number[] = [];
  pick.forEach((pi, k) => {
    for (let c = 0; c < 4; c++) { P.set([pos[pi * 3], pos[pi * 3 + 1], pos[pi * 3 + 2]], (k * 4 + c) * 3); C.set([c & 1, c >> 1], (k * 4 + c) * 2); S[k * 4 + c] = h2(pi, k) ; }
    const b = k * 4; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aC', new THREE.BufferAttribute(C, 2)); g.setAttribute('aS', new THREE.BufferAttribute(S, 1)); g.setIndex(I);
  const U = { ...cineUniforms(), ...(seaSkyOn() ? { ssSunD: ssU.ssSunD, ssK: ssU.ssK } : { ssSunD: { value: new THREE.Vector3(0, 1, 0) }, ssK: { value: new THREE.Vector4() } }), uSSon: { value: seaSkyOn() ? 1 : 0 },
    uWind: { value: new THREE.Vector2(0.93, 0.36).normalize() } };
  const dm = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute vec2 aC; attribute float aS; uniform vec2 uWind; uniform vec4 cineFog2; varying vec2 vC; varying float vS; varying vec3 vW;
      void main(){ vC = aC; vS = aS;
        // 轴向公告板：长轴 = 水平风向（顺风拉 55–85 m），短轴 = 面向相机的竖直方向；峰顶略下沉，雪粉从山脊背风面卷出
        vec3 wd = normalize(vec3(uWind.x, 0.06, uWind.y));
        vec3 toC = normalize(cameraPosition - position);
        vec3 side = normalize(cross(vec3(0., 1., 0.), toC));
        vec3 ax = wd - toC * dot(wd, toC); ax.y = 0.; ax = normalize(ax + side * .3 * sign(dot(ax, side) + 1e-3) + 1e-4);   // 风向投到屏幕平面、保持水平（顺视线时不塌成竖线，仰看时不斜着往上飞）
        vec3 up = normalize(cross(ax, toC)); if (up.y < 0.) up = -up; wd = ax;
        float len = 50. + 30. * aS, hgt = 14. + 8. * aS;
        vec3 w = position + wd * (aC.x * len - 8.) + up * ((aC.y - .55) * hgt);
        vW = w; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: MTN_GL_NOISE + MTN_GL_LIGHT + /* glsl */ `varying vec2 vC; varying float vS; varying vec3 vW;
      void main(){ float t = cineFog2.z;
        float along = vC.x, y = vC.y;
        // 形状：根部（峰顶）浓、顺风变淡变宽；竖向细带
        float core = .58 - .06 * along;                                // 雪粉顺风略下沉
        float prof = exp(-pow((y - core) / (.07 + .20 * along), 2.)) * smoothstep(0., .1, along) * smoothstep(1., .35, along);
        // 团絮 + 细丝：顺风流动（时间平移）
        float s = mvn(vec2(along * 4. - t * .45 + vS * 20., y * 6.)) * .55 + mvn(vec2(along * 11. - t * .9, y * 15. + vS * 9.)) * .3 + mvn(vec2(along * 27. - t * 1.6, y * 34.)) * .15;
        float a = prof * smoothstep(.34, .76, s) * .8;
        vec3 L = mtnL(); vec3 dir = normalize(vW - cameraPosition); float mu = max(dot(dir, L), 0.);
        float day = clamp(dot(cineHor, vec3(.3, .5, .2)) * 1.6, .03, 1.);
        vec3 c = vec3(.95, .97, 1.) * (cineSunCol * .75 + vec3(.40, .46, .58) * day) + cineSunCol * pow(mu, 6.) * .9 * cineSun.w;   // 逆光雪粉发亮
        float d = length(vW - cameraPosition); float T = exp(-d * .0009);
        c = mix(mtnAir(dir, L), c, T);
        gl_FragColor = vec4(c, a * T);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, dm); m.name = 'mtnhd_drift'; m.frustumCulled = false; m.renderOrder = -0.3;
  void o;
  return { mesh: m, n };
}
