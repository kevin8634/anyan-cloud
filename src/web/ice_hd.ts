// ======================================================================
// 11-16 霜脊高地地面冰锥升级（wild.ts scatter 'icespike'）
//   不规则多棱锥簇：3–7 根、高矮粗细不一、略倾斜；底部雪堆 + 碎冰过渡
//   冰材质：MeshStandard + onBeforeCompile —— 边缘菲涅尔亮、内部偏青蓝透光、细裂纹 / 气泡噪声、太阳背光透射
//   画质：超高 / 高 = 全量；中 = 无裂纹气泡噪声；低 = 旧版（调用方保留 makeSpike）。?off=icehd 或 localStorage darkrock_cine_off 含 icehd 回旧版
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cinePatch } from './cine';
import { snowGloss } from './snow_gloss';
import { pbrTex } from './pbr_tex';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

export function iceHdOn(): boolean {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    if (`${q},${ls}`.split(',').map(s => s.trim()).includes('icehd')) return false;
  } catch { /* 读不到按开 */ }
  return curQuality !== 'low';
}

// ---------------------------------------------------------------- 材质（按颜色 + 档位缓存）
const ICE_GLSL = /* glsl */ `
varying vec3 vIceL;
float iceH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float iceN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(iceH(i), iceH(i + vec3(1,0,0)), f.x), mix(iceH(i + vec3(0,1,0)), iceH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(iceH(i + vec3(0,0,1)), iceH(i + vec3(1,0,1)), f.x), mix(iceH(i + vec3(0,1,1)), iceH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

const MATS = new Map<string, THREE.MeshStandardMaterial>();
function iceMat(color: number, detail: boolean): THREE.MeshStandardMaterial {
  const key = color.toString(16) + (detail ? 'h' : 'm'); const hit = MATS.get(key); if (hit) return hit;
  const base = new THREE.Color(color).lerp(new THREE.Color(0x14557e), 0.78);
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.18, metalness: 0.0, flatShading: true, envMapIntensity: 0.7 });
  m.userData.outlineParameters = { visible: false };
  m.onBeforeCompile = sh => {
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <common>', '#include <common>\n' + ICE_GLSL, 'icehd.vcommon');
    sh.vertexShader = cinePatch(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvIceL = position;', 'icehd.begin_vertex');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\n' + ICE_GLSL, 'icehd.fcommon');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 Vv = normalize(vViewPosition);
        float ndv = clamp(dot(normal, Vv), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);
        // 内部透光：越正对视线越"深"，偏青蓝；高处更亮更白
        float hgt = clamp(vIceL.y * 0.35 + 0.3, 0.0, 1.0);
        vec3 deep = vec3(0.02, 0.16, 0.26), bright = vec3(0.35, 0.62, 0.78);
        vec3 body = mix(deep, bright, hgt * 0.6 + fres * 0.4);
        float crack = 0.0, bub = 0.0;
        ${detail ? `
        float n1 = iceN(vIceL * vec3(5.0, 1.6, 5.0));
        crack = smoothstep(0.035, 0.0, abs(n1 - 0.5)) * 0.9;                    // 细裂纹：噪声等值线
        float n2 = iceN(vIceL * 22.0 + 3.1);
        bub = smoothstep(0.86, 0.95, n2) * (1.0 - fres);                       // 气泡：内部亮点
        ` : ''}
        reflectedLight.indirectDiffuse += body * 0.3 * (1.0 - fres * 0.5) + vec3(0.85, 0.95, 1.0) * (crack * 0.3 + bub * 0.35);
        reflectedLight.indirectSpecular += vec3(0.75, 0.9, 1.0) * fres * 0.55;   // 边缘菲涅尔亮
        #if NUM_DIR_LIGHTS > 0
        { float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 3.0);
          float thin = 0.4 + 0.6 * fres;
          reflectedLight.indirectDiffuse += min(vec3(0.45, 0.85, 1.0) * directionalLights[0].color * back * thin * 0.6, vec3(0.9)); }   // 太阳背光透射
        #endif
      }`, 'icehd.lights');
  };
  m.customProgramCacheKey = () => 'icehd' + (detail ? 'h' : 'm');
  pbrTex(m, 'ice', { s: 0.6, k: 0.75, bump: 0.5 });   // 11-16d 补写实贴图（冰裂纹、气泡）
  MATS.set(key, m);
  return m;
}
let SNOW: THREE.MeshStandardMaterial | null = null;
function snowMat() { return SNOW ??= snowGloss(pbrTex(new THREE.MeshStandardMaterial({ color: 0xf2f6fc, roughness: 0.9, metalness: 0, flatShading: true }), 'snow', { s: 0.6, bump: 0.6 })); }   // 11-17 白天降反光

