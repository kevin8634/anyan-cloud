// ======================================================================
// 营地 A「沉船拾荒营」（比赛版 Lux3D 场景件，10-28）：倒钟广场营地换成沉船拾荒者的营地
//   G1：船首像（北门外地标）、黄铜船灯（挂在程序化船木灯柱上）、沉船木料围墙（营地东西两侧外圈）
//   Turbo：篝火石圈 + 交叉木柴（换掉本体石圈，火焰仍是 plaza_dress 的 shader 火舌）、帐篷、布篷商摊（米拉身后）、
//          告示板、铁砧 + 煤筐 + 武器架（西南锻造角）、木桶、货箱、绳卷、铁锚、尖头栅栏段
//   铁链（Turbo 生成失败）→ 程序化盘链
//   商用 base 包 / 低画质：没有场景件 → 全部跳过（本体 Q 版 / camp_real 程序件照旧）
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { makeGlbScene } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { realStake } from './camp_real';

export const hasCamp = () => 'scene_camp_firering' in PACK_CREATURE_GLB && curQuality !== 'low';
const hiQ = () => curQuality === 'ultra' || curQuality === 'high';

/** 场景件：h / w 二选一；返回 null = 没解析好 / 没有 */
/** ?off=campwallh 回原高 */
const WALL_H_OFF = (() => { try { return /(?:[?&]off=[^&]*\bcampwallh\b)/.test(location.search); } catch { return false; } })();
const WALL_H_K = 1.25;
export function campPiece(id: string, size: { h?: number; w?: number }, more: { envK?: number; metal?: number; tint?: number } = {}): THREE.Group | null {
  if (!hasCamp()) return null;
  const g = makeGlbScene('scene_camp_' + id, size, { envK: 0.4, metal: 0.05, ...more });
  if (g) g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  if (g && id === 'wreckwall' && !WALL_H_OFF) g.scale.y *= WALL_H_K;   // 11-18 23:30 Rhett「营地的栅栏稍微矮了点」：沉船围墙只拉高 25%（宽度不变，底边贴地不动）
  return g;
}

// 本体 WILD_PROP_HOOKS（tent / crate / stall / anvil / board）用：有 Lux3D 件就换，没有 → null（交给 camp_real / 本体）
export function campProp(kind: string): THREE.Object3D | null {
  if (kind === 'tent') return campPiece('tent', { h: 2.5 });
  if (kind === 'crate') return campPiece('crates', { h: 1.5 });
  if (kind === 'stall') return campPiece('stall', { h: 2.8 });
  if (kind === 'anvil') return campPiece('anvil', { h: 0.95 });
  if (kind === 'board') return campPiece('noticeboard', { h: 2.4 });
  // fix1109 #3：有沉船围墙（campBuild 沿同一路径摆）时，本体木栅桩位只留碰撞，不再显示程序化写实木桩 / 横杆（否则两道栅栏叠在一起）
  if (kind === 'stake' && hasCamp() && makeGlbScene('scene_camp_wreckwall', { w: 1 })) { const g = new THREE.Group(); g.name = 'stake_hidden'; return g; }
  return null;
}

const lights: { l: THREE.PointLight; base: number; ph: number }[] = [];
/** 船木灯柱 + 挂钩横担 + Lux3D 黄铜船灯（灯罩自发光；高画质点暖光）
 *  11-17 Rhett：镜渊城主路两侧也用这款灯柱，光色换成幽影绿（opt.color）；opt.light=false 不加点光源（一条街二十多盏，只靠自发光 + 光晕） */
