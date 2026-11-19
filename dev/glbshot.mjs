// v1.2.22 GLB 对照截图（黑客松报告素材）：每个模型一行，正面 / 3/4 侧 / 背面三个角度，下面标文件名、面数、大小
// --hero：单张 3/4 侧透明底大图（海报用）
// 用法：node dev/glbshot.mjs <a.glb> [b.glb ...] --out docs/黑客松素材/对照/xxx.png [--size 320] [--labels "标签1|标签2"]
//   替换前后对照：node dev/glbshot.mjs assets/creatures/chiyi.glb assets_aholo/creatures/chiyi.glb --out ...
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync, statSync, mkdirSync } from 'fs';
import { dirname, basename, resolve } from 'path';

const args = process.argv.slice(2);
const files = [], o = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i]; else files.push(args[i]);
if (!files.length || !o.out) { console.error('用法：node dev/glbshot.mjs <a.glb> [b.glb] --out x.png'); process.exit(1); }
const S = Number(o.size) || 320;

const js = (await build({ bundle: true, write: false, format: 'iife', target: 'es2019', stdin: { resolveDir: resolve('.'), loader: 'js', contents: `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
window.shot = async (b64s, S, hero) => {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: !!hero });
  r.setSize(S * (hero ? 1 : 3), S * b64s.length); r.setScissorTest(true); r.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(r.domElement);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const info = [];
  for (let row = 0; row < b64s.length; row++) {
    const buf = Uint8Array.from(atob(b64s[row]), c => c.charCodeAt(0)).buffer;
    const g = await new Promise((ok, no) => loader.parse(buf, '', ok, no));
    const scene = new THREE.Scene(); if (!hero) scene.background = new THREE.Color(0x2b2f36);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 5, 4); scene.add(d);
    scene.add(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const R = Math.max(sz.x, sz.y, sz.z) * 1.15;
    let tris = 0; g.scene.traverse(m => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    info.push({ tris: Math.round(tris), h: sz.y });
    const cam = new THREE.PerspectiveCamera(35, 1, R / 100, R * 10);
    (hero ? [Math.PI / 7] : [0, Math.PI / 4, Math.PI]).forEach((a, col) => {
      cam.position.set(c.x + Math.sin(a) * R * 1.75, c.y + R * 0.25, c.z + Math.cos(a) * R * 1.75); cam.lookAt(c);
      const y = (b64s.length - 1 - row) * S;
      r.setViewport(col * S, y, S, S); r.setScissor(col * S, y, S, S); r.render(scene, cam);
    });
  }
  return info;
};` } })).outputFiles[0].text;

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const HERO = !!o.hero; const p = await b.newPage({ viewport: { width: S * (HERO ? 1 : 3), height: S * files.length + 28 * files.length } });
p.on('pageerror', e => console.error('pageerror', e.message));
await p.setContent(`<html><body style="margin:0;background:${HERO ? 'transparent' : '#1d2026'};font:14px sans-serif;color:#eee"><div id="lab"></div></body></html>`);
await p.addScriptTag({ content: js });
const info = await p.evaluate(([b64s, S, H]) => window.shot(b64s, S, H), [files.map(f => readFileSync(f).toString('base64')), S, HERO]);
if (HERO) { mkdirSync(dirname(o.out), { recursive: true }); await p.locator('canvas').screenshot({ path: o.out, omitBackground: true }); await b.close(); console.log(o.out, 'hero'); process.exit(0); }
await p.evaluate(([labels, S]) => {
  const c = document.querySelector('canvas'); c.style.display = 'block';
  const wrap = document.createElement('div'); wrap.style.position = 'relative'; c.replaceWith(wrap); wrap.appendChild(c);
  labels.forEach((t, i) => { const d = document.createElement('div'); d.textContent = t; Object.assign(d.style, { position: 'absolute', left: '8px', top: (i * S + 6) + 'px', background: 'rgba(0,0,0,.55)', padding: '3px 8px', borderRadius: '4px' }); wrap.appendChild(d); });
}, [files.map((f, i) => `${o.labels ? o.labels.split('|')[i] : f}  ·  ${info[i].tris} 面  ·  ${(statSync(f).size / 1024).toFixed(0)} KB`), S]);
mkdirSync(dirname(o.out), { recursive: true });
await p.screenshot({ path: o.out, clip: { x: 0, y: 0, width: S * 3, height: S * files.length } });
await b.close();
console.log(o.out, info.map((x, i) => `${basename(files[i])} ${x.tris} 面`).join(' | '));
