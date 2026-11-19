// ======================================================================
// 装备外观（阶段三）：穿什么就显示什么
//   头、肩、胸甲、武器、副手 = 挂在骨骼上的独立模型；手、腰、腿、脚 = 改身体部件的颜色和材质
//   品级逐级华丽：普通/优秀 简洁铁布 → 精良 加镶边 → 史诗 加装饰和宝石 → 套装 整套造型配色 → 传说 专属轮廓 + 流动发光
//   强化发光：+5 武器微光，+10 持续发光 + 挥动拖尾，+13 周身浮动粒子，任意一格 +15 脚下光环（战士金红，法师蓝紫）
//   套装 4 件：整套光效（熔岩裂纹 / 霜雾环绕）
// 全部是原创低多边形几何 + KayKit（CC0）自带的道具网格
// ======================================================================
import { attachWeaponFx } from './weaponfx';
import { setupStow, stowSpotFor, type StowSpot } from './weaponstow';
import { weaponGlow, shoulderGlow, tickGlow, glowElem, glowSprite } from './gearglow';
import * as THREE from 'three';
import { makeGlbProp, hasGlb } from './creatures_glb';
import { weaponSkinGet } from './weaponskin';
import { propClone, sourceScene, modelHeight, isHdModel } from './chars';
import { HD_ATTACH, HD_RIGS } from './rig';
import { toon, toonGradient, setRimColor } from './gfx';
import * as VFX from './vfx';
import type { Rig } from './models';
import type { ItemInstance, WeaponType } from '../core/Loot';
import type { EquipSlot } from '../core/Inventory';
import { DARK_ITEMS } from '../data/darkgold';
import { CLASSES, ClassId } from '../data/classes';
/** 暗金（v0.6.6 主线：A 的 dark 品质用 B 的暗金外观——流光材质 + 符文环 + 浮空护符）：外观颜色从 darkgold.ts 的 look 取 */
type DarkLook = { look?: { main: number; glow: number; form?: 'bell' | 'astro' | 'wisp'; /** 11-05 比赛版专属 Lux3D 武器模型 [模型名, 长度, 握点, 竖握角]（模型没登记 = 照常用武器类型的默认模型） */ lux?: [string, number, number, number?] } };
/** v1.2.38b：本体暗金表找不到时，去固定装备表找（内容包暗金也能带 look / 专属造型 form） */
const darkDef = (it?: ItemInstance | null): DarkLook | undefined => (it?.quality === 'dark'
  ? (DARK_ITEMS.find(d => d.id === it.fixedId) as DarkLook | undefined) ?? (LOOT_DATA.fixedItems.find(d => d.id === it.fixedId) as DarkLook | undefined) : undefined);
import { isBroken } from '../core/Durability';
import { LOOT_DATA } from '../data/loot';
import { packs, packDress } from '../core/ContentPacks';   // v1.1.2 内容包挂件

export type Equipped = Partial<Record<EquipSlot, ItemInstance>>;
export type GearTier = 0 | 1 | 2 | 3 | 4 | 5;   // 0 普通/优秀，1 精良，2 史诗，3 套装，4 传说，5 暗金典藏（v0.5 B）
export const TIER_NAME = ['普通', '精良', '史诗', '套装', '传说', '暗金'];

/** 套装外观：配色 + 4 件套整套光效 */
export interface SetLook { name: string; main: number; accent: number; aura: 'lava' | 'frost' | 'shadow' | 'holy'; /** 整套统一的装饰：兽骨角/骨刺（狂怒）或冰晶（霜誓） */ ornament: 'bone' | 'crystal'; }
export const SET_LOOKS: Record<string, SetLook> = {
  set_fury: { name: '狂怒战魂', main: 0x8a1a14, accent: 0x2a1a14, aura: 'lava', ornament: 'bone' },
  set_frost: { name: '霜誓秘仪', main: 0x5aa8e0, accent: 0xe8f4ff, aura: 'frost', ornament: 'crystal' },
};
const UPGRADE_COLOR = { warrior: 0xff8a2a, mage: 0x8a6aff, chrono: 0xffc040, alchemy: 0x8aff40 } as Record<string, number>;
/** v0.7.0：当前在搭的是不是皮甲职业（时砂行者）：tierColor 换皮革配色；布甲式的造型照用 */
let curLeather = false, curAlchemy = false;

/** v1.2.54 Rhett：武器模型不要描边（卡通描边在暗场景里是一圈浅紫轮廓）：武器及其子节点（Lux3D 武器、强化光件）全部关掉描边 */
function noWeaponOutline(w: THREE.Object3D | null) { w?.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) for (const x of Array.isArray(m) ? m : [m]) x.userData.outlineParameters = { visible: false }; }); }
export function tierOf(it?: ItemInstance): GearTier {
  if (!it) return 0;
  if (it.quality === 'dark') return 5;
  if (it.quality === 'orange') return 4;
  if (it.setId) return 3;
  if (it.quality === 'purple') return 2;
  if (it.quality === 'blue') return 1;
  return 0;
}
/** 品级的金属/布料配色 */
function tierColor(it: ItemInstance | undefined, cloth: boolean): { c: number; k: number; trim: number; gem: number } {
  const t = tierOf(it);
  if (t === 5) { const r = darkDef(it); return { c: r?.look?.main ?? 0x3a2a10, k: 0.75, trim: 0xffd060, gem: r?.look?.glow ?? 0xffc040 }; }
  if (t === 3 && it?.setId && SET_LOOKS[it.setId]) { const s = SET_LOOKS[it.setId]; return { c: s.main, k: 0.55, trim: s.accent, gem: s.main }; }
  if (cloth && curAlchemy) return [   // 炼金：炭黑底 + 暗红 / 黄铜
    { c: 0x5a4a40, k: 0.2, trim: 0x8a6a3a, gem: 0x8aff40 },
    { c: 0x3a3a40, k: 0.35, trim: 0xb08040, gem: 0x5ac8ff },
    { c: 0x5a1a1a, k: 0.45, trim: 0xd0a050, gem: 0x8aff40 },
    { c: 0x5a1a1a, k: 0.45, trim: 0xd0a050, gem: 0x8aff40 },
    { c: 0x1a1414, k: 0.55, trim: 0xffb040, gem: 0x9aff3a },
  ][t];
  if (cloth && curLeather) return [
    { c: 0x8a6a48, k: 0.2, trim: 0x5a4028, gem: 0xffc860 },
    { c: 0x3a5a8a, k: 0.35, trim: 0xd8b878, gem: 0x6ab0ff },
    { c: 0x2a2a5a, k: 0.45, trim: 0xe0b050, gem: 0xffc040 },
    { c: 0x2a2a5a, k: 0.45, trim: 0xe0b050, gem: 0xffc040 },
    { c: 0x1a1a2a, k: 0.55, trim: 0xffc040, gem: 0xffb020 },
  ][t];
  if (cloth) return [
    { c: 0xd8c8a8, k: 0.15, trim: 0x8a7a5a, gem: 0x6ab0ff },
    { c: 0x4a6ad8, k: 0.35, trim: 0xd0d8f0, gem: 0x6ab0ff },
    { c: 0x6a2ab0, k: 0.45, trim: 0xe0c060, gem: 0xc060ff },
    { c: 0x6a2ab0, k: 0.45, trim: 0xe0c060, gem: 0xc060ff },
    { c: 0x2a1a40, k: 0.55, trim: 0xffb040, gem: 0xff9020 },
  ][t];
  return [
    { c: 0xa8a8a8, k: 0.2, trim: 0x6a6a6a, gem: 0x6ab0ff },
    { c: 0x8aa0d0, k: 0.35, trim: 0xd8dde8, gem: 0x4a8aff },
    { c: 0x5a4a70, k: 0.4, trim: 0xe0b040, gem: 0xc040ff },
    { c: 0x5a4a70, k: 0.4, trim: 0xe0b040, gem: 0xc040ff },
    { c: 0x2a2420, k: 0.55, trim: 0xffa030, gem: 0xff7010 },
  ][t];
}

// ---------------------------------------------------------------- 绑定姿势工具
interface Bind { model: string; H: number; bones: Map<string, THREE.Matrix4>; pos: Map<string, THREE.Vector3>;
  /** v1.2.17 写实模型：KayKit 模型空间 → 写实模型空间（按骨骼：相对 KayKit 同名骨骼的偏移 × s，搬到真实骨骼） */
  remap?: Map<string, THREE.Matrix4>; }
const bindCache = new Map<string, Bind>();
/** 写实模型挂件的 KayKit 参照（骑士绑定姿势；4 个 KayKit 人形骨架一致） */
const KAY_REF = 'Knight';
function bindOf(model: string): Bind | null {
  const c = bindCache.get(model); if (c) return c;
  const src = sourceScene(model); if (!src) return null;
  src.updateMatrixWorld(true);
  const b: Bind = { model, H: modelHeight(model), bones: new Map(), pos: new Map() };
  src.traverse(o => { if (!(o as THREE.Mesh).isMesh) { b.bones.set(o.name, o.matrixWorld.clone()); b.pos.set(o.name, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); } });
  // v1.2.17：写实模型——挂件代码看到的骨骼位置换成 KayKit 的（原有坐标照旧算），attach 时再按偏移表搬到真实骨骼
  const ref = isHdModel(model) ? bindOf(KAY_REF) : null, rig = HD_RIGS[model];
  if (ref && rig) {
    b.remap = new Map();
    const fixes = HD_ATTACH[model] ?? {};
    for (const [name, a] of Object.entries(rig.alias)) {
      const kp = ref.pos.get(name), hp = b.pos.get(name); if (!kp || !hp) continue;
      const f = fixes[name] ?? {}, s = f.s ?? a.k;
      const to = hp.clone().add(new THREE.Vector3(...(f.off ?? [0, 0, 0])));
      // M = T(to) · S(s) · T(−kp)
      b.remap.set(name, new THREE.Matrix4().makeTranslation(to.x, to.y, to.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-kp.x, -kp.y, -kp.z)));
      b.pos.set(name, kp.clone()); b.H = ref.H;
    }
  }
  bindCache.set(model, b);
  return b;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** 把物体挂到骨骼上：pos / rot 是在「模型空间」（脚底原点、y 向上、面朝 +z、绑定姿势）里想要的位置朝向（写实模型 = KayKit 参照空间，自动换算） */
