// ======================================================================
// DLC1「铸造台」（v1.2.40，黑客松比赛版；v1.2.46 异步任务 + 分块取回 + 断点续取 + 我的铸造品）：一句话铸一把武器外观
// 入口：伊奥拉（潮痕营地）/ 戈兹（镜渊城铁匠）对话框里的「铸造台」按钮
// 在线（v1.2.46）：POST <服务>/forge { prompt, weaponType } → { taskId }（秒回，此时计次）
//   → 每 3 秒 GET <服务>/forge/status/<taskId> → { state: queued|generating|downloading|done|failed, error?, size?, url? }
//   → done：按 2MB Range 分块下载 url（相对地址，以服务地址解析）→ 拼接 → 登记 GLB → 换上
//   taskId + 描述存 localStorage（darkrock_forge_pending）：关页 / 断网 / 下载失败后再打开铸造台自动续取，绝不重复生成
//   服务地址：网址参数 ?forge=<url> 或面板里「铸造服务地址」保存到 localStorage（darkrock_forge_api；魔搭部署时自动设为同源）
// 离线 / 失败 / 超限：按描述里的关键词从武器库（现有 Lux3D 武器）挑最接近的一把，提示里写明「在线生成失败：原因」、名字标「武器库·xxx」
// v1.2.47 定时领取模式（服务端 FORGE_CLAIM=1，魔搭专用开关）：提交后不等待，铸造台显示「炉火锻造中，约 2 分钟后来取」倒计时，玩家可离开；
//   回来打开铸造台自动向服务端查本设备的任务（GET /forge/mine?dev=<设备 ID>），到点就取回、播成形画面并换上；老页面同 IP 的任务也能认领
//   页面版本与服务端不符（GET /version）时自动保存并刷新，避免旧页面看不懂新服务端的回复
// 只改主手外观，不改属性；写实角色（比赛版）才看得到。每天本地上限 2 次在线生成（服务端另有全站 5 / 每 IP 2）
// ======================================================================
import { offerForgeCard } from './forgecard';   // v1.2.52
import type { PackCtx } from '../../core/ContentPacks';
import * as THREE from 'three';
import { makeGlbProp, propEnv } from '../../web/creatures_glb';
import { startForgeShow, forgeShowState } from './forgeshow';
import { startForgeCg, forgeStageWord, FORGE_CG } from './forgecg';
import { GAME_VERSION } from '../../web/version';
import { slimGlbWeb, isGlb } from './glbslim_web';
import { OFFLINE_LIB, isLibKey, ensureLib, libName } from '../../web/forge_lib';   // 11-17 离线武器库（名字 / 关键词）   // v1.2.54 导入本地 GLB
import { setWeaponFxPrompt } from '../../web/weaponfx';   // 11-19 提示词特效
import { decimateGlbWeb } from './glbdecimate_web';   // v1.2.55 导入本地 GLB 的游戏版减面（与服务端 GAME_FACES 一致）
import { forgeHdStart, forgeHdWait, forgeHdSave, forgeHdDel, forgeHdEnsure, forgeHdHas, forgeShowKey, hdKey, openHdViewer, hdViewerState, closeHdViewer } from './forge_hd';   // v1.2.54 高精度版（展示窗）
export { forgeShowState };

let ctx: PackCtx | null = null;
export const bindSmithy = (c: PackCtx) => { ctx = c; setTimeout(() => { void smithyBoot(); }, 1500); };
const LS_API = 'darkrock_forge_api', LS_DAY = 'darkrock_forge_day', LS_PENDING = 'darkrock_forge_pending', LS_DEV = 'darkrock_forge_dev';
/** pollMs 轮询间隔；timeoutMs 本次最长等待（超时保留任务，下次续取）；chunk 分块大小 */
export const SMITHY = { dailyOnline: 2, timeoutMs: 8 * 60e3, pollMs: 3000, chunk: 2 * 1024 * 1024, maxLen: 40, nameLen: 16 };
const BAN = ['政治', '色情', '裸', '血腥虐杀', '恐怖袭击', '毒品'];
const KW: [RegExp, string[]][] = [
  [/钟|铃/, ['weapon_bell_sword', 'weapon_bell_staff']],
  [/锚|斧|战斧/, ['weapon_rock_greataxe', 'weapon_rock_axe']],
  [/巨剑|大剑|双手剑/, ['weapon_rock_greatsword']],
  [/剑/, ['weapon_bell_sword', 'weapon_rock_greatsword']],
  [/法杖|权杖|杖/, ['weapon_bell_staff', 'weapon_rock_wand']],
  [/魔棒|短杖|棒/, ['weapon_rock_wand']],
  [/匕|短刃|刺/, ['weapon_rock_dagger']],
  [/锤|槌|钉头/, ['weapon_rock_mace']],
  [/轮|环|盘/, ['weapon_time_chakram']],
  [/瓶|药|炸/, ['weapon_flask']],
  [/宝珠|法球|球/, ['weapon_rock_orb']],
  [/书|典|卷/, ['weapon_rock_tome']],
];

const apiUrl = (): string => {
  try { const q = new URLSearchParams(location.search).get('forge'); if (q) return q; } catch { /* 无 location */ }
  try { return localStorage.getItem(LS_API) ?? ''; } catch { return ''; }
};
const base = (api: string) => api.replace(/\/+$/, '');
// v1.2.54 Rhett：严格区分本地版 / 魔搭版，杜绝本地「扣了积分拿不到模型」
//   Lux3D 的 OPTIONS 预检带 Access-Control-Allow-Origin，但真正的 GET/POST 响应不带 → 浏览器拦截（只能拿到 TypeError），
//   在浏览器里直连 task/create 会扣积分却拿不到任务号。所以：
//   · server（魔搭版，同源 server.js / 配了铸造服务地址）：照旧由服务端生成（Key 在服务端）
//   · local（离线包 / file:// / 没有铸造服务）：任何路径都不发 task/create；只能「导入本地 GLB」或从预置武器库挑；
//     Key 输入框只保留「测试 Key」（查询任务列表，不扣积分）
export type SmithyMode = 'local' | 'server';
const LOCAL_WHY = '本地版不在线生成';
export const smithyMode = (): SmithyMode => apiUrl() ? 'server' : 'local';
const LS_KEY = 'darkrock_lux_key', LUX = 'https://api.aholo3d.cn';
const luxKey = (): string => { try { return (localStorage.getItem(LS_KEY) ?? '').trim(); } catch { return ''; } };
const TYPE_PROMPT: Record<string, string> = { sword: '单手长剑', greatsword: '双手巨剑', axe: '单手战斧', greataxe: '双手巨斧', mace: '单手钉头锤', staff: '长法杖', wand: '短魔杖', dagger: '匕首', chakram: '圆形投掷飞刃', flask: '投掷药剂瓶', orb: '法术宝珠', tome: '魔法书', bow: '长弓' };
/** v1.2.54 按提示词识别武器类型：[关键词, 类型]。项目没有的类型映射到最接近的：
 *  盾不识别（没有盾的模型，按主手）；矛 / 枪 / 戟 / 镰 → 双手巨斧（双手长柄）；弩 → 弓；巨锤 / 大锤 → 单手锤（保住锤头造型） */
