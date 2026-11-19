// ======================================================================
// 11-13 桌面版画质提升（wip/electron1109，I15/I19）——参考 Saltline / fable52 拆解：
//   1. 天空即光源：把当前天空球（含昼夜变化）烘成 PMREM 环境光，给所有 PBR 材质（Lux3D 场景件、HD 件）统一的天光反射与暗部颜色
//   2. PCSS 软阴影（超高档）：离遮挡物越远边缘越虚；用 sun.shadow.radius ≥ 3 当开关（程序缓存不随 ShaderChunk 变，靠逐灯 uniform 切）
//   3. 体积光（高 / 超高，户外）：太阳屏幕位置做径向模糊，只取高亮天空 → 逆光光柱
//   4. 输出：ACES 往 AgX 拉的混合色调（防高光发黄过饱和）+ 胶片颗粒 + 抖动去色带
//   动态分辨率在 gfx.ts Pipeline 里（按帧时缩放渲染像素比，目标约 50 帧）
// ======================================================================
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { seaSkyOn, seaSkyHour, ssRays } from './seasky_core';   // 11-15 海天共用件

// ---------------------------------------------------------------- 1. 天空 → PMREM
const OUTDOOR = new Set(['camp', 'field', 'frost', 'none']);
export class SkyEnv {
  private pm: THREE.PMREMGenerator; private rt: THREE.WebGLRenderTarget | null = null;
  private sc = new THREE.Scene(); private mesh: THREE.Mesh; private sig = ''; private t = 0;
  enabled = false;
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, sky: THREE.Mesh) {
    this.pm = new THREE.PMREMGenerator(renderer);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), sky.material as THREE.Material);
    this.sc.add(this.mesh);
  }
  /** 每帧调用；天空颜色变了（昼夜）才重烘，最多 2 秒一次 */
  tick(dt: number, grade: string) {
    if (!this.enabled) { if (this.scene.environment === this.rt?.texture) this.scene.environment = null; return; }
    this.t -= dt; if (this.t > 0) return; this.t = 2;
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    const q = (c: THREE.Color) => `${(c.r * 40) | 0},${(c.g * 40) | 0},${(c.b * 40) | 0}`;
    const sd = u?.cineSun?.value as Float32Array | undefined;   // 11-14 第 1 步：光晕跟着太阳走 → 太阳方向也进签名
    // 11-15 海天共用件在跑：只按游戏时间 30 分钟一档 + 档位重烘（日盘 / 星空 / 银河由 uDisc=0 关掉）
    const sig = seaSkyOn() ? `ss${Math.floor(seaSkyHour() * 2)}|${grade}` : u ? q(u.top.value) + q(u.mid.value) + q(u.bottom.value) + (sd ? `${(sd[0] * 20) | 0},${(sd[1] * 20) | 0},${(sd[2] * 20) | 0}` : '') : 'x';
    // 别的模块（选角台、井口码头 HD）自己设了环境贴图 → 不抢
    const mine = !this.scene.environment || this.scene.environment === this.rt?.texture;
    if (!mine) return;
    if (sig !== this.sig || !this.rt) {
      this.sig = sig; const old = this.rt;
      if (u?.uDisc) u.uDisc.value = 0;   // 日盘不进环境光（否则所有金属上一个亮点）
      this.rt = this.pm.fromScene(this.sc, 0.04, 0.1, 100);
      if (u?.uDisc) u.uDisc.value = 1;
      old?.dispose();
    }
    this.scene.environment = this.rt.texture;
    this.scene.environmentIntensity = OUTDOOR.has(grade) ? 0.75 : 0.3;   // 洞穴 / 熔岩：天光弱
  }
}

