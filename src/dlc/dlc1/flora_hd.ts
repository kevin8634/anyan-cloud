// 11-14 写实草木（代码生成，不用外部模型）：
//  · 草：多段弯曲草叶（根粗梢尖、横向圆法线、轻微扭转），成簇分布，根部压暗、梢部发黄，逆光透光
//  · 野花：细茎 + 五瓣花头
//  · 树：递归分枝的锥形树干（不规则截面、根部张开）+ 末梢叶片卡（画布生成的叶簇贴图，球形法线 → 体积感），逆光透光
// 全部是 MeshStandardMaterial（吃环境光照 / 阴影 / 雾），风摆和角色推开交给 dyn_world 的 dynPlant。
// 透光项：onBeforeCompile 在 lights_fragment_end 后加「太阳在物体背后时的散射」，强度 uTrans。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dynPlant, dynDepth } from './dyn_world';
import { vegLayerOn, vegShadowOn } from '../../web/veg_flags';   // 11-17 草 / 花根部 AO 真正生效（?off=veglayer 回旧）

// ---------------------------------------------------------------- 工具
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function vnoise(x: number, z: number) {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
export function fbm2(x: number, z: number) { return vnoise(x, z) * 0.5 + vnoise(x * 2.1 + 5, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3 + 9) * 0.2; }

/** 共享的太阳方向（世界空间，指向太阳）——场景每帧写入 */
export const FLORA_U = { uSunDirW: { value: new THREE.Vector3(0, 1, 0) }, uSunColF: { value: new THREE.Color(1, 0.8, 0.6) } };

/** 逆光透光 + 根部暗化 + 梢部变色。gradAttr：用哪个量表示「离根高度 0..1」（uv.y） */
export function floraShade(m: THREE.MeshStandardMaterial, o: { trans: number; rootDark: number; tip?: THREE.Color; key: string }) {
  const tip = o.tip ?? new THREE.Color(1, 1, 1);
  const prev = m.onBeforeCompile;
  // 11-17：r170 不再定义 USE_UV → 原写法 vFH 恒为 1（根暗 / 梢色没生效）。veglayer 开时草 / 花直接读 uv.y；树叶 uv 是贴图坐标，照旧
  const hg = vegLayerOn() && (o.key === 'grass' || o.key === 'flower');
  // 11-17g 叶缘逆光（veglayer，同原野 field_flora）：逆着太阳看时叶缘 / 草叶两侧 / 侧对镜头的薄边额外透亮；在太阳光照循环里乘过阴影后加（树荫里不亮）
  const edge = vegLayerOn() ? (o.key === 'leaf' ? 0.8 : o.key === 'grass' ? 0.6 : 0) : 0;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, FLORA_U, { uTrans: { value: o.trans }, uRootDark: { value: o.rootDark }, uTipCol: { value: tip }, uFhEdge: { value: edge } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFH; varying vec3 vWPosF; varying float vFU;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n' + (hg ? 'vFH = uv.y; vFU = uv.x;' : '#ifdef USE_UV\nvFH = uv.y;\n#else\nvFH = 1.0;\n#endif') + '\nvec4 wpF = modelMatrix * vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwpF = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n#endif\nvWPosF = wpF.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFH; varying vec3 vWPosF; varying float vFU; uniform vec3 uSunDirW; uniform vec3 uSunColF; uniform float uTrans; uniform float uRootDark; uniform vec3 uTipCol; uniform float uFhEdge;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), uTipCol, smoothstep(0.55, 1.0, vFH));\ndiffuseColor.rgb *= mix(1.0 - uRootDark, 1.0, smoothstep(0.0, 0.6, vFH));')
      .replace('#include <lights_fragment_begin>', edge > 0 ? fhEdgeLights(hg) : '#include <lights_fragment_begin>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      { vec3 Vv = normalize(vViewPosition); float back = pow(clamp(dot(-Vv, directionalLights[0].direction), 0.0, 1.0), 3.0);   // 太阳 = 场景第一盏方向光
        float wrap = 0.35 + 0.65 * back; reflectedLight.indirectDiffuse += min(diffuseColor.rgb * directionalLights[0].color * 0.47 * uTrans * wrap * back * (0.4 + 0.6 * vFH), vec3(0.6)); }
      #endif`);
  };
  const pk = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => pk() + '|flora' + o.key + (hg ? '|hg' : '') + (edge > 0 ? '|eg' : '');
  return m;
}

/** 11-17g 叶缘逆光：太阳（第一盏方向光）光照循环里、乘过阴影之后加。叶卡取 alpha 刚过阈值的一圈，草叶取 uv.x 两侧，再加侧对镜头的轮廓项 */
function fhEdgeLights(hg: boolean): string {
  const src = THREE.ShaderChunk.lights_fragment_begin, a = src.indexOf('directionalLight = directionalLights[ i ];');
  const needle = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const b = a < 0 ? -1 : src.indexOf(needle, a);
  if (b < 0) { console.warn('patch miss fh.edge'); return src; }
  const add = `
		if ( UNROLLED_LOOP_INDEX == 0 ) {
			#ifdef USE_ALPHATEST
			float fhEg = 1.0 - smoothstep( alphaTest, min( alphaTest + 0.3, 1.0 ), diffuseColor.a );
			#else
			float fhEg = ${hg ? 'pow( abs( vFU * 2.0 - 1.0 ), 2.0 )' : '0.0'};
			#endif
			fhEg = max( fhEg, 0.5 * pow( 1.0 - abs( dot( geometryNormal, geometryViewDir ) ), 3.0 ) );
			float fhEb = pow( max( dot( - geometryViewDir, directLight.direction ), 0.0 ), 3.0 );
			reflectedLight.directDiffuse += min( directLight.color * ( material.diffuseColor * vec3( 1.25, 1.08, 0.62 ) + vec3( 0.03, 0.02, 0.0 ) ) * uFhEdge * fhEg * fhEb * ( 0.4 + 0.6 * vFH ), vec3( 0.6 ) );
		}`;
  return src.slice(0, b + needle.length) + add + src.slice(b + needle.length);
}

// ---------------------------------------------------------------- 草
/** 一根草叶：高 1，segs 段，根宽 w，前弯 bend，扭转 twist；uv.y = 高度比例；法线横向外倾（圆润） */
function bladeGeo(segs: number, w: number, bend: number, twist: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, hw = w * 0.5 * Math.pow(1 - t, 0.75) * (i === segs ? 0 : 1) + (i === segs ? 0 : 0.0015);
    const z = bend * t * t, y = t * (1 - 0.18 * bend * t), a = twist * t, ca = Math.cos(a), sa = Math.sin(a);
    const tz = 2 * bend * t, ty = 1; const tl = Math.hypot(tz, ty);   // 切线 → 法线（向前上方）
    const fnY = -tz / tl, fnZ = ty / tl;
    for (const s of [-1, 1]) {
      const x = s * hw; pos.push(x * ca, y, z + x * sa);
      const nx = s * 0.55, n = Math.hypot(nx, fnY, fnZ); nor.push((nx * ca) / n, fnY / n, (fnZ + nx * sa) / n);
      uv.push(s < 0 ? 0 : 1, t);
    }
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export interface GrassOpt { count: number; area: [number, number, number, number]; ground: (x: number, z: number) => number; accept?: (x: number, z: number) => boolean; seed?: number; hMin?: number; hMax?: number; dry?: number; castShadow?: boolean; cover?: boolean;
  /** 11-17g 岸边（离水近）的草花另起一个实例网格并放行进湖面倒影（river_refl 认 userData.refl；?off=vegshadow 关） */
  shore?: (x: number, z: number) => boolean }
/** 写实草地：3 种草叶形状（宽叶 / 细叶 / 倒伏），每种一个 InstancedMesh；成簇分布（每簇 6–14 根同色系、朝外散开） */
export function makeGrassHD(o: GrassOpt): THREE.Group {
  const R = rng(o.seed ?? 7), grp = new THREE.Group(); grp.name = 'grass_hd';
  const shapes = [bladeGeo(6, 0.05, 0.28, 0.5), bladeGeo(5, 0.028, 0.42, 1.1), bladeGeo(6, 0.04, 0.75, 0.3)];
  const share = [0.5, 0.35, 0.15];
  const [x0, z0, x1, z1] = o.area, dry = o.dry ?? 0.35;
  for (let k = 0; k < shapes.length; k++) {
    const n = Math.round(o.count * share[k]);
    const mat = floraShade(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.7 }),
      { trans: 0.5, rootDark: 0.6, tip: new THREE.Color(1.08, 1.04, 0.8), key: 'grass' });
    dynPlant(mat, { amp: k === 2 ? 0.7 : 1, h0: 0.55, push: 0.75, baseY: 0 });
    const im = new THREE.InstancedMesh(shapes[k], mat, n); im.name = 'grass_hd_' + k;
    const sh = o.shore && vegShadowOn() ? new THREE.InstancedMesh(shapes[k], mat, n) : null; let j = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let i = 0, guard = 0;
    while (i < n && guard++ < n * 6) {
      const cx = x0 + R() * (x1 - x0), cz = z0 + R() * (z1 - z0);
      const dens = fbm2(cx * 0.18, cz * 0.18); if (!o.cover && dens < 0.32 + R() * 0.25) continue;
      if (o.accept && !o.accept(cx, cz)) continue;
      const tuft = 6 + Math.floor(R() * 9), hue = 0.2 + R() * 0.06 - dry * 0.07 * fbm2(cx * 0.05 + 3, cz * 0.05), dryK = dry * (0.5 + fbm2(cx * 0.09 + 11, cz * 0.09));
      const hBase = (o.hMin ?? 0.35) + ((o.hMax ?? 0.95) - (o.hMin ?? 0.35)) * (o.cover ? R() : Math.pow(dens, 1.3));
      for (let t = 0; t < tuft && i < n; t++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * (o.cover ? 0.3 : 0.16), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        p.set(x, o.ground(x, z) - 0.02, z);
        e.set((R() - 0.5) * 0.25, a + (R() - 0.5) * 1.2, (R() - 0.5) * 0.25); q.setFromEuler(e);
        const h = hBase * (0.6 + R() * 0.65); s.set(0.8 + R() * 0.6, h, h * (0.7 + R() * 0.5));
        const tgt = sh && o.shore!(x, z) ? sh : im, ti = tgt === sh ? j : i - j;
        tgt.setMatrixAt(ti, m4.compose(p, q, s));
        c.setHSL(hue + 0.02 + (R() - 0.5) * 0.04, 0.34 + R() * 0.16 - dryK * 0.15, 0.15 + R() * 0.08 + dryK * 0.08);
        if (R() < dryK * 0.3) c.setHSL(0.1 + R() * 0.04, 0.32, 0.3 + R() * 0.1);   // 枯叶
        tgt.setColorAt(ti, c); if (tgt === sh) j++; i++;
      }
    }
    im.count = i - j; im.castShadow = o.castShadow ?? false; im.receiveShadow = true; im.frustumCulled = false;
    if (im.castShadow) { const d = dynDepth(mat); if (d) im.customDepthMaterial = d; }
    im.userData.dynDone = true; grp.add(im);
    if (sh && j > 0) { sh.count = j; sh.name = im.name + '_shore'; sh.castShadow = im.castShadow; sh.customDepthMaterial = im.customDepthMaterial; sh.receiveShadow = true; sh.frustumCulled = false; sh.userData.dynDone = true; sh.userData.refl = true; grp.add(sh); }
  }
  return grp;
}

