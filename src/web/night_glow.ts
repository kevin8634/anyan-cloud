// ========== 11-18 Rhett「夜间有点暗」：人物身边暖光 + 野外漂浮光点 ==========
// 1) 人物身边一盏不投影的暖色点光（半径约 9 m），强度跟昼夜时钟的夜色渐变，白天为 0。
//    灯从开局就在场景里（白天强度 0），点光个数不变，不触发整场重编着色器。?off=nightlamp 关。
// 2) 户外夜间漂浮光点：一团 Points（加性混合、闪烁、缓慢漂移），以人物为中心 34 m 方块内循环，
//    一半随人物、偏内圈（像被光吸引），一半在世界里循环（走动有视差）。光点本身不照亮，省帧率。低画质 60 个、其余 180 个。?off=nightmote 关。
// 3) 夜色暗部略提：daynight.ts 默认深夜半球光比例 0.58 → 0.64（?off=nightlift 回原值）。
import * as THREE from 'three';

const offList = (() => { try { return (new URLSearchParams(location.search).get('off') ?? '').split(',').map(s => s.trim()); } catch { return [] as string[]; } })();
export const NIGHT_LAMP_OFF = offList.includes('nightlamp');
export const NIGHT_MOTE_OFF = offList.includes('nightmote');
export const NIGHT_LIFT_OFF = offList.includes('nightlift');

const R = 17, H = 7;   // 光点方块半宽 / 高度
let lamp: THREE.PointLight | null = null;
let motes: THREE.Points | null = null, mat: THREE.ShaderMaterial | null = null;
let base: Float32Array | null = null, k = 0, t = 0;

export function initNightGlow(scene: THREE.Scene, low: boolean) {
  if (!NIGHT_LAMP_OFF) {
    lamp = new THREE.PointLight(0xffc98a, 0, 9, 1.4); lamp.castShadow = false; lamp.name = 'nightLamp';
    scene.add(lamp);
  }
  if (!NIGHT_MOTE_OFF) {
    const n = low ? 60 : 180, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // 半径偏向内圈：r = R·u^1.6，人物附近更密
      const a = Math.random() * Math.PI * 2, r = R * Math.pow(Math.random(), 1.6);
      base[i * 3] = Math.cos(a) * r; base[i * 3 + 1] = 0.4 + Math.random() * H; base[i * 3 + 2] = Math.sin(a) * r; seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uPx: { value: low ? 1 : Math.min(2, devicePixelRatio || 1) } },
      vertexShader: `attribute float seed; uniform float uT; uniform float uPx; varying float vA; varying float vS;
void main(){ vec3 p = position; float s = seed * 6.2831;
  p.x += sin(uT * 0.31 + s * 3.0) * 0.9; p.y += sin(uT * 0.47 + s) * 0.6; p.z += cos(uT * 0.27 + s * 2.0) * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uT * (1.3 + seed * 2.2) + s * 5.0), 3.0); vS = seed;
  gl_PointSize = (2.2 + seed * 2.6) * uPx * (22.0 / max(1.0, -mv.z)); }`,
      fragmentShader: `uniform float uK; varying float vA; varying float vS;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r); a = a * a * vA * uK;
  vec3 c = mix(vec3(1.0, 0.86, 0.55), vec3(0.75, 0.95, 1.0), step(0.7, vS));
  gl_FragColor = vec4(c * a * 1.4, a); }`,
    });
    motes = new THREE.Points(g, mat); motes.frustumCulled = false; motes.renderOrder = 5; motes.visible = false; motes.name = 'nightMotes';
    scene.add(motes);
  }
}

/** 每帧调；night = 0（白天）..1（深夜）；outdoor = 当前区域吃昼夜（户外）；p = 人物脚下位置 */
export function nightGlowTick(dt: number, night: number, outdoor: boolean, p: THREE.Vector3 | null) {
  const target = outdoor && p ? Math.max(0, Math.min(1, (night - 0.15) / 0.6)) : 0;
  k += (target - k) * Math.min(1, dt * 1.5); t += dt;
  if (lamp) { lamp.intensity = k * 2.2; if (p) lamp.position.set(p.x, p.y + 2.4, p.z); }
  if (motes && mat && base) {
    motes.visible = k > 0.02;
    if (!motes.visible || !p) return;
    mat.uniforms.uT.value = t; mat.uniforms.uK.value = k;
    // 一半光点随人物（基准偏内圈，像被身边暖光吸引），一半在世界里按人物位置取模循环（走动有前后视差）
    const a = (motes.geometry.getAttribute('position') as THREE.BufferAttribute), arr = a.array as Float32Array, W = R * 2;
    for (let i = 0, j = 0; i < arr.length; i += 3, j++) {
      arr[i + 1] = p.y + base[i + 1];
      if (j & 1) { arr[i] = p.x + (((base[i] * 1.6 - p.x) % W + W + R) % W - R); arr[i + 2] = p.z + (((base[i + 2] * 1.6 - p.z) % W + W + R) % W - R); }
      else { arr[i] = p.x + base[i] * 0.55; arr[i + 2] = p.z + base[i + 2] * 0.55; }
    }
    a.needsUpdate = true;
  }
}
export const nightGlowStats = () => ({ k: +k.toFixed(2), lamp: lamp?.intensity ?? null, motes: motes?.visible ?? null });
