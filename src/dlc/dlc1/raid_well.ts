// ======================================================================
// DLC1 长副本 A「潮渊钟井」（40 级，5 首领）—— v1.2.69-A1 骨架（未来开发报告 v5 第 11 节）
// 全程向下：井口码头 → 半淹礼拜堂 → 冰封湖面 → 黑水两岸 → 井底三层。螺旋栈道一圈圈往井心收，中央悬着那口裂钟。
// 走本体通用小副本接口 PackManifest.dungeons（web/packdungeon.ts）：四档难度 + 40 级同步 + 遗物 / 异变 / 誓约 / 计时奖牌。
//   报告里的「标准 / 炼狱」= 这里的 普通–史诗 / 噩梦（噩梦多机制门槛）。
// 区域机制「潮汐」：每 60 秒涨落一次；涨潮时西侧低栈道被淹（站在水里每秒 -2% 生命）；首领战中不涨潮。
// A6：西侧低栈道南北两头各一座钟笼升降梯，连着一条跨过涨潮区的高架栈道（离地 7 米）——涨潮时坐笼上去走高处绕开水面。
// 机制门槛（PackDungeonGate）：溺潮女巫 40%「潮葬」（3 盏灵魂灯笼 25 秒）、深潮之喉 70%「撞台」/ 35%「钟锤锁链」。
// 入口：沉钟海岸 · 锈锚码头井口（运行时追加到 COAST_WILD.dungeonGates）；钟楼东侧临时锈梯已删（Rhett 11-07）；
//   合并沉钟海岸升级后改到锈锚码头的井口升降笼。
// 首领模型 A1 先用现有 DLC 模型换色；Lux3D 写实首领（已批约 400 积分）在后续版本替换。
// ======================================================================
import { tileMat } from '../../web/tiletex';   // fix1106 无缝贴图
import { waterUp, waterBind, waterRipple } from './water_fx';
import { iceSlab } from './liquid_shape';   // 11-15 冰湖不规则岸线   // 11-07 统一水体六条；11-15 涟漪
import { curQuality } from '../../web/gfx';
import { iceUp } from './well_wet_hd';   // 11-15 钟井四件套
import * as THREE from 'three';
import type { PackCtx, PackDungeonDef, PackDungeonBoss, WildBuildApi } from '../../core/ContentPacks';
import type { BossDef } from '../../core/BossBrain';
import { BT_ID } from './belltower';
import { wellArcadeHd, wellArcadeEnsure } from './well_arcade_hd';   // 11-07 #15 回廊砖拱 + 栈道栏杆（GPT + 代码）
import { weekKey } from '../../data/raid_molten';
import type { QuestDef } from '../../core/Quest';
import { COAST_ID, COAST_O, COAST_WILD } from './coast';   // fix1107 BUG#1 海岸井口入口
import { bellGeo } from './models_bt';
import { rollEchoDrop, ECHO_DROP_TABLE } from './echomark';
import { s40Roll, s40ForgeChance, s40WellChance, S40_SETS, S40_BY_CLASS } from './sets40';   // fix1106 钟井掉 40 级套装
import { DARK_BY_CLASS, BT_DARK_CHANCE, LEGENDARIES_40B } from './gear40';
import { LEGENDARIES_40 } from './legendaries40';
// fix1108 #3：不再静态 import data/loot（会在包注册前求值 zones_wild，冻结 wilds 挂载点 → installPack 抛「注册太晚」，DLC 启动即崩）；改在 bindWell 里动态加载
import type { LootTable } from '../../core/Loot';   // fix1106 钟井尾王暗金 8%
import { WL_BODY, wlBossModel, bindWellRig, bellSwing, wlHeight, WL_BUILT, PLAYER_H, WL_MOVE_NAMES, WL_MOVE_R, WL_RIG_OPT, warnLog, wlFallbackNote, rwTick, hideRaidWarn, rwDodgeInteract, raidWarnInfo, wellWholePose, liftDecals } from './raid_well_rig';
import { SKILL_FX } from './boss_fx';
import { sceneOr } from './lux_dlc';
import { sceneMode, dockHd, dockGradeTick, dockGradeInfo, wellRC, quality as wellQ } from './well_dock_hd';
import { lightPoolInstall, lightPoolReset } from './well_lightpool';   // 11-18 点光源池
import { wellAtmoBuild, wellAtmoTick } from './well_atmo';   // 11-18 opt1118C #7 区域氛围
import { wellGround, wellSolid, WELL_ROUTE } from './well_terrain';
import { wellRouteHd, wellTilesEnsure } from './well_route_hd';
import { NPC_ROOTS } from './npc_c';
import { DOCK_EAST, DOCK_SPLIT } from './well_dock_hd';
import { CHAN, CHAN_ON } from './well_terrain';
import { wellStairs } from './well_stairs';   // 11-18   // 11-18 生死渡河道下切
import { DOCK } from './well_terrain';
import { wellDepthHd, wellDepthTick } from './well_depth_hd';
import { wellZonesHd } from './well_zones_hd';
import { bindTwins, twinBind, twinsTick, twinsInfo, twinsMendNow, TWIN, TWIN_BANK } from './ferry_twins';
import { bossGlbInfo, bossGlbEnsure, bossGlbWarm } from './boss_glb';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { DLC1_MODELS } from './models';
import { BT_MODELS } from './models_bt';
import { campDressFor, campDressBind } from './plaza_dress';
import { CAMP_LAND } from './camp_land';
import { makeSarinLamp, sarinLampHdOn, type SarinLampFx } from './sarin_lamp_hd';   // 11-16 鱼油灯：营地船灯柱 + 摆动 + 光影光圈   // fix1109 #4

// ---------------------------------------------------------------- 首领模型：比赛版用 Lux3D 写实模型（assets_aholo/dlc1/creatures/wl_*.glb，10-31 批约 400 积分），
// 商用 base 包没有就回退到现有 DLC 模型（换色由 mob.tint 做）
// A7：6 个首领一律程序化蒙皮 + 程序化动作（raid_well_rig.ts / boss_rig.ts；Lux3D 自动绑骨对动作姿势模型失败），低画质 / base 包 = 整体动作兜底
export const wlHasGlb = (id: string) => id in PACK_CREATURE_GLB;
const FB = { ...DLC1_MODELS, ...BT_MODELS } as Record<string, () => unknown>;
export const WELL_MODELS: Record<string, () => unknown> = Object.fromEntries(Object.entries(WL_BODY).map(([id, o]) => [id, wlBossModel(id, () => FB[o.fb]?.())]));
// A8 摆渡双子：本体 Enemy 构造时 anim.bindUnit(本单位) → 登记给双首领机制（ferry_twins.ts）
for (const id of ['wl_ferry_death', 'wl_ferry_life']) {
  const f = WELL_MODELS[id];
  WELL_MODELS[id] = () => { const r = f() as { anim?: { bindUnit?(u: unknown): void } } | null; const a = r?.anim;
    if (a?.bindUnit) { const ob = a.bindUnit.bind(a); a.bindUnit = (u: unknown) => { ob(u); twinBind(id, u); }; }
    return r; };
}
/** 首领体型：mob.scale（碰撞 / 推挤 / 特效尺度）与攻击距离随身高放大 */
const BODY = (id: keyof typeof WL_BODY) => ({ scale: WL_BODY[id].scale });
/** 机制核心（灵魂灯笼 / 钟锤锁链）：Lux3D 场景件做成不动的「怪」，没有就回退原模型 */
const propRig = (scene: string, h: number, fb: () => unknown, glowC: number) => () => {
  const g = sceneOr(scene, { h }, () => null, { emissiveK: 0.6 }) as THREE.Group | null; if (!g) return fb();
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); g.position.y = 0.4; body.add(g);
  const l = new THREE.PointLight(glowC, 3, 9); l.position.y = h * 0.55; body.add(l);
  let ph = Math.random() * 6;
  return { root, body, legs: [], scale: 1, flash: [], tick: (dt: number) => { ph += dt * 1.6; body.rotation.y += dt * 0.4; body.position.y = Math.sin(ph) * 0.12; l.intensity = 2.5 + Math.sin(ph * 2) * 0.8; } };
};
WELL_MODELS.wl_lantern_core = propRig('scene_wl_lantern', 2.2, () => FB.dlc1_lantern_moth?.(), 0x60ffd0);
WELL_MODELS.wl_hammer_core = propRig('scene_wl_chain_hammer', 3.4, () => (FB.golem ?? FB.dlc1_bell_sentinel)?.(), 0x50f0e0);
/** 有写实模型就不换色 */
const skin = (id: string, tint: number, tintK: number, glow?: number) => (wlHasGlb(id) ? { model: id } : { model: id, tint, tintK, ...(glow ? { glow } : {}) });

export const WELL_MAP = 'dlc1_well';
export const WELL_DG = 'dlc1_well_dg';
export const WELL_O = { x: 2700, z: -2700 };
/** 临时入口：钟楼脚下营地东侧（局部坐标） */
// WELL_GATE_BT（钟楼东侧临时门 34,50）已删，11-07
/** fix1107 BUG#1 海岸井口门（沉钟海岸局部坐标；井台中心 112,-5.5，内圈 4.3、外圈 7.4，南支栈桥从 z=3 接上来） */
export const WELL_GATE_COAST = { x: 112, z: 0.3 };
// fix1107（Rhett 10:28：按长副本规则）：只用 英雄 = 标准（装等 85）/ 噩梦 = 炼狱（装等 90）两档，另两档保留占位不再开放
export const WELL_ILVL: [number, number, number, number] = [85, 85, 88, 90];
/** 报告第 11 节的标准数值记在 mob 上；四档倍率（噩梦 ≈ 报告「炼狱」×1.5） */
export const WELL_MUL: [number, number, number, number] = [1.0, 1.1, 1.25, 1.5];
export const WELL_SYNC = { level: 40, hp: 3560, dmg: 140 };
/** 潮汐：周期 / 涨潮时长 / 被淹区每秒扣血比例 */
export const TIDE = { every: 60, high: 20, drain: 0.02 } as const;
/** 11-07 伊奥拉隐藏任务（Rhett 17:09 拍板）：伊奥拉在井口营地（副本内），任务不在任务列表里显示；打通全部首领（任一档通关一次）后找她，
 *  本职业 40 级套装 6 件里自选 1 件（每个角色一次）。对话入口：manifest 的 talk 钩子 → wellIolaTalk */
// 11-08 Rhett：伊奥拉原在 (-5,114) 落到营地栅栏外的黑坑里，挪到篝火（营地中心 0,120）西南侧约 3 米，面向篝火
export const WELL_IOLA = { id: 'iola_w', name: '伊奥拉', title: '最后的敲钟人 · 回响', role: 'quest', x: -2.8, z: 118.4, yaw: 1.05, model: 'Mage@mr_iola', tint: 0x2a4a7a, tintK: 0.5,
  idle: '井底那口钟还在响……你要是能一路下到沉钟腔，把它们都打倒，回来找我。' };

// ---------------------------------------------------------------- 场地（局部坐标）：螺旋往井心收，越往里越「深」
export const WL_SPOTS = {
  // 11-07 钟井 v2：S 形回折主路约 1100 米（well_terrain.ts WELL_ROUTE）；首领场地按 v2 设计稿
  start: { x: 0 + CAMP_LAND.wl_camp.x, z: 120 + CAMP_LAND.wl_camp.z },   // fix1109 #4：进副本 / 评委跳转落点 = 井口营地内空地（原 (0,120) = 篝火正中）
  b1: { x: 0, z: 96 },          // 井口码头 · 锈锚屠夫（+12 米）
  b2: { x: -90, z: 6 },         // 西崖下 · 半淹礼拜堂 · 溺潮女巫（0 米）
  b3: { x: -26, z: -102 },      // 冰窟尽头 · 冰封湖面 · 寒誓骑士（−12 米）
  b4: { x: 86, z: 66 },         // 锈链断桥对岸 · 黑水两岸 · 摆渡双子（−30 米）
  b5: { x: 30, z: -16 },        // 井底三层沉钟腔 · 深潮之喉（−54 米，悬钟正下方）
} as const;
/** 涨潮会淹的西侧低栈道（局部坐标矩形） */
export const TIDE_ZONE = { x0: -128, x1: -72, z0: -10, z1: 46 };
const inTide = (p: { x: number; z: number }) => p.x > TIDE_ZONE.x0 && p.x < TIDE_ZONE.x1 && p.z > TIDE_ZONE.z0 && p.z < TIDE_ZONE.z1;

// fix1106 无缝贴图（05 第 1 批）：石面侧面石墙 + 顶面石板、木件木箱纹、铁件锈铁；低画质 / base 包没有贴图 → 原纯色材质
const tileOn = () => curQuality !== 'low';
const stone = (c = 0x24282c) => (tileOn() && tileMat('stonewall', { color: tlLift(c, 2.2), top: 'stonefloor', roughness: 0.95 })) || new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true });
const wood = (c = 0x3a2c20) => (tileOn() && tileMat('woodcrate', { color: tlLift(c, 2.0), roughness: 0.9 })) || new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
const rust = () => (tileOn() && tileMat('rustiron', { color: 0xa08070, metalness: 0.55, roughness: 0.9 })) || new THREE.MeshStandardMaterial({ color: 0x5a3a22, metalness: 0.6, roughness: 0.6 });
/** 原纯色很暗（它本身就是贴图平均色）：贴图按平均亮度归一后再乘色调，色调提亮一点保持原明暗 */
function tlLift(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }
const bronzeM = () => (tileOn() && tileMat('bronzebell', { color: 0xb0a070, metalness: 0.75, roughness: 0.5 })) || new THREE.MeshStandardMaterial({ color: 0x6a5a34, metalness: 0.75, roughness: 0.42, emissive: 0x06201c, emissiveIntensity: 0.5 });
const waterM = () => new THREE.MeshStandardMaterial({ color: 0x0c1c24, metalness: 0.3, roughness: 0.15, transparent: true, opacity: 0.82 });
/** 11-07 水体续：潮水面（46×70 m）原为纯色半透明平板，四边是硬直边。改：边缘 5 m 内软渐隐（alphaMap，盖住与栈道的接缝）
 *  + 流动细波纹法线（同黑水的 rippleTex，独立 repeat）+ 偏青的浅水色；0 贴图文件，低画质也开（只有一张 128² 程序纹理） */
