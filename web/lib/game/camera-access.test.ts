import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginCameraRequest, cameraIssue } from './camera-access';

function fakeStream() {
  let stops = 0;
  return {
    stream: {
      getTracks: () => [{ stop: () => stops++ }],
    } as unknown as MediaStream,
    stops: () => stops,
  };
}

void test('camera access is requested immediately from the click, with video only', async () => {
  const fake = fakeStream();
  let constraints: MediaStreamConstraints | undefined;
  const request = beginCameraRequest({
    secure: true,
    getUserMedia: (options) => {
      constraints = options;
      return Promise.resolve(fake.stream);
    },
  });
  assert.ok(constraints?.video);
  assert.equal(constraints.audio, false);
  assert.deepEqual(await request.result, { stream: fake.stream });
  request.cancel();
  request.cancel();
  assert.equal(fake.stops(), 1);
});

void test('closing during a permission prompt stops a camera that is allowed later', async () => {
  const fake = fakeStream();
  let allow!: (stream: MediaStream) => void;
  const request = beginCameraRequest({
    secure: true,
    getUserMedia: () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  });
  request.cancel();
  allow(fake.stream);
  assert.equal(await request.result, null);
  assert.equal(fake.stops(), 1);
});

void test('a stale request cannot replace or stop a later camera session', async () => {
  const stale = fakeStream();
  const fresh = fakeStream();
  let allow!: (stream: MediaStream) => void;
  const first = beginCameraRequest({
    secure: true,
    getUserMedia: () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  });
  first.cancel();
  const second = beginCameraRequest({
    secure: true,
    getUserMedia: () => Promise.resolve(fresh.stream),
  });
  assert.deepEqual(await second.result, { stream: fresh.stream });
  allow(stale.stream);
  assert.equal(await first.result, null);
  assert.equal(stale.stops(), 1);
  assert.equal(fresh.stops(), 0);
  second.cancel();
  assert.equal(fresh.stops(), 1);
});

void test('denied access reports recovery guidance and a new request can succeed', async () => {
  const denied = beginCameraRequest({
    secure: true,
    getUserMedia: () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
  });
  const result = await denied.result;
  assert.ok(result && 'issue' in result);
  assert.equal(result.issue.kind, 'permission');
  const fake = fakeStream();
  const retry = beginCameraRequest({
    secure: true,
    getUserMedia: () => Promise.resolve(fake.stream),
  });
  assert.deepEqual(await retry.result, { stream: fake.stream });
  retry.cancel();
});

void test('insecure and unsupported contexts explain the problem without requesting a camera', async () => {
  let called = false;
  const insecure = beginCameraRequest({
    secure: false,
    getUserMedia: () => {
      called = true;
      throw new Error('must not run');
    },
  });
  const result = await insecure.result;
  assert.ok(result && 'issue' in result);
  assert.equal(result.issue.kind, 'insecure');
  assert.equal(called, false);
  const unsupported = await beginCameraRequest({ secure: true }).result;
  assert.ok(unsupported && 'issue' in unsupported);
  assert.equal(unsupported.issue.kind, 'unsupported');
});

void test('missing and busy cameras have distinct guidance from permission denial', () => {
  assert.equal(cameraIssue({ name: 'NotFoundError' }).kind, 'missing');
  assert.equal(cameraIssue({ name: 'NotReadableError' }).kind, 'busy');
  assert.equal(cameraIssue({ name: 'NotAllowedError' }).kind, 'permission');
  assert.equal(
    cameraIssue(new Error('Arm tracking could not load.')).message,
    'Arm tracking could not load.',
  );
});

void test('a dismissed session ignores a late denial without an unhandled rejection', async () => {
  let deny!: (error: Error) => void;
  const request = beginCameraRequest({
    secure: true,
    getUserMedia: () =>
      new Promise((_, reject) => {
        deny = reject;
      }),
  });
  request.cancel();
  deny(new DOMException('Permission denied', 'NotAllowedError'));
  assert.equal(await request.result, null);
});
