# Physics and fidelity

Rapier 0.19.3 is written in Rust and compiled to WebAssembly. The official `@dimforge/rapier3d-compat` package supplies the Wasm and JavaScript bindings. TypeScript handles input, rendering and records; every movement after release is simulated locally by Rapier. There is no bespoke Rust crate or remote simulation service.

- Fixed physics steps at 120 Hz, independent of display refresh, with interpolated rendering.
- Continuous collision detection, four maximum CCD substeps, eight solver iterations and tolerances appropriate for centimetre-scale bones.
- The original 933-vertex, 2,000-triangle bone is used for drawing. CoACD generates 16 convex solids for each body's compound collider. Raw moving triangle meshes and box approximations are not used.
- The source scan is not watertight, so CoACD repairs it before decomposition. The 16-hull cap produced a reported normalized maximum concavity of about 0.0454 against a requested 0.035 threshold; these are approximations, not exact copies of the rendered surface.
- A stable support face gives targets an approximately 11-degree starting tilt. Targets remain dynamic and are not artificially frozen or locked upright.
- Terrain geometry is shared by rendering and collisions. Friction, restitution and millimetre-scale irregularity vary by surface. Bones use a separate restitution of 0.04, keeping bone-on-bone bounce consistent across surfaces. Averaging with the ground gives contact restitution of 0.05 on gravel, 0.04 on dirt, 0.025 on grass and 0.08 indoors. These softer settings reduce rebounds while preserving slides and physical knockdowns; launch speed and airborne spin damping are unchanged. [Rapier's restitution documentation](https://rapier.rs/docs/user_guides/javascript/colliders/#restitution) explains how contact bounce is combined.
- The rendering reuses bone geometry and materials, limits device-pixel ratio on touch devices, and reduces their shadow-map size. The journal loads on demand. These are mobile accommodations, not measurements from a physical phone.

The supplied `Bunnock instructions.pdf` establishes 10 m between throw lines, 3.66 m pit width, 20 tightly arranged soldiers and guards separated by 40 cm from the end soldiers. It also describes underhand throws, slide-friendly surfaces and match rules. The information sheet contains no bone masses or measured material coefficients.

Targets currently use 0.25 kg and throwers 0.30 kg, inherited as starting assumptions from the existing scripts. Uniform mass distribution within the repaired collision shape is assumed. Friction, bounce and damping are tuning values. Air drag, granular soil deformation, grass blades and differences among individual real bones are not modeled. The journal describes this simulation; it is not yet evidence of the best real-world technique. Calibration needs measured dimensions and masses, and reference video or measured throw distances, spin and bounce/runout on known surfaces.

See [assets](assets.md) to regenerate the collision geometry, [architecture](architecture.md) for coordinates and state ownership, and [release readiness](release.md) for known contact-recording and analytics defects.
