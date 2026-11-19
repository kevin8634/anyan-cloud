// ======================================================================
// I17 / I05（Rhett 11-12 00:42「都不够帅，评估完直接提升」）：DLC1 40 级六职业套装外观
//   1. SET_LOOKS 登记 set40_*：散件按主题色染（程序化装备），4 件起出整套光点（本体 gear.ts 现成逻辑）
//   2. 集齐 6 件换整身 LUX_*40（body40.ts）后：整身调色 + 边缘光 + 自发光底色（不换模型、不花钱）
//   评估（11-12 沙箱渲染 eval1111/view/s40a|b.png）：时砂 / 负棺 / 猎手最弱（单色灰褐），战士中等，炼金、法师较好。
// ======================================================================
import * as THREE from 'three';
// 11-12：不能静态 import web/gear（会连带提前读取 skills 挂载点 → dlc1「注册太晚」整包失败），改为延后动态取
import type { PackDressApi } from '../../core/ContentPacks';
import { setPieces, BODY40_MIN } from './body40';
import { propEnv } from '../../web/creatures_glb';
import { PACK_ICONS } from './icons.gen';

interface Look40 { tint: [number, number, number]; rim: number; rimK: number; emis: number; sat: number }
/** tint = 底色乘数；sat = 饱和度系数（>1 更艳）；emis = 自发光底色（暗处也能看出主题色） */
const L40: Record<string, Look40> = {
  warrior: { tint: [1.12, 1.0, 0.82], rim: 0xffc860, rimK: 0.9, emis: 0x1a1004, sat: 1.25 },   // 抛光青铜 + 金边
  mage: { tint: [0.95, 0.98, 1.1], rim: 0x9a8aff, rimK: 0.9, emis: 0x0c1036, sat: 1.15 },      // 星夜蓝 + 紫边
  chrono: { tint: [1.05, 0.96, 0.78], rim: 0x40e0ff, rimK: 1.0, emis: 0x06222a, sat: 1.35 },   // 沙金 + 时之青边（冷暖对比）
  alchemy: { tint: [1.05, 0.95, 0.9], rim: 0x9aff3a, rimK: 0.85, emis: 0x0e1a04, sat: 1.2 },  // 锈红 + 药剂绿边
  hunter: { tint: [0.66, 1.0, 0.94], rim: 0x40ffd0, rimK: 1.0, emis: 0x04201c, sat: 1.6 },     // 灰褐 → 潮青，青绿边（减粗犷感）
  coffin: { tint: [0.82, 0.84, 1.0], rim: 0xb070ff, rimK: 1.0, emis: 0x140a2a, sat: 1.3 },     // 墓灰 → 冷紫，魂紫边
};
const SET_OF: Record<string, string> = { warrior: 'set40_warrior', mage: 'set40_mage', chrono: 'set40_chrono', alchemy: 'set40_alchemy', hunter: 'set40_hunter', coffin: 'set40_coffin' };

// 1. 散件配色 + 4 件光点（aura 只能用本体四种：lava / frost / shadow / holy）
const SET40 = {
  set40_warrior: { name: '断潮巨誓', main: 0x8a6a2a, accent: 0xffc860, aura: 'holy', ornament: 'bone' },
  set40_mage: { name: '星潮咒环', main: 0x1e2a6a, accent: 0xb0a8ff, aura: 'frost', ornament: 'bone' },
  set40_chrono: { name: '沉沙钟摆', main: 0x8a6a30, accent: 0x40e0ff, aura: 'holy', ornament: 'bone' },
  set40_alchemy: { name: '沸海秘方', main: 0x7a2a1a, accent: 0x9aff3a, aura: 'lava', ornament: 'bone' },
  set40_hunter: { name: '三相潮契', main: 0x1a5a52, accent: 0x7affe0, aura: 'frost', ornament: 'bone' },
  set40_coffin: { name: '长明', main: 0x2a1e44, accent: 0xb070ff, aura: 'shadow', ornament: 'bone' },
} as const;
setTimeout(() => { void import('../../web/gear').then(m => { Object.assign(m.SET_LOOKS, SET40); }).catch(e => console.warn('40 级套装配色登记失败', e)); }, 0);

