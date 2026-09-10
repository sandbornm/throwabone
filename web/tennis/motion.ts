import { HandMotionTracker, type TrackedHand } from '../lib/game/hand-motion';
import type { Landmark } from '../lib/game/motion';
import {
  clamp,
  type RacketMotion,
  type Swing,
  type TennisSettings,
} from './types';

export type TennisHand = TrackedHand & { label?: string };
export type MotionFrame = {
  points: Landmark[];
  hands: TennisHand[];
  time: number;
  width: number;
  height: number;
};
export type MotionFeedback = RacketMotion & {
  message: string;
  calibrated: boolean;
  progress: number;
  confidence: number;
  speed: number;
  spin: number | null;
  elbow: number | null;
  position?: { x: number; y: number };
  swing?: Swing;
  toss?: boolean;
};
type Sample = {
  x: number;
  y: number;
  time: number;
  elbowX: number;
  elbowY: number;
  offY: number | null;
  offX: number | null;
};
const visible = (p: Landmark | undefined) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility ?? 1) >= 0.6;
export function elbowAngle(
  a: Landmark,
  b: Landmark,
  c: Landmark,
  aspect: number,
) {
  const ax = (a.x - b.x) * aspect,
    ay = a.y - b.y,
    bx = (c.x - b.x) * aspect,
    by = c.y - b.y;
  const d = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return d < 1e-8
    ? null
    : (Math.acos(clamp((ax * bx + ay * by) / d, -1, 1)) * 180) / Math.PI;
}

