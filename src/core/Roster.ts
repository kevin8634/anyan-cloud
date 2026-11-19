// ========== 角色列表（阶段三）：3 个角色栏位，一个角色一个存档（引擎无关） ==========
// 存储：darkrock_roster = 角色列表；darkrock_char_<id> = 角色存档（+ _bak1~3 备份、_corrupt 损坏原文）
// 老版本是「一个职业一个存档」（darkrock_legend_save / darkrock_legend_save_mage），第一次打开新版本时自动迁成角色
import { SaveManager, SaveStorage, GameSave, LoadStatus, hashText } from './SaveManager';
import { LootData } from './Loot';

export const ROSTER_KEY = 'darkrock_roster';
export const MAX_SLOTS = 8;   // v0.8.2.1：3 → 8
export const LEGACY_BASE = 'darkrock_legend_save';

export interface CharMeta {
  id: string; name: string; classId: string; look: number;
  level: number; elite: number; ilvl: number; map: string; playMs: number;
  savedAt: number; createdAt: number;
  /** 读档状态（只在内存里，不存）：corrupt 的角色不能进游戏 */
  status?: LoadStatus;
}
interface RosterData { v: 1; slots: (CharMeta | null)[]; last?: string; legacyMigrated?: boolean; }

/** 导出文件格式 */
export interface ExportFile { format: 'darkrock-save'; v: 1; exportedAt: number; meta: CharMeta; save: GameSave; }

