import { Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, type Point3, type ShotSettings } from './types';
import type { Landmark } from './motion';

export type TrackedHand = { points: Landmark[]; world: Point3[] };
export type HandObservation = {
  points: Landmark[];
  openFingers: number;
  palmTurn: number | null;
  spinVector: Point3 | null;
};
export function visibleHandLandmarks(hands: TrackedHand[]): Landmark[][] {
  return hands
    .filter(
      (h) =>
        Array.isArray(h.points) &&
        h.points.length === 21 &&
        h.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    )
    .map((h) => h.points);
}
const subtract = (a: Point3, b: Point3) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (p: Point3) => Math.hypot(p.x, p.y, p.z);
function normal(points: Point3[]) {
  const a = subtract(points[5], points[0]),
    b = subtract(points[17], points[0]);
  const n = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
  const size = length(n);
  return size < 0.00001
    ? null
    : { x: n.x / size, y: n.y / size, z: n.z / size };
}
export class HandMotionTracker {
  private previous: {
    normal: Point3;
    rotation: Quaternion;
    time: number;
  } | null = null;
  private rates: number[] = [];
  private spins: Point3[] = [];
  private hand: 'left' | 'right' | null = null;
  reset() {
    this.previous = null;
    this.rates = [];
    this.spins = [];
    this.hand = null;
  }
  update(
    pose: Landmark[],
    hands: TrackedHand[],
    hand: 'left' | 'right',
    time: number,
    width: number,
    height: number,
  ): HandObservation | null {
    if (this.hand !== hand) this.reset();
    this.hand = hand;
    const wrist = pose[hand === 'right' ? 16 : 15];
    if (
      !wrist ||
      (wrist.visibility ?? 0) < 0.65 ||
      !Number.isFinite(wrist.x) ||
      !Number.isFinite(wrist.y) ||
      width <= 0 ||
      height <= 0
    ) {
      this.reset();
      return null;
    }
    const distance = (a: Landmark, b: Landmark) =>
      Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
    const candidates = hands
      .filter(
        (h) =>
          Array.isArray(h.points) &&
          Array.isArray(h.world) &&
          h.points.length === 21 &&
          h.world.length === 21 &&
          h.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
          h.world.every(
            (p) =>
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              Number.isFinite(p.z),
          ),
      )
      .map((h) => ({ ...h, distance: distance(h.points[0], wrist) }))
      .sort((a, b) => a.distance - b.distance);
    const selected = candidates[0];
    // Match the pose wrist, so mirroring and handedness labels cannot swap arms.
    if (
      !selected ||
      selected.distance > Math.min(width, height) * 0.12 ||
      (candidates[1] && candidates[1].distance - selected.distance < 8) ||
      distance(selected.points[0], selected.points[9]) < 16
    ) {
      this.reset();
      return null;
    }
    const n = normal(selected.world);
    if (!n) {
      this.reset();
      return null;
    }
    const forward = new Vector3().copy(
      subtract(selected.world[9], selected.world[0]),
    );
    const normalVector = new Vector3().copy(n);
    if (forward.lengthSq() < 0.00001) {
      this.reset();
      return null;
    }
    forward.normalize();
    const across = new Vector3().crossVectors(forward, normalVector);
    if (across.lengthSq() < 0.00001) {
      this.reset();
      return null;
    }
    across.normalize();
    forward.crossVectors(normalVector, across).normalize();
    const rotation = new Quaternion()
      .setFromRotationMatrix(
        new Matrix4().makeBasis(across, forward, normalVector),
      )
      .normalize();
    let openFingers = 0;
    for (const mcp of [5, 9, 13, 17]) {
      const p = selected.world;
      const a = subtract(p[mcp], p[mcp + 1]),
        b = subtract(p[mcp + 2], p[mcp + 1]);
      const size = length(a) * length(b);
      if (
        size > 0.000001 &&
        dot(a, b) / size < -0.82 &&
        length(subtract(p[mcp + 3], p[0])) >
          length(subtract(p[mcp + 1], p[0])) * 1.1
      )
        openFingers++;
    }
    const previous = this.previous;
    this.previous = { normal: n, rotation, time };
    if (previous && time > previous.time && time - previous.time <= 250) {
      const rate =
        (Math.acos(clamp(dot(n, previous.normal), -1, 1)) * 180) /
        Math.PI /
        ((time - previous.time) / 1000);
      const delta = rotation
        .clone()
        .multiply(previous.rotation.clone().invert());
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const sinHalf = Math.hypot(delta.x, delta.y, delta.z);
      const angle = 2 * Math.atan2(sinHalf, clamp(delta.w, 0, 1));
      const dt = (time - previous.time) / 1000;
      if (angle / dt <= Math.PI * 10) {
        this.rates = [...this.rates, rate].slice(-3);
        const scale =
          sinHalf > 0.000001 ? angle / (sinHalf * dt * Math.PI * 2) : 0;
        // Mirror horizontal motion and convert image-down to game-up.
        this.spins = [
          ...this.spins,
          { x: -delta.x * scale, y: -delta.y * scale, z: delta.z * scale },
        ].slice(-3);
      } else {
        this.rates = [];
        this.spins = [];
      }
    } else {
      this.rates = [];
      this.spins = [];
    }
    const sorted = [...this.rates].sort((a, b) => a - b);
    const median = (axis: keyof Point3) =>
      this.spins.map((p) => p[axis]).sort((a, b) => a - b)[1];
    let spinVector: Point3 | null =
      this.spins.length === 3
        ? { x: median('x'), y: median('y'), z: median('z') }
        : null;
    if (spinVector && length(spinVector) < 0.1)
      spinVector = { x: 0, y: 0, z: 0 };
    return {
      points: selected.points,
      openFingers,
      palmTurn: sorted.length === 3 ? sorted[1] : null,
      spinVector,
    };
  }
}

export function applyHandSpin(
  shot: ShotSettings,
  observation: HandObservation | null,
  enabled: boolean,
): ShotSettings {
  const vector = enabled ? observation?.spinVector : null;
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite))
    return { ...shot, spinVector: undefined, spinSource: 'setting' };
  const speed = length(vector);
  const scale = speed > 5 ? 5 / speed : 1;
  return {
    ...shot,
    spin: Math.min(5, speed),
    spinSource: 'hand',
    spinVector: {
      x: vector.x * scale,
      y: vector.y * scale,
      z: vector.z * scale,
    },
  };
}
