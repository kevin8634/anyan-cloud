// ======================================================================
// v1.2.75 角色选择「画面背景」：内容包给 PackSelectStage.bg / bgVideo 时，选角画面不用实时 3D 场景，改成整屏背景（角色照常 3D 渲染在前面）。
// fix1106（Rhett 11-06 16:53）：原版把视频帧按 30 帧重画进一张最高 900 像素的 2D 画布再当贴图，视频是 24 帧 → 帧对不上（跳帧）、
//   画布缩到 900 再放大（发糊）；视频没起播前画的是静态底图 + 程序声环（几个大椭圆圈）/ 余烬 / 薄雾 / 剪影人。
//   现在：只用新的 03 宣发视频，VideoTexture 直接上屏（原生 1920×1080、每个视频帧更新一次），按视口 cover 裁切；
//   旧的程序动态（声环、余烬、薄雾、水面错动）删除；火把剪影人保留（Rhett 18:11），改画在视频上层、每帧平滑绘制。视频起播前背景保持纯黑（载入画面盖着），
//   只有视频确实放不了才用同一张静态底图（不加任何程序动态）。
//   选角期间把场景里除职业展示模型 / 玩家 / 灯光 / 光圈以外的顶层物体藏起来，离开时原样恢复
// ======================================================================
import * as THREE from 'three';

let vid: HTMLVideoElement | null = null, vidOk = false, vidSrcs: string[] = [], vi = 0, vidFail = false;
let img: HTMLImageElement | null = null, imgOk = false;
/** data URI → Blob URL（长 data URI 直接给 video 在部分浏览器里拖不动 / 不能循环） */
function blobUrl(u: string) {
  const m = /^data:([^;,]+);base64,/.exec(u); if (!m) return u;
  try { const bin = atob(u.slice(m[0].length)), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([a], { type: m[1] })); } catch { return u; }
}
let vtex: THREE.VideoTexture | null = null, itex: THREE.Texture | null = null;
const BLACK = new THREE.Color(0x020405);
let bg0: THREE.Color | THREE.Texture | null = null;
let fog0: THREE.Fog | THREE.FogExp2 | null = null;
const hid: THREE.Object3D[] = [];
let on = false;

export const selectBgOn = () => on;
export function selectBgInfo() {
  const cur = vidOk ? 'video' : vidFail && imgOk ? 'image' : 'black';
  return { on, cur, video: vid ? { src: vid.currentSrc.split('/').pop(), ok: vidOk, rs: vid.readyState, paused: vid.paused, err: vid.error?.code ?? 0, w: vid.videoWidth, h: vid.videoHeight } : null };
}

/** 视口 cover 裁切：贴图 repeat / offset（贴图宽高比 ta，视口宽高比 va） */
function cover(t: THREE.Texture, tw: number, th: number) {
  if (!tw || !th) return;
  const va = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), ta = tw / th;
  if (va > ta) { const k = ta / va; t.repeat.set(1, k); t.offset.set(0, (1 - k) / 2); }
  else { const k = va / ta; t.repeat.set(k, 1); t.offset.set((1 - k) / 2, 0); }
}
function onResize() { if (vtex && vid) cover(vtex, vid.videoWidth, vid.videoHeight); if (itex && img) cover(itex, img.naturalWidth, img.naturalHeight); }

/** 提前把视频建好开始解码（载入画面期间调用；选角进来时第一帧已就绪，不再从静态图跳到视频） */
export function selectBgPreload(bg: string, video: string[] | undefined) {
  if (video?.length && !vid) {
    vidSrcs = video.map(blobUrl); vi = 0;
    vid = document.createElement('video'); vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'auto'; vid.setAttribute('muted', '');
    vid.addEventListener('loadeddata', () => { vidOk = true; vidFail = false; onResize(); });
    vid.addEventListener('error', () => { vidOk = false; if (++vi < vidSrcs.length && vid) { vid.src = vidSrcs[vi]; void vid.play().catch(() => { /* 等 error */ }); } else { vidFail = true; console.warn('选角背景视频放不了，用静态底图'); } });
    vid.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(vid);   // 挂进 DOM：部分浏览器不给游离的 video 解码帧
    (window as unknown as { __selBg?: unknown }).__selBg = selectBgInfo;
    vid.src = vidSrcs[0];
  }
  if (!video?.length) vidFail = true;
  if (bg && !img) { img = new Image(); img.onload = () => { imgOk = true; onResize(); }; img.src = bg; }
}

/** 选角开始 */
export function selectBgEnter(scene: THREE.Scene, bg: string, video: string[] | undefined, keep: (o: THREE.Object3D) => boolean) {
  if (on) return;
  selectBgPreload(bg, video);
  on = true;
  if (vid && !vidFail) void vid.play().catch(() => { /* 自动播放被拒：muted 视频一般不会；拒了就等下一次交互 */ });
  bg0 = scene.background as THREE.Color | THREE.Texture | null; fog0 = scene.fog as THREE.Fog | null;
  hid.length = 0;
  for (const o of scene.children) if (o.visible && !(o as THREE.Light).isLight && !keep(o)) { o.visible = false; hid.push(o); }
  scene.fog = null; scene.background = BLACK;
  window.addEventListener('resize', onResize);
  folkOn(true);
  apply(scene);
}

