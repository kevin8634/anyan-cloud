// 11-17 伊奥拉对照概念图（CG二 chars/iola.jpg：金色发光丝线织成的灵体，写实面孔）修「看起来是多边形」：
//   1) 原件法线是逐面的（同一位置的法线各朝各的，平均偏差 0.81）→ 打光成一块块平面。smoothNormals 按位置合并求平均，夹角超过阈值的保留硬边。
//   2) 脸：概念图经 gpt-image-2 转成正脸（iola_face_tex.ts），按静止姿态坐标从正前方投影到脸部，椭圆羽化 + 只投朝前的面；其余部位保留原件金色贴图。
// Rhett 11-17：「不是要她变普通人，而是要她看起来不是多边形」「脸一定要用概念图做贴图」。配色保持原件。
import * as THREE from 'three';
import { IOLA_FACE_WEBP, IOLA_FIL_WEBP } from './iola_face_tex';

/** 按位置合并平滑法线（不并顶点，UV 接缝不受影响）。crease：夹角超过该度数的面法线不参与平均（保留衣褶硬边） */
export function smoothNormals(g: THREE.BufferGeometry, creaseDeg = 70) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'); if (!P || !N) return;
  const n = P.count, idx = g.getIndex(), cos = Math.cos(creaseDeg * Math.PI / 180);
  // 面法线（按三角形）累加到顶点
  const fn = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : n / 3, I = (k: number) => (idx ? idx.getX(k) : k);
  for (let t = 0; t < tri; t++) {
    const i0 = I(t * 3), i1 = I(t * 3 + 1), i2 = I(t * 3 + 2);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);   // 面积加权
    for (const i of [i0, i1, i2]) { fn[i * 3] += e1.x; fn[i * 3 + 1] += e1.y; fn[i * 3 + 2] += e1.z; }
  }
  const q = (v: number) => Math.round(v * 1e5);
  const key = (i: number) => q(P.getX(i)) + ',' + q(P.getY(i)) + ',' + q(P.getZ(i));
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) { const k = key(i); let gq = groups.get(k); if (!gq) groups.set(k, gq = []); gq.push(i); }
  const out = new Float32Array(n * 3), vi = new THREE.Vector3(), vj = new THREE.Vector3(), acc = new THREE.Vector3();
  for (const gq of groups.values()) for (const i of gq) {
    vi.set(fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]); const li = vi.length() || 1; acc.set(0, 0, 0);
    for (const j of gq) { vj.set(fn[j * 3], fn[j * 3 + 1], fn[j * 3 + 2]); const lj = vj.length() || 1; if (vi.dot(vj) / (li * lj) >= cos) acc.add(vj); }
    if (acc.lengthSq() < 1e-20) acc.copy(vi); acc.normalize(); out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

/** 脸前飘过的发丝和脸是同一块网格，脸贴图投上去成了一道暗斜带。按格子求「皮肤面」深度：只看朝前、
 *  在该格最前 3% 身高以内的顶点取中位数（排除后脑和口腔内侧）；三个顶点都在皮肤面前方 tol 以上的三角形压成一点。 */
