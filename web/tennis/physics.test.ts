import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aerodynamicForce,
  BALL_MASS,
  BALL_RADIUS,
  initTennisPhysics,
  landingResult,
  netHeight,
  STEP,
  TennisPhysics,
} from './physics';
import { DEFAULT_SETTINGS, type Drill, type Hand, type Swing } from './types';

await initTennisPhysics();
const shot: Swing = {
  stroke: 'forehand',
  power: 0.55,
  aim: 0,
  spin: 12,
  sidespin: 0,
  lift: 0.5,
};

function play(drill: Drill = 'rally', hand: Hand = 'right', swing = shot) {
  const game = new TennisPhysics();
  game.configure({ ...DEFAULT_SETTINGS, drill, hand });
  game.feed();
  for (let i = 0; i < 1000; i++) {
    game.step();
    const p = game.ball.translation();
    if (
      (game.status.phase === 'incoming' && p.z > 8.5) ||
      (game.status.phase === 'toss' && p.y > 2.85)
    )
      game.requestSwing(swing);
    if (game.status.phase === 'result') break;
  }
  return game;
}

void test('ball dimensions, mass and net sag match the modeled court', () => {
  const game = new TennisPhysics();
  try {
    assert.ok(Math.abs(game.ball.mass() - BALL_MASS) < 1e-7);
    assert.equal(BALL_RADIUS, 0.0335);
    assert.equal(netHeight(0), 0.914);
    assert.equal(netHeight(6.399), 1.07);
  } finally {
    game.dispose();
  }
});
void test('drag removes energy and topspin and slice bend in opposite directions', () => {
  const v = { x: 2, y: 0, z: -25 };
  const flat = aerodynamicForce(v, { x: 0, y: 0, z: 0 });
  const top = aerodynamicForce(v, { x: -150, y: 0, z: 0 });
  const slice = aerodynamicForce(v, { x: 150, y: 0, z: 0 });
  assert.ok(flat.x * v.x + flat.z * v.z < 0);
  assert.ok(top.y < 0 && slice.y > 0);
  assert.ok(aerodynamicForce(v, { x: 0, y: 150, z: 0 }).x < flat.x);
  assert.deepEqual(
    aerodynamicForce({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }),
    { x: 0, y: 0, z: 0 },
  );
});
void test('default feeds reach the player and both strokes land in court for either hand', () => {
  for (const hand of ['right', 'left'] as const)
    for (const drill of ['forehand', 'backhand'] as const) {
      const game = play(drill, hand, { ...shot, stroke: drill });
      try {
        assert.equal(game.status.hits, 1);
        assert.equal(game.status.inside, 1);
        assert.equal(game.status.shots[0].stroke, drill);
        assert.equal(game.status.shots[0].result, 'In');
        assert.ok(
          Math.sign(game.status.shots[0].x!) ===
            (drill === 'forehand' ? 1 : -1) * (hand === 'right' ? 1 : -1),
        );
      } finally {
        game.dispose();
      }
    }
});
void test('default serves land in the opposite service box for both hands', () => {
  for (const hand of ['right', 'left'] as const) {
    const game = play('serve', hand);
    try {
      const result = game.status.shots[0];
      assert.equal(result.result, 'In');
      assert.equal(result.stroke, 'serve');
      assert.ok(result.z! >= -6.4);
      assert.equal(Math.sign(result.x!), hand === 'right' ? -1 : 1);
    } finally {
      game.dispose();
    }
  }
});
void test('one swing produces one contact and immutable launch readings', () => {
  const game = new TennisPhysics();
  game.feed();
  try {
    while (game.ball.translation().z < 8.5 && game.status.phase === 'incoming')
      game.step();
    game.requestSwing(shot);
    for (let i = 0; i < 5; i++)
      game.requestSwing({ ...shot, spin: -45, power: 1 });
    game.configure({
      ...DEFAULT_SETTINGS,
      spin: -45,
      power: 1,
      drill: 'serve',
    });
    for (let i = 0; i < 500 && game.status.phase !== 'result'; i++) game.step();
    assert.equal(game.status.hits, 1);
    assert.equal(game.status.shots.length, 1);
    assert.equal(game.status.shots[0].spin, 12);
    assert.equal(game.status.shots[0].speed, 80);
    assert.equal(game.status.shots[0].result, 'In');
  } finally {
    game.dispose();
  }
});
void test('pause freezes translation, orientation, time and new inputs', () => {
  const game = new TennisPhysics();
  game.feed();
  for (let i = 0; i < 60; i++) game.step();
  try {
    game.status.paused = true;
    const p = { ...game.ball.translation() },
      r = { ...game.ball.rotation() },
      time = game.elapsed;
    for (let i = 0; i < 300; i++) game.step();
    game.requestSwing(shot);
    game.feed();
    assert.deepEqual({ ...game.ball.translation() }, p);
    assert.deepEqual({ ...game.ball.rotation() }, r);
    assert.equal(game.elapsed, time);
    assert.equal(game.status.hits, 0);
    game.status.paused = false;
    game.step();
    assert.equal(game.elapsed, time + STEP);
    assert.notDeepEqual({ ...game.ball.translation() }, p);
  } finally {
    game.dispose();
  }
});
void test('strict two-hand placement misses when the racket is outside reach', () => {
  const game = new TennisPhysics();
  game.configure({
    ...DEFAULT_SETTINGS,
    assistPlacement: false,
    assist: 0,
    mode: 'dual',
  });
  game.racket = { x: -4, y: 2, z: 9.6 };
  game.feed();
  try {
    for (let i = 0; i < 800; i++) {
      game.requestSwing(shot);
      game.step();
    }
    assert.equal(game.status.hits, 0);
    assert.equal(game.status.phase, 'result');
  } finally {
    game.dispose();
  }
});
void test('early swings expire before the ball arrives', () => {
  const game = new TennisPhysics();
  game.feed();
  game.requestSwing(shot);
  try {
    for (let i = 0; i < 800; i++) game.step();
    assert.equal(game.status.hits, 0);
    assert.equal(game.status.phase, 'result');
  } finally {
    game.dispose();
  }
});
void test('spin alters the actual flight and first landing', () => {
  const flat = play('rally', 'right', { ...shot, spin: 0 });
  const top = play('rally', 'right', { ...shot, spin: 35 });
  try {
    assert.ok(top.lastLanding && flat.lastLanding);
    assert.ok(top.lastLanding.z > flat.lastLanding.z + 1);
  } finally {
    flat.dispose();
    top.dispose();
  }
});
void test('low shots collide with the net instead of passing through', () => {
  const game = play('rally', 'right', { ...shot, lift: 0 });
  try {
    assert.equal(game.status.shots[0].result, 'Net');
    assert.ok(game.ball.translation().z > 0);
  } finally {
    game.dispose();
  }
});
void test('drop bounce loses energy, generates contact and remains finite', () => {
  let impacts = 0;
  const game = new TennisPhysics((e) => {
    if (e.type === 'bounce') impacts++;
  });
  game.feed();
  game.ball.setTranslation({ x: 2, y: 2.54, z: 3 }, true);
  game.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
  let bouncePeak = 0;
  try {
    for (let i = 0; i < 1200; i++) {
      game.step();
      const p = game.ball.translation();
      assert.ok([p.x, p.y, p.z].every(Number.isFinite));
      if (impacts === 1) bouncePeak = Math.max(bouncePeak, p.y);
    }
    assert.ok(impacts > 0);
    assert.ok(
      bouncePeak > 1.1 && bouncePeak < 1.65,
      `bounce peak ${bouncePeak}`,
    );
  } finally {
    game.dispose();
  }
});
void test('line-touching balls are in; wrong-side serves are faults', () => {
  assert.equal(landingResult({ x: 4.13, y: 0, z: -11.9 }, false, 1), 'In');
  assert.equal(landingResult({ x: 4.3, y: 0, z: -8 }, false, 1), 'Wide');
  assert.equal(landingResult({ x: 1, y: 0, z: -4 }, true, 1), 'Fault');
  assert.equal(landingResult({ x: -1, y: 0, z: -4 }, true, 1), 'In');
});
void test('automatic feeds wait for a result and restart after the chosen delay', () => {
  const game = new TennisPhysics();
  game.configure({ ...DEFAULT_SETTINGS, autoFeed: true, feedInterval: 1 });
  game.feed();
  try {
    for (let i = 0; i < 1000 && game.status.phase !== 'result'; i++)
      game.step();
    assert.equal(game.status.phase, 'result');
    const ended = game.elapsed;
    for (let i = 0; i < 110; i++) game.step();
    assert.equal(game.status.phase, 'result');
    for (let i = 0; i < 15; i++) game.step();
    assert.equal(game.status.phase, 'incoming');
    assert.ok(game.elapsed - ended >= 1);
    game.reset();
    assert.equal(game.status.phase, 'ready');
    assert.equal(game.status.hits, 0);
    assert.equal(game.status.shots.length, 0);
  } finally {
    game.dispose();
  }
});

void test('an incoming ball must not move a stationary racket with default assistance', () => {
  const game = new TennisPhysics();
  const position = { ...game.racket };
  game.feed();
  try {
    for (let i = 0; i < 240; i++) {
      game.step();
      assert.deepEqual(game.racket, position);
    }
  } finally {
    game.dispose();
  }
});
