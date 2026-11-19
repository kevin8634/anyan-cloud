// 模型与场景物件：角色优先用骨骼动画模型（chars.ts），其余物件用基础几何体 + 卡通材质拼
import { QL } from './ql_water_flags';   // 11-19 qlwake 河网格加密
import { LAKE_ON, LAKE_WEXT, RIVER_X0, lakeBedY } from '../data/field_lake';   // 11-19 落霞湖 qllake
import * as THREE from 'three';
import type { RoadMask } from './road2';
import { toon, glow, portalMaterial, runePlateMaterial, haloMaterial, beamMaterial, darkFlameMaterial, helixMaterial, ancientHelixMaterial, refineProp } from './gfx';
import { makeCharacter, CharAnim, useHd, NPC_MODEL_HOOKS, BODY_SCALE, classBodyOf } from './chars';
import { registerHdClass } from './rig';
import { hasIcon } from './icons';
import { texToon, splatMaterial, setSplat, waterMaterial } from './textures';
import { cineWind } from './cine';
import { flameDevelop } from './fire_develop';   // 11-18 A5 火焰高光保色（?off=flamedev）
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crAllOn, makeCrystalAny } from './crystal_hd';   // 11-18 全地图晶石升级
import { Rise, risesY } from '../core/Terrain';
import { CLASSES, ClassId } from '../data/classes';

/** 贴图会把颜色再乘一遍，物件色调往白色靠一半，避免过暗 */
export const lite = (c: number, k = 0.55) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
export function wbox(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, texName = 'wood') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), texToon(texName, lite(color)));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
export function wcyl(rt: number, rb: number, h: number, seg: number, color: number, x = 0, y = 0, z = 0, texName = 'wood') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), texToon(texName, lite(color)));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

/** 不描边（地面、草、特效、发光体） */
export function noOutline<T extends THREE.Object3D>(o: T): T {
  o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (!m) return; (Array.isArray(m) ? m : [m]).forEach(x => { x.userData.outlineParameters = { visible: false }; }); });
  return o;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt: number, rb: number, h: number, seg: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toon(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}

export interface Rig { root: THREE.Group; body: THREE.Object3D; weapon?: THREE.Object3D; legs: THREE.Object3D[]; scale: number; flash: THREE.MeshToonMaterial[]; anim?: CharAnim; tick?: (dt: number, moving: boolean) => void; }

function collectMats(g: THREE.Object3D) {
  const out: THREE.MeshToonMaterial[] = [];
  g.traverse(o => { const m = (o as THREE.Mesh).material; if (m instanceof THREE.MeshToonMaterial) out.push(m); });
  return out;
}
export function fromChar(c: NonNullable<ReturnType<typeof makeCharacter>>, scale = 1): Rig {
  c.root.scale.setScalar(scale);
  return { root: c.root, body: c.root.children[0], legs: [], scale: scale * BODY_SCALE, flash: c.mats, anim: c.anim };
}

// ---------------------------------------------------------------- 角色
/**
 * v1.2.5 写实战士的程序化金属件（免费服装包没有板甲）：两块肩甲（钢 + 金边，跟着上臂动）、胸甲（跟着上胸动）。
 * 在绑定姿势（T 姿势）下按骨骼世界坐标摆好，再 attach 到骨骼上，所以和缩放 / 骨骼轴向无关。
 */
export function ubcPlate(c: NonNullable<ReturnType<typeof makeCharacter>>, tint?: number, k = 0, steelC = 0x8a929c) {
  const steel = new THREE.Color(steelC); if (tint !== undefined) steel.lerp(new THREE.Color(tint), k);
  const mSteel = toon(steel), mGold = toon(0xc8a050), mDark = toon(0x3a3430);
  for (const m of [mSteel, mGold, mDark]) { m.userData.baseEmissive = 0; c.mats.push(m); }
  const root = c.root; root.updateMatrixWorld(true);
  const bone = (n: string) => root.getObjectByName(n);
  const wp = (n: string) => bone(n)!.getWorldPosition(new THREE.Vector3());
  if (!bone('upperarm_l') || !bone('spine_03')) return;
  const H = 2.1;
  const add = (to: string, mesh: THREE.Object3D) => { root.add(mesh); mesh.updateMatrixWorld(true); bone(to)!.attach(mesh); };
  for (const s of ['l', 'r'] as const) {
    const sh = wp(`upperarm_${s}`), el = wp(`lowerarm_${s}`), dir = el.clone().sub(sh).normalize();
    const g = new THREE.Group(); g.name = `plate_pauldron_${s}`;
    const R = H * 0.05;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mSteel); dome.scale.set(1.15, 0.72, 1.05);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, R * 0.1, 6, 24), mGold); rim.rotation.x = Math.PI / 2; rim.scale.set(1.12, 1.0, 1);
    const lame = new THREE.Mesh(new THREE.SphereGeometry(R * 0.92, 16, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.16), mSteel); lame.position.y = -R * 0.05;
    g.add(dome, rim, lame);
    g.position.copy(sh).addScaledVector(dir, R * 0.35); g.position.y += R * 0.32;
    g.rotation.z = (s === 'l' ? -1 : 1) * 0.32 * (dir.x > 0 ? 1 : -1) * (s === 'l' ? 1 : -1);
    add(`upperarm_${s}`, g);
  }
  // 胸甲：整圈包住上身（前后都有），宽度按两肩距离算
  const ch = wp('spine_03'), nk = wp('neck_01'), sw = wp('upperarm_l').distanceTo(wp('upperarm_r'));
  const gp = new THREE.Group(); gp.name = 'plate_chest';
  const W = sw * 0.5;
  const plate = new THREE.Mesh(new THREE.SphereGeometry(W, 24, 14, 0, Math.PI * 2, Math.PI * 0.2, Math.PI * 0.55), mSteel);
  plate.scale.set(1.0, 1.05, 0.8);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W * 0.08, W * 1.3, W * 0.08), mGold); ridge.position.set(0, W * 0.05, W * 0.71);
  const gorget = new THREE.Mesh(new THREE.TorusGeometry(W * 0.62, W * 0.09, 6, 24), mGold); gorget.position.y = W * 0.93; gorget.rotation.x = Math.PI / 2; gorget.scale.set(1, 0.75, 1);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(W * 0.86, W * 0.08, 5, 28), mDark); belt.position.y = -W * 0.62; belt.rotation.x = Math.PI / 2; belt.scale.set(1.0, 0.72, 1);
  gp.add(plate, ridge, gorget, belt);
  gp.position.set(ch.x, ch.y * 0.55 + nk.y * 0.45 - W * 0.2, ch.z);
  add('spine_03', gp);
}
/**
 * v1.2.18 写实法师的程序化法袍（免费服装包没有女装 / 法袍）：A 字下摆（腰到脚踝，跟着胯）、披肩（跟着上胸）、兜帽（跟着头，前脸开口）、腰带。
 * 和 ubcPlate 一样在绑定姿势下按骨骼世界坐标摆好再 attach，所以和骨骼轴向 / 缩放无关。
 */
