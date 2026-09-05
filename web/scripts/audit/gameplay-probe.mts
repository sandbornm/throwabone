import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { BunnockPhysics, DT, initPhysics } from '../../lib/game/physics';
import {
  DEFAULT_SHOT,
  type BoneAsset,
  type ShotSettings,
  type SurfaceId,
} from '../../lib/game/types';

const probeOutput = new URL('../../outputs/audit-probes/', import.meta.url);
mkdirSync(probeOutput, { recursive: true });

// Bounded functional audit using ordinary settings accepted by the game.
const asset = JSON.parse(
  readFileSync(
    new URL('../../public/models/bone.json', import.meta.url),
    'utf8',
  ),
) as BoneAsset;
await initPhysics();
const results: unknown[] = [];
const cases: { name: string; shot: ShotSettings }[] = [
  { name: 'default', shot: { ...DEFAULT_SHOT } },
  {
    name: 'short-wide',
    shot: { ...DEFAULT_SHOT, aim: 1.65, power: 0.15, loft: 8, spin: 0 },
  },
  {
    name: 'high-power-lob',
    shot: { ...DEFAULT_SHOT, aim: 0.6, power: 1, loft: 45, spin: 5 },
  },
];
for (const surface of ['gravel', 'dirt', 'grass', 'indoor'] as SurfaceId[]) {
  for (const entry of cases) {
    const p = new BunnockPhysics(asset, surface);
    const start = performance.now();
    try {
      for (let i = 0; i < 120; i++) p.step();
      p.throw(entry.shot);
      let steps = 0;
      while (!p.isSettled() && steps < 15 / DT) {
        p.step();
        steps++;
      }
      const settled = p.isSettled();
      const score = p.score();
      let resets: number | null = null;
      let immediatelyReady: boolean | null = null;
      let immediateThrowError: string | null = null;
      let recoverySteps = 0;
      if (settled) {
        resets = p.resolvePenalties().length;
        immediatelyReady = p.isSettled();
        try {
          p.throw(entry.shot);
        } catch (error) {
          immediateThrowError = String(error);
        }
        if (immediateThrowError) {
          while (!p.isSettled() && recoverySteps < 5 / DT) {
            p.step();
            recoverySteps++;
          }
        }
      }
      const result = {
        surface,
        case: entry.name,
        shot: entry.shot,
        settledWithin15Seconds: settled,
        simulatedSeconds: steps * DT,
        score,
        resets,
        immediatelyReady,
        immediateThrowError,
        recoverySeconds: recoverySteps * DT,
        wallMilliseconds: Math.round(performance.now() - start),
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally {
      p.dispose();
    }
  }
}
writeFileSync(
  new URL('gameplay-probe.json', probeOutput),
  JSON.stringify(
    {
      note: 'Functional Node/Wasm probes; wall time excludes browser rendering and camera inference and is not a mobile benchmark.',
      results,
    },
    null,
    2,
  ) + '\n',
);
