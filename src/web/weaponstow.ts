// ======================================================================
// v1.2.48 武器收纳：平时武器挂在背 / 腰 / 胯的收纳挂点，出手（攻击 / 施法 / 受击 / 被怪追打）时取出到手上，脱战约 4 秒收回
//   - 挂点 = 胸 / 胯骨骼上的空节点（gear.ts 用 attach 在「模型空间」摆好，经典 KayKit / 写实 UBC / 比赛版 Lux3D 通用，跟着骨骼动）
//   - 武器不换父节点（仍是手骨的子节点）：收纳时每帧把它的局部矩阵改成「世界 = 挂点位姿 × 武器自身形状」，
//     所以挂在武器下的一切（运行时铸造外观 lux_*、高清光效 weaponfx、品级光焰、宝石、暗金流光）都跟着走，
//     「武器在手」的查找（rig.root 里找 lux_<key>）不受影响
//   - 取出 / 收回带 0.15 / 0.25 秒过渡（只插值刚体部分，写实骨架的非均匀缩放保持铸造时的补偿）
//   - 收纳时光效降低：weaponfx 光环 / 符文环 / 点光源 / 魂火隐藏，流光降到 30%，品级光焰隐藏，强化拖尾不画
// 不改任何数值；只影响外观。
// ======================================================================
import * as THREE from 'three';
import type { Rig } from './models';

/** 收纳位置（模型空间：面朝 +z，左手在 +x） */
export type StowSpot = 'back' | 'backX' | 'backStaff' | 'backL' | 'backShield' | 'hipL' | 'hipR' | 'hipBack' | 'beltR' | 'beltL' | 'ringR' | 'ringL' | 'beltFrontR';
interface Sock { bone: 'chest' | 'hips'; off: [number, number, number]; offHd?: [number, number, number]; head: [number, number, number]; flat: [number, number, number]; f: number }
/**
 * 挂点表（KayKit 参照空间，单位同 KayKit 骑士：胸骨 y 0.97、胯 y 0.41、身体半宽 0.4、半厚 0.38；写实模型由 gear.ts 自动按骨骼比例换算）
 *   head = 武器头（刃尖 / 杖头 / 瓶口）指向；flat = 武器最薄那一面的法线（刃面贴着背 / 大腿）；f = 武器从尾（握柄端）到头的哪一点放在挂点上
 */
export const STOW_SOCKETS: Record<StowSpot, Sock> = {
  // 双手巨剑 / 巨斧、经典模型的单手剑：斜背，剑柄在右肩后上方（右手反手拔），刃朝左下
  back: { bone: 'chest', off: [0, 0.12, -0.46], offHd: [0, 0.05, -0.42], head: [0.55, -1, 0], flat: [0, 0, -1], f: 0.55 },
  // 经典双持的副手：和主手交叉，柄在左肩
  backX: { bone: 'chest', off: [0, 0.12, -0.5], offHd: [0, 0.05, -0.46], head: [-0.55, -1, 0], flat: [0, 0, -1], f: 0.55 },
  // 法杖：斜背，杖头在右肩后上方
  backStaff: { bone: 'chest', off: [0, 0.02, -0.46], offHd: [0, 0, -0.42], head: [-0.42, 1, 0], flat: [0, 0, -1], f: 0.5 },
  // 长柄 / 弓：斜背，头在左肩后上方
  backL: { bone: 'chest', off: [0, 0.02, -0.5], offHd: [0, 0, -0.46], head: [0.42, 1, 0], flat: [0, 0, -1], f: 0.5 },
  // 盾：背在后背正中，盾面朝外
  backShield: { bone: 'chest', off: [0, -0.12, -0.62], offHd: [0, -0.1, -0.55], head: [0, 1, 0], flat: [0, 0, -1], f: 0.5 },
  // 单手剑 / 斧 / 锤（写实）：挂左胯（右手交叉拔），刃朝下略向后
  hipL: { bone: 'hips', off: [0.46, 0.14, -0.1], head: [0.12, -1, -0.75], flat: [1, 0, 0], f: 0.3 },
  // 副手单手武器 / 魔杖（写实）：挂右胯
  hipR: { bone: 'hips', off: [-0.46, 0.14, -0.1], head: [-0.12, -1, -0.75], flat: [-1, 0, 0], f: 0.3 },
  // 匕首 / 短刃：横插在后腰
  hipBack: { bone: 'hips', off: [0, 0.16, -0.44], head: [1, -0.25, 0], flat: [0, 0, -1], f: 0.45 },
  // 药瓶 / 经典魔杖：挂右腰带前侧（瓶口朝上；v1.2.48 从胯侧往前挪，离下垂的手 ≥ 0.2，不再和手叠在一起）
  beltR: { bone: 'hips', off: [-0.42, 0.06, 0.3], head: [0, 1, 0], flat: [-1, 0, 0], f: 0.5 },
  // 时轮（环刃）：挂在胯的外后侧、略高，环面斜朝外后（离下垂的手远；放正后方会被披风盖住，所以留在披风侧缘外）
  ringR: { bone: 'hips', off: [-0.58, 0.2, -0.42], head: [0, 1, 0], flat: [-0.7, 0, -0.7], f: 0.5 },
  ringL: { bone: 'hips', off: [0.58, 0.2, -0.42], head: [0, 1, 0], flat: [0.7, 0, -0.7], f: 0.5 },
  // 钩链：挂在右腰前（背上背着棺材，挂胯侧会被棺材挡住），链子顺着大腿前侧垂下
  beltFrontR: { bone: 'hips', off: [-0.34, 0.2, 0.5], head: [0.05, -1, 0.15], flat: [0, 0, 1], f: 0.12 },
  // 典籍 / 法球 / 沙漏 / 副手时轮：挂左腰带
  beltL: { bone: 'hips', off: [0.46, 0.04, 0.08], head: [0, 1, 0], flat: [1, 0, 0], f: 0.5 },
};

