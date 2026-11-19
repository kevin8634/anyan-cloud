// 11-07 着色器编译自检（无需开游戏）：把要测的 GLSL 写到 tmp_glslt/（vs.glsl / fs_high.glsl / fs_low.glsl），额外的用 EXTRA='[{name,vs,fs}]' 传；swiftshader 编译，打印 OK 或报错。需 LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.route('http://t/**', r => { const u = r.request().url();
  if (u.endsWith('three.js')) return r.fulfill({ body: fs.readFileSync('node_modules/three/build/three.module.js'), contentType: 'text/javascript' });
  if (u.endsWith('three.core.js')) return r.fulfill({ body: fs.readFileSync('node_modules/three/build/three.core.js'), contentType: 'text/javascript' });
  return r.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }); });
await p.goto('http://t/index.html');
const shaders = { vs: fs.readFileSync('tmp_glslt/vs.glsl', 'utf8'), high: fs.readFileSync('tmp_glslt/fs_high.glsl', 'utf8'), low: fs.readFileSync('tmp_glslt/fs_low.glsl', 'utf8') };
const extra = JSON.parse(process.env.EXTRA || '[]');
const res = await p.evaluate(async ({ shaders, extra }) => {
  const THREE = await import('http://t/three.js');
  const r = new THREE.WebGLRenderer(); r.debug.checkShaderErrors = true; const errs = []; const oe = console.error; console.error = (...a) => { errs.push(a.join(' ').slice(0, 1500)); };
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const out = {};
  const test = (name, vs, fs, uniforms) => { errs.length = 0; const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms || {}]), fog: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); sc.add(mesh); r.render(sc, cam); sc.remove(mesh); out[name] = errs.length ? errs.slice() : 'OK'; };
  test('sea_high', shaders.vs, shaders.high); test('sea_low', shaders.vs, shaders.low);
  for (const e of extra) test(e.name, e.vs, e.fs);
  return out;
}, { shaders, extra });
console.log(JSON.stringify(res, null, 1));
await b.close();