// ---------------------------------------------------------------- 几何：不规则多棱锥（底环 / 中环 / 偏移尖），平面法线
function spikeGeo(R: () => number, h: number, r: number): THREE.BufferGeometry {
  const sides = 5 + Math.floor(R() * 3), lean = new THREE.Vector2((R() - 0.5) * 0.35 * r, (R() - 0.5) * 0.35 * r);
  const ring = (y: number, k: number, off: THREE.Vector2) => Array.from({ length: sides }, (_, i) => {
    const a = (i + (R() - 0.5) * 0.5) / sides * Math.PI * 2, rr = r * k * (0.7 + R() * 0.5);
    return new THREE.Vector3(Math.cos(a) * rr + off.x, y, Math.sin(a) * rr + off.y);
  });
  const b = ring(-0.15, 1, new THREE.Vector2()), mid = ring(h * (0.35 + R() * 0.2), 0.6, lean.clone().multiplyScalar(0.5));
  const tip = new THREE.Vector3(lean.x * 1.4, h, lean.y * 1.4);
  // 11-17 Rhett「冰块多边形优化，不要出现缝隙」：原来手拼三角面、底部开口、随机抖动后中环可能内凹 → 侧面折进去露出背面（黑缝）。
  //   改成对 底环 + 中环 + 尖 + 底面中心 求凸包：天然封闭、无内凹、无背面露缝；平面法线保留棱面冰感
  const g = new ConvexGeometry([...b, ...mid, tip, new THREE.Vector3(0, -0.15, 0)]);
  g.computeVertexNormals();
  return g;
}

/** 新版冰锥簇。seed 由调用方给（不占 wild.ts 的随机序列） */
export function makeIceCluster(s: number, color: number, seed: number): THREE.Group {
  let sd = (Math.floor(seed * 2147483646) % 2147483646) + 1;
  const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const detail = curQuality === 'ultra' || curQuality === 'high';
  const g = new THREE.Group(), mat = iceMat(color, detail);
  const n = 3 + Math.floor(R() * 5);
  for (let i = 0; i < n; i++) {
    const main = i === 0, h = main ? 2.2 + R() * 1.4 : 0.6 + R() * 1.9, r = (main ? 0.32 : 0.14 + R() * 0.16) * (0.8 + h * 0.12);
    const m = new THREE.Mesh(spikeGeo(R, h, r), mat);
    const a = R() * 6.28, d = main ? 0 : 0.18 + R() * 0.3;   // 11-17 外围贴近主锥，簇内不留空隙
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    const tilt = main ? R() * 0.12 : 0.12 + R() * 0.35;   // 外围的向外倾
    m.rotation.set(Math.sin(a) * tilt, R() * 6.28, -Math.cos(a) * tilt, 'YXZ');
    m.position.y = -0.12; m.castShadow = true; m.receiveShadow = false; g.add(m);   // 11-17 冰体不接硬阴影：平面棱面自阴影在棱边上出黑色细楔（看着像缝）；根部压进雪堆
  }
  // 底部雪堆（压扁的不规则球）+ 碎冰
  const mound = new THREE.IcosahedronGeometry(0.75, 1), p = mound.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const k = 0.8 + R() * 0.35; p.setXYZ(i, p.getX(i) * k * 1.25, Math.max(-0.1, p.getY(i)) * k * 0.32, p.getZ(i) * k * 1.25); }
  mound.computeVertexNormals();
  const sm = new THREE.Mesh(mound, snowMat()); sm.position.y = -0.05; sm.receiveShadow = true; g.add(sm);
  const shard = new THREE.TetrahedronGeometry(0.12, 0);
  for (let i = 0, k = 4 + Math.floor(R() * 5); i < k; i++) {
    const c = new THREE.Mesh(shard, mat), a = R() * 6.28, d = 0.7 + R() * 0.7;
    c.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); c.rotation.set(R() * 6, R() * 6, R() * 6); c.scale.setScalar(0.6 + R() * 1.1);
    c.castShadow = detail; c.receiveShadow = false; g.add(c);
  }
  g.scale.setScalar(s);
  return g;
}
