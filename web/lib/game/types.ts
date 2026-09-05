export type SurfaceId = 'gravel' | 'dirt' | 'grass' | 'indoor';
export type ViewId = 'player' | 'target' | 'side' | 'overhead';
export type Point3 = { x: number; y: number; z: number };
export type ShotSettings = {
  aim: number;
  power: number;
  loft: number;
  spin: number;
  spinVector?: Point3;
  spinSource?: 'hand' | 'setting';
};
export type ThrowRecord = ShotSettings & {
  id: number;
  surface: SurfaceId;
  path: Point3[];
  landing: Point3 | null;
  down: number;
  totalDown: number;
  guards: number;
  speed: number;
  time: number;
  duration: number;
  resetCount?: number;
};
export type RangeStatus = {
  ready: boolean;
  phase: 'loading' | 'aim' | 'flight' | 'settling' | 'resetting' | 'complete';
  throws: number;
  down: number;
  guards: number;
  message: string;
  power: number;
  aim: number;
  history: ThrowRecord[];
  pendingResets: number;
};
export type BoneAsset = {
  source: string;
  units: string;
  up: string;
  dimensions: number[];
  vertices: number[][];
  faces: number[][];
  standingRotation: { x: number; y: number; z: number; w: number };
  standingHeight: number;
  standingWidth: number;
  colliders: { vertices: number[][]; faces: number[][]; volume: number }[];
};
export const DEFAULT_SHOT: ShotSettings = {
  aim: -0.6,
  power: 0.6,
  loft: 18,
  spin: 1.0,
};
export const INITIAL_STATUS: RangeStatus = {
  ready: false,
  phase: 'loading',
  throws: 0,
  down: 0,
  guards: 0,
  message: 'Preparing the court…',
  power: DEFAULT_SHOT.power,
  aim: DEFAULT_SHOT.aim,
  history: [],
  pendingResets: 0,
};
export const THROW_STYLES = [
  {
    id: 'slide',
    name: 'Slide',
    description: 'Low arc · gentle spin',
    loft: 18,
    spin: 1,
  },
  {
    id: 'tumble',
    name: 'Tumble',
    description: 'More turn on contact',
    loft: 22,
    spin: 2.5,
  },
  {
    id: 'lob',
    name: 'Lob',
    description: 'Higher arc · softer arrival',
    loft: 38,
    spin: 1.5,
  },
] as const;
export const SURFACE_INFO = [
  {
    id: 'gravel' as const,
    name: 'Fine gravel',
    note: 'Even ground · balanced slide',
  },
  {
    id: 'dirt' as const,
    name: 'Packed dirt',
    note: 'A little faster, a softer bounce',
  },
  {
    id: 'grass' as const,
    name: 'Short grass',
    note: 'More grip · shorter runout',
  },
  {
    id: 'indoor' as const,
    name: 'Indoor wood',
    note: 'Smooth ground · longer slide',
  },
];
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function dragShot(
  start: ShotSettings,
  dx: number,
  dy: number,
  width: number,
): ShotSettings {
  return {
    ...start,
    aim: clamp(
      start.aim + (dx / Math.max(140, width * 0.34)) * 1.65,
      -1.65,
      1.65,
    ),
    power: clamp(start.power + dy / 190, 0.15, 1),
  };
}
export interface RangeControls {
  dispose(): void;
  setShot(shot: ShotSettings): void;
  throwBone(): void;
  reset(): void;
  setSurface(id: SurfaceId): void;
  setView(id: ViewId): void;
  setFollow(value: boolean): void;
  setSlow(value: boolean): void;
  setSound(value: boolean): void;
  showTrace(record: ThrowRecord | null): void;
}
