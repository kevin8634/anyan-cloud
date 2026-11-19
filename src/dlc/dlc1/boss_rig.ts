// ======================================================================
// DLC1 长副本 A 首领：浏览器端程序化蒙皮 + 程序化动作（v1.2.69-A7）
// 方案见 05_技能特效设计/02_怪物/动作与绑骨/怪物动作与绑骨排查.md 第 2 节（体型模板 / 权重 / 预测式预备 / 兜底）。
//   - Lux3D 自动绑骨对动作姿势生成的首领失败（MODEL_NOT_RIGGABLE：手臂屈肘、非 T/A 姿势），所以全部走这里：
//     按每个模型的地标（归一化坐标：身高 1、脚底 y=0、包围盒水平居中、面朝 +z、模型右手在 -x）生成 THREE.Bone 骨架，
//     顶点按「到骨段的归一化距离」分区 + 同链软混合 + 邻接平滑 + 接缝合并算 4 权重；武器 / 道具整团刚性绑到手骨。
//   - 动作：与 CharAnim 同接口（loop / play / update / revive），本体 main.ts 有 anim 时不再整体前倾 / 侧翻；
//     bindUnit(e)（本体 Enemy 构造时的可选挂点）后直接读首领大脑：红圈 / 读条剩余时间 → 预备姿势，伤害结算那一帧 = 出手姿势到位。
//   - 兜底：低画质 / 没有 Lux3D 模型（商用 base 包回退程序化模型）/ 蒙皮出错 → 同一套状态机驱动整体动作（姿态组倾斜 / 下蹲 / 前扑 / 倒地），不报错。
// 本文件只放通用骨架 / 动作；首领各自的地标、招式表、反馈在 raid_well_rig.ts。
// ======================================================================
import * as THREE from 'three';

export type V3 = [number, number, number];
export type BossTpl = 'H' | 'robe' | 'fish';
/** 刚性绑定（武器 / 道具）：胶囊（a→b 半径 r）或包围盒 [x0,x1,y0,y1,z0,z1]，整团跟一根骨头 */
export type RigidPart = { bone: string; a: V3; b: V3; r: number } | { bone: string; box: [number, number, number, number, number, number] };
export interface BossRigSpec {
  tpl: BossTpl;
  /** 地标（归一化坐标） */
  j: Record<string, V3>;
  rigid?: RigidPart[];
  /** 披风：z < cape 且低于胸口的顶点归披风链（不跟腿走） */
  cape?: number;
}
/** 招式风格（动作库） */
export type MoveStyle = 'chop' | 'sweep' | 'slam' | 'thrust' | 'throw' | 'spell' | 'bash' | 'fling' | 'summon' | 'bite' | 'rear' | 'lure' | 'jab';
export interface MoveDef { style: MoveStyle; /** 出手力度（震屏 / 尘土 / 音效档位）0–1 */ power?: number }
/** 反馈回调（音效 / 粒子 / 震屏 / 场景），全部可选 */
export interface BossFeedback {
  windup?(m: MoveDef, dur: number, rig: BossRigHandle, key?: string): void;
  impact?(m: MoveDef, rig: BossRigHandle, key?: string): void;
  step?(rig: BossRigHandle, heavy: number): void;
  roar?(rig: BossRigHandle): void;
  stagger?(rig: BossRigHandle): void;
  deathLand?(rig: BossRigHandle): void;
}
export interface BossAnimOpts {
  /** 招式表：技能 id / 技能名 → 风格；melee = 普攻 */
  moves: Record<string, MoveDef>;
  melee: MoveDef;
  /** 时长倍率（巨型 1.3–1.6 = 重量感） */
  heavy: number;
  /** 主武器在左手（招式左右镜像） */
  leftHand?: boolean;
  /** A9：逐招专属姿势（程序化骨架用；key = 技能 id / melee）：w 预备、s 出手、f 收招余势、o 预备期摆动（× sin(t·hz)） */
  keyed?: Record<string, { w: Record<string, [number, number, number]>; s: Record<string, [number, number, number]>; f?: Record<string, [number, number, number]>; o?: Record<string, [number, number, number]>; hz?: number }>;
  fb?: BossFeedback;
}
/** 给反馈回调用的只读信息 */
export interface BossRigHandle { root: THREE.Object3D; height: number; skinned: boolean; worldOf(bone: string): THREE.Vector3 | null; unit: BossUnit | null;
  /** A9：本招红圈位置（预备时实时、出手后保留最后一帧）——技能特效落在真实的圈上 */
  tele: { x: number; z: number; r: number }[] }

// ---------------------------------------------------------------- 骨架定义（每个模板：名字、父骨、关节地标、骨段终点、半径、分区）
type BoneDef = { n: string; p: string | null; at: string; to: string | V3; r: number; g?: 'leg' | 'cape' | 'jaw' | 'none' };
const H_BONES: BoneDef[] = [
  { n: 'root', p: null, at: '_root', to: '_root', r: 0, g: 'none' },
  { n: 'hips', p: 'root', at: 'hips', to: 'spine', r: 0.11 },
  { n: 'spine', p: 'hips', at: 'spine', to: 'chest', r: 0.12 },
  { n: 'chest', p: 'spine', at: 'chest', to: 'neck', r: 0.13 },
  { n: 'neck', p: 'chest', at: 'neck', to: 'head', r: 0.06 },
  { n: 'head', p: 'neck', at: 'head', to: 'top', r: 0.085 },
  { n: 'shR', p: 'chest', at: 'shR', to: 'elR', r: 0.055 }, { n: 'elR', p: 'shR', at: 'elR', to: 'haR', r: 0.05 }, { n: 'haR', p: 'elR', at: 'haR', to: '_haRt', r: 0.05 },
  { n: 'shL', p: 'chest', at: 'shL', to: 'elL', r: 0.055 }, { n: 'elL', p: 'shL', at: 'elL', to: 'haL', r: 0.05 }, { n: 'haL', p: 'elL', at: 'haL', to: '_haLt', r: 0.05 },
  { n: 'thR', p: 'hips', at: 'thR', to: 'knR', r: 0.075, g: 'leg' }, { n: 'knR', p: 'thR', at: 'knR', to: 'ftR', r: 0.065, g: 'leg' }, { n: 'ftR', p: 'knR', at: 'ftR', to: '_ftRt', r: 0.055, g: 'leg' },
  { n: 'thL', p: 'hips', at: 'thL', to: 'knL', r: 0.075, g: 'leg' }, { n: 'knL', p: 'thL', at: 'knL', to: 'ftL', r: 0.065, g: 'leg' }, { n: 'ftL', p: 'knL', at: 'ftL', to: '_ftLt', r: 0.055, g: 'leg' },
  { n: 'capeA', p: 'chest', at: 'capeA', to: 'capeB', r: 0.12, g: 'cape' }, { n: 'capeB', p: 'capeA', at: 'capeB', to: 'capeC', r: 0.12, g: 'cape' }, { n: 'capeC', p: 'capeB', at: 'capeC', to: '_capeCt', r: 0.12, g: 'cape' },
];
const F_BONES: BoneDef[] = [
  { n: 'root', p: null, at: '_root', to: '_root', r: 0, g: 'none' },
  { n: 'body', p: 'root', at: 'body', to: 'head', r: 0.2 },
  { n: 'head', p: 'body', at: 'head', to: 'snout', r: 0.17 },
  { n: 'jaw', p: 'head', at: 'jaw', to: 'jawTip', r: 0.13, g: 'jaw' },
  { n: 'lure', p: 'head', at: 'lure', to: 'lureTip', r: 0.05 },
  { n: 'tail1', p: 'body', at: 'body', to: 'tail1', r: 0.2 }, { n: 'tail2', p: 'tail1', at: 'tail1', to: 'tail2', r: 0.17 }, { n: 'tail3', p: 'tail2', at: 'tail2', to: 'tailTip', r: 0.16 },
  { n: 'finR', p: 'body', at: 'finR', to: 'finRt', r: 0.07 }, { n: 'finL', p: 'body', at: 'finL', to: 'finLt', r: 0.07 },
  { n: 'legRo', p: 'body', at: 'legRo', to: 'legRoT', r: 0.06, g: 'leg' }, { n: 'legLo', p: 'body', at: 'legLo', to: 'legLoT', r: 0.06, g: 'leg' },
  { n: 'legRi', p: 'body', at: 'legRi', to: 'legRiT', r: 0.05, g: 'leg' }, { n: 'legLi', p: 'body', at: 'legLi', to: 'legLiT', r: 0.05, g: 'leg' },
];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function joints(spec: BossRigSpec): Record<string, V3> {
  const J: Record<string, V3> = { ...spec.j };
  const c = J.hips ?? J.body ?? [0, 0.5, 0];
  J._root = [c[0], 0, c[2]];
  if (J.haR && J.elR) J._haRt = add(J.haR, sub(J.haR, J.elR), 0.45);
  if (J.haL && J.elL) J._haLt = add(J.haL, sub(J.haL, J.elL), 0.45);
  if (J.ftR) J._ftRt = add(J.ftR, [0, 0, 0.07]);
  if (J.ftL) J._ftLt = add(J.ftL, [0, 0, 0.07]);
  if (J.capeC && J.capeB) J._capeCt = add(J.capeC, sub(J.capeC, J.capeB), 0.3);
  return J;
}
const bonesOf = (spec: BossRigSpec) => (spec.tpl === 'fish' ? F_BONES : H_BONES).filter(b => {
  const J = spec.j; if (b.at === '_root') return true;
  if (b.g === 'cape' && spec.cape === undefined) return false;
  return !!J[b.at] && (typeof b.to !== 'string' || b.to.startsWith('_') || !!J[b.to]);
});

