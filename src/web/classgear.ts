// 阶段七 v0.7.2-br.A：新职业装备 / 任务的查询小工具（chrono.ts、alchemy.ts 读取橙装、暗金、套装件数、职业任务奖励）
import type { Ctx } from './main';
import { ANC, ancChance, ancCount, ancEvery } from '../core/Ancient';

let CX!: Ctx;
const eq = () => CX?.inventory?.equippedItems() ?? [];
/** 身上有这件传说（橙装）特效 */
export const hasLg = (id: string) => eq().some(i => i.lgId === id);
/** v0.9.6b 太古倍率（代码型橙装 / 暗金钩子）：id = 传说 id 或暗金 fixedId */
export const isAnc = (id: string) => eq().some(i => i.ancient && (i.lgId === id || (i.quality === 'dark' && i.fixedId === id)));
/** 数值 ×2 */
export const ax = (id: string, v: number) => isAnc(id) ? v * ANC.mul : v;
/** 几率 ×2，封顶 60%（reset = 重置冷却类封顶 50%） */
export const ap = (id: string, p: number, reset = false) => isAnc(id) ? ancChance(p, reset) : p;
/** 持续时间 ×1.5 */
export const ad = (id: string, d: number) => isAnc(id) ? d * ANC.dur : d;
/** 数量 +100% 向下取整 */
export const an = (id: string, n: number) => isAnc(id) ? ancCount(n) : n;
/** 「每第 N 次」→ N-1（最少 2） */
export const aev = (id: string, n: number) => isAnc(id) ? ancEvery(n) : n;
/** 身上有这件暗金的效果（暗金本体，或拓印到别的装备上） */
export const hasDark = (id: string) => eq().some(i => (i.quality === 'dark' && i.fixedId === id) || i.engraveId === id);
/** 套装件数 */
export const setN = (setId: string) => CX?.inventory?.setCounts().get(setId) ?? 0;
/** 职业任务已完成（奖励效果永久生效） */
export const questDone = (id: string) => !!CX?.quests && CX.quests.state(id, CX.progression.level) === 'done';

export function bindClassGear(__ctx: Ctx) { CX = __ctx; }