function tideWaterM(w: number, h: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d')!, fx = 5 / w, fz = 5 / h;
  for (let j = 0; j < 96; j++) for (let i = 0; i < 64; i++) { const u = (i + 0.5) / 64, v = (j + 0.5) / 96, e = Math.min(u / fx, (1 - u) / fx, v / fz, (1 - v) / fz, 1);
    const k = e * e * (3 - 2 * e) * (0.92 + 0.08 * Math.sin(i * 0.9 + Math.sin(j * 0.5) * 2)); x.fillStyle = `rgb(${Math.round(k * 255)},${Math.round(k * 255)},${Math.round(k * 255)})`; x.fillRect(i, j, 1, 1); }
  const am = new THREE.CanvasTexture(c), nm = rippleTex().clone(); nm.repeat.set(w / 4.4, h / 4.9); nm.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: 0x10303a, metalness: 0.15, roughness: 0.2, transparent: true, opacity: 0.86, alphaMap: am, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45), depthWrite: false });
}

function arena(r: number, col: number, mat = stone(0x2c3034)): THREE.Group {
  const g = new THREE.Group();
  if (sceneMode() !== 'new') { const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.6, 0.4, 32), mat); disc.position.y = 0.1; disc.receiveShadow = true; g.add(disc); }   // 11-04 新版地面 = 碎石板（well_zones_hd.ts）
  void col;   // 1107 BUG#2 首领场地圈删除（首领红圈本体会画）
  return g;
}
/** 井口码头：木栈板 + 系船柱 + 锈锚。A7（11-02）：首领场地的地板（码头 / 冰面 / 黑水平台）顶面压到离地 ≤0.03 米——本体红圈 / 毒池 / 地面特效画在地面 +0.05 左右，原来被 0.27–0.48 米高的地板挡住看不见，玩家脚也陷在板里 */
function dock(): THREE.Group {
  const g = new THREE.Group(), w = wood();
  for (let i = 0; i < 11; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(18, 0.25, 1.4), w); p.position.set(0, -0.1, -7 + i * 1.45); p.rotation.y = (i % 3 - 1) * 0.015; p.receiveShadow = true; g.add(p); }
  for (const [x, z] of [[-8.5, -7], [8.5, -7], [-8.5, 7], [8.5, 7]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), w); b.position.set(x, 1, z); g.add(b); }
  const anchor = new THREE.Group(), r = rust();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 8), r); shank.position.y = 3; anchor.add(shank);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.32, 6, 16, Math.PI), r); arm.rotation.z = Math.PI; arm.position.y = 0.9; anchor.add(arm);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.4), r); stock.position.y = 5.6; anchor.add(stock);
  anchor.position.set(-6, 0.3, -9); anchor.rotation.set(0.25, 0.4, 0.5); g.add(anchor);
  const anc = sceneOr('scene_wl_anchor', { h: 4.5 }, () => null) as THREE.Group | null;   // Lux3D 锈锚斜插在码头边
  if (anc) { anc.position.set(-10.5, 0.2, 5); anc.rotation.set(0, 0.6, 0.35); g.add(anc); }
  return g;
}
/** 螺旋栈道：一段段石板沿螺线往井心收 */
function spiralWalk(): THREE.Group {
  const g = new THREE.Group(), st = stone(0x34383c), rail = rust();
  for (let i = 0; i < 64; i++) {
    const a = Math.PI / 2 + i * 0.16, r = 62 - i * 0.78;
    const s = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 3.4), st);
    s.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r); s.rotation.y = -a; s.receiveShadow = true; g.add(s);
    if (i % 3 === 0) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), rail); p.position.set(Math.cos(a) * (r + 2), 0.75, Math.sin(a) * (r + 2)); g.add(p); }
  }
  return g;
}
/** fix1107 BUG#14：井心月光光柱（设定：井口漏下一束冷月光打在裂钟上）。加色开口锥 + 竖向 / 边缘双重淡出（看不到硬边），
 *  内含约 140 颗慢飘尘粒（wellUpdate 里上下漂移）。不投影、不写深度、不挡相机，0 贴图。 */
const moonDust: { pts: THREE.Points | null; base: Float32Array | null; t: number } = { pts: null, base: null, t: 0 };
function moonBeam(): THREE.Group {
  const g = new THREE.Group(), TOP = 70, H = 70;
  const geo = new THREE.CylinderGeometry(3.2, 7.5, H, 40, 1, true); geo.translate(0, TOP - H / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0xbcd6ff) }, uTop: { value: TOP }, uI: { value: 0.16 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vY = position.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uTop; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float h = clamp(vY / uTop, 0.0, 1.0); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fade = smoothstep(0.0, 0.12, h) * (0.35 + 0.65 * h) * smoothstep(1.0, 0.82, h); gl_FragColor = vec4(uCol * uI * edge * fade, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(geo, mat); cone.userData.noCamBlock = true; cone.castShadow = false; cone.receiveShadow = false; cone.renderOrder = 5; g.add(cone);
  // 地面一圈柔和月光斑（加色圆片，径向淡出）
  const spotM = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(0xbcd6ff) } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; gl_FragColor = vec4(uCol * 0.22 * smoothstep(1.0, 0.25, d), 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), spotM); spot.rotation.x = -Math.PI / 2; spot.position.y = 0.06; spot.userData.noCamBlock = true; g.add(spot);
  // 尘粒
  const N = 140, pos = new Float32Array(N * 3); let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { const y = 1 + rnd() * 40, r = (7.2 - y / TOP * 4) * Math.sqrt(rnd()), a = rnd() * Math.PI * 2; pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xdce8ff, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.noCamBlock = true; g.add(pts); moonDust.pts = pts; moonDust.base = pos; moonDust.t = 0;
  return g;
}
/** 中央悬着的裂钟。fix1107 BUG#11：换 Lux3D 悬钟（scene_wl_well_bell，放大到 8 米），挂在 y=30 的摆动支点下，
 *  支点往上一串铁链（环节实例化，40 节）通到井口暗处；常态 ±2.6° 慢摆（wellUpdate），尾王重击 / 咆哮加幅（raid_well_rig.ts）。
 *  低画质或模型缺失：退回程序化铜钟（同样挂在支点下，支点在钟顶，不再绕钟口摆）。 */
const ripSt = { rings: 0, echo: [] as number[], at: null as THREE.Vector3 | null, drip: 1 };   // 11-15 钟声涟漪状态
const BELL_PIVOT_Y = 30;
function crackedBell(): THREE.Group {
  const g = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = BELL_PIVOT_Y; g.add(pivot); bellSwing.obj = pivot; bellSwing.amp = 0;
  const lux = sceneOr('scene_wl_well_bell', { h: 8 }, () => null) as THREE.Group | null;
  if (lux) {
    const bb = new THREE.Box3().setFromObject(lux); lux.position.y = -bb.max.y; pivot.add(lux);
  } else {
    const b = new THREE.Mesh(bellGeo(4.2, 6.4, 24), bronzeM()); (b.material as THREE.Material).side = THREE.DoubleSide; b.position.y = -6.4 - 1.2; pivot.add(b);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5.2), new THREE.MeshBasicMaterial({ color: 0x50f0e0, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); crack.position.set(2.6, -4.6, 3.2); crack.rotation.y = 0.7; pivot.add(crack);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3a342c, metalness: 0.7, roughness: 0.5 })); hook.position.y = -0.6; pivot.add(hook);
  }
  // 铁链：支点往上 40 节（每节 0.5 米，交替转 90°），随钟一起摆（挂在支点上，向上延伸）
  { const cm = new THREE.MeshStandardMaterial({ color: 0x3a342c, metalness: 0.75, roughness: 0.5 });
    const N = 40, link = new THREE.TorusGeometry(0.22, 0.07, 5, 10), im = new THREE.InstancedMesh(link, cm, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1.6, 1);
    for (let i = 0; i < N; i++) { e.set(0, i % 2 ? Math.PI / 2 : 0, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(0, 0.25 + i * 0.5, 0), q, one); im.setMatrixAt(i, m4); }
    im.userData.noCamBlock = true; pivot.add(im); }
  const l = new THREE.PointLight(0x50f0e0, 6, 30); l.position.y = 16; g.add(l);
  g.add(moonBeam());
  const fallen = sceneOr('scene_wl_cracked_bell', { h: 5 }, () => null) as THREE.Group | null;   // 地上一口摔裂的旧钟（Lux3D）
  if (fallen) { fallen.position.set(-11, 0, -6); fallen.rotation.y = 0.9; g.add(fallen); }
  return g;
}
// fix1107（Rhett 11-07 12:45 批）：A6 钟笼升降梯 + 高架栈道整套代码已删（10:xx 先关闭，吊笼升到上层能走出去、人浮空）；要找回看 git 34cd8f8 之前。
/** 礼拜堂废墟：残墙 + 墙边鱼油灯（女巫的「溺魂尖啸」站在灯光里免疫，A3 做实） */
function chapel(): THREE.Group {
  const g = new THREE.Group(), st = stone(0x2a2e30);
  for (let k = 0; k < 7; k++) { const a = -Math.PI * 0.1 + k * 0.42; const h = 0.8 + (k * 37 % 5) * 0.3; const w = new THREE.Mesh(new THREE.BoxGeometry(4, h, 0.7), st); w.position.set(Math.cos(a) * 15, h / 2, Math.sin(a) * 15); w.rotation.y = -a + Math.PI / 2; g.add(w); }
  for (const a of [0.3, 1.5, 2.7]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060 })); lamp.position.set(Math.cos(a) * 13.5, 1.6, Math.sin(a) * 13.5); g.add(lamp); const pl = new THREE.PointLight(0xffa050, 3, 8); pl.position.copy(lamp.position); g.add(pl); }
  return g;
}
/** 冰封湖面：半透明冰盘 + 裂纹 */
function iceLake(): THREE.Group {
  const g = new THREE.Group();
  const NEW = sceneMode() === 'new';   // 11-04：新版冰面压暗、偏钢蓝（旧版太亮、像一块发光圆盘）
  const ice = new THREE.Mesh(iceSlab(12.2, 0.3, 77), ((m: THREE.MeshStandardMaterial) => NEW && curQuality !== 'low' ? iceUp(m, 13, true) : m)(new THREE.MeshStandardMaterial({ color: NEW ? 0x2c4a5c : 0xa8d4e8, metalness: NEW ? 0.45 : 0.1, roughness: NEW ? 0.2 : 0.08, transparent: !NEW, opacity: NEW ? 1 : 0.85, envMapIntensity: NEW ? 0.6 : 1 }))); ice.position.y = NEW ? -0.112 : -0.13;   // 新版顶面 +0.038：盖住地形网格（旧值下能透出台阶状地形）
  g.add(ice);   // 11-15 修：原来 g.add 写进了上一行注释里，冰盘一直没加进场景（只剩裂纹）；同时加内部气泡 / 裂纹层（well_wet_hd iceUp）
  const cm = new THREE.MeshBasicMaterial({ color: NEW ? 0x9cc8e0 : 0xe8f8ff, transparent: NEW, opacity: NEW ? 0.55 : 1 });
  for (let k = 0; k < (NEW ? 22 : 9); k++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 4 + (k % 3) * 2), cm); c.rotation.x = -Math.PI / 2; c.rotation.z = k * 0.7; c.position.set(Math.cos(k) * 5, NEW ? 0.042 : 0.035, Math.sin(k * 1.3) * 5); g.add(c); }
  return g;
}
/** 黑水两岸：中间一道黑水 + 两座平台 + 摆渡船 */
/** 11-07 BUG#14：黑水细波纹法线（程序化，可平铺） */
let _ripple: THREE.Texture | null = null;
function rippleTex(): THREE.Texture {
  if (_ripple) return _ripple;
  const N = 128, d = new Uint8Array(N * N * 4), h = (x: number, y: number) => { const a = 2 * Math.PI / N; return Math.sin(x * a * 3 + Math.sin(y * a * 2) * 1.5) * 0.6 + Math.sin(y * a * 5 + x * a) * 0.4 + Math.sin((x + y) * a * 7) * 0.25; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1), v = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize(), i = (y * N + x) * 4;
    d[i] = (v.x * 0.5 + 0.5) * 255; d[i + 1] = (v.y * 0.5 + 0.5) * 255; d[i + 2] = (v.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 7); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (_ripple = t);
}
/** 水面低雾：两头与两边渐隐的长条 */
function mistTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const x = c.getContext('2d')!;
  for (let j = 0; j < 128; j++) for (let i = 0; i < 32; i++) { const ex = Math.sin(Math.PI * (i + 0.5) / 32), ez = Math.sin(Math.PI * (j + 0.5) / 128), n = 0.6 + 0.4 * Math.sin(j * 0.31 + Math.sin(i * 0.7) * 2);
    x.fillStyle = `rgba(255,255,255,${(ex * ex * Math.min(1, ez * 2.5) * n).toFixed(3)})`; x.fillRect(i, j, 1, 1); }
  return new THREE.CanvasTexture(c);
}
const WELL_LIT = (() => { try { return !/(?:[?&]off=[^&]*\bwelllit\b)/.test(location.search); } catch { return true; } })();
const BWMIST_OFF = (() => { try { return /(?:[?&]off=[^&]*\bbwmist\b)/.test(location.search); } catch { return false; } })();
function blackWater(): THREE.Group {
  const g = new THREE.Group();
  // 11-07 BUG#14：原为 7×34 纯黑镜面（metalness 0.4 / roughness 0.05）→ 映出整块天光、看着像一条黑带。
  // 改：深青黑水 + 程序化细波纹法线（缓慢流动）+ 两岸石砌驳岸 + 水面低雾；高光变成拉长的碎圆
  const wm = new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.28, metalness: 0.1, normalMap: rippleTex(), normalScale: new THREE.Vector2(0.55, 0.55) });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(7, 34), wm); w.rotation.x = -Math.PI / 2; w.position.y = 0.01; g.add(w);
  w.onBeforeRender = () => { const t = performance.now() / 1000, n = wm.normalMap!; n.offset.set(t * 0.012, t * 0.035); };
  // 11-18 20:03 Rhett「4 号 BOSS 平台依旧没有水」：原配色深 0x050c0e、天光 0x5a7a80 → 在幽暗井底读成一条黑沟。
  //   提亮成看得出是水的深青：浅 0x2c5c5a / 深 0x0f2c32 / 天光 0x9cc4cc，菲涅尔 0.62，焦散 0.18，细浪法线加强；?off=bwlevel 回旧
  const BWL = !/(?:[?&]off=[^&]*\bbwlevel\b)/.test(location.search); if (BWL) wm.normalScale.set(0.9, 0.9);
  waterUp(wm, BWL ? { ql: true, cave: true, edge: 'strip', shallow: 0x2c5c5a, deep: 0x0f2c32, sky: 0x9cc4cc, foam: 0xb8d4cc, foamW: 0.36, fres: 0.62, caus: 0.18, speed: 1.4, depth: 3 }
    : { ql: true, cave: true, edge: 'strip', shallow: 0x16302e, deep: 0x050c0e, sky: 0x5a7a80, foam: 0x8aa8a0, foamW: 0.32, fres: 0.45, caus: 0.08, speed: 1.4, depth: 3 }); waterBind(w);   // 11-07 统一水体；11-17 v2：黑水河中线约 3 米深
  for (const s of [-1, 1]) {   // 驳岸：一排条石压边，盖住水面与碎石板的接缝
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 3.6 + (i % 3) * 0.25), stone(0x30343a)); b.position.set(s * 3.6, 0.02, -15.5 + i * 3.85); b.rotation.y = (i % 2 ? 1 : -1) * 0.025; b.castShadow = b.receiveShadow = true; g.add(b); }
  }
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 34), new THREE.MeshBasicMaterial({ map: mistTex(), color: 0x6a8a90, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  mist.rotation.x = -Math.PI / 2; mist.position.y = 0.35; mist.renderOrder = 2; g.add(mist);
  if (!BWMIST_OFF) mist.visible = false;   // 11-18 Rhett「没换水体」：加色雾片整块罩在河面上 → 看着是一块发绿平板，盖住秋林水的细浪 / 高光 / 倒影；去掉。?off=bwmist 回旧
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.4, 24), stone(0x2a2c30)); p.position.set(s * 10, -0.18, 0); g.add(p); }
  // 11-04 新版：Lux3D 摆渡船（scene_wl_ferry_boat）替换方块占位；旧版 / 低档保留方块
  const lux = sceneMode() === 'new' ? sceneOr('scene_wl_ferry_boat', { w: 6.5 }, () => null) as THREE.Group | null : null;
  if (lux) { lux.position.set(0.4, -0.15, 6); lux.rotation.set(0.03, Math.PI / 2 + 0.12, 0.02); g.add(lux); }
  else { const boat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 5), wood(0x2a2018)); boat.position.set(0, 0.35, 6); g.add(boat); }
  // 11-18 Rhett「生死渡那边的河道」：地面下切 0.9 米成河道（well_terrain CHAN）→ 这组整体按岸面高度抬回，水面落到岸下 0.5 米；
  //   加两侧湿石河墙 + 两岸各一段下水石阶 + 系船桩；船浮在水上
  if (sceneMode() === 'new' && CHAN_ON) {
    const L = CHAN.d; for (const c of g.children) c.position.y += L;
    // 11-18 20:03 Rhett「4 号 BOSS 平台没有水」：原水面 7 宽、落在岸下 0.5 米，河墙在 ±3.42 → 两边各露一条暗缝，看着是黑沟。
    //   改：水面抬到岸下 0.3 米、拉宽到 8.4（两侧伸进河墙 / 岸下，盖满河墙之间）、拉长到 36 盖住河道两端下切过渡；船跟着升。?off=bwlift 回旧
    const BWLIFT = !/(?:[?&]off=[^&]*\bbwlift\b)/.test(location.search);
    const wy = BWLIFT ? L - 0.3 : L - 0.5; w.position.y = wy; if (BWLIFT) w.scale.set(8.4 / 7, 36 / 34, 1);
    mist.position.y = wy + 0.35; if (lux) lux.position.y = wy - 0.12;
    const wall = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.55, metalness: 0.05 });
    for (const sx of [-1, 1]) {
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.35, L + 0.3, 34.4), wall); wl.position.set(sx * 3.42, L / 2 - 0.15, 0); wl.receiveShadow = true; g.add(wl);
      for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 2.4), stone(0x343a3e)); st.position.set(sx * (3.0 - k * 0.55), L - 0.2 - k * 0.22, -8 * sx); st.castShadow = st.receiveShadow = true; g.add(st); }
      for (const z of [-12, 3, 13]) { const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a22, metalness: 0.6, roughness: 0.5 })); bo.position.set(sx * 4.3, L + 0.45, z); bo.castShadow = true; g.add(bo); }
    }
  }
  return g;
}

