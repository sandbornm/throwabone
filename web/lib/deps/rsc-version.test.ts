import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const MIN_PATCHED = '19.2.9';

function numericVersion(version: string): number[] {
  const core = version.split('-')[0] ?? version;
  return core.split('.').map((part) => {
    const n = Number(part);
    assert.ok(
      Number.isInteger(n) && n >= 0,
      `unrecognized version: ${version}`,
    );
    return n;
  });
}

function isAtLeast(version: string, minimum: string): boolean {
  const left = numericVersion(version);
  const right = numericVersion(minimum);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

test('react-server-dom-webpack resolves to the patched 19.2.9 release or newer', () => {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('react-server-dom-webpack/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  assert.ok(
    isAtLeast(pkg.version, MIN_PATCHED),
    `expected react-server-dom-webpack >= ${MIN_PATCHED}, got ${pkg.version}`,
  );
});
