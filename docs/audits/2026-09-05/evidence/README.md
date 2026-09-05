# Audit evidence

These are archived results from the local September 5 audit, before repository
preparation. Machine-specific checkout prefixes in logs were replaced with
`<checkout>`. Source and artifact fingerprints describe that earlier snapshot;
the repository setup subsequently changed build configuration and documentation.

- `tests.txt`, `typecheck.txt`, `build.txt`, `lint.txt`: original check output.
- `dependencies.json`: dated npm advisory report, not a live security status.
- `gameplay-probe.json`: 12 ordinary throws and readiness observations.
- `target-probe.json`: six normal target-directed releases.
- `landing-probe.json`: independent impulse/contact timing observations.
- `artifacts.json`: exported file sizes, hashes and limited signature-scan summary.
- `source-fingerprint.json`: original authored-source/lockfile hashes and runtime.

The full interpretation is in [the audit](../../2026-09-05.md).
The runnable diagnostics live in [web/scripts/audit](../../../../web/scripts/audit).
Run them through the npm commands in [development setup](../../../development.md).
New output goes to ignored `web/outputs/audit-probes/`; do not overwrite this evidence
to make an old result match a later fix.
