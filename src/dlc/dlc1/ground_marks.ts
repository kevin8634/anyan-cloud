// ======================================================================
// DLC1 镜渊城 · 地面标识写实化（比赛版 / 非低画质）
//   1. 镜面步道：原来是 2.2 米宽、纯青色自发光长方块（主路从营地火堆一直铺到北面），
//      比赛版换成「湿石板嵌条」：碎边石板 + 低饱和湿光泽 + 两侧青色矮灯（概念图 B3 湿石路 + 青色矮灯）
//   2. 钟楼领地地块：原来是 10 米纯色圆盘，换成地面刻痕圆 + 断续微光符文（颜色降饱和，仍能分辨是哪座建筑）
//   3. 营地传送阵：原来是黄色六边形环 + 黄色内盘，换成刻纹石台 + 暗金微光符文圈 + 石方尖碑
//   全部无额外光源；贴图是程序化 canvas，按种子缓存
// ======================================================================
import * as THREE from 'three';

let seedS = 1;
const rnd = () => ((seedS = (seedS * 16807) % 2147483647) / 2147483647);
const noOutline = <T extends THREE.Object3D>(o: T): T => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };
const setSeed = (s: number) => { seedS = Math.max(1, Math.floor(s) % 2147483647); for (let i = 0; i < 4; i++) rnd(); };

/** 颜色降饱和、压亮度（用于符文微光） */
export function mute(c: number, sat = 0.38, lum = 0.5): THREE.Color {
  const col = new THREE.Color(c), h = { h: 0, s: 0, l: 0 }; col.getHSL(h);
  return col.setHSL(h.h, h.s * sat, Math.min(h.l, lum));
}

