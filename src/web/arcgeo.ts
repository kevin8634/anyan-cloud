// 11-19 电弧纯几何 / 色板，从 arcbolt.ts 拆出：只依赖 three。weaponfx（gear 启动早期就加载）引这里，
// 避免经 arcbolt → vfx 链在内容包注册前读取技能挂载点（C26「内容包 dlc1 注册太晚：挂载点 skills」卡 0%）。
import * as THREE from 'three';

/** 电弧色板：[外层, 分支, 芯]。雷（自然）= 蓝紫 / 电青 —— 绝不用 #7dff5a 绿 */
export const ARC_PAL: Record<string, [number, number, number]> = {
  nature: [0x7b6cff, 0x6fd3ff, 0xf4f1ff],
  arcane: [0x8e5bff, 0xb48cff, 0xf3d9ff],
  fire: [0xe2481b, 0xff9a3c, 0xffe7a3],
  frost: [0x9fd8e8, 0xc8f0ff, 0xf2fbff],
  shadow: [0x6a3aa8, 0x9060d0, 0xe0c8ff],
  holy: [0xffd060, 0xffe9a0, 0xfffbe8],
  physical: [0x8a90a8, 0xc0c8e0, 0xffffff],
};
/** 中点位移分形折线 */
export function fractal(a: THREE.Vector3, b: THREE.Vector3, depth: number, jag: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  let amp = a.distanceTo(b) * jag;
  for (let d = 0; d < depth; d++) {
    const nx: THREE.Vector3[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const m = pts[i].clone().lerp(pts[i + 1], 0.5);
      m.x += (Math.random() - 0.5) * amp; m.y += (Math.random() - 0.5) * amp * 0.7; m.z += (Math.random() - 0.5) * amp;
      nx.push(m, pts[i + 1]);
    }
    pts = nx; amp *= 0.55;
  }
  return pts;
}

/** 沿折线建十字交叉的两条带子（任何视角都看得到粗细），w = 半宽 */
export function ribbon(pts: THREE.Vector3[], w: number, taper = true): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const n = pts.length;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), dir = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let pass = 0; pass < 2; pass++) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      dir.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      side.crossVectors(dir, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      nrm.crossVectors(side, dir).normalize();
      const v = pass === 0 ? side : nrm;
      const k = taper ? 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * i / (n - 1))) : 1;
      const p = pts[i];
      pos.push(p.x + v.x * w * k, p.y + v.y * w * k, p.z + v.z * w * k, p.x - v.x * w * k, p.y - v.y * w * k, p.z - v.z * w * k);
      if (i < n - 1) { const j = base + i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

export const addMat = (c: number, op: number) => {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return m;
};

