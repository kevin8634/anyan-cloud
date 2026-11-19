// v0.7.4：觉醒 + 岩纹镌刻（引擎无关，存在装备实例的可选字段里，存档版本不变）
// 觉醒：紫装 / 副本装（副本、长副本来源）带一条隐藏词条。穿在身上击败首领累积「历练」，满 AWK_NEED 后从 3 个隐藏词条里选 1 个解锁。
// 岩纹：武器 / 胸甲有孔（紫 1 / 橙 2 / 暗金 3，铁匠可开到 3）；每颗岩纹有小效果；3 个孔按顺序组成「纹语」时额外触发。
import { ItemInstance } from './Loot';
import { ItemDef } from './Loadout';
import { ModifierDef } from './types';
import { AWK_AFFIXES, AWK_LEGACY, AWK_ULT_CAP_ID, AWK_ULT_CAP_PER, AWK_ULT_CAP_PIECES, AwkGroup, AWK_GROUP, AWK_NEED, AWK_XP, SOCKET_SLOTS, BASE_SOCKETS, MAX_SOCKETS, OPEN_COST, RUNE_STONES, RUNE_WORDS, RuneWord } from '../data/awaken';

/** 装备上的觉醒状态 */
export interface AwkState { xp: number; opts?: string[]; pick?: string }
export const canAwaken = (it: ItemInstance) => it.quality === 'purple' || ((it.tier === 'dungeon' || it.tier === 'raid') && ['blue', 'purple', 'orange', 'dark'].includes(it.quality));
/** v1.2.37：旧词条 id → 新池等价词条 id（不认识的原样返回） */
export const legacyAffix = (id: string, g?: AwkGroup) => { const m = AWK_LEGACY[id]; return m ? (g && m[g]) || m.any : id; };
export const affixDef = (id?: string, g?: AwkGroup) => id ? AWK_AFFIXES.find(a => a.id === id) ?? AWK_AFFIXES.find(a => a.id === legacyAffix(id, g)) : undefined;
/** v1.2.37 旧存档迁移：已选 / 待选里被删除的觉醒词条换成新池同部位等价词条（待选去重，重复的从同部位池补）。返回改动件数 */
export function migrateAwk(items: (ItemInstance | null | undefined)[], rng: () => number = Math.random): number {
  migrateHasteText(items);
  let n = 0;
  for (const it of items) {
    const a = it?.awk; if (!it || !a) continue;
    const g = AWK_GROUP[it.slot];
    let hit = false;
    if (a.pick && AWK_LEGACY[a.pick]) { a.pick = legacyAffix(a.pick, g); hit = true; }
    if (a.opts?.some(id => !AWK_AFFIXES.some(x => x.id === id))) {
      const out: string[] = [];
      for (const id of a.opts) { const v = legacyAffix(id, g); if (AWK_AFFIXES.some(x => x.id === v) && !out.includes(v)) out.push(v); }
      const pool = AWK_AFFIXES.filter(x => x.groups.includes(g) && !out.includes(x.id)).map(x => x.id);
      while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      a.opts = out; hit = true;
    }
    if (hit) n++;
  }
  return n;
}
/** v1.2.37：老装备词条文字「急速 +x%（技能冷却缩短）」→ 新口径（词条按文字反解，必须和 data/loot.ts 一致） */
export function migrateHasteText(items: (ItemInstance | null | undefined)[]) {
  for (const it of items) if (it?.lines) it.lines = it.lines.map(l => l.replace('（技能冷却缩短）', '（攻速 / 持续伤害 / 翻滚）'));
}
/** v1.2.37 大招冷却缩减上限：0.4 + 每件已觉醒「暮时·终局」0.1（最多 4 件 → 0.8） */
export function ultCdrCap(equipped: ItemInstance[], base = 0.4): number {
  const k = equipped.filter(it => it.awk?.pick && legacyAffix(it.awk.pick, AWK_GROUP[it.slot]) === AWK_ULT_CAP_ID).length;
  return base + Math.min(AWK_ULT_CAP_PIECES, k) * AWK_ULT_CAP_PER;
}
export const hasAwk = (equipped: ItemInstance[], id: string) => equipped.some(it => it.awk?.pick && legacyAffix(it.awk.pick, AWK_GROUP[it.slot]) === id);
export const runeDef = (id?: string | null) => RUNE_STONES.find(r => r.id === id);

