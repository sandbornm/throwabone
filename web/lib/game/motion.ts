import { clamp, type ShotSettings } from './types';
export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export class SwingTracker {
  armed = false;
  private lowSince = 0;
  private neutralX = 0;
  private baseShot: ShotSettings | null = null;
  private aim = 0;
  private previous: { y: number; t: number } | null = null;
  private peak = 0;
  private primed = false;
  arm() {
    this.armed = true;
    this.lowSince = 0;
    this.previous = null;
    this.peak = 0;
    this.primed = false;
    this.baseShot = null;
  }
  cancel() {
    this.armed = false;
    this.previous = null;
    this.primed = false;
    this.lowSince = 0;
    this.peak = 0;
    this.baseShot = null;
  }
  update(
    points: Landmark[],
    time: number,
    hand: 'left' | 'right',
    base: ShotSettings,
  ): {
    message: string;
    shot?: ShotSettings;
    preview?: ShotSettings;
    power?: number;
  } {
    const [s, e, w, h] = hand === 'right' ? [12, 14, 16, 24] : [11, 13, 15, 23];
    if (
      ![s, e, w, h, 11, 12].every(
        (i) =>
          points[i] &&
          Number.isFinite(points[i].x) &&
          Number.isFinite(points[i].y) &&
          (points[i].visibility ?? 0) > 0.65,
      )
    ) {
      this.lowSince = 0;
      this.primed = false;
      this.previous = null;
      this.peak = 0;
      return { message: 'Keep your shoulder, elbow, wrist and hip in view.' };
    }
    const wrist = points[w],
      hip = points[h],
      shoulder = points[s],
      torso = Math.abs(hip.y - shoulder.y),
      width = Math.hypot(
        points[11].x - points[12].x,
        points[11].y - points[12].y,
      );
    if (torso < 0.08 || width < 0.05) {
      this.lowSince = 0;
      this.primed = false;
      this.previous = null;
      return {
        message: 'Face the camera with your upper body and hips visible.',
      };
    }
    if (!this.armed)
      return { message: 'Ready. Arm one throw when you want to swing.' };
    this.baseShot ??= { ...base };
    const anchored = this.baseShot;
    const wristX = (wrist.x - (points[11].x + points[12].x) / 2) / width;
    if (!this.primed) {
      if (wrist.y > hip.y - 0.02) {
        if (!this.lowSince) {
          this.lowSince = time;
          this.neutralX = wristX;
          this.aim = anchored.aim;
        }
        if (time - this.lowSince > 400) {
          this.primed = true;
          this.previous = { y: wrist.y, t: time };
          this.peak = 0;
        }
      } else this.lowSince = 0;
      return { message: 'Hold your throwing hand low beside your hip.' };
    }
    const previous = this.previous;
    this.previous = { y: wrist.y, t: time };
    if (!previous || time <= previous.t || time - previous.t > 350) {
      this.primed = false;
      this.lowSince = 0;
      return { message: 'Tracking paused. Lower your hand and try again.' };
    }
    const speed = (previous.y - wrist.y) / ((time - previous.t) / 1000) / torso;
    this.peak = Math.max(this.peak, speed);
    const power = clamp(0.28 + this.peak * 0.12, 0.2, 1);
    const targetAim = clamp(
      anchored.aim - (wristX - this.neutralX) * 3.3,
      -1.65,
      1.65,
    );
    this.aim +=
      (targetAim - this.aim) * (1 - Math.exp(-(time - previous.t) / 80));
    const preview = { ...anchored, aim: this.aim, power };
    if (wrist.y < hip.y - torso * 0.4 && speed > 0.6 && this.peak > 1) {
      this.armed = false;
      this.primed = false;
      return {
        message: 'Released!',
        shot: preview,
      };
    }
    return {
      message: 'Move your hand left or right to aim, then toss underhand.',
      power,
      preview,
    };
  }
}

