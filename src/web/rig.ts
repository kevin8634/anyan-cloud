// v1.2.0-m1 模型适配层：把写实人形模型（Quaternius Universal 体系，CC0）接到原来按 KayKit 骨骼写的代码上
// 做法：
//  1. 逻辑骨骼 —— gear.ts / ClassExt.dress / 包挂件只认 KayKit 的 6 个骨骼名（head / chest / spine / hips / handslotr / handslotl）。
//     新模型加载时在对应真实骨骼下插入同名「别名节点」，旋转对齐 KayKit 同名骨骼（T 姿势下），所以原有挂件代码一行不用改。
//  2. 动作表 —— 游戏里的逻辑动作（idle / run / attack1 / cast / hit / death …）→ 每套模型自己的片段名，缺的回退到最接近的。
//  3. 模式 —— 设置「角色模型」：自动（低画质用经典）/ 写实 / 经典；写实模型没加载成功时一律回退经典（KayKit）。
import { HD_GLB } from './assets.gen';
import * as THREE from 'three';
import type { AnimName } from './chars';
export type { AnimName };

export type CharModelMode = 'auto' | 'new' | 'classic';

/** 一套写实模型的适配数据 */
export interface HdRig {
  /** 11-06 模型自带的片段（名字匹配的才保留，不重定向，如团长瑟兰逐招 SC_*）；glTF extras 进 clip.userData（hit = 出手时刻） */
  ownClips?: RegExp;
  /** KayKit 骨骼名（three 去掉点号后的名字）→ 真实骨骼名 + 挂件比例（KayKit 头大手大，挂上去要缩一点） */
  alias: Record<string, { bone: string; k: number; palm?: string }>;
  /** 逻辑动作 → 片段名（按顺序找第一个存在的） */
  clips: Partial<Record<AnimName, string[]>>;
  /** 校准用的 T 姿势片段 */
  tpose?: string;
  /** v1.2.4：自己没有动作 → 从这套模型借动作（按 boneMap 重定向：本模型骨名 → 源骨名） */
  animFrom?: string; boneMap?: Record<string, string>;
  /** v1.2.23：借 animFrom 动作时按骨骼方向对齐绑定姿势（目标绑定姿势和源 T 姿势不一致时用，如 Lux3D 自动绑骨的 A 姿势） */
  alignFrom?: boolean;
  /** v1.2.4：服装等部件 GLB（同骨架，加载时绑到本模型骨架） */
  parts?: string[];
  /** v1.2.17：按职业的动作表（CharOpts.clipSet 选用，缺的项回退到 clips）；片段名可用 a|b 表示「随机挑一个」 */
  clipSets?: Record<string, Partial<Record<AnimName, string[]>>>;
  /** v1.2.17：重定向时顺带合成的变体动作（镜像 / 上身扭转 / 截取），只对 animFrom 的模型有效 */
  variants?: ClipVariant[];
  /** v1.2.17：再从别的动作库借片段（如 Mixamo_Anims，T 姿势、mixamorig 骨名；align = 按骨骼方向对齐绑定姿势） */
  extraAnims?: { from: string; boneMap: Record<string, string>; align?: boolean; variants?: ClipVariant[] }[];
}

/**
 * v1.2.17 合成动作：UAL Standard 只有 1 个剑击 + 2 个拳 + 1 个施法射击，靠变体凑出每职业 2–3 种攻击。
 *  - mirror：左右镜像（世界空间按 x=0 平面反射，骨骼左右对调）——左手施法、反手斩
 *  - twist：上身绕 spine_01 的偏航关键帧 [时间比例 0–1, 角度°]——横扫、蓄力重劈
 *  - pitch：上身前倾关键帧（同上，绕 x）——下劈、投掷
 *  - crop：只取片段的一段 [起, 止] 秒；speed：整体变速（>1 更快）
 */
export interface ClipVariant { name: string; from: string; mirror?: boolean; twist?: [number, number][]; pitch?: [number, number][]; crop?: [number, number]; speed?: number }

/**
 * v1.2.17 挂点偏移表（按模型）：gear.ts 的程序化挂件按 KayKit 绑定姿势的模型空间写死坐标（大头、宽肩）。
 * 写实模型上把「相对 KayKit 同名骨骼的偏移」按 s 缩放后搬到真实骨骼位置，再加 off（KayKit 单位）。
 * 没写 s 的骨骼用别名节点的 k（和 propClone 道具一致）。
 */
export interface AttachFix { s?: number; off?: [number, number, number] }
export const HD_ATTACH: Record<string, Record<string, AttachFix>> = {};

