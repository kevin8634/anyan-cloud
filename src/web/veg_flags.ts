// 11-17 植被画质开关（秋林植被分层 / 透光 / AO；草花阴影 / 倒影）。读 ?off=a,b 与 localStorage darkrock_cine_off，结果缓存。
//   ?off=veglayer → 关「分层（近 / 中 / 远密度与 LOD）+ 叶缘逆光透光 + 根部 / 草丛 / 树冠 AO」，回 11-17 前画法
//   ?off=vegshadow → 关「草花底部假阴影 + 岸边草花进河面倒影」
import { curQuality } from './gfx';

const cache = new Map<string, boolean>();
export function vegOff(name: string): boolean {
  let v = cache.get(name);
  if (v === undefined) {
    v = false;
    try {
      const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
      v = `${q},${ls}`.split(',').map(x => x.trim()).includes(name);
    } catch { v = false; }
    cache.set(name, v);
  }
  return v;
}
/** 植被分层 + 叶缘透光 + AO（中 / 高 / 超高；低档草木本来就不建） */
export const vegLayerOn = (): boolean => !vegOff('veglayer') && curQuality !== 'low';
/** 草花假阴影 + 岸边倒影（中档以上） */
export const vegShadowOn = (): boolean => !vegOff('vegshadow') && curQuality !== 'low';