export function hideFaceStrands(g: THREE.BufferGeometry, lo: THREE.Vector3, hi: THREE.Vector3, tol = 0.006): number {
  const P = g.getAttribute('position') as THREE.BufferAttribute, N = g.getAttribute('normal') as THREE.BufferAttribute, idx = g.getIndex(); if (!P || !N || !idx) return 0;
  const sp = hi.clone().sub(lo), H = sp.y, G = 12, X0 = 0.065, Y0 = 0.87, Y1 = 0.99;
  const fx = (i: number) => ((P.getX(i) - lo.x) / sp.x - 0.5) * sp.x / H - IOLA_FACE.x, fy = (i: number) => (P.getY(i) - lo.y) / H, fz = (i: number) => (P.getZ(i) - lo.z) / H;
  const inR = (x: number, y: number) => Math.abs(x) < X0 && y > Y0 && y < Y1;
  const cell = (x: number, y: number) => Math.min(G - 1, Math.max(0, Math.floor((x + X0) / (2 * X0) * G))) * G + Math.min(G - 1, Math.max(0, Math.floor((y - Y0) / (Y1 - Y0) * G)));
  const zs: number[][] = Array.from({ length: G * G }, () => []), zmax = new Float32Array(G * G).fill(-9);
  for (let i = 0; i < P.count; i++) { const x = fx(i), y = fy(i); if (inR(x, y)) { const c = cell(x, y); zmax[c] = Math.max(zmax[c], fz(i)); } }
  for (let i = 0; i < P.count; i++) { const x = fx(i), y = fy(i); if (!inR(x, y) || N.getZ(i) < 0.25) continue; const c = cell(x, y); if (fz(i) > zmax[c] - 0.03) zs[c].push(fz(i)); }
  const med = zs.map(a => { if (a.length < 3) return 9; a.sort((p, q) => p - q); return a[Math.floor(a.length * 0.5)]; });
  let n = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    if (!v.every(i => { const x = fx(i), y = fy(i); return inR(x, y) && fz(i) > med[cell(x, y)] + tol; })) continue;
    for (const i of v) P.setXYZ(i, P.getX(v[0]), P.getY(v[0]), P.getZ(v[0])); n++;
  }
  if (n) P.needsUpdate = true;
  return n;
}

let faceTex: THREE.Texture | null = null;
export function iolaFaceTex(): THREE.Texture {
  if (!faceTex) { faceTex = new THREE.TextureLoader().load(IOLA_FACE_WEBP); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4; }
  return faceTex;
}
let filTex: THREE.Texture | null = null;
export function iolaFilTex(): THREE.Texture {
  if (!filTex) { filTex = new THREE.TextureLoader().load(IOLA_FIL_WEBP); filTex.colorSpace = THREE.SRGBColorSpace; filTex.wrapS = filTex.wrapT = THREE.RepeatWrapping; filTex.anisotropy = 4; }
  return filTex;
}
/** 脸投影参数：x 偏移、眼睛高度（按身高 0–1）、贴图跨度（按身高） */
export const IOLA_FACE = new THREE.Vector3(0.0053, 0.949, 0.100);

