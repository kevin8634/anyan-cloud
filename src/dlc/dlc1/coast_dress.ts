// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 三区造景（概念图 docs/设计/沉钟海岸升级/coast_A/B/C）
//   A 退潮沉钟浅滩（中部）：放大巨钟（coast.ts）、玄武岩柱群、伸进东南海里的断续石堤、小钟 / 钟片 / 锁链 / 藤壶石 / 海草散布
//   B 风暴锈锚码头（东岸）：栈桥（木板 + 桩 + 链栏）、巨锚锁链、灯塔（旋转体积光束）、沉船龙骨、暖黄挂灯、井口 + 青铜升降笼（潮渊钟井，仅地标）
//   C 鲸骨礁湾（西岸）：鲸肋骨拱 + 脊椎、骨拱挂钟、礁柱、青色荧光、刻纹石碑、远处半沉钟楼
//   大量重复件全部 InstancedMesh（Inst / Chains）；数量按画质分档（tierN）
// ======================================================================
import * as THREE from 'three';
import type { WildBuildApi } from '../../core/ContentPacks';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Inst, Chains, mat, bellGeo, bellMesh, taperTube, anchorMesh, whiteColors, rnd, reseed, tierN, isLow, isHi, kitU } from './coast_kit';
import { sceneOr, sceneHang, sceneInstSrc } from './lux_dlc';
import { makeBeam } from './coast_beam';
import { dynHangQuat, dynWindHint } from './dyn_world';   // 11-14 挂灯 / 骨拱挂钟改读共享风场（频率恒定 + 阵风 + 角色碰到会晃）
import { PIER, WELL, ISLET, JETTY, LIGHTHOUSE, BEAM_O, ANCHORS, LANTERNS, KEEL, BASALT_A, BASALT_C, SEAWALL, WHALE, BONE_ARCH, SUNK_TOWER,
  DECK_Y, SEA_Y, shoreD, poolK, A_POOLS, reefW, stormW, onPier } from './coast_layout';

type V3 = THREE.Vector3;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 运行时要动的东西（风暴调度 / 每帧） */
export const dressRT = {
  beam: null as THREE.Group | null, beamMat: null as THREE.ShaderMaterial | null, core: null as THREE.Object3D | null,
  cage: null as THREE.Object3D | null, lanterns: null as { inst: THREE.InstancedMesh[]; base: THREE.Matrix4[]; pivots: V3[] } | null,
  bells: [] as THREE.Object3D[], lights: [] as THREE.PointLight[], glow: null as THREE.Points | null,
};
export const dressStats = { A: [] as string[], B: [] as string[], C: [] as string[], inst: 0, instCount: 0, meshes: 0 };

// ---------------------------------------------------------------- 发光点精灵（挂灯光晕 / 灯塔核心 / 荧光）
class Glow {
  pos: number[] = []; col: number[] = []; size: number[] = [];
  add(p: V3, c: THREE.Color, s: number) { this.pos.push(p.x, p.y, p.z); this.col.push(c.r, c.g, c.b); this.size.push(s); }
  build(name: string): THREE.Points {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: kitU.uTime, uScale: { value: 620 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; varying vec3 vC; uniform float uTime; uniform float uScale;
        void main(){ vC = aCol * (0.85 + 0.15 * sin(uTime * 3.1 + position.x * 1.7 + position.z)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(1.0, -mv.z); }`,
      fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 2.2); gl_FragColor = vec4(vC * a, a); }` });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.name = name; p.renderOrder = 6; return p;
  }
}

