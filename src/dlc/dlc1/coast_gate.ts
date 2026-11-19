// ======================================================================
// DLC1 v1.2.71 入口剧情「潮音钟门」：任务 7-0「余音」+ 灰石营地古井钟门（概念图 docs/设计/沉钟海岸升级/gate_bellwell_camp / gate_descent_reveal）
//   7-0：30 级、本体第六章完成（ch6_4）后由墨言（来到灰石营地）发放
//     ① 深入暗岩深渊（剧情深渊 / 深渊 / 长副本场地，zone 'raid'）击败任一首领 → 取回「心脏碎片」（包自己发 explore 事件）
//     ② 交给布兰铸钟（talk）
//   古井「潮音钟门」：青铜拱门 + 挂钟（钟身暗红裂纹发光）+ 井口。7-0 完成前只有涟漪、钟未铸（只挂空钩）；
//     完成后交互敲钟 → 井水下降 → 下行过场（coast_descent）→ 沉钟海岸潮痕营地（伊奥拉旁）
//   首次下行后营地传送阵才列出「沉钟海岸」；老存档（已接 / 完成 7-1、第七章其他任务、到过海岸）直接视为完成
//   本体只用通用可选挂点：PackManifest.zoneNpcs / zoneProps / interacts、PackWaypoint.hidden
// ======================================================================
import * as THREE from 'three';
import { sceneHang } from './lux_dlc';
import type { PackCtx, PackEvent, PackInteract, PackZoneNpc, PackZoneProp, PackZoneBuildApi } from '../../core/ContentPacks';
import type { QuestDef } from '../../core/Quest';
import { curQuality } from '../../web/gfx';
import { WATER2, W2_GLSL } from '../../web/water2';   // 11-17 水体 v2（?off=water2 回旧）
import { bellMesh, mat, whiteColors } from './coast_kit';
import { playDescent, descentState } from './coast_descent';

export const GATE = { x: -6, z: -7 };   // 灰石营地（本体区域 'world'，世界坐标）古井
export const GATE_Q = 'cs7_0';
const SHARD_AREA = 'dlc1_heart_shard';
const COAST_ID = 'dlc1_coast', COAST_O = { x: 2400, z: -2400 };
const ARRIVE = { x: COAST_O.x + 1.5, z: COAST_O.z + 58.6 };   // 潮痕营地，伊奥拉（3, 56）旁

export const GATE_QUESTS: QuestDef[] = [
  { id: GATE_Q, name: '7-0 余音', giver: 'scholar', turnIn: 'bran', minLevel: 30, requires: ['ch6_4'],
    text: '地面不跳了，可我的笔记还在动——最后一页多了一行潮湿的字：「钟停了。谁来敲下一下？」暗岩之心碎掉的时候，有一片落进了深渊更深的地方。去暗岩深渊最深处把它找回来，交给布兰——营地古井那副空钟架，等这片心脏等了一千年。',
    doneText: '（布兰把碎片投进炉膛，火苗一下变成了暗红。）……钟铸好了，就挂在古井上。墨言说，敲响它，井水会退，像潮水一样。下面是什么，没人知道。',
    objectives: [{ type: 'explore', area: SHARD_AREA, label: '深入暗岩深渊，击败任一首领，取回「心脏碎片」' }, { type: 'talk', npc: 'bran', label: '把心脏碎片交给布兰铸钟' }],
    reward: { xp: 2000, gold: 300 } },
];

