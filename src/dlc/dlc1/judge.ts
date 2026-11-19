// v1.2.53 评委 3 分钟通道：标题「⚡ 评委快速体验」→ 40 级写实战士、整套紫装 → 倒钟广场
// 三步引导：① 一句话铸造武器（打开铸造台）② 拿新武器挑战世界首领潮汐巨鲸 ③ 拍照留念（P）
// v1.2.54 Rhett：三个按钮任何时候都能反复点、反复体验（打勾只是显示，不锁按钮）；
//   面板默认放在左上头像下方（不压小地图、右上圆按钮 / 菜单下拉、技能栏），标题栏可拖动（鼠标 + 触屏），位置存 localStorage；
//   点 ✕ 收起后，左上头像下留一个「评委体验」小按钮，点一下重新打开；进度不受开关影响
// 体验角色伤害 ×3、承伤 ×0.5（只对这个角色生效，存档 dlc.dlc1.demo = 1）
import type { PackCtx, PackDemo } from '../../core/ContentPacks';
import { MIRROR_ID, MIRROR_O, MIRROR_WILD } from './mirror';
import { campLandWorld } from './camp_land';
import { openSmithy } from './smithy';
import { forgeShowState } from './forgeshow';
import { wbDebug, wbArena } from './worldboss';
import { wellJudgeTail, wellJudgeEnter, WELL_MAP, WELL_DG, WELL_WILD } from './raid_well';
import { FORGE_DG } from './forge';
import { COAST_ID } from './coast';
import { BT_ID } from './belltower';
import { S40_BY_CLASS, S40_PIECES_OF } from './sets40';
import { DARK_BY_CLASS } from './gear40';
import { echoGiveAll, ECHO_DEFS } from './echomark';
import { HUNTER_ID } from './hunter_skills';
import { COFFIN_ID } from './coffin_skills';
/** 评委版巨鲸战场：镜渊城湖岸（湖心 58,44 西岸，背景是湖面 + 钟乳石） */
const WHALE_L = { x: 34, z: 14 };   // 背景：钟楼 + 镜湖；离镜像碎影群（10,24）和 NPC 都够远
export function judgeWhaleArena() { wbArena.dwb_whale = { map: MIRROR_ID, O: MIRROR_O, x: WHALE_L.x, z: WHALE_L.z, arena: '镜湖西岸', spawn: '潮汐巨鲸从镜湖里浮了上来！它背上的三口沉钟同时响了。' }; }

// fix1109c #4（Rhett 11-09 18:04：评委快速体验建不了时砂 / 炼金 / 猎手，「名字最多 8 个字」）：title.ts startDemo 把角色名拼成「DEMO_NAME·职业名」，
//   原「评委体验·时砂行者」9 字 / 「评委体验·炼金投弹手」10 字 / 「评委体验·灵契猎手」9 字超过 Roster.nameError 的 8 字上限 → 改「评委」：
//   评委·战士 5 / 评委·法师 5 / 评委·时砂行者 7 / 评委·炼金投弹手 8 / 评委·灵契猎手 7 / 评委·负棺人 6（不点职业时就叫「评委」）
export const DEMO_NAME = '评委';
const PACK_ID = 'dlc1';
/** step = 已完成到第几步（只做显示 / 存档）；hud = 面板开着；acts = 每个按钮被点了几次（测试用） */
export const judgeState = { on: false, step: 0, hud: false, bossDead: false, acts: [0, 0, 0], jumps: [] as number[] };
let ctx: PackCtx | null = null;
let el: HTMLDivElement | null = null, tab: HTMLDivElement | null = null;
let t = 0;
const LS_POS = 'darkrock_judge_pos', LS_MIN = 'darkrock_judge_min';

export function bindJudge(c: PackCtx) { ctx = c; }
export function judgeMods() { return judgeState.on ? { dealt: 3, taken: 0.5 } : { dealt: 1, taken: 1 }; }

