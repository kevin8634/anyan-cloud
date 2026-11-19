// 11-07 #15 钟井 v2 余项：沉钟回廊砖拱 + 西崖折返栈道栏杆（Rhett 22:44「没积分了，用 GPT + 代码」，22:48 批 GPT 6 张）
//   贴图：assets_aholo/tex_tile/wa*（GPT 2048 → tools/well2/tex_make.py 出法线 / 粗糙度），UV 贴图，本文件自建材质（不改本体 tiletex）
//     wavous 拱墙整面（一跨一张）  wapillar 柱身（竖向无缝）  watrim 2×2 饰件图集（左上柱头 / 右上柱础 / 左下拱顶石 / 右下海蛇托石）
//     wadeck 栈板  wabeam 铆钉铁梁  warope 缆绳
//   回廊：主路「沉钟回廊」段（WELL_ROUTE 34…38，−34 → −46 米）外侧（靠井壁）一面拱墙 + 柱列；内侧（靠深渊）一排柱子 + 半圆拱券，柱头顶一道铁梁连起来
//   栈道：西崖折返栈道（WELL_ROUTE 3…10，+11 → +2 米）两侧可走边缘：铁立柱每 2.5 米、两道缆绳扶手、贴边铆钉铁梁、每 5 米一副悬臂铁托架
//   低画质不建；中档无托架 / 内侧拱券；全部合批（每种材质一个 draw call）
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WildBuildApi } from '../../core/ContentPacks';
import { TILE_TEX } from '../../web/assets.gen';
import { bossGlbEnsure, raidLazyHas, raidLazyGet } from './boss_glb';
import { quality } from './well_dock_hd';
import { WELL_ROUTE, wellSolid } from './well_terrain';
import { WELL_GEN2_TEX } from './well_gen2_tex';