// ---------------------------------------------------------------- 镜面步道
const walkTex = new Map<string, { map: THREE.CanvasTexture; alpha: THREE.CanvasTexture }>();
/** 碎边石板：沿长度一块块排，块长 0.7–1.5 米，块间留缝，两侧边缘随机缺角 / 内收；偶有整块缺失 */
function walkTextures(len: number, w: number, seed: number) {
  const key = `${len}|${w}|${seed}`; const hit = walkTex.get(key); if (hit) return hit;
  setSeed(seed);
  const PX = 48, W = Math.round(w * PX), H = Math.min(4096, Math.round(len * PX)), k = H / len;
  const ca = document.createElement('canvas'); ca.width = W; ca.height = H; const a = ca.getContext('2d')!;
  const cm = document.createElement('canvas'); cm.width = W; cm.height = H; const m = cm.getContext('2d')!;
  a.fillStyle = '#000'; a.fillRect(0, 0, W, H); m.fillStyle = '#7a7a7a'; m.fillRect(0, 0, W, H);
  let y = 0;
  while (y < H) {
    const sl = (0.7 + rnd() * 0.8) * k, gap = (0.05 + rnd() * 0.05) * k;
    // 一行偶尔劈成两块（纵缝）
    const split = rnd() < 0.35 ? 0.3 + rnd() * 0.4 : 0;
    const cols = split ? [[0, split], [split, 1]] : [[0, 1]];
    for (const [u0, u1] of cols) {
      if (rnd() < 0.06) continue;   // 缺一块
      const j = () => (rnd() - 0.5) * 0.06 * k;
      const inL = (u0 === 0 ? rnd() * 0.16 : 0.025) * W, inR = (u1 === 1 ? rnd() * 0.16 : 0.025) * W;
      const x0 = u0 * W + inL, x1 = u1 * W - inR, y0 = y + gap / 2, y1 = y + sl - gap / 2;
      a.fillStyle = '#fff'; a.beginPath();
      a.moveTo(x0 + j(), y0 + j()); a.lineTo((x0 + x1) / 2 + j(), y0 + j() * 0.5); a.lineTo(x1 + j(), y0 + j());
      a.lineTo(x1 + j() * 0.6, (y0 + y1) / 2); a.lineTo(x1 + j(), y1 + j()); a.lineTo((x0 + x1) / 2 + j(), y1 + j() * 0.5);
      a.lineTo(x0 + j(), y1 + j()); a.lineTo(x0 + j() * 0.6, (y0 + y1) / 2); a.closePath(); a.fill();
      const g = 95 + Math.floor(rnd() * 70); m.fillStyle = `rgb(${g},${g + 4},${g + 6})`; m.fillRect(x0, y0, x1 - x0, y1 - y0);
      // 石面细纹 / 水渍
      for (let i = 0; i < 6; i++) { const v = g + (rnd() - 0.5) * 50; m.fillStyle = `rgba(${v},${v + 6},${v + 8},0.5)`; m.beginPath(); m.ellipse(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 2 + rnd() * 10, 1 + rnd() * 5, rnd() * 3, 0, Math.PI * 2); m.fill(); }
      // 边角磕掉
      if (rnd() < 0.5) { a.fillStyle = '#000'; a.beginPath(); a.arc(rnd() < 0.5 ? x0 : x1, rnd() < 0.5 ? y0 : y1, (0.08 + rnd() * 0.12) * k, 0, Math.PI * 2); a.fill(); }
    }
    y += sl;
  }
  // 两端淡出（不硬切）
  const fade = a.createLinearGradient(0, 0, 0, H);
  const f = Math.min(0.2, 1.2 / len); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(f, 'rgba(0,0,0,0)'); fade.addColorStop(1 - f, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  a.fillStyle = fade; a.fillRect(0, 0, W, H);
  const mk = (c: HTMLCanvasElement, srgb: boolean) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const r = { map: mk(cm, true), alpha: mk(ca, false) }; walkTex.set(key, r); return r;
}
const lampPost = new THREE.MeshStandardMaterial({ color: 0x1c2224, roughness: 0.55, metalness: 0.6 });
const lampGlow = new THREE.MeshBasicMaterial({ color: 0x5fb8b4 });
/**
 * 湿石板嵌条 + 两侧青色矮灯。局部坐标：沿 z，中心在原点（与原 walkway 一致，api.add 时可带旋转）
 * skip(z) 为真的位置不放矮灯（营地 / 城门）
 */
export function realWalkway(len: number, env?: THREE.Texture, seed = 7, w = 1.5, lampEvery = 8, lamps = true): THREE.Group {
  const g = new THREE.Group(); g.name = 'mirror_walk';
  const { map, alpha } = walkTextures(len, w, seed);
  const geo = new THREE.PlaneGeometry(w, len); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6e70, map, alphaMap: alpha, transparent: true, opacity: 0.92, roughness: 0.16, metalness: 0.3,
    emissive: 0x0a2224, emissiveIntensity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (env) { mat.envMap = env; mat.envMapIntensity = 0.9; }
  const strip = new THREE.Mesh(geo, mat); strip.position.y = 0.025; strip.renderOrder = 2; strip.receiveShadow = true; g.add(strip);
  if (!lamps) return noOutline(g);   // 11-17 Rhett：镜渊城路上不要小绿地灯（改由两侧灯柱发幽影绿光）
  // 矮灯：铁柱 + 青色灯块（InstancedMesh，不加点光）
  const n = Math.max(1, Math.floor(len / lampEvery)), posts: THREE.Matrix4[] = [], caps: THREE.Matrix4[] = [];
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * len / n;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.22), zz = z + (s > 0 ? 0.6 : -0.6);
      posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.2, zz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      caps.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.45, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0)), new THREE.Vector3(1, 1, 1)));
    }
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6), lampPost, posts.length);
  const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.1, 0.11), lampGlow, caps.length);
  posts.forEach((M, i) => pm.setMatrixAt(i, M)); caps.forEach((M, i) => cm.setMatrixAt(i, M)); g.add(pm, cm);
  return noOutline(g);
}

