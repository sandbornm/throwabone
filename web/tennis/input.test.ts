import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCameraFeedback } from './input';
import { TennisMotion, type MotionFrame, type TennisHand } from './motion';
import { initTennisPhysics, STEP, TennisPhysics } from './physics';
import { DEFAULT_SETTINGS, type Hand } from './types';

await initTennisPhysics();

function handFrame(
  time: number,
  x = 0.5,
  y = 0.6,
  hand: Hand = 'right',
): MotionFrame {
  const points = Array.from({ length: 21 }, (_, i) => ({
    x: x + ((i % 4) - 1.5) * 0.007,
    y: y - Math.floor(i / 4) * 0.014,
    z: 0,
  }));
  points[0] = { x, y, z: 0 };
  points[5] = { x: x - 0.035, y: y - 0.06, z: 0 };
  points[9] = { x, y: y - 0.08, z: 0 };
  points[17] = { x: x + 0.035, y: y - 0.06, z: 0 };
  const tracked: TennisHand = {
    points,
    world: points.map((p) => ({
      x: (p.x - x) * 0.7,
      y: (p.y - y) * 0.7,
      z: 0,
    })),
    label: hand,
  };
  return { time, points: [], hands: [tracked], width: 960, height: 720 };
}
function setup(hand: Hand = 'right') {
  const game = new TennisPhysics();
  const tracker = new TennisMotion();
  const settings = { ...DEFAULT_SETTINGS, hand };
  game.configure(settings);
  const deliver = (frame: MotionFrame) => {
    const result = tracker.update(frame, settings, game.status.paused);
    applyCameraFeedback(game, result, game.status);
    return result;
  };
  for (let t = 0; t <= 1500; t += 50) deliver(handFrame(t, 0.5, 0.6, hand));
  return { game, tracker, deliver, settings };
}

void test('camera frames move the real racket in both axes under default assistance', () => {
  const { game, deliver } = setup();
  try {
    const origin = { ...game.racket };
    for (let i = 1; i <= 8; i++)
      deliver(handFrame(1500 + i * 50, 0.5 - i * 0.005, 0.6 - i * 0.005));
    assert.ok(game.racket.x > origin.x + 0.5);
    assert.ok(game.racket.y > origin.y + 0.3);
    const commanded = { ...game.racket };
    game.feed();
    for (let i = 0; i < 300; i++) game.step();
    assert.deepEqual(
      game.racket,
      commanded,
      'the feed must not overwrite the camera position',
    );
    assert.equal(game.status.hits, 0, 'positioning alone must not hit a ball');
  } finally {
    game.dispose();
  }
});

void test('mouse/controller position survives an incoming bounce with assistance on', () => {
  const game = new TennisPhysics();
  try {
    game.position(-0.75, 1.4);
    game.feed();
    for (let i = 0; i < 220; i++) game.step();
    assert.deepEqual(game.racket, { x: -0.75, y: 1.4, z: 9.6 });
    game.position(1.8, 0.6);
    game.step();
    assert.deepEqual(game.racket, { x: 1.8, y: 0.6, z: 9.6 });
  } finally {
    game.dispose();
  }
});

void test('a camera swat can meet the ball after the initial trigger window, for either hand', () => {
  for (const hand of ['right', 'left'] as const) {
    const { game, deliver, settings } = setup(hand);
    const direction = hand === 'right' ? 1 : -1;
    const startX = hand === 'right' ? 0.3 : 0.7;
    game.configure({ ...settings, drill: 'forehand' });
    for (let t = 1900; t <= 2400; t += 50)
      deliver(handFrame(t, startX, 0.6, hand));
    game.feed();
    let strokeFrame = 0,
      firstTrigger = -1,
      contactTime = -1,
      triggers = 0;
    try {
      for (let i = 0; i < 700; i++) {
        if (i % 6 === 0) {
          if (
            game.ball.translation().z >= 4.6 &&
            game.status.phase === 'incoming'
          )
            strokeFrame++;
          const result = deliver(
            handFrame(
              2450 + i * STEP * 1000,
              startX + direction * Math.min(strokeFrame, 22) * 0.015,
              0.6,
              hand,
            ),
          );
          if (result.swing) {
            triggers++;
            firstTrigger = game.elapsed;
          }
        }
        game.step();
        if (game.status.hits && contactTime < 0) contactTime = game.elapsed;
        if (game.status.phase === 'result') break;
      }
      assert.equal(triggers, 1, `${hand}: one stroke trigger`);
      assert.equal(
        game.status.hits,
        1,
        `${hand}: motion reached the physics contact path`,
      );
      assert.ok(
        contactTime - firstTrigger > 0.376,
        `${hand}: contact delay ${contactTime - firstTrigger}`,
      );
      assert.equal(game.status.shots[0].result, 'In');
    } finally {
      game.dispose();
    }
  }
});

