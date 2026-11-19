// ======================================================================
// 11-17e 雪山远景层（画质专长第 16 步「远景一次画好」+ 第 89 步雪山思路 + 秋林逆光远处雪山，代码本项目重写）
//   在 mountain_hd 山环（≤ 680 m）之外再加一层「天边雪山」：
//   · 相机跟随的环带（像天空一样没有视差，表示几十公里外的山），深度写到远裁剪面附近 → 永远在近景 / 山环之后、天空之前，不受 700 m 远裁剪面限制
//   · 剪影全在片元里按方位角算（环向无缝 ridged 噪声），两层：后排高而淡（更蓝更白）、前排低而清，一次绘制，几何只有一圈 64–128 段
//   · 顶雪：按剪影相对高度 + 噪声 + 假坡度（剪影导数），阳面暖白、阴面冷蓝（跟随当前太阳，与 mountain_hd 同一套光 / 空气函数）
//   · 大气透视：远山透过率很低（≈ 35–60%），山脚整段沉进地平线空气色；场景雾浓（暴风雪 / 湿雾）时透过率跟着降
//   各图保留气候：只给有雪的图（霜脊雪最多 / 星落高原 / 暗岩山麓 / 翠风原野只有远处高峰雪顶 / 营地零星），赤砂 / 烬落 / 腐沼 / DLC 不加
//   画质：中 / 高 / 超高 = 两层 + 冲沟明暗；低 = 一层、3 个八度、无冲沟（mountain_hd 低档不建，这层就是低档的远山剪影）
//   ?off=snowfar（或 localStorage darkrock_cine_off 含 snowfar）→ 不建
// ======================================================================
import * as THREE from 'three';
import { curQuality } from './gfx';
import { cineUniforms } from './cine';
import { seaSkyOn, ssU } from './seasky_core';
import { MTN_GL_NOISE, MTN_GL_LIGHT } from './mountain_hd';

export type SnowFarStyle = 'camp' | 'field' | 'star' | 'foothill' | 'frost';
interface FarProf {
  /** 后排 / 前排最高仰角（tan） */ hB: number; hF: number;
  /** 雪线（剪影相对高度，0 = 山脚，1 = 峰顶；越小雪越多） */ snow: number;
  /** 透过率倍数（大 = 更清楚） */ clear: number;
  rock: number; snowC: number;
  /** ridged 指数（大 = 更尖） */ sharp: number;
}
const FAR: Record<SnowFarStyle, FarProf> = {
  camp:     { hB: 0.060, hF: 0.034, snow: 0.80, clear: 0.85, rock: 0x4a4a50, snowC: 0xeef2f8, sharp: 1.3 },
  field:    { hB: 0.075, hF: 0.040, snow: 0.68, clear: 0.90, rock: 0x4c4842, snowC: 0xf0f3f8, sharp: 1.35 },
  star:     { hB: 0.095, hF: 0.050, snow: 0.48, clear: 1.25, rock: 0x48445a, snowC: 0xeef0fa, sharp: 1.45 },
  foothill: { hB: 0.085, hF: 0.048, snow: 0.62, clear: 0.80, rock: 0x403e3a, snowC: 0xe8ecf2, sharp: 1.4 },
  frost:    { hB: 0.110, hF: 0.060, snow: 0.28, clear: 0.95, rock: 0x343a46, snowC: 0xf2f6fc, sharp: 1.7 },
};
export function hasSnowFar(id: string): id is SnowFarStyle { return Object.prototype.hasOwnProperty.call(FAR, id); }

let offS: boolean | null = null;
export function snowFarOn(): boolean {
  if (offS === null) {
    offS = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offS = `${q},${ls}`.split(',').map(s => s.trim()).includes('snowfar');
    } catch { offS = false; }
  }
  return !offS;
}
export const snowFarStats: Record<string, { seg: number; lite: boolean }> = {};

