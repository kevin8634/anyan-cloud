// ======================================================================
// 11-17 Rhett「霜脊太亮：白天太阳下雪的反光太强」——雪材质的反光随日照降低（不压雪的底色，夜里保持原样）
//   · 登记的雪材质（山体门雪檐 / 雪堆 / 雪顶、冰锥簇底雪、霜岩）：白天 roughness 提到 1、envMapIntensity 降到 0.45、
//     直接 + 间接高光乘 0.35；按 daynight 的白天程度 d（海天模式 = 太阳高度）在「夜里原值 ↔ 白天值」之间插值。
//   · daynight 关闭 / 不吃昼夜的区域 = 按全日照（d = 1）。高光缩放是一个共享 uniform，只改数值不重编着色器。
//   · 着色器补丁在材质创建时挂上（首编前），不设 needsUpdate（r170 compileAsync 会因此读到空 program）。
// ======================================================================
import * as THREE from 'three';
import { cinePatch } from './cine';

/** 白天目标值 */
const DAY = { rough: 1.0, env: 0.45, spec: 0.35 };
const SPEC_U = { value: DAY.spec };
interface Entry { m: THREE.MeshStandardMaterial; rough: number; env: number }
const LIST: Entry[] = [];
let curD = 1;

/** 把一个雪材质登记为「白天降反光」。重复登记无效。 */
export function snowGloss<T extends THREE.MeshStandardMaterial>(m: T): T {
  if (m.userData.snowGloss) return m;
  m.userData.snowGloss = true;
  LIST.push({ m, rough: m.roughness, env: m.envMapIntensity });
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uSnowSpec = SPEC_U;
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <common>', '#include <common>\nuniform float uSnowSpec;', 'snowgloss.c');
    sh.fragmentShader = cinePatch(sh.fragmentShader, '#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= uSnowSpec; reflectedLight.indirectSpecular *= uSnowSpec;', 'snowgloss.spec');
  };
  m.customProgramCacheKey = () => prevKey() + '|snowgloss';
  applyOne(LIST[LIST.length - 1], curD);
  return m;
}
function applyOne(e: Entry, d: number) {
  e.m.roughness = e.rough + (DAY.rough - e.rough) * d;
  e.m.envMapIntensity = e.env + (DAY.env - e.env) * d;
}
/** daynight 每次调光时调用：d = 白天程度 0（夜）–1（日照全开） */
export function snowGlossDay(d: number) {
  d = Math.max(0, Math.min(1, d));
  if (Math.abs(d - curD) < 1e-3) return;
  curD = d;
  SPEC_U.value = 1 + (DAY.spec - 1) * d;
  for (const e of LIST) applyOne(e, d);
}
