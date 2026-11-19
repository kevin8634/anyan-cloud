// 11-18 火光随火焰呼吸（Rhett 11-18 03:54 专长包提升；画质专长包 v8 附录第 120 步「Fire light that flickers with the flame」，Fire in Ice 只学思路，代码自写）。
// 原来：火焰网格按三条正弦缩放、点光强度 = 正弦 + 每帧 Math.random()——光每帧乱跳（随帧率抖，60 帧下像接触不良），且和火苗不同步。
// 现在：同一组平滑值噪声（两层，约 2.3 / 5.1 次每秒）同时驱动火苗缩放与它旁边的点光，火苗一舔光就跟着亮；种子取父节点 id，
//   同一堆篝火 / 同一支火把的火苗与灯共用一个噪声。均值与幅度与原来一致（整体亮度不变）。
// ?off=fireflick（或 localStorage darkrock_cine_off 含 fireflick）回原来的正弦 + 随机。
import type * as THREE from 'three';

export const FIRE_FLICK_OFF = (() => { try { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') ?? '' : ''; const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('darkrock_cine_off') ?? '' : ''; return `${q},${ls}`.split(',').map(x => x.trim()).includes('fireflick'); } catch { return false; } })();

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
/** 一维值噪声 0..1（smoothstep 插值，连续、无跳变） */
const vn = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) + (hash(i + 1) - hash(i)) * u; };
/** 火焰噪声 0..1：慢层（火苗整体起伏）+ 快层（舔动） */
export const fireNoise = (seed: number, t: number) => 0.65 * vn(t * 2.3 + seed * 7.13) + 0.35 * vn(t * 5.1 + seed * 3.71 + 11.0);
/** 火苗与灯共用的种子：同一个父节点（篝火 / 火把组）下的火焰网格和点光同一个值 */
export const fireSeed = (o: THREE.Object3D) => (o.parent ?? o).id;
