// ======================================================================
// 11-16d 写实贴图层（Rhett 11-16：缺贴图的代码几何一律补 GPT 贴图，不要光面）
//   · 贴图：gpt-image-2 生成的可平铺照片质感贴图（原图 /workspace/work/pbrtex），512² webp 内嵌在 pbr_tex_data.ts（要提交，不是 .gen）
//   · 用法：pbrTex(material, '名字', { s: 每米重复次数, k: 混合强度, bump: 凹凸 })
//     世界坐标三平面采样（合并几何 / 无 UV 也能用）；颜色 = 材质原色 × 贴图 / 贴图平均亮度（保留原设计色调，只加细节和色斑）；
//     凹凸 = 贴图亮度的屏幕导数扰动法线；贴图小于约 1.5 像素后淡到平均色（不闪烁，画质专长第 12 步）。
//   · 低画质不加；?off=pbrtex（或 localStorage darkrock_cine_off 含 pbrtex）整体关，对比用。
//   · 贴图异步解码，解码完成前 uPbrOn = 0（不会黑一帧）。
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cinePatch } from './cine';
import { PBR_DATA } from './pbr_tex_data';

let offC: boolean | null = null;
export function pbrOn(): boolean {
  if (offC === null) {
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(x => x.trim()).includes('pbrtex');
    } catch { offC = false; }
  }
  return !offC && curQuality !== 'low';
}

interface Entry { tex: THREE.Texture; on: { value: number }; avg: { value: THREE.Vector3 }; avgL: { value: number } }
const cache: Record<string, Entry> = {};
function entry(name: string): Entry | null {
  const hit = cache[name]; if (hit) return hit;
  const src = PBR_DATA[name]; if (!src || typeof Image === 'undefined') return null;
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;   // 保持线性编码：着色器里自己做 sRGB→线性
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  const e: Entry = { tex, on: { value: 0 }, avg: { value: new THREE.Vector3(0.5, 0.5, 0.5) }, avgL: { value: 0.5 } };
  img.onload = () => {
    try {   // 平均色（线性空间）：8×8 缩图求均值
      const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d');
      if (x) {
        x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
        const lin = (v: number) => Math.pow(v / 255, 2.2);
        for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
        const n = d.length / 4; e.avg.value.set(r / n, g / n, b / n); e.avgL.value = Math.max(0.03, (r * 0.2126 + g * 0.7152 + b * 0.0722) / n);
      }
    } catch { /* 跨域等异常：保持 0.5 */ }
    tex.needsUpdate = true; e.on.value = 1;
  };
  img.src = src;
  cache[name] = e; return e;
}

export interface PbrOpt { s?: number; k?: number; bump?: number; rough?: number }
/** 给 MeshStandard / Physical 材质加三平面写实贴图。重复调用无效（只认第一次）。 */
export function pbrTex<T extends THREE.Material>(m: T, name: string, o: PbrOpt = {}): T {
  if (!pbrOn() || m.userData.pbrTex || !(m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;   // 只认 Standard / Physical（Toon 没有粗糙度块）
  const e = entry(name); if (!e) return m;
  m.userData.pbrTex = name;
  const s = o.s ?? 0.5, k = o.k ?? 1, bump = o.bump ?? 0.6, rough = o.rough ?? 0.25;
  const hi = curQuality === 'high' || curQuality === 'ultra';
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uPbrT = { value: e.tex }; sh.uniforms.uPbrOn = e.on; sh.uniforms.uPbrAvg = e.avg; sh.uniforms.uPbrAvgL = e.avgL;
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vPbW; varying vec3 vPbN;', 'pbr.vc');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPbW = (modelMatrix * vec4(transformed, 1.0)).xyz; vPbN = normalize(mat3(modelMatrix) * objectNormal);', 'pbr.vw');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', `#include <common>
uniform sampler2D uPbrT; uniform float uPbrOn; uniform vec3 uPbrAvg; uniform float uPbrAvgL;
varying vec3 vPbW; varying vec3 vPbN;
float pbH; float pbK;`, 'pbr.fc');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <color_fragment>', `#include <color_fragment>
pbH = 0.0; pbK = 0.0;
if (uPbrOn > 0.5) {
  vec3 N = normalize(vPbN); vec3 tw = pow(abs(N), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  vec3 P = vPbW * ${s.toFixed(3)};
  vec3 c = vec3(0.0);
  if (tw.x > 0.02) c += texture2D(uPbrT, P.zy).rgb * tw.x;
  if (tw.y > 0.02) c += texture2D(uPbrT, P.xz + 0.37).rgb * tw.y;
  if (tw.z > 0.02) c += texture2D(uPbrT, P.xy + 0.71).rgb * tw.z;
  c /= max(tw.x * step(0.02, tw.x) + tw.y * step(0.02, tw.y) + tw.z * step(0.02, tw.z), 1e-3);
  c = pow(max(c, vec3(0.0)), vec3(2.2));                                 // sRGB → 线性（自采样不走 three 的解码）
  float px = length(fwidth(P)) * 512.0;                                   // 每像素覆盖的贴图像素数
  pbK = (1.0 - smoothstep(${hi ? '1.2, 4.0' : '0.8, 2.5'}, px)) * ${k.toFixed(2)};
  vec3 rel = mix(uPbrAvg, c, pbK) / uPbrAvgL;                             // 相对平均亮度的细节 + 色斑
  diffuseColor.rgb *= clamp(rel, vec3(0.0), vec3(3.0));
  pbH = dot(c, vec3(0.2126, 0.7152, 0.0722)) / uPbrAvgL;
}`, 'pbr.col');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * mix(1.0, 1.0 + ${rough.toFixed(2)} * (1.0 - pbH), pbK), 0.03, 1.0);   // 暗处（缝、坑）更粗`, 'pbr.rough');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (pbK > 0.001) {
  float hb = pbH * ${(0.03 * bump).toFixed(4)} * pbK;
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
  vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
  float det = dot(sX, R1);
  vec2 dB = vec2(dFdx(hb), dFdy(hb));
  vec3 nb = normalize(abs(det) * normal - sign(det) * (dB.x * R1 + dB.y * R2));
  normal = (abs(det) > 1e-12 && !any(isnan(nb))) ? nb : normal;
}`, 'pbr.nrm');
  };
  m.customProgramCacheKey = () => prevKey() + '|pbr_' + name + s.toFixed(3) + k.toFixed(2) + bump.toFixed(2) + (hi ? 'h' : 'm');
  // 不设 needsUpdate：创建时就打补丁，首编前生效（r170 compileAsync 会因此读到空 program）
  return m;
}