/** Quaternius Universal 骨骼（UAL / UBC / Outfits 共用，53 根，Rigify DEF- 命名） */
export const UAL_RIG: HdRig = {
  alias: {
    head: { bone: 'DEF-head', k: 0.55 },
    chest: { bone: 'DEF-spine003', k: 0.78 },
    spine: { bone: 'DEF-spine001', k: 0.8 },
    hips: { bone: 'DEF-hips', k: 0.85 },
    handslotr: { bone: 'DEF-handR', k: 0.8, palm: 'DEF-f_middle01R' },
    handslotl: { bone: 'DEF-handL', k: 0.8, palm: 'DEF-f_middle01L' },
  },
  tpose: 'A_TPose',
  clips: {
    idle: ['Sword_Idle', 'Idle_Loop'], run: ['Jog_Fwd_Loop'], walk: ['Walk_Loop'],
    attack1: ['Sword_Attack'], attack2: ['Sword_Attack'], attack3: ['Punch_Cross', 'Sword_Attack'],
    spin: ['Sword_Attack'], heavy: ['Sword_Attack'], death: ['Death01'], hit: ['Hit_Chest'],
    cast: ['Spell_Simple_Shoot'], castLong: ['Spell_Simple_Idle_Loop'], dash: ['Roll'], cheer: ['Interact', 'Idle_Loop'],
    punch: ['Punch_Jab'], interact: ['Interact'], shoot: ['Spell_Simple_Shoot'], channel: ['Spell_Simple_Idle_Loop'],
  },
};

/** 写实模型 → 适配数据 */
export const HD_RIGS: Record<string, HdRig> = { UAL_Mannequin: UAL_RIG };

/** 写实模型的材质（按原材质名染色；职业配色在 makeCharacter 里再叠一层） */
export const HD_MATS: Record<string, Record<string, number>> = {
  warrior: { M_Main: 0x9aa4b0, M_Joints: 0x3a2e24 },   // 钢板 + 皮革关节
};

let mode: CharModelMode = 'auto', lowQ = false;
export function setCharModelMode(m: CharModelMode | undefined, quality: string) { mode = m ?? 'auto'; lowQ = quality === 'low'; }
export function charModelMode() { return mode; }
/** 现在要不要用写实模型（不管有没有加载成功） */
export function wantHd() { return mode === 'new' || (mode === 'auto' && !lowQ && 'LUX_Warrior' in HD_GLB); }   // v1.2.54 Rhett：默认写实 →「自动」在有比赛写实职业模型（LUX_*）且非低画质时 = 写实；商用 base 包仍是经典   // v1.2.0-m1b：「自动」= 经典（KayKit），只有手动选「写实」才用新模型，直到板甲服装素材换好

/**
 * 加载后校准一套写实模型（只做一次，所有实例共享）：
 *  - 统一到 KayKit 骑士的身高和朝向（模型空间单位一致，原挂件的偏移量可以直接用）
 *  - 摆成 T 姿势作为绑定姿势（和 KayKit 一样），再按 KayKit 同名骨骼的朝向插别名节点
 */
