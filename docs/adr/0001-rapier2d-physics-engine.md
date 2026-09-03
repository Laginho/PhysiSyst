# Rapier2D as the dynamics engine

The numerical simulation runs on Rapier2D (Rust compiled to WASM) rather than Matter.js or a hand-written solver. Textbook-grade scenarios need exact rigid-body contact, friction, and constraint behavior — a block resting on a wedge must not jitter or creep. Matter.js's solver is too approximate for that; a custom solver would cost months we'd rather spend on the editor and the analytical layer.

## Considered Options

- **Matter.js** — simpler API, pure JS, but its contact solver produces visible drift/jitter on stacked and inclined bodies; rejected on fidelity.
- **Custom solver** — full control over idealized behavior (massless ropes, perfect constraints), but far too much effort for v1; revisit only if Rapier proves unable to express an idealization.