function attach(inst: THREE.Object3D, bind: Bind, bone: string, obj: THREE.Object3D, pos: THREE.Vector3, rot: THREE.Euler = _e.set(0, 0, 0), scale = 1) {
  const target = inst.getObjectByName(bone); const bw = bind.bones.get(bone);
  if (!target || !bw) return false;
  const want = new THREE.Matrix4().compose(pos, _q.setFromEuler(rot), new THREE.Vector3(scale, scale, scale));
  const rm = bind.remap?.get(bone); if (rm) want.premultiply(rm);
  _m.copy(bw).invert().multiply(want);
  _m.decompose(obj.position, obj.quaternion, obj.scale);
  target.add(obj);
  return true;
}

// ---------------------------------------------------------------- 材质
function metal(color: number, emissive = 0) {
  const m = toon(color); m.userData.baseEmissive = emissive; if (emissive) m.emissive.setHex(emissive); return m;
}
function gemMat(color: number) {
  const m = new THREE.MeshToonMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.6), gradientMap: toonGradient() });
  m.userData.baseEmissive = m.emissive.getHex(); m.userData.pulse = 0.6; return m;
}
const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { const x = new THREE.Mesh(g, m); x.castShadow = true; x.frustumCulled = false; return x; };

// ---------------------------------------------------------------- 状态
interface GearFx {
  objs: THREE.Object3D[];             // 挂上去的东西（换装时全部拆掉）
  mats: THREE.MeshToonMaterial[];     // 装备自己的材质（受击闪白也要闪）
  pulse: THREE.MeshToonMaterial[];    // 会呼吸发光的材质（宝石、符文、强化武器）
  glowCol: THREE.Color; glowK: number; // 强化发光
  up?: number;
  /** v0.9.6b 主手是太古：武器红色边缘光 + 少量火星 */
  anc?: boolean;
  weapon: THREE.Object3D | null;      // 主手武器（拖尾取刀尖）
  trail: { mesh: THREE.Mesh; pts: THREE.Vector3[]; on: boolean } | null;
  motes: THREE.Points | null;         // +9 浮动粒子 / 套装光效粒子
  halo: THREE.Mesh | null;            // +10 脚下光环
  aura: { kind: SetLook['aura']; pts: THREE.Points; color: THREE.Color } | null;
  /** v0.5 B：暗金典藏——动态流光材质（金色 ↔ 典藏主色扫光）和环绕的专属挂件（符文环、碎晶、浮空护符） */
  relicMats: { m: THREE.MeshToonMaterial; glow: THREE.Color }[];
  relicSpin: { o: THREE.Object3D; speed: number; bob?: number; base?: THREE.Vector3 }[];
  bodyBase: Map<THREE.MeshToonMaterial, { color: THREE.Color; emissive: number }>;
  t: number;
  summary: string;
  /** v1.2.37e 武器 / 肩部光焰（gearglow.ts） */
  glows?: THREE.Points[];
  /** v1.2.41 写实武器专属光效（weaponfx.ts）每帧更新 */
  wfx?: ((t: number, dt: number) => void)[];
}
const fxOf = (rig: Rig) => rig.root.userData.gearFx as GearFx | undefined;

/** 当前外观的一句话描述（测试 / 调试） */
export function gearSummary(rig: Rig) { return fxOf(rig)?.summary ?? ''; }

const HAND_PROPS = ['1H_Sword', '2H_Sword', '1H_Sword_Offhand', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Axe', '2H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Mug',
  '2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'];
const HEAD_PROPS = ['Knight_Helmet', 'Mage_Hat', 'Barbarian_Hat'];
const CAPES = ['Knight_Cape', 'Mage_Cape', 'Barbarian_Cape', 'Rogue_Cape'];

/** 武器类型 → 道具网格（哪个模型的哪个网格）；没有现成网格的（锤、法球）程序生成 */
const WEAPON_PROP: Partial<Record<WeaponType, [string, string]>> = {
  sword: ['Knight', '1H_Sword'], greatsword: ['Knight', '2H_Sword'], axe: ['Barbarian', '1H_Axe'], greataxe: ['Barbarian', '2H_Axe'],
  staff: ['Mage', '2H_Staff'], wand: ['Mage', '1H_Wand'], dagger: ['Rogue', 'Knife'], tome: ['Mage', 'Spellbook_open'],
};
const OFFHAND_PROP: Partial<Record<WeaponType, [string, string]>> = {
  sword: ['Knight', '1H_Sword_Offhand'], axe: ['Barbarian', '1H_Axe_Offhand'], dagger: ['Rogue', 'Knife_Offhand'], tome: ['Mage', 'Spellbook_open'],
};
/** 盾牌随品级换造型：圆盾 → 徽记盾 → 方盾 → 尖刺盾 */
const SHIELD_BY_TIER = [['Knight', 'Round_Shield'], ['Knight', 'Badge_Shield'], ['Knight', 'Rectangle_Shield'], ['Knight', 'Spike_Shield'], ['Knight', 'Spike_Shield']] as const;

/**
 * 按身上的装备重建外观。rig 必须是 KayKit 角色（makeCharacter 生成）；方块后备模型直接跳过
 * clsId：warrior / mage（决定强化发光颜色、没拿武器时的默认训练武器）
 */
