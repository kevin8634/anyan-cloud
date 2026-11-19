// ======================================================================
// 11-18 Rhett「40 Raid……其他道路上的楼梯等素材进行调整和增加」：钟井主路的下坡段铺石阶
//   主路（WELL_ROUTE）石板路 / 冰窟段每段落差 ≥ 1 米的，在中间 85% 长度上铺一列宽阶（踏步高约 0.2 米，踏面随坡长 2–4 米），
//   两侧压一排条石路缘；踏面顶 = 踏面中心的地面 + 0.04 米（上坡端埋进地里、下坡端露出一个踏步，像台阶，又不改行走高度）。
//   冰窟段用冷色湿石。全部实例化（每种材质 1 次绘制）。?off=wellstairs 关。
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { WELL_ROUTE } from './well_terrain';
import { skip as wellPlatSkip } from './well_route_hd';
import { poolLight, lightPoolOn } from './well_lightpool';   // 11-18 点光源池

// 11-18 19:03 Rhett「钟井老 1 的木板还是没处理好，全是石头，之前是水面上的木板码头」：老一码头 (0,88)→(-24,96) 那段落差 1 米，
//   石阶从码头中间铺过去盖住了木甲板。首领台 / 码头圈（与路面带同一张 SKIP 表）里不铺石阶和路缘。?off=wellstairskip 回旧
const PLAT = (() => { try { return !/(?:[?&]off=[^&]*\bwellstairskip\b)/.test(location.search); } catch { return true; } })();
const OFF = (() => { try { return /(?:[?&]off=[^&]*\bwellstairs\b)/.test(location.search); } catch { return false; } })();
const HW: Record<string, number> = { path: 5, cave: 5.5 };
export const wellStairStats = { flights: 0, treads: 0, curbs: 0, lights: 0 };
// 11-18 20:01 Rhett「楼梯看不见，这里应该要有光照」：每级踏步前沿嵌一条暗幽兰发光边（看得清台阶轮廓），
//   每段楼梯中段上方挂一盏幽兰实时点光（最多 8 盏，低档不加点光只留发光边）。?off=wellstairlit 关
const LIT = (() => { try { return !/(?:[?&]off=[^&]*\bwellstairlit\b)/.test(location.search); } catch { return true; } })();
const STAIR_LAMP = 0x7fc8ff;

export function wellStairs(api: WildBuildApi) {
  if (OFF) return;
  type T = { x: number; y: number; z: number; ry: number; w: number; d: number };
  const nose: T[] = [], flightLights: [number, number, number][] = [];
  const lowQ = (() => { try { return JSON.parse(localStorage.getItem('darkrock_settings') ?? '{}').quality === 'low'; } catch { return false; } })();
  const tread: Record<'path' | 'cave', T[]> = { path: [], cave: [] }, curb: Record<'path' | 'cave', T[]> = { path: [], cave: [] };
  Object.assign(wellStairStats, { flights: 0, treads: 0, curbs: 0 });
  for (let i = 0; i < WELL_ROUTE.length - 1; i++) {
    const A = WELL_ROUTE[i], B = WELL_ROUTE[i + 1], k = B.k as 'path' | 'cave';
    if (k !== 'path' && k !== 'cave') continue;
    const dh = Math.abs(B.h - A.h); if (dh < 1) continue;
    const dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ry = Math.atan2(dx, dz);
    const n = Math.max(3, Math.round(dh / 0.2)), span = L * 0.85, d = span / n, w = HW[k] * 1.5;
    for (let s = 0; s < n; s++) {
      const t = (L - span) / 2 + d * (s + 0.5), x = A.p[0] + ux * t, z = A.p[1] + uz * t;
      if (PLAT && wellPlatSkip(x, z)) continue;
      tread[k].push({ x, y: api.groundY(x, z) + 0.04, z, ry, w: w * (0.96 + ((s * 37) % 7) * 0.012), d: d + 0.04 });
      if (LIT) { const dn = B.h < A.h ? 1 : -1, nxp = x + ux * dn * (d / 2), nzp = z + uz * dn * (d / 2); nose.push({ x: nxp, y: api.groundY(x, z) + 0.07, z: nzp, ry, w: w * 0.92, d: 0.07 }); }
      if (s % 2 === 0) for (const sd of [-1, 1]) { const cx = x + uz * sd * (w / 2 + 0.25), cz = z - ux * sd * (w / 2 + 0.25); curb[k].push({ x: cx, y: api.groundY(cx, cz) + 0.12, z: cz, ry, w: 0.45, d: d * 2 - 0.1 }); }
    }
    if (LIT) { const mx = (A.p[0] + B.p[0]) / 2, mz = (A.p[1] + B.p[1]) / 2; if (!(PLAT && wellPlatSkip(mx, mz))) flightLights.push([mx, mz, api.groundY(mx, mz)]); }
    wellStairStats.flights++;
  }
  const o = new THREE.Object3D();
  const inst = (list: T[], mat: THREE.Material, h: number) => {
    if (!list.length) return; const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, h, 1), mat, list.length);
    list.forEach((q, i) => { o.position.set(q.x, q.y - h / 2, q.z); o.rotation.set(0, q.ry, 0); o.scale.set(q.w, 1, q.d); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; mat.userData.outlineParameters = { visible: false };
    const holder = new THREE.Group(); holder.add(im); api.add(holder, 0, 0); holder.position.y -= api.groundY(0, 0);   // 实例自带高度
  };
  const stone = (c: number, r = 0.82) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.02 });
  // 11-18 23:14 Rhett 截图「蓝色细长条和灰色地板删掉」：石阶灰色踏步板不再放（坡道本身照常可走，栏边石保留）；?off=welltreaddel 回旧
  if (/(?:[?&]off=[^&]*\bwelltreaddel\b)/.test(location.search)) { inst(tread.path, stone(0x4a4a46), 0.3); inst(tread.cave, stone(0x52606a, 0.4), 0.3); }
  inst(curb.path, stone(0x34342f), 0.32); inst(curb.cave, stone(0x3e4a52, 0.45), 0.32);
  // 11-18 22:32 Rhett「把路上的蓝色长方形地砖移除」：踏步前沿的蓝色发光条（0x7fc8ff 长方条）不再放；?off=wellnosedel 回旧（照旧放）
  if (nose.length && /(?:[?&]off=[^&]*\bwellnosedel\b)/.test(location.search)) { const nm = new THREE.MeshBasicMaterial({ color: new THREE.Color(STAIR_LAMP).multiplyScalar(0.55), toneMapped: false }); inst(nose, nm, 0.06); }
  if (!lowQ) for (const [x, z, gy] of flightLights.slice(0, lightPoolOn() ? 64 : 8)) { const L = new THREE.PointLight(STAIR_LAMP, 9, 22, 1.3); const h = new THREE.Group(); L.position.y = 3.2; if (!poolLight(h, L)) h.add(L); api.add(h, x, z); h.position.y += gy - api.groundY(x, z); wellStairStats.lights++; }
  wellStairStats.treads = tread.path.length + tread.cave.length; wellStairStats.curbs = curb.path.length + curb.cave.length;
}
