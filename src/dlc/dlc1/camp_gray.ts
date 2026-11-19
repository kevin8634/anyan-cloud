// ======================================================================
// 11-18 Rhett「本体版营地没有用 DLC 版的营地模型：火堆、帐篷、路灯、栅栏等」：灰石营地（本体主营地，scenes.ts）换 DLC 营地同款
//   篝火：shader 火舌 + Lux3D 石圈（本体锥体火苗 / 石圈藏掉，点光保留）；帐篷 / 货箱 / 木桶：Lux3D 件；路灯：船木灯柱 + 黄铜船灯；
//   栅栏：沉船围墙沿本体木栅原路径（半径 16，北 / 东 / 南三个门口留空），本体木桩 / 横杆藏掉，碰撞照旧。
//   走本体 GRAY_CAMP_HOOKS（不注册 = 本体不变）；商用 base 包 / 低画质没有场景件 → 全部跳过。?off=graycamp 关
//   opt1118D 第二批：推车 / 旗杆 / 北门火把 / 商摊 / 铁砧 / 艾拉小篝火 / 蘑菇（?off=graycamp2）。6 个 KayKit NPC（models.ts makeNpc）与北山壁巨石不换
// ======================================================================
import * as THREE from 'three';
import { GRAY_CAMP_HOOKS } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { campPiece, campProp, campLampPost } from './camp_lux';
import { campFireDress, brazier, fireStack } from './plaza_dress';