export function dressBuild(api: WildBuildApi, root: THREE.Group) {
  reseed(7171);
  const O = api.origin, gy = (lx: number, lz: number) => api.groundY(lx, lz);
  const W = (lx: number, y: number, lz: number) => V(O.x + lx, y, O.z + lz);
  const block = (lx: number, lz: number, r: number) => api.block?.(lx, lz, r);
  const put = (o: THREE.Object3D, name: string) => { o.name = name; root.add(o); dressStats.meshes++; return o; };
  const addI = (i: Inst | null | undefined, cast = false) => { const im = i?.build(cast); if (im) { root.add(im); dressStats.inst++; dressStats.instCount += im.count; } return im; };

  // 共用实例化件
  const basalt = new Inst(new THREE.CylinderGeometry(1, 1.06, 1, 6, 1), mat('basalt'), 'coast_basalt');
  const stoneBlk = new Inst(new THREE.BoxGeometry(1, 1, 1), mat('stone'), 'coast_stoneblocks');
  const rocks = new Inst(new THREE.DodecahedronGeometry(1, 1), mat('stone'), 'coast_rocks');
  const barn = new Inst(new THREE.ConeGeometry(0.5, 0.7, 6, 1, true), mat('barnacle'), 'coast_barnacles');
  const chains = new Chains();
  const glow = new Glow();
  const cyan = new Inst(new THREE.IcosahedronGeometry(0.09, 0), mat('cyan'), 'coast_cyan');

  /** 玄武岩柱群：圆盘内随机不重叠，越靠中心越高；柱脚埋进地 1 米 */
  const columns = (cx: number, cz: number, R: number, n: number, hMax: number, slender = 1) => {
    const pts: [number, number, number][] = [];
    for (let t = 0; t < n * 12 && pts.length < n; t++) {
      const a = rnd() * 6.283, d = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, r = (0.75 + rnd() * 0.5) * slender;
      if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < (p[2] + r) * 0.92)) continue;
      pts.push([x, z, r]);
    }
    for (const [x, z, r] of pts) {
      const d = Math.hypot(x - cx, z - cz) / R, h = Math.max(0.4, hMax * Math.pow(1 - d * 0.85, 0.8) * (0.55 + rnd() * 0.45));
      const g = gy(x, z) - 1.2, k = 0.75 + rnd() * 0.35;
      basalt.add(O.x + x, g + (h + 1.2) / 2, O.z + z, (rnd() - 0.5) * 0.06, rnd() * 6.28, (rnd() - 0.5) * 0.06, r, h + 1.2, r, 0xffffff, k);
      if (h > 1.4 && shoreD(x, z) < 1) block(x, z, r * 0.95);
      // 柱脚藤壶 / 荧光
      if (rnd() < 0.5) for (let b = 0; b < 4; b++) { const aa = rnd() * 6.28; barn.add(O.x + x + Math.cos(aa) * r * 0.95, gy(x, z) + 0.1 + rnd() * 0.5, O.z + z + Math.sin(aa) * r * 0.95, 0, 0, 0, 0.12 + rnd() * 0.1, 0.1 + rnd() * 0.08, 0.12 + rnd() * 0.1, 0xffffff, 0.7 + rnd() * 0.4); }
    }
  };
  const rockAt = (x: number, z: number, s: number, sink = 0.35, k = 0.8) => rocks.add(O.x + x, gy(x, z) - s * sink, O.z + z, rnd() * 3, rnd() * 6.28, rnd() * 3, s * (0.9 + rnd() * 0.5), s * (0.5 + rnd() * 0.35), s * (0.9 + rnd() * 0.5), 0xffffff, k);

  // ==================================================================== A 退潮沉钟浅滩
  BASALT_A.forEach(([x, z, R, n, h]) => columns(x, z, R, Math.round(n * (isLow() ? 0.6 : 1)), h));
  dressStats.A.push('basalt');
  { // 石堤：断续拱桥（桥墩 + 拱 + 桥面石板），从岸上伸进东南的海，中段塌了几孔
    const [ax, az, bx, bz] = SEAWALL, L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, ry = Math.atan2(dx, dz);
    const archG: THREE.BufferGeometry[] = [];
    const DECK = 1.9, SPAN = 6.4;
    for (let s = 0, i = 0; s < L; s += SPAN, i++) {
      const x = ax + dx * s, z = az + dz * s, g = gy(x, z), broken = i === 4 || i === 7 || (i > 8 && rnd() < 0.35);
      const top = DECK + (i > 8 ? -0.6 * (i - 8) : 0);   // 末端往海里塌陷
      // 桥墩
      const ph = top - g + 0.4; stoneBlk.add(O.x + x, g + ph / 2 - 0.4, O.z + z, 0, ry, 0, 2.6, ph, 1.5, 0xffffff, 0.75 + rnd() * 0.2);
      if (shoreD(x, z) < 2) block(x, z, 1.4);
      if (!broken && s + SPAN < L) {
        // 拱（半个圆环，扁）
        const ag = new THREE.TorusGeometry(SPAN / 2 - 0.75, 0.45, 5, 10, Math.PI); ag.scale(1, 0.8, 2.2);
        ag.rotateY(ry - Math.PI / 2); ag.translate(O.x + x + dx * SPAN / 2, top - 0.75 - (SPAN / 2 - 0.75) * 0.8 + 0.45, O.z + z + dz * SPAN / 2);
        archG.push(ag.toNonIndexed());
        // 桥面石板（几块错落，边上缺角）
        for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4 * SPAN; if (rnd() < 0.12) continue;
          stoneBlk.add(O.x + x + dx * t, top + 0.15, O.z + z + dz * t, (rnd() - 0.5) * 0.06, ry + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, 2.4 + rnd() * 0.3, 0.32, SPAN / 4 - 0.08, 0xffffff, 0.7 + rnd() * 0.25); }
        // 女儿墙残段
        if (rnd() < 0.6) for (const sd of [-1, 1]) if (rnd() < 0.6) stoneBlk.add(O.x + x + dx * SPAN * 0.5 + dz * sd * 1.15, top + 0.6, O.z + z + dz * SPAN * 0.5 - dx * sd * 1.15, 0, ry, 0, 0.35, 0.6 + rnd() * 0.4, SPAN * (0.3 + rnd() * 0.5), 0xffffff, 0.65);
      } else {
        // 塌落的石块
        for (let k = 0; k < 5; k++) { const t = rnd() * SPAN, xx = x + dx * t + (rnd() - 0.5) * 3, zz = z + dz * t + (rnd() - 0.5) * 3; rockAt(xx, zz, 0.6 + rnd() * 0.7, 0.3, 0.7); }
      }
    }
    if (archG.length) { const ag = mergeGeometries(archG.map(g => whiteColors(g)), false); if (ag) { const m = new THREE.Mesh(ag, mat('stone')); m.castShadow = true; m.receiveShadow = true; put(m, 'coast_seawall'); } }
    dressStats.A.push('seawall');
  }
  // 散落的小钟 / 钟片 / 锁链 / 藤壶石 / 海草（A 最多，B / C 少量）
  // 11-14d Rhett：小钟改用已有模型 scene_wl_well_bell（实例化；低画质 / 没模型回退程序钟）
  const sbSrc = sceneInstSrc('scene_wl_well_bell', 1.3);
  const smallBell = sbSrc ? new Inst(sbSrc.geo, sbSrc.mat, 'coast_smallbells') : new Inst(bellGeo(isLow() ? 10 : 16), mat('bronze'), 'coast_smallbells');
  const sbK = sbSrc ? sbSrc.k : 1;
  const shardG = (() => { const pr: THREE.Vector2[] = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pr.push(new THREE.Vector2(0.45 + 0.5 * t * t, 1.2 * (1 - t))); } return new THREE.LatheGeometry(pr, 4, 0, 1.1); })();
  const shards = new Inst(shardG, mat('bronze'), 'coast_bellshards');
  const kelpG = (() => { const g = new THREE.PlaneGeometry(0.16, 1, 1, 4); g.translate(0, 0.5, 0); const p = g.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.7)); p.setZ(i, y * y * 0.25); } g.computeVertexNormals(); return g; })();
  const kelp = new Inst(kelpG, mat('kelp'), 'coast_kelp');
  const okLand = (x: number, z: number) => Math.hypot(x, z - 62) > 17 && Math.hypot(x, z - 84) > 8 && Math.hypot(x, z + 84) > 8 && Math.abs(x) > 3.2 && onPier(x, z) < -0.5;
  const scatterIn = (cx: number, cz: number, R: number, n: number, f: (x: number, z: number, d: number) => void, sea = false) => {
    for (let t = 0, k = 0; t < n * 6 && k < n; t++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; const sd = shoreD(x, z);
      if ((!sea && sd > -1.5) || sd > 1.5 || !okLand(x, z)) continue; f(x, z, sd); k++; }
  };
  const nBell = tierN([18, 36, 64, 90]), nShard = tierN([24, 60, 120, 170]), nChain = tierN([8, 16, 28, 36]), nRock = tierN([40, 70, 120, 160]), nKelp = tierN([0, 260, 640, 980]);
  const bellAt = (x: number, z: number, s: number) => {   // 半埋 / 侧躺的小钟
    const lie = rnd() < 0.7, rx = lie ? Math.PI / 2 + (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.4;
    smallBell.add(O.x + x, gy(x, z) + (lie ? 0.55 * s : -0.15 * s), O.z + z, rx, rnd() * 6.28, (rnd() - 0.5) * 0.4, s * sbK, s * sbK, s * sbK, 0xffffff, 0.75 + rnd() * 0.5);
  };
  scatterIn(0, -18, 60, nBell, (x, z) => bellAt(x, z, 0.22 + rnd() * 0.3));
  scatterIn(0, -18, 62, nShard, (x, z) => shards.add(O.x + x, gy(x, z) + 0.05, O.z + z, Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd() * 6.28, rnd() * 6.28, 0.35 + rnd() * 0.35, 0.35 + rnd() * 0.35, 0.35 + rnd() * 0.35, 0xffffff, 0.7 + rnd() * 0.4));
  scatterIn(0, -18, 58, nChain, (x, z) => { if (rnd() < 0.5) chains.pile(O.x + x, O.z + z, 0.8 + rnd() * 0.8, (X, Z) => gy(X - O.x, Z - O.z), 0.8); else { const a = rnd() * 6.28, L = 2 + rnd() * 4; chains.add(W(x, 0, z), W(x + Math.cos(a) * L, 0, z + Math.sin(a) * L), 0, 0.8, (X, Z) => gy(X - O.x, Z - O.z)); } });
  scatterIn(0, -20, 70, nRock, (x, z, sd) => { rockAt(x, z, 0.35 + rnd() * 0.8, 0.4, 0.6 + rnd() * 0.3); if (rnd() < 0.6) for (let b = 0; b < 3; b++) barn.add(O.x + x + (rnd() - 0.5) * 0.6, gy(x, z) + 0.15, O.z + z + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5, 0.08, 0.07, 0.08, 0xffffff, 0.8); void sd; }, true);
  // 海草：潮池边 / 湿沙带 / 礁石脚
  const kelpTuft = (x: number, z: number, n: number, s: number) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = rnd() * 0.5; kelp.add(O.x + x + Math.cos(a) * r, gy(x, z) - 0.02, O.z + z + Math.sin(a) * r, (rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4, s * (0.8 + rnd() * 0.5), s * (0.5 + rnd() * 0.9), s, new THREE.Color().setHSL(0.17 + rnd() * 0.08, 0.45, 0.22 + rnd() * 0.12)); } };
  if (nKelp) {
    for (const p of A_POOLS) for (let k = 0; k < 4; k++) { const a = rnd() * 6.28; kelpTuft(p[0] + Math.cos(a) * p[2] * 0.95, p[1] + Math.sin(a) * p[3] * 0.95, Math.round(nKelp / 150), 0.55); }
    let n = 0; for (let t = 0; t < nKelp * 3 && n < nKelp; t++) { const x = (rnd() - 0.5) * 250, z = (rnd() - 0.5) * 250, sd = shoreD(x, z); if (sd < -9 || sd > 0.5 || !okLand(x, z) || stormW(x, z) > 0.5 && rnd() < 0.5) continue; kelpTuft(x, z, 5, 0.5 + rnd() * 0.3); n += 5; }
  }
  // 潮池边发光海葵（潮池 = 青色发光潮池）
  for (const p of A_POOLS) for (let k = 0; k < tierN([2, 5, 9, 12]); k++) { const a = rnd() * 6.28, x = p[0] + Math.cos(a) * p[2] * 0.9, z = p[1] + Math.sin(a) * p[3] * 0.9; cyan.add(O.x + x, gy(x, z) + 0.05, O.z + z, 0, 0, 0, 1 + rnd(), 0.6, 1 + rnd(), 0xffffff, 0.5 + rnd() * 0.5); }
  { // 巨钟（coast.ts：中心 (0,-12)、侧卧 rz 0.5 / ry 0.4、尺寸 6.2）：钟纽垂下的锁链、钟口一圈海草和藤壶
    const bo = new THREE.Object3D(); bo.position.set(O.x, gy(0, -12) - 0.9, O.z - 12); bo.rotation.set(0, 0.4, 0.5); bo.scale.setScalar(6.2); bo.updateMatrixWorld(true);
    const crown = V(0, 1.72, 0).applyMatrix4(bo.matrixWorld);
    for (const [x, z] of [[-9, -4], [-6, -19], [7, -20]]) chains.add(crown, W(x, gy(x, z) + 0.05, z), 1.2, 1.6);
    for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283, p = V(Math.cos(a) * 0.95, 0.05, Math.sin(a) * 0.95).applyMatrix4(bo.matrixWorld); if (p.y < gy(p.x - O.x, p.z - O.z) - 0.2) continue;
      kelp.add(p.x, p.y, p.z, Math.PI + (rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5, 2 + rnd(), 1.2 + rnd() * 1.6, 2, new THREE.Color().setHSL(0.18 + rnd() * 0.06, 0.5, 0.2 + rnd() * 0.1));
      for (let b = 0; b < 3; b++) barn.add(p.x + (rnd() - 0.5) * 0.8, p.y + (rnd() - 0.5) * 0.8, p.z + (rnd() - 0.5) * 0.8, rnd() * 3, 0, rnd() * 3, 0.14, 0.12, 0.14, 0xffffff, 0.8); }
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = 5 + rnd() * 4; kelpTuft(Math.cos(a) * r, -12 + Math.sin(a) * r, 4, 0.6); }
  }
  dressStats.A.push('bells', 'shards', 'chains', 'kelp');

  // ==================================================================== B 风暴锈锚码头
  { // 栈桥：木板（沿桥身方向铺横板）+ 纵梁 + 两排桩 + 链栏
    const plank = new Inst(new THREE.BoxGeometry(1, 0.1, 0.3), mat('wood'), 'coast_planks');
    const beam = new Inst(new THREE.BoxGeometry(0.28, 0.32, 1), mat('woodDark'), 'coast_beams');
    const pile = new Inst(new THREE.CylinderGeometry(0.2, 0.24, 1, 7), mat('woodDark'), 'coast_piles');
    const posts: [number, number][] = [];
    for (const s of PIER) {
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az), dx = (s.bx - s.ax) / L, dz = (s.bz - s.az) / L, ry = Math.atan2(dx, dz), nx = dz, nz = -dx;
      for (let t = 0.15; t < L; t += 0.34) {
        const x = s.ax + dx * t, z = s.az + dz * t; if (onPier(x, z) < s.hw - 0.4 && t > 1 && t < L - 1) continue;   // 支桥和主桥交叉处不重复铺
        const w = s.hw * 2 * (0.94 + rnd() * 0.06), sh = (rnd() - 0.5) * 0.25;
        plank.add(O.x + x + nx * sh, gy(x, z) - 0.04, O.z + z + nz * sh, (rnd() - 0.5) * 0.03, ry + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.02, w, 1, 1, 0xffffff, 0.62 + rnd() * 0.5);
      }
      for (const sd of [-1, 1]) { const x = s.ax + dx * L / 2 + nx * sd * (s.hw - 0.3), z = s.az + dz * L / 2 + nz * sd * (s.hw - 0.3); beam.add(O.x + x, DECK_Y - 0.28, O.z + z, 0, ry, 0, 1, 1, L, 0xffffff, 0.8); }
      for (let t = 0; t <= L + 0.01; t += 3.2) for (const sd of [-1, 1]) {
        const x = s.ax + dx * t + nx * sd * (s.hw + 0.05), z = s.az + dz * t + nz * sd * (s.hw + 0.05); if (shoreD(x, z) < -3) continue;
        const top = DECK_Y + 0.95 + rnd() * 0.3, bot = Math.min(gy(x, z), SEA_Y) - 7;
        pile.add(O.x + x, (top + bot) / 2, O.z + z, (rnd() - 0.5) * 0.05, rnd() * 6, (rnd() - 0.5) * 0.05, 1, top - bot, 1, 0xffffff, 0.7 + rnd() * 0.3);
        posts.push([x, z]);
        // 桩上藤壶 / 海草
        for (let b = 0; b < 3; b++) { const a = rnd() * 6.28; barn.add(O.x + x + Math.cos(a) * 0.22, SEA_Y + (rnd() - 0.3) * 0.8, O.z + z + Math.sin(a) * 0.22, 0, 0, 0, 0.1, 0.08, 0.1, 0xffffff, 0.75); }
      }
      // 链栏：同侧相邻桩之间垂一段链
      for (const sd of [-1, 1]) for (let t = 0; t + 3.2 <= L + 0.01; t += 3.2) {
        const a = W(s.ax + dx * t + nx * sd * (s.hw + 0.05), DECK_Y + 0.8, s.az + dz * t + nz * sd * (s.hw + 0.05)), b = W(s.ax + dx * (t + 3.2) + nx * sd * (s.hw + 0.05), DECK_Y + 0.8, s.az + dz * (t + 3.2) + nz * sd * (s.hw + 0.05));
        if (shoreD(a.x - O.x, a.z - O.z) < -3 || rnd() < 0.15) continue; chains.add(a, b, 0.3 + rnd() * 0.15, 0.75);
      }
    }
    addI(plank); addI(beam); addI(pile, true);
    // 系缆桩 + 链堆
    const bollard = new Inst(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 10), mat('rust'), 'coast_bollards');
    for (const [x, z] of [[92, 16.6], [106, 19.4], [122, 16.6], [98, 39], [104, 41.6], [116, -1.5], [108, -9.8]]) { bollard.add(O.x + x, gy(x, z) + 0.35, O.z + z, 0, 0, 0, 1, 1, 1, 0xffffff, 0.8); chains.pile(O.x + x + 0.9, O.z + z, 0.7, (X, Z) => gy(X - O.x, Z - O.z), 0.9); }
    addI(bollard);
    // 木桶 / 箱
    const barrel = new Inst(new THREE.CylinderGeometry(0.4, 0.4, 1, 10), mat('woodDark'), 'coast_barrels');
    for (const [x, z] of [[84, 16.2], [84.9, 16.5], [101, 41.8], [95, 41.4], [110.5, 10]]) barrel.add(O.x + x, gy(x, z) + 0.5, O.z + z, 0, rnd() * 6, 0, 1, 1, 1, 0xffffff, 0.8);
    addI(barrel);
    dressStats.B.push('pier');
  }
  { // 巨锚 + 锁链
    ANCHORS.forEach(([x, z, ry, s], i) => {
      const a = anchorMesh(s); const g = new THREE.Group(); g.add(a);
      if (i === 0) { a.rotation.z = 0.42; g.position.set(O.x + x, gy(x, z) - 0.9, O.z + z); }   // 斜靠栈桥，锚冠插进湿沙
      else if (i === 1) { g.position.set(O.x + x, DECK_Y - 3.42 * s + 0.4, O.z + z); a.rotation.z = 0.12; }   // 挂在栈桥尽头，大半没进海里
      else { a.rotation.z = 1.35; g.position.set(O.x + x, gy(x, z) + 0.15 * s, O.z + z); }   // 侧躺在沙滩上
      g.rotation.y = ry; put(g, 'coast_anchor' + i); block(x, z, 0.9 * s);
      g.updateMatrixWorld(true);
      const ring = V(0, 3.42, 0).applyMatrix4(a.matrixWorld);
      if (i === 0) { chains.add(ring, W(92, DECK_Y + 0.4, 16.6), 0.6, 1.5); chains.add(ring, W(84, 0, 28), 0.2, 1.5, (X, Z) => gy(X - O.x, Z - O.z)); }
      if (i === 1) chains.add(ring, W(127, DECK_Y + 0.2, 18), 0.1, 1.5);
      if (i === 2) chains.add(ring, W(70, 0, 12), 0, 1.4, (X, Z) => gy(X - O.x, Z - O.z));
    });
    dressStats.B.push('anchor');
  }
  { // 灯塔（礁岛上）：锥形石塔 + 檐口 + 回廊栏杆 + 灯室玻璃 + 穹顶；旋转体积光束
    const L = LIGHTHOUSE, base = gy(L.x, L.z) - 0.4, g = new THREE.Group(); g.position.set(O.x + L.x, 0, O.z + L.z);
    const pr: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pr.push(new THREE.Vector2(L.r * 1.1 - (L.r * 1.1 - 2.4) * Math.pow(t, 1.15), base + t * (L.h - 3 - base))); }
    pr.unshift(new THREE.Vector2(0.01, base)); pr.push(new THREE.Vector2(3.1, L.h - 2.8), new THREE.Vector2(3.3, L.h - 2.4), new THREE.Vector2(0.01, L.h - 2.4));
    const tower = new THREE.Mesh(whiteColors(new THREE.LatheGeometry(pr, isLow() ? 12 : 24)), mat('stone')); tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
    for (const y of [6, 12.5, 18.5]) { const r = L.r * 1.1 - (L.r * 1.1 - 2.4) * Math.pow((y - base) / (L.h - 3 - base), 1.15); const b = new THREE.Mesh(whiteColors(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.5, isLow() ? 12 : 24, 1, true)), mat('woodDark')); b.position.y = y; g.add(b); }
    // 小窗（暖光）
    for (const [y, a] of [[5, 0.4], [10, 2.6], [15, 4.4], [20, 1.4]]) { const r = L.r * 1.1 - (L.r * 1.1 - 2.4) * Math.pow((y - base) / (L.h - 3 - base), 1.15); const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), mat('lamp')); w.position.set(Math.cos(a) * (r + 0.03), y, Math.sin(a) * (r + 0.03)); w.lookAt(Math.cos(a) * 9, y, Math.sin(a) * 9); g.add(w); }
    // 回廊栏杆
    const rail = new Inst(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), mat('rust'), 'coast_lh_rail');
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; rail.add(O.x + L.x + Math.cos(a) * 3.15, L.h - 1.9, O.z + L.z + Math.sin(a) * 3.15, 0, 0, 0, 1, 1, 1); }
    addI(rail);
    const top = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(3.15, 0.05, 4, 32)), mat('rust')); top.rotation.x = Math.PI / 2; top.position.y = L.h - 1.4; g.add(top);
    // 灯室：玻璃（自发光淡青）+ 竖棂 + 穹顶
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 2.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(0.8), transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    glass.position.y = L.h - 1.1; g.add(glass);
    const mull = new Inst(new THREE.BoxGeometry(0.1, 2.7, 0.1), mat('rust'), 'coast_lh_mullion');
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; mull.add(O.x + L.x + Math.cos(a) * 1.58, L.h - 1.1, O.z + L.z + Math.sin(a) * 1.58, 0, -a, 0, 1, 1, 1); }
    addI(mull);
    const roof = new THREE.Mesh(whiteColors(new THREE.ConeGeometry(2.05, 2.2, 16)), mat('rust')); roof.position.y = L.h + 1.3; g.add(roof);
    const fin = new THREE.Mesh(whiteColors(new THREE.SphereGeometry(0.22, 8, 6)), mat('rust')); fin.position.y = L.h + 2.5; g.add(fin);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mat('glass')); core.position.y = BEAM_O.y; g.add(core); dressRT.core = core;
    put(g, 'coast_lighthouse');
    glow.add(W(L.x, BEAM_O.y, L.z), new THREE.Color(0.85, 0.95, 1.2), 9);
    // 体积光束：两道相背的开口圆锥（11-15 海天 v3 拆到 coast_beam.ts，风暴里穿过雨雾）
    const { group: beamGrp, mat: bm } = makeBeam(isLow(), kitU.uTime); beamGrp.position.set(O.x + BEAM_O.x, BEAM_O.y, O.z + BEAM_O.z);
    root.add(beamGrp); dressRT.beam = beamGrp; dressRT.beamMat = bm;
    // 礁岛乱石 + 礁石堤两侧护石
    for (let a = 0; a < 6.28; a += 0.32) rockAt(ISLET.x + Math.cos(a) * (ISLET.r - 0.5 + rnd() * 2), ISLET.z + Math.sin(a) * (ISLET.r - 0.5 + rnd() * 2), 1 + rnd() * 1.3, 0.35, 0.55);
    { const L2 = Math.hypot(JETTY.bx - JETTY.ax, JETTY.bz - JETTY.az), dx = (JETTY.bx - JETTY.ax) / L2, dz = (JETTY.bz - JETTY.az) / L2; for (let t = 0; t < L2; t += 1.6) for (const sd of [-1, 1]) rockAt(JETTY.ax + dx * t + dz * sd * (JETTY.hw + 0.6), JETTY.az + dz * t - dx * sd * (JETTY.hw + 0.6), 0.7 + rnd() * 0.6, 0.35, 0.55); }
    dressStats.B.push('lighthouse', 'beam');
  }
  { // 沉船龙骨：龙骨梁 + 一排折断的肋材（船侧翻、半沉在井口东边的海里）
    const K = KEEL, dx = Math.sin(K.ry), dz = Math.cos(K.ry), geos: THREE.BufferGeometry[] = [];
    const kb = new THREE.BoxGeometry(0.7, 0.6, K.len); kb.rotateX(0.06); kb.rotateY(K.ry); kb.translate(O.x + K.x, SEA_Y - 0.2, O.z + K.z); geos.push(whiteColors(kb.toNonIndexed()));
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12 - 0.5, cx = K.x + dx * t * K.len, cz = K.z + dz * t * K.len, wd = 4.4 * (1 - Math.abs(t) * 1.1), hgt = 5.5 * (1 - Math.abs(t) * 0.7);
      const cut = 0.45 + rnd() * 0.55, pts: V3[] = [];
      for (let k = 0; k <= 6; k++) { const u = k / 6 * cut, a = u * Math.PI; pts.push(V(O.x + cx + dz * Math.cos(a) * wd * 0.5 * -1 * (k < 1 ? 1 : 1), SEA_Y - 0.4 + Math.sin(a) * hgt * (0.8 + 0.2 * u), O.z + cz - dx * Math.cos(a) * wd * 0.5 * -1)); }
      // 侧翻：整根往外倾
      const tilt = new THREE.Matrix4().makeRotationAxis(V(dx, 0, dz), 0.42); const pivot = V(O.x + cx, SEA_Y, O.z + cz);
      pts.forEach(p => p.sub(pivot).applyMatrix4(tilt).add(pivot));
      if (rnd() < 0.85) geos.push(taperTube(pts, 8, isLow() ? 4 : 6, 0.26, 0.14).toNonIndexed());
    }
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat('woodDark')); m.castShadow = true; put(m, 'coast_keel');
    dressStats.B.push('keel');
  }
  { // 暖黄挂灯：桩 + 横臂 + 吊灯（灯框 + 灯芯 + 顶盖），灯随风摆（每帧更新实例矩阵）；光晕点精灵；高档 2 盏 / 超高档 4 盏点光源
    const post = new Inst(new THREE.BoxGeometry(0.18, 1, 0.18), mat('woodDark'), 'coast_lamp_posts');
    const arm = new Inst(new THREE.BoxGeometry(0.12, 0.12, 1.05), mat('woodDark'), 'coast_lamp_arms');
    const frame = new Inst(new THREE.BoxGeometry(0.34, 0.46, 0.34), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6, metalness: 0.6, wireframe: false, transparent: true, opacity: 0.55 }), 'coast_lamp_frames');
    const coreI = new Inst(new THREE.BoxGeometry(0.22, 0.3, 0.22), mat('lamp'), 'coast_lamp_cores');
    const cap = new Inst(new THREE.ConeGeometry(0.3, 0.22, 4), mat('rust'), 'coast_lamp_caps');
    const pivots: V3[] = [], bases: THREE.Matrix4[] = [];
    LANTERNS.forEach(([x, z, ry]) => {
      const g0 = gy(x, z), H = 3.3; post.add(O.x + x, g0 + H / 2 - 0.2, O.z + z, 0, ry, 0, 1, H + 0.4, 1, 0xffffff, 0.8);
      const ax = x + Math.sin(ry) * 0.5, az = z + Math.cos(ry) * 0.5; arm.add(O.x + ax, g0 + H - 0.25, O.z + az, 0, ry, 0, 1, 1, 1, 0xffffff, 0.8);
      const px = x + Math.sin(ry) * 0.95, pz = z + Math.cos(ry) * 0.95, py = g0 + H - 0.35; pivots.push(V(O.x + px, py, O.z + pz));
      bases.push(new THREE.Matrix4().makeRotationY(ry));
      glow.add(V(O.x + px, py - 0.55, O.z + pz), new THREE.Color(1.3, 0.75, 0.32), 2.4);
      block(x, z, 0.25);
    });
    addI(post, true); addI(arm);
    // 灯体三件按 pivot 放（每帧重算）
    const n = LANTERNS.length, inst: THREE.InstancedMesh[] = [];
    for (const [I, off] of [[frame, -0.55], [coreI, -0.55], [cap, -0.24]] as [Inst, number][]) {
      for (let i = 0; i < n; i++) I.add(pivots[i].x, pivots[i].y + off, pivots[i].z, 0, LANTERNS[i][2], 0, 1, 1, 1);
      const im = addI(I)!; im.userData.off = off; im.frustumCulled = false; inst.push(im);
    }
    dressRT.lanterns = { inst, base: bases, pivots };
    if (isHi()) for (const i of (curQ() === 'ultra' ? [1, 3, 6, 9] : [1, 9])) { const l = new THREE.PointLight(0xffa850, 7, 11, 2); l.position.copy(pivots[i]).add(V(0, -0.6, 0)); l.name = 'coast_lamp_light'; l.userData.li = i; root.add(l); dressRT.lights.push(l); }
    dressStats.B.push('lanterns');
  }
  { // 潮渊钟井：井台石环 + 女儿墙 + 深井筒 + 吊架 + 青铜升降笼（仅地标）
    const w = WELL, gx = O.x + w.x, gz = O.z + w.z, top = DECK_Y, g = new THREE.Group(); g.position.set(gx, 0, gz);
    const ringPr = [new THREE.Vector2(w.hole, top - 4), new THREE.Vector2(w.hole, top + 0.95), new THREE.Vector2(w.hole + 0.75, top + 1.05), new THREE.Vector2(w.hole + 0.75, top + 0.02), new THREE.Vector2(w.r, top), new THREE.Vector2(w.r + 0.4, top - 0.2), new THREE.Vector2(w.r + 0.9, SEA_Y - 3)];
    const ring = new THREE.Mesh(whiteColors(new THREE.LatheGeometry(ringPr, isLow() ? 20 : 40)), mat('stone')); ring.castShadow = true; ring.receiveShadow = true; g.add(ring);
    // 井台铺石缝（几道暗色环线）
    for (const r of [5.6, 6.6]) { const l = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 48), new THREE.MeshBasicMaterial({ color: 0x050708, transparent: true, opacity: 0.6, depthWrite: false })); l.rotation.x = -Math.PI / 2; l.position.y = top + 0.012; g.add(l); }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(w.hole - 0.02, w.hole - 0.02, 16, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x030506, side: THREE.BackSide })); shaft.position.y = top - 4 - 8; g.add(shaft);
    // 井底幽光（青色、缓慢呼吸）
    const deep = new THREE.Mesh(new THREE.CircleGeometry(w.hole, 32), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: kitU.uTime },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vU; void main(){ float r = length(vU - 0.5) * 2.0; float k = (1.0 - r) * (0.55 + 0.25 * sin(uTime * 0.9)); gl_FragColor = vec4(vec3(0.05, 0.45, 0.42) * k, 1.0); }' }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = top - 9; g.add(deep);
    // 吊架：两根立柱 + 横梁 + 斜撑 + 滑轮
    const tim = mat('woodDark');
    for (const sd of [-1, 1]) {
      const p = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(0.42, 7.4, 0.42)), tim); p.position.set(sd * 5.7, top + 3.7, 0); p.castShadow = true; g.add(p);
      const br = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(0.22, 3.2, 0.22)), tim); br.position.set(sd * 4.7, top + 6.1, 0); br.rotation.z = sd * 0.75; g.add(br);
      block(w.x + sd * 5.7, w.z, 0.45);
    }
    const bmx = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(12.2, 0.46, 0.5)), tim); bmx.position.y = top + 7.3; bmx.castShadow = true; g.add(bmx);
    const pul = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(0.42, 0.1, 6, 16)), mat('rust')); pul.position.y = top + 6.75; g.add(pul);
    put(g, 'coast_well');
    // 升降笼：挂点在滑轮下，随风轻摆（dressRT.cage 每帧转）
    const cage = new THREE.Group(); cage.position.set(gx, top + 6.6, gz); cage.name = 'coast_cage';
    const bars: THREE.BufferGeometry[] = [];
    const CR = 1.35, CH = 2.8, cy = -4.2;   // 笼体中心在挂点下 4.2 米（离井台 ≈ 2.4 米）
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, b = new THREE.CylinderGeometry(0.045, 0.045, CH, 4); b.translate(Math.cos(a) * CR, cy, Math.sin(a) * CR); bars.push(b.toNonIndexed()); }
    for (const y of [-CH / 2, -CH / 2 + 0.9, CH / 2 - 0.2]) { const t = new THREE.TorusGeometry(CR, 0.07, 5, 28); t.rotateX(Math.PI / 2); t.translate(0, cy + y, 0); bars.push(t.toNonIndexed()); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, rib = new THREE.TorusGeometry(CR, 0.05, 4, 10, Math.PI / 2); rib.rotateY(-a); rib.rotateX(0); rib.translate(0, cy + CH / 2 - 0.2, 0); bars.push(rib.toNonIndexed()); }
    const floor = new THREE.CylinderGeometry(CR, CR, 0.12, 20); floor.translate(0, cy - CH / 2, 0); bars.push(floor.toNonIndexed());
    const hook = new THREE.TorusGeometry(0.22, 0.06, 5, 12); hook.translate(0, cy + CH / 2 + CR - 0.1, 0); bars.push(hook.toNonIndexed());
    const cg = mergeGeometries(bars.map(b => whiteColors(b)), false)!;
    const cageM = new THREE.Mesh(cg, mat('bronze')); cageM.castShadow = true; cage.add(cageM);
    root.add(cage); dressRT.cage = cage;
    chains.add(V(gx, top + 6.65, gz), V(gx, top + 6.6 + cy + CH / 2 + CR + 0.1, gz), 0, 1.2);
    dressStats.B.push('well', 'cage');
  }
  // B 区地面：码头乱链、礁石
  scatterIn(78, 8, 14, tierN([6, 10, 16, 20]), (x, z) => rockAt(x, z, 0.5 + rnd() * 0.8, 0.4, 0.6));

  // ==================================================================== C 鲸骨礁湾
  { // 鲸骨：脊椎（实例化椎骨 + 棘突）+ 肋骨拱（锥形骨管，合并成一个网格）
    const sp = new THREE.CatmullRomCurve3(WHALE.map(([x, z]) => V(x, 0, z))), Ls = sp.getLength();
    const vert = new Inst(new THREE.CylinderGeometry(0.75, 0.75, 0.8, 9), mat('bone'), 'coast_vertebrae');
    const spike = new Inst(new THREE.ConeGeometry(0.28, 1.6, 6), mat('bone'), 'coast_spines');
    const ribs: THREE.BufferGeometry[] = [];
    const H = (t: number) => 10.5 * (1 - 0.42 * t) + 1.5 * Math.sin(t * Math.PI), Wd = (t: number) => 14.5 * (1 - 0.38 * t);
    for (let s = 0; s < Ls; s += 1.15) {
      const t = s / Ls, p = sp.getPointAt(t), tg = sp.getTangentAt(t), gH = gy(p.x, p.z);
      const y = Math.max(gH, SEA_Y - 1) + H(t) * (t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tg); const m4 = new THREE.Matrix4().compose(V(O.x + p.x, y, O.z + p.z), q, V(1 - t * 0.35, 1, 1 - t * 0.35));
      vert.addM(m4, 0.8 + rnd() * 0.25);
      spike.add(O.x + p.x, y + 1.0, O.z + p.z, (rnd() - 0.5) * 0.2, 0, -0.35 + (rnd() - 0.5) * 0.15, 1 - t * 0.4, 1 - t * 0.3, 1 - t * 0.4, 0xffffff, 0.85);
    }
    for (let s = 3; s < Ls - 2; s += 2.7) {
      const t = s / Ls, p = sp.getPointAt(t), tg = sp.getTangentAt(t), nx = tg.z, nz = -tg.x;
      const y0 = Math.max(gy(p.x, p.z), SEA_Y - 1) + H(t) * (t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1) - 0.3, w = Wd(t) / 2;
      for (const sd of [-1, 1]) {
        if (rnd() < 0.08) continue;   // 缺几根
        const sweep = -0.18 * w;   // 肋骨往尾部扫
        const pts = [V(0, y0, 0), V(sd * w * 0.48, y0 + 0.4, 0), V(sd * w * 0.86, y0 - H(t) * 0.38, sweep * 0.5), V(sd * w * 0.98, (y0 - H(t)) * 0.4 + y0 * 0.0 + 0.6, sweep * 0.8), V(sd * w * 0.9, -0.8, sweep)];
        const fx = gy(p.x + nx * sd * w * 0.9, p.z + nz * sd * w * 0.9); pts[4].y = fx - 0.8; pts[3].y = Math.max(pts[3].y, fx + 1.4);
        const rot = new THREE.Matrix4().makeBasis(V(nx, 0, nz).multiplyScalar(1), V(0, 1, 0), V(tg.x, 0, tg.z).normalize());
        const wp = pts.map(v => { const u = V(v.x, 0, v.z).applyMatrix4(rot); return V(O.x + p.x + u.x, v.y, O.z + p.z + u.z); });
        const broken = rnd() < 0.12; if (broken) wp.splice(3 + Math.floor(rnd() * 2));
        ribs.push(taperTube(wp, isLow() ? 8 : 16, isLow() ? 5 : 8, 0.5 * (1 - t * 0.3), 0.24, 0.25).toNonIndexed());
        if (!broken) block(p.x + nx * sd * w * 0.9, p.z + nz * sd * w * 0.9, 0.55);
      }
    }
    const rm = new THREE.Mesh(mergeGeometries(ribs, false)!, mat('bone')); rm.castShadow = true; rm.receiveShadow = true; put(rm, 'coast_whale_ribs');
    addI(vert, true); addI(spike);
    dressStats.C.push('whale');
  }
  { // 骨拱挂钟：两根弯骨交叉成拱，顶上绑绳，钟吊在拱下随风摆
    BONE_ARCH.forEach(([x, z, ry, s], i) => {
      const g = new THREE.Group(); g.position.set(O.x + x, gy(x, z), O.z + z); g.rotation.y = ry;
      const geos: THREE.BufferGeometry[] = [];
      for (const sd of [-1, 1]) geos.push(taperTube([V(sd * 2.6 * s, -0.6, 0), V(sd * 2.4 * s, 2.6 * s, 0.1), V(sd * 1.2 * s, 5.0 * s, 0), V(-sd * 0.5 * s, 5.6 * s, -0.1)], 14, isLow() ? 5 : 8, 0.34 * s, 0.14 * s, 0.3).toNonIndexed());
      const bm = new THREE.Mesh(mergeGeometries(geos, false)!, mat('bone')); bm.castShadow = true; g.add(bm);
      for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.28 * s, 0.05 * s, 4, 10), mat('rope')); r.position.set(0, 5.2 * s - k * 0.12, 0); r.rotation.set(Math.PI / 2 + k * 0.3, 0, k * 0.5); g.add(r); }
      const piv = new THREE.Group(); piv.position.set(0, 5.05 * s, 0); piv.name = 'coast_archbell_pivot';
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8 * s, 4), mat('rope')); rope.position.y = -0.4 * s; piv.add(rope);
      const b = sceneHang('scene_wl_well_bell', { h: 1.3 * s }, () => { const p = bellMesh(0.62 * s, isLow() ? 12 : 22); p.position.y = -1.8 * 0.62 * s; return p; }); b.position.y += -0.8 * s; b.userData.dynHang = false; piv.add(b);   // 11-14d 用已有钟模型（摆动仍由 piv 管） g.add(piv); dressRT.bells.push(piv);
      put(g, 'coast_bonearch' + i);
      for (const sd of [-1, 1]) block(x + Math.cos(ry) * sd * 2.6 * s, z - Math.sin(ry) * sd * 2.6 * s, 0.45);
      for (let k = 0; k < tierN([3, 8, 14, 18]); k++) { const a = rnd() * 6.28, r = 2 + rnd() * 2.5; cyan.add(O.x + x + Math.cos(a) * r, gy(x + Math.cos(a) * r, z + Math.sin(a) * r) + 0.04, O.z + z + Math.sin(a) * r, 0, 0, 0, 1 + rnd(), 0.6, 1 + rnd(), 0xffffff, 0.6 + rnd() * 0.5); }
    });
    dressStats.C.push('bonearch', 'bells');
  }
  // 礁柱（细高、风化）+ 柱脚荧光
  BASALT_C.forEach(([x, z, R, n, h]) => {
    columns(x, z, R, Math.round(n * (isLow() ? 0.6 : 1)), h, 0.85);
    for (let k = 0; k < tierN([10, 30, 70, 110]); k++) { const a = rnd() * 6.28, r = R * (0.5 + rnd() * 0.7), xx = x + Math.cos(a) * r, zz = z + Math.sin(a) * r; if (shoreD(xx, zz) > 0.5) continue; cyan.add(O.x + xx, gy(xx, zz) + 0.05 + rnd() * 0.6, O.z + zz, rnd() * 3, rnd() * 3, 0, 0.6 + rnd() * 1.2, 0.6 + rnd() * 0.8, 0.6 + rnd() * 1.2, 0xffffff, 0.45 + rnd() * 0.7); }
  });
  dressStats.C.push('reef', 'cyan');
  { // 刻纹石碑（青色符文，自发光贴图）
    const tex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128); g.strokeStyle = '#3ff0e0'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.arc(32, 30, 12, 0.6, 5.7); g.stroke(); for (let r = 0; r < 4; r++) { const y = 56 + r * 16; g.beginPath(); g.moveTo(16, y); g.lineTo(24 + (r * 7) % 16, y + 8); g.lineTo(40, y); g.lineTo(48 - (r * 5) % 12, y + 9); g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const [x, z, ry] of [[-66, -30, 0.9], [-96, -6, -0.5]]) {
      const sm = isLow() ? new THREE.MeshLambertMaterial({ color: 0x3a3f40, emissive: 0xffffff, emissiveMap: tex, flatShading: true }) : new THREE.MeshStandardMaterial({ color: 0x3a3f40, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.2, flatShading: true });
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 0.5), sm); st.position.set(O.x + x, gy(x, z) + 1.3, O.z + z); st.rotation.set(0.05, ry, -0.06); st.castShadow = true; put(st, 'coast_stele'); block(x, z, 0.9);
    }
  }
  { // 远处半沉钟楼（比赛版 Lux 钟楼；否则程序化方塔 + 钟亭 + 穹顶 + 钟）
    const T = SUNK_TOWER;
    const tw = sceneOr('scene_belltower', { h: T.h }, () => {
      const g = new THREE.Group(), st = mat('stone');
      const body = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(6, T.h * 0.68, 6)), st); body.position.y = T.h * 0.34; g.add(body);
      for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { const c = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(0.9, T.h * 0.18, 0.9)), st); c.position.set(x, T.h * 0.77, z); g.add(c); }
      const slab = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(6.6, 0.8, 6.6)), st); slab.position.y = T.h * 0.87; g.add(slab);
      const dome = new THREE.Mesh(whiteColors(new THREE.SphereGeometry(3, 14, 8, 0, 6.283, 0, Math.PI / 2)), st); dome.position.y = T.h * 0.89; g.add(dome);
      const sp2 = new THREE.Mesh(whiteColors(new THREE.ConeGeometry(0.6, 3.2, 8)), st); sp2.position.y = T.h * 0.89 + 4.2; g.add(sp2);
      const b = sceneHang('scene_wl_well_bell', { h: 2.6 }, () => bellMesh(1.25, 14)); b.position.y = T.h * 0.7 + 2.4; g.add(b);   // 11-14d
      return g;
    }, { emissiveK: 1.2 });
    tw.position.set(O.x + T.x, -T.sink, O.z + T.z); tw.rotation.set(0.05, 0.6, -0.08); put(tw, 'coast_sunk_tower');
    dressStats.C.push('tower');
  }
  scatterIn(-80, -26, 40, tierN([14, 26, 44, 60]), (x, z) => { if (rnd() < 0.35) bellAt(x, z, 0.2 + rnd() * 0.22); else rockAt(x, z, 0.4 + rnd() * 0.7, 0.4, 0.55); });
  // C 区散骨（小肋骨片）
  { const bone = new Inst(new THREE.CylinderGeometry(0.07, 0.12, 1.4, 5), mat('bone'), 'coast_bonebits'); scatterIn(-78, -24, 42, tierN([12, 30, 56, 80]), (x, z) => bone.add(O.x + x, gy(x, z) + 0.06, O.z + z, Math.PI / 2 + (rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.6, 0.6 + rnd(), 0.5 + rnd() * 1.1, 0.6 + rnd(), 0xffffff, 0.7 + rnd() * 0.3)); addI(bone); }

  // ==================================================================== 收尾
  addI(basalt, true); addI(stoneBlk, true); addI(rocks, true); addI(barn); addI(smallBell, true); addI(shards); addI(kelp); addI(cyan);
  const ch = chains.inst.build(); if (ch) { root.add(ch); dressStats.inst++; dressStats.instCount += ch.count; }
  const gl = glow.build('coast_glow'); root.add(gl); dressRT.glow = gl;
  void reefW; void poolK; void isHi;
}
const curQ = () => (isLow() ? 'low' : isHi() ? (tierN([0, 0, 0, 1]) ? 'ultra' : 'high') : 'medium');