export class TennisMotion {
  private previous: Sample | null = null;
  private calibration: Sample[] = [];
  private origin: {
    x: number;
    y: number;
    scale: number;
    offX: number;
    offY: number;
  } | null = null;
  private calibrating = true;
  private scale = 0.22;
  private smoothed = { x: 0, y: 0 };
  private quietSince: number | null = null;
  private ready = false;
  private lastSwing = -Infinity;
  private activeStroke: { id: number; shot: Swing; lastMoving: number } | null =
    null;
  private lastToss = -Infinity;
  private offLow = false;
  private signature = '';
  private trackedLabel: string | null = null;
  private handTracker = new HandMotionTracker();
  private palmRoll: { angle: number; time: number } | null = null;
  private neutralRoll: number | null = null;
  calibrate() {
    this.neutralRoll = null;
    this.trackedLabel = null;
    this.origin = null;
    this.calibration = [];
    this.calibrating = true;
    this.resetMotion();
  }
  resetMotion() {
    this.previous = null;
    this.activeStroke = null;
    this.ready = false;
    this.quietSince = null;
    this.smoothed = { x: 0, y: 0 };
    this.handTracker.reset();
    this.palmRoll = null;
    this.offLow = false;
  }
  update(
    frame: MotionFrame,
    settings: TennisSettings,
    paused = false,
  ): MotionFeedback {
    const signature = `${settings.mode}:${settings.hand}`;
    if (this.signature && this.signature !== signature) this.calibrate();
    this.signature = signature;
    const blank: MotionFeedback = {
      message: '',
      calibrated: this.origin !== null,
      progress: 0,
      confidence: 0,
      speed: 0,
      spin: null,
      elbow: null,
    };
    const fail = (message: string) => {
      this.resetMotion();
      this.calibration = [];
      return { ...blank, message };
    };
    if (!Number.isFinite(frame.time) || frame.width <= 0 || frame.height <= 0)
      return fail('Waiting for a camera frame.');
    if (paused) {
      this.resetMotion();
      return {
        ...blank,
        message: 'Paused. Use the court to explore the ball.',
      };
    }
    const right = settings.hand === 'right';
    const [si, ei, wi, oi] = right ? [12, 14, 16, 15] : [11, 13, 15, 16];
    const pose = frame.points;
    const aspect = frame.width / frame.height;
    let wrist = pose[wi];
    const validHands = frame.hands.filter(
      (hand) =>
        hand.points.length === 21 &&
        hand.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    );
    let hand: TennisHand | undefined;
    if (settings.mode === 'swat' && validHands.length === 1) {
      hand = validHands[0];
      wrist = hand.points[0];
    } else if (visible(wrist)) {
      const nearest = validHands
        .map((h) => ({
          h,
          d: Math.hypot(
            (h.points[0].x - wrist.x) * aspect,
            h.points[0].y - wrist.y,
          ),
        }))
        .sort((a, b) => a.d - b.d);
      if (
        nearest[0]?.d < 0.16 &&
        (!nearest[1] || nearest[1].d - nearest[0].d > 0.02)
      )
        hand = nearest[0].h;
    } else {
      const labelled = validHands.filter(
        (h) =>
          h.label?.toLowerCase() ===
          (settings.mode === 'swat'
            ? (this.trackedLabel ?? settings.hand)
            : settings.hand),
      );
      if (labelled.length === 1) {
        hand = labelled[0];
        wrist = hand.points[0];
      }
    }
    if (settings.mode === 'swat' && hand) wrist = hand.points[0];
    if (settings.mode === 'swat' && hand?.label)
      this.trackedLabel = hand.label.toLowerCase();
    if (!visible(wrist))
      return fail(
        settings.mode === 'swat'
          ? 'Show one open hand in the preview. Your elbow can stay out of view.'
          : `Bring your ${settings.hand} hand into view.`,
      );
    if (
      settings.mode === 'arm' &&
      ![pose[si], pose[ei], pose[wi]].every(visible)
    )
      return fail('Keep your shoulder, elbow and wrist in view.');
    const offHand = validHands.find((h) => h !== hand);
    const off = visible(pose[oi]) ? pose[oi] : offHand?.points[0];
    if (settings.mode === 'dual' && !visible(off))
      return fail('Show both hands. Your off hand positions the racket.');
    const shoulderWidth = [pose[11], pose[12]].every(visible)
      ? Math.hypot((pose[11].x - pose[12].x) * aspect, pose[11].y - pose[12].y)
      : 0;
    const palmSize = hand
      ? Math.hypot(
          (hand.points[9].x - wrist.x) * aspect,
          hand.points[9].y - wrist.y,
        )
      : 0;
    const palmAngle = hand
      ? Math.atan2(
          -(hand.points[9].y - hand.points[0].y),
          -(hand.points[9].x - hand.points[0].x) * aspect,
        )
      : null;
    const sample: Sample = {
      x: (1 - wrist.x) * aspect,
      y: 1 - wrist.y,
      time: frame.time,
      elbowX: visible(pose[ei]) ? (1 - pose[ei].x) * aspect : 0,
      elbowY: visible(pose[ei]) ? 1 - pose[ei].y : 0,
      offX: visible(off) ? (1 - off!.x) * aspect : null,
      offY: visible(off) ? 1 - off!.y : null,
    };
    blank.elbow =
      settings.mode === 'arm' && [pose[si], pose[ei], pose[wi]].every(visible)
        ? elbowAngle(pose[si], pose[ei], pose[wi], aspect)
        : null;
    blank.confidence = hand ? 1 : 0.7;
    if (this.calibrating || !this.origin) {
      const prior = this.calibration.at(-1);
      if (
        prior &&
        (frame.time - prior.time > 250 ||
          Math.hypot(sample.x - prior.x, sample.y - prior.y) > 0.025)
      )
        this.calibration = [];
      this.calibration.push(sample);
      const duration = sample.time - this.calibration[0].time;
      blank.progress = clamp(duration / 900, 0, 1);
      if (duration >= 900 && this.calibration.length >= 8) {
        const average = (key: 'x' | 'y') =>
          this.calibration.reduce((sum, p) => sum + p[key], 0) /
          this.calibration.length;
        this.scale = clamp(
          settings.mode === 'swat' && palmSize > 0.025
            ? palmSize * 3.5
            : shoulderWidth > 0.08
              ? shoulderWidth
              : palmSize * 3.5,
          0.12,
          0.7,
        );
        this.origin = {
          x: average('x'),
          y: average('y'),
          scale: this.scale,
          offX: sample.offX ?? sample.x,
          offY: sample.offY ?? sample.y,
        };
        this.calibrating = false;
        this.neutralRoll = palmAngle;
        this.calibration = [];
        this.resetMotion();
        this.previous = sample;
        this.ready = true;
        return {
          ...blank,
          calibrated: true,
          progress: 1,
          position: { x: 0, y: 1.1 },
          roll: 0,
          message: 'Racket linked. Move your hand to try it, then feed a ball.',
        };
      }
      return {
        ...blank,
        message: `Hand found. Hold still… ${Math.round(blank.progress * 100)}%`,
      };
    }
    blank.calibrated = true;
    blank.progress = 1;
    const previous = this.previous;
    this.previous = sample;
    if (
      !previous ||
      frame.time <= previous.time ||
      frame.time - previous.time > 250
    ) {
      this.ready = false;
      this.activeStroke = null;
      this.quietSince = null;
      this.smoothed = { x: 0, y: 0 };
      this.handTracker.reset();
      this.palmRoll = null;
      return { ...blank, message: 'Settle your hand, then swing.' };
    }
    const dt = (frame.time - previous.time) / 1000;
    const dx = (sample.x - previous.x) / this.scale / dt;
    const dy = (sample.y - previous.y) / this.scale / dt;
    if (Math.hypot(dx, dy) > 18)
      return fail('Tracking jumped. Settle your hand to reset.');
    const alpha = 1 - Math.exp(-dt / (0.012 + settings.smoothing * 0.085));
    this.smoothed.x += (dx - this.smoothed.x) * alpha;
    this.smoothed.y += (dy - this.smoothed.y) * alpha;
    let speed = Math.hypot(this.smoothed.x, this.smoothed.y);
    let wristRate: number | null = null;
    let turnSpeed = 0;
    let roll: number | undefined;
    if (hand && palmAngle !== null) {
      const anchoredPose = [...pose];
      anchoredPose[wi] = { ...hand.points[0], visibility: 1 };
      const observation = this.handTracker.update(
        anchoredPose,
        validHands,
        settings.hand,
        frame.time,
        frame.width,
        frame.height,
      );
      if (observation?.spinVector) {
        const vector = observation.spinVector;
        wristRate = vector.x * 10;
        turnSpeed = Math.hypot(vector.x, vector.y, vector.z) * 2;
      }
      const angle = palmAngle;
      this.neutralRoll ??= angle;
      roll = clamp(
        Math.atan2(
          Math.sin(angle - this.neutralRoll),
          Math.cos(angle - this.neutralRoll),
        ),
        -0.9,
        0.9,
      );
      if (this.palmRoll && frame.time - this.palmRoll.time <= 250) {
        const delta = Math.atan2(
          Math.sin(angle - this.palmRoll.angle),
          Math.cos(angle - this.palmRoll.angle),
        );
        if (Math.abs(delta) / dt <= Math.PI * 10) {
          wristRate ??=
            clamp(delta / dt / (Math.PI * 2), -4, 4) * 8 * (right ? 1 : -1);
          turnSpeed = Math.max(turnSpeed, Math.abs(delta) / dt / Math.PI);
        }
      }
      this.palmRoll = { angle, time: frame.time };
    } else {
      this.handTracker.reset();
      this.palmRoll = null;
    }
    if (settings.mode === 'swat') speed = Math.max(speed, turnSpeed);
    blank.speed = speed;
    blank.spin =
      !settings.wristSpin || wristRate === null
        ? null
        : clamp(wristRate * settings.spinGain, -45, 45);
    const quietThreshold = 0.65 / settings.sensitivity;
    if (speed < quietThreshold) {
      this.quietSince ??= frame.time;
      if (
        frame.time - this.quietSince > 160 &&
        frame.time - this.lastSwing > 500
      )
        this.ready = true;
    } else this.quietSince = null;
    const position =
      settings.mode === 'dual' && sample.offX !== null && sample.offY !== null
        ? {
            x: clamp(
              ((sample.offX - this.origin.offX) / this.scale) * 5,
              -4.5,
              4.5,
            ),
            y: clamp(
              1.2 + ((sample.offY - this.origin.offY) / this.scale) * 3,
              0.25,
              3.2,
            ),
          }
        : {
            x: clamp(((sample.x - this.origin.x) / this.scale) * 4, -4.5, 4.5),
            y: clamp(
              1.1 + ((sample.y - this.origin.y) / this.scale) * 2.5,
              0.25,
              3.2,
            ),
          };
    let toss = false;
    if (sample.offY !== null && previous.offY !== null) {
      const offSpeed = (sample.offY - previous.offY) / this.scale / dt;
      if (sample.offY < this.origin.offY + this.scale * 0.15)
        this.offLow = true;
      if (
        settings.drill === 'serve' &&
        this.offLow &&
        offSpeed > 1.3 / settings.sensitivity &&
        sample.offY > this.origin.offY + this.scale * 0.3 &&
        frame.time - this.lastToss > 1400
      ) {
        toss = true;
        this.lastToss = frame.time;
        this.offLow = false;
      }
    }
    const armSpeed =
      Math.hypot(
        sample.elbowX - previous.elbowX,
        sample.elbowY - previous.elbowY,
      ) /
      this.scale /
      dt;
    const threshold =
      (settings.mode === 'arm' ? 1.9 : 1.15) / settings.sensitivity;
    const armMoved =
      settings.mode !== 'arm' || armSpeed > 0.3 / settings.sensitivity;
    let swing: Swing | undefined;
    if (
      this.ready &&
      speed > threshold &&
      armMoved &&
      frame.time - this.lastSwing > 600
    ) {
      this.ready = false;
      this.lastSwing = frame.time;
      this.quietSince = null;
      const side = (previous.x - this.origin.x) * (right ? 1 : -1);
      const lateral =
        Math.abs(this.smoothed.x) > 0.1
          ? this.smoothed.x
          : -Math.sin(roll ?? 0) * turnSpeed;
      const forehand =
        Math.abs(side) > this.scale * 0.15
          ? side > 0
          : lateral * (right ? 1 : -1) < 0;
      swing = {
        stroke:
          settings.drill === 'serve'
            ? 'serve'
            : forehand
              ? 'forehand'
              : 'backhand',
        power: clamp(
          settings.power * 0.6 + speed * 0.13 * settings.sensitivity,
          0.15,
          1,
        ),
        aim: settings.aim,
        spin: clamp(
          settings.spin +
            this.smoothed.y * 5 * settings.spinGain +
            (blank.spin ?? 0),
          -60,
          60,
        ),
        sidespin: settings.wristSpin
          ? clamp((wristRate ?? 0) * 0.15, -12, 12)
          : 0,
        lift: settings.lift,
      };
      this.activeStroke = {
        id: frame.time,
        shot: swing,
        lastMoving: frame.time,
      };
    }
    if (this.activeStroke) {
      if (speed > threshold * 0.35) this.activeStroke.lastMoving = frame.time;
      if (
        frame.time - this.activeStroke.lastMoving > 100 ||
        frame.time - this.activeStroke.id > 1400
      )
        this.activeStroke = null;
    }
    return {
      ...blank,
      position,
      roll,
      swing,
      activeSwing: this.activeStroke
        ? { id: this.activeStroke.id, shot: { ...this.activeStroke.shot } }
        : undefined,
      toss,
      message: this.activeStroke
        ? `${this.activeStroke.shot.stroke === 'backhand' ? 'Backhand' : this.activeStroke.shot.stroke === 'serve' ? 'Serve' : 'Forehand'} swinging`
        : this.ready
          ? 'Ready to swing.'
          : 'Relax your hand to prepare the next swing.',
    };
  }
}