/** 点到线段距离 */
function segDist(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a), ap = sub(p, a), L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = L > 1e-9 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  const dx = ap[0] - ab[0] * t, dy = ap[1] - ab[1] * t, dz = ap[2] - ab[2] * t; return Math.hypot(dx, dy, dz);
}
const inRigid = (p: V3, r: RigidPart) => 'box' in r
  ? p[0] >= r.box[0] && p[0] <= r.box[1] && p[1] >= r.box[2] && p[1] <= r.box[3] && p[2] >= r.box[4] && p[2] <= r.box[5]
  : segDist(p, r.a, r.b) <= r.r;

/** 蒙皮权重（按模型缓存）：返回 skinIndex / skinWeight 数组 + 统计 */
export interface SkinData { idx: Uint16Array; w: Float32Array; bones: BoneDef[]; J: Record<string, V3>; rigidN: number; byBone: Record<string, number> }
const skinCache = new Map<string, SkinData>();
export function computeSkin(key: string, pos: ArrayLike<number>, count: number, h: number, index: ArrayLike<number> | null, spec: BossRigSpec): SkinData {
  const hit = skinCache.get(key); if (hit) return hit;
  const J = joints(spec), bones = bonesOf(spec), B = bones.length, bi = new Map(bones.map((b, i) => [b.n, i]));
  const seg = bones.map(b => ({ a: J[b.at], b: typeof b.to === 'string' ? J[b.to] : b.to }));
  const par = bones.map(b => (b.p ? bi.get(b.p) ?? -1 : -1));
  const kids = bones.map((_, i) => par.map((p, k) => (p === i ? k : -1)).filter(k => k >= 0));
  const hipY = (J.hips ?? J.body ?? [0, 0.5, 0])[1], chestY = (J.chest ?? J.body ?? [0, 0.7, 0])[1];
  const W = new Float32Array(count * B), rigid = new Uint8Array(count);
  let rigidN = 0;
  const P = (i: number): V3 => [pos[i * 3] / h, pos[i * 3 + 1] / h, pos[i * 3 + 2] / h];
  for (let i = 0; i < count; i++) {
    const p = P(i);
    const rg = spec.rigid?.find(r => inRigid(p, r));
    if (rg && bi.has(rg.bone)) { W[i * B + bi.get(rg.bone)!] = 1; rigid[i] = 1; rigidN++; continue; }
    const caped = spec.cape !== undefined && p[2] < spec.cape && p[1] < chestY;
    let win = -1, best = Infinity; const nd = new Float32Array(B).fill(Infinity);
    for (let b = 0; b < B; b++) {
      const d = bones[b]; if (d.g === 'none' || d.r <= 0) continue;
      if (d.g === 'leg' && (caped || p[1] > hipY + 0.03)) continue;
      if (d.g === 'cape' && !caped) continue;
      if (d.g === 'jaw' && J.jaw && (p[1] > J.jaw[1] + 0.02 || p[2] < J.jaw[2] - 0.03)) continue;
      nd[b] = segDist(p, seg[b].a, seg[b].b) / d.r;
      if (nd[b] < best) { best = nd[b]; win = b; }
    }
    if (win < 0) { W[i * B + (bi.get('hips') ?? bi.get('body') ?? 1)] = 1; continue; }
    const set = [win, par[win], ...kids[win]].filter(b => b >= 0 && nd[b] < Infinity);
    let s = 0; for (const b of set) { const v = Math.exp(-(nd[b] - best) * 3); W[i * B + b] = v; s += v; }
    for (const b of set) W[i * B + b] /= s;
  }
  // 邻接平滑 1 次（刚性顶点不动）
  if (index && index.length) {
    const acc = new Float32Array(count * B), cnt = new Uint16Array(count);
    for (let t = 0; t + 2 < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a], [b, a], [c, b], [a, c]]) { cnt[u]++; for (let k = 0; k < B; k++) acc[u * B + k] += W[v * B + k]; }
    }
    for (let i = 0; i < count; i++) if (!rigid[i] && cnt[i]) for (let k = 0; k < B; k++) W[i * B + k] = W[i * B + k] * 0.5 + acc[i * B + k] / cnt[i] * 0.5;
  }
  // 接缝合并：同一位置的重复顶点（UV 接缝）取平均，避免裂缝
  { const m = new Map<string, number[]>(), q = (v: number) => Math.round(v / h * 4000);
    for (let i = 0; i < count; i++) { const k = `${q(pos[i * 3])},${q(pos[i * 3 + 1])},${q(pos[i * 3 + 2])}`; const l = m.get(k); if (l) l.push(i); else m.set(k, [i]); }
    for (const l of m.values()) { if (l.length < 2) continue; for (let k = 0; k < B; k++) { let s = 0; for (const i of l) s += W[i * B + k]; s /= l.length; for (const i of l) W[i * B + k] = s; } } }
  // 取前 4 归一化
  const idx = new Uint16Array(count * 4), w = new Float32Array(count * 4), byBone: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const order = Array.from({ length: B }, (_, k) => k).sort((x, y) => W[i * B + y] - W[i * B + x]).slice(0, 4);
    let s = 0; for (const k of order) s += W[i * B + k];
    order.forEach((k, j) => { idx[i * 4 + j] = k; w[i * 4 + j] = s > 0 ? W[i * B + k] / s : j === 0 ? 1 : 0; });
    byBone[bones[order[0]].n] = (byBone[bones[order[0]].n] ?? 0) + 1;
  }
  const out = { idx, w, bones, J, rigidN, byBone };
  skinCache.set(key, out); return out;
}

// ---------------------------------------------------------------- 首领单位（本体 Enemy 的最小视图，全部按运行时字段读，读不到就当没有）
export interface BossUnit {
  alive: boolean; hp: number; maxHp: number; pos: { x: number; y: number; z: number };
  brain?: unknown; intent?: unknown;
}
type Tele = { remaining: number; ability?: { id: string; name: string; telegraph: number } };
type Cast = { ab: { id: string; name: string; castTime: number }; elapsed: number };
const brainOf = (u: BossUnit | null) => (u?.brain ?? null) as null | { activeTelegraphs?: Tele[]; casting?: Cast | null; phaseIndex?: number; base?: { state?: string; attackCd?: number; cfg?: { attackInterval?: number; attackRange?: number } }; cds?: Map<string, number>; def?: { abilities?: { id: string; name: string; kind: string }[] } };

// ---------------------------------------------------------------- 姿势
type Pose = Record<string, [number, number, number]>;
const P0: [number, number, number] = [0, 0, 0];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
function mix(a: Pose, b: Pose, t: number): Pose {
  const o: Pose = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[k] ?? P0, y = b[k] ?? P0; o[k] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]; }
  return o;
}
function addTo(a: Pose, b: Pose, k = 1) { for (const n in b) { const x = a[n] ?? [0, 0, 0]; a[n] = [x[0] + b[n][0] * k, x[1] + b[n][1] * k, x[2] + b[n][2] * k]; } }

/**
 * 招式姿势：预备（windup，最大后摆）/ 出手（strike，伤害帧到位）。人形：右手 = 主武器（model 右手在 -x）。
 * 旋转约定（骨骼绑定姿势无旋转，轴 = 模型轴）：躯干 x+ = 前倾；手臂 / 腿下垂时 x- = 向前抬；右臂 z- = 向外展开、左臂 z+；y+ = 向左扭。
 * _root = 姿态组整体位移（身高单位）：[前后 z, 上下 y, 0]；_pitch = 姿态组整体前倾（巨型 / 鱼）。
 */