export function ubcRobe(c: NonNullable<ReturnType<typeof makeCharacter>>, color: THREE.Color, trimC = 0xd8b060, hood = true) {
  const mRobe = toon(color), mTrim = toon(trimC), mIn = toon(color.clone().multiplyScalar(0.55));
  for (const m of [mRobe, mTrim, mIn]) { m.userData.baseEmissive = 0; m.side = THREE.DoubleSide; c.mats.push(m); }
  const root = c.root; root.updateMatrixWorld(true);
  const bone = (n: string) => root.getObjectByName(n);
  const wp = (n: string) => bone(n)!.getWorldPosition(new THREE.Vector3());
  if (!bone('pelvis') || !bone('spine_03') || !bone('Head') || !bone('foot_l')) return;
  const add = (to: string, mesh: THREE.Object3D) => { root.add(mesh); mesh.updateMatrixWorld(true); bone(to)!.attach(mesh); };
  const pv = wp('pelvis'), ft = wp('foot_l'), sp1 = wp('spine_01'), hipW = wp('thigh_l').distanceTo(wp('thigh_r'));
  // 下摆：腰（spine_01 略下）到脚踝上方，上窄下宽；两层（外袍 + 深色内衬）
  const top = sp1.y - (sp1.y - pv.y) * 0.3, bot = ft.y + (pv.y - ft.y) * 0.1, h = top - bot;
  const rT = hipW * 0.95, rB = hipW * 1.95;
  // v1.2.20 下摆改为蒙皮：顶部全跟胯，往下逐渐跟大腿（左右按方位分给两条大腿），跑 / 走时下摆随腿摆，不再被腿穿出
  const skirt = new THREE.Group(); skirt.name = 'robe_skirt';
  const belt = new THREE.Mesh(new THREE.TorusGeometry(rT * 1.02, rT * 0.09, 5, 24), mTrim); belt.rotation.x = Math.PI / 2; belt.position.y = h / 2 - rT * 0.08; belt.scale.y = 0.82;
  skirt.add(belt);
  skirt.position.set(pv.x, bot + h / 2, pv.z);
  add('pelvis', skirt);
  const legBones = ['pelvis', 'thigh_l', 'thigh_r'].map(n => bone(n) as THREE.Bone);
  if (legBones.every(b => b && (b as THREE.Bone).isBone)) {
    const skel = new THREE.Skeleton(legBones);   // 逆矩阵按当前（绑定）姿势算
    const sgnL = Math.sign(wp('thigh_l').x - pv.x) || 1;
    const skin = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
      const pos = geo.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i), x = pos.getX(i) - pv.x, t = THREE.MathUtils.clamp((top - y) / h, 0, 1);
        const leg = THREE.MathUtils.smoothstep(t, 0.02, 0.5) * 0.92;
        const r = rT + (rB - rT) * t, shareL = THREE.MathUtils.clamp(0.5 + (x * sgnL / r) * 0.9, 0, 1);
        si.set([0, 1, 2, 0], i * 4); sw.set([1 - leg, leg * shareL, leg * (1 - shareL), 0], i * 4);
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const m = new THREE.SkinnedMesh(geo, mat); m.name = name; m.frustumCulled = false; m.castShadow = true;
      root.add(m); m.updateMatrixWorld(true); m.bind(skel, m.matrixWorld.clone()); return m;
    };
    const og = new THREE.CylinderGeometry(rT, rB, h, 24, 8, true); og.scale(1, 1, 0.95); og.translate(pv.x, bot + h / 2, pv.z);
    const hg = new THREE.TorusGeometry(rB, rB * 0.04, 4, 32); hg.rotateX(Math.PI / 2); hg.scale(1, 1, 0.95); hg.translate(pv.x, bot + rB * 0.03, pv.z);
    skin(og, mRobe, 'robe_skirt_skin'); skin(hg, mTrim, 'robe_hem_skin');
  }
  // 披肩：上胸的半球壳，肩宽按两肩距离
  const ch = wp('spine_03'), nk = wp('neck_01'), sw = wp('upperarm_l').distanceTo(wp('upperarm_r'));
  const mantle = new THREE.Group(); mantle.name = 'robe_mantle';
  const W = sw * 0.72;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(W, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mRobe); shell.scale.set(1, 0.75, 0.85);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(W, W * 0.04, 4, 28), mTrim); rim.rotation.x = Math.PI / 2; rim.scale.y = 0.85;
  mantle.add(shell, rim);
  // 上身长袍：腋下到腰，跟着 spine_02（上身前后弯时一起动）
  if (bone('spine_02')) {
    const s2 = wp('spine_02'), yTop = wp('upperarm_l').y + (nk.y - wp('upperarm_l').y) * 0.55, yBot = top - h * 0.04, th = yTop - yBot;
    const tunic = new THREE.Mesh(new THREE.CylinderGeometry(sw * 0.4, rT * 1.02, th, 18, 2, true), mRobe); tunic.name = 'robe_tunic'; tunic.scale.z = 1.0;
    const col = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.1, th * 0.9, sw * 0.03), mTrim); col.position.set(0, 0, sw * 0.27); tunic.add(col);
    tunic.position.set(s2.x, yBot + th / 2, s2.z + sw * 0.05);
    add('spine_02', tunic);
  }
  mantle.position.set(ch.x, nk.y - W * 0.55, ch.z - W * 0.04);
  add('spine_03', mantle);
  if (hood) {
    // 兜帽：头部外面一层球壳，前面开口露脸，后面垂一片
    const hd = wp('Head'), R = sw * 0.5;
    const g = new THREE.Group(); g.name = 'robe_hood';
    const shellH = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72), mRobe);
    const lining = new THREE.Mesh(new THREE.SphereGeometry(R * 0.96, 18, 12, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72), mIn);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.5, R * 0.9, 10), mRobe); tip.position.set(0, R * 0.55, -R * 0.75); tip.rotation.x = -1.1;
    g.add(shellH, lining, tip);
    g.position.set(hd.x, hd.y + R * 0.5, hd.z + R * 0.12);
    add('Head', g);
  }
}
/** v1.2.20 写实男底座没有头发网格：短发头顶罩（战士不戴游侠兜帽时用，避免光头 / 兜帽像长发）；戴头盔时 gear.ts 藏起 */
export function ubcHair(c: NonNullable<ReturnType<typeof makeCharacter>>, col = 0x3a2a1e) {
  const root = c.root; root.updateMatrixWorld(true);
  const head = root.getObjectByName('Head'), l = root.getObjectByName('upperarm_l'), r = root.getObjectByName('upperarm_r');
  if (!head || !l || !r) return;
  const m = toon(col); m.userData.baseEmissive = 0; c.mats.push(m);
  const hd = head.getWorldPosition(new THREE.Vector3()), sw = l.getWorldPosition(new THREE.Vector3()).distanceTo(r.getWorldPosition(new THREE.Vector3()));
  const R = sw * 0.33;
  const g = new THREE.Group(); g.name = 'ubc_hair';
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), m); cap.scale.set(0.92, 0.95, 1.05); cap.rotation.x = -0.32;
  g.add(cap);
  g.position.set(hd.x, hd.y + R * 0.62, hd.z - R * 0.12);
  root.add(g); g.updateMatrixWorld(true); head.attach(g);
}
/** 角色配色（创建角色时选）：0 原色，1、2 两种染色 */
export const LOOKS: Record<string, { name: string; tint?: number; k?: number; swatch: string }[]> = {
  warrior: [{ name: '原色', swatch: '#c8c8d0' }, { name: '赤铜', tint: 0xb06a3a, k: 0.3, swatch: '#b06a3a' }, { name: '玄青', tint: 0x3a5a8a, k: 0.32, swatch: '#3a5a8a' }],
  mage: [{ name: '原色', swatch: '#6a5ab0' }, { name: '翠林', tint: 0x4a9a5a, k: 0.32, swatch: '#4a9a5a' }, { name: '绯焰', tint: 0xb04040, k: 0.3, swatch: '#b04040' }],
  // 时砂行者：定稿是深蓝 + 沙金；另两种 赤陶（流沙行者）、暮紫
  // 炼金投弹手：定稿 炭黑 + 暗红；另两种 沼绿（沼泽女巫）、铜褐（蒸汽学者）
  alchemy: [{ name: '炭红', swatch: '#5a1a1a' }, { name: '沼绿', tint: 0x4a8a3a, k: 0.45, swatch: '#3a6a30' }, { name: '铜褐', tint: 0xb07a3a, k: 0.5, swatch: '#9a6a30' }],
  chrono: [{ name: '夜沙', tint: 0x2a3a6a, k: 0.15, swatch: '#22305e' }, { name: '赤陶', tint: 0xc0602a, k: 0.55, swatch: '#a0502a' }, { name: '暮紫', tint: 0x8a3ab0, k: 0.45, swatch: '#4a2a6a' }],
};
// v1.0.6 内容包职业的配色
for (const c of Object.values(CLASSES)) if (c.ext && !LOOKS[c.id]) LOOKS[c.id] = c.ext.looks;
/** 职业 → 模型 / 头像（v0.7.0：新职业都从这里取，不再到处写 mage ? : ） */
/** v1.0.6 内容包职业：本体骨骼底模 + 染色（挂件在 gear.ts 由包的 dress 生成） */
function makeExtRig(cls: string, look: number): Rig | null {
  const ext = CLASSES[cls as ClassId]?.ext; if (!ext) return null;
  const L = ext.looks[look] ?? ext.looks[0];
  // v1.2.19 写实：内容包给的 hd 规格（底座 / 服装 / 材质色 / 动作表 / 板甲），动作表和材质按职业 id 注册进 rig.ts 的表
  const hs = ext.rig.hd;
  if (hs && useHd(hs.model)) {
    registerHdClass(cls, hs.model, hs.mats, hs.clips, hs.gain);
    const ov = classBodyOf(cls), lux = ov && useHd(ov) ? ov : hs.lux;   // 11-04 职业身体覆盖（40 级套装外观）
    if (lux && hs.luxClips?.length && hs.clips) registerHdClass(cls, lux, undefined, Object.fromEntries(hs.luxClips.filter(k => hs.clips![k]).map(k => [k, hs.clips![k]])));   // 11-05 Lux 模型按需借职业动作（猎手拉弓）
    const lc = lux && useHd(lux) ? makeCharacter({ model: lux, tex: '', show: [], mats: 'lux', clipSet: cls, height: hs.height ?? ext.rig.height, tint: L?.tint, tintAmount: (L?.k ?? 0) * 0.25 }) : null;
    if (lc) { lc.root.userData.extCls = cls; lc.root.userData.lux = true; if (lux !== hs.lux) lc.root.userData.body40 = lux; return fromChar(lc); }
    const tint = L?.tint ?? ext.rig.tint, k = (L?.k ?? ext.rig.tintAmount ?? 0) * (hs.tintScale ?? 1);
    const h = makeCharacter({ model: hs.model, tex: '', show: [], mats: 'ext_' + cls, clipSet: cls, parts: hs.parts, height: hs.height ?? ext.rig.height, tint, tintAmount: Math.min(0.9, k) });
    if (h) { if (hs.plate !== undefined) ubcPlate(h, tint, k * 0.8, hs.plate); h.root.userData.extCls = cls; return fromChar(h); }
  }
  const c = makeCharacter({ ...ext.rig, tint: L?.tint ?? ext.rig.tint, tintAmount: L?.k ?? ext.rig.tintAmount });
  if (!c) return makeWarrior(0);
  c.root.userData.extCls = cls;
  return fromChar(c);
}
export function makeClassRig(cls: string, look = 0): Rig { const x = makeExtRig(cls, look); if (x) return x; return cls === 'mage' ? makeMage(look) : cls === 'chrono' ? makeChrono(look) : cls === 'alchemy' ? makeAlchemist(look) : makeWarrior(look); }
// 11-13 I10（Rhett 01:25）：六职业头像统一用 40 级套装概念图裁头部 pl_<cls>（dlc1/icons，tools/portrait/concept_heads.py）；没装 dlc1 时退回手绘 pt_*
export const portraitKey = (cls: string) => hasIcon('pl_' + cls) ? 'pl_' + cls : portraitKey0(cls);
const portraitKey0 = (cls: string) => CLASSES[cls as ClassId]?.ext ? (CLASSES[cls as ClassId].ext!.portrait ?? 'ui_class') : cls === 'mage' ? 'pt_mage' : cls === 'chrono' ? 'pt_chrono' : cls === 'alchemy' ? 'pt_alchemy' : 'pt_warrior';
/** v1.2.25 比赛版 Lux3D 职业模型（只有 assets_aholo 构建里有；商用包没有 → 返回 null 走原写实 / 经典） */
function luxClass(model: string, clipSet: string, height: number, L: { tint?: number; k?: number }, tag?: string): Rig | null {
  if (!useHd(model)) return null;
  const ov = classBodyOf(clipSet); if (ov && ov !== model && useHd(ov)) { const r = luxClass(ov, clipSet, height, L, tag); if (r) { r.root.userData.body40 = ov; return r; } }   // 11-04 职业身体覆盖（40 级套装外观）
  const c = makeCharacter({ model, tex: '', show: [], mats: 'lux', clipSet, height, tint: L.tint, tintAmount: (L.k ?? 0) * 0.25 });
  if (!c) return null; c.root.userData.lux = true; if (tag) c.root.userData[tag] = true; return fromChar(c);
}
export function makeWarrior(look = 0): Rig {
  const L = LOOKS.warrior[look] ?? LOOKS.warrior[0];
  // v1.2.0-m1 写实人形（设置「角色模型」允许且加载成功时）；否则经典 KayKit 骑士
  // v1.2.23 比赛版：Lux3D 写实战士（只有 assets_aholo 构建里有这个模型；色调用 Lux3D 原贴图，外观档只轻微染色）
  { const ov = classBodyOf('warrior'); if (ov && useHd(ov)) { const r = luxClass(ov, 'warrior', 2.1, L); if (r) { r.root.userData.body40 = ov; return r; } } }   // 11-04 22:40 战士 40 级套装整身外观
  const lux = useHd('LUX_Warrior') ? makeCharacter({ model: 'LUX_Warrior', tex: '', show: [], mats: 'warrior_lux', clipSet: 'warrior', height: 2.1, tint: L.tint, tintAmount: (L.k ?? 0) * 0.25 }) : null;
  if (lux) { lux.root.userData.lux = true; return fromChar(lux); }
  const ubc = useHd('UBC_Male') ? makeCharacter({ model: 'UBC_Male', tex: '', show: [], mats: 'warrior_ubc', clipSet: 'warrior', parts: ['Outfit_Male_Ranger'], hideBase: ['Male_Ranger_Head_Hood'], height: 2.1, tint: L.tint, tintAmount: (L.k ?? 0) * 0.6 }) : null;   // v1.2.4 UBC 底座 + 游侠套（v1.2.20 藏兜帽：兜帽从脸两侧垂下像长发）
  if (ubc) { ubcPlate(ubc, L.tint, (L.k ?? 0) * 0.8); ubcHair(ubc); }   // v1.2.5 程序化板甲：肩甲 + 胸甲
  const c = ubc
    ?? (useHd('UAL_Mannequin') ? makeCharacter({ model: 'UAL_Mannequin', tex: '', show: [], mats: 'warrior', height: 2.1, tint: L.tint, tintAmount: (L.k ?? 0) * 0.8 }) : null)
    ?? makeCharacter({ model: 'Knight', tex: 'knight', show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'], height: 2.1, tint: L.tint, tintAmount: L.k });
  if (c) return fromChar(c);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(box(0.8, 0.9, 0.5, 0x3a5fcd, 0, 1.25, 0), box(0.5, 0.5, 0.5, 0xf1c27d, 0, 1.95, 0), box(0.56, 0.2, 0.56, 0x8a8f99, 0, 2.2, 0));
  const legL = box(0.3, 0.8, 0.3, 0x5a3a1a, -0.2, 0.4, 0), legR = box(0.3, 0.8, 0.3, 0x5a3a1a, 0.2, 0.4, 0); root.add(legL, legR);
  const weapon = new THREE.Group(); weapon.add(box(0.1, 1.2, 0.1, 0xd0d4dc, 0, 0.6, 0)); weapon.position.set(0.55, 1.2, 0.25); weapon.rotation.x = Math.PI / 2.4; body.add(weapon);
  return { root, body, weapon, legs: [legL, legR], scale: 1, flash: collectMats(root) };
}

export function makeMiner(): Rig {
  const c = makeCharacter({ model: 'Rogue_Hooded', tex: 'rogue', show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'], height: 2.0, tint: 0x8a5cff, tintAmount: 0.4 });
  if (c) return fromChar(c);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(box(0.75, 0.85, 0.5, 0x6b5b3e, 0, 1.2, 0), box(0.48, 0.48, 0.48, 0xc49a6c, 0, 1.85, 0), box(0.55, 0.18, 0.55, 0xd4a017, 0, 2.15, 0));
  const legL = box(0.28, 0.75, 0.28, 0x3b3b3b, -0.18, 0.38, 0), legR = box(0.28, 0.75, 0.28, 0x3b3b3b, 0.18, 0.38, 0); root.add(legL, legR);
  return { root, body, legs: [legL, legR], scale: 1, flash: collectMats(root) };
}

export function makeBoss(): Rig {
  const c = makeCharacter({ model: 'Barbarian', tex: 'barbarian', show: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'], height: 2.1, tint: 0x7a3cff, tintAmount: 0.45, emissive: 0x12051f });
  if (c) {
    const r = fromChar(c, 1.8);
    const eye = new THREE.PointLight(0xa060ff, 3, 6); eye.position.set(0, 2.2, 0.6); c.root.add(eye);
    return r;
  }
  const r = makeMiner(); r.root.scale.setScalar(1.8); r.scale = 1.8; return r;
}

export type NpcKind = 'bran' | 'tom' | 'ayla' | 'gerda' | 'rowan' | 'qinghe' | 'ke';
export function makeNpc(kind: NpcKind): Rig {
  const c = kind === 'rowan' ? makeCharacter({ model: 'Knight', tex: 'knight', show: ['1H_Sword', 'Round_Shield', 'Knight_Cape'], height: 2.15, tint: 0x5a8a3a, tintAmount: 0.25 })
    : kind === 'qinghe' ? makeCharacter({ model: 'Mage', tex: 'mage', show: ['Mage_Cape'], height: 1.95, tint: 0x6ab060, tintAmount: 0.35 })
    : kind === 'ke' ? makeCharacter({ model: 'Rogue', tex: 'rogue', show: ['2H_Crossbow'], height: 1.9, tint: 0x8a6a3a, tintAmount: 0.4 })
    : kind === 'bran'
    ? makeCharacter({ model: 'Barbarian', tex: 'barbarian', show: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Cape', 'Barbarian_Hat'], height: 2.15 })
    : kind === 'tom' ? makeCharacter({ model: 'Rogue', tex: 'rogue', show: [], height: 1.95, tint: 0xd4a017, tintAmount: 0.2 })
    : kind === 'ayla' ? makeCharacter({ model: 'Rogue_Hooded', tex: 'rogue', show: ['2H_Crossbow', 'Rogue_Cape'], height: 2.0, tint: 0x5aa04a, tintAmount: 0.35 })
    : makeCharacter({ model: 'Barbarian', tex: 'barbarian', show: ['Mug'], height: 2.0, tint: 0xc08050, tintAmount: 0.2 });
  if (c) return fromChar(c);
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(box(0.75, 0.9, 0.5, kind === 'bran' ? 0x3a5fcd : 0x6b5b3e, 0, 1.25, 0), box(0.48, 0.48, 0.48, 0xe0b080, 0, 1.92, 0));
  return { root, body, legs: [], scale: 1, flash: collectMats(root) };
}

/** 新地图的 NPC：按模型名 + 染色生成（没有骨骼模型时退回方块） */
/** v1.2.48 内容包可以给某个 NPC 换模型：数据里写 model: '经典模型@标签'，包在 chars.NPC_MODEL_HOOKS 里按标签注册工厂（收到 NPC_KIT）；工厂返回 null（写实没加载 / 低画质）就用 @ 前的经典模型 */
export const NPC_KIT = { fromChar, ubcRobe, ubcPlate, ubcHair, classic: (model: string, tint?: number, k?: number) => makeNpcModel(model.split('@')[0], tint, k) };
export type NpcKit = typeof NPC_KIT;
export function makeNpcModel(model: string, tint?: number, k?: number): Rig {
  const at = model.indexOf('@');
  if (at >= 0) { const tag = model.slice(at + 1); model = model.slice(0, at); try { const h = NPC_MODEL_HOOKS[tag]?.(NPC_KIT, tint, k, model) as Rig | null | undefined; if (h) return h; } catch (e) { console.warn('NPC 模型钩子出错', tag, e); } }
  const show: Record<string, string[]> = { Knight: ['1H_Sword', 'Knight_Cape'], Barbarian: ['Barbarian_Cape'], Mage: ['Mage_Hat', 'Mage_Cape'], Rogue: [], Rogue_Hooded: ['Rogue_Cape'] };
  const tex: Record<string, string> = { Knight: 'knight', Barbarian: 'barbarian', Mage: 'mage', Rogue: 'rogue', Rogue_Hooded: 'rogue' };
  const c = makeCharacter({ model, tex: tex[model] ?? 'knight', show: show[model] ?? [], height: model === 'Barbarian' ? 2.15 : 2.0, tint, tintAmount: k });
  if (c) return fromChar(c);
  return makeNpc('bran');
}
/** 法师（玩家职业）：KayKit Mage，双手法杖 + 法师帽 + 披风 */
export function makeMage(look = 0): Rig {
  const L = LOOKS.mage[look] ?? LOOKS.mage[0];
  const lux = luxClass('LUX_Mage', 'mage', 2.0, L); if (lux) return lux;
  // v1.2.18 写实：UBC 女性底座 + 程序化法袍 / 披肩 / 兜帽（法袍按配色染）
  const hd = useHd('UBC_Female') ? makeCharacter({ model: 'UBC_Female', tex: '', show: [], mats: 'mage_ubc', clipSet: 'mage', height: 2.0 }) : null;
  if (hd) {
    const robe = new THREE.Color(0x4a3a9a); if (L.tint !== undefined) robe.lerp(new THREE.Color(L.tint), Math.min(1, (L.k ?? 0) * 2.2));
    ubcRobe(hd, robe, 0xd8b060);
    const r = fromChar(hd); const orb = new THREE.PointLight(0xb070ff, 1.0, 4); orb.position.set(0.5, 2.1, 0.3); hd.root.add(orb); return r;
  }
  const c = makeCharacter({ model: 'Mage', tex: 'mage', show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'], height: 2.05, tint: L.tint, tintAmount: L.k });
  if (c) {
    const r = fromChar(c);
    const orb = new THREE.PointLight(0xb070ff, 1.2, 4); orb.position.set(0.5, 2.2, 0.3); c.root.add(orb);
    return r;
  }
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  body.add(box(0.7, 0.9, 0.45, 0x3a3aa8, 0, 1.25, 0), box(0.48, 0.48, 0.48, 0xf1c27d, 0, 1.95, 0));
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), toon(0x3a3aa8)); hat.position.y = 2.55; body.add(hat);
  const legL = box(0.28, 0.8, 0.28, 0x2a2a60, -0.18, 0.4, 0), legR = box(0.28, 0.8, 0.28, 0x2a2a60, 0.18, 0.4, 0); root.add(legL, legR);
  const weapon = new THREE.Group(); weapon.add(box(0.08, 1.8, 0.08, 0x6b4a2b, 0, 0.6, 0)); weapon.position.set(0.5, 1.0, 0.2); body.add(weapon);
  return { root, body, weapon, legs: [legL, legR], scale: 1, flash: collectMats(root) };
}

/** 时砂行者（v0.7.0 玩家职业）：KayKit Rogue_Hooded 染深蓝；沙色围巾、腰间沙漏、时轮由 gear.ts 程序生成挂到骨骼上 */
export function makeChrono(look = 0): Rig {
  const L = LOOKS.chrono[look] ?? LOOKS.chrono[0];
  const lux = luxClass('LUX_Chrono', 'chrono', 2.0, L, 'chrono'); if (lux) return lux;
  // v1.2.18 写实：UBC 男性底座 + 游侠套（带兜帽）染深蓝 / 配色；围巾、腰间沙漏、时轮照旧由 gear.ts 程序生成（挂点按 HD_ATTACH 换算）
  const c = (useHd('UBC_Male') ? makeCharacter({ model: 'UBC_Male', tex: '', show: [], mats: 'chrono_ubc', clipSet: 'chrono', parts: ['Outfit_Male_Ranger'], height: 2.0, tint: L.tint, tintAmount: Math.min(0.85, (L.k ?? 0) * 1.4) }) : null)
    ?? makeCharacter({ model: 'Rogue_Hooded', tex: 'chrono', show: ['Rogue_Cape'], height: 2.0, tint: L.tint, tintAmount: L.k });
  if (c) {
    const r = fromChar(c);
    c.root.userData.chrono = true;
    return r;
  }
  const r = makeMiner(); return r;
}

/** 炼金投弹手（v0.7.1 玩家职业）：KayKit Mage + 新贴图 alchemy_texture（紫色 → 炭黑 / 暗红）；鸟嘴面具、护目镜、药瓶带、药瓶、试剂匣由 gear.ts 程序生成 */
export function makeAlchemist(look = 0): Rig {
  const L = LOOKS.alchemy[look] ?? LOOKS.alchemy[0];
  const lux = luxClass('LUX_Alchemy', 'alchemy', 2.0, L, 'alchemy'); if (lux) return lux;
  // v1.2.18 写实：UBC 男性底座 + 平民套染炭红 / 配色 + 程序化长外套下摆（学者风）；鸟嘴面具、护目镜、药瓶带由 gear.ts 生成
  const hd = useHd('UBC_Male') ? makeCharacter({ model: 'UBC_Male', tex: '', show: [], mats: 'alchemy_ubc', clipSet: 'alchemy', parts: ['Outfit_Male_Peasant'], height: 2.0, tint: L.tint, tintAmount: Math.min(0.85, (L.k ?? 0) * 1.3) }) : null;
  if (hd) { const coat = new THREE.Color(0x5e3c36);   // v1.2.20 提亮（原 0x3a2624 近黑）
  if (L.tint !== undefined) coat.lerp(new THREE.Color(L.tint), Math.min(1, (L.k ?? 0) * 1.5)); ubcRobe(hd, coat, 0xb08040, false); }
  const c = hd ?? makeCharacter({ model: 'Mage', tex: 'alchemy', show: ['Mage_Cape'], height: 2.0, tint: L.tint, tintAmount: L.k });
  if (c) { c.root.userData.alchemy = true; return fromChar(c); }
  return makeMage(look);
}

// ---------------------------------------------------------------- 腐沼神殿的怪物
/** 腐沼巨蟾：矮胖身体、大嘴、背上发光的毒疣 */
export function makeToad(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const skin = 0x5a7a2a, belly = 0xa8b060, dark = 0x2f4a18;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), toon(skin)); torso.scale.set(1.15, 0.7, 1.05); torso.position.y = 0.75; torso.castShadow = true; body.add(torso);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), toon(belly)); bel.scale.set(1.1, 0.55, 0.9); bel.position.set(0, 0.6, 0.25); body.add(bel);
  const head = new THREE.Group(); head.position.set(0, 0.95, 0.55); body.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), toon(skin)); hm.scale.set(1.25, 0.6, 0.9); head.add(hm);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 16, Math.PI), toon(dark)); mouth.rotation.set(Math.PI / 2.2, 0, Math.PI); mouth.position.set(0, -0.08, 0.28); head.add(mouth);
  [-0.32, 0.32].forEach(x => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0xd8c840)); eye.position.set(x, 0.22, 0.12); head.add(eye);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0x101010)); pu.position.set(x, 0.24, 0.26); head.add(pu);
  });
  for (let i = 0; i < 7; i++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.09 + rnd() * 0.06, 6, 4), glow(0x9aff40, 1.6)); const a = rnd() * Math.PI * 2; w.position.set(Math.cos(a) * 0.5, 1.12 + rnd() * 0.1, Math.sin(a) * 0.4 - 0.1); body.add(noOutline(w)); }
  const legs = [[-0.55, 0.45], [0.55, 0.45], [-0.6, -0.4], [0.6, -0.4]].map(([x, z], i) => {
    const leg = new THREE.Group(); leg.position.set(x, 0.45, z);
    const th = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 5), toon(skin)); th.scale.set(0.8, 1, 1.3); leg.add(th);
    const ft = box(0.3, 0.08, 0.34, dark, x > 0 ? 0.08 : -0.08, -0.38, i < 2 ? 0.12 : 0.2); leg.add(ft);
    root.add(leg); return leg;
  });
  root.scale.setScalar(1.1);
  return { root, body, legs, scale: 1.1, flash: collectMats(root) };
}