/** 一张图一个（挂进本图 group，烘焙合批之后挂；group 隐藏时一起隐藏） */
export function buildSnowFar(style: SnowFarStyle, seed = 0): THREE.Mesh {
  const P = FAR[style], lite = curQuality === 'low';
  const sd = seed || [...style].reduce((a, c) => a + c.charCodeAt(0) * 17, 3);
  const seg = lite ? 64 : 128;
  // 单位半径圆筒，y 是仰角的 tan（-0.04 .. 0.16）；顶点着色器把它挂在相机周围
  const g = new THREE.CylinderGeometry(1, 1, 0.2, seg, 1, true); g.translate(0, 0.06, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const U = {
    ...cineUniforms(), ...(seaSkyOn() ? { ssSunD: ssU.ssSunD, ssK: ssU.ssK } : { ssSunD: { value: new THREE.Vector3(0, 1, 0) }, ssK: { value: new THREE.Vector4(0, 0, 0, 0) } }),
    uSSon: { value: seaSkyOn() ? 1 : 0 },
    uH: { value: new THREE.Vector4(P.hB, P.hF, P.snow, P.clear) },
    uSeed: { value: new THREE.Vector3((sd % 97) * 0.731, (sd % 89) * 0.517, P.sharp) },
    uRock: { value: new THREE.Color(P.rock) }, uSnowC: { value: new THREE.Color(P.snowC) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, fog: false, transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vD;
      void main(){ vD = position; vec3 w = cameraPosition + position * 520.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); gl_Position.z = gl_Position.w * 0.999998; }`,   // 远裁剪面（700 m）跟前：在一切几何（含 680 m 内的山环）之后、天空（深度 1）之前
    fragmentShader: (lite ? '#define SF_LITE 1\n' : '') + MTN_GL_NOISE + MTN_GL_LIGHT + /* glsl */ `
      uniform vec4 uH; uniform vec3 uSeed; uniform vec3 uRock; uniform vec3 uSnowC; varying vec3 vD;
      // 环向无缝 ridged：在单位圆上取二维噪声
      float sfR(vec2 p, float sh){ float s = 0., a = .55, w = 1.;
      #ifdef SF_LITE
        for (int i = 0; i < 3; i++)
      #else
        for (int i = 0; i < 6; i++)
      #endif
        { float n = 1. - abs(mvn(p) * 2. - 1.); n *= n; n *= w; w = clamp(n * 1.6, 0., 1.); s += n * a; p = p * 2.07 + vec2(13.7, 7.1); a *= .5; }
        return pow(s, sh); }
      // 一排山在方位角 az 的剪影高度（tan 仰角）
      float sfH(float az, float top, float fq, vec2 off){
        vec2 c = vec2(cos(az), sin(az));
        float env = .25 + .75 * smoothstep(.15, .75, mvn(c * 1.3 + off * .37));   // 有的方向高、有的方向留低垭口
        return top * env * (.18 + .82 * sfR(c * fq + off, uSeed.z));
      }
      vec4 sfLayer(float az, float el, float aa, float top, float fq, vec2 off, float clr, vec3 dir, vec3 L, float day){
        float h = sfH(az, top, fq, off);
        float cov = 1. - smoothstep(h - aa, h + aa, el);
        if (cov <= 0.) return vec4(0.);
        float e = 0.004; float dh = (sfH(az + e, top, fq, off) - sfH(az - e, top, fq, off)) / (2. * e);   // 剪影斜率 → 假坡向
        vec2 hz = normalize(dir.xz); vec3 tg = vec3(-hz.y, 0., hz.x);
        float rel = clamp(el / max(h, 1e-3), 0., 1.);                     // 0 山脚 → 1 剪影边
        float hn = h / top;                                               // 这一处山有多高（高峰更多雪）
        vec3 n = normalize(vec3(-dir.x, 0., -dir.z) * .55 + vec3(0., .55 + .35 * rel, 0.) - tg * clamp(dh * 6., -1.2, 1.2));
        vec2 cc = vec2(cos(az), sin(az));                                  // 方位噪声都在单位圆上取（atan 接缝处不出竖线）
        float gul = 0.;
      #ifndef SF_LITE
        gul = mfb(cc * 41. + vec2(off.x, el * 90.)) - .5;                // 竖向冲沟（只调明暗 / 雪边）
        n = normalize(n + tg * gul * .5);
      #endif
        float line = rel * (.55 + .7 * hn) - uH.z + gul * .35 + (mvn(cc * 6.4 + off + 3.) - .5) * .25;
        float snow = smoothstep(-.06, .12, line);
        vec3 alb = mix(uRock * (.8 + .4 * mvn(cc * 19. + vec2(el * 60., 1.7))), uSnowC, snow);
        float ndl = dot(n, L), lit = smoothstep(-.05, .3, ndl);
        vec3 sunL = cineSunCol * vec3(1., .91, .78) * max(ndl, 0.);
        vec3 sky = mix(vec3(.30, .42, .70), vec3(.45, .48, .57), lit) * .7 * day;
        vec3 col = alb * (sunL + sky);
        // 大气透视：本层透过率 × 场景雾浓度；山脚贴地平线一段全进空气
        float T = clr * uH.w * clamp(.005 / max(cineFog.x, 1e-4), .45, 1.2);
        T *= smoothstep(.0, .55, rel + .15 * hn);
        vec3 air = mtnAir(dir, L) * vec3(.93, .98, 1.06);
        return vec4(mix(air, col, clamp(T, 0., .85)), cov);
      }
      void main(){
        vec3 dir = normalize(vD); float hl = length(dir.xz); float el = dir.y / max(hl, 1e-3);
        float aa = max(fwidth(el), 1e-4) * 1.2;   // 剪影边抗锯齿（在任何 discard 之前取导数）
        if (el > uH.x * 1.05 || el < -0.03) discard;
        float az = atan(dir.z, dir.x);
        vec3 L = mtnL(); float day = clamp(dot(cineHor, vec3(.3, .5, .2)) * 1.6, .03, 1.);
        vec4 c = sfLayer(az, el, aa, uH.x, 2.2, uSeed.xy, .42, dir, L, day);              // 后排：高、淡
      #ifndef SF_LITE
        vec4 f = sfLayer(az + 1.7, el, aa, uH.y, 3.1, uSeed.yx + 5.3, .62, dir, L, day);   // 前排：低、清
        float ao = f.a + c.a * (1. - f.a);                                 // 前排盖在后排上（非预乘 over）
        c.rgb = (f.rgb * f.a + c.rgb * c.a * (1. - f.a)) / max(ao, 1e-4); c.a = ao;
      #endif
        if (c.a <= 0.002) discard;
        gl_FragColor = vec4(c.rgb, c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.userData.outlineParameters = { visible: false }; mat.userData.noBake = true;
  const m = new THREE.Mesh(g, mat); m.name = 'snowfar_' + style; m.frustumCulled = false; m.renderOrder = -10;
  m.matrixAutoUpdate = false; m.castShadow = false; m.receiveShadow = false; m.userData.noBake = true;
  snowFarStats[style] = { seg, lite };
  return m;
}