const CSS = `#d1-judge{position:fixed;left:0;top:0;z-index:60;width:250px;padding:8px 12px 10px;border:1px solid #c8a040;border-radius:8px;background:linear-gradient(rgba(30,20,10,.92),rgba(12,8,4,.92));color:#f0dcb0;font:13px/1.45 serif;box-shadow:0 0 18px rgba(255,170,60,.25);box-sizing:border-box}
#d1-judge h4{margin:-8px -12px 6px;padding:7px 12px 6px;font-size:14px;color:#ffd890;display:flex;justify-content:space-between;align-items:center;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;border-bottom:1px solid rgba(200,160,64,.25);border-radius:8px 8px 0 0}
#d1-judge h4 .grip{color:#a98;font-size:11px;font-weight:normal;margin-left:6px}
#d1-judge h4 button{background:none;border:0;color:#cba;cursor:pointer;font-size:15px;padding:0 2px}
#d1-judge.drag{opacity:.85;box-shadow:0 0 24px rgba(255,190,80,.5)}
#d1-judge .st{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(200,160,64,.18)}
#d1-judge .st:first-of-type{border-top:0}
#d1-judge .st b{flex:none;width:20px;height:20px;border-radius:50%;border:1px solid #c8a040;text-align:center;line-height:18px;font-size:12px}
#d1-judge .st.ok b{background:#c8a040;color:#1a1008}
#d1-judge .st.cur{background:rgba(255,200,90,.07);border-radius:6px}
#d1-judge .st small{display:block;color:#bca;font-size:11px}
#d1-judge .go{margin-top:4px;padding:3px 10px;border:1px solid #c8a040;border-radius:5px;background:#4a3418;color:#ffd890;cursor:pointer;font:600 12px serif}
#d1-judge .go:hover{background:#6a4a20}
#d1-judge .jl{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
#d1-judge .jl .go{margin-top:0;padding:2px 7px;font-size:11px}
#d1-judge .ft{margin-top:4px;color:#bca;font-size:11px}
html.phone #d1-judge{width:200px;font-size:12px}
#d1-judge-tab{position:fixed;left:calc(10px + var(--sal, 0px));top:96px;z-index:60;padding:5px 10px;border:1px solid #c8a040;border-radius:16px;background:linear-gradient(#4a3418,#2a1c0c);color:#ffd890;font:600 12px serif;cursor:pointer;box-shadow:0 0 12px rgba(255,170,60,.35);user-select:none}
#d1-judge-tab:hover{background:linear-gradient(#6a4a20,#3a2810)}
.d1-judge .nameplate .npt{display:none}
.d1-judge .nameplate:has(.npn):not(:has(.mk)){display:none}
`;

/** fix1108 #4（Rhett 11-08 批）快速跳转：小副本 / 长副本从头 / 三张野外图 / 钟井营地。data-j = 10 + 下标；走本体调试入口 window.__game.packDungeon 与 ctx.goMap（不改本体文件） */
const JUMPS: { t: string; d: string }[] = [
  { t: '钟铜熔炉', d: '40 级小副本 · 3 首领（普通）' },
  { t: '潮渊钟井 · 从头开打', d: '长副本 A 重新开一趟 · 5 首领（普通）' },
  { t: '沉钟海岸', d: '野外 · 潮痕营地' },
  { t: '镜渊城', d: '野外 · 倒钟广场' },
  { t: '无声钟楼', d: '野外 · 钟楼脚下' },
  { t: '钟井营地', d: '回到钟井井口营地（副本里进度保留；不在副本里就开一趟）' },
];
type JG = { packDungeon: { enter: (id: string, d: string) => boolean; here: () => boolean; state: () => { id: string } | null } };
function judgeJump(k: number) {
  if (!ctx) return;
  const G = (globalThis as unknown as { __game?: JG }).__game;
  const go = (map: string, at?: { x: number; z: number }) => { if (ctx!.map() === map && at) ctx!.teleport(at.x, at.z); else ctx!.goMap(map, at, '来到'); ctx!.heal?.(1); };
  if (k === 0) { if (G?.packDungeon.enter(FORGE_DG, 'normal')) ctx.heal?.(1); else ctx.toast('钟铜熔炉暂时进不去', '#ff8060'); }
  else if (k === 1) void wellJudgeEnter();
  else if (k === 2) go(COAST_ID);
  else if (k === 3) go(MIRROR_ID, campLandWorld(MIRROR_WILD, 'mr_camp'));   // fix1109 #4：营地内空地（原 (2,66) 离围墙 3.3 米）
  else if (k === 4) go(BT_ID);
  else if (k === 5) {   // 钟井图只在副本里能待（没开副本会被本体送回海岸井口）：副本里 → 传回井口营地 (0,120)；不在 → 开一趟（落点同样是井口）
    if (ctx.map() === WELL_MAP && G?.packDungeon.state()?.id === WELL_DG) { { const l = campLandWorld(WELL_WILD, 'wl_camp'); ctx.teleport(l.x, l.z); } ctx.heal?.(1); ctx.toast('回到钟井井口营地（副本进度保留）', '#5ff0e0'); }   // fix1109 #4：原 (0,120) = 篝火正中
    else void wellJudgeEnter();
  }
}
export const judgeJumps = JUMPS.length;

