# Ropes are our own constraint, solved around `world.step()`

A rope is not a Rapier joint. The simulator solves it itself, once per step, in the hook that already applies the applied forces. One mechanism covers every rope, with or without pulleys.

## Why not Rapier's rope joint

- Rapier 0.20 has no pulley joint. A rope over a pulley constrains a **sum** of distances (`L₁ + L₂ = const`), and no Rapier joint can express that. Its rope joint only caps the distance between two points.
- Rapier returns no force from any joint. The readout panel needs `T`, and with our own constraint `T` falls out of the calculation.
- One mechanism for every rope keeps the pendulum, pulleys in series and the movable pulley (PHY-24) on the same code path as the tracer.

## Mechanism

`L` is the rope's path length (tangent legs plus wrapped arcs, `ropePath`) at the **document** poses, computed when the world is built. `replaceScene` applies any carry only after the build, so a structural edit during playback never changes `L`.

Each step, for each rope, with `u` the unit direction each end is pulled in and `K` the rope's inverse effective mass (`Σ 1/m + (r×u)²/I` over both ends):

1. **Before the step (prediction).** Predict each end's velocity at the end of the step under gravity and the forces already added (no contacts, no rope). Choose `T ≥ 0` so that motion ends the step at exactly `L`: it may close a slack gap in one step, and it pulls back 20% of any stretch. Add last step's residual (below) and apply `T` as a force at the anchors, so Rapier's contact and friction solve sees it.
2. **`world.step()`.**
3. **After the step (correction).** Contacts and friction made the prediction wrong. An impulse along `u` removes whatever lengthening is left beyond what the slack allows, clamped so the total tension never goes negative (the rope never pushes). The tension this implies is the reading, and the part the prediction missed is the **residual** that warm-starts the next step.

The rope is unilateral: `T = 0` and `slack = true` whenever no pull is needed. The pre-step prediction makes a rope with no contacts exact from the first tick. The warm start is what makes it exact under friction: without it, the block on the table drifts 1.4–2.7 mm off `L` in 1.5 s.

## Measured (PHY-23 acceptance, 60 Hz, 1 s window after a 0.5 s settle)

| Family | `a` error | max `T` error over the window | max \|path − L\| over the 1.5 s run |
|---|---|---|---|
| Atwood 3 / 2 kg | 0.000% | 0.003% | 0.0004 mm |
| Atwood 2.5 / 1.5 kg | 0.000% | 0.003% | 0.0005 mm |
| Table 2 kg, hanging 1 kg, μₖ = 0.2 | 0.049% | 0.788% | 0.26 mm |
| Table 2 kg, hanging 1 kg, μₖ = 0.1 | −0.003% | 0.081% | 0.15 mm |

The tolerances are 2% (Atwood), 5% (table) and 1 mm. The declared risk, a constraint outside Rapier's solver failing to converge alongside contact and friction, did not show up. ADR-0001 stands.

## Consequences

- Ropes on shared bodies are solved one after another in document order, one pass per step (Gauss–Seidel with a single iteration). If coupled ropes (block-and-tackle, PHY-24) miss their tolerance, iterate the correction pass before changing the mechanism.
- Ropes have no collider: a rope passes through bodies, and it is drawn from the same `ropePath` the simulator solves on.
- The spring does **not** use this mechanism. It uses Rapier's spring joint, which already expresses it (spec, PHY-26).