// ---------------------------------------------------------------- A5 首领场地机制
/** 萨琳「溺魂尖啸」：站在鱼油灯的光圈里听不见（免疫伤害与眩晕）；用过的那盏灯会被潮气压暗 20 秒，下一次得换一盏 */
export const SARIN_LAMPS = [0.9, 2.95, 5.0].map(a => ({ x: WL_SPOTS.b2.x + Math.cos(a) * 8, z: WL_SPOTS.b2.z + Math.sin(a) * 8 }));
export const LAMP_R = 2.4, LAMP_GUTTER = 20;
const lampFx: { light: THREE.PointLight; pool: THREE.Mesh; flame: THREE.Mesh }[] = [];
const lampHd: SarinLampFx[] = [];
const lampOut = [0, 0, 0];   // 熄灭剩余秒数
function sarinLamp(): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.2, 8), rust()); post.position.y = 1.1; g.add(post);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2a18, metalness: 0.7, roughness: 0.5, wireframe: true })); cage.position.y = 2.35; g.add(cage);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); flame.position.y = 2.33; g.add(flame);
  const light = new THREE.PointLight(0xffb060, 2.4, 9, 1.6); light.position.y = 2.4; g.add(light);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(LAMP_R, 40), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; g.add(pool);
  const rim = new THREE.Mesh(new THREE.RingGeometry(LAMP_R - 0.08, LAMP_R, 48), new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.5, depthWrite: false })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.07; g.add(rim);
  lampFx.push({ light, pool, flame });
  return g;
}
/** 维尔格二阶段（≤50%）：冰面打滑——松开方向后人会继续往前滑一段，转向变钝 */
export const ICE = { r: 13, carry: 0.6, tauUp: 0.3, tauDown: 1.0 } as const;   // 起步跟得快、松手衰减慢 = 打滑
const ice = { vx: 0, vz: 0, px: NaN, pz: NaN, dx: 0, dz: 0, on: false };

let tideWater: THREE.Mesh | null = null;
let iolaY = 0;
function build(api: WildBuildApi) {
  { const pr = new THREE.Object3D(); api.add(pr, 0, 0); const g = pr.parent; g?.remove(pr); const wp = g?.getObjectByName('waypoint_unified'); if (wp) wp.visible = false; }   // 1107 BUG#4 副本内不显示营地传送阵
  campDressFor(api, WELL_WILD as unknown as Parameters<typeof campDressFor>[1]);
  iolaY = Math.max(api.groundY(WELL_IOLA.x, WELL_IOLA.z), api.groundY(0, 120)) + 0.22;   // 11-08 Rhett：伊奥拉站在营地地面上，脚略高于火堆底（NPC 默认 y=0，营地在钟井抬高的地形上 → 埋进地里看不见）   // fix1107（Rhett 10:22）：营地换倒钟广场样式（地坪 / 篝火 / 火盆 / 拾荒营场景件）
  lampFx.length = 0; lampHd.length = 0; lightPoolReset();
  for (const L of SARIN_LAMPS) { if (sarinLampHdOn()) { const h = makeSarinLamp(LAMP_R); lampHd.push(h); api.add(h.g, L.x, L.z, Math.atan2(WL_SPOTS.b2.x - L.x, WL_SPOTS.b2.z - L.z)); } else api.add(sarinLamp(), L.x, L.z); }
  const S = WL_SPOTS;
  if (sceneMode() === 'new') {   // 11-18 22:00 各段单独 try：一段出错（实机曾栈溢出）不再连带后面的码头 / 首领台 / 路灯全没；出错写进 launch.log
    const step = (n: string, f: () => void) => { try { f(); } catch (e) { const m = `钟井造景 ${n} 出错 ${(e as Error)?.message}`; console.error(m, e); try { (window as unknown as { __drfs?: { log?(s: string): void } }).__drfs?.log?.(m + ' ' + String((e as Error)?.stack ?? '').slice(0, 300)); } catch { /* 网页版 */ } } };
    step('depth', () => wellDepthHd(api)); step('zones', () => wellZonesHd(api)); step('route', () => wellRouteHd(api)); step('arcade', () => wellArcadeHd(api)); step('stairs', () => wellStairs(api)); step('lightpool', () => { const q = wellQ(); if (q !== 'low') lightPoolInstall(o => { api.add(o, 0, 0); o.position.y -= api.groundY(0, 0); }, q === 'high' || q === 'ultra' ? 6 : 4); }); step('atmo', () => wellAtmoBuild(api)); }   // 11-18 主路下坡段石阶（well_stairs.ts）   // v2：路面 / 崖壁 / 砖井筒 / 断桥链栏 / 壁灯（well_route_hd.ts）   // 11-04 竖井层次造景（下降走廊 + 深渊 + 回廊 + 地标）；旧版螺旋石板不再铺（走廊本身就是下行栈道）
  else api.add(spiralWalk(), 0, 0);
  if (sceneMode() === 'new') {   // 11-03 井口码头改造样板（well_dock_hd.ts）；?scene=old 看旧版
    api.add(dockHd(WELL_O.x + S.b1.x, WELL_O.z + S.b1.z), S.b1.x, S.b1.z);
    // 1107 BUG#2 码头地上黄圈删除
  } else {
    api.add(dock(), S.b1.x, S.b1.z);
    api.add(arena(12, 0xc08040, wood(0x3a2c20)), S.b1.x, S.b1.z);
  }
  api.add(chapel(), S.b2.x, S.b2.z); api.add(arena(11, 0x60d0c0), S.b2.x, S.b2.z);
  api.add(iceLake(), S.b3.x, S.b3.z);
  api.add(blackWater(), S.b4.x, S.b4.z); TWIN_BANK.x = WELL_O.x + S.b4.x; TWIN_BANK.z = WELL_O.z + S.b4.z;   // v2 两岸：生渡跳到死渡对面
  api.add(arena(14, 0x50f0e0, stone(0x1c2226)), S.b5.x, S.b5.z);
  api.add(crackedBell(), S.b5.x, S.b5.z);
  // 潮水：西侧低栈道上的一块水面，涨潮时升起
  const TW = TIDE_ZONE.x1 - TIDE_ZONE.x0, TH = TIDE_ZONE.z1 - TIDE_ZONE.z0, twm = tideWaterM(TW, TH);
  const tw = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), twm); tw.rotation.x = -Math.PI / 2; tw.position.y = -0.4; tw.visible = false; tw.renderOrder = 1;
  tw.onBeforeRender = () => { const t = performance.now() / 1000; twm.normalMap!.offset.set(t * 0.02, -t * 0.028); };
  waterUp(twm, { ql: true, cave: true, edge: 'alpha', shallow: 0x2a7a80, deep: 0x0c2a34, sky: 0x9ab8c8, foamW: 0.3, depth: 0.9 }); waterBind(tw);   // 11-17 v2：涨潮漫过栈道，不到 1 米（浅、透）   // 11-07 统一水体：深浅 / 菲涅尔 / 岸沫 / 焦散 / 双层波
  tideWater = tw; api.add(tw, (TIDE_ZONE.x0 + TIDE_ZONE.x1) / 2, (TIDE_ZONE.z0 + TIDE_ZONE.z1) / 2);
  // 井壁：外圈高石柱一圈，像竖井的内壁
  let s = 53; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (sceneMode() !== 'new') for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, rr = 74 + r() * 4;   // 新版井壁在 well_depth_hd.ts（不规则岩壁）
   const c = new THREE.Mesh(new THREE.CylinderGeometry(2 + r(), 3 + r(), 18 + r() * 14, 6), stone(0x16181c)); c.position.y = 8; api.add(c, Math.cos(a) * rr, Math.sin(a) * rr, r() * 3); }
  if (false) for (let i = 0; i < 14; i++) { const x = (r() - 0.5) * 120, z = (r() - 0.5) * 120; if (Math.hypot(x, z) > 66 || Math.hypot(x - S.b5.x, z - S.b5.z) < 18 || wellSolid(x, z)) continue; const p = new THREE.Mesh(new THREE.CircleGeometry(1.4 + r() * 2, 16), waterM()); p.rotation.x = -Math.PI / 2; p.position.y = 0.05; api.add(p, x, z); }
}

export const WELL_WILD = {
  id: WELL_MAP, name: '潮渊钟井', levels: [40, 40], minLevel: 40, desc: '40 级长副本 · 5 个首领 · 标准 / 炼狱 · 潮汐每 60 秒涨落一次（从沉钟海岸锈锚码头井口乘升降笼下井）',
  origin: WELL_O, half: 160,
  groundAdd: wellGround, solidAt: wellSolid,   // 11-04 竖井层次地形（?scene=old 两个都返回平地 / 可走）
  worldNode: { x: 0.44, y: 0.9 }, sandIcon: '潮渊钟井',
  // 11-18 20:04 Rhett「整条路乌漆嘛黑，白天光线也照不进来，楼梯看不见」：陡坡 / 台阶侧面走 cliff 色 0x0c1014（近纯黑），
  //   井内又只有顶光 → 竖面全黑。提亮：cliff 0x0c1014→0x46525a，半球地色 0x24323a→0x4a5a62（给竖面 / 背光面补天光反弹），hemiI 2.3→2.9；?off=welllit 回旧
  palette: { sky: 0x10202a, fog: 0x16303a, fogNear: 40, fogFar: 260, hemi: 0xb4dce8, ground: WELL_LIT ? 0x4a5a62 : 0x24323a, hemiI: WELL_LIT ? 2.9 : 2.3, sun: 2.1, sunColor: 0xc8ecf8,
    tA: 0x46525a, tB: 0x343e46, path: 0x5a666c, cliff: WELL_LIT ? 0x46525a : 0x0c1014, tex: ['rock', 'dirt', 'rock'], map: ['#14222a', '#06090c'], grass: 0, music: 'bell' },
  scatter: [
    ...(sceneMode() === 'new' ? [] : [{ kind: 'mesa', n: 14, r: 3.2, s: [1.2, 2.2], color: 0x0c1014, edge: true }]),   // 11-04 竖井地形下不要黑色台柱（会立在深渊里）
    ...(sceneMode() === 'new' ? [] : [{ kind: 'rock', n: 26, r: 0.9, s: [0.5, 1.3], color: 0x2a3034 }]),   // 1107 BUG#6 卡通散石不撒（竖井有写实岩块）
  ],
  camps: [{ id: 'wl_camp', name: '井口', x: 0, z: 120, r: 8, main: true, waypoint: { x: 8, z: 120 } }],   // 11-07 waypoint 字段本体必读（缺了进副本即报错 reading 'x'），传送阵模型在 build() 里隐藏   // 1107 BUG#4 副本内不放营地传送阵（水晶浮台）
  gates: [{ to: COAST_ID, x: 0, z: /(?:[?&]off=[^&]*\bwellgatein\b)/.test(typeof location !== 'undefined' ? location.search : '') ? 128 : 125, name: '乘升降笼回沉钟海岸', arrive: { x: WELL_GATE_COAST.x, z: WELL_GATE_COAST.z + 6 } }],   // 1107 Rhett 定删钟楼东侧临时门，只留海岸井口；11-18 Rhett「位置移进来，别跟栅栏重叠」z 128→125（营地半径 8，门在栅栏上；?off=wellgatein 回旧）
  spots: {
    wl_entry: { x: 0, z: 118, r: 9, name: '井口' }, wl_b1: { ...S_(WL_SPOTS.b1), r: 13, name: '井口码头' }, wl_b2: { ...S_(WL_SPOTS.b2), r: 13, name: '半淹的礼拜堂' },
    wl_b3: { ...S_(WL_SPOTS.b3), r: 14, name: '冰封湖面' }, wl_b4: { ...S_(WL_SPOTS.b4), r: 18, name: '黑水两岸' }, wl_b5: { ...S_(WL_SPOTS.b5), r: 22, name: '井底 · 沉钟腔' },
    wl_tide: { x: -112, z: 22, r: 20, name: '西崖潮汐低栈道（涨潮被淹）' },
    wl_cave: { x: -100, z: -50, r: 14, name: '寒潮冰窟' }, wl_bridge: { x: -38, z: -20, r: 12, name: '锈链断桥' },
    wl_river: { x: 116, z: -10, r: 14, name: '摆渡暗河' }, wl_arcade: { x: 58, z: -70, r: 12, name: '沉钟回廊' },
  },
  paths: [WELL_ROUTE.map(n => n.p as [number, number])],
  decor: [],   // 1107 BUG#4 营火 / 木箱 / 旗删除
  npcs: [WELL_IOLA], mobs: {}, packs: [],
  build,
};
function S_(p: { x: number; z: number }) { return { x: p.x, z: p.z }; }

