// 11-16 各图画风（Rhett：保留各图气候，复刻「秋林逆光」要合逻辑——提升画质画风，不硬套）。
// 气候沿用 field_flora_maps.ts：营地夏绿、翠风原野秋色、星落高原夏（高原晴空）、暗岩山麓夏山地、腐沼湿地、赤砂旱、霜脊冬、烬落灰烬；
// DLC：沉钟海岸海风、镜渊城冷雾、无声钟楼阴天、熔炉/钟井室内。
// vt = 光束暖度（光束颜色 = 太阳色 × mix(白, 暖橙, vt)）：冷光图（霜脊 / 镜渊城 / 钟楼）光束不染暖，钟楼阴天光束减到 0.6、浮尘 0.15。
// 11-17 sunEl：太阳封顶高度（秋林移植「太阳盘固定 + 低角」）——原野 16° 最低最暖、山地 20°、营地 24°、高原 30°（晴空高远）、冬 14°（冬日低太阳）；
//   湿地 / 旱地（强日）/ 灰烬不封顶。
// 11-17f DLC 光影（?off=dlclight 回 1117e 原样）：DLC1 户外三图接同一套太阳 / 天光 / 雾 / 阴影，只按气候调数——
//   沉钟海岸海风晴阴相间 22°、阴影 0.85；镜渊城冷雾低斜光 15°、阴影 0.7（雾里影子淡）；无声钟楼阴天 12°、阴影 0.55（云下漫射、影子软淡）。
//   shK = 主阴影浓度（three r170 LightShadow.intensity，1 = 原样）；本体各图 shK 一律 1，不动。熔炉 / 钟井室内不动。
// 每张图只调四样：调色预设（gfx GRADES）、空气浓度（雾密度 / 太阳内散射倍率）、体积光强度、秋林调色强度（ql）。
export interface MapLook { grade: string; fog: number; insc: number; vol: number; ql: number; mote: number; /** 光束暖度 0 冷白–1 暖 */ vt: number; /** 11-17 太阳封顶高度（度，0 = 原样扫过天空；seasky_core ssSetSunLock） */ sunEl: number; /** 11-17f 主阴影浓度（0–1，1 = 原样） */ shK: number }
export const L = (grade: string, fog: number, insc: number, vol: number, ql: number, mote = 0.5, vt = 0.7, sunEl = 0, shK = 1): MapLook => ({ grade, fog, insc, vol, ql, mote, vt, sunEl, shK });
/** 11-17f ?off=dlclight（或 localStorage darkrock_cine_off 含 dlclight）→ DLC 三图回 1117e（不封顶、阴影原样） */
export const DLC_LIGHT_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('dlclight'); } catch { return false; } })();
export const D = (on: [number, number]) => DLC_LIGHT_OFF ? [0, 1] as const : on;
export const MAP_LOOK: Record<string, MapLook> = {
  world:    L('camp', 0.9, 0.95, 0.8, 0.8, 0.45, 0.6, 24),     // 夏日营地：空气清、光束轻
  field:    L('field', 1.05, 1.25, 1.15, 1.0, 1.0, 1.0, 16),  // 秋色原野：秋林逆光本色——暖雾、光束最明显
  star:     L('star', 0.65, 0.9, 0.7, 0.7, 0.3, 0.4, 30),     // 高原：空气稀薄通透、远景清
  foothill: L('foothill', 1.0, 1.0, 1.0, 0.85, 0.7, 0.75, 20), // 山地林：林间光束
  marsh:    L('marsh', 1.7, 0.8, 1.3, 0.6, 0.9, 0.3),     // 湿地：浓湿雾、光散而不暖
  redsand:  L('redsand', 1.2, 1.1, 0.6, 0.7, 0.8, 1.0),   // 旱地：热尘霾、强日、少光束
  frost:    L('frost', 1.1, 0.7, 0.9, 0.5, 0.2, 0.0, 14),     // 冬：冷空气、低饱和
  ember:    L('lava', 1.3, 0.9, 0.7, 0.5, 0.6, 0.9),      // 灰烬：浓灰霾
  dungeon:  L('mine', 1, 1, 0.8, 0.5),
  raid:     L('lava', 1, 1, 0.8, 0.5),
};
/** 11-18 纯净度修复：内容包的图由包自己登记（src/dlc/<id>/ 启动时调 registerMapLook），本体不写任何 DLC 图名。
 *  prefix = 图 id 前缀（同前缀的分图 / 副本层都套这一套）；outdoor = 吃户外 Demo 光（秋林移植）；moonLit = 常夜图（主光固定月光、不吃昼夜，main.ts mirrorMoon）。 */
