// ======================================================================
// DLC1「灵契猎手」外观（v1.0.6，程序化建模，风格同本体 web/gear.ts 挂件 + dlc1/models.ts）
// 底模：本体 KayKit Rogue（骨骼动画齐全）染成钢灰 / 兽皮色；以下挂件由 ClassExt.dress 在换装时生成：
//   链环兜帽（留出脸）、灰狼皮披肩 + 左肩狼头骨、腰间链甲裙 + 兽牙腰链、胸前鸣钟铜铃（猎卫出身）、
//   武器（11-05 两个栏位）：右手长柄弯刃（主手）+ 左手反曲弓（弓位）+ 常驻箭袋；鹰契弓在手、长柄上背，其余形态反过来；品质越高刃口 / 铜铃越亮
// 形态光环：换形时在头顶浮现半透明的狼 / 熊 / 鹰之魂（formAura）
// 注意：Object3D.add 返回父节点，不要写 parent.add(mesh).scale.set(...)（会改到父节点）
// ======================================================================
import * as THREE from 'three';
import { toon, glow } from '../../web/gfx';
import type { ClassDressApi } from '../../core/ClassExt';
import type { Form } from './hunter_runtime';
import { hunterForm } from './hunter_runtime';
import { makeGlbProp, hasGlb } from '../../web/creatures_glb';
import { D40_LUX_KEY } from './gear40';
import { PACK_ICONS } from './icons.gen';

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const noOl = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };
const QCOL: Record<string, number> = { white: 0xb8c0c8, green: 0x7ae07a, blue: 0x6aa8ff, purple: 0xc080ff, orange: 0xffa040, dark: 0xffd060 };
const STEEL = 0x8a929c, DARK_STEEL = 0x50565e, FUR = 0x8a8478, FUR_DARK = 0x5a5248, BONE = 0xe8dcc0, BRONZE = 0xb8863a, LEATHER = 0x5a3a24;