// ---------------------------------------------------------------- 状态（包存档 dlc.dlc1.gate）
const S = { shard: 0, descended: 0, coastSeen: 0, rings: 0 };
let ctx: PackCtx | null = null;
export const bindGate = (c: PackCtx) => { ctx = c; };
export const gateSave = () => ({ ...S });
export function gateLoad(d: unknown) { Object.assign(S, { shard: 0, descended: 0, coastSeen: 0, rings: 0 }, d && typeof d === 'object' ? d : {}); }
const qs = (id: string) => ctx?.questState(id) ?? 'locked';
/** 老存档兼容：已接 / 完成 7-1（或第七章任何任务）、到过海岸 */
export function gateLegacy(): boolean {
  if (S.coastSeen) return true;
  return ['cs7_1', 'cs7_2', 'cs7_3', 'cs7_4', 'cs7_5', 'cs7_6'].some(id => ['active', 'ready', 'done'].includes(qs(id)));
}
/** 7-0 视为完成（钟已铸） */
export const gateDone = () => qs(GATE_Q) === 'done' || gateLegacy();
/** 营地传送阵列出「沉钟海岸」 */
export const gateOpen = () => !!S.descended || gateLegacy();

// ---------------------------------------------------------------- 心脏碎片：深渊里击败首领
export function gateEvent(ev: PackEvent) {
  if (ev.type !== 'kill' || !ev.boss || ev.map !== 'raid' || !ctx) return;
  if (qs(GATE_Q) !== 'active' || S.shard) return;
  S.shard = 1; ctx.questEvent?.('explore', SHARD_AREA);
  ctx.toast('首领的残骸里，有一片还在微微发烫的暗红碎片——「心脏碎片」', '#ff8a5a');
}

