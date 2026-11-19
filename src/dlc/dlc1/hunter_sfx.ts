// ======================================================================
// DLC1「灵契猎手」专属音效（v1.0.9）→ ClassExt.fx.sfx
// 之前猎手出声全是本体战士的挥砍 / 旋风 / 雷鸣 / 天神下凡。现在按形态换声音：
//   狼 = 爪撕 + 低吼 + 狼嚎；熊 = 重掌闷响 + 熊咆 + 碎石；鹰 = 破风 + 振翅 + 鹰唳；契约（无形态）= 木鸣 + 风。
// ======================================================================
import type { ClassFx, ClassFxKind, ClassSynthApi as A } from '../../core/ClassExt';
import type { ResolvedSkill } from '../../core/types';
import { _hunterFxTest } from './hunter_fx';
import { howl, growl, roar, screech, flaps, claw, wind, thud, rubble, pactChime } from './sfx_kit';

const { formOf } = _hunterFxTest;

/** 本形态的「兽声」 */
function call(S: A, f: ReturnType<typeof formOf>, d = 0, k = 1) {
  if (f === 'bear') roar(S, d, 0.3 * k, 0.8);
  else if (f === 'eagle') screech(S, d, 0.07 * k, 2);
  else howl(S, d, 0.09 * k, 0.9);
}