/** 腐根树妖：树干身体、树枝手臂、根须腿、发光的眼睛 */
export function makeTreant(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const bark = 0x5a4228, moss = 0x4a6a24;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.9, 7), texToon('wood', lite(bark, 0.25))); trunk.position.y = 1.55; trunk.castShadow = true; body.add(trunk);
  const crown = new THREE.Group(); crown.position.y = 2.6; body.add(crown);
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + rnd() * 0.25, 0), toon(new THREE.Color(moss).offsetHSL(rnd() * 0.04, 0, rnd() * 0.06).getHex())); b.position.set((rnd() - 0.5) * 1.1, rnd() * 0.5, (rnd() - 0.5) * 0.9); b.castShadow = true; crown.add(b); }
  [-0.17, 0.17].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(0x9aff40, 3)); e.position.set(x, 2.05, 0.46); body.add(noOutline(e)); });
  const mouth = box(0.3, 0.06, 0.05, 0x1a1008, 0, 1.78, 0.5); body.add(mouth);
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.5, 2.1, 0); arm.rotation.z = sd * -0.9; body.add(arm);
    const a1 = wcyl(0.1, 0.16, 1.2, 5, bark, 0, -0.6, 0); arm.add(a1);
    for (let k = 0; k < 3; k++) { const f = wcyl(0.03, 0.06, 0.45, 4, bark, (k - 1) * 0.1, -1.3, 0.05); f.rotation.z = (k - 1) * 0.5; arm.add(f); }
  });
  const legs = [-0.3, 0.3].map(x => {
    const leg = new THREE.Group(); leg.position.set(x, 0.7, 0);
    const l = wcyl(0.16, 0.26, 0.9, 5, bark, 0, -0.35, 0); leg.add(l);
    for (let k = 0; k < 3; k++) { const r = wcyl(0.04, 0.09, 0.6, 4, bark, 0, -0.75, 0); r.rotation.set(Math.PI / 2.6, k * 2.1, 0); leg.add(r); }
    root.add(leg); return leg;
  });
  root.scale.setScalar(1.25);
  return { root, body, legs, scale: 1.25, flash: collectMats(root) };
}

/** 沼泽祭徒：兜帽人形（KayKit），绿色调 + 自发光 */
export function makeCultist(): Rig {
  const c = makeCharacter({ model: 'Rogue_Hooded', tex: 'rogue', show: ['Rogue_Cape'], height: 2.0, tint: 0x3a8a2a, tintAmount: 0.5, emissive: 0x0a2005 });
  if (c) {
    const r = fromChar(c);
    const l = new THREE.PointLight(0x80ff40, 1.5, 5); l.position.set(0.4, 1.4, 0.4); c.root.add(l);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow(0x9aff40, 3)); orb.position.set(0.45, 1.3, 0.35); c.root.add(noOutline(orb));
    return r;
  }
  const r = makeMiner(); return r;
}

/** 缠绕藤蔓（Boss 召唤物）：一节节弯曲的藤 + 尖刺 + 顶端发光花苞，不会移动 */
export function makeVine(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  let parent: THREE.Object3D = body;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group(); seg.position.y = i === 0 ? 0 : 0.5; seg.rotation.z = (i % 2 ? 1 : -1) * 0.18; seg.rotation.x = 0.1;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 0.55, 6), toon(i % 2 ? 0x3f6a1e : 0x4f7a26)); m.position.y = 0.27; m.castShadow = true; seg.add(m);
    for (let k = 0; k < 2; k++) { const th = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), toon(0xc8c080)); th.position.set(Math.cos(k * 3 + i) * 0.17, 0.3, Math.sin(k * 3 + i) * 0.17); th.rotation.z = Math.cos(k * 3 + i) * -1.4; th.rotation.x = Math.sin(k * 3 + i) * 1.4; seg.add(th); }
    parent.add(seg); parent = seg;
  }
  const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), glow(0xd040ff, 1.8)); bud.position.y = 0.6; parent.add(noOutline(bud));
  for (let k = 0; k < 5; k++) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 3), toon(0x5a8a2a)); lf.position.set(Math.cos(k * 1.25) * 0.25, 0.45, Math.sin(k * 1.25) * 0.25); lf.rotation.set(Math.sin(k * 1.25) * 1.2, 0, -Math.cos(k * 1.25) * 1.2); parent.add(lf); }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.2, 7), toon(0x3a2a18)); base.position.y = 0.05; root.add(base);
  return { root, body, legs: [], scale: 1.2, flash: collectMats(root) };
}

/** 腐根祭司（Boss）：KayKit 法师模型染成腐绿色，头顶根须冠，身边飘着孢子光 */
export function makeRotrootBoss(): Rig {
  const c = makeCharacter({ model: 'Mage', tex: 'mage', show: ['2H_Staff', 'Mage_Cape'], height: 2.05, tint: 0x4a8a20, tintAmount: 0.55, emissive: 0x0c1a04 });
  const crown = new THREE.Group(); crown.position.y = 2.15;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7 + (i % 2) * 0.3, 4), toon(0x4a3418)); r.position.set(Math.cos(a) * 0.28, 0.3, Math.sin(a) * 0.28); r.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); crown.add(r);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glow(0x9aff40, 3)); gem.position.set(0, 0.15, 0.3); crown.add(noOutline(gem));
  if (c) {
    c.root.add(crown);
    const r = fromChar(c, 1.9);
    const l = new THREE.PointLight(0x80ff40, 3, 8); l.position.set(0, 2.4, 0.6); c.root.add(l);
    return r;
  }
  const r = makeMiner(); r.root.add(crown); r.root.scale.setScalar(1.9); r.scale = 1.9; return r;
}

