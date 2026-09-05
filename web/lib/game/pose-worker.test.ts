import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker(failHands = false) {
  const messages: any[] = [];
  let handLoads = 0,
    closed = 0;
  const scope: any = {
    postMessage: (data: any) => messages.push(data),
    close: () => {},
  };
  const runtime = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: {
      createFromOptions: async () => ({
        detectForVideo: () => ({ landmarks: [[{ x: 0.5, y: 0.5 }]] }),
      }),
    },
    HandLandmarker: {
      createFromOptions: async () => {
        handLoads++;
        if (failHands) throw new Error('Model unavailable');
        return {
          detectForVideo: () => ({
            landmarks: [[{ x: 0.6, y: 0.7 }]],
            worldLandmarks: [[{ x: 0, y: 0, z: 0 }]],
          }),
        };
      },
    },
  };
  runInNewContext(
    readFileSync(
      new URL('../../public/pose-worker.js', import.meta.url),
      'utf8',
    ),
    {
      self: scope,
      importScripts: () => {
        scope.exports = runtime;
      },
    },
  );
  const send = (data: unknown) => scope.onmessage({ data });
  const frame = (time: number) =>
    send({
      type: 'frame',
      time,
      frame: { width: 640, height: 480, close: () => closed++ },
    });
  return {
    send,
    frame,
    messages,
    loads: () => handLoads,
    closed: () => closed,
  };
}
test('the worker loads hands only on request and stops returning them when disabled', async () => {
  const w = worker();
  await w.send({ type: 'init' });
  await w.frame(100);
  assert.equal(w.loads(), 0);
  assert.equal(w.messages.at(-1).hands.length, 0);
  await w.send({ type: 'hands', enabled: true });
  await w.frame(200);
  assert.equal(w.loads(), 1);
  assert.equal(w.messages.at(-1).hands.length, 1);
  await w.send({ type: 'hands', enabled: false });
  await w.frame(300);
  assert.equal(w.messages.at(-1).hands.length, 0);
  assert.equal(w.closed(), 3);
});
test('a hand model failure preserves pose inference and releases the frame', async () => {
  const w = worker(true);
  await w.send({ type: 'init' });
  await w.send({ type: 'hands', enabled: true });
  assert.ok(w.messages.some((m) => m.type === 'hands' && m.status === 'error'));
  await w.frame(100);
  assert.equal(w.messages.at(-1).type, 'pose');
  assert.equal(w.messages.at(-1).points.length, 1);
  assert.equal(w.messages.at(-1).hands.length, 0);
  assert.equal(w.closed(), 1);
});
