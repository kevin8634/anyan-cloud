// ======================================================================
// DLC1 配音与曲目（v1.2.48）：首领登场 / 最后阶段 / 倒下的配音 + 开场旁白 + 按区域选曲
//   音频本身只在比赛版构建里有（assets_aholo/dlc1/audio → audio.gen.ts：配音 data URI 内联、曲目只登记名字，文件在页面旁 music/）；
//   普通版构建 PACK_VO / PACK_MUSIC 为空 → 这里全部返回 null，本体照旧走原有喊话和程序化音乐。
//   台词文案：vo/boss_vo_script.json（draft-1）；转阶段配音挂每个首领的最后一个 / 狂暴阶段（本体传 last）。
// ======================================================================
import type { PackAudio, PackVoiceLine, MusicScene } from '../../core/ContentPacks';
import { packCtx } from '../../core/ContentPacks';
import { PACK_VO, PACK_MUSIC } from './audio.gen';
import { BT_ID, BT_O } from './belltower';
import { FORGE_MAP, FORGE_O } from './forge';
import { WELL_MAP, WELL_O } from './raid_well';
import { MIRROR_ID, MIRROR_O } from './mirror';
import { COAST_ID, COAST_O } from './coast';

/** 首领 key（沉眠者 A / B 共用一套）→ 台词 */
export const VO_LINES: Record<string, { intro: string; phase: string; death: string }> = {
  bt_b1: { intro: '我胸中这口钟，空了一千年。就借你的骨头，做它的舌。', phase: '起来，铜的孩子。替我把钟敲响。', death: '原来碎裂……也算一声钟响。' },
  bt_b2: { intro: '嘘。钟不响，人便不许出声。你的喉咙，太吵了。', phase: '弟子们，以沉默为来客送葬。', death: '这一口气，我替钟憋了一千年。' },
  bt_b3: { intro: '第一声是我敲的。最后一声，轮不到你这样的手。', phase: '绳断了，回声还攥在我手里。', death: '一千年……这根绳，原来这么轻。' },
  fg_b1: { intro: '模子还热着。躺进去吧，你会是一口好钟。', phase: '铜水满了。起来，模子里的兄弟们。', death: '铸模裂了……这一炉，又废了。' },
  fg_b2: { intro: '锤落无声，火才听得见。来，让我淬一淬你。', phase: '学徒们，起炉。这块铁，还没冷透。', death: '锤子凉了……我终于听见了自己的炉火。' },
  fg_b3: { intro: '孩子，你听过的每一声钟响，都是从我身体里铸出来的。', phase: '我的孩子们，回到炉里来。我们重铸一口钟。', death: '我凉下来了……这世上，再不会有新的钟声。' },
  dwb_whale: { intro: '潮退，是我在吸气。陆上的小东西，海要回来了。', phase: '三钟齐鸣——让海，淹没所有回声。', death: '我沉下去……潮，会替我记得这片岸。' },
  dwb_knights: { intro: '站住。镜渊城宵禁未解，生人不得过长街。', phase: '以镜为盾，以影为誓——镜渊城不陷！', death: '倒影散了……城门，交给你守了。' },
  bt_sleeper: { intro: '钟声……又是钟声。一千年了，我连梦都是铜做的。', phase: '海，倒灌进来吧。把这座塔，连同钟一起吞下。', death: '黑潮退了……可我，一直都在海底。' },
};
export const OPENING_TEXT = '地底之海的穹顶之下，倒悬着一座城，名为镜渊。千年前，鸣钟人在城心铸下倒垂之钟，以钟声为绳，将海底的沉眠者缚入长梦。如今钟声断绝，潮水倒退，亡者的回响正从镜中醒来。';

const voKey = (key: string) => (key.startsWith('bt_sleeper') ? 'bt_sleeper' : key);
const EV = { spawn: 'intro', phase: 'phase', death: 'death' } as const;

export function dlc1BossVoice(key: string, ev: 'spawn' | 'phase' | 'death', phase?: { name: string; index: number; last: boolean }): PackVoiceLine | null {
  if (ev === 'phase' && !phase?.last) return null;
  const k = voKey(key), lines = VO_LINES[k]; if (!lines) return null;
  const src = PACK_VO[`${k}_${EV[ev]}`]; if (!src) return null;
  return { src, text: lines[EV[ev]] };
}

