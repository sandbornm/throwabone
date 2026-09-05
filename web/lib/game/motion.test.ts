import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SwingTracker,
  CameraThrowTracker,
  assessCameraSetup,
  type Landmark,
} from './motion';
import { DEFAULT_SHOT } from './types';
function pose(y = 0.83) {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  p[11] = { x: 0.35, y: 0.32, visibility: 1 };
  p[12] = { x: 0.65, y: 0.32, visibility: 1 };
  p[23] = { x: 0.4, y: 0.73, visibility: 1 };
  p[24] = { x: 0.6, y: 0.73, visibility: 1 };
  p[14] = { x: 0.64, y: 0.56, visibility: 1 };
  p[13] = { x: 0.36, y: 0.56, visibility: 1 };
  p[16] = { x: 0.65, y, visibility: 1 };
  p[15] = { x: 0.35, y, visibility: 1 };
  return p;
}
test('camera setup requires shoulders, hips, throwing hand and sufficient room', () => {
  assert.equal(assessCameraSetup(pose(), 'right').ready, true);
  const p = pose();
  p[24].y = 0.99;
  assert.equal(assessCameraSetup(p, 'right').ready, false);
  assert.match(assessCameraSetup(p, 'right').message, /Step back/);
  const q = pose();
  q[16].visibility = 0.1;
  assert.equal(assessCameraSetup(q, 'right').ready, false);
});
test('an armed underhand swing releases exactly once and preserves selected spin', () => {
  const t = new SwingTracker();
  t.arm();
  t.update(pose(), 100, 'right', DEFAULT_SHOT);
  t.update(pose(), 550, 'right', DEFAULT_SHOT);
  t.update(pose(0.73), 650, 'right', DEFAULT_SHOT);
  const r = t.update(pose(0.51), 750, 'right', DEFAULT_SHOT);
  assert.ok(r.shot);
  assert.equal(r.shot.spin, DEFAULT_SHOT.spin);
  assert.equal(r.shot.loft, DEFAULT_SHOT.loft);
  assert.ok(r.shot.power >= 0.2 && r.shot.power <= 1);
  assert.equal(t.update(pose(0.4), 850, 'right', DEFAULT_SHOT).shot, undefined);
});
test('unarmed motion, overhand starts and lost tracking cannot release a throw', () => {
  const t = new SwingTracker();
  assert.equal(t.update(pose(0.3), 100, 'right', DEFAULT_SHOT).shot, undefined);
  t.arm();
  for (let i = 1; i < 6; i++)
    assert.equal(
      t.update(pose(0.2), i * 100, 'right', DEFAULT_SHOT).shot,
      undefined,
    );
  t.update(pose(), 800, 'right', DEFAULT_SHOT);
  t.update(pose(), 1300, 'right', DEFAULT_SHOT);
  const lost = pose(0.6);
  lost[16].visibility = 0;
  t.update(lost, 1400, 'right', DEFAULT_SHOT);
  assert.equal(
    t.update(pose(0.3), 1500, 'right', DEFAULT_SHOT).shot,
    undefined,
  );
});