/** 武器类型 → 收纳位置（main = 右手主手，off = 左手副手；hd = 写实比例，经典 KayKit 大头身长兵器挂胯会戳地，统一斜背） */
export function stowSpotFor(wt: string | undefined, hand: 'main' | 'off', hd: boolean, ctx: { twoHand?: boolean; shield?: boolean } = {}): StowSpot {
  switch (wt) {
    case 'greatsword': case 'greataxe': return 'back';
    case 'staff': return 'backStaff';
    case 'glaive': return 'backStaff';
    case 'bow': return 'backL';
    case 'shield': return 'backShield';
    case 'sword': case 'axe': case 'mace':
      if (hd) return hand === 'main' ? 'hipL' : 'hipR';
      return hand === 'main' ? 'back' : 'backX';
    case 'wand': return hd ? 'hipR' : 'beltR';
    case 'dagger': case 'shortblade': return 'hipBack';
    case 'flask': return 'beltR';
    case 'chakram': return hand === 'main' ? 'ringR' : 'ringL';
    case 'hook': return 'beltFrontR';
    case 'tome': case 'orb': case 'hourglass': case 'reagent': return 'beltL';
    default: return hand === 'main' ? (ctx.twoHand ? 'back' : 'beltR') : 'beltL';
  }
}

/** 收纳状态（rig.root.userData.stow） */
interface StowItem {
  obj: THREE.Object3D; spot: StowSpot; sock: THREE.Object3D;
  /** 参照世界矩阵（第一次收纳时武器在手里的位姿）和它的形状特征（世界方向 / 挂点对准的点） */
  ref?: THREE.Matrix4; refInv?: THREE.Matrix4; F?: THREE.Matrix4; c?: THREE.Vector3; len?: number;
  /** 11-05 这件自己的收纳程度（0~1，未缓动）：obj.userData.stowLock = true 时始终收着（内容包按形态切换哪把在手，如猎手鹰形态弓在手、长柄在背） */
  kk?: number;
}
export interface StowState { items: StowItem[]; k: number; drawn: boolean; force?: 'drawn' | 'stowed'; lastK: number }
export const STOW_AFTER = 4;     // 脱战多少秒收回
const DRAW_T = 0.15, SHEATHE_T = 0.25;

export const stowOf = (rig: Rig) => rig.root.userData.stow as StowState | undefined;