// Pinching grabs the paused view; separating two pinched hands zooms in.
export class InspectionMotion {
  private previous: {
    count: number;
    x: number;
    y: number;
    spread: number;
    time: number;
  } | null = null;
  reset() {
    this.previous = null;
  }
  update(frame: MotionFrame) {
    const pinched = frame.hands.filter((hand) => {
      const p = hand.points;
      if (p.length !== 21 || ![p[0], p[4], p[8], p[9]].every(visible))
        return false;
      const aspect = frame.width / frame.height;
      const distance = (a: Landmark, b: Landmark) =>
        Math.hypot((a.x - b.x) * aspect, a.y - b.y);
      const size = distance(p[0], p[9]);
      return size > 0.025 && distance(p[4], p[8]) / size < 0.45;
    });
    if (!pinched.length) {
      this.reset();
      return null;
    }
    const x =
      pinched.reduce((sum, h) => sum + 1 - h.points[0].x, 0) / pinched.length;
    const y =
      pinched.reduce((sum, h) => sum + 1 - h.points[0].y, 0) / pinched.length;
    const spread =
      pinched.length === 2
        ? Math.hypot(
            ((pinched[0].points[0].x - pinched[1].points[0].x) * frame.width) /
              frame.height,
            pinched[0].points[0].y - pinched[1].points[0].y,
          )
        : 0;
    const previous = this.previous;
    this.previous = { count: pinched.length, x, y, spread, time: frame.time };
    if (
      !previous ||
      previous.count !== pinched.length ||
      frame.time <= previous.time ||
      frame.time - previous.time > 250
    )
      return null;
    const dx = x - previous.x,
      dy = y - previous.y;
    if (Math.hypot(dx, dy) > 0.08) {
      this.reset();
      return null;
    }
    return {
      panX: clamp(dx, -0.025, 0.025),
      panY: clamp(dy, -0.025, 0.025),
      zoom:
        spread > 0.08 && previous.spread > 0.08
          ? clamp(previous.spread / spread, 0.92, 1.08)
          : 1,
    };
  }
}