export function campLampPost(opt: { color?: number; light?: boolean; halo?: boolean } = {}): THREE.Group | null {
  const lan = campPiece('lamppost', { h: 0.95 }, { envK: 0.7, metal: 0.55 }); if (!lan) return null;
  const col = opt.color ?? 0xffb060, warm = opt.color === undefined;
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.92 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.3, 7), wood); post.position.y = 1.65; post.rotation.z = 0.03; post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.9), wood); arm.position.set(0, 3.15, 0.38); g.add(arm);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), wood); brace.position.set(0, 2.92, 0.2); brace.rotation.x = -0.75; g.add(brace);
  lan.position.set(0, 3.1 - 0.95, 0.72); g.add(lan);
  if (!warm) {   // 灯罩里原本的暖色自发光换成指定光色（只改有自发光的材质，黄铜框架不动）
    const c = new THREE.Color(col);
    lan.traverse(o => { const mm = (o as THREE.Mesh).material; if (!mm) return; const list = Array.isArray(mm) ? mm : [mm];
      const out = list.map(m0 => { const m = m0 as THREE.MeshStandardMaterial; if (!m.emissive || (m.emissive.r + m.emissive.g + m.emissive.b < 0.05 && !m.emissiveMap)) return m0;
        const m2 = m.clone(); m2.emissive = c.clone(); m2.emissiveIntensity = Math.max(1, m.emissiveIntensity ?? 1); return m2; });
      (o as THREE.Mesh).material = Array.isArray(mm) ? out : out[0]; });
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2), toneMapped: false }));
  glow.position.set(0, 3.1 - 0.95 * 0.42, 0.72); g.add(glow);
  if (opt.halo) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.scale.setScalar(1.3); sp.position.copy(glow.position); g.add(sp); }
  if (opt.light ?? hiQ()) { const l = new THREE.PointLight(warm ? 0xffa050 : col, 2.4, 9, 1.8); l.position.copy(glow.position); g.add(l); lights.push({ l, base: 2.4, ph: Math.random() * 9 }); }
  g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  return g;
}
let haloT: THREE.CanvasTexture | null = null;
function haloTex(): THREE.CanvasTexture {
  if (haloT) return haloT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); haloT = new THREE.CanvasTexture(c); return haloT;
}
const lampPost = () => campLampPost();

/** 程序化盘链（Lux3D 铁链生成失败的替代）：一圈圈椭圆环 */
function chainPile(): THREE.Group {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.6, metalness: 0.7 });
  const link = new THREE.TorusGeometry(0.075, 0.022, 5, 10);
  let a = 0, r = 0.42, y = 0.03;
  for (let i = 0; i < 46; i++) {
    const o = new THREE.Mesh(link, m); o.scale.set(1, 1.6, 1);
    o.position.set(Math.cos(a) * r, y, Math.sin(a) * r); o.rotation.set(Math.PI / 2, i % 2 ? Math.PI / 2 : 0, -a); o.castShadow = true; g.add(o);
    a += 0.22 / r; if (a > Math.PI * 2 * (1 + (0.42 - r) * 4)) { r -= 0.09; y += 0.045; } if (r < 0.15) break;
  }
  return g;
}

