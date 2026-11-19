// ======================================================================
// DLC1「负棺人」外观（v1.0.7，程序化建模，风格同 hunter_model.ts）
// 底模：本体 KayKit Knight（不带头盔 / 盾 / 剑）染成锈铁 / 墓土色；ClassExt.dress 在换装时生成：
//   背上的铁棺（最重要：六角棺身 + 可开合的棺盖 + 铁箍 + 棺钉 + 3 个魂窗，魂窗颜色 = 棺中魂的种类）
//   斜挎胸前的棺链、裹尸布兜帽 + 铁面、腰间垂下的寿衣布条、右手一盘棺链 + 铁钩（武器「葬棺」）
// 棺态：立棺时背上的棺消失，墓碑（立着半截插进地里的铁棺）出现在场景里；入殓时角色隐去，地上躺一口合上的棺
// 注意：Object3D.add 返回父节点，不要写 parent.add(mesh).scale.set(...)（会改到父节点）
// ======================================================================
import * as THREE from 'three';
import { toon, glow } from '../../web/gfx';
import type { ClassDressApi } from '../../core/ClassExt';
import type { CoffinVisual } from './coffin_runtime';
import { SOUL_COLOR } from './coffin_skills';
import { makeGlbProp, hasGlb } from '../../web/creatures_glb';
import { D40_LUX_KEY } from './gear40';
import { makeTombGrave, tombPit, tombPuff } from './tomb_fx';
import type { TombFxEvent } from './coffin_runtime';

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const noOl = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };
const QCOL: Record<string, number> = { white: 0xb8c0c8, green: 0x7ae07a, blue: 0x6aa8ff, purple: 0xc080ff, orange: 0xffa040, dark: 0xffd060 };
const IRON = 0x4a4c50, RUST = 0x6a4a36, BRONZE = 0x8a7a4a, VERDIGRIS = 0x5a8a7a, CLOTH = 0xd8d0bc, CLOTH_D = 0x9a9080, WOOD = 0x3a2a22;