const STEPS = [
  { t: '一句话铸造武器', d: '写一句你想要的武器，熔炉现场生成 3D 模型', go: '打开铸造台' },
  { t: '拿新武器挑战首领', d: '潮汐巨鲸 · 鸣潮者（体验角色伤害 ×3）', go: '前往镜湖' },
  { t: '拍照留念', d: '按 P 进入拍照模式，Enter 保存图片', go: '进入拍照模式' },
];

function render() {
  if (!el) return;
  el.innerHTML = `<h4 data-drag="1"><span>⚡ 评委 3 分钟体验<span class="grip">⠿ 拖动</span></span><button data-j="x" title="收起（之后点左上角「评委体验」可重新打开）">✕</button></h4>` + STEPS.map((s, i) => {
    const done = i < judgeState.step, cls = done ? 'ok' : i === judgeState.step ? 'cur' : '';
    return `<div class="st ${cls}"><b>${done ? '✓' : i + 1}</b><div>${s.t}<small>${s.d}</small><button class="go" data-j="${i}">${s.go}${done ? ' · 再来一次' : ''}</button></div></div>`;
  }).join('') + `<div class="st"><b>A</b><div>长副本 A · 潮渊钟井尾王<small>直接送到深潮之喉门口（40 级满装）：锁血 + 圆台坍塌</small><button class="go" data-j="3">前往井底</button></div></div>` + `<div class="st jp"><b>⇢</b><div>快速跳转<div class="jl">${JUMPS.map((j, k) => `<button class="go" data-j="${10 + k}" title="${j.d}">${j.t}</button>`).join('')}</div></div></div>` + (judgeState.step >= STEPS.length ? `<div class="ft">★ 三步都体验过了，按钮可以随时再点。也可以自由探索：M 地图、B 背包、N 天赋</div>` : '');
}