const PACK_LOOK: { prefix: string; look: MapLook; outdoor: boolean; moonLit: boolean }[] = [];
export function registerMapLook(prefix: string, look: MapLook, o: { outdoor?: boolean; moonLit?: boolean } = {}) { PACK_LOOK.push({ prefix, look, outdoor: !!o.outdoor, moonLit: !!o.moonLit }); }
const packLook = (zone: string) => PACK_LOOK.find(e => zone === e.prefix || zone.startsWith(e.prefix));
/** 常夜图（登记时 moonLit） */
export const isMoonLitZone = (zone: string) => !!packLook(String(zone))?.moonLit;
const DEF = L('field', 1, 1, 1, 0.8);
export function mapLook(zone: string): MapLook {
  if (MAP_LOOK[zone]) return MAP_LOOK[zone];
  return packLook(zone)?.look ?? DEF;
}
/** 当前图（cine.ts 每帧读雾 / 内散射倍率；gfx 读体积光 / 调色强度） */
export const LOOK_CUR: MapLook = { ...DEF };
/** 11-17g Rhett：「整套换成 Demo」（画质专长包 v8 秋林逆光）——户外图不再按气候分调，统一用 Demo：
 *  qlsun：太阳封顶 14°（Demo 太阳 (0.40,0.27,−1) 的仰角）、阴影浓度 1、雾 / 内散射倍率 1、光束暖度 1；
 *  qlrays：体积光强度 1；qlgrade：秋林调色权重 1、去掉各图分区调色（Demo 只有合成里那一套）。
 *  任一项 ?off= 掉就回各图气候值。副本 / 长副本 / 熔炉 / 钟井室内不动。 */
const offHas = (n: string) => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes(n); } catch { return false; } };
export const QL_DEMO = { sun: !offHas('qlsun'), rays: !offHas('qlrays'), grade: !offHas('qlgrade'), wind: !offHas('qlwind'), grass: !offHas('qlgrass'), fp: !offHas('fpcam') };
const OUTDOOR = ['world', 'field', 'star', 'foothill', 'marsh', 'redsand', 'frost', 'ember'];
export const isOutdoorLook = (zone: string) => OUTDOOR.includes(zone) || !!packLook(zone)?.outdoor;
export function demoLook(zone: string, lk: MapLook): MapLook {
  if (!isOutdoorLook(zone)) return lk;
  const o = { ...lk };
  if (QL_DEMO.sun && !isMoonLitZone(zone)) Object.assign(o, { sunEl: 14, shK: 1, fog: 1, insc: 1, vt: 1 });
  // 11-17g 常夜图（DLC 地底海城，Rhett 认可方案）：地底海穹顶，主光 = 东北破口照下的冷银月光（固定方向 SEA_MOON，约 50°，不跟昼夜），
  //   光束不染暖（vt 0）、雾加浓 1.4（深青、贴水面的高度雾）、太阳内散射 0.6，阴影浓度 1（钟乳石切出光柱）
  else if (QL_DEMO.sun) Object.assign(o, { sunEl: 0, shK: 1, fog: 1.4, insc: 0.6, vt: 0 });
  if (QL_DEMO.rays) o.vol = 1;
  if (QL_DEMO.grade) Object.assign(o, { ql: 1, grade: 'none' });
  return o;
}
export function setMapLook(zone: string) { Object.assign(LOOK_CUR, demoLook(zone, mapLook(zone))); return LOOK_CUR; }