export class CameraThrowTracker {
  private swing = new SwingTracker();
  private raisedSince: number | null = null;
  private lastFrame: number | null = null;
  private mustLower = false;
  get armed() {
    return this.swing.armed;
  }
  private clearHold() {
    this.raisedSince = null;
    this.lastFrame = null;
  }
  arm() {
    this.clearHold();
    this.swing.arm();
  }
  cancel() {
    this.clearHold();
    this.swing.cancel();
    this.mustLower = true;
  }
  update(
    points: Landmark[],
    time: number,
    hand: 'left' | 'right',
    base: ShotSettings,
    ready: boolean,
  ): {
    message: string;
    armProgress: number;
    shot?: ShotSettings;
    preview?: ShotSettings;
  } {
    const framing = assessCameraSetup(points, hand);
    if (!framing.ready || !ready) {
      this.cancel();
      return {
        message: !framing.ready
          ? framing.message
          : 'Waiting for the bones to settle…',
        armProgress: 0,
      };
    }
    if (this.armed) {
      const result = this.swing.update(points, time, hand, base);
      if (result.shot) this.cancel();
      return { ...result, armProgress: 0 };
    }

    const [s, w, h] = hand === 'right' ? [12, 16, 24] : [11, 15, 23];
    const torso = points[h].y - points[s].y;
    const raised = points[w].y < points[s].y - torso * 0.15;
    if (points[w].y > points[s].y + torso * 0.15) this.mustLower = false;
    if (!raised || this.mustLower) {
      this.clearHold();
      return {
        message: this.mustLower
          ? 'Lower your hand, then raise it to arm your next throw.'
          : 'Raise your throwing hand above your shoulder. Hold for one second.',
        armProgress: 0,
      };
    }
    if (
      this.lastFrame === null ||
      time <= this.lastFrame ||
      time - this.lastFrame > 350
    )
      this.raisedSince = time;
    this.lastFrame = time;
    this.raisedSince ??= time;
    const armProgress = clamp((time - this.raisedSince) / 1000, 0, 1);
    if (armProgress < 1)
      return { message: 'Keep your hand raised…', armProgress };
    this.arm();
    return {
      message: 'Armed. Lower your hand beside your hip, then swing underhand.',
      armProgress: 1,
    };
  }
}

export function assessCameraSetup(points: Landmark[], hand: 'left' | 'right') {
  const visible = (i: number) =>
    !!points[i] &&
    Number.isFinite(points[i].x) &&
    Number.isFinite(points[i].y) &&
    (points[i].visibility ?? 0) > 0.65;
  const inside = (i: number) =>
    visible(i) &&
    points[i].x > 0.04 &&
    points[i].x < 0.96 &&
    points[i].y > 0.04 &&
    points[i].y < 0.95;
  const shoulders = inside(11) && inside(12),
    hips = inside(23) && inside(24),
    wrist = inside(hand === 'right' ? 16 : 15),
    elbow = inside(hand === 'right' ? 14 : 13);
  let room = false,
    centred = false,
    torso = 0;
  if (shoulders && hips) {
    const sx = (points[11].x + points[12].x) / 2,
      sy = (points[11].y + points[12].y) / 2,
      hy = (points[23].y + points[24].y) / 2;
    torso = hy - sy;
    room = torso > 0.13 && torso < 0.47;
    centred = sx > 0.27 && sx < 0.73;
  }
  const ready = shoulders && hips && wrist && elbow && room && centred;
  const message = ready
    ? 'Good framing. Hold your hand low to prepare an underhand swing.'
    : !shoulders || !hips
      ? 'Step back until both shoulders and hips fit in the frame.'
      : !wrist || !elbow
        ? 'Give your throwing arm more room inside the frame.'
        : !centred
          ? 'Move toward the centre of the camera view.'
          : torso >= 0.47
            ? 'Move a little farther from the camera.'
            : 'Move a little closer to the camera.';
  return {
    ready,
    message,
    checks: [
      { label: 'Shoulders', ok: shoulders },
      { label: 'Hips', ok: hips },
      { label: 'Throwing arm', ok: wrist && elbow },
      { label: 'Room to swing', ok: room && centred },
    ],
  };
}
