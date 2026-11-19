// fix1106 KTX2 冒烟：无头 Chromium（SwiftShader）以 file:// 打开小页面，走与游戏相同的 src/web/ktx2.ts（内嵌转码器 → blob URL → worker）
// 解析 tools/ktx2/convert.mjs 缓存里的一个 GLB，确认贴图是 CompressedTexture（或设备不支持时退回 RGBA）、无报错
//   node test/ktx2_smoke.mjs [缓存 GLB 路径]    NOCOMP=1 → 模拟设备不支持压缩格式（应退回 RGBA，不报错）
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
const CACHE = process.env.KTX2_CACHE || '/workspace/work/ktx2cache';
const glbPath = process.argv[2] || join(CACHE, 'glb/models_hd', readdirSync(join(CACHE, 'glb/models_hd')).find(f => f.endsWith('.glb')));
const B = 'node_modules/three/examples/jsm/libs/basis/';
const gen = `export const BASIS_JS: string = ${JSON.stringify(readFileSync(B + 'basis_transcoder.js', 'utf8'))};\nexport const BASIS_WASM: string = ${JSON.stringify(readFileSync(B + 'basis_transcoder.wasm').toString('base64'))};\n`;
const entry = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { withKtx2, setKtx2Renderer, ktx2Info, ktx2Loader } from './src/web/ktx2';
(async () => { try {
  const r = new THREE.WebGLRenderer(); setKtx2Renderer(r);
  if ((window as any).__NOCOMP) ktx2Loader()!.detectSupport({ extensions: { has: () => false, get: () => null } } as any);   // 模拟不支持任何压缩格式的设备
  await MeshoptDecoder.ready; const L = withKtx2(new GLTFLoader()); L.setMeshoptDecoder(MeshoptDecoder);
  const b64 = (window as any).__GLB; const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const g = await L.parseAsync(u.buffer, '');
  const tex: any[] = []; g.scene.traverse((o: any) => { const m = o.material; if (!m) return; for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k] && !tex.includes(m[k])) tex.push(m[k]); });
  const sc = new THREE.Scene(); sc.add(g.scene); const cam = new THREE.PerspectiveCamera(); r.render(sc, cam);
  (window as any).__R = { ok: true, info: ktx2Info(), gl: r.getContext().getError(), tex: tex.map(t => ({ c: t.isCompressedTexture === true, f: t.format, w: t.image?.width, h: t.image?.height, mips: t.mipmaps?.length, cs: t.colorSpace })) };
} catch (e) { (window as any).__R = { ok: false, err: String((e as any)?.stack || e) }; } })();`;
const r = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', plugins: [{ name: 'gen', setup(b) { b.onLoad({ filter: /basis\.gen\.ts$/ }, () => ({ contents: gen, loader: 'ts' })); } }] });
mkdirSync('/tmp/ktx2smoke', { recursive: true });
writeFileSync('/tmp/ktx2smoke/index.html', `<html><body><script>window.__NOCOMP=${process.env.NOCOMP === '1'};window.__GLB=${JSON.stringify(readFileSync(glbPath).toString('base64'))};</script><script>${r.outputFiles[0].text.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await br.newPage(); const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); }); page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('file:///tmp/ktx2smoke/index.html');
await page.waitForFunction(() => (window).__R, null, { timeout: 90000 }).catch(() => {});
const res = await page.evaluate(() => (window).__R);
const ext = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); return g ? g.getSupportedExtensions().filter(e => /compress/i.test(e)) : null; });
console.log(glbPath); console.log(JSON.stringify(res)); console.log('压缩扩展', JSON.stringify(ext)); if (errs.length) console.log(errs.join('\n'));
await br.close(); process.exit(res?.ok ? 0 : 1);
