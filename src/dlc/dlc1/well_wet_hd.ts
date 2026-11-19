// 11-15 钟井四件套（规格 场景升级规格_1114.md 第四节）：井壁湿痕 + 冰湖内部层次。只改 DLC，不加贴图、不加光源。
//   wetWall(m)：井壁 tiletex 材质（有 vTlW 世界坐标）串接一段着色：越往下越湿越暗（反照率压暗、粗糙度降低 → 出湿反光），
//               竖向渗水条纹（沿井壁角度的细条，往下拖长）、中段苔藓带（发绿、更糙）。低画质（纯色回退材质）不改。
//   iceUp(m)：冰湖冰面（MeshStandardMaterial）加视差内部层：两层气泡（深 0.12 / 0.45 米，随视角错动）、两层裂纹（Voronoi 边）、
//               掠射角菲涅尔冷光、边缘碎冰白边。全在一个材质里，无额外 draw call。
import * as THREE from 'three';

const NOISE = `
float wwH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wwN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wwH(i), wwH(i + vec2(1, 0)), f.x), mix(wwH(i + vec2(0, 1)), wwH(i + vec2(1, 1)), f.x), f.y); }
float wwF(vec2 p){ return wwN(p) * 0.55 + wwN(p * 2.07 + 3.1) * 0.3 + wwN(p * 4.3 + 7.7) * 0.15; }
`;

const VOR = `
vec3 wwVor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = 0.15 + 0.7 * vec2(wwH(i + g), wwH(i + g + 17.0));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = dot(i + g, vec2(1.0, 57.0)); } else if (d < d2) d2 = d; }
  return vec3(d1, d2 - d1, id); }
`;