// ---------------------------------------------------------------- 每帧：光束旋转、挂灯 / 骨钟 / 升降笼随风摆
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _qL: THREE.Quaternion[] = [];
export let beamAngle = 0;
export function dressUpdate(dt: number, t: number, wind: number, storm: number) {
  beamAngle = (beamAngle + dt * 0.55) % (Math.PI * 2);
  if (dressRT.beam) { dressRT.beam.rotation.y = beamAngle; }
  if (dressRT.beamMat) { dressRT.beamMat.uniforms.uK.value = 0.4 + 0.35 * storm; dressRT.beamMat.uniforms.uRain.value = storm; }   // uFlash 由 coast_scene 每帧写
  // 11-14 dyn_world：风暴把共享风场调强；挂灯 / 骨拱挂钟按同一套闭式摆角（频率按灯长恒定，不再 sin(t·(1.3+wind)) 相位漂移），角色碰到会晃
  dynWindHint(0.45 + wind * 0.8);
  const L = dressRT.lanterns;
  if (L) {
    const qs = L.pivots.map((p, i) => dynHangQuat(_qL[i] ??= new THREE.Quaternion(), p.x, p.y, p.z, 0.6));
    L.inst.forEach(im => {
      const off = im.userData.off as number;
      for (let i = 0; i < L.pivots.length; i++) {
        _q.copy(qs[i]); _p.set(0, off, 0).applyQuaternion(_q).add(L.pivots[i]);
        _m.compose(_p, _q, _s); _m.multiply(L.base[i]); im.setMatrixAt(i, _m);
      }
      im.instanceMatrix.needsUpdate = true;
    });
    dressRT.lights.forEach(l => { const i = l.userData.li as number | undefined; if (i === undefined || !qs[i]) return; l.position.set(0, -0.6, 0).applyQuaternion(qs[i]).add(L.pivots[i]); });   // 点光源跟灯摆（只有 2–4 盏）
  }
  dressRT.lights.forEach((l, i) => { l.intensity = 7 * (0.9 + 0.1 * Math.sin(t * 9 + i * 3)); });
  for (const b of dressRT.bells) {
    let wp = b.userData.dynWP as THREE.Vector3 | undefined, pq = b.userData.dynPQ as THREE.Quaternion | undefined;
    if (!wp || !pq) { b.updateWorldMatrix(true, false); wp = b.userData.dynWP = b.getWorldPosition(new THREE.Vector3()); pq = b.userData.dynPQ = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(); }
    dynHangQuat(_q, wp.x, wp.y, wp.z, 2.0 * (b.parent?.scale.y ?? 1));
    b.quaternion.copy(pq).invert().multiply(_q).multiply(pq);   // 世界空间摆角换到父节点局部
  }
  void _e;
  if (dressRT.cage) { dressRT.cage.rotation.z = Math.sin(t * 0.6) * (0.015 + wind * 0.05); dressRT.cage.rotation.x = Math.cos(t * 0.45) * (0.01 + wind * 0.04); dressRT.cage.rotation.y += dt * (0.02 + wind * 0.1); }
}
