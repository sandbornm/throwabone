# Working on Throwabone

Read [README.md](README.md), [docs/architecture.md](docs/architecture.md) and
[docs/release.md](docs/release.md) before changing the game. The dated audit is
historical evidence; the release document tracks which findings remain open.

## Project boundaries

- This is a work-in-progress prototype and unlimited practice range. A repository push
  is not a public game deployment. Follow the owner's explicit publishing instructions.
- The web application lives in `web/`. Run npm commands there, using the lockfile.
- Rapier's official Rust/Wasm package owns physics. TypeScript owns the controls,
  scene, rules and journal. There is no custom Rust crate or game server.
- Preserve the original `.blend` files and the legacy Python experiments.
  Do not run legacy scripts as part of the web build. Exporting geometry must
  not save over the source scene.
- Camera frames and landmarks stay on-device. Do not introduce uploads,
  telemetry, accounts or shared scores without a requested product change.
- Keep `.openai`, `.codex`, environment files, caches and recordings out of Git.
  An optional local Sites manifest belongs to its existing project; do not copy
  it into another checkout or invent a project ID.
- No open-source license has been selected for the first-party code or models.

## Where changes belong

| Work | Start here |
| --- | --- |
| Physics, contacts, guard resets | `web/lib/game/physics.ts`, `physics.test.ts`, `rules.test.ts` |
| Scene, aiming, camera views, throw lifecycle | `web/lib/game/scene.ts`, `view.ts`, `types.ts` |
| Permission and stream lifecycle | `web/lib/game/camera-access.ts`, `web/components/game/camera-throw.tsx` |
| Gesture/release or wrist spin | `web/lib/game/motion.ts`, `hand-motion.ts`, corresponding tests |
| Vision inference and messages | `web/public/pose-worker.js`, `web/lib/game/pose-worker.test.ts` |
| Journal and persistence | `web/components/game/throw-journal.tsx`, history loading in `scene.ts` |
| UI and touch controls | `web/app/page.tsx`, `globals.css`, `web/components/game/throw-pad.tsx` |
| Source model and collider generation | `scripts/`, `assets/`, `docs/assets.md` |

## Checks and handoff

From `web/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
For changes after installation, do not reinstall unless dependencies changed.
Run focused tests while iterating and the relevant full checks before handoff.
Run `npm run lint` and `npm audit` as well; their existing failures are tracked
in `docs/release.md`. Do not disable rules or weaken assertions merely to make
checks green. CI reports these existing failures separately from required checks.

Geometry/material changes need stability, mass, collision, sliding and guard-rule
checks. Gesture changes need right/left-hand, interrupted tracking and single-release
checks. Node tests do not replace browser, live-camera or physical-device testing.
The ordinary audit probes in `web/scripts/audit/` reproduce current defects; they
are diagnostics, not performance benchmarks or assertions that those defects are acceptable.

Use metres, seconds and radians internally; UI spin settings are revolutions per
second. Keep fixed-step timing independent of display frames. Trace sampling,
launch settings and score records must refer to the same throw. Do not add random
aim variation to cover an input or collision bug.

Update the relevant guide and release status when behavior changes. Report what
changed, which checks ran, and which checks did not run. Link evidence for a closed
audit item. Preserve the original audit and its results rather than rewriting its
findings as though they were never present.