// ---------------------------------------------------------------- 营地古井：造景
let bellG: THREE.Group | null = null, hook: THREE.Object3D | null = null, water: THREE.Mesh | null = null, stairs: THREE.Object3D | null = null, ring: THREE.Mesh | null = null;
const gateU = { uTime: { value: 0 }, uLevel: { value: 0 }, uGlow: { value: 0 } };
function crackTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  let s = 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.strokeStyle = '#ff5a2a'; g.lineCap = 'round'; g.shadowColor = '#ff3a10'; g.shadowBlur = 6;
  for (let k = 0; k < 18; k++) { let x = r() * 256, y = r() * 128; g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 26; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function runeTex(): THREE.CanvasTexture {
  const S2 = 512, c = document.createElement('canvas'); c.width = c.height = S2; const g = c.getContext('2d')!; const m = S2 / 2;
  g.clearRect(0, 0, S2, S2); g.strokeStyle = 'rgba(120,255,235,0.9)'; g.lineWidth = 3;
  for (const r of [0.92, 0.78]) { g.beginPath(); g.arc(m, m, m * r, 0, Math.PI * 2); g.stroke(); }
  g.font = `bold ${S2 * 0.05}px serif`; g.fillStyle = 'rgba(120,255,235,0.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.save(); g.translate(m + Math.cos(a) * m * 0.85, m + Math.sin(a) * m * 0.85); g.rotate(a + Math.PI / 2);
    // 系统字体可能没有卢恩字母：同时画几笔折线符号兜底
    g.fillText(glyphs[i], 0, 0); g.beginPath(); g.moveTo(-8, -10); g.lineTo(0, 10); g.lineTo(8, -10); g.stroke(); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildGate(api: PackZoneBuildApi) {
  const lowQ = curQuality === 'low', root = new THREE.Group(); root.name = 'dlc1_bellgate';
  const st = mat('stone'), R0 = 1.55, R1 = 2.25;
  // 井沿：石环（顶面 + 内外壁），往下 6 米的井筒
  const pr = [new THREE.Vector2(R0, -6), new THREE.Vector2(R0, 0.75), new THREE.Vector2(R0 + 0.1, 0.85), new THREE.Vector2(R1 - 0.1, 0.85), new THREE.Vector2(R1, 0.75), new THREE.Vector2(R1 + 0.15, 0)];
  const lip = new THREE.Mesh(whiteColors(new THREE.LatheGeometry(pr, lowQ ? 16 : 36)), st); lip.castShadow = true; lip.receiveShadow = true; root.add(lip);
  // 井内螺旋阶梯（水退了才看得见）
  stairs = new THREE.Group(); stairs.name = 'dlc1_gate_stairs';
  const stepG = whiteColors(new THREE.BoxGeometry(0.9, 0.16, 0.42)), sm = mat('stone');
  for (let i = 0; i < (lowQ ? 14 : 26); i++) { const a = i * 0.42, y = 0.2 - i * 0.22; const s = new THREE.Mesh(stepG, sm); s.position.set(Math.cos(a) * (R0 - 0.45), y, Math.sin(a) * (R0 - 0.45)); s.rotation.y = -a; stairs.add(s); }
  root.add(stairs);
  // 井水：涟漪（7-0 前常驻），uLevel 0 → 1 水面下降 5 米
  water = new THREE.Mesh(new THREE.CircleGeometry(R0 - 0.02, 40), new THREE.ShaderMaterial({ transparent: true, uniforms: gateU,
    vertexShader: 'varying vec2 vU; varying vec3 vWp; uniform float uLevel; void main(){ vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    // 11-07 水体六条：叠加波（同心涟漪 + 两层斜向细波）、深浅变色（井壁边浅 → 井心深）、菲涅尔、井壁接触白沫、浅处焦散（低画质关）
    fragmentShader: `uniform float uTime; uniform float uLevel; uniform float uGlow; varying vec2 vU; varying vec3 vWp;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      ${WATER2.off ? '' : W2_GLSL}
      void main(){ vec2 d = vU - 0.5; float r = length(d) * 2.0;
        float w = (sin(r * 26.0 - uTime * 3.2) * 0.5 + 0.5) * (1.0 - r) * 0.55 + n2(vU * 9.0 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.3 + n2(vU * 17.0 - vec2(uTime * 0.31, uTime * 0.12)) * 0.15;
        vec3 sh = vec3(0.07, 0.24, 0.23), dp = vec3(0.01, 0.06, 0.07);
        ${WATER2.off ? 'vec3 c = mix(sh, dp, smoothstep(0.95, 0.15, r));' : 'vec3 c = w2Body(sh, dp, w2Absorb((1.0 - r) * 5.0 + 0.15, abs(normalize(cameraPosition - vWp).y), 0.75));   // 11-17 v2：井水按深度 RGB 吸收（井壁边浅、井心 5 米深）'}
        c = mix(c, vec3(0.18, 0.75, 0.70), w * 0.32 + uGlow * 0.25 * (1.0 - r));
        vec3 V = normalize(cameraPosition - vWp); float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        c = mix(c, vec3(0.55, 0.68, 0.72), fr * 0.5);
        float foam = smoothstep(0.86, 0.97, r) * smoothstep(0.35, 0.7, n2(vU * 30.0 + vec2(uTime * 0.4, 0.0)));
        ${WATER2.off ? '' : 'foam *= 0.35 + 0.65 * w2FoamOp(foam * 1.3, n2(vU * 21.0 + uTime * 0.2));   // 11-17 v2：井壁沫 Beer-Lambert 透明度'}
        c = mix(c, vec3(0.78, 0.86, 0.84), foam * 0.6);
#ifndef GATE_LOW
        float c1 = n2(vU * 14.0 + vec2(uTime * 0.3, 0.0)), c2 = n2(vU * 18.0 + vec2(0.0, uTime * 0.26) + 3.0);
        c += vec3(0.12, 0.34, 0.3) * pow(clamp(1.0 - abs(c1 - c2) * 2.2, 0.0, 1.0), 8.0) * 0.35 * smoothstep(0.3, 0.9, r);
#endif
        gl_FragColor = vec4(c, mix(0.92, 0.6, uLevel) * (0.88 + 0.12 * fr) + foam * 0.08); }`, defines: lowQ ? { GATE_LOW: '' } : {} }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.45; water.name = 'dlc1_gate_water'; root.add(water);
  // 地面符文环（概念图：井台四周一圈发光符文）
  ring = new THREE.Mesh(new THREE.RingGeometry(R1 + 0.2, R1 + 2.4, lowQ ? 32 : 64), new THREE.MeshBasicMaterial({ map: runeTex(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.name = 'dlc1_gate_runes'; root.add(ring);
  // 青铜拱门：两根方柱 + 半圆拱 + 顶部挂钩
  const br = mat('bronze');
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(0.42, 4.6, 0.42)), br); p.position.set(sd * (R1 + 0.15), 2.3, 0); p.castShadow = true; root.add(p);
    const cap = new THREE.Mesh(whiteColors(new THREE.BoxGeometry(0.6, 0.25, 0.6)), br); cap.position.set(sd * (R1 + 0.15), 4.65, 0); root.add(cap); }
  const arch = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(R1 + 0.15, 0.2, 8, lowQ ? 16 : 32, Math.PI)), br); arch.position.y = 4.6; arch.castShadow = true; root.add(arch);
  hook = new THREE.Mesh(whiteColors(new THREE.TorusGeometry(0.16, 0.05, 6, 12)), mat('rust')); hook.position.y = 4.6 + R1 - 0.1; root.add(hook);
  // 挂钟：钟身暗红裂纹发光（7-0 完成后才显示）
  bellG = new THREE.Group(); bellG.name = 'dlc1_gate_bell';
  // 11-14d Rhett：挂钟改用已有模型 scene_wl_well_bell（钟身压暗 + 暗红自发光）；低画质 / 没模型回退程序钟 + 裂纹贴图
  const glb = lowQ ? null : sceneHang('scene_wl_well_bell', { h: 2.2 }, () => null as unknown as THREE.Group);
  if (glb) { glb.userData.dynHang = false; glb.position.y = -0.1; glb.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.color.multiplyScalar(0.55); mm.emissive.setHex(0x8a1a10); mm.emissiveIntensity = 0.6; m.material = mm; }); bellG.add(glb); }
  const b = bellMesh(0.95, lowQ ? 14 : 28); b.position.y = -1.95;
  const crack = crackTex();
  if (glb) b.visible = false;
  b.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; if ((m.geometry as THREE.LatheGeometry).type === 'LatheGeometry') {
    m.material = lowQ ? new THREE.MeshLambertMaterial({ color: 0x3a2018, emissive: 0xffffff, emissiveMap: crack, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: 0.45, metalness: 0.75, emissive: 0xffffff, emissiveMap: crack, emissiveIntensity: 1.4, side: THREE.DoubleSide }); } });
  if (!glb) bellG.add(b); bellG.position.y = 4.6 + R1 - 0.15; root.add(bellG);
  root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.userData.outlineParameters = { visible: false }; });
  api.add(root, GATE.x, GATE.z, 0);
  for (const sd of [-1, 1]) api.block?.(GATE.x + sd * (R1 + 0.15), GATE.z, 0.45);
  api.block?.(GATE.x, GATE.z, R1 - 0.2);
  syncLook();
}
function syncLook() {
  const done = gateDone();
  if (bellG) bellG.visible = done;
  if (stairs) stairs.visible = gateU.uLevel.value > 0.05;
  if (ring) (ring.material as THREE.MeshBasicMaterial).opacity = done ? 0.75 : 0.3;
  gateU.uGlow.value = done ? 1 : 0;
}

