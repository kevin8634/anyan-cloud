// ========== v0.7.9：新手解锁节奏（各系统开放等级：升级时提示，角色面板显示「下一个解锁」） ==========
// 只列真正按等级开放的东西，等级取自各系统自己的常量，改了那边这里跟着变。
import { TALENT_START_LEVEL } from '../core/TalentTree';
import { SPIRIT_SLOT_LEVELS } from './spirits';
import { SKILL4_LEVEL, SKILL4B_LEVEL } from './skills_v078';
import { WILD, WILD_IDS } from './zones_wild';

export interface UnlockDef { lv: number; name: string; hint: string }
export const UNLOCKS: UnlockDef[] = [
  { lv: TALENT_START_LEVEL, name: '天赋树', hint: '每级 1 点，按 N 分配；可存 3 套天赋页' },
  ...SPIRIT_SLOT_LEVELS.map((lv, i) => ({ lv, name: `英灵传承槽 ${i + 1}`, hint: '按 Y 装备英灵' })),
  ...WILD_IDS.map(id => ({ lv: WILD[id].minLevel, name: `野外：${WILD[id].name}`, hint: '按 M 在世界地图传送' })),
  { lv: SKILL4_LEVEL, name: '第 4 技能槽「绝技」', hint: '按 4 施放' },
  { lv: SKILL4B_LEVEL, name: '第二个绝技 · 团队副本', hint: '按 K 在技能书里切换绝技' },
  { lv: 30, name: '暗岩印记', hint: '满级（装资料片后 40 级）后的经验转成印记经验；装资料片后 30–39 级在本体地图拿到的经验也会转入。在角色面板 C 里加点' },   // v0.7.10   // fix1108 #10 文案
].sort((a, b) => a.lv - b.lv);
export const unlocksAt = (lv: number) => UNLOCKS.filter(u => u.lv === lv);
export const nextUnlock = (lv: number) => UNLOCKS.find(u => u.lv > lv) ?? null;
