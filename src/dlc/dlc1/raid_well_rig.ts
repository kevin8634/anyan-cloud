import { waterRipple } from './water_fx';   // 11-15 水面涟漪
// ======================================================================
// 长副本 A「潮渊钟井」首领：体型 + 绑骨 + 动作 + 战斗反馈（v1.2.69-A7）
// 通用骨架 / 动画器在 boss_rig.ts；这里是 6 个首领模型各自的地标（RIG_OVERRIDE）、身高倍数、招式表与战斗反馈。
//   - 绑骨方式：Lux3D 自动绑骨实测失败（戈尔顿 MODEL_NOT_RIGGABLE，扣分 0）→ 全部浏览器端程序化蒙皮；
//     低画质 / 商用 base 包（没有 Lux3D 模型，回退原 DLC 模型）/ 蒙皮出错 → 整体动作兜底（同一状态机）。
//   - 身高：以玩家显示身高 PLAYER_H 为基准，人形 2.2–2.8 倍（戈尔顿 / 维尔格最壮），双子 2.2 倍，尾王莫尔维斯 4.3 倍。
//   - 反馈：出手帧按距离震屏（大招更强）、地面裂纹 / 水花 / 冰碴 / 尘土、重击 / 吼叫 / 施法合成音、尾王出手时井心裂钟共鸣摆动。
// ======================================================================
import * as THREE from 'three';
import type { PackCtx } from '../../core/ContentPacks';
import type { ClassFxApi } from '../../core/ClassExt';
import { makeGlbCreature } from '../../web/creatures_glb';
import { curQuality } from '../../web/gfx';
import { PACK_CREATURE_GLB } from './creatures.gen';
import { makeBossGlb, bossGlbHas, bossGlbReady } from './boss_glb';
import { skinLuxRig, wrapWholeBody, BOSS_POSE, BossProcAnim, type BossRigSpec, type BossAnimOpts, type MoveDef, type BossRigHandle, type BuiltBossRig, type BossTpl } from './boss_rig';
import { thud, rubble, roar as roarS, growl, wind, clang, bell, chains, whisper } from './sfx_kit';
import { SKILL_FX, setFxGround, later, type SkillFxCtx } from './boss_fx';

/** 玩家显示身高（米）：职业模型 makeCharacter height 2.1（战士 / 猎手等，法师 2.0–2.05）× 本体体型 BODY_SCALE 1.1 = 2.31。
 *  fix1106（Rhett 16:45「首领按玩家实际比例放大」）：原写死 1.95 比玩家实际矮约 16%，首领 / NPC 都按它换算 → 显得小 */
export const PLAYER_H = 2.1 * 1.1;
/** 本体 Enemy 构造时统一放大 10%（main.ts BODY_SCALE） */
const BODY_K = 1.1;
type Pbr = { roughness?: number; metalness?: number; emissive?: number; emissiveK?: number };
export interface WlBody {
  /** 显示身高 = mul × 玩家身高 */
  mul: number;
  /** 首领 mob.scale（碰撞 / 推挤半径 / 特效尺度跟它走） */
  scale: number;
  tpl: BossTpl; fb: string; pbr: Pbr; heavy: number; leftHand?: boolean;
  /** 鱼形：把头部挪到单位原点（身高单位） */
  offZ?: number;
  theme: 'dock' | 'chapel' | 'ice' | 'black' | 'abyss';
}
export const WL_BODY: Record<string, WlBody> = {
  wl_gordon: { mul: 2.75, scale: 2.4, tpl: 'H', fb: 'dlc1_echo_foreman', heavy: 1.35, theme: 'dock', pbr: { roughness: 0.7, metalness: 0.15 } },
  wl_sarin: { mul: 2.4, scale: 2.2, tpl: 'robe', fb: 'dlc1_siren', heavy: 1.05, theme: 'chapel', pbr: { roughness: 0.6, emissive: 0x104030, emissiveK: 0.35 } },
  wl_virg: { mul: 2.7, scale: 2.4, tpl: 'H', fb: 'dlc1_bell_sentinel', heavy: 1.3, theme: 'ice', pbr: { roughness: 0.45, metalness: 0.5, emissive: 0x0a2040, emissiveK: 0.3 } },
  wl_ferry_death: { mul: 2.2, scale: 2.1, tpl: 'robe', fb: 'dlc1_echo_priest', heavy: 1.15, leftHand: true, theme: 'black', pbr: { roughness: 0.65, emissive: 0x1a0a2a, emissiveK: 0.4 } },
  wl_ferry_life: { mul: 2.2, scale: 2.1, tpl: 'H', fb: 'dlc1_echo_priest', heavy: 1.1, theme: 'black', pbr: { roughness: 0.65, emissive: 0x202018, emissiveK: 0.3 } },
  wl_morvis: { mul: 4.3, scale: 3.0, tpl: 'fish', fb: 'dlc1_sleeper_b', heavy: 1.6, offZ: 0.25, theme: 'abyss', pbr: { roughness: 0.4, metalness: 0.1, emissive: 0x00303a, emissiveK: 0.4 } },
};
/** 程序化蒙皮回退开关（11-01 绑骨标准：程序化蒙皮不作为正式动作，默认关）。
 *  开：URL 带 ?wlskin=1 或 localStorage wl_procskin=1，或调试 __dlc1.well.procSkin(true)（对之后新建的首领生效）。
 *  关（默认）：写实模型整体动作（同一套预备→出手→收招状态机 + 反馈），等正式绑骨件（A9）接入后替换。 */
const procInit = (() => { try { const g = globalThis as unknown as { location?: { search?: string }; localStorage?: Storage }; return /[?&]wlskin=1/.test(g.location?.search ?? '') || g.localStorage?.getItem('wl_procskin') === '1'; } catch { return false; } })();
/** A9（11-04）：莫尔维斯没有 Lux3D 正式绑骨件（本地精绑件按规则不顶替正式件；非人形 Lux3D 绑骨待 Rhett 定）→ 逐招动作走浏览器端程序化蒙皮（BossProcAnim 鱼形骨架 + 逐招姿势），默认开；
 *  ?wlskin=0 / localStorage wl_fishskin=0 关回静态件。人形首领都有正式绑骨件，不受影响。 */
const fishInit = (() => { try { const g = globalThis as unknown as { location?: { search?: string }; localStorage?: Storage }; return !/[?&]wlskin=0/.test(g.location?.search ?? '') && g.localStorage?.getItem('wl_fishskin') !== '0'; } catch { return true; } })();
export const WL_RIG_OPT = { procSkin: procInit, fishSkin: fishInit };
export const wellProcSkin = (on?: boolean) => { if (typeof on === 'boolean') WL_RIG_OPT.procSkin = on; return WL_RIG_OPT.procSkin; };
/** 整体姿态回退开关（静态写实模型整体前倾 / 扭转 / 倒地；11-01 绑骨标准不算动作 → 默认关）。开：?wlpose=1 / localStorage wl_wholepose=1 / __dlc1.well.pose(true) */
BOSS_POSE.whole = (() => { try { const g = globalThis as unknown as { location?: { search?: string }; localStorage?: Storage }; return /[?&]wlpose=1/.test(g.location?.search ?? '') || g.localStorage?.getItem('wl_wholepose') === '1'; } catch { return false; } })();
export const wellWholePose = (on?: boolean) => { if (typeof on === 'boolean') BOSS_POSE.whole = on; return BOSS_POSE.whole; };
/** 读条预警用的技能名（raid_well.ts 定义首领后登记：技能 id → { 首领名, 技能名 }） */
export const WL_MOVE_NAMES: Record<string, Record<string, { boss: string; name: string }>> = {};
/** 11-07：各招判定半径（raid_well.ts 放大后登记；首领特效的地面圈按它画，与本体预警圈一致） */
export const WL_MOVE_R: Record<string, Record<string, number>> = {};
/** 显示身高（世界米） */
export const wlHeight = (id: string) => WL_BODY[id].mul * PLAYER_H;
/** 模型本地身高（未乘 mob.scale 与本体 1.1） */
const localH = (id: string) => wlHeight(id) / (WL_BODY[id].scale * BODY_K);

