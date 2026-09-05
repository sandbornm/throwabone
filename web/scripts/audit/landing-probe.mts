import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
import { BunnockPhysics, initPhysics } from '../../lib/game/physics';
import { DEFAULT_SHOT, type BoneAsset } from '../../lib/game/types';

const probeOutput = new URL('../../outputs/audit-probes/', import.meta.url);
mkdirSync(probeOutput, { recursive: true });

// Preserves the ordinary-release diagnostic run during the audit.
// A large upward velocity impulse near ground, well before the target row,
// identifies a ground impact independently of the game's landing recorder.
await initPhysics();
const asset = JSON.parse(
  fs.readFileSync(
    new URL('../../public/models/bone.json', import.meta.url),
    'utf8',
  ),
) as BoneAsset;
const results = [];
for (const power of [0.65, 0.75, 0.85]) {
  const p = new BunnockPhysics(asset);
  try {
    for (let i = 0; i < 120; i++) p.step();
    const b = p.throw({ ...DEFAULT_SHOT, aim: p.targets[20].initial.x, power });
    let firstGroundImpulse = null;
    let landingRecordTime = null;
    for (let i = 0; i < 600; i++) {
      const before = b.body.linvel();
      p.step();
      const at = b.body.translation();
      const after = b.body.linvel();
      if (
        !firstGroundImpulse &&
        at.z > 1 &&
        at.y < 0.1 &&
        after.y - before.y > 0.3
      ) {
        firstGroundImpulse = {
          seconds: p.shotElapsed,
          position: at,
          deltaVy: after.y - before.y,
          landingAtThisStep: p.firstLanding,
        };
      }
      if (p.firstLanding && landingRecordTime === null)
        landingRecordTime = p.shotElapsed;
    }
    results.push({
      power,
      firstGroundImpulse,
      landingRecordTime,
      recordedLanding: p.firstLanding,
    });
  } finally {
    p.dispose();
  }
}
fs.writeFileSync(
  new URL('landing-probe.json', probeOutput),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
