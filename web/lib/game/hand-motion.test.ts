import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HandMotionTracker,
  applyHandSpin,
  visibleHandLandmarks,
  type TrackedHand,
} from './hand-motion';
import type { Landmark } from './motion';
import { DEFAULT_SHOT, type Point3 } from './types';

const pose: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
  x: i === 15 ? 0.35 : 0.65,
  y: 0.83,
  visibility: 1,
}));
function hand(x = 0.65, angle = 0, open = true): TrackedHand {
  const world: Point3[] = Array.from({ length: 21 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  for (const [finger, mcp] of [5, 9, 13, 17].entries()) {
    const x = (finger - 1.5) * 0.02;
    world[mcp] = { x, y: 0.04, z: 0 };
    world[mcp + 1] = { x, y: 0.07, z: 0 };
    world[mcp + 2] = { x, y: open ? 0.09 : 0.05, z: open ? 0 : 0.01 };
    world[mcp + 3] = { x, y: open ? 0.11 : 0.03, z: open ? 0 : 0.02 };
  }
  const points = world.map((p) => ({
    x: x + p.x * 2.2,
    y: 0.83 - p.y * 2.2,
    z: p.z,
  }));
  return {
    points,
    world: world.map((p) => ({
      x: p.x,
      y: p.y * Math.cos(angle) - p.z * Math.sin(angle),
      z: p.y * Math.sin(angle) + p.z * Math.cos(angle),
    })),
  };
}
test('hand tracking matches the chosen pose wrist and distinguishes open from curled fingers', () => {
  const tracker = new HandMotionTracker();
  const result = tracker.update(
    pose,
    [hand(0.35), hand()],
    'right',
    100,
    640,
    480,
  );
  assert.ok(result);
  assert.equal(result.points[0].x, 0.65);
  assert.equal(result.openFingers, 4);
  assert.equal(
    tracker.update(pose, [hand(0.65, 0, false)], 'right', 200, 640, 480)
      ?.openFingers,
    0,
  );
  assert.equal(
    tracker.update(pose, [hand(0.35), hand()], 'left', 300, 640, 480)?.points[0]
      .x,
    0.35,
  );
});
test('palm turn follows rotation while stationary hands and tracking gaps produce no stale motion', () => {
  const tracker = new HandMotionTracker();
  let result;
  for (let i = 0; i < 4; i++)
    result = tracker.update(
      pose,
      [hand(0.65, i * 0.1)],
      'right',
      100 + i * 100,
      640,
      480,
    );
  assert.ok(result?.palmTurn != null);
  assert.ok(Math.abs(result.palmTurn - 180 / Math.PI) < 0.01);
  tracker.update(pose, [], 'right', 500, 640, 480);
  assert.equal(
    tracker.update(pose, [hand()], 'right', 600, 640, 480)?.palmTurn,
    null,
  );
  for (let i = 0; i < 4; i++)
    result = tracker.update(pose, [hand()], 'right', 700 + i * 100, 640, 480);
  assert.equal(result?.palmTurn, 0);
});
test('tiny, ambiguous and malformed hands do not produce measurements', () => {
  const tracker = new HandMotionTracker();
  assert.equal(
    tracker.update(pose, [hand(), hand(0.651)], 'right', 100, 640, 480),
    null,
  );
  const tiny = hand();
  tiny.points = tiny.points.map((p) => ({
    ...p,
    x: 0.65 + (p.x - 0.65) * 0.1,
    y: 0.83 + (p.y - 0.83) * 0.1,
  }));
  assert.equal(tracker.update(pose, [tiny], 'right', 200, 640, 480), null);
  const broken = hand();
  broken.world[9].x = NaN;
  assert.equal(tracker.update(pose, [broken], 'right', 300, 640, 480), null);
});

test('the joint overlay stays available without a body pose or reliable motion geometry', () => {
  const tracker = new HandMotionTracker();
  const detected = hand();
  detected.world = [];
  assert.equal(tracker.update([], [detected], 'right', 100, 640, 480), null);
  assert.equal(tracker.update(pose, [detected], 'right', 200, 640, 480), null);
  assert.equal(visibleHandLandmarks([detected]).length, 1);
  assert.equal(visibleHandLandmarks([detected])[0].length, 21);
});
test('the joint overlay displays both detected hands while ignoring incomplete detections', () => {
  const incomplete = hand();
  incomplete.points.pop();
  const invalid = hand();
  invalid.points[2].x = NaN;
  assert.equal(
    visibleHandLandmarks([hand(), hand(0.35), incomplete, invalid]).length,
    2,
  );
});

test('wrist twist around the palm normal produces signed spin even when the palm normal stays still', () => {
  for (const direction of [-1, 1]) {
    const tracker = new HandMotionTracker();
    let result;
    for (let i = 0; i < 4; i++) {
      const sample = hand();
      const angle = direction * i * 0.2;
      sample.world = sample.world.map((p) => ({
        x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
        y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
        z: p.z,
      }));
      result = tracker.update(pose, [sample], 'right', 100 + i * 100, 640, 480);
    }
    assert.ok(result?.spinVector);
    assert.ok(Math.abs(result.palmTurn ?? 0) < 0.001);
    assert.ok(result.spinVector.z * direction > 0.3);
    assert.ok(
      Math.abs(result.spinVector.x) < 0.001 &&
        Math.abs(result.spinVector.y) < 0.001,
    );
    const shot = applyHandSpin(DEFAULT_SHOT, result, true);
    assert.equal(shot.spinSource, 'hand');
    assert.ok(Math.abs(shot.spin - 1 / Math.PI) < 0.001);
    assert.equal(
      applyHandSpin(DEFAULT_SHOT, result, false).spinSource,
      'setting',
    );
    assert.equal(
      applyHandSpin(DEFAULT_SHOT, null, true).spin,
      DEFAULT_SHOT.spin,
    );
  }
});
test('finger opening alone does not create spin and lost tracking clears the spin vector', () => {
  const tracker = new HandMotionTracker();
  let result;
  for (let i = 0; i < 4; i++)
    result = tracker.update(
      pose,
      [hand(0.65, 0, i % 2 === 0)],
      'right',
      100 + i * 100,
      640,
      480,
    );
  assert.deepEqual(result?.spinVector, { x: 0, y: 0, z: 0 });
  assert.equal(applyHandSpin(DEFAULT_SHOT, result!, true).spin, 0);
  tracker.update(pose, [], 'right', 500, 640, 480);
  assert.equal(
    tracker.update(pose, [hand()], 'right', 600, 640, 480)?.spinVector,
    null,
  );
});