// ---------------------------------------------------------------- 地标（RIG_OVERRIDE；dev 分析：GLB 顶点剖面 + 正 / 侧视散点叠骨架核对）
const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
export const WL_RIG: Record<string, BossRigSpec> = {
  wl_gordon: { tpl: 'H', j: { hips: V(0.09, 0.47, 0.03), spine: V(0.09, 0.6, 0), chest: V(0.09, 0.72, -0.03), neck: V(0.09, 0.82, 0), head: V(0.09, 0.88, 0.03), top: V(0.09, 0.99, 0.03),
      shR: V(-0.05, 0.77, -0.02), elR: V(-0.14, 0.58, 0.02), haR: V(-0.16, 0.39, 0.1), shL: V(0.24, 0.77, -0.02), elL: V(0.3, 0.59, -0.01), haL: V(0.36, 0.38, 0.1),
      thR: V(0.03, 0.44, 0.03), knR: V(0.02, 0.25, 0.04), ftR: V(0.01, 0.04, 0.04), thL: V(0.17, 0.44, 0), knL: V(0.18, 0.25, -0.03), ftL: V(0.18, 0.04, -0.12) },
    rigid: [{ bone: 'haR', box: [-0.6, -0.11, -0.02, 0.36, -0.5, 0.5] }, { bone: 'haL', box: [0.37, 0.6, 0.28, 0.44, -0.3, 0.4] }] },
  wl_sarin: { tpl: 'robe', j: { hips: V(0.06, 0.5, -0.03), spine: V(0.06, 0.61, -0.03), chest: V(0.06, 0.72, -0.03), neck: V(0.06, 0.8, -0.02), head: V(0.06, 0.87, -0.01), top: V(0.06, 0.99, -0.01),
      shR: V(-0.06, 0.77, -0.02), elR: V(-0.11, 0.7, 0.06), haR: V(-0.19, 0.69, 0.08), shL: V(0.18, 0.77, -0.02), elL: V(0.23, 0.62, -0.02), haL: V(0.25, 0.5, 0),
      thR: V(0.02, 0.47, -0.03), knR: V(0, 0.26, -0.03), ftR: V(0.02, 0.03, 0.06), thL: V(0.11, 0.47, -0.03), knL: V(0.11, 0.26, -0.04), ftL: V(0.09, 0.03, -0.02) },
    rigid: [{ bone: 'haR', box: [-0.36, -0.175, 0.24, 1.02, -0.3, 0.3] }] },
  wl_virg: { tpl: 'H', cape: -0.16, j: { hips: V(0.09, 0.49, -0.06), spine: V(0.09, 0.6, -0.06), chest: V(0.1, 0.72, -0.06), neck: V(0.1, 0.82, -0.06), head: V(0.1, 0.88, -0.05), top: V(0.1, 0.99, -0.05),
      shR: V(-0.04, 0.77, -0.06), elR: V(-0.1, 0.61, -0.03), haR: V(-0.02, 0.45, 0.1), shL: V(0.24, 0.77, -0.06), elL: V(0.3, 0.62, -0.03), haL: V(0.33, 0.52, 0),
      thR: V(0.02, 0.46, -0.07), knR: V(0, 0.26, -0.08), ftR: V(-0.01, 0.03, -0.06), thL: V(0.17, 0.46, -0.07), knL: V(0.18, 0.26, -0.06), ftL: V(0.19, 0.03, 0),
      capeA: V(0.1, 0.74, -0.18), capeB: V(0, 0.35, -0.28), capeC: V(-0.2, 0.05, -0.4) },
    rigid: [{ bone: 'haR', a: V(0, 0.44, 0.12), b: V(0.19, 0.31, 0.45), r: 0.05 }, { bone: 'elL', box: [0.28, 0.47, 0.28, 0.8, -0.2, 0.16] }] },
  wl_ferry_life: { tpl: 'H', cape: -0.1, j: { hips: V(0.07, 0.5, 0.03), spine: V(0.07, 0.61, 0.04), chest: V(0.08, 0.72, 0.06), neck: V(0.07, 0.81, 0.07), head: V(0.06, 0.88, 0.08), top: V(0.06, 0.98, 0.08),
      shR: V(-0.05, 0.77, 0.05), elR: V(-0.1, 0.6, 0.06), haR: V(-0.08, 0.45, 0.11), shL: V(0.19, 0.77, 0.05), elL: V(0.24, 0.62, 0.04), haL: V(0.21, 0.7, 0.17),
      thR: V(0.02, 0.47, 0.04), knR: V(0.02, 0.27, 0.08), ftR: V(0.02, 0.03, 0.17), thL: V(0.11, 0.47, 0.02), knL: V(0.1, 0.27, -0.03), ftL: V(0.06, 0.04, -0.12),
      capeA: V(0.07, 0.72, -0.08), capeB: V(0.05, 0.4, -0.2), capeC: V(0, 0.15, -0.3) },
    rigid: [{ bone: 'haR', a: V(-0.39, 0.08, -0.04), b: V(0.27, 0.84, 0.27), r: 0.03 }, { bone: 'haR', box: [0.25, 0.37, 0.77, 1.02, 0.2, 0.36] }] },
  wl_ferry_death: { tpl: 'robe', j: { hips: V(0.05, 0.5, 0), spine: V(0.05, 0.61, 0), chest: V(0.05, 0.72, 0), neck: V(0.04, 0.81, 0.01), head: V(0.03, 0.87, 0.02), top: V(0.03, 0.95, 0.02),
      shR: V(-0.07, 0.76, 0), elR: V(-0.11, 0.58, 0.02), haR: V(-0.12, 0.44, 0.04), shL: V(0.15, 0.76, 0), elL: V(0.19, 0.62, -0.02), haL: V(0.17, 0.72, 0.07),
      thR: V(0.01, 0.47, 0), knR: V(0.01, 0.27, -0.02), ftR: V(0.01, 0.03, 0), thL: V(0.09, 0.47, 0), knL: V(0.09, 0.27, -0.03), ftL: V(0.09, 0.03, 0) },
    rigid: [{ bone: 'haL', a: V(-0.32, 0.03, 0.05), b: V(0.23, 0.8, 0.07), r: 0.03 }, { bone: 'haL', box: [0.23, 0.34, 0.76, 1.02, 0.0, 0.14] }] },
  wl_morvis: { tpl: 'fish', j: { body: V(0, 0.55, 0), head: V(0, 0.55, 0.25), snout: V(0, 0.6, 0.62), jaw: V(0, 0.47, 0.22), jawTip: V(0, 0.33, 0.52), lure: V(0, 0.85, 0.33), lureTip: V(0, 0.72, 0.66),
      tail1: V(0, 0.58, -0.25), tail2: V(0, 0.62, -0.48), tailTip: V(0, 0.62, -0.69), finR: V(-0.24, 0.5, 0.03), finRt: V(-0.36, 0.5, 0.03), finL: V(0.24, 0.5, 0.03), finLt: V(0.36, 0.5, 0.03),
      legRo: V(-0.15, 0.3, 0.1), legRoT: V(-0.22, 0, 0.12), legLo: V(0.15, 0.3, 0.1), legLoT: V(0.22, 0, 0.12), legRi: V(-0.02, 0.3, 0), legRiT: V(-0.01, 0.05, 0.15), legLi: V(0.02, 0.3, 0), legLiT: V(0.01, 0.05, 0.15), top: V(0, 0.87, 0) },
    rigid: [{ bone: 'lure', box: [-0.05, 0.05, 0.62, 0.95, 0.5, 0.72] }] },
};

