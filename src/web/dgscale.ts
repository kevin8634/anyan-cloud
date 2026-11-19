// 11-18 副本整体放大 1.5 倍（Rhett 11-18：参考魔兽世界副本尺度；墙 / 柱 / 门 / 地面布局 / 摆件 / 灯 + 副本里的怪物与首领一起放大，玩家不放大）
// 范围：营地副本区两个普通副本（暗岩矿洞 / 腐沼神殿，scenes.ts + main.ts LAYOUTS）+ raid.ts 的全部副本（两座长副本、三座三首领普通副本、暗岩深渊）。
//   不含：内容包小副本（packdungeon，场地是一张野外图）、DLC 潮渊钟井（src/dlc，本体不 import）。
// 做法：副本里所有布局数据仍按「设计坐标」写（原来的数字一个不改），在设计坐标 ↔ 世界坐标的边界上乘 / 除 DUNGEON_SCALE：
//   · 场景：整组（营地副本）或逐个摆件（raid.ts 的 add）连同几何一起放大，位置按副本原点放大；
//     平铺贴图（map.wrapS = Repeat、按 UV 平铺）把几何 UV 同比放大 → 纹素密度不变；地面 splat / 熔岩是世界坐标采样，本来就不拉伸；
//     点光照距 × S、亮度 × S^decay（光源到墙面的距离都变成 1.5 倍，照度按衰减补回来）。
//   · 玩法：可走区域 / 门 / 首领场地半径 / 刷怪点 / 寻路网格 / 掉落点 / 小地图都在设计坐标里算（世界坐标 ÷ S 进、× S 出），
//     玩家碰撞半径换算到设计坐标时 ÷ S（玩家不放大）；雾距 × S。
//   · 怪物：副本里（zone = dungeon / raid）的怪模型 × S（碰撞 / 选中 / 互推半径都跟 rig.scale 走）、近战距离 / 仇恨 / 拴绳 × S，伤害、血量、移速不改；
//     玩家打它们的贴身余量 × S（体型变大，贴身就能打到）。首领技能红圈半径不改（按玩家走位调的）。
// ?off=dgscale（或 localStorage darkrock_cine_off 含 dgscale）：S = 1，全部回原尺寸。
import * as THREE from 'three';
import { MAPS, MAP_LINKS, AREAS, MAP_ORIGIN } from '../data/world_map';

export const DGSCALE_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('dgscale'); } catch { return false; } })();
/** 副本尺度（?off=dgscale → 1） */
export const DUNGEON_SCALE = DGSCALE_OFF ? 1 : 1.5;
/** 这个区域的怪 / 场景按副本尺度放大吗（营地副本区普通副本 = 'dungeon'，raid.ts 全部 = 'raid'） */
export const dgZone = (z: string) => DUNGEON_SCALE !== 1 && (z === 'dungeon' || z === 'raid');

/** 设计坐标（相对副本原点 O）→ 世界坐标 */
export const dgW = (O: { x: number; z: number }, lx: number, lz: number) => ({ x: O.x + lx * DUNGEON_SCALE, z: O.z + lz * DUNGEON_SCALE });
/** 世界坐标 → 设计坐标（相对副本原点 O） */
export const dgL = (O: { x: number; z: number }, x: number, z: number) => ({ x: (x - O.x) / DUNGEON_SCALE, z: (z - O.z) / DUNGEON_SCALE });
/** 原来按世界坐标写死的设计点（O + 偏移）→ 放大后的世界点 */
export const dgV = (O: THREE.Vector3, v: THREE.Vector3) => new THREE.Vector3(O.x + (v.x - O.x) * DUNGEON_SCALE, v.y * DUNGEON_SCALE, O.z + (v.z - O.z) * DUNGEON_SCALE);

const uvDone = new WeakSet<THREE.BufferGeometry>();
const lightDone = new WeakSet<THREE.Light>();
/** 平铺贴图：Repeat 包裹且确实在平铺（repeat > 1，或是三平面石 / 岩 / 泥这类无缝材质）；箱子 / 木桶这类一面一张的贴图跟着几何一起放大，不重复 */
const repeatMap = (m: THREE.Material | undefined) => { const t = (m as THREE.MeshStandardMaterial | undefined)?.map; return !!t && t.wrapS === THREE.RepeatWrapping && (t.repeat.x > 1.01 || t.repeat.y > 1.01 || !!m!.userData?.cineTri); };
/** 已经整体放大 s 倍的物体：平铺贴图 UV 同比放大（几何先复制，不动共享几何）、点光 / 聚光照距和亮度补回。重复调用不叠加。 */
export function dgFixScaled(root: THREE.Object3D, s = DUNGEON_SCALE) {
  if (s === 1) return;
  root.traverse(o => {
    const L = o as THREE.PointLight;
    if ((L.isPointLight || (o as THREE.SpotLight).isSpotLight) && !lightDone.has(L)) {
      lightDone.add(L);
      if (L.distance > 0) L.distance *= s;
      L.intensity *= Math.pow(s, L.decay ?? 2);
      if (L.userData.base !== undefined) L.userData.base *= Math.pow(s, L.decay ?? 2);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!mats.some(repeatMap)) return;
    if (uvDone.has(m.geometry)) return;
    const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
    if (!uv) return;
    const g = m.geometry.clone(); const u = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * s, u.getY(i) * s);
    u.needsUpdate = true; uvDone.add(g); m.geometry = g;
  });
}
/** 整组放大：组里的东西都按世界坐标摆在原点 O 附近 → 组绕 O 放大 s 倍（位置 + 几何），再修贴图 / 灯 */
export function dgScaleGroup(g: THREE.Object3D, O: { x: number; z: number }, s = DUNGEON_SCALE) {
  if (s === 1) return;
  g.scale.setScalar(s); g.position.set(O.x * (1 - s), 0, O.z * (1 - s));
  g.updateMatrixWorld(true);
  dgFixScaled(g, s);
}

// ---- 营地副本区两个普通副本的地图数据（世界坐标写死在 data/world_map.ts）：区域详图视框、出口连线、探索 / 通关区域圈 → 绕副本原点放大
//   只改这两张图的条目，模块加载时执行一次（?off=dgscale 不执行）
const DG_MAPS = ['darkrock_mine', 'rotting_temple'] as const;
if (DUNGEON_SCALE !== 1) {
  const S = DUNGEON_SCALE;
  for (const id of DG_MAPS) {
    const O = MAP_ORIGIN[id], m = MAPS[id];
    if (m) m.view = { x0: O.x + (m.view.x0 - O.x) * S, z0: O.z + (m.view.z0 - O.z) * S, x1: O.x + (m.view.x1 - O.x) * S, z1: O.z + (m.view.z1 - O.z) * S };
    for (const l of MAP_LINKS) if (l.from === id) { l.x = O.x + (l.x - O.x) * S; l.z = O.z + (l.z - O.z) * S; }
    for (const a of Object.values(AREAS)) if (a.map === id) { a.x = O.x + (a.x - O.x) * S; a.z = O.z + (a.z - O.z) * S; if (a.r !== undefined) a.r *= S; }
  }
}
