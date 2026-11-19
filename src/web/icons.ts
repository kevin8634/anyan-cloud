// 图标：手绘风格位图（assets/icons，本项目原创，见 assets/ART_LICENSE.md）
// 用 CSS 类引用（.ic-xxx），图片只在样式表里出现一次；外框（斜面金属边、内发光、品质色）由 CSS 画
// 另外在这里生成界面用的原创装饰：金属转角花纹（SVG）、羊皮纸背景
import { ICONS, TEXTURES } from './assets.gen';
import { PARCH_UI } from './parchui.gen';

let installed = false;
/** 启动时调用一次：把所有图标、羊皮纸、转角花纹写进样式表 */
export function installArt() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const css: string[] = [];
  for (const [k, url] of Object.entries(ICONS)) css.push(`.ic-${k}{background-image:url(${url})}`);
  if (TEXTURES.parchment) css.push(`.parch{background-image:url(${TEXTURES.parchment})}`);
  if (TEXTURES.stone) css.push(`.stonebg{background-image:url(${TEXTURES.stone})}`);
  // 11-16 界面羊皮纸主题（html.ui-parch，样式见 index.html）：窗口底纹 / 青铜边 / 角饰 / 标题皮革 / 按钮三态 / 勾选框 / 物品格 / 分隔线 / 关闭键 / 滚动条
  css.push(`:root{${Object.entries(PARCH_UI).map(([k, url]) => `--pu-${k.replace(/_/g, '-')}:url(${url})`).join(';')}}`);
  const c = (rot: number) => `url("data:image/svg+xml;utf8,${encodeURIComponent(cornerSvg(rot))}")`;
  css.push(`.orn::before{background-image:${c(0)},${c(90)},${c(270)},${c(180)}}`);
  const st = document.createElement('style');
  st.textContent = css.join('\n');
  document.head.appendChild(st);
}

/** 原创转角花纹：金色卷草 + 红宝石，按角度旋转复用到四个角 */
function cornerSvg(rot: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#e2b24a"/><stop offset=".7" stop-color="#8a5a16"/><stop offset="1" stop-color="#f0cf6a"/></linearGradient>` +
    `<radialGradient id="r" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ffb0a0"/><stop offset=".4" stop-color="#d02020"/><stop offset="1" stop-color="#4a0000"/></radialGradient></defs>` +
    `<g transform="rotate(${rot} 24 24)" stroke="#2a1606" stroke-width="1.2" stroke-linejoin="round">` +
    `<path d="M2 2 H30 Q26 6 20 6 H8 Q6 6 6 8 V20 Q6 26 2 30 Z" fill="url(#g)"/>` +
    `<path d="M10 10 Q22 8 28 14 Q20 12 16 16 Q12 20 14 28 Q8 22 10 10 Z" fill="url(#g)"/>` +
    `<path d="M30 2 Q38 2 40 8 Q36 6 33 8 Z M2 30 Q2 38 8 40 Q6 36 8 33 Z" fill="url(#g)"/>` +
    `<circle cx="11" cy="11" r="4.6" fill="url(#r)"/><circle cx="9.6" cy="9.6" r="1.3" fill="#fff" stroke="none" opacity=".8"/></g></svg>`;
}

/** v1.0.8：内容包职业自带图标（key → data URL）。装好样式表之后再加也会补一段样式 */
export function addIcons(map: Record<string, string>) {
  const css: string[] = [];
  for (const [k, url] of Object.entries(map)) { if ((ICONS as Record<string, string>)[k]) continue; (ICONS as Record<string, string>)[k] = url; css.push(`.ic-${k}{background-image:url(${url})}`); }
  if (installed && css.length && typeof document !== 'undefined') { const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st); }
}
const has = (k: string) => !!ICONS[k];
export const hasIcon = has;
const pic = (k: string, extra = '', style = '') => `<i class="pic ic-${has(k) ? k : 'ui_class'} ${extra}"${style ? ` style="${style}"` : ''}></i>`;

/** 技能图标：元素变了（天赋/装备变种）就叠一层元素色光 */
/** v1.0.6：图标别名（内容包职业的技能 / 底材借用本体图标；ClassDef.ext.icons，启动时登记） */
export const ICON_ALIAS: Record<string, string> = {};
export function skillIcon(baseId: string, elementColor: string, variant = false) {
  return pic(!has(`sk_${baseId}`) && ICON_ALIAS[baseId] ? ICON_ALIAS[baseId] : `sk_${baseId}`, variant ? 'tint' : '', variant ? `--tint:${elementColor}` : '');
}