/** 狼：更多段数的低多边形（头、颈鬃、尾巴、四条两节腿） */
export function makeWolf(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const fur = 0x6f6a66, dark = 0x45403d, belly = 0x9a948d;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 3, 6), toon(fur)); torso.rotation.x = Math.PI / 2; torso.position.set(0, 0.8, 0); torso.castShadow = true; body.add(torso);
  const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), toon(belly)); chest.position.set(0, 0.85, 0.42); chest.scale.set(1, 1.05, 0.9); body.add(chest);
  const mane = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 6), toon(dark)); mane.rotation.x = -Math.PI / 2.4; mane.position.set(0, 1.0, 0.45); body.add(mane);
  const head = new THREE.Group(); head.position.set(0, 1.08, 0.78); body.add(head);
  head.add(box(0.36, 0.3, 0.36, fur, 0, 0, 0));
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), toon(dark)); snout.rotation.x = Math.PI / 2; snout.rotation.y = Math.PI / 4; snout.position.set(0, -0.05, 0.32); head.add(snout);
  head.add(box(0.08, 0.06, 0.06, 0xffe066, -0.1, 0.06, 0.18), box(0.08, 0.06, 0.06, 0xffe066, 0.1, 0.06, 0.18));
  [-0.11, 0.11].forEach(x => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), toon(dark)); e.position.set(x, 0.24, -0.05); head.add(e); });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 5), toon(fur)); tail.rotation.x = -Math.PI / 1.6; tail.position.set(0, 0.95, -0.75); body.add(tail);
  const legs = [[-0.18, 0.4], [0.18, 0.4], [-0.18, -0.38], [0.18, -0.38]].map(([x, z]) => {
    const leg = new THREE.Group(); leg.position.set(x, 0.7, z);
    leg.add(box(0.14, 0.4, 0.16, fur, 0, -0.2, 0), box(0.11, 0.32, 0.12, dark, 0, -0.52, 0.02));
    root.add(leg); return leg;
  });
  return { root, body, legs, scale: 1, flash: collectMats(root) };
}

export function makeSpider(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const abd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), toon(0x3d2b4f)); abd.position.set(0, 0.7, -0.45); abd.scale.set(1, 0.85, 1.15); abd.castShadow = true; body.add(abd);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 10), glow(0xb060ff, 1.6)); stripe.position.set(0, 0.85, -0.45); stripe.rotation.x = Math.PI / 2.4; body.add(noOutline(stripe));
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), toon(0x2e1f3d)); head.position.set(0, 0.6, 0.25); body.add(head);
  for (const [x, y] of [[-0.1, 0.68], [0.1, 0.68], [-0.05, 0.75], [0.05, 0.75]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 3), glow(0xff3030, 3)); e.position.set(x, y, 0.52); body.add(noOutline(e)); }
  [-0.08, 0.08].forEach(x => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), toon(0xdddddd)); f.rotation.x = Math.PI; f.position.set(x, 0.42, 0.5); body.add(f); });
  const legs: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.22, 0.6, 0.3 - i * 0.2); leg.rotation.y = s * (0.3 - i * 0.25);
    const up = box(0.6, 0.07, 0.07, 0x1f1529, s * 0.3, 0.12, 0); up.rotation.z = s * 0.5; leg.add(up);
    const lo = box(0.07, 0.6, 0.07, 0x1f1529, s * 0.58, -0.15, 0); lo.rotation.z = -s * 0.25; leg.add(lo);
    root.add(leg); legs.push(leg);
  }
  return { root, body, legs, scale: 1, flash: collectMats(root) };
}

// ---------------------------------------------------------------- 地形
let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(xi, zi), hash(xi + 1, zi), u), THREE.MathUtils.lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
const fbm = (x: number, z: number) => vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;

/** 可走区域保持平坦，边缘起伏成山丘 */
export function groundY(x: number, z: number) {
  const edge = Math.max(Math.abs(x) - 70, z - 80, -z - 34, 0);
  const hills = Math.min(1, edge / 18) * (6 + fbm(x * 0.05, z * 0.05) * 14);
  const bumps = fbm(x * 0.15, z * 0.15) * 0.25 * (edge > 0 ? 1 : 0.0);
  return hills + bumps;
}
export function isPath(x: number, z: number) {
  const camp = Math.abs(Math.hypot(x, z - 4) - 9) < 1.6 || Math.hypot(x, z - 4) < 4.5;
  const north = Math.abs(x + Math.sin(z * 0.15) * 1.2) < 2 && z < 0 && z > -36;
  const east = Math.abs(z - 4 - Math.sin(x * 0.2)) < 1.8 && x > 10 && x < 30;
  const south = Math.abs(x - Math.sin(z * 0.2) * 0.8) < 1.8 && z > 18 && z < 42;   // 南门 → 原野石门
  // v0.9.2b 东北 → 暗岩山路（52,-30）、西南 → 腐沼栈道（-52,34）
  const seg = (ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.8; };
  const ne = seg(7, -2, 28, -6) || seg(28, -6, 52, -30), sw = seg(-7, 9, -28, 16) || seg(-28, 16, -52, 34);
  return camp || north || east || south || ne || sw;
}
export function makeTerrain(road: RoadMask | null = null) {   // 11-16e road：营地主路遮罩（营地外的路改由着色器按像素画）
  const size = 240, seg = 120;
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3), splat = new Float32Array(p.count * 3);
  // 顶点色只做明暗/色相的轻微变化（贴图负责质感）；splat = 草 / 泥土小路 / 岩石 三层权重
  const tintA = new THREE.Color(0xf2ffe0), tintB = new THREE.Color(0xd8e8b8), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = groundY(x, z);
    p.setY(i, y);
    c.copy(tintA).lerp(tintB, fbm(x * 0.08, z * 0.08));
    const path = (road ? Math.abs(Math.hypot(x, z - 4) - 9) < 1.6 || Math.hypot(x, z - 4) < 4.5 : isPath(x, z)) ? 0.9 : 0;
    const rock = y > 3 ? Math.min(1, (y - 3) / 6) : 0;
    splat.set([Math.max(0, 1 - path - rock), path * (1 - rock), rock], i * 3);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  setSplat(g, splat);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, splatMaterial(['grass', 'dirt', 'rock'], [0.11, 0.13, 0.07], null, road ? { mask: road, look: { tint: [1, 0.97, 0.92], gravel: 0.5, mud: 0.6 } } : null));
  m.receiveShadow = true;
  return noOutline(m);
}

/** 副本地面：平面 + splat（三层贴图），weight(x,z) 返回三层权重 */
export function makeFloor(w: number, d: number, layers: [string, string, string], weight: (x: number, z: number) => [number, number, number], scales: [number, number, number] = [0.12, 0.12, 0.1], bump = 0) {
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / 1.5), Math.round(d / 1.5)); g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3), splat = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (bump) p.setY(i, (fbm(x * 0.3, z * 0.3) - 0.5) * bump);
    splat.set(weight(x, z), i * 3);
    c.setScalar(0.85 + fbm(x * 0.1 + 3, z * 0.1) * 0.25);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  setSplat(g, splat);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, splatMaterial(layers, scales));
  m.receiveShadow = true;
  return noOutline(m);
}
export { fbm };

/** 草丛：一个 InstancedMesh 画几千根 */
export function makeGrass(count: number) {
  const blade = new THREE.ConeGeometry(0.07, 0.55, 3); blade.translate(0, 0.27, 0);
  const mat = cineWind(toon(0xffffff), 0.09);   // 11-14 电影感第 5 步：草随风摆
  const im = new THREE.InstancedMesh(blade, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 4; tries++) {
    const x = (rnd() - 0.5) * 180, z = (rnd() - 0.5) * 150 + 10;
    if (isPath(x, z) || groundY(x, z) > 1.5 || (Math.abs(x) < 6 && z < -26)) continue;
    if (fbm(x * 0.12, z * 0.12) < 0.42) continue;           // 成簇
    pos.set(x, groundY(x, z), z);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5));
    const h = 0.6 + rnd() * 0.9; s.set(1, h, 1);
    im.setMatrixAt(n, m4.compose(pos, q, s));
    im.setColorAt(n, col.setHSL(0.23 + rnd() * 0.07, 0.55, 0.32 + rnd() * 0.18));
    n++;
  }
  im.count = n; im.receiveShadow = true;
  return noOutline(im);
}
export function makeFlowers(count: number) {
  const g = new THREE.IcosahedronGeometry(0.09, 0); g.translate(0, 0.25, 0);
  const im = new THREE.InstancedMesh(g, toon(0xffffff), count);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const palette = [0xffe066, 0xff8fb1, 0xffffff, 0xb28dff];
  let n = 0;
  for (let t = 0; n < count && t < count * 5; t++) {
    const x = (rnd() - 0.5) * 160, z = (rnd() - 0.5) * 140 + 10;
    if (isPath(x, z) || groundY(x, z) > 1 || fbm(x * 0.2 + 7, z * 0.2) < 0.55) continue;
    im.setMatrixAt(n, m4.makeTranslation(x, groundY(x, z), z)); im.setColorAt(n, col.setHex(palette[n % 4])); n++;
  }
  im.count = n;
  return noOutline(im);
}

// ---------------------------------------------------------------- 野外物件
export function makeTree(r: () => number) {
  const g = new THREE.Group();
  g.add(cyl(0.18, 0.28, 1.6, 6, 0x6b4a2b, 0, 0.8, 0));
  const h = 1.4 + r() * 1.2, green = r() < 0.5 ? 0x2f7a3a : 0x3f8f3a;
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.5 - i * 0.35) * (0.9 + r() * 0.3), h, 7), toon(new THREE.Color(green).offsetHSL(0, 0, i * 0.04).getHex()));
    cone.position.y = 1.5 + i * h * 0.45 + h * 0.4; cone.rotation.y = r(); cone.castShadow = true; g.add(cone);
  }
  return refineProp(g, 5, 0, 0.9);
}
export function makeRoundTree(r: () => number) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.3, 2, 6, 0x7a5533, 0, 1, 0));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.5, 0), toon(new THREE.Color(0x4f9a3a).offsetHSL(r() * 0.04, 0, r() * 0.08).getHex()));
    b.position.set((r() - 0.5) * 1.2, 2.4 + r() * 0.8, (r() - 0.5) * 1.2); b.castShadow = true; g.add(b);
  }
  return refineProp(g, 4, 0, 0.9);
}
export function makeRock(size: number, color = 0x8a8478) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), texToon('rock', lite(color, 0.45), Math.max(1, Math.round(size))));
  m.castShadow = true; m.receiveShadow = true; m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); m.scale.y = 0.7 + rnd() * 0.4; return refineProp(m, 1.2, 0, 1.2);
}
export function makeTent(color: number) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.8, 6), toon(color)); t.position.y = 1.4; t.castShadow = true; g.add(t);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), toon(0x2a1a10, { side: THREE.DoubleSide })); door.position.set(0, 0.65, 2.0); door.rotation.x = -0.35; g.add(door);
  g.add(cyl(0.05, 0.05, 0.9, 4, 0x6b4a2b, 0, 3.0, 0));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), toon(0xc0392b, { side: THREE.DoubleSide })); flag.position.set(0.25, 3.3, 0); g.add(flag);
  return refineProp(g, 2.6, 0, 1);
}
export function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const r = makeRock(0.22, 0x666666); r.position.set(Math.cos(i * 0.8) * 0.7, 0.1, Math.sin(i * 0.8) * 0.7); g.add(r); }
  for (let i = 0; i < 3; i++) { const l = cyl(0.08, 0.08, 1.1, 5, 0x5a3a1a, 0, 0.15, 0); l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; g.add(l); }
  const fire = new THREE.Group(); fire.name = 'fire';
  [[0xff5a1a, 0.4, 1.0], [0xffb52e, 0.26, 0.75], [0xfff1a0, 0.14, 0.45]].forEach(([c, r, h]) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), flameDevelop(glow(c, 2.2, { transparent: true, opacity: 0.92 }))); f.position.y = 0.2 + h / 2; fire.add(f);
  });
  g.add(noOutline(fire));
  const light = new THREE.PointLight(0xff8833, 4, 14, 1.6); light.position.y = 1.2; light.name = 'fireLight'; g.add(light);
  return g;
}
export function makeBarrel() {
  const g = new THREE.Group();
  g.add(wcyl(0.38, 0.33, 0.9, 8, 0x8a5a2b, 0, 0.45, 0));
  [0.15, 0.75].forEach(y => g.add(cyl(0.4, 0.4, 0.06, 8, 0x444444, 0, y, 0)));
  return refineProp(g, 1.2, 0.5, 1);
}
export function makeCrate(s = 0.8) {
  const g = new THREE.Group();
  g.add(wbox(s, s, s, 0xa0723c, 0, s / 2, 0));
  const b1 = wbox(s * 1.02, 0.08, 0.08, 0x6b4a2b, 0, s / 2, s / 2); b1.rotation.z = Math.PI / 4; g.add(b1);
  return refineProp(g, 1, 0, 1);
}
export function makeCart() {
  const g = new THREE.Group();
  g.add(wbox(1.8, 0.5, 1.1, 0x8a5a2b, 0, 0.8, 0));
  [-0.75, 0.75].forEach(x => { const w = cyl(0.45, 0.45, 0.1, 10, 0x5a3a1a, x, 0.45, 0.62); w.rotation.x = Math.PI / 2; g.add(w); const w2 = w.clone(); w2.position.z = -0.62; g.add(w2); });
  const h = box(0.08, 0.08, 1.6, 0x6b4a2b, -1.3, 0.7, 0); h.rotation.y = Math.PI / 2; g.add(h);
  const cr = makeCrate(0.5); cr.position.set(-0.3, 1.05, 0); const br = makeBarrel(); br.position.set(0.45, 1.05, 0); br.scale.setScalar(0.7); g.add(cr, br);
  return refineProp(g, 1.6, 0.3, 1);
}
export function makeBanner(color: number) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 3.6, 6, 0x5a3a1a, 0, 1.8, 0));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4, 1, 4), toon(color, { side: THREE.DoubleSide })); cloth.position.set(0.42, 2.8, 0); cloth.name = 'cloth'; g.add(cloth);
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.22, 6), toon(0xffd34d, { side: THREE.DoubleSide })); em.position.set(0.42, 2.9, 0.01); g.add(em);
  return refineProp(g, 3, 0.3, 0.8);
}
export function makeLantern(color = 0xffb347) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.06, 2.4, 5, 0x3a3a3a, 0, 1.2, 0), box(0.5, 0.05, 0.05, 0x3a3a3a, 0.22, 2.35, 0));
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(color, 3)); lamp.position.set(0.42, 2.15, 0); g.add(noOutline(lamp));
  const l = new THREE.PointLight(color, 2, 8, 1.8); l.position.copy(lamp.position); g.add(l);
  return refineProp(g, 2, 0.6, 1);
}
export function makeFence(len: number) {
  const g = new THREE.Group();
  for (let i = 0; i <= len; i++) g.add(wcyl(0.08, 0.1, 1.3, 5, 0x7a5530, i, 0.65, 0));
  [0.45, 0.95].forEach(y => g.add(wbox(len, 0.1, 0.06, 0x8a6038, len / 2, y, 0)));
  return refineProp(g, 1.2, 0, 1);
}

