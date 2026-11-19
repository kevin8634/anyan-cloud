// ======================================================================
// DLC1 第九章 9-3「最后一下」：命运的岔路（v1.1.0，d1.7）
// 方案 v3：第一步 全屏横幅「命运的岔路」（和太古掉落同一个横幅组件，暗红 + 冷青，约 3 秒，钟声 + 低频轰鸣）
//         第二步 抉择界面：左「再鸣 · 守钟人」/ 右「断绳 · 渊噬者」，结局介绍 + 角色定位 + 玩法影响 + 3D 预览；按住 3 秒确认，可「再想想」
// 选择写进存档 dlc.dlc1.bt.fate（'A' | 'B'），不可更改。
// 给后续版本的接口（d1.8 钟楼领地 = A / d1.9 渊噬之躯 = B）：DLC1_FATE.choice() / onChoose(cb) / endingSeen()
// 双结局字幕：showEnding('A' | 'B')（尾王倒下后由 belltower.ts 调用）
// ======================================================================
import * as THREE from 'three';
import type { PackCtx } from '../../core/ContentPacks';
import { previewFigure } from './models_bt';

export type Fate = 'A' | 'B';
export interface BtSave { fate?: Fate; fateAt?: number; banner?: boolean; ending?: Fate; kills?: Record<string, number> }
let S: BtSave = {};
const listeners: ((f: Fate) => void)[] = [];

export const btSave = (): BtSave => JSON.parse(JSON.stringify(S));
export function btLoad(d: unknown) {
  const o = d && typeof d === 'object' ? d as BtSave : {};
  S = { ...o, kills: { ...(o.kills ?? {}) } };
  if (S.fate !== 'A' && S.fate !== 'B') delete S.fate;
}
export const btState = () => S;
export const fateChoice = (): Fate | null => S.fate ?? null;

/** 后续版本接口：读选择、监听做出选择、结局字幕是否看过 */
export const DLC1_FATE = {
  choice: fateChoice,
  onChoose: (cb: (f: Fate) => void) => { listeners.push(cb); },
  endingSeen: (): Fate | null => S.ending ?? null,
  /** 守钟人 / 渊噬者 的显示名 */
  title: (f: Fate) => f === 'A' ? '守钟人' : '渊噬者',
};

let ctx: PackCtx | null = null;
export const bindFate = (c: PackCtx) => { ctx = c; };

/** 确认选择（只能一次）。返回是否写入 */
export function chooseFate(f: Fate): boolean {
  if (S.fate || (f !== 'A' && f !== 'B')) return false;
  S.fate = f; S.fateAt = Date.now();
  ctx?.save();
  for (const cb of listeners) { try { cb(f); } catch (e) { console.error(e); } }
  return true;
}

// ---------------------------------------------------------------- 音效：钟声 + 低频轰鸣
export function fateSound(kind: 'banner' | 'confirm' | 'tick' = 'banner') {
  const A = ctx?.synth?.(); if (!A) return;
  if (kind === 'tick') { if (A.gate('fate_tick', 0.25)) A.tone({ f: 660, type: 'sine', dur: 0.08, gain: 0.05 }); return; }
  if (!A.gate('fate_' + kind, 0.5)) return;
  // 钟：基音 + 不和谐泛音，长衰减
  const base = kind === 'banner' ? 98 : 131;
  [[1, 0.32], [2.0, 0.16], [2.76, 0.12], [5.4, 0.06], [8.9, 0.03]].forEach(([k, g]) => A.tone({ f: base * k, type: 'sine', dur: 3.2, gain: g, a: 0.005, d: 3.0, vib: 0.004, vibHz: 4 }));
  if (kind === 'banner') { A.tone({ f: 41, f2: 32, type: 'sawtooth', dur: 3, gain: 0.14, a: 0.3, d: 2.4, lp: 160 }); A.noise({ f: 90, f2: 50, type: 'lowpass', dur: 3, gain: 0.18, a: 0.4, d: 2.4 }); }
}

