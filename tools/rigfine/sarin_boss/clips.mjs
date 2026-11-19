// raidA 11-02 萨琳（溺潮女巫）逐技能关键帧。技能表 = src/dlc/dlc1/raid_well.ts B2：fog 溺毒雾 / shriek 溺魂尖啸 / mark 溺毙标记 / souls 溺魂（召唤）；
// 普攻 jab（raid_well_rig.ts MOVES.wl_sarin.melee，远程：灯杖前点射出幽魂绿弹）；另 idle / walk / hit / death。约定见 ../virg_boss/anim.mjs 文件头。
const M = (...a) => Object.assign({}, ...a);
const FIST = {}; for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) { FIST['RightHand' + f + k] = [0, 0, k === 1 ? 1 : 0.9]; FIST['LeftHand' + f + k] = [0, 0, -(k === 1 ? 0.25 : 0.45)]; }   // 右手握杖，左手枯爪
FIST.RightHandThumb1 = [0, 0.3, 0.2]; FIST.RightHandThumb2 = [0, 0, 0.5];
const OPEN = {}; for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) OPEN['LeftHand' + f + k] = [0, 0, k === 1 ? 0.15 : 0.05];   // 左手张开（施法）
export { FIST };
const sp = (x, tw = 0, side = 0) => ({ Spine: [x * 0.4, tw * 0.4, side * 0.4], Spine1: [x * 0.35, tw * 0.35, side * 0.35], Spine2: [x * 0.25, tw * 0.25, side * 0.25] });
// 待机：右手拄漂流木灯杖（杖立地、灯笼挂在杖头前方），左臂垂着、指爪微屈，头略低，身体缓慢飘晃
export const IDLE = M(FIST, sp(0.08, 0, 0.03), { Neck: [0.12, 0, 0], Head: [0.05, 0, -0.05], RightArm: [0.1, 0.12, 1.12], RightForeArm: [1.0, 0, 0.05], LeftArm: [0.15, 0, -1.2], LeftForeArm: [0.35, 0, -0.1],
  _R: { a: [0.02, 1, 0.04], n: [0, 0, 1] }, _hip: [0, -0.01, 0], _lf: [0.01, 0, 0.03], _rf: [-0.01, 0, -0.02] });