// ---- 位置：默认左上头像下方，拖动后记住；窗口变小时夹回屏幕内
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 忽略 */ } };
/** 左上头像（含下面的「玩法介绍」/ 任务追踪）下方：右侧小地图下面是 背包/地图/菜单/设置 圆按钮和菜单下拉，放右边会挡住菜单 */
function leftAnchorY(): number {
  let y = 0;
  for (const id of ['player-frame', 'quest-tracker']) {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (r && r.height > 0 && r.left < window.innerWidth / 2 && r.top < window.innerHeight * 0.6) y = Math.max(y, r.bottom);
  }
  return Math.round((y || 120) + 12);
}
function defaultPos(_w: number): { x: number; y: number } {
  const pf = document.getElementById('player-frame')?.getBoundingClientRect();
  return { x: Math.round(pf && pf.width > 0 ? pf.left : 10), y: leftAnchorY() };
}
function clampPos(p: { x: number; y: number }, w: number, h: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  return { x: Math.max(4, Math.min(vw - w - 4, p.x)), y: Math.max(4, Math.min(vh - Math.min(h, 60) - 4, p.y)) };
}
function placePanel() {
  if (!el) return;
  const w = el.offsetWidth || 250, h = el.offsetHeight || 200;
  let p: { x: number; y: number } | null = null;
  try { const o = JSON.parse(lsGet(LS_POS) ?? 'null'); if (o && typeof o.x === 'number' && typeof o.y === 'number') p = o; } catch { /* 忽略 */ }
  const q = clampPos(p ?? defaultPos(w), w, h);
  el.style.left = `${q.x}px`; el.style.top = `${q.y}px`;
}
function placeTab() {
  if (!tab) return;
  tab.style.top = `${leftAnchorY()}px`;
}
function bindDrag(box: HTMLDivElement) {
  let d: { id: number; dx: number; dy: number } | null = null;
  box.addEventListener('pointerdown', e => {
    const h = (e.target as HTMLElement).closest('[data-drag]'); if (!h || (e.target as HTMLElement).closest('button')) return;
    const r = box.getBoundingClientRect(); d = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { box.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    box.classList.add('drag'); e.preventDefault();
  });
  box.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const q = clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, box.offsetWidth, box.offsetHeight);
    box.style.left = `${q.x}px`; box.style.top = `${q.y}px`; e.preventDefault();
  });
  const up = (e: PointerEvent) => {
    if (!d || e.pointerId !== d.id) return; d = null; box.classList.remove('drag');
    lsSet(LS_POS, JSON.stringify({ x: parseInt(box.style.left) || 0, y: parseInt(box.style.top) || 0 }));
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
let resized = false;
function onResize() { placePanel(); placeTab(); }

/** 三个按钮：任何时候都能反复点（不看进度） */
export function judgeAct(i: number) {
  if (!ctx) return;
  if (i >= 0 && i < 4) judgeState.acts[i] = (judgeState.acts[i] ?? 0) + 1;
  if (i >= 10 && i < 10 + JUMPS.length) { judgeState.jumps[i - 10] = (judgeState.jumps[i - 10] ?? 0) + 1; judgeJump(i - 10); return; }   // fix1108 #4
  if (i === 3) { void wellJudgeTail(); return; }   // A10：长副本 A 尾王门口（不计入三步进度）
  if (i === 0) openSmithy();
  else if (i === 1) {
    // v1.2.54 Rhett 定方案乙：评委版巨鲸战搬到镜渊城湖岸（不渡海），正常游戏仍在沉钟海岸深潮口
    // 反复点：巨鲸还活着 → 不重复生成，只把人送回湖岸；已经打死 → 立刻再浮出来一头
    judgeWhaleArena();
    wbDebug.setNext('dwb_whale', 0); wbDebug.tick();
    if (ctx.map() !== MIRROR_ID) ctx.goMap(MIRROR_ID, { x: MIRROR_O.x + WHALE_L.x - 4, z: MIRROR_O.z + WHALE_L.z + 13 }, '来到');
    else ctx.teleport(MIRROR_O.x + WHALE_L.x - 4, MIRROR_O.z + WHALE_L.z + 13);
    ctx.heal?.(1);
    ctx.toast('潮汐巨鲸从镜湖里浮出来了，靠近即开战', '#5ff0e0');
  } else if (i === 2) ctx.photo?.();
}

function ensureCss() {
  document.body.classList.add('d1-judge');   // v1.2.54：评委模式收起 NPC 头顶名牌（营地里五六个叠成一团），只留带任务标记的
  if (!document.getElementById('d1-judge-css')) { const st = document.createElement('style'); st.id = 'd1-judge-css'; st.textContent = CSS; document.head.appendChild(st); }
  if (!resized) { resized = true; window.addEventListener('resize', onResize); }
}
const swallow = (box: HTMLElement) => ['mousedown', 'pointerdown', 'touchstart', 'click', 'wheel', 'contextmenu'].forEach(k => box.addEventListener(k, e => e.stopPropagation()));

/** 打开面板；force = 忽略「上次收起了」（标题进入评委体验时） */
export function judgeShow(force = false) {
  if (typeof document === 'undefined') return;
  ensureCss();
  if (!force && lsGet(LS_MIN) === '1') { judgeMinimize(); return; }
  lsSet(LS_MIN, null);
  tab?.remove(); tab = null;
  if (el && !el.isConnected) el = null;   // 11-16 面板被外部移出 DOM（换界面风格时测试脚本 / 其他模块清场）后 el 仍指着游离节点 → 再打开不显示；重建
  if (!el) {
    el = document.createElement('div'); el.id = 'd1-judge';
    swallow(el); bindDrag(el);
    el.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-j]') as HTMLElement | null; if (!b) return; if (b.dataset.j === 'x') { judgeMinimize(); return; } judgeAct(+b.dataset.j!); });
    document.body.appendChild(el);
  }
  judgeState.hud = true; render(); placePanel();
}
/** 收起成左上角小按钮（进度保留，随时点开） */
export function judgeMinimize() {
  if (typeof document === 'undefined') return;
  ensureCss();
  el?.remove(); el = null; judgeState.hud = false; lsSet(LS_MIN, '1');
  if (!tab) {
    tab = document.createElement('div'); tab.id = 'd1-judge-tab'; tab.textContent = '⚡ 评委体验'; tab.title = '打开评委 3 分钟体验面板';
    swallow(tab); tab.addEventListener('click', () => judgeShow(true));
    document.body.appendChild(tab);
  }
  placeTab();
}
/** 完全移除（离开评委角色时） */
export function judgeHide() { if (typeof document !== 'undefined') document.body.classList.remove('d1-judge'); el?.remove(); el = null; tab?.remove(); tab = null; judgeState.hud = false; }

