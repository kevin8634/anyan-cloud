// raidA 11-02 维尔格 / 萨琳逐技能关键帧 → glTF animations（萨琳共用）。0 积分，纯本地。
// 关键帧写法：[时间秒, { 骨名: [x,y,z] 欧拉偏移（骨局部四元数 = 绑定 × 偏移，与 skin_gordon.html / ferry clips 同约定）,
//   _hip: [dx,dy,dz] 胯部世界位移（身高 H 为单位）, _lf/_rf: [dx,dy,dz] 脚踝目标相对绑定位置的位移（腿用两骨 IK 保持踩地，_ik:0 关闭）,
//   _R/_L: { a:[x,y,z] 手中道具主轴朝向, n:[x,y,z] 道具法线朝向（可省）}（角色空间：+Z 朝前，+X 角色左手边，+Y 向上）}]
// 轴向（Lux3D mixamo 骨，fk.mjs 实测）：Spine/Hips x+ 前俯、z+ 向角色右侧弯、y 扭转；RightArm z+ 下放、x+ 前抬；LeftArm z- 下放、x+ 前抬；
//   前臂 x+ 屈肘向前；UpLeg x+ 大腿前抬；Leg x- 屈膝；Head x+ 低头
import * as THREE from 'three';
export const ease = t => t * t * (3 - 2 * t);
export function nodeTree(root) {   // gltf-transform 场景 → three 节点（含骨骼缩放）
  const O = new Map(), byName = {};
  const mk = n => { const o = new THREE.Object3D(); o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale()); o.userData.n = n; O.set(n, o); byName[n.getName().replace(/^mixamorig:?/, '')] = o; for (const c of n.listChildren()) o.add(mk(c)); return o; };
  const scn = new THREE.Object3D(); for (const n of root.listScenes()[0].listChildren()) scn.add(mk(n)); scn.updateMatrixWorld(true);
  return { scn, O, B: byName };
}
const V3 = a => new THREE.Vector3(...a);
export class Rig {
  constructor(root, names) {
    const t = nodeTree(root); this.scn = t.scn; this.B = t.B; this.names = names.filter(n => this.B[n]);
    this.Q0 = {}; this.P0 = {}; for (const n of this.names) { this.Q0[n] = this.B[n].quaternion.clone(); this.P0[n] = this.B[n].position.clone(); }
    this.rest(); const W = n => this.wp(n); this.foot0 = { L: W('LeftFoot'), R: W('RightFoot') }; this.H = W('Head').y - Math.min(this.foot0.L.y, this.foot0.R.y); this.hip0 = W('Hips');
    this.props = {};   // side → { axis（手局部主轴）, nrm（手局部法线） }
  }
  wp(n) { return new THREE.Vector3().setFromMatrixPosition(this.B[n].matrixWorld); }
  wq(n) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(this.B[n].matrixWorld)); }
  rest() { for (const n of this.names) { this.B[n].quaternion.copy(this.Q0[n]); this.B[n].position.copy(this.P0[n]); } this.scn.updateMatrixWorld(true); }
  setWorldQ(n, qw) { const o = this.B[n]; const pq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(o.parent.matrixWorld)); o.quaternion.copy(pq.invert().multiply(qw)); o.updateMatrixWorld(true); }
  apply(p) {
    this.rest(); const e = new THREE.Euler(), q = new THREE.Quaternion();
    for (const [n, v] of Object.entries(p)) if (n[0] !== '_' && this.B[n]) { e.set(...v); q.setFromEuler(e); this.B[n].quaternion.multiply(q); }
    if (p._hip) { const hp = this.B.Hips; const w = this.hip0.clone().add(V3(p._hip).multiplyScalar(this.H)); hp.parent.updateMatrixWorld(true); hp.position.copy(hp.parent.worldToLocal(w)); }
    this.scn.updateMatrixWorld(true);
    if (p._ik !== 0) for (const s of ['L', 'R']) this.legIK(s, this.foot0[s].clone().add(V3(p['_' + s.toLowerCase() + 'f'] || [0, 0, 0]).multiplyScalar(this.H)), p['_' + s.toLowerCase() + 'fr']);
    for (const s of ['L', 'R']) if (p['_' + s]) this.aim(s, p['_' + s]);
  }
  legIK(s, T, footRot) {   // 两骨 IK：膝盖朝角色前方（随胯部扭转）
    const P = s === 'L' ? 'Left' : 'Right', U = P + 'UpLeg', K = P + 'Leg', F = P + 'Foot';
    const footW0 = this.footRestW?.[s];
    const hp = this.wp(U), kp = this.wp(K), fp = this.wp(F); const a = hp.distanceTo(kp), b = kp.distanceTo(fp);
    const d = Math.min(Math.max(T.distanceTo(hp), Math.abs(a - b) + 1e-4), (a + b) * 0.9995); const u = T.clone().sub(hp).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.wq('Hips')).multiplyScalar(1); const pole = fwd.clone().addScaledVector(u, -fwd.dot(u)).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const Kt = hp.clone().addScaledVector(u, a * cosA).addScaledVector(pole, a * sinA); const Tt = hp.clone().addScaledVector(u, d);
    const rot = (n, from, to, tgt) => { const cur = to.clone().sub(from).normalize(), want = tgt.clone().sub(from).normalize(); const r = new THREE.Quaternion().setFromUnitVectors(cur, want); this.setWorldQ(n, r.multiply(this.wq(n))); };
    rot(U, hp, kp, Kt); rot(K, this.wp(K), this.wp(F), Tt);
    if (footW0) { let q = footW0.clone(); if (footRot) q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...footRot)).multiply(q); this.setWorldQ(F, q); }
  }
  aim(s, { a, n }) {   // 手中道具：主轴（与可选法线）指向目标
    const pr = this.props[s]; if (!pr) return; const hand = (s === 'L' ? 'Left' : 'Right') + 'Hand'; const qh = this.wq(hand);
    const ta = V3(a).normalize(); const ca = pr.axis.clone().applyQuaternion(qh);
    let r = new THREE.Quaternion().setFromUnitVectors(ca, ta);
    if (n && pr.nrm) { const cn = pr.nrm.clone().applyQuaternion(r.clone().multiply(qh)); const tn = V3(n).addScaledVector(ta, -V3(n).dot(ta)).normalize(); const cn2 = cn.addScaledVector(ta, -cn.dot(ta)).normalize();
      const ang = Math.atan2(cn2.clone().cross(tn).dot(ta), cn2.dot(tn)); r = new THREE.Quaternion().setFromAxisAngle(ta, ang).multiply(r); }
    this.setWorldQ(hand, r.multiply(qh));
  }
  snapFootRest() { this.rest(); this.footRestW = { L: this.wq('LeftFoot'), R: this.wq('RightFoot') }; }
}
// 朝向插值：球面插值；两朝向夹角 > 100° 时经过「角色前方」绕行（过头劈砍 / 上举 → 下插都从身前划过，不从身侧乱转）
function slerpV(a, b, u) { const A = V3(a).normalize(), B = V3(b).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(A, B); return A.applyQuaternion(new THREE.Quaternion().slerp(q, u)).toArray(); }
function aimLerp(a, b, u) {
  if (!a || !b) return a || b; const A = V3(a).normalize(), B = V3(b).normalize();
  if (A.dot(B) > -0.17) return slerpV(A.toArray(), B.toArray(), u);
  const d = B.clone().sub(A).normalize(); let m = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z); if (m.length() < 0.2) m = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y); m.normalize();
  return u < 0.5 ? slerpV(A.toArray(), m.toArray(), u * 2) : slerpV(m.toArray(), B.toArray(), u * 2 - 1);
}
function lerpPose(a, b, u) {
  const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k], vb = b[k];
    if (k === '_R' || k === '_L') { if (!va || !vb) { o[k] = (u < 0.5 ? va : vb) || va || vb; continue; } o[k] = { a: aimLerp(va.a, vb.a, u), n: aimLerp(va.n, vb.n, u) }; continue; }
    if (k === '_ik') { o[k] = u < 0.5 ? va : vb; continue; }
    const z = [0, 0, 0]; const A = va ?? z, Bv = vb ?? z; o[k] = A.map((v, i) => v + (Bv[i] - v) * u);
  } return o;
}
export function sample(keys, t) { let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++; const [t0, a] = keys[i], [t1, b] = keys[i + 1]; return lerpPose(a, b, ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))))); }
/** 烘焙所有动画写入 doc：clips = { id: { name, k: [[t,pose]...], loop?, hit? } } */
export function bake(doc, rig, clips, fps = 30) {
  const buf = doc.getRoot().listBuffers()[0]; const ac = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf); const out = [];
  for (const [id, c] of Object.entries(clips)) {
    const dur = c.k.at(-1)[0], n = Math.round(dur * fps) + 1; const T = new Float32Array(n); const R = {}; for (const b of rig.names) R[b] = new Float32Array(n * 4); const HP = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) { const t = Math.min(dur, f / fps); T[f] = t; rig.apply(sample(c.k, t)); for (const b of rig.names) rig.B[b].quaternion.toArray(R[b], f * 4); rig.B.Hips.position.toArray(HP, f * 3); }
    // 四元数连续（避免插值翻转）
    for (const b of rig.names) { const a = R[b]; for (let f = 1; f < n; f++) { const d = a[f * 4] * a[f * 4 - 4] + a[f * 4 + 1] * a[f * 4 - 3] + a[f * 4 + 2] * a[f * 4 - 2] + a[f * 4 + 3] * a[f * 4 - 1]; if (d < 0) for (let k = 0; k < 4; k++) a[f * 4 + k] *= -1; } }
    const anim = doc.createAnimation(id).setExtras({ zh: c.name, loop: !!c.loop, hit: c.hit ?? null, dur }); const tin = ac('SCALAR', T);
    for (const b of rig.names) { const a = R[b]; let moved = false; const q0 = rig.Q0[b]; for (let f = 0; f < n && !moved; f++) if (Math.abs(a[f * 4] * q0.x + a[f * 4 + 1] * q0.y + a[f * 4 + 2] * q0.z + a[f * 4 + 3] * q0.w) < 0.99999) moved = true;
      if (!moved) continue; const s = doc.createAnimationSampler().setInput(tin).setOutput(ac('VEC4', a)).setInterpolation('LINEAR'); anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(rig.B[b].userData.n).setTargetPath('rotation').setSampler(s)); }
    const s = doc.createAnimationSampler().setInput(tin).setOutput(ac('VEC3', HP)).setInterpolation('LINEAR'); anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(rig.B.Hips.userData.n).setTargetPath('translation').setSampler(s));
    out.push(`${id}(${c.name}) ${dur}s ${anim.listChannels().length}轨`);
  }
  rig.rest(); return out;
}
/** 关键帧自检：每个关键帧打印 双手 / 道具尖端 / 双脚最低点 高度（身高比例） */
export function report(rig, clips, tips = {}) {
  const r = []; const f = v => v.toArray().map(x => (x / rig.H).toFixed(2)).join(',');
  for (const [id, c] of Object.entries(clips)) for (const [t, p] of c.k) { rig.apply(p); const fy = Math.min(rig.wp('LeftFoot').y, rig.wp('RightFoot').y) - Math.min(rig.foot0.L.y, rig.foot0.R.y);
    const tp = Object.entries(tips).map(([k, fn]) => k + '[' + f(fn()) + ']').join(' '); r.push(`${id}@${t}: 右手[${f(rig.wp('RightHand'))}] 左手[${f(rig.wp('LeftHand'))}] ${tp} 脚离地 ${(fy / rig.H).toFixed(3)}`); }
  rig.rest(); return r;
}