export const SMITHY_TYPE_KW: [string, string][] = [
  ['单手剑', 'sword'], ['长剑', 'sword'], ['细剑', 'sword'], ['刺剑', 'sword'], ['佩剑', 'sword'], ['弯刀', 'sword'], ['军刀', 'sword'], ['剑', 'sword'], ['刀', 'sword'],
  ['巨剑', 'greatsword'], ['大剑', 'greatsword'], ['双手剑', 'greatsword'], ['重剑', 'greatsword'], ['大刀', 'greatsword'], ['长刀', 'greatsword'], ['斩马刀', 'greatsword'], ['太刀', 'greatsword'],
  ['斧', 'axe'], ['战斧', 'axe'], ['手斧', 'axe'], ['单手斧', 'axe'], ['飞斧', 'axe'],
  ['巨斧', 'greataxe'], ['大斧', 'greataxe'], ['双手斧', 'greataxe'], ['重斧', 'greataxe'], ['开山斧', 'greataxe'],
  ['矛', 'greataxe'], ['长矛', 'greataxe'], ['枪', 'greataxe'], ['长枪', 'greataxe'], ['戟', 'greataxe'], ['长戟', 'greataxe'], ['镰', 'greataxe'], ['镰刀', 'greataxe'],
  ['锤', 'mace'], ['战锤', 'mace'], ['钉头锤', 'mace'], ['巨锤', 'mace'], ['大锤', 'mace'], ['槌', 'mace'], ['狼牙棒', 'mace'], ['连枷', 'mace'], ['棍', 'mace'],
  ['匕首', 'dagger'], ['匕', 'dagger'], ['短刀', 'dagger'], ['短剑', 'dagger'], ['短刃', 'dagger'],
  ['杖', 'staff'], ['法杖', 'staff'], ['权杖', 'staff'], ['长杖', 'staff'], ['手杖', 'staff'],
  ['魔杖', 'wand'], ['短杖', 'wand'], ['魔棒', 'wand'], ['法棒', 'wand'],
  ['弓', 'bow'], ['长弓', 'bow'], ['短弓', 'bow'], ['弩', 'bow'], ['十字弩', 'bow'],
  ['轮刃', 'chakram'], ['飞刃', 'chakram'], ['圆刃', 'chakram'], ['环刃', 'chakram'], ['时轮', 'chakram'], ['飞轮', 'chakram'],
  ['药瓶', 'flask'], ['药剂', 'flask'], ['药水', 'flask'], ['瓶', 'flask'],
  ['宝珠', 'orb'], ['法球', 'orb'], ['法珠', 'orb'], ['水晶球', 'orb'],
  ['法典', 'tome'], ['魔法书', 'tome'], ['法书', 'tome'], ['典籍', 'tome'], ['魔典', 'tome'],
];
/** 识别提示词里的武器类型：取最后出现的关键词（中文中心词在后）；同一位置结尾的取最长（最具体）。识别不到 → null（调用方退回主手类型） */
export function smithyDetectType(prompt: string): string | null {
  const p = (prompt ?? '').trim(); let best: { end: number; len: number; type: string } | null = null;
  for (const [w, t] of SMITHY_TYPE_KW) {
    for (let i = p.indexOf(w); i >= 0; i = p.indexOf(w, i + 1)) {
      const end = i + w.length;
      if (!best || end > best.end || (end === best.end && w.length > best.len)) best = { end, len: w.length, type: t };
    }
  }
  return best?.type ?? null;
}
/** 与服务端 cloud/forge-fc buildPrompt 一致 */
export const smithyBuildPrompt = (p: string, type: string) => `${p}。一把${TYPE_PROMPT[type] || '武器'}，暗黑奇幻游戏武器道具，单件完整、无底座、无手、白色背景，造型清晰。`;
/** 测试 Key 的结果（全部中文；英文原始错误只进 console） */
export type KeyPing = { ok: boolean; kind: 'ok' | 'nokey' | 'auth' | 'net' | 'busy' | 'odd'; text: string };
const PING_NOTE = '（测试只查询任务列表，不扣积分）';
export const KEY_PING_TEXT = {
  ok: (n: number | string) => `Key 正确，已连上 Lux3D（账户里有 ${n} 个历史任务）。注意：本地版仍然不能在线生成，想在线生成请双击『启动铸造服务』或用魔搭版${PING_NOTE}`,
  nokey: `还没有填写 Key，请先粘贴再测试${PING_NOTE}`,
  auth: `Key 错误或已过期：Lux3D 拒绝了这个 Key，请到 Aholo 开放平台核对后重新粘贴${PING_NOTE}`,
  net: `连不上 Lux3D：浏览器拦截了接口的响应（跨域限制），或者网络不通。这是本地版的正常现象——本地版不能在线生成（在这里生成会扣积分却拿不到模型），请用「导入本地 GLB」或预置武器库；想在线生成请双击『启动铸造服务』（或用魔搭版）${PING_NOTE}`,
  busy: `Lux3D 接口繁忙或超时，请稍后再试${PING_NOTE}`,
  odd: (st: number) => `Lux3D 返回了无法识别的结果（状态码 ${st}），请稍后再试${PING_NOTE}`,
};
const AUTH_RE = /auth|token|unauthor|forbidden|key|鉴权|认证|授权|无效|过期|权限|签名/i;
export async function smithyKeyPing(fetcher0?: typeof fetch): Promise<KeyPing> {
  if (!luxKey()) return { ok: false, kind: 'nokey', text: KEY_PING_TEXT.nokey };
  const fetcher = fetcher0 ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  let r: Response;
  try { r = await fetcher(LUX + '/lux3d/v1/generate/task/list?page=1&pageSize=1', { method: 'GET', headers: { Authorization: luxKey() }, signal: AbortSignal.timeout?.(45000) }); }
  catch (e) {
    console.warn('[smithy] key ping', e);
    const n = (e as Error)?.name;
    if (n === 'TimeoutError' || n === 'AbortError') return { ok: false, kind: 'busy', text: KEY_PING_TEXT.busy };
    return { ok: false, kind: 'net', text: KEY_PING_TEXT.net };
  }
  let j: { c?: string | number; m?: string; d?: { total?: number } } | null = null;
  try { j = JSON.parse(await r.text()); } catch (e) { console.warn('[smithy] key ping: 响应不是 JSON', r.status, e); }
  if (r.status === 401 || r.status === 403) { console.warn('[smithy] key ping', r.status, j?.m); return { ok: false, kind: 'auth', text: KEY_PING_TEXT.auth }; }
  if (r.status === 429 || r.status >= 500) { console.warn('[smithy] key ping', r.status, j?.m); return { ok: false, kind: 'busy', text: KEY_PING_TEXT.busy }; }
  if (!r.ok || !j) { console.warn('[smithy] key ping', r.status, j); return { ok: false, kind: 'odd', text: KEY_PING_TEXT.odd(r.status) }; }
  if (j.c != null && String(j.c) !== '0') {
    console.warn('[smithy] key ping: 接口返回', j.c, j.m);
    return AUTH_RE.test(String(j.m ?? '')) || /^(401|403|1001|1002|1003)$/.test(String(j.c)) ? { ok: false, kind: 'auth', text: KEY_PING_TEXT.auth } : { ok: false, kind: 'busy', text: KEY_PING_TEXT.busy };
  }
  return { ok: true, kind: 'ok', text: KEY_PING_TEXT.ok(typeof j.d?.total === 'number' ? j.d.total : '若干') };
}
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // 北京时间的「今天」，与服务端一致
function usedToday(): number { try { const o = JSON.parse(localStorage.getItem(LS_DAY) ?? '{}'); return o.d === today() ? o.n ?? 0 : 0; } catch { return 0; } }
function useOne() { try { localStorage.setItem(LS_DAY, JSON.stringify({ d: today(), n: usedToday() + 1 })); } catch { /* 忽略 */ } }
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const trunc = (s: string, n = SMITHY.nameLen) => { const a = [...s.trim()]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

/** v1.2.46 未取回的在线任务（拿到 taskId 就存，取回 / 确认失败才删） */
export interface ForgePending { taskId: string; prompt: string; type: string; api: string; t: number; readyAt?: number }
export function smithyPending(): ForgePending | null {
  try { const o = JSON.parse(localStorage.getItem(LS_PENDING) ?? 'null') as ForgePending | null; if (!o?.taskId) return null; if (Date.now() - o.t > 47 * 3600e3) { localStorage.removeItem(LS_PENDING); return null; } return o; } catch { return null; }
}
const setPending = (p: ForgePending | null) => { try { if (p) localStorage.setItem(LS_PENDING, JSON.stringify(p)); else localStorage.removeItem(LS_PENDING); } catch { /* 忽略 */ } };

/** v1.2.41 握法分组：只能换同组外观（单手近战 / 双手重武器 / 施法杖 / 轮刃 / 药瓶），避免药瓶、轮刃塞进剑手里 */
const FAMILY: Record<string, string> = { sword: 'm1', axe: 'm1', mace: 'm1', dagger: 'm1', greatsword: 'm2', greataxe: 'm2', staff: 'cast', wand: 'cast', chakram: 'chakram', flask: 'flask' };
const fam = (t: string) => FAMILY[t] ?? t;
/** 11-05 猎手弓位：铸造品和职业的远程副手（弓）同组 → 外观进副手（弓位），否则按主手 */
const slotType = (made: string | null | undefined, main: string | null): string | null => { const o = ctx?.weaponSkin?.offType?.() ?? null; return made && o && fam(made) === fam(o) ? o : main; };
const famLib = (type: string | null) => { const lib = ctx?.weaponSkin?.library() ?? []; if (!type) return lib; const f = fam(type); return lib.filter(l => fam(l.type) === f); };
export const smithyFamily = famLib;
/** 离线退回：关键词 → 武器库里最接近的一把（同类型优先），没有关键词按描述哈希挑一把 */
export function smithyPickOffline(prompt: string, type: string | null): string | null {
  const lib = famLib(type); if (!lib.length) return null;
  // v1.2.54 按提示词识别的类型优先（只在主手能用的同组武器里挑）
  const want = smithyDetectType(prompt), wl = want ? lib.filter(l => l.type === want) : [];
  // 11-17 离线武器库的件带自己的关键词：同类型里命中关键词最多的优先（并列按描述哈希挑）
  const kwHit = (pool: { key: string }[]) => { let best: string[] = [], bn = 0; for (const l of pool) { const it = OFFLINE_LIB.find(i => i.key === l.key); const n = it ? it.kw.filter(w => prompt.includes(w)).length : 0; if (n > bn) { bn = n; best = [l.key]; } else if (n && n === bn) best.push(l.key); } return best.length ? best[hash(prompt) % best.length] : null; };
  if (wl.length) { const kh = kwHit(wl); if (kh) return kh; for (const [re, keys] of KW) if (re.test(prompt)) { const k = keys.find(x => wl.some(l => l.key === x)); if (k) return k; } return wl[hash(prompt) % wl.length].key; }
  { const kh = kwHit(lib); if (kh) return kh; }
  const has = new Set(lib.map(l => l.key));
  for (const [re, keys] of KW) if (re.test(prompt)) { const k = keys.find(x => has.has(x)); if (k) return k; }
  const same = lib.filter(l => l.type === type);
  const pool = same.length ? same : lib;
  return pool[hash(prompt) % pool.length].key;
}

export type SmithyResult = { ok: boolean; key?: string; type?: string; worn?: boolean; detected?: string | null; online: boolean; msg: string; name?: string; why?: string; taskId?: string; resumed?: boolean; queued?: boolean; readyAt?: number };
export type SmithyProgress = (text: string, state?: string) => void;
type Fetcher = typeof fetch;
/** 下载失败 / 断网：任务保留在 pending 里（下次打开铸造台续取） */
class Keep extends Error {}

/** 分块下载（Range 2MB）：服务端不支持 Range（返回 200）就整包；每块失败重试 3 次 */
async function fetchChunks(fetcher: Fetcher, url: string, onProg?: SmithyProgress): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = []; let off = 0, total = -1;
  while (total < 0 || off < total) {
    let r: Response | null = null, err = '';
    for (let k = 0; k < 3 && !r; k++) {
      try { const g = await fetcher(url, { headers: { Range: `bytes=${off}-${off + SMITHY.chunk - 1}` } }); if (g.ok) r = g; else { err = `HTTP ${g.status}`; if (g.status === 404) break; } }
      catch (e) { err = (e as Error)?.message || '网络错误'; }
      if (!r && k < 2) await new Promise(res => setTimeout(res, 800));
    }
    if (!r) throw new Keep(`模型下载失败（${err}）`);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (r.status === 200) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(r.headers.get('Content-Range') ?? '');
    if (!m || +m[1] !== off) throw new Keep('模型分块不连续');
    total = +m[3]; parts.push(buf); off += buf.byteLength;
    onProg?.(`取回模型 ${(off / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`, 'chunk');
  }
  const out = new Uint8Array(off); let p = 0; for (const u of parts) { out.set(u, p); p += u.byteLength; }
  return out.buffer;
}