// ---------------------------------------------------------------- 第一步：横幅
export function fateBanner(ms = 3200) {
  ctx?.banner?.({ big: '命运的岔路', small: '◆ 第九章 · 最后一下 ◆', line: '接下来的选择将决定此角色的最终定位', theme: 'dual', ms });
  fateSound('banner');
  S.banner = true;
}

// ---------------------------------------------------------------- 第二步：抉择界面
const COL: Record<Fate, { name: string; role: string; tag: string; story: string; items: [string, string][]; note: string }> = {
  A: {
    name: '再鸣', role: '守钟人', tag: '秩序 · 控场 · 经营',
    story: '和伊奥拉一起重新敲响沉钟，在沉眠者完全醒来之前把它压回睡眠。钟声再起，伊奥拉留在钟楼，成为新的钟声；镜渊城的灯会一盏盏亮起来。',
    items: [
      ['解锁系统', '钟楼领地：重建镜渊城 8 座建筑，回响成为城里的居民，每天敲钟选一条「钟律」'],
      ['第 7 键', '钟鸣：范围钟声，打断 + 易伤，靠打断和格挡充能'],
      ['尾王战', '沉眠者被钟声束缚，共 4 个阶段'],
      ['外观', '守钟人披风'],
      ['之后的掉落', '回响被安魂，成为领地居民'],
    ],
    note: '选择后立即开放：镜渊城里点屏幕下方的「钟楼领地」；钟鸣按 T（手机在技能区）',
  },
  B: {
    name: '断绳', role: '渊噬者', tag: '混沌 · 爆发 · 高风险',
    story: '和卡戎一起斩断钟绳，正面击败完全醒来的沉眠者，并吞下它的力量。钟楼会坍塌，地底的潮水第一次听从一个人的号令；伊奥拉的回响将会消散。',
    items: [
      ['解锁系统', '渊噬之躯：6 个变异部位，渊化值满了进入渊形态'],
      ['第 7 键', '吞噬：处决低血敌人，回血并充渊化值'],
      ['尾王战', '沉眠者完全觉醒，多一个阶段（共 5 个）'],
      ['外观', '渊化变异：结晶臂、第三只眼、光脊、影触须'],
      ['之后的掉落', '回响被你吞下，化作身体的变异'],
    ],
    note: '选择后立即开放：点技能区上方的渊化条打开「渊噬之躯」；吞噬按 T（手机在技能区）',
  },
};
export const HOLD_MS = 3000;

