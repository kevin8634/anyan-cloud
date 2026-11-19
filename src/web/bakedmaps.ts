// 11-11 桌面版阶段二（wip/electron1109）：烘焙光照贴图 / AO 贴图接口，给阶段三 Blender 烘焙成果接回游戏用
// 约定（Blender 端导出时遵守）：
//   - 烘焙用第二套 UV（Blender 里叫 "UVMap.001" 或 "Lightmap"），glTF 导出为 TEXCOORD_1，three 读成 geometry.attributes.uv1
//   - AO：直接放进材质的 Occlusion 槽并指定 texCoord 1，GLTFLoader 自动接好（aoMap.channel = 1），不需要本文件
//   - 光照（漫反射间接光 + 阴影）：glTF 没有标准槽，单独导出一张贴图（KTX2 或 WebP），用 applyLightMap 按节点名前缀挂上
//   - 码头东半边（戈尔顿会打塌的 DOCK_EAST 'spin' 组）单独一张，不和西半边合；塌落后光照贴图跟着动，看起来只是「旧光」，可接受
import * as THREE from 'three';

export interface BakedOpts {
  /** 光照贴图强度（MeshToon / MeshStandard 都吃 lightMapIntensity），默认 1 */
  intensity?: number;
  /** 只处理名字以此开头的网格（不填 = 全部有 uv1 的网格） */
  prefix?: string;
  /** 烘焙图里已经含太阳直射光时，可调低该节点实时阳光贡献；这里只做标记，由场景自行处理 */
  bakedDirect?: boolean;
}

/** 给 root 下所有带第二套 UV 的网格挂光照贴图。返回挂上的网格数（0 = 没有 uv1，多半是导出时没勾第二套 UV） */
export function applyLightMap(root: THREE.Object3D, tex: THREE.Texture, o: BakedOpts = {}): number {
  tex.channel = 1; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  let n = 0;
  root.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes?.uv1) return;
    if (o.prefix && !m.name.startsWith(o.prefix)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const x = mat as THREE.MeshStandardMaterial;
      if (!('lightMap' in x)) continue;
      x.lightMap = tex; x.lightMapIntensity = o.intensity ?? 1; x.needsUpdate = true;
    }
    if (o.bakedDirect) m.userData.bakedDirect = true;
    n++;
  });
  return n;
}

/** 没有 occlusion 槽的模型（程序化场景件）补挂 AO 贴图，同样走第二套 UV */
export function applyAoMap(root: THREE.Object3D, tex: THREE.Texture, intensity = 1, prefix?: string): number {
  tex.channel = 1; tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  let n = 0;
  root.traverse(obj => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes?.uv1 || (prefix && !m.name.startsWith(prefix))) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const x = mat as THREE.MeshStandardMaterial;
      if (!('aoMap' in x)) continue;
      x.aoMap = tex; x.aoMapIntensity = intensity; x.needsUpdate = true;
    }
    n++;
  });
  return n;
}

/** 统计：root 下网格 / 材质 / 带 uv1 的网格数，导入 Blender 成果后自检用（控制台 __game 调） */
export function bakedReport(root: THREE.Object3D) {
  let meshes = 0, uv1 = 0, lm = 0, ao = 0; const mats = new Set<THREE.Material>();
  root.traverse(obj => { const m = obj as THREE.Mesh; if (!m.isMesh) return; meshes++; if (m.geometry?.attributes?.uv1) uv1++;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { mats.add(mat); const x = mat as THREE.MeshStandardMaterial; if (x.lightMap) lm++; if (x.aoMap) ao++; } });
  return { meshes, materials: mats.size, uv1, lightMapped: lm, aoMapped: ao };
}