// ---------------------------------------------------------------- 交互：敲钟 → 井水下降 → 下行过场 → 海岸
let busy = false, lvlT = -1;
export const gateDbg = { speed: 1, lastRingAt: 0, descents: 0, arrived: 0 };
function bellChime() {
  const A = ctx?.synth?.(); if (!A || !A.gate('gate_bell', 0.5)) return;
  for (const [r, g, d] of [[1, 0.22, 3.5], [2.76, 0.12, 2], [5.4, 0.05, 1.2], [0.5, 0.1, 4.5]] as [number, number, number][]) A.tone({ f: 174 * r, dur: d, gain: g, a: 0.005, type: 'sine' });
  A.noise({ f: 2400, dur: 0.12, gain: 0.08, q: 2 });
}
export function ringBell(): boolean {
  if (!ctx || busy) return false;
  if (!gateDone()) { ctx.toast(qs(GATE_Q) === 'active' ? '钟还没铸好：先带回「心脏碎片」，交给布兰' : '井水泛着细细的涟漪……墨言也许知道这口井的来历', '#9fe8e0'); return false; }
  if (ctx.level() < 30) { ctx.toast('需要等级 30', '#f66'); return false; }
  busy = true; S.rings++; gateDbg.lastRingAt = performance.now();
  bellChime(); lvlT = 0;
  ctx.yell('当——');
  setTimeout(() => {
    gateDbg.descents++;
    playDescent(gateDbg.speed, () => {
      const ok = ctx?.goMap(COAST_ID, ARRIVE, '前往') ?? false;
      if (ok) { S.descended = 1; gateDbg.arrived++; ctx?.toast('伊奥拉：「你听见钟声了，对吧？……来，海就在这里。」', '#7fe8f0'); ctx?.save(); }
      busy = false; lvlT = -1; gateU.uLevel.value = 0; syncLook();
    });
  }, 1700 / Math.max(0.25, gateDbg.speed));
  return true;
}
export const GATE_INTERACT: PackInteract = { zone: 'world', x: GATE.x, z: GATE.z, r: 3.4,
  label: () => descentState.on ? null : !ctx || ctx.level() < 30 ? '古井：井水泛着细细的涟漪' : gateDone() ? '敲响潮音钟（下行：沉钟海岸）' : '古井：井水泛着细细的涟漪', act: () => { ringBell(); } };
