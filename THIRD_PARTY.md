# Third-party components and asset provenance

No open-source license has been selected for the first-party game code or the
owner-supplied Blender models. This private repository does not grant permission
to redistribute them. Third-party components retain their own licenses.

The following is a starting inventory, not a completed distribution notice bundle.
Check the lockfile and actual shipped bundles when preparing a public release.

| Component | Current version | Package-declared license | Use |
| --- | --- | --- | --- |
| [Rapier JavaScript](https://github.com/dimforge/rapier.js) | 0.19.3 | Apache-2.0 | Rust/Wasm rigid-body physics |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | 0.10.22-rc.20250304 | Apache-2.0 | Pose/hand SDK and Wasm |
| [Three.js](https://github.com/mrdoob/three.js) | 0.180.0 | MIT | Rendering |
| [React](https://github.com/facebook/react) | 19.2.6 | MIT | UI |
| [Recharts](https://github.com/recharts/recharts) | 3.8.0 | MIT | Journal charts |
| [Vinext](https://github.com/cloudflare/vinext) | 1.0.0-beta.5 | MIT | Build and static export |

See [web/package-lock.json](web/package-lock.json) for the full dependency set and
[the vision notice](web/public/vision/NOTICE.txt) for SDK/model download provenance.
The hand model was fetched from its version-1 distribution; the pose model was
fetched from the official `latest` path on September 5, 2026 and its bytes are now
versioned. Their archived hashes are in the
[audit artifact manifest](docs/audits/2026-09-05/evidence/artifacts.json).

Before public distribution, verify model-specific terms and include the required
license/copyright/notice material for the SDKs, models and other shipped dependencies.
The existing vision notice alone is not that complete bundle. Do not infer a model's
license solely from the SDK package license.

The generated bone comes from the owner's `bunnock_clean.blend`, as recorded in
the JSON asset. The source information sheet is not redistributed. The game is
inspired by traditional Bunnock and states that it is not affiliated with or
endorsed by Bunnock.com; domain registration and legal review have not been performed.