export function applyGear(rig: Rig, clsId: string, eq: Equipped) {
  const model = rig.root.userData.model as string | undefined;
  const inst = rig.body;
  if (!model || !inst) return;
  const bind = bindOf(model); if (!bind) return;
  const H = bind.H;
  // ---- 拆掉旧的
  const old = fxOf(rig);
  if (old) {
    disposeGear(rig);
    old.objs.forEach(o => o.parent?.remove(o));
    rig.flash = rig.flash.filter(m => !old.mats.includes(m));
    old.bodyBase.forEach((b, m) => { m.color.copy(b.color); m.emissive.setHex(b.emissive); m.userData.baseEmissive = b.emissive; });
  }
  const fx: GearFx = { objs: [], mats: [], pulse: [], glowCol: new THREE.Color(UPGRADE_COLOR[clsId] ?? CLASSES[clsId as ClassId]?.ext?.upgradeColor ?? 0xffa040), glowK: 0, weapon: null, trail: null, motes: null, halo: null, aura: null, relicMats: [], relicSpin: [],
    bodyBase: old?.bodyBase ?? new Map(), t: 0, summary: '' };
  rig.root.userData.gearFx = fx;
  const add = (o: THREE.Object3D) => { fx.objs.push(o); o.traverse(x => { const m = (x as THREE.Mesh).material as THREE.MeshToonMaterial | undefined; if (m && (m as THREE.MeshToonMaterial).isMeshToonMaterial) { fx.mats.push(m); rig.flash.push(m); if (m.userData.pulse) fx.pulse.push(m); } }); };
  const P = (name: string) => bind.pos.get(name) ?? new THREE.Vector3(0, H * 0.7, 0);
  const sum: string[] = [];
  const leather = clsId === 'chrono';
  const ext = CLASSES[clsId as ClassId]?.ext;   // v1.0.6 内容包职业：挂件由包程序化生成
  const alchemy = clsId === 'alchemy';
  curLeather = leather; curAlchemy = alchemy;
  // v1.2.25 比赛版 Lux3D 模型：盔甲 / 服饰是模型自带的，不再叠 KayKit 头盔、披风、肩甲、胸甲和职业服饰（只保留武器、副手和品级光效）
  const lux = !!rig.root.userData.lux;
  const cloth = clsId === 'mage' || leather || alchemy;   // 皮甲沿用布甲式的轻量造型（衣领、腰封），配色走皮革

  // ---- 自带网格：先全部藏起来（手里的东西、帽子、披风）
  inst.traverse(o => { if ((o as THREE.Mesh).isMesh && (HAND_PROPS.includes(o.name) || HEAD_PROPS.includes(o.name) || CAPES.includes(o.name))) o.visible = false; });
  const showOwn = (name: string) => { const o = inst.getObjectByName(name); if (o) { o.visible = true; return o as THREE.Mesh; } return null; };
  /** 拿一件道具：自己模型里有就直接显示（换成独立材质好染色），没有就从别的模型克隆过来挂到同名骨骼 */
  const prop = (srcModel: string, name: string, boneOverride?: string): THREE.Mesh | null => {
    const c = propClone(srcModel, name); if (!c) return null;
    const bone = inst.getObjectByName(boneOverride ?? c.bone);
    if (!bone) return null;
    if (boneOverride && boneOverride !== c.bone) {
      // 挂到另一侧的手：取原网格在原骨骼下的局部变换，镜像一下
      c.mesh.position.x *= -1;
    }
    bone.add(c.mesh); add(c.mesh);
    return c.mesh;
  };
  const tint = (m: THREE.Mesh | null, it: ItemInstance | undefined, k = 1) => {
    if (!m) return;
    const mat = m.material as THREE.MeshToonMaterial; const tc = tierColor(it, cloth);
    mat.color.set(0xffffff).lerp(new THREE.Color(tc.c), tc.k * k);
    const t = tierOf(it);
    if (t === 5) { mat.color.set(tc.c).lerp(new THREE.Color(0xc89a30), 0.5); mat.userData.baseEmissive = 0x2a1a00; fx.relicMats.push({ m: mat, glow: new THREE.Color(tc.gem) }); }
    else if (t >= 4) { mat.emissive.setHex(0x3a1800); mat.userData.baseEmissive = 0x3a1800; mat.userData.pulse = 0.5; if (!fx.pulse.includes(mat)) fx.pulse.push(mat); }
  };
  void showOwn;

  // ---- 主手武器
  const mh = eq.mainHand;
  const wt: WeaponType = (mh?.weaponType as WeaponType) ?? (ext ? (CLASSES[clsId as ClassId].equip.weapons?.[0] ?? 'sword') : leather ? 'chakram' : alchemy ? 'flask' : cloth ? 'staff' : 'sword');
  rig.root.userData.weaponType = wt;   // v1.2.40 武器外观覆盖按这个类型查
  let weapon: THREE.Mesh | null = null;
  const wp = WEAPON_PROP[wt];
  if (wp) weapon = prop(wp[0], wp[1]);
  else if (wt === 'flask') weapon = buildFlask(inst, bind, tierColor(mh, true), tierOf(mh), add);
  else if (wt === 'chakram') weapon = buildChakram(inst, bind, tierColor(mh, true), tierOf(mh), 'handslotr', add);
  else if (wt === 'mace') weapon = buildMace(inst, bind, tierColor(mh, false), tierOf(mh), add);
  const hd = !!bind.remap;
  const ohType = eq.offHand && eq.offHand !== mh ? eq.offHand.weaponType as string : undefined;
  if (weapon) {
    weapon.userData.stowSpot = stowSpotFor(wt, 'main', hd, { shield: ohType === 'shield' });   // v1.2.48 收纳位置
    tint(weapon, mh, 0.8);
    if (!mh) (weapon.material as THREE.MeshToonMaterial).color.set(0xb8a890);   // 没拿武器：训练用的旧武器
    fx.weapon = weapon;
    if (wt !== 'chakram' && wt !== 'flask') {
      decorateWeapon(weapon, mh, add);
      if (tierOf(mh) === 5) relicWeapon(weapon, mh!, fx, add);
    }
  }
  // v1.2.26 比赛版 Lux3D 武器：套在程序化 / KayKit 武器上（沿用它的握持位置和品级光效），原网格隐藏
  const luxify = (w: THREE.Mesh | null, key: string, len: number, anchor: number, arm = 0, palm = false) => {
    if (!lux || !w) return; const g = makeGlbProp(key, len, anchor); if (!g) return;
    // 挂到原武器的父节点（骨骼）上、取它的位置和朝向；缩放只用均匀缩放（KayKit 道具在写实骨架上是非均匀缩放，直接当子节点会被拉丝）
    const par = w.parent; if (!par) return; rig.root.updateMatrixWorld(true);
    const ps = par.getWorldScale(new THREE.Vector3()), rs = rig.root.getWorldScale(new THREE.Vector3());
    // 作为原武器的子节点（跟随它的显隐，比如时轮刃掷出时）；用 k / 父缩放 抵消非均匀缩放，世界里是均匀的 k
    void ps; const pivot = new THREE.Group();
    // 骨骼链（写实骨架重映射）里带非均匀缩放：直接求一个局部矩阵，让 pivot 的世界矩阵 = 原武器的位置 + 朝向 + 均匀缩放（角色根缩放）
    const W = w.matrixWorld.clone(), wp = new THREE.Vector3(), wq = new THREE.Quaternion(), wsc = new THREE.Vector3(); W.decompose(wp, wq, wsc);
    // 11-05 Rhett「暗金武器看着脱手」：KayKit 道具的局部偏移按 KayKit 手槽量的，套到写实骨架（骨链带缩放）后原点离手 0.4–0.6 米。
    // palm = 握点直接对到手掌（手骨 → 中指根的中点），只改位置，朝向仍按原武器
    if (palm) { let hb: THREE.Object3D | null = par; while (hb && !(hb as THREE.Bone).isBone) hb = hb.parent;
      if (hb) { let mid: THREE.Object3D | null = null; hb.traverse(c => { if (!mid && c !== hb && (c as THREE.Bone).isBone && /middle/i.test(c.name)) mid = c; });
        const hp0 = hb.getWorldPosition(new THREE.Vector3()); wp.copy(mid ? hp0.lerp((mid as THREE.Object3D).getWorldPosition(new THREE.Vector3()), 0.5) : hp0); } }
    pivot.matrixAutoUpdate = false; pivot.matrix.copy(W.clone().invert().multiply(new THREE.Matrix4().compose(wp, wq, new THREE.Vector3(rs.y, rs.y, rs.y))));
    // 朝向：原武器网格的最长轴（KayKit 道具握点在原点 → 离原点更远的一端是武器头），Lux 道具的 +Y（头）对齐过去
    const gb = new THREE.Box3().setFromObject(w, true).applyMatrix4(W.clone().invert());
    const ext = gb.getSize(new THREE.Vector3()).multiply(wsc), ax = ext.x >= ext.y && ext.x >= ext.z ? 'x' : ext.z > ext.y ? 'z' : 'y';
    const dir = new THREE.Vector3(); dir[ax] = Math.abs(gb.max[ax]) >= Math.abs(gb.min[ax]) ? 1 : -1;
    // v1.2.27 长柄（法杖）：原 KayKit 法杖在写实骨架上是横着的（平举）→ 改为顺着小臂往上竖握（arm = 向外偏的角度，弧度）
    if (arm) {
      const hp = par.getWorldPosition(new THREE.Vector3()), hb = new THREE.Box3().setFromObject(rig.root);
      const reach = (hb.max.y - hb.min.y) * 0.12; let a: THREE.Object3D | null = par.parent, up: THREE.Vector3 | null = null;
      for (let i = 0; a && i < 6; i++, a = a.parent) { const ap = a.getWorldPosition(new THREE.Vector3()); if (ap.distanceTo(hp) > reach) { up = ap.sub(hp); break; } }
      if (up) {
        up.applyQuaternion(wq.clone().invert()).normalize();
        const side = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        dir.copy(up.applyAxisAngle(side.normalize(), arm)).normalize();
      }
    }
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    w.traverse(c => { const mm = (c as THREE.Mesh).material as THREE.Material | undefined; if (mm) mm.visible = false; });
    pivot.add(g); w.add(pivot); fx.objs.push(pivot);
    const up = attachWeaponFx(g, key, len, anchor); if (up) (fx.wfx ??= []).push(up);
  };
  // 11-18 修：b0d0f2f 把 luxify 调用写进了注释 → 主手一律退回 KayKit 原道具（Rhett「所有模型都无法在角色身上展示」）
  // 外观优先级：铸造台 / 武器库换上且绑在这件装备上的外观 > 暗金专属模型 > 该类型默认 Lux 模型（Rhett 11-18「默认是我穿戴的模型」）
  const dlx = darkDef(mh)?.look?.lux, sk = weaponSkinGet(wt, mh?.id ?? null), lw = sk && hasGlb(sk) ? weaponSkinFor(wt, LUX_W[wt], mh?.id ?? null) : dlx && hasGlb(dlx[0]) ? dlx : LUX_W[wt];
  if (lw) luxify(weapon, lw[0], lw[1], lw[2], lw[3] ?? 0, !!wp);   // 11-05 KayKit 道具类主手握点对手掌（Rhett 11-05 22:15）
  sum.push(`主手:${mh ? wt : '训练' + wt}`);
  if (mh?.quality === 'dark') sum.push(`暗金:${mh.name}`);
  // ---- 副手
  const oh = eq.offHand && eq.offHand !== mh ? eq.offHand : undefined;
  if (oh) {
    const ot = oh.weaponType as WeaponType;
    let m: THREE.Mesh | null = null;
    const olx0 = darkDef(oh)?.look?.lux, olx = olx0 && hasGlb(olx0[0]) ? olx0 : undefined;   // 11-05 暗金专属模型（副手）
    const lux2 = (w: THREE.Mesh | null, key: string, len: number, anchor: number) => (olx ? luxify(w, ...olx) : luxify(w, key, len, anchor));
    if (ot === 'shield') { const s = SHIELD_BY_TIER[Math.min(4, tierOf(oh))]; m = prop(s[0], s[1]); lux2(m, 'weapon_bell_shield', 0.95, 0.5); }
    else if (ot === 'orb') { m = buildOrb(inst, bind, tierColor(oh, true), tierOf(oh), add); lux2(m, 'weapon_rock_orb', 0.36, 0.5); }
    else if (ot === 'chakram') { m = buildChakram(inst, bind, tierColor(oh, true), tierOf(oh), 'handslotl', add); lux2(m, 'weapon_time_chakram', 0.8, 0.5); }
    else if (ot === 'reagent') { m = buildReagentBox(inst, bind, tierColor(oh, true), tierOf(oh), add); if (olx) luxify(m, ...olx); }
    else if (ot === 'hourglass') { m = buildHourglass(inst, bind, tierColor(oh, true), tierOf(oh), add); if (olx) luxify(m, ...olx); }
    else { const p = OFFHAND_PROP[ot]; if (p) m = prop(p[0], p[1]); if (ot === 'tome') lux2(m, 'weapon_rock_tome', 0.42, 0.5); else if (olx) luxify(m, ...olx); }
    if (m) m.userData.stowSpot = stowSpotFor(ot, 'off', hd);   // v1.2.48
    noWeaponOutline(m);
    if (m && ot !== 'orb' && ot !== 'chakram' && ot !== 'hourglass' && ot !== 'reagent') tint(m, oh, 0.8);
    sum.push(`副手:${ot}`);
  }
  noWeaponOutline(weapon);
  // ---- 头
  const head = lux ? undefined : eq.head;
  if (head) {
    // 皮甲：头巾兜帽是模型自带的（Head_Hooded），只做染色 + 额前宝石
    const helm = leather || ext ? null : cloth ? prop('Mage', 'Mage_Hat') : prop('Knight', 'Knight_Helmet');   // v1.0.6 内容包职业的头部挂件由包生成
    tint(helm, head, 1.5);
    if (!leather && !ext) decorateHead(inst, bind, head, cloth, add);
    sum.push(`头:${TIER_NAME[tierOf(head)]}`);
  }
  // ---- 披风
  if (eq.back && !lux) {
    const cape = leather || ext ? prop('Rogue_Hooded', 'Rogue_Cape') : prop(cloth ? 'Mage' : 'Knight', cloth ? 'Mage_Cape' : 'Knight_Cape');
    tint(cape, eq.back);
    if (cape && bind.remap) cape.scale.multiply(new THREE.Vector3(1.15, 1.75, 1.2));   // v1.2.17 写实身材：KayKit 披风只到腰，拉长到膝
    sum.push('披风');
  }
  // ---- v0.5 B：暗金典藏饰品——身边环绕的浮空护符（饰品本身没有挂件位）
  for (const k of ['trinket1', 'trinket2'] as const) {
    const tr = eq[k]; if (tr?.quality !== 'dark') continue;
    relicCharm(rig, tr, fx, k === 'trinket1' ? 0 : Math.PI, add);
    sum.push(`暗金:${tr.name}`);
  }
  // ---- 肩甲：低多边形大肩甲，从远处看轮廓就能认出品级
  if (eq.shoulder && !lux) {
    for (const side of [1, -1] as const) buildPauldron(inst, bind, eq.shoulder, cloth, side, add);
    sum.push(`肩:${TIER_NAME[tierOf(eq.shoulder)]}`);
  }
  // v1.2.17 写实战士自带的程序化板甲（models.ts ubcPlate）：穿了肩 / 胸装备就让位给装备外观，避免两层叠穿
  inst.traverse(o => { if (o.name.startsWith('plate_pauldron_')) o.visible = !eq.shoulder; else if (o.name === 'plate_chest') o.visible = !eq.chest; else if (o.name === 'robe_hood' || o.name === 'ubc_hair') o.visible = !head; });   // v1.2.20 法师戴帽时藏兜帽（帽子不再压在兜帽上）
  // ---- 胸甲：重甲胸板 / 布甲衣领和腰封
  if (eq.chest && !lux) { buildChest(inst, bind, eq.chest, cloth, add); sum.push(`胸:${TIER_NAME[tierOf(eq.chest)]}`); }
  // ---- 手、腰、腿、脚：身体部件染色（手套→手臂，胸甲+腰带→身体，腿甲+鞋→腿）
  if (leather && !lux) chronoDress(inst, bind, eq, add);
  if (alchemy && !lux) alchemyDress(inst, bind, eq, add);
  if (ext?.dress) { try { ext.dress({ H, hd: !!bind.remap, lux, skin: t => { const k = weaponSkinGet(t, Object.values(eq).find(x => x?.weaponType === t)?.id ?? null); return k && hasGlb(k) ? k : null; }, eq: eq as Record<string, ItemInstance | undefined>, attach: (bone, obj, off, rot) => { const bp = bind.pos.get(bone); if (!bp) return false; const o = obj as THREE.Object3D; const ok = attach(inst, bind, bone, o, bp.clone().add(new THREE.Vector3(...(off ?? [0, 0, 0]))), new THREE.Euler(...(rot ?? [0, 0, 0]))); if (ok) add(o); return ok; } }); } catch (e) { console.error('职业挂件出错', e); } sum.push('职业挂件'); }
  { const pd = (bone: string, obj: unknown, off?: [number, number, number], rot?: [number, number, number]) => { const bp = bind.pos.get(bone); if (!bp) return false; const o = obj as THREE.Object3D; const ok = attach(inst, bind, bone, o, bp.clone().add(new THREE.Vector3(...(off ?? [0, 0, 0]))), new THREE.Euler(...(rot ?? [0, 0, 0]))); if (ok) add(o); return ok; };
    const n0 = fx.objs.length;
    if (packs().length && packDress({ H, eq: eq as Record<string, ItemInstance | undefined>, attach: pd, cls: clsId })) sum.push('包挂件');
    for (let i = n0; i < fx.objs.length; i++) fx.objs[i].userData.noStow = true; }   // v1.2.48 渊噬部件（结晶臂等）是身体的一部分，不收纳   // v1.1.2 内容包挂件（没有包 = 不调用）
  const bodyParts: [RegExp, (ItemInstance | undefined)[]][] = [[/_Arm(Left|Right)$/, [eq.hands, eq.wrist]], [/_Body$/, [eq.chest, eq.waist]], [/_Leg(Left|Right)$/, [eq.legs, eq.feet]], ...(leather ? [[/_Head(_Hooded)?$/, [eq.head]] as [RegExp, (ItemInstance | undefined)[]]] : [])];
  inst.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    for (const [re, items] of bodyParts) {
      if (!re.test(m.name)) continue;
      const mat = m.material as THREE.MeshToonMaterial;
      if (!fx.bodyBase.has(mat)) fx.bodyBase.set(mat, { color: mat.color.clone(), emissive: mat.userData.baseEmissive ?? 0 });
      const base = fx.bodyBase.get(mat)!;
      const worn = items.filter(Boolean) as ItemInstance[];
      if (!worn.length) continue;
      const best = worn.reduce((a, b) => (tierOf(b) > tierOf(a) ? b : a));
      const tc = tierColor(best, cloth);
      mat.color.copy(base.color).lerp(new THREE.Color(tc.c), tc.k * (worn.length === 2 ? 0.9 : 0.6));
      if (tierOf(best) >= 4) { mat.userData.pulse = 0.25; mat.userData.pulseBase = 0x1a0c00; fx.pulse.push(mat); }
    }
  });
  // ---- v1.2.37e 武器按品质 / 元素发光 + 肩部光焰
  fx.glows = [];
  if (weapon) { const g = weaponGlow(weapon, mh); if (g) { fx.glows.push(g); fx.objs.push(g); sum.push(`武器光:${glowElem(mh)}`); } }
  if (eq.shoulder) { const g = shoulderGlow(eq.shoulder, inst); if (g) { rig.root.add(g); fx.glows.push(g); fx.objs.push(g); sum.push(`肩光:${glowElem(eq.shoulder)}`); } }
  // ---- 强化发光（看主手武器）
  const up = mh?.upgrade ?? 0;
  // v0.6.2 部位强化 +1~+15：+5 武器微光，+10 持续发光 + 挥动拖尾，+13 周身浮动粒子；任意一格 +15 脚下光环
  const anyMax = Object.values(eq).some(i => (i?.upgrade ?? 0) >= 15);
  if (weapon && up >= 5) {
    const wm = weapon.material as THREE.MeshToonMaterial;
    fx.glowK = up >= 10 ? 0.9 : 0.4;
    wm.userData.glow = true; if (!fx.pulse.includes(wm)) fx.pulse.push(wm);
  }
  if (mh?.ancient && weapon) {   // v0.9.6b 太古武器：红色脉动发光 + 火星（盖过强化色）
    const wm = weapon.material as THREE.MeshToonMaterial;
    fx.glowCol.set(0xff2a2a); fx.glowK = Math.max(fx.glowK, 0.7); fx.anc = true;
    wm.userData.glow = true; if (!fx.pulse.includes(wm)) fx.pulse.push(wm);
    setRimColor(weapon, 0xff2a2a, 0.9);
    sum.push('太古武器');
  }
  if (up >= 10 && weapon) fx.trail = makeTrail(fx.glowCol, rig.root);
  if (up >= 13) { fx.motes = makeMotes(fx.glowCol, 20, H); rig.root.add(fx.motes); fx.objs.push(fx.motes); }
  if (anyMax) { fx.halo = makeHalo(fx.glowCol); rig.root.add(fx.halo); fx.objs.push(fx.halo); }
  fx.up = up;
  if (up) sum.push(`强化+${up}`);
  // ---- 套装 4 件：整套光效
  const sets = new Map<string, number>();
  Object.values(eq).forEach(i => i?.setId && !isBroken(i) && sets.set(i.setId, (sets.get(i.setId) ?? 0) + 1));   // 已损坏的不算件数（v0.5 B）
  for (const [id, n] of sets) {
    const look = SET_LOOKS[id]; if (!look || n < 4) continue;
    const color = new THREE.Color(look.aura === 'lava' ? 0xff5a10 : look.aura === 'frost' ? 0xbfe8ff : look.aura === 'holy' ? 0xffe080 : 0x9a4aff);
    const pts = makeMotes(color, look.aura === 'frost' ? 18 : 30, H, look.aura === 'frost' ? 'ring' : 'rise');
    rig.root.add(pts); fx.objs.push(pts);
    fx.aura = { kind: look.aura, pts, color };
    // 熔岩裂纹：身体部件的自发光闪烁
    fx.bodyBase.forEach((_b, m) => { m.userData.pulse = look.aura === 'lava' ? 0.5 : 0.3; m.userData.pulseBase = look.aura === 'lava' ? 0x5a1400 : 0x10304a; if (!fx.pulse.includes(m)) fx.pulse.push(m); });
    sum.push(`套装光效:${look.name}`);
  }
  // ---- v1.2.48 握法动作：双手巨剑 / 巨斧改用双手劈砍（其余按职业动作表）
  rig.anim?.setWeaponClips?.(clsId === 'warrior' && (wt === 'greatsword' || wt === 'greataxe') ? TWO_HAND_CLIPS : undefined);
  // ---- v1.2.48 武器收纳：手上的东西（主手 / 副手 / 内容包职业 dress 挂到手上的武器）登记收纳挂点（weaponstow.ts）
  const hands: { obj: THREE.Object3D; spot: StowSpot }[] = [];
  for (const o of fx.objs) {
    const pn = o.parent?.name; if ((pn !== 'handslotr' && pn !== 'handslotl') || o.userData.noStow) continue;
    let spot = o.userData.stowSpot as StowSpot | undefined;
    if (!spot) {   // 内容包 dress：userData.stow = 武器类型（如 'bow' / 'glaive'），没写就按长度猜
      const st = o.userData.stow as string | undefined;
      if (st) spot = stowSpotFor(st, pn === 'handslotr' ? 'main' : 'off', hd);
      else { const b = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); const long = Math.max(b.x, b.y, b.z) > (rig.root.scale.y || 1) * H * 0.42; spot = long ? (pn === 'handslotr' ? 'backStaff' : 'backL') : pn === 'handslotr' ? 'beltR' : 'beltL'; }
    }
    hands.push({ obj: o, spot });
  }
  setupStow(rig, hands, (bone, pos, q) => {
    const g = new THREE.Group();
    if (!attach(inst, bind, bone, g, new THREE.Vector3(...pos), new THREE.Euler().setFromQuaternion(q))) return null;
    fx.objs.push(g); return g;
  }, bone => bind.pos.get(bone), hd);
  if (hands.length) sum.push('收纳:' + hands.map(h => h.spot).join('/'));
  fx.summary = sum.join(' ');
}
/** v1.2.48 双手武器的普攻 / 重击（KayKit 经典：2H_*；写实：大剑斩 / 横扫 / 下劈） */
const TWO_HAND_CLIPS = {
  attack1: ['MX_GreatSlash_c', '2H_Melee_Attack_Chop'], attack2: ['Sword_Slash_H', '1H_Melee_Attack_Slice_Horizontal'], attack3: ['Sword_Heavy', '2H_Melee_Attack_Spin'],
  heavy: ['MX_Downward', '2H_Melee_Attack_Chop'],
};

