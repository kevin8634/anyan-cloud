// ======================================================================
// DLC1 沉钟海岸 · v1.2.71 场景总装：地面材质替换 / 海面 / 天空天气 → 每帧驱动（潮汐联动、镜头跟随、光照）
//   build：coast.ts build(api) 末尾调用（区域组由本体创建，这里通过 api.add 的父节点拿到组）
//   update：manifest update 每帧调用（不在海岸时只做一次还原）
// ======================================================================
import * as THREE from 'three';
import type { PackCtx, WildBuildApi } from '../../core/ContentPacks';
import { curQuality } from '../../web/gfx';
import { COAST_HALF, reefW, shoreD, A_POOLS, POOL_Y, SEA_Y } from './coast_layout';
import { swapTerrain, floorU } from './coast_floor';
import { seaBuild, seaUpdate, seaU, seaStats, camPos, seaWade } from './coast_sea';
import { shipBuild, shipUpdate, shipStats } from './coast_ship';   // 11-18 B7 巡航船尾浪（?off=shipwake）
import { skyBuild, skyUpdate, skyU, skyStats, fogOrigin, bindScene, lightApply, lightRestore } from './coast_sky';
import { tideNow } from './tide';
import { kitU } from './coast_kit';
import { dressBuild, dressUpdate, dressStats, dressRT, beamAngle } from './coast_dress';
import { stormUpdate, stormLeave, stormDebug, stormRT, strikeNow } from './coast_storm';
import { BEAM_O, zoneAt } from './coast_layout';
import { coastAudioUpdate, coastAudioDebug } from './coast_audio';
import { seaSkyOn, seaSkyTick, seaSkyHook, seaSkyLeave, seaSkyApi, ssU, ssFog } from './coast_seasky';   // 11-15 海天 v2

export const COAST71 = { id: 'dlc1_coast', O: { x: 2400, z: -2400 } };
let root: THREE.Group | null = null, floor: THREE.Mesh | null = null, builtQ = '';
let wasHere = false, T = 0, v2 = false;
const STORM_TOP = new THREE.Color(0x0b0f12);
export const sceneState = { here: false, storm: 0, flash: 0, wind: 0.15, rain: 0, reef: 0, tide: 0, zone: 'A' as 'A' | 'B' | 'C' };

export function coastSceneBuild(api: WildBuildApi) {
  const mk = new THREE.Object3D(); api.add(mk, 0, 0); const grp = mk.parent; grp?.remove(mk);
  if (!grp) return;
  COAST71.O = { ...api.origin };
  floor = swapTerrain(grp, COAST_HALF);
  root = new THREE.Group(); root.name = 'coast71'; grp.add(root);
  builtQ = curQuality; v2 = seaSkyOn();
  try { seaBuild(root, api.origin); } catch (e) { console.error('沉钟海岸海面出错', e); }
  try { skyBuild(root); fogOrigin(api.origin); } catch (e) { console.error('沉钟海岸天空出错', e); }
  try { dressBuild(api, root); } catch (e) { console.error('沉钟海岸造景出错', e); }
  try { shipBuild(root, api.origin); } catch (e) { console.error('沉钟海岸巡航船出错', e); }
  noOutline(root);
}
/** 本体描边效果（OutlineEffect）按材质 userData 判断：天空 / 海面 / 雨 / 写实造景都不描边 */
function noOutline(o: THREE.Object3D) { o.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.userData.outlineParameters = { visible: false }; }); }); }

