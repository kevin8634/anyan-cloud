// 角色面板的 3D 预览（阶段三）：独立的小渲染器，拖动旋转，可以「试穿」装备
import * as THREE from 'three';
import * as M from './models';
import { applyGear, updateGear, Equipped } from './gear';
import { gearStowTick } from './weaponstow';

export class Preview {
  ok = false;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 170 / 230, 0.1, 50);
  private rig: M.Rig | null = null;
  private key = '';
  yaw = 0.5;
  private drag: { x: number; yaw: number } | null = null;
  private spin = 0;   // 松手后的惯性

  constructor(private canvas: HTMLCanvasElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.ok = true;
    } catch { this.ok = false; }
    if (!this.ok) return;
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x3a2a1a, 1.6));
    const key = new THREE.DirectionalLight(0xffe8c0, 2.2); key.position.set(3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ab0ff, 1.2); rim.position.set(-4, 3, -3); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.cam.position.set(0, 1.35, 6.2); this.cam.lookAt(0, 1.05, 0);
    const down = (x: number) => { this.drag = { x, yaw: this.yaw }; this.spin = 0; };
    const move = (x: number) => { if (!this.drag) return; const ny = this.drag.yaw + (x - this.drag.x) * 0.012; this.spin = ny - this.yaw; this.yaw = ny; };
    const up = () => { this.drag = null; };
    canvas.addEventListener('mousedown', e => { down(e.clientX); e.preventDefault(); });
    window.addEventListener('mousemove', e => move(e.clientX));
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', e => { down(e.touches[0].clientX); e.stopPropagation(); }, { passive: true });
    canvas.addEventListener('touchmove', e => { move(e.touches[0].clientX); e.stopPropagation(); }, { passive: true });
    canvas.addEventListener('touchend', up);
  }

  /** 换成某职业、某配色、穿着这些装备的角色（内容没变就不重建） */
  show(clsId: string, look: number, eq: Equipped) {
    if (!this.ok) return;
    const key = `${clsId}:${look}:` + Object.entries(eq).map(([k, v]) => `${k}=${v?.id}:${v?.upgrade ?? 0}:${v?.durability === 0 ? "x" : ""}`).join(',');
    if (key === this.key && this.rig) return;
    this.key = key;
    if (this.rig) this.scene.remove(this.rig.root);
    this.rig = M.makeClassRig(clsId, look);
    this.rig.root.userData.cls = clsId;
    this.scene.add(this.rig.root);
    this.rig.anim?.loop('idle');
    applyGear(this.rig, clsId, eq);
  }
  update(dt: number) {
    if (!this.ok || !this.renderer || !this.rig) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    if (!this.drag) { this.yaw += this.spin; this.spin *= 0.92; }
    this.rig.root.rotation.y = this.yaw;
    this.rig.anim?.update(dt);
    updateGear(this.rig, dt);
    gearStowTick(this.rig, dt, false);   // 11-11 I09：收纳位姿每帧跟着动作重算（原来只在换装时算一次，待机动作一动，背上的武器就飘离身体）
    this.renderer.render(this.scene, this.cam);
  }
}
