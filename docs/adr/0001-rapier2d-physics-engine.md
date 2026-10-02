# Rapier2D as the dynamics engine

The numerical simulation runs on Rapier2D (Rust compiled to WASM) rather than Matter.js or a hand-written solver. Textbook-grade scenarios need exact rigid-body contact, friction, and constraint behavior — a block resting on a wedge must not jitter or creep. Matter.js's solver is too approximate for that; a custom solver would cost months we'd rather spend on the editor and the analytical layer.

## Considered Options

- **Matter.js** — simpler API, pure JS, but its contact solver produces visible drift/jitter on stacked and inclined bodies; rejected on fidelity.
- **Custom solver** — full control over idealized behavior (massless ropes, perfect constraints), but far too much effort for v1; revisit only if Rapier proves unable to express an idealization.

## Consequences

- Rapier caps every body's angular displacement per step at |ω|·Δt ≤ π/4. With the current `TIMESTEP = 1/60`, the angular speed ceiling is 15π ≈ 47.12 rad/s. More solver substeps do not raise it, and the Rapier 0.20 JavaScript API exposes no setting to change it.
- Pure rolling is therefore limited to v = 15π·r: about 4.7 m/s for r = 0.1 m, or 11.8 m/s for r = 0.25 m. Above that speed, a body can slip and kinetic friction slows it toward the ceiling instead of following the textbook rolling solution.
- `Simulator.warnings` reports a body approaching this ceiling at |ω|·`TIMESTEP` ≥ 0.95·π/4, once per body per run, with its id and the angular speed ceiling. Existing construction warnings remain; `replaceScene` resets runtime warnings and their deduplication. This diagnostic does not change the dynamics.
- Keep Δt = 1/60: reducing it only raises the ceiling while requiring ropes and springs to be recalibrated. Pulley disks use the separate angular integration introduced in PHY-50; ordinary bodies need Rapier's rotation for contacts and cannot use that workaround.
