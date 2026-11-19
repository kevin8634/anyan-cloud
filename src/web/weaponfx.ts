// v1.2.41 写实武器专属光效（比赛版）：杖头光晕、冷光点光源、环绕魂火、旋转符文环、上升光尘。只挂在高清武器上，跟武器一起换装拆除
import * as THREE from 'three';
import { curQuality } from './gfx';
import { fractal, ribbon, addMat, ARC_PAL } from './arcgeo';   // 11-19 提示词雷电（不经 arcbolt / vfx）
import { weaponSkinMeta } from './weaponskin';

interface WFxDef { color: number; head: number; ring?: number; light?: number; motes?: number; rings?: number; halo?: number; flow?: number; emi?: number }
/** key → 光效参数（head = 光效中心在武器长度上的位置，0 = 握柄底端，1 = 顶端） */
export const WEAPON_FX: Record<string, WFxDef> = {
  weapon_bell_staff: { color: 0x6fe8ff, head: 0.82, ring: 0.2, light: 0.8, motes: 36 },
  // v1.2.42 其余 9 把各自的光效：近战武器不要杖头光环，只留刃上流光（flow）+ 少量火星；施法 / 药瓶有头部光
  weapon_rock_wand: { color: 0xffb040, head: 0.9, ring: 0.28, light: 0.5, motes: 22, rings: 1, halo: 0.8 },
  weapon_flask: { color: 0x6fe8ff, head: 0.45, ring: 0.6, light: 0.6, motes: 18, rings: 0, halo: 0.7 },
  weapon_time_chakram: { color: 0xffd27a, head: 0.5, ring: 0.55, light: 0.35, motes: 20, rings: 1, halo: 0 },
  weapon_bell_sword: { color: 0x6fe8ff, head: 0.62, ring: 0.12, light: 0.3, motes: 6, emi: 0.9, rings: 0, halo: 0 },
  weapon_rock_greatsword: { color: 0xff7a2a, head: 0.6, ring: 0.1, light: 0.35, motes: 8, emi: 1.2, rings: 0, halo: 0, flow: 1.3 },
  weapon_rock_axe: { color: 0xff7a2a, head: 0.85, ring: 0.2, light: 0.3, motes: 6, rings: 0, halo: 0, flow: 1.3 },
  weapon_rock_greataxe: { color: 0xff6a20, head: 0.85, ring: 0.18, light: 0.45, motes: 8, rings: 0, halo: 0, flow: 1.4 },
  weapon_rock_mace: { color: 0xff8a30, head: 0.85, ring: 0.25, light: 0.45, motes: 8, rings: 0, halo: 0.5, flow: 1.3 },
  weapon_rock_dagger: { color: 0xff4a3a, head: 0.6, ring: 0.15, light: 0.25, motes: 5, rings: 0, halo: 0, flow: 1.2 },
};

let _glowTex: THREE.Texture | null = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); _glowTex = new THREE.CanvasTexture(c); return _glowTex;
}
let _runeTex: THREE.Texture | null = null;
function runeTex() {
  if (_runeTex) return _runeTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 8); x.lineTo(512, 8); x.moveTo(0, 56); x.lineTo(512, 56); x.stroke();
  // v1.2.42 程序画符文（系统字体多半没有卢恩字母，fillText 会画成方框）
  let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  x.lineWidth = 3; x.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const cx = 21 + i * 42.6; x.beginPath(); x.moveTo(cx, 16); x.lineTo(cx, 50);
    const k = 1 + Math.floor(rnd() * 3); for (let j = 0; j < k; j++) { const y0 = 16 + rnd() * 26, d = rnd() < 0.5 ? -1 : 1; x.moveTo(cx, y0); x.lineTo(cx + d * (6 + rnd() * 7), y0 + 5 + rnd() * 9); }
    if (rnd() < 0.35) { x.moveTo(cx - 8, 33); x.lineTo(cx + 8, 33); } x.stroke(); }
  _runeTex = new THREE.CanvasTexture(c); _runeTex.wrapS = THREE.RepeatWrapping; return _runeTex;
}
const add = (c: number, o = 1) => ({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });

