// ======================================================================
// DLC1 沉钟海岸 · 11-18 B7 巡航船 + 船尾浪（Rhett 16:36：做巡航船尾浪，不做涉水 / 游泳判定）
//   一艘双桅帆船在东岸外海沿跑道形航线巡航（局部 x 150–180、z ±70，转弯半径 15 m，5.5 m/s，一圈约 75 秒），离码头尽头约 20 m。
//   船尾浪全在海面片元里画（coast_sea SEA_FS2 wakeF）：船尾每走 4 m 记一个点，16 个点连成折线 → 中线翻滚白沫 + 开尔文 19.5° 两道斜浪 + 浪间横纹；
//   船身两侧推浪、船头溅水（海面飞溅粒子，镜头 80 m 内）。船身随浪起伏、转弯侧倾。纯程序化几何，无贴图、无新加载。
//   ?off=shipwake 关（不建船、海面不画尾浪）。思路：水体水花专题第 91–111 步（开尔文尾迹 / 船首波），代码自写。
// ======================================================================
import * as THREE from 'three';
import { SEA_Y } from './coast_layout';
import { seaU, seaSprayAt } from './coast_sea';
import { buildShipV2, type ShipV2 } from './coast_ship_v2';

const offHas = (k: string) => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes(k); } catch { return false; } };
/** 11-19 船 v2（coast_ship_v2.ts：木板纹船体 + 吃水线、舷墙栏杆、船尾楼 / 艏楼、两桅三层横帆 + 两面三角帆、索具、旗）；?off=shipv2 回 v1 船 */
const SHIP_V2 = !offHas('shipv2');
export const SHIP_OFF = (() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('shipwake'); } catch { return false; } })();

// ---------------------------------------------------------------- 航线（跑道形，逆时针：西直线向北 → 北弯 → 东直线向南 → 南弯）
// 11-18 19:59 Rhett「灯塔这边不要船，放到地图左侧的远海」：航线从东岸灯塔外（x 150–180）挪到西侧远海（x −200 ~ −170，离西岸线 ≥ 45 m，避开半沉钟楼 −146,−112）；?off=shipwest 回东岸
const WEST = !(() => { try { const q = new URLSearchParams(location.search).get('off') ?? '', ls = localStorage.getItem('darkrock_cine_off') ?? ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('shipwest'); } catch { return false; } })();
const X1 = WEST ? -200 : 150, X2 = WEST ? -170 : 180, ZN = 70, ZS = -70, R = (X2 - X1) / 2, CX = (X1 + X2) / 2;
const LS = ZN - ZS, LC = Math.PI * R, LOOP = 2 * LS + 2 * LC;
const SPEED = 5.5, SHIP_L = 16;
/** 航线上距离 s 处的位置与朝向（局部） */
function pathAt(s: number): { x: number; z: number; fx: number; fz: number } {
  s = ((s % LOOP) + LOOP) % LOOP;
  if (s < LS) return { x: X1, z: ZS + s, fx: 0, fz: 1 };
  s -= LS;
  if (s < LC) { const a = Math.PI - s / R; return { x: CX + R * Math.cos(a), z: ZN + R * Math.sin(a), fx: Math.sin(a), fz: -Math.cos(a) }; }
  s -= LC;
  if (s < LS) return { x: X2, z: ZN - s, fx: 0, fz: -1 };
  s -= LS;
  const a = -s / R; return { x: CX + R * Math.cos(a), z: ZS + R * Math.sin(a), fx: Math.sin(a), fz: -Math.cos(a) };
}