// ---------------------------------------------------------------- 首领（报告第 11 节标准数值）
/** fix1106 首领按玩家实际身高放大（PLAYER_H 1.95 → 2.31，×1.185）：近战攻击距离跟着体型放大（8 米以上是远程，不动）；技能半径 / 预警圈 1107 起同比放大（见 WELL_BOSSES 下） */
const HK = PLAYER_H / 1.95;
const meleeR = (r: number) => (r < 8 ? +(r * HK).toFixed(2) : r);
const cfg = (dmg: number, speed: number, range: number, interval: number) => ({ aggroRange: 14, attackRange: meleeR(range), attackDamage: dmg, attackInterval: interval, moveSpeed: speed, leashRange: 34, patrolRadius: 0 });
type Mob = PackDungeonBoss['mob'];
const bossMob = (name: string, model: string, hp: number, dmg: number, o: Partial<Mob>): Mob =>
  (m => ({ ...m, range: (m as { ranged?: boolean }).ranged ? m.range : meleeR(m.range as number) }))({ name, level: 40, model, hp, dmg, interval: 2.3, speed: 3, aggro: 14, range: 3.6, xp: 6500, ilvl: 86, leash: 34, elite: true, loot: 'well_boss', ...o } as Mob);
const add = (name: string, model: string, hp: number, dmg: number, o: Record<string, unknown> = {}) => ({ name, level: 40, model, hp, dmg, interval: 2, speed: 3.6, aggro: 18, range: 2.4, xp: 150, ilvl: 82, ...o });

const B1: PackDungeonBoss = { key: 'wl_b1', name: '锈锚屠夫 · 戈尔顿', ...WL_SPOTS.b1, theme: 'stone', tip: '锚链横扫是前方扇形，绕到侧面；被钩拽后马上翻滚躲屠宰；别站在血水里（治疗减半）',
  mob: bossMob('锈锚屠夫 · 戈尔顿', 'wl_gordon', 279000 /* fix1108b #1 原 62000 */, 180, { ...BODY('wl_gordon'), speed: 3, range: 4.6, ...skin('wl_gordon', 0x6a2a1a, 0.5) }),
  adds: { wl_add_hook: add('码头钩手', 'dlc1_drowned', 3400, 78, { tint: 0x5a3020, tintK: 0.4 }) },
  yells: { spawn: '码头尽头，一个拖着锈锚的屠夫转过身：「又来了一船货。」', death: '戈尔顿连人带锚沉进了井水里。' },
  boss: { name: '戈尔顿', config: cfg(180, 3, 4.6, 2.4), globalCooldown: 3.2,
    abilities: [
      { id: 'sweep', kind: 'groundSlam', name: '锚链横扫', cooldown: 9, telegraph: 1.4, radius: 6.5, damage: 270, element: 'physical', atSelf: true },
      { id: 'hook', kind: 'cast', name: '钩拽 · 屠宰', cooldown: 15, castTime: 1.8, damage: 220, element: 'physical', effect: { type: 'stun', duration: 1.5 }, lockout: 2.5 },
      { id: 'blood', kind: 'poisonZone', name: '血潮', cooldown: 13, radius: 3.6, duration: 9, dps: 80, element: 'physical', count: 3, spread: 8 },
      { id: 'hooks', kind: 'summon', name: '码头钩手', cooldown: 28, count: 2, unit: 'wl_add_hook' },
    ],
    phases: [
      { name: '第一阶段 · 卸货', hpBelow: 1, abilities: ['sweep', 'hook'] },
      { name: '第二阶段 · 断码头', hpBelow: 0.5, abilities: ['sweep', 'hook', 'blood', 'hooks'], damageMul: 1.2, onEnter: 'hooks', yell: '巨锚砸断了半边码头！木板一块块坠进水里。' },
    ] } as BossDef };
const B2: PackDungeonBoss = { key: 'wl_b2', name: '溺潮女巫 · 萨琳', ...WL_SPOTS.b2, theme: 'nature', tip: '毒雾会漂，看流向躲；40% 她隐入水中——25 秒内打碎 3 盏灵魂灯笼，否则「潮葬」',
  mob: bossMob('溺潮女巫 · 萨琳', 'wl_sarin', 284000 /* fix1108b #1 原 66000 */, 185, { ...BODY('wl_sarin'), speed: 3.2, range: 10, ranged: true, shot: { color: 0x40e0a0, el: 'nature' }, ...skin('wl_sarin', 0x1a4a40, 0.45) } as Partial<Mob>),
  adds: { wl_add_drowned: add('溺魂', 'dlc1_drowned', 3000, 70, { tint: 0x1a4a40, tintK: 0.5 }) },
  yells: { spawn: '礼拜堂里的水开始发绿。萨琳从圣坛后面浮了上来：「留下来……陪我。」', death: '萨琳沉了下去，水面上只剩一盏熄了的鱼油灯。' },
  gate: { diffs: ['normal', 'heroic', 'epic', 'nightmare'], at: [0.4], time: 25, name: '潮葬', tip: '萨琳隐入水中——25 秒内打碎 3 盏灵魂灯笼，否则潮葬',
    core: { name: '灵魂灯笼', model: 'wl_lantern_core', n: 3, hpK: 2.2, r: 8, ...(wlHasGlb('scene_wl_lantern') ? { scale: 1 } : { tint: 0x60ffd0, scale: 0.8 }) } },
  boss: { name: '萨琳', config: cfg(185, 3.2, 10, 2.4), globalCooldown: 3,
    abilities: [
      { id: 'fog', kind: 'poisonZone', name: '溺毒雾', cooldown: 11, radius: 3.8, duration: 9, dps: 82, element: 'nature', count: 3, spread: 9 },
      { id: 'shriek', kind: 'cast', name: '溺魂尖啸', cooldown: 17, castTime: 2.4, damage: 200, element: 'shadow', effect: { type: 'stun', duration: 2 }, lockout: 3 },
      { id: 'mark', kind: 'cast', name: '溺毙标记', cooldown: 13, castTime: 1.6, damage: 120, element: 'frost', effect: { type: 'dot', element: 'frost', dps: 70, duration: 6 }, lockout: 2 },
      { id: 'souls', kind: 'summon', name: '溺魂', cooldown: 26, count: 3, unit: 'wl_add_drowned' },
    ],
    phases: [
      { name: '第一阶段 · 涨水', hpBelow: 1, abilities: ['fog', 'mark'] },
      { name: '第二阶段 · 溺魂', hpBelow: 0.7, abilities: ['fog', 'mark', 'shriek', 'souls'], damageMul: 1.15, onEnter: 'souls', yell: '点灯吧……灯光里的人，听不见我。' },
    ] } as BossDef };
const B3: PackDungeonBoss = { key: 'wl_b3', name: '寒誓骑士 · 维尔格', ...WL_SPOTS.b3, theme: 'frost', tip: '冰裂蔓延 1.5 秒后碎开，别站在裂纹上；被点名「寒誓冰封」就离开人群；冰刺是直线',
  mob: bossMob('寒誓骑士 · 维尔格', 'wl_virg', 289000 /* fix1108b #1 原 70000 */, 190, { ...BODY('wl_virg'), speed: 3.2, range: 4.4, ...skin('wl_virg', 0x6a9ac0, 0.45, 0x0a2a4a) }),
  adds: { wl_add_frost: add('冰誓扈从', 'dlc1_bell_sentinel', 3600, 80, { scale: 1.0, tint: 0x8ab8d8, tintK: 0.45 }) },
  yells: { spawn: '冰面下有一双眼睛。维尔格破冰而出：「我发过誓——谁也不许下去。」', death: '维尔格的剑插进冰里，誓言碎成了一地冰碴。' },
  boss: { name: '维尔格', config: cfg(190, 3.2, 4.4, 2.3), globalCooldown: 3,
    abilities: [
      { id: 'crack', kind: 'groundSlam', name: '冰裂', cooldown: 8, telegraph: 1.5, radius: 4, damage: 240, element: 'frost', count: 3, spread: 8 },
      { id: 'oath', kind: 'cast', name: '寒誓冰封', cooldown: 16, castTime: 2.4, damage: 180, element: 'frost', effect: { type: 'stun', duration: 2 }, lockout: 3 },
      { id: 'spike', kind: 'groundSlam', name: '冰刺突进', cooldown: 11, telegraph: 1.2, radius: 3, damage: 260, element: 'frost', count: 4, spread: 10 },
      { id: 'bash', kind: 'cast', name: '盾击', cooldown: 12, castTime: 1.2, damage: 210, element: 'physical', effect: { type: 'stun', duration: 1 }, lockout: 1.5 },
      { id: 'guard', kind: 'summon', name: '冰誓扈从', cooldown: 30, count: 2, unit: 'wl_add_frost' },
    ],
    phases: [
      { name: '第一阶段 · 冰面', hpBelow: 1, abilities: ['crack', 'bash', 'spike'] },
      { name: '第二阶段 · 寒誓', hpBelow: 0.5, abilities: ['crack', 'bash', 'spike', 'oath', 'guard'], damageMul: 1.2, onEnter: 'guard', yell: '整片湖面变得像镜子一样滑。' },
    ] } as BossDef };
// 摆渡双子：「死渡」是首领本体；50% 时「生渡」从渡船跳上岸（机制门槛核心，写实模型 wl_ferry_life），生渡活着死渡锁血不掉。
// A8：生渡会走会打、渡生引导可打断、上岸同血 / 同舟减伤 / 断渡（ferry_twins.ts）；核心血量 hpK 9 × 上岸时同死渡比例（50%）≈ 原 hpK 5 的 0.9 倍，门槛时间 30 → 40 秒（它会回血、要拉开打）
const B4: PackDungeonBoss = { key: 'wl_b4', name: '摆渡双子', x: WL_SPOTS.b4.x - 10, z: WL_SPOTS.b4.z, theme: 'nature', tip: '死渡站西岸；50% 生渡跳上东岸（中间黑水不能站，站进去每秒 -5% 生命）。双 10% 锁血：一人到 10% 就停住，两人都压到 10% 才能击倒生渡；打断「渡生引导」，拉开 8 米以上打生渡（同舟减伤）',
  mob: bossMob('摆渡双子 · 生与死', 'wl_ferry_death', 296000 /* fix1108b #1 原 76000 */, 175, { ...BODY('wl_ferry_death'), speed: 3.4, range: 4.0, ...skin('wl_ferry_death', 0x2a2a4a, 0.5, 0x1a0a3a) }),
  adds: { wl_add_oar: add('渡魂', 'dlc1_mirror_wraith', 3200, 74, { tint: 0x3a2a5a, tintK: 0.5 }) },
  yells: { spawn: '黑水两岸各站着一个撑船人。「上船。」「下船。」两个声音同时说。', death: '两支船篙一起沉进了黑水。' },
  gate: { diffs: ['normal', 'heroic', 'epic', 'nightmare'], at: [0.5], time: 75, name: '生死同渡', tip: '「生渡」上了对岸——两人都压到 10% 才能击倒生渡；打断它的渡生引导',
    core: { name: '摆渡双子 · 生渡', model: 'wl_ferry_life', n: 1, hpK: 9, r: 10, ...(wlHasGlb('wl_ferry_life') ? BODY('wl_ferry_life') : { tint: 0xd8d0b0, ...BODY('wl_ferry_life') }) } },
  boss: { name: '摆渡双子', config: cfg(175, 3.4, 4.0, 2.3), globalCooldown: 3,
    abilities: [
      { id: 'life', kind: 'cast', name: '生渡', cooldown: 15, castTime: 2.6, damage: 90, element: 'nature', lockout: 3, selfHealPercent: 0.05 },
      { id: 'death', kind: 'cast', name: '死渡', cooldown: 12, castTime: 1.8, damage: 140, element: 'shadow', effect: { type: 'dot', element: 'shadow', dps: 75, duration: 6 }, lockout: 2 },
      { id: 'oar', kind: 'groundSlam', name: '船篙横击', cooldown: 9, telegraph: 1.3, radius: 5, damage: 240, element: 'physical', count: 2, spread: 7 },
      { id: 'ferry', kind: 'summon', name: '渡魂', cooldown: 24, count: 3, unit: 'wl_add_oar' },
    ],
    phases: [
      { name: '第一阶段 · 渡口', hpBelow: 1, abilities: ['death', 'oar', 'life'] },
      { name: '第二阶段 · 双渡', hpBelow: 0.5, abilities: ['death', 'oar', 'ferry'], damageMul: 1.2, onEnter: 'ferry', yell: '「生的一边，死的一边——你站哪边？」' },
    ] } as BossDef };