/** 六角棺的轮廓（XY 平面，y 向上；h = 长，w = 肩宽） */
function coffinShape(h: number, w: number) {
  const s = new THREE.Shape();
  const top = w * 0.62, sh = w / 2, foot = w * 0.36, ys = h * 0.22;
  s.moveTo(-top / 2, h / 2); s.lineTo(top / 2, h / 2); s.lineTo(sh, h / 2 - ys); s.lineTo(foot, -h / 2); s.lineTo(-foot, -h / 2); s.lineTo(-sh, h / 2 - ys); s.closePath();
  return s;
}
/** 铁棺（局部原点 = 棺身中心；面朝 +z = 棺盖）。q = 魂窗 / 棺钉亮度用的品质色，tier 越高铁箍越多 */
export function makeCoffin(q: number, tier = 0, scale = 1) {
  const g = new THREE.Group(); g.name = 'coffin';
  const h = 1.55 * scale, w = 0.66 * scale, d = 0.3 * scale;
  const body = mesh(new THREE.ExtrudeGeometry(coffinShape(h, w), { depth: d, bevelEnabled: false }), toon(IRON), 0, 0, -d / 2);
  g.add(body);
  // 木质内衬边（棺口一圈）
  const rim = mesh(new THREE.ExtrudeGeometry(coffinShape(h * 0.96, w * 0.94), { depth: 0.02 * scale, bevelEnabled: false }), toon(WOOD), 0, 0, d / 2 - 0.01 * scale);
  g.add(rim);
  // 棺盖（铰链在左侧：子节点 coffin_lid 绕 y 转）
  const hinge = new THREE.Group(); hinge.name = 'coffin_lid'; hinge.position.set(-w / 2, 0, d / 2); g.add(hinge);
  const lid = mesh(new THREE.ExtrudeGeometry(coffinShape(h * 1.02, w * 1.04), { depth: 0.05 * scale, bevelEnabled: true, bevelSize: 0.012 * scale, bevelThickness: 0.012 * scale, bevelSegments: 1 }), toon(RUST), w / 2, 0, 0);
  hinge.add(lid);
  // 铁箍 + 棺钉
  const bands = [0.3, -0.05, -0.38].slice(0, 2 + Math.min(1, tier >> 1));
  for (const by of bands) {
    const bw = by > 0.2 ? w * 0.98 : w * (0.78 - (0.2 - by) * 0.35);
    hinge.add(mesh(new THREE.BoxGeometry(bw * 1.04, 0.06 * scale, 0.03 * scale), toon(BRONZE), w / 2, by * h, 0.06 * scale));
    for (const sx of [-1, 1]) hinge.add(mesh(new THREE.SphereGeometry(0.028 * scale, 6, 4), toon(VERDIGRIS), w / 2 + sx * bw * 0.44, by * h, 0.08 * scale));
  }
  // 棺盖上的长条纹（十字之外的「沉钟」纹：竖条 + 钟形）
  hinge.add(mesh(new THREE.BoxGeometry(0.05 * scale, h * 0.7, 0.025 * scale), toon(BRONZE), w / 2, -0.05 * h, 0.065 * scale));
  const bell = mesh(new THREE.CylinderGeometry(0.05 * scale, 0.11 * scale, 0.14 * scale, 8), toon(BRONZE), w / 2, 0.3 * h + 0.09 * scale, 0.08 * scale);
  bell.rotation.x = Math.PI / 2; hinge.add(bell);
  // 3 个魂窗（棺中魂）：没魂时暗，有魂时按魂的种类发光
  for (let i = 0; i < 3; i++) {
    const win = noOl(mesh(new THREE.SphereGeometry(0.05 * scale, 8, 6), glow(0x30303a, 1), w / 2, (0.12 - i * 0.14) * h, 0.08 * scale));
    win.name = `coffin_soul_${i}`; win.userData.soulWin = true; hinge.add(win);
    const ring = mesh(new THREE.TorusGeometry(0.065 * scale, 0.014 * scale, 4, 10), toon(BRONZE), w / 2, (0.12 - i * 0.14) * h, 0.075 * scale); hinge.add(ring);
  }
  // 棺底品质铭灯
  hinge.add(noOl(mesh(new THREE.OctahedronGeometry(0.045 * scale), glow(q, 2), w / 2, -0.42 * h, 0.08 * scale)));
  // 棺身两侧链环
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const link = mesh(new THREE.TorusGeometry(0.04 * scale, 0.012 * scale, 4, 8), toon(IRON), sx * (w * 0.44 + 0.03 * scale), (0.3 - i * 0.09) * h, 0);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0; g.add(link);
  }
  return g;
}
/** 斜挎棺链（左肩到右腰） */
function strapChain() {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const link = mesh(new THREE.TorusGeometry(0.045, 0.014, 4, 8), toon(IRON), 0.32 - t * 0.64, 0.32 - t * 0.7, 0.36 - Math.sin(t * Math.PI) * 0.06);
    link.rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0.8); g.add(link);
  }
  return g;
}
/** 裹尸布兜帽 + 铁面 */
function shroudHood(q: number) {
  const g = new THREE.Group();
  const cloth = toon(CLOTH, { side: THREE.DoubleSide });
  g.add(mesh(new THREE.SphereGeometry(0.6, 14, 10, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, Math.PI * 0.62), cloth, 0, 0.48, -0.04));
  const tail = mesh(new THREE.ConeGeometry(0.3, 0.6, 8, 1, true), cloth, 0, 0.3, -0.42); tail.rotation.x = -1.1; g.add(tail);
  const mask = mesh(new THREE.BoxGeometry(0.5, 0.18, 0.06), toon(IRON), 0, 0.3, 0.46); g.add(mask);
  for (const sx of [-1, 1]) g.add(noOl(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), glow(q, 2.2), sx * 0.11, 0.33, 0.5)));
  return g;
}
/** 腰间寿衣布条 */
function shroudStrips() {
  const g = new THREE.Group();
  const a = toon(CLOTH, { side: THREE.DoubleSide }), b = toon(CLOTH_D, { side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const ang = -0.9 + i * 0.36;
    const s = mesh(new THREE.PlaneGeometry(0.16, 0.5 + (i % 2) * 0.12), i % 2 ? b : a, Math.sin(ang) * 0.5, -0.28, Math.cos(ang) * 0.5);
    s.rotation.y = ang; g.add(s);
  }
  const belt = mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 16), toon(RUST), 0, 0, 0); belt.rotation.x = Math.PI / 2; g.add(belt);
  return g;
}
/** 右手：一盘棺链 + 铁钩（葬棺的握柄端） */
function chainHook(q: number) {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const link = mesh(new THREE.TorusGeometry(0.05, 0.016, 4, 8), toon(IRON), 0, -0.05 - i * 0.075, 0);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0; g.add(link);
  }
  const hook = mesh(new THREE.TorusGeometry(0.1, 0.03, 5, 10, Math.PI * 1.3), toon(IRON), 0, -0.64, 0.04); hook.rotation.z = Math.PI * 0.6; g.add(hook);
  g.add(noOl(mesh(new THREE.SphereGeometry(0.03, 6, 4), glow(q, 1.8), 0.08, -0.56, 0.04)));
  return g;
}

