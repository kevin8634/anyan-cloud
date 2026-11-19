// v1.2.73 怪物程序化绑骨 + 程序化动作（docs/设计/技能特效/02_怪物/动作与绑骨/怪物动作与绑骨排查.md 第 2 节）
// 无骨骼的写实静态网格（Lux3D GLB）→ 按体型模板在浏览器里自动生成简易骨架和蒙皮权重（几何体按模型缓存，实例共用）
// → ProcAnim：和 CharAnim 同接口（loop / play / update / revive），现有调用点（walk / attack1 / heavy / hit / death / cast…）直接生效。
// 模板：H 人形、H袍 长袍（腿换袍摆链）、F 漂浮幽魂、F翼 飞虫、G鲸 巨鲸；11-19 加 Q4 四足兽、Q蟾 蟾蜍、Q多足 蜘蛛 / 蝎 / 甲虫。步伐按实际位移推进（不滑步），攻击分「预备 → 出手 → 收招」，
// 出手帧对齐扣血时刻（预备由 windup 提前播，见 main.ts / EnemyBrain.windup）
import * as THREE from 'three';

export type RigTpl = 'H' | 'H袍' | 'F' | 'F翼' | 'G鲸' | 'Q4' | 'Q蟾' | 'Q多足';
type V3 = [number, number, number];
interface BoneDef { name: string; parent: string | null; p: V3 }
interface Built { geo: THREE.BufferGeometry; bones: BoneDef[]; h: number; len: number; info: RigInfo; meta?: QMeta }
export interface RigInfo { tpl: RigTpl; bones: number; verts: number; arms: number; weightErr: number; comps: number; rigidComps: number }

const cache = new Map<string, Built>();

/** 量化属性转浮点（meshopt Int16 / Int8 归一化），蒙皮前必须做，否则变换溢出拉丝 */
function floatify(geo: THREE.BufferGeometry) {
  for (const nm of ['position', 'normal']) {
    const a = geo.getAttribute(nm) as THREE.BufferAttribute | undefined; if (!a || a.array instanceof Float32Array) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j);
    geo.setAttribute(nm, new THREE.BufferAttribute(f, a.itemSize));
  }
}

function pct(a: number[], q: number) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; }

/** 点到线段距离² */
function segD2(px: number, py: number, pz: number, a: V3, b: V3) {
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], wx = px - a[0], wy = py - a[1], wz = pz - a[2];
  const L = vx * vx + vy * vy + vz * vz; const t = L > 1e-9 ? Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / L)) : 0;
  const dx = wx - vx * t, dy = wy - vy * t, dz = wz - vz * t; return dx * dx + dy * dy + dz * dz;
}

/** 生成骨架 + 每个顶点的分区（可受哪些骨影响） */
function layout(tpl: RigTpl, P: Float32Array, n: number, H: number, W: number, D: number): Lay {
  if (tpl === 'Q4' || tpl === 'Q蟾') return quadLayout(tpl === 'Q蟾', P, n, H, W, D);
  if (tpl === 'Q多足') return multiLayout(P, n, H, W, D);
  const bones: BoneDef[] = []; const B = (name: string, parent: string | null, p: V3) => bones.push({ name, parent, p });
  const part = new Array<string[]>(n);
  let arms = 0;
  if (tpl === 'G鲸' || tpl === 'F翼') {
    // 身体沿 Z：头朝 +Z。按 Z 分段取质心作为脊柱
    let zmin = Infinity, zmax = -Infinity; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    const L = zmax - zmin, seg = tpl === 'G鲸' ? 7 : 4;
    const cy: number[] = new Array(seg).fill(0), cnt: number[] = new Array(seg).fill(0);
    for (let i = 0; i < n; i++) { const s = Math.min(seg - 1, Math.floor((P[i * 3 + 2] - zmin) / L * seg)); if (tpl === 'F翼' && Math.abs(P[i * 3]) > W * 0.18) continue; cy[s] += P[i * 3 + 1]; cnt[s]++; }
    for (let s = 0; s < seg; s++) cy[s] = cnt[s] ? cy[s] / cnt[s] : H * 0.5;
    const zAt = (s: number) => zmin + L * (s + 0.5) / seg;
    const mid = Math.floor(seg / 2);
    B('root', null, [0, cy[mid], zAt(mid)]);
    for (let s = mid + 1; s < seg; s++) B('f' + (s - mid), s === mid + 1 ? 'root' : 'f' + (s - mid - 1), [0, cy[s], zAt(s)]);
    B('fEnd', 'f' + (seg - 1 - mid), [0, cy[seg - 1], zmax]);
    for (let s = mid - 1; s >= 0; s--) B('b' + (mid - s), s === mid - 1 ? 'root' : 'b' + (mid - s - 1), [0, cy[s], zAt(s)]);
    B('bEnd', 'b' + mid, [0, cy[0], zmin]);
    const spine = bones.map(b => b.name);
    if (tpl === 'F翼') {
      const wy = cy[mid];
      B('wingL', 'root', [W * 0.12, wy, zAt(mid)]); B('wingLt', 'wingL', [W * 0.5, wy, zAt(mid)]);
      B('wingR', 'root', [-W * 0.12, wy, zAt(mid)]); B('wingRt', 'wingR', [-W * 0.5, wy, zAt(mid)]);
      for (let i = 0; i < n; i++) { const x = P[i * 3]; part[i] = x > W * 0.15 ? ['wingL', 'wingLt', 'root'] : x < -W * 0.15 ? ['wingR', 'wingRt', 'root'] : spine; }
      arms = 2;
    } else for (let i = 0; i < n; i++) part[i] = spine;
    return { bones, part, arms, armMin: 0 };
  }
  // ---- 人形 / 长袍 / 幽魂：身体沿 Y
  let cz = 0; { const zs: number[] = []; for (let i = 0; i < n; i += 3) { const y = P[i * 3 + 1]; if (y > H * 0.5 && y < H * 0.8) zs.push(P[i * 3 + 2]); } cz = pct(zs, 0.5); }
  const robe = tpl !== 'H';
  const hipY = H * (robe ? 0.5 : 0.49), chestY = H * 0.71, neckY = H * 0.84;
  const sh: number[] = []; for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y > H * 0.72 && y < H * 0.82) sh.push(Math.abs(P[i * 3])); }
  const sx = Math.max(H * 0.07, pct(sh, 0.9) * 0.8), shY = H * 0.8;
  // 手臂区：比腰部躯干半宽更靠外（贴身垂手的瘦人形不能把半个躯干划给手臂，否则抬手时躯干被撕开）
  const waist: number[] = []; for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y > H * 0.55 && y < H * 0.66) waist.push(Math.abs(P[i * 3])); }
  const armMin = Math.max(sx * 0.8, pct(waist, 0.55) * 1.1);
  const isArm = (x: number, y: number) => Math.abs(x) > armMin && y > H * 0.22 && y < H * 0.87;
  // 手：每侧离肩最远的一团（P95 距离处的平均）
  const hand = (sgn: number): V3 => {
    const ps: V3[] = []; for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1]; if (x * sgn > 0 && isArm(x, y)) ps.push([x, y, P[i * 3 + 2]]); }
    if (ps.length < 30) return [sgn * sx * 1.1, H * 0.45, cz];
    arms++;
    const d = ps.map(p => Math.hypot(p[0] - sgn * sx, p[1] - shY, p[2] - cz)); const th = pct(d, 0.85);
    const far = ps.filter((_, i) => d[i] >= th); const m: V3 = [0, 0, 0]; for (const p of far) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
    return [m[0] / far.length, m[1] / far.length, m[2] / far.length];
  };
  const hL = hand(1), hR = hand(-1);
  const elbow = (s: V3, h: V3): V3 => [(s[0] + h[0]) / 2 + Math.sign(s[0]) * H * 0.02, (s[1] + h[1]) / 2, (s[2] + h[2]) / 2 - H * 0.02];
  const legs: number[] = []; for (let i = 0; i < n; i++) if (P[i * 3 + 1] < H * 0.15) legs.push(Math.abs(P[i * 3]));
  const lx = Math.max(H * 0.045, Math.min(sx * 0.7, pct(legs, 0.5)));
  B('root', null, [0, 0, cz]); B('hips', 'root', [0, hipY, cz]); B('spine', 'hips', [0, H * 0.61, cz]); B('chest', 'spine', [0, chestY, cz]);
  B('neck', 'chest', [0, neckY, cz]); B('head', 'neck', [0, H * 0.92, cz]); B('headEnd', 'head', [0, H, cz]);
  const sL: V3 = [sx, shY, cz], sR: V3 = [-sx, shY, cz];
  B('uarmL', 'chest', sL); B('farmL', 'uarmL', elbow(sL, hL)); B('handL', 'farmL', hL);
  B('uarmR', 'chest', sR); B('farmR', 'uarmR', elbow(sR, hR)); B('handR', 'farmR', hR);
  if (robe) { B('robe1', 'hips', [0, H * 0.35, cz]); B('robe2', 'robe1', [0, H * 0.2, cz]); B('robe3', 'robe2', [0, H * 0.05, cz]); B('robeEnd', 'robe3', [0, 0, cz]); }
  else {
    B('thighL', 'hips', [lx, hipY - H * 0.02, cz]); B('shinL', 'thighL', [lx, H * 0.27, cz]); B('footL', 'shinL', [lx, H * 0.04, cz]); B('toeL', 'footL', [lx, 0, cz + H * 0.07]);
    B('thighR', 'hips', [-lx, hipY - H * 0.02, cz]); B('shinR', 'thighR', [-lx, H * 0.27, cz]); B('footR', 'shinR', [-lx, H * 0.04, cz]); B('toeR', 'footR', [-lx, 0, cz + H * 0.07]);
  }
  const torso = ['hips', 'spine', 'chest', 'neck'], head = ['chest', 'neck', 'head'];
  const armL = ['chest', 'uarmL', 'farmL', 'handL'], armR = ['chest', 'uarmR', 'farmR', 'handR'];
  const low = robe ? ['hips', 'robe1', 'robe2', 'robe3'] : null, legL = ['hips', 'thighL', 'shinL', 'footL'], legR = ['hips', 'thighR', 'shinR', 'footR'];
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1];
    if (y > neckY - H * 0.02 && Math.abs(x) < sx * 0.85) part[i] = head;
    else if (isArm(x, y)) part[i] = x > 0 ? armL : armR;
    else if (y < hipY + H * 0.03) part[i] = low ?? (x >= 0 ? legL : legR);
    else part[i] = torso;
  }
  return { bones, part, arms, armMin };
}

