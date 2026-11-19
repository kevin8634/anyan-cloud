// v1.2.73 传送阵面板横版改版（Rhett 11-02）：每个目的地一张「风格小画」，程序生成 SVG，0 积分、不进 assets/
// 主题按地图 / 副本 id 选：天空渐变 + 2~3 层远近剪影 + 一个标志物 + 暗角。未知 id 退回所在地图主题。

type Theme = { sky: [string, string]; far: string; mid: string; near: string; glow: string; motif: string; stars?: boolean };

const T: Record<string, Theme> = {
  camp: { sky: ['#6a7c8c', '#c9b48a'], far: '#5b6670', mid: '#4a4a3c', near: '#2c2a22', glow: '#ffb050', motif: 'camp' },
  field: { sky: ['#7fb6e0', '#e8f0c0'], far: '#8fb878', mid: '#5f9a48', near: '#3a6a2a', glow: '#fff0a0', motif: 'windmill' },
  foothill: { sky: ['#7a8090', '#d0b890'], far: '#6a6058', mid: '#4a4038', near: '#2a221c', glow: '#ffa040', motif: 'mine' },
  marsh: { sky: ['#4a5a48', '#9aa878'], far: '#3a4a34', mid: '#2e3a26', near: '#1a2414', glow: '#9aff50', motif: 'reeds' },
  star: { sky: ['#1a1440', '#6a4a9a'], far: '#3a3060', mid: '#2a2448', near: '#161230', glow: '#c0a0ff', motif: 'meteor', stars: true },
  redsand: { sky: ['#d07a40', '#f4d090'], far: '#b0603a', mid: '#8a3e22', near: '#4a1e10', glow: '#ffd070', motif: 'mesa' },
  frost: { sky: ['#8ab0d8', '#e8f4ff'], far: '#b8d0e8', mid: '#7a98b8', near: '#2e4058', glow: '#e0f6ff', motif: 'pines' },
  ember: { sky: ['#2a1410', '#a03a18'], far: '#4a2418', mid: '#2e160e', near: '#140806', glow: '#ff6a20', motif: 'volcano' },
  // 副本
  darkrock_mine: { sky: ['#1a1612', '#4a3a28'], far: '#2a241c', mid: '#1e1a14', near: '#0e0c0a', glow: '#ffa040', motif: 'cave' },
  rotting_temple: { sky: ['#1a2414', '#4a6a2a'], far: '#2a3a1e', mid: '#1e2a14', near: '#0e140a', glow: '#8aff40', motif: 'temple' },
  sand_tomb: { sky: ['#5a3018', '#c08040'], far: '#8a5428', mid: '#5a3418', near: '#2a160a', glow: '#ffd060', motif: 'pyramid' },
  troll_cave: { sky: ['#1a2a3a', '#5a7a9a'], far: '#4a6a8a', mid: '#2a4058', near: '#0e1a28', glow: '#9fe8ff', motif: 'cave' },
  frost_crypt: { sky: ['#141e2e', '#4a5a7a'], far: '#3a4a64', mid: '#222e44', near: '#0c1220', glow: '#a0d8ff', motif: 'crypt' },
  molten_throne: { sky: ['#200a06', '#8a2008'], far: '#3a140a', mid: '#240c06', near: '#100402', glow: '#ff5010', motif: 'throne' },
  ash_forge: { sky: ['#1e1814', '#6a4a30'], far: '#3a3028', mid: '#26201a', near: '#120e0a', glow: '#ff8a30', motif: 'forge' },
  abyss: { sky: ['#0a0614', '#3a1a5a'], far: '#24123a', mid: '#160a26', near: '#080410', glow: '#c060ff', motif: 'rift', stars: true },
  pack: { sky: ['#1e3040', '#6a9ab0'], far: '#3a5a6a', mid: '#24404e', near: '#0e1e28', glow: '#9ff0e0', motif: 'bell' },
};