// ---------------------------------------------------------------- 野花
export function makeFlowersHD(o: GrassOpt & { colors?: number[] }): THREE.Group {
  const R = rng((o.seed ?? 3) + 99), grp = new THREE.Group(); grp.name = 'flowers_hd';
  const stem = bladeGeo(4, 0.012, 0.12, 0);
  const petals: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) { const pg = new THREE.CircleGeometry(0.028, 8); pg.scale(1, 0.45, 1); pg.translate(0, 0.024, 0); pg.rotateZ(k / 6 * Math.PI * 2); pg.rotateX(-Math.PI / 2 + 0.35); petals.push(pg); }
  const core = new THREE.SphereGeometry(0.009, 6, 4); core.translate(0, 0.006, 0);
  const head = mergeGeometries([...petals.map(g => { g.deleteAttribute('uv'); return g; }), (core.deleteAttribute('uv'), core)]);
  head.translate(0, 1, 0.12);   // 花头在茎梢（茎高 1，前弯 0.12）
  const uvs = new Float32Array(head.attributes.position.count * 2).fill(1); head.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const geo = mergeGeometries([stem, head]);
  const mat = floraShade(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.7 }), { trans: 0.9, rootDark: 0.5, key: 'flower' });
  dynPlant(mat, { amp: 0.9, h0: 0.45, push: 0.55, baseY: 0 });
  const n = o.count, im = new THREE.InstancedMesh(geo, mat, n); im.name = 'flowers_hd';
  const sh = o.shore && vegShadowOn() ? new THREE.InstancedMesh(geo, mat, n) : null; let j = 0;
  const colors = o.colors ?? [0xf4f0e6, 0xf2d36b, 0xc9a6e8, 0xe98fa5];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let i = 0, guard = 0; const [x0, z0, x1, z1] = o.area;
  while (i < n && guard++ < n * 20) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (fbm2(x * 0.11 + 7, z * 0.11) < 0.55 || (o.accept && !o.accept(x, z))) continue;
    p.set(x, o.ground(x, z) - 0.02, z); q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3));
    const h = 0.28 + R() * 0.3; s.set(h * 1.5, h, h * 1.5); const tgt = sh && o.shore!(x, z) ? sh : im, ti = tgt === sh ? j++ : i - j; tgt.setMatrixAt(ti, m4.compose(p, q, s));
    tgt.setColorAt(ti, c.setHex(colors[Math.floor(R() * colors.length)]).offsetHSL(0, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08)); i++;
  }
  im.count = i - j; im.receiveShadow = true; im.frustumCulled = false; im.userData.dynDone = true; grp.add(im);
  if (sh && j > 0) { sh.count = j; sh.name = 'flowers_hd_shore'; sh.receiveShadow = true; sh.frustumCulled = false; sh.userData.dynDone = true; sh.userData.refl = true; grp.add(sh); }
  return grp;
}