export function calibrateHd(scene: THREE.Object3D, rig: HdRig, clips: THREE.AnimationClip[], ref: THREE.Object3D | null, refHeight: number): number {
  // 包一层校准节点（makeCharacter 会改 scene.scale，所以校准放在子节点上）
  const fix = new THREE.Group(); fix.name = 'hdfix';
  for (const c of [...scene.children]) fix.add(c);
  scene.add(fix);
  // T 姿势
  const tp = rig.tpose ? clips.find(c => c.name === rig.tpose) : undefined;
  if (tp) {
    const mx = new THREE.AnimationMixer(scene); const a = mx.clipAction(tp); a.play(); mx.update(0);
    const keep: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
    scene.traverse(o => { if ((o as THREE.Bone).isBone) keep.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    a.stop(); mx.uncacheRoot(scene);
    for (const [o, p, q, s] of keep) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  }
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse(o => { if ((o as THREE.Bone).isBone) box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  const h0 = Math.max(0.1, (box.max.y - box.min.y) * 1.08);   // 骨骼包围盒到头顶约 +8%
  fix.scale.setScalar(refHeight / h0);
  // 朝向：左手在 +x 才是面朝 +z（和 KayKit 一样）
  scene.updateMatrixWorld(true);
  const hl = scene.getObjectByName(rig.alias.handslotl?.bone ?? '');
  if (hl && new THREE.Vector3().setFromMatrixPosition(hl.matrixWorld).x < 0) fix.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  // 别名节点
  if (ref) ref.updateMatrixWorld(true);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), w = new THREE.Matrix4();
  for (const [name, a] of Object.entries(rig.alias)) {
    const bone = scene.getObjectByName(a.bone); if (!bone) continue;
    const rb = ref?.getObjectByName(name);
    if (rb) rb.matrixWorld.decompose(p, q, s); else { q.identity(); s.set(1, 1, 1); }
    const pos = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    if (a.palm) { const pb = scene.getObjectByName(a.palm); if (pb) pos.lerp(new THREE.Vector3().setFromMatrixPosition(pb.matrixWorld), 0.6); }
    w.compose(pos, q, s.multiplyScalar(a.k));
    const n = new THREE.Object3D(); n.name = name;
    bone.add(n);
    new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(w).decompose(n.position, n.quaternion, n.scale);
  }
  scene.updateMatrixWorld(true);
  return refHeight;
}

/** 逻辑动作 → 片段（找不到按回退顺序） */
export function hdClip(rig: HdRig, clips: THREE.AnimationClip[], name: AnimName, set?: string): THREE.AnimationClip | undefined {
  return hdClips(rig, clips, name, set)[0];
}
/** v1.2.17：逻辑动作 → 候选片段（a|b 写法返回多个，CharAnim 随机挑） */
export function hdClips(rig: HdRig, clips: THREE.AnimationClip[], name: AnimName, set?: string): THREE.AnimationClip[] {
  const lists = [set ? rig.clipSets?.[set]?.[name] : undefined, rig.clips[name]];
  for (const l of lists) for (const n of l ?? []) {
    const cs = n.split('|').map(x => clips.find(c => c.name === x)).filter((c): c is THREE.AnimationClip => !!c);
    if (cs.length) return cs;
  }
  return [];
}

// ---------------------------------------------------------------- v1.2.4 m1b：UBC 底座 + Outfits 服装 + UAL 动作重定向
/** UE 骨名（UBC / Outfits，65 根）→ UAL 的 Rigify 骨名（three 去点号后） */
export function ubcBoneMap(): Record<string, string> {
  const m: Record<string, string> = {
    pelvis: 'DEF-hips', spine_01: 'DEF-spine001', spine_02: 'DEF-spine002', spine_03: 'DEF-spine003', neck_01: 'DEF-neck', Head: 'DEF-head',
  };
  for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
    Object.assign(m, { [`clavicle_${s}`]: `DEF-shoulder${S}`, [`upperarm_${s}`]: `DEF-upper_arm${S}`, [`lowerarm_${s}`]: `DEF-forearm${S}`, [`hand_${s}`]: `DEF-hand${S}`,
      [`thigh_${s}`]: `DEF-thigh${S}`, [`calf_${s}`]: `DEF-shin${S}`, [`foot_${s}`]: `DEF-foot${S}`, [`ball_${s}`]: `DEF-toe${S}` });
    for (const f of ['index', 'middle', 'pinky', 'ring']) for (const i of [1, 2, 3]) m[`${f}_0${i}_${s}`] = `DEF-f_${f}0${i}${S}`;
    for (const i of [1, 2, 3]) m[`thumb_0${i}_${s}`] = `DEF-thumb0${i}${S}`;
  }
  return m;
}
/** v1.2.17 合成动作（见 ClipVariant）；名字前缀表示来源：Sword_* 来自 Sword_Attack，Spell_* 来自 Spell_Simple_Shoot */
export const UBC_VARIANTS: ClipVariant[] = [
  { name: 'Sword_Slash_H', from: 'Sword_Attack', twist: [[0, 0], [0.3, 38], [0.62, -48], [1, 0]], speed: 1.1 },          // 横扫
  { name: 'Sword_Heavy', from: 'Sword_Attack', pitch: [[0, 0], [0.38, -14], [0.62, 26], [1, 0]], twist: [[0, 0], [0.38, 20], [0.7, -10], [1, 0]], speed: 0.85 },   // 蓄力下劈
  { name: 'Sword_Spin', from: 'Sword_Attack', twist: [[0, 0], [0.28, 55], [0.75, -95], [1, 0]], speed: 1.05 },           // 回旋斩
  { name: 'Sword_Thrust', from: 'Punch_Cross', pitch: [[0, 0], [0.45, 16], [1, 0]] },                                    // 突刺
  { name: 'Sword_Attack_M', from: 'Sword_Attack', mirror: true },                                                          // 左手反斩（时轮副手）
  { name: 'Spell_Shoot_L', from: 'Spell_Simple_Shoot', mirror: true },                                                     // 左手施法
  { name: 'Spell_Cast_Both', from: 'Spell_Simple_Shoot', pitch: [[0, -6], [0.5, 14], [1, 0]], twist: [[0, -15], [0.5, 10], [1, 0]], speed: 0.9 },   // 前推施法
  { name: 'Spell_Slam', from: 'Spell_Simple_Shoot', pitch: [[0, -18], [0.45, 28], [1, 0]], speed: 0.75 },                // 法杖砸地
  { name: 'Throw_Over', from: 'Sword_Attack', pitch: [[0, -8], [0.5, 18], [1, 0]], crop: [0.15, 1.4], speed: 1.2 },      // 过肩投掷
  { name: 'Jog_Fwd_Lean', from: 'Jog_Fwd_Loop', pitch: [[0, 10], [1, 10]] },   // v1.2.80 跑步前倾 10°
  { name: 'Walk_Lean', from: 'Walk_Loop', pitch: [[0, 5], [1, 5]] },          // v1.2.80 走路前倾 5°
  { name: 'Throw_Heavy', from: 'Sword_Attack', twist: [[0, 0], [0.4, 45], [0.7, -30], [1, 0]], pitch: [[0, -10], [0.6, 20], [1, 0]], speed: 0.9 },   // 蓄力远投
];
/** v1.2.17 本体 4 职业的写实动作表（MX_* = Mixamo，其余 = UAL / 合成；每项按顺序取第一个存在的；内容包职业由包自己往 clipSets 里加） */
const COMMON: Partial<Record<AnimName, string[]>> = { hit: ['MX_Hit|Hit_Chest|Hit_Head', 'Hit_Chest|Hit_Head'], death: ['MX_Death', 'Death01'], run: ['MX_Run_Lean', 'MX_Run', 'Jog_Fwd_Lean', 'Jog_Fwd_Loop'], walk: ['MX_Walk_Lean', 'MX_Walk', 'Walk_Lean', 'Walk_Loop'] };   // v1.2.80 05 线建议：跑步上身前倾 10°、走路 5°
export const UBC_CLIPSETS: Record<string, Partial<Record<AnimName, string[]>>> = {
  warrior: { ...COMMON,
    idle: ['MX_Idle_SS', 'Sword_Idle'], attack1: ['MX_Attack_SS', 'Sword_Attack'], attack2: ['MX_Slash_c', 'Sword_Slash_H'], attack3: ['MX_Downward', 'Sword_Thrust'],
    heavy: ['MX_GreatSlash_c', 'Sword_Heavy'], spin: ['Sword_Spin'], cast: ['MX_Downward', 'Sword_Heavy'], shoot: ['Sword_Thrust'],
  },
  mage: { ...COMMON,
    idle: ['Idle_Loop'], attack1: ['MX_Magic_1H', 'Spell_Simple_Shoot'], attack2: ['Spell_Shoot_L'], attack3: ['MX_Magic_2H', 'Spell_Cast_Both'], heavy: ['MX_Magic_2H', 'Spell_Slam'], spin: ['Spell_Slam'],
    cast: ['MX_Spell_c', 'Spell_Cast_Both'], castLong: ['MX_Spell', 'Spell_Simple_Idle_Loop'], channel: ['MX_Spell', 'Spell_Simple_Idle_Loop'], shoot: ['MX_Magic_1H|Spell_Simple_Shoot', 'Spell_Simple_Shoot'],
  },
  chrono: { ...COMMON,
    idle: ['Idle_Loop'], attack1: ['MX_Attack_SS', 'Sword_Attack'], attack2: ['Sword_Attack_M'], attack3: ['MX_Slash_c', 'Sword_Slash_H'], heavy: ['MX_Downward', 'Sword_Heavy'], spin: ['Sword_Spin'],
    shoot: ['MX_Throw_c', 'Throw_Over'], cast: ['MX_Magic_1H', 'Spell_Cast_Both'],
  },
  alchemy: { ...COMMON,
    idle: ['Idle_Loop'], attack1: ['MX_Throw_c', 'Throw_Over'], attack2: ['Throw_Over'], attack3: ['Punch_Cross'], heavy: ['Throw_Heavy'], spin: ['Sword_Spin'],
    shoot: ['MX_Throw_c|Throw_Over', 'Throw_Over'], cast: ['MX_Magic_2H', 'Spell_Cast_Both'], castLong: ['MX_Spell', 'Spell_Simple_Idle_Loop'],
  },
};
/** v1.2.17 UE 骨名（UBC）→ Mixamo 骨名（three 去掉冒号：mixamorig:Hips → mixamorigHips） */
export function mixamoBoneMap(): Record<string, string> {
  const m: Record<string, string> = { pelvis: 'mixamorigHips', spine_01: 'mixamorigSpine', spine_02: 'mixamorigSpine1', spine_03: 'mixamorigSpine2', neck_01: 'mixamorigNeck', Head: 'mixamorigHead' };
  for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) {
    Object.assign(m, { [`clavicle_${s}`]: `mixamorig${S}Shoulder`, [`upperarm_${s}`]: `mixamorig${S}Arm`, [`lowerarm_${s}`]: `mixamorig${S}ForeArm`, [`hand_${s}`]: `mixamorig${S}Hand`,
      [`thigh_${s}`]: `mixamorig${S}UpLeg`, [`calf_${s}`]: `mixamorig${S}Leg`, [`foot_${s}`]: `mixamorig${S}Foot`, [`ball_${s}`]: `mixamorig${S}ToeBase` });
    for (const [f, F] of [['index', 'Index'], ['middle', 'Middle'], ['pinky', 'Pinky'], ['ring', 'Ring'], ['thumb', 'Thumb']]) for (const i of [1, 2, 3]) m[`${f}_0${i}_${s}`] = `mixamorig${S}Hand${F}${i}`;
  }
  return m;
}
/** v1.2.17 Mixamo 动作（tools/mixamo-anims.mjs → Mixamo_Anims.glb）的截取版 */
export const MX_VARIANTS: ClipVariant[] = [
  { name: 'MX_Slash_c', from: 'MX_Slash_SS', crop: [0.2, 2.4] }, { name: 'MX_GreatSlash_c', from: 'MX_GreatSlash', crop: [0.3, 2.6] },
  { name: 'MX_Spell_c', from: 'MX_Spell', crop: [0.4, 2.6] }, { name: 'MX_Throw_c', from: 'MX_Throw', crop: [0.2, 1.7] },
  { name: 'MX_Run_Lean', from: 'MX_Run', pitch: [[0, 10], [1, 10]] }, { name: 'MX_Walk_Lean', from: 'MX_Walk', pitch: [[0, 5], [1, 5]] },   // v1.2.80 前倾
];
export const UBC_RIG: HdRig = {
  alias: {
    head: { bone: 'Head', k: 0.34 },
    chest: { bone: 'spine_03', k: 0.55 },
    spine: { bone: 'spine_01', k: 0.6 },
    hips: { bone: 'pelvis', k: 0.65 },
    handslotr: { bone: 'hand_r', k: 0.7, palm: 'middle_01_r' },
    handslotl: { bone: 'hand_l', k: 0.7, palm: 'middle_01_l' },
  },
  tpose: 'A_TPose',
  clips: { ...UAL_RIG.clips, hit: ['Hit_Chest|Hit_Head'] },
  animFrom: 'UAL_Mannequin', boneMap: ubcBoneMap(), parts: ['Outfit_Male_Ranger', 'Outfit_Male_Peasant'],   // v1.2.18 +平民套（炼金）；每个实例用 CharOpts.parts 选一套
  clipSets: UBC_CLIPSETS, variants: UBC_VARIANTS,
  extraAnims: [{ from: 'Mixamo_Anims', boneMap: mixamoBoneMap(), align: true, variants: MX_VARIANTS }],
};
/**
 * v1.2.17 挂点偏移（UBC 底座，校准到 KayKit 骑士身高后）：KayKit 头约 1.1 高、肩宽 0.8；写实头约 0.3、肩宽 0.45。
 * head 缩得最狠（头盔 / 头饰 / 面具），胸 / 腰中等（肩甲 / 胸甲 / 药瓶带），手按手掌大小。
 */
HD_ATTACH.UBC_Male = {
  head: { s: 0.34, off: [0, 0.02, 0.01] }, chest: { s: 0.52, off: [0, 0, 0] }, spine: { s: 0.55 }, hips: { s: 0.6 },
  handslotr: { s: 0.62 }, handslotl: { s: 0.62 },
};
HD_RIGS.UBC_Male = UBC_RIG;
/** v1.2.18 女性底座（法师）：同一套 UE 骨骼和动作；免费服装包没有女装，法袍 / 兜帽程序化（models.ts ubcRobe） */
HD_RIGS.UBC_Female = { ...UBC_RIG, parts: [] };
/**
 * v1.2.23 比赛版写实战士：Lux3D 生成 + Lux3D 自动绑骨（mixamo 骨架），tools/lux3d-rigfix.mjs 已把骨名改成 UBC 同名，
 * 所以动作表 / 合成动作 / Mixamo 动作库全部照搬 UBC；只放在 assets_aholo/（商用构建里没有这个模型，自动回退 UBC_Male）。
 */
/** v1.2.25 比赛版 Lux3D 职业模型（Lux3D 自动绑骨 → tools/lux3d-rigfix.mjs 改成 UBC 骨名）：骨架 / 挂点 / 动作全借 UBC */
export const LUX_MODELS = ['LUX_Warrior', 'LUX_Mage', 'LUX_Chrono', 'LUX_Alchemy', 'LUX_Hunter', 'LUX_Coffin', 'LUX_Mage40Robe', 'LUX_Chrono40', 'LUX_Coffin40', 'LUX_Warrior40', 'LUX_Hunter40', 'LUX_Alchemy40'];   // 11-04 *40：40 级套装整身外观（05 线 Lux3D 绑骨，只在比赛版 assets_aholo）
for (const n of LUX_MODELS) { HD_RIGS[n] = { ...UBC_RIG, parts: [], alignFrom: true }; HD_ATTACH[n] = { ...HD_ATTACH.UBC_Male }; }
HD_ATTACH.UBC_Female = { head: { s: 0.32, off: [0, 0.01, 0.01] }, chest: { s: 0.48 }, spine: { s: 0.5 }, hips: { s: 0.56 }, handslotr: { s: 0.56 }, handslotl: { s: 0.56 } };
/** v1.2.18 写实模型里属于皮肤 / 眼睛 / 头发的材质：职业染色不碰（只染衣服） */
/** v1.2.20 写实衣物提亮（按 CharOpts.mats 键）：贴图本身偏暗的职业，染色后再乘这个倍数（皮肤 / 眼睛 / 头发不乘） */
export const HD_GAIN: Record<string, number> = { chrono_ubc: 2.3, alchemy_ubc: 1.6, warrior_ubc: 1.1, warrior_lux: 1.15, lux: 1.15 };
export const HD_SKIN_MAT = /Superhero|Regular_Male|Eyes|Hair/;
HD_MATS.warrior_lux = { MI_Lux: 0xffffff };
HD_MATS.lux = HD_MATS.warrior_lux;   // v1.2.23 Lux3D 一张烘焙贴图，原色
HD_MATS.mage_ubc = { MI_Superhero_Female: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_2: 0xffffff };
HD_MATS.chrono_ubc = { MI_Ranger: 0x8a9ad8, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: 0xffffff };   // 游侠套染深蓝（乘在原贴图上）
HD_MATS.alchemy_ubc = { MI_Peasant: 0x8a5a50, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: 0xffffff };   // 平民套染炭红
HD_MATS.warrior_ubc = { MI_Ranger: 0xc4ccd8, MI_Regular_Male: 0xffffff, MI_Superhero_Male: 0xffffff, MI_Eyes: 0xffffff, MI_Hair_1: 0xffffff };   // 游侠套偏冷钢色（乘在原贴图上），皮肤保持原色

/** v1.2.19 内容包职业的写实动作表 / 材质色注册（clipSets[职业 id]、HD_MATS['ext_' + 职业 id]） */
export function registerHdClass(cls: string, model: string, mats?: Record<string, number>, clips?: Record<string, string[]>, gain?: number) {
  const r = HD_RIGS[model]; if (!r) return;
  if (gain) HD_GAIN['ext_' + cls] = gain;
  if (clips) { if (r.clipSets === UBC_CLIPSETS) r.clipSets = { ...UBC_CLIPSETS }; (r.clipSets ??= {})[cls] = clips as Partial<Record<AnimName, string[]>>; }
  if (mats) HD_MATS['ext_' + cls] = mats;
}

/** 把服装 GLB 的蒙皮网格绑到底座骨架（同名骨骼；两边绑定姿势一致） */
export function mergeParts(base: THREE.Object3D, parts: THREE.Object3D[], names: string[] = []) {
  const bones = new Map<string, THREE.Bone>();
  base.traverse(o => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); });
  let host: THREE.Object3D | null = null;
  base.traverse(o => { if (!host && (o as THREE.SkinnedMesh).isSkinnedMesh) host = o.parent; });
  base.updateMatrixWorld(true);
  parts.forEach((p, pi) => {
    const meshes: THREE.SkinnedMesh[] = [];
    p.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    for (const m of meshes) {
      const sk = m.skeleton, nb = sk.bones.map(b => bones.get(b.name));
      if (nb.some(b => !b)) continue;
      const skel = new THREE.Skeleton(nb as THREE.Bone[], sk.boneInverses.map(x => x.clone()));
      (host ?? base).add(m);
      m.bind(skel, m.bindMatrix.clone());
      m.userData.part = names[pi] ?? true;   // v1.2.18：记下来自哪个服装 GLB（CharOpts.parts 按名字显示）
    }
  });
}