const NAME_A = ['霜', '烬', '岩', '影', '曦', '苍', '赤', '夜', '风', '雷', '寒', '铁', '星', '灰', '炽', '墨', '青', '玄'];
const NAME_B = ['刃', '歌', '羽', '牙', '心', '誓', '痕', '行者', '之锋', '守望', '落', '鸣', '川', '炎', '辰', '鸦', '骁', '岚'];
export function randomName(rand = Math.random): string { return NAME_A[Math.floor(rand() * NAME_A.length)] + NAME_B[Math.floor(rand() * NAME_B.length)]; }
/** 名字规则：1~8 个字，不能有空白和 <>"' 等符号 */
export function nameError(n: string): string | null {
  const t = n.trim();
  if (!t) return '请输入名字';
  if ([...t].length > 8) return '名字最多 8 个字';
  if (/[\s<>"'&\\/]/.test(t)) return '名字不能有空格或特殊符号';
  return null;
}

export class Roster {
  data: RosterData = { v: 1, slots: Array<CharMeta | null>(MAX_SLOTS).fill(null) };
  constructor(private storage: SaveStorage, private lootData?: LootData, private idGen: () => string = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)) { this.load(); }

  load() {
    try {
      const d = JSON.parse(this.storage.get(ROSTER_KEY) ?? 'null') as RosterData | null;
      if (d && Array.isArray(d.slots)) { this.data = d; while (this.data.slots.length < MAX_SLOTS) this.data.slots.push(null); }
    } catch { /* 列表坏了：下面从角色存档重建 */ this.rebuild(); }
    return this;
  }
  persist() { this.storage.set(ROSTER_KEY, JSON.stringify({ ...this.data, slots: this.data.slots.map(m => (m ? { ...m, status: undefined } : null)) })); }
  get slots() { return this.data.slots; }
  get count() { return this.data.slots.filter(Boolean).length; }
  find(id: string) { return this.data.slots.find(m => m?.id === id) ?? null; }
  firstEmpty() { return this.data.slots.findIndex(m => !m); }
  saverFor(id: string) { return new SaveManager(this.storage, `darkrock_char_${id}`, this.lootData); }

  /** 角色列表丢了但角色存档还在（比如只清了列表）：扫一遍已知 id 重建（做不到全扫时至少不报错） */
  private rebuild() {
    this.data = { v: 1, slots: Array<CharMeta | null>(MAX_SLOTS).fill(null), legacyMigrated: true };
    const ids = (this.storage.keys?.() ?? []).map(k => /^darkrock_char_([a-z0-9]+)$/.exec(k)?.[1]).filter((x): x is string => !!x);
    for (const id of ids.slice(0, MAX_SLOTS)) {
      const s = this.saverFor(id).loadResult().save;
      const slot = this.firstEmpty(); if (slot < 0) break;
      this.data.slots[slot] = { id, name: s?.name ?? '旅人', classId: s?.classId ?? 'warrior', look: s?.look ?? 0, level: s?.level?.level ?? 1, elite: s?.elite ?? 0, ilvl: 0, map: s?.map ?? 'camp', playMs: s?.playMs ?? 0, savedAt: s?.savedAt ?? 0, createdAt: s?.savedAt ?? 0 };
    }
    this.persist();
  }

  /** 老存档（每职业一个）→ 角色；只做一次。返回迁移了几个 */
  migrateLegacy(classIds: string[], classNames: Record<string, string>): number {
    if (this.data.legacyMigrated) return 0;
    let n = 0;
    for (const c of classIds) {
      const key = SaveManager.slotKey(LEGACY_BASE, c);
      const raw = this.storage.get(key);
      if (!raw) continue;
      const slot = this.firstEmpty(); if (slot < 0) break;
      const s = SaveManager.parse(raw);
      const id = this.idGen();
      // 原文原样搬过去（坏的也搬，交给读档时的损坏处理），老 key 保留不删
      this.storage.set(`darkrock_char_${id}`, raw);
      const lv = s?.level?.level ?? 1;
      this.data.slots[slot] = { id, name: classNames[c] ?? c, classId: s?.classId ?? c, look: 0, level: lv, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: s?.savedAt ?? 0, createdAt: s?.savedAt ?? Date.now() };
      n++;
    }
    this.data.legacyMigrated = true;
    this.persist();
    return n;
  }

  /** 读每个角色的存档状态（列表上显示「存档损坏 / 已从备份恢复」） */
  probe() {
    for (const m of this.data.slots) {
      if (!m) continue;
      const r = this.saverFor(m.id).loadResult();
      m.status = r.status;
      if (r.save) this.syncMeta(m, r.save);
    }
  }
  private syncMeta(m: CharMeta, s: GameSave) {
    m.level = s.level?.level ?? m.level; m.classId = s.classId ?? m.classId;
    if (s.name) m.name = s.name; if (typeof s.look === 'number') m.look = s.look;
    m.playMs = s.playMs ?? m.playMs; m.map = s.map ?? m.map; m.elite = s.elite ?? 0; m.savedAt = s.savedAt ?? m.savedAt;
  }

  nameTaken(name: string, exceptId?: string) { return this.data.slots.some(m => m && m.id !== exceptId && m.name === name.trim()); }

  create(classId: string, name: string, look = 0, slot = this.firstEmpty()): CharMeta | string {
    const err = nameError(name); if (err) return err;
    if (this.nameTaken(name)) return '已经有同名角色了';
    if (slot < 0 || slot >= MAX_SLOTS) return `角色栏位已满（最多 ${MAX_SLOTS} 个），先删除一个角色`;
    if (this.data.slots[slot]) return '这个栏位已经有角色了';
    const m: CharMeta = { id: this.idGen(), name: name.trim(), classId, look, level: 1, elite: 0, ilvl: 0, map: 'camp', playMs: 0, savedAt: 0, createdAt: Date.now(), status: 'none' };
    this.data.slots[slot] = m; this.data.last = m.id;
    this.persist();
    return m;
  }
  remove(id: string) {
    const i = this.data.slots.findIndex(m => m?.id === id); if (i < 0) return false;
    this.saverFor(id).clear();
    this.data.slots[i] = null;
    if (this.data.last === id) this.data.last = undefined;
    this.persist();
    return true;
  }
  /** 存档后更新列表上的摘要 */
  update(id: string, patch: Partial<CharMeta>) {
    const m = this.find(id); if (!m) return;
    Object.assign(m, patch); this.data.last = id;
    this.persist();
  }
  setLast(id: string) { this.data.last = id; this.persist(); }

  exportText(id: string): string | null {
    const m = this.find(id); if (!m) return null;
    const r = this.saverFor(id).loadResult();
    if (!r.save) return null;
    const f: ExportFile = { format: 'darkrock-save', v: 1, exportedAt: Date.now(), meta: { ...m, status: undefined }, save: r.save };
    return JSON.stringify(f);
  }
  /** 导入存档文件：放进指定栏位（默认第一个空位）；同名自动加后缀 */
  importText(text: string, slot = this.firstEmpty()): CharMeta | string {
    let f: ExportFile;
    try { f = JSON.parse(text); } catch { return '文件不是有效的存档（无法解析）'; }
    if (!f || f.format !== 'darkrock-save' || !f.save || !f.meta) return '文件不是暗岩传说的存档';
    const s = f.save;
    if (s.sum && SaveManager.parse(JSON.stringify(s)) === null) return '存档内容已损坏（校验不通过）';
    if (!s.inventory || !s.level) return '存档内容不完整';
    if (slot < 0) return '角色栏位已满，先删除一个角色再导入';
    if (this.data.slots[slot]) return '这个栏位已经有角色了';
    let name = (s.name ?? f.meta.name ?? '旅人').trim();
    for (let k = 2; this.nameTaken(name); k++) name = `${(s.name ?? f.meta.name).slice(0, 6)}${k}`;
    const id = this.idGen();
    const sm = this.saverFor(id);
    const { sum: _sum, version: _v, savedAt: _t, ...rest } = s; void _sum; void _v; void _t;
    sm.save({ ...rest, name } as GameSave);
    const back = sm.loadResult().save!;   // 走一遍迁移（老版本导出的文件也能导入）
    sm.save({ ...back, name });
    const m: CharMeta = { id, name, classId: back.classId ?? f.meta.classId, look: back.look ?? 0, level: back.level.level, elite: back.elite ?? 0, ilvl: f.meta.ilvl ?? 0, map: back.map ?? 'camp', playMs: back.playMs ?? 0, savedAt: Date.now(), createdAt: f.meta.createdAt ?? Date.now(), status: 'ok' };
    this.data.slots[slot] = m; this.data.last = id;
    this.persist();
    return m;
  }
}

/** 存档文件名：角色名_等级_日期.json */
export function exportFileName(m: CharMeta) {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return `暗岩传说_${m.name}_${m.level}级_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}
export { hashText };
