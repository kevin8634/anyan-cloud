// ======================================================================
// v1.2.37e 写实光效升级（程序化，不花 Aholo 积分）
//   武器发光：按品质定强度（稀有 微光 → 史诗 呼吸光 + 少量光点 → 传说 / 暗金 持续光 + 沿刃升腾的光焰），
//             按元素定颜色（火焰 橙红 / 冰霜 冰蓝 / 暗影 紫色恐惧 / 自然 绿色毒液 / 神圣 金 / 奥术 紫红；内容包物品 幽影绿）
//   肩部特效：肩甲史诗以上，两肩各一团同色升腾光焰（传说更浓）
// 只用加色混合的点精灵：经典 / 写实 / 比赛版模型通用，不改模型材质，换装时随 gear.ts 的 fx.objs 一起拆掉
// ======================================================================
import * as THREE from 'three';
import type { ItemInstance } from '../core/Loot';

export type GlowElem = 'fire' | 'frost' | 'shadow' | 'nature' | 'holy' | 'arcane' | 'phys' | 'pack';
export const GLOW_COLOR: Record<GlowElem, number> = {
  fire: 0xff6a1e, frost: 0x8fdcff, shadow: 0x9a4aff, nature: 0x5aff4a, holy: 0xffdc7a, arcane: 0xd06aff, phys: 0xffc070, pack: 0x3affb4,
};
const KW: [GlowElem, RegExp][] = [
  ['fire', /火|焰|燃|灼|熔|炎|烬/], ['frost', /冰|霜|寒|冻|雪/], ['nature', /毒|自然|腐|蚀|藤|沼/],
  ['shadow', /暗影|恐惧|虚空|渊|魂|影/], ['holy', /神圣|圣|光辉|晨/], ['arcane', /奥术|秘法|星|时砂|时痕/],
];
/** 物品的发光元素：内容包物品 = 幽影绿；否则看名字 / 词条 / 传说特效描述里的元素字样，都没有 = 品质暖光 */
export function glowElem(it: ItemInstance | undefined): GlowElem {
  if (!it) return 'phys';
  if (it.pack) return 'pack';
  const txt = [it.name, ...(it.lines ?? [])].join(' ');
  for (const [e, re] of KW) if (re.test(txt)) return e;
  return 'phys';
}
/** 品质 → 强度档：0 无 / 1 稀有 / 2 史诗 / 3 传说 / 4 暗金 */
export function glowLevel(it: ItemInstance | undefined): number {
  const q = it?.quality as string | undefined;
  return q === 'dark' ? 4 : q === 'orange' ? 3 : q === 'purple' ? 2 : q === 'blue' ? 1 : 0;
}

interface Flame { pts: THREE.Points; seed: Float32Array; base: Float32Array; len: number; rise: number; mode: 'blade' | 'shoulder'; lv: number; ax: number }

function spriteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');   // 没有 2D 画布（测试环境）时退回空白贴图
  if (g) {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  }
  const t = new THREE.CanvasTexture(c); return t;
}
let _tex: THREE.Texture | null = null;
const tex = () => (_tex ??= typeof document !== 'undefined' ? spriteTex() : null);
/** v1.2.50 圆形柔光点贴图（强化光点 / 套装光环共用） */
export const glowSprite = tex;

