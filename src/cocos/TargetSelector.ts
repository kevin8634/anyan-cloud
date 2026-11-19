// 自动锁定：没目标或目标死亡/太远时，锁定最近的敌人；点击屏幕上的敌人可手动切换
// 挂在玩家节点上；selectionRing 是脚下红圈特效节点（可选）
import { _decorator, Component, Node, Camera, geometry, Vec3 } from 'cc';
import { Enemy } from './Enemy';
import { ThirdPersonCamera } from './ThirdPersonCamera';
const { ccclass, property } = _decorator;

@ccclass('TargetSelector')
export class TargetSelector extends Component {
  @property(Camera) camera: Camera | null = null;
  @property(Node) selectionRing: Node | null = null;
  @property autoRange = 15;   // 自动锁定范围
  @property loseRange = 25;   // 超出就丢失目标
  @property pickRadius = 1.2; // 点击判定半径(米)

  current: Enemy | null = null;
  private ray = new geometry.Ray();
  private sphere = new geometry.Sphere();

  start() {
    const cam = this.camera?.getComponent(ThirdPersonCamera);
    if (cam) cam.onTap = (x, y) => this.pick(x, y);
  }

  /** 点到敌人就切换目标（射线 vs 球体，不依赖物理引擎） */
  pick(screenX: number, screenY: number) {
    if (!this.camera) return;
    this.camera.screenPointToRay(screenX, screenY, this.ray);
    let best: Enemy | null = null, bestT = Infinity;
    Enemy.all.forEach(en => {
      if (!en.alive) return;
      Vec3.copy(this.sphere.center, en.node.worldPosition);
      this.sphere.center.y += 1;
      this.sphere.radius = this.pickRadius;
      const t = geometry.intersect.raySphere(this.ray, this.sphere);
      if (t > 0 && t < bestT) { bestT = t; best = en; }
    });
    if (best) this.current = best;
  }

  distanceTo(en: Enemy) { return Vec3.distance(this.node.worldPosition, en.node.worldPosition); }

  update() {
    const c = this.current;
    if (!c || !c.isValid || !c.alive || this.distanceTo(c) > this.loseRange) this.current = this.findNearest();
    if (this.selectionRing) {
      this.selectionRing.active = !!this.current;
      if (this.current) this.selectionRing.setWorldPosition(this.current.node.worldPosition);
    }
  }

  findNearest(): Enemy | null {
    let best: Enemy | null = null, bestD = this.autoRange;
    Enemy.all.forEach(en => {
      if (!en.alive) return;
      const d = this.distanceTo(en);
      if (d < bestD) { bestD = d; best = en; }
    });
    return best;
  }
}
