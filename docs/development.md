# Development setup

## Fresh clone

Access to the private `sandbornm/throwabone` repository is required to clone it.
The game itself does not ask players to sign in.

```sh
git clone https://github.com/sandbornm/throwabone.git
cd throwabone
nvm install
nvm use
cd web
npm ci
npm run dev
```

`.nvmrc` selects Node 22, matching CI. Without nvm, install a Node 22 release
at least 22.13.0. The original audit ran on Node 25.8.2; CI checks a fresh Node 22
environment. `npm ci` uses the committed lockfile. Do not install a separate Rust
toolchain, Blender or Python just to run the browser game.

Open the loopback URL printed by Vite. The configured host is `127.0.0.1`;
camera permissions differ between it and `localhost`. Camera mode requires
HTTPS or a browser-recognized local secure context. A phone visiting a laptop's
plain HTTP LAN address is not the same as localhost on that phone.

## Production build, served locally

```sh
npm run build
npm start
```

Use the URL printed by the preview server. It serves `dist/client` on loopback;
these commands do not publish anything. Build prerendering briefly starts a local
server, so a sandbox must permit binding a loopback port.

No `.env` file is needed. Local Sites configuration is optional and ignored by
Git. Keep an existing local `.openai/hosting.json` where it is; do not copy the
owner's project identifier into other clones. The Vite config includes the Sites
packaging plugin only when that manifest exists.

## Checks

Run from `web/`:

```sh
npm run typecheck
npm test
npm run build
npm run lint
npm audit
```

The initial required CI job runs installation, types, tests and the static build.
Lint and dependency audit run in a separate job whose individual failures are
reported without failing the required job. This explicitly preserves the known
prototype debt; it does not approve public release. See [release status](release.md)
for the remaining work and the conditions for making those checks required.

For a focused test, use Node's test runner through the installed tsx loader:

```sh
node --import tsx --test lib/game/rules.test.ts
```

Formatting follows `web/.oxfmtrc.json`. Apply formatting to the files you change;
avoid formatting the vendored runtime or the whole repository as incidental work.

## Reproduce audit observations

```sh
npm run audit:landing
npm run audit:settling
npm run audit:targets
```

These are bounded ordinary-gameplay diagnostics, not attack/load tests. They use
the current model and settings and write JSON to ignored `web/outputs/audit-probes/`.
Compare them with the preserved [September 5 evidence](audits/2026-09-05/evidence/README.md).
They print observations rather than asserting that a known defect should persist.
Node simulation timings do not include rendering or vision inference.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dependency install differs from another checkout | Use the selected Node version and `npm ci`; do not delete the lockfile to mask a mismatch. |
| Camera permission rejected | Verify the exact origin, Chrome site permission and OS camera permission; see [camera setup](camera.md). |
| Camera loading never completes | Close camera mode, retry or use manual controls. Silent-stall recovery is open R06. |
| “Ready” but an immediate throw fails | Known R03; wait briefly or reset. Fix the shared readiness contract rather than increasing UI debounce. |
| Journal fails after an older build | Known R05. Avoid deleting all origin storage if you need the records as evidence; add migration/recovery before release. |
| First-landing chart looks inconsistent | Known R01. The saved landing marker can represent a later contact. |
| Build cannot bind a local port | Allow the build's temporary prerender server in the local sandbox. Do not deploy the dev server as a workaround. |

Use [CONTRIBUTING.md](../CONTRIBUTING.md) for change review and
[AGENTS.md](../AGENTS.md) for the common maintainer/agent workflow.
