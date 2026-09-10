import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker(failHands = false, failFrame = false) {
  const messages: { type: string; points?: unknown[]; hands?: unknown[] }[] =
    [];
  let poseLoads = 0,
    poseFrames = 0,
    handFrames = 0,
    frameCloses = 0,
    detectorCloses = 0;
  const scope = {
    exports: {},
    onmessage: async (_event: { data: unknown }) => {},
    postMessage: (data: (typeof messages)[number]) => messages.push(data),
    close: () => {},
  };
  const runtime = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: {
      createFromOptions: async () => {
        poseLoads++;
        return {
          detectForVideo: () => {
            poseFrames++;
            return { landmarks: [[{ x: 0.5, y: 0.5 }]] };
          },
          close: () => detectorCloses++,
        };
      },
    },
    HandLandmarker: {
      createFromOptions: async () => {
        if (failHands) throw new Error('Unavailable');
        return {
          detectForVideo: () => {
            handFrames++;
            if (failFrame) throw new Error('Inference failed');
            return {
              landmarks: [[]],
              worldLandmarks: [[]],
              handedness: [[{ categoryName: 'Right' }]],
            };
          },
          close: () => detectorCloses++,
        };
      },
    },
  };
  runInNewContext(
    readFileSync(
      new URL('../public/tennis/vision-worker.js', import.meta.url),
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
      frame: { width: 960, height: 720, close: () => frameCloses++ },
    });
  return {
    send,
    frame,
    messages,
    counts: () => ({
      poseLoads,
      poseFrames,
      handFrames,
      frameCloses,
      detectorCloses,
    }),
  };
}

void test('hand-only camera never loads or runs the shoulder and elbow model', async () => {
  const w = worker();
  await w.send({ type: 'init', mode: 'swat' });
  await w.frame(100);
  assert.equal(w.counts().poseLoads, 0);
  assert.equal(w.counts().poseFrames, 0);
  assert.equal(w.counts().handFrames, 1);
  assert.equal(w.messages.at(-1)?.points?.length, 0);
  assert.equal(w.messages.at(-1)?.hands?.length, 1);
  assert.equal(w.counts().frameCloses, 1);
});
void test('switching to full arm loads pose once; returning to swat stops pose inference', async () => {
  const w = worker();
  await w.send({ type: 'init', mode: 'swat' });
  await w.send({ type: 'mode', mode: 'arm' });
  await w.frame(100);
  await w.send({ type: 'mode', mode: 'swat' });
  await w.frame(200);
  await w.send({ type: 'mode', mode: 'arm' });
  await w.frame(300);
  assert.equal(w.counts().poseLoads, 1);
  assert.equal(w.counts().poseFrames, 2);
  assert.equal(w.counts().handFrames, 3);
  await w.send({ type: 'close' });
  assert.equal(w.counts().detectorCloses, 2);
});
void test('hand-only startup reports a hand model failure without requesting full-arm framing', async () => {
  const w = worker(true);
  await w.send({ type: 'init', mode: 'swat' });
  assert.equal(w.messages.at(-1)?.type, 'error');
  assert.equal(w.counts().poseLoads, 0);
});
void test('an inference error closes its frame and reports failure', async () => {
  const w = worker(false, true);
  await w.send({ type: 'init', mode: 'swat' });
  await w.frame(100);
  assert.equal(w.counts().frameCloses, 1);
  assert.equal(w.messages.at(-1)?.type, 'error');
});