/** 每帧：宝石呼吸、传说流光、强化发光、拖尾、粒子、光环 */
export function updateGear(rig: Rig, dt: number) {
  const fx = fxOf(rig); if (!fx) return;
  fx.t += dt;
  const t = fx.t;
  for (const m of fx.pulse) {
    if (m.emissive.getHex() === 0xffffff || m.emissive.getHex() === 0xff2020) continue;   // 正在受击闪白
    if (m.userData.glow) {
      const k = fx.glowK * (0.75 + 0.25 * Math.sin(t * 3));
      m.emissive.copy(fx.glowCol).multiplyScalar(k);
    } else {
      const base = new THREE.Color(m.userData.pulseBase ?? m.userData.baseEmissive ?? 0);
      const k = 0.55 + 0.45 * Math.sin(t * 2.4 + (m.id % 7));
      m.emissive.copy(base).multiplyScalar(0.4 + k * (m.userData.pulse ?? 0.5) * 2.2);
    }
  }
  // 暗金典藏：沿武器扫过的金色流光（两种颜色来回混合）+ 挂件旋转浮动
  for (const r of fx.relicMats) {
    if (r.m.emissive.getHex() === 0xffffff || r.m.emissive.getHex() === 0xff2020) continue;
    const k = 0.5 + 0.5 * Math.sin(t * 3.2), k2 = 0.5 + 0.5 * Math.sin(t * 1.3 + 1);
    r.m.emissive.copy(_gold).lerp(r.glow, k2).multiplyScalar(0.08 + 0.32 * k * k);   // 暗底 + 一阵阵扫过的金光（不要盖掉造型）
  }
  for (const sp of fx.relicSpin) {
    sp.o.rotation.y += dt * sp.speed;
    if (sp.bob !== undefined && sp.base) sp.o.position.set(sp.base.x * Math.cos(t * 0.9 + sp.bob) - sp.base.z * Math.sin(t * 0.9 + sp.bob), sp.base.y + Math.sin(t * 2 + sp.bob) * 0.12, sp.base.x * Math.sin(t * 0.9 + sp.bob) + sp.base.z * Math.cos(t * 0.9 + sp.bob));
  }
  if (fx.glows) for (const g of fx.glows) tickGlow(g, t);
  if (fx.wfx) for (const u of fx.wfx) u(t, dt);
  if (fx.motes) spinMotes(fx.motes, dt, t, 'orbit');
  if (fx.aura) spinMotes(fx.aura.pts, dt, t, fx.aura.kind === 'frost' ? 'ring' : 'rise');
  if (fx.halo) { fx.halo.rotation.z += dt * 0.6; (fx.halo.material as THREE.ShaderMaterial).uniforms.time.value = t; }
  const stowed = ((rig.root.userData.stowK as number | undefined) ?? 0) > 0.5;   // v1.2.48 收纳时不画拖尾 / 刃上火星
  if (fx.trail) fx.trail.mesh.visible = !stowed;
  if (fx.trail && fx.weapon && !stowed) { updateTrail(fx.trail, fx.weapon, rig.root, dt); if (rig.root.parent?.type === 'Scene' && rig.root.visible) VFX.weaponGlowTick(_a, _b, fx.glowCol, fx.up ?? 0); }   // v0.9.1e 刃上光点
  if (fx.aura && rig.root.parent?.type === 'Scene' && rig.root.visible) VFX.setAuraTick(rig.root.position, fx.aura.kind);
  if (fx.anc && fx.weapon && !stowed && rig.root.parent?.type === 'Scene' && rig.root.visible && Math.random() < 0.35) { fx.weapon.getWorldPosition(_anc); VFX.weaponGlowTick(_anc, _anc, 0xff4a20, 13); }
}
const _anc = new THREE.Vector3();

