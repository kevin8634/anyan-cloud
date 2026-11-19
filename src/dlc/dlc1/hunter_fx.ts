// ======================================================================
// DLC1「灵契猎手」专属施法表现（v1.0.8）→ ClassExt.fx
// 之前猎手走本体默认表现 = 战士的旋风斩 / 雷霆一击 / 天神下凡金光柱 / 飞斧，看起来像战士。
// 现在按形态换颜色和主角：狼（银蓝，爪痕、狼魂扑咬）/ 熊（琥珀，熊掌砸地、裂地）/ 鹰（天青，羽刃、鹰魂俯冲）；
// 没形态标签（换形技本身带 wolf/bear/eagle）一律用契约青。只画表现，命中 / 伤害仍由本体结算。
// ======================================================================
import * as THREE from 'three';
import type { ClassFx, ClassFxApi, ClassFxKind } from '../../core/ClassExt';
import type { ResolvedSkill } from '../../core/types';
import { chain, chainStrip, fxGround, ghostMat, spiritWolf, spiritBear, spiritEagle, flap, makeTotem, featherBlade, arrowBolt, clawMarks, fade, pulses, rot, hex, P2 } from './fx_kit';

type F3 = 'wolf' | 'bear' | 'eagle' | 'pact';
const PAL: Record<F3, { c: number; c2: number; css: string; css2: string }> = {
  wolf: { c: 0x4a90ff, c2: 0x2050b0, css: '#4a90ff', css2: '#2050b0' },
  bear: { c: 0xff8a20, c2: 0x9a4010, css: '#ff8a20', css2: '#9a4010' },
  eagle: { c: 0x30c0ff, c2: 0x90e8ff, css: '#30c0ff', css2: '#90e8ff' },
  pact: { c: 0x20d0a8, c2: 0x0a7a60, css: '#20d0a8', css2: '#0a7a60' },
};
const formOf = (s: ResolvedSkill): F3 => (s.tags.includes('wolf') ? 'wolf' : s.tags.includes('bear') ? 'bear' : s.tags.includes('eagle') ? 'eagle' : 'pact');
const beastOf = (f: F3, c: number, sc = 1) => (f === 'bear' ? spiritBear(c, sc) : f === 'eagle' ? spiritEagle(c, sc * 1.4) : spiritWolf(c, sc));
const id = (s: ResolvedSkill) => s.baseId;

