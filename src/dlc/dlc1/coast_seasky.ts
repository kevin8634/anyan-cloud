// ======================================================================
// DLC1 沉钟海岸 · 11-15 海天（Rhett 参考视频「程序化海上日出」）
//   11-15 移植：天体模型 / 时段色表 / 天空 GLSL / exp-sin 浪搬到本体共用件 src/web/seasky_core.ts（本体野外图也用）；
//   这里只留海岸特有的：灯塔暴风雨（40 级 Raid 区域）的风暴云翻滚 + 闪电云内发亮 + 雨幕 / 雨柱（以钩子注入共用天空）、
//   礁湾近地平线白雾、海岸平行光 / cine 共享天色接管（scene.onBeforeRender，只在海岸生效）、调试钩子 __dlc1.seasky
//   ?off=seasky（或 localStorage darkrock_cine_off 含 seasky）→ 回旧版阴天穹顶 + 旧海面
//   调试：__dlc1.seasky.setHour(h) 定住钟点（同时把本体时钟拨到 h）、release() 放开、debug()
// ======================================================================
import * as THREE from 'three';
import { curQuality } from '../../web/gfx';
import { CU, cineSnapShadow } from '../../web/cine';
import { setGameHour } from '../../web/hudclock';
import { seaSkyOn, ssU, SS_TIER, ssDefs, ssGLSL, ssState, seaSkyHour, ssFog, ssTick } from '../../web/seasky_core';

export { seaSkyOn, ssU, SS_TIER, ssDefs, ssState, seaSkyHour, ssFog };

/** 海岸天气钩子：闪电只亮闪电方向（天空局部 + 风暴云内部），风暴云翻滚，雨幕 / 雨柱 */
const COAST_HOOKS = {
  atmos: '  c += vec3(0.62, 0.66, 0.9) * ssFlash * 0.35 * pow(max(dot(d, ssFlashD), 0.0), 30.0) * storm;   // v4 闪电：天空只在闪电方向局部发亮（不再整片淡紫）',
  // 风暴云：墨蓝紫黑，底部翻滚（流动扭曲的明暗带），闪电时只有闪电方向的云内部发亮
  stormCloud: `    float roll = full > 0 ? ssFbm(cp * vec2(2.4, 0.9) + vec2(ssT * 0.05, -ssT * 0.02), 3) : 0.5;
    vec3 sc = mix(vec3(0.014, 0.016, 0.022), vec3(0.06, 0.064, 0.08), smoothstep(0.3, 0.95, b2));
    sc *= mix(0.55, 1.35, roll) * mix(1.0, 0.6, thick);
    sc += vec3(0.03, 0.022, 0.05) * smoothstep(0.0, 0.3, d.y);
    float fl = pow(max(dot(d, ssFlashD), 0.0), 26.0);
    float inner = full > 0 ? ssFbm(cq * 1.7 + 11.0, 2) : 0.5;
    sc += vec3(0.72, 0.74, 1.0) * ssFlash * 2.2 * fl * smoothstep(0.45, 0.85, inner) * (0.4 + 0.8 * thick);   // v4 闪电：只有闪电方向的云内部发亮（去掉全场底亮）
    col = mix(col, sc, storm);
`,
  // v3 风暴雨幕 / 远处雨柱：地平线附近按方位成柱的灰幕 + 竖向雨丝（v4 只在闪电方向被照亮）
  post: `
  if (storm < 0.01 || d.y > 0.4) return c;
  vec2 dh = d.xz / max(length(d.xz), 1e-4);
  float colm = smoothstep(0.42, 0.78, ssN(dh * 4.0 + vec2(ssT * 0.008, 0.0)) * 0.7 + ssN(dh * 11.0) * 0.3);
  float str = 0.65 + 0.35 * ssN(vec2(dh.x * 170.0 + dh.y * 90.0, d.y * 22.0 + ssT * 2.5));
  float hgt = 1.0 - smoothstep(-0.03, mix(0.08, 0.32, colm), d.y);
  float k = storm * (0.08 + 0.75 * colm) * hgt * str;
  vec3 veil = vec3(0.06, 0.068, 0.082) + vec3(0.6, 0.64, 0.85) * ssFlash * 0.4 * pow(max(dot(d, ssFlashD), 0.0), 10.0);   // v4 雨幕只在闪电方向被照亮
  return mix(c, veil, clamp(k, 0.0, 0.85));
`,
};
/** 11-19 海岸云量下调（Rhett「天上的云也有点多。这个云是不是可以优化下」）；?off=coastcloud 回旧。只动海岸，本体共用件 seasky_core 不改：
 *  ① 云量 ssK.w：时段表 0.42–0.50 + 礁湾 reef×0.15 → 时段表 + 礁湾 reef×0.06 − 0.20×(1 − 风暴)（晴天有效云量约 0.22–0.30；风暴时偏移归零、云量仍按 mix(…, 0.95, storm) 压满）
 *     → fbm 云阈值 th = 0.66 − cov·0.34：约 0.50–0.52 → 0.56–0.58；积云阈值 0.635 − cov·0.30：约 0.49–0.51 → 0.55–0.57
 *  ② 远处云层变薄：积云 / fbm 云 / 海面反射云的不透明度再乘 mix(0.45, 1, smoothstep(0.03, 0.30, 仰角 y))，风暴时不减（地平线一圈留蓝天 / 霞光）
 *  ③ 高空卷云不透明度 0.42 → 0.28
 *  云全在穹顶着色器里（1 次绘制，无云网格 / 精灵）；云少了，积云 dn < −ew 提前返回的像素变多，穹顶片元开销随之下降 */