const BASE_ICON: Record<string, string> = {
  // 武器 / 副手
  b_sword: 'it_sword', b_axe: 'it_axe', b_mace: 'it_mace', b_greatsword: 'it_greatsword', b_greataxe: 'it_greataxe', b_shield: 'it_shield',
  b_staff: 'it_staff', b_wand: 'it_wand', b_dagger: 'it_dagger', b_tome: 'it_tome', b_orb: 'it_orb',
  // 重甲
  b_helm: 'it_helm', b_pauldron: 'it_plate_shoulder', b_chest: 'it_pauldron', b_bracer: 'it_bracer', b_gauntlet: 'it_gauntlet', b_girdle: 'it_girdle', b_legs: 'it_sabaton', b_sabaton: 'it_plate_boots',
  // 布甲
  b_hood: 'it_hood', b_mantle: 'it_mantle', b_robe: 'it_robe', b_wrap: 'it_cloth_wrap', b_silk_gloves: 'it_silk_gloves', b_sash: 'it_sash', b_cloth_legs: 'it_cloth_legs', b_cloth_shoes: 'it_cloth_shoes',
  // 时砂行者（v0.7.0）
  b_chakram: 'it_chakram', b_hourglass: 'it_hourglass', b_lhood: 'it_leather_hood', b_lshoulder: 'it_leather_shoulder', b_lvest: 'it_leather_vest', b_lbracer: 'it_leather_bracer',
  b_lgloves: 'it_leather_gloves', b_lbelt: 'it_leather_belt', b_llegs: 'it_legs', b_lboots: 'it_leather_boots',
  // 炼金投弹手（v0.7.1）：布甲沿用法师布甲的图标
  b_flask: 'it_flask', b_reagent: 'it_reagent', b_amask: 'it_hood', b_amantle: 'it_mantle', b_acoat: 'it_robe', b_awrap: 'it_cloth_wrap',
  b_agloves: 'it_silk_gloves', b_abelt: 'it_sash', b_alegs: 'it_cloth_legs', b_aboots: 'it_cloth_shoes',
  // 通用
  b_cloak: 'it_cloak', b_amulet: 'it_amulet', b_necklace: 'it_necklace', b_ring: 'it_ring', b_signet: 'it_signet', b_idol: 'it_idol',
};
/** 没有对应底材（老存档、固定装备）时按类别 */
const SLOT_ICON: Record<string, string> = {
  oneHand: 'it_sword', twoHand: 'it_greatsword', offHand: 'it_shield', head: 'it_helm', neck: 'it_amulet', shoulder: 'it_plate_shoulder', back: 'it_cloak',
  chest: 'it_pauldron', wrist: 'it_bracer', hands: 'it_gauntlet', waist: 'it_girdle', legs: 'it_legs', feet: 'it_plate_boots', ring: 'it_ring', trinket: 'it_idol',
};
// v1.2.28 图标对应修正：it_pauldron 这张画的是板甲胸甲 → 当重甲胸甲；it_sabaton 画的是板甲护腿 → 当重甲护腿；肩甲 / 战靴用新画的 it_plate_shoulder / it_plate_boots
/** 装备图标：按底材；品质边框由外层 .slot.q-xxx 决定 */
export function itemIcon(baseIdOrSlot: string, slot?: string) {
  const b0 = baseIdOrSlot.replace(/_d40$/, '');   // v1.2.38b 40 级暗金专用底材（id 末尾 _d40）沿用原底材图标
  return pic(BASE_ICON[baseIdOrSlot] ?? ICON_ALIAS[baseIdOrSlot] ?? BASE_ICON[b0] ?? ICON_ALIAS[b0] ?? SLOT_ICON[slot ?? baseIdOrSlot] ?? 'it_ring');
}

/** 天赋图标：节点配置里直接写图标 key（复用技能/天赋/装备图标）；没有就用职业图标 */
export function talentIcon(iconKey: string, on: boolean) { return pic(has(iconKey) ? iconKey : 'ui_class', on ? '' : 'off'); }

const STACK_ICON: Record<string, string> = { potion_s: 'it_potion_s', potion_l: 'it_potion_l', mat_dust: 'mat_dust', mat_shard: 'mat_shard', mat_essence: 'mat_essence', mat_soul: 'mat_soul', mat_relic: 'mat_soul',
  // v0.5 C：兑换货币 / 保护符 / 灰色杂物（复用现有手绘图标）
  cur_ember: 'tl_flame', cur_frost: 'tl_frost', cur_sigil: 'ui_portal', mat_abyss: 'ui_portal', mat_ember: 'tl_flame', tome_any: 'it_tome', tome_page: 'it_tome', charm_protect: 'tl_barrier', junk_fang: 'tl_wrath', junk_cloth: 'it_cloth_wrap', junk_trinket: 'it_ring', junk_ash: 'tl_scorch' };
export function stackIcon(id: string) { return pic(STACK_ICON[id] ?? 'ui_bag'); }

/** 界面图标（金币、任务、铁砧、分解、背包、传送门、篝火、职业、升级、头像…） */
export function uiIcon(id: string, extra = '') { return pic(id, extra); }