const H_MOVES: Record<MoveStyle, { w: Pose; s: Pose }> = {
  chop: { w: { spine: [-0.12, 0.25, 0], chest: [-0.22, 0.2, 0], shR: [-2.7, 0, -0.25], elR: [-0.9, 0, 0], shL: [-0.5, 0, 0.25], head: [-0.1, 0, 0], thR: [0.1, 0, 0], thL: [-0.25, 0, 0], knL: [0.3, 0, 0], _root: [-0.02, -0.02, 0] },
    s: { spine: [0.3, -0.15, 0], chest: [0.35, -0.2, 0], shR: [-0.55, 0, -0.1], elR: [-0.15, 0, 0], shL: [0.3, 0, 0.3], head: [0.15, 0, 0], thR: [-0.35, 0, 0], knR: [0.45, 0, 0], thL: [0.25, 0, 0], _root: [0.05, -0.05, 0] } },
  sweep: { w: { spine: [-0.05, -0.55, 0], chest: [-0.1, -0.5, 0], shR: [-0.9, -0.6, -1.3], elR: [-0.4, 0, 0], shL: [-0.6, 0, 0.5], thR: [0.15, 0, 0], thL: [-0.2, 0, 0], knR: [0.35, 0, 0], knL: [0.35, 0, 0], _root: [0, -0.04, 0] },
    s: { spine: [0.15, 0.6, 0], chest: [0.15, 0.55, 0], shR: [-1.3, 0.9, -0.9], elR: [-0.1, 0, 0], shL: [0.2, 0, 0.6], thR: [-0.2, 0, 0], thL: [0.2, 0, 0], knR: [0.3, 0, 0], knL: [0.3, 0, 0], _root: [0.03, -0.05, 0] } },
  slam: { w: { spine: [-0.2, 0, 0], chest: [-0.3, 0, 0], neck: [-0.15, 0, 0], shR: [-2.9, 0, -0.1], elR: [-0.5, 0, 0], shL: [-2.9, 0, 0.1], elL: [-0.5, 0, 0], thR: [0.1, 0, 0], thL: [0.1, 0, 0], _root: [-0.02, 0.01, 0] },
    s: { spine: [0.55, 0, 0], chest: [0.45, 0, 0], neck: [0.2, 0, 0], shR: [-0.7, 0, 0.1], elR: [-0.1, 0, 0], shL: [-0.7, 0, -0.1], elL: [-0.1, 0, 0], thR: [-0.7, 0, 0], knR: [1.1, 0, 0], thL: [-0.7, 0, 0], knL: [1.1, 0, 0], ftR: [-0.4, 0, 0], ftL: [-0.4, 0, 0], _root: [0.04, -0.12, 0] } },
  thrust: { w: { spine: [-0.05, 0.45, 0], chest: [-0.05, 0.4, 0], shR: [0.6, 0, -0.3], elR: [-1.5, 0, 0], shL: [-0.6, 0, 0.4], thR: [0.3, 0, 0], thL: [-0.35, 0, 0], knL: [0.4, 0, 0], knR: [0.3, 0, 0], _root: [-0.03, -0.04, 0] },
    s: { spine: [0.25, -0.35, 0], chest: [0.2, -0.3, 0], shR: [-1.55, 0, -0.05], elR: [-0.05, 0, 0], shL: [0.4, 0, 0.3], thR: [-0.5, 0, 0], knR: [0.5, 0, 0], thL: [0.35, 0, 0], _root: [0.09, -0.05, 0] } },
  jab: { w: { chest: [-0.08, 0.25, 0], shR: [0.3, 0, -0.2], elR: [-1.2, 0, 0] }, s: { chest: [0.15, -0.2, 0], shR: [-1.4, 0, -0.05], elR: [-0.1, 0, 0], _root: [0.03, 0, 0] } },
  throw: { w: { spine: [-0.1, -0.5, 0], chest: [-0.15, -0.45, 0], shL: [-2.4, 0, 0.6], elL: [-1.2, 0, 0], shR: [-0.5, 0, -0.3], thL: [0.25, 0, 0], thR: [-0.2, 0, 0] },
    s: { spine: [0.25, 0.5, 0], chest: [0.25, 0.45, 0], shL: [-1.3, 0, 0.1], elL: [-0.1, 0, 0], shR: [0.3, 0, -0.3], thL: [-0.4, 0, 0], knL: [0.4, 0, 0], _root: [0.05, -0.03, 0] } },
  spell: { w: { spine: [-0.15, 0, 0], chest: [-0.25, 0, 0], neck: [-0.25, 0, 0], head: [-0.2, 0, 0], shR: [-2.8, 0, -0.2], elR: [-0.3, 0, 0], shL: [-0.4, 0, 1.2], elL: [-0.6, 0, 0], _root: [0, 0.025, 0] },
    s: { spine: [0.2, 0, 0], chest: [0.3, 0, 0], neck: [0.15, 0, 0], shR: [-1.5, 0, -0.1], elR: [-0.05, 0, 0], shL: [-1.4, 0, 0.2], elL: [-0.1, 0, 0], _root: [0.03, 0, 0] } },
  bash: { w: { spine: [-0.05, -0.45, 0], chest: [-0.1, -0.4, 0], shL: [-0.6, 0, 0.6], elL: [-1.4, 0, 0], shR: [0.3, 0, -0.3], thL: [0.3, 0, 0], thR: [-0.3, 0, 0], knR: [0.4, 0, 0], _root: [-0.03, -0.04, 0] },
    s: { spine: [0.3, 0.4, 0], chest: [0.25, 0.35, 0], shL: [-1.45, 0, 0.1], elL: [-0.3, 0, 0], shR: [0.4, 0, -0.3], thL: [-0.55, 0, 0], knL: [0.6, 0, 0], thR: [0.3, 0, 0], _root: [0.1, -0.05, 0] } },
  fling: { w: { chest: [-0.1, -0.35, 0], shR: [-1.6, 0, -0.9], elR: [-1.0, 0, 0] }, s: { chest: [0.15, 0.35, 0], shR: [-1.2, 0.6, -0.4], elR: [-0.1, 0, 0], _root: [0.02, 0, 0] } },
  summon: { w: { chest: [-0.3, 0, 0], head: [-0.3, 0, 0], shR: [-2.6, 0, -0.6], shL: [-2.6, 0, 0.6], elR: [-0.3, 0, 0], elL: [-0.3, 0, 0], _root: [0, 0.02, 0] },
    s: { chest: [0.35, 0, 0], head: [0.2, 0, 0], shR: [-0.4, 0, -1.2], shL: [-0.4, 0, 1.2], _root: [0, -0.03, 0] } },
  // 以下是鱼形招式在人形上的近似（不会用到）
  bite: { w: { chest: [-0.2, 0, 0] }, s: { chest: [0.3, 0, 0] } }, rear: { w: { chest: [-0.3, 0, 0] }, s: { chest: [0.4, 0, 0] } }, lure: { w: { head: [-0.2, 0, 0] }, s: { head: [0.2, 0, 0] } },
};
const F_MOVES: Partial<Record<MoveStyle, { w: Pose; s: Pose }>> = {
  bite: { w: { body: [-0.18, 0, 0], head: [-0.25, 0, 0], jaw: [0.75, 0, 0], tail1: [0.15, 0, 0], tail2: [0.2, 0, 0], finR: [0, 0, -0.5], finL: [0, 0, 0.5], _root: [-0.08, 0.02, 0] },
    s: { body: [0.12, 0, 0], head: [0.25, 0, 0], jaw: [-0.05, 0, 0], tail1: [-0.25, 0, 0], tail2: [-0.3, 0, 0], _root: [0.16, -0.03, 0] } },
  rear: { w: { _pitch: [-0.45, 0, 0], head: [-0.2, 0, 0], jaw: [0.6, 0, 0], tail1: [0.35, 0, 0], tail2: [0.25, 0, 0], finR: [0, 0, -0.9], finL: [0, 0, 0.9], legRo: [-0.4, 0, 0], legLo: [-0.4, 0, 0], _root: [-0.04, 0.1, 0] },
    s: { _pitch: [0.18, 0, 0], head: [0.15, 0, 0], jaw: [0.1, 0, 0], tail1: [-0.3, 0, 0], tail2: [-0.2, 0, 0], finR: [0, 0, 0.3], finL: [0, 0, -0.3], _root: [0.05, -0.06, 0] } },
  lure: { w: { head: [0.2, 0, 0], body: [0.1, 0, 0], lure: [-0.6, 0, 0], jaw: [0.25, 0, 0], tail1: [0, 0.3, 0] }, s: { head: [-0.25, 0, 0], lure: [0.5, 0, 0], jaw: [0.9, 0, 0], _root: [0.03, 0.02, 0] } },
  summon: { w: { _pitch: [-0.2, 0, 0], jaw: [0.9, 0, 0], finR: [0, 0, -0.8], finL: [0, 0, 0.8] }, s: { _pitch: [0.1, 0, 0], jaw: [0.2, 0, 0] } },
  fling: { w: { head: [-0.2, 0.3, 0], jaw: [0.5, 0, 0] }, s: { head: [0.2, -0.3, 0], jaw: [0.6, 0, 0], _root: [0.04, 0, 0] } },
  spell: { w: { head: [-0.15, 0, 0], lure: [-0.7, 0, 0], jaw: [0.3, 0, 0] }, s: { head: [0.2, 0, 0], lure: [0.4, 0, 0], jaw: [0.8, 0, 0] } },
};
/** 左右镜像：R ↔ L 互换，绕 y / z 的旋转取反 */
function mirrorPose(p: Pose): Pose { const o: Pose = {}; for (const n in p) { const m = n.endsWith('R') ? n.slice(0, -1) + 'L' : n.endsWith('L') ? n.slice(0, -1) + 'R' : n; const v = p[n]; o[m] = n === '_root' || n === '_pitch' ? [...v] as [number, number, number] : [v[0], -v[1], -v[2]]; } return o; }
const MIRROR: Record<string, { w: Pose; s: Pose }> = {};
const ROAR_H: Pose = { spine: [-0.25, 0, 0], chest: [-0.35, 0, 0], neck: [-0.35, 0, 0], head: [-0.35, 0, 0], shR: [-0.6, 0, -1.25], shL: [-0.6, 0, 1.25], elR: [-0.7, 0, 0], elL: [-0.7, 0, 0], thR: [-0.2, 0, -0.12], thL: [-0.2, 0, 0.12], knR: [0.35, 0, 0], knL: [0.35, 0, 0], _root: [0, -0.03, 0] };
const ROAR_F: Pose = { _pitch: [-0.3, 0, 0], head: [-0.2, 0, 0], jaw: [1.0, 0, 0], finR: [0, 0, -1.0], finL: [0, 0, 1.0], tail1: [0.3, 0, 0], tail2: [0.3, 0, 0], lure: [-0.5, 0, 0] };
const STAG_H: Pose = { spine: [-0.3, 0.15, 0], chest: [-0.35, 0.2, 0], head: [-0.35, 0, 0.1], shR: [0.4, 0, -0.6], shL: [0.4, 0, 0.6], elR: [-0.6, 0, 0], elL: [-0.6, 0, 0], thR: [0.35, 0, 0], knR: [0.5, 0, 0], thL: [-0.1, 0, 0], knL: [0.3, 0, 0], _root: [-0.06, -0.04, 0] };
const STAG_F: Pose = { _pitch: [-0.2, 0, 0.12], head: [-0.3, 0.2, 0], jaw: [0.6, 0, 0], tail1: [0, 0.5, 0], _root: [-0.06, 0, 0] };

