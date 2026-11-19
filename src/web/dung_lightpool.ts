// 11-18 副本灯池 + 假光（Rhett 11-18 拍板 B1，先只做永霜墓穴）。
// 出处：RPG 场景搭建专长包 v0.8 第 10 章「光源池」+ 第 11 章「低档假光」；画质专长包 v8 第 63 步「灯在加载时建好，之后只改亮度」。代码自写。
// 原来：永霜墓穴每支火把、每个节点各一盏真点光（约 75 盏），forward 渲染里每个像素都要把每盏灯算一遍；
//   加上 prewarm 的占位灯，着色器里的点光数接近 90。
// 现在：这些灯只登记位置 / 颜色 / 亮度 / 照距，场景里只放固定几盏真灯（低档 3、中档 7、高档及以上 9），
//   每帧按「照亮屏幕的面积 × 亮度」挑最有用的几盏（视锥外的打 0.01 折），每盏按 4 /秒淡入淡出，盏数不变 → 不因换灯重编着色器。
//   没分到真灯的灯用假光顶上：朝相机的柔光晕 + 贴地光斑，全部合成两个网格（只多 2 次绘制），亮度 = 1 − 真灯权重，真灯接手时假光淡出。
// 首领 / 符文 / 火盆这类会动、会开关的灯不进池，照旧是真灯。
// ?off=dunglightpool（或 localStorage darkrock_cine_off 含 dunglightpool）回原来每灯一盏真点光。
import * as THREE from 'three';
import * as G from './gfx';
import { noOutline } from './models';

export const DUNG_POOL_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('dunglightpool'); } catch { return false; } })();

/** 各档真灯盏数（RPG 场景第 10 章预算表：低 4 盏含太阳 → 3；中档包里试出 9 盏不穿帮，我们走廊火把稀一些取 7） */
export const POOL_SIZE: Record<G.Quality, number> = { low: 3, medium: 7, high: 9, ultra: 9 };
const MAX_SLOTS = 9, FADE = 4;

interface VLight { p: THREE.Vector3; color: THREE.Color; I: number; dist: number; decay: number; halo: boolean; src: THREE.PointLight }   // opt1118A src：原灯对象（摘下后仍留着），火把闪烁这类改原灯亮度的代码照常生效，槽位每帧读它

export interface LightPool { group: THREE.Group; lights: VLight[]; slots: THREE.PointLight[]; W: Float32Array; update(cam: THREE.Camera, dt: number): number; stat(): { registered: number; slots: number; active: number; fake: boolean } }

/** 把 root 下满足 pick 的静态点光摘下来登记进池，root 里换成固定几盏真灯 + 两片假光网格 */
export function makeLightPool(root: THREE.Object3D, pick: (l: THREE.PointLight) => boolean): LightPool {
  root.updateMatrixWorld(true);
  const found: THREE.PointLight[] = [];
  root.traverse(o => { if ((o as THREE.PointLight).isPointLight && pick(o as THREE.PointLight)) found.push(o as THREE.PointLight); });
  const lights: VLight[] = found.map(l => ({ p: l.getWorldPosition(new THREE.Vector3()), color: l.color.clone(), I: l.intensity, dist: l.distance || 15, decay: l.decay, halo: l.name === 'torchLight', src: l }));   // 节点顶灯悬在 6 m 高处、没有可见灯体，只给地面光斑
  for (const l of found) l.parent?.remove(l);
  const group = new THREE.Group(); group.name = 'dungLightPool';
  const slots: THREE.PointLight[] = [];
  // 槽位按当前档先定好显隐：进副本时 prewarm 按「可见真灯 + 余量」定占位灯个数，多出来的槽不该被算进去
  for (let i = 0; i < MAX_SLOTS; i++) { const l = new THREE.PointLight(0xffffff, 0, 1, 1.6); l.castShadow = false; l.userData.poolSlot = i; l.visible = i < (POOL_SIZE[G.curQuality] ?? 7); group.add(l); slots.push(l); }
  const n = lights.length, W = new Float32Array(n);
  const fake = makeFake(lights); group.add(fake.halo, fake.pool);
  root.add(group);
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const score = new Float32Array(n), idx: number[] = lights.map((_, i) => i);
  let first = true, active = 0;
  function update(cam: THREE.Camera, dt: number) {
    const size = Math.min(MAX_SLOTS, POOL_SIZE[G.curQuality] ?? 7);
    cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const c = cam.getWorldPosition(sph.center.clone());
    for (let i = 0; i < n; i++) {
      const L = lights[i], d = L.p.distanceTo(c), cov = Math.min(1, L.dist / Math.max(d, 1));
      sph.center.copy(L.p); sph.radius = L.dist;
      score[i] = cov * cov * Math.sqrt(L.I) * (fr.intersectsSphere(sph) ? 1 : 0.01);
    }
    idx.sort((a, b) => score[b] - score[a]);
    const want = new Uint8Array(n); for (let k = 0; k < size && k < n; k++) want[idx[k]] = 1;
    const step = first ? 1 : Math.min(1, dt * FADE); first = false;
    for (let i = 0; i < n; i++) W[i] = Math.max(0, Math.min(1, W[i] + (want[i] ? step : -step)));
    // 槽位：按权重从大到小分给有权重的灯；淡出中的灯也占槽直到熄灭，所以同时有权重的灯 ≤ 槽数时才不跳
    const act = idx.filter(i => W[i] > 0).slice(0, size);
    for (let k = 0; k < MAX_SLOTS; k++) {
      const s = slots[k]; s.visible = k < size;
      const i = act[k]; if (i === undefined || k >= size) { s.intensity = 0; continue; }
      const L = lights[i]; s.position.copy(L.p); s.color.copy(L.color); s.distance = L.dist; s.decay = L.decay; s.intensity = L.src.intensity * W[i];   // 永霜 / 熔心 / 普通副本的灯亮度不变 = L.I；营地副本火把有闪烁
    }
    fake.set(W);
    active = act.length;
    return active;
  }
  return { group, lights, slots, W, update, stat: () => ({ registered: n, slots: Math.min(MAX_SLOTS, POOL_SIZE[G.curQuality] ?? 7), active, fake: fake.halo.visible }) };
}

