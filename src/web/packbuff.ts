// v1.2.37c 内容包限时增益（PackCtx.buff）：伤害 / 急速 / 移速，按 key 覆盖刷新；到期由 main.ts 每帧 packBuffTick 检查并重算角色属性
export interface PackBuff { key: string; name: string; dmg: number; haste: number; speed: number; left: number }
const B = new Map<string, PackBuff>();
export function packBuffAdd(o: { key: string; name?: string; dmg?: number; haste?: number; speed?: number; dur: number }) {
  B.set(o.key, { key: o.key, name: o.name ?? o.key, dmg: Math.max(0, o.dmg ?? 0), haste: Math.max(0, o.haste ?? 0), speed: Math.max(0, o.speed ?? 0), left: Math.max(0, o.dur) });
}
/** 返回是否有增益到期（需要重算属性） */
export function packBuffTick(dt: number): boolean {
  let gone = false;
  for (const [k, b] of B) { b.left -= dt; if (b.left <= 0) { B.delete(k); gone = true; } }
  return gone;
}
export function packBuffTotals() { let dmg = 0, haste = 0, speed = 0; for (const b of B.values()) { dmg += b.dmg; haste += b.haste; speed += b.speed; } return { dmg, haste, speed }; }
export const packBuffList = () => [...B.values()].map(b => ({ ...b }));
export const packBuffClear = () => { const had = B.size > 0; B.clear(); return had; };
