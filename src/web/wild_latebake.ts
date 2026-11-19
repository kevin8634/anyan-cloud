// ======================================================================
// 11-18 opt1118B 野外后挂件合批（审计 map_audit_1118 第 1 条）
//   buildWild 的 bakeStatic 在内容包造景（WildDef.build：海岸 / 镜渊 / 钟楼 / 熔炉 / 钟井）和 WILD_BUILD_HOOKS（六个野外营地换 DLC 营地件）
//   之前就跑完了，这些后挂件全部一件一次绘制。本体不认识包里的物体（也不 import dlc），所以不把总合批挪后，
//   而是在造景钩子跑完后对「这一步新挂上的物体」补一次保守合批：
//   · 只合静态普通 Mesh，按「同一个材质实例」分组 → 合并后仍用原材质（不克隆、不写顶点色），材质上的呼吸 / 发光 / 画质切换照常生效；
//   · 按 40 米格子分组（保留视锥剔除），每批 ≤ 30 万顶点；单件 > 8000 顶点不合（共享几何的大件合了只涨显存）；
//   · 跳过：带子物体的网格、透明、ShaderMaterial / 改过着色器（onBeforeCompile / customProgramCacheKey，风摆 / 布料）、
//     自己或上级有 onBeforeRender、隐藏的、负缩放、量化 / 交错顶点（GLB 压缩件）、带 userData 标记的（包的灯柱实例化 / 动画 / 交互件都靠它认）、
//     名字像会动 / 会被找的（火 / 灯 / 旗 / 水 / 草木 / 钟 / 链 / 符文 / 传送门 / spin / gate …）；
//   · luxscene_<id> 写实件按名字分组，合并后保留名字（envhd 高精细节层按名字认类别）。
//   ?off=wildbatchlate 回旧（后挂件不合批）
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const LATE_BAKE_ON = (() => { try { return !/(?:[?&]off=[^&]*\bwildbatchlate\b)/.test(location.search); } catch { return true; } })();
export const lateBakeStats: Record<string, { before: number; after: number; skipped: number }> = {};

const MOVE_RE = /^(gate|spin|cloth|fire|fireLight|campfire|waypoint|dp_|latebake)|flame|smoke|spark|ember|glow|halo|rune|portal|water|sea|wave|foam|tide|ripple|kelp|weed|grass|reed|flower|bush|fern|shrub|tree|leaf|leaves|vine|moss|banner|flag|pennant|cloth|rope|chain|lantern|lamp|torch|candle|bell|clapper|wing|fx|anim|door|lid|海|水|草|花|树|旗|叶|火|灯|钟|链|门/i;
const UD_OK = new Set(['lux', 'outlineParameters', 'name']);
const ATTR_OK = new Set(['position', 'normal', 'uv', 'uv1', 'color']);
const MAX_V = 8000, BATCH_V = 300000, CELL = 40;
const OBR = THREE.Object3D.prototype.onBeforeRender, OBC = THREE.Material.prototype.onBeforeCompile, CPK = THREE.Material.prototype.customProgramCacheKey;

const udBusy = (ud: Record<string, unknown>) => { for (const k in ud) if (!UD_OK.has(k)) return true; return false; };
/** 这个物体本身是否「活的」（会动 / 会被包的代码再找 / 再改） */
function live(o: THREE.Object3D): boolean {
  if (!o.visible || o.onBeforeRender !== OBR || udBusy(o.userData)) return true;
  const nm = o.name;
  if (nm && !nm.startsWith('luxscene_') && MOVE_RE.test(nm)) return true;
  if (nm.startsWith('luxscene_') && MOVE_RE.test(nm.slice(9))) return true;
  return false;
}
function meshOk(m: THREE.Mesh): boolean {
  if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (m.children.length || Array.isArray(m.material) || !m.frustumCulled) return false;
  const mat = m.material as THREE.Material & { vertexColors?: boolean };
  if (!mat || (mat as THREE.ShaderMaterial).isShaderMaterial || mat.transparent || mat.onBeforeCompile !== OBC || mat.customProgramCacheKey !== CPK) return false;
  for (const k in mat.userData) if (/^(cineWind|dyn|noBake|anim)/.test(k)) return false;
  const g = m.geometry;
  if (!g || Object.keys(g.morphAttributes).length) return false;
  const pos = g.getAttribute('position');
  if (!pos || pos.count > MAX_V) return false;
  for (const [k, a] of Object.entries(g.attributes)) {
    if (!ATTR_OK.has(k)) return false;
    const ba = a as THREE.BufferAttribute;
    if ((a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || ba.normalized || !(ba.array instanceof Float32Array)) return false;
  }
  if (!!g.getAttribute('color') !== !!mat.vertexColors) return false;
  if (m.matrixWorld.determinant() <= 0) return false;
  return true;
}

/** roots：造景钩子新挂到区域组 root 下的物体。返回 before = 参与考虑的网格数，after = 合批后它们的绘制数 */
export function bakeLate(root: THREE.Object3D, roots: THREE.Object3D[], tag = ''): { before: number; after: number; skipped: number } {
  const st = { before: 0, after: 0, skipped: 0 };
  if (!LATE_BAKE_ON || !roots.length) return st;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; name: string; cast: boolean; recv: boolean; src: THREE.Mesh[]; v: number }[]>();
  const c = new THREE.Vector3();
  const walk = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh;
    if (live(o)) { o.traverse(x => { if ((x as THREE.Mesh).isMesh) { st.before++; st.after++; st.skipped++; } }); return; }
    if (m.isMesh) {
      st.before++;
      if (!meshOk(m)) { st.after++; st.skipped++; for (const ch of o.children) walk(ch); return; }
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      c.copy(g.boundingSphere!.center).applyMatrix4(m.matrixWorld);
      const lux = m.name.startsWith('luxscene_') ? m.name : '';
      const key = [m.material && (m.material as THREE.Material).uuid, lux, m.castShadow, m.receiveShadow, m.renderOrder, m.layers.mask, !!g.index,
        Object.keys(g.attributes).sort().join(','), Math.floor(c.x / CELL), Math.floor(c.z / CELL)].join('|');
      let list = groups.get(key); if (!list) groups.set(key, list = []);
      let e = list[list.length - 1];
      const n = g.getAttribute('position').count;
      if (!e || e.v + n > BATCH_V) list.push(e = { mat: m.material as THREE.Material, name: lux, cast: m.castShadow, recv: m.receiveShadow, src: [], v: 0 });
      e.src.push(m); e.v += n;
      return;
    }
    for (const ch of o.children) walk(ch);
  };
  for (const r of roots) walk(r);
  const tmp = new THREE.Matrix4();
  for (const list of groups.values()) for (const e of list) {
    if (e.src.length < 2) { st.after += e.src.length; continue; }
    const geos = e.src.map(s => { const g = s.geometry.clone(); g.applyMatrix4(tmp.multiplyMatrices(inv, s.matrixWorld)); return g; });
    let merged: THREE.BufferGeometry | null = null;
    try { merged = mergeGeometries(geos, false); } catch { merged = null; }
    geos.forEach(g => g.dispose());
    if (!merged) { st.after += e.src.length; continue; }
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, e.mat);
    mesh.name = e.name || 'latebake'; mesh.castShadow = e.cast; mesh.receiveShadow = e.recv; mesh.renderOrder = e.src[0].renderOrder; mesh.layers.mask = e.src[0].layers.mask;
    root.add(mesh);
    for (const s of e.src) s.parent?.remove(s);   // 源几何不释放：可能和别的件 / 模板共享
    st.after++;
  }
  if (tag) lateBakeStats[tag] = st;
  return st;
}