// ---------------------------------------------------------------- 刻痕符文圈
const runeTex = new Map<string, { groove: THREE.CanvasTexture; glow: THREE.CanvasTexture }>();
/** 不规则刻痕双环 + 断续符文；外缘散一些苔 / 碎石点。S = 贴图边长 */
function runeTextures(seed: number, glyphs: number, S = 512) {
  const key = `${seed}|${glyphs}|${S}`; const hit = runeTex.get(key); if (hit) return hit;
  setSeed(seed);
  const cg = document.createElement('canvas'); cg.width = cg.height = S; const g = cg.getContext('2d')!;
  const cl = document.createElement('canvas'); cl.width = cl.height = S; const l = cl.getContext('2d')!;
  const C = S / 2, ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  const wob = (a: number, r: number) => r * (1 + 0.018 * Math.sin(a * 3 + ph[0]) + 0.012 * Math.sin(a * 7 + ph[1]) + 0.008 * Math.sin(a * 13 + ph[2]));
  const ring = (ctx: CanvasRenderingContext2D, r: number, lw: number, style: string, breaks: number) => {
    ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineCap = 'round';
    const segs = 120; let on = true;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI * 2; if (rnd() < breaks) on = !on;
      const rr = wob(a, r); const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
      if (on && i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  // 刻痕（暗、宽一点，像凿进石头里）
  g.filter = 'blur(1.5px)';
  ring(g, C * 0.9, S * 0.018, 'rgba(255,255,255,0.95)', 0.03);
  ring(g, C * 0.74, S * 0.012, 'rgba(255,255,255,0.85)', 0.05);
  ring(g, C * 0.3, S * 0.008, 'rgba(255,255,255,0.6)', 0.08);
  // 符文：两环之间一圈短笔画（每个符文 2–4 笔），约四分之一缺失（风化）
  const glyph = (ctx: CanvasRenderingContext2D, a: number, style: string, lw: number) => {
    const r0 = C * 0.77, r1 = C * 0.87, cx = C + Math.cos(a) * (r0 + r1) / 2, cy = C + Math.sin(a) * (r0 + r1) / 2, sz = (r1 - r0) * 0.42;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2); ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineCap = 'round';
    const st = 2 + Math.floor(rnd() * 3); ctx.beginPath();
    for (let i = 0; i < st; i++) { const x0 = (rnd() - 0.5) * 2 * sz, y0 = (rnd() - 0.5) * 2 * sz; ctx.moveTo(x0, y0); ctx.lineTo(x0 + (rnd() - 0.5) * 2 * sz, y0 + (rnd() - 0.5) * 2 * sz); }
    ctx.stroke(); ctx.restore();
  };
  const live: number[] = [];
  for (let i = 0; i < glyphs; i++) { const a = i / glyphs * Math.PI * 2 + (rnd() - 0.5) * 0.05; if (rnd() < 0.25) continue; live.push(a); }
  setSeed(seed * 3 + 1); for (const a of live) glyph(g, a, 'rgba(255,255,255,0.9)', S * 0.008);
  // 中心十字刻线（淡）
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = S * 0.005; g.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + ph[0]; g.moveTo(C + Math.cos(a) * C * 0.32, C + Math.sin(a) * C * 0.32); g.lineTo(C + Math.cos(a) * C * 0.7, C + Math.sin(a) * C * 0.7); }
  g.stroke();
  // 外缘苔斑 / 碎石点（让边界不是一条硬线）
  g.filter = 'blur(2px)';
  for (let i = 0; i < 60; i++) { const a = rnd() * Math.PI * 2, r = C * (0.84 + rnd() * 0.15); g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`; g.beginPath(); g.ellipse(C + Math.cos(a) * r, C + Math.sin(a) * r, 1 + rnd() * S * 0.012, 1 + rnd() * S * 0.008, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  // 微光：只描符文 + 内环的一部分（细、模糊）
  l.filter = 'blur(1.2px)';
  setSeed(seed * 3 + 1); for (const a of live) glyph(l, a, 'rgba(255,255,255,0.85)', S * 0.0045);
  setSeed(seed * 5 + 2); ring(l, C * 0.74, S * 0.0035, 'rgba(255,255,255,0.45)', 0.09);
  const mk = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; };
  const r = { groove: mk(cg), glow: mk(cl) }; runeTex.set(key, r); return r;
}
/**
 * 地面刻痕符文圈：暗色刻痕（随光照，湿亮）+ 断续微光符文（加色，低饱和）
 * color = 功能色（降饱和后只在符文微光里体现）；glowK 控制亮度
 */
export function runeCircle(radius: number, color: number, seed: number, glowK = 0.55, glyphs = 18): THREE.Group {
  const g = new THREE.Group(); g.name = 'rune_circle';
  const { groove, glow } = runeTextures(seed, glyphs, 512);
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2); geo.rotateX(-Math.PI / 2);
  const gm = new THREE.MeshStandardMaterial({ color: 0x050708, alphaMap: groove, transparent: true, opacity: 0.85, roughness: 0.95, metalness: 0, envMapIntensity: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const gMesh = new THREE.Mesh(geo, gm); gMesh.position.y = 0.03; gMesh.renderOrder = 3; g.add(gMesh);
  const lm = new THREE.MeshBasicMaterial({ color: mute(color, 0.7, 0.5).multiplyScalar(glowK), alphaMap: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const lMesh = new THREE.Mesh(geo, lm); lMesh.position.y = 0.035; lMesh.renderOrder = 4; lMesh.name = 'rune_glow'; g.add(lMesh);
  return noOutline(g);
}

// ---------------------------------------------------------------- 写实传送阵
const daisM = new THREE.MeshStandardMaterial({ color: 0x5a6a62, roughness: 0.42, metalness: 0.35, emissive: 0x0b2624, emissiveIntensity: 1, flatShading: true });   // v1.2.54 青铜锈色（原纯黑在评委落地镜头里像个黑洞）
const obM = new THREE.MeshStandardMaterial({ color: 0x4a5652, roughness: 0.55, metalness: 0.15, flatShading: true });
/** 刻纹石台（低、碎边）+ 符文圈（缓慢转）+ 石方尖碑 + 暗金小晶（名字 spin，本体会让它转） */
export function realWaypoint(color: number, env?: THREE.Texture): THREE.Group {
  const g = new THREE.Group(); g.name = 'waypoint_real';
  // 石台：12 边低圆台，顶点抖动成碎边
  const dg = new THREE.CylinderGeometry(1.75, 1.95, 0.16, 14, 1); const p = dg.attributes.position as THREE.BufferAttribute; setSeed(91);
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const r = Math.hypot(x, z); if (r < 0.5) continue; const key = Math.atan2(z, x).toFixed(3); let k = jit.get(key); if (k === undefined) { k = 0.9 + rnd() * 0.14; jit.set(key, k); } p.setX(i, x * k); p.setZ(i, z * k); }
  dg.computeVertexNormals();
  const dm = daisM.clone(); if (env) { dm.envMap = env; dm.envMapIntensity = 0.5; }
  const dais = new THREE.Mesh(dg, dm); dais.position.y = 0.06; dais.receiveShadow = true; g.add(dais);
  const rc = runeCircle(1.7, color, 41, 0.14, 14); rc.position.y = 0.14; g.add(rc);
  const glowMesh = rc.getObjectByName('rune_glow') as THREE.Mesh;
  let t0 = 0; glowMesh.onBeforeRender = () => { t0 = performance.now() * 0.001; rc.rotation.y = t0 * 0.12; (glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(t0 * 1.3); };
  // 方尖碑（与本体同位置 z = −1.9，碰撞照旧）
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.3, 4), obM); ob.position.set(0, 1.25, -1.9); ob.rotation.y = Math.PI / 4; ob.castShadow = true; g.add(ob);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.75), daisM); base.position.set(0, 0.11, -1.9); base.rotation.y = 0.2; g.add(base);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: mute(color, 0.8, 0.42) })); gem.position.set(0, 2.62, -1.9); gem.name = 'spin'; g.add(gem);
  return noOutline(g);
}