let uid = 0;
const R = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 2147483647; return h || 1; };

/** 一条起伏剪影（y 为基线，amp 为起伏） */
function ridge(rnd: () => number, w: number, h: number, y: number, amp: number, n: number, sharp = false): string {
  let d = `M0 ${h} L0 ${y}`;
  for (let i = 1; i <= n; i++) {
    const x = (i / n) * w, yy = y - rnd() * amp;
    d += sharp ? ` L${(x - w / n / 2).toFixed(1)} ${(yy - amp * 0.4).toFixed(1)} L${x.toFixed(1)} ${yy.toFixed(1)}` : ` Q${(x - w / n / 2).toFixed(1)} ${(yy - amp * 0.5).toFixed(1)} ${x.toFixed(1)} ${yy.toFixed(1)}`;
  }
  return d + ` L${w} ${h} Z`;
}

function motif(m: string, t: Theme, w: number, h: number, rnd: () => number): string {
  const cx = w * 0.62, by = h * 0.78, g = t.glow, n = t.near;
  switch (m) {
    case 'camp': return `<path d="M${cx - 30} ${by} L${cx - 12} ${by - 26} L${cx + 6} ${by} Z" fill="#5a4630"/><path d="M${cx + 4} ${by} L${cx + 20} ${by - 20} L${cx + 36} ${by} Z" fill="#4a3a28"/><circle cx="${cx - 44}" cy="${by - 4}" r="9" fill="${g}" opacity=".55"/><path d="M${cx - 48} ${by} L${cx - 44} ${by - 12} L${cx - 40} ${by} Z" fill="${g}"/>`;
    case 'windmill': return `<rect x="${cx - 4}" y="${by - 34}" width="8" height="34" fill="${n}"/><g transform="translate(${cx} ${by - 34})" stroke="${n}" stroke-width="3"><line x1="-18" y1="-18" x2="18" y2="18"/><line x1="18" y1="-18" x2="-18" y2="18"/></g>`;
    case 'mine': return `<path d="M${cx - 20} ${by} L${cx - 20} ${by - 16} Q${cx} ${by - 34} ${cx + 20} ${by - 16} L${cx + 20} ${by} Z" fill="#0c0a08"/><circle cx="${cx}" cy="${by - 10}" r="5" fill="${g}"/><line x1="${cx - 22}" y1="${by - 16}" x2="${cx + 22}" y2="${by - 16}" stroke="#6a4a28" stroke-width="3"/>`;
    case 'reeds': return Array.from({ length: 9 }, (_, i) => { const x = w * 0.45 + i * 9 + rnd() * 5, hh = 18 + rnd() * 16; return `<path d="M${x} ${by + 6} Q${x + 3} ${by - hh / 2} ${x + 1} ${by - hh}" stroke="${n}" stroke-width="2" fill="none"/><ellipse cx="${x + 1}" cy="${by - hh}" rx="2" ry="5" fill="${n}"/>`; }).join('') + `<ellipse cx="${w * 0.4}" cy="${by + 8}" rx="${w * 0.3}" ry="6" fill="${g}" opacity=".18"/>`;
    case 'meteor': return `<line x1="${w * 0.2}" y1="${h * 0.1}" x2="${cx}" y2="${h * 0.45}" stroke="${g}" stroke-width="3" stroke-linecap="round" opacity=".9"/><circle cx="${cx}" cy="${h * 0.45}" r="5" fill="#fff"/><ellipse cx="${cx + 10}" cy="${by + 2}" rx="26" ry="6" fill="${g}" opacity=".35"/>`;
    case 'mesa': return `<path d="M${cx - 34} ${by} L${cx - 28} ${by - 30} L${cx + 18} ${by - 30} L${cx + 26} ${by} Z" fill="${n}"/><path d="M${cx - 30} ${by - 22} L${cx + 22} ${by - 22}" stroke="#a0502a" stroke-width="2"/>`;
    case 'pines': return Array.from({ length: 5 }, (_, i) => { const x = w * 0.42 + i * 16 + rnd() * 6, s = 0.8 + rnd() * 0.5; return `<path d="M${x} ${by - 40 * s} L${x - 10 * s} ${by - 12 * s} L${x - 4 * s} ${by - 12 * s} L${x - 12 * s} ${by} L${x + 12 * s} ${by} L${x + 4 * s} ${by - 12 * s} L${x + 10 * s} ${by - 12 * s} Z" fill="${n}"/><path d="M${x} ${by - 40 * s} L${x - 5 * s} ${by - 28 * s} L${x + 5 * s} ${by - 28 * s} Z" fill="#fff" opacity=".8"/>`; }).join('');
    case 'volcano': return `<path d="M${cx - 50} ${by} L${cx - 10} ${by - 40} L${cx + 6} ${by - 40} L${cx + 50} ${by} Z" fill="${n}"/><path d="M${cx - 8} ${by - 40} Q${cx - 4} ${by - 20} ${cx - 14} ${by} M${cx + 4} ${by - 40} Q${cx + 10} ${by - 18} ${cx + 18} ${by}" stroke="${g}" stroke-width="2.5" fill="none"/><ellipse cx="${cx - 2}" cy="${by - 44}" rx="16" ry="6" fill="${g}" opacity=".6"/>`;
    case 'cave': return `<path d="M${cx - 36} ${by + 4} Q${cx - 34} ${by - 40} ${cx} ${by - 44} Q${cx + 34} ${by - 40} ${cx + 36} ${by + 4} Z" fill="#050403"/><path d="M${cx - 24} ${by - 30} L${cx - 20} ${by - 18} L${cx - 16} ${by - 31} M${cx + 10} ${by - 36} L${cx + 14} ${by - 22} L${cx + 18} ${by - 35}" fill="${t.mid}"/><ellipse cx="${cx}" cy="${by - 4}" rx="18" ry="7" fill="${g}" opacity=".45"/>`;
    case 'temple': return `<path d="M${cx - 34} ${by} L${cx - 34} ${by - 24} L${cx} ${by - 42} L${cx + 34} ${by - 24} L${cx + 34} ${by} Z" fill="${n}"/>${[-22, -8, 6, 20].map(o => `<rect x="${cx + o}" y="${by - 22}" width="4" height="22" fill="${t.mid}"/>`).join('')}<path d="M${cx - 40} ${by - 8} Q${cx - 30} ${by - 30} ${cx - 20} ${by - 26}" stroke="${g}" stroke-width="2" fill="none" opacity=".7"/>`;
    case 'pyramid': return `<path d="M${cx - 44} ${by} L${cx} ${by - 44} L${cx + 44} ${by} Z" fill="${n}"/><path d="M${cx} ${by - 44} L${cx + 44} ${by} L${cx + 10} ${by} Z" fill="#000" opacity=".3"/><rect x="${cx - 5}" y="${by - 12}" width="10" height="12" fill="${g}" opacity=".7"/>`;
    case 'crypt': return `<rect x="${cx - 26}" y="${by - 30}" width="52" height="30" fill="${n}"/><path d="M${cx - 30} ${by - 30} L${cx} ${by - 46} L${cx + 30} ${by - 30} Z" fill="${n}"/><path d="M${cx - 8} ${by} L${cx - 8} ${by - 16} Q${cx} ${by - 24} ${cx + 8} ${by - 16} L${cx + 8} ${by} Z" fill="${g}" opacity=".55"/><rect x="${cx - 2}" y="${by - 44}" width="4" height="12" fill="${g}" opacity=".8"/>`;
    case 'throne': return `<path d="M${cx - 18} ${by} L${cx - 18} ${by - 40} L${cx - 10} ${by - 52} L${cx - 2} ${by - 40} L${cx + 6} ${by - 52} L${cx + 14} ${by - 40} L${cx + 18} ${by - 40} L${cx + 18} ${by} Z" fill="${n}"/><rect x="${cx - 26}" y="${by - 6}" width="52" height="6" fill="${g}" opacity=".8"/><path d="M${cx - 50} ${by + 2} Q${cx} ${by - 6} ${cx + 50} ${by + 2}" stroke="${g}" stroke-width="2" fill="none"/>`;
    case 'forge': return `<rect x="${cx - 30}" y="${by - 26}" width="60" height="26" fill="${n}"/><rect x="${cx + 10}" y="${by - 50}" width="10" height="26" fill="${n}"/><rect x="${cx - 12}" y="${by - 16}" width="16" height="12" fill="${g}"/><path d="M${cx + 15} ${by - 52} q6 -10 -2 -18 q8 6 4 -14" stroke="#6a6058" stroke-width="5" fill="none" opacity=".6"/>`;
    case 'rift': return `<path d="M${cx} ${h * 0.15} L${cx - 8} ${h * 0.4} L${cx + 6} ${h * 0.5} L${cx - 6} ${by}" stroke="${g}" stroke-width="4" fill="none"/><ellipse cx="${cx}" cy="${h * 0.48}" rx="22" ry="34" fill="${g}" opacity=".18"/>`;
    case 'bell': return `<path d="M${cx - 16} ${by - 8} Q${cx - 16} ${by - 40} ${cx} ${by - 42} Q${cx + 16} ${by - 40} ${cx + 16} ${by - 8} L${cx + 20} ${by - 4} L${cx - 20} ${by - 4} Z" fill="${n}"/><circle cx="${cx}" cy="${by}" r="4" fill="${g}"/><path d="M0 ${by + 4} Q${w / 4} ${by - 2} ${w / 2} ${by + 4} T${w} ${by + 4} L${w} ${h} L0 ${h} Z" fill="${g}" opacity=".25"/>`;
  }
  return '';
}