// ---------------------------------------------------------------- 树
let _leafTex: THREE.CanvasTexture | null = null;
/** 叶簇贴图（512²，透明底）：一根小枝上 7–9 片椭圆尖叶，叶脉、明暗、虫蛀边 */
export function leafTexture(): THREE.CanvasTexture {
  if (_leafTex) return _leafTex;
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  const R = rng(42);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = '#4a3a22'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(S * 0.5, S * 0.98); g.quadraticCurveTo(S * 0.47, S * 0.6, S * 0.52, S * 0.12); g.stroke();
  const leaf = (x: number, y: number, ang: number, L: number, W: number) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    const grd = g.createLinearGradient(-W, 0, W, 0); const l = 0.85 + R() * 0.3;
    grd.addColorStop(0, `rgb(${70 * l | 0},${112 * l | 0},${44 * l | 0})`); grd.addColorStop(0.5, `rgb(${98 * l | 0},${140 * l | 0},${58 * l | 0})`); grd.addColorStop(1, `rgb(${60 * l | 0},${98 * l | 0},${38 * l | 0})`);
    g.fillStyle = grd; g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(W, -L * 0.25, W * 0.9, -L * 0.75, 0, -L); g.bezierCurveTo(-W * 0.9, -L * 0.75, -W, -L * 0.25, 0, 0); g.fill();
    g.strokeStyle = 'rgba(190,210,140,0.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -L * 0.95); g.stroke();
    g.lineWidth = 1; for (let k = 1; k < 6; k++) { const yy = -L * k / 6.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(W * 0.7, yy - L * 0.08); g.moveTo(0, yy); g.lineTo(-W * 0.7, yy - L * 0.08); g.stroke(); }
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 2; k++) if (R() < 0.4) { g.beginPath(); g.arc((R() - 0.5) * W * 1.6, -L * (0.3 + R() * 0.6), 3 + R() * 6, 0, 6.28); g.fill(); }
    g.globalCompositeOperation = 'source-over'; g.restore();
  };
  const N = 9;
  for (let k = 0; k < N; k++) {
    const t = 0.15 + 0.8 * k / N, y = S * (0.98 - t * 0.86), x = S * (0.5 - 0.02 * Math.sin(t * 3)), side = k % 2 ? 1 : -1;
    leaf(x, y, side * (0.7 + R() * 0.5) - 0.05, S * (0.2 + R() * 0.07) * (1 - t * 0.3), S * (0.06 + R() * 0.02));
  }
  leaf(S * 0.52, S * 0.14, (R() - 0.5) * 0.3, S * 0.2, S * 0.065);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return (_leafTex = t);
}
let _barkTex: { map: THREE.CanvasTexture; nrm: THREE.CanvasTexture } | null = null;
/** 树皮：纵向裂纹（颜色 + 由高度场导出的法线），256×512 平铺 */
export function barkTextures() {
  if (_barkTex) return _barkTex;
  const W = 256, H = 512, h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const ridge = Math.abs(Math.sin((u * 9 + 0.6 * fbm2(u * 6, v * 3) + 0.25 * Math.sin(v * 12)) * Math.PI));
    h[y * W + x] = Math.pow(ridge, 0.6) * 0.75 + 0.25 * fbm2(u * 24, v * 10);
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cm = mk(), cn = mk(), gm = cm.getContext('2d')!, gn = cn.getContext('2d')!;
  const im = gm.createImageData(W, H), inn = gn.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = h[i], l = 0.35 + 0.65 * v, moss = Math.max(0, fbm2(x / W * 5, y / H * 3) - 0.6) * 2;
    im.data[i * 4] = (92 * l * (1 - moss) + 70 * moss) | 0; im.data[i * 4 + 1] = (78 * l * (1 - moss) + 90 * moss) | 0; im.data[i * 4 + 2] = (64 * l * (1 - moss) + 48 * moss) | 0; im.data[i * 4 + 3] = 255;
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W], dy = h[((y + 1) % H) * W + x] - h[((y - 1 + H) % H) * W + x];
    const n = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
    inn.data[i * 4] = (n.x * 0.5 + 0.5) * 255; inn.data[i * 4 + 1] = (n.y * 0.5 + 0.5) * 255; inn.data[i * 4 + 2] = (n.z * 0.5 + 0.5) * 255; inn.data[i * 4 + 3] = 255;
  }
  gm.putImageData(im, 0, 0); gn.putImageData(inn, 0, 0);
  const map = new THREE.CanvasTexture(cm), nrm = new THREE.CanvasTexture(cn);
  map.colorSpace = THREE.SRGBColorSpace; for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return (_barkTex = { map, nrm });
}

