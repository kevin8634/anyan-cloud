// 11-19 四足 / 多足 / 蟾蜍程序化绑骨离线样片（procrig.ts Q4 / Q蟾 / Q多足）：GLB 去贴图 → 同游戏的归一化 → makeProcSkinned + ProcAnim → 按动作逐帧渲染拼图
// 用法：node dev/quadrig_shot.mjs --out x.png --spec 'wd_wolf:Q4:1.5708,wd_spider:Q多足:0' [--acts walk,attack,death] [--size 200] [--static 1]
//   --static 1：不绑骨，只出侧 / 顶 / 前三视图（看模型朝向）
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from 'path';
const a = process.argv.slice(2), o = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[++i];
const S = Number(o.size) || 200, STATIC = !!o.static || !!o.weights, WEI = !!o.weights;
const spec = o.spec.split(',').map(s => { const [m, tpl, yaw] = s.split(':'); return { m, tpl, yaw: Number(yaw) || 0 }; });
const acts = (o.acts || 'walk,attack,death').split(',');
const NF = Number(o.nf) || 5;
/** 去掉贴图（KTX2 无转码器），只留几何 */
function strip(file) {
  const b = readFileSync(file); const jl = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + jl).toString());
  delete j.textures; delete j.images; delete j.samplers;
  for (const m of j.materials ?? []) { if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; }
  if (j.extensionsUsed) j.extensionsUsed = j.extensionsUsed.filter(x => x !== 'KHR_texture_basisu'); if (j.extensionsRequired) j.extensionsRequired = j.extensionsRequired.filter(x => x !== 'KHR_texture_basisu');
  let js = Buffer.from(JSON.stringify(j)); const pad = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const rest = b.slice(20 + jl); const hdr = Buffer.alloc(20); hdr.write('glTF', 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(20 + js.length + rest.length, 8); hdr.writeUInt32LE(js.length, 12); hdr.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([hdr, js, rest]).toString('base64');
}
const js = (await build({ bundle: true, write: false, format: 'iife', target: 'es2019', loader: { '.ts': 'ts' }, stdin: { resolveDir: resolve('.'), loader: 'ts', contents: `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { makeProcSkinned, ProcAnim } from './src/web/procrig';
function floatify(geo: THREE.BufferGeometry) { for (const nm of ['position', 'normal']) { const a = geo.getAttribute(nm) as THREE.BufferAttribute; if (!a || a.array instanceof Float32Array) continue;
  const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j); geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize)); } return geo; }
(window as any).run = async (items: any[], acts: string[], S: number, NF: number, STATIC: boolean, WEI: boolean, POSE: string) => {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cols = STATIC ? 3 : acts.length * NF;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(S * cols, S * items.length); r.setScissorTest(true); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
  const info: any[] = [];
  for (let row = 0; row < items.length; row++) {
    const it = items[row];
    const buf = Uint8Array.from(atob(it.b64), c => c.charCodeAt(0)).buffer;
    const g: any = await new Promise((ok, no) => loader.parse(buf, '', ok, no));
    let mesh: any = null; g.scene.traverse((x: any) => { if (!mesh && x.isMesh) mesh = x; }); mesh.updateWorldMatrix(true, false);
    const geo = floatify(mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox(); let b = geo.boundingBox!; geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2); geo.computeBoundingBox(); b = geo.boundingBox!;
    const h = b.max.y - b.min.y, k = 1.5 / h;
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8a890, roughness: 0.7, metalness: 0.05 });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b2f36);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 5, 4); scene.add(d);
    const grid = new THREE.GridHelper(20, 40, 0x556070, 0x3a4250); scene.add(grid);
    const root = new THREE.Group(); scene.add(root);
    let anim: any = null, rigInfo: any = null;
    if (WEI) { const rg = makeProcSkinned(it.m, geo, it.tpl, it.yaw, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), k); const g3 = rg.mesh.geometry; const si = g3.attributes.skinIndex; const col = new Float32Array(si.count * 3); const cc = new THREE.Color();
      for (let i = 0; i < si.count; i++) { const bi = si.getX(i); cc.setHSL(((bi * 0.618) % 1), 0.75, 0.55); col[i*3] = cc.r; col[i*3+1] = cc.g; col[i*3+2] = cc.b; } g3.setAttribute('color', new THREE.BufferAttribute(col, 3)); root.add(rg.mesh);
      if (POSE) { const an = new ProcAnim(rg, root); for (let i = 0; i < 30; i++) an.update(1/30); an.play('windup'); for (let i = 0; i < 27; i++) an.update(1/60); an.play(POSE); for (let i = 0; i < 6; i++) an.update(1/60); rg.mesh.updateMatrixWorld(true); }
      const sh = new THREE.SkeletonHelper(rg.mesh); (sh.material as any).depthTest = false; (sh.material as any).linewidth = 2; scene.add(sh); rigInfo = rg.info; }
    else if (STATIC) { const m = new THREE.Mesh(geo, mat); m.scale.setScalar(k); m.rotation.y = it.yaw; root.add(m); }
    else { const rg = makeProcSkinned(it.m, geo, it.tpl, it.yaw, mat, k); root.add(rg.mesh); anim = new ProcAnim(rg, root); rigInfo = rg.info; }
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const R = Math.max(sz.x, sz.y, sz.z) * 1.25;
    const cam = new THREE.PerspectiveCamera(35, 1, R / 100, R * 20);
    const view = (col: number, ang: number, el: number, cx: number, cz: number) => {
      const cc = new THREE.Vector3(cx, c.y, cz);
      cam.position.set(cx + Math.sin(ang) * Math.cos(el) * R * 1.9, c.y + Math.sin(el) * R * 1.9, cz + Math.cos(ang) * Math.cos(el) * R * 1.9); cam.lookAt(cc);
      const y = (items.length - 1 - row) * S; r.setViewport(col * S, y, S, S); r.setScissor(col * S, y, S, S); r.render(scene, cam); };
    if (STATIC) { view(0, Math.PI / 2, 0.05, c.x, c.z); view(1, 0.001, 1.5, c.x, c.z); view(2, 0, 0.1, c.x, c.z); if (WEI) { info.push(rigInfo); continue; } const g2 = geo.clone(); g2.rotateY(it.yaw); const P = g2.attributes.position.array as Float32Array; const n = P.length / 3;
      let mx = 0, mz = 0; for (let i = 0; i < n; i++) { mx += P[i*3]; mz += P[i*3+2]; } mx /= n; mz /= n;
      let sxx = 0, szz = 0, sxz = 0; for (let i = 0; i < n; i++) { const x = P[i*3]-mx, z = P[i*3+2]-mz; sxx += x*x; szz += z*z; sxz += x*z; }
      const ang = 0.5 * Math.atan2(2 * sxz, szz - sxx);   // 主轴相对 +Z 的角（atan2(x,z)）
      info.push({ h: +h.toFixed(3), w: +(b.max.x - b.min.x).toFixed(3), d: +(b.max.z - b.min.z).toFixed(3), pcaDeg: Math.round(ang * 180 / Math.PI), ratio: +(Math.max(sxx,szz)/Math.min(sxx,szz)).toFixed(2) }); continue; }
    // 动作：walk = 根节点沿 +Z 匀速 1.6 m/s，取一个步周期里的 NF 帧；attack = windup→attack1；death
    let col = 0;
    for (const act of acts) {
      anim.revive(); root.position.set(0, 0, 0); for (let i = 0; i < 30; i++) anim.update(1 / 30);
      const dt = 1 / 60;
      if (act === 'walk') {
        anim.loop('walk'); let z = 0; for (let i = 0; i < 60; i++) { z += 1.6 * dt; root.position.z = z; anim.update(dt); }
        for (let f = 0; f < NF; f++) { for (let i = 0; i < 8; i++) { z += 1.6 * dt; root.position.z = z; anim.update(dt); } root.updateMatrixWorld(true); view(col++, Math.PI / 2, 0.15, 0, z); }
      } else {
        const name = act === 'attack' ? 'attack1' : act;
        const total = act === 'death' ? 1.3 : act === 'hit' ? 0.25 : 1.0;
        if (act === 'attack' || act === 'heavy') anim.play('windup');
        let started = false, tt = 0;
        for (let f = 0; f < NF; f++) {
          const target = total * f / (NF - 1);
          while (tt < target) { if (!started && (act !== 'attack' && act !== 'heavy' || tt >= 0.45)) { anim.play(name); started = true; } anim.update(dt); tt += dt; }
          if (f === 0 && !started && act !== 'attack' && act !== 'heavy') { anim.play(name); started = true; anim.update(dt); }
          root.updateMatrixWorld(true); view(col++, Math.PI / 2.6, 0.2, 0, 0);
        }
      }
    }
    info.push(rigInfo);
  }
  return info;
};` } })).outputFiles[0].text;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const cols = STATIC ? 3 : acts.length * NF;
const p = await b.newPage({ viewport: { width: S * cols, height: S * spec.length } });
p.on('pageerror', e => console.error('pageerror', e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.text()); });
await p.setContent('<html><body style="margin:0;background:#1d2026;font:12px sans-serif;color:#eee"></body></html>');
await p.addScriptTag({ content: js });
const items = spec.map(s => ({ ...s, b64: strip(existsSync(`assets_aholo/creatures/${s.m}.glb`) ? `assets_aholo/creatures/${s.m}.glb` : `web/desktop/assets/creatures/${s.m}.glb`) }));
const info = await p.evaluate(([items, acts, S, NF, ST, WEI, POSE]) => window.run(items, acts, S, NF, ST, WEI, POSE), [items, acts, S, NF, STATIC, WEI, o.pose || '']);
await p.evaluate(([labels, S, acts, NF, ST]) => {
  const c = document.querySelector('canvas'); const w = document.createElement('div'); w.style.position = 'relative'; c.replaceWith(w); w.appendChild(c); c.style.display = 'block';
  labels.forEach((t, i) => { const d = document.createElement('div'); d.textContent = t; Object.assign(d.style, { position: 'absolute', left: '6px', top: (i * S + 4) + 'px', background: 'rgba(0,0,0,.6)', padding: '2px 6px' }); w.appendChild(d); });
  if (!ST) acts.forEach((t, j) => { const d = document.createElement('div'); d.textContent = t; Object.assign(d.style, { position: 'absolute', left: (j * NF * S + 6) + 'px', bottom: '4px', background: 'rgba(80,0,0,.7)', padding: '2px 6px' }); w.appendChild(d); });
}, [spec.map((s, i) => `${s.m} ${{'Q4':'Q4','Q蟾':'Qtoad','Q多足':'Qmulti'}[s.tpl] ?? s.tpl} ${info[i] ? JSON.stringify(info[i]).replace(/"tpl":"[^"]*",/, '') : ''}`), S, acts, NF, STATIC]);
mkdirSync(dirname(o.out), { recursive: true });
await p.screenshot({ path: o.out, clip: { x: 0, y: 0, width: S * cols, height: S * spec.length } });
await b.close(); console.log(o.out); console.log(JSON.stringify(info));