// ---------------------------------------------------------------- 零件
/** 网格自身最长的轴（武器朝向）：0=x 1=y 2=z */
function longAxis(g: THREE.BufferGeometry) {
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox!; const d = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const ax = d.indexOf(Math.max(...d));
  return { ax, bb, len: d[ax] };
}
function axisPoint(bb: THREE.Box3, ax: number, k: number) {
  const c = bb.getCenter(new THREE.Vector3());
  const lo = [bb.min.x, bb.min.y, bb.min.z][ax], hi = [bb.max.x, bb.max.y, bb.max.z][ax];
  c.setComponent(ax, lo + (hi - lo) * k);
  return c;
}
function decorateWeapon(w: THREE.Mesh, it: ItemInstance | undefined, add: (o: THREE.Object3D) => void) {
  const t = tierOf(it); if (t < 2 || !w.geometry) return;
  const tc = tierColor(it, false);
  // 史诗以上：护手处镶一颗宝石；传说：再加一圈符文环
  const { ax, bb, len } = longAxis(w.geometry);
  const gem = mesh(new THREE.OctahedronGeometry(len * 0.06), gemMat(tc.gem));
  gem.position.copy(axisPoint(bb, ax, 0.3));
  w.add(gem); add(gem);
  if (t >= 4) {
    const ring = mesh(new THREE.TorusGeometry(len * 0.08, len * 0.014, 4, 10), gemMat(0xff8a20));
    ring.position.copy(axisPoint(bb, ax, 0.55));
    if (ax === 2) ring.rotation.set(0, 0, 0); else if (ax === 1) ring.rotation.x = Math.PI / 2; else ring.rotation.y = Math.PI / 2;
    w.add(ring); add(ring);
  }
}

// KayKit 角色（模型单位，绑定姿势）：身体 x±0.4 y0.38~1.29 z±0.38；头 y1.22~2.31 半径 0.54；头盔顶 2.47；法师帽顶 3.0、帽檐半径 1.05；肩关节 (±0.21, 1.11)
function decorateHead(inst: THREE.Object3D, b: Bind, it: ItemInstance, cloth: boolean, add: (o: THREE.Object3D) => void) {
  const t = tierOf(it); if (t < 1) return;
  const tc = tierColor(it, cloth);
  const g = new THREE.Group();
  if (!cloth) {
    if (t === 1) {   // 精良：头顶一道金属脊
      const ridge = mesh(new THREE.BoxGeometry(0.08, 0.14, 0.9), metal(tc.trim)); ridge.position.set(0, 2.42, 0.05); g.add(ridge);
    } else if (t === 3) {   // 套装：一对弯曲兽骨角
      for (const s of [1, -1]) {
        const a = mesh(new THREE.ConeGeometry(0.12, 0.5, 6), metal(0xece0c4)); a.position.set(s * 0.68, 1.95, 0); a.rotation.z = -s * 1.25; g.add(a);
        const b2 = mesh(new THREE.ConeGeometry(0.08, 0.38, 6), metal(0xece0c4)); b2.position.set(s * 0.95, 2.22, 0); b2.rotation.z = -s * 0.25; g.add(b2);
      }
    } else {   // 史诗：高耸羽冠 + 两侧翼片；传说：熔金火焰冠
      const crest = mesh(new THREE.ConeGeometry(0.16, 0.6, 4), metal(t >= 4 ? 0xff6a10 : 0xb02030, t >= 4 ? 0x401000 : 0));
      crest.position.set(0, 2.6, -0.1); crest.rotation.x = -0.45; g.add(crest);
      if (t >= 4) for (const s of [1, -1]) { const f = mesh(new THREE.ConeGeometry(0.1, 0.4, 4), gemMat(0xff7010)); f.position.set(s * 0.22, 2.5, -0.05); f.rotation.z = -s * 0.4; g.add(f); }
      for (const s of [1, -1]) { const wing = mesh(new THREE.ConeGeometry(0.08, 0.5, 4), metal(tc.trim)); wing.position.set(s * 0.62, 1.95, -0.05); wing.rotation.z = -s * 1.1; g.add(wing); }
    }
    if (t >= 2) { const gem = mesh(new THREE.OctahedronGeometry(0.08), gemMat(tc.gem)); gem.position.set(0, 2.25, 0.62); g.add(gem); }
  } else {
    // 布甲帽：精良帽带金边；史诗以上帽前一颗发光宝石；传说宝石更大、帽尖一圈符文
    const band = mesh(new THREE.TorusGeometry(0.62, 0.05, 4, 14), metal(tc.trim)); band.rotation.x = Math.PI / 2; band.position.set(0, 1.62, -0.05); g.add(band);
    if (t >= 2) { const gem = mesh(new THREE.OctahedronGeometry(t >= 4 ? 0.14 : 0.1), gemMat(tc.gem)); gem.position.set(0, 1.7, 0.6); g.add(gem); }
    if (t >= 4) { const r = mesh(new THREE.TorusGeometry(0.25, 0.03, 3, 12), gemMat(0xff9020)); r.rotation.x = Math.PI / 2; r.position.set(0, 2.55, -0.3); g.add(r); }
    if (t === 3 && SET_LOOKS[it.setId ?? '']?.ornament === 'crystal') {   // 霜誓：帽檐一圈冰晶尖刺 + 额前大冰晶
      for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.75 + i / 6 * Math.PI * 1.5; const c = mesh(new THREE.ConeGeometry(0.06, 0.32, 4), gemMat(0xbfe8ff)); c.position.set(Math.sin(a) * 0.66, 1.72, Math.cos(a) * 0.66 - 0.05); c.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); g.add(c); }
      const big = mesh(new THREE.OctahedronGeometry(0.13), gemMat(0x9fe8ff)); big.scale.set(0.7, 1.4, 0.7); big.position.set(0, 1.95, 0.62); g.add(big);
    }
  }
  attach(inst, b, 'head', g, new THREE.Vector3(0, 0, 0)); add(g);
}