/** fix1109 #2（Rhett 11-09 17:43：40 级暗金棺背上比原铁棺小很多）：makeGlbProp 按包围盒长边归一到 1.62，两件包围盒一样长，
 *  但不眠棺顶上 3 盏魂灯 + 下半截收尖，棺身（截面宽 ≥ 最大宽一半的段）只占全长 60%（原铁棺 90%），正面投影面积只有原棺 72%。
 *  k：整件放大倍数（棺身长比 1.5、投影面积比 1.18、体积比 1.24 → 取 1.35，棺身 ≈ 原棺 90%、正面面积 ≈ 原棺 1.3 倍补收尖）；
 *  a：锚点（从底起的比例）0.63 → 顶部魂灯与原棺顶齐平（不顶出兜帽），多出来的长度往下（收尖的棺尾），棺身中心与原棺相差 < 0.1 */
// 11-13（Rhett「负棺人的武器不是大棺材，太小了，底下有细细长长的不知道啥」）：棺尾细尖已从模型里删掉（tools/trim-glb-below.mjs，底部 10%），
//   整件放大 1.35 → 1.6（棺身约为原铁棺 1.3 倍长、接近人高），锚点 0.63 → 0.69 让顶部魂灯仍与原棺顶齐平，多出来的往下
const D40_BACK: Record<string, { k: number; a: number }> = { w40_coffin_sleepless: { k: 1.6, a: 0.69 } };
const tierOf = (q?: string) => ({ white: 0, green: 1, blue: 2, purple: 3, orange: 4, dark: 5 } as Record<string, number>)[q ?? 'white'] ?? 0;

/** ClassExt.dress：换装时重建挂件 */
export function coffinDress(d: ClassDressApi) {
  const eq = d.eq;
  const mh = eq.mainHand;
  const q = QCOL[mh?.quality ?? 'white'] ?? QCOL.white;
  const back = makeCoffin(q, tierOf(mh?.quality)); back.name = 'coffin_back';
  back.rotation.set(0, Math.PI, -0.12);   // 棺盖朝外（背后 = -z），略微斜背
  d.attach('chest', back, d.hd ? [0.05, -0.3, -0.62] : [0.05, -0.12, -0.5]);
  if (d.hd) back.scale.multiplyScalar(1.55);   // v1.2.19 写实：胸骨比例会把棺材缩到 0.55，背棺要保持人那么高
  // v1.2.26 比赛版：Lux3D 藤壶铁棺套在程序化棺材里（棺身网格隐藏，只留魂窗 / 铭灯这些玩法件）；衣甲是 Lux3D 模型自带的
  const dk = mh?.fixedId ? D40_LUX_KEY[mh.fixedId] : undefined;   // 11-05 40 级暗金不眠棺专属模型
  const dz = dk ? D40_BACK[dk] : undefined;
  const lc = d.lux ? (dk && hasGlb(dk) ? makeGlbProp(dk, 1.62 * (dz?.k ?? 1), dz?.a ?? 0.5, { emissive: 0x7dffb0, emissiveK: 0.3 }) : null) ?? makeGlbProp('weapon_iron_coffin', 1.62, 0.5, { emissive: 0x40c8d0, emissiveK: 0.3 }) : null;
  if (lc) { back.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.soulWin && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) (m.material as THREE.Material).visible = false; }); lc.position.z = -0.02; back.add(lc);
    back.getObjectByName('coffin_lid')?.traverse(o => { if (o.userData.soulWin) o.position.z += 0.12; }); }
  if (!d.lux) {
    d.attach('chest', strapChain(), [0, 0.05, 0]);
    d.attach('head', shroudHood(QCOL[eq.head?.quality ?? 'white'] ?? QCOL.white));
    d.attach('hips', shroudStrips(), [0, 0.04, 0]);
  }
  const hook = chainHook(q); hook.userData.stow = 'hook'; hook.userData.stowSpot = 'beltFrontR';   // v1.2.48 收纳：钩链挂右腰前（挂胯侧会被背棺挡住），出手时取出
  d.attach('handslotr', hook);
}

