// ======================================================================
// 浏览器存档后端（阶段三）：localStorage 同步读写 + IndexedDB 双写镜像
//   - 读写都先走 localStorage（同步，游戏逻辑简单）；每次写入同时异步写进 IndexedDB
//   - 启动时对比两边：localStorage 被清掉 / 比 IndexedDB 旧的存档，用 IndexedDB 的那份补回来
//   - 嵌在预览框里两者都不能用时退回内存（刷新会丢，标题画面会提示）
// ======================================================================
import type { SaveStorage } from '../core/SaveManager';

const DB = 'darkrock', STORE = 'kv';
const PREFIX = 'darkrock_';
const safe = <R>(f: () => R, fb: R): R => { try { return f(); } catch { return fb; } };

export class BrowserStorage implements SaveStorage {
  private mem = new Map<string, string>();
  private db: IDBDatabase | null = null;
  lsOk = safe(() => { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }, false);
  idbOk = false;
  /** 写入次数（测试 / 设置界面「上次保存」用） */
  writes = 0;

  get(k: string) { return this.lsOk ? safe(() => localStorage.getItem(k), this.mem.get(k) ?? null) ?? this.mem.get(k) ?? null : this.mem.get(k) ?? null; }
  set(k: string, v: string) {
    this.mem.set(k, v);
    if (this.lsOk) safe(() => localStorage.setItem(k, v), undefined);
    this.writes++;
    if (this.db && k.startsWith(PREFIX)) safe(() => { this.db!.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); }, undefined);
  }
  remove(k: string) {
    this.mem.delete(k);
    if (this.lsOk) safe(() => localStorage.removeItem(k), undefined);
    if (this.db) safe(() => { this.db!.transaction(STORE, 'readwrite').objectStore(STORE).delete(k); }, undefined);
  }
  keys(): string[] {
    const out = new Set(this.mem.keys());
    if (this.lsOk) safe(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) out.add(k); } }, undefined);
    return [...out];
  }

  /** 打开 IndexedDB 并把镜像里更新的存档补回 localStorage。返回补回了几个 key */
  async init(timeoutMs = 1500): Promise<number> {
    const idb = safe(() => (typeof indexedDB !== 'undefined' ? indexedDB : null), null);
    if (!idb) return 0;
    const open = new Promise<IDBDatabase | null>(res => {
      try {
        const r = idb.open(DB, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
        r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch { res(null); }
    });
    const db = await Promise.race([open, new Promise<null>(r => setTimeout(() => r(null), timeoutMs))]);
    if (!db) return 0;
    this.db = db; this.idbOk = true;
    // 读出镜像里的全部 key/value
    const all = await new Promise<[string, string][]>(res => {
      try {
        const out: [string, string][] = [];
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        req.onsuccess = () => { const c = req.result; if (c) { out.push([String(c.key), String(c.value)]); c.continue(); } else res(out); };
        req.onerror = () => res(out);
      } catch { res([]); }
    });
    let restored = 0;
    const savedAt = (t: string | null) => { if (!t) return -1; try { return JSON.parse(t).savedAt ?? 0; } catch { return -2; } };
    const mirrorKeys = new Set(all.map(a => a[0]));
    for (const [k, v] of all) {
      const cur = this.get(k);
      // localStorage 里没有，或者镜像那份更新（存档带 savedAt）→ 用镜像的
      if (cur === null || (cur !== v && savedAt(v) > savedAt(cur))) { this.mem.set(k, v); if (this.lsOk) safe(() => localStorage.setItem(k, v), undefined); restored++; }
    }
    // 反过来：localStorage 有、镜像没有的（升级前的老存档）补进镜像
    for (const k of this.keys()) if (k.startsWith(PREFIX) && !mirrorKeys.has(k)) { const v = this.get(k); if (v !== null) safe(() => { db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); }, undefined); }
    return restored;
  }
}

/** 浏览器里下载一个文本文件 */
export function downloadText(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    return true;
  } catch { return false; }
}
/** 让玩家选一个文件，读成文本 */
export function pickTextFile(): Promise<string | null> {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { const f = inp.files?.[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsText(f); };
    inp.click();
  });
}
