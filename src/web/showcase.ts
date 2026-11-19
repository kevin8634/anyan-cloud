// v1.2.54 DLC 展示版（build-web.mjs --showcase）：只开放评委快速体验入口，资产只带展示路径用到的（tools/lite-assets.json），画质档不降
declare const __DARKROCK_SHOWCASE__: boolean | undefined;
export const SHOWCASE: boolean = (() => { try { return typeof __DARKROCK_SHOWCASE__ !== 'undefined' && !!__DARKROCK_SHOWCASE__; } catch { return false; } })();
