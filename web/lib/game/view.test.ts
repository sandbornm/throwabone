import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { rangeView } from './view';
import { ballisticPath } from './physics';
import { DEFAULT_SHOT } from './types';

function framedPoint(
  view: ReturnType<typeof rangeView>,
  aspect: number,
  point: number[],
) {
  const camera = new PerspectiveCamera(view.fov, aspect, 0.025, 120);
  camera.position.fromArray(view.position);
  camera.lookAt(new Vector3().fromArray(view.look));
  camera.updateMatrixWorld();
  const projected = new Vector3().fromArray(point).project(camera);
  assert.ok(
    Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95,
    `Point ${point.join(',')} is outside the ${aspect} aspect viewport: ${projected.toArray().join(',')}`,
  );
  assert.ok(projected.z > -1 && projected.z < 1);
}

void test('side view frames the whole target row and nearby impacts on wide and portrait screens', () => {
  for (const aspect of [2, 1.5, 1, 0.65, 0.5]) {
    const view = rangeView('side', aspect);
    assert.ok(view.position[0] > 1.65);
    assert.ok(view.position[1] > 0.2 && view.position[1] < 0.8);
    for (const x of [-1.15, 0, 1.15]) {
      for (const z of [-0.4, 0, 0.75]) {
        for (const y of [0.03, 0.15]) framedPoint(view, aspect, [x, y, z]);
      }
    }
  }
});

void test('follow frames low and high arcs, lateral throws and ground runout with a level camera', () => {
  for (const aspect of [2, 1, 0.5]) {
    for (const loft of [8, 18, 45]) {
      for (const aim of [-1.65, 0, 1.65]) {
        const path = ballisticPath({ ...DEFAULT_SHOT, power: 1, loft, aim });
        const landing = path.at(-1)!;
        path.push({ x: landing.x + 0.2, y: 0.03, z: landing.z - 2 });
        for (const point of path) {
          const view = rangeView('player', aspect, point);
          assert.ok(view.position[1] >= 0.8);
          assert.ok(view.position[2] > point.z);
          assert.equal(view.position[0], view.look[0]);
          framedPoint(view, aspect, [point.x, point.y, point.z]);
          framedPoint(view, aspect, [point.x, point.y, point.z + 0.6]);
        }
      }
    }
  }
});

void test('ending follow restores whichever fixed view was selected', () => {
  for (const view of ['player', 'target', 'side', 'overhead'] as const) {
    const before = rangeView(view, 0.65);
    const following = rangeView(view, 0.65, { x: 1, y: 1.6, z: 3 });
    assert.notDeepEqual(following, before);
    assert.deepEqual(rangeView(view, 0.65, null), before);
  }
});

void test('first-person framing includes both rows and the release on desktop and portrait screens', () => {
  for (const aspect of [2, 1.5, 1, 0.65, 0.5]) {
    const view = rangeView('player', aspect);
    const camera = new PerspectiveCamera(view.fov, aspect, 0.025, 120);
    camera.position.fromArray(view.position);
    camera.lookAt(new Vector3().fromArray(view.look));
    camera.updateMatrixWorld();
    assert.equal(camera.position.x, 0);
    assert.ok(camera.position.y > 1.4 && camera.position.y < 1.9);
    assert.ok(camera.position.z > 10.12);
    for (const point of [
      [-1.05, 0.035, 0],
      [1.05, 0.035, 0],
      [-1.05, 0.035, 10],
      [1.05, 0.035, 10],
      [0, 0.75, 10.12],
    ]) {
      const projected = new Vector3().fromArray(point).project(camera);
      assert.ok(
        Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
        `Point ${point.join(',')} is outside the ${aspect} aspect viewport: ${projected.toArray().join(',')}`,
      );
      assert.ok(projected.z > -1 && projected.z < 1);
    }
  }
});
