// 手绘风格贴图（assets/textures，本项目原创）：地形按顶点权重混合三层贴图（splat），物件直接贴图
// 贴图都是无缝的，按世界坐标平铺；仍然走卡通着色（MeshToonMaterial），描边效果不变
import { cineTriplanar, cineWater, CINE, CFX, CFX2 } from './cine';
import * as THREE from 'three';
import { roadShader, type RoadMask, type RoadLook } from './road2';
import { TEXTURES } from './assets.gen';
import { toonGradient } from './gfx';

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** 取一张贴图（重复平铺）；同名共享一份 */
export function tex(name: string, repeat = 1): THREE.Texture | null {
  const url = TEXTURES[name];
  if (!url) return null;
  const key = `${name}@${repeat}`;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.repeat.set(repeat, repeat);
    t.userData.texName = name;   // v1.2.49 环境高精化按贴图名认材质（合批后也认得）
    cache.set(key, t);
  }
  return t;
}

/** 物件用：卡通材质 + 贴图（颜色当作色调乘上去） */
/** 11-14 电影感第 7 步：石面 / 岩石 / 泥土 / 地砖这类平铺贴图走世界坐标三平面（缩放过的方块、柱子不再拉伸成条纹） */
const TRI_TEX: Record<string, number> = { stone: 0.55, rock: 0.4, mud: 0.45, dirt: 0.45, brick: 0.6, tile: 0.6, cobble: 0.6, slate: 0.5 };
export function texToon(name: string, color: THREE.ColorRepresentation = 0xffffff, repeat = 1, opts: THREE.MeshToonMaterialParameters = {}) {
  const m = new THREE.MeshToonMaterial({ color, map: tex(name, repeat), gradientMap: toonGradient(), ...opts });
  return TRI_TEX[name] ? cineTriplanar(m, TRI_TEX[name]) : m;
}

/**
 * 地形混合材质：三层贴图按顶点属性 splat(vec3) 的权重混合，世界坐标 xz 平铺
 * 顶点色仍然生效（作为明暗/色调变化），所以地形不会显得重复
 */