/** 假光：每盏登记灯一片朝相机的光晕 + 一片贴地光斑，各合成一个网格；顶点属性 wt = 1 − 真灯权重 */
function makeFake(lights: VLight[]) {
  const n = lights.length;
  const quads = (halo: boolean) => {
    const P = new Float32Array(n * 12), Q = new Float32Array(n * 8), C = new Float32Array(n * 12), Wt = new Float32Array(n * 4), S = new Float32Array(n * 4), I = new Uint32Array(n * 6);
    lights.forEach((L, i) => {
      // 火把灯在火苗上方 0.15 m；地面光斑贴在 0.04 m（走道 / 圆台顶面在 0）
      const y = halo ? L.p.y : 0.04, size = halo ? 0.55 + 0.08 * L.I : L.dist * 0.42, amp = halo ? (L.halo ? 1 : 0) : Math.min(1.2, L.I / 3.5);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) { const v = i * 4 + k; P.set([L.p.x, y, L.p.z], v * 3); Q.set(corners[k], v * 2); C.set([L.color.r * amp, L.color.g * amp, L.color.b * amp], v * 3); Wt[v] = 1; S[v] = size; }
      I.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('corner', new THREE.BufferAttribute(Q, 2));
    g.setAttribute('tint', new THREE.BufferAttribute(C, 3)); g.setAttribute('wt', new THREE.BufferAttribute(Wt, 1)); g.setAttribute('size', new THREE.BufferAttribute(S, 1));
    g.setIndex(new THREE.BufferAttribute(I, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      uniforms: { uGain: { value: halo ? 0.55 : 0.6 } },   // 地面光斑 0.6：低档截图对照真灯调的（0.32 偏暗）
      vertexShader: [
        'attribute vec2 corner; attribute vec3 tint; attribute float wt; attribute float size;',
        'varying vec2 vQ; varying vec3 vC;',
        'void main(){',
        '  vQ = corner; vC = tint * wt;',
        halo ? '  vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += corner * size;'
             : '  vec4 mv = modelViewMatrix * vec4(position + vec3(corner.x, 0.0, corner.y) * size, 1.0);',
        '  if (wt <= 0.001) mv = vec4(0.0, 0.0, 2.0, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: [
        'uniform float uGain; varying vec2 vQ; varying vec3 vC;',
        'void main(){',
        '  float r = length(vQ); if (r > 1.0) discard;',
        halo ? '  float a = pow(1.0 - r, 2.2);' : '  float q = 1.0 - r * r; float a = q * q * q;',
        '  gl_FragColor = vec4(vC * a * uGain, 1.0);',
        '}'].join('\n'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
      polygonOffset: !halo, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = halo ? 'poolHalo' : 'poolGround';
    return noOutline(mesh);
  };
  const halo = quads(true), pool = quads(false);
  const set = (W: Float32Array) => { for (const m of [halo, pool]) { const a = m.geometry.getAttribute('wt') as THREE.BufferAttribute; const arr = a.array as Float32Array; for (let i = 0; i < n; i++) { const w = 1 - W[i]; arr[i * 4] = arr[i * 4 + 1] = arr[i * 4 + 2] = arr[i * 4 + 3] = w; } a.needsUpdate = true; } };
  return { halo, pool, set };
}