// ================================================================ 11-19 四足 / 蟾蜍 / 多足（Rhett 11-19 03:15「加一套四足绑骨」）
// 身体沿 Z、头朝 +Z（yaw 已烘进几何体）。骨架位置全部从网格统计出来：脚 = 贴地顶点按象限 / 角度聚类，腹线 = 前后脚之间最低点，
// 脊柱 = 各 z 切片质心，头 = 最前一段质心。分区按「腿区 → 头区 → 尾区 → 躯干」顺序判，之后同样走权重扩散 + 小块刚性
export interface QLeg { a: string; b: string; c: string; side: number; front: boolean; dir: [number, number]; group: number; len: number }
export interface QMeta { legs: QLeg[]; legLen: number; bodyLen: number; halfW: number; cycle: number; tail: number; jaw: boolean; claws: boolean }
/** boost：分区第一根骨（躯干骨）的权重倍数，腿根 / 肩胯一圈加大，防止腿摆动时把躯干撕开（同人形腋下做法） */
type Lay = { bones: BoneDef[]; part: string[][]; arms: number; armMin: number; meta?: QMeta; boost?: Float32Array };

function quadLayout(toad: boolean, P: Float32Array, n: number, H: number, W: number, D: number): Lay {
  const bones: BoneDef[] = []; const B = (name: string, parent: string | null, p: V3) => bones.push({ name, parent, p });
  const part = new Array<string[]>(n);
  let zmin = Infinity, zmax = -Infinity; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const L = Math.max(zmax - zmin, 1e-3);
  // 1) 脚：贴地顶点（y < 12% 身高）按 左右 × 前后 四象限取质心（蟾蜍排除腹部中线）
  const low: number[] = []; for (let i = 0; i < n; i++) { const y = P[i * 3 + 1]; if (y < H * 0.12 && (!toad || Math.abs(P[i * 3]) > W * 0.12)) low.push(i); }
  const zSplit = pct(low.map(i => P[i * 3 + 2]), 0.5) || (zmin + zmax) / 2;
  const feet: V3[] = [];   // FL FR RL RR
  for (const [front, side] of [[true, 1], [true, -1], [false, 1], [false, -1]] as const) {
    let sx = 0, sz = 0, c = 0; for (const i of low) { const x = P[i * 3], z = P[i * 3 + 2]; if ((z >= zSplit) === front && x * side > 0) { sx += x; sz += z; c++; } }
    feet.push(c > 10 ? [sx / c, 0, sz / c] : [side * W * 0.22, 0, zSplit + (front ? 0.25 : -0.25) * L]);
  }
  const shZ = (feet[0][2] + feet[1][2]) / 2, hpZ = (feet[2][2] + feet[3][2]) / 2;
  // 2) 腹线 / 背线：前后脚之间那段的最低 / 最高点
  const midA = Math.min(shZ, hpZ), midB = Math.max(shZ, hpZ), mA = midA + (midB - midA) * 0.3, mB = midB - (midB - midA) * 0.3;
  const midY: number[] = []; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2]; if (z > mA && z < mB) midY.push(P[i * 3 + 1]); }
  const bellyY = Math.min(H * 0.7, Math.max(H * (toad ? 0.06 : 0.15), pct(midY, 0.03))), topY = Math.max(bellyY + H * 0.1, pct(midY, 0.97));
  const yAt = (z0: number, lo = bellyY) => { let s = 0, c = 0; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2], y = P[i * 3 + 1]; if (Math.abs(z - z0) < L * 0.06 && y > lo && Math.abs(P[i * 3]) < W * 0.3) { s += y; c++; } } return c ? s / c : (bellyY + topY) / 2; };
  const spY = (z: number) => Math.max(bellyY + (topY - bellyY) * 0.35, Math.min(topY - (topY - bellyY) * 0.15, yAt(z)));
  const midZ = (shZ + hpZ) / 2;
  B('root', null, [0, 0, midZ]);
  B('hips', 'root', [0, spY(hpZ), hpZ]); B('spine', 'hips', [0, spY(midZ), midZ]); B('chest', 'spine', [0, spY(shZ), shZ]);
  // 3) 头：最前 18% 的质心；颈 / 头关节在胸 → 头质心连线上
  let hx = 0, hy = 0, hz = 0, hc = 0; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2], y = P[i * 3 + 1]; if (z > zmax - L * 0.18 && y > bellyY * 0.6) { hx += P[i * 3]; hy += y; hz += z; hc++; } }
  const chest = bones[3].p; const head: V3 = hc ? [0, hy / hc, hz / hc] : [0, topY, zmax - L * 0.09];
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const neckP = lerp(chest, head, toad ? 0.5 : 0.3), headP = lerp(chest, head, toad ? 0.75 : 0.62);
  // 吻部尖端那一片的上下中线：下颌分界
  const tipY: number[] = []; for (let i = 0; i < n; i++) if (P[i * 3 + 2] > zmax - L * 0.06 && P[i * 3 + 1] > bellyY * 0.5) tipY.push(P[i * 3 + 1]);
  const snoutLo = pct(tipY, 0.05), snoutHi = pct(tipY, 0.95), snoutMid = (snoutLo + snoutHi) / 2;
  B('neck', 'chest', neckP); B('head', 'neck', headP); B('headEnd', 'head', [0, snoutMid, zmax]);
  const jawP: V3 = [0, Math.min(headP[1], snoutMid) - (snoutHi - snoutLo) * 0.15, headP[2]];
  B('jaw', 'head', jawP); B('jawEnd', 'jaw', [0, snoutLo + (snoutHi - snoutLo) * 0.2, zmax - L * 0.01]);
  const jawCut = (z: number) => jawP[1] + (snoutMid - jawP[1]) * Math.max(0, Math.min(1, (z - jawP[2]) / Math.max(1e-4, zmax - jawP[2])));
  // 4) 尾：髋后还有 ≥ 15% 身长的部分
  const tb = hpZ - L * 0.12; let tailN = 0; for (let i = 0; i < n; i++) if (P[i * 3 + 2] < tb - L * 0.04 && P[i * 3 + 1] > bellyY * 0.5) tailN++;
  const tail = zmin < hpZ - L * 0.15 && tailN > n * 0.01 ? 2 : 0;
  if (tail) { const tm = (tb + zmin) / 2; B('tail1', 'hips', [0, spY(tb), tb]); B('tail2', 'tail1', [0, yAt(tm, bellyY * 0.4), tm]); B('tailEnd', 'tail2', [0, yAt(zmin + L * 0.03, 0), zmin]); }
  if (toad) B('belly', 'hips', [0, bellyY + (topY - bellyY) * 0.3, midZ]);
  // 5) 腿：肩 / 髋关节在腹线上方、脚的正上方偏内；膝在中段（后腿膝略后：跗关节）
  const names = ['FL', 'FR', 'RL', 'RR']; const legs: QLeg[] = [];
  const legTop = bellyY + (topY - bellyY) * 0.25;
  feet.forEach((f, q) => {
    const front = q < 2, side = q % 2 === 0 ? 1 : -1, nm = names[q];
    const S: V3 = [f[0] * 0.75, bellyY + (topY - bellyY) * 0.3, f[2] + (front ? 0 : L * 0.02)];
    const K: V3 = [f[0] * 0.9, S[1] * 0.5, f[2] + (front ? -L * 0.015 : (toad ? -L * 0.06 : L * 0.04))];
    const A: V3 = [f[0], S[1] * 0.12, f[2]];
    B('lu' + nm, front ? 'chest' : 'hips', S); B('ll' + nm, 'lu' + nm, K); B('lf' + nm, 'll' + nm, A); B('lt' + nm, 'lf' + nm, [f[0], 0, f[2] + L * 0.04]);
    legs.push({ a: 'lu' + nm, b: 'll' + nm, c: 'lf' + nm, side, front, dir: [0, 1], group: (q === 0 || q === 3) ? 0 : 1, len: S[1] });
  });
  const legLen = legs.reduce((s, l) => s + l.len, 0) / 4;
  // 6) 分区
  // 躯干不含颈骨：颈往下压时，颈关节后方的顶点若跟颈骨走会反向翘起（背上拉出楔形）
  const torso = toad ? ['hips', 'spine', 'chest', 'belly'] : ['hips', 'spine', 'chest'];
  const boost = new Float32Array(n).fill(1);
  const headPart = ['chest', 'neck', 'head'], jawPart = ['neck', 'head', 'jaw'], tailPart = ['hips', 'tail1', 'tail2'];
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const front = z >= zSplit, q = (front ? 0 : 2) + (x >= 0 ? 0 : 1), f = feet[q];
    if (y < legTop && Math.abs(z - f[2]) < L * 0.2 && !(z > neckP[2] + L * 0.05 && y > bellyY)) { const l = legs[q]; part[i] = [front ? 'chest' : 'hips', l.a, l.b, l.c]; const u = Math.max(0, Math.min(1, (legTop - y) / (legTop * 0.35))); boost[i] = 1 + 4 * (1 - u * u * (3 - 2 * u)); }
    else if ((z > neckP[2] && y > bellyY * 0.6) || (z > shZ && y > Math.max(topY + (H - topY) * 0.25, headP[1] + H * 0.12))) part[i] = z > headP[2] - L * 0.02 && y < jawCut(z) ? jawPart : headPart;
    else if (tail && z < tb) part[i] = tailPart;
    else part[i] = torso;
  }
  const amp = 0.38;
  return { bones, part, arms: 4, armMin: 0, boost, meta: { legs, legLen, bodyLen: L, halfW: W / 2, cycle: Math.max(L * 0.5, 4 * legLen * Math.sin(amp)), tail, jaw: true, claws: false } };
}