/** 跟进一个在线任务直到取回 / 失败 / 超时 */
async function follow(fetcher: Fetcher, pd: ForgePending, onProg?: SmithyProgress): Promise<{ buf: ArrayBuffer; hdUrl?: string } | { fail: string }> {
  const B = base(pd.api), t0 = Date.now(); let netErr = 0;
  const label: Record<string, string> = { queued: '排队中', generating: 'Lux3D 生成中', downloading: '服务端取回并压缩模型' };
  while (Date.now() - t0 < SMITHY.timeoutMs) {
    let j: { state?: string; error?: string; url?: string; hdUrl?: string; elapsed?: number; size?: number; retry?: boolean } = {}, code = 0;
    try { const r = await fetcher(`${B}/forge/status/${pd.taskId}`, { cache: 'no-store' } as RequestInit); code = r.status; j = await r.json().catch(() => ({})); netErr = 0; }
    catch { if (++netErr >= 5) throw new Keep('连不上铸造服务'); }
    if (code === 404) return { fail: j.error ?? '服务端没有这个任务（可能已过期）' };
    if (code && code >= 400) { if (++netErr >= 5) throw new Keep(`铸造服务返回 ${code}`); }
    if (j.state === 'failed' && j.retry) throw new Keep(j.error ?? '模型下载失败');   // 模型已生成、只是服务端下载失败：保留任务，下次续取
    if (j.state === 'failed') return { fail: j.error ?? '生成失败' };
    if (j.state === 'done' && j.url) {
      onProg?.('模型已就绪，开始取回……', 'downloading');
      const url = /^https?:/i.test(j.url) ? j.url : new URL(j.url, B + '/').href;
      return { buf: await fetchChunks(fetcher, url, onProg), hdUrl: j.hdUrl ? (/^https?:/i.test(j.hdUrl) ? j.hdUrl : new URL(j.hdUrl, B + '/').href) : undefined };
    }
    if (j.state) onProg?.(`${label[j.state] ?? j.state}…… 已 ${j.elapsed ?? Math.round((Date.now() - pd.t) / 1000)} 秒${j.state === 'generating' || j.state === 'queued' ? '（约 30–60 秒）' : ''}`, j.state);
    await new Promise(res => setTimeout(res, SMITHY.pollMs));
  }
  throw new Keep('生成超时');
}

/** 铸造：有未取回的任务 → 续取（不重复生成）；有服务且没超限 → 在线生成；否则 / 失败 → 武器库 */
export async function smithyRun(prompt: string, fetcher0?: Fetcher, apply = true, onProg?: SmithyProgress): Promise<SmithyResult> {
  const fetcher = fetcher0 ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const ws = ctx?.weaponSkin;
  // v1.2.54 只有魔搭版（有铸造服务）才联网；本地版连续取都不做（老的直连任务只会在浏览器里失败）
  const api = smithyMode() === 'server' ? apiUrl() : '', pend0 = smithyPending();
  const pend = pend0 && api && base(pend0.api) === base(api) ? pend0 : null;
  const p = (pend ? pend.prompt : prompt).trim().slice(0, SMITHY.maxLen);
  if (!ws) return { ok: false, online: false, msg: '铸造台需要比赛版写实模型' };
  const type = ws.mainType();
  if (!type) return { ok: false, online: false, msg: '先装备一把主手武器' };
  const det = smithyDetectType(p), ftype = det ?? type;   // v1.2.54 在线生成的类型按提示词识别，识别不到才按主手
  if (!p) return { ok: false, online: false, msg: '写一句武器描述，比如「缠着海藻的锈蚀锚形巨斧」' };
  if (BAN.some(w => p.includes(w))) return { ok: false, online: false, msg: '描述里有不能用的词，换一句吧' };
  const fallback = (why: string, taskId?: string): SmithyResult => {
    const k = smithyPickOffline(p, type);
    if (k) setWeaponFxPrompt(k, p);   // 11-19 武器库件也按这句提示词挂雷电 / 光效
    if (!k || !ws.has(k) || (apply && !ws.set(type, k))) return { ok: false, online: false, why, taskId, msg: `在线生成失败：${why}，武器库也没有可用的模型` };
    const name = `武器库·${KEY_NAME[k] ?? k}`;
    return { ok: true, key: k, type, online: false, why, taskId, name, msg: `在线生成失败：${why}，已从武器库挑一把「${name}」` };
  };
  let pd: ForgePending;
  if (pend) { pd = pend; onProg?.(`续取上次的铸造「${trunc(pd.prompt)}」……`, 'resume'); }
  else {
    if (!api) { const r = fallback(LOCAL_WHY); return r.ok ? { ...r, msg: `本地版：从武器库挑了最接近的一把「${r.name}」（本地版不在线生成；可以「导入本地 GLB」；想在线生成请双击『启动铸造服务』）` } : r; }
    if (!claimCfg.local && usedToday() >= SMITHY.dailyOnline) return fallback(`今天的 ${SMITHY.dailyOnline} 次在线铸造已用完`);
    let r: Response, j: { taskId?: string | number; error?: string; claim?: boolean; eta?: number } = {};
    try {
      r = await fetcher(base(api) + '/forge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p, weaponType: ftype, dev: devId() }), signal: AbortSignal.timeout?.(45000) });
      j = await r.json().catch(() => ({}));
    } catch (e) { return fallback((e as Error)?.name === 'TimeoutError' ? '铸造服务没有响应' : '连不上铸造服务'); }
    if (!r.ok || j.error || !j.taskId) return fallback(j.error ? j.error : `铸造服务返回 ${r.status}`);
    pd = { taskId: String(j.taskId), prompt: p, type: ftype, api: base(api), t: Date.now() };
    if (j.claim) pd.readyAt = Date.now() + (j.eta ?? 120) * 1000;
    setPending(pd); useOne();   // 拿到 taskId = 请求已发出 = 积分已花：立刻计次 + 记下来以便续取
    onProg?.('任务已提交，炉火正旺……', 'queued');
    // v1.2.47 定时领取：不在这里等，交给铸造台倒计时 + 回来领取
    if (j.claim) { claimCfg.claim = true; armReadyToast(pd); return { ok: true, online: true, queued: true, taskId: pd.taskId, readyAt: pd.readyAt, name: trunc(p), type: ftype, detected: det, msg: `炉火锻造中：「${trunc(p)}」约 ${fmtLeft((pd.readyAt ?? 0) - Date.now())} 后可以来领取，期间可以离开去做别的` }; }
  }
  let res: { buf: ArrayBuffer; hdUrl?: string } | { fail: string };
  try { res = await follow(fetcher, pd, onProg); }
  catch (e) {
    const why = (e as Error)?.message || '连不上铸造服务';
    return { ...fallback(`${why}（任务已保留，下次打开铸造台会自动续取，不会重复扣次数）`, pd.taskId), resumed: !!pend };
  }
  if ('fail' in res) { setPending(null); return { ...fallback(res.fail, pd.taskId), resumed: !!pend }; }
  const key = 'forge_' + pd.taskId, name = trunc(pd.prompt);
  if (!(await ws.load(key, res.buf, { name, prompt: pd.prompt, type: pd.type, date: Date.now(), size: res.buf.byteLength, taskId: pd.taskId }))) { setPending(null); return fallback('模型解析失败', pd.taskId); }
  setPending(null);
  // v1.2.54 高精度版（展示窗用）后台下载：失败 / 晚到都不影响游戏版换上
  if (res.hdUrl) { const hu = res.hdUrl; void forgeHdStart(key, () => fetchChunks(fetcher, hu)); }
  // 识别出的类型与主手不同组（或续取时主手已换成别的类别）→ 只收进「我的铸造品」，不硬套
  const tt = slotType(pd.type, type) ?? type, t = fam(pd.type) === fam(tt) ? tt : null;   // 11-05 弓 / 弩 → 弓位
  if (apply && t) ws.set(t, key);
  return { ok: true, key, type: t ?? pd.type, worn: !!t, detected: det, online: true, name, taskId: pd.taskId, resumed: !!pend, msg: t ? `铸造完成：「${name}」已换上` : notWornMsg(pd.type, type) };
}
/** v1.2.54 生成的武器与主手不同组：只入库 */
export const notWornMsg = (made: string, main: string) => `这把是${TYPE_NAME[made] ?? made}，当前主手是${TYPE_NAME[main] ?? main}，已收进「我的铸造品」，换同类武器后可换上`;
/** 铸造台输入框下方的识别提示 */
export function smithyDetectLabel(prompt: string, main: string | null): string {
  const d = smithyDetectType(prompt);
  const m2 = slotType(d, main);   // 11-05 猎手：弓 / 弩进弓位
  if (d) return `识别为：${TYPE_NAME[d] ?? d}（按提示词）${m2 === 'bow' && main !== 'bow' ? '　·　铸好后换到弓位' : ''}${main && m2 && fam(d) !== fam(m2) ? `　·　与当前主手（${TYPE_NAME[main] ?? main}）不同类，铸好后收进「我的铸造品」` : ''}`;
  return main ? `未识别，按主手：${TYPE_NAME[main] ?? main}` : '未识别武器类型';
}

// ---------------------------------------------------------------- 面板
const TYPE_NAME: Record<string, string> = { sword: '单手剑', greatsword: '双手剑', axe: '单手斧', greataxe: '双手斧', mace: '单手锤', staff: '法杖', wand: '魔杖', dagger: '匕首', chakram: '时轮刃', flask: '药瓶', orb: '宝珠', tome: '法典', bow: '弓' };
const KEY_NAME: Record<string, string> = { ...Object.fromEntries(OFFLINE_LIB.map(i => [i.key, i.name])), weapon_bell_sword: '沉钟长剑', weapon_bell_staff: '钟铜法杖', weapon_rock_greatsword: '暗岩巨剑', weapon_rock_axe: '暗岩战斧', weapon_rock_greataxe: '暗岩巨斧', weapon_rock_mace: '暗岩钉锤', weapon_rock_wand: '暗岩魔杖', weapon_rock_dagger: '暗岩匕首', weapon_time_chakram: '时砂轮刃', weapon_flask: '炼金药瓶', weapon_rock_orb: '暗岩宝珠', weapon_rock_tome: '暗岩法典' };
const CSS = `
#d1-forge{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(0,8,12,.55)}
#d1-forge .fw{width:min(980px,96vw);max-height:90vh;overflow:auto;background:linear-gradient(#10232a,#0a1418);border:2px solid #4ab8c8;border-radius:12px;padding:16px 18px;color:#e8f4f4;font-size:14px;box-sizing:border-box}
#d1-forge h3{margin:0 0 4px;color:#ffd070;font-size:20px}#d1-forge h3 .mode{margin-left:10px;vertical-align:middle;font-size:12px;font-weight:600;padding:2px 9px;border-radius:10px}#d1-forge h3 .mode.local{color:#ffe0a0;background:#3a2a10;border:1px solid #c8a050}#d1-forge h3 .mode.server{color:#bff;background:#0e3a32;border:1px solid #4ac8a8}#d1-forge h4{margin:14px 0 6px;color:#ffd070;font-size:16px}#d1-forge .sub{color:#9fc8c8;font-size:12px;margin-bottom:10px}
#d1-forge input{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:8px;border:1px solid #4ab8c8;background:#06121a;color:#fff;font-size:15px}
#d1-forge .row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
#d1-forge .btn{padding:8px 14px;border-radius:8px;border:1px solid #c8a050;background:#3a2a10;color:#ffe9a8;cursor:pointer}
#d1-forge .btn:disabled{opacity:.45;cursor:default}
#d1-forge .btn.s{border-color:#4ab8c8;background:#0e2a32;color:#bff}#d1-forge .btn.d{border-color:#c86050;background:#3a1410;color:#ffc0b0}
#d1-forge .lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-top:8px}
#d1-forge .lib .li{border:1px solid #4a5a5a;border-radius:6px;padding:6px;background:#0d1a1c}#d1-forge .lib .ln{font-size:13px;margin-bottom:4px}#d1-forge .lib .b{display:flex;gap:4px}
#d1-forge .lib .btn{font-size:12px;flex:1}#d1-forge .on{outline:2px solid #ffd070}
#d1-forge .msg{min-height:20px;margin-top:10px;color:#9ff0ff}#d1-forge .msg.w{color:#ffb090}
#d1-forge .msg.ok,#d1-forge .msg.bad{padding:8px 10px;border-radius:8px;font-weight:600}#d1-forge .msg.ok{color:#7dff8a;background:rgba(40,170,70,.18);border:1px solid #3fbf5a}#d1-forge .msg.bad{color:#ff6b5e;background:rgba(200,50,40,.18);border:1px solid #d0503f}#d1-forge .x{float:right;cursor:pointer;font-size:22px;color:#9fc8c8}
#d1-forge details{margin-top:12px;color:#9fc8c8;font-size:12px}
#d1-forge .mine{display:flex;gap:12px;align-items:flex-start}
#d1-forge .pv{flex:0 0 320px;height:320px;border:1px solid #2a5a64;border-radius:10px;background:radial-gradient(#1e3a44,#071016);position:relative;overflow:hidden}
#d1-forge .pv canvas{width:320px;height:320px;display:block;cursor:zoom-in}#d1-forge .pv .hdtag{position:absolute;top:6px;left:6px;padding:1px 8px;border-radius:9px;font-size:11px;font-weight:600;color:#cfe;background:#24424a}#d1-forge .pv .hdtag.on{color:#1a1206;background:#ffd070}#d1-forge .pv .big{position:absolute;top:4px;right:4px;padding:2px 8px;font-size:12px}#d1-forge .pv .pn{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:12px;color:#ffe9a8;text-shadow:0 0 4px #000}
#d1-forge .cards{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;max-height:300px;overflow:auto}
#d1-forge .card{display:flex;gap:8px;padding:6px;border:1px solid #2a5a64;border-radius:8px;background:#0b1c22}
#d1-forge .card img,#d1-forge .card .ph{width:72px;height:72px;border-radius:6px;background:#071016;flex:0 0 72px;object-fit:cover}
#d1-forge .card .t{font-size:13px;color:#ffe9a8;line-height:1.35;word-break:break-all}#d1-forge .card small{color:#8fb8b8;font-size:11px}
#d1-forge .card .b{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap}#d1-forge .card .btn{padding:3px 8px;font-size:12px}
`;
let wrap: HTMLDivElement | null = null, msg = '', msgWarn = false, msgOk = false, msgBad = false, busy = false, sel: string | null = null, delArm: string | null = null;
/** 最近一次铸造提示（测试 / 截图用） */
export const smithyLastToast = { text: '', color: '' };
/** 最近的进度文字（测试用，最多 60 条） */
export const smithyProgressLog: string[] = [];
export const smithyOpen = () => !!wrap;
export const smithyLib = () => ctx?.weaponSkin?.library() ?? [];
/** v1.2.46 我的铸造品：在线生成过的模型（描述、日期、类型、大小），新的在前 */
export const smithyItems = () => (ctx?.weaponSkin?.list?.() ?? []).filter(i => i.key.startsWith('forge_')).map(i => ({ key: i.key, ...(i.meta as { name?: string; prompt?: string; type?: string; date?: number; size?: number; taskId?: string }) }));
/** 测试 / 截图：把当前主手外观换成武器库里的 key */
export const smithyPickSet = (key: string, force = false) => { const ws = ctx?.weaponSkin, t = ws?.mainType(); if (!ws || !t || (!force && !famLib(t).some(l => l.key === key))) return false; return !!ws.set(t, key); };
/** 换上一件铸造品（主手类别要相同） */
export function smithyWear(key: string): string {
  const ws = ctx?.weaponSkin, it = smithyItems().find(i => i.key === key), t = slotType(it?.type, ws?.mainType() ?? null);   // 11-05 弓进弓位
  if (!ws || !t || !it) return '没有这件铸造品';
  if (it.type && fam(it.type) !== fam(t)) return `这件是${TYPE_NAME[it.type] ?? it.type}，当前主手是${TYPE_NAME[t] ?? t}，换同类武器后再换上`;
  if (!ws.has(key) || !ws.set(t, key)) return '模型还没加载好';
  return `换上了「${it.name ?? '铸造品'}」`;
}
/** 删除一件铸造品（同时删 IndexedDB；正在用就退回原外观） */
export async function smithyDelete(key: string): Promise<boolean> {
  const ws = ctx?.weaponSkin; if (!ws?.remove) return false;
  await ws.remove(key); await forgeHdDel(key); thumbs.delete(key); if (sel === key) sel = null; return true;
}

// ---- 小 3D 预览（单个共享 WebGL 画布：缩略图渲染一次缓存成图片；选中的那件在大框里慢慢转）
const thumbs = new Map<string, string>();
let pv: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; holder: THREE.Group; raf: number; key: string | null } | null = null;
function pvInit() {
  if (pv) return pv;
  let r: THREE.WebGLRenderer;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return null; }
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(320, 320, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.environment = propEnv();
  scene.add(new THREE.AmbientLight(0xffffff, 0.7)); const k = new THREE.DirectionalLight(0xfff0d8, 2.2); k.position.set(2, 3, 4); scene.add(k);
  const f = new THREE.DirectionalLight(0x7fd8ff, 1.0); f.position.set(-3, 1, -2); scene.add(f);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50); cam.position.set(0, 0, 4.2);
  const holder = new THREE.Group(); scene.add(holder);
  pv = { r, scene, cam, holder, raf: 0, key: null }; return pv;
}
function pvShow(key: string | null) {
  const P = pvInit(); if (!P) return false;
  if (P.key !== key) {
    P.holder.clear(); P.key = key;
    const m = key ? makeGlbProp(key, 2.2, 0.5) : null;
    if (m) { m.rotation.z = 0.25; P.holder.add(m); }
  }
  return !!P.holder.children.length;
}
function thumbOf(key: string): string {
  const c = thumbs.get(key); if (c) return c;
  const P = pvInit(); if (!P) return '';
  const prev = P.key; if (!pvShow(key)) { pvShow(prev); return ''; }
  P.holder.rotation.y = 0.6; P.r.render(P.scene, P.cam);
  const url = P.r.domElement.toDataURL('image/png'); thumbs.set(key, url);
  pvShow(prev); return url;
}
function pvLoop() {
  if (!pv) return; cancelAnimationFrame(pv.raf);
  const tick = () => { if (!pv || !wrap) return; pv.holder.rotation.y += 0.012; pv.r.render(pv.scene, pv.cam); pv.raf = requestAnimationFrame(tick); };
  pv.raf = requestAnimationFrame(tick);
}
function pvStop() { if (pv) { cancelAnimationFrame(pv.raf); pv.r.dispose(); pv.r.forceContextLoss?.(); pv = null; } }