/** gear.ts applyGear 末尾调用：登记手上的东西和它们的挂点（mkSock 由 gear.ts 提供，按模型空间位姿挂到骨骼上） */
export function setupStow(rig: Rig, hands: { obj: THREE.Object3D; spot: StowSpot }[], mkSock: (bone: string, pos: [number, number, number], q: THREE.Quaternion) => THREE.Object3D | null, base: (bone: string) => THREE.Vector3 | undefined, hd: boolean) {
  const old = stowOf(rig);
  if (old) for (const it of old.items) it.sock.parent?.remove(it.sock);
  const items: StowItem[] = [];
  for (const h of hands) {
    const s = STOW_SOCKETS[h.spot]; const bp = base(s.bone); if (!bp) continue;
    const Y = new THREE.Vector3(...s.head).normalize(), Z0 = new THREE.Vector3(...s.flat);
    const Z = Z0.sub(Y.clone().multiplyScalar(Z0.dot(Y))).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const o = (hd && s.offHd) || s.off, ex = (h.obj.userData.stowBack as number | undefined) ?? 0;   // stowBack：额外往后挪（披风 / 毛斗篷厚的模型，内容包 dress 可设）
    const sock = mkSock(s.bone, [bp.x + o[0], bp.y + o[1], bp.z + o[2] - ex], q); if (!sock) continue;
    sock.name = 'stow_' + h.spot;
    items.push({ obj: h.obj, spot: h.spot, sock });
  }
  // 换装时保持当前状态（收着的就直接收着，不重放过渡）
  const k = old ? old.k : 1, drawn = old ? old.drawn : false;
  for (const it of items) it.kk = it.obj.userData.stowLock ? 1 : k;
  rig.root.userData.stow = { items, k, drawn, force: old?.force, lastK: -1 } as StowState;
  if (k > 0) applyStow(rig, k);
}

const _wh = new THREE.Matrix4(), _ws = new THREE.Matrix4(), _e = new THREE.Matrix4(), _pi = new THREE.Matrix4(), _l = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion(), _s2 = new THREE.Vector3(), _l2 = new THREE.Matrix4();
const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();

/** 武器（含子节点里看得见的网格，不含光效）在自身局部空间的包围盒 */
function localBox(obj: THREE.Object3D) {
  const inv = obj.matrixWorld.clone().invert(), box = new THREE.Box3(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const walk = (o: THREE.Object3D) => {
    if (o.name.startsWith('wfx_') || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (o as THREE.Light).isLight) return;
    const me = o as THREE.Mesh;
    if (me.isMesh && me.geometry) {
      const mt = me.material as THREE.Material | THREE.Material[];
      const vis = Array.isArray(mt) ? mt.some(x => x.visible) : mt.visible;
      if (vis && o.visible) {
        if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
        const bb = me.geometry.boundingBox!; m.copy(inv).multiply(me.matrixWorld);
        for (let i = 0; i < 8; i++) box.expandByPoint(v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m));
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(obj);
  return box;
}
/** 第一次收纳前：在手里的位姿下量出武器的长轴（头 = 离握点远的一端）、最薄轴、挂点对准的点 */
function measure(it: StowItem) {
  const W = it.obj.matrixWorld.clone(), box = localBox(it.obj);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.05, -0.05, -0.05), new THREE.Vector3(0.05, 0.05, 0.05));
  const sc = new THREE.Vector3(); { const e = W.elements; sc.set(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])); }
  const sz = box.getSize(new THREE.Vector3()).multiply(sc);
  const ax = sz.x >= sz.y && sz.x >= sz.z ? 0 : sz.y >= sz.z ? 1 : 2;
  const others = [0, 1, 2].filter(a => a !== ax), th = sz.getComponent(others[0]) <= sz.getComponent(others[1]) ? others[0] : others[1];
  const far = (a: number) => (Math.abs(box.max.getComponent(a)) >= Math.abs(box.min.getComponent(a)) ? 1 : -1);
  const hs = far(ax), ts = far(th);
  const hL = new THREE.Vector3(); hL.setComponent(ax, hs);
  const nL = new THREE.Vector3(); nL.setComponent(th, ts);
  const m3 = new THREE.Matrix3().setFromMatrix4(W);
  const hW = hL.applyMatrix3(m3).normalize(), nW0 = nL.applyMatrix3(m3);
  const nW = nW0.sub(hW.clone().multiplyScalar(nW0.dot(hW))).normalize(), aW = new THREE.Vector3().crossVectors(hW, nW);
  it.F = new THREE.Matrix4().makeBasis(aW, hW, nW);   // 武器形状坐标系（世界）：Y = 头，Z = 薄面法线
  const f = STOW_SOCKETS[it.spot].f, c = box.getCenter(new THREE.Vector3());
  const tail = hs > 0 ? box.min.getComponent(ax) : box.max.getComponent(ax), head = hs > 0 ? box.max.getComponent(ax) : box.min.getComponent(ax);
  c.setComponent(ax, tail + (head - tail) * f);
  it.c = c.applyMatrix4(W);
  it.len = sz.getComponent(ax);
  it.ref = W; it.refInv = W.clone().invert();
}

