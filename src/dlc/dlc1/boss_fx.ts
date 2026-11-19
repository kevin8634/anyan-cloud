// ======================================================================
// 长副本 A 首领逐招技能特效（A9，11-04）—— 替换 A7 的裂纹 / 尘土 / 聚光占位（质量硬标准第 7 条：底线高于主线 v1.2.72 新版特效）
// 设计语言（借鉴 MMO 首领战，不用任何外部美术资源，贴图全部 canvas 程序化生成）：
//   前摇（预备）：施法手 / 武器聚能 + 红圈里地面纹样逐渐成形（颜色 = 危险类型 / 首领配色）
//   爆发（出手）：贴花（裂纹 / 冰纹 / 血泊 / 符文）+ 网格特效（冰刺 / 水柱 / 光柱 / 冲击环）+ 分层粒子（软粒子烟、火星、碎块、雾）+ 加色辉光（Bloom 吃得到）
//   余韵：贴花慢慢暗下去、烟雾飘散、余烬下落
// 每个首领一套配色：戈尔顿 铁锈琥珀 + 血红；萨琳 溺魂青绿；维尔格 寒誓冰蓝；摆渡 死渡紫幽 / 生渡白绿；莫尔维斯 深渊青 + 毒绿。
// 不新增实时点光（光源数变化会让全场材质重编译卡顿），亮度全靠加色辉光；低画质粒子数减半、关拖尾。
// ======================================================================
import * as THREE from 'three';
import type { ClassFxApi } from '../../core/ClassExt';
import type { BossRigHandle, MoveDef } from './boss_rig';
import { curQuality } from '../../web/gfx';

type F = ClassFxApi;
const LOW = () => curQuality === 'low';
const Q = (n: number) => Math.max(1, Math.round(n * (LOW() ? 0.45 : curQuality === 'medium' ? 0.75 : 1)));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const noOutline = <T extends THREE.Material>(m: T) => { m.userData.outlineParameters = { visible: false }; return m; };

// ---------------------------------------------------------------- 程序化贴图（canvas，缓存）
const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture | null {
  const hit = texCache.get(key); if (hit) return hit;
  const D = (globalThis as unknown as { document?: Document }).document; if (!D?.createElement) return null;
  const c = D.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); if (!g) return null;
  try { draw(g, size); } catch { return null; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
}
let seed = 1; const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const TEX = {
  soft: () => canvasTex('soft', 64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  smoke: () => canvasTex('smoke', 128, (g, s) => { seed = 7; for (let i = 0; i < 26; i++) { const x = s / 2 + (srand() - 0.5) * s * 0.45, y = s / 2 + (srand() - 0.5) * s * 0.45, r = s * (0.12 + srand() * 0.2); const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, 'rgba(255,255,255,0.22)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }),
  spark: () => canvasTex('spark', 64, (g, s) => { const r = g.createLinearGradient(0, 0, 0, s); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(s * 0.42, 0, s * 0.16, s); }),
  crack: () => canvasTex('crack', 256, (g, s) => { seed = 11; g.strokeStyle = '#fff'; g.lineCap = 'round';
    for (let i = 0; i < 11; i++) { let x = s / 2, y = s / 2, a = i / 11 * 6.283 + srand() * 0.4, w = 7; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { a += (srand() - 0.5) * 0.7; const L = s * 0.055; x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineWidth = w; g.lineTo(x, y); w = Math.max(1, w * 0.8);
        if (srand() < 0.3) { g.moveTo(x, y); const b = a + (srand() - 0.5) * 1.6; g.lineTo(x + Math.cos(b) * L * 1.4, y + Math.sin(b) * L * 1.4); g.moveTo(x, y); } } g.stroke(); }
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.16); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  frost: () => canvasTex('frost', 256, (g, s) => { seed = 23; g.strokeStyle = '#fff'; g.translate(s / 2, s / 2);
    for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * 6.283); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.46, 0); g.stroke();
      for (let k = 1; k < 6; k++) { const x = s * 0.46 * k / 6, L = s * 0.06 * (1 - k / 7); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + L, L); g.moveTo(x, 0); g.lineTo(x + L, -L); g.stroke(); } g.restore(); }
    g.lineWidth = 2.5; for (const r of [0.2, 0.33, 0.45]) { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283; g.lineTo(Math.cos(a) * s * r, Math.sin(a) * s * r); } g.stroke(); } }),
  rune: () => canvasTex('rune', 256, (g, s) => { seed = 31; g.strokeStyle = '#fff'; g.translate(s / 2, s / 2); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, s * 0.46, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, s * 0.38, 0, 7); g.stroke();
    for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * 6.283); g.translate(s * 0.42, 0); g.beginPath(); const t = (srand() * 4) | 0; if (t === 0) { g.moveTo(-6, -6); g.lineTo(6, 6); g.moveTo(6, -6); g.lineTo(-6, 6); } else if (t === 1) { g.arc(0, 0, 5, 0, 7); } else if (t === 2) { g.moveTo(0, -8); g.lineTo(0, 8); g.lineTo(6, 4); } else { g.moveTo(-6, 0); g.lineTo(6, 0); g.moveTo(0, -6); g.lineTo(0, 6); } g.stroke(); g.restore(); }
    for (let i = 0; i < 3; i++) { g.rotate(6.283 / 3); g.beginPath(); g.moveTo(0, -s * 0.36); g.lineTo(s * 0.31, s * 0.18); g.lineTo(-s * 0.31, s * 0.18); g.closePath(); g.stroke(); } }),
  splat: () => canvasTex('splat', 256, (g, s) => { seed = 41; g.fillStyle = '#fff'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, 7); g.fill();
    for (let i = 0; i < 22; i++) { const a = srand() * 6.283, d = s * (0.12 + srand() * 0.3), r = s * (0.02 + srand() * 0.06); g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, 7); g.fill();
      g.lineWidth = r; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d); g.stroke(); } }),
  ring: () => canvasTex('ring', 128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,1)'); r.addColorStop(0.86, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  grad: () => canvasTex('grad', 64, (g, s) => { const r = g.createLinearGradient(0, 0, 0, s); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.25, 'rgba(255,255,255,0.65)'); r.addColorStop(0.85, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0.2)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
};
type TexK = keyof typeof TEX;

// ---------------------------------------------------------------- 场景 / 地面
let groundFn: ((x: number, z: number, y: number) => number) | null = null;
/** raid_well_rig.ts 注入（台面 / 地形高度，红圈埋在台面下时也能落对） */
export const setFxGround = (f: (x: number, z: number, y: number) => number) => { groundFn = f; };
const gy = (fx: F, x: number, z: number, y: number) => (groundFn ? groundFn(x, z, y) : fx.gy?.(x, z) ?? y);
type V = { x: number; y: number; z: number };

