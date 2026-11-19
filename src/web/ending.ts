// v0.8.3 结局过场：全屏黑幕，字幕逐句淡入，再滚动制作名单；可跳过 / 重看
import { ENDING_LINES, CREDITS } from '../data/story_ch6';
import { runStoryHooks } from '../core/ContentPacks';
let timers: number[] = [];
let onDone: (() => void) | null = null;
const el = () => document.getElementById('ending');
export const endingOpen = () => el()?.style.display === 'flex';
export function closeEnding() {
  const e = el(); if (!e) return;
  timers.forEach(t => window.clearTimeout(t)); timers = [];
  e.style.display = 'none'; e.innerHTML = '';
  const f = onDone; onDone = null; f?.();
}
/** 播放结局；perLine 每句字幕间隔（毫秒） */
export function showEnding(done?: () => void, perLine = 3200) {
  const e = el(); if (!e) return;
  timers.forEach(t => window.clearTimeout(t)); timers = []; onDone = done ?? null;
  runStoryHooks('ending');   // v0.9.9 内容包剧情钩子（本体结局字幕开始时）
  e.innerHTML = `<div class="end-lines">${ENDING_LINES.map((l, i) => `<p data-i="${i}">${l}</p>`).join('')}</div>
    <div class="end-credits">${CREDITS.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
    <button class="btn end-skip" id="end-skip">跳过</button>`;
  e.style.display = 'flex';
  const ps = e.querySelectorAll('.end-lines p');
  ps.forEach((p, i) => timers.push(window.setTimeout(() => p.classList.add('on'), 600 + i * perLine)));
  const tCred = 600 + ps.length * perLine + 1200;
  timers.push(window.setTimeout(() => { e.querySelector('.end-lines')!.classList.add('out'); e.querySelector('.end-credits')!.classList.add('roll'); (e.querySelector('#end-skip') as HTMLElement).textContent = '返回游戏'; }, tCred));
  timers.push(window.setTimeout(closeEnding, tCred + 22000));
  (e.querySelector('#end-skip') as HTMLElement).onclick = closeEnding;
}
