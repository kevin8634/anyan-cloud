// 11-18 环境音登记（内容包用）：本体不认内容包的区域 id，包自己登记「区域前缀 → 环境音底名」与下雨强度。
// 本文件不 import 任何模块、模块顶层不读挂载点，内容包静态 import 不影响启动顺序（test/dlc_boot_order.mjs）。
const PACK_AMB: { prefix: string; base: string }[] = [];
const RAIN: (() => number)[] = [];
/** base = 环境音底名（amb_<base>_day / _night 或 amb_<base>），如 'coast' */
export function registerAmbience(prefix: string, base: string) { PACK_AMB.push({ prefix, base }); }
/** 下雨强度 0–1（取所有登记源的最大值），如沉钟海岸风暴的 stormRT.rain */
export function registerAmbRain(f: () => number) { RAIN.push(f); }
export function packAmbFor(zone: string): string | null { const e = PACK_AMB.find(x => zone === x.prefix || zone.startsWith(x.prefix)); return e ? e.base : null; }
export function packRain(): number { let k = 0; for (const f of RAIN) { try { k = Math.max(k, f() || 0); } catch { /* 包出错不影响本体 */ } } return Math.max(0, Math.min(1, k)); }