function multiLayout(P: Float32Array, n: number, H: number, W: number, D: number): Lay {
  const bones: BoneDef[] = []; const B = (name: string, parent: string | null, p: V3) => bones.push({ name, parent, p });
  const part = new Array<string[]>(n);
  let zmin = Infinity, zmax = -Infinity; for (let i = 0; i < n; i++) { const z = P[i * 3 + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const L = Math.max(zmax - zmin, 1e-3), S = Math.max(W, L);
  const zMid0 = (zmin + zmax) / 2;
  // 躯干半宽：中段切片 |x| 的低分位（腿在外侧、身体在内）
  const rx: number[] = []; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3 + 2] - zMid0) < L * 0.25) rx.push(Math.abs(P[i * 3]));
  const bw = Math.max(W * 0.07, Math.min(W * 0.3, pct(rx, 0.35)));
  // 躯干 = 中线带（|x| < bw）；蝎子有尾（中线带里高出身体很多的部分）
  const by: number[] = []; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3]) < bw) by.push(P[i * 3 + 1]);
  const scorp = H > 0.55 * L;
  const bodyY0 = pct(by, scorp ? 0.25 : 0.5);   // 蝎尾抬高了中线带的平均高度，取低分位
  const bodyTop = scorp ? bodyY0 * 1.9 + S * 0.02 : Infinity;
  // 身体 z 范围（不含尾）
  const bz: number[] = []; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3]) < bw && P[i * 3 + 1] < bodyTop) bz.push(P[i * 3 + 2]);
  let bz0 = pct(bz, 0.01), bz1 = pct(bz, 0.99);
  // 蝎：螯钳 = 前方外侧；尾 = 身体后上方中线带
  const clawZ = scorp ? bz1 - (bz1 - bz0) * 0.12 : Infinity;
  let tailRear = bz0;
  if (scorp) { const zs: number[] = []; for (let i = 0; i < n; i++) if (Math.abs(P[i * 3]) < bw * 1.4 && P[i * 3 + 1] > bodyTop) zs.push(P[i * 3 + 2]); if (zs.length > n * 0.02) { tailRear = Math.max(bz0, pct(zs, 0.02)); bz0 = Math.max(bz0, zmin + (bz1 - zmin) * 0.25); } }
  const zMid = (bz0 + bz1) / 2, bL = bz1 - bz0;
  B('root', null, [0, 0, zMid]); B('thorax', 'root', [0, bodyY0, zMid]);
  B('head', 'thorax', [0, bodyY0, zMid + bL * 0.28]); B('headEnd', 'head', [0, bodyY0, bz1]);
  B('abdomen', 'thorax', [0, bodyY0, zMid - bL * 0.12]); B('abdEnd', 'abdomen', [0, bodyY0, bz0]);
  // 脚：贴地外侧顶点按「从身体中心看过去的角度」每侧聚类，2–4 条
  const lowT = Math.max(H * 0.05, S * 0.03);
  const isClaw = (x: number, z: number) => z > clawZ && Math.abs(x) > bw * 0.6;
  const legs: QLeg[] = [];
  for (const side of [1, -1]) {
    const pts: { a: number; i: number }[] = [];
    for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (y < lowT && x * side > bw * 0.9 && !isClaw(x, z)) pts.push({ a: Math.atan2(z - zMid, Math.abs(x)), i }); }
    // 贴地点按空间邻接聚类（格子 r = 3% 体长，相邻格连通）：每条腿的着地段是一团
    const r = S * 0.03, cell = new Map<string, number>(), par = pts.map((_, k) => k);
    const fd = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    pts.forEach((p, k) => { const gx = Math.floor(P[p.i * 3] / r), gz = Math.floor(P[p.i * 3 + 2] / r); cell.set(gx + ',' + gz, k); });
    pts.forEach((p, k) => { const gx = Math.floor(P[p.i * 3] / r), gz = Math.floor(P[p.i * 3 + 2] / r); for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const j = cell.get((gx + ox) + ',' + (gz + oz)); if (j !== undefined) { const A = fd(k), Bq = fd(j); if (A !== Bq) par[A] = Bq; } } });
    const grp = new Map<number, { a: number; i: number }[]>(); pts.forEach((p, k) => { const g = fd(k); let l = grp.get(g); if (!l) grp.set(g, l = []); l.push(p); });
    let cl = [...grp.values()].filter(c => c.length >= Math.max(4, pts.length * 0.03)).sort((p, q) => q.length - p.length).slice(0, 4);
    const ca = (c: { a: number }[]) => c.reduce((s, p) => s + p.a, 0) / c.length;
    cl.sort((p, q) => ca(q) - ca(p));   // 前 → 后
    cl.forEach((c, k) => {
      let fx = 0, fz = 0; for (const p of c) { fx += P[p.i * 3]; fz += P[p.i * 3 + 2]; } fx /= c.length; fz /= c.length;
      const az = Math.max(bz0 + bL * 0.15, Math.min(bz1 - bL * 0.2, zMid + (fz - zMid) * 0.35));
      const A: V3 = [side * bw * 0.85, bodyY0, az];
      const dx = fx - A[0], dz = fz - A[2], dl = Math.hypot(dx, dz) || 1;
      // 膝：沿 A→F 方向 15–75% 处、离这条线不远的顶点里最高的那一撮
      const ky: number[] = [], kc: V3[] = [];
      for (let i = 0; i < n; i++) { const x = P[i * 3], z = P[i * 3 + 2]; if (x * side < bw * 0.9) continue; const t = ((x - A[0]) * dx + (z - A[2]) * dz) / (dl * dl); if (t < 0.15 || t > 0.75) continue; const off = Math.abs((x - A[0]) * dz - (z - A[2]) * dx) / dl; if (off > dl * 0.12) continue; ky.push(P[i * 3 + 1]); kc.push([x, P[i * 3 + 1], z]); }
      let K: V3 = [A[0] + dx * 0.4, bodyY0 + S * 0.05, A[2] + dz * 0.4];
      if (kc.length > 8) { const th = pct(ky, 0.9); const top = kc.filter(p => p[1] >= th); K = [top.reduce((s, p) => s + p[0], 0) / top.length, th, top.reduce((s, p) => s + p[2], 0) / top.length]; }
      const nm = (side > 0 ? 'L' : 'R') + k;
      B('la' + nm, 'thorax', A); B('lb' + nm, 'la' + nm, K); B('lc' + nm, 'lb' + nm, [fx, 0, fz]);
      legs.push({ a: 'la' + nm, b: 'lb' + nm, c: 'lc' + nm, side, front: k === 0, dir: [dx / dl, dz / dl], group: (k + (side > 0 ? 0 : 1)) % 2, len: Math.hypot(dx, dz) });
    });
  }
  // 螯钳
  let claws = false;
  if (scorp) for (const side of [1, -1]) {
    const cs: V3[] = []; for (let i = 0; i < n; i++) { const x = P[i * 3], z = P[i * 3 + 2]; if (isClaw(x, z) && x * side > 0) cs.push([x, P[i * 3 + 1], z]); }
    if (cs.length < n * 0.01) continue; claws = true;
    const zz = cs.map(p => p[2]); const zt = pct(zz, 0.85), zm0 = pct(zz, 0.35), zm1 = pct(zz, 0.6);
    const avg = (f: (p: V3) => boolean): V3 => { const s = cs.filter(f); const c = s.length || 1; return [s.reduce((a, p) => a + p[0], 0) / c, s.reduce((a, p) => a + p[1], 0) / c, s.reduce((a, p) => a + p[2], 0) / c]; };
    const nm = side > 0 ? 'L' : 'R';
    B('claw' + nm, 'head', [side * bw * 0.8, bodyY0, clawZ]); B('clawm' + nm, 'claw' + nm, avg(p => p[2] >= zm0 && p[2] <= zm1)); B('clawt' + nm, 'clawm' + nm, avg(p => p[2] >= zt));
  }
  // 尾：身体后端为圆心，按极角（向后 → 向上 → 向前）分 5 段取质心
  let tail = 0;
  if (scorp) {
    const C: [number, number] = [bz0, bodyY0];
    const tv: { a: number; p: V3 }[] = [];
    for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Math.abs(x) > bw * 1.6) continue; if (y > bodyTop || (z < bz0 && y > lowT)) tv.push({ a: Math.atan2(y - C[1], -(z - C[0])), p: [x, y, z] }); }
    if (tv.length > n * 0.02) {
      const as = tv.map(t => t.a); const a0 = pct(as, 0.02), a1 = pct(as, 0.98); tail = 5;
      let parent = 'abdomen'; B('tail0', 'abdomen', [0, bodyY0, bz0]); parent = 'tail0';
      for (let s = 1; s <= tail; s++) {
        const lo = a0 + (a1 - a0) * (s - 0.5) / tail, hi = a0 + (a1 - a0) * (s + 0.5) / tail;
        const sel = tv.filter(t => t.a >= lo && t.a < hi); const c = sel.length || 1;
        B('tail' + s, parent, [0, sel.reduce((a, t) => a + t.p[1], 0) / c, sel.reduce((a, t) => a + t.p[2], 0) / c]); parent = 'tail' + s;
      }
    }
  }
  // 分区
  const body = ['thorax', 'head', 'abdomen'];
  const tailBones = tail ? ['abdomen', 'tail0', ...Array.from({ length: tail }, (_, s) => 'tail' + (s + 1))] : null;
  const boost = new Float32Array(n).fill(1);
  // 腿区 = 离某条腿（肩 → 膝 → 脚两段）3D 距离 < 9% 体长；壳 / 背甲伸到腿上方的部分离腿远，仍算躯干
  const legR2 = (S * 0.09) ** 2, bp = (nm: string) => bones.find(b => b.name === nm)!.p;
  const legOf = (x: number, y: number, z: number) => { let best = -1, bd = legR2; legs.forEach((l, k) => { if (l.side * x <= 0) return; const A = bp(l.a), K = bp(l.b), F = bp(l.c); const d = Math.min(segD2(x, y, z, A, K), segD2(x, y, z, K, F)); if (d < bd) { bd = d; best = k; } }); return best; };
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (claws && isClaw(x, z)) { const nm = x > 0 ? 'L' : 'R'; part[i] = bones.some(b => b.name === 'claw' + nm) ? ['head', 'claw' + nm, 'clawm' + nm, 'clawt' + nm] : body; continue; }
    if (tailBones && Math.abs(x) < bw * 1.6 && (y > bodyTop || (z < bz0 && y > lowT))) { part[i] = tailBones; continue; }
    if (Math.abs(x) > bw) { const k = legOf(x, y, z); if (k >= 0) { part[i] = ['thorax', legs[k].a, legs[k].b]; const u = Math.max(0, Math.min(1, (Math.abs(x) - bw) / (W * 0.1))); boost[i] = 1 + 5 * (1 - u * u * (3 - 2 * u)); continue; } }
    part[i] = body;
  }
  const reach = legs.length ? legs.reduce((s, l) => s + l.len, 0) / legs.length : W * 0.3;
  return { bones, part, arms: legs.length, armMin: 0, boost, meta: { legs, legLen: Math.max(bodyY0, S * 0.05), bodyLen: bL, halfW: bw, cycle: Math.max(bL * 0.4, 4 * reach * Math.sin(0.3)), tail, jaw: false, claws } };
}