void test('lost tracking cancels a pending camera contact immediately', () => {
  const { game, deliver } = setup();
  game.feed();
  try {
    while (game.ball.translation().z < 7.8 && game.status.phase === 'incoming')
      game.step();
    deliver(handFrame(4000, 0.5));
    for (let t = 4050; t <= 4300; t += 50) deliver(handFrame(t, 0.5));
    const swat = deliver(handFrame(4350, 0.535));
    assert.ok(swat.activeSwing);
    deliver({ ...handFrame(4400), hands: [] });
    for (let i = 0; i < 200; i++) game.step();
    assert.equal(game.status.hits, 0);
  } finally {
    game.dispose();
  }
});

void test('camera frame stalls expire a stroke and pause blocks racket movement', () => {
  const { game, deliver } = setup();
  game.feed();
  try {
    while (game.ball.translation().z < 6 && game.status.phase === 'incoming')
      game.step();
    const input = {
      position: { x: 1.3, y: 1 },
      activeSwing: {
        id: 1,
        shot: {
          stroke: 'forehand' as const,
          power: 0.55,
          aim: 0,
          spin: 12,
          sidespin: 0,
          lift: 0.5,
        },
      },
    };
    game.motion(input);
    for (let i = 0; i < 300; i++) game.step();
    assert.equal(game.status.hits, 0);
    game.status.paused = true;
    const before = { ...game.racket };
    deliver(handFrame(6000, 0.2, 0.3));
    assert.deepEqual(game.racket, before);
  } finally {
    game.dispose();
  }
});

void test('a consumed camera stroke cannot hit a second feed', () => {
  const game = new TennisPhysics();
  game.feed();
  const input = {
    position: { x: 1.3, y: 1 },
    activeSwing: {
      id: 42,
      shot: {
        stroke: 'forehand' as const,
        power: 0.55,
        aim: 0,
        spin: 12,
        sidespin: 0,
        lift: 0.5,
      },
    },
  };
  try {
    for (let i = 0; i < 350 && game.status.hits === 0; i++) {
      game.motion(input);
      game.step();
    }
    assert.equal(game.status.hits, 1);
    game.feed();
    for (let i = 0; i < 500; i++) {
      game.motion(input);
      game.step();
    }
    assert.equal(game.status.hits, 1);
  } finally {
    game.dispose();
  }
});

function turnedHand(time: number, angle: number, hand: Hand = 'right') {
  const f = handFrame(time, 0.5, 0.6, hand);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const palm = f.hands[0];
  palm.points = palm.points.map((p) => {
    const x = ((p.x - 0.5) * 4) / 3,
      y = p.y - 0.6;
    return { x: 0.5 + ((x * c - y * s) * 3) / 4, y: 0.6 + x * s + y * c, z: 0 };
  });
  palm.world = palm.world.map((p) => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
    z: p.z,
  }));
  return f;
}

void test('a wrist-only swat hits once for either hand with spin estimation off', () => {
  for (const hand of ['right', 'left'] as const) {
    const game = new TennisPhysics();
    const tracker = new TennisMotion();
    const settings = { ...DEFAULT_SETTINGS, hand, wristSpin: false };
    game.configure(settings);
    const deliver = (frame: MotionFrame) => {
      const feedback = tracker.update(frame, settings);
      applyCameraFeedback(game, feedback, game.status);
      return feedback;
    };
    try {
      for (let t = 0; t <= 1500; t += 50) deliver(handFrame(t, 0.5, 0.6, hand));
      game.feed();
      for (let i = 0; i < 400 && game.ball.translation().z < 8.3; i++) {
        game.step();
        if (i % 6 === 0)
          deliver(handFrame(1500 + game.elapsed * 1000, 0.5, 0.6, hand));
      }
      const startTime = 1500 + game.elapsed * 1000;
      const controlledX = game.racket.x;
      let triggers = 0;
      for (let i = 1; i <= 7; i++) {
        const result = deliver(
          turnedHand(
            startTime + i * 50,
            i * 0.22 * (hand === 'right' ? 1 : -1),
            hand,
          ),
        );
        assert.equal(result.spin, null);
        assert.ok(
          Math.abs(game.racketRoll) > 0.1,
          'palm rotation reaches the displayed racket pose',
        );
        if (result.swing) {
          triggers++;
          assert.equal(result.swing.stroke, 'forehand');
        }
        for (let step = 0; step < 6; step++) game.step();
      }
      assert.equal(triggers, 1);
      assert.equal(
        game.status.hits,
        1,
        'a stationary-wrist flick must reach actual ball contact',
      );
      assert.equal(
        game.racket.x,
        controlledX,
        'a hit must not overwrite the hand-controlled racket position',
      );
    } finally {
      game.dispose();
    }
  }
});

void test('small palm jitter does not produce a swing', () => {
  const tracker = new TennisMotion();
  for (let t = 0; t <= 1500; t += 50)
    tracker.update(handFrame(t), DEFAULT_SETTINGS);
  for (let i = 1; i < 50; i++) {
    const feedback = tracker.update(
      turnedHand(1500 + i * 50, Math.sin(i) * 0.015),
      DEFAULT_SETTINGS,
    );
    assert.equal(feedback.activeSwing, undefined);
  }
});