const B5: PackDungeonBoss = { key: 'wl_b5', name: '深潮之喉 · 莫尔维斯', ...WL_SPOTS.b5, theme: 'frost', tip: '尾王三阶段：70%「撞台」打碎 3 处裂台石；35%「深渊潮葬」打断 3 根钟锤锁链让钟响；最后水位上涨',
  mob: bossMob('深潮之喉 · 莫尔维斯', 'wl_morvis', 318000 /* fix1108b #1 原 96000 */, 200, { ...BODY('wl_morvis'), speed: 2.6, range: 5.6, ...skin('wl_morvis', 0x0a2a3a, 0.55, 0x00303a), xp: 9500, ilvl: 88, loot: 'well_final' }),
  adds: { wl_add_eel: add('寄生鳗', 'dlc1_drowned', 3200, 74, { scale: 0.85, tint: 0x0a3a3a, tintK: 0.55, speed: 4.4 }) },
  yells: { spawn: '井底的水面裂开了一张嘴。那口裂钟，就挂在它的喉咙上方。', death: '莫尔维斯沉回了井底。头顶那口裂钟，终于又响了一声。' },
  gate: { diffs: ['normal', 'heroic', 'epic', 'nightmare'], at: [0.7, 0.35], time: 14, name: '深渊潮葬', tip: '它在读「深渊潮葬」——打断周围 3 根钟锤锁链，让裂钟敲响打断它',
    core: { name: '钟锤锁链', model: wlHasGlb('scene_wl_chain_hammer') ? 'wl_hammer_core' : 'golem', n: 3, hpK: 2.4, r: 9, ...(wlHasGlb('scene_wl_chain_hammer') ? { scale: 1 } : { tint: 0x50f0e0, scale: 0.55 }) } },
  boss: { name: '莫尔维斯', config: cfg(200, 2.6, 5.6, 2.4), globalCooldown: 2.9,
    abilities: [
      { id: 'surge', kind: 'groundSlam', name: '潮涌冲击', cooldown: 10, telegraph: 1.5, radius: 4, damage: 260, element: 'frost', count: 4, spread: 10 },
      { id: 'bite', kind: 'groundSlam', name: '扑咬', cooldown: 8, telegraph: 1.2, radius: 6, damage: 300, element: 'physical', atSelf: true },
      { id: 'lure', kind: 'cast', name: '诱饵灯', cooldown: 16, castTime: 2.2, damage: 160, element: 'arcane', effect: { type: 'stun', duration: 2 }, lockout: 2.5 },
      { id: 'drool', kind: 'poisonZone', name: '毒涎', cooldown: 12, radius: 3.6, duration: 10, dps: 88, element: 'nature', count: 3, spread: 9 },
      { id: 'eels', kind: 'summon', name: '寄生鳗', cooldown: 22, count: 3, unit: 'wl_add_eel' },
      { id: 'flood', kind: 'poisonZone', name: '水位上涨', cooldown: 15, radius: 6, duration: 30, dps: 70, element: 'frost', count: 2, spread: 12 },
    ],
    phases: [
      { name: '第一阶段 · 上层圆台', hpBelow: 1, abilities: ['surge', 'bite', 'lure', 'drool'] },
      { name: '第二阶段 · 沉钟腔', hpBelow: 0.7, abilities: ['surge', 'bite', 'drool', 'eels'], damageMul: 1.15, onEnter: 'eels', yell: '圆台裂开了！所有人落进了沉钟腔。' },
      { name: '第三阶段 · 井底', hpBelow: 0.35, abilities: ['surge', 'bite', 'lure', 'drool', 'flood', 'eels'], damageMul: 1.3, yell: '裂钟砸穿了地板——井底的水在往上涨！' },
    ] } as BossDef };
export const WELL_BOSSES = [B1, B2, B3, B4, B5];
/** fix1107（Rhett 11-07 12:45 批）：技能半径 / 预警圈跟首领体型一起 ×HK（≈1.185）：地面砸击 / 毒区的 radius（预警圈与判定同一个值）；散布距离、远程不动。
 *  只在模块加载时放大一次（炼狱借机制从这里复制，自动带上放大后的半径） */
for (const b of WELL_BOSSES) for (const a of b.boss.abilities as { radius?: number }[]) if (typeof a.radius === 'number') a.radius = +(a.radius * HK).toFixed(2);
for (const b of WELL_BOSSES) { const mid = (b.mob as { model: string }).model; WL_MOVE_R[mid] = Object.fromEntries((b.boss.abilities as { id: string; radius?: number }[]).filter(a => typeof a.radius === 'number').map(a => [a.id, a.radius!])); }   // 首领特效地面圈 = 判定半径
// ---------------------------------------------------------------- A10 炼狱（报告第 11 / 13 节：×1.5 生命伤害 + 每首领借一个别的首领机制 + 尾王二阶段钟锤锁链冰封）
// 本副本「炼狱」= 噩梦档（WELL_MUL[3] = 1.5，装等 91）。借来的机制只挑纯地面 / 毒区类（不依赖借出方的专属脚本），冷却 ×1.5，名字后缀「·借」。
// 首领定义用 getter：进副本那一刻读当前难度（本体 pr 已建好、spawnBoss 读 b.boss 之前），噩梦给加了借用技能的定义，其余难度原样。
export const WELL_BORROW: Record<string, { from: string; id: string }> = { wl_b1: { from: 'wl_b3', id: 'crack' }, wl_b2: { from: 'wl_b4', id: 'oar' }, wl_b3: { from: 'wl_b2', id: 'fog' }, wl_b4: { from: 'wl_b5', id: 'drool' }, wl_b5: { from: 'wl_b3', id: 'spike' } };
type DgG = { packDungeon: { state: () => { id: string; diff: string; i: number; gate: unknown; gateDone: number[] } | null; units: () => { cores: (Record<string, unknown> & { alive: boolean; maxHp: number; preDamage?: (a: number, s: unknown, el: string) => number })[] } } };
const dgG = () => (globalThis as unknown as { __game?: DgG }).__game ?? null;
const wellDiff = () => { const st = dgG()?.packDungeon.state(); return st && st.id === WELL_DG ? st.diff : null; };
/** 1107（规则同 30 级长副本）：每周畸变首领——标准档每周轮到一个首领带上炼狱借来的机制（按周号轮换） */
export const wellWeeklyTwist = (now = Date.now()) => (weekKey(now) * 3 + 1) % WELL_BOSSES.length;
WELL_BOSSES.forEach((b, i) => {
  const base = b.boss, br = WELL_BORROW[b.key], src = WELL_BOSSES.find(x => x.key === br.from)!.boss.abilities.find(a => a.id === br.id)!;
  const ab = { ...src, name: `${src.name}·借`, cooldown: Math.round((src.cooldown ?? 10) * 1.5) } as typeof src;
  const hard: BossDef = { ...base, abilities: [...base.abilities, ab], phases: base.phases.map(p => ({ ...p, abilities: [...p.abilities, br.id] })) };
  Object.defineProperty(b, 'boss', { get: () => { const d = wellDiff(); return d === 'nightmare' || (d === 'heroic' && wellWeeklyTwist() === i) ? hard : base; }, enumerable: true, configurable: true });
});
/** 炼狱尾王二阶段：钟锤锁链（深渊潮葬门槛的核心）冰封——火焰一击融化；其他伤害先打碎冰壳（核心生命 60%，伤害不进核心），范围技能同时打几根更快 */
const chainIce = new WeakMap<object, { shell: number; thawed: boolean }>();
let iceToast = 0;
function chainFreezeTick() {
  const G = dgG(); if (!G || !ctx) return; const st = G.packDungeon.state();
  if (!st || st.id !== WELL_DG || st.diff !== 'nightmare' || st.i !== WELL_BOSSES.length - 1 || !st.gate || !st.gateDone.length) return;
  for (const c of G.packDungeon.units().cores) {
    if (!c.alive || chainIce.has(c)) continue;
    const ice = { shell: c.maxHp * 0.6, thawed: false }; chainIce.set(c, ice); const prev = c.preDamage;
    c.preDamage = (amt, s, el) => {
      if (!ice.thawed) { if (el === 'fire') { ice.thawed = true; ctx?.toast('火焰融开了一根钟锤锁链的冰封！', '#ffa050'); } else { ice.shell -= amt; if (ice.shell > 0) return 0; ice.thawed = true; ctx?.toast('冰壳碎了——锁链露了出来', '#bfe8ff'); return 0; } }
      return prev ? prev(amt, s, el) : amt;
    };
    if (performance.now() - iceToast > 5000) { iceToast = performance.now(); ctx.toast('炼狱：钟锤锁链被冰封了——用火焰或范围伤害融化', '#8fd0ff'); }
  }
}
export const wellHard = { borrow: WELL_BORROW, diff: wellDiff, bosses: () => WELL_BOSSES, chainIce: () => dgG()?.packDungeon.units().cores.map(c => chainIce.get(c) ?? null) ?? [] };
// A7 读条预警：技能 id → 首领名 / 技能名
WL_MOVE_NAMES.wl_ferry_life = { mend: { boss: '摆渡双子 · 生渡', name: '渡生引导' } };   // A8：生渡自己的读条（ferry_twins.ts 接管大脑）
for (const b of WELL_BOSSES) { const bd = b.boss as BossDef & { name: string; abilities?: { id: string; name: string }[] }, mid = (b.mob as { model: string }).model; WL_MOVE_NAMES[mid] = Object.fromEntries((bd.abilities ?? []).map(a => [a.id, { boss: bd.name, name: a.name }])); }

// ---------------------------------------------------------------- 运行时：潮汐 / 掉落 / 存档
let ctx: PackCtx | null = null;
export const bindWell = (c: PackCtx) => { ctx = c; if (wellTablesKick) { const k = wellTablesKick; wellTablesKick = null; import('../../data/loot').then(m => { installWellTables(m.LOOT_TABLES); wellTablesHook?.(m.LOOT_TABLES); k(); }).catch(e => console.error('钟井掉落表加载失败', e)); } bindWellRig(c); bindTwins(c); wlFallbackNote.toast = (m, col) => c.toast(m, col ?? '#ffb060'); };
let S: { clears: Record<string, number>; best: Record<string, number>; dark?: string[]; /** 伊奥拉隐藏任务领过的套装件 id */ iola?: string; /** fix1108b #2 新橙装保底：已掉过的件 / 连续没出新件的首领数（按职业） */ lg?: Record<string, { seen: string[]; dry: number }> } = { clears: {}, best: {} };
export function wellLoad(d: unknown) { const o = (d && typeof d === 'object' ? d : {}) as Partial<typeof S>; S = { clears: { ...(o.clears ?? {}) }, best: { ...(o.best ?? {}) }, ...(Array.isArray(o.dark) ? { dark: o.dark.filter(x => typeof x === 'string') } : {}), ...(typeof o.iola === 'string' ? { iola: o.iola } : {}), ...(o.lg && typeof o.lg === 'object' ? { lg: Object.fromEntries(Object.entries(o.lg).map(([k, v]) => [k, { seen: Array.isArray(v?.seen) ? v.seen.filter(x => typeof x === 'string') : [], dry: Number.isFinite(v?.dry) ? Number(v.dry) : 0 }])) } : {}) }; log.length = 0; }
export const wellSave = () => (Object.keys(S.clears).length || S.dark?.length || S.iola || S.lg ? { clears: { ...S.clears }, best: { ...S.best }, ...(S.dark?.length ? { dark: [...S.dark] } : {}), ...(S.iola ? { iola: S.iola } : {}), ...(S.lg ? { lg: JSON.parse(JSON.stringify(S.lg)) } : {}) } : null);
const log: { i: number; last: boolean; diff: string; echo: string | null }[] = [];
let rng: () => number = Math.random;
export const wellSetRng = (f: (() => number) | null) => { rng = f ?? Math.random; };
/** fix1106 钟井专属掉落（Rhett 17:23 批）：40 级本职业套装按熔炉概率（首领 1–4 = s40ForgeChance 非尾王档，尾王 = 尾王档；普通难度不掉），
 *  与熔炉 / 钟楼共用 sets40 保底；暗金只尾王 8%（BT_DARK_CHANCE，普通难度不掉），双持职业缺的那件优先，记在 S.dark */
/** 11-08 Rhett：钟井首领只掉新橙装（40 级本职业回响橙装，LEGENDARIES_40 / 40B）和套装，不再掉其他品质装备。
 *  首领 1–4 各 1 件、尾王 2 件不重复；金币与材料沿用 raid_boss / raid_final。表在击杀时按当前职业现抽（getter），所以只会是本职业的件。 */
