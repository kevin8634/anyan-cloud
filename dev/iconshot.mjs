// 11-14d 暗金图标贴近模型：把武器 GLB 按「最长轴放到左下→右上对角线」正交渲染成透明底大图，再由 iconcomp.py 合成到图标底板
// 用法：node dev/iconshot.mjs a.glb b.glb --outdir /workspace/work/shots_icon [--size 384] [--flip "0|1"]
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'fs';
import { basename, resolve, join } from 'path';

const args = process.argv.slice(2);
const files = [], o = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i]; else files.push(args[i]);
const S = Number(o.size) || 384, flips = (o.flip || '').split('|');
mkdirSync(o.outdir, { recursive: true });

const js = (await build({ bundle: true, write: false, format: 'iife', target: 'es2019', stdin: { resolveDir: resolve('.'), loader: 'js', contents: `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
window.shot = async (b64, S, flip) => {
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(S, S); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  document.body.appendChild(r.domElement);
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const g = await new Promise((ok, no) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buf, '', ok, no));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302820, 1.5));
  const k = new THREE.DirectionalLight(0xfff2dd, 2.6); k.position.set(-2, 3, 4); scene.add(k);
  const rim = new THREE.DirectionalLight(0x9fe8ff, 1.6); rim.position.set(3, -1, -3); scene.add(rim);
  const root = new THREE.Group(); root.add(g.scene); scene.add(root);
  let box = new THREE.Box3().setFromObject(root); const sz = box.getSize(new THREE.Vector3());
  const ax = ['x', 'y', 'z'].sort((a, b) => sz[b] - sz[a]);   // 长 / 中 / 短
  // 视线沿最短轴；把「最长轴」转到屏幕 x，「中轴」转到屏幕 y
  const v = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const m = new THREE.Matrix4().makeBasis(v[ax[0]], v[ax[1]], v[ax[2]]).invert();
  g.scene.applyMatrix4(m);
  root.rotation.z = Math.PI / 4 * (flip ? -1 : 1); if (flip) root.rotation.y = Math.PI;
  root.rotation.x = 0.18;   // 一点点立体
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); const c = box.getCenter(new THREE.Vector3()), s2 = box.getSize(new THREE.Vector3());
  const half = Math.max(s2.x, s2.y) * 0.54;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 1000);
  cam.position.set(c.x, c.y, c.z + Math.max(s2.z, half) * 4); cam.lookAt(c);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
};` } })).outputFiles[0].text;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: S, height: S } });
p.on('pageerror', e => console.error('pageerror', e.message));
await p.setContent('<html><body style="margin:0;background:transparent"></body></html>');
await p.addScriptTag({ content: js });
for (let i = 0; i < files.length; i++) {
  const url = await p.evaluate(([b64, S, f]) => window.shot(b64, S, f), [readFileSync(files[i]).toString('base64'), S, flips[i] === '1']);
  const out = join(o.outdir, basename(files[i]).replace(/\.glb$/, '.png'));
  const { writeFileSync } = await import('fs'); writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out);
}
await b.close();