/** 链环兜帽：前面留出脸的半球 + 垂到肩上的链帘 */
function coif(q: number) {
  const g = new THREE.Group();
  const mail = toon(STEEL);
  const cap = mesh(new THREE.SphereGeometry(0.56, 14, 10, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.66), mail, 0, 0.5, -0.02);
  g.add(cap);
  const drape = mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.3, 14, 1, true, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4), mail, 0, 0.08, -0.02);
  g.add(drape);
  // 额前一圈铜箍 + 品质宝石
  const band = mesh(new THREE.TorusGeometry(0.5, 0.035, 4, 18, Math.PI * 1.2), toon(BRONZE), 0, 0.62, 0);
  band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI * 0.4 - Math.PI * 0.6; g.add(band);
  g.add(noOl(mesh(new THREE.OctahedronGeometry(0.06), glow(q, 2.2), 0, 0.7, 0.5)));
  return g;
}
/** 狼皮披肩 + 左肩狼头骨 */
function mantle() {
  const g = new THREE.Group();
  const fur = toon(FUR), furD = toon(FUR_DARK), bone = toon(BONE);
  const pelt = mesh(new THREE.CylinderGeometry(0.42, 0.66, 0.34, 12, 1, true), fur, 0, 0.12, -0.04);
  g.add(pelt);
  for (let i = 0; i < 9; i++) {   // 毛尖
    const a = Math.PI * 0.15 + i / 8 * Math.PI * 1.7;
    const t = mesh(new THREE.ConeGeometry(0.07, 0.22, 4), i % 2 ? furD : fur, Math.cos(a) * 0.64, -0.08, -Math.sin(a) * 0.64 - 0.04);
    t.rotation.x = Math.PI; g.add(t);
  }
  const skull = new THREE.Group(); skull.position.set(0.5, 0.36, 0.02); g.add(skull);
  skull.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), bone));
  const snout = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), bone, 0, -0.03, 0.15); skull.add(snout);
  for (const sx of [1, -1]) {
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.13, 4), bone, sx * 0.08, 0.14, -0.02); skull.add(ear);
    skull.add(noOl(mesh(new THREE.SphereGeometry(0.03, 5, 4), glow(0x9fe8ff, 2.5), sx * 0.06, 0.03, 0.12)));
  }
  return g;
}
/** 链甲裙 + 兽牙腰链 */
function skirt() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.42, 14, 1, true), toon(DARK_STEEL), 0, -0.12, 0));
  const ring = mesh(new THREE.TorusGeometry(0.45, 0.04, 4, 16), toon(LEATHER), 0, 0.08, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + i * 0.3;
    const fang = mesh(new THREE.ConeGeometry(0.03, 0.12, 4), toon(BONE), Math.sin(a) * 0.47, 0.0, Math.cos(a) * 0.47);
    fang.rotation.x = Math.PI; g.add(fang);
  }
  return g;
}
/** 胸前鸣钟铜铃（猎卫出身） */
function bell(q: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.1, 0.14, 8, 1, true), toon(BRONZE), 0, 0, 0));
  g.add(noOl(mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(q, 1.8), 0, -0.07, 0)));
  return g;
}
/** 长柄弯刃：长柄 + 月牙弯刃 + 柄尾尖刺（沿 +y，挂右手） */
function glaive(q: number, tier: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), toon(LEATHER), 0, 0.3, 0));
  for (const y of [-0.3, 0.2, 0.9]) g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 6), toon(BRONZE), 0, y, 0));
  const blade = mesh(new THREE.TorusGeometry(0.32, 0.05 + tier * 0.006, 3, 14, Math.PI * 0.9), toon(0xd0d6de), 0.16, 1.42, 0);
  blade.rotation.z = -Math.PI * 0.35; g.add(blade);
  g.add(mesh(new THREE.ConeGeometry(0.06, 0.3, 4), toon(0xd0d6de), 0, 1.45, 0));
  const edge = mesh(new THREE.TorusGeometry(0.34, 0.012, 3, 14, Math.PI * 0.9), glow(q, tier >= 3 ? 2.4 : 1.2), 0.16, 1.42, 0);
  edge.rotation.z = -Math.PI * 0.35; g.add(noOl(edge));
  const tail = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), toon(DARK_STEEL), 0, -0.78, 0); tail.rotation.x = Math.PI; g.add(tail);
  return g;
}
/** 11-05 反曲弓（挂左手 handslotl，握把在原点、竖直沿 ±y；弓背朝 -x、弦在 +x 一侧）：
 *  深色木弓臂（中段弯向弦、梢端反曲外翻）+ 皮缠握把 + 品质色梢套 / 弓臂嵌线 / 握把宝石 + 弓弦；q = 弓的品质色 */
