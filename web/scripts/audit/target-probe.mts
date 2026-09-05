import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { BunnockPhysics, DT, initPhysics } from '../../lib/game/physics';
import { DEFAULT_SHOT, type BoneAsset } from '../../lib/game/types';

const probeOutput = new URL('../../outputs/audit-probes/', import.meta.url);
mkdirSync(probeOutput, { recursive: true });

const asset = JSON.parse(
  readFileSync(
    new URL('../../public/models/bone.json', import.meta.url),
    'utf8',
  ),
) as BoneAsset;
await initPhysics();
const results: unknown[] = [];
// Ordinary releases aimed at a guard; no body positions or velocities are overridden.
for (const side of [-1, 1]) {
  for (const power of [0.65, 0.75, 0.85]) {
    const p = new BunnockPhysics(asset, 'gravel');
    try {
      for (let i = 0; i < 120; i++) p.step();
      const aim = p.targets[side < 0 ? 20 : 21].initial.x;
      const shot = { ...DEFAULT_SHOT, aim, power, loft: 18 };
      p.throw(shot);
      let steps = 0;
      while (!p.isSettled() && steps < 15 / DT) {
        p.step();
        steps++;
      }
      const settled = p.isSettled();
      const before = p.score();
      const resets = settled ? p.resolvePenalties() : null;
      const result = {
        shot,
        settled,
        simulatedSeconds: steps * DT,
        scoreBeforeReset: before,
        scoreAfterReset: p.score(),
        resetCount: resets?.length ?? null,
        landing: p.firstLanding,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally {
      p.dispose();
    }
  }
}
writeFileSync(
  new URL('target-probe.json', probeOutput),
  JSON.stringify(results, null, 2) + '\n',
);
