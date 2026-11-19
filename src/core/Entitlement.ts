// ======================================================================
// v0.9.7 DLC 框架：授权（谁算「有这个内容包」）。以后换平台只改这一个文件。
//
// 来源（按顺序，任一为真即拥有）
// 1. 构建时注入的列表（离线单文件版）：build-web.mjs --dlc=<id> 用 esbuild define 把 __DARKROCK_DLC__ 换成 ["<id>"]；
//    本体构建换成 []。node / tsc 跑 sim 时没有这个常量 → 空列表。
// 2. 平台判定（预留）：Steam 版启动时问 Steam「是否拥有 DLC」。目前只是桩：setPlatformProvider 注入，默认没有。
// 3. 测试授予：grantForTest（sim / playtest 用）。
// 本文件只放通用词，不能出现任何具体 DLC 的名字。
// ======================================================================
import { PackManifest, registerPack } from './ContentPacks';

declare const __DARKROCK_DLC__: string[] | undefined;
/** 构建时注入的内容包 id 列表 */
const BUILD_LIST: readonly string[] = (() => { try { return typeof __DARKROCK_DLC__ !== 'undefined' && Array.isArray(__DARKROCK_DLC__) ? __DARKROCK_DLC__ : []; } catch { return []; } })();

/** 平台授权接口（Steam 等）。owns 返回 null = 平台不知道 / 不可用，按「没有」处理 */
export interface PlatformProvider { name: string; owns(packId: string): boolean | null }
let platform: PlatformProvider | null = null;
const granted = new Set<string>();

/** Steam 判定桩：以后接 Steamworks（ISteamApps::BIsDlcInstalled / BIsSubscribedApp）。现在永远返回 null */
export function steamOwns(_packId: string): boolean | null { void _packId; return null; }
export const STEAM_PROVIDER: PlatformProvider = { name: 'steam', owns: steamOwns };

export const Entitlement = {
  /** 是否拥有某个内容包 */
  has(packId: string): boolean {
    if (BUILD_LIST.includes(packId) || granted.has(packId)) return true;
    return platform?.owns(packId) === true;
  },
  /** 构建时注入的列表（只读） */
  buildList(): readonly string[] { return BUILD_LIST; },
  setPlatformProvider(p: PlatformProvider | null) { platform = p; },
  grantForTest(packId: string) { granted.add(packId); },
  revokeForTest(packId: string) { granted.delete(packId); },
};

/** 有授权才注册（DLC 的 boot.ts 调用）。返回是否注册了 */
export function installPack(m: PackManifest): boolean {
  if (!Entitlement.has(m.id)) return false;
  return registerPack(m);
}