// ---------------------------------------------------------------- 矿洞物件
export function makeRails(len: number) {
  const g = new THREE.Group();
  [-0.45, 0.45].forEach(x => g.add(box(0.08, 0.08, len, 0x6a6a72, x, 0.08, 0)));
  for (let z = -len / 2; z < len / 2; z += 0.8) g.add(wbox(1.3, 0.06, 0.22, 0x4a3420, 0, 0.03, z));
  return g;
}
export function makeMineCart(withOre = true) {
  const g = new THREE.Group();
  const tub = cyl(0.75, 0.55, 0.7, 4, 0x5a5a62, 0, 0.75, 0); tub.rotation.y = Math.PI / 4; tub.scale.set(1, 1, 1.4); g.add(tub);
  [-0.4, 0.4].forEach(z => [-0.5, 0.5].forEach(x => { const w = cyl(0.17, 0.17, 0.08, 8, 0x333333, x, 0.2, z); w.rotation.z = Math.PI / 2; g.add(w); }));
  if (withOre) for (let i = 0; i < 5; i++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), i % 2 ? glow(0x9a5cff, 1.8) : toon(0x6a6070)); o.position.set((rnd() - 0.5) * 0.6, 1.15, (rnd() - 0.5) * 0.7); g.add(i % 2 ? noOutline(o) : o); }
  return refineProp(g, 1.2, 0.8, 1);
}
export function makeSupport() {
  const g = new THREE.Group();
  [-5.2, 5.2].forEach(x => g.add(wbox(0.4, 4.4, 0.4, 0x5a3e24, x, 2.2, 0)));
  g.add(wbox(11, 0.45, 0.45, 0x5a3e24, 0, 4.4, 0));
  [-4.6, 4.6].forEach(x => { const b = wbox(0.25, 1.4, 0.25, 0x4a3220, x, 3.8, 0); b.rotation.z = x > 0 ? 0.7 : -0.7; g.add(b); });
  return refineProp(g, 3, 0.3, 1);
}
/** 11-18 晶石统一换刻面晶簇（crystal_hd.makeCrystalAny；?off=crall 回旧）。旧件照常生成一次再丢，models 随机序列不变 */
export function makeCrystal(color = 0x9a5cff, size = 0.6): THREE.Group {
  const old = makeCrystalOld(color, size); if (!crAllOn()) return old;
  old.traverse(c => (c as THREE.Mesh).geometry?.dispose());
  return makeCrystalAny(color, size);
}
export function makeCrystalOld(color = 0x9a5cff, size = 0.6) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(size * (0.5 + rnd() * 0.6), 0), glow(color, 1.6 + rnd()));
    c.scale.y = 1.8; c.position.set((rnd() - 0.5) * size, size * 0.6, (rnd() - 0.5) * size); c.rotation.set(rnd() * 0.6, rnd() * 3, rnd() * 0.6);
    g.add(c);
  }
  // v0.9.1d：地面光池 + 竖直光晕，晶石像真的在发光
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(size * 6, size * 6), haloMaterial(color, 0.55)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; g.add(pool);
  g.userData.crystal = color;
  return noOutline(g);
}
export function makeTorch() {
  const g = new THREE.Group();
  g.add(box(0.12, 0.6, 0.12, 0x4a3220, 0, 0, 0));
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), flameDevelop(glow(0xffaa33, 2.5, { transparent: true, opacity: 0.95 }))); f.position.y = 0.45; f.name = 'flame'; g.add(noOutline(f));
  const l = new THREE.PointLight(0xff9944, 3.5, 15, 1.6); l.position.y = 0.6; l.name = 'torchLight'; g.add(l);
  return refineProp(g, 2, 0.4, 1);
}

export function makePortal(color: number, style: 'gate' | 'rift' | 'circle' = 'gate') {
  // v0.9.1d：漩涡面（着色器）+ 石环刻文 + 地面符文盘 + 光池；裂隙为撕裂的竖向口子，悬浮碎石
  const g = new THREE.Group(); g.userData.portal = { color, style };
  const rift = style === 'rift';
  if (style === 'circle') {
    // 营地传送阵：地面大法阵 + 光柱 + 四根符文石柱（不是门洞，站上去传送）
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.y = 0.33; g.add(noOutline(plate));
    const base = wcyl(2.9, 3.2, 0.3, 12, 0x4a4652, 0, 0.15, 0, 'stone'); g.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 5, 32, 1, true), beamMaterial(color)); col.position.y = 2.8; g.add(noOutline(col));
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const p = wcyl(0.28, 0.36, 1.6, 6, 0x6a6470, Math.cos(a) * 3.3, 0.8, Math.sin(a) * 3.3, 'stone'); g.add(p);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glow(color, 3)); gem.position.set(Math.cos(a) * 3.3, 1.95, Math.sin(a) * 3.3); gem.name = 'gem'; g.add(noOutline(gem)); }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), haloMaterial(color, 0.4)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; g.add(noOutline(pool));
    const l = new THREE.PointLight(color, 4, 12); l.position.y = 1.5; g.add(l);
    return g;
  }
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(rift ? 2.6 : 2.7, rift ? 3.6 : 2.7), portalMaterial(color, rift));
  inner.position.y = rift ? 2.0 : 1.7; inner.name = 'inner'; inner.userData.noSpin = true; g.add(noOutline(inner));
  if (!rift) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.2, 8, 32), toon(0x6a6470)); ring.position.y = 1.7; g.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.06, 6, 40), glow(color, 2.6)); rim.position.y = 1.7; g.add(noOutline(rim));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const k = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.3), toon(0x57525e)); k.position.set(Math.cos(a) * 1.5, 1.7 + Math.sin(a) * 1.5, 0); k.rotation.z = a; g.add(k);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), glow(color, 3)); gem.position.set(Math.cos(a) * 1.5, 1.7 + Math.sin(a) * 1.5, 0.17); g.add(noOutline(gem)); }
    const base = wcyl(1.8, 2.1, 0.3, 8, 0x8a8a96, 0, 0.15, 0, 'stone'); g.add(base);
    [-1, 1].forEach(s => { const leg = wcyl(0.22, 0.3, 0.9, 6, 0x6a6470, s * 1.35, 0.6, 0, 'stone'); g.add(leg); });
  } else {
    // 裂隙：周围漂浮的黑曜石碎块
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const r = makeRock(0.16 + rnd() * 0.18, 0x2a2030); r.position.set(Math.cos(a) * (1.3 + rnd() * 0.5), 0.6 + rnd() * 3, Math.sin(a) * 0.7); r.name = 'shard'; r.userData.ph = rnd() * 6; g.add(r); }
    const base = wcyl(1.6, 2.0, 0.2, 7, 0x3a3040, 0, 0.1, 0, 'stone'); g.add(base);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.position.y = 0.32; g.add(noOutline(plate));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), haloMaterial(color, 0.45)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; g.add(noOutline(pool));
  const l = new THREE.PointLight(color, 4, 11); l.position.y = 1.7; g.add(l);
  return g;
}
/** v0.9.2b 副本传送阵：六边形玄武岩台 + 金边、地面旋转符文盘（dp_spin）、四角方尖柱浮晶、中心光柱（远处可见）、柱顶悬浮石牌；未激活时灰暗无光柱 */
export function makeDungeonPortal(color: number) {
  const g = new THREE.Group(); g.userData.dportal = { color };
  g.add(wcyl(3.7, 4.0, 0.5, 6, 0x2a2a32, 0, 0.25, 0, 'stone'));
  g.add(wcyl(3.15, 3.35, 0.16, 6, 0x3a3842, 0, 0.56, 0, 'stone'));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.74, 3.74, 0.1, 6, 1, true), toon(0xd4a040, { side: THREE.DoubleSide })); rim.position.y = 0.48; g.add(rim);
  const spin = new THREE.Group(); spin.name = 'dp_spin'; spin.position.y = 0.66;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), runePlateMaterial(color)); plate.rotation.x = -Math.PI / 2; plate.name = 'dp_glow'; spin.add(noOutline(plate)); g.add(spin);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 3.05, z = Math.sin(a) * 3.05;
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, 2.6, 4), toon(0x3a3642)); ob.position.set(x, 1.8, z); ob.rotation.y = a; g.add(ob);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), toon(0xd4a040)); cap.position.set(x, 3.28, z); cap.rotation.y = a; g.add(cap);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glow(color, 3)); gem.position.set(x, 3.9, z); gem.name = 'dp_gem'; g.add(noOutline(gem));
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 16, 24, 1, true), beamMaterial(color)); beam.position.y = 8.6; beam.name = 'dp_beam'; g.add(noOutline(beam));
  const tab = new THREE.Group(); tab.name = 'dp_tab'; tab.position.y = 4.6;
  tab.add(wbox(1.3, 0.9, 0.16, 0x4a4652, 0, 0, 0, 'stone'));
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.28, 6), glow(color, 2.4, { side: THREE.DoubleSide })); em.position.z = 0.09; em.name = 'dp_em'; tab.add(noOutline(em));
  const em2 = em.clone(); em2.position.z = -0.09; tab.add(em2);
  g.add(tab);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), haloMaterial(color, 0.4)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; pool.name = 'dp_pool'; g.add(noOutline(pool));
  const l = new THREE.PointLight(color, 3, 12); l.position.y = 2; l.name = 'dp_light'; g.add(l);
  return g;
}
/** fix1107（Rhett 11-07 10:36 选概念图 A「裂钟拱门」）：长副本门——普通副本传送阵底座 + 一口劈成两半、左右撑开的铜钟作拱，
 *  中间竖着一道漩涡门（rift 版 portalMaterial），钟身一圈符文发光带，铁链从钟肩垂到四根方尖碑。造型按普通门的局部尺寸做，摆的时候整体 ×2。
 *  写实材质（MeshStandardMaterial），不走 toon、不描边。dp_beam 名字给竖门，激活 / 未激活沿用 setDungeonPortalActive。 */
export function makeLongGatePortal(color: number) {
  const g = makeDungeonPortal(color);
  for (const n of ['dp_beam', 'dp_tab']) { const o = g.getObjectByName(n); if (o) o.removeFromParent(); }
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6b5634, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide });
  const patina = new THREE.MeshStandardMaterial({ color: 0x3f5a52, metalness: 0.35, roughness: 0.7, side: THREE.DoubleSide });
  // 钟的轮廓（半径, 高度）：口沿外翻 → 腰收 → 肩 → 顶
  const prof = [[1.62, 0], [1.55, 0.18], [1.32, 0.5], [1.12, 1.2], [1.02, 2.0], [0.98, 2.7], [0.86, 3.15], [0.55, 3.45], [0.12, 3.55]].map(([r, y]) => new THREE.Vector2(r, y));
  const bell = new THREE.Group(); bell.name = 'lg_bell'; bell.position.y = 0.5;
  for (const side of [-1, 1]) {
    const half = new THREE.Group(); half.position.x = side * 0.95;
    // 半个钟：开口朝中间（右半 phi 0→π 落在 x ≥ 0，左半 π→2π）
    const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 28, side > 0 ? 0 : Math.PI, Math.PI), bronze);
    half.add(shell);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.09, 6, 20, Math.PI), patina); lip.rotation.x = Math.PI / 2; lip.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2; lip.position.y = 0.08; half.add(lip);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, 6, 20, Math.PI), glow(color, 2.2)); band.rotation.x = Math.PI / 2; band.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2; band.position.y = 1.55; band.name = 'dp_gem'; half.add(noOutline(band));
    const band2 = band.clone(); (band2 as THREE.Mesh).scale.setScalar(0.92); band2.position.y = 2.55; half.add(band2);
    // 劈开的断面：一条锯齿边（细长盒子沿切口立着）
    const cut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.3, 0.14), patina); cut.position.set(0, 1.7, 0); half.add(cut);
    half.rotation.z = side * -0.06;   // 两半往外微倾，像被撑开
    bell.add(half);
  }
  // 顶上的钟纽（横梁），把两半连成拱
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 16, Math.PI), bronze); crown.position.y = 4.05; bell.add(crown);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.32), patina); beam.position.y = 3.95; bell.add(beam);
  g.add(bell);
  // 竖着的漩涡门（两半之间）
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.3), portalMaterial(color, true)); door.position.set(0, 2.15, 0); door.name = 'dp_beam'; g.add(noOutline(door));
  // 铁链：钟肩 → 方尖碑脚
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.8, roughness: 0.5 });
  const link = new THREE.TorusGeometry(0.07, 0.022, 4, 8);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, ex = Math.cos(a) * 3.05, ez = Math.sin(a) * 3.05;
    const sx = Math.sign(ex) * 1.5, sy = 3.3, sz = 0, N = 22;
    for (let k = 0; k <= N; k++) {
      const t = k / N, x = sx + (ex - sx) * t, z = sz + (ez - sz) * t, y = sy + (2.9 - sy) * t - Math.sin(t * Math.PI) * 0.9;
      const l = new THREE.Mesh(link, chainMat); l.position.set(x, y, z); l.rotation.set(k % 2 ? Math.PI / 2 : 0, Math.atan2(ex - sx, ez - sz), 0); g.add(l);
    }
  }
  g.userData.longGate = true;
  return g;
}
/** 副本传送阵：激活 / 未激活（未激活：光柱、浮晶、符文、光池、灯都关，石牌徽记变灰） */
export function setDungeonPortalActive(g: THREE.Object3D, on: boolean) {
  g.userData.dpOn = on;
  g.traverse(o => {
    if (['dp_beam', 'dp_gem', 'dp_glow', 'dp_pool', 'dp_light'].includes(o.name)) o.visible = on;
    if (o.name === 'dp_em') { const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial; m.color.setHex(on ? g.userData.dportal.color : 0x555555); }
  });
}
export function makeGate() {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) { const b = cyl(0.14, 0.14, 4, 6, 0x4a4a52, i * 1.1, 2, 0); g.add(b); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), toon(0x4a4a52)); tip.position.set(i * 1.1, 0.05, 0); tip.rotation.x = Math.PI; g.add(tip); }
  g.add(box(5.6, 0.4, 0.4, 0x3a3a40, 0, 3.8, 0), box(5.6, 0.3, 0.3, 0x3a3a40, 0, 1.3, 0));
  const rune = new THREE.Mesh(new THREE.CircleGeometry(0.4, 6), glow(0x9a5cff, 2)); rune.position.set(0, 2.5, 0.2); g.add(noOutline(rune));
  return g;
}

