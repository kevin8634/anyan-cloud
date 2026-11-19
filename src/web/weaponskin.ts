// ========== v1.2.40 武器外观覆盖（通用）：武器类型 → 模型名 ==========
// 只改主手武器的外观（比赛版写实角色才生效，属性不变）。覆盖表存 localStorage；运行时生成的 GLB 存 IndexedDB，启动时重新登记。
// 本文件只放通用词；生成 / 选择界面由内容包通过 PackCtx.weaponSkin 提供。
import { addRuntimeGlb, hasGlb } from './creatures_glb';
import { offlineLib, ensureLib } from './forge_lib';   // 11-17 离线武器库

const LS = 'darkrock_wskin';
let map: Record<string, string> = {};
try { map = JSON.parse(localStorage.getItem(LS) ?? '{}') ?? {}; } catch { map = {}; }
const persist = () => { try { localStorage.setItem(LS, JSON.stringify(map)); } catch { /* 存不下就只在本次生效 */ } };

// 11-18 Rhett「默认是我穿戴的模型，用铸造台更换的时候才用铸造台模型」：外观绑在换上那一刻的那件装备（物品 id）上，
// 换了别的装备就显示装备自己的模型；以前按武器类型永久覆盖 → 换什么都还是那把。?off=wskinbind 回旧行为
const LS_ON = 'darkrock_wskin_on';
let bound: Record<string, string> = {};
try { bound = JSON.parse(localStorage.getItem(LS_ON) ?? '{}') ?? {}; } catch { bound = {}; }
const unbind = (() => { try { return /(?:^|[?&])off=[^&]*\bwskinbind\b/.test(location.search); } catch { return false; } })();
/** itemId 不传 = 只问这个类型有没有覆盖（旧调用）；传了（没装备传 null）= 只有绑定的就是这件才生效 */
export const weaponSkinGet = (type: string, itemId?: string | null): string | null => {
  const k = map[type] ?? null; if (!k || itemId === undefined || unbind) return k;
  return bound[type] !== undefined && bound[type] === (itemId ?? '') ? k : null;
};
export function weaponSkinSet(type: string, key: string | null, itemId?: string | null) {
  if (key) { map[type] = key; bound[type] = itemId ?? ''; } else { delete map[type]; delete bound[type]; }
  persist(); try { localStorage.setItem(LS_ON, JSON.stringify(bound)); } catch { /* 只在本次生效 */ }
}

// ---- 运行时 GLB 持久化（IndexedDB：darkrock_glb / glb）
const DB = 'darkrock_glb', ST = 'glb';
function db(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function idbPut(key: string, buf: ArrayBuffer) {
  const d = await db(); if (!d) return;
  await new Promise<void>(res => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(buf, key); t.oncomplete = () => res(); t.onerror = () => res(); });
}
async function idbAll(): Promise<[string, ArrayBuffer][]> {
  const d = await db(); if (!d) return [];
  return new Promise(res => {
    const out: [string, ArrayBuffer][] = [];
    const t = d.transaction(ST, 'readonly'); const c = t.objectStore(ST).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push([String(cur.key), cur.value as ArrayBuffer]); cur.continue(); } else res(out); };
    c.onerror = () => res(out);
  });
}

async function idbGet(key: string): Promise<ArrayBuffer | null> {
  const d = await db(); if (!d) return null;
  return new Promise(res => { const t = d.transaction(ST, 'readonly'); const q = t.objectStore(ST).get(key); q.onsuccess = () => res((q.result as ArrayBuffer) ?? null); q.onerror = () => res(null); });
}
async function idbDel(key: string) {
  const d = await db(); if (!d) return;
  await new Promise<void>(res => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).delete(key); t.oncomplete = () => res(); t.onerror = () => res(); });
}

