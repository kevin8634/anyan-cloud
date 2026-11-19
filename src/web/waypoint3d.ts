// v1.2.67 统一传送阵（Rhett 10-30：所有营地传送阵同一套模型，升级外观）
// 结构：两层八角石台（石材贴图 + 磨损边）→ 嵌入青铜符文环（金属 + 铜锈贴图）→ 发光符文盘（程序绘制符文，慢转 + 呼吸）
//       → 四根矮石柱 + 浮空晶尖 → 北侧符文石碑（z = −1.9，碰撞位置与旧传送阵一致）→ 中心淡光柱 + 螺旋上升光点
// 名字 spin 的子物体会被本体动画转动（与旧传送阵兼容）；其余动画自带 onBeforeRender，不需要外部驱动
import * as THREE from 'three';
import { tex } from './textures';
import { noOutline } from './models';

const RUNE = 0xffc860, CORE = 0x7fe0ff;   // 暗金符文 + 青色核心（所有营地统一）
/** 碰撞：北侧石碑 + 四根对角石柱（台面中心可站人，南北可进出） */
export const WAYPOINT_BLOCKS = [{ x: 0, z: -2.25, r: 0.45 }, ...[0, 1, 2, 3].map(i => { const a = Math.PI / 4 + i * Math.PI / 2; return { x: Math.cos(a) * 2.05, z: Math.sin(a) * 2.05, r: 0.3 }; })];
let runeTexCache: THREE.CanvasTexture | null = null, patinaCache: THREE.CanvasTexture | null = null, moteCache: THREE.CanvasTexture | null = null;

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'); if (c) draw(c, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** 符文盘：外圈刻度 + 两道环 + 24 个符文 + 内圈六芒 */
function runeTex() {
  return runeTexCache ??= canvasTex(512, (c, s) => {
    const h = s / 2; c.translate(h, h); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round';
    const ring = (r: number, w: number, a = 1) => { c.globalAlpha = a; c.lineWidth = w; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); };
    ring(h * 0.96, 5); ring(h * 0.84, 3); ring(h * 0.58, 4); ring(h * 0.5, 2, 0.6);
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, r0 = h * (i % 3 ? 0.9 : 0.87); c.globalAlpha = 0.8; c.lineWidth = 2; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * h * 0.94, Math.sin(a) * h * 0.94); c.stroke(); }
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 24; i++) {   // 符文：每个是 3–4 笔的折线
      const a = i / 24 * Math.PI * 2; c.save(); c.rotate(a); c.translate(0, -h * 0.71); c.globalAlpha = 1; c.lineWidth = 3.2;
      c.beginPath(); let x = (rnd() - 0.5) * 14, y = -12; c.moveTo(x, y);
      for (let k = 0; k < 3 + (i % 2); k++) { x = (rnd() - 0.5) * 22; y += 6 + rnd() * 4; c.lineTo(x, y); }
      c.stroke(); if (i % 3 === 0) { c.beginPath(); c.arc(0, -16, 2.6, 0, Math.PI * 2); c.fill(); } c.restore();
    }
    c.globalAlpha = 0.9; c.lineWidth = 3;   // 六芒
    for (let k = 0; k < 2; k++) { c.beginPath(); for (let i = 0; i <= 3; i++) { const a = (i / 3 + k / 6) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * h * 0.46, y = Math.sin(a) * h * 0.46; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, h * 0.3); g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(0, 0, h * 0.3, 0, Math.PI * 2); c.fill();
  });
}