type K = 'wavous' | 'wapillar' | 'watrim' | 'wadeck' | 'wabeam' | 'warope';
const KS: K[] = ['wavous', 'wapillar', 'watrim', 'wadeck', 'wabeam', 'warope'];
const texs = new Map<string, THREE.Texture>();
const waits: Promise<void>[] = [];
function tex(key: string, srgb: boolean): THREE.Texture | null {
  const hit = texs.get(key); if (hit) return hit;
  const inl = TILE_TEX[key], lazy = !inl && raidLazyHas('tex:' + key); if (!inl && !lazy) return null;
  const t = new THREE.Texture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const load = (url: string | undefined) => new Promise<void>(res => { if (!url) { console.warn('回廊贴图没有载入', key); return res(); }
    const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; res(); }; img.onerror = () => { console.warn('回廊贴图解码失败', key); res(); }; img.src = url; });
  // 11-07 比赛版 wa* 贴图在按需包 raid/*.js（与首领绑骨件同批加载）：材质先建，图到了再填
  if (typeof Image !== 'undefined') waits.push(inl ? load(inl) : bossGlbEnsure().then(() => load(raidLazyGet('tex:' + key))));
  texs.set(key, t); return t;
}
let ensureP: Promise<void> | null = null;
/** 进钟井前解码（与 wellTilesEnsure 一起调） */
export const wellArcadeEnsure = () => (ensureP ??= (KS.forEach(k => { tex(k + '_basecolor', true); tex(k + '_normal', false); tex(k + '_roughness', false); }), Promise.all(waits).then(() => undefined)));
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(k: K, o: THREE.MeshStandardMaterialParameters = {}, fb = 0x3a3e3a): THREE.MeshStandardMaterial {
  const id = k + JSON.stringify(o); const hit = mats.get(id); if (hit) return hit;
  const a = tex(k + '_basecolor', true), n = tex(k + '_normal', false), r = tex(k + '_roughness', false);
  const m = a && n && r ? new THREE.MeshStandardMaterial({ map: a, normalMap: n, roughnessMap: r, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2), ...o })
    : new THREE.MeshStandardMaterial({ color: fb, roughness: 0.9, ...o });
  mats.set(id, m); return m;
}
/** 把盒子某个面的 UV 映射到图集一格（q：0 左上 1 右上 2 左下 3 右下） */
function atlasBox(w: number, h: number, d: number, q: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute('uv') as THREE.BufferAttribute, u0 = (q % 2) * 0.5, v0 = q < 2 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + 0.02 + uv.getX(i) * 0.46, v0 + 0.02 + uv.getY(i) * 0.46);
  return g;
}
const scaleUV = (g: THREE.BufferGeometry, su: number, sv: number) => { const uv = g.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
};
/** 从 (x, z) 沿 (nx, nz) 往外找可走边缘（最多 9 米）；同 well_route_hd */
function edgeOut(x: number, z: number, nx: number, nz: number): number {
  for (let d = 0; d < 9; d += 0.25) if (wellSolid(x + nx * d, z + nz * d)) return Math.max(0, d - 0.15);
  return -1;
}
// 11-18 23:14 Rhett 截图「图二太乱，跟随布景升级一起调整」：回廊整理（RPG 场景搭建包第 7 章：轮廓少而清楚）——
//   坡段（相邻柱脚高差 > 0.6 米）不架连梁、不做拱券（原来梁按坡度斜着搭，跟楼梯交叉成乱线）；拱券只在平段；
//   外侧拱墙背后 2 米内没有井壁时不立（原来立成一块块悬空墙板）；?off=wellarcadetidy 回旧
const TIDY = !/(?:[?&]off=[^&]*\bwellarcadetidy\b)/.test(typeof location !== 'undefined' ? location.search : '');
// 11-18 opt1118C #8 wellarcade2（RPG 场景搭建包第 5 章：轮廓少而清楚、一个地方一种结构）：
//   ① 内侧条纹环拱（原 TorusGeometry 套柱身 wapillar 竖条纹贴图 → 远看是一圈圈条纹圆管）改石质拱券：半圆环形实体（拱腹 / 拱背 / 前后拱面），
//      前后拱面按极坐标把 gen2/arch.png 中间那道拱的楔石圈 + 铜钟拱顶石贴上去，拱腹 / 拱背用同图里的方石；
//   ② 柱距统一：原来每段路按 L / floor(L / 5.2) 均分（各段 4.6–5.9 米不等），改为每段从段首起固定 5.2 米一柱，段尾不足一跨的不立拱；
//   ③ 外侧拱墙贴井壁立：墙面放在柱后探到的井壁边缘（+0.15 米），柱子立在墙前 0.55 米；背后 8 米内没井壁的不立墙；
//   ④ 图二上方交叉长梁查来源：是本文件「柱头连梁」wabeam（铆钉铁梁贴图，远看像木梁）——梁按「下一根柱在同一外移距离」摆，实际下一根柱按自己的崖边外移，
//      梁头与柱错开；内侧高画质还整体抬高 step/2+0.3 架在环拱顶上；段与段拐角处前段末梁和后段首梁交叉。新版删掉连梁（拱券 / 拱墙本身就把柱连起来）。
//   ?off=wellarcade2 回旧（旧版仍受 ?off=wellarcadetidy 控制）
const ARC2 = !/(?:[?&]off=[^&]*\bwellarcade2\b)/.test(typeof location !== 'undefined' ? location.search : '');
let arc2M: { ring: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial } | null = null;
function arc2Mats() {
  if (arc2M) return arc2M;
  const ld = new THREE.TextureLoader(), t = (k: string, rep: boolean) => { const x = ld.load(WELL_GEN2_TEX[k]); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; if (rep) x.wrapS = x.wrapT = THREE.RepeatWrapping; return x; };
  const ring = t('archring', false), stone = t('archstone', true);
  return (arc2M = { ring: new THREE.MeshStandardMaterial({ map: ring, bumpMap: ring, bumpScale: 2.5, roughness: 0.92, color: 0xd8d4cc }),
    stone: new THREE.MeshStandardMaterial({ map: stone, bumpMap: stone, bumpScale: 2.5, roughness: 0.92, color: 0xd8d4cc }) });
}
/** 石拱券：半圆环实体，局部 x 沿跨度、y 向上、z 为墙厚方向；起拱点在 y=0。返回 [前后拱面, 拱腹 + 拱背] 两份几何 */
function voussoirArch(ri: number, ro: number, depth: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const N = 24, CX = 514 / 1024, CY = 1 - 456 / 1024, RI = 197 / 1024, RO = 300 / 1024;   // arch.png 中间拱：拱心 (514, 456) px，内径 197 px，外径 300 px
  const fp: number[] = [], fu: number[] = [], fi: number[] = [], sp: number[] = [], su: number[] = [], si: number[] = [];
  for (const f of [1, -1]) {   // 前（+z）/ 后（−z）
    const b = fp.length / 3;
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI, c = Math.cos(a), sn = Math.sin(a);
      for (const [r, R] of [[ri, RI], [ro, RO]] as const) { fp.push(c * r, sn * r, f * depth / 2); fu.push(CX + c * R * f, CY + sn * R); } }
    for (let i = 0; i < N; i++) { const a0 = b + i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; f > 0 ? fi.push(a0, b0, a1, a1, b0, b1) : fi.push(a0, a1, b0, a1, b1, b0); }
  }
  for (const [r, out] of [[ri, -1], [ro, 1]] as const) {   // 拱腹（朝下 / 朝心）、拱背（朝外）
    const b = sp.length / 3, L = Math.PI * r;
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI, c = Math.cos(a), sn = Math.sin(a);
      for (const zz of [-1, 1]) { sp.push(c * r, sn * r, zz * depth / 2); su.push(i / N * L / 1.4, (zz + 1) / 2 * depth / 1.4); } }
    for (let i = 0; i < N; i++) { const a0 = b + i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3; out > 0 ? si.push(a0, a1, b0, a1, b1, b0) : si.push(a0, b0, a1, a1, b0, b1); }
  }
  const mk = (p: number[], u: number[], i: number[]) => { for (let k = 0; k < i.length; k += 3) { const t = i[k + 1]; i[k + 1] = i[k + 2]; i[k + 2] = t; }   // 上面按顺时针写的，统一翻成逆时针（正面朝外）
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(i); g.computeVertexNormals(); return g.toNonIndexed(); };
  return [mk(fp, fu, fi), mk(sp, su, si)];
}
const ARCADE = [34, 38], BOARD = [3, 10];   // WELL_ROUTE 段号范围（段 i = 节点 i → i+1）
const SKIP: [number, number, number][] = [[0, 96, 24], [-90, 6, 16], [96, -70, 4]];
const skip = (x: number, z: number) => SKIP.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r);

