import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BunnockPhysics,
  DT,
  initPhysics,
  launchVelocity,
  ballisticPath,
  launchSpin,
} from './physics';
import { DEFAULT_SHOT, type BoneAsset } from './types';
const asset = JSON.parse(
  readFileSync(
    new URL('../../public/models/bone.json', import.meta.url),
    'utf8',
  ),
) as BoneAsset;
await initPhysics();
test('camera aim and spin reach the rigid body with their direction and units preserved', () => {
  for (const direction of [-1, 1]) {
    const p = new BunnockPhysics(asset);
    try {
      const bone = p.throw({
        ...DEFAULT_SHOT,
        aim: direction,
        spin: 0.5,
        spinVector: { x: 0, y: direction * 0.5, z: 0 },
        spinSource: 'hand',
      });
      assert.ok(bone.body.linvel().x * direction > 0);
      assert.ok(Math.abs(bone.body.angvel().y - direction * Math.PI) < 0.00001);
      assert.equal(bone.body.angvel().x, 0);
      for (let i = 0; i < 30; i++) p.step();
      assert.ok(bone.body.translation().x * direction > 0.1);
    } finally {
      p.dispose();
    }
  }
  assert.ok(
    Math.abs(
      launchSpin({ ...DEFAULT_SHOT, spinVector: { x: 20, y: 0, z: 0 } }).x -
        Math.PI * 10,
    ) < 0.00001,
  );
  assert.equal(
    launchSpin({ ...DEFAULT_SHOT, spinVector: { x: NaN, y: 0, z: 0 } }).x,
    -DEFAULT_SHOT.spin * Math.PI * 2,
  );
});
test('compound colliders conserve the assigned mass', () => {
  const p = new BunnockPhysics(asset);
  assert.ok(asset.colliders.length > 1);
  assert.equal(p.targets.length, 22);
  assert.ok(Math.abs(p.targets[0].body.mass() - 0.25) < 0.00001);
  p.dispose();
});
test('22 bones remain upright on each surface', () => {
  for (const surface of ['gravel', 'dirt', 'grass', 'indoor'] as const) {
    const p = new BunnockPhysics(asset, surface);
    for (let i = 0; i < 3 / DT; i++) p.step();
    console.log(surface, p.score(), p.targets[0].body.translation());
    assert.equal(p.score().down, 0, surface);
    for (const b of p.targets) {
      const at = b.body.translation();
      assert.ok(Math.abs(at.x - b.initial.x) < 0.01);
      assert.ok(Math.abs(at.z - b.initial.z) < 0.01);
      assert.ok(at.y > 0);
    }
    p.dispose();
  }
});
test('a low throw still knocks a guard down on every surface', () => {
  for (const surface of ['gravel', 'dirt', 'grass', 'indoor'] as const) {
    const p = new BunnockPhysics(asset, surface);
    try {
      for (let i = 0; i < 120; i++) p.step();
      const g = p.targets[20],
        b = p.throw(DEFAULT_SHOT);
      b.body.setTranslation({ x: g.initial.x, y: 0.045, z: 0.4 }, true);
      b.body.setLinvel({ x: 0, y: 0, z: -4 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      for (let i = 0; i < 360; i++) p.step();
      assert.ok(
        p.isDown(g),
        `${surface}: the impact must still topple the guard`,
      );
      assert.equal(p.isDown(p.targets[21]), false);
    } finally {
      p.dispose();
    }
  }
});
test('a non-spinning 75 cm drop has a small rebound and settles on every surface', () => {
  for (const surface of ['gravel', 'dirt', 'grass', 'indoor'] as const) {
    const p = new BunnockPhysics(asset, surface);
    try {
      for (let i = 0; i < 120; i++) p.step();
      const b = p.throw({ ...DEFAULT_SHOT, spin: 0 });
      b.body.setTranslation({ x: 1.35, y: 0.75, z: 6 }, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      let contactY: number | null = null;
      let rebound = 0;
      for (let i = 0; i < 480; i++) {
        p.step();
        const y = b.body.translation().y;
        if (p.firstLanding && contactY === null) contactY = y;
        if (contactY !== null) rebound = Math.max(rebound, y - contactY);
        assert.ok(y > -0.02, `${surface}: the bone must remain above ground`);
      }
      assert.notEqual(contactY, null);
      // A game-feel regression limit for this orientation, not a measured bone property.
      assert.ok(rebound < 0.015, `${surface}: rebound was ${rebound} m`);
      assert.ok(
        p.isSettled(),
        `${surface}: the drop must settle within four seconds`,
      );
    } finally {
      p.dispose();
    }
  }
});
test('released throws follow gravity', () => {
  const p = new BunnockPhysics(asset);
  const v = launchVelocity(DEFAULT_SHOT),
    b = p.throw(DEFAULT_SHOT);
  p.step();
  assert.ok(b.body.linvel().y < v.y);
  assert.ok(b.body.translation().z < 10.12);
  assert.ok(ballisticPath(DEFAULT_SHOT).length > 10);
  p.dispose();
});
test('surface friction changes sliding distance without tunnelling', () => {
  const distances: Record<string, number> = {};
  for (const surface of ['indoor', 'grass'] as const) {
    const p = new BunnockPhysics(asset, surface),
      b = p.throw(DEFAULT_SHOT);
    b.body.setTranslation({ x: 1.35, y: 0.045, z: 7 }, true);
    b.body.setLinvel({ x: 0, y: 0, z: -3 }, true);
    b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    let minY = Infinity;
    for (let i = 0; i < 360; i++) {
      p.step();
      minY = Math.min(minY, b.body.translation().y);
    }
    assert.ok(minY > -0.02, `${surface} penetration ${minY}`);
    distances[surface] = 7 - b.body.translation().z;
    p.dispose();
  }
  console.log('Slide distances', distances);
  assert.ok(distances.indoor > distances.grass * 1.1);
});
test('repeated releases produce the same result', () => {
  const results = [];
  for (let n = 0; n < 2; n++) {
    const p = new BunnockPhysics(asset);
    p.throw(DEFAULT_SHOT);
    for (let i = 0; i < 480; i++) p.step();
    results.push({ ...p.active!.body.translation(), ...p.score() });
    p.dispose();
  }
  assert.deepEqual(results[0], results[1]);
});
