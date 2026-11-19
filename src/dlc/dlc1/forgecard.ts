// v1.2.52 铸造分享卡：出炉演出抓的一帧 + 武器名 + 玩家写的提示词 → 1080×1350（4:5，适合小红书 / 朋友圈）PNG。
// 演出结束后右下角浮出「📜 保存铸造卡」按钮，20 秒后自动收起。
import { forgeSnap } from './forgeshow';

const W = 1080, H = 1350;
export const forgeCardState = { offered: 0, saved: 0, last: '' };

function wrapText(x: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const ch of s) { if (x.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out;
}

/** 合成卡片，返回 PNG data URL（读不到画面 = 空串） */
export async function makeForgeCard(o: { snap: string; name: string; prompt: string; online: boolean; box?: [number, number, number, number] }): Promise<string> {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); if (!x) return '';
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a110a'); bg.addColorStop(1, '#070504'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // 画面：cover 裁进上部 1000×900
  const PX = 40, PY = 40, PW = W - 80, PH = 900;
  if (o.snap) {
    const img = new Image(); img.src = o.snap;
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 3000); });
    if (img.naturalWidth) {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(PW / iw, PH / ih); let sw = PW / s, sh = PH / s, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
      const b = o.box;   // v1.2.53：按武器屏幕框取景放大，武器占满画面约九成高
      if (b && b[3] > b[2] && b[1] > b[0]) {
        const bh = Math.min(1, Math.max(0.45, (b[3] - b[2]) * 1.14)) * ih;
        sh = Math.min(sh, bh); sw = sh * PW / PH;
        const cx = (b[0] + b[1]) / 2 * iw, cy = (b[2] + b[3]) / 2 * ih;
        sx = Math.min(iw - sw, Math.max(0, cx - sw / 2)); sy = Math.min(ih - sh, Math.max(0, cy - sh / 2 - sh * 0.02));
      }
      x.drawImage(img, sx, sy, sw, sh, PX, PY, PW, PH);
    }
  }
  const fade = x.createLinearGradient(0, PY + PH - 220, 0, PY + PH); fade.addColorStop(0, 'rgba(7,5,4,0)'); fade.addColorStop(1, 'rgba(7,5,4,1)'); x.fillStyle = fade; x.fillRect(PX, PY + PH - 220, PW, 220);
  // 金边
  x.strokeStyle = '#c8a040'; x.lineWidth = 3; x.strokeRect(22, 22, W - 44, H - 44);
  x.strokeStyle = 'rgba(200,160,64,.45)'; x.lineWidth = 1; x.strokeRect(32, 32, W - 64, H - 64);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.shadowColor = 'rgba(255,150,40,.55)'; x.shadowBlur = 24; x.fillStyle = '#ffe2a8'; x.font = '700 76px serif';
  x.fillText(`「${o.name}」`, W / 2, 1010);
  x.shadowBlur = 0; x.fillStyle = '#c8a878'; x.font = '32px serif';
  const lines = wrapText(x, o.prompt ? `铸造词：${o.prompt}` : '铸造词：—', W - 200).slice(0, 3);
  lines.forEach((l, i) => x.fillText(l, W / 2, 1080 + i * 46));
  x.fillStyle = 'rgba(200,160,64,.7)'; x.fillRect(W / 2 - 160, 1222, 320, 1);
  x.fillStyle = '#e8d4a8'; x.font = '600 34px serif'; x.fillText('暗岩传说：深渊回响 · 钟铜铸造台', W / 2, 1272);
  const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
  x.fillStyle = '#8a7658'; x.font = '24px serif';
  x.fillText(`${o.online ? 'Aholo Lux3D 实时生成' : '武器库'} · ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, W / 2, 1310);
  try { return c.toDataURL('image/png'); } catch { return ''; }
}

/** 演出结束后浮出按钮（没抓到画面就不出） */
export function offerForgeCard(prompt: string, online: boolean) {
  if (!forgeSnap.url || typeof document === 'undefined') return;
  const snap = forgeSnap.url, name = forgeSnap.name, box = forgeSnap.box;
  document.getElementById('forge-card-btn')?.remove();
  const b = document.createElement('button'); b.id = 'forge-card-btn'; b.textContent = '📜 保存铸造卡';
  Object.assign(b.style, { position: 'fixed', right: '22px', bottom: '150px', zIndex: '9000', background: 'linear-gradient(#4a3418,#2a1c0c)', color: '#ffd890', border: '1px solid #c8a040', borderRadius: '8px', padding: '10px 18px', font: '600 15px serif', cursor: 'pointer', boxShadow: '0 0 18px rgba(255,160,60,.35)' });
  const kill = setTimeout(() => b.remove(), 20000);
  ['mousedown', 'pointerdown', 'touchstart'].forEach(k => b.addEventListener(k, e => e.stopPropagation()));
  b.onclick = async e => {
    e.stopPropagation(); clearTimeout(kill); b.textContent = '生成中……';
    const url = await makeForgeCard({ snap, name, prompt, online, box });
    if (url) { const a = document.createElement('a'); a.href = url; a.download = `铸造卡_${name}.png`; document.body.appendChild(a); a.click(); a.remove(); forgeCardState.saved++; forgeCardState.last = url.slice(0, 32); }
    b.remove();
  };
  document.body.appendChild(b); forgeCardState.offered++;
}