const NEW40 = [...LEGENDARIES_40, ...LEGENDARIES_40B];
export function wellOrangeIds(n: number, r: () => number = rng): string[] {
  const pool = NEW40.filter(l => l.cls === ctx?.classId()).map(l => l.id), out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
/** fix1108b #2（Rhett 11-08 20:48 批）：新橙装从「每首领必掉」改为按概率掉 + 保底，目标约 5 次完整通关收齐本职业 6 件。
 *  每次掷：首领 1–4 各 1 次、尾王 2 次；概率 WELL_LG[档]；掉落时随机挑本职业 6 件之一（可重复）；
 *  连续 WELL_LG.force 次掷都没出新件 → 下一次必掉一件缺的。模拟（4000 次）：标准 P50 5 / P90 6 次通关（改前必掉 P50 3 / P90 4）。每周首通 2 件照旧。 */
// 11-18 Rhett「钟井 BOSS 应该必掉橙装，概率掉套装，不掉绿蓝紫」：首领 1–4 各必掉 1 件、尾王必掉 2 件（不重复）本职业新橙装；套装仍按 s40WellChance 概率；
//   首领级本来就不掉绿蓝紫（combatev roll 第三参数），掉落表只含橙装条目。?off=wellorange 回 fix1108b 概率档
const WELL_ORANGE_OLD = (() => { try { return /(?:[?&]off=[^&]*\bwellorange\b)/.test(location.search); } catch { return false; } })();
export const WELL_LG: { chance: Record<string, [number, number]>; force: number } = { chance: WELL_ORANGE_OLD ? { heroic: [0.25, 0.35], nightmare: [0.35, 0.5] } : { heroic: [1, 1], nightmare: [1, 1] }, force: 6 };
function wellDiffNow(): string { const G = (globalThis as unknown as { __game?: { packDungeon?: { state?: () => { id: string; diff: string } | null } } }).__game; const st = G?.packDungeon?.state?.(); return st?.id === WELL_DG ? st.diff : 'heroic'; }
/** fix1108c #2 熔炉也掉新 40 级橙装：同一套规则（首领 1–2 各 1 次、末王 2 次；连续 force 次没出新件必掉缺的），与钟井共用 S.lg 保底计数。
 *  英雄对齐钟井标准 0.25 / 0.35，史诗 / 神话 0.3 / 0.42，噩梦 0.35 / 0.5。 */
export const FORGE_LG: Record<string, [number, number]> = { heroic: [0.25, 0.35], epic: [0.3, 0.42], mythic: [0.3, 0.42], nightmare: [0.35, 0.5] };
function forgeDiffNow(): string { const G = (globalThis as unknown as { __game?: { packDungeon?: { state?: () => { id: string; diff: string } | null } } }).__game; const st = G?.packDungeon?.state?.(); return st?.id === 'dlc1_forge_dg' ? st.diff : 'heroic'; }
export const forgeOrangeRoll = (n: number, diff: string = forgeDiffNow(), r: () => number = rng) => wellOrangeRoll(n, diff, r, FORGE_LG[diff] ?? FORGE_LG.heroic);
export function wellOrangeRoll(n: number, diff: string = wellDiffNow(), r: () => number = rng, ch?: [number, number]): string[] {
  const cls = ctx?.classId() ?? '', pool = NEW40.filter(l => l.cls === cls).map(l => l.id), out: string[] = [];
  if (!pool.length) return out;
  const L = (S.lg ??= {}), st = (L[cls] ??= { seen: [], dry: 0 }), [p, pl] = ch ?? WELL_LG.chance[diff] ?? WELL_LG.chance.heroic;
  for (let k = 0; k < n; k++) {
    const miss = pool.filter(x => !st.seen.includes(x) && !out.includes(x));
    let id: string | null = null;
    if (miss.length && st.dry >= WELL_LG.force) id = miss[Math.floor(r() * miss.length)];
    else if (r() < (n > 1 ? pl : p)) { const c = pool.filter(x => !out.includes(x)); id = c[Math.floor(r() * c.length)]; }
    if (!id) { st.dry = miss.length ? st.dry + 1 : 0; continue; }
    out.push(id);
    if (!st.seen.includes(id)) { st.seen.push(id); st.dry = 0; } else st.dry = miss.length ? st.dry + 1 : 0;
  }
  if (out.length || st.dry) ctx?.save();
  return out;
}
/** 11-18 Rhett「加上」：钟井炼狱照本体长副本炼狱，橙装 / 套装 / 暗金每件 4% 太古（同 ANCIENT_CHANCE.raidHell）；标准不出。?off=wellanc 关 */
const WELL_ANC_OFF = (() => { try { return /(?:[?&]off=[^&]*\bwellanc\b)/.test(location.search); } catch { return false; } })();
export const WELL_ANC = 0.04;
const wellAnc = (diff: string = wellDiffNow()) => (!WELL_ANC_OFF && diff === 'nightmare' ? WELL_ANC : 0);
function installWellTables(LOOT_TABLES: Record<string, LootTable>) {
  for (const [id, src, n] of [['well_boss', 'raid_boss', 1], ['well_final', 'raid_final', 2]] as const) {
    const base = LOOT_TABLES[src]; if (!base) continue;
    Object.defineProperty(LOOT_TABLES, id, { configurable: true, enumerable: true,
      get: (): LootTable => ({ id, gold: base.gold, stacks: base.stacks, entries: wellOrangeRoll(n).map(lgId => ({ kind: 'lg' as const, chance: 1, lgId, anc: wellAnc() })) }) });
  }
  for (const [id, src, n] of [['forge_boss', 'raid_boss', 1], ['forge_final', 'raid_final', 2]] as const) {   // fix1108c #2 熔炉：底表沿用原表（金币 / 材料 / 原掉落不变）+ 新 40 级橙装
    const base = LOOT_TABLES[src]; if (!base) continue;
    Object.defineProperty(LOOT_TABLES, id, { configurable: true, enumerable: true,
      get: (): LootTable => ({ id, gold: base.gold, stacks: base.stacks, entries: [...base.entries, ...forgeOrangeRoll(n).map(lgId => ({ kind: 'lg' as const, chance: 1, lgId }))] }) });
  }
}
/** 包注册后（bind 时数据模块早已加载）再挂钟井掉落表 */
let wellTablesKick: (() => void) | null = null;
/** fix1108c #2：掉落表装好后的回调（manifest 接熔炉 forgeUseNewLoot，避免 raid_well 反向 import forge） */
let wellTablesHook: ((t: Record<string, unknown>) => void) | null = null;
export const setWellTablesHook = (f: (t: Record<string, unknown>) => void) => { wellTablesHook = f; };
export const wellTablesReady: Promise<void> = new Promise(r => { wellTablesKick = r; });
function wellDrops(i: number, last: boolean, diff: string) {
  if (!ctx?.dropFixed) return;
  const b = WELL_BOSSES[i] as { x: number; z: number } | undefined, X = WELL_O.x + (b?.x ?? 0), Z = WELL_O.z + (b?.z ?? 0);
  s40Roll(s40WellChance(diff, last), X + 1.5, Z, rng, wellAnc(diff));   // fix1108b #2 钟井改用自己的套装概率（原借熔炉档）
  const dks = DARK_BY_CLASS[ctx.classId()];
  if (last && diff !== 'normal' && dks?.length && rng() < BT_DARK_CHANCE) {
    const got = (S.dark ??= []), dk = dks.find(d => !got.includes(d)) ?? dks[Math.floor(rng() * dks.length)];
    const n = ctx.dropFixed(dk, X - 1.5, Z, wellAnc(diff)); if (n) { if (!got.includes(dk)) got.push(dk); ctx.toast(`暗金：${n}！`, '#ffd070'); ctx.save(); }
  }
}
function onBossDown(i: number, last: boolean, diff: string) { log.push({ i, last, diff, echo: rollEchoDrop(last, diff, rng) }); try { wellDrops(i, last, diff); } catch (e) { console.error('钟井掉落出错', e); } }
function onComplete(o: { diff: string; sec: number }) {
  S.clears[o.diff] = (S.clears[o.diff] ?? 0) + 1;
  if (!S.best[o.diff] || o.sec < S.best[o.diff]) S.best[o.diff] = Math.round(o.sec);
  ctx?.banner?.({ big: '潮渊钟井 · 通关', small: `用时 ${Math.floor(o.sec / 60)} 分 ${Math.round(o.sec % 60)} 秒`, theme: 'gold', ms: 2600 });
  ctx?.save();
}

let tideT = 0, high = false, tideTick = 0, bossNear = false;
const local = () => { const p = ctx!.playerPos(); return { x: p.x - WELL_O.x, z: p.z - WELL_O.z }; };
/** 每帧（manifest.update 末尾挂） */
export function wellUpdate(dt: number) {
  rigTick(dt);
  twinsTick(dt, !!ctx && ctx.map() === WELL_MAP);
  { const p = ctx?.playerPos(); dockGradeTick(dt, !!ctx && ctx.map() === WELL_MAP, p?.x ?? 0, p?.z ?? 0); if (ctx && ctx.map() === WELL_MAP) wellDepthTick(dt);
    try { const rc = wellRC(); wellAtmoTick(dt, !!ctx && ctx.map() === WELL_MAP && sceneMode() === 'new', rc?.s as THREE.Scene ?? null, rc?.r ?? null, rc?.c as THREE.Camera ?? null, WELL_O); } catch (e) { console.warn('钟井氛围', e); } }
  // A10 按需加载：到了入口所在区域 / 井里才拉首领绑骨件（比赛版拆包）；进井后第一帧有渲染器就预热着色器
  if (ctx && (ctx.map() === WELL_MAP || ctx.map() === BT_ID || ctx.map() === COAST_ID)) { void bossGlbEnsure(); void wellTilesEnsure(); void wellArcadeEnsure(); }   // v2 钟井 2048 贴图也在入口区域先解码
  if (ctx && ctx.map() === WELL_MAP) { const rc = wellRC(); if (rc) void bossGlbWarm(rc.r, rc.s, rc.c as THREE.Camera); }
  if (ctx && ctx.map() === WELL_MAP) chainFreezeTick();
  if (ctx && ctx.map() === WELL_MAP && iolaY) for (const k of ['mr_iola', 'iola_w']) for (const r of NPC_ROOTS[k] ?? []) { const p = r.position; if (Math.hypot(p.x - WELL_O.x - WELL_IOLA.x, p.z - WELL_O.z - WELL_IOLA.z) < 1.5 && Math.abs(p.y - iolaY) > 0.01) p.y = iolaY; }
  if (!ctx || ctx.map() !== WELL_MAP) { if (high) setHigh(false); tideT = 0; if (ice.on) { ice.on = false; ctx?.setMoveMul(1); } return; }
  const lp = local();
  bossNear = WELL_BOSSES.some(b => Math.hypot(lp.x - b.x, lp.z - b.z) < 16);
  tideT += dt;
  const phase = tideT % TIDE.every, want = phase > TIDE.every - TIDE.high && !bossNear;
  if (want !== high) setHigh(want);
  if (tideWater) { const y = high ? Math.min(0.35, tideWater.position.y + dt * 0.5) : Math.max(-0.4, tideWater.position.y - dt * 0.5); tideWater.position.y = y; tideWater.visible = y > -0.35; }
  const lp2 = lp;
  if (high && inTide(lp2) && (tideTick += dt) >= 1) { tideTick = 0; ctx.drain?.(TIDE.drain); }
  sarinTick(dt, lp2); iceTick(dt, lp2); dockBreakTick(dt, lp2); blackWaterTick(dt, lp2);
}
// ---------------------------------------------------------------- v2 机制（Rhett 11-07 20:37 确认）
/** ① 断码头：戈尔顿掉到 50%，码头东半边塌进水里，场地变小；踩进塌掉的那半边 = 落水（-15% 生命，被冲回西半边） */
const dockBrk = { on: false, t: 0, hit: 0, killed: false, lastK: 1 };
function dockBreakTick(dt: number, lp: { x: number; z: number }) {
  const E = DOCK_EAST.obj; if (!ctx || !E) return;
  const bi = ctx.bossInfo?.('wl_b1'), st = ctx.bossState?.('wl_b1') ?? 'none';
  // 11-18 Rhett「老1脚下的木头没了，和机制不符」：按机制判——首领在场且血量 > 50% = 一阶段，码头必须完整；≤ 50% 东半边塌；
  //   打死（状态 dead，或最后一次看到时血量 ≤ 3% 后消失）一直塌着；没打死就不见了（团灭 / 重置 / 重进）= 复原。?off=dockmech 回 d228ce1 逻辑
  const mech = !/(?:[?&]off=[^&]*\bdockmech\b)/.test(location.search);
  if (mech) {
    if (bi) { const k = bi.hp / Math.max(1, bi.max); dockBrk.lastK = k; if (k > 0.5) dockBrk.killed = false; }
    if (st === 'dead' || (!bi && dockBrk.lastK <= 0.03)) dockBrk.killed = true;
    const want = dockBrk.killed || (!!bi && bi.hp <= bi.max * 0.5);
    if (want && !dockBrk.on) { dockBrk.on = true; dockBrk.t = 0; }
    if (!want && dockBrk.on) { dockBrk.on = false; dockBrk.t = 0; E.position.set(0, 0, 0); E.rotation.set(0, 0, 0); }
  } else {
    const dead = st === 'dead';
    if (!dockBrk.on && bi && bi.hp <= bi.max * 0.5) { dockBrk.on = true; dockBrk.t = 0; }
    if (dockBrk.on && !dead && !!bi && bi.hp >= bi.max * 0.99) { dockBrk.on = false; E.position.set(0, 0, 0); E.rotation.set(0, 0, 0); }
  }
  if (!dockBrk.on) return;
  dockBrk.t = Math.min(1.4, dockBrk.t + dt); const k = dockBrk.t / 1.4, e = k * k;
  E.position.set(DOCK_SPLIT * (1 - Math.cos(e * 0.2)), -2.8 * e, 0.4 * e); E.rotation.set(0.04 * e, 0, -0.2 * e);
  dockBrk.hit = Math.max(0, dockBrk.hit - dt);
  const inE = lp.x > DOCK.x + DOCK_SPLIT + 0.3 && lp.x < DOCK.x + 12.6 && Math.abs(lp.z - DOCK.z) < DOCK.hz;
  if (inE && dockBrk.hit <= 0 && dockBrk.t > 0.3) { dockBrk.hit = 1; if (bi) ctx.drain?.(0.15);   /* 首领倒下后落水只冲回不扣血 */ ctx.dashTo?.(WELL_O.x + DOCK.x + DOCK_SPLIT - 2.2, WELL_O.z + lp.z); ctx.toast('码头塌了——你掉进了黑水，被冲回西半边', '#ff6040'); }
}
export const wellDockBreak = () => ({ ...dockBrk, obj: !!DOCK_EAST.obj });
/** ④ 黑水两岸：中间那道黑水不能站，每秒 -5% 生命 */
let bwTick = 0, bwWarn = 0;
function blackWaterTick(dt: number, lp: { x: number; z: number }) {
  if (!ctx) return; const S = WL_SPOTS.b4;
  if (Math.abs(lp.x - S.x) < 3.5 && Math.abs(lp.z - S.z) < 17) { if ((bwTick += dt) >= 1) { bwTick = 0; ctx.drain?.(0.05); if (st0() > bwWarn) { bwWarn = st0() + 8; ctx.toast('黑水在拖你下去——快上岸', '#ff6040'); } } }
  else bwTick = 0;
}
const st0 = () => performance.now() / 1000;
// ---------------------------------------------------------------- A7 首领体型配套：镜头自动拉远 / 裂钟共鸣 / 高架栈道上不挨地面小怪的打
const BOSS_MODEL: Record<string, string> = { wl_b1: 'wl_gordon', wl_b2: 'wl_sarin', wl_b3: 'wl_virg', wl_b4: 'wl_ferry_death', wl_b5: 'wl_morvis' };
const rigSt = { pull: 0, last: 0, want: 0 };
/** 镜头拉远目标（米）：交战距离内的大型首领越高拉得越远 */
export const wellCamWant = () => rigSt.want;
export const wellCamPull = () => rigSt.pull;
function rigTick(dt: number) {
  if (!ctx) return;
  const inMap = ctx.map() === WELL_MAP;
  rwTick(dt); if (!inMap) hideRaidWarn();   // 首领预警条倒计时 / 离开副本收起
  if (inMap && tideWater) liftDecals(tideWater);   // 本体红圈 / 毒池 / 地面贴花抬到首领台面上
  let want = 0;
  if (inMap && ctx.bossInfo) {
    const p = ctx.playerPos();
    for (const b of WELL_BOSSES) {
      const bi = ctx.bossInfo(b.key); if (!bi) continue;
      const d = Math.hypot(bi.x - p.x, bi.z - p.z), H = wlHeight(BOSS_MODEL[b.key]);
      if (d < 38) want = Math.max(want, Math.min(7.5, Math.max(0, (H - 2) * 1.2)) * (d < 28 ? 1 : (38 - d) / 10));
    }
  }
  rigSt.want = want;
  rigSt.pull += (want - rigSt.pull) * Math.min(1, dt * 1.2);
  if (want === 0 && rigSt.pull < 0.01) rigSt.pull = 0;
  if (rigSt.pull !== rigSt.last) { rigSt.last = rigSt.pull; ctx.camPull?.(rigSt.pull); }
  // 裂钟共鸣：尾王重击 / 咆哮 / 倒下时井心悬钟摆动，慢慢停
  if (moonDust.pts && moonDust.base) { moonDust.t += dt; const a = moonDust.pts.geometry.getAttribute('position') as THREE.BufferAttribute, b = moonDust.base, t = moonDust.t;   /* 1107 BUG#14 月光尘粒慢飘 */
    for (let i = 0; i < a.count; i++) { a.setXYZ(i, b[i * 3] + Math.sin(t * 0.21 + i) * 0.35, b[i * 3 + 1] + Math.sin(t * 0.13 + i * 1.7) * 0.8, b[i * 3 + 2] + Math.cos(t * 0.17 + i * 0.6) * 0.35); } a.needsUpdate = true; }
  // 11-15 钟声涟漪：每响一次钟，井心正下方水面扩一大圈 + 两道回声小圈；平时偶尔滴水小圈（只在镜头附近）
  if (bellSwing.obj && bellSwing.rings !== ripSt.rings) { ripSt.rings = bellSwing.rings; const wp = bellSwing.obj.getWorldPosition(new THREE.Vector3()); waterRipple(wp.x, wp.z, 1.6); ripSt.echo = [0.55, 1.15]; ripSt.at = wp; }
  if (ripSt.echo.length && ripSt.at) { for (let i = ripSt.echo.length - 1; i >= 0; i--) { ripSt.echo[i] -= dt; if (ripSt.echo[i] <= 0) { waterRipple(ripSt.at.x + (Math.random() - 0.5) * 3, ripSt.at.z + (Math.random() - 0.5) * 3, 0.8); ripSt.echo.splice(i, 1); } } }
  ripSt.drip -= dt; if (ripSt.drip <= 0) { ripSt.drip = 0.6 + Math.random() * 1.4; const c = ctx.playerPos(); waterRipple(c.x + (Math.random() - 0.5) * 30, c.z + (Math.random() - 0.5) * 30, 0.18 + Math.random() * 0.2); }
  if (bellSwing.obj) { bellSwing.t += dt; bellSwing.amp = Math.max(0.045, bellSwing.amp * Math.exp(-dt * 0.45));   /* 1107 BUG#11 常态小幅摆动 ±2.6° */ bellSwing.obj.rotation.z = Math.sin(bellSwing.t * 1.9) * bellSwing.amp; bellSwing.obj.rotation.x = Math.sin(bellSwing.t * 1.3 + 1) * bellSwing.amp * 0.4; }
}
/** A7 测试：量包围盒高度（米） */
export const wellMeasureH = (o: THREE.Object3D) => { o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); return b.isEmpty() ? 0 : b.max.y - b.min.y; };
/** A7 测试：单独建一个首领模型（按 mob.scale × 本体 1.1 放大），返回建法 / 显示身高 / 包围盒高度 */
export function wellBuildTest(id: string) {
  const r = WELL_MODELS[id]?.() as { root: THREE.Object3D; anim?: { worldH?: number } } | null; if (!r) return null;
  r.root.scale.multiplyScalar(WL_BODY[id].scale * 1.1); r.root.updateMatrixWorld(true);
  return { ...WL_BUILT[id], worldH: r.anim?.worldH ?? 0, boxH: wellMeasureH(r.root), hasAnim: !!r.anim };
}
/** A7 调试：首领模型怎么建的、身高倍数 */
/** 测试用：立即按 [E] 提示可见性重排警报条位置 */
export const wellWarnDodge = () => { rwDodgeInteract(); return raidWarnInfo().shifted; };
export const wellRigInfo = () => ({ a9: { fx: Object.fromEntries(Object.entries(SKILL_FX).map(([k, v]) => [k, Object.keys(v)])), moves: Object.fromEntries(Object.entries(WL_MOVE_NAMES).map(([k, v]) => [k, Object.keys(v)])) }, procSkin: WL_RIG_OPT.procSkin, wholePose: wellWholePose(), raidWarn: raidWarnInfo(), warns: warnLog.map(w => ({ ...w })), built: { ...WL_BUILT }, playerH: PLAYER_H, heights: Object.fromEntries(Object.entries(BOSS_MODEL).map(([k, m]) => [k, wlHeight(m)])), cam: { want: rigSt.want, pull: rigSt.pull }, bell: { amp: bellSwing.amp, rings: bellSwing.rings } });
let wardOn = false, shriekWarned = false;
const inLamp = (lp: { x: number; z: number }) => SARIN_LAMPS.findIndex((L, i) => lampOut[i] <= 0 && Math.hypot(lp.x - L.x, lp.z - L.z) <= LAMP_R);
function sarinTick(dt: number, lp: { x: number; z: number }) {
  if (!wardOn && ctx?.castWard) { ctx.castWard((cast, boss) => {
    if (boss !== 'wl_b2' || cast !== '溺魂尖啸' || !ctx || ctx.map() !== WELL_MAP) return false;
    const i = inLamp(local()); if (i < 0) return false;
    lampOut[i] = LAMP_GUTTER; ctx.toast('鱼油灯护住了你——这盏灯被潮气压暗了，下次换一盏', '#ffd890'); return true;
  }); wardOn = true; }
  for (let i = 0; i < 3; i++) {
    lampOut[i] = Math.max(0, lampOut[i] - dt);
    const hd = lampHd[i]; if (hd) { hd.tick(performance.now() / 1000, lampOut[i] > 0 ? 0.12 : 1, lampOut[i] > 0); continue; }
    const f = lampFx[i]; if (!f) continue;
    const k = lampOut[i] > 0 ? 0.12 : 1, fl = 0.9 + Math.sin(performance.now() / 130 + i * 2) * 0.1;
    f.light.intensity = 2.4 * k * fl; (f.pool.material as THREE.MeshBasicMaterial).opacity = 0.22 * k; (f.flame.material as THREE.MeshBasicMaterial).color.setHex(lampOut[i] > 0 ? 0x553a20 : 0xffc070);
  }
  const b = ctx?.bossInfo?.('wl_b2');
  if (b?.cast === '溺魂尖啸') { if (!shriekWarned) { shriekWarned = true; ctx!.yell(inLamp(lp) >= 0 ? '萨琳在尖啸——待在灯光里' : '萨琳在尖啸——快躲进亮着的鱼油灯光圈里'); } }
  else shriekWarned = false;
}
function iceTick(dt: number, lp: { x: number; z: number }) {
  const b = ctx?.bossInfo?.('wl_b3');
  const on = !!b && b.hp / b.max <= 0.5 && Math.hypot(lp.x - WL_SPOTS.b3.x, lp.z - WL_SPOTS.b3.z) <= ICE.r;
  if (on && !ice.on) { ctx!.toast('冰面像镜子一样滑：松开方向也会继续往前滑', '#bfe8ff'); ctx!.setMoveMul(0.7); }   // 自己走得慢一点，加上滑行量总速度约 1.1 倍
  if (!on && ice.on) ctx!.setMoveMul(1);
  ice.on = on;
  if (!on || dt <= 0 || !ctx?.dashTo) { ice.vx = ice.vz = 0; ice.px = NaN; ice.dx = ice.dz = 0; return; }
  const p = ctx.playerPos();
  if (!Number.isNaN(ice.px)) {
    const mx = (p.x - ice.px - ice.dx) / dt, mz = (p.z - ice.pz - ice.dz) / dt;   // 玩家自己走的速度（去掉上一帧的滑行量）
    const sp = Math.hypot(mx, mz);
    if (sp < 30) { const a = 1 - Math.exp(-dt / (sp > Math.hypot(ice.vx, ice.vz) ? ICE.tauUp : ICE.tauDown)); ice.vx += (mx - ice.vx) * a; ice.vz += (mz - ice.vz) * a; }
  }
  const tx = p.x + ice.vx * ICE.carry * dt, tz = p.z + ice.vz * ICE.carry * dt;
  const q = Math.hypot(ice.vx, ice.vz) > 0.3 ? ctx.dashTo(tx, tz) : p;
  ice.dx = q.x - p.x; ice.dz = q.z - p.z; ice.px = q.x; ice.pz = q.z;
}
function setHigh(v: boolean) {
  high = v; tideTick = 0;
  if (!ctx || ctx.map() !== WELL_MAP) return;
  if (v) ctx.yell(`涨潮了：西侧低栈道被淹（站在水里持续掉血），绕开水面或等退潮`);
  else ctx.toast('退潮了，低栈道露了出来', '#9ae8f0');
}
export const wellDebug = () => ({ dockGrade: dockGradeInfo(), lampOut: [...lampOut], ice: { ...ice }, tideT, high, bossNear, clears: { ...S.clears }, best: { ...S.best }, log: log.map(x => ({ ...x })) });
export const wellSetTide = (sec: number) => { tideT = sec; };
/** A8 双首领机制（测试 / 调试） */
export const wellTwins = { hard: () => wellHard, info: twinsInfo, mendNow: twinsMendNow, K: TWIN, glb: bossGlbInfo, glbEnsure: bossGlbEnsure };

