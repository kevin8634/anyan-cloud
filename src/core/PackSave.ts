// ======================================================================
// v0.9.7 DLC 框架：存档兼容（引擎无关，纯函数，sim 可直接测）
//
// 存档里和内容包有关的字段（都是可选字段，存档版本号不变）
// - dlc: { <包 id>: 包自己的数据 }       —— 包通过 manifest 的 saveData / loadData 读写；本体不认识的包原样写回
// - packSealed: { items, stacks }        —— 本体读到「没注册的包」的物品：从身上 / 背包挪进封存列表（不删）
// - packPark: { map, pos }               —— 存档位置在当前构建不认识的区域：记下原位置、人放回灰石营地
// - level 超过当前上限：core/TalentTree.ts Progression.held 负责写回原值
// - 其它不认识的字段：carrySave 原样写回
// 重新以带包的构建读档：applyPackCompat 把封存的物品放回原处、位置放回包区域（能进入时）。
// ======================================================================
import type { GameSave } from './SaveManager';
import type { ItemInstance } from './Loot';
import { stackPack } from './ContentPacks';

/** from / slot / index = 原来的位置（身上的格子；背包里的序号），解封时尽量放回原处 */
export interface SealedItem { pack: string; from: 'equipped' | 'bag'; slot?: string; index?: number; item: ItemInstance }
export interface PackSealed { items: SealedItem[]; stacks?: Record<string, number> }
export interface PackPark { map: string; pos?: { x: number; z: number } }
/** 存档里内容包相关的字段（GameSave 之外的可选字段） */
export interface PackSaveFields { dlc?: Record<string, unknown>; packSealed?: PackSealed; packPark?: PackPark }
export type PackGameSave = GameSave & PackSaveFields;

export interface PackEnv {
  hasPack(id: string): boolean;
  /** 当前构建认识的地图 id */
  knownMap(id: string): boolean;
  /** 包区域能不能真正进入（有 enter 函数）；不传 = 认识就能进 */
  canEnterMap?(id: string): boolean;
  knownClass(id: string): boolean;
  /** 背包容量（解封时放不下的继续封存） */
  bagCap: number;
}
export interface PackFixReport { sealed: number; unsealed: number; stillSealed: number; parked: boolean; unparked: boolean; classLocked: boolean }

/** 封存一件物品需要的判断：带包标记且包没注册 */
const sealable = (it: ItemInstance | null | undefined, env: PackEnv): it is ItemInstance => !!it && !!it.pack && !env.hasPack(it.pack);

/**
 * 读档后调用（存档迁移之后、各系统 load 之前）。直接修改 s，返回做了什么。
 * 存档里没有任何包相关的东西时什么都不改（不会新增字段），本体行为与旧版完全一致。
 */