function bow(q: number) {
  const g = new THREE.Group(); g.name = 'h_bow';
  const wood = toon(0x4a2e1c), wrap = toon(LEATHER), acc = toon(q), line = glow(q, 1.4);
  // 半边弓臂轮廓（y ≥ 0）：x = 朝弦方向的偏移
  const half = [[0, 0], [0.035, 0.16], [0.09, 0.34], [0.14, 0.5], [0.15, 0.62], [0.12, 0.71], [0.06, 0.77]];
  for (const sy of [1, -1]) {
    const pts = half.map(([x, y]) => new THREE.Vector3(x, y * sy, 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const limb = mesh(new THREE.TubeGeometry(curve, 20, 0.032, 6, false), wood); g.add(limb);
    // 弓臂正面嵌线（品质色微光，贴在弓背 -x 一侧）
    const inl = new THREE.CatmullRomCurve3(half.slice(1, 6).map(([x, y]) => new THREE.Vector3(x - 0.03, y * sy, 0)));
    g.add(noOl(mesh(new THREE.TubeGeometry(inl, 12, 0.009, 4, false), line)));
    const tip = mesh(new THREE.SphereGeometry(0.04, 6, 4), acc, 0.06, 0.77 * sy, 0); tip.scale.set(1, 1.5, 1); g.add(tip);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), wrap, 0, 0, 0));   // 握把皮缠
  for (const y of [0.11, -0.11]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 8), acc, 0, y, 0));
  g.add(noOl(mesh(new THREE.OctahedronGeometry(0.045), glow(q, 2), -0.05, 0, 0)));
  // 弓弦：从两端搭弦处（反曲段内侧）直线连过去
  g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.44, 3), toon(0xe8e4d0), 0.135, 0, 0));
  return g;
}
/** 11-05 箭袋（常驻背后，见 QUIVER_BACK；口朝上略向后外倾）：皮筒 + 品质色箍 + 5 支露出的箭（箭杆 + 箭羽） */
function quiver(q: number) {
  const g = new THREE.Group(); g.name = 'h_quiver';
  const leather = toon(LEATHER), dark = toon(0x3a2416), acc = toon(q);
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.62, 10), leather, 0, 0, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.04, 10), dark, 0, -0.31, 0));   // 底
  for (const y of [0.27, -0.2]) g.add(mesh(new THREE.TorusGeometry(0.105, 0.016, 4, 12), acc, 0, y, 0).rotateX(Math.PI / 2));
  g.add(noOl(mesh(new THREE.OctahedronGeometry(0.035), glow(q, 1.8), 0, 0.05, 0.1)));   // 筒身宝石（朝外）
  const strap = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.012), dark, 0, 0.02, -0.105); g.add(strap);
  const fl = [toon(0xe8e0d0), toon(0x9a3a2a), toon(q)];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.3, r = 0.05, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.16 + (i % 3) * 0.035;
    const arrow = new THREE.Group(); arrow.position.set(x, 0.31, z); arrow.rotation.set(z * 1.2, 0, -x * 1.2);
    arrow.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, h + 0.1, 4), toon(0x8a6a44), 0, (h - 0.1) / 2, 0));
    for (let k = 0; k < 3; k++) { const v = mesh(new THREE.BoxGeometry(0.005, 0.1, 0.035), fl[(i + k) % 3], 0, h - 0.04, 0); const pv = new THREE.Group(); pv.rotation.y = k / 3 * Math.PI * 2; v.position.z = 0.02; pv.add(v); pv.position.y = 0; arrow.add(pv); }
    g.add(arrow);
  }
  return g;
}
const tierOf = (q?: string) => ({ white: 0, green: 1, blue: 2, purple: 3, orange: 4, dark: 5 } as Record<string, number>)[q ?? 'white'] ?? 0;