/** 兽魂扑向 to：从 from 出发、0.35 秒，带一点抛物线 */
function lunge(F: ClassFxApi, f: F3, from: P2, to: P2, c: number, sc = 1, dur = 0.35, h = 0.8) {
  const g = beastOf(f, c, sc), y0 = F.gy(from.x, from.z), y1 = F.gy(to.x, to.z);
  g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  let t = 0;
  F.live(g, dur, (k, dt) => {
    t += dt;
    g.position.set(from.x + (to.x - from.x) * k, y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * h + (f === 'eagle' ? 1.2 : 0), from.z + (to.z - from.z) * k);
    if (f === 'eagle') flap(g, t);
    fade(g, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  });
}
function burst(F: ClassFxApi, p: P2, f: F3, r: number, n = 40) {
  const P = PAL[f];
  F.fx('spark', { x: p.x, y: 0.6, z: p.z }, { count: n, color: 0xffffff, color2: P.c, colorEnd: P.c2, radius: 0.4, ring: true, speed: r * 2.6, up: 0.7, life: 0.4, size: 0.34, sizeEnd: 0.05, drag: 2 });
  if (f === 'bear') {
    F.fx('smoke', { x: p.x, y: 0.2, z: p.z }, { count: 16, color: 0x7a6248, color2: 0x5a4a38, colorEnd: 0x2a2420, radius: r * 0.4, ring: true, speed: r * 1.1, up: 0.25, life: 0.9, size: 1.1, sizeEnd: 2.2, drag: 2.2 });
    F.fx('shard', { x: p.x, y: 0.3, z: p.z }, { count: 16, color: 0x8a7258, color2: 0xffb050, radius: r * 0.5, speed: 3, up: 2.4, life: 0.9, size: 0.3, sizeEnd: 0.2, gravity: 14, spin: 3 });
    F.scorch(p, r * 0.9, 0x3a2410, 2.2);
    fxGround(F, 'hfx_ground_crack', p, r * 2.2, P.c, 1.4, { grow: [0.7, 1], k: 1.4 });   // 11-14d GPT 裂地
  } else if (f === 'eagle') {
    F.fx('streak', { x: p.x, y: 0.4, z: p.z }, { count: 16, color: 0xffffff, color2: P.c, radius: r * 0.5, speed: 0.5, up: 6, life: 0.5, size: 0.6, sizeEnd: 0.1 });
    F.fx('dot', { x: p.x, y: 1.2, z: p.z }, { count: 24, color: P.c2, color2: P.c, radius: r * 0.7, speed: 1, up: -0.5, life: 1.1, size: 0.16, sizeEnd: 0.05, gravity: 1 });   // 飘落的羽屑
  } else {
    F.fx('rune', { x: p.x, y: 0.3, z: p.z }, { count: 8, color: P.c, color2: 0xffffff, radius: r * 0.6, ring: true, speed: 0, swirl: 2, up: 2, life: 0.9, size: 0.45, sizeEnd: 0.1, spin: 0.5 });
  }
}

const cast: NonNullable<ClassFx['cast']> = (kind: ClassFxKind, s, at, dir, F) => {
  const f = formOf(s), P = PAL[f], r = s.stats.radius || 2, me = F.me(), d = dir ?? { x: Math.sin(F.facing()), z: Math.cos(F.facing()) };
  switch (kind) {
    case 'melee': {
      if (s.tags.includes('ranged')) {
        // 缚兽索：契约符文锁链甩向远处的目标
        const len = Math.hypot(at.x - me.x, at.z - me.z), g = chainStrip(len, P.c) ?? chain(len, 1.2, ghostMat(P.c, 1.8, 0.9)), w = new THREE.Group(); w.add(g);   // 11-14d GPT 锁链贴图
        w.position.set(me.x, F.gy(me.x, me.z) + 1.1, me.z); w.rotation.y = Math.atan2(at.x - me.x, at.z - me.z);
        const n = g.children.length;
        F.live(w, 0.6, k => { const show = Math.min(1, k / 0.3); g.children.forEach((c, i) => { c.visible = i / n <= show; }); fade(w, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4); });
        F.fx('rune', { x: at.x, y: 1, z: at.z }, { count: 6, color: P.c, color2: 0xffffff, radius: 0.6, ring: true, speed: 0, swirl: 3, up: 0.5, life: 0.8, size: 0.4, sizeEnd: 0.1 });
        return true;
      }
      // 契刃斩：狼 = 三道银蓝爪痕；熊 = 一记琥珀重掌（大爪痕 + 尘土）
      clawMarks(F, me, d, P.c, f === 'bear');
      F.fx('spark', { x: me.x + d.x * 1.3, y: 1.1, z: me.z + d.z * 1.3 }, { count: 10, color: 0xffffff, color2: P.c, speed: 4, up: 0.5, life: 0.25, size: 0.3, sizeEnd: 0.05, drag: 3 });
      if (f === 'bear') F.fx('smoke', { x: at.x, y: 0.2, z: at.z }, { count: 6, color: 0x7a6248, colorEnd: 0x2a2420, radius: 0.4, speed: 1.5, up: 0.4, life: 0.6, size: 0.8, sizeEnd: 1.4 });
      return true;
    }
    case 'dash': {
      // 契约突袭 / 兽跃：身前一只兽魂先扑出去
      const tgt = { x: at.x - d.x * 0.6, z: at.z - d.z * 0.6 };   // at = 冲锋目标
      lunge(F, f, me, tgt, P.c, s.tags.includes('leap') ? 1.3 : 1, s.tags.includes('leap') ? 0.4 : 0.3, s.tags.includes('leap') ? 2.4 : 0.6);
      return true;
    }
    case 'dashHit': {
      if (f === 'bear' || s.tags.includes('leap')) { F.ring(at, s.tags.includes('leap') ? 3.5 : 2.2, P.css, 0.45); burst(F, at, f === 'pact' ? 'bear' : f, 2.5, 30); }
      else { clawMarks(F, at, dir ?? d, P.c, false); F.ring(at, 1.8, P.css, 0.3); }
      F.fx('star', { x: at.x, y: 1, z: at.z }, { count: 1, color: 0xffffff, color2: P.c, speed: 0, up: 0, life: 0.2, size: 2.4, sizeEnd: 0.4 });
      return true;
    }
    case 'spin': {
      // 兽魂旋击：三只兽魂绕身奔跑一圈 + 契约色刃环
      F.whirl(r, P.c, 0.55);
      const n = f === 'bear' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const g = beastOf(f, P.c, f === 'bear' ? 0.9 : 0.8); let a = i / n * Math.PI * 2;
        F.live(g, 0.55, (k, dt) => { a -= dt * 11; const p = F.me(), rr = r * 0.75; g.position.set(p.x + Math.cos(a) * rr, F.gy(p.x, p.z) + (f === 'eagle' ? 1.3 : 0), p.z + Math.sin(a) * rr); g.rotation.y = -a + Math.PI; fade(g, 1 - Math.pow(k, 3)); });
      }
      burst(F, at, f, r, 24);
      return true;
    }
    case 'nova': case 'slam': {
      if (s.tags.includes('shout')) {
        // 慑魂嚎：兽魂仰头长嚎，一圈圈声波
        const g = beastOf(f === 'eagle' ? 'wolf' : f, P.c, 1.6); g.position.set(me.x, F.gy(me.x, me.z), me.z); g.rotation.set(-0.5, F.facing(), 0);
        F.live(g, 0.9, k => { g.position.y = F.gy(me.x, me.z) + k * 0.6; fade(g, 1 - k); });
        pulses(F, at, r, P.css, 3, 0.13);
        for (let i = 0; i < 2; i++) { const g2 = new THREE.Group(); let go = false; F.live(g2, i * 0.18 + 0.01, k => { if (k >= 1 && !go) { go = true; fxGround(F, 'hfx_howl_ring', at, r * 2.3, P.c, 0.8, { grow: [0.25, 1], k: 1.5, y: 0.3 }); } }); }   // 11-14d GPT 声波环
        F.fx('rune', { x: at.x, y: 0.4, z: at.z }, { count: 10, color: P.c, color2: 0xffffff, radius: r * 0.8, ring: true, speed: 0, swirl: -2, up: 1.4, life: 0.9, size: 0.5, sizeEnd: 0.1 });
        return true;
      }
      if (id(s) === 'hp_ward') {
        // 兽皮护契：熊魂罩住自己
        const g = spiritBear(PAL.bear.c, 1.5); g.rotation.y = F.facing();
        F.live(g, 1.1, k => { const p = F.me(); g.position.set(p.x, F.gy(p.x, p.z) - 0.4, p.z); g.scale.setScalar(1.3 + k * 0.4); fade(g, k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8); });
        F.ring(at, r, PAL.bear.css, 0.5);
        return true;
      }
      // 震地：熊魂从空中踏下 / 狼群扑袭：群狼从四周扑进来
      if (f === 'wolf' || f === 'pact') {
        for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; lunge(F, f === 'pact' ? 'wolf' : f, { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r }, at, P.c, 0.8, 0.28, 0.5); }
        F.ring(at, r, P.css, 0.45); burst(F, at, f, r, 30);
      } else {
        const g = spiritBear(PAL.bear.c, 1.8); g.rotation.y = F.facing();
        F.live(g, 0.5, k => { g.position.set(at.x, F.gy(at.x, at.z) + 2.2 * (1 - k * k) - 0.3, at.z); fade(g, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4); });
        F.ring(at, r, PAL.bear.css, 0.5); F.ring(at, r * 0.5, '#fff0d0', 0.35); burst(F, at, 'bear', r, 36);
      }
      return true;
    }
    case 'targeted': {
      if (id(s) === 'hp_totem') {
        // 契印图腾：图腾柱钉进地里，脚下契印法阵
        // v1.2.84 不再从 3 米高空掉下：从地里破土升起（0.35 秒，缓出 + 轻微过冲）+ 碎土
        const t = makeTotem(P.c); t.position.set(at.x, F.gy(at.x, at.z) - 2.2, at.z);
        F.live(t, 5, k => { const y0 = F.gy(at.x, at.z), q = Math.min(1, k / 0.07), e = 1 - Math.pow(1 - q, 3); t.position.y = y0 - 2.2 * (1 - e) + (q < 1 ? Math.sin(Math.PI * q) * 0.12 : 0); t.rotation.y += 0.01; if (k > 0.85) fade(t, 1 - (k - 0.85) / 0.15); });
        F.fx('shard', { x: at.x, y: 0.2, z: at.z }, { count: 14, color: 0x6a5a40, color2: 0x3a3020, speed: 3.5, up: 3, radius: 0.4, life: 0.7, size: 0.22, sizeEnd: 0.12, gravity: 14, spin: 3 });
        if (!fxGround(F, 'hfx_totem_rune', at, r * 2.1, P.c, 5, { spin: 0.4, k: 1.4, fadeIn: 0.04 })) F.sigil(at, r, P.c, 5); burst(F, at, 'pact', r, 30);   // 11-14d GPT 契印法阵
        return true;
      }
      // 鹰：一群鹰魂从高空俯冲到目标处；狂猎：狼群从四方合围
      if (f === 'eagle' || id(s) === 'hp_u_skyhunt') {
        const n = s.slot === 'ultimate' || s.slot === 'skill4' ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, from = { x: at.x + Math.cos(a) * 5, z: at.z + Math.sin(a) * 5 };
          const g = spiritEagle(PAL.eagle.c, 1.3); let t = 0;
          F.live(g, 0.4, (k, dt) => { t += dt; g.position.set(from.x + (at.x - from.x) * k, F.gy(at.x, at.z) + 8 * (1 - k) + 0.6, from.z + (at.z - from.z) * k); g.lookAt(at.x, F.gy(at.x, at.z), at.z); flap(g, t); fade(g, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); });
        }
        F.ring(at, r, PAL.eagle.css, 0.5); burst(F, at, 'eagle', r, 36);
      } else {
        const n = 6;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; lunge(F, 'wolf', { x: at.x + Math.cos(a) * (r + 3), z: at.z + Math.sin(a) * (r + 3) }, at, PAL.wolf.c, 1, 0.38, 0.7); }
        F.sigil(at, r, P.c, 1.2); F.ring(at, r, P.css, 0.6); burst(F, at, f, r, 40);
      }
      return true;
    }
    case 'line': case 'cone': {
      // 百兽奔袭：兽魂沿直线冲过去；裂地猛击：一道琥珀裂地
      const len = kind === 'line' ? s.stats.range : r;
      if (id(s) === 'hp_maul' || f === 'bear') {
        for (let dd = 1; dd <= len; dd += 1.2) { const c = { x: at.x + d.x * dd, z: at.z + d.z * dd }; const g = new THREE.Group(); let done = false; F.live(g, dd / len * 0.35 + 0.01, k => { if (k >= 1 && !done) { done = true; F.scorch(c, (s.stats.radius || 2) * 0.8, 0x3a2410, 1.8); fxGround(F, 'hfx_ground_crack', c, (s.stats.radius || 2) * 1.9, PAL.bear.c, 1.2, { grow: [0.6, 1], k: 1.4, spin: 0 }); F.fx('shard', { x: c.x, y: 0.2, z: c.z }, { count: 6, color: 0x8a7258, color2: 0xffb050, radius: 0.6, speed: 2, up: 4, life: 0.8, size: 0.35, sizeEnd: 0.25, gravity: 14, spin: 3 }); F.fx('flame', { x: c.x, y: 0.2, z: c.z }, { count: 2, color: 0xffd080, color2: 0xff8a30, colorEnd: 0x602008, radius: 0.5, speed: 0.4, up: 2, life: 0.4, size: 0.7, sizeEnd: 0.2 }); } }); }
      } else {
        const kinds: F3[] = ['wolf', 'bear', 'eagle', 'wolf', 'wolf'];
        kinds.forEach((k3, i) => { const side = rot(d, Math.PI / 2), off = (i - 2) * 0.7; const from = { x: at.x + side.x * off, z: at.z + side.z * off }; const to = { x: from.x + d.x * len, z: from.z + d.z * len }; const g = new THREE.Group(); let go = false; F.live(g, i * 0.05 + 0.01, kk => { if (kk >= 1 && !go) { go = true; lunge(F, k3, from, to, PAL[k3].c, 0.9, 0.45, 0.3); } }); });
        F.fx('smoke', { x: at.x + d.x * len * 0.5, y: 0.2, z: at.z + d.z * len * 0.5 }, { count: 14, color: 0x6a5a48, colorEnd: 0x2a2420, radius: len * 0.4, speed: 1.4, up: 0.4, life: 0.8, size: 1, sizeEnd: 2 });
      }
      F.ring({ x: at.x + d.x * len, z: at.z + d.z * len }, s.stats.radius || 2, P.css, 0.4);
      return true;
    }
    case 'blink': {
      // 风行契步：一阵兽风，起落点留下爪印
      const from = { x: at.x - d.x * s.stats.range, z: at.z - d.z * s.stats.range };
      for (let i = 0; i <= 6; i++) { const k = i / 6, p = { x: from.x + (at.x - from.x) * k, z: from.z + (at.z - from.z) * k }; F.fx('streak', { x: p.x, y: 1, z: p.z }, { count: 2, color: 0xffffff, color2: P.c, radius: 0.4, speed: 0.3, up: 0.1, life: 0.3, size: 0.8, sizeEnd: 0.1 }); F.fx('dot', { x: p.x, y: 0.1, z: p.z }, { count: 2, color: P.c, color2: P.c2, radius: 0.3, speed: 0.1, up: 0.2, life: 0.9, size: 0.2, sizeEnd: 0.05 }); }
      lunge(F, f === 'pact' ? 'wolf' : f, from, at, P.c, 0.9, 0.25, 0.3);
      F.ring(at, r, P.css, 0.45); burst(F, at, f, r, 24);
      return true;
    }
    case 'ultimate': {
      const rr = s.stats.radius || 6;
      if (id(s) === 'hp_spiritbeast' || id(s) === 'hp_u_earthshaker') {
        // 灵契巨兽 / 沉钟巨熊：一头巨大的熊魂在身后立起再砸下
        const g = spiritBear(id(s) === 'hp_u_earthshaker' ? PAL.bear.c : P.c, 3.2); g.rotation.y = F.facing();
        F.live(g, 1.1, k => { const p = F.me(); const h = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) * 2; g.position.set(p.x - Math.sin(F.facing()) * 1.2, F.gy(p.x, p.z) - 0.6 + h * 0.8, p.z - Math.cos(F.facing()) * 1.2); g.rotation.x = k < 0.5 ? -0.3 * k * 2 : -0.3 + (k - 0.5) * 1.2; fade(g, k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2); });
        pulses(F, at, rr, PAL.bear.css, 3, 0.15); burst(F, at, 'bear', rr, 50);
        return true;
      }
      if (id(s) === 'hp_u_packlord') {
        // 潮狼王契：浪花狼王绕身扑咬
        F.whirl(rr, 0x1a8aa0, 0.7);
        for (let i = 0; i < 5; i++) { const g = spiritWolf(0x9ff0ff, 1.1); let a = i / 5 * Math.PI * 2; F.live(g, 0.7, (k, dt) => { a -= dt * 9; const p = F.me(); g.position.set(p.x + Math.cos(a) * rr * 0.7, F.gy(p.x, p.z), p.z + Math.sin(a) * rr * 0.7); g.rotation.y = -a + Math.PI; fade(g, 1 - k * k); }); }
        F.fx('dot', { x: at.x, y: 0.4, z: at.z }, { count: 60, color: 0xffffff, color2: 0x7fe8f0, radius: rr * 0.6, ring: true, speed: 3, up: 3, life: 0.8, size: 0.2, sizeEnd: 0.05, gravity: 6 });
        return true;
      }
      // 万兽归一：狼 / 熊 / 鹰三兽之魂绕身盘旋升起，青色契印法阵
      if (!fxGround(F, 'hfx_totem_rune', at, rr * 2.1, PAL.pact.c, 1.4, { spin: 1.2, grow: [0.6, 1], k: 1.6 })) F.sigil(at, rr, PAL.pact.c, 1.4);   // 11-14d GPT 契印法阵
      (['wolf', 'bear', 'eagle'] as F3[]).forEach((k3, i) => {
        const g = beastOf(k3, PAL[k3].c, k3 === 'bear' ? 1.2 : 1.3); let a = i / 3 * Math.PI * 2, t = 0;
        F.live(g, 1.3, (k, dt) => { t += dt; a += dt * 5; const p = F.me(), rr2 = rr * 0.55 * (1 - k * 0.6); g.position.set(p.x + Math.cos(a) * rr2, F.gy(p.x, p.z) + k * 4, p.z + Math.sin(a) * rr2); g.rotation.y = -a; if (k3 === 'eagle') flap(g, t); fade(g, k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25); });
      });
      F.fx('star', { x: at.x, y: 1.4, z: at.z }, { count: 1, color: 0xffffff, color2: PAL.pact.c, speed: 0, up: 0, life: 0.35, size: 6, sizeEnd: 1 });
      F.fx('streak', { x: at.x, y: 0.2, z: at.z }, { count: 22, color: 0xffffff, color2: PAL.pact.c, radius: 1.2, speed: 0.3, up: 10, drag: 1, life: 0.7, size: 0.7, sizeEnd: 0.1 });
      F.ring(at, rr, PAL.pact.css, 0.6); burst(F, at, 'pact', rr, 50);
      return true;
    }
    case 'projectile': return false;   // 弹体本身由 projectile() 换成羽刃
  }
  return false;
};