/** v0.9.1：贴图平均色（地面降噪用；图片未就绪时回退中灰） */
// fix1109c #5：onBeforeCompile 每编一个程序变体（含阴影 / 雾 / 点光个数变体）都会调一次，原来每次都 drawImage 大图 + getImageData 读回（实测进世界预热里约 5% 主线程）→ 按图片缓存
const avgCache = new WeakMap<object, THREE.Vector3>();
function avgColor(t: THREE.Texture | null | undefined): THREE.Vector3 {
  const img0 = t?.image as object | undefined; const hit = img0 && avgCache.get(img0); if (hit) return hit.clone();
  const v = avgColor0(t); if (img0 && ((img0 as HTMLImageElement).complete !== false)) avgCache.set(img0, v.clone());
  return v;
}
function avgColor0(t: THREE.Texture | null | undefined): THREE.Vector3 {
  const v = new THREE.Vector3(0.5, 0.5, 0.5);
  const img = t?.image as CanvasImageSource & { width?: number; complete?: boolean } | undefined;
  if (!img || (img as HTMLImageElement).complete === false) return v;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); if (!g) return v;
    g.drawImage(img, 0, 0, 8, 8); const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4, lin = (x: number) => Math.pow(x / n / 255, 2.2);
    v.set(lin(r), lin(gg), lin(b));
  } catch { /* 跨域等：用默认 */ }
  return v;
}
export function splatMaterial(layers: [string, string, string], scales: [number, number, number] = [0.12, 0.1, 0.08], rock: 'frost' | 'ember' | null = null, road: { mask: RoadMask; look?: RoadLook } | null = null) {   // 11-16e road：魔兽式主路遮罩   // 11-16c rock：山体门图的崖壁写实层
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  const t = layers.map(n => tex(n));
  const rd = road ? roadShader(road.mask, road.look) : null;
  m.onBeforeCompile = shader => {
    if (rd) Object.assign(shader.uniforms, rd.uniforms);
    shader.uniforms.tA = { value: t[0] };
    shader.uniforms.tB = { value: t[1] };
    shader.uniforms.tC = { value: t[2] };
    shader.uniforms.sc = { value: new THREE.Vector3(...scales) };
    shader.uniforms.cTriS = { value: CFX2 }; shader.uniforms.cSubS = { value: CFX };   // 11-14 第 7 / 12 步开关
    shader.uniforms.avgA = { value: avgColor(t[0]) }; shader.uniforms.avgB = { value: avgColor(t[1]) }; shader.uniforms.avgC = { value: avgColor(t[2]) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNs;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNs = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 cTriS;\nuniform vec4 cSubS;\nvarying vec3 vWNs;\nuniform sampler2D tA;\nuniform sampler2D tB;\nuniform sampler2D tC;\nuniform vec3 sc;\nuniform vec3 avgA;\nuniform vec3 avgB;\nuniform vec3 avgC;\nvarying vec3 vSplat;\nvarying vec3 vWPos;' + (rock ? '\nfloat rlH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat rlN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rlH(i), rlH(i + vec2(1,0)), f.x), mix(rlH(i + vec2(0,1)), rlH(i + vec2(1,1)), f.x), f.y); }' : '') + (rd ? '\n' + rd.head : ''))
      .replace('#include <map_fragment>', `
        vec3 sw = max(vSplat, vec3(0.0)); sw /= max(sw.x + sw.y + sw.z, 0.001);
        // 11-14 电影感第 7 步：坡面三平面（原来只按 xz 平铺，山坡上拉成竖条）
        vec3 tw = pow(abs(normalize(vWNs)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z); if (cTriS.y < 0.5) tw = vec3(0.0, 1.0, 0.0);
        #define SPT(T, S) (tw.y > 0.999 ? texture2D(T, vWPos.xz * S) : texture2D(T, vWPos.zy * S) * tw.x + texture2D(T, vWPos.xz * S) * tw.y + texture2D(T, vWPos.xy * S) * tw.z)
        vec4 cA = SPT(tA, sc.x);
        vec4 cB = SPT(tB, sc.y);
        vec4 cC = SPT(tC, sc.z);
        vec4 splatColor = cA * sw.x + cB * sw.y + cC * sw.z;
        ${rd ? rd.body : ''}
        // v0.9.1 地面降噪：细节只留 45%，其余用贴图的平均色（最低 mip）+ 大尺度手绘色块
        // 11-14 第 12 步：改成按每像素覆盖的贴图像素数自适应——近处细节 70%，图案小于约 1.5 像素后淡到 20%（远处不闪、不出同心圆摩尔纹）
        float dk = 0.45;
        if (cSubS.w > 0.5) { float px = length(fwidth(vWPos.xz * sc.x)) * float(textureSize(tA, 0).x); dk = mix(0.7, 0.2, smoothstep(0.6, 1.5, px)); }
        vec4 flatColor = vec4(avgA * sw.x + avgB * sw.y + avgC * sw.z, 1.0);
        float macro = 0.5 + 0.5 * sin(vWPos.x * 0.11 + sin(vWPos.z * 0.07) * 2.0) * sin(vWPos.z * 0.09 + 1.3);
        splatColor = mix(flatColor, splatColor, dk) * (0.9 + 0.2 * macro);
        float gl = dot(splatColor.rgb, vec3(0.2126, 0.7152, 0.0722)); splatColor.rgb = mix(vec3(gl), splatColor.rgb, 0.78) * 0.9;   // 地面退后：降饱和、压暗，让角色和特效跳出来
        ${rock ? `{   // 11-16c 山体门崖壁写实层（画质专长第 12/13 步）：岩层带 + 陡面竖痕 + 大色斑 + 岩台积${rock === 'frost' ? '雪' : '灰'}，只作用于岩石通道
          vec3 Nr = normalize(vWNs); float steep = 1.0 - abs(Nr.y), rk = sw.z;
          float wob = rlN(vWPos.xz * 0.07) * 3.0;
          float band = rlN(vec2(vWPos.y * 0.75 + wob, 0.5)) * 0.65 + rlN(vec2(vWPos.y * 2.3 + wob * 1.7, 4.5)) * 0.35;
          float streak = rlN(vec2(dot(vWPos.xz, vec2(1.3, 0.9)) * 0.55, vWPos.y * 0.05)) * smoothstep(0.3, 0.8, steep);
          float pch = rlN(vWPos.xz * 0.025 + 7.0);
          vec3 rc = splatColor.rgb * (0.55 + 0.9 * band) * mix(0.75, 1.2, pch) * (1.0 - ${rock === 'frost' ? '0.25' : '0.4'} * smoothstep(0.5, 0.9, streak));
          ${rock === 'frost' ? 'rc = mix(rc, rc * vec3(0.85, 0.95, 1.1), 0.4 * streak);' : 'rc *= vec3(1.05, 0.96, 0.9);'}
          float ledge = smoothstep(0.62, 0.85, Nr.y + (band - 0.5) * 0.35) * smoothstep(0.05, 0.4, steep + 0.1);
          rc = mix(rc, ${rock === 'frost' ? 'vec3(0.86, 0.9, 0.96)' : 'vec3(0.2, 0.185, 0.175)'}, ledge * ${rock === 'frost' ? '0.8' : '0.55'});
          splatColor.rgb = mix(splatColor.rgb, rc, rk);
        }` : ''}
        diffuseColor *= splatColor;`);
  };
  m.customProgramCacheKey = () => 'splat3c:' + layers.join(',') + (rock ? ':rk' + rock : '') + (rd ? ':' + rd.key : '');
  return m;
}

/** 给几何体加 splat 属性（每个顶点 3 个权重） */
export function setSplat(g: THREE.BufferGeometry, weights: Float32Array) {
  g.setAttribute('splat', new THREE.BufferAttribute(weights, 3));
}

/** 流动的水面：贴图偏移随时间滚动（主循环调用 updateWater） */
const waters: THREE.Texture[] = [];
export function waterMaterial(color: THREE.ColorRepresentation = 0x6a8a5a, opacity = 0.88) {
  const base = tex('water');
  const t = base ? base.clone() : null;
  if (t) { t.needsUpdate = true; t.repeat.set(10, 10); waters.push(t); }
  const tm = new THREE.MeshToonMaterial({ color, map: t, gradientMap: toonGradient(), transparent: true, opacity, depthWrite: false });
  return CINE.on[6] ? cineWater(tm, color, opacity) as unknown as THREE.MeshToonMaterial : tm;   // 11-14 电影感第 6 步：写实水面（菲涅尔天光 + 太阳闪光 + 滚动法线）
}
export function updateWater(dt: number) { for (const t of waters) { t.offset.x += dt * 0.012; t.offset.y += dt * 0.007; } }