/** ClassExt.dress：换装时重建挂件 */
export function hunterDress(d: ClassDressApi) {
  const eq = d.eq;
  const best = (...s: string[]) => s.map(k => eq[k]).filter(Boolean).reduce<string | undefined>((a, it) => (tierOf(it!.quality) > tierOf(a) ? it!.quality : a), undefined);
  const qHead = QCOL[eq.head?.quality ?? 'white'] ?? QCOL.white;
  if (!d.lux) {   // v1.2.26 比赛版 Lux3D 模型自带衣甲
    d.attach('head', coif(qHead));
    d.attach('chest', mantle(), [0, 0.22, 0]);
    d.attach('chest', bell(QCOL[best('neck', 'chest') ?? 'white']), [0, 0.0, 0.44]);
    d.attach('hips', skirt(), [0, 0.02, 0]);
  }
  const mh = eq.mainHand, oh = eq.offHand && eq.offHand !== mh ? eq.offHand : undefined;
  const qm = QCOL[mh?.quality ?? 'white'];
  // 11-05 Rhett：两个武器栏位——右手长柄弯刃（主手，狼 / 熊 / 人形），左手弓（弓位 = 副手，鹰契）；两件都挂上，
  //   不在用的那把 userData.stowLock = true（weaponstow 始终收在背上：长柄斜背 backStaff、弓斜背 backL），换形态只切这个标记（hunterWeaponForm），不重建
  // v1.2.48 武器收纳：userData.stow = 武器类型，本体按类型挑收纳挂点
  const st = <T extends { userData: Record<string, unknown> }>(o: T, w: string, spot?: string) => { o.userData.stow = w; if (spot) o.userData.stowSpot = spot; if (d.lux) o.userData.stowBack = 0.3; return o; };   // 比赛版灵契猎手披厚毛斗篷：背着的武器再往后挪，别埋进斗篷里
  const dk = mh?.fixedId ? D40_LUX_KEY[mh.fixedId] : undefined;   // 11-05 40 级暗金三魂同契专属模型
  const lg = d.lux ? (dk && hasGlb(dk) ? makeGlbProp(dk, d.hd ? 1.25 / 0.55 : 1.25, 0.40, { emissive: 0x7dffb0, emissiveK: 0.3, offX: 0.05 })   /* 11-06 Rhett 批：三魂同契握点 0.18→0.40（上缠柄中心）+ x 偏 0.05 杆轴对手心 */ : null) ?? makeGlbProp('weapon_soul_glaive', d.hd ? 1.0 / 0.55 : 1.0, 0.3, { emissive: qm, emissiveK: 0.25 }) : null;   // v1.2.26 兽魂契刃
  const gl = st(up15(lg ?? glaive(qm, tierOf(mh?.quality))), 'glaive'); gl.name = 'h_glaive';
  d.attach('handslotr', gl);
  const ow = oh?.weaponType === 'bow' ? oh : undefined, qb = QCOL[ow?.quality ?? 'white'];   // 没装弓也挂一把训练弓（鹰契照样拉弓）
  const sk = d.skin?.('bow'), sb = sk ? makeGlbProp(sk, d.hd ? 1.1 / 0.55 : 1.1, 0.5) : null;   // 铸造台的弓 / 弩外观（进弓位）
  // 11-05 40 级暗金「鹰契」d40_h_bow：05 交付 w40_hunter_bow 弓 + 箭袋同网格，本地按连通岛拆成 w40_hunter_bow_b（弓）+ w40_hunter_quiver（箭袋，tools/split-glb-islands.mjs）
  const bk = ow?.fixedId ? D40_LUX_KEY[ow.fixedId] : undefined, dkBow = d.lux && bk && hasGlb(bk);
  const db = dkBow ? makeGlbProp(bk!, d.hd ? 1.15 / 0.55 : 1.15, 0.5, { emissive: 0x7dffb0, emissiveK: 0.3 }) : null;
  // 11-13 I04：弓原长 1.5–1.55（比长柄还长约一半，Rhett「大小不对」）→ 1.1–1.15，约为身高四分之三；兽魂契刃握点 0.15 → 0.3（少戳出头顶）
  const bw = st(up15(sb ?? db ?? bow(qb)), 'bow');   /* 11-17 Rhett：铸造台弓外观优先于暗金鹰契弓 */ bw.name = 'h_bow'; bw.userData.holdUpright = true; bw.userData.stringDir = stringDirOf(bw);   // 11-13 I04：在手时按前臂摆正（weaponstow.holdUpright） if (!ow) bw.userData.training = true;
  d.attach('handslotl', bw);
  const eagle = hunterForm() === 'eagle';
  gl.userData.stowLock = eagle; bw.userData.stowLock = !eagle;
  // 箭袋：11-05 Rhett「放在背上」——常驻背后（右肩后侧竖背、口朝右肩上方，拉弓时右手从肩后取箭）；换形 / 拔弓都不动。
  //   长柄斜背、弓斜背交叉在背中线，箭袋偏右肩外侧，比赛版斗篷更厚再往后挪
  const qk = dkBow && hasGlb('w40_hunter_quiver') ? makeGlbProp('w40_hunter_quiver', d.hd ? 0.75 / 0.55 : 0.75, 0.5, { emissive: 0x7dffb0, emissiveK: 0.2 }) : null;
  const qv = qk ?? quiver(qb); qv.name = 'h_quiver';
  d.attach('chest', qv, QUIVER_BACK.pos(d.lux), QUIVER_BACK.rot);
}
/** 11-14 Rhett「主手长柄和弓放大 1.5 倍」：绕握点（局部原点）放大。GLB 道具的几何是每件克隆的，直接缩几何；程序化模型缩子节点 */
const HUNTER_WEAPON_K = 1.5;
function up15<T extends THREE.Object3D>(o: T): T {
  const m = o as unknown as THREE.Mesh;
  if (m.isMesh && m.userData.luxKey) { m.geometry.scale(HUNTER_WEAPON_K, HUNTER_WEAPON_K, HUNTER_WEAPON_K); m.geometry.computeBoundingSphere(); }
  else for (const c of o.children) { c.position.multiplyScalar(HUNTER_WEAPON_K); c.scale.multiplyScalar(HUNTER_WEAPON_K); }
  return o;
}
/** 11-14 弦在弓的哪一侧（弓局部、垂直于长轴 y）：几何已按包围盒居中，握把在弓背一侧最外（弦在另一侧最外）→
 *  取握把段（|y| < 8% 弓长）顶点在薄厚方向上的重心，弦 = 它的反方向；程序化弓弦在 +x */
