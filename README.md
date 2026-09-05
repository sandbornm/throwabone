# Throwabone

A browser practice range inspired by the traditional game of Bunnock. Throw a
bone toward a row of guards and soldiers, then inspect its arc, collisions and
results. The bone comes from the original Blender scene in this repository.

**Private prototype. Public launch is on hold pending the [release checklist](docs/release.md).**
The [September 5 audit](docs/audits/2026-09-05.md) records confirmed landing/readiness
bugs, dependency work and untested browser/mobile behavior. Physics and camera
spin are provisional game-control estimates, not validated real-world coaching.

## Run locally

Use Node 22.13 or newer in the Node 22 line; `.nvmrc` and CI select Node 22.

```sh
nvm install
nvm use
cd web
npm ci
npm run dev
```

Open the loopback URL printed by the server. No game account, API key, Rust build,
Blender installation or hosting account is required to play. The repository itself
is private and requires GitHub access. See [development setup](docs/development.md)
for cloning, production preview and troubleshooting.

## Play

Drag sideways to aim, pull down for power and release. Arrow keys and Space work
when the court or throw pad has focus. Pick Slide, Tumble or Lob, then use optional
fine tuning. Switch between first-person, target, side and overhead views; Follow
tracks the throw and slow motion helps inspect contact.

Camera mode supports hands-free arming, an underhand gesture, lateral aim and an
experimental wrist-spin estimate. Use an empty hand. Video and landmarks are
processed on-device and are not saved or uploaded. Keyboard/touch remains available.

An optional nickname and the last 30 throws stay in this browser's local storage.
This is unlimited single-player practice with guard-first resets, not a complete
alternating-team match. See [playing](docs/gameplay.md) and [camera setup](docs/camera.md).

## Start reading

| Goal | Guide |
| --- | --- |
| Work on the code as a human or agent | [AGENTS.md](AGENTS.md), [contributing](CONTRIBUTING.md) |
| Understand modules, state and data flow | [Architecture](docs/architecture.md) |
| Install, test or reproduce an audit observation | [Development](docs/development.md) |
| Learn controls and rules | [Gameplay](docs/gameplay.md), [camera](docs/camera.md) |
| Understand physical assumptions | [Physics](docs/physics.md) |
| Rebuild the bone or locate original scenes | [Assets](docs/assets.md) |
| Decide what to fix before publishing | [Release readiness](docs/release.md), [audit](docs/audits/2026-09-05.md) |
| Review privacy or distribution work | [Security](SECURITY.md), [third-party inventory](THIRD_PARTY.md) |

## Repository map

- `web/` — React/TypeScript UI, Three.js renderer, Rapier Rust/Wasm physics and local MediaPipe worker.
- `scripts/` and `assets/` — optional Blender export and compound-collider generation.
- `*.blend` — original scene sources; `bunnock_clean.blend` is the web model's canonical input.
- `bunnock*.py` — preserved earlier Blender experiments, outside the web build.
- `docs/` — subsystem guides, release work and portable audit evidence.
- `.github/` — CI and pull-request handoff template; no deployment automation.

The distributable is `web/dist/client`. Local Sites metadata is ignored by Git and
optional for normal builds. Publishing the game is separate from pushing this repository.

## Validate changes

From `web/`:

```sh
npm run typecheck
npm test
npm run build
npm run lint
npm audit
```

CI requires types, tests and a static build. Existing lint/dependency findings are
reported separately; a passing required job does not mean the public launch gates
are closed. The original audit passed 42 tests, types and build. Browser, live-webcam
and physical-mobile verification remains outstanding.

No open-source license has been chosen for the first-party code or supplied models.
Third-party licenses and the remaining distribution work are listed in
[THIRD_PARTY.md](THIRD_PARTY.md).

Inspired by the traditional game of Bunnock. Not affiliated with or endorsed by Bunnock.com.
