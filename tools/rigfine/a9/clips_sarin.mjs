// raidA A9 萨琳（溺潮女巫）逐招：沿用 11-02 已验收的 4 段技能 / 普攻 / 受击 / 死亡（../sarin_boss/clips.mjs），
// A9 新增：phase（第二阶段「溺魂」：灯杖顿地 → 仰头张臂悬起 → 收臂俯身）、stagger（被打断：尖啸被掐断，捂喉后仰，杖撑地稳住，1.2 秒）
import { CLIPS as S, IDLE as I, FIST } from '../sarin_boss/clips.mjs';
const M = (...a) => Object.assign({}, ...a);
const OPEN = {}; for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) OPEN['LeftHand' + f + k] = [0, 0, k === 1 ? 0.15 : 0.05];
const sp = (x, tw = 0, side = 0) => ({ Spine: [x * 0.4, tw * 0.4, side * 0.4], Spine1: [x * 0.35, tw * 0.35, side * 0.35], Spine2: [x * 0.25, tw * 0.25, side * 0.25] });
const up = M(FIST, OPEN, sp(-0.38), { Neck: [-0.5, 0, 0], Head: [-0.3, 0, 0], RightArm: [0.15, 0, -0.35], RightForeArm: [0.2, 0, 0], LeftArm: [0.2, 0, 0.35], LeftForeArm: [0.2, 0, 0], _R: { a: [0.2, 1, -0.05], n: [0, 0, 1] }, _hip: [0, 0.035, -0.02], _lf: [0.02, 0.03, 0], _rf: [-0.02, 0.03, 0] });
export const PROPS = { R: 'Prop_SarinStaff', lenR: 0.55, backR: 0.45 };
export const CLIPS = { ...S,
  phase: { name: '溺魂（阶段转换）', hit: 1.0, k: [[0, I],
    [0.5, M(FIST, OPEN, sp(0.35), { Neck: [0.35, 0, 0], RightArm: [0.5, 0, 0.8], RightForeArm: [1.1, 0, 0], LeftArm: [0.6, 0, -1.0], LeftForeArm: [0.9, 0, 0], _R: { a: [0, 1, 0.25], n: [0, 0, 1] }, _hip: [0, -0.08, 0.02] })],
    [0.75, M(FIST, OPEN, sp(0.45), { Neck: [0.4, 0, 0], RightArm: [0.3, 0, 1.0], RightForeArm: [0.9, 0, 0], LeftArm: [0.6, 0, -1.05], LeftForeArm: [0.9, 0, 0], _R: { a: [0, 1, 0.05], n: [0, 0, 1] }, _hip: [0, -0.11, 0.02] })],
    [1.0, up], [1.9, M(up, { Neck: [-0.55, 0.08, 0], _hip: [0, 0.045, -0.02] })], [2.6, I]] },
  stagger: { name: '被打断 · 踉跄', k: [[0, I],
    [0.2, M(FIST, OPEN, sp(-0.35, 0.2, 0.06), { Neck: [-0.4, 0.15, 0], Head: [-0.2, 0, 0], RightArm: [0.2, 0.1, 1.0], RightForeArm: [1.1, 0, 0], LeftArm: [1.2, 0.3, -0.35], LeftForeArm: [1.9, 0, 0], _R: { a: [0.2, 1, -0.05], n: [0, 0, 1] }, _hip: [0, -0.02, -0.06] })],
    [0.6, M(FIST, OPEN, sp(0.3, 0.05), { Neck: [0.3, 0, 0], RightArm: [0.25, 0.1, 1.1], RightForeArm: [1.0, 0, 0], LeftArm: [0.9, 0.2, -0.6], LeftForeArm: [1.7, 0, 0], _R: { a: [0.05, 1, 0.1], n: [0, 0, 1] }, _hip: [0, -0.07, -0.03] })],
    [1.2, I]] },
};
