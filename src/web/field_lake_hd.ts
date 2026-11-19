// 11-19 落霞湖 qllake（Rhett「可以，地图扩大，弄一片湖出来。技能包都有你利用好来构建」）
// 湖面网格 + 南岸木栈桥 + 岸石。水面材质 = 本体河同一套秋林逆光 r8 waterMat（cine.ts qlLakeMaterial：GGX + 闪烁格 ×1.6 + 镜面 RT + RGB 吸收 + 岸沫），
// 用到的专长包条目：第 6 步（滚动法线、菲涅耳天光、太阳碎闪）、第 37/95 步（镜面倒影竖向拉长）、第 96 步（闪烁格 = 波光粼粼）、第 98 步 c（树影不落湖）、r8 bedDepth（离岸 HW 8 米）。
// 湖关（?off=qllake）时本文件不被调用。
import * as THREE from 'three';
import { LAKE, LAKE_DOCK, lakeDist, lakeShore } from '../data/field_lake';
import { CINE, SS_ON, qlLakeMaterial } from './cine';
import { QL } from './ql_water_flags';
import { waterMaterial } from './textures';
import { makeBridge, makeRock, noOutline } from './models';

/** 湖面：极坐标网格（48 方向 × 18 圈，外圈伸到岸外 1.2 米压在地形下），顶点属性 aShore = 离岸距离（米，湖里为正） */
function lakeSurface(origin: { x: number; z: number }) {
  const NA = 96, NR = 22, pos: number[] = [], uv: number[] = [], sh: number[] = [], idx: number[] = [];
  pos.push(LAKE.cx, 0, LAKE.cz); uv.push(0.5, 0.5); sh.push(lakeDist(LAKE.cx, LAKE.cz));
  for (let j = 1; j <= NR; j++) {
    const f = Math.pow(j / NR, 0.75);   // 外圈加密（岸线附近深度变化快）
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2, [ex, ez] = lakeShore(a, 1.2);
      const x = LAKE.cx + (ex - LAKE.cx) * f, z = LAKE.cz + (ez - LAKE.cz) * f;
      pos.push(x, 0, z); uv.push((x - LAKE.cx) / (LAKE.rx * 2.4) + 0.5, (z - LAKE.cz) / (LAKE.rz * 2.4) + 0.5); sh.push(lakeDist(x, z));
    }
  }
  for (let i = 0; i < NA; i++) idx.push(0, 1 + ((i + 1) % NA), 1 + i);
  for (let j = 1; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = 1 + (j - 1) * NA + i, b = 1 + (j - 1) * NA + ((i + 1) % NA), c = a + NA, d = b + NA;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aShore', new THREE.Float32BufferAttribute(sh, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const hd = CINE.on[6] && SS_ON && QL.river;
  const mat = hd ? qlLakeMaterial() : waterMaterial(0x6aa0b8, 0.85);
  const m = new THREE.Mesh(g, mat); m.name = 'fieldLake';
  m.position.set(origin.x, -0.12, origin.z);   // 与苇河同一水面高度（镜面 RT 同一平面）
  (m.material as THREE.Material).userData.noBake = true;
  m.renderOrder = 1;
  return noOutline(m);
}

/** 湖 + 栈桥 + 岸石；groundY = 世界坐标地面高度 */
export function buildFieldLake(origin: { x: number; z: number }, groundY: (x: number, z: number) => number) {
  const G = new THREE.Group(); G.name = 'fieldLakeHd';
  G.add(lakeSurface(origin));
  // 南岸木栈桥：伸进湖 9 米，面北（正对秋林逆光的低太阳 → 站在桥头看日光路上的碎闪）
  const len = LAKE_DOCK.z1 - LAKE_DOCK.z0, dock = makeBridge(len, LAKE_DOCK.w);
  dock.position.set(origin.x + LAKE_DOCK.x, 0.02, origin.z + (LAKE_DOCK.z0 + LAKE_DOCK.z1) / 2); dock.name = 'lakeDock';
  G.add(dock);
  // 岸石：沿岸线稀疏摆（栈桥两侧 5 米留空），半埋
  let sd = 4243; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, [x, z] = lakeShore(a, -0.4 + R() * 1.6);
    if (Math.abs(x - LAKE_DOCK.x) < 5 && z > LAKE_DOCK.z0) continue;
    const r = makeRock(0.5 + R() * 0.9, 0x8a8478); r.scale.y = 0.45 + R() * 0.3; r.rotation.y = R() * 6;
    r.position.set(origin.x + x, groundY(origin.x + x, origin.z + z) - 0.15, origin.z + z); G.add(r);
  }
  return G;
}