const pct = (p: number) => `${Math.round(Math.min(1, p) * 100)}%`;
export const WELL_DUNGEON: PackDungeonDef = {
  id: WELL_DG, name: '潮渊钟井', theme: 'frost',
  mapView: {   // 11-07 Rhett 21:02：M 地图按 v2 新路线画（2D 真实主路 / 3D 剖开竖井），数据直接取 WELL_ROUTE
    path: WELL_ROUTE.map(r => ({ x: r.p[0], z: r.p[1], h: r.h, k: r.k })),
    kinds: { path: { name: '栈道 / 回廊', color: '#d8b070' }, tide: { name: '潮汐低栈道', color: '#4ab0e8' }, cave: { name: '寒潮冰窟', color: '#bfe8ff' }, lift: { name: '锈铁台阶', color: '#ffd060' }, bridge: { name: '锈链断桥', color: '#d0703a', dash: true }, boat: { name: '摆渡暗河', color: '#30d0b8', dash: true } },
    marks: [
      { x: 0, z: 124, h: 12, name: '井口营地' }, { x: -86, z: 104, h: 8, name: '西崖折返栈道' }, { x: -122, z: 26, h: 1, name: '潮汐低栈道' },
      { x: -112, z: -52, h: -5, name: '寒潮冰窟' }, { x: -48, z: -6, h: -25, name: '锈链断桥' }, { x: 128, z: -14, h: -32, name: '摆渡暗河' }, { x: 78, z: -50, h: -42, name: '沉钟回廊' },
    ],
    shaft: { x: 0, z: 0, r: 138, top: 18, bottom: -60 },
    waters: [{ x: (TIDE_ZONE.x0 + TIDE_ZONE.x1) / 2, z: (TIDE_ZONE.z0 + TIDE_ZONE.z1) / 2, h: 0, w: TIDE_ZONE.x1 - TIDE_ZONE.x0, d: TIDE_ZONE.z1 - TIDE_ZONE.z0, color: '#2a7ab0' },
      { x: WL_SPOTS.b4.x, z: WL_SPOTS.b4.z, h: -30, w: 7, d: 34, color: '#0a1418' }, { x: 112, z: -16, h: -32, w: 22, d: 120, color: '#0e3a40' }],
    bell: { x: WL_SPOTS.b5.x, z: WL_SPOTS.b5.z, h: -30 },
  },
  desc: '40 级长副本 · 从井口下到井底 · 5 个首领 · 标准 / 炼狱 · 潮汐每 60 秒涨落',
  guide: {   // 11-07 BUG#18 攻略补充（首领阶段 / 技能 / 门槛由本体按首领定义自动列出）
    notes: [
      `潮汐：每 ${TIDE.every} 秒涨落一次，涨潮持续 ${TIDE.high} 秒，西侧低栈道被淹，站在水里每秒掉 ${Math.round(TIDE.drain * 100)}% 生命；首领战中不涨潮。`,
      '路线一路向下：井口码头 → 半淹的礼拜堂 → 冰封湖面 → 黑水两岸 → 井底沉钟腔。每个首领倒下是一个存档点。',
      '炼狱：需先通关一次标准；敌人更强，每个首领多借一个别的首领的技能（见各首领「炼狱」一条）。',
      `每周畸变首领：本周标准档的「${(WELL_BOSSES[wellWeeklyTwist()].mob as { name: string }).name}」也带上炼狱借来的技能（每周轮换）。`,
      '每周首通（每档一次）：额外两件 40 级本职业新橙装；炼狱另得暗金碎片 ×10。',
    ],
    boss: {
      wl_b2: [`鱼油灯：场地上 3 盏，站进灯的光圈（${LAMP_R} 米）里，「溺魂尖啸」打不到你；用过的那盏会暗 ${LAMP_GUTTER} 秒，下一次换一盏。`],
      wl_b3: ['第二阶段起冰面打滑：松开方向键也会继续往前滑，提前收步。'],
      wl_b4: ['中间的黑水不能站。生渡上岸后把两只拉开 8 米以上再打生渡，挨在一起有「同舟」减伤。'],
      wl_b5: ['炼狱：钟锤锁链会被冰封，先用火焰或范围伤害融开冰壳再打。'],
    },
  },
  long: { tip: '40 级长副本：标准 / 炼狱两档。炼狱敌人更强，每个首领多借一个别的首领的机制，需先通关一次标准。', lock: d => (d === 'nightmare' && !(S.clears.heroic ?? 0) ? '炼狱：先通关一次标准' : null) , weeklyLg: () => wellOrangeIds(2) } as PackDungeonDef['long'],   // 11-08 每周首通也只给新橙装（dungeonplus 读 weeklyLg）
  map: WELL_MAP, origin: WELL_O, start: WL_SPOTS.start, exit: { map: COAST_ID, x: COAST_O.x + WELL_GATE_COAST.x, z: COAST_O.z + WELL_GATE_COAST.z + 6 },
  minLevel: 40, syncLevel: WELL_SYNC.level, syncHp: WELL_SYNC.hp, syncDmg: WELL_SYNC.dmg,
  ilvl: WELL_ILVL, mul: WELL_MUL, bosses: WELL_BOSSES,
  trash: [
    { kind: 'drowned', mob: { name: '溺亡水手', model: 'dlc1_drowned', hp: 4200, dmg: 140, interval: 1.9, speed: 3.6, range: 2.2, aggro: 11, xp: 220, tint: 0x2a4a4a, tintK: 0.35, loot: 'trash_ember' },
      at: [{ x: -34, z: 104 }, { x: -62, z: 110 }, { x: -90, z: 100 }, { x: -66, z: 64 }, { x: -96, z: 41 }, { x: -116, z: 22 }, { x: 116, z: 20 }, { x: 114, z: -20 }] },
    { kind: 'crab', mob: { name: '锈壳钟蟹', model: 'dlc1_bellcrab', hp: 4800, dmg: 135, interval: 2.1, speed: 3.0, range: 2.4, aggro: 11, xp: 230, scale: 1.25, tint: 0x5a3a22, tintK: 0.35, loot: 'trash_ember' },
      at: [{ x: -104, z: -30 }, { x: -112, z: -42 }, { x: -84, z: -60 }, { x: -52, z: -92 }, { x: 108, z: -54 }, { x: 60, z: -90 }] },
    { kind: 'moth', mob: { name: '井灯蛾', model: 'dlc1_lantern_moth', hp: 3600, dmg: 130, interval: 2.2, speed: 4.2, range: 10, aggro: 12, xp: 210, ranged: true, shot: { color: 0x60ffd0, el: 'arcane' }, loot: 'trash_ember' },
      at: [{ x: -38, z: -46 }, { x: -28, z: 14 }, { x: 24, z: 50 }, { x: 62, z: -50 }, { x: 62, z: -30 }] },
  ],
  guard: 'crab',
  drops: (diff, ilvl) => {
    const k = ECHO_DROP_TABLE.diffK[diff] ?? 1;
    const rand = (last: boolean) => ({ name: '40 级本职业新橙装（回响传说）', quality: 'orange', chance: `${last ? '2 次 × ' : ''}${pct((WELL_LG.chance[diff] ?? WELL_LG.chance.heroic)[last ? 1 : 0])} · 装等 ${ilvl}`, tip: `连续 ${WELL_LG.force} 次没出新件必掉缺的件；11-08 起钟井首领不再掉其他品质装备` });
    const echo = (p: number) => ({ name: '回响钟纹（本职业未拥有）', quality: 'orange', chance: pct(p * k), tip: '第 8 技能格（G）的技能物品' });
    // 11-07：掉落表补上 40 级套装 / 暗金（实际掉落在 wellDrops，此处按同一组概率显示）
    const set = (last: boolean) => ({ name: '40 级本职业套装（与熔炉 / 钟楼共用保底）', quality: 'green', chance: pct(s40WellChance(diff, last)), tip: '连续 3 次没出就只挑缺的件，6 次必出缺的件' });
    const dark = { name: '40 级本职业暗金武器', quality: 'dark', chance: pct(BT_DARK_CHANCE), tip: '只在尾王；双持职业优先补缺的那件' };
    return WELL_BOSSES.map((b, i) => { const last = i === WELL_BOSSES.length - 1;
      return { title: `首领 ${i + 1} · ${b.name}`, rows: [rand(last), echo(last ? ECHO_DROP_TABLE.last : ECHO_DROP_TABLE.boss), ...(s40ForgeChance(diff, last) > 0 ? [set(last)] : []), ...(last && diff !== 'normal' ? [dark] : [])] }; });
  },
  onBossDown, onComplete,
};
// 11-07 BUG#18：炼狱借用写进攻略（从 WELL_BORROW 取，改借用时攻略自动跟着变）
for (const b of WELL_BOSSES) { const br = WELL_BORROW[b.key], src = br && WELL_BOSSES.find(x => x.key === br.from), ab = src?.boss.abilities.find(a => a.id === br.id);
  if (src && ab) ((WELL_DUNGEON.guide!.boss ??= {})[b.key] ??= []).push(`炼狱：额外会用「${src.name.split(' · ').pop()}」的「${ab.name}」。`); }


