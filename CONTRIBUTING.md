# Contributing

Start with [development setup](docs/development.md) and the shared
[agent and maintainer guide](AGENTS.md). This is a private prototype; coordinate
access and product changes with the repository owner.

1. Create a branch for a focused change.
2. Read the relevant guide and open items in [release readiness](docs/release.md).
3. Make the change and add regression coverage when it changes behavior or fixes a bug.
4. Run type checks, relevant tests and a production build. Report existing lint
   and dependency findings separately from any new failures.
5. Update documentation and describe the user-visible result, validation and
   remaining limits in the pull request.

The physics and camera mappings are provisional. Distinguish measured properties
from chosen game settings. Preserve reference samples and describe how a calibration
was evaluated. Do not upload another person's camera recording without permission.

Generated bone geometry belongs in the repository so contributors do not need
Blender or Python to run the game. When regenerating it, include the source change,
generation settings and physics checks. Avoid editing vendored vision files by hand.

Bug reports should include browser/OS, input mode, surface, throw settings, the
expected result and what happened. For camera issues include permission state and
whether the arm/hand indicators were visible; a recording is optional.
