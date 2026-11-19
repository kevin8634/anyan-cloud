// ======================================================================
// 11-16 营地写实程序件（从 src/dlc/dlc1/camp_real.ts 抽出的通用部分，本体与 DLC 共用）
//   帆布褶皱帐篷、风化木栅（原木桩 + 绳扎 + 横杆）、铁箍木箱、木桶；全部程序化几何 + canvas 贴图，零外部资产
//   随机序列（seed 4141 / 每个帐篷、木桩各自重置）与原 camp_real.ts 完全一致，DLC 营地外观不变
//   本体灰石营地（scenes.ts）中 / 高 / 超高画质换用这些件；低画质仍是 Q 版；?off=campdlc 回旧版
// ======================================================================
import * as THREE from 'three';
import { pbrTex } from './pbr_tex';

let offC: boolean | null = null;
/** 本体营地换写实件开关（?off=campdlc 或 localStorage darkrock_cine_off 含 campdlc → 旧版） */
export function campHdOn(): boolean {
  if (offC === null) {
    offC = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(s => s.trim()).includes('campdlc');
    } catch { offC = false; }
  }
  return !offC;
}


let seed = 4141; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noOutline = (o: THREE.Object3D) => { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; }); return o; };

// ---------------------------------------------------------------- 贴图
function canvasTex(W: number, H: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t;
}
let woodT: THREE.Texture | null = null, canvasT: THREE.Texture | null = null, plankT: THREE.Texture | null = null;
/** 风化木纹：竖向纹理 + 裂纹 + 节疤，灰褐 */
function woodTex(): THREE.Texture {
  return (woodT ??= canvasTex(128, 512, g => {
    g.fillStyle = '#6e604e'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 260; i++) { const x = rnd() * 128, w = 0.6 + rnd() * 2.2, l = rnd(); g.fillStyle = l < 0.5 ? `rgba(20,16,12,${0.15 + rnd() * 0.3})` : `rgba(140,128,112,${0.06 + rnd() * 0.12})`; g.fillRect(x, 0, w, 512); }
    for (let i = 0; i < 40; i++) { const x = rnd() * 128, y = rnd() * 512, h = 20 + rnd() * 90; g.fillStyle = 'rgba(10,8,6,0.55)'; g.fillRect(x, y, 1 + rnd(), h); }   // 干裂
    for (let i = 0; i < 6; i++) { const x = rnd() * 128, y = rnd() * 512; const r = g.createRadialGradient(x, y, 0, x, y, 7); r.addColorStop(0, 'rgba(18,12,8,0.9)'); r.addColorStop(1, 'rgba(18,12,8,0)'); g.fillStyle = r; g.fillRect(x - 8, y - 8, 16, 16); }
    const gr = g.createLinearGradient(0, 512, 0, 380); gr.addColorStop(0, 'rgba(14,20,16,0.6)'); gr.addColorStop(1, 'rgba(14,20,16,0)'); g.fillStyle = gr; g.fillRect(0, 380, 128, 132);   // 底部受潮发黑
  }));
}
/** 帆布：经纬织纹 + 水渍 + 下沿泥污（白底，材质色染） */
function canvasTexF(): THREE.Texture {
  return (canvasT ??= canvasTex(256, 256, g => {
    g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(90,80,64,${0.05 + rnd() * 0.06})`; g.fillRect(0, y, 256, 1); }
    for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(90,80,64,${0.04 + rnd() * 0.05})`; g.fillRect(x, 0, 1, 256); }
    for (let i = 0; i < 6; i++) { const x = rnd() * 256, y = rnd() * 256, r = 18 + rnd() * 50; const rg = g.createRadialGradient(x, y, r * 0.6, x, y, r); rg.addColorStop(0, 'rgba(70,60,44,0.04)'); rg.addColorStop(0.9, 'rgba(50,42,30,0.1)'); rg.addColorStop(1, 'rgba(50,42,30,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }   // 水渍圈
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(60,50,36,0.25)'; const x = rnd() * 240, y = rnd() * 240; g.fillRect(x, y, 14 + rnd() * 20, 10 + rnd() * 14); g.strokeStyle = 'rgba(40,32,22,0.5)'; g.strokeRect(x, y, 14 + rnd() * 20, 10 + rnd() * 14); }   // 补丁
  }));
}
/** 木箱板：横向木板 + 板缝 + 钉子 */
function plankTex(): THREE.Texture {
  return (plankT ??= canvasTex(256, 256, g => {
    g.fillStyle = '#6a5a48'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) { const y = i * 64; g.fillStyle = `rgba(${92 + rnd() * 30},${76 + rnd() * 20},${58 + rnd() * 14},1)`; g.fillRect(0, y + 2, 256, 60);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(20,16,12,${0.1 + rnd() * 0.25})`; g.fillRect(0, y + 2 + rnd() * 60, 256, 1); }
      g.fillStyle = '#16120e'; g.fillRect(0, y, 256, 3);
      for (const x of [14, 242]) { g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(x, y + 32, 3, 0, 7); g.fill(); } }
  }));
}
const mats: Record<string, THREE.MeshStandardMaterial> = {};
const M = {
  wood: () => (mats.wood ??= new THREE.MeshStandardMaterial({ map: woodTex(), color: 0xeae0d0, roughness: 0.92, metalness: 0, emissiveMap: woodTex(), emissive: 0x5c5446 })),
  plank: () => (mats.plank ??= new THREE.MeshStandardMaterial({ map: plankTex(), color: 0xe8dcc8, roughness: 0.9, metalness: 0, emissiveMap: plankTex(), emissive: 0x5c5446 })),
  iron: () => (mats.iron ??= pbrTex(new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.55, metalness: 0.6, emissive: 0x141210 }), 'iron', { s: 1.5, bump: 0.5 })),   // 11-16d 补贴图
  rust: () => (mats.rust ??= pbrTex(new THREE.MeshStandardMaterial({ color: 0x4a3022, roughness: 0.85, metalness: 0.35 }), 'iron', { s: 1.2, bump: 0.7 })),
  rope: () => (mats.rope ??= pbrTex(new THREE.MeshStandardMaterial({ color: 0x6a5c44, roughness: 1, metalness: 0 }), 'rope', { s: 4, bump: 0.6 })),
};

// ---------------------------------------------------------------- 帐篷：两坡帆布 + 中间下垂 + 斜向褶皱 + 后墙 + 掀开的门帘 + 立杆 / 横杆 / 拉绳 / 地钉
export function realTent(tint = 0x2a3a4a): THREE.Group {
  seed = 4141 + (tint & 0xff);
  const g = new THREE.Group(), L = 3.8, W = 1.85, Hr = 2.35, He = 0.28;
  const col = new THREE.Color(0x9a927e).lerp(new THREE.Color(tint), 0.22);   // 第四轮修：原来太暗，夜景里成黑剪影
  const cm = new THREE.MeshStandardMaterial({ map: canvasTexF(), color: col, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, emissiveMap: canvasTexF(), emissive: col.clone().multiplyScalar(0.22) });   // 夜景环境光弱：一点自发光托底，和发光地砖同一亮度档
  const slope = (s: number) => {   // s = ±1：左右坡
    const geo = new THREE.PlaneGeometry(1, 1, 18, 10), p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;   // u 沿屋脊（0 = 后，1 = 前），v 从屋檐（0）到屋脊（1）
      const z = (u - 0.5) * L, sag = Math.sin(u * Math.PI) * (1 - v) * 0.16 + Math.sin(u * Math.PI) * v * 0.06;   // 两根立杆之间下垂
      const fold = Math.sin((u * 7.5 + v * 2.4) * Math.PI) * 0.035 * (1 - v * 0.7) + Math.sin((u * 3.1 - v * 1.7) * Math.PI) * 0.03 + (rnd() - 0.5) * 0.01;
      const x = s * (W * (1 - v)) , y = He + (Hr - He) * v;
      const nx = s * (Hr - He), ny = W; const nl = Math.hypot(nx, ny);   // 坡面法线（朝外）
      const d = fold - sag;
      p.setXYZ(i, x + nx / nl * d, y + ny / nl * d + (v < 0.06 ? -0.05 : 0), z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, cm); m.castShadow = true; m.receiveShadow = true; return m;
  };
  g.add(slope(-1), slope(1));
  // 后墙（三角）+ 前门两片门帘（一片掀开挂起）
  const tri = (pts: number[][]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, cm); m.castShadow = true; return m; };
  g.add(tri([[-W, He, -L / 2], [W, He, -L / 2], [0, Hr, -L / 2]]));
  const flapL = tri([[-W, He, L / 2], [-0.05, He - 0.2, L / 2 + 0.05], [0, Hr, L / 2]]); g.add(flapL);
  const flapR = tri([[0.05, He - 0.2, 0], [W, He, 0], [0, Hr - 0.1, 0]]); flapR.position.set(0, 0, L / 2); flapR.rotation.y = -1.05; flapR.position.x = 0.15; g.add(flapR);   // 掀开
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 })); dark.position.set(0.25, 0.95, L / 2 - 0.25); g.add(dark);   // 帐内暗处
  // 立杆 + 屋脊杆
  const wm = M.wood();
  for (const z of [-L / 2 - 0.05, L / 2 + 0.05]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, Hr + 0.25, 7), wm); p.position.set(0, (Hr + 0.25) / 2, z); p.castShadow = true; g.add(p); }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, L + 0.3, 7), wm); ridge.rotation.x = Math.PI / 2; ridge.position.y = Hr + 0.02; g.add(ridge);
  // 拉绳 + 地钉：两头屋脊各一根，沿屋檐各三根
  const rope = (a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, d.length(), 4), M.rope()); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m);
    const peg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), wm); peg.position.set(b.x, 0.08, b.z); peg.rotation.z = 0.25; g.add(peg); };
  rope(new THREE.Vector3(0, Hr + 0.1, -L / 2 - 0.05), new THREE.Vector3(0, 0, -L / 2 - 1.4));
  rope(new THREE.Vector3(0, Hr + 0.1, L / 2 + 0.05), new THREE.Vector3(0.3, 0, L / 2 + 1.4));
  for (const s of [-1, 1]) for (const z of [-L * 0.42, 0, L * 0.42]) rope(new THREE.Vector3(s * W * 0.98, He + 0.05, z), new THREE.Vector3(s * (W + 0.75), 0, z));
  // 门口杂物：一卷铺盖 + 一只木桶
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x3e3a32, roughness: 1 })); roll.rotation.z = Math.PI / 2; roll.position.set(-1.1, 0.16, L / 2 + 0.5); g.add(roll);
  const b = realBarrel(0.75); b.position.set(1.35, 0, L / 2 + 0.4); g.add(b);
  return noOutline(g) as THREE.Group;
}

// ---------------------------------------------------------------- 风化木栅：歪斜的原木桩 + 削尖 + 绳扎 + 两道横杆（fix1107 起由 wild.ts 按相邻桩实际位置连；门口不连）
let stakeGeo: THREE.BufferGeometry | null = null;
export function realStake(a: number, h: number): THREE.Group {
  seed = 900 + Math.floor(a * 1000);
  stakeGeo ??= (() => { const geo = new THREE.CylinderGeometry(0.12, 0.15, 1, 9, 6), p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), k = 1 + Math.sin(Math.atan2(z, x) * 3 + y * 5) * 0.06 + Math.sin(y * 13) * 0.03; p.setXYZ(i, x * k, y, z * k); }
    geo.translate(0, 0.5, 0); geo.computeVertexNormals(); return geo; })();
  const g = new THREE.Group(), wm = M.wood(), k = 0.85 + rnd() * 0.3;
  const post = new THREE.Group(); post.rotation.set((rnd() - 0.5) * 0.09, rnd() * 6.283, (rnd() - 0.5) * 0.09); g.add(post);
  const body = new THREE.Mesh(stakeGeo, wm); body.scale.set(k, h, k); body.castShadow = true; body.receiveShadow = true; post.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.135 * k, 0.42, 9, 1), wm); tip.position.y = h + 0.21; tip.rotation.y = rnd(); tip.castShadow = true; post.add(tip);
  for (const y of [h * 0.28, h * 0.72]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.14 * k, 0.018, 5, 12), M.rope()); r.rotation.x = Math.PI / 2; r.position.y = y; post.add(r); }
  // fix1107（Rhett：营地栅栏乱七八糟）：原来每根桩按「营地半径 12、平地」自己朝切向伸两根横杆，桩高随机、地面起伏 → 横杆和下一根桩对不上、悬空 / 插地。
  //   现在横杆由本体 wild.ts 在两根相邻桩都摆好后按两桩实际位置（含地面高度）连（userData.railTo），高度固定离地 0.4 / 0.95 米；门口两侧不连
  post.rotation.x *= 0.4; post.rotation.z *= 0.4;   // 桩只轻微歪斜，横杆能搭在桩上
  g.userData.railTo = realRail;
  return noOutline(g) as THREE.Group;
}
/** 两根相邻木桩之间的两道横杆（a、b = 两桩底部在父节点里的坐标） */
export function realRail(a: THREE.Vector3, b: THREE.Vector3): THREE.Object3D {
  const g = new THREE.Group(), wm = M.wood();
  for (const y of [0.4, 0.95]) {
    const p = a.clone().setY(a.y + y + (rnd() - 0.5) * 0.04), q = b.clone().setY(b.y + y + (rnd() - 0.5) * 0.04), d = q.clone().sub(p), L = d.length();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, L + 0.2, 6), wm);
    rail.position.copy(p).addScaledVector(d, 0.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); rail.castShadow = true; g.add(rail);
  }
  return noOutline(g);
}

// ---------------------------------------------------------------- 铁箍木箱 / 木桶
export function realCrate(s = 0.9): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), M.plank()); box.position.y = s / 2; box.castShadow = true; box.receiveShadow = true; g.add(box);
  const im = M.iron(), e = s * 0.06;
  for (const y of [e, s - e]) for (const [w, d] of [[s + 0.02, e * 0.6], [e * 0.6, s + 0.02]]) for (const o of [-1, 1]) {   // 上下两圈铁边
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, e * 1.6, d), im); b.position.set(w < s ? o * s / 2 : 0, y, d < s ? o * s / 2 : 0); g.add(b); }
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(e * 1.1, s + 0.02, e * 1.1), M.rust()); b.position.set(x * s / 2, s / 2, z * s / 2); g.add(b); }   // 四角铁护角
  return noOutline(g) as THREE.Group;
}
export function realBarrel(hh = 0.95): THREE.Group {
  const g = new THREE.Group(), P: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; P.push(new THREE.Vector2(0.3 + Math.sin(t * Math.PI) * 0.06, t * hh)); }
  const geo = new THREE.LatheGeometry(P, 18), body = new THREE.Mesh(geo, M.wood()); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), M.plank()); lid.rotation.x = -Math.PI / 2; lid.position.y = hh - 0.02; g.add(lid);
  for (const t of [0.1, 0.32, 0.68, 0.9]) { const r = 0.3 + Math.sin(t * Math.PI) * 0.06 + 0.008, h = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 4, 22), M.iron()); h.rotation.x = Math.PI / 2; h.position.y = t * hh; g.add(h); }
  return noOutline(g) as THREE.Group;
}
/** 'crate' 位置：铁箍木箱 + 叠一只小箱 + 旁边两只木桶 */
export function realCrateStack(): THREE.Group {
  const g = new THREE.Group();
  const a = realCrate(0.9); a.rotation.y = 0.2; g.add(a);
  const b = realCrate(0.6); b.position.set(0.05, 0.9, 0.05); b.rotation.y = 0.75; g.add(b);
  const c = realBarrel(0.95); c.position.set(-0.85, 0, 0.35); g.add(c);
  const d = realBarrel(0.8); d.position.set(0.75, 0, 0.75); d.rotation.y = 1; g.add(d);
  return g;
}
