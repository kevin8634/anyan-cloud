// 第三人称跟随镜头：挂在 Main Camera 上
// cameraPad：屏幕右半边的透明 UI 节点，手指滑动旋转镜头（技能按钮放在它上层，不会冲突）
// 双指捏合缩放距离
import { _decorator, Component, Node, EventTouch, Vec3, math } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ThirdPersonCamera')
export class ThirdPersonCamera extends Component {
  @property(Node) target: Node | null = null;
  @property(Node) cameraPad: Node | null = null;
  @property distance = 9;
  @property minDistance = 5;
  @property maxDistance = 14;
  @property yaw = 0;            // 水平角(度)
  @property pitch = 35;         // 俯视角(度)，魔兽式斜俯视
  @property minPitch = 10;
  @property maxPitch = 70;
  @property rotateSpeed = 0.25; // 每像素多少度
  @property followLerp = 10;    // 跟随平滑
  @property targetHeight = 1.5; // 看向角色胸口而不是脚底

  private focus = new Vec3();
  /** 在镜头区域上的“轻点”(没怎么滑动)，转发给目标选择，参数是屏幕坐标 */
  onTap: ((screenX: number, screenY: number) => void) | null = null;

  private touches = new Map<number, { x: number; y: number }>();
  private moved = new Map<number, number>();
  private lastPinch = 0;
  private tmp = new Vec3();

  start() {
    if (this.target) this.focus.set(this.target.worldPosition);
    const pad = this.cameraPad;
    if (!pad) return;
    pad.on(Node.EventType.TOUCH_START, this.onStart, this);
    pad.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
    pad.on(Node.EventType.TOUCH_END, this.onEnd, this);
    pad.on(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  private onStart(e: EventTouch) {
    const p = e.getUILocation();
    this.touches.set(e.getID(), { x: p.x, y: p.y });
    this.moved.set(e.getID(), 0);
    this.lastPinch = this.pinchDist();
  }

  private onMove(e: EventTouch) {
    const id = e.getID();
    const prev = this.touches.get(id);
    if (!prev) return;
    const p = e.getUILocation();
    this.moved.set(id, (this.moved.get(id) ?? 0) + Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y));
    if (this.touches.size === 1) {
      this.yaw -= (p.x - prev.x) * this.rotateSpeed;
      this.pitch = math.clamp(this.pitch - (p.y - prev.y) * this.rotateSpeed, this.minPitch, this.maxPitch);
    }
    this.touches.set(id, { x: p.x, y: p.y });
    if (this.touches.size === 2) {
      const d = this.pinchDist();
      if (this.lastPinch > 0) this.distance = math.clamp(this.distance - (d - this.lastPinch) * 0.02, this.minDistance, this.maxDistance);
      this.lastPinch = d;
    }
  }

  private onEnd(e: EventTouch) {
    const id = e.getID();
    if ((this.moved.get(id) ?? 99) < 10 && this.touches.size === 1 && this.onTap) {
      const s = e.getLocation();
      this.onTap(s.x, s.y);
    }
    this.touches.delete(id);
    this.moved.delete(id);
    this.lastPinch = this.pinchDist();
  }

  private pinchDist() {
    if (this.touches.size < 2) return 0;
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** 镜头在地面上的前方向、右方向，给角色移动用 */
  getGroundAxes(outForward: Vec3, outRight: Vec3) {
    const r = math.toRadian(this.yaw);
    outForward.set(-Math.sin(r), 0, -Math.cos(r));
    outRight.set(Math.cos(r), 0, -Math.sin(r));
  }

  lateUpdate(dt: number) {
    if (!this.target) return;
    this.tmp.set(this.target.worldPosition);
    this.tmp.y += this.targetHeight;
    Vec3.lerp(this.focus, this.focus, this.tmp, Math.min(1, this.followLerp * dt));

    const y = math.toRadian(this.yaw), p = math.toRadian(this.pitch);
    const offset = this.tmp.set(
      Math.sin(y) * Math.cos(p) * this.distance,
      Math.sin(p) * this.distance,
      Math.cos(y) * Math.cos(p) * this.distance,
    );
    this.node.setWorldPosition(this.focus.x + offset.x, this.focus.y + offset.y, this.focus.z + offset.z);
    this.node.lookAt(this.focus);
  }
}
