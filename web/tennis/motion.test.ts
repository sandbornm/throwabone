import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  elbowAngle,
  InspectionMotion,
  TennisMotion,
  type MotionFrame,
  type TennisHand,
} from './motion';
import { DEFAULT_SETTINGS, type Hand, type TennisSettings } from './types';
import type { Landmark } from '../lib/game/motion';

function frame(
  time: number,
  hand: Hand = 'right',
  dx = 0,
  dy = 0,
  elbow = 0,
): MotionFrame {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.6,
    z: 0,
    visibility: 1,
  }));
  points[11] = { x: 0.62, y: 0.35, visibility: 1 };
  points[12] = { x: 0.38, y: 0.35, visibility: 1 };
  points[13] = { x: 0.68, y: 0.5, visibility: 1 };
  points[14] = { x: 0.32, y: 0.5, visibility: 1 };
  points[15] = { x: 0.7, y: 0.6, visibility: 1 };
  points[16] = { x: 0.3, y: 0.6, visibility: 1 };
  points[hand === 'right' ? 16 : 15].x += dx;
  points[hand === 'right' ? 16 : 15].y += dy;
  points[hand === 'right' ? 14 : 13].x += elbow;
  return { points, hands: [], time, width: 960, height: 720 };
}
function prepared(settings: TennisSettings = DEFAULT_SETTINGS) {
  const tracker = new TennisMotion();
  for (let t = 0; t <= 1500; t += 50)
    tracker.update(frame(t, settings.hand), settings);
  return tracker;
}
void test('still calibration completes and a relaxed hand does not swing', () => {
  const tracker = prepared();
  for (let t = 1550; t < 3000; t += 50) {
    const result = tracker.update(frame(t), DEFAULT_SETTINGS);
    assert.equal(result.calibrated, true);
    assert.equal(result.swing, undefined);
  }
});
void test('forehand and backhand work for right and left hands, with one release per swing', () => {
  for (const hand of ['right', 'left'] as const)
    for (const stroke of ['forehand', 'backhand'] as const) {
      const settings = { ...DEFAULT_SETTINGS, hand };
      const tracker = prepared(settings);
      const swings = [];
      const direction =
        (hand === 'right' ? 1 : -1) * (stroke === 'forehand' ? 1 : -1);
      for (let i = 1; i <= 7; i++) {
        const result = tracker.update(
          frame(1500 + i * 50, hand, direction * i * 0.035),
          settings,
        );
        if (result.swing) swings.push(result.swing);
      }
      assert.equal(swings.length, 1, `${hand} ${stroke}`);
      assert.equal(swings[0].stroke, stroke);
    }
});
void test('lost tracking and long frame gaps cannot create a release on reacquisition', () => {
  const tracker = prepared();
  tracker.update({ ...frame(1550), points: [] }, DEFAULT_SETTINGS);
  const jumped = tracker.update(frame(1600, 'right', 0.2), DEFAULT_SETTINGS);
  assert.equal(jumped.swing, undefined);
  const gap = tracker.update(frame(2500, 'right', -0.2), DEFAULT_SETTINGS);
  assert.equal(gap.swing, undefined);
});
void test('pause suppresses gestures and requires a quiet hand after resume', () => {
  const tracker = prepared();
  assert.equal(
    tracker.update(frame(1550, 'right', 0.2), DEFAULT_SETTINGS, true).swing,
    undefined,
  );
  assert.equal(
    tracker.update(frame(1600, 'right', -0.1), DEFAULT_SETTINGS).swing,
    undefined,
  );
});
void test('full-arm mode requires the elbow to move and all arm joints to be visible', () => {
  const settings = { ...DEFAULT_SETTINGS, mode: 'arm' as const };
  const tracker = prepared(settings);
  for (let i = 1; i < 5; i++)
    assert.equal(
      tracker.update(frame(1500 + i * 50, 'right', i * 0.04), settings).swing,
      undefined,
    );
  const obscured = frame(1800);
  obscured.points[14].visibility = 0.1;
  assert.match(tracker.update(obscured, settings).message, /shoulder, elbow/);
  const moving = prepared(settings);
  let count = 0;
  for (let i = 1; i < 5; i++)
    if (
      moving.update(
        frame(1500 + i * 50, 'right', i * 0.04, 0, i * 0.015),
        settings,
      ).swing
    )
      count++;
  assert.equal(count, 1);
});
void test('two-hand mode refuses a missing off hand and maps off-hand position', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    mode: 'dual' as const,
    assistPlacement: false,
  };
  const tracker = prepared(settings);
  const f = frame(1550);
  f.points[15].x -= 0.05;
  const result = tracker.update(f, settings);
  assert.ok(result.position && result.position.x > 0.5);
  f.time = 1600;
  f.points[15].visibility = 0;
  assert.match(tracker.update(f, settings).message, /both hands/);
  assert.equal(tracker.update(f, settings).swing, undefined);
});
void test('an upward brush adds topspin equally for either playing hand', () => {
  for (const hand of ['right', 'left'] as const) {
    const settings = { ...DEFAULT_SETTINGS, hand, wristSpin: false, spin: 0 };
    const tracker = prepared(settings);
    let spin = 0;
    for (let i = 1; i < 5; i++) {
      const result = tracker.update(
        frame(1500 + i * 50, hand, 0, -i * 0.04),
        settings,
      );
      if (result.swing) spin = result.swing.spin;
    }
    assert.ok(spin > 0);
  }
});
void test('off-hand toss fires once and waits for the hand to lower', () => {
  const settings = { ...DEFAULT_SETTINGS, drill: 'serve' as const };
  const tracker = prepared(settings);
  let count = 0;
  for (let i = 1; i < 10; i++) {
    const f = frame(1500 + i * 50);
    f.points[15].y -= i * 0.03;
    if (tracker.update(f, settings).toss) count++;
  }
  assert.equal(count, 1);
});
void test('elbow angles account for video aspect ratio', () => {
  assert.equal(
    elbowAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, 4 / 3),
    90,
  );
  assert.equal(
    elbowAngle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, 4 / 3),
    180,
  );
});
function pinchedHand(x: number): TennisHand {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
  points[9] = { x, y: 0.4, z: 0 };
  points[4] = { x, y: 0.36, z: 0 };
  points[8] = { x: x + 0.005, y: 0.36, z: 0 };
  return { points, world: points, label: 'Right' };
}
void test('hand-only framing can calibrate and swing without shoulder landmarks', () => {
  const tracker = new TennisMotion();
  let calibrated = false,
    swung = false;
  for (let i = 0; i < 38; i++) {
    const result = tracker.update(
      {
        ...frame(i * 50),
        points: [],
        hands: [pinchedHand(0.3 + Math.max(0, i - 31) * 0.045)],
      },
      DEFAULT_SETTINGS,
    );
    calibrated ||= result.calibrated;
    swung ||= Boolean(result.swing);
  }
  assert.equal(calibrated, true);
  assert.equal(swung, true);
});
void test('paused hand navigation pans, pinches to zoom, and resets across tracking gaps', () => {
  const tracker = new InspectionMotion();
  assert.equal(
    tracker.update({
      ...frame(0),
      hands: [pinchedHand(0.3), pinchedHand(0.7)],
    }),
    null,
  );
  const zoom = tracker.update({
    ...frame(50),
    hands: [pinchedHand(0.28), pinchedHand(0.72)],
  });
  assert.ok(zoom && zoom.zoom < 1);
  tracker.reset();
  tracker.update({ ...frame(100), hands: [pinchedHand(0.3)] });
  const pan = tracker.update({ ...frame(150), hands: [pinchedHand(0.31)] });
  assert.ok(pan && pan.panX < 0 && pan.zoom === 1);
  assert.equal(
    tracker.update({ ...frame(500), hands: [pinchedHand(0.33)] }),
    null,
  );
});

void test('a single hand calibrates even when its handedness label disagrees with the setting', () => {
  const tracker = new TennisMotion();
  const settings = { ...DEFAULT_SETTINGS, hand: 'left' as const };
  let calibrated = false;
  for (let i = 0; i < 32; i++) {
    const result = tracker.update(
      { ...frame(i * 50), points: [], hands: [pinchedHand(0.3)] },
      settings,
    );
    calibrated ||= result.calibrated;
    assert.equal(result.elbow, null);
  }
  assert.equal(calibrated, true);
});
