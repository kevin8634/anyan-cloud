// v1.2.67 天赋界面重做：各系专属暗岩纹章 + 节点框（Rhett 10-30：天赋页放大、图标重设计、各系专属暗岩风格、要有动态感）
// 纹章 = 40×40 线描 SVG，画在图标底下当水印、也画在系标题上；节点框 = 暗岩八角框 + 系色符文角标（CSS 负责动画）
// 内容包的系（id 不在下表）按 id 哈希挑一个通用纹章，避免本体出现资料片标识
const S = (d: string) => `<path d="${d}"/>`;
const SIGIL: Record<string, string> = {
  w_arms: S('M20 4 L23 22 L20 36 L17 22 Z') + S('M10 14 H30') + S('M14 30 L26 30'),   // 武器：长剑
  w_fury: S('M8 32 L20 6 L32 32') + S('M13 22 L20 30 L27 22') + S('M20 6 V14'),   // 狂怒：獠牙
  w_prot: S('M20 4 L33 9 V20 Q33 31 20 37 Q7 31 7 20 V9 Z') + S('M20 11 V30 M13 18 H27'),   // 防护：盾
  m_fire: S('M20 4 Q31 16 27 26 A8 8 0 0 1 13 26 Q9 16 20 4 Z') + S('M20 18 Q24 24 20 30 Q16 24 20 18'),   // 火焰
  m_frost: S('M20 4 V36 M6 12 L34 28 M6 28 L34 12') + S('M16 7 L20 11 L24 7 M16 33 L20 29 L24 33'),   // 冰霜：雪晶
  m_arcane: S('M20 5 L33 20 L20 35 L7 20 Z') + '<circle cx="20" cy="20" r="5"/>' + S('M20 5 V12 M20 28 V35'),   // 奥术：棱晶
  c_mark: '<circle cx="20" cy="20" r="13"/>' + S('M20 7 V20 L28 25'),   // 刻印：时针
  c_echo: S('M8 20 Q14 8 20 20 T32 20') + S('M8 28 Q14 16 20 28 T32 28'),   // 回响：波纹
  c_rewind: S('M30 12 A12 12 0 1 0 32 22') + S('M30 5 V12 H23'),   // 回溯：逆箭
  a_blast: '<circle cx="20" cy="22" r="9"/>' + S('M26 14 L31 8 M31 8 L34 10 M20 13 V6'),   // 爆破：炸瓶
  a_ground: S('M5 30 H35') + S('M10 30 L16 18 L22 26 L28 14 L33 30'),   // 地脉：山岩
  a_turret: S('M12 32 H28 L25 22 H15 Z') + S('M20 22 V12 H32') + '<circle cx="20" cy="12" r="3"/>',   // 炮台
};
const GENERIC = [
  S('M20 5 L34 20 L20 35 L6 20 Z M20 12 L27 20 L20 28 L13 20 Z'),
  '<circle cx="20" cy="20" r="13"/>' + S('M20 7 L24 20 L20 33 L16 20 Z'),
  S('M8 10 L32 10 L20 34 Z') + '<circle cx="20" cy="18" r="4"/>',
  S('M20 4 L24 16 L36 20 L24 24 L20 36 L16 24 L4 20 L16 16 Z'),
  S('M10 8 H30 V32 H10 Z M10 20 H30 M20 8 V32'),
  '<circle cx="20" cy="20" r="6"/><circle cx="20" cy="20" r="13"/>' + S('M20 3 V9 M20 31 V37 M3 20 H9 M31 20 H37'),
];
function hash(s: string) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function sigilSvg(specId: string, cls = 'tsig') {
  const body = SIGIL[specId] ?? GENERIC[hash(specId) % GENERIC.length];
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}
/** 暗岩八角框（盖在图标上）：外框 + 四角符文刻痕；颜色走 currentColor（= 系色） */
export const FRAME_SVG = `<svg class="tframe" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linejoin="round">`
  + `<path d="M18 2 H46 L62 18 V46 L46 62 H18 L2 46 V18 Z" stroke="#0c0906" stroke-width="4"/>`
  + `<path d="M18 3.5 H46 L60.5 18 V46 L46 60.5 H18 L3.5 46 V18 Z" stroke="currentColor" stroke-width="1.6" opacity=".9"/>`
  + `<path d="M6 16 L16 6 M48 6 L58 16 M58 48 L48 58 M16 58 L6 48" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`
  + `</g></svg>`;
