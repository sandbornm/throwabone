# Models and generated assets

## Files to preserve

| Path | Purpose |
| --- | --- |
| `bunnock_clean.blend` | Canonical Blender input for the web bone; object `T1_Soldier_01` |
| `bunnock.blend`, `bunnock_setup.blend` | Original scene sources retained for reference |
| `bunnock*.py` in the root | Earlier Blender experiments; not part of the web build |
| `assets/bone-source.json` | Exported drawing mesh in metres, Y up |
| `web/public/models/bone.json` | Drawing mesh, stable standing pose and generated compound colliders |
| `web/public/vision/` | Vendored MediaPipe SDK, Wasm and local model files |

Blender's `.blend1` rolling backups are ignored; the primary `.blend` files are
versioned as binary assets. Do not replace them with placeholders or a pointer
to a file available only on one machine. Browser contributors can use the
generated JSON without installing Blender or the geometry tools.

## Regenerate the bone

Run from the repository root with Blender on your PATH:

```sh
blender --background --factory-startup --disable-autoexec --python scripts/export_bone.py
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-geometry.txt
.venv/bin/python scripts/build_colliders.py
```

On macOS, the usual Blender executable is
`/Applications/Blender.app/Contents/MacOS/Blender`; substitute it for `blender`
if needed. On Windows, use the virtual environment's `Scripts/python.exe`.
The optional Python toolchain must support the versions pinned in the requirements
file; it is separate from the Node web workflow and is not covered by web CI.

The exporter reads the canonical scene with script execution disabled and writes
`assets/bone-source.json`. It does not save the Blender scene. The collider builder
uses CoACD with a fixed seed, then writes `web/public/models/bone.json` with stable
standing orientation, dimensions, hulls and generation metadata.

Review both generated JSON files and run the physics/rules tests after regeneration.
Changes in scale, mass distribution or hull shape can invalidate earlier material
tuning and recorded comparisons. Preserve the original scan and explain any repair
or simplification. See [physics](physics.md) for the current approximation limits.

## Vision assets

The source/version information is in [the vision notice](../web/public/vision/NOTICE.txt).
Use official upstream assets and review SDK/Wasm/model compatibility together.
Do not hand-edit the vendored SDK. Keep hashes and provenance when replacing models;
avoid fetching a moving `latest` URL on every build.

The original rules PDF was supplied separately by the owner and is not included
in this repository. Rules are summarized in [gameplay](gameplay.md). First-party
asset rights and third-party distribution work are described in
[THIRD_PARTY.md](../THIRD_PARTY.md).
