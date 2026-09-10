# Release readiness

Current stage: **work-in-progress prototype**. The game is not approved for public launch.
Repository setup provides source control, human/agent documentation and CI; it
does not close the gameplay or dependency findings from the
[September 5 audit](audits/2026-09-05.md).

## Open work

| ID | Priority | Problem | Acceptance evidence |
| --- | --- | --- | --- |
| R01 | P1 | First landing can be recorded about 1.5 m after the first physical ground impact. | Capture earliest contact including transient CCD contacts; regression using the ordinary landing probe and trajectory/contact comparison. |
| R02 | P1 | Advisory-flagged dependency branches need compatible upgrades. | Updated lockfile, clean install, tests/build and a reviewed dependency report. Repository backup/onboarding portion is addressed by the initial repository setup. |
| R03 | P2 | UI readiness and physical settling disagree, including slow-motion resets. | One readiness contract; repeat-throw and reset integration tests at normal and quarter speed. |
| R04 | P2 | An unfinished court drag can alter settings after keyboard/camera release. | Immutable released settings, gesture cleanup and mixed-input regression coverage. |
| R05 | P2 | Incomplete saved-record validation can break the journal. | Bounded schema/migration, error isolation, clear-history recovery and honest storage-failure feedback. |
| R06 | P2 | Silent camera initialization/inference stalls have no watchdog. | Deadline, arming cancellation, retry/manual fallback and actual permission/lifecycle browser tests. |
| R07 | P2 | Comparisons mix physics versions and starting board states. | Record/group compatible physics/model/surface versions and initial board context; retain older history separately. |

Priorities are work order, not security severity scores. No fixes to R01–R07 are
claimed by the initial documentation/repository preparation. The audit's statement
that no Git repository existed describes the pre-repository snapshot.

## Validation baseline

The original audit passed 42 tests, TypeScript and a static production build.
Lint failed and the dependency scan flagged 11 package entries: 8 high, 2 moderate
and 1 low. Most flagged branches concern build/development/server code rather than
a demonstrated exploit in the intended static client. Recheck current advisories
after updates; the dated report is not a live dependency monitor.

Repository preparation excludes vendored vision files and generated/scratch outputs
from lint, and scratch output from type checks. Owned-code lint issues remain open.
CI keeps lint and dependency findings visible as non-blocking reports until they
are resolved and made required. Required CI runs a clean install, types, tests and
the static build on Node 22. There is no deployment workflow.

## Before sharing a public alpha

- Fix R01–R05 and complete the dependency work in R02.
- Add camera stall recovery and verify camera allow/deny/retry/close/background
  flows before advertising camera mode as a working alpha feature.
- Verify a complete manual game session in the production browser build, including
  guard penalties, reset, keyboard/touch and history reload.
- Complete the shipped license/model notice inventory and review rights to the
  supplied assets. Preserve the inspiration/no-affiliation wording.
- Configure the static host, HTTPS, security/cache headers and rollback. Ship only
  `web/dist/client`. Keep the owner’s local development server private.
- Inspect actual deployed requests before finalizing the privacy statement.

No player account, shared backend or custom DDoS service is required by the current
single-player static design. Adding uploads, multiplayer, rankings or payments changes
that review. A public unlisted URL remains publicly accessible.

## Before a broad mobile launch

Test recent iPhone/Safari, a representative midrange Android/Chrome and desktop
Chrome. Include orientation changes, browser toolbars, both throwing hands, poor
lighting, lost tracking, repeated resets and ten-minute camera-on/off sessions.
Measure cold start, frame times, inference cadence, memory growth and thermal
slowdown. Inspect keyboard/focus/dialog behavior and accessible control alternatives.

Proposed initial performance target: sustained 30 fps on the selected midrange
phone, responsive input and no stuck throw state. This target has not been measured.

Close R07 before presenting historical comparisons as reliable coaching. Measured
bone dimensions/masses and independent physical throw/drop trials are also required
before claims about real-world technique. Current aim/spin mappings remain game controls.

## Tennis experiment

The independent `/tennis` prototype is available for local testing. Source and
controls are in [web/tennis](../web/tennis/README.md). It includes hand-only and
full-arm swings, off-hand racket placement, toss-and-serve practice, spin controls
and paused navigation around the ball. It uses the existing dependencies and
local vision models. It has not been published.

On September 9, 2026, Node 22.22.2 passed type checking, all 80 tests (38 tennis
tests) and static production export. Lint passes for the new tennis files;
repository-wide lint still reports 75 existing errors. The dependency audit
reports 11 flagged entries (8 high, 2 moderate, 1 low). No original audit item is
closed by this experiment.

The first owner test led to quieter bounce synthesis, a racket pivot at the
string bed, grip-angle adjustment, clearer calibration and a hand-only inference
path that does not load the shoulder/elbow model. A subsequent report exposed
placement assistance overwriting the player's input with the ball position.
The racket now follows hand or mouse input, and assistance only extends contact
reach. Camera swings accept continuing movement and wrist-only flicks. New
camera-to-physics regressions cover those failures, both playing hands and lost
tracking. Updated browser, live-camera, audio and physical-device verification
remains open. See
[validation evidence and limits](tennis-validation.md).

## Maintaining this file

For a completed item, record the commit, test result and any required browser/device
evidence. Keep the dated audit unchanged. Do not mark an item complete from a passing
unit test if its acceptance criteria require a real browser or physical measurement.
