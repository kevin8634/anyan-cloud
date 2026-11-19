// ======================================================================
// 11-15 河面平面镜面反射（第 15 步 Real water reflection；思路同 three.js examples Reflector（MIT），代码本项目重写）
//   · 只在 高 / 超高 档开（中 / 低档走水面着色器里的天空 + 岸色兜底），?off=riverrefl 关
//   · ½ 分辨率 HalfFloat RT；以河面平均高度为镜面；每 2 帧更新一次（中间那帧沿用上次的纹理矩阵，世界坐标投影仍然对得上）
//   · 反射相机剔除：草 / 花实例（小而多的 InstancedMesh）、粒子（Points / Sprite）、天空穹顶、水面自己、userData.noRefl
//   · 天空不进 RT：清成 alpha = 0，水面着色器按 alpha 把物体倒影叠在原来的程序化天空反射上
//   · 斜裁剪近平面（oblique near plane）裁掉镜面以下的东西
// ======================================================================
import * as THREE from 'three';

let _off = false;
try { _off = typeof location !== 'undefined' && (new URLSearchParams(location.search).get('off') || '').split(',').some(s => s.trim() === 'riverrefl'); } catch { /* 读不到就开 */ }
try { if (typeof localStorage !== 'undefined' && (localStorage.getItem('darkrock_cine_off') || '').split(',').some(s => s.trim() === 'riverrefl')) _off = true; } catch { /* ignore */ }
/** ?off=riverrefl 关掉（运行时也可改） */
export const RIVER_REFL = { off: _off, every: 2, scale: 0.5, renders: 0, lastScale: 0, lastSky: false };

/** 水面着色器共用的 uniform（值按引用共享） */
export const riverReflU = {
  uRefl: { value: null as THREE.Texture | null },
  uReflM: { value: new THREE.Matrix4() },
  uReflP: { value: new THREE.Vector4(0, 0, 0, 0) },   // x = 镜面高度，y = 有效（0/1），z = 1 / 曝光
};

let rt: THREE.WebGLRenderTarget | null = null;
const cam = new THREE.PerspectiveCamera();
const _n = new THREE.Vector3(0, 1, 0), _mp = new THREE.Vector3(), _cp = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3();
const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), _sz = new THREE.Vector2(), _cc = new THREE.Color();
let frame = 0, lastFrame = -99, lastCam: THREE.Camera | null = null, inRender = false;
let hideList: THREE.Object3D[] = [], hideAt = -999, hideScene: THREE.Object3D | null = null;
const waterMats = new WeakSet<THREE.Material>();
let skyObj: THREE.Object3D | null = null;

export function riverReflMarkWater(m: THREE.Material) { waterMats.add(m); }
export function riverReflSetSky(o: THREE.Object3D) { skyObj = o; }
/** 每帧调一次（cineUpdate 里） */
export function riverReflFrame() { frame++; }