function buildPauldron(inst: THREE.Object3D, b: Bind, it: ItemInstance, cloth: boolean, side: 1 | -1, add: (o: THREE.Object3D) => void) {
  const t = tierOf(it); const tc = tierColor(it, cloth);
  // 挂在胸骨上（不跟着手臂转）：手臂垂下时肩甲依旧扣在肩头
  const bone = 'chest';
  if (!b.pos.get(bone)) return;
  const g = new THREE.Group();
  const size = (0.27 + t * 0.045) * (cloth ? 0.9 : 1);   // 品级越高肩甲越大
  const main = metal(tc.c), trim = metal(tc.trim);
  if (cloth) {
    // 布甲披肩：压扁的半球 + 金边；史诗以上宝石，传说流光符文
    const dome = mesh(new THREE.SphereGeometry(size, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), main); dome.scale.set(1.15, 0.6, 1.05); g.add(dome);
    const rim = mesh(new THREE.TorusGeometry(size * 1.08, size * 0.12, 4, 12), trim); rim.rotation.x = Math.PI / 2; rim.scale.set(1.1, 1, 1); g.add(rim);
    if (t >= 2) { const gem = mesh(new THREE.OctahedronGeometry(size * 0.25), gemMat(tc.gem)); gem.position.set(side * size * 0.55, size * 0.4, size * 0.4); g.add(gem); }
    if (t >= 4) { const rune = mesh(new THREE.TorusGeometry(size * 0.75, size * 0.06, 3, 14), gemMat(0xff9020)); rune.rotation.x = Math.PI / 2; rune.position.y = size * 0.32; g.add(rune); }
    if (t === 3 && SET_LOOKS[it.setId ?? '']?.ornament === 'crystal') {   // 霜誓：披肩上竖起三根冰棱
      for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(size * 0.12, size * (0.9 + (i === 1 ? 0.4 : 0)), 4), gemMat(0xbfe8ff)); c.position.set(side * size * 0.25, size * 0.55, (i - 1) * size * 0.45); c.rotation.z = -side * 0.35; g.add(c); }
    }
  } else {
    // 重甲：分层的大肩甲（低多边形），品级越高层数越多、越夸张
    const layers = 1 + Math.min(2, t);
    for (let i = 0; i < layers; i++) {
      const plate = mesh(new THREE.SphereGeometry(size * (1 - i * 0.1), 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 === 0 ? main : trim);
      plate.scale.set(1.2, 0.62, 1.1); plate.position.set(side * i * size * 0.18, -i * size * 0.3, 0); g.add(plate);
    }
    if (t === 3) {
      // 套装：兽骨肩——三根弯骨尖刺 + 毛皮圈
      const fur = mesh(new THREE.TorusGeometry(size * 0.95, size * 0.22, 4, 10), metal(0x5a3a22)); fur.rotation.x = Math.PI / 2; fur.position.y = -size * 0.12; g.add(fur);
      for (let i = 0; i < 3; i++) { const bn = mesh(new THREE.ConeGeometry(size * 0.15, size * (1.0 + (i === 1 ? 0.35 : 0)), 5), metal(0xece0c4)); bn.position.set(side * size * 0.3, size * 0.5, (i - 1) * size * 0.5); bn.rotation.z = -side * 0.55; g.add(bn); }
    } else if (t >= 2) {
      // 史诗 / 传说：一排尖刺 + 宝石
      const n = t >= 4 ? 4 : 3;
      for (let i = 0; i < n; i++) { const spike = mesh(new THREE.ConeGeometry(size * 0.13, size * (t >= 4 ? 1.1 : 0.8), 4), trim); spike.position.set(side * size * 0.25, size * 0.45, (i - (n - 1) / 2) * size * 0.45); spike.rotation.z = -side * 0.45; g.add(spike); }
      const gem = mesh(new THREE.OctahedronGeometry(size * 0.2), gemMat(tc.gem)); gem.position.set(side * size * 0.8, 0, size * 0.55); g.add(gem);
    } else if (t === 1) {
      const rim = mesh(new THREE.TorusGeometry(size * 1.05, size * 0.08, 3, 12), trim); rim.rotation.x = Math.PI / 2; rim.scale.set(1.2, 1.1, 1); g.add(rim);
    }
    if (t >= 4) { const rune = mesh(new THREE.TorusGeometry(size * 0.8, size * 0.06, 3, 14), gemMat(0xff7010)); rune.rotation.x = Math.PI / 2; rune.position.y = size * 0.25; g.add(rune); }
  }
  // 肩膀在大头下面：往外、往上一点，让肩甲从正面和侧面都能看见
  attach(inst, b, bone, g, new THREE.Vector3(side * 0.5, 1.2, 0), new THREE.Euler(0, 0, -side * 0.4)); add(g);
}

function buildChest(inst: THREE.Object3D, b: Bind, it: ItemInstance, cloth: boolean, add: (o: THREE.Object3D) => void) {
  const t = tierOf(it); const tc = tierColor(it, cloth);
  if (!b.pos.get('chest')) return;
  const g = new THREE.Group();
  if (!cloth) {
    // 重甲胸板：身前一块带弧度的胸甲；精良加金边，史诗加中央宝石，套装加肋骨纹，传说加熔金核心
    const plate = mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.5, 8, 1, true, -Math.PI * 0.42, Math.PI * 0.84), metal(tc.c));
    (plate.material as THREE.Material).side = THREE.DoubleSide;
    plate.position.set(0, 0.86, 0.02); g.add(plate);
    if (t >= 1) { const rim = mesh(new THREE.TorusGeometry(0.42, 0.03, 3, 14, Math.PI * 0.84), metal(tc.trim)); rim.rotation.set(-Math.PI / 2, 0, Math.PI / 2 - Math.PI * 0.42); rim.position.set(0, 1.1, 0.02); g.add(rim); }
    if (t === 3) for (let i = 0; i < 3; i++) { const rib = mesh(new THREE.BoxGeometry(0.42 - i * 0.06, 0.035, 0.05), metal(0xece0c4)); rib.position.set(0, 0.95 - i * 0.11, 0.43); g.add(rib); }
    if (t >= 2) { const gem = mesh(new THREE.OctahedronGeometry(t >= 4 ? 0.1 : 0.075), gemMat(t >= 4 ? 0xff7010 : tc.gem)); gem.position.set(0, 0.9, 0.44); g.add(gem); }
  } else {
    // 布甲：前襟饰带 + 腰封；史诗以上胸前宝石
    const sash = mesh(new THREE.BoxGeometry(0.16, 0.62, 0.04), metal(tc.trim)); sash.position.set(0, 0.85, 0.41); g.add(sash);
    const belt = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 10, 1, true), metal(tc.c)); (belt.material as THREE.Material).side = THREE.DoubleSide; belt.position.set(0, 0.62, 0); g.add(belt);
    if (t >= 2) { const gem = mesh(new THREE.OctahedronGeometry(t >= 4 ? 0.1 : 0.075), gemMat(tc.gem)); gem.position.set(0, 1.0, 0.44); g.add(gem); }
    if (t === 3 && SET_LOOKS[it.setId ?? '']?.ornament === 'crystal') for (const sx of [1, -1]) { const c = mesh(new THREE.OctahedronGeometry(0.06), gemMat(0xbfe8ff)); c.scale.set(0.7, 1.6, 0.7); c.position.set(sx * 0.18, 0.95, 0.43); g.add(c); }
  }
  attach(inst, b, 'chest', g, new THREE.Vector3(0, 0, 0)); add(g);
}

function buildMace(inst: THREE.Object3D, b: Bind, tc: { c: number; trim: number }, t: GearTier, add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  // 锤：木柄 + 带凸缘的锤头（没有现成网格；照 1H_Sword 在手里的位置和朝向搭）
  const ref = propClone('Knight', '1H_Sword'); if (!ref) return null;
  const { ax, bb, len } = longAxis(ref.mesh.geometry);
  const headM = new THREE.MeshToonMaterial({ color: tc.c, gradientMap: toonGradient() }); headM.userData.baseEmissive = 0;
  const g = mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), headM);
  g.position.copy(ref.mesh.position); g.quaternion.copy(ref.mesh.quaternion); g.scale.copy(ref.mesh.scale);
  const rot = ax === 2 ? new THREE.Euler(Math.PI / 2, 0, 0) : ax === 0 ? new THREE.Euler(0, 0, Math.PI / 2) : new THREE.Euler();
  const handle = mesh(new THREE.CylinderGeometry(len * 0.03, len * 0.035, len * 0.8, 6), metal(0x6a4a2a));
  handle.position.copy(axisPoint(bb, ax, 0.4)); handle.rotation.copy(rot); g.add(handle);
  const hc = axisPoint(bb, ax, 0.82);
  const head = mesh(new THREE.DodecahedronGeometry(len * 0.11, 0), headM); head.position.copy(hc); g.add(head);
  const n = 4 + t;
  for (let i = 0; i < n; i++) {
    const f = mesh(new THREE.BoxGeometry(len * 0.035, len * 0.035, len * 0.13), metal(tc.trim));
    const a = i / n * Math.PI * 2; const o = new THREE.Vector3(Math.cos(a) * len * 0.1, Math.sin(a) * len * 0.1, 0);
    if (ax === 1) o.set(o.x, 0, o.y); else if (ax === 0) o.set(0, o.x, o.y);
    f.position.copy(hc).add(o); f.rotation.copy(rot); g.add(f);
  }
  const bone = inst.getObjectByName(ref.bone); if (!bone) return null;
  bone.add(g); add(g);
  void b;
  return g;
}

/** v0.7.0 时轮：圆环刀刃 + 中心发光沙漏；品级越高环越粗、外沿越多刃齿，传说 / 暗金带旋转的金色沙环 */
function buildChakram(inst: THREE.Object3D, b: Bind, tc: { c: number; trim: number; gem: number }, t: GearTier, slot: 'handslotr' | 'handslotl', add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  const hand = b.pos.get(slot); if (!hand) return null;
  const ringM = metal(t >= 4 ? 0xe0b040 : t >= 2 ? 0xc8ccd8 : 0x9a9aa0, t >= 4 ? 0x2a1800 : 0);
  const ring = mesh(new THREE.TorusGeometry(0.3, 0.045 + t * 0.006, 4, 18), ringM);
  const blades = 6 + t * 2;
  for (let i = 0; i < blades; i++) {
    const a = i / blades * Math.PI * 2;
    const tooth = mesh(new THREE.ConeGeometry(0.035, 0.12, 3), ringM);
    tooth.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0); tooth.rotation.z = a - Math.PI / 2; ring.add(tooth);
  }
  const glass = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6), metal(tc.trim));
  glass.rotation.z = Math.PI / 2; ring.add(glass);
  for (const s of [1, -1]) { const bulb = mesh(new THREE.ConeGeometry(0.08, 0.13, 6), gemMat(t >= 2 ? tc.gem : 0xffc860)); bulb.position.set(0, s * 0.07, 0); bulb.rotation.x = s > 0 ? Math.PI : 0; ring.add(bulb); }
  // 拿在手里：环面朝外侧，略微倾斜
  attach(inst, b, slot, ring, hand.clone().add(new THREE.Vector3(slot === 'handslotr' ? -0.05 : 0.05, 0.05, 0.12)), new THREE.Euler(0, Math.PI / 2, 0.3));
  add(ring);
  return ring;
}
/** v0.7.0 沙漏（副手）：挂在左侧腰间，品级高了悬浮在左手边、沙子发光 */
function buildHourglass(inst: THREE.Object3D, b: Bind, tc: { c: number; trim: number; gem: number }, t: GearTier, add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  const g = mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), metal(tc.trim));
  for (const s of [1, -1]) { const cap = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 8), metal(t >= 4 ? 0xe0b040 : 0x8a6a3a)); cap.position.y = s * 0.17; g.add(cap); }
  for (const s of [1, -1]) { const bulb = mesh(new THREE.ConeGeometry(0.1, 0.16, 8), gemMat(t >= 2 ? tc.gem : 0xffd890)); bulb.position.y = s * 0.08; bulb.rotation.x = s > 0 ? 0 : Math.PI; g.add(bulb); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 4), metal(tc.trim)); rod.position.set(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12); g.add(rod); }
  const hips = b.pos.get('hips') ?? new THREE.Vector3(0, 1, 0);
  if (t >= 2) { const hand = b.pos.get('handslotl') ?? hips; attach(inst, b, 'handslotl', g, hand.clone().add(new THREE.Vector3(0.1, 0.35, 0.1))); }
  else attach(inst, b, 'hips', g, hips.clone().add(new THREE.Vector3(0.42, -0.05, 0.12)), new THREE.Euler(0, 0, 0.15), 0.8);
  add(g);
  return g;
}
/** v0.7.0 时砂行者的常驻挂件：沙色围巾（遮住下半张脸）+ 腰间小沙漏；戴了头部装备时围巾换品级颜色 */
function chronoDress(inst: THREE.Object3D, b: Bind, eq: Equipped, add: (o: THREE.Object3D) => void) {
  const head = b.pos.get('head');
  if (head) {
    const tc = tierColor(eq.head, true);
    const scarfM = metal(eq.head && tierOf(eq.head) >= 2 ? tc.trim : 0xd8b878);
    const scarf = mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.34, 12, 1, true), scarfM);
    (scarf.material as THREE.Material).side = THREE.DoubleSide;
    attach(inst, b, 'head', scarf, head.clone().add(new THREE.Vector3(0, b.remap ? -0.16 : 0.2, b.remap ? 0.0 : 0.03)));   // v1.2.20 写实：头骨在下巴高度，围巾往下挪到脖子（原来盖住嘴鼻）
    add(scarf);
    const tail = mesh(new THREE.BoxGeometry(0.22, 0.55, 0.05), scarfM); tail.position.set(0.12, -0.3, -0.5); tail.rotation.set(0.25, 0, 0.12); scarf.add(tail);
  }
  if (!eq.offHand || eq.offHand.weaponType !== 'hourglass') {
    const hips = b.pos.get('hips');
    if (hips) {
      const g = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 6), metal(0x8a6a3a));
      for (const s of [1, -1]) { const bulb = mesh(new THREE.ConeGeometry(0.06, 0.09, 6), gemMat(0xffd890)); bulb.position.y = s * 0.05; bulb.rotation.x = s > 0 ? 0 : Math.PI; g.add(bulb); }
      attach(inst, b, 'hips', g, hips.clone().add(new THREE.Vector3(-0.38, -0.08, 0.2)));
      add(g);
    }
  }
}

