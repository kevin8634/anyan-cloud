// A8fix 生渡右胯试动（只出图用，不进 glb）：右大腿前抬 → 后摆 → 外展 → 内收 → 复位，验证外套布片不从下摆露出。
// EXTRA=./diag/hiptest.mjs node tools/rigfine/ferry_boss/shoot.mjs <glb> <out> hiptest   （GCAM=waist_r / waist_rq 右胯机位）
import { IDLE } from '../clips.mjs';
const P = (o) => ({ ...IDLE, ...o });
export default { hiptest: { k: [[0, P({})],
  [0.6, P({ RightUpLeg: [-0.75, 0, 0], RightLeg: [0.9, 0, 0] })],
  [1.2, P({ RightUpLeg: [0.45, 0, 0], RightLeg: [0.3, 0, 0] })],
  [1.8, P({ RightUpLeg: [0, 0, 0.5] })],
  [2.4, P({ RightUpLeg: [0, 0, -0.3], Hips: [0, -0.35, 0] })],
  [3.0, P({ RightUpLeg: [-0.4, 0.3, 0.25], RightLeg: [0.6, 0, 0], Spine: [0.15, 0.4, 0] })],
  [3.6, P({})]] } };