/** 网格连通块（按索引连边；UV 接缝处按位置焊接） */
function components(geo: THREE.BufferGeometry, P: Float32Array, n: number, scale: number) {
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const f = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const u = (a: number, b: number) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
  const q = scale * 1e-4, key = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = Math.round(P[i * 3] / q) + ',' + Math.round(P[i * 3 + 1] / q) + ',' + Math.round(P[i * 3 + 2] / q); const j = key.get(k); if (j === undefined) key.set(k, i); else u(i, j); }
  const ix = geo.index; if (ix) for (let t = 0; t < ix.count; t += 3) { const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2); u(a, b); u(b, c); }
  const g = new Map<number, number[]>(); for (let i = 0; i < n; i++) { const r = f(i); let l = g.get(r); if (!l) g.set(r, l = []); l.push(i); }
  return { list: [...g.values()] };
}

function smoothWeights(geo: THREE.BufferGeometry, P: Float32Array, n: number, scale: number, nb: number, si: Uint16Array, sw: Float32Array, iters: number) {
  // 焊接：同位置顶点映射到代表点
  const q = scale * 1e-4, key = new Map<string, number>(), rep = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = Math.round(P[i * 3] / q) + ',' + Math.round(P[i * 3 + 1] / q) + ',' + Math.round(P[i * 3 + 2] / q); const j = key.get(k); if (j === undefined) { key.set(k, i); rep[i] = i; } else rep[i] = j; }
  const ix = geo.index; if (!ix) return;
  // 邻接（代表点之间）
  const adj: Set<number>[] = []; for (let i = 0; i < n; i++) if (rep[i] === i) adj[i] = new Set();
  for (let t = 0; t < ix.count; t += 3) { const v = [rep[ix.getX(t)], rep[ix.getX(t + 1)], rep[ix.getX(t + 2)]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (v[a] !== v[b]) adj[v[a]].add(v[b]); }
  let W = new Float32Array(n * nb);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) W[rep[i] * nb + si[i * 4 + k]] += sw[i * 4 + k];
  for (let i = 0; i < n; i++) if (rep[i] === i) { let s = 0; for (let b = 0; b < nb; b++) s += W[i * nb + b]; if (s > 0) for (let b = 0; b < nb; b++) W[i * nb + b] /= s; }
  for (let it = 0; it < iters; it++) {
    const N = new Float32Array(n * nb);
    for (let i = 0; i < n; i++) { if (rep[i] !== i) continue; const a = adj[i]; const o = i * nb;
      if (!a.size) { for (let b = 0; b < nb; b++) N[o + b] = W[o + b]; continue; }
      for (const j of a) for (let b = 0; b < nb; b++) N[o + b] += W[j * nb + b];
      const inv = 0.5 / a.size; for (let b = 0; b < nb; b++) N[o + b] = W[o + b] * 0.5 + N[o + b] * inv; }
    W = N;
  }
  for (let i = 0; i < n; i++) {
    const o = rep[i] * nb; const top: [number, number][] = [];
    for (let b = 0; b < nb; b++) if (W[o + b] > 1e-4) top.push([b, W[o + b]]);
    top.sort((x, y) => y[1] - x[1]); top.length = Math.min(4, top.length);
    const s = top.reduce((a, c) => a + c[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = top[k] ? top[k][0] : 0; sw[i * 4 + k] = top[k] ? top[k][1] / s : 0; }
  }
}

function build(key: string, src: THREE.BufferGeometry, tpl: RigTpl, yaw: number): Built {
  const hit = cache.get(key); if (hit) return hit;
  const geo = src.clone(); floatify(geo); if (yaw) geo.rotateY(yaw);
  geo.computeBoundingBox(); const bb = geo.boundingBox!;
  const H = bb.max.y - bb.min.y, W = Math.max(bb.max.x - bb.min.x, 1e-3), D = bb.max.z - bb.min.z;
  const P = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array, n = P.length / 3;
  const { bones, part, arms, armMin, meta, boost } = layout(tpl, P, n, H, W, D);
  const chestJ = bones.findIndex(b => b.name === 'chest');
  const idx = new Map(bones.map((b, i) => [b.name, i] as const));
  // 每根骨视为线段（自己 → 第一个子骨；叶子骨长度 0）；权重 = exp(-d²/2σ²)，只在分区允许的骨里取前 4
  const seg = bones.map(b => { const c = bones.find(x => x.parent === b.name); return { a: b.p, b: c ? c.p : b.p, len: c ? Math.hypot(c.p[0] - b.p[0], c.p[1] - b.p[1], c.p[2] - b.p[2]) : 0 }; });
  const scale = Math.max(H, D) || 1;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  let err = 0;
  for (let i = 0; i < n; i++) {
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    const cand = part[i].map(nm => { const j = idx.get(nm)!; const s = seg[j]; const sg = Math.max(s.len * 0.45, scale * 0.05); return { j, w: Math.exp(-segD2(px, py, pz, s.a, s.b) / (2 * sg * sg)) }; })
      .map(c => {   // 手臂区靠近躯干的一圈：胸骨权重加大，过渡到手臂骨（防止肩 / 腋下撕裂）
        if (boost && boost[i] !== 1 && c.j === idx.get(part[i][0])) c.w *= boost[i];
        if (c.j === chestJ && armMin > 0 && part[i].length === 4 && part[i][1].startsWith('uarm')) { const u = Math.min(1, Math.max(0, (Math.abs(px) - armMin) / (H * 0.1))); c.w *= 1 + 6 * (1 - u * u * (3 - 2 * u)); }
        return c; })
      .sort((a, b) => b.w - a.w).slice(0, 4);
    let sum = cand.reduce((a, c) => a + c.w, 0);
    if (sum < 1e-6) { cand.length = 1; cand[0].w = 1; sum = 1; }
    for (let k = 0; k < 4; k++) { const c = cand[k]; si[i * 4 + k] = c ? c.j : 0; sw[i * 4 + k] = c ? c.w / sum : 0; }
    err = Math.max(err, Math.abs(sw[i * 4] + sw[i * 4 + 1] + sw[i * 4 + 2] + sw[i * 4 + 3] - 1));
  }
  // 权重沿网格扩散：分区是按坐标硬切的，垂手贴腿 / 袍袖贴身的 Lux 模型在交界处是同一片连通面，
  // 硬边界两侧跟不同骨走会拉出长三角。同位置顶点先焊成一个（UV 接缝），再沿边做 Laplacian 平滑，交界变成渐变
  smoothWeights(geo, P, n, scale, bones.length, si, sw, 12);
  // Q 模板：扩散后再按分区收回（只留本分区的骨，重新归一）。Lux 四足网格背上常有连到尾部的细长三角，扩散会把颈 / 头权重
  // 沿它们带进躯干，低头时躯干顶点被颈骨抬起 → 背上拉出一整片。分区本身已含过渡骨（头区含胸、腿区含躯干骨），交界仍是渐变
  if (meta) for (let i = 0; i < n; i++) {
    const ok = part[i].map(nm => idx.get(nm)!); let s = 0;
    for (let k = 0; k < 4; k++) { if (!ok.includes(si[i * 4 + k])) sw[i * 4 + k] = 0; s += sw[i * 4 + k]; }
    if (s < 1e-6) { si[i * 4] = ok[0]; sw[i * 4] = 1; for (let k = 1; k < 4; k++) sw[i * 4 + k] = 0; } else for (let k = 0; k < 4; k++) sw[i * 4 + k] /= s;
  }
  // 连通块：Lux 模型的武器 / 法杖 / 盾常是独立的块，跨分区（手握在上、杆子垂到腿边）。
  // 非主体的小块整块刚性绑到一根骨（离手骨近 → 手骨；否则块内多数顶点的主骨），避免抬手时把武器拉成长三角
  const comps = components(geo, P, n, scale);
  let rigid = 0;
  const handIs = ['handL', 'handR'].map(nm => idx.get(nm)).filter((x): x is number => x !== undefined);
  for (const c of comps.list) {
    if (c.length > n * 0.35 || c.length < 4) continue;
    // Q 模板：跨度大的薄片（背毛 / 鬃毛条带，常只有几个顶点）不整块刚性绑——绑到一根骨会随低头 / 摆腿整片翘起；保留逐顶点权重
    if (meta) { let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const i of c) { const z = P[i * 3 + 2], y = P[i * 3 + 1]; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (Math.max(z1 - z0, y1 - y0) > scale * 0.22) continue; }
    let bone = -1;
    for (const h of handIs) { const hp = bones[h].p; if (c.some(i => Math.hypot(P[i * 3] - hp[0], P[i * 3 + 1] - hp[1], P[i * 3 + 2] - hp[2]) < scale * 0.1)) { bone = h; break; } }
    if (bone < 0) { const cnt = new Map<number, number>(); for (const i of c) cnt.set(si[i * 4], (cnt.get(si[i * 4]) ?? 0) + 1); bone = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0]; }
    for (const i of c) { si[i * 4] = bone; sw[i * 4] = 1; for (let k = 1; k < 4; k++) { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; } }
    rigid++;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const out: Built = { geo, bones, h: H, len: D, info: { tpl, bones: bones.length, verts: n, arms, weightErr: err, comps: comps.list.length, rigidComps: rigid }, meta };
  cache.set(key, out); return out;
}