const I = IDLE;
export const CLIPS = {
  idle: { name: '待机', loop: true, k: [[0, I], [1.6, M(I, sp(0.12, 0.06, -0.03), { Neck: [0.16, 0.08, 0], Head: [0.08, 0.06, 0.05], LeftArm: [0.25, 0.05, -1.15], LeftForeArm: [0.5, 0, -0.1], _hip: [0, 0.0, 0.005], _R: { a: [0.03, 1, 0.06], n: [0, 0, 1] } })], [3.2, I]] },
  walk: { name: '行走（拖袍飘行）', loop: true, k: [[0, M(I, { _lf: [0.01, 0, 0.1], _rf: [-0.01, 0, -0.08], _hip: [0, -0.02, 0.01] })],
    [0.35, M(I, sp(0.1, 0.04), { _lf: [0.01, 0, 0.0], _rf: [-0.01, 0.04, 0.01], _hip: [0, -0.008, 0.01] })],
    [0.7, M(I, { _lf: [0.01, 0, -0.08], _rf: [-0.01, 0, 0.1], _hip: [0, -0.02, 0.01] })],
    [1.05, M(I, sp(0.1, -0.04), { _lf: [0.01, 0.04, 0.01], _rf: [-0.01, 0, 0.0], _hip: [0, -0.008, 0.01] })],
    [1.4, M(I, { _lf: [0.01, 0, 0.1], _rf: [-0.01, 0, -0.08], _hip: [0, -0.02, 0.01] })]] },
  attack: { name: '普攻 · 灯杖点射', hit: 0.7, k: [[0, I],
    [0.45, M(FIST, sp(-0.05, 0.35), { Neck: [0, -0.2, 0], RightArm: [0.6, 0.3, 0.55], RightForeArm: [1.4, 0, 0], LeftArm: [0.2, 0, -1.1], LeftForeArm: [0.5, 0, 0], _R: { a: [0, 0.9, -0.4], n: [0, 0, 1] }, _hip: [0, -0.02, -0.02] })],
    [0.7, M(FIST, sp(0.2, -0.25), { Neck: [0.05, 0.15, 0], RightArm: [1.35, 0, 0.25], RightForeArm: [0.2, 0, 0], LeftArm: [0.3, 0, -1.1], LeftForeArm: [0.5, 0, 0], _R: { a: [0, 0.35, 1], n: [0, 1, 0] }, _hip: [0, -0.03, 0.05], _rf: [-0.01, 0, 0.1] })],
    [1.0, M(FIST, sp(0.18, -0.2), { RightArm: [1.3, 0, 0.3], RightForeArm: [0.25, 0, 0], LeftArm: [0.3, 0, -1.1], LeftForeArm: [0.5, 0, 0], _R: { a: [0, 0.3, 1], n: [0, 1, 0] }, _hip: [0, -0.03, 0.05], _rf: [-0.01, 0, 0.1] })],
    [1.5, I]] },
  fog: { name: '溺毒雾', hit: 1.1, k: [[0, I],
    [0.6, M(FIST, OPEN, sp(0.05, -0.6), { Neck: [0, -0.3, 0], LeftArm: [0.9, 0.2, -0.3], LeftForeArm: [1.6, 0, 0], LeftHand: [0, 0, 0.3], RightArm: [0.15, 0.15, 0.95], RightForeArm: [0.95, 0, 0.1], _R: { a: [0.05, 1, 0.1], n: [0, 0, 1] }, _hip: [0, -0.03, 0] })],
    [1.1, M(FIST, OPEN, sp(0.2, 0.55), { Neck: [0.1, 0.3, 0], LeftArm: [1.2, 0, -0.35], LeftForeArm: [0.1, 0, 0], LeftHand: [0, 0, -0.2], RightArm: [0.2, 0.15, 0.95], RightForeArm: [0.95, 0, 0.1], _R: { a: [0.05, 1, 0.1], n: [0, 0, 1] }, _hip: [0, -0.05, 0.03], _lf: [0.02, 0, 0.1] })],
    [1.5, M(FIST, OPEN, sp(0.18, 0.6), { Neck: [0.1, 0.35, 0], LeftArm: [1.15, -0.2, -0.45], LeftForeArm: [0.1, 0, 0], LeftHand: [0, 0, -0.25], RightArm: [0.2, 0.15, 0.95], RightForeArm: [0.95, 0, 0.1], _R: { a: [0.05, 1, 0.1], n: [0, 0, 1] }, _hip: [0, -0.05, 0.03], _lf: [0.02, 0, 0.1] })],
    [2.1, I]] },
  shriek: { name: '溺魂尖啸', hit: 2.4, k: [[0, I],
    [0.6, M(FIST, OPEN, sp(0.35), { Neck: [0.35, 0, 0], Head: [0.2, 0, 0], RightArm: [0.6, 0, 0.6], RightForeArm: [1.0, 0, 0], LeftArm: [0.9, 0, -0.6], LeftForeArm: [1.3, 0, 0], _R: { a: [0, 1, 0.3], n: [0, 0, 1] }, _hip: [0, -0.06, 0] })],
    [1.9, M(FIST, OPEN, sp(0.42), { Neck: [0.4, 0, 0], Head: [0.25, 0, 0], RightArm: [0.65, 0, 0.55], RightForeArm: [1.1, 0, 0], LeftArm: [0.95, 0, -0.55], LeftForeArm: [1.4, 0, 0], _R: { a: [0, 1, 0.35], n: [0, 0, 1] }, _hip: [0, -0.08, 0] })],
    [2.4, M(FIST, OPEN, sp(-0.4), { Neck: [-0.45, 0, 0], Head: [-0.35, 0, 0], RightArm: [0.1, 0, -0.55], RightForeArm: [0.2, 0, 0], LeftArm: [0.1, 0, 0.45], LeftForeArm: [0.2, 0, 0], _R: { a: [0.15, 1, -0.1], n: [0, 0, 1] }, _hip: [0, 0.03, -0.02], _lf: [0.03, 0.02, 0], _rf: [-0.03, 0.02, 0] })],
    [3.0, M(FIST, OPEN, sp(-0.42), { Neck: [-0.5, 0, 0], Head: [-0.35, 0, 0], RightArm: [0.1, 0, -0.6], RightForeArm: [0.15, 0, 0], LeftArm: [0.1, 0, 0.5], LeftForeArm: [0.15, 0, 0], _R: { a: [0.18, 1, -0.12], n: [0, 0, 1] }, _hip: [0, 0.03, -0.02], _lf: [0.03, 0.02, 0], _rf: [-0.03, 0.02, 0] })],
    [3.7, I]] },
  mark: { name: '溺毙标记', hit: 1.6, k: [[0, I],
    [0.6, M(FIST, OPEN, sp(-0.05, 0.25), { Neck: [0, -0.2, 0], RightArm: [0.9, 0.2, 0.3], RightForeArm: [0.9, 0, 0], LeftArm: [0.5, 0, -0.9], LeftForeArm: [1.2, 0, 0], _R: { a: [0, 0.75, 0.65], n: [0, 0, 1] }, _hip: [0, -0.02, -0.02] })],
    [1.3, M(FIST, OPEN, sp(-0.08, 0.3), { Neck: [-0.05, -0.25, 0], RightArm: [0.9, 0.2, 0.25], RightForeArm: [0.95, 0, 0], LeftArm: [0.55, 0, -0.85], LeftForeArm: [1.3, 0, 0], _R: { a: [0, 0.8, 0.6], n: [0, 0, 1] }, _hip: [0, -0.02, -0.02] })],
    [1.6, M(FIST, OPEN, sp(0.22, -0.2), { Neck: [0.1, 0.1, 0], RightArm: [1.45, 0, 0.1], RightForeArm: [0.1, 0, 0], LeftArm: [1.3, 0.1, -0.1], LeftForeArm: [0.05, 0, 0], _R: { a: [0, 0.15, 1], n: [0, 1, 0] }, _hip: [0, -0.04, 0.06], _rf: [-0.01, 0, 0.12] })],
    [2.0, M(FIST, OPEN, sp(0.2, -0.18), { Neck: [0.1, 0.1, 0], RightArm: [1.42, 0, 0.12], RightForeArm: [0.12, 0, 0], LeftArm: [1.25, 0.1, -0.15], LeftForeArm: [0.08, 0, 0], _R: { a: [0, 0.18, 1], n: [0, 1, 0] }, _hip: [0, -0.04, 0.06], _rf: [-0.01, 0, 0.12] })],
    [2.6, I]] },
  souls: { name: '溺魂（召唤）', hit: 1.5, k: [[0, I],
    [0.7, M(FIST, OPEN, sp(0.35), { Neck: [0.3, 0, 0], RightArm: [0.6, 0, 0.75], RightForeArm: [1.0, 0, 0], LeftArm: [0.5, 0, -1.25], LeftForeArm: [0.3, 0, 0], LeftHand: [0, 0, 0.5], _R: { a: [0, 1, 0.15], n: [0, 0, 1] }, _hip: [0, -0.1, 0.02] })],
    [1.5, M(FIST, OPEN, sp(-0.25), { Neck: [-0.35, 0, 0], RightArm: [0.3, 0, -1.1], RightForeArm: [0.2, 0, 0], LeftArm: [0.6, 0, -0.1], LeftForeArm: [0.4, 0, 0], LeftHand: [0, 0, -0.4], _R: { a: [0, 1, 0.05], n: [0, 0, 1] }, _hip: [0, 0.02, 0] })],
    [2.2, M(FIST, OPEN, sp(-0.28), { Neck: [-0.38, 0, 0], RightArm: [0.3, 0, -1.15], RightForeArm: [0.2, 0, 0], LeftArm: [0.6, 0, -0.05], LeftForeArm: [0.4, 0, 0], LeftHand: [0, 0, -0.4], _R: { a: [0, 1, 0.05], n: [0, 0, 1] }, _hip: [0, 0.02, 0] })],
    [2.9, I]] },
  hit: { name: '受击', k: [[0, I], [0.12, M(I, sp(-0.28, -0.15), { Neck: [-0.3, -0.1, 0], LeftArm: [0.3, 0, -0.9], _hip: [0, -0.01, -0.04] })], [0.6, I]] },
  death: { name: '死亡（沉入水中）', hit: 2.6, k: [[0, I],
    [0.5, M(I, OPEN, sp(-0.3, 0.1), { Neck: [-0.4, 0, 0], Head: [-0.2, 0, 0], LeftArm: [0.6, 0, -0.5], LeftForeArm: [0.6, 0, 0], _hip: [0, 0.0, -0.03] })],
    [1.4, M(FIST, OPEN, sp(0.45, 0, 0.1), { Neck: [0.4, 0, 0], RightArm: [0.6, 0, 0.9], RightForeArm: [0.6, 0, 0], LeftArm: [0.2, 0, -1.3], LeftForeArm: [0.3, 0, 0], _R: { a: [0.3, 0.6, 0.7], n: [0, 0, 1] }, _hip: [0, -0.24, 0.02], _lf: [0.03, 0, 0.1], _rf: [-0.03, 0, -0.12] })],
    [2.6, M(FIST, OPEN, sp(0.75, 0, 0.12), { Neck: [0.5, 0, 0], Head: [0.3, 0, 0], RightArm: [0.3, 0, 1.2], RightForeArm: [0.3, 0, 0], LeftArm: [0.1, 0, -1.4], LeftForeArm: [0.2, 0, 0], _R: { a: [0.6, 0.2, 0.75], n: [0, 1, 0] }, _hip: [0, -0.4, 0.04], _lf: [0.04, 0, 0.14], _rf: [-0.04, 0.02, -0.3], _rfr: [1.0, 0, 0] })],
    [3.6, M(FIST, OPEN, sp(0.8, 0, 0.12), { Neck: [0.55, 0, 0], Head: [0.3, 0, 0], RightArm: [0.3, 0, 1.25], RightForeArm: [0.3, 0, 0], LeftArm: [0.1, 0, -1.4], LeftForeArm: [0.2, 0, 0], _R: { a: [0.65, 0.1, 0.75], n: [0, 1, 0] }, _hip: [0, -0.9, 0.04], _lf: [0.04, -0.5, 0.14], _rf: [-0.04, -0.48, -0.3], _rfr: [1.0, 0, 0] })]] },
};