/** 青铜铜锈：暗铜底 + 绿锈斑 + 划痕 */
function patinaTex() {
  return patinaCache ??= canvasTex(256, (c, s) => {
    c.fillStyle = '#6a4a2a'; c.fillRect(0, 0, s, s);
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) { const x = rnd() * s, y = rnd() * s, r = 2 + rnd() * 14; c.fillStyle = rnd() < 0.55 ? `rgba(70,140,120,${0.15 + rnd() * 0.35})` : `rgba(150,105,60,${0.2 + rnd() * 0.3})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(220,170,110,0.35)'; c.lineWidth = 1; for (let i = 0; i < 60; i++) { const x = rnd() * s, y = rnd() * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 6); c.stroke(); }
  });
}

function moteTex() {
  return moteCache ??= canvasTex(64, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); });
}


/** 八角台：顶点轻微抖动成磨损边 */
function dais(r0: number, r1: number, h: number, mat: THREE.Material, seed: number) {
  const g = new THREE.CylinderGeometry(r0, r1, h, 8, 1); const p = g.attributes.position as THREE.BufferAttribute;
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (Math.hypot(x, z) < 0.3) continue; const k = Math.atan2(z, x).toFixed(3) + (p.getY(i) > 0 ? 't' : 'b'); let j = jit.get(k); if (j === undefined) { j = 0.95 + rnd() * 0.07; jit.set(k, j); } p.setX(i, x * j); p.setZ(i, z * j); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.rotation.y = Math.PI / 8; m.receiveShadow = true; m.castShadow = true; return m;
}

/** 统一传送阵。color 参数保留兼容旧调用，不再改变外观（所有营地同一套） */
export function makeUnifiedWaypoint(_color?: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'waypoint_unified';
  const stoneMap = tex('stone', 1.2), stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, map: stoneMap, roughness: 0.88, metalness: 0.02, bumpMap: stoneMap ?? undefined, bumpScale: 0.6 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x5c5850, map: tex('stone', 0.8), roughness: 0.92, metalness: 0 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xc89a60, map: patinaTex(), roughness: 0.38, metalness: 0.85, emissive: 0x2a1404, emissiveIntensity: 0.6 });
  // 石台两层
  const d1 = dais(2.35, 2.5, 0.16, darkStone, 11); d1.position.y = 0.08; g.add(d1);
  const d2 = dais(1.95, 2.08, 0.12, stoneMat, 23); d2.position.y = 0.22; g.add(d2);
  // 青铜环（嵌在上层边缘）
  const br = new THREE.Mesh(new THREE.TorusGeometry(1.82, 0.07, 6, 48), bronze); br.rotation.x = -Math.PI / 2; br.position.y = 0.29; g.add(br);
  // 符文盘：底层慢转 + 上层反向细圈（加法混合，呼吸）
  const runeMat = new THREE.MeshBasicMaterial({ color: RUNE, map: runeTex(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), runeMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.295; disc.renderOrder = 3; g.add(disc);
  const ring2Mat = new THREE.MeshBasicMaterial({ color: CORE, map: runeTex(), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const disc2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.15, 64), ring2Mat); disc2.rotation.x = -Math.PI / 2; disc2.position.y = 0.3; disc2.renderOrder = 4; g.add(disc2);
  // 四根矮石柱 + 浮空晶尖（对角，不挡南北进出）
  const crystals: THREE.Mesh[] = [];
  const cMat = new THREE.MeshStandardMaterial({ color: CORE, emissive: CORE, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 2.05, z = Math.sin(a) * 2.05;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.95, 6), stoneMat); col.position.set(x, 0.62, z); col.castShadow = true; g.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 6), bronze); cap.position.set(x, 1.12, z); g.add(cap);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), cMat); cr.scale.y = 1.7; cr.position.set(x, 1.5, z); cr.userData.phase = i * 1.3; g.add(cr); crystals.push(cr);
  }
  // 北侧符文石碑（碰撞 z = −1.9 不变）
  const ob = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.2, 0.32), stoneMat); ob.position.set(0, 1.32, -2.25); ob.castShadow = true; g.add(ob);
  const obTop = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.45, 4), stoneMat); obTop.rotation.y = Math.PI / 4; obTop.position.set(0, 2.65, -2.25); g.add(obTop);
  const obBand = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.36), bronze); obBand.position.set(0, 0.62, -2.25); g.add(obBand);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.4), new THREE.MeshBasicMaterial({ color: RUNE, map: runeTex(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  plate.position.set(0, 1.45, -2.085); g.add(plate);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), cMat); gem.position.set(0, 3.15, -2.25); gem.name = 'spin'; g.add(gem);
  // 中心淡光柱
  const beamFade = canvasTex(8 * 8, (c, sz) => { const g = c.createLinearGradient(0, 0, 0, sz); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = g; c.fillRect(0, 0, sz, sz); });
  const beamMat = new THREE.MeshBasicMaterial({ color: CORE, alphaMap: beamFade, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // 1106 Rhett：蓝色光柱去掉，只留黄色上升光点
  void beamMat;
  // 螺旋上升光点
  const N = 46, pos = new Float32Array(N * 3), seeds = new Float32Array(N); for (let i = 0; i < N; i++) seeds[i] = Math.random();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe0a0, map: moteTex(), size: 0.16, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  motes.frustumCulled = false; g.add(motes);
  const light = new THREE.PointLight(RUNE, 2.2, 7, 2); light.position.y = 1.0; g.add(light);
  // 动画（只在渲染到时跑）
  disc.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    disc.rotation.z = t * 0.15; disc2.rotation.z = -t * 0.32;
    runeMat.opacity = 0.75 + 0.2 * Math.sin(t * 1.4); ring2Mat.opacity = 0.35 + 0.15 * Math.sin(t * 2.1 + 1);
    light.intensity = 1.8 + 0.6 * Math.sin(t * 1.4);
    for (const c of crystals) { const ph = c.userData.phase as number; c.position.y = 1.5 + 0.08 * Math.sin(t * 1.6 + ph); c.rotation.y = t * 0.8 + ph; }
    for (let i = 0; i < N; i++) { const k = (seeds[i] + t * (0.12 + seeds[i] * 0.08)) % 1, a = seeds[i] * 40 + t * 0.9 + k * 5, r = 0.35 + 1.15 * (1 - k) * (0.6 + 0.4 * seeds[(i + 7) % N]); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.3 + k * 3.3; pos[i * 3 + 2] = Math.sin(a) * r; }
    (pg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };
  return noOutline(g);
}

// ───────────────────────────────────────────────────────────────────────────
// 11-18 Rhett 选概念图 B：野外传送柱换「斜立石拱 + 悬浮核晶」（?off=wparch 回统一传送阵）
// 结构：圆形石台（三级台阶朝南）→ 地面金色符文盘（慢转）→ 东西两块向内斜立的碎裂巨石（刻金色环纹，顶块分离悬浮微晃）
//       → 两角小石墩 → 中心悬浮菱形核晶（青绿 + 金色裂纹，菲涅尔边光）→ 环绕碎石 → 细光柱 + 螺旋光带 + 上升光点
export const WP_ARCH_OFF = (() => { try { return /[?&]off=[^&]*\bwparch\b/.test(location.search); } catch { return false; } })();
export const WAYPOINT_ARCH_BLOCKS = [{ x: -1.85, z: -0.35, r: 0.55 }, { x: 1.85, z: -0.35, r: 0.55 }, { x: -1.9, z: 1.25, r: 0.3 }, { x: 1.9, z: 1.25, r: 0.3 }];
const TEAL = 0x5ff0d0, GOLD = 0xffc35a;
let glyphCache: THREE.CanvasTexture | null = null, swirlCache: THREE.CanvasTexture | null = null;

/** 巨石面刻纹：同心环 + 竖向导槽（白色，加法混合着色） */
function glyphTex() {
  return glyphCache ??= canvasTex(256, (c, s) => {
    c.strokeStyle = '#fff'; c.lineCap = 'round'; const cx = s / 2, cy = s * 0.3;
    c.lineWidth = 7; c.beginPath(); c.arc(cx, cy, s * 0.2, -Math.PI * 0.35, Math.PI * 1.35); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, s * 0.1, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(cx + s * 0.06, cy + s * 0.2); c.lineTo(cx + s * 0.06, s * 0.62); c.lineTo(cx - s * 0.12, s * 0.8); c.lineTo(cx - s * 0.12, s * 0.97); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx - s * 0.2, cy + s * 0.18); c.lineTo(cx - s * 0.2, s * 0.5); c.stroke();
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, s * 0.05); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
}
/** 螺旋光带：横向渐隐条纹 */
function swirlTex() {
  return swirlCache ??= canvasTex(128, (c, s) => {
    for (let y = 0; y < s; y++) { const v = Math.sin(y / s * Math.PI); const g = c.createLinearGradient(0, 0, s, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.9 * v})`); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, y, s, 1); }
  });
}

