// 11-17 伊奥拉灵体立片（Rhett 选「第一条」）：原件是 AI 自动生成的写实网格，脸只有几十个大三角面、头发是几块厚片，贴图补不出形状。
//   改为用概念图（CG二 chars/iola.jpg）经 gpt-image-2 出的全身正面透明底图，做成始终面向镜头的竖直立片（绕竖轴转，不跟俯仰）：
//   本体一层（正常混合）+ 放大 6% 的加色光晕层；顶点着色器让衣摆和两侧长发飘动（贴图下沿 / 两侧摆幅大，头和躯干不动）。
//   原网格保留但不画（material.visible=false），量身高、名牌、适配缩放仍按网格走。?off=iolacard 回到网格版。
import * as THREE from 'three';
import { IOLA_CARD_WEBP } from './iola_card_tex';

let offC: boolean | null = null;
export function iolaCardOn(): boolean {
  if (offC === null) {
    offC = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      offC = `${q},${ls}`.split(',').map(s => s.trim()).includes('iolacard');
    } catch { offC = false; }
  }
  return !offC;
}

let tex: THREE.Texture | null = null;
function cardTex(): THREE.Texture {
  if (!tex) { tex = new THREE.TextureLoader().load(IOLA_CARD_WEBP); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
  return tex;
}

// 11-17 换成 Blender 毛发曲线版正面渲染（原件网格 + 约 3.8 万根毛发，发色取原件贴图）。图里人物从上 1.1% 到下 1.9%（alpha>40 的范围），立片高度按此把人物头顶到裙摆对齐到 H
const FIG_TOP = 0.989, FIG_BOT = 0.019, ASPECT = 768 / 1152;

const VERT = /* glsl */ `
uniform float uGT; uniform float uSway; varying vec2 vUv;
void main() {
  vUv = uv; vec3 p = position;
  // 飘动：衣摆（下半）按高度平方加摆幅，两侧长发（上半、离中线远）轻摆；中线头部与躯干不动
  float hem = pow(clamp(1.0 - uv.y / 0.55, 0.0, 1.0), 2.0);
  float side = smoothstep(0.12, 0.38, abs(uv.x - 0.5)) * smoothstep(0.45, 0.62, uv.y) * smoothstep(0.98, 0.8, uv.y);
  float ph = uGT * 1.15 + uv.y * 6.0;
  p.x += uSway * (hem * (0.05 * sin(ph) + 0.02 * sin(ph * 2.3 + uv.x * 5.0)) + side * 0.025 * sin(ph * 1.3 + 1.1) * sign(uv.x - 0.5));
  // 竖轴公告板：立片中心线在视图空间里，横向只沿屏幕 x 展开
  vec4 c = modelViewMatrix * vec4(0.0, p.y, 0.0, 1.0);
  float sx = length(modelMatrix[0].xyz);
  c.x += p.x * sx;
  gl_Position = projectionMatrix * c;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex; uniform float uK; uniform float uA; uniform float uGlow; uniform float uGT; varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec4 t = texture2D(uTex, uv);
  if (uGlow > 0.5) {   // 光晕层：多点模糊取 alpha × 颜色
    vec4 s = vec4(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; s += texture2D(uTex, uv + vec2(cos(a), sin(a)) * 0.012, 2.0); }
    t = s / 8.0;
    t.rgb *= 0.85 + 0.15 * sin(uGT * 1.7 + uv.y * 9.0);
  }
  if (t.a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * uK, t.a * uA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 立片，脚底为原点，人物头顶到裙摆 = H（本地单位） */
export function makeIolaCard(H: number, T: { value: number }): THREE.Group {
  const g = new THREE.Group(); g.name = 'iolaCard';
  const ch = H / (FIG_TOP - FIG_BOT), cw = ch * ASPECT;
  const geo = new THREE.PlaneGeometry(cw, ch, 12, 32); geo.translate(0, ch / 2 - FIG_BOT * ch, 0);
  const mk = (glow: boolean) => new THREE.ShaderMaterial({
    uniforms: { uTex: { value: cardTex() }, uGT: T, uSway: { value: H }, uK: { value: glow ? 0.55 : 1.0 }, uA: { value: glow ? 0.45 : 1.0 }, uGlow: { value: glow ? 1 : 0 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: true });
  const body = new THREE.Mesh(geo, mk(false)); body.renderOrder = 3; body.frustumCulled = false;
  const glow = new THREE.Mesh(geo, mk(true)); glow.scale.set(1.06, 1.02, 1); glow.renderOrder = 2; glow.frustumCulled = false;
  g.add(glow, body);
  return g;
}