/** v0.7.1 药瓶（主手）：圆肚玻璃瓶 + 瓶颈 + 软木塞，里面是发光的药液；品级越高瓶身越华丽（黄铜箍、宝石） */
function buildFlask(inst: THREE.Object3D, b: Bind, tc: { c: number; trim: number; gem: number }, t: GearTier, add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  const hand = b.pos.get('handslotr'); if (!hand) return null;
  const glass = mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshToonMaterial({ color: 0xcfe8ff, emissive: new THREE.Color(0), transparent: true, opacity: 0.4, depthWrite: false, gradientMap: toonGradient() }));
  const liquid = mesh(new THREE.SphereGeometry(0.135, 10, 8), gemMat(t >= 2 ? tc.gem : 0xff4a20)); liquid.position.y = -0.02; glass.add(liquid);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 8), metal(0xcfe8ff)); neck.position.y = 0.2; glass.add(neck);
  const cork = mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.06, 8), metal(t >= 4 ? 0xe0b040 : 0x8a6a3a)); cork.position.y = 0.3; glass.add(cork);
  if (t >= 1) { const band = mesh(new THREE.TorusGeometry(0.17, 0.018, 4, 16), metal(tc.trim)); band.rotation.x = Math.PI / 2; glass.add(band); }
  if (t >= 3) for (const sx of [1, -1]) { const ring = mesh(new THREE.TorusGeometry(0.15, 0.012, 3, 14), metal(tc.trim)); ring.rotation.y = sx * 0.8; glass.add(ring); }
  attach(inst, b, 'handslotr', glass, hand.clone().add(new THREE.Vector3(-0.04, 0.08, 0.12)));
  add(glass);
  return glass;
}
/** v0.7.1 试剂匣（副手）：挂在左腰的小木匣，插着红 / 蓝 / 绿三支试管 */
function buildReagentBox(inst: THREE.Object3D, b: Bind, tc: { c: number; trim: number; gem: number }, t: GearTier, add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  const hips = b.pos.get('hips'); if (!hips) return null;
  const box = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.18), metal(t >= 4 ? 0x3a2418 : 0x6a4a2a));
  const lid = mesh(new THREE.BoxGeometry(0.36, 0.04, 0.2), metal(tc.trim)); lid.position.y = 0.11; box.add(lid);
  [0xff4a20, 0x5ac8ff, 0x6aff4a].forEach((c, i) => { const v = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), gemMat(c)); v.position.set((i - 1) * 0.1, 0.17, 0); box.add(v); });
  attach(inst, b, 'hips', box, hips.clone().add(new THREE.Vector3(0.42, -0.05, 0.05)), new THREE.Euler(0, Math.PI / 2, 0));
  add(box);
  return box;
}
/** v0.7.1 炼金投弹手常驻挂件：鸟嘴面具 + 黄铜护目镜（遮住脸）、胸前斜挎的药瓶带 */
function alchemyDress(inst: THREE.Object3D, b: Bind, eq: Equipped, add: (o: THREE.Object3D) => void) {
  const head = b.pos.get('head');
  if (head) {
    const g = new THREE.Group();
    const leatherM = metal(0x4a3426);
    const beak = mesh(new THREE.ConeGeometry(0.15, 0.75, 8), metal(0x8a6a4a)); beak.rotation.x = Math.PI / 2 + 0.45; beak.position.set(0, 0.36, 0.78); g.add(beak);
    const tip = mesh(new THREE.ConeGeometry(0.06, 0.2, 6), metal(0xc89a40)); tip.rotation.x = Math.PI / 2 + 0.45; tip.position.set(0, 0.2, 1.1); g.add(tip);
    const face = mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), leatherM); face.rotation.x = Math.PI / 2; face.position.set(0, 0.5, 0.36); g.add(face);
    const tc = tierColor(eq.head, true);
    for (const sx of [1, -1]) {
      const rim = mesh(new THREE.TorusGeometry(0.075, 0.025, 4, 12), metal(0xc89a40)); rim.position.set(sx * 0.16, 0.66, 0.6); g.add(rim);
      const lens = mesh(new THREE.CircleGeometry(0.065, 12), gemMat(eq.head && tierOf(eq.head) >= 2 ? tc.gem : 0x9aff3a)); lens.position.set(sx * 0.17, 0.68, 0.61); g.add(lens);
    }
    attach(inst, b, 'head', g, head.clone()); add(g);
  }
  const chest = b.pos.get('chest');
  if (chest) {
    const strap = new THREE.Group();
    const belt = mesh(new THREE.BoxGeometry(0.1, 0.95, 0.05), metal(0x5a3a22)); belt.rotation.z = 0.75; belt.position.set(0, 0.1, 0.44); strap.add(belt);
    [0xff4a20, 0x5ac8ff, 0x6aff4a].forEach((c, i) => { const v = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 6), gemMat(c)); v.position.set(-0.22 + i * 0.2, 0.3 - i * 0.18, 0.48); v.rotation.z = 0.75; strap.add(v); });
    attach(inst, b, 'chest', strap, chest.clone()); add(strap);
  }
}

function buildOrb(inst: THREE.Object3D, b: Bind, tc: { gem: number }, t: GearTier, add: (o: THREE.Object3D) => void): THREE.Mesh | null {
  // 法球：浮在左手上方的发光晶球 + 环
  const hand = b.pos.get('handslotl'); if (!hand) return null;
  const H = b.H;
  const orb = mesh(new THREE.IcosahedronGeometry(0.14 + t * 0.015, 1), gemMat(tc.gem));
  const ring = mesh(new THREE.TorusGeometry(0.22, 0.02, 3, 14), metal(0xe0c060)); ring.rotation.x = 1.2; orb.add(ring);
  attach(inst, b, 'handslotl', orb, hand.clone().add(new THREE.Vector3(0, 0.25, 0)));
  void H;
  add(orb);
  return orb;
}

// ---------------------------------------------------------------- v0.5 B：暗金典藏专属挂件
const _gold = new THREE.Color(0xffc040);
/** 典藏武器：两道反向旋转的符文环 + 三块绕刃尖漂浮的碎晶（颜色 = 典藏流光色），整把武器换成动态流光材质 */
function relicWeapon(w: THREE.Mesh, it: ItemInstance, fx: GearFx, add: (o: THREE.Object3D) => void) {
  if (!w.geometry) return;
  const r = darkDef(it);
  const glow = r?.look?.glow ?? 0xffc040;
  const { ax, bb, len } = longAxis(w.geometry);
  const rot = ax === 2 ? new THREE.Euler(0, 0, 0) : ax === 1 ? new THREE.Euler(Math.PI / 2, 0, 0) : new THREE.Euler(0, Math.PI / 2, 0);
  for (const [k, rad, sp] of [[0.62, 0.11, 1.6], [0.78, 0.085, -2.3]] as const) {
    const holder = new THREE.Group(); holder.position.copy(axisPoint(bb, ax, k)); holder.rotation.copy(rot);
    const ring = mesh(new THREE.TorusGeometry(len * rad, len * 0.012, 3, 16), gemMat(k < 0.7 ? 0xffd060 : glow));
    holder.add(ring); w.add(holder); add(holder);
    fx.relicSpin.push({ o: ring, speed: sp });
  }
  const form = r?.look?.form;
  const orbit = new THREE.Group(); orbit.position.copy(axisPoint(bb, ax, 0.92)); orbit.rotation.copy(rot);
  for (let i = 0; i < 3; i++) {
    const c = form ? formPiece(form, len, glow) : mesh(new THREE.OctahedronGeometry(len * 0.035), gemMat(glow));
    if (!form) c.scale.set(0.6, 1.5, 0.6);
    const a = i / 3 * Math.PI * 2; c.position.set(Math.cos(a) * len * 0.14, Math.sin(a) * len * 0.14, 0);
    orbit.add(c);
  }
  w.add(orbit); add(orbit);
  fx.relicSpin.push({ o: orbit, speed: form === 'astro' ? 1.4 : 2.8 });
  if (form === 'astro') {   // 星盘：第三道斜向星环
    const h = new THREE.Group(); h.position.copy(axisPoint(bb, ax, 0.9)); h.rotation.set(rot.x + 0.9, rot.y, rot.z + 0.5);
    const ring = mesh(new THREE.TorusGeometry(len * 0.17, len * 0.008, 3, 24), gemMat(glow)); h.add(ring); w.add(h); add(h);
    fx.relicSpin.push({ o: ring, speed: -1.1 });
  }
}
/** v1.2.38b 专属暗金造型：绕刃尖漂浮的三件挂件（bell = 小铜钟、astro = 星点、wisp = 魂焰） */
function formPiece(form: 'bell' | 'astro' | 'wisp', len: number, glow: number): THREE.Object3D {
  if (form === 'bell') {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(len * 0.018, len * 0.04, len * 0.05, 8, 1, true), gemMat(0xb08a50)); g.add(body);
    const lip = mesh(new THREE.TorusGeometry(len * 0.04, len * 0.006, 3, 10), gemMat(glow)); lip.rotation.x = Math.PI / 2; lip.position.y = -len * 0.025; g.add(lip);
    return g;
  }
  if (form === 'astro') return mesh(new THREE.IcosahedronGeometry(len * 0.022), gemMat(glow));
  const c = mesh(new THREE.ConeGeometry(len * 0.02, len * 0.08, 6), gemMat(glow)); c.rotation.z = Math.PI; return c;
}
/** 典藏饰品：腰侧环绕角色缓缓公转的浮空护符（金框 + 流光晶核） */
function relicCharm(rig: Rig, it: ItemInstance, fx: GearFx, phase: number, add: (o: THREE.Object3D) => void) {
  const r = darkDef(it);
  const glow = r?.look?.glow ?? 0xffc040;
  const g = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.11, 0), gemMat(glow)); g.add(core);
  const frame = metal(0xd8a830, 0x3a2600); const ring = mesh(new THREE.TorusGeometry(0.17, 0.022, 3, 10), frame); g.add(ring);
  fx.relicMats.push({ m: frame, glow: new THREE.Color(glow) });
  for (const s of [1, -1]) { const sp = mesh(new THREE.ConeGeometry(0.04, 0.16, 4), frame); sp.position.y = s * 0.2; if (s < 0) sp.rotation.z = Math.PI; g.add(sp); }
  rig.root.add(g); add(g);
  fx.relicSpin.push({ o: g, speed: 1.5, bob: phase, base: new THREE.Vector3(0.75, 1.15, 0) });
  fx.relicSpin.push({ o: ring, speed: 3 });
}