// ---------------------------------------------------------------- 掉落：地上显示真实物品 + 品质光柱
export function makeLootItem(slot: string | null, color: string, tall: number, anc = false) {
  const g = new THREE.Group();
  const item = new THREE.Group(); item.name = 'item'; item.position.y = 0.55; g.add(item);
  if (slot === null) {               // 金币堆
    for (let i = 0; i < 5; i++) { const c = cyl(0.13, 0.13, 0.04, 8, 0xffd34d, (rnd() - 0.5) * 0.3, -0.45 + i * 0.045, (rnd() - 0.5) * 0.3); item.add(c); }
  } else if (slot === 'oneHand' || slot === 'twoHand') {
    const k = slot === 'twoHand' ? 1.45 : 1;   // 双手武器更长
    item.add(box(0.07 * k, 0.8 * k, 0.03, 0xdfe6ef, 0, 0.2 * k, 0), box(0.3 * k, 0.06, 0.08, 0xc9a227, 0, -0.2, 0), box(0.06, 0.22 * k, 0.06, 0x6b4a2b, 0, -0.2 - 0.14 * k, 0));
    item.rotation.z = 0.5;
  } else if (slot === 'offHand') {     // 盾牌 / 典籍 / 法球 统一用圆盾造型
    const sh = cyl(0.32, 0.32, 0.07, 12, 0x8a5a2a); sh.rotation.x = Math.PI / 2; item.add(sh);
    const boss = cyl(0.1, 0.1, 0.1, 8, 0xc9a227); boss.rotation.x = Math.PI / 2; item.add(boss);
  } else if (slot === 'shoulder' || slot === 'hands' || slot === 'feet' || slot === 'wrist') {
    item.add(box(0.2, 0.2, 0.22, 0xaab4c2, -0.15, 0, 0), box(0.2, 0.2, 0.22, 0xaab4c2, 0.15, 0, 0));
  } else if (slot === 'back') {
    item.add(box(0.5, 0.65, 0.05, 0x8a1a1a));
  } else if (slot === 'waist') {
    item.add(box(0.6, 0.1, 0.12, 0x6a4a2a), box(0.12, 0.12, 0.14, 0xc9a227));
  } else if (slot === 'head') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.8), toon(0xaab4c2)); item.add(h); item.add(box(0.36, 0.06, 0.1, 0x333333, 0, -0.02, 0.24));
  } else if (slot === 'chest') {
    item.add(box(0.5, 0.55, 0.25, 0x9aa4b4), box(0.7, 0.14, 0.28, 0x7a8494, 0, 0.24, 0));
  } else if (slot === 'legs') {
    item.add(box(0.18, 0.55, 0.18, 0x8a6a4a, -0.12, 0, 0), box(0.18, 0.55, 0.18, 0x8a6a4a, 0.12, 0, 0), box(0.45, 0.12, 0.2, 0x6a4a2a, 0, 0.28, 0));
  } else {
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glow(color, 2)); item.add(noOutline(t));
  }
  if (anc) {
    // v0.9.6b 太古：深红金边双螺旋 + 暗红内光柱 + 白金细芯 + 太古符环（红盘 + 反转金盘）+ 环绕余烬
    const H = 3.2 * 3;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, H * 0.8, 14, 1, true), beamMaterial(0xc00808, 2.2)); inner.position.y = H * 0.4; inner.renderOrder = 2; g.add(noOutline(inner));
    const helix = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, H, 28, 1, true), ancientHelixMaterial()); helix.position.y = H / 2; helix.renderOrder = 3; g.add(noOutline(helix));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, H, 10, 1, true), beamMaterial(0xffe0b0, 2.0)); core.position.y = H / 2; core.renderOrder = 3; g.add(noOutline(core));
    const shade = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0x0a0000, transparent: true, opacity: 0.55, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = 0.035; g.add(noOutline(shade));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), runePlateMaterial(0xff2a2a)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.05; g.add(noOutline(pl));
    const ar = new THREE.Group(); ar.name = 'ancRing'; ar.position.y = 0.06;
    const pl2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), runePlateMaterial(0xffc060)); pl2.rotation.x = -Math.PI / 2; ar.add(noOutline(pl2));
    const gr = makeRing(0xffb040, 0.8); gr.scale.setScalar(1.35); ar.add(gr);
    g.add(ar);
    const orbit = new THREE.Group(); orbit.name = 'orbit'; orbit.position.y = 0.75;
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, o = noOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glow(i % 2 ? 0xffb040 : 0xff2a2a, 3))); o.position.set(Math.cos(a) * 0.7, Math.sin(a * 2) * 0.15, Math.sin(a) * 0.7); o.scale.y = 2; orbit.add(o); }
    g.add(orbit);
  } else if (tall >= 2.8) {
    // v0.9.1g 暗金「黑焰金纹」：黑色烟焰柱 + 金色双螺旋 + 白金细芯 + 黑底金符文盘 + 环绕金晶（与橙装的明亮火光柱彻底区分）
    const H = 3.2 * tall;
    const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, H * 0.75, 16, 1, true), darkFlameMaterial()); smoke.position.y = H * 0.375; smoke.renderOrder = 2; g.add(noOutline(smoke));
    const helix = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, H, 24, 1, true), helixMaterial()); helix.position.y = H / 2; helix.renderOrder = 3; g.add(noOutline(helix));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, H, 10, 1, true), beamMaterial(0xfff2c8, 2.2)); core.position.y = H / 2; core.renderOrder = 3; g.add(noOutline(core));
    const shade = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ color: 0x050008, transparent: true, opacity: 0.55, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = 0.035; g.add(noOutline(shade));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), runePlateMaterial(0xffc84a)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.05; g.add(noOutline(pl));
    const orbit = new THREE.Group(); orbit.name = 'orbit'; orbit.position.y = 0.75;
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, o = noOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glow(0xffd36a, 3))); o.position.set(Math.cos(a) * 0.62, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.62); o.scale.y = 1.8; orbit.add(o); }
    g.add(orbit);
  } else if (tall > 0) {
    // v0.9.1e：着色器光柱（底亮顶隐、竖向流动）+ 贴地光池；橙装再加小符文盘
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + tall * 0.04, 0.34 + tall * 0.06, 3.2 * tall, 12, 1, true), beamMaterial(color, 2.6));
    beam.position.y = 1.6 * tall; g.add(noOutline(beam));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + tall, 1.6 + tall), haloMaterial(color, 0.35 + tall * 0.12)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; g.add(noOutline(pool));
    if (tall >= 2) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), runePlateMaterial(color)); pl.rotation.x = -Math.PI / 2; pl.position.y = 0.05; g.add(noOutline(pl)); }
  }
  const ring = makeRing(color, 0.7); ring.scale.setScalar(0.55); ring.position.y = 0.03; g.add(ring);
  return g;
}

/** 地面圆盘（技能范围、燃烧地面） */
export function makeDisc(color: number | string, opacity: number, radius = 1) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color as THREE.ColorRepresentation), transparent: true, opacity, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  return noOutline(m);
}
export function makeRing(color: number | string, opacity: number) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color as THREE.ColorRepresentation).multiplyScalar(1.5), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  return noOutline(m);
}
export function makeAxe() {
  const g = new THREE.Group();
  g.add(box(0.08, 0.7, 0.08, 0x6b4a2b, 0, 0, 0), box(0.4, 0.32, 0.06, 0xb0c4de, 0.17, 0.25, 0));
  return g;
}

// ---------------------------------------------------------------- 营地商人：货摊 + 铁砧
export function makeStall() {
  const g = new THREE.Group();
  [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]].forEach(([x, z]) => g.add(wcyl(0.07, 0.08, 2.4, 5, 0x6b4a2b, x, 1.2, z)));
  g.add(wbox(2.8, 0.9, 1.2, 0x8a5a2b, 0, 0.45, 0.2));
  const awn = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.9, 0.7, 4, 1, true), toon(0xb03a2a, { side: THREE.DoubleSide })); awn.rotation.y = Math.PI / 4; awn.scale.set(1.1, 1, 0.65); awn.position.y = 2.7; g.add(awn);
  for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.35), toon(i % 2 ? 0xf0e0b0 : 0xb03a2a, { side: THREE.DoubleSide })); st.position.set(-1.25 + i * 0.5, 2.25, 0.92); g.add(st); }
  // 货物：药水瓶、布匹、金币
  [[-0.9, 0xd03030], [-0.6, 0xd08020], [-0.3, 0x3060d0]].forEach(([x, c]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), glow(c, 1.3)); b.position.set(x, 1.02, 0.4); g.add(noOutline(b)); const n = cyl(0.03, 0.03, 0.1, 5, 0x8a6a4a, x, 1.15, 0.4); g.add(n); });
  g.add(wbox(0.6, 0.12, 0.4, 0x4a6aa0, 0.6, 0.96, 0.3, 'wood'));
  for (let i = 0; i < 4; i++) g.add(cyl(0.1, 0.1, 0.03, 8, 0xffd34d, 0.1 + i * 0.05, 0.92 + i * 0.03, 0.5));
  return refineProp(g, 2.6, 0.2, 1);
}
export function makeAnvil() {
  const g = new THREE.Group();
  g.add(wbox(0.6, 0.5, 0.5, 0x6b4a2b, 0, 0.25, 0));
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.38), toon(0x4a4a52)); top.position.y = 0.66; top.castShadow = true; g.add(top);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), toon(0x4a4a52)); horn.rotation.z = Math.PI / 2; horn.position.set(0.66, 0.68, 0); g.add(horn);
  g.add(box(0.4, 0.18, 0.3, 0x3a3a40, 0, 0.5, 0));
  const ember = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), glow(0xff7020, 2.5)); ember.position.set(-0.1, 0.8, 0); g.add(noOutline(ember));
  return refineProp(g, 1, 1, 0.8);
}