/** 由静态网格生成带骨骼的 SkinnedMesh（几何体按 key 缓存）；material 原样使用 */
export function makeProcSkinned(key: string, src: THREE.BufferGeometry, tpl: RigTpl, yaw: number, mat: THREE.Material, k: number) {
  const b = build(key + '|' + tpl, src, tpl, yaw);
  const bones = b.bones.map(d => { const o = new THREE.Bone(); o.name = d.name; return o; });
  const by = new Map(bones.map(o => [o.name, o] as const));
  b.bones.forEach((d, i) => {
    const o = bones[i]; const par = d.parent ? b.bones.find(x => x.name === d.parent)! : null;
    o.position.set(d.p[0] - (par ? par.p[0] : 0), d.p[1] - (par ? par.p[1] : 0), d.p[2] - (par ? par.p[2] : 0));
    if (d.parent) by.get(d.parent)!.add(o);
  });
  const mesh = new THREE.SkinnedMesh(b.geo, mat);
  mesh.scale.setScalar(k); mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false; mesh.castShadow = true;
  // Q蟾：舌头（细长圆柱，根在下颌，平时缩成 0 隐藏，攻击时沿 +Z 弹出）
  let tongue: THREE.Mesh | null = null;
  const jaw = by.get('jaw');
  if (tpl === 'Q蟾' && jaw) {
    const tg = new THREE.CylinderGeometry(b.len * 0.012, b.len * 0.02, 1, 6, 1); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    tongue = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xc0506a, roughness: 0.35 })); tongue.visible = false; tongue.scale.set(1, 1, 1e-3);
    const je = b.bones.find(x => x.name === 'jawEnd')!, jd = b.bones.find(x => x.name === 'jaw')!;
    tongue.position.set(je.p[0] - jd.p[0], je.p[1] - jd.p[1] + b.h * 0.03, je.p[2] - jd.p[2] - b.len * 0.03); jaw.add(tongue);
  }
  return { mesh, by, h: b.h, len: b.len, info: b.info, tpl, meta: b.meta, tongue };
}
export function procRigInfo(key: string, tpl: RigTpl) { return cache.get(key + '|' + tpl)?.info ?? null; }

// ================================================================ 程序化动作
type Name = string;
interface Shot { name: Name; t: number; dur: number; hold?: boolean }
const E = new THREE.Euler(), Q = new THREE.Quaternion();
/** 动作时长（秒，标准体型；G 模板 ×1.5） */
export const PA_DUR = { windup: 0.45, strike: 0.12, recover: 0.4, hit: 0.22, death: 1.2, cast: 0.9 };

export class ProcAnim {
  private rest = new Map<THREE.Bone, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  private rot = new Map<THREE.Bone, V3>(); private off = new Map<THREE.Bone, V3>(); private scl = new Map<THREE.Bone, number>();
  private loopName: Name = 'idle'; private loopSpeed = 1;
  private shot: Shot | null = null; private hitT = 9;
  private phase = 0; private t = Math.random() * 10; private last = new THREE.Vector3(NaN, 0, 0); private move = 0;
  private G: number;
  dead = false; clock = 0; actAt = -99; lastAct: string | null = null;
  /** 最近一次 windup 开始的时刻（clock）；attack1 在 windup 之后到来时直接接出手段 */
  private windAt = -99;
  /** 每次出手帧回调（测试用：和扣血同帧比对） */
  onImpact: ((name: string) => void) | null = null;
  constructor(private r: ReturnType<typeof makeProcSkinned>, private rootObj: THREE.Object3D, private tickExtra?: (dt: number) => void) {
    for (const b of r.by.values()) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
    this.G = r.tpl === 'G鲸' ? 1.5 : 1;
  }
  get tpl() { return this.r.tpl; }
  /** 预备时长（秒）：攻击前这么久开始后摆 */
  get windup() { return PA_DUR.windup * this.G; }
  get actAge() { return this.clock - this.actAt; }
  clipName(n: string) { return 'proc:' + n; }
  setRelaxed(_v: boolean) { /* 无 */ }
  setWeaponClips(_n?: unknown) { /* 无 */ }
  loop(name: Name, speed = 1) { this.loopName = name; this.loopSpeed = speed; }
  play(name: Name, speed = 1) {
    if (this.dead && name !== 'death') return;
    const G = this.G;
    if (name === 'death') { this.dead = true; this.shot = { name, t: 0, dur: (this.r.tpl === 'G鲸' ? 3 : PA_DUR.death) }; return; }
    if (name === 'hit') { this.hitT = 0; return; }   // 受击是叠加层，不打断攻击
    this.clock = this.clock; this.actAt = this.clock; this.lastAct = name;
    if (name === 'windup') { this.windAt = this.clock; this.shot = { name, t: 0, dur: PA_DUR.windup * G / Math.max(0.2, speed), hold: true }; return; }
    if (name === 'attack1' || name === 'attack2' || name === 'attack3' || name === 'heavy' || name === 'punch' || name === 'spin') {
      // 刚播过预备（≤ 1.2 秒内）：直接从出手开始；否则完整三段但预备压缩成 0.12 秒（扣血已发生，只做一次可读的挥击）
      const fromWind = this.shot?.name === 'windup' || this.clock - this.windAt < 1.2;
      const pre = fromWind ? 0 : 0.1;
      this.shot = { name: 'atk', t: fromWind ? PA_DUR.windup * G : PA_DUR.windup * G - pre, dur: PA_DUR.windup * G + (PA_DUR.strike + PA_DUR.recover) * G };
      if (fromWind) this.onImpact?.(name);
      this.windAt = -99;
      void speed; return;
    }
    if (name === 'cast' || name === 'castLong' || name === 'shoot' || name === 'channel') { this.shot = { name: 'cast', t: 0, dur: (name === 'castLong' ? 2.2 : name === 'shoot' ? 0.6 : PA_DUR.cast) * G }; return; }
    this.shot = { name: 'cast', t: 0, dur: 0.6 };
  }
  revive() { this.dead = false; this.shot = null; this.hitT = 9; this.windAt = -99; }

  private R(b: string, x: number, y = 0, z = 0) { const o = this.r.by.get(b); if (!o) return; const v = this.rot.get(o) ?? [0, 0, 0]; v[0] += x; v[1] += y; v[2] += z; this.rot.set(o, v); }
  private S(b: string, k: number) { const o = this.r.by.get(b); if (!o) return; this.scl.set(o, (this.scl.get(o) ?? 1) * k); }
  private O(b: string, x: number, y: number, z: number) { const o = this.r.by.get(b); if (!o) return; const v = this.off.get(o) ?? [0, 0, 0]; v[0] += x; v[1] += y; v[2] += z; this.off.set(o, v); }