export function wellArcadeHd(api: WildBuildApi) {
  const q = quality(); if (q === 'low') return { arcade: 0, rail: 0 };
  const hi = q === 'high' || q === 'ultra';
  const Y = (x: number, z: number) => api.groundY(x, z);
  const B = new Map<string, { k: K; o: THREE.MeshStandardMaterialParameters; g: THREE.BufferGeometry[] }>();
  const put = (k: K, g: THREE.BufferGeometry, o: THREE.MeshStandardMaterialParameters = {}) => { const id = k + JSON.stringify(o); (B.get(id) ?? B.set(id, { k, o, g: [] }).get(id)!).g.push(g.index ? g.toNonIndexed() : g); };
  let bays = 0, posts = 0;
  // ---------------- 沉钟回廊 ----------------
  const BAY = 5.2, WH = 6.2, COLH = 4.6;
  const arcs: THREE.BufferGeometry[] = [], arcS: THREE.BufferGeometry[] = [];
  if (ARC2) {
    type Post = { x: number; z: number; y: number; wall: number };   // wall：墙面外移距离（−1 = 背后无井壁）
    for (let i = ARCADE[0]; i <= ARCADE[1]; i++) {
      const A = WELL_ROUTE[i].p, C = WELL_ROUTE[i + 1].p, dx = C[0] - A[0], dz = C[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L;
      let nx = -tz, nz = tx; const mx = (A[0] + C[0]) / 2, mz = (A[1] + C[1]) / 2;
      if ((mx + nx) ** 2 + (mz + nz) ** 2 < mx * mx + mz * mz) { nx = -nx; nz = -nz; }   // n 指向井壁（外侧）
      const ry = Math.atan2(-tz, tx), n = Math.floor(L / BAY + 1e-3);
      let prevO: Post | null = null, prevI: Post | null = null;
      for (let s = 0; s <= n; s++) {
        const cx = A[0] + tx * BAY * s, cz = A[1] + tz * BAY * s; if (skip(cx, cz)) { prevO = prevI = null; continue; }
        const yc = Y(cx, cz);
        // 外侧：探井壁；有墙 → 柱立墙前 0.55 米；无墙 → 柱按原规则外移，不立墙
        const eo = edgeOut(cx, cz, nx, nz), hasW = eo >= 0 && eo <= 8 && wellSolid(cx + nx * (eo + 0.6), cz + nz * (eo + 0.6));
        const dO = hasW ? Math.max(2.6, eo - 0.55) : Math.max(3.2, Math.min(eo < 0 ? 5 : eo, 6.5)) - 0.4;
        const po: Post = { x: cx + nx * dO, z: cz + nz * dO, y: yc, wall: hasW ? eo + 0.15 : -1 };
        const ei = edgeOut(cx, cz, -nx, -nz), dI = Math.max(3.2, Math.min(ei < 0 ? 5 : ei, 6.5)) - 0.4;
        const pi: Post | null = hi ? { x: cx - nx * dI, z: cz - nz * dI, y: yc, wall: -1 } : null;
        for (const p of pi ? [po, pi] : [po]) {
          put('watrim', place(atlasBox(1.25, 0.7, 1.25, 1), p.x, p.y + 0.35, p.z, ry));
          put('wapillar', place(scaleUV(new THREE.CylinderGeometry(0.42, 0.48, COLH - 1.4, 16, 1, true), 2, 1.6), p.x, p.y + 0.7 + (COLH - 1.4) / 2, p.z, ry));
          put('watrim', place(atlasBox(1.35, 0.7, 1.35, 0), p.x, p.y + COLH - 0.35, p.z, ry));
        }
        // 外侧拱墙：两柱都背靠井壁、平段（高差 ≤ 0.6）才立；墙面贴井壁
        if (prevO && prevO.wall > 0 && po.wall > 0 && Math.abs(po.y - prevO.y) <= 0.6) {
          const ym = Math.min(po.y, prevO.y), wd = (po.wall + prevO.wall) / 2, xm = cx - tx * BAY / 2, zm = cz - tz * BAY / 2;
          const wall = new THREE.PlaneGeometry(BAY, WH + 1); place(wall, xm + nx * wd, ym + (WH + 1) / 2 - 1, zm + nz * wd, Math.atan2(-nx, -nz));
          put('wavous', wall, { side: THREE.DoubleSide });
          put('watrim', place(atlasBox(1.1, 1.1, 0.35, 2), xm + nx * (wd - 0.2), ym + WH * 0.62, zm + nz * (wd - 0.2), Math.atan2(-nx, -nz)));
          bays++;
        }
        // 内侧石拱券：架在两根实际柱头之间（平段），拱券轴线 = 两柱连线
        if (pi && prevI && Math.abs(pi.y - prevI.y) <= 0.6) {
          const sx = pi.x - prevI.x, sz = pi.z - prevI.z, span = Math.hypot(sx, sz), ri = span / 2 - 0.5, ro = ri + 0.72;
          if (ri > 1) { const [f, sd] = voussoirArch(ri, ro, 0.62), m = new THREE.Matrix4().compose(new THREE.Vector3((pi.x + prevI.x) / 2, Math.min(pi.y, prevI.y) + COLH, (pi.z + prevI.z) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-sz, sx), 0)), new THREE.Vector3(1, 1, 1));
            arcs.push(f.applyMatrix4(m)); arcS.push(sd.applyMatrix4(m)); }
        }
        prevO = po; prevI = pi;
      }
    }
  }
  if (!ARC2) for (let i = ARCADE[0]; i <= ARCADE[1]; i++) {
    const A = WELL_ROUTE[i].p, C = WELL_ROUTE[i + 1].p, dx = C[0] - A[0], dz = C[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L;
    let nx = -tz, nz = tx; const mx = (A[0] + C[0]) / 2, mz = (A[1] + C[1]) / 2;
    if ((mx + nx) ** 2 + (mz + nz) ** 2 < mx * mx + mz * mz) { nx = -nx; nz = -nz; }   // n 指向井壁（外侧）
    const ry = Math.atan2(-tz, tx);   // 盒子 x 轴沿路（绕 Y 转 θ：x → (cosθ, −sinθ)）
    const n = Math.max(1, Math.floor(L / BAY)), step = L / n;
    for (let s = 0; s <= n; s++) {
      const cx = A[0] + tx * step * s, cz = A[1] + tz * step * s; if (skip(cx, cz)) continue;
      for (const side of [1, -1]) {
        const e = edgeOut(cx, cz, nx * side, nz * side), d = Math.max(3.2, Math.min(e < 0 ? 5 : e, 6.5)) - 0.4, x = cx + nx * side * d, z = cz + nz * side * d, y = Y(cx, cz);
        if (side < 0 && !hi) continue;
        // 柱：柱础 + 柱身 + 柱头
        put('watrim', place(atlasBox(1.25, 0.7, 1.25, 1), x, y + 0.35, z, ry));
        put('wapillar', place(scaleUV(new THREE.CylinderGeometry(0.42, 0.48, COLH - 1.4, 16, 1, true), 2, 1.6), x, y + 0.7 + (COLH - 1.4) / 2, z, ry));
        put('watrim', place(atlasBox(1.35, 0.7, 1.35, 0), x, y + COLH - 0.35, z, ry));
        if (s < n) {
          const x2 = x + tx * step, z2 = z + tz * step, y2 = Y(cx + tx * step, cz + tz * step), ym = Math.min(y, y2), xm = (x + x2) / 2, zm = (z + z2) / 2;
          const slope = TIDY && Math.abs(y2 - y) > 0.6;
          if (side > 0 && TIDY && (slope || !wellSolid(xm + nx * 2, zm + nz * 2))) { /* 整理：坡段 / 背后无井壁不立墙 */ }
          else if (side < 0 && slope) { /* 整理：坡段不做拱券 */ }
          else if (side > 0) {
            // 外侧拱墙：一跨一张整图（拱 + 砖），立在柱子后 0.9 米；墙下沿埋进地 1 米防坡度露缝
            const wall = new THREE.PlaneGeometry(step, WH + 1); place(wall, xm + nx * 0.9, ym + (WH + 1) / 2 - 1, zm + nz * 0.9, Math.atan2(-nx, -nz));
            put('wavous', wall, { side: THREE.DoubleSide });
            // 拱顶石（图集左下）贴在跨中拱心上方
            put('watrim', place(atlasBox(1.1, 1.1, 0.35, 2), xm + nx * 0.7, ym + WH * 0.62, zm + nz * 0.7, Math.atan2(-nx, -nz)));
            bays++;
          } else {
            // 内侧半圆拱券：柱头之间（拱券截面 0.7×0.5）
            const arc = new THREE.TorusGeometry(step / 2, 0.32, 6, 20, Math.PI); scaleUV(arc, 1.5, 3);
            const m = new THREE.Matrix4().makeRotationY(Math.atan2(-tz, tx)); arc.applyMatrix4(m); arc.translate(xm, ym + COLH, zm);
            put('wapillar', arc);
          }
          // 柱头连梁（铆钉铁梁）
          if (!slope) { const beam = new THREE.BoxGeometry(step, 0.42, 0.36); scaleUV(beam, step / 3, 1);
          put('wabeam', place(beam, xm, (y + y2) / 2 + COLH + (side < 0 && hi ? step / 2 + 0.3 : 0.2), zm, ry, 0, Math.atan2(y2 - y, step)), { metalness: 0.55 }); }
        }
      }
      // 海蛇托石：外墙每两跨一只，挂一盏灯的位置
      if (s % 2 === 1) { const e = Math.max(3.2, Math.min(edgeOut(cx, cz, nx, nz) < 0 ? 5 : edgeOut(cx, cz, nx, nz), 6.5)) - 0.4 + 0.5;
        put('watrim', place(atlasBox(0.9, 1.2, 1.0, 3), cx + nx * e, Y(cx, cz) + 3.2, cz + nz * e, Math.atan2(-nx, -nz))); }
    }
  }
  // ---------------- 西崖折返栈道：栏杆 ----------------
  for (let i = BOARD[0]; i <= BOARD[1]; i++) {
    const A = WELL_ROUTE[i].p, C = WELL_ROUTE[i + 1].p, dx = C[0] - A[0], dz = C[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
    const ry = Math.atan2(-tz, tx);
    for (const side of [1, -1]) {
      let prev: [number, number, number] | null = null, k = 0;
      for (let s = 0.8; s < L - 0.8; s += 2.5, k++) {
        const cx = A[0] + tx * s, cz = A[1] + tz * s; if (skip(cx, cz)) { prev = null; continue; }
        const e = edgeOut(cx, cz, nx * side, nz * side); if (e < 0) { prev = null; continue; }
        const x = cx + nx * side * Math.max(0, e - 0.25), z = cz + nz * side * Math.max(0, e - 0.25), y = Y(x, z);
        if (wellSolid(x + nx * side * 1.5, z + nz * side * 1.5) === false && e > 7.5) { prev = null; continue; }   // 太宽的平台中间不立
        put('wabeam', place(scaleUV(new THREE.BoxGeometry(0.16, 1.25, 0.16), 0.15, 1), x, y + 0.62, z, ry), { metalness: 0.55 });
        posts++;
        if (prev) {
          const [px, py, pz] = prev, ddx = x - px, ddz = z - pz, dy = y - py, len = Math.hypot(ddx, ddz, dy);
          for (const h of [0.62, 1.12]) {   // 两道缆绳（中间下垂 8 厘米，分两节）
            for (const [a, b] of [[0, 0.5], [0.5, 1]] as const) {
              const sag = (t: number) => -Math.sin(t * Math.PI) * 0.08;
              const p0 = new THREE.Vector3(px + ddx * a, py + dy * a + h + sag(a), pz + ddz * a), p1 = new THREE.Vector3(px + ddx * b, py + dy * b + h + sag(b), pz + ddz * b), dv = p1.clone().sub(p0);
              const g = scaleUV(new THREE.CylinderGeometry(0.045, 0.045, dv.length(), 6, 1, true), 1, dv.length() * 2);
              g.applyMatrix4(new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize()), new THREE.Vector3(1, 1, 1)));
              put('warope', g);
            }
          }
          // 贴边铆钉铁梁（路面外沿竖面，0.45 米高，一半埋进路面下）
          const bm = new THREE.BoxGeometry(Math.hypot(ddx, ddz), 0.45, 0.12); scaleUV(bm, len / 3, 1);
          put('wabeam', place(bm, (x + px) / 2 + nx * side * 0.1, (y + py) / 2 - 0.1, (z + pz) / 2 + nz * side * 0.1, ry, 0, Math.atan2(dy, Math.hypot(ddx, ddz))), { metalness: 0.55 });
        }
        // 悬臂托架：每两根立柱一副（斜撑 + 横担），伸到崖外
        if (hi && k % 2 === 0) {
          const ox = x + nx * side * 0.6, oz = z + nz * side * 0.6;
          put('wabeam', place(scaleUV(new THREE.BoxGeometry(0.14, 0.14, 1.4), 0.2, 0.5), ox, y - 0.32, oz, Math.atan2(nx * side, nz * side)), { metalness: 0.55 });
          put('wabeam', place(scaleUV(new THREE.BoxGeometry(0.12, 1.5, 0.12), 0.15, 0.6), ox - nx * side * 0.05, y - 0.9, oz - nz * side * 0.05, Math.atan2(nx * side, nz * side), 0.7), { metalness: 0.55 });
        }
        prev = [x, y, z];
      }
    }
  }
  // 栈道最陡的两段（+8.5 → +5.5）路面换湿木栈板：铺一条 2.4 米宽的木板带压在石板路中线上
  for (const i of [5, 6]) {
    const A = WELL_ROUTE[i].p, C = WELL_ROUTE[i + 1].p, dx = C[0] - A[0], dz = C[1] - A[1], L = Math.hypot(dx, dz), tx = dx / L, tz = dz / L, nx = -tz, nz = tx, n = Math.ceil(L / 1.2), W = 1.2;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let s = 0; s <= n; s++) { const t = s / n, cx = A[0] + dx * t, cz = A[1] + dz * t;
      for (const c of [-1, 1]) { const x = cx + nx * c * W, z = cz + nz * c * W; pos.push(x, Y(x, z) + 0.03, z); uv.push((c + 1) / 2, t * L / 2.4); }
      if (s > 0) { const b = s * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // 木纹横向：把 UV 转 90 度（贴图里木板是横的，要垂直于走向）
    const u = g.getAttribute('uv') as THREE.BufferAttribute; for (let j = 0; j < u.count; j++) { const a = u.getX(j), b = u.getY(j); u.setXY(j, b, a); }
    put('wadeck', g, { side: THREE.DoubleSide });
  }
  const FB: Record<K, number> = { wavous: 0x3a4440, wapillar: 0x4a504a, watrim: 0x445048, wadeck: 0x3a2c20, wabeam: 0x4a3426, warope: 0x3a2c1e };
  let draws = 0;
  for (const { k, o, g } of B.values()) {
    for (const x of g) if (!x.getAttribute('normal')) x.computeVertexNormals();
    const mg = mergeGeometries(g); if (!mg) continue;
    const me = new THREE.Mesh(mg, mat(k, o, FB[k])); me.castShadow = k !== 'warope'; me.receiveShadow = true; me.frustumCulled = false;
    me.position.set(0, -api.groundY(0, 0), 0); api.add(me, 0, 0); draws++;
  }
  if (arcs.length) { const M = arc2Mats();
    for (const [gs, m] of [[arcs, M.ring], [arcS, M.stone]] as const) { const mg = mergeGeometries(gs); if (!mg) continue; const me = new THREE.Mesh(mg, m); me.castShadow = me.receiveShadow = true; me.frustumCulled = false; me.position.set(0, -api.groundY(0, 0), 0); api.add(me, 0, 0); draws++; } }
  return { arcade: bays, rail: posts, draws };
}