// ---------------------------------------------------------------- 棺态外观（运行时 → 场景）
let tombScene: THREE.Object3D | null = null, tombY = 0;
/** 11-04 立棺墓碑 墓碑瞬时表现：腐朽之地脚下冒烟 / 减速脚边泥土下陷（同屏最多 16 处） */
export function coffinTombFx(e: TombFxEvent) {
  if (!tombScene || !tombScene.getObjectByName('coffin_grave')) return;
  for (const p of e.pts.slice(0, 16)) tombPuff(tombScene, p, tombY, e.kind);
}
/** 测试用：场景里的墓碑件 */
export function tombVisualDebug() {
  const g = tombScene?.getObjectByName('coffin_grave');
  const mats: { k: number; add: boolean; ol: boolean }[] = [];
  g?.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (!m) return; const c = (m as THREE.MeshBasicMaterial).color; mats.push({ k: c ? Math.max(c.r, c.g, c.b) : 0, add: m.blending === THREE.AdditiveBlending, ol: m.userData.outlineParameters?.visible === false }); });
  return { grave: !!g, rot: !!g?.getObjectByName('grave_corrode'), ring: !!g?.getObjectByName('coffin_grave_ring'), pit: !!tombScene?.getObjectByName('coffin_pit'), soulFire: !!g?.getObjectByName('grave_soulfire'),
    maxK: mats.reduce((a, m) => Math.max(a, m.k), 0), additive: mats.filter(m => m.add).length, noOutline: mats.every(m => m.ol), mats: mats.length };
}
function sceneOf(root: THREE.Object3D) { return root.parent ?? null; }
function setSouls(c: THREE.Object3D | undefined, v: CoffinVisual) {
  if (!c) return;
  for (let i = 0; i < 3; i++) {
    const w = c.getObjectByName(`coffin_soul_${i}`) as THREE.Mesh | undefined; if (!w) continue;
    const s = v.souls[i], m = w.material as THREE.MeshBasicMaterial;
    if (m.color) m.color.setHex(s ? SOUL_COLOR[s] : 0x30303a);
    w.scale.setScalar(s ? 1.35 : 1);
  }
}
/** 运行时状态 → 外观（root = 玩家模型根节点）。幂等：同一状态反复调用不重建 */
export function coffinVisual(root: unknown, v: CoffinVisual) {
  const r = root as THREE.Object3D | undefined; if (!r || typeof r.getObjectByName !== 'function') return;
  const back = r.getObjectByName('coffin_back');
  if (back) {
    back.visible = v.mode === 'back' && !v.rest;
    const lid = back.getObjectByName('coffin_lid'); if (lid) lid.rotation.y = v.open ? 1.25 : 0;
    setSouls(back, v);
  }
  const sc = sceneOf(r);
  // 墓碑
  if (sc) {
    // 11-04 立棺墓碑 特效 §3.1 / §3.5：墓碑 = 砸立入地的铁棺 + 翻起的墓土 + 冷雾（凋魂墓碑另有腐朽之地腐蚀纹、暗紫油烟）；去掉常驻发光圈
    tombScene = sc;
    let grave = sc.getObjectByName('coffin_grave');
    const key = v.mode === 'planted' && v.tomb ? `${v.tomb.x.toFixed(2)},${v.tomb.z.toFixed(2)},${v.rot ? 1 : 0},${(v.tombR ?? 5).toFixed(1)}` : '';
    if (grave && grave.userData.key !== key) {
      const was = grave.userData.tombAt as { x: number; z: number } | undefined;
      sc.remove(grave);
      if (was && (!v.tomb || was.x !== v.tomb.x || was.z !== v.tomb.z) && !v.rest) tombPit(sc, was, grave.position.y);   // 收棺：留下土坑 6 秒
      grave = undefined;
    }
    if (!grave && key && v.tomb) {
      const g = makeTombGrave(v.tombR ?? 5, !!v.rot); g.userData.key = key; g.userData.tombAt = { ...v.tomb };
      g.position.set(v.tomb.x, r.position.y, v.tomb.z); tombY = r.position.y;
      sc.add(g); grave = g;
    }
    if (grave) setSouls(grave, v);
    // 入殓：地上躺一口棺，角色隐去
    let rest = sc.getObjectByName('coffin_rest');
    if (v.rest && !rest) {
      const g = new THREE.Group(); g.name = 'coffin_rest';
      const c = makeCoffin(0xe0d0ff, 2, 1.25); c.rotation.set(-Math.PI / 2, 0, 0); c.position.set(0, 0.2, 0); g.add(c);
      g.position.copy(r.position); g.rotation.y = r.rotation.y;
      sc.add(g); rest = g;
    } else if (!v.rest && rest) { sc.remove(rest); rest = undefined; }
  }
  r.visible = !v.rest;
}