// ---------------------------------------------------------------- 招式表（技能 id → 动作风格）
type Moves = { moves: Record<string, MoveDef>; melee: MoveDef };
const MOVES: Record<string, Moves> = {
  wl_gordon: { melee: { style: 'chop', power: 0.75 }, moves: { sweep: { style: 'sweep', power: 1 }, hook: { style: 'throw', power: 0.7 }, blood: { style: 'fling', power: 0.4 }, hooks: { style: 'summon', power: 0.35 } } },
  wl_sarin: { melee: { style: 'jab', power: 0.35 }, moves: { fog: { style: 'fling', power: 0.4 }, shriek: { style: 'spell', power: 0.95 }, mark: { style: 'jab', power: 0.55 }, souls: { style: 'summon', power: 0.4 } } },
  wl_virg: { melee: { style: 'chop', power: 0.7 }, moves: { crack: { style: 'slam', power: 1 }, oath: { style: 'spell', power: 0.9 }, spike: { style: 'thrust', power: 0.85 }, bash: { style: 'bash', power: 0.8 }, guard: { style: 'summon', power: 0.35 } } },
  wl_ferry_death: { melee: { style: 'thrust', power: 0.6 }, moves: { life: { style: 'spell', power: 0.6 }, death: { style: 'spell', power: 0.8 }, oar: { style: 'sweep', power: 0.9 }, ferry: { style: 'summon', power: 0.35 } } },
  wl_ferry_life: { melee: { style: 'thrust', power: 0.5 }, moves: { mend: { style: 'spell', power: 0.6 } } },
  wl_morvis: { melee: { style: 'bite', power: 0.8 }, moves: { surge: { style: 'rear', power: 1 }, bite: { style: 'bite', power: 1 }, lure: { style: 'lure', power: 0.8 }, drool: { style: 'fling', power: 0.45 }, eels: { style: 'summon', power: 0.5 }, flood: { style: 'summon', power: 0.6 } } },
};
/** A9：莫尔维斯（无正式绑骨件 → 程序化鱼形骨架）逐招姿势：w 预备 / s 出手 / f 收招余势 / o 预备期摆动（乘 sin）/ hz 摆动频率。
 *  关节：body / head / jaw / lure / tail1-3 / finR/L / legRo/Lo/Ri/Li；_root = [前后, 上下]（身高单位），_pitch / _roll = 整体俯仰 / 侧倾（巨物重心） */
const KEYED: Record<string, BossAnimOpts['keyed']> = {
  wl_morvis: {
    melee: { w: { body: [-0.15, 0.15, 0], head: [-0.2, 0.2, 0], jaw: [0.6, 0, 0], tail1: [0.1, -0.3, 0], tail2: [0.15, -0.3, 0], finR: [0, 0, -0.4], finL: [0, 0, 0.4], legRo: [0.3, 0, 0], legLo: [-0.3, 0, 0], _root: [-0.05, 0.01, 0] },
      s: { body: [0.1, -0.1, 0], head: [0.2, -0.15, 0], jaw: [0.0, 0, 0], tail1: [-0.2, 0.3, 0], tail2: [-0.25, 0.35, 0], legRo: [-0.4, 0, 0], legLo: [0.3, 0, 0], _root: [0.12, -0.02, 0] } },
    bite: { w: { _pitch: [-0.22, 0, 0], body: [-0.2, 0, 0], head: [-0.35, 0, 0], jaw: [0.95, 0, 0], tail1: [0.3, 0, 0], tail2: [0.35, 0, 0], finR: [0, 0, -0.9], finL: [0, 0, 0.9], legRo: [0.5, 0, 0], legLo: [0.5, 0, 0], legRi: [0.4, 0, 0], legLi: [0.4, 0, 0], _root: [-0.12, 0.05, 0] },
      s: { _pitch: [0.2, 0, 0], body: [0.15, 0, 0], head: [0.35, 0, 0], jaw: [-0.05, 0, 0], tail1: [-0.35, 0, 0], tail2: [-0.4, 0, 0], finR: [0, 0, 0.3], finL: [0, 0, -0.3], legRo: [-0.6, 0, 0], legLo: [-0.6, 0, 0], legRi: [-0.4, 0, 0], legLi: [-0.4, 0, 0], _root: [0.22, -0.05, 0] },
      f: { _pitch: [0.1, 0, 0], head: [0.2, 0.2, 0], jaw: [0.3, 0, 0], _root: [0.12, -0.03, 0] } },
    surge: { w: { _pitch: [-0.55, 0, 0], head: [-0.3, 0, 0], jaw: [0.7, 0, 0], tail1: [0.45, 0, 0], tail2: [0.35, 0, 0], tail3: [0.3, 0, 0], finR: [0, 0, -1.1], finL: [0, 0, 1.1], legRo: [-0.6, 0, 0], legLo: [-0.6, 0, 0], _root: [-0.06, 0.16, 0] },
      s: { _pitch: [0.25, 0, 0], head: [0.25, 0, 0], jaw: [0.15, 0, 0], tail1: [-0.4, 0, 0], tail2: [-0.3, 0, 0], finR: [0, 0, 0.4], finL: [0, 0, -0.4], legRo: [0.3, 0, 0], legLo: [0.3, 0, 0], _root: [0.06, -0.08, 0] },
      f: { _pitch: [0.12, 0, 0.04], tail1: [-0.2, 0.3, 0], _root: [0.03, -0.05, 0] } },
    lure: { w: { head: [0.18, 0, 0], body: [0.08, 0, 0], lure: [-0.55, 0, 0], jaw: [0.3, 0, 0], finR: [0, 0, -0.2], finL: [0, 0, 0.2] }, o: { lure: [0.12, 0, 0.45], head: [0, 0.12, 0.05], tail1: [0, 0.25, 0] }, hz: 5,
      s: { head: [-0.3, 0, 0], lure: [0.6, 0, 0], jaw: [1.0, 0, 0], finR: [0, 0, -0.7], finL: [0, 0, 0.7], _root: [0.04, 0.03, 0] } },
    drool: { w: { head: [-0.15, 0.45, 0], body: [0, 0.2, 0], jaw: [0.55, 0, 0], tail1: [0, -0.3, 0] }, s: { head: [0.15, -0.45, 0], body: [0.05, -0.2, 0], jaw: [0.75, 0, 0], tail1: [0, 0.35, 0], _root: [0.05, 0, 0] } },
    eels: { w: { _pitch: [-0.15, 0, 0], jaw: [0.95, 0, 0], finR: [0, 0, -1.0], finL: [0, 0, 1.0], tail1: [0.2, 0, 0] }, o: { body: [0.03, 0, 0.05], finR: [0, 0.3, 0], finL: [0, -0.3, 0] }, hz: 14,
      s: { _pitch: [0.12, 0, 0], jaw: [0.3, 0, 0], finR: [0, 0, 0.2], finL: [0, 0, -0.2], _root: [0, -0.04, 0] } },
    flood: { w: { _pitch: [-0.3, 0, 0], tail1: [0.6, 0, 0], tail2: [0.5, 0, 0], tail3: [0.4, 0, 0], jaw: [0.6, 0, 0], _root: [0, 0.08, 0] },
      s: { _pitch: [0.18, 0, 0], tail1: [-0.6, 0, 0], tail2: [-0.55, 0, 0], tail3: [-0.4, 0, 0], jaw: [0.2, 0, 0], _root: [0, -0.06, 0] }, f: { tail1: [0.3, 0, 0], tail2: [0.3, 0, 0] } },
  },
};