// ---------------------------------------------------------------- 动画器
type Act = { kind: 'move'; m: MoveDef; key: string; phase: 'wind' | 'rec'; t: number; dur: number; rec: number; src: 'tele' | 'cast' | 'melee' | 'once'; prog?: number }
  | { kind: 'roar' | 'stagger'; t: number; dur: number };
/** 调试 / 测试：每次出手记录（时间、招式、预备时长、伤害对齐误差） */
export interface StrikeLog { t: number; key: string; style: MoveStyle; windup: number; src: string; dmgDt: number | null }

/** 整体姿态开关（没有骨骼时把静态模型整体前倾 / 扭转 / 下蹲 / 倒地）。11-01 绑骨标准：「静态模型 + 整体晃动」不算动作 → 默认关，只作调试回退 */
export const BOSS_POSE = { whole: false };
/** A8：姿势写到外部骨架（pose 键 = 本文件的关节名 hips / chest / shR …，值 = 模型轴欧拉角） */
export interface BossPoser { apply(pose: Record<string, [number, number, number]>): void; worldOf(n: string): THREE.Vector3 | null }
/** A9：逐招骨骼动作（Lux3D 正式绑骨件里烘焙的 glTF animations，tools/rigfine/a9/bake.mjs）。
 *  片段命名：idle / walk（循环）、attack（普攻）、s_<技能 id> 或 <技能 id>（技能）、phase（锁血阶段转换）、stagger（打断硬直）、hit（受击）、death。
 *  hit = 片段内伤害结算时刻：预备段按红圈 / 读条剩余时间拉伸，出手段（hit 前 strikeT 秒）按原速并按体型 heavy 放慢，结算那一帧正好到 hit。 */
export interface BossClipMeta { dur: number; hit: number | null; loop: boolean; zh: string }
export interface BossClipSet { mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; meta: Record<string, BossClipMeta> }
const CLIP_RESERVED = new Set(['idle', 'walk', 'attack', 'phase', 'stagger', 'hit', 'death']);
export class BossProcAnim {
  /** 与 CharAnim 对齐的字段（本体只读这些） */
  clock = 0; actAt = -99; lastAct: string | null = null; dead = false;
  get actAge() { return this.clock - this.actAt; }
  private loopName = 'idle'; private loopSpeed = 1;
  private act: Act | null = null;
  private unit: BossUnit | null = null;
  private walkPh = 0; private moveW = 0; private lastPos: { x: number; z: number } | null = null; private stepSide = 0;
  private flinch = 0; private lastHp = -1; private phaseIdx = 0;
  private deadT = 0; private landed = false;
  private primed = false; private prevCd = 0; private prevTeleN = 0; private castKey = ''; private cdSnap = new Map<string, number>();
  private hitReq = false; private heavyReq = false; private pendingImpact: { key: string; t: number } | null = null;
  readonly log: StrikeLog[] = [];
  /** 本帧刚结算的伤害时刻（play('heavy') / 红圈结算 / 读条结束）与出手到位时刻的差（测试用） */
  readonly handle: BossRigHandle;
  constructor(
    private bones: Map<string, THREE.Bone> | null,
    private poseG: THREE.Group,
    private tpl: BossTpl,
    private o: BossAnimOpts,
    private heightL: number,          // 姿态组本地单位的显示身高（世界身高 = heightL × 上级缩放）
    private extraTick?: (dt: number, moving: boolean) => void,
    private fade?: (k: number) => void,
    /** A8：外部骨架（Lux3D 正式绑骨件 mixamo 骨）——姿势按本文件约定（模型轴）交给 poser 换算写骨；有它就不走整体动作兜底 */
    private poser?: BossPoser,
    /** A9：逐招骨骼动作；有它就由片段驱动骨骼（poser 只用来取骨骼世界坐标） */
    private clips?: BossClipSet | null,
  ) {
    const self = this;
    this.handle = { tele: [], root: poseG, get height() { return self.worldH; }, skinned: !!bones || !!poser, worldOf: (n: string) => { if (poser) return poser.worldOf(n); const b = bones?.get(n); return b ? b.getWorldPosition(new THREE.Vector3()) : null; }, get unit() { return self.unit; } };
  }
  /** 世界身高（米） */
  get worldH() { return this.heightL * (this.poseG.parent ? worldScaleY(this.poseG.parent) : 1); }
  bindUnit(u: unknown) { this.unit = u as BossUnit; this.lastHp = -1; }
  boundUnit() { return this.unit; }
  clipName() { return ''; }
  loop(name: string, speed = 1) { this.loopName = name; this.loopSpeed = speed; }
  play(name: string, _speed = 1) {
    if (name === 'hit') this.hitReq = true;
    else if (name === 'heavy' || name === 'attack1') this.heavyReq = true;
    else if (name === 'death') this.dead = true;
    if (!this.unit) this.fallbackPlay(name);   // 没绑定单位（测试桩 / 机制核心）：按事件近似
  }
  revive() { this.dead = false; this.deadT = 0; this.landed = false; this.act = null; this.fade?.(1); this.poseG.position.set(0, 0, 0); this.poseG.rotation.set(0, 0, 0); this.cw.clear(); }
  /** A9 调试 / 验收出图：强制打一招（key = 技能 id / melee / phase / stagger），demoHold 秒内不读首领大脑（不被 AI 打断） */
  private demoHold = 0;
  demo(key: string, dur?: number) {
    this.demoHold = 0; this.act = null;
    if (key === 'phase') { this.begin({ kind: 'roar', t: 0, dur: this.clips?.meta.phase ? this.clips.meta.phase.dur * Math.sqrt(Math.min(1.35, this.o.heavy)) : 1.6 * Math.min(1.25, this.o.heavy) }); this.demoHold = (this.act as { dur: number } | null)?.dur ?? 2; return; }
    if (key === 'stagger') { this.begin({ kind: 'stagger', t: 0, dur: this.clips?.meta.stagger ? this.clips.meta.stagger.dur : 0.75 }); this.demoHold = 1.2; return; }
    const m = key === 'melee' ? this.o.melee : this.moveOf(key), cn = this.clipFor(key), cm = cn ? this.clips!.meta[cn] : null;
    const d = dur ?? Math.max(0.8, (cm?.hit ?? 1.2));
    this.begin({ kind: 'move', m, key, phase: 'wind', t: 0, dur: d, rec: 0.6 * this.o.heavy, src: 'once' });
    this.demoHold = d + (cm ? cm.dur - (cm.hit ?? cm.dur * 0.5) : 0.6 * this.o.heavy) + 0.2;
  }
  /** 当前动作状态（测试 / 调试） */
  state() { const a = this.act; return { act: a ? (a.kind === 'move' ? `${a.m.style}:${a.phase}` : a.kind) : null, key: a && a.kind === 'move' ? a.key : null, dead: this.dead, deadT: this.deadT, pitch: this.poseG.rotation.x, roll: this.poseG.rotation.z, walk: this.moveW, clip: this.clips ? { ...this.clipState } : null, clips: this.clips ? Object.keys(this.clips.actions) : null }; }