export const campStats = { pieces: 0, lamps: 0, hiddenRing: 0, blocks: 0, walls: 0, fireRedo: 0 };
/** 营地布置（局部坐标；camp = 营地中心）。在 plazaBuild 末尾调用 */
/** fix1107（Rhett 10:22：DLC 所有营地都换成倒钟广场的样子）：avoid = 营地局部坐标里要让开的点（传送阵 / NPC），件落在里面就不放 */
export function campBuild(api: WildBuildApi, camp: { x: number; z: number; r?: number }, avoid: { x: number; z: number; r: number }[] = [], fireOff = { x: 0, z: 0 }, noRing = false) {   // 11-18 noRing：营地篝火整个重放（campFireRedo）时这里不换石圈   // 11-18 fireOff：篝火相对营地中心的偏移（本体营地篝火不在正中）
  for (let i = lights.length - 1; i >= 0; i--) if (!lights[i].l.parent) lights.splice(i, 1);   // 多个营地共用：只清掉已经不在场景里的灯
  campStats.pieces = 0; campStats.lamps = 0; campStats.blocks = 0; campStats.walls = 0;
  if (!hasCamp()) return;
  const cx = camp.x, cz = camp.z;
  // fix1109 #3：布局按倒钟广场（r = 12）摆的；小营地（熔炉入口 10、井口 8）里圈件按比例收进围墙内，门外件按 r / 12 跟着围墙走
  const R = camp.r ?? 12, kIn = R < 12 ? (R - 1.2) / 10.8 : 1, kOut = R / 12;
  const put = (o: THREE.Object3D | null, x0: number, z0: number, ry = 0, r = 0, y = 0) => { if (!o) return null; const k = Math.hypot(x0, z0) < 12.6 ? kIn : kOut, x = x0 * k, z = z0 * k; if (avoid.some(a => Math.hypot(x - a.x, z - a.z) < a.r + r + 0.6)) return null; api.add(o, cx + x, cz + z, ry); o.position.y += y; campStats.pieces++;
    if (r > 0 && api.block) { api.block(cx + x, cz + z, r); campStats.blocks++; } return o; };

  // 篝火：藏掉本体石圈 / 木柴（火舌 / 点光保留），换 Lux3D 石圈 + 交叉木柴
  const ring = noRing ? null : campPiece('firering', { w: 2.6 });
  if (ring) {
    const root = api.add(new THREE.Group(), cx, cz) as THREE.Object3D, par = root.parent; par?.remove(root);
    const W = new THREE.Vector3(api.origin.x + cx + fireOff.x, 0, api.origin.z + cz + fireOff.z), v = new THREE.Vector3();
    par?.traverse(o => { if (o.name !== 'fire') return; const camp0 = o.parent; if (!camp0 || camp0.getWorldPosition(v).setY(0).distanceTo(W) > 2) return;
      camp0.children.forEach(c => { if (c === o || (c as THREE.Light).isLight) return; c.traverse(m => { if ((m as THREE.Mesh).isMesh && m.visible) { m.visible = false; campStats.hiddenRing++; } }); }); });
    api.add(ring, cx + fireOff.x, cz + fireOff.z, 0.4);   // 11-18 跟篝火走（不走 put 的按比例收缩）
  }
  // 北门外地标：船首像立在半埋的船木桩上，面朝城里来路
  const fh = campPiece('figurehead', { h: 2.9 }, { envK: 0.5 });
  if (fh) { const g = new THREE.Group(); g.add(fh); fh.position.y = 0.55; fh.rotation.x = -0.12;
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x2e241a, roughness: 0.95 })); stub.position.y = 0.4; stub.castShadow = true; g.add(stub);
    put(g, -6.2, -14.2, Math.PI + 0.35, 0.6); }
  // fix1109 #3（Rhett 11-09 17:43–17:45「栅栏没围成一圈 / 所有地图都不对 / 贴图撕裂」）：沉船围墙沿本体 wild.ts 程序化木栅的原路径首尾相接
  //   原来固定半径 14.2、东西各 5 段（不管营地实际半径 r：12 / 10 / 8），且旧模型在自身坐标里斜放约 43°，按 x 轴切向摆 → 段段错开、有缺口、朝向不对。
  //   现在：模型已转正（长边 = x，弧形外凸面 = -z）；按 wild.ts 同一套桩位（半径 r、n = round(2πr / 1.15)、|sin a| > 0.93 为南北门）
  //   把每一段连续桩位等分成约 3.2 米一段，段宽 = 弦长 × 1.1（两端交叠盖住参差的板头），沿切线摆、凹面朝营地中心。
  //   碰撞仍用 wild.ts 每根桩的碰撞圈（同一路径），这里不再另加。程序化写实木桩在有围墙时不显示（campProp('stake')）
  { const R0 = camp.r ?? 12, n = Math.round(R0 * 2 * Math.PI / 1.15), isGate = (i: number) => Math.abs(Math.sin(i / n * Math.PI * 2)) > 0.93;
    let s0 = 0; while (s0 < n && !isGate(s0)) s0++;   // 从一个门口开始绕，连续桩位成段
    const runs: [number, number][] = []; let cur: number | null = null;
    for (let k = 1; k <= n; k++) { const i = (s0 + k) % n; if (!isGate(i)) { if (cur === null) cur = s0 + k; } else if (cur !== null) { runs.push([cur, s0 + k - 1]); cur = null; } }
    if (cur !== null) runs.push([cur, s0 + n]);
    for (const [i0, i1] of runs) {
      const a0 = i0 / n * Math.PI * 2, a1 = i1 / n * Math.PI * 2, m = Math.max(1, Math.round(R0 * (a1 - a0) / 3.2)), da = (a1 - a0) / m;
      for (let j = 0; j < m; j++) {
        const a = a0 + da * (j + 0.5), ch = 2 * R0 * Math.sin(da / 2), rr = R0 * Math.cos(da / 2);
        const w = campPiece('wreckwall', { w: ch * 1.1 }); if (!w) continue;
        api.add(w, cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, -a - Math.PI / 2); w.position.y -= 0.06; campStats.walls++; campStats.pieces++;   // 不走 put 的让位（路径同本体桩位，让位会开缺口）
      }
    } }
  // 船灯：南北门内侧各一
  for (const [x, z, ry] of [[2.9, -9.6, -Math.PI / 2], [-2.9, 9.4, Math.PI / 2]] as const) { if (put(lampPost(), x, z, ry, 0.25)) campStats.lamps++; }
  // 西南锻造角：铁砧 + 煤筐 + 武器架
  put(campPiece('anvil', { h: 0.95 }), -5, 6.6, 0.5, 0.55);
  put(campPiece('coalbasket', { h: 0.7 }), -6.7, 5.6, 0.2, 0.4);
  put(campPiece('weaponrack', { h: 1.9 }), -4.4, 9.2, 0.25, 0.5);
  // 告示板：北门内西侧，面朝篝火
  put(campPiece('noticeboard', { h: 2.4 }), -6.4, -9.2, 0.45, 0.5);
  // 商摊：米拉身后（米拉朝西站在 x≈9.2）
  put(campPiece('stall', { h: 2.6 }), 10.6, -4.4, -Math.PI / 2, 1.0);
  // 小件：木桶 / 绳卷 / 盘链
  put(campPiece('barrel', { h: 1.0 }), -9.9, 5.6, 0.7, 0.4);
  put(campPiece('barrel', { h: 0.95 }), 7.4, -8.4, 2.1, 0.4);
  put(campPiece('rope', { h: 0.38 }), 6.6, 3.2, 0.9);
  put(chainPile(), -7.6, 7.7, 0.3);
  // 南门外：斜插的铁锚 + 尖头栅栏段
  const anc = campPiece('anchor', { h: 2.4 }, { envK: 0.5, metal: 0.45 });
  if (anc) { anc.children[0].rotation.z = 0.32; anc.children[0].position.y = -0.25; put(anc, 6.6, 15.2, -0.5, 0.5); }
  // fix1107（Rhett 10:20）：旧的 Lux3D 尖头栅栏段收掉，换营地同款新木栅（木桩 + 两道横杆，按两桩实际位置连）
  { const posts: THREE.Object3D[] = [];
    for (const [x, z] of [[-9.4, 15.6], [-8.1, 15.4], [-6.8, 15.2], [-5.5, 15.0]] as const) { const st = realStake(x * 0.37 + z, 1.4); const o = put(st, x, z, 0, 0.3); if (o) posts.push(o); }
    for (let i = 0; i + 1 < posts.length; i++) { const f = posts[i].userData.railTo as ((a: THREE.Vector3, b: THREE.Vector3) => THREE.Object3D) | undefined; if (f) posts[i].parent?.add(f(posts[i].position.clone(), posts[i + 1].position.clone())); } }
}
export function campUpdate(t: number) {
  for (const L of lights) L.l.intensity = L.base * (0.9 + 0.07 * Math.sin(t * 7 + L.ph) + 0.04 * Math.sin(t * 19 + L.ph));
}