export function closeSmithy() { wrap?.remove(); wrap = null; pvStop(); if (tickIv) { clearInterval(tickIv); tickIv = 0; } window.removeEventListener('keydown', onKey, true); }
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && hdViewerState.open) { e.stopImmediatePropagation(); e.preventDefault(); closeHdViewer(); return; } if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeSmithy(); } }
export function openSmithy() {
  if (!document.getElementById('d1-forge-css')) { const st = document.createElement('style'); st.id = 'd1-forge-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!wrap) {
    wrap = document.createElement('div'); wrap.id = 'd1-forge';
    const stop = (e: Event) => e.stopPropagation();
    ['mousedown', 'mousemove', 'touchstart', 'touchmove', 'pointerdown', 'pointermove', 'wheel', 'contextmenu', 'keydown', 'keyup', 'keypress'].forEach(k => wrap!.addEventListener(k, stop));
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('input', e => { const f = e.target as HTMLInputElement; if (f.id !== 'fg-p') return; const d = wrap?.querySelector('#fg-det'); if (d) d.textContent = smithyDetectLabel(f.value, ctx?.weaponSkin?.mainType() ?? null); });   // v1.2.54 实时显示识别类型
    wrap.addEventListener('change', e => { const f = e.target as HTMLInputElement; if (f.id !== 'fg-file' || !f.files?.[0]) return; const file = f.files[0]; f.value = ''; void file.arrayBuffer().then(buf => smithyImportGlb(buf, file.name)); });
    document.body.appendChild(wrap); window.addEventListener('keydown', onKey, true);
  }
  msg = ''; msgWarn = false; msgOk = false; msgBad = false; render();
  void (async () => {
    // v1.2.47 版本自检（老页面自动保存并刷新）+ 定时领取模式：查本设备的任务，开始倒计时
    if (apiUrl() && httpPage() && await smithyCheckVersion() === 'reload') { msg = '游戏已更新，正在保存并刷新……'; render(); return; }
    if (apiUrl() && !claimCfg.known) { await loadCfg(); if (wrap && !busy) render(); }
    if (claimCfg.claim) { await refreshMine(); if (wrap) { render(); startTick(); } return; }
    smithyResume();
  })();
}
function smithyResume() {
  if (!wrap) return;
  // v1.2.46 断点续取：上次拿到 taskId 但没取回（关页 / 断网 / 下载失败）→ 自动接着取，不重复生成
  const pd = smithyPending();
  if (pd && !busy && ctx?.weaponSkin?.mainType()) { msg = `发现上次未取回的铸造「${trunc(pd.prompt)}」，正在续取（不会重复扣次数）……`; render(); setTimeout(() => { if (!busy) void smithyForge(pd.prompt); }, 600); }
}
const fmtDate = (t?: number) => { if (!t) return ''; const d = new Date(t + 8 * 3600e3); return d.toISOString().slice(5, 16).replace('T', ' '); };
function render() {
  if (!wrap) return;
  const ws = ctx?.weaponSkin, type = ws?.mainType() ?? null, lib = famLib(type), cur = type ? ws?.get(type) : null;
  const prev = (wrap.querySelector('#fg-p') as HTMLInputElement | null)?.value ?? '';
  const mode = smithyMode(), online = mode === 'server', left = claimCfg.local ? 99 : Math.max(0, SMITHY.dailyOnline - usedToday()), items = smithyItems();
  const curName = cur ? (KEY_NAME[cur] ?? items.find(i => i.key === cur)?.name ?? '铸造品') : '';
  if (sel && !items.some(i => i.key === sel)) sel = null;
  if (!sel && items.length) sel = cur && items.some(i => i.key === cur) ? cur : items[0].key;
  const selIt = items.find(i => i.key === sel);
  const forgingNow = claimCfg.claim && smithyForging.some(t => t.state !== 'failed' || t.retry);
  wrap.innerHTML = `<div class="fw"><span class="x" data-a="x" title="关闭（Esc）">×</span><h3>铸造台<span class="mode ${mode}" id="fg-mode">${online ? (claimCfg.local ? '本机铸造服务 · 在线生成' : '魔搭版 · 在线生成') : '本地版 · 不在线生成'}</span></h3>
  <div class="sub">写一句话，铸一把武器的外观（只换外观，不改属性）。当前主手：${type ? TYPE_NAME[type] ?? type : '没有'}${cur ? ` · 已换外观：${curName}` : ''}<br>${online ? `在线铸造（Lux3D，${claimCfg.claim ? `锻造约 ${fmtLeft(claimCfg.eta * 1000)}，提交后可离开，到点回来领取` : '约 30–60 秒'}）${claimCfg.local ? ' · 使用你自己的 Aholo Key，每次约消耗 13 积分（以 Aholo 账户实际扣除为准）' : ` · 今天还能在线铸 ${left} 次`}` : '本地版不能在线生成（Aholo 接口跨域限制，在这里生成会扣积分却拿不到模型）。点「铸造」从预置武器库挑最接近的一把，或者「导入本地 GLB」。<br><b style="color:#ffd070">想在线生成请双击『启动铸造服务』</b>：关掉这个网页，双击评委包里的「启动铸造服务.exe」（macOS / Linux：node 启动铸造服务.js），它会自动打开 http://127.0.0.1:17860/ （Windows 弹出「已保护你的电脑」时点「更多信息」→「仍要运行」）；在铸造台底部填自己的 Aholo Key、点「保存并测试」后再铸造，生成好的模型自动取回。玩的时候别关它的黑色窗口，关掉窗口即退出。'}</div>
  ${!lib.length ? '<div class="msg">铸造台需要比赛版写实模型。</div>' : `
  <input id="fg-p" maxlength="${SMITHY.maxLen}" placeholder="例：缠着海藻的锈蚀锚形巨斧" value="${prev.replace(/"/g, '&quot;')}">
  <div class="sub" id="fg-det" style="margin:4px 0 0">${smithyDetectLabel(prev, type)}</div>
  <div class="row"><button class="btn" data-a="go" ${busy || !type || forgingNow ? 'disabled' : ''}>${busy ? '铸造中……' : forgingNow ? '炉里还有一把' : online ? '铸造' : '铸造（武器库）'}</button><button class="btn s" data-a="import" ${busy || !type ? 'disabled' : ''} title="选一个 .glb 文件（不联网、不扣积分）：贴图压到 1024，播成形演出后收进「我的铸造品」">导入本地 GLB</button><input type="file" id="fg-file" accept=".glb,model/gltf-binary" style="display:none"><button class="btn s" data-a="reset" ${cur ? '' : 'disabled'}>恢复原外观</button></div>
  <div class="msg${msgOk ? ' ok' : msgBad ? ' bad' : msgWarn ? ' w' : ''}">${msg}</div>
  <div class="cards" id="fg-forging" style="margin-top:6px">${forgingHtml()}</div>
  <h4 id="fg-mine">我的铸造品（${items.length}）</h4>
  ${items.length ? `<div class="mine"><div class="pv" id="fg-pv" data-a="big" title="点击放大查看（可拖动旋转）"><span class="hdtag${sel && forgeHdHas(sel) ? ' on' : ''}" id="fg-hdtag">${sel && forgeHdHas(sel) ? '高精度预览' : '游戏版预览'}</span><button class="btn s big" data-a="big">大图</button><div class="pn">${selIt ? (selIt.name ?? '').replace(/</g, '&lt;') : ''}</div></div><div class="cards">${items.map(i => `<div class="card ${cur === i.key ? 'on' : ''}" data-k="${i.key}">
    <img data-thumb="${i.key}" alt="">
    <div><div class="t">${(i.name ?? '铸造品').replace(/</g, '&lt;')}</div><small>${TYPE_NAME[i.type ?? ''] ?? i.type ?? ''} · ${fmtDate(i.date)}${i.size ? ` · ${(i.size / 1048576).toFixed(1)}MB` : ''}</small>
    <div class="b"><button class="btn s" data-a="view" data-k="${i.key}" title="全窗口查看（拖动旋转 · 滚轮缩放 · 右键平移）">查看</button><button class="btn" data-a="wear" data-k="${i.key}" ${type && (!i.type || fam(i.type) === fam(slotType(i.type, type) ?? type)) && cur !== i.key ? '' : 'disabled'}>${cur === i.key ? '已换上' : '换上'}</button><button class="btn d" data-a="del" data-k="${i.key}">${delArm === i.key ? '确认删除' : '删除'}</button></div></div></div>`).join('')}</div></div>`
    : '<div class="sub">还没有在线铸造过。铸造成功的武器会收在这里，可以随时预览、换上或删除；导出存档时一并导出。</div>'}
  <h4>武器库（查看模型，或换上当前主手同类武器）</h4>
  <div class="lib">${lib.map(l => `<div class="li ${cur === l.key ? 'on' : ''}"><div class="ln">${KEY_NAME[l.key] ?? libName(l.key) ?? l.key}<br><small>${TYPE_NAME[l.type] ?? l.type}</small></div><div class="b"><button class="btn s" data-a="libview" data-k="${l.key}" title="全窗口查看（拖动旋转 · 滚轮缩放 · 右键平移）">查看</button><button class="btn s" data-a="pick" data-k="${l.key}" ${type && cur !== l.key ? '' : 'disabled'}>${cur === l.key ? '已换上' : '换上'}</button></div></div>`).join('')}</div>
  <details><summary>铸造服务地址（自己部署的铸造服务，Key 只在服务端）</summary><div class="row"><input id="fg-api" placeholder="https://xxx.modelscope.cn" value="${apiUrl()}"><button class="btn s" data-a="api">保存</button><button class="btn s" data-a="ping">测试连接</button></div></details>
  ${online && claimCfg.local ? `<details id="fg-lkbox"${claimCfg.hasKey ? '' : ' open'}><summary>本机铸造服务的 Aholo Key（${claimCfg.hasKey ? '已填写 ' + claimCfg.masked : '还没填写，在线生成前请先填'}）</summary><div class="row"><input id="fg-lkey" type="password" autocomplete="off" placeholder="粘贴 Aholo（Lux3D）Key" value=""><label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#9fc8c8"><input type="checkbox" id="fg-lrem" style="width:auto">记在本机</label><button class="btn s" data-a="lkey">保存并测试</button><button class="btn s" data-a="lkeyping">测试 Key</button><button class="btn d" data-a="lkeyclr" ${claimCfg.hasKey ? '' : 'disabled'}>清除</button><button class="btn s" data-a="lcheck" title="只读本机文件：任务状态、模型是否完整、目录能否写入（不联网、不扣积分）">检查本机任务</button></div><div class="sub" style="margin-top:6px">Key 只发给本机的「启动铸造服务」（127.0.0.1），由它转发到 Aholo 官方接口，不上传任何第三方；勾选「记在本机」才会写到本机用户目录。测试只查询任务列表，不扣积分；每次铸造前服务会先测 Key，测不通不会发起生成。</div></details>` : ''}
  ${online ? '' : `<details id="fg-keybox"><summary>测试 Aholo Key（只查询任务列表，不扣积分；本地版不能用 Key 在线生成）</summary><div class="row"><input id="fg-key" type="password" autocomplete="off" placeholder="粘贴 Aholo（Lux3D）Key" value="${luxKey() ? '••••••••' + luxKey().slice(-4) : ''}"><button class="btn s" data-a="key">保存并测试</button><button class="btn s" data-a="keyping">测试 Key</button><button class="btn d" data-a="keyclr" ${luxKey() ? '' : 'disabled'}>清除</button></div><div class="sub" style="margin-top:6px">Key 只保存在本机浏览器。测试只查询任务列表，不会生成、不扣积分。想在线生成请双击『启动铸造服务』，Key 只发给本机服务。</div></details>`}`}
  </div>`;
  // 缩略图 + 旋转预览
  if (items.length) {
    wrap.querySelectorAll<HTMLImageElement>('img[data-thumb]').forEach(img => { const u = thumbOf(img.dataset.thumb!); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph' })); });
    const box = wrap.querySelector('#fg-pv'); const P = pvInit();
    if (box && P) { pvShow(sel); box.prepend(P.r.domElement); pvLoop();
      // v1.2.54 有高精度版就换成高精度模型（懒加载，不阻塞面板）；没有就保持游戏版
      const s0 = sel; if (s0) void forgeHdEnsure(s0).then(ok => { if (!ok || !wrap || sel !== s0) return; pvShow(hdKey(s0)); const tg = wrap.querySelector('#fg-hdtag'); if (tg) { tg.textContent = '高精度预览'; tg.classList.add('on'); } }); }
  }
}
async function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
  if (!el) return;   // v1.2.54 Rhett：只能点 × 或按 Esc 关（以前点到遮罩就关：在输入框里拖选文字、按下后移出面板松开都会被当成点遮罩）
  const a = el.dataset.a, ws = ctx?.weaponSkin, type = ws?.mainType(), k = el.dataset.k!;
  if (a !== 'del') delArm = null;
  msgWarn = false; msgOk = false; msgBad = false;
  if (a === 'x') return closeSmithy();
  if (a === 'pick' && ws && type) { ws.set(type, k); msg = `换上了「${KEY_NAME[k] ?? k}」`; }
  if (a === 'reset' && ws && type) { ws.set(type, null); msg = '已恢复原外观'; }
  if (a === 'view') sel = k;   // 11-17 Rhett：点「预览」直接开全窗口查看（高精度版优先，缺了可一键取回）
  if ((a === 'big' || a === 'view') && sel) { const s0 = sel; msg = ''; await openForgeViewer(s0); return; }   // v1.2.54 大图（高精度版优先）
  if (a === 'libview') {   // 11-17 Rhett「铸造台现在无法查看模型」：武器库各件也能全窗口查看（离线武器库先读盘登记）
    if (isLibKey(k)) await ensureLib(k);
    if (!openHdViewer(k, KEY_NAME[k] ?? libName(k) ?? '武器库', false)) { msg = '这件模型还没加载好，稍等几秒再点「查看」'; msgWarn = true; render(); }
    return;
  }
  if (a === 'wear') { sel = k; msg = smithyWear(k); }
  if (a === 'del') { if (delArm !== k) { delArm = k; msg = '再点一次「确认删除」（模型会从本机删除，不能恢复）'; msgWarn = true; } else { delArm = null; const nm = smithyItems().find(i => i.key === k)?.name; await smithyDelete(k); msg = `已删除「${nm ?? '铸造品'}」`; } }
  if (a === 'api') { const v = (wrap?.querySelector('#fg-api') as HTMLInputElement | null)?.value.trim() ?? ''; try { if (v) localStorage.setItem(LS_API, v); else localStorage.removeItem(LS_API); } catch { /* 忽略 */ } msg = v ? '铸造服务地址已保存' : '已清除铸造服务地址（离线模式）'; }
  if (a === 'ping') { msg = await smithyPing(); }
  if (a === 'key') { const v = (wrap?.querySelector('#fg-key') as HTMLInputElement | null)?.value.trim() ?? ''; if (v && !v.startsWith('••')) { try { localStorage.setItem(LS_KEY, v); } catch { /* 忽略 */ } msg = 'Key 已保存在本机，正在测试（只查询任务列表，不扣积分）……'; render(); const k = await smithyKeyPing(); msg = k.text; msgOk = k.ok; msgBad = !k.ok; } else if (!v) { msg = '请先粘贴 Key'; msgWarn = true; } }
  if (a === 'keyping') { msg = '正在测试 Key（只查询任务列表，不扣积分）……'; render(); const k = await smithyKeyPing(); msg = k.text; msgOk = k.ok; msgBad = !k.ok; }
  if (a === 'lkey' || a === 'lkeyclr') {
    const v = a === 'lkeyclr' ? '' : ((wrap?.querySelector('#fg-lkey') as HTMLInputElement | null)?.value.trim() ?? ''), rem = !!(wrap?.querySelector('#fg-lrem') as HTMLInputElement | null)?.checked;
    if (a === 'lkey' && !v) { msg = '请先粘贴 Key'; msgWarn = true; }
    else { msg = a === 'lkey' ? '正在把 Key 交给本机铸造服务并测试（只查询任务列表，不扣积分）……' : '正在清除……'; render(); const k = await smithyLocalKey(v, rem); msg = k.text; msgOk = k.ok; msgBad = !k.ok; }
  }
  if (a === 'lcheck') { msg = '正在检查本机铸造任务（只读本机文件，不联网、不扣积分）……'; render(); const c = await smithyLocalCheck(); msg = c.text; msgOk = c.ok; msgBad = !c.ok; }
  if (a === 'lkeyping') { msg = '正在测试 Key（只查询任务列表，不扣积分）……'; render(); const k = await smithyLocalKey(null); msg = k.text; msgOk = k.ok; msgBad = !k.ok; }
  if (a === 'import') { (wrap?.querySelector('#fg-file') as HTMLInputElement | null)?.click(); return; }
  if (a === 'keyclr') { try { localStorage.removeItem(LS_KEY); } catch { /* 忽略 */ } msg = '已清除本机保存的 Key'; }
  if (a === 'dismiss') { await dismissTask(k); msg = ''; }
  if (a === 'go' && !busy) {
    const p = (wrap?.querySelector('#fg-p') as HTMLInputElement | null)?.value ?? '';
    busy = true; msg = '炉火正旺……'; render();
    await smithyForge(p);
    return;
  }
  render();
}

