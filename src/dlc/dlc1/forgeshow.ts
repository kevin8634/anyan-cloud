// ======================================================================
// DLC1 铸造台 · 熔炉成形演出（v1.2.42，比赛版）
// 等待期：熔岩翻腾（噪声着色器）+ 火星 + 双符文环 + 钟声脉冲；拿到模型后：
//   镜头推近 → 武器从熔岩升起，溶解着色器自下而上「烧」出（橙红发光边）→ 空中转一圈 → 飞向角色 → 淡出
// 独立的全屏 WebGL 画布（不动游戏相机 / 场景）；WebGL 创建失败 = 直接跳过演出。
// ======================================================================
import * as THREE from 'three';
import { makeGlbProp, propEnv } from '../../web/creatures_glb';

const NOISE = `
float fs_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fs_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fs_h(i), fs_h(i + vec3(1,0,0)), f.x), mix(fs_h(i + vec3(0,1,0)), fs_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fs_h(i + vec3(0,0,1)), fs_h(i + vec3(1,0,1)), f.x), mix(fs_h(i + vec3(0,1,1)), fs_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fs_fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * fs_n(p); p *= 2.03; a *= 0.5; } return s; }`;

export interface ForgeShow {
  /** 拿到模型后播放成形（key 必须已登记）；结束（含飞出淡出）后 resolve */
  /** v1.2.54 opt.hd = 展示的是高精度版（模型放大一点 + 角标「高精度预览」）；手持仍用游戏版 */
  reveal(key: string, name: string, caption?: string, opt?: { hd?: boolean }): Promise<void>;
  /** 中途取消（失败且无模型时） */
  cancel(): void;
  setStatus(s: string): void;
  /** v1.2.73 铸造 CG（forgecg.ts）：演出外层容器（CG 视频层插在画布下面） */
  host: HTMLElement;
  /** v1.2.73 播 CG 视频期间藏起画布、停渲染（false = 恢复熔岩 brew，视频不可用时的兜底） */
  hold(on: boolean): void;
  /** v1.2.73 叠加模式：透明画布、不画熔炉 / 熔岩 / 符文环，直接叠在 ③ 出炉末帧（空光柱）上接溶解成形 */
  overlay(): void;
}
/** 测试 / 截图用：当前演出的阶段 */
/** v1.2.52 铸造卡：出炉展示中途抓一帧（JPEG data URL）+ 武器名，演出结束后 smithy 拿去合成分享卡 */
export const forgeSnap: { url: string; name: string; box?: [number, number, number, number] } = { url: '', name: '' };
export const forgeShowState = { phase: 'idle' as 'idle' | 'brew' | 'reveal' | 'hammer' | 'fly' | 'done', cut: 0, frames: 0, speed: 1, strikes: 0, runeT: 0, hd: false };
let last: { stop(): void } | null = null;

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function runeTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 6); x.lineTo(1024, 6); x.moveTo(0, 58); x.lineTo(1024, 58); x.stroke();
  // 程序画符文（不依赖字体：多数系统字体没有卢恩字母，会显示成方框）
  let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  x.lineWidth = 3.2; x.lineCap = 'round';
  for (let i = 0; i < 24; i++) { const cx = 21 + i * 42.6; x.beginPath(); x.moveTo(cx, 16); x.lineTo(cx, 50);
    const k = 1 + Math.floor(rnd() * 3); for (let j = 0; j < k; j++) { const y0 = 16 + rnd() * 26, d = rnd() < 0.5 ? -1 : 1; x.moveTo(cx, y0); x.lineTo(cx + d * (6 + rnd() * 7), y0 + 5 + rnd() * 9); }
    if (rnd() < 0.35) { x.moveTo(cx - 8, 33); x.lineTo(cx + 8, 33); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

/** 给武器材质注入溶解：本地 y（0 = 底端，1 = 顶端）+ 噪声 > cut 的片元丢弃，阈值边缘发橙红光 */
function dissolve(m: THREE.Mesh, minY: number, maxY: number, halfW = 0.1) {
  const rt = runeTex(); rt.repeat.set(1, 1);
  const u = { uCut: { value: -0.2 }, uMinY: { value: minY }, uMaxY: { value: maxY }, uHeat: { value: 0 }, uRune: { value: -1 }, uRW: { value: halfW }, tRune: { value: rt as THREE.Texture } };
  const mat = (m.material as THREE.MeshStandardMaterial).clone();
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vFsPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFsPos = position;');
    sh.fragmentShader = `uniform float uCut, uMinY, uMaxY, uHeat, uRune, uRW; uniform sampler2D tRune; varying vec3 vFsPos;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fsY = (vFsPos.y - uMinY) / max(1e-4, uMaxY - uMinY);
        float fsK = fsY + (fs_fbm(vFsPos * 9.0) - 0.5) * 0.22;
        if (fsK > uCut) discard;
        float fsEdge = 1.0 - smoothstep(0.0, 0.07, uCut - fsK);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.08) * fsEdge * 6.0 + vec3(1.0, 0.85, 0.5) * pow(fsEdge, 6.0) * 6.0;
        // v1.2.50 淬火：整把刚成形时通体烧红，冷却时刃尖/薄处先褪（噪声 + 高度错开），颜色 黄白 → 橙 → 暗红 → 金属本色
        float fsH = clamp(uHeat * 1.25 - (fs_fbm(vFsPos * 5.0 + 3.1) - 0.5) * 0.5 - fsY * 0.25, 0.0, 1.0);
        vec3 fsHot = mix(vec3(0.55, 0.05, 0.01), vec3(1.0, 0.38, 0.06), smoothstep(0.0, 0.55, fsH));
        fsHot = mix(fsHot, vec3(1.0, 0.62, 0.28), smoothstep(0.7, 1.0, fsH));
        totalEmissiveRadiance += fsHot * fsH * fsH * 1.5;
        diffuseColor.rgb *= 1.0 - fsH * 0.75;
        // v1.2.51 铭文烙印：一道金光自下而上扫过刃身，扫过处留下淡淡发光符文（符文条沿高度重复，横向按刃宽铺开）
        if (uRune > -0.5) { float fsV = 0.5 + (vFsPos.x + vFsPos.z) / (uRW * 2.6);
          float fsR = (fsV > 0.0 && fsV < 1.0 && fsY > 0.3 && fsY < 0.96) ? texture2D(tRune, vec2(fsY * 3.2, fsV)).a : 0.0;
          float fsF = uRune - fsY, fsFront = exp(-fsF * fsF * 900.0);
          totalEmissiveRadiance += vec3(1.0, 0.78, 0.36) * (fsR * (step(0.0, fsF) * 1.6 + fsFront * 10.0) + fsFront * 1.2 * step(0.3, fsY) * step(fsY, 0.96)); }`);
  };
  mat.customProgramCacheKey = () => 'forge_dissolve2';
  mat.side = THREE.DoubleSide;
  m.material = mat;
  return u;
}

