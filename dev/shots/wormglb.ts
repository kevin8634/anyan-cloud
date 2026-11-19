import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toon } from '../../src/web/gfx';
import { refineRig } from '../../src/web/gfx';
const W = 900, H = 560;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); r.shadowMap.enabled = true; r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const sc = new THREE.Scene(); sc.background = new THREE.Color(0xcdb894);
sc.add(new THREE.HemisphereLight(0xfff4e0, 0x806040, 1.4));
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2); sun.position.set(6, 12, 8); sun.castShadow = true; sun.shadow.camera.left = sun.shadow.camera.bottom = -10; sun.shadow.camera.right = sun.shadow.camera.top = 10; sc.add(sun);
const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0xd8b880 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; sc.add(g);
const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 200);
(window as any).load = async (b64: string) => {
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const gl = await new GLTFLoader().parseAsync(buf, '');
  const m = gl.scene; const box = new THREE.Box3().setFromObject(m); const s = 7 / (box.max.z - box.min.z);
  m.scale.setScalar(s); box.setFromObject(m); m.position.y -= box.min.y; m.position.z -= (box.max.z + box.min.z) / 2;
  m.traverse((o: any) => { if (o.isMesh) { const map = o.material.map; o.material = toon(0xffffff, { map }); o.castShadow = true; } });
  refineRig(m); sc.add(m); (window as any).ready = 1;
};
(window as any).shot = (k: number) => {
  const views = [[10, 9, 14], [-11, 4, 7], [-6, 8, 15]];
  const v = views[k]; cam.position.set(v[0], v[1], v[2]); cam.lookAt(0, 2, 0);
  r.render(sc, cam); return r.domElement.toDataURL('image/png');
};
