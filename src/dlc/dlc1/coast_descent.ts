// ======================================================================
// DLC1 v1.2.71 潮音钟门下行过场（约 13 秒）：独立全屏 WebGL 画布（同 forgeshow 做法，不动本体镜头）
//   黑场淡入 → 镜头沿井筒螺旋阶梯下降（石壁、四幅鸣钟人壁画、火把光）→ 井底潮水倒退、露出黑沙与一口沉钟 → 白青色闪光淡出 → 回调（传送到海岸）
//   点击 / Esc / 空格 1 秒后可跳过；WebGL 不可用 = 只做淡入淡出；speed > 1 加速（测试用）
// ======================================================================
import * as THREE from 'three';
import { sceneOr } from './lux_dlc';
import { curQuality } from '../../web/gfx';
import { bellMesh } from './coast_kit';
import { rippleNormal, waterUp, waterBind } from './water_fx';

export const descentState = { on: false, t: 0, stage: '', skipped: false, frames: 0, webgl: false };
const DUR = 12.5;
const SUBS: [number, string][] = [[0.6, '钟声沿着井壁，一圈一圈落了下去'], [3.6, '井水在退——像潮水一样'], [6.6, '壁画上，鸣钟人把一口钟沉进了海里'], [9.6, '……下面，是海']];

