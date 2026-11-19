// 虚拟摇杆：挂在屏幕左半边的透明 UI 节点上（触摸区域），子节点 base(底盘) / knob(摇杆头)
// 手指按下的位置就是摇杆中心（浮动摇杆，手机上更顺手）
import { _decorator, Component, Node, EventTouch, UITransform, Vec2, Vec3, UIOpacity } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VirtualJoystick')
export class VirtualJoystick extends Component {
  @property(Node) base: Node | null = null;
  @property(Node) knob: Node | null = null;
  @property maxRadius = 90;        // 摇杆头最大偏移(像素)
  @property deadZone = 0.12;       // 死区
  @property idleOpacity = 120;     // 不操作时的透明度

  /** 输出方向：x 右为正，y 上为正，长度 0~1。其他脚本直接读 */
  readonly dir = new Vec2();

  private touchId: number | null = null;
  private defaultBasePos = new Vec3();
  private tmp = new Vec3();

  start() {
    this.base && this.defaultBasePos.set(this.base.position);
    this.setOpacity(this.idleOpacity);
    this.node.on(Node.EventType.TOUCH_START, this.onStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  private toLocal(e: EventTouch, out: Vec3) {
    const p = e.getUILocation();
    out.set(p.x, p.y, 0);
    this.node.getComponent(UITransform)!.convertToNodeSpaceAR(out, out);
    return out;
  }

  private onStart(e: EventTouch) {
    if (this.touchId !== null) return;
    this.touchId = e.getID();
    this.base?.setPosition(this.toLocal(e, this.tmp));
    this.knob?.setPosition(Vec3.ZERO);
    this.setOpacity(255);
  }

  private onMove(e: EventTouch) {
    if (e.getID() !== this.touchId || !this.base) return;
    const p = this.toLocal(e, this.tmp).subtract(this.base.position);
    const len = p.length();
    if (len > this.maxRadius) p.multiplyScalar(this.maxRadius / len);
    this.knob?.setPosition(p);
    const n = Math.min(len, this.maxRadius) / this.maxRadius;
    if (n < this.deadZone) this.dir.set(0, 0);
    else this.dir.set(p.x / this.maxRadius, p.y / this.maxRadius);
  }

  private onEnd(e: EventTouch) {
    if (e.getID() !== this.touchId) return;
    this.touchId = null;
    this.dir.set(0, 0);
    this.base?.setPosition(this.defaultBasePos);
    this.knob?.setPosition(Vec3.ZERO);
    this.setOpacity(this.idleOpacity);
  }

  private setOpacity(v: number) {
    if (!this.base) return;
    const op = this.base.getComponent(UIOpacity) ?? this.base.addComponent(UIOpacity);
    op.opacity = v;
  }
}