/** 首领击杀：身上每件可觉醒装备 +历练；满了就抽 3 个选项。返回这次刚好觉醒就绪的装备 */
export function onBossKill(equipped: ItemInstance[], kind: keyof typeof AWK_XP, rng: () => number = Math.random): ItemInstance[] {
  const ready: ItemInstance[] = [];
  for (const it of equipped) {
    it.kills = (it.kills ?? 0) + 1;
    if (!canAwaken(it)) continue;
    const a = it.awk ??= { xp: 0 };
    if (a.pick || a.opts) continue;
    a.xp = Math.min(AWK_NEED, a.xp + AWK_XP[kind]);
    if (a.xp >= AWK_NEED) { a.opts = rollOptions(it, rng); ready.push(it); }
  }
  return ready;
}
export function rollOptions(it: ItemInstance, rng: () => number = Math.random): string[] {
  const g = AWK_GROUP[it.slot];
  const pool = AWK_AFFIXES.filter(a => a.groups.includes(g)).map(a => a.id);
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
/** 选择隐藏词条（0~2）。返回错误原因或 null */
export function choose(it: ItemInstance, idx: number): string | null {
  const a = it.awk;
  if (!a?.opts) return '这件装备还没有觉醒';
  const id = a.opts[idx];
  if (!id) return '没有这个选项';
  a.pick = id; delete a.opts;
  return null;
}

// ============ 岩纹 ============
export const socketable = (it: ItemInstance) => SOCKET_SLOTS.includes(it.slot);
export const socketCount = (it: ItemInstance) => socketable(it) ? Math.min(MAX_SOCKETS, (BASE_SOCKETS[it.quality] ?? 0) + (it.sockOpen ?? 0)) : 0;
export const openCost = (it: ItemInstance) => socketable(it) && socketCount(it) < MAX_SOCKETS ? OPEN_COST[socketCount(it)] : null;
export function runesOf(it: ItemInstance): (string | null)[] {
  const n = socketCount(it), r = (it.runes ?? []).slice(0, n);
  while (r.length < n) r.push(null);
  return r;
}
/** 纹语：3 个孔都镶了且顺序对 */
export function wordOf(it: ItemInstance): RuneWord | undefined {
  const r = runesOf(it);
  if (r.length < 3 || r.some(x => !x)) return undefined;
  return RUNE_WORDS.find(w => w.seq.every((s, i) => s === r[i]));
}
/** 镶嵌：消耗背包里的 1 颗岩纹；孔里原来有的退回。take / give 由调用方连到背包堆叠 */
export function insert(it: ItemInstance, idx: number, runeId: string, take: (id: string) => boolean, give: (id: string) => void): string | null {
  if (!socketable(it)) return '只有武器和胸甲可以镌刻岩纹';
  if (idx < 0 || idx >= socketCount(it)) return '没有这个孔';
  if (!runeDef(runeId)) return '未知岩纹';
  if (!take(runeId)) return `背包里没有${runeDef(runeId)!.name}`;
  const r = runesOf(it);
  if (r[idx]) give(r[idx]!);
  r[idx] = runeId; it.runes = r;
  return null;
}
export function remove(it: ItemInstance, idx: number, give: (id: string) => void): string | null {
  const r = runesOf(it);
  if (!r[idx]) return '这个孔是空的';
  give(r[idx]!); r[idx] = null; it.runes = r;
  return null;
}

// ============ 修饰器汇总（以一件虚拟装备的形式交给 Loadout，和元素共鸣一样）============
const mk = (id: string, name: string, desc: string, m: Omit<ModifierDef, 'id' | 'source' | 'desc' | 'name'>): ModifierDef => ({ id, name, desc, source: 'equipment', ...m });
export function modsOf(it: ItemInstance): ModifierDef[] {
  const out: ModifierDef[] = [];
  const a = affixDef(it.awk?.pick, AWK_GROUP[it.slot]);
  if (a) out.push(mk(`awk:${a.id}:${it.id}`, a.name, a.desc, a.mod));
  for (const r of runesOf(it)) { const d = runeDef(r); if (d) out.push(mk(`rs:${d.id}`, d.name, d.desc, d.mod)); }
  const w = wordOf(it);
  if (w) out.push(mk(`rw:${w.id}`, `纹语·${w.name}`, w.desc, w.mod));
  return out;
}
export function awakenItem(items: ItemInstance[]): ItemDef | null {
  const mods = items.flatMap(modsOf);
  return mods.length ? { id: 'v_awaken', name: '觉醒与岩纹', slot: 'trinket', quality: 'white', modifiers: mods } : null;
}

/** 提示框文字（HTML 由 UI 层包装） */
export function tipLines(it: ItemInstance): { cls: string; text: string }[] {
  const out: { cls: string; text: string }[] = [];
  if (canAwaken(it)) {
    const a = it.awk, d = affixDef(a?.pick, AWK_GROUP[it.slot]);
    if (d) out.push({ cls: 'awk', text: `◈ 觉醒·${d.name}：${d.desc}` });
    else if (a?.opts) out.push({ cls: 'awk', text: '◈ 隐藏词条已觉醒，可以选择（铁匠 / 角色面板「觉醒」）' });
    else out.push({ cls: 'awk dim', text: `◈ 隐藏词条：？？？（历练 ${a?.xp ?? 0}/${AWK_NEED}，穿着击败首领累积）` });
  }
  const n = socketCount(it);
  if (n) {
    const r = runesOf(it), w = wordOf(it);
    out.push({ cls: 'rune', text: `◯ 岩纹孔 ${r.map(x => runeDef(x)?.glyph ?? '○').join(' ')}` });
    if (w) out.push({ cls: 'rune', text: `◯ 纹语·${w.name}：${w.desc}` });
  }
  if (it.kills) out.push({ cls: 'dim', text: `伴你击败 ${it.kills} 个首领` });
  return out;
}