// ---------------------------------------------------------------- 原语
export interface BurstOpt { n: number; color: number; size: number; life: number; speed?: number; up?: number; spread?: number; gravity?: number; drag?: number; grow?: number; tex?: TexK; add?: boolean; opacity?: number; dir?: THREE.Vector3; cone?: number; stretch?: boolean; rise?: number }
/** 分层粒子：sprite 群（软粒子 / 烟 / 火星），速度 + 重力 + 阻尼 + 生长 + 淡出 */
export function burst(fx: F, p: V, o: BurstOpt) {
  const tex = TEX[o.tex ?? 'soft'](); const n = Q(o.n); const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
  const mat = noOutline(new THREE.SpriteMaterial({ map: tex ?? undefined, color: o.color, transparent: true, depthWrite: false, opacity: o.opacity ?? 1, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending }));
  const ps: { s: THREE.Sprite; v: THREE.Vector3; r: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(mat); let v: THREE.Vector3;
    if (o.dir) { const c = o.cone ?? 0.5; v = o.dir.clone().normalize().add(new THREE.Vector3(rnd(-c, c), rnd(-c, c) * 0.6, rnd(-c, c))).normalize().multiplyScalar((o.speed ?? 3) * rnd(0.5, 1.2)); }
    else { const a = rnd(0, 6.283), sp = (o.speed ?? 3) * rnd(0.35, 1); v = new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 1) * rnd(0.4, 1.2), Math.sin(a) * sp); }
    const r = o.spread ?? 0; s.position.set(rnd(-r, r), rnd(0, r * 0.4), rnd(-r, r)); const sz = o.size * rnd(0.6, 1.3); s.scale.setScalar(sz);
    g.add(s); ps.push({ s, v, r: sz, d: rnd(0, 0.25) });
  }
  fx.live(g, o.life, (k, dt) => {
    const gr = o.gravity ?? 0, dg = Math.pow(1 - Math.min(0.95, o.drag ?? 0.8), dt);
    for (const q of ps) { q.v.y -= gr * dt; q.v.multiplyScalar(dg); if (o.rise) q.v.y += o.rise * dt; q.s.position.addScaledVector(q.v, dt);
      const sc = q.r * (1 + (o.grow ?? 0) * k); if (o.stretch) { q.s.scale.set(sc * 0.35, sc * (1 + q.v.length() * 0.25), 1); } else q.s.scale.setScalar(sc); }
    mat.opacity = (o.opacity ?? 1) * (k < 0.12 ? k / 0.12 : 1 - Math.pow((k - 0.12) / 0.88, 1.4));
  });
}
/** 地面贴花：程序化纹样，加色发光层 + 暗色底层；scaleIn 秒长出，dur 秒淡出 */
export function decal(fx: F, p: V, r: number, tex: TexK, color: number, o: { dur?: number; dark?: number; glow?: number; scaleIn?: number; spin?: number; add?: boolean; hold?: number } = {}) {
  const t = TEX[tex](); if (!t) return; const y = gy(fx, p.x, p.z, p.y) + 0.07; const g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = rnd(0, 6.283);
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const dark = o.dark ? noOutline(new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: o.dark, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })) : null;
  // A10 亮度预算（技能最亮处 ≤ 场景最亮点 1.5 倍）：加色贴花半径 > 5 米按半径压亮度（大面积加色叠到地面 = 整片发白）
  const g0 = (o.glow ?? 1) * (o.add === false ? 1 : Math.min(1, Math.max(0.3, 5 / Math.max(1, r))));
  const glow = noOutline(new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: g0, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  if (dark) { const m = new THREE.Mesh(geo, dark); m.scale.setScalar(1.06); g.add(m); }
  const gm = new THREE.Mesh(geo, glow); gm.position.y = 0.01; g.add(gm);
  const dur = o.dur ?? 3, si = o.scaleIn ?? 0.12, hold = o.hold ?? 0.25;
  fx.live(g, dur, (k, dt) => { const tt = k * dur; g.scale.setScalar(Math.max(0.05, r * Math.min(1, tt / si))); if (o.spin) g.rotation.y += o.spin * dt;
    const f = k < hold ? 1 : 1 - (k - hold) / (1 - hold); glow.opacity = g0 * f * f; if (dark) dark.opacity = o.dark! * Math.min(1, f * 1.6); });
}
/** 预备期地面纹样：在 dur 秒内从无到满（配合本体红圈读出剩余时间），到点自动消失 */
export function chargeDecal(fx: F, p: V, r: number, tex: TexK, color: number, dur: number, spin = 0.4) {
  const t = TEX[tex](); if (!t) return; const y = gy(fx, p.x, p.z, p.y) + 0.075; const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const m = noOutline(new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  const me = new THREE.Mesh(geo, m); me.position.set(p.x, y, p.z); const cK = Math.min(1, Math.max(0.35, 5 / Math.max(1, r)));   // A10 亮度预算：大半径预备纹样同样按半径压
  fx.live(me, Math.max(0.3, dur), (k, dt) => { me.scale.setScalar(Math.max(0.05, r * (0.35 + 0.65 * k))); me.rotation.y += spin * dt; m.opacity = cK * (0.15 + 0.75 * k * k + Math.sin(k * 40) * 0.05 * k); });
}
/** 冲击环：贴地加色环扩散（可多层） */
export function shock(fx: F, p: V, r: number, color: number, o: { dur?: number; layers?: number; y?: number; width?: number; opacity?: number } = {}) {
  const t = TEX.ring(); const op = (o.opacity ?? 1) * Math.min(1, Math.max(0.22, 7 / Math.max(1, r))), big = r > 7;   /* A10：阈值 9→7 米、下限 0.35→0.22；大环不再叠白色内层（白层 = 地面瞬间发白的主因） */   /* A9 看图：半径 > 9 米的大冲击环加色叠层会把整片地面洗白 → 按半径压不透明度 */ const y = gy(fx, p.x, p.z, p.y) + 0.1 + (o.y ?? 0); const g = new THREE.Group(); g.position.set(p.x, y, p.z);
  const L = (o.layers ?? 2) + 1, ms: THREE.MeshBasicMaterial[] = [], meshes: THREE.Mesh[] = [];   // +1 层同色叠加（亮度 ×2，Bloom 吃得到）
  for (let i = 0; i < L; i++) { const m = noOutline(new THREE.MeshBasicMaterial({ map: t ?? undefined, color: i && !big ? 0xffffff : color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); const me = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); me.rotation.x = -Math.PI / 2; me.position.y = i * 0.02; g.add(me); ms.push(m); meshes.push(me); }
  const dur = o.dur ?? 0.6;
  ms[L - 1].color.set(color);
  fx.live(g, dur, k => { for (let i = 0; i < L; i++) { const last = i === L - 1, kk = last ? k : Math.min(1, k * (1 + i * 0.5)), e = 1 - Math.pow(1 - kk, 3); meshes[i].scale.setScalar(Math.max(0.05, r * e * (last ? 1 : 1 - i * 0.25))); ms[i].opacity = op * (1 - kk) * (i && !last ? 0.6 : 1); } });
}
/** 竖直光柱 / 水柱 / 冰雾柱：开口圆柱 + 竖向渐变贴图，升起 → 停留 → 变细淡出 */
export function column(fx: F, p: V, r: number, h: number, color: number, o: { dur?: number; add?: boolean; twist?: number; opacity?: number } = {}) {
  const t = TEX.grad(); const y = gy(fx, p.x, p.z, p.y); const g = new THREE.Group(); g.position.set(p.x, y, p.z);
  const mk = (rr: number, op: number) => { const m = noOutline(new THREE.MeshBasicMaterial({ map: t ?? undefined, color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending }));
    const geo = new THREE.CylinderGeometry(rr, rr * 1.15, 1, 24, 1, true); geo.translate(0, 0.5, 0); const me = new THREE.Mesh(geo, m); g.add(me); return { me, m, op }; };
  const parts = [mk(r, o.opacity ?? 0.85), mk(r * 0.55, 1), mk(r * 1.5, 0.35)]; const dur = o.dur ?? 0.9;
  fx.live(g, dur, (k, dt) => { const up = Math.min(1, k / 0.18), fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
    for (const q of parts) { q.me.scale.set(1 - 0.5 * Math.max(0, k - 0.45), h * up, 1 - 0.5 * Math.max(0, k - 0.45)); q.m.opacity = q.op * fade; q.me.rotation.y += (o.twist ?? 1.5) * dt; } });
}
/** 冰刺 / 骨刺 / 木刺：实体网格（受光照），破土而出 → 停留 → 下沉碎裂 */
export function spikes(fx: F, p: V, r: number, n: number, color: number, o: { h?: number; dur?: number; emissive?: number; along?: THREE.Vector3; len?: number; metal?: number; rough?: number; opacity?: number } = {}) {
  const y = gy(fx, p.x, p.z, p.y); const g = new THREE.Group(); g.position.set(p.x, y, p.z);
  const mat = noOutline(new THREE.MeshStandardMaterial({ color, emissive: o.emissive ?? 0x000000, emissiveIntensity: 0.8, roughness: o.rough ?? 0.15, metalness: o.metal ?? 0.1, transparent: true, opacity: o.opacity ?? 0.92, flatShading: true }));
  const geo = new THREE.ConeGeometry(1, 1, 5); geo.translate(0, 0.5, 0);
  const sp: { m: THREE.Mesh; h: number; d: number }[] = []; const N = Q(n);
  for (let i = 0; i < N; i++) { const m = new THREE.Mesh(geo, mat); let x: number, z: number;
    if (o.along) { const t = (i + rnd(0, 0.6)) / N * (o.len ?? r); x = o.along.x * t + rnd(-0.6, 0.6); z = o.along.z * t + rnd(-0.6, 0.6); } else { const a = rnd(0, 6.283), d = r * Math.sqrt(rnd(0.05, 1)); x = Math.cos(a) * d; z = Math.sin(a) * d; }
    const h = (o.h ?? 1.6) * rnd(0.55, 1.25); m.position.set(x, -h, z); m.rotation.set(rnd(-0.35, 0.35), rnd(0, 6.283), rnd(-0.35, 0.35)); m.scale.set(h * 0.22, h, h * 0.22); m.castShadow = true; g.add(m); sp.push({ m, h, d: o.along ? i / N * 0.25 : rnd(0, 0.12) }); }
  const dur = o.dur ?? 1.6;
  fx.live(g, dur, k => { const tt = k * dur; for (const q of sp) { const e = Math.min(1, Math.max(0, (tt - q.d) / 0.14)); const sink = Math.max(0, (k - 0.7) / 0.3); q.m.position.y = -q.h * (1 - e) - q.h * 0.9 * sink * sink; } mat.opacity = (o.opacity ?? 0.92) * (k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); });
}
/** 能量束 / 折线电弧：从 a 到 b 的锯齿折线（十字面片），快速闪烁淡出 */
export function arc(fx: F, a: V, b: V, color: number, o: { dur?: number; jag?: number; width?: number; seg?: number } = {}) {
  const A = new THREE.Vector3(a.x, a.y, a.z), B = new THREE.Vector3(b.x, b.y, b.z), seg = o.seg ?? 9, jag = o.jag ?? 0.5, w = o.width ?? 0.18;
  const pts: THREE.Vector3[] = []; for (let i = 0; i <= seg; i++) { const p = A.clone().lerp(B, i / seg); if (i && i < seg) p.add(new THREE.Vector3(rnd(-jag, jag), rnd(-jag, jag), rnd(-jag, jag))); pts.push(p); }
  const g = new THREE.Group(); const t = TEX.spark();
  const mc = noOutline(new THREE.MeshBasicMaterial({ map: t ?? undefined, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const mw = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  for (let i = 0; i < seg; i++) { const p0 = pts[i], p1 = pts[i + 1], L = p0.distanceTo(p1); const mid = p0.clone().lerp(p1, 0.5);
    for (const [m, ww] of [[mc, w * 3], [mw, w * 0.6]] as const) for (const rot of [0, Math.PI / 2]) { const me = new THREE.Mesh(new THREE.PlaneGeometry(ww, L), m); me.position.copy(mid); me.lookAt(p1); me.rotateX(Math.PI / 2); me.rotateY(rot); g.add(me); } }
  const dur = o.dur ?? 0.35;
  fx.live(g, dur, k => { const f = (1 - k) * (0.6 + 0.4 * Math.sin(k * 60)); mc.opacity = f; mw.opacity = f; });
}
/** 武器拖尾：出手前 lead 秒到出手后 tail 秒，每帧取武器尖端 / 中段两点拉一条加色带子（世界空间） */
export function trail(fx: F, h: BossRigHandle, tipName: string, color: number, lead: number, tail = 0.3, width = 0.45) {
  if (LOW()) return; const N = 18, pos = new Float32Array(N * 2 * 3), alpha = new Float32Array(N * 2);
  if (!h.worldOf(tipName)) return;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const idx: number[] = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const mat = noOutline(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(color) }, o: { value: 1 } },
    vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float o; varying float va; void main(){ gl_FragColor = vec4(c * (0.6 + va), va * va * o); }' }));
  const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; const hist: [THREE.Vector3, THREE.Vector3][] = []; let t = 0; const total = lead + tail;
  const hand = tipName.endsWith('L') ? 'haL' : 'haR';
  fx.live(me, total, (k, dt) => { t += dt; const tp = h.worldOf(tipName), hp = h.worldOf(hand); if (!tp || !hp) return;
    if (t > lead - 0.45) { const inner = hp.clone().lerp(tp, Math.max(0.2, 1 - width)); hist.unshift([tp.clone(), inner]); if (hist.length > N) hist.pop(); }
    for (let i = 0; i < N; i++) { const q = hist[Math.min(i, hist.length - 1)]; if (!q) continue; pos.set([q[0].x, q[0].y, q[0].z], i * 6); pos.set([q[1].x, q[1].y, q[1].z], i * 6 + 3); const a = i < hist.length ? (1 - i / N) : 0; alpha[i * 2] = a; alpha[i * 2 + 1] = a * 0.15; }
    geo.attributes.position.needsUpdate = true; (geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true; mat.uniforms.o.value = t > lead ? Math.max(0, 1 - (t - lead) / tail) : 1; });
}
/** 手上聚能：一团加色光随骨骼走，越到出手越亮（替 A7 gatherLight 的点光源） */
export function gather(fx: F, h: BossRigHandle, bone: string, color: number, dur: number, size = 0.08) {
  const t = TEX.soft(); const m = noOutline(new THREE.SpriteMaterial({ map: t ?? undefined, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const core = new THREE.Sprite(m), halo = new THREE.Sprite(m.clone()); const g = new THREE.Group(); g.add(core, halo);
  let acc = 0;
  fx.live(g, Math.max(0.3, dur), (k, dt) => { const p = h.worldOf(bone) ?? h.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h.height * 0.8, 0)); g.position.copy(p);
    const s = h.height * size * (0.4 + 0.9 * k); core.scale.setScalar(s); halo.scale.setScalar(s * (2.6 + Math.sin(k * 30) * 0.2)); m.opacity = 0.3 + 0.7 * k; (halo.material as THREE.SpriteMaterial).opacity = 0.25 * k;
    acc += dt; if (acc > (LOW() ? 0.18 : 0.07)) { acc = 0; const a = rnd(0, 6.283), r = h.height * rnd(0.18, 0.35); burst(fx, { x: p.x + Math.cos(a) * r, y: p.y + rnd(-0.3, 0.3) * r, z: p.z + Math.sin(a) * r }, { n: 1, color, size: h.height * 0.025, life: 0.45, dir: new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)), speed: r * 2, cone: 0.1 }); } });
}
/** 体积感雾团：一簇软边烟（常规混合）缓慢膨胀飘散，颜色可带一点加色内芯 */
export function fogPuff(fx: F, p: V, r: number, color: number, dur = 2.4, n = 10, glow = 0) {
  burst(fx, { x: p.x, y: gy(fx, p.x, p.z, p.y) + r * 0.25, z: p.z }, { n, color, size: r * 0.9, life: dur, speed: r * 0.6, up: 0.15, spread: r * 0.5, drag: 0.85, grow: 1.1, tex: 'smoke', add: false, opacity: 0.55, rise: 0.15 });
  if (glow) burst(fx, { x: p.x, y: gy(fx, p.x, p.z, p.y) + r * 0.2, z: p.z }, { n: Math.ceil(n / 2), color, size: r * 0.6, life: dur * 0.7, speed: r * 0.4, up: 0.1, spread: r * 0.4, grow: 0.8, tex: 'soft', opacity: glow });
}

/** 刀光弧（WoW 式武器挥砍轨迹）：一段环形带子，光头从 from 角扫到 to 角、拖一条渐隐尾巴。
 *  horizontal：贴腰高水平扫（锚链横扫 / 船篙横击），角度 0 = 首领正前方；vertical：竖直劈砍（过头劈），0 = 正前、+π/2 = 正上方 */
export function slash(fx: F, c: V, fwd: THREE.Vector3, r: number, width: number, color: number, o: { y?: number; vertical?: boolean; from: number; to: number; dur?: number; tail?: number }) {
  const geo = new THREE.RingGeometry(Math.max(0.05, r - width), r, 64, 1);
  const mat = noOutline(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(color) }, head: { value: o.from }, dir: { value: Math.sign(o.to - o.from) || 1 }, tail: { value: o.tail ?? 1.6 }, ri: { value: r - width }, ro: { value: r }, op: { value: 1 } },
    vertexShader: 'varying vec2 p; void main(){ p = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float head, dir, tail, ri, ro, op; varying vec2 p; void main(){ float a = atan(p.y, p.x); float d = (head - a) * dir; d = mod(d + 6.2831853, 6.2831853); if (d > tail) discard; float k = 1.0 - d / tail; float rr = (length(p) - ri) / max(0.001, ro - ri); float edge = smoothstep(0.0, 0.25, rr) * smoothstep(1.0, 0.55, rr); float core = smoothstep(0.55, 0.85, rr) * smoothstep(1.0, 0.85, rr); gl_FragColor = vec4(c * (0.7 + 1.6 * core * k) + vec3(core * k * k), k * k * edge * op); }' }));
  const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; const g = new THREE.Group(); g.add(me);
  const f = fwd.clone().setY(0).normalize();
  if (o.vertical) { const up = new THREE.Vector3(0, 1, 0), z = new THREE.Vector3().crossVectors(f, up); g.matrixAutoUpdate = false; g.matrix.makeBasis(f, up, z).setPosition(c.x, c.y + (o.y ?? 0), c.z); }
  else { me.rotation.x = -Math.PI / 2; g.rotation.y = Math.atan2(-f.z, f.x); g.position.set(c.x, c.y + (o.y ?? 0), c.z); }
  const dur = o.dur ?? 0.35;
  fx.live(g, dur + 0.25, (k) => { const t = k * (dur + 0.25); const e = Math.min(1, t / dur); mat.uniforms.head.value = o.from + (o.to - o.from) * (1 - Math.pow(1 - e, 2.2)); mat.uniforms.op.value = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.25); if (g.matrixAutoUpdate === false) g.updateMatrixWorld(true); });
}
/** 延时执行（游戏时钟：挂一个空物体给 F.live，到点调一次） */
export function later(fx: F, sec: number, fn: () => void) { if (sec <= 0) { fn(); return; } let done = false; fx.live(new THREE.Object3D(), sec + 0.05, k => { if (!done && k * (sec + 0.05) >= sec) { done = true; fn(); } }); }
// ---------------------------------------------------------------- 每个首领技能的组合（key = 技能 id；melee = 普攻；phase = 阶段转换）
export interface SkillFxCtx { fx: F; h: BossRigHandle; m: MoveDef; dur: number; at: THREE.Vector3; fwd: THREE.Vector3; tele: { x: number; z: number; r: number }[]; R?: number }
type SkillFx = { windup?(c: SkillFxCtx): void; impact?(c: SkillFxCtx): void };
const C = { amber: 0xffa04a, rust: 0xc8602a, blood: 0x9a0a10, bloodHi: 0xff3a30, soul: 0x50f0c8, soulDeep: 0x1a8a70, ice: 0xbfe8ff, iceDeep: 0x3a9cff, violet: 0x9a5aff, violetDeep: 0x3a1060, life: 0xd8ffe8, abyss: 0x40f0e0, toxic: 0x8aff3a, water: 0x9ad8e8 };
const at = (c: SkillFxCtx, k = 0) => c.at.clone().addScaledVector(c.fwd, k);
const upY = (p: V, y: number): V => ({ x: p.x, y: p.y + y, z: p.z });
const teleOr = (c: SkillFxCtx) => (c.tele.length ? c.tele.map(t => new THREE.Vector3(t.x, c.at.y, t.z)) : [c.at.clone()]);
/** 11-07（Rhett 22:44「技能半径与预警圈按实际技能范围」）：有判定半径的招（地面砸击 / 毒区），地面贴花 / 冲击环按判定半径 R 画（设计时 0.6×身高 = 判定圈），没有的照旧按身高 */
const ar = (c: SkillFxCtx, k: number) => (c.R ? c.R * k / 0.6 : c.h.height * k);
const tr = (c: SkillFxCtx) => c.tele.length ? c.tele[0].r : c.R ?? c.h.height * 0.6;
const dust = (c: SkillFxCtx, p: V, k = 1, col = 0x6a6258) => burst(c.fx, upY(p, 0.3), { n: 16 * k, color: col, size: c.h.height * 0.16 * k, life: 1.6, speed: 3.2 * k, up: 0.6, spread: 0.5, drag: 0.85, grow: 1.4, tex: 'smoke', add: false, opacity: 0.6 });
const debris = (c: SkillFxCtx, p: V, col: number, k = 1) => burst(c.fx, upY(p, 0.3), { n: 22 * k, color: col, size: 0.22 * k, life: 1.1, speed: 5 * k, up: 6 * k, gravity: 16, drag: 0.3, tex: 'spark', stretch: true, add: false, opacity: 0.95 });
const embers = (c: SkillFxCtx, p: V, col: number, k = 1) => burst(c.fx, upY(p, 0.4), { n: 26 * k, color: col, size: 0.18, life: 0.9, speed: 6 * k, up: 4, gravity: 7, drag: 0.4, tex: 'spark', stretch: true });