export const COAST_CLOUD_LESS = !(() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('coastcloud'); } catch { return false; } })();
function lessClouds(g: string): string {
  const far = 'mix(0.45, 1.0, smoothstep(0.03, 0.30, d.y))';
  const R: [string, string][] = [
    ['float a = c * smoothstep(0.0, 0.07, d.y) * mix(0.96, 0.99, storm);', `float a = c * smoothstep(0.0, 0.07, d.y) * mix(0.96, 0.99, storm) * mix(${far}, 1.0, storm);`],
    ['float a = smoothstep(-ew, ew, dn) * smoothstep(0.0, 0.06, d.y) * 0.97;', `float a = smoothstep(-ew, ew, dn) * smoothstep(0.0, 0.06, d.y) * 0.97 * mix(${far}, 1.0, ssK2.z);`],
    ['float a = smoothstep(-0.04, 0.22, dn) * smoothstep(0.0, 0.07, d.y) * 0.95;', `float a = smoothstep(-0.04, 0.22, dn) * smoothstep(0.0, 0.07, d.y) * 0.95 * mix(${far}, 1.0, ssK2.z);`],
    ['smoothstep(0.52, 0.78, ci) * 0.42 * (1.0 - storm)', 'smoothstep(0.52, 0.78, ci) * 0.28 * (1.0 - storm)'],
  ];
  for (const [a, b] of R) { if (!g.includes(a)) { console.warn('沉钟海岸云量 patch miss', a.slice(0, 40)); continue; } g = g.split(a).join(b); }
  return g;
}
/** 共用 GLSL（含海岸天气钩子）：穹顶与海面反射都用 */
export const SS_GLSL = COAST_CLOUD_LESS ? lessClouds(ssGLSL(COAST_HOOKS)) : ssGLSL(COAST_HOOKS);