// ---------------------------------------------------------------- 战斗反馈（音效 / 粒子 / 震屏 / 场景）
let ctx: PackCtx | null = null;
export const bindWellRig = (c: PackCtx) => { ctx = c; };
/** 读条预警记录（测试用） */
export const warnLog: { t: number; id: string; key: string; dur: number }[] = [];
const warnClock: Record<string, number> = {};
/** 尾王出手时井心裂钟共鸣：raid_well.ts 建场景时登记，wellUpdate 每帧摆 */
export const bellSwing = { obj: null as THREE.Object3D | null, amp: 0, t: 0, rings: 0 };
const FX = (): ClassFxApi | null => { try { return ctx?.fx?.() ?? null; } catch { return null; } };
const COL = { dock: 0x8a6a44, chapel: 0x40e0a0, ice: 0xbfe8ff, black: 0x60d0c8, abyss: 0x50f0e0 };
const distTo = (p: THREE.Vector3) => { const q = ctx?.playerPos(); return q ? Math.hypot(q.x - p.x, q.z - p.z) : 99; };
const shakeAt = (F: ClassFxApi, p: THREE.Vector3, power: number, reach = 28) => { waterRipple(p.x, p.z, Math.min(1.6, 0.5 + power));   // 11-15 首领砸地震纹
  const d = distTo(p), k = power * Math.max(0, 1 - d / reach); if (k > 0.05) F.feel(power >= 0.9 ? 'ultimate' : 'heavy', Math.min(1.2, k * 1.1)); };
/** 出手点（世界）：主武器手 → 落到地面；整体动作兜底 = 身前 0.3 身高 */
function strikePoint(h: BossRigHandle, left: boolean, fish: boolean): THREE.Vector3 {
  const r = h.root; r.updateWorldMatrix(true, false);
  const base = r.getWorldPosition(new THREE.Vector3()), fwd = r.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const hand = h.worldOf(fish ? 'jaw' : left ? 'haL' : 'haR');
  const p = hand && hand.distanceTo(base) < h.height * 1.2 ? hand : base.clone().addScaledVector(fwd, h.height * (fish ? 0.45 : 0.3));
  p.y = base.y; return p;
}
/** 地面裂纹：一圈不规则暗缝 + 发光芯，3 秒淡出 */
function crackDecal(F: ClassFxApi, p: THREE.Vector3, r: number, color: number) {
  const g = new THREE.Group(), dark = new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0.85, depthWrite: false }), glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const m of [dark, glow]) m.userData.outlineParameters = { visible: false };
  let s = (p.x * 73 + p.z * 31) | 0; const rnd = () => ((s = (s * 16807 + 11) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rnd() * 0.5, L = r * (0.5 + rnd() * 0.6);
    for (const [m, w] of [[dark, 0.16], [glow, 0.05]] as const) { const q = new THREE.Mesh(new THREE.PlaneGeometry(w * r * 0.5, L), m); q.rotation.set(-Math.PI / 2, 0, a); q.position.set(-Math.sin(a) * L / 2, m === glow ? 0.012 : 0.006, -Math.cos(a) * L / 2); g.add(q); }
  }
  g.position.set(p.x, floorAt(F, p.x, p.z, p.y) + 0.06, p.z);
  F.live(g, 3.2, k => { dark.opacity = 0.85 * (1 - Math.max(0, k - 0.6) / 0.4); glow.opacity = 0.9 * Math.max(0, 1 - k * 1.6); });
}
/** 施法聚光：持杖手上一团光逐渐变大变亮（预备时长 dur） */
function gatherLight(F: ClassFxApi, h: BossRigHandle, bone: string, color: number, dur: number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  (m.material as THREE.Material).userData.outlineParameters = { visible: false };
  const l = new THREE.PointLight(color, 0, h.height * 2.5); m.add(l);
  const at = () => h.worldOf(bone) ?? h.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h.height * 0.8, 0));
  F.live(m, dur, (k) => { const p = at(); m.position.copy(p); const s = h.height * (0.03 + 0.07 * k); m.scale.setScalar(s); (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.6 * k; l.intensity = 6 * k;
    if (Math.random() < 0.5) { const a = Math.random() * 6.28, r = h.height * 0.35; F.fx('dot', { x: p.x + Math.cos(a) * r, y: p.y + (Math.random() - 0.3) * r, z: p.z + Math.sin(a) * r }, { count: 1, color, speed: 0.2, life: 0.35, size: 0.35 } as never); } });
}
/** A7：本体把红圈 / 毒池画在「地形高度 +0.06」，井里首领台（地形外的造景平台）比地形高，圈会被埋在台面下面看不见。
 *  每个新圈只做一次：从圈心上方往下打射线，取圈高度 +1.5 米以内最高的大块朝上表面（台面，半径 ≥5 米），比圈低就不动，比圈高就把圈抬到台面上 +0.05。返回抬高量 */
export const surfDone = new WeakSet<THREE.Object3D>(); const surfRay = new THREE.Raycaster(); surfRay.camera = new THREE.PerspectiveCamera();   // 场景里有 Sprite（血条 / 名牌），Sprite.raycast 需要 raycaster.camera，否则报错并让内容包 update 被停用
/** 台面高度（世界 y）：从 (x, y0+7, z) 往下打射线，y0 以上 1.5 米内最高的大块朝上表面；没有 = null。exclude = 不算的物体 */
export function surfaceY(sc: THREE.Object3D, x: number, z: number, y0: number, exclude?: THREE.Object3D): number | null {
  surfRay.set(new THREE.Vector3(x, y0 + 7, z), new THREE.Vector3(0, -1, 0)); surfRay.far = 8;
  let best: number | null = null;
  let hits: THREE.Intersection[]; try { hits = surfRay.intersectObjects(sc.children, true); } catch { return null; }   // 射线出错只放弃这一次抬高，不能连累内容包 update
  for (const h of hits) {
    const m = h.object as THREE.Mesh, mat = m.material as THREE.Material | undefined;
    if (!m.isMesh || m === exclude || !h.face || (mat && (mat.transparent || mat.depthWrite === false))) continue;
    if (h.face.normal.clone().transformDirection(m.matrixWorld).y < 0.7) continue;
    if (h.point.y < y0 - 0.3 || h.point.y > y0 + 1.5) continue;
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const ws = new THREE.Vector3().setFromMatrixScale(m.matrixWorld), R = (g.boundingSphere?.radius ?? 0) * Math.max(ws.x, ws.z);
    if (R < 5) continue;   // 只认大块地面 / 台面（人物、石头、小件不算）
    best = best === null ? h.point.y : Math.max(best, h.point.y);
  }
  return best;
}
export function onSurface(o: THREE.Object3D): number {
  if (surfDone.has(o)) return 0; surfDone.add(o);
  const sc = o.parent; if (!sc) return 0;
  const p = o.position, best = surfaceY(sc, p.x, p.z, p.y, o);
  if (best === null || best + 0.05 <= p.y) return 0;
  const dy = best + 0.05 - p.y; p.y += dy; return dy;
}
let sceneRef: THREE.Object3D | null = null;
const topOf = (o: THREE.Object3D) => { let q = o; while (q.parent) q = q.parent; return q; };
/** 每帧：场景顶层新出现的平放半透明面片（本体红圈 / 毒池 / 地面贴花，都直接加在场景根上）各检查一次，埋在台面下就抬上来。
 *  不 import 本体 enemies（会打乱内容包注册顺序），按形状认：Mesh、绕 x 轴 -90°、材质半透明或 ShaderMaterial */