/** 收纳位姿（世界）：D · ref，D = 刚体（把武器形状坐标系转到挂点坐标系、对准点放到挂点上） */
function stowWorld(it: StowItem, out: THREE.Matrix4) {
  it.sock.matrixWorld.decompose(_sp, _sq, _ss);
  const R = new THREE.Matrix4().makeRotationFromQuaternion(_sq).multiply(it.F!.clone().transpose());
  const c = it.c!.clone().applyMatrix4(R);
  R.setPosition(_sp.x - c.x, _sp.y - c.y, _sp.z - c.z);
  return out.copy(R).multiply(it.ref!);
}

const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** 按收纳程度 k（0 = 在手，1 = 收好，已缓动）摆放全部武器；单件有自己的 kk（stowLock）时按它 */
function applyStow(rig: Rig, k0: number) {
  const st = stowOf(rig); if (!st) return;
  rig.root.updateMatrixWorld(true);
  for (const it of st.items) {
    const k = it.kk === undefined || it.kk === st.k ? k0 : ease(it.kk);
    const o = it.obj, par = o.parent; if (!par) continue;
    if (k <= 0) { if (!o.matrixAutoUpdate) { o.matrixAutoUpdate = true; o.updateMatrix(); o.updateMatrixWorld(true); } continue; }
    if (!it.ref) { if (!o.matrixAutoUpdate) { o.matrixAutoUpdate = true; o.updateMatrix(); } o.updateMatrixWorld(true); measure(it); }
    _wh.compose(o.position, o.quaternion, o.scale).premultiply(par.matrixWorld);   // 在手位姿
    stowWorld(it, _ws);
    let W = _ws;
    if (k < 1) {   // 过渡：绕武器握点插值刚体部分（位置线性、旋转球面插值），缩放保持在手时的
      _wh.decompose(_p, _q, _s); _ws.decompose(_p2, _q2, _s2);
      _q0.copy(_q).invert().premultiply(_q2); _q0.slerp(_qi, 1 - k);   // (收纳 · 在手⁻¹) 的 k 倍
      _p2.sub(_p).multiplyScalar(k).add(_p);
      W = _e.makeTranslation(-_p.x, -_p.y, -_p.z).premultiply(_l.makeRotationFromQuaternion(_q0)).premultiply(_l2.makeTranslation(_p2.x, _p2.y, _p2.z)).multiply(_wh);
    }
    o.matrixAutoUpdate = false;
    o.matrix.copy(_pi.copy(par.matrixWorld).invert().multiply(W));
    o.matrixWorldNeedsUpdate = true;
    o.updateMatrixWorld(true);
  }
  // 11-13 I04：弓类（userData.holdUpright）在手时按前臂朝向摆正——手臂下垂时弓顺着手臂竖在身侧，手臂抬平（拉弓）时弓垂直于前臂竖起；
  //   原来按绑定姿势挂死，手臂一垂下弓就横着戳出去（Rhett 11-11 截图）
  for (const it of st.items) {
    if (!it.obj.userData.holdUpright) continue;
    const k = it.kk === undefined || it.kk === st.k ? k0 : ease(it.kk); if (k >= 1) continue;
    holdUpright(it.obj, 1 - k);
  }
  // 光效：收纳时降低 / 关闭（11-05 按每件自己的收纳程度）
  const kq = Math.round(k0 * 10) / 10, sig = kq * 100 + st.items.reduce((a, it, i) => a + (it.kk === undefined || it.kk === st.k ? 0 : (Math.round(ease(it.kk) * 10) + 1) * (i + 1) * 1000), 0);
  if (sig !== st.lastK) {
    st.lastK = sig;
    for (const it of st.items) {
      const ki = Math.round((it.kk === undefined || it.kk === st.k ? k0 : ease(it.kk)) * 10) / 10, sk = 1 - ki, show = ki < 0.5;
      it.obj.traverse(o => {
        o.userData.stowK = sk;
        if (o.name.startsWith('wfx_') || (o as THREE.Points).isPoints) o.visible = show;
      });
    }
  }
  rig.root.userData.stowK = k0;
}

