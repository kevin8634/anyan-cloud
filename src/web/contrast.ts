// v0.9.1o 高对比度：把为深色底设计的亮色，压暗到在羊皮纸面板（#e8d5aa）上对比度 ≥ 4.5（WCAG AA）
const PARCH = [232, 213, 170];
const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (c: string) => { const h = c.replace('#', ''); const s = h.length === 3 ? h.split('').map(x => x + x).join('') : h; return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const cache = new Map<string, string>();
/** 羊皮纸上能看清的同色系颜色（保持色相，只压暗） */
export function ink(color: string, min = 4.5, bg = PARCH): string {
  const k = color + min; const hit = cache.get(k); if (hit) return hit;
  let c = hex(color);
  for (let i = 0; i < 40 && ratio(c, bg) < min; i++) c = c.map(v => Math.round(v * 0.9));
  const out = '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  cache.set(k, out); return out;
}
export const contrastRatio = (a: string, b = '#e8d5aa') => ratio(hex(a), hex(b));