// ---------------------------------------------------------------- 腐沼神殿物件
/** 残破石柱（青苔石贴图），broken=断掉的高度 */
export function makePillar(h = 4, broken = false) {
  const g = new THREE.Group();
  g.add(wbox(1.2, 0.4, 1.2, 0x9aa48a, 0, 0.2, 0, 'stone'));
  const shaft = wcyl(0.42, 0.48, h, 8, 0xa8b098, 0, 0.4 + h / 2, 0, 'stone'); g.add(shaft);
  if (!broken) { g.add(wbox(1.1, 0.35, 1.1, 0x9aa48a, 0, 0.4 + h + 0.17, 0, 'stone')); }
  else { const cap = makeRock(0.45, 0x8a9478); cap.position.set(0.3, 0.4 + h + 0.1, 0.2); g.add(cap); }
  // 缠绕的藤蔓
  for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 4, 10, Math.PI * 1.2), toon(0x3f6a1e)); v.rotation.set(Math.PI / 2 + 0.3, 0, i * 1.7); v.position.y = 0.8 + i * h * 0.22; g.add(v); }
  return refineProp(g, 4, 0, 1.2);
}
/** 拱门 */
export function makeArch(w = 6, h = 5) {
  const g = new THREE.Group();
  [-w / 2, w / 2].forEach(x => { const p = makePillar(h, false); p.position.x = x; g.add(p); });
  g.add(wbox(w + 1.4, 0.7, 1.3, 0x8a947a, 0, h + 1.1, 0, 'stone'));
  const rune = new THREE.Mesh(new THREE.CircleGeometry(0.35, 6), glow(0x9aff40, 2)); rune.position.set(0, h + 1.1, 0.67); g.add(noOutline(rune));
  return refineProp(g, 5, 0, 1.2);
}
/** 盘根：几根弯曲的粗根（管道几何） */
export function makeRoots(r: () => number = rnd, span = 3) {
  const g = new THREE.Group();
  const mat = texToon('wood', lite(0x4a3420, 0.3));
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    const pts = [0, 1, 2, 3].map(k => new THREE.Vector3(Math.cos(a) * k * span / 3 + (r() - 0.5) * 0.6, Math.sin(k * 1.4) * 0.35 + 0.1, Math.sin(a) * k * span / 3 + (r() - 0.5) * 0.6));
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.18 - i * 0.03, 5), mat);
    m.castShadow = true; g.add(m);
  }
  return g;
}
/** 发光蘑菇丛 */
/** light=true 时附带一盏点光源（点光源很贵，整个场景只给少数几丛） */
export function makeMushrooms(color = 0x7aff4a, n = 4, r: () => number = rnd, light = false) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = 0.5 + r() * 0.9, x = (r() - 0.5) * 1.4, z = (r() - 0.5) * 1.4;
    g.add(cyl(0.05 * s, 0.08 * s, 0.5 * s, 5, 0xe8e0c0, x, 0.25 * s, z));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), glow(color, 1.2 + r() * 0.8)); cap.position.set(x, 0.48 * s, z); g.add(noOutline(cap));
  }
  if (light) { const l = new THREE.PointLight(color, 1.6, 7, 1.8); l.position.y = 0.8; g.add(l); }
  return g;
}
/** 枯树：歪斜树干 + 光秃枝杈 + 垂挂苔藓 */
export function makeDeadTree(r: () => number = rnd) {
  const g = new THREE.Group();
  const h = 3 + r() * 2;
  const t = wcyl(0.18, 0.4, h, 6, 0x4a3a2a, 0, h / 2, 0); t.rotation.z = (r() - 0.5) * 0.25; g.add(t);
  for (let i = 0; i < 4; i++) {
    const b = wcyl(0.04, 0.1, 1.4 + r(), 4, 0x4a3a2a, 0, 0, 0); const a = r() * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.4, h * (0.55 + i * 0.1), Math.sin(a) * 0.4); b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(b);
    const moss = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 4), toon(0x5a7a3a)); moss.rotation.x = Math.PI; moss.position.set(Math.cos(a) * 0.9, h * (0.55 + i * 0.1) - 0.2, Math.sin(a) * 0.9); g.add(moss);
  }
  return refineProp(g, 4, 0, 1);
}
/** 芦苇 */
export function makeReeds(n = 7, r: () => number = rnd) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const h = 0.8 + r() * 0.9;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 3), toon(0x6a8a3a)); m.position.set((r() - 0.5) * 0.9, h / 2, (r() - 0.5) * 0.9); m.rotation.z = (r() - 0.5) * 0.3; g.add(m);
    if (r() < 0.4) { const t = cyl(0.05, 0.05, 0.22, 5, 0x5a3a1a, m.position.x, h - 0.05, m.position.z); g.add(t); }
  }
  return noOutline(g);
}
/** 浮萍 */
export function makeLily() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10, 0.3, Math.PI * 1.8), toon(0x5a9a3a, { side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return noOutline(m);
}
/** 水面：滚动的水贴图 */
export function makeWater(w: number, d: number, color = 0x7a9a6a) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMaterial(color));
  m.rotation.x = -Math.PI / 2;
  return noOutline(m);
}
/** 雾片：大片半透明柔光贴片（不受光照），慢慢飘动 */
let fogTex: THREE.Texture | null = null;
export function makeFogPatch(size: number, color = 0xa0c890, opacity = 0.18) {
  if (!fogTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g2 = c.getContext('2d');
    if (g2) { const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); }
    fogTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, map: fogTex, transparent: true, opacity, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2;
  return noOutline(m);
}
/** 神殿祭坛：台阶 + 发光毒池 */
export function makeAltar() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(wbox(5 - i * 1.2, 0.3, 5 - i * 1.2, 0x9aa48a, 0, 0.15 + i * 0.3, 0, 'stone'));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 16), glow(0x7aff3a, 1.2, { transparent: true, opacity: 0.85 })); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.92; pool.name = 'pool'; g.add(noOutline(pool));
  const l = new THREE.PointLight(0x80ff40, 4, 14); l.position.y = 2; g.add(l);
  return g;
}
/** 法术弹体：发光核心 + 外层光晕（法师投射物、祭徒/藤蔓的毒弹） */
export function makeOrb(color: number | string, size = 0.22) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), glow(0xffffff, 2.5)); g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 1.9, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color as THREE.ColorRepresentation).multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  g.add(halo);
  return noOutline(g);
}

// ---------------------------------------------------------------- 静态合批
/**
 * 把一个场景组里不会动的物件按“同样的材质”合并成少量大网格，绘制调用从上千降到几十（手机/小游戏必需）
 * keep 里的物体（及其子孙）保持独立：会动的火焰、晶石、门、传送门、旗帜、雾片等
 */
export function bakeStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D | null | undefined>): { before: number; after: number } {
  const keepSet = new Set<THREE.Object3D>();
  for (const k of keep) if (k) keepSet.add(k);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean; src: THREE.Mesh[] }>();
  let before = 0;
  const kept = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (keepSet.has(p)) return true; return false; };
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    before++;
    const mat = m.material as THREE.Material;
    if (Array.isArray(mat) || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.userData.noBake) return;
    if (!m.visible || kept(m) || m.geometry.getAttribute('color')) return;
    const mm = mat as THREE.MeshToonMaterial & THREE.MeshBasicMaterial;
    // 颜色不进签名：写进顶点色，这样不同颜色的同类材质也能合成一批
    const sig = [mat.type, mm.emissive?.getHexString?.() ?? '', mm.map?.uuid ?? '', mat.transparent, mat.opacity.toFixed(2), mat.side, mat.blending, mat.depthWrite, (mat as THREE.MeshBasicMaterial).toneMapped,
      (mat.userData.outlineParameters as { visible?: boolean } | undefined)?.visible === false ? 'no' : 'ol'].join('|');
    let g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    const n = g.getAttribute('position').count, col = new Float32Array(n * 3), c = mm.color ?? new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let e = groups.get(sig);
    if (!e) groups.set(sig, e = { mat, geos: [], cast: false, recv: false, src: [] });
    e.geos.push(g); e.cast ||= m.castShadow; e.recv ||= m.receiveShadow; e.src.push(m);
  });
  let after = before;
  for (const e of groups.values()) {
    if (e.geos.length < 2) { e.geos.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(e.geos, false);
    if (!merged) continue;
    const mat = e.mat.clone() as THREE.MeshToonMaterial;
    mat.color.setRGB(1, 1, 1); mat.vertexColors = true;
    mat.userData = { ...e.mat.userData };
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = e.cast; mesh.receiveShadow = e.recv;
    root.add(mesh);
    e.src.forEach(s => s.parent?.remove(s));
    after -= e.geos.length - 1;
  }
  return { before, after };
}


// ================================================================ 翠风原野（秋天的原野、白桦林、遗迹、苇河、前哨站）
/** 原野地面高度（局部坐标）：可走范围内平坦，边缘起伏成丘陵；河床略低 */
export const FIELD_EDGE = 114;   // v0.9.3b：±120 的可走范围，114 米外开始起边缘丘陵（原来 72 / ±78）
export function fieldGroundY(lx: number, lz: number, riverZ: (x: number) => number, rises?: readonly Rise[]) {
  const edge = Math.max(lx < 0 ? -lx - FIELD_EDGE - LAKE_WEXT : lx - FIELD_EDGE, Math.abs(lz) - FIELD_EDGE, 0);   // 11-19 qllake：西缘丘陵外移 LAKE_WEXT 米
  const hills = Math.min(1, edge / 14) * (5 + fbm(lx * 0.05 + 30, lz * 0.05) * 13);
  const rv = Math.abs(lz - riverZ(lx));
  const bed = rv < 4.6 && !(LAKE_ON && lx < RIVER_X0 - 4) ? -0.7 * (1 - rv / 4.6) : 0;   // qllake：湖以西不再挖河槽
  const y = hills + bed + risesY(rises, lx, lz);
  return LAKE_ON ? Math.min(y, lakeBedY(lx, lz)) : y;   // qllake：湖盆
}
/** 原野地形：高度场 + 草/土路/岩石三层贴图，顶点色偏秋天的金黄 */
export function makeFieldTerrain(origin: { x: number; z: number }, riverZ: (x: number) => number, pathDist: (lx: number, lz: number) => number, rises?: readonly Rise[], road: RoadMask | null = null) {   // 11-16e road：原野主路遮罩
  const size = (FIELD_EDGE + 40) * 2, seg = Math.round(size / 1.5);   // v0.9.3b 1.5 米一格，台地崖壁不锯齿
  const sizeX = size + LAKE_WEXT, segX = Math.round(sizeX / 1.5);   // 11-19 qllake：往西加宽 LAKE_WEXT 米（湖关时不变）
  const g = new THREE.PlaneGeometry(sizeX, size, segX, seg); g.rotateX(-Math.PI / 2); if (LAKE_WEXT) g.translate(-LAKE_WEXT / 2, 0, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3), splat = new Float32Array(p.count * 3);
  const tA = new THREE.Color(0xfff0c0), tB = new THREE.Color(0xe8c890), tC = new THREE.Color(0xd8e0a8), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = fieldGroundY(x, z, riverZ, rises);
    p.setY(i, y);
    const n = fbm(x * 0.06, z * 0.06);
    c.copy(tA).lerp(n > 0.5 ? tB : tC, Math.abs(n - 0.5) * 1.6);
    const path = road ? 0 : Math.max(0, 1 - Math.max(0, pathDist(x, z) - 1.1) / 1.2) * 0.95;
    const bank = Math.max(Math.abs(z - riverZ(x)) < 5 && !(LAKE_ON && x < RIVER_X0 - 4) ? 0.7 : 0, LAKE_ON && Number.isFinite(lakeBedY(x, z)) ? 0.7 : 0);   // qllake：湖岸 4 米也是泥岸
    const ry = risesY(rises, x, z), e = 0.6, cliff = ry > 0.05 ? Math.min(1, Math.max(0, (Math.hypot(risesY(rises, x + e, z) - risesY(rises, x - e, z), risesY(rises, x, z + e) - risesY(rises, x, z - e)) / (2 * e) - 0.35) * 2)) : 0;
    const rock = Math.max(y - ry > 3 ? Math.min(1, (y - ry - 3) / 6) : 0, cliff);
    const dirt = Math.max(path, bank * 0.6);
    splat.set([Math.max(0, 1 - dirt - rock), dirt * (1 - rock), rock], i * 3);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  setSplat(g, splat);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, splatMaterial(['grass', 'dirt', 'rock'], [0.11, 0.13, 0.07], null, road ? { mask: road, look: { tint: [1.05, 0.98, 0.9], gravel: 0.45, mud: 0.55 } } : null));
  m.position.set(origin.x, 0, origin.z); m.receiveShadow = true;
  return noOutline(m);
}
/** 原野草丛（秋天的金黄色），accept(lx,lz) 决定能不能长 */
export function makeFieldGrass(count: number, origin: { x: number; z: number }, accept: (lx: number, lz: number) => boolean, ground: (lx: number, lz: number) => number = () => 0, span = 150) {
  const blade = new THREE.ConeGeometry(0.08, 0.6, 3); blade.translate(0, 0.3, 0);
  const im = new THREE.InstancedMesh(blade, cineWind(toon(0xffffff), 0.09), count);   // 11-14 第 5 步
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  for (let t = 0; n < count && t < count * 5; t++) {
    const x = (rnd() - 0.5) * span, z = (rnd() - 0.5) * span;
    if (!accept(x, z) || fbm(x * 0.13 + 5, z * 0.13) < 0.42) continue;
    pos.set(origin.x + x, ground(x, z), origin.z + z);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5));
    sc.set(1, 0.6 + rnd() * 1.0, 1);
    im.setMatrixAt(n, m4.compose(pos, q, sc));
    im.setColorAt(n, col.setHSL(0.1 + rnd() * 0.1, 0.55, 0.38 + rnd() * 0.16));
    n++;
  }
  im.count = n; im.receiveShadow = true;
  return noOutline(im);
}
/** 河面：沿河道弯曲的水带 */
export function makeRiver(origin: { x: number; z: number }, riverZ: (x: number) => number, half: number, x0 = -105, x1 = 105) {
  // 11-19 qlwake：r8 河网格 880×26（0.5 米 × 0.73 米）做尾迹顶点起伏 → 这里顺流 0.5 米一段、横向 12 段；?off=qlwake / qlriver 回 90×1
  const fine = QL.wake, segs = fine ? Math.max(90, Math.round((x1 - x0) / 0.5)) : 90, nz = fine ? 12 : 1, g = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const x = x0 + (x1 - x0) * i / segs, z = riverZ(x);
    for (let j = 0; j <= nz; j++) { const v = j / nz; pos.push(x, 0, z - half - 0.6 + v * (half + 0.6) * 2); uv.push(i / segs * 20, v); }
    if (i < segs) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = a + nz + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, waterMaterial(0x6aa0b8, 0.85));
  m.position.set(origin.x, -0.12, origin.z);
  m.material.userData.noBake = true;
  return noOutline(m);
}
/** 白桦：白色树干（黑色斑纹）+ 秋叶（金黄/橙/红） */
const AUTUMN = [0xf0b830, 0xe88a20, 0xd8c040, 0xc85a28, 0xf2d060];
export function makeBirch(r: () => number, v = 0) {
  const g = new THREE.Group();
  const h = 3.2 + r() * 1.6;
  const trunk = cyl(0.12, 0.2, h, 6, 0xe8e4d8, 0, h / 2, 0); g.add(trunk);
  for (let i = 0; i < 5; i++) { const m = box(0.22, 0.06, 0.05, 0x2a2a2a, 0, 0.6 + i * h * 0.17, 0.13); m.rotation.y = i * 1.3; g.add(m); }
  const leaf = AUTUMN[Math.floor(v * AUTUMN.length) % AUTUMN.length];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + r() * 0.45, 0), toon(new THREE.Color(leaf).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.1).getHex()));
    b.position.set((r() - 0.5) * 1.0, h - 0.4 + r() * 1.0, (r() - 0.5) * 1.0); b.scale.y = 1.25; b.castShadow = true; g.add(b);
  }
  return g;
}
export function makeAutumnOak(r: () => number, v = 0) {
  const g = new THREE.Group();
  g.add(wcyl(0.24, 0.36, 2.2, 6, 0x6a4a2b, 0, 1.1, 0));
  const leaf = [0xc8602a, 0xb84a20, 0xd8902a][Math.floor(v * 3) % 3];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + r() * 0.5, 0), toon(new THREE.Color(leaf).offsetHSL(r() * 0.03, 0, r() * 0.08).getHex()));
    b.position.set((r() - 0.5) * 1.6, 2.6 + r() * 0.9, (r() - 0.5) * 1.6); b.castShadow = true; g.add(b);
  }
  return g;
}
/** 削尖的木栅栏桩 */
export function makeStake(h = 2.4) {
  const g = new THREE.Group();
  g.add(wcyl(0.18, 0.2, h, 6, 0x7a5530, 0, h / 2, 0));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 6), texToon('wood', lite(0x6a4a28))); tip.position.y = h + 0.25; tip.castShadow = true; g.add(tip);
  return refineProp(g, 2, 0, 1);
}
/** 瞭望塔 */
export function makeWatchtower() {
  const g = new THREE.Group();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => g.add(wcyl(0.12, 0.15, 5.2, 5, 0x6b4a2b, x, 2.6, z)));
  g.add(wbox(2.8, 0.2, 2.8, 0x8a6038, 0, 4.8, 0));
  [[0, -1.35, 2.8, 0.1], [0, 1.35, 2.8, 0.1], [-1.35, 0, 0.1, 2.8], [1.35, 0, 0.1, 2.8]].forEach(([x, z, w, d]) => g.add(wbox(w, 0.7, d, 0x7a5530, x, 5.25, z)));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.4, 4), texToon('wood', lite(0x8a3a20))); roof.rotation.y = Math.PI / 4; roof.position.y = 6.8; roof.castShadow = true; g.add(roof);
  [[-1, 6.1, -1], [1, 6.1, 1], [-1, 6.1, 1], [1, 6.1, -1]].forEach(([x, y, z]) => g.add(wcyl(0.06, 0.06, 1.2, 4, 0x6b4a2b, x, y, z)));
  for (let i = 0; i < 6; i++) { const r = wbox(0.6, 0.06, 0.12, 0x6b4a2b, 1.12, 0.6 + i * 0.7, 0); g.add(r); }
  return refineProp(g, 5, 0, 1);
}
/** 木桥：桥面 + 栏杆 + 桥墩，长 len 沿 z 方向 */
export function makeBridge(len = 11, width = 5) {
  const g = new THREE.Group();
  for (let z = -len / 2; z <= len / 2; z += 0.55) g.add(wbox(width, 0.14, 0.5, 0x8a6038, 0, 0.1, z));
  [-1, 1].forEach(s => {
    g.add(wbox(0.16, 0.16, len, 0x6b4a2b, s * (width / 2 - 0.1), 1.0, 0));
    for (let z = -len / 2; z <= len / 2 + 0.01; z += len / 4) { g.add(wbox(0.18, 1.0, 0.18, 0x6b4a2b, s * (width / 2 - 0.1), 0.55, z)); g.add(wcyl(0.22, 0.26, 1.6, 6, 0x5a3e24, s * (width / 2 - 0.3), -0.6, z)); }
  });
  return g;
}
/** 守林人的小木屋 */
export function makeHut() {
  const g = new THREE.Group();
  g.add(wbox(4.6, 2.6, 3.8, 0x8a6038, 0, 1.3, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.0, 4), texToon('wood', lite(0x6a3a20))); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.85); roof.position.y = 3.6; roof.castShadow = true; g.add(roof);
  g.add(wbox(1.0, 1.7, 0.1, 0x4a2a14, 0, 0.85, 1.92));
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), glow(0xffc060, 1.2)); win.position.set(1.4, 1.6, 1.92); g.add(noOutline(win));
  g.add(wbox(0.5, 1.4, 0.5, 0x7a7a7a, -1.6, 4.0, -0.6, 'stone'));
  for (let i = 0; i < 4; i++) { const log = wcyl(0.16, 0.16, 1.4, 6, 0x7a5530, -2.8, 0.18 + i * 0.32, -1 + (i % 2) * 0.2); log.rotation.x = Math.PI / 2; g.add(log); }   // 柴堆
  return g;
}
/** 草药桌：桌面 + 药草束 + 瓶子 */
export function makeHerbTable() {
  const g = new THREE.Group();
  g.add(wbox(2.2, 0.12, 1.0, 0x8a6038, 0, 0.9, 0));
  [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]].forEach(([x, z]) => g.add(wbox(0.1, 0.9, 0.1, 0x6b4a2b, x, 0.45, z)));
  [[-0.6, 0x5a9a3a], [-0.2, 0x8aba4a], [0.5, 0x3a7a3a]].forEach(([x, c]) => { const h = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), toon(c)); h.position.set(x, 1.2, 0); h.rotation.z = 0.3; g.add(h); });
  [[0.2, 0x40c0a0], [0.85, 0xd07030]].forEach(([x, c]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(c, 1.2)); b.position.set(x, 1.06, 0.2); g.add(noOutline(b)); });
  return g;
}
/** 遗迹：倒下的石块 / 竖石 / 星落祭坛 */
export function makeRuinBlock() {
  const g = new THREE.Group();
  const a = wbox(2.2, 0.9, 1.1, 0xa8a8a0, 0, 0.45, 0, 'stone'); a.rotation.y = 0.4; g.add(a);
  const b = wbox(1.1, 0.7, 0.9, 0x9a9a92, 0.9, 0.35, 0.9, 'stone'); b.rotation.set(0.2, 1.1, 0.1); g.add(b);
  return g;
}
export function makeStandingStone() {
  const g = new THREE.Group();
  const s = wbox(0.9, 3.2, 0.6, 0x9a9890, 0, 1.4, 0, 'stone'); s.rotation.z = 0.08; g.add(s);
  const rune = new THREE.Mesh(new THREE.CircleGeometry(0.22, 5), glow(0x80c0ff, 1.5)); rune.position.set(0, 2.0, 0.31); g.add(noOutline(rune));
  return refineProp(g, 3, 0, 1.2);
}
export function makeStarAltar() {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) g.add(wcyl(3.2 - i * 0.9, 3.4 - i * 0.9, 0.35, 10, 0xb0b0a8, 0, 0.17 + i * 0.35, 0, 'stone'));
  const star = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.3, 5), glow(0x8ac8ff, 1.6, { side: THREE.DoubleSide })); star.rotation.x = -Math.PI / 2; star.position.y = 0.72; star.name = 'star'; g.add(noOutline(star));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glow(0xa0d8ff, 2.4)); core.position.y = 1.9; core.name = 'core'; g.add(noOutline(core));
  return refineProp(g, 2, 0.3, 1);
}