/** 选角结束：恢复背景、雾和被藏的物体（视频暂停，贴图留着下次再进选角直接用） */
export function selectBgLeave(scene: THREE.Scene) {
  if (!on) return;
  on = false;
  for (const o of hid) o.visible = true; hid.length = 0;
  scene.background = bg0; scene.fog = fog0; bg0 = null; fog0 = null;
  try { vid?.pause(); } catch { /* 无 */ }
  window.removeEventListener('resize', onResize);
  folkOn(false);
}

function apply(scene: THREE.Scene) {
  if (vidOk && vid) {
    if (!vtex) { vtex = new THREE.VideoTexture(vid); vtex.colorSpace = THREE.SRGBColorSpace; vtex.minFilter = THREE.LinearFilter; vtex.magFilter = THREE.LinearFilter; vtex.generateMipmaps = false; cover(vtex, vid.videoWidth, vid.videoHeight); }
    if (scene.background !== vtex) scene.background = vtex;
    if (vid.paused) void vid.play().catch(() => { /* 无 */ });
    return;
  }
  if (vidFail && imgOk && img) {
    if (!itex) { itex = new THREE.Texture(img); itex.colorSpace = THREE.SRGBColorSpace; itex.minFilter = THREE.LinearFilter; itex.generateMipmaps = false; itex.needsUpdate = true; cover(itex, img.naturalWidth, img.naturalHeight); }
    if (scene.background !== itex) scene.background = itex;
    return;
  }
  if (scene.background !== BLACK) scene.background = BLACK;
}

/** 每帧：只切换背景来源（视频帧由 VideoTexture 按视频自身帧率更新，不再重画） */
export function selectBgTick(scene: THREE.Scene, dt: number) {
  if (!on) return;
  apply(scene); folkTick(dt);
}