interface Branch { pts: THREE.Vector3[]; r0: number; r1: number; depth: number }
/** 锥形不规则截面的枝干管（沿点列），uv.x 绕圈、uv.y 沿长度（米）；根部 flare 张开 */
function tube(b: Branch, radial: number, flare: number, R: () => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(b.pts), segs = Math.max(3, Math.round(curve.getLength() * 3));
  const frames = curve.computeFrenetFrames(segs, false), pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const L = curve.getLength(), lobes = R() * 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    let r = b.r0 + (b.r1 - b.r0) * Math.pow(t, 0.8); if (flare > 0) r *= 1 + flare * Math.pow(Math.max(0, 1 - t * 6), 2);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, wob = 1 + 0.08 * Math.sin(a * 3 + lobes) + (flare > 0 ? 0.25 * Math.max(0, 1 - t * 6) * Math.sin(a * 5 + lobes) : 0);
      const ca = Math.cos(a), sa = Math.sin(a), nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      pos.push(c.x + nx * r * wob, c.y + ny * r * wob, c.z + nz * r * wob); nor.push(nx, ny, nz); uv.push(j / radial * Math.max(1, Math.round(r * 12)), t * L * 1.2);
    }
    if (i < segs) for (let j = 0; j < radial; j++) { const a0 = i * (radial + 1) + j, a1 = a0 + radial + 1; idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export interface TreeOpt { seed?: number; height?: number; spread?: number; lean?: number; leafDensity?: number; leafSize?: number; autumn?: number }
/** 写实阔叶树（约 6–9 米）：树干 + 3 级分枝，末梢挂叶片卡（每片卡 = 一根带 9 片叶的小枝），叶卡法线取树冠中心外推的球形法线 */
export function makeTreeHD(o: TreeOpt = {}): THREE.Group {
  const R = rng(o.seed ?? 1), H = o.height ?? 7.5, spread = o.spread ?? 1, grp = new THREE.Group(); grp.name = 'tree_hd';
  const branches: Branch[] = [], tips: { p: THREE.Vector3; d: THREE.Vector3; w: number }[] = [];
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number) => {
    const pts = [from.clone()], d = dir.clone().normalize(), p = from.clone(), n = 4;
    for (let k = 1; k <= n; k++) {
      d.add(new THREE.Vector3((R() - 0.5) * 0.35, (R() - 0.3) * 0.18 + (depth > 1 ? -0.05 : 0.04), (R() - 0.5) * 0.35)).normalize();
      if (depth === 0) d.lerp(new THREE.Vector3(o.lean ?? 0.08, 1, 0).normalize(), 0.35).normalize();
      p.addScaledVector(d, len / n); pts.push(p.clone());
    }
    const r1 = r0 * (depth === 0 ? 0.45 : 0.3);
    branches.push({ pts, r0, r1, depth });
    if (depth >= 3) { tips.push({ p: p.clone(), d: d.clone(), w: 1 }); return; }
    const kids = depth === 0 ? 6 + Math.floor(R() * 3) : depth === 1 ? 3 + Math.floor(R() * 2) : 3;
    const curve = new THREE.CatmullRomCurve3(pts);
    for (let k = 0; k < kids; k++) {
      const t = depth === 0 ? 0.38 + 0.6 * (k / kids) + R() * 0.05 : 0.35 + 0.6 * R();
      const at = curve.getPointAt(Math.min(1, t)), tan = curve.getTangentAt(Math.min(1, t));
      const az = k * 2.4 + R() * 0.8, up = depth === 0 ? 0.55 + R() * 0.3 : 0.25 + R() * 0.3;
      const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const nd = tan.clone().multiplyScalar(0.4).add(side.multiplyScalar(spread)).add(new THREE.Vector3(0, up, 0)).normalize();
      const rAt = r0 + (r1 - r0) * t;
      grow(at, nd, len * (depth === 0 ? 0.55 - 0.25 * t : 0.55 + R() * 0.15), rAt * (0.55 + R() * 0.15), depth + 1);
      if (depth >= 1 && R() < 0.6) tips.push({ p: at.clone(), d: nd.clone(), w: 0.6 });
    }
    if (depth >= 1) tips.push({ p: p.clone(), d: d.clone(), w: 0.8 });
  };
  grow(new THREE.Vector3(0, -0.15, 0), new THREE.Vector3(0, 1, 0), H * 0.55, 0.22 * H / 7.5, 0);
  const bark = barkTextures();
  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: bark.map, normalMap: bark.nrm, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.92, envMapIntensity: 0.6 });
  const barkGeo = mergeGeometries(branches.map(b => tube(b, b.depth === 0 ? 14 : b.depth === 1 ? 9 : 5, b.depth === 0 ? 0.9 : 0, R)));
  const bm = new THREE.Mesh(barkGeo, barkMat); bm.castShadow = bm.receiveShadow = true; bm.name = 'tree_bark';
  // 叶卡
  const crown = new THREE.Vector3(); tips.forEach(t => crown.add(t.p)); crown.divideScalar(Math.max(1, tips.length));
  const box = new THREE.Box3(); tips.forEach(t => box.expandByPoint(t.p)); const csz = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(1, 1, 1));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const per = Math.round(10 * (o.leafDensity ?? 1)), sz = (o.leafSize ?? 0.75) * H / 7.5;
  const tmpC = new THREE.Color();
  for (const tp of tips) for (let k = 0; k < per * tp.w; k++) {
    const c = tp.p.clone().add(new THREE.Vector3((R() - 0.5) * 1.1, (R() - 0.35) * 0.8, (R() - 0.5) * 1.1).multiplyScalar(sz * 1.3));
    const fwd = tp.d.clone().add(new THREE.Vector3((R() - 0.5) * 1.4, (R() - 0.5) * 0.9 - 0.25, (R() - 0.5) * 1.4)).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(R() - 0.5, 1, R() - 0.5).normalize()).normalize();
    const s = sz * (0.75 + R() * 0.5);
    const base = c.clone().addScaledVector(fwd, -s * 0.45);
    const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
    const sph = c.clone().sub(crown).divide(csz).normalize();   // 球形法线
    const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (c.y - box.min.y) / (box.max.y - box.min.y + 0.01)));
    tmpC.setHSL(0.21 + (R() - 0.5) * 0.06 - (o.autumn ?? 0) * 0.13 * R(), 0.26 + R() * 0.12, 0.33 + R() * 0.08);
    const b0 = pos.length / 3;
    for (const [u, v] of corners) {
      const p = base.clone().addScaledVector(side, u * s).addScaledVector(fwd, v * s);
      pos.push(p.x, p.y, p.z); nor.push(sph.x, sph.y + 0.25, sph.z); uv.push(u + 0.5, v); col.push(tmpC.r * ao * 1.5, tmpC.g * ao * 1.5, tmpC.b * ao * 1.5);
    }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3).onUpload(() => {}));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); lg.setIndex(idx);
  lg.getAttribute('normal').needsUpdate = true; (lg.getAttribute('normal') as THREE.BufferAttribute).normalized = false;
  const leafMat = floraShade(new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.68, envMapIntensity: 0.65 }),
    { trans: 0.45, rootDark: 0, key: 'leaf' });
  const lm = new THREE.Mesh(lg, leafMat); lm.castShadow = lm.receiveShadow = true; lm.name = 'tree_leaves';
  dynPlant(barkMat, { tree: true, amp: 0.05, h0: H, baseY: 0, merged: false, leaf: false });   // 11-17 单株网格：按原点整棵同相
  dynPlant(leafMat, { tree: true, amp: 0.05, h0: H, baseY: 0, merged: false, leaf: true });
  for (const m of [bm, lm]) { const d = dynDepth(m.material as THREE.Material); if (d) m.customDepthMaterial = d; m.userData.dynDone = true; }
  grp.add(bm, lm);
  grp.userData.leafCards = idx.length / 6;
  return grp;
}

