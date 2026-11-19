// 11-15 钟井井壁点缀（Rhett 01:27「凹凸不平的非规则砖块，偶尔有大小不一的破损，同时带有水草杂草，青苔和一点小花」）
//   着色器里的不规则砖 / 缺砖 / 塌落区在 well_wet_hd.ts wetWall；这里放真几何：
//   1) 凸出 / 松脱的破砖（InstancedMesh 方块，靠洞口边缘和塌落区成簇，少数歪斜半掉）
//   2) 砖缝杂草（交叉面片，从墙面斜向上长出；一部分长在凸砖顶上）
//   3) 下垂水草（越往下越多，湿区和洞口下沿）
//   4) 零星小花（中上段较干处，跟着杂草簇；花瓣小几何 + 实例色）
//   全部合批（每类 1 个 draw call），低画质不建、中画质约 45%；不投影（只接收）。
import * as THREE from 'three';
import { bakeStone, type RubbleSite } from './well_stone_hd';

export type WallDressOpt = {
  rAt: (a: number, y: number) => number;   // 井壁在角度 a、世界高度 y 处的半径（含洞）
  y0: number; y1: number;                  // 井壁有效高度范围
  holes: { a: number; y: number; r: number }[];
  R: number; hi: boolean; mid: boolean;
  sites?: RubbleSite[];                     // 塌落区（与 stoneWallMat 同一份）
  add: (o: THREE.Object3D) => void;
};