// ---------------------------------------------------------------- 强化特效
/** 冰霜光环贴地环：中空、外缘柔和渐隐的径向渐变 */
let _ringTex: THREE.Texture | null = null;
function ringTex() {
  if (_ringTex || typeof document === 'undefined') return _ringTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (g) { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); gr.addColorStop(0.8, 'rgba(255,255,255,.9)'); gr.addColorStop(0.86, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  return (_ringTex = new THREE.CanvasTexture(c));
}
function makeMotes(color: THREE.Color, n: number, H: number, mode: 'orbit' | 'rise' | 'ring' = 'orbit') {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { seed[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  // v1.2.50 圆形柔光贴图 + 亮度 ≤1.2（不过泛光阈值，原来 ×2.2 无贴图在泛光下是一片白方块）+ 随距离缩放
  const m = new THREE.PointsMaterial({ color: color.clone().multiplyScalar(mode === 'ring' ? 0.9 : 1.15), size: mode === 'ring' ? 0.13 : mode === 'rise' ? 0.11 : 0.09, map: glowSprite(), sizeAttenuation: true, transparent: true, opacity: mode === 'ring' ? 0.7 : 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false;
  if (mode === 'ring') {   // 冰霜套：贴地淡蓝环（代替原来一圈白色大方块），点改成少量雪晶
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, map: ringTex(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.name = 'auraRing'; ring.userData.outlineParameters = { visible: false }; p.add(ring);
  }
  p.userData.H = 2.1; p.userData.n = n; void H;
  spinMotes(p, 0, 0, mode);
  return p;
}
function spinMotes(p: THREE.Points, _dt: number, t: number, mode: 'orbit' | 'rise' | 'ring') {
  const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
  const seed = p.geometry.getAttribute('seed') as THREE.BufferAttribute;
  const n = pos.count; const H = 2.1;
  for (let i = 0; i < n; i++) {
    const s = seed.getX(i);
    if (mode === 'orbit') {
      const a = s * Math.PI * 2 + t * (0.6 + s * 0.8); const r = 0.55 + 0.25 * Math.sin(s * 40 + t);
      pos.setXYZ(i, Math.cos(a) * r, (s * 1.7 + t * 0.25 + Math.sin(t * 2 + s * 9) * 0.08) % 1.7 + 0.3, Math.sin(a) * r);
    } else if (mode === 'rise') {
      const k = (s * 3 + t * 0.45) % 1;
      const a = s * 77;
      pos.setXYZ(i, Math.cos(a) * (0.35 + s * 0.3), k * H * 1.05, Math.sin(a) * (0.35 + s * 0.3));
    } else {
      const a = s * Math.PI * 2 + t * 0.4; const r = 0.9 + Math.sin(t + s * 20) * 0.12;
      pos.setXYZ(i, Math.cos(a) * r, 0.08 + Math.abs(Math.sin(s * 30 + t * 0.8)) * 0.22, Math.sin(a) * r);
    }
  }
  pos.needsUpdate = true;
}
function makeHalo(color: THREE.Color) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { color: { value: color.clone().multiplyScalar(1.6) }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float ring = smoothstep(0.78, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r));
        float a = atan(d.y, d.x);
        float rune = step(0.6, fract(a * 6.0 / 3.14159 + time * 0.2)) * smoothstep(0.55, 0.62, r) * (1.0 - smoothstep(0.7, 0.74, r));
        float inner = (1.0 - r) * 0.15;
        gl_FragColor = vec4(color, (ring * 0.9 + rune * 0.6 + inner) * (0.8 + 0.2 * sin(time * 3.0))); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 2;
  return m;
}
function makeTrail(color: THREE.Color, root: THREE.Object3D) {
  const N = 14;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  const a = new Float32Array(N * 2); for (let i = 0; i < N; i++) { a[i * 2] = a[i * 2 + 1] = 1 - i / (N - 1); }
  g.setAttribute('a', new THREE.BufferAttribute(a, 1));
  const idx: number[] = []; for (let i = 0; i < N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { color: { value: color.clone().multiplyScalar(2) }, vis: { value: 0 } },
    vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float vis; varying float vA; void main(){ gl_FragColor = vec4(color, vA * vA * 0.75 * vis); }' });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
  // 拖尾用世界坐标：挂在场景根（角色的 parent）上，不随角色变换
  m.matrixAutoUpdate = false;
  root.parent?.add(m);
  root.userData.trailMesh = m;
  return { mesh: m, pts: [] as THREE.Vector3[], on: false };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function updateTrail(tr: NonNullable<GearFx['trail']>, w: THREE.Object3D, root: THREE.Object3D, _dt: number) {
  if (!tr.mesh.parent && root.parent) root.parent.add(tr.mesh);
  const m = w as THREE.Mesh;
  if (!m.geometry) return;
  const la = m.userData.la ?? (m.userData.la = longAxis(m.geometry));
  _a.copy(axisPoint(la.bb, la.ax, 0.4)).applyMatrix4(w.matrixWorld);
  _b.copy(axisPoint(la.bb, la.ax, 1)).applyMatrix4(w.matrixWorld);
  tr.pts.unshift(_a.clone(), _b.clone()); if (tr.pts.length > 28) tr.pts.length = 28;
  const pos = tr.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < 28; i++) { const p = tr.pts[Math.min(i, tr.pts.length - 1)]; pos.setXYZ(i, p.x, p.y, p.z); }
  pos.needsUpdate = true;
  // 刀尖速度快才显示（挥动时）
  const speed = tr.pts.length >= 4 ? tr.pts[1].distanceTo(tr.pts[3]) : 0;
  const u = (tr.mesh.material as THREE.ShaderMaterial).uniforms.vis;
  u.value += ((speed > 0.12 ? 1 : 0) - u.value) * 0.25;
}
/** 角色被移除时把世界坐标里的拖尾也拿掉 */
export function disposeGear(rig: Rig) { const m = rig.root.userData.trailMesh as THREE.Object3D | undefined; m?.parent?.remove(m); }
/** 调试：模型高度和关键骨骼位置 */
export function gearDebug(model: string) {
  const b = bindOf(model); if (!b) return null;
  const o: Record<string, number[]> = {};
  b.pos.forEach((v, k) => { if (/head|chest|upperarm|handslot|hips|spine|Rig|root/i.test(k)) o[k] = [v.x, v.y, v.z].map(x => Math.round(x * 100) / 100); });
  const bb: Record<string, number[]> = {};
  sourceScene(model)!.traverse(m => { if ((m as THREE.Mesh).isMesh) { const x = new THREE.Box3().setFromObject(m); bb[m.name] = [x.min.x, x.min.y, x.min.z, x.max.x, x.max.y, x.max.z].map(v => Math.round(v * 100) / 100); } });
  return { H: b.H, o, bb };
}

// v1.2.31 比赛版武器（Lux3D）：武器类型 → [模型名, 长度, 握点比例, 竖握角]
export const LUX_W: Partial<Record<WeaponType, [string, number, number, number?]>> = { sword: ['weapon_bell_sword', 1.15, 0.13], greatsword: ['weapon_rock_greatsword', 1.6, 0.14],
    // v1.2.31 比赛版武器扩展（暗岩风格）
    axe: ['weapon_rock_axe', 0.95, 0.15], mace: ['weapon_rock_mace', 0.9, 0.15], greataxe: ['weapon_rock_greataxe', 1.65, 0.28], wand: ['weapon_rock_wand', 0.6, 0.2], dagger: ['weapon_rock_dagger', 0.52, 0.18], staff: ['weapon_bell_staff', 2.2, 0.4, 0.15], chakram: ['weapon_time_chakram', 0.8, 0.5], flask: ['weapon_flask', 0.42, 0.45] };
/** v1.2.40 武器外观覆盖（铸造台 / 武器库）：有覆盖且模型已登记 → 用覆盖的模型，长度 / 握点沿用这个武器类型的默认值 */
function weaponSkinFor(wt: WeaponType, def: [string, number, number, number?] | undefined, itemId?: string | null): [string, number, number, number?] | undefined {
  const k = weaponSkinGet(wt, itemId);
  if (!k || !hasGlb(k)) return def;
  return [k, def?.[1] ?? 1.1, def?.[2] ?? 0.15, def?.[3]];
}