  private fallbackPlay(name: string) {
    if (name === 'cast' || name === 'castLong') this.begin({ kind: 'move', m: { style: name === 'cast' ? 'slam' : 'spell', power: 0.6 }, key: name, phase: 'wind', t: 0, dur: name === 'cast' ? 1.2 : 1.8, rec: 0.5, src: 'once' });
    else if (name === 'heavy' && !(this.act && this.act.kind === 'move' && this.act.phase === 'wind')) this.begin({ kind: 'move', m: this.o.melee, key: 'melee', phase: 'rec', t: 0, dur: 0, rec: 0.5 * this.o.heavy, src: 'once' });
    else if (name === 'hit') this.begin({ kind: 'stagger', t: 0, dur: 0.7 });
  }
  private begin(a: Act) {
    this.act = a;
    if (a.kind === 'move' && a.phase === 'wind') this.o.fb?.windup?.(a.m, Math.max(0, a.dur - a.t), this.handle, a.key);
    if (a.kind === 'roar') this.o.fb?.roar?.(this.handle);
    if (a.kind === 'stagger') this.o.fb?.stagger?.(this.handle);
  }
  private release(a: Extract<Act, { kind: 'move' }>, dmgDt: number | null) {
    this.log.push({ t: this.clock, key: a.key, style: a.m.style, windup: a.t, src: a.src, dmgDt });
    if (this.log.length > 40) this.log.shift();
    a.phase = 'rec'; a.t = 0; this.actAt = this.clock; this.lastAct = a.m.style;
    const cn = this.clips ? this.clipFor(a.key) ?? (this.clips.actions.attack ? 'attack' : null) : null;
    if (cn) { const m = this.clips!.meta[cn]; a.rec = Math.max(0.3, (m.dur - (m.hit ?? m.dur * 0.5)) * Math.sqrt(Math.min(1.35, Math.max(1, this.o.heavy)))); }
    this.o.fb?.impact?.(a.m, this.handle, a.key);
  }
  private moveOf(key: string, name?: string): MoveDef { return this.o.moves[key] ?? (name ? this.o.moves[name] : undefined) ?? { style: this.tpl === 'fish' ? 'bite' : 'slam', power: 0.6 }; }

