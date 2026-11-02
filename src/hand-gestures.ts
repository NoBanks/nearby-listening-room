import { Matrix4, Vector3 } from '@iwsdk/core';

// Raised open palm, facing away from the viewer: the universal "hold on".
// Read straight from WebXR hand joints so it works with one hand, either hand.

const HOLD_SECONDS = 0.45;
const REARM_SECONDS = 0.3;
const COOLDOWN_SECONDS = 1.2;

type Side = 'left' | 'right';

interface HandState {
  held: number;
  away: number;
  armed: boolean;
}

export class PalmGesture {
  /** 0 to 1 while a palm is being held up, for feedback. */
  progress = 0;

  private hands: Record<Side, HandState> = {
    left: { held: 0, away: 1, armed: true },
    right: { held: 0, away: 1, armed: true },
  };
  private cooldown = 0;
  private wrist = new Vector3();
  private indexBase = new Vector3();
  private pinkyBase = new Vector3();
  private middleTip = new Vector3();
  private indexTip = new Vector3();
  private thumbTip = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private normal = new Vector3();
  private toHand = new Vector3();

  /**
   * Returns true on the frame a held-up palm completes.
   * `origin` maps the XR reference space into the world (the player rig).
   */
  update(
    delta: number,
    frame: XRFrame | null | undefined,
    space: XRReferenceSpace | null,
    origin: Matrix4,
    head: Vector3,
  ): boolean {
    this.cooldown = Math.max(0, this.cooldown - delta);
    let fired = false;
    let best = 0;
    const seen = { left: false, right: false };
    if (frame && space && frame.getJointPose) {
      for (const source of frame.session.inputSources) {
        const hand = source.hand;
        const side = source.handedness;
        if (!hand || (side !== 'left' && side !== 'right')) continue;
        seen[side] = true;
        const open = this.read(frame, space, hand, origin) && this.isRaisedOpenPalm(side, head);
        const state = this.hands[side];
        if (open) {
          state.away = 0;
          if (state.armed) state.held += delta;
        } else {
          state.away += delta;
          state.held = 0;
          if (state.away > REARM_SECONDS) state.armed = true;
        }
        if (state.armed && state.held >= HOLD_SECONDS && this.cooldown === 0) {
          state.armed = false;
          state.held = 0;
          this.cooldown = COOLDOWN_SECONDS;
          fired = true;
        }
        if (state.armed) best = Math.max(best, Math.min(1, state.held / HOLD_SECONDS));
      }
    }
    for (const side of ['left', 'right'] as const) if (!seen[side]) this.hands[side].held = 0;
    this.progress = best;
    return fired;
  }

  private read(frame: XRFrame, space: XRReferenceSpace, hand: XRHand, origin: Matrix4): boolean {
    return (
      this.joint(frame, space, hand, 'wrist', this.wrist, origin) &&
      this.joint(frame, space, hand, 'index-finger-metacarpal', this.indexBase, origin) &&
      this.joint(frame, space, hand, 'pinky-finger-metacarpal', this.pinkyBase, origin) &&
      this.joint(frame, space, hand, 'middle-finger-tip', this.middleTip, origin) &&
      this.joint(frame, space, hand, 'index-finger-tip', this.indexTip, origin) &&
      this.joint(frame, space, hand, 'thumb-tip', this.thumbTip, origin)
    );
  }

  private joint(
    frame: XRFrame,
    space: XRReferenceSpace,
    hand: XRHand,
    name: XRHandJoint,
    out: Vector3,
    origin: Matrix4,
  ): boolean {
    const jointSpace = hand.get(name);
    const pose = jointSpace && frame.getJointPose!(jointSpace, space);
    if (!pose) return false;
    const p = pose.transform.position;
    out.set(p.x, p.y, p.z).applyMatrix4(origin);
    return true;
  }

  private isRaisedOpenPalm(side: Side, head: Vector3): boolean {
    // Fingers spread and extended, not pinching.
    if (this.middleTip.distanceTo(this.wrist) < 0.14) return false;
    if (this.indexTip.distanceTo(this.thumbTip) < 0.05) return false;
    // Raised: above the desk and fingers pointing up.
    if (this.wrist.y < head.y - 0.38) return false;
    if (this.middleTip.y - this.wrist.y < 0.08) return false;
    // Palm faces away from the viewer.
    this.a.subVectors(this.indexBase, this.wrist);
    this.b.subVectors(this.pinkyBase, this.wrist);
    this.normal.crossVectors(this.a, this.b).normalize();
    if (side === 'left') this.normal.negate();
    this.toHand.subVectors(this.wrist, head);
    this.toHand.y = 0;
    if (this.toHand.lengthSq() < 1e-6) return false;
    this.toHand.normalize();
    return this.normal.dot(this.toHand) > 0.55;
  }
}