/** v1.2.42 惊艳铸造：熔炉演出（等待期翻腾 → 成形溶解 → 飞入主手）+ 铸造。离线 / 秒出的结果也至少翻腾 2.6 秒再成形
 *  v1.2.46：演出底部文字显示真实进度（排队 / 生成中 xx 秒 / 取回 x/y MB）；退回武器库时标题写「武器库·xxx」、字幕写失败 */
export const SHOW = { minBrew: 2600, hdWait: 20000 };
export async function smithyForge(prompt: string, fetcher?: typeof fetch): Promise<SmithyResult> {
  busy = true;
  if (apiUrl() && !claimCfg.known) await loadCfg();
  if (claimCfg.claim) {   // v1.2.47 定时领取：提交后不演出、不等待，铸造台显示倒计时
    // v1.2.73 有铸造 CG：① + ② 播约 FORGE_CG.claimPreview 毫秒后收起，再显示倒计时（回来领取时播 ③ + 成形）
    const pv = (ctx?.weaponSkin?.mainType() && prompt.trim()) ? startForgeShow({ synth: () => ctx?.synth?.() }) : null;
    const pcg = pv ? startForgeCg(pv, { musicDim: k => ctx?.musicDim?.(k) }) : null;
    if (pv && !pcg) pv.cancel();
    if (pv && pcg) { closeSmithy(); pv.setStatus(`排队中　·　「${trunc(prompt.trim())}」`); }
    const t0c = Date.now();
    const r = await smithyRun(prompt, fetcher, true);
    if (pv && pcg) { const w = FORGE_CG.claimPreview - (Date.now() - t0c); if (w > 0 && pcg.ok()) await new Promise(res => setTimeout(res, w)); pcg.stop(); pv.cancel(); }
    busy = false; msg = r.msg; msgWarn = !r.online; msgOk = false; msgBad = false;
    smithyLastToast.text = r.msg; smithyLastToast.color = r.queued ? '#ffd070' : '#ff9a70'; ctx?.toast(r.msg, smithyLastToast.color);
    if (r.queued) await refreshMine();
    if (wrap) { render(); startTick(); }
    return r;
  }
  const pd = smithyPending(), shownPrompt = (pd?.prompt ?? prompt).trim();
  const show = (ctx?.weaponSkin && ctx.weaponSkin.mainType() && shownPrompt) ? startForgeShow({ synth: () => ctx?.synth?.() }) : null;
  if (show) closeSmithy();
  // v1.2.73 铸造 CG：① 投纸 → ② 熔炼循环（续传从 ②）；没有视频 / 播不了 → null，照旧熔岩 brew
  const cg = show ? startForgeCg(show, { from: pd ? 'loop' : 'drop', musicDim: k => ctx?.musicDim?.(k) }) : null;
  const t0 = Date.now();
  show?.setStatus(`炉火锻造中　·　「${trunc(shownPrompt)}」`);
  const r = await smithyRun(prompt, fetcher, !show, (txt) => { smithyProgressLog.push(txt); if (smithyProgressLog.length > 60) smithyProgressLog.shift(); show?.setStatus(`${forgeStageWord(txt)}　·　「${trunc(shownPrompt)}」`); });   // 字幕只留阶段词（Rhett 10-31）
  const ws = ctx?.weaponSkin;
  if (show) {
    if (r.ok && r.key && r.type && ws) {
      const local = r.why === LOCAL_WHY;
      if (!r.online) show.setStatus(local ? '本地版 · 从武器库取出最接近的一把' : '炉火未通 · 从武器库取出一把');
      const sk = r.online ? await forgeHdWait(r.key, SHOW.hdWait) : { key: r.key, hd: false };   // v1.2.54 展示用高精度版（最多等 SHOW.hdWait；武器库没有高精度版）（GLB 就绪才进 ③）
      // 在线成功 / 本地版武器库 → ③ 出炉；在线失败退武器库 → ④ 熄炉 → ③（Rhett 10-31：不做重铸按钮）
      if (cg && (await cg.finish(r.online || local ? 'ok' : 'fail'))) { show.setStatus('出炉'); show.overlay(); }
      else { const wait = SHOW.minBrew - (Date.now() - t0); if (wait > 0) await new Promise(res => setTimeout(res, wait)); }
      await show.reveal(sk.key, r.name ?? KEY_NAME[r.key] ?? trunc(shownPrompt), r.online ? '成形！' : local ? '本地版 · 从武器库取出一把' : '炉火未通 · 从武器库取出一把', { hd: sk.hd });
      const t = ws.mainType(); if (t && (!r.online || fam(r.type) === fam(t))) ws.set(t, r.key);
      offerForgeCard(shownPrompt, !!r.online);   // v1.2.52 铸造分享卡
    } else { if (cg) await cg.finish('none'); show.cancel(); }
    cg?.stop();
  }
  busy = false; msg = r.msg; msgWarn = !r.online; msgOk = false; msgBad = false;
  const toast = (text: string, color: string) => { smithyLastToast.text = text; smithyLastToast.color = color; ctx?.toast(text, color); };
  if (r.ok && r.online) { toast(r.worn === false ? r.msg : `铸造完成：「${r.name}」`, '#ffd070'); if (!show) ctx?.synth?.()?.tone({ f: 660, type: 'triangle', dur: 0.4, gain: 0.05, d: 0.35 }); }
  else toast(r.msg, '#ff9a70');
  if (wrap) render();
  return r;
}