/** 每帧（manifest.update） */
export function coastSceneUpdate(dt: number, ctx: PackCtx | null) {
  const here = !!root && !!ctx && ctx.map() === COAST71.id;
  sceneState.here = here;
  if (!here) { if (wasHere) { lightRestore(); stormLeave(); seaSkyLeave(); wasHere = false; } coastAudioUpdate(dt, ctx, { ...sceneState, here: false }); return; }
  wasHere = true; T += dt;
  for (const u of [floorU.csTime, seaU.uTime, skyU.uTime, kitU.uTime]) u.value = T;
  bindScene(root!);
  const p = ctx!.playerPos(), lx = p.x - COAST71.O.x, lz = p.z - COAST71.O.z;
  const tide = tideNow().level; sceneState.tide = tide;
  floorU.csTide.value = tide; seaU.uTide.value = tide;
  // 礁湾雾权重（平滑）
  sceneState.reef += (reefW(lx, lz) - sceneState.reef) * (1 - Math.exp(-dt / 2.5)); skyU.uReef.value = sceneState.reef;
  const cam0 = camPos.lengthSq() ? camPos : new THREE.Vector3(p.x, 10, p.z + 10);
  const st = stormUpdate(dt, lx, lz, cam0, COAST71.O);
  const S = sceneState; S.storm = st.storm; S.flash = st.flash; S.wind = st.wind; S.rain = st.rain; S.zone = zoneAt(lx, lz);
  // 灯塔光束方向（两道相背，shader 里取 |along|）
  const ca = Math.cos(beamAngle), sa = -Math.sin(beamAngle);
  seaU.uBeam.value.set(BEAM_O.x, BEAM_O.z, ca, sa); floorU.csBeam.value.set(BEAM_O.x, BEAM_O.z, ca, sa);
  seaU.uBeamOn.value = 0.45 + 0.9 * S.storm; floorU.csBeamOn.value = 0.15 + 0.85 * S.storm;
  dressUpdate(dt, T, S.wind, S.storm);
  if (dressRT.beamMat) dressRT.beamMat.uniforms.uFlash.value = S.flash;   // 11-15 海天 v3：闪电瞬间压过光束
  floorU.csWet.value = S.storm; floorU.csFlash.value = S.flash * (v2 ? 0.15 : 1); floorU.csSurge.value = 0.4 + S.storm * 0.6;   // v4 海天：地面不随闪电整片提亮
  seaU.uStorm.value = S.storm; seaU.uFlash.value = S.flash; skyU.uStorm.value = S.storm; skyU.uFlash.value = S.flash;
  kitU.uWind.value = S.wind;
  // 海面反射的天空色跟着风暴压暗
  seaU.uSky.value.copy(skyU.uHorizon.value); seaU.uSkyTop.value.setHex(0x46535a).lerp(STORM_TOP, S.storm);
  const cam = cam0;
  skyUpdate(cam, S.rain, S.wind * (S.storm > 0.05 ? 1 : 0.3));
  seaUpdate(dt, cam);
  shipUpdate(dt, cam);
  { // 11-16 涉水：海里 / 潮池里走动 → 涟漪环 + 小水花（Rhett「海岸的水走上去要有碰撞感，像镜渊城」）
    const py = (p as { y?: number }).y ?? 0;
    const inSea = shoreD(lx, lz) > -0.8 && py < SEA_Y + tide * 0.3 + 0.5;
    const inPool = !inSea && py < POOL_Y + 0.45 && A_POOLS.some(([x, z, rx, rz, r]) => { const dx = lx - x, dz = lz - z, c = Math.cos(r), s = Math.sin(r), u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz; return u * u + v * v < 1; });
    seaWade(dt, lx, lz, inSea || inPool, inSea);
  }
  if (v2) {   // 11-15 海天 v2：钟点 → 太阳 / 月亮 / 天色；平行光方向 + cine 共享天色在渲染前写（scene.onBeforeRender）
    let sc: THREE.Object3D = root!; while (sc.parent) sc = sc.parent;
    const scn = (sc as THREE.Scene).isScene ? sc as THREE.Scene : null;
    const fogFar = (scn?.fog as THREE.Fog | null)?.far ?? 175;
    const dir = seaSkyTick(dt, S.storm, S.reef, S.wind, fogFar);
    seaSkyHook(scn, dir);
    ssU.ssFlash.value = S.flash; ssU.ssFlashD.value.copy(skyU.uFlashDir.value);
    seaU.uSun.value.copy(ssU.ssSunD.value);
  }
  lightApply(S.storm, S.flash, S.reef, v2 ? ssFog : undefined);
  if (v2) {   // 贴地海雾片跟最终雾色（含风暴 / 礁湾 / 闪光）走，夜里不再发灰白
    let sc: THREE.Object3D = root!; while (sc.parent) sc = sc.parent;
    const fc = ((sc as THREE.Scene).fog as THREE.Fog | null)?.color ?? ssFog;
    skyU.uMistC.value.setRGB(Math.min(0.78, fc.r * 1.35), Math.min(0.82, fc.g * 1.35), Math.min(0.85, fc.b * 1.35));
  }
  try { coastAudioUpdate(dt, ctx, S); } catch (e) { console.error('沉钟海岸环境声出错', e); }
}
export const coastSceneDebug = () => ({ built: !!root, q: builtQ, seasky: v2 ? seaSkyApi.debug() : null, floor: !!floor && floor.name === 'coast_floor', sea: { ...seaStats }, ship: { ...shipStats }, sky: { ...skyStats }, ...sceneState,
  stormRT: stormDebug(), dress: { A: dressStats.A.join(), B: dressStats.B.join(), C: dressStats.C.join(), inst: dressStats.inst, instCount: dressStats.instCount, meshes: dressStats.meshes, lights: dressRT.lights.length },
  audio: coastAudioDebug(),
  beam: dressRT.beam ? { angle: +beamAngle.toFixed(3), k: +(dressRT.beamMat?.uniforms.uK.value ?? 0).toFixed(2), on: +seaU.uBeamOn.value.toFixed(2), visible: dressRT.beam.visible } : null,
  objs: root ? root.children.map(o => o.name).filter(Boolean) : [] });
/** 调试 / 测试：强制风暴（null = 按位置）、立刻打闪电 */
export const coastStormApi = { force: (k: number | null) => { stormRT.forced = k; }, snap: (k: number) => { stormRT.storm = k; }, flashNow: () => { strikeNow(camPos.lengthSq() ? camPos : new THREE.Vector3(COAST71.O.x, 10, COAST71.O.z), COAST71.O); } };