export function startForgeShow(o: { synth?: () => { tone(o: { f: number; type?: string; dur?: number; gain?: number; d?: number }): void } | undefined } = {}): ForgeShow | null {
  last?.stop();
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return null; }
  const wrap = document.createElement('div'); wrap.id = 'd1-forgeshow';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:70;background:#000;opacity:0;transition:opacity .45s;cursor:default';
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;left:0;right:0;bottom:7%;text-align:center;color:#ffd9a0;font:600 20px/1.5 serif;letter-spacing:4px;text-shadow:0 0 12px #ff7a20,0 0 3px #000;pointer-events:none';
  const title = document.createElement('div');
  title.style.cssText = 'position:absolute;left:0;right:0;top:8%;text-align:center;color:#ffe9b0;font:700 34px/1.3 serif;letter-spacing:10px;text-shadow:0 0 18px #ff8a30,0 0 4px #000;opacity:0;transition:opacity .6s;pointer-events:none';
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const W = () => window.innerWidth, H = () => window.innerHeight;
  renderer.setSize(W(), H()); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText += ';position:absolute;left:0;top:0;z-index:1'; title.style.zIndex = cap.style.zIndex = '2';   // v1.2.73 CG 视频层（z 0）垫在画布下
  wrap.append(renderer.domElement, title, cap); document.body.appendChild(wrap);
  ['mousedown', 'touchstart', 'pointerdown', 'wheel', 'keydown', 'keyup', 'click'].forEach(k => wrap.addEventListener(k, e => e.stopPropagation()));
  requestAnimationFrame(() => { wrap.style.opacity = '1'; });

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07040a); scene.fog = new THREE.FogExp2(0x07040a, 0.09);
  scene.environment = propEnv();
  const cam = new THREE.PerspectiveCamera(42, W() / H(), 0.05, 60);
  const camFar = new THREE.Vector3(0, 2.3, 5.6), camNear = new THREE.Vector3(0, 1.25, 3.1), look = new THREE.Vector3(0, 0.55, 0);
  cam.position.copy(camFar); cam.lookAt(look);
  const onResize = () => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); const pr = renderer.getPixelRatio(); hazeRT?.setSize(W() * pr, H() * pr); };
  window.addEventListener('resize', onResize);

  // ---- 熔炉：石圈 + 熔岩面
  const stage: THREE.Object3D[] = [];   // v1.2.73 叠加模式下藏起来的熔炉布景
  const lavaU = { uT: { value: 0 }, uPulse: { value: 0 } };
  const lava = new THREE.Mesh(new THREE.CircleGeometry(1.25, 96), new THREE.ShaderMaterial({
    uniforms: lavaU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT, uPulse; varying vec2 vUv;${NOISE}
      void main(){ vec2 p = (vUv - 0.5) * 4.0; float r = length(vUv - 0.5) * 2.0;
        float sw = fs_fbm(vec3(p * 1.3 + vec2(uT * 0.13, -uT * 0.09), uT * 0.22));
        float n = fs_fbm(vec3(p * 2.2 + sw * 1.6, uT * 0.35));
        float crust = smoothstep(0.42, 0.62, n);
        vec3 hot = mix(vec3(1.0, 0.32, 0.03), vec3(1.0, 0.85, 0.45), smoothstep(0.0, 0.35, 0.5 - n));
        vec3 c = mix(hot * (2.4 + uPulse * 1.8), vec3(0.09, 0.03, 0.02), crust);
        c += vec3(1.0, 0.5, 0.15) * (1.0 - smoothstep(0.0, 0.5, r)) * (0.6 + uPulse);
        gl_FragColor = vec4(c * (1.0 - smoothstep(0.86, 1.0, r) * 0.7), 1.0); }`,
  }));
  lava.rotation.x = -Math.PI / 2; scene.add(lava);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.16, 16, 96), new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.85, metalness: 0.2 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; scene.add(rim);
  for (let i = 0; i < 10; i++) {   // 石圈外的碎石
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.14, 0), rim.material);
    const a = i / 10 * Math.PI * 2 + Math.random() * 0.3; s.position.set(Math.cos(a) * 1.75, 0.05, Math.sin(a) * 1.75); s.rotation.set(Math.random() * 3, Math.random() * 3, 0); scene.add(s); stage.push(s);
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x0a0607, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor); stage.push(lava, rim, floor);
  const fire = new THREE.PointLight(0xff6a20, 9, 7, 1.6); fire.position.set(0, 0.6, 0); scene.add(fire);
  const key = new THREE.DirectionalLight(0x9fd8ff, 1.1); key.position.set(-2.5, 4, 3); scene.add(key);
  scene.add(new THREE.AmbientLight(0x402830, 0.6));

  // ---- 符文环（两道，斜着反向转）+ 钟声冲击波
  const gtex = glowTex(), add = (c: number, op = 1) => ({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const rt = runeTex(); rt.repeat.set(2, 1);
    const r = 1.55 + i * 0.32;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 96, 1, true), new THREE.MeshBasicMaterial({ map: rt, side: THREE.DoubleSide, ...add(i ? 0x6fe8ff : 0xffa040, 0.75) }));
    m.position.y = 0.45 + i * 0.35; m.rotation.set(0.12 - i * 0.2, 0, 0.06 + i * 0.1); scene.add(m); rings.push(m);
  }
  const waves: { m: THREE.Mesh; t: number }[] = [];
  const waveGeo = new THREE.RingGeometry(0.92, 1, 96);
  const pulse = () => {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ ...add(0xffc070, 0.8), side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; scene.add(m); waves.push({ m, t: 0 });
    try { o.synth?.()?.tone({ f: 196, type: 'sine', dur: 1.6, gain: 0.05, d: 1.5 }); o.synth?.()?.tone({ f: 392, type: 'triangle', dur: 1.2, gain: 0.025, d: 1.1 }); } catch { /* 静音 */ }
  };
  // ---- 火星：从熔岩里喷起，抛物线下落
  const N = 420, sp = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const spawn = (i: number, burst = 1) => { const a = Math.random() * Math.PI * 2, r = Math.random() * 1.05; sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = 0.05; sp[i * 3 + 2] = Math.sin(a) * r;
    vel[i * 3] = (Math.random() - 0.5) * 0.9 * burst; vel[i * 3 + 1] = (1.2 + Math.random() * 2.6) * burst; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.9 * burst; life[i] = 0.6 + Math.random() * 1.8; };
  for (let i = 0; i < N; i++) { spawn(i); life[i] *= Math.random(); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: gtex, size: 0.07, sizeAttenuation: true, ...add(0xffa040, 1) })); scene.add(sparks);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, ...add(0xff7a20, 0.55) })); halo.scale.setScalar(4.2); halo.position.y = 0.5; scene.add(halo); stage.push(halo, ...rings);
  // ---- v1.2.50 淬火蒸汽：成形后一次爆开的白汽（普通混合，向上翻滚扩散）
  const steam: { s: THREE.Sprite; v: THREE.Vector3; t: number; life: number; s0: number }[] = [];
  const puff = (n: number, at: THREE.Vector3, spread: number) => { for (let i = 0; i < n; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: 0xdfe6ee, transparent: true, opacity: 0, depthWrite: false }));
    sm.position.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.3) * 1.5, at.z + (Math.random() - 0.5) * spread); scene.add(sm);
    steam.push({ s: sm, v: new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.7), t: 0, life: 1.2 + Math.random() * 1.0, s0: 0.1 + Math.random() * 0.16 }); } };
  // ---- v1.2.51 锻打节拍：发光铁锤虚影绕支点挥下，三记重锤（火花迸射 + 镜头微震 + 闪光 + 金属撞击声）
  const hamMat = new THREE.MeshBasicMaterial({ ...add(0xffb060, 0) });
  const hammer = new THREE.Group(), hamArm = new THREE.Group(); hammer.add(hamArm);
  const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), hamMat); hHead.position.set(-1.0, 0, 0);
  const hFace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.24), hamMat); hFace.position.set(-1.19, 0, 0);
  const hHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 10), hamMat); hHandle.rotation.z = Math.PI / 2; hHandle.position.x = -0.5;
  hamArm.add(hHead, hFace, hHandle); hammer.position.set(1.3, 0.95, 0.12); hammer.visible = false; scene.add(hammer);
  const flash = new THREE.PointLight(0xffe0b0, 0, 4, 2); flash.position.set(0.1, 0.95, 0.5); scene.add(flash);
  const camOff = new THREE.Vector3(); let shake = 0;
  const strikeBurst = () => {   // 火花从击打点迸出（借用火星池里的一批粒子）
    for (let i = 0, n = 0; i < N && n < 90; i += 3, n++) { sp[i * 3] = 0.08; sp[i * 3 + 1] = 0.95 + (Math.random() - 0.5) * 0.2; sp[i * 3 + 2] = 0.12;
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5; vel[i * 3] = Math.cos(a) * v * 0.8 + 0.6; vel[i * 3 + 1] = Math.abs(Math.sin(a)) * v + 0.8; vel[i * 3 + 2] = (Math.random() - 0.3) * v; life[i] = 0.35 + Math.random() * 0.7; }
    shake = 1; flash.intensity = 14; lavaU.uPulse.value = 1;
    try { const sy = o.synth?.(); sy?.tone({ f: 1046, type: 'square', dur: 0.35, gain: 0.03, d: 0.32 }); sy?.tone({ f: 1568, type: 'triangle', dur: 0.9, gain: 0.025, d: 0.85 }); sy?.tone({ f: 98, type: 'sine', dur: 0.25, gain: 0.07, d: 0.22 }); sy?.tone({ f: 3900, type: 'sawtooth', dur: 0.12, gain: 0.006, d: 0.1 }); } catch { /* 静音 */ }
  };
  // ---- v1.2.51 出炉展示：背后冷色轮廓光 + 脚下光环 + 镜头低机位缓慢环绕
  const backL = new THREE.PointLight(0x9fdcff, 0, 6, 1.5); backL.position.set(0, 1.3, -1.4); scene.add(backL);
  const plinth = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 96), new THREE.MeshBasicMaterial({ ...add(0xffd9a0, 0), side: THREE.DoubleSide })); plinth.rotation.x = -Math.PI / 2; plinth.position.y = 0.32; scene.add(plinth);
  // ---- v1.2.50 热浪：场景先画到离屏缓冲，再用噪声扰动 UV 输出（熔炉上方一带最强）；WebGL1 / 低端失败就直接画
  let hazeRT: THREE.WebGLRenderTarget | null = null, hazeScene: THREE.Scene | null = null, hazeCam: THREE.OrthographicCamera | null = null;
  const hazeU = { tDiffuse: { value: null as THREE.Texture | null }, uT: { value: 0 }, uK: { value: 1 }, uC: { value: new THREE.Vector2(0.5, 0.45) } };
  try {
    const pr = renderer.getPixelRatio();
    hazeRT = new THREE.WebGLRenderTarget(W() * pr, H() * pr, { samples: renderer.capabilities.isWebGL2 ? 4 : 0, type: THREE.HalfFloatType });
    hazeU.tDiffuse.value = hazeRT.texture;
    hazeScene = new THREE.Scene(); hazeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    hazeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: hazeU, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uK; uniform vec2 uC; varying vec2 vUv;${NOISE}
        void main(){ vec2 d = vUv - uC; float m = exp(-d.x * d.x * 9.0) * smoothstep(-0.25, 0.05, d.y) * (1.0 - smoothstep(0.1, 0.5, d.y));
          vec2 o = vec2(fs_n(vec3(vUv * vec2(22.0, 10.0) - vec2(0.0, uT * 1.6), uT * 0.7)) - 0.5, fs_n(vec3(vUv * vec2(18.0, 8.0) - vec2(0.0, uT * 1.9), uT * 0.6 + 7.0)) - 0.5);
          gl_FragColor = texture2D(tDiffuse, vUv + o * 0.012 * m * uK);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })));
    hazeRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
  } catch { hazeRT = null; }

  // ---- 状态
  let raf = 0, t = 0, prev = performance.now(), nextPulse = 0.4, stopped = false;
  let capPrev = '', spin0 = 0, weapon: THREE.Mesh | null = null, wu: ReturnType<typeof dissolve> | null = null, rt0 = 0, flyFrom = new THREE.Vector3(), done: (() => void) | null = null;
  forgeShowState.phase = 'brew'; forgeShowState.cut = 0; forgeShowState.frames = 0; forgeShowState.strikes = 0; forgeShowState.runeT = 0;
  cap.textContent = '炉火正旺……';
  const ease = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  let wantSnap = false, snapped = false, snapBest = 0; const snapBox = new THREE.Box3(), snapV = new THREE.Vector3();
  const RUNE_SWEEP = false as boolean;
  const REVEAL = 2.4, SPIN = 3.0, FLY = 0.9, BEAT = 0.62, BEATS = 3, HAM = 0;   // 11-17 Rhett：去掉锻打（HAM=0，不进 hammer 段）

  let held = false, over = false;
  const frame = () => {
    if (stopped) return;
    if (held) { prev = performance.now(); raf = requestAnimationFrame(frame); return; }
    const now = performance.now(), dt = Math.min(0.25, (now - prev) / 1000); prev = now; t += dt * forgeShowState.speed; forgeShowState.frames++;
    lavaU.uT.value = t;
    if (t > nextPulse && forgeShowState.phase === 'brew') { pulse(); nextPulse = t + 1.25; lavaU.uPulse.value = 1; }
    lavaU.uPulse.value *= Math.pow(0.04, dt);
    fire.intensity = 8 + Math.sin(t * 9) * 0.8 + Math.sin(t * 23) * 0.5 + lavaU.uPulse.value * 6;
    rings[0].rotation.y = t * 0.55; rings[1].rotation.y = -t * 0.38;
    if (forgeShowState.phase !== 'brew') { const f = Math.min(1, (t - rt0) / 1.2); rings.forEach((r, i) => { r.scale.setScalar(1 + f * 0.5); r.position.y = 0.45 + i * 0.35 - f * 0.3; (r.material as THREE.MeshBasicMaterial).opacity = (0.75 - i * 0.1) * (1 - f * 0.75); }); }
    halo.material.opacity = 0.45 + lavaU.uPulse.value * 0.35;
    for (let i = waves.length - 1; i >= 0; i--) { const w = waves[i]; w.t += dt; const k = w.t / 1.3; w.m.scale.setScalar(1 + k * 3.2); (w.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); if (k >= 1) { scene.remove(w.m); (w.m.material as THREE.Material).dispose(); waves.splice(i, 1); } }
    for (let i = 0; i < N; i++) { life[i] -= dt; if (life[i] <= 0) spawn(i, forgeShowState.phase === 'reveal' ? 1.5 : 1);
      vel[i * 3 + 1] -= 3.2 * dt; sp[i * 3] += vel[i * 3] * dt; sp[i * 3 + 1] += vel[i * 3 + 1] * dt; sp[i * 3 + 2] += vel[i * 3 + 2] * dt; if (sp[i * 3 + 1] < 0) life[i] = 0; }
    sg.attributes.position.needsUpdate = true;

    if (forgeShowState.phase === 'brew') {   // 等待期镜头缓慢环绕
      const a = Math.sin(t * 0.25) * 0.35; cam.position.set(Math.sin(a) * camFar.z, camFar.y + Math.sin(t * 0.7) * 0.05, Math.cos(a) * camFar.z); cam.lookAt(look);
    } else if (weapon && wu) {
      const k = t - rt0;
      if (forgeShowState.phase === 'reveal') {
        const e = ease(k / 1.2); cam.position.lerpVectors(camFar, camNear, e); cam.lookAt(look.x, look.y + e * 0.35, look.z);
        // 11-17 Rhett：不要逐层扫描式的溶解成形，也不要锤子锻打——武器整把从熔炉（背景光柱）里缓缓升起，出炉时通体烧红，随后冷却
        weapon.position.y = -0.35 + ease(k / REVEAL) * 1.3; wu.uCut.value = 2; forgeShowState.cut = 2;
        weapon.rotation.y = k * 1.3;
        wu.uHeat.value = 1;
        if (k >= REVEAL) { forgeShowState.phase = 'fly'; spin0 = weapon.rotation.y; }
      }
      if (forgeShowState.phase === 'hammer') {   // 锻打：武器停转、横在锤下，三记重锤
        const h = k - REVEAL, b = Math.floor(h / BEAT), u = (h - b * BEAT) / BEAT;
        weapon.position.y = 0.95; wu.uHeat.value = 1;
        const fadeIn = Math.min(1, h / 0.25), fadeOut = 1 - Math.max(0, (h - BEAT * BEATS) / 0.3);
        hamMat.opacity = 0.55 * fadeIn * Math.max(0, fadeOut);
        // 抬锤（ease）→ 末段猛落 → 回弹
        const ang = b >= BEATS ? -0.6 * ease((h - BEAT * BEATS) / 0.3) : u < 0.68 ? -1.05 * ease(u / 0.68) : u < 0.8 ? -1.05 * (1 - Math.pow((u - 0.68) / 0.12, 2)) : -0.08 * Math.sin((u - 0.8) / 0.2 * Math.PI);
        hamArm.rotation.z = ang;
        if (b < BEATS && u >= 0.8 && forgeShowState.strikes <= b) { forgeShowState.strikes = b + 1; strikeBurst(); weapon.rotation.y += 0.35; }
        if (h >= HAM) { forgeShowState.phase = 'fly'; spin0 = weapon.rotation.y; hammer.visible = false; cap.textContent = capPrev;
          // 淬火：一声嘶响 + 白汽爆开
          puff(40, weapon.position, 0.35);
          try { const sy = o.synth?.(); sy?.tone({ f: 2400, type: 'sawtooth', dur: 0.9, gain: 0.012, d: 0.8 }); sy?.tone({ f: 1700, type: 'square', dur: 0.6, gain: 0.008, d: 0.55 }); } catch { /* 静音 */ } }
      }
      if (forgeShowState.phase === 'fly') {
        const s = k - REVEAL - HAM;
        wu.uHeat.value = Math.max(0, 1 - s / 2.2);   // 转身展示期间冷却成金属本色
        // 11-17 去掉铭文扫光（同属逐层扫描感）
        if (RUNE_SWEEP && s > 0.5) { const rk = (s - 0.5) / 1.3; wu.uRune.value = 0.25 + rk * 0.8; if (rk < 1 && forgeShowState.runeT === 0) { forgeShowState.runeT = 1; try { const sy = o.synth?.(); sy?.tone({ f: 659, type: 'sine', dur: 1.6, gain: 0.03, d: 1.5 }); sy?.tone({ f: 988, type: 'sine', dur: 1.8, gain: 0.02, d: 1.7 }); } catch { /* 静音 */ } } }
        if (s < SPIN && s < 1.4 && Math.random() < 0.35) puff(1, weapon.position, 0.4);   // 余汽
        if (s >= 0.7 && s <= SPIN - 0.4) {   // v1.2.52b 铸造卡抓帧：挑武器屏幕投影最宽（正面朝镜头）的一帧，细剑不再只剩一条线
          snapBox.setFromObject(weapon); let lo = 1e9, hi = -1e9, ylo = 1e9, yhi = -1e9;
          for (let i = 0; i < 8; i++) { snapV.set(i & 1 ? snapBox.max.x : snapBox.min.x, i & 2 ? snapBox.max.y : snapBox.min.y, i & 4 ? snapBox.max.z : snapBox.min.z).project(cam); lo = Math.min(lo, snapV.x); hi = Math.max(hi, snapV.x); ylo = Math.min(ylo, snapV.y); yhi = Math.max(yhi, snapV.y); }
          const w = hi - lo; if (!snapped || w > snapBest * 1.12) { snapped = true; snapBest = w; wantSnap = true; forgeSnap.box = [(lo + 1) / 2, (hi + 1) / 2, (1 - yhi) / 2, (1 - ylo) / 2]; }
        }
        if (s < SPIN) { const sk = ease(s / 0.8) * (1 - ease((s - SPIN + 0.5) / 0.5));
          backL.intensity = 7 * sk; (plinth.material as THREE.MeshBasicMaterial).opacity = 0.5 * sk; plinth.rotation.z = s * 0.8;
          const ca = Math.sin(ease(s / SPIN) * Math.PI) * 0.28; cam.position.set(Math.sin(ca) * camNear.z, camNear.y - 0.18 * sk, Math.cos(ca) * camNear.z); cam.lookAt(look.x, look.y + 0.4, look.z);
        } else { backL.intensity *= Math.pow(0.02, dt); (plinth.material as THREE.MeshBasicMaterial).opacity *= Math.pow(0.02, dt); }
        if (s < SPIN) { weapon.rotation.y = spin0 + ease(s / SPIN) * Math.PI * 2; weapon.position.y = 0.95 + Math.sin(s * 2.2) * 0.06; if (s > 0.6) title.style.opacity = '1'; flyFrom.copy(weapon.position); }
        else { const f = ease((s - SPIN) / FLY); weapon.position.set(flyFrom.x + f * 2.6, flyFrom.y - f * 1.4, flyFrom.z + f * 1.2); weapon.rotation.z = -f * 1.2; weapon.scale.setScalar(1 - f * 0.7);
          if (f > 0.35) wrap.style.opacity = '0';
          if (s >= SPIN + FLY + 0.45) { forgeShowState.phase = 'done'; stop(); done?.(); return; } }
      }
    }
    for (let i = steam.length - 1; i >= 0; i--) { const q = steam[i]; q.t += dt; const f = q.t / q.life; q.v.multiplyScalar(Math.pow(0.35, dt)); q.v.y += 0.25 * dt; q.s.position.addScaledVector(q.v, dt);
      q.s.scale.setScalar(q.s0 + f * 0.75); (q.s.material as THREE.SpriteMaterial).opacity = 0.2 * Math.min(1, f * 6) * (1 - f);
      if (f >= 1) { scene.remove(q.s); q.s.material.dispose(); steam.splice(i, 1); } }
    flash.intensity *= Math.pow(0.002, dt); shake *= Math.pow(0.003, dt);
    camOff.set((Math.random() - 0.5) * 0.06 * shake, (Math.random() - 0.5) * 0.05 * shake, 0); cam.position.add(camOff);
    if (hazeRT && hazeScene && hazeCam && !over) {
      hazeU.uT.value = t; hazeU.uK.value = forgeShowState.phase === 'brew' ? 1 : 0;   // 11-17 武器出来后不再叠热浪波纹
      renderer.setRenderTarget(hazeRT); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(hazeScene, hazeCam);
    } else renderer.render(scene, cam);
    if (wantSnap) { wantSnap = false; try { forgeSnap.url = renderer.domElement.toDataURL('image/jpeg', 0.9); } catch { forgeSnap.url = ''; } }
    cam.position.sub(camOff);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const stop = () => {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
    scene.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(q => q.dispose()); });
    hazeRT?.dispose(); hazeScene?.traverse(x => { const m = x as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); }); renderer.dispose(); renderer.forceContextLoss?.(); wrap.remove(); if (last === handle0) last = null;
  };
  const handle0 = { stop };
  last = handle0;
  return {
    setStatus: s => { cap.textContent = s; },
    host: wrap,
    hold: on => { held = on; renderer.domElement.style.visibility = on ? 'hidden' : ''; },
    overlay: () => { over = true; held = false; renderer.domElement.style.visibility = ''; scene.background = null; scene.fog = null; renderer.setClearColor(0x000000, 0); wrap.style.background = 'transparent'; stage.forEach(o => { o.visible = false; }); },
    cancel: () => { forgeShowState.phase = 'idle'; stop(); },
    reveal: (k, name, caption, opt) => new Promise<void>(res => { forgeSnap.url = ''; forgeSnap.box = undefined; forgeSnap.name = name;
      if (stopped) return res();
      const m = makeGlbProp(k, opt?.hd ? 2.05 : 1.75, 0.5);
      forgeShowState.hd = !!opt?.hd;
      if (opt?.hd) { const tg = document.createElement('div'); tg.id = 'd1-forgeshow-hd'; tg.textContent = '高精度预览'; tg.style.cssText = 'position:absolute;top:calc(8% + 52px);left:50%;transform:translateX(-50%);padding:2px 12px;border-radius:10px;color:#1a1206;background:#ffd070;font:600 13px/1.6 sans-serif;letter-spacing:2px;pointer-events:none;z-index:2'; wrap.appendChild(tg); }
      if (!m) { stop(); return res(); }
      m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox!;
      wu = dissolve(m, b.min.y, b.max.y, Math.max(0.02, Math.min(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5 + Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.15)); weapon = m; m.position.y = 0.6; scene.add(m);
      const wl = new THREE.PointLight(0xffd9a0, 3, 3, 2); wl.position.set(0.6, 0.6, 1.2); m.add(wl);
      title.textContent = name; cap.textContent = caption ?? '成形！';
      rt0 = t; forgeShowState.phase = 'reveal'; done = res;
      // 成形一刻：一记重钟 + 一波火星
      try { o.synth?.()?.tone({ f: 131, type: 'sine', dur: 2.4, gain: 0.08, d: 2.2 }); o.synth?.()?.tone({ f: 523, type: 'triangle', dur: 1.5, gain: 0.04, d: 1.4 }); } catch { /* 静音 */ }
      for (let i = 0; i < N; i += 2) spawn(i, 1.6);
      // 后台标签页等 rAF 停掉时兜底：v1.2.50 改成「帧数不涨」才收场（标签页隐藏 2 秒 / 可见 8 秒）（慢机 / 软件渲染掉帧时不再提前掐掉演出）
      let lastF = -1, still = 0; const wd = setInterval(() => { if (stopped) { clearInterval(wd); return; } still = forgeShowState.frames === lastF ? still + 1 : 0; if (still >= (document.hidden ? 1 : 4)) { clearInterval(wd); forgeShowState.phase = 'done'; stop(); res(); } lastF = forgeShowState.frames; }, 2000);
    }),
  };
}
