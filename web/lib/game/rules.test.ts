import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BunnockPhysics, initPhysics, type BoneBody } from './physics';
import { DEFAULT_SHOT, type BoneAsset } from './types';
const asset = JSON.parse(
  readFileSync(
    new URL('../../public/models/bone.json', import.meta.url),
    'utf8',
  ),
) as BoneAsset;
await initPhysics();
const topple = (b: BoneBody) => {
  const p = b.body.translation();
  b.body.setTranslation({ x: p.x, y: 0.15, z: p.z + 0.08 }, true);
  b.body.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, true);
  b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
};
const begin = (p: BunnockPhysics) => {
  p.active = null;
  p.throw(DEFAULT_SHOT);
};
test('early soldiers reset inside, then outside, then where they landed', () => {
  const p = new BunnockPhysics(asset),
    s = p.targets[0],
    g = p.targets[20];
  begin(p);
  topple(s);
  p.step();
  assert.equal(p.pendingResets.size, 1);
  let resets = p.resolvePenalties();
  assert.equal(resets[0].count, 1);
  assert.ok(s.body.translation().x > g.body.translation().x);
  assert.equal(p.isDown(s), false);
  assert.equal(p.score().down, 0);
  begin(p);
  topple(s);
  p.step();
  resets = p.resolvePenalties();
  assert.equal(resets[0].count, 2);
  assert.ok(s.body.translation().x < g.body.translation().x);
  begin(p);
  topple(s);
  p.step();
  const at = s.body.translation();
  resets = p.resolvePenalties();
  assert.equal(resets[0].count, 3);
  assert.ok(Math.abs(s.body.translation().x - at.x) < 1e-6);
  assert.ok(Math.abs(s.body.translation().z - at.z) < 1e-6);
  assert.equal(p.isDown(s), false);
  p.dispose();
});
test('a soldier falling with the first guard resets beside the remaining guard', () => {
  const p = new BunnockPhysics(asset);
  begin(p);
  topple(p.targets[20]);
  topple(p.targets[0]);
  p.step();
  const reset = p.resolvePenalties();
  assert.equal(reset.length, 1);
  assert.ok(reset[0].x > 0);
  assert.equal(p.isDown(p.targets[20]), true);
  p.dispose();
});
test('soldiers are valid after both guards fall', () => {
  const p = new BunnockPhysics(asset);
  begin(p);
  topple(p.targets[20]);
  topple(p.targets[21]);
  p.step();
  topple(p.targets[0]);
  p.step();
  assert.equal(p.pendingResets.size, 0);
  assert.equal(p.resolvePenalties().length, 0);
  assert.equal(p.score().down, 3);
  p.dispose();
});
test('a later guard fall does not erase an earlier soldier penalty', () => {
  const p = new BunnockPhysics(asset);
  begin(p);
  topple(p.targets[0]);
  p.step();
  topple(p.targets[20]);
  topple(p.targets[21]);
  p.step();
  assert.equal(p.resolvePenalties().length, 1);
  assert.equal(p.score().down, 2);
  p.dispose();
});
test('reset placements do not overlap each other when several soldiers fall early', () => {
  const p = new BunnockPhysics(asset);
  begin(p);
  for (const b of p.targets.slice(0, 9)) topple(b);
  p.step();
  const r = p.resolvePenalties();
  assert.equal(r.length, 9);
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++)
      assert.ok(
        Math.hypot(r[i].x - r[j].x, r[i].z - r[j].z) >= asset.standingWidth,
      );
  p.dispose();
});
