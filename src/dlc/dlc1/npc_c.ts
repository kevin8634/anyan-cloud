// ======================================================================
// v1.2.73 C 组 NPC 写实件（05 交 1105_v1273_NPC，Rhett 批）：墨言 / 伊奥拉 / 卡戎
//   05 交的是静态网格（无骨骼、无动作）→ 走 makeGlbCreature + 程序化绑骨（H / H袍 模板，待机呼吸、转身），同 DLC 怪物。
//   模型只在比赛版 assets_aholo/dlc1/creatures/dlc1_npc_*.glb（Loading 里 preloadScenes 一并解析 = 预载）；
//   商用构建 / 低画质 / 经典画风 → 钩子返回 null，回退原 KayKit / 回响装扮。
//   接入点：墨言 = 本体烬火堡垒 scholar（zones_wild.ts:358，包加载时把 model 改成 'Mage@npc_moyan'）+ 灰石营地 GATE_NPCS（coast_gate.ts）；
//           伊奥拉 / 卡戎 = 镜渊城 mirror.ts 'Mage@mr_iola' / 'Mage@mr_charon'（先试写实件，没有再走 plaza_dress 回响装扮）。
// ======================================================================
import { PLAYER_H } from './raid_well_rig';
import { iolaCardOn, makeIolaCard } from './iola_card';
import { iola3dOn, makeIola3d } from './iola_3d';   // 11-17 Rhett 导出的 Blender 3D 件
import { IOLA_FACE_ROUGH, IOLA_HAIR_VERT, IOLA_FACE_VERT, IOLA_FACE_NRM, IOLA_FACE_FRAG, IOLA_FACE, iolaFaceTex, iolaFilTex, smoothNormals } from './iola_look';   // fix1106 NPC 身高按玩家显示身高（2.31 米）比例
import * as THREE from 'three';
import { NPC_MODEL_HOOKS } from '../../web/chars';
import { makeGlbCreature, creatureReady } from '../../web/creatures_glb';
import type { Rig } from '../../web/models';
/** 不能静态 import models（会把游戏数据模块提前拉起 → 包注册太晚）：bind 阶段动态取 */
let makeNpcModel: ((model: string, tint?: number, k?: number) => Rig) | null = null;
import { PACK_CREATURE_GLB } from './creatures.gen';
import { curQuality } from '../../web/gfx';
import { fxTex } from './fx_kit';
import { wantHd } from '../../web/rig';
import type { RigTpl } from '../../web/procrig';

type N = { glb: string; height: number; rig: RigTpl; pbr: { keepMaps?: boolean; roughness?: number; metalness?: number; emissive?: number; emissiveK?: number }; ghost?: boolean; /** fix1106 ③ 辨识光：脚下光环颜色 */ halo: number };
// fix1107（Rhett 10:14：伊奥拉 / 卡戎 / 墨言身高要和玩家一样）：三人统一 = PLAYER_H 2.31 米（原 0.98 / 0.93 / 1.0 倍）
export const NPC_C: Record<string, N> = {
  // fix1106 ③：暗场景里写实件发黑看不清 → 贴图自发光托底（emissiveMap = 底色贴图，乘一层角色色调）+ 脚下光环
  npc_moyan: { glb: 'dlc1_npc_moyan', height: PLAYER_H, rig: 'H袍', pbr: { roughness: 0.75, metalness: 0.05, emissive: 0xb0a0ff, emissiveK: 0.16 }, halo: 0x9a86ff },
  mr_iola: { glb: 'dlc1_npc_iola', height: PLAYER_H, rig: 'H袍', pbr: { keepMaps: true, roughness: 0.6, metalness: 0.05, emissive: 0xffc860, emissiveK: 0.3 }, ghost: true, halo: 0xffc040 },   // Rhett 16:55：伊奥拉光效要黄色（原青色）
  mr_charon: { glb: 'dlc1_npc_charon', height: PLAYER_H, rig: 'H袍', pbr: { roughness: 0.7, metalness: 0.1, emissive: 0x9ad0ff, emissiveK: 0.14 }, halo: 0x6aa8d8 },
};
const hdQ = () => !!(globalThis as unknown as { __npcHd?: boolean }).__npcHd || (curQuality !== 'low' && wantHd());   // __npcHd：自查脚本低档也出写实 NPC（沙箱中档会 OOM）
const ok = (n: N) => n.glb in PACK_CREATURE_GLB && hdQ();

