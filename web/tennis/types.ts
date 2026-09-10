export type Hand = 'right' | 'left';
export type MotionMode = 'swat' | 'arm' | 'dual';
export type Drill = 'rally' | 'forehand' | 'backhand' | 'serve';
export type Stroke = 'forehand' | 'backhand' | 'serve';
export type View = 'player' | 'broadcast' | 'overhead';
export type Vec3 = { x: number; y: number; z: number };
export type TennisSettings = {
  mode: MotionMode;
  hand: Hand;
  drill: Drill;
  sensitivity: number;
  smoothing: number;
  wristSpin: boolean;
  handNavigation: boolean;
  spinGain: number;
  spin: number;
  power: number;
  aim: number;
  lift: number;
  assist: number;
  assistPlacement: boolean;
  gripAngle: number;
  autoFeed: boolean;
  feedInterval: number;
  pace: number;
  sound: boolean;
  volume: number;
  trail: boolean;
  quality: 'high' | 'performance';
  view: View;
};
export const DEFAULT_SETTINGS: TennisSettings = {
  mode: 'swat',
  hand: 'right',
  drill: 'rally',
  sensitivity: 1.2,
  smoothing: 0.45,
  wristSpin: true,
  handNavigation: true,
  spinGain: 1,
  spin: 12,
  power: 0.55,
  aim: 0,
  lift: 0.5,
  assist: 0.8,
  assistPlacement: true,
  gripAngle: 0.45,
  autoFeed: false,
  feedInterval: 2.5,
  pace: 1,
  sound: true,
  volume: 0.65,
  trail: true,
  quality: 'high',
  view: 'player',
};
export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
export type Swing = {
  stroke: Stroke;
  power: number;
  aim: number;
  spin: number;
  sidespin: number;
  lift: number;
};
export type RacketMotion = {
  position?: { x: number; y: number };
  roll?: number;
  activeSwing?: { id: number; shot: Swing };
};
export type ShotRecord = {
  id: number;
  stroke: Stroke;
  speed: number;
  spin: number;
  result: string;
  x?: number;
  z?: number;
};
export type TennisStatus = {
  phase: 'ready' | 'incoming' | 'toss' | 'outgoing' | 'result';
  message: string;
  hits: number;
  inside: number;
  streak: number;
  speed: number;
  spin: number;
  stroke: Stroke | null;
  liveSpeed: number;
  liveSpin: number;
  contact: number;
  paused: boolean;
  shots: ShotRecord[];
};
export const INITIAL_STATUS: TennisStatus = {
  phase: 'ready',
  message: 'Your court. Your pace.',
  hits: 0,
  inside: 0,
  streak: 0,
  speed: 0,
  spin: 0,
  stroke: null,
  contact: 0,
  paused: false,
  shots: [],
  liveSpeed: 0,
  liveSpin: 0,
};
export interface TennisController {
  unlockAudio(): void;
  configure(settings: TennisSettings): void;
  feed(): void;
  swing(stroke?: Stroke, gesture?: Swing): void;
  position(x: number, y: number): void;
  motion(input: RacketMotion): void;
  pause(): void;
  focusBall(): void;
  advance(): void;
  inspect(panX: number, panY: number, zoom: number): void;
  reset(): void;
  dispose(): void;
}
