// v1.2.73 rig = 程序化绑骨体型模板（评委路线 P0）
// v1.2.30 比赛版：DLC 首领 / 钟楼怪 / 世界首领的 Lux3D 写实模型（assets_aholo/dlc1/creatures/）；没有（商用 base 包）回退程序化模型
import { makeGlbCreature } from '../../web/creatures_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
const whaleOld = (() => { try { return new URLSearchParams(location.search).get('off')?.split(',').includes('whaleyaw') ?? false; } catch { return false; } })();
type O = Parameters<typeof makeGlbCreature>[1];
import { eliteHd } from './elite_hd';   // v1.2.73 精英绑骨显示件优先
// fix1109b：比赛版有这个模型却拿不到（未就绪 / 解析失败）→ 报错再退回，不静默
export const luxMiss = (id: string) => console.error('Lux3D 怪物模型拿不到，退回程序化替身（未就绪或解析失败）', id);
export const luxOr = (id: string, o: O, fallback: () => unknown) => (): unknown => eliteHd(id) ?? (id in PACK_CREATURE_GLB ? makeGlbCreature(id, o) ?? (luxMiss(id), fallback()) : fallback());
const P = (emissive: number, emissiveK = 0.25) => ({ roughness: 0.75, emissive, emissiveK });
export const LUX_DLC: Record<string, O> = {
  dlc1_silent_monk: { height: 2.0, wave: 0.02, pbr: P(0x40c8d0, 0.15) },
  dlc1_rope_wraith: { height: 2.0, wave: 0.03, bob: 0.05, pbr: P(0x60e0f0, 0.35) },
  dlc1_bronze_puppet: { height: 1.5, wave: 0.02, pbr: P(0x50e0f0, 0.2) },
  dlc1_bell_colossus: { height: 3.9, wave: 0.015, pbr: P(0x50e8f0, 0.25) },
  dlc1_sleeper_a: { height: 4.3, wave: 0.015, pbr: P(0x40e0f0, 0.25) },
  dlc1_sleeper_b: { height: 4.5, wave: 0.015, pbr: P(0xff3040, 0.3) },
  // 11-18 Rhett「BOSS 正面反了，攻击是用尾巴，不是头」：yaw π/2 → −π/2，头朝 +Z（G鲸 绑骨 f 段 = 头，扑咬走头）；?off=whaleyaw 回旧朝向
  dlc1_tide_whale: { rig: 'G鲸', length: 7.5, yaw: whaleOld ? Math.PI / 2 : -Math.PI / 2, wave: 0.03, bob: 0.06, pbr: P(0x40c8d0, 0.25) },
  dlc1_mirror_knight: { rig: 'H', height: 2.1, wave: 0.015, pbr: { roughness: 0.35, metalness: 0.6, emissive: 0x40e0f0, emissiveK: 0.15 } },
  dlc1_mirror_captain: { rig: 'H', height: 2.3, wave: 0.015, pbr: { roughness: 0.3, metalness: 0.65, emissive: 0x40e0f0, emissiveK: 0.18 } },
};
export const lx = (id: string, fallback: () => unknown) => luxOr(id, LUX_DLC[id], fallback);

// v1.2.45 场景件：低画质 / 没有模型（商用 base 包）→ 回退程序化造景
import { makeGlbScene, preloadScenes } from '../../web/creatures_glb';
import './envhd_kinds';   // v1.2.49 场景件 PBR 细节层类别
void preloadScenes(PACK_CREATURE_GLB);
import { curQuality } from '../../web/gfx';
type SceneSize = Parameters<typeof makeGlbScene>[1]; type SceneOpt = Parameters<typeof makeGlbScene>[2];
export function sceneOr<T>(id: string, size: SceneSize, fallback: () => T, o?: SceneOpt): import('three').Group | T {
  if (curQuality === 'low' || !(id in PACK_CREATURE_GLB)) return fallback();
  return makeGlbScene(id, size, o) ?? fallback();
}
/** 倒挂：模型顶面挂在组原点（组 y 即挂点） */
export function sceneHang<T>(id: string, size: SceneSize, fallback: () => T, o?: SceneOpt): import('three').Group | T {
  // 11-14 dyn_world：倒挂件标 userData.dynHang（组原点 = 挂点），地图建好后 dynApply 自动让它随风摆 / 被碰到会晃
  const tag = <U>(x: U): U => { if (x && typeof x === 'object' && 'userData' in (x as object)) { const ud = (x as unknown as { userData: Record<string, unknown> }).userData; if (ud.dynHang === undefined) ud.dynHang = true; } return x; };
  const g = sceneOr(id, size, () => null as unknown as T, o) as unknown;
  if (!g) return tag(fallback());
  const grp = g as import('three').Group, m = grp.children[0] as import('three').Mesh;
  m.geometry.computeBoundingBox(); m.position.y = -(m.geometry.boundingBox!.max.y) * m.scale.y; return tag(grp);
}
/** 11-14d：场景件拿来做实例化（散落小钟等）：返回几何克隆（可改顶点）+ 材质 + 缩放（高度 h）；低画质 / 没模型 → null */
export function sceneInstSrc(id: string, h: number): { geo: import('three').BufferGeometry; mat: import('three').Material; k: number } | null {
  const g = sceneOr(id, { h }, () => null); if (!g) return null;
  const m = g.children[0] as import('three').Mesh; return { geo: m.geometry.clone(), mat: m.material as import('three').Material, k: m.scale.x };
}