export function liftDecals(anyObj: THREE.Object3D) {
  const sc = topOf(anyObj); sceneRef = sc; let n = 0;
  for (const o of sc.children) {
    if (surfDone.has(o)) continue;
    if (n >= 3) break;   // 每帧最多打 3 条射线（大量特效同时出现时分摊到后几帧）
    const m = o as THREE.Mesh; if (!m.isMesh || Math.abs(m.rotation.x + Math.PI / 2) > 0.02) continue;
    const mat = m.material as THREE.Material; if (!mat || !(mat.transparent || (mat as THREE.ShaderMaterial).isShaderMaterial)) { surfDone.add(o); continue; }
    onSurface(o); n++;
  }
}
/** 特效落地高度：台面（有）或地形 */
const floorAt = (F: ClassFxApi, x: number, z: number, y: number) => { const g = F.gy?.(x, z) ?? y; const sy = sceneRef ? surfaceY(sceneRef, x, z, g) : null; return sy !== null && sy > g ? sy : g; };
setFxGround((x, z, y) => { const F = FX(); return F ? floorAt(F, x, z, y) : y; });
// ---------------------------------------------------------------- 首领预警（团队警报风格，借鉴 MMO 首领战的设计语言：画面下方中间（不挡首领）大字 + 技能名 + 倒计时条 + 应对提示，按危险类型配色）
type WarnKind = 'ground' | 'front' | 'spell' | 'line';
const WARN_STYLE: Record<WarnKind, { c: string; tip: string }> = {
  ground: { c: '#ff6a2a', tip: '离开地面红圈' },
  front: { c: '#ff3a3a', tip: '躲到首领身后 / 两侧' },
  spell: { c: '#5cffd2', tip: '准备打断，或按机制站位' },
  line: { c: '#ffc84a', tip: '横向侧移躲开' },
};
/** 个别招式的专属应对提示（首领 id → 技能 id） */
const WARN_TIP: Record<string, Record<string, string>> = { wl_gordon: { hook: '打断读条，或拉开距离躲钩' }, wl_sarin: { shriek: '站进亮着的鱼油灯光圈' }, wl_virg: { oath: '散开，别站在冰面中心' }, wl_ferry_life: { mend: '打断它！（打断 / 眩晕技能都行）' }, wl_morvis: { surge: '离开井心，往外圈跑' } };
const warnKind = (m: MoveDef): WarnKind => m.style === 'spell' || m.style === 'lure' ? 'spell' : m.style === 'sweep' || m.style === 'bite' ? 'front' : m.style === 'thrust' || m.style === 'throw' ? 'line' : 'ground';
const rw = { el: null as HTMLDivElement | null, end: 0, dur: 1, hide: 0, last: '', now: 0, shift: false };   // now = 游戏时钟（rwTick 累加 dt；低帧率时倒计时跟游戏走，不跟墙钟）
/** 当前 / 最近一条预警（测试 / 截图用） */
export const raidWarnInfo = () => ({ text: rw.last, left: Math.max(0, rw.end - rw.now), shown: !!rw.el && rw.el.style.opacity !== '0', shifted: rw.shift });
function raidWarn(boss: string, skill: string, dur: number, kind: WarnKind, tip?: string) {
  const st = WARN_STYLE[kind], tp = tip ?? st.tip; rw.last = `${boss}「${skill}」${tp}`;
  rw.end = rw.now + dur; rw.dur = Math.max(0.3, dur); rw.hide = 0;
  const D = (globalThis as unknown as { document?: Document }).document; if (!D?.body?.appendChild) return false;
  if (!rw.el) {
    const e = D.createElement('div'); e.id = 'wl_raidwarn';
    e.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:9000;bottom:19%;pointer-events:none;text-align:center;font-family:inherit;transition:opacity .25s;min-width:420px';
    D.body.appendChild(e); rw.el = e;
  }
  rw.el.innerHTML = `<div style="font-size:15px;letter-spacing:2px;color:#ffe9c8;text-shadow:0 0 6px #000,0 0 2px #000">${boss}</div>`
    + `<div style="font-size:34px;font-weight:900;color:${st.c};text-shadow:0 0 14px ${st.c}99,0 2px 0 #000,0 0 4px #000;letter-spacing:3px">⚠ ${skill} ⚠</div>`
    + `<div style="margin:6px auto 4px;width:360px;height:12px;border:1px solid ${st.c};background:#000a;border-radius:7px;overflow:hidden;box-shadow:0 0 10px ${st.c}66"><i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,${st.c},#fff8);transform-origin:left"></i></div>`
    + `<div style="font-size:17px;color:#fff;text-shadow:0 0 5px #000,0 1px 0 #000"><b data-t>${dur.toFixed(1)}</b> 秒 · ${tp}</div>`;
  rw.el.style.opacity = '1'; rwTick(0); return true;
}
/** 每帧：倒计时条收缩、到点后停半秒淡出（raid_well.ts rigTick 调用） */
export function rwTick(dt: number) {
  rw.now += Math.max(0, Math.min(0.25, dt || 0));
  if (!rw.el) return; const now = rw.now, left = rw.end - now, k = Math.max(0, Math.min(1, left / rw.dur));
  const bar = rw.el.querySelector('i') as HTMLElement | null; if (bar) bar.style.transform = `scaleX(${k.toFixed(3)})`;
  const t = rw.el.querySelector('[data-t]') as HTMLElement | null; if (t) t.textContent = Math.max(0, left).toFixed(1);
  if (left < -0.6 && rw.el.style.opacity !== '0') rw.el.style.opacity = '0';
  rwDodgeInteract();
}
/** 摆渡待批第 6 条（Rhett 11-02 16:05 批）：屏幕上有交互提示「[E] …」时警报条上移一档，避免两者重叠；没有提示时回到 bottom 19% */
export function rwDodgeInteract() {
  if (!rw.el) return; const D = (globalThis as unknown as { document?: Document }).document, W = globalThis as unknown as { innerHeight?: number };
  const ib = D?.getElementById?.('interact') as HTMLElement | null; let bottom = '19%';
  if (ib && ib.style.display !== 'none' && ib.getBoundingClientRect) {
    const r = ib.getBoundingClientRect(), H = W.innerHeight || 0;
    if (r.height > 0 && H > 0) { const above = H - r.top + 14; if (above > H * 0.19) bottom = Math.round(above) + 'px'; }
    else bottom = 'calc(19% + 56px)';
  }
  if (rw.el.style.bottom !== bottom) rw.el.style.bottom = bottom;
  rw.shift = bottom !== '19%';
}
export const hideRaidWarn = () => { if (rw.el) rw.el.style.opacity = '0'; rw.end = 0; };
/** 冲击波：地面一圈高亮扩散环（加色混合）+ 内圈闪白 + 点光源爆闪，0.6 秒 */
function shockwave(F: ClassFxApi, p: THREE.Vector3, r: number, color: number, pw: number) {
  const gy = floorAt(F, p.x, p.z, p.y) + 0.08, mk = (o: number) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); m.userData.outlineParameters = { visible: false }; return m; };
  const g = new THREE.Group(); g.position.set(p.x, gy, p.z);
  const ringM = mk(1), ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48, 1), ringM); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const ring2M = mk(0.7), ring2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48, 1), ring2M); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.02; g.add(ring2);
  const flashM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }); flashM.userData.outlineParameters = { visible: false };
  const flash = new THREE.Mesh(new THREE.CircleGeometry(1, 32), flashM); flash.rotation.x = -Math.PI / 2; flash.position.y = 0.03; g.add(flash);
  const L = new THREE.PointLight(color, 0, r * 3.5, 1.6); L.position.y = Math.max(1, r * 0.4); g.add(L);
  F.live(g, 0.65, k => { const e = 1 - Math.pow(1 - k, 3);
    ring.scale.setScalar(Math.max(0.05, r * e)); ringM.opacity = (1 - k) * 0.95;
    ring2.scale.setScalar(Math.max(0.05, r * 0.6 * Math.min(1, k * 2.2))); ring2M.opacity = Math.max(0, 0.7 - k * 1.4);
    flash.scale.setScalar(r * (0.25 + 0.3 * e)); flashM.opacity = Math.max(0, 0.85 - k * 3);
    L.intensity = (6 + 10 * pw) * Math.max(0, 1 - k * 2.5); });
}
/** 预备时地面蓄力：出手点脚下一圈收缩的同色光环（越到出手越亮越小），配合本体红圈读出「还有多久」 */
function chargeRing(F: ClassFxApi, p: THREE.Vector3, r: number, color: number, dur: number) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); m.userData.outlineParameters = { visible: false };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48, 1), m); ring.rotation.x = -Math.PI / 2;
  const gy = floorAt(F, p.x, p.z, p.y) + 0.1;
  F.live(ring, Math.max(0.3, dur), k => { ring.position.set(p.x, gy, p.z); ring.scale.setScalar(Math.max(0.1, r * (1.15 - 0.85 * k))); m.opacity = 0.25 + 0.65 * k; });
}
/** A9：逐招特效上下文（出手点、朝向、本招红圈） */
function fxCtx(F: ClassFxApi, h: BossRigHandle, m: MoveDef, dur: number, left: boolean, fish: boolean, R?: number): SkillFxCtx {
  const r = h.root; r.updateWorldMatrix(true, false);
  const fwd = r.getWorldDirection(new THREE.Vector3()).setY(0); if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
  return { fx: F, h, m, dur, at: strikePoint(h, left, fish), fwd, tele: h.tele ?? [], R };
}
function fbFor(id: string): BossAnimOpts['fb'] {
  const B = WL_BODY[id], col = COL[B.theme], fish = B.tpl === 'fish', SF = SKILL_FX[id] ?? {};
  return {
    windup: (m, dur, h, key) => {
      sceneRef = topOf(h.root);
      // 首领警报：技能表里的招（红圈 / 读条，预备 ≥ 1 秒；普攻不算）在 30 米内弹警报条（同一招 1.5 秒内只提示一次；不依赖特效接口）
      const nm = key ? WL_MOVE_NAMES[id]?.[key] : undefined, now = warnClock[id + (key ?? "")] ?? -9, tk = performance.now() / 1000;
      if (nm && dur >= 1 && tk - now > 1.5 && distTo(h.root.getWorldPosition(new THREE.Vector3())) < 30) {
        warnClock[id + key] = tk; warnLog.push({ t: Date.now(), id, key: key!, dur }); if (warnLog.length > 20) warnLog.shift();
        if (!raidWarn(nm.boss, nm.name, dur, warnKind(m), WARN_TIP[id]?.[key!])) ctx?.toast(`⚠ ${nm.boss} 正在准备「${nm.name}」—— ${dur.toFixed(1)} 秒后出手`, '#ffb050'); }
      const F = FX(); if (!F) return; const S = F.synth;
      const sk = SF[key ?? 'melee'];
      if (sk) { if (sk.windup) try { sk.windup(fxCtx(F, h, m, dur, !!B.leftHand && !h.skinned, fish, WL_MOVE_R[id]?.[key ?? ''])); } catch (e) { console.warn('首领特效（预备）出错', id, key, e); } }
      else if (dur >= 0.6 && (m.power ?? 0) >= 0.7 && m.style !== 'spell' && m.style !== 'lure') chargeRing(F, strikePoint(h, !!B.leftHand, fish), WL_MOVE_R[id]?.[key ?? ''] ?? h.height * (0.35 + 0.25 * (m.power ?? 0.5)), B.theme === 'dock' ? 0xff8a3a : col, dur);
      if (m.style === 'spell' || m.style === 'lure') { if (!sk) gatherLight(F, h, fish ? 'lure' : B.leftHand ? 'haL' : 'haR', col, dur); if (S.gate('wl_cast', 0.5)) whisper(S, 0, 520, 0.05, Math.min(1.6, dur)); }
      else if ((m.power ?? 0) >= 0.8 && S.gate('wl_wind', 0.6)) { if (fish || B.theme === 'dock') growl(S, 0, 0.16, 0.5, fish ? 60 : 85); wind(S, Math.max(0, dur - 0.35), 0.3, 0.16, 300, 1400); } },
    impact: (m, h, key) => { sceneRef = topOf(h.root); const F = FX(); if (!F) return; const S = F.synth, pw = m.power ?? 0.5, p = strikePoint(h, !!B.leftHand && !h.skinned, fish), hh = h.height;
      const ground = m.style === 'chop' || m.style === 'slam' || m.style === 'rear' || m.style === 'sweep' || m.style === 'bite';
      const sk = SF[key ?? 'melee'];
      if (sk) {   // A9 逐招特效：视觉全换新（贴花 / 网格 / 分层粒子），音效 / 震屏 / 裂钟共鸣沿用
        if (sk.impact) try { sk.impact(fxCtx(F, h, m, 0, !!B.leftHand && !h.skinned, fish, WL_MOVE_R[id]?.[key ?? ''])); } catch (e) { console.warn('首领特效（出手）出错', id, key, e); }
        if (S.gate('wl_imp', 0.12)) { if (ground) { thud(S, 0, 0.5 + 0.5 * pw, fish ? 70 : 105, 0.4 + 0.2 * pw); rubble(S, 0.03, 5 + Math.round(pw * 5), 0.08 + 0.06 * pw); if (m.style === 'sweep' && B.theme === 'dock') chains(S, 0, 6, 0.3, 0.07); }
          else if (m.style === 'spell' || m.style === 'lure') { if (pw >= 0.9) roarS(S, 0, 0.18, 0.7); else F.sound('element'); }
          else if (m.style === 'bash') clang(S, 0, 0.14, 160, 0.5); else if (m.style === 'throw') chains(S, 0, 7, 0.35, 0.08); else F.sound('swing'); }
        shakeAt(F, p, ground ? pw : pw * 0.6, ground ? 28 : 18);
        if (fish && ground) { bellSwing.amp = Math.min(0.16, bellSwing.amp + 0.06 + 0.06 * pw); bellSwing.rings++; if (S.gate('wl_bell', 0.8)) bell(S, 0.05, 0.09 + 0.05 * pw, 98, 2.6); }
        return;
      }
      if (ground) {
        if (m.style !== 'sweep') crackDecal(F, p, hh * (0.28 + 0.2 * pw), B.theme === 'dock' ? 0xc08040 : col);
        F.fx('smoke', { x: p.x, y: p.y + 0.3, z: p.z }, { count: Math.round(10 + 18 * pw), color: 0x6a6258, speed: 2.2 + 2 * pw, up: 1.2, radius: hh * 0.18, life: 1.0, size: 0.9 + pw } as never);
        if (B.theme === 'ice') F.fx('ice', { x: p.x, y: p.y + 0.4, z: p.z }, { count: 22, color: 0xd8f4ff, speed: 4, up: 3, life: 0.8, size: 0.4 } as never);
        else if (B.theme === 'dock' || B.theme === 'abyss' || B.theme === 'black') F.fx('dot', { x: p.x, y: p.y + 0.3, z: p.z }, { count: 24, color: B.theme === 'dock' ? 0x9ab8c0 : col, speed: 3.5, up: 4, life: 0.7, size: 0.35, gravity: 9 } as never);
        else F.fx('shard', { x: p.x, y: p.y + 0.3, z: p.z }, { count: 12, color: 0x4a4440, speed: 3, up: 2.5, life: 0.7, size: 0.35 } as never);
        F.ring({ x: p.x, z: p.z }, WL_MOVE_R[id]?.[key ?? ''] ?? hh * (0.35 + 0.25 * pw), '#' + col.toString(16).padStart(6, '0'), 0.45);
        shockwave(F, p, (WL_MOVE_R[id]?.[key ?? ''] ?? hh * (0.45 + 0.35 * pw) / 1.3) * 1.3, B.theme === 'dock' ? 0xffa050 : col, pw);
        F.fx('shard', { x: p.x, y: p.y + 0.3, z: p.z }, { count: Math.round(8 + 10 * pw), color: B.theme === 'ice' ? 0xcfeeff : 0x3a3430, speed: 4 + 3 * pw, up: 4, life: 0.9, size: 0.45, gravity: 12 } as never);
        if (S.gate('wl_imp', 0.12)) { thud(S, 0, 0.5 + 0.5 * pw, fish ? 70 : 105, 0.4 + 0.2 * pw); rubble(S, 0.03, 5 + Math.round(pw * 5), 0.08 + 0.06 * pw); if (m.style === 'sweep' && B.theme === 'dock') chains(S, 0, 6, 0.3, 0.07); }
        shakeAt(F, p, pw);
      } else if (m.style === 'spell' || m.style === 'lure') {
        F.ring({ x: p.x, z: p.z }, hh * 0.5, '#' + col.toString(16).padStart(6, '0'), 0.6);
        shockwave(F, p, hh * 0.7, col, pw);
        F.fx('star', { x: p.x, y: p.y + hh * 0.6, z: p.z }, { count: 26, color: col, speed: 4, up: 1, life: 0.6, size: 0.5 } as never);
        if (S.gate('wl_spell', 0.3)) { if (m.power && m.power >= 0.9) roarS(S, 0, 0.18, 0.7); else F.sound('element'); }
        shakeAt(F, p, pw * 0.7);
      } else if (m.style === 'bash' || m.style === 'thrust' || m.style === 'jab' || m.style === 'throw') {
        F.fx('spark', { x: p.x, y: p.y + hh * 0.35, z: p.z }, { count: 14, color: 0xfff0c0, speed: 4, up: 1, life: 0.3, size: 0.3 } as never);
        if (S.gate('wl_clang', 0.15)) { if (m.style === 'bash') clang(S, 0, 0.14, 160, 0.5); else if (m.style === 'throw') chains(S, 0, 7, 0.35, 0.08); else F.sound('swing'); }
        shakeAt(F, p, pw * 0.6, 16);
      } else { F.fx('smoke', { x: p.x, y: p.y + 0.5, z: p.z }, { count: 8, color: col, speed: 1.5, up: 1, life: 0.7, size: 0.6 } as never); }
      if (fish && ground) { bellSwing.amp = Math.min(0.16, bellSwing.amp + 0.06 + 0.06 * pw); bellSwing.rings++; if (S.gate('wl_bell', 0.8)) bell(S, 0.05, 0.09 + 0.05 * pw, 98, 2.6); }
    },
    step: (h, heavy) => { if (heavy < 1.25) return; const F = FX(); if (!F) return; const p = h.root.getWorldPosition(new THREE.Vector3()), d = distTo(p);
      if (d > 26) return; F.fx('smoke', { x: p.x, y: p.y + 0.15, z: p.z }, { count: 3, color: 0x5a544c, speed: 0.8, up: 0.3, radius: h.height * 0.12, life: 0.6, size: 0.6 } as never);
      if (F.synth.gate('wl_step', 0.22)) thud(F.synth, 0, 0.18 * Math.max(0.2, 1 - d / 26) * heavy, fish ? 55 : 80, 0.25);
      if (d < 12 && heavy >= 1.3) F.feel('hit', 0.12 * (1 - d / 12)); },
    roar: (h) => { const F = FX(); if (!F) return; const p = h.root.getWorldPosition(new THREE.Vector3());
      if (SF.phase?.impact) later(F, 1.0, () => { try { SF.phase!.impact!(fxCtx(F, h, { style: 'slam', power: 1 }, 0, false, fish)); } catch (e) { console.warn('首领特效（阶段）出错', id, e); } });
      F.ring({ x: p.x, z: p.z }, h.height * 0.9, '#' + col.toString(16).padStart(6, '0'), 0.8); F.ring({ x: p.x, z: p.z }, h.height * 1.4, '#ffffff', 1.0);
      F.fx('smoke', { x: p.x, y: p.y + 0.2, z: p.z }, { count: 30, color: 0x6a6258, speed: 4, up: 0.6, radius: h.height * 0.3, life: 1.2, size: 1.2 } as never);
      if (F.synth.gate('wl_roar', 1)) { roarS(F.synth, 0.05, 0.3, fish ? 1.4 : 1.0); thud(F.synth, 0.1, 0.6, 60, 0.5); }
      shakeAt(F, p, 0.9, 36); if (fish) { bellSwing.amp = Math.min(0.16, bellSwing.amp + 0.1); bellSwing.rings++; } },
    stagger: (h) => { const F = FX(); if (!F) return; const p = h.root.getWorldPosition(new THREE.Vector3()); F.fx('spark', { x: p.x, y: p.y + h.height * 0.6, z: p.z }, { count: 12, color: 0xffffff, speed: 3, up: 1, life: 0.3, size: 0.3 } as never); if (F.synth.gate('wl_stag', 0.4)) growl(F.synth, 0, 0.12, 0.3, fish ? 70 : 120); },
    deathLand: (h) => { const F = FX(); if (!F) return; const p = h.root.getWorldPosition(new THREE.Vector3());
      F.fx('smoke', { x: p.x, y: p.y + 0.2, z: p.z }, { count: 36, color: 0x5a544c, speed: 3, up: 0.8, radius: h.height * 0.35, life: 1.4, size: 1.3 } as never);
      if (fish || B.theme !== 'chapel') F.fx('dot', { x: p.x, y: p.y + 0.3, z: p.z }, { count: 30, color: 0x9ab8c0, speed: 4, up: 4, life: 0.8, size: 0.35, gravity: 9 } as never);
      if (F.synth.gate('wl_death', 1)) { thud(F.synth, 0, 0.9, 65, 0.6); rubble(F.synth, 0.05, 8, 0.12); if (fish) bell(F.synth, 0.3, 0.14, 82, 3.2); }
      shakeAt(F, p, fish ? 1 : 0.7, 30); if (fish) { bellSwing.amp = 0.18; bellSwing.rings++; } },
  };
}