/** 碎裂巨石：细分盒体 + 顶点抖动 + 轻度锥收，平直着色 */
function roughSlab(w: number, h: number, d: number, seed: number, mat: THREE.Material) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 6, 2).toNonIndexed(); const p = g.attributes.position as THREE.BufferAttribute;
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const jit = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let j = jit.get(k); if (!j) { j = [(rnd() - 0.5) * w * 0.12, (rnd() - 0.5) * h * 0.03, (rnd() - 0.5) * d * 0.18]; jit.set(k, j); }
    const taper = 1 - 0.18 * (y / h + 0.5);
    p.setXYZ(i, x * taper + j[0], y + j[1], z * taper + j[2]);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

export function makeArchWaypoint(): THREE.Group {
  const g = new THREE.Group(); g.name = 'waypoint_arch';
  const stoneMap = tex('stone', 1.1);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8c8679, map: stoneMap, roughness: 0.9, bumpMap: stoneMap ?? undefined, bumpScale: 0.8, flatShading: true });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x5f5b52, map: tex('stone', 0.7), roughness: 0.94, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: 0x4f6a34, roughness: 1, flatShading: true });
  // 圆台两层 + 南侧三级台阶
  const d1 = dais(2.55, 2.7, 0.2, stoneDark, 31); d1.position.y = 0.1; g.add(d1);
  const d2 = dais(2.2, 2.35, 0.16, stone, 47); d2.position.y = 0.28; g.add(d2);
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.7 - i * 0.12, 0.12, 0.42), i % 2 ? stone : stoneDark); st.position.set(0, 0.06 + i * 0.12, 3.05 - i * 0.36); st.receiveShadow = true; g.add(st); }
  // 地面金色符文盘
  const runeMat = new THREE.MeshBasicMaterial({ color: GOLD, map: runeTex(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), runeMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.365; disc.renderOrder = 3; g.add(disc);
  // 两块斜立巨石 + 悬浮顶块 + 刻纹
  const glyphMat = new THREE.MeshBasicMaterial({ color: GOLD, map: glyphTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const tops: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 1.85, 0.36, -0.35); piv.rotation.z = sx * 0.2; piv.rotation.y = sx * 0.12; g.add(piv);
    const low = roughSlab(0.95, 3.2, 0.62, sx > 0 ? 101 : 211, stone); low.position.y = 1.6; piv.add(low);
    const top = roughSlab(0.85, 1.3, 0.56, sx > 0 ? 307 : 419, stone); top.position.y = 3.95; top.rotation.z = sx * 0.12; top.userData.base = 3.95; top.userData.ph = sx; piv.add(top); tops.push(top);
    const mo = roughSlab(0.7, 0.5, 0.5, sx > 0 ? 53 : 67, moss); mo.position.set(-sx * 0.1, 0.3, 0.12); mo.scale.set(1.25, 1, 1.2); piv.add(mo);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 2.2), glyphMat); gl.position.set(-sx * 0.42, 1.75, 0); gl.rotation.y = -sx * Math.PI / 2; gl.renderOrder = 4; piv.add(gl);
    const gl2 = gl.clone(); gl2.position.z = 0.33; gl2.position.x = 0; gl2.rotation.y = 0; gl2.scale.setScalar(0.85); piv.add(gl2);
    // 角墩
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.46), stoneDark); ped.position.set(sx * 1.9, 0.62, 1.25); ped.castShadow = true; g.add(ped);
    const pc = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.56), stone); pc.position.set(sx * 1.9, 0.94, 1.25); g.add(pc);
  }
  // 核晶：菱形双锥 + 菲涅尔边光 + 金色裂纹（顶点色噪声）
  const coreGeo = new THREE.OctahedronGeometry(0.5, 1); coreGeo.scale(0.75, 1.55, 0.75);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x2f9c84, emissive: TEAL, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.94, flatShading: true });
  coreMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpN; varying vec3 vWpV; varying vec3 vLp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpA = modelMatrix * vec4(transformed,1.0); vWpN = normalize(mat3(modelMatrix) * objectNormal); vWpV = normalize(cameraPosition - wpA.xyz); vLp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpN; varying vec3 vWpV; varying vec3 vLp;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fr = pow(1.0 - abs(dot(normalize(vWpN), normalize(vWpV))), 2.5);
      float crk = abs(sin(vLp.x * 23.0 + sin(vLp.y * 17.0) * 2.0) * sin(vLp.z * 19.0 + vLp.y * 11.0));
      crk = smoothstep(0.93, 0.995, 1.0 - crk);
      totalEmissiveRadiance += vec3(0.45, 1.0, 0.85) * fr * 1.6 + vec3(1.0, 0.75, 0.3) * crk * 1.8;`);
  };
  const core = new THREE.Mesh(coreGeo, coreMat); core.position.set(0, 2.35, -0.2); core.name = 'spin'; g.add(core);
  // 环绕碎石
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) { const sh = roughSlab(0.16 + (i % 3) * 0.06, 0.22 + (i % 2) * 0.12, 0.14, 500 + i * 13, stone); sh.castShadow = false; sh.userData.a = i / 9 * Math.PI * 2; sh.userData.r = 0.85 + (i % 3) * 0.22; sh.userData.y = 1.5 + (i * 0.37) % 1.8; g.add(sh); shards.push(sh); }
  // 细光柱 + 螺旋光带（1106 Rhett 去掉过粗蓝光柱，这里只留细柱、低透明）
  const beamFade = canvasTex(64, (c, sz) => { const gg = c.createLinearGradient(0, 0, 0, sz); gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gg.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = gg; c.fillRect(0, 0, sz, sz); });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: TEAL, alphaMap: beamFade, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.set(0, 3.85, -0.2); g.add(beam);
  const sw = swirlTex(); const ribbons: THREE.Mesh[] = [];
  for (let k = 0; k < 2; k++) {
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 4 + k * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * (0.55 - t * 0.25), 0.4 + t * 3.6, Math.sin(a) * (0.55 - t * 0.25) - 0.2)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.035, 4, false);
    const rm = new THREE.MeshBasicMaterial({ color: TEAL, map: sw, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    sw.wrapS = THREE.RepeatWrapping; const r = new THREE.Mesh(tube, rm); g.add(r); ribbons.push(r);
  }
  // 上升光点
  const N = 40, pos = new Float32Array(N * 3), seeds = new Float32Array(N); for (let i = 0; i < N; i++) seeds[i] = Math.random();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe2a0, map: moteTex(), size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  motes.frustumCulled = false; g.add(motes);
  const light = new THREE.PointLight(TEAL, 2.4, 8, 2); light.position.set(0, 2.2, -0.2); g.add(light);
  const glow = new THREE.PointLight(GOLD, 1.2, 5, 2); glow.position.set(0, 0.8, 0); g.add(glow);
  disc.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    disc.rotation.z = t * 0.12; runeMat.opacity = 0.75 + 0.2 * Math.sin(t * 1.3);
    glyphMat.opacity = 0.7 + 0.3 * Math.sin(t * 1.1);
    core.position.y = 2.35 + 0.12 * Math.sin(t * 1.2); core.rotation.y = t * 0.6;
    for (const tp of tops) tp.position.y = (tp.userData.base as number) + 0.06 * Math.sin(t * 0.9 + (tp.userData.ph as number));
    for (const s of shards) { const a = (s.userData.a as number) + t * 0.35; s.position.set(Math.cos(a) * (s.userData.r as number), (s.userData.y as number) + 0.1 * Math.sin(t + a), Math.sin(a) * (s.userData.r as number) - 0.2); s.rotation.set(t * 0.7 + a, t * 0.5, a); }
    for (let k = 0; k < ribbons.length; k++) { const m = ribbons[k].material as THREE.MeshBasicMaterial; if (m.map) m.map.offset.x = -t * 0.4; ribbons[k].rotation.y = t * 0.5 * (k ? -1 : 1); }
    light.intensity = 2.0 + 0.6 * Math.sin(t * 1.2);
    for (let i = 0; i < N; i++) { const k = (seeds[i] + t * (0.1 + seeds[i] * 0.08)) % 1, a = seeds[i] * 40 + t * 0.8 + k * 5, r = 0.3 + 1.2 * (1 - k) * (0.6 + 0.4 * seeds[(i + 7) % N]); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.4 + k * 4.2; pos[i * 3 + 2] = Math.sin(a) * r - 0.2; }
    (pg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };
  return noOutline(g);
}
