import type { Point3, ViewId } from './types';

export function rangeView(
  view: ViewId,
  aspect: number,
  followTarget: Point3 | null = null,
) {
  if (followTarget) {
    // Follow translation only: a spinning bone must not roll the camera.
    const { x, y, z } = followTarget;
    return {
      position: [x, Math.max(0.8, y + 0.8), z + 1.9],
      look: [x, Math.max(0.04, y), z - 0.65],
      fov: Math.max(
        56,
        (2 *
          Math.atan(Math.tan((23 * Math.PI) / 180) / Math.max(0.3, aspect)) *
          180) /
          Math.PI,
      ),
    };
  }
  if (view === 'target')
    return { position: [0.3, 0.4, 2.6], look: [0, 0.04, 0.06], fov: 39 };
  if (view === 'side')
    return {
      position: [2.8, 0.55, 0.75],
      look: [0, 0.08, 0.12],
      fov: Math.max(
        48,
        (2 *
          Math.atan(Math.tan((24 * Math.PI) / 180) / Math.max(0.3, aspect)) *
          180) /
          Math.PI,
      ),
    };
  if (view === 'overhead')
    return { position: [0.001, 12.3, 5], look: [0, 0, 5], fov: 39 };
  // Keep the home row in sight when the viewport is tall and narrow.
  const fov = Math.max(
    62,
    (2 *
      Math.atan(Math.tan((28 * Math.PI) / 180) / Math.max(0.3, aspect)) *
      180) /
      Math.PI,
  );
  return { position: [0, 1.65, 11.85], look: [0, 0.15, 6.8], fov };
}
