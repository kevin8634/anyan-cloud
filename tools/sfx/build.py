#!/usr/bin/env python3
"""技能音效：Seedance 2.0 Fast 带声短片取音轨（1107）+ Rhett 录屏原声（1108）→ 按类型裁切 → mp3 内联。
用法：python3 tools/sfx/build.py <wav 目录>   （wav 目录 = /workspace/work/sfx17/gen）
输出：src/web/sfx.gen.ts（本体）、src/dlc/dlc1/sfx.gen.ts（DLC 40 级绝技 + 灵契猎手 / 送葬人借用映射）；mp3 存 assets_aholo/audio/sfx/。
11-08 Rhett「效果不好、持续性不是技能时长的都要换」：
  - 不再一律截 2.42 秒：从第一个强瞬态（峰值 -12 dB）前 0.04 秒起，按类型取长度——普攻 0.5 s、单发技能 1.1 s、大招 / 重击 1.8 s、
    持续类（LOOP）整段并在游戏里循环到技能时长；Rhett 原声（FULL）整段。
  - LOOP 列表写进 sfx.gen.ts（SKILL_SFX_LOOP），audio.ts 只让这些样本循环；其余技能留地面时样本只放一次 + 元素底噪到时长结束。"""
import sys, os, subprocess, base64, json
import numpy as np
SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/work/sfx17/gen"
SR = 48000
FULL = {'m_blizzard', 'm_arcane_storm', 'm_arcane_storm_fire'}     # Rhett 11-02 录屏原声（sfx17/gen/src_rhett_1102.mp4）
LOOP = {'w_whirl', 'w_bladestorm', 'a_acid_rain', 'c_vortex', 'c_slow_field', 'm_star_barrage', 'd1_abyss_tide',
        'm_blizzard', 'm_arcane_storm', 'm_arcane_storm_fire', 'm_blizzard_fire'}
BASIC = {'w_swing': 0.5, 'm_arcane_bolt': 0.32, 'c_chakram': 0.55, 'a_flask': 0.55, 'w_cleave': 0.6}   # 普攻 / 高频
BIG = {'m_meteor', 'w_earthsplit', 'w_rage', 'w_shout', 'w_banner', 'c_rift', 'c_mark_burst', 'a_thermite', 'a_chain_bomb', 'w_leap',
       'd1_bell_quake', 'd1_abyss_roar', 'd1_bell_resonance', 'd1_silent_toll', 'd1_tide_cleave', 'd1_brine_bomb', 'd1_bell_flask', 'd1_abyss_brew', 'd1_drown_orb', 'd1_drift_blade', 'd1_tide_mark'}