/** 11-14d Rhett：箭从弓的中间射出（本体按名字找 h_bow 取包围盒中心） */
const fromBow = (o: THREE.Object3D) => { o.userData.launchFromObj = 'h_bow'; return o; };

export const HUNTER_FX: ClassFx = {
  cast,
  projectile: s => ({ obj: s.tags.includes('arrow') ? fromBow(arrowBolt(PAL[formOf(s)].c, s.slot === 'basic' ? 1.0 : 1.25)) : featherBlade(PAL[formOf(s)].c, s.slot === 'basic' ? 0.9 : 1.2), spin: false }),   // 11-05 鹰契拉弓：箭矢
  trail: (s, p, F) => {
    const P = PAL[formOf(s)];
    F.fx('streak', { x: p.x, y: p.y, z: p.z }, { count: 1, color: 0xffffff, color2: P.c, speed: 0, up: 0, life: 0.16, size: 0.6, sizeEnd: 0.1 });
    if (Math.random() < 0.3) F.fx('dot', { x: p.x, y: p.y, z: p.z }, { count: 1, color: P.c, color2: P.c2, speed: 0.4, up: -0.3, life: 0.6, size: 0.14, sizeEnd: 0.04, gravity: 1 });
    return true;
  },
  dashTrail: (s, p, F) => {
    const P = PAL[formOf(s)];
    F.fx('streak', { x: p.x, y: 1, z: p.z }, { count: 2, color: 0xffffff, color2: P.c, radius: 0.5, speed: 0.2, up: 0.1, life: 0.22, size: 0.7, sizeEnd: 0.1 });
    F.fx('dot', { x: p.x, y: 0.1, z: p.z }, { count: 1, color: P.c, color2: P.c2, radius: 0.2, speed: 0.1, up: 0.1, life: 0.8, size: 0.22, sizeEnd: 0.05 });
    return true;
  },
};
export const _hunterFxTest = { formOf, hex };
