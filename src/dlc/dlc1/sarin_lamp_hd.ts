// 11-16 Rhett：40 级钟井萨琳「鱼油灯」升级
//   灯柱 = 营地船木灯柱 + Lux3D 黄铜船灯（camp_lux 同款件），灯笼挂在横担挂钩上随潮风摆动（双频正弦 + 偶发阵风）
//   光圈 = 光影表达：SpotLight 从灯笼向下打（光斑跟着灯笼摆）+ 地面光衰减片（平方反比衰减 + 灯笼栅格投影 + 圈外暗角）
//          + 极淡体积光锥；判定边界只留一圈断续的暖色光晕（不再是实心加色圆盘 + 硬描边）
//   ?off=sarinlamp 回旧版。熄灭（被潮气压暗）时整体 k = 0.12。
import * as THREE from 'three';
import { campPiece } from './camp_lux';
import { curQuality } from '../../web/gfx';

export type SarinLampFx = { g: THREE.Group; tick: (t: number, k: number, out: boolean) => void };

const offOn = () => { try { return /(?:[?&]off=[^&]*\bsarinlamp\b)/.test(location.search); } catch { return false; } };
export const sarinLampHdOn = () => !offOn();

const POST_H = 3.3, ARM_Y = 3.15, HOOK_Z = 0.72;