// ---------------------------------------------------------------- 写实 GLB 落地修正（11-02）
// Lux3D 首领 GLB 是 meshopt 量化坐标（Int16 归一化），本体 loadCreatures 的 normalize 对它不生效：几何仍以原点为中心（y -1..1），
// 结果首领一半埋在地下、看起来只有玩家高。这里（只在 DLC 内）把顶点转浮点、脚底放到 y=0、水平居中，再按目标身高缩放。几何按模型 id 缓存。
const groundGeo = new Map<string, { geo: THREE.BufferGeometry; h: number }>();
function groundGlb(id: string, rig: { body: THREE.Object3D }, height: number) {
  const mesh = rig.body.children.find(c => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined; if (!mesh) return;
  let g = groundGeo.get(id);
  if (!g) {
    const src = mesh.geometry as THREE.BufferGeometry, geo = src.clone();
    for (const nm of Object.keys(geo.attributes)) {
      const at = geo.getAttribute(nm) as THREE.BufferAttribute;
      if (at.array instanceof Float32Array && !(at as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
      const f = new Float32Array(at.count * at.itemSize);
      for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) f[i * at.itemSize + j] = j === 0 ? at.getX(i) : j === 1 ? at.getY(i) : j === 2 ? at.getZ(i) : at.getW(i);
      geo.setAttribute(nm, new THREE.BufferAttribute(f, at.itemSize));
    }
    geo.computeBoundingBox(); const b = geo.boundingBox!;
    geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2); geo.computeBoundingBox(); geo.computeBoundingSphere();
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    g = { geo, h: b.max.y - b.min.y }; groundGeo.set(id, g);
  }
  if (!(g.h > 1e-4)) return;
  mesh.geometry = g.geo; mesh.scale.setScalar(height / g.h); mesh.position.set(0, 0, 0);
}
export const wlGroundInfo = () => Object.fromEntries([...groundGeo].map(([k, v]) => [k, { h: v.h }]));

// ---------------------------------------------------------------- 模型工厂（WELL_MODELS 用）：蒙皮 → 整体动作兜底
/** 最近一次建出来的首领（测试 / 调试）：模型 id → 信息 */
export const WL_BUILT: Record<string, { skinned: boolean; mode: string; bones: number; verts: number; rigid: number; height: number; err?: string; clips?: string[] }> = {};
/** 11-07 BUG#7：首领绑骨件没就位时不再静默回退 —— raid_well 把 ctx.toast 挂进来，每个首领本局只提示一次 */
export const wlFallbackNote: { toast: ((msg: string, col?: string) => void) | null; told: Set<string> } = { toast: null, told: new Set() };
const noteFallback = (id: string, why: string) => {
  if (curQuality === 'low' || wlFallbackNote.told.has(id)) return; wlFallbackNote.told.add(id);
  console.warn('首领用静态件（无骨骼动作）', id, why);
  wlFallbackNote.toast?.(`首领模型「${id.replace(/^wl_/, '')}」没加载完整，本场用静态件（${why}）。请确认离线包里 raid/ 文件夹与 html 同目录`, '#ffb060');
};
/** 摆渡双子要同一种模型：先建的那只用了静态件，后刷出的另一只也用静态件（不然一只绑骨一只静态，大小、动作都对不上） */
const TWIN_OF: Record<string, string> = { wl_ferry_life: 'wl_ferry_death', wl_ferry_death: 'wl_ferry_life' };
export function wlBossModel(id: string, fb: () => unknown): () => unknown {
  const B = WL_BODY[id];
  return () => {
    const opts: BossAnimOpts & { height: number; offZ?: number } = { ...MOVES[id], keyed: KEYED[id], heavy: B.heavy, leftHand: B.leftHand, fb: fbFor(id), height: localH(id), offZ: B.offZ };
    let built: BuiltBossRig | null = null, err: string | undefined;
    // A8：正式绑骨件（<id>_boss.glb，mixamo 骨 + 刚性件挂手）优先；低画质 / 没解析完 / 出错 → 下面的静态写实件
    const twin = TWIN_OF[id] ? WL_BUILT[TWIN_OF[id]] : undefined, twinStatic = !!twin && !twin.skinned && twin.mode !== '' && !twin.mode.startsWith('程序化');
    if (curQuality !== 'low' && bossGlbHas(id) && !twinStatic) {
      try {
        const g = makeBossGlb(id, localH(id));
        if (g) {
          const anim = new BossProcAnim(null, g.poseG, B.tpl === 'fish' ? 'fish' : 'robe', { ...opts, leftHand: false }, localH(id), undefined, g.fade, g.poser, g.clips);
          WL_BUILT[id] = { skinned: true, mode: g.clips ? '正式绑骨 + 逐招骨骼动作（A9）' : '正式绑骨（Lux3D mixamo 骨 + 刚性件）', bones: g.info.bones, verts: g.info.tris, rigid: 2, height: wlHeight(id), clips: g.info.clips };
          return { root: g.root, body: g.body, legs: [], scale: 1, flash: g.mats, anim };
        }
      } catch (e) { err = String((e as Error)?.message ?? e); console.warn('首领绑骨件建模失败，回退静态件', id, e); }
      noteFallback(id, err ? '建模出错' : bossGlbReady(id) ? '骨架不全' : '资源未加载完');
    }
    const glb = id in PACK_CREATURE_GLB ? makeGlbCreature(id, { height: localH(id), wave: 0, pbr: B.pbr }) : null;
    if (glb) {
      groundGlb(id, glb as never, localH(id));
      if (curQuality !== 'low' && (WL_RIG_OPT.procSkin || (B.tpl === 'fish' && WL_RIG_OPT.fishSkin))) { try { built = skinLuxRig(id, glb as never, WL_RIG[id], opts); } catch (e) { err = String((e as Error)?.message ?? e); console.warn('首领程序化蒙皮失败，回退整体动作', id, e); built = null; } }
      if (!built) built = wrapWholeBody(glb as never, B.tpl, opts, null);   // 写实 GLB 已按 localH 建好
    } else {
      const r = fb() as Parameters<typeof wrapWholeBody>[0] | null | undefined; if (!r) return null;
      built = wrapWholeBody(r, B.tpl, opts);
    }
    WL_BUILT[id] = { skinned: built.skinned, mode: built.skinned ? (B.tpl === 'fish' && !WL_RIG_OPT.procSkin ? '程序化蒙皮 + 逐招姿势（默认开，?wlskin=0 关）' : '程序化蒙皮（回退开关 ?wlskin=1）') : glb ? '整体动作（写实模型）' : '整体动作（回退模型）', bones: built.info.bones, verts: built.info.verts, rigid: built.info.rigid, height: wlHeight(id), ...(err ? { err } : {}) };
    return built.rig;
  };
}