/** v1.2.54 导入本地 GLB（不联网、不扣积分）：贴图压到 1024 JPEG（同服务端 glbslim）→ 登记成铸造品 → 成形演出 → 换上
 *  名字 = 输入框里写的描述，没写就用文件名；武器类型 = 当前主手；文件名带 forge_<任务号> 时沿用任务号（同一把不会重复） */
export const SMITHY_IMPORT = { maxMB: 64 };
export const smithyImportLog: string[] = [];
export async function smithyImportGlb(buf: ArrayBuffer, fileName = 'model.glb'): Promise<SmithyResult> {
  const ws = ctx?.weaponSkin, type = ws?.mainType() ?? null;
  const done = (r: SmithyResult) => { busy = false; msg = r.msg; msgWarn = !r.ok; msgOk = r.ok; msgBad = !r.ok; smithyLastToast.text = r.msg; smithyLastToast.color = r.ok ? '#ffd070' : '#ff9a70'; ctx?.toast(r.msg, smithyLastToast.color); if (wrap) render(); return r; };
  if (busy) return { ok: false, online: false, msg: '炉里正忙，稍后再导入' };
  if (!ws) return done({ ok: false, online: false, msg: '铸造台需要比赛版写实模型' });
  if (!type) return done({ ok: false, online: false, msg: '先装备一把主手武器，再导入模型' });
  if (!isGlb(buf)) return done({ ok: false, online: false, msg: `「${fileName}」不是 GLB 模型文件（要 .glb 格式）` });
  if (buf.byteLength > SMITHY_IMPORT.maxMB * 1048576) return done({ ok: false, online: false, msg: `文件太大（${(buf.byteLength / 1048576).toFixed(1)}MB），最多 ${SMITHY_IMPORT.maxMB}MB` });
  busy = true; msg = `正在导入「${fileName}」：压缩贴图……`; msgWarn = false; msgOk = false; msgBad = false; render();
  const typed = ((wrap?.querySelector('#fg-p') as HTMLInputElement | null)?.value ?? '').trim();
  const stem = fileName.replace(/\.glb$/i, '').trim();
  const id = /forge_(\d+)/.exec(stem)?.[1];
  const name = trunc(typed || (id ? `导入的铸造品 ${id}` : stem) || '导入的模型');
  const key = id ? `forge_${id}` : `forge_imp_${Date.now().toString(36)}`;
  const { buf: slim0, info } = await slimGlbWeb(buf);
  const { buf: slim, info: dec } = await decimateGlbWeb(slim0);   // v1.2.55 游戏版（手持）减面到 6000 面；高精度版保留原始几何
  const hdBuf = (await slimGlbWeb(buf, { maxSize: 2048, quality: 0.9 })).buf;   // v1.2.54 高精度版：原始几何 + 2048 贴图（展示窗用）
  smithyImportLog.push(`${fileName}: ${(info.before / 1048576).toFixed(1)}MB → ${(info.after / 1048576).toFixed(1)}MB ${info.images.join('; ')}${info.error ? ' 错误：' + info.error : ''}；面数 ${dec.trisBefore} → ${dec.trisAfter}${dec.skip ? '（' + dec.skip + '）' : ''}${dec.error ? '（减面出错，用未减面版：' + dec.error + '）' : ''}`);
  console.log('[smithy] import', smithyImportLog[smithyImportLog.length - 1]);
  const show = startForgeShow({ synth: () => ctx?.synth?.() });
  if (show) { closeSmithy(); show.setStatus(`导入本地模型「${name}」　·　贴图 ${(info.before / 1048576).toFixed(1)}MB → ${(info.after / 1048576).toFixed(1)}MB`); }
  const t0 = Date.now();
  if (ws.has(key)) await ws.remove?.(key);
  const loaded = await ws.load(key, slim, { name, prompt: typed || stem, type, date: Date.now(), size: slim.byteLength, ...(id ? { taskId: id } : {}), imported: 1 });
  if (!loaded) { show?.cancel(); return done({ ok: false, online: false, msg: `「${fileName}」模型解析失败，换一个 GLB 试试` }); }
  await forgeHdDel(key); const hdOk = await forgeHdSave(key, hdBuf);
  if (show) {
    const wait = SHOW.minBrew - (Date.now() - t0); if (wait > 0) await new Promise(res => setTimeout(res, wait));
    await show.reveal(hdOk ? hdKey(key) : key, name, '成形！', { hd: hdOk });
  }
  ws.set(type, key); thumbs.delete(key); sel = key;
  if (!show) ctx?.synth?.()?.tone({ f: 660, type: 'triangle', dur: 0.4, gain: 0.05, d: 0.35 });
  return done({ ok: true, online: false, key, type, name, taskId: id, msg: `导入完成：「${name}」已换上，收进「我的铸造品」（贴图 ${(info.before / 1048576).toFixed(1)}MB → ${(info.after / 1048576).toFixed(1)}MB，不联网、不扣积分）` });
}