const _ha = new THREE.Vector3(), _hb = new THREE.Vector3(), _hd = new THREE.Vector3(), _hp = new THREE.Vector3(), _hh = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4(), _hm2 = new THREE.Matrix4();
const _UP = new THREE.Vector3(0, 1, 0), _hs = new THREE.Vector3(), _ht = new THREE.Vector3();
/** 弓在手：前臂方向 d（肘 → 手）。前臂接近水平 → 弓轴取「世界上方去掉沿 d 的分量」（垂直于前臂竖起）；前臂接近竖直 → 弓轴顺着前臂（朝上那头）。
 *  绕握点做最小旋转，w = 0..1 混合（取出 / 收回过渡）。找不到肘 / 手骨就不动 */
export function holdUpright(o: THREE.Object3D, w: number) {
  const slot = o.parent, hand = slot?.parent, fore = hand?.parent; if (!slot || !hand || !fore || w <= 0) return false;
  hand.getWorldPosition(_hh); fore.getWorldPosition(_hp); _hd.subVectors(_hh, _hp); if (_hd.lengthSq() < 1e-8) return false; _hd.normalize();
  o.updateMatrixWorld(true);
  const e = o.matrixWorld.elements; _ha.set(e[4], e[5], e[6]); if (_ha.lengthSq() < 1e-10) return false; _ha.normalize();   // 弓当前的长轴（局部 +Y）
  const c = _hd.dot(_UP), perp = _hb.copy(_UP).addScaledVector(_hd, -c);
  const t = Math.min(1, Math.max(0, (Math.abs(c) - 0.5) / 0.35)), sm = t * t * (3 - 2 * t);
  if (perp.lengthSq() < 1e-6) perp.copy(_hd); perp.normalize();
  const along = _hd.clone().multiplyScalar(c >= 0 ? 1 : -1);
  const want = perp.multiplyScalar(1 - sm).addScaledVector(along, sm); if (want.lengthSq() < 1e-6) return false; want.normalize();
  if (want.dot(_ha) < 0) want.negate();   // 弓上下对称：取离当前近的一头，避免整把翻转
  _hq.setFromUnitVectors(_ha, want);
  // 11-14 Rhett「弓拿反了，弓弦应该朝自己」：再绕弓轴转，让弦（userData.stringDir，弓局部方向）朝向肩膀——举弓时弦对着射手，垂手时弦朝身体
  const sd = o.userData.stringDir as THREE.Vector3 | undefined; let sh: THREE.Object3D | null = fore.parent; for (let p = fore.parent; p; p = p.parent) if (/chest|spine/i.test(p.name)) { sh = p; break; }   // 弦朝胸口
  if (sd && sh) {
    const sw = _hs.copy(sd).transformDirection(o.matrixWorld).applyQuaternion(_hq);   // 摆正之后弦的世界方向
    const tw = sh.getWorldPosition(_ht).sub(_hh);                                  // 手 → 胸
    sw.addScaledVector(want, -sw.dot(want)); tw.addScaledVector(want, -tw.dot(want));
    if (sw.lengthSq() > 1e-6 && tw.lengthSq() > 1e-6) {
      sw.normalize(); tw.normalize();
      const ang = Math.atan2(_ha.copy(sw).cross(tw).dot(want), sw.dot(tw));
      _hq.premultiply(new THREE.Quaternion().setFromAxisAngle(want, ang));
    }
  }
  if (w < 1) _hq.slerp(new THREE.Quaternion(), 1 - w);
  o.getWorldPosition(_hp);
  _hm.makeTranslation(-_hp.x, -_hp.y, -_hp.z).premultiply(_hm2.makeRotationFromQuaternion(_hq)).premultiply(new THREE.Matrix4().makeTranslation(_hp.x, _hp.y, _hp.z)).multiply(o.matrixWorld);
  o.matrixAutoUpdate = false;
  o.matrix.copy(_hm2.copy(slot.matrixWorld).invert().multiply(_hm));
  o.matrixWorldNeedsUpdate = true; o.updateMatrixWorld(true);
  return true;
}