/** 有写实件就出写实 NPC，否则 null */
export function npcC(tag: string): unknown {
  const n = NPC_C[tag]; if (!n || !ok(n)) return null;
  const r = makeGlbCreature(n.glb, { height: n.height, wave: 0, bob: 0.004, rig: n.rig, pbr: n.pbr }); if (!r) return null;
  // 11-13 I03（Rhett 11-11「伊奥拉太小，约为玩家一半」，名牌 / 光效在正常身高处、模型本身只有一半）：生成时先按蒙皮后的真实高度把模型校到 n.height，
  //   不再只靠进场后的玩家身高适配（那一步要找到玩家才跑，找不到就一直是原尺寸）；光效在校正后再挂
  { const h0 = shownHeight(r.root, false); r.root.userData.spawnFix = `${h0.toFixed(2)}/${n.height.toFixed(2)}`; if (h0 > 0.3 && Math.abs(h0 / n.height - 1) > 0.08) r.root.scale.multiplyScalar(n.height / h0); }
  if (n.ghost) ghostFx(r.root, n.height / (r.root.scale.y || 1));
  // 11-13（Rhett 22:51「伊奥拉身高直接放大到原来的 2 倍，外围的光点保持不变」）：只放大人物本体（body 组，脚底为原点），光效组 iolaFx 挂在 root 上不跟着变；
  //   runFit 量高时除以 bodyK，按「未放大」的基准去和玩家同高，避免把这 2 倍又缩回去
  if (n.ghost) { r.body.scale.multiplyScalar(IOLA_BODY_K); r.root.userData.bodyK = IOLA_BODY_K;
    // 胸前钟光跟着本体胸口走（以前留在 1 倍身高的胸口 = 放大后的腰部，正好挡住本体，就是截图里那团亮光）
    const bl = r.root.getObjectByName('iolaBell'); if (bl) { bl.position.y *= IOLA_BODY_K; bl.position.z *= IOLA_BODY_K; }
    r.root.userData.labelH = n.height * IOLA_BODY_K + 0.35; }   // 11-14d 头顶「!」/ 名牌按放大后的身高（hudbar 默认固定 2.9 米 = 胸口）   // 11-08 伊奥拉 = 回响：照概念图做「金色光丝」——流动光脉 + 边缘光 + 胸前钟光 + 上飘金屑 + 脚下光晕
  else r.root.add(halo(n.halo));
  (NPC_ROOTS[tag] ??= []).push(r.root);
  r.root.userData.npcC = n.glb; fitQ.push(r.root); kickFit(); return r;
}