// ---------------------------------------------------------------- 船体（局部：原点 = 船尾水线中点，+Z 朝船头）
function hullGeo(L: number, B: number): THREE.BufferGeometry {
  const NU = 24, sec = (u: number) => {
    const hb = B * 0.5 * Math.max(0.03, u < 0.4 ? 0.84 + 0.16 * u / 0.4 : Math.sqrt(Math.max(0, 1 - ((u - 0.4) / 0.62) ** 2)));
    const dh = 1.1 + 0.9 * u * u + (u < 0.15 ? 0.5 * (1 - u / 0.15) : 0);   // 船舷高：船头翘、船尾楼高
    const kd = -1.25 * (u > 0.85 ? 0.35 + 0.65 * (1 - u) / 0.15 : 1);
    return [[-hb, dh], [-hb * 0.97, 0.3], [-hb * 0.8, -0.35], [-hb * 0.42, kd * 0.85], [0, kd], [hb * 0.42, kd * 0.85], [hb * 0.8, -0.35], [hb * 0.97, 0.3], [hb, dh]] as [number, number][];
  };
  const NV = 9, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cWood = new THREE.Color(0x4a3020), cBot = new THREE.Color(0x2a1612), cBand = new THREE.Color(0x8a6a3a);
  const push = (x: number, y: number, z: number, c: THREE.Color) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  for (let i = 0; i <= NU; i++) { const u = i / NU, S = sec(u); for (const [x, y] of S) { const dh = S[0][1]; push(x, y, u * L, y < 0.05 ? cBot : y > dh - 0.25 ? cBand : cWood); } }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV - 1; j++) { const a = i * NV + j, b = a + NV; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // 船尾板
  const base = pos.length / 3; const S0 = sec(0); for (const [x, y] of S0) push(x, y, 0, cWood);
  for (let j = 1; j < NV - 1; j++) idx.push(base, base + j + 1, base + j);
  // 甲板
  const cDeck = new THREE.Color(0x7a5a38), d0 = pos.length / 3;
  for (let i = 0; i <= NU; i++) { const u = i / NU, S = sec(u), y = S[0][1] - 0.18; push(S[0][0] * 0.96, y, u * L, cDeck); push(S[NV - 1][0] * 0.96, y, u * L, cDeck); }
  for (let i = 0; i < NU; i++) { const a = d0 + i * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** 鼓风的帆（宽 w、高 h，凸向 +Z） */
function sailGeo(w: number, h: number, belly: number, tri = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 8, 8), p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / w + 0.5, y = p.getY(i) / h + 0.5; if (tri) p.setX(i, (x - 0.5) * w * (1 - y)); p.setZ(i, belly * Math.sin(Math.PI * x) * Math.sin(Math.PI * (0.15 + 0.85 * y))); }
  g.computeVertexNormals(); return g;
}
function buildShip(): THREE.Group {
  const g = new THREE.Group(); g.name = 'coast_ship';
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const spar = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.8 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xe2d6b8, roughness: 0.92, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo(SHIP_L, 4.6), wood); hull.castShadow = true; hull.receiveShadow = true; g.add(hull);
  const masts: [number, number][] = [[SHIP_L * 0.36, 13], [SHIP_L * 0.64, 15]];
  for (const [z, h] of masts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 8), spar); m.position.set(0, 1.4 + h / 2, z); m.castShadow = true; g.add(m);
    for (const [y, w, sh] of [[h * 0.42, 6.4, h * 0.36], [h * 0.78, 5.0, h * 0.28]] as const) {
      const yd = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, w + 0.6, 6), spar); yd.rotation.z = Math.PI / 2; yd.position.set(0, 1.4 + y + sh / 2, z); g.add(yd);
      const s = new THREE.Mesh(sailGeo(w, sh, 0.9), canvas); s.position.set(0, 1.4 + y, z + 0.15); s.castShadow = true; g.add(s);
    }
  }
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 6, 6), spar); bs.rotation.x = Math.PI / 2 - 0.25; bs.position.set(0, 2.9, SHIP_L + 2.2); g.add(bs);
  const jib = new THREE.Mesh(sailGeo(4.2, 8.5, 0.6, true), canvas); jib.rotation.y = Math.PI / 2; jib.rotation.x = -0.32; jib.position.set(0, 6.6, SHIP_L + 1.2); jib.castShadow = true; g.add(jib);
  // 船尾灯（夜里一点暖光；不加真光源）
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); lamp.position.set(0, 3.3, -0.2); lamp.name = 'shipLamp'; g.add(lamp);
  return g;
}