/** 11-17 全窗口查看：高精度版优先；没有高精度版且这件是在线铸造的（有 taskId、连着铸造服务）→ 查看窗里给「取回高精度版」按钮：
 *  先直接取 glb/<taskId>/hd（服务端保留 48 小时）；本机铸造服务取不到时再请它向 Lux3D 续取（只查任务 + 下载，不发起生成、不扣积分） */
async function openForgeViewer(key: string): Promise<void> {
  const it = smithyItems().find(i => i.key === key), sk = await forgeShowKey(key), api = apiUrl();
  const fetchHd = it?.taskId && api && !sk.hd ? async (prog: (t: string) => void): Promise<string> => {
    const id = encodeURIComponent(it.taskId!), fetcher: Fetcher = (...a) => globalThis.fetch(...a), hu = base(api) + '/glb/' + id + '/hd';
    let buf: ArrayBuffer | null = null;
    try { buf = await fetchChunks(fetcher, hu, t => prog(t)); } catch { buf = null; }
    if (!buf && claimCfg.local) {
      prog('服务端没有留存，正在向 Lux3D 续取（不扣积分）……');
      try { const r = await fetcher(base(api) + '/forge/refetch/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string }; if (!j.ok) return j.error || '续取失败'; buf = await fetchChunks(fetcher, hu, t => prog(t)); }
      catch (e) { return (e as Error)?.message || '续取失败'; }
    }
    if (!buf) return '服务端已经没有这件的高精度版（在线铸造的模型保留 48 小时）';
    if (!(await forgeHdSave(key, buf))) return '高精度版解析失败';
    const s2 = await forgeShowKey(key); openHdViewer(s2.key, it.name ?? '铸造品', s2.hd); return '';
  } : undefined;
  openHdViewer(sk.key, it?.name ?? '铸造品', sk.hd, fetchHd);
}

/** 11-17 本机任务检查：GET /forge/check（只读本机文件，不联网、不扣积分）→ 一句中文结论 + 问题 + 建议 */
export async function smithyLocalCheck(fetcher: typeof fetch = globalThis.fetch): Promise<{ ok: boolean; text: string }> {
  const api = apiUrl(); if (!api) return { ok: false, text: '没有连接本机铸造服务' };
  try {
    const r = await fetcher(base(api) + '/forge/check', { cache: 'no-store' });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; summary?: string; problems?: string[]; tips?: string[]; error?: string; dir?: string; writable?: boolean };
    if (!r.ok || !j.summary) return { ok: false, text: j.error || `本机铸造服务返回了无法识别的结果（状态码 ${r.status}）` };
    const p = (j.problems ?? []).slice(0, 3), t = (j.tips ?? []).slice(0, 2);
    return { ok: !!j.ok, text: `本机铸造任务：${j.summary}${p.length ? '。问题：' + p.join('；') : ''}${t.length ? '。建议：' + t.join('；') : ''}` };
  } catch (e) { console.warn('[smithy] local check', e); return { ok: false, text: '连不上本机铸造服务，没能检查' }; }
}
/** v1.2.54 本机铸造服务（评委包「启动铸造服务」）：把 Key 交给 127.0.0.1 服务（key=null 只测试；'' = 清除）。返回全中文 */
export async function smithyLocalKey(key: string | null, remember = false): Promise<KeyPing> {
  const api = apiUrl(); if (!api) return { ok: false, kind: 'net', text: '没有连接本机铸造服务' };
  try {
    const r = key === null ? await globalThis.fetch(base(api) + '/forge/key/test', { cache: 'no-store' }) : await globalThis.fetch(base(api) + '/forge/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, remember }) });
    const j = await r.json().catch(() => ({})) as { ok?: boolean; kind?: KeyPing['kind'] | 'cleared'; text?: string };
    claimCfg.known = false; await loadCfg();
    if (!j.text) return { ok: false, kind: 'odd', text: `本机铸造服务返回了无法识别的结果（状态码 ${r.status}）` };
    return { ok: !!j.ok, kind: (j.kind === 'cleared' ? 'ok' : j.kind) ?? 'odd', text: j.text };
  } catch (e) { console.warn('[smithy] local key', e); return { ok: false, kind: 'net', text: '连不上本机铸造服务：请确认「启动铸造服务」的窗口还开着' }; }
}
/** v1.2.43 测试连接：GET <地址>/health（不花积分）→ 是否读到 Key、今天全服已用 / 上限；v1.2.46 带最近一次结果 */
export async function smithyPing(fetcher0?: typeof fetch): Promise<string> {
  const api = apiUrl(); if (!api) return '还没有填铸造服务地址';
  const fetcher = fetcher0 ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  try {
    const r = await fetcher(base(api) + '/health', { signal: AbortSignal.timeout?.(10000) });
    const j = await r.json() as { local?: boolean; ok?: boolean; used?: number; limit?: number; perIp?: number; last?: { time?: string; state?: string; error?: string | null } | null };
    if (!r.ok) return `铸造服务返回 ${r.status}`;
    const last = j.last ? `；最近一次 ${j.last.time ?? ''} ${j.last.state === 'done' ? '成功' : `失败（${j.last.error ?? '未知原因'}）`}` : '';
    if (j.local) return j.ok ? `已连接本机铸造服务（已填写 Key）${last}` : '已连接本机铸造服务，但还没有填写 Key：请在下方「本机铸造服务的 Aholo Key」里填写';
    return j.ok ? `已连接：今天全服在线铸造 ${j.used ?? 0} / ${j.limit ?? '?'} 次（每人 ${j.perIp ?? '?'} 次）${last}` : '连上了，但服务端没有配置 Key（环境变量 AHOLO_API_KEY）';
  } catch { return '连不上铸造服务（检查地址）'; }
}

// ---------------------------------------------------------------- v1.2.47 定时领取模式 + 版本自检
/** 服务端模式（/health 或 POST /forge 回的 claim / eta）；known = 已问过服务端 */
export const claimCfg = { claim: false, eta: 120, known: false, local: false, hasKey: false, masked: '' };
type ForgeTask = { taskId: string; state: string; prompt?: string; type?: string; readyAt?: number; url?: string; hdUrl?: string; size?: number; error?: string; retry?: boolean; ready: number };
/** 本设备还没领取的任务（ready = 本地时钟的可领取时刻） */
export let smithyForging: ForgeTask[] = [];
let claiming: string | null = null, tickIv = 0, lastMine = 0, mineBusy = false;
const toastTimers = new Map<string, number>();

export function devId(): string {
  try {
    let d = localStorage.getItem(LS_DEV);
    if (!d || !/^[A-Za-z0-9_-]{6,64}$/.test(d)) { d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_DEV, d); }
    return d;
  } catch { return ''; }
}
const fmtLeft = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒` : `${s} 秒`; };
const httpPage = () => { try { return /^https?:$/.test(location.protocol); } catch { return false; } };
const fetchJ = async (url: string, init?: RequestInit) => { const r = await globalThis.fetch(url, { cache: 'no-store', ...init } as RequestInit); return { status: r.status, j: await r.json().catch(() => ({})) as Record<string, unknown> }; };

/** 到点提醒（玩家不在铸造台时也弹一次） */
function armReadyToast(pd: { taskId: string; prompt: string; readyAt?: number }) {
  if (!pd.readyAt || toastTimers.has(pd.taskId)) return;
  const id = window.setTimeout(() => { toastTimers.delete(pd.taskId); if (!wrap) ctx?.toast(`「${trunc(pd.prompt)}」锻造好了，回铸造台领取`, '#ffd070'); }, Math.max(0, pd.readyAt - Date.now()) + 500);
  toastTimers.set(pd.taskId, id);
}

/** 页面版本与服务端不符 → 自动保存并刷新（每个版本只刷新一次，避免循环）。dry = 只返回判断结果（测试用） */
export async function smithyCheckVersion(dry = false): Promise<'same' | 'reload' | 'skip'> {
  const api = apiUrl(); if (!api) return 'skip';
  let ver = '';
  try { const { status, j } = await fetchJ(base(api) + '/version', { signal: AbortSignal.timeout?.(8000) }); if (status !== 200) return 'skip'; ver = String(j.ver ?? ''); } catch { return 'skip'; }
  if (!ver || ver === GAME_VERSION) return ver ? 'same' : 'skip';
  if (dry) return 'reload';
  const k = 'darkrock_reload_' + ver;
  try { if (sessionStorage.getItem(k)) return 'skip'; sessionStorage.setItem(k, '1'); } catch { return 'skip'; }
  try { ctx?.save(); } catch { /* 忽略 */ }
  ctx?.toast(`游戏已更新到 ${ver}，进度已保存，正在刷新……`, '#ffd070');
  setTimeout(() => location.reload(), 1500);
  return 'reload';
}
/** 问服务端模式（不花积分） */
async function loadCfg(): Promise<void> {
  const api = apiUrl(); if (!api) return;
  try { const { status, j } = await fetchJ(base(api) + '/health', { signal: AbortSignal.timeout?.(8000) }); if (status === 200) { claimCfg.claim = !!j.claim; claimCfg.eta = Number(j.eta) || 120; claimCfg.known = true; claimCfg.local = !!j.local; claimCfg.hasKey = !!j.hasKey; claimCfg.masked = String(j.masked ?? ''); } } catch { /* 连不上：按即时模式 */ }
}
/** 启动：版本自检；定时领取模式下查一次本设备的任务，挂到点提醒 */
async function smithyBoot() {
  if (!apiUrl()) return;
  if (httpPage() && await smithyCheckVersion() === 'reload') return;
  await loadCfg();
  if (claimCfg.claim) { await refreshMine(); for (const t of smithyForging) if (t.state !== 'failed') armReadyToast({ taskId: t.taskId, prompt: t.prompt ?? '', readyAt: t.ready }); }
}
/** GET /forge/mine：本设备（或老页面同 IP）还没领取的任务 */
export async function refreshMine(): Promise<boolean> {
  const api = apiUrl(); if (!api || mineBusy) return false;
  mineBusy = true; lastMine = Date.now();
  try {
    const { status, j } = await fetchJ(`${base(api)}/forge/mine?dev=${encodeURIComponent(devId())}`, { signal: AbortSignal.timeout?.(10000) });
    if (status !== 200) return false;
    const skew = Date.now() - (Number(j.now) || Date.now());
    smithyForging = ((j.tasks as Omit<ForgeTask, 'ready'>[]) ?? []).map(t => ({ ...t, taskId: String(t.taskId), ready: (t.readyAt ?? 0) + skew }));
    const pd = smithyPending(); if (pd && !smithyForging.some(t => t.taskId === pd.taskId)) setPending(null);   // 服务端说已领取 / 过期
    return true;
  } catch { return false; } finally { mineBusy = false; }
}
const postClaimed = async (id: string) => { const api = apiUrl(); if (!api) return; try { await globalThis.fetch(`${base(api)}/forge/claimed/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dev: devId() }) }); } catch { /* 下次再领 */ } };