/**
 * 动作重定向（两边都是 T 姿势绑定）：目标骨世界旋转 = 源骨世界旋转 × 源 T 姿势世界旋转⁻¹ × 目标绑定世界旋转；
 * 髋部位移按身高比例搬过去。只在加载时跑一次（约 20 秒动作 × 30 帧）。
 */
export function retargetClips(target: THREE.Object3D, source: THREE.Object3D, clips: THREE.AnimationClip[], map: Record<string, string>, tposeName?: string, fps = 30, variants: ClipVariant[] = [], align = false): THREE.AnimationClip[] {
  const tBones: THREE.Bone[] = []; target.traverse(o => { if ((o as THREE.Bone).isBone) tBones.push(o as THREE.Bone); });   // 深度优先 = 父在子前
  const srcNames = new Set(Object.values(map));   // v1.2.17：源骨架按名字找（Mixamo 动作 GLB 没有蒙皮，节点不是 Bone）
  const sBy = new Map<string, THREE.Object3D>(); source.traverse(o => { if ((o as THREE.Bone).isBone || srcNames.has(o.name)) sBy.set(o.name, o); });
  const keep: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  for (const b of sBy.values()) keep.push([b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mx = new THREE.AnimationMixer(source);
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  // 源 T 姿势
  const tp = tposeName ? clips.find(c => c.name === tposeName) : undefined;
  if (tp) { const a = mx.clipAction(tp); a.play(); mx.update(0); }
  source.updateMatrixWorld(true);
  const sRest = new Map<string, THREE.Quaternion>(); for (const [n, b] of sBy) sRest.set(n, wq(b));
  const sHip = sBy.get(map.pelvis ?? ''), sHip0 = sHip ? wp(sHip) : new THREE.Vector3();
  mx.stopAllAction();
  // 目标绑定姿势
  target.updateMatrixWorld(true);
  const tRestW = new Map<THREE.Bone, THREE.Quaternion>(), tRestL = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of tBones) { tRestW.set(b, wq(b)); tRestL.set(b, b.quaternion.clone()); }
  const tHip = tBones.find(b => b.name === 'pelvis');
  const tHip0 = tHip ? wp(tHip) : new THREE.Vector3(), tHipLocal0 = tHip ? tHip.position.clone() : new THREE.Vector3();
  const k = sHip0.y > 0.01 ? tHip0.y / sHip0.y : 1;
  // v1.2.17 align：两边绑定姿势不同（Mixamo T 姿势 ↔ UBC）时，按骨骼方向补一个对齐旋转 A（目标骨方向 → 源骨方向），
  // 朝向相反再整体转 180°（R）：目标世界旋转 = R·Δ·R⁻¹ · A · 目标绑定旋转
  const alignQ = new Map<THREE.Bone, THREE.Quaternion>(); const R = new THREE.Quaternion(), Ri = new THREE.Quaternion();
  if (align) {
    const tl = tBones.find(b => b.name === 'hand_l'), sl = sBy.get(map.hand_l ?? '');
    const tf = tl ? Math.sign(wp(tl).x - tHip0.x) : 1;
    source.updateMatrixWorld(true);
    const sf = sl && sHip ? Math.sign(wp(sl).x - sHip0.x) : 1;
    if (tf !== sf) R.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    Ri.copy(R).invert();
    for (const b of tBones) {
      const sn = map[b.name], sb = sn ? sBy.get(sn) : undefined; if (!sb) continue;
      const c = b.children.find(x => (x as THREE.Bone).isBone && map[x.name] && sBy.get(map[x.name])) as THREE.Bone | undefined; if (!c) continue;
      const dt = wp(c).sub(wp(b)), ds = wp(sBy.get(map[c.name])!).sub(wp(sb)).applyQuaternion(R);
      if (dt.lengthSq() < 1e-10 || ds.lengthSq() < 1e-10) continue;
      alignQ.set(b, new THREE.Quaternion().setFromUnitVectors(dt.normalize(), ds.normalize()));
    }
  }
  const parentW = new Map<THREE.Object3D, THREE.Quaternion>();
  const outer = (b: THREE.Object3D) => { const p = b.parent!; let q = parentW.get(p); if (!q) { q = wq(p); parentW.set(p, q); } return q; };   // 骨架外层节点（静止）
  const out: THREE.AnimationClip[] = [];
  const tmp = new THREE.Quaternion(), inv = new THREE.Quaternion();
  // v1.2.17 变体：镜像用对侧骨骼；扭转 / 前倾作用在 spine_01 及其子孙
  const mirrorName = (n: string) => n.replace(/_l$/, '_#').replace(/_r$/, '_l').replace(/_#$/, '_r');
  const upper = new Set<THREE.Bone>(); const sp = tBones.find(b => b.name === 'spine_01');
  sp?.traverse(o => { if ((o as THREE.Bone).isBone) upper.add(o as THREE.Bone); });
  const hl = tBones.find(b => b.name === 'hand_l'), face = hl && wp(hl).x < 0 ? -1 : 1;   // 面朝 +z 时左手在 +x
  const curve = (keys: [number, number][] | undefined, u: number) => {
    if (!keys?.length) return 0;
    if (u <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; const x = (u - a) / Math.max(1e-6, b - a), e = x * x * (3 - 2 * x); return va + (vb - va) * e; }
    return keys[keys.length - 1][1];
  };
  type Job = { clip: THREE.AnimationClip; name: string; v?: ClipVariant };
  const jobs: Job[] = clips.map(c => ({ clip: c, name: c.name }));
  for (const v of variants) { const c = clips.find(x => x.name === v.from); if (c) jobs.push({ clip: c, name: v.name, v }); }
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qe = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  for (const { clip, name, v } of jobs) {
    const c0 = v?.crop?.[0] ?? 0, c1 = Math.min(clip.duration, v?.crop?.[1] ?? clip.duration), spd = v?.speed ?? 1;
    const dur = Math.max(0.05, (c1 - c0) / spd), mir = !!v?.mirror;
    const n = Math.max(2, Math.round(dur * fps) + 1), times = new Float32Array(n);
    const qv = new Map<THREE.Bone, Float32Array>(); for (const b of tBones) qv.set(b, new Float32Array(n * 4));
    const hv = new Float32Array(n * 3);
    const act = mx.clipAction(clip); act.reset().play();
    // v1.2.17 Mixamo 片段大多带根位移（攻击往前冲一步）：去掉整体漂移、水平晃动压到 35%（死亡保留，倒地要往后摔）
    const inPlace = align && !/Death|Dying/.test(name), dEnd = new THREE.Vector3(), d0 = new THREE.Vector3();
    if (inPlace && sHip) { for (const [tt, v] of [[c0, d0], [c1, dEnd]] as const) { act.time = tt; mx.update(0); source.updateMatrixWorld(true); v.copy(wp(sHip)).sub(sHip0).multiplyScalar(k).applyQuaternion(R); } dEnd.sub(d0); }
    for (let i = 0; i < n; i++) {
      const to = Math.min(dur, i / fps), t = Math.min(clip.duration, c0 + to * spd); times[i] = to;
      act.time = t; mx.update(0); source.updateMatrixWorld(true);
      const u = to / dur, yaw = curve(v?.twist, u) * Math.PI / 180, pit = curve(v?.pitch, u) * Math.PI / 180 * face;
      if (yaw || pit) qe.copy(qy.setFromAxisAngle(Y, yaw)).multiply(qx.setFromAxisAngle(X, pit));
      const curW = new Map<THREE.Bone, THREE.Quaternion>();
      for (const b of tBones) {
        const sn = map[mir ? mirrorName(b.name) : b.name], sb = sn ? sBy.get(sn) : undefined;
        const pw = curW.get(b.parent as THREE.Bone) ?? outer(b);
        let w: THREE.Quaternion;
        if (sb) {
          const d = wq(sb).multiply(inv.copy(sRest.get(sn!)!).invert());
          if (align) { d.premultiply(R).multiply(Ri); const a = alignQ.get(b); if (a) d.multiply(a); }
          if (mir) { d.y = -d.y; d.z = -d.z; }   // 按 x = 0 平面反射
          w = d.multiply(tRestW.get(b)!);
          if ((yaw || pit) && upper.has(b)) w.premultiply(qe);
        } else w = pw.clone().multiply(tRestL.get(b)!);
        curW.set(b, w);
        tmp.copy(pw).invert().multiply(w).normalize();
        tmp.toArray(qv.get(b)!, i * 4);
      }
      if (tHip && sHip) {
        const d = wp(sHip).sub(sHip0).multiplyScalar(k); if (align) d.applyQuaternion(R); if (inPlace) { d.x = (d.x - d0.x - u * dEnd.x) * 0.35; d.z = (d.z - d0.z - u * dEnd.z) * 0.35; } if (mir) d.x = -d.x;
        const pInvM = new THREE.Matrix4().copy(tHip.parent!.matrixWorld).invert();
        const world0 = tHip0.clone().add(d).applyMatrix4(pInvM);
        (Number.isFinite(world0.x) ? world0 : tHipLocal0).toArray(hv, i * 3);
      }
    }
    act.stop(); mx.uncacheAction(clip);
    const tracks: THREE.KeyframeTrack[] = tBones.map(b => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, qv.get(b)!));
    if (tHip && sHip) tracks.push(new THREE.VectorKeyframeTrack(`${tHip.name}.position`, times, hv));
    out.push(new THREE.AnimationClip(name, dur, tracks));
  }
  mx.uncacheRoot(source);
  for (const [o, p, q, s] of keep) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  source.updateMatrixWorld(true);
  return out;
}
