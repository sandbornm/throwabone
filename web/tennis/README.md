# Baseline tennis prototype

The tennis experiment lives in this folder. Open `/tennis` on the existing web
server; Throwabone remains at `/`. The route entry is `../app/tennis/page.tsx`
and the dedicated camera worker is `../public/tennis/vision-worker.js`.

From `web/`, use the existing installation and lockfile:

```sh
npm run dev -- --port 3001
```

Open [the local tennis court](http://127.0.0.1:3001/tennis). This prototype uses
the existing Three.js, Rapier, React and MediaPipe packages. No new dependency,
API key, paid service or hosting setup is needed. Nothing is published by running it.

## Play

Click the court to focus keyboard controls. Play buttons return focus to the
court too. Space feeds a ball, F swings a forehand, and B swings a backhand. Wait for the incoming ball to bounce and reach
your racket; the timing bar fills as it approaches. You can also click to swing,
or drag and release. Upward mouse movement adds topspin; a downward brush adds slice.

Choose **Session → Toss & serve** to practise serves. Space tosses the ball;
either swing key hits a serve near the top of the toss. In camera mode, lifting
your off hand also tosses. The landing must be in the opposite service box.
Net-cord serves that land in that box are lets. This is an unlimited ball-feed
practice court, without a match opponent or tournament scoring.

**Ball & spin** controls power, lateral aim, launch angle, signed base spin,
contact assistance and simulation speed. Positive spin adds topspin; negative
spin adds slice. Spin controls and readings use revolutions per second. Lower
the simulation speed while learning the timing. Enable automatic feeding in
Session to receive another ball after each result.

## Camera controls

Choose your playing hand and motion style, then enable the camera. In Hand swat
mode, show one open hand; your elbow and shoulder can stay out of frame. The
preview walks through Show hand, Hold still and Swat. Hold your hand still for
about a second to fill the calibration bar. Recalibrate after moving your chair
or camera. Relax briefly between strokes to prepare the next swing.

| Mode             | Control                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Hand swat        | Small hand movements, seated or standing. Runs only the hand model; no elbow or shoulder is needed. |
| Full swing       | Shoulder, elbow and wrist must be visible; the elbow must move with the wrist.                      |
| Two-hand control | The off hand controls racket position; the playing hand swings. Both must be visible.               |

Your hand always controls racket height and lateral position; palm rotation tilts
the racket too. The ball never moves the racket during a feed. Depth stays near
the player’s baseline. In two-hand mode, your off hand controls the position.
Mouse movement also positions the racket.

**Help reach the ball** extends the contact radius during an active swing. It
starts enabled for swats and full swings and disabled for two-hand control. It
does not replace your hand input or make the racket follow the ball.

After calibration, move your hand before feeding to confirm that the racket
moves with you. Hand swats accept both hand travel and palm rotation, so you can
flick at the wrist while holding your arm still. Turning off Wrist spin estimate
does not disable wrist-only swings. An active swat remains eligible for contact
while the hand is moving, for up to 1.4 seconds, with a short grace period for
inference frames. A single swat can hit only once; losing the hand cancels it.

The wrist-spin option estimates palm rotation from hand landmarks using the
existing hand tracker, anchored to the selected hand. Projected palm rotation
provides a fallback when the world-space palm estimate is unavailable. Vertical brushing adds spin independently of palm rotation. Both
contributions are scaled by Gesture spin gain and added to the base-spin setting.
Only Full swing shows the elbow angle. This angle is projected into the camera
image, not a measured three-dimensional joint angle. Grip angle changes the
handle’s resting angle while keeping the string bed at the contact point.

Sensitivity changes the movement threshold. Smoothing trades response speed for
less jitter. Lost tracking, long frame gaps, implausible jumps, hand changes and
pausing clear swing readiness. The next stroke requires a quiet hand first.

Video and landmarks stay on-device. The existing vendored model and Wasm files
load from the same origin. There are no uploads, recordings, microphone requests,
accounts, telemetry or stored camera samples. Camera close, unmount, hidden tabs,
disconnects and worker timeouts stop the stream. Hand swat and two-hand modes run
only hand inference; Full swing loads shoulder/elbow tracking when selected. Restart is explicit. Leaving the
Motion settings tab keeps the active camera mounted so you can adjust ball settings
while using gestures. Closing camera mode stops it.

Use an empty hand with enough room to move comfortably. Camera input is an
experimental game control; it has not been validated as tennis technique measurement.

## Pause and inspect

P or the pause button freezes simulation time. Use **Focus ball** to inspect
the ball’s felt, seam and angular orientation. The amber arrow follows the actual
simulated spin axis; blue shows velocity. The speed and spin displays switch from
contact readings to the current ball readings while paused.

- Drag to orbit; right-drag to pan.
- Scroll, use a trackpad pinch, or pinch on a touch screen to zoom.
- With the court focused, WASD moves through space; Q moves down and E moves up.
- F focuses the ball while paused. **Step 1/60 s** advances two physics steps;
  the close view follows the ball when Focus ball is active.
- With camera hand navigation enabled, pinch thumb and index finger to grab and
  pan the view. Spread two pinched hands to zoom in; bring them together to zoom out.
- Resume returns to the selected court view.

## Physical model and graphics

Rapier runs at 120 fixed steps per simulated second, independent of display frame
rate. The ball has a 33.5 mm radius and 57 g mass. The court is 23.77 × 10.97 m,
with an 8.23 m singles width and service lines 6.4 m from the net. Net height
ranges from 0.914 m in the centre to 1.07 m at the posts. Dimensions follow the
[ITF court description](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/)
and [ITF rules](https://www.itftennis.com/en/about-us/governance/rules-and-regulations/).

The ball is a rigid sphere with continuous collision detection. Rapier resolves
ground and net contacts, friction, rebound and angular velocity. Forty-eight net
segments follow the sagging top tape, with separate post colliders. The net is
rigid; it does not simulate flexible cloth or string deformation.

Flight uses gravity (9.81 m/s²), quadratic drag (air density 1.225 kg/m³, drag
coefficient 0.55), a bounded Magnus force perpendicular to spin and velocity,
and slight angular damping. The lift coefficient is capped at 0.28. Ground
restitution is 0.73 and effective contact friction is 0.22. These are fixed
approximations, not measurements of a specific court, ball or altitude.

Racket contact uses proximity to the ball and an active swing. Buttons and mouse
release use a short swing window; camera swats stay active while fresh movement
frames arrive. Assistance widens reach and timing tolerance. Contact maps the chosen power, aim, lift and estimated spin to ball
velocity and angular velocity; it does not solve string-bed deformation or a
tracked physical racket impact. Subsequent flight and bounces are simulated.
Groundstrokes launch at 13–30 m/s and serves at 22–46 m/s. This separates the
experimental camera mapping from the ball physics; it is not a validated tennis
simulator or a source of real-world swing-speed measurements.

The racket pivots at the string bed, follows your hand or mouse, and uses a short
follow-through on contact. The racket, strings, grip, ball seams, court grain, net
and stadium are generated locally. Three.js provides physical materials, shadows and tone mapping. The
small translucent ball halo helps visibility during play and disappears during
inspection. The collision radius is unchanged. Racket pops, bounces and net
sounds use short Web Audio synthesis; no external sound files are required.
Court bounces use a short falling sine tone without a noise layer; the racket
adds a brief high-frequency transient.

## Code and validation

| File                                           | Responsibility                                                  |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `tennis-app.tsx`, `settings.tsx`, `tennis.css` | Court UI, controls and shot log                                 |
| `scene.ts`                                     | Rendering, input, fixed-step loop and paused navigation         |
| `court.ts`                                     | Procedural court, stadium, racket and ball                      |
| `physics.ts`                                   | Rapier world, flight forces, feed/contact lifecycle and results |
| `motion.ts`                                    | Calibration, swing/toss detection and paused pinch controls     |
| `input.ts`                                     | Camera feedback passed to the game controller                  |
| `camera.tsx`                                   | Permission, stream, inference deadlines and landmark overlay    |
| `audio.ts`                                     | Synthesized racket pop and impact sounds                        |

Run `npm run test:tennis` from `web/` for focused checks. `npm test` includes
these tests with the existing game tests. The tests cover both hands, tracking
interruption, one release per swing, tosses, hand-only calibration, paused
pinches, spin-force direction, feeds, serves, net contact, energy loss on bounce,
result classification and simulation pause. Integration tests send hand landmarks
through the camera feedback handler into physics to check direct racket movement,
wrist-only and continuing swats, tracking loss, stalled frames and single contact.

See [release status](../../docs/release.md#tennis-experiment) for completed checks
and the browser, live-camera and audio checks that remain. The original
Throwabone audit findings have not been changed or closed by this experiment.