  update(dt: number) {
    this.clock += dt; this.t += dt; this.tickExtra?.(dt);
    const h = this.r.h;
    // 实际位移（世界）→ 步行相位（不按时间推进：不动就不迈腿，动了就一定迈腿）
    const p = this.rootObj.position;
    let dist = 0; if (!isNaN(this.last.x)) dist = Math.hypot(p.x - this.last.x, p.z - this.last.z); this.last.set(p.x, p.y, p.z);
    if (dist > 2) dist = 0;   // 传送 / 重生
    const k = this.r.mesh.scale.x, H = h * k;
    const stride = this.r.meta ? this.r.meta.cycle * k : (this.r.tpl === 'H' ? 0.75 * 0.5 * H : 0.9 * H * 0.5) * 2;   // 一个完整步行周期的位移（左右各一步；Q 模板 = 腿长 × 摆幅算出的步幅，蟾蜍 = 一跳）
    const sp = dt > 0 ? dist / dt : 0;
    this.move += ((sp > 0.15 ? 1 : 0) - this.move) * Math.min(1, dt * 8);
    this.phase = (this.phase + dist / Math.max(0.2, stride)) % 1;
    this.rot.clear(); this.off.clear(); this.scl.clear();
    if (this.shot) { this.shot.t += dt; if (this.shot.t >= this.shot.dur) { if (this.shot.hold && this.shot.t < this.shot.dur + 0.8) this.shot.t = this.shot.dur; else if (!this.dead) this.shot = null; else this.shot.t = this.shot.dur; } }
    this.hitT += dt;
    const run = this.loopName === 'run' || sp > 2.6;
    switch (this.r.tpl) {
      case 'H': case 'H袍': this.humanoid(run, h); break;
      case 'F': this.wraith(h, sp); break;
      case 'F翼': this.moth(h, sp); break;
      case 'G鲸': this.whale(h); break;
      case 'Q4': this.quad(run, h); break;
      case 'Q蟾': this.toad(h); break;
      case 'Q多足': this.multi(h); break;
    }
    // 写回：rest × 偏移
    for (const [b, r0] of this.rest) {
      const v = this.rot.get(b), o = this.off.get(b);
      b.quaternion.copy(r0.q); if (v) b.quaternion.multiply(Q.setFromEuler(E.set(v[0], v[1], v[2])));
      b.position.copy(r0.p); if (o) b.position.add(new THREE.Vector3(o[0], o[1], o[2]).divideScalar(1));
      const sc = this.scl.get(b); if (sc !== undefined || b.scale.x !== 1) b.scale.setScalar(sc ?? 1);
    }
  }

  /** 攻击三段权重：pre 0→1（预备），hit（出手 0→1），rec 收招 1→0 */
  private atk() {
    const s = this.shot; if (!s || (s.name !== 'atk' && s.name !== 'windup')) return null;
    const G = this.G, w = PA_DUR.windup * G, st = PA_DUR.strike * G, rc = PA_DUR.recover * G;
    const t = s.t;
    if (s.name === 'windup' || t < w) { const u = Math.min(1, t / (s.name === 'windup' ? s.dur : w)); return { pre: 1 - (1 - u) * (1 - u), str: 0, rec: 0 }; }
    if (t < w + st) return { pre: 1, str: (t - w) / st, rec: 0 };
    const u = Math.min(1, (t - w - st) / rc); return { pre: 1, str: 1, rec: u * u * (3 - 2 * u) };
  }
  private shotK(name: string) { const s = this.shot; if (!s || s.name !== name) return 0; const fi = Math.min(1, s.t / 0.18), fo = Math.min(1, (s.dur - s.t) / 0.25); return Math.max(0, Math.min(fi, fo)); }
  private hitK() { return this.hitT < PA_DUR.hit ? Math.sin(this.hitT / PA_DUR.hit * Math.PI) : 0; }

