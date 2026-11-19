// raidA 11-02 摆渡双子试动关键帧（Lux3D mixamo 骨；船篙 / 提灯是挂 RightHand 的刚性件，跟手走，不再用世界朝向）
const FIST = {}; for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) FIST['RightHand' + f + k] = [0, 0, +(process.env.CURL || 1.0) * (k === 1 ? 1 : 0.9)];
FIST.RightHandThumb1 = [0, 0.3, 0.2]; FIST.RightHandThumb2 = [0, 0, 0.5];
export const IDLE = { LeftArm: [0, 0, -1.2], RightArm: [0, 0.2, 1.05], LeftForeArm: [0, 0, -0.2], RightForeArm: [0, 0, 0.5], ...FIST };
const M = (...a) => Object.assign({}, ...a);
const bend = (x, tw = 0) => ({ Spine: [x, tw, 0], Spine1: [x * 0.6, tw * 0.6, 0], Spine2: [x * 0.3, tw * 0.3, 0] });
const knee = k => ({ LeftUpLeg: [-k, 0, 0], LeftLeg: [k * 1.9, 0, 0], RightUpLeg: [-k, 0, 0], RightLeg: [k * 1.9, 0, 0], LeftFoot: [-k * 0.6, 0, 0], RightFoot: [-k * 0.6, 0, 0], _hy: -k * 0.11 });
const I = IDLE;
export const CLIPS = {
  idle: { name: '待机', k: [[0, I], [1.0, M(I, bend(0.04), { Head: [0.06, 0.08, 0], LeftArm: [0, 0.05, -1.15], LeftForeArm: [0, -0.15, -0.3] })], [2.0, M(I, bend(-0.02), { Head: [-0.04, -0.06, 0] })], [3.0, I]] },
  thrust: { name: '撑篙突刺', k: [[0, I],
    [0.6, M(I, bend(-0.05, 0.45), { RightArm: [0, -0.35, 0.95], RightForeArm: [0, 0, 1.0], RightHand: [-0.7, 0, 0], LeftArm: [0, 0.4, -1.0] })],
    [0.85, M(I, bend(0.28, -0.25), knee(0.2), { RightArm: [0, 1.3, 0.3], RightForeArm: [0, 0, 0.05], RightHand: [-1.45, 0, 0], LeftArm: [0, 0.5, -1.3], Head: [0.15, 0, 0] })],
    [1.4, M(I, bend(0.24, -0.2), knee(0.15), { RightArm: [0, 1.25, 0.32], RightForeArm: [0, 0, 0.1], RightHand: [-1.4, 0, 0], LeftArm: [0, 0.5, -1.25] })], [2.2, I]] },
  sweep: { name: '船篙横击', k: [[0, I],
    [0.6, M(I, bend(0.1, 0.8), knee(0.2), { RightArm: [0, -0.5, 0.35], RightForeArm: [0, 0, 0.6], LeftArm: [0, 0.6, -0.7] })],
    [1.0, M(I, bend(0.2, -0.85), knee(0.25), { RightArm: [0, 1.1, 0.45], RightForeArm: [0, 0, 0.2], LeftArm: [0, -0.3, -0.9] })],
    [1.5, M(I, bend(0.12, -0.8), knee(0.2), { RightArm: [0, 1.15, 0.4], RightForeArm: [0, 0, 0.2] })], [2.3, I]] },
};