// ---------------------------------------------------------------- 2. PCSS（替换 PCF_SOFT 分支；sun.shadow.radius ≥ 3 时启用）
let pcssDone = false;
export function installPCSS() {
  if (pcssDone) return; pcssDone = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  const fn = `
	float drIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 drVogel( int i, int n, float phi ) { float r = sqrt( ( float( i ) + 0.5 ) / float( n ) ); float th = float( i ) * 2.39996323 + phi; return vec2( cos( th ), sin( th ) ) * r; }
	// 正交阳光：阴影相机 64 m 宽、深 139 m（main.ts）；半影 ≈ 遮挡距离 × 0.025（黄昏偏软）
	float drPCSS( sampler2D sm, vec2 size, vec4 sc, float rad ) {
		// 11-14 电影感第 2 步：radius 即档位——5 超高（遮挡搜索 16 / 过滤 20）、4 高（12 / 16）、3 中（8 / 8）
		int nb = rad >= 4.5 ? 16 : rad >= 3.5 ? 12 : 8, nf = rad >= 4.5 ? 20 : rad >= 3.5 ? 16 : 8;
		vec2 texel = 1.0 / size; float phi = drIGN( gl_FragCoord.xy ) * 6.2831853;
		float searchR = 0.0035; float blk = 0.0; float n = 0.0;
		for ( int i = 0; i < 16; i ++ ) { if ( i >= nb ) break; float d = unpackRGBAToDepth( texture2D( sm, sc.xy + drVogel( i, nb, phi ) * searchR ) ); if ( d < sc.z ) { blk += d; n += 1.0; } }
		if ( n < 0.5 ) return 1.0;
		blk /= n;
		float pen = clamp( ( sc.z - blk ) * 0.0543, texel.x * 1.5, searchR );
		float s = 0.0;
		for ( int i = 0; i < 20; i ++ ) { if ( i >= nf ) break; s += step( sc.z, unpackRGBAToDepth( texture2D( sm, sc.xy + drVogel( i, nf, phi ) * pen ) ) ); }
		return s / float( nf );
	}
	// 11-19 秋林 Demo PCSS 原式（autumn_forest_src.html pcssShadow，?off=qlpcss）：遮挡搜索 10 点 × 半径 9 texel、半影 = (z − 平均遮挡) × 0.075，
	//   夹在 1.6 texel–0.012（uv）之间，过滤 n 点（高 16 / 中 8）Vogel + IGN 旋转；shadow.radius = 10 + n 时走这里（radius 是逐灯 uniform，切换不重编）
	float dmPCSS( sampler2D sm, vec2 size, vec2 uv, float z, int n ) {
		float phi = 6.2831 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		float tx = 1.0 / size.x; float bs = 0.0, bn = 0.0;
		for ( int i = 0; i < 10; i ++ ) { vec2 o = drVogel( i, 10, phi ) * tx * 9.0; float d = unpackRGBAToDepth( texture2D( sm, uv + o ) ); if ( d < z ) { bs += d; bn += 1.0; } }
		if ( bn < 0.5 ) return 1.0;
		float pen = clamp( ( z - bs / bn ) * 0.075, 1.6 * tx, 0.012 );
		float s = 0.0;
		for ( int i = 0; i < 16; i ++ ) { if ( i >= n ) break; vec2 o = drVogel( i, n, phi + 1.7 ) * pen; s += texture2DCompare( sm, uv + o, z ); }
		return s / float( n );
	}
	float getShadow(`;
  const pf = C.shadowmap_pars_fragment;
  if (!pf.includes('drPCSS') && pf.includes('float getShadow(') && pf.includes('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )')) {
    C.shadowmap_pars_fragment = pf.replace('float getShadow(', fn).replace('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )',
      '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )\n\t\t\tif ( shadowRadius >= 10.0 ) { shadow = dmPCSS( shadowMap, shadowMapSize, shadowCoord.xy, shadowCoord.z, int( shadowRadius + 0.5 ) - 10 ); } else if ( shadowRadius >= 3.0 ) { shadow = drPCSS( shadowMap, shadowMapSize, shadowCoord, shadowRadius ); } else {');
    // 原 PCF_SOFT 分支结尾补一个括号：在 VSM 分支前
    C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace('\t\t#elif defined( SHADOWMAP_TYPE_VSM )', '\t\t\t}\n\t\t#elif defined( SHADOWMAP_TYPE_VSM )');
  } else console.warn('[fxd] PCSS 注入点没找到（three 版本变了？）');
}