UI = {'u_recall'}   # 回程（H）：合成 3.25 s，整段
# 奥能弹：0.32 秒短粗（11-08 Rhett）
ARC_AF = 'highpass=f=120,lowpass=f=4200,equalizer=f=300:t=q:w=1:g=4,acompressor=threshold=-18dB:ratio=4:attack=2:release=60,afade=t=in:d=0.004,afade=t=out:st=0.14:d=0.18,loudnorm=I=-16:TP=-2:LRA=7'
MAP = {   # 本体技能 baseId（@元素 = 形态变换）→ 样本
 # 战士
 'slash': 'w_swing', 'charge': 'w_charge', 'whirlwind': 'w_whirl', 'thunderclap': 'w_thunder', 'avatar': 'w_shout',
 'heroic_leap': 'w_leap', 'shield_rush': 'w_charge', 'cleave': 'w_cleave', 'quake': 'w_earthsplit', 'shockwave': 'w_thunder', 'battle_shout': 'w_rage',
 'bladestorm': 'w_bladestorm', 'war_banner': 'w_banner', 'earthsplitter': 'w_earthsplit', 'rage_roar': 'w_rage',
 # 法师
 'arcane_bolt': 'm_arcane_bolt', 'flame_orb': 'm_fire_orb', 'frost_ring': 'm_frost_nova', 'arcane_bind': 'm_arcane_bind', 'meteor': 'm_meteor',
 'ice_lance': 'm_ice_lance', 'ice_lance@nature': 'm_ice_lance_thunder',   # 11-17 雷枪符文（Rhett 视频「雷冰枪」）
  'chain_lightning': 'm_lightning', 'flame_nova': 'm_flame_nova', 'blizzard': 'm_blizzard', 'blink': 'm_blink',
 'time_warp': 'c_slow_field', 'ice_age': 'm_frost_nova', 'arcane_storm': 'm_arcane_storm', 'star_barrage': 'm_star_barrage', 'frostfire': 'm_frostfire',
 'arcane_storm@fire': 'm_arcane_storm_fire', 'blizzard@fire': 'm_blizzard_fire',   # 11-17 Rhett：火系暴风雪用 Rhett 给的「火焰暴风雪.mp3」，对齐 8 秒并淡出
 # 时砂行者
 'chrono_throw': 'c_chakram', 'sand_step': 'c_phase', 'blade_spin': 'c_chakram', 'stasis': 'c_tick', 'final_moment': 'c_rift',
 'phase_shift': 'c_phase', 'backflow_dash': 'c_tick', 'time_saw': 'c_chakram', 'engrave_wheel': 'c_chakram', 'sand_prison': 'c_sand_prison',
 'slow_field': 'c_slow_field', 'myriad_echo': 'c_rift', 'time_rift': 'c_rift', 'mark_burst': 'c_mark_burst', 'time_vortex': 'c_vortex',
 # 炼金投弹手
 'reagent_shot': 'a_flask', 'red_flask': 'a_napalm', 'blue_flask': 'a_smoke', 'green_flask': 'a_acid', 'cauldron': 'a_thermite',
 'thermite': 'a_thermite', 'napalm': 'a_napalm', 'liquid_n2': 'a_smoke', 'frost_crystal': 'm_ice_lance', 'spores': 'a_spores', 'strong_acid': 'a_acid',
 'philosopher': 'c_mark_burst', 'mobile_lab': 'a_thermite', 'acid_cloud': 'a_acid_rain', 'chain_bomb': 'a_chain_bomb',
}
D1 = ['d1_tide_cleave', 'd1_bell_quake', 'd1_abyss_roar', 'd1_drown_orb', 'd1_bell_resonance', 'd1_abyss_tide', 'd1_tide_mark', 'd1_silent_toll',
      'd1_drift_blade', 'd1_brine_bomb', 'd1_bell_flask', 'd1_abyss_brew']
D1_BORROW = {   # 灵契猎手 / 送葬人：暂借最接近的已有样本（11-08，待 Rhett 试听；不合适的再报价单独生成）
 'hp_slash': 'w_swing', 'hp_pounce': 'w_charge', 'hp_leap': 'w_leap', 'hp_glide': 'c_phase', 'hp_rend': 'w_whirl', 'hp_volley': 'c_chakram',
 'hp_maul': 'w_earthsplit', 'hp_howl': 'w_rage', 'hp_snare': 'c_sand_prison', 'hp_ward': 'w_shout', 'hp_totem': 'w_banner', 'hp_stampede': 'w_charge',
 'hp_avatar': 'w_rage', 'hp_wildhunt': 'w_bladestorm', 'hp_spiritbeast': 'd1_abyss_roar',
 'cf_swing': 'w_cleave', 'cf_drag': 'w_charge', 'cf_vault': 'w_leap', 'cf_shroudstep': 'c_phase', 'cf_sweep': 'w_whirl', 'cf_drop': 'd1_bell_quake',
 'cf_chainline': 'c_chakram', 'cf_toll': 'd1_bell_resonance', 'cf_bind': 'c_sand_prison', 'cf_shroud': 'w_shout', 'cf_procession': 'w_charge',
 'cf_gravefield': 'c_rift', 'cf_requiem': 'd1_silent_toll', 'cf_hundred': 'd1_bell_quake', 'cf_ferry': 'd1_abyss_tide',
}
OUT = 'assets_aholo/audio/sfx/'; os.makedirs(OUT, exist_ok=True)

def onset(w):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', w, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(r, np.float32); n = 160
    e = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) + 1e-9 for i in range(0, max(1, len(x) - n), n)]); db = 20 * np.log10(e)
    return max(0.0, int(np.argmax(db > db.max() - 12)) * n / 16000 - 0.04)