// ---- fix1106（Rhett 11-06 18:11「火把人可以留着，只要不会乱跳就行」）：剪影人改画在视频上面一层透明 2D 画布（DOM，盖在 3D 画布上、首屏 UI 下），
//   按显示器实际分辨率、每个渲染帧都画（原来 30 帧节流 + 火光 11/23 rad/s 抖动 → 乱跳），火光改成慢呼吸、人晃动更轻
const IW = 1920, IH = 1080;
let fcv: HTMLCanvasElement | null = null, fg: CanvasRenderingContext2D | null = null, t = 0, sc = 1, ox = 0, oy = 0, reduced = false;
const X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
function folkSize() {
  if (!fcv) return; const d = Math.min(2, window.devicePixelRatio || 1), W = Math.round(window.innerWidth * d), H = Math.round(window.innerHeight * d);
  if (fcv.width !== W || fcv.height !== H) { fcv.width = W; fcv.height = H; }
  sc = Math.max(W / IW, H / IH); ox = (W - IW * sc) / 2; oy = (H - IH * sc) / 2;
}
function folkOn(v: boolean) {
  if (v && !fcv) { fcv = document.createElement('canvas'); fcv.id = 'sel-folk'; fcv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:29'; fg = fcv.getContext('2d'); try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; } }
  if (!fcv) return;
  if (v) { if (!fcv.isConnected) document.body.appendChild(fcv); folkSize(); window.addEventListener('resize', folkSize); }
  else { fcv.remove(); window.removeEventListener('resize', folkSize); }
}
function folkTick(dt: number) {
  if (!fcv || !fg) return; t += Math.min(0.1, dt);
  fg.clearRect(0, 0, fcv.width, fcv.height); drawFolk(fg);
}
// ---- v1.2.76 前景剪影人（Rhett 11-03 14:04）：几个披斗篷的人背对镜头望向倒钟，举着火把；火光闪动、人轻微晃动。纯程序绘制，零费用
//   x = 脚底中心（底图像素），h = 身高（像素），side = 火把在哪只手（1 右 / -1 左），ph = 相位
const FOLK = [
  { x: 330, h: 300, side: 1, ph: 0.0, hood: true },
  { x: 520, h: 236, side: -1, ph: 1.7, hood: false },
  { x: 1450, h: 262, side: 1, ph: 3.1, hood: true },
  { x: 1660, h: 318, side: -1, ph: 4.4, hood: true },
];
const FOOT_Y = 1052;
function drawFolk(c: CanvasRenderingContext2D) {
  for (const f of FOLK) {
    const k = f.h * sc, fx = X(f.x + (reduced ? 0 : Math.sin(t * 0.45 + f.ph) * 1.2)), fy = Y(FOOT_Y);
    const fl = reduced ? 1 : 0.86 + 0.09 * Math.sin(t * 3.1 + f.ph * 3) + 0.05 * Math.sin(t * 5.3 + f.ph);
    // 火把位置：举到头侧上方
    const tx = fx + f.side * k * 0.24, ty = fy - k * 1.06;
    // 地面暖光 + 周身火光（先画，人压在上面成剪影）
    c.globalCompositeOperation = 'lighter';
    let gr = c.createRadialGradient(tx, ty, 0, tx, ty, k * 0.95 * fl);
    gr.addColorStop(0, `rgba(255,170,70,${0.30 * fl})`); gr.addColorStop(0.35, `rgba(255,120,40,${0.12 * fl})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(tx - k, ty - k, k * 2, k * 2);
    gr = c.createRadialGradient(fx, fy, 0, fx, fy, k * 0.55);
    gr.addColorStop(0, `rgba(255,140,50,${0.16 * fl})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.translate(fx, fy); c.scale(1, 0.22); c.translate(-fx, -fy); c.fillStyle = gr; c.fillRect(fx - k, fy - k, k * 2, k * 2); c.restore();
    c.globalCompositeOperation = 'source-over';
    // 倒影（水面）：淡、竖向压扁
    c.save(); c.globalAlpha = 0.28; c.translate(fx, fy); c.scale(1, -0.45); c.translate(-fx, -fy); body(c, f, fx, fy, k); c.restore();
    body(c, f, fx, fy, k);
    // 火把杆 + 火焰
    c.strokeStyle = '#0a0705'; c.lineWidth = Math.max(1.5, k * 0.022); c.lineCap = 'round';
    c.beginPath(); c.moveTo(fx + f.side * k * 0.17, fy - k * 0.66); c.lineTo(tx, ty + k * 0.02); c.stroke();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const s2 = k * (0.07 - i * 0.018) * fl, wob = reduced ? 0 : Math.sin(t * 4.2 + i * 2 + f.ph) * s2 * 0.25;
      gr = c.createRadialGradient(tx + wob, ty - s2 * 0.9, 0, tx + wob, ty - s2 * 0.9, s2 * 1.6);
      gr.addColorStop(0, i === 2 ? 'rgba(255,250,220,0.95)' : 'rgba(255,200,90,0.85)'); gr.addColorStop(0.5, 'rgba(255,110,30,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(tx + wob, ty - s2 * 0.9, s2 * 0.8, s2 * 1.8, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    // 火光勾边：火把那一侧的肩 / 斗篷边一道暖色细边
    c.save(); c.globalAlpha = 0.55 * fl; c.strokeStyle = 'rgba(255,150,60,1)'; c.lineWidth = Math.max(1, k * 0.008);
    c.beginPath(); c.moveTo(fx + f.side * k * 0.12, fy - k * 0.86); c.quadraticCurveTo(fx + f.side * k * 0.2, fy - k * 0.5, fx + f.side * k * 0.2, fy - k * 0.08); c.stroke(); c.restore();
  }
}
/** 一个背对镜头的斗篷人（脚底在 fx,fy，身高 k） */
function body(c: CanvasRenderingContext2D, f: typeof FOLK[number], fx: number, fy: number, k: number) {
  c.fillStyle = '#05070a';
  c.beginPath();
  // 斗篷下摆（略宽）→ 腰 → 肩 → 头 / 兜帽
  c.moveTo(fx - k * 0.2, fy);
  c.quadraticCurveTo(fx - k * 0.19, fy - k * 0.4, fx - k * 0.15, fy - k * 0.78);
  c.quadraticCurveTo(fx - k * 0.14, fy - k * 0.84, fx - k * 0.07, fy - k * 0.86);
  if (f.hood) {
    c.quadraticCurveTo(fx - k * 0.085, fy - k * 0.99, fx - k * 0.01, fy - k * 1.02);
    c.quadraticCurveTo(fx + k * 0.08, fy - k * 0.99, fx + k * 0.07, fy - k * 0.86);
  } else {
    c.lineTo(fx - k * 0.04, fy - k * 0.87);
    c.arc(fx, fy - k * 0.92, k * 0.055, Math.PI * 0.85, Math.PI * 0.15, false);
    c.lineTo(fx + k * 0.07, fy - k * 0.86);
  }
  c.quadraticCurveTo(fx + k * 0.14, fy - k * 0.84, fx + k * 0.15, fy - k * 0.78);
  c.quadraticCurveTo(fx + k * 0.19, fy - k * 0.4, fx + k * 0.2, fy);
  c.closePath(); c.fill();
  // 举火把的手臂
  const sx = fx + f.side * k * 0.12, sy = fy - k * 0.8, hx = fx + f.side * k * 0.2, hy = fy - k * 0.66;
  c.strokeStyle = '#05070a'; c.lineCap = 'round'; c.lineWidth = k * 0.06;
  c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(fx + f.side * k * 0.22, fy - k * 0.74, hx, hy); c.stroke();
}