  private humanoid(run: boolean, h: number) {
    const robe = this.r.tpl === 'H袍', m = this.move, ph = this.phase * Math.PI * 2, t = this.t;
    // 待机呼吸 + 环顾
    const br = Math.sin(t * 2 * Math.PI / 3.2);
    this.R('chest', br * 0.025); this.R('head', 0, Math.sin(t * 0.37) * 0.18 * (1 - m), 0);
    this.R('uarmL', 0, 0, 0.06 + br * 0.015); this.R('uarmR', 0, 0, -0.06 - br * 0.015);
    // 步行 / 奔跑
    if (m > 0.01) {
      const A = run ? 1.3 : 1, s = Math.sin(ph), c = Math.cos(ph);
      if (!robe) {
        this.R('thighL', -s * 0.5 * A * m); this.R('thighR', s * 0.5 * A * m);
        this.R('shinL', Math.max(0, Math.sin(ph + Math.PI * 0.55)) * 0.75 * A * m); this.R('shinR', Math.max(0, Math.sin(ph + Math.PI * 1.55)) * 0.75 * A * m);
        this.R('footL', s * 0.2 * m); this.R('footR', -s * 0.2 * m);
      } else {
        this.R('robe1', -s * 0.1 * m); this.R('robe2', -Math.sin(ph - 0.8) * 0.12 * m); this.R('robe3', -Math.sin(ph - 1.6) * 0.14 * m);
      }
      this.R('uarmL', s * 0.32 * A * m); this.R('uarmR', -s * 0.32 * A * m); this.R('farmL', -0.15 * m); this.R('farmR', -0.15 * m);
      this.R('hips', 0, s * 0.06 * m, -c * 0.03 * m); this.R('chest', (run ? 0.14 : 0.04) * m, -s * 0.08 * m, 0);
      this.O('hips', 0, -Math.abs(c) * 0.025 * h * m + 0.012 * h * m, 0);
    }
    // 攻击：预备（武器手抬到肩后、躯干后仰后扭）→ 出手（劈下 + 重心前送）→ 收招
    const a = this.atk();
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec);
      this.R('uarmR', -0.55 * pre - 0.35 * str, 0, -0.1 * pre); this.R('farmR', -0.7 * pre + 0.15 * str);   // 手臂幅度克制：自动权重下武器 / 法杖跨区，大角度会拉出长三角
      this.R('uarmL', -0.3 * pre - 0.25 * str, 0, 0.08 * pre); this.R('farmL', -0.35 * pre);
      this.R('chest', -0.3 * pre + 0.4 * str, 0.5 * pre - 0.4 * str, 0); this.R('spine', -0.12 * pre + 0.16 * str, 0.15 * pre - 0.1 * str, 0);
      this.R('head', 0.1 * pre - 0.1 * str);
      if (!robe) { this.R('thighR', 0.25 * pre - 0.1 * str); this.R('shinR', 0.35 * pre); this.R('thighL', -0.2 * str); this.R('shinL', 0.2 * str); }
      this.O('hips', 0, -0.03 * h * pre - 0.02 * h * str, -0.04 * h * pre + 0.07 * h * str);
    }
    const c = this.shotK('cast');
    if (c) { this.R('uarmL', -0.4 * c, 0, -0.08 * c); this.R('uarmR', -0.4 * c, 0, 0.08 * c); this.R('farmL', -0.55 * c); this.R('farmR', -0.55 * c); this.R('chest', -0.12 * c); this.R('head', -0.15 * c); }
    const hk = this.hitK(); if (hk) { this.R('chest', -0.2 * hk); this.R('head', -0.25 * hk); this.R('spine', -0.08 * hk); }
    // 死亡：膝软 → 跪 → 前扑倒地（整根骨架绕脚下转，不是刚体侧翻）
    const d = this.shot?.name === 'death' ? Math.min(1, this.shot.t / this.shot.dur) : 0;
    if (d) {
      const kn = Math.min(1, d / 0.45), fall = Math.max(0, (d - 0.35) / 0.65), f2 = fall * fall;
      if (!robe) { this.R('thighL', -0.9 * kn); this.R('thighR', -0.7 * kn); this.R('shinL', 1.6 * kn); this.R('shinR', 1.4 * kn); }
      else { this.R('robe1', 0.3 * kn); this.R('robe2', 0.3 * kn); }
      this.O('hips', 0, -0.26 * h * kn, 0);
      this.R('chest', 0.35 * kn); this.R('head', 0.3 * kn); this.R('uarmL', -0.5 * kn, 0, 0.4 * kn); this.R('uarmR', -0.4 * kn, 0, -0.5 * kn);
      this.R('root', 1.35 * f2); this.O('root', 0, 0.02 * h * Math.sin(Math.min(1, (d - 0.9) / 0.1 * Math.PI)) * (d > 0.9 ? 1 : 0), 0);
    }
  }

  private wraith(h: number, sp: number) {
    const t = this.t, m = this.move;
    this.O('root', 0, Math.sin(t * 2 * Math.PI / 2.4) * 0.04 * h + 0.03 * h, 0);
    this.R('hips', 0.18 * m); this.R('chest', 0.06 * m + Math.sin(t * 1.3) * 0.03);
    // 拖尾链滞后摆动（越往下越大）
    this.R('robe1', -0.2 * m + Math.sin(t * 2.2) * 0.06); this.R('robe2', -0.25 * m + Math.sin(t * 2.2 - 0.9) * 0.09, Math.sin(t * 1.7) * 0.05); this.R('robe3', -0.3 * m + Math.sin(t * 2.2 - 1.8) * 0.12, Math.sin(t * 1.7 - 0.8) * 0.08);
    this.R('uarmL', Math.sin(t * 1.9) * 0.08 + 0.2 * m, 0, 0.15); this.R('uarmR', Math.sin(t * 1.9 + 1) * 0.08 + 0.2 * m, 0, -0.15);
    const a = this.atk();
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec);
      this.R('chest', -0.3 * pre + 0.45 * str); this.R('head', -0.15 * pre + 0.2 * str);
      this.R('uarmL', -0.3 * pre - 0.9 * str, 0, 0.55 * pre); this.R('uarmR', -0.3 * pre - 0.9 * str, 0, -0.55 * pre);
      this.R('robe1', 0.25 * pre - 0.3 * str); this.R('robe2', 0.25 * pre - 0.35 * str);
      this.O('root', 0, 0.05 * h * pre, -0.08 * h * pre + 0.3 * h * str);
    }
    const c = this.shotK('cast'); if (c) { this.R('uarmL', -0.8 * c, 0, 0.35 * c); this.R('uarmR', -0.8 * c, 0, -0.35 * c); this.R('farmL', -0.5 * c); this.R('farmR', -0.5 * c); this.R('chest', -0.15 * c); }
    const hk = this.hitK(); if (hk) { this.R('chest', -0.25 * hk); this.R('head', -0.2 * hk, (Math.random() - 0.5) * 0.2 * hk); this.O('root', 0, 0, -0.05 * h * hk); }
    const d = this.shot?.name === 'death' ? Math.min(1, this.shot.t / this.shot.dur) : 0;
    if (d) { this.R('chest', 0.7 * d); this.R('head', 0.5 * d); this.R('uarmL', 0.6 * d, 0, -0.3 * d); this.R('uarmR', 0.6 * d, 0, 0.3 * d); this.O('root', 0, -0.25 * h * d * d, 0); this.R('robe1', 0.4 * d); }
    void sp;
  }

  private moth(h: number, sp: number) {
    const t = this.t, m = this.move;
    const flap = Math.sin(t * 2 * Math.PI * (9 + 3 * m));
    this.R('wingL', 0, 0, flap * 0.55 + 0.1); this.R('wingR', 0, 0, -flap * 0.55 - 0.1);
    this.R('wingLt', 0, 0, Math.sin(t * 2 * Math.PI * (9 + 3 * m) - 0.6) * 0.3); this.R('wingRt', 0, 0, -Math.sin(t * 2 * Math.PI * (9 + 3 * m) - 0.6) * 0.3);
    this.O('root', 0, Math.sin(t * 2 * Math.PI / 1.6) * 0.06 * h + Math.abs(flap) * 0.015 * h, 0);
    this.R('root', 0.12 * m, 0, 0); this.R('b1', Math.sin(t * 3) * 0.08); this.R('b2', Math.sin(t * 3 - 0.7) * 0.1);
    const a = this.atk();
    if (a) { const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec); this.R('root', -0.35 * pre + 0.3 * str); this.R('b1', 0.4 * pre - 0.3 * str); this.R('b2', 0.3 * pre); this.O('root', 0, 0.1 * h * pre, -0.1 * h * pre + 0.25 * h * str); }
    const c = this.shotK('cast'); if (c) { this.R('root', -0.3 * c); this.R('b1', 0.35 * c); }
    const hk = this.hitK(); if (hk) this.R('root', 0, 0, (Math.random() - 0.5) * 0.3 * hk);
    const d = this.shot?.name === 'death' ? Math.min(1, this.shot.t / this.shot.dur) : 0;
    if (d) { this.R('wingL', 0, 0, -0.9 * d - flap * 0.55 * d); this.R('wingR', 0, 0, 0.9 * d + flap * 0.55 * d); this.R('root', 0.5 * d, 0, 0.7 * d); this.O('root', 0, -0.45 * h * d * d, 0); }
    void sp;
  }

  private whale(h: number) {
    const t = this.t, m = this.move;
    const dead = this.shot?.name === 'death' ? Math.min(1, this.shot.t / this.shot.dur) : 0;
    const live = 1 - dead;
    // 脊柱上下行波：头 2% → 尾 12%，周期 3 秒（移动时 2.2 秒）；鲸是上下拍尾
    const w = 2 * Math.PI / (3 - 0.8 * m);
    for (let i = 1; i <= 4; i++) this.R('b' + i, (0.03 + 0.05 * i) * Math.sin(t * w - i * 0.7) * live);
    this.R('f1', 0.02 * Math.sin(t * w + 0.7) * live); this.R('f2', 0.03 * Math.sin(t * w + 1.2) * live);
    this.O('root', 0, Math.sin(t * w - 0.3) * 0.02 * h * live, 0);
    // 巨尾拍岸：预备 = 身体侧弯 + 尾鳍高抬停顿 → 出手拍下 → 收招回正
    const a = this.atk();
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec);
      this.R('root', 0, 0.25 * pre - 0.15 * str, 0);
      for (let i = 1; i <= 4; i++) this.R('b' + i, (0.12 + 0.08 * i) * pre - (0.1 + 0.06 * i) * str, 0.12 * pre, 0);
      this.R('f1', 0.12 * pre - 0.1 * str); this.R('f2', 0.15 * pre - 0.12 * str);
      this.O('root', 0, 0.06 * h * pre - 0.04 * h * str, 0);
    }
    const c = this.shotK('cast'); if (c) { this.R('f1', -0.15 * c); this.R('f2', -0.2 * c); for (let i = 1; i <= 4; i++) this.R('b' + i, 0.08 * c * Math.sin(t * 6 - i)); }
    const hk = this.hitK(); if (hk) this.R('b2', 0.05 * hk);
    // 死亡：行波停 → 缓慢侧倾 ≤ 30° → 下沉（禁止 90° 侧翻）
    if (dead) { this.R('root', 0, 0, 0.5 * dead); this.O('root', 0, -0.35 * h * dead * dead, 0); }
  }
  // ---------------------------------------------------------------- 11-19 四足 / 蟾蜍 / 多足
  private deathK() { return this.shot?.name === 'death' ? Math.min(1, this.shot.t / this.shot.dur) : 0; }
  private sstep(a: number, b: number, x: number) { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); }

  /** Q4：对角步（左前 + 右后同相）；扑咬 = 后坐蓄力 → 前冲低头张嘴 → 咬合甩头；heavy = 低头冲撞；hit 后缩；death 腿软 → 侧倒 */
  private quad(run: boolean, h: number) {
    const M = this.r.meta!, m = this.move, t = this.t, L = M.bodyLen, d = this.deathK(), live = 1 - Math.min(1, d * 3);
    const br = Math.sin(t * 2 * Math.PI / 2.6);
    this.R('spine', br * 0.02 * live); this.R('chest', -br * 0.015 * live);
    this.R('head', 0, Math.sin(t * 0.41) * 0.22 * (1 - m) * live, 0); this.R('neck', Math.sin(t * 0.23) * 0.05 * (1 - m) * live);
    const wag = (1 + m * 0.6) * live; this.R('tail1', 0.05 * m, Math.sin(t * 1.9) * 0.22 * wag); this.R('tail2', 0, Math.sin(t * 1.9 - 0.8) * 0.3 * wag);
    if (m > 0.01 && live > 0) {
      const amp = run ? 0.55 : 0.38, ph = this.phase * Math.PI * 2;
      for (const l of M.legs) {
        const f = ph + (l.group ? Math.PI : 0) + (run && !l.front ? 0.4 : 0), sw = Math.cos(f), lift = Math.max(0, -Math.sin(f)) * m;
        this.R(l.a, -amp * sw * m);
        if (l.front) { this.R(l.b, 0.8 * lift); this.R(l.c, 0.5 * lift); } else { this.R(l.b, 0.6 * lift); this.R(l.c, -0.5 * lift); }
      }
      this.R('hips', 0, Math.sin(ph) * 0.05 * m, Math.sin(ph) * 0.035 * m); this.R('chest', 0, -Math.sin(ph) * 0.06 * m, -Math.sin(ph) * 0.035 * m);
      this.R('head', Math.sin(ph * 2) * 0.04 * m);
      if (run) { this.R('spine', Math.sin(ph) * 0.07 * m); this.R('neck', 0.12 * m); }
    }
    const a = this.atk();
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec), heavy = this.lastAct === 'heavy';
      this.O('root', 0, -0.05 * h * pre, -0.07 * L * pre + (heavy ? 0.38 : 0.24) * L * str);
      for (const l of M.legs) { this.R(l.a, (l.front ? -0.25 : 0.2) * pre + (l.front ? -0.3 : 0.35) * str); this.R(l.b, (l.front ? 0.2 : -0.3) * pre); }
      if (heavy) {   // 冲撞：头颈压低前顶
        this.R('neck', 0.15 * pre + 0.45 * str); this.R('head', 0.1 * pre + 0.3 * str); this.R('chest', 0.06 * pre + 0.1 * str);
      } else {       // 扑咬：头先抬再低，下颌张开 → 咬合，收招甩头
        this.R('neck', -0.25 * pre + 0.35 * str); this.R('head', -0.1 * pre + 0.25 * str); this.R('chest', -0.05 * pre + 0.08 * str);
        this.R('jaw', 0.15 * pre * (1 - a.str) + (a.str < 1 ? 0.6 * a.str : 0.6 * (1 - Math.min(1, a.rec * 4))));
        const sh = a.str >= 1 ? Math.sin(a.rec * Math.PI * 3) * (1 - a.rec) : 0; this.R('head', 0, sh * 0.3, sh * 0.35); this.R('neck', 0, sh * 0.15, 0);
      }
    }
    const hk = this.hitK(); if (hk) { this.R('chest', -0.15 * hk); this.R('neck', -0.25 * hk); this.R('jaw', 0.2 * hk); this.O('root', 0, 0, -0.06 * L * hk); }
    if (d) {   // 腿软下沉 → 侧倒（绕 Z 滚 ~83°，抬高半个身宽免得插地）
      const kn = this.sstep(0, 0.35, d), roll = 1.45 * this.sstep(0.2, 0.75, d);
      for (const l of M.legs) { this.R(l.a, (l.front ? -0.35 : 0.35) * kn); this.R(l.b, (l.front ? 0.5 : -0.4) * kn * (1 - roll / 1.45 * 0.6)); }
      this.O('root', 0, -0.18 * M.legLen * kn * (1 - roll / 1.45) + M.halfW * 0.75 * Math.sin(roll), 0); this.R('root', 0, 0, roll);
      this.R('neck', 0.25 * kn); this.R('head', 0.15 * kn); this.R('jaw', 0.25 * this.sstep(0.5, 1, d)); this.R('tail1', 0.3 * kn);
    }
  }

  /** Q蟾：蹲跳步（一个周期一跳，后腿蹬地、前腿落地）；舌击 / 扑击；heavy = 跳起砸地；idle 鼓腹 */
  private toad(h: number) {
    const M = this.r.meta!, m = this.move, t = this.t, L = M.bodyLen, d = this.deathK(), live = 1 - Math.min(1, d * 3);
    const puff = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI / 1.8)), 2) * live;
    this.S('belly', 1 + 0.14 * puff * (1 - m)); this.R('chest', -0.03 * puff); this.R('head', 0, Math.sin(t * 0.3) * 0.12 * (1 - m) * live, 0);
    if (m > 0.01 && live > 0) {
      const u = this.phase, air = u > 0.15 && u < 0.75 ? Math.sin(Math.PI * (u - 0.15) / 0.6) : 0, push = u < 0.3 ? Math.sin(Math.PI * u / 0.3) : 0, land = u > 0.7 ? Math.sin(Math.PI * (u - 0.7) / 0.3) : 0;
      this.O('root', 0, air * 0.22 * h * m, 0); this.R('root', (-0.18 * push + 0.12 * land) * m);
      for (const l of M.legs) {
        if (l.front) { this.R(l.a, (-0.4 * air + 0.15 * land) * m); this.R(l.b, 0.3 * air * m); }
        else { this.R(l.a, (0.5 * push + 0.6 * air) * m); this.R(l.b, (-0.5 * push - 0.3 * air) * m); this.R(l.c, (0.4 * air) * m); }
      }
    }
    const a = this.atk(); let tongue = 0;
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec);
      if (this.lastAct === 'heavy') {   // 跳起砸地：预备蹲低 → 出手腾空落下（出手帧 = 落地）
        this.O('root', 0, -0.06 * h * pre + Math.sin(Math.PI * Math.min(1, a.str)) * 0.35 * h * (1 - a.rec), 0.2 * L * str);
        for (const l of M.legs) { if (l.front) this.R(l.a, -0.3 * str); else { this.R(l.a, -0.3 * pre + 0.6 * str); this.R(l.b, 0.4 * pre - 0.5 * str); } }
        this.S('belly', 1 + 0.12 * str);
      } else {   // 舌击：头抬、身子前探，下颌张开吐舌
        this.O('root', 0, -0.04 * h * pre + 0.05 * h * str, -0.05 * L * pre + 0.18 * L * str);
        this.R('root', 0.06 * pre - 0.12 * str); this.R('neck', -0.12 * pre - 0.08 * str); this.R('jaw', 0.1 * pre + 0.55 * str);
        for (const l of M.legs) if (!l.front) { this.R(l.a, -0.2 * pre + 0.4 * str); this.R(l.b, 0.3 * pre - 0.3 * str); }
        tongue = a.str < 1 ? a.str : 1 - this.sstep(0, 0.6, a.rec);
      }
    }
    const tg = this.r.tongue; if (tg) { tg.visible = tongue > 0.02; tg.scale.z = Math.max(1e-3, tongue * L * 1.1); }
    const hk = this.hitK(); if (hk) { this.R('root', -0.12 * hk); this.R('neck', -0.15 * hk); this.O('root', 0, 0, -0.05 * L * hk); this.S('belly', 1 - 0.08 * hk); }
    if (d) {   // 瘪下去 → 侧翻
      const kn = this.sstep(0, 0.3, d), roll = 1.5 * this.sstep(0.25, 0.8, d);
      this.S('belly', 1 - 0.15 * kn); for (const l of M.legs) this.R(l.a, (l.front ? -0.4 : 0.6) * kn);
      this.O('root', 0, -0.1 * h * kn * (1 - roll / 1.5) + M.halfW * 0.7 * Math.sin(roll), 0); this.R('root', 0, 0, roll); this.R('jaw', 0.3 * kn);
    }
  }

  /** Q多足：交替三角步（隔腿同相）；蝎 = 螯钳夹击 / heavy 尾刺；蜘蛛 = 前腿高举扑咬；甲虫 = 低头顶撞；death 腿蜷缩、身体落地 */
  private multi(h: number) {
    const M = this.r.meta!, m = this.move, t = this.t, L = M.bodyLen, d = this.deathK(), live = 1 - Math.min(1, d * 3);
    const legLift = (l: QLeg, th: number) => this.R(l.a, -l.dir[1] * th, 0, l.dir[0] * th);   // 绕「腿方向 × 竖直」转：+ = 抬腿
    const legFwd = (l: QLeg, th: number) => this.R(l.a, 0, -l.side * th, 0);                     // + = 腿往前摆
    this.R('thorax', Math.sin(t * 2 * Math.PI / 2.2) * 0.015 * live); this.R('abdomen', Math.sin(t * 1.7) * 0.04 * live, Math.sin(t * 0.9) * 0.03 * live);
    M.legs.forEach((l, k) => legFwd(l, Math.sin(t * 1.3 + k * 1.7) * 0.03 * (1 - m) * live));
    for (let s = 1; s <= M.tail; s++) this.R('tail' + s, Math.sin(t * 1.6 - s * 0.5) * 0.04 * live);
    if (m > 0.01 && live > 0) {
      const ph = this.phase * Math.PI * 2, amp = 0.3;
      for (const l of M.legs) { const f = ph + (l.group ? Math.PI : 0); legFwd(l, amp * Math.cos(f) * m); legLift(l, 0.35 * Math.max(0, -Math.sin(f)) * m); }
      this.O('thorax', 0, Math.abs(Math.sin(ph * 2)) * 0.01 * h * m, 0); this.R('thorax', 0, Math.sin(ph) * 0.04 * m, 0);
    }
    const a = this.atk();
    if (a) {
      const pre = a.pre * (1 - a.str), str = a.str * (1 - a.rec), heavy = this.lastAct === 'heavy' || this.lastAct === 'attack2';
      if (M.claws || M.tail) {
        if (heavy && M.tail) {   // 尾刺：尾巴后拉蓄力 → 越过头顶前刺
          for (let s = 1; s <= M.tail; s++) this.R('tail' + s, -0.12 * pre + 0.24 * str);
          this.R('thorax', -0.08 * pre + 0.1 * str); this.O('root', 0, 0, -0.04 * L * pre + 0.1 * L * str);
        } else {                  // 螯钳：张开上抬 → 前夹
          for (const s of [1, -1]) { const nm = s > 0 ? 'L' : 'R'; this.R('claw' + nm, -0.25 * pre + 0.2 * str, s * (0.35 * pre - 0.3 * str), 0); this.R('clawm' + nm, 0, s * (0.2 * pre - 0.25 * str), 0); this.R('clawt' + nm, 0, s * (0.25 * pre - 0.3 * str), 0); }
          this.O('root', 0, 0, -0.03 * L * pre + 0.15 * L * str); for (let s = 1; s <= M.tail; s++) this.R('tail' + s, 0.04 * str);
        }
      } else if (M.legs.length >= 7) {   // 蜘蛛：前身立起、前腿高举 → 扑下咬
        this.R('thorax', -0.3 * pre + 0.15 * str); this.R('head', 0.25 * str); this.O('root', 0, 0, -0.06 * L * pre + 0.28 * L * str);
        for (const l of M.legs) if (l.front) legLift(l, 0.8 * pre - 0.2 * str);
      } else {                           // 甲虫：低头顶撞（heavy 更远更狠）
        const k = heavy ? 1.4 : 1;
        this.R('thorax', -0.12 * pre + 0.15 * str * k); this.R('head', -0.15 * pre + 0.4 * str * k); this.O('root', 0, 0, -0.07 * L * pre + 0.26 * L * str * k);
      }
    }
    const hk = this.hitK(); if (hk) { this.R('thorax', -0.12 * hk); this.O('root', 0, 0, -0.04 * L * hk); }
    if (d) {   // 腿往身下蜷 → 身体落地，略侧倾
      const kn = this.sstep(0, 0.6, d);
      for (const l of M.legs) { legLift(l, 0.9 * kn); this.R(l.b, l.dir[1] * 1.2 * kn, 0, -l.dir[0] * 1.2 * kn); }
      this.O('root', 0, -M.legLen * 0.7 * kn, 0); this.R('root', 0, 0, 0.22 * this.sstep(0.3, 1, d));
      for (let s = 1; s <= M.tail; s++) this.R('tail' + s, 0.18 * kn);
      for (const nm of ['L', 'R']) this.R('claw' + nm, 0.3 * kn);
    }
  }
}

/** 首领地面预警：有程序化动作的怪把预警期当作攻击预备（后摆 → 停顿），返回 true；否则调用方照旧播施法片段 */
export function animTelegraph(anim: unknown, dur: number): boolean {
  if (!(anim instanceof ProcAnim)) return false;
  anim.play('windup', (PA_DUR.windup * (anim.tpl === 'G鲸' ? 1.5 : 1)) / Math.max(0.3, dur * 0.7)); return true;
}
/** 预警结算：出手帧 */
export function animTelegraphHit(anim: unknown) { if (anim instanceof ProcAnim) anim.play('heavy'); }