const CSS = `
#d1-fate{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;background:radial-gradient(ellipse at 50% 40%,rgba(20,14,22,.86),rgba(0,0,0,.96));color:#e8e0d8;font-family:inherit;padding:14px 2vw 10px;box-sizing:border-box;user-select:none;-webkit-user-select:none;animation:d1fin .4s ease-out}
@keyframes d1fin{from{opacity:0}to{opacity:1}}
#d1-fate .fh{position:relative;width:min(900px,96vw);text-align:center;padding:8px 0 10px;background:linear-gradient(90deg,rgba(90,6,10,0),rgba(100,8,12,.85) 18%,rgba(30,10,24,.9) 50%,rgba(6,60,72,.85) 82%,rgba(0,40,50,0));flex:none}
#d1-fate .fh::before,#d1-fate .fh::after{content:'';position:absolute;left:8%;right:8%;height:2px;background:linear-gradient(90deg,transparent,#ff5040 20%,#f0e0c0 50%,#50e8f0 80%,transparent)}
#d1-fate .fh::before{top:0}#d1-fate .fh::after{bottom:0}
#d1-fate .fh b{display:block;font-size:34px;letter-spacing:12px;padding-left:12px;font-weight:900;background:linear-gradient(90deg,#ff6a50,#ffe0c0 48%,#c0f8ff 52%,#40d8f0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 6px rgba(120,40,80,.9))}
#d1-fate .fh small{display:block;font-size:13px;color:#e8d0d0;letter-spacing:2px;margin-top:2px}
#d1-fate .fcols{display:flex;gap:2vw;width:min(1100px,96vw);flex:1;min-height:0;margin-top:10px}
#d1-fate .fc{flex:1;min-width:0;display:flex;flex-direction:column;border:2px solid;border-radius:10px;padding:10px 12px;box-sizing:border-box;min-height:0}
#d1-fate .fc.a{border-color:#4ab8c8;background:linear-gradient(180deg,rgba(10,40,50,.92),rgba(6,18,24,.95));box-shadow:0 0 18px rgba(60,200,230,.25) inset}
#d1-fate .fc.b{border-color:#c03040;background:linear-gradient(180deg,rgba(50,8,20,.92),rgba(22,6,14,.95));box-shadow:0 0 18px rgba(230,40,80,.25) inset}
#d1-fate .ft{display:flex;gap:10px;align-items:center;flex:none}
#d1-fate canvas{width:150px;height:150px;flex:none;border-radius:8px;background:rgba(0,0,0,.35)}
#d1-fate .fn{min-width:0}
#d1-fate .fn b{display:block;font-size:24px;letter-spacing:4px}
#d1-fate .fc.a .fn b{color:#9ff0ff}#d1-fate .fc.b .fn b{color:#ff9a9a}
#d1-fate .fn i{display:block;font-style:normal;font-size:14px;color:#f0d890;margin-top:2px}
#d1-fate .fn em{display:inline-block;font-style:normal;font-size:12px;margin-top:4px;padding:1px 8px;border-radius:10px;background:rgba(255,255,255,.08)}
#d1-fate .fs{overflow:auto;min-height:0;flex:1;margin:8px 0 6px;padding-right:4px;font-size:13.5px;line-height:1.55}
#d1-fate .fs p{margin:0 0 6px}
#d1-fate .fs ul{list-style:none;margin:0;padding:0}
#d1-fate .fs li{margin:0 0 4px;padding-left:10px;border-left:2px solid rgba(255,255,255,.18)}
#d1-fate .fs li u{text-decoration:none;font-weight:bold;color:#f0d890;margin-right:6px}
#d1-fate .fs .nt{color:#9a9090;font-size:12px;margin-top:4px}
#d1-fate .fhold{position:relative;flex:none;align-self:center;width:min(260px,90%);height:44px;border-radius:22px;border:2px solid currentColor;background:rgba(0,0,0,.35);color:#9ff0ff;font-size:16px;font-weight:bold;cursor:pointer;overflow:hidden;touch-action:none}
#d1-fate .fc.b .fhold{color:#ff8a8a}
#d1-fate .fhold .pg{position:absolute;left:0;top:0;bottom:0;width:0;background:currentColor;opacity:.32}
#d1-fate .fhold span{position:relative}
#d1-fate .fbot{flex:none;display:flex;align-items:center;justify-content:center;gap:18px;margin-top:8px;flex-wrap:wrap}
#d1-fate .fwarn{color:#ff4a3a;font-weight:bold;font-size:14px;text-shadow:0 0 6px #000}
#d1-fate .fback{padding:6px 22px;border-radius:6px;border:1px solid #7a7068;background:rgba(40,36,34,.9);color:#e0d8d0;font-size:14px;cursor:pointer}
html.phone #d1-fate{padding:6px 2vw 6px}
html.phone #d1-fate .fh{padding:4px 0 5px}
html.phone #d1-fate .fh b{font-size:22px;letter-spacing:8px;padding-left:8px}
html.phone #d1-fate .fh small{font-size:11px}
html.phone #d1-fate .fcols{margin-top:6px}
html.phone #d1-fate .fc{padding:6px 8px}
html.phone #d1-fate canvas{width:76px;height:76px}
html.phone #d1-fate .fn b{font-size:18px}
html.phone #d1-fate .fn i{font-size:12px}
html.phone #d1-fate .fn em{font-size:11px;margin-top:2px}
html.phone #d1-fate .fs{font-size:12px;line-height:1.45;margin:4px 0}
html.phone #d1-fate .fhold{height:36px;font-size:14px}
html.phone #d1-fate .fbot{margin-top:4px;gap:10px}
html.phone #d1-fate .fwarn{font-size:12px}
html.phone #d1-fate .fback{padding:4px 16px;font-size:13px}
#d1-end{position:fixed;inset:0;z-index:75;background:#000;color:#e8e0d0;display:flex;align-items:center;justify-content:center;text-align:center;animation:d1fin 1.2s ease-out}
#d1-end .el{font-size:22px;line-height:1.7;max-width:80vw;opacity:0;transition:opacity 1s}
#d1-end .el.on{opacity:1}
#d1-end .el.ttl{font-size:30px;letter-spacing:8px;font-weight:900}
#d1-end.A .el.ttl{color:#9ff0ff;text-shadow:0 0 14px #2ab0c8}
#d1-end.B .el.ttl{color:#ff7a7a;text-shadow:0 0 14px #c02040}
#d1-end .esk{position:absolute;right:18px;bottom:14px;padding:5px 16px;border:1px solid #555;border-radius:6px;background:rgba(30,30,30,.8);color:#bbb;font-size:13px;cursor:pointer}
html.phone #d1-end .el{font-size:16px}html.phone #d1-end .el.ttl{font-size:22px}
`;
function ensureCss() {
  if (document.getElementById('d1-fate-css')) return;
  const st = document.createElement('style'); st.id = 'd1-fate-css'; st.textContent = CSS; document.head.appendChild(st);
}

