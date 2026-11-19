// v1.2.23 程序化旧模型截图（游戏内同款 toon + 描边），三个角度一行，和 dev/glbshot.mjs 同尺寸，方便上下拼新旧对照
// 用法：node dev/procshot.mjs <模块路径> <导出函数名> --out x.png [--label 文字] [--size 320]
//   例：node dev/procshot.mjs src/dlc/dlc1/models.ts makeBellCrab --out /tmp/old_crab.png --label "旧：程序化钟壳蟹"
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
const a = process.argv.slice(2), pos = [], o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i]; else pos.push(a[i]);
const [mod, fn] = pos; const S = Number(o.size) || 320;
const js = (await build({ bundle: true, write: false, format: 'iife', target: 'es2019', loader: { '.ts': 'ts' }, stdin: { resolveDir: resolve('.'), loader: 'ts', contents: `
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { ${fn} } from './${mod}';
(window as any).shot = (S: number) => {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(S * 3, S); r.setScissorTest(true); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
  const fx = new OutlineEffect(r, { defaultThickness: 0.004 });
  const rig: any = (${fn} as any)(); const g = rig.root || rig;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b2f36);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 5, 4); scene.add(d); scene.add(g);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const R = Math.max(sz.x, sz.y, sz.z) * 1.15; let tris = 0;
  g.traverse((m: any) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  const cam = new THREE.PerspectiveCamera(35, 1, R / 100, R * 10);
  [0, Math.PI / 4, Math.PI].forEach((ang, col) => { cam.position.set(c.x + Math.sin(ang) * R * 1.75, c.y + R * 0.25, c.z + Math.cos(ang) * R * 1.75); cam.lookAt(c);
    r.setViewport(col * S, 0, S, S); r.setScissor(col * S, 0, S, S); fx.render(scene, cam); });
  return Math.round(tris);
};` } })).outputFiles[0].text;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: S * 3, height: S } });
p.on('pageerror', e => console.error('pageerror', e.message));
await p.setContent('<html><body style="margin:0;background:#1d2026;font:14px sans-serif;color:#eee"></body></html>');
await p.addScriptTag({ content: js });
const tris = await p.evaluate(S => window.shot(S), S);
await p.evaluate(t => { const d = document.createElement('div'); d.textContent = t; Object.assign(d.style, { position: 'absolute', left: '8px', top: '6px', background: 'rgba(0,0,0,.55)', padding: '3px 8px', borderRadius: '4px' }); document.body.appendChild(d); }, `${o.label || fn}  ·  ${tris} 面`);
mkdirSync(dirname(o.out), { recursive: true });
await p.screenshot({ path: o.out, clip: { x: 0, y: 0, width: S * 3, height: S } });
await b.close(); console.log(o.out, tris + ' 面');