// 11-08（Rhett 00:24「伊奥拉等 3 个有模型的 NPC 大小还是不对，应该跟玩家一样身高」）：进场后实测玩家身高，按比例把 NPC 缩放到与玩家同高。
// fix1109c #2（Rhett 11-09 18:04「法师站在伊奥拉旁边，NPC 不够大；其他职业正常」）：原量法有两处错 ——
//   ① 玩家高度取 geometry.boundingBox × matrixWorld：Lux3D 职业模型是 KHR_mesh_quantization 蒙皮网格，顶点是 int16 归一化坐标、反量化在骨骼逆绑定矩阵里，
//      geometry 包围盒量的是「量化坐标」不是人的高度，每个模型偏得不一样（离线复刻 test/fix1109c_height.mjs：真实显示身高 2.28–2.43 米，
//      这种量法却得到 法师 2.70 / 战士 2.50 / 时砂 2.51 / 炼金 2.54 / 猎手 4.85 / 负棺 0.43 / 各 40 级整身件 4.5–4.8）→ NPC 比例随职业乱跳，
//      超出 0.4–3 倍的又直接不缩放（负棺、40 级件）；
//   ② 只量一次：选角背景（镜渊城）里 NPC 在 Loading 就生成，第一次量到的是选角台上的展示模型（展示放大 1.4 倍），进世界换成自己的职业 / 穿上 40 级整身件后不再重量。
//   改：玩家按蒙皮后顶点（applyBoneTransform，当前姿势）量真实显示高度；NPC 只量身体网格（不含脚下光环 / 伊奥拉光效组），按缩放 1 记一次基准高；
//      常驻 1 秒轮询，玩家模型换了（职业 / 套装整身 / 选角 → 世界）就把所有 NPC 重算一遍（缩放 = 原缩放 × 玩家高 / 基准高，不累乘）。
let playerPosFn: (() => { x: number; z: number }) | null = null;
export function setNpcPlayerPos(f: () => { x: number; z: number }) { playerPosFn = f; }
const fitQ: THREE.Object3D[] = [];
let fitTimer: ReturnType<typeof setInterval> | null = null, fitLog: { npc: string; player: number; npcH: number; k: number; who?: string }[] = [];
let fitKey: THREE.Object3D | null = null, fitKeyW = '', fitPH = 0;
(globalThis as Record<string, unknown>).__npcFit = () => fitLog;
function kickFit() { if (fitTimer) return; fitTimer = setInterval(runFit, 1000); }
const FX_NODE = (o: THREE.Object3D) => o.name === 'iolaFx' || o.name === 'npcHalo' || o.name === 'blob';
/** 蒙皮后的真实显示高度（世界坐标）：SkinnedMesh 逐顶点 applyBoneTransform；普通网格按 geometry 包围盒。skinnedOnly = 只量蒙皮网格（玩家） */
const v3 = new THREE.Vector3();
export function shownHeight(root: THREE.Object3D, skinnedOnly: boolean): number {
  // 11-16 伊奥拉根因：她的写实件（普通网格 8 万顶点）里有少量游离顶点落在脚下约 3.2 米处（世界 y -3.24，可见身体 0～3.23），
  //   旧版取包围盒 / 极值量高 = 量成两倍 → 身体只有设定的一半、名牌飘在两倍高处，且各图量到的游离点不同 → 大小不一。
  //   改为采样顶点后去掉两端 0.3% 的离群点
  root.updateWorldMatrix(true, true); const ys: number[] = [];
  const walk = (o: THREE.Object3D) => {
    if (FX_NODE(o) || !o.visible) return;
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh && !(m as unknown as THREE.Points).isPoints && (m.isSkinnedMesh || !skinnedOnly)) {
      const sk = m.isSkinnedMesh && m.skeleton; if (sk) m.skeleton.update();
      const p = m.geometry.attributes.position as THREE.BufferAttribute; const step = Math.max(1, Math.floor(p.count / 6000));
      for (let i = 0; i < p.count; i += step) { v3.fromBufferAttribute(p, i); if (sk) m.applyBoneTransform(i, v3); v3.applyMatrix4(m.matrixWorld); ys.push(v3.y); }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  if (ys.length < 8) return 0;
  ys.sort((x, y) => x - y);
  // 11-16b 根因补强：游离点不止 0.3%（各图姿势 / 绑骨不同，落在脚下的游离点数量不同 → 量高忽大忽小）。
  //   改为按高度断层分簇（断层 > 总跨度 6%），取样本最多的那一簇 = 身体本体，再去两端 0.3%
  const span = ys[ys.length - 1] - ys[0]; let bs = 0, be = ys.length, s0 = 0;
  for (let i = 1; i <= ys.length; i++) if (i === ys.length || ys[i] - ys[i - 1] > span * 0.06) { if (i - s0 > be - bs || (bs === 0 && be === ys.length && s0 === 0)) { bs = s0; be = i; } s0 = i; }
  const n = be - bs, cut = Math.floor(n * 0.003), lo = ys[bs + cut], hi = ys[be - 1 - cut];
  return n >= 8 && hi > lo ? hi - lo : 0;
}
function findPlayer(scene: THREE.Object3D): THREE.Object3D | null {
  const p = playerPosFn?.(); if (!p) return null; const v = new THREE.Vector3();
  const cand = scene.children.flatMap(c => [c, ...(c.type === 'Group' && !c.userData.npcC ? c.children : [])]);
  for (const c of cand) { if (c.userData.npcC || c.userData.npcHd) continue; c.getWorldPosition(v); if (Math.hypot(v.x - p.x, v.z - p.z) > 0.3) continue;
    let sk = false; c.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = true; }); if (sk) return c; }
  return null;
}
function runFit() {
  let scene: THREE.Scene | null = null;
  for (let i = fitQ.length - 1; i >= 0; i--) { let top: THREE.Object3D = fitQ[i]; while (top.parent) top = top.parent; if ((top as THREE.Scene).isScene) { scene = top as THREE.Scene; break; } }
  if (fitQ.length > 40) for (let i = fitQ.length - 1; i >= 0; i--) if (!fitQ[i].parent && fitQ[i].userData.npcFitPH !== undefined) fitQ.splice(i, 1);   // 卸掉的区域里量过的 NPC 不再留引用
  if (!scene) return;   // NPC 都还没进场景（或已离开）
  const pl = findPlayer(scene); if (!pl) return;
  const w = `${pl.uuid}|${pl.userData.want ?? ''}|${pl.userData.body40 ?? ''}|${pl.scale.y.toFixed(3)}`;
  if (pl !== fitKey || w !== fitKeyW) { const ph = shownHeight(pl, true); if (ph < 0.8 || ph > 6) return; fitKey = pl; fitKeyW = w; fitPH = ph;
    for (const r of fitQ) delete r.userData.npcFitPH; }   // 玩家模型换了 → 全部重算
  for (const r of fitQ) {
    if (r.userData.npcFitPH === fitPH) continue;
    let top: THREE.Object3D = r; while (top.parent) top = top.parent; if (top !== scene) continue;   // 不在当前场景的等进场再量
    if (r.userData.npcS0 === undefined) { r.userData.npcS0 = r.scale.x; const h = shownHeight(r, false) / (r.userData.bodyK ?? 1); if (h < 0.3) { delete r.userData.npcS0; continue; } r.userData.npcBaseH = h / r.scale.y; }
    const k = fitPH * (r.userData.fitMul ?? 1) / (r.userData.npcBaseH * r.userData.npcS0);
    if (!(k > 0.25 && k < 8)) { console.warn('写实 NPC 身高实测异常，未缩放', r.userData.npcC, fitPH, r.userData.npcBaseH); r.userData.npcFitPH = fitPH; continue; }
    r.scale.setScalar(r.userData.npcS0 * k); r.userData.npcFitPH = fitPH;
    if (r.userData.bodyK || r.userData.fitMul) r.userData.labelH = r.userData.npcBaseH * r.scale.y * (r.userData.bodyK ?? 1) + 0.35;   // fitMul 已乘进 k，不再重复   // 11-14d 名牌跟实际身高走
    fitLog.push({ npc: String(r.userData.npcC), player: +fitPH.toFixed(2), npcH: +(r.userData.npcBaseH * r.userData.npcS0).toFixed(2), k: +k.toFixed(3), who: String(pl.userData.cls ?? '') }); (globalThis as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log?.(`npcFit ${String(r.userData.npcC)} 玩家=${fitPH.toFixed(2)} NPC基准=${(r.userData.npcBaseH * r.userData.npcS0).toFixed(2)} k=${k.toFixed(3)} 终缩放=${r.scale.x.toFixed(3)} 生成校正=${String(r.userData.spawnFix ?? '-')}`); if (fitLog.length > 30) fitLog = fitLog.slice(-30);
  }
}

let haloTex: THREE.Texture | null = null;
/** fix1106 ③ 脚下柔光环（加色、不写深度、不投影）：远处也能一眼认出剧情 NPC */
/** 11-08：生成过的 NPC 根节点（按钩子 tag），副本里按地形抬高用（伊奥拉在钟井营地） */
export const NPC_ROOTS: Record<string, THREE.Object3D[]> = {};

// ---------------------------------------------------------------- 11-08 伊奥拉光效（Rhett 18:12「黄黄的，不像概念图那么靓丽」）
//   概念图（chars/npc_static/iola_front.png）：通身由金色发光丝线织成、亮处偏白、边缘发光、胸前小钟发光、身周飘金屑、脚下一圈光。
//   做法（0 费用，纯 shader + 粒子）：MeshStandard onBeforeCompile 改自发光 = 金色 ×（贴图亮度 + 沿衣褶向上流动的细光脉 + 菲涅尔边缘光），
//   亮部往白金走；身周 90 颗加色金屑上飘；胸口钟光精灵呼吸；脚下暖光晕 + 一盏小点光照亮火堆旁地面。uTime 由一个小网格 onBeforeRender 推进。
const GHOST_T = { value: 0 }; let ghostLast = 0;
/** ?off=<key> 或 localStorage darkrock_cine_off 里的回退开关 */
function cineOff(k: string): boolean {
  try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '', ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return `${q},${ls}`.split(',').map(x => x.trim()).includes(k); } catch { return false; }
}
/** 11-14 12:01 Rhett（沉钟海岸截图「完全看不到本体，光效不错，本体放大 2 倍，亮光稍淡，不要影响观察本体」）：本体 2 → 4 倍玩家身高基准（光效组不跟着放大）；
 *  自发光整体 ×0.45 且上限压在泛光阈值附近，胸前钟光 / 脚下光晕 / 点光减半，本体轮廓与衣褶能看清 */
