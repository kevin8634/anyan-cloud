// 11-16 DLC1 全屏窗口（铸造 #d1-forge / 领域 #d1-dom / 深渊之躯 #d1-aby / 命运岔路 #d1-fate / 审判 #d1-judge）换羊皮纸
// 只在 <html class="ui-parch"> 下生效（去掉该类即回原配色）；样式由 tools/parch_dlc.py 从各窗口原样式生成
// #d1-end（结局黑场字幕）是过场，不换
import { PARCH_DLC_CSS } from './parch_dlc_css';

function install() {
  if (typeof document === 'undefined' || document.getElementById('d1-parch-css')) return;
  const st = document.createElement('style'); st.id = 'd1-parch-css'; st.textContent = PARCH_DLC_CSS;
  // 放到 body 末尾：晚于各窗口打开时插入 head 的样式也能按选择器权重覆盖
  (document.body ?? document.head).appendChild(st);
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
}
