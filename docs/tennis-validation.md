# Tennis prototype validation — September 9, 2026

Scope: the new `/tennis` route, its `web/tennis/` implementation and
`web/public/tennis/vision-worker.js`. Throwabone’s gameplay code and the original
audit evidence are unchanged.

## Automated checks

Run from `web/` using Node **22.22.2** and the existing installed dependencies.
No dependencies or lockfile entries changed; installation was not repeated.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 80 tests, including 38 tennis tests |
| `npm run test:tennis` | Passed: 38 tests |
| `npm run build` | Passed; `/` and `/tennis` exported as static routes |
| `npm run lint -- tennis app/tennis public/tennis` | Passed |
| `npm run lint` | Failed with 75 existing errors outside the tennis files |
| `npm audit --json` | 11 flagged package entries: 8 high, 2 moderate, 1 low |
| HTTP request to local `/tennis` | 200 |

The static build needed permission to open Vinext’s local prerender listener.
An earlier attempt stopped at that sandbox restriction; the permitted build
completed. The audit initially could not reach npm’s registry; a permitted
retry produced the figures above. The build retains its large-chunk warning.
Neither the lint rules nor the existing tests were weakened.

Latest local logs are in the ignored `web/outputs/tennis-direct-control/` folder.
Earlier checks are in `web/outputs/tennis-2026-09-09/`.
Portable regression evidence is in
[physics tests](../web/tennis/physics.test.ts),
[motion tests](../web/tennis/motion.test.ts), and
[worker tests](../web/tennis/worker.test.ts), with camera-to-physics coverage in
[input tests](../web/tennis/input.test.ts).

## What the checks establish

Physics tests confirm that the default groundstroke feeds reach the contact
area and land in court for both playing hands. Default serves land in the
opposite service box. Other cases cover mass, net height, drag energy loss,
topspin/slice force direction, spin-dependent landing, net collisions, bounce
height, pause/resume, one contact per swing, immutable launch readings, strict
racket positioning, line calls and delayed repeat feeds.

Motion tests cover left/right forehands and backhands, hand-only calibration,
mislabelled single hands, interruption, single releases, pause/resume, elbow
movement in full-arm mode, off-hand positioning and tosses, upward brushing,
and paused pinch navigation. The worker tests verify that hand-only mode never
loads or runs pose inference, switching modes loads it only when needed,
model errors are reported, and frames close after inference errors.

The owner’s first local try reported an overly noisy bounce, awkward racket
motion and unclear hand-only setup. The revision removes noise from court
bounces, pivots the racket at its string bed, shortens follow-through, adds grip
angle adjustment and returns keyboard focus after play-button clicks. Hand-only
mode now runs hand inference alone and shows explicit setup steps without elbow
readouts.

The next owner test found that the racket followed the bouncing ball and ignored
hand movement. The default placement assistance discarded camera and mouse
positions, then copied the ball's height and lateral position on every physics
step. The earlier 71 tests did not cover this input path. A new regression
reproduced the failure before the fix.

Hand and mouse positions now reach the racket even with assistance enabled.
Assistance extends reach during a swing; feeding a ball cannot move the racket.
Camera swings remain eligible for contact while fresh movement frames arrive,
instead of expiring after the initial trigger window. Palm rotation also triggers
hand-only swats with a stationary wrist, including when spin estimation is off.
The preview shows Hand linked only while it sees a calibrated hand and prompts
the player to check racket movement before feeding.

The new integration cases send synthetic hand landmarks through the same feedback
handler used by the camera and into Rapier. They cover both playing hands, direct
positioning, wrist-only contact, delayed contact during a continuing swing,
tracking loss, stalled frames, pausing, small palm jitter and preventing one
gesture from hitting a second feed. These checks pass; the revised controls still
need hands-on verification.

## Checks still needed

No automated browser interaction, screenshot review, live-camera session, audio
listening test or physical-device test was performed by the agent. The HTTP
check and production export do not establish WebGL appearance, audio quality,
gesture latency, camera permission behavior or pinch behavior on a real device.

Try a complete manual and camera session in the updated preview. Include both
playing hands, hand-only framing, camera allow/deny/retry/close/background flows,
full-arm framing, off-hand positioning, serves, low light, pause/pinch/step/resume,
trackpad/touch zoom, keyboard focus and sound. Check frame rate and camera latency
with detailed graphics both on and off.

The ball’s flight and contacts use a physical simulation, but its aerodynamic
coefficients and camera-to-racket mapping have not been fitted to measured tennis
data. Net deformation and string-bed impact are not modeled. No real-world
technique or swing-speed validation is claimed. Original audit items R01–R07
remain open.