  /** 每帧：读首领大脑 → 决定动作 → 合成姿势 → 写骨骼 */
  update(dt: number) {
    this.clock += dt;
    const u = this.unit, br = brainOf(u), H = this.o.heavy;
    // 死亡
    if (u && !u.alive) this.dead = true;
    if (this.dead) { this.deadT += dt; if (this.clips) this.applyClips(dt); else this.apply(this.deathPose(), dt); return; }
    if (u && this.deadT > 0) this.revive();
    // 位移 → 步行相位（按实际位移推进，不滑步）
    let moving = this.loopName === 'walk' || this.loopName === 'run';
    if (u) {
      const p = u.pos;
      if (this.lastPos) { const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z); if (d < 2) { const stride = Math.max(0.6, this.worldH * (this.tpl === 'fish' ? 0.22 : 0.42)); this.walkPh += (d / stride) * Math.PI; } moving = moving || d > 0.002; }
      this.lastPos = { x: p.x, z: p.z };
    } else if (moving) this.walkPh += dt * this.loopSpeed * 5;
    this.moveW += ((moving ? 1 : 0) - this.moveW) * Math.min(1, dt * 6);
    const side = Math.sin(this.walkPh) >= 0 ? 1 : -1;
    if (moving && side !== this.stepSide) { this.stepSide = side; this.o.fb?.step?.(this.handle, H); }
    // 受击小抖动（首领规则：只抖 3°）
    if (u) { if (this.lastHp >= 0 && u.hp < this.lastHp - u.maxHp * 0.002) this.flinch = 0.18; this.lastHp = u.hp; }
    this.flinch = Math.max(0, this.flinch - dt);
    // 阶段转换 → 咆哮
    if (br && typeof br.phaseIndex === 'number') { if (br.phaseIndex > this.phaseIdx) this.begin({ kind: 'roar', t: 0, dur: this.clips?.meta.phase ? this.clips.meta.phase.dur * Math.sqrt(Math.min(1.35, H)) : 1.6 * Math.min(1.25, H) }); this.phaseIdx = br.phaseIndex; }
    // 打断 → 踉跄
    if (this.hitReq) { this.hitReq = false; if (u) this.begin({ kind: 'stagger', t: 0, dur: this.clips?.meta.stagger ? this.clips.meta.stagger.dur : 0.75 }); }
    if (this.demoHold > 0) this.demoHold -= dt; else if (br) this.drive(dt, br);
    this.heavyReq = false;
    // 推进当前动作
    const a = this.act;
    if (a) {
      a.t += dt;
      if (a.kind === 'move') {
        if (a.src === 'once' && a.phase === 'wind' && a.t >= a.dur) this.release(a, null);
        if (a.phase === 'rec' && a.t >= a.rec) this.act = null;
      } else if (a.t >= a.dur) this.act = null;
    }
    this.extraTick?.(dt, moving);
    if (this.clips) this.applyClips(dt); else this.apply(this.composePose(), dt);
  }

  // ---------------------------------------------------------------- A9：逐招骨骼动作
  /** 招式 key → 片段名（没有专属片段 = null） */
  clipFor(key: string): string | null {
    const A = this.clips?.actions; if (!A) return null;
    if (key === 'melee') return A.attack ? 'attack' : null;
    if (A['s_' + key]) return 's_' + key;
    return !CLIP_RESERVED.has(key) && A[key] ? key : null;
  }
  /** 片段出手段原速时长（秒，片段时间） */
  private strikeSpan(m: BossClipMeta) { const h = m.hit ?? m.dur * 0.5; return Math.min(h * 0.4, 0.42); }
  private cw = new Map<string, number>();
  /** 调试 / 测试：当前片段、片段时间、权重 */
  clipState = { name: '', t: 0, w: 0 };
  private applyClips(dt: number) {
    const C = this.clips!, A = C.actions, H = Math.min(1.35, Math.max(1, this.o.heavy));
    const want: Record<string, number> = {}, time: Record<string, number> = {};
    const put = (n: string | null, w: number, t: number) => { if (!n || !A[n] || w <= 0) return; want[n] = (want[n] ?? 0) + w; time[n] = Math.max(0, Math.min(C.meta[n].dur - 1e-3, t)); };
    let actN: string | null = null, actW = 0, actT = 0;
    if (this.dead) {
      const m = C.meta.death; actN = m ? 'death' : null; actW = 1; actT = this.deadT / Math.sqrt(H);
      const hitT = m?.hit ?? (m ? m.dur * 0.7 : 1);
      if (!this.landed && actT >= hitT) { this.landed = true; this.o.fb?.deathLand?.(this.handle); }
      const end = (m?.dur ?? 2) * Math.sqrt(H) + 0.6; if (this.deadT > end) this.fade?.(Math.max(0, 1 - (this.deadT - end) / 1.4));
    } else {
      const a = this.act;
      if (a && a.kind === 'move') {
        const n = this.clipFor(a.key) ?? (A.attack ? 'attack' : null);
        if (n) {
          const m = C.meta[n], hit = m.hit ?? m.dur * 0.5, Sc = this.strikeSpan(m);
          if (a.phase === 'wind') {
            const left = Math.max(0, a.dur - a.t);
            const S = Math.min(Sc * H, a.dur * 0.6);
            actT = a.src === 'once' ? hit * clamp01(a.t / Math.max(0.05, a.dur)) : left <= S ? hit - Sc * (left / Math.max(1e-3, S)) : (hit - Sc) * clamp01(a.t / Math.max(0.05, a.dur - S));
            actW = clamp01(a.t / 0.16 + (a.src === 'once' ? 0 : 0.25));
          } else {
            const k = clamp01(a.t / Math.max(0.05, a.rec)); actT = hit + (m.dur - hit) * k;
            actW = k < 0.72 ? 1 : 1 - ease((k - 0.72) / 0.28);
          }
          actN = n;
        }
      } else if (a && a.kind === 'roar') { actN = A.phase ? 'phase' : A.hit ? 'hit' : null; if (actN) { actT = (a.t / a.dur) * C.meta[actN].dur; actW = 1 - ease((a.t / a.dur - 0.85) / 0.15); } }
      else if (a && a.kind === 'stagger') { actN = A.stagger ? 'stagger' : A.hit ? 'hit' : null; if (actN) { actT = (a.t / a.dur) * C.meta[actN].dur; actW = 1 - ease((a.t / a.dur - 0.8) / 0.2); } }
      const mw = this.moveW * (1 - actW), iw = (1 - this.moveW) * (1 - actW);
      put('idle', iw, (this.clock / H) % (C.meta.idle?.dur ?? 1));
      if (C.meta.walk) put('walk', mw, ((this.walkPh / (Math.PI * 2)) % 1 + 1) % 1 * C.meta.walk.dur); else put('idle', mw, 0);
      if (this.flinch > 0 && !actN && A.hit) put('hit', 0.3 * (this.flinch / 0.18), 0.12);
    }
    put(actN, actW, actT);
    // 平滑权重（切招 / 打断不跳帧）：每个片段的权重向目标逼近，时间直接跟目标
    const r = Math.min(1, dt * 14); let sum = 0;
    for (const n of new Set([...this.cw.keys(), ...Object.keys(want)])) { const v = (this.cw.get(n) ?? 0) + ((want[n] ?? 0) - (this.cw.get(n) ?? 0)) * (this.dead ? Math.min(1, dt * 8) : r); if (v < 1e-3 && !(want[n] > 0)) this.cw.delete(n); else { this.cw.set(n, v); sum += v; } }
    for (const [n, act] of Object.entries(A)) {
      const v = this.cw.get(n) ?? 0; act.weight = sum > 0 ? v / sum : (n === 'idle' ? 1 : 0); act.enabled = act.weight > 0;
      if (time[n] !== undefined) act.time = time[n];
    }
    this.clipState = { name: actN ?? (this.moveW > 0.5 ? 'walk' : 'idle'), t: actT, w: actW };
    this.poseG.position.set(0, 0, 0); this.poseG.rotation.set(0, 0, 0);
    C.mixer.update(0);
  }

  /** 读大脑：红圈 / 读条 / 普攻冷却 / 技能冷却跳变 */
  private drive(_dt: number, br: NonNullable<ReturnType<typeof brainOf>>) {
    const a = this.act, busy = a && (a.kind === 'roar' || a.kind === 'stagger');
    const tele = br.activeTelegraphs ?? [], cast = br.casting ?? null, base = br.base;
    // 读条
    if (cast && cast.ab) {
      const left = Math.max(0, cast.ab.castTime - cast.elapsed), key = cast.ab.id;
      if (!(a && a.kind === 'move' && a.src === 'cast' && a.key === key && a.phase === 'wind') && !busy) {
        this.begin({ kind: 'move', m: this.moveOf(key, cast.ab.name), key, phase: 'wind', t: cast.elapsed, dur: cast.ab.castTime, rec: 0.55 * this.o.heavy, src: 'cast' });
      }
      const c = this.act; if (c && c.kind === 'move' && c.src === 'cast') { c.t = cast.elapsed; c.prog = 1 - left / Math.max(1e-3, c.dur); }
      this.castKey = key;
    } else if (this.castKey) {
      // 读条结束：被打断（hit 已经切成踉跄）或成功 → 出手
      const c = this.act; this.castKey = '';
      if (c && c.kind === 'move' && c.src === 'cast' && c.phase === 'wind') this.release(c, 0);
    }
    // 红圈（groundSlam）
    if (tele.length && !cast) {
      const t0 = tele.reduce((m, t) => (t.remaining > m.remaining ? t : m), tele[0]);
      const ab = t0.ability, total = ab?.telegraph ?? Math.max(1, t0.remaining), key = ab?.id ?? 'slam';
      this.handle.tele = tele.map(t => { const q = (t as unknown as { pos?: { x: number; z?: number; y?: number }; radius?: number }); return { x: q.pos?.x ?? 0, z: q.pos?.z ?? q.pos?.y ?? 0, r: q.radius ?? 3 }; });
      if (!(a && a.kind === 'move' && a.src === 'tele' && a.key === key && a.phase === 'wind') && !busy && this.prevTeleN === 0) {
        this.begin({ kind: 'move', m: this.moveOf(key, ab?.name), key, phase: 'wind', t: total - t0.remaining, dur: total, rec: 0.6 * this.o.heavy, src: 'tele' });
      }
      const c = this.act; if (c && c.kind === 'move' && c.src === 'tele') { c.t = c.dur - t0.remaining; c.prog = 1 - t0.remaining / Math.max(1e-3, c.dur); }
    } else if (this.prevTeleN > 0 && !tele.length) {
      const c = this.act; if (c && c.kind === 'move' && c.src === 'tele' && c.phase === 'wind') this.release(c, 0);
    }
    this.prevTeleN = tele.length;
    // 普攻（预测式预备）：冷却剩余 ≤ 预备时长时开始后摆，冷却归零那一帧（伤害）= 出手到位
    if (base && !cast && !tele.length) {
      const iv = base.cfg?.attackInterval ?? 2.3, W = Math.min(0.95, Math.max(0.5, iv * 0.38)) * Math.min(1.25, this.o.heavy), cd = base.attackCd ?? 0;
      const it = (this.unit?.intent ?? null) as { faceTo?: { x: number; z: number } | null; speed?: number } | null, ft = it?.faceTo, up = this.unit!.pos;
      const near = !!ft && Math.hypot(ft.x - up.x, ft.z - up.z) < (base.cfg?.attackRange ?? 3) + (it?.speed ?? 3) * W + 0.5;
      if (base.state === 'chase' && near && cd <= 0) { base.attackCd = W; this.primed = true; }   // 贴近：冷却补到预备时长 → 首击也有可读后摆（伤害时刻 = 冷却归零，不变）
      if (base.state !== 'chase' && base.state !== 'attack') this.primed = false;
      const inMelee = base.state === 'attack' || (base.state === 'chase' && this.primed && near);
      const cdNow = base.attackCd ?? 0;
      if (inMelee && cdNow > 0 && cdNow <= W && !busy && !(a && a.kind === 'move' && a.src !== 'melee' && a.phase === 'wind')) {
        if (!(a && a.kind === 'move' && a.src === 'melee' && a.phase === 'wind')) this.begin({ kind: 'move', m: this.o.melee, key: 'melee', phase: 'wind', t: W - cdNow, dur: W, rec: 0.5 * this.o.heavy, src: 'melee' });
        const c = this.act; if (c && c.kind === 'move' && c.src === 'melee') { c.t = W - cdNow; c.prog = 1 - cdNow / W; }
      }
      // 冷却跳回（本帧出手结算）或 play('heavy')
      const jumped = cdNow > this.prevCd + 0.3;
      if (jumped || this.heavyReq) { const c = this.act; if (c && c.kind === 'move' && c.src === 'melee' && c.phase === 'wind') this.release(c, 0); if (base.state === 'attack') this.primed = true; }
      if (base.state !== 'attack' && base.state !== 'chase') { const c = this.act; if (c && c.kind === 'move' && c.src === 'melee' && c.phase === 'wind') this.act = null; }
      this.prevCd = cdNow;
    }
    // 技能冷却跳变：毒池 / 召唤（没有预警的技能）→ 一个短手势
    if (br.cds && br.def?.abilities) {
      for (const ab of br.def.abilities) {
        const v = br.cds.get(ab.id) ?? 0, was = this.cdSnap.get(ab.id) ?? 0; this.cdSnap.set(ab.id, v);
        if (v > was + 0.5 && (ab.kind === 'poisonZone' || ab.kind === 'summon') && !busy && !(this.act && this.act.kind === 'move' && this.act.phase === 'wind')) {
          const m = this.o.moves[ab.id] ?? { style: ab.kind === 'summon' ? 'summon' : 'fling', power: 0.4 } as MoveDef;
          const cn = this.clipFor(ab.id), cm = cn ? this.clips!.meta[cn] : null;
          const wd = cm ? Math.max(0.45, Math.min(1.1, (cm.hit ?? cm.dur * 0.5) * 0.75)) : 0.45 * this.o.heavy;
          this.begin({ kind: 'move', m, key: ab.id, phase: 'wind', t: 0, dur: wd, rec: 0.45 * this.o.heavy, src: 'once' });
        }
      }
    }
  }

  // ---------------------------------------------------------------- 姿势合成
  private moveSet(style: MoveStyle) {
    if (this.tpl === 'fish') return F_MOVES[style] ?? F_MOVES.bite!;
    const m = H_MOVES[style]; if (!this.o.leftHand) return m;
    const k = 'L:' + style; return (MIRROR[k] ??= { w: mirrorPose(m.w), s: mirrorPose(m.s) });
  }
  private composePose(): Pose {
    const fish = this.tpl === 'fish', robe = this.tpl === 'robe';
    const t = this.clock, ph = this.walkPh, mw = this.moveW, H = this.o.heavy;
    const pose: Pose = {};
    // 待机呼吸 / 环顾
    const br = Math.sin(t * 2 / H);
    if (fish) addTo(pose, { body: [br * 0.02, 0, 0], tail1: [0, Math.sin(t * 1.3) * 0.12, 0], tail2: [0, Math.sin(t * 1.3 - 0.8) * 0.18, 0], tail3: [0, Math.sin(t * 1.3 - 1.6) * 0.22, 0], jaw: [0.06 + Math.max(0, Math.sin(t * 0.7)) * 0.1, 0, 0], lure: [Math.sin(t * 1.7) * 0.15, 0, Math.sin(t * 1.1) * 0.12], finR: [0, Math.sin(t * 2.2) * 0.2, 0], finL: [0, -Math.sin(t * 2.2) * 0.2, 0] });
    else addTo(pose, { chest: [br * 0.025, Math.sin(t * 0.37) * 0.04, 0], head: [Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.23) * 0.25, 0], shR: [br * 0.03, 0, -0.04], shL: [br * 0.03, 0, 0.04], capeA: [Math.sin(t * 1.1) * 0.04, 0, 0], capeB: [Math.sin(t * 1.1 - 0.6) * 0.05, 0, 0] });
    // 步行循环
    if (mw > 0.01) {
      const s = Math.sin(ph), c = Math.cos(ph);
      if (fish) addTo(pose, { _root: [0, Math.abs(s) * 0.012, 0], body: [0, s * 0.06, s * 0.05], legRo: [s * 0.5, 0, 0], legLi: [s * 0.4, 0, 0], legLo: [-s * 0.5, 0, 0], legRi: [-s * 0.4, 0, 0], tail1: [0, s * 0.25, 0], tail2: [0, Math.sin(ph - 0.8) * 0.3, 0], finR: [0, 0, -0.3 - s * 0.3], finL: [0, 0, 0.3 - s * 0.3] }, mw);
      else {
        const A = robe ? 0.2 : 0.42, K = robe ? 0.25 : 0.7;
        addTo(pose, {
          thR: [-A * s, 0, 0], thL: [A * s, 0, 0], knR: [K * Math.max(0, -c), 0, 0], knL: [K * Math.max(0, c), 0, 0], ftR: [0.2 * s, 0, 0], ftL: [-0.2 * s, 0, 0],
          shR: [0.32 * s, 0, 0], shL: [-0.32 * s, 0, 0], elR: [-0.25, 0, 0], elL: [-0.25, 0, 0],
          hips: [0, s * 0.1, -s * 0.04], spine: [0.05, -s * 0.06, 0], chest: [0.04, -s * 0.08, s * 0.03],
          capeA: [0.12 + Math.abs(s) * 0.05, 0, 0], capeB: [0.12, 0, s * 0.05], capeC: [0.1, 0, 0],
          _root: [0, -Math.abs(c) * 0.018, 0],
        }, mw);
      }
    }
    // 动作层
    const a = this.act;
    if (a) {
      if (a.kind === 'move') {
        const KD = this.o.keyed?.[a.key], M = KD ?? this.moveSet(a.m.style), S = 0.14 * Math.min(1.3, H);
        let act: Pose, w = 1;
        if (a.phase === 'wind') {
          const left = Math.max(0, a.dur - a.t), wd = Math.max(0.05, a.dur - S);
          if (left > S) {   // 后摆 70% → 停顿蓄力 30%（微颤）
            const k = ease(a.t / Math.max(0.05, wd * 0.7)); act = mix({}, M.w, k);
            if (a.t > wd * 0.7) addTo(act, { chest: [Math.sin(t * 40) * 0.01, 0, 0], _root: [0, Math.sin(t * 33) * 0.002, 0] });
            if (KD?.o) addTo(act, KD.o, Math.sin(t * (KD.hz ?? 4)) * k);
          } else act = mix(M.w, M.s, easeOut(1 - left / S));   // 出手：伤害帧到位
          w = Math.min(1, a.t / 0.12 + (a.src === 'once' ? 1 : 0.3));
        } else {
          const k = a.t / Math.max(0.05, a.rec);
          act = KD?.f ? (k < 0.25 ? M.s : k < 0.55 ? mix(M.s, KD.f, ease((k - 0.25) / 0.3)) : mix(KD.f, {}, ease((k - 0.55) / 0.45)))
            : k < 0.3 ? M.s : mix(M.s, {}, ease((k - 0.3) / 0.7));   // 收招：出手姿势停一下（有余势姿势就过渡过去）再回待机
        }
        for (const n in act) { if (n.startsWith('th') || n.startsWith('kn') || n.startsWith('ft') || n.startsWith('leg')) pose[n] = mix({ x: pose[n] ?? P0 }, { x: act[n] }, w * 0.85).x; else addTo(pose, { [n]: act[n] }, w); }
      } else if (a.kind === 'roar') {
        const k = a.t / a.dur, env = k < 0.2 ? ease(k / 0.2) : k > 0.8 ? ease((1 - k) / 0.2) : 1;
        const R = fish ? ROAR_F : ROAR_H; addTo(pose, R, env);
        if (k > 0.2 && k < 0.8) addTo(pose, fish ? { head: [Math.sin(t * 30) * 0.03, Math.sin(t * 23) * 0.04, 0] } : { head: [Math.sin(t * 31) * 0.04, Math.sin(t * 19) * 0.05, 0], chest: [Math.sin(t * 27) * 0.02, 0, 0] });
      } else {
        const k = a.t / a.dur, env = Math.sin(Math.min(1, k) * Math.PI);
        addTo(pose, fish ? STAG_F : STAG_H, env);
      }
    }
    if (this.flinch > 0) addTo(pose, fish ? { body: [-0.04, 0, 0] } : { chest: [-0.05, 0, 0], head: [-0.06, 0, 0] }, this.flinch / 0.18);
    return pose;
  }
  /** 死亡：人形膝软 → 跪 → 向前扑倒（姿态组绕脚下前倾，落地小弹）；鱼：停摆 → 侧倾 ≤ 30° → 下沉。不侧翻 90° */
  private deathPose(): Pose {
    const t = this.deadT, fish = this.tpl === 'fish', H = Math.min(1.3, this.o.heavy);
    const pose: Pose = {};
    if (fish) {
      const k = ease(t / (2.4 * H));
      Object.assign(pose, { _pitch: [0.12 * k, 0, 0], _roll: [0.5 * k, 0, 0], _root: [0, -0.18 * k, 0], jaw: [0.85 * ease(t / 0.6), 0, 0], tail1: [0, 0.2 * (1 - k), 0], finR: [0, 0, 0.6 * k], finL: [0, 0, -0.2 * k], lure: [0.6 * k, 0, 0] });
      if (!this.landed && t > 1.6 * H) { this.landed = true; this.o.fb?.deathLand?.(this.handle); }
    } else {
      const kneel = ease(t / (0.4 * H)), fall = ease((t - 0.38 * H) / (0.6 * H)), bounce = t > 0.98 * H ? Math.sin(Math.min(1, (t - 0.98 * H) / (0.22 * H)) * Math.PI) * 0.06 : 0;
      Object.assign(pose, {
        thR: [-0.9 * kneel, 0, 0], thL: [-0.6 * kneel, 0, 0], knR: [1.5 * kneel, 0, 0], knL: [1.2 * kneel, 0, 0], ftR: [-0.4 * kneel, 0, 0], ftL: [-0.4 * kneel, 0, 0],
        spine: [0.25 * kneel, 0, 0], chest: [0.2 * kneel - 0.25 * fall, 0, 0], head: [0.3 * kneel - 0.45 * fall, 0, 0],
        shR: [-0.6 * kneel - 1.4 * fall, 0, -0.3], shL: [-0.5 * kneel - 1.3 * fall, 0, 0.3], elR: [-0.6 * kneel, 0, 0], elL: [-0.6 * kneel, 0, 0],
        _root: [0.04 * fall, -0.2 * kneel + 0.06 * fall, 0], _pitch: [1.42 * fall - bounce, 0, 0],
      });
      if (!this.landed && t > 0.98 * H) { this.landed = true; this.o.fb?.deathLand?.(this.handle); }
    }
    if (t > 1.9) this.fade?.(Math.max(0, 1 - (t - 1.9) / 1.4));
    return pose;
  }
  private apply(pose: Pose, _dt: number) {
    const r = pose._root ?? P0, pt = pose._pitch ?? P0, rl = pose._roll ?? P0, h = this.heightL;
    this.poseG.position.set(0, r[1] * h, r[0] * h);
    this.poseG.rotation.set(pt[0], pt[1], rl[0]);
    if (this.poser) { this.poser.apply(pose); return; }
    if (!this.bones) {   // 整体动作兜底：用躯干 / 手臂的姿势近似成整体倾斜与扭转
      if (!BOSS_POSE.whole) { this.poseG.position.set(0, 0, 0); this.poseG.rotation.set(0, 0, 0); this.poseG.scale.set(1, 1, 1); return; }   // 11-02：整体姿态（静态模型整体倾斜）按绑骨标准不算动作，默认关；状态机 / 预警 / 反馈照常
      const ch = pose.chest ?? P0, sp = pose.spine ?? P0, hd = pose.head ?? P0;
      this.poseG.rotation.x += (ch[0] + sp[0]) * 0.55 + hd[0] * 0.1;
      this.poseG.rotation.y += (ch[1] + sp[1]) * 0.5;
      this.poseG.rotation.z += (ch[2] + sp[2]) * 0.5;
      const kn = ((pose.knR ?? P0)[0] + (pose.knL ?? P0)[0]) * 0.5; this.poseG.scale.set(1 + kn * 0.03, 1 - kn * 0.06, 1 + kn * 0.03);
      return;
    }
    for (const [n, b] of this.bones) { const v = pose[n]; if (v) b.rotation.set(v[0], v[1], v[2]); else b.rotation.set(0, 0, 0); }
  }
}
function worldScaleY(o: THREE.Object3D) { let s = 1, p: THREE.Object3D | null = o; while (p) { s *= p.scale.y; p = p.parent; } return s; }