// 3D 预览：一个离屏渲染器轮流画两个小人，再拷到两个 2D 画布（只在界面打开时跑，约 30 帧）
let prev: { r: THREE.WebGLRenderer; scenes: THREE.Scene[]; cam: THREE.PerspectiveCamera; figs: THREE.Group[]; raf: number; last: number } | null = null;
// 定时器用 setInterval（不占游戏主循环的 requestAnimationFrame），按真实时间
function startPreview(cvs: HTMLCanvasElement[]) {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(224, 224, false); r.setPixelRatio(1);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); cam.position.set(0, 1.7, 4.4); cam.lookAt(0, 1.2, 0);
    const figs: THREE.Group[] = [], scenes: THREE.Scene[] = [];
    (['A', 'B'] as Fate[]).forEach(k => {
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(k === 'A' ? 0xdff8ff : 0xffd0d8, 0x303040, 2.2));
      const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 4, 3); sc.add(d);
      const rim = new THREE.PointLight(k === 'A' ? 0x40e0f0 : 0xff2040, 6, 8); rim.position.set(-1.5, 2, -1.5); sc.add(rim);
      const f = previewFigure(k); sc.add(f); figs.push(f); scenes.push(sc);
    });
    prev = { r, scenes, cam, figs, raf: 0, last: 0 };
    const loop = () => {
      if (!prev) return;
      const t = Date.now();
      prev.figs.forEach((f, i) => {
        f.rotation.y = t / 1600 + i * 0.6;
        prev!.r.render(prev!.scenes[i], prev!.cam);
        const c2 = cvs[i].getContext('2d'); if (!c2) return;
        c2.clearRect(0, 0, cvs[i].width, cvs[i].height); c2.drawImage(prev!.r.domElement, 0, 0, cvs[i].width, cvs[i].height);
      });
    };
    prev.raf = window.setInterval(loop, 33); loop();
  } catch { cvs.forEach(c => { c.style.display = 'none'; }); prev = null; }
}
function stopPreview() {
  if (!prev) return;
  clearInterval(prev.raf);
  prev.scenes.forEach(s => s.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); }));
  prev.r.dispose?.(); (prev.r as unknown as { forceContextLoss?: () => void }).forceContextLoss?.(); prev = null;
}