function stringDirOf(o: THREE.Object3D): THREE.Vector3 {
  // 暗金 / 铸造外观是包了一层的组：取顶点最多的网格，顶点换到弓（组）局部再算
  let m: THREE.Mesh | null = null; o.updateMatrixWorld(true);
  o.traverse(c => { const k = c as THREE.Mesh; if (k.isMesh && k.geometry?.getAttribute('position') && (!m || k.geometry.getAttribute('position').count > m.geometry.getAttribute('position').count)) m = k; });
  if (!m || (!(o as THREE.Mesh).isMesh && !(m as THREE.Mesh).userData.luxKey && !/glb|lux/i.test((m as THREE.Mesh).name))) return new THREE.Vector3(1, 0, 0);   // 程序化弓：弦在 +x
  const mm = m as THREE.Mesh, pos = mm.geometry.getAttribute('position'), toO = new THREE.Matrix4().copy(o.matrixWorld).invert().multiply(mm.matrixWorld), v = new THREE.Vector3();
  const P: THREE.Vector3[] = []; let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(toO); P.push(v.clone()); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
  const L = y1 - y0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, gy = 0;   // 握点 = 局部原点
  let x = 0, z = 0, n = 0; for (const p of P) { if (Math.abs(p.y - gy) > L * 0.08) continue; x += p.x - cx; z += p.z - cz; n++; }
  if (!n) return new THREE.Vector3(1, 0, 0);
  return (x1 - x0) >= (z1 - z0) ? new THREE.Vector3(-Math.sign(x) || 1, 0, 0) : new THREE.Vector3(0, 0, -Math.sign(z) || 1);   // 握把在弓背 → 弦在反侧
}
/** 11-05 箭袋背挂点（chest 骨骼空间；x 负 = 右，z 负 = 后；rot 为 [x, y, z] 弧度），测试可改 */
export const QUIVER_BACK = { p: [-0.2, 0.05, -0.3] as [number, number, number], pl: [-0.22, 0.05, -0.42] as [number, number, number], rot: [0.25, 0, -0.35] as [number, number, number], pos(lux?: boolean) { return lux ? this.pl : this.p; } };
/** 11-05 换形态时切换哪把武器在手（root = 玩家 rig.root）：鹰 = 弓在左手、长柄收在背；其余 = 长柄在右手、弓斜背。返回找到的件数（测试用） */
export function hunterWeaponForm(root: unknown, f: Form): number {
  const r = root as THREE.Object3D | undefined; if (!r || typeof r.traverse !== 'function') return 0;
  let n = 0;
  r.traverse(o => { if (o.name === 'h_glaive') { o.userData.stowLock = f === 'eagle'; n++; } else if (o.name === 'h_bow') { o.userData.stowLock = f !== 'eagle'; n++; } });
  return n;
}

