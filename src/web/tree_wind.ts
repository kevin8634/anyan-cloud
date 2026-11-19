// 11-17 Rhett「树干动得诡异……主枝干不动，树叶和树冠上的树枝随风摆动，不是乱扭」：树的风摆着色片段（field_flora 与 DLC dyn_world 共用）
//   · 主干不动：树高约下 38% 位移为 0，往上按 ((h - 冠基) / (树高 - 冠基))² 增大 → 只有树冠和冠上的枝条在摆
//   · 整棵树一个相位（实例 / 物体原点取相位；多株合并网格用 ~50 米波长的低频位置相位，单棵树内几乎同相）→ 整体来回摆，不再逐顶点各摆各的「蠕动」
//   · 摆动方向以顺风为主（来回摆）+ 少量侧向慢摆，频率 0.3–0.5 Hz（大树慢、小树快），幅度随风速 / 阵风
//   · 叶颤（±1.5 厘米高频小抖）只加在叶片材质上，树皮 / 枝干不抖
export interface TreeWindNames { wind: string; cam: string; hash: string; gust: string }
export function treeWindGlsl(n: TreeWindNames, o: { amp: number; merged: boolean; leaf: boolean }): { off: string; flutter: string } {
  const k = (o.amp / 0.05).toFixed(4);
  const off = `
  float twCb = 0.38 * dRef;
  float twW = clamp((hw - twCb) / max(dRef - twCb, 0.3), 0.0, 1.4); twW *= twW;
  float twP = ${o.merged ? 'dot(dW.xz, vec2(0.11, 0.07))' : `6.2832 * ${n.hash}(dO.xz + 7.13)`};
  float twB = ${o.merged ? '0.0' : 'dot(dW.xz - dO.xz, vec2(0.45, 0.3))'};
  float twOm = 6.2832 * mix(0.32, 0.5, dHs) * clamp(3.0 / sqrt(dRef), 0.7, 1.4);
  float twS = sin(twOm * t + twP + twB) + 0.3 * sin(2.13 * twOm * t + twP * 1.7 + twB);
  float twQ = sin(0.71 * twOm * t + twP * 2.3 + twB * 0.7);
  float twA = (0.3 + 0.7 * g) * s * 0.06 * dRef * ${k};
  off = (dDir * (0.6 * s * g + 0.5 * twS) + dPerp * 0.22 * twQ) * twA * twW;`;
  const flutter = o.leaf ? `if (${n.cam}.w > 0.5 && hw > 1.2) {
    float fd = 1.0 - smoothstep(40.0, 120.0, length(dW - ${n.cam}.xyz));
    vec3 fp = dW * vec3(2.1, 1.3, 1.7);
    wd += vec3(sin(t * 4.7 + fp.x + fp.y), sin(t * 3.9 + fp.y + fp.z) * 0.6, sin(t * 5.3 + fp.z + fp.x)) * 0.015 * s * (0.4 + g) * fd * min(1.0, twW * 4.0 + 0.2);
  }` : '';
  return { off, flutter };
}