function raisedPose(hand: 'left' | 'right') {
  const points = pose();
  points[hand === 'right' ? 16 : 15].y = 0.2;
  points[hand === 'right' ? 14 : 13].y = 0.35;
  return points;
}
function holdToArm(
  t: CameraThrowTracker,
  start: number,
  hand: 'left' | 'right',
) {
  let result;
  for (let elapsed = 0; elapsed <= 1000; elapsed += 100)
    result = t.update(
      raisedPose(hand),
      start + elapsed,
      hand,
      DEFAULT_SHOT,
      true,
    );
  return result!;
}
test('either throwing hand can arm, lower and release without clicking', () => {
  for (const hand of ['left', 'right'] as const) {
    const t = new CameraThrowTracker();
    const armed = holdToArm(t, 100, hand);
    assert.equal(armed.armProgress, 1);
    assert.equal(t.armed, true);
    assert.equal(armed.shot, undefined);
    t.update(pose(), 1200, hand, DEFAULT_SHOT, true);
    t.update(pose(), 1400, hand, DEFAULT_SHOT, true);
    t.update(pose(), 1650, hand, DEFAULT_SHOT, true);
    t.update(pose(0.73), 1750, hand, DEFAULT_SHOT, true);
    const release = t.update(pose(0.51), 1850, hand, DEFAULT_SHOT, true);
    assert.ok(release.shot);
    assert.equal(release.shot.spin, DEFAULT_SHOT.spin);
    assert.equal(t.armed, false);
    // A high follow-through must not become the next arming gesture.
    holdToArm(t, 1950, hand);
    assert.equal(t.armed, false);
    t.update(pose(), 3050, hand, DEFAULT_SHOT, true);
    holdToArm(t, 3150, hand);
    assert.equal(t.armed, true);
  }
});
test('a wave, the other hand and discontinuous camera frames do not arm', () => {
  const t = new CameraThrowTracker();
  t.update(raisedPose('right'), 100, 'right', DEFAULT_SHOT, true);
  assert.ok(
    t.update(raisedPose('right'), 300, 'right', DEFAULT_SHOT, true)
      .armProgress > 0,
  );
  t.update(pose(), 400, 'right', DEFAULT_SHOT, true);
  assert.equal(t.armed, false);
  for (let time = 500; time <= 1700; time += 100)
    t.update(raisedPose('left'), time, 'right', DEFAULT_SHOT, true);
  assert.equal(t.armed, false);
  t.update(raisedPose('right'), 1800, 'right', DEFAULT_SHOT, true);
  const resumed = t.update(
    raisedPose('right'),
    3000,
    'right',
    DEFAULT_SHOT,
    true,
  );
  assert.equal(resumed.armProgress, 0);
  assert.equal(t.armed, false);
});
test('framing loss and a busy court cancel arming and any prepared swing', () => {
  const t = new CameraThrowTracker();
  t.update(raisedPose('right'), 100, 'right', DEFAULT_SHOT, true);
  t.update(raisedPose('right'), 400, 'right', DEFAULT_SHOT, true);
  t.update([], 500, 'right', DEFAULT_SHOT, true);
  holdToArm(t, 600, 'right');
  assert.equal(t.armed, false);
  t.update(pose(), 1700, 'right', DEFAULT_SHOT, true);
  holdToArm(t, 1800, 'right');
  assert.equal(t.armed, true);
  t.update(pose(), 2900, 'right', DEFAULT_SHOT, true);
  t.update(pose(), 3150, 'right', DEFAULT_SHOT, true);
  t.update(pose(), 3400, 'right', DEFAULT_SHOT, true);
  t.update(pose(0.73), 3500, 'right', DEFAULT_SHOT, false);
  assert.equal(t.armed, false);
  assert.equal(
    t.update(pose(0.51), 3600, 'right', DEFAULT_SHOT, true).shot,
    undefined,
  );
  for (let time = 3700; time < 5000; time += 100)
    t.update(raisedPose('right'), time, 'right', DEFAULT_SHOT, false);
  assert.equal(t.armed, false);
});
test('manual cancellation requires lowering before a fresh arming gesture', () => {
  const t = new CameraThrowTracker();
  holdToArm(t, 100, 'right');
  t.cancel();
  holdToArm(t, 1200, 'right');
  assert.equal(t.armed, false);
  t.update(pose(), 2300, 'right', DEFAULT_SHOT, true);
  holdToArm(t, 2400, 'right');
  assert.equal(t.armed, true);
});

test('camera aim follows mirrored hand movement for both hands and does not accumulate preview feedback', () => {
  for (const hand of ['left', 'right'] as const)
    for (const direction of [-1, 1]) {
      const t = new SwingTracker();
      const base = { ...DEFAULT_SHOT, aim: 0 };
      const wrist = hand === 'right' ? 16 : 15;
      const moved = (y = 0.83) => {
        const p = pose(y);
        p[wrist].x -= direction * 0.09;
        return p;
      };
      t.arm();
      t.update(pose(), 100, hand, base);
      t.update(pose(), 550, hand, base);
      let preview = t.update(moved(), 650, hand, base).preview!;
      assert.ok(preview.aim * direction > 0.6);
      for (const time of [750, 850])
        preview = t.update(moved(), time, hand, preview).preview!;
      assert.ok(
        Math.abs(preview.aim) < 1.05,
        'Preview must not add its own offset each frame',
      );
      t.update(moved(0.73), 950, hand, preview);
      const released = t.update(moved(0.51), 1050, hand, preview).shot!;
      assert.ok(released);
      assert.ok(released.aim * direction > 0.9);
      assert.ok(Math.abs(released.aim - preview.aim) < 0.05);
    }
});
test('moving the whole body sideways does not steer a stationary throwing arm', () => {
  const t = new SwingTracker();
  const base = { ...DEFAULT_SHOT, aim: 0 };
  t.arm();
  t.update(pose(), 100, 'right', base);
  t.update(pose(), 550, 'right', base);
  const moved = pose().map((p) => ({ ...p, x: p.x + 0.08 }));
  assert.ok(
    Math.abs(t.update(moved, 650, 'right', base).preview!.aim) < 0.00001,
  );
});