// ---- v1.2.46 运行时模型的元数据（localStorage：darkrock_wskin_meta，key → { name, type, date, size, ... }，内容由调用方决定）
const LS_META = 'darkrock_wskin_meta';
export type SkinMeta = Record<string, unknown> & { name?: string; type?: string; date?: number; size?: number };
let meta: Record<string, SkinMeta> = {};
try { meta = JSON.parse(localStorage.getItem(LS_META) ?? '{}') ?? {}; } catch { meta = {}; }
const persistMeta = () => { try { localStorage.setItem(LS_META, JSON.stringify(meta)); } catch { /* 存不下就只在本次生效 */ } };

/** 登记一个运行时 GLB（并持久化）；带 m = 同时记一条元数据（会出现在 weaponSkinList 里）；成功返回 true */
export async function weaponSkinLoad(key: string, buf: ArrayBuffer, keep = true, m?: SkinMeta): Promise<boolean> {
  const ok = await addRuntimeGlb(key, buf);
  if (ok && keep) await idbPut(key, buf.slice(0));
  if (ok && m) { meta[key] = { size: buf.byteLength, date: Date.now(), ...m }; persistMeta(); }
  return ok;
}
/** 有元数据的运行时模型（新的在前） */
export const weaponSkinList = (): { key: string; meta: SkinMeta }[] => Object.entries(meta).map(([key, m]) => ({ key, meta: m })).sort((a, b) => (b.meta.date ?? 0) - (a.meta.date ?? 0));
/** 删除一个运行时模型：IndexedDB + 元数据 + 指向它的外观覆盖（退回默认外观） */
export async function weaponSkinRemove(key: string): Promise<void> {
  delete meta[key]; persistMeta();
  for (const [t, k] of Object.entries(map)) if (k === key) delete map[t];
  persist(); await idbDel(key);
}

const toB64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
export interface SkinBundle { v: 1; map: Record<string, string>; items: { key: string; meta: SkinMeta; glb: string }[] }
/** 导出存档用：所有有元数据的运行时模型（GLB base64）+ 当前外观覆盖；没有 = null */
export async function weaponSkinExport(): Promise<SkinBundle | null> {
  const items: SkinBundle['items'] = [];
  for (const { key, meta: m } of weaponSkinList()) { const b = await idbGet(key); if (b) items.push({ key, meta: m, glb: toB64(b) }); }
  return items.length ? { v: 1, map: { ...map }, items } : null;
}
/** 导入存档用：恢复模型（已有的跳过）+ 元数据 + 外观覆盖；返回恢复的个数 */
export async function weaponSkinImport(o: SkinBundle | null | undefined): Promise<number> {
  if (!o || !Array.isArray(o.items)) return 0;
  let n = 0;
  for (const it of o.items) {
    if (!it?.key || typeof it.glb !== 'string') continue;
    if (!meta[it.key] || !hasGlb(it.key)) { if (await weaponSkinLoad(it.key, fromB64(it.glb), true, it.meta ?? {})) n++; }
  }
  for (const [t, k] of Object.entries(o.map ?? {})) if (hasGlb(k)) map[t] = k;
  persist();
  return n;
}
/** 启动时把之前生成过的模型重新登记（失败的覆盖会自动退回默认外观） */
export async function weaponSkinRestore(): Promise<number> {
  let n = 0;
  for (const [k, b] of await idbAll()) if (!hasGlb(k) && await addRuntimeGlb(k, b)) n++;
  // 11-17 离线武器库（桌面版）：启动后台登记全部 8 件（约 5.5 MB），铸造台列表 / 离线挑选 / 当前外观都能直接用；当前外观用到的先登记
  const lib = offlineLib().map(i => i.key), used = new Set(Object.values(map));
  for (const k of [...lib.filter(k => used.has(k)), ...lib.filter(k => !used.has(k))]) if (!hasGlb(k) && await ensureLib(k)) n++;
  return n;
}
export const weaponSkinHas = (key: string) => hasGlb(key);
/** v1.2.47 运行时模型的元数据（名字 / 铸造者 author 等；没有 = null） */
export const weaponSkinMeta = (key: string): SkinMeta | null => meta[key] ?? null;
