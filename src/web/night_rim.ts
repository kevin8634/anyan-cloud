// ========== 11-18 Rhett「夜间怪物也要有亮度，不然看不见」 ==========
// 夜里（昼夜时钟的深夜程度）和常夜图（镜渊城月光）给怪物材质加一层冷色菲涅耳轮廓光 + 少量自身反照率提亮，
//   不加实时灯、不改受击闪白（闪白改的是 emissive 颜色，这里走单独的 uniform）。
//   每 0.5 秒给新出现的怪的材质打一次补丁（Toon / Standard / Physical / Phong；共享材质只打一次）。
//   强度跟着夜色渐变，白天为 0（补丁里的分支直接跳过）。?off=nightrim 关。
import * as THREE from 'three';

const OFF = (() => { try { return /(?:[?&]off=[^&]*\bnightrim\b)/.test(location.search); } catch { return false; } })();
/** x,y,z = 轮廓光颜色 × 强度；w = 反照率自提亮 */
export const NIGHT_RIM = { value: new THREE.Vector4(0, 0, 0, 0) };
const RIM_C = new THREE.Color(0x9fc4ff);
let acc = 1;
export const nightRimStats = { patched: 0, k: 0 };

function patch(m: THREE.Material) {
  if (m.userData.nightRim) return; m.userData.nightRim = true;
  const t = m as THREE.MeshStandardMaterial;
  if (!(t.isMeshStandardMaterial || (m as THREE.MeshToonMaterial).isMeshToonMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial)) return;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uNightRim = NIGHT_RIM;
    if (!sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uNightRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uNightRim.x + uNightRim.w > 0.001) {
    float nrF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
    totalEmissiveRadiance += uNightRim.xyz * (nrF * nrF * 1.6 + 0.05) + diffuseColor.rgb * uNightRim.w;
  }`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|nrim';
  m.needsUpdate = true; nightRimStats.patched++;
}

/** 每帧调；night = 0（白天）..1（深夜）；units = 当前图里活着的怪 */
export function nightRimTick(dt: number, night: number, units: Iterable<{ rig: { root: THREE.Object3D } }>) {
  if (OFF) return;
  const k = Math.max(0, Math.min(1, night)); nightRimStats.k = +k.toFixed(2);
  // 11-18 14:29 Rhett「把所有怪物身上的光膜去掉」：冷色轮廓光归零，只留反照率自提亮（夜里还看得见，不发光膜）
  NIGHT_RIM.value.set(0, 0, 0, 0.16 * k); void RIM_C;
  acc += dt; if (acc < 0.5 || k <= 0) return; acc = 0;
  for (const u of units) u.rig.root.traverse(o => { const mm = (o as THREE.Mesh).material; if (!(o as THREE.Mesh).isMesh || !mm) return; for (const m of Array.isArray(mm) ? mm : [mm]) patch(m); });
}