let holdState: { f: Fate; t0: number; raf: number } | null = null;
export const fateUiOpen = () => !!document.getElementById('d1-fate');
/** 测试 / 调试：当前按住进度 0–1（没在按 = 0） */
export const fateHoldK = () => holdState ? Math.min(1, (Date.now() - holdState.t0) / HOLD_MS) : 0;
export function closeFateUI() {
  if (holdState) { clearInterval(holdState.raf); holdState = null; }
  stopPreview();
  document.getElementById('d1-fate')?.remove();
}
/** 打开抉择界面（已经选过 = 只提示）。onDone 在确认后调用 */
export function openFateUI(onDone?: (f: Fate) => void): boolean {
  if (S.fate) { ctx?.toast(`你已经选择了「${COL[S.fate].name}」，成为${COL[S.fate].role}。`, '#f0d890'); return false; }
  if (fateUiOpen()) return true;
  ensureCss();
  const w = document.createElement('div'); w.id = 'd1-fate';
  const col = (f: Fate) => {
    const c = COL[f];
    return `<div class="fc ${f.toLowerCase()}" data-f="${f}"><div class="ft"><canvas width="224" height="224"></canvas><div class="fn"><b>「${c.name}」</b><i>成为${c.role}</i><em>${c.tag}</em></div></div>
      <div class="fs"><p>${c.story}</p><ul>${c.items.map(([k, v]) => `<li><u>${k}</u>${v}</li>`).join('')}</ul><div class="nt">${c.note}</div></div>
      <button class="fhold" data-f="${f}"><div class="pg"></div><span>按住 3 秒 · 选择「${c.name}」</span></button></div>`;
  };
  w.innerHTML = `<div class="fh"><b>命运的岔路</b><small>接下来的选择将决定此角色的最终定位</small></div>
    <div class="fcols">${col('A')}${col('B')}</div>
    <div class="fbot"><span class="fwarn">选择后不可更改。同一账号的其他角色可以选另一条路。</span><button class="fback">再想想</button></div>`;
  document.body.appendChild(w);
  startPreview(Array.from(w.querySelectorAll('canvas')));
  (w.querySelector('.fback') as HTMLElement).onclick = () => { closeFateUI(); ctx?.toast('走到钟楼顶层的伊奥拉或卡戎身边，可以重新打开抉择', '#c8b8a8'); };
  w.querySelectorAll<HTMLButtonElement>('.fhold').forEach(btn => {
    const f = btn.dataset.f as Fate, pg = btn.querySelector('.pg') as HTMLElement, label = btn.querySelector('span') as HTMLElement, base = label.textContent!;
    const stop = () => { if (holdState?.f !== f) return; clearInterval(holdState.raf); holdState = null; pg.style.width = '0'; label.textContent = base; };
    btn.addEventListener('pointerdown', (ev: Event) => {
      ev.preventDefault(); if (holdState) return;
      try { btn.setPointerCapture((ev as PointerEvent).pointerId); } catch { /* jsdom */ }
      holdState = { f, t0: Date.now(), raf: 0 };
      const step = () => {
        if (!holdState || holdState.f !== f) return;
        const k = Math.min(1, (Date.now() - holdState.t0) / HOLD_MS);
        pg.style.width = `${k * 100}%`; label.textContent = k < 1 ? `继续按住…… ${Math.ceil((1 - k) * HOLD_MS / 1000)}` : '已确认';
        fateSound('tick');
        if (k >= 1) { clearInterval(holdState.raf); holdState = null; confirm(f); }
      };
      holdState.raf = window.setInterval(step, 50);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => btn.addEventListener(t, stop));
  });
  const confirm = (f: Fate) => {
    if (!chooseFate(f)) return;
    closeFateUI();
    fateSound('confirm');
    ctx?.banner?.({ big: f === 'A' ? '再鸣' : '断绳', small: '◆ 命运已定 ◆', line: `你选择了成为${COL[f].role}`, theme: 'dual', ms: 2800 });
    ctx?.toast(f === 'A' ? '你站到了伊奥拉身边。去找她，准备重新敲响沉钟。' : '你接过了卡戎的刀。去找他，准备斩断钟绳。', f === 'A' ? '#9ff0ff' : '#ff9a9a');
    onDone?.(f);
  };
  (w as unknown as { _confirm: (f: Fate) => void })._confirm = confirm;   // 测试用：跳过按住
  return true;
}
/** 测试用：模拟按住到时（走真实确认流程） */
export function fateConfirmNow(f: Fate) { const w = document.getElementById('d1-fate') as unknown as { _confirm?: (f: Fate) => void } | null; w?._confirm?.(f); }

// ---------------------------------------------------------------- 双结局字幕
const END_LINES: Record<Fate, string[]> = {
  A: ['「当——」', '钟声又一次响起。这一次，是你敲下的。', '沉眠者在铜链与钟声里，慢慢合上了眼睛。', '伊奥拉站在钟下，身形越来越淡，也越来越亮——她成了钟声本身。',
    '「别难过。从今往后，每一声钟响，都是我在说：晚安。」', '镜渊城的灯，一盏，一盏，亮了起来。', '回响们第一次走出了那一天。', '你接过了敲钟的木槌。从今天起，你是守钟人。'],
  B: ['钟绳断了。', '沉眠者第一次完全睁开眼睛——然后在你面前倒下。', '你把手按在它裂开的胸口，把那股古老的力量吞了下去。', '钟楼在身后坍塌，铜钟沉进海里，再也不会响了。',
    '地底的潮水停了下来，像在等一个号令。它在等你。', '卡戎跪在废墟边，笑着，又像在哭。', '伊奥拉的回响化作一点微光，落在你的掌心：', '「……海的那一边，还有别的钟。它们也在等。」', '你是渊噬者。'],
};
export const endingLines = (f: Fate) => END_LINES[f];
let endTimer = 0;
export const endingOpen = () => !!document.getElementById('d1-end');
export function showEnding(f: Fate, lineMs = 3400) {
  if (endingOpen()) return;
  ensureCss();
  S.ending = f; ctx?.save();
  ctx?.musicHold?.('ending');   // v1.2.48 结局曲（有曲目的构建；否则本体程序化结局主题）
  const w = document.createElement('div'); w.id = 'd1-end'; w.className = f;
  const lines = [...END_LINES[f]];
  const ttl = f === 'A' ? '第九章 · 再鸣 —— 完' : '第九章 · 断绳 —— 完';
  w.innerHTML = `<div class="el"></div><button class="esk">跳过</button>`;
  document.body.appendChild(w);
  const el = w.querySelector('.el') as HTMLElement;
  let i = 0;
  const finish = () => { clearTimeout(endTimer); w.remove(); ctx?.musicHold?.(null); ctx?.toast(f === 'A' ? '你成为了守钟人。回镜渊城看看吧：伊奥拉的回响在等你重建这座城（钟楼领地）' : '你成为了渊噬者。吞下的首领回响会化作身体的变异：点技能区上方的渊化条打开「渊噬之躯」', f === 'A' ? '#9ff0ff' : '#ff9a9a'); };
  const next = () => {
    if (i > lines.length) { finish(); return; }
    el.classList.remove('on');
    endTimer = window.setTimeout(() => {
      const last = i === lines.length;
      el.textContent = last ? ttl : lines[i]; el.classList.toggle('ttl', last); el.classList.add('on'); i++;
      endTimer = window.setTimeout(next, last ? lineMs * 1.4 : lineMs);
    }, 500);
  };
  (w.querySelector('.esk') as HTMLElement).onclick = finish;
  next();
  fateSound('confirm');
}
export function closeEnding() { clearTimeout(endTimer); if (document.getElementById('d1-end')) ctx?.musicHold?.(null); document.getElementById('d1-end')?.remove(); }
