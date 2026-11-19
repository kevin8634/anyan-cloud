// ======================================================================
// v1.2.73 精英 5 只绑骨显示件（05 交 01，Rhett 11-05 19:47 批）：镜像骑士 / 团长瑟兰 / 工头格罗克 / 腐根祭司 / 静默修士（两首领共用）
//   05 链路：G1 显示件 + 权重转移，52 骨 UE 命名（与 LUX_* 同体系）→ 骨架 / 挂点 / 动作全借 UBC（Mixamo 动作库重定向）。
//   模型只在比赛版 assets_aholo/models_hd/LUX_E_*.glb（gen-assets 按 LUX_ 前缀内嵌，加载画面 loadHd 里解析 + 重定向）；
//   商用构建 / 低画质 / 写实没加载 → 返回 null，调用方回退原静态 Lux 模型或程序化模型。
// ======================================================================
import { HD_RIGS, HD_ATTACH, UBC_RIG } from '../../web/rig';
import { makeCharacter, useHd } from '../../web/chars';
import type { Rig } from '../../web/models';   // 只取类型
import * as THREE from 'three';
import { makeGlbProp } from '../../web/creatures_glb';

/** 手持件：[Lux 道具键, 长度, 握点, 左手?]（11-05 22:15 Rhett：骑士 / 团长 / 工头另配武器，显示件本身不带） */
type W = [string, number, number, boolean?];
type E = { model: string; height: number; clipSet: 'warrior' | 'mage'; glow?: number; wield?: W[]; /** 11-06 模型自带逐招片段（不重定向），death = 死亡用哪段 */ own?: { re: RegExp; death?: string } };
/** 键 = 原静态模型 id（lux_dlc / models.ts 的 lux 调用） */
export const ELITE_HD: Record<string, E> = {
  dlc1_mirror_knight: { model: 'LUX_E_MirrorKnight', height: 2.1, clipSet: 'warrior', glow: 0x062a30, wield: [['weapon_bell_sword', 1.15, 0.13], ['weapon_bell_shield', 0.95, 0.5, true]] },
  dlc1_mirror_captain: { model: 'LUX_E_MirrorCaptain', height: 2.3, clipSet: 'warrior', glow: 0x062a30, wield: [['weapon_rock_greatsword', 1.6, 0.14]], own: { re: /^SC_/, death: 'SC_death' } },   // 11-06 05 逐招 v1（md5 54cc8087，网格骨骼同 b2646962 + 6 段），Rhett 04:02 批接入
  dlc1_echo_foreman: { model: 'LUX_E_EchoForeman', height: 2.7, clipSet: 'warrior', glow: 0x041c24, wield: [['weapon_rock_greataxe', 1.5, 0.12]] },
  dlc1_echo_priest: { model: 'LUX_E_EchoPriest', height: 2.7, clipSet: 'mage', glow: 0x04201a },
  dlc1_silent_monk: { model: 'LUX_E_SilentMonk', height: 2.0, clipSet: 'mage', glow: 0x041c20 },
};
for (const e of Object.values(ELITE_HD)) if (!HD_RIGS[e.model]) { HD_RIGS[e.model] = { ...UBC_RIG, parts: [], alignFrom: true, ...(e.own ? { ownClips: e.own.re } : {}) }; HD_ATTACH[e.model] = { ...HD_ATTACH.UBC_Male }; }

/** 有绑骨显示件就出写实精英（带 Mixamo 动作），否则 null */
export function eliteHd(id: string): Rig | null {
  const e = ELITE_HD[id]; if (!e || !useHd(e.model)) return null;
  const c = makeCharacter({ model: e.model, tex: '', show: [], mats: 'lux', clipSet: e.clipSet, height: e.height });
  if (!c) return null;
  if (e.glow) for (const m of c.mats) { const mm = m as unknown as { emissive?: { setHex(h: number): void }; userData: Record<string, unknown> }; mm.emissive?.setHex(e.glow); mm.userData.baseEmissive = e.glow; }
  if (e.wield) for (const w of e.wield) wieldOn(c.root, ...w);
  if (e.own?.death) c.anim.useClip('death', e.own.death);
  c.root.userData.lux = true; c.root.userData.eliteHd = e.model;
  return { root: c.root, body: c.root.children[0], legs: [], scale: 1, flash: c.mats, anim: c.anim } as unknown as Rig;
}

/** 道具挂到手骨上：握点对手掌（手骨 → 中指根中点，同 gear.ts luxify palm），刃 / 头朝角色前方；抵消骨链缩放，世界里均匀缩放 */
function wieldOn(root: THREE.Object3D, key: string, len: number, anchor: number, left = false) {
  const g = makeGlbProp(key, len, anchor); if (!g) return;
  const re = left ? /^(hand_l|LeftHand|mixamorig:?LeftHand)$/i : /^(hand_r|RightHand|mixamorig:?RightHand)$/i;
  let hb: THREE.Object3D | null = null; root.traverse(o => { if (!hb && (o as THREE.Bone).isBone && re.test(o.name)) hb = o; }); if (!hb) return;
  const hand = hb as THREE.Object3D; root.updateMatrixWorld(true);
  let mid: THREE.Object3D | null = null; hand.traverse(o => { if (!mid && o !== hand && (o as THREE.Bone).isBone && /middle/i.test(o.name)) mid = o; });
  const hp = hand.getWorldPosition(new THREE.Vector3()), palm = mid ? hp.clone().lerp((mid as THREE.Object3D).getWorldPosition(new THREE.Vector3()), 0.5) : hp;
  const rq = root.getWorldQuaternion(new THREE.Quaternion()), rs = root.getWorldScale(new THREE.Vector3()).y;
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq);   // 绑定姿态下：刃朝角色前方（拳握）
  const wq = left ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd)   // 盾：正面朝前
    : new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd);
  const W = new THREE.Matrix4().compose(palm, wq, new THREE.Vector3(rs, rs, rs));
  const pivot = new THREE.Group(); pivot.matrixAutoUpdate = false; pivot.matrix.copy(hand.matrixWorld.clone().invert().multiply(W));
  pivot.add(g); hand.add(pivot); g.userData.eliteWield = key;
}