// 11-13（Rhett 22:51「原模型就可以，主要是看起来要跟图片一致，不要进游戏又变灰色；6 件集齐出符文光圈，不同职业不同颜色，光圈模型一样」）：
//   ① 不再整身乘色 / 整身均匀自发光（那就是法师的「蓝膜」、猎手发绿、负棺发紫）——保留原模型贴图；
//   ② 防发灰：给整身补环境反射（金属部位在没有天空环境光的画质下会发死灰）+ 饱和度 ×1.18、暗部对比略提；
//   ③ 6 件集齐：一个符文光圈模型（GPT 设计的 icons/fx_rune.jpg，黑底加色混合），按职业换颜色 / 位置，缓慢旋转 + 呼吸。
//   L40 / 旧调色参数保留在上面只作记录，不再使用。
interface Rune { c: number; y: number; z: number; d: number; flat: boolean; tilt?: number; spin: number }
/** y / z / d = 角色身高的比例（中心高度、前后偏移（负 = 背后）、直径）；flat = 水平（腰环 / 地环），否则竖立 */
const RUNE: Record<string, Rune> = {   // 11-13 23:10 Rhett「都在背后吧」：统一竖立在背后，只分颜色；法师按概念图贴颈后
  mage:    { c: 0xa8b8ff, y: 0.80, z: -0.10, d: 0.40, flat: false, spin: 0.25 },
  warrior: { c: 0xffc860, y: 0.70, z: -0.22, d: 0.52, flat: false, spin: 0.15 },
  chrono:  { c: 0x40e0ff, y: 0.70, z: -0.20, d: 0.50, flat: false, spin: -0.35 },
  alchemy: { c: 0x9aff3a, y: 0.70, z: -0.26, d: 0.50, flat: false, spin: 0.3 },     // 背上有药瓶，再往后一点
  hunter:  { c: 0x7affe0, y: 0.70, z: -0.24, d: 0.50, flat: false, spin: 0.2 },     // 箭袋
  coffin:  { c: 0xc080ff, y: 0.70, z: -0.42, d: 0.56, flat: false, spin: 0.3 },     // 背棺后面
};
let runeTex: THREE.Texture | null = null;
function runeRing(cls: string, H: number): THREE.Object3D | null {
  const R = RUNE[cls]; const src = PACK_ICONS['fx_rune']; if (!R || !src) return null;
  if (!runeTex) { runeTex = new THREE.TextureLoader().load(src); runeTex.colorSpace = THREE.SRGBColorSpace; runeTex.anisotropy = 4; }
  const mat = new THREE.MeshBasicMaterial({ map: runeTex, color: new THREE.Color(R.c).multiplyScalar(1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.9 });
  mat.userData.outlineParameters = { visible: false };
  // 11-14 Rhett 图二「背上的光环会有黑色方块」：贴图是黑底 jpg。①加色时不写目标透明度（角色面板是透明画布，原来整块方形 alpha 变 1 → 叠出黑方块）；
  //   ②jpg 黑底有压缩噪点，按亮度软阈值压掉（线性亮度低于 0.8% 的像素直接为 0），方形边界在亮背景前也看不出
  mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    { float rl = max( max( diffuseColor.r, diffuseColor.g ), diffuseColor.b ) / max( max( max( diffuse.r, diffuse.g ), diffuse.b ), 1e-3 ); diffuseColor.rgb *= smoothstep( 0.008, 0.05, rl ); }`); };
  mat.customProgramCacheKey = () => 'rune40-nobox';
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); disc.scale.setScalar(R.d * H); disc.renderOrder = 6; disc.castShadow = false;
  const g = new THREE.Group(); g.name = 'rune40'; g.position.set(0, R.y * H, R.z * H); g.add(disc);
  if (R.flat) disc.rotation.x = -Math.PI / 2; g.rotation.x = R.tilt ?? 0;
  let last = 0, t = Math.random() * 10;
  disc.onBeforeRender = () => { const now = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now; t += dt;
    disc.rotateZ(R.spin * dt); mat.opacity = 0.72 + 0.22 * Math.sin(t * 1.8); const k = 1 + 0.025 * Math.sin(t * 1.1); disc.scale.setScalar(R.d * H * k); };
  return g;
}
const AG = '11-13ag';
/** 防发灰：环境反射 + 饱和度 / 暗部对比（串联原有着色器钩子，幂等） */
function antiGrey(mat: THREE.MeshStandardMaterial) {
  if (mat.userData.ag === AG) return; mat.userData.ag = AG;
  if (!mat.envMap) { mat.envMap = propEnv(); mat.envMapIntensity = 0.7; }
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.18); c = pow(max(c, 0.0), vec3(1.06)) * 1.04; diffuseColor.rgb = c; }`); };
  mat.customProgramCacheKey = () => prevKey() + '|' + AG;
  mat.needsUpdate = true;
}
/** 2. 6 件整身：从挂点往上找到角色根；先清掉上一次的光圈，集齐才补环境反射 + 挂光圈 */
export function look40Dress(d: PackDressApi): void {
  const cls = d.cls ?? ''; if (!SET_OF[cls]) return;
  const probe = new THREE.Group(); probe.name = 'look40_probe';
  if (!d.attach('chest', probe)) return;
  // 往上找到角色根（rig.root 带 userData.cls）；碰到场景就停，绝不遍历整个场景
  let root: THREE.Object3D = probe;
  while (root.parent && root.userData.cls === undefined && !(root.parent as THREE.Scene).isScene) root = root.parent;
  for (let o = root.getObjectByName('rune40'); o; o = root.getObjectByName('rune40')) o.removeFromParent();
  if (setPieces(cls, d.eq as Record<string, unknown>) < BODY40_MIN) return;
  root.traverse(o => {
    const m = o as THREE.SkinnedMesh; if (!(m as THREE.Mesh).isMesh || !m.isSkinnedMesh) return;   // 只动蒙皮整身，不动武器 / 挂件
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (!mat?.color) continue;
      if (mat.userData.c40 !== undefined) { mat.color.setHex(mat.userData.c40 as number); delete mat.userData.c40; }   // 旧版调色留下的颜色复原
      if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) antiGrey(mat);
    }
  });
  // 身高按胸部挂点在角色根局部坐标里的高度推算（胸 ≈ 身高 0.72；d.H 是 KayKit 参考骨架单位，写实模型不可用；Lux 量化网格的包围盒也不准）
  root.updateMatrixWorld(true); const cy = root.worldToLocal(probe.getWorldPosition(new THREE.Vector3())).y;
  const H = cy > 0.2 ? cy / 0.72 : 2.2, ring = runeRing(cls, H); if (ring) root.add(ring);
}
