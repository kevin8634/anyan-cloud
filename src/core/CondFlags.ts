// ========== v1.2.35：可控触发状态（替代「生命低于 X%」类条件） ==========
// 表现层（web/trigfx.ts、内容包）写入计时状态 / 层数 / 实时读数，SkillResolver 的 flag / stacks 条件读取。
// 引擎无关：时间一律用调用方传入的 now（与 CastContext.now 同一时钟）。

type Stack = { n: number; until: number };
const timed = new Map<string, number>();
const stacks = new Map<string, Stack>();
const providers = new Map<string, () => number>();

export const CondFlags = {
  /** 计时状态：持续到 until */
  setTimed(key: string, until: number) { timed.set(key, Math.max(timed.get(key) ?? 0, until)); },
  /** 叠层：+n（上限 max），until = 层数整体过期时间（不填不过期），每次叠层刷新 */
  addStack(key: string, n: number, max: number, until = Infinity, now = -Infinity) {
    const s = stacks.get(key);
    const cur = s && s.until > now ? s.n : 0;   // 已过期的层数从 0 重新叠
    stacks.set(key, { n: Math.min(max, cur + n), until });
  },
  /** 实时读数（护盾存在、身边敌人数、魂数…） */
  provide(key: string, fn: () => number) { providers.set(key, fn); },
  unprovide(key: string) { providers.delete(key); },
  get(key: string, now: number): number {
    const p = providers.get(key);
    if (p) { try { return p() || 0; } catch { return 0; } }
    const t = timed.get(key);
    if (t !== undefined) return t > now ? 1 : 0;
    const s = stacks.get(key);
    return s && s.until > now ? s.n : 0;
  },
  /** 剩余秒数（计时状态 / 会过期的层数；读数与不过期的层数返回 undefined） */
  left(key: string, now: number): number | undefined {
    const t = timed.get(key); if (t !== undefined) return t > now ? t - now : 0;
    const s = stacks.get(key); if (s && s.until !== Infinity) return Math.max(0, s.until - now);
    return undefined;
  },
  /** 命中叠层规则（内容包也能登记）：技能命中时按规则叠层，perTarget = 每命中 1 个敌人叠 1 层 */
  hitRules: [] as { key: string; skillIds?: string[]; slots?: string[]; perTarget?: boolean; max: number; dur?: number }[],
  consume(key: string) { timed.delete(key); stacks.delete(key); },
  /** 换区域 / 读档 / 测试：清空计时与层数（读数保留） */
  reset() { timed.clear(); stacks.clear(); },
  debug(now: number) { const o: Record<string, number> = {}; for (const k of [...timed.keys(), ...stacks.keys(), ...providers.keys()]) o[k] = CondFlags.get(k, now); return o; },
};