// ---------------------------------------------------------------- 穹顶材质（替换 coast_sky 的旧穹顶）
export function seaSkyDomeMaterial(base: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  const T = SS_TIER[curQuality];
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { ...base, ...ssU },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `${ssDefs(curQuality)}uniform float uStorm; varying vec3 vD;
${SS_GLSL}
void main(){
  vec3 d = normalize(vD);
  float pix = max(length(fwidth(d)), 2e-4);
  vec3 col = ssSky(d, uStorm, pix, ${T.oct}, ${T.stars}, ${T.mw}, true) * ssK3.y;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}

/** 每帧（海岸里）：算方向 + 调色板，写进 ssU；返回场景平行光该用的方向（共用件 ssTick + 海岸风暴 / 礁湾） */
export function seaSkyTick(dt: number, storm: number, reef: number, wind: number, fogFar: number) {
  return ssTick(dt, { storm, haze: reef, cover: COAST_CLOUD_LESS ? reef * 0.06 - 0.20 * (1 - storm) : reef * 0.15, wind, fogFar, minSun: 2.5 });
}

const _a = new THREE.Vector3(), _off = new THREE.Vector3();
// ---------------------------------------------------------------- 场景平行光 / cine 共享天色（scene.onBeforeRender，只在海岸）
let hookScene: THREE.Scene | null = null, prevHook: THREE.Scene['onBeforeRender'] | null = null, light: THREE.DirectionalLight | null = null;
const lightDir = new THREE.Vector3(0, 1, 0);
export function seaSkyHook(scene: THREE.Scene | null, dir: THREE.Vector3 | null) {
  if (dir) lightDir.copy(dir);
  ssState.active = !!(scene && dir);
  if (!scene || hookScene === scene) return;
  if (hookScene && prevHook) hookScene.onBeforeRender = prevHook;
  hookScene = scene; light = null;
  scene.traverse(o => { if (!light && (o as THREE.DirectionalLight).isDirectionalLight) light = o as THREE.DirectionalLight; });
  prevHook = scene.onBeforeRender;
  const prev = prevHook;
  scene.onBeforeRender = function (this: THREE.Scene, ...args: Parameters<THREE.Scene['onBeforeRender']>) {
    prev?.apply(this, args);
    if (!ssState.active) return;
    ssState.renders++;
    applyLight();
  };
  ssState.hooked = true;
}
function applyLight() {
  const L = light; const S = ssU.ssSunD.value;
  if (L) {
    _off.copy(lightDir).multiplyScalar(54);
    cineSnapShadow(L, _a.copy(L.target.position), _off);
    L.updateMatrixWorld(); L.target.updateMatrixWorld();
  }
  // cine 共享参数（雾内散射 / 天色 / 背光）：白天指向真太阳，夜里指向月光方向且不给暖色内散射
  const sv = ssU.ssK.value.y;
  if (sv > 0.001) { CU.sun[0] = S.x; CU.sun[1] = Math.max(S.y, 0.02); CU.sun[2] = S.z; } else { CU.sun[0] = lightDir.x; CU.sun[1] = lightDir.y; CU.sun[2] = lightDir.z; }
  CU.sun[3] = sv * (1 - ssU.ssK2.value.z * 0.8);
  const z = ssU.ssZen.value; CU.zen[0] = z.x; CU.zen[1] = z.y; CU.zen[2] = z.z;
  const fc = (hookScene?.fog as THREE.Fog | null)?.color;   // 地平线 = 最终雾色（含风暴 / 礁湾），不依赖本体 cineUpdate 与本模块的先后
  if (fc) { CU.hor[0] = fc.r; CU.hor[1] = fc.g; CU.hor[2] = fc.b; }
}
/** 离开海岸：停用（回调留着但不做事；本体下一帧自己把太阳放回去） */
export function seaSkyLeave() { ssState.active = false; }

/** 调试钩子（__dlc1.seasky） */
export const seaSkyApi = {
  setHour: (h: number) => { ssState.override = ((h % 24) + 24) % 24; try { setGameHour(ssState.override); } catch { /* 预览里没有时钟 UI */ } return ssState.override; },
  release: () => { ssState.override = null; },
  setMoonLag: (r: number) => { ssState.moonLag = r; },
  debug: () => ({ on: seaSkyOn(), hour: +ssState.hour.toFixed(2), frozen: ssState.override !== null, sunEl: +ssState.sunEl.toFixed(1), moonEl: +ssState.moonEl.toFixed(1), lightEl: +ssState.lightEl.toFixed(1), night: +ssState.night.toFixed(2), pal: +ssState.palIdx.toFixed(2), hooked: ssState.hooked, active: ssState.active, renders: ssState.renders, tier: curQuality, sun: ssU.ssSunD.value.toArray().map(v => +v.toFixed(3)), moon: ssU.ssMoonD.value.toArray().map(v => +v.toFixed(3)) }),
};