export const SKILL_FX: Record<string, Record<string, SkillFx>> = {
  // ---------------- 戈尔顿：铁锈琥珀 + 血红
  wl_gordon: {
    melee: { windup: c => { trail(c.fx, c.h, 'tipR', C.amber, c.dur, 0.35, 0.5); later(c.fx, Math.max(0, c.dur - 0.3), () => slash(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), c.fwd, c.h.height * 0.75, c.h.height * 0.22, C.amber, { vertical: true, y: c.h.height * 0.3, from: 2.2, to: -0.5, dur: 0.3 })); },
      impact: c => { const p = at(c); decal(c.fx, p, ar(c, 0.42), 'crack', C.amber, { dark: 0.85, dur: 3.2, glow: 0.9 }); shock(c.fx, p, ar(c, 0.75), C.amber); dust(c, p); debris(c, p, 0x5a4636); embers(c, p, C.amber, 0.7); } },
    sweep: { windup: c => { chargeDecal(c.fx, c.at, tr(c) * 0.95, 'rune', C.rust, c.dur, -0.8); trail(c.fx, c.h, 'tipR', C.amber, c.dur, 0.5, 0.65); later(c.fx, Math.max(0, c.dur - 0.3), () => slash(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), c.fwd, tr(c) * 0.95, c.h.height * 0.3, C.amber, { y: c.h.height * 0.3, from: -2.4, to: 2.4, dur: 0.45, tail: 2.6 })); },
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); shock(c.fx, p, tr(c) * 1.05, C.amber, { layers: 3, dur: 0.7 }); decal(c.fx, p, tr(c) * 0.8, 'crack', C.rust, { dark: 0.6, dur: 2.6, glow: 0.6 });
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, q = p.clone().add(new THREE.Vector3(Math.cos(a) * tr(c) * 0.8, 0, Math.sin(a) * tr(c) * 0.8)); dust(c, q, 0.55); }
        embers(c, upY(p, c.h.height * 0.3), C.amber, 1.2); } },
    hook: { windup: c => { gather(c.fx, c.h, 'haL', C.soul, c.dur, 0.06); trail(c.fx, c.h, 'tipL', C.soul, c.dur, 0.3, 0.3); },
      impact: c => { const a = c.h.worldOf('haL') ?? upY(c.at, c.h.height * 0.6); const b = at(c, c.h.height * 1.6); b.y = c.at.y + c.h.height * 0.35;
        arc(c.fx, a, b, C.soul, { dur: 0.45, jag: 0.25, width: 0.14 }); arc(c.fx, a, b, C.amber, { dur: 0.3, jag: 0.4, width: 0.08 }); burst(c.fx, b, { n: 30, color: C.soul, size: 0.35, life: 0.5, speed: 7, up: 2, tex: 'spark', stretch: true, drag: 0.5 }); shock(c.fx, b, 3, C.soul, { y: 0.2 }); } },
    blood: { windup: c => gather(c.fx, c.h, 'haL', C.bloodHi, c.dur, 0.05),
      impact: c => { const p = at(c, c.h.height * 0.3); burst(c.fx, upY(p, c.h.height * 0.25), { n: 40, color: C.blood, size: 0.35, life: 1.1, dir: c.fwd.clone().setY(0.6), cone: 0.7, speed: 9, gravity: 14, drag: 0.3, add: false, opacity: 0.95 });
        decal(c.fx, p, ar(c, 0.45), 'splat', C.blood, { add: false, dur: 6, glow: 0.85, scaleIn: 0.3, hold: 0.6 }); burst(c.fx, upY(p, 0.4), { n: 14, color: C.bloodHi, size: 0.6, life: 0.6, speed: 3, up: 2 }); } },
    hooks: { windup: c => chargeDecal(c.fx, c.at, ar(c, 0.9), 'rune', C.soul, c.dur),
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); decal(c.fx, p, ar(c, 1.0), 'rune', C.soul, { dur: 2.5, spin: 0.6 }); shock(c.fx, p, ar(c, 1.3), C.soul); column(c.fx, at(c, c.h.height * 0.35), 0.6, c.h.height * 0.8, C.water, { dur: 0.8 }); burst(c.fx, upY(at(c, c.h.height * 0.35), 0.4), { n: 30, color: C.water, size: 0.3, life: 1, speed: 3, up: 7, gravity: 14 }); } },
    phase: { impact: c => { const p = at(c); decal(c.fx, p, ar(c, 0.8), 'crack', C.amber, { dark: 0.9, dur: 5, glow: 1 }); shock(c.fx, p, ar(c, 1.6), C.amber, { layers: 3, dur: 0.8 }); dust(c, p, 1.6); debris(c, p, 0x6a4a30, 1.8); embers(c, p, C.amber, 1.5);
      for (let i = 0; i < 6; i++) spikes(c.fx, p.clone().add(new THREE.Vector3(rnd(-1, 1) * c.h.height * 0.6, 0, rnd(-1, 1) * c.h.height * 0.6)), 1.2, 3, 0x4a3420, { h: 1.6, rough: 0.9, metal: 0, opacity: 1, dur: 2.2 }); } },
  },
  // ---------------- 萨琳：溺魂青绿
  wl_sarin: {
    melee: { windup: c => gather(c.fx, c.h, 'haR', C.soul, c.dur, 0.05),
      impact: c => { const a = c.h.worldOf('haR') ?? upY(c.at, c.h.height * 0.7); const b = at(c, c.h.height * 2.2); b.y = c.at.y + c.h.height * 0.4; arc(c.fx, a, b, C.soul, { dur: 0.3, jag: 0.12, width: 0.12, seg: 6 }); burst(c.fx, b, { n: 16, color: C.soul, size: 0.4, life: 0.5, speed: 4, up: 1.5 }); } },
    fog: { windup: c => gather(c.fx, c.h, 'haR', C.toxic, c.dur, 0.06),
      impact: c => { for (const p of teleOr(c)) fogPuff(c.fx, p, 2.6, 0x3a7a50, 3.2, 12, 0.25); burst(c.fx, upY(c.h.worldOf('haR') ?? c.at, 0), { n: 20, color: C.toxic, size: 0.5, life: 1, speed: 4, up: 1 }); } },
    shriek: { windup: c => { gather(c.fx, c.h, 'head', C.soul, c.dur, 0.1); chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 1.4), 'rune', C.soulDeep, c.dur, 0.6); },
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()), hd = c.h.worldOf('head') ?? upY(p, c.h.height * 0.9);
        for (let i = 0; i < 4; i++) later(c.fx, i * 0.11, () => shock(c.fx, { x: p.x, y: p.y, z: p.z }, ar(c, 1) * (1.9 + i * 0.4), i ? C.soulDeep : C.soul, { y: i * 0.6, dur: 0.9, layers: 0, opacity: 0.45 }));
        burst(c.fx, hd, { n: 40, color: C.soul, size: 0.7, life: 1.2, speed: 10, up: 1, drag: 0.6 }); burst(c.fx, hd, { n: 6, color: C.soulDeep, size: 0.9, life: 0.4, speed: 2, grow: 1.4 }); fogPuff(c.fx, p, 4, 0x2a6a5a, 2.5, 10, 0.2); } },
    mark: { windup: c => gather(c.fx, c.h, 'haL', C.ice, c.dur, 0.06),
      impact: c => { const a = c.h.worldOf('haL') ?? upY(c.at, c.h.height * 0.7), b = at(c, c.h.height * 2.5); b.y = c.at.y + c.h.height * 0.35; arc(c.fx, a, b, C.ice, { dur: 0.5, jag: 0.3, width: 0.15 }); decal(c.fx, b, 2.2, 'rune', C.soul, { dur: 2, spin: 1.5 }); burst(c.fx, b, { n: 24, color: C.ice, size: 0.3, life: 0.8, speed: 3, up: 3, gravity: 3 }); } },
    souls: { windup: c => chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 1.2), 'rune', C.soul, c.dur),
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283 + 0.5, q = p.clone().add(new THREE.Vector3(Math.cos(a) * c.h.height, 0, Math.sin(a) * c.h.height)); column(c.fx, q, 0.7, c.h.height * 0.9, C.soul, { dur: 1.2 }); fogPuff(c.fx, q, 1.6, 0x2a6a5a, 2, 6, 0.3); } } },
    phase: { impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); column(c.fx, p, c.h.height * 0.25, c.h.height * 1.6, C.soul, { dur: 1.6 }); shock(c.fx, p, ar(c, 2.5), C.soul, { layers: 3, dur: 1 }); fogPuff(c.fx, p, 5, 0x2a6a5a, 3, 14, 0.3); } },
  },
  // ---------------- 维尔格：寒誓冰蓝
  wl_virg: {
    melee: { windup: c => { trail(c.fx, c.h, 'tipR', C.ice, c.dur, 0.3, 0.6); later(c.fx, Math.max(0, c.dur - 0.3), () => slash(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), c.fwd, c.h.height * 0.7, c.h.height * 0.18, C.ice, { vertical: true, y: c.h.height * 0.3, from: 2.0, to: -0.4, dur: 0.28 })); },
      impact: c => { const p = at(c); decal(c.fx, p, ar(c, 0.35), 'frost', C.ice, { dur: 2.5, glow: 0.8 }); burst(c.fx, upY(p, 0.4), { n: 22, color: C.ice, size: 0.25, life: 0.9, speed: 5, up: 4, gravity: 12, tex: 'spark', stretch: true }); shock(c.fx, p, ar(c, 0.6), C.iceDeep); } },
    crack: { windup: c => { trail(c.fx, c.h, 'tipR', C.ice, c.dur, 0.35, 0.6); later(c.fx, Math.max(0, c.dur - 0.3), () => slash(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), c.fwd, c.h.height * 0.7, c.h.height * 0.2, C.ice, { vertical: true, y: c.h.height * 0.3, from: 2.3, to: -0.6, dur: 0.3 })); for (const p of teleOr(c)) chargeDecal(c.fx, p, tr(c), 'frost', C.iceDeep, c.dur, 0.3); },
      impact: c => { for (const p of teleOr(c)) { decal(c.fx, p, tr(c) * 1.05, 'crack', C.ice, { dark: 0.7, dur: 3.5 }); decal(c.fx, p, tr(c) * 0.9, 'frost', C.iceDeep, { dur: 2.5, glow: 0.7 }); spikes(c.fx, p, tr(c) * 0.75, 7, 0xcfefff, { h: 2.2, emissive: 0x2060a0 }); shock(c.fx, p, tr(c) * 1.2, C.ice); burst(c.fx, upY(p, 0.5), { n: 20, color: 0xe8f8ff, size: 0.6, life: 1.4, speed: 2, up: 1.2, tex: 'smoke', add: false, opacity: 0.6, grow: 1.2 }); } } },
    oath: { windup: c => { gather(c.fx, c.h, 'tipR', C.ice, c.dur, 0.12); chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 2.2), 'frost', C.iceDeep, c.dur, 0.25); },
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); shock(c.fx, p, ar(c, 2.8), C.iceDeep, { layers: 2, dur: 0.9 }); decal(c.fx, p, ar(c, 2.2), 'frost', C.iceDeep, { dur: 4, glow: 0.55 });
        for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, q = p.clone().add(new THREE.Vector3(Math.cos(a) * c.h.height * 1.8, 0, Math.sin(a) * c.h.height * 1.8)); spikes(c.fx, q, 1.2, 3, 0xcfefff, { h: 2.6, emissive: 0x2060a0, dur: 2.2 }); }
        column(c.fx, upY(c.h.worldOf('tipR') ?? p, -c.h.height * 0.8), 0.5, c.h.height * 2.2, C.ice, { dur: 1 }); burst(c.fx, upY(p, 1), { n: 50, color: 0xffffff, size: 0.22, life: 2, speed: 6, up: 2, gravity: 1.5, drag: 0.7 }); } },
    spike: { windup: c => { trail(c.fx, c.h, 'tipR', C.ice, c.dur, 0.3, 0.6); for (const p of teleOr(c)) chargeDecal(c.fx, p, tr(c), 'frost', C.iceDeep, c.dur, 0.5); },
      impact: c => { const p0 = at(c, c.h.height * 0.2); spikes(c.fx, p0, 1, 10, 0xcfefff, { along: c.fwd, len: c.h.height * 2.2, h: 2.4, emissive: 0x2060a0 }); for (const p of teleOr(c)) { spikes(c.fx, p, tr(c) * 0.7, 5, 0xcfefff, { h: 2.6, emissive: 0x2060a0 }); shock(c.fx, p, tr(c), C.ice); } } },
    bash: { windup: c => gather(c.fx, c.h, 'haL', C.ice, c.dur, 0.08),
      impact: c => { const p = upY(at(c, c.h.height * 0.35), c.h.height * 0.35); burst(c.fx, p, { n: 30, color: 0xffffff, size: 0.4, life: 0.5, dir: c.fwd, cone: 0.5, speed: 12, tex: 'spark', stretch: true, drag: 0.6 }); burst(c.fx, p, { n: 8, color: C.ice, size: 2.2, life: 0.35, speed: 1, grow: 1.5 }); shock(c.fx, at(c, c.h.height * 0.4), ar(c, 0.8), C.ice); } },
    guard: { windup: c => chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 1.1), 'rune', C.iceDeep, c.dur),
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()), side = new THREE.Vector3(c.fwd.z, 0, -c.fwd.x); for (let i = 0; i < 2; i++) { const q = p.clone().addScaledVector(side, i ? -c.h.height : c.h.height); column(c.fx, q, 0.8, c.h.height * 1.1, C.ice, { dur: 1.2 }); spikes(c.fx, q, 1, 4, 0xcfefff, { h: 1.8, emissive: 0x2060a0 }); } } },
    phase: { impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); decal(c.fx, p, ar(c, 2.4), 'frost', C.iceDeep, { dur: 6, glow: 0.5, hold: 0.5 }); shock(c.fx, p, ar(c, 3), C.iceDeep, { layers: 2, dur: 1.1 }); burst(c.fx, upY(p, 2), { n: 60, color: 0xffffff, size: 0.2, life: 3, speed: 4, up: 1, gravity: 0.8, drag: 0.6 }); column(c.fx, p, c.h.height * 0.3, c.h.height * 2, C.iceDeep, { dur: 1.4 }); } },
  },
  // ---------------- 摆渡死渡：紫幽 + 生死双色
  wl_ferry_death: {
    melee: { windup: c => trail(c.fx, c.h, 'tailR', C.violet, c.dur, 0.25, 0.4),
      impact: c => { const p = upY(at(c, c.h.height * 0.75), c.h.height * 0.4); burst(c.fx, p, { n: 22, color: C.violet, size: 0.3, life: 0.5, dir: c.fwd, cone: 0.4, speed: 9, tex: 'spark', stretch: true }); burst(c.fx, p, { n: 6, color: 0xffffff, size: 1.2, life: 0.25, speed: 0.5 }); } },
    oar: { windup: c => { trail(c.fx, c.h, 'tipR', C.violet, c.dur, 0.45, 0.7); later(c.fx, Math.max(0, c.dur - 0.3), () => slash(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), c.fwd, c.h.height * 1.1, c.h.height * 0.25, C.violet, { y: c.h.height * 0.4, from: -2.0, to: 1.6, dur: 0.4, tail: 2.2 })); for (const p of teleOr(c)) chargeDecal(c.fx, p, tr(c), 'rune', C.violetDeep, c.dur, 0.7); },
      impact: c => { for (const p of teleOr(c)) { column(c.fx, p, tr(c) * 0.35, c.h.height * 0.9, C.water, { dur: 0.9, opacity: 0.7 }); burst(c.fx, upY(p, 0.3), { n: 34, color: C.water, size: 0.32, life: 1.1, speed: 3.5, up: 8, gravity: 16, drag: 0.3, add: false, opacity: 0.85 }); shock(c.fx, p, tr(c) * 1.1, C.violet, { layers: 2 }); decal(c.fx, p, tr(c), 'rune', C.violet, { dur: 2, spin: -1 }); }
        shock(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 1.3), C.violet); } },
    death: { windup: c => { gather(c.fx, c.h, 'haL', C.violet, c.dur, 0.08); gather(c.fx, c.h, 'tipR', C.violetDeep, c.dur, 0.06); },
      impact: c => { const a = c.h.worldOf('haL') ?? upY(c.at, c.h.height * 0.6), b = at(c, c.h.height * 2.6); b.y = c.at.y + c.h.height * 0.35;
        arc(c.fx, a, b, C.violet, { dur: 0.55, jag: 0.35, width: 0.2 }); arc(c.fx, a, b, 0x1a0030, { dur: 0.6, jag: 0.6, width: 0.12 }); burst(c.fx, b, { n: 36, color: C.violet, size: 0.5, life: 0.9, speed: 5, up: 2, drag: 0.6 }); fogPuff(c.fx, b, 1.8, 0x2a1040, 2, 6, 0.3); } },
    life: { windup: c => { gather(c.fx, c.h, 'tipR', C.life, c.dur, 0.1); chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 0.9), 'rune', C.life, c.dur, 0.5); },
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); column(c.fx, p, c.h.height * 0.28, c.h.height * 1.4, C.life, { dur: 1.4, opacity: 0.6 }); burst(c.fx, upY(p, 0.5), { n: 40, color: C.life, size: 0.25, life: 1.6, speed: 1.5, up: 4, gravity: -1, drag: 0.6 }); shock(c.fx, p, ar(c, 1.2), C.life); } },
    ferry: { windup: c => trail(c.fx, c.h, 'tipR', C.soul, c.dur, 0.35, 0.5),
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 3; i++) { const q = p.clone().addScaledVector(c.fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.8 + i * 0.8), c.h.height * 1.2); column(c.fx, q, 0.7, c.h.height * 0.8, C.soul, { dur: 1.1 }); burst(c.fx, upY(q, 0.3), { n: 20, color: C.water, size: 0.3, life: 1, speed: 2.5, up: 6, gravity: 14, add: false, opacity: 0.8 }); } } },
    phase: { impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); shock(c.fx, p, ar(c, 2.6), C.violet, { layers: 3, dur: 1 }); column(c.fx, p, c.h.height * 0.3, c.h.height * 1.8, C.violet, { dur: 1.4 }); decal(c.fx, p, ar(c, 1.8), 'rune', C.violet, { dur: 4, spin: 0.5 }); burst(c.fx, upY(p, 1), { n: 50, color: C.violet, size: 0.3, life: 2, speed: 4, up: 3, drag: 0.6 }); } },
  },
  wl_ferry_life: {
    melee: { windup: c => trail(c.fx, c.h, 'tailR', C.life, c.dur, 0.25, 0.4),
      impact: c => { const p = upY(at(c, c.h.height * 0.75), c.h.height * 0.4); burst(c.fx, p, { n: 20, color: C.life, size: 0.3, life: 0.5, dir: c.fwd, cone: 0.4, speed: 9, tex: 'spark', stretch: true }); } },
    mend: { windup: c => { gather(c.fx, c.h, 'tipR', C.life, c.dur, 0.12); chargeDecal(c.fx, c.h.root.getWorldPosition(new THREE.Vector3()), ar(c, 0.8), 'rune', C.life, c.dur, 0.4); },
      impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); column(c.fx, p, c.h.height * 0.25, c.h.height * 1.2, C.life, { dur: 1.2, opacity: 0.6 }); burst(c.fx, upY(p, 0.5), { n: 30, color: C.life, size: 0.25, life: 1.4, speed: 1.5, up: 4, gravity: -1, drag: 0.6 }); } },
  },
  // ---------------- 莫尔维斯：深渊青 + 毒绿 + 水
  wl_morvis: {
    melee: { impact: c => { const p = at(c, c.h.height * 0.2); burst(c.fx, upY(p, 0.5), { n: 30, color: C.water, size: 0.35, life: 1, speed: 4, up: 7, gravity: 16, add: false, opacity: 0.85 }); shock(c.fx, p, ar(c, 0.5), C.abyss); } },
    bite: { windup: c => chargeDecal(c.fx, c.at, tr(c), 'rune', C.abyss, c.dur, 1.2),
      impact: c => { const p = at(c, c.h.height * 0.25); shock(c.fx, p, tr(c) * 1.1, C.abyss, { layers: 3 }); burst(c.fx, upY(p, 0.6), { n: 50, color: C.water, size: 0.4, life: 1.2, speed: 6, up: 9, gravity: 16, add: false, opacity: 0.85 }); column(c.fx, p, 1.2, c.h.height * 0.5, C.water, { dur: 0.7, opacity: 0.6 }); dust(c, p, 1.2, 0x3a4a50); } },
    surge: { windup: c => { for (const p of teleOr(c)) chargeDecal(c.fx, p, tr(c), 'rune', C.abyss, c.dur, 0.8); },
      impact: c => { for (const p of teleOr(c)) { column(c.fx, p, tr(c) * 0.5, c.h.height * 0.9, C.water, { dur: 1.1, opacity: 0.75 }); burst(c.fx, upY(p, 0.5), { n: 40, color: C.water, size: 0.4, life: 1.3, speed: 4, up: 11, gravity: 15, add: false, opacity: 0.85 }); shock(c.fx, p, tr(c) * 1.25, C.abyss, { layers: 2 }); decal(c.fx, p, tr(c), 'crack', C.abyss, { dark: 0.6, dur: 3 }); } } },
    lure: { windup: c => { gather(c.fx, c.h, 'lure', C.abyss, c.dur, 0.08); chargeDecal(c.fx, c.at, ar(c, 1.4), 'rune', 0x60ffff, c.dur, 1.6); },
      impact: c => { const p = c.h.worldOf('lure') ?? upY(c.at, c.h.height * 0.8); burst(c.fx, p, { n: 40, color: 0x80ffff, size: 0.6, life: 1, speed: 8, up: 0.5, drag: 0.5 }); burst(c.fx, p, { n: 10, color: 0xffffff, size: 3, life: 0.4, speed: 0.5, grow: 2 }); shock(c.fx, c.at, ar(c, 2), 0x60ffff, { layers: 3, dur: 0.9 }); } },
    drool: { impact: c => { const a = c.h.worldOf('jaw') ?? upY(c.at, c.h.height * 0.5); burst(c.fx, a, { n: 40, color: C.toxic, size: 0.35, life: 1.2, dir: c.fwd.clone().setY(0.2), cone: 0.8, speed: 8, gravity: 12, drag: 0.3, add: false, opacity: 0.9 }); for (const p of teleOr(c)) { decal(c.fx, p, tr(c) * 0.8, 'splat', C.toxic, { dur: 4, glow: 0.6, scaleIn: 0.4, hold: 0.5 }); fogPuff(c.fx, p, 2.2, 0x4a7a2a, 3, 8, 0.25); } } },
    eels: { impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283, q = p.clone().add(new THREE.Vector3(Math.cos(a) * c.h.height * 0.9, 0, Math.sin(a) * c.h.height * 0.9)); burst(c.fx, upY(q, 0.2), { n: 24, color: C.water, size: 0.3, life: 1.4, speed: 1.5, up: 5, gravity: 9, add: false, opacity: 0.8 }); decal(c.fx, q, 2.4, 'ring', C.abyss, { dur: 1.6 }); } } },
    flood: { impact: c => { for (const p of teleOr(c)) { shock(c.fx, p, tr(c) * 1.3, C.water, { layers: 3, dur: 1.2 }); burst(c.fx, upY(p, 0.3), { n: 30, color: C.water, size: 0.5, life: 1.6, speed: 5, up: 3, gravity: 6, add: false, opacity: 0.7 }); } } },
    phase: { impact: c => { const p = c.h.root.getWorldPosition(new THREE.Vector3()); shock(c.fx, p, ar(c, 2.2), C.abyss, { layers: 3, dur: 1.2 }); column(c.fx, p, c.h.height * 0.35, c.h.height * 1.3, C.water, { dur: 1.4, opacity: 0.7 }); burst(c.fx, upY(p, 1), { n: 60, color: C.water, size: 0.45, life: 1.8, speed: 6, up: 10, gravity: 14, add: false, opacity: 0.85 }); } },
  },
};
/** 招式 key 有没有专属特效 */
export const hasSkillFx = (id: string, key: string) => !!SKILL_FX[id]?.[key];