/** 每帧（包 update）：推进打勾进度（只是显示，按钮始终可点） */
export function judgeUpdate(_dt: number) {
  const n = performance.now(); if (!judgeState.on || !ctx || n - t < 400) return; t = n;   // 按真实时间节流（慢帧 / 顿帧时也及时推进）
  const s0 = judgeState.step;
  if (judgeState.step === 0 && forgeShowState.phase === 'done') judgeState.step = 1;
  if (judgeState.step === 1 && ctx.bossState?.('dwb_whale') === 'dead') { judgeState.step = 2; judgeState.bossDead = true; }
  if (judgeState.step === 2 && document.body.classList.contains('photo-on')) judgeState.step = 3;
  if (judgeState.step !== s0) { render(); ctx.save(); }
}

/** 快速体验入口（PackManifest.demo）；setFlag = 写存档标记 */
export function judgeDemo(setFlag: () => void): PackDemo {
  return {
    label: '⚡ 评委快速体验', sub: '6 职业任选 · 40 级套装 + 暗金武器 · 3 分钟看完铸造与首领战', name: DEMO_NAME, classId: 'warrior', level: 40,
    // 11-08 Rhett：评委版 6 职业出生 40 级，穿本职业 40 级套装 + 暗金武器（其余部位紫装补齐，装等 85），天赋自动点满
    classes: ['warrior', 'mage', 'chrono', 'alchemy', HUNTER_ID, COFFIN_ID], ilvl: 85, talents: true,
    kit: cls => [...(DARK_BY_CLASS[cls] ?? []), ...(S40_PIECES_OF[S40_BY_CLASS[cls]] ?? [])],
    prepare: () => { setFlag(); judgeState.on = true; judgeState.step = 0; judgeWhaleArena(); },
    enter: () => {
      setFlag(); judgeState.on = true; judgeWhaleArena();
      try { const c = ctx?.classId() ?? ''; echoGiveAll(c); const e = ECHO_DEFS.find(d => d.cls === c && d.style === 'might'); if (e) (globalThis as { __game?: { slotEquip?: (p: string, id: string | null) => boolean } }).__game?.slotEquip?.(PACK_ID, e.id); } catch (err) { console.warn('评委钟纹', err); }   // 11-08 第 8 格（G）给本职业钟纹
      ctx?.goMap(MIRROR_ID, campLandWorld(MIRROR_WILD, 'mr_camp'), '来到');   // fix1109 #4：落在营地内空地（原 (2,66)）   // v1.2.54 Rhett：评委落地点换到美化后的倒钟广场 · 拾荒营
      ctx?.banner?.({ big: '评委快速体验', small: '左侧三步面板：铸造武器 → 挑战首领 → 拍照留念（可拖动，按钮可反复点）', theme: 'gold', ms: 3600 });
      judgeShow(true);
    },
  };
}