// ---------------------------------------------------------------- 运行
const N = 16, STEP = 4;
let ship: THREE.Group | null = null, v2: ShipV2 | null = null, O = { x: 0, z: 0 }, s = 0, bowAcc = 0;
const trail: { x: number; z: number }[] = [];
export const shipStats = { on: false, s: 0, x: 0, z: 0, trail: 0, kicks: 0, v2: false, tris: 0, draws: 0 };

export function shipBuild(root: THREE.Object3D, origin: { x: number; z: number }) {
  if (SHIP_OFF) return;
  O = origin;
  if (SHIP_V2) { v2 = buildShipV2(); ship = v2.group; Object.assign(shipStats, { v2: true, tris: v2.stats.tris, draws: v2.stats.draws }); } else ship = buildShip();
  // 11-19 帆消失根因：wild_latebake（023fa7d，内容包造景挂完后的「后挂件补合批」）把船里同材质的帆 ×5、桅 ×2、帆桁 ×5 按建船时的位置（船还在局部原点）
  //   合进区域组的静态网格并从船上摘掉 → 航行的船只剩船体 + 尾灯，帆 / 桅停在原点。船组带 userData 标记 → 后挂件合批视为「活的」整组跳过（v1 / v2 都修）
  ship.userData.shipMoving = true;
  root.add(ship);
  s = LOOP * 0.1;
  // 尾迹预填（一进图就有完整尾浪）
  trail.length = 0; for (let k = 1; k < N; k++) { const p = pathAt(s - k * STEP); trail.push({ x: p.x, z: p.z }); }   // [0] = 离船最近
  seaU.uShipOn.value = 1; shipStats.on = true;
}

export function shipUpdate(dt: number, cam: THREE.Vector3) {
  if (!ship) return;
  s += SPEED * Math.min(dt, 0.1);
  const p = pathAt(s), yaw = Math.atan2(p.fx, p.fz), t = seaU.uTime.value, st = seaU.uStorm.value;
  const turning = Math.abs(p.fx) > 0.01 && Math.abs(p.fz) > 0.01 ? 1 : 0;
  const amp = 0.18 + 0.6 * st;
  ship.position.set(O.x + p.x, SEA_Y + seaU.uTide.value * 0.3 - 0.35 + Math.sin(t * 0.9) * amp * 0.6, O.z + p.z);
  ship.rotation.set(Math.sin(t * 0.7 + 1.3) * amp * 0.06, yaw, Math.sin(t * 0.55) * amp * 0.08 + turning * 0.05, 'YXZ');   // 转弯（逆时针）向内侧倾
  // 尾迹折线：[0] = 当前船尾，往后每 4 m 一个点
  if (!trail.length || Math.hypot(p.x - trail[0].x, p.z - trail[0].z) >= STEP) { trail.unshift({ x: p.x, z: p.z }); if (trail.length > N) trail.length = N; }
  const W = seaU.uWk.value; let acc = 0, px = p.x, pz = p.z;
  W[0].set(p.x, p.z, 0, 1);
  for (let i = 1; i < N; i++) { const q = trail[i - 1]; if (!q) { W[i].set(0, 0, 0, 0); continue; } acc += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; W[i].set(q.x, q.z, acc, 1); }
  seaU.uShip.value.set(p.x, p.z, p.fx, p.fz);
  // 船头溅水（镜头 80 m 内，飞溅粒子在中档以上才有）
  bowAcc += dt;
  if (bowAcc > 0.18) { bowAcc = 0; const bx = O.x + p.x + p.fx * (SHIP_L - 0.5), bz = O.z + p.z + p.fz * (SHIP_L - 0.5);
    if (Math.hypot(bx - cam.x, bz - cam.z) < 80) { seaSprayAt(bx + p.fz * 1.2, bz - p.fx * 1.2, 0.7 + st * 0.5); seaSprayAt(bx - p.fz * 1.2, bz + p.fx * 1.2, 0.7 + st * 0.5); shipStats.kicks++; } }
  v2?.tick(t, st, Math.hypot(ship.position.x - cam.x, ship.position.z - cam.z));
  Object.assign(shipStats, { s: +(s % LOOP).toFixed(1), x: +p.x.toFixed(1), z: +p.z.toFixed(1), trail: trail.length });
}

