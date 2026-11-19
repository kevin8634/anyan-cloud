// 11-18 火焰高光保色（Rhett 11-18 03:54 专长包提升 A5；画质专长包 v8 附录第 121 步「Develop the flame's highlights without bleaching them」，Fire in Ice 只学思路，代码自写）。
// 原来：火苗是 glow 材质（颜色 × 2–2.5，不做色调映射）。直接画屏幕的档（低 / 中档无后期）每个通道各自截到 1：橙色火把 (2.5, 1.0, 0.08) → (1, 1, 0.08) 成了柠檬黄；
//   走后期的档由 ACES 统一映射，高光同样往白里跑，火苗读成一团白。
// 现在：火苗材质在输出前按最大通道 L 做保色压缩，L < k 不动，超过的部分 k + (L−k)/(1+(L−k)/s)，三个通道同比缩放（色相不变）。
//   走后期：k = 1.6、s = 2.5（第 121 步原值，后面还有 ACES）；直接画屏幕：k = 0.75、s = 0.3（上限 1.05，刚好不被截断）。
//   第 121 步后半「泛光按压缩前亮度取」本轮没做（要给火焰单独写遮罩），泛光读的是压缩后的颜色。
// 只挂火把 / 篝火 / 火盆的火苗；其它发光件（符文、晶石、传送门）不动。
// ?off=flamedev（或 localStorage darkrock_cine_off 含 flamedev）回原样。
import type * as THREE from 'three';

export const FLAME_DEV_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('flamedev'); } catch { return false; } })();

/** 所有火苗材质共用一组 uniform：档位切换时只改数值，不重编 */
const U = { uFk: { value: 1.6 }, uFs: { value: 2.5 } };
/** 画质档切换时调用：composite = 这一档走后期（后面还有 ACES） */
export function flameDevelopTier(composite: boolean) { U.uFk.value = composite ? 1.6 : 0.75; U.uFs.value = composite ? 2.5 : 0.3; }

/** 给火苗材质挂保色压缩（MeshBasicMaterial，glow 材质）。?off=flamedev 时原样返回 */
export function flameDevelop<T extends THREE.Material>(m: T): T {
  if (FLAME_DEV_OFF) return m;
  m.onBeforeCompile = sh => {
    sh.uniforms.uFk = U.uFk; sh.uniforms.uFs = U.uFs;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFk, uFs;')
      .replace('#include <opaque_fragment>', [
        '#include <opaque_fragment>',
        '{ float fL = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));',
        '  if (fL > uFk) { float fe = fL - uFk; gl_FragColor.rgb *= (uFk + fe / (1.0 + fe / uFs)) / fL; } }'].join('\n'));
  };
  m.customProgramCacheKey = () => 'flamedev';
  return m;
}