function isGrassLike(o: THREE.Object3D) {
  const im = o as THREE.InstancedMesh;
  if (!im.isInstancedMesh) return false;
  if (o.userData.refl === true) return false;
  const g = im.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
  return im.count > 150 && (g.boundingSphere?.radius ?? 9) < 1.6;   // 草叶 / 花 / 小石子：小而多
}
function rebuildHide(scene: THREE.Object3D) {
  hideList = [];
  scene.traverse(o => {
    if (o === scene) return;
    const m = o as THREE.Mesh, mt = m.material as THREE.Material | undefined;
    if ((o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || o.userData.noRefl || o === skyObj || isGrassLike(o)
      || (mt && !Array.isArray(mt) && waterMats.has(mt))) hideList.push(o);
  });
  hideAt = frame; hideScene = scene;
}

/** 水面材质 onBeforeRender 里调：必要时重画反射 RT。planeY = 河面平均高度（世界），exposure = 天空曝光（倒影里要除掉） */
/** 11-19 qlmirror：每个调用方自带 RT 比例 / 隔几帧 / 是否画天空（不再改写全局 RIVER_REFL.scale / every，原野河与 DLC 不互相踩）。
 *  不传 = 沿用 RIVER_REFL.scale / every、天空不进 RT（C22 旧行为） */
export type RiverReflOpt = { scale?: number; every?: number; sky?: boolean };
export function riverReflUpdate(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, planeY: number, exposure: number, opt?: RiverReflOpt) {
  const every = opt?.every ?? RIVER_REFL.every, scale = opt?.scale ?? RIVER_REFL.scale, withSky = !!opt?.sky;
  const P = riverReflU.uReflP.value;
  P.z = 1 / Math.max(exposure, 1e-3);
  if (RIVER_REFL.off) { P.y = 0; return; }
  if (inRender || camera === cam || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
  if (frame === lastFrame && camera === lastCam) return;            // 一帧只画一次
  if (lastFrame >= 0 && frame - lastFrame < every && camera === lastCam && rt) return;   // 每 every 帧（C22 默认 2）
  const pc = camera as THREE.PerspectiveCamera;
  _cp.setFromMatrixPosition(pc.matrixWorld);
  if (_cp.y <= planeY + 0.02) { P.y = 0; return; }                  // 相机在水下 / 贴水面：不画
  lastFrame = frame; lastCam = camera;

  // RT 尺寸：当前渲染目标（后期 composer 的缓冲）或画布 × ½
  const cur = renderer.getRenderTarget();
  if (cur) _sz.set(cur.width, cur.height); else renderer.getDrawingBufferSize(_sz);
  const w = Math.max(64, Math.round(_sz.x * scale)), h = Math.max(64, Math.round(_sz.y * scale));
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
    rt.texture.name = 'riverRefl';
    riverReflU.uRefl.value = rt.texture;
  } else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

  // 镜像相机（同 Reflector：位置 / 视线 / up 都对镜面反射）
  _mp.set(0, planeY, 0);
  _view.set(_cp.x, 2 * planeY - _cp.y, _cp.z);
  _rot.extractRotation(pc.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
  _tgt.set(_look.x, 2 * planeY - _look.y, _look.z);
  cam.position.copy(_view);
  cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
  cam.lookAt(_tgt);
  cam.near = pc.near; cam.far = pc.far;
  cam.updateMatrixWorld();
  cam.projectionMatrix.copy(pc.projectionMatrix);
  cam.layers.mask = pc.layers.mask;

  // 纹理矩阵：世界 → 反射图 uv
  const M = riverReflU.uReflM.value;
  M.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  M.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

  // 斜裁剪：近平面换成镜面（略往下偏 3 厘米，岸线不漏缝）
  _plane.setFromNormalAndCoplanarPoint(_n, _mp.set(0, planeY - 0.03, 0)).applyMatrix4(cam.matrixWorldInverse);
  _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const pm = cam.projectionMatrix, e = pm.elements;
  _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
  _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
  _q.z = -1.0;
  _q.w = (1.0 + e[10]) / e[14];
  _clip.multiplyScalar(2.0 / _clip.dot(_q));
  e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1.0; e[14] = _clip.w;

  // 剔除表（每 120 帧或换场景重扫一次）
  if (hideScene !== scene || frame - hideAt > 120) rebuildHide(scene);
  const vis: boolean[] = [];
  for (let i = 0; i < hideList.length; i++) { vis.push(hideList[i].visible); if (!(withSky && hideList[i] === skyObj)) hideList[i].visible = false; }   // qlmirror：r8 镜面含天空球
  const bg = scene.background, env = scene.environment;
  const sm = renderer.shadowMap.autoUpdate, xr = renderer.xr.enabled;
  const ca = renderer.getClearAlpha(); renderer.getClearColor(_cc);
  inRender = true;
  try {
    scene.background = null;
    renderer.shadowMap.autoUpdate = false; renderer.xr.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.state.buffers.depth.setMask(true);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, cam);
    RIVER_REFL.renders++; RIVER_REFL.lastScale = scale; RIVER_REFL.lastSky = withSky;
  } finally {
    inRender = false;
    scene.background = bg; scene.environment = env;
    renderer.shadowMap.autoUpdate = sm; renderer.xr.enabled = xr;
    renderer.setClearColor(_cc, ca);
    renderer.setRenderTarget(cur);
    for (let i = 0; i < hideList.length; i++) hideList[i].visible = vis[i];
  }
  P.x = planeY; P.y = 1;
}

/** 着色器片段：采样倒影（ofs = 已按视线方向扰动好的 uv 偏移）。返回 rgb = 倒影（已除曝光）、a = 覆盖度（0 = 天空） */
export const RIVER_REFL_GLSL = /* glsl */ `
uniform sampler2D uRefl; uniform mat4 uReflM; uniform vec4 uReflP;
vec4 rrSample(vec3 wp, vec2 ofs){
  vec4 c = uReflM * vec4(wp.x, uReflP.x, wp.z, 1.0);
  vec2 uv = c.xy / max(c.w, 1e-4) + ofs;
  vec2 e = smoothstep(vec2(0.0), vec2(0.04), uv) * smoothstep(vec2(1.0), vec2(0.96), uv);
  vec4 r = texture2D(uRefl, clamp(uv, vec2(0.002), vec2(0.998)));
  return vec4(r.rgb * uReflP.z, clamp(r.a, 0.0, 1.0) * e.x * e.y * uReflP.y);
}`;
export function riverReflDispose() { rt?.dispose(); rt = null; riverReflU.uRefl.value = null; riverReflU.uReflP.value.y = 0; }