// ---------------------------------------------------------------- 3. 体积光（径向模糊）
export class GodRaysPass extends Pass {
  private ssDir = new THREE.Vector3(); private ssTint = new THREE.Color();
  private q: FullScreenQuad; readonly mat: THREE.ShaderMaterial;
  private v = new THREE.Vector3(); strength = 0.5;
  constructor(private camera: THREE.Camera, private sun: THREE.DirectionalLight) {
    super();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, sunUv: { value: new THREE.Vector2(0.5, 0.5) }, k: { value: 0 }, tint: { value: new THREE.Color(1.0, 0.82, 0.6) }, aspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunUv; uniform float k; uniform vec3 tint; uniform float aspect; varying vec2 vUv;
        float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          if (k <= 0.001) { gl_FragColor = base; return; }
          vec2 d = (sunUv - vUv); float j = ign(gl_FragCoord.xy);
          const int N = 28; vec2 st = d / float(N) * 0.9; vec2 p = vUv + st * j; float acc = 0.0, w = 1.0;
          for (int i = 0; i < N; i++) { vec3 c = texture2D(tDiffuse, p).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            acc += smoothstep(0.85, 1.6, l) * w; w *= 0.955; p += st; }
          acc /= float(N);
          vec2 dd = d; dd.x *= aspect; float fall = exp(-length(dd) * 1.6);   // 离太阳越远越淡
          gl_FragColor = vec4(base.rgb + tint * acc * k * fall * 2.2, base.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.q = new FullScreenQuad(this.mat);
  }
  update(outdoor: boolean, w: number, h: number) {
    const u = this.mat.uniforms; u.aspect.value = w / Math.max(1, h);
    if (!outdoor) { u.k.value = 0; return; }
    // 11-15 海天共用件：方向 + 颜色随时段（夜里用月亮、偏冷）；null = 共用件没在跑 → 旧逻辑
    const ssK = ssRays(this.ssDir, this.ssTint);
    // 太阳方向（光从 position 照向 target）→ 远处一点投到屏幕
    if (ssK !== null) this.v.copy(this.ssDir).normalize().multiplyScalar(400).add((this.camera as THREE.PerspectiveCamera).position);
    else this.v.copy(this.sun.position).sub(this.sun.target.position).normalize().multiplyScalar(400).add((this.camera as THREE.PerspectiveCamera).position);
    const facing = this.v.clone().sub((this.camera as THREE.PerspectiveCamera).position).normalize().dot(this.camera.getWorldDirection(new THREE.Vector3()));
    this.v.project(this.camera);
    const sx = this.v.x * 0.5 + 0.5, sy = this.v.y * 0.5 + 0.5;
    u.sunUv.value.set(sx, sy);
    const off = Math.max(0, Math.max(Math.abs(this.v.x), Math.abs(this.v.y)) - 1);   // 太阳出屏后渐隐
    const elev = ssK !== null ? this.ssDir.y : this.sun.position.y - this.sun.target.position.y;
    u.k.value = facing > 0 && elev > 0 ? this.strength * (ssK ?? 1) * Math.max(0, 1 - off * 1.2) * THREE.MathUtils.smoothstep(facing, 0.1, 0.5) : 0;
    if (ssK !== null) u.tint.value.copy(this.ssTint);
    else u.tint.value.copy(this.sun.color).lerp(new THREE.Color(1, 0.8, 0.55), 0.5);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.q.render(renderer);
  }
}

// ---------------------------------------------------------------- 4. 输出：ACES/AgX 混合 + 颗粒 + 抖动
/** 给 OutputPass 的材质打补丁；返回每帧要更新的 uniform */
// 11-17g 秋林调色按专长包 v8 配置（cinematic.config.js post.grade）：饱和 1.22、伽马 1.08、暗部 (0.90,1,0.97)→亮部 (1.05,1,0.90)、颗粒 0.018×(1−0.6·亮度)、抖动 1/255；
//   uQl = 各图秋林权重（map_look.ql，保留气候）；?off=qlgrade 回游戏原调色。曝光另议（three 的 ACES 自带 ÷0.6，与 Demo 的 Hill 拟合不同口径）。
export function patchOutput(outMat: THREE.RawShaderMaterial | THREE.ShaderMaterial) {
  // 11-18 秋林移植·色调：uQlTone = 1 时与 Demo 合成段一致——纯 ACES（不混 35% AgX，AgX 会压平高光、去饱和）+ 色调映射前径向暗角 (1 − |uv−0.5|²·0.42)；?off=qltone 回旧
  const U = { uTime: { value: 0 }, uGrain: { value: 0.03 }, uAgx: { value: 0.35 }, uQl: { value: 0 }, uQlTone: { value: 0 } };
  Object.assign(outMat.uniforms, U);
  let fs = outMat.fragmentShader;
  if (!fs.includes('uAgx')) {
    fs = fs.replace('void main() {', 'uniform float uTime; uniform float uGrain; uniform float uAgx; uniform float uQl; uniform float uQlTone;\nfloat drHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nvoid main() {');
    fs = fs.replace('gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );', '{ vec3 h = gl_FragColor.rgb; vec2 dq = vUv - 0.5; h *= mix( 1.0, 1.0 - dot( dq, dq ) * 0.42, uQlTone ); gl_FragColor.rgb = mix( ACESFilmicToneMapping( h ), AgXToneMapping( h ), uAgx * ( 1.0 - uQlTone ) );\n    if ( uQl > 0.0 ) { vec3 c = gl_FragColor.rgb; float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); vec3 g = mix( vec3( l ), c, 1.22 ); g = pow( max( g, 0.0 ), vec3( 1.08 ) ); g *= mix( vec3( 0.90, 1.0, 0.97 ), vec3( 1.05, 1.0, 0.90 ), smoothstep( 0.05, 0.6, l ) ); gl_FragColor.rgb = mix( c, g, uQl ); } }');
    // 颗粒（暗部、中间调多一点，亮部少）+ 1/255 三角抖动去色带：放在 sRGB 编码之后
    const tail = `\n\t\t\t{ vec2 fc = gl_FragCoord.xy; float n = drHash(fc + fract(uTime) * 91.7) + drHash(fc * 1.37 + fract(uTime * 1.3) * 53.1) - 1.0;
\t\t\t  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)); gl_FragColor.rgb += n * (uGrain * (1.0 - lum * mix(0.7, 0.6, step(0.001, uQl))) + 1.0 / 255.0); }\n`;
    const i = fs.lastIndexOf('}'); fs = fs.slice(0, i) + tail + fs.slice(i);
    outMat.fragmentShader = fs; outMat.needsUpdate = true;
  }
  return U;
}