// ---------------------------------------------------------------- 组装：Lux 网格 → 蒙皮网格 + 动画器；失败返回 null
type RigLike = { root: THREE.Group; body: THREE.Object3D; legs: THREE.Object3D[]; scale: number; flash: unknown[]; tick?: (dt: number, moving: boolean) => void; anim?: unknown };
export interface BuiltBossRig { rig: RigLike; anim: BossProcAnim; skinned: boolean; info: { bones: number; verts: number; rigid: number; byBone: Record<string, number>; height: number; top: number } }

/**
 * 把 makeGlbCreature 产出的写实首领（body 下一个静态网格，已按 height 缩放）换成蒙皮网格。
 * topY = 地标里头顶（人形）/ 身体顶（鱼）的归一化高度，用来把「显示身高」对齐到 height。
 * offZ = 鱼形把头部挪到单位原点（身长是身高的 1.4 倍，原点在包围盒中心时玩家会站进它嘴里）。
 */
export function skinLuxRig(key: string, src: RigLike, spec: BossRigSpec, o: BossAnimOpts & { height: number; offZ?: number }): BuiltBossRig | null {
  const mesh = src.body.children.find(c => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (!mesh) return null;
  const geo0 = mesh.geometry as THREE.BufferGeometry;
  const geo = geo0.clone();
  for (const nm of Object.keys(geo.attributes)) {   // meshopt 量化属性 → 浮点（蒙皮前必须，否则溢出拉丝）
    const at = geo.getAttribute(nm) as THREE.BufferAttribute;
    if (at.array instanceof Float32Array && !(at as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
    const f = new Float32Array(at.count * at.itemSize);
    for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) f[i * at.itemSize + j] = j === 0 ? at.getX(i) : j === 1 ? at.getY(i) : j === 2 ? at.getZ(i) : at.getW(i);
    geo.setAttribute(nm, new THREE.BufferAttribute(f, at.itemSize));
  }
  geo.computeBoundingBox();
  const bb = geo.boundingBox!, h = bb.max.y - bb.min.y; if (!(h > 1e-4)) return null;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const sd = computeSkin(key, pos.array as Float32Array, pos.count, h, geo.index ? (geo.index.array as ArrayLike<number>) : null, spec);
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sd.idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sd.w, 4));
  // 骨骼（绑定姿势无旋转，位置 = 地标 × h）
  const bones = new Map<string, THREE.Bone>(), list: THREE.Bone[] = [];
  for (const d of sd.bones) {
    const b = new THREE.Bone(); b.name = 'wlb_' + d.n; const at = sd.J[d.at];
    const pp = d.p ? sd.J[sd.bones.find(x => x.n === d.p)!.at] : [0, 0, 0] as V3;
    b.position.set((at[0] - pp[0]) * h, (at[1] - pp[1]) * h, (at[2] - pp[2]) * h);
    if (d.p) bones.get(d.p)!.add(b);
    bones.set(d.n, b); list.push(b);
  }
  const m0 = mesh.material as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial({ map: m0.map ?? undefined, roughness: m0.roughness ?? 0.7, metalness: m0.metalness ?? 0.1, emissive: m0.emissive?.clone() ?? new THREE.Color(0), emissiveMap: m0.emissiveMap ?? undefined, emissiveIntensity: m0.emissiveIntensity ?? 1 });
  mat.userData.baseEmissive = m0.userData?.baseEmissive ?? 0; mat.userData.outlineParameters = { visible: false };
  const sm = new THREE.SkinnedMesh(geo, mat); sm.castShadow = true; sm.frustumCulled = false; sm.name = 'wl_skinned_' + key;
  // 层级：root → body（本体写受击后仰）→ poseG（姿态组：整体前倾 / 位移 / 倒地）→ scaleG（缩放 + 鱼形头部对齐）→ 骨骼 + 蒙皮网格
  const topY = (spec.j.top ?? [0, spec.tpl === 'fish' ? 0.87 : 1, 0])[1];
  const k = o.height / (h * topY);
  const poseG = new THREE.Group(), scaleG = new THREE.Group(); poseG.name = 'wl_pose'; scaleG.name = 'wl_scale';
  scaleG.scale.setScalar(k); if (o.offZ) scaleG.position.z = -o.offZ * h * k;
  scaleG.add(list[0]); scaleG.add(sm); poseG.add(scaleG);
  src.body.remove(mesh); src.body.add(poseG);
  poseG.updateMatrixWorld(true);
  sm.bind(new THREE.Skeleton(list));
  const anim = new BossProcAnim(bones, poseG, spec.tpl, o, o.height, undefined, f => { const tr = f < 1; if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; } mat.opacity = f; mat.depthWrite = f > 0.6; });
  const rig: RigLike = { root: src.root, body: src.body, legs: [], scale: src.scale, flash: [mat], anim };
  return { rig, anim, skinned: true, info: { bones: list.length, verts: pos.count, rigid: sd.rigidN, byBone: sd.byBone, height: o.height, top: topY } };
}

