// v1.2.54 展示版资产统计：运行时真正取用的模型 / 贴图记进 globalThis.__assetHit（dev/judgeshot.mjs 导出 → tools/lite-assets.json）
export class HitMap<K extends string, V> extends Map<K, V> {
  constructor(private tag: string) { super(); }
  override get(k: K): V | undefined { const v = super.get(k); if (v !== undefined) ((globalThis as any).__assetHit ??= {})[this.tag + ':' + k] = 1; return v; }
}