// 片元：vRest = 静止姿态坐标归一化到包围盒 0–1，vRestN = 静止姿态法线，uSpan = 包围盒尺寸
export const IOLA_FACE_FRAG = `{
  vec3 s0 = diffuseColor.rgb;
  // 身体：原件贴图按图集碎块烘了明暗，一块一块的（多边形感的主因之一）。改用概念图衣裙的发光丝线织物，
  //   在静止姿态坐标里按 x / z 两向投影（竖向丝线），跨图集接缝连续；原件贴图只留低比重的明暗
  vec3 rp = (vRest - 0.5) * uSpan / uSpan.y;   // 以身高为单位
  vec3 an = abs(normalize(vRestN)); float wx = an.x / max(an.x + an.z, 1e-3);
  float sc = 3.2;
  vec3 fA = texture2D(uFilTex, vec2(rp.z, rp.y) * sc).rgb, fB = texture2D(uFilTex, vec2(rp.x, rp.y) * sc + 0.37).rgb;
  vec3 fil = mix(fB, fA, wx);
  float fl = dot(fil, vec3(0.299, 0.587, 0.114));
  // 概念图是柔和的淡金丝绸 + 亮丝线，不是火焰：压对比、降饱和、提底色
  fil = mix(vec3(0.42, 0.30, 0.16), vec3(1.0, 0.86, 0.6), smoothstep(0.02, 0.55, fl)) * 0.75 + fil * 0.35;
  float sl = dot(s0, vec3(0.299, 0.587, 0.114));
  vec3 body = mix(fil, s0 * vec3(1.05, 0.95, 0.8), 0.3) * mix(0.8, 1.1, smoothstep(0.05, 0.6, sl));
  // 头发（Rhett 11-17：长发，别和衣服混在一起）：原件贴图里头发是高饱和金色、衣裙是淡金，按饱和度 + 头顶区域分出头发，
  //   头发用原件金发底色 + 竖向拉长的丝线做发丝高光，衣裙用织物
  float mx = max(s0.r, max(s0.g, s0.b)), sat0 = (mx - min(s0.r, min(s0.g, s0.b))) / max(mx, 1e-3);
  float hair = max(smoothstep(0.83, 0.86, vRest.y), smoothstep(0.74, 0.86, sat0) * smoothstep(0.45, 0.6, vRest.y));   // 发长到胸口以下，腰以下的高饱和块是衣裙
  vec3 strand = texture2D(uFilTex, vec2((rp.x + rp.z) * 7.0, rp.y * 1.6) + 0.61).rgb;
  vec3 hc = s0 * vec3(1.12, 1.0, 0.78) * 1.1 + strand * vec3(0.35, 0.28, 0.16);
  body = mix(body, hc, hair);
  iolaGlow = mix(smoothstep(0.3, 0.75, fl), 0.25, hair);
  diffuseColor.rgb = body;
  // 脸：概念图正脸投影；脸前飘过的发丝和脸是同一块网格，按原件贴图颜色区分（线性空间饱和度：肤色约 0.4–0.6，发丝 >0.8）
  float xh = (vRest.x - 0.5) * uSpan.x / uSpan.y;
  vec2 fu = vec2(0.5 + (xh - uFace.x) / uFace.z, 0.598 + (vRest.y - uFace.y) / uFace.z);
  float el = length((fu - vec2(0.5, 0.47)) / vec2(0.29, 0.43));
  float fm = (1.0 - smoothstep(0.72, 1.0, el)) * smoothstep(0.12, 0.45, normalize(vRestN).z);
  fm *= 1.0 - smoothstep(0.74, 0.86, sat0);
  if (fm > 0.001) { vec3 fc = texture2D(uFaceTex, clamp(fu, 0.0, 1.0)).rgb; diffuseColor.rgb = mix(diffuseColor.rgb, fc, fm); }
  iolaFace = fm;
}`;

// 脸部网格很粗（鼻梁、嘴角是几块大三角面），打光后折出暗斜带。脸部区域法线换成一个贴合头部的椭球面法线，
// 明暗交给概念图本身画好的光影；顶点着色器里算（vFaceN，视图空间），片元按 iolaFace 混合。
export const IOLA_FACE_VERT = `{
  float xh0 = (vRest.x - 0.5) * uSpanV.x / uSpanV.y - uFaceV.x;
  vec3 en = normalize(vec3(xh0 / 0.075, (vRest.y - uFaceV.y + 0.015) / 0.16, 1.0));
  vFaceN = normalize(normalMatrix * en);
}`;
export const IOLA_FACE_ROUGH = `roughnessFactor = mix(roughnessFactor, 1.0, iolaFace);`;   // 脸不要额头高光
export const IOLA_FACE_NRM = `normal = normalize(mix(normal, normalize(vFaceN) * (gl_FrontFacing ? 1.0 : -1.0), iolaFace));`;

// 头发飘动（Rhett 11-17）：原件无骨骼，在顶点着色器里按原件贴图饱和度认出头发，发根（头顶）不动、发梢摆幅大，两路正弦叠风
export const IOLA_HAIR_VERT = `{
  vec3 hm = textureLod(map, uv, 0.0).rgb; hm = hm * hm;   // 近似转线性，和片元同一套阈值
  float hx = max(hm.r, max(hm.g, hm.b)), hs = (hx - min(hm.r, min(hm.g, hm.b))) / max(hx, 1e-3);
  float hw = smoothstep(0.74, 0.86, hs) * smoothstep(0.45, 0.6, vRest.y) * smoothstep(0.0, 0.3, 0.93 - vRest.y);
  float ph = uGTV * 1.3 + vRest.y * 7.0 + vRest.x * 3.0;
  transformed.x += hw * 0.035 * (sin(ph) + 0.4 * sin(ph * 2.3 + 1.7));
  transformed.z += hw * 0.025 * sin(ph * 0.8 + 0.9);
}`;