/** A10 评委通道（报告第 13 节）：直接送到长副本 A 尾王（深潮之喉）门口——先拉首领资源（最多等 15 秒），进副本（普通难度、40 级同步），
 *  前 4 位首领由通道代打（无掉落展示），玩家传到井底沉钟腔前，看 70% 锁血 + 圆台坍塌。用本体调试入口 window.__game.packDungeon（DLC 不改本体文件）。 */
export const wellJudge = { busy: false, last: '' as string, stuck: -1 };
export async function wellJudgeTail(): Promise<boolean> {
  type U_ = { alive: boolean; hp: number; maxHp: number; pboss?: string; preDamage?: unknown };
  const G = (globalThis as unknown as { __game?: { packDungeon: { enter: (id: string, d: string) => boolean; units: () => { boss: U_ | null; cores: U_[]; trash: U_[] }; state: () => { id: string; i: number } | null }; fx: { dealDamage: (e: unknown, n: number, el: string, src: unknown) => void }; player: unknown } }).__game;
  if (!G || !ctx || wellJudge.busy) return false;
  wellJudge.busy = true; wellJudge.last = 'loading'; wellJudge.stuck = -1;
  try {
    ctx.toast('正在打开潮渊钟井（长副本 A），送你去尾王门口……', '#5ff0e0');
    await Promise.race([Promise.all([bossGlbEnsure(), wellTilesEnsure()]), new Promise(r => setTimeout(r, 15000))]);
    if (!G.packDungeon.enter(WELL_DG, 'normal')) { wellJudge.last = 'enter-fail'; return false; }
    const TAIL = WELL_BOSSES.length - 1, b5 = { x: WELL_O.x + WL_SPOTS.b5.x, z: WELL_O.z + WL_SPOTS.b5.z + 16 };
    const tailUp = () => { const st = G.packDungeon.state(), B = G.packDungeon.units().boss; return !!st && st.id === WELL_DG && st.i >= TAIL && !!B && B.alive && B.pboss === WELL_BOSSES[TAIL].key; };
    // fix1108 #2（Rhett 11-08 批）：代打前 4 个首领。每换一个首领提示进度；同一首领 6 轮（约 4 秒）血量不动 = 被锁血 / 门槛卡住，
    // 拆掉它和核心的 preDamage（双子 10% 互锁、门槛不可破）后补刀；整体最多约 126 秒。没刷出尾王就不传送过去，留在卡住的首领旁并提示。
    let lastI = -1, lastHp = -1, still = 0;
    for (let r = 0; r < 180; r++) {
      const st = G.packDungeon.state(); if (!st || st.id !== WELL_DG) { wellJudge.last = 'left'; return false; }
      if (st.i >= TAIL) { if (tailUp()) break; await new Promise(res => setTimeout(res, 700)); continue; }   // 尾王还没刷出来：等
      const U = G.packDungeon.units(), B = U.boss;
      if (st.i !== lastI) { lastI = st.i; still = 0; lastHp = -1; ctx.toast(`评委通道代打首领 ${st.i + 1}/${TAIL}：${WELL_BOSSES[st.i].name}……`, '#5ff0e0'); }
      const hpNow = B?.alive ? B.hp : -1;
      still = hpNow >= 0 && Math.abs(hpNow - lastHp) < 1 ? still + 1 : 0; lastHp = hpNow;
      const force = still >= 6;
      if (force) { wellJudge.stuck = st.i; if (still === 6) ctx.toast(`${WELL_BOSSES[st.i].name}处于锁血 / 门槛阶段，通道正在强制推进，请稍候……`, '#ffb060'); for (const c of U.cores) c.preDamage = undefined; }
      for (const e of U.trash) if (e.alive) G.fx.dealDamage(e, e.maxHp * 3, 'physical', G.player);
      for (const c of U.cores) if (c.alive) G.fx.dealDamage(c, c.maxHp * 9, 'physical', G.player);
      if (B?.alive) { if (force && !U.cores.some(c => c.alive)) B.preDamage = undefined; G.fx.dealDamage(B, B.maxHp * (force ? 9 : 1), 'physical', G.player); }
      ctx.teleport(b5.x, b5.z); ctx.heal?.(1);
      await new Promise(res => setTimeout(res, 700));
    }
    if (!tailUp()) {   // 卡住：不送去空的沉钟腔，送回卡住的首领旁边让评委自己打
      const st = G.packDungeon.state(), i = Math.min(st?.i ?? 0, TAIL), sp = WELL_BOSSES[i] as { x: number; z: number };
      if (st && st.id === WELL_DG) ctx.teleport(WELL_O.x + sp.x, WELL_O.z + sp.z + 8);   // 首领出生点南侧 8 米（双子是西岸死渡，不落黑水）
      ctx.heal?.(1);
      ctx.toast(`通道没能代打完「${WELL_BOSSES[i].name}」（首领 ${i + 1}），已把你送到它面前——可以自己打（伤害 ×3），或稍后再点一次「长副本 A · 尾王门口」重试`, '#ffb060');
      wellJudge.last = 'stuck'; return false;
    }
    ctx.teleport(b5.x, b5.z); ctx.heal?.(1);
    ctx.toast('井底 · 沉钟腔：深潮之喉就在前面——打到 70% 它会锁血撞台，圆台坍塌', '#5ff0e0');
    wellJudge.last = 'ok'; return true;
  } finally { wellJudge.busy = false; }
}

/** fix1108 #4（Rhett 11-08 批）评委面板「长副本 A · 从井口开打」：先拉首领资源（最多等 15 秒）再进副本（普通难度、40 级同步），落在井口 start */
export async function wellJudgeEnter(): Promise<boolean> {
  const G = (globalThis as unknown as { __game?: { packDungeon: { enter: (id: string, d: string) => boolean } } }).__game;
  if (!G || !ctx || wellJudge.busy) return false;
  wellJudge.busy = true;
  try {
    ctx.toast('正在打开潮渊钟井（长副本 A），从井口开始……', '#5ff0e0');
    await Promise.race([Promise.all([bossGlbEnsure(), wellTilesEnsure()]), new Promise(r => setTimeout(r, 15000))]);
    const ok = G.packDungeon.enter(WELL_DG, 'normal'); if (ok) ctx.heal?.(1);
    return ok;
  } finally { wellJudge.busy = false; }
}

/** 临时入口：运行时追加到无声钟楼的副本门（不改 belltower.ts；合并海岸升级后换到井口升降笼） */
type DGate = { id: string; name: string; x: number; z: number; opens: string; desc: string };
export function wellMountGate() {
  // fix1107 BUG#1 正式入口：沉钟海岸 · 锈锚码头井口（报告 10-2「乘井口升降笼下井」）。井台在海上，靠南支栈桥上去；门放井台北沿（栈桥尽头），
  // 交互半径 4 米覆盖栈桥尽头与井台北半圈。不另放拱门：井口吊架 / 升降笼本身就是入口造型（coast_dress）。钟楼东侧临时门已删（Rhett 11-07 22:44）。
  const c = (COAST_WILD as { dungeonGates?: DGate[] }).dungeonGates ??= [];
  if (!c.some(d => d.id === WELL_DG)) c.push({ id: WELL_DG, name: '潮渊钟井 · 海岸井口', x: WELL_GATE_COAST.x, z: WELL_GATE_COAST.z, opens: '', desc: '40 级长副本 · 5 个首领 · 乘井口升降笼下井' });
  // 11-07 10-1 指路任务的探索点：井口石台（运行时追加，不改 coast.ts 大对象）
  const sp = (COAST_WILD as { spots?: Record<string, { x: number; z: number; r: number; name: string }> }).spots ??= {};
  sp.cs_wellmouth ??= { x: 112, z: -2, r: 9, name: '锈锚码头井口' };
}
campDressBind([WELL_MAP]);   // fix1107 营地帐篷 / 货箱 / 栅栏桩换写实件（同镜渊城）

// ---------------------------------------------------------------- 伊奥拉隐藏任务：自选 40 级套装 1 件
let iolaEl: HTMLDivElement | null = null;
const iolaClose = () => { iolaEl?.remove(); iolaEl = null; };
export function wellIolaTalk(npc: unknown) {
  if (npc !== WELL_IOLA.id || !ctx) return;
  const cleared = Object.values(S.clears).some(n => n > 0);
  if (S.iola) { ctx.toast('伊奥拉：「钟声轻了好多。谢谢你一路下到井底。」', '#ffe08a'); return; }
  if (!cleared) { ctx.toast('伊奥拉：「先下到井底，把五个守钟的都打倒，再回来找我。」', '#ffe08a'); return; }
  const set = S40_SETS.find(x => x.id === S40_BY_CLASS[ctx!.classId()]); if (!set || typeof document === 'undefined') return;
  iolaClose();
  const e = document.createElement('div'); e.id = 'wl_iola_pick';
  e.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9000;min-width:380px;padding:18px 20px;background:linear-gradient(#1a1610f0,#0e0c08f0);border:1px solid #c9a060;border-radius:10px;color:#f4e6c8;font:15px/1.5 sans-serif;box-shadow:0 0 30px #000c';
  e.innerHTML = `<div style="font-size:18px;color:#ffd070;margin-bottom:4px">伊奥拉 · 井底的回礼</div><div style="color:#cdbb98;margin-bottom:10px">「你把它们都打倒了。拿一件吧，只能挑一件。」<br>${set.name.replace('（套装）', '')} · 自选 1 件</div>`
    + (set.pieces as string[]).map((id, i) => `<div data-p="${id}" style="padding:7px 10px;margin:4px 0;border:1px solid #6a5636;border-radius:6px;cursor:pointer;background:#2a2216">${(set.pieceNames as string[])[i] ?? id}</div>`).join('')
    + '<div data-x style="margin-top:10px;text-align:right;color:#a89070;cursor:pointer">以后再说</div>';
  e.querySelectorAll<HTMLElement>('[data-p]').forEach(b => { b.onmouseenter = () => { b.style.background = '#3a2e1c'; }; b.onmouseleave = () => { b.style.background = '#2a2216'; };
    b.onclick = () => { if (!ctx || S.iola) return iolaClose(); const n = ctx.dropFixed?.(b.dataset.p!, WELL_O.x + WELL_IOLA.x + 1.2, WELL_O.z + WELL_IOLA.z - 1.2);
      if (n) { S.iola = b.dataset.p!; ctx.toast(`伊奥拉的回礼：${n}`, '#ffd070'); ctx.save(); } iolaClose(); }; });
  (e.querySelector('[data-x]') as HTMLElement).onclick = iolaClose;
  document.body.appendChild(e); iolaEl = e;
}

// ---------------------------------------------------------------- 11-07 第十章指路任务 10-1 / 10-2（报告 §10，只指路、不卡进度：井口入口本来就开着）
const QE = (area: string, label: string) => ({ type: 'explore' as const, area, label });
export const CH10_QUESTS: QuestDef[] = [
  { id: 'cs10_1', name: '10-1 余响', giver: 'iola_b', turnIn: 'iola', minLevel: 40, requires: ['cs9_4'],
    text: '钟楼底下安静了，可我还听得见一声——很低，很远，像是从海里传上来的。沉钟海岸东边的锈锚码头有一口老井，码头工人说，井里的钟一千年前就沉下去了。去那口井看看，我在海岸等你。',
    doneText: '你也听见了，对吧？那不是回声，是有人在井底敲钟。井口的升降笼锈住了，可还能动。',
    objectives: [QE('cs_wellmouth', '抵达锈锚码头井口')], reward: { xp: 20000, gold: 800, item: { minQuality: 'blue' } } },
  { id: 'cs10_2', name: '10-2 潮渊', giver: 'iola', turnIn: 'iola_w', minLevel: 40, requires: ['cs10_1'],
    text: '坐升降笼下去，井口有一块落脚的地方，我在那里等你。下面会一层比一层深——井口码头、半淹的礼拜堂、冰封的湖、黑水两岸，最底下是那口裂钟。',
    doneText: '你下来了。往下走吧，每打倒一个守钟的，钟声就轻一点。等你打通了，回来找我。',
    objectives: [QE('wl_entry', '乘升降笼下到潮渊钟井井口')], reward: { xp: 22000, gold: 900, item: { minQuality: 'purple' } } },
];
