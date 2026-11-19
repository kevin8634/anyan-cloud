// v0.9.4 怪物外观样板：流沙巨蠕 · 萨卡尔（纯代码程序化模型，对照概念图 worm_ref.png）
// 结构：一条样条脊柱（抬起的颈部 C 形 + 贴地 S 形身躯 + 钻进沙里的尾巴），每帧沿脊柱摆放 N 节甲壳；
// 头部独立（Rig.body = 头部枢轴，通用的攻击前扑 / 受击后仰仍然生效）。几何体同一条蠕虫内共享，材质共享。
import * as THREE from 'three';
import { toon, glow, blobShadowTexture } from './gfx';
import type { Rig } from './models';
import { creatureReady, makeGlbCreature } from './creatures_glb';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Z = V(0, 0, 1);

function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = false; return o;
}
const noOL = (m: THREE.Material) => { m.userData.outlineParameters = { visible: false }; return m; };

const C = { plate: 0x9c6a3c, plateD: 0x74492a, belly: 0xd2c2a0, crystal: 0xffa02a, maw: 0xff4a10, tooth: 0xf4ead0, eye: 0xffc040, sand: 0xc8a064 };

export interface WormOpts { segs: number; crown: boolean; burrow: boolean; scale: number }

export function makeSandWorm(o: WormOpts = { segs: 16, crown: true, burrow: true, scale: 1 }): Rig {
  const root = new THREE.Group();
  const mPlate = toon(C.plate), mPlateD = toon(C.plateD), mBelly = toon(C.belly), mTooth = toon(C.tooth);
  const mCrys = glow(C.crystal, 1.5), mCrysToon = toon(0xe88a2a, { emissive: 0x6a2a00 });
  const mMaw = glow(C.maw, 2.2), mEye = glow(C.eye, 3);
  [mCrys, mMaw, mEye].forEach(noOL);

  // ---- 一节身体（局部 z = 脊柱前进方向，y = 背）
  const R0 = 0.34;
  const gCore = new THREE.SphereGeometry(R0, 10, 8); gCore.scale(1, 0.9, 0.95);
  const gPlate = new THREE.DodecahedronGeometry(0.16, 0); gPlate.scale(1.25, 0.45, 1.1);
  const gSpike = new THREE.ConeGeometry(0.055, 0.26, 4); gSpike.translate(0, 0.13, 0);
  const gSpikeS = new THREE.ConeGeometry(0.035, 0.14, 4); gSpikeS.translate(0, 0.07, 0);
  const segs: THREE.Group[] = [];
  for (let i = 0; i < o.segs; i++) {
    const g = new THREE.Group();
    g.add(mesh(gCore, mBelly));
    // 背甲：沿上半圆排 5 片，交错深浅
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.62, p = mesh(gPlate, (k + i) % 2 ? mPlateD : mPlate);
      p.position.set(Math.sin(a) * R0 * 0.92, Math.cos(a) * R0 * 0.82, (k % 2) * 0.04);
      p.rotation.z = -a; p.rotation.x = -0.25;
      g.add(p);
    }
    // 晶刺：背中线一根（隔节大小交替），两侧小刺
    const big = mesh(gSpike, mCrys, false); big.position.set(0, R0 * 0.95, -0.02); big.rotation.x = -0.45; big.scale.setScalar(i % 2 ? 0.7 : 1.1); g.add(big);
    for (const s of [-1, 1]) { const sp = mesh(gSpikeS, mCrysToon, false); sp.position.set(s * R0 * 0.8, R0 * 0.55, 0); sp.rotation.z = -s * 1.0; sp.rotation.x = -0.4; g.add(sp); }
    root.add(g); segs.push(g);
  }

  // ---- 头部：body = 枢轴（通用攻击/受击改它的 rotation.x），inner 负责低头角度
  const head = new THREE.Group(); root.add(head);
  const inner = new THREE.Group(); inner.rotation.x = 0.08; inner.scale.setScalar(o.crown ? 1.35 : 1.15); head.add(inner);
  const skull = mesh(new THREE.DodecahedronGeometry(0.4, 1), mPlate); skull.scale.set(0.95, 0.66, 1.05); skull.position.set(0, 0.1, 0.08); inner.add(skull);
  const brow = mesh(new THREE.BoxGeometry(0.62, 0.12, 0.3), mPlateD); brow.position.set(0, 0.24, 0.3); brow.rotation.x = 0.35; inner.add(brow);
  const snout = mesh(new THREE.CylinderGeometry(0.15, 0.3, 0.55, 6), mPlate); snout.rotation.x = Math.PI / 2; snout.scale.set(1.1, 1, 0.5); snout.position.set(0, 0.08, 0.5); inner.add(snout);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 0.18); jaw.rotation.x = 0.55; inner.add(jaw);
  const lower = mesh(new THREE.CylinderGeometry(0.11, 0.25, 0.55, 6), mPlateD); lower.rotation.x = Math.PI / 2; lower.scale.set(1, 1, 0.4); lower.position.set(0, -0.04, 0.32); jaw.add(lower);
  const chin = mesh(new THREE.SphereGeometry(0.2, 8, 6), mBelly); chin.scale.set(1, 0.5, 1.4); chin.position.set(0, -0.09, 0.15); jaw.add(chin);
  const maw = mesh(new THREE.SphereGeometry(0.2, 10, 8), mMaw, false); maw.scale.set(1, 0.85, 1.1); maw.position.set(0, -0.1, 0.3); inner.add(maw);
  const gT = new THREE.ConeGeometry(0.03, 0.13, 4);
  for (let k = 0; k < 7; k++) {   // 上颚牙：沿口缘一圈朝下
    const a = (k / 6 - 0.5) * 2.2, t = mesh(gT, mTooth, false);
    t.position.set(Math.sin(a) * 0.2, -0.06, 0.32 + Math.cos(a) * 0.26); t.rotation.x = Math.PI; inner.add(t);
  }
  for (let k = 0; k < 6; k++) {   // 下颚牙朝上
    const a = (k / 5 - 0.5) * 2, t = mesh(gT, mTooth, false);
    t.position.set(Math.sin(a) * 0.17, 0.03, 0.16 + Math.cos(a) * 0.3); jaw.add(t);
  }
  for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.045, 6, 4), mEye, false); e.position.set(s * 0.2, 0.2, 0.42); e.scale.set(1.4, 0.7, 1); inner.add(e); }
  if (o.crown) {   // 头冠晶簇：向后扇开
    const gC = new THREE.ConeGeometry(0.085, 0.5, 4); gC.translate(0, 0.25, 0);
    [[0, 0.62, 1.15], [-0.22, 0.45, 0.95], [0.22, 0.45, 0.95], [-0.38, 0.3, 0.7], [0.38, 0.3, 0.7], [-0.12, 0.25, 0.6], [0.12, 0.25, 0.6]].forEach(([x, rx, s]) => {
      const c = mesh(gC, mCrys, false); c.position.set(x, 0.28, 0.02); c.rotation.set(-rx - 0.4, 0, -x * 1.3); c.scale.setScalar(s); inner.add(c);
    });
  }
  // 颈后鳞襟
  for (let k = -2; k <= 2; k++) { const p = mesh(gPlate, mPlateD); p.position.set(k * 0.15, 0.05 + Math.cos(k * 0.6) * 0.18, -0.25); p.rotation.set(-0.9, 0, -k * 0.4); p.scale.setScalar(1.3); inner.add(p); }

  // ---- 尾巴钻进的沙丘 + 拉长的接触阴影
  if (o.burrow) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.sand));
    mound.scale.set(1, 0.32, 1); mound.receiveShadow = true; mound.name = 'mound'; root.add(mound);
  }

  // ---- 脊柱：s=0 头根 → s=1 尾尖
  const H = 0.3;   // 颈部占比
  const A = V(0, 1.55, 0.25), B = V(0, 1.0, 0.62), Cc = V(0, 0.28, 0.42), D = V(0, 0.3, -0.45);
  const L = 2.9;   // 贴地段长度
  const rad = (s: number) => s < H ? 0.31 + 0.03 * (s / H) : R0 * (1 - 0.72 * Math.pow((s - H) / (1 - H), 1.25));
  const pts: THREE.Vector3[] = Array.from({ length: o.segs + 2 }, () => V());
  let t = 0, amp = 0, ph = 0;
  const spine = (s: number, out: THREE.Vector3) => {
    if (s <= H) {
      bezier(A, B, Cc, D, s / H, out);
      out.x += Math.sin(t * 1.3) * 0.1 * (1 - s / H);
      out.y += Math.sin(t * 2.1) * 0.04 * (1 - s / H);
    } else {
      const u = (s - H) / (1 - H);
      out.set(0, rad(s) * 0.85, D.z - u * L);
      out.x = (0.12 + 0.34 * u) * Math.sin(u * 6.2 - ph);
      if (o.burrow && u > 0.82) out.y -= (u - 0.82) / 0.18 * 0.45;   // 尾巴钻进沙里
    }
    return out;
  };
  const tmp = V(), q = new THREE.Quaternion();
  const pose = () => {
    for (let i = 0; i < pts.length; i++) spine(i / (pts.length - 1), pts[i]);
    for (let i = 0; i < o.segs; i++) {
      const s = (i + 1) / (o.segs + 1), g = segs[i];
      g.position.copy(pts[i + 1]);
      tmp.subVectors(pts[i], pts[i + 2]).normalize();   // 朝向头部
      q.setFromUnitVectors(Z, tmp); g.quaternion.copy(q);
      const k = rad(s) / R0; g.scale.set(k, k, k * 1.05);
    }
    head.position.copy(pts[0]); head.position.y += 0.12;
    head.rotation.y = Math.sin(t * 1.3) * 0.12;
    jaw.rotation.x = 0.5 + Math.sin(t * 2.4) * 0.08;
    const mound = root.getObjectByName('mound'); if (mound) mound.position.set(pts[pts.length - 1].x * 0.6, 0, D.z - L * 0.97);
  };
  pose();

  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), noOL(new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.55, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.025, -1.1); blob.scale.set(1.5, 4.2, 1); blob.name = 'blob'; root.add(blob);

  root.scale.setScalar(o.scale);
  const flash = [...new Set([mPlate, mPlateD, mBelly, mTooth, mCrysToon])];
  return {
    root, body: head, legs: [], scale: o.scale, flash,
    tick: (dt: number, moving: boolean) => { amp += ((moving ? 5.5 : 1.4) - amp) * Math.min(1, dt * 3); t += dt; ph += amp * dt; pose(); },
  };
}

// v0.9.4b：优先用 TRELLIS.2 生成的模型（assets/creatures/sakar.glb），没加载成功时退回程序化模型
export const makeSakar = () => {
  const proc = () => makeSandWorm({ segs: 16, crown: true, burrow: true, scale: 1 });
  if (!creatureReady('sakar')) return proc();
  const ref = proc(); const box = new THREE.Box3().setFromObject(ref.root);
  return makeGlbCreature('sakar', { length: box.max.z - box.min.z, wave: 0.22, yaw: 0.4 }) ?? ref;
};
export const makeSandWormling = () => makeSandWorm({ segs: 9, crown: false, burrow: false, scale: 0.42 });

// v0.9.4c：灰烬之龙 · 炽翼（TRELLIS.2 生成，概念图 chiyi_ref2.png）；没加载成功时退回旧的染色石像
export const makeChiyi = (fallback: () => Rig): Rig => {
  if (!creatureReady('chiyi')) return fallback();
  return makeGlbCreature('chiyi', { height: 3.1, wave: 0.03, yaw: 0, bob: 0.025, selfGlow: 1.4 }) ?? fallback();
};