/** 墨言来到灰石营地（本体 NPC id 'scholar'：名字 / 对话同本体，在营地发放 7-0） */
// 11-18 Rhett「墨言移动到箭头位置」：古井右前 → 古井左后、帐篷前（与原位隔井对称，面朝古井）；?off=moyanpos 回旧
const MOYAN_OLD = (() => { try { return /(?:[?&]off=[^&]*\bmoyanpos\b)/.test(location.search); } catch { return false; } })();
export const GATE_NPCS: PackZoneNpc[] = [{ id: 'scholar', zone: 'world', ...(MOYAN_OLD ? { x: -9.4, z: -9.6, yaw: 0.9 } : { x: -3.4, z: -4.2, yaw: -2.41 }), model: 'Mage@npc_moyan', tint: 0x5a4a8a, tintK: 0.3 }];
export const GATE_PROPS: PackZoneProp[] = [{ zone: 'world', build: api => { try { buildGate(api); } catch (e) { console.error('潮音钟门造景出错', e); } } }];

/** 每帧（manifest.update） */
let acc = 0;
export function gateUpdate(dt: number) {
  if (!ctx) return;
  const m = ctx.map();
  if (m === COAST_ID && !S.coastSeen) S.coastSeen = 1;
  if (m !== 'camp') return;
  gateU.uTime.value += dt;
  if (lvlT >= 0) { lvlT += dt * gateDbg.speed; gateU.uLevel.value = Math.min(1, lvlT / 1.6); if (water) water.position.y = 0.45 - gateU.uLevel.value * 5; if (stairs) stairs.visible = true; }
  acc += dt; if (acc > 0.5) { acc = 0; syncLook(); }
  if (bellG?.visible) { const t = gateU.uTime.value; bellG.rotation.z = Math.sin(t * 0.8) * 0.03 + (lvlT >= 0 ? Math.sin(lvlT * 9) * 0.2 * Math.max(0, 1 - lvlT) : 0); }
}
export const gateDebug = () => ({ ...S, state: qs(GATE_Q), done: gateDone(), open: gateOpen(), legacy: gateLegacy(), busy, level: +gateU.uLevel.value.toFixed(2), bell: !!bellG?.visible, built: !!bellG, ...gateDbg, descent: { ...descentState } });
export const gateApi = { debug: gateDebug, ring: ringBell, simShard: () => gateEvent({ type: 'kill', kind: 'test_boss', elite: true, boss: true, map: 'raid', x: 0, z: 0 }),
  setSpeed: (k: number) => { gateDbg.speed = k; }, markDescended: () => { S.descended = 1; }, reset: () => gateLoad({}) };
