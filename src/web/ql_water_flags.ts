// ======================================================================
// 11-19 秋林逆光 r8 水体复刻开关（Rhett 11-19「再检查本体版中的水是否复刻源码的水」「钟井Raid最下面的水是否复刻源码的水」）
//   每项 ?off=名字（也认 localStorage darkrock_cine_off，逗号分隔整词）回 C22：
//   qlriver（本体河 / 腐沼水换 r8 waterMat）、qlrivspec（水面阴影 + GGX 动态粗糙度 + 闪烁格）、qlmirror（r8 镜面：中档起、每帧、含天空、6/4 次竖向采样）、
//   qlwake（尾迹 r8 参数 + 翻搅通道 + 顶点起伏 + 低档开）、qlsplash（r8 水花 v2 + 落水涟漪，发射源 = 玩家涉水）、
//   钟井深渊：qlwellspd（波速回 r8 1.0×）、wellmirror（接镜面倒影）、wellalpha（透明预乘）、wellfallring（瀑布落点涟漪），以及 wellr8 总开关（撤回 cave 本色 / skyRefl 原式）
// ======================================================================
const OFFS: string[] = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : '';
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : '';
    return `${q},${ls}`.split(',').map(x => x.trim()).filter(Boolean);
  } catch { return []; }
})();
export const qlOff = (name: string) => OFFS.includes(name);
export const QL = {
  river: !qlOff('qlriver'),
  spec: !qlOff('qlriver') && !qlOff('qlrivspec'),
  mirror: !qlOff('qlriver') && !qlOff('qlmirror'),
  wake: !qlOff('qlriver') && !qlOff('qlwake'),
  splash: !qlOff('qlriver') && !qlOff('qlsplash'),
  wellR8: !qlOff('wellr8'),
  wellSpd: !qlOff('wellr8') && !qlOff('qlwellspd'),
  wellMirror: !qlOff('wellr8') && !qlOff('wellmirror'),
  wellAlpha: !qlOff('wellr8') && !qlOff('wellalpha'),
  wellFallRing: !qlOff('wellr8') && !qlOff('wellfallring'),
};