function makePoints(n: number, color: number, size: number, opacity: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(0.9), size, map: tex(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
  m.userData.outlineParameters = { visible: false };
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 3; p.name = 'gearglow';
  return p;
}

/** 武器光焰：挂在武器网格上（局部坐标沿网格最长轴分布，从握柄 25% 到刃尖） */
export function weaponGlow(w: THREE.Mesh, it: ItemInstance | undefined): THREE.Points | null {
  const lv = glowLevel(it); if (!lv || !w.geometry) return null;
  w.geometry.computeBoundingBox(); const bb = w.geometry.boundingBox!; const sz = bb.getSize(new THREE.Vector3());
  const ax = sz.x >= sz.y && sz.x >= sz.z ? 0 : sz.z > sz.y ? 2 : 1;
  const tip = Math.abs(bb.max.getComponent(ax)) >= Math.abs(bb.min.getComponent(ax)) ? bb.max.getComponent(ax) : bb.min.getComponent(ax);
  const n = [0, 10, 18, 30, 36][lv];
  const p = makePoints(n, GLOW_COLOR[glowElem(it)], [0, 0.08, 0.11, 0.14, 0.15][lv], [0, 0.45, 0.6, 0.8, 0.85][lv]);
  const seed = new Float32Array(n), base = new Float32Array(n * 3);
  const thick = Math.max(sz.getComponent((ax + 1) % 3), sz.getComponent((ax + 2) % 3)) * 0.5;
  for (let i = 0; i < n; i++) {
    seed[i] = Math.random(); const k = 0.25 + 0.75 * Math.random();
    const v = new THREE.Vector3(); v.setComponent(ax, tip * k);
    v.setComponent((ax + 1) % 3, (Math.random() - 0.5) * thick); v.setComponent((ax + 2) % 3, (Math.random() - 0.5) * thick);
    base.set([v.x, v.y, v.z], i * 3);
  }
  const f: Flame = { pts: p, seed, base, len: Math.abs(tip), rise: thick * 2.2 + Math.abs(tip) * 0.06, mode: 'blade', lv, ax };
  p.userData.flame = f; tick(f, 0);
  w.add(p);
  return p;
}

/** 肩部光焰：一个点精灵挂在角色根节点上，每帧按左右肩骨骼的世界位置摆放（经典 / 写实骨架通用，向上飘不受骨骼朝向影响） */
export function shoulderGlow(it: ItemInstance | undefined, body: THREE.Object3D): THREE.Points | null {
  const lv = glowLevel(it); if (lv < 2) return null;
  const bones: THREE.Object3D[] = [];
  for (const side of ['l', 'r']) {
    const sideRe = side === 'l' ? /(\.l$|_l$|left|_l_)/ : /(\.r$|_r$|right|_r_)/;
    let hit: THREE.Object3D | null = null;
    for (const re of [/upper_?arm/, /shoulder/, /clavicle/]) {   // 上臂根（肩头）优先，锁骨太靠脖子
      body.traverse(o => { if (hit || (o as THREE.Mesh).isMesh) return; const n = o.name.toLowerCase(); if (re.test(n) && sideRe.test(n)) hit = o; });
      if (hit) break;
    }
    if (hit) bones.push(hit);
  }
  if (bones.length < 2) return null;
  const n = lv >= 3 ? 44 : 26;
  const p = makePoints(n, GLOW_COLOR[glowElem(it)], lv >= 3 ? 0.08 : 0.065, lv >= 3 ? 0.7 : 0.55);   // v1.2.50 缩小 + 降亮（泛光下原来是一团白球）
  const seed = new Float32Array(n), base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i] = Math.random(); base.set([(Math.random() - 0.5) * 0.16, Math.random() * 0.05, (Math.random() - 0.5) * 0.16], i * 3); }
  const f: Flame = { pts: p, seed, base, len: 0, rise: lv >= 3 ? 0.45 : 0.32, mode: 'shoulder', lv, ax: 1 };
  p.userData.flame = f; p.userData.bones = bones;
  return p;
}

/** 每帧：每个光点从基点往「上」飘、缩小淡出再循环（武器光焰在武器局部空间里沿横向微微外扩、上飘） */
export function tick(f: Flame, t: number) {
  const pos = f.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const sp: THREE.Vector3[] = [];
  if (f.mode === 'shoulder') { const par = f.pts.parent; if (!par) return; par.updateMatrixWorld(); for (const b of f.pts.userData.bones as THREE.Object3D[]) sp.push(par.worldToLocal(b.getWorldPosition(new THREE.Vector3()))); }
  for (let i = 0; i < n; i++) {
    const s = f.seed[i], ph = (s * 5 + t * (0.7 + s * 0.6)) % 1;
    const bx = f.base[i * 3], by = f.base[i * 3 + 1], bz = f.base[i * 3 + 2];
    if (f.mode === 'shoulder') {
      const bp = sp[i % 2]; const sw = Math.sin(t * 3 + s * 20) * 0.04 * (1 - ph);
      pos.setXYZ(i, bp.x + bx * (1 - ph * 0.4) + sw, bp.y + 0.06 + by + ph * f.rise, bp.z + bz * (1 - ph * 0.4) + Math.cos(t * 2.5 + s * 13) * 0.03);
    } else {
      // 刃上光点：沿刃轴微微游走，横向一呼一吸地向外散开再收回
      const a1 = (f.ax + 1) % 3, a2 = (f.ax + 2) % 3, out = 1 + ph * 1.4;
      const v = [bx, by, bz];
      v[a1] *= out; v[a2] *= out; v[f.ax] += Math.sin(t * 2 + s * 17) * f.len * 0.03;
      pos.setXYZ(i, v[0], v[1], v[2]);
    }
  }
  pos.needsUpdate = true;
  const m = f.pts.material as THREE.PointsMaterial;
  const base = [0, 0.45, 0.6, 0.8, 0.85][f.lv] * (f.mode === 'shoulder' ? 0.9 : 1);
  m.opacity = base * (0.75 + 0.25 * Math.sin(t * (f.lv >= 3 ? 2.2 : 1.4)));
}
export function tickGlow(p: THREE.Points, t: number) { const f = p.userData.flame as Flame | undefined; if (f) tick(f, t); }