// 倒钟广场（镜渊城主营地，局部 0, 58）：进 28 米算到了，出 36 米才算离开（避免边界来回切曲）
// 1107（Rhett 00:47「每个场景都不一样」）：DLC 各场景专属曲，不再互借。营地（倒钟广场 / 潮痕营地 / 钟楼脚下）共用营地曲 camp_refuge。
const CAMPS: Record<string, { x: number; z: number; enter: number; exit: number }> = {
  [MIRROR_ID]: { x: MIRROR_O.x, z: MIRROR_O.z + 58, enter: 28, exit: 36 },
  [COAST_ID]: { x: COAST_O.x, z: COAST_O.z + 62, enter: 24, exit: 32 },
  [BT_ID]: { x: BT_O.x + 4, z: BT_O.z + 92, enter: 26, exit: 34 },   // 11-14b 营地随面积 ×2 挪到 (4,92)
  [FORGE_MAP]: { x: FORGE_O.x, z: FORGE_O.z + 56, enter: 16, exit: 22 },   // 1108 熔炉入口营地（fg_camp 0,56）
  [WELL_MAP]: { x: WELL_O.x, z: WELL_O.z + 120, enter: 16, exit: 22 },     // 1108 钟井井口营地（0,120）
};
// 1108（Rhett 21:46 选 A 版）：每个营地单独一首；首领曲细分。曲目缺失时回退旧曲（camp_refuge / dlc_boss）。
const CAMP_TRACK: Record<string, string> = { [MIRROR_ID]: 'camp_bell_plaza', [COAST_ID]: 'camp_tidemark', [BT_ID]: 'camp_belfry_foot', [FORGE_MAP]: 'camp_forge_gate', [WELL_MAP]: 'camp_wellmouth' };
const has = (n: string) => PACK_MUSIC.includes(n);
const pick = (n: string, fb: string) => (has(n) ? n : fb);
function bossTrack(b: string): string {
  if (b.startsWith('bt_sleeper')) return 'final_boss_sleeper';
  if (b === 'wl_b5' || b.startsWith('wl_morvis')) return pick('boss_morvis', 'dlc_boss');
  if (b.startsWith('wl_')) return pick('boss_well', 'dlc_boss');
  if (b.startsWith('fg_')) return pick('boss_forge', 'dlc_boss');
  if (b.startsWith('dwb_')) return pick('boss_world', 'dlc_boss');
  return 'dlc_boss';
}
let inCamp = false, campZone = '';
function atCamp(zone: string): boolean {
  const c = CAMPS[zone];
  if (!c) { inCamp = false; return false; }
  if (campZone !== zone) { campZone = zone; inCamp = false; }
  const p = packCtx()?.playerPos();
  if (p) { const d = Math.hypot(p.x - c.x, p.z - c.z); inCamp = inCamp ? d < c.exit : d < c.enter; }
  return inCamp;
}
export function dlc1MusicFor(s: MusicScene): string | null {
  if (s.boss) return bossTrack(s.boss);
  if (atCamp(s.zone)) return pick(CAMP_TRACK[s.zone] ?? '', 'camp_refuge');
  if (s.zone === BT_ID) return 'silent_belfry';   // M3 无声钟楼
  if (s.zone === FORGE_MAP) return 'forge_bronze';   // 1107 钟铜熔炉专属
  if (s.zone === WELL_MAP) return 'well_abyss';   // 1107 潮渊钟井专属（之前无曲 = 程序化）
  if (s.zone === MIRROR_ID) return 'mirror_city';   // 1107 镜渊城城内专属（之前借 M3）
  if (s.zone === COAST_ID) return 'sunken_shore';   // M2 沉钟海岸
  return null;
}

export const DLC1_AUDIO: PackAudio = {
  bossVoice: dlc1BossVoice,
  opening: () => (PACK_VO.narrator_opening ? { src: PACK_VO.narrator_opening, text: OPENING_TEXT, who: '旁白' } : null),
  musicFor: dlc1MusicFor,
  tracks: () => Object.fromEntries(PACK_MUSIC.map(n => [n, `music/${n}.mp3`])),
};