/** 井壁湿痕：top = 井口附近干燥高度，bottom = 最湿的高度 */
export function wetWall(m: THREE.Material | null | undefined, top = 30, bottom = -60, brick = 1) {
  const s = m as THREE.MeshStandardMaterial | null;
  if (!s || !s.isMeshStandardMaterial || s.userData?.wellWet || !s.userData?.tile) return;
  s.userData.wellWet = true;
  const prev = s.onBeforeCompile;
  s.onBeforeCompile = (sh, r) => {
    prev.call(s, sh, r);
    if (!sh.fragmentShader.includes('vTlW')) return;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE + VOR + 'float wwWet; float wwMoss; float wwHt; float wwHole; float wwBed; float wwFade;\n')
      .replace('#include <map_fragment>', `#include <map_fragment>
  { // 11-15 Rhett「凹凸不平的非规则砖块，偶尔有大小不一的破损」：拉伸 Voronoi 当砖块（宽约 0.9 米、高约 0.45 米），F2-F1 = 灰缝；
    // 每块砖色差 / 高低不同（法线用 dFdx 高度梯度），零星缺砖 + 噪声大片塌落区；离远按每像素米数淡出（专长第 12 步，防闪）
    float wwA = atan(vTlW.z, vTlW.x);
    // 不规则砖：一层层砌（层高约 0.4 米，低频扭曲让砖层起伏），每层砖长 0.6–1.2 米、接缝位置随机错开，砖面各自微倾
    vec2 bp = vec2(wwA * 140.0, vTlW.y); bp += vec2(wwN(bp * 0.35) - 0.5, wwN(bp * 0.3 + 5.0) - 0.5) * vec2(0.25, 0.16);
    float RH = 0.4, W = 0.85, row = floor(bp.y / RH), fy = fract(bp.y / RH);
    float xb = (bp.x + wwH(vec2(row, 1.0)) * 7.0) / W, c = floor(xb), t = fract(xb);
    float jc = (wwH(vec2(c, row)) - 0.5) * 0.6, jn = (wwH(vec2(c + 1.0, row)) - 0.5) * 0.6;
    if (t < jc) { c -= 1.0; jn = jc; jc = (wwH(vec2(c, row)) - 0.5) * 0.6; t += 1.0; }
    else if (t > 1.0 + jn) { c += 1.0; jc = jn; jn = (wwH(vec2(c + 1.0, row)) - 0.5) * 0.6; t -= 1.0; }
    float ex = min(t - jc, 1.0 + jn - t) * W, ey = min(fy, 1.0 - fy) * RH;
    float bid = c * 57.0 + row * 113.0, bed = min(ex, ey) + (wwN(bp * 9.0) - 0.5) * 0.02;
    float tilt = (wwH(vec2(bid, 9.0)) - 0.5) * (t - 0.5) * 0.5 + (wwH(vec2(bid, 4.0)) - 0.5) * (fy - 0.5) * 0.4;
    float mpp = length(fwidth(vTlW));
    float bfade = (1.0 - smoothstep(0.09, 0.22, mpp)) * ${brick.toFixed(2)};
    float zone = smoothstep(0.66, 0.8, wwF(vec2(wwA * 22.0, vTlW.y * 0.09) + 13.0));
    wwHole = step(0.955 - zone * 0.45, wwH(vec2(bid, bid * 1.7))) * bfade;
    wwBed = bed; wwFade = bfade;
    float mw = max(0.012, mpp * 0.6), mortar = (1.0 - smoothstep(mw, mw + 0.02 + mpp * 1.2, bed)) * (1.0 - smoothstep(0.05, 0.16, mpp) * 0.6);
    float tint = 0.82 + 0.3 * wwH(vec2(bid * 3.1, 7.0));
    wwHt = ((smoothstep(0.0, 0.07, bed) * (0.55 + 0.45 * wwH(vec2(bid, 3.0))) + tilt) * (1.0 - wwHole) + wwHole * -0.6 + wwN(bp * 3.0) * 0.12) * bfade;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, diffuse * 0.42, 0.45) * tint, bfade);
    diffuseColor.rgb *= mix(1.0, 0.55, mortar * bfade);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.32, 0.3, 0.28), wwHole * 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 0.88, 0.78), zone * 0.35 * bfade); }
  { float ang = atan(vTlW.z, vTlW.x) * 38.0;
    float dep = clamp((${top.toFixed(1)} - vTlW.y) / ${(top - bottom).toFixed(1)}, 0.0, 1.0);
    float stk = smoothstep(0.72, 0.92, wwN(vec2(ang * 1.7, vTlW.y * 0.025))) * smoothstep(0.25, 0.7, wwF(vec2(ang * 0.4, vTlW.y * 0.12)));
    float drip = smoothstep(0.7, 0.95, wwN(vec2(ang * 4.0, vTlW.y * 0.06 + 11.0)));
    wwWet = clamp(dep * dep * 0.8 + stk * (0.35 + dep * 0.5) + drip * dep * 0.4, 0.0, 1.0);
    float band = smoothstep(0.15, 0.4, dep) * (1.0 - smoothstep(0.65, 0.95, dep));
    wwMoss = band * smoothstep(0.55, 0.75, wwF(vec2(ang * 0.25, vTlW.y * 0.09) + 5.0));
    diffuseColor.rgb *= mix(1.0, 0.42, wwWet);
    // 青苔：成片（中段）+ 潮湿处沿灰缝 / 砖顶边长一线
    float mossLine = (1.0 - smoothstep(0.0, 0.05, wwBed)) * smoothstep(0.5, 0.7, wwF(vec2(ang * 0.6, vTlW.y * 0.2) + 21.0)) * smoothstep(0.1, 0.4, dep) * wwFade;
    wwMoss = max(wwMoss, mossLine * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.085, 0.03) * (0.7 + 0.6 * wwN(vTlW.xz * 3.0 + vTlW.y)) * mix(1.0, 0.6, wwWet), wwMoss * 0.8); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.2, wwWet * 0.8 * (1.0 - wwMoss));
  roughnessFactor = mix(roughnessFactor, 1.0, wwHole * 0.7);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 N0 = normal;
    vec3 r1 = cross(sy, N0), r2 = cross(N0, sx); float det = dot(sx, r1);
    float k = 0.07; vec3 grad = sign(det) * (dFdx(wwHt) * k * r1 + dFdy(wwHt) * k * r2);
    normal = normalize(abs(det) * N0 - grad); }`);
  };
  const key = s.customProgramCacheKey.bind(s);
  s.customProgramCacheKey = () => key() + '|wellwet2|' + brick;
  s.needsUpdate = true;
}

