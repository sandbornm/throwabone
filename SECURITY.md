# Security and privacy

Throwabone is an unpublished prototype. The current game is a static application:
physics and camera inference run in the browser, and nickname/history use local
storage. There is no shared game backend or account system.

Report sensitive findings privately to the repository owner. Include the affected
version, impact and enough context for investigation. Do not post credentials,
personal recordings or sensitive vulnerability details in a public location.

See [release readiness](docs/release.md) for outstanding dependency and deployment
work. A passing build is not a production
security guarantee. Changes that add uploads, accounts, shared results or paid
services require a new review of the resulting data flow and abuse controls.

Camera access requires the player's browser permission. Preserve the empty-hand
instruction, cancellation behavior and stop-on-close/background behavior. Do not
record or upload frames or landmarks as part of routine debugging.