// ---------------------------------------------------------------- v1.2.42 流光着色器（所有高清武器）
// Fresnel 边缘光（掠射角发主题色光）+ 发光遮罩上的 UV 滚动能量脉络（emissive × 滚动噪声），按画质调强度（高质量档最强）
const FLOW_DEFAULT = 0xffb060;
export const FLOW_COLOR: Record<string, number> = { weapon_bell_staff: 0x6fe8ff };
const FLOW_NOISE = `
float wf_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wf_n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wf_h(i), wf_h(i + vec2(1, 0)), f.x), mix(wf_h(i + vec2(0, 1)), wf_h(i + vec2(1, 1)), f.x), f.y); }`;
/** 给高清武器材质打流光补丁；返回 uniforms（每帧改 uT） */
export function flowPatch(m: THREE.Mesh, color: number, len: number) {
  const mat = m.material as THREE.MeshStandardMaterial; if (!mat?.userData?.hd || mat.userData.flow) return mat?.userData?.flow ?? null;
  const k = curQuality === 'ultra' ? 1.0 : curQuality === 'high' ? 0.6 : curQuality === 'medium' ? 0.4 : 0;
  const u = { uT: { value: 0 }, uFlowCol: { value: new THREE.Color(color) }, uFlowK: { value: k }, uLen: { value: len } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vWfPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWfPos = position;');
    sh.fragmentShader = 'uniform float uT, uFlowK, uLen; uniform vec3 uFlowCol; varying vec3 vWfPos;\n' + FLOW_NOISE + '\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 wfN = normal; float wfL = length(wfN); wfN = wfL > 1e-4 ? wfN / wfL : vec3(0.0, 0.0, 1.0);   // 退化法线（简化后的零长度）防 NaN：NaN 进泛光会糊成大白球
        vec3 wfV = length(vViewPosition) > 1e-4 ? normalize(vViewPosition) : vec3(0.0, 0.0, 1.0);
        float fres = pow(1.0 - clamp(abs(dot(wfN, wfV)), 0.0, 1.0), 3.0);
        float y = vWfPos.y / max(0.05, uLen);
        float vein = wf_n(vec2(vWfPos.x * 9.0 + vWfPos.z * 7.0, y * 6.0 - uT * 1.6)) * wf_n(vec2(y * 14.0 + uT * 0.7, vWfPos.x * 13.0));
        float band = smoothstep(0.0, 0.08, 0.08 - abs(fract(y * 0.9 - uT * 0.32) - 0.5) + 0.0);
        float lum = dot(totalEmissiveRadiance, vec3(0.299, 0.587, 0.114));
        // 只在发光遮罩的「中亮区」加脉络（已经很亮的宝石不再叠加），总发光封顶 2：小亮点进泛光的低分辨率层会被放大成大光球
        float wfA = clamp(fres * 0.18 + vein * smoothstep(0.05, 0.3, lum) * (1.0 - smoothstep(0.4, 0.9, lum)) * 0.4 + band * 0.1, 0.0, 0.35);
        totalEmissiveRadiance = min(totalEmissiveRadiance + uFlowCol * uFlowK * wfA, max(totalEmissiveRadiance, vec3(1.0)));
      }`);
  };
  mat.customProgramCacheKey = () => 'wflow' + (k > 0 ? 1 : 0);
  mat.needsUpdate = true; mat.userData.flow = u; return u;
}

// ========== 11-19 铸造台提示词特效（Rhett「缠着雷电的泛光紫宝石镶金法杖」没闪电没发光）==========
// Lux3D 只出模型 + 贴图；电弧 / 光晕是游戏特效。铸造品（forge_*，meta.prompt）和铸造台挑中的武器库件（setWeaponFxPrompt 记下）
// 按提示词关键词挂：雷 / 电 → 缠绕电弧 + 头部电冠；发光 / 泛光 / 宝石 / 水晶 → 头部光晕 + 点光 + 魂火；颜色词 → 光效颜色。?off=promptfx 关
const LS_FXP = 'darkrock_wfx_prompt';
let fxp: Record<string, string> = {};
try { fxp = JSON.parse(localStorage.getItem(LS_FXP) ?? '{}') ?? {}; } catch { fxp = {}; }
const pfxOff = (() => { try { return /(?:^|[?&])off=[^&]*\bpromptfx\b/.test(location.search); } catch { return false; } })();
/** 铸造台退回武器库时记下这把用的是哪句提示词（换别的提示词再挑中同一把会覆盖） */
export function setWeaponFxPrompt(key: string, prompt: string) { fxp[key] = prompt; try { localStorage.setItem(LS_FXP, JSON.stringify(fxp)); } catch { /* 忽略 */ } }
const promptOf = (key: string): string => { const m = weaponSkinMeta(key) as { prompt?: string } | null; return (m?.prompt ?? fxp[key] ?? '').trim(); };
const COLOR_KW: [RegExp, number][] = [[/紫/, 0xb06cff], [/蓝|碧/, 0x5fb0ff], [/冰|霜|雪/, 0x9fe4ff], [/青/, 0x4fe0d0], [/绿|翠|毒/, 0x6aff8a], [/血|赤|红/, 0xff3a3a], [/火|炎|焰|熔|燃/, 0xff7a2a], [/圣|神|日/, 0xffe9a0], [/暗|影|虚空|深渊/, 0x9a5aff], [/黄/, 0xffd860], [/白/, 0xeaf4ff], [/金/, 0xffcf60], [/银/, 0xdfe8ff]];
export interface PromptFx { def: WFxDef; bolt: boolean; glow: boolean; color: number }
/** 解析提示词；什么都没命中 → null（保持原样：只有刃上流光） */
export function promptFx(prompt: string): PromptFx | null {
  const p = prompt ?? ''; if (!p) return null;
  const bolt = /雷|电|闪电|霹雳/.test(p), glow = /光|亮|辉|耀|宝石|水晶|晶|魔力|符文|灵/.test(p);
  // 颜色：取最早出现的颜色词；「镶金 / 银柄」这类材质词只在没有别的颜色时才用
  let color = 0, at = 1e9, metal = 0;
  for (const [re, c] of COLOR_KW) { const m = re.exec(p); if (!m) continue; if (c === 0xffcf60 || c === 0xdfe8ff) { if (!metal) metal = c; continue; } if (m.index < at) { at = m.index; color = c; } }
  if (!color) color = metal;
  if (!bolt && !glow && !color) return null;
  if (!color) color = bolt ? 0x8f8cff : 0x6fe8ff;
  const caster = /杖|魔棒|法棒|宝珠|法球|法典|魔法书/.test(p);
  const def: WFxDef = caster
    ? { color, head: 0.9, ring: glow ? 0.14 : 0.1, light: glow ? 1.0 : 0.5, motes: glow ? 30 : 12, rings: glow ? 1 : 0, halo: glow ? 1.1 : 0.5 }
    : { color, head: 0.72, ring: 0.12, light: glow ? 0.6 : 0.3, motes: glow ? 14 : 6, rings: 0, halo: glow ? 0.6 : 0, flow: 1.3, emi: 1.2 };
  return { def, bolt, glow, color };
}
/** 武器上的缠绕电弧 + 头部电冠：每 0.06 秒重生形状；返回每帧更新 */
function weaponArcs(g: THREE.Object3D, len: number, anchor: number, headK: number, purple: boolean): (t: number, k: number) => void {
  const pal = purple ? ARC_PAL.arcane : ARC_PAL.nature, low = curQuality === 'low';
  const root = new THREE.Group(); root.name = 'wfx_bolt'; g.add(root);
  const yH = len * (headK - anchor), y0 = len * (0.12 - anchor), w = Math.max(0.006, len * 0.006);
  const outer = addMat(pal[0], 0.85), branch = addMat(pal[1], 0.7), core = addMat(pal[2], 1);
  const light = new THREE.PointLight(pal[1], 0.9, len * 1.4, 2); light.position.y = yH; root.add(light);
  const nWrap = low ? 1 : 3, nCrown = low ? 2 : 4;
  let meshes: THREE.Mesh[] = [], next = 0;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rebuild = () => {
    for (const m of meshes) { root.remove(m); m.geometry.dispose(); } meshes = [];
    const push = (pts: THREE.Vector3[], wd: number, m: THREE.Material) => { const me = new THREE.Mesh(ribbon(pts, wd), m); me.frustumCulled = false; root.add(me); meshes.push(me); };
    for (let i = 0; i < nWrap; i++) {   // 沿杖身螺旋缠绕上去
      if (Math.random() < 0.25) continue;
      const a0 = Math.random() * Math.PI * 2, turns = 1.2 + Math.random(), ys = y0 + (yH - y0) * Math.random() * 0.5, r = len * (0.035 + Math.random() * 0.02), pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 6; j++) { const k = j / 6, a = a0 + k * turns * Math.PI * 2; pts.push(V(Math.cos(a) * r, ys + (yH - ys) * k, Math.sin(a) * r)); }
      const fine: THREE.Vector3[] = [];
      for (let j = 0; j < pts.length - 1; j++) { const seg = fractal(pts[j], pts[j + 1], 2, 0.18); if (j) seg.shift(); fine.push(...seg); }
      push(fine, w * 1.6, outer); push(fine, w * 0.5, core);
    }
    for (let i = 0; i < nCrown; i++) {   // 头部向外炸开的电冠
      if (Math.random() < 0.35) continue;
      const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 1.2, R = len * (0.1 + Math.random() * 0.1);
      const end = V(Math.cos(a) * Math.cos(el) * R, yH + Math.sin(el) * R, Math.sin(a) * Math.cos(el) * R);
      const pts = fractal(V(0, yH, 0), end, 3, 0.3); push(pts, w * 1.1, branch); push(pts, w * 0.35, core);
    }
  };
  return (t: number, k: number) => {
    if (t >= next) { rebuild(); next = t + 0.06 + Math.random() * 0.04; }
    const f = (0.65 + 0.35 * Math.random()) * k; outer.opacity = 0.85 * f; branch.opacity = 0.7 * f; core.opacity = f;
    light.intensity = (0.5 + Math.random() * 0.9) * k; root.visible = k > 0.05;
  };
}

/** 给武器网格 g（makeGlbProp 的结果，原点在握点，+Y 朝武器头，长度 len、握点比例 anchor）挂光效；返回每帧更新函数 */
export function attachWeaponFx(g: THREE.Object3D, key: string, len: number, anchor: number): ((t: number, dt: number) => void) | null {
  const pf = WEAPON_FX[key] || pfxOff ? null : promptFx(promptOf(key));   // 11-19 铸造品按提示词挂特效
  const d = WEAPON_FX[key] ?? pf?.def;
  const arcs = pf?.bolt ? weaponArcs(g, len, anchor, pf.def.head, pf.color === 0xb06cff || pf.color === 0x9a5aff) : null;
  const fu = (g as THREE.Mesh).isMesh && d?.flow !== 0 ? flowPatch(g as THREE.Mesh, d?.color ?? FLOW_COLOR[key] ?? FLOW_DEFAULT, len) : null;
  if (fu && d?.flow) fu.uFlowK.value *= d.flow;
  // v1.2.48 收纳时（userData.stowK → 0，weaponstow.ts 写入）流光降到 30%
  const fk0 = fu ? fu.uFlowK.value : 0, stowK = () => (g.userData.stowK as number | undefined) ?? 1;
  if (!d) return fu ? (t: number) => { fu.uT.value = t; fu.uFlowK.value = fk0 * (0.3 + 0.7 * stowK()); } : null;
  if (arcs) { const inner = attachCore(g, key, len, anchor, d, fu, fk0, stowK); return (t: number, dt: number) => { inner(t, dt); arcs(t, stowK()); }; }
  return attachCore(g, key, len, anchor, d, fu, fk0, stowK);
}
function attachCore(g: THREE.Object3D, key: string, len: number, anchor: number, d: WFxDef, fu: ReturnType<typeof flowPatch> | null, fk0: number, stowK: () => number): (t: number, dt: number) => void {
  const col = new THREE.Color(d.color), y = len * (d.head - anchor), R = len * (d.ring ?? 0.15);
  const root = new THREE.Group(); root.position.y = y; root.name = 'wfx_' + key; g.add(root);
  // 1 杖头两层光晕（远看像泛光 bloom）
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), ...add(0xffffff, 0.85) })); core.scale.setScalar(R * 1.1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), ...add(d.color, 0.4) })); halo.scale.setScalar(R * 2.2);
  const hk = d.halo ?? 1; core.visible = halo.visible = hk > 0; core.scale.multiplyScalar(hk || 1); halo.scale.multiplyScalar(hk || 1);
  root.add(core, halo);
  // 2 冷光点光源：照亮持杖者的手臂和脸
  const light = new THREE.PointLight(d.color, d.light ?? 1.5, len * 1.6, 2); root.add(light);
  // 3 两道斜着旋转的符文环
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < (d.rings ?? 2); i++) {
    const rt = runeTex().clone(); rt.needsUpdate = true; rt.repeat.set(2, 1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R * (1.25 + i * 0.35), R * (1.25 + i * 0.35), R * 0.32, 48, 1, true), new THREE.MeshBasicMaterial({ map: rt, side: THREE.DoubleSide, ...add(d.color, 0.7 - i * 0.2) }));
    m.rotation.set(0.35 - i * 0.7, 0, 0.25 + i * 0.3); root.add(m); rings.push(m);
  }
  // 4 环绕魂火 + 上升光尘
  const n = d.motes ?? 30, pos = new Float32Array(n * 3), seed = Array.from({ length: n }, () => [Math.random() * Math.PI * 2, 0.6 + Math.random() * 0.9, Math.random(), Math.random() < 0.5 ? 1 : -1]);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex(), size: R * 0.42, sizeAttenuation: true, ...add(d.color, 0.95) })); root.add(pts);
  const baseI = light.intensity;
  return (t: number) => {
    if (fu) { fu.uT.value = t; fu.uFlowK.value = fk0 * (0.3 + 0.7 * stowK()); }
    const p = 0.82 + 0.18 * Math.sin(t * 2.6) + 0.06 * Math.sin(t * 7.3);
    core.material.opacity = 0.7 * p + 0.15; halo.scale.setScalar(R * 2.2 * (d.halo ?? 1) * (0.92 + 0.12 * p)); light.intensity = baseI * p * stowK();
    if (rings[0]) rings[0].rotation.y = t * 0.9; if (rings[1]) rings[1].rotation.y = -t * 0.6;
    for (let i = 0; i < n; i++) {
      const [a, r, ph, dir] = seed[i];
      if (i % 3 === 0) {   // 上升光尘：从杖头往上飘、淡出（循环）
        const k = (t * 0.35 + ph) % 1; pos[i * 3] = Math.cos(a) * R * 0.5 * r; pos[i * 3 + 1] = -R * 0.3 + k * R * 3.2; pos[i * 3 + 2] = Math.sin(a) * R * 0.5 * r;
      } else {             // 环绕魂火：椭圆轨道，上下起伏
        const w = a + t * 1.6 * dir * (0.6 + ph); pos[i * 3] = Math.cos(w) * R * r * 1.3; pos[i * 3 + 1] = Math.sin(t * 2 + a * 3) * R * 0.45; pos[i * 3 + 2] = Math.sin(w) * R * r * 1.3;
      }
    }
    pg.attributes.position.needsUpdate = true;
    // 发光遮罩呼吸：只有带头部光晕的施法武器（法杖 / 魔杖 / 药瓶）呼吸；近战按 emi 固定（钟格长剑的遮罩盖住整条剑身，太亮会在泛光里糊成光球）
    const hm = (g as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (hm?.userData?.hd) hm.emissiveIntensity = ((d.halo ?? 1) > 0 && d.rings !== 0 ? 1.4 + 0.9 * p : (d.emi ?? 1.2)) * (0.35 + 0.65 * stowK());
  };
}