export function applyPackCompat(s: PackGameSave, env: PackEnv): PackFixReport {
  const r: PackFixReport = { sealed: 0, unsealed: 0, stillSealed: 0, parked: false, unparked: false, classLocked: false };
  r.classLocked = !!s.classId && !env.knownClass(s.classId);
  const inv = s.inventory;
  // ---- 1. 解封：之前封存的物品，包现在注册了 → 放回原处（原格子被占 / 背包满 → 继续封存，不丢）
  if (s.packSealed) {
    const keep: SealedItem[] = [];
    // 背包件按原序号从小到大插回，原样往返时顺序也一致
    const list = [...(s.packSealed.items ?? [])].sort((a, b) => (a.from === 'bag' ? a.index ?? 1e9 : -1) - (b.from === 'bag' ? b.index ?? 1e9 : -1));
    for (const e of list) {
      if (!env.hasPack(e.pack)) { keep.push(e); continue; }
      const eq = (inv.equipped ??= {}) as Record<string, ItemInstance | undefined>;
      if (e.from === 'equipped' && e.slot && !eq[e.slot]) { eq[e.slot] = e.item; r.unsealed++; continue; }
      const bag = (inv.bag ??= []);
      if (bag.length < env.bagCap) { bag.splice(Math.min(e.index ?? bag.length, bag.length), 0, e.item); r.unsealed++; continue; }
      keep.push(e);
    }
    const st: Record<string, number> = {};
    for (const [k, n] of Object.entries(s.packSealed.stacks ?? {})) {
      const p = stackPack(k);
      if (p && env.hasPack(p)) { (inv.stacks ??= {})[k] = (inv.stacks[k] ?? 0) + n; r.unsealed++; } else st[k] = n;
    }
    if (keep.length || Object.keys(st).length) s.packSealed = { items: keep, ...(Object.keys(st).length ? { stacks: st } : {}) };
    else delete s.packSealed;
  }
  // ---- 2. 封存：身上 / 背包里没注册的包的物品、堆叠材料
  const add: SealedItem[] = [];
  const eq = (inv.equipped ?? {}) as Record<string, ItemInstance | undefined>;
  for (const [slot, it] of Object.entries(eq)) if (sealable(it, env)) { add.push({ pack: it.pack!, from: 'equipped', slot, item: it }); delete eq[slot]; }
  if (inv.bag?.some(it => sealable(it, env))) {
    const rest: ItemInstance[] = [];
    inv.bag.forEach((it, index) => { if (sealable(it, env)) add.push({ pack: it.pack!, from: 'bag', index, item: it }); else rest.push(it); });
    inv.bag = rest;
  }
  const addSt: Record<string, number> = {};
  for (const [k, n] of Object.entries(inv.stacks ?? {})) { const p = stackPack(k); if (p && !env.hasPack(p)) { addSt[k] = n; delete inv.stacks![k]; } }
  if (add.length || Object.keys(addSt).length) {
    const cur = s.packSealed ?? { items: [] };
    const st = { ...(cur.stacks ?? {}) };
    for (const [k, n] of Object.entries(addSt)) st[k] = (st[k] ?? 0) + n;
    s.packSealed = { items: [...cur.items, ...add], ...(Object.keys(st).length ? { stacks: st } : {}) };
    r.sealed = add.length + Object.keys(addSt).length;
  }
  r.stillSealed = (s.packSealed?.items.length ?? 0) + Object.keys(s.packSealed?.stacks ?? {}).length;
  // ---- 3. 位置：之前停放的包区域现在能进 → 放回去；当前位置不认识 → 停放、回营地
  if (s.packPark && env.knownMap(s.packPark.map) && (env.canEnterMap?.(s.packPark.map) ?? true)) {
    s.map = s.packPark.map;
    if (s.packPark.pos) s.pos = { ...s.packPark.pos }; else delete s.pos;
    delete s.packPark; r.unparked = true;
  } else if (s.map && !env.knownMap(s.map)) {
    s.packPark = { map: s.map, ...(s.pos ? { pos: { ...s.pos } } : {}) };
    s.map = 'camp'; delete s.pos; r.parked = true;
  } else if (s.map && env.canEnterMap && !env.canEnterMap(s.map)) {
    // 认识但还不能进入的包区域（框架阶段包区域没有 enter）：同样停放
    s.packPark = { map: s.map, ...(s.pos ? { pos: { ...s.pos } } : {}) };
    s.map = 'camp'; delete s.pos; r.parked = true;
  }
  return r;
}

/** 写存档时不从旧存档带过去的字段：存档头、一次性提示、已搬到共享仓库的老仓库字段 */
export const CARRY_SKIP: ReadonlySet<string> = new Set(['version', 'savedAt', 'sum', 'notices', 'bank']);

/**
 * 写存档：新内容（fresh）覆盖读档时的存档（prev），prev 里本版本不写的字段（未来版本 / 内容包的字段、
 * packSealed、packPark、dlc 里没注册的包）原样带上。fresh 里出现的键（哪怕值是 undefined）一律以 fresh 为准。
 */
export function carrySave<T extends object>(prev: object | null | undefined, fresh: T): T {
  if (!prev) return fresh;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev)) if (!CARRY_SKIP.has(k) && !(k in fresh)) out[k] = v;
  if (!Object.keys(out).length) return fresh;
  return { ...out, ...fresh } as T;
}

/** dlc 字段：已注册的包各自写自己的那份，没注册的包原样保留；都没有 → undefined（不写这个字段） */
export function mergeDlcField(prev: Record<string, unknown> | undefined, mine: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!prev && !Object.keys(mine).length) return undefined;
  return { ...(prev ?? {}), ...mine };
}

/** 共享仓库（账号级，不跟角色存档走）：没注册的包的物品拆出来，单独存一份封存列表 */
export function splitBank(items: ItemInstance[], env: Pick<PackEnv, 'hasPack'>): { keep: ItemInstance[]; seal: ItemInstance[] } {
  if (!items.some(it => it?.pack && !env.hasPack(it.pack))) return { keep: items, seal: [] };
  const keep: ItemInstance[] = [], seal: ItemInstance[] = [];
  for (const it of items) (it?.pack && !env.hasPack(it.pack) ? seal : keep).push(it);
  return { keep, seal };
}