const OFF = (() => { try { return /(?:[?&]off=[^&]*\bgraycamp\b)/.test(location.search); } catch { return false; } })();
export const grayCampStats = { fire: 0, tents: 0, props: 0, lamps: 0, walls: 0, hidden: 0, extra: 0 };
// opt1118D：剩余 Q 版件（推车 / 旗杆 / 北门火把 / 商摊 / 铁砧 / 艾拉小篝火 / 沼泽蘑菇）也换写实件；?off=graycamp2 关（只关这一批）
const OFF2 = (() => { try { return /(?:[?&]off=[^&]*\bgraycamp2\b)/.test(location.search); } catch { return false; } })();
const noOl = <T extends THREE.Object3D>(g: T) => { g.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !(m as THREE.ShaderMaterial).isShaderMaterial) m.userData.outlineParameters = { visible: false }; }); return g; };
let woodM: THREE.MeshStandardMaterial | null = null, ironM: THREE.MeshStandardMaterial | null = null;
const wood = () => (woodM ??= new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9, metalness: 0 }));
const iron = () => (ironM ??= new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.55, metalness: 0.7 }));
/** 写实手推车：木板车斗 + 两只铁箍木轮 + 车辕，车上放 Lux3D 货箱 / 木桶 / 绳卷（本体推车 1.8 × 1.1） */
function realCart(): THREE.Group | null {
  const crates = campPiece('crates', { h: 0.85 }); if (!crates) return null;
  const g = new THREE.Group(), w = wood(), fe = iron();
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material = w) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  box(1.9, 0.08, 1.1, 0, 0.72, 0);   // 车底板
  for (const z of [-0.55, 0.55]) for (const y of [0.86, 1.04]) box(1.9, 0.12, 0.05, 0, y, z);   // 两侧挡板
  for (const x of [-0.95, 0.95]) box(0.05, 0.3, 1.1, x, 0.92, 0);
  for (const x of [-0.95, 0, 0.95]) for (const z of [-0.56, 0.56]) box(0.07, 0.42, 0.07, x, 0.92, z);   // 立柱
  for (const z of [-0.3, 0.3]) { const sh = box(1.6, 0.07, 0.07, -1.6, 0.66, z); sh.rotation.z = -0.12; }   // 车辕
  box(0.07, 0.07, 0.7, -2.35, 0.57, 0);
  for (const z of [-0.66, 0.66]) {   // 轮子：木轮辋 + 铁箍 + 8 辐条 + 轮毂
    const wh = new THREE.Group(); wh.position.set(0.25, 0.48, z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 6, 20), w); wh.add(rim);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.022, 4, 20), fe); wh.add(tire);
    for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.84, 0.04), w); sp.rotation.z = i * Math.PI / 8; wh.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8), fe); hub.rotation.x = Math.PI / 2; wh.add(hub);
    wh.traverse(o => { o.castShadow = true; }); g.add(wh);
  }
  box(0.08, 0.08, 1.5, 0.25, 0.48, 0, fe);   // 车轴
  crates.position.set(-0.35, 0.76, 0); crates.scale.multiplyScalar(0.8); g.add(crates);
  const br = campPiece('barrel', { h: 0.75 }); if (br) { br.position.set(0.5, 0.76, 0.12); g.add(br); }
  const rp = campPiece('rope', { h: 0.3 }); if (rp) { rp.position.set(0.55, 0.76, -0.3); g.add(rp); }
  return noOl(g);
}
/** 写实沼泽蘑菇（艾拉的标本）：象牙色菌柄 + 灰绿菌盖（微弱荧光，不再是纯发光球） */
function realMushrooms(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.85 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x6f8a5a, roughness: 0.6, emissive: 0x4aff3a, emissiveIntensity: 0.18 });
  const gill = new THREE.MeshStandardMaterial({ color: 0xc8c4a8, roughness: 0.9, side: THREE.DoubleSide });
  const capProf = [[0, 0.32], [0.18, 0.3], [0.3, 0.22], [0.36, 0.1], [0.34, 0.04], [0.2, 0.06], [0.04, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
  const capG = new THREE.LatheGeometry(capProf, 14);
  const pts: [number, number, number, number][] = [[0, 0, 1.15, 0.05], [0.42, 0.25, 0.8, -0.12], [-0.36, 0.3, 0.7, 0.18], [0.15, -0.42, 0.55, -0.2], [-0.2, -0.2, 0.42, 0.1]];
  for (const [x, z, s, tilt] of pts) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.06 * s, 0.5 * s, 7), stem); st.position.set(x, 0.25 * s, z); st.rotation.z = tilt; st.castShadow = true; g.add(st);
    const c = new THREE.Mesh(capG, cap); c.scale.setScalar(s); c.position.set(x + Math.sin(-tilt) * 0.25 * s, 0.4 * s, z); c.rotation.z = tilt; c.castShadow = true; g.add(c);
    const u = new THREE.Mesh(new THREE.CircleGeometry(0.3 * s, 12), gill); u.rotation.x = Math.PI / 2; u.position.copy(c.position); u.position.y += 0.05 * s; g.add(u);
  }
  return noOl(g);
}
/** 旗杆换写实木杆：Q 版 toon 圆柱杆换成风化木材质 + 铁杆头（旗面已由 upgradeFlags 换成写实布料） */
function realPole(o: THREE.Object3D): boolean {
  let n = 0;
  o.traverse(m => { const mm = m as THREE.Mesh; if (!mm.isMesh || !mm.visible) return; const mat = mm.material as THREE.Material;
    if ((mat as THREE.MeshToonMaterial).isMeshToonMaterial && (mm.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry') { mm.material = wood(); n++; } });
  if (!n) return false;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), iron()); tip.position.y = 3.72; tip.userData.outlineParameters = { visible: false }; o.add(tip);
  return true;
}


if (!OFF) GRAY_CAMP_HOOKS.push(api => {
  if (curQuality === 'low') return;
  const hide = (o: unknown) => { (o as THREE.Object3D).visible = false; grayCampStats.hidden++; };
  for (const it of api.items) {
    const o = it.obj as THREE.Object3D;
    if (it.kind === 'fire') {
      if (!campFireDress(api, it.x, it.z)) continue;
      grayCampStats.fire++;
      const ring = campPiece('firering', { w: 2.6 });
      if (ring) { for (const c of o.children) if (c.name !== 'fire' && !(c as THREE.Light).isLight) c.visible = false; api.add(ring, it.x, it.z, 0.4); }
    } else if (it.kind === 'tent' || it.kind === 'crate') {
      const p = campProp(it.kind); if (!p) continue;
      hide(o); api.add(p, it.x, it.z, it.ry); if (it.kind === 'tent') grayCampStats.tents++; else grayCampStats.props++;
    } else if (it.kind === 'barrel') {
      const p = campPiece('barrel', { h: 1.0 }); if (!p) continue;
      hide(o); api.add(p, it.x, it.z, it.ry); grayCampStats.props++;
    } else if (it.kind === 'lamp') {
      const p = campLampPost(); if (!p) continue;
      hide(o); api.add(p, it.x, it.z, it.ry); grayCampStats.lamps++;
    }
  }
  // 栅栏：本体 scenes.ts 木栅绕 (0, 4) 半径 16，角度 0 / π/2 / 3π/2（东 / 南 / 北门）±0.32 留空
  const probe = campPiece('wreckwall', { w: 1 }); if (!probe) return;
  const CX = 0, CZ = 4, R = 16, G = 0.32;
  const runs: [number, number][] = [[G, Math.PI / 2 - G], [Math.PI / 2 + G, Math.PI * 1.5 - G], [Math.PI * 1.5 + G, Math.PI * 2 - G]];
  for (const [a0, a1] of runs) {
    const m = Math.max(1, Math.round(R * (a1 - a0) / 3.2)), da = (a1 - a0) / m;
    for (let j = 0; j < m; j++) {
      const a = a0 + da * (j + 0.5), ch = 2 * R * Math.sin(da / 2), rr = R * Math.cos(da / 2);
      const w = campPiece('wreckwall', { w: ch * 1.1 }); if (!w) continue;
      api.add(w, CX + Math.cos(a) * rr, CZ + Math.sin(a) * rr, -a - Math.PI / 2); w.position.y -= 0.06; grayCampStats.walls++;
    }
  }
  if (grayCampStats.walls) for (const it of api.items) if (it.kind === 'fence') hide(it.obj);
});
if (!OFF && !OFF2) GRAY_CAMP_HOOKS.push(api => {
  if (curQuality === 'low' || !campPiece('barrel', { h: 1 })) return;   // 商用 base 包没有场景件：全部保持本体
  const hide = (o: unknown) => { (o as THREE.Object3D).visible = false; grayCampStats.hidden++; };
  const hiQ = curQuality === 'ultra' || curQuality === 'high';
  for (const it of api.items) {
    const o = it.obj as THREE.Object3D;
    try {
      if (it.kind === 'cart') { const p = realCart(); if (!p) continue; hide(o); api.add(p, it.x, it.z, it.ry); grayCampStats.extra++; }
      else if (it.kind === 'stall' || it.kind === 'anvil') { const p = campProp(it.kind); if (!p) continue; hide(o); api.add(p, it.x, it.z, it.ry); grayCampStats.extra++; }
      else if (it.kind === 'torch') { hide(o); api.add(brazier(true), it.x, it.z); grayCampStats.extra++; }   // 北门传送阵两侧悬空火把 → 落地铁火盆（自带暖光，替原火把点光）
      else if (it.kind === 'banner') { if (realPole(o)) grayCampStats.extra++; }
      else if (it.kind === 'smallfire') {   // 艾拉的小篝火：Lux3D 石圈（缩小）+ shader 火舌，本体整组（含点光）藏掉
        const ring = campPiece('firering', { w: 1.8 }); if (!ring) continue;
        hide(o); api.add(ring, it.x, it.z, 1.1);
        const f = fireStack(0.68, true, hiQ ? 2.0 : 1.4); api.add(f, it.x, it.z); f.position.y += 0.12; grayCampStats.extra++;
      }
      else if (it.kind === 'mushroom') { hide(o); api.add(realMushrooms(), it.x, it.z, 0.6); grayCampStats.extra++; }
    } catch (e) { console.error('灰石营地剩余件换装出错', it.kind, e); }
  }
});