/**
 * 每帧（main.ts 在动作更新之后调用）：drawn = 现在该拿在手上（最近出手 / 受击 / 被怪追打）。
 * force 可由测试 / 截图强制。返回当前收纳程度（0 在手 … 1 收好）
 */
export function gearStowTick(rig: Rig, dt: number, drawn: boolean) {
  const st = stowOf(rig); if (!st || !st.items.length) { rig.anim?.setRelaxed?.(false); return 0; }
  const want = st.force ? st.force === 'drawn' : drawn;
  st.drawn = want;
  const target = want ? 0 : 1;
  if (st.k !== target) st.k = want ? Math.max(0, st.k - dt / DRAW_T) : Math.min(1, st.k + dt / SHEATHE_T);
  for (const it of st.items) {   // 11-05 单件锁定收纳（stowLock）：跟着同样的取出 / 收回速度过渡
    const w = it.obj.userData.stowLock ? 1 : st.k;
    if (it.kk === undefined) it.kk = w;
    else if (w > it.kk) it.kk = Math.min(w, it.kk + dt / SHEATHE_T); else if (w < it.kk) it.kk = Math.max(w, it.kk - dt / DRAW_T);
  }
  const e = st.k * st.k * (3 - 2 * st.k);
  applyStow(rig, st.k <= 0 ? 0 : st.k >= 1 ? 1 : e);
  rig.anim?.setRelaxed?.(st.k >= 1);
  return st.k;
}

/** 测试 / 截图：强制拿出 / 收起（undefined = 自动） */
export function stowForce(rig: Rig, f?: 'drawn' | 'stowed') { const st = stowOf(rig); if (st) st.force = f; }
/** 测试：每件手持物现在在哪（世界坐标）、离手 / 挂点多远 */
export function stowInfo(rig: Rig) {
  const st = stowOf(rig); if (!st) return null;
  rig.root.updateMatrixWorld(true);
  const H = rig.root.userData.stowH as number | undefined;
  return {
    k: st.k, drawn: st.drawn, force: st.force ?? null, H: H ?? null,
    items: st.items.map(it => {
      const p = new THREE.Vector3(); it.obj.getWorldPosition(p);   // 握点（武器原点）
      const hand = it.obj.position.clone().applyMatrix4(it.obj.parent!.matrixWorld);   // 在手时握点应在的位置
      const sock = it.sock.getWorldPosition(new THREE.Vector3());
      let c: THREE.Vector3 | null = null;
      if (it.c && it.refInv) c = it.c.clone().applyMatrix4(it.refInv).applyMatrix4(it.obj.matrixWorld);   // 对准点当前世界位置
      const lux: string[] = []; it.obj.traverse(o => { if (o.name.startsWith('lux_')) lux.push(o.name); });
      return { name: it.obj.name || it.obj.type, spot: it.spot, kk: it.kk ?? null, lock: !!it.obj.userData.stowLock, parent: it.obj.parent?.name ?? '', grip: p.toArray(), hand: hand.toArray(), sock: sock.toArray(),
        dHand: p.distanceTo(hand), dSock: c ? c.distanceTo(sock) : null, len: it.len ?? null, lux };
    }),
  };
}
(globalThis as unknown as { __dbgHold?: typeof holdUpright }).__dbgHold = holdUpright;   // 11-14 自查脚本用