// ---------------------------------------------------------------- 形态之魂（换形时头顶浮现）
const AURA_COL: Record<Form, number> = { wolf: 0xc8d8f0, bear: 0xd09050, eagle: 0x80c8ff };
function spiritHead(f: Form) {
  const g = new THREE.Group();
  const m = toon(AURA_COL[f], { transparent: true, opacity: 0.55, emissive: new THREE.Color(AURA_COL[f]).multiplyScalar(0.5) });
  const eye = glow(0xffffff, 2.5);
  if (f === 'wolf') {
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), m));
    const sn = mesh(new THREE.BoxGeometry(0.16, 0.13, 0.3), m, 0, -0.05, 0.22); g.add(sn);
    for (const sx of [1, -1]) { g.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 4), m, sx * 0.12, 0.22, -0.02)); g.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), eye, sx * 0.08, 0.04, 0.18)); }
  } else if (f === 'bear') {
    g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), m));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), m, 0, -0.07, 0.24));
    for (const sx of [1, -1]) { g.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), m, sx * 0.2, 0.22, 0)); g.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), eye, sx * 0.1, 0.05, 0.24)); }
  } else {
    g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), m));
    const beak = mesh(new THREE.ConeGeometry(0.06, 0.18, 4), toon(0xffd060, { transparent: true, opacity: 0.7 }), 0, -0.02, 0.2); beak.rotation.x = Math.PI / 2; g.add(beak);
    for (const sx of [1, -1]) {
      const w = mesh(new THREE.BoxGeometry(0.7, 0.04, 0.26), m, sx * 0.45, 0.02, -0.08); w.rotation.z = sx * 0.35; g.add(w);
      g.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), eye, sx * 0.07, 0.04, 0.12));
    }
  }
  return noOl(g);
}
/** 11-11 I02：头顶契印（狼契 / 熊契 / 鹰契），公告板精灵，加色混合（黑底即透明），不受雾 / 光照影响 */
const markTex: Partial<Record<Form, THREE.Texture>> = {};
function pactMark(f: Form): THREE.Object3D | null {
  const src = PACK_ICONS[`mk_${f}`]; if (!src) return null;
  let t = markTex[f];
  if (!t) { t = markTex[f] = new THREE.TextureLoader().load(src); t.colorSpace = THREE.SRGBColorSpace; }
  const m = new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
  const sp = new THREE.Sprite(m); sp.scale.set(0.62, 0.62, 1); sp.name = 'pact_mark'; sp.renderOrder = 5;
  return sp;
}
/** 在玩家模型根节点上换一个形态之魂（root = THREE.Object3D）；返回挂上的物体（测试用） */
export function formAura(root: unknown, f: Form): THREE.Object3D | null {
  const r = root as THREE.Object3D | undefined; if (!r || typeof r.add !== 'function') return null;
  const old = r.getObjectByName('hunter_aura'); if (old) r.remove(old);
  const g = new THREE.Group(); g.name = 'hunter_aura';
  // 11-11 I02（Rhett「头顶契约标记太丑」）：低模兽头 → 契印图（icons/mk_<契>.jpg，黑底发光图，加色混合）；没图回退旧兽头
  const h = pactMark(f) ?? spiritHead(f); h.position.set(0, 2.75, -0.2); g.add(h);
  const ring = noOl(mesh(new THREE.TorusGeometry(0.9, 0.025, 4, 24), glow(AURA_COL[f], 1.6), 0, 0.08, 0)); ring.rotation.x = Math.PI / 2; g.add(ring);
  g.userData.form = f;
  r.add(g);
  return g;
}