export const hunterSfx: NonNullable<ClassFx['sfx']> = (kind: ClassFxKind, s: ResolvedSkill, S: A) => {
  const f = formOf(s), id = s.baseId;
  switch (kind) {
    case 'melee': {
      if (!S.gate('hp_melee', 0.06)) return true;
      if (s.tags.includes('ranged')) { wind(S, 0, 0.25, 0.18, 900, 2600); S.tone({ f: 1400, f2: 500, dur: 0.18, gain: 0.05, type: 'triangle' }); return true; }   // 缚兽索：甩索破风
      if (f === 'bear') { thud(S, 0, 0.55, 140, 0.22); growl(S, 0, 0.12, 0.2, 80); }
      else if (f === 'eagle') { wind(S, 0, 0.12, 0.2, 1800, 5200); claw(S, 0.03, 2, 0.14); }
      else claw(S, 0, f === 'wolf' ? 3 : 2, 0.22);
      return true;
    }
    case 'dash': {
      if (f === 'eagle') { wind(S, 0, 0.3, 0.26, 600, 3200); flaps(S, 0, 2, 0.1, 0.18); }
      else if (f === 'bear') { thud(S, 0, 0.3, 90, 0.2); thud(S, 0.12, 0.3, 90, 0.2); growl(S, 0, 0.16, 0.3, 75); }
      else { wind(S, 0, 0.22, 0.22, 500, 2200); growl(S, 0.02, 0.14, 0.25); }
      return true;
    }
    case 'dashHit': {
      if (s.tags.includes('leap') || f === 'bear') { thud(S, 0, 0.7, 120, 0.35); rubble(S, 0, 6); }
      else { claw(S, 0, 3, 0.24); S.tone({ f: 200, f2: 60, dur: 0.12, gain: 0.4 }); }
      if (f === 'eagle') screech(S, 0, 0.05, 1);
      return true;
    }
    case 'spin': {
      // 兽魂旋击 / 群狼扑袭：兽魂绕身——一圈爪撕 + 本形态的兽声
      for (let i = 0; i < 3; i++) claw(S, i * 0.12, 2, 0.16);
      wind(S, 0, 0.45, 0.2, 400, 1600);
      if (f === 'eagle') flaps(S, 0, 4, 0.1);
      else if (id === 'hp_shift_wolf' || f === 'wolf') howl(S, 0.15, 0.07, 0.7, 480);
      else growl(S, 0.05, 0.16, 0.4);
      return true;
    }
    case 'nova': case 'slam': {
      if (s.tags.includes('shout')) { call(S, f === 'pact' ? 'wolf' : f, 0, 1.2); wind(S, 0.1, 0.6, 0.14, 300, 900); return true; }   // 慑魂嚎
      if (id === 'hp_ward') { pactChime(S, 0, 0.06); S.noise({ f: 700, f2: 300, dur: 0.4, gain: 0.18, q: 0.8, a: 0.05 }); return true; }   // 兽皮护契：皮甲收紧
      // 震地咆哮 / 其他砸地：熊掌闷响 + 熊咆 + 碎石
      thud(S, 0, 0.85, 110, 0.45); rubble(S, 0, 8); roar(S, 0.02, 0.22, 0.6);
      return true;
    }
    case 'targeted': {
      if (id === 'hp_totem') { wind(S, 0, 0.2, 0.15, 2000, 500); thud(S, 0.2, 0.6, 150, 0.3); pactChime(S, 0.22, 0.08); return true; }   // 图腾柱钉进地里
      if (f === 'eagle' || id === 'hp_u_skyhunt') {
        // 鹰群俯冲：长鸣 → 下坠破风 → 落点
        screech(S, 0, 0.08, 3);
        S.noise({ d: 0.05, f: 4000, f2: 700, dur: 0.38, gain: 0.22, q: 2, a: 0.3 });
        thud(S, 0.42, 0.5, 160, 0.25); claw(S, 0.42, 3, 0.2);
        return true;
      }
      // 狂猎：四方狼群合围——几声狼嚎错开 + 扑咬
      howl(S, 0, 0.08, 0.8, 400); howl(S, 0.12, 0.06, 0.8, 520); howl(S, 0.2, 0.05, 0.7, 340);
      for (let i = 0; i < 4; i++) growl(S, 0.35 + i * 0.07, 0.1, 0.18, 90 + i * 12);
      claw(S, 0.4, 4, 0.2);
      return true;
    }
    case 'line': case 'cone': {
      if (id === 'hp_maul' || f === 'bear') {
        // 裂地猛击：一路裂过去的闷响
        for (let i = 0; i < 5; i++) thud(S, i * 0.07, 0.5 - i * 0.06, 130 - i * 8, 0.25);
        rubble(S, 0.05, 10, 0.12); growl(S, 0, 0.14, 0.35, 70);
        return true;
      }
      // 百兽奔袭：蹄声奔腾 + 兽声混在一起
      for (let i = 0; i < 9; i++) thud(S, i * 0.055, 0.28, 100 + (i % 3) * 25, 0.12);
      howl(S, 0, 0.06, 0.6, 460); growl(S, 0.08, 0.14, 0.4, 72); screech(S, 0.15, 0.04, 1);
      wind(S, 0, 0.5, 0.16, 300, 1200);
      return true;
    }
    case 'blink': {
      wind(S, 0, 0.28, 0.24, 400, 3000);
      if (f === 'eagle') flaps(S, 0.05, 2); else if (f === 'bear') thud(S, 0.2, 0.35, 120, 0.2); else growl(S, 0.15, 0.08, 0.18);
      return true;
    }
    case 'ultimate': {
      if (id === 'hp_spiritbeast' || id === 'hp_u_earthshaker') {
        // 巨熊立起再砸下
        roar(S, 0, 0.4, 1.1); thud(S, 0.55, 1, 70, 0.8); rubble(S, 0.55, 12, 0.14);
        return true;
      }
      if (id === 'hp_u_packlord') {
        howl(S, 0, 0.1, 1.1, 380); howl(S, 0.2, 0.07, 1, 500);
        S.noise({ d: 0, f: 600, f2: 200, dur: 1.2, gain: 0.2, type: 'lowpass', a: 0.3 });   // 浪涌
        return true;
      }
      // 万兽归一：狼嚎 + 熊咆 + 鹰唳先后响起，最后契约和声落下
      howl(S, 0, 0.1, 1, 400); roar(S, 0.25, 0.28, 0.8); screech(S, 0.5, 0.07, 2);
      thud(S, 0.75, 0.9, 80, 0.7);
      [57, 64, 69, 73, 76].forEach((n, i) => S.tone({ d: 0.8 + i * 0.05, f: 440 * Math.pow(2, (n - 69) / 12), dur: 1.4, gain: 0.03, type: 'triangle', lp: 2600 }));
      return true;
    }
    case 'projectile': {
      if (!S.gate('hp_proj', 0.07)) return true;
      // 羽刃：细长的破风哨音；苍鹰俯冲带一声短唳
      const fq = 2200 + Math.random() * 600;
      S.tone({ f: fq, f2: fq * 0.6, dur: 0.22, gain: 0.04, type: 'sine' });
      wind(S, 0, 0.2, 0.16, 1500, 4500);
      if (id === 'hp_shift_eagle') screech(S, 0, 0.05, 1);
      return true;
    }
  }
  return false;
};
