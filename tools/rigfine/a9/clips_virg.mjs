// raidA A9 维尔格（寒誓骑士）逐招：沿用 11-02 已验收的 7 段技能 / 普攻 / 受击 / 死亡（../virg_boss/clips.mjs，腿两骨 IK、剑盾朝向约束），
// A9 新增：phase（第二阶段「寒誓」锁血转换：盾砸地 → 剑高举起誓 → 落剑定身）、stagger（被打断：盾被震开、后撤半步、重心下沉再回正，1.1 秒）
import { CLIPS as V, IDLE as I, FIST } from '../virg_boss/clips.mjs';
const M = (...a) => Object.assign({}, ...a);
const sp = (x, tw = 0, side = 0) => ({ Spine: [x * 0.4, tw * 0.4, side * 0.4], Spine1: [x * 0.35, tw * 0.35, side * 0.35], Spine2: [x * 0.25, tw * 0.25, side * 0.25] });
const raise = M(FIST, sp(-0.32), { Neck: [-0.45, 0, 0], RightArm: [0.1, 0, -1.35], RightForeArm: [0.15, 0, 0], LeftArm: [0.3, 0, -0.9], LeftForeArm: [0.9, 0, 0], _R: { a: [0, 1, -0.05], n: [-1, 0, 0] }, _L: { a: [0.1, 1, 0.2], n: [0.5, 0, 1] }, _hip: [0, 0.01, -0.01] });
export const PROPS = { R: 'Prop_VirgSword', L: 'Prop_VirgShield', lenR: 0.6, lenL: 0.3 };
export const CLIPS = { ...V,
  phase: { name: '寒誓（阶段转换）', hit: 1.1, k: [[0, I],
    [0.45, M(FIST, sp(0.3, 0), { Neck: [0.15, 0, 0], RightArm: [0.2, 0, 1.0], RightForeArm: [0.7, 0, 0], LeftArm: [1.2, 0, -0.5], LeftForeArm: [0.4, 0, 0], _R: { a: [0.1, -0.7, 0.7], n: [-1, 0, 0] }, _L: { a: [0, 1, 0.3], n: [0, 0, 1] }, _hip: [0, -0.1, 0.02], _lf: [0.04, 0, 0.14], _rf: [-0.03, 0, -0.08] })],
    [0.7, M(FIST, sp(0.5, 0), { Neck: [0.2, 0, 0], RightArm: [0.2, 0, 1.0], RightForeArm: [0.7, 0, 0], LeftArm: [0.9, 0, -0.95], LeftForeArm: [0.6, 0, 0], _R: { a: [0.1, -0.7, 0.7], n: [-1, 0, 0] }, _L: { a: [0, 0.6, 0.8], n: [0, -1, 0.3] }, _hip: [0, -0.17, 0.04], _lf: [0.04, 0, 0.14], _rf: [-0.03, 0, -0.08] })],
    [1.1, raise], [1.9, M(raise, { Neck: [-0.5, 0.05, 0], _hip: [0, 0.015, -0.01] })],
    [2.3, M(FIST, sp(0.2), { Neck: [0.1, 0, 0], RightArm: [0.6, 0, 0.85], RightForeArm: [0.35, 0, 0], LeftArm: [0.3, 0, -1.1], LeftForeArm: [1.1, 0, 0], _R: { a: [0, -1, 0.3], n: [-1, 0, 0] }, _L: { a: [0.05, 1, 0.08], n: [0.8, 0, 0.6] }, _hip: [0, -0.05, 0] })],
    [2.8, I]] },
  stagger: { name: '被打断 · 踉跄', k: [[0, I],
    [0.18, M(FIST, sp(-0.35, 0.25, 0.08), { Neck: [-0.35, 0.15, 0], RightArm: [0.1, 0.2, 1.2], RightForeArm: [0.4, 0, 0], LeftArm: [-0.1, 0.4, -0.45], LeftForeArm: [0.5, 0, 0], _R: { a: [0.3, -0.6, 0.5], n: [-1, 0, 0] }, _L: { a: [0.6, 0.7, -0.3], n: [1, 0, 0] }, _hip: [0, -0.03, -0.07], _lf: [0.04, 0, -0.1], _rf: [-0.02, 0, 0.04] })],
    [0.5, M(FIST, sp(0.25, 0.1), { Neck: [0.2, 0.05, 0], RightArm: [0.2, 0.1, 1.05], RightForeArm: [0.6, 0, 0], LeftArm: [0.2, 0.2, -0.8], LeftForeArm: [0.9, 0, 0], _R: { a: [0.15, -0.8, 0.5], n: [-1, 0, 0] }, _L: { a: [0.2, 1, 0], n: [0.8, 0, 0.6] }, _hip: [0, -0.1, -0.05], _lf: [0.04, 0, -0.1], _rf: [-0.02, 0, 0.04] })],
    [1.1, I]] },
};