// ---------------------------------------------------------------- 11-16 分块 + 距离剔除（沉钟海岸卡顿根因：全图 31 万草叶 + 1 万花在一个 InstancedMesh 里、关了视锥剔除，每帧整图约 450 万三角形全画）
/** 把组里每个 InstancedMesh 按 cell 米的网格拆成小块（各自包围球 → 视锥剔除生效），再按相机水平距离 far 米以外隐藏。
 *  返回统计。块边缘不做淡出：far 设在雾已经很浓的距离。 */
export function chunkFlora(grp: THREE.Object3D, cell: number, far: number): { chunks: number; inst: number } {
  const ims: THREE.InstancedMesh[] = []; grp.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) ims.push(o as THREE.InstancedMesh); });
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), c = new THREE.Color(); let chunks = 0, inst = 0;
  const all: THREE.InstancedMesh[] = [];
  for (const im of ims) {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(i); }
    const par = im.parent!; par.remove(im);
    for (const [, ids] of buckets) {
      const ch = new THREE.InstancedMesh(im.geometry, im.material, ids.length); ch.name = im.name + '_c';
      ids.forEach((src, j) => { im.getMatrixAt(src, m4); ch.setMatrixAt(j, m4); if (im.instanceColor) { im.getColorAt(src, c); ch.setColorAt(j, c); } });
      ch.castShadow = im.castShadow; ch.receiveShadow = im.receiveShadow; ch.customDepthMaterial = im.customDepthMaterial; ch.userData.dynDone = true; if (im.userData.refl) ch.userData.refl = true;
      ch.computeBoundingSphere(); ch.frustumCulled = true; par.add(ch); all.push(ch); chunks++; inst += ids.length;
    }
    im.dispose();
  }
  // 距离剔除：挂一个不画东西的小网格，借它的 onBeforeRender 拿到相机（滞后一帧，看不出来）
  const far2 = far * far, cen = all.map(ch => ch.boundingSphere!.center.clone()), rad = all.map(ch => ch.boundingSphere!.radius);
  const probe = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  probe.frustumCulled = false; probe.name = 'flora_cull'; probe.userData.outlineParameters = { visible: false };
  const w = new THREE.Vector3(), cp = new THREE.Vector3();
  probe.onBeforeRender = (_r, _s, cam) => {
    cam.getWorldPosition(cp);
    for (let i = 0; i < all.length; i++) { all[i].getWorldPosition(w); const dx = cen[i].x + w.x - cp.x, dz = cen[i].z + w.z - cp.z, R = far + rad[i]; all[i].visible = dx * dx + dz * dz < R * R; }
  };
  void far2; grp.add(probe);
  return { chunks, inst };
}