// 11-14d Rhett 19:46（「伊奥拉过高了，回到之前然后放大 1.5 倍」）：4 → 2（之前）× 1.5 = 3
// 11-16b Rhett「先整一个正常高低对应玩家身高」：3 → 1（与玩家同高）；光点改为在身体外一圈（不挡脸）、同向慢转约 15–22 秒一圈、约 11–18 秒升一轮
const IOLA_BODY_K = 1, IOLA_GLOW = 0.45;
const IOLA_LOCK_H = 2.11;   // 镜渊城实测立片高度（玩家 2.11，k 0.915，11-17 交接）
let glowTex: THREE.Texture | null = null;
function glowSprite(): THREE.Texture {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.75)'); gr.addColorStop(0.6, 'rgba(255,170,60,0.18)'); gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(cv); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
// 11-17 静止姿态包围盒（去两端 0.2% 防游离顶点），给 IOLA_RECOLOR 分区用
function restBounds(g: THREE.BufferGeometry): [THREE.Vector3, THREE.Vector3] {
  const a = g.getAttribute('position'), n = a.count, lo = new THREE.Vector3(), hi = new THREE.Vector3(), v: number[] = new Array(n);
  for (let c = 0; c < 3; c++) { for (let i = 0; i < n; i++) v[i] = a.getComponent(i, c); v.sort((x, y) => x - y);
    lo.setComponent(c, v[Math.floor(n * 0.002)]); hi.setComponent(c, v[Math.min(n - 1, Math.ceil(n * 0.998))]); }
  return [lo, hi];
}
function ghostMat(m: THREE.MeshStandardMaterial, geo?: THREE.BufferGeometry) {
  if (geo && !geo.userData.iolaSmooth) { smoothNormals(geo); geo.userData.iolaSmooth = 1; }
  const rb = geo ? restBounds(geo) : null;
  // 11-14d Rhett「模型撕裂」+ 沉钟海岸「海面横带盖住伊奥拉」：原来 transparent + 不写深度 + 双面 → 同一网格内前后面乱序叠画（看着像撕碎），
  //   且海面（透明、renderOrder 2）后画时没有深度可挡，直接盖在她身上。改为不透明、写深度（opacity 原本 0.96，观感不变）
  m.transparent = false; m.opacity = 1; m.depthWrite = true; m.side = THREE.DoubleSide;
  m.emissive = new THREE.Color(0xffc46a); m.emissiveIntensity = 1; m.roughness = m.roughnessMap ? 0.85 : 0.55; m.metalness = m.metalnessMap ? 0.35 : 0.2;   // 11-16c 对照原件：底色不再压暗，粗糙 / 金属跟原件贴图走（金属压到 0.35，暗场景无环境反射时不发黑）
  const hasMap = !!m.map;
  m.onBeforeCompile = sh => {
    sh.uniforms.uGT = GHOST_T; sh.uniforms.uGTV = GHOST_T;
    if (rb) {   // 11-17 脸用概念图投影（见 iola_look.ts）
      sh.uniforms.uBMin = { value: rb[0] }; sh.uniforms.uBMax = { value: rb[1] }; sh.uniforms.uSpan = { value: rb[1].clone().sub(rb[0]) };
      sh.uniforms.uFace = { value: IOLA_FACE }; sh.uniforms.uFaceTex = { value: iolaFaceTex() }; sh.uniforms.uSpanV = sh.uniforms.uSpan; sh.uniforms.uFaceV = sh.uniforms.uFace; sh.uniforms.uFilTex = { value: iolaFilTex() };
      sh.vertexShader = 'uniform vec3 uBMin; uniform vec3 uBMax; uniform vec3 uSpanV; uniform vec3 uFaceV; varying vec3 vRest; varying vec3 vRestN; varying vec3 vFaceN; uniform float uGTV;' + (m.map ? ' uniform sampler2D map;' : '') + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = clamp((position - uBMin) / max(uBMax - uBMin, vec3(1e-4)), -0.2, 1.2); vRestN = normal;\n' + IOLA_FACE_VERT + (m.map ? IOLA_HAIR_VERT : ''));
      sh.fragmentShader = 'uniform vec3 uSpan; uniform vec3 uFace; uniform sampler2D uFaceTex; uniform sampler2D uFilTex; varying vec3 vRest; varying vec3 vRestN; varying vec3 vFaceN; float iolaFace; float iolaGlow;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  iolaFace = 0.0;\n' + IOLA_FACE_FRAG).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  ' + IOLA_FACE_NRM).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  ' + IOLA_FACE_ROUGH);
    } else sh.fragmentShader = 'float iolaFace; float iolaGlow;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  iolaFace = 0.0; iolaGlow = 0.0;');
    sh.fragmentShader = 'uniform float uGT;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // 11-16c 对照原件重做：原件是暖金铜色、五官和衣褶清楚。自发光改为「贴图本色 × 0.22」托底（暗场景里也看得见、细节不被冲白）
        //   + 很淡的轮廓光；流动金丝只在衣服上（贴图坐标 → 改用法线朝向无关的弱化版本，强度降到原来约 1/4），不再整身发白
        vec2 uv = ${hasMap ? 'vMapUv' : 'vec2(0.5)'};
        float w = sin(uv.y * 46.0 - uGT * 1.7 + sin(uv.x * 19.0 + uGT * 0.6) * 2.4) * 0.5 + 0.5;
        float vein = smoothstep(0.9, 1.0, w);
        vec3 V = normalize(vViewPosition);
        float fr = pow(1.0 - abs(dot(normalize(normal), V)), 3.0);
        vec3 base = diffuseColor.rgb;
        totalEmissiveRadiance = base * ((0.18 + 0.55 * iolaGlow * iolaGlow) * (1.0 - iolaFace) + 0.2 * iolaFace) + vec3(1.0, 0.78, 0.42) * (fr * 0.16 + vein * 0.05) * (1.0 - iolaFace);   // 11-17 丝线亮处自发光（概念图的发光丝线）
      }`);
  };
  m.customProgramCacheKey = () => 'iolaGhost' + (hasMap ? 1 : 0) + (rb ? 'r' : '');
  m.needsUpdate = true;
}
function ghostFx(root: THREE.Object3D, H: number) {
  root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if ((o as THREE.Mesh).isMesh && m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) ghostMat(m, (o as THREE.Mesh).geometry); });
  const fx = new THREE.Group(); fx.name = 'iolaFx'; root.add(fx);
  let lockedH: (() => number) | null = null;   // 11-17 Rhett「粒子效果可以跟她一样高」：3D 件 / 立片锁了世界高度时，金屑按同一高度走（fx 本地单位）
  // 脚下光晕
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(H * 1.1, H * 1.1), new THREE.MeshBasicMaterial({ map: glowSprite(), color: 0xffcf80, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; pool.renderOrder = 3; fx.add(pool);
  // 胸前钟光
  // 11-14d Rhett「伊奥拉胸前的钟用 GPT」：光团贴图 → gpt-image-2 金丝小钟（icons/npc_iola_bell.jpg）；没图回退光团
  const bellTex = fxTex('npc_iola_bell');
  const bell = new THREE.Sprite(new THREE.SpriteMaterial({ map: bellTex ?? glowSprite(), color: bellTex ? 0xffffff : 0xfff0d0, transparent: true, depthWrite: false, depthTest: !bellTex,   // 本体已改不透明写深度：小钟不做深度测试，免得被胸口吃掉
    blending: THREE.AdditiveBlending, fog: false }));
  bell.position.set(0, H * 0.72, H * 0.07); bell.scale.setScalar(H * 0.16); bell.name = 'iolaBell'; bell.renderOrder = 4; fx.add(bell);
  // 点光：照亮身旁地面与火堆边（低画质不加）
  if (curQuality !== 'low') { const L = new THREE.PointLight(0xffc070, 0.35, H * 3.2, 1.8); L.position.set(0, H * 0.25, 1.2); fx.add(L); }   // 11-16b 点光减半、移到身前低处：照地面，不把本体打白
  // 11-17 灵体立片（见 iola_card.ts）：网格不画但保留（量身高 / 名牌 / 适配缩放仍按网格），胸前小钟由立片图里自带
  if (iola3dOn()) {
    // 11-17 13:00 Rhett 从 Blender 导出伊奥拉 3D（毛发版）→ 替代立片：原网格不画，模型挂 fx；世界高度锁 = 玩家实测身高（同立片规则，各地同高）
    root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.parent !== fx && !FX_NODE(o)) { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.visible = false; } });
    const m3 = makeIola3d(); fx.add(m3.group); bell.visible = false;
    const v = new THREE.Vector3();
    // 11-18 修（Rhett「镜渊城伊奥拉又大了一倍」）：下面两句以前被写进了上一行的注释 → v 一直是 0 → 没除掉区域 root 缩放，
    //   世界高度 = 锁高 × 该区域 NPC 适配缩放（镜渊城约 2 倍，海岸约 1）
    pool.onBeforeRender = () => { if (!m3.ready()) return;   // 脚下光晕每帧都画（frustumCulled 默认，和人物同位），借它做每帧锁高
      fx.updateWorldMatrix(true, false); fx.getWorldScale(v);
      const want = fitPH > 0.8 && fitPH < 6 ? fitPH : IOLA_LOCK_H, k = want / (m3.baseH() * (v.y || 1));
      if (Math.abs(m3.group.scale.y - k) > 1e-3) m3.group.scale.setScalar(k);
      m3.group.position.y = 0.04 * want * Math.sin(GHOST_T.value * 1.1) / (v.y || 1); };   // 灵体缓慢浮动
    lockedH = () => { fx.updateWorldMatrix(true, false); fx.getWorldScale(v); return (fitPH > 0.8 && fitPH < 6 ? fitPH : IOLA_LOCK_H) / (v.y || 1); };
  } else if (iolaCardOn()) {
    root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.parent !== fx && !FX_NODE(o)) { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.visible = false; } });
    const card = makeIolaCard(H, GHOST_T); fx.add(card); bell.visible = false;
    // 11-17 Rhett「沉钟海岸伊奥拉高度不对就用镜渊城的」：立片按世界高度锁死 = 玩家实测身高（未量到时 2.11 = 镜渊城实测值），
    //   不再随该区域 root 缩放走（回退件 / 进场前 / 不同分包时机都一样高），各地伊奥拉同高
    const v = new THREE.Vector3();
    (card.children[1] as THREE.Mesh).onBeforeRender = () => { card.parent?.updateWorldMatrix(true, false); card.parent?.getWorldScale(v);
      const want = fitPH > 0.8 && fitPH < 6 ? fitPH : IOLA_LOCK_H, s = want / (H * (v.y || 1)); if (Math.abs(card.scale.y - s) > 1e-3) card.scale.setScalar(s); };
    lockedH = () => { card.parent?.updateWorldMatrix(true, false); card.parent?.getWorldScale(v); return (fitPH > 0.8 && fitPH < 6 ? fitPH : IOLA_LOCK_H) / (v.y || 1); };
  }
  // 上飘金屑
  const N = curQuality === 'high' ? 240 : 140,   // 11-17 Rhett「粒子数再多一倍」
    pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = H * (0.3 + Math.random() * 0.22); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = Math.sin(a) * r; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uGT: GHOST_T, uH: { value: H }, uTex: { value: glowSprite() } },
    vertexShader: `uniform float uGT; uniform float uH; attribute float seed; varying float vA;
      void main() { vec3 p = position; float t = fract(seed + uGT * (0.12 + seed * 0.06)); /* 11-17 Rhett「光点旋转起来」：约 6–8 秒升一轮 */ p.y = mod(position.y + t * uH, uH * 1.15);
        // 11-13 Rhett「让光点动起来」：上升加快（约 3–5 秒一轮）+ 绕身体螺旋公转 + 半径呼吸
        float ang = uGT * (0.95 + seed * 0.45) + p.y / uH * 1.6,   /* 11-17 约 4.5–6.5 秒绕身一圈 */ ca = cos(ang), sa = sin(ang);
        float rr = 1.0 + 0.08 * sin(uGT * 0.6 + seed * 30.0);
        p.xz = vec2(ca * p.x - sa * p.z, sa * p.x + ca * p.z) * rr;
        p.x += sin(uGT * 1.7 + seed * 20.0) * 0.03 * uH; p.z += cos(uGT * 1.4 + seed * 13.0) * 0.03 * uH;
        vA = smoothstep(0.0, 0.15, p.y / uH) * (1.0 - smoothstep(0.75, 1.15, p.y / uH)) * (0.85 + 0.15 * sin(uGT * 1.6 + seed * 40.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min((3.0 + seed * 4.5) * (300.0 / -mv.z), 18.0); vA *= smoothstep(0.6, 2.2, -mv.z); }   // 11-16c 镜头贴近时光点不再放大成整片橙带`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main() { vec4 c = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * 2.2 * c.rgb, min(1.0, c.a * vA * 1.4)); /* 11-17 Rhett「让他周身亮起来」 */ }` });
  const pts = new THREE.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 5; fx.add(pts);
  // 时间推进（不依赖外部 update）
  const ptsTall = !cineOff('iolafxh');
  pts.onBeforeRender = () => { if (ptsTall && lockedH) { const h = lockedH() * 1.1; if (h > 0.1 && Math.abs(pm.uniforms.uH.value - h) > 1e-3) pm.uniforms.uH.value = h; }   // 渐隐段在 0.75–1.15，乘 1.1 让亮段到头顶
    const now = performance.now(), dt = ghostLast ? Math.min(0.1, (now - ghostLast) / 1000) : 0; ghostLast = now; GHOST_T.value += dt;
    const b = 0.4 + 0.08 * Math.sin(GHOST_T.value * 2.1); bell.material.opacity = b; pool.material.opacity = 0.22 + 0.05 * Math.sin(GHOST_T.value * 1.3); /* 11-17 脚下光晕加亮 */ };
}

function halo(color: number) {
  if (!haloTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    if (g) { const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    haloTex = new THREE.CanvasTexture(cv); haloTex.colorSpace = THREE.SRGBColorSpace; }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: haloTex, color, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 2; m.name = 'npcHalo'; m.castShadow = m.receiveShadow = false; return m;
}

/** fix1106 ③ 根因：营地 / 镜渊城（选角背景）的 NPC 在 Loading 里就生成，那时写实件所在的分包还没解析完 → 钩子返回 null 永远停在 Q 版。
 *  现在：写实件「会来但还没到」时先给回退模型，等分包解析完把写实件挂进同一个 Rig（原回退子物体隐藏，body / anim 换成写实件的），NPC 引用不用换 */
const pending = (n: N) => n.glb in PACK_CREATURE_GLB && hdQ() && !creatureReady(n.glb);
function withLate(tag: string, fallback: () => Rig | null): Rig | null {
  const r = npcC(tag) as Rig | null; if (r) return r;
  const n = NPC_C[tag]; if (!n || !pending(n)) return null;
  if (!makeNpcModel) return null;
  console.error(`写实 NPC ${n.glb} 在 Loading 结束时还没解析，用回退模型（不再进场后换装）`);
  const fb = fallback(); if (fb) { (NPC_ROOTS[tag] ??= []).push(fb.root);
    // 11-14（Rhett 01:34「伊奥拉等 NPC 在不同区域的大小要和镜渊城一样大」）：回退模型以前不进身高适配，镜渊城以外的区域分包没解析完时就是原尺寸 Q 版；
    //   现在同样进 runFit 按玩家身高校正，伊奥拉（回响）回退件按镜渊城本体的 2 倍补乘（fitMul）
    if (n.ghost && (iola3dOn() || iolaCardOn())) ghostFx(fb.root, n.height);   // 11-17 回退件也换成同一张立片（高度由立片自锁），不再露出 Q 版法师
    if (n.ghost) fb.root.userData.fitMul = IOLA_BODY_K; fb.root.userData.npcC = n.glb + '#fb'; fitQ.push(fb.root); kickFit(); }
  return fb;   // fix1106：去掉 lateSwap 运行时换装，模型在 Loading 内解析（creatures_glb loadCreatures 120 秒）
}

type Hook = typeof NPC_MODEL_HOOKS[string] & { npcC?: true };
/** 幂等：manifest 加载时调一次，plazaBind（重注册 mr_* 回响装扮钩子）之后再调一次 → 套在最外层 */
export function bindNpcC() {
  NPC_MODEL_HOOKS.npc_moyan = (_kit, tint, kk, base) => withLate('npc_moyan', () => makeNpcModel!(base ?? 'Mage', tint, kk));
  for (const k of ['mr_iola', 'mr_charon']) { const prev = NPC_MODEL_HOOKS[k] as Hook | undefined; if (prev?.npcC) continue;
    const h: Hook = (kit, tint, kk, base) => withLate(k, () => (prev?.(kit, tint, kk, base) as Rig | null) ?? makeNpcModel!(base ?? 'Mage', tint, kk)) ?? prev?.(kit, tint, kk, base) ?? null; h.npcC = true; NPC_MODEL_HOOKS[k] = h; }
}
/** 本体烬火堡垒墨言（zones_wild.ts:358）：包注册时不能静态 import 本体数据（挂点 wilds 会被提前读取）→ bind 阶段动态取 */
export function patchScholar() {
  void import('../../web/models').then(m => { makeNpcModel = m.makeNpcModel; }).catch(e => console.warn('NPC 回退模型取不到', e));
  void import('../../data/zones_wild').then(m => { for (const w of Object.values(m.WILD)) for (const n of w.npcs ?? []) if (n.id === 'scholar' && n.model === 'Mage') n.model = 'Mage@npc_moyan'; }).catch(e => console.warn('墨言换模型出错', e));
}
