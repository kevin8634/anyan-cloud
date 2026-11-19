// fix1106 KTX2（Basis Universal）GPU 压缩贴图：比赛版模型贴图在构建时转成 KTX2（tools/ktx2/convert.mjs，GLB 用 KHR_texture_basisu），
// 运行时由 KTX2Loader 转码成设备支持的压缩格式（BC7 / ASTC / ETC2 …；都不支持时 KTX2Loader 自动退回 RGBA，不报错）。
// 离线单页：转码器 basis_transcoder.js / .wasm 以 base64 内嵌（basis.gen.ts，build 生成），用 blob URL 喂给 KTX2Loader，不走网络。
// 商用 base 包：basis.gen.ts 为空 → 不创建 KTX2Loader（base 包 GLB 里没有 KTX2 贴图）。
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BASIS_JS, BASIS_WASM } from './basis.gen';

let renderer: THREE.WebGLRenderer | null = null;
let loader: KTX2Loader | null = null;
let supported = false;

/** 主渲染器建好后登记（KTX2Loader.detectSupport 要用它查压缩格式扩展） */
export function setKtx2Renderer(r: THREE.WebGLRenderer) {
  renderer = r;
  if (loader) loader.detectSupport(r);
}

/** 主渲染器还没建（模块初始化期就解析的 GLB）：临时开一个 WebGL 上下文查扩展，查完释放 */
function probeRenderer(): Parameters<KTX2Loader['detectSupport']>[0] {
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') ?? c.getContext('webgl'); } catch { gl = null; }
  const ext = new Map<string, unknown>();
  const names = ['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc1', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_pvrtc', 'WEBKIT_WEBGL_compressed_texture_pvrtc'];
  if (gl) { for (const n of names) { const e = gl.getExtension(n); if (e) ext.set(n, e); } (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext(); }
  return { extensions: { has: (n: string) => ext.has(n), get: (n: string) => ext.get(n) ?? null } } as unknown as Parameters<KTX2Loader['detectSupport']>[0];
}

function b64ToBytes(b64: string) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

/** 全局唯一的 KTX2Loader（多个实例会各开一套转码 worker）；本构建没带转码器 → null */
export function ktx2Loader(): KTX2Loader | null {
  if (loader) return loader;
  if (!BASIS_WASM || !BASIS_JS || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document === 'undefined') return null;
  try {
    const jsUrl = URL.createObjectURL(new Blob([BASIS_JS], { type: 'text/javascript' }));
    const wasmUrl = URL.createObjectURL(new Blob([b64ToBytes(BASIS_WASM)], { type: 'application/wasm' }));
    const mgr = new THREE.LoadingManager();
    mgr.setURLModifier(u => u.endsWith('basis_transcoder.js') ? jsUrl : u.endsWith('basis_transcoder.wasm') ? wasmUrl : u);
    const L = new KTX2Loader(mgr); L.setTranscoderPath('');
    L.detectSupport((renderer ?? probeRenderer()) as THREE.WebGLRenderer);
    loader = L; supported = true;
  } catch (e) { console.warn('KTX2 转码器初始化失败（KTX2 贴图将无法显示）', e); loader = null; }
  return loader;
}

/** 给 GLTFLoader 挂上 KTX2Loader（所有 new GLTFLoader 都要过这里） */
export function withKtx2<T extends GLTFLoader>(g: T): T {
  const k = ktx2Loader(); if (k) g.setKTX2Loader(k);
  return g;
}

/** 调试：本构建是否带 KTX2 转码器 */
export const ktx2Info = () => ({ embedded: !!BASIS_WASM, ready: supported, renderer: !!renderer });