// ---------------------------------------------------------------- 原野的怪物
function tintRig(r: Rig, color: number, k: number) { r.flash.forEach(m => m.color.lerp(new THREE.Color(color), k)); return r; }
/** 鬃背野猪（golden = 稀有的金鬃） */
export function makeBoar(golden = false): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const fur = golden ? 0xd8a830 : 0x6a4a30, dark = golden ? 0x8a6010 : 0x3a2818, tusk = 0xf0ead8;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), toon(fur)); torso.scale.set(0.9, 0.8, 1.35); torso.position.y = 0.8; torso.castShadow = true; body.add(torso);
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), toon(dark)); sp.position.set(0, 1.25 - Math.abs(i - 2.5) * 0.04, 0.45 - i * 0.18); sp.rotation.x = -0.4; body.add(sp); }
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.82); body.add(head);
  head.add(box(0.5, 0.45, 0.5, fur, 0, 0, 0));
  const snout = cyl(0.17, 0.2, 0.3, 6, dark, 0, -0.06, 0.32); snout.rotation.x = Math.PI / 2; head.add(snout);
  [-0.17, 0.17].forEach(x => { const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), toon(tusk)); t.position.set(x, 0.0, 0.42); t.rotation.set(-0.9, 0, x > 0 ? -0.3 : 0.3); head.add(t); });
  [-0.15, 0.15].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), glow(golden ? 0xffe060 : 0xff5030, 2)); e.position.set(x, 0.1, 0.26); head.add(noOutline(e)); });
  [-0.18, 0.18].forEach(x => { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), toon(dark)); ear.position.set(x, 0.3, -0.08); head.add(ear); });
  const legs = [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]].map(([x, z]) => {
    const leg = new THREE.Group(); leg.position.set(x, 0.55, z);
    leg.add(box(0.18, 0.5, 0.2, fur, 0, -0.22, 0), box(0.16, 0.1, 0.18, dark, 0, -0.5, 0.02));
    root.add(leg); return leg;
  });
  const sc = golden ? 1.35 : 1;
  root.scale.setScalar(sc);
  if (golden) { const l = new THREE.PointLight(0xffd060, 1.5, 5); l.position.y = 1.6; root.add(l); }
  return { root, body, legs, scale: sc, flash: collectMats(root) };
}
/** 遗迹石傀儡：石块拼成的人形，胸口和眼睛有蓝色星纹 */
export function makeGolem(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const stone = 0x8a8a82;
  const chest = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), texToon('rock', lite(stone, 0.4))); chest.scale.set(1.1, 1, 0.8); chest.position.y = 1.9; chest.castShadow = true; body.add(chest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), texToon('rock', lite(stone, 0.45))); head.position.set(0, 2.75, 0.1); head.castShadow = true; body.add(head);
  [-0.13, 0.13].forEach(x => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), glow(0x7ac8ff, 3)); e.position.set(x, 2.78, 0.36); body.add(noOutline(e)); });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glow(0x7ac8ff, 2.5)); core.position.set(0, 1.95, 0.6); body.add(noOutline(core));
  [-1, 1].forEach(sd => {
    const arm = new THREE.Group(); arm.position.set(sd * 0.95, 2.2, 0); body.add(arm);
    const up = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), texToon('rock', lite(stone, 0.4))); up.position.y = -0.3; arm.add(up);
    const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), texToon('rock', lite(stone, 0.35))); fist.position.y = -1.0; fist.castShadow = true; arm.add(fist);
  });
  const legs = [-0.4, 0.4].map(x => {
    const leg = new THREE.Group(); leg.position.set(x, 1.2, 0);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.1, 0.45), texToon('rock', lite(stone, 0.4))); l.position.y = -0.6; l.castShadow = true; leg.add(l);
    root.add(leg); return leg;
  });
  root.scale.setScalar(1.15);
  return { root, body, legs, scale: 1.15, flash: collectMats(root) };
}
/** 荒原劫掠者（近战）/ 劫掠弩手（远程）/ 赤鬃（精英头目） */
export function makeRaider(): Rig {
  const c = makeCharacter({ model: 'Barbarian', tex: 'barbarian', show: ['1H_Axe', 'Barbarian_Round_Shield'], height: 2.05, tint: 0x9a4a2a, tintAmount: 0.35 });
  if (c) return fromChar(c);
  return tintRig(makeMiner(), 0x9a4a2a, 0.4);
}
export function makeArcher(): Rig {
  const c = makeCharacter({ model: 'Rogue_Hooded', tex: 'rogue', show: ['2H_Crossbow', 'Rogue_Cape'], height: 2.0, tint: 0x8a3a2a, tintAmount: 0.4 });
  if (c) return fromChar(c);
  return tintRig(makeMiner(), 0x8a3a2a, 0.4);
}
export function makeChief(): Rig {
  const c = makeCharacter({ model: 'Barbarian', tex: 'barbarian', show: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'], height: 2.1, tint: 0xc02a1a, tintAmount: 0.45, emissive: 0x1a0402 });
  if (c) {
    const r = fromChar(c, 1.45);
    const mane = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), glow(0xff4020, 1.2)); mane.position.set(0, 2.35, -0.25); mane.rotation.x = -0.6; c.root.add(noOutline(mane));
    return r;
  }
  const r = makeMiner(); r.root.scale.setScalar(1.45); r.scale = 1.45; return tintRig(r, 0xc02a1a, 0.5);
}

/** 训练假人（新手引导）：木桩 + 稻草身体 + 横杆手臂 + 麻袋脑袋，钉在地上不会动 */
export function makeDummy(): Rig {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const wood = 0x8a5a32, straw = 0xd8b45a, sack = 0xc9a87a;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.3, 7), texToon('wood', wood)); post.position.y = 1.15; post.castShadow = true; root.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.18, 8), texToon('wood', lite(wood, 0.2))); base.position.y = 0.09; root.add(base);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 8), toon(straw)); torso.position.y = 1.55; torso.castShadow = true; body.add(torso);
  [1.22, 1.88].forEach(y => { const band = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.05, 5, 12), toon(0x6a3a1a)); band.rotation.x = Math.PI / 2; band.position.y = y; body.add(band); });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), texToon('wood', wood)); bar.rotation.z = Math.PI / 2; bar.position.y = 1.85; body.add(bar);
  [-0.92, 0.92].forEach(x => { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 6), toon(straw)); tuft.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; tuft.position.set(x, 1.85, 0); body.add(tuft); });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), toon(sack)); head.scale.set(1, 1.1, 1); head.position.y = 2.38; head.castShadow = true; body.add(head);
  // 画在麻袋上的靶心
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 16), new THREE.MeshBasicMaterial({ color: 0xb02020, side: THREE.DoubleSide })); ring.position.set(0, 1.6, 0.43); body.add(noOutline(ring));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshBasicMaterial({ color: 0xb02020 })); dot.position.set(0, 1.6, 0.431); body.add(noOutline(dot));
  return { root, body, legs: [], scale: 1, flash: collectMats(root) };
}