/** 领取：分块取回 → 登记 → 熔炉成形画面 → 换上 → 告诉服务端已领取 */
export async function smithyClaim(t: ForgeTask, fetcher0?: Fetcher): Promise<SmithyResult> {
  const fetcher = fetcher0 ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const api = apiUrl(), ws = ctx?.weaponSkin, prompt = t.prompt ?? '铸造品', name = trunc(prompt), key = 'forge_' + t.taskId;
  const toast = (text: string, color: string) => { smithyLastToast.text = text; smithyLastToast.color = color; ctx?.toast(text, color); };
  if (!api || !ws || !t.url) return { ok: false, online: true, msg: '还不能领取' };
  claiming = t.taskId; busy = true;
  msg = `开炉取出「${name}」……`; msgWarn = false; msgOk = false; msgBad = false; render();
  let buf: ArrayBuffer;
  try { buf = await fetchChunks(fetcher, /^https?:/i.test(t.url) ? t.url : new URL(t.url, base(api) + '/').href, (txt) => { msg = `开炉取出「${name}」：${txt}`; updForging(); }); }
  catch (e) { claiming = null; busy = false; msg = `取回「${name}」没成功（${(e as Error)?.message ?? '网络问题'}），稍后再打开铸造台会自动重试，不会重复扣次数`; msgWarn = true; render(); return { ok: false, online: true, msg }; }
  if (!(await ws.load(key, buf, { name, prompt, type: t.type ?? '', date: Date.now(), size: buf.byteLength, taskId: t.taskId }))) {
    claiming = null; busy = false; await postClaimed(t.taskId); smithyForging = smithyForging.filter(x => x.taskId !== t.taskId);
    msg = `「${name}」模型解析失败`; msgWarn = true; render(); toast(`铸造失败：「${name}」模型解析失败`, '#ff9a70'); return { ok: false, online: true, msg };
  }
  await postClaimed(t.taskId);
  if (t.hdUrl) { const hu = /^https?:/i.test(t.hdUrl) ? t.hdUrl : new URL(t.hdUrl, base(api) + '/').href; void forgeHdStart(key, () => fetchChunks(fetcher, hu)); }   // v1.2.54 高精度版后台取
  smithyForging = smithyForging.filter(x => x.taskId !== t.taskId);
  const pd = smithyPending(); if (pd?.taskId === t.taskId) setPending(null);
  const cur = slotType(t.type, ws.mainType()), wear = !!cur && !!t.type && fam(t.type) === fam(cur);   // 11-05 弓进弓位
  const show = cur ? startForgeShow({ synth: () => ctx?.synth?.() }) : null;
  if (show) {
    closeSmithy();
    show.setStatus(`出炉　·　「${name}」`);
    const sk = await forgeHdWait(key, SHOW.hdWait);
    // v1.2.73 回来领取：直接 ③ 出炉 + 成形；没有视频 → 照旧熔岩 brew
    const cg = startForgeCg(show, { from: 'rise', musicDim: k => ctx?.musicDim?.(k) });
    if (cg && (await cg.finish('ok'))) show.overlay();
    else await new Promise(res => setTimeout(res, SHOW.minBrew));
    await show.reveal(sk.key, name, '成形！', { hd: sk.hd });
    cg?.stop();
  }
  if (wear) ws.set(cur!, key);
  claiming = null; busy = false;
  const text = wear ? `铸造完成：「${name}」` : cur && t.type ? notWornMsg(t.type, cur) : `铸造完成：「${name}」已收进「我的铸造品」（当前主手类别不同，没有换上）`;
  msg = text; msgWarn = false; toast(text, '#ffd070');
  if (!show) ctx?.synth?.()?.tone({ f: 660, type: 'triangle', dur: 0.4, gain: 0.05, d: 0.35 });
  if (wrap) render();
  return { ok: true, online: true, key, type: t.type, worn: wear, name, taskId: t.taskId, msg: text };
}
/** 失败的任务：玩家点「知道了」后不再显示 */
async function dismissTask(id: string) { await postClaimed(id); smithyForging = smithyForging.filter(x => x.taskId !== id); const pd = smithyPending(); if (pd?.taskId === id) setPending(null); }

function forgingHtml(): string {
  if (!claimCfg.claim || !smithyForging.length) return '';
  const now = Date.now();
  return smithyForging.map(t => {
    const nm = (trunc(t.prompt ?? '铸造品')).replace(/</g, '&lt;');
    let st: string, btn = '';
    if (t.state === 'failed' && !t.retry) { st = `锻造失败：${(t.error ?? '未知原因').replace(/</g, '&lt;')}`; btn = `<button class="btn s" data-a="dismiss" data-k="${t.taskId}">知道了</button>`; }
    else if (claiming === t.taskId) st = '正在开炉取出……';
    else if (now < t.ready) st = `炉火锻造中 · <b>${fmtLeft(t.ready - now)}</b> 后可以领取（可以先离开，到点回来打开铸造台）`;
    else if (t.state === 'done') st = '锻造完成，正在开炉……';
    else st = '炉火还差一点，马上就好……';
    return `<div class="card fg-task" data-t="${t.taskId}"><div class="ph" style="display:flex;align-items:center;justify-content:center;font-size:30px">🔥</div><div><div class="t">${nm}</div><small>${st}</small><div class="b">${btn}</div></div></div>`;
  }).join('');
}
function updForging() { const el = wrap?.querySelector('#fg-forging'); if (el) el.innerHTML = forgingHtml(); const m = wrap?.querySelector('.msg'); if (m) m.innerHTML = msg; }
/** 铸造台开着时每秒刷新倒计时；到点且服务端已完成 → 自动领取；到点还没好 → 每 3 秒问一次服务端 */
function startTick() {
  if (tickIv) return;
  tickIv = window.setInterval(() => {
    if (!wrap) { clearInterval(tickIv); tickIv = 0; return; }
    updForging();
    if (claiming || !claimCfg.claim) return;
    const now = Date.now();
    const due = smithyForging.find(t => now >= t.ready && t.state === 'done');
    if (due) { void smithyClaim(due).catch(e => { claiming = null; busy = false; msg = `开炉出了点问题（${(e as Error)?.message ?? e}），稍后再打开铸造台会自动重试`; msgWarn = true; console.error('[smithy] claim', e); if (wrap) render(); }); return; }
    if (smithyForging.some(t => now >= t.ready - 1000 && t.state !== 'failed' || t.retry) && now - lastMine > SMITHY.pollMs) void refreshMine().then(() => { if (wrap) render(); });
  }, 1000);
}