# 11-17 Rhett 视频「11月17日.mp4」按画面文字拆出的 5 段（音轨存 tools/sfx/rhett/mage_1117.m4a）：键 → (起, 止) 秒
RHETT_1117 = {'u_recall': (0.0, 3.0), 'm_fire_orb': (3.0, 6.73), 'm_arcane_bolt': (6.73, 9.0, 0.5), 'm_ice_lance_thunder': (9.0, 12.17), 'm_ice_lance': (12.17, 15.35)}
def cut1117(k):
    a, b, *mx = RHETT_1117[k]; o = OUT + k + '.mp3'   # 第 3 项 = 截短上限（奥能弹是普攻：Rhett 11-17「可以」截到 0.5 秒）
    af = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,'
          'afade=t=in:d=0.005,' + (f'atrim=0:{mx[0]},' if mx else '') + 'loudnorm=I=-15:TP=-1.5:LRA=11,areverse,afade=t=in:d=' + ('0.15' if mx else '0.25') + ',areverse')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', os.path.join(os.path.dirname(__file__), 'rhett', 'mage_1117.m4a'), '-af', af,
                    '-ar', str(SR), '-ac', '2', '-b:a', '160k', o], check=True)
    return 'data:audio/mpeg;base64,' + base64.b64encode(open(o, 'rb').read()).decode()

def proc(k):
    if k in RHETT_1117: return cut1117(k)
    if k == 'm_blizzard_fire':   # 11-17 Rhett 给的「火焰暴风雪.mp3」（tools/sfx/rhett/）：对齐暴风雪持续 8 秒，末尾 1.2 秒淡出（synth_blizzard_fire.py 程序合成版停用）
        o = OUT + k + '.mp3'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(os.path.dirname(__file__), 'rhett', 'm_blizzard_fire_1117.mp3'), '-af',
                        'atrim=0:8,afade=t=in:d=0.02,loudnorm=I=-15:TP=-1.5:LRA=11,afade=t=out:st=6.8:d=1.2', '-ar', str(SR), '-ac', '2', '-b:a', '160k', o], check=True)
        return 'data:audio/mpeg;base64,' + base64.b64encode(open(o, 'rb').read()).decode()
    w = os.path.join(SRC, k + '.wav')
    if not os.path.exists(w): return None
    if k in FULL or k in UI:
        af = 'afade=t=in:d=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,afade=t=in:d=0.3,areverse,loudnorm=I=-15:TP=-1.5:LRA=11'
        if k in UI: af = 'loudnorm=I=-18:TP=-2:LRA=11'
        ss = 0.0
    else:
        ss = onset(w)
        L = 4.0 if k in LOOP else BASIC.get(k, 1.8 if k in BIG else 1.1)
        fo = min(0.35, L * 0.45)
        af = f"atrim=0:{L},afade=t=in:d=0.006,afade=t=out:st={L - fo:.3f}:d={fo:.3f},loudnorm=I=-15:TP=-1.5:LRA=11"
        if k == 'm_arcane_bolt': af = 'atrim=0:0.32,' + ARC_AF
    o = OUT + k + '.mp3'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{ss:.3f}', '-i', w, '-af', af, '-ar', str(SR), '-ac', '2', '-b:a', '160k', o], check=True)
    return 'data:audio/mpeg;base64,' + base64.b64encode(open(o, 'rb').read()).decode()

if __name__ == '__main__':
    need = sorted(set(MAP.values()) | UI)
    base = {k: v for k in need if (v := proc(k))}
    bm = {s: k for s, k in MAP.items() if k in base}
    d1 = {k: v for k in D1 if (v := proc(k))}
    dm = {**{k: k for k in d1}, **{s: k for s, k in D1_BORROW.items() if k in base or k in d1}}
    hdr = '// 自动生成：python3 tools/sfx/build.py —— 技能音效样本（Seedance 2.0 Fast 带声短片取音轨 / Rhett 录屏原声 / 回程合成，本项目定制）\n'
    open('src/web/sfx.gen.ts', 'w').write(hdr + f'export const SKILL_SFX: Record<string, string> = {json.dumps(base)};\nexport const SKILL_SFX_MAP: Record<string, string> = {json.dumps(bm)};\n'
                                          f'export const SKILL_SFX_LOOP: string[] = {json.dumps(sorted(LOOP))};\n')
    open('src/dlc/dlc1/sfx.gen.ts', 'w').write(hdr + f'export const D1_SFX: Record<string, string> = {json.dumps(d1)};\nexport const D1_SFX_MAP: Record<string, string> = {json.dumps(dm)};\n')
    print('base', len(base), '/', len(need), 'skills', len(bm), '/', len(MAP), '| d1', len(d1), '/', len(D1), 'd1map', len(dm), '| missing', [k for k in need + D1 if k not in base and k not in d1])
