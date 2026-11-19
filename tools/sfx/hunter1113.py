#!/usr/bin/env python3
"""11-13 I07 灵契猎手按契音效：ElevenLabs SFX v3 生成的 mp3（/workspace/work/sfx1113/gen）→ 起音对齐、按类型裁切、响度归一
→ assets_aholo/audio/sfx/h_*.mp3，并并入 src/dlc/dlc1/sfx.gen.ts 的 D1_SFX / D1_SFX_MAP（键 = 技能id@契，audio.skillSample 先查契）。
用法：python3 tools/sfx/hunter1113.py [源目录]"""
import sys, os, re, json, base64, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from build import onset   # 同一套起音检测
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/work/sfx1113/gen'
OUT = 'assets_aholo/audio/sfx/'
LEN = {'h_slash_wolf': 0.55, 'h_slash_bear': 0.7, 'h_bow': 0.6, 'h_pounce_wolf': 1.0, 'h_pounce_bear': 1.1, 'h_pounce_eagle': 1.0,
       'h_rend_wolf': 0.8, 'h_rend_bear': 1.1, 'h_rend_eagle': 1.6, 'h_howl_wolf': 1.4, 'h_howl_bear': 1.4, 'h_howl_eagle': 1.2,
       'h_shift_wolf': 1.5, 'h_shift_bear': 1.7, 'h_shift_eagle': 1.5, 'h_arrow_hit': 0.45}
MAP = {'hp_slash@wolf': 'h_slash_wolf', 'hp_slash@bear': 'h_slash_bear', 'hp_slash@eagle': 'h_bow',
       'hp_pounce@wolf': 'h_pounce_wolf', 'hp_pounce@bear': 'h_pounce_bear', 'hp_pounce@eagle': 'h_pounce_eagle',
       'hp_rend@wolf': 'h_rend_wolf', 'hp_rend@bear': 'h_rend_bear', 'hp_rend@eagle': 'h_rend_eagle',
       'hp_howl@wolf': 'h_howl_wolf', 'hp_howl@bear': 'h_howl_bear', 'hp_howl@eagle': 'h_howl_eagle',
       'hp_shift_wolf': 'h_shift_wolf', 'hp_shift_bear': 'h_shift_bear', 'hp_shift_eagle': 'h_shift_eagle'}

def proc(k):
    w = os.path.join(SRC, k + '.mp3')
    if not os.path.exists(w): return None
    L = LEN[k]; fo = min(0.3, L * 0.45)
    af = f"atrim=0:{L},afade=t=in:d=0.006,afade=t=out:st={L - fo:.3f}:d={fo:.3f},loudnorm=I=-15:TP=-1.5:LRA=11"
    o = OUT + k + '.mp3'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{onset(w):.3f}', '-i', w, '-af', af, '-ar', '48000', '-ac', '2', '-b:a', '160k', o], check=True)
    return 'data:audio/mpeg;base64,' + base64.b64encode(open(o, 'rb').read()).decode()

if __name__ == '__main__':
    got = {k: v for k in LEN if (v := proc(k))}
    p = 'src/dlc/dlc1/sfx.gen.ts'; s = open(p, encoding='utf-8').read()
    def patch(name, add):
        global s
        m = re.search(r'(export const ' + name + r': Record<string, string> = )(\{.*?\});', s, re.S)
        d = json.loads(m.group(2)); d.update(add)
        s = s[:m.start(2)] + json.dumps(d) + s[m.end(2):]
    patch('D1_SFX', got)
    patch('D1_SFX_MAP', {**{k: k for k in got}, **{sk: v for sk, v in MAP.items() if v in got}})
    open(p, 'w', encoding='utf-8').write(s)
    print('samples', len(got), '/', len(LEN), 'missing', [k for k in LEN if k not in got])