function mural(kind: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d')!;
  g.fillStyle = '#3a3a34'; g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40},${20 + Math.random() * 40},${18 + Math.random() * 30},0.25)`; g.fillRect(Math.random() * 256, Math.random() * 192, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  g.strokeStyle = '#c8b27a'; g.fillStyle = '#8a6a3a'; g.lineWidth = 3; g.strokeRect(8, 8, 240, 176);
  g.fillStyle = '#5ad0c0'; g.strokeStyle = '#d8c48a';
  const bell = (x: number, y: number, s: number) => { g.beginPath(); g.moveTo(x - 10 * s, y); g.quadraticCurveTo(x - 9 * s, y - 22 * s, x, y - 24 * s); g.quadraticCurveTo(x + 9 * s, y - 22 * s, x + 10 * s, y); g.closePath(); g.fillStyle = '#9a7a3a'; g.fill(); g.stroke(); };
  const waves = (y: number) => { g.strokeStyle = '#5ad0c0'; g.beginPath(); for (let x = 16; x < 240; x += 4) g.lineTo(x, y + Math.sin(x * 0.12) * 5); g.stroke(); };
  const man = (x: number, y: number) => { g.fillStyle = '#d8c48a'; g.beginPath(); g.arc(x, y - 30, 5, 0, 7); g.fill(); g.fillRect(x - 3, y - 25, 6, 22); };
  if (kind === 0) { bell(128, 120, 2.6); man(70, 150); man(186, 150); waves(160); }
  else if (kind === 1) { waves(70); waves(95); waves(120); bell(128, 170, 1.4); g.fillStyle = '#5ad0c0'; g.fillRect(126, 20, 4, 60); }
  else if (kind === 2) { g.fillStyle = '#c8b27a'; g.beginPath(); g.ellipse(128, 100, 90, 30, 0, 0, 7); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(70 + i * 19, 100, 22, Math.PI, 0); g.stroke(); } bell(128, 92, 0.9); waves(150); }
  else { for (let i = 0; i < 9; i++) { g.fillStyle = '#8a8a7a'; g.fillRect(24 + i * 24, 14, 12, 30 + (i % 3) * 18); } bell(128, 170, 2); waves(176); man(128, 120); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stoneTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d')!;
  g.fillStyle = '#4a4a46'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -24 : 0; x < 256; x += 48) { const v = 60 + Math.random() * 30; g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(x + 2, y + 2, 44, 28); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function playDescent(speed: number, done: () => void) {
  if (descentState.on) return;
  Object.assign(descentState, { on: true, t: 0, stage: 'fade', skipped: false, frames: 0, webgl: false });
  const wrap = document.createElement('div'); wrap.id = 'd1-descent';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000;opacity:0;transition:opacity .6s;pointer-events:auto;cursor:default';
  const sub = document.createElement('div'); sub.style.cssText = 'position:absolute;left:0;right:0;bottom:12%;text-align:center;color:#cfeee8;font:500 20px/1.5 serif;letter-spacing:.12em;text-shadow:0 2px 6px #000;opacity:0;transition:opacity .8s';
  const skip = document.createElement('div'); skip.textContent = '跳过 ▶'; skip.style.cssText = 'position:absolute;right:22px;bottom:20px;color:#9ab;font:13px system-ui;opacity:.0;transition:opacity .5s';
  const veil = document.createElement('div'); veil.style.cssText = 'position:absolute;inset:0;background:#dff8f2;opacity:0;pointer-events:none';
  document.body.appendChild(wrap);
  let renderer: THREE.WebGLRenderer | null = null; const lowQ = curQuality === 'low';
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 200);
  scene.fog = new THREE.FogExp2(0x061012, 0.05); scene.background = new THREE.Color(0x020405);
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowQ }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowQ ? 1 : 1.5)); renderer.setSize(innerWidth, innerHeight);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; wrap.appendChild(renderer.domElement); descentState.webgl = true;
  } catch { renderer = null; }
  wrap.append(veil, sub, skip);
  // 场景：井筒 + 螺旋阶梯 + 壁画 + 火把 + 井底退潮
  const R = 4, H = 34;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, lowQ ? 20 : 40, 1, true), new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.95, side: THREE.BackSide })); shaft.position.y = -H / 2 + 2; scene.add(shaft);
  const stepG = new THREE.BoxGeometry(1.7, 0.22, 0.9), stepM = new THREE.MeshStandardMaterial({ color: 0x5a5a52, roughness: 0.9 });
  const N = lowQ ? 70 : 120, steps = new THREE.InstancedMesh(stepG, stepM, N), o = new THREE.Object3D();
  for (let i = 0; i < N; i++) { const a = i * 0.32, y = -i * 0.27; o.position.set(Math.cos(a) * (R - 0.9), y, Math.sin(a) * (R - 0.9)); o.rotation.set(0, -a, 0); o.updateMatrix(); steps.setMatrixAt(i, o.matrix); }
  scene.add(steps);
  for (let k = 0; k < 4; k++) { const a = k * 1.9 + 0.8, y = -4 - k * 6.5, p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshStandardMaterial({ map: mural(k), roughness: 0.9 })); p.position.set(Math.cos(a) * (R - 0.05), y, Math.sin(a) * (R - 0.05)); p.lookAt(0, y, 0); scene.add(p); }
  const torches: THREE.PointLight[] = [];
  for (let k = 0; k < 5; k++) { const a = k * 1.5 + 0.2, y = -2 - k * 6, l = new THREE.PointLight(0xff9a50, 6, 9, 2); l.position.set(Math.cos(a) * (R - 0.4), y + 1.2, Math.sin(a) * (R - 0.4)); scene.add(l); torches.push(l);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 })); f.position.copy(l.position); scene.add(f); }
  scene.add(new THREE.HemisphereLight(0x8ad0d0, 0x101010, 0.35));
  const camLight = new THREE.PointLight(0xbfe8e0, 3, 7, 2); scene.add(camLight);
  // 井底：潮水（倒退）+ 黑沙 + 沉钟
  const floorY = -H + 4;
  const sand = new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.95 })); sand.rotation.x = -Math.PI / 2; sand.position.y = floorY; scene.add(sand);
  // 11-14d Rhett：沉钟改用已有模型 scene_bell（本身就是侧倒的沉钟；低画质回退程序钟）
  const bellG = lowQ ? null : sceneOr('scene_bell', { w: 3.6 }, () => null);
  if (bellG) { bellG.position.set(0.6, floorY - 0.3, -0.8); bellG.rotation.y = 0.7; scene.add(bellG); }
  else { const bell = bellMesh(1.3, lowQ ? 12 : 24); bell.rotation.z = 1.2; bell.position.set(0.6, floorY + 0.5, -0.8); scene.add(bell); }
  const water = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshStandardMaterial({ color: 0x0c4a48, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85, emissive: 0x0a3a38, emissiveIntensity: 0.7 }));
  water.rotation.x = -Math.PI / 2; water.position.y = floorY + 6; scene.add(water);
  { // 11-07 水体续：井内水面加流动细波纹法线（原为镜面平板）；边缘贴着井壁，不做软边
    const wm = water.material as THREE.MeshStandardMaterial, nm = rippleNormal().clone(); nm.repeat.set(R / 2, R / 2); nm.needsUpdate = true;
    wm.normalMap = nm; wm.normalScale = new THREE.Vector2(0.35, 0.35); wm.roughness = 0.14; wm.needsUpdate = true;
    water.onBeforeRender = () => { const t = performance.now() / 1000; nm.offset.set(t * 0.015, t * 0.022); };
    waterUp(wm, { ql: true, edge: 'radial', shallow: 0x2a9088, deep: 0x0a3a38, sky: 0xa8d0d0, foamW: 0.1, depth: 6 }, lowQ); waterBind(water); }   // 11-07 统一水体；11-17 v2：井底沙地在水面下 6 米（吸收按真实水深）
  const glow = new THREE.PointLight(0x40e8d8, 10, 18, 2); glow.position.set(0, floorY + 1, 0); scene.add(glow);

  let last = performance.now(), dead = false, canSkip = false;
  const finish = (skipped: boolean) => {
    if (dead) return; dead = true; descentState.skipped = skipped; descentState.stage = 'out';
    veil.style.transition = 'opacity .45s'; veil.style.opacity = '1';
    setTimeout(() => { try { done(); } catch (e) { console.error('下行过场回调出错', e); }
      wrap.style.opacity = '0'; setTimeout(() => { wrap.remove(); renderer?.dispose(); scene.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose?.(); }); descentState.on = false; descentState.stage = ''; }, 650); }, 480 / Math.max(1, speed));
  };
  const onKey = (e: KeyboardEvent) => { if (canSkip && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); off(); finish(true); } };
  const onClick = () => { if (canSkip) { off(); finish(true); } };
  const off = () => { removeEventListener('keydown', onKey, true); wrap.removeEventListener('click', onClick); };
  addEventListener('keydown', onKey, true); wrap.addEventListener('click', onClick);
  requestAnimationFrame(() => { wrap.style.opacity = '1'; });
  let si = -1;
  const tick = () => {
    if (dead) return;
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000) * speed; last = now;
    const t = (descentState.t += dt); descentState.frames++;
    if (t > 1 / Math.max(1, speed) && !canSkip) { canSkip = true; skip.style.opacity = '0.8'; }
    const k = Math.min(1, t / DUR), e = k * k * (3 - 2 * k);
    // 镜头沿阶梯螺旋下降（略高于台阶、朝内下方看）
    const a = t * 0.55 + 0.3, y = 1.2 - e * (H - 7.5), rr = R - 1.6;
    cam.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const la = a + 0.9; cam.lookAt(Math.cos(la) * 0.6, y - 2.2 - e * 2, Math.sin(la) * 0.6);
    camLight.position.copy(cam.position);
    torches.forEach((l, i) => { l.intensity = 6 * (0.85 + 0.15 * Math.sin(now * 0.012 + i * 2)); });
    // 潮水倒退：井底水面从 +6 退到沉钟以下
    water.position.y = floorY + 6 - Math.min(1, Math.max(0, (t - 3) / 7)) * 6.4; (water.material as THREE.MeshStandardMaterial).opacity = 0.85 - Math.max(0, (t - 8) / 4) * 0.5;
    descentState.stage = t < 3.6 ? 'stairs' : t < 6.6 ? 'tide' : t < 9.6 ? 'mural' : 'reveal';
    const ns = SUBS.filter(s => t >= s[0]).length - 1;
    if (ns !== si) { si = ns; sub.style.opacity = '0'; setTimeout(() => { if (si >= 0) { sub.textContent = SUBS[si][1]; sub.style.opacity = '1'; } }, 300); }
    if (t > DUR - 1.2) veil.style.opacity = String(Math.min(0.9, (t - (DUR - 1.2)) / 1.2));
    if (renderer) { if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); } renderer.render(scene, cam); }
    if (t >= DUR) { off(); finish(false); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