/** 目的地风格画：key = 副本 id / 地图 id / 'abyss' / 'pack'；seedKey 决定剪影形状 */
export function travelArt(key: string, fallback: string, w = 160, h = 96, seedKey = key): string {
  const t = T[key] ?? T[fallback] ?? T.camp, rnd = R(hash(seedKey)), id = `tva${++uid}`;
  const stars = t.stars ? Array.from({ length: 24 }, () => `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h * 0.5).toFixed(1)}" r="${(0.4 + rnd() * 0.9).toFixed(2)}" fill="#fff" opacity="${(0.4 + rnd() * 0.6).toFixed(2)}"/>`).join('') : '';
  return `<svg class="tv-art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[0]}"/><stop offset="1" stop-color="${t.sky[1]}"/></linearGradient>
<radialGradient id="${id}v" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
<filter id="${id}n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${hash(seedKey) % 97}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
<rect width="${w}" height="${h}" fill="url(#${id}s)"/>${stars}
<circle cx="${(w * (0.2 + rnd() * 0.25)).toFixed(1)}" cy="${(h * 0.28).toFixed(1)}" r="${(h * 0.12).toFixed(1)}" fill="${t.glow}" opacity=".35"/>
<path d="${ridge(rnd, w, h, h * 0.55, h * 0.18, 5, t.motif === 'pines' || t.motif === 'volcano')}" fill="${t.far}"/>
<path d="${ridge(rnd, w, h, h * 0.68, h * 0.14, 4)}" fill="${t.mid}"/>
${motif(t.motif, t, w, h, rnd)}
<path d="${ridge(rnd, w, h, h * 0.84, h * 0.06, 6)}" fill="${t.near}"/>
<rect width="${w}" height="${h}" fill="#fff" filter="url(#${id}n)"/>
<rect width="${w}" height="${h}" fill="url(#${id}v)"/></svg>`;
}