/** 兜底：任意 rig（程序化回退模型 / 蒙皮失败）包一层姿态组，同一状态机驱动整体动作；height = 目标显示身高（按包围盒对齐） */
export function wrapWholeBody(src: RigLike, tpl: BossTpl, o: BossAnimOpts & { height: number }, boxH: number | null = o.height): BuiltBossRig {
  const root = new THREE.Group(), body = new THREE.Group(), poseG = new THREE.Group(); poseG.name = 'wl_pose';
  root.add(body); body.add(poseG); poseG.add(src.root);
  src.root.updateMatrixWorld(true);
  // boxH = null：来源已按身高建好（写实 GLB 由 makeGlbCreature 按 height 缩放、脚底 y=0），不再量包围盒（11-02 修：量盒会把脚下影子面片算进去，模型被放大 2 倍并抬到 5 米高空）
  if (boxH !== null) {
    const box = new THREE.Box3(); src.root.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh && m.name !== 'blob' && !m.geometry.type.startsWith('Plane')) box.expandByObject(m); });
    if (box.isEmpty()) box.setFromObject(src.root);
    const hh = Math.max(0.2, box.max.y - Math.max(0, box.min.y));
    const k = boxH / hh; src.root.scale.multiplyScalar(k); src.root.position.y -= Math.min(0, box.min.y) * k;
  }
  const mats: THREE.Material[] = []; src.root.traverse(c => { const m = (c as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach(x => mats.push(x)); });
  const fade = (f: number) => { for (const m of mats) { const mm = m as THREE.Material & { opacity: number }; if (mm.userData.op0 === undefined) mm.userData.op0 = mm.opacity; mm.transparent = f < 1 || mm.userData.op0 < 1; mm.opacity = mm.userData.op0 * f; } };
  const anim = new BossProcAnim(null, poseG, tpl, o, o.height, src.tick ? (dt, mv) => src.tick!(dt, mv) : undefined, fade);
  const rig: RigLike = { root, body, legs: [], scale: src.scale, flash: src.flash, anim };
  return { rig, anim, skinned: false, info: { bones: 0, verts: 0, rigid: 0, byBone: {}, height: o.height, top: 1 } };
}