/** 冰湖冰面：视差气泡 + 裂纹 + 菲涅尔；r = 冰盘半径（物体空间，顶面法线朝上） */
export function iceUp(m: THREE.MeshStandardMaterial, r = 13, blob = false) {   // blob：几何带 edgeT（liquid_shape.iceSlab），冰边沿不规则岸线
  if (m.userData?.iceUp) return m;
  m.userData.iceUp = true;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIcW; varying vec3 vIcL; varying float vIcE;' + (blob ? '\nattribute float edgeT;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIcL = transformed; vIcW = (modelMatrix * vec4(transformed, 1.0)).xyz; vIcE = ' + (blob ? 'edgeT' : `length(transformed.xz) / ${r.toFixed(2)}`) + ';');
    sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIcW; varying vec3 vIcL; varying float vIcE;\n' + NOISE + `
vec2 icVor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(wwH(i + g), wwH(i + g + 17.0));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2 - d1); }
float icBub(vec2 p, float k){ vec2 i = floor(p), f = fract(p) - 0.5; float h = wwH(i + k);
  vec2 o = vec2(wwH(i + k + 3.0), wwH(i + k + 9.0)) - 0.5; float rr = 0.06 + 0.1 * wwH(i + k + 5.0);
  return step(0.72, h) * (1.0 - smoothstep(rr * 0.5, rr, length(f - o * 0.6))); }
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 V = normalize(cameraPosition - vIcW); float top = step(0.12, vIcL.y);
    vec2 pd = V.xz / max(V.y, 0.2);
    float b1 = icBub((vIcW.xz - pd * 0.12) * 3.2, 1.0), b2 = icBub((vIcW.xz - pd * 0.45) * 1.7, 7.0);
    vec2 c1 = icVor((vIcW.xz - pd * 0.05) * 0.32 + (wwN(vIcW.xz * 0.7) - 0.5) * 0.6), c2 = icVor((vIcW.xz - pd * 0.3) * 0.75 + 4.0);
    float cr = (1.0 - smoothstep(0.0, 0.03, c1.y)) * smoothstep(0.35, 0.7, wwF(vIcW.xz * 0.12 + 2.0)) * 0.8
             + (1.0 - smoothstep(0.0, 0.05, c2.y)) * smoothstep(0.45, 0.8, wwF(vIcW.xz * 0.2 + 9.0)) * 0.3;
    float cloud = wwF((vIcW.xz - pd * 0.6) * 0.35);
    float rim = smoothstep(${(1 - 1.6 / r).toFixed(3)}, 1.0, vIcE);
    float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    vec3 add = vec3(0.30, 0.48, 0.58) * (b1 * 0.35 * wwN(vIcW.xz * 0.5) + b2 * 0.22) + vec3(0.55, 0.75, 0.85) * cr * 0.45
             + vec3(0.05, 0.10, 0.14) * cloud + vec3(0.7, 0.85, 0.95) * rim * (0.35 + 0.4 * wwN(vIcW.xz * 2.5))
             + vec3(0.35, 0.5, 0.6) * fr * 0.6;
    totalEmissiveRadiance += add * top; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + wwN(vIcW.xz * 1.3) * 0.12 - 0.04, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'wellice3|' + blob;
  m.needsUpdate = true;
  return m;
}
