// ======================================================================
// DLC1「负棺人」专属音效（v1.0.9）→ ClassExt.fx.sfx
// 之前负棺人出声全是本体战士的挥砍 / 旋风 / 雷鸣 / 天神下凡。现在主角是那口铁棺：
//   棺击 = 铁器闷撞；拖棺 = 刮地火星；链棺 = 铁链哗啦；落棺 = 下坠呼啸（落地声在表现里按落地时刻放）；
//   丧钟 = 真的钟声；送葬 / 安魂 = 低沉挽歌；开棺 = 棺盖吱呀 + 按魂的种类放出不同音高的亡魂低语。
// ======================================================================
import type { ClassFx, ClassFxKind, ClassSynthApi as A } from '../../core/ClassExt';
import type { ResolvedSkill } from '../../core/types';
import type { Soul } from './coffin_skills';
import { openInfo } from './coffin_fx';
import { clang, bell, chains, scrape, creak, whisper, dirge, fall, thud, wind, rubble } from './sfx_kit';

/** 四种魂的声音：兽 = 低吼般的低音，人 = 中音叹息，巨 = 很低的闷鸣，诡 = 高而飘忽 */
const SOUL_F: Record<Soul, number> = { beast: 260, man: 520, giant: 170, eldritch: 900 };

function openSfx(S: A, souls: Soul[]) {
  creak(S, 0, 0.55, 0.07);
  clang(S, 0.5, 0.1, 140, 0.8); thud(S, 0.5, 0.6, 90, 0.4);   // 棺盖炸开
  souls.forEach((so, i) => whisper(S, 0.55 + i * 0.12, SOUL_F[so] * (0.95 + Math.random() * 0.1), 0.055, 0.9));
  if (souls.includes('giant')) thud(S, 0.7, 0.5, 60, 0.6);
  if (souls.includes('beast')) S.tone({ d: 0.6, f: 110, f2: 80, dur: 0.4, gain: 0.12, type: 'sawtooth', lp: 600, vib: 120, vibHz: 28 });
  if (souls.includes('eldritch')) S.tone({ d: 0.6, f: 1800, f2: 2600, dur: 0.6, gain: 0.025, type: 'sine', vib: 80, vibHz: 9 });
}