function poolMat(R: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uOff: { value: new THREE.Vector2() }, uK: { value: 1 }, uT: { value: 0 }, uR: { value: R }, uH: { value: 2.4 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec2 uOff; uniform float uK; uniform float uT; uniform float uR; uniform float uH; varying vec2 vP;
float h1(float x){ return fract(sin(x * 91.7) * 43758.5); }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main(){
  vec2 q = vP - uOff;                       // 灯笼正下方 = 光斑中心（跟着摆）
  float d = length(q);
  // 点光源照到地面的辐照度：cos / r^2（高度 uH）
  float irr = pow(uH * uH / (uH * uH + d * d), 1.5);
  // 灯笼六根竖栅的投影：角向条纹，离中心越远越宽越虚
  float a = atan(q.y, q.x) * 3.0 + 0.4;
  float bars = 1.0 - 0.55 * smoothstep(0.6, 0.95, abs(sin(a))) * smoothstep(0.35, 1.2, d) * (1.0 - smoothstep(uR * 0.9, uR * 1.3, d));
  // 灯焰跳动
  float fl = 0.88 + 0.12 * n1(uT * 7.0) ;
  // 光斑在判定半径外迅速收掉（跟 vP 中心，不随摆动，玩家看到的边界 = 判定边界）
  float r0 = length(vP);
  float edge = 1.0 - smoothstep(uR * 0.86, uR * 1.08, r0);
  // 边界：一圈断续、柔和的暖光晕（呼吸）
  float ang = atan(vP.y, vP.x);
  float ring = exp(-pow((r0 - uR) / 0.12, 2.0)) * (0.45 + 0.55 * smoothstep(0.35, 0.7, n1(ang * 5.0 + uT * 0.6)));
  vec3 warm = vec3(1.0, 0.62, 0.28);
  vec3 c = warm * irr * bars * edge * 0.55 * fl + vec3(1.0, 0.78, 0.45) * ring * 0.22;
  gl_FragColor = vec4(c * uK, 1.0);
}`,
  });
}

function coneMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uK: { value: 1 }, uTop: { value: 2.4 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uK; uniform float uTop; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float h = clamp((vY + uTop * 0.5) / uTop, 0.0, 1.0); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float f = edge * smoothstep(1.0, 0.55, h) * smoothstep(0.0, 0.25, h); gl_FragColor = vec4(vec3(1.0, 0.7, 0.38) * f * 0.07 * uK, 1.0); }',
  });
}

/** 程序化回退灯笼（没有 Lux3D 船灯件时） */
function fallbackLantern(): THREE.Group {
  const g = new THREE.Group(), brass = new THREE.MeshStandardMaterial({ color: 0x6a4a22, metalness: 0.75, roughness: 0.42 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 6), brass); top.position.y = -0.1; g.add(top);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.42, 0.025), brass); b.position.set(Math.cos(a) * 0.15, -0.4, Math.sin(a) * 0.15); g.add(b); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.06, 6), brass); base.position.y = -0.62; g.add(base);
  return g;
}

export function makeSarinLamp(R: number): SarinLampFx {
  const hi = curQuality === 'ultra' || curQuality === 'high', low = curQuality === 'low';
  const g = new THREE.Group(), rig = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.92 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, POST_H, 7), wood); post.position.y = POST_H / 2; post.rotation.z = 0.03; post.castShadow = true; rig.add(post);
  rig.position.z = -HOOK_Z; g.add(rig);   // 挂钩正好在判定圆心上方
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.9), wood); arm.position.set(0, ARM_Y, 0.38); rig.add(arm);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), wood); brace.position.set(0, ARM_Y - 0.23, 0.2); brace.rotation.x = -0.75; rig.add(brace);
  // 挂钩枢轴：灯笼绕它摆
  const pivot = new THREE.Group(); pivot.position.set(0, ARM_Y - 0.05, HOOK_Z); rig.add(pivot);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.8, roughness: 0.5 })); chain.position.y = -0.09; pivot.add(chain);
  const LH = 0.95;
  const glb = campPiece('lamppost', { h: LH }, { envK: 0.7, metal: 0.55 });
  const lan = glb ?? fallbackLantern();
  lan.position.y = glb ? -0.18 - LH : -0.18;   // Lux3D 件原点在底 → 顶对挂钩；回退件原点在顶
  pivot.add(lan);
  const flameY = -0.18 - LH * 0.42;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(2.2), toneMapped: false }));
  flame.position.y = flameY; pivot.add(flame);
  // 光：灯笼里向下打的聚光（跟着摆）+ 低强度点光补灯柱 / 周围
  const lampH = ARM_Y - 0.05 + flameY;   // 灯焰离地高度
  const spot = new THREE.SpotLight(0xffa860, 0, R * 2.6, Math.atan((R * 1.05) / lampH), 0.75, 1.3);
  spot.position.y = flameY; pivot.add(spot);
  const tgt = new THREE.Object3D(); tgt.position.y = flameY - 3; pivot.add(tgt); spot.target = tgt;
  const fill = new THREE.PointLight(0xffa050, 0, 5, 2); fill.position.y = flameY; pivot.add(fill);
  // 地面光斑（圆心 = 灯柱正下方挂点投影 → 局部 (0, HOOK_Z)；判定中心 = 灯组原点，挂点偏 0.72 → 光斑片放在原点，uOff 带上挂点偏移 + 摆动）
  const pm = poolMat(R);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R * 1.15, 56), pm); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; pool.renderOrder = 2; g.add(pool);
  pm.uniforms.uH.value = lampH;
  // 体积光锥（中 / 高档）
  let cone: THREE.Mesh | null = null;
  if (!low) { const cm = coneMat(); cm.uniforms.uTop.value = lampH; cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, R * 0.95, lampH, 28, 1, true), cm); cone.position.y = flameY - lampH / 2; pivot.add(cone); }
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  const ph = Math.random() * 10, wp = new THREE.Vector3(), lp = new THREE.Vector3();
  let gust = 0, gustT = 2 + Math.random() * 4;
  const tick = (t: number, k: number, out: boolean) => {
    // 摆动：两向双频 + 阵风（熄灭时也照摆）
    gustT -= 1 / 60; if (gustT < 0) { gust = 0.08 + Math.random() * 0.1; gustT = 4 + Math.random() * 6; } gust *= 0.985;
    const ax = (0.07 + gust) * Math.sin(t * 1.35 + ph) + 0.025 * Math.sin(t * 3.1 + ph * 1.7);
    const az = (0.05 + gust * 0.6) * Math.sin(t * 1.05 + ph * 0.6) + 0.02 * Math.sin(t * 2.7 + ph);
    pivot.rotation.set(ax, 0, az);
    const fl = 0.86 + 0.1 * Math.sin(t * 7.7 + ph) + 0.05 * Math.sin(t * 19.0 + ph * 2.0);
    spot.intensity = (hi ? 9 : 6) * k * fl; fill.intensity = (low ? 1.6 : 0.9) * k * fl;
    (flame.material as THREE.MeshBasicMaterial).color.setHex(out ? 0x553a20 : 0xffb060); if (!out) (flame.material as THREE.MeshBasicMaterial).color.multiplyScalar(2.2);
    // 灯焰在地面上的投影位置（局部）→ 光斑中心
    flame.getWorldPosition(wp); g.worldToLocal(lp.copy(wp));
    pm.uniforms.uOff.value.set(lp.x, -lp.z); pm.uniforms.uK.value = k * (0.9 + 0.1 * fl); pm.uniforms.uT.value = t;
    if (cone) (cone.material as THREE.ShaderMaterial).uniforms.uK.value = k;
  };
  tick(0, 1, false);
  return { g, tick };
}
