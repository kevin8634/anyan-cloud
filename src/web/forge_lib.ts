// 11-17 离线武器库（桌面版）：从 Lux3D 账户已生成的完成件里挑出的武器（只取件，不生成、不扣积分），
//   与预置 12 件去重后 8 件；GLB 已减面 + 贴图 1024/768（每件 ≤1.5 MB），放在 assets_forgelib/，
//   桌面版构建拷到 web/desktop/assets/forgelib/，按需读盘登记（不进启动内嵌）。网页版没有这个目录 → 列表为空，行为不变。
import { addRuntimeGlb, hasGlb } from './creatures_glb';

export interface LibItem { key: string; type: string; name: string; kw: string[] }
export const OFFLINE_LIB: LibItem[] = [
  { key: 'lib_4342723', type: 'sword', name: '锯齿弯刀', kw: ['锯', '弯刀', '齿'] },
  { key: 'lib_4390706', type: 'sword', name: '紫晶魔剑', kw: ['紫', '晶', '魔剑'] },
  { key: 'lib_4475661', type: 'sword', name: '暗纹长剑', kw: ['暗纹', '长剑', '黑'] },
  { key: 'lib_4389649', type: 'staff', name: '深海法杖', kw: ['海', '深海', '水'] },
  { key: 'lib_4390018', type: 'staff', name: '潮眼法杖', kw: ['潮', '眼'] },
  { key: 'lib_4394070', type: 'staff', name: '紫焰长杖', kw: ['紫', '焰', '火'] },
  { key: 'lib_4467036', type: 'mace', name: '黑曜战锤', kw: ['黑曜', '战锤', '锤'] },
  { key: 'lib_4474692', type: 'greataxe', name: '藤蔓巨斧', kw: ['藤', '蔓', '巨斧', '木'] },
];
export const libName = (key: string) => OFFLINE_LIB.find(i => i.key === key)?.name;

type Drfs = { read(p: string): ArrayBuffer | Uint8Array; exists?(p: string): boolean };
const drfs = () => (globalThis as unknown as { __drfs?: Drfs }).__drfs;
const path = (key: string) => `assets/forgelib/${key}.glb`;
const toAb = (b: ArrayBuffer | Uint8Array): ArrayBuffer => b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer : b;

/** 本机有没有离线武器库（桌面版且目录存在） */
let _avail: boolean | null = null, _first: ArrayBuffer | null = null;   // 探测时读到的第一件留着，登记时不再读第二次
export function offlineLibAvailable(): boolean {
  if (_avail !== null) return _avail;
  const fs = drfs(); if (!fs) return (_avail = false);
  const k0 = OFFLINE_LIB[0].key;
  try { if (fs.exists) _avail = fs.exists(path(k0)); else { _first = toAb(fs.read(path(k0))); _avail = true; } } catch { _avail = false; }
  return _avail;
}
/** 列表（不加载模型）：桌面版有目录才返回 */
export const offlineLib = (): LibItem[] => offlineLibAvailable() ? OFFLINE_LIB : [];
export const isLibKey = (key: string) => OFFLINE_LIB.some(i => i.key === key);

const loading = new Map<string, Promise<boolean>>();
/** 按需登记一件（读盘 → 解析）；已登记直接 true */
export function ensureLib(key: string): Promise<boolean> {
  if (hasGlb(key)) return Promise.resolve(true);
  if (!isLibKey(key)) return Promise.resolve(false);
  let p = loading.get(key);
  if (!p) {
    p = (async () => { try { const fs = drfs(); if (!fs) return false; const buf = key === OFFLINE_LIB[0].key && _first ? _first : toAb(fs.read(path(key))); _first = null; return await addRuntimeGlb(key, buf); } catch (e) { console.warn('离线武器库读取失败', key, e); return false; } })();
    loading.set(key, p); p.then(ok => { if (!ok) loading.delete(key); });
  }
  return p;
}