export const coffinSfx: NonNullable<ClassFx['sfx']> = (kind: ClassFxKind, s: ResolvedSkill, S: A) => {
  const id = s.baseId, op = openInfo(s);
  if (op && kind !== 'projectile') { if (S.gate('cf_open', 0.4)) openSfx(S, op.souls); return true; }   // 开棺：不管组合是什么形状，先开棺
  if (op && S.gate('cf_open', 0.4)) openSfx(S, op.souls);   // 弹体组合（千刃送行 / 噬魂兽）：开棺声 + 下面的刃声
  switch (kind) {
    case 'melee': {
      if (!S.gate('cf_melee', 0.06)) return true;
      if (s.tags.includes('ranged')) { chains(S, 0, 7, 0.25, 0.06); wind(S, 0, 0.2, 0.12, 700, 2000); clang(S, 0.22, 0.06, 300, 0.3); return true; }   // 缚棺链
      // 棺击：铁棺抡下来的风声 + 铁器闷撞
      wind(S, 0, 0.14, 0.18, 300, 900);
      thud(S, 0.08, 0.55, 130, 0.22); clang(S, 0.08, 0.07, 190, 0.45);
      return true;
    }
    case 'dash': { scrape(S, 0, s.tags.includes('leap') ? 0.36 : 0.26, 0.24); chains(S, 0, 4, 0.2, 0.04); return true; }
    case 'dashHit': {
      if (s.tags.includes('leap')) return true;   // 棺跃落地：表现里的铁棺落地声已经放了
      thud(S, 0, 0.6, 120, 0.3); clang(S, 0, 0.09, 170, 0.6);
      return true;
    }
    case 'spin': {
      // 链棺横扫：铁链哗啦 + 铁棺划过的重风
      chains(S, 0, 12, 0.45, 0.06);
      S.noise({ f: 220, f2: 600, dur: 0.45, gain: 0.32, q: 1.2, a: 0.08 });
      clang(S, 0.4, 0.06, 210, 0.4);
      return true;
    }
    case 'nova': case 'slam': {
      if (s.tags.includes('shout')) { bell(S, 0, 0.16, 98, 2.6); bell(S, 0.55, 0.07, 98 * 1.335, 1.6); return true; }   // 丧钟：两声钟
      if (id === 'cf_shroud') { S.noise({ f: 400, f2: 1600, dur: 0.6, gain: 0.26, q: 0.9, a: 0.15 }); whisper(S, 0.1, 480, 0.04, 0.7); return true; }   // 裹尸布卷起
      thud(S, 0, 0.8, 100, 0.45); clang(S, 0, 0.1, 150, 0.7); rubble(S, 0, 8);
      return true;
    }
    case 'targeted': {
      if (id === 'cf_gravefield' || id === 'cf_u_warden') {
        if (id === 'cf_u_warden') bell(S, 0, 0.1, 73, 2.4);   // 腐冢永夜（原守陵永夜）
        // 万冢：大地低鸣，墓碑一块块顶出来
        S.noise({ f: 120, f2: 60, dur: 0.9, gain: 0.4, type: 'lowpass', a: 0.2 });
        for (let i = 0; i < 6; i++) { thud(S, 0.15 + i * 0.08, 0.3, 160 + Math.random() * 60, 0.18); rubble(S, 0.15 + i * 0.08, 2, 0.08); }
        whisper(S, 0.3, 420, 0.045, 1.1);
        return true;
      }
      // 落棺 / 百棺齐落：下坠呼啸（落地声由表现在落地时刻放）
      fall(S, 0, id === 'cf_hundred' ? 0.45 : 0.3, 0.14);
      if (id === 'cf_hundred') { bell(S, 0, 0.08, 87, 2.2); dirge(S, 0.1, 0.022, 1.6, 41); }
      return true;
    }
    case 'line': case 'cone': {
      if (id === 'cf_procession') {
        // 送葬行列：送葬鼓点 + 挽歌 + 铁链
        for (let i = 0; i < 4; i++) thud(S, i * 0.22, 0.45, 85, 0.3);
        dirge(S, 0, 0.032, 1.4, 45); chains(S, 0.1, 6, 0.6, 0.04);
        return true;
      }
      // 锁魂链：铁链笔直甩出，钩住一串亡魂
      chains(S, 0, 14, 0.3, 0.07); wind(S, 0, 0.3, 0.16, 600, 2600); whisper(S, 0.25, 600, 0.04, 0.6);
      return true;
    }
    case 'blink': { S.noise({ f: 300, f2: 1400, dur: 0.35, gain: 0.24, q: 0.8, a: 0.08 }); whisper(S, 0.05, 700, 0.05, 0.5); return true; }   // 寿衣步：布幔一卷
    case 'ultimate': {
      if (id === 'cf_ferry') {
        // 冥河引魂（原冥河摆渡）：冥河水声 + 摆渡钟 + 亡魂低语
        S.noise({ f: 500, f2: 260, dur: 1.6, gain: 0.22, type: 'lowpass', a: 0.4 });
        bell(S, 0.1, 0.09, 131, 2); whisper(S, 0.3, 380, 0.05, 1.2); whisper(S, 0.6, 560, 0.04, 1);
        return true;
      }
      // 安魂葬礼：巨棺升起（低鸣）→ 棺盖吱呀 → 钟声 + 挽歌 + 亡魂升空
      S.noise({ f: 90, f2: 160, dur: 0.45, gain: 0.35, type: 'lowpass', a: 0.2 });
      creak(S, 0.4, 0.4, 0.07);
      bell(S, 0.55, 0.18, 82, 3); dirge(S, 0.6, 0.035, 2, 40);
      ['man', 'eldritch', 'man', 'beast'].forEach((so, i) => whisper(S, 0.7 + i * 0.12, SOUL_F[so as Soul], 0.04, 1));
      return true;
    }
    case 'projectile': {
      if (!S.gate('cf_proj', 0.07)) return true;
      // 送行刀 / 魂火：薄刃旋转的嘶嘶声
      const fq = 1600 + Math.random() * 500;
      S.tone({ f: fq, f2: fq * 1.4, dur: 0.18, gain: 0.035, type: 'triangle', vib: 300, vibHz: 24 });
      wind(S, 0, 0.18, 0.14, 1200, 3500);
      return true;
    }
  }
  return false;
};

/** 11-04 立棺墓碑 墓碑回响（特效文档 §3.1）：音效同技能但像从棺里传出来的回声——低通 1200Hz、音量减半、0.15 秒混响尾巴 */
export function echoSfx(S: A): boolean {
  if (!S.gate('cf_echo', 0.15)) return true;
  S.noise({ f: 900, f2: 300, dur: 0.32, gain: 0.12, type: 'lowpass', a: 0.01, d: 0.3 });
  S.tone({ f: 150, f2: 120, dur: 0.3, gain: 0.08, type: 'triangle', lp: 1200 });
  S.tone({ d: 0.12, f: 150, f2: 110, dur: 0.15, gain: 0.03, type: 'triangle', lp: 900 });   // 混响尾巴
  return true;
}
/** 11-04 立棺墓碑 负棺人音效入口：回响走 echoSfx，其余同 coffinSfx */
export const coffinSfxAll: NonNullable<ClassFx['sfx']> = (kind, s, S) => (s.tags.includes('echo') ? echoSfx(S) : coffinSfx(kind, s, S));