const h1 = (n: number) => { const x = Math.sin(n * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const nz = (a: number, y: number) => { const s = Math.sin(a * 12.9 + y * 0.31) * 0.5 + Math.sin(a * 31.7 - y * 0.17 + 2.1) * 0.3 + Math.sin(a * 5.3 + y * 0.07 + 4.4) * 0.2; return s * 0.5 + 0.5; };

/** 垂叶草簇贴图（v3，Rhett 03:36：照 GPT 图做向下的垂叶，单簇密）：根在卡片上部正中，
 *  70 根细长叶先向外拱起再垂下（喷泉 / 瀑布状），根部深绿、叶梢黄绿；夹几片下垂的蕨叶。 */
function grassTex(): THREE.CanvasTexture {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const R = rng(5), rx = W / 2, ry = H * 0.3;
  const blade = (ang: number, len: number, w: number, droop: number) => {
    const x0 = rx + (R() - 0.5) * 26, y0 = ry + (R() - 0.5) * 16;
    const c1x = x0 + Math.cos(ang) * len * 0.35, c1y = y0 - Math.abs(Math.sin(ang)) * len * 0.25 * (1 - droop);
    const ex = x0 + Math.cos(ang) * len * (0.55 + 0.2 * R()), ey = y0 + len * droop;
    const gr = g.createLinearGradient(x0, y0, ex, ey);
    gr.addColorStop(0, `hsl(${100 + R() * 15},${40 + R() * 15}%,${9 + R() * 6}%)`);
    gr.addColorStop(0.5, `hsl(${78 + R() * 18},${45 + R() * 20}%,${28 + R() * 12}%)`);
    gr.addColorStop(1, `hsl(${58 + R() * 18},${45 + R() * 25}%,${46 + R() * 18}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w, y0); g.quadraticCurveTo(c1x - w * 0.5, c1y, ex, ey); g.quadraticCurveTo(c1x + w * 0.5, c1y + w, x0 + w, y0); g.fill();
  };
  for (let i = 0; i < 95; i++) { const side = R() < 0.5 ? -1 : 1, a = side > 0 ? -0.2 - R() * 1.1 : Math.PI + 0.2 + R() * 1.1; blade(a, 110 + R() * 230, 0.8 + R() * 1.6, 0.35 + R() * 0.65); }
  for (let i = 0; i < 18; i++) blade(Math.PI / 2 + (R() - 0.5) * 0.6, 200 + R() * 150, 1 + R() * 2, 0.9 + R() * 0.1);   // 正下方垂丝
  for (let f = 0; f < 1; f++) {   // 下垂蕨叶
    const x0 = rx + (R() - 0.5) * 30, ang = Math.PI / 2 + (R() - 0.5) * 1.8, L = 150 + R() * 140, cl = `hsl(${85 + R() * 20},${40 + R() * 15}%,${18 + R() * 12}%)`;
    g.fillStyle = cl;
    for (let i = 0; i < 28; i++) { const t2 = i / 28, x = x0 + Math.cos(ang) * L * t2, y = ry + Math.sin(ang) * L * t2 + t2 * t2 * 40, pl = (1 - t2) * 22 + 4;
      for (const sd of [-1, 1]) { const pa = ang + sd * 1.1 + 0.4; g.beginPath(); g.ellipse(x + Math.cos(pa) * pl * 0.5, y + Math.sin(pa) * pl * 0.5, pl * 0.5, 2, pa, 0, Math.PI * 2); g.fill(); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 垂藤 / 水草贴图（v2）：细茎蜿蜒下垂，两侧交错小圆叶，越往下叶越小越稀 */
function weedTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d')!;
  const R = rng(9);
  for (let sI = 0; sI < 9; sI++) {
    const x0 = 24 + R() * 80, L = 300 + R() * 210, amp = 6 + R() * 10, ph = R() * 6;
    const X = (yy: number) => x0 + Math.sin(yy * 0.02 + ph) * amp * (yy / L) + (yy / L) * (R() - 0.5) * 2;
    g.strokeStyle = `hsl(${75 + R() * 25},40%,${20 + R() * 10}%)`; g.lineWidth = 1.1; g.beginPath(); g.moveTo(X(0), 0);
    for (let yy = 4; yy < L; yy += 4) g.lineTo(X(yy), yy); g.stroke();
    for (let yy = 6; yy < L; yy += 7 + R() * 7) {
      const k = (1 - yy / L * 0.6) * 0.8, side = (Math.floor(yy / 7) % 2) ? 1 : -1, lx = X(yy) + side * (4 + R() * 3) * k, ly = yy + 2;
      g.fillStyle = `hsl(${70 + R() * 35},${40 + R() * 25}%,${24 + R() * 24}%)`;
      g.beginPath(); g.ellipse(lx, ly, (4 + R() * 3) * k, (2.5 + R() * 2) * k, side * (0.6 + R() * 0.5), 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 小花几何：5 瓣 + 花心，约 6 厘米 */
function flowerGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) { const p = new THREE.CircleGeometry(0.022, 5); p.scale(1, 1.6, 1); p.translate(0, 0.03, 0); p.rotateZ(k / 5 * Math.PI * 2); parts.push(p); }
  const all = parts.map(p => p.toNonIndexed());
  const n = all.reduce((s, g) => s + g.getAttribute('position').count, 0), pos = new Float32Array(n * 3); let o = 0;
  for (const g of all) { pos.set(g.getAttribute('position').array as Float32Array, o); o += g.getAttribute('position').count * 3; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

export function wellWallDress(o: WallDressOpt) {
  if (!o.mid) return { bricks: 0, grass: 0, weeds: 0, flowers: 0, rocks: 0 };
  const k = o.hi ? 1 : 0.45, R = rng(2026);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const inward = (a: number) => new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
  // 墙面点：角度 a、高度 y，往井内偏 off 米
  const at = (a: number, y: number, off: number) => { const r = o.rAt(a, y) - off; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); };
  // 「墙面朝向」四元数：局部 +z = 朝井内，+y = 上
  const face = (a: number) => { const n = inward(a); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), n.clone().negate(), new THREE.Vector3(0, 1, 0))); };
  const inHole = (a: number, y: number, f = 1) => o.holes.some(h => { let da = a - h.a; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; return Math.hypot(da * o.R, y - h.y) < h.r * f; });
  const nearRim = (a: number, y: number) => o.holes.some(h => { let da = a - h.a; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; const d = Math.hypot(da * o.R, y - h.y); return d > h.r * 0.85 && d < h.r * 1.5; });
  const randA = () => R() * Math.PI * 2, randY = () => o.y0 + 2 + R() * (o.y1 - o.y0 - 4);

  // 1) 凸出 / 松脱的破砖
  const NB = Math.round(3600 * k), bricks: THREE.Matrix4[] = [], tops: [number, number][] = [];
  for (let t = 0; t < NB * 6 && bricks.length < NB; t++) {
    const a = randA(), y = randY();
    const rim = nearRim(a, y), zone = nz(a * 3, y) > 0.72;
    if (!rim && !zone && R() > 0.12) continue;
    if (inHole(a, y, 0.85)) continue;
    const w = 0.4 + R() * 0.55, h = 0.17 + R() * 0.16, d = 0.25 + R() * 0.35, out = d * (0.15 + R() * 0.5);
    const loose = R() < 0.15;
    p.copy(at(a, y, out - d * 0.5)); q.copy(face(a));
    e.set((R() - 0.5) * (loose ? 0.6 : 0.08), (R() - 0.5) * 0.12, (R() - 0.5) * (loose ? 0.9 : 0.1)); q.multiply(new THREE.Quaternion().setFromEuler(e));
    s.set(w, h, d); m4.compose(p, q, s); bricks.push(m4.clone());
    if (R() < 0.35) tops.push([a, y + h * 0.5]);
  }
  if (bricks.length) {
    const T = bakeStone(o.hi ? 2048 : 1024), mp = T.map.clone(), nm = T.nrm.clone(); [mp, nm].forEach(t => { t.repeat.set(0.14, 0.1); t.needsUpdate = true; });
    const mat = new THREE.MeshStandardMaterial({ map: mp, normalMap: nm, roughness: 0.88, color: 0xb0b0a8 });
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 2, 2); { const pa = g.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), k2 = (Math.abs(x) > 0.49 ? 1 : 0) + (Math.abs(y) > 0.49 ? 1 : 0) + (Math.abs(z) > 0.49 ? 1 : 0); if (k2 >= 2) pa.setXYZ(i, x * (0.9 + h1(i) * 0.08), y * (0.88 + h1(i + 5) * 0.1), z * (0.92 + h1(i + 9) * 0.06)); } g.computeVertexNormals(); }
    const im = new THREE.InstancedMesh(g, mat, bricks.length); bricks.forEach((mm, i) => im.setMatrixAt(i, mm)); im.receiveShadow = true; o.add(im);
  }
  // 2) 砖缝杂草：一部分在凸砖顶上，其余沿裂缝噪声带；湿度中等处最多
  const NG = Math.round(96000 * k), grass: THREE.Matrix4[] = [], gcol: THREE.Color[] = [];
  const addTuft = (a: number, y: number, sc: number) => {
    p.copy(at(a, y, 0.04)); q.copy(face(a)); e.set(-0.15 - R() * 0.35, (R() - 0.5) * 0.6, (R() - 0.5) * 0.35); q.multiply(new THREE.Quaternion().setFromEuler(e));   // 垂叶：卡片挂在根上往下，下摆略离墙
    s.set(sc * (0.9 + R() * 0.5), sc * 2, sc); m4.compose(p, q, s); grass.push(m4.clone()); gcol.push(new THREE.Color().setHSL(0.2 + R() * 0.07, 0.3 + R() * 0.2, 0.35 + R() * 0.25));
  };
  for (const [a, y] of tops) if (grass.length < NG * 0.4) addTuft(a, y, 0.5 + R() * 0.5);
  // 成片长：约 420 片（中画质 190），每片半径 1.5–5 米，片内密
  const patches = Array.from({ length: Math.round(3600 * k) }, () => ({ a: randA(), y: o.y0 + 6 + Math.pow(R(), 0.8) * (o.y1 - o.y0 - 10), r: 1.5 + R() * 3.5 }));
  for (const S of o.sites ?? []) for (let j = 0; j < 4; j++) patches.unshift({ a: S.a + (R() - 0.5) * 2 * S.r / o.R, y: S.y + S.r * (0.5 + R() * 0.5), r: 1 + R() * 1.5 });   // 塌落口上沿必长草、垂藤
  for (let t = 0; t < NG * 4 && grass.length < NG; t++) {
    const P = patches[Math.floor(R() * patches.length)], rr = P.r * Math.pow(R(), 0.8) * 0.75, th = R() * 6.283;   // 单簇更密
    const a = P.a + Math.cos(th) * rr / o.R, y = P.y + Math.sin(th) * rr * 0.7;
    if (inHole(a, y, 0.95)) continue;
    addTuft(a, y, 0.4 + R() * 0.55);
  }
  const gm = new THREE.MeshStandardMaterial({ map: grassTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  if (grass.length) {
    const pl = new THREE.PlaneGeometry(1, 1); pl.translate(0, -0.2, 0); const pl2 = pl.clone().rotateY(Math.PI / 2).scale(0.7, 1, 0.7);   // 根在卡片上部 30% 处
    const gg = mergeTwo(pl, pl2);
    const im = new THREE.InstancedMesh(gg, gm, grass.length); grass.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, gcol[i]); }); im.receiveShadow = true; o.add(im);
  }
  // 3) 下垂水草：越深越多（y < 0 起），洞口下沿必有一排
  const NW = Math.round(36000 * k), weeds: THREE.Matrix4[] = [];
  const addWeed = (a: number, y: number) => {
    const L = 1.0 + R() * 3.0; p.copy(at(a, y, 0.06)); q.copy(face(a)); e.set(-0.05 - R() * 0.12, (R() - 0.5) * 0.3, (R() - 0.5) * 0.15); q.multiply(new THREE.Quaternion().setFromEuler(e));
    s.set(0.35 + R() * 0.35, L, 1); m4.compose(p, q, s); weeds.push(m4.clone());
  };
  for (const h of o.holes) for (let i = 0; i < Math.round(14 * k); i++) { const a = h.a + (R() - 0.5) * 1.8 * h.r / o.R; addWeed(a, h.y - h.r * (0.8 + R() * 0.2)); }
  // 垂藤帘（照 GPT 图）：从杂草片 / 凸砖顶垂下，成簇 6–16 根并排，各高度都有（越深越密）
  for (const P of patches) { if (weeds.length >= NW * 0.7) break; const n = 6 + Math.floor(R() * 10);
    for (let j = 0; j < n; j++) addWeed(P.a + (R() - 0.5) * 1.6 * P.r / o.R, P.y + (R() - 0.3) * P.r * 0.6); }
  const wp = Array.from({ length: Math.round(600 * k) }, () => ({ a: randA(), y: Math.min(o.y1 - 4, o.y0 + 4 + Math.pow(R(), 1.3) * (o.y1 - o.y0)), r: 1 + R() * 4 }));
  for (let t = 0; t < NW * 4 && weeds.length < NW; t++) {
    const P = wp[Math.floor(R() * wp.length)], a = P.a + (R() - 0.5) * 2 * P.r / o.R, y = P.y + (R() - 0.5) * 1.2;
    if (inHole(a, y, 0.9)) continue;
    addWeed(a, y);
  }
  if (weeds.length) {
    const pl = new THREE.PlaneGeometry(1, 1); pl.translate(0, -0.5, 0);
    const im = new THREE.InstancedMesh(pl, new THREE.MeshStandardMaterial({ map: weedTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, color: 0xc0c8b0 }), weeds.length);
    weeds.forEach((mm, i) => im.setMatrixAt(i, mm)); im.receiveShadow = true; o.add(im);
  }
  // 4) 小花：跟着杂草簇，中上段（y > −35），白 / 淡黄 / 淡紫
  const NF = Math.round(9000 * k), flowers: THREE.Matrix4[] = [], fcol: THREE.Color[] = [];
  const PAL = [0xf2efe4, 0xf0dc8a, 0xc9b6e8, 0xe8c0c8];
  for (let i = 0; i < grass.length && flowers.length < NF; i++) {
    if (R() > 0.45) continue;
    grass[i].decompose(p, q, s); if (p.y < -35) continue;
    const a = Math.atan2(p.z, p.x), n = R() < 0.5 ? 1 : 2 + Math.floor(R() * 3);
    const col = new THREE.Color(PAL[Math.floor(R() * PAL.length)]);
    for (let j = 0; j < n && flowers.length < NF; j++) {
      const aa = a + (R() - 0.5) * 0.004, yy = p.y + s.y * (0.4 + R() * 0.5);
      const v = at(aa, yy, 0.12 + R() * 0.2), fq = face(aa); e.set(-0.4 - R() * 0.6, (R() - 0.5) * 0.6, R() * 6.28); fq.multiply(new THREE.Quaternion().setFromEuler(e));
      const sc = 1.2 + R() * 1.2; m4.compose(v, fq, new THREE.Vector3(sc, sc, sc)); flowers.push(m4.clone()); fcol.push(col.clone().multiplyScalar(0.85 + R() * 0.2));
    }
  }
  if (flowers.length) {
    const im = new THREE.InstancedMesh(flowerGeo(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: 0x222018, emissiveIntensity: 0.5 }), flowers.length);
    flowers.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, fcol[i]); }); o.add(im);
  }
  // 5) 塌落碎石：缺口里一堆松动的乱石往外鼓（不规则，大小 0.12–0.5 米），下沿多散几块
  const rocks: THREE.Matrix4[] = [];
  for (const S of o.sites ?? []) {
    const n = Math.round(S.r * S.r * (o.hi ? 22 : 12));
    for (let i = 0; i < n; i++) {
      const t = Math.sqrt(R()) * 0.85, th = R() * Math.PI * 2, dx = Math.cos(th) * t * S.r * 1.1, dy = Math.sin(th) * t * S.r * 0.8 - (R() < 0.2 ? S.r * 0.9 : 0);
      const a = S.a + dx / o.R, y = S.y + dy, sz = 0.12 + Math.pow(R(), 2) * 0.38;
      p.copy(at(a, y, 0.02 + (1 - t) * 0.35 * R() + sz * 0.3)); q.setFromEuler(new THREE.Euler(R() * 6.3, R() * 6.3, R() * 6.3));
      s.set(sz * (0.8 + R() * 0.5), sz * (0.6 + R() * 0.4), sz * (0.8 + R() * 0.4)); m4.compose(p, q, s); rocks.push(m4.clone());
    }
  }
  if (rocks.length) {
    const g = new THREE.IcosahedronGeometry(1, 1), pa = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pa, i), k3 = 0.75 + 0.35 * h1(Math.round(v.x * 50) * 7 + Math.round(v.y * 50) * 13 + Math.round(v.z * 50)); v.multiplyScalar(k3); v.y *= 0.8; pa.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const T = bakeStone(o.hi ? 2048 : 1024), mp = T.map.clone(), nm = T.nrm.clone(); [mp, nm].forEach(t => { t.repeat.set(0.08, 0.08); t.needsUpdate = true; });
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: mp, normalMap: nm, roughness: 0.85, color: 0xd4d4cc }), rocks.length);
    rocks.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, new THREE.Color().setScalar(0.55 + R() * 0.5)); }); im.castShadow = !!o.hi; im.receiveShadow = true; o.add(im);
  }
  return { bricks: bricks.length, grass: grass.length, weeds: weeds.length, flowers: flowers.length, rocks: rocks.length };
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const A = a.toNonIndexed(), B = b.toNonIndexed(), g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) { const x = A.getAttribute(k).array as Float32Array, y = B.getAttribute(k).array as Float32Array, z = new Float32Array(x.length + y.length); z.set(x); z.set(y, x.length); g.setAttribute(k, new THREE.BufferAttribute(z, A.getAttribute(k).itemSize)); }
  return g;
}
